-- =====================================================================
-- O UPSELL TOCA — e diz que é upsell (15/10/2026). Revê a 20261085.
--
-- A 20261085 fez o upsell NÃO avisar (só atualizava o texto da venda). O dono
-- do processo corrigiu no mesmo dia: "o upsell é venda… tem que tocar a venda e
-- depois tocar o upsell sim, só que tem que ficar obvio que é upsell". O que
-- não pode é PARECER outra venda — e contar como compra separada, que a Esteira
-- e o Comparativo já não fazem (agrupam pelo carrinho).
--
-- A regra nova:
--   UM aviso por TRANSAÇÃO na PayT (por pedido nos demais canais).
--   Principal  "🛒 Nova venda · PAYT"  PayT · R$ 59,90 · 1 un. · Kit 10 Sachês…
--   Upsell     "⬆️ Upsell · PAYT"      PayT · +R$ 119,60 · compra agora R$ 179,50 ·
--                                       1 un. · CarboZé Kit 5 Frascos 100ml
-- O tipo continua `ecommerce_sale`: o som, o toast, o sininho e o push do
-- celular já funcionam por ele, e é isso que "tocar o upsell" pede. Quem diz
-- que é upsell é o TÍTULO (e o selo "Upsell" que o sininho dos oito apps lê
-- dele).
--
-- ⚠️ QUEM É UPSELL vem do PRÓPRIO dado, nunca da ordem de chegada: a PayT manda
-- `"type": "upsell"` / `"manual_upsell"` e `transaction.upsell_from`. Ordem de
-- chegada erraria justamente no caso que já aconteceu (EYEZ2VV): a principal
-- entrou DEPOIS do upsell e teria sido chamada de upsell. A ordem só decide
-- quando o corpo não diz nada (BLOCO 0 mede quanto isso acontece).
--
-- O nome do produto vai CURTO no aviso (corte no primeiro " - "): o slogan
-- inteiro ("- Tratamento de Combustível e Proteção do Motor - 20% OFF") não
-- cabia no sininho. O pedido continua com o nome inteiro.
-- =====================================================================

-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 0 — o que a PayT manda em cada transação de hoje (leitura)   ║
-- ╚═══════════════════════════════════════════════════════════════════╝
-- ESPERADO: as principais com tipo `order` e upsell_from vazio; os upsells
-- (ZY2OB8M, 32VQBNZ, BEZGZ52, ZY2OOAP, 9GDYW65, 78EYGOW) com tipo `upsell` ou
-- `manual_upsell` e upsell_from = a transação principal.
-- Tipo VAZIO em alguma linha = o corpo não diz; me mande — é onde a ordem de
-- chegada passa a decidir.
select split_part(o.order_id, '-', 1)                as transacao,
       o.platform_order_number                        as carrinho,
       o.status,
       o.total,
       o.raw->>'type'                                 as tipo,
       o.raw->'transaction'->>'upsell_from'           as upsell_from
  from public.ecommerce_orders o
 where o.platform = 'payt' and o.ordered_at > now() - interval '24 hours'
 order by o.platform_order_number, o.ordered_at;

-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — o nome curto e o gatilho                                 ║
-- ╚═══════════════════════════════════════════════════════════════════╝
do $guarda$
declare v_def text := pg_get_functiondef('public.trg_ecommerce_sale_notify()'::regprocedure);
begin
  if v_def not like '%carbo_venda_avisada%' or v_def not like '%carbo_brl%' then
    raise exception 'trg_ecommerce_sale_notify NÃO é a da 20261085. Nada foi alterado.';
  end if;
end $guarda$;

create or replace function public.carbo_nome_curto(p text)
returns text language sql immutable set search_path = public as $$
  select nullif(btrim(split_part(coalesce(p, ''), ' - ', 1)), '')
$$;

create or replace function public.trg_ecommerce_sale_notify()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  plat_label text; plat_abbr text;
  v_tx text; v_raiz text; v_carrinho text; v_chave text; v_tipo text;
  v_upsell boolean := false;
  v_total numeric; v_qtd bigint; v_produtos text; v_compra numeric;
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

  v_tx       := split_part(NEW.order_id, '-', 1);
  v_raiz     := public.ecommerce_pedido_raiz(NEW.platform, NEW.order_id);
  v_carrinho := case when NEW.platform = 'payt' then nullif(btrim(NEW.platform_order_number), '') end;

  -- A chave do AVISO: a transação na PayT (cada uma toca), a raiz do pedido nos
  -- demais (pedido de dois itens são duas linhas e UM aviso).
  v_chave := case when NEW.platform = 'payt' then 'payt:transacao:' || v_tx
                  else public.carbo_venda_chave(NEW.platform, NEW.order_id, NEW.platform_order_number) end;

  if NEW.platform = 'payt' then
    -- Quem é upsell: o CORPO diz. A ordem de chegada só decide quando ele cala.
    v_tipo := lower(coalesce(NEW.raw ->> 'type', ''));
    v_upsell := v_tipo like '%upsell%'
             or nullif(btrim(coalesce(NEW.raw -> 'transaction' ->> 'upsell_from', '')), '') is not null;
    if not v_upsell and v_tipo = '' and v_carrinho is not null then
      v_upsell := exists (
        select 1 from public.ecommerce_orders o
         where o.platform = 'payt' and o.platform_order_number = v_carrinho
           and split_part(o.order_id, '-', 1) <> v_tx
           and public.ecommerce_status_e_venda(o.status)
           and o.ordered_at > now() - interval '30 days');
    end if;
  end if;

  -- O valor DESTE aviso: a transação (PayT) ou o pedido (demais), só linha venda.
  select sum(e.total), sum(e.quantity),
         string_agg(distinct public.carbo_nome_curto(e.product_name), ' + ')
    into v_total, v_qtd, v_produtos
    from public.ecommerce_orders e
   where e.platform = NEW.platform
     and e.ordered_at > now() - interval '30 days'
     and (case when NEW.platform = 'payt'
               then (e.order_id = v_tx or e.order_id like v_tx || '-%')
               else (e.order_id = v_raiz or e.order_id like v_raiz || '-%')
                    and public.carbo_venda_chave(e.platform, e.order_id, e.platform_order_number) = v_chave end)
     and public.ecommerce_status_e_venda(e.status);

  if v_upsell and v_carrinho is not null then
    select sum(e.total) into v_compra
      from public.ecommerce_orders e
     where e.platform = 'payt' and e.platform_order_number = v_carrinho
       and e.ordered_at > now() - interval '30 days'
       and public.ecommerce_status_e_venda(e.status);
  end if;

  v_corpo := plat_label
    || ' · ' || case when v_upsell then '+' else '' end
    || public.carbo_brl(coalesce(v_total, NEW.total, 0))
    -- O total da compra vem ANTES do produto: é a informação do upsell, e o
    -- sininho corta o texto na 2ª linha.
    || case when v_upsell and v_compra is not null
            then ' · compra agora ' || public.carbo_brl(v_compra) else '' end
    || ' · ' || coalesce(v_qtd, NEW.quantity, 0) || ' un.'
    || coalesce(' · ' || coalesce(v_produtos, public.carbo_nome_curto(NEW.product_name)), '');

  insert into public.carbo_venda_avisada (chave, ref_id)
  values (v_chave, NEW.id::text)
  on conflict (chave) do nothing
  returning ref_id into v_ref;

  if v_ref is not null then
    perform public.notify_time_interno(
      'ecommerce_sale',
      case when v_upsell then '⬆️ Upsell · ' else '🛒 Nova venda · ' end || plat_abbr,
      v_corpo,
      'ecommerce_order', NEW.id);
  else
    -- Outra linha do MESMO aviso (2º item do pedido): só o texto muda.
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
  'Aviso de venda on-line: UM por TRANSAÇÃO na PayT (por pedido nos demais). Upsell TOCA, com título "⬆️ Upsell" e o total da compra no texto — quem diz que é upsell é o corpo da PayT (type/upsell_from). Nome do produto curto. Canais, lista branca, janela de 12 h e transição para venda são os da 20260985. Ver 20261086.';

-- As transações já avisadas hoje entram no ledger pela chave NOVA, senão uma
-- linha que chegue agora para elas tocaria de novo.
insert into public.carbo_venda_avisada (chave, ref_id, avisado_em)
select distinct on (split_part(e.order_id, '-', 1))
       'payt:transacao:' || split_part(e.order_id, '-', 1), n.reference_id, n.created_at
  from public.notifications n
  join public.ecommerce_orders e on e.id::text = n.reference_id
 where n.type = 'ecommerce_sale' and n.reference_type = 'ecommerce_order'
   and e.platform = 'payt'
   and n.created_at > now() - interval '24 hours'
 order by split_part(e.order_id, '-', 1), n.created_at
on conflict (chave) do nothing;

-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ CONFERÊNCIA — o gatilho vivo é o novo                              ║
-- ╚═══════════════════════════════════════════════════════════════════╝
-- ESPERADO: true · true.
select pg_get_functiondef('public.trg_ecommerce_sale_notify()'::regprocedure) like '%Upsell%'          as avisa_upsell,
       pg_get_functiondef('public.trg_ecommerce_sale_notify()'::regprocedure) like '%carbo_nome_curto%' as nome_curto;
