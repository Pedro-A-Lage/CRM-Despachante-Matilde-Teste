-- ============================================
-- SUPABASE SCHEMA - DESPACHANTE MATILDE CRM
-- Execute este SQL no Supabase Dashboard → SQL Editor
-- ============================================

-- Tabela de Clientes
CREATE TABLE IF NOT EXISTS clientes (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tipo TEXT NOT NULL DEFAULT 'PF',
    nome TEXT NOT NULL,
    cpf_cnpj TEXT NOT NULL UNIQUE,
    telefones JSONB NOT NULL DEFAULT '[]'::jsonb,
    email TEXT,
    observacoes TEXT,
    documentos JSONB NOT NULL DEFAULT '[]'::jsonb,
    pasta_drive_id TEXT,
    pasta_drive_url TEXT,
    pasta_supabase_path TEXT,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tabela de Veículos
CREATE TABLE IF NOT EXISTS veiculos (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    placa TEXT NOT NULL UNIQUE,
    renavam TEXT NOT NULL DEFAULT '',
    chassi TEXT NOT NULL DEFAULT '',
    marca_modelo TEXT NOT NULL DEFAULT '',
    cliente_id TEXT NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
    observacoes TEXT,
    data_aquisicao TEXT,
    data_emissao_crv TEXT,
    pasta_drive_id TEXT,
    cadastro_drive_id TEXT,
    pasta_supabase_path TEXT,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tabela de Ordens de Serviço
CREATE TABLE IF NOT EXISTS ordens_de_servico (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    numero SERIAL,
    data_abertura TIMESTAMPTZ NOT NULL DEFAULT now(),
    cliente_id TEXT NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
    veiculo_id TEXT NOT NULL REFERENCES veiculos(id) ON DELETE CASCADE,
    tipo_servico TEXT NOT NULL,
    troca_placa BOOLEAN NOT NULL DEFAULT false,
    status TEXT NOT NULL DEFAULT 'aguardando_documentacao',
    pasta_drive TEXT,
    checklist JSONB NOT NULL DEFAULT '[]'::jsonb,
    detran JSONB,
    vistoria JSONB,
    vistoria_history JSONB NOT NULL DEFAULT '[]'::jsonb,
    delegacia JSONB,
    sifap JSONB,
    comunicacoes JSONB NOT NULL DEFAULT '[]'::jsonb,
    audit_log JSONB NOT NULL DEFAULT '[]'::jsonb,
    doc_pronto_em TIMESTAMPTZ,
    doc_final_anexado_em TIMESTAMPTZ,
    doc_final_nome TEXT,
    entregue_em TIMESTAMPTZ,
    entregue_para_nome TEXT,
    vistoria_anexada_em TIMESTAMPTZ,
    vistoria_nome_arquivo TEXT,
    pasta_supabase TEXT,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tabela de Protocolos Diários
CREATE TABLE IF NOT EXISTS protocolos_diarios (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    data TEXT NOT NULL,
    processos JSONB NOT NULL DEFAULT '[]'::jsonb,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices para melhorar performance
CREATE INDEX IF NOT EXISTS idx_veiculos_cliente_id ON veiculos(cliente_id);
CREATE INDEX IF NOT EXISTS idx_ordens_cliente_id ON ordens_de_servico(cliente_id);
CREATE INDEX IF NOT EXISTS idx_ordens_veiculo_id ON ordens_de_servico(veiculo_id);
CREATE INDEX IF NOT EXISTS idx_ordens_status ON ordens_de_servico(status);
CREATE INDEX IF NOT EXISTS idx_protocolos_data ON protocolos_diarios(data);

-- RLS: Desabilitar por enquanto (acesso público com anon key)
ALTER TABLE clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE veiculos ENABLE ROW LEVEL SECURITY;
ALTER TABLE ordens_de_servico ENABLE ROW LEVEL SECURITY;
ALTER TABLE protocolos_diarios ENABLE ROW LEVEL SECURITY;

-- Policies de acesso público (para uso com anon key sem autenticação)
CREATE POLICY "Allow all access to clientes" ON clientes FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to veiculos" ON veiculos FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to ordens_de_servico" ON ordens_de_servico FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to protocolos_diarios" ON protocolos_diarios FOR ALL USING (true) WITH CHECK (true);
