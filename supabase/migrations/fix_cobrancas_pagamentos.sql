
-- ============================================================
-- Fixar sincronização de cobranças e pagamentos
-- ============================================================

-- 1. Adicionar trigger para INSERT em rolls_alyani
DROP TRIGGER IF EXISTS trg_roll_after ON public.rolls_alyani;
CREATE TRIGGER trg_roll_after AFTER INSERT OR UPDATE OF hotel_id, prestadora_id, data_vencimento, cobrada, expresso ON public.rolls_alyani FOR EACH ROW EXECUTE FUNCTION public.tg_roll_after();

-- 2. Recarregar todos os dados para garantir que todas as cobranças e pagamentos existam
DO $$
DECLARE
  roll_id UUID;
BEGIN
  FOR roll_id IN SELECT id FROM public.rolls_alyani LOOP
    -- Primeiro recalcula todos os itens desse roll
    UPDATE public.rolls_alyani_itens SET updated_at = now() WHERE roll_id = roll_id;
    -- Depois recalcula o roll e sincroniza cobrança/pagamento
    PERFORM public.tg_roll_recalc(roll_id);
  END LOOP;
END $$;
