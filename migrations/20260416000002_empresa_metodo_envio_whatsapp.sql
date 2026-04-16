-- Expande o CHECK do metodo_envio em empresas_parceiras para incluir 'whatsapp'.
-- Preparação para a integração com a API oficial Meta; até lá o canal existe
-- apenas para marcação manual ("Marcar enviado") e configuração por etapa.
--
-- Execução idempotente: remove a constraint antiga (de qualquer nome) e adiciona
-- a nova com o conjunto de valores atualizado.

DO $$
DECLARE
    constraint_name TEXT;
BEGIN
    SELECT con.conname INTO constraint_name
    FROM pg_constraint con
    JOIN pg_class cls ON cls.oid = con.conrelid
    WHERE cls.relname = 'empresas_parceiras'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%metodo_envio%'
    LIMIT 1;

    IF constraint_name IS NOT NULL THEN
        EXECUTE format('ALTER TABLE empresas_parceiras DROP CONSTRAINT %I', constraint_name);
    END IF;
END $$;

ALTER TABLE empresas_parceiras
    ADD CONSTRAINT empresas_parceiras_metodo_envio_check
    CHECK (metodo_envio IN ('email','portal','whatsapp'));
