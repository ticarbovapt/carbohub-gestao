-- ─────────────────────────────────────────────────────────────────────────────
-- rtm_agenda_dia — a carga de cada dia, para o calendário
--
-- A agenda ganhou visão de MÊS. Agregar isso no navegador significaria baixar
-- ~42 dias de linhas completas (nome, endereço, coordenadas, contato) para
-- mostrar 42 numerais — num celular, em 3G, na estrada.
--
-- ⚠️ E ela é construída EM CIMA da `rtm_agenda`, nunca repetindo o CASE de
-- situação. Duas regras de situação vivas ao mesmo tempo é a doença do
-- `packages/posvenda`: etapa ausente na lista de um app fazia o pedido sumir do
-- quadro em vez de aparecer numa coluna vazia. Aqui seria o calendário dizendo
-- 6 e a lista mostrando 5, sem ninguém saber qual está certo.
-- ─────────────────────────────────────────────────────────────────────────────

-- ⚠️ `security_invoker = true` explícito. `CREATE OR REPLACE VIEW` sem a
-- cláusula APAGA as reloptions — foi assim que a `bling2_esteira` passou a
-- rodar com os privilégios do dono e a RLS foi ignorada. Aqui o estrago seria
-- um vendedor lendo a carga de trabalho do time inteiro.
create or replace view public.rtm_agenda_dia
with (security_invoker = true) as
select
  data_prevista,
  vendedor_id,
  max(vendedor_nome)                                as vendedor_nome,
  count(*)                                          as planejadas,
  count(*) filter (where situacao = 'pendente')     as pendentes,
  count(*) filter (where situacao = 'em_andamento') as em_andamento,
  count(*) filter (where situacao = 'concluida')    as concluidas,
  count(*) filter (where situacao = 'nao_cumprida') as nao_cumpridas,
  count(*) filter (where situacao = 'cancelada')    as canceladas
from public.rtm_agenda
group by data_prevista, vendedor_id;

-- ⚠️ Agrupa por VENDEDOR também, e não só por dia. Assim a mesma view serve o
-- vendedor (filtro por id) e o gestor (soma no cliente, poucas centenas de
-- linhas estreitas). Uma view já somada por dia perderia a visão por pessoa,
-- que é a próxima coisa que a gestão pede — e aí seriam duas views.
comment on view public.rtm_agenda_dia is
  'Contagem por dia e por vendedor, para o calendário da agenda. Construída sobre rtm_agenda: a regra de situação mora LÁ e não é repetida aqui. ⚠️ security_invoker = true — repita a cláusula em toda republicação.';

grant select on public.rtm_agenda_dia to authenticated;

-- ── Conferência ─────────────────────────────────────────────────────────────

-- (a) A view existe e mantém o security_invoker.
select relname, reloptions from pg_class where relname = 'rtm_agenda_dia';

-- (b) O total por dia bate com a `rtm_agenda`. Se divergir, alguém repetiu a
--     regra de situação em vez de reusar.
select
  (select count(*) from public.rtm_agenda)                  as linhas_na_agenda,
  (select coalesce(sum(planejadas), 0) from public.rtm_agenda_dia) as somadas_no_calendario;
