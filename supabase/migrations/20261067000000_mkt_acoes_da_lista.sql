-- =====================================================================
-- Quadros do Marketing: AÇÕES DA LISTA (mapeamento Trello × sistema,
-- prioridade MÉDIA): mover lista para outro quadro, mover todos os cartões,
-- e SEGUIR lista. Copiar, ordenar e arquivar todos não precisam de banco
-- novo (a tela usa o que já existe).
--
-- ⚠️ As duas RPCs de mover passam pela `mkt_cartao_mover` (20261066) cartão
-- a cartão, em vez de repetir a regra: é ela que remapeia etiqueta (nome +
-- cor, criada no destino se faltar) e campo (nome + tipo, sem par sai).
-- Uma segunda cópia dessa regra divergiria da primeira, e divergir aqui
-- é cartão chegando com etiqueta que a tela do destino não pinta, calado.
-- ⚠️ Atômicas: ou a lista chega inteira, ou nada sai do lugar.
--
-- ⚠️ SEGUIR LISTA avisa quando um cartão ENTRA nela (criado ali ou movido
-- para ela) — que é o que o Trello faz. Mesmo OPT-IN do seguir cartão, mesma
-- função de aviso, mesmo "nunca derruba a gravação".
-- =====================================================================

-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 0 — medir (só lê)                                           ║
-- ╚═══════════════════════════════════════════════════════════════════╝
-- ESPERADO: mover_cartao = true · ja_existe = false
select
  to_regprocedure('public.mkt_cartao_mover(uuid,uuid,double precision)') is not null as mover_cartao,
  to_regclass('public.mkt_lista_seguidores') is not null as ja_existe;

-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — mover lista e mover todos os cartões                    ║
-- ╚═══════════════════════════════════════════════════════════════════╝
create or replace function public.mkt_lista_mover(p_list uuid, p_board uuid, p_position double precision)
returns void language plpgsql security invoker set search_path = public as $$
declare v_origem uuid; c record;
begin
  if not public.carbo_e_time_interno() then raise exception 'Sem permissão'; end if;
  select board_id into v_origem from public.mkt_lists where id = p_list;
  if v_origem is null then raise exception 'Lista não existe'; end if;
  if not exists (select 1 from public.mkt_boards where id = p_board) then raise exception 'Quadro de destino não existe'; end if;

  update public.mkt_lists set board_id = p_board, position = p_position where id = p_list;
  if p_board <> v_origem then
    -- TODOS os cartões, arquivados inclusive: arquivado continua sendo da
    -- lista, e ficaria órfão no quadro antigo apontando para lista de outro.
    for c in select id, position from public.mkt_cards where list_id = p_list loop
      perform public.mkt_cartao_mover(c.id, p_list, c.position);
    end loop;
  end if;
end $$;
revoke execute on function public.mkt_lista_mover(uuid, uuid, double precision) from public, anon;
grant execute on function public.mkt_lista_mover(uuid, uuid, double precision) to authenticated;

-- Os cartões ATIVOS de uma lista para o FIM de outra, na mesma ordem.
-- Arquivado fica: no Trello também — ele não está "na lista" para quem olha.
create or replace function public.mkt_lista_mover_cartoes(p_de uuid, p_para uuid)
returns integer language plpgsql security invoker set search_path = public as $$
declare v_base double precision; v_n integer := 0; c record;
begin
  if not public.carbo_e_time_interno() then raise exception 'Sem permissão'; end if;
  if p_de = p_para then return 0; end if;
  if not exists (select 1 from public.mkt_lists where id = p_para) then raise exception 'Lista de destino não existe'; end if;
  select coalesce(max(position), 0) into v_base from public.mkt_cards where list_id = p_para and not is_archived;
  for c in select id from public.mkt_cards where list_id = p_de and not is_archived order by position, created_at loop
    v_n := v_n + 1;
    perform public.mkt_cartao_mover(c.id, p_para, v_base + v_n * 1024);
  end loop;
  return v_n;
end $$;
revoke execute on function public.mkt_lista_mover_cartoes(uuid, uuid) from public, anon;
grant execute on function public.mkt_lista_mover_cartoes(uuid, uuid) to authenticated;

-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — seguir lista                                             ║
-- ╚═══════════════════════════════════════════════════════════════════╝
create table if not exists public.mkt_lista_seguidores (
  list_id    uuid not null references public.mkt_lists(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (list_id, user_id)
);
alter table public.mkt_lista_seguidores enable row level security;
drop policy if exists mkt_lista_seguidores_meu on public.mkt_lista_seguidores;
create policy mkt_lista_seguidores_meu on public.mkt_lista_seguidores
  for all to authenticated
  using (user_id = auth.uid() and public.carbo_e_time_interno())
  with check (user_id = auth.uid() and public.carbo_e_time_interno());

create or replace function public.trg_mkt_lista_seguidores()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_lista text; v_quem text;
begin
  if new.is_archived or new.mirror_of is not null then return null; end if;
  if tg_op = 'UPDATE' and new.list_id is not distinct from old.list_id then return null; end if;
  select title into v_lista from public.mkt_lists where id = new.list_id;
  select coalesce(split_part(full_name, ' ', 1), 'Alguém') into v_quem from public.profiles where id = auth.uid();
  insert into public.notifications (user_id, type, title, body, reference_type, reference_id, is_read)
  select s.user_id, 'mkt_seguindo',
         left('"' || left(new.title, 80) || '" entrou em ' || coalesce(v_lista, 'uma lista'), 200),
         left(case when tg_op = 'INSERT' then 'Criado' else 'Movido' end || coalesce(' por ' || v_quem, ''), 200),
         'mkt_card', new.id, false
    from public.mkt_lista_seguidores s
    join public.profiles p on p.id = s.user_id
   where s.list_id = new.list_id
     and s.user_id is distinct from auth.uid()
     and public.carbo_interface_e_interna(p.allowed_interfaces);
  return null;
exception when others then
  return null;  -- o aviso nunca derruba o trabalho
end $$;

drop trigger if exists trg_mkt_lista_seguidores on public.mkt_cards;
create trigger trg_mkt_lista_seguidores
  after insert or update of list_id on public.mkt_cards
  for each row execute function public.trg_mkt_lista_seguidores();

-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ CONFERÊNCIA                                                        ║
-- ╚═══════════════════════════════════════════════════════════════════╝
-- ESPERADO: mover_lista = true · mover_cartoes = true · tabela = true · gatilho = 1
select
  to_regprocedure('public.mkt_lista_mover(uuid,uuid,double precision)') is not null as mover_lista,
  to_regprocedure('public.mkt_lista_mover_cartoes(uuid,uuid)') is not null as mover_cartoes,
  to_regclass('public.mkt_lista_seguidores') is not null as tabela,
  (select count(*) from pg_trigger where tgname = 'trg_mkt_lista_seguidores') as gatilho;
