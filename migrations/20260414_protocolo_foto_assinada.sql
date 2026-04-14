-- Migration: adicionar campos de foto assinada no protocolo diário
-- Para anexar foto do protocolo físico assinado pela delegacia

ALTER TABLE protocolos_diarios
  ADD COLUMN IF NOT EXISTS foto_assinada_url TEXT,
  ADD COLUMN IF NOT EXISTS foto_assinada_nome TEXT,
  ADD COLUMN IF NOT EXISTS foto_anexada_em TIMESTAMPTZ;
