-- ============================================================
-- MIGRATION: dae_por_servico
-- Data: 2026-04-23
-- Descrição: Separa a DAE genérica ("dae_principal" / "dae_alteracao")
--            em 9 DAEs específicas por tipo de serviço. Cada serviço
--            do service_config passa a apontar para um código único
--            em price_table, permitindo ajustar o valor de cada DAE
--            individualmente.
--
-- Efeito: OS NOVAS criadas a partir dessa migration vão gerar charges
-- com o código específico. OS antigas ficam intocadas.
--
-- Valores iniciais: R$ 150,54 para todas (igual ao valor atual de
-- dae_principal). Admin ajusta individualmente depois em
-- Configurações → Custos Fixos.
-- ============================================================

-- 1) Novos códigos na tabela de preços (idempotente)
INSERT INTO price_table (codigo, descricao, valor, ativo) VALUES
  ('dae_transferencia',         'DAE Transferência',           150.54, true),
  ('dae_primeiro_emplacamento', 'DAE Primeiro Emplacamento',   150.54, true),
  ('dae_segunda_via',           'DAE 2ª Via CRV',              150.54, true),
  ('dae_alteracao_dados',       'DAE Alteração de Dados',      150.54, true),
  ('dae_mudanca_caracteristica','DAE Mudança de Característica',150.54, true),
  ('dae_mudanca_categoria',     'DAE Mudança de Categoria',    150.54, true),
  ('dae_baixa',                 'DAE Baixa',                   150.54, true),
  ('dae_baixa_impedimento',     'DAE Baixa de Impedimento',    150.54, true),
  ('dae_vistoria_lacrada',      'DAE Vistoria Lacrada',        150.54, true)
ON CONFLICT (codigo) DO NOTHING;

-- 2) Apontar cada serviço pro código específico
UPDATE service_config SET dae_tipo = 'dae_transferencia'         WHERE tipo_servico = 'transferencia';
UPDATE service_config SET dae_tipo = 'dae_primeiro_emplacamento' WHERE tipo_servico = 'primeiro_emplacamento';
UPDATE service_config SET dae_tipo = 'dae_segunda_via'           WHERE tipo_servico = 'segunda_via';
UPDATE service_config SET dae_tipo = 'dae_alteracao_dados'       WHERE tipo_servico = 'alteracao_dados';
UPDATE service_config SET dae_tipo = 'dae_mudanca_caracteristica' WHERE tipo_servico = 'mudanca_caracteristica';
UPDATE service_config SET dae_tipo = 'dae_mudanca_categoria'     WHERE tipo_servico = 'mudanca_categoria';
UPDATE service_config SET dae_tipo = 'dae_baixa'                 WHERE tipo_servico = 'baixa';
UPDATE service_config SET dae_tipo = 'dae_baixa_impedimento'     WHERE tipo_servico = 'baixa_impedimento';
UPDATE service_config SET dae_tipo = 'dae_vistoria_lacrada'      WHERE tipo_servico = 'vistoria_lacrada';

-- 3) Conferência
DO $$
DECLARE
  qtd_codigos INTEGER;
  qtd_servicos_atualizados INTEGER;
BEGIN
  SELECT COUNT(*) INTO qtd_codigos
    FROM price_table
   WHERE codigo LIKE 'dae_%' AND codigo NOT IN ('dae_principal', 'dae_alteracao');

  SELECT COUNT(*) INTO qtd_servicos_atualizados
    FROM service_config
   WHERE dae_tipo LIKE 'dae_%' AND dae_tipo NOT IN ('dae_principal', 'dae_alteracao');

  RAISE NOTICE 'Códigos novos de DAE em price_table (esperado 9): %', qtd_codigos;
  RAISE NOTICE 'Serviços apontando pra código específico: %', qtd_servicos_atualizados;
END$$;
