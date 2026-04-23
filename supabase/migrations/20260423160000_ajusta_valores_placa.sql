-- ============================================================
-- MIGRATION: ajusta_valores_placa
-- Data: 2026-04-23
-- Descrição: Define os valores corretos de placa:
--   · Normal (particular) → R$ 100,00
--   · Para empresa parceira → R$ 250,00
--
-- Aplica em duas dimensões:
--   1. price_table.placa_carro_mercosul = 100 (valor cobrado em OS
--      particular, sem empresa vinculada)
--   2. empresas_parceiras.valor_placa   = 250 (todas as empresas
--      recebem esse valor)
--
-- NOTA sobre moto: placa de moto NÃO é alterada por este script
-- intencionalmente (normalmente tem valor diferente). Ajuste
-- manualmente em Configurações → Custos Fixos se precisar.
--
-- Efeito em OS existentes: NENHUMA charge é alterada por este script.
-- Pra corrigir as OS abertas que ficaram com valor errado, rode
-- depois a migration "20260423150000_recalc_placas_backlog.sql"
-- (dry-run + apply). O script de backlog detecta automaticamente
-- divergências e grava no audit trail.
-- ============================================================

-- ╔════════════════════════════════════════════════════════════╗
-- ║ PARTE 1 — CONFERIR (dry-run)                                 ║
-- ╚════════════════════════════════════════════════════════════╝

-- Valor atual da placa carro na tabela
SELECT codigo, descricao, valor AS valor_atual
  FROM price_table
 WHERE codigo = 'placa_carro_mercosul';

-- Empresas que serão afetadas (qualquer valor diferente de 250 ou NULL)
SELECT id, nome, valor_placa AS valor_atual
  FROM empresas_parceiras
 WHERE valor_placa IS DISTINCT FROM 250;


-- ╔════════════════════════════════════════════════════════════╗
-- ║ PARTE 2 — APLICAR                                            ║
-- ╚════════════════════════════════════════════════════════════╝

-- 2a. Valor normal de placa carro (particular)
UPDATE price_table
   SET valor          = 100.00,
       atualizado_em  = NOW()
 WHERE codigo = 'placa_carro_mercosul';

-- 2b. Valor de placa pra TODAS as empresas parceiras
UPDATE empresas_parceiras
   SET valor_placa    = 250.00,
       atualizado_em  = NOW()
 WHERE valor_placa IS DISTINCT FROM 250;


-- ╔════════════════════════════════════════════════════════════╗
-- ║ PARTE 3 — CONFERÊNCIA FINAL                                  ║
-- ╚════════════════════════════════════════════════════════════╝

SELECT codigo, valor FROM price_table WHERE codigo = 'placa_carro_mercosul';
-- Esperado: placa_carro_mercosul | 100.00

SELECT COUNT(*) AS empresas_com_valor_diferente
  FROM empresas_parceiras
 WHERE valor_placa IS DISTINCT FROM 250;
-- Esperado: 0
