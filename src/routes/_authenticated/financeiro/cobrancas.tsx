import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/app/page-header";
import { FilterBar, type FilterState } from "@/components/app/filter-bar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { brl, brDate, firstOfMonth, lastOfMonth } from "@/lib/format";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/financeiro/cobrancas")({
  head: () => ({ meta: [{ title: "Cobranças — Alyani" }] }),
  component: Page,
});

const statusColor: Record<string, string> = {
  pendente: "text-warning", pago: "text-success", atrasado: "text-destructive", cancelado: "text-muted-foreground",
};

function Page() {
  const qc = useQueryClient();
  const [filters, setFilters] = useState<FilterState>({ dataInicio: firstOfMonth(), dataFim: lastOfMonth() });

  const { data: hoteis = [] } = useQuery({ queryKey: ["hoteis-lite"], queryFn: async () => (await supabase.from("hoteis").select("id,nome").eq("status", "ativo").order("nome")).data ?? [] });

  const { data = [] } = useQuery({
    queryKey: ["cobrancas", filters],
    queryFn: async () => {
      let q = supabase.from("cobrancas").select("*, hoteis(nome), rolls_alyani(numero, data_roll)").order("vencimento", { ascending: true });
      if (filters.dataInicio) q = q.gte("vencimento", filters.dataInicio);
      if (filters.dataFim) q = q.lte("vencimento", filters.dataFim);
      if (filters.hotelId) q = q.eq("hotel_id", filters.hotelId);
      if (filters.status) q = q.eq("status", filters.status as any);
      return ((await q).data ?? []) as any[];
    },
  });

  const rows = useMemo(() => {
    const q = (filters.q ?? "").toLowerCase().trim();
    return q ? data.filter((c: any) => [c.rolls_alyani?.numero, c.hoteis?.nome].some((v) => (v ?? "").toString().toLowerCase().includes(q))) : data;
  }, [data, filters.q]);

  const totals = useMemo(() => rows.reduce((a: any, r: any) => ({ total: a.total + Number(r.valor), pago: a.pago + (r.status === "pago" ? Number(r.valor) : 0), pendente: a.pendente + (r.status !== "pago" && r.status !== "cancelado" ? Number(r.valor) : 0) }), { total: 0, pago: 0, pendente: 0 }), [rows]);

  const patch = useMutation({
    mutationFn: async ({ id, upd }: { id: string; upd: any }) => {
      const { error } = await supabase.from("cobrancas").update(upd).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["cobrancas"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <>
      <PageHeader title="Cobranças" description="Geradas automaticamente ao lançar Rolls marcados como cobrados." />
      <FilterBar value={filters} onChange={(p) => setFilters((f) => ({ ...f, ...p }))} onClear={() => setFilters({ dataInicio: firstOfMonth(), dataFim: lastOfMonth() })}>
        <div>
          <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Hotel</Label>
          <Select value={filters.hotelId ?? "__all"} onValueChange={(v) => setFilters((f) => ({ ...f, hotelId: v === "__all" ? undefined : v }))}>
            <SelectTrigger className="h-9 w-[200px]"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="__all">Todos</SelectItem>{(hoteis as any[]).map((h) => <SelectItem key={h.id} value={h.id}>{h.nome}</SelectItem>)}</SelectContent>
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
              <SelectItem value="atrasado">Atrasado</SelectItem>
              <SelectItem value="cancelado">Cancelado</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </FilterBar>

      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="rounded-md border bg-card p-4"><div className="text-[11px] uppercase text-muted-foreground">Total</div><div className="text-xl font-semibold mt-1">{brl(totals.total)}</div></div>
        <div className="rounded-md border bg-card p-4"><div className="text-[11px] uppercase text-muted-foreground">Pendente</div><div className="text-xl font-semibold mt-1 text-warning">{brl(totals.pendente)}</div></div>
        <div className="rounded-md border bg-card p-4"><div className="text-[11px] uppercase text-muted-foreground">Pago</div><div className="text-xl font-semibold mt-1 text-success">{brl(totals.pago)}</div></div>
      </div>

      <div className="rounded-md border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="text-[11px] uppercase text-muted-foreground bg-muted/40">
            <tr>
              <th className="text-left px-4 py-2 font-medium">Roll</th>
              <th className="text-left px-4 py-2 font-medium">Hotel</th>
              <th className="text-left px-4 py-2 font-medium">Data Roll</th>
              <th className="text-left px-4 py-2 font-medium">Vencimento</th>
              <th className="text-right px-4 py-2 font-medium">Valor</th>
              <th className="text-left px-4 py-2 font-medium w-40">Status</th>
              <th className="text-left px-4 py-2 font-medium w-40">Pagamento</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c: any) => (
              <tr key={c.id} className="border-t">
                <td className="px-4 py-1.5 font-mono">{c.rolls_alyani?.numero}</td>
                <td className="px-4 py-1.5">{c.hoteis?.nome}</td>
                <td className="px-4 py-1.5">{brDate(c.rolls_alyani?.data_roll)}</td>
                <td className="px-4 py-1.5"><Input type="date" className="h-8" value={c.vencimento ?? ""} onChange={(e) => patch.mutate({ id: c.id, upd: { vencimento: e.target.value || null } })} /></td>
                <td className="px-4 py-1.5 text-right font-mono">{brl(c.valor)}</td>
                <td className="px-2 py-1">
                  <Select value={c.status} onValueChange={(v) => patch.mutate({ id: c.id, upd: { status: v, data_pagamento: v === "pago" && !c.data_pagamento ? new Date().toISOString().slice(0, 10) : c.data_pagamento } })}>
                    <SelectTrigger className={`h-8 ${statusColor[c.status]}`}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pendente">Pendente</SelectItem>
                      <SelectItem value="pago">Pago</SelectItem>
                      <SelectItem value="atrasado">Atrasado</SelectItem>
                      <SelectItem value="cancelado">Cancelado</SelectItem>
                    </SelectContent>
                  </Select>
                </td>
                <td className="px-2 py-1"><Input type="date" className="h-8" value={c.data_pagamento ?? ""} onChange={(e) => patch.mutate({ id: c.id, upd: { data_pagamento: e.target.value || null } })} /></td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">Nenhuma cobrança no período.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}