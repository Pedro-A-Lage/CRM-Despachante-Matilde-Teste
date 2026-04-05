-- Coluna para controle financeiro da empresa parceira por OS
ALTER TABLE ordens_de_servico
    ADD COLUMN IF NOT EXISTS empresa_financeiro JSONB;
