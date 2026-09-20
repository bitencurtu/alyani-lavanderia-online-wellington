import { createFileRoute } from "@tanstack/react-router";
import { Fragment, useEffect, useMemo, useState } from "react";
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
  percentualProvisao: number | null;
  percentualEfetivo: number | null;
  imposto: number;
  liquidoPosImpostoEfetivo: number;
  percentualPosImpostoEfetivo: number | null;
  liquidoPosImpostoProvisorio: number;
  percentualPosImpostoProvisorio: number | null;
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

function percent(value: number, base: number): number | null {
  if (!Number.isFinite(value) || !Number.isFinite(base) || base === 0) return null;
  return (value * 100) / base;
}

function percentLabel(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
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
  const [expandedReceitaRowId, setExpandedReceitaRowId] = useState<string | null>(null);
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
          "id,numero,data_roll,hotel_id,prestadora_id,total_receita,total_custo,hoteis(id,nome),prestadoras(id,nome),rolls_alyani_itens(peca_id,quantidade,valor_unit,valor_total,custo_unit,custo_total),cobrancas(id,valor,vencimento,status,data_pagamento)",
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

  const totalCustosRolls = useMemo(
    () => sumMoneyValues((rolls as any[]).map((roll) => getRollCost(roll))),
    [rolls],
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
          const cobrancaCancelada = cobranca?.status === "cancelado";

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

          // "VLR APURADO (ALYANI)" da planilha: quantidade informada pela Alyani × custo unitário
          // histórico da prestadora. É um valor operacional e não depende do status de Pagamentos.
          const apuradoRoll = getRollCost(roll);
          valorApurado = addMoney(valorApurado, apuradoRoll);

          const conferencia = conferenciasPorRoll.get(String(roll.id));
          const rollPrestadora = firstRelation<any>(conferencia?.rolls_prestadora);
          const itensPrestadora = (rollPrestadora?.rolls_prestadora_itens ?? []) as any[];

          // "VALOR A PAGAR (TEIXEIRA)" da planilha só existe quando há quantidade
          // efetivamente informada pela prestadora. Sem Roll Prestadora/conferência, fica 0,00
          // em vez de copiar o apurado da Alyani e mascarar que o valor efetivo ainda não chegou.
          if (!conferencia || itensPrestadora.length === 0) continue;

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

          // Soma apenas o que realmente foi informado pela prestadora. Se alguma peça
          // estiver sem custo de referência, ela fica sinalizada como pendência em vez de
          // substituir o valor pelo apurado da Alyani. Isso mantém F e G independentes,
          // exatamente como no relatório original.
          valorTeixeira = addMoney(valorTeixeira, custoPrestadoraRoll);
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

  const custosRollsDetalhados = useMemo(() => {
    return (rolls as any[])
      .map((roll: any) => ({
        id: `roll-${roll.id}`,
        dataRaw: String(roll.data_roll ?? ""),
        data: formatDateForDisplay(roll.data_roll),
        numero: String(roll.numero ?? "—"),
        cliente: roll.hoteis?.nome ?? "—",
        prestadora: roll.prestadoras?.nome ?? "—",
        valor: getRollCost(roll),
      }))
      .sort((a, b) => a.dataRaw.localeCompare(b.dataRaw));
  }, [rolls]);

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
      // Mesma organização visual da planilha, mas usando a paleta azul/cinza do ERP.
      if (index <= 10) {
        doc.setFillColor(45, 61, 91);
        doc.setTextColor(255, 255, 255);
      } else if (index <= 16) {
        doc.setFillColor(230, 235, 243);
        doc.setTextColor(38, 48, 68);
      } else {
        doc.setFillColor(213, 222, 235);
        doc.setTextColor(38, 48, 68);
      }
      doc.setDrawColor(201, 210, 223);
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
          doc.setFillColor(238, 242, 247);
          doc.setTextColor(38, 48, 68);
        } else {
          doc.setFillColor(247, 249, 252);
          doc.setTextColor(38, 48, 68);
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
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 10;
    const usableWidth = pageWidth - margin * 2;

    const drawTitle = () => {
      doc.setTextColor(38, 48, 68);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(15);
      doc.text("RELATÓRIO DE DESPESAS GERAIS", pageWidth / 2, 12, { align: "center" });
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.text(`Período: ${brDate(dataInicio)} a ${brDate(dataFim)}`, pageWidth / 2, 18, { align: "center" });
    };

    const summaryItems = [
      ["RECEITA EFETIVA PÓS-IMPOSTO", brl(receitaTotals.liquidoPosImpostoEfetivo)],
      ["CUSTO APURADO DOS ROLLS", brl(totalCustosRolls)],
      ["DESPESAS GERAIS", brl(totalDespesas)],
      ["RESULTADO FINAL", brl(resultadoAposDespesas)],
    ];

    const drawSummary = (y: number) => {
      const gap = 3;
      const width = (usableWidth - gap * 3) / 4;
      summaryItems.forEach(([label, value], index) => {
        const x = margin + index * (width + gap);
        doc.setFillColor(238, 242, 247);
        doc.setDrawColor(201, 210, 223);
        doc.roundedRect(x, y, width, 18, 1.5, 1.5, "FD");
        doc.setTextColor(90, 101, 120);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(6.4);
        doc.text(label, x + 2, y + 5);
        doc.setTextColor(38, 48, 68);
        doc.setFontSize(10);
        doc.text(value, x + 2, y + 13);
      });
    };

    const drawTable = (
      title: string,
      headers: string[],
      widths: number[],
      rows: string[][],
      startY: number,
    ) => {
      let y = startY;
      doc.setTextColor(38, 48, 68);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.text(title, margin, y);
      y += 4;

      const drawHeader = () => {
        let x = margin;
        doc.setFillColor(45, 61, 91);
        doc.setTextColor(255, 255, 255);
        doc.setDrawColor(201, 210, 223);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(6.5);
        headers.forEach((header, index) => {
          doc.rect(x, y, widths[index], 8, "FD");
          doc.text(header, x + widths[index] / 2, y + 5, { align: "center" });
          x += widths[index];
        });
        y += 8;
        doc.setTextColor(30, 30, 30);
      };

      drawHeader();

      for (const row of rows) {
        if (y + 8 > pageHeight - 10) {
          doc.addPage();
          drawTitle();
          y = 24;
          drawHeader();
        }
        let x = margin;
        row.forEach((value, index) => {
          doc.setFillColor(255, 255, 255);
          doc.setDrawColor(220, 224, 230);
          doc.rect(x, y, widths[index], 8, "FD");
          doc.setFont("helvetica", "normal");
          doc.setFontSize(6.3);
          const isValue = index === row.length - 1;
          let text = String(value ?? "");
          while (text.length > 1 && doc.getTextWidth(text) > widths[index] - 3) text = `${text.slice(0, -2)}…`;
          doc.text(text, isValue ? x + widths[index] - 1.5 : x + 1.5, y + 5.1, { align: isValue ? "right" : "left" });
          x += widths[index];
        });
        y += 8;
      }

      if (rows.length === 0) {
        doc.rect(margin, y, widths.reduce((acc, value) => acc + value, 0), 9);
        doc.setFontSize(7);
        doc.text("Nenhum registro encontrado no período.", margin + 2, y + 5.5);
        y += 9;
      }

      return y;
    };

    drawTitle();
    drawSummary(23);

    const despesaRows = despesasFiltradas.map((item) => [
      formatDateForDisplay(item.data),
      formatDateForDisplay(item.dataVencimento) || "—",
      item.fornecedor,
      item.tipo,
      item.descricao,
      item.pagamento || "—",
      brl(item.valor),
    ]);
    let y = drawTable(
      "DESPESAS GERAIS",
      ["DATA", "VENCIMENTO", "FORNECEDOR", "CATEGORIA", "DESCRIÇÃO", "PAGAMENTO", "VALOR"],
      [22, 24, 44, 34, 78, 35, 40],
      despesaRows,
      47,
    );

    y += 7;
    if (y > pageHeight - 40) {
      doc.addPage();
      drawTitle();
      y = 26;
    }

    const custosRows = custosRollsDetalhados.map((item) => [
      item.data,
      item.numero,
      item.cliente,
      item.prestadora,
      brl(item.valor),
    ]);
    drawTable(
      "CUSTOS APURADOS DOS ROLLS",
      ["DATA", "ROLL", "CLIENTE", "PRESTADORA", "CUSTO APURADO"],
      [28, 28, 88, 75, 58],
      custosRows,
      y,
    );

    const pageCount = doc.getNumberOfPages();
    for (let page = 1; page <= pageCount; page += 1) {
      doc.setPage(page);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.setTextColor(90, 90, 90);
      doc.text(`Página ${page} de ${pageCount}`, pageWidth - margin, pageHeight - 5, { align: "right" });
    }

    doc.save(`relatorio-despesas-gerais-${dataInicio}-a-${dataFim}.pdf`);
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
        title="Receita e Despesas"
        description="Resultado dos clientes e despesas gerais no mesmo módulo, com custos operacionais separados para evitar dupla contagem."
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
          <TabsTrigger value="receita">Receita / Resultado</TabsTrigger>
          <TabsTrigger value="despesas">Despesas Gerais</TabsTrigger>
        </TabsList>

        <TabsContent value="receita" className="mt-0">
          <div className="rounded-md border bg-card overflow-hidden mb-6">
            <div className="border-b px-4 py-4">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <div className="text-base font-semibold">Resultado dos clientes</div>
                  <div className="text-xs text-muted-foreground">
                    Visão financeira dos fechamentos entre {brDate(dataInicio)} e {brDate(dataFim)}.
                  </div>
                </div>
                <div className="text-xs text-muted-foreground">{receitaRows.length} fechamento(s)</div>
              </div>
            </div>

            <div className="p-4 border-b">
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6 gap-3">
                <div className="rounded-md border bg-muted/20 p-3">
                  <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">A receber</div>
                  <div className="text-xl font-semibold">{brl(receitaTotals.valorReceber)}</div>
                  <div className="text-xs text-muted-foreground mt-1">Total cobrado dos clientes.</div>
                </div>
                <div className="rounded-md border bg-muted/20 p-3">
                  <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">Custo Teixeira</div>
                  <div className="text-xl font-semibold">{brl(receitaTotals.valorTeixeira)}</div>
                  <div className="text-xs text-muted-foreground mt-1">Custo efetivo já conferido.</div>
                </div>
                <div className="rounded-md border bg-muted/20 p-3">
                  <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">Receita efetiva</div>
                  <div className="text-xl font-semibold">{brl(receitaTotals.receitaEfetiva)}</div>
                  <div className="text-xs text-muted-foreground mt-1">A receber − custo Teixeira.</div>
                </div>
                <div className="rounded-md border bg-muted/20 p-3">
                  <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">Imposto</div>
                  <div className="text-xl font-semibold">{brl(receitaTotals.imposto)}</div>
                  <div className="text-xs text-muted-foreground mt-1">{imposto.toLocaleString("pt-BR")}% sobre o valor a receber.</div>
                </div>
                <div className="rounded-md border bg-muted/20 p-3">
                  <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">Resultado pós-imposto</div>
                  <div className={`text-xl font-semibold ${receitaTotals.liquidoPosImpostoEfetivo >= 0 ? "text-success" : "text-destructive"}`}>
                    {brl(receitaTotals.liquidoPosImpostoEfetivo)}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">Resultado efetivo após imposto.</div>
                </div>
                <div className="rounded-md border bg-muted/20 p-3">
                  <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">Margem pós-imposto</div>
                  <div className="text-xl font-semibold">{percentLabel(receitaTotals.percentualPosImpostoEfetivo)}</div>
                  <div className="text-xs text-muted-foreground mt-1">Sobre o valor total a receber.</div>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="rounded-md border px-3 py-2">
                  <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Apurado Alyani</div>
                  <div className="mt-1 font-semibold">{brl(receitaTotals.valorApurado)}</div>
                </div>
                <div className="rounded-md border px-3 py-2">
                  <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Resultado previsto</div>
                  <div className="mt-1 font-semibold">{brl(receitaTotals.receitaProvisoria)}</div>
                </div>
                <div className="rounded-md border px-3 py-2">
                  <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Diferença apurada</div>
                  <div className={`mt-1 font-semibold ${receitaTotals.diferencaApurada > 0 ? "text-success" : receitaTotals.diferencaApurada < 0 ? "text-destructive" : ""}`}>
                    {brl(receitaTotals.diferencaApurada)}
                  </div>
                </div>
              </div>
            </div>

            <div className="p-4">
              <div className="flex items-center justify-between gap-3 mb-3">
                <div>
                  <div className="text-sm font-semibold">Fechamentos por cliente</div>
                  <div className="text-xs text-muted-foreground">
                    Resumo principal. Use “Detalhes” para abrir os cálculos completos de cada fechamento.
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto rounded-md border">
                <table className="w-full text-sm">
                  <thead className="text-[11px] uppercase text-muted-foreground bg-muted/40">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium">Cliente</th>
                      <th className="text-left px-3 py-2 font-medium">Período</th>
                      <th className="text-left px-3 py-2 font-medium">Vencimento</th>
                      <th className="text-right px-3 py-2 font-medium">A receber</th>
                      <th className="text-right px-3 py-2 font-medium">Teixeira</th>
                      <th className="text-right px-3 py-2 font-medium">Receita efetiva</th>
                      <th className="text-right px-3 py-2 font-medium">Pós-imposto</th>
                      <th className="text-center px-3 py-2 font-medium">Margem</th>
                      <th className="text-center px-3 py-2 font-medium">Recebimento</th>
                      <th className="text-right px-3 py-2 font-medium">Detalhes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {receitaRows.map((row) => {
                      const teixeiraConferido = row.rollsConferidos === row.rolls && row.custoSemReferencia === 0;
                      const teixeiraParcial = row.custoSemReferencia > 0 || (row.rollsConferidos > 0 && !teixeiraConferido);
                      const teixeiraStatus = teixeiraConferido ? "Conferido" : teixeiraParcial ? "Parcial" : "Sem conferência";
                      const pagoTexto = row.dataRecebimento
                        ? brDate(row.dataRecebimento)
                        : row.statusRecebimento === "Pago"
                          ? "Pago"
                          : row.statusRecebimento;
                      const expanded = expandedReceitaRowId === row.rowId;

                      return (
                        <Fragment key={row.rowId}>
                          <tr className="border-t">
                            <td className="px-3 py-2 font-medium whitespace-nowrap">{row.hotel}</td>
                            <td className="px-3 py-2 whitespace-nowrap">
                              {brDate(row.periodoInicial)} — {brDate(row.periodoFinal)}
                            </td>
                            <td className="px-3 py-2 whitespace-nowrap">{row.vencimento}</td>
                            <td className="px-3 py-2 text-right font-mono whitespace-nowrap">{brl(row.valorReceber)}</td>
                            <td className="px-3 py-2 text-right whitespace-nowrap">
                              <div className="font-mono">{brl(row.valorTeixeira)}</div>
                              <div className="text-[10px] text-muted-foreground">{teixeiraStatus}</div>
                            </td>
                            <td className="px-3 py-2 text-right font-mono whitespace-nowrap">{brl(row.receitaEfetiva)}</td>
                            <td className={`px-3 py-2 text-right font-mono font-medium whitespace-nowrap ${row.liquidoPosImpostoEfetivo >= 0 ? "text-success" : "text-destructive"}`}>
                              {brl(row.liquidoPosImpostoEfetivo)}
                            </td>
                            <td className="px-3 py-2 text-center whitespace-nowrap">{percentLabel(row.percentualPosImpostoEfetivo)}</td>
                            <td className={`px-3 py-2 text-center font-medium whitespace-nowrap ${statusClass(row.statusRecebimento)}`}>
                              {pagoTexto}
                            </td>
                            <td className="px-3 py-2 text-right whitespace-nowrap">
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => setExpandedReceitaRowId(expanded ? null : row.rowId)}
                              >
                                {expanded ? "Fechar" : "Detalhes"}
                              </Button>
                            </td>
                          </tr>

                          {expanded ? (
                            <tr className="border-t bg-muted/15">
                              <td colSpan={10} className="px-4 py-4">
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                                  <div className="rounded-md border bg-card p-3">
                                    <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Apurado Alyani</div>
                                    <div className="mt-1 font-semibold font-mono">{brl(row.valorApurado)}</div>
                                  </div>
                                  <div className="rounded-md border bg-card p-3">
                                    <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Diferença apurada</div>
                                    <div className={`mt-1 font-semibold font-mono ${row.diferencaApurada > 0 ? "text-success" : row.diferencaApurada < 0 ? "text-destructive" : ""}`}>
                                      {brl(row.diferencaApurada)}
                                    </div>
                                  </div>
                                  <div className="rounded-md border bg-card p-3">
                                    <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Receita provisória</div>
                                    <div className="mt-1 font-semibold font-mono">{brl(row.receitaProvisoria)}</div>
                                    <div className="text-xs text-muted-foreground mt-1">Margem {percentLabel(row.percentualProvisao)}</div>
                                  </div>
                                  <div className="rounded-md border bg-card p-3">
                                    <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Receita efetiva</div>
                                    <div className="mt-1 font-semibold font-mono">{brl(row.receitaEfetiva)}</div>
                                    <div className="text-xs text-muted-foreground mt-1">Margem {percentLabel(row.percentualEfetivo)}</div>
                                  </div>
                                  <div className="rounded-md border bg-card p-3">
                                    <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Imposto</div>
                                    <div className="mt-1 font-semibold font-mono">{brl(row.imposto)}</div>
                                  </div>
                                  <div className="rounded-md border bg-card p-3">
                                    <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Pós-imposto provisório</div>
                                    <div className="mt-1 font-semibold font-mono">{brl(row.liquidoPosImpostoProvisorio)}</div>
                                    <div className="text-xs text-muted-foreground mt-1">{percentLabel(row.percentualPosImpostoProvisorio)}</div>
                                  </div>
                                  <div className="rounded-md border bg-card p-3">
                                    <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Pós-imposto efetivo</div>
                                    <div className={`mt-1 font-semibold font-mono ${row.liquidoPosImpostoEfetivo >= 0 ? "text-success" : "text-destructive"}`}>
                                      {brl(row.liquidoPosImpostoEfetivo)}
                                    </div>
                                    <div className="text-xs text-muted-foreground mt-1">{percentLabel(row.percentualPosImpostoEfetivo)}</div>
                                  </div>
                                  <div className="rounded-md border bg-card p-3">
                                    <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Conferência Teixeira</div>
                                    <div className="mt-1 font-semibold">{teixeiraStatus}</div>
                                    <div className="text-xs text-muted-foreground mt-1">{row.rollsConferidos} de {row.rolls} Roll(s) conferido(s).</div>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          ) : null}
                        </Fragment>
                      );
                    })}
                    {receitaRows.length === 0 ? (
                      <tr>
                        <td colSpan={10} className="px-4 py-10 text-center text-muted-foreground">
                          Nenhum Roll encontrado no período.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>

              <div className="mt-3 rounded-md border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                A visão principal mostra apenas os números mais importantes. Os cálculos completos continuam disponíveis em “Detalhes” e seguem as fórmulas revisadas do relatório do Wellington.
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="despesas" className="mt-0">
          <div className="rounded-md border bg-card overflow-hidden mb-6">
            <div className="border-b px-4 py-5 text-center">
              <div className="text-xl font-bold tracking-wide">RELATÓRIO DE DESPESAS GERAIS</div>
              <div className="mt-1 text-xs text-muted-foreground">
                Período filtrado: {brDate(dataInicio)} a {brDate(dataFim)}
              </div>
            </div>

            <div className="p-4 border-b">
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
                <div className="rounded-md border bg-muted/20 p-3">
                  <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">Receita efetiva pós-imposto</div>
                  <div className="text-xl font-semibold">{brl(receitaTotals.liquidoPosImpostoEfetivo)}</div>
                  <div className="text-xs text-muted-foreground mt-1">Já considera o custo efetivo da prestadora.</div>
                </div>
                <div className="rounded-md border bg-muted/20 p-3">
                  <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">Custo apurado dos Rolls</div>
                  <div className="text-xl font-semibold">{brl(totalCustosRolls)}</div>
                  <div className="text-xs text-muted-foreground mt-1">Referência operacional calculada pela Alyani.</div>
                </div>
                <div className="rounded-md border bg-muted/20 p-3">
                  <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">Despesas gerais</div>
                  <div className="text-xl font-semibold">{brl(totalDespesas)}</div>
                  <div className="text-xs text-muted-foreground mt-1">Gastos lançados fora do custo direto dos Rolls.</div>
                </div>
                <div className="rounded-md border bg-muted/20 p-3">
                  <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">Resultado final</div>
                  <div className={`text-xl font-semibold ${resultadoAposDespesas >= 0 ? "text-success" : "text-destructive"}`}>
                    {brl(resultadoAposDespesas)}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">Receita pós-imposto − despesas gerais.</div>
                </div>
              </div>
              <div className="mt-3 rounded-md border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                O custo dos Rolls não é subtraído novamente no Resultado final, porque o custo da prestadora já faz parte do cálculo da Receita efetiva.
              </div>
            </div>

            <div className="p-4 border-b">
              <div className="flex items-center justify-between gap-3 mb-4">
                <div>
                  <div className="text-sm font-semibold">Lançar despesa geral</div>
                  <div className="text-xs text-muted-foreground">Ex.: aluguel, combustível, contador, manutenção, energia e outras despesas da empresa.</div>
                </div>
                {editId ? <div className="text-xs text-muted-foreground">Editando lançamento</div> : null}
              </div>

              <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-7 gap-3">
                <div>
                  <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Data</Label>
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
                  <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Categoria</Label>
                  <Input placeholder="Aluguel, combustível..." value={form.tipo} onChange={(e) => setForm((prev) => ({ ...prev, tipo: e.target.value }))} />
                </div>
                <div className="xl:col-span-2">
                  <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Descrição</Label>
                  <Input value={form.descricao} onChange={(e) => setForm((prev) => ({ ...prev, descricao: e.target.value }))} />
                </div>
                <div>
                  <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Valor</Label>
                  <Input type="number" step="0.01" value={form.valor} onChange={(e) => setForm((prev) => ({ ...prev, valor: e.target.value }))} />
                </div>
                <div className="md:col-span-2 xl:col-span-3">
                  <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Forma de pagamento</Label>
                  <Input placeholder="PIX, boleto, cartão..." value={form.pagamento} onChange={(e) => setForm((prev) => ({ ...prev, pagamento: e.target.value }))} />
                </div>
                <div className="md:col-span-2 xl:col-span-4 flex items-end gap-2">
                  <Button type="submit">{editId ? "Salvar alterações" : "Adicionar despesa"}</Button>
                  {editId ? <Button type="button" variant="outline" onClick={resetForm}>Cancelar</Button> : null}
                </div>
              </form>
            </div>

            <div className="p-4 border-b">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="text-sm font-semibold">Despesas gerais</div>
                  <div className="text-xs text-muted-foreground">Somente gastos cadastrados manualmente neste relatório.</div>
                </div>
                <div className="text-xs text-muted-foreground">{despesasFiltradas.length} lançamento(s)</div>
              </div>
              <div className="overflow-x-auto rounded-md border">
                <table className="w-full text-sm">
                  <thead className="text-[11px] uppercase text-muted-foreground bg-muted/40">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium">Data</th>
                      <th className="text-left px-3 py-2 font-medium">Vencimento</th>
                      <th className="text-left px-3 py-2 font-medium">Fornecedor</th>
                      <th className="text-left px-3 py-2 font-medium">Categoria</th>
                      <th className="text-left px-3 py-2 font-medium">Descrição</th>
                      <th className="text-left px-3 py-2 font-medium">Pagamento</th>
                      <th className="text-right px-3 py-2 font-medium">Valor</th>
                      <th className="text-right px-3 py-2 font-medium">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {despesasFiltradas.map((item) => (
                      <tr key={item.id} className="border-t">
                        <td className="px-3 py-2 whitespace-nowrap">{formatDateForDisplay(item.data)}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{formatDateForDisplay(item.dataVencimento) || "—"}</td>
                        <td className="px-3 py-2">{item.fornecedor}</td>
                        <td className="px-3 py-2">{item.tipo}</td>
                        <td className="px-3 py-2">{item.descricao}</td>
                        <td className="px-3 py-2">{item.pagamento || "—"}</td>
                        <td className="px-3 py-2 text-right font-mono whitespace-nowrap">{brl(item.valor)}</td>
                        <td className="px-3 py-2 text-right whitespace-nowrap">
                          <div className="flex justify-end gap-2">
                            <Button type="button" size="sm" variant="outline" onClick={() => handleEdit(item)}>Editar</Button>
                            <Button type="button" size="sm" variant="outline" onClick={() => handleDelete(item.id)}>Excluir</Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {despesasFiltradas.length === 0 ? (
                      <tr><td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">Nenhuma despesa geral lançada no período.</td></tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="text-sm font-semibold">Custos apurados dos Rolls</div>
                  <div className="text-xs text-muted-foreground">Detalhamento operacional separado das despesas gerais.</div>
                </div>
                <div className="text-xs text-muted-foreground">{custosRollsDetalhados.length} Roll(s)</div>
              </div>
              <div className="overflow-x-auto rounded-md border">
                <table className="w-full text-sm">
                  <thead className="text-[11px] uppercase text-muted-foreground bg-muted/40">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium">Data</th>
                      <th className="text-left px-3 py-2 font-medium">Roll</th>
                      <th className="text-left px-3 py-2 font-medium">Cliente</th>
                      <th className="text-left px-3 py-2 font-medium">Prestadora</th>
                      <th className="text-right px-3 py-2 font-medium">Custo apurado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {custosRollsDetalhados.map((item) => (
                      <tr key={item.id} className="border-t">
                        <td className="px-3 py-2 whitespace-nowrap">{item.data}</td>
                        <td className="px-3 py-2 font-mono">{item.numero}</td>
                        <td className="px-3 py-2">{item.cliente}</td>
                        <td className="px-3 py-2">{item.prestadora}</td>
                        <td className="px-3 py-2 text-right font-mono whitespace-nowrap">{brl(item.valor)}</td>
                      </tr>
                    ))}
                    {custosRollsDetalhados.length === 0 ? (
                      <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">Nenhum Roll encontrado no período.</td></tr>
                    ) : null}
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
