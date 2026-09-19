import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateCashFlowTotals,
  calculateCollectionTotals,
  calculatePaymentTotals,
  percentageOfTotal,
} from "../src/lib/financeiro.ts";
import {
  buildClientReportConsolidation,
  type PrecoPeca,
  type RollCliente,
} from "../src/lib/relatorio-cliente-calculos.ts";
import { calcularValorExpressoAutomatico } from "../src/lib/preco-expresso.ts";

function item(
  id: string,
  quantidade: number,
  valorUnit: number | null,
  valorTotal: number | null,
) {
  return {
    id: `${id}-${quantidade}-${valorUnit}`,
    peca_id: id,
    quantidade,
    valor_unit: valorUnit,
    valor_total: valorTotal,
    pecas: { id, nome: id.toUpperCase() },
  };
}

test("roll normal consolida quantidade e receita esperadas", () => {
  const rolls: RollCliente[] = [
    {
      id: "roll-normal",
      expresso: false,
      rolls_alyani_itens: [item("toalha", 10, 1.65, 16.5)],
    },
  ];

  const report = buildClientReportConsolidation(rolls, new Map<string, PrecoPeca>());
  assert.equal(report.totalGeralItens, 10);
  assert.equal(report.totalGeralValor, 16.5);
});

test("roll expresso usa exatamente o valor expresso salvo", () => {
  const valorExpresso = calcularValorExpressoAutomatico(1.65);
  assert.equal(valorExpresso, 3.3);

  const rolls: RollCliente[] = [
    {
      id: "roll-expresso",
      expresso: true,
      rolls_alyani_itens: [item("toalha", 10, valorExpresso, 33)],
    },
  ];

  const report = buildClientReportConsolidation(rolls, new Map<string, PrecoPeca>());
  assert.equal(report.totalGeralValor, 33);
});

test("pagamentos: cancelado não entra no total financeiro ativo", () => {
  const totals = calculatePaymentTotals([
    { valor: 500, status: "pendente" },
    { valor: 300, status: "pago" },
    { valor: 200, status: "cancelado" },
  ]);

  assert.deepEqual(totals, {
    total: 800,
    totalGeral: 1000,
    pago: 300,
    pendente: 500,
    cancelado: 200,
  });
  assert.equal(percentageOfTotal(totals.pago, totals.total), 37.5);
});

test("cobranças: atrasado continua a receber e cancelado fica fora do ativo", () => {
  const totals = calculateCollectionTotals([
    { valor: 100, status: "pago" },
    { valor: 200, status: "pendente" },
    { valor: 300, status: "atrasado" },
    { valor: 400, status: "cancelado" },
  ]);

  assert.deepEqual(totals, {
    total: 600,
    totalGeral: 1000,
    pago: 100,
    pendente: 500,
    atrasado: 300,
    cancelado: 400,
  });
});

test("fluxo de caixa ignora cancelados em a receber e a pagar", () => {
  const totals = calculateCashFlowTotals([
    {
      total_receita: 1000,
      total_custo: 600,
      cobrancas: { status: "pago" },
      pagamentos: { status: "pago" },
    },
    {
      total_receita: 500,
      total_custo: 200,
      cobrancas: { status: "pendente" },
      pagamentos: { status: "pendente" },
    },
    {
      total_receita: 300,
      total_custo: 150,
      cobrancas: { status: "cancelado" },
      pagamentos: { status: "cancelado" },
    },
  ]);

  assert.deepEqual(totals, {
    recebido: 1000,
    aReceber: 500,
    pago: 600,
    aPagar: 200,
    lucroRealizado: 400,
    lucroPrevisto: 700,
    receitaTotal: 1500,
    custoTotal: 800,
    receitaCancelada: 300,
    custoCancelado: 150,
  });
});

test("percentual com total zero retorna zero", () => {
  assert.equal(percentageOfTotal(100, 0), 0);
  assert.equal(percentageOfTotal(Number.NaN, 100), 0);
});
