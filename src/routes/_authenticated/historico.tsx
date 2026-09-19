import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { History, RefreshCw, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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

const ENTITY_LABELS: Record<string, string> = {
  rolls_alyani: "Roll Alyani",
  rolls_alyani_itens: "Itens Roll Alyani",
  rolls_prestadora: "Roll Prestadora",
  rolls_prestadora_itens: "Itens Roll Prestadora",
  pagamentos: "Pagamentos",
  cobrancas: "Cobranças",
  tabela_precos: "Preços",
  tabela_custos: "Custos",
  pecas: "Peças",
  hoteis: "Clientes",
  prestadoras: "Prestadoras",
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

const HIDDEN_DETAIL_FIELDS = new Set([
  "id",
  "created_by",
  "hotel_id",
  "prestadora_id",
  "peca_id",
  "roll_id",
]);

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "medium",
  }).format(new Date(value));
}

function formatValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Sim" : "Não";
  if (typeof value === "number") return String(value).replace(".", ",");
  return String(value);
}

function changedFields(log: AuditLog) {
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

function ActionBadge({ action }: { action: AuditLog["acao"] }) {
  if (action === "excluido") return <Badge variant="destructive">Excluído</Badge>;
  if (action === "criado") return <Badge className="bg-emerald-600 hover:bg-emerald-600">Criado</Badge>;
  return <Badge variant="secondary">Alterado</Badge>;
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
        title="Histórico de alterações"
        description="Veja quem alterou Rolls, pagamentos, cobranças, preços, custos e cadastros."
        actions={
          <Button variant="outline" size="sm" onClick={() => query.refetch()} disabled={query.isFetching}>
            <RefreshCw className={`h-4 w-4 mr-1.5 ${query.isFetching ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
        }
      />

      <div className="rounded-md border bg-card p-3 mb-4">
        <div className="grid gap-2 md:grid-cols-[minmax(220px,1fr)_190px_150px_150px_150px_auto] items-end">
          <div>
            <div className="text-xs text-muted-foreground mb-1">Buscar</div>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Roll, usuário, alteração..."
                className="pl-8"
              />
            </div>
          </div>

          <div>
            <div className="text-xs text-muted-foreground mb-1">Área</div>
            <Select value={entity} onValueChange={setEntity}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todas</SelectItem>
                {Object.entries(ENTITY_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <div className="text-xs text-muted-foreground mb-1">Ação</div>
            <Select value={action} onValueChange={setAction}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas</SelectItem>
                <SelectItem value="criado">Criado</SelectItem>
                <SelectItem value="alterado">Alterado</SelectItem>
                <SelectItem value="excluido">Excluído</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <div className="text-xs text-muted-foreground mb-1">De</div>
            <Input type="date" value={dateStart} onChange={(e) => setDateStart(e.target.value)} />
          </div>

          <div>
            <div className="text-xs text-muted-foreground mb-1">Até</div>
            <Input type="date" value={dateEnd} onChange={(e) => setDateEnd(e.target.value)} />
          </div>

          <Button variant="ghost" size="sm" onClick={clearFilters}>Limpar</Button>
        </div>
      </div>

      <div className="rounded-md border bg-card overflow-hidden">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <History className="h-4 w-4" />
            Alterações
          </div>
          <div className="text-xs text-muted-foreground">
            {rows.length} {rows.length === 1 ? "registro" : "registros"} exibidos
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
          <div className="divide-y">
            {rows.map((row) => {
              const changes = changedFields(row);
              const user = row.usuario_nome || row.usuario_email || "Sistema";

              return (
                <div key={row.id} className="px-4 py-3">
                  <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <ActionBadge action={row.acao} />
                        <span className="text-xs rounded-md border px-2 py-0.5 text-muted-foreground">
                          {ENTITY_LABELS[row.entidade] ?? row.entidade}
                        </span>
                        <span className="font-medium text-sm">{row.descricao}</span>
                      </div>
                      <div className="mt-1.5 text-xs text-muted-foreground">
                        por <span className="text-foreground/80">{user}</span>
                        {row.usuario_nome && row.usuario_email ? ` · ${row.usuario_email}` : ""}
                      </div>
                    </div>
                    <div className="shrink-0 text-xs text-muted-foreground lg:text-right">
                      {formatDateTime(row.created_at)}
                    </div>
                  </div>

                  {changes.length > 0 && (
                    <details className="mt-2 text-xs">
                      <summary className="cursor-pointer select-none text-muted-foreground hover:text-foreground">
                        Ver detalhes ({changes.length} {changes.length === 1 ? "campo" : "campos"})
                      </summary>
                      <div className="mt-2 overflow-x-auto rounded-md border bg-muted/20">
                        <table className="w-full min-w-[560px]">
                          <thead className="border-b bg-muted/40 text-muted-foreground">
                            <tr>
                              <th className="px-3 py-2 text-left font-medium">Campo</th>
                              <th className="px-3 py-2 text-left font-medium">Antes</th>
                              <th className="px-3 py-2 text-left font-medium">Depois</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            {changes.map((change) => (
                              <tr key={change.key}>
                                <td className="px-3 py-2 font-medium capitalize">{change.label}</td>
                                <td className="px-3 py-2 text-muted-foreground break-all">{formatValue(change.before)}</td>
                                <td className="px-3 py-2 break-all">{formatValue(change.after)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </details>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        A tela carrega as 1.000 alterações mais recentes. Registros do histórico não podem ser editados ou apagados pela interface.
      </p>
    </>
  );
}
