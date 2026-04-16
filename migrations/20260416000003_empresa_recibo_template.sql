-- Adiciona caminho do template de recibo (.xlsx) por empresa parceira.
--
-- O arquivo do template fica em /public/recibos/<arquivo>.xlsx e contém
-- placeholders {{var}} e blocos {{#cond}}...{{/cond}} que o sistema preenche
-- com dados da OS (placa, vistoria, valores, cliente, etc.) ao gerar o recibo.
--
-- Empresas sem template definido não exibem o botão "Gerar Recibo".

ALTER TABLE empresas_parceiras
    ADD COLUMN IF NOT EXISTS recibo_template_path TEXT;
