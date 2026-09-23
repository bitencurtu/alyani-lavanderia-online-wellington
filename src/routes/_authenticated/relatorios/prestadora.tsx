import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  fetchActiveHoteis,
  fetchActivePrestadoras,
  HOTEIS_LITE_QUERY_KEY,
  PRESTADORAS_LITE_QUERY_KEY,
} from "@/lib/catalogos";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { brl, brlNumber, brDate, firstOfMonth, lastOfMonth } from "@/lib/format";
import { Download } from "lucide-react";
import { downloadAsPdf } from "@/lib/pdf-utils";
import { toast } from "sonner";

const ALL_VALUE = "__all__";

export const Route = createFileRoute("/_authenticated/relatorios/prestadora")({
  head: () => ({ meta: [{ title: "Relatório por Prestadora — Alyani" }] }),
  component: Page,
});

function Page() {
  const [prestadoraId, setPrestadoraId] = useState(ALL_VALUE);
  const [hotelId, setHotelId] = useState(ALL_VALUE);
  const [dataInicio, setDataInicio] = useState(firstOfMonth());
  const [dataFim, setDataFim] = useState(lastOfMonth());
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);

  const { data: prestadoras = [] } = useQuery({
    queryKey: PRESTADORAS_LITE_QUERY_KEY,
    queryFn: fetchActivePrestadoras,
  });

  const { data: hoteis = [] } = useQuery({
    queryKey: HOTEIS_LITE_QUERY_KEY,
    queryFn: fetchActiveHoteis,
  });

  const { data: prestadoraDetalhes } = useQuery({
    queryKey: ["rel-prestadora-detalhes", prestadoraId],
    enabled: prestadoraId !== ALL_VALUE,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("prestadoras")
        .select("id,nome,razao_social,cnpj,endereco")
        .eq("id", prestadoraId)
        .single();
      if (error) throw error;
      return data as any;
    },
  });

  const { data: hotelDetalhes } = useQuery({
    queryKey: ["rel-prestadora-hotel-detalhes", hotelId],
    enabled: hotelId !== ALL_VALUE,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hoteis")
        .select("id,nome,razao_social,cnpj,endereco")
        .eq("id", hotelId)
        .single();
      if (error) throw error;
      return data as any;
    },
  });

  const { data: custos = [] } = useQuery({
    queryKey: ["rel-prestadora-custos", prestadoraId],
    queryFn: async () => {
      let query = supabase
        .from("tabela_custos")
        .select("prestadora_id, peca_id, valor, data_vigencia")
        .eq("status", "ativo")
        .order("data_vigencia", { ascending: false });

      if (prestadoraId !== ALL_VALUE) query = query.eq("prestadora_id", prestadoraId);

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const { data: rolls = [] } = useQuery({
    queryKey: ["rel-prestadora", prestadoraId, hotelId, dataInicio, dataFim],
    queryFn: async () => {
      let query = supabase
        .from("rolls_alyani")
        .select(
          "id, numero, data_roll, total_custo, hotel_id, prestadora_id, hoteis(nome), prestadoras(nome), rolls_alyani_itens(quantidade, custo_total, custo_unit, pecas(id, nome))",
        )
        .gte("data_roll", dataInicio)
        .lte("data_roll", dataFim)
        .order("data_roll");

      if (prestadoraId !== ALL_VALUE) query = query.eq("prestadora_id", prestadoraId);
      if (hotelId !== ALL_VALUE) query = query.eq("hotel_id", hotelId);

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const prestadora =
    prestadoraId === ALL_VALUE
      ? null
      : prestadoraDetalhes ?? (prestadoras as any[]).find((p) => p.id === prestadoraId);
  const hotel =
    hotelId === ALL_VALUE
      ? null
      : hotelDetalhes ?? (hoteis as any[]).find((h) => h.id === hotelId);

  const custosPorPeca = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of custos) {
      const key = `${c.prestadora_id}:${c.peca_id}`;
      if (!map.has(key)) map.set(key, Number(c.valor ?? 0));
    }
    return map;
  }, [custos]);

  const rollsWithTotals = useMemo(() => {
    return rolls.map((r: any) => {
      let totalCusto = 0;
      const itensCalculados = (r.rolls_alyani_itens ?? []).map((i: any) => {
        const quantidade = Number(i.quantidade ?? 0);
        const custoTotalSalvo = Number(i.custo_total ?? 0);
        const custoUnitSalvo = Number(i.custo_unit ?? 0);
        const pecaId = i.pecas?.id;
        const custoUnitTabela = pecaId
          ? Number(custosPorPeca.get(`${r.prestadora_id}:${pecaId}`) ?? 0)
          : 0;
        const custoUnit = custoUnitSalvo > 0 ? custoUnitSalvo : custoUnitTabela;
        const custoCalculado = custoTotalSalvo > 0 ? custoTotalSalvo : custoUnit * quantidade;
        totalCusto += custoCalculado;
        return { ...i, custoCalculado };
      });

      return {
        ...r,
        rolls_alyani_itens: itensCalculados,
        totalCustoCalculado: totalCusto,
      };
    });
  }, [rolls, custosPorPeca]);

  const consolidado = useMemo(() => {
    const map = new Map<string, { nome: string; qtd: number; valor: number }>();
    for (const r of rollsWithTotals) {
      for (const i of r.rolls_alyani_itens ?? []) {
        const nome = i.pecas?.nome ?? "—";
        const cur = map.get(nome) ?? { nome, qtd: 0, valor: 0 };
        cur.qtd += Number(i.quantidade ?? 0);
        cur.valor += Number(i.custoCalculado ?? 0);
        map.set(nome, cur);
      }
    }
    const linhas = [...map.values()].sort((a, b) => a.nome.localeCompare(b.nome));
    const totalQtd = linhas.reduce((s, l) => s + l.qtd, 0);
    const totalValor = linhas.reduce((s, l) => s + l.valor, 0);
    return { linhas, totalQtd, totalValor };
  }, [rollsWithTotals]);

  const handleDownloadPdf = async () => {
    if (isDownloadingPdf) return;

    setIsDownloadingPdf(true);
    try {
      const prestadoraNome = prestadora?.nome || "todas-prestadoras";
      const hotelNome = hotel?.nome || "todos-hoteis";
      await downloadAsPdf(
        "report-prestadora",
        `relatorio-prestadora-${prestadoraNome}-${hotelNome}`,
      );
    } catch (error: any) {
      toast.error(error?.message || "Não foi possível gerar o PDF.");
    } finally {
      setIsDownloadingPdf(false);
    }
  };

  const mostrarColunaPrestadora = prestadoraId === ALL_VALUE;
  const mostrarColunaHotel = hotelId === ALL_VALUE;
  const colunasAntesCusto = 2 + (mostrarColunaPrestadora ? 1 : 0) + (mostrarColunaHotel ? 1 : 0);

  return (
    <>
      <div className="print:hidden">
        <PageHeader
          title="Relatório por Prestadora"
          description="Consulte uma prestadora específica ou uma visão geral, com filtro opcional por hotel."
          actions={
            <Button size="sm" onClick={handleDownloadPdf} disabled={isDownloadingPdf}>
              <Download className="h-4 w-4 mr-1" />{" "}
              {isDownloadingPdf ? "Gerando PDF…" : "Baixar PDF"}
            </Button>
          }
        />

        <div className="rounded-md border bg-card p-3 mb-4 flex flex-wrap items-end gap-3">
          <div className="min-w-[260px]">
            <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Prestadora
            </Label>
            <Select value={prestadoraId} onValueChange={setPrestadoraId}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_VALUE}>Todas</SelectItem>
                {(prestadoras as any[]).map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="min-w-[260px]">
            <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Hotel
            </Label>
            <Select value={hotelId} onValueChange={setHotelId}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_VALUE}>Todos</SelectItem>
                {(hoteis as any[]).map((h) => (
                  <SelectItem key={h.id} value={h.id}>
                    {h.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Data inicial
            </Label>
            <Input
              type="date"
              className="h-9 w-[150px]"
              value={dataInicio}
              onChange={(e) => setDataInicio(e.target.value)}
            />
          </div>
          <div>
            <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Data final
            </Label>
            <Input
              type="date"
              className="h-9 w-[150px]"
              value={dataFim}
              onChange={(e) => setDataFim(e.target.value)}
            />
          </div>
        </div>
      </div>

      <div
        id="report-prestadora"
        className="print-sheet mx-auto bg-white text-[11px] leading-tight text-black p-8 border shadow-sm"
        style={{ width: "210mm", minHeight: "297mm" }}
      >
        <header className="border-b-2 border-black pb-3 mb-4">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-lg font-bold tracking-wide">ALYANI LAVANDERIA</div>
              <div className="text-[10px] uppercase tracking-widest">
                Relatório de Consumo por Prestadora
              </div>
            </div>
            <div className="text-right text-[10px]">
              <div>
                <span className="uppercase text-black/60">Período:</span> {brDate(dataInicio)} —{" "}
                {brDate(dataFim)}
              </div>
              <div>
                <span className="uppercase text-black/60">Emissão:</span> {brDate(new Date())}
              </div>
            </div>
          </div>
        </header>

        <section className="mb-4">
          <table className="w-full text-[11px] border-collapse">
            <tbody>
              <tr>
                <td className="w-[110px] font-semibold uppercase text-black/70 py-0.5">
                  Prestadora
                </td>
                <td className="py-0.5">{prestadora?.nome ?? "TODAS"}</td>
              </tr>
              <tr>
                <td className="font-semibold uppercase text-black/70 py-0.5">Hotel</td>
                <td className="py-0.5">{hotel?.nome ?? "TODOS"}</td>
              </tr>
              {prestadora && (
                <>
                  <tr>
                    <td className="font-semibold uppercase text-black/70 py-0.5">Razão social</td>
                    <td className="py-0.5">{prestadora.razao_social ?? "—"}</td>
                  </tr>
                  <tr>
                    <td className="font-semibold uppercase text-black/70 py-0.5">CNPJ</td>
                    <td className="py-0.5">{prestadora.cnpj ?? "—"}</td>
                  </tr>
                  <tr>
                    <td className="font-semibold uppercase text-black/70 py-0.5">Endereço</td>
                    <td className="py-0.5">{prestadora.endereco ?? "—"}</td>
                  </tr>
                </>
              )}
            </tbody>
          </table>
        </section>

        <section className="mb-4">
          <div className="bg-black text-white text-[10px] uppercase tracking-widest px-2 py-1">
            Rolls do período
          </div>
          <table className="w-full border-collapse border border-black text-[11px]">
            <thead className="bg-black/10">
              <tr>
                <th className="border border-black px-2 py-1 text-left">Nº Roll</th>
                {mostrarColunaPrestadora && (
                  <th className="border border-black px-2 py-1 text-left">Prestadora</th>
                )}
                {mostrarColunaHotel && (
                  <th className="border border-black px-2 py-1 text-left">Hotel</th>
                )}
                <th className="border border-black px-2 py-1 text-left">Data</th>
                <th className="border border-black px-2 py-1 text-right">Custo</th>
              </tr>
            </thead>
            <tbody>
              {rollsWithTotals.length === 0 ? (
                <tr>
                  <td
                    className="border border-black px-2 py-4 text-center text-black/60"
                    colSpan={colunasAntesCusto + 1}
                  >
                    Nenhum Roll encontrado para os filtros selecionados.
                  </td>
                </tr>
              ) : (
                rollsWithTotals.map((r: any) => (
                  <tr key={r.id}>
                    <td className="border border-black px-2 py-1 font-mono">{r.numero}</td>
                    {mostrarColunaPrestadora && (
                      <td className="border border-black px-2 py-1">
                        {r.prestadoras?.nome ?? "—"}
                      </td>
                    )}
                    {mostrarColunaHotel && (
                      <td className="border border-black px-2 py-1">{r.hoteis?.nome ?? "—"}</td>
                    )}
                    <td className="border border-black px-2 py-1">{brDate(r.data_roll)}</td>
                    <td className="border border-black px-2 py-1 text-right font-mono">
                      {brl(r.totalCustoCalculado)}
                    </td>
                  </tr>
                ))
              )}
              <tr className="font-semibold bg-black/5">
                <td className="border border-black px-2 py-1" colSpan={colunasAntesCusto}>
                  TOTAL DE ROLLS
                </td>
                <td className="border border-black px-2 py-1 text-right font-mono">
                  {brl(consolidado.totalValor)}
                </td>
              </tr>
            </tbody>
          </table>
        </section>

        <section className="mb-4">
          <div className="bg-black text-white text-[10px] uppercase tracking-widest px-2 py-1">
            Consolidado por peça
          </div>
          <table className="w-full border-collapse border border-black text-[11px]">
            <thead className="bg-black/10">
              <tr>
                <th className="border border-black px-2 py-1 text-left">Peça</th>
                <th className="border border-black px-2 py-1 text-right w-24">Qtd</th>
                <th className="border border-black px-2 py-1 text-right w-32">Custo Total</th>
              </tr>
            </thead>
            <tbody>
              {consolidado.linhas.length === 0 ? (
                <tr>
                  <td className="border border-black px-2 py-4 text-center text-black/60" colSpan={3}>
                    Nenhum item encontrado para os filtros selecionados.
                  </td>
                </tr>
              ) : (
                consolidado.linhas.map((l) => (
                  <tr key={l.nome}>
                    <td className="border border-black px-2 py-1">{l.nome}</td>
                    <td className="border border-black px-2 py-1 text-right font-mono">
                      {brlNumber(l.qtd)}
                    </td>
                    <td className="border border-black px-2 py-1 text-right font-mono">
                      {brl(l.valor)}
                    </td>
                  </tr>
                ))
              )}
              <tr className="font-semibold bg-black/5">
                <td className="border border-black px-2 py-1">TOTAL</td>
                <td className="border border-black px-2 py-1 text-right font-mono">
                  {brlNumber(consolidado.totalQtd)}
                </td>
                <td className="border border-black px-2 py-1 text-right font-mono">
                  {brl(consolidado.totalValor)}
                </td>
              </tr>
            </tbody>
          </table>
        </section>

        <footer className="mt-8 pt-3 border-t border-black text-[10px] text-black/60">
          <span>Alyani Lavanderia — documento gerado pelo sistema</span>
        </footer>
      </div>
    </>
  );
}
