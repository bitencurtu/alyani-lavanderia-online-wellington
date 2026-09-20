import { createFileRoute, Link, useRouteContext } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/app/page-header";
import { FilterBar, type FilterState } from "@/components/app/filter-bar";
import { Button } from "@/components/ui/button";
import { AnimatedPage } from "@/components/ui/animated-page";
import { useSystemAlerts, type SystemAlert } from "@/components/app/system-alerts";
import { brl, brDate, firstOfMonth, lastOfMonth } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  GitCompare,
  Landmark,
  Pencil,
  Receipt,
  ReceiptText,
  TrendingUp,
  Wallet,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — Alyani Lavanderia" }] }),
  component: Dashboard,
});

function moneySum(values: Array<number | string | null | undefined>) {
  const cents = values.reduce(
    (sum, value) => sum + Math.round((Number(value) || 0) * 100),
    0,
  );
  return cents / 100;
}

function percent(value: number, base: number) {
  if (!Number.isFinite(value) || !Number.isFinite(base) || base === 0) return 0;
  return (value / base) * 100;
}

function percentLabel(value: number) {
  return `${value.toLocaleString("pt-BR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}%`;
}

function relationOne<T = any>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function SummaryCard({
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
    <div className="rounded-md border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            {label}
          </div>
          <div className="mt-2 truncate text-2xl font-semibold tracking-tight">{value}</div>
          {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
        </div>
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted">
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
      </div>
    </div>
  );
}

function MiniMetric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-md border bg-card px-3 py-3">
      <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 text-base font-semibold">{value}</div>
      {hint && <div className="mt-0.5 text-[11px] text-muted-foreground">{hint}</div>}
    </div>
  );
}

function ProgressRow({
  label,
  value,
  total,
  amount,
}: {
  label: string;
  value: number;
  total: number;
  amount: string;
}) {
  const width = total > 0 ? Math.min(100, Math.max(0, (value / total) * 100)) : 0;

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-3 text-sm">
        <span>{label}</span>
        <span className="font-medium">{amount}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary" style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}

function DashboardAlertRow({ alert }: { alert: SystemAlert }) {
  const tone =
    alert.severity === "critical"
      ? "border-destructive/25 bg-destructive/5"
      : alert.severity === "warning"
        ? "border-warning/30 bg-warning/10"
        : "border-primary/20 bg-primary/5";

  return (
    <Link
      to={alert.href as any}
      className={cn(
        "flex items-center gap-3 rounded-md border px-3 py-2.5 transition-colors hover:bg-muted/60",
        tone,
      )}
    >
      <AlertTriangle
        className={cn(
          "h-4 w-4 shrink-0",
          alert.severity === "critical"
            ? "text-destructive"
            : alert.severity === "warning"
              ? "text-warning"
              : "text-primary",
        )}
      />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{alert.title}</div>
        <div className="truncate text-xs text-muted-foreground">{alert.description}</div>
      </div>
      <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
    </Link>
  );
}

function Dashboard() {
  const { role } = useRouteContext({ from: "/_authenticated" });
  const [filters, setFilters] = useState<FilterState>({
    dataInicio: firstOfMonth(),
    dataFim: lastOfMonth(),
  });

  const start = filters.dataInicio ?? firstOfMonth();
  const end = filters.dataFim ?? lastOfMonth();

  const { data, isLoading } = useQuery({
    queryKey: ["dashboard-v2", start, end],
    staleTime: 30_000,
    queryFn: async () => {
      const [rollsResult, cobrancasResult, pagamentosResult, ultimasResult, divergenciasResult] =
        await Promise.all([
          supabase
            .from("rolls_alyani")
            .select("id,numero,total_receita,total_custo,total_lucro,data_roll")
            .gte("data_roll", start)
            .lte("data_roll", end),
          supabase
            .from("cobrancas")
            .select(
              "id,status,valor,vencimento,data_pagamento,rolls_alyani!inner(id,numero,data_roll)",
            )
            .gte("rolls_alyani.data_roll", start)
            .lte("rolls_alyani.data_roll", end),
          supabase
            .from("pagamentos")
            .select(
              "id,status,valor,data_pagamento,rolls_alyani!inner(id,numero,data_roll)",
            )
            .gte("rolls_alyani.data_roll", start)
            .lte("rolls_alyani.data_roll", end),
          supabase
            .from("rolls_alyani")
            .select(
              "id,numero,data_roll,total_receita,total_custo,hoteis(nome),prestadoras(nome)",
            )
            .order("created_at", { ascending: false })
            .limit(8),
          supabase
            .from("conferencias")
            .select(
              "id,total_divergencias,rolls_alyani!inner(numero,data_roll,hoteis(nome))",
            )
            .gt("total_divergencias", 0)
            .gte("rolls_alyani.data_roll", start)
            .lte("rolls_alyani.data_roll", end),
        ]);

      const error =
        rollsResult.error ||
        cobrancasResult.error ||
        pagamentosResult.error ||
        ultimasResult.error ||
        divergenciasResult.error;
      if (error) throw error;

      return {
        rolls: (rollsResult.data ?? []) as any[],
        cobrancas: (cobrancasResult.data ?? []) as any[],
        pagamentos: (pagamentosResult.data ?? []) as any[],
        ultimas: (ultimasResult.data ?? []) as any[],
        divergencias: (divergenciasResult.data ?? []) as any[],
      };
    },
  });

  const { data: alertsData } = useSystemAlerts(role);
  const canFinance = role === "admin" || role === "financeiro";
  const canOperate = role === "admin" || role === "operador";

  const totals = useMemo(() => {
    const rolls = data?.rolls ?? [];
    const cobrancas = data?.cobrancas ?? [];
    const pagamentos = data?.pagamentos ?? [];
    const divergencias = data?.divergencias ?? [];

    const receita = moneySum(rolls.map((row) => row.total_receita));
    const custo = moneySum(rolls.map((row) => row.total_custo));
    const resultado = moneySum(rolls.map((row) => row.total_lucro));

    const cobrancasAtivas = cobrancas.filter((row) => row.status !== "cancelado");
    const pagamentosAtivos = pagamentos.filter((row) => row.status !== "cancelado");

    const recebido = moneySum(
      cobrancasAtivas.filter((row) => row.status === "pago").map((row) => row.valor),
    );
    const aReceber = moneySum(
      cobrancasAtivas.filter((row) => row.status !== "pago").map((row) => row.valor),
    );
    const pago = moneySum(
      pagamentosAtivos.filter((row) => row.status === "pago").map((row) => row.valor),
    );
    const aPagar = moneySum(
      pagamentosAtivos.filter((row) => row.status === "pendente").map((row) => row.valor),
    );

    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, "0");
    const d = String(today.getDate()).padStart(2, "0");
    const todayIso = `${y}-${m}-${d}`;
    const vencidas = cobrancasAtivas.filter(
      (row) =>
        row.status === "atrasado" ||
        (row.status === "pendente" && row.vencimento && String(row.vencimento) < todayIso),
    );

    return {
      rolls: rolls.length,
      receita,
      custo,
      resultado,
      margem: percent(resultado, receita),
      recebido,
      aReceber,
      pago,
      aPagar,
      cobrancasVencidas: vencidas.length,
      valorVencido: moneySum(vencidas.map((row) => row.valor)),
      divergencias: divergencias.length,
      totalDivergencias: divergencias.reduce(
        (sum, row) => sum + Number(row.total_divergencias ?? 0),
        0,
      ),
    };
  }, [data]);

  const financeTotal = totals.recebido + totals.aReceber;
  const paymentsTotal = totals.pago + totals.aPagar;
  const dashboardAlerts = alertsData?.alerts?.slice(0, 5) ?? [];

  return (
    <AnimatedPage>
      <PageHeader
        title="Dashboard"
        description="Resumo financeiro, operacional e pendências que precisam de atenção."
      />

      <FilterBar
        value={filters}
        onChange={(patch) => setFilters((current) => ({ ...current, ...patch }))}
        showBusca={false}
        onClear={() =>
          setFilters({ dataInicio: firstOfMonth(), dataFim: lastOfMonth() })
        }
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          label="Receita do período"
          value={isLoading ? "—" : brl(totals.receita)}
          icon={Receipt}
          hint={`${totals.rolls} Roll${totals.rolls === 1 ? "" : "s"} no período`}
        />
        <SummaryCard
          label="Resultado operacional"
          value={isLoading ? "—" : brl(totals.resultado)}
          icon={TrendingUp}
          hint={`Margem ${percentLabel(totals.margem)}`}
        />
        <SummaryCard
          label="A receber"
          value={isLoading ? "—" : brl(totals.aReceber)}
          icon={ReceiptText}
          hint={
            totals.cobrancasVencidas > 0
              ? `${totals.cobrancasVencidas} cobrança${totals.cobrancasVencidas === 1 ? "" : "s"} vencida${totals.cobrancasVencidas === 1 ? "" : "s"}`
              : "Sem cobranças vencidas no período"
          }
        />
        <SummaryCard
          label="A pagar"
          value={isLoading ? "—" : brl(totals.aPagar)}
          icon={Wallet}
          hint={`Já pago: ${brl(totals.pago)}`}
        />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
        <MiniMetric label="Rolls" value={String(totals.rolls)} hint="No período" />
        <MiniMetric
          label="Recebido"
          value={brl(totals.recebido)}
          hint={`${percentLabel(percent(totals.recebido, financeTotal))} das cobranças`}
        />
        <MiniMetric
          label="Custo dos Rolls"
          value={brl(totals.custo)}
          hint={`${percentLabel(percent(totals.custo, totals.receita))} da receita`}
        />
        <MiniMetric
          label="Divergências"
          value={String(totals.totalDivergencias)}
          hint={`${totals.divergencias} conferência${totals.divergencias === 1 ? "" : "s"} com diferença`}
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <section className="rounded-md border bg-card">
          <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
            <div>
              <div className="text-sm font-semibold">Situação financeira</div>
              <div className="text-xs text-muted-foreground">
                O que já entrou/saiu e o que ainda está pendente no período.
              </div>
            </div>
            <Landmark className="h-4 w-4 text-muted-foreground" />
          </div>

          <div className="space-y-5 p-4">
            <div>
              <div className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Cobranças
              </div>
              <div className="space-y-3">
                <ProgressRow
                  label="Recebido"
                  value={totals.recebido}
                  total={financeTotal}
                  amount={brl(totals.recebido)}
                />
                <ProgressRow
                  label="A receber"
                  value={totals.aReceber}
                  total={financeTotal}
                  amount={brl(totals.aReceber)}
                />
              </div>
            </div>

            <div className="border-t pt-4">
              <div className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Pagamentos às prestadoras
              </div>
              <div className="space-y-3">
                <ProgressRow
                  label="Pago"
                  value={totals.pago}
                  total={paymentsTotal}
                  amount={brl(totals.pago)}
                />
                <ProgressRow
                  label="A pagar"
                  value={totals.aPagar}
                  total={paymentsTotal}
                  amount={brl(totals.aPagar)}
                />
              </div>
            </div>

            {totals.cobrancasVencidas > 0 && (
              <div className="flex items-center justify-between gap-3 rounded-md border border-destructive/25 bg-destructive/5 px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-destructive" />
                  <div>
                    <div className="text-sm font-medium">Cobranças vencidas</div>
                    <div className="text-xs text-muted-foreground">
                      {totals.cobrancasVencidas} cobrança{totals.cobrancasVencidas === 1 ? "" : "s"} · {brl(totals.valorVencido)}
                    </div>
                  </div>
                </div>
                {canFinance && (
                  <Button asChild variant="outline" size="sm">
                    <Link to="/financeiro/cobrancas">Ver</Link>
                  </Button>
                )}
              </div>
            )}
          </div>
        </section>

        <section className="rounded-md border bg-card">
          <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
            <div>
              <div className="text-sm font-semibold">Alertas prioritários</div>
              <div className="text-xs text-muted-foreground">
                Pendências atuais do sistema, independentemente do filtro acima.
              </div>
            </div>
            {alertsData?.attentionCount ? (
              <span className="rounded-full bg-destructive px-2 py-0.5 text-xs font-semibold text-destructive-foreground">
                {alertsData.attentionCount > 99 ? "99+" : alertsData.attentionCount}
              </span>
            ) : null}
          </div>

          <div className="space-y-2 p-3">
            {dashboardAlerts.length > 0 ? (
              dashboardAlerts.map((alert) => <DashboardAlertRow key={alert.id} alert={alert} />)
            ) : (
              <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
                <CheckCircle2 className="h-6 w-6 text-success" />
                <div className="text-sm font-medium">Tudo em dia</div>
                <div className="max-w-xs text-xs text-muted-foreground">
                  Nenhuma cobrança urgente, pagamento pendente ou divergência importante.
                </div>
              </div>
            )}
          </div>
        </section>
      </div>

      <section className="mt-4 rounded-md border bg-card">
        <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
          <div className="flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-muted-foreground" />
            <div>
              <div className="text-sm font-semibold">Últimos Rolls</div>
              <div className="text-xs text-muted-foreground">Movimentações mais recentes.</div>
            </div>
          </div>
          {canOperate && (
            <Button asChild variant="outline" size="sm">
              <Link to="/operacao/roll-alyani">
                Ver todos
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-sm">
            <thead className="bg-muted/40 text-[11px] uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-2 text-left font-medium">Roll</th>
                <th className="px-4 py-2 text-left font-medium">Cliente</th>
                <th className="px-4 py-2 text-left font-medium">Prestadora</th>
                <th className="px-4 py-2 text-left font-medium">Data</th>
                <th className="px-4 py-2 text-right font-medium">Receita</th>
                <th className="px-4 py-2 text-right font-medium">Resultado</th>
                {canOperate && <th className="w-10" />}
              </tr>
            </thead>
            <tbody>
              {(data?.ultimas ?? []).map((row) => {
                const hotel = relationOne<any>(row.hoteis);
                const prestadora = relationOne<any>(row.prestadoras);
                const resultado = (Math.round(Number(row.total_receita ?? 0) * 100) - Math.round(Number(row.total_custo ?? 0) * 100)) / 100;

                return (
                  <tr key={row.id} className="border-t">
                    <td className="px-4 py-2 font-mono">{row.numero}</td>
                    <td className="px-4 py-2">{hotel?.nome ?? "—"}</td>
                    <td className="px-4 py-2 text-muted-foreground">{prestadora?.nome ?? "—"}</td>
                    <td className="px-4 py-2">{brDate(row.data_roll)}</td>
                    <td className="px-4 py-2 text-right font-medium">{brl(row.total_receita)}</td>
                    <td className="px-4 py-2 text-right font-medium">{brl(resultado)}</td>
                    {canOperate && (
                      <td className="px-1 py-1 text-right">
                        <Button asChild variant="ghost" size="icon">
                          <Link to="/operacao/roll-alyani/$id" params={{ id: row.id }}>
                            <Pencil className="h-4 w-4" />
                          </Link>
                        </Button>
                      </td>
                    )}
                  </tr>
                );
              })}
              {(data?.ultimas ?? []).length === 0 && (
                <tr>
                  <td colSpan={canOperate ? 7 : 6} className="px-4 py-8 text-center text-muted-foreground">
                    Sem lançamentos ainda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </AnimatedPage>
  );
}
