import assert from "node:assert/strict";
import test from "node:test";
import {
  addMoney,
  applyRollItemTotalsDelta,
  calculateRollFinancialTotals,
  calculateRollItemTotals,
  formatRevenuePercent,
  getRollCost,
  getRollRevenue,
  multiplyMoney,
  removeRollItemTotals,
  roundMoney,
  subtractMoney,
  sumMoneyValues,
  toMoneyCents,
} from "../src/lib/calculos.ts";

test("dinheiro soma em centavos sem erro binário", () => {
  assert.equal(addMoney(0.1, 0.2), 0.3);
  assert.equal(sumMoneyValues([0.1, 0.2, 0.3]), 0.6);
  assert.equal(subtractMoney(1, 0.1, 0.2), 0.7);
});

test("arredondamento monetário mantém duas casas", () => {
  assert.equal(roundMoney(1.005), 1.01);
  assert.equal(roundMoney("2,345"), 2.35);
  assert.equal(toMoneyCents("10,99"), 1099);
});

test("quantidade vezes valor unitário usa centavos", () => {
  assert.equal(multiplyMoney(3, 1.65), 4.95);
  assert.equal(multiplyMoney(2.5, 1.99), 4.98);
});

test("totais de rolls derivam lucro de receita menos custo", () => {
  const totals = calculateRollFinancialTotals([
    { total_receita: 100.1, total_custo: 40.05, total_lucro: 999 },
    { total_receita: 50.2, total_custo: 10.1, total_lucro: -999 },
  ]);

  assert.deepEqual(totals, {
    qtd: 2,
    receita: 150.3,
    custo: 50.15,
    lucro: 100.15,
  });
});

test("totais dos itens somam quantidade, receita, custo e lucro", () => {
  const totals = calculateRollItemTotals([
    { quantidade: 2, valor_total: 3.3, custo_total: 2.1 },
    { quantidade: 3, valor_total: 6.6, custo_total: 4.2 },
  ]);

  assert.deepEqual(totals, {
    qtd: 5,
    receita: 9.9,
    custo: 6.3,
    lucro: 3.6,
  });
});

test("adicionar e editar item atualiza os cards sem divergência", () => {
  const header = { total_receita: 10, total_custo: 6, total_lucro: 4 };

  const afterInsert = applyRollItemTotalsDelta(
    header,
    null,
    { valor_total: 5.5, custo_total: 2.25 },
  );
  assert.deepEqual(afterInsert, {
    total_receita: 15.5,
    total_custo: 8.25,
    total_lucro: 7.25,
  });

  const afterEdit = applyRollItemTotalsDelta(
    afterInsert,
    { valor_total: 5.5, custo_total: 2.25 },
    { valor_total: 6.75, custo_total: 3 },
  );
  assert.deepEqual(afterEdit, {
    total_receita: 16.75,
    total_custo: 9,
    total_lucro: 7.75,
  });
});

test("remover item reduz receita e custo e recalcula lucro", () => {
  const result = removeRollItemTotals(
    { total_receita: 16.75, total_custo: 9, total_lucro: 7.75 },
    { valor_total: 6.75, custo_total: 3 },
  );

  assert.deepEqual(result, {
    total_receita: 10,
    total_custo: 6,
    total_lucro: 4,
  });
});

test("relatório usa total salvo dos itens e fallback do cabeçalho quando necessário", () => {
  assert.equal(
    getRollRevenue({
      total_receita: 99,
      rolls_alyani_itens: [
        { quantidade: 2, valor_unit: 1.65, valor_total: 3.3 },
        { quantidade: 1, valor_unit: 2.5, valor_total: 2.5 },
      ],
    }),
    5.8,
  );

  assert.equal(
    getRollCost({ total_custo: 12.34, rolls_alyani_itens: [] }),
    12.34,
  );
});

test("percentual de receita é estável e não divide por zero", () => {
  assert.equal(formatRevenuePercent(30, 100), "30,00%");
  assert.equal(formatRevenuePercent(1, 3), "33,33%");
  assert.equal(formatRevenuePercent(0, 0), "0,00%");
});
