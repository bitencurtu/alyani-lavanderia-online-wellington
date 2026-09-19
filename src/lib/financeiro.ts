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

export const COBRANCA_STATUS_CLASS: Record<CobrancaStatus, string> = {
  pendente: "text-warning",
  pago: "text-success",
  atrasado: "text-destructive",
  cancelado: "text-muted-foreground",
};

export type FinanceRow = {
  valor: number | string | null | undefined;
  status: string;
};

export function calculatePaymentTotals(rows: FinanceRow[]) {
  return rows.reduce(
    (acc, row) => {
      const valor = Number(row.valor ?? 0);
      acc.total += valor;
      if (row.status === "pago") acc.pago += valor;
      else if (row.status === "pendente") acc.pendente += valor;
      else if (row.status === "cancelado") acc.cancelado += valor;
      return acc;
    },
    { total: 0, pago: 0, pendente: 0, cancelado: 0 },
  );
}

export function calculateCollectionTotals(rows: FinanceRow[]) {
  return rows.reduce(
    (acc, row) => {
      const valor = Number(row.valor ?? 0);
      acc.total += valor;
      if (row.status === "pago") acc.pago += valor;
      else if (row.status !== "cancelado") acc.pendente += valor;
      return acc;
    },
    { total: 0, pago: 0, pendente: 0 },
  );
}

export function percentageOfTotal(value: number, total: number) {
  return total > 0 ? (value / total) * 100 : 0;
}

export function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}
