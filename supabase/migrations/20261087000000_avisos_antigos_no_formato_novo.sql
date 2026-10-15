-- =====================================================================
-- Os avisos de venda JÁ ENVIADOS passam ao formato novo (15/10/2026).
--
-- Pedido do dono do processo, com print do sininho: "tem como alterar ja a
-- visualização das vendas anteriores que ja sairam dessa forma?" — avisos de
-- antes da 20261086 seguem com o nome inteiro do produto ("- Tratamento De…")
-- e, nos carrinhos com upsell, com o total somado da 20261085.
--
-- Só REESCREVE título e texto de avisos que existem. NÃO cria aviso: insert em
-- `notifications` toca o som, mostra o toast e manda push no celular para o
-- time inteiro — sobre venda de horas atrás.
--
-- A regra é a do gatilho da 20261086, aplicada a cada aviso pelo pedido a que
-- ele aponta (`reference_id`):
--   principal  "🛒 Nova venda · PAYT"  PayT · R$ 59,90 · 1 un. · Kit 10 Sachês…
--   upsell     "⬆️ Upsell · PAYT"      PayT · +R$ 119,60 · compra agora R$ 179,50 · …
-- E o caso que só existe no passado: a 20261085 APAGOU o aviso de alguns
-- upsells (fundiu no da principal). Esses não voltam (voltar tocaria); o aviso
-- da principal diz que houve upsell: "… · + upsell R$ 119,60 (compra R$ 179,50)".
-- =====================================================================

-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 0 — os avisos que vão mudar, ANTES (leitura)                 ║
-- ╚═══════════════════════════════════════════════════════════════════╝
-- ESPERADO: um aviso por compra de hoje e de ontem (8 da PayT + os outros
-- canais), com o texto antigo.
select distinct on (n.reference_id) n.created_at, n.title, n.body
  from public.notifications n
 where n.type = 'ecommerce_sale' and n.reference_type = 'ecommerce_order'
   and n.created_at > now() - interval '7 days'
 order by n.reference_id, n.created_at;

-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — reescreve título e texto (últimos 7 dias)                ║
-- ╚═══════════════════════════════════════════════════════════════════╝
do $fmt$
declare
  r record;
  v_upsell boolean; v_tx text; v_raiz text; v_carrinho text; v_chave text;
  v_total numeric; v_qtd bigint; v_produtos text; v_compra numeric; v_sem_aviso numeric;
  v_label text; v_abbr text; v_titulo text; v_corpo text; v_n int := 0;
begin
  for r in
    select distinct on (n.reference_id) n.reference_id, e.*
      from public.notifications n
      join public.ecommerce_orders e on e.id::text = n.reference_id
     where n.type = 'ecommerce_sale' and n.reference_type = 'ecommerce_order'
       and n.created_at > now() - interval '7 days'
     order by n.reference_id
  loop
    v_label := case r.platform
      when 'mercadolivre' then 'ML LogHouse' when 'mercadolivre_full' then 'ML Full'
      when 'amazon' then 'Amazon' when 'nuvemshop' then 'Nuvemshop'
      when 'shopee' then 'Shopee' when 'payt' then 'PayT' else initcap(r.platform) end;
    v_abbr := case r.platform
      when 'mercadolivre' then 'ML-LH' when 'mercadolivre_full' then 'ML-FULL'
      when 'amazon' then 'AMZ' when 'nuvemshop' then 'NS'
      when 'shopee' then 'SHP' when 'payt' then 'PAYT' else upper(left(r.platform, 4)) end;

    v_tx       := split_part(r.order_id, '-', 1);
    v_raiz     := public.ecommerce_pedido_raiz(r.platform, r.order_id);
    v_carrinho := case when r.platform = 'payt' then nullif(btrim(r.platform_order_number), '') end;
    v_chave    := public.carbo_venda_chave(r.platform, r.order_id, r.platform_order_number);
    v_upsell   := r.platform = 'payt'
                  and (lower(coalesce(r.raw ->> 'type', '')) like '%upsell%'
                       or nullif(btrim(coalesce(r.raw -> 'transaction' ->> 'upsell_from', '')), '') is not null);

    select sum(e.total), sum(e.quantity),
           string_agg(distinct public.carbo_nome_curto(e.product_name), ' + ')
      into v_total, v_qtd, v_produtos
      from public.ecommerce_orders e
     where e.platform = r.platform
       and (case when r.platform = 'payt'
                 then (e.order_id = v_tx or e.order_id like v_tx || '-%')
                 else (e.order_id = v_raiz or e.order_id like v_raiz || '-%')
                      and public.carbo_venda_chave(e.platform, e.order_id, e.platform_order_number) = v_chave end)
       and public.ecommerce_status_e_venda(e.status);

    v_compra := null; v_sem_aviso := null;
    if v_carrinho is not null then
      select sum(e.total) into v_compra
        from public.ecommerce_orders e
       where e.platform = 'payt' and e.platform_order_number = v_carrinho
         and public.ecommerce_status_e_venda(e.status);
      -- Upsell pago deste carrinho cujo aviso a 20261085 apagou.
      if not v_upsell then
        select sum(e.total) into v_sem_aviso
          from public.ecommerce_orders e
         where e.platform = 'payt' and e.platform_order_number = v_carrinho
           and split_part(e.order_id, '-', 1) <> v_tx
           and public.ecommerce_status_e_venda(e.status)
           and not exists (select 1 from public.notifications n2
                            where n2.type = 'ecommerce_sale' and n2.reference_id = e.id::text);
      end if;
    end if;

    v_titulo := case when v_upsell then '⬆️ Upsell · ' else '🛒 Nova venda · ' end || v_abbr;
    v_corpo  := v_label
      || ' · ' || case when v_upsell then '+' else '' end
      || public.carbo_brl(coalesce(v_total, r.total, 0))
      || case when v_upsell and v_compra is not null
              then ' · compra agora ' || public.carbo_brl(v_compra) else '' end
      || case when v_sem_aviso is not null
              then ' · + upsell ' || public.carbo_brl(v_sem_aviso)
                   || ' (compra ' || public.carbo_brl(v_compra) || ')' else '' end
      || ' · ' || coalesce(v_qtd, r.quantity, 0) || ' un.'
      || coalesce(' · ' || coalesce(v_produtos, public.carbo_nome_curto(r.product_name)), '');

    update public.notifications
       set title = v_titulo, body = v_corpo
     where type = 'ecommerce_sale' and reference_type = 'ecommerce_order'
       and reference_id = r.reference_id
       and (title is distinct from v_titulo or body is distinct from v_corpo);
    v_n := v_n + 1;
  end loop;
  raise notice 'avisos reescritos: %', v_n;
end $fmt$;

-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ CONFERÊNCIA — os mesmos avisos, DEPOIS                             ║
-- ╚═══════════════════════════════════════════════════════════════════╝
-- ESPERADO: nenhum texto com "Tratamento" nem "$" sem "R$"; principal com
-- "🛒 Nova venda", upsell com "⬆️ Upsell" e "compra agora".
select distinct on (n.reference_id) n.created_at, n.title, n.body
  from public.notifications n
 where n.type = 'ecommerce_sale' and n.reference_type = 'ecommerce_order'
   and n.created_at > now() - interval '7 days'
 order by n.reference_id, n.created_at;
