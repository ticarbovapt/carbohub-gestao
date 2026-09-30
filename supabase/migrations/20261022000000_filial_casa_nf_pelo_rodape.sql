-- ═══════════════════════════════════════════════════════════════════════════
-- A NF da FILIAL passa a casar pelo RODAPÉ, como a da matriz
--
-- Pedido do dono do processo em 30/09/2026: *"os pedidos faturados na filial
-- estão indo com o rodapé correto nas NFs, mas não está vinculando
-- automático… precisam vincular automaticamente cruzando o número do pedido e
-- do vendedor com o sistema como já faz o Bling 1"*.
--
-- ── O que a medição desmentiu, e o que ela confirmou ──────────────────────
--
-- Medido no mesmo dia, antes de escrever qualquer regra:
--
--   pedidos conta 2          8      com external_ref 'bling2-%'   7
--   presos (sem NF há 1 h)   5      sem external_ref              0
--   notas da filial (60 d) 884      com informacoes_adicionais    0
--
-- ⚠️ **ZERO em 884.** O rodapé está no Bling — visível em "Informações
-- complementares" no painel —, e NUNCA chegou ao nosso banco. Casar por regex
-- sobre essa coluna não casaria nada, calado: a regra nasceria cega e o
-- sintoma seria idêntico ao de hoje.
--
-- A causa está no `bling2-sync`, e são três, encadeadas:
--
--   1. `detalharNfe` lia SÓ `d.informacoesAdicionais ?? d.observacoes`. O
--      `bling-sync` da matriz tem uma ESCADA de três degraus — campos diretos,
--      varredura profunda do JSON, e o XML — e o comentário de lá já explicava
--      por quê: *"o JSON do detalhe do Bling NEM SEMPRE traz esse texto (ou
--      traz com outro nome), mas o XML SEMPRE traz"*. A conta 2 tinha o
--      primeiro degrau e mais nada.
--
--   2. O detalhe era gravado em `raw_data`, e a LISTAGEM (que roda de minuto
--      em minuto) faz `raw_data: nf` no upsert — ela REGRAVA o detalhe por
--      cima com a linha magra da lista. Foi isso que apagou a prova: a NF
--      000986 tinha **627 bytes** de JSON guardado, que é o tamanho de uma
--      linha de listagem, não de um detalhe. Mesma família do
--      `trg_ecommerce_nao_apaga_com_vazio`: o upsert periódico regravando
--      vazio por cima de dado bom.
--
--   3. A fila do detalhe era `valor_total is null`. Nota já detalhada nunca
--      voltaria — então, mesmo com a escada consertada, o histórico inteiro
--      continuaria sem rodapé.
--
-- Os três estão corrigidos no `bling2-sync`. Esta migração dá ao banco as duas
-- colunas que faltam e ensina o casamento a usar o texto.
--
-- ⚠️ RODE EM BLOCOS.
-- ═══════════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 0 — MEDIR. Roda ANTES, e o número aqui é a referência.           ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- ESPERADO hoje: com_obs = 0. Depois do deploy + algumas rodadas, ele SOBE.
-- select
--   count(*)                                                   as notas,
--   count(*) filter (where informacoes_adicionais is not null) as com_obs,
--   count(*) filter (where informacoes_adicionais ~* 'V\d{10}') as com_codigo
-- from public.bling2_nfe
-- where data_emissao >= current_date - 60;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — as duas colunas                                             ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

set lock_timeout = '5s';

alter table public.bling2_nfe
  -- O detalhe, em coluna PRÓPRIA. `raw_data` continua sendo o que a LISTAGEM
  -- devolve, e é ela que roda a cada minuto.
  add column if not exists raw_detalhe jsonb,
  -- ⚠️ A natureza não é enfeite: é ELA que diz se a nota é a venda ou a
  -- remessa de bonificação. Ver o BLOCO 2.
  add column if not exists natureza_operacao text;

reset lock_timeout;

comment on column public.bling2_nfe.raw_detalhe is
  'O detalhe de /nfe/{id}. Coluna PROPRIA porque a listagem roda a cada minuto e faz upsert com raw_data: nf — ela regravaria o detalhe por cima com a linha magra da lista. Mesmo nome e motivo do bling2_orders.raw_detalhe.';

comment on column public.bling2_nfe.natureza_operacao is
  'A natureza de operacao da nota. E ela que separa venda de remessa de bonificacao no casamento — nunca o sufixo -BON, que o Bling substitui pelo texto fiscal da natureza (ver 20260996).';


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — o casamento ganha um SEGUNDO caminho                        ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- ⚠️ SEGUNDO, e não substituto. A ordem é a decisão inteira:
--
--   1º  ID EXATO   external_ref → bling2_orders → nf_bling_id → bling2_nfe
--   2º  TEXTO      o rodapé da NF → order_number
--
-- O id é determinístico e não depende de o Bling devolver texto NOSSO — e a
-- lição da `20260996` é exatamente essa: o Bling NÃO devolve a observação que
-- mandamos, ele a substitui pelo texto fiscal da natureza, com o número do
-- pedido reaparecendo no fim em formatos variados. Trocar a ordem seria
-- abandonar uma chave que não erra por uma que depende do terceiro.
--
-- O texto existe para o que o id não alcança: pedido cujo `external_ref` ficou
-- com prefixo errado, pedido digitado direto no painel da filial, e o
-- histórico anterior à ponte.
--
-- ⚠️ E ele NUNCA sobrescreve um vínculo que já existe (`bling2_nf_id is null`
-- na condição). Vínculo por texto derrubando vínculo por id seria trocar o
-- certo pelo provável.

create or replace function public.carbo_vincula_nf_filial()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  n int := 0;
begin
  -- ══ PASSO 1 — por ID EXATO (o caminho que já existia) ═══════════════════
  for r in
    select
      o.id                                                       as order_id,
      nullif(replace(o.external_ref, 'bling2-', ''), '')::bigint  as pedido_bling,
      o.bling2_pedido_bonificacao_id                             as pedido_bon,
      o.bling2_nf_id                                             as nf_atual
    from public.carboze_orders o
    where o.bling_conta = 2
      -- ⚠️ O filtro é o que impede o cast de estourar: existe pedido com
      -- `bling_conta = 2` e `external_ref` = 'bling-<id>' (prefixo da conta 1),
      -- medido em 30/09/2026. Ele é PULADO aqui de propósito — tratar um id da
      -- conta 1 como id da conta 2 ligaria a nota de OUTRA empresa ao pedido,
      -- que é o erro que o namespace `BLING2-` existe para impedir. Quem pega
      -- esse caso é o PASSO 2, pelo rodapé, ou o vínculo manual.
      and o.external_ref like 'bling2-%'
  loop
    declare
      v_nf record;
    begin
      select nf.bling_id, nf.chave_acesso, nf.numero, nf.situacao
        into v_nf
        from public.bling2_orders bo
        join public.bling2_nfe    nf on nf.bling_id = bo.nf_bling_id
       where bo.bling_id = r.pedido_bling
       limit 1;

      if found and public.bling2_nf_e_valida(v_nf.situacao) then
        if r.nf_atual is distinct from v_nf.bling_id then
          update public.carboze_orders
             set bling2_nf_id    = v_nf.bling_id,
                 nf2_access_key  = v_nf.chave_acesso,
                 invoice2_number = v_nf.numero,
                 updated_at      = now()
           where id = r.order_id;
          n := n + 1;
        end if;
      elsif r.nf_atual is not null then
        update public.carboze_orders
           set bling2_nf_id = null, nf2_access_key = null, invoice2_number = null,
               updated_at = now()
         where id = r.order_id;
        n := n + 1;
      end if;
    end;

    if r.pedido_bon is not null then
      declare
        v_bon record;
      begin
        select nf.bling_id, nf.chave_acesso, nf.numero, nf.situacao
          into v_bon
          from public.bling2_orders bo
          join public.bling2_nfe    nf on nf.bling_id = bo.nf_bling_id
         where bo.bling_id = r.pedido_bon
         limit 1;

        if found and public.bling2_nf_e_valida(v_bon.situacao) then
          update public.carboze_orders
             set bling2_nf_bonificacao_id    = v_bon.bling_id,
                 nf2_bonificacao_access_key  = v_bon.chave_acesso,
                 invoice2_bonificacao_number = v_bon.numero,
                 updated_at                  = now()
           where id = r.order_id
             and bling2_nf_bonificacao_id is distinct from v_bon.bling_id;
        end if;
      end;
    end if;
  end loop;

  -- ══ PASSO 2 — pelo RODAPÉ, e só para o que o id não resolveu ════════════
  --
  -- ⚠️ O regex é o MESMO da matriz (`matchNFesToOrders` no `bling-sync`), e de
  -- propósito: dois regexes para o mesmo formato é uma cópia de cadastro que
  -- diverge sem dar erro. `V\d{10}` é o formato nativo; `PED-\d{4}-\d{5}` é o
  -- legado, mantido porque nota antiga ainda o usa.
  --
  -- ⚠️ O VENDEDOR não é chave, é CONFERÊNCIA. Quem identifica é o
  -- `V2026090081`, que é único; o vendedor no rodapé serve para uma pessoa
  -- desconfiar de um casamento errado. Pôr o vendedor na chave quebraria o
  -- vínculo no dia em que alguém trocasse o responsável pela venda — e trocar
  -- responsável é operação normal.
  for r in
    select
      nf.bling_id, nf.chave_acesso, nf.numero, nf.situacao, nf.natureza_operacao,
      upper((regexp_match(nf.informacoes_adicionais, '(V[0-9]{10}|PED-[0-9]{4}-[0-9]{5})', 'i'))[1]) as cod
    from public.bling2_nfe nf
    where nf.informacoes_adicionais is not null
      and nf.informacoes_adicionais ~* '(V[0-9]{10}|PED-[0-9]{4}-[0-9]{5})'
  loop
    continue when r.cod is null;
    continue when not public.bling2_nf_e_valida(r.situacao);

    -- ⚠️ Quem decide em QUAL coluna a nota entra é a NATUREZA, nunca o texto.
    -- A venda com brinde gera DUAS notas e as duas carregam o mesmo
    -- `V2026090081` no rodapé — foi assim que, na matriz, a nota de
    -- bonificação de R$ 208,80 tomou o lugar da nota de venda de R$ 2.088,00 e
    -- o pedido CAIU do faturamento (`20260996`). Aqui a regra já nasce sabendo.
    if public.carbo_natureza_e_bonificacao(r.natureza_operacao) then
      update public.carboze_orders o
         set bling2_nf_bonificacao_id    = r.bling_id,
             nf2_bonificacao_access_key  = r.chave_acesso,
             invoice2_bonificacao_number = r.numero,
             updated_at                  = now()
       where o.order_number = r.cod
         and o.bling2_nf_bonificacao_id is null;
    else
      update public.carboze_orders o
         set bling2_nf_id    = r.bling_id,
             nf2_access_key  = r.chave_acesso,
             invoice2_number = r.numero,
             bling_conta     = 2,
             updated_at      = now()
       -- ⚠️ `bling2_nf_id is null`: o texto NUNCA sobrescreve o que o id já
       -- ligou. E `bling_conta = 2` é gravado junto porque é ele que faz a tela
       -- de Faturamento ler as colunas `*2_*` — sem isso o pedido ficaria com a
       -- nota vinculada e continuaria aparecendo como "Sem NF", que é o defeito
       -- mais confuso possível: resolvido no banco e errado na tela.
       where o.order_number = r.cod
         and o.bling2_nf_id is null
         and o.bling_nf_id is null;
    end if;

    if found then n := n + 1; end if;
  end loop;

  return n;
exception when others then
  -- ⚠️ Continua engolindo o erro de propósito (o cron não pode morrer por uma
  -- linha ruim), mas o `raise warning` é o ÚNICO rastro — e ninguém lê
  -- `cron.job_run_details`. Se os vínculos pararem de acontecer, o lugar de
  -- olhar é o log do Postgres, não o do cron.
  raise warning 'carbo_vincula_nf_filial falhou: %', sqlerrm;
  return n;
end;
$$;

revoke all on function public.carbo_vincula_nf_filial() from public, anon;

comment on function public.carbo_vincula_nf_filial is
  'Liga a NF da filial ao pedido. DOIS caminhos, nesta ordem: 1) id exato (external_ref -> bling2_orders -> bling2_nfe), 2) o RODAPE da nota (mesmo regex da matriz), so para o que o id nao resolveu e sem nunca sobrescrever. Quem separa venda de bonificacao e a NATUREZA, nunca o texto.';


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 3 — CONFERÊNCIA. Rode UMA DE CADA VEZ.                          ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- (a) ⚠️ RODE SÓ DEPOIS de o deploy do `bling2-sync` ter tido algumas rodadas.
--     Antes disso `informacoes_adicionais` continua vazia e o PASSO 2 não tem
--     o que casar — o resultado seria "não funcionou" quando na verdade é
--     "ainda não chegou".
-- select
--   count(*)                                                   as notas,
--   count(*) filter (where informacoes_adicionais is not null) as com_obs,
--   count(*) filter (where informacoes_adicionais ~* 'V[0-9]{10}') as com_codigo,
--   count(*) filter (where natureza_operacao is not null)      as com_natureza
-- from public.bling2_nfe
-- where data_emissao >= current_date - 60;

-- (b) Disparo manual. Devolve quantos vínculos mudaram nesta passada.
-- select public.carbo_vincula_nf_filial() as vinculos_alterados;

-- (c) Os pedidos da conta 2 e onde cada um está.
-- select o.order_number, o.created_at::date as criado, o.external_ref,
--        (o.external_ref not like 'bling2-%') as ref_com_prefixo_errado,
--        o.bling2_nf_id, o.invoice2_number,
--        o.bling2_nf_bonificacao_id, o.invoice2_bonificacao_number
-- from public.carboze_orders o
-- where o.bling_conta = 2
-- order by o.created_at desc;

-- (d) ⚠️ O casamento por texto achou o código e NÃO achou o pedido. Linha aqui
--     é trabalho de verdade: ou o número do rodapé está errado, ou o pedido foi
--     apagado. Lista que nunca esvazia é lista que ninguém abre — esta deve
--     ficar vazia.
-- select nf.numero, nf.data_emissao, nf.situacao,
--        upper((regexp_match(nf.informacoes_adicionais, '(V[0-9]{10})', 'i'))[1]) as cod
-- from public.bling2_nfe nf
-- where nf.informacoes_adicionais ~* 'V[0-9]{10}'
--   and not exists (
--     select 1 from public.carboze_orders o
--      where o.order_number = upper((regexp_match(nf.informacoes_adicionais, '(V[0-9]{10})', 'i'))[1])
--   )
-- order by nf.data_emissao desc;
