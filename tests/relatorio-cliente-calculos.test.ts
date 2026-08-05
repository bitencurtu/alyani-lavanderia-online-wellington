import assert from "node:assert/strict";
import test from "node:test";
import {
  buildClientReportConsolidation,
  buildClientReportPdfPages,
  getClientReportLinePageSummary,
  getClientReportPageTotals,
  type PrecoPeca,
  type RollCliente,
} from "../src/lib/relatorio-cliente-calculos.ts";
import {
  calcularValorExpressoAutomatico,
  correspondeAoTipoDePrecoAlterado,
} from "../src/lib/preco-expresso.ts";

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
  const report = buildClientReportConsolidation(
    [roll("r1", [item("banho", 3, 1.65, 999)]), roll("r2", [item("banho", 2, 1.65, 3.3)])],
    noPrices,
  );

  assert.equal(report.pecas[0].totalItens, 5);
  assert.equal(report.pecas[0].totalValor, 8.25);
  assert.equal(report.totalGeralValor, 8.25);
  assert.equal(report.divergenciasCorrigidas, 1);
});

test("soma entradas duplicadas da mesma peça dentro do mesmo roll", () => {
  const report = buildClientReportConsolidation(
    [roll("r1", [item("piso", 2, 2, 4), item("piso", 3, 2, 6)])],
    noPrices,
  );

  assert.equal(report.pecas.length, 1);
  assert.equal(report.pecas[0].quantidades.get("r1"), 5);
  assert.equal(report.pecas[0].valores.get("r1"), 10);
  assert.deepEqual(report.totaisPorRoll.get("r1"), { quantidade: 5, valor: 10 });
});

test("identifica preço variável sem falsificar o valor unitário", () => {
  const report = buildClientReportConsolidation(
    [roll("r1", [item("fronha", 2, 1.65, 3.3)]), roll("r2", [item("fronha", 3, 1.8, 5.4)])],
    noPrices,
  );
  const summary = getClientReportLinePageSummary(report.pecas[0], ["r1", "r2"]);

  assert.equal(summary.quantidade, 5);
  assert.equal(summary.valor, 8.7);
  assert.equal(summary.precoVariavel, true);
  assert.equal(summary.precoUnitario, null);
  assert.deepEqual(summary.precosUnitarios, [1.65, 1.8]);
  assert.deepEqual(summary.gruposPreco, [
    { precoUnitario: 1.65, quantidade: 2, valor: 3.3, quantidadeRolls: 1 },
    { precoUnitario: 1.8, quantidade: 3, valor: 5.4, quantidadeRolls: 1 },
  ]);
});

test("preserva preço histórico zero e não usa o preço atual", () => {
  const prices = new Map<string, PrecoPeca>([["manta", { valor_normal: 9, valor_expresso: 12 }]]);
  const report = buildClientReportConsolidation([roll("r1", [item("manta", 4, 0, 0)])], prices);

  assert.equal(report.totalGeralValor, 0);
  assert.equal(report.pecas[0].valores.get("r1"), 0);
});

test("recupera preço unitário de registro legado pelo total salvo", () => {
  const report = buildClientReportConsolidation(
    [roll("r1", [item("cobertor", 4, null, 10)])],
    noPrices,
  );
  const summary = getClientReportLinePageSummary(report.pecas[0], ["r1"]);

  assert.equal(summary.precoUnitario, 2.5);
  assert.equal(summary.valor, 10);
});

test("usa tabela somente quando o registro legado não tem preço nem total", () => {
  const prices = new Map<string, PrecoPeca>([
    ["edredom", { valor_normal: 2.5, valor_expresso: 3 }],
  ]);
  const report = buildClientReportConsolidation(
    [roll("r1", [item("edredom", 2, null, null, { expresso_item: true })])],
    prices,
  );

  assert.equal(report.totalGeralValor, 6);
});

test("preenche automaticamente o valor expresso com o dobro do normal", () => {
  assert.equal(calcularValorExpressoAutomatico(1.65), 3.3);
  assert.equal(calcularValorExpressoAutomatico(2.345), 4.69);
  assert.equal(calcularValorExpressoAutomatico(0), 0);
});

test("alteração somente do expresso filtra rolls e itens normais", () => {
  const alteracao = { normalAlterado: false, expressoAlterado: true };

  assert.equal(correspondeAoTipoDePrecoAlterado(false, false, alteracao), false);
  assert.equal(correspondeAoTipoDePrecoAlterado(true, false, alteracao), true);
  assert.equal(correspondeAoTipoDePrecoAlterado(false, true, alteracao), true);
});

test("alteração normal não inclui rolls expressos e alteração dupla inclui ambos", () => {
  const somenteNormal = { normalAlterado: true, expressoAlterado: false };
  const ambos = { normalAlterado: true, expressoAlterado: true };

  assert.equal(correspondeAoTipoDePrecoAlterado(false, false, somenteNormal), true);
  assert.equal(correspondeAoTipoDePrecoAlterado(true, false, somenteNormal), false);
  assert.equal(correspondeAoTipoDePrecoAlterado(false, false, ambos), true);
  assert.equal(correspondeAoTipoDePrecoAlterado(true, false, ambos), true);
});

test("roll expresso usa o valor expresso da tabela no fallback legado", () => {
  const prices = new Map<string, PrecoPeca>([
    ["toalha", { valor_normal: 1.65, valor_expresso: 3.3 }],
  ]);
  const report = buildClientReportConsolidation(
    [
      {
        id: "r-expresso",
        expresso: true,
        rolls_alyani_itens: [item("toalha", 4, null, null)],
      },
    ],
    prices,
  );

  assert.equal(report.pecas[0].totalItens, 4);
  assert.equal(report.pecas[0].totalValor, 13.2);
  assert.equal(report.totalGeralValor, 13.2);
});

test("roll expresso preserva o valor histórico salvo no item", () => {
  const prices = new Map<string, PrecoPeca>([["toalha", { valor_normal: 2, valor_expresso: 4 }]]);
  const report = buildClientReportConsolidation(
    [
      {
        id: "r-expresso-historico",
        expresso: true,
        rolls_alyani_itens: [item("toalha", 4, 3.3, 13.2)],
      },
    ],
    prices,
  );

  assert.equal(report.pecas[0].totalValor, 13.2);
  assert.equal(report.totalGeralValor, 13.2);
});

test("soma vários rolls expressos usando exatamente o dobro do valor normal", () => {
  const valorNormal = 1.65;
  const valorExpresso = calcularValorExpressoAutomatico(valorNormal);
  const report = buildClientReportConsolidation(
    [
      {
        id: "expresso-1",
        expresso: true,
        rolls_alyani_itens: [item("toalha", 10, valorExpresso, 33)],
      },
      {
        id: "expresso-2",
        expresso: true,
        rolls_alyani_itens: [item("toalha", 7, valorExpresso, 23.1)],
      },
    ],
    noPrices,
  );

  assert.equal(report.pecas[0].totalItens, 17);
  assert.equal(report.pecas[0].totalValor, 56.1);
  assert.equal(report.totalGeralValor, 56.1);
});

test("fallback legado usa o preço atual mesmo quando a data do roll é antiga", () => {
  const prices = new Map<string, PrecoPeca[]>([
    [
      "fronha",
      [
        { valor_normal: 1.7, valor_expresso: 3.4, data_vigencia: "2001-01-01" },
        { valor_normal: 1.6, valor_expresso: 3.2, data_vigencia: "2000-01-01" },
      ],
    ],
  ]);
  const report = buildClientReportConsolidation(
    [
      {
        id: "r1",
        data_roll: "1999-07-15",
        rolls_alyani_itens: [item("fronha", 10, null, null)],
      },
    ],
    prices,
  );

  assert.equal(report.totalGeralValor, 17);
  assert.equal(report.pecas[0].totalValor, 17);
});

test("peça nova em roll antigo usa o preço atual e ignora preço futuro", () => {
  const prices = new Map<string, PrecoPeca[]>([
    [
      "uber-99",
      [
        { valor_normal: 12, valor_expresso: 24, data_vigencia: "2000-01-01" },
        { valor_normal: 15, valor_expresso: 30, data_vigencia: "2999-01-01" },
      ],
    ],
  ]);
  const report = buildClientReportConsolidation(
    [
      {
        id: "roll-antigo",
        data_roll: "1999-07-19",
        rolls_alyani_itens: [item("uber-99", 2, null, null)],
      },
    ],
    prices,
  );

  assert.equal(report.pecas[0].totalItens, 2);
  assert.equal(report.pecas[0].totalValor, 24);
  assert.equal(report.totalGeralValor, 24);
});

test("peça expressa nova em roll antigo usa o valor expresso atual", () => {
  const prices = new Map<string, PrecoPeca[]>([
    ["uber-99", [{ valor_normal: 12, valor_expresso: 24, data_vigencia: "2000-01-01" }]],
  ]);
  const report = buildClientReportConsolidation(
    [
      {
        id: "roll-antigo-expresso",
        data_roll: "1999-07-19",
        expresso: true,
        rolls_alyani_itens: [item("uber-99", 2, null, null)],
      },
    ],
    prices,
  );

  assert.equal(report.pecas[0].totalValor, 48);
  assert.equal(report.totalGeralValor, 48);
});

test("subtotais das páginas somam exatamente o total geral", () => {
  const report = buildClientReportConsolidation(
    [
      roll("r1", [item("banho", 10, 1.65, 16.5), item("piso", 3, 2, 6)]),
      roll("r2", [item("banho", 5, 1.8, 9), item("piso", 4, 2, 8)]),
    ],
    noPrices,
  );
  const firstPage = getClientReportPageTotals(report, ["r1"]);
  const secondPage = getClientReportPageTotals(report, ["r2"]);

  assert.equal(firstPage.quantidade + secondPage.quantidade, report.totalGeralItens);
  assert.equal(firstPage.valor + secondPage.valor, report.totalGeralValor);
  assert.deepEqual(firstPage, { quantidade: 13, valor: 22.5 });
  assert.deepEqual(secondPage, { quantidade: 9, valor: 17 });
});

test("mantém precisão para quantidades decimais e centavos", () => {
  const report = buildClientReportConsolidation(
    [roll("r1", [item("especial", 1.5, 1.65, 2.48)])],
    noPrices,
  );

  assert.equal(report.totalGeralItens, 1.5);
  assert.equal(report.totalGeralValor, 2.48);
});

test("agrupa dez rolls pelos preços históricos e soma os subtotais", () => {
  const rolls = Array.from({ length: 10 }, (_, index) =>
    roll(`r${index + 1}`, [
      item("fronha", index < 4 ? 10 : 20, index < 4 ? 1.6 : 1.7, index < 4 ? 16 : 34),
    ]),
  );
  const report = buildClientReportConsolidation(rolls, noPrices);
  const summary = getClientReportLinePageSummary(
    report.pecas[0],
    rolls.map((entry) => String(entry.id)),
  );

  assert.equal(summary.quantidade, 160);
  assert.equal(summary.valor, 268);
  assert.deepEqual(summary.gruposPreco, [
    { precoUnitario: 1.6, quantidade: 40, valor: 64, quantidadeRolls: 4 },
    { precoUnitario: 1.7, quantidade: 120, valor: 204, quantidadeRolls: 6 },
  ]);
});

test("paginação não repete rolls entre grupos nem itens entre blocos", () => {
  const rolls = Array.from({ length: 14 }, (_, index) =>
    roll(`r${index + 1}`, [item(`peca-${index}`, 1, 2, 2)]),
  );
  const report = buildClientReportConsolidation(rolls, noPrices);
  const pages = buildClientReportPdfPages(rolls, report.pecas, {
    maximumRollsPerPage: 7,
    firstPageItemLimit: 3,
    continuationItemLimit: 3,
  });

  const rollsByGroup = new Map<number, Set<string>>();
  const itemsByGroup = new Map<number, Set<string>>();
  for (const page of pages) {
    const groupRolls = rollsByGroup.get(page.rollGroupIndex) ?? new Set<string>();
    page.rolls.forEach((entry) => groupRolls.add(String(entry.id)));
    rollsByGroup.set(page.rollGroupIndex, groupRolls);

    const groupItems = itemsByGroup.get(page.rollGroupIndex) ?? new Set<string>();
    for (const entry of page.items) {
      assert.equal(groupItems.has(entry.id), false);
      groupItems.add(entry.id);
    }
    itemsByGroup.set(page.rollGroupIndex, groupItems);
  }

  const allGroupedRolls = Array.from(rollsByGroup.values()).flatMap((ids) => Array.from(ids));
  assert.equal(new Set(allGroupedRolls).size, 14);
  assert.equal(allGroupedRolls.length, 14);
  assert.equal(pages[0].isContinuation, false);
  assert.equal(
    pages.slice(1).every((page) => page.isContinuation),
    true,
  );
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
      expectedQuantityByPiece.set(pecaId, (expectedQuantityByPiece.get(pecaId) ?? 0) + quantidade);
      expectedCentsByPiece.set(pecaId, (expectedCentsByPiece.get(pecaId) ?? 0) + correctCents);
    }

    generatedRolls.push(roll(`roll-${rollIndex}`, items));
  }

  const report = buildClientReportConsolidation(generatedRolls, noPrices);
  const expectedTotalQuantity = Array.from(expectedQuantityByPiece.values()).reduce(
    (total, value) => total + value,
    0,
  );
  const expectedTotalCents = Array.from(expectedCentsByPiece.values()).reduce(
    (total, value) => total + value,
    0,
  );

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
