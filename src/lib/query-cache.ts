import type { QueryClient, QueryKey } from "@tanstack/react-query";
import { HOTEIS_LITE_QUERY_KEY, PRESTADORAS_LITE_QUERY_KEY } from "@/lib/catalogos";
import { PECAS_LITE_QUERY_KEY } from "@/lib/pecas";

async function invalidateMany(qc: QueryClient, keys: QueryKey[]) {
  await Promise.all(keys.map((queryKey) => qc.invalidateQueries({ queryKey })));
}

const FINANCEIRO_KEYS: QueryKey[] = [
  ["pagamentos"],
  ["cobrancas"],
  ["rolls-fluxo"],
  ["rel-financeiro"],
  ["rel-hotel"],
  ["rel-prestadora"],
  ["rel-cliente"],
  ["dashboard"],
];

const ROLL_ALYANI_KEYS: QueryKey[] = [
  ["rolls_alyani"],
  ["rolls_alyani_all"],
  ["roll"],
  ["roll-itens"],
  ["conf-ra"],
];

const ROLL_PRESTADORA_KEYS: QueryKey[] = [
  ["rolls_prestadora"],
  ["rolls_prestadora_all"],
  ["roll-prestadora"],
  ["roll-prestadora-itens"],
  ["conf-rp"],
];

export async function invalidateFinanceiro(qc: QueryClient) {
  await invalidateMany(qc, FINANCEIRO_KEYS);
}

export async function invalidateRollAlyani(qc: QueryClient) {
  await invalidateMany(qc, [...ROLL_ALYANI_KEYS, ...FINANCEIRO_KEYS]);
}

export async function invalidateRollPrestadora(qc: QueryClient) {
  await invalidateMany(qc, [
    ...ROLL_PRESTADORA_KEYS,
    ["rel-prestadora"],
    ["dashboard"],
  ]);
}

export async function invalidatePecas(qc: QueryClient) {
  await invalidateMany(qc, [
    ["pecas"],
    PECAS_LITE_QUERY_KEY,
    ["precos"],
    ["tabela-custos"],
    ["custos"],
    ["roll-itens"],
    ["roll-prestadora-itens"],
    ["rel-hotel"],
    ["rel-prestadora"],
    ["rel-cliente"],
  ]);
}

export async function invalidateHoteis(qc: QueryClient) {
  await invalidateMany(qc, [
    ["hoteis"],
    HOTEIS_LITE_QUERY_KEY,
    ["precos"],
    ["rolls_alyani"],
    ["roll"],
    ["cobrancas"],
    ["pagamentos"],
    ["rel-hotel"],
    ["rel-cliente"],
    ["rel-financeiro"],
    ["dashboard"],
  ]);
}

export async function invalidatePrestadoras(qc: QueryClient) {
  await invalidateMany(qc, [
    ["prestadoras"],
    PRESTADORAS_LITE_QUERY_KEY,
    ["tabela-custos"],
    ["custos"],
    ["rolls_alyani"],
    ["rolls_prestadora"],
    ["roll"],
    ["roll-prestadora"],
    ["pagamentos"],
    ["rel-prestadora"],
    ["rel-financeiro"],
    ["dashboard"],
  ]);
}

export async function invalidatePrecos(qc: QueryClient) {
  await invalidateMany(qc, [
    ["precos"],
    ["rolls-para-alterar-preco"],
    ...ROLL_ALYANI_KEYS,
    ...FINANCEIRO_KEYS,
  ]);
}

export async function invalidateCustos(qc: QueryClient) {
  await invalidateMany(qc, [
    ["tabela-custos"],
    ["custos"],
    ...ROLL_ALYANI_KEYS,
    ...FINANCEIRO_KEYS,
  ]);
}

export async function invalidateDashboard(qc: QueryClient) {
  await qc.invalidateQueries({ queryKey: ["dashboard"] });
}
