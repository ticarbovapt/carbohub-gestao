-- =====================================================================
-- Quadros do Marketing: SEGUIR cartão e MOVER cartão entre quadros.
--
-- Do mapeamento Trello × sistema de 09/10/2026 (prioridade ALTA, "Menu do
-- cartão"). Copiar, Copiar link e Ingressar não precisam de banco.
--
-- ⚠️ SEGUIR é OPT-IN e avisa SÓ quem segue. Membro NÃO segue sozinho (no
-- Trello segue): este quadro nunca avisou ninguém por comentário, e passar a
-- avisar todo membro de todo cartão de uma vez é a doença do sininho com 70
-- itens. Quem quer acompanhar clica em "Seguir".
-- ⚠️ Os gatilhos de aviso NUNCA derrubam a gravação: comentário e mudança de
-- lista são o trabalho; o aviso é extra (`exception when others`).
-- ⚠️ Quem fez a ação não é avisado da própria ação.
--
-- ⚠️ MOVER para OUTRO quadro: etiqueta e campo personalizado são do QUADRO.
-- Sem remapear, o cartão chegaria com etiquetas de um quadro que a tela do
-- destino não sabe pintar (some calado) e com valores de campos que não
-- existem lá. Etiqueta casa por nome + cor e é CRIADA no destino se faltar
-- (é o que o Trello faz); campo casa por nome + tipo e, sem par, o valor sai —
-- campo novo no destino por causa de um cartão seria lixo de cadastro.
-- =====================================================================

-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 0 — medir (só lê)                                           ║
-- ╚═══════════════════════════════════════════════════════════════════╝
-- ESPERADO: ja_existe = false · tipo_coluna = text · checks vazio (null)
select
  to_regclass('public.mkt_card_seguidores') is not null as ja_existe,
  (select data_type from information_schema.columns
    where table_schema = 'public' and table_name = 'notifications' and column_name = 'type') as tipo_coluna,
  (select string_agg(pg_get_constraintdef(c.oid), ' | ')
     from pg_constraint c where c.conrelid = 'public.notifications'::regclass and c.contype = 'c') as checks;

-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — seguidores                                               ║
-- ╚═══════════════════════════════════════════════════════════════════╝
create table if not exists public.mkt_card_seguidores (
  card_id    uuid not null references public.mkt_cards(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (card_id, user_id)
);
alter table public.mkt_card_seguidores enable row level security;
-- Cada um vê e mexe só no PRÓPRIO "seguir" — a lista de quem segue o quê não
-- é da conta dos outros, e ninguém segue um cartão em nome de outra pessoa.
drop policy if exists mkt_card_seguidores_meu on public.mkt_card_seguidores;
create policy mkt_card_seguidores_meu on public.mkt_card_seguidores
  for all to authenticated
  using (user_id = auth.uid() and public.carbo_e_time_interno())
  with check (user_id = auth.uid() and public.carbo_e_time_interno());

-- O aviso. Uma função só para os dois gatilhos: o texto do aviso muda, a
-- regra de quem recebe não.
create or replace function public.mkt_avisar_seguidores(p_card uuid, p_titulo text, p_corpo text)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.notifications (user_id, type, title, body, reference_type, reference_id, is_read)
  select s.user_id, 'mkt_seguindo', left(p_titulo, 200), left(coalesce(p_corpo, ''), 200), 'mkt_card', p_card, false
    from public.mkt_card_seguidores s
    join public.profiles p on p.id = s.user_id
   where s.card_id = p_card
     and s.user_id is distinct from auth.uid()
     and public.carbo_interface_e_interna(p.allowed_interfaces);
exception when others then
  null;  -- o aviso nunca derruba o trabalho
end $$;
revoke execute on function public.mkt_avisar_seguidores(uuid, text, text) from public, anon, authenticated;

create or replace function public.trg_mkt_seguidores_comentario()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_titulo text; v_autor text;
begin
  select title into v_titulo from public.mkt_cards where id = new.card_id;
  select coalesce(split_part(full_name, ' ', 1), 'Alguém') into v_autor from public.profiles where id = new.user_id;
  perform public.mkt_avisar_seguidores(new.card_id,
    coalesce(v_autor, 'Alguém') || ' comentou em "' || left(coalesce(v_titulo, ''), 80) || '"', new.body);
  return null;
exception when others then
  return null;
end $$;

drop trigger if exists trg_mkt_seguidores_comentario on public.mkt_comments;
create trigger trg_mkt_seguidores_comentario
  after insert on public.mkt_comments
  for each row execute function public.trg_mkt_seguidores_comentario();

create or replace function public.trg_mkt_seguidores_cartao()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_lista text; v_quem text;
begin
  select coalesce(split_part(full_name, ' ', 1), 'Alguém') into v_quem from public.profiles where id = auth.uid();
  if new.is_archived and not old.is_archived then
    perform public.mkt_avisar_seguidores(new.id,
      coalesce(v_quem, 'Alguém') || ' arquivou "' || left(new.title, 80) || '"', null);
  elsif new.list_id is distinct from old.list_id then
    select title into v_lista from public.mkt_lists where id = new.list_id;
    perform public.mkt_avisar_seguidores(new.id,
      '"' || left(new.title, 80) || '" foi para ' || coalesce(v_lista, 'outra lista'),
      case when v_quem is not null then 'Movido por ' || v_quem end);
  end if;
  return null;
exception when others then
  return null;
end $$;

drop trigger if exists trg_mkt_seguidores_cartao on public.mkt_cards;
create trigger trg_mkt_seguidores_cartao
  after update of list_id, is_archived on public.mkt_cards
  for each row execute function public.trg_mkt_seguidores_cartao();

-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — mover cartão (inclusive para OUTRO quadro)               ║
-- ╚═══════════════════════════════════════════════════════════════════╝
-- Atômica: ou o cartão chega inteiro (etiquetas e campos remapeados), ou não
-- sai do lugar. Em três chamadas do navegador, um erro no meio deixaria o
-- cartão no quadro novo com as etiquetas do antigo.
create or replace function public.mkt_cartao_mover(p_card uuid, p_list uuid, p_position double precision)
returns void language plpgsql security invoker set search_path = public as $$
declare
  v_origem uuid; v_destino uuid; v_mirror uuid;
begin
  if not public.carbo_e_time_interno() then raise exception 'Sem permissão'; end if;
  select board_id, mirror_of into v_origem, v_mirror from public.mkt_cards where id = p_card;
  if v_origem is null then raise exception 'Cartão não existe'; end if;
  select board_id into v_destino from public.mkt_lists where id = p_list;
  if v_destino is null then raise exception 'Lista de destino não existe'; end if;

  if v_destino <> v_origem and v_mirror is null then
    -- Etiquetas: casa por nome + cor; cria no destino o que faltar.
    insert into public.mkt_labels (board_id, name, color)
    select distinct v_destino, l.name, l.color
      from public.mkt_card_labels cl join public.mkt_labels l on l.id = cl.label_id
     where cl.card_id = p_card
       and not exists (select 1 from public.mkt_labels d
                        where d.board_id = v_destino and d.name = l.name and d.color = l.color);
    update public.mkt_card_labels cl
       set label_id = (select d.id from public.mkt_labels d join public.mkt_labels o on o.id = cl.label_id
                        where d.board_id = v_destino and d.name = o.name and d.color = o.color
                        order by d.created_at limit 1)
     where cl.card_id = p_card;

    -- Campos: casa por nome + tipo; sem par, o valor sai.
    delete from public.mkt_card_field_values v
     where v.card_id = p_card
       and not exists (select 1 from public.mkt_custom_fields o join public.mkt_custom_fields d
                         on d.board_id = v_destino and d.name = o.name and d.type = o.type
                        where o.id = v.field_id);
    update public.mkt_card_field_values v
       set field_id = (select d.id from public.mkt_custom_fields o join public.mkt_custom_fields d
                         on d.board_id = v_destino and d.name = o.name and d.type = o.type
                        where o.id = v.field_id order by d.position limit 1)
     where v.card_id = p_card;
  end if;

  update public.mkt_cards
     set board_id = v_destino, list_id = p_list, position = p_position
   where id = p_card;
end $$;
revoke execute on function public.mkt_cartao_mover(uuid, uuid, double precision) from public, anon;
grant execute on function public.mkt_cartao_mover(uuid, uuid, double precision) to authenticated;

-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ CONFERÊNCIA                                                        ║
-- ╚═══════════════════════════════════════════════════════════════════╝
-- ESPERADO: tabela = true · gatilhos = 2 · mover = true
select
  to_regclass('public.mkt_card_seguidores') is not null as tabela,
  (select count(*) from pg_trigger where tgname in ('trg_mkt_seguidores_comentario','trg_mkt_seguidores_cartao')) as gatilhos,
  to_regprocedure('public.mkt_cartao_mover(uuid,uuid,double precision)') is not null as mover;
