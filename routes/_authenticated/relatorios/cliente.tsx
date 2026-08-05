import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
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
import {
  buildClientReportConsolidation,
  buildClientReportPdfPages,
  getClientReportLinePageSummary,
  getClientReportPageTotals,
} from "@/lib/relatorio-cliente-calculos";
import { toast } from "sonner";

const quantityFormatter = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

function formatQuantity(value: number) {
  return quantityFormatter.format(value);
}

export const Route = createFileRoute("/_authenticated/relatorios/cliente")({
  head: () => ({ meta: [{ title: "Relatório Cliente — Alyani" }] }),
  component: Page,
});

function Page() {
  const [hotelId, setHotelId] = useState("");
  const [dataInicio, setDataInicio] = useState(firstOfMonth());
  const [dataFim, setDataFim] = useState(lastOfMonth());
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);

  const { data: hoteis = [] } = useQuery({
    queryKey: ["hoteis-lite"],
    queryFn: async () =>
      (await supabase.from("hoteis").select("*").eq("status", "ativo").order("nome")).data ?? [],
  });

  const { data: precos = [] } = useQuery({
    queryKey: ["precos", hotelId],
    enabled: !!hotelId,
    queryFn: async () => {
      const { data } = await supabase
        .from("tabela_precos")
        .select("peca_id, valor_normal, valor_expresso, data_vigencia")
        .eq("hotel_id", hotelId)
        .eq("status", "ativo")
        .order("data_vigencia", { ascending: false });
      return data ?? [];
    },
  });

  const { data: rolls = [] } = useQuery({
    queryKey: ["rel-cliente", hotelId, dataInicio, dataFim],
    enabled: !!hotelId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rolls_alyani")
        .select(
          "id, numero, data_roll, expresso, rolls_alyani_itens(id, peca_id, quantidade, valor_unit, valor_total, pecas(id, nome))",
        )
        .eq("hotel_id", hotelId)
        .gte("data_roll", dataInicio)
        .lte("data_roll", dataFim)
        .order("data_roll");
      if (error) throw error;
      return data ?? [];
    },
  });

  const hotel = hoteis.find((entry) => entry.id === hotelId);

  const precosPorPeca = useMemo(() => {
    const map = new Map<string, { valor_normal: number; valor_expresso: number }>();
    for (const p of precos) {
      if (!map.has(p.peca_id)) {
        map.set(p.peca_id, {
          valor_normal: Number(p.valor_normal),
          valor_expresso: Number(p.valor_expresso),
        });
      }
    }
    return map;
  }, [precos]);

  const consolidated = useMemo(
    () => buildClientReportConsolidation(rolls, precosPorPeca),
    [rolls, precosPorPeca],
  );

  const handleDownloadPdf = async () => {
    if (!hotelId || isDownloadingPdf) return;

    setIsDownloadingPdf(true);
    try {
      await downloadAsPdf(
        "report-cliente",
        `relatorio-cliente-${hotel?.nome || Date.now()}`,
        "landscape",
      );
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Não foi possível gerar o PDF.");
    } finally {
      setIsDownloadingPdf(false);
    }
  };

  const pdfPages = useMemo(() => {
    return buildClientReportPdfPages(rolls, consolidated.pecas);
  }, [rolls, consolidated.pecas]);

  const maximumRollsOnPage = Math.max(0, ...pdfPages.map((page) => page.rolls.length));
  const reportTableFontSize =
    maximumRollsOnPage > 10 ? "7pt" : maximumRollsOnPage > 7 ? "7.5pt" : "9pt";
  const useCompactPdfCells = maximumRollsOnPage > 10;

  return (
    <>
      <div className="print:hidden">
        <PageHeader
          title="Relatório Cliente"
          description="Relatório completo para cliente em formato A4 horizontal."
          actions={
            <Button size="sm" onClick={handleDownloadPdf} disabled={!hotelId || isDownloadingPdf}>
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
                <SelectValue placeholder="Selecione um hotel…" />
              </SelectTrigger>
              <SelectContent>
                {hoteis.map((h) => (
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

      {!hotelId ? (
        <div className="border rounded-md p-10 text-center text-muted-foreground bg-card text-sm">
          Selecione um hotel para gerar o relatório.
        </div>
      ) : (
        <div id="report-cliente" className="print-container">
          {pdfPages.map((page, pageIndex) => {
            const pageRolls = page.rolls;
            const pageRollIds = pageRolls.map((roll) => String(roll.id));
            const rollColumnWidth = pageRolls.length > 0 ? 51 / pageRolls.length : 51;
            const pageTotals = getClientReportPageTotals(consolidated, pageRollIds);
            const pageLineSummaries = new Map(
              page.items.map((peca) => [
                peca.id,
                getClientReportLinePageSummary(peca, pageRollIds),
              ]),
            );
            const pageHasVariablePrices = Array.from(pageLineSummaries.values()).some(
              (summary) => summary.precoVariavel,
            );

            return (
              <div
                key={`pdf-page-${pageIndex}`}
                data-pdf-page
                className={`pdf-export-page print-sheet mx-auto mb-4 bg-white text-black ${useCompactPdfCells ? "pdf-many-rolls" : ""}`}
                style={{
                  width: "289mm",
                  padding: "5mm",
                  fontFamily: "Arial, Helvetica, sans-serif",
                  fontSize: "9pt",
                  boxSizing: "border-box",
                }}
              >
                {page.showReportHeader && (
                  <div className="flex justify-between mb-4 gap-4">
                    <table
                      className="pdf-client-info border-collapse border border-black text-sm"
                      style={{ borderSpacing: 0 }}
                    >
                      <tbody>
                        <tr>
                          <td className="border border-black font-medium">Razão Social</td>
                          <td className="border border-black">{hotel?.razao_social || "—"}</td>
                        </tr>
                        <tr>
                          <td className="border border-black font-medium">Inscrição</td>
                          <td className="border border-black">{hotel?.inscricao || "—"}</td>
                        </tr>
                        <tr>
                          <td className="border border-black font-medium">CNPJ</td>
                          <td className="border border-black">{hotel?.cnpj || "—"}</td>
                        </tr>
                        <tr>
                          <td className="border border-black font-medium">Endereço</td>
                          <td className="border border-black">{hotel?.endereco || "—"}</td>
                        </tr>
                        <tr>
                          <td className="border border-black font-medium">CEP</td>
                          <td className="border border-black">{hotel?.cep || "—"}</td>
                        </tr>
                        <tr>
                          <td className="border border-black font-medium">Período</td>
                          <td className="border border-black text-blue-700">
                            {brDate(dataInicio)} — {brDate(dataFim)}
                          </td>
                        </tr>
                        <tr>
                          <td className="border border-black font-medium">Hotel</td>
                          <td className="border border-black text-red-600 font-bold">
                            {hotel?.nome || "—"}
                          </td>
                        </tr>
                      </tbody>
                    </table>

                    <div className="flex min-w-[180px] flex-col items-center justify-center text-center">
                      <div className="text-xl font-bold">TOTAL</div>
                      <div className="text-3xl font-bold mt-2">
                        {brlNumber(consolidated.totalGeral)}
                      </div>
                    </div>
                  </div>
                )}

                <div className="overflow-x-auto">
                  <table
                    className="pdf-client-main w-full border-collapse border border-black"
                    style={{
                      borderSpacing: 0,
                      tableLayout: "fixed",
                      fontSize: reportTableFontSize,
                    }}
                  >
                    <colgroup>
                      <col style={{ width: "18%" }} />
                      <col style={{ width: "11%" }} />
                      {pageRolls.map((roll) => (
                        <col key={roll.id} style={{ width: `${rollColumnWidth}%` }} />
                      ))}
                      <col style={{ width: "8%" }} />
                      <col style={{ width: "12%" }} />
                    </colgroup>
                    <thead style={{ backgroundColor: "#cfe8f7" }}>
                      <tr>
                        <th className="border border-black text-left">Item</th>
                        <th className="border border-black text-center">Valor unitário</th>
                        {pageRolls.map((roll) => {
                          const [day = "", month = "", year = ""] = brDate(roll.data_roll).split(
                            "/",
                          );
                          return (
                            <th
                              className="pdf-roll-cell border border-black text-center"
                              key={roll.id}
                            >
                              <div>ROL</div>
                              <div style={{ overflowWrap: "anywhere" }}>{roll.numero}</div>
                              <div style={{ fontSize: "0.86em" }}>
                                {day}/{month}
                              </div>
                              <div style={{ fontSize: "0.86em" }}>{year}</div>
                            </th>
                          );
                        })}
                        <th className="border border-black text-center">Total itens</th>
                        <th className="border border-black text-center">Total a pagar</th>
                      </tr>
                    </thead>
                    <tbody>
                      {page.items.map((peca) => {
                        const summary = pageLineSummaries.get(peca.id)!;

                        return (
                          <tr key={peca.id}>
                            <td
                              className="border border-black overflow-hidden"
                              style={{ overflowWrap: "anywhere" }}
                            >
                              {peca.nome}
                            </td>
                            <td className="border border-black text-center overflow-hidden whitespace-nowrap">
                              {summary.precosUnitarios.length === 0
                                ? "—"
                                : summary.precoVariavel
                                  ? summary.precosUnitarios.map((valor) => brl(valor)).join(" / ")
                                  : brl(summary.precoUnitario ?? 0)}
                            </td>
                            {pageRolls.map((roll) => {
                              const qtd = peca.quantidades.get(roll.id) ?? 0;
                              return (
                                <td
                                  className="pdf-roll-cell border border-black text-center overflow-hidden whitespace-nowrap"
                                  key={roll.id}
                                >
                                  {qtd > 0 ? formatQuantity(qtd) : ""}
                                </td>
                              );
                            })}
                            <td className="border border-black text-center overflow-hidden whitespace-nowrap">
                              {formatQuantity(summary.quantidade)}
                            </td>
                            <td className="border border-black text-center overflow-hidden whitespace-nowrap">
                              {brl(summary.valor)}
                            </td>
                          </tr>
                        );
                      })}
                      {page.showTableTotal && (
                        <tr className="font-bold" style={{ backgroundColor: "#cfe8f7" }}>
                          <td className="border border-black font-bold" colSpan={2}>
                            {pageRollIds.length === rolls.length
                              ? "Total geral"
                              : "Subtotal dos rolls"}
                          </td>
                          {pageRolls.map((roll) => (
                            <td
                              className="pdf-roll-cell border border-black text-center overflow-hidden whitespace-nowrap"
                              key={roll.id}
                            >
                              {consolidated.totaisPorRoll.get(String(roll.id))?.quantidade
                                ? formatQuantity(
                                    consolidated.totaisPorRoll.get(String(roll.id))!.quantidade,
                                  )
                                : ""}
                            </td>
                          ))}
                          <td className="border border-black text-center font-bold overflow-hidden whitespace-nowrap">
                            {formatQuantity(pageTotals.quantidade)}
                          </td>
                          <td className="border border-black text-center font-bold overflow-hidden whitespace-nowrap">
                            {brl(pageTotals.valor)}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                {pageHasVariablePrices && (
                  <div className="mt-2 text-center text-[7pt] text-black/70">
                    “Variável” indica que a peça teve mais de um preço unitário nos rolls desta
                    página.
                  </div>
                )}
              </div>
            );
          })}

          {/* Print Styles */}
          <style>{`
            #report-cliente .pdf-client-info td {
              padding: 2px 12px 10px !important;
              line-height: 1.45 !important;
              text-align: center !important;
              vertical-align: middle !important;
            }
            #report-cliente .pdf-client-main th,
            #report-cliente .pdf-client-main td {
              padding: 4px 10px 10px !important;
              line-height: 1.4 !important;
              text-align: center !important;
              vertical-align: middle !important;
            }
            #report-cliente .pdf-client-main .pdf-roll-cell {
              padding-left: 6px !important;
              padding-right: 6px !important;
            }
            #report-cliente .pdf-client-main thead .pdf-roll-cell {
              overflow: visible !important;
              white-space: normal !important;
            }
            #report-cliente .pdf-many-rolls .pdf-client-main th,
            #report-cliente .pdf-many-rolls .pdf-client-main td {
              padding: 2px 8px 8px !important;
              line-height: 1.3 !important;
            }
            #report-cliente .pdf-many-rolls .pdf-client-main .pdf-roll-cell {
              padding-left: 2px !important;
              padding-right: 2px !important;
            }
            #report-cliente .pdf-client-main th > div {
              line-height: 1.35 !important;
              margin: 1px 0 !important;
            }
            #report-cliente .pdf-export-page + .pdf-export-page {
              margin-top: 16px !important;
            }
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
