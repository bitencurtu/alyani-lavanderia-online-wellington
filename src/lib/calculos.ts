export type NumericValue = number | string | null | undefined;

export type RollFinancialRow = {
  total_receita?: NumericValue;
  total_custo?: NumericValue;
  total_lucro?: NumericValue;
};

export type RollItemFinancialRow = {
  quantidade?: NumericValue;
  valor_unit?: NumericValue;
  valor_total?: NumericValue;
  custo_unit?: NumericValue;
  custo_total?: NumericValue;
};

export function toFiniteNumber(value: unknown) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

/**
 * Converte um valor monetário para centavos inteiros.
 * Isso evita erros binários comuns de ponto flutuante, como 0.1 + 0.2.
 */
export function toMoneyCents(value: unknown) {
  if (value === null || value === undefined || value === "") return 0;

  if (typeof value === "number" && !Number.isFinite(value)) return 0;

  // Converte também números pela representação decimal em string. Isso evita
  // casos clássicos de ponto flutuante como 1.005 * 100 = 100.499999...,
  // que faria Math.round devolver 100 em vez de 101 centavos.
  const normalized = String(value).trim().replace(/\s/g, "").replace(",", ".");
  const match = normalized.match(/^([+-]?)(\d+)(?:\.(\d+))?$/);

  if (!match) {
    const fallback = Number(normalized);
    return Number.isFinite(fallback) ? Math.round(fallback * 100) : 0;
  }

  const sign = match[1] === "-" ? -1 : 1;
  const integerPart = Number(match[2]);
  const decimals = match[3] ?? "";
  const firstTwo = `${decimals}00`.slice(0, 2);
  const thirdDigit = Number(decimals[2] ?? "0");
  let cents = integerPart * 100 + Number(firstTwo);

  if (thirdDigit >= 5) cents += 1;
  return sign * cents;
}

export function fromMoneyCents(cents: number) {
  if (!Number.isFinite(cents)) return 0;
  return Math.trunc(cents) / 100;
}

export function roundMoney(value: unknown) {
  return fromMoneyCents(toMoneyCents(value));
}

export function sumMoneyValues(values: Iterable<unknown>) {
  let totalCents = 0;
  for (const value of values) totalCents += toMoneyCents(value);
  return fromMoneyCents(totalCents);
}

export function addMoney(...values: unknown[]) {
  return sumMoneyValues(values);
}

export function subtractMoney(value: unknown, ...subtractValues: unknown[]) {
  let cents = toMoneyCents(value);
  for (const subtractValue of subtractValues) cents -= toMoneyCents(subtractValue);
  return fromMoneyCents(cents);
}

export function multiplyMoney(quantity: unknown, unitValue: unknown) {
  const qty = toFiniteNumber(quantity);
  return fromMoneyCents(Math.round(qty * toMoneyCents(unitValue)));
}

export function calculateRollFinancialTotals(rows: RollFinancialRow[]) {
  let receitaCents = 0;
  let custoCents = 0;

  for (const row of rows) {
    receitaCents += toMoneyCents(row.total_receita);
    custoCents += toMoneyCents(row.total_custo);
  }

  return {
    qtd: rows.length,
    receita: fromMoneyCents(receitaCents),
    custo: fromMoneyCents(custoCents),
    // Lucro é derivado da mesma base de receita/custo para nunca divergir dos cards.
    lucro: fromMoneyCents(receitaCents - custoCents),
  };
}

export function calculateRollItemTotals(items: RollItemFinancialRow[]) {
  let quantidade = 0;
  let receitaCents = 0;
  let custoCents = 0;

  for (const item of items) {
    quantidade += toFiniteNumber(item.quantidade);
    receitaCents += toMoneyCents(item.valor_total);
    custoCents += toMoneyCents(item.custo_total);
  }

  return {
    qtd: quantidade,
    receita: fromMoneyCents(receitaCents),
    custo: fromMoneyCents(custoCents),
    lucro: fromMoneyCents(receitaCents - custoCents),
  };
}

export function calculateQuantityTotal(items: Array<{ quantidade?: NumericValue }>) {
  return items.reduce((total, item) => total + toFiniteNumber(item.quantidade), 0);
}

const percentFormatter = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function revenuePercent(value: number, receita: number) {
  if (!Number.isFinite(value) || !Number.isFinite(receita) || receita === 0) return 0;
  return (value * 100) / receita;
}

export function formatRevenuePercent(value: number, receita: number) {
  return `${percentFormatter.format(revenuePercent(value, receita))}%`;
}

export function getRollRevenue(roll: {
  total_receita?: NumericValue;
  rolls_alyani_itens?: RollItemFinancialRow[] | null;
}) {
  const items = roll.rolls_alyani_itens ?? [];
  let itemTotalCents = 0;

  for (const item of items) {
    const savedTotalCents = toMoneyCents(item.valor_total);
    const calculatedCents = toMoneyCents(multiplyMoney(item.quantidade, item.valor_unit));
    itemTotalCents += savedTotalCents > 0 ? savedTotalCents : calculatedCents;
  }

  return itemTotalCents > 0
    ? fromMoneyCents(itemTotalCents)
    : roundMoney(roll.total_receita);
}

export function getRollCost(roll: {
  total_custo?: NumericValue;
  rolls_alyani_itens?: RollItemFinancialRow[] | null;
}) {
  const items = roll.rolls_alyani_itens ?? [];
  let itemTotalCents = 0;

  for (const item of items) {
    const savedTotalCents = toMoneyCents(item.custo_total);
    const calculatedCents = toMoneyCents(multiplyMoney(item.quantidade, item.custo_unit));
    itemTotalCents += savedTotalCents > 0 ? savedTotalCents : calculatedCents;
  }

  return itemTotalCents > 0
    ? fromMoneyCents(itemTotalCents)
    : roundMoney(roll.total_custo);
}

type RollHeaderTotals = {
  total_receita?: NumericValue;
  total_custo?: NumericValue;
  total_lucro?: NumericValue;
};

export function applyRollItemTotalsDelta<T extends RollHeaderTotals>(
  header: T,
  previousItem: RollItemFinancialRow | null | undefined,
  nextItem: RollItemFinancialRow,
): T {
  const receitaCents =
    toMoneyCents(header.total_receita) -
    toMoneyCents(previousItem?.valor_total) +
    toMoneyCents(nextItem.valor_total);
  const custoCents =
    toMoneyCents(header.total_custo) -
    toMoneyCents(previousItem?.custo_total) +
    toMoneyCents(nextItem.custo_total);

  return {
    ...header,
    total_receita: fromMoneyCents(receitaCents),
    total_custo: fromMoneyCents(custoCents),
    total_lucro: fromMoneyCents(receitaCents - custoCents),
  };
}

export function removeRollItemTotals<T extends RollHeaderTotals>(
  header: T,
  removedItem: RollItemFinancialRow,
): T {
  const receitaCents =
    toMoneyCents(header.total_receita) - toMoneyCents(removedItem.valor_total);
  const custoCents =
    toMoneyCents(header.total_custo) - toMoneyCents(removedItem.custo_total);

  return {
    ...header,
    total_receita: fromMoneyCents(receitaCents),
    total_custo: fromMoneyCents(custoCents),
    total_lucro: fromMoneyCents(receitaCents - custoCents),
  };
}
