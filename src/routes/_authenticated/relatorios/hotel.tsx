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
import { brl, brDate, firstOfMonth, lastOfMonth } from "@/lib/format";
import { Download } from "lucide-react";
import { downloadAsPdf } from "@/lib/pdf-utils";
import { toast } from "sonner";

const ALL_VALUE = "__all__";

export const Route = createFileRoute("/_authenticated/relatorios/hotel")({
  head: () => ({ meta: [{ title: "Relatório por Hotel — Alyani" }] }),
  component: Page,
});

function Page() {
  const [hotelId, setHotelId] = useState(ALL_VALUE);
  const [prestadoraId, setPrestadoraId] = useState(ALL_VALUE);
  const [dataInicio, setDataInicio] = useState(firstOfMonth());
  const [dataFim, setDataFim] = useState(lastOfMonth());
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);

  const { data: hoteis = [] } = useQuery({
    queryKey: HOTEIS_LITE_QUERY_KEY,
    queryFn: fetchActiveHoteis,
  });

  const { data: prestadoras = [] } = useQuery({
    queryKey: PRESTADORAS_LITE_QUERY_KEY,
    queryFn: fetchActivePrestadoras,
  });

  const { data: hotelDetalhes } = useQuery({
    queryKey: ["rel-hotel-detalhes", hotelId],
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

  const { data: prestadoraDetalhes } = useQuery({
    queryKey: ["rel-hotel-prestadora-detalhes", prestadoraId],
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

  const { data: precos = [] } = useQuery({
    queryKey: ["rel-hotel-precos", hotelId],
    queryFn: async () => {
      let query = supabase
        .from("tabela_precos")
        .select("hotel_id, peca_id, valor_normal, valor_expresso, data_vigencia")
        .eq("status", "ativo")
        .order("data_vigencia", { ascending: false });

      if (hotelId !== ALL_VALUE) query = query.eq("hotel_id", hotelId);

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const { data: rolls = [] } = useQuery({
    queryKey: ["rel-hotel", hotelId, prestadoraId, dataInicio, dataFim],
    queryFn: async () => {
      let query = supabase
        .from("rolls_alyani")
        .select(
          "id, numero, data_roll, data_vencimento, nf_fat, expresso, total_receita, hotel_id, prestadora_id, hoteis(nome), prestadoras(nome), rolls_alyani_itens(quantidade, valor_total, valor_unit, pecas(id, nome))",
        )
        .gte("data_roll", dataInicio)
        .lte("data_roll", dataFim)
        .order("data_roll");

      if (hotelId !== ALL_VALUE) query = query.eq("hotel_id", hotelId);
      if (prestadoraId !== ALL_VALUE) query = query.eq("prestadora_id", prestadoraId);

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const hotel =
    hotelId === ALL_VALUE
      ? null
      : hotelDetalhes ?? (hoteis as any[]).find((h) => h.id === hotelId);
  const prestadora =
    prestadoraId === ALL_VALUE
      ? null
      : prestadoraDetalhes ?? (prestadoras as any[]).find((p) => p.id === prestadoraId);

  const precosPorPeca = useMemo(() => {
    const map = new Map<string, { valor_normal: number; valor_expresso: number }>();
    for (const p of precos) {
      const key = `${p.hotel_id}:${p.peca_id}`;
      if (!map.has(key)) {
        map.set(key, {
          valor_normal: Number(p.valor_normal ?? 0),
          valor_expresso: Number(p.valor_expresso ?? 0),
        });
      }
    }
    return map;
  }, [precos]);

  const rollsWithTotals = useMemo(() => {
    return rolls.map((r: any) => {
      let totalRoll = 0;
      const itensCalculados = (r.rolls_alyani_itens ?? []).map((i: any) => {
        const quantidade = Number(i.quantidade ?? 0);
        const valorTotalSalvo = Number(i.valor_total ?? 0);
        const valorUnitSalvo = Number(i.valor_unit ?? 0);
        const pecaId = i.pecas?.id;
        const precoInfo = pecaId
          ? precosPorPeca.get(`${r.hotel_id}:${pecaId}`)
          : undefined;
        const valorUnitTabela = precoInfo
          ? r.expresso
            ? precoInfo.valor_expresso
            : precoInfo.valor_normal
          : 0;
        const valorUnit = valorUnitSalvo > 0 ? valorUnitSalvo : valorUnitTabela;
        const valorCalculado = valorTotalSalvo > 0 ? valorTotalSalvo : valorUnit * quantidade;
        totalRoll += valorCalculado;
        return { ...i, valorCalculado };
      });

      return {
        ...r,
        rolls_alyani_itens: itensCalculados,
        totalReceitaCalculado: totalRoll,
      };
    });
  }, [rolls, precosPorPeca]);

  const consolidado = useMemo(() => {
    const map = new Map<string, { nome: string; qtd: number; valor: number }>();
    for (const r of rollsWithTotals) {
      for (const i of r.rolls_alyani_itens ?? []) {
        const nome = i.pecas?.nome ?? "—";
        const cur = map.get(nome) ?? { nome, qtd: 0, valor: 0 };
        cur.qtd += Number(i.quantidade ?? 0);
        cur.valor += Number(i.valorCalculado ?? 0);
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
      const hotelNome = hotel?.nome || "todos-hoteis";
      const prestadoraNome = prestadora?.nome || "todas-prestadoras";
      await downloadAsPdf(
        "report-hotel",
        `relatorio-hotel-${hotelNome}-${prestadoraNome}`,
      );
    } catch (error: any) {
      toast.error(error?.message || "Não foi possível gerar o PDF.");
    } finally {
      setIsDownloadingPdf(false);
    }
  };

  const mostrarColunaHotel = hotelId === ALL_VALUE;
  const mostrarColunaPrestadora = prestadoraId === ALL_VALUE;
  const colunasFixas = 4 + (mostrarColunaHotel ? 1 : 0) + (mostrarColunaPrestadora ? 1 : 0);

  return (
    <>
      <div className="print:hidden">
        <PageHeader
          title="Relatório por Hotel"
          description="Consulte um hotel específico ou uma visão geral, com filtro opcional por prestadora."
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

          <div className="min-w-[220px]">
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
        id="report-hotel"
        className="print-sheet mx-auto bg-white text-[11px] leading-tight text-black p-8 border shadow-sm"
        style={{ width: "210mm", minHeight: "297mm" }}
      >
        <header className="border-b-2 border-black pb-3 mb-4">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-lg font-bold tracking-wide">ALYANI LAVANDERIA</div>
              <div className="text-[10px] uppercase tracking-widest">
                Relatório de Consumo por Hotel
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
                <td className="w-[110px] font-semibold uppercase text-black/70 py-0.5">Hotel</td>
                <td className="py-0.5">{hotel?.nome ?? "TODOS"}</td>
              </tr>
              <tr>
                <td className="font-semibold uppercase text-black/70 py-0.5">Prestadora</td>
                <td className="py-0.5">{prestadora?.nome ?? "TODAS"}</td>
              </tr>
              {hotel && (
                <>
                  <tr>
                    <td className="font-semibold uppercase text-black/70 py-0.5">Razão social</td>
                    <td className="py-0.5">{hotel.razao_social ?? "—"}</td>
                  </tr>
                  <tr>
                    <td className="font-semibold uppercase text-black/70 py-0.5">CNPJ</td>
                    <td className="py-0.5">{hotel.cnpj ?? "—"}</td>
                  </tr>
                  <tr>
                    <td className="font-semibold uppercase text-black/70 py-0.5">Endereço</td>
                    <td className="py-0.5">{hotel.endereco ?? "—"}</td>
                  </tr>
                </>
              )}
            </tbody>
          </table>
        </section>

        <section className="mb-4">
          <div className="bg-black text-white text-[10px] uppercase tracking-widest px-2 py-1">
            Notas / Rolls do período
          </div>
          <table className="w-full border-collapse border border-black text-[11px]">
            <thead className="bg-black/10">
              <tr>
                <th className="border border-black px-2 py-1 text-left">Nº Roll</th>
                {mostrarColunaHotel && (
                  <th className="border border-black px-2 py-1 text-left">Hotel</th>
                )}
                {mostrarColunaPrestadora && (
                  <th className="border border-black px-2 py-1 text-left">Prestadora</th>
                )}
                <th className="border border-black px-2 py-1 text-left">Data</th>
                <th className="border border-black px-2 py-1 text-left">NF / Fatura</th>
                <th className="border border-black px-2 py-1 text-left">Vencimento</th>
                <th className="border border-black px-2 py-1 text-right">Valor</th>
              </tr>
            </thead>
            <tbody>
              {rollsWithTotals.length === 0 ? (
                <tr>
                  <td
                    className="border border-black px-2 py-4 text-center text-black/60"
                    colSpan={colunasFixas + 1}
                  >
                    Nenhum Roll encontrado para os filtros selecionados.
                  </td>
                </tr>
              ) : (
                rollsWithTotals.map((r: any) => (
                  <tr key={r.id}>
                    <td className="border border-black px-2 py-1 font-mono">{r.numero}</td>
                    {mostrarColunaHotel && (
                      <td className="border border-black px-2 py-1">{r.hoteis?.nome ?? "—"}</td>
                    )}
                    {mostrarColunaPrestadora && (
                      <td className="border border-black px-2 py-1">
                        {r.prestadoras?.nome ?? "—"}
                      </td>
                    )}
                    <td className="border border-black px-2 py-1">{brDate(r.data_roll)}</td>
                    <td className="border border-black px-2 py-1">{r.nf_fat ?? "—"}</td>
                    <td className="border border-black px-2 py-1">{brDate(r.data_vencimento)}</td>
                    <td className="border border-black px-2 py-1 text-right font-mono">
                      {brl(r.totalReceitaCalculado)}
                    </td>
                  </tr>
                ))
              )}
              <tr className="font-semibold bg-black/5">
                <td className="border border-black px-2 py-1" colSpan={colunasFixas}>
                  TOTAL DE NOTAS
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
                <th className="border border-black px-2 py-1 text-right w-32">Valor Total</th>
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
                      {Number(l.qtd ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}
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
                  {Number(consolidado.totalQtd ?? 0).toLocaleString("pt-BR", {
                    maximumFractionDigits: 0,
                  })}
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
