-- Corrige a aplicação de preços/custos em Rolls antigos e permite ajustes manuais.
-- Pode ser executado diretamente no SQL Editor do Supabase.

BEGIN;

-- Impede que o gatilho antigo recalcule os valores enquanto as novas
-- colunas de referência são preenchidas. Se houver qualquer erro, o BEGIN
-- garante que a remoção do gatilho também seja desfeita.
DROP TRIGGER IF EXISTS trg_rai_calc ON public.rolls_alyani_itens;

ALTER TABLE public.rolls_alyani_itens
  ADD COLUMN IF NOT EXISTS preco_manual BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS preco_data_referencia DATE,
  ADD COLUMN IF NOT EXISTS custo_data_referencia DATE;

-- Os itens antigos continuam usando como referência a data original do Roll.
UPDATE public.rolls_alyani_itens AS item
SET preco_data_referencia = COALESCE(item.preco_data_referencia, roll.data_roll),
    custo_data_referencia = COALESCE(item.custo_data_referencia, roll.data_roll)
FROM public.rolls_alyani AS roll
WHERE roll.id = item.roll_id
  AND (item.preco_data_referencia IS NULL OR item.custo_data_referencia IS NULL);

UPDATE public.rolls_alyani_itens
SET preco_data_referencia = COALESCE(preco_data_referencia, CURRENT_DATE),
    custo_data_referencia = COALESCE(custo_data_referencia, CURRENT_DATE),
    preco_manual = COALESCE(preco_manual, false)
WHERE preco_data_referencia IS NULL
   OR custo_data_referencia IS NULL
   OR preco_manual IS NULL;

ALTER TABLE public.rolls_alyani_itens
  ALTER COLUMN preco_manual SET DEFAULT false,
  ALTER COLUMN preco_manual SET NOT NULL,
  ALTER COLUMN preco_data_referencia SET DEFAULT CURRENT_DATE,
  ALTER COLUMN preco_data_referencia SET NOT NULL,
  ALTER COLUMN custo_data_referencia SET DEFAULT CURRENT_DATE,
  ALTER COLUMN custo_data_referencia SET NOT NULL;

CREATE OR REPLACE FUNCTION public.tg_rolls_alyani_itens_calc()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hotel UUID;
  v_prest UUID;
  v_expresso_roll BOOLEAN;
  v_use_expresso BOOLEAN;
  v_preco NUMERIC(12,2);
  v_custo NUMERIC(12,2) := 0;
  v_data_preco DATE;
  v_data_custo DATE;
  v_hotel_nome TEXT;
  v_peca_nome TEXT;
BEGIN
  SELECT hotel_id, prestadora_id, expresso
    INTO v_hotel, v_prest, v_expresso_roll
  FROM public.rolls_alyani
  WHERE id = NEW.roll_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Roll não encontrado.';
  END IF;

  -- Uma peça incluída ou trocada hoje usa a tabela vigente hoje,
  -- mesmo quando o Roll possui uma data antiga.
  IF TG_OP = 'INSERT'
     OR NEW.peca_id IS DISTINCT FROM OLD.peca_id
     OR NEW.roll_id IS DISTINCT FROM OLD.roll_id THEN
    NEW.preco_data_referencia := CURRENT_DATE;
    NEW.custo_data_referencia := CURRENT_DATE;
    NEW.preco_manual := false;
  END IF;

  v_data_preco := COALESCE(NEW.preco_data_referencia, CURRENT_DATE);
  v_data_custo := COALESCE(NEW.custo_data_referencia, CURRENT_DATE);
  v_use_expresso := COALESCE(NEW.expresso_item, false)
                    OR COALESCE(v_expresso_roll, false);

  -- Quando a tela marca preco_manual, o valor enviado deve ser preservado.
  IF NOT COALESCE(NEW.preco_manual, false) THEN
    SELECT CASE WHEN v_use_expresso THEN valor_expresso ELSE valor_normal END
      INTO v_preco
    FROM public.tabela_precos
    WHERE hotel_id = v_hotel
      AND peca_id = NEW.peca_id
      AND status = 'ativo'
      AND data_vigencia <= v_data_preco
    ORDER BY data_vigencia DESC
    LIMIT 1;

    IF NOT FOUND THEN
      SELECT nome INTO v_hotel_nome FROM public.hoteis WHERE id = v_hotel;
      SELECT nome INTO v_peca_nome FROM public.pecas WHERE id = NEW.peca_id;
      RAISE EXCEPTION
        'Não existe preço vigente para a peça "%" no hotel "%" em %.',
        COALESCE(v_peca_nome, NEW.peca_id::text),
        COALESCE(v_hotel_nome, v_hotel::text),
        to_char(v_data_preco, 'DD/MM/YYYY');
    END IF;

    NEW.valor_unit := COALESCE(v_preco, 0);
  ELSE
    NEW.valor_unit := COALESCE(NEW.valor_unit, 0);
  END IF;

  IF v_prest IS NOT NULL THEN
    SELECT valor
      INTO v_custo
    FROM public.tabela_custos
    WHERE prestadora_id = v_prest
      AND peca_id = NEW.peca_id
      AND status = 'ativo'
      AND data_vigencia <= v_data_custo
    ORDER BY data_vigencia DESC
    LIMIT 1;

    IF NOT FOUND THEN
      v_custo := 0;
    END IF;
  END IF;

  NEW.valor_total := ROUND(COALESCE(NEW.quantidade, 0) * NEW.valor_unit, 2);
  NEW.custo_unit := COALESCE(v_custo, 0);
  NEW.custo_total := ROUND(COALESCE(NEW.quantidade, 0) * NEW.custo_unit, 2);
  NEW.diferenca_receita := NEW.valor_total - NEW.custo_total;
  NEW.updated_at := now();

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_rai_calc
BEFORE INSERT OR UPDATE ON public.rolls_alyani_itens
FOR EACH ROW
EXECUTE FUNCTION public.tg_rolls_alyani_itens_calc();

-- Ao alterar a data do Roll, os itens automáticos passam a usar a nova data.
CREATE OR REPLACE FUNCTION public.tg_roll_after()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.data_roll IS DISTINCT FROM OLD.data_roll THEN
    UPDATE public.rolls_alyani_itens
       SET preco_data_referencia = CASE
             WHEN COALESCE(preco_manual, false) THEN preco_data_referencia
             ELSE NEW.data_roll
           END,
           custo_data_referencia = NEW.data_roll,
           updated_at = now()
     WHERE roll_id = NEW.id;
  ELSE
    UPDATE public.rolls_alyani_itens
       SET updated_at = now()
     WHERE roll_id = NEW.id;
  END IF;

  PERFORM public.tg_roll_recalc(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_roll_after ON public.rolls_alyani;
CREATE TRIGGER trg_roll_after
AFTER UPDATE OF hotel_id, prestadora_id, data_roll, data_vencimento, cobrada, expresso
ON public.rolls_alyani
FOR EACH ROW
EXECUTE FUNCTION public.tg_roll_after();

COMMIT;
