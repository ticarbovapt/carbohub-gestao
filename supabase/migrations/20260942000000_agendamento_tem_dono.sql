-- ═══════════════════════════════════════════════════════════════════════════
-- Quem agendou a visita — a coluna existia e ninguém escrevia nela
--
-- `rtm_visita_planejada.criado_por` nasceu com a fase 1 (migração 20260896,
-- linha 189) e nunca foi preenchida: o `usePlanejarVisita` insere seis campos e
-- ela não é um deles, a coluna não tinha `default`, e a view `rtm_agenda` não a
-- expunha. Resultado: todo agendamento do banco tem autor nulo, e não há de
-- onde recuperar — a informação nunca chegou a existir.
--
-- ⚠️ Isso importa porque "vendedor" e "quem agendou" NÃO são a mesma pessoa. O
-- gestor planeja a rota do time, e a tela já permite isso (o seletor de
-- vendedor no diálogo aparece para gestor). Sem o autor, uma visita que o
-- vendedor não reconhece não tem a quem perguntar — e a aderência dele é
-- cobrada em cima de um plano que ele não fez.
--
-- ── Por que o DEFAULT, e não um campo a mais no insert do front ────────────
--
-- Mesma lição do `/vender`: regra que mora na tela é regra que a próxima tela
-- esquece de copiar. Com `default auth.uid()` o autor é gravado por quem quer
-- que insira — a tela de hoje, o roteirizador da fase 3, um script de carga.
-- Esquecer passa a ser impossível em vez de silencioso.
--
-- ⚠️ NÃO é `not null`. A FK é `on delete set null`: quando um profile sai da
-- empresa a coluna zera, e um NOT NULL derrubaria a exclusão do usuário. Além
-- disso carga por migração roda sem `auth.uid()` e gravaria nulo legitimamente.
-- ═══════════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — o autor passa a ser gravado sozinho                         ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

alter table public.rtm_visita_planejada
  alter column criado_por set default auth.uid();

comment on column public.rtm_visita_planejada.criado_por is
  'Quem CRIOU o agendamento — não confundir com vendedor_id, que é quem vai visitar. Gestor planeja rota de terceiro. Preenchida por default auth.uid(): nenhum cliente precisa lembrar de mandar. Nula em carga por migração e quando o profile é excluído (FK on delete set null).';

-- ⚠️ Sem backfill, e de propósito. As linhas antigas têm autor DESCONHECIDO, não
-- "o vendedor". Chutar `criado_por = vendedor_id` produziria um dado que parece
-- registro e é palpite — a mesma doença do `vinculo_exato` nas conversas, onde
-- aproximação se passando por certeza faz alguém responder sobre o pedido
-- errado. Nulo é honesto: a tela mostra "—" e quem lê sabe que não sabe.


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — a view passa a mostrar o autor                              ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
--
-- ⚠️ As colunas novas vão no FIM, e as antigas ficam na ordem exata em que
-- estavam. `CREATE OR REPLACE VIEW` só sabe ACRESCENTAR: renomear, reordenar ou
-- remover coluna devolve 42P16 e a migração para no meio.
--
-- ⚠️ E a cláusula `with (security_invoker = true)` é REPETIDA. Republicar sem
-- ela APAGA as reloptions — foi assim que a `bling2_esteira` passou a rodar com
-- os privilégios do dono, ignorando RLS, com o grant intacto. Aqui o estrago
-- seria um vendedor lendo a agenda do time inteiro.

create or replace view public.rtm_agenda
with (security_invoker = true) as
select
  pl.id            as planejada_id,
  pl.data_prevista,
  pl.ordem,
  pl.status        as status_plano,
  pl.origem,
  pl.observacao,
  pl.cancelamento_motivo,
  pl.vendedor_id,
  prof.full_name   as vendedor_nome,
  p.id             as pdv_id,
  p.name           as pdv_nome,
  p.pdv_code,
  p.address_street as endereco,
  p.address_city   as cidade,
  p.address_state  as uf,
  p.contact_name,
  p.contact_phone,
  p.latitude       as pdv_lat,
  p.longitude      as pdv_lng,
  v.id             as visita_id,
  v.ts_checkin,
  v.ts_checkout,
  v.resultado,
  case
    when pl.status = 'cancelada'    then 'cancelada'
    when v.ts_checkout is not null  then 'concluida'
    when v.id is not null           then 'em_andamento'
    when pl.data_prevista < (now() at time zone 'America/Sao_Paulo')::date then 'nao_cumprida'
    else 'pendente'
  end as situacao,
  -- ── acrescentadas aqui, no fim ──────────────────────────────────────────
  pl.criado_por,
  autor.full_name  as criado_por_nome,
  pl.created_at    as agendado_em
from public.rtm_visita_planejada pl
join public.pdvs p        on p.id = pl.pdv_id
left join public.profiles prof  on prof.id = pl.vendedor_id
left join public.profiles autor on autor.id = pl.criado_por
left join lateral (
  select * from public.rtm_visitas x
   where x.visita_planejada_id = pl.id and x.ajuste_de_id is null
   order by x.ts_checkin desc limit 1
) v on true;

comment on view public.rtm_agenda is
  'Agenda do vendedor: o plano com o real ao lado. O dia é o de BRASÍLIA — comparar com a data UTC jogaria a visita das 21h para o dia seguinte. ⚠️ security_invoker = true — repita a cláusula em toda republicação.';


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 3 — conferência                                                 ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- (a) O default está no lugar. Tem de aparecer `auth.uid()`.
select column_name, column_default, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'rtm_visita_planejada'
  and column_name = 'criado_por';

-- (b) ⚠️ A view continua com security_invoker. Se vier nulo, a RLS da agenda
--     virou decoração e qualquer autenticado lê o plano do time inteiro.
select relname, reloptions from pg_class where relname = 'rtm_agenda';

-- (c) As colunas novas existem e estão no fim.
select ordinal_position, column_name
from information_schema.columns
where table_schema = 'public' and table_name = 'rtm_agenda'
order by ordinal_position;

-- (d) Quantos agendamentos têm autor. Antes desta migração: zero, e continua
--     zero para os antigos — o default só vale para os PRÓXIMOS inserts.
select count(*) as agendamentos,
       count(criado_por) as com_autor
from public.rtm_visita_planejada;
