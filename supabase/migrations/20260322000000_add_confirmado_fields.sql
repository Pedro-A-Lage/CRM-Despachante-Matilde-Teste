-- Add confirmation tracking fields to finance_charges
ALTER TABLE finance_charges
  ADD COLUMN IF NOT EXISTS confirmado_por TEXT,
  ADD COLUMN IF NOT EXISTS confirmado_em TIMESTAMPTZ;

-- Backfill existing paid charges so they appear in summary cards
UPDATE finance_charges
  SET confirmado_em = atualizado_em
  WHERE status = 'pago' AND confirmado_em IS NULL;
