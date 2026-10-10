-- =====================================================================
-- Quadros do Marketing: MEMBROS do quadro e COMPARTILHAR
-- (mapeamento Trello × sistema, prioridade MÉDIA, "Membros/permissões").
--
-- ⚠️ Membro do quadro é QUEM PARTICIPA, não QUEM PODE VER. Hoje todo o time
-- interno vê todos os quadros, e isto não muda isso: as fotos no cabeçalho, o
-- "Compartilhar" e o aviso de "você foi adicionado". Quadro PRIVADO (só os
-- membros veem) mexe na permissão de TODAS as tabelas do Marketing e fica
-- para depois de decidir — ver o BLOCO 0.
-- ⚠️ Papel `admin` | `membro`: só informa, não trava nada (a mesma razão).
-- ⚠️ Adicionar alguém AVISA no sininho (`mkt_quadro`), nunca quem adicionou a
-- si mesmo. O aviso nunca derruba a gravação.
-- =====================================================================

-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 0 — medir (só lê) — DUAS perguntas                           ║
-- ╚═══════════════════════════════════════════════════════════════════╝
-- (a) ESPERADO: ja_existe = false · quadros = o número de quadros ativos.
select
  to_regclass('public.mkt_board_membros') is not null as ja_existe,
  (select count(*) from public.mkt_boards where not is_archived) as quadros;

-- (b) A PERMISSÃO DE LEITURA DAS TABELAS DO MARKETING. Só lê. Uma linha por
-- policy. `qual = true` quer dizer que QUALQUER usuário logado lê aquela
-- tabela — inclusive lojista e licenciado (mesma `profiles`). A última coluna
-- conta quantos usuários de PORTAL existem e alcançariam isso.
select p.tablename, p.policyname, p.cmd, p.roles::text, p.qual,
       (select count(*) from public.profiles pr
         where not public.carbo_interface_e_interna(pr.allowed_interfaces)) as perfis_fora_do_time
from pg_policies p
where p.schemaname = 'public' and p.tablename like 'mkt\_%'
order by p.tablename, p.cmd;

-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — membros do quadro                                        ║
-- ╚═══════════════════════════════════════════════════════════════════╝
create table if not exists public.mkt_board_membros (
  board_id       uuid not null references public.mkt_boards(id) on delete cascade,
  user_id        uuid not null references public.profiles(id) on delete cascade,
  papel          text not null default 'membro' check (papel in ('admin','membro')),
  adicionado_por uuid references public.profiles(id) on delete set null,
  created_at     timestamptz not null default now(),
  primary key (board_id, user_id)
);
create index if not exists idx_mkt_board_membros_user on public.mkt_board_membros(user_id);
alter table public.mkt_board_membros enable row level security;
-- O quadro é aberto ao time interno; adicionar e tirar gente também.
drop policy if exists mkt_board_membros_time on public.mkt_board_membros;
create policy mkt_board_membros_time on public.mkt_board_membros
  for all to authenticated
  using (public.carbo_e_time_interno()) with check (public.carbo_e_time_interno());

-- Quem criou cada quadro nasce como admin dele (só onde há quem criou).
insert into public.mkt_board_membros (board_id, user_id, papel)
select b.id, b.created_by, 'admin'
  from public.mkt_boards b
 where b.created_by is not null
   and exists (select 1 from public.profiles p where p.id = b.created_by)
on conflict do nothing;

-- Quadro novo: quem criou entra como admin, sozinho.
create or replace function public.trg_mkt_board_criador_membro()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.created_by is not null then
    insert into public.mkt_board_membros (board_id, user_id, papel, adicionado_por)
    values (new.id, new.created_by, 'admin', new.created_by) on conflict do nothing;
  end if;
  return null;
exception when others then
  return null;
end $$;
drop trigger if exists trg_mkt_board_criador_membro on public.mkt_boards;
create trigger trg_mkt_board_criador_membro
  after insert on public.mkt_boards
  for each row execute function public.trg_mkt_board_criador_membro();

-- O aviso: "Fulano adicionou você ao quadro X".
create or replace function public.trg_mkt_board_membro_aviso()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_quadro text; v_quem text;
begin
  if new.user_id is not distinct from auth.uid() or auth.uid() is null then return null; end if;
  select title into v_quadro from public.mkt_boards where id = new.board_id;
  select coalesce(split_part(full_name, ' ', 1), 'Alguém') into v_quem from public.profiles where id = auth.uid();
  insert into public.notifications (user_id, type, title, body, reference_type, reference_id, is_read)
  select new.user_id, 'mkt_quadro',
         left(coalesce(v_quem, 'Alguém') || ' adicionou você ao quadro "' || coalesce(v_quadro, '') || '"', 200),
         'Quadros do Marketing', 'mkt_board', new.board_id, false
    from public.profiles p
   where p.id = new.user_id and public.carbo_interface_e_interna(p.allowed_interfaces);
  return null;
exception when others then
  return null;  -- o aviso nunca derruba o trabalho
end $$;
drop trigger if exists trg_mkt_board_membro_aviso on public.mkt_board_membros;
create trigger trg_mkt_board_membro_aviso
  after insert on public.mkt_board_membros
  for each row execute function public.trg_mkt_board_membro_aviso();

-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ CONFERÊNCIA                                                        ║
-- ╚═══════════════════════════════════════════════════════════════════╝
-- ESPERADO: tabela = true · membros = quantos quadros têm quem criou ·
-- gatilhos = 2
select
  to_regclass('public.mkt_board_membros') is not null as tabela,
  (select count(*) from public.mkt_board_membros) as membros,
  (select count(*) from pg_trigger where tgname in ('trg_mkt_board_criador_membro','trg_mkt_board_membro_aviso')) as gatilhos;
