-- ============================================================
-- MIGRATION: financeiro_module
-- Data: 2026-03-20
-- Descrição: Módulo financeiro — tabela de preços, cobranças e pagamentos
-- ============================================================

-- ============================================================
-- TABELA DE PREÇOS
-- ============================================================
CREATE TABLE IF NOT EXISTS price_table (
  id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  codigo        TEXT NOT NULL UNIQUE,
  descricao     TEXT NOT NULL,
  valor         NUMERIC(10,2) NOT NULL,
  ativo         BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO price_table (codigo, descricao, valor) VALUES
  ('dae_principal',        'Taxa de Serviço DAE (Transferência / 1º Emplacamento / 2ª Via)', 150.54),
  ('vistoria',             'Taxa de Vistoria Veicular',                                      133.17),
  ('placa_carro_mercosul', 'Placa Carro Mercosul (par)',                                     200.00),
  ('placa_moto_mercosul',  'Placa Moto Mercosul',                                            150.00),
  ('placa_carro_comum',    'Placa Carro Comum (par)',                                        180.00),
  ('placa_moto_comum',     'Placa Moto Comum',                                               130.00)
ON CONFLICT (codigo) DO NOTHING;

-- ============================================================
-- COBRANÇAS POR OS
-- ============================================================
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'finance_charge_categoria') THEN
    CREATE TYPE finance_charge_categoria AS ENUM
      ('dae_principal', 'dae_adicional', 'vistoria', 'placa', 'outro');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'finance_charge_status') THEN
    CREATE TYPE finance_charge_status AS ENUM
      ('a_pagar', 'pago', 'cancelado');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS finance_charges (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  os_id           TEXT NOT NULL REFERENCES ordens_de_servico(id) ON DELETE CASCADE,
  descricao       TEXT NOT NULL,
  categoria       finance_charge_categoria NOT NULL,
  valor_previsto  NUMERIC(10,2) NOT NULL,
  valor_pago      NUMERIC(10,2) NOT NULL DEFAULT 0,
  due_date        DATE,
  status          finance_charge_status NOT NULL DEFAULT 'a_pagar',
  comprovante_url TEXT,
  observacao      TEXT,
  criado_em       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_finance_charges_os_id ON finance_charges(os_id);
CREATE INDEX IF NOT EXISTS idx_finance_charges_status ON finance_charges(status);

-- ============================================================
-- PAGAMENTOS
-- ============================================================
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_metodo') THEN
    CREATE TYPE payment_metodo AS ENUM ('pix', 'boleto', 'cartao', 'dinheiro', 'ted', 'outro');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS payments (
  id               TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  os_id            TEXT NOT NULL REFERENCES ordens_de_servico(id) ON DELETE CASCADE,
  charge_id        TEXT NOT NULL REFERENCES finance_charges(id) ON DELETE CASCADE,
  data_pagamento   DATE NOT NULL,
  valor            NUMERIC(10,2) NOT NULL,
  metodo           payment_metodo NOT NULL DEFAULT 'pix',
  instituicao      TEXT,
  comprovante_url  TEXT,
  observacao       TEXT,
  criado_em        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payments_os_id      ON payments(os_id);
CREATE INDEX IF NOT EXISTS idx_payments_charge_id  ON payments(charge_id);
CREATE INDEX IF NOT EXISTS idx_payments_data_pag   ON payments(data_pagamento);

-- ============================================================
-- RLS (Row Level Security)
-- ============================================================
ALTER TABLE price_table     ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_charges ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments        ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  -- Drop existing policies if they exist (to avoid duplication or conflicts with UUID version)
  DROP POLICY IF EXISTS "auth_all_price_table" ON price_table;
  DROP POLICY IF EXISTS "auth_all_finance_charges" ON finance_charges;
  DROP POLICY IF EXISTS "auth_all_payments" ON payments;
  
  -- Public access policies (standard for this CRM)
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'price_table' AND policyname = 'Allow all access to price_table') THEN
    CREATE POLICY "Allow all access to price_table" ON price_table FOR ALL USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'finance_charges' AND policyname = 'Allow all access to finance_charges') THEN
    CREATE POLICY "Allow all access to finance_charges" ON finance_charges FOR ALL USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'payments' AND policyname = 'Allow all access to payments') THEN
    CREATE POLICY "Allow all access to payments" ON payments FOR ALL USING (true) WITH CHECK (true);
  END IF;
END$$;

-- ============================================================
-- FUNCTIONS & TRIGGERS
-- ============================================================

-- Function to update updated_at
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.atualizado_em = NOW();
  RETURN NEW;
END;
$$;

-- Function to update finance_charges.valor_pago automatically
CREATE OR REPLACE FUNCTION update_finance_charge_valor_pago()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_total_pago NUMERIC(10,2);
  v_valor_previsto NUMERIC(10,2);
BEGIN
  -- Re-calculate total paid for this charge
  SELECT COALESCE(SUM(valor), 0) INTO v_total_pago
  FROM payments
  WHERE charge_id = COALESCE(NEW.charge_id, OLD.charge_id);

  -- Get valor_previsto
  SELECT valor_previsto INTO v_valor_previsto
  FROM finance_charges
  WHERE id = COALESCE(NEW.charge_id, OLD.charge_id);

  -- Update finance_charges
  UPDATE finance_charges
  SET 
    valor_pago = v_total_pago,
    status = CASE 
      WHEN v_total_pago >= v_valor_previsto THEN 'pago'::finance_charge_status
      ELSE 'a_pagar'::finance_charge_status
    END,
    atualizado_em = NOW()
  WHERE id = COALESCE(NEW.charge_id, OLD.charge_id);

  RETURN NULL;
END;
$$;

-- Apply updated_at triggers
DROP TRIGGER IF EXISTS trg_price_table_updated_at     ON price_table;
DROP TRIGGER IF EXISTS trg_finance_charges_updated_at ON finance_charges;
DROP TRIGGER IF EXISTS trg_payments_updated_at        ON payments;

CREATE TRIGGER trg_price_table_updated_at     BEFORE UPDATE ON price_table     FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_finance_charges_updated_at BEFORE UPDATE ON finance_charges FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_payments_updated_at        BEFORE UPDATE ON payments        FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Apply valor_pago trigger on payments
DROP TRIGGER IF EXISTS trg_update_valor_pago ON payments;
CREATE TRIGGER trg_update_valor_pago
  AFTER INSERT OR UPDATE OR DELETE ON payments
  FOR EACH ROW EXECUTE FUNCTION update_finance_charge_valor_pago();
