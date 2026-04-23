-- ============================================================
-- MIGRATION: charge_price_history
-- Data: 2026-04-23
-- Descrição: Audit trail de mudanças em finance_charges.valor_previsto.
--            Cada recálculo automático (por vínculo de empresa, mudança
--            de preço, migração de backlog, etc.) grava uma linha aqui
--            com o valor antes/depois + motivo + usuário.
--
-- Casos de uso:
--   · Investigar "por que a DAE/Placa dessa OS virou R$ X?"
--   · Desfazer recálculos individuais (comando SQL inverso)
--   · Métricas: quantas OS tiveram placa recalculada essa semana?
--
-- NÃO registra inserções iniciais (quando a charge é criada) — só
-- mudanças posteriores em valor_previsto.
-- ============================================================

CREATE TABLE IF NOT EXISTS charge_price_history (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  charge_id       TEXT NOT NULL REFERENCES finance_charges(id) ON DELETE CASCADE,
  valor_antigo    NUMERIC(10,2) NOT NULL,
  valor_novo      NUMERIC(10,2) NOT NULL,
  motivo          TEXT NOT NULL,
  usuario         TEXT,
  criado_em       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_charge_price_history_charge_id  ON charge_price_history(charge_id);
CREATE INDEX IF NOT EXISTS idx_charge_price_history_criado_em  ON charge_price_history(criado_em DESC);

ALTER TABLE charge_price_history ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'charge_price_history'
      AND policyname = 'Allow all access to charge_price_history'
  ) THEN
    CREATE POLICY "Allow all access to charge_price_history"
      ON charge_price_history FOR ALL USING (true) WITH CHECK (true);
  END IF;
END$$;
