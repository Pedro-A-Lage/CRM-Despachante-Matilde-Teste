-- Confirma em UMA transação todas as charges 'a_pagar' de uma OS.
-- Substitui o loop sequencial em src/lib/financeService.ts (bug P1-4):
-- antes, se a N-ésima UPDATE falhava, as anteriores ficavam 'pago' e as
-- posteriores continuavam 'a_pagar' (estado parcial irrecuperável).
CREATE OR REPLACE FUNCTION confirmar_todos_charges_os(
    p_os_id TEXT,
    p_usuario TEXT
) RETURNS INTEGER AS $$
DECLARE
    affected INTEGER;
BEGIN
    UPDATE finance_charges
       SET status = 'pago',
           valor_pago = valor_previsto,
           confirmado_por = p_usuario,
           confirmado_em = now(),
           atualizado_em = now()
     WHERE os_id = p_os_id
       AND status = 'a_pagar';
    GET DIAGNOSTICS affected = ROW_COUNT;
    RETURN affected;
END;
$$ LANGUAGE plpgsql;
