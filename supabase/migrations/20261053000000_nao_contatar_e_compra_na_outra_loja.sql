-- ═══════════════════════════════════════════════════════════════════════════
-- Duas travas antes de ligar a recuperação de carrinho (07/10/2026)
--
--   A. NÃO CONTATAR — quem pediu para parar sai de TODA mensagem comercial
--   B. Abandonou numa loja e comprou na OUTRA — o carrinho conta recuperado
--
-- ── A. Não contatar ──────────────────────────────────────────────────────
--
-- Até aqui a resposta do cliente parava só a sequência DAQUELE carrinho
-- (`20261051`). Quem disse "pare de me mandar mensagem" voltava a receber no
-- próximo carrinho abandonado e, 30 dias depois de comprar, a oferta de
-- recompra pelo Clube. A Meta exige respeitar o pedido em mensagem de
-- marketing, e quem não é respeitado denuncia — o que derruba a qualidade do
-- número.
--
-- 1. ⚠️ Vale para o COMERCIAL (`recompra`, `carrinho_1..3`), nunca para os
--    avisos do pedido (NF emitida, saiu para entrega…): esses são serviço que
--    o cliente comprou, e parar o "saiu para entrega" de quem pediu "não me
--    mande promoção" seria punir a pessoa.
-- 2. ⚠️ A trava mora no ENVIO (`whatsapp-meta`), não nas views: é o único
--    ponto por onde toda mensagem automática passa, e as views alimentam a
--    fila — mexer nelas é mexer no gatilho.
-- 3. ⚠️ A CHAVE é DDD + últimos 8 dígitos (`carbo_fone_chave`), e isto é
--    FROUXO DE PROPÓSITO. Em todo o resto deste sistema se casa por identidade
--    exata — mas aqui o erro tem direção: chave frouxa erra para "não
--    mandar", que é o lado seguro de um pedido de privacidade. O 9º dígito
--    varia por DDD e por idade do cadastro (a Meta devolve 558487346304 para
--    quem mandamos 5584987346304), e casar exato deixaria passar justamente a
--    pessoa que pediu para parar. A regra existe em DUAS cópias — esta função
--    e `chaveDoFone` em `_shared/metaTemplate.ts` (e o espelho da tela, em
--    `useEsteiraOnline.ts`). Mudou uma, mude as outras.
-- 4. Desmarcar existe (a pessoa pode pedir para voltar), e ele NÃO apaga a
--    linha: grava `removido_em`. O pedido de parar é registro.
--
-- ── B. Comprou na outra loja ─────────────────────────────────────────────
--
-- A view `carbo_carrinho_pipeline` dá por recuperado o carrinho com
-- `completado_em` OU com pedido NUVEMSHOP do mesmo e-mail. Quem abandonava na
-- Nuvemshop e comprava na PayT continuava sendo perseguido — "esqueceu algo?"
-- para quem já pagou. Agora a função dos carrinhos da PayT (já agendada a cada
-- 5 min, `20261052`) também preenche `completado_em` de QUALQUER carrinho cujo
-- dono comprou pela PayT depois do abandono — por e-mail ou pela chave do
-- telefone. Frouxo pelo mesmo motivo da view: errar custa uma recuperação
-- perdida; errar no outro sentido manda mensagem para quem já pagou.
--
-- ⚠️ E o `completado_em` nunca volta a nulo: o sync da Nuvemshop regrava a
-- linha a cada 15 min com o que a plataforma diz — e ela não sabe da compra
-- na PayT. Sem o gatilho do BLOCO 4, a marca sumiria a cada rodada e
-- voltaria 5 min depois, e nesse intervalo a mensagem podia sair. É a regra
-- "vazio nunca apaga dado bom" do `ecommerce_nao_apaga_com_vazio`.
--
-- ⚠️ RODE EM BLOCOS, na ordem. E rode LOGO: a função de envio já está no ar
-- esperando a tabela do BLOCO 2 — enquanto ela não existe, as mensagens
-- COMERCIAIS ficam seguradas (nunca enviadas sem a checagem). Os avisos do
-- pedido seguem normalmente.
-- ═══════════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — a chave do telefone                                         ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
create or replace function public.carbo_fone_chave(p text)
returns text
language sql
immutable
as $$
  select case
    when d is null or d = ''                          then null
    when d like '55%' and length(d) in (12, 13)       then substr(d, 3, 2) || right(d, 8)
    when length(d) in (10, 11)                        then substr(d, 1, 2) || right(d, 8)
    else d
  end
  from (select regexp_replace(coalesce(p, ''), '\D', '', 'g') as d) x;
$$;

comment on function public.carbo_fone_chave(text) is
  'DDD + ultimos 8 digitos. Ignora o 9 e o 55, que variam entre o cadastro e o wa_id da Meta. Frouxa de proposito: so e usada onde errar para "nao mandar" e o lado seguro (nao contatar, recuperacao de carrinho). Copias: chaveDoFone em _shared/metaTemplate.ts e em useEsteiraOnline.ts.';


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — a lista "não contatar"                                      ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
create table if not exists public.carbo_wa_nao_contatar (
  chave        text primary key,
  wa_id        text,
  numero_id    text,
  motivo       text,
  marcado_por  uuid,
  marcado_em   timestamptz not null default now(),
  -- Nulo = valendo. Desmarcar grava aqui; a linha nunca é apagada.
  removido_em  timestamptz,
  removido_por uuid
);

comment on table public.carbo_wa_nao_contatar is
  'Quem pediu para nao receber mais mensagem COMERCIAL (recompra, carrinho). O whatsapp-meta consulta antes de cada envio comercial. Chave = carbo_fone_chave. removido_em nulo = valendo.';

alter table public.carbo_wa_nao_contatar enable row level security;

-- ⚠️ Leitura só para o time interno; escrita SÓ pelas funções abaixo. O
-- portal de lojas e o de licenciados usam a MESMA `profiles`.
drop policy if exists carbo_wa_nao_contatar_le on public.carbo_wa_nao_contatar;
create policy carbo_wa_nao_contatar_le on public.carbo_wa_nao_contatar
  for select to authenticated using (public.carbo_e_time_interno());

grant select on public.carbo_wa_nao_contatar to authenticated;

create or replace function public.carbo_wa_nao_contatar_marcar(
  p_wa_id text, p_numero_id text default null, p_motivo text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_chave text := public.carbo_fone_chave(p_wa_id);
begin
  if auth.uid() is null or not public.carbo_e_time_interno() then
    raise exception 'Sem permissão';
  end if;
  if v_chave is null then
    raise exception 'Telefone inválido';
  end if;
  insert into public.carbo_wa_nao_contatar
         (chave, wa_id, numero_id, motivo, marcado_por, marcado_em, removido_em, removido_por)
  values (v_chave, p_wa_id, p_numero_id, p_motivo, auth.uid(), now(), null, null)
  on conflict (chave) do update set
    wa_id = excluded.wa_id, numero_id = excluded.numero_id, motivo = excluded.motivo,
    marcado_por = excluded.marcado_por, marcado_em = now(),
    removido_em = null, removido_por = null;
end;
$$;

create or replace function public.carbo_wa_nao_contatar_desmarcar(p_wa_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.carbo_e_time_interno() then
    raise exception 'Sem permissão';
  end if;
  update public.carbo_wa_nao_contatar
     set removido_em = now(), removido_por = auth.uid()
   where chave = public.carbo_fone_chave(p_wa_id)
     and removido_em is null;
end;
$$;

revoke execute on function public.carbo_wa_nao_contatar_marcar(text, text, text)   from public, anon;
revoke execute on function public.carbo_wa_nao_contatar_desmarcar(text)             from public, anon;
grant  execute on function public.carbo_wa_nao_contatar_marcar(text, text, text)   to authenticated;
grant  execute on function public.carbo_wa_nao_contatar_desmarcar(text)             to authenticated;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 3 — comprou na PayT: o carrinho de QUALQUER loja conta recuperado ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- A mesma função da `20261052`, com o passo 3 acrescentado no fim.
create or replace function public.carbo_payt_carrinhos_sincronizar()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_linhas integer;
begin
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
      ev.abandono at time zone 'America/Sao_Paulo'                          as abandonado_em,
      ev.nome                                                               as cliente,
      ev.fone                                                               as telefone,
      ev.mail                                                               as email,
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

  -- 2) Carrinho da PayT: o MESMO carrinho virou venda, ou chegou cart_recovered.
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

  -- 3) ⚠️ NOVO: QUALQUER carrinho (Nuvemshop ou PayT) cujo dono comprou pela
  --    PayT depois do abandono — por e-mail ou pela chave do telefone. Mesmo
  --    critério frouxo da view (qualquer status que não seja cancelado).
  update public.nuvemshop_carrinhos c
     set completado_em = r.quando,
         atualizado_em = now()
    from (
      select c2.checkout_id,
             (select min(o.ordered_at) from public.ecommerce_orders o
               where o.platform = 'payt'
                 and o.status <> 'cancelled'
                 and o.ordered_at >= c2.abandonado_em
                 and (
                   (nullif(lower(trim(o.cliente_email)), '') is not null
                    and lower(trim(o.cliente_email)) = lower(trim(c2.email)))
                   or
                   (public.carbo_fone_chave(o.cliente_fone) is not null
                    and public.carbo_fone_chave(o.cliente_fone) = public.carbo_fone_chave(c2.telefone))
                 )) as quando
        from public.nuvemshop_carrinhos c2
       where c2.completado_em is null
    ) r
   where c.checkout_id = r.checkout_id
     and r.quando is not null;

  return v_linhas;
end;
$$;

revoke execute on function public.carbo_payt_carrinhos_sincronizar() from public, anon, authenticated;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 4 — `completado_em` nunca volta a nulo                          ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
create or replace function public.carbo_carrinho_nao_descompleta()
returns trigger
language plpgsql
as $$
begin
  new.completado_em := coalesce(new.completado_em, old.completado_em);
  return new;
end;
$$;

drop trigger if exists trg_carrinho_nao_descompleta on public.nuvemshop_carrinhos;
create trigger trg_carrinho_nao_descompleta
  before update on public.nuvemshop_carrinhos
  for each row execute function public.carbo_carrinho_nao_descompleta();


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ CONFERÊNCIA                                                           ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- (a) A chave. ESPERADO: as três iguais a 8487346304.
-- select public.carbo_fone_chave('5584987346304') as com_9,
--        public.carbo_fone_chave('558487346304')  as sem_9,
--        public.carbo_fone_chave('(84) 98734-6304') as do_cadastro;
--
-- (b) Roda a função. ESPERADO: 4 (os carrinhos da PayT de novo; nada duplica).
-- select public.carbo_payt_carrinhos_sincronizar() as carrinhos_payt;
--
-- (c) Quantos carrinhos passaram a contar recuperados pela compra na PayT.
--     Nenhum número "esperado": é o que o passo 3 encontrou no histórico.
-- select count(*) filter (where completado_em is not null) as recuperados,
--        count(*) as carrinhos
--   from public.nuvemshop_carrinhos;
