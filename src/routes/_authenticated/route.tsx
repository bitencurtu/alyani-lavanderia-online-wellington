import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { AppSidebar, MobileTopBar } from "@/components/app/sidebar";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    // getSession lê a sessão persistida localmente e evita um round-trip de
    // rede em toda troca de rota. A segurança dos dados continua no Supabase
    // via RLS/token; o refresh do token permanece automático no client.
    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session?.user) throw redirect({ to: "/auth" });
    return { user: data.session.user };
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  return (
    <div className="flex h-screen w-full bg-background">
      <AppSidebar />
      <main className="flex-1 overflow-y-auto">
        <MobileTopBar />
        <div className="mx-auto max-w-[1600px] p-4 md:p-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
