-- Restaura o DEFAULT atômico para ordens_de_servico.numero.
-- A migration 20260405000004 dropou a sequence; hoje o próximo número é
-- calculado no JS como MAX(numero)+1 (bug P1-1/WF-3 — duas criações
-- concorrentes geram OSs com o MESMO numero). Este migration recria uma
-- sequence sincronizada com o estado atual e define como DEFAULT.
--
-- Depois de aplicar: o código de database.ts (saveOrdem) deixa de passar
-- `numero` no insert; o Postgres preenche atomicamente via nextval().
DO $$
DECLARE
    max_existente BIGINT;
BEGIN
    SELECT COALESCE(MAX(numero), 0) INTO max_existente FROM ordens_de_servico;
    EXECUTE format(
        'CREATE SEQUENCE IF NOT EXISTS ordens_de_servico_numero_seq START WITH %s',
        max_existente + 1
    );
    -- Garante que a sequence esteja sincronizada mesmo se já existia
    PERFORM setval('ordens_de_servico_numero_seq', GREATEST(max_existente, 1), max_existente > 0);
END $$;

ALTER TABLE ordens_de_servico
    ALTER COLUMN numero SET DEFAULT nextval('ordens_de_servico_numero_seq');
ALTER SEQUENCE ordens_de_servico_numero_seq OWNED BY ordens_de_servico.numero;
