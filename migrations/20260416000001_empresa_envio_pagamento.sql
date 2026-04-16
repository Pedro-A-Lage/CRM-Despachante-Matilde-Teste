-- Adiciona configurações por empresa para canal de envio (email vs portal externo)
-- e forma de pagamento padrão (pré-popular RecebimentoModal das OS dela).
--
-- Empresas existentes ficam como 'email' por default (comportamento atual).
-- Para Kuruma e similares, basta mudar via interface para 'portal' e preencher
-- a URL do portal externo.

ALTER TABLE empresas_parceiras
    ADD COLUMN IF NOT EXISTS metodo_envio TEXT DEFAULT 'email'
        CHECK (metodo_envio IN ('email','portal')),
    ADD COLUMN IF NOT EXISTS portal_url TEXT,
    ADD COLUMN IF NOT EXISTS portal_label TEXT,
    ADD COLUMN IF NOT EXISTS forma_pagamento_padrao TEXT
        CHECK (forma_pagamento_padrao IN ('pix','boleto','cartao','dinheiro','ted','outro'));
