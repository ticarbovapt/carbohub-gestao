-- ═══════════════════════════════════════════════════════════════════════════
-- 20261167 — O quadro de recuperação de carrinho aparecia VAZIO (17/11/2026)
--
-- Sintoma: Esteira do On-line → Recuperação de carrinho, tudo zerado (7 colunas,
-- "0 em perseguição", "0 sem telefone"), com a régua ENVIANDO (centenas de
-- mensagens por dia, entregues e lidas) e 1.720 carrinhos na view.
--
-- Causa, medida (`explain analyze` COMO O USUÁRIO LOGADO, não como dono):
--
--   select * from carbo_carrinho_pipeline order by … limit 1000   17.861 ms
--   limite de tempo da API para `authenticated`                    8.000 ms
--
-- A tela estourava o limite, recebia erro, e o hook devolvia lista vazia.
--
-- Por que só ali: com RLS, o Postgres só usa em índice uma condição que seja
-- LEAKPROOF; `lower`, `trim` e `regexp_replace` não são. Os dois índices por
-- expressão da 20261156 (e-mail e telefone da "mesma pessoa") só funcionam
-- para quem NÃO passa pela RLS — a edge function (service role) e o dono. A
-- 20261156 foi medida como dono e a fila ficou boa; a TELA nunca foi medida.
-- Sob RLS, cada subconsulta cai no índice de data e varre centenas de linhas:
-- 6 subplans × ~1.500 carrinhos.
-- Reproduzido num Postgres 16 local: 6 ms como dono, 726 ms sob RLS (mesmo plano
-- de produção, em escala menor). Uma view do dono por cima da view invoker NÃO
-- escapa da RLS (testado); função SECURITY DEFINER escapa: 10 ms.
--
-- A correção: a TELA lê por funções do dono, que se guardam no próprio corpo
-- (`carbo_e_time_interno()`), molde de `carbo_nf_filial_vincular`.
--   · carbo_carrinho_quadro(de, ate)  — o quadro, em páginas, jsonb
--   · carbo_msg_fila_contar()         — o "na fila" de Mensagens ao cliente, que
--                                       montava a fila inteira como o usuário
--
-- ⚠️ A view `carbo_carrinho_pipeline` NÃO foi tocada, nem a `carbo_msg_fila`:
-- são elas que decidem quem recebe WhatsApp. A função LÊ a view viva — a regra
-- do carrinho continua num lugar só, e quem editar a view muda a tela junto.
-- ⚠️ jsonb (`to_jsonb(linha)`), nunca `setof`: o teto de 1.000 do PostgREST
-- vale para RPC, e coluna nova na view não quebra o tipo de retorno.
-- ⚠️ Sem permissão ⇒ ERRO 42501, nunca lista vazia: a tela diz "sem permissão"
-- em vez de parecer "não há carrinho".
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.carbo_carrinho_quadro(
  p_de  int default 0,
  p_ate int default 999
) returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_de  int := greatest(coalesce(p_de, 0), 0);
  v_qtd int;
begin
  if not coalesce((select public.carbo_e_time_interno()), false) then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;

  -- Página de no máximo 1.000 linhas: cada página recalcula a view, e uma
  -- resposta sem teto vira corpo gigante quando o volume crescer.
  v_qtd := least(greatest(coalesce(p_ate, 999) - v_de + 1, 1), 1000);

  return coalesce((
    select jsonb_agg(to_jsonb(x))
      from (select *
              from public.carbo_carrinho_pipeline
             -- ⚠️ Ordem ESTÁVEL ao paginar: `checkout_id` desempata.
             order by abandonado_em desc, checkout_id asc
             limit v_qtd offset v_de) x
  ), '[]'::jsonb);
end;
$$;

create or replace function public.carbo_msg_fila_contar()
returns bigint
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v bigint;
begin
  if not coalesce((select public.carbo_e_time_interno()), false) then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  select count(*) into v from public.carbo_msg_fila;
  return v;
end;
$$;

-- ⚠️ Função nova nasce executável por `anon` (default privileges do Supabase):
-- revoke explícito, e só `authenticated` (a guarda do corpo faz o resto).
revoke all on function public.carbo_carrinho_quadro(int, int) from public, anon;
revoke all on function public.carbo_msg_fila_contar()         from public, anon;
grant execute on function public.carbo_carrinho_quadro(int, int) to authenticated;
grant execute on function public.carbo_msg_fila_contar()         to authenticated;

-- Conferência que ABORTA (sem ninguém para ler resultado): as duas existem,
-- NÃO estão abertas a `anon`, e a guarda recusa quem não é time interno
-- (aqui, sem usuário nenhum — o 42501 TEM de acontecer).
do $$
declare
  v_ok boolean;
begin
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'
         and p.proname in ('carbo_carrinho_quadro', 'carbo_msg_fila_contar')) <> 2 then
    raise exception 'as duas funções não foram criadas';
  end if;

  if has_function_privilege('anon', 'public.carbo_carrinho_quadro(int,int)', 'execute')
     or has_function_privilege('anon', 'public.carbo_msg_fila_contar()', 'execute') then
    raise exception 'ABORTADO: anon pode executar o quadro do carrinho';
  end if;

  v_ok := false;
  begin
    perform public.carbo_carrinho_quadro(0, 0);
  exception when sqlstate '42501' then
    v_ok := true;
  end;
  if not v_ok then
    raise exception 'ABORTADO: a guarda do quadro não recusou quem não é time interno';
  end if;

  -- A view que a função lê continua legível (como dono, que é como a função roda).
  perform 1 from public.carbo_carrinho_pipeline limit 1;
end
$$;

-- Conferir depois (SQL Editor, como o usuário): supabase/consultas/carrinho_raio_x.sql, BLOCO 10.
