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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { brl, brDate, firstOfMonth, lastOfMonth } from "@/lib/format";
import { Download } from "lucide-react";
import {
  addMoney,
  getRollCost,
  getRollRevenue,
  multiplyMoney,
  roundMoney,
  subtractMoney,
  sumMoneyValues,
} from "@/lib/calculos";
import {
  fetchActiveHoteis,
  fetchActivePrestadoras,
  HOTEIS_LITE_QUERY_KEY,
  PRESTADORAS_LITE_QUERY_KEY,
} from "@/lib/catalogos";

export const Route = createFileRoute("/_authenticated/relatorios/financeiro")({
  head: () => ({ meta: [{ title: "Relatório de Receita — Alyani" }] }),
  component: Page,
});

type LancamentoDespesa = {
  id: string;
  data: string;
  dataVencimento: string;
  fornecedor: string;
  descricao: string;
  tipo: string;
  pagamento: string;
  valor: number;
};

type ReceitaRow = {
  rowId: string;
  hotelId: string;
  hotel: string;
  periodoInicial: string;
  periodoFinal: string;
  vencimento: string;
  valorReceber: number;
  valorTeixeira: number;
  valorApurado: number;
  diferencaApurada: number;
  receitaProvisoria: number;
  receitaEfetiva: number;
  percentualProvisao: number;
  percentualEfetivo: number;
  imposto: number;
  liquidoPosImpostoEfetivo: number;
  percentualPosImpostoEfetivo: number;
  liquidoPosImpostoProvisorio: number;
  percentualPosImpostoProvisorio: number;
  statusRecebimento: string;
  dataRecebimento: string;
  rolls: number;
  rollsConferidos: number;
  custoSemReferencia: number;
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

function getTodayForInput() {
  const today = new Date();
  const localTime = new Date(today.getTime() - today.getTimezoneOffset() * 60_000);
  return localTime.toISOString().slice(0, 10);
}

function createInitialForm() {
  return {
    data: getTodayForInput(),
    dataVencimento: "",
    fornecedor: "",
    descricao: "",
    tipo: "",
    pagamento: "",
    valor: "",
  };
}

function firstRelation<T = any>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function percent(value: number, base: number) {
  if (!Number.isFinite(value) || !Number.isFinite(base) || base === 0) return 0;
  return (value * 100) / base;
}

function percentLabel(value: number) {
  return `${value.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}%`;
}

function getRecebimentoStatus(cobrancas: any[]) {
  const validas = cobrancas.filter((c) => c?.status !== "cancelado");
  if (validas.length === 0) return { label: "Não cobrado", data: "" };

  const pagas = validas.filter((c) => c?.status === "pago");
  const atrasadas = validas.filter((c) => c?.status === "atrasado");
  const datas = pagas
    .map((c) => c?.data_pagamento as string | null)
    .filter(Boolean)
    .sort();

  if (pagas.length === validas.length) {
    return { label: "Pago", data: datas.at(-1) ?? "" };
  }
  if (pagas.length > 0) return { label: "Parcial", data: datas.at(-1) ?? "" };
  if (atrasadas.length > 0) return { label: "Atrasado", data: "" };
  return { label: "Pendente", data: "" };
}

function Page() {
  const [activeTab, setActiveTab] = useState("receita");
  const [dataInicio, setDataInicio] = useState(firstOfMonth());
  const [dataFim, setDataFim] = useState(lastOfMonth());
  const [hotelId, setHotelId] = useState<string | undefined>();
  const [prestadoraId, setPrestadoraId] = useState<string | undefined>();
  const [impostoPercentual, setImpostoPercentual] = useState("6");
  const [despesas, setDespesas] = useState<LancamentoDespesa[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const salvo = window.localStorage.getItem("relatorio-despesas-custos");
      const itensSalvos = salvo ? JSON.parse(salvo) : [];
      if (!Array.isArray(itensSalvos)) return [];

      return itensSalvos.map((item) => ({
        ...item,
        dataVencimento: item.dataVencimento ?? "",
        pagamento: item.pagamento ?? "",
      }));
    } catch {
      return [];
    }
  });
  const [form, setForm] = useState(createInitialForm);
  const [editId, setEditId] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("relatorio-despesas-custos", JSON.stringify(despesas));
    }
  }, [despesas]);

  const { data: hoteis = [] } = useQuery({
    queryKey: HOTEIS_LITE_QUERY_KEY,
    queryFn: fetchActiveHoteis,
  });

  const { data: prestadoras = [] } = useQuery({
    queryKey: PRESTADORAS_LITE_QUERY_KEY,
    queryFn: fetchActivePrestadoras,
  });

  const { data: rolls = [] } = useQuery({
    queryKey: ["rel-financeiro", dataInicio, dataFim, hotelId, prestadoraId],
    queryFn: async () => {
      let query = supabase
        .from("rolls_alyani")
        .select(
          "id,numero,data_roll,hotel_id,prestadora_id,total_receita,total_custo,hoteis(id,nome),prestadoras(id,nome),rolls_alyani_itens(peca_id,quantidade,valor_unit,valor_total,custo_unit,custo_total),cobrancas(id,valor,vencimento,status,data_pagamento),pagamentos(id,valor,status,data_pagamento)",
        )
        .gte("data_roll", dataInicio)
        .lte("data_roll", dataFim)
        .order("data_roll");

      if (hotelId) query = query.eq("hotel_id", hotelId);
      if (prestadoraId) query = query.eq("prestadora_id", prestadoraId);

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const rollIds = useMemo(() => (rolls as any[]).map((roll) => String(roll.id)), [rolls]);
  const prestadoraIds = useMemo(
    () => [...new Set((rolls as any[]).map((roll) => String(roll.prestadora_id ?? "")).filter(Boolean))],
    [rolls],
  );

  const { data: conferencias = [] } = useQuery({
    queryKey: ["rel-financeiro-conferencias", rollIds.join("|")],
    enabled: rollIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("conferencias")
        .select(
          "roll_alyani_id,roll_prestadora_id,rolls_prestadora(id,numero,data_roll,rolls_prestadora_itens(peca_id,quantidade))",
        )
        .in("roll_alyani_id", rollIds);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const { data: custosHistoricos = [] } = useQuery({
    queryKey: ["rel-financeiro-custos-historicos", prestadoraIds.join("|"), dataFim],
    enabled: prestadoraIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tabela_custos")
        .select("prestadora_id,peca_id,valor,data_vigencia")
        .in("prestadora_id", prestadoraIds)
        .lte("data_vigencia", dataFim)
        .order("data_vigencia", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const despesasFiltradas = useMemo(() => {
    const start = parseDateOnly(dataInicio);
    const end = parseDateOnly(dataFim);

    return despesas.filter((item) => {
      const itemDate = parseDateOnly(item.data);
      return itemDate && start && end && itemDate >= start && itemDate <= end;
    });
  }, [despesas, dataInicio, dataFim]);

  const totalDespesas = useMemo(
    () => sumMoneyValues(despesasFiltradas.map((item) => item.valor)),
    [despesasFiltradas],
  );

  const conferenciasPorRoll = useMemo(() => {
    const map = new Map<string, any>();
    for (const conferencia of conferencias as any[]) {
      if (!map.has(String(conferencia.roll_alyani_id))) {
        map.set(String(conferencia.roll_alyani_id), conferencia);
      }
    }
    return map;
  }, [conferencias]);

  const custosPorPrestadoraPeca = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const custo of custosHistoricos as any[]) {
      const key = `${custo.prestadora_id}|${custo.peca_id}`;
      const list = map.get(key) ?? [];
      list.push(custo);
      map.set(key, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => String(b.data_vigencia).localeCompare(String(a.data_vigencia)));
    }
    return map;
  }, [custosHistoricos]);

  const imposto = Math.max(0, Math.min(100, Number(impostoPercentual) || 0));

  const receitaRows = useMemo<ReceitaRow[]>(() => {
    // A planilha do Wellington trabalha por fechamento: o mesmo hotel pode
    // aparecer mais de uma vez no período quando há vencimentos diferentes.
    // Por isso o agrupamento é Cliente + Vencimento, e não apenas Cliente.
    const groups = new Map<
      string,
      {
        rowId: string;
        hotelId: string;
        hotel: string;
        vencimentoRaw: string;
        rolls: any[];
      }
    >();

    for (const roll of rolls as any[]) {
      const cobranca = firstRelation<any>(roll.cobrancas);
      const hotelKey = String(roll.hotel_id ?? "sem-hotel");
      const vencimentoRaw = cobranca?.vencimento ? String(cobranca.vencimento) : "";
      const key = `${hotelKey}|${vencimentoRaw || "sem-vencimento"}`;
      const current = groups.get(key) ?? {
        rowId: key,
        hotelId: hotelKey,
        hotel: roll.hoteis?.nome ?? "—",
        vencimentoRaw,
        rolls: [],
      };
      current.rolls.push(roll);
      groups.set(key, current);
    }

    return [...groups.values()]
      .map((group) => {
        let valorReceber = 0;
        let valorTeixeira = 0;
        let valorApurado = 0;
        let rollsConferidos = 0;
        let custoSemReferencia = 0;
        const vencimentos = new Set<string>();
        const cobrancasDoGrupo: any[] = [];

        for (const roll of group.rolls) {
          const cobranca = firstRelation<any>(roll.cobrancas);
          const pagamento = firstRelation<any>(roll.pagamentos);
          const cobrancaCancelada = cobranca?.status === "cancelado";
          const pagamentoCancelado = pagamento?.status === "cancelado";

          const receberRoll = cobranca
            ? cobrancaCancelada
              ? 0
              : roundMoney(cobranca.valor)
            : getRollRevenue(roll);
          valorReceber = addMoney(valorReceber, receberRoll);

          if (cobranca) {
            cobrancasDoGrupo.push(cobranca);
            if (!cobrancaCancelada && cobranca.vencimento) vencimentos.add(String(cobranca.vencimento));
          }

          const apuradoRoll = pagamentoCancelado ? 0 : getRollCost(roll);
          valorApurado = addMoney(valorApurado, apuradoRoll);

          if (pagamentoCancelado) continue;

          const conferencia = conferenciasPorRoll.get(String(roll.id));
          const rollPrestadora = firstRelation<any>(conferencia?.rolls_prestadora);
          const itensPrestadora = (rollPrestadora?.rolls_prestadora_itens ?? []) as any[];

          if (!conferencia || itensPrestadora.length === 0) {
            valorTeixeira = addMoney(
              valorTeixeira,
              pagamento ? roundMoney(pagamento.valor) : apuradoRoll,
            );
            continue;
          }

          const custoSnapshotPorPeca = new Map<string, number>();
          for (const item of (roll.rolls_alyani_itens ?? []) as any[]) {
            custoSnapshotPorPeca.set(String(item.peca_id), roundMoney(item.custo_unit));
          }

          let custoPrestadoraRoll = 0;
          let faltantes = 0;
          for (const item of itensPrestadora) {
            const pecaId = String(item.peca_id);
            let custoUnit = custoSnapshotPorPeca.get(pecaId);

            if (custoUnit === undefined) {
              const historico = custosPorPrestadoraPeca.get(`${roll.prestadora_id}|${pecaId}`) ?? [];
              const valido = historico.find(
                (custo) => !roll.data_roll || String(custo.data_vigencia) <= String(roll.data_roll),
              );
              custoUnit = valido ? roundMoney(valido.valor) : undefined;
            }

            if (custoUnit === undefined) {
              faltantes += 1;
              continue;
            }

            custoPrestadoraRoll = addMoney(
              custoPrestadoraRoll,
              multiplyMoney(item.quantidade, custoUnit),
            );
          }

          if (faltantes > 0) {
            custoSemReferencia += faltantes;
          } else {
            rollsConferidos += 1;
          }

          // Se a conferência existe mas alguma peça não tem custo histórico, evita
          // reduzir artificialmente o valor: usa o pagamento/apurado como fallback.
          valorTeixeira = addMoney(
            valorTeixeira,
            faltantes > 0
              ? pagamento
                ? roundMoney(pagamento.valor)
                : apuradoRoll
              : custoPrestadoraRoll,
          );
        }

        const diferencaApurada = subtractMoney(valorApurado, valorTeixeira);
        const receitaProvisoria = subtractMoney(valorReceber, valorApurado);
        const receitaEfetiva = subtractMoney(valorReceber, valorTeixeira);
        const impostoValor = multiplyMoney(imposto / 100, valorReceber);
        const liquidoPosImpostoEfetivo = subtractMoney(receitaEfetiva, impostoValor);
        const liquidoPosImpostoProvisorio = subtractMoney(receitaProvisoria, impostoValor);
        const recebimento = getRecebimentoStatus(cobrancasDoGrupo);
        const datasRoll = group.rolls
          .map((roll) => String(roll.data_roll ?? ""))
          .filter(Boolean)
          .sort();
        const periodoInicial = datasRoll[0] ?? dataInicio;
        const periodoFinal = datasRoll.at(-1) ?? dataFim;
        const vencimentosOrdenados = [...vencimentos].sort();
        const vencimento = group.vencimentoRaw
          ? brDate(group.vencimentoRaw)
          : vencimentosOrdenados.length === 0
            ? "—"
            : vencimentosOrdenados.length === 1
              ? brDate(vencimentosOrdenados[0])
              : `${brDate(vencimentosOrdenados[0])} +${vencimentosOrdenados.length - 1}`;

        return {
          rowId: group.rowId,
          hotelId: group.hotelId,
          hotel: group.hotel,
          periodoInicial,
          periodoFinal,
          vencimento,
          valorReceber,
          valorTeixeira,
          valorApurado,
          diferencaApurada,
          receitaProvisoria,
          receitaEfetiva,
          percentualProvisao: percent(receitaProvisoria, valorReceber),
          percentualEfetivo: percent(receitaEfetiva, valorReceber),
          imposto: impostoValor,
          liquidoPosImpostoEfetivo,
          percentualPosImpostoEfetivo: percent(liquidoPosImpostoEfetivo, valorReceber),
          liquidoPosImpostoProvisorio,
          // Mantém a mesma base usada na planilha do Wellington: líquido provisório / apurado Alyani.
          percentualPosImpostoProvisorio: percent(liquidoPosImpostoProvisorio, valorApurado),
          statusRecebimento: recebimento.label,
          dataRecebimento: recebimento.data,
          rolls: group.rolls.length,
          rollsConferidos,
          custoSemReferencia,
        };
      })
      .sort((a, b) => {
        const byPeriod = a.periodoInicial.localeCompare(b.periodoInicial);
        if (byPeriod !== 0) return byPeriod;
        return a.hotel.localeCompare(b.hotel, "pt-BR");
      });
  }, [rolls, dataInicio, dataFim, imposto, conferenciasPorRoll, custosPorPrestadoraPeca]);

  const receitaTotals = useMemo(() => {
    const valorReceber = sumMoneyValues(receitaRows.map((row) => row.valorReceber));
    const valorTeixeira = sumMoneyValues(receitaRows.map((row) => row.valorTeixeira));
    const valorApurado = sumMoneyValues(receitaRows.map((row) => row.valorApurado));
    const diferencaApurada = subtractMoney(valorApurado, valorTeixeira);
    const receitaProvisoria = subtractMoney(valorReceber, valorApurado);
    const receitaEfetiva = subtractMoney(valorReceber, valorTeixeira);
    const impostoValor = sumMoneyValues(receitaRows.map((row) => row.imposto));
    const liquidoPosImpostoEfetivo = subtractMoney(receitaEfetiva, impostoValor);
    const liquidoPosImpostoProvisorio = subtractMoney(receitaProvisoria, impostoValor);

    return {
      valorReceber,
      valorTeixeira,
      valorApurado,
      diferencaApurada,
      receitaProvisoria,
      receitaEfetiva,
      percentualProvisao: percent(receitaProvisoria, valorReceber),
      percentualEfetivo: percent(receitaEfetiva, valorReceber),
      imposto: impostoValor,
      liquidoPosImpostoEfetivo,
      percentualPosImpostoEfetivo: percent(liquidoPosImpostoEfetivo, valorReceber),
      liquidoPosImpostoProvisorio,
      percentualPosImpostoProvisorio: percent(liquidoPosImpostoProvisorio, valorApurado),
    };
  }, [receitaRows]);

  const resultadoAposDespesas = subtractMoney(
    receitaTotals.liquidoPosImpostoEfetivo,
    totalDespesas,
  );

  const itensDetalhados = useMemo(() => {
    const detalhes = [
      ...(rolls as any[]).map((roll: any) => ({
        id: `roll-${roll.id}`,
        data: formatDateForDisplay(roll.data_roll),
        origem: "Custo apurado do Roll",
        descricao: `${roll.hoteis?.nome ?? "—"} • ${roll.prestadoras?.nome ?? "—"} • Roll ${roll.numero ?? "—"}`,
        valor: getRollCost(roll),
      })),
      ...despesasFiltradas.map((item) => ({
        id: `desp-${item.id}`,
        data: formatDateForDisplay(item.data),
        origem: item.tipo || "Despesa lançada",
        descricao: `${item.fornecedor} • ${item.descricao} • Pagamento: ${item.pagamento || "—"} • Vencimento: ${formatDateForDisplay(item.dataVencimento) || "—"}`,
        valor: item.valor,
      })),
    ];

    return detalhes.sort((a, b) => {
      const aDate = parseDateOnly(a.data);
      const bDate = parseDateOnly(b.data);
      return (aDate?.getTime() ?? 0) - (bDate?.getTime() ?? 0);
    });
  }, [rolls, despesasFiltradas]);

  const resetForm = () => {
    setEditId(null);
    setForm(createInitialForm());
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (
      !form.data ||
      !form.dataVencimento ||
      !form.fornecedor ||
      !form.descricao ||
      !form.tipo ||
      !form.pagamento ||
      !form.valor
    )
      return;

    const payload: LancamentoDespesa = {
      id: editId ?? crypto.randomUUID(),
      data: form.data,
      dataVencimento: form.dataVencimento,
      fornecedor: form.fornecedor,
      descricao: form.descricao,
      tipo: form.tipo,
      pagamento: form.pagamento,
      valor: roundMoney(form.valor),
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
      dataVencimento: item.dataVencimento ?? "",
      fornecedor: item.fornecedor,
      descricao: item.descricao,
      tipo: item.tipo,
      pagamento: item.pagamento ?? "",
      valor: String(item.valor),
    });
  };

  const handleDelete = (id: string) => {
    if (!window.confirm("Tem certeza que deseja excluir esta despesa?")) return;
    setDespesas((prev) => prev.filter((item) => item.id !== id));
    if (editId === id) resetForm();
  };

  const exportReceitaPdf = () => {
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a2" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 8;
    const summaryLabelHeight = 9;
    const summaryValueHeight = 8;
    const headerHeight = 12;
    const rowHeight = 8;
    const headers = [
      "HOTEL",
      "PERIODO INICIAL",
      "PERIODO FINAL",
      "VENCIMENTO",
      "VLR A RECEBER",
      "VALOR A PAGAR (TEIXEIRA)",
      "VLR APURADO (ALYANI)",
      "# DIF R$ APURADO",
      "RECEITA LIQ. PROV",
      "RECEITA LIQ EFETIVA",
      "% PROVISÃO",
      "% EFETIVO",
      "IMPOSTO",
      "LIQ. POS IMPOSTO",
      "% POS IMP. EFET",
      "LIQ. POS IMP PROV",
      "% POS IMP. PROV",
      "PAGO?",
    ];
    // Soma 578 mm, exatamente a largura útil de uma folha A2 paisagem com margem de 8 mm.
    const widths = [44, 28, 28, 28, 34, 40, 38, 34, 34, 34, 26, 26, 30, 34, 28, 34, 28, 30];
    const summaryLabels = [
      "VLR A RECEBER",
      "VALOR A PAGAR",
      "VLR APURADO",
      "# DIF R$ APURADO",
      "RECEITA LIQ. PROV",
      "RECEITA LIQ.",
      "% PROVISÃO",
      "% EFETIVO",
      "IMPOSTO",
      "LIQ. POS IMPOSTO",
      "% POS IMP. EFET",
      "LIQ. POS IMP PROV",
      "% POS IMP. PROV",
      "PAGO?",
    ];
    const summaryValues = [
      brl(receitaTotals.valorReceber),
      brl(receitaTotals.valorTeixeira),
      brl(receitaTotals.valorApurado),
      brl(receitaTotals.diferencaApurada),
      brl(receitaTotals.receitaProvisoria),
      brl(receitaTotals.receitaEfetiva),
      percentLabel(receitaTotals.percentualProvisao),
      percentLabel(receitaTotals.percentualEfetivo),
      brl(receitaTotals.imposto),
      brl(receitaTotals.liquidoPosImpostoEfetivo),
      percentLabel(receitaTotals.percentualPosImpostoEfetivo),
      brl(receitaTotals.liquidoPosImpostoProvisorio),
      percentLabel(receitaTotals.percentualPosImpostoProvisorio),
      "—",
    ];

    const selectedHotel = (hoteis as any[]).find((h) => h.id === hotelId)?.nome ?? "Todos";
    const selectedPrestadora =
      (prestadoras as any[]).find((p) => p.id === prestadoraId)?.nome ?? "Todas";

    const fitText = (text: string, width: number, fontSize = 6.1) => {
      doc.setFontSize(fontSize);
      if (doc.getTextWidth(text) <= width - 2) return text;
      let result = text;
      while (result.length > 1 && doc.getTextWidth(`${result}…`) > width - 2) {
        result = result.slice(0, -1);
      }
      return `${result}…`;
    };

    const paintHeaderCell = (x: number, y: number, width: number, height: number, index: number) => {
      if (index <= 10) {
        doc.setFillColor(255, 242, 0);
        doc.setTextColor(20, 20, 20);
      } else if (index <= 16) {
        doc.setFillColor(17, 24, 39);
        doc.setTextColor(255, 255, 255);
      } else {
        doc.setFillColor(107, 125, 40);
        doc.setTextColor(255, 255, 255);
      }
      doc.rect(x, y, width, height, "FD");
    };

    const drawSummary = (startY: number) => {
      let x = margin + widths.slice(0, 4).reduce((acc, value) => acc + value, 0);
      summaryLabels.forEach((label, offset) => {
        const index = offset + 4;
        const width = widths[index];
        paintHeaderCell(x, startY, width, summaryLabelHeight, index);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(5.6);
        const lines = doc.splitTextToSize(label, width - 2);
        doc.text(lines, x + width / 2, startY + 3.5, { align: "center" });
        x += width;
      });

      x = margin + widths.slice(0, 4).reduce((acc, value) => acc + value, 0);
      summaryValues.forEach((value, offset) => {
        const index = offset + 4;
        const width = widths[index];
        if ([4, 5, 6, 7, 8, 9, 12, 13, 15].includes(index)) {
          doc.setFillColor(122, 143, 56);
          doc.setTextColor(255, 255, 255);
        } else {
          doc.setFillColor(246, 246, 240);
          doc.setTextColor(20, 20, 20);
        }
        doc.rect(x, startY + summaryLabelHeight, width, summaryValueHeight, "FD");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(5.8);
        doc.text(fitText(value, width, 5.8), x + width / 2, startY + summaryLabelHeight + 5.2, {
          align: "center",
        });
        x += width;
      });
      doc.setTextColor(20, 20, 20);
    };

    const drawTableHeader = (y: number) => {
      let x = margin;
      headers.forEach((header, index) => {
        const width = widths[index];
        paintHeaderCell(x, y, width, headerHeight, index);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(5.7);
        const lines = doc.splitTextToSize(header, width - 2);
        doc.text(lines, x + width / 2, y + 4, { align: "center" });
        x += width;
      });
      doc.setTextColor(20, 20, 20);
    };

    const drawPageHeader = () => {
      doc.setDrawColor(150, 150, 150);
      doc.setTextColor(20, 20, 20);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(17);
      doc.text("RELATÓRIO DE RECEITA", pageWidth / 2, 12, { align: "center" });
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.text(
        `Período: ${brDate(dataInicio)} a ${brDate(dataFim)}   |   Cliente: ${selectedHotel}   |   Prestadora: ${selectedPrestadora}   |   Imposto: ${imposto.toLocaleString("pt-BR")}%`,
        pageWidth / 2,
        18,
        { align: "center" },
      );
      drawSummary(22);
    };

    drawPageHeader();
    let y = 22 + summaryLabelHeight + summaryValueHeight + 5;
    drawTableHeader(y);
    y += headerHeight;

    for (const row of receitaRows) {
      if (y + rowHeight > pageHeight - 12) {
        doc.addPage();
        drawPageHeader();
        y = 22 + summaryLabelHeight + summaryValueHeight + 5;
        drawTableHeader(y);
        y += headerHeight;
      }

      const pagoTexto = row.dataRecebimento
        ? brDate(row.dataRecebimento)
        : row.statusRecebimento === "Pago"
          ? "PAGO"
          : row.statusRecebimento.toUpperCase();
      const values = [
        row.hotel,
        brDate(row.periodoInicial),
        brDate(row.periodoFinal),
        row.vencimento,
        brl(row.valorReceber),
        brl(row.valorTeixeira),
        brl(row.valorApurado),
        brl(row.diferencaApurada),
        brl(row.receitaProvisoria),
        brl(row.receitaEfetiva),
        percentLabel(row.percentualProvisao),
        percentLabel(row.percentualEfetivo),
        brl(row.imposto),
        brl(row.liquidoPosImpostoEfetivo),
        percentLabel(row.percentualPosImpostoEfetivo),
        brl(row.liquidoPosImpostoProvisorio),
        percentLabel(row.percentualPosImpostoProvisorio),
        pagoTexto,
      ];

      let x = margin;
      values.forEach((value, index) => {
        const width = widths[index];
        doc.setFillColor(255, 255, 255);
        doc.setTextColor(20, 20, 20);
        doc.rect(x, y, width, rowHeight, "FD");
        doc.setFont("helvetica", index === 9 || index === 13 ? "bold" : "normal");
        doc.setFontSize(5.8);
        const rightAligned = index >= 4 && index <= 16 && ![10, 11, 14, 16].includes(index);
        const centered = [1, 2, 3, 10, 11, 14, 16, 17].includes(index);
        doc.text(
          fitText(String(value), width, 5.8),
          rightAligned ? x + width - 1 : centered ? x + width / 2 : x + 1,
          y + 5.1,
          { align: rightAligned ? "right" : centered ? "center" : "left" },
        );
        x += width;
      });
      y += rowHeight;
    }

    if (receitaRows.length === 0) {
      doc.rect(margin, y, widths.reduce((acc, value) => acc + value, 0), 12);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.text("Nenhum Roll encontrado no período.", pageWidth / 2, y + 7, { align: "center" });
    }

    const pageCount = doc.getNumberOfPages();
    for (let page = 1; page <= pageCount; page += 1) {
      doc.setPage(page);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.setTextColor(80, 80, 80);
      doc.text(`Página ${page} de ${pageCount}`, pageWidth - margin, pageHeight - 5, {
        align: "right",
      });
    }

    doc.save(`relatorio-receita-${dataInicio}-a-${dataFim}.pdf`);
  };

  const exportDespesasPdf = () => {
    const doc = new jsPDF({ orientation: "p", unit: "mm", format: "a4" });
    const pageWidth = 210;
    const pageHeight = 297;
    const marginLeft = 10;
    const marginRight = 10;
    const tableWidth = pageWidth - marginLeft - marginRight;
    const headerHeight = 8;
    const minimumRowHeight = 7;
    const lineHeight = 3.2;
    const colWidths = [24, 32, 102, 32];
    const headers = ["DATA", "ORIGEM", "DESCRIÇÃO", "VALOR"];
    const rows = itensDetalhados.map((item) => [item.data, item.origem, item.descricao, brl(item.valor)]);

    const fitFontSize = (value: string, maximumWidth: number, preferredSize: number, minimumSize = 5.2) => {
      doc.setFontSize(preferredSize);
      const textWidth = doc.getTextWidth(value);
      if (textWidth <= maximumWidth || textWidth === 0) return preferredSize;
      return Math.max(minimumSize, preferredSize * (maximumWidth / textWidth));
    };

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

    const prepareRow = (row: string[]) => {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(6.8);
      const lines = row.map((value, index) => {
        if (index === 0 || index === row.length - 1) return [value];
        return doc.splitTextToSize(value, colWidths[index] - 2);
      });
      const maximumLines = Math.max(...lines.map((cellLines) => cellLines.length), 1);
      return { lines, height: Math.max(minimumRowHeight, maximumLines * lineHeight + 2.5) };
    };

    const drawRow = (y: number, prepared: ReturnType<typeof prepareRow>) => {
      let cursorX = marginLeft;
      prepared.lines.forEach((textLines, index) => {
        const width = colWidths[index];
        doc.rect(cursorX, y, width, prepared.height);
        const isValueColumn = index === prepared.lines.length - 1;
        if (index === 0 || isValueColumn) {
          const value = String(textLines[0] ?? "");
          doc.setFontSize(fitFontSize(value, width - 2.5, 6.8));
          doc.text(
            value,
            isValueColumn ? cursorX + width - 1.25 : cursorX + 1.25,
            y + prepared.height / 2 + 0.85,
            { align: isValueColumn ? "right" : "left" },
          );
        } else {
          doc.setFontSize(6.8);
          doc.text(textLines, cursorX + 1, y + 3);
        }
        cursorX += width;
      });
    };

    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text("RELATÓRIO DE DESPESAS E CUSTOS", pageWidth / 2, 18, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text(`Período: ${brDate(dataInicio)} a ${brDate(dataFim)}`, marginLeft, 30);

    const totalCosts = addMoney(
      sumMoneyValues((rolls as any[]).map((roll) => getRollCost(roll))),
      totalDespesas,
    );
    doc.setFont("helvetica", "bold");
    doc.text(`TOTAL GERAL: ${brl(totalCosts)}`, pageWidth - marginRight, 30, { align: "right" });

    let currentY = 40;
    drawHeader(currentY);
    currentY += headerHeight;

    for (const row of rows) {
      const prepared = prepareRow(row);
      if (currentY + prepared.height > pageHeight - 16) {
        doc.addPage();
        currentY = 14;
        drawHeader(currentY);
        currentY += headerHeight;
      }
      drawRow(currentY, prepared);
      currentY += prepared.height;
    }

    if (rows.length === 0) {
      doc.rect(marginLeft, currentY, tableWidth, 10);
      doc.text("Nenhum lançamento encontrado no período.", pageWidth / 2, currentY + 6, {
        align: "center",
      });
    }

    doc.save(`relatorio-despesas-custos-${dataInicio}-a-${dataFim}.pdf`);
  };

  const handleExportPdf = () => {
    if (activeTab === "receita") exportReceitaPdf();
    else exportDespesasPdf();
  };

  const statusClass = (status: string) => {
    if (status === "Pago") return "text-success";
    if (status === "Atrasado") return "text-destructive";
    if (status === "Parcial") return "text-warning";
    return "text-muted-foreground";
  };

  return (
    <>
      <PageHeader
        title="Receita x Despesas/Custos"
        description="Receita por cliente no padrão do fechamento: valor a receber, apurado Alyani, valor da prestadora, diferença, imposto e resultado efetivo."
        actions={
          <Button size="sm" onClick={handleExportPdf}>
            <Download className="h-4 w-4 mr-1" /> Baixar PDF
          </Button>
        }
      />

      <div className="rounded-md border bg-card p-3 mb-4 flex flex-wrap items-end gap-3">
        <div>
          <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Data inicial</Label>
          <Input
            type="date"
            className="h-9 w-[150px]"
            value={dataInicio}
            onChange={(e) => setDataInicio(e.target.value)}
          />
        </div>
        <div>
          <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Data final</Label>
          <Input
            type="date"
            className="h-9 w-[150px]"
            value={dataFim}
            onChange={(e) => setDataFim(e.target.value)}
          />
        </div>
        <div>
          <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Cliente</Label>
          <Select
            value={hotelId ?? "__all"}
            onValueChange={(value) => setHotelId(value === "__all" ? undefined : value)}
          >
            <SelectTrigger className="h-9 w-[220px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">Todos</SelectItem>
              {(hoteis as any[]).map((hotel) => (
                <SelectItem key={hotel.id} value={hotel.id}>{hotel.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Prestadora</Label>
          <Select
            value={prestadoraId ?? "__all"}
            onValueChange={(value) => setPrestadoraId(value === "__all" ? undefined : value)}
          >
            <SelectTrigger className="h-9 w-[200px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">Todas</SelectItem>
              {(prestadoras as any[]).map((prestadora) => (
                <SelectItem key={prestadora.id} value={prestadora.id}>{prestadora.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Imposto (%)</Label>
          <Input
            type="number"
            min={0}
            max={100}
            step="0.1"
            className="h-9 w-[100px]"
            value={impostoPercentual}
            onChange={(e) => setImpostoPercentual(e.target.value)}
          />
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-4">
          <TabsTrigger value="receita">Receita</TabsTrigger>
          <TabsTrigger value="despesas">Despesas / Custos</TabsTrigger>
        </TabsList>

        <TabsContent value="receita" className="mt-0">
          <div className="rounded-md border bg-card overflow-hidden mb-6">
            <div className="border-b px-4 py-5 text-center">
              <div className="text-xl font-bold tracking-wide">RELATÓRIO DE RECEITA</div>
              <div className="mt-1 text-xs text-muted-foreground">
                Período filtrado: {brDate(dataInicio)} a {brDate(dataFim)}
              </div>
            </div>

            <div className="overflow-x-auto">
              <div className="min-w-[2050px] p-3">
                <table className="w-full border-collapse text-[10px] mb-3">
                  <tbody>
                    <tr>
                      <td colSpan={4} className="border-0"></td>
                      {[
                        "VLR A RECEBER",
                        "VALOR A PAGAR",
                        "VLR APURADO",
                        "# DIF R$ APURADO",
                        "RECEITA LIQ. PROV",
                        "RECEITA LIQ.",
                        "% PROVISÃO",
                      ].map((label) => (
                        <td
                          key={label}
                          className="border border-border px-2 py-2 text-center font-bold text-black"
                          style={{ backgroundColor: "#fff200" }}
                        >
                          {label}
                        </td>
                      ))}
                      {[
                        "% EFETIVO",
                        "IMPOSTO",
                        "LIQ. POS IMPOSTO",
                        "% POS IMP. EFET",
                        "LIQ. POS IMP PROV",
                        "% POS IMP. PROV",
                      ].map((label) => (
                        <td
                          key={label}
                          className="border border-border px-2 py-2 text-center font-bold text-white"
                          style={{ backgroundColor: "#111827" }}
                        >
                          {label}
                        </td>
                      ))}
                      <td
                        className="border border-border px-2 py-2 text-center font-bold text-white"
                        style={{ backgroundColor: "#6b7d28" }}
                      >
                        PAGO?
                      </td>
                    </tr>
                    <tr className="font-semibold">
                      <td colSpan={4} className="border-0"></td>
                      <td className="border border-border px-2 py-2 text-center font-mono text-white" style={{ backgroundColor: "#7a8f38" }}>{brl(receitaTotals.valorReceber)}</td>
                      <td className="border border-border px-2 py-2 text-center font-mono text-white" style={{ backgroundColor: "#7a8f38" }}>{brl(receitaTotals.valorTeixeira)}</td>
                      <td className="border border-border px-2 py-2 text-center font-mono text-white" style={{ backgroundColor: "#7a8f38" }}>{brl(receitaTotals.valorApurado)}</td>
                      <td className="border border-border px-2 py-2 text-center font-mono text-white" style={{ backgroundColor: "#7a8f38" }}>{brl(receitaTotals.diferencaApurada)}</td>
                      <td className="border border-border px-2 py-2 text-center font-mono text-white" style={{ backgroundColor: "#7a8f38" }}>{brl(receitaTotals.receitaProvisoria)}</td>
                      <td className="border border-border px-2 py-2 text-center font-mono text-white" style={{ backgroundColor: "#7a8f38" }}>{brl(receitaTotals.receitaEfetiva)}</td>
                      <td className="border border-border px-2 py-2 text-center" style={{ backgroundColor: "#f6f6f0" }}>{percentLabel(receitaTotals.percentualProvisao)}</td>
                      <td className="border border-border px-2 py-2 text-center" style={{ backgroundColor: "#f6f6f0" }}>{percentLabel(receitaTotals.percentualEfetivo)}</td>
                      <td className="border border-border px-2 py-2 text-center font-mono text-white" style={{ backgroundColor: "#7a8f38" }}>{brl(receitaTotals.imposto)}</td>
                      <td className="border border-border px-2 py-2 text-center font-mono text-white" style={{ backgroundColor: "#7a8f38" }}>{brl(receitaTotals.liquidoPosImpostoEfetivo)}</td>
                      <td className="border border-border px-2 py-2 text-center" style={{ backgroundColor: "#f6f6f0" }}>{percentLabel(receitaTotals.percentualPosImpostoEfetivo)}</td>
                      <td className="border border-border px-2 py-2 text-center font-mono text-white" style={{ backgroundColor: "#7a8f38" }}>{brl(receitaTotals.liquidoPosImpostoProvisorio)}</td>
                      <td className="border border-border px-2 py-2 text-center" style={{ backgroundColor: "#f6f6f0" }}>{percentLabel(receitaTotals.percentualPosImpostoProvisorio)}</td>
                      <td className="border border-border px-2 py-2 text-center" style={{ backgroundColor: "#f6f6f0" }}>—</td>
                    </tr>
                  </tbody>
                </table>

                <table className="w-full border-collapse text-[11px]">
                  <thead>
                    <tr>
                      {[
                        "HOTEL",
                        "PERIODO INICIAL",
                        "PERIODO FINAL",
                        "VENCIMENTO",
                        "VLR A RECEBER",
                        "VALOR A PAGAR (TEIXEIRA)",
                        "VLR APURADO (ALYANI)",
                        "# DIF R$ APURADO",
                        "RECEITA LIQ. PROV",
                        "RECEITA LIQ EFETIVA",
                        "% PROVISÃO",
                      ].map((label, index) => (
                        <th
                          key={label}
                          className={`${index === 0 ? "sticky left-0 z-20 min-w-[180px]" : ""} border border-border px-2 py-2 text-center font-bold text-black whitespace-normal`}
                          style={{ backgroundColor: "#fff200" }}
                        >
                          {label}
                        </th>
                      ))}
                      {[
                        "% EFETIVO",
                        "IMPOSTO",
                        "LIQ. POS IMPOSTO",
                        "% POS IMP. EFET",
                        "LIQ. POS IMP PROV",
                        "% POS IMP. PROV",
                      ].map((label) => (
                        <th
                          key={label}
                          className="border border-border px-2 py-2 text-center font-bold text-white whitespace-normal"
                          style={{ backgroundColor: "#111827" }}
                        >
                          {label}
                        </th>
                      ))}
                      <th
                        className="border border-border px-2 py-2 text-center font-bold text-white whitespace-normal"
                        style={{ backgroundColor: "#6b7d28" }}
                      >
                        PAGO?
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {receitaRows.map((row) => {
                      const teixeiraConferido = row.rollsConferidos === row.rolls && row.custoSemReferencia === 0;
                      const teixeiraParcial = row.rollsConferidos > 0 && !teixeiraConferido;
                      const pagoTexto = row.dataRecebimento
                        ? brDate(row.dataRecebimento)
                        : row.statusRecebimento === "Pago"
                          ? "PAGO"
                          : row.statusRecebimento.toUpperCase();

                      return (
                        <tr key={row.rowId} className="border-t">
                          <td className="sticky left-0 z-10 border border-border bg-card px-2 py-2 text-center font-medium whitespace-nowrap">
                            {row.hotel}
                          </td>
                          <td className="border border-border px-2 py-2 text-center whitespace-nowrap">{brDate(row.periodoInicial)}</td>
                          <td className="border border-border px-2 py-2 text-center whitespace-nowrap">{brDate(row.periodoFinal)}</td>
                          <td className="border border-border px-2 py-2 text-center whitespace-nowrap">{row.vencimento}</td>
                          <td className="border border-border px-2 py-2 text-right font-mono whitespace-nowrap">{brl(row.valorReceber)}</td>
                          <td
                            className="border border-border px-2 py-2 text-right font-mono whitespace-nowrap"
                            title={teixeiraConferido ? "Valor conferido com Roll Prestadora" : teixeiraParcial ? "Parte conferida; restante estimado" : "Valor estimado por Pagamentos/apuração"}
                          >
                            {brl(row.valorTeixeira)}
                          </td>
                          <td className="border border-border px-2 py-2 text-right font-mono whitespace-nowrap">{brl(row.valorApurado)}</td>
                          <td className={`border border-border px-2 py-2 text-right font-mono whitespace-nowrap ${row.diferencaApurada !== 0 ? "font-semibold" : "text-muted-foreground"}`}>{brl(row.diferencaApurada)}</td>
                          <td className="border border-border px-2 py-2 text-right font-mono whitespace-nowrap">{brl(row.receitaProvisoria)}</td>
                          <td className="border border-border px-2 py-2 text-right font-mono font-semibold whitespace-nowrap">{brl(row.receitaEfetiva)}</td>
                          <td className="border border-border px-2 py-2 text-center whitespace-nowrap">{percentLabel(row.percentualProvisao)}</td>
                          <td className="border border-border px-2 py-2 text-center whitespace-nowrap">{percentLabel(row.percentualEfetivo)}</td>
                          <td className="border border-border px-2 py-2 text-right font-mono whitespace-nowrap">{brl(row.imposto)}</td>
                          <td className="border border-border px-2 py-2 text-right font-mono font-semibold whitespace-nowrap">{brl(row.liquidoPosImpostoEfetivo)}</td>
                          <td className="border border-border px-2 py-2 text-center whitespace-nowrap">{percentLabel(row.percentualPosImpostoEfetivo)}</td>
                          <td className="border border-border px-2 py-2 text-right font-mono whitespace-nowrap">{brl(row.liquidoPosImpostoProvisorio)}</td>
                          <td className="border border-border px-2 py-2 text-center whitespace-nowrap">{percentLabel(row.percentualPosImpostoProvisorio)}</td>
                          <td className={`border border-border px-2 py-2 text-center font-medium whitespace-nowrap ${statusClass(row.statusRecebimento)}`}>
                            {pagoTexto}
                          </td>
                        </tr>
                      );
                    })}
                    {receitaRows.length === 0 ? (
                      <tr>
                        <td colSpan={18} className="border border-border px-4 py-10 text-center text-muted-foreground">
                          Nenhum Roll encontrado no período.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="border-t px-4 py-2 text-[11px] text-muted-foreground">
              Assim como na planilha, cada linha representa um fechamento por cliente e vencimento. O valor da Teixeira usa a conferência quando disponível e estimativa quando ainda não houver conferência completa.
            </div>
          </div>
        </TabsContent>

        <TabsContent value="despesas" className="mt-0">
          <div className="rounded-md border bg-card p-4 mb-6">
            <div className="text-sm font-semibold mb-4">Lançamentos de despesas</div>
            <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-7 gap-3 mb-4">
              <div>
                <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Data do lançamento</Label>
                <Input type="date" value={form.data} onChange={(e) => setForm((prev) => ({ ...prev, data: e.target.value }))} />
              </div>
              <div>
                <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Vencimento</Label>
                <Input type="date" value={form.dataVencimento} onChange={(e) => setForm((prev) => ({ ...prev, dataVencimento: e.target.value }))} />
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
                <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Pagamento</Label>
                <Input placeholder="PIX, boleto, cartão..." value={form.pagamento} onChange={(e) => setForm((prev) => ({ ...prev, pagamento: e.target.value }))} />
              </div>
              <div>
                <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Valor</Label>
                <Input type="number" step="0.01" value={form.valor} onChange={(e) => setForm((prev) => ({ ...prev, valor: e.target.value }))} />
              </div>
              <div className="md:col-span-2 lg:col-span-7 flex gap-2">
                <Button type="submit">{editId ? "Salvar alterações" : "Adicionar despesa"}</Button>
                {editId ? <Button type="button" variant="outline" onClick={resetForm}>Cancelar</Button> : null}
              </div>
            </form>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
              <div className="rounded-md border p-3">
                <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Custos apurados dos Rolls</div>
                <div className="text-xl font-semibold">{brl(sumMoneyValues((rolls as any[]).map((roll) => getRollCost(roll))))}</div>
              </div>
              <div className="rounded-md border p-3">
                <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Despesas lançadas</div>
                <div className="text-xl font-semibold">{brl(totalDespesas)}</div>
              </div>
              <div className="rounded-md border p-3">
                <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Total custos + despesas</div>
                <div className="text-xl font-semibold">{brl(addMoney(sumMoneyValues((rolls as any[]).map((roll) => getRollCost(roll))), totalDespesas))}</div>
              </div>
              <div className="rounded-md border p-3">
                <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Resultado após despesas</div>
                <div className={`text-xl font-semibold ${resultadoAposDespesas >= 0 ? "text-success" : "text-destructive"}`}>{brl(resultadoAposDespesas)}</div>
              </div>
            </div>

            <div className="overflow-x-auto mb-6">
              <table className="w-full text-sm">
                <thead className="text-[11px] uppercase text-muted-foreground border-b">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium">Lançamento</th>
                    <th className="text-left px-3 py-2 font-medium">Vencimento</th>
                    <th className="text-left px-3 py-2 font-medium">Fornecedor</th>
                    <th className="text-left px-3 py-2 font-medium">Descrição</th>
                    <th className="text-left px-3 py-2 font-medium">Tipo</th>
                    <th className="text-left px-3 py-2 font-medium">Pagamento</th>
                    <th className="text-right px-3 py-2 font-medium">Valor</th>
                    <th className="text-right px-3 py-2 font-medium">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {despesasFiltradas.map((item) => (
                    <tr key={item.id} className="border-t">
                      <td className="px-3 py-2">{formatDateForDisplay(item.data)}</td>
                      <td className="px-3 py-2">{formatDateForDisplay(item.dataVencimento) || "—"}</td>
                      <td className="px-3 py-2">{item.fornecedor}</td>
                      <td className="px-3 py-2">{item.descricao}</td>
                      <td className="px-3 py-2">{item.tipo}</td>
                      <td className="px-3 py-2">{item.pagamento || "—"}</td>
                      <td className="px-3 py-2 text-right font-mono">{brl(item.valor)}</td>
                      <td className="px-3 py-2 text-right">
                        <div className="flex justify-end gap-2">
                          <Button type="button" size="sm" variant="outline" onClick={() => handleEdit(item)}>Editar</Button>
                          <Button type="button" size="sm" variant="outline" onClick={() => handleDelete(item.id)}>Excluir</Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {despesasFiltradas.length === 0 ? (
                    <tr><td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">Nenhuma despesa lançada no período.</td></tr>
                  ) : null}
                </tbody>
              </table>
            </div>

            <div className="rounded-md border overflow-hidden">
              <div className="px-4 py-3 border-b flex items-center justify-between">
                <div className="text-sm font-semibold">Detalhamento de custos e despesas</div>
                <div className="text-[11px] uppercase text-muted-foreground">{itensDetalhados.length} itens</div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-[11px] uppercase text-muted-foreground bg-muted/40">
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
          </div>
        </TabsContent>
      </Tabs>
    </>
  );
}
