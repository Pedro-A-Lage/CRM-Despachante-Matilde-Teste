-- ============================================================
-- MIGRATION: backfill_dae_charges
-- Data: 2026-04-27
-- Descrição: Gera charges de DAE retroativamente para OS que ficaram
--            sem cobrança no financeiro por causa do bug em
--            gerarCobrancasIniciais (corrigido em
--            "fix(financeiro): gerar charge da DAE quando service_config
--             usa código novo"). Após a migration
--            20260423130000_dae_por_servico.sql, dae_tipo virou código
--            direto (dae_transferencia, dae_primeiro_emplacamento, etc),
--            mas o código TS só reconhecia 'principal'/'alteracao' e
--            não criava nenhum charge.
--
-- Regra:
--   - Só OS NÃO finalizadas (status NOT IN entregue/cancelada)
--   - Só OS cujo service_config tem dae_tipo definido e está ativo
--   - Pula OS que JÁ tem charge de DAE (categoria dae_principal ou
--     dae_adicional) ativa (não cancelada)
--
-- Categoria escolhida:
--   - 'dae_adicional' para alteração/baixa (mesma lógica do TS)
--   - 'dae_principal' para os demais
--
-- ⚠️ DOIS blocos:
--   PARTE 1 (DRY-RUN, sempre roda): SELECT do que seria criado.
--   PARTE 2 (APPLY, comentado): INSERT real. Descomentar manualmente
--     no SQL Editor depois de conferir a PARTE 1.
-- ============================================================

-- ╔════════════════════════════════════════════════════════════╗
-- ║ PARTE 1 — DRY-RUN (só SELECT, seguro rodar)                ║
-- ╚════════════════════════════════════════════════════════════╝

WITH candidatos AS (
  SELECT
    os.id                                                  AS os_id,
    os.numero                                              AS os_numero,
    os.status                                              AS os_status,
    os.tipo_servico,
    sc.dae_tipo                                            AS codigo,
    pt.descricao,
    pt.valor,
    CASE
      WHEN sc.dae_tipo IN (
        'dae_alteracao',
        'dae_alteracao_dados',
        'dae_baixa',
        'dae_baixa_impedimento'
      ) THEN 'dae_adicional'
      ELSE 'dae_principal'
    END                                                    AS categoria
  FROM ordens_de_servico os
  JOIN service_config sc
    ON sc.tipo_servico = os.tipo_servico
   AND sc.ativo = TRUE
   AND sc.dae_tipo IS NOT NULL
   AND sc.dae_tipo <> ''
  JOIN price_table pt
    ON pt.codigo = sc.dae_tipo
   AND pt.ativo  = TRUE
  WHERE os.status NOT IN ('entregue', 'cancelada')
    AND NOT EXISTS (
      SELECT 1
        FROM finance_charges fc
       WHERE fc.os_id = os.id
         AND fc.categoria IN ('dae_principal', 'dae_adicional')
         AND fc.status <> 'cancelado'
    )
)
SELECT
  os_numero,
  os_status,
  tipo_servico,
  codigo,
  descricao,
  valor,
  categoria
FROM candidatos
ORDER BY os_numero;


-- ╔════════════════════════════════════════════════════════════╗
-- ║ PARTE 2 — APPLY (INSERT real)                                ║
-- ║ ⚠️ DESCOMENTE MANUALMENTE DEPOIS DE CONFERIR A PARTE 1.      ║
-- ╚════════════════════════════════════════════════════════════╝

-- BEGIN;
--
-- WITH candidatos AS (
--   SELECT
--     os.id                                                  AS os_id,
--     sc.dae_tipo                                            AS codigo,
--     pt.descricao                                           AS descricao,
--     pt.valor                                               AS valor,
--     CASE
--       WHEN sc.dae_tipo IN (
--         'dae_alteracao','dae_alteracao_dados',
--         'dae_baixa','dae_baixa_impedimento'
--       ) THEN 'dae_adicional'
--       ELSE 'dae_principal'
--     END                                                    AS categoria
--   FROM ordens_de_servico os
--   JOIN service_config sc
--     ON sc.tipo_servico = os.tipo_servico
--    AND sc.ativo = TRUE
--    AND sc.dae_tipo IS NOT NULL
--    AND sc.dae_tipo <> ''
--   JOIN price_table pt
--     ON pt.codigo = sc.dae_tipo
--    AND pt.ativo  = TRUE
--   WHERE os.status NOT IN ('entregue', 'cancelada')
--     AND NOT EXISTS (
--       SELECT 1
--         FROM finance_charges fc
--        WHERE fc.os_id = os.id
--          AND fc.categoria IN ('dae_principal', 'dae_adicional')
--          AND fc.status <> 'cancelado'
--     )
-- )
-- INSERT INTO finance_charges (os_id, descricao, categoria, valor_previsto, status)
-- SELECT os_id, descricao, categoria, valor, 'a_pagar'
-- FROM candidatos;
--
-- -- Conferência pós-insert (deve retornar 0)
-- SELECT COUNT(*) AS ainda_sem_dae
--   FROM ordens_de_servico os
--   JOIN service_config sc
--     ON sc.tipo_servico = os.tipo_servico
--    AND sc.ativo = TRUE
--    AND sc.dae_tipo IS NOT NULL
--    AND sc.dae_tipo <> ''
--  WHERE os.status NOT IN ('entregue', 'cancelada')
--    AND NOT EXISTS (
--      SELECT 1
--        FROM finance_charges fc
--       WHERE fc.os_id = os.id
--         AND fc.categoria IN ('dae_principal', 'dae_adicional')
--         AND fc.status <> 'cancelado'
--    );
--
-- COMMIT;


-- ╔════════════════════════════════════════════════════════════╗
-- ║ REVERSÃO (caso precise desfazer)                             ║
-- ╚════════════════════════════════════════════════════════════╝

-- Os charges criados aqui ficam com criado_em = NOW() do APPLY.
-- Pra reverter, identifique pela janela de criação e marque como
-- cancelado (ou DELETE se ninguém pagou ainda):
--
-- BEGIN;
-- UPDATE finance_charges
--    SET status = 'cancelado',
--        atualizado_em = NOW()
--  WHERE categoria IN ('dae_principal', 'dae_adicional')
--    AND status = 'a_pagar'
--    AND criado_em >= '2026-04-27 00:00:00'
--    AND criado_em <  '2026-04-28 00:00:00';
-- COMMIT;
