-- ============================================================
-- MIGRATION: corrige_valor_placa_empresas
-- Data: 2026-04-23
-- Descrição: Corrige empresa.valor_placa onde estava 100 mas o valor
--            correto é 250. Ajuste operacional em massa.
--
-- O que faz:
--   UPDATE empresas_parceiras SET valor_placa = 250 WHERE valor_placa = 100
--
-- Efeito nas OS existentes:
--   NENHUMA charge é alterada por este script — apenas o cadastro da
--   empresa. OS criadas a partir de agora sairão com R$ 250.
--
--   Pra ajustar as OS abertas que ficaram com R$ 100 na charge de
--   placa, rode a migration "20260423150000_recalc_placas_backlog.sql"
--   (PARTE 1 dry-run, depois PARTE 2 apply). Essa migration detecta
--   automaticamente divergências e registra no audit trail.
-- ============================================================

-- PARTE 1 — CONFERIR (dry-run)
SELECT id, nome, valor_placa
  FROM empresas_parceiras
 WHERE valor_placa = 100;

-- PARTE 2 — APLICAR
UPDATE empresas_parceiras
   SET valor_placa    = 250,
       atualizado_em  = NOW()
 WHERE valor_placa    = 100;

-- PARTE 3 — CONFERIR DEPOIS
SELECT COUNT(*) AS empresas_com_valor_100_remanescentes
  FROM empresas_parceiras
 WHERE valor_placa = 100;
-- Deve retornar 0
