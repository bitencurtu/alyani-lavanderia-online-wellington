
-- ============================================================
-- ENUMS (create only if they don't exist yet)
-- ============================================================
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'app_role') THEN
    CREATE TYPE public.app_role AS ENUM ('admin', 'operador');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'status_ativo') THEN
    CREATE TYPE public.status_ativo AS ENUM ('ativo', 'inativo');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'status_cobranca') THEN
    CREATE TYPE public.status_cobranca AS ENUM ('pendente', 'pago', 'atrasado', 'cancelado');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'status_pagamento') THEN
    CREATE TYPE public.status_pagamento AS ENUM ('pendente', 'pago', 'cancelado');
  END IF;
END $$;

-- ============================================================
-- HELPER: updated_at
-- ============================================================
CREATE OR REPLACE FUNCTION public.tg_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

-- ============================================================
-- PROFILES (create table only if doesn't exist
-- ============================================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nome TEXT,
  email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'profiles' AND policyname = 'profiles_select_all_auth') THEN
    CREATE POLICY "profiles_select_all_auth" ON public.profiles FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'profiles' AND policyname = 'profiles_update_own') THEN
    CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'profiles' AND policyname = 'profiles_insert_own') THEN
    CREATE POLICY "profiles_insert_own" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_profiles_updated') THEN
    CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
  END IF;
END $$;

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, nome)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'nome', NEW.email));
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'operador') ON CONFLICT DO NOTHING;
  RETURN NEW;
END; $$;

-- ============================================================
-- USER ROLES
-- ============================================================
CREATE TABLE IF NOT EXISTS public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'user_roles' AND policyname = 'user_roles_read_own') THEN
    CREATE POLICY "user_roles_read_own" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid());
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

-- Trigger on auth.users (only create if not exists yet)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'on_auth_user_created') THEN
    CREATE TRIGGER on_auth_user_created
      AFTER INSERT ON auth.users
      FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
  END IF;
END $$;

-- ============================================================
-- HOTEIS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.hoteis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  razao_social TEXT,
  cnpj TEXT,
  inscricao TEXT,
  telefone TEXT,
  email TEXT,
  endereco TEXT,
  cep TEXT,
  status public.status_ativo NOT NULL DEFAULT 'ativo',
  observacoes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hoteis TO authenticated;
GRANT ALL ON public.hoteis TO service_role;
ALTER TABLE public.hoteis ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'hoteis' AND policyname = 'hoteis_all_auth') THEN
    CREATE POLICY "hoteis_all_auth" ON public.hoteis FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_hoteis_updated') THEN
    CREATE TRIGGER trg_hoteis_updated BEFORE UPDATE ON public.hoteis FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_hoteis_nome') THEN
    CREATE INDEX idx_hoteis_nome ON public.hoteis(nome);
  END IF;
END $$;

-- ============================================================
-- PRESTADORAS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.prestadoras (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  razao_social TEXT,
  cnpj TEXT,
  telefone TEXT,
  email TEXT,
  endereco TEXT,
  cep TEXT,
  is_alyani BOOLEAN NOT NULL DEFAULT false,
  status public.status_ativo NOT NULL DEFAULT 'ativo',
  observacoes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.prestadoras TO authenticated;
GRANT ALL ON public.prestadoras TO service_role;
ALTER TABLE public.prestadoras ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'prestadoras' AND policyname = 'prestadoras_all_auth') THEN
    CREATE POLICY "prestadoras_all_auth" ON public.prestadoras FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_prestadoras_updated') THEN
    CREATE TRIGGER trg_prestadoras_updated BEFORE UPDATE ON public.prestadoras FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_prestadoras_nome') THEN
    CREATE INDEX idx_prestadoras_nome ON public.prestadoras(nome);
  END IF;
END $$;

-- ============================================================
-- PECAS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.pecas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL UNIQUE,
  status public.status_ativo NOT NULL DEFAULT 'ativo',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pecas TO authenticated;
GRANT ALL ON public.pecas TO service_role;
ALTER TABLE public.pecas ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'pecas' AND policyname = 'pecas_all_auth') THEN
    CREATE POLICY "pecas_all_auth" ON public.pecas FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_pecas_updated') THEN
    CREATE TRIGGER trg_pecas_updated BEFORE UPDATE ON public.pecas FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
  END IF;
END $$;

-- ============================================================
-- TABELA DE PRECOS (clientes)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.tabela_precos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id UUID NOT NULL REFERENCES public.hoteis(id) ON DELETE CASCADE,
  peca_id UUID NOT NULL REFERENCES public.pecas(id) ON DELETE RESTRICT,
  valor_normal NUMERIC(12,2) NOT NULL DEFAULT 0,
  valor_expresso NUMERIC(12,2) NOT NULL DEFAULT 0,
  data_vigencia DATE NOT NULL DEFAULT CURRENT_DATE,
  status public.status_ativo NOT NULL DEFAULT 'ativo',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(hotel_id, peca_id, data_vigencia)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tabela_precos TO authenticated;
GRANT ALL ON public.tabela_precos TO service_role;
ALTER TABLE public.tabela_precos ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'tabela_precos' AND policyname = 'tabela_precos_all_auth') THEN
    CREATE POLICY "tabela_precos_all_auth" ON public.tabela_precos FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_tabela_precos_updated') THEN
    CREATE TRIGGER trg_tabela_precos_updated BEFORE UPDATE ON public.tabela_precos FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_tabela_precos_lookup') THEN
    CREATE INDEX idx_tabela_precos_lookup ON public.tabela_precos(hotel_id, peca_id, data_vigencia DESC);
  END IF;
END $$;

-- ============================================================
-- TABELA DE CUSTOS (prestadoras)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.tabela_custos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prestadora_id UUID NOT NULL REFERENCES public.prestadoras(id) ON DELETE CASCADE,
  peca_id UUID NOT NULL REFERENCES public.pecas(id) ON DELETE RESTRICT,
  valor NUMERIC(12,2) NOT NULL DEFAULT 0,
  data_vigencia DATE NOT NULL DEFAULT CURRENT_DATE,
  status public.status_ativo NOT NULL DEFAULT 'ativo',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(prestadora_id, peca_id, data_vigencia)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tabela_custos TO authenticated;
GRANT ALL ON public.tabela_custos TO service_role;
ALTER TABLE public.tabela_custos ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'tabela_custos' AND policyname = 'tabela_custos_all_auth') THEN
    CREATE POLICY "tabela_custos_all_auth" ON public.tabela_custos FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_tabela_custos_updated') THEN
    CREATE TRIGGER trg_tabela_custos_updated BEFORE UPDATE ON public.tabela_custos FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_tabela_custos_lookup') THEN
    CREATE INDEX idx_tabela_custos_lookup ON public.tabela_custos(prestadora_id, peca_id, data_vigencia DESC);
  END IF;
END $$;

-- ============================================================
-- ROLLS ALYANI
-- ============================================================
CREATE TABLE IF NOT EXISTS public.rolls_alyani (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id UUID NOT NULL REFERENCES public.hoteis(id) ON DELETE RESTRICT,
  prestadora_id UUID REFERENCES public.prestadoras(id) ON DELETE SET NULL,
  numero TEXT NOT NULL,
  data_roll DATE NOT NULL DEFAULT CURRENT_DATE,
  data_vencimento DATE,
  expresso BOOLEAN NOT NULL DEFAULT false,
  cobrada BOOLEAN NOT NULL DEFAULT true,
  nf_fat TEXT,
  observacoes TEXT,
  total_receita NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_custo NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_lucro NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rolls_alyani TO authenticated;
GRANT ALL ON public.rolls_alyani TO service_role;
ALTER TABLE public.rolls_alyani ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'rolls_alyani' AND policyname = 'rolls_alyani_all_auth') THEN
    CREATE POLICY "rolls_alyani_all_auth" ON public.rolls_alyani FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_rolls_alyani_updated') THEN
    CREATE TRIGGER trg_rolls_alyani_updated BEFORE UPDATE ON public.rolls_alyani FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_rolls_alyani_hotel') THEN
    CREATE INDEX idx_rolls_alyani_hotel ON public.rolls_alyani(hotel_id, data_roll DESC);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_rolls_alyani_prest') THEN
    CREATE INDEX idx_rolls_alyani_prest ON public.rolls_alyani(prestadora_id, data_roll DESC);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_rolls_alyani_numero') THEN
    CREATE INDEX idx_rolls_alyani_numero ON public.rolls_alyani(numero);
  END IF;
END $$;

-- ============================================================
-- ITENS ROLL ALYANI
-- ============================================================
CREATE TABLE IF NOT EXISTS public.rolls_alyani_itens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  roll_id UUID NOT NULL REFERENCES public.rolls_alyani(id) ON DELETE CASCADE,
  peca_id UUID NOT NULL REFERENCES public.pecas(id) ON DELETE RESTRICT,
  quantidade NUMERIC(12,2) NOT NULL DEFAULT 0,
  expresso_item BOOLEAN NOT NULL DEFAULT false,
  valor_unit NUMERIC(12,2) NOT NULL DEFAULT 0,
  valor_total NUMERIC(12,2) NOT NULL DEFAULT 0,
  custo_unit NUMERIC(12,2) NOT NULL DEFAULT 0,
  custo_total NUMERIC(12,2) NOT NULL DEFAULT 0,
  diferenca_receita NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rolls_alyani_itens TO authenticated;
GRANT ALL ON public.rolls_alyani_itens TO service_role;
ALTER TABLE public.rolls_alyani_itens ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'rolls_alyani_itens' AND policyname = 'rolls_alyani_itens_all_auth') THEN
    CREATE POLICY "rolls_alyani_itens_all_auth" ON public.rolls_alyani_itens FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_rai_roll') THEN
    CREATE INDEX idx_rai_roll ON public.rolls_alyani_itens(roll_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_rai_peca') THEN
    CREATE INDEX idx_rai_peca ON public.rolls_alyani_itens(peca_id);
  END IF;
END $$;

-- ============================================================
-- TRIGGER: auto-preencher preços e totais ao inserir/alterar item
-- ============================================================
CREATE OR REPLACE FUNCTION public.tg_rolls_alyani_itens_calc()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_hotel UUID;
  v_prest UUID;
  v_data DATE;
  v_expresso_roll BOOLEAN;
  v_use_expresso BOOLEAN;
  v_preco NUMERIC(12,2);
  v_custo NUMERIC(12,2);
BEGIN
  SELECT hotel_id, prestadora_id, data_roll, expresso
    INTO v_hotel, v_prest, v_data, v_expresso_roll
  FROM public.rolls_alyani WHERE id = NEW.roll_id;

  v_use_expresso := COALESCE(NEW.expresso_item, false) OR COALESCE(v_expresso_roll, false);

  -- Busca preço vigente do hotel para a peça (última vigência <= data do roll)
  SELECT CASE WHEN v_use_expresso THEN valor_expresso ELSE valor_normal END
    INTO v_preco
  FROM public.tabela_precos
  WHERE hotel_id = v_hotel
    AND peca_id = NEW.peca_id
    AND status = 'ativo'
    AND data_vigencia <= v_data
  ORDER BY data_vigencia DESC
  LIMIT 1;

  NEW.valor_unit := COALESCE(v_preco, 0);
  NEW.valor_total := ROUND(COALESCE(NEW.quantidade,0) * NEW.valor_unit, 2);

  -- Busca custo vigente da prestadora para a peça
  IF v_prest IS NOT NULL THEN
    SELECT valor INTO v_custo
    FROM public.tabela_custos
    WHERE prestadora_id = v_prest
      AND peca_id = NEW.peca_id
      AND status = 'ativo'
      AND data_vigencia <= v_data
    ORDER BY data_vigencia DESC
    LIMIT 1;
  END IF;

  NEW.custo_unit := COALESCE(v_custo, 0);
  NEW.custo_total := ROUND(COALESCE(NEW.quantidade,0) * NEW.custo_unit, 2);
  NEW.diferenca_receita := NEW.valor_total - NEW.custo_total;
  NEW.updated_at := now();

  RETURN NEW;
END; $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_rai_calc') THEN
    CREATE TRIGGER trg_rai_calc
      BEFORE INSERT OR UPDATE ON public.rolls_alyani_itens
      FOR EACH ROW EXECUTE FUNCTION public.tg_rolls_alyani_itens_calc();
  END IF;
END $$;

-- ============================================================
-- COBRANCAS & PAGAMENTOS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.cobrancas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id UUID NOT NULL REFERENCES public.hoteis(id) ON DELETE CASCADE,
  roll_id UUID NOT NULL UNIQUE REFERENCES public.rolls_alyani(id) ON DELETE CASCADE,
  valor NUMERIC(12,2) NOT NULL DEFAULT 0,
  vencimento DATE,
  status public.status_cobranca NOT NULL DEFAULT 'pendente',
  data_pagamento DATE,
  observacoes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cobrancas TO authenticated;
GRANT ALL ON public.cobrancas TO service_role;
ALTER TABLE public.cobrancas ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'cobrancas' AND policyname = 'cobrancas_all_auth') THEN
    CREATE POLICY "cobrancas_all_auth" ON public.cobrancas FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_cobrancas_updated') THEN
    CREATE TRIGGER trg_cobrancas_updated BEFORE UPDATE ON public.cobrancas FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_cobrancas_hotel') THEN
    CREATE INDEX idx_cobrancas_hotel ON public.cobrancas(hotel_id, vencimento DESC);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.pagamentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prestadora_id UUID NOT NULL REFERENCES public.prestadoras(id) ON DELETE CASCADE,
  roll_id UUID NOT NULL UNIQUE REFERENCES public.rolls_alyani(id) ON DELETE CASCADE,
  valor NUMERIC(12,2) NOT NULL DEFAULT 0,
  status public.status_pagamento NOT NULL DEFAULT 'pendente',
  data_pagamento DATE,
  observacoes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pagamentos TO authenticated;
GRANT ALL ON public.pagamentos TO service_role;
ALTER TABLE public.pagamentos ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'pagamentos' AND policyname = 'pagamentos_all_auth') THEN
    CREATE POLICY "pagamentos_all_auth" ON public.pagamentos FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_pagamentos_updated') THEN
    CREATE TRIGGER trg_pagamentos_updated BEFORE UPDATE ON public.pagamentos FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_pagamentos_prest') THEN
    CREATE INDEX idx_pagamentos_prest ON public.pagamentos(prestadora_id, data_pagamento DESC);
  END IF;
END $$;

-- ============================================================
-- ROLLS PRESTADORA
-- ============================================================
CREATE TABLE IF NOT EXISTS public.rolls_prestadora (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prestadora_id UUID NOT NULL REFERENCES public.prestadoras(id) ON DELETE RESTRICT,
  numero TEXT NOT NULL,
  data_roll DATE NOT NULL DEFAULT CURRENT_DATE,
  observacoes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rolls_prestadora TO authenticated;
GRANT ALL ON public.rolls_prestadora TO service_role;
ALTER TABLE public.rolls_prestadora ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'rolls_prestadora' AND policyname = 'rolls_prestadora_all_auth') THEN
    CREATE POLICY "rolls_prestadora_all_auth" ON public.rolls_prestadora FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_rp_updated') THEN
    CREATE TRIGGER trg_rp_updated BEFORE UPDATE ON public.rolls_prestadora FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_rp_prest') THEN
    CREATE INDEX idx_rp_prest ON public.rolls_prestadora(prestadora_id, data_roll DESC);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_rp_numero') THEN
    CREATE INDEX idx_rp_numero ON public.rolls_prestadora(numero);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.rolls_prestadora_itens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  roll_id UUID NOT NULL REFERENCES public.rolls_prestadora(id) ON DELETE CASCADE,
  peca_id UUID NOT NULL REFERENCES public.pecas(id) ON DELETE RESTRICT,
  quantidade NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rolls_prestadora_itens TO authenticated;
GRANT ALL ON public.rolls_prestadora_itens TO service_role;
ALTER TABLE public.rolls_prestadora_itens ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'rolls_prestadora_itens' AND policyname = 'rpi_all_auth') THEN
    CREATE POLICY "rpi_all_auth" ON public.rolls_prestadora_itens FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_rpi_roll') THEN
    CREATE INDEX idx_rpi_roll ON public.rolls_prestadora_itens(roll_id);
  END IF;
END $$;

-- ============================================================
-- CONFERENCIAS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.conferencias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  roll_alyani_id UUID NOT NULL REFERENCES public.rolls_alyani(id) ON DELETE CASCADE,
  roll_prestadora_id UUID NOT NULL REFERENCES public.rolls_prestadora(id) ON DELETE CASCADE,
  total_divergencias INT NOT NULL DEFAULT 0,
  observacoes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(roll_alyani_id, roll_prestadora_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.conferencias TO authenticated;
GRANT ALL ON public.conferencias TO service_role;
ALTER TABLE public.conferencias ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'conferencias' AND policyname = 'conferencias_all_auth') THEN
    CREATE POLICY "conferencias_all_auth" ON public.conferencias FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_conf_updated') THEN
    CREATE TRIGGER trg_conf_updated BEFORE UPDATE ON public.conferencias FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
  END IF;
END $$;

-- ============================================================
-- TRIGGER: recalcular totais do roll + sincronizar cobrança/pagamento
-- ============================================================
CREATE OR REPLACE FUNCTION public.tg_roll_recalc(_roll_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_hotel UUID; v_prest UUID; v_venc DATE; v_cobrada BOOLEAN;
  v_receita NUMERIC(12,2); v_custo NUMERIC(12,2);
BEGIN
  SELECT hotel_id, prestadora_id, data_vencimento, cobrada
    INTO v_hotel, v_prest, v_venc, v_cobrada
  FROM public.rolls_alyani WHERE id = _roll_id;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT COALESCE(SUM(valor_total),0), COALESCE(SUM(custo_total),0)
    INTO v_receita, v_custo
  FROM public.rolls_alyani_itens WHERE roll_id = _roll_id;

  UPDATE public.rolls_alyani
     SET total_receita = v_receita,
         total_custo   = v_custo,
         total_lucro   = v_receita - v_custo,
         updated_at    = now()
   WHERE id = _roll_id;

  -- Sincroniza cobrança (só se marcada como cobrada)
  IF v_cobrada THEN
    INSERT INTO public.cobrancas (hotel_id, roll_id, valor, vencimento)
    VALUES (v_hotel, _roll_id, v_receita, v_venc)
    ON CONFLICT (roll_id) DO UPDATE
      SET hotel_id = EXCLUDED.hotel_id,
          valor = EXCLUDED.valor,
          vencimento = EXCLUDED.vencimento,
          updated_at = now();
  ELSE
    DELETE FROM public.cobrancas WHERE roll_id = _roll_id AND status = 'pendente';
  END IF;

  -- Sincroniza pagamento à prestadora
  IF v_prest IS NOT NULL THEN
    INSERT INTO public.pagamentos (prestadora_id, roll_id, valor)
    VALUES (v_prest, _roll_id, v_custo)
    ON CONFLICT (roll_id) DO UPDATE
      SET prestadora_id = EXCLUDED.prestadora_id,
          valor = EXCLUDED.valor,
          updated_at = now();
  ELSE
    DELETE FROM public.pagamentos WHERE roll_id = _roll_id AND status = 'pendente';
  END IF;
END; $$;

CREATE OR REPLACE FUNCTION public.tg_rai_after()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.tg_roll_recalc(COALESCE(NEW.roll_id, OLD.roll_id));
  RETURN COALESCE(NEW, OLD);
END; $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_rai_after') THEN
    CREATE TRIGGER trg_rai_after
      AFTER INSERT OR UPDATE OR DELETE ON public.rolls_alyani_itens
      FOR EACH ROW EXECUTE FUNCTION public.tg_rai_after();
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.tg_roll_after()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.tg_roll_recalc(NEW.id);
  RETURN NEW;
END; $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_roll_after') THEN
    CREATE TRIGGER trg_roll_after
      AFTER UPDATE OF hotel_id, prestadora_id, data_vencimento, cobrada, expresso ON public.rolls_alyani
      FOR EACH ROW EXECUTE FUNCTION public.tg_roll_after();
  END IF;
END $$;

-- ============================================================
-- SEED: peças comuns (extraídas das planilhas)
-- ============================================================
INSERT INTO public.pecas (nome) VALUES
 ('FRONHA'),('LENÇOL CASAL'),('LENÇOL SOLTEIRO'),('LENÇOL KING'),('LENÇOL QUEEN'),
 ('LENÇOL BERÇO'),('LENÇOL COM ELÁSTICO'),
 ('TOALHA DE BANHO'),('TOALHA DE ROSTO'),('TOALHA DE PISO'),('TOALHA PRETA'),
 ('EDREDON'),('EDREDON CASAL'),('EDREDON SOLTEIRO'),('EDREDON KING'),('EDREDON QUEEN'),
 ('COBERTOR'),('COBRE-LEITO'),('MANTA'),('DUVET'),('CORTINA'),('COLCHA PIQUET'),
 ('COLCHA DE SOLTEIRO'),('COLCHA DE CASAL'),
 ('CAPA DE TRAVESSEIRO'),('TRAVESSEIRO'),('PESEIRA'),('SAIA DE CAMA'),
 ('PROTETOR DE COLCHÃO'),('ALMOFADA'),('GUARDANAPO')
ON CONFLICT (nome) DO NOTHING;
