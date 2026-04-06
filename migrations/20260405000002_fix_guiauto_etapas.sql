-- Corrige Guiauto: envio único com todos os documentos
UPDATE empresas_parceiras
SET etapas_envio = '[
    {"ordem": 1, "nome": "Documentação completa", "documentos": ["tx_estado", "comprovante_pagamento", "taxa_vistoria", "boleto_placa", "comprovante_placa", "nota_fiscal"]}
]'::jsonb
WHERE nome = 'Guiauto';
