-- ═══════════════════════════════════════════════════════════════════════════
-- Remessa para o ML Full — sai daqui, NÃO entra lá (e o trânsito aparece)
--
-- Pedido do dono do processo em 21/09/2026, nestas palavras: *"a entrada seria
-- fictícia nesse ML Full... tem que deduzir do estoque Hub Natal, mas não pode
-- somar no ML Full, pq o ML Full espelha a info que o ML Full dá"*.
--
-- ⚠️ Eu tinha dito que espelho não recebe escrita nenhuma ("espelho que oferece
-- caneta convida a escrever"). Estava errado por juntar duas coisas: escrever
-- no NÚMERO DO ML (que de fato não se faz — o próximo sync sobrescreve) e
-- registrar a SAÍDA do nosso galpão (que é obrigatório, senão o estoque de
-- Natal mente).
--
-- ═══════════════════════════════════════════════════════════════════════════
-- ⚠️ POR QUE "EM TRÂNSITO" TEM DE EXISTIR
--
-- A remessa sai hoje; o número do ML só sobe quando eles recebem e processam,
-- dias depois. No intervalo:
--
--     Natal já perdeu 500        o ML ainda mostra 20
--
-- Quem abrir a tela para "identificar a ruptura antes de acontecer" vê ruptura
-- e MANDA OUTRO LOTE. A tela estaria certa em cada número e mentindo no todo.
--
-- É a mesma lição já paga no estoque do vendedor: *"o envio tem DUAS etapas.
-- `ops_transfer_register` tira de Natal e põe em trânsito; só
-- `ops_transfer_confirm` credita a caixa."* A diferença aqui é que a segunda
-- etapa NÃO credita — quem credita é o Mercado Livre, sozinho, no espelho. Ela
-- serve só para fechar o trânsito.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- ⚠️ A ORIGEM É ESCOLHIDA, NUNCA ESCRITA NO CÓDIGO
--
-- O padrão é o Hub Natal, que foi o que o dono do processo disse. Mas o
-- parâmetro existe, e isso é uma lição já paga: o estorno de pronta entrega
-- tinha `'HUB-RN'` escrito no código, e cancelar uma venda devolvia a Natal um
-- produto que estava na van do vendedor. Origem presumida erra calada.
--
-- ⚠️ RODE EM BLOCOS. Depende da 20260988 (o espelho).
-- ═══════════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — a remessa                                                   ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

create table if not exists public.ml_full_remessas (
  id              uuid primary key default gen_random_uuid(),
  product_id      uuid not null references public.mrp_products(id),
  quantidade      integer not null check (quantidade > 0),

  -- ⚠️ De ONDE saiu, guardado na linha. Sem isto, cancelar uma remessa não
  -- saberia para qual galpão devolver — exatamente o defeito do `'HUB-RN'`
  -- escrito no código do estorno de pronta entrega.
  origem_warehouse_id uuid not null references public.warehouses(id),

  status          text not null default 'em_transito'
                  check (status in ('em_transito', 'recebida', 'cancelada')),

  enviado_em      timestamptz not null default now(),
  enviado_por     uuid,
  recebido_em     timestamptz,
  recebido_por    uuid,
  cancelado_em    timestamptz,
  cancelado_por   uuid,
  motivo_cancelamento text,
  observacao      text,

  -- Liga à saída que deduziu Natal, para auditoria nos dois sentidos.
  movimento_id    uuid references public.stock_movements(id),
  created_at      timestamptz not null default now()
);

comment on table public.ml_full_remessas is
  'Remessas de reposicao para o Fulfillment do ML. Deduz do galpao de origem e NAO credita nada: quem credita e o proprio ML, no espelho ml_estoque_full. O estado em_transito existe porque o numero do ML so sobe dias depois — sem ele, Natal ja perdeu o lote e o Full ainda mostra pouco, e quem le a tela manda outro lote.';

create index if not exists idx_ml_full_remessas_produto
  on public.ml_full_remessas (product_id, status);

alter table public.ml_full_remessas enable row level security;

drop policy if exists "interno le ml_full_remessas" on public.ml_full_remessas;
create policy "interno le ml_full_remessas"
  on public.ml_full_remessas for select
  using (public.carbo_e_time_interno());

-- ⚠️ Escrita SÓ pelas RPCs (security definer). Policy de INSERT/UPDATE direta
-- deixaria alguém gravar uma remessa sem deduzir o estoque — e aí o registro
-- diria que saiu e o saldo diria que não.
drop policy if exists "service escreve ml_full_remessas" on public.ml_full_remessas;
create policy "service escreve ml_full_remessas"
  on public.ml_full_remessas for all to service_role using (true) with check (true);


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — registrar: deduz a origem, credita NINGUÉM                  ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

create or replace function public.ml_full_remessa_registrar(
  p_product_id  uuid,
  p_quantidade  integer,
  p_origem_code text default 'HUB-RN',
  p_observacao  text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_wh        uuid;
  v_saldo     integer;
  v_mov       uuid;
  v_remessa   uuid;
  v_produto   text;
begin
  if not public.carbo_e_time_interno() then
    raise exception 'Sem permissao para registrar remessa.';
  end if;
  if coalesce(p_quantidade, 0) <= 0 then
    raise exception 'Quantidade tem de ser maior que zero.';
  end if;

  select w.id into v_wh from public.warehouses w where w.code = p_origem_code;
  if v_wh is null then
    raise exception 'Galpao de origem nao encontrado: %', p_origem_code;
  end if;

  select p.name into v_produto from public.mrp_products p where p.id = p_product_id;
  if v_produto is null then
    raise exception 'Produto nao encontrado.';
  end if;

  -- ⚠️ TRAVA A LINHA ANTES de conferir o saldo. Sem `for update`, duas
  -- remessas simultaneas do mesmo produto leem o mesmo saldo e as duas passam:
  -- estoque negativo, sem erro. Mesma trava da deducao de pronta entrega.
  select ws.quantity into v_saldo
  from public.warehouse_stock ws
  where ws.warehouse_id = v_wh and ws.product_id = p_product_id
  for update;

  if v_saldo is null then
    raise exception 'O produto % nao tem saldo em %.', v_produto, p_origem_code;
  end if;
  -- ⚠️ Aqui a recusa é CERTA, ao contrário da venda on-line. Na venda a
  -- mercadoria já saiu e recusar não a traz de volta; aqui ninguém despachou
  -- ainda, e deixar negativo só esconderia que não havia o que mandar.
  if v_saldo < p_quantidade then
    raise exception 'Saldo insuficiente de % em %: tem %, pediu %.',
      v_produto, p_origem_code, v_saldo, p_quantidade;
  end if;

  update public.warehouse_stock
     set quantity = quantity - p_quantidade
   where warehouse_id = v_wh and product_id = p_product_id;

  -- `origem = 'transferencia'` já é valor válido no gatilho
  -- `validate_stock_movement` — conferido antes de escrever. Origem nova ali
  -- seria a dedução abortando a cada rodada, como em 31/08.
  insert into public.stock_movements
    (product_id, warehouse_id, tipo, quantidade, origem, observacoes, executor, created_by)
  values
    (p_product_id, v_wh, 'saida', p_quantidade, 'transferencia',
     'Remessa para ML Full' || coalesce(' · ' || nullif(p_observacao, ''), ''),
     'ml_full_remessa', auth.uid())
  returning id into v_mov;

  insert into public.ml_full_remessas
    (product_id, quantidade, origem_warehouse_id, enviado_por, observacao, movimento_id)
  values
    (p_product_id, p_quantidade, v_wh, auth.uid(), p_observacao, v_mov)
  returning id into v_remessa;

  return v_remessa;
end $$;

comment on function public.ml_full_remessa_registrar is
  'Registra remessa para o ML Full: DEDUZ do galpao de origem (padrao HUB-RN) e nao credita nada — quem credita e o proprio ML no espelho. A origem e parametro e nao constante: o estorno de pronta entrega tinha HUB-RN escrito no codigo e devolvia a Natal produto que estava na van do vendedor. Trava a linha (for update) antes de conferir saldo, senao duas remessas simultaneas passam as duas.';

revoke all on function public.ml_full_remessa_registrar(uuid, integer, text, text) from public, anon;
grant execute on function public.ml_full_remessa_registrar(uuid, integer, text, text) to authenticated;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 3 — receber: fecha o trânsito, credita NADA                     ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- ⚠️ Esta função NÃO mexe em estoque nenhum, de propósito. Quando o lote chega
-- ao ML, o número que sobe é o DELES, e ele chega aqui pelo espelho na próxima
-- rodada do `ml-estoque-full`. Creditar algo aqui criaria um segundo número
-- para a mesma prateleira — e o sync sobrescreveria o nosso, deixando a pessoa
-- vendo o valor mudar sozinho.

create or replace function public.ml_full_remessa_receber(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_status text;
begin
  if not public.carbo_e_time_interno() then
    raise exception 'Sem permissao.';
  end if;

  select status into v_status from public.ml_full_remessas where id = p_id;
  if v_status is null then raise exception 'Remessa nao encontrada.'; end if;
  if v_status <> 'em_transito' then
    raise exception 'Remessa ja esta como %.', v_status;
  end if;

  update public.ml_full_remessas
     set status = 'recebida', recebido_em = now(), recebido_por = auth.uid()
   where id = p_id;
end $$;

comment on function public.ml_full_remessa_receber is
  'Fecha o transito de uma remessa. NAO credita estoque nenhum: quando o lote chega, quem sobe e o numero do ML, e ele vem pelo espelho. Creditar aqui criaria um segundo numero para a mesma prateleira e o sync sobrescreveria o nosso.';

revoke all on function public.ml_full_remessa_receber(uuid) from public, anon;
grant execute on function public.ml_full_remessa_receber(uuid) to authenticated;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 4 — cancelar: devolve ao galpão DE ONDE SAIU                    ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- ⚠️ Devolve para `origem_warehouse_id`, o galpão gravado na linha — nunca
-- para um código presumido. E só vale para `em_transito`: remessa já recebida
-- foi consumida pelo ML e devolver aqui inventaria estoque.

create or replace function public.ml_full_remessa_cancelar(p_id uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare r record;
begin
  if not public.carbo_e_time_interno() then
    raise exception 'Sem permissao.';
  end if;

  select * into r from public.ml_full_remessas where id = p_id for update;
  if r.id is null then raise exception 'Remessa nao encontrada.'; end if;
  if r.status <> 'em_transito' then
    raise exception 'So da para cancelar remessa em transito. Esta esta como %.', r.status;
  end if;

  update public.warehouse_stock
     set quantity = quantity + r.quantidade
   where warehouse_id = r.origem_warehouse_id and product_id = r.product_id;

  insert into public.stock_movements
    (product_id, warehouse_id, tipo, quantidade, origem, observacoes, executor, created_by)
  values
    (r.product_id, r.origem_warehouse_id, 'entrada', r.quantidade, 'transferencia',
     'Cancelamento de remessa ML Full' || coalesce(' · ' || nullif(p_motivo, ''), ''),
     'ml_full_remessa', auth.uid());

  update public.ml_full_remessas
     set status = 'cancelada', cancelado_em = now(), cancelado_por = auth.uid(),
         motivo_cancelamento = p_motivo
   where id = p_id;
end $$;

comment on function public.ml_full_remessa_cancelar is
  'Cancela remessa EM TRANSITO e devolve ao galpao gravado em origem_warehouse_id — nunca a um codigo presumido. Remessa ja recebida nao cancela: o ML ja a consumiu e devolver aqui inventaria estoque.';

revoke all on function public.ml_full_remessa_cancelar(uuid, text) from public, anon;
grant execute on function public.ml_full_remessa_cancelar(uuid, text) to authenticated;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 5 — a tela passa a mostrar o trânsito                           ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- ⚠️ `create or replace view` só aceita coluna NOVA no FIM — por isso
-- `em_transito` entra por último, e a ordem das outras não muda.

create or replace view public.ml_estoque_full_tela
with (security_invoker = true) as
select
  e.item_id,
  nullif(e.variation_id, '')          as variation_id,
  e.seller_sku,
  e.title                             as titulo_anuncio,
  e.status,
  e.inventory_id,
  e.disponivel,
  e.nao_disponivel,
  m.product_id,
  p.product_code,
  p.name                              as produto,
  ws.quantity                         as saldo_loghouse,
  e.sincronizado_em,
  -- ⬅ NOVO. O que já saiu do nosso galpão e ainda não apareceu no ML.
  -- ⚠️ Sem esta coluna a tela mostra "pouco no Full" logo depois de uma
  -- remessa e leva alguém a mandar outro lote.
  coalesce((
    select sum(r.quantidade)::int
    from public.ml_full_remessas r
    where r.product_id = m.product_id and r.status = 'em_transito'
  ), 0)                               as em_transito
from public.ml_estoque_full e
left join public.sku_product_mappings m
       on m.platform_sku = e.seller_sku
      and (m.platform is null or m.platform = 'mercadolivre_full')
left join public.mrp_products p on p.id = m.product_id
left join public.warehouses w on w.code = 'HUB-SP'
left join public.warehouse_stock ws
       on ws.product_id = m.product_id and ws.warehouse_id = w.id
where e.logistic_type = 'fulfillment'
   or e.logistic_type is null;

comment on view public.ml_estoque_full_tela is
  'Estoque no Fulfillment do ML + o que esta EM TRANSITO para la. left join de proposito: anuncio sem mapa aparece com produto nulo, porque sem mapa e trabalho a fazer. ⚠️ em_transito nao e enfeite: o numero do ML so sobe dias depois da remessa, e sem essa coluna a tela mostra ruptura logo apos um envio e leva alguem a mandar outro lote.';

grant select on public.ml_estoque_full_tela to authenticated;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 6 — CONFERÊNCIA                                                 ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- (a) As três RPCs existem? Esperado: 3 linhas.
select p.oid::regprocedure as assinatura
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname like 'ml_full_remessa%'
order by 1;

-- (b) A view manteve o security_invoker e ganhou `em_transito`?
--     Esperado: {security_invoker=true} e a coluna presente.
select c.relname, c.reloptions,
       exists (select 1 from information_schema.columns
                where table_name = 'ml_estoque_full_tela' and column_name = 'em_transito')
         as tem_em_transito
from pg_class c where c.relname = 'ml_estoque_full_tela';

-- (c) ⚠️ TESTE de ponta a ponta, sem deixar rastro: registra 1 unidade, confere
--     que deduziu, cancela e confere que voltou.
--
--     ⚠️ ELE ASSUME A IDENTIDADE DE UM USUÁRIO INTERNO, e isso é obrigatório:
--     o SQL Editor roda como `postgres`, onde `auth.uid()` é NULO — e aí
--     `carbo_e_time_interno()` devolve false e a própria guarda da RPC barra
--     com "Sem permissao para registrar remessa".
--
--     A primeira versão deste teste não fazia isso e falhou na produção em
--     21/09/2026. O defeito era do TESTE, não da guarda: escrever um teste que
--     não roda no lugar onde ele vai ser rodado é o mesmo tipo de erro do
--     número de conferência que testa a aritmética de quem o escreveu.
--
--     `set local` vale só até o fim da transação do bloco — não deixa a sessão
--     impersonando ninguém depois.
--     Esperado: NOTICE "ok: ... Saldo intacto." Qualquer exception = NÃO use a
--     tela ainda.
do $$
declare
  v_prod uuid; v_wh uuid; v_antes int; v_depois int; v_fim int; v_rem uuid;
  v_user uuid;
begin
  -- Um usuário com ALGUMA interface interna — a mesma lista que a guarda usa.
  select p.id into v_user
  from public.profiles p
  where p.allowed_interfaces is not null
    and exists (
      select 1 from unnest(p.allowed_interfaces) x
      where lower(x) in ('carbo_admin','carbo_crm','carbo_ops','carbo_ops_app',
                         'carbo_financas','carbo_mkt','carbo_ti')
    )
  limit 1;

  if v_user is null then
    raise exception 'Nenhum usuario com interface interna — a guarda barraria qualquer teste.';
  end if;

  perform set_config('request.jwt.claims',
                     json_build_object('sub', v_user::text)::text, true);

  select w.id into v_wh from public.warehouses w where w.code = 'HUB-RN';
  select ws.product_id, ws.quantity into v_prod, v_antes
  from public.warehouse_stock ws
  where ws.warehouse_id = v_wh and ws.quantity > 0
  limit 1;

  if v_prod is null then
    raise notice 'PULADO: nenhum produto com saldo no HUB-RN para testar.';
    return;
  end if;

  v_rem := public.ml_full_remessa_registrar(v_prod, 1, 'HUB-RN', 'teste automatico');
  select quantity into v_depois from public.warehouse_stock
   where warehouse_id = v_wh and product_id = v_prod;
  if v_depois <> v_antes - 1 then
    raise exception 'A remessa NAO deduziu: antes %, depois %', v_antes, v_depois;
  end if;

  perform public.ml_full_remessa_cancelar(v_rem, 'teste automatico');
  select quantity into v_fim from public.warehouse_stock
   where warehouse_id = v_wh and product_id = v_prod;
  if v_fim <> v_antes then
    raise exception 'O cancelamento NAO devolveu: antes %, fim %', v_antes, v_fim;
  end if;

  raise notice 'ok: deduziu % -> % e devolveu -> %. Saldo intacto.', v_antes, v_depois, v_fim;
end $$;

-- (d) O que está em trânsito agora (deve vir vazio logo após o teste acima).
select p.product_code, p.name, sum(r.quantidade) as em_transito,
       min(r.enviado_em) as remessa_mais_antiga
from public.ml_full_remessas r
join public.mrp_products p on p.id = r.product_id
where r.status = 'em_transito'
group by 1, 2
order by 3 desc;
