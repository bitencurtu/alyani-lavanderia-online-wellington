export type PrecoPeca = {
  valor_normal: number;
  valor_expresso: number;
  data_vigencia?: unknown;
};

export type ItemRollCliente = {
  id?: unknown;
  peca_id?: unknown;
  quantidade?: unknown;
  valor_unit?: unknown;
  valor_total?: unknown;
  expresso_item?: unknown;
  pecas?: { id?: unknown; nome?: unknown } | null;
};

export type RollCliente = {
  id?: unknown;
  data_roll?: unknown;
  expresso?: unknown;
  rolls_alyani_itens?: ItemRollCliente[] | null;
};

export type LinhaRelatorioCliente = {
  id: string;
  nome: string;
  quantidades: Map<string, number>;
  valores: Map<string, number>;
  precosUnitariosCentavos: Map<string, Set<number>>;
  gruposPrecoPorRoll: Map<string, Map<number, GrupoPrecoInterno>>;
  quantidadeUnitsPorRoll: Map<string, number>;
  valoresCentavosPorRoll: Map<string, number>;
  totalItens: number;
  totalValor: number;
};

export type ConsolidadoRelatorioCliente = {
  pecas: LinhaRelatorioCliente[];
  totalGeralItens: number;
  totalGeralValor: number;
  totalGeral: number;
  totaisPorRoll: Map<string, { quantidade: number; valor: number }>;
  divergenciasCorrigidas: number;
};

export type PaginaPdfRelatorioCliente<TRoll extends RollCliente = RollCliente> = {
  rolls: TRoll[];
  items: LinhaRelatorioCliente[];
  showReportHeader: boolean;
  showTableTotal: boolean;
  rollGroupIndex: number;
  rollGroupCount: number;
  itemPageIndex: number;
  itemPageCount: number;
  isContinuation: boolean;
};

export type GrupoPrecoHistorico = {
  precoUnitario: number;
  quantidade: number;
  valor: number;
  quantidadeRolls: number;
};

type GrupoPrecoInterno = {
  quantidadeUnits: number;
  valorCentavos: number;
};

type LinhaInterna = {
  id: string;
  nome: string;
  quantidadeUnitsPorRoll: Map<string, number>;
  valoresCentavosPorRoll: Map<string, number>;
  precosUnitariosCentavos: Map<string, Set<number>>;
  gruposPrecoPorRoll: Map<string, Map<number, GrupoPrecoInterno>>;
};

const QUANTITY_SCALE = 100;

function finiteNumber(value: unknown) {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" && value.trim() === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function nonNegativeNumber(value: unknown) {
  const number = finiteNumber(value);
  return number === null ? null : Math.max(0, number);
}

function toMoneyCents(value: number) {
  const safeValue = Number.isFinite(value) ? Math.max(0, value) : 0;
  return Math.round(safeValue * 100);
}

function fromMoneyCents(value: number) {
  return value / 100;
}

function toQuantityUnits(value: unknown) {
  return Math.round((nonNegativeNumber(value) ?? 0) * QUANTITY_SCALE);
}

function fromQuantityUnits(value: number) {
  return value / QUANTITY_SCALE;
}

function getTodayIsoDate() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getFallbackUnitCents(
  pecaId: string,
  item: ItemRollCliente,
  roll: RollCliente,
  precosPorPeca: ReadonlyMap<string, PrecoPeca | readonly PrecoPeca[]>,
) {
  const configuredPrices = precosPorPeca.get(pecaId);
  const prices = configuredPrices
    ? Array.isArray(configuredPrices)
      ? configuredPrices
      : [configuredPrices]
    : [];
  const sortedPrices = [...prices].sort((a, b) =>
    String(a.data_vigencia ?? "").localeCompare(String(b.data_vigencia ?? "")),
  );
  const today = getTodayIsoDate();
  const currentPrices = sortedPrices.filter((entry) => {
    const effectiveDate = String(entry.data_vigencia ?? "");
    return !effectiveDate || effectiveDate <= today;
  });
  const price = currentPrices.at(-1);
  if (!price) return 0;
  const isExpress = Boolean(item.expresso_item ?? false) || Boolean(roll.expresso ?? false);
  return toMoneyCents(isExpress ? price.valor_expresso : price.valor_normal);
}

function getEffectiveUnitCents(
  pecaId: string,
  item: ItemRollCliente,
  roll: RollCliente,
  quantityUnits: number,
  precosPorPeca: ReadonlyMap<string, PrecoPeca | readonly PrecoPeca[]>,
) {
  const savedUnit = nonNegativeNumber(item.valor_unit);
  const savedTotal = nonNegativeNumber(item.valor_total);

  // Alguns registros legados foram gravados com unitário zero e total positivo.
  // Nesses casos, o total histórico permite recuperar o preço correto.
  if (savedUnit === 0 && savedTotal !== null && savedTotal > 0 && quantityUnits > 0) {
    return Math.round((toMoneyCents(savedTotal) * QUANTITY_SCALE) / quantityUnits);
  }

  // O valor salvo no roll é histórico e tem prioridade, inclusive quando é zero.
  if (savedUnit !== null) return toMoneyCents(savedUnit);

  // Para registros legados sem valor unitário, recupera o unitário pelo total salvo.
  if (savedTotal !== null && quantityUnits > 0) {
    return Math.round((toMoneyCents(savedTotal) * QUANTITY_SCALE) / quantityUnits);
  }

  return getFallbackUnitCents(pecaId, item, roll, precosPorPeca);
}

function getPecaIdentity(item: ItemRollCliente, fallbackIndex: number) {
  const nestedId = item.pecas?.id;
  const rawId = item.peca_id ?? nestedId;
  const id =
    rawId === null || rawId === undefined || String(rawId).trim() === ""
      ? `peca-nao-identificada-${String(item.id ?? fallbackIndex)}`
      : String(rawId);
  const rawName = item.pecas?.nome;
  const nome =
    rawName === null || rawName === undefined || String(rawName).trim() === ""
      ? "Peça não identificada"
      : String(rawName);
  return { id, nome };
}

export function buildClientReportConsolidation(
  rolls: readonly RollCliente[],
  precosPorPeca: ReadonlyMap<string, PrecoPeca | readonly PrecoPeca[]>,
): ConsolidadoRelatorioCliente {
  const lines = new Map<string, LinhaInterna>();
  let divergenciasCorrigidas = 0;
  let fallbackIndex = 0;

  for (const roll of rolls) {
    const rollId = String(roll.id ?? "");
    if (!rollId) continue;

    for (const item of roll.rolls_alyani_itens ?? []) {
      fallbackIndex += 1;
      const { id: pecaId, nome } = getPecaIdentity(item, fallbackIndex);
      const quantityUnits = toQuantityUnits(item.quantidade);
      const unitCents = getEffectiveUnitCents(pecaId, item, roll, quantityUnits, precosPorPeca);
      const calculatedTotalCents = Math.round((quantityUnits * unitCents) / QUANTITY_SCALE);
      const savedTotal = nonNegativeNumber(item.valor_total);

      if (savedTotal !== null && toMoneyCents(savedTotal) !== calculatedTotalCents) {
        divergenciasCorrigidas += 1;
      }

      let line = lines.get(pecaId);
      if (!line) {
        line = {
          id: pecaId,
          nome,
          quantidadeUnitsPorRoll: new Map(),
          valoresCentavosPorRoll: new Map(),
          precosUnitariosCentavos: new Map(),
          gruposPrecoPorRoll: new Map(),
        };
        lines.set(pecaId, line);
      }

      line.quantidadeUnitsPorRoll.set(
        rollId,
        (line.quantidadeUnitsPorRoll.get(rollId) ?? 0) + quantityUnits,
      );
      line.valoresCentavosPorRoll.set(
        rollId,
        (line.valoresCentavosPorRoll.get(rollId) ?? 0) + calculatedTotalCents,
      );

      const unitPrices = line.precosUnitariosCentavos.get(rollId) ?? new Set<number>();
      unitPrices.add(unitCents);
      line.precosUnitariosCentavos.set(rollId, unitPrices);

      const rollPriceGroups = line.gruposPrecoPorRoll.get(rollId) ?? new Map();
      const priceGroup = rollPriceGroups.get(unitCents) ?? {
        quantidadeUnits: 0,
        valorCentavos: 0,
      };
      priceGroup.quantidadeUnits += quantityUnits;
      priceGroup.valorCentavos += calculatedTotalCents;
      rollPriceGroups.set(unitCents, priceGroup);
      line.gruposPrecoPorRoll.set(rollId, rollPriceGroups);
    }
  }

  const pecas = Array.from(lines.values())
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
    .map<LinhaRelatorioCliente>((line) => {
      const totalQuantityUnits = Array.from(line.quantidadeUnitsPorRoll.values()).reduce(
        (total, quantity) => total + quantity,
        0,
      );
      const totalValueCents = Array.from(line.valoresCentavosPorRoll.values()).reduce(
        (total, value) => total + value,
        0,
      );

      return {
        id: line.id,
        nome: line.nome,
        quantidades: new Map(
          Array.from(line.quantidadeUnitsPorRoll, ([rollId, quantity]) => [
            rollId,
            fromQuantityUnits(quantity),
          ]),
        ),
        valores: new Map(
          Array.from(line.valoresCentavosPorRoll, ([rollId, value]) => [
            rollId,
            fromMoneyCents(value),
          ]),
        ),
        precosUnitariosCentavos: line.precosUnitariosCentavos,
        gruposPrecoPorRoll: line.gruposPrecoPorRoll,
        quantidadeUnitsPorRoll: line.quantidadeUnitsPorRoll,
        valoresCentavosPorRoll: line.valoresCentavosPorRoll,
        totalItens: fromQuantityUnits(totalQuantityUnits),
        totalValor: fromMoneyCents(totalValueCents),
      };
    });

  const rollIds = rolls.map((roll) => String(roll.id ?? "")).filter(Boolean);
  const totaisPorRoll = new Map<string, { quantidade: number; valor: number }>();

  for (const rollId of rollIds) {
    const quantityUnits = pecas.reduce(
      (total, line) => total + (line.quantidadeUnitsPorRoll.get(rollId) ?? 0),
      0,
    );
    const valueCents = pecas.reduce(
      (total, line) => total + (line.valoresCentavosPorRoll.get(rollId) ?? 0),
      0,
    );
    totaisPorRoll.set(rollId, {
      quantidade: fromQuantityUnits(quantityUnits),
      valor: fromMoneyCents(valueCents),
    });
  }

  const totalQuantityUnits = pecas.reduce(
    (total, line) => total + Math.round(line.totalItens * QUANTITY_SCALE),
    0,
  );
  const totalValueCents = pecas.reduce((total, line) => total + toMoneyCents(line.totalValor), 0);
  const totalGeralItens = fromQuantityUnits(totalQuantityUnits);
  const totalGeralValor = fromMoneyCents(totalValueCents);

  return {
    pecas,
    totalGeralItens,
    totalGeralValor,
    totalGeral: totalGeralValor,
    totaisPorRoll,
    divergenciasCorrigidas,
  };
}

export function getClientReportLinePageSummary(
  line: LinhaRelatorioCliente,
  rollIds: readonly string[],
) {
  const quantityUnits = rollIds.reduce(
    (total, rollId) => total + (line.quantidadeUnitsPorRoll.get(rollId) ?? 0),
    0,
  );
  const valueCents = rollIds.reduce(
    (total, rollId) => total + (line.valoresCentavosPorRoll.get(rollId) ?? 0),
    0,
  );
  const unitPrices = new Set<number>();
  const priceGroups = new Map<
    number,
    { quantidadeUnits: number; valorCentavos: number; rollIds: Set<string> }
  >();

  for (const rollId of rollIds) {
    for (const unitPrice of line.precosUnitariosCentavos.get(rollId) ?? []) {
      unitPrices.add(unitPrice);
    }
    for (const [unitPrice, rollGroup] of line.gruposPrecoPorRoll.get(rollId) ?? []) {
      const group = priceGroups.get(unitPrice) ?? {
        quantidadeUnits: 0,
        valorCentavos: 0,
        rollIds: new Set<string>(),
      };
      group.quantidadeUnits += rollGroup.quantidadeUnits;
      group.valorCentavos += rollGroup.valorCentavos;
      group.rollIds.add(rollId);
      priceGroups.set(unitPrice, group);
    }
  }

  const sortedUnitPrices = Array.from(unitPrices).sort((a, b) => a - b);
  const gruposPreco = Array.from(priceGroups.entries())
    .sort(([priceA], [priceB]) => priceA - priceB)
    .map<GrupoPrecoHistorico>(([unitPrice, group]) => ({
      precoUnitario: fromMoneyCents(unitPrice),
      quantidade: fromQuantityUnits(group.quantidadeUnits),
      valor: fromMoneyCents(group.valorCentavos),
      quantidadeRolls: group.rollIds.size,
    }));
  return {
    quantidade: fromQuantityUnits(quantityUnits),
    valor: fromMoneyCents(valueCents),
    precosUnitarios: sortedUnitPrices.map(fromMoneyCents),
    precoUnitario: sortedUnitPrices.length === 1 ? fromMoneyCents(sortedUnitPrices[0]) : null,
    precoVariavel: sortedUnitPrices.length > 1,
    gruposPreco,
  };
}

export function getClientReportPageTotals(
  report: ConsolidadoRelatorioCliente,
  rollIds: readonly string[],
) {
  const quantityUnits = rollIds.reduce(
    (total, rollId) =>
      total + Math.round((report.totaisPorRoll.get(rollId)?.quantidade ?? 0) * QUANTITY_SCALE),
    0,
  );
  const valueCents = rollIds.reduce(
    (total, rollId) => total + toMoneyCents(report.totaisPorRoll.get(rollId)?.valor ?? 0),
    0,
  );

  return {
    quantidade: fromQuantityUnits(quantityUnits),
    valor: fromMoneyCents(valueCents),
  };
}

export function buildClientReportPdfPages<TRoll extends RollCliente>(
  rolls: readonly TRoll[],
  items: readonly LinhaRelatorioCliente[],
  options: {
    maximumRollsPerPage?: number;
    firstPageItemLimit?: number;
    continuationItemLimit?: number;
  } = {},
): PaginaPdfRelatorioCliente<TRoll>[] {
  const maximumRollsPerPage = Math.max(1, options.maximumRollsPerPage ?? 13);
  const firstPageItemLimit = Math.max(1, options.firstPageItemLimit ?? 12);
  const continuationItemLimit = Math.max(1, options.continuationItemLimit ?? 17);
  const rollGroups: TRoll[][] = [];

  if (rolls.length === 0) {
    rollGroups.push([]);
  } else {
    const rollPageCount = Math.ceil(rolls.length / maximumRollsPerPage);
    const baseGroupSize = Math.floor(rolls.length / rollPageCount);
    const groupsWithExtraRoll = rolls.length % rollPageCount;
    let rollIndex = 0;

    for (let groupIndex = 0; groupIndex < rollPageCount; groupIndex += 1) {
      const groupSize = baseGroupSize + (groupIndex < groupsWithExtraRoll ? 1 : 0);
      rollGroups.push(rolls.slice(rollIndex, rollIndex + groupSize));
      rollIndex += groupSize;
    }
  }

  const pages: PaginaPdfRelatorioCliente<TRoll>[] = [];
  let isFirstReportPage = true;

  for (let rollGroupIndex = 0; rollGroupIndex < rollGroups.length; rollGroupIndex += 1) {
    const rollGroup = rollGroups[rollGroupIndex];
    const rollIds = new Set(rollGroup.map((roll) => String(roll.id ?? "")));
    const groupItems = items.filter((item) =>
      Array.from(rollIds).some((rollId) => item.quantidadeUnitsPorRoll.has(rollId)),
    );

    if (groupItems.length === 0) {
      pages.push({
        rolls: rollGroup,
        items: [],
        showReportHeader: isFirstReportPage,
        showTableTotal: true,
        rollGroupIndex,
        rollGroupCount: rollGroups.length,
        itemPageIndex: 0,
        itemPageCount: 1,
        isContinuation: !isFirstReportPage,
      });
      isFirstReportPage = false;
      continue;
    }

    const itemChunks: LinhaRelatorioCliente[][] = [];
    let itemIndex = 0;
    while (itemIndex < groupItems.length) {
      const itemLimit = isFirstReportPage ? firstPageItemLimit : continuationItemLimit;
      const pageItems = groupItems.slice(itemIndex, itemIndex + itemLimit);
      itemIndex += pageItems.length;

      itemChunks.push(pageItems);
      isFirstReportPage = false;
    }

    for (let itemPageIndex = 0; itemPageIndex < itemChunks.length; itemPageIndex += 1) {
      pages.push({
        rolls: rollGroup,
        items: itemChunks[itemPageIndex],
        showReportHeader: pages.length === 0,
        showTableTotal: itemPageIndex === itemChunks.length - 1,
        rollGroupIndex,
        rollGroupCount: rollGroups.length,
        itemPageIndex,
        itemPageCount: itemChunks.length,
        isContinuation: pages.length > 0,
      });
    }
  }

  return pages;
}
