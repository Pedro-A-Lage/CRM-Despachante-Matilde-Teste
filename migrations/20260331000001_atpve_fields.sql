-- migrations/20260331000001_atpve_fields.sql
-- Campos intrínsecos do veículo extraídos do ATPV-e
ALTER TABLE veiculos
  ADD COLUMN IF NOT EXISTS categoria TEXT,
  ADD COLUMN IF NOT EXISTS numero_crv TEXT,
  ADD COLUMN IF NOT EXISTS codigo_seguranca_crv TEXT,
  ADD COLUMN IF NOT EXISTS numero_atpve TEXT,
  ADD COLUMN IF NOT EXISTS hodometro TEXT;

-- Dados da transação de transferência (vendedor, local, valor, data)
ALTER TABLE ordens_de_servico
  ADD COLUMN IF NOT EXISTS transferencia JSONB;

COMMENT ON COLUMN veiculos.categoria IS 'Categoria do veículo conforme ATPV-e (ex: OFI, PAR, ESP ou ***)';
COMMENT ON COLUMN veiculos.numero_crv IS 'Número do CRV';
COMMENT ON COLUMN veiculos.codigo_seguranca_crv IS 'Código de segurança do CRV';
COMMENT ON COLUMN veiculos.numero_atpve IS 'Número do documento ATPV-e';
COMMENT ON COLUMN veiculos.hodometro IS 'Hodômetro declarado na transferência';
COMMENT ON COLUMN ordens_de_servico.transferencia IS 'Dados da transação: vendedor, local, valor declarado, data da venda';
