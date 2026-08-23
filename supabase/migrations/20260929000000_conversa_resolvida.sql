-- ═══════════════════════════════════════════════════════════════════════════
-- Conversa resolvida — porque nem toda resposta é uma pergunta
--
-- ── O problema ───────────────────────────────────────────────────────────
--
-- A tela conta como "esperando resposta" TODA mensagem do cliente que veio
-- depois da nossa última. Só que metade delas é "Ok recebido", "Ok obrigado",
-- "blz" — o cliente encerrando a conversa, não abrindo uma.
--
-- Com 22 conversas e 2 pendências reais, a lista já mistura as duas coisas.
-- Com 200, a pendência de verdade se perde no meio dos agradecimentos, e a
-- janela de 24 h corre em cima justamente da que importava.
--
-- ── ⚠️ Por que a marcação é uma DATA, não um booleano ────────────────────
--
-- "Resolvida" não é um estado permanente da conversa: é um corte no tempo.
-- Resolver significa "tudo até aqui está tratado" — e a mensagem que o cliente
-- mandar depois disso reabre sozinha, sem ninguém precisar desmarcar.
--
-- Com booleano, alguém marcaria resolvido hoje e a pergunta de amanhã ficaria
-- escondida atrás da marca. É a mesma forma do corte que já existe para contar
-- o "aguardando" (a nossa última saída); agora são dois cortes, e vale o mais
-- recente.
--
-- ⚠️ RODE EM BLOCOS.
-- ═══════════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — a marca                                                     ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

create table if not exists public.carbo_wa_resolvidas (
  wa_id         text primary key,
  -- Tudo que chegou ATÉ aqui está tratado. Mensagem posterior reabre sozinha.
  resolvido_ate timestamptz not null,
  por           uuid,
  em            timestamptz not null default now()
);

comment on table public.carbo_wa_resolvidas is
  'Até quando a conversa está tratada. ⚠️ DATA e não booleano: resolver é um corte no tempo, e a mensagem que o cliente mandar depois reabre sozinha — com booleano a pergunta de amanhã ficaria escondida atrás da marca de hoje.';

alter table public.carbo_wa_resolvidas enable row level security;
drop policy if exists carbo_wa_resolvidas_leitura on public.carbo_wa_resolvidas;
drop policy if exists carbo_wa_resolvidas_escrita on public.carbo_wa_resolvidas;
drop policy if exists carbo_wa_resolvidas_service on public.carbo_wa_resolvidas;

-- Mesma guarda das conversas: conversa de cliente não é do portal de lojas.
create policy carbo_wa_resolvidas_leitura on public.carbo_wa_resolvidas
  for select to authenticated using (public.carbo_e_time_interno());
create policy carbo_wa_resolvidas_escrita on public.carbo_wa_resolvidas
  for all to authenticated
  using (public.carbo_e_time_interno())
  with check (public.carbo_e_time_interno());
create policy carbo_wa_resolvidas_service on public.carbo_wa_resolvidas
  for all to service_role using (true) with check (true);

grant select, insert, update, delete on public.carbo_wa_resolvidas to authenticated;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — a tela lê ao vivo                                           ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
--
-- Sem isto, marcar resolvida numa aba não some da lista na outra — duas
-- pessoas atendendo veriam filas diferentes, e a segunda responderia o que a
-- primeira já respondeu.

do $$
begin
  alter publication supabase_realtime add table public.carbo_wa_resolvidas;
exception when duplicate_object then null;
end $$;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 3 — conferência                                                 ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- (a) Nasce vazia: nenhuma conversa marcada, nada muda até alguém clicar.
select count(*) as conversas_resolvidas from public.carbo_wa_resolvidas;

-- (b) A tabela publica ao vivo?
select tablename from pg_publication_tables
where pubname = 'supabase_realtime' and tablename = 'carbo_wa_resolvidas';

-- (c) O tamanho do problema hoje: quantas conversas têm mensagem do cliente
--     depois da nossa última, e qual foi a última coisa que ele disse. É a
--     lista que a tela chama de "esperando" — e boa parte deve ser "ok".
with ultima as (
  select distinct on (wa_id) wa_id, direcao, texto, ocorrido_em
  from public.carbo_wa_conversas
  order by wa_id, ocorrido_em desc
)
select wa_id, left(coalesce(texto, '(arquivo)'), 60) as ultima_mensagem, ocorrido_em
from ultima where direcao = 'entrada'
order by ocorrido_em desc;
