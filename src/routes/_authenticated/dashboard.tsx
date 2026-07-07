import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/app/page-header";
import { FilterBar, type FilterState } from "@/components/app/filter-bar";
import { Button } from "@/components/ui/button";
import { AnimatedPage } from "@/components/ui/animated-page";
import { brl, brDate, firstOfMonth, lastOfMonth } from "@/lib/format";
import {
  ClipboardList,
  Receipt,
  Wallet,
  TrendingUp,
  AlertTriangle,
  Pencil,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — Alyani Lavanderia" }] }),
  component: Dashboard,
});

function Card({
  label,
  value,
  icon: Icon,
  hint,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  hint?: string;
}) {
  return (
    <div className="rounded-md border bg-card p-4 transition-smooth hover-scale hover:shadow-md">
      <div className="flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="mt-2 text-2xl font-semibold tracking-tight">{value}</div>
      {hint && <div className="text-xs text-muted-foreground mt-1">{hint}</div>}
    </div>
  );
}

function Dashboard() {
  const [filters, setFilters] = useState<FilterState>({
    dataInicio: firstOfMonth(),
    dataFim: lastOfMonth(),
  });

  const { data } = useQuery({
    queryKey: ["dashboard", filters.dataInicio, filters.dataFim],
    queryFn: async () => {
      const start = filters.dataInicio!;
      const end = filters.dataFim!;
      const [rolls, ultimas, divergs] = await Promise.all([
        supabase
          .from("rolls_alyani")
          .select("id, total_receita, total_custo, total_lucro, data_roll")
          .gte("data_roll", start)
          .lte("data_roll", end),
        supabase
          .from("rolls_alyani")
          .select("id, numero, data_roll, total_receita, hoteis(nome), prestadoras(nome)")
          .order("created_at", { ascending: false })
          .limit(8),
        supabase
          .from("conferencias")
          .select("id, total_divergencias, created_at, rolls_alyani(numero, hoteis(nome))")
          .gt("total_divergencias", 0)
          .order("created_at", { ascending: false })
          .limit(8),
      ]);
      return {
        rolls: rolls.data ?? [],
        ultimas: (ultimas.data ?? []) as any[],
        divergs: (divergs.data ?? []) as any[],
      };
    },
  });

  const totals = useMemo(() => {
    const r = data?.rolls ?? [];
    return {
      qtd: r.length,
      receita: r.reduce((s, x: any) => s + Number(x.total_receita ?? 0), 0),
      custo: r.reduce((s, x: any) => s + Number(x.total_custo ?? 0), 0),
      lucro: r.reduce((s, x: any) => s + Number(x.total_lucro ?? 0), 0),
    };
  }, [data]);

  return (
    <AnimatedPage>
      <PageHeader
        title="Dashboard"
        description="Visão geral do período selecionado."
      />
      <FilterBar
        value={filters}
        onChange={(p) => setFilters((f) => ({ ...f, ...p }))}
        showBusca={false}
        onClear={() => setFilters({ dataInicio: undefined, dataFim: undefined })}
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card label="Rolls" value={String(totals.qtd)} icon={ClipboardList} />
        <Card label="Faturamento" value={brl(totals.receita)} icon={Receipt} />
        <Card label="Pagamentos" value={brl(totals.custo)} icon={Wallet} />
        <Card label="Lucro" value={brl(totals.lucro)} icon={TrendingUp} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-6">
        <div className="rounded-md border bg-card card-hover">
          <div className="px-4 py-3 border-b flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Últimas movimentações</span>
          </div>
          <table className="w-full text-sm">
            <thead className="text-[11px] uppercase text-muted-foreground bg-muted/40">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Roll</th>
                <th className="text-left px-4 py-2 font-medium">Hotel</th>
                <th className="text-left px-4 py-2 font-medium">Data</th>
                <th className="text-right px-4 py-2 font-medium">Valor</th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody>
              {(data?.ultimas ?? []).map((u) => (
                <tr key={u.id} className="border-t">
                  <td className="px-4 py-2 font-mono">{u.numero}</td>
                  <td className="px-4 py-2">{u.hoteis?.nome ?? "—"}</td>
                  <td className="px-4 py-2">{brDate(u.data_roll)}</td>
                  <td className="px-4 py-2 text-right">{brl(u.total_receita)}</td>
                  <td className="px-1 py-1 text-right">
                    <Button asChild variant="ghost" size="icon">
                      <Link to="/operacao/roll-alyani/$id" params={{ id: u.id }}>
                        <Pencil className="h-4 w-4" />
                      </Link>
                    </Button>
                  </td>
                </tr>
              ))}
              {(data?.ultimas ?? []).length === 0 && (
                <tr><td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">Sem lançamentos ainda.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="rounded-md border bg-card card-hover">
          <div className="px-4 py-3 border-b flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-warning" />
            <span className="text-sm font-medium">Últimas divergências</span>
          </div>
          <table className="w-full text-sm">
            <thead className="text-[11px] uppercase text-muted-foreground bg-muted/40">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Roll Alyani</th>
                <th className="text-left px-4 py-2 font-medium">Hotel</th>
                <th className="text-right px-4 py-2 font-medium">Divergências</th>
              </tr>
            </thead>
            <tbody>
              {(data?.divergs ?? []).map((d) => (
                <tr key={d.id} className="border-t">
                  <td className="px-4 py-2 font-mono">{d.rolls_alyani?.numero ?? "—"}</td>
                  <td className="px-4 py-2">{d.rolls_alyani?.hoteis?.nome ?? "—"}</td>
                  <td className="px-4 py-2 text-right font-semibold text-destructive">{d.total_divergencias}</td>
                </tr>
              ))}
              {(data?.divergs ?? []).length === 0 && (
                <tr><td colSpan={3} className="px-4 py-6 text-center text-muted-foreground">Sem divergências no período.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </AnimatedPage>
  );
}