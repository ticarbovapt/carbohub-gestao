-- ═══════════════════════════════════════════════════════════════════════════
-- Observações e comentários na requisição
--
-- ── O buraco ─────────────────────────────────────────────────────────────
--
-- A RC tinha UM campo de texto livre por etapa: `justification` (de quem
-- pede) e `rejection_reason` (de quem recusa). Faltava o meio — o que se
-- quer dizer ANTES de decidir: "pede cotação primeiro", "fecha com o
-- fornecedor X", "aprovo, mas só 10 mil deste lote".
--
-- Sem lugar para isso, a conversa acontecia no WhatsApp e a RC chegava na
-- aprovação sem o contexto que a explicava. O exemplo que motivou: RC de
-- 30.000 rótulos, R$ 0,00 estimado, SEM COTAÇÃO — aprovar ou não depende
-- inteiramente de uma conversa que o sistema não guardava.
--
-- ── Por que uma CONVERSA e não um campo ──────────────────────────────────
--
-- Um campo "observação do aprovador" guardaria só a última frase, do último
-- a falar, sem autor nem data. O que o fluxo pede é ida e volta: quem lançou
-- responde quem perguntou, e a decisão vem depois. Por isso são linhas, cada
-- uma com autor e instante.
--
-- ⚠️ IMUTÁVEL de propósito: só INSERT e SELECT, sem update e sem delete. Um
-- comentário que pode ser editado depois da decisão não serve para explicar
-- a decisão — e explicar a decisão é a única razão de ele existir.
--
-- ── A observação viaja JUNTO com a decisão ───────────────────────────────
--
-- `fin_rc_decidir` ganhou `p_observacao`. Não é capricho: aprovar e comentar
-- em duas chamadas deixaria a porta aberta para a aprovação gravar e o
-- comentário falhar — e aí a decisão fica no banco sem o porquê, que é
-- exatamente o estado que esta migração existe para impedir. Uma transação.
-- ═══════════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — a tabela                                                    ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

create table if not exists public.purchase_request_comments (
  id         uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.purchase_requests(id) on delete cascade,
  autor      uuid not null references public.profiles(id),
  texto      text not null check (btrim(texto) <> ''),
  -- Preenchido quando o comentário ACOMPANHOU a decisão. É o que distingue
  -- "comentei no meio do caminho" de "foi isto que eu disse ao aprovar".
  decisao    text check (decisao in ('aprovada', 'rejeitada')),
  criado_em  timestamptz not null default now()
);

create index if not exists purchase_request_comments_rc_idx
  on public.purchase_request_comments (request_id, criado_em);

comment on table public.purchase_request_comments is
  'Conversa de uma requisicao de compra: o que se diz ANTES de decidir. '
  'Imutavel (so insert/select) — comentario editavel depois da decisao nao '
  'explica a decisao. `decisao` marca o comentario que veio junto do aprovar/rejeitar.';

alter table public.purchase_request_comments enable row level security;

-- Mesma porta da `purchase_requests`: o time interno enxerga tudo.
drop policy if exists purchase_request_comments_le on public.purchase_request_comments;
create policy purchase_request_comments_le
  on public.purchase_request_comments
  for select to authenticated
  using ((select public.carbo_e_time_interno()));

-- ⚠️ Escreve em NOME PRÓPRIO. Sem o `autor = auth.uid()` daria para lançar
-- comentário assinado por outra pessoa — num registro cuja serventia é dizer
-- quem falou o quê.
drop policy if exists purchase_request_comments_escreve on public.purchase_request_comments;
create policy purchase_request_comments_escreve
  on public.purchase_request_comments
  for insert to authenticated
  with check ((select public.carbo_e_time_interno()) and autor = (select auth.uid()));


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — comentar sem decidir                                        ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

create or replace function public.fin_rc_comentar(p_id uuid, p_texto text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Sessão expirada. Entre de novo.'; end if;
  if nullif(btrim(coalesce(p_texto, '')), '') is null then
    raise exception 'Escreva alguma coisa antes de comentar.';
  end if;
  if not exists (select 1 from public.purchase_requests where id = p_id) then
    raise exception 'Requisição não encontrada.';
  end if;
  insert into public.purchase_request_comments (request_id, autor, texto)
  values (p_id, v_uid, btrim(p_texto));
end $fn$;

grant execute on function public.fin_rc_comentar(uuid, text) to authenticated;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 3 — a decisão passa a carregar a observação                     ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
--
-- ⚠️ DROP antes do CREATE. `create or replace` com um parâmetro a mais não
-- substitui: cria uma SEGUNDA função de mesmo nome, e o PostgREST passa a
-- recusar a chamada por não saber escolher entre as duas.
--
-- ⚠️ O parâmetro novo tem default. O navegador que ainda estiver com o pacote
-- antigo chama com três argumentos e continua funcionando — o deploy da tela
-- e o do banco não acontecem no mesmo segundo.

drop function if exists public.fin_rc_decidir(uuid, boolean, text);

create or replace function public.fin_rc_decidir(
  p_id uuid,
  p_aprovar boolean,
  p_motivo text default null,
  p_observacao text default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  r record;
  v_uid uuid := auth.uid();
  v_obs text := nullif(btrim(coalesce(p_observacao, '')), '');
begin
  perform public.fin_compras_exige_app();
  select * into r from public.purchase_requests where id = p_id for update;
  if not found then raise exception 'Requisição não encontrada.'; end if;
  if r.status::text <> 'aguardando_aprovacao' then
    raise exception 'A requisição % não está aguardando aprovação (está "%"). Recarregue.', r.rc_number, r.status;
  end if;
  if not p_aprovar and nullif(btrim(coalesce(p_motivo, '')), '') is null then
    raise exception 'Para rejeitar, diga o motivo.';
  end if;

  update public.purchase_requests
     set status = case when p_aprovar then 'aprovada' else 'rejeitada' end::purchase_request_status,
         rejection_reason = case when p_aprovar then null else btrim(p_motivo) end
   where id = p_id;

  -- ⚠️ DEPOIS do update, nunca antes: se o gatilho `fin_rc_guarda` recusar a
  -- decisão (alçada, autoaprovação, transição inválida), a transação inteira
  -- volta atrás e o comentário não fica — comentário de uma aprovação que não
  -- aconteceu seria pior que comentário nenhum.
  if v_obs is not null and v_uid is not null then
    insert into public.purchase_request_comments (request_id, autor, texto, decisao)
    values (p_id, v_uid, v_obs, case when p_aprovar then 'aprovada' else 'rejeitada' end);
  end if;
end $function$;

grant execute on function public.fin_rc_decidir(uuid, boolean, text, text) to authenticated;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 4 — conferência                                                 ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- Uma assinatura só de `fin_rc_decidir` — duas fariam o PostgREST recusar.
select p.oid::regprocedure::text as assinatura
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in ('fin_rc_decidir', 'fin_rc_comentar')
order by 1;

-- As políticas da tabela nova: uma de leitura, uma de escrita.
select policyname, cmd from pg_policies
where schemaname = 'public' and tablename = 'purchase_request_comments'
order by cmd;
