import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { LogOut, ShieldCheck, Loader2 } from "lucide-react";
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
  role: AppRole;
};

const roleOptions: AppRole[] = ["admin", "operador", "financeiro"];

function Page() {
  const navigate = useNavigate();
  const [userId, setUserId] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<AppRole>("operador");
  const [usuarios, setUsuarios] = useState<UsuarioPermissao[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [savingUserId, setSavingUserId] = useState<string | null>(null);

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
        supabase.from("profiles").select("id,nome,email").order("nome", { ascending: true }),
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
          role: pickRole(rolesByUser.get(profile.id) ?? []),
        })),
      );
      setLoadingUsers(false);
    }

    void loadUsers();
    return () => { active = false; };
  }, [isAdmin]);

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
            <div className="px-5 py-4 border-b">
              <div className="font-medium">Usuários e permissões</div>
              <div className="text-sm text-muted-foreground mt-1">
                Defina o que cada usuário pode acessar e alterar no sistema.
              </div>
            </div>

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
                        {usuario.nome && usuario.email && (
                          <div className="text-xs text-muted-foreground truncate mt-0.5">{usuario.email}</div>
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
