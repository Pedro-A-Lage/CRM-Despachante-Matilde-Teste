-- ============================================================
-- MIGRATION: finance_os_columns
-- Data: 2026-03-20
-- Descrição: Adiciona colunas de resumo financeiro na tabela ordens_de_servico e gatilhos de atualização
-- ============================================================

-- 1. Adiciona as colunas de resumo na tabela ordens_de_servico
ALTER TABLE ordens_de_servico ADD COLUMN IF NOT EXISTS total_previsto NUMERIC(10,2) DEFAULT 0;
ALTER TABLE ordens_de_servico ADD COLUMN IF NOT EXISTS total_pago NUMERIC(10,2) DEFAULT 0;
ALTER TABLE ordens_de_servico ADD COLUMN IF NOT EXISTS saldo_pendente NUMERIC(10,2) DEFAULT 0;

-- 2. Função para atualizar os resumos financeiros da OS
CREATE OR REPLACE FUNCTION update_os_finance_summary()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_os_id TEXT;
  v_total_previsto NUMERIC(10,2);
  v_total_pago NUMERIC(10,2);
BEGIN
  -- Define o ID da OS afetada
  v_os_id := COALESCE(NEW.os_id, OLD.os_id);

  -- Calcula totais baseados na tabela finance_charges
  SELECT 
    COALESCE(SUM(valor_previsto), 0),
    COALESCE(SUM(valor_pago), 0)
  INTO v_total_previsto, v_total_pago
  FROM finance_charges
  WHERE os_id = v_os_id;

  -- Atualiza a tabela ordens_de_servico
  UPDATE ordens_de_servico
  SET 
    total_previsto = v_total_previsto,
    total_pago = v_total_pago,
    saldo_pendente = v_total_previsto - v_total_pago,
    atualizado_em = NOW()
  WHERE id = v_os_id;

  RETURN NULL;
END;
$$;

-- 3. Gatilho na tabela finance_charges para disparar a atualização na OS
DROP TRIGGER IF EXISTS trg_update_os_finance_summary ON finance_charges;
CREATE TRIGGER trg_update_os_finance_summary
  AFTER INSERT OR UPDATE OR DELETE ON finance_charges
  FOR EACH ROW EXECUTE FUNCTION update_os_finance_summary();

-- 4. Sincronização inicial (opcional, mas recomendado se já houver dados)
-- UPDATE ordens_de_servico os
-- SET 
--   total_previsto = (SELECT COALESCE(SUM(valor_previsto), 0) FROM finance_charges fc WHERE fc.os_id = os.id),
--   total_pago = (SELECT COALESCE(SUM(valor_pago), 0) FROM finance_charges fc WHERE fc.os_id = os.id),
--   saldo_pendente = (SELECT COALESCE(SUM(valor_previsto - valor_pago), 0) FROM finance_charges fc WHERE fc.os_id = os.id);
