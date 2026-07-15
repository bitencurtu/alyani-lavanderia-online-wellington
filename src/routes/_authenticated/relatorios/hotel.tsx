import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { brl, brlNumber, brDate, firstOfMonth, lastOfMonth } from "@/lib/format";
import { Printer, Download } from "lucide-react";
import { downloadAsPdf } from "@/lib/pdf-utils";

export const Route = createFileRoute("/_authenticated/relatorios/hotel")({
  head: () => ({ meta: [{ title: "Relatório por Hotel — Alyani" }] }),
  component: Page,
});

function Page() {
  const [hotelId, setHotelId] = useState("");
  const [dataInicio, setDataInicio] = useState(firstOfMonth());
  const [dataFim, setDataFim] = useState(lastOfMonth());

  const { data: hoteis = [] } = useQuery({
    queryKey: ["hoteis-lite"],
    queryFn: async () => (await supabase.from("hoteis").select("*").eq("status", "ativo").order("nome")).data ?? [],
  });

  const { data: precos = [] } = useQuery({
    queryKey: ["precos", hotelId],
    enabled: !!hotelId,
    queryFn: async () => {
      const { data } = await supabase.from("tabela_precos")
        .select("peca_id, valor_normal, valor_expresso, data_vigencia")
        .eq("hotel_id", hotelId)
        .eq("status", "ativo")
        .order("data_vigencia", { ascending: false });
      return (data ?? []) as any[];
    },
  });

  const { data: rolls = [] } = useQuery({
    queryKey: ["rel-hotel", hotelId, dataInicio, dataFim],
    enabled: !!hotelId,
    queryFn: async () => {
      const { data } = await supabase.from("rolls_alyani")
        .select("id, numero, data_roll, data_vencimento, nf_fat, expresso, rolls_alyani_itens(quantidade, expresso_item, pecas(id, nome))")
        .eq("hotel_id", hotelId)
        .gte("data_roll", dataInicio)
        .lte("data_roll", dataFim)
        .order("data_roll");
      return (data ?? []) as any[];
    },
  });

  const hotel = (hoteis as any[]).find((h) => h.id === hotelId);

  const precosPorPeca = useMemo(() => {
    const map = new Map<string, { valor_normal: number; valor_expresso: number }>();
    for (const p of precos) {
      if (!map.has(p.peca_id)) {
        map.set(p.peca_id, { valor_normal: Number(p.valor_normal), valor_expresso: Number(p.valor_expresso) });
      }
    }
    return map;
  }, [precos]);

  const rollsWithTotals = useMemo(() => {
    return rolls.map((r: any) => {
      let totalRoll = 0;
      for (const i of r.rolls_alyani_itens ?? []) {
        const pecaId = i.pecas?.id;
        const precoInfo = pecaId ? precosPorPeca.get(pecaId) : undefined;
        const isExpresso = i.expresso_item ?? r.expresso ?? false;
        const valorUnit = precoInfo ? (isExpresso ? precoInfo.valor_expresso : precoInfo.valor_normal) : 0;
        totalRoll += valorUnit * Number(i.quantidade);
      }
      return { ...r, totalReceitaCalculado: totalRoll };
    });
  }, [rolls, precosPorPeca]);

  const consolidado = useMemo(() => {
    // por peça
    const map = new Map<string, { nome: string; qtd: number; valor: number }>();
    for (const r of rolls) {
      for (const i of r.rolls_alyani_itens ?? []) {
        const nome = i.pecas?.nome ?? "—";
        const pecaId = i.pecas?.id;
        const precoInfo = pecaId ? precosPorPeca.get(pecaId) : undefined;
        const isExpresso = i.expresso_item ?? r.expresso ?? false;
        const valorUnit = precoInfo ? (isExpresso ? precoInfo.valor_expresso : precoInfo.valor_normal) : 0;
        const valorTotal = valorUnit * Number(i.quantidade);
        
        const cur = map.get(nome) ?? { nome, qtd: 0, valor: 0 };
        cur.qtd += Number(i.quantidade);
        cur.valor += valorTotal;
        map.set(nome, cur);
      }
    }
    const linhas = [...map.values()].sort((a, b) => a.nome.localeCompare(b.nome));
    const totalQtd = linhas.reduce((s, l) => s + l.qtd, 0);
    const totalValor = linhas.reduce((s, l) => s + l.valor, 0);
    return { linhas, totalQtd, totalValor };
  }, [rolls, precosPorPeca]);

  return (
    <>
      <div className="print:hidden">
        <PageHeader title="Relatório por Hotel" description="Consolidado do período no mesmo formato da planilha oficial."
          actions={
            <div className="flex gap-2">
              <Button size="sm" onClick={() => downloadAsPdf("report-hotel", `relatorio-hotel-${hotel?.nome || Date.now()}`)} disabled={!hotelId}>
                <Download className="h-4 w-4 mr-1" /> Baixar PDF
              </Button>
              <Button size="sm" onClick={() => window.print()} disabled={!hotelId}>
                <Printer className="h-4 w-4 mr-1" /> Imprimir
              </Button>
            </div>
          } />
        <div className="rounded-md border bg-card p-3 mb-4 flex flex-wrap items-end gap-3">
          <div className="min-w-[260px]">
            <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Hotel</Label>
            <Select value={hotelId} onValueChange={setHotelId}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Selecione um hotel…" /></SelectTrigger>
              <SelectContent>{(hoteis as any[]).map((h) => <SelectItem key={h.id} value={h.id}>{h.nome}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Data inicial</Label><Input type="date" className="h-9 w-[150px]" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} /></div>
          <div><Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Data final</Label><Input type="date" className="h-9 w-[150px]" value={dataFim} onChange={(e) => setDataFim(e.target.value)} /></div>
        </div>
      </div>

      {!hotelId ? (
        <div className="border rounded-md p-10 text-center text-muted-foreground bg-card text-sm">Selecione um hotel para gerar o relatório.</div>
      ) : (
        <div id="report-hotel" className="print-sheet mx-auto bg-white text-[11px] leading-tight text-black p-8 border shadow-sm" style={{ width: "210mm", minHeight: "297mm" }}>
          <header className="border-b-2 border-black pb-3 mb-4">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-lg font-bold tracking-wide">ALYANI LAVANDERIA</div>
                <div className="text-[10px] uppercase tracking-widest">Relatório de Consumo por Hotel</div>
              </div>
              <div className="text-right text-[10px]">
                <div><span className="uppercase text-black/60">Período:</span> {brDate(dataInicio)} — {brDate(dataFim)}</div>
                <div><span className="uppercase text-black/60">Emissão:</span> {brDate(new Date())}</div>
              </div>
            </div>
          </header>

          <section className="mb-4">
            <table className="w-full text-[11px] border-collapse">
              <tbody>
                <tr><td className="w-[110px] font-semibold uppercase text-black/70 py-0.5">Hotel</td><td className="py-0.5">{hotel?.nome}</td></tr>
                <tr><td className="font-semibold uppercase text-black/70 py-0.5">Razão social</td><td className="py-0.5">{hotel?.razao_social ?? "—"}</td></tr>
                <tr><td className="font-semibold uppercase text-black/70 py-0.5">CNPJ</td><td className="py-0.5">{hotel?.cnpj ?? "—"}</td></tr>
                <tr><td className="font-semibold uppercase text-black/70 py-0.5">Endereço</td><td className="py-0.5">{hotel?.endereco ?? "—"}</td></tr>
              </tbody>
            </table>
          </section>

          <section className="mb-4">
            <div className="bg-black text-white text-[10px] uppercase tracking-widest px-2 py-1">Notas / Rolls do período</div>
            <table className="w-full border-collapse border border-black text-[11px]">
              <thead className="bg-black/10">
                <tr>
                  <th className="border border-black px-2 py-1 text-left">Nº Roll</th>
                  <th className="border border-black px-2 py-1 text-left">Data</th>
                  <th className="border border-black px-2 py-1 text-left">NF / Fatura</th>
                  <th className="border border-black px-2 py-1 text-left">Vencimento</th>
                  <th className="border border-black px-2 py-1 text-right">Valor</th>
                </tr>
              </thead>
              <tbody>
                {rollsWithTotals.map((r: any) => (
                  <tr key={r.id}>
                    <td className="border border-black px-2 py-1 font-mono">{r.numero}</td>
                    <td className="border border-black px-2 py-1">{brDate(r.data_roll)}</td>
                    <td className="border border-black px-2 py-1">{r.nf_fat ?? "—"}</td>
                    <td className="border border-black px-2 py-1">{brDate(r.data_vencimento)}</td>
                    <td className="border border-black px-2 py-1 text-right font-mono">{brl(r.totalReceitaCalculado)}</td>
                  </tr>
                ))}
                <tr className="font-semibold bg-black/5">
                  <td className="border border-black px-2 py-1" colSpan={4}>TOTAL DE NOTAS</td>
                  <td className="border border-black px-2 py-1 text-right font-mono">{brl(consolidado.totalValor)}</td>
                </tr>
              </tbody>
            </table>
          </section>

          <section className="mb-4">
            <div className="bg-black text-white text-[10px] uppercase tracking-widest px-2 py-1">Consolidado por peça</div>
            <table className="w-full border-collapse border border-black text-[11px]">
              <thead className="bg-black/10">
                <tr>
                  <th className="border border-black px-2 py-1 text-left">Peça</th>
                  <th className="border border-black px-2 py-1 text-right w-24">Qtd</th>
                  <th className="border border-black px-2 py-1 text-right w-32">Valor Total</th>
                </tr>
              </thead>
              <tbody>
                {consolidado.linhas.map((l) => (
                  <tr key={l.nome}>
                    <td className="border border-black px-2 py-1">{l.nome}</td>
                    <td className="border border-black px-2 py-1 text-right font-mono">{brlNumber(l.qtd)}</td>
                    <td className="border border-black px-2 py-1 text-right font-mono">{brl(l.valor)}</td>
                  </tr>
                ))}
                <tr className="font-semibold bg-black/5">
                  <td className="border border-black px-2 py-1">TOTAL</td>
                  <td className="border border-black px-2 py-1 text-right font-mono">{brlNumber(consolidado.totalQtd)}</td>
                  <td className="border border-black px-2 py-1 text-right font-mono">{brl(consolidado.totalValor)}</td>
                </tr>
              </tbody>
            </table>
          </section>

          <footer className="mt-8 pt-3 border-t border-black text-[10px] text-black/60 flex items-center justify-between">
            <span>Alyani Lavanderia — documento gerado pelo sistema</span>
            <span>Página 1 de 1</span>
          </footer>
        </div>
      )}
    </>
  );
}