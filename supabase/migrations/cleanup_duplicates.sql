
-- ============================================================
-- Limpar hoteis duplicados e corrigir o nome Bruno
-- ============================================================

-- Passo 1: Deletar hoteis duplicados (manter apenas o mais antigo para cada nome)
DELETE FROM public.hoteis
WHERE id NOT IN (
  SELECT DISTINCT ON (nome) id
  FROM public.hoteis
  ORDER BY nome, created_at ASC
);

-- Passo 2: Renomear "BRUNO 443" para "BRUNO 433" (se existir)
UPDATE public.hoteis
SET nome = 'BRUNO 433'
WHERE nome = 'BRUNO 443';

-- ============================================================
-- Verificar o resultado final
-- ============================================================
SELECT * FROM public.hoteis;
