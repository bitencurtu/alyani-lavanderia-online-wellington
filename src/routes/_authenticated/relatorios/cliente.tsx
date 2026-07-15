import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { brl, brDate, firstOfMonth, lastOfMonth } from "@/lib/format";
import { Printer, Download } from "lucide-react";
import { downloadAsPdf } from "@/lib/pdf-utils";

export const Route = createFileRoute("/_authenticated/relatorios/cliente")({
  head: () => ({ meta: [{ title: "Relatório Cliente — Alyani" }] }),
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
    queryKey: ["rel-cliente", hotelId, dataInicio, dataFim],
    enabled: !!hotelId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rolls_alyani")
        .select(
          "id, numero, data_roll, data_vencimento, nf_fat, expresso, " +
          "hoteis(nome, razao_social, cnpj, endereco, cep, inscricao), prestadoras(nome), " +
          "rolls_alyani_itens(quantidade, expresso_item, pecas(id, nome))"
        )
        .eq("hotel_id", hotelId)
        .gte("data_roll", dataInicio)
        .lte("data_roll", dataFim)
        .order("data_roll");
      if (error) throw error;
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

  // Build consolidated data
  const consolidated = useMemo(() => {
    const pecaMap = new Map<string, { id: string; nome: string; valorUnit: number; quantidades: Map<string, number> }>();

    // Collect all pecas and get correct valorUnit from precosPorPeca
    for (const roll of rolls) {
      for (const item of (roll.rolls_alyani_itens ?? []) as any[]) {
        const pecaId = item.pecas?.id;
        if (!pecaId) continue;
        if (!pecaMap.has(pecaId)) {
          const precoInfo = precosPorPeca.get(pecaId);
          const isExpresso = item.expresso_item ?? roll.expresso ?? false;
          const valorUnit = precoInfo ? (isExpresso ? precoInfo.valor_expresso : precoInfo.valor_normal) : 0;
          pecaMap.set(pecaId, {
            id: pecaId,
            nome: item.pecas.nome,
            valorUnit: valorUnit,
            quantidades: new Map(),
          });
        }
      }
    }

    // Fill quantities per roll
    for (const roll of rolls) {
      for (const item of (roll.rolls_alyani_itens ?? []) as any[]) {
        const pecaId = item.pecas?.id;
        if (!pecaId) continue;
        const peca = pecaMap.get(pecaId);
        if (peca) {
          peca.quantidades.set(roll.id, Number(item.quantidade ?? 0));
        }
      }
    }

    // Calculate totals
    const pecas = Array.from(pecaMap.values()).sort((a, b) => a.nome.localeCompare(b.nome));
    let totalGeralItens = 0;
    let totalGeralValor = 0;

    const pecasWithTotals = pecas.map((peca) => {
      let totalItens = 0;
      let totalValor = 0;
      for (const roll of rolls) {
        const qtd = peca.quantidades.get(roll.id) ?? 0;
        totalItens += qtd;
        totalValor += qtd * peca.valorUnit;
      }
      totalGeralItens += totalItens;
      totalGeralValor += totalValor;
      return { ...peca, totalItens, totalValor };
    });

    return {
      pecas: pecasWithTotals,
      totalGeralItens,
      totalGeralValor,
      totalGeral: totalGeralValor,
    };
  }, [rolls, precosPorPeca]);

  return (
    <>
      <div className="print:hidden">
        <PageHeader
          title="Relatório Cliente"
          description="Relatório completo para cliente em formato A4 horizontal."
          actions={
            <div className="flex gap-2">
              <Button size="sm" onClick={() => downloadAsPdf("report-cliente", `relatorio-cliente-${hotel?.nome || Date.now()}`, "landscape")} disabled={!hotelId}>
                <Download className="h-4 w-4 mr-1" /> Baixar PDF
              </Button>
              <Button size="sm" onClick={() => window.print()} disabled={!hotelId}>
                <Printer className="h-4 w-4 mr-1" /> Imprimir
              </Button>
            </div>
          }
        />
        <div className="rounded-md border bg-card p-3 mb-4 flex flex-wrap items-end gap-3">
          <div className="min-w-[260px]">
            <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Hotel</Label>
            <Select value={hotelId} onValueChange={setHotelId}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Selecione um hotel…" /></SelectTrigger>
              <SelectContent>
                {(hoteis as any[]).map((h) => (
                  <SelectItem key={h.id} value={h.id}>{h.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Data inicial</Label>
            <Input type="date" className="h-9 w-[150px]" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} />
          </div>
          <div>
            <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Data final</Label>
            <Input type="date" className="h-9 w-[150px]" value={dataFim} onChange={(e) => setDataFim(e.target.value)} />
          </div>
        </div>
      </div>

      {!hotelId ? (
        <div className="border rounded-md p-10 text-center text-muted-foreground bg-card text-sm">
          Selecione um hotel para gerar o relatório.
        </div>
      ) : (
        <div className="print-container">
          {/* A4 Landscape Print Sheet */}
          <div
            id="report-cliente"
            className="print-sheet mx-auto bg-white text-black"
            style={{
              width: "297mm",
              minHeight: "210mm",
              padding: "8mm",
              fontFamily: "Arial, Helvetica, sans-serif",
              fontSize: "8pt",
              boxSizing: "border-box",
            }}
          >
            {/* Cabeçalho */}
            <div className="flex justify-between mb-4 gap-4">
              {/* Lado Esquerdo: Tabela de Dados do Hotel */}
              <table className="border-collapse border border-black text-xs" style={{ borderSpacing: 0 }}>
                <tbody>
                  <tr>
                    <td className="border border-black px-1 py-0.5 font-medium">Razão Social</td>
                    <td className="border border-black px-1 py-0.5">{hotel?.razao_social || "—"}</td>
                  </tr>
                  <tr>
                    <td className="border border-black px-1 py-0.5 font-medium">Inscrição</td>
                    <td className="border border-black px-1 py-0.5">{hotel?.inscricao || "—"}</td>
                  </tr>
                  <tr>
                    <td className="border border-black px-1 py-0.5 font-medium">CNPJ</td>
                    <td className="border border-black px-1 py-0.5">{hotel?.cnpj || "—"}</td>
                  </tr>
                  <tr>
                    <td className="border border-black px-1 py-0.5 font-medium">Endereço</td>
                    <td className="border border-black px-1 py-0.5">{hotel?.endereco || "—"}</td>
                  </tr>
                  <tr>
                    <td className="border border-black px-1 py-0.5 font-medium">CEP</td>
                    <td className="border border-black px-1 py-0.5">{hotel?.cep || "—"}</td>
                  </tr>
                  <tr>
                    <td className="border border-black px-1 py-0.5 font-medium">Período</td>
                    <td className="border border-black px-1 py-0.5 text-blue-700">{brDate(dataInicio)} — {brDate(dataFim)}</td>
                  </tr>
                  <tr>
                    <td className="border border-black px-1 py-0.5 font-medium">Hotel</td>
                    <td className="border border-black px-1 py-0.5 text-red-600 font-bold">{hotel?.nome || "—"}</td>
                  </tr>
                </tbody>
              </table>

              {/* Lado Direito: Total Geral */}
              <div className="flex flex-col items-center justify-center text-center">
                <div className="text-lg font-bold">TOTAL</div>
                <div className="text-sm mt-1">R$</div>
                <div className="text-2xl font-bold mt-1">{brl(consolidated.totalGeral)}</div>
              </div>
            </div>

            {/* Tabela Principal */}
            <div className="overflow-x-auto">
              <table className="w-full border-collapse border border-black text-xs" style={{ borderSpacing: 0 }}>
                <thead style={{ backgroundColor: "#cfe8f7" }}>
                  <tr>
                    <th className="border border-black px-1 py-0.5 text-left" rowSpan={2}>PRODUTO</th>
                    <th className="border border-black px-1 py-0.5 text-right" rowSpan={2}>VALOR UNIT</th>
                    {rolls.map((roll: any) => (
                      <th className="border border-black px-1 py-0.5 text-center" key={roll.id}>
                        <div>ROL ALYANI</div>
                        <div>{roll.numero}</div>
                        <div className="text-[7pt]">{brDate(roll.data_roll)}</div>
                      </th>
                    ))}
                    <th className="border border-black px-1 py-0.5 text-center" rowSpan={2}>Total Soma de ITENS</th>
                    <th className="border border-black px-1 py-0.5 text-center" rowSpan={2}>Total Soma de VALOR TOTAL À RECEBER</th>
                  </tr>
                </thead>
                <tbody>
                  {consolidated.pecas.map((peca) => (
                    <tr key={peca.id}>
                      <td className="border border-black px-1 py-0.5">{peca.nome}</td>
                      <td className="border border-black px-1 py-0.5 text-right">{brl(peca.valorUnit)}</td>
                      {rolls.map((roll: any) => {
                        const qtd = peca.quantidades.get(roll.id) ?? 0;
                        return (
                          <td className="border border-black px-1 py-0.5 text-center" key={roll.id}>
                            {qtd > 0 ? qtd : ""}
                          </td>
                        );
                      })}
                      <td className="border border-black px-1 py-0.5 text-right">{peca.totalItens}</td>
                      <td className="border border-black px-1 py-0.5 text-right">{brl(peca.totalValor)}</td>
                    </tr>
                  ))}
                  {/* Rodapé Total Geral */}
                  <tr style={{ backgroundColor: "#cfe8f7" }}>
                    <td className="border border-black px-1 py-0.5 font-bold" colSpan={2}>Total Geral</td>
                    {rolls.map((roll: any) => (
                      <td className="border border-black px-1 py-0.5 text-right" key={roll.id}>
                        {roll.rolls_alyani_itens?.reduce((acc: number, item: any) => acc + Number(item.quantidade ?? 0), 0) || ""}
                      </td>
                    ))}
                    <td className="border border-black px-1 py-0.5 text-right font-bold">{consolidated.totalGeralItens}</td>
                    <td className="border border-black px-1 py-0.5 text-right font-bold">{brl(consolidated.totalGeralValor)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Print Styles */}
          <style>{`
            @media print {
              body {
                margin: 0;
                padding: 0;
                background-color: white;
              }
              .print-container {
                width: 100%;
              }
              .print-sheet {
                width: 297mm !important;
                height: 210mm !important;
                padding: 8mm !important;
                box-sizing: border-box;
                page-break-inside: avoid;
                page-break-after: always;
              }
              table {
                page-break-inside: avoid;
                font-size: 8pt !important;
              }
              thead {
                display: table-header-group;
              }
              .print-hidden {
                display: none;
              }
              @page {
                size: A4 landscape;
                margin: 0;
              }
            }
          `}</style>
        </div>
      )}
    </>
  );
}
