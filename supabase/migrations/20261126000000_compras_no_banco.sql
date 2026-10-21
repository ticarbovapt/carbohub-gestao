-- ═══════════════════════════════════════════════════════════════════════════
-- COMPRAS NO BANCO — a regra mora no Postgres, não no navegador (21/10/2026)
--
-- Pedido do dono do processo: *"já era pra ser banco, não fez sentido ser
-- avulso em código"*, e *"pronto para escala — mil, dez mil, cem mil — sem
-- retrabalho"*. Medido antes (mapa do fluxo, 21/10):
--
--   • numeração RC/OC = MAX(...)+1 num gatilho, sem trava e sem índice único:
--     duas gravações juntas pegam o MESMO número; e `lpad(n, 5)` TRUNCA a
--     partir de 100.000 (vira '10000' de novo) — o teto de escala virava número
--     repetido, calado.
--   • aprovar, gerar OC, registrar compra, receber e lançar NF eram `update`/
--     `insert` soltos do navegador: sem alçada, sem atomicidade (gerar 3 OCs e
--     cair na 2ª deixava a RC "convertida" com 1 OC), e qualquer interno podia
--     mudar qualquer RC/OC pela API — "gestor não aprova a própria RC" só existia
--     na TELA.
--   • "Já foi paga" na OC não registrava a SAÍDA do dinheiro em lugar nenhum.
--   • NF gerava UMA conta a pagar, mesmo parcelada.
--   • `purchase_approval_config` (as alçadas) não era lida por ninguém.
--
-- O desenho:
--   1. NUMERAÇÃO por CONTADOR (`carbo_numeracao`): uma linha por série/ano,
--      incrementada com trava de linha — custo constante, sem MAX, sem corrida.
--      E índice ÚNICO em rc_number/oc_number: número repetido vira ERRO.
--   2. A REGRA DE TRANSIÇÃO mora num GATILHO, não só nas funções: vale para
--      qualquer caminho (Finanças, o app antigo da raiz, a API). Cron/service
--      role (sem usuário) passa — é o espelho do Bling.
--   3. As operações de VÁRIOS passos são funções ATÔMICAS (`fin_*`): ou tudo,
--      ou nada. O que só pode acontecer por elas (converter RC, comprar,
--      receber, criar OC/recebimento/NF/conta) é recusado fora delas.
--   4. ALÇADA é CADASTRO (`fin_compras_alcada`): nasce com UMA faixa "qualquer
--      gestor, sem teto" — exatamente o comportamento de hoje. Faixa nova é um
--      INSERT, sem deploy.
--
-- ⚠️ RODE EM BLOCOS, um de cada vez. O BLOCO 0 só lê.
-- ═══════════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 0 — MEDIR (só leitura)                                           ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- ESPERADO: rc_duplicados = 0 e oc_duplicados = 0. Diferente de zero = já há
-- número repetido; o BLOCO 1 NÃO cria o índice único (avisa) e eu preciso da
-- lista antes de seguir.
select
  (select count(*) from (select rc_number from public.purchase_requests group by 1 having count(*) > 1) x) as rc_duplicados,
  (select count(*) from (select oc_number from public.purchase_orders   group by 1 having count(*) > 1) x) as oc_duplicados,
  (select max(rc_number) from public.purchase_requests) as ultimo_rc,
  (select max(oc_number) from public.purchase_orders where oc_number like 'OC-%') as ultimo_oc,
  (select count(*) from public.purchase_requests where status::text = 'aguardando_aprovacao') as rc_aguardando,
  (select count(*) from public.purchase_orders where status::text in ('gerada','comprada','enviada_fornecedor','parcialmente_recebida')) as oc_em_andamento;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — numeração por contador + índices únicos + colunas            ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

create table if not exists public.carbo_numeracao (
  chave      text primary key,          -- 'RC-2026', 'OC-2026'…
  ultimo     bigint not null,
  atualizado timestamptz not null default now()
);
alter table public.carbo_numeracao enable row level security;
-- Sem policy: só funções (definer) e o service role mexem.

-- Próximo número da série, com trava de LINHA (o upsert serializa quem disputa
-- a mesma chave). Custo constante: não lê a tabela de RC/OC.
create or replace function public.carbo_numero_proximo(p_chave text)
returns bigint
language sql
volatile
security definer
set search_path = public
as $$
  insert into public.carbo_numeracao as n (chave, ultimo) values (p_chave, 1)
  on conflict (chave) do update set ultimo = n.ultimo + 1, atualizado = now()
  returning n.ultimo;
$$;
revoke execute on function public.carbo_numero_proximo(text) from anon, public, authenticated;

-- Semente: o ano corrente começa do maior número que já existe.
insert into public.carbo_numeracao (chave, ultimo)
select 'RC-' || y, coalesce(max(substring(rc_number from 'RC-\d{4}-(\d+)')::bigint), 0)
  from (select to_char(now() at time zone 'America/Sao_Paulo', 'YYYY') as y) a
  left join public.purchase_requests r on r.rc_number like 'RC-' || a.y || '-%'
 group by y
on conflict (chave) do update set ultimo = greatest(public.carbo_numeracao.ultimo, excluded.ultimo);

insert into public.carbo_numeracao (chave, ultimo)
select 'OC-' || y, coalesce(max(substring(oc_number from 'OC-\d{4}-(\d+)')::bigint), 0)
  from (select to_char(now() at time zone 'America/Sao_Paulo', 'YYYY') as y) a
  left join public.purchase_orders o on o.oc_number like 'OC-' || a.y || '-%'
 group by y
on conflict (chave) do update set ultimo = greatest(public.carbo_numeracao.ultimo, excluded.ultimo);

-- ⚠️ `lpad` com largura MÍNIMA de 5, nunca fixa: `lpad('123456', 5)` corta.
create or replace function public.generate_rc_number()
returns trigger language plpgsql security definer set search_path = public as $$
declare y text := to_char(now() at time zone 'America/Sao_Paulo', 'YYYY'); n bigint;
begin
  n := public.carbo_numero_proximo('RC-' || y);
  new.rc_number := 'RC-' || y || '-' || lpad(n::text, greatest(5, length(n::text)), '0');
  return new;
end $$;

-- OC: respeita número já dado (o espelho do Bling grava 'BLING-<n>').
create or replace function public.generate_oc_number()
returns trigger language plpgsql security definer set search_path = public as $$
declare y text := to_char(now() at time zone 'America/Sao_Paulo', 'YYYY'); n bigint;
begin
  if new.oc_number is not null and new.oc_number <> 'TEMP' then return new; end if;
  n := public.carbo_numero_proximo('OC-' || y);
  new.oc_number := 'OC-' || y || '-' || lpad(n::text, greatest(5, length(n::text)), '0');
  return new;
end $$;

do $$ begin
  create unique index if not exists purchase_requests_rc_number_uq on public.purchase_requests (rc_number);
exception when unique_violation then
  raise notice 'rc_number tem duplicado — índice único NÃO criado. Rode o BLOCO 0 e me mande.';
end $$;
do $$ begin
  create unique index if not exists purchase_orders_oc_number_uq on public.purchase_orders (oc_number);
exception when unique_violation then
  raise notice 'oc_number tem duplicado — índice único NÃO criado. Rode o BLOCO 0 e me mande.';
end $$;

-- A mesma NF não entra duas vezes na mesma OC.
do $$ begin
  create unique index if not exists purchase_invoices_oc_numero_uq
    on public.purchase_invoices (purchase_order_id, lower(btrim(invoice_number)));
exception when unique_violation then
  raise notice 'há NF repetida numa mesma OC — índice NÃO criado.';
end $$;

-- Parcelas na conta a pagar (a NF parcelada vira N títulos).
alter table public.purchase_payables add column if not exists parcela int;
alter table public.purchase_payables add column if not exists parcelas_total int;

-- Índices para as filas e para os joins das funções (escala).
create index if not exists purchase_orders_rc_idx        on public.purchase_orders (purchase_request_id);
create index if not exists purchase_orders_status_idx    on public.purchase_orders (status);
create index if not exists purchase_receivings_oc_idx    on public.purchase_receivings (purchase_order_id, received_at);
create index if not exists purchase_invoices_oc_idx      on public.purchase_invoices (purchase_order_id);
create index if not exists purchase_payables_oc_idx      on public.purchase_payables (purchase_order_id);
create index if not exists purchase_payables_invoice_idx on public.purchase_payables (invoice_id);
create index if not exists purchase_requests_status_idx  on public.purchase_requests (status);

-- Espera: "Success. No rows returned" (e, se houver duplicado, a NOTICE dizendo qual índice não nasceu).


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — alçada (cadastro) e quem pode aprovar                        ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

create table if not exists public.fin_compras_alcada (
  id         uuid primary key default gen_random_uuid(),
  ate_valor  numeric(14,2),             -- null = sem teto
  quem       text not null check (quem in ('gestor','ceo')),
  ativo      boolean not null default true,
  atualizado_em timestamptz not null default now()
);
alter table public.fin_compras_alcada enable row level security;
drop policy if exists fin_compras_alcada_le on public.fin_compras_alcada;
create policy fin_compras_alcada_le on public.fin_compras_alcada
  for select to authenticated using ((select public.carbo_e_time_interno()));
grant select on public.fin_compras_alcada to authenticated;

-- Nasce igual a hoje: qualquer gestor aprova qualquer valor.
insert into public.fin_compras_alcada (ate_valor, quem)
select null, 'gestor' where not exists (select 1 from public.fin_compras_alcada);

-- A faixa é a MENOR que cobre o valor. Admin passa sempre; CEO passa em toda
-- faixa; 'gestor' = gestor de função (o mesmo `isGestor` das telas) ou CEO.
create or replace function public.fin_pode_aprovar_compra(p_uid uuid, p_valor numeric)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_uid is null then false
    when public.has_role(p_uid, 'admin') then true
    else coalesce((
      select case a.quem
               when 'ceo' then public.is_ceo(p_uid)
               else (public.carbo_is_gestor(p_uid) or public.is_ceo(p_uid))
             end
        from public.fin_compras_alcada a
       where a.ativo and (a.ate_valor is null or a.ate_valor >= coalesce(p_valor, 0))
       order by a.ate_valor nulls last
       limit 1), false)
  end;
$$;
revoke execute on function public.fin_pode_aprovar_compra(uuid, numeric) from anon, public;
grant execute on function public.fin_pode_aprovar_compra(uuid, numeric) to authenticated, service_role;

-- Espera: "Success. No rows returned".


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 3 — os GATILHOS: a regra vale para qualquer caminho              ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- ⚠️ Sem usuário (cron, service role, SQL Editor) passa: é o espelho do Bling
-- e a manutenção. O "via função" é um ajuste LOCAL da transação, ligado só
-- dentro das `fin_*` — cada pedido do PostgREST é uma transação própria, então
-- ninguém o liga de fora.

create or replace function public.fin_compras_via_funcao() returns boolean
language sql stable as $$ select coalesce(current_setting('carbo.compras_rpc', true), '') = 'on' $$;

create or replace function public.fin_rc_guarda()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  de text := old.status::text;
  pa text := new.status::text;
begin
  if v_uid is null then return new; end if;

  if de in ('aprovada','convertida','rejeitada','cancelada')
     and (new.items is distinct from old.items or new.estimated_value is distinct from old.estimated_value) then
    raise exception 'A requisição % já foi %: itens e valor não mudam mais.', old.rc_number, de using errcode = '42501';
  end if;

  if pa is not distinct from de then return new; end if;

  if not (
       (de = 'rascunho'             and pa in ('aguardando_aprovacao','cancelada'))
    or (de = 'aguardando_aprovacao' and pa in ('aprovada','rejeitada','cancelada'))
    or (de = 'rejeitada'            and pa in ('cancelada'))
    or (de = 'aprovada'             and pa in ('convertida','cancelada'))
  ) then
    raise exception 'Requisição %: não dá para ir de "%" para "%".', old.rc_number, de, pa using errcode = '42501';
  end if;

  if pa in ('aprovada','rejeitada') or (de = 'aprovada' and pa = 'cancelada') then
    if v_uid = old.requested_by or v_uid = old.created_by then
      raise exception 'Quem pediu (ou registrou) a requisição % não pode aprová-la nem rejeitá-la.', old.rc_number using errcode = '42501';
    end if;
    if not public.fin_pode_aprovar_compra(v_uid, old.estimated_value) then
      raise exception 'A alçada da requisição % (R$ %) não permite que você a decida.', old.rc_number, old.estimated_value using errcode = '42501';
    end if;
    if pa in ('aprovada','rejeitada') then
      new.approved_by := v_uid;
      new.approved_at := now();
    end if;
  end if;

  if pa = 'aguardando_aprovacao' then new.submitted_at := coalesce(new.submitted_at, now()); end if;

  if pa = 'convertida' and not public.fin_compras_via_funcao() then
    raise exception 'A requisição % vira "convertida" só ao gerar a(s) OC(s).', old.rc_number using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists trg_fin_rc_guarda on public.purchase_requests;
create trigger trg_fin_rc_guarda before update on public.purchase_requests
  for each row execute function public.fin_rc_guarda();

-- RC nova de usuário nasce rascunho ou aguardando — nunca já aprovada.
create or replace function public.fin_rc_nasce()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;
  if new.status::text not in ('rascunho','aguardando_aprovacao') then
    raise exception 'Requisição nova nasce em rascunho ou aguardando aprovação.' using errcode = '42501';
  end if;
  if new.status::text = 'aguardando_aprovacao' then new.submitted_at := coalesce(new.submitted_at, now()); end if;
  new.approved_by := null; new.approved_at := null;
  return new;
end $$;
drop trigger if exists trg_fin_rc_nasce on public.purchase_requests;
create trigger trg_fin_rc_nasce before insert on public.purchase_requests
  for each row execute function public.fin_rc_nasce();

create or replace function public.fin_oc_guarda()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  de text; pa text;
begin
  if v_uid is null then return new; end if;
  if tg_op = 'INSERT' then
    if not public.fin_compras_via_funcao() then
      raise exception 'Ordem de compra nasce só pela função de gerar OC.' using errcode = '42501';
    end if;
    return new;
  end if;
  if old.source is distinct from 'interno' then return new; end if;   -- espelho do Bling

  de := old.status::text; pa := new.status::text;
  if (new.items is distinct from old.items or new.total_value is distinct from old.total_value
      or new.supplier_name is distinct from old.supplier_name)
     and not public.fin_compras_via_funcao() then
    raise exception 'A OC % não é editável: itens, valor e fornecedor ficam como foram gerados.', old.oc_number using errcode = '42501';
  end if;
  if pa is not distinct from de then return new; end if;

  if not (
       (de = 'gerada'                and pa in ('comprada','enviada_fornecedor','cancelada'))
    or (de = 'enviada_fornecedor'    and pa in ('comprada','parcialmente_recebida','recebida','cancelada'))
    or (de = 'comprada'              and pa in ('parcialmente_recebida','recebida','cancelada'))
    or (de = 'parcialmente_recebida' and pa in ('recebida'))
  ) then
    raise exception 'OC %: não dá para ir de "%" para "%".', old.oc_number, de, pa using errcode = '42501';
  end if;
  if pa in ('comprada','parcialmente_recebida','recebida','cancelada') and not public.fin_compras_via_funcao() then
    raise exception 'OC %: "%" só pelas ações da tela de compras (registrar compra, receber, cancelar).', old.oc_number, pa using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists trg_fin_oc_guarda on public.purchase_orders;
create trigger trg_fin_oc_guarda before insert or update on public.purchase_orders
  for each row execute function public.fin_oc_guarda();

-- Recebimento, NF e conta a pagar nascem só pelas funções.
create or replace function public.fin_so_via_funcao()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.fin_compras_via_funcao() then return new; end if;
  raise exception '% nasce só pelas ações da tela (receber, lançar NF, nova conta a pagar).', tg_table_name using errcode = '42501';
end $$;
drop trigger if exists trg_fin_receb_via_funcao on public.purchase_receivings;
create trigger trg_fin_receb_via_funcao before insert on public.purchase_receivings
  for each row execute function public.fin_so_via_funcao();
drop trigger if exists trg_fin_nf_via_funcao on public.purchase_invoices;
create trigger trg_fin_nf_via_funcao before insert on public.purchase_invoices
  for each row execute function public.fin_so_via_funcao();
drop trigger if exists trg_fin_pagar_via_funcao on public.purchase_payables;
create trigger trg_fin_pagar_via_funcao before insert on public.purchase_payables
  for each row execute function public.fin_so_via_funcao();

-- Cotação só muda enquanto a RC está em rascunho ou aguardando.
create or replace function public.fin_cotacao_guarda()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_rc uuid; v_st text;
begin
  if auth.uid() is null then return coalesce(new, old); end if;
  v_rc := coalesce(new.request_id, old.request_id);
  select status::text into v_st from public.purchase_requests where id = v_rc;
  if v_st is not null and v_st not in ('rascunho','aguardando_aprovacao') then
    raise exception 'A requisição já foi %: as cotações ficam travadas.', v_st using errcode = '42501';
  end if;
  return coalesce(new, old);
end $$;
drop trigger if exists trg_fin_cotacao_guarda on public.purchase_quotes;
create trigger trg_fin_cotacao_guarda before insert or update or delete on public.purchase_quotes
  for each row execute function public.fin_cotacao_guarda();

-- Espera: "Success. No rows returned".


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 4 — as funções da tela (atômicas)                                ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

create or replace function public.fin_compras_exige_app() returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null or not public.carbo_tem_app(array['carbo_financas']) then
    raise exception 'Compras são do app Finanças: você não tem acesso.' using errcode = '42501';
  end if;
end $$;

-- ── Requisição ──────────────────────────────────────────────────────────────
create or replace function public.fin_rc_enviar(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  select * into r from public.purchase_requests where id = p_id for update;
  if not found then raise exception 'Requisição não encontrada.'; end if;
  if auth.uid() is distinct from r.requested_by and auth.uid() is distinct from r.created_by then
    perform public.fin_compras_exige_app();
  end if;
  if r.status::text <> 'rascunho' then raise exception 'A requisição % não está em rascunho (está "%").', r.rc_number, r.status; end if;
  update public.purchase_requests set status = 'aguardando_aprovacao', submitted_at = now() where id = p_id;
end $$;

create or replace function public.fin_rc_decidir(p_id uuid, p_aprovar boolean, p_motivo text default null) returns void
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  perform public.fin_compras_exige_app();
  select * into r from public.purchase_requests where id = p_id for update;
  if not found then raise exception 'Requisição não encontrada.'; end if;
  if r.status::text <> 'aguardando_aprovacao' then
    raise exception 'A requisição % não está aguardando aprovação (está "%"). Recarregue.', r.rc_number, r.status;
  end if;
  if not p_aprovar and nullif(btrim(coalesce(p_motivo, '')), '') is null then
    raise exception 'Para rejeitar, diga o motivo.';
  end if;
  update public.purchase_requests
     set status = case when p_aprovar then 'aprovada' else 'rejeitada' end::purchase_request_status,
         rejection_reason = case when p_aprovar then null else btrim(p_motivo) end
   where id = p_id;     -- o gatilho confere alçada e "não a própria", e carimba quem/quando
end $$;

create or replace function public.fin_rc_cancelar(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  select * into r from public.purchase_requests where id = p_id for update;
  if not found then raise exception 'Requisição não encontrada.'; end if;
  if auth.uid() is distinct from r.requested_by and auth.uid() is distinct from r.created_by then
    perform public.fin_compras_exige_app();
  end if;
  if r.status::text not in ('rascunho','aguardando_aprovacao','rejeitada') then
    raise exception 'Só dá para cancelar requisição em rascunho, aguardando ou rejeitada (esta está "%").', r.status;
  end if;
  update public.purchase_requests set status = 'cancelada' where id = p_id;
end $$;

-- Escolher (ou desmarcar) a cotação vencedora de UM item: desmarca as outras e marca esta, junto.
create or replace function public.fin_cotacao_escolher(p_quote_id uuid, p_selecionar boolean default true) returns void
language plpgsql security definer set search_path = public as $$
declare q record;
begin
  perform public.fin_compras_exige_app();
  select * into q from public.purchase_quotes where id = p_quote_id;
  if not found then raise exception 'Cotação não encontrada.'; end if;
  perform 1 from public.purchase_requests where id = q.request_id for update;
  update public.purchase_quotes set selected = (p_selecionar and id = p_quote_id)
   where request_id = q.request_id and item_index = q.item_index
     and selected is distinct from (p_selecionar and id = p_quote_id);
end $$;

-- ── Gerar a(s) OC(s) da RC aprovada — TODAS ou nenhuma ──────────────────────
-- p_grupos: [{supplier_name, supplier_id, itens: [{descricao, quantidade, unidade, valor_unitario}]}]
-- ⚠️ O total é CALCULADO aqui, a partir dos itens — o navegador não manda número.
create or replace function public.fin_oc_gerar(p_rc_id uuid, p_grupos jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r record; g jsonb; v_total numeric; v_id uuid; v_num text; v_out jsonb := '[]'::jsonb;
begin
  perform public.fin_compras_exige_app();
  select * into r from public.purchase_requests where id = p_rc_id for update;
  if not found then raise exception 'Requisição não encontrada.'; end if;
  if r.status::text <> 'aprovada' then raise exception 'Só RC aprovada gera OC (a % está "%").', r.rc_number, r.status; end if;
  if jsonb_typeof(p_grupos) <> 'array' or jsonb_array_length(p_grupos) = 0 then raise exception 'Nenhuma OC para gerar.'; end if;

  perform set_config('carbo.compras_rpc', 'on', true);
  for g in select * from jsonb_array_elements(p_grupos) loop
    if jsonb_typeof(g->'itens') <> 'array' or jsonb_array_length(g->'itens') = 0 then
      raise exception 'Fornecedor "%" sem itens.', g->>'supplier_name';
    end if;
    select round(sum(coalesce((i->>'quantidade')::numeric, 0) * coalesce((i->>'valor_unitario')::numeric, 0)), 2)
      into v_total from jsonb_array_elements(g->'itens') i;
    if exists (select 1 from jsonb_array_elements(g->'itens') i
                where coalesce((i->>'quantidade')::numeric, 0) <= 0 or coalesce((i->>'valor_unitario')::numeric, -1) < 0) then
      raise exception 'Item com quantidade ou preço inválido na OC de "%".', g->>'supplier_name';
    end if;
    insert into public.purchase_orders
      (oc_number, purchase_request_id, service_order_id, supplier_name, supplier_id,
       items, total_value, expected_delivery, generated_by, status, source)
    values
      ('TEMP', r.id, r.service_order_id, coalesce(nullif(btrim(g->>'supplier_name'), ''), 'A definir'),
       nullif(g->>'supplier_id', '')::uuid, g->'itens', coalesce(v_total, 0), r.needed_by, auth.uid(), 'gerada', 'interno')
    returning id, oc_number into v_id, v_num;
    v_out := v_out || jsonb_build_object('id', v_id, 'oc_number', v_num, 'total', v_total);
  end loop;
  update public.purchase_requests set status = 'convertida' where id = r.id;
  return v_out;
end $$;

-- ── Registrar a compra (e, se já foi paga, a SAÍDA do dinheiro) ─────────────
create or replace function public.fin_oc_registrar_compra(
  p_oc_id uuid, p_payment_method_id uuid, p_payment_type text,
  p_pago boolean, p_vencimento date default null, p_pago_em date default null
) returns void
language plpgsql security definer set search_path = public as $$
declare o record; v_dia date := coalesce(p_pago_em, (now() at time zone 'America/Sao_Paulo')::date);
begin
  perform public.fin_compras_exige_app();
  select * into o from public.purchase_orders where id = p_oc_id for update;
  if not found then raise exception 'OC não encontrada.'; end if;
  if o.status::text not in ('gerada','enviada_fornecedor') then
    raise exception 'A OC % já está "%".', o.oc_number, o.status;
  end if;
  if p_pago and p_payment_method_id is null and nullif(btrim(coalesce(p_payment_type, '')), '') is null then
    raise exception 'Diga como foi pago.';
  end if;
  if not p_pago and p_vencimento is null then raise exception 'Diga a previsão de vencimento.'; end if;

  perform set_config('carbo.compras_rpc', 'on', true);
  update public.purchase_orders
     set status = 'comprada', purchased_at = now(),
         payment_method_id = case when p_pago then p_payment_method_id end,
         payment_type      = case when p_pago and p_payment_method_id is null then btrim(p_payment_type) end,
         is_paid = p_pago,
         paid_at = case when p_pago then (v_dia::text || ' 12:00')::timestamp at time zone 'America/Sao_Paulo' end,
         payment_due_date = case when p_pago then null else p_vencimento end
   where id = o.id;

  if p_pago then
    -- A saída de dinheiro vira título PAGO: o fluxo de caixa, o painel e a
    -- conciliação passam a enxergá-la.
    insert into public.purchase_payables
      (purchase_order_id, supplier_name, supplier_id, amount, due_date, status, paid_at, paid_by,
       notes, source, parcela, parcelas_total, currency)
    values
      (o.id, o.supplier_name, o.supplier_id, o.total_value, v_dia, 'pago',
       (v_dia::text || ' 12:00')::timestamp at time zone 'America/Sao_Paulo', auth.uid(),
       'Pago na compra — ' || o.oc_number, 'interno', 1, 1, coalesce(o.currency, 'BRL'));
  end if;
end $$;

-- ── Cancelar a OC ───────────────────────────────────────────────────────────
create or replace function public.fin_oc_cancelar(p_oc_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare o record;
begin
  perform public.fin_compras_exige_app();
  select * into o from public.purchase_orders where id = p_oc_id for update;
  if not found then raise exception 'OC não encontrada.'; end if;
  if o.status::text not in ('gerada','enviada_fornecedor','comprada') then
    raise exception 'A OC % está "%" e não pode ser cancelada.', o.oc_number, o.status;
  end if;
  if o.status::text = 'comprada' and not (public.carbo_is_gestor(auth.uid()) or public.has_role(auth.uid(), 'admin')) then
    raise exception 'OC já comprada: só gestor cancela.';
  end if;
  if exists (select 1 from public.purchase_receivings where purchase_order_id = o.id) then
    raise exception 'A OC % já teve recebimento: não pode ser cancelada.', o.oc_number;
  end if;
  if exists (select 1 from public.purchase_payables where purchase_order_id = o.id and status::text = 'pago') then
    raise exception 'A OC % tem pagamento registrado: estorne o pagamento na conta a pagar antes.', o.oc_number;
  end if;
  perform set_config('carbo.compras_rpc', 'on', true);
  update public.purchase_payables set status = 'cancelado'
   where purchase_order_id = o.id and status::text in ('programado','atrasado');
  update public.purchase_orders set status = 'cancelada' where id = o.id;
end $$;

-- ── Receber contra a OC (o SALDO é calculado aqui) ──────────────────────────
-- p_itens: [{qtd_recebida, status_qualidade}] NA ORDEM dos itens da OC.
create or replace function public.fin_recebimento_registrar(p_oc_id uuid, p_itens jsonb, p_observacao text default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  o record; it jsonb; idx int; v_ja numeric; v_saldo numeric; v_rec numeric; v_q text;
  v_lista jsonb := '[]'::jsonb; v_div boolean := false; v_tudo boolean := true; v_id uuid;
begin
  perform public.fin_compras_exige_app();
  select * into o from public.purchase_orders where id = p_oc_id for update;
  if not found then raise exception 'OC não encontrada.'; end if;
  if o.status::text not in ('comprada','enviada_fornecedor','parcialmente_recebida') then
    raise exception 'A OC % está "%": não há o que receber.', o.oc_number, o.status;
  end if;
  if jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) <> jsonb_array_length(coalesce(o.items, '[]'::jsonb)) then
    raise exception 'O recebimento tem de trazer uma linha por item da OC.';
  end if;

  for idx in 0 .. jsonb_array_length(o.items) - 1 loop
    it := o.items -> idx;
    -- Já recebido (aceito) deste item: mesma régua da tela — posição, senão descrição; rejeitado não conta.
    select coalesce(sum((x->>'qtd_recebida')::numeric), 0) into v_ja
      from public.purchase_receivings rv,
           lateral (select coalesce(
                      case when rv.items_received -> idx ->> 'descricao' = it->>'descricao' then rv.items_received -> idx end,
                      (select y from jsonb_array_elements(rv.items_received) y where y->>'descricao' = it->>'descricao' limit 1),
                      rv.items_received -> idx) as x) z
     where rv.purchase_order_id = o.id and coalesce(z.x->>'status_qualidade', 'ok') <> 'rejeitado';
    v_saldo := greatest(0, coalesce((it->>'quantidade')::numeric, 0) - v_ja);
    v_rec := coalesce((p_itens -> idx ->> 'qtd_recebida')::numeric, 0);
    v_q   := coalesce(nullif(p_itens -> idx ->> 'status_qualidade', ''), 'ok');
    if v_rec < 0 then raise exception 'Quantidade recebida negativa no item "%".', it->>'descricao'; end if;
    if v_q not in ('ok','parcial','rejeitado') then raise exception 'Qualidade inválida: %.', v_q; end if;
    if v_rec <> v_saldo or v_q <> 'ok' then v_div := true; end if;
    if (v_ja + (case when v_q = 'rejeitado' then 0 else v_rec end)) < coalesce((it->>'quantidade')::numeric, 0) then
      v_tudo := false;
    end if;
    v_lista := v_lista || jsonb_build_object('descricao', it->>'descricao', 'qtd_esperada', v_saldo,
                                             'qtd_recebida', v_rec, 'status_qualidade', v_q);
  end loop;

  if v_div and nullif(btrim(coalesce(p_observacao, '')), '') is null then
    raise exception 'Recebimento com divergência: descreva o que veio diferente.';
  end if;

  perform set_config('carbo.compras_rpc', 'on', true);
  insert into public.purchase_receivings (purchase_order_id, received_by, items_received, status, has_divergence, divergence_notes)
  values (o.id, auth.uid(), v_lista,
          case when v_div then 'conferido_divergencia' else 'conferido_ok' end::receiving_status,
          v_div, case when v_div then btrim(p_observacao) end)
  returning id into v_id;
  update public.purchase_orders
     set status = case when v_tudo then 'recebida' else 'parcialmente_recebida' end::purchase_order_status
   where id = o.id;
  return v_id;
end $$;

-- ── Lançar a NF de compra + as parcelas da conta a pagar ───────────────────
-- p_parcelas: [{vencimento, valor}] — vazio = NF sem conta (ex.: já paga).
-- ⚠️ A soma das parcelas tem de FECHAR com o valor da NF (tolerância R$ 0,01).
create or replace function public.fin_nf_lancar(
  p_oc_id uuid, p_numero text, p_data date, p_valor numeric,
  p_file_url text default null, p_notas text default null, p_parcelas jsonb default '[]'::jsonb
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  o record; v_rec record; v_id uuid; p jsonb; n int; i int := 0; v_soma numeric;
  v_oc_ok boolean; v_rec_ok boolean; v_val_ok boolean;
begin
  perform public.fin_compras_exige_app();
  select * into o from public.purchase_orders where id = p_oc_id for update;
  if not found then raise exception 'OC não encontrada.'; end if;
  if o.status::text not in ('comprada','enviada_fornecedor','parcialmente_recebida','recebida') then
    raise exception 'A OC % está "%": não recebe NF.', o.oc_number, o.status;
  end if;
  if nullif(btrim(coalesce(p_numero, '')), '') is null then raise exception 'Informe o número da NF.'; end if;
  if coalesce(p_valor, 0) <= 0 then raise exception 'Informe o valor da NF.'; end if;
  if exists (select 1 from public.purchase_invoices where purchase_order_id = o.id and lower(btrim(invoice_number)) = lower(btrim(p_numero))) then
    raise exception 'A NF % já foi lançada nesta OC.', p_numero;
  end if;

  p_parcelas := coalesce(p_parcelas, '[]'::jsonb);
  n := jsonb_array_length(p_parcelas);
  if n > 0 then
    if o.is_paid then raise exception 'A OC % foi paga na compra: a NF não gera conta a pagar (seria pagar duas vezes).', o.oc_number; end if;
    select round(sum((x->>'valor')::numeric), 2) into v_soma from jsonb_array_elements(p_parcelas) x;
    if abs(coalesce(v_soma, 0) - round(p_valor, 2)) > 0.01 then
      raise exception 'As parcelas somam R$ % e a NF é de R$ %: precisam fechar.', v_soma, round(p_valor, 2);
    end if;
    if exists (select 1 from jsonb_array_elements(p_parcelas) x
                where (x->>'vencimento') is null or coalesce((x->>'valor')::numeric, 0) <= 0) then
      raise exception 'Toda parcela precisa de vencimento e valor.';
    end if;
  end if;

  select * into v_rec from public.purchase_receivings where purchase_order_id = o.id order by received_at desc, id desc limit 1;
  v_oc_ok  := true;
  v_rec_ok := v_rec.id is not null and v_rec.status::text = 'conferido_ok' and o.status::text = 'recebida';
  v_val_ok := abs(p_valor - coalesce(o.total_value, 0)) <= greatest(0.01, coalesce(o.total_value, 0) * 0.01);

  perform set_config('carbo.compras_rpc', 'on', true);
  insert into public.purchase_invoices
    (purchase_order_id, receiving_id, invoice_number, invoice_date, invoice_value, file_url,
     oc_match, receiving_match, value_match, verified_by, verified_at, notes)
  values
    (o.id, v_rec.id, btrim(p_numero), coalesce(p_data, (now() at time zone 'America/Sao_Paulo')::date), round(p_valor, 2), p_file_url,
     v_oc_ok, v_rec_ok, v_val_ok, auth.uid(), now(), nullif(btrim(coalesce(p_notas, '')), ''))
  returning id into v_id;

  for p in select * from jsonb_array_elements(p_parcelas) loop
    i := i + 1;
    insert into public.purchase_payables
      (purchase_order_id, invoice_id, service_order_id, supplier_name, supplier_id, amount, due_date,
       status, notes, source, parcela, parcelas_total, currency)
    values
      (o.id, v_id, o.service_order_id, o.supplier_name, o.supplier_id, round((p->>'valor')::numeric, 2), (p->>'vencimento')::date,
       'programado', 'NF ' || btrim(p_numero) || case when n > 1 then ' — parcela ' || i || '/' || n else '' end,
       'interno', i, n, coalesce(o.currency, 'BRL'));
  end loop;
  return v_id;
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'fin_rc_enviar(uuid)', 'fin_rc_decidir(uuid, boolean, text)', 'fin_rc_cancelar(uuid)',
    'fin_cotacao_escolher(uuid, boolean)', 'fin_oc_gerar(uuid, jsonb)',
    'fin_oc_registrar_compra(uuid, uuid, text, boolean, date, date)', 'fin_oc_cancelar(uuid)',
    'fin_recebimento_registrar(uuid, jsonb, text)', 'fin_nf_lancar(uuid, text, date, numeric, text, text, jsonb)',
    'fin_compras_exige_app()']
  loop
    execute format('revoke execute on function public.%s from anon, public', f);
    execute format('grant execute on function public.%s to authenticated, service_role', f);
  end loop;
end $$;

-- Espera: "Success. No rows returned".


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 5 — conferir (só leitura)                                        ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- ESPERADO: os 4 gatilhos e as 9 funções existem (todas as linhas true), e o
-- contador do ano bate com o maior número de hoje.
select
  (select count(*) from pg_trigger where tgname in
     ('trg_fin_rc_guarda','trg_fin_rc_nasce','trg_fin_oc_guarda','trg_fin_cotacao_guarda',
      'trg_fin_receb_via_funcao','trg_fin_nf_via_funcao','trg_fin_pagar_via_funcao')) = 7 as gatilhos_ok,
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in
     ('fin_rc_enviar','fin_rc_decidir','fin_rc_cancelar','fin_cotacao_escolher','fin_oc_gerar',
      'fin_oc_registrar_compra','fin_oc_cancelar','fin_recebimento_registrar','fin_nf_lancar')) = 9 as funcoes_ok,
  (select string_agg(chave || '=' || ultimo, ', ' order by chave) from public.carbo_numeracao) as contadores,
  (select count(*) from public.fin_compras_alcada) as faixas_de_alcada;
