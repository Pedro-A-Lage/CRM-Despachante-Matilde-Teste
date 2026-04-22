-- ============================================================
-- MIGRATION: pagadores_e_pago_por
-- Data: 2026-04-22
-- Descrição: Adiciona rastreio de "quem pagou a taxa" (pessoa que
--            fisicamente pagou, separada de quem confirmou no CRM)
-- ============================================================

-- Tabela de pagadores (lista editável de nomes, ex.: Pedro, Geraldinho)
CREATE TABLE IF NOT EXISTS pagadores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL UNIQUE,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pagadores_ativo ON pagadores(ativo);

-- Seed inicial
INSERT INTO pagadores (nome) VALUES ('Pedro'), ('Geraldinho')
  ON CONFLICT (nome) DO NOTHING;

-- Coluna pago_por em finance_charges
ALTER TABLE finance_charges ADD COLUMN IF NOT EXISTS pago_por TEXT;
CREATE INDEX IF NOT EXISTS idx_finance_charges_pago_por ON finance_charges(pago_por);
