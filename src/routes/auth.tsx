import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Entrar — Alyani Lavanderia" },
      { name: "description", content: "Acesso ao sistema interno da Alyani Lavanderia." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/dashboard", replace: true });
    });
  }, [navigate]);

  const signIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);

    if (error) {
      toast.error("E-mail ou senha inválidos.");
      return;
    }

    navigate({ to: "/dashboard", replace: true });
  };

  return (
    <div className="min-h-screen grid md:grid-cols-2 bg-background">
      <div className="hidden md:flex flex-col justify-between bg-sidebar text-sidebar-foreground p-12">
        <div>
          <div className="text-2xl font-semibold tracking-wide">ALYANI</div>
          <div className="text-xs uppercase tracking-[0.25em] text-sidebar-foreground/60">
            Lavanderia
          </div>
        </div>
        <div>
          <h2 className="text-3xl font-semibold leading-tight">
            Gestão operacional<br />da sua lavanderia.
          </h2>
          <p className="mt-3 text-sm text-sidebar-foreground/70 max-w-sm">
            Rolls, conferências, cobranças, pagamentos e relatórios em um só lugar.
          </p>
        </div>
        <div className="text-xs text-sidebar-foreground/50">
          © {new Date().getFullYear()} Alyani Lavanderia
        </div>
      </div>

      <div className="flex items-center justify-center p-8">
        <div className="w-full max-w-sm">
          <div className="mb-6 md:hidden">
            <div className="text-xl font-semibold">ALYANI Lavanderia</div>
          </div>

          <h1 className="text-lg font-semibold mb-1">Acesse o sistema</h1>
          <p className="text-sm text-muted-foreground mb-6">
            Entre com seu e-mail e senha corporativos.
          </p>

          <form onSubmit={signIn} className="space-y-3">
            <div>
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div>
              <Label htmlFor="password">Senha</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Entrando…" : "Entrar"}
            </Button>
          </form>

          <p className="mt-5 text-xs text-center text-muted-foreground">
            Novas contas são criadas somente por administradores do sistema.
          </p>
        </div>
      </div>
    </div>
  );
}
