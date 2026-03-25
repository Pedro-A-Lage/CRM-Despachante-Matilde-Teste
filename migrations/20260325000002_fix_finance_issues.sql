-- Migration: fix_finance_issues
-- Adds desconto column, foreign keys, indices, and drops unused financeiro column.

-- 1. Add desconto column to ordens_de_servico
ALTER TABLE ordens_de_servico ADD COLUMN IF NOT EXISTS desconto NUMERIC DEFAULT 0;

-- 2. Foreign keys (safe: only add if referencing tables exist and column not already constrained)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_finance_charges_os_id'
      AND table_name = 'finance_charges'
  ) THEN
    ALTER TABLE finance_charges
      ADD CONSTRAINT fk_finance_charges_os_id
      FOREIGN KEY (os_id) REFERENCES ordens_de_servico(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_payments_os_id'
      AND table_name = 'payments'
  ) THEN
    ALTER TABLE payments
      ADD CONSTRAINT fk_payments_os_id
      FOREIGN KEY (os_id) REFERENCES ordens_de_servico(id) ON DELETE CASCADE;
  END IF;
END $$;

-- 3. Indices for common query patterns
CREATE INDEX IF NOT EXISTS idx_finance_charges_os_id ON finance_charges(os_id);
CREATE INDEX IF NOT EXISTS idx_payments_os_id ON payments(os_id);
CREATE INDEX IF NOT EXISTS idx_ordens_status ON ordens_de_servico(status);
CREATE INDEX IF NOT EXISTS idx_ordens_cliente_id ON ordens_de_servico(cliente_id);

-- 4. Drop unused column
ALTER TABLE ordens_de_servico DROP COLUMN IF EXISTS financeiro;
