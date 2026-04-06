-- Migration: add transferencia column to ordens_de_servico
-- Armazena dados da transferência de propriedade (vendedor, valor, data, tipos CPF/CNPJ)

ALTER TABLE ordens_de_servico
  ADD COLUMN IF NOT EXISTS transferencia JSONB DEFAULT NULL;

COMMENT ON COLUMN ordens_de_servico.transferencia IS 'Dados da transferência de propriedade: vendedor, valor declarado, data da venda, tipoCpfCnpjComprador, tipoCpfCnpjVendedor';
