-- Migration: Create usuarios table for authentication
CREATE TABLE IF NOT EXISTS usuarios (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    nome TEXT NOT NULL UNIQUE,
    senha_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'operador',
    primeiro_login BOOLEAN DEFAULT true,
    criado_em TIMESTAMPTZ DEFAULT now(),
    atualizado_em TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE usuarios ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'usuarios' AND policyname = 'Allow all access to usuarios') THEN
        CREATE POLICY "Allow all access to usuarios" ON usuarios FOR ALL USING (true) WITH CHECK (true);
    END IF;
END $$;
