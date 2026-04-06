-- ============================================================
-- MIGRATION: sync_columns
-- Data: 2026-03-20
-- Descrição: Adiciona colunas faltantes na tabela ordens_de_servico
-- ============================================================

-- Adiciona colunas de texto
ALTER TABLE ordens_de_servico ADD COLUMN IF NOT EXISTS checklist_observacoes TEXT;
ALTER TABLE ordens_de_servico ADD COLUMN IF NOT EXISTS prioridade TEXT;
ALTER TABLE ordens_de_servico ADD COLUMN IF NOT EXISTS pendencia TEXT;
ALTER TABLE ordens_de_servico ADD COLUMN IF NOT EXISTS observacao_geral TEXT;
ALTER TABLE ordens_de_servico ADD COLUMN IF NOT EXISTS doc_final_url TEXT;

-- Adiciona colunas de PDF do Detran (caso não tenham sido adicionadas pelo fix_supabase.sql)
ALTER TABLE ordens_de_servico ADD COLUMN IF NOT EXISTS pdf_detran_url TEXT;
ALTER TABLE ordens_de_servico ADD COLUMN IF NOT EXISTS pdf_detran_name TEXT;

-- Adiciona colunas JSONB
ALTER TABLE ordens_de_servico ADD COLUMN IF NOT EXISTS crlv_consulta JSONB DEFAULT NULL;

-- Atualiza RLS para garantir que as novas colunas sejam acessíveis (visto que a tabela já tem RLS ENABLED)
-- A política "Allow all access to ordens_de_servico" já cobre todas as colunas.
