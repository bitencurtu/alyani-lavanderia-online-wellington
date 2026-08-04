import assert from "node:assert/strict";
import test from "node:test";
import {
  buildClientReportConsolidation,
  getClientReportLinePageSummary,
  getClientReportPageTotals,
  type PrecoPeca,
  type RollCliente,
} from "../src/lib/relatorio-cliente-calculos.ts";

const noPrices = new Map<string, PrecoPeca>();
let itemSequence = 0;

function item(
  id: string,
  quantidade: number,
  valorUnit: number | null,
  valorTotal: number | null,
  extras: Record<string, unknown> = {},
) {
  itemSequence += 1;
  return {
    id: `${id}-${itemSequence}`,
    peca_id: id,
    quantidade,
    valor_unit: valorUnit,
    valor_total: valorTotal,
    pecas: { id, nome: id.toUpperCase() },
    ...extras,
  };
}

function roll(id: string, items: ReturnType<typeof item>[]): RollCliente {
  return { id, rolls_alyani_itens: items };
}

test("recalcula valor total por quantidade vezes valor unitário", () => {
  const report = buildClientReportConsolidation([
    roll("r1", [item("banho", 3, 1.65, 999)]),
    roll("r2", [item("banho", 2, 1.65, 3.3)]),
  ], noPrices);

  assert.equal(report.pecas[0].totalItens, 5);
  assert.equal(report.pecas[0].totalValor, 8.25);
  assert.equal(report.totalGeralValor, 8.25);
  assert.equal(report.divergenciasCorrigidas, 1);
});

test("soma entradas duplicadas da mesma peça dentro do mesmo roll", () => {
  const report = buildClientReportConsolidation([
    roll("r1", [
      item("piso", 2, 2, 4),
      item("piso", 3, 2, 6),
    ]),
  ], noPrices);

  assert.equal(report.pecas.length, 1);
  assert.equal(report.pecas[0].quantidades.get("r1"), 5);
  assert.equal(report.pecas[0].valores.get("r1"), 10);
  assert.deepEqual(report.totaisPorRoll.get("r1"), { quantidade: 5, valor: 10 });
});

test("identifica preço variável sem falsificar o valor unitário", () => {
  const report = buildClientReportConsolidation([
    roll("r1", [item("fronha", 2, 1.65, 3.3)]),
    roll("r2", [item("fronha", 3, 1.8, 5.4)]),
  ], noPrices);
  const summary = getClientReportLinePageSummary(report.pecas[0], ["r1", "r2"]);

  assert.equal(summary.quantidade, 5);
  assert.equal(summary.valor, 8.7);
  assert.equal(summary.precoVariavel, true);
  assert.equal(summary.precoUnitario, null);
  assert.deepEqual(summary.precosUnitarios, [1.65, 1.8]);
});

test("preserva preço histórico zero e não usa o preço atual", () => {
  const prices = new Map<string, PrecoPeca>([
    ["manta", { valor_normal: 9, valor_expresso: 12 }],
  ]);
  const report = buildClientReportConsolidation([
    roll("r1", [item("manta", 4, 0, 0)]),
  ], prices);

  assert.equal(report.totalGeralValor, 0);
  assert.equal(report.pecas[0].valores.get("r1"), 0);
});

test("recupera preço unitário de registro legado pelo total salvo", () => {
  const report = buildClientReportConsolidation([
    roll("r1", [item("cobertor", 4, null, 10)]),
  ], noPrices);
  const summary = getClientReportLinePageSummary(report.pecas[0], ["r1"]);

  assert.equal(summary.precoUnitario, 2.5);
  assert.equal(summary.valor, 10);
});

test("usa tabela somente quando o registro legado não tem preço nem total", () => {
  const prices = new Map<string, PrecoPeca>([
    ["edredom", { valor_normal: 2.5, valor_expresso: 3 }],
  ]);
  const report = buildClientReportConsolidation([
    roll("r1", [item("edredom", 2, null, null, { expresso_item: true })]),
  ], prices);

  assert.equal(report.totalGeralValor, 6);
});

test("subtotais das páginas somam exatamente o total geral", () => {
  const report = buildClientReportConsolidation([
    roll("r1", [item("banho", 10, 1.65, 16.5), item("piso", 3, 2, 6)]),
    roll("r2", [item("banho", 5, 1.8, 9), item("piso", 4, 2, 8)]),
  ], noPrices);
  const firstPage = getClientReportPageTotals(report, ["r1"]);
  const secondPage = getClientReportPageTotals(report, ["r2"]);

  assert.equal(firstPage.quantidade + secondPage.quantidade, report.totalGeralItens);
  assert.equal(firstPage.valor + secondPage.valor, report.totalGeralValor);
  assert.deepEqual(firstPage, { quantidade: 13, valor: 22.5 });
  assert.deepEqual(secondPage, { quantidade: 9, valor: 17 });
});

test("mantém precisão para quantidades decimais e centavos", () => {
  const report = buildClientReportConsolidation([
    roll("r1", [item("especial", 1.5, 1.65, 2.48)]),
  ], noPrices);

  assert.equal(report.totalGeralItens, 1.5);
  assert.equal(report.totalGeralValor, 2.48);
});

test("confere invariantes em centenas de itens, duplicidades e preços diferentes", () => {
  let seed = 20260803;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0x100000000;
  };
  const unitPrices = [1.65, 1.8, 2.15, 6, 25];
  const expectedQuantityByPiece = new Map<string, number>();
  const expectedCentsByPiece = new Map<string, number>();
  const generatedRolls: RollCliente[] = [];

  for (let rollIndex = 0; rollIndex < 40; rollIndex += 1) {
    const items = [];
    const itemsInRoll = 8 + Math.floor(random() * 8);

    for (let itemIndex = 0; itemIndex < itemsInRoll; itemIndex += 1) {
      const pecaId = `peca-${Math.floor(random() * 12)}`;
      const quantidade = 1 + Math.floor(random() * 20);
      const valorUnit = unitPrices[Math.floor(random() * unitPrices.length)];
      const correctCents = Math.round(quantidade * Math.round(valorUnit * 100));
      const savedTotal = random() < 0.2 ? 9999 : correctCents / 100;

      items.push(item(pecaId, quantidade, valorUnit, savedTotal));
      expectedQuantityByPiece.set(
        pecaId,
        (expectedQuantityByPiece.get(pecaId) ?? 0) + quantidade,
      );
      expectedCentsByPiece.set(
        pecaId,
        (expectedCentsByPiece.get(pecaId) ?? 0) + correctCents,
      );
    }

    generatedRolls.push(roll(`roll-${rollIndex}`, items));
  }

  const report = buildClientReportConsolidation(generatedRolls, noPrices);
  const expectedTotalQuantity = Array.from(expectedQuantityByPiece.values())
    .reduce((total, value) => total + value, 0);
  const expectedTotalCents = Array.from(expectedCentsByPiece.values())
    .reduce((total, value) => total + value, 0);

  assert.equal(report.totalGeralItens, expectedTotalQuantity);
  assert.equal(report.totalGeralValor, expectedTotalCents / 100);

  for (const line of report.pecas) {
    assert.equal(line.totalItens, expectedQuantityByPiece.get(line.id));
    assert.equal(line.totalValor, (expectedCentsByPiece.get(line.id) ?? 0) / 100);
  }

  const firstRollIds = generatedRolls.slice(0, 17).map((entry) => String(entry.id));
  const secondRollIds = generatedRolls.slice(17).map((entry) => String(entry.id));
  const firstTotals = getClientReportPageTotals(report, firstRollIds);
  const secondTotals = getClientReportPageTotals(report, secondRollIds);

  assert.equal(firstTotals.quantidade + secondTotals.quantidade, report.totalGeralItens);
  assert.equal(
    Math.round((firstTotals.valor + secondTotals.valor) * 100),
    Math.round(report.totalGeralValor * 100),
  );
});
