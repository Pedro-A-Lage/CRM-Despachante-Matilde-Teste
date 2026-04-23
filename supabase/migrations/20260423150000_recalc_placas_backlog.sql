-- ============================================================
-- MIGRATION: recalc_placas_backlog
-- Data: 2026-04-23
-- Descrição: Corrige em lote as charges de placa (status=a_pagar) de OS
--            NÃO-resolvidas cujo valor_previsto diverge do valor esperado
--            (empresa.valor_placa OU price_table padrão).
--
-- Cada correção grava uma linha em charge_price_history com motivo
-- 'migration_backlog' pra ficar rastreável e reversível.
--
-- ⚠️ ATENÇÃO: este script tem DOIS blocos independentes:
--    PARTE 1 (DRY-RUN): só SELECT, não altera nada. Rode primeiro pra
--       conferir quais OS seriam afetadas e validar o resultado.
--    PARTE 2 (APLICAR): só rode depois de conferir a PARTE 1. Faz
--       UPDATE + INSERT no audit trail numa transação atômica.
--
-- A PARTE 2 está comentada por segurança. Descomente manualmente no
-- SQL Editor do Supabase quando tiver certeza.
-- ============================================================

-- ╔════════════════════════════════════════════════════════════╗
-- ║ PARTE 1 — DRY-RUN (só SELECT, seguro rodar)                ║
-- ╚════════════════════════════════════════════════════════════╝

SELECT
  fc.id                                                  AS charge_id,
  os.numero                                              AS os_numero,
  os.status                                              AS os_status,
  os.tipo_veiculo,
  COALESCE(ep.nome, '(particular)')                      AS empresa,
  fc.valor_previsto                                      AS valor_atual,
  COALESCE(ep.valor_placa, pt.valor)                     AS valor_esperado,
  ROUND((COALESCE(ep.valor_placa, pt.valor) - fc.valor_previsto)::numeric, 2) AS diff
FROM finance_charges fc
JOIN ordens_de_servico os
  ON os.id = fc.os_id
LEFT JOIN empresas_parceiras ep
  ON ep.id = os.empresa_parceira_id
LEFT JOIN price_table pt
  ON pt.codigo = CASE
       WHEN os.tipo_veiculo = 'moto' THEN 'placa_moto_mercosul'
       ELSE 'placa_carro_mercosul'
     END
   AND pt.ativo = TRUE
WHERE fc.categoria = 'placa'
  AND fc.status    = 'a_pagar'
  AND os.status NOT IN ('entregue', 'cancelada', 'doc_pronto')
  AND COALESCE(ep.valor_placa, pt.valor) IS NOT NULL
  AND ABS(COALESCE(ep.valor_placa, pt.valor) - fc.valor_previsto) > 0.01
ORDER BY os.numero;


-- ╔════════════════════════════════════════════════════════════╗
-- ║ PARTE 2 — APLICAR (UPDATE + audit trail, em transação)      ║
-- ║ ⚠️ DESCOMENTE MANUALMENTE DEPOIS DE CONFERIR A PARTE 1.      ║
-- ╚════════════════════════════════════════════════════════════╝

-- BEGIN;
--
-- WITH candidatos AS (
--   SELECT
--     fc.id,
--     fc.valor_previsto                          AS valor_antigo,
--     COALESCE(ep.valor_placa, pt.valor)         AS valor_novo
--   FROM finance_charges fc
--   JOIN ordens_de_servico os
--     ON os.id = fc.os_id
--   LEFT JOIN empresas_parceiras ep
--     ON ep.id = os.empresa_parceira_id
--   LEFT JOIN price_table pt
--     ON pt.codigo = CASE
--          WHEN os.tipo_veiculo = 'moto' THEN 'placa_moto_mercosul'
--          ELSE 'placa_carro_mercosul'
--        END
--      AND pt.ativo = TRUE
--   WHERE fc.categoria = 'placa'
--     AND fc.status    = 'a_pagar'
--     AND os.status NOT IN ('entregue', 'cancelada', 'doc_pronto')
--     AND COALESCE(ep.valor_placa, pt.valor) IS NOT NULL
--     AND ABS(COALESCE(ep.valor_placa, pt.valor) - fc.valor_previsto) > 0.01
-- ),
-- inserts AS (
--   INSERT INTO charge_price_history (charge_id, valor_antigo, valor_novo, motivo, usuario)
--   SELECT id, valor_antigo, valor_novo, 'migration_backlog', 'Sistema'
--   FROM candidatos
--   RETURNING charge_id
-- )
-- UPDATE finance_charges fc
--    SET valor_previsto = c.valor_novo,
--        atualizado_em  = NOW()
--   FROM candidatos c
--  WHERE fc.id = c.id;
--
-- -- Conferência pós-update (deve retornar 0)
-- SELECT COUNT(*) AS ainda_divergentes
--   FROM finance_charges fc
--   JOIN ordens_de_servico os ON os.id = fc.os_id
--   LEFT JOIN empresas_parceiras ep ON ep.id = os.empresa_parceira_id
--   LEFT JOIN price_table pt ON pt.codigo = CASE
--          WHEN os.tipo_veiculo = 'moto' THEN 'placa_moto_mercosul'
--          ELSE 'placa_carro_mercosul'
--        END AND pt.ativo = TRUE
--  WHERE fc.categoria = 'placa'
--    AND fc.status = 'a_pagar'
--    AND os.status NOT IN ('entregue', 'cancelada', 'doc_pronto')
--    AND COALESCE(ep.valor_placa, pt.valor) IS NOT NULL
--    AND ABS(COALESCE(ep.valor_placa, pt.valor) - fc.valor_previsto) > 0.01;
--
-- COMMIT;


-- ╔════════════════════════════════════════════════════════════╗
-- ║ REVERSÃO (caso precise desfazer)                             ║
-- ╚════════════════════════════════════════════════════════════╝

-- Pra reverter APENAS as charges alteradas por esta migration,
-- volte pro valor_antigo registrado em charge_price_history:
--
-- BEGIN;
-- WITH recentes AS (
--   SELECT DISTINCT ON (charge_id) charge_id, valor_antigo
--   FROM charge_price_history
--   WHERE motivo = 'migration_backlog'
--   ORDER BY charge_id, criado_em DESC
-- )
-- UPDATE finance_charges fc
--    SET valor_previsto = r.valor_antigo,
--        atualizado_em  = NOW()
--   FROM recentes r
--  WHERE fc.id = r.charge_id;
-- -- opcional: DELETE FROM charge_price_history WHERE motivo = 'migration_backlog';
-- COMMIT;
