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

export const Route = createFileRoute("/_authenticated/relatorios/prestadora")({
  head: () => ({ meta: [{ title: "Relatório por Prestadora — Alyani" }] }),
  component: Page,
});

function Page() {
  const [prestadoraId, setPrestadoraId] = useState("");
  const [dataInicio, setDataInicio] = useState(firstOfMonth());
  const [dataFim, setDataFim] = useState(lastOfMonth());

  const { data: prestadoras = [] } = useQuery({
    queryKey: ["prestadoras-lite"],
    queryFn: async () => (await supabase.from("prestadoras").select("*").eq("status", "ativo").order("nome")).data ?? [],
  });

  const { data: rolls = [] } = useQuery({
    queryKey: ["rel-prestadora", prestadoraId, dataInicio, dataFim],
    enabled: !!prestadoraId,
    queryFn: async () => {
      const { data } = await supabase.from("rolls_alyani")
        .select("id, numero, data_roll, total_custo, rolls_alyani_itens(quantidade, custo_total, pecas(nome))")
        .eq("prestadora_id", prestadoraId)
        .gte("data_roll", dataInicio)
        .lte("data_roll", dataFim)
        .order("data_roll");
      return (data ?? []) as any[];
    },
  });

  const prestadora = (prestadoras as any[]).find((p) => p.id === prestadoraId);

  const consolidado = useMemo(() => {
    const map = new Map<string, { nome: string; qtd: number; valor: number }>();
    for (const r of rolls) {
      for (const i of r.rolls_alyani_itens ?? []) {
        const nome = i.pecas?.nome ?? "—";
        const cur = map.get(nome) ?? { nome, qtd: 0, valor: 0 };
        cur.qtd += Number(i.quantidade); cur.valor += Number(i.custo_total);
        map.set(nome, cur);
      }
    }
    const linhas = [...map.values()].sort((a, b) => a.nome.localeCompare(b.nome));
    const totalQtd = linhas.reduce((s, l) => s + l.qtd, 0);
    const totalValor = linhas.reduce((s, l) => s + l.valor, 0);
    return { linhas, totalQtd, totalValor };
  }, [rolls]);

  return (
    <>
      <div className="print:hidden">
        <PageHeader title="Relatório por Prestadora" description="Consolidado do período no mesmo formato da planilha oficial."
          actions={
            <div className="flex gap-2">
              <Button size="sm" onClick={() => downloadAsPdf("report-prestadora", `relatorio-prestadora-${prestadora?.nome || Date.now()}`)} disabled={!prestadoraId}>
                <Download className="h-4 w-4 mr-1" /> Baixar PDF
              </Button>
              <Button size="sm" onClick={() => window.print()} disabled={!prestadoraId}>
                <Printer className="h-4 w-4 mr-1" /> Imprimir
              </Button>
            </div>
          } />
        <div className="rounded-md border bg-card p-3 mb-4 flex flex-wrap items-end gap-3">
          <div className="min-w-[260px]">
            <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Prestadora</Label>
            <Select value={prestadoraId} onValueChange={setPrestadoraId}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Selecione uma prestadora…" /></SelectTrigger>
              <SelectContent>{(prestadoras as any[]).map((p) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Data inicial</Label><Input type="date" className="h-9 w-[150px]" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} /></div>
          <div><Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Data final</Label><Input type="date" className="h-9 w-[150px]" value={dataFim} onChange={(e) => setDataFim(e.target.value)} /></div>
        </div>
      </div>

      {!prestadoraId ? (
        <div className="border rounded-md p-10 text-center text-muted-foreground bg-card text-sm">Selecione uma prestadora para gerar o relatório.</div>
      ) : (
        <div id="report-prestadora" className="print-sheet mx-auto bg-white text-[11px] leading-tight text-black p-8 border shadow-sm" style={{ width: "210mm", minHeight: "297mm" }}>
          <header className="border-b-2 border-black pb-3 mb-4">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-lg font-bold tracking-wide">ALYANI LAVANDERIA</div>
                <div className="text-[10px] uppercase tracking-widest">Relatório de Consumo por Prestadora</div>
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
                <tr><td className="w-[110px] font-semibold uppercase text-black/70 py-0.5">Prestadora</td><td className="py-0.5">{prestadora?.nome}</td></tr>
                <tr><td className="font-semibold uppercase text-black/70 py-0.5">Razão social</td><td className="py-0.5">{prestadora?.razao_social ?? "—"}</td></tr>
                <tr><td className="font-semibold uppercase text-black/70 py-0.5">CNPJ</td><td className="py-0.5">{prestadora?.cnpj ?? "—"}</td></tr>
                <tr><td className="font-semibold uppercase text-black/70 py-0.5">Endereço</td><td className="py-0.5">{prestadora?.endereco ?? "—"}</td></tr>
              </tbody>
            </table>
          </section>

          <section className="mb-4">
            <div className="bg-black text-white text-[10px] uppercase tracking-widest px-2 py-1">Rolls do período</div>
            <table className="w-full border-collapse border border-black text-[11px]">
              <thead className="bg-black/10">
                <tr>
                  <th className="border border-black px-2 py-1 text-left">Nº Roll</th>
                  <th className="border border-black px-2 py-1 text-left">Data</th>
                  <th className="border border-black px-2 py-1 text-right">Custo</th>
                </tr>
              </thead>
              <tbody>
                {rolls.map((r: any) => (
                  <tr key={r.id}>
                    <td className="border border-black px-2 py-1 font-mono">{r.numero}</td>
                    <td className="border border-black px-2 py-1">{brDate(r.data_roll)}</td>
                    <td className="border border-black px-2 py-1 text-right font-mono">{brl(r.total_custo)}</td>
                  </tr>
                ))}
                <tr className="font-semibold bg-black/5">
                  <td className="border border-black px-2 py-1" colSpan={2}>TOTAL DE ROLLS</td>
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
                  <th className="border border-black px-2 py-1 text-right w-32">Custo Total</th>
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
