-- =============================================================
-- MIGRATION CONSOLIDADA - Rodar no Supabase SQL Editor
-- Data: 2026-04-03
-- =============================================================

-- 1. Criar tabela usuarios (se não existir)
CREATE TABLE IF NOT EXISTS usuarios (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    nome TEXT NOT NULL UNIQUE,
    senha_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'operador',
    primeiro_login BOOLEAN DEFAULT true,
    criado_em TIMESTAMPTZ DEFAULT now(),
    atualizado_em TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE usuarios ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'usuarios' AND policyname = 'Allow all access to usuarios') THEN
        CREATE POLICY "Allow all access to usuarios" ON usuarios FOR ALL USING (true) WITH CHECK (true);
    END IF;
END $$;

-- 2. Adicionar coluna status_delegacia em ordens_de_servico
ALTER TABLE ordens_de_servico ADD COLUMN IF NOT EXISTS status_delegacia TEXT;

-- 3. Corrigir trigger de pagamentos (versão final - TEXT, não UUID)
CREATE OR REPLACE FUNCTION update_finance_charge_valor_pago()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_charge_id TEXT;
  v_total NUMERIC;
BEGIN
  v_charge_id := COALESCE(NEW.charge_id, OLD.charge_id);
  IF v_charge_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

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

-- 4. Dropar função RPC não utilizada
DROP FUNCTION IF EXISTS ajustar_valor_pago_charge;

-- 5. Corrigir migration recebido_por (segurança)
ALTER TABLE payments ADD COLUMN IF NOT EXISTS recebido_por TEXT;

-- 6. Adicionar dae_alteracao na price_table (FALTAVA - cobranças saiam R$0)
INSERT INTO price_table (id, codigo, descricao, valor, ativo, criado_em, atualizado_em)
VALUES (gen_random_uuid()::text, 'dae_alteracao', 'Taxa de Serviço DAE (Alteração)', 150.54, true, now(), now())
ON CONFLICT (codigo) DO NOTHING;

-- 7. Adicionar preço de Baixa para MOTO (faltava)
INSERT INTO service_prices (id, tipo_servico, tipo_veiculo, com_placa, valor, ativo, criado_em, atualizado_em)
VALUES (gen_random_uuid()::text, 'baixa', 'moto', false, 450.00, true, now(), now())
ON CONFLICT (tipo_servico, tipo_veiculo, com_placa) DO NOTHING;

-- =============================================================
-- Adicionar coluna custos_extras à service_config
ALTER TABLE service_config ADD COLUMN IF NOT EXISTS custos_extras JSONB DEFAULT '[]'::jsonb;

-- 8. Adicionar coluna permissoes na tabela usuarios
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS permissoes JSONB DEFAULT '{}'::jsonb;

-- 9. Adicionar criado_por e responsavel na OS
ALTER TABLE ordens_de_servico ADD COLUMN IF NOT EXISTS criado_por TEXT;
ALTER TABLE ordens_de_servico ADD COLUMN IF NOT EXISTS responsavel TEXT;

-- FIM - Todas as correções aplicadas
-- =============================================================
