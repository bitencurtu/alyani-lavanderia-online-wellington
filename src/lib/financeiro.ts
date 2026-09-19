import {
  fromMoneyCents,
  toMoneyCents,
  type NumericValue,
} from "@/lib/calculos";

export type PagamentoStatus = "pendente" | "pago" | "cancelado";
export type CobrancaStatus = PagamentoStatus | "atrasado";

export const PAGAMENTO_STATUS_LABEL: Record<PagamentoStatus, string> = {
  pendente: "Pendente",
  pago: "Pago",
  cancelado: "Cancelado",
};

export const PAGAMENTO_STATUS_CLASS: Record<PagamentoStatus, string> = {
  pendente: "text-warning border-warning/30 bg-warning/10",
  pago: "text-success border-success/30 bg-success/10",
  cancelado: "text-muted-foreground border-muted-foreground/30 bg-muted/30",
};

export const COBRANCA_STATUS_LABEL: Record<CobrancaStatus, string> = {
  pendente: "Pendente",
  pago: "Pago",
  atrasado: "Atrasado",
  cancelado: "Cancelado",
};

export const COBRANCA_STATUS_CLASS: Record<CobrancaStatus, string> = {
  pendente: "text-warning border-warning/30 bg-warning/10",
  pago: "text-success border-success/30 bg-success/10",
  atrasado: "text-destructive border-destructive/30 bg-destructive/10",
  cancelado: "text-muted-foreground border-muted-foreground/30 bg-muted/30",
};

export type FinanceRow = {
  valor: NumericValue;
  status: string;
};

/**
 * Total ativo exclui cancelados. totalGeral mantém o valor bruto para
 * permitir mostrar quanto foi cancelado sem misturar isso ao financeiro ativo.
 */
export function calculatePaymentTotals(rows: FinanceRow[]) {
  let pagoCents = 0;
  let pendenteCents = 0;
  let canceladoCents = 0;

  for (const row of rows) {
    const cents = toMoneyCents(row.valor);
    if (row.status === "pago") pagoCents += cents;
    else if (row.status === "pendente") pendenteCents += cents;
    else if (row.status === "cancelado") canceladoCents += cents;
  }

  const totalAtivoCents = pagoCents + pendenteCents;
  const totalGeralCents = totalAtivoCents + canceladoCents;

  return {
    total: fromMoneyCents(totalAtivoCents),
    totalGeral: fromMoneyCents(totalGeralCents),
    pago: fromMoneyCents(pagoCents),
    pendente: fromMoneyCents(pendenteCents),
    cancelado: fromMoneyCents(canceladoCents),
  };
}

/**
 * Em cobranças, atrasado continua sendo valor ativo a receber.
 * Cancelado fica fora do total financeiro ativo.
 */
export function calculateCollectionTotals(rows: FinanceRow[]) {
  let pagoCents = 0;
  let pendenteCents = 0;
  let atrasadoCents = 0;
  let canceladoCents = 0;

  for (const row of rows) {
    const cents = toMoneyCents(row.valor);
    if (row.status === "pago") pagoCents += cents;
    else if (row.status === "pendente") pendenteCents += cents;
    else if (row.status === "atrasado") atrasadoCents += cents;
    else if (row.status === "cancelado") canceladoCents += cents;
  }

  const aReceberCents = pendenteCents + atrasadoCents;
  const totalAtivoCents = pagoCents + aReceberCents;
  const totalGeralCents = totalAtivoCents + canceladoCents;

  return {
    total: fromMoneyCents(totalAtivoCents),
    totalGeral: fromMoneyCents(totalGeralCents),
    pago: fromMoneyCents(pagoCents),
    pendente: fromMoneyCents(pendenteCents),
    atrasado: fromMoneyCents(atrasadoCents),
    aReceber: fromMoneyCents(aReceberCents),
    cancelado: fromMoneyCents(canceladoCents),
  };
}

export type CashFlowRoll = {
  total_receita?: NumericValue;
  total_custo?: NumericValue;
  cobrancas?: { status?: string | null } | null;
  pagamentos?: { status?: string | null } | null;
};

/**
 * Fluxo de caixa: cancelados não entram em recebido/a receber/pago/a pagar.
 * Ausência de cobrança/pagamento mantém o valor como previsto, como no fluxo antigo.
 */
export function calculateCashFlowTotals(rows: CashFlowRoll[]) {
  let recebidoCents = 0;
  let aReceberCents = 0;
  let pagoCents = 0;
  let aPagarCents = 0;
  let receitaCanceladaCents = 0;
  let custoCanceladoCents = 0;

  for (const roll of rows) {
    const receitaCents = toMoneyCents(roll.total_receita);
    const custoCents = toMoneyCents(roll.total_custo);
    const cobrancaStatus = roll.cobrancas?.status ?? null;
    const pagamentoStatus = roll.pagamentos?.status ?? null;

    if (cobrancaStatus === "cancelado") receitaCanceladaCents += receitaCents;
    else if (cobrancaStatus === "pago") recebidoCents += receitaCents;
    else aReceberCents += receitaCents;

    if (pagamentoStatus === "cancelado") custoCanceladoCents += custoCents;
    else if (pagamentoStatus === "pago") pagoCents += custoCents;
    else aPagarCents += custoCents;
  }

  const receitaTotalCents = recebidoCents + aReceberCents;
  const custoTotalCents = pagoCents + aPagarCents;

  return {
    recebido: fromMoneyCents(recebidoCents),
    aReceber: fromMoneyCents(aReceberCents),
    pago: fromMoneyCents(pagoCents),
    aPagar: fromMoneyCents(aPagarCents),
    lucroRealizado: fromMoneyCents(recebidoCents - pagoCents),
    lucroPrevisto: fromMoneyCents(receitaTotalCents - custoTotalCents),
    receitaTotal: fromMoneyCents(receitaTotalCents),
    custoTotal: fromMoneyCents(custoTotalCents),
    receitaCancelada: fromMoneyCents(receitaCanceladaCents),
    custoCancelado: fromMoneyCents(custoCanceladoCents),
  };
}

export function percentageOfTotal(value: number, total: number) {
  return Number.isFinite(value) && Number.isFinite(total) && total > 0
    ? (value / total) * 100
    : 0;
}

export function todayIsoDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
