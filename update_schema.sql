-- Add nullable columns to existing tables 

ALTER TABLE clientes ADD COLUMN IF NOT EXISTS pasta_supabase_path TEXT;
ALTER TABLE veiculos ADD COLUMN IF NOT EXISTS pasta_supabase_path TEXT;
ALTER TABLE ordens_de_servico ADD COLUMN IF NOT EXISTS pasta_supabase TEXT;
