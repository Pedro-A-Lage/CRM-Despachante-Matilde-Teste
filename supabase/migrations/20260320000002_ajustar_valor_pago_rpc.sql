-- RPC atômica para ajustar valor_pago de uma cobrança
-- Evita race condition quando dois usuários pagam ao mesmo tempo
CREATE OR REPLACE FUNCTION ajustar_valor_pago_charge(
  p_charge_id UUID,
  p_delta NUMERIC(10,2)
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Update atômico: incrementa/decrementa valor_pago e ajusta status
  UPDATE finance_charges
  SET valor_pago = GREATEST(0, valor_pago + p_delta),
      status = CASE
        WHEN GREATEST(0, valor_pago + p_delta) >= valor_previsto THEN 'pago'::finance_charge_status
        ELSE 'a_pagar'::finance_charge_status
      END,
      atualizado_em = NOW()
  WHERE id = p_charge_id;
END;
$$;
