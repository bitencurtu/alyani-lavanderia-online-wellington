import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { LogOut } from "lucide-react";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/_authenticated/configuracoes")({
  head: () => ({ meta: [{ title: "Configurações — Alyani" }] }),
  component: Page,
});

function Page() {
  const navigate = useNavigate();
  const [email, setEmail] = useState<string>("");
  useEffect(() => { supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? "")); }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  return (
    <>
      <PageHeader title="Configurações" description="Preferências gerais da conta." />
      <div className="rounded-md border bg-card p-6 max-w-lg">
        <div className="text-xs uppercase text-muted-foreground">Usuário</div>
        <div className="text-sm font-medium mt-1">{email}</div>
        <div className="mt-6">
          <Button variant="outline" size="sm" onClick={signOut}><LogOut className="h-4 w-4 mr-1" /> Sair</Button>
        </div>
      </div>
    </>
  );
}