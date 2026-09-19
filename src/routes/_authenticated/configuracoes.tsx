import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { LogOut, ShieldCheck, Loader2, UserPlus, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  clearRoleCache,
  getRoleForUser,
  ROLE_DESCRIPTIONS,
  ROLE_LABELS,
  type AppRole,
} from "@/lib/permissoes";

export const Route = createFileRoute("/_authenticated/configuracoes")({
  head: () => ({ meta: [{ title: "Configurações — Alyani" }] }),
  component: Page,
});

type UsuarioPermissao = {
  id: string;
  nome: string | null;
  email: string | null;
  cpf: string | null;
  role: AppRole;
};

type NovoUsuario = {
  nome: string;
  cpf: string;
  email: string;
  password: string;
  role: AppRole;
};

const roleOptions: AppRole[] = ["admin", "operador", "financeiro"];

const initialNewUser: NovoUsuario = {
  nome: "",
  cpf: "",
  email: "",
  password: "",
  role: "operador",
};

function onlyDigits(value: string) {
  return value.replace(/\D/g, "");
}

function formatCpf(value: string | null | undefined) {
  const digits = onlyDigits(value ?? "").slice(0, 11);
  if (!digits) return "";
  return digits
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
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

async function readFunctionError(error: unknown, fallback: string) {
  if (!(error instanceof Error)) return fallback;

  const context = (error as Error & { context?: Response }).context;
  if (context && typeof context.json === "function") {
    try {
      const body = (await context.json()) as { error?: string };
      if (body?.error) return body.error;
    } catch {
      // Mantém a mensagem original quando a resposta não contém JSON.
    }
  }

  return error.message || fallback;
}

function Page() {
  const navigate = useNavigate();
  const [userId, setUserId] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<AppRole>("operador");
  const [usuarios, setUsuarios] = useState<UsuarioPermissao[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [savingUserId, setSavingUserId] = useState<string | null>(null);
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [creatingUser, setCreatingUser] = useState(false);
  const [newUser, setNewUser] = useState<NovoUsuario>(initialNewUser);
  const [usersVersion, setUsersVersion] = useState(0);

  const isAdmin = role === "admin";

  useEffect(() => {
    let active = true;

    async function loadAccount() {
      const { data } = await supabase.auth.getSession();
      const user = data.session?.user;
      if (!user || !active) return;

      setUserId(user.id);
      setEmail(user.email ?? "");

      try {
        const currentRole = await getRoleForUser(user.id);
        if (active) setRole(currentRole);
      } catch (error) {
        console.error(error);
      }
    }

    void loadAccount();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!isAdmin) {
      setUsuarios([]);
      return;
    }

    let active = true;
    setLoadingUsers(true);

    async function loadUsers() {
      const [{ data: profiles, error: profilesError }, { data: roles, error: rolesError }] = await Promise.all([
        supabase.from("profiles").select("id,nome,email,cpf").order("nome", { ascending: true }),
        supabase.from("user_roles").select("user_id,role"),
      ]);

      if (!active) return;

      if (profilesError || rolesError) {
        toast.error("Não foi possível carregar os usuários e permissões.");
        setLoadingUsers(false);
        return;
      }

      const rolesByUser = new Map<string, AppRole[]>();
      for (const row of roles ?? []) {
        const current = rolesByUser.get(row.user_id) ?? [];
        current.push(row.role as AppRole);
        rolesByUser.set(row.user_id, current);
      }

      const pickRole = (values: AppRole[]): AppRole => {
        if (values.includes("admin")) return "admin";
        if (values.includes("financeiro")) return "financeiro";
        return "operador";
      };

      setUsuarios(
        (profiles ?? []).map((profile) => ({
          id: profile.id,
          nome: profile.nome,
          email: profile.email,
          cpf: profile.cpf,
          role: pickRole(rolesByUser.get(profile.id) ?? []),
        })),
      );
      setLoadingUsers(false);
    }

    void loadUsers();
    return () => { active = false; };
  }, [isAdmin, usersVersion]);

  const signOut = async () => {
    clearRoleCache();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  const changeRole = async (targetUserId: string, nextRole: AppRole) => {
    const current = usuarios.find((item) => item.id === targetUserId);
    if (!current || current.role === nextRole) return;

    setSavingUserId(targetUserId);
    const { error } = await supabase.rpc("set_user_role", {
      p_user_id: targetUserId,
      p_role: nextRole,
    });
    setSavingUserId(null);

    if (error) {
      toast.error(error.message || "Não foi possível alterar a permissão.");
      return;
    }

    clearRoleCache(targetUserId);
    setUsuarios((items) =>
      items.map((item) => item.id === targetUserId ? { ...item, role: nextRole } : item),
    );
    toast.success(`Permissão alterada para ${ROLE_LABELS[nextRole]}.`);
  };

  const createUser = async (event: React.FormEvent) => {
    event.preventDefault();

    const nome = newUser.nome.trim();
    const cpf = onlyDigits(newUser.cpf);
    const userEmail = newUser.email.trim().toLowerCase();
    const password = newUser.password;

    if (nome.length < 2) {
      toast.error("Informe o nome do usuário.");
      return;
    }

    if (!isValidCpf(cpf)) {
      toast.error("Informe um CPF válido.");
      return;
    }

    if (!userEmail || !userEmail.includes("@")) {
      toast.error("Informe um e-mail válido.");
      return;
    }

    if (password.length < 6) {
      toast.error("A senha inicial precisa ter pelo menos 6 caracteres.");
      return;
    }

    setCreatingUser(true);
    const { data, error } = await supabase.functions.invoke("create-user", {
      body: {
        nome,
        cpf,
        email: userEmail,
        password,
        role: newUser.role,
      },
    });
    setCreatingUser(false);

    if (error) {
      toast.error(await readFunctionError(error, "Não foi possível criar o usuário."));
      return;
    }

    if (data?.error) {
      toast.error(data.error);
      return;
    }

    setNewUser(initialNewUser);
    setShowCreateUser(false);
    setUsersVersion((value) => value + 1);
    toast.success(`${nome} foi criado como ${ROLE_LABELS[newUser.role]}.`);
  };

  const sortedUsers = useMemo(
    () => [...usuarios].sort((a, b) => (a.nome || a.email || "").localeCompare(b.nome || b.email || "", "pt-BR")),
    [usuarios],
  );

  return (
    <>
      <PageHeader title="Configurações" description="Conta e permissões de acesso ao ERP." />

      <div className="space-y-4 max-w-5xl">
        <div className="rounded-md border bg-card p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-xs uppercase text-muted-foreground">Usuário</div>
              <div className="text-sm font-medium mt-1">{email}</div>
              <div className="mt-2 inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs">
                <ShieldCheck className="h-3.5 w-3.5" />
                {ROLE_LABELS[role]}
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={signOut}>
              <LogOut className="h-4 w-4 mr-1" /> Sair
            </Button>
          </div>
        </div>

        {isAdmin && (
          <div className="rounded-md border bg-card overflow-hidden">
            <div className="px-5 py-4 border-b flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="font-medium">Usuários e permissões</div>
                <div className="text-sm text-muted-foreground mt-1">
                  Somente administradores podem criar contas e definir as funções de acesso.
                </div>
              </div>

              <Button
                size="sm"
                onClick={() => setShowCreateUser((value) => !value)}
                variant={showCreateUser ? "outline" : "default"}
              >
                {showCreateUser ? <X className="h-4 w-4 mr-1" /> : <UserPlus className="h-4 w-4 mr-1" />}
                {showCreateUser ? "Cancelar" : "Criar usuário"}
              </Button>
            </div>

            {showCreateUser && (
              <form onSubmit={createUser} className="border-b bg-muted/10 p-5">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="new-user-name">Nome do usuário</Label>
                    <Input
                      id="new-user-name"
                      placeholder="Nome completo"
                      value={newUser.nome}
                      onChange={(event) => setNewUser((value) => ({ ...value, nome: event.target.value }))}
                      disabled={creatingUser}
                      required
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="new-user-cpf">CPF</Label>
                    <Input
                      id="new-user-cpf"
                      inputMode="numeric"
                      placeholder="000.000.000-00"
                      value={newUser.cpf}
                      onChange={(event) => setNewUser((value) => ({ ...value, cpf: formatCpf(event.target.value) }))}
                      disabled={creatingUser}
                      required
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="new-user-email">E-mail</Label>
                    <Input
                      id="new-user-email"
                      type="email"
                      autoComplete="off"
                      placeholder="usuario@empresa.com"
                      value={newUser.email}
                      onChange={(event) => setNewUser((value) => ({ ...value, email: event.target.value }))}
                      disabled={creatingUser}
                      required
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="new-user-password">Senha inicial</Label>
                    <Input
                      id="new-user-password"
                      type="password"
                      autoComplete="new-password"
                      minLength={6}
                      placeholder="Mínimo de 6 caracteres"
                      value={newUser.password}
                      onChange={(event) => setNewUser((value) => ({ ...value, password: event.target.value }))}
                      disabled={creatingUser}
                      required
                    />
                  </div>

                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor="new-user-role">Função</Label>
                    <select
                      id="new-user-role"
                      className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                      value={newUser.role}
                      onChange={(event) => setNewUser((value) => ({ ...value, role: event.target.value as AppRole }))}
                      disabled={creatingUser}
                    >
                      {roleOptions.map((option) => (
                        <option key={option} value={option}>{ROLE_LABELS[option]}</option>
                      ))}
                    </select>
                    <div className="text-xs text-muted-foreground">
                      {ROLE_DESCRIPTIONS[newUser.role]}
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex justify-end">
                  <Button type="submit" disabled={creatingUser}>
                    {creatingUser ? (
                      <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Criando...</>
                    ) : (
                      <><UserPlus className="h-4 w-4 mr-1" /> Criar conta</>
                    )}
                  </Button>
                </div>
              </form>
            )}

            <div className="grid gap-2 p-4 sm:grid-cols-3 border-b bg-muted/20">
              {roleOptions.map((itemRole) => (
                <div key={itemRole} className="rounded-md border bg-background p-3">
                  <div className="text-sm font-medium">{ROLE_LABELS[itemRole]}</div>
                  <div className="text-xs text-muted-foreground mt-1 leading-relaxed">
                    {ROLE_DESCRIPTIONS[itemRole]}
                  </div>
                </div>
              ))}
            </div>

            {loadingUsers ? (
              <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Carregando usuários...
              </div>
            ) : (
              <div className="divide-y">
                {sortedUsers.map((usuario) => {
                  const isSelf = usuario.id === userId;
                  const saving = savingUserId === usuario.id;
                  return (
                    <div key={usuario.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">
                          {usuario.nome || usuario.email || "Usuário"}
                          {isSelf && <span className="ml-2 text-xs font-normal text-muted-foreground">(você)</span>}
                        </div>
                        {usuario.email && (
                          <div className="text-xs text-muted-foreground truncate mt-0.5">{usuario.email}</div>
                        )}
                        {usuario.cpf && (
                          <div className="text-xs text-muted-foreground mt-0.5">CPF {formatCpf(usuario.cpf)}</div>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        {saving && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                        <select
                          className="h-9 rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                          value={usuario.role}
                          disabled={isSelf || saving}
                          title={isSelf ? "Por segurança, altere seu próprio perfil por outro administrador." : undefined}
                          onChange={(event) => void changeRole(usuario.id, event.target.value as AppRole)}
                        >
                          {roleOptions.map((option) => (
                            <option key={option} value={option}>{ROLE_LABELS[option]}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  );
                })}

                {sortedUsers.length === 0 && (
                  <div className="px-5 py-8 text-sm text-center text-muted-foreground">
                    Nenhum usuário encontrado.
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
