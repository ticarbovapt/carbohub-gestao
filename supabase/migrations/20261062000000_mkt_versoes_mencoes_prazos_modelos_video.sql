-- ─────────────────────────────────────────────────────────────────────────────
-- Quadros do Marketing — cinco coisas pedidas pelo dono do processo (09/10/2026):
--
--   A. HISTÓRICO DE VERSÕES dos arquivos (v1, v2, v3…): substituir deixa de
--      apagar o arquivo anterior. Dá para ver, baixar, comparar e restaurar.
--   B. @MENÇÃO em comentário vira notificação no sininho do ecossistema.
--   C. AVISO DE PRAZO ("vence amanhã", "vence hoje", "atrasou") para quem é
--      membro do cartão — um cron por dia.
--   D. MODELOS DE CARTÃO por quadro ("Reels padrão" já nasce com checklist,
--      etiquetas e campos).
--   E. Estado da CONVERSÃO de vídeo para a web (.MOV do iPhone, HEVC, não toca
--      no Chrome). Quem converte é o GitHub Actions; aqui só mora o estado.
--
-- Rode em BLOCOS, na ordem. Nenhum bloco altera dado existente além de
-- acrescentar colunas com default.
-- ─────────────────────────────────────────────────────────────────────────────


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO A — versões dos arquivos                                        ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- ⚠️ O ANEXO continua sendo a identidade (o link copiado aponta para ele). A
-- versão ATUAL mora na própria linha do anexo; as ANTERIORES, aqui. Uma tabela
-- só com todas as versões obrigaria toda tela que lê anexo a escolher "a
-- última" — e a que esquecesse mostraria o arquivo velho.
alter table public.mkt_card_attachments
  add column if not exists versao int not null default 1;

create table if not exists public.mkt_anexo_versoes (
  id              uuid primary key default gen_random_uuid(),
  anexo_id        uuid not null references public.mkt_card_attachments(id) on delete cascade,
  versao          int  not null,
  name            text not null,
  storage_path    text not null,
  poster_path     text,
  web_path        text,
  mime_type       text,
  tamanho         bigint,
  criado_em       timestamptz,                 -- quando ESTA versão entrou
  criado_por      uuid references public.profiles(id),
  substituido_em  timestamptz not null default now(),
  substituido_por uuid references public.profiles(id),
  unique (anexo_id, versao)
);
create index if not exists idx_mkt_anexo_versoes_anexo on public.mkt_anexo_versoes(anexo_id);

alter table public.mkt_anexo_versoes enable row level security;
-- ⚠️ Mesma guarda do bucket: portal de lojas e de licenciados usam a MESMA profiles.
drop policy if exists mkt_anexo_versoes_time on public.mkt_anexo_versoes;
create policy mkt_anexo_versoes_time on public.mkt_anexo_versoes
  for all to authenticated
  using (public.carbo_e_time_interno()) with check (public.carbo_e_time_interno());


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO E — estado da conversão de vídeo (vem antes das funções)        ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- web_status:
--   null      ainda não olhado (o conversor pega)
--   nativo    o navegador já toca (H.264/VP9) — nada a fazer
--   pronto    convertido; web_path aponta a cópia MP4
--   falhou    3 tentativas sem sucesso; web_erro diz por quê
-- ⚠️ O ORIGINAL nunca é tocado: "Baixar" continua entregando o que o designer
-- subiu. A cópia web é só para ASSISTIR.
alter table public.mkt_card_attachments
  add column if not exists web_path       text,
  add column if not exists web_status     text,
  add column if not exists web_erro       text,
  add column if not exists web_tentativas int not null default 0;

alter table public.mkt_card_attachments drop constraint if exists mkt_card_attachments_web_status_check;
alter table public.mkt_card_attachments add constraint mkt_card_attachments_web_status_check
  check (web_status is null or web_status in ('nativo','pronto','falhou'));

create or replace function public.mkt_e_video(p_mime text, p_nome text)
returns boolean language sql immutable as $$
  select coalesce(p_mime, '') ilike 'video/%'
      or coalesce(p_nome, '') ~* '\.(mov|mp4|m4v|webm|avi|mkv|3gp)$';
$$;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO A2 — substituir e restaurar, ATÔMICOS                           ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- Substituir: o arquivo NOVO já está no bucket (o navegador sobe antes). Aqui,
-- numa transação só, a versão atual vira histórico e o anexo passa a apontar
-- para o novo. Fazer em dois passos pelo navegador deixaria, numa queda no
-- meio, o arquivo antigo sem linha nenhuma — no bucket e fora de qualquer tela.
create or replace function public.mkt_anexo_substituir(
  p_anexo uuid, p_nome text, p_storage_path text, p_mime text, p_tamanho bigint, p_poster text
) returns int language plpgsql security invoker set search_path = public as $$
declare a public.mkt_card_attachments; v_nova int;
begin
  if not public.carbo_e_time_interno() then raise exception 'Sem permissão'; end if;
  select * into a from public.mkt_card_attachments where id = p_anexo for update;
  if not found then raise exception 'Anexo não encontrado'; end if;
  if a.storage_path is null then raise exception 'Este anexo não é um arquivo do sistema'; end if;

  insert into public.mkt_anexo_versoes
    (anexo_id, versao, name, storage_path, poster_path, web_path, mime_type, tamanho, criado_em, criado_por, substituido_por)
  values
    (a.id, a.versao, a.name, a.storage_path, a.poster_path, a.web_path, a.mime_type, a.tamanho,
     coalesce(a.atualizado_em, a.created_at), coalesce(a.atualizado_por, a.created_by), auth.uid());

  v_nova := greatest(a.versao, coalesce((select max(versao) from public.mkt_anexo_versoes where anexo_id = a.id), 0)) + 1;

  update public.mkt_card_attachments set
    name = p_nome, storage_path = p_storage_path, external_url = 'storage://mkt-anexos/' || p_storage_path,
    mime_type = p_mime, tamanho = p_tamanho, poster_path = p_poster, kind = 'arquivo',
    atualizado_em = now(), atualizado_por = auth.uid(), versao = v_nova,
    web_path = null, web_status = null, web_erro = null, web_tentativas = 0
  where id = a.id;
  return v_nova;
end $$;

-- Restaurar: a versão escolhida volta a ser a atual, como versão NOVA (v4 =
-- conteúdo da v2). A atual vai para o histórico. A linha da versão restaurada
-- SAI do histórico — senão dois registros apontariam o MESMO objeto do bucket,
-- e excluir um deles apagaria o arquivo do outro.
create or replace function public.mkt_anexo_restaurar(p_versao uuid)
returns int language plpgsql security invoker set search_path = public as $$
declare v public.mkt_anexo_versoes; a public.mkt_card_attachments; v_nova int;
begin
  if not public.carbo_e_time_interno() then raise exception 'Sem permissão'; end if;
  select * into v from public.mkt_anexo_versoes where id = p_versao;
  if not found then raise exception 'Versão não encontrada'; end if;
  select * into a from public.mkt_card_attachments where id = v.anexo_id for update;

  insert into public.mkt_anexo_versoes
    (anexo_id, versao, name, storage_path, poster_path, web_path, mime_type, tamanho, criado_em, criado_por, substituido_por)
  values
    (a.id, a.versao, a.name, a.storage_path, a.poster_path, a.web_path, a.mime_type, a.tamanho,
     coalesce(a.atualizado_em, a.created_at), coalesce(a.atualizado_por, a.created_by), auth.uid());

  delete from public.mkt_anexo_versoes where id = v.id;
  v_nova := greatest(a.versao, coalesce((select max(versao) from public.mkt_anexo_versoes where anexo_id = a.id), 0)) + 1;

  update public.mkt_card_attachments set
    name = v.name, storage_path = v.storage_path, external_url = 'storage://mkt-anexos/' || v.storage_path,
    mime_type = v.mime_type, tamanho = v.tamanho, poster_path = v.poster_path,
    atualizado_em = now(), atualizado_por = auth.uid(), versao = v_nova,
    web_path = v.web_path,
    web_status = case when v.web_path is not null then 'pronto' end,
    web_erro = null, web_tentativas = 0
  where id = a.id;
  return v_nova;
end $$;

grant execute on function public.mkt_anexo_substituir(uuid, text, text, text, bigint, text) to authenticated;
grant execute on function public.mkt_anexo_restaurar(uuid) to authenticated;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO B — @menção vira notificação                                    ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- ⚠️ Avisa SÓ quem foi mencionado — nunca o time inteiro. O `notify_time_interno`
-- multiplica por 30; uma menção que tocasse em todos ensinaria a fechar o sino.
-- ⚠️ E só quem é TIME INTERNO: portal de lojas e licenciados usam a mesma
-- profiles, e mencionar um id de lá não pode entregar o título do cartão.
create or replace function public.mkt_notificar_mencao(p_card uuid, p_usuarios uuid[], p_trecho text)
returns int language plpgsql security definer set search_path = public as $$
declare v_titulo text; v_autor text; n int;
begin
  if not public.carbo_e_time_interno() then raise exception 'Sem permissão'; end if;
  select title into v_titulo from public.mkt_cards where id = p_card;
  if v_titulo is null then return 0; end if;
  select coalesce(split_part(full_name, ' ', 1), 'Alguém') into v_autor from public.profiles where id = auth.uid();

  insert into public.notifications (user_id, type, title, body, reference_type, reference_id, is_read)
  select p.id, 'mkt_mencao',
         coalesce(v_autor, 'Alguém') || ' mencionou você em "' || left(v_titulo, 80) || '"',
         left(coalesce(p_trecho, ''), 200), 'mkt_card', p_card, false
  from public.profiles p
  where p.id = any(p_usuarios)
    and p.id is distinct from auth.uid()
    and public.carbo_interface_e_interna(p.allowed_interfaces);
  get diagnostics n = row_count;
  return n;
end $$;

revoke execute on function public.mkt_notificar_mencao(uuid, uuid[], text) from public, anon;
grant execute on function public.mkt_notificar_mencao(uuid, uuid[], text) to authenticated;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO C — aviso de prazo                                              ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- A trava: (cartão, tipo, prazo) é único. Rodar duas vezes no mesmo dia não
-- avisa duas vezes; MUDAR o prazo gera aviso novo, que é o certo.
create table if not exists public.mkt_aviso_prazo (
  card_id   uuid not null references public.mkt_cards(id) on delete cascade,
  tipo      text not null check (tipo in ('amanha','hoje','atrasou')),
  due_date  timestamptz not null,
  avisado_em timestamptz not null default now(),
  primary key (card_id, tipo, due_date)
);
alter table public.mkt_aviso_prazo enable row level security;  -- sem policy: só a função escreve

-- Quem recebe: os MEMBROS do cartão. Sem membro, quem CRIOU — prazo que não
-- avisa ninguém é o que deixa o vídeo vencer calado.
-- ⚠️ "Atrasou" é só o de ONTEM (dia de Brasília): avisar todo atrasado todo dia
-- seria a doença do sininho com 70 itens.
-- ⚠️ Fora: concluído, arquivado, lista arquivada, quadro arquivado e ESPELHO
-- (o espelho repetiria o aviso do original).
create or replace function public.mkt_avisar_prazos()
returns int language plpgsql security definer set search_path = public as $$
declare hoje date := (now() at time zone 'America/Sao_Paulo')::date; n int;
begin
  with alvo as (
    select c.id, c.title, c.due_date, c.created_by, b.title as quadro,
           case (c.due_date at time zone 'America/Sao_Paulo')::date - hoje
             when 1 then 'amanha' when 0 then 'hoje' when -1 then 'atrasou' end as tipo
    from public.mkt_cards c
    join public.mkt_lists  l on l.id = c.list_id
    join public.mkt_boards b on b.id = c.board_id
    where c.due_date is not null and not c.is_complete and not c.is_archived
      and not l.is_archived and not b.is_archived and c.mirror_of is null
      and (c.due_date at time zone 'America/Sao_Paulo')::date - hoje between -1 and 1
  ), novos as (
    insert into public.mkt_aviso_prazo (card_id, tipo, due_date)
    select id, tipo, due_date from alvo
    on conflict do nothing
    returning card_id, tipo
  ), quem as (
    select a.*, m.user_id from alvo a join novos n on n.card_id = a.id and n.tipo = a.tipo
    join public.mkt_card_members m on m.card_id = a.id
    union
    select a.*, a.created_by from alvo a join novos n on n.card_id = a.id and n.tipo = a.tipo
    where a.created_by is not null
      and not exists (select 1 from public.mkt_card_members m where m.card_id = a.id)
  )
  insert into public.notifications (user_id, type, title, body, reference_type, reference_id, is_read)
  select q.user_id, 'mkt_prazo',
         case q.tipo when 'amanha'  then '"' || left(q.title, 80) || '" vence amanhã'
                     when 'hoje'    then '"' || left(q.title, 80) || '" vence hoje'
                     else                '"' || left(q.title, 80) || '" atrasou' end,
         q.quadro || ' · entrega ' ||
           to_char(q.due_date at time zone 'America/Sao_Paulo', 'DD/MM "às" HH24:MI'),
         'mkt_card', q.id, false
  from quem q
  join public.profiles p on p.id = q.user_id
  where public.carbo_interface_e_interna(p.allowed_interfaces);
  get diagnostics n = row_count;
  return n;
end $$;

revoke execute on function public.mkt_avisar_prazos() from public, anon, authenticated;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO D — modelos de cartão                                           ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- ⚠️ Modelo é do QUADRO: etiqueta e campo personalizado são do quadro, então
-- um modelo de outro quadro apontaria para ids que aqui não existem.
-- checklists: [{ "title": "...", "items": ["...", "..."] }]
-- campos:     [{ "field_id": "<uuid>", "value": <jsonb> }]
create table if not exists public.mkt_card_templates (
  id         uuid primary key default gen_random_uuid(),
  board_id   uuid not null references public.mkt_boards(id) on delete cascade,
  nome       text not null,
  titulo     text not null default '',
  descricao  text,
  cover      text,
  label_ids  uuid[] not null default '{}',
  checklists jsonb not null default '[]'::jsonb,
  campos     jsonb not null default '[]'::jsonb,
  criado_por uuid references public.profiles(id),
  criado_em  timestamptz not null default now()
);
create index if not exists idx_mkt_card_templates_board on public.mkt_card_templates(board_id);
alter table public.mkt_card_templates enable row level security;
drop policy if exists mkt_card_templates_time on public.mkt_card_templates;
create policy mkt_card_templates_time on public.mkt_card_templates
  for all to authenticated
  using (public.carbo_e_time_interno()) with check (public.carbo_e_time_interno());


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO F — excluir quadro: o que precisa sair do bucket                ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- A tela apaga os OBJETOS antes da linha (a cascata tira as linhas, nunca os
-- arquivos). E recusa quando outro quadro ESPELHA um cartão deste: a FK do
-- espelho é ON DELETE CASCADE, e excluir aqui sumiria com cartão de lá, calado.
create or replace function public.mkt_quadro_para_excluir(p_board uuid)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare v_arquivos text[]; v_espelhos int; v_cartoes int;
begin
  if not public.carbo_e_time_interno() then raise exception 'Sem permissão'; end if;
  select count(*) into v_cartoes from public.mkt_cards where board_id = p_board;
  select count(*) into v_espelhos
    from public.mkt_cards e join public.mkt_cards o on o.id = e.mirror_of
   where o.board_id = p_board and e.board_id <> p_board;
  select coalesce(array_agg(distinct p), '{}') into v_arquivos from (
    select unnest(array[a.storage_path, a.poster_path, a.web_path]) p
      from public.mkt_card_attachments a join public.mkt_cards c on c.id = a.card_id
     where c.board_id = p_board
    union all
    select unnest(array[v.storage_path, v.poster_path, v.web_path])
      from public.mkt_anexo_versoes v
      join public.mkt_card_attachments a on a.id = v.anexo_id
      join public.mkt_cards c on c.id = a.card_id
     where c.board_id = p_board
  ) x where p is not null;
  return jsonb_build_object('cartoes', v_cartoes, 'espelhos_fora', v_espelhos, 'arquivos', to_jsonb(v_arquivos));
end $$;
grant execute on function public.mkt_quadro_para_excluir(uuid) to authenticated;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO G — ligar o aviso de prazo (DEPOIS de medir quantos sairiam)    ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- 11:17 UTC = 08:17 em Brasília, antes do expediente. Minuto ímpar e fora da
-- grade cheia (ver "Cadência" no CLAUDE.md). SQL puro: o `succeeded` do
-- pg_cron aqui SIGNIFICA que rodou — não há net.http_post no meio.
select cron.unschedule('mkt-avisar-prazos') where exists (select 1 from cron.job where jobname = 'mkt-avisar-prazos');
select cron.schedule('mkt-avisar-prazos', '17 11 * * *', $$select public.mkt_avisar_prazos()$$);
