-- ═══════════════════════════════════════════════════════════════════════════
-- Bling 2 — nome dos canais de venda
--
-- O de-para nasce vazio (o Bling só manda o id). Estes três foram
-- identificados no painel do Bling em 2026-08-03.
--
-- ⚠️ `where nome is null` em todos: se alguém corrigir um nome pela tela, esta
-- migração NÃO desfaz. Migração que sobrescreve ajuste manual é a forma mais
-- rápida de fazer o time parar de confiar na tela.
--
-- Canal novo (Shopee, TikTok…) NÃO precisa de migração: o sync cadastra o id
-- sozinho com nome vazio, e ele aparece no faturamento como
-- "Loja NNNNN — SEM NOME, batize em bling2_lojas".
-- ═══════════════════════════════════════════════════════════════════════════

update public.bling2_lojas set nome = 'Nuvemshop'      where bling_id = 206108070 and nome is null;
update public.bling2_lojas set nome = 'Mercado Livre'  where bling_id = 206107776 and nome is null;
update public.bling2_lojas set nome = 'Amazon'         where bling_id = 206107792 and nome is null;


-- ── Conferência ───────────────────────────────────────────────────────────

-- (a) Sobrou algum canal sem nome? Se aparecer linha aqui depois de hoje, é
--     marketplace novo que entrou — batize antes de olhar faturamento.
select bling_id, nome, primeiro_visto_em
from public.bling2_lojas
order by nome nulls first, bling_id;

-- (b) O resultado que motivou tudo isto: faturamento por canal e mês.
select canal, mes, notas, faturamento
from public.bling2_faturamento_por_canal
order by mes desc, faturamento desc;

-- (c) Total do período, para bater com a tela do Bling — lembrando que a tela
--     soma TUDO, inclusive nota cancelada, e esta view só soma válida.
select sum(faturamento) as faturamento_valido,
       sum(notas)       as notas_validas
from public.bling2_faturamento_por_canal;
