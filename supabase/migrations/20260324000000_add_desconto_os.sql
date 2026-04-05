-- Migration: add desconto column to ordens_de_servico
-- BUG 1: Desconto was only stored in localStorage — now persisted in DB

ALTER TABLE ordens_de_servico
  ADD COLUMN IF NOT EXISTS desconto NUMERIC DEFAULT 0;

COMMENT ON COLUMN ordens_de_servico.desconto IS 'Desconto aplicado ao valor do serviço (R$)';
