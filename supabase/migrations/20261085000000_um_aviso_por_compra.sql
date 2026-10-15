-- =====================================================================
-- UM AVISO POR COMPRA — o upsell não é venda nova (15/10/2026).
--
-- Pedido do dono do processo: "na esteira conta como uma coisa só, soma venda
-- + upsell, só que na notificação cai a venda e notifica, depois cai o upsell e
-- notifica… não pode parecer 2 vendas diferentes".
--
-- Causa: `trg_ecommerce_sale_notify` avisava por LINHA de `ecommerce_orders`.
-- Na PayT venda, upsell e order bump são TRANSAÇÕES separadas com o MESMO
-- carrinho — viram UM pedido no Bling, UMA nota e UM picking —, e cada
-- transação tocava "🛒 Nova venda" de novo. (Na Nuvemshop, pedido de dois
-- produtos fazia o mesmo: duas linhas, dois avisos.)
--
-- A regra nova: a COMPRA é a unidade do aviso, com a MESMA chave da Esteira.
--   PayT          o carrinho (`platform_order_number`)
--   demais        `ecommerce_pedido_raiz(platform, order_id)`
-- Primeira linha paga da compra → UM aviso, já com o total da compra.
-- Linha seguinte (upsell, bump, 2º item) → NÃO cria aviso: ATUALIZA o texto do
-- aviso existente com o total somado ("… · com upsell"). Sem segundo som, sem
-- segundo toast, sem segundo push — o sininho mostra uma compra com o valor
-- que a Esteira mostra.
--
-- ⚠️ `notifications.reference_id` é TEXTO, não uuid: todo join com
-- `ecommerce_orders.id` leva `::text`. Comparar uuid = text é erro 42883 — e
-- DENTRO do gatilho esse erro seria engolido pelo `exception when others`, e o
-- upsell simplesmente não atualizaria o aviso, calado.
--
-- `carbo_venda_avisada` é o LEDGER (chave da compra → a linha cujo id está no
-- `reference_id` do aviso). O PK é a trava: duas transações do mesmo carrinho
-- não conseguem as duas "ser a primeira".
--
-- ⚠️ Todo o resto do gatilho é o MESMO da 20260985 (canais, lista branca,
-- janela de 12 h, só na TRANSIÇÃO para venda, rótulos). O BLOCO 1 ABORTA se o
-- texto vivo não for aquele — alguém o mudou depois e eu não saberia o quê.
-- =====================================================================

-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 0 — compras de hoje que geraram MAIS de um aviso (leitura)   ║
-- ╚═══════════════════════════════════════════════════════════════════╝
-- ESPERADO: os carrinhos da PayT com upsell de hoje (78BZDWW e os outros),
-- avisos = 2 ou mais. É o defeito, medido antes de mexer.
select e.platform,
       coalesce(nullif(e.platform_order_number, ''), split_part(e.order_id, '-', 1)) as compra,
       count(distinct n.reference_id) as avisos,
       sum(distinct e.total)          as valor_aprox
  from public.notifications n
  join public.ecommerce_orders e on e.id::text = n.reference_id
 where n.type = 'ecommerce_sale' and n.reference_type = 'ecommerce_order'
   and n.created_at > now() - interval '24 hours'
 group by 1, 2
having count(distinct n.reference_id) > 1
 order by 1, 2;

-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — o ledger, a chave e o gatilho                            ║
-- ╚═══════════════════════════════════════════════════════════════════╝
do $guarda$
declare v_def text := pg_get_functiondef('public.trg_ecommerce_sale_notify()'::regprocedure);
begin
  if v_def not like '%ML-FULL%' or v_def not like '%12 hours%'
     or v_def not like '%ecommerce_status_e_venda(OLD.status)%' then
    raise exception 'trg_ecommerce_sale_notify NÃO é a da 20260985 — alguém mudou depois. Me mande pg_get_functiondef dela. Nada foi alterado.';
  end if;
end $guarda$;

create table if not exists public.carbo_venda_avisada (
  chave       text primary key,          -- 'payt:carrinho:78BZDWW', 'nuvemshop:1234'…
  ref_id      text not null,             -- o reference_id dos avisos (TEXTO em notifications)
  avisado_em  timestamptz not null default now()
);
alter table public.carbo_venda_avisada enable row level security;   -- sem policy: só o gatilho (dono)
revoke all on public.carbo_venda_avisada from anon, authenticated;
comment on table public.carbo_venda_avisada is
  'Uma linha por COMPRA já anunciada no sininho. O PK é a trava que faz upsell/bump/2º item ATUALIZAR o aviso da compra em vez de criar outro. Ver 20261085.';

-- Dinheiro em REAL, independente do locale do servidor: `to_char(…, 'FML…')`
-- saía "$119.60" no sininho (locale en do Supabase).
create or replace function public.carbo_brl(p numeric)
returns text language sql immutable set search_path = public as $$
  select 'R$ ' || translate(to_char(coalesce(p, 0), 'FM999,999,990.00'), ',.', '.,')
$$;

-- A chave da COMPRA — a mesma régua da Esteira (o carrinho, na PayT).
create or replace function public.carbo_venda_chave(p_platform text, p_order_id text, p_carrinho text)
returns text language sql stable set search_path = public as $$
  select p_platform || ':' ||
         case when p_platform = 'payt' and nullif(btrim(p_carrinho), '') is not null
              then 'carrinho:' || btrim(p_carrinho)
              else public.ecommerce_pedido_raiz(p_platform, p_order_id) end
$$;

create or replace function public.trg_ecommerce_sale_notify()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  plat_label text; plat_abbr text;
  v_chave text; v_raiz text; v_carrinho text;
  v_total numeric; v_qtd bigint; v_transacoes bigint; v_produtos text;
  v_corpo text; v_ref text;
begin
  if NEW.platform not in ('mercadolivre', 'mercadolivre_full', 'amazon',
                          'nuvemshop', 'shopee', 'payt') then
    return NEW;
  end if;

  if not public.ecommerce_status_e_venda(NEW.status) then return NEW; end if;

  if NEW.ordered_at < now() - interval '12 hours' then return NEW; end if;

  if TG_OP = 'UPDATE' and public.ecommerce_status_e_venda(OLD.status) then
    return NEW;
  end if;

  plat_label := case NEW.platform
    when 'mercadolivre'      then 'ML LogHouse'
    when 'mercadolivre_full' then 'ML Full'
    when 'amazon'            then 'Amazon'
    when 'nuvemshop'         then 'Nuvemshop'
    when 'shopee'            then 'Shopee'
    when 'payt'              then 'PayT'
    else initcap(NEW.platform) end;
  plat_abbr := case NEW.platform
    when 'mercadolivre'      then 'ML-LH'
    when 'mercadolivre_full' then 'ML-FULL'
    when 'amazon'            then 'AMZ'
    when 'nuvemshop'         then 'NS'
    when 'shopee'            then 'SHP'
    when 'payt'              then 'PAYT'
    else upper(left(NEW.platform, 4)) end;

  -- A COMPRA desta linha, e o resumo dela INTEIRA (só linhas que são venda).
  -- ⚠️ O filtro barato vem antes (carrinho exato, ou order_id da raiz) e a chave
  -- exata confere no fim: LIKE sozinho casaria raiz que é prefixo de outra.
  v_chave    := public.carbo_venda_chave(NEW.platform, NEW.order_id, NEW.platform_order_number);
  v_raiz     := public.ecommerce_pedido_raiz(NEW.platform, NEW.order_id);
  v_carrinho := case when NEW.platform = 'payt' then nullif(btrim(NEW.platform_order_number), '') end;

  select sum(e.total), sum(e.quantity),
         count(distinct split_part(e.order_id, '-', 1)),
         string_agg(distinct nullif(e.product_name, ''), ' + ')
    into v_total, v_qtd, v_transacoes, v_produtos
    from public.ecommerce_orders e
   where e.platform = NEW.platform
     and e.ordered_at > now() - interval '30 days'
     and (case when v_carrinho is not null
               then e.platform_order_number = v_carrinho
               else (e.order_id = v_raiz or e.order_id like v_raiz || '-%') end)
     and public.carbo_venda_chave(e.platform, e.order_id, e.platform_order_number) = v_chave
     and public.ecommerce_status_e_venda(e.status);

  v_corpo := plat_label
    || ' · ' || public.carbo_brl(coalesce(v_total, NEW.total, 0))
    || ' · ' || coalesce(v_qtd, NEW.quantity, 0) || ' un.'
    || coalesce(' · ' || coalesce(v_produtos, nullif(NEW.product_name, '')), '')
    || case when NEW.platform = 'payt' and coalesce(v_transacoes, 1) > 1 then ' · com upsell' else '' end;

  insert into public.carbo_venda_avisada (chave, ref_id)
  values (v_chave, NEW.id::text)
  on conflict (chave) do nothing
  returning ref_id into v_ref;

  if v_ref is not null then
    -- Primeira linha paga desta compra: o aviso.
    perform public.notify_time_interno(
      'ecommerce_sale',
      '🛒 Nova venda · ' || plat_abbr,
      v_corpo,
      'ecommerce_order', NEW.id);
  else
    -- A compra JÁ foi anunciada: o aviso dela passa a mostrar o total somado.
    -- UPDATE, não INSERT — sem segundo som, toast nem push.
    select a.ref_id into v_ref from public.carbo_venda_avisada a where a.chave = v_chave;
    update public.notifications
       set body = v_corpo
     where type = 'ecommerce_sale'
       and reference_type = 'ecommerce_order'
       and reference_id = v_ref;
  end if;
  return NEW;

exception when others then
  raise warning '[venda_notify] aviso falhou para % %: %',
    NEW.platform, NEW.order_id, sqlerrm;
  return NEW;
end $$;

revoke execute on function public.trg_ecommerce_sale_notify() from anon, public;

comment on function public.trg_ecommerce_sale_notify is
  'Aviso de venda on-line: UM por COMPRA (carrinho na PayT, raiz do pedido nos demais). A primeira linha paga anuncia já com o total da compra; upsell/bump/2º item ATUALIZAM o texto do aviso (ledger carbo_venda_avisada) em vez de criar outro. Canais, lista branca, janela de 12 h e transição para venda são os da 20260985.';

-- As compras anunciadas nas últimas 24 h entram no ledger, senão um upsell que
-- chegue agora para uma venda de antes da migração viraria "Nova venda" de novo.
insert into public.carbo_venda_avisada (chave, ref_id, avisado_em)
select distinct on (public.carbo_venda_chave(e.platform, e.order_id, e.platform_order_number))
       public.carbo_venda_chave(e.platform, e.order_id, e.platform_order_number),
       n.reference_id, n.created_at
  from public.notifications n
  join public.ecommerce_orders e on e.id::text = n.reference_id
 where n.type = 'ecommerce_sale' and n.reference_type = 'ecommerce_order'
   and n.created_at > now() - interval '24 hours'
 order by public.carbo_venda_chave(e.platform, e.order_id, e.platform_order_number), n.created_at
on conflict (chave) do nothing;

-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — arruma o sininho de HOJE (opcional, só avisos)           ║
-- ╚═══════════════════════════════════════════════════════════════════╝
-- Para cada compra das últimas 24 h com mais de um aviso: o PRIMEIRO fica, com
-- o texto do total somado; os outros saem. Não toca pedido nem venda — só a
-- tabela de avisos.
do $limpa$
declare r record; v_corpo text; v_n int := 0;
begin
  for r in
    select a.chave, a.ref_id
      from public.carbo_venda_avisada a
     where a.avisado_em > now() - interval '24 hours'
  loop
    if (select count(distinct n.reference_id)
          from public.notifications n
          join public.ecommerce_orders e on e.id::text = n.reference_id
         where n.type = 'ecommerce_sale' and n.reference_type = 'ecommerce_order'
           and n.created_at > now() - interval '24 hours'
           and public.carbo_venda_chave(e.platform, e.order_id, e.platform_order_number) = r.chave) < 2 then
      continue;
    end if;

    select case e0.platform
             when 'mercadolivre' then 'ML LogHouse' when 'mercadolivre_full' then 'ML Full'
             when 'amazon' then 'Amazon' when 'nuvemshop' then 'Nuvemshop'
             when 'shopee' then 'Shopee' when 'payt' then 'PayT' else initcap(e0.platform) end
           || ' · ' || public.carbo_brl(sum(e.total))
           || ' · ' || sum(e.quantity) || ' un.'
           || coalesce(' · ' || string_agg(distinct nullif(e.product_name, ''), ' + '), '')
           || case when e0.platform = 'payt' and count(distinct split_part(e.order_id, '-', 1)) > 1
                   then ' · com upsell' else '' end
      into v_corpo
      from public.ecommerce_orders e0
      join public.ecommerce_orders e
        on e.platform = e0.platform
       and public.carbo_venda_chave(e.platform, e.order_id, e.platform_order_number) = r.chave
       and public.ecommerce_status_e_venda(e.status)
     where e0.id::text = r.ref_id
     group by e0.platform;

    update public.notifications set body = v_corpo
     where type = 'ecommerce_sale' and reference_type = 'ecommerce_order' and reference_id = r.ref_id;

    delete from public.notifications n
     using public.ecommerce_orders e
     where e.id::text = n.reference_id
       and n.type = 'ecommerce_sale' and n.reference_type = 'ecommerce_order'
       and n.created_at > now() - interval '24 hours'
       and n.reference_id <> r.ref_id
       and public.carbo_venda_chave(e.platform, e.order_id, e.platform_order_number) = r.chave;
    v_n := v_n + 1;
  end loop;
  raise notice 'compras arrumadas: %', v_n;
end $limpa$;

-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ CONFERÊNCIA                                                        ║
-- ╚═══════════════════════════════════════════════════════════════════╝
-- ESPERADO: zero linhas (o mesmo select do BLOCO 0).
select e.platform,
       coalesce(nullif(e.platform_order_number, ''), split_part(e.order_id, '-', 1)) as compra,
       count(distinct n.reference_id) as avisos
  from public.notifications n
  join public.ecommerce_orders e on e.id::text = n.reference_id
 where n.type = 'ecommerce_sale' and n.reference_type = 'ecommerce_order'
   and n.created_at > now() - interval '24 hours'
 group by 1, 2
having count(distinct n.reference_id) > 1;

-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 3 — aviso antigo com "$59.90" passa a "R$ 59,90" (aplicado)  ║
-- ╚═══════════════════════════════════════════════════════════════════╝
-- Avisos criados ANTES desta migração saíam no locale do servidor. Reescreve
-- só o texto, com o total da compra; não toca pedido.
do $fmt$
declare r record; v_corpo text; v_n int := 0;
begin
  for r in
    select a.chave, a.ref_id
      from public.carbo_venda_avisada a
     where exists (select 1 from public.notifications n
                    where n.reference_id = a.ref_id and n.type = 'ecommerce_sale'
                      and n.body ~ '\$[0-9]' and n.body not like '%R$%')
  loop
    select case e0.platform
             when 'mercadolivre' then 'ML LogHouse' when 'mercadolivre_full' then 'ML Full'
             when 'amazon' then 'Amazon' when 'nuvemshop' then 'Nuvemshop'
             when 'shopee' then 'Shopee' when 'payt' then 'PayT' else initcap(e0.platform) end
           || ' · ' || public.carbo_brl(sum(e.total))
           || ' · ' || sum(e.quantity) || ' un.'
           || coalesce(' · ' || string_agg(distinct nullif(e.product_name, ''), ' + '), '')
           || case when e0.platform = 'payt' and count(distinct split_part(e.order_id, '-', 1)) > 1
                   then ' · com upsell' else '' end
      into v_corpo
      from public.ecommerce_orders e0
      join public.ecommerce_orders e
        on e.platform = e0.platform
       and public.carbo_venda_chave(e.platform, e.order_id, e.platform_order_number) = r.chave
       and public.ecommerce_status_e_venda(e.status)
     where e0.id::text = r.ref_id
     group by e0.platform;

    if v_corpo is not null then
      update public.notifications set body = v_corpo
       where type = 'ecommerce_sale' and reference_id = r.ref_id;
      v_n := v_n + 1;
    end if;
  end loop;
  raise notice 'avisos reformatados: %', v_n;
end $fmt$;
