-- migrations/20260405000001_empresas_parceiras.sql

-- 1. Tabela de empresas parceiras
CREATE TABLE IF NOT EXISTS empresas_parceiras (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    nome TEXT NOT NULL,
    email TEXT,
    cor TEXT DEFAULT '#3B82F6',
    ativo BOOLEAN NOT NULL DEFAULT true,
    valor_servico NUMERIC,
    valor_placa NUMERIC,
    etapas_envio JSONB NOT NULL DEFAULT '[]'::jsonb,
    email_assunto_template TEXT,
    email_corpo_template TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Novas colunas na ordens_de_servico
ALTER TABLE ordens_de_servico
    ADD COLUMN IF NOT EXISTS empresa_parceira_id TEXT REFERENCES empresas_parceiras(id),
    ADD COLUMN IF NOT EXISTS empresa_valores_override JSONB,
    ADD COLUMN IF NOT EXISTS envios_status JSONB;

-- 3. Índice para filtro por empresa
CREATE INDEX IF NOT EXISTS idx_os_empresa_parceira ON ordens_de_servico(empresa_parceira_id);

-- 4. RLS
ALTER TABLE empresas_parceiras ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for empresas_parceiras" ON empresas_parceiras FOR ALL USING (true) WITH CHECK (true);

-- 5. Dados iniciais
INSERT INTO empresas_parceiras (nome, email, cor, valor_servico, valor_placa, etapas_envio) VALUES
(
    'Guiauto',
    NULL,
    '#3B82F6',
    300,
    250,
    '[
        {"ordem": 1, "nome": "Comprovantes de taxas", "documentos": ["tx_estado", "comprovante_pagamento"]},
        {"ordem": 2, "nome": "Vistoria e placa", "documentos": ["taxa_vistoria", "boleto_placa", "comprovante_placa"]},
        {"ordem": 3, "nome": "Nota fiscal", "documentos": ["nota_fiscal"]}
    ]'::jsonb
),
(
    'Kuruma',
    NULL,
    '#10B981',
    236.17,
    NULL,
    '[
        {"ordem": 1, "nome": "DAE para pagamento", "documentos": ["dae"]},
        {"ordem": 2, "nome": "Vistoria e boleto placa", "documentos": ["vistoria_paga", "boleto_placa"]},
        {"ordem": 3, "nome": "Finalização", "documentos": ["doc_pronto", "nota_fiscal"]}
    ]'::jsonb
);
