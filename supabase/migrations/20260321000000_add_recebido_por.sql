-- Adicionar campo "recebido_por" na tabela payments
ALTER TABLE payments ADD COLUMN IF NOT EXISTS recebido_por TEXT;
