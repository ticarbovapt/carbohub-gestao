-- ═══════════════════════════════════════════════════════════════════════════
-- 20261108 — `carbo_teto_atingido`: a lista de toda leitura cortada em 1.000
--
-- O PostgREST corta toda resposta em 1.000 linhas e NÃO avisa. Esse corte já
-- custou meses do Dashboard Comercial, o Carbo Chat congelado, a busca de
-- Conversas vazia e a Esteira com "sem registro de envio" em aviso lido — e em
-- todas as vezes o defeito só apareceu quando alguém estranhou um número.
--
-- Desde esta migração os oito apps usam `fetchQueAcusaTeto`
-- (packages/shell/src/leitura.ts): toda leitura que volta com 1.000 linhas
-- SEM ter pedido limite é registrada aqui. É a lista de trabalho que se
-- preenche sozinha, com o app e a TELA onde aconteceu — e vazia quer dizer
-- "nenhuma tela foi cortada", não "ninguém olhou".
--
-- ⚠️ Os VALORES do filtro não vêm (podem ser telefone ou CPF): só os NOMES
-- das colunas filtradas e o `select`, que é o que localiza a consulta no
-- código.
-- ⚠️ Front antes do SQL não quebra nada: sem a função a chamada falha calada
-- e o aviso fica só no console.
-- ═══════════════════════════════════════════════════════════════════════════


-- (A) A tabela e a função. ESPERADO: "Success. No rows returned".
create table if not exists public.carbo_teto_atingido (
  id          bigint generated always as identity primary key,
  app         text        not null,
  recurso     text        not null,
  tela        text        not null default '',
  filtro      text        not null default '',
  select_cols text        not null default '',
  linhas      integer     not null,
  vezes       integer     not null default 1,
  pessoas     uuid[]      not null default '{}',
  primeira    timestamptz not null default now(),
  ultima      timestamptz not null default now(),
  unique (app, recurso, tela, filtro)
);

alter table public.carbo_teto_atingido enable row level security;

drop policy if exists carbo_teto_atingido_le on public.carbo_teto_atingido;
create policy carbo_teto_atingido_le on public.carbo_teto_atingido
  for select to authenticated using ((select public.carbo_e_time_interno()));
-- ⚠️ Sem policy de escrita: só a função grava.

create or replace function public.carbo_teto_registrar(
  p_app text, p_recurso text, p_tela text, p_filtro text, p_select text, p_linhas integer
) returns void
language plpgsql security definer set search_path = public as $$
begin
  -- Sessão de portal (lojista, licenciado) não escreve aqui.
  if not coalesce(public.carbo_e_time_interno(), false) then return; end if;

  insert into public.carbo_teto_atingido as t
    (app, recurso, tela, filtro, select_cols, linhas, pessoas)
  values (left(coalesce(p_app, '?'), 40), left(coalesce(p_recurso, '?'), 200),
          left(coalesce(p_tela, ''), 200), left(coalesce(p_filtro, ''), 300),
          left(coalesce(p_select, ''), 300), coalesce(p_linhas, 0),
          case when auth.uid() is null then '{}' else array[auth.uid()] end)
  on conflict (app, recurso, tela, filtro) do update
     set vezes       = t.vezes + 1,
         ultima      = now(),
         linhas      = greatest(t.linhas, excluded.linhas),
         select_cols = excluded.select_cols,
         -- até 20 pessoas: é para saber se é uma pessoa ou o time inteiro
         pessoas     = case when auth.uid() is null or auth.uid() = any(t.pessoas)
                              or cardinality(t.pessoas) >= 20
                            then t.pessoas else t.pessoas || auth.uid() end;
end;
$$;

revoke all on function public.carbo_teto_registrar(text, text, text, text, text, integer) from public, anon;
grant execute on function public.carbo_teto_registrar(text, text, text, text, text, integer) to authenticated;


-- (B) A LISTA DE TRABALHO — rode quando quiser, de tempos em tempos.
--     ESPERADO hoje: vazia logo depois do deploy, e enchendo conforme o time
--     usa as telas. Cada linha é uma tela que está mostrando número CORTADO.
select app, tela, recurso, filtro, vezes, cardinality(pessoas) as pessoas,
       to_char(ultima at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI') as ultima,
       left(select_cols, 80) as select_cols
from public.carbo_teto_atingido
order by ultima desc;
