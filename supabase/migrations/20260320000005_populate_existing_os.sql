-- ============================================================
-- Popula OS existentes com tipo_veiculo, valor_servico e finance_charges
-- Roda APÓS as migrations 000003 e 000004
-- ============================================================

-- 1. Corrigir charge_id para ser nullable (caso ainda não tenha sido feito)
ALTER TABLE payments ALTER COLUMN charge_id DROP NOT NULL;

-- 2. Recriar trigger null-safe
CREATE OR REPLACE FUNCTION update_finance_charge_valor_pago()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_charge_id TEXT;
  v_total_pago NUMERIC(10,2);
  v_valor_previsto NUMERIC(10,2);
BEGIN
  v_charge_id := COALESCE(NEW.charge_id, OLD.charge_id);
  IF v_charge_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(SUM(valor), 0) INTO v_total_pago
  FROM payments WHERE charge_id = v_charge_id;

  SELECT valor_previsto INTO v_valor_previsto
  FROM finance_charges WHERE id = v_charge_id;

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

-- 3. Garantir RLS ok em service_prices
DROP POLICY IF EXISTS "service_prices_select" ON service_prices;
DROP POLICY IF EXISTS "service_prices_all" ON service_prices;
DROP POLICY IF EXISTS "Allow all access to service_prices" ON service_prices;
CREATE POLICY "Allow all access to service_prices" ON service_prices FOR ALL USING (true) WITH CHECK (true);

-- 4. Garantir dados na price_table
INSERT INTO price_table (id, codigo, descricao, valor) VALUES
  (gen_random_uuid()::text, 'dae_principal',        'DAE Principal',              150.54),
  (gen_random_uuid()::text, 'vistoria',             'Vistoria ECV',               133.17),
  (gen_random_uuid()::text, 'placa_carro_mercosul', 'Placa Mercosul (par carro)', 215.00),
  (gen_random_uuid()::text, 'placa_carro_comum',    'Placa Comum (par carro)',    180.00),
  (gen_random_uuid()::text, 'placa_moto_comum',     'Placa Moto',                 130.00)
ON CONFLICT (codigo) DO NOTHING;

-- 5. Garantir dados em service_prices
INSERT INTO service_prices (tipo_servico, tipo_veiculo, com_placa, valor) VALUES
  ('transferencia','carro',false,450),('transferencia','carro',true,780),
  ('segunda_via','carro',false,450),('baixa','carro',false,450),
  ('alteracao_dados','carro',true,580),('alteracao_dados','carro',false,380),
  ('primeiro_emplacamento','carro',true,780),
  ('mudanca_caracteristica','carro',false,450),('mudanca_categoria','carro',false,450),
  ('vistoria_lacrada','carro',false,450),('baixa_impedimento','carro',false,380),
  ('transferencia','moto',false,450),('transferencia','moto',true,680),
  ('segunda_via','moto',false,450),('baixa','moto',false,450),
  ('alteracao_dados','moto',true,480),('alteracao_dados','moto',false,380),
  ('primeiro_emplacamento','moto',true,680),
  ('mudanca_caracteristica','moto',false,450),('mudanca_categoria','moto',false,450),
  ('vistoria_lacrada','moto',false,450),('baixa_impedimento','moto',false,380)
ON CONFLICT (tipo_servico, tipo_veiculo, com_placa) DO NOTHING;

-- 6. Setar tipo_veiculo = 'carro' em todas as OS que ainda não têm
UPDATE ordens_de_servico
SET tipo_veiculo = 'carro'
WHERE tipo_veiculo IS NULL;

-- 7. Preencher valor_servico baseado em service_prices
UPDATE ordens_de_servico os
SET valor_servico = sp.valor
FROM service_prices sp
WHERE os.valor_servico IS NULL
  AND sp.tipo_servico = os.tipo_servico
  AND sp.tipo_veiculo = COALESCE(os.tipo_veiculo, 'carro')
  AND sp.com_placa = COALESCE(os.troca_placa, false);

-- 8. Gerar finance_charges (custos) para OS que ainda NÃO têm charges
-- Usa DO block para iterar sobre cada OS e inserir os custos corretos

DO $$
DECLARE
  r RECORD;
  v_dae_valor NUMERIC(10,2);
  v_vistoria_valor NUMERIC(10,2);
  v_placa_valor NUMERIC(10,2);
  v_placa_codigo TEXT;
  v_placa_descricao TEXT;
  v_gera_vistoria BOOLEAN;
  v_gera_placa BOOLEAN;
BEGIN
  -- Buscar valores da price_table
  SELECT valor INTO v_dae_valor FROM price_table WHERE codigo = 'dae_principal';
  SELECT valor INTO v_vistoria_valor FROM price_table WHERE codigo = 'vistoria';

  -- Iterar sobre cada OS que ainda não tem charges
  FOR r IN
    SELECT os.id, os.tipo_servico, os.tipo_veiculo, os.troca_placa
    FROM ordens_de_servico os
    WHERE NOT EXISTS (
      SELECT 1 FROM finance_charges fc WHERE fc.os_id = os.id
    )
  LOOP
    -- === DAE: todos os serviços recebem ===
    INSERT INTO finance_charges (id, os_id, descricao, categoria, valor_previsto, status)
    VALUES (gen_random_uuid()::text, r.id, 'DAE Principal', 'dae_principal', v_dae_valor, 'a_pagar');

    -- === VISTORIA: depende do tipo de serviço ===
    v_gera_vistoria := CASE r.tipo_servico
      WHEN 'transferencia'          THEN true
      WHEN 'primeiro_emplacamento'  THEN true
      WHEN 'segunda_via'            THEN true
      WHEN 'baixa'                  THEN true
      WHEN 'mudanca_caracteristica' THEN true
      WHEN 'mudanca_categoria'      THEN true
      WHEN 'vistoria_lacrada'       THEN true
      WHEN 'alteracao_dados'        THEN COALESCE(r.troca_placa, false)  -- só se troca placa
      WHEN 'baixa_impedimento'      THEN false                           -- nunca
      ELSE false
    END;

    IF v_gera_vistoria THEN
      INSERT INTO finance_charges (id, os_id, descricao, categoria, valor_previsto, status)
      VALUES (gen_random_uuid()::text, r.id, 'Vistoria ECV', 'vistoria', v_vistoria_valor, 'a_pagar');
    END IF;

    -- === PLACA: depende do tipo de serviço e troca_placa ===
    v_gera_placa := CASE r.tipo_servico
      WHEN 'primeiro_emplacamento' THEN true                              -- sempre
      WHEN 'transferencia'         THEN COALESCE(r.troca_placa, false)    -- se troca
      WHEN 'alteracao_dados'       THEN COALESCE(r.troca_placa, false)    -- se troca
      ELSE false                                                           -- nunca
    END;

    IF v_gera_placa THEN
      IF COALESCE(r.tipo_veiculo, 'carro') = 'moto' THEN
        v_placa_codigo := 'placa_moto_comum';
        v_placa_descricao := 'Placa Moto';
      ELSE
        v_placa_codigo := 'placa_carro_mercosul';
        v_placa_descricao := 'Placa Mercosul (par)';
      END IF;

      SELECT valor INTO v_placa_valor FROM price_table WHERE codigo = v_placa_codigo;

      INSERT INTO finance_charges (id, os_id, descricao, categoria, valor_previsto, status)
      VALUES (gen_random_uuid()::text, r.id, v_placa_descricao, 'placa', v_placa_valor, 'a_pagar');
    END IF;

  END LOOP;
END;
$$;
