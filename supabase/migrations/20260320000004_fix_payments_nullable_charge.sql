-- ============================================================
-- Fix: payments.charge_id deve ser nullable (recebimentos do cliente não têm charge)
-- Fix: trigger que assume charge_id NOT NULL
-- Fix: RLS policies conflitantes na service_prices
-- ============================================================

-- 1. Tornar charge_id nullable
ALTER TABLE payments ALTER COLUMN charge_id DROP NOT NULL;

-- 2. Recriar trigger que lida com charge_id null
CREATE OR REPLACE FUNCTION update_finance_charge_valor_pago()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_charge_id TEXT;
  v_total_pago NUMERIC(10,2);
  v_valor_previsto NUMERIC(10,2);
BEGIN
  v_charge_id := COALESCE(NEW.charge_id, OLD.charge_id);

  -- Se não há charge vinculada, nada a fazer
  IF v_charge_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(SUM(valor), 0) INTO v_total_pago
  FROM payments
  WHERE charge_id = v_charge_id;

  SELECT valor_previsto INTO v_valor_previsto
  FROM finance_charges
  WHERE id = v_charge_id;

  UPDATE finance_charges
  SET
    valor_pago = v_total_pago,
    status = CASE
      WHEN v_total_pago >= v_valor_previsto THEN 'pago'::finance_charge_status
      ELSE 'a_pagar'::finance_charge_status
    END,
    atualizado_em = NOW()
  WHERE id = v_charge_id;

  RETURN NULL;
END;
$$;

-- 3. Garantir que service_prices tem policy pública (sem conflitos)
DROP POLICY IF EXISTS "service_prices_select" ON service_prices;
DROP POLICY IF EXISTS "service_prices_all" ON service_prices;
DROP POLICY IF EXISTS "Allow all access to service_prices" ON service_prices;
CREATE POLICY "Allow all access to service_prices" ON service_prices FOR ALL USING (true) WITH CHECK (true);

-- 4. Garantir price_table tem dados
INSERT INTO price_table (id, codigo, descricao, valor) VALUES
  (gen_random_uuid()::text, 'dae_principal',        'DAE Principal',              150.54),
  (gen_random_uuid()::text, 'vistoria',             'Vistoria ECV',               133.17),
  (gen_random_uuid()::text, 'placa_carro_mercosul', 'Placa Mercosul (par carro)', 215.00),
  (gen_random_uuid()::text, 'placa_carro_comum',    'Placa Comum (par carro)',    180.00),
  (gen_random_uuid()::text, 'placa_moto_comum',     'Placa Moto',                 130.00)
ON CONFLICT (codigo) DO NOTHING;

-- 5. Garantir service_prices tem dados
INSERT INTO service_prices (tipo_servico, tipo_veiculo, com_placa, valor) VALUES
  ('transferencia','carro',false,450),('transferencia','carro',true,780),
  ('segunda_via','carro',false,450),('baixa','carro',false,450),
  ('alteracao_dados','carro',true,580),('alteracao_dados','carro',false,380),
  ('primeiro_emplacamento','carro',true,780),
  ('mudanca_caracteristica','carro',false,450),('mudanca_categoria','carro',false,450),
  ('vistoria_lacrada','carro',false,450),('baixa_impedimento','carro',false,380),
  ('transferencia','moto',false,450),('transferencia','moto',true,680),
  ('segunda_via','moto',false,450),
  ('alteracao_dados','moto',true,480),('alteracao_dados','moto',false,380),
  ('primeiro_emplacamento','moto',true,680),
  ('mudanca_caracteristica','moto',false,450),('mudanca_categoria','moto',false,450),
  ('vistoria_lacrada','moto',false,450),('baixa_impedimento','moto',false,380)
ON CONFLICT (tipo_servico, tipo_veiculo, com_placa) DO NOTHING;
