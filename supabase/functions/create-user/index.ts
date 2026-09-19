import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type AppRole = "admin" | "operador" | "financeiro";

type CreateUserBody = {
  nome?: string;
  cpf?: string;
  email?: string;
  password?: string;
  role?: AppRole;
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function onlyDigits(value: string) {
  return value.replace(/\D/g, "");
}

function isValidCpf(value: string) {
  const cpf = onlyDigits(value);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;

  const calcDigit = (length: number) => {
    let sum = 0;
    for (let i = 0; i < length; i += 1) {
      sum += Number(cpf[i]) * (length + 1 - i);
    }
    const remainder = (sum * 10) % 11;
    return remainder === 10 ? 0 : remainder;
  };

  return calcDigit(9) === Number(cpf[9]) && calcDigit(10) === Number(cpf[10]);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Método não permitido." }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SECRET_KEY");

  if (!supabaseUrl || !anonKey || !serviceKey) {
    return json({ error: "Configuração do servidor incompleta." }, 500);
  }

  const authorization = req.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return json({ error: "Sessão inválida." }, 401);
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: authData, error: authError } = await userClient.auth.getUser();
  if (authError || !authData.user) {
    return json({ error: "Sessão inválida ou expirada." }, 401);
  }

  const adminClient = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: adminRole, error: roleError } = await adminClient
    .from("user_roles")
    .select("id")
    .eq("user_id", authData.user.id)
    .eq("role", "admin")
    .maybeSingle();

  if (roleError) {
    return json({ error: "Não foi possível validar a permissão do administrador." }, 500);
  }

  if (!adminRole) {
    return json({ error: "Somente administradores podem criar usuários." }, 403);
  }

  let body: CreateUserBody;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Dados inválidos." }, 400);
  }

  const nome = body.nome?.trim() ?? "";
  const cpf = onlyDigits(body.cpf ?? "");
  const email = body.email?.trim().toLowerCase() ?? "";
  const password = body.password ?? "";
  const role = body.role;

  if (nome.length < 2) {
    return json({ error: "Informe o nome do usuário." }, 400);
  }

  if (!isValidCpf(cpf)) {
    return json({ error: "Informe um CPF válido." }, 400);
  }

  if (!email || !email.includes("@")) {
    return json({ error: "Informe um e-mail válido." }, 400);
  }

  if (password.length < 6) {
    return json({ error: "A senha inicial precisa ter pelo menos 6 caracteres." }, 400);
  }

  if (!role || !(["admin", "operador", "financeiro"] as AppRole[]).includes(role)) {
    return json({ error: "Função de usuário inválida." }, 400);
  }

  const { data: cpfExists, error: cpfCheckError } = await adminClient
    .from("profiles")
    .select("id")
    .eq("cpf", cpf)
    .maybeSingle();

  if (cpfCheckError) {
    return json({ error: "Não foi possível validar o CPF." }, 500);
  }

  if (cpfExists) {
    return json({ error: "Já existe um usuário cadastrado com esse CPF." }, 409);
  }

  const { data: created, error: createError } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { nome, cpf },
  });

  if (createError || !created.user) {
    const message = createError?.message?.toLowerCase().includes("already")
      ? "Já existe uma conta com esse e-mail."
      : createError?.message || "Não foi possível criar a conta.";
    return json({ error: message }, 400);
  }

  const createdUserId = created.user.id;

  try {
    const { error: profileError } = await adminClient
      .from("profiles")
      .upsert({
        id: createdUserId,
        nome,
        email,
        cpf,
        updated_at: new Date().toISOString(),
      }, { onConflict: "id" });

    if (profileError) throw profileError;

    const { error: deleteRoleError } = await adminClient
      .from("user_roles")
      .delete()
      .eq("user_id", createdUserId);

    if (deleteRoleError) throw deleteRoleError;

    const { error: insertRoleError } = await adminClient
      .from("user_roles")
      .insert({ user_id: createdUserId, role });

    if (insertRoleError) throw insertRoleError;
  } catch (error) {
    await adminClient.auth.admin.deleteUser(createdUserId);
    const message = error instanceof Error ? error.message : "Erro ao finalizar o cadastro do usuário.";
    return json({ error: message }, 500);
  }

  return json({
    ok: true,
    user: {
      id: createdUserId,
      nome,
      email,
      cpf,
      role,
    },
  }, 201);
});
