import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  ChevronRight,
  Clock3,
  GitCompare,
  ReceiptText,
  Wallet,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { brl, brDate } from "@/lib/format";
import type { AppRole } from "@/lib/permissoes";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type SystemAlertSeverity = "critical" | "warning" | "info";

export type SystemAlert = {
  id: string;
  severity: SystemAlertSeverity;
  title: string;
  description: string;
  href: string;
  quantity?: number;
  kind: "cobranca" | "pagamento" | "divergencia";
};

function todayIsoDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDaysIso(baseIso: string, days: number) {
  const [year, month, day] = baseIso.split("-").map(Number);
  const date = new Date(year, month - 1, day + days);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function relationOne<T = any>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export function useSystemAlerts(role: AppRole) {
  return useQuery({
    queryKey: ["system-alerts", role],
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const canFinance = role === "admin" || role === "financeiro";
      const canOperate = role === "admin" || role === "operador";

      const cobrancasPromise = canFinance
        ? supabase
            .from("cobrancas")
            .select(
              "id,status,valor,vencimento,hotel_id,hoteis(nome),rolls_alyani(numero)",
            )
            .in("status", ["pendente", "atrasado"])
            .order("vencimento", { ascending: true, nullsFirst: false })
            .limit(50)
        : Promise.resolve({ data: [], error: null } as any);

      const pagamentosPromise = canFinance
        ? supabase
            .from("pagamentos")
            .select("id,status,valor,prestadoras(nome),rolls_alyani(numero)", {
              count: "exact",
            })
            .eq("status", "pendente")
            .limit(250)
        : Promise.resolve({ data: [], error: null, count: 0 } as any);

      const divergenciasPromise = canOperate
        ? supabase
            .from("conferencias")
            .select(
              "id,total_divergencias,created_at,rolls_alyani(numero,hoteis(nome))",
            )
            .gt("total_divergencias", 0)
            .order("created_at", { ascending: false })
            .limit(25)
        : Promise.resolve({ data: [], error: null } as any);

      const [cobrancasResult, pagamentosResult, divergenciasResult] = await Promise.all([
        cobrancasPromise,
        pagamentosPromise,
        divergenciasPromise,
      ]);

      const firstError =
        cobrancasResult.error || pagamentosResult.error || divergenciasResult.error;
      if (firstError) throw firstError;

      const alerts: SystemAlert[] = [];
      const today = todayIsoDate();
      const inThreeDays = addDaysIso(today, 3);

      for (const row of (cobrancasResult.data ?? []) as any[]) {
        const vencimento = row.vencimento ? String(row.vencimento) : "";
        if (!vencimento) continue;

        const roll = relationOne<any>(row.rolls_alyani);
        const hotel = relationOne<any>(row.hoteis);
        const numero = roll?.numero ?? "—";
        const hotelNome = hotel?.nome ?? "Cliente não informado";

        if (row.status === "atrasado" || vencimento < today) {
          alerts.push({
            id: `cobranca-atrasada-${row.id}`,
            severity: "critical",
            title: `Cobrança vencida · Roll ${numero}`,
            description: `${hotelNome} · ${brl(row.valor)} · venceu em ${brDate(vencimento)}`,
            href: "/financeiro/cobrancas",
            kind: "cobranca",
          });
          continue;
        }

        if (vencimento === today) {
          alerts.push({
            id: `cobranca-hoje-${row.id}`,
            severity: "warning",
            title: `Cobrança vence hoje · Roll ${numero}`,
            description: `${hotelNome} · ${brl(row.valor)}`,
            href: "/financeiro/cobrancas",
            kind: "cobranca",
          });
          continue;
        }

        if (vencimento > today && vencimento <= inThreeDays) {
          alerts.push({
            id: `cobranca-proxima-${row.id}`,
            severity: "info",
            title: `Cobrança próxima do vencimento · Roll ${numero}`,
            description: `${hotelNome} · ${brl(row.valor)} · ${brDate(vencimento)}`,
            href: "/financeiro/cobrancas",
            kind: "cobranca",
          });
        }
      }

      const pagamentos = (pagamentosResult.data ?? []) as any[];
      const pagamentosCount = pagamentosResult.count ?? pagamentos.length;
      if (pagamentosCount > 0) {
        const totalPendente = pagamentos.reduce(
          (sum, row) => sum + Math.round(Number(row.valor ?? 0) * 100),
          0,
        ) / 100;
        alerts.push({
          id: "pagamentos-pendentes",
          severity: "info",
          title: `${pagamentosCount} pagamento${pagamentosCount === 1 ? "" : "s"} pendente${pagamentosCount === 1 ? "" : "s"}`,
          description: `Total pendente: ${brl(totalPendente)}`,
          href: "/financeiro/pagamentos",
          quantity: pagamentosCount,
          kind: "pagamento",
        });
      }

      for (const row of (divergenciasResult.data ?? []) as any[]) {
        const roll = relationOne<any>(row.rolls_alyani);
        const hotel = relationOne<any>(roll?.hoteis);
        alerts.push({
          id: `divergencia-${row.id}`,
          severity: "warning",
          title: `Divergência no Roll ${roll?.numero ?? "—"}`,
          description: `${hotel?.nome ?? "Cliente não informado"} · ${row.total_divergencias} divergência${Number(row.total_divergencias) === 1 ? "" : "s"}`,
          href: "/operacao/conferencia",
          kind: "divergencia",
        });
      }

      const severityWeight: Record<SystemAlertSeverity, number> = {
        critical: 0,
        warning: 1,
        info: 2,
      };

      alerts.sort((a, b) => severityWeight[a.severity] - severityWeight[b.severity]);

      const attentionCount = alerts.reduce(
        (sum, alert) => sum + Math.max(1, Number(alert.quantity ?? 1)),
        0,
      );

      return {
        alerts,
        attentionCount,
        criticalCount: alerts.filter((alert) => alert.severity === "critical").length,
        warningCount: alerts.filter((alert) => alert.severity === "warning").length,
      };
    },
  });
}

const severityClasses: Record<SystemAlertSeverity, string> = {
  critical: "border-destructive/25 bg-destructive/5 text-destructive",
  warning: "border-warning/30 bg-warning/10 text-warning",
  info: "border-primary/20 bg-primary/5 text-primary",
};

function AlertIcon({ alert }: { alert: SystemAlert }) {
  if (alert.kind === "pagamento") return <Wallet className="h-4 w-4" />;
  if (alert.kind === "divergencia") return <GitCompare className="h-4 w-4" />;
  if (alert.severity === "critical") return <AlertTriangle className="h-4 w-4" />;
  if (alert.severity === "warning") return <Clock3 className="h-4 w-4" />;
  return <ReceiptText className="h-4 w-4" />;
}

export function SystemAlertsButton({
  role,
  className,
}: {
  role: AppRole;
  className?: string;
}) {
  const { data, isLoading, isError } = useSystemAlerts(role);
  const alerts = data?.alerts ?? [];
  const count = data?.attentionCount ?? 0;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn("relative", className)}
          aria-label="Alertas e pendências"
        >
          <Bell className="h-4 w-4" />
          {count > 0 && (
            <span className="absolute -right-0.5 -top-0.5 min-w-4 rounded-full bg-destructive px-1 text-center text-[9px] font-semibold leading-4 text-destructive-foreground">
              {count > 99 ? "99+" : count}
            </span>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-[min(92vw,390px)] p-0">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div>
            <div className="text-sm font-semibold">Alertas e pendências</div>
            <div className="text-xs text-muted-foreground">
              Atualizados automaticamente a cada minuto.
            </div>
          </div>
          {count > 0 && (
            <span className="rounded-full bg-muted px-2 py-1 text-xs font-medium">
              {count}
            </span>
          )}
        </div>

        <div className="max-h-[430px] overflow-y-auto p-2">
          {isLoading && (
            <div className="px-3 py-8 text-center text-sm text-muted-foreground">
              Carregando alertas...
            </div>
          )}

          {isError && (
            <div className="px-3 py-8 text-center text-sm text-destructive">
              Não foi possível carregar os alertas.
            </div>
          )}

          {!isLoading && !isError && alerts.length === 0 && (
            <div className="flex flex-col items-center gap-2 px-3 py-8 text-center">
              <CheckCircle2 className="h-6 w-6 text-success" />
              <div className="text-sm font-medium">Tudo em dia</div>
              <div className="text-xs text-muted-foreground">
                Nenhuma pendência importante no momento.
              </div>
            </div>
          )}

          {!isLoading && !isError &&
            alerts.slice(0, 12).map((alert) => (
              <Link
                key={alert.id}
                to={alert.href as any}
                className="group flex items-start gap-3 rounded-md px-2.5 py-2.5 hover:bg-muted/60"
              >
                <div
                  className={cn(
                    "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md border",
                    severityClasses[alert.severity],
                  )}
                >
                  <AlertIcon alert={alert} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium leading-5">{alert.title}</div>
                  <div className="mt-0.5 text-xs leading-4 text-muted-foreground">
                    {alert.description}
                  </div>
                </div>
                <ChevronRight className="mt-2 h-4 w-4 shrink-0 text-muted-foreground/60 group-hover:text-foreground" />
              </Link>
            ))}
        </div>

        {alerts.length > 12 && (
          <div className="border-t px-4 py-2 text-center text-xs text-muted-foreground">
            + {alerts.length - 12} alerta{alerts.length - 12 === 1 ? "" : "s"} na lista
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
