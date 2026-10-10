-- =====================================================================
-- Quadros do Marketing: DESCRIÇÃO do quadro (o "Sobre este quadro" do Trello,
-- no menu do quadro). Uma coluna, texto livre em markdown — o mesmo formato da
-- descrição do cartão, desenhado pelo `TextoRico`.
-- ⚠️ A tela lê o quadro com `select("*")`, então a coluna nova não quebra nada
-- entre o deploy e esta migração: até rodar, "Sobre" mostra vazio e salvar diz
-- o erro.
-- =====================================================================

-- BLOCO 0 — medir. ESPERADO: ja_existe = false
select exists (select 1 from information_schema.columns
                where table_schema = 'public' and table_name = 'mkt_boards' and column_name = 'descricao') as ja_existe;

-- BLOCO 1 — a coluna
alter table public.mkt_boards add column if not exists descricao text;

-- CONFERÊNCIA. ESPERADO: true
select exists (select 1 from information_schema.columns
                where table_schema = 'public' and table_name = 'mkt_boards' and column_name = 'descricao') as coluna;
