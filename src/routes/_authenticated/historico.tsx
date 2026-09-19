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

type RollRef = {
  tipo: "alyani" | "prestadora";
  id: string;
  numero: string | null;
};

type ActivityGroup = {
  key: string;
  type: "roll" | "single";
  rollType?: RollRef["tipo"];
  rollId?: string;
  rollNumero?: string | null;
  events: AuditLog[];
  latestAt: string;
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

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
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

function rowData(log: AuditLog) {
  return log.dados_novos ?? log.dados_anteriores ?? {};
}

function stringField(data: Record<string, unknown>, field: string) {
  const value = data[field];
  return typeof value === "string" && value ? value : null;
}

function numberFromDescription(description: string) {
  const match = description.match(/Roll(?:\s+Alyani|\s+Prestadora)?\s+([^\s:]+)/i);
  return match?.[1] ?? null;
}

function getRollRef(log: AuditLog): RollRef | null {
  const data = rowData(log);

  if (log.entidade === "rolls_alyani") {
    if (!log.entidade_id) return null;
    return {
      tipo: "alyani",
      id: log.entidade_id,
      numero: stringField(data, "numero") ?? numberFromDescription(log.descricao),
    };
  }

  if (["rolls_alyani_itens", "pagamentos", "cobrancas"].includes(log.entidade)) {
    const rollId = stringField(data, "roll_id");
    if (!rollId) return null;
    return {
      tipo: "alyani",
      id: rollId,
      numero: numberFromDescription(log.descricao),
    };
  }

  if (log.entidade === "rolls_prestadora") {
    if (!log.entidade_id) return null;
    return {
      tipo: "prestadora",
      id: log.entidade_id,
      numero: stringField(data, "numero") ?? numberFromDescription(log.descricao),
    };
  }

  if (log.entidade === "rolls_prestadora_itens") {
    const rollId = stringField(data, "roll_id");
    if (!rollId) return null;
    return {
      tipo: "prestadora",
      id: rollId,
      numero: numberFromDescription(log.descricao),
    };
  }

  return null;
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

function EventRow({ row }: { row: AuditLog }) {
  const changes = changedFields(row);
  const user = row.usuario_nome || row.usuario_email || "Sistema";
  const actionMeta = ACTION_META[row.acao];

  return (
    <div className="border-l-2 border-muted pl-3">
      <div className="grid gap-1.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
        <div className="min-w-0">
          <div className="text-sm font-medium">{row.descricao}</div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
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
        <div className="text-xs tabular-nums text-muted-foreground" title={formatDateTime(row.created_at)}>
          {formatTime(row.created_at)}
        </div>
      </div>

      {changes.length > 0 && (
        <details className="group mt-2">
          <summary className="inline-flex cursor-pointer select-none list-none items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground [&::-webkit-details-marker]:hidden">
            <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />
            {changes.length === 1 ? "1 mudança" : `${changes.length} mudanças`}
          </summary>
          <div className="mt-2 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {changes.map((change) => (
              <ChangeCard key={change.key} change={change} />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

function RollActivity({ group }: { group: ActivityGroup }) {
  const eventsNewestFirst = group.events;
  const eventsChronological = [...group.events].reverse();
  const createEvent = eventsChronological.find((event) =>
    event.acao === "criado" &&
    ((group.rollType === "alyani" && event.entidade === "rolls_alyani") ||
      (group.rollType === "prestadora" && event.entidade === "rolls_prestadora")),
  );
  const creator = createEvent
    ? createEvent.usuario_nome || createEvent.usuario_email || "Sistema"
    : null;
  const latest = eventsNewestFirst[0];
  const rollLabel = group.rollType === "prestadora" ? "Roll Prestadora" : "Roll Alyani";
  const number = group.rollNumero || "sem número";

  return (
    <details className="group px-4 py-3">
      <summary className="grid cursor-pointer select-none list-none gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center [&::-webkit-details-marker]:hidden">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
            <div className="truncate text-sm font-semibold">
              {rollLabel} {number}
            </div>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 pl-6 text-xs text-muted-foreground">
            {creator && <span>Criado por {creator}</span>}
            {creator && <span aria-hidden="true">·</span>}
            <span>{group.events.length} {group.events.length === 1 ? "atividade" : "atividades"}</span>
            {latest && (
              <>
                <span aria-hidden="true">·</span>
                <span className="truncate">Última: {latest.descricao}</span>
              </>
            )}
          </div>
        </div>
        <div className="pl-6 text-xs tabular-nums text-muted-foreground sm:pl-0" title={formatDateTime(group.latestAt)}>
          {formatTime(group.latestAt)}
        </div>
      </summary>

      <div className="mt-3 space-y-3 border-t pt-3 pl-6">
        {eventsChronological.map((event) => (
          <EventRow key={event.id} row={event} />
        ))}
      </div>
    </details>
  );
}

function SingleActivity({ group }: { group: ActivityGroup }) {
  const row = group.events[0];
  const changes = changedFields(row);
  const user = row.usuario_nome || row.usuario_email || "Sistema";
  const actionMeta = ACTION_META[row.acao];

  return (
    <div className="px-4 py-3">
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium" title={row.descricao}>{row.descricao}</div>
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
        <div className="text-xs tabular-nums text-muted-foreground sm:pt-0.5">{formatTime(row.created_at)}</div>
      </div>

      {changes.length > 0 && (
        <details className="group mt-2.5">
          <summary className="inline-flex cursor-pointer select-none list-none items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground [&::-webkit-details-marker]:hidden">
            <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />
            {changes.length === 1 ? "1 mudança" : `${changes.length} mudanças`}
          </summary>
          <div className="mt-2.5 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {changes.map((change) => <ChangeCard key={change.key} change={change} />)}
          </div>
        </details>
      )}
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
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    refetchInterval: 10_000,
  });

  const allRows = query.data ?? [];

  const filteredRows = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");

    return allRows.filter((row) => {
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
        const rollRef = getRollRef(row);
        const haystack = [
          row.descricao,
          row.usuario_nome,
          row.usuario_email,
          ENTITY_LABELS[row.entidade] ?? row.entidade,
          rollRef?.numero,
        ]
          .filter(Boolean)
          .join(" ")
          .toLocaleLowerCase("pt-BR");
        if (!haystack.includes(term)) return false;
      }

      return true;
    });
  }, [action, allRows, dateEnd, dateStart, entity, search]);

  const rollNumbers = useMemo(() => {
    const numbers = new Map<string, string>();
    for (const row of allRows) {
      const ref = getRollRef(row);
      if (!ref?.numero) continue;
      numbers.set(`${ref.tipo}:${ref.id}`, ref.numero);
    }
    return numbers;
  }, [allRows]);

  const activityGroups = useMemo(() => {
    const groups = new Map<string, ActivityGroup>();

    for (const row of filteredRows) {
      const ref = getRollRef(row);
      if (!ref) {
        groups.set(`single:${row.id}`, {
          key: `single:${row.id}`,
          type: "single",
          events: [row],
          latestAt: row.created_at,
        });
        continue;
      }

      const key = `roll:${ref.tipo}:${ref.id}`;
      const existing = groups.get(key);
      if (existing) {
        existing.events.push(row);
        if (new Date(row.created_at).getTime() > new Date(existing.latestAt).getTime()) {
          existing.latestAt = row.created_at;
        }
        if (!existing.rollNumero && ref.numero) existing.rollNumero = ref.numero;
      } else {
        groups.set(key, {
          key,
          type: "roll",
          rollType: ref.tipo,
          rollId: ref.id,
          rollNumero: ref.numero ?? rollNumbers.get(`${ref.tipo}:${ref.id}`) ?? null,
          events: [row],
          latestAt: row.created_at,
        });
      }
    }

    return [...groups.values()]
      .map((group) => ({
        ...group,
        rollNumero: group.rollNumero ?? (group.rollType && group.rollId
          ? rollNumbers.get(`${group.rollType}:${group.rollId}`) ?? null
          : null),
        events: [...group.events].sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
        ),
      }))
      .sort((a, b) => new Date(b.latestAt).getTime() - new Date(a.latestAt).getTime());
  }, [filteredRows, rollNumbers]);

  const groupedActivities = useMemo(() => {
    const groups = new Map<string, ActivityGroup[]>();
    for (const activity of activityGroups) {
      const key = dateKey(activity.latestAt);
      const group = groups.get(key) ?? [];
      group.push(activity);
      groups.set(key, group);
    }
    return [...groups.entries()];
  }, [activityGroups]);

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
        description="Um registro por Roll. Clique no Roll para ver toda a atividade e as alterações dele."
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
            <Button variant="ghost" size="sm" onClick={clearFilters} className="shrink-0">Limpar</Button>
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
            {activityGroups.length} {activityGroups.length === 1 ? "registro" : "registros"}
            {filteredRows.length !== activityGroups.length && ` · ${filteredRows.length} eventos`}
          </div>
        </div>

        {query.isLoading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Carregando histórico...</div>
        ) : query.isError ? (
          <div className="p-8 text-center text-sm text-destructive">
            Não foi possível carregar o histórico. Verifique se a migration foi aplicada no Supabase.
          </div>
        ) : activityGroups.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Nenhuma alteração encontrada.</div>
        ) : (
          <div>
            {groupedActivities.map(([day, activities]) => (
              <section key={day} className="border-b last:border-b-0">
                <div className="bg-muted/35 px-4 py-2 text-xs font-medium capitalize text-muted-foreground">
                  {formatGroupDate(day)}
                </div>
                <div className="divide-y">
                  {activities.map((group) =>
                    group.type === "roll" ? (
                      <RollActivity key={group.key} group={group} />
                    ) : (
                      <SingleActivity key={group.key} group={group} />
                    ),
                  )}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
