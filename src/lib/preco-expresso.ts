export function calcularValorExpressoAutomatico(valorNormal: number) {
  const valor = Number(valorNormal);
  if (!Number.isFinite(valor)) return 0;
  return Math.round(Math.max(0, valor) * 2 * 100) / 100;
}

export type TiposPrecoAlterados = {
  normalAlterado: boolean;
  expressoAlterado: boolean;
};

export function usaPrecoExpresso(expressoRoll: boolean, expressoItem: boolean) {
  return expressoRoll || expressoItem;
}

export function correspondeAoTipoDePrecoAlterado(
  expressoRoll: boolean,
  expressoItem: boolean,
  alteracao: TiposPrecoAlterados,
) {
  return usaPrecoExpresso(expressoRoll, expressoItem)
    ? alteracao.expressoAlterado
    : alteracao.normalAlterado;
}
