-- ============================================================
-- MIGRATION: marcar_taxas_antigas_pagas
-- Data: 2026-04-23
-- Descrição: Limpeza em massa — marca todas as taxas com due_date
--            anterior a 01/04/2026 como pagas, com data de pagamento
--            (confirmado_em) fixada em 31/03/2026 e confirmado_por
--            "Migração". Usado pra zerar o backlog histórico de taxas
--            que ficaram "a_pagar" mas já estavam resolvidas fora do
--            sistema.
--
-- Critério:
--   status = 'a_pagar'
--   due_date < 2026-04-01
--
-- Efeito:
--   status          = 'pago'
--   valor_pago      = valor_previsto
--   confirmado_em   = 2026-03-31T12:00:00-03:00
--   confirmado_por  = 'Migração'
--   atualizado_em   = NOW()
--
-- Campos NÃO alterados:
--   pago_por         fica null (não há registro de quem pagou fisicamente)
--   due_date         preservado
--   valor_previsto   preservado
--
-- IMPORTANTE: esta migration é destrutiva no sentido de que muda status
-- de várias taxas. Faça backup antes OU teste em staging primeiro.
-- Para desfazer: identifique as linhas por confirmado_por='Migração' +
-- confirmado_em='2026-03-31...' e volte pra 'a_pagar'.
-- ============================================================

UPDATE finance_charges
   SET status         = 'pago',
       valor_pago     = valor_previsto,
       confirmado_em  = '2026-03-31T12:00:00-03:00'::timestamptz,
       confirmado_por = 'Migração',
       atualizado_em  = NOW()
 WHERE status = 'a_pagar'
   AND due_date IS NOT NULL
   AND due_date < DATE '2026-04-01';

-- Conferência pós-migration (não bloqueia — só mostra no console do SQL Editor)
DO $$
DECLARE
  afetadas INTEGER;
  remanescentes INTEGER;
BEGIN
  SELECT COUNT(*) INTO afetadas
    FROM finance_charges
   WHERE confirmado_por = 'Migração'
     AND confirmado_em::date = DATE '2026-03-31';

  SELECT COUNT(*) INTO remanescentes
    FROM finance_charges
   WHERE status = 'a_pagar'
     AND due_date IS NOT NULL
     AND due_date < DATE '2026-04-01';

  RAISE NOTICE 'Taxas marcadas como pagas pela migration: %', afetadas;
  RAISE NOTICE 'Taxas a_pagar ainda com due_date < 01/04/2026 (deve ser 0): %', remanescentes;
END$$;
