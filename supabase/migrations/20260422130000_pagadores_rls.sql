-- ============================================================
-- MIGRATION: pagadores_rls
-- Data: 2026-04-22
-- Descrição: Habilita RLS na tabela pagadores seguindo o mesmo
--            padrão das outras tabelas do CRM (FOR ALL USING true)
-- ============================================================

ALTER TABLE pagadores ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  DROP POLICY IF EXISTS "auth_all_pagadores" ON pagadores;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'pagadores' AND policyname = 'Allow all access to pagadores'
  ) THEN
    CREATE POLICY "Allow all access to pagadores" ON pagadores
      FOR ALL USING (true) WITH CHECK (true);
  END IF;
END$$;
