-- ============================================================
-- Migration: Financeiro Redesign
-- Cria tabela service_prices e adiciona colunas na OS
-- ============================================================

-- 1. Tabela de preços dos serviços (valor cobrado ao cliente)
CREATE TABLE IF NOT EXISTS service_prices (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tipo_servico TEXT NOT NULL,
  tipo_veiculo TEXT NOT NULL CHECK (tipo_veiculo IN ('carro', 'moto')),
  com_placa BOOLEAN NOT NULL DEFAULT false,
  valor NUMERIC(10,2) NOT NULL,
  ativo BOOLEAN NOT NULL DEFAULT true,
  criado_em TIMESTAMPTZ DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tipo_servico, tipo_veiculo, com_placa)
);

-- Trigger updated_at
CREATE TRIGGER set_updated_at_service_prices
  BEFORE UPDATE ON service_prices
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- RLS
ALTER TABLE service_prices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_prices_select" ON service_prices FOR SELECT TO authenticated USING (true);
CREATE POLICY "service_prices_all" ON service_prices FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 2. Dados iniciais — CARRO
INSERT INTO service_prices (tipo_servico, tipo_veiculo, com_placa, valor) VALUES
  ('transferencia',          'carro', false, 450.00),
  ('transferencia',          'carro', true,  780.00),
  ('segunda_via',            'carro', false, 450.00),
  ('baixa',                  'carro', false, 450.00),
  ('alteracao_dados',        'carro', true,  580.00),
  ('alteracao_dados',        'carro', false, 380.00),
  ('primeiro_emplacamento',  'carro', true,  780.00),
  ('mudanca_caracteristica', 'carro', false, 450.00),
  ('mudanca_categoria',      'carro', false, 450.00),
  ('vistoria_lacrada',       'carro', false, 450.00),
  ('baixa_impedimento',      'carro', false, 380.00)
ON CONFLICT (tipo_servico, tipo_veiculo, com_placa) DO NOTHING;

-- Dados iniciais — MOTO
INSERT INTO service_prices (tipo_servico, tipo_veiculo, com_placa, valor) VALUES
  ('transferencia',          'moto', false, 450.00),
  ('transferencia',          'moto', true,  680.00),
  ('segunda_via',            'moto', false, 450.00),
  ('alteracao_dados',        'moto', true,  480.00),
  ('alteracao_dados',        'moto', false, 380.00),
  ('primeiro_emplacamento',  'moto', true,  680.00),
  ('mudanca_caracteristica', 'moto', false, 450.00),
  ('mudanca_categoria',      'moto', false, 450.00),
  ('vistoria_lacrada',       'moto', false, 450.00),
  ('baixa_impedimento',      'moto', false, 380.00)
ON CONFLICT (tipo_servico, tipo_veiculo, com_placa) DO NOTHING;

-- 3. Novas colunas na tabela ordens_de_servico
ALTER TABLE ordens_de_servico
  ADD COLUMN IF NOT EXISTS tipo_veiculo TEXT CHECK (tipo_veiculo IN ('carro', 'moto')),
  ADD COLUMN IF NOT EXISTS valor_servico NUMERIC(10,2);

-- 4. Tornar charge_id em payments realmente opcional (já é nullable, mas confirmar)
-- payments.charge_id já é nullable por padrão, nenhuma mudança necessária.
