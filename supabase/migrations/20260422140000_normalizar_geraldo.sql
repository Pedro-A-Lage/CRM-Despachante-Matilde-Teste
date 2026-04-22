-- ============================================================
-- MIGRATION: normalizar Geraldo → Geraldinho
-- Data: 2026-04-22
-- Descrição: Consolida o nome "Geraldo" para "Geraldinho" nos
--            campos recebido_por (payments) e pago_por (finance_charges)
--            já que o nome canônico cadastrado em pagadores é Geraldinho.
-- ============================================================

UPDATE payments
   SET recebido_por = 'Geraldinho'
 WHERE recebido_por = 'Geraldo';

UPDATE finance_charges
   SET pago_por = 'Geraldinho'
 WHERE pago_por = 'Geraldo';

-- Remove "Geraldo" da tabela pagadores se tiver sido criado por engano
DELETE FROM pagadores WHERE nome = 'Geraldo';
