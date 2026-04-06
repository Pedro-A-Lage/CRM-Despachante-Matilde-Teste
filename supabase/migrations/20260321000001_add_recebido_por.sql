-- Add recebido_por column to payments table
ALTER TABLE payments
ADD COLUMN IF NOT EXISTS recebido_por TEXT;

-- Add comment
COMMENT ON COLUMN payments.recebido_por IS 'Nome de quem recebeu o pagamento';
