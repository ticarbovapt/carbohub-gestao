-- ─────────────────────────────────────────────────────────────────────────────
-- A caixa de entrada do atendimento — status, responsável e tags
--
-- A tela de Conversas já mostra tudo o que o cliente disse. O que falta é o que
-- o TIME sabe sobre aquela conversa: em que pé ela está, quem está cuidando e
-- do que ela trata. Hoje isso vive na cabeça de quem atendeu — e some quando
-- essa pessoa sai para almoçar.
--
-- ⚠️ Nada disto é decoração de tela. Status, responsável e tag PRECISAM morar no
-- banco: se ficassem no navegador, duas pessoas atendendo veriam filas
-- diferentes e o filtro não filtraria nada. É a mesma razão que pôs a marca de
-- resolvida no banco, e não num estado do React.
--
-- ── A decisão central: intenção no banco, estado EFETIVO calculado ──────────
--
-- `status` guarda o que a pessoa DECIDIU ("estou cuidando", "esperando o
-- cliente", "resolvido"). Mas mensagem nova do cliente depois dessa decisão
-- reabre a conversa — e essa parte NÃO é gravada: é calculada comparando
-- `desde` com a última mensagem de entrada.
--
-- Guardar "reaberto" como estado exigiria alguém (ou algum gatilho) escrever a
-- cada mensagem que chega, e qualquer falha nesse caminho esconderia uma
-- pergunta do cliente atrás de um "resolvido" velho. É exatamente por isso que
-- `carbo_wa_resolvidas` guardou uma DATA e não um booleano — esta tabela é a
-- continuação dessa ideia, agora com quatro estados em vez de dois.
-- ─────────────────────────────────────────────────────────────────────────────

-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — o estado do atendimento                                     ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

create table if not exists public.carbo_wa_atendimento (
  wa_id            text primary key,
  -- ⚠️ Quatro, e cada um responde uma pergunta diferente de quem olha a fila:
  --   aberto          ninguém pegou — é o trabalho a fazer
  --   em_atendimento  alguém está cuidando AGORA (tem responsável)
  --   aguardando      a bola está com o cliente, ou com outro setor
  --   resolvido       encerrado até o cliente escrever de novo
  status           text not null default 'aberto'
                   check (status in ('aberto','em_atendimento','aguardando','resolvido')),
  -- Quando a decisão foi tomada. É com ISTO que a mensagem nova do cliente é
  -- comparada para reabrir a conversa.
  desde            timestamptz not null default now(),
  responsavel      uuid references auth.users(id),
  -- Congelado, como no recado interno: quem atendeu continua sendo quem
  -- atendeu depois de sair da empresa ou ter o perfil desativado.
  responsavel_nome text,
  atualizado_em    timestamptz not null default now(),
  atualizado_por   uuid references auth.users(id)
);

comment on table public.carbo_wa_atendimento is
  'O estado de trabalho de cada conversa: status, desde quando e de quem é. ⚠️ Guarda a INTENÇÃO; o estado efetivo é calculado — mensagem do cliente depois de `desde` reabre a conversa sozinha, sem ninguém escrever nada.';

comment on column public.carbo_wa_atendimento.desde is
  'Quando o status foi definido. Mensagem de entrada posterior a isto reabre a conversa (regra do front, em lib/conversas.ts) — por isso é timestamp, nunca booleano.';

create index if not exists carbo_wa_atendimento_status
  on public.carbo_wa_atendimento (status, atualizado_em desc);
create index if not exists carbo_wa_atendimento_responsavel
  on public.carbo_wa_atendimento (responsavel) where responsavel is not null;

-- ⚠️ O histórico da marca de resolvida ENTRA aqui, em vez de virar uma segunda
-- verdade sobre a mesma conversa. `carbo_wa_resolvidas` fica no banco (não se
-- apaga registro), mas quem manda a partir de agora é esta tabela.
insert into public.carbo_wa_atendimento (wa_id, status, desde, atualizado_em, atualizado_por)
select r.wa_id, 'resolvido', r.resolvido_ate, coalesce(r.em, r.resolvido_ate), r.por
from public.carbo_wa_resolvidas r
on conflict (wa_id) do nothing;

comment on table public.carbo_wa_resolvidas is
  'SUPERADA pela carbo_wa_atendimento (status = resolvido). Mantida pelo histórico; não escreva mais aqui.';

-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — as tags                                                     ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
--
-- ⚠️ Tabela, não enum e não texto livre por conversa.
--
-- Texto livre vira "orçamento", "Orçamento" e "orcamento" na mesma semana, e o
-- filtro passa a mentir. Enum exigiria migração para cada tag nova, o que na
-- prática significa que ninguém cria tag. Tabela é o meio-termo que já
-- usamos em `rtm_motivos` e `rtm_checklist_itens`: nome novo entra com INSERT,
-- sem deploy, e desativar é melhor que apagar — conversa antiga aponta para a
-- linha.

create table if not exists public.carbo_wa_tags (
  id         uuid primary key default gen_random_uuid(),
  nome       text not null,
  -- Cor da paleta da tela, não hexadecimal livre: hexadecimal solto produz
  -- etiqueta ilegível no tema escuro, e ninguém percebe até alguém reclamar.
  cor        text not null default 'cinza'
             check (cor in ('cinza','verde','azul','ambar','vermelho','roxo')),
  ativo      boolean not null default true,
  criado_em  timestamptz not null default now(),
  criado_por uuid references auth.users(id)
);

-- Sem duas tags com o mesmo nome, ignorando caixa e espaço nas pontas.
create unique index if not exists carbo_wa_tags_nome
  on public.carbo_wa_tags (lower(btrim(nome)));

comment on table public.carbo_wa_tags is
  'Etiquetas de atendimento. Desative (ativo = false), nunca apague: conversa antiga aponta para a linha e perderia o rótulo.';

create table if not exists public.carbo_wa_conversa_tag (
  wa_id     text not null,
  tag_id    uuid not null references public.carbo_wa_tags(id) on delete cascade,
  criado_em timestamptz not null default now(),
  por       uuid references auth.users(id),
  primary key (wa_id, tag_id)
);

create index if not exists carbo_wa_conversa_tag_tag
  on public.carbo_wa_conversa_tag (tag_id);

-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 3 — quem lê e quem escreve                                      ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
--
-- ⚠️ `carbo_e_time_interno()`, a MESMA função das mensagens e do recado. O
-- portal de lojas e o de licenciados usam a tabela `profiles`; lista de
-- interfaces que diverge aqui ABRE acesso em vez de fechar.

alter table public.carbo_wa_atendimento  enable row level security;
alter table public.carbo_wa_tags         enable row level security;
alter table public.carbo_wa_conversa_tag enable row level security;

do $$
declare t text;
begin
  foreach t in array array['carbo_wa_atendimento','carbo_wa_tags','carbo_wa_conversa_tag'] loop
    execute format('drop policy if exists %I_le on public.%I', t, t);
    execute format($f$create policy %I_le on public.%I
                     for select to authenticated using (public.carbo_e_time_interno())$f$, t, t);

    execute format('drop policy if exists %I_escreve on public.%I', t, t);
    execute format($f$create policy %I_escreve on public.%I
                     for insert to authenticated with check (public.carbo_e_time_interno())$f$, t, t);

    execute format('drop policy if exists %I_muda on public.%I', t, t);
    execute format($f$create policy %I_muda on public.%I
                     for update to authenticated using (public.carbo_e_time_interno())
                     with check (public.carbo_e_time_interno())$f$, t, t);
  end loop;
end $$;

-- ⚠️ DELETE só no vínculo conversa↔tag: tirar uma etiqueta errada é operação
-- normal do dia. Atendimento e tag em si não se apagam — status vira outro
-- status, tag vira `ativo = false`.
drop policy if exists carbo_wa_conversa_tag_tira on public.carbo_wa_conversa_tag;
create policy carbo_wa_conversa_tag_tira on public.carbo_wa_conversa_tag
  for delete to authenticated using (public.carbo_e_time_interno());

-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 4 — ao vivo                                                     ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
--
-- Duas pessoas na mesma fila é o caso normal. Sem isto, a segunda pega uma
-- conversa que a primeira já assumiu 20 s atrás.

do $$
declare t text;
begin
  foreach t in array array['carbo_wa_atendimento','carbo_wa_tags','carbo_wa_conversa_tag'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

alter table public.carbo_wa_atendimento  replica identity full;
alter table public.carbo_wa_conversa_tag replica identity full;

-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 5 — quem pode ser responsável                                   ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
--
-- Reaproveita a mesma regra de "time interno" da view de notificáveis: quem
-- aparece para ser escolhido é quem poderia atender. Lojista e licenciado não
-- entram na lista — eles compartilham a tabela `profiles`.

create or replace view public.carbo_wa_atendentes
with (security_invoker = true) as
select p.id as user_id, p.full_name, p.allowed_interfaces
from public.profiles p
where public.carbo_interface_e_interna(p.allowed_interfaces)
order by p.full_name nulls last;

comment on view public.carbo_wa_atendentes is
  'Quem pode ser responsável por uma conversa: só time interno, pela MESMA regra do notify_time_interno.';

grant select on public.carbo_wa_atendentes to authenticated;

-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 6 — conferência                                                 ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- (a) As três tabelas existem, com RLS e no Realtime.
select t.tablename,
       (select relrowsecurity from pg_class c where c.relname = t.tablename) as rls,
       exists (select 1 from pg_publication_tables p
               where p.pubname = 'supabase_realtime' and p.tablename = t.tablename) as no_realtime
from (values ('carbo_wa_atendimento'),('carbo_wa_tags'),('carbo_wa_conversa_tag')) t(tablename);

-- (b) O histórico da marca de resolvida atravessou.
select
  (select count(*) from public.carbo_wa_resolvidas)                          as resolvidas_antigas,
  (select count(*) from public.carbo_wa_atendimento where status='resolvido') as viraram_atendimento;

-- (c) A lista de quem pode atender — se vier vazia, o filtro de responsável
--     nasce inútil e é sinal de que `carbo_interface_e_interna` não casou.
select count(*) as atendentes from public.carbo_wa_atendentes;
