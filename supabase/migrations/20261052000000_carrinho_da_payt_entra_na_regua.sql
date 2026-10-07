-- ═══════════════════════════════════════════════════════════════════════════
-- O carrinho abandonado da PAYT entra na régua de recuperação
--
-- Pedido do dono do processo em 07/10/2026. Medido antes:
--
--   régua de recompra   a PayT JÁ está lá (1 entregue; são 6 pedidos na
--                       esteira inteira) — nada a fazer.
--   régua de carrinho   só Nuvemshop. A PayT MANDA o aviso (`lost_cart`), com
--                       nome, telefone, e-mail, produto e o link que reabre o
--                       carrinho: 4 carrinhos, 3 com telefone, 4 com link. O
--                       aviso ia para `payt_eventos` e parava ali — de
--                       propósito, porque em `ecommerce_orders` ele viraria
--                       VENDA no painel e tocaria o som para o time inteiro.
--
-- ── O desenho, e por que NENHUMA view muda ───────────────────────────────
--
-- A `carbo_carrinho_pipeline` lê `nuvemshop_carrinhos`, e a `carbo_msg_fila`
-- lê a pipeline — as duas alimentam o WhatsApp. Republicá-las para aceitar uma
-- segunda fonte é mexer no gatilho. Em vez disso o carrinho da PayT entra NA
-- MESMA TABELA, com três cuidados:
--
-- 1. ⚠️ `checkout_id` NEGATIVO. O `cart_id` da PayT é texto (`R6VZW4`) e a
--    tabela — e o `bling_id` de `carbo_msg_envios`, que é a trava "uma mensagem
--    por etapa por carrinho" — são bigint. O id vem de um hash do `cart_id`:
--    mesmo carrinho, mesmo id, sempre. NEGATIVO para nunca colidir com o da
--    Nuvemshop (positivo) — a mesma regra do Bling 1 na esteira. E ⚠️ cabe em
--    52 bits: a tela é JavaScript, e número acima de 2^53 perde dígitos no
--    caminho sem erro nenhum, juntando dois carrinhos num só.
--    `token` guarda `payt:<cart_id>` — é por ele que se acha o original.
--
-- 2. ⚠️ A RECUPERAÇÃO. A view considera recuperado o carrinho com
--    `completado_em` preenchido OU com pedido NUVEMSHOP do mesmo e-mail. Pedido
--    da PayT não entra naquele cruzamento — então quem preenche `completado_em`
--    é esta função: venda PayT do MESMO `cart_id` (identidade: o pedido da PayT
--    É o carrinho, ver `platform_order_number`), ou o evento `cart_recovered`.
--    Sem isso, quem comprou pela PayT receberia "esqueceu algo?".
--    Quem abandona na PayT e compra na Nuvemshop com o mesmo e-mail já é pego
--    pela view, sem nada aqui.
--
-- 3. A mesma pessoa nas duas lojas recebe UMA sequência: a regra "só o
--    carrinho mais novo de cada contato" da view casa por e-mail ou telefone,
--    sem olhar a loja.
--
-- Todas as outras travas valem igual, porque é a MESMA régua: marco zero,
-- valor mínimo, janela de horário, e a parada quando o cliente responde
-- (`20261051`). E a régua continua DESLIGADA — nada aqui envia.
--
-- Por que CRON e não gatilho em `payt_eventos`: aquele INSERT é o log cru do
-- postback, a única cópia de um evento que a PayT não reenvia para sempre. Um
-- erro no gatilho derrubaria a gravação.
--
-- ⚠️ RODE EM BLOCOS, na ordem.
-- ═══════════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — a função                                                    ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
create or replace function public.carbo_payt_carrinhos_sincronizar()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_linhas integer;
begin
  -- 1) Os carrinhos perdidos, UM por `cart_id`. ⚠️ A PayT pode mandar o mesmo
  --    carrinho mais de uma vez, e cada aviso pode vir com um campo faltando:
  --    contato = o MAIS RECENTE que veio PREENCHIDO (nunca o vazio do último
  --    aviso); abandono = o PRIMEIRO (senão cada reenvio empurraria o relógio
  --    da 1ª mensagem para a frente).
  with ev0 as (
    select e.id, e.cart_id, e.corpo,
           coalesce(nullif(e.corpo->>'updated_at', '')::timestamp,
                    nullif(e.corpo->>'started_at', '')::timestamp) as abandono,
           nullif(trim(e.corpo->'customer'->>'name'), '')  as nome,
           nullif(trim(e.corpo->'customer'->>'phone'), '') as fone,
           nullif(trim(e.corpo->'customer'->>'email'), '') as mail,
           nullif(trim(e.corpo->'link'->>'url'), '')       as url
      from public.payt_eventos e
     where e.status = 'lost_cart'
       and not e.eh_teste
       and nullif(e.cart_id, '') is not null
  ),
  ev as (
    select cart_id,
           min(abandono)                                                         as abandono,
           (array_agg(corpo order by id desc))[1]                                as corpo,
           (array_agg(nome order by id desc) filter (where nome is not null))[1] as nome,
           (array_agg(fone order by id desc) filter (where fone is not null))[1] as fone,
           (array_agg(mail order by id desc) filter (where mail is not null))[1] as mail,
           (array_agg(url  order by id desc) filter (where url  is not null))[1] as url
      from ev0
     group by cart_id
  ),
  linhas as (
    select
      -(hashtextextended('payt:' || ev.cart_id, 0) & 4503599627370495) - 1 as checkout_id,
      'payt:' || ev.cart_id                                                 as token,
      -- A PayT manda data SEM fuso, em horário de Brasília.
      ev.abandono at time zone 'America/Sao_Paulo'                          as abandonado_em,
      ev.nome                                                               as cliente,
      -- ⚠️ CRU, como a plataforma mandou — mesma regra da Nuvemshop: quem
      -- normaliza é o envio, e só ele.
      ev.fone                                                               as telefone,
      ev.mail                                                               as email,
      -- ⚠️ CENTAVOS. Sem a divisão o valor sai ×100.
      round(coalesce((ev.corpo->'product'->>'price')::numeric, 0)
            * greatest(coalesce((ev.corpo->'product'->>'quantity')::int, 1), 1) / 100, 2) as total,
      greatest(coalesce((ev.corpo->'product'->>'quantity')::int, 1), 1)    as itens,
      nullif(trim(ev.corpo->'product'->>'name'), '')
        || ' ×' || greatest(coalesce((ev.corpo->'product'->>'quantity')::int, 1), 1) as produtos,
      ev.url                                                                as link,
      ev.corpo                                                              as raw
    from ev
  )
  insert into public.nuvemshop_carrinhos
         (checkout_id, token, abandonado_em, cliente, telefone, email,
          total, moeda, itens, produtos, link, raw)
  select checkout_id, token, abandonado_em, cliente, telefone, email,
         total, 'BRL', itens, produtos, link, raw
    from linhas
   where abandonado_em is not null
  on conflict (checkout_id) do update set
    -- ⚠️ Vazio NUNCA apaga dado bom: evento repetido sem telefone não pode
    -- tirar o telefone que o anterior trouxe.
    cliente       = coalesce(excluded.cliente,  nuvemshop_carrinhos.cliente),
    telefone      = coalesce(excluded.telefone, nuvemshop_carrinhos.telefone),
    email         = coalesce(excluded.email,    nuvemshop_carrinhos.email),
    link          = coalesce(excluded.link,     nuvemshop_carrinhos.link),
    produtos      = coalesce(excluded.produtos, nuvemshop_carrinhos.produtos),
    total         = excluded.total,
    itens         = excluded.itens,
    raw           = excluded.raw,
    atualizado_em = now();

  get diagnostics v_linhas = row_count;

  -- 2) A RECUPERAÇÃO: comprou pela PayT o MESMO carrinho, ou a PayT avisou
  --    `cart_recovered`. Só preenche, nunca apaga.
  update public.nuvemshop_carrinhos c
     set completado_em = r.quando,
         atualizado_em = now()
    from (
      select c2.checkout_id,
             least(
               (select min(o.ordered_at) from public.ecommerce_orders o
                 where o.platform = 'payt'
                   and o.platform_order_number = substr(c2.token, 6)
                   and public.ecommerce_status_e_venda(o.status)),
               (select min(e.recebido_em) from public.payt_eventos e
                 where e.status = 'cart_recovered'
                   and e.cart_id = substr(c2.token, 6))
             ) as quando
        from public.nuvemshop_carrinhos c2
       where c2.token like 'payt:%'
         and c2.completado_em is null
    ) r
   where c.checkout_id = r.checkout_id
     and r.quando is not null;

  return v_linhas;
end;
$$;

comment on function public.carbo_payt_carrinhos_sincronizar() is
  'Cron 5 min. Leva os carrinhos perdidos da PayT (payt_eventos, status lost_cart) para nuvemshop_carrinhos, com checkout_id NEGATIVO (hash do cart_id, 52 bits) e token payt:<cart_id>, e preenche completado_em quando o mesmo carrinho vira venda PayT ou chega cart_recovered. Assim a carbo_carrinho_pipeline e a carbo_msg_fila atendem as duas lojas sem mudar.';

revoke execute on function public.carbo_payt_carrinhos_sincronizar() from public, anon, authenticated;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — o agendamento (SQL puro, a cada 5 min, minuto :03)          ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- A 1ª mensagem só vence 60 min depois do abandono: 5 min de atraso aqui não
-- muda nada para quem recebe.
select cron.schedule('payt-carrinhos-5min', '3-59/5 * * * *',
                     'select public.carbo_payt_carrinhos_sincronizar()');


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ CONFERÊNCIA                                                           ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- (a) Roda uma vez na mão. ESPERADO: 4 (os carrinhos medidos em 07/10).
-- select public.carbo_payt_carrinhos_sincronizar() as carrinhos_payt;
--
-- (b) Onde eles caíram na régua. ESPERADO: 4 linhas, com coluna e telefone.
-- select p.checkout_id, p.cliente, p.telefone, p.total, p.coluna, p.recuperado
--   from public.carbo_carrinho_pipeline p
--  where p.checkout_id < 0
--  order by p.abandonado_em desc;
