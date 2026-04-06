-- migrations/20260406000001_campos_cliente_veiculo.sql
-- Adiciona campos da folha de cadastro Detran em clientes e veiculos

-- Campos de documento e endereço do cliente
ALTER TABLE clientes
  ADD COLUMN IF NOT EXISTS rg TEXT,
  ADD COLUMN IF NOT EXISTS orgao_expedidor TEXT,
  ADD COLUMN IF NOT EXISTS uf_documento TEXT,
  ADD COLUMN IF NOT EXISTS endereco TEXT,
  ADD COLUMN IF NOT EXISTS numero TEXT,
  ADD COLUMN IF NOT EXISTS complemento TEXT,
  ADD COLUMN IF NOT EXISTS cep TEXT,
  ADD COLUMN IF NOT EXISTS bairro TEXT,
  ADD COLUMN IF NOT EXISTS municipio TEXT,
  ADD COLUMN IF NOT EXISTS uf TEXT;

-- Características do veículo
ALTER TABLE veiculos
  ADD COLUMN IF NOT EXISTS ano_fabricacao TEXT,
  ADD COLUMN IF NOT EXISTS ano_modelo TEXT,
  ADD COLUMN IF NOT EXISTS cor TEXT,
  ADD COLUMN IF NOT EXISTS combustivel TEXT;
