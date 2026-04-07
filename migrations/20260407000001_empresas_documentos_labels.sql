-- Adiciona campo para nomes customizados de documentos por empresa parceira
-- Cada empresa pode renomear os documentos das etapas de envio.
-- Estrutura: { "tipo_doc": "Nome customizado", ... }

ALTER TABLE empresas_parceiras
    ADD COLUMN IF NOT EXISTS documentos_labels JSONB DEFAULT '{}'::jsonb;
