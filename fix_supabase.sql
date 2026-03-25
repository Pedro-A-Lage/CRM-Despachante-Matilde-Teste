-- ============================================
-- CORREÇÃO DE PERMISSÕES (RLS) E SCHEMA
-- Execute este SQL no Supabase Dashboard → SQL Editor
-- ============================================

-- 1. Garante que o bucket 'documentos' existe e é público
INSERT INTO storage.buckets (id, name, public)
VALUES ('documentos', 'documentos', true)
ON CONFLICT (id) DO NOTHING;

-- 2. Habilita acesso público (upload/download) para o bucket 'documentos'
-- Isso resolve o erro "new row violates row-level security policy"
DROP POLICY IF EXISTS "Public Access" ON storage.objects;
CREATE POLICY "Public Access" ON storage.objects FOR ALL USING ( bucket_id = 'documentos' ) WITH CHECK ( bucket_id = 'documentos' );

-- 3. Adiciona as novas colunas necessárias para o PDF do Detran
ALTER TABLE ordens_de_servico ADD COLUMN IF NOT EXISTS pdf_detran_url TEXT;
ALTER TABLE ordens_de_servico ADD COLUMN IF NOT EXISTS pdf_detran_name TEXT;
