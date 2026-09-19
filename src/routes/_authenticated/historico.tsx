import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, History, RefreshCw } from "lucide-react";
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

function userName(row: AuditLog) {
  return row.usuario_nome || row.usuario_email || "Sistema";
}

function userKey(row: AuditLog) {
  return row.usuario_id || row.usuario_email || row.usuario_nome || "__system__";
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

function formatTime(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function localDateKey(value: string) {
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
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

function itemName(log: AuditLog) {
  const match = log.descricao.match(/^Item\s+(.+?)\s+do\s+Roll\s+(?:Alyani|Prestadora)\s+/i);
  return match?.[1]?.trim() || "item";
}

function quantity(log: AuditLog, side: "before" | "after") {
  const source = side === "before" ? log.dados_anteriores : log.dados_novos;
  const value = source?.quantidade;
  return typeof value === "number" || (typeof value === "string" && value !== "")
    ? Number(value)
    : null;
}

function statusChange(log: AuditLog) {
  const before = log.dados_anteriores?.status;
  const after = log.dados_novos?.status;
  if (before === after || typeof after !== "string") return null;
  return {
    before: typeof before === "string" ? before : null,
    after,
  };
}

function sentenceForEvent(log: AuditLog, rollNumero?: string | null) {
  const user = userName(log);
  const number = rollNumero || numberFromDescription(log.descricao) || "-";

  if (log.entidade === "rolls_alyani") {
    if (log.acao === "criado") return `${user} criou o Roll Alyani ${number}.`;
    if (log.acao === "excluido") return `${user} excluiu o Roll Alyani ${number}.`;
    return `${user} alterou o Roll Alyani ${number}.`;
  }

  if (log.entidade === "rolls_prestadora") {
    if (log.acao === "criado") return `${user} criou o Roll Prestadora ${number}.`;
    if (log.acao === "excluido") return `${user} excluiu o Roll Prestadora ${number}.`;
    return `${user} alterou o Roll Prestadora ${number}.`;
  }

  if (log.entidade === "rolls_alyani_itens" || log.entidade === "rolls_prestadora_itens") {
    const name = itemName(log);
    const qtyBefore = quantity(log, "before");
    const qtyAfter = quantity(log, "after");

    if (log.acao === "criado") {
      const qty = qtyAfter && qtyAfter !== 1 ? `${qtyAfter}x ` : "";
      return `${user} adicionou ${qty}${name} ao Roll ${number}.`;
    }

    if (log.acao === "excluido") {
      return `${user} removeu ${name} do Roll ${number}.`;
    }

    if (qtyBefore !== null && qtyAfter !== null && qtyBefore !== qtyAfter) {
      return `${user} alterou a quantidade de ${name} no Roll ${number}: ${qtyBefore} → ${qtyAfter}.`;
    }

    return `${user} alterou ${name} no Roll ${number}.`;
  }

  if (log.entidade === "pagamentos") {
    const change = statusChange(log);
    if (change) return `${user} alterou o pagamento do Roll ${number} para ${change.after}.`;
    if (log.acao === "excluido") return `${user} excluiu o pagamento do Roll ${number}.`;
    return `${user} alterou o pagamento do Roll ${number}.`;
  }

  if (log.entidade === "cobrancas") {
    const change = statusChange(log);
    if (change) return `${user} alterou a cobrança do Roll ${number} para ${change.after}.`;
    if (log.acao === "excluido") return `${user} excluiu a cobrança do Roll ${number}.`;
    return `${user} alterou a cobrança do Roll ${number}.`;
  }

  const description = log.descricao.replace(/\.$/, "");
  return `${user}: ${description}.`;
}

function isAutomaticCreationNoise(log: AuditLog) {
  return log.acao === "criado" && (log.entidade === "pagamentos" || log.entidade === "cobrancas");
}

function initialCreationSummary(events: AuditLog[], rollType: RollRef["tipo"], rollNumero: string | null) {
  const rollEntity = rollType === "alyani" ? "rolls_alyani" : "rolls_prestadora";
  const itemEntity = rollType === "alyani" ? "rolls_alyani_itens" : "rolls_prestadora_itens";
  const chronological = [...events].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );
  const creation = chronological.find((event) => event.entidade === rollEntity && event.acao === "criado");
  if (!creation) return null;

  const createdAt = new Date(creation.created_at).getTime();
  const initialItems = chronological.filter((event) => {
    if (event.entidade !== itemEntity || event.acao !== "criado") return false;
    const diff = Math.abs(new Date(event.created_at).getTime() - createdAt);
    return diff <= 10_000;
  });

  const names = initialItems.map(itemName);
  const preview = names.slice(0, 3).join(", ");
  const extra = names.length > 3 ? ` +${names.length - 3}` : "";
  const itemsText = names.length > 0
    ? ` e adicionou ${names.length} ${names.length === 1 ? "item" : "itens"}${preview ? ` (${preview}${extra})` : ""}`
    : "";

  return {
    eventIds: new Set([creation.id, ...initialItems.map((event) => event.id)]),
    createdAt: creation.created_at,
    text: `${userName(creation)} criou o Roll ${rollNumero || "-"}${itemsText}.`,
  };
}

function RollActivity({ group }: { group: ActivityGroup }) {
  const number = group.rollNumero || "sem número";
  const label = group.rollType === "prestadora" ? "Roll Prestadora" : "Roll Alyani";
  const creationSummary = initialCreationSummary(group.events, group.rollType!, group.rollNumero ?? null);

  const timeline = [...group.events]
    .filter((event) => !isAutomaticCreationNoise(event))
    .filter((event) => !creationSummary?.eventIds.has(event.id))
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  const visibleCount = timeline.length + (creationSummary ? 1 : 0);
  const latestVisible = [...group.events]
    .filter((event) => !isAutomaticCreationNoise(event))
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];

  return (
    <details className="group border-b last:border-b-0">
      <summary className="grid cursor-pointer select-none list-none gap-2 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center [&::-webkit-details-marker]:hidden">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
            <span className="text-sm font-semibold">{label} {number}</span>
            <span className="text-xs text-muted-foreground">· {visibleCount} {visibleCount === 1 ? "ação" : "ações"}</span>
          </div>
          {latestVisible && (
            <div className="mt-1 truncate pl-6 text-xs text-muted-foreground">
              {sentenceForEvent(latestVisible, group.rollNumero)}
            </div>
          )}
        </div>
        <div className="pl-6 text-xs tabular-nums text-muted-foreground sm:pl-0">
          {formatDateTime(group.latestAt)}
        </div>
      </summary>

      <div className="space-y-0 border-t bg-muted/10 px-4 py-2 pl-10">
        {creationSummary && (
          <div className="grid gap-1 border-b py-2 last:border-b-0 sm:grid-cols-[70px_minmax(0,1fr)]">
            <span className="text-xs tabular-nums text-muted-foreground">{formatTime(creationSummary.createdAt)}</span>
            <span className="text-sm">{creationSummary.text}</span>
          </div>
        )}
        {timeline.map((event) => (
          <div key={event.id} className="grid gap-1 border-b py-2 last:border-b-0 sm:grid-cols-[70px_minmax(0,1fr)]">
            <span className="text-xs tabular-nums text-muted-foreground">{formatTime(event.created_at)}</span>
            <span className="text-sm">{sentenceForEvent(event, group.rollNumero)}</span>
          </div>
        ))}
      </div>
    </details>
  );
}

function SingleActivity({ group }: { group: ActivityGroup }) {
  const row = group.events[0];
  return (
    <div className="grid gap-1 border-b px-4 py-3 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
      <div className="text-sm">{sentenceForEvent(row)}</div>
      <div className="text-xs tabular-nums text-muted-foreground">{formatDateTime(row.created_at)}</div>
    </div>
  );
}

function Page() {
  const [selectedUser, setSelectedUser] = useState("todos");
  const [selectedRoll, setSelectedRoll] = useState("todos");
  const [selectedDate, setSelectedDate] = useState("");

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

  const rollNumbers = useMemo(() => {
    const numbers = new Map<string, string>();
    for (const row of allRows) {
      const ref = getRollRef(row);
      if (!ref?.numero) continue;
      numbers.set(`${ref.tipo}:${ref.id}`, ref.numero);
    }
    return numbers;
  }, [allRows]);

  const users = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of allRows) {
      map.set(userKey(row), userName(row));
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1], "pt-BR"));
  }, [allRows]);

  const rolls = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of allRows) {
      const ref = getRollRef(row);
      if (!ref) continue;
      const key = `${ref.tipo}:${ref.id}`;
      const numero = ref.numero ?? rollNumbers.get(key) ?? ref.id.slice(0, 8);
      const typeLabel = ref.tipo === "prestadora" ? "Prestadora" : "Alyani";
      map.set(key, `${typeLabel} ${numero}`);
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1], "pt-BR", { numeric: true }));
  }, [allRows, rollNumbers]);

  const filteredRows = useMemo(() => {
    return allRows.filter((row) => {
      if (selectedUser !== "todos" && userKey(row) !== selectedUser) return false;
      if (selectedDate && localDateKey(row.created_at) !== selectedDate) return false;

      if (selectedRoll !== "todos") {
        const ref = getRollRef(row);
        if (!ref || `${ref.tipo}:${ref.id}` !== selectedRoll) return false;
      }

      return true;
    });
  }, [allRows, selectedDate, selectedRoll, selectedUser]);

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

    return [...groups.values()].sort(
      (a, b) => new Date(b.latestAt).getTime() - new Date(a.latestAt).getTime(),
    );
  }, [filteredRows, rollNumbers]);

  const hasFilters = selectedUser !== "todos" || selectedRoll !== "todos" || Boolean(selectedDate);

  const clearFilters = () => {
    setSelectedUser("todos");
    setSelectedRoll("todos");
    setSelectedDate("");
  };

  return (
    <>
      <PageHeader
        title="Histórico"
        description="Veja quem fez cada alteração. Os Rolls ficam agrupados para não repetir informações."
        actions={
          <Button variant="outline" size="sm" onClick={() => query.refetch()} disabled={query.isFetching}>
            <RefreshCw className={`mr-1.5 h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
        }
      />

      <div className="mb-4 rounded-md border bg-card p-3">
        <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_180px_auto]">
          <Select value={selectedUser} onValueChange={setSelectedUser}>
            <SelectTrigger><SelectValue placeholder="Usuário" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os usuários</SelectItem>
              {users.map(([value, label]) => (
                <SelectItem key={value} value={value}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={selectedRoll} onValueChange={setSelectedRoll}>
            <SelectTrigger><SelectValue placeholder="Roll" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os Rolls</SelectItem>
              {rolls.map(([value, label]) => (
                <SelectItem key={value} value={value}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            aria-label="Data"
            title="Data"
          />

          {hasFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters}>Limpar</Button>
          )}
        </div>
      </div>

      <div className="overflow-hidden rounded-md border bg-card">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <History className="h-4 w-4" />
            Alterações
          </div>
          <div className="text-xs text-muted-foreground">
            {activityGroups.length} {activityGroups.length === 1 ? "registro" : "registros"}
          </div>
        </div>

        {query.isLoading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Carregando histórico...</div>
        ) : query.isError ? (
          <div className="p-8 text-center text-sm text-destructive">
            Não foi possível carregar o histórico. Verifique se a migration do Histórico foi aplicada no Supabase.
          </div>
        ) : activityGroups.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Nenhuma alteração encontrada.</div>
        ) : (
          <div>
            {activityGroups.map((group) =>
              group.type === "roll" ? (
                <RollActivity key={group.key} group={group} />
              ) : (
                <SingleActivity key={group.key} group={group} />
              ),
            )}
          </div>
        )}
      </div>
    </>
  );
}
