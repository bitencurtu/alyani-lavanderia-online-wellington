
-- ============================================================
-- Add all required pieces (pecas) from user's list
-- ============================================================

INSERT INTO public.pecas (nome) VALUES
  ('FRONHA'),
  ('LENÇOL CASAL'),
  ('LENÇOL SOLTEIRO'),
  ('TOALHA DE PISO'),
  ('TOALHA DE BANHO'),
  ('TOALHA DE ROSTO'),
  ('TRAVESSEIRO'),
  ('COBERTOR'),
  ('EDREDON'),
  ('CORTINA'),
  ('COLCHA PIQUET'),
  ('MANTA'),
  ('AVENTAL'),
  ('BLAZER'),
  ('BLECAUTE'),
  ('CALÇA'),
  ('CAMISA POLO'),
  ('CAPA ALMOFADA'),
  ('COLCHA DE SOLTEIRO'),
  ('DOMA'),
  ('EDREDON CASAL'),
  ('EDREDON KING'),
  ('EDREDON QUEEN'),
  ('GUARDANAPOS'),
  ('JALECO'),
  ('PASSADEIRA'),
  ('PESEIRA'),
  ('TOALHA DE MESA'),
  ('LENÇOL COM ELASTICOS'),
  ('CAPA DE TRAVESSEIRO'),
  ('COBRE LEITO'),
  ('CORTINA BLACK-OUT'),
  ('DUVET'),
  ('ENXOVAL DE BERÇO'),
  ('FRONHA DE BERÇO'),
  ('JAQUETA'),
  ('LUVA'),
  ('PANO DE CHÃO'),
  ('PRANCHÃO'),
  ('PRANCINHA M e P'),
  ('PROTETOR DE COLCHÃO DE CASAL'),
  ('PROTETOR DE COLCHÃO DE SOLTEIRO'),
  ('ROUPÃO'),
  ('SAIA DE CAMA'),
  ('TOALHA BRANCA G e M'),
  ('TOALHA BRANCA P'),
  ('TOALHA DE AMARELA'),
  ('TOALHA DE COZINHA'),
  ('TOALHA DE REDONDA P'),
  ('TOALHA REDONDA BIG G'),
  ('TOALHA REDONDA G'),
  ('TOALHA REDONDA SMALL P'),
  ('COLCHA DE CASAL'),
  ('BLUSA/SAIA SIMPLES'),
  ('CALÇA SLIM'),
  ('CAMISETA BÁSICA'),
  ('CAPA SOFÁ UNIDADE'),
  ('EDREDOM'),
  ('FAIXA'),
  ('LENÇOL'),
  ('LENÇOL KING'),
  ('LENÇOL COM ÓLEO'),
  ('PANTUFA (PAR)'),
  ('PISO'),
  ('PISO COM ÓLEO'),
  ('SHORT'),
  ('TOALHA DE BANHO COM ÓLEO'),
  ('TOALHA DE ROSTO COM ÓLEO'),
  ('PROTETOR DE COLCHÃO')
ON CONFLICT (nome) DO NOTHING;


-- ============================================================
-- Add all 6 hotels (hoteis)
-- ============================================================

INSERT INTO public.hoteis (nome, status) VALUES
  ('NOBILIS', 'ativo'::status_ativo),
  ('NORMADIE', 'ativo'::status_ativo),
  ('LUZ HOTEL', 'ativo'::status_ativo),
  ('HOTEL INTERNACIONAL', 'ativo'::status_ativo),
  ('GUARANI', 'ativo'::status_ativo),
  ('BRUNO 433', 'ativo'::status_ativo)
ON CONFLICT DO NOTHING;


-- ============================================================
-- Insert prices using more reliable approach
-- First get hotel and peca IDs directly, no CTE issues
-- ============================================================

-- NOBILIS
DO $$
DECLARE
  v_hotel_id UUID;
BEGIN
  SELECT id INTO v_hotel_id FROM public.hoteis WHERE nome = 'NOBILIS';
  
  INSERT INTO public.tabela_precos (hotel_id, peca_id, valor_normal, valor_expresso, data_vigencia, status)
  SELECT v_hotel_id, id, 1.30, 1.95, CURRENT_DATE, 'ativo'::status_ativo FROM public.pecas WHERE nome = 'FRONHA'
  UNION ALL SELECT v_hotel_id, id, 1.30, 1.95, CURRENT_DATE, 'ativo'::status_ativo FROM public.pecas WHERE nome = 'LENÇOL CASAL'
  UNION ALL SELECT v_hotel_id, id, 1.30, 1.95, CURRENT_DATE, 'ativo'::status_ativo FROM public.pecas WHERE nome = 'LENÇOL SOLTEIRO'
  UNION ALL SELECT v_hotel_id, id, 1.30, 1.95, CURRENT_DATE, 'ativo'::status_ativo FROM public.pecas WHERE nome = 'TOALHA DE PISO'
  UNION ALL SELECT v_hotel_id, id, 1.30, 1.95, CURRENT_DATE, 'ativo'::status_ativo FROM public.pecas WHERE nome = 'TOALHA DE BANHO'
  UNION ALL SELECT v_hotel_id, id, 1.30, 1.95, CURRENT_DATE, 'ativo'::status_ativo FROM public.pecas WHERE nome = 'TOALHA DE ROSTO'
  UNION ALL SELECT v_hotel_id, id, 12.00, 18.00, CURRENT_DATE, 'ativo'::status_ativo FROM public.pecas WHERE nome = 'TRAVESSEIRO'
  UNION ALL SELECT v_hotel_id, id, 13.00, 19.50, CURRENT_DATE, 'ativo'::status_ativo FROM public.pecas WHERE nome = 'COBERTOR'
  UNION ALL SELECT v_hotel_id, id, 15.00, 22.50, CURRENT_DATE, 'ativo'::status_ativo FROM public.pecas WHERE nome = 'EDREDON'
  UNION ALL SELECT v_hotel_id, id, 50.00, 75.00, CURRENT_DATE, 'ativo'::status_ativo FROM public.pecas WHERE nome = 'CORTINA'
  UNION ALL SELECT v_hotel_id, id, 7.50, 11.25, CURRENT_DATE, 'ativo'::status_ativo FROM public.pecas WHERE nome = 'COLCHA PIQUET'
  UNION ALL SELECT v_hotel_id, id, 13.00, 19.50, CURRENT_DATE, 'ativo'::status_ativo FROM public.pecas WHERE nome = 'MANTA'
  ON CONFLICT (hotel_id, peca_id, data_vigencia) DO NOTHING;
END $$;

-- NORMADIE
DO $$
DECLARE
  v_hotel_id UUID;
BEGIN
  SELECT id INTO v_hotel_id FROM public.hoteis WHERE nome = 'NORMADIE';
  
  INSERT INTO public.tabela_precos (hotel_id, peca_id, valor_normal, valor_expresso, data_vigencia, status)
  SELECT v_hotel_id, id, 7.00, 10.50, CURRENT_DATE, 'ativo'::status_ativo FROM public.pecas WHERE nome = 'AVENTAL'
  UNION ALL SELECT v_hotel_id, id, 20.00, 30.00, CURRENT_DATE, 'ativo'::status_ativo FROM public.pecas WHERE nome = 'BLAZER'
  UNION ALL SELECT v_hotel_id, id, 60.00, 90.00, CURRENT_DATE, 'ativo'::status_ativo FROM public.pecas WHERE nome = 'BLECAUTE'
  UNION ALL SELECT v_hotel_id, id, 15.00, 22.50, CURRENT_DATE, 'ativo'::status_ativo FROM public.pecas WHERE nome = 'CALÇA'
  UNION ALL SELECT v_hotel_id, id, 10.00, 15.00, CURRENT_DATE, 'ativo'::status_ativo FROM public.pecas WHERE nome = 'CAMISA POLO'
  UNION ALL SELECT v_hotel_id, id, 20.00, 30.00, CURRENT_DATE, 'ativo'::status_ativo FROM public.pecas WHERE nome = 'CAPA ALMOFADA'
  UNION ALL SELECT v_hotel_id, id, 16.00, 24.00, CURRENT_DATE, 'ativo'::status_ativo FROM public.pecas WHERE nome = 'COBERTOR'
  UNION ALL SELECT v_hotel_id, id, 15.00, 22.50, CURRENT_DATE, 'ativo'::status_ativo FROM public.pecas WHERE nome = 'COLCHA DE SOLTEIRO'
  UNION ALL SELECT v_hotel_id, id, 50.00, 75.00, CURRENT_DATE, 'ativo'::status_ativo FROM public.pecas WHERE nome = 'CORTINA'
  UNION ALL SELECT v_hotel_id, id, 13.00, 19.50, CURRENT_DATE, 'ativo'::status_ativo FROM public.pecas WHERE nome = 'DOMA'
  UNION ALL SELECT v_hotel_id, id, 20.00, 30.00, CURRENT_DATE, 'ativo'::status_ativo FROM public.pecas WHERE nome = 'EDREDON CASAL'
  UNION ALL SELECT v_hotel_id, id, 25.00, 37.50, CURRENT_DATE, 'ativo'::status_ativo FROM public.pecas WHERE nome = 'EDREDON KING'
  UNION ALL SELECT v_hotel_id, id, 25.00, 37.50, CURRENT_DATE, 'ativo'::status_ativo FROM public.pecas WHERE nome = 'EDREDON QUEEN'
  UNION ALL SELECT v_hotel_id, id, 20.00, 30.00, CURRENT_DATE, 'ativo'::status_ativo FROM public.pecas WHERE nome = 'EDREDON SOLTEIRO'
  UNION ALL SELECT v_hotel_id, id, 3.00, 4.50, CURRENT_DATE, 'ativo'::status_ativo FROM public.pecas WHERE nome = 'GUARDANAPOS'
  UNION ALL SELECT v_hotel_id, id, 10.00, 15.00, CURRENT_DATE, 'ativo'::status_ativo FROM public.pecas WHERE nome = 'JALECO'
  UNION ALL SELECT v_hotel_id, id, 16.00, 24.00, CURRENT_DATE, 'ativo'::status_ativo FROM public.pecas WHERE nome = 'MANTA'
  UNION ALL SELECT v_hotel_id, id, 20.00, 30.00, CURRENT_DATE, 'ativo'::status_ativo FROM public.pecas WHERE nome = 'PASSADEIRA'
  UNION ALL SELECT v_hotel_id, id, 10.00, 15.00, CURRENT_DATE, 'ativo'::status_ativo FROM public.pecas WHERE nome = 'PESEIRA'
  UNION ALL SELECT v_hotel_id, id, 8.00, 12.00, CURRENT_DATE, 'ativo'::status_ativo FROM public.pecas WHERE nome = 'TOALHA DE MESA'
  UNION ALL SELECT v_hotel_id, id, 13.50, 20.25, CURRENT_DATE, 'ativo'::status_ativo FROM public.pecas WHERE nome = 'TRAVESSEIRO'
  UNION ALL SELECT v_hotel_id, id, 3.50, 5.25, CURRENT_DATE, 'ativo'::status_ativo FROM public.pecas WHERE nome = 'LENÇOL COM ELASTICOS'
  UNION ALL SELECT v_hotel_id, id, 3.50, 5.25, CURRENT_DATE, 'ativo'::status_ativo FROM public.pecas WHERE nome = 'FRONHA'
  ON CONFLICT (hotel_id, peca_id, data_vigencia) DO NOTHING;
END $$;

-- LUZ HOTEL
DO $$
DECLARE
  v_hotel_id UUID;
BEGIN
  SELECT id INTO v_hotel_id FROM public.hoteis WHERE nome = 'LUZ HOTEL';
  
  INSERT INTO public.tabela_precos (hotel_id, peca_id, valor_normal, valor_expresso, data_vigencia, status)
  SELECT v_hotel_id, id, 5.00, 7.50, CURRENT_DATE, 'ativo'::status_ativo FROM public.pecas WHERE nome = 'CAPA DE TRAVESSEIRO'
  UNION ALL SELECT v_hotel_id, id, 25.00, 37.50, CURRENT_DATE, 'ativo'::status_ativo FROM public.pecas WHERE nome = 'COBERTOR'
  UNION ALL SELECT v_hotel_id, id, 17.00, 25.50, CURRENT_DATE, 'ativo'::status_ativo FROM public.pecas WHERE nome = 'COBRE LEITO'
  UNION ALL SELECT v_hotel_id, id, 5.00, 7.50, CURRENT_DATE, 'ativo'::status_ativo FROM public.pecas WHERE nome = 'COLCHA PIQUET'
  UNION ALL SELECT v_hotel_id, id, 50.00, 75.00, CURRENT_DATE, 'ativo'::status_ativo FROM public.pecas WHERE nome = 'CORTINA'
  UNION ALL SELECT v_hotel_id, id, 60.00, 90.00, CURRENT_DATE, 'ativo'::status_ativo FROM public.pecas WHERE nome = 'CORTINA BLACK-OUT'
  UNION ALL SELECT v_hotel_id, id, 5.00, 7.50, CURRENT_DATE, 'ativo'::status_ativo FROM public.pecas WHERE nome = 'DUVET'
  UNION ALL SELECT v_hotel_id, id, 25.00, 37.50, CURRENT_DATE, 'ativo'::status_ativo FROM public.pecas WHERE nome = 'EDREDON'
  UNION ALL SELECT v_hotel_id, id, 30.00, 45.00, CURRENT_DATE, 'ativo'::status_ativo FROM public.pecas WHERE nome = 'EDREDON CASAL'
  UNION ALL SELECT v_hotel_id, id, 40.00, 60.00, CURRENT_DATE, 'ativo'::status_ativo FROM public.pecas WHERE nome = 'EDREDON KING'
  UNION ALL SELECT v_hotel_id, id, 35.00, 52.50, CURRENT_DATE, 'ativo'::status_ativo FROM public.pecas WHERE nome = 'EDREDON QUEEN'
  UNION ALL SELECT v_hotel_id, id, 20.00, 30.00, CURRENT_DATE, 'ativo'::status_ativo FROM public.pecas WHERE nome = 'EDREDON SOLTEIRO'
  UNION ALL SELECT v_hotel_id, id, 1.65, 2.48, CURRENT_DATE, 'ativo'::status_ativo FROM public.pecas WHERE nome = 'ENXOVAL DE BERÇO'
  UNION ALL SELECT v_hotel_id, id, 1.65, 2.48, CURRENT_DATE, 'ativo'::status_ativo FROM public.pecas WHERE nome = 'FRONHA'
  UNION ALL SELECT v_hotel_id, id, 1.65, 2.48, CURRENT_DATE, 'ativo'::status_ativo FROM public.pecas WHERE nome = 'FRONHA DE BERÇO'
  UNION ALL SELECT v_hotel_id, id, 1.00, 1.50, CURRENT_DATE, 'ativo'::status_ativo FROM public.pecas WHERE nome = 'GUARDANAPOS'
  UNION ALL SELECT v_hotel_id, id, 60.00, 90.00, CURRENT_DATE, 'ativo'::status_ativo FROM public.pecas WHERE nome = 'JAQUETA'
  UNION ALL SELECT v_hotel_id, id, 1.65, 2.48, CURRENT_DATE, 'ativo'::status_ativo FROM public.pecas WHERE nome = 'LENÇOL DE CASAL'
  UNION ALL SELECT v_hotel_id, id, 1.65, 2.48, CURRENT_DATE, 'ativo'::status_ativo FROM public.pecas WHERE nome = 'LENÇOL DE SOLTEIRO'
  UNION ALL SELECT v_hotel_id, id, 4.00, 6.00, CURRENT_DATE, 'ativo'::status_ativo FROM public.pecas WHERE nome = 'LUVA'
  UNION ALL SELECT v_hotel_id, id, 1.50, 2.25, CURRENT_DATE, 'ativo'::status_ativo FROM public.pecas WHERE nome = 'PANO DE CHÃO'
  UNION ALL SELECT v_hotel_id, id, 6.00, 9.00, CURRENT_DATE, 'ativo'::status_ativo FROM public.pecas WHERE nome = 'PESEIRA'
  UNION ALL SELECT v_hotel_id, id, 4.00, 6.00, CURRENT_DATE, 'ativo'::status_ativo FROM public.pecas WHERE nome = 'PRANCHÃO'
  UNION ALL SELECT v_hotel_id, id, 4.00, 6.00, CURRENT_DATE, 'ativo'::status_ativo FROM public.pecas WHERE nome = 'PRANCINHA M e P'
  UNION ALL SELECT v_hotel_id, id, 7.00, 10.50, CURRENT_DATE, 'ativo'::status_ativo FROM public.pecas WHERE nome = 'PROTETOR DE COLCHÃO DE CASAL'
  UNION ALL SELECT v_hotel_id, id, 6.00, 9.00, CURRENT_DATE, 'ativo'::status_ativo FROM public.pecas WHERE nome = 'PROTETOR DE COLCHÃO DE SOLTEIRO'
  UNION ALL SELECT v_hotel_id, id, 5.00, 7.50, CURRENT_DATE, 'ativo'::status_ativo FROM public.pecas WHERE nome = 'PROTETOR TRAVESSEIRO'
  UNION ALL SELECT v_hotel_id, id, 5.00, 7.50, CURRENT_DATE, 'ativo'::status_ativo FROM public.pecas WHERE nome = 'ROUPÃO'
  UNION ALL SELECT v_hotel_id, id, 15.00, 22.50, CURRENT_DATE, 'ativo'::status_ativo FROM public.pecas WHERE nome = 'SAIA DE CAMA'
  UNION ALL SELECT v_hotel_id, id, 7.00, 10.50, CURRENT_DATE, 'ativo'::status_ativo FROM public.pecas WHERE nome = 'TOALHA BRANCA G e M'
  UNION ALL SELECT v_hotel_id, id, 6.00, 9.00, CURRENT_DATE, 'ativo'::status_ativo FROM public.pecas WHERE nome = 'TOALHA BRANCA P'
  UNION ALL SELECT v_hotel_id, id, 6.00, 9.00, CURRENT_DATE, 'ativo'::status_ativo FROM public.pecas WHERE nome = 'TOALHA DE AMARELA'
  UNION ALL SELECT v_hotel_id, id, 1.65, 2.48, CURRENT_DATE, 'ativo'::status_ativo FROM public.pecas WHERE nome = 'TOALHA DE BANHO'
  UNION ALL SELECT v_hotel_id, id, 8.00, 12.00, CURRENT_DATE, 'ativo'::status_ativo FROM public.pecas WHERE nome = 'TOALHA DE COZINHA'
  UNION ALL SELECT v_hotel_id, id, 1.65, 2.48, CURRENT_DATE, 'ativo'::status_ativo FROM public.pecas WHERE nome = 'TOALHA DE PISO'
  UNION ALL SELECT v_hotel_id, id, 6.00, 9.00, CURRENT_DATE, 'ativo'::status_ativo FROM public.pecas WHERE nome = 'TOALHA DE REDONDA P'
  UNION ALL SELECT v_hotel_id, id, 1.65, 2.48, CURRENT_DATE, 'ativo'::status_ativo FROM public.pecas WHERE nome = 'TOALHA DE ROSTO'
  UNION ALL SELECT v_hotel_id, id, 28.00, 42.00, CURRENT_DATE, 'ativo'::status_ativo FROM public.pecas WHERE nome = 'TOALHA REDONDA BIG G'
  UNION ALL SELECT v_hotel_id, id, 7.00, 10.50, CURRENT_DATE, 'ativo'::status_ativo FROM public.pecas WHERE nome = 'TOALHA REDONDA G'
  UNION ALL SELECT v_hotel_id, id, 28.00, 42.00, CURRENT_DATE, 'ativo'::status_ativo FROM public.pecas WHERE nome = 'TOALHA REDONDA SMALL P'
  UNION ALL SELECT v_hotel_id, id, 14.00, 21.00, CURRENT_DATE, 'ativo'::status_ativo FROM public.pecas WHERE nome = 'TRAVESSEIRO'
  ON CONFLICT (hotel_id, peca_id, data_vigencia) DO NOTHING;
END $$;

-- HOTEL INTERNACIONAL
DO $$
DECLARE
  v_hotel_id UUID;
BEGIN
  SELECT id INTO v_hotel_id FROM public.hoteis WHERE nome = 'HOTEL INTERNACIONAL';
  
  INSERT INTO public.tabela_precos (hotel_id, peca_id, valor_normal, valor_expresso, data_vigencia, status)
  SELECT v_hotel_id, id, 1.80, 2.70, CURRENT_DATE, 'ativo'::status_ativo FROM public.pecas WHERE nome = 'FRONHA'
  UNION ALL SELECT v_hotel_id, id, 1.80, 2.70, CURRENT_DATE, 'ativo'::status_ativo FROM public.pecas WHERE nome = 'LENÇOL CASAL'
  UNION ALL SELECT v_hotel_id, id, 1.80, 2.70, CURRENT_DATE, 'ativo'::status_ativo FROM public.pecas WHERE nome = 'LENÇOL SOLTEIRO'
  UNION ALL SELECT v_hotel_id, id, 7.00, 10.50, CURRENT_DATE, 'ativo'::status_ativo FROM public.pecas WHERE nome = 'COLCHA DE CASAL'
  UNION ALL SELECT v_hotel_id, id, 13.00, 19.50, CURRENT_DATE, 'ativo'::status_ativo FROM public.pecas WHERE nome = 'COBERTOR'
  UNION ALL SELECT v_hotel_id, id, 1.80, 2.70, CURRENT_DATE, 'ativo'::status_ativo FROM public.pecas WHERE nome = 'TOALHA DE BANHO'
  UNION ALL SELECT v_hotel_id, id, 1.80, 2.70, CURRENT_DATE, 'ativo'::status_ativo FROM public.pecas WHERE nome = 'TOALHA DE PISO'
  UNION ALL SELECT v_hotel_id, id, 1.80, 2.70, CURRENT_DATE, 'ativo'::status_ativo FROM public.pecas WHERE nome = 'TOALHA DE ROSTO'
  UNION ALL SELECT v_hotel_id, id, 12.00, 18.00, CURRENT_DATE, 'ativo'::status_ativo FROM public.pecas WHERE nome = 'SAIA DE CAMA'
  UNION ALL SELECT v_hotel_id, id, 50.00, 75.00, CURRENT_DATE, 'ativo'::status_ativo FROM public.pecas WHERE nome = 'CORTINA'
  UNION ALL SELECT v_hotel_id, id, 6.00, 9.00, CURRENT_DATE, 'ativo'::status_ativo FROM public.pecas WHERE nome = 'CAPA DE TRAVESSEIRO'
  ON CONFLICT (hotel_id, peca_id, data_vigencia) DO NOTHING;
END $$;

-- GUARANI
DO $$
DECLARE
  v_hotel_id UUID;
BEGIN
  SELECT id INTO v_hotel_id FROM public.hoteis WHERE nome = 'GUARANI';
  
  INSERT INTO public.tabela_precos (hotel_id, peca_id, valor_normal, valor_expresso, data_vigencia, status)
  SELECT v_hotel_id, id, 6.00, 9.00, CURRENT_DATE, 'ativo'::status_ativo FROM public.pecas WHERE nome = 'BLUSA/SAIA SIMPLES'
  UNION ALL SELECT v_hotel_id, id, 9.80, 14.70, CURRENT_DATE, 'ativo'::status_ativo FROM public.pecas WHERE nome = 'CALÇA SLIM'
  UNION ALL SELECT v_hotel_id, id, 7.00, 10.50, CURRENT_DATE, 'ativo'::status_ativo FROM public.pecas WHERE nome = 'CAMISETA BÁSICA'
  UNION ALL SELECT v_hotel_id, id, 5.00, 7.50, CURRENT_DATE, 'ativo'::status_ativo FROM public.pecas WHERE nome = 'CAPA ALMOFADA'
  UNION ALL SELECT v_hotel_id, id, 28.00, 42.00, CURRENT_DATE, 'ativo'::status_ativo FROM public.pecas WHERE nome = 'CAPA SOFÁ UNIDADE'
  UNION ALL SELECT v_hotel_id, id, 17.00, 25.50, CURRENT_DATE, 'ativo'::status_ativo FROM public.pecas WHERE nome = 'EDREDOM'
  UNION ALL SELECT v_hotel_id, id, 2.00, 3.00, CURRENT_DATE, 'ativo'::status_ativo FROM public.pecas WHERE nome = 'FAIXA'
  UNION ALL SELECT v_hotel_id, id, 1.30, 1.95, CURRENT_DATE, 'ativo'::status_ativo FROM public.pecas WHERE nome = 'FRONHA'
  UNION ALL SELECT v_hotel_id, id, 1.60, 2.40, CURRENT_DATE, 'ativo'::status_ativo FROM public.pecas WHERE nome = 'LENÇOL'
  UNION ALL SELECT v_hotel_id, id, 1.80, 2.70, CURRENT_DATE, 'ativo'::status_ativo FROM public.pecas WHERE nome = 'LENÇOL COM ELASTICO'
  UNION ALL SELECT v_hotel_id, id, 1.75, 2.63, CURRENT_DATE, 'ativo'::status_ativo FROM public.pecas WHERE nome = 'LENÇOL KING'
  UNION ALL SELECT v_hotel_id, id, 1.80, 2.70, CURRENT_DATE, 'ativo'::status_ativo FROM public.pecas WHERE nome = 'LENÇOL COM ÓLEO'
  UNION ALL SELECT v_hotel_id, id, 5.00, 7.50, CURRENT_DATE, 'ativo'::status_ativo FROM public.pecas WHERE nome = 'MANTA'
  UNION ALL SELECT v_hotel_id, id, 2.00, 3.00, CURRENT_DATE, 'ativo'::status_ativo FROM public.pecas WHERE nome = 'PANO DE CHÃO'
  UNION ALL SELECT v_hotel_id, id, 1.10, 1.65, CURRENT_DATE, 'ativo'::status_ativo FROM public.pecas WHERE nome = 'PANO DE COPA/LIMPEZA'
  UNION ALL SELECT v_hotel_id, id, 3.00, 4.50, CURRENT_DATE, 'ativo'::status_ativo FROM public.pecas WHERE nome = 'PANTUFA (PAR)'
  UNION ALL SELECT v_hotel_id, id, 1.30, 1.95, CURRENT_DATE, 'ativo'::status_ativo FROM public.pecas WHERE nome = 'PISO'
  UNION ALL SELECT v_hotel_id, id, 2.00, 3.00, CURRENT_DATE, 'ativo'::status_ativo FROM public.pecas WHERE nome = 'PISO COM ÓLEO'
  UNION ALL SELECT v_hotel_id, id, 2.00, 3.00, CURRENT_DATE, 'ativo'::status_ativo FROM public.pecas WHERE nome = 'ROUPÃO'
  UNION ALL SELECT v_hotel_id, id, 1.50, 2.25, CURRENT_DATE, 'ativo'::status_ativo FROM public.pecas WHERE nome = 'SHORT'
  UNION ALL SELECT v_hotel_id, id, 1.50, 2.25, CURRENT_DATE, 'ativo'::status_ativo FROM public.pecas WHERE nome = 'TOALHA DE BANHO'
  UNION ALL SELECT v_hotel_id, id, 1.60, 2.40, CURRENT_DATE, 'ativo'::status_ativo FROM public.pecas WHERE nome = 'TOALHA DE BANHO COM ÓLEO'
  UNION ALL SELECT v_hotel_id, id, 6.00, 9.00, CURRENT_DATE, 'ativo'::status_ativo FROM public.pecas WHERE nome = 'TOALHA DE MESA PEQUENA'
  UNION ALL SELECT v_hotel_id, id, 1.30, 1.95, CURRENT_DATE, 'ativo'::status_ativo FROM public.pecas WHERE nome = 'TOALHA DE ROSTO'
  UNION ALL SELECT v_hotel_id, id, 1.60, 2.40, CURRENT_DATE, 'ativo'::status_ativo FROM public.pecas WHERE nome = 'TOALHA DE ROSTO COM ÓLEO'
  UNION ALL SELECT v_hotel_id, id, 15.00, 22.50, CURRENT_DATE, 'ativo'::status_ativo FROM public.pecas WHERE nome = 'TRAVESSEIRO'
  ON CONFLICT (hotel_id, peca_id, data_vigencia) DO NOTHING;
END $$;

-- BRUNO 433
DO $$
DECLARE
  v_hotel_id UUID;
BEGIN
  SELECT id INTO v_hotel_id FROM public.hoteis WHERE nome = 'BRUNO 433';
  
  INSERT INTO public.tabela_precos (hotel_id, peca_id, valor_normal, valor_expresso, data_vigencia, status)
  SELECT v_hotel_id, id, 2.15, 3.23, CURRENT_DATE, 'ativo'::status_ativo FROM public.pecas WHERE nome = 'FRONHA'
  UNION ALL SELECT v_hotel_id, id, 2.15, 3.23, CURRENT_DATE, 'ativo'::status_ativo FROM public.pecas WHERE nome = 'LENÇOL CASAL'
  UNION ALL SELECT v_hotel_id, id, 2.15, 3.23, CURRENT_DATE, 'ativo'::status_ativo FROM public.pecas WHERE nome = 'LENÇOL SOLTEIRO'
  UNION ALL SELECT v_hotel_id, id, 2.15, 3.23, CURRENT_DATE, 'ativo'::status_ativo FROM public.pecas WHERE nome = 'TOALHA DE PISO'
  UNION ALL SELECT v_hotel_id, id, 2.15, 3.23, CURRENT_DATE, 'ativo'::status_ativo FROM public.pecas WHERE nome = 'TOALHA DE BANHO'
  UNION ALL SELECT v_hotel_id, id, 2.15, 3.23, CURRENT_DATE, 'ativo'::status_ativo FROM public.pecas WHERE nome = 'TOALHA DE ROSTO'
  UNION ALL SELECT v_hotel_id, id, 10.00, 15.00, CURRENT_DATE, 'ativo'::status_ativo FROM public.pecas WHERE nome = 'PESEIRA'
  UNION ALL SELECT v_hotel_id, id, 15.00, 22.50, CURRENT_DATE, 'ativo'::status_ativo FROM public.pecas WHERE nome = 'PROTETOR DE COLCHÃO'
  UNION ALL SELECT v_hotel_id, id, 15.00, 22.50, CURRENT_DATE, 'ativo'::status_ativo FROM public.pecas WHERE nome = 'CAPA DE TRAVESSEIRO'
  UNION ALL SELECT v_hotel_id, id, 15.00, 22.50, CURRENT_DATE, 'ativo'::status_ativo FROM public.pecas WHERE nome = 'SAIA DE CAMA'
  UNION ALL SELECT v_hotel_id, id, 15.00, 22.50, CURRENT_DATE, 'ativo'::status_ativo FROM public.pecas WHERE nome = 'DUVET'
  UNION ALL SELECT v_hotel_id, id, 25.00, 37.50, CURRENT_DATE, 'ativo'::status_ativo FROM public.pecas WHERE nome = 'COBERTOR'
  UNION ALL SELECT v_hotel_id, id, 25.00, 37.50, CURRENT_DATE, 'ativo'::status_ativo FROM public.pecas WHERE nome = 'EDREDON'
  UNION ALL SELECT v_hotel_id, id, 25.00, 37.50, CURRENT_DATE, 'ativo'::status_ativo FROM public.pecas WHERE nome = 'MANTA'
  ON CONFLICT (hotel_id, peca_id, data_vigencia) DO NOTHING;
END $$;
