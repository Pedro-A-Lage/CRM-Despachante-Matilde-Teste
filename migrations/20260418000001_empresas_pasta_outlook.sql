-- migrations/20260418000001_empresas_pasta_outlook.sql
--
-- Desacopla o nome da empresa parceira do nome da pasta no Outlook onde os
-- emails dela chegam. O match em src/pages/Emails.tsx passa a priorizar
-- `pasta_outlook`; quando vazio, cai para `nome`.

ALTER TABLE empresas_parceiras
    ADD COLUMN IF NOT EXISTS pasta_outlook TEXT;

-- Backfill: empresas já cadastradas começam com pasta_outlook = nome, então
-- o match continua funcionando sem nenhuma ação do admin.
UPDATE empresas_parceiras
    SET pasta_outlook = nome
    WHERE pasta_outlook IS NULL;
