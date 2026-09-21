-- ═══════════════════════════════════════════════════════════════════════════
-- Os sete materiais de PDV saem de "Outro" e viram "Trade Marketing"
--
-- Complemento da `20260994`, que criou a categoria. Ela foi criada para os
-- produtos que viriam DEPOIS — e o censo do catálogo mostrou que sete deles já
-- existiam, empilhados em `Outro` porque não havia onde pô-los.
--
-- ⚠️ Foi a consulta de conferência que os achou, não o pedido. `Outro` tinha 9
-- produtos, e a pergunta "será que parte disso já é trade?" custou uma consulta
-- e evitou sete cadastros duplicados. Categoria nova SEMPRE merece essa
-- pergunta: o material existia, o rótulo é que não.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- ⚠️ DOIS FICAM FORA, E ISSO É DECISÃO
--
--   ACI-SULF   Ácido Sulfúrico   é químico, provavelmente `Insumo`
--   FUNIL      Funil             é ferramenta, não é nenhuma das categorias
--
-- Classificar os dois é decisão de quem opera, não efeito colateral desta
-- tarefa. `Outro` descreve os dois honestamente enquanto ninguém decide — e o
-- lado seguro aqui é NÃO classificar, a mesma regra do `e_online` das lojas do
-- Bling 1: errar para uma categoria some com o item da lista de quem a procura;
-- errar para "não sei" gera ruído visível. Ruído se vê.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- ⚠️ LISTA EXPLÍCITA POR CÓDIGO, NUNCA PADRÃO DE NOME
--
-- `name ilike '%suporte%'` ou `'%testeira%'` casaria com peça de produção no
-- dia em que uma existir, e reclassificar um insumo o tiraria calado da tela de
-- quem planeja. Mesma lição do cadastro de PDV: nome não é chave.
--
-- ⚠️ RODE EM BLOCOS.
-- ═══════════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — a FOTO DO ANTES                                             ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- Guarde o retorno: é com ele que o BLOCO 3 compara. Sem a foto, a conferência
-- compararia o resultado com ele mesmo e diria sempre "está certo" — a doença
-- da `20260941`.
--
-- ESPERADO: sete linhas, todas com `category = 'Outro'`.

select product_code, name, category
from public.mrp_products
where product_code in ('DISP-ACR','EXP','PANF','SUP-PANF-BANC','SUP-PAN-TES','TES-EXP','WIN-BAN')
order by product_code;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — reclassifica                                                ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- ESPERADO: `UPDATE 7`. Vindo MENOS, algum código mudou desde a medição —
-- pare e confira em vez de insistir.
--
-- O `coalesce(category,'') <> 'Trade Marketing'` deixa o bloco idempotente:
-- rodar de novo devolve `UPDATE 0` em vez de reescrever o que já está certo.

update public.mrp_products
set category = 'Trade Marketing'
where product_code in ('DISP-ACR','EXP','PANF','SUP-PANF-BANC','SUP-PAN-TES','TES-EXP','WIN-BAN')
  and coalesce(category, '') <> 'Trade Marketing';


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 3 — CONFERÊNCIA                                                 ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- (a) ⭐ `Trade Marketing` com 7 e `Outro` caindo de 9 para 2.
--     ⚠️ O número de referência vem COM o que o grupo continha: os 9 de `Outro`
--     eram os 7 de PDV + Ácido Sulfúrico + Funil. Sem isso a conferência passa
--     a testar a minha aritmética em vez do sistema.
select coalesce(category, '(nulo)') as categoria, count(*) as produtos
from public.mrp_products group by 1 order by 2 desc;

-- (b) Sobra em `Outro` apenas o que foi deixado de propósito.
--     ESPERADO: `Ácido Sulfúrico` e `Funil`, e mais nada.
select product_code, name from public.mrp_products
where coalesce(category, '') not in
      ('Produto Final','Semi-acabado','Insumo','Embalagem','Carbonatação','Trade Marketing')
order by name;

-- (c) Nenhum produto de PRODUÇÃO foi arrastado junto. ESPERADO: zero linhas.
--     É a guarda contra a lista ter pego um código errado — e ela olha o lado
--     que dói: produto com ficha técnica virando material de PDV sumiria do
--     planejamento sem erro nenhum.
select p.product_code, p.name, p.category
from public.mrp_products p
where p.category = 'Trade Marketing'
  and exists (select 1 from public.mrp_bom b where b.product_id = p.id);

-- ⚠️ Reverter é o MESMO update com 'Outro' no lugar. Nada é apagado.
