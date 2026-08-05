-- ═══════════════════════════════════════════════════════════════════════════
-- Bling 2 → carboze_orders: a venda online entra no Comercial
--
-- ── A decisão que está sendo revertida ────────────────────────────────────
--
-- O `bling2-sync` foi escrito como ESPELHO PURO: "não escreve em NENHUMA
-- tabela fora de bling2_*  (…) Bling 2 é espelho, não fonte de faturamento".
-- Isso está no cabeçalho da própria função, e era a decisão certa enquanto o
-- Bling 2 era só um retrato.
--
-- Mudou o uso: a operação online passou a acontecer NA CONTA 2, e hoje R$ 38
-- mil de venda atendida não aparecem em tela nenhuma de Comercial — nem para
-- acompanhar, nem para dar follow-up no cliente. Decisão do dono do processo:
-- trazer para `carboze_orders` o que já foi faturado.
--
-- ── Por que SQL e não código na edge function ─────────────────────────────
--
-- A ponte do Bling 1 (`bridgeOrdersToCarbohub`) não chama a API do Bling: lê e
-- escreve no Supabase. Ou seja, ela nunca precisou ser código de edge function.
-- Aqui ela é uma função + cron: entra rodando esta migração, sem depender de
-- deploy — que é o que vinha travando as correções.
--
-- ── O critério de "faturado" ──────────────────────────────────────────────
--
-- `situacao_id = 9` (Atendido). Conferido contra o dado real: 167 pedidos em
-- situação 9 somando R$ 38.414,88 e 2 em situação 12 (Cancelado). Não existe
-- pedido em aberto nessa conta — o que entra, entra atendido.
--
-- ⚠️ NÃO tentamos casar NF ↔ pedido. No Bling 1 o casamento é pelo número do
-- pedido na observação da NF; aqui as 157 NFs têm observação VAZIA e o
-- `raw_data` não traz o pedido. Casar por valor + data seria heurística que
-- erra calada, e o número errado numa tela de faturamento é pior que a
-- ausência dele. Os campos de NF ficam nulos; quem quer a nota tem a tela de
-- integração do Bling 2, que já lista todas.
-- ═══════════════════════════════════════════════════════════════════════════


-- ── 1. `online` passa a ser um segmento válido ────────────────────────────
--
-- O CHECK aceitava só ('consumo','revenda'). Sem abrir 'online' aqui, cada
-- INSERT da ponte falharia — e falharia calado, dentro do cron.
-- O nome do constraint é gerado pelo Postgres, então é buscado em vez de
-- adivinhado.
do $$
declare c_nome text;
begin
  select con.conname into c_nome
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  where rel.relname = 'carboze_orders'
    and con.contype = 'c'
    and pg_get_constraintdef(con.oid) ilike '%segmento%';
  if c_nome is not null then
    execute format('alter table public.carboze_orders drop constraint %I', c_nome);
  end if;
end $$;

alter table public.carboze_orders
  add constraint carboze_orders_segmento_check
  check (segmento is null or segmento in ('consumo', 'revenda', 'online'));

comment on column public.carboze_orders.segmento is
  'Segmentação da venda: consumo = B2B, revenda = PDV, online = marketplace/loja própria (Bling 2). NULL = não classificado.';


-- ── 2. A ponte ────────────────────────────────────────────────────────────
create or replace function public.bling2_bridge_pedidos_faturados()
returns table (criados integer, cancelados integer)
language plpgsql security definer set search_path = public as $$
declare v_criados integer := 0; v_cancelados integer := 0;
begin
  -- ── 2a. Pedidos novos ───────────────────────────────────────────────────
  with novos as (
    select
      bo.bling_id,
      bo.numero,
      bo.data,
      bo.total, bo.total_produtos, bo.total_frete, bo.total_desconto,
      bo.contato_nome,
      bo.observacoes,
      bo.loja_id,
      bo.items,
      c.cpf_cnpj, c.ie, c.email,
      coalesce(c.telefone, c.celular)                  as fone,
      c.raw_data -> 'endereco' -> 'geral'              as end_geral,
      -- Canal: loja 0 é venda direta (balcão/manual) e não é online. Loja
      -- marcada como `ignorar` (teste) também fica de fora da classificação.
      case
        when bo.loja_id is not null and bo.loja_id <> 0
             and coalesce(l.ignorar, false) = false then 'online'
        else null   -- deixa os gatilhos de classificação decidirem
      end                                              as segmento
    from public.bling2_orders bo
    left join public.bling2_contacts c on c.bling_id = bo.contato_id
    left join public.bling2_lojas    l on l.bling_id = bo.loja_id
    where bo.situacao_id = 9                       -- Atendido = faturado
      and not exists (
        select 1 from public.carboze_orders o
        where o.external_ref = 'bling2-' || bo.bling_id
      )
  ), inseridos as (
    insert into public.carboze_orders (
      order_number, customer_name, cnpj, customer_ie, customer_email, customer_phone,
      delivery_address, delivery_neighborhood, delivery_city, delivery_state, delivery_zip,
      items, subtotal, shipping_cost, discount, total,
      status, fulfillment_stage, segmento, external_ref, notes, source_file,
      sale_date, created_at
    )
    select
      -- Namespace próprio: não consome a sequência V… das vendas nativas nem
      -- colide com os BLING-* da conta 1 (os dois Blings numeram do zero).
      'BLING2-' || coalesce(nullif(n.numero, ''), n.bling_id::text),
      coalesce(nullif(n.contato_nome, ''), 'Cliente Bling 2'),
      n.cpf_cnpj, n.ie, n.email, n.fone,
      -- Endereço do contato: "logradouro, numero".
      nullif(trim(concat_ws(', ',
        nullif(coalesce(n.end_geral ->> 'endereco', n.end_geral ->> 'logradouro'), ''),
        nullif(n.end_geral ->> 'numero', ''))), ''),
      nullif(n.end_geral ->> 'bairro', ''),
      nullif(coalesce(n.end_geral ->> 'municipio', n.end_geral ->> 'cidade'), ''),
      upper(left(coalesce(n.end_geral ->> 'uf', ''), 2)),
      nullif(regexp_replace(coalesce(n.end_geral ->> 'cep', ''), '\D', '', 'g'), ''),
      -- Itens no formato que as telas leem (mesmo shape da ponte do Bling 1).
      coalesce((
        select jsonb_agg(jsonb_build_object(
          'name',         coalesce(nullif(it ->> 'descricao', ''), it -> 'produto' ->> 'nome', 'Produto'),
          'product_code', coalesce(it ->> 'codigo', it -> 'produto' ->> 'codigo', ''),
          'quantity',     coalesce((it ->> 'quantidade')::numeric, 1),
          'unit_price',   coalesce((it ->> 'valor')::numeric, 0),
          'total',        coalesce((it ->> 'quantidade')::numeric, 1)
                          * coalesce((it ->> 'valor')::numeric, 0)
        ))
        from jsonb_array_elements(case when jsonb_typeof(n.items) = 'array'
                                       then n.items else '[]'::jsonb end) it
      ), '[]'::jsonb),
      coalesce(n.total_produtos, 0), coalesce(n.total_frete, 0), coalesce(n.total_desconto, 0),
      coalesce(n.total, 0),
      -- Situação 9 no Bling = Atendido. Mesmo de-para do mapBlingStatus.
      'delivered'::public.order_status,
      'entregue',
      n.segmento,
      'bling2-' || n.bling_id,
      nullif(n.observacoes, ''),
      'bling2_bridge',
      nullif(n.data, '')::date,
      coalesce(nullif(n.data, '')::date::timestamptz, now())
    from novos n
    returning 1
  )
  select count(*) into v_criados from inseridos;

  -- ── 2b. Cancelamento, só numa direção ───────────────────────────────────
  --
  -- Pedido cancelado no Bling 2 (situação 12) vira cancelado aqui. O contrário
  -- NÃO acontece: nada nesta função tira um pedido de 'cancelled'. É a mesma
  -- lição que custou caro no bling-sync, onde venda cancelada ressuscitava a
  -- cada rodada porque o status era reescrito sem guarda.
  with cancelados as (
    update public.carboze_orders o
    set status = 'cancelled', fulfillment_stage = 'cancelado', updated_at = now()
    from public.bling2_orders bo
    where o.external_ref = 'bling2-' || bo.bling_id
      and bo.situacao_id = 12
      and o.status <> 'cancelled'
    returning 1
  )
  select count(*) into v_cancelados from cancelados;

  return query select v_criados, v_cancelados;
end $$;

comment on function public.bling2_bridge_pedidos_faturados is
  'Traz para carboze_orders os pedidos ATENDIDOS (situacao 9) da segunda conta Bling, com cliente e canal. Idempotente: só insere o que ainda não tem external_ref bling2-*. Cancela numa direção só.';


-- ── 3. Cron ───────────────────────────────────────────────────────────────
--
-- :25 e :55 — dez minutos depois do `bling2-sync-incremental` (:15 e :45), para
-- a ponte ver o que acabou de chegar. Longe do :00, onde roda o job pesado de
-- NF do Bling 1.
do $$
declare j record;
begin
  for j in select jobid from cron.job where jobname = 'bling2-bridge' loop
    perform cron.unschedule(j.jobid);
  end loop;
end $$;

select cron.schedule(
  'bling2-bridge',
  '25,55 * * * *',
  $cmd$ select public.bling2_bridge_pedidos_faturados(); $cmd$
);


-- ═══════════════════════════════════════════════════════════════════════════
-- Conferência
-- ═══════════════════════════════════════════════════════════════════════════

-- (a) Roda a primeira carga agora e diz quantos entraram.
select * from public.bling2_bridge_pedidos_faturados();

-- (b) O que entrou, com canal e contato — é aqui que se vê se o follow-up
--     nasce utilizável ou vazio.
select order_number, customer_name, segmento, status,
       customer_phone, customer_email, delivery_city, delivery_state,
       total, sale_date
from public.carboze_orders
where source_file = 'bling2_bridge'
order by sale_date desc
limit 20;

-- (c) Cobertura de contato do que entrou.
select count(*)                                          as pedidos,
       count(*) filter (where customer_phone is not null) as com_telefone,
       count(*) filter (where customer_email is not null) as com_email,
       count(*) filter (where segmento = 'online')        as marcados_online,
       sum(total)                                         as valor
from public.carboze_orders
where source_file = 'bling2_bridge';

-- (d) Canais ainda sem nome — cada linha aqui é um canal que ninguém batizou.
select bling_id, nome, ignorar, primeiro_visto_em
from public.bling2_lojas
where nome is null or nome = ''
order by primeiro_visto_em;
