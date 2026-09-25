-- ═══════════════════════════════════════════════════════════════════════════
-- Enviar estoque do Hub Natal para um LICENCIADO
--
-- Pedido do dono do processo em 25/09/2026: o botão "Registrar envio" do Ops
-- passa a oferecer os licenciados como destino, debitando do Hub Natal e
-- creditando o estoque deles.
--
-- ⚠️ REUSA `warehouses`, e não cria tabela nova. É a MESMA decisão das caixas
-- de vendedor (20260898), e pelo mesmo motivo: `warehouse_stock`,
-- `stock_movements` e `stock_transfers` já giram todos em torno de
-- `warehouse_id`, então o fluxo inteiro — saída, trânsito, aceite, estorno,
-- auditoria — já vem pronto. Uma tabela paralela seria um segundo mecanismo
-- de transferência para manter em dia com o primeiro.
--
-- ⚠️ O CRÉDITO É NO ACEITE, decidido pelo dono do processo. O envio sai de
-- Natal e fica EM TRÂNSITO; o licenciado só passa a contar o que recebeu
-- quando alguém dá o aceite, e fica registrado QUEM deu. Creditar na saída
-- faria o licenciado ver como disponível o que ainda está na estrada — e é o
-- saldo dele que autoriza executar descarbonização.
--
-- ⚠️ DUAS CASAS PARA O ESTOQUE DO LICENCIADO, e cada produto tem UMA só:
--
--     reagente          licenciados.reagent_stock      é o que a OS consome
--     demais produtos   public.warehouse_stock         por produto
--
-- Isto não é indecisão: `licenciados.register_service` debita `reagent_stock`,
-- e o /inventory deles lê de lá. Se o frasco de reagente entrasse em
-- `warehouse_stock`, a OS nunca o veria — o licenciado receberia carga e
-- continuaria "sem reagente". Creditar nos DOIS criaria o par que diverge, que
-- é pior. Por isso o aceite ROTEIA pelo produto, e a view do BLOCO 6 junta as
-- duas casas só para LEITURA.
-- ═══════════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 0 — medir antes de escrever                                     ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
--
-- ⚠️ (a) procura o VALOR, não o nome da coluna. Valor novo em `kind` pode
--     esbarrar em mais de um CHECK, e cada um falha num momento diferente —
--     a lição da plataforma nova que entrou em três CHECKs, não um.
select c.relname as tabela, con.conname, pg_get_constraintdef(con.oid) as definicao
from pg_constraint con
join pg_class c on c.oid = con.conrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and con.contype = 'c'
  and pg_get_constraintdef(con.oid) ilike '%vendedor%'
order by 1;

-- (b) quantos armazéns existem hoje, por tipo.
select kind, count(*) from public.warehouses group by 1 order by 1;

-- (c) as lojas que vão ganhar armazém. `is_internal` entra: a Carbox também
--     consome reagente e também é abastecida pela matriz.
select count(*) filter (where not coalesce(is_internal, false)) as licenciados,
       count(*) filter (where coalesce(is_internal, false))     as internas
from licenciados.lojas where active;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — o armazém do licenciado                                     ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

do $$
begin
  if exists (select 1 from pg_constraint where conname = 'warehouses_kind_check') then
    alter table public.warehouses drop constraint warehouses_kind_check;
  end if;
  alter table public.warehouses
    add constraint warehouses_kind_check check (kind in ('hub', 'vendedor', 'licenciado'));
end $$;

alter table public.warehouses
  add column if not exists licenciado_loja_id uuid;

comment on column public.warehouses.licenciado_loja_id is
  'Loja de licenciados.lojas que este armazém representa. Só preenchido quando kind = ''licenciado''.';

-- ⚠️ Único e PARCIAL: duas lojas não podem dividir o mesmo armazém, e o índice
-- não pode impedir os armazéns de hub, que têm a coluna nula.
create unique index if not exists warehouses_licenciado_loja_uidx
  on public.warehouses (licenciado_loja_id) where licenciado_loja_id is not null;

create index if not exists idx_warehouses_kind_licenciado
  on public.warehouses (kind) where kind = 'licenciado';


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — criar/achar o armazém de uma loja                           ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
--
-- Molde do `carbo_vendedor_caixa`: idempotente, devolve o id existente quando
-- já houver. ⚠️ O `code` é derivado do id (md5), não do NOME: nome de loja
-- muda, e código que muda quebra o histórico de movimentações que já aponta
-- para ele. Curto porque ele aparece em tela.

create or replace function public.carbo_licenciado_armazem(p_loja uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid; v_nome text; v_ativa boolean;
begin
  if p_loja is null then
    raise exception 'Loja não informada.';
  end if;

  select id into v_id
  from public.warehouses
  where licenciado_loja_id = p_loja;
  if v_id is not null then
    return v_id;
  end if;

  select l.name, l.active into v_nome, v_ativa
  from licenciados.lojas l where l.id = p_loja;
  if v_nome is null then
    raise exception 'Loja de licenciado não encontrada: %', p_loja;
  end if;

  insert into public.warehouses (code, name, kind, licenciado_loja_id, is_active)
  values ('LIC-' || upper(substr(md5(p_loja::text), 1, 6)),
          v_nome, 'licenciado', p_loja, coalesce(v_ativa, true))
  returning id into v_id;

  return v_id;
end $$;

comment on function public.carbo_licenciado_armazem(uuid) is
  'O armazém que representa a loja do licenciado. Cria na primeira chamada; idempotente.';

grant execute on function public.carbo_licenciado_armazem(uuid) to authenticated;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 3 — backfill: toda loja ATIVA ganha armazém                     ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
--
-- Sem isto o seletor de destino nasceria vazio e a tela pareceria quebrada.
select public.carbo_licenciado_armazem(l.id)
from licenciados.lojas l
where l.active
  and not exists (select 1 from public.warehouses w where w.licenciado_loja_id = l.id);

-- ⚠️ O nome do armazém segue o da loja. Sem isto, loja renomeada continuaria
-- aparecendo no seletor com o nome antigo — e quem envia escolheria pelo nome
-- errado sem erro nenhum.
update public.warehouses w
   set name = l.name, is_active = l.active
from licenciados.lojas l
where w.licenciado_loja_id = l.id
  and (w.name is distinct from l.name or w.is_active is distinct from l.active);


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 4 — a lista de estoques da tela                                 ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
--
-- ⚠️ `security_invoker = true` REPETIDO. `create or replace view` sem `WITH`
-- apaga as reloptions, e a view passaria a rodar como DONO, ignorando RLS —
-- com `grant to authenticated`, que inclui o portal de lojas e o de
-- licenciados, porque os três usam a MESMA tabela `profiles`.

create or replace view public.carbo_estoques
with (security_invoker = true) as
select
  w.id, w.code, w.name, w.kind, w.owner_id,
  w.licenciado_loja_id,
  p.full_name as dono_nome,
  coalesce(w.is_active, true) as ativo
from public.warehouses w
left join public.profiles p on p.id = w.owner_id
where coalesce(w.is_active, true);

comment on view public.carbo_estoques is
  'Estoques disponíveis como origem/destino de transferência: hubs, caixas de vendedor e licenciados ativos. ⚠️ security_invoker = true — repita a cláusula em toda republicação.';

grant select on public.carbo_estoques to authenticated;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 5 — o aceite: quem pode, e para ONDE o crédito vai              ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
--
-- Qual produto é o reagente é CADASTRO, não código: `licenciados.app_settings`,
-- chave `reagente_product_id`. Produto trocado entra com um UPDATE, sem deploy.
--
-- ⚠️ E a ausência dessa chave NÃO pode creditar no lugar errado. Sem ela, o
-- frasco de reagente cairia em `warehouse_stock` e a OS do licenciado nunca o
-- veria — ele receberia a carga e continuaria "sem reagente", sem erro nenhum.
-- Por isso o aceite RECUSA quando a chave falta e o produto é desconhecido
-- para o destino licenciado. Ausência FECHA.

insert into licenciados.app_settings (key, value)
select 'reagente_product_id', to_jsonb(p.id::text)
from public.mrp_products p
where p.product_code = 'VAPT70'
on conflict (key) do nothing;

create or replace function public.ops_transfer_confirm(p_transfer_id uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_to uuid; v_pid uuid; v_qty numeric; v_tonome text;
  v_kind text; v_owner uuid; v_loja uuid;
  v_reagente uuid; v_reagente_txt text;
begin
  select w.kind, w.owner_id, w.name, w.licenciado_loja_id
    into v_kind, v_owner, v_tonome, v_loja
  from public.stock_transfers t
  join public.warehouses w on w.id = t.to_hub
  where t.id = p_transfer_id;

  if v_kind is null then
    raise exception 'Envio não encontrado.';
  end if;

  if v_kind = 'vendedor'
     and v_owner is distinct from p_user
     and not public.is_manager_or_admin(p_user) then
    raise exception 'Só o dono da caixa (ou a gestão) pode aceitar este recebimento.'
      using errcode = 'insufficient_privilege';
  end if;

  -- ⚠️ Licenciado: aceita quem é DAQUELA loja, o admin do app dos licenciados,
  -- ou a gestão daqui. Não é "só a loja" pela mesma razão das caixas de
  -- vendedor — carga não pode ficar presa em trânsito porque a pessoa está
  -- sem sinal ou saiu. Quem confirmou fica em `executed_by`.
  if v_kind = 'licenciado'
     and not public.is_manager_or_admin(p_user)
     and coalesce(licenciados.current_user_loja(), '00000000-0000-0000-0000-000000000000'::uuid)
         is distinct from v_loja
     and not coalesce(licenciados.is_admin(), false) then
    raise exception 'Só o licenciado de destino (ou a gestão) pode aceitar este recebimento.'
      using errcode = 'insufficient_privilege';
  end if;

  -- ⚠️ A permissão é conferida ANTES do UPDATE: o flip approved→executed é
  -- condicional e irreversível, e recusar depois dele deixaria o envio marcado
  -- como entregue sem o crédito ter acontecido.
  update public.stock_transfers
     set status = 'executed', executed_by = p_user, executed_at = now()
   where id = p_transfer_id and status = 'approved'
  returning to_hub, product_id, quantity into v_to, v_pid, v_qty;

  if not found then
    raise exception 'Envio já confirmado ou cancelado.';
  end if;

  if v_kind = 'licenciado' then
    select nullif(value #>> '{}', '')::uuid into v_reagente
    from licenciados.app_settings where key = 'reagente_product_id';

    if v_reagente is null then
      select p.id into v_reagente from public.mrp_products p where p.product_code = 'VAPT70';
    end if;

    if v_reagente is null then
      raise exception
        'O produto do reagente não está configurado (licenciados.app_settings.reagente_product_id). '
        'Sem isso o aceite não sabe se o frasco vai para o estoque de reagente (que a OS consome) '
        'ou para o estoque por produto — e creditar no lugar errado some com a carga sem erro.';
    end if;
  end if;

  if v_kind = 'licenciado' and v_pid = v_reagente then
    -- O reagente tem UMA casa: a que a OS consome.
    insert into licenciados.reagent_stock (loja_id, quantity)
    values (v_loja, 0)
    on conflict (loja_id) do nothing;

    update licenciados.reagent_stock
       set quantity = quantity + v_qty
     where loja_id = v_loja;

    insert into licenciados.stock_movements
      (loja_id, movement_type, quantity_delta, created_by, notes)
    values
      (v_loja, 'restock', v_qty, p_user,
       format('Recebimento do Hub Natal — envio %s', p_transfer_id));
  else
    insert into public.warehouse_stock (warehouse_id, product_id, quantity)
    values (v_to, v_pid, v_qty)
    on conflict (warehouse_id, product_id)
    do update set quantity = public.warehouse_stock.quantity + v_qty, updated_at = now();
  end if;

  -- O movimento do NOSSO lado é gravado sempre, inclusive para o reagente: é
  -- ele que fecha a auditoria da saída de Natal com a chegada no destino.
  insert into public.stock_movements
    (product_id, warehouse_id, tipo, quantidade, origem, origem_id, observacoes, created_by)
  values
    (v_pid, v_to, 'entrada', v_qty, 'transferencia', p_transfer_id,
     format('[%s] chegada de transferência', coalesce(v_tonome, '?')), p_user);
end $$;

comment on function public.ops_transfer_confirm is
  'Aceita o recebimento e credita o destino. Caixa de vendedor: o DONO ou a gestão. Licenciado: a loja de destino, o admin do app de licenciados ou a gestão. ⚠️ No licenciado o crédito é ROTEADO: reagente vai para licenciados.reagent_stock (o que a OS consome) e os demais produtos para warehouse_stock. Ver 20261009000000.';

grant execute on function public.ops_transfer_confirm(uuid, uuid) to authenticated;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 6 — a leitura: as duas casas num lugar só                       ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
--
-- ⚠️ É VIEW, não tabela. Materializar isto criaria a terceira verdade sobre o
-- mesmo saldo. Ela existe só para a tela não ter de saber que há duas casas.

create or replace view public.carbo_licenciado_estoque
with (security_invoker = true) as
select
  w.licenciado_loja_id            as loja_id,
  w.id                            as warehouse_id,
  w.name                          as loja_nome,
  ws.product_id,
  pr.product_code,
  pr.name                         as produto,
  coalesce(pr.stock_unit, 'un')   as unidade,
  ws.quantity,
  false                           as e_reagente
from public.warehouses w
join public.warehouse_stock ws on ws.warehouse_id = w.id
left join public.mrp_products pr on pr.id = ws.product_id
where w.kind = 'licenciado'
union all
select
  rs.loja_id,
  w.id,
  w.name,
  pr.id,
  pr.product_code,
  coalesce(pr.name, 'Reagente'),
  'un',
  rs.quantity,
  true
from licenciados.reagent_stock rs
join public.warehouses w on w.licenciado_loja_id = rs.loja_id
left join public.mrp_products pr on pr.product_code = 'VAPT70';

comment on view public.carbo_licenciado_estoque is
  'Estoque do licenciado nas DUAS casas: warehouse_stock (por produto) e licenciados.reagent_stock (o reagente que a OS consome). Só leitura. ⚠️ security_invoker = true — repita a cláusula em toda republicação.';

grant select on public.carbo_licenciado_estoque to authenticated;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 7 — conferência                                                 ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- (a) ⚠️ As views com security_invoker. Nulo aqui é vazamento: elas rodariam
--     como dono, ignorando RLS, com grant para `authenticated`.
select relname, reloptions from pg_class
where relname in ('carbo_estoques', 'carbo_transferencias', 'carbo_licenciado_estoque');

-- (b) Os armazéns criados. ESPERADO: uma linha por loja ativa.
select kind, count(*) as quantos from public.carbo_estoques group by 1 order by 1;

-- (c) Loja ativa SEM armazém. ESPERADO: zero linhas.
select l.id, l.name
from licenciados.lojas l
where l.active
  and not exists (select 1 from public.warehouses w where w.licenciado_loja_id = l.id);

-- (d) O produto do reagente está cadastrado? ESPERADO: uma linha, com nome.
select s.value #>> '{}' as product_id, p.product_code, p.name
from licenciados.app_settings s
left join public.mrp_products p on p.id::text = s.value #>> '{}'
where s.key = 'reagente_product_id';


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 8 — a fila de recebimento DO LICENCIADO                         ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
--
-- ⚠️ Função PRÓPRIA, e não `grant select` em `carbo_transferencias`. Aquela
-- view é `security_invoker` sobre `stock_transfers` e `warehouses`, tabelas
-- NOSSAS: liberá-las mostraria ao licenciado toda a logística da Carbo —
-- envios para os CDs, para as caixas dos vendedores, quantidades e produtos.
-- É o mesmo furo da `bling2_esteira`, que o portal de lojas e o de licenciados
-- enxergariam por usarem a MESMA tabela `profiles`.
--
-- Roda como DONO (é assim que alcança as tabelas) e se guarda no PRÓPRIO
-- corpo: só a loja de quem chama, ou tudo para o admin do app deles e para a
-- gestão daqui. Molde da `carbo_usuarios_bloqueados`.

create or replace function public.carbo_licenciado_recebimentos(p_loja uuid default null)
returns table (
  id uuid, loja_id uuid, loja_nome text,
  produto text, product_code text, quantidade numeric, unidade text,
  origem text, enviado_em timestamptz, registrado_por text, observacao text
)
language plpgsql stable security definer set search_path = public as $$
declare
  v_minha uuid := licenciados.current_user_loja();
  v_manda boolean := coalesce(licenciados.is_admin(), false)
                     or public.is_manager_or_admin(auth.uid());
  v_alvo uuid;
begin
  -- ⚠️ Quem NÃO manda só enxerga a própria loja, mesmo pedindo outra. Confiar
  -- no parâmetro seria deixar o escopo na mão do chamador — e o chamador é o
  -- navegador de outra empresa.
  v_alvo := case when v_manda then p_loja else v_minha end;

  if v_alvo is null and not v_manda then
    return;  -- sem loja e sem mando: lista vazia, nunca a fila inteira
  end if;

  return query
  select t.id,
         w.licenciado_loja_id,
         w.name,
         coalesce(pr.name, t.product_code, 'Produto'),
         t.product_code,
         t.quantity,
         coalesce(pr.stock_unit, 'un'),
         wf.name,
         t.created_at,
         pa.full_name,
         t.notes
  from public.stock_transfers t
  join public.warehouses w   on w.id = t.to_hub and w.kind = 'licenciado'
  join public.warehouses wf  on wf.id = t.from_hub
  left join public.mrp_products pr on pr.id = t.product_id
  left join public.profiles pa on pa.id = t.approved_by
  where t.status = 'approved'
    and (v_alvo is null or w.licenciado_loja_id = v_alvo)
  order by t.created_at;
end $$;

comment on function public.carbo_licenciado_recebimentos(uuid) is
  'Envios do Hub Natal ainda NÃO aceitos, para o app dos licenciados. Roda como dono e se guarda no próprio corpo: a loja de quem chama, ou todas para o admin de licenciados e a gestão. ⚠️ Não substituir por grant em carbo_transferencias — aquela view expõe a logística inteira da Carbo.';

grant execute on function public.carbo_licenciado_recebimentos(uuid) to authenticated;

-- (e) ESPERADO: zero linhas hoje (nenhum envio para licenciado foi feito
--     ainda). Encher é o sinal de que a tela do Ops está sendo usada.
select count(*) as recebimentos_pendentes
from public.stock_transfers t
join public.warehouses w on w.id = t.to_hub
where w.kind = 'licenciado' and t.status = 'approved';


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 9 — o estoque POR PRODUTO do licenciado, para a tela dele       ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
--
-- ⚠️ "Importar o dado não o coloca na tela." Sem isto, tudo o que não é
-- reagente chega ao licenciado, entra em `warehouse_stock` e fica INVISÍVEL
-- para ele — recebeu a carga e a tela continua mostrando só frascos. É o
-- mesmo defeito da migração que gravou endereço em 70 PDVs e a tela seguiu
-- mostrando cidade/UF.
--
-- Mesma guarda da função anterior, pelo mesmo motivo: `warehouse_stock` é
-- nossa e tem o saldo de todos os galpões.

create or replace function public.carbo_licenciado_estoque_meu(p_loja uuid default null)
returns table (
  loja_id uuid, loja_nome text, product_id uuid, product_code text,
  produto text, unidade text, quantidade numeric
)
language plpgsql stable security definer set search_path = public as $$
declare
  v_minha uuid := licenciados.current_user_loja();
  v_manda boolean := coalesce(licenciados.is_admin(), false)
                     or public.is_manager_or_admin(auth.uid());
  v_alvo uuid;
begin
  v_alvo := case when v_manda then p_loja else v_minha end;
  if v_alvo is null and not v_manda then
    return;
  end if;

  return query
  select w.licenciado_loja_id, w.name, ws.product_id, pr.product_code,
         coalesce(pr.name, 'Produto'), coalesce(pr.stock_unit, 'un'), ws.quantity
  from public.warehouses w
  join public.warehouse_stock ws on ws.warehouse_id = w.id
  left join public.mrp_products pr on pr.id = ws.product_id
  where w.kind = 'licenciado'
    and (v_alvo is null or w.licenciado_loja_id = v_alvo)
    -- ⚠️ Saldo zerado FICA: some da tela e ninguém descobre que o produto já
    -- existiu ali. Quem some é só o que nunca chegou.
    and ws.quantity is not null
  order by w.name, coalesce(pr.name, '');
end $$;

comment on function public.carbo_licenciado_estoque_meu(uuid) is
  'Estoque POR PRODUTO do licenciado (o que não é reagente). Roda como dono e se guarda no corpo. O reagente NÃO entra aqui: a casa dele é licenciados.reagent_stock, que é o que a OS consome.';

grant execute on function public.carbo_licenciado_estoque_meu(uuid) to authenticated;
