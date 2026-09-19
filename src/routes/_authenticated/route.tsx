import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { AppSidebar, MobileTopBar } from "@/components/app/sidebar";
import { canAccessPath, clearRoleCache, getRoleForUser, type AppRole } from "@/lib/permissoes";

let cachedUser: User | null | undefined;
let sessionPromise: Promise<User | null> | null = null;
let cachedRole: AppRole | null = null;
let cachedRoleUserId: string | null = null;

async function getCachedUser(): Promise<User | null> {
  if (cachedUser !== undefined) return cachedUser;

  if (!sessionPromise) {
    sessionPromise = supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (error) return null;
        return data.session?.user ?? null;
      })
      .finally(() => {
        sessionPromise = null;
      });
  }

  cachedUser = await sessionPromise;
  return cachedUser;
}

async function getCachedRole(user: User): Promise<AppRole> {
  if (cachedRole && cachedRoleUserId === user.id) return cachedRole;
  cachedRole = await getRoleForUser(user.id);
  cachedRoleUserId = user.id;
  return cachedRole;
}

if (typeof window !== "undefined") {
  supabase.auth.onAuthStateChange((_event, session) => {
    const nextUser = session?.user ?? null;
    const changedUser = cachedUser?.id !== nextUser?.id;
    cachedUser = nextUser;

    if (changedUser || !nextUser) {
      cachedRole = null;
      cachedRoleUserId = null;
      clearRoleCache();
    }
  });
}

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const user = await getCachedUser();
    if (!user) throw redirect({ to: "/auth" });

    const role = await getCachedRole(user);
    if (!canAccessPath(role, location.pathname)) {
      throw redirect({ to: "/dashboard" });
    }

    return { user, role };
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const { role } = Route.useRouteContext();

  return (
    <div className="flex h-screen w-full bg-background">
      <AppSidebar role={role} />
      <main className="flex-1 overflow-y-auto">
        <MobileTopBar role={role} />
        <div className="mx-auto max-w-[1600px] p-4 md:p-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
