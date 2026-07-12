import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  LayoutDashboard,
  Building2,
  Truck,
  Package,
  Tags,
  Coins,
  ClipboardList,
  ClipboardCheck,
  GitCompare,
  Receipt,
  Wallet,
  TrendingUp,
  FileBarChart,
  Settings,
  LogOut,
  Menu,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "./theme-toggle";

type Item = { to: string; label: string; icon: React.ComponentType<{ className?: string }> };

const groups: { label: string; items: Item[] }[] = [
  {
    label: "",
    items: [{ to: "/dashboard", label: "Dashboard", icon: LayoutDashboard }],
  },
  {
    label: "Cadastros",
    items: [
      { to: "/cadastros/hoteis", label: "Hotéis", icon: Building2 },
      { to: "/cadastros/prestadoras", label: "Prestadoras", icon: Truck },
      { to: "/cadastros/pecas", label: "Peças", icon: Package },
    ],
  },
  {
    label: "Tabelas",
    items: [
      { to: "/tabelas/precos", label: "Preços dos Clientes", icon: Tags },
      { to: "/tabelas/custos", label: "Custos das Prestadoras", icon: Coins },
    ],
  },
  {
    label: "Operação",
    items: [
      { to: "/operacao/roll-alyani", label: "Roll Alyani", icon: ClipboardList },
      { to: "/operacao/roll-prestadora", label: "Roll Prestadora", icon: ClipboardCheck },
      { to: "/operacao/conferencia", label: "Conferência", icon: GitCompare },
    ],
  },
  {
    label: "Financeiro",
    items: [
      { to: "/financeiro/cobrancas", label: "Cobranças", icon: Receipt },
      { to: "/financeiro/pagamentos", label: "Pagamentos", icon: Wallet },
      { to: "/financeiro/fluxo-de-caixa", label: "Fluxo de Caixa", icon: TrendingUp },
    ],
  },
  {
    label: "",
    items: [
      { to: "/relatorios", label: "Relatórios", icon: FileBarChart },
      { to: "/configuracoes", label: "Configurações", icon: Settings },
    ],
  },
];

function SidebarBody({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isActive = (to: string) => pathname === to || pathname.startsWith(to + "/");
  return (
    <div className="flex h-full w-full flex-col bg-sidebar text-sidebar-foreground">
      <div className="px-4 h-14 flex items-center justify-between border-b border-sidebar-border">
        <div className="flex flex-col leading-tight">
          <span className="text-sm font-semibold tracking-wide">ALYANI</span>
          <span className="text-[10px] uppercase tracking-widest text-sidebar-foreground/60">
            Lavanderia
          </span>
        </div>
        <ThemeToggle />
      </div>
      <nav className="flex-1 overflow-y-auto py-3">
        {groups.map((g, i) => (
          <div key={i} className="mb-3">
            {g.label && (
              <div className="px-4 pb-1 text-[10px] uppercase tracking-wider text-sidebar-foreground/50">
                {g.label}
              </div>
            )}
            <ul>
              {g.items.map((it) => {
                const Icon = it.icon;
                const active = isActive(it.to);
                return (
                  <li key={it.to}>
                    <Link
                      to={it.to}
                      onClick={onNavigate}
                      className={cn(
                        "mx-2 my-0.5 flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] transition-colors",
                        active
                          ? "bg-sidebar-accent text-sidebar-accent-foreground"
                          : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
                      )}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <span className="truncate">{it.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
      <div className="border-t border-sidebar-border p-2">
        <button
          onClick={async () => {
            await supabase.auth.signOut();
            window.location.href = "/auth";
          }}
          className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        >
          <LogOut className="h-4 w-4" />
          Sair
        </button>
      </div>
    </div>
  );
}

export function AppSidebar() {
  return (
    <aside className="hidden md:flex h-screen w-60 shrink-0 border-r border-sidebar-border">
      <SidebarBody />
    </aside>
  );
}

export function MobileTopBar() {
  const [open, setOpen] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  useEffect(() => { setOpen(false); }, [pathname]);
  return (
    <header className="md:hidden sticky top-0 z-30 flex h-12 items-center justify-between gap-2 border-b bg-sidebar text-sidebar-foreground px-2">
      <div className="flex items-center gap-2">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground">
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="p-0 w-64 bg-sidebar text-sidebar-foreground border-sidebar-border">
            <SheetTitle className="sr-only">Menu</SheetTitle>
            <SidebarBody onNavigate={() => setOpen(false)} />
          </SheetContent>
        </Sheet>
        <div className="flex flex-col leading-tight">
          <span className="text-sm font-semibold tracking-wide">ALYANI</span>
          <span className="text-[9px] uppercase tracking-widest text-sidebar-foreground/60">Lavanderia</span>
        </div>
      </div>
      <ThemeToggle />
    </header>
  );
}
