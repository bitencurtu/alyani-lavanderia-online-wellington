import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchActiveHoteis, fetchActivePrestadoras, HOTEIS_LITE_QUERY_KEY, PRESTADORAS_LITE_QUERY_KEY } from "@/lib/catalogos";
import { PageHeader } from "@/components/app/page-header";
import { FilterBar, type FilterState } from "@/components/app/filter-bar";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { brl, brDate, firstOfMonth, lastOfMonth } from "@/lib/format";
import { calculatePaymentTotals, PAGAMENTO_STATUS_CLASS, PAGAMENTO_STATUS_LABEL, percentageOfTotal, todayIsoDate, type PagamentoStatus } from "@/lib/financeiro";
import { toast } from "sonner";
import { jsPDF } from "jspdf";
import { invalidateFinanceiro } from "@/lib/query-cache";

export const Route = createFileRoute("/_authenticated/financeiro/pagamentos")({
  head: () => ({ meta: [{ title: "Pagamentos — Alyani" }] }),
  component: Page,
});

function Page() {
  const qc = useQueryClient();
  const [filters, setFilters] = useState<FilterState>({ dataInicio: firstOfMonth(), dataFim: lastOfMonth() });
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const { data: prestadoras = [] } = useQuery({
    queryKey: PRESTADORAS_LITE_QUERY_KEY,
    queryFn: fetchActivePrestadoras,
  });

  const { data: hoteis = [] } = useQuery({
    queryKey: HOTEIS_LITE_QUERY_KEY,
    queryFn: fetchActiveHoteis,
  });

  const { data = [] } = useQuery({
    queryKey: ["pagamentos", filters],
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

  const totals = useMemo(() => calculatePaymentTotals(rows), [rows]);

  const percentage = (value: number) => percentageOfTotal(value, totals.total);

  const patch = useMutation({
    mutationFn: async ({ id, upd }: { id: string; upd: any }) => {
      const { error } = await supabase.from("pagamentos").update(upd).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => invalidateFinanceiro(qc),
    onError: (e: any) => toast.error(e.message),
  });

  const patchSelected = useMutation({
    mutationFn: async (status: PagamentoStatus) => {
      const ids = [...selectedIds];
      if (ids.length === 0) return;

      // Atualiza todos os Rolls selecionados de uma vez, em vez de fazer
      // uma requisição separada para cada linha.
      const { error: statusError } = await supabase
        .from("pagamentos")
        .update({ status })
        .in("id", ids);

      if (statusError) throw statusError;

      // Ao marcar como pago, mantém datas já preenchidas e define a data
      // de hoje apenas nos pagamentos que ainda não possuem data.
      if (status === "pago") {
        const idsSemData = rows
          .filter((row: any) => selectedIds.has(row.id) && !row.data_pagamento)
          .map((row: any) => row.id);

        if (idsSemData.length > 0) {
          const today = todayIsoDate();
          const { error: dateError } = await supabase
            .from("pagamentos")
            .update({ data_pagamento: today })
            .in("id", idsSemData);

          if (dateError) throw dateError;
        }
      }
    },
    onSuccess: (_, status) => {
      void invalidateFinanceiro(qc);
      setSelectedIds(new Set());
      toast.success(`${PAGAMENTO_STATUS_LABEL[status]} aplicado aos Rolls selecionados.`);
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
    setSelectedIds(new Set());
  };

  const handleExportPdf = () => {
    if (rows.length === 0) {
      toast.error("Nenhum pagamento para exportar com os filtros atuais.");
      return;
    }

    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const pageWidth = 297;
    const pageHeight = 210;
    const marginX = 10;
    const bottomMargin = 10;
    const tableWidth = pageWidth - marginX * 2;
    const headerHeight = 7;
    const rowHeight = 7;
    const colWidths = [22, 54, 54, 27, 31, 30, 39];
    const headers = ["ROLL", "CLIENTE", "PRESTADORA", "DATA ROLL", "VALOR", "STATUS", "PAGAMENTO"];

    const selectedHotel = (hoteis as any[]).find((h) => h.id === filters.hotelId)?.nome ?? "Todos";
    const selectedPrestadora = (prestadoras as any[]).find((p) => p.id === filters.prestadoraId)?.nome ?? "Todas";
    const selectedStatus = filters.status ? (PAGAMENTO_STATUS_LABEL[filters.status as PagamentoStatus] ?? filters.status) : "Todos";

    const drawPageHeader = () => {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(15);
      doc.text("Pagamentos", marginX, 12);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      const period = `Período do Roll: ${filters.dataInicio ? brDate(filters.dataInicio) : "-"} a ${filters.dataFim ? brDate(filters.dataFim) : "-"}`;
      doc.text(period, marginX, 18);
      doc.text(`Cliente: ${selectedHotel}   |   Prestadora: ${selectedPrestadora}   |   Status: ${selectedStatus}`, marginX, 23);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.5);
      doc.text(`Total: ${brl(totals.total)}`, marginX, 30);
      doc.text(`Pendente: ${brl(totals.pendente)} (${percentage(totals.pendente).toFixed(2).replace(".", ",")}%)`, 68, 30);
      doc.text(`Pago: ${brl(totals.pago)} (${percentage(totals.pago).toFixed(2).replace(".", ",")}%)`, 145, 30);
      doc.text(`Cancelado: ${brl(totals.cancelado)} (${percentage(totals.cancelado).toFixed(2).replace(".", ",")}%)`, 215, 30);
    };

    const drawTableHeader = (y: number) => {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7);
      let x = marginX;
      headers.forEach((header, index) => {
        doc.rect(x, y, colWidths[index], headerHeight);
        doc.text(header, x + 1.5, y + 4.6);
        x += colWidths[index];
      });
    };

    const fitText = (value: string, width: number) => {
      const text = value || "-";
      doc.setFontSize(6.5);
      if (doc.getTextWidth(text) <= width - 3) return text;
      let shortened = text;
      while (shortened.length > 1 && doc.getTextWidth(`${shortened}…`) > width - 3) shortened = shortened.slice(0, -1);
      return `${shortened}…`;
    };

    drawPageHeader();
    let y = 36;
    drawTableHeader(y);
    y += headerHeight;

    doc.setFont("helvetica", "normal");
    rows.forEach((row: any) => {
      if (y + rowHeight > pageHeight - bottomMargin) {
        doc.addPage();
        drawPageHeader();
        y = 36;
        drawTableHeader(y);
        y += headerHeight;
        doc.setFont("helvetica", "normal");
      }

      const values = [
        String(row.rolls_alyani?.numero ?? "-"),
        row.rolls_alyani?.hoteis?.nome ?? "-",
        row.prestadoras?.nome ?? "-",
        brDate(row.rolls_alyani?.data_roll),
        brl(row.valor),
        PAGAMENTO_STATUS_LABEL[row.status as PagamentoStatus] ?? row.status ?? "-",
        row.data_pagamento ? brDate(row.data_pagamento) : "-",
      ];

      let x = marginX;
      values.forEach((value, index) => {
        doc.rect(x, y, colWidths[index], rowHeight);
        doc.setFontSize(6.5);
        if (index === 4) {
          doc.text(fitText(String(value), colWidths[index]), x + colWidths[index] - 1.5, y + 4.6, { align: "right" });
        } else {
          doc.text(fitText(String(value), colWidths[index]), x + 1.5, y + 4.6);
        }
        x += colWidths[index];
      });
      y += rowHeight;
    });

    const pageCount = doc.getNumberOfPages();
    for (let page = 1; page <= pageCount; page += 1) {
      doc.setPage(page);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.text(`Página ${page} de ${pageCount}`, pageWidth - marginX, pageHeight - 5, { align: "right" });
    }

    const statusPart = filters.status ? `-${filters.status}` : "";
    doc.save(`pagamentos${statusPart}-${filters.dataInicio || "inicio"}-a-${filters.dataFim || "fim"}.pdf`);
  };

  return (
    <>
      <PageHeader
        title="Pagamentos"
        description="Valores devidos às prestadoras — gerados automaticamente a partir dos Rolls Alyani."
        actions={
          <Button size="sm" variant="outline" className="h-9" onClick={handleExportPdf}>
            Baixar PDF
          </Button>
        }
      />
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
          <div className="flex h-9 overflow-hidden rounded-md border bg-background mt-1">
            {[
              { value: undefined, label: "Todos" },
              { value: "pendente", label: "Pendente" },
              { value: "pago", label: "Pago" },
              { value: "cancelado", label: "Cancelado" },
            ].map((option, index) => {
              const active = filters.status === option.value || (!filters.status && option.value === undefined);
              return (
                <Button
                  key={option.label}
                  type="button"
                  size="sm"
                  variant={active ? "default" : "ghost"}
                  className={`h-9 rounded-none px-3 ${index > 0 ? "border-l" : ""}`}
                  onClick={() => setFilters((f) => ({ ...f, status: option.value }))}
                >
                  {option.label}
                </Button>
              );
            })}
          </div>
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
          <div className="flex flex-wrap items-center gap-2">
            <Button className="h-8" size="sm" variant="outline" disabled={!someVisibleSelected || patchSelected.isPending} onClick={() => patchSelected.mutate("pendente")}>Marcar pendente</Button>
            <Button className="h-8" size="sm" variant="outline" disabled={!someVisibleSelected || patchSelected.isPending} onClick={() => patchSelected.mutate("pago")}>Marcar pago</Button>
            <Button className="h-8" size="sm" variant="outline" disabled={!someVisibleSelected || patchSelected.isPending} onClick={() => patchSelected.mutate("cancelado")}>Marcar cancelado</Button>
          </div>
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
                    <span className={`inline-flex h-8 items-center rounded-md border px-3 text-sm font-medium ${PAGAMENTO_STATUS_CLASS[c.status as PagamentoStatus] ?? ""}`}>
                      {PAGAMENTO_STATUS_LABEL[c.status as PagamentoStatus] ?? c.status}
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
