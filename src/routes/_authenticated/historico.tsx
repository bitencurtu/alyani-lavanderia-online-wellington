import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, History, RefreshCw, Search, UserRound } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/historico")({
  head: () => ({ meta: [{ title: "Histórico — Alyani" }] }),
  component: Page,
});

type AuditLog = {
  id: string;
  usuario_id: string | null;
  usuario_nome: string | null;
  usuario_email: string | null;
  entidade: string;
  entidade_id: string | null;
  acao: "criado" | "alterado" | "excluido";
  descricao: string;
  dados_anteriores: Record<string, unknown> | null;
  dados_novos: Record<string, unknown> | null;
  created_at: string;
};

type Change = {
  key: string;
  label: string;
  before: unknown;
  after: unknown;
};

const ENTITY_LABELS: Record<string, string> = {
  rolls_alyani: "Roll Alyani",
  rolls_alyani_itens: "Item do Roll Alyani",
  rolls_prestadora: "Roll Prestadora",
  rolls_prestadora_itens: "Item do Roll Prestadora",
  pagamentos: "Pagamento",
  cobrancas: "Cobrança",
  tabela_precos: "Preço",
  tabela_custos: "Custo",
  pecas: "Peça",
  hoteis: "Cliente",
  prestadoras: "Prestadora",
};

const FIELD_LABELS: Record<string, string> = {
  numero: "Número",
  status: "Status",
  quantidade: "Quantidade",
  data_roll: "Data do Roll",
  data_vencimento: "Vencimento",
  vencimento: "Vencimento",
  data_pagamento: "Data de pagamento",
  valor: "Valor",
  valor_normal: "Valor normal",
  valor_expresso: "Valor expresso",
  valor_unit: "Valor unitário",
  valor_total: "Valor total",
  custo_unit: "Custo unitário",
  custo_total: "Custo total",
  total_receita: "Receita",
  total_custo: "Custo",
  total_lucro: "Lucro",
  nome: "Nome",
  nf_fat: "NF / Fat",
  observacoes: "Observações",
  expresso: "Expresso",
  expresso_item: "Expresso",
};

const MONEY_FIELDS = new Set([
  "valor",
  "valor_normal",
  "valor_expresso",
  "valor_unit",
  "valor_total",
  "custo_unit",
  "custo_total",
  "total_receita",
  "total_custo",
  "total_lucro",
]);

const DATE_FIELDS = new Set(["data_roll", "data_vencimento", "vencimento", "data_pagamento"]);

const HIDDEN_DETAIL_FIELDS = new Set([
  "id",
  "created_by",
  "hotel_id",
  "prestadora_id",
  "peca_id",
  "roll_id",
]);

const ACTION_META: Record<AuditLog["acao"], { label: string; className: string }> = {
  criado: { label: "Criado", className: "text-emerald-700 dark:text-emerald-400" },
  alterado: { label: "Alterado", className: "text-amber-700 dark:text-amber-400" },
  excluido: { label: "Excluído", className: "text-destructive" },
};

function formatTime(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function dateKey(value: string) {
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatGroupDate(key: string) {
  const [year, month, day] = key.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.getTime() === today.getTime()) return "Hoje";
  if (date.getTime() === yesterday.getTime()) return "Ontem";

  return new Intl.DateTimeFormat("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: date.getFullYear() !== today.getFullYear() ? "numeric" : undefined,
  }).format(date);
}

function formatDateValue(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}/.test(value)) return String(value);
  const [year, month, day] = value.slice(0, 10).split("-");
  return `${day}/${month}/${year}`;
}

function formatValue(key: string, value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Sim" : "Não";

  if (MONEY_FIELDS.has(key) && (typeof value === "number" || !Number.isNaN(Number(value)))) {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(Number(value));
  }

  if (DATE_FIELDS.has(key)) return formatDateValue(value);

  if (typeof value === "number") {
    return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 4 }).format(value);
  }

  return String(value);
}

function changedFields(log: AuditLog): Change[] {
  const before = log.dados_anteriores ?? {};
  const after = log.dados_novos ?? {};
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);

  return [...keys]
    .filter((key) => !HIDDEN_DETAIL_FIELDS.has(key))
    .filter((key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]))
    .map((key) => ({
      key,
      label: FIELD_LABELS[key] ?? key.replaceAll("_", " "),
      before: before[key],
      after: after[key],
    }));
}

function ChangeCard({ change }: { change: Change }) {
  return (
    <div className="rounded-md border bg-background px-3 py-2.5">
      <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {change.label}
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_18px_minmax(0,1fr)] items-center gap-1.5 text-xs">
        <span className="truncate text-muted-foreground" title={formatValue(change.key, change.before)}>
          {formatValue(change.key, change.before)}
        </span>
        <span className="text-center text-muted-foreground/60">→</span>
        <span className="truncate font-medium" title={formatValue(change.key, change.after)}>
          {formatValue(change.key, change.after)}
        </span>
      </div>
    </div>
  );
}

function Page() {
  const [search, setSearch] = useState("");
  const [entity, setEntity] = useState("todos");
  const [action, setAction] = useState("todas");
  const [dateStart, setDateStart] = useState("");
  const [dateEnd, setDateEnd] = useState("");

  const query = useQuery({
    queryKey: ["audit-logs"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("audit_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(1000);

      if (error) throw error;
      return (data ?? []) as AuditLog[];
    },
    staleTime: 15_000,
  });

  const rows = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");

    return (query.data ?? []).filter((row) => {
      if (entity !== "todos" && row.entidade !== entity) return false;
      if (action !== "todas" && row.acao !== action) return false;

      const localDate = new Date(row.created_at);
      if (dateStart) {
        const start = new Date(`${dateStart}T00:00:00`);
        if (localDate < start) return false;
      }
      if (dateEnd) {
        const end = new Date(`${dateEnd}T23:59:59.999`);
        if (localDate > end) return false;
      }

      if (term) {
        const haystack = [
          row.descricao,
          row.usuario_nome,
          row.usuario_email,
          ENTITY_LABELS[row.entidade] ?? row.entidade,
        ]
          .filter(Boolean)
          .join(" ")
          .toLocaleLowerCase("pt-BR");
        if (!haystack.includes(term)) return false;
      }

      return true;
    });
  }, [action, dateEnd, dateStart, entity, query.data, search]);

  const groupedRows = useMemo(() => {
    const groups = new Map<string, AuditLog[]>();
    for (const row of rows) {
      const key = dateKey(row.created_at);
      const group = groups.get(key) ?? [];
      group.push(row);
      groups.set(key, group);
    }
    return [...groups.entries()];
  }, [rows]);

  const hasFilters = Boolean(search || entity !== "todos" || action !== "todas" || dateStart || dateEnd);

  const clearFilters = () => {
    setSearch("");
    setEntity("todos");
    setAction("todas");
    setDateStart("");
    setDateEnd("");
  };

  return (
    <>
      <PageHeader
        title="Histórico"
        description="Alterações importantes do sistema, organizadas por data."
        actions={
          <Button variant="outline" size="sm" onClick={() => query.refetch()} disabled={query.isFetching}>
            <RefreshCw className={`mr-1.5 h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
        }
      />

      <div className="mb-4 rounded-md border bg-card p-3">
        <div className="flex flex-col gap-2 xl:flex-row xl:items-center">
          <div className="relative min-w-0 flex-1">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar Roll, usuário ou alteração..."
              className="pl-8"
            />
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:flex xl:w-auto">
            <Select value={entity} onValueChange={setEntity}>
              <SelectTrigger className="xl:w-[175px]"><SelectValue placeholder="Área" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todas as áreas</SelectItem>
                {Object.entries(ENTITY_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={action} onValueChange={setAction}>
              <SelectTrigger className="xl:w-[140px]"><SelectValue placeholder="Ação" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas as ações</SelectItem>
                <SelectItem value="criado">Criado</SelectItem>
                <SelectItem value="alterado">Alterado</SelectItem>
                <SelectItem value="excluido">Excluído</SelectItem>
              </SelectContent>
            </Select>

            <Input
              type="date"
              value={dateStart}
              onChange={(e) => setDateStart(e.target.value)}
              aria-label="Data inicial"
              title="Data inicial"
              className="xl:w-[145px]"
            />
            <Input
              type="date"
              value={dateEnd}
              onChange={(e) => setDateEnd(e.target.value)}
              aria-label="Data final"
              title="Data final"
              className="xl:w-[145px]"
            />
          </div>

          {hasFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters} className="shrink-0">
              Limpar
            </Button>
          )}
        </div>
      </div>

      <div className="overflow-hidden rounded-md border bg-card">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <History className="h-4 w-4" />
            Atividade
          </div>
          <div className="text-xs text-muted-foreground">
            {rows.length} {rows.length === 1 ? "evento" : "eventos"}
          </div>
        </div>

        {query.isLoading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Carregando histórico...</div>
        ) : query.isError ? (
          <div className="p-8 text-center text-sm text-destructive">
            Não foi possível carregar o histórico. Verifique se a migration foi aplicada no Supabase.
          </div>
        ) : rows.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Nenhuma alteração encontrada.</div>
        ) : (
          <div>
            {groupedRows.map(([day, dayRows]) => (
              <section key={day} className="border-b last:border-b-0">
                <div className="bg-muted/35 px-4 py-2 text-xs font-medium capitalize text-muted-foreground">
                  {formatGroupDate(day)}
                </div>

                <div className="divide-y">
                  {dayRows.map((row) => {
                    const changes = changedFields(row);
                    const user = row.usuario_nome || row.usuario_email || "Sistema";
                    const actionMeta = ACTION_META[row.acao];

                    return (
                      <div key={row.id} className="px-4 py-3">
                        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium" title={row.descricao}>
                              {row.descricao}
                            </div>

                            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                              <span className={`font-medium ${actionMeta.className}`}>{actionMeta.label}</span>
                              <span aria-hidden="true">·</span>
                              <span>{ENTITY_LABELS[row.entidade] ?? row.entidade}</span>
                              <span aria-hidden="true">·</span>
                              <span className="inline-flex min-w-0 items-center gap-1">
                                <UserRound className="h-3 w-3 shrink-0" />
                                <span className="truncate">{user}</span>
                              </span>
                            </div>
                          </div>

                          <div className="text-xs tabular-nums text-muted-foreground sm:pt-0.5">
                            {formatTime(row.created_at)}
                          </div>
                        </div>

                        {changes.length > 0 && (
                          <details className="group mt-2.5">
                            <summary className="inline-flex cursor-pointer select-none list-none items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground [&::-webkit-details-marker]:hidden">
                              <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />
                              {changes.length === 1 ? "1 mudança" : `${changes.length} mudanças`}
                            </summary>

                            <div className="mt-2.5 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                              {changes.map((change) => (
                                <ChangeCard key={change.key} change={change} />
                              ))}
                            </div>
                          </details>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
