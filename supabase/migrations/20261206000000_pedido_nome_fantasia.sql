-- ═══════════════════════════════════════════════════════════════════════════
-- Pedido ganha NOME FANTASIA ao lado da razão social (27/11/2026)
--
-- Chamado do TI ("o nome fantasia fica como nome principal no pedido, tem que
-- ter o campo razão social e nome fantasia"). O pedido tinha UM nome só
-- (`customer_name`), e a busca do CNPJ no /vender o preenchia com o FANTASIA
-- quando a Receita trazia um. Esse campo é o que vai ao Bling como nome do
-- contato — o destinatário da NF —, ao tomador da NFS-e e ao PDV.
--
-- A partir daqui:
--   customer_name        = RAZÃO SOCIAL (CPF: o nome da pessoa). Vai na nota.
--   customer_trade_name  = NOME FANTASIA. Vai no campo "Fantasia" do contato
--                          no Bling e aparece nas telas ao lado da razão.
--
-- ⚠️ Nulo = não informado (pedido antigo, CPF, ou sem fantasia na Receita). A
-- tela mostra a razão social sozinha nesse caso — nunca inventa um fantasia.
-- ⚠️ `carbo_vendas_metrica` NÃO é republicada: ela expandiu `o.*` na criação e
-- coluna nova no fim da tabela não muda nada nela.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.carboze_orders
  add column if not exists customer_trade_name text;

comment on column public.carboze_orders.customer_trade_name is
  'Nome fantasia do cliente (20261206). customer_name é a razão social — é ela que vai na NF.';

-- ───────────────────────────────────────────────────────────────────────────
-- A busca de cliente do /vender (`carbo_clientes_busca`) passa a devolver o
-- FANTASIA mais recente do documento, e a achar o cliente por ele.
-- Troca no TEXTO VIVO (pg_get_functiondef), cada trecho exigindo UMA
-- ocorrência. ⚠️ Se algum não casar, NÃO aborta: avisa (WARNING) e deixa a
-- função como está — o autocomplete só não traz o fantasia. Abortar aqui
-- travaria as migrações seguintes por causa de um conforto de tela.
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists public.carbo_backup_funcoes (
  feito_em  timestamptz not null default now(),
  funcao    text not null,
  definicao text not null
);

do $$
declare
  v_def  text;
  v_novo text;
  v_n    int;
  v_trocas text[][] := array[
    -- 1) o fantasia do pedido
    array[$p$o\.customer_name(\s+)as nome,$p$,
          $r$o.customer_name\1as nome,
      o.customer_trade_name as fantasia,$r$],
    -- 2) o lead não tem fantasia (mesma posição na união)
    array[$p$(coalesce\(nullif\(btrim\(l\.legal_name\), ''\), l\.contact_name\),)$p$,
          $r$\1
      null::text,$r$],
    -- 3) acha também pelo fantasia
    array[$p$(or \(length\(v_texto\) >= 3 and nome ilike '%' \|\| v_texto \|\| '%'\))$p$,
          $r$\1
        or (length(v_texto) >= 3 and fantasia ilike '%' || v_texto || '%')$r$],
    -- 4) o mais recente não vazio, como os outros campos
    array[$p$(\(array_agg\(nome\s+order by quando desc\) filter \(where nome\s+is not null and btrim\(nome\) <> ''\)\)\[1\] as nome,)$p$,
          $r$\1
      (array_agg(fantasia order by quando desc) filter (where fantasia is not null and btrim(fantasia) <> ''))[1] as fantasia,$r$],
    -- 5) e sai na resposta
    array[$p$(\s)nome, email, telefone, ie, endereco, cidade, uf, cep,$p$,
          $r$\1nome, fantasia, email, telefone, ie, endereco, cidade, uf, cep,$r$]
  ];
  i int;
begin
  select pg_get_functiondef('public.carbo_clientes_busca(text, integer)'::regprocedure) into v_def;

  if v_def ~ 'customer_trade_name' then
    raise notice 'carbo_clientes_busca já traz o fantasia — nada a fazer.';
    return;
  end if;

  v_novo := v_def;
  for i in 1 .. array_length(v_trocas, 1) loop
    select count(*) into v_n from regexp_matches(v_novo, v_trocas[i][1], 'g');
    if v_n <> 1 then
      raise warning 'carbo_clientes_busca: o trecho % casou % vez(es) (esperado 1). Função NÃO alterada — o /vender segue sem o fantasia na busca.', i, v_n;
      return;
    end if;
    v_novo := regexp_replace(v_novo, v_trocas[i][1], v_trocas[i][2]);
  end loop;

  insert into public.carbo_backup_funcoes(funcao, definicao)
  values ('carbo_clientes_busca', v_def);
  execute v_novo;
end $$;
