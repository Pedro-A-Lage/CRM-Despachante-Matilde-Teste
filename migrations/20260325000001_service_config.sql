-- ============================================================
-- Migration: service_config - Configuração editável de serviços
-- Permite editar nomes, documentos checklist (PF/PJ), e custos
-- ============================================================

-- Tabela principal de configuração de serviços
CREATE TABLE IF NOT EXISTS service_config (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tipo_servico TEXT NOT NULL UNIQUE,
    nome_exibicao TEXT NOT NULL,
    ativo BOOLEAN NOT NULL DEFAULT true,
    -- Documentos checklist separados por tipo de cliente
    documentos_pf JSONB NOT NULL DEFAULT '[]'::jsonb,  -- ["CNH", "CRV Assinado"]
    documentos_pj JSONB NOT NULL DEFAULT '[]'::jsonb,  -- ["CNPJ", "Contrato Social", "CNH Responsável"]
    -- Documentos extras (ex: vendedor CNPJ na transferência)
    documentos_extras JSONB NOT NULL DEFAULT '[]'::jsonb, -- [{"condicao": "vendedor_pj", "docs": ["CNPJ (Vendedor)"]}]
    -- Config de custos automáticos
    dae_tipo TEXT DEFAULT 'principal', -- 'principal', 'alteracao', null (sem DAE)
    gera_vistoria TEXT DEFAULT 'sempre', -- 'sempre', 'se_troca', 'nunca'
    gera_placa TEXT DEFAULT 'se_troca', -- 'sempre', 'se_troca', 'nunca'
    -- Custos extras automáticos (referencia price_table.codigo)
    custos_extras JSONB DEFAULT '[]'::jsonb, -- [{"codigo": "taxa_gravame", "condicao": "sempre"}]
    -- Metadata
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE service_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all access to service_config" ON service_config;
CREATE POLICY "Allow all access to service_config" ON service_config FOR ALL USING (true) WITH CHECK (true);

-- Trigger para atualizar atualizado_em
CREATE OR REPLACE FUNCTION update_service_config_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.atualizado_em = NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_service_config_updated_at ON service_config;
CREATE TRIGGER trigger_service_config_updated_at
    BEFORE UPDATE ON service_config
    FOR EACH ROW EXECUTE FUNCTION update_service_config_updated_at();

-- Seed com os 9 serviços existentes (pré-preenchidos)
INSERT INTO service_config (tipo_servico, nome_exibicao, documentos_pf, documentos_pj, documentos_extras, dae_tipo, gera_vistoria, gera_placa)
VALUES
    ('transferencia', 'Transferência de Propriedade',
     '["CNH"]'::jsonb,
     '["CNPJ", "Contrato Social", "CNH Responsável pela Empresa"]'::jsonb,
     '[{"condicao": "vendedor_pj", "docs": ["CNPJ (Vendedor)", "Contrato Social (Vendedor)", "CNH Responsável pela Empresa (Vendedor)"]}]'::jsonb,
     'principal', 'sempre', 'se_troca'),

    ('alteracao_dados', 'Alteração de Dados',
     '["CNH", "CRV Original"]'::jsonb,
     '["CNPJ", "Contrato Social", "CNH Responsável pela Empresa", "CRV Original"]'::jsonb,
     '[]'::jsonb,
     'alteracao', 'se_troca', 'se_troca'),

    ('segunda_via', 'Segunda via de CRV',
     '["CNH", "Documento do veículo", "Declaração de perda do recibo (assinada e reconhecida)", "Solicitação de 2ª via (assinada e reconhecida)"]'::jsonb,
     '["CNPJ", "Contrato Social", "CNH Responsável pela Empresa", "Documento do veículo", "Declaração de perda do recibo (assinada e reconhecida)", "Solicitação de 2ª via (assinada e reconhecida)"]'::jsonb,
     '[]'::jsonb,
     'principal', 'sempre', 'nunca'),

    ('mudanca_caracteristica', 'Mudança de Característica',
     '["CNH"]'::jsonb,
     '["CNPJ", "Contrato Social", "CNH Responsável pela Empresa"]'::jsonb,
     '[]'::jsonb,
     'principal', 'sempre', 'nunca'),

    ('mudanca_categoria', 'Mudança de Categoria',
     '["CNH"]'::jsonb,
     '["CNPJ", "Contrato Social", "CNH Responsável pela Empresa"]'::jsonb,
     '[]'::jsonb,
     'principal', 'sempre', 'nunca'),

    ('baixa', 'Baixa',
     '["CNH", "CRV (Certificado de Registro de Veículo)", "Requerimento de Baixa (assinado)", "Comprovante de quitação de débitos (IPVA, multas, DPVAT)"]'::jsonb,
     '["CNPJ", "Contrato Social", "CNH Responsável pela Empresa", "CRV (Certificado de Registro de Veículo)", "Requerimento de Baixa (assinado)", "Comprovante de quitação de débitos (IPVA, multas, DPVAT)"]'::jsonb,
     '[]'::jsonb,
     'alteracao', 'sempre', 'nunca'),

    ('primeiro_emplacamento', 'Primeiro Emplacamento',
     '["CNH", "Nota Fiscal do veículo"]'::jsonb,
     '["CNPJ", "Contrato Social", "CNH Responsável pela Empresa", "Nota Fiscal do veículo"]'::jsonb,
     '[]'::jsonb,
     'principal', 'sempre', 'sempre'),

    ('vistoria_lacrada', 'Vistoria Lacrada',
     '["CNH"]'::jsonb,
     '["CNPJ", "Contrato Social", "CNH Responsável pela Empresa"]'::jsonb,
     '[]'::jsonb,
     'principal', 'sempre', 'nunca'),

    ('baixa_impedimento', 'Baixa de Impedimento',
     '["CNH"]'::jsonb,
     '["CNPJ", "Contrato Social", "CNH Responsável pela Empresa"]'::jsonb,
     '[]'::jsonb,
     'alteracao', 'nunca', 'nunca')
ON CONFLICT (tipo_servico) DO UPDATE SET
    nome_exibicao = EXCLUDED.nome_exibicao,
    documentos_pf = EXCLUDED.documentos_pf,
    documentos_pj = EXCLUDED.documentos_pj,
    documentos_extras = EXCLUDED.documentos_extras,
    dae_tipo = EXCLUDED.dae_tipo,
    gera_vistoria = EXCLUDED.gera_vistoria,
    gera_placa = EXCLUDED.gera_placa;

-- Index
CREATE INDEX IF NOT EXISTS idx_service_config_tipo ON service_config(tipo_servico);
