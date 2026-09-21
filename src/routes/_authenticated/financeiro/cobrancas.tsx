import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  fetchActiveHoteis,
  fetchActivePrestadoras,
  HOTEIS_LITE_QUERY_KEY,
  PRESTADORAS_LITE_QUERY_KEY,
} from "@/lib/catalogos";
import { PageHeader } from "@/components/app/page-header";
import { FilterBar, type FilterState } from "@/components/app/filter-bar";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { brl, brDate, firstOfMonth, lastOfMonth } from "@/lib/format";
import {
  calculateCollectionTotals,
  COBRANCA_STATUS_CLASS,
  COBRANCA_STATUS_LABEL,
  percentageOfTotal,
  type CobrancaStatus,
} from "@/lib/financeiro";
import { toast } from "sonner";
import { jsPDF } from "jspdf";
import { Ban, CheckCircle2, CircleDollarSign, Clock3 } from "lucide-react";
import { sumMoneyValues } from "@/lib/calculos";


function getTodayForInput() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

export const Route = createFileRoute("/_authenticated/financeiro/cobrancas")({
  head: () => ({ meta: [{ title: "Cobranças — Alyani" }] }),
  component: Page,
});

function Page() {
  const qc = useQueryClient();
  const [filters, setFilters] = useState<FilterState>({
    dataInicio: firstOfMonth(),
    dataFim: lastOfMonth(),
  });
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [dataPagamentoLote, setDataPagamentoLote] = useState("");
  const [pagamentoDialogOpen, setPagamentoDialogOpen] = useState(false);

  const { data: hoteis = [] } = useQuery({
    queryKey: HOTEIS_LITE_QUERY_KEY,
    queryFn: fetchActiveHoteis,
  });

  const { data: prestadoras = [] } = useQuery({
    queryKey: PRESTADORAS_LITE_QUERY_KEY,
    queryFn: fetchActivePrestadoras,
  });

  const { data = [] } = useQuery({
    queryKey: ["cobrancas", filters],
    queryFn: async () => {
      let q = supabase
        .from("cobrancas")
        .select("*, hoteis(id,nome), rolls_alyani(numero, data_roll, prestadora_id, prestadoras(id,nome))")
        .order("created_at", { ascending: false });

      if (filters.hotelId) q = q.eq("hotel_id", filters.hotelId);
      if (filters.status) q = q.eq("status", filters.status as CobrancaStatus);

      const { data: result, error } = await q;
      if (error) throw error;

      return ((result ?? []) as any[]).filter((c) => {
        if (filters.prestadoraId && c.rolls_alyani?.prestadora_id !== filters.prestadoraId) return false;

        const rollDate = c.rolls_alyani?.data_roll as string | undefined;
        if (rollDate) {
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

  const totals = useMemo(() => calculateCollectionTotals(rows), [rows]);
  const activePercentage = (value: number) => percentageOfTotal(value, totals.total);
  const canceledPercentage = (value: number) => percentageOfTotal(value, totals.totalGeral);

  const invalidateFinanceiro = () => {
    qc.invalidateQueries({ queryKey: ["cobrancas"] });
    qc.invalidateQueries({ queryKey: ["rolls-fluxo"] });
    qc.invalidateQueries({ queryKey: ["rel-financeiro"] });
    qc.invalidateQueries({ queryKey: ["rel-hotel"] });
    qc.invalidateQueries({ queryKey: ["rel-prestadora"] });
    qc.invalidateQueries({ queryKey: ["rel-cliente"] });
  };

  const patch = useMutation({
    mutationFn: async ({ id, upd }: { id: string; upd: Record<string, unknown> }) => {
      const { error } = await supabase.from("cobrancas").update(upd as any).eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidateFinanceiro,
    onError: (e: any) => toast.error(e.message),
  });

  const patchSelected = useMutation({
    mutationFn: async ({
      status,
      dataPagamento,
    }: {
      status: CobrancaStatus;
      dataPagamento?: string;
    }) => {
      const ids = [...selectedIds];
      if (ids.length === 0) return;

      if (status === "pago" && !dataPagamento) {
        throw new Error("Escolha a data em que o pagamento foi feito.");
      }
      if (status === "pago" && dataPagamento && dataPagamento > getTodayForInput()) {
        throw new Error("A data do pagamento não pode estar no futuro.");
      }

      const updateData: Record<string, unknown> = { status };

      // A data do pagamento é sempre informada pelo usuário. Não usamos automaticamente
      // a data de hoje, pois o lançamento pode estar sendo feito depois do pagamento real.
      // Ao voltar para outro status, limpamos a data para não deixar um recebimento antigo
      // contaminando o relatório de Receita.
      updateData.data_pagamento = status === "pago" ? dataPagamento : null;

      const { error } = await supabase
        .from("cobrancas")
        .update(updateData as any)
        .in("id", ids);

      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      invalidateFinanceiro();
      setSelectedIds(new Set());
      if (variables.status === "pago") {
        setDataPagamentoLote("");
        setPagamentoDialogOpen(false);
      }
      toast.success(`${COBRANCA_STATUS_LABEL[variables.status]} aplicado aos Rolls selecionados.`);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const selectedRows = useMemo(
    () => rows.filter((row: any) => selectedIds.has(row.id)),
    [rows, selectedIds],
  );
  const selectedTotal = useMemo(
    () => sumMoneyValues(selectedRows.map((row: any) => row.valor)),
    [selectedRows],
  );
  const emAberto = totals.pendente + totals.atrasado;

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
    setDataPagamentoLote("");
    setPagamentoDialogOpen(false);
  };

  const handleExportPdf = () => {
    if (rows.length === 0) {
      toast.error("Nenhuma cobrança para exportar com os filtros atuais.");
      return;
    }

    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const pageWidth = 297;
    const pageHeight = 210;
    const marginX = 8;
    const bottomMargin = 10;
    const headerHeight = 7;
    const rowHeight = 7;
    const colWidths = [20, 43, 39, 25, 27, 26, 26, 31];
    const headers = ["ROLL", "CLIENTE", "PRESTADORA", "DATA ROLL", "VENCIMENTO", "VALOR", "STATUS", "PAGAMENTO"];

    const selectedHotel = (hoteis as any[]).find((h) => h.id === filters.hotelId)?.nome ?? "Todos";
    const selectedPrestadora = (prestadoras as any[]).find((p) => p.id === filters.prestadoraId)?.nome ?? "Todas";
    const selectedStatus = filters.status
      ? (COBRANCA_STATUS_LABEL[filters.status as CobrancaStatus] ?? filters.status)
      : "Todos";

    const percent = (value: number) => activePercentage(value).toFixed(2).replace(".", ",");
    const canceledPercent = canceledPercentage(totals.cancelado).toFixed(2).replace(".", ",");

    const drawPageHeader = () => {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(15);
      doc.text("Cobranças", marginX, 12);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.text(
        `Período do Roll: ${filters.dataInicio ? brDate(filters.dataInicio) : "-"} a ${filters.dataFim ? brDate(filters.dataFim) : "-"}`,
        marginX,
        18,
      );
      doc.text(
        `Cliente: ${selectedHotel}   |   Prestadora: ${selectedPrestadora}   |   Status: ${selectedStatus}`,
        marginX,
        23,
      );

      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.text(`Total ativo: ${brl(totals.total)}`, marginX, 30);
      doc.text(`Pendente: ${brl(totals.pendente)} (${percent(totals.pendente)}%)`, 58, 30);
      doc.text(`Pago: ${brl(totals.pago)} (${percent(totals.pago)}%)`, 115, 30);
      doc.text(`Atrasado: ${brl(totals.atrasado)} (${percent(totals.atrasado)}%)`, 168, 30);
      doc.text(`Cancelado: ${brl(totals.cancelado)} (${canceledPercent}%)`, 231, 30);
    };

    const drawTableHeader = (y: number) => {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(6.5);
      let x = marginX;
      headers.forEach((header, index) => {
        doc.rect(x, y, colWidths[index], headerHeight);
        doc.text(header, x + 1.2, y + 4.6);
        x += colWidths[index];
      });
    };

    const fitText = (value: string, width: number) => {
      const text = value || "-";
      doc.setFontSize(6.2);
      if (doc.getTextWidth(text) <= width - 2.5) return text;
      let shortened = text;
      while (shortened.length > 1 && doc.getTextWidth(`${shortened}…`) > width - 2.5) {
        shortened = shortened.slice(0, -1);
      }
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
        row.hoteis?.nome ?? "-",
        row.rolls_alyani?.prestadoras?.nome ?? "-",
        brDate(row.rolls_alyani?.data_roll),
        row.vencimento ? brDate(row.vencimento) : "-",
        brl(row.valor),
        COBRANCA_STATUS_LABEL[row.status as CobrancaStatus] ?? row.status ?? "-",
        row.data_pagamento ? brDate(row.data_pagamento) : "-",
      ];

      let x = marginX;
      values.forEach((value, index) => {
        doc.rect(x, y, colWidths[index], rowHeight);
        doc.setFontSize(6.2);
        if (index === 5) {
          doc.text(fitText(String(value), colWidths[index]), x + colWidths[index] - 1.2, y + 4.6, { align: "right" });
        } else {
          doc.text(fitText(String(value), colWidths[index]), x + 1.2, y + 4.6);
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
    doc.save(`cobrancas${statusPart}-${filters.dataInicio || "inicio"}-a-${filters.dataFim || "fim"}.pdf`);
  };

  return (
    <>
      <PageHeader
        title="Cobranças"
        description="Valores a receber dos clientes — gerados automaticamente a partir dos Rolls cobrados."
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
          <Select
            value={filters.hotelId ?? "__all"}
            onValueChange={(v) => setFilters((f) => ({ ...f, hotelId: v === "__all" ? undefined : v }))}
          >
            <SelectTrigger className="h-9 w-[200px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">Todos</SelectItem>
              {(hoteis as any[]).map((h) => <SelectItem key={h.id} value={h.id}>{h.nome}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Prestadora</Label>
          <Select
            value={filters.prestadoraId ?? "__all"}
            onValueChange={(v) => setFilters((f) => ({ ...f, prestadoraId: v === "__all" ? undefined : v }))}
          >
            <SelectTrigger className="h-9 w-[200px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">Todas</SelectItem>
              {(prestadoras as any[]).map((p) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Status</Label>
          <div className="flex h-9 overflow-hidden rounded-md border bg-background mt-1">
            {[
              { value: undefined, label: "Todos" },
              { value: "pendente", label: "Pendente" },
              { value: "pago", label: "Pago" },
              { value: "atrasado", label: "Atrasado" },
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

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 mb-4">
        <div className="rounded-lg border bg-card p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Total a receber</div>
              <div className="mt-1 text-2xl font-semibold">{brl(totals.total)}</div>
              <div className="mt-1 text-xs text-muted-foreground">Cobranças ativas no período filtrado.</div>
            </div>
            <div className="rounded-md bg-muted p-2 text-muted-foreground">
              <CircleDollarSign className="h-4 w-4" />
            </div>
          </div>
        </div>

        <div className="rounded-lg border bg-card p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Recebido</div>
              <div className="mt-1 text-2xl font-semibold text-success">{brl(totals.pago)}</div>
              <div className="mt-1 text-xs text-muted-foreground">
                {activePercentage(totals.pago).toFixed(2).replace(".", ",")}% do total ativo.
              </div>
            </div>
            <div className="rounded-md bg-muted p-2 text-success">
              <CheckCircle2 className="h-4 w-4" />
            </div>
          </div>
        </div>

        <div className="rounded-lg border bg-card p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Em aberto</div>
              <div className="mt-1 text-2xl font-semibold">{brl(emAberto)}</div>
              <div className="mt-1 text-xs text-muted-foreground">
                {brl(totals.pendente)} pendente · {brl(totals.atrasado)} atrasado
              </div>
            </div>
            <div className="rounded-md bg-muted p-2 text-warning">
              <Clock3 className="h-4 w-4" />
            </div>
          </div>
        </div>

        <div className="rounded-lg border bg-card p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Cancelado</div>
              <div className="mt-1 text-2xl font-semibold text-muted-foreground">{brl(totals.cancelado)}</div>
              <div className="mt-1 text-xs text-muted-foreground">
                {canceledPercentage(totals.cancelado).toFixed(2).replace(".", ",")}% do total geral.
              </div>
            </div>
            <div className="rounded-md bg-muted p-2 text-muted-foreground">
              <Ban className="h-4 w-4" />
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-lg border bg-card overflow-hidden">
        <div className="flex flex-col gap-3 border-b bg-muted/15 px-4 py-3 lg:flex-row lg:items-center">
          <div className="mr-auto min-w-0">
            <div className="text-sm font-medium">
              {selectedIds.size > 0
                ? `${selectedIds.size} cobrança${selectedIds.size > 1 ? "s" : ""} selecionada${selectedIds.size > 1 ? "s" : ""}`
                : "Cobranças do período"}
            </div>
            <div className="text-xs text-muted-foreground">
              {selectedIds.size > 0
                ? `${brl(selectedTotal)} selecionado${selectedIds.size > 1 ? "s" : ""}. As alterações também atualizam o Relatório de Receita.`
                : "Selecione uma ou mais cobranças para alterar o status em lote."}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              className="h-8"
              size="sm"
              variant="outline"
              disabled={!someVisibleSelected || patchSelected.isPending}
              onClick={() => patchSelected.mutate({ status: "pendente" })}
            >
              Pendente
            </Button>
            <Button
              className="h-8"
              size="sm"
              variant="outline"
              disabled={!someVisibleSelected || patchSelected.isPending}
              onClick={() => patchSelected.mutate({ status: "atrasado" })}
            >
              Atrasado
            </Button>
            <Button
              className="h-8"
              size="sm"
              variant="outline"
              disabled={!someVisibleSelected || patchSelected.isPending}
              onClick={() => patchSelected.mutate({ status: "cancelado" })}
            >
              Cancelado
            </Button>
            <Button
              className="h-8"
              size="sm"
              disabled={!someVisibleSelected || patchSelected.isPending}
              onClick={() => setPagamentoDialogOpen(true)}
            >
              Registrar pagamento
            </Button>
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
                <th className="text-left px-4 py-2 font-medium w-40">Vencimento</th>
                <th className="text-right px-4 py-2 font-medium">Valor</th>
                <th className="text-left px-4 py-2 font-medium w-36">Status</th>
                <th className="text-left px-4 py-2 font-medium w-40">Pagamento</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c: any) => (
                <tr key={c.id} className={`border-t ${selectedIds.has(c.id) ? "bg-muted/20" : ""}`}>
                  <td className="px-4 py-1.5">
                    <Checkbox
                      checked={selectedIds.has(c.id)}
                      onCheckedChange={(checked) => toggleRow(c.id, checked === true)}
                      aria-label={`Selecionar Roll ${c.rolls_alyani?.numero ?? ""}`}
                    />
                  </td>
                  <td className="px-4 py-1.5 font-mono">{c.rolls_alyani?.numero}</td>
                  <td className="px-4 py-1.5">{c.hoteis?.nome}</td>
                  <td className="px-4 py-1.5 text-muted-foreground">{c.rolls_alyani?.prestadoras?.nome ?? "—"}</td>
                  <td className="px-4 py-1.5">{brDate(c.rolls_alyani?.data_roll)}</td>
                  <td className="px-2 py-1">
                    <Input
                      type="date"
                      className="h-8"
                      value={c.vencimento ?? ""}
                      onChange={(e) => patch.mutate({ id: c.id, upd: { vencimento: e.target.value || null } })}
                    />
                  </td>
                  <td className="px-4 py-1.5 text-right font-mono">{brl(c.valor)}</td>
                  <td className="px-2 py-1">
                    <span className={`inline-flex h-8 items-center rounded-md border px-3 text-sm font-medium ${COBRANCA_STATUS_CLASS[c.status as CobrancaStatus] ?? ""}`}>
                      {COBRANCA_STATUS_LABEL[c.status as CobrancaStatus] ?? c.status}
                    </span>
                  </td>
                  <td className="px-2 py-1">
                    <Input
                      type="date"
                      className="h-8 min-w-[138px] bg-transparent"
                      max={getTodayForInput()}
                      value={c.status === "pago" ? (c.data_pagamento ?? "") : ""}
                      disabled={c.status !== "pago"}
                      title={c.status === "pago" ? "Data real em que o cliente pagou" : "Marque a cobrança como paga para informar a data"}
                      onChange={(e) => {
                        const value = e.target.value;
                        if (!value) {
                          toast.error("Uma cobrança paga precisa ter a data real do pagamento.");
                          return;
                        }
                        if (value > getTodayForInput()) {
                          toast.error("A data do pagamento não pode estar no futuro.");
                          return;
                        }
                        patch.mutate({ id: c.id, upd: { data_pagamento: value } });
                      }}
                    />
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-muted-foreground">Nenhuma cobrança no período.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog
        open={pagamentoDialogOpen}
        onOpenChange={(open) => {
          setPagamentoDialogOpen(open);
          if (!open) setDataPagamentoLote("");
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Registrar pagamento</DialogTitle>
            <DialogDescription>
              Informe a data real em que o cliente pagou. Ela será usada automaticamente no Relatório de Receita.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-md border bg-muted/20 p-3">
              <div className="text-sm font-medium">
                {selectedIds.size} cobrança{selectedIds.size > 1 ? "s" : ""} · {brl(selectedTotal)}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                Todas as cobranças selecionadas receberão a mesma data de pagamento.
              </div>
            </div>

            <div>
              <Label htmlFor="data-pagamento-lote">Data do pagamento</Label>
              <Input
                id="data-pagamento-lote"
                type="date"
                className="mt-1"
                max={getTodayForInput()}
                value={dataPagamentoLote}
                onChange={(e) => setDataPagamentoLote(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setPagamentoDialogOpen(false)}>
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={!dataPagamentoLote || patchSelected.isPending}
              onClick={() =>
                patchSelected.mutate({
                  status: "pago",
                  dataPagamento: dataPagamentoLote,
                })
              }
            >
              {patchSelected.isPending ? "Salvando..." : "Confirmar pagamento"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
