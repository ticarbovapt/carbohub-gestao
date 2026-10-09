-- =====================================================================
-- Quadros do Marketing: "Sincronizar com o Trello".
--
-- Pedido do dono do processo em 09/10/2026: até a virada, o time continua
-- trabalhando no Trello, e o quadro daqui tem de ACOMPANHAR — o Trello vence,
-- cartão apagado lá é ARQUIVADO aqui (nunca apagado), e o botão pode ser
-- usado quantas vezes for preciso.
--
-- O mapeamento de 09/10 mediu o defasamento: um cartão movido no Trello
-- (Arthur → Mirian) parado aqui, dois cartões apagados lá ainda aparecendo
-- aqui, a ordem das listas trocada e um campo "Área" diferente.
--
-- ⚠️ A importação NÃO guardou o id do Trello — só o instante de criação (o id
-- do Trello o carrega, e o import gravou exatamente ele em `created_at`). Esta
-- migração dá a cada coisa uma coluna `trello_id`; a PRIMEIRA sincronização
-- liga o que já existe pelo instante (só quando o casamento é ÚNICO) e grava o
-- id. Dali em diante o elo é o id, e nome ou instante não importam mais.
--
-- ⚠️ Índices únicos POR QUADRO (por cartão, nos checklists): dois cartões
-- daqui apontando para o MESMO cartão do Trello seriam dois donos para o
-- mesmo dado, e a segunda sincronização escolheria um por acaso.
-- =====================================================================

-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 0 — medir antes de mexer                                    ║
-- ╚═══════════════════════════════════════════════════════════════════╝
-- ESPERADO: uma linha por quadro importado, com ja_tem_coluna = false.
select b.id, b.title, b.created_at,
       (select count(*) from public.mkt_lists l where l.board_id = b.id) as listas,
       (select count(*) from public.mkt_cards c where c.board_id = b.id) as cartoes,
       exists (select 1 from information_schema.columns
                where table_schema = 'public' and table_name = 'mkt_cards'
                  and column_name = 'trello_id') as ja_tem_coluna
  from public.mkt_boards b
 where exists (select 1 from public.mkt_card_attachments a
                 join public.mkt_cards c on c.id = a.card_id
                where c.board_id = b.id and a.external_url like 'https://trello.com/1/cards/%');

-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — as colunas e os índices                                  ║
-- ╚═══════════════════════════════════════════════════════════════════╝
set lock_timeout = '5s';

alter table public.mkt_boards
  add column if not exists trello_id text,
  add column if not exists trello_sincronizado_em timestamptz;
alter table public.mkt_lists           add column if not exists trello_id text;
alter table public.mkt_cards           add column if not exists trello_id text;
alter table public.mkt_labels          add column if not exists trello_id text;
alter table public.mkt_custom_fields   add column if not exists trello_id text;
alter table public.mkt_checklists      add column if not exists trello_id text;
alter table public.mkt_checklist_items add column if not exists trello_id text;

create unique index if not exists mkt_boards_trello_uniq
  on public.mkt_boards (trello_id) where trello_id is not null;
create unique index if not exists mkt_lists_trello_uniq
  on public.mkt_lists (board_id, trello_id) where trello_id is not null;
create unique index if not exists mkt_cards_trello_uniq
  on public.mkt_cards (board_id, trello_id) where trello_id is not null;
create unique index if not exists mkt_labels_trello_uniq
  on public.mkt_labels (board_id, trello_id) where trello_id is not null;
create unique index if not exists mkt_custom_fields_trello_uniq
  on public.mkt_custom_fields (board_id, trello_id) where trello_id is not null;
create unique index if not exists mkt_checklists_trello_uniq
  on public.mkt_checklists (card_id, trello_id) where trello_id is not null;
create unique index if not exists mkt_checklist_items_trello_uniq
  on public.mkt_checklist_items (checklist_id, trello_id) where trello_id is not null;

reset lock_timeout;

-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ CONFERÊNCIA                                                        ║
-- ╚═══════════════════════════════════════════════════════════════════╝
-- ESPERADO: 7 tabelas, 7 índices.
select count(distinct table_name) as tabelas_com_trello_id,
       (select count(*) from pg_indexes
         where schemaname = 'public' and indexname like 'mkt_%trello_uniq') as indices
  from information_schema.columns
 where table_schema = 'public' and column_name = 'trello_id' and table_name like 'mkt_%';
