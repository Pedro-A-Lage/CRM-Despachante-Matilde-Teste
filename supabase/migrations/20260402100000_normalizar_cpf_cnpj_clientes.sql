-- Normaliza cpf_cnpj de todos os clientes: remove pontos, traços, barras e espaços
-- Funciona para CPF (11 dígitos) e CNPJ (14 dígitos)
UPDATE clientes
SET cpf_cnpj = regexp_replace(cpf_cnpj, '[^0-9]', '', 'g')
WHERE cpf_cnpj IS NOT NULL AND cpf_cnpj != '';

-- Corrige CPF com 10 dígitos (perdeu zero inicial) → padding para 11
UPDATE clientes
SET cpf_cnpj = lpad(cpf_cnpj, 11, '0')
WHERE length(cpf_cnpj) = 10;

-- Corrige CNPJ com 13 dígitos (perdeu zero inicial) → padding para 14
UPDATE clientes
SET cpf_cnpj = lpad(cpf_cnpj, 14, '0')
WHERE length(cpf_cnpj) = 13;

-- Garante que entradas futuras só aceitem dígitos (ou NULL/vazio para clientes sem CPF)
ALTER TABLE clientes
    DROP CONSTRAINT IF EXISTS clientes_cpf_cnpj_somente_digitos;

ALTER TABLE clientes
    ADD CONSTRAINT clientes_cpf_cnpj_somente_digitos
    CHECK (
        cpf_cnpj IS NULL OR
        cpf_cnpj = '' OR
        cpf_cnpj ~ '^[0-9]{11}$' OR
        cpf_cnpj ~ '^[0-9]{14}$'
    );
