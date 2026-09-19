import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/app/page-header";
import { FilterBar, type FilterState } from "@/components/app/filter-bar";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { brl, brDate, firstOfMonth, lastOfMonth } from "@/lib/format";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/financeiro/pagamentos")({
  head: () => ({ meta: [{ title: "Pagamentos — Alyani" }] }),
  component: Page,
});

const statusColor: Record<string, string> = {
  pendente: "text-warning border-warning/30 bg-warning/10",
  pago: "text-success border-success/30 bg-success/10",
  cancelado: "text-muted-foreground border-muted-foreground/30 bg-muted/30",
};

const statusLabel: Record<string, string> = {
  pendente: "Pendente",
  pago: "Pago",
  cancelado: "Cancelado",
};

function Page() {
  const qc = useQueryClient();
  const [filters, setFilters] = useState<FilterState>({ dataInicio: firstOfMonth(), dataFim: lastOfMonth() });
  const [dataPagamentoInicio, setDataPagamentoInicio] = useState("");
  const [dataPagamentoFim, setDataPagamentoFim] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const { data: prestadoras = [] } = useQuery({
    queryKey: ["prestadoras-lite"],
    queryFn: async () => (await supabase.from("prestadoras").select("id,nome").eq("status", "ativo").order("nome")).data ?? [],
  });

  const { data: hoteis = [] } = useQuery({
    queryKey: ["hoteis-lite"],
    queryFn: async () => (await supabase.from("hoteis").select("id,nome").eq("status", "ativo").order("nome")).data ?? [],
  });

  const { data = [] } = useQuery({
    queryKey: ["pagamentos", filters, dataPagamentoInicio, dataPagamentoFim],
    queryFn: async () => {
      let q = supabase
        .from("pagamentos")
        .select("*, prestadoras(nome), rolls_alyani(numero, data_roll, hotel_id, hoteis(id,nome))")
        .order("created_at", { ascending: false });

      if (filters.prestadoraId) q = q.eq("prestadora_id", filters.prestadoraId);
      if (filters.status) q = q.eq("status", filters.status as any);

      const allData = ((await q).data ?? []) as any[];

      return allData.filter((p) => {
        if (filters.hotelId && p.rolls_alyani?.hotel_id !== filters.hotelId) return false;

        if (p.rolls_alyani?.data_roll) {
          const rollDate = p.rolls_alyani.data_roll as string;
          if (filters.dataInicio && rollDate < filters.dataInicio) return false;
          if (filters.dataFim && rollDate > filters.dataFim) return false;
        }

        if (dataPagamentoInicio || dataPagamentoFim) {
          if (!p.data_pagamento) return false;
          if (dataPagamentoInicio && p.data_pagamento < dataPagamentoInicio) return false;
          if (dataPagamentoFim && p.data_pagamento > dataPagamentoFim) return false;
        }

        return true;
      });
    },
  });

  const rows = useMemo(() => data, [data]);

  useEffect(() => {
    const visibleIds = new Set(rows.map((row: any) => row.id));
    setSelectedIds((current) => {
      const next = new Set([...current].filter((id) => visibleIds.has(id)));
      if (next.size === current.size && [...next].every((id) => current.has(id))) return current;
      return next;
    });
  }, [rows]);

  const totals = useMemo(
    () =>
      rows.reduce(
        (a: any, r: any) => ({
          total: a.total + Number(r.valor),
          pago: a.pago + (r.status === "pago" ? Number(r.valor) : 0),
          pendente: a.pendente + (r.status === "pendente" ? Number(r.valor) : 0),
          cancelado: a.cancelado + (r.status === "cancelado" ? Number(r.valor) : 0),
        }),
        { total: 0, pago: 0, pendente: 0, cancelado: 0 },
      ),
    [rows],
  );

  const percentage = (value: number) => (totals.total > 0 ? (value / totals.total) * 100 : 0);

  const invalidateFinanceiro = () => {
    qc.invalidateQueries({ queryKey: ["pagamentos"] });
    qc.invalidateQueries({ queryKey: ["rolls-fluxo"] });
    qc.invalidateQueries({ queryKey: ["rel-financeiro"] });
    qc.invalidateQueries({ queryKey: ["rel-hotel"] });
    qc.invalidateQueries({ queryKey: ["rel-prestadora"] });
    qc.invalidateQueries({ queryKey: ["rel-cliente"] });
  };

  const patch = useMutation({
    mutationFn: async ({ id, upd }: { id: string; upd: any }) => {
      const { error } = await supabase.from("pagamentos").update(upd).eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidateFinanceiro,
    onError: (e: any) => toast.error(e.message),
  });

  const patchSelected = useMutation({
    mutationFn: async (status: "pendente" | "pago" | "cancelado") => {
      const ids = [...selectedIds];
      if (ids.length === 0) return;

      const selectedRows = rows.filter((row: any) => selectedIds.has(row.id));
      const today = new Date().toISOString().slice(0, 10);

      for (const row of selectedRows) {
        const upd = {
          status,
          data_pagamento: status === "pago" && !row.data_pagamento ? today : row.data_pagamento,
        };
        const { error } = await supabase.from("pagamentos").update(upd).eq("id", row.id);
        if (error) throw error;
      }
    },
    onSuccess: (_, status) => {
      invalidateFinanceiro();
      setSelectedIds(new Set());
      toast.success(`${statusLabel[status]} aplicado aos Rolls selecionados.`);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const allVisibleSelected = rows.length > 0 && rows.every((row: any) => selectedIds.has(row.id));
  const someVisibleSelected = rows.some((row: any) => selectedIds.has(row.id));

  const toggleAll = (checked: boolean) => {
    setSelectedIds(checked ? new Set(rows.map((row: any) => row.id)) : new Set());
  };

  const toggleRow = (id: string, checked: boolean) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const clearFilters = () => {
    setFilters({ dataInicio: firstOfMonth(), dataFim: lastOfMonth() });
    setDataPagamentoInicio("");
    setDataPagamentoFim("");
    setSelectedIds(new Set());
  };

  return (
    <>
      <PageHeader title="Pagamentos" description="Valores devidos às prestadoras — gerados automaticamente a partir dos Rolls Alyani." />
      <FilterBar
        value={filters}
        onChange={(p) => setFilters((f) => ({ ...f, ...p }))}
        onClear={clearFilters}
        showBusca={false}
      >
        <div>
          <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Cliente</Label>
          <Select value={filters.hotelId ?? "__all"} onValueChange={(v) => setFilters((f) => ({ ...f, hotelId: v === "__all" ? undefined : v }))}>
            <SelectTrigger className="h-9 w-[200px]"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="__all">Todos</SelectItem>{(hoteis as any[]).map((h) => <SelectItem key={h.id} value={h.id}>{h.nome}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Prestadora</Label>
          <Select value={filters.prestadoraId ?? "__all"} onValueChange={(v) => setFilters((f) => ({ ...f, prestadoraId: v === "__all" ? undefined : v }))}>
            <SelectTrigger className="h-9 w-[200px]"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="__all">Todas</SelectItem>{(prestadoras as any[]).map((h) => <SelectItem key={h.id} value={h.id}>{h.nome}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Status</Label>
          <Select value={filters.status ?? "__all"} onValueChange={(v) => setFilters((f) => ({ ...f, status: v === "__all" ? undefined : v }))}>
            <SelectTrigger className="h-9 w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">Todos</SelectItem>
              <SelectItem value="pendente">Pendente</SelectItem>
              <SelectItem value="pago">Pago</SelectItem>
              <SelectItem value="cancelado">Cancelado</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Pagamento inicial</Label>
          <Input type="date" className="h-9 w-[150px]" value={dataPagamentoInicio} onChange={(e) => setDataPagamentoInicio(e.target.value)} />
        </div>
        <div>
          <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Pagamento final</Label>
          <Input type="date" className="h-9 w-[150px]" value={dataPagamentoFim} onChange={(e) => setDataPagamentoFim(e.target.value)} />
        </div>
      </FilterBar>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <div className="rounded-md border bg-card p-4">
          <div className="text-[11px] uppercase text-muted-foreground">Total</div>
          <div className="text-xl font-semibold mt-1">{brl(totals.total)}</div>
          <div className="text-xs text-muted-foreground mt-1">{totals.total > 0 ? "100,00%" : "0,00%"}</div>
        </div>
        <div className="rounded-md border bg-card p-4">
          <div className="text-[11px] uppercase text-muted-foreground">Pendente</div>
          <div className="text-xl font-semibold mt-1 text-warning">{brl(totals.pendente)}</div>
          <div className="text-xs text-muted-foreground mt-1">{percentage(totals.pendente).toFixed(2).replace(".", ",")}%</div>
        </div>
        <div className="rounded-md border bg-card p-4">
          <div className="text-[11px] uppercase text-muted-foreground">Pago</div>
          <div className="text-xl font-semibold mt-1 text-success">{brl(totals.pago)}</div>
          <div className="text-xs text-muted-foreground mt-1">{percentage(totals.pago).toFixed(2).replace(".", ",")}%</div>
        </div>
        <div className="rounded-md border bg-card p-4">
          <div className="text-[11px] uppercase text-muted-foreground">Cancelado</div>
          <div className="text-xl font-semibold mt-1 text-muted-foreground">{brl(totals.cancelado)}</div>
          <div className="text-xs text-muted-foreground mt-1">{percentage(totals.cancelado).toFixed(2).replace(".", ",")}%</div>
        </div>
      </div>

      <div className="rounded-md border bg-card overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b bg-muted/20 px-4 py-2">
          <span className="text-sm text-muted-foreground mr-auto">
            {selectedIds.size > 0 ? `${selectedIds.size} Roll${selectedIds.size > 1 ? "s" : ""} selecionado${selectedIds.size > 1 ? "s" : ""}` : "Selecione um ou mais Rolls para alterar o status"}
          </span>
          <Button size="sm" variant="outline" disabled={!someVisibleSelected || patchSelected.isPending} onClick={() => patchSelected.mutate("pendente")}>Marcar pendente</Button>
          <Button size="sm" variant="outline" disabled={!someVisibleSelected || patchSelected.isPending} onClick={() => patchSelected.mutate("pago")}>Marcar pago</Button>
          <Button size="sm" variant="outline" disabled={!someVisibleSelected || patchSelected.isPending} onClick={() => patchSelected.mutate("cancelado")}>Marcar cancelado</Button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-[11px] uppercase text-muted-foreground bg-muted/40">
              <tr>
                <th className="px-4 py-2 font-medium w-10">
                  <Checkbox
                    checked={allVisibleSelected ? true : someVisibleSelected ? "indeterminate" : false}
                    onCheckedChange={(checked) => toggleAll(checked === true)}
                    aria-label="Selecionar todos os Rolls visíveis"
                  />
                </th>
                <th className="text-left px-4 py-2 font-medium">Roll</th>
                <th className="text-left px-4 py-2 font-medium">Cliente</th>
                <th className="text-left px-4 py-2 font-medium">Prestadora</th>
                <th className="text-left px-4 py-2 font-medium">Data Roll</th>
                <th className="text-right px-4 py-2 font-medium">Valor</th>
                <th className="text-left px-4 py-2 font-medium w-40">Status</th>
                <th className="text-left px-4 py-2 font-medium w-40">Pagamento</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c: any) => (
                <tr key={c.id} className={`border-t ${selectedIds.has(c.id) ? "bg-muted/20" : ""}`}>
                  <td className="px-4 py-1.5">
                    <Checkbox checked={selectedIds.has(c.id)} onCheckedChange={(checked) => toggleRow(c.id, checked === true)} aria-label={`Selecionar Roll ${c.rolls_alyani?.numero ?? ""}`} />
                  </td>
                  <td className="px-4 py-1.5 font-mono">{c.rolls_alyani?.numero}</td>
                  <td className="px-4 py-1.5 text-muted-foreground">{c.rolls_alyani?.hoteis?.nome}</td>
                  <td className="px-4 py-1.5">{c.prestadoras?.nome}</td>
                  <td className="px-4 py-1.5">{brDate(c.rolls_alyani?.data_roll)}</td>
                  <td className="px-4 py-1.5 text-right font-mono">{brl(c.valor)}</td>
                  <td className="px-2 py-1">
                    <span className={`inline-flex h-8 items-center rounded-md border px-3 text-sm font-medium ${statusColor[c.status] ?? ""}`}>
                      {statusLabel[c.status] ?? c.status}
                    </span>
                  </td>
                  <td className="px-2 py-1">
                    <Input
                      type="date"
                      className="h-8"
                      value={c.data_pagamento ?? ""}
                      onChange={(e) => patch.mutate({ id: c.id, upd: { data_pagamento: e.target.value || null } })}
                    />
                  </td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={8} className="px-4 py-10 text-center text-muted-foreground">Nenhum pagamento no período.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
