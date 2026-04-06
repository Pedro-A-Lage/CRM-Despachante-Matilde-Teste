-- migrations/20260405000002_fabricas_placas.sql

-- 1. Tabela de fábricas de placas
CREATE TABLE IF NOT EXISTS fabricas_placas (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    nome TEXT NOT NULL,
    ativo BOOLEAN NOT NULL DEFAULT true,
    custo_carro NUMERIC NOT NULL DEFAULT 100,
    custo_moto NUMERIC NOT NULL DEFAULT 70,
    valor_boleto_empresa NUMERIC NOT NULL DEFAULT 250,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. RLS
ALTER TABLE fabricas_placas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for fabricas_placas" ON fabricas_placas;
CREATE POLICY "Allow all for fabricas_placas" ON fabricas_placas FOR ALL USING (true) WITH CHECK (true);

-- 3. Tabela de pedidos de placas
CREATE TABLE IF NOT EXISTS pedidos_placas (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    fabrica_id TEXT NOT NULL REFERENCES fabricas_placas(id),
    os_id TEXT REFERENCES ordens_de_servico(id) ON DELETE SET NULL,
    empresa_parceira_id TEXT REFERENCES empresas_parceiras(id) ON DELETE SET NULL,
    tipo_veiculo TEXT NOT NULL CHECK (tipo_veiculo IN ('carro', 'moto')),
    custo_real NUMERIC NOT NULL,
    valor_boleto NUMERIC NOT NULL,
    saldo_usado NUMERIC NOT NULL DEFAULT 0,
    data_pedido DATE NOT NULL DEFAULT CURRENT_DATE,
    observacao TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. RLS
ALTER TABLE pedidos_placas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for pedidos_placas" ON pedidos_placas;
CREATE POLICY "Allow all for pedidos_placas" ON pedidos_placas FOR ALL USING (true) WITH CHECK (true);

-- 5. Índices
CREATE INDEX IF NOT EXISTS idx_pedidos_placas_fabrica ON pedidos_placas(fabrica_id);
CREATE INDEX IF NOT EXISTS idx_pedidos_placas_data ON pedidos_placas(data_pedido);

-- 6. Dados iniciais — fábrica padrão
INSERT INTO fabricas_placas (nome, custo_carro, custo_moto, valor_boleto_empresa)
VALUES ('Fábrica Principal', 100, 70, 250);
