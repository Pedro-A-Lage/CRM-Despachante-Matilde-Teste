-- Migration: fix update_finance_charge_valor_pago trigger (FINAL VERSION)
-- This is the definitive version of update_finance_charge_valor_pago().
-- It supersedes versions in: 20260320000000, 20260320000004, 20260320000005.
-- BUG 8: When charge_id IS NULL, WHERE charge_id = NULL never matches any row.
-- Add guard at the top to bail out early when charge_id is NULL.
-- NOTE: v_charge_id must be TEXT (not UUID) because charge_id column is TEXT.

CREATE OR REPLACE FUNCTION update_finance_charge_valor_pago()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_charge_id TEXT;
  v_total NUMERIC;
BEGIN
  -- Guard: if no charge_id is referenced, nothing to update
  v_charge_id := COALESCE(NEW.charge_id, OLD.charge_id);
  IF v_charge_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Recalculate total paid for this charge
  SELECT COALESCE(SUM(valor), 0)
    INTO v_total
    FROM payments
   WHERE charge_id = v_charge_id;

  UPDATE finance_charges
     SET valor_pago = v_total,
         status = CASE WHEN v_total >= valor_previsto THEN 'pago' ELSE 'a_pagar' END,
         atualizado_em = NOW()
   WHERE id = v_charge_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;
