-- Renumerar todas as OS existentes em ordem de criação (1, 2, 3, ...)
WITH numbered AS (
    SELECT id, ROW_NUMBER() OVER (ORDER BY criado_em ASC, numero ASC) AS novo_numero
    FROM ordens_de_servico
)
UPDATE ordens_de_servico
SET numero = numbered.novo_numero
FROM numbered
WHERE ordens_de_servico.id = numbered.id;

-- Remover o DEFAULT da sequence do SERIAL (não será mais usado)
-- O numero agora é calculado no código como MAX(numero) + 1
ALTER TABLE ordens_de_servico ALTER COLUMN numero DROP DEFAULT;

-- Dropar a sequence que não será mais usada
DROP SEQUENCE IF EXISTS ordens_de_servico_numero_seq;
