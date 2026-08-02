import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { jsPDF } from "jspdf";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/app/page-header";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { brl, firstOfMonth, lastOfMonth } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/relatorios/financeiro")({
  head: () => ({ meta: [{ title: "Relatório Financeiro — Alyani" }] }),
  component: Page,
});

type LancamentoDespesa = {
  id: string;
  data: string;
  fornecedor: string;
  descricao: string;
  tipo: string;
  valor: number;
};

function parseDateOnly(value: string | null | undefined) {
  if (!value) return null;
  const raw = String(value).trim();
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) {
    const [, year, month, day] = match;
    return new Date(Number(year), Number(month) - 1, Number(day));
  }

  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return null;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function formatDateForDisplay(value: string | null | undefined) {
  const date = parseDateOnly(value);
  return date ? date.toLocaleDateString("pt-BR") : "";
}

function toNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function getRollRevenue(roll: any) {
  const items = (roll?.rolls_alyani_itens ?? []) as any[];
  const itemTotal = items.reduce((sum, item) => {
    const quantidade = toNumber(item?.quantidade);
    const valorUnit = toNumber(item?.valor_unit);
    const valorTotal = toNumber(item?.valor_total);
    const calculatedValue = valorTotal > 0 ? valorTotal : quantidade * valorUnit;
    return sum + calculatedValue;
  }, 0);

  return itemTotal > 0 ? itemTotal : toNumber(roll?.total_receita);
}

function getRollCost(roll: any) {
  const items = (roll?.rolls_alyani_itens ?? []) as any[];
  const itemTotal = items.reduce((sum, item) => {
    const quantidade = toNumber(item?.quantidade);
    const custoUnit = toNumber(item?.custo_unit);
    const custoTotal = toNumber(item?.custo_total);
    const calculatedValue = custoTotal > 0 ? custoTotal : quantidade * custoUnit;
    return sum + calculatedValue;
  }, 0);

  return itemTotal > 0 ? itemTotal : toNumber(roll?.total_custo);
}

const initialForm = {
  data: firstOfMonth(),
  fornecedor: "",
  descricao: "",
  tipo: "",
  valor: "",
};

function Page() {
  const [dataInicio, setDataInicio] = useState(firstOfMonth());
  const [dataFim, setDataFim] = useState(lastOfMonth());
  const [despesas, setDespesas] = useState<LancamentoDespesa[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const salvo = window.localStorage.getItem("relatorio-despesas-custos");
      return salvo ? JSON.parse(salvo) : [];
    } catch {
      return [];
    }
  });
  const [form, setForm] = useState(initialForm);
  const [editId, setEditId] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("relatorio-despesas-custos", JSON.stringify(despesas));
    }
  }, [despesas]);

  const { data: rolls = [] } = useQuery({
    queryKey: ["rel-financeiro", dataInicio, dataFim],
    queryFn: async () => (
      await supabase.from("rolls_alyani").select(
        "*,hoteis(*),prestadoras(*),rolls_alyani_itens(*)"
      ).gte("data_roll", dataInicio).lte("data_roll", dataFim).order("data_roll")
    ).data ?? [],
  });

  const despesasFiltradas = useMemo(() => {
    const start = parseDateOnly(dataInicio);
    const end = parseDateOnly(dataFim);

    return despesas.filter((item) => {
      const itemDate = parseDateOnly(item.data);
      return itemDate && start && end && itemDate >= start && itemDate <= end;
    });
  }, [despesas, dataInicio, dataFim]);

  const periodRolls = useMemo(() => {
    const start = parseDateOnly(dataInicio);
    const end = parseDateOnly(dataFim);

    return (rolls as any[]).filter((roll: any) => {
      const itemDate = parseDateOnly(roll.data_roll);
      return itemDate && start && end && itemDate >= start && itemDate <= end;
    });
  }, [rolls, dataInicio, dataFim]);

  const totalDespesas = useMemo(() => {
    return despesasFiltradas.reduce((acc, item) => acc + Number(item.valor ?? 0), 0);
  }, [despesasFiltradas]);

  const data = useMemo(() => {
    let receitaTotal = 0;
    let custoTotal = 0;
    let qtdPecas = 0;
    const porHotel = new Map<string, any>();
    const porPrestadora = new Map<string, any>();

    for (const roll of periodRolls) {
      const receita = getRollRevenue(roll);
      const custo = getRollCost(roll);

      receitaTotal += receita;
      custoTotal += custo;

      for (const item of roll.rolls_alyani_itens ?? []) {
        qtdPecas += Number(item.quantidade ?? 0);
      }

      const hotelId = roll.hotel_id;
      if (!porHotel.has(hotelId)) {
        porHotel.set(hotelId, {
          nome: roll.hoteis?.nome ?? "—",
          receita: 0,
          custo: 0,
          qtdRolls: 0,
        });
      }
      const hTotal = porHotel.get(hotelId)!;
      hTotal.receita += receita;
      hTotal.custo += custo;
      hTotal.qtdRolls += 1;

      const prestId = roll.prestadora_id;
      if (!porPrestadora.has(prestId)) {
        porPrestadora.set(prestId, {
          nome: roll.prestadoras?.nome ?? "—",
          receita: 0,
          custo: 0,
          qtdRolls: 0,
        });
      }
      const pTotal = porPrestadora.get(prestId)!;
      pTotal.receita += receita;
      pTotal.custo += custo;
      pTotal.qtdRolls += 1;
    }

    const lucroTotal = receitaTotal - custoTotal - totalDespesas;
    const qtdRolls = periodRolls.length;

    return {
      receitaTotal,
      custoTotal: custoTotal + totalDespesas,
      lucroTotal,
      qtdPecas,
      qtdRolls,
      porHotel: Array.from(porHotel.values()),
      porPrestadora: Array.from(porPrestadora.values()),
    };
  }, [periodRolls, totalDespesas]);

  const itensDetalhados = useMemo(() => {
    const detalhes = [
      ...periodRolls.map((roll: any) => {
        const date = parseDateOnly(roll.data_roll);
        const descricao = `${roll.hoteis?.nome ?? "—"} • ${roll.prestadoras?.nome ?? "—"} • ROL ${String(date?.getDate() ?? "").padStart(2, "0")}/${String((date?.getMonth() ?? 0) + 1).padStart(2, "0")}/${date?.getFullYear() ?? ""}`;
        return {
          id: `roll-${roll.id}`,
          data: formatDateForDisplay(roll.data_roll),
          origem: "Custo do ROL",
          descricao,
          valor: getRollCost(roll),
        };
      }),
      ...despesasFiltradas.map((item) => ({
        id: `desp-${item.id}`,
        data: formatDateForDisplay(item.data),
        origem: item.tipo || "Despesa lançada",
        descricao: `${item.fornecedor} • ${item.descricao}`,
        valor: item.valor,
      })),
    ];

    return detalhes.sort((a, b) => {
      const aDate = parseDateOnly(a.data);
      const bDate = parseDateOnly(b.data);
      const aTime = aDate?.getTime() ?? 0;
      const bTime = bDate?.getTime() ?? 0;
      return aTime - bTime;
    });
  }, [periodRolls, despesasFiltradas]);

  const resetForm = () => {
    setEditId(null);
    setForm(initialForm);
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!form.data || !form.fornecedor || !form.descricao || !form.tipo || !form.valor) return;

    const payload: LancamentoDespesa = {
      id: editId ?? crypto.randomUUID(),
      data: form.data,
      fornecedor: form.fornecedor,
      descricao: form.descricao,
      tipo: form.tipo,
      valor: Number(form.valor),
    };

    if (editId) {
      setDespesas((prev) => prev.map((item) => (item.id === editId ? payload : item)));
    } else {
      setDespesas((prev) => [payload, ...prev]);
    }

    resetForm();
  };

  const handleEdit = (item: LancamentoDespesa) => {
    setEditId(item.id);
    setForm({
      data: item.data,
      fornecedor: item.fornecedor,
      descricao: item.descricao,
      tipo: item.tipo,
      valor: String(item.valor),
    });
  };

  const handleDelete = (id: string) => {
    setDespesas((prev) => prev.filter((item) => item.id !== id));
    if (editId === id) resetForm();
  };

  const handleExportPdf = () => {
    const doc = new jsPDF({ orientation: "p", unit: "mm", format: "a4" });
    const pdfPrimaryColor = [44, 74, 130];
    const pageWidth = 210;
    const pageHeight = 297;
    const marginLeft = 10;
    const marginRight = 10;
    const tableWidth = pageWidth - marginLeft - marginRight;
    const headerHeight = 8;
    const rowHeight = 6.5;
    const colWidths = [24, 28, 90, 28];
    const headers = ["DATA", "ORIGEM", "DESCRIÇÃO", "VALOR"];
    const rows = [
      ...periodRolls.map((roll: any) => {
        const date = parseDateOnly(roll.data_roll);
        const descricao = `${roll.hoteis?.nome ?? "—"} • ${roll.prestadoras?.nome ?? "—"} • ROL ${String(date?.getDate() ?? "").padStart(2, "0")}/${String((date?.getMonth() ?? 0) + 1).padStart(2, "0")}/${date?.getFullYear() ?? ""}`;
        return {
          date,
          values: [
            formatDateForDisplay(roll.data_roll),
            "Custo do ROL",
            descricao,
            brl(getRollCost(roll)),
          ],
        };
      }),
      ...despesasFiltradas.map((item) => ({
        date: parseDateOnly(item.data),
        values: [
          formatDateForDisplay(item.data),
          item.tipo || "Despesa lançada",
          `${item.fornecedor} • ${item.descricao}`,
          brl(item.valor),
        ],
      })),
    ].sort((a, b) => (a.date?.getTime() ?? 0) - (b.date?.getTime() ?? 0));

    const drawHeader = (y: number) => {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.2);
      let cursorX = marginLeft;
      headers.forEach((header, index) => {
        const width = colWidths[index];
        doc.rect(cursorX, y, width, headerHeight);
        doc.text(header, cursorX + width / 2, y + 4.5, { align: "center" });
        cursorX += width;
      });
    };

    const drawRow = (y: number, row: string[]) => {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(6.8);
      let cursorX = marginLeft;
      row.forEach((value, index) => {
        const width = colWidths[index];
        const textLines = doc.splitTextToSize(value, width - 2);
        const cellHeight = Math.max(rowHeight, textLines.length * 3.3);
        doc.rect(cursorX, y, width, cellHeight);
        const textY = y + 2.5 + (textLines.length > 1 ? 0 : 0);
        doc.text(textLines, cursorX + 1, textY);
        cursorX += width;
      });
    };

    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(pdfPrimaryColor[0], pdfPrimaryColor[1], pdfPrimaryColor[2]);
    doc.text("RELATÓRIO DE DESPESAS E CUSTOS", pageWidth / 2, 18, { align: "center" });

    const totalCosts = periodRolls.reduce((acc, roll) => acc + getRollCost(roll), 0) + totalDespesas;

    doc.setFillColor(pdfPrimaryColor[0], pdfPrimaryColor[1], pdfPrimaryColor[2]);
    doc.setTextColor(255, 255, 255);
    doc.roundedRect(pageWidth - 70, 22, 60, 16, 2, 2, "F");
    doc.setFontSize(9);
    doc.text("TOTAL GERAL", pageWidth - 40, 28, { align: "center" });
    doc.setFontSize(11);
    doc.text(brl(totalCosts), pageWidth - 40, 34, { align: "center" });
    doc.setTextColor(0, 0, 0);

    let currentY = 48;
    drawHeader(currentY);
    currentY += headerHeight;

    rows.forEach((row, index) => {
      if (currentY + rowHeight > pageHeight - 18) {
        doc.addPage();
        currentY = 18;
        drawHeader(currentY);
        currentY += headerHeight;
      }
      drawRow(currentY, row.values);
      currentY += Math.max(rowHeight, 7);
      if (index === rows.length - 1) {
        const summaryHeight = 8;
        if (currentY + summaryHeight > pageHeight - 12) {
          doc.addPage();
          currentY = 18;
        }
        doc.setFillColor(pdfPrimaryColor[0], pdfPrimaryColor[1], pdfPrimaryColor[2]);
        doc.setTextColor(255, 255, 255);
        doc.rect(marginLeft, currentY, tableWidth, summaryHeight, "F");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8);
        doc.text(`TOTAL GERAL: ${brl(totalCosts)}`, marginLeft + 2, currentY + 5);
        doc.setTextColor(0, 0, 0);
      }
    });

    doc.save(`relatorio-despesas-custos-${Date.now()}.pdf`);
  };

  return (
    <>
      <PageHeader
        title="Receita x Despesas/Custos"
        description="Resumo de receita total dos ROLs, custos totais e resultado final."
        actions={
          <Button size="sm" onClick={handleExportPdf}>Exportar PDF</Button>
        }
      />
      <div className="rounded-md border bg-card p-3 mb-4 flex flex-wrap items-end gap-3">
        <div>
          <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">
            Data inicial
          </Label>
          <Input type="date" className="h-9 w-[150px]" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} />
        </div>
        <div>
          <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">
            Data final
          </Label>
          <Input type="date" className="h-9 w-[150px]" value={dataFim} onChange={(e) => setDataFim(e.target.value)} />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="rounded-md border bg-card p-4">
          <div className="text-xs uppercase tracking-widest text-muted-foreground mb-1">Receita Total dos ROLs</div>
          <div className="text-2xl font-bold text-green-700">{brl(data.receitaTotal)}</div>
        </div>
        <div className="rounded-md border bg-card p-4">
          <div className="text-xs uppercase tracking-widest text-muted-foreground mb-1">Custos Totais</div>
          <div className="text-2xl font-bold text-red-700">{brl(data.custoTotal)}</div>
        </div>
        <div className="rounded-md border bg-card p-4">
          <div className="text-xs uppercase tracking-widest text-muted-foreground mb-1">Resultado Final</div>
          <div className="text-2xl font-bold text-emerald-700">{brl(data.lucroTotal)}</div>
        </div>
      </div>

      <div className="rounded-md border bg-card p-4 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div className="text-sm font-semibold">Detalhamento do período</div>
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
            {itensDetalhados.length} itens no período
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-[11px] uppercase text-muted-foreground border-b">
              <tr>
                <th className="text-left px-3 py-2 font-medium">Data</th>
                <th className="text-left px-3 py-2 font-medium">Origem</th>
                <th className="text-left px-3 py-2 font-medium">Descrição</th>
                <th className="text-right px-3 py-2 font-medium">Valor</th>
              </tr>
            </thead>
            <tbody>
              {itensDetalhados.map((item) => (
                <tr key={item.id} className="border-t">
                  <td className="px-3 py-2">{item.data}</td>
                  <td className="px-3 py-2">{item.origem}</td>
                  <td className="px-3 py-2">{item.descricao}</td>
                  <td className="px-3 py-2 text-right font-mono">{brl(item.valor)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-md border bg-card p-4 mb-6">
        <div className="text-sm font-semibold mb-4">Lançamentos de despesas</div>
        <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-3 mb-4">
          <div>
            <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Data</Label>
            <Input type="date" value={form.data} onChange={(e) => setForm((prev) => ({ ...prev, data: e.target.value }))} />
          </div>
          <div>
            <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Fornecedor</Label>
            <Input value={form.fornecedor} onChange={(e) => setForm((prev) => ({ ...prev, fornecedor: e.target.value }))} />
          </div>
          <div>
            <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Descrição</Label>
            <Input value={form.descricao} onChange={(e) => setForm((prev) => ({ ...prev, descricao: e.target.value }))} />
          </div>
          <div>
            <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Tipo de despesa</Label>
            <Input value={form.tipo} onChange={(e) => setForm((prev) => ({ ...prev, tipo: e.target.value }))} />
          </div>
          <div>
            <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Valor</Label>
            <Input type="number" step="0.01" value={form.valor} onChange={(e) => setForm((prev) => ({ ...prev, valor: e.target.value }))} />
          </div>
          <div className="md:col-span-2 lg:col-span-6 flex gap-2">
            <Button type="submit">{editId ? "Salvar alterações" : "Adicionar despesa"}</Button>
            {editId ? <Button type="button" variant="outline" onClick={resetForm}>Cancelar</Button> : null}
          </div>
        </form>

        <div className="rounded-md border p-3 mb-3">
          <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Total de despesas filtradas</div>
          <div className="text-xl font-semibold">{brl(totalDespesas)}</div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-[11px] uppercase text-muted-foreground border-b">
              <tr>
                <th className="text-left px-3 py-2 font-medium">Data</th>
                <th className="text-left px-3 py-2 font-medium">Fornecedor</th>
                <th className="text-left px-3 py-2 font-medium">Descrição</th>
                <th className="text-left px-3 py-2 font-medium">Tipo</th>
                <th className="text-right px-3 py-2 font-medium">Valor</th>
                <th className="text-right px-3 py-2 font-medium">Ações</th>
              </tr>
            </thead>
            <tbody>
              {despesasFiltradas.map((item) => (
                <tr key={item.id} className="border-t">
                  <td className="px-3 py-2">{new Date(item.data).toLocaleDateString("pt-BR")}</td>
                  <td className="px-3 py-2">{item.fornecedor}</td>
                  <td className="px-3 py-2">{item.descricao}</td>
                  <td className="px-3 py-2">{item.tipo}</td>
                  <td className="px-3 py-2 text-right font-mono">{brl(item.valor)}</td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex justify-end gap-2">
                      <Button type="button" size="sm" variant="outline" onClick={() => handleEdit(item)}>Editar</Button>
                      <Button type="button" size="sm" variant="outline" onClick={() => handleDelete(item.id)}>Excluir</Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
