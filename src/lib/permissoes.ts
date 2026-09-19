import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type AppRole = Database["public"]["Enums"]["app_role"];

export const ROLE_LABELS: Record<AppRole, string> = {
  admin: "Administrador",
  operador: "Operador",
  financeiro: "Financeiro",
};

export const ROLE_DESCRIPTIONS: Record<AppRole, string> = {
  admin: "Acesso completo ao ERP, incluindo preços, custos e permissões.",
  operador: "Cadastros e operação de Rolls. Não altera preços/custos nem financeiro.",
  financeiro: "Pagamentos, cobranças e relatórios. Não altera Rolls, preços ou custos.",
};

const ALL_ROLES: AppRole[] = ["admin", "operador", "financeiro"];

const ROUTE_RULES: Array<{ prefix: string; roles: AppRole[] }> = [
  { prefix: "/dashboard", roles: ALL_ROLES },
  { prefix: "/cadastros", roles: ["admin", "operador"] },
  { prefix: "/tabelas", roles: ["admin"] },
  { prefix: "/operacao", roles: ["admin", "operador"] },
  { prefix: "/financeiro", roles: ["admin", "financeiro"] },
  { prefix: "/relatorios", roles: ALL_ROLES },
  { prefix: "/historico", roles: ALL_ROLES },
  { prefix: "/configuracoes", roles: ALL_ROLES },
];

export function canAccessPath(role: AppRole, pathname: string): boolean {
  const rule = ROUTE_RULES.find(
    ({ prefix }) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

  // Rotas autenticadas desconhecidas ficam restritas ao administrador por segurança.
  return rule ? rule.roles.includes(role) : role === "admin";
}

const roleCache = new Map<string, AppRole>();
const roleRequests = new Map<string, Promise<AppRole>>();

function chooseRole(roles: AppRole[]): AppRole {
  if (roles.includes("admin")) return "admin";
  if (roles.includes("financeiro")) return "financeiro";
  return "operador";
}

export async function getRoleForUser(userId: string): Promise<AppRole> {
  const cached = roleCache.get(userId);
  if (cached) return cached;

  const pending = roleRequests.get(userId);
  if (pending) return pending;

  const request = supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .then(({ data, error }) => {
      if (error) throw error;
      const roles = (data ?? []).map((row) => row.role as AppRole);
      // Usuários antigos sem papel explícito continuam como operador, que era o padrão do sistema.
      const role = chooseRole(roles);
      roleCache.set(userId, role);
      return role;
    })
    .finally(() => {
      roleRequests.delete(userId);
    });

  roleRequests.set(userId, request);
  return request;
}

export function clearRoleCache(userId?: string) {
  if (userId) {
    roleCache.delete(userId);
    roleRequests.delete(userId);
    return;
  }
  roleCache.clear();
  roleRequests.clear();
}
