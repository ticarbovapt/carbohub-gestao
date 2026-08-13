-- ═══════════════════════════════════════════════════════════════════════════
-- FASE 3 — mínimo por caixa e aviso de reposição
--
-- Hoje o Ops descobre que um vendedor zerou quando o vendedor liga. Os galpões
-- têm estoque mínimo (`ops_stock_min`); as caixas não tinham.
--
-- ⚠️ RODE EM BLOCOS.
--
-- ── O que NÃO precisou ser criado ─────────────────────────────────────────
--
-- `ops_stock_min` já é por (warehouse, produto), com FK genérica para
-- `warehouses` e ON DELETE CASCADE — a caixa cabe sem mudar schema. E o sino,
-- o badge e o realtime já existem nos seis apps. Só faltava quem decide "este
-- vendedor está abaixo" e o agendamento.
--
-- E a grade de Suprimentos continua protegida: `useStock.ts` descarta código
-- de armazém desconhecido nas TRÊS passagens (saldo, exclusões e mínimos), de
-- propósito. Mínimo de vendedor não vira coluna lá.
-- ═══════════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — quem já foi avisado                                         ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- ⚠️ Sem dedupe, um vendedor zerado por uma semana rende SETE avisos para
-- dezenas de pessoas — e o time aprende a ignorar o sino, que é pior do que
-- não ter alerta nenhum.
--
-- A regra é de TRANSIÇÃO, não de repetição: avisa quando cruza para baixo, e
-- só volta a avisar depois de ter subido de novo. É a mesma disciplina do
-- gatilho de venda online, que usa `OLD.status` + janela de 12h em vez de
-- reagir a toda gravação.

create table if not exists public.carbo_alerta_estoque_caixa (
  warehouse_id uuid not null references public.warehouses(id) on delete cascade,
  product_id   uuid not null references public.mrp_products(id) on delete cascade,
  avisado_em   timestamptz not null default now(),
  primary key (warehouse_id, product_id)
);

alter table public.carbo_alerta_estoque_caixa enable row level security;

drop policy if exists "interno le alerta caixa" on public.carbo_alerta_estoque_caixa;
create policy "interno le alerta caixa"
  on public.carbo_alerta_estoque_caixa for select using (auth.role() = 'authenticated');

comment on table public.carbo_alerta_estoque_caixa is
  'Marca que a caixa já foi avisada para este produto. A linha é APAGADA quando o saldo volta ao mínimo — é isso que faz o próximo aviso ser uma transição, e não repetição diária.';


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — o que está abaixo                                           ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- ⚠️ SEM fallback para `safety_stock_qty`.
--
-- O snapshot e o cockpit usam `COALESCE(min_qty, safety_stock_qty)`. Aqui isso
-- seria desastroso: nenhuma caixa tem mínimo configurado ainda, então TODA
-- caixa nasceria em alerta para TODO produto com estoque de segurança — o
-- primeiro disparo seria centenas de avisos e a função morreria no berço.
--
-- Sem mínimo cadastrado = sem alerta. Alerta é opt-in, por produto e por
-- vendedor: só quem o Ops decidiu que precisa repor.

create or replace view public.vendedor_estoque_baixo
with (security_invoker = true) as
select
  w.id            as warehouse_id,
  w.owner_id      as vendedor_id,
  p.full_name     as vendedor_nome,
  pr.id           as product_id,
  pr.name         as product_name,
  coalesce(ws.quantity, 0)::numeric as saldo,
  sm.min_qty::numeric               as minimo
from public.warehouses w
join public.profiles      p  on p.id  = w.owner_id
join public.ops_stock_min sm on sm.warehouse_id = w.id      -- ⬅ INNER: sem mínimo, sem alerta
join public.mrp_products  pr on pr.id = sm.product_id
left join public.warehouse_stock ws
       on ws.warehouse_id = w.id and ws.product_id = sm.product_id
where w.kind = 'vendedor'
  and w.is_active
  and pr.is_active
  and sm.min_qty > 0
  and coalesce(ws.quantity, 0) < sm.min_qty;

grant select on public.vendedor_estoque_baixo to authenticated;

comment on view public.vendedor_estoque_baixo is
  'Caixas de vendedor abaixo do mínimo. INNER JOIN em ops_stock_min de propósito: sem mínimo cadastrado não há alerta. Usar o fallback safety_stock_qty (como o snapshot faz) poria toda caixa em alerta para todo produto no primeiro disparo.';


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 3 — o aviso                                                     ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- ⚠️ Fan-out RESTRITO: quem tem acesso ao Ops + o próprio vendedor.
--
-- `notify_time_interno` avisa o time interno inteiro (dezenas de pessoas).
-- Falta de estoque na van do João não é assunto do marketing, e alerta que não
-- é do leitor treina o leitor a ignorar todos.
--
-- ⚠️ O filtro de interface interna é mantido: `profiles` é a mesma tabela dos
-- portais de loja e de licenciado. Sem ele, lojista recebe aviso de estoque
-- interno no sininho.

create or replace function public.carbo_alerta_estoque_caixa_rodar()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_destinatario uuid;
  v_avisos int := 0;
begin
  -- 1. Voltou ao normal → esquece, para o próximo aviso ser transição.
  delete from public.carbo_alerta_estoque_caixa a
   where not exists (
     select 1 from public.vendedor_estoque_baixo b
      where b.warehouse_id = a.warehouse_id and b.product_id = a.product_id
   );

  -- 2. Está abaixo e ainda não foi avisado.
  for r in
    select b.* from public.vendedor_estoque_baixo b
     where not exists (
       select 1 from public.carbo_alerta_estoque_caixa a
        where a.warehouse_id = b.warehouse_id and a.product_id = b.product_id
     )
  loop
    for v_destinatario in
      select p.id from public.profiles p
       where (
         -- quem cuida do estoque
         'carbo_ops'     = any (select lower(x) from unnest(coalesce(p.allowed_interfaces,'{}')) x)
         or 'carbo_ops_app' = any (select lower(x) from unnest(coalesce(p.allowed_interfaces,'{}')) x)
         -- e o dono da caixa, que é quem vai ficar sem vender
         or p.id = r.vendedor_id
       )
    loop
      insert into public.notifications
        (user_id, type, title, body, reference_type, reference_id, is_read)
      values
        (v_destinatario, 'estoque_vendedor_baixo',
         'Estoque baixo: ' || coalesce(r.vendedor_nome, 'vendedor'),
         r.product_name || ' — tem ' || r.saldo || ', mínimo ' || r.minimo,
         'warehouse', r.warehouse_id, false);
      v_avisos := v_avisos + 1;
    end loop;

    insert into public.carbo_alerta_estoque_caixa (warehouse_id, product_id)
    values (r.warehouse_id, r.product_id)
    on conflict (warehouse_id, product_id) do nothing;
  end loop;

  return v_avisos;
exception when others then
  -- Aviso que falha não pode derrubar o cron nem virar erro sem dono.
  raise warning 'carbo_alerta_estoque_caixa_rodar falhou: %', sqlerrm;
  return v_avisos;
end;
$$;

revoke all on function public.carbo_alerta_estoque_caixa_rodar() from public, anon;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 4 — agendamento                                                 ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- ⚠️ 1×/dia, e SQL puro (banco→banco), como o snapshot de Suprimentos. Sem
-- net.http_post e sem CRON_SECRET — entra rodando a migração.
--
-- ⚠️ E NÃO é gatilho em `warehouse_stock`. Aquela tabela é escrita pela
-- dedução da venda, que roda com FOR UPDATE dentro da transação do pedido: um
-- fan-out de notificações ali dentro (um INSERT por pessoa) entraria na
-- transação da venda e a seguraria. O problema é "zerou", não "zerou há três
-- segundos" — um dia de latência é o certo aqui.
--
-- 07:00 BRT = 10:00 UTC: antes de a rota começar, depois do snapshot das 05:00.

do $$
declare j bigint;
begin
  for j in select jobid from cron.job where jobname = 'alerta-estoque-vendedor' loop
    perform cron.unschedule(j);
  end loop;

  perform cron.schedule(
    'alerta-estoque-vendedor',
    '0 10 * * *',
    $cron$ select public.carbo_alerta_estoque_caixa_rodar(); $cron$
  );
end $$;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 5 — conferência                                                 ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- (a) O agendamento existe?
select jobname, schedule, active from cron.job where jobname = 'alerta-estoque-vendedor';

-- (b) O que está abaixo AGORA. Vem vazio até alguém cadastrar mínimos —
--     é o comportamento correto: alerta é opt-in.
select * from public.vendedor_estoque_baixo order by vendedor_nome, product_name;

-- (c) Disparo manual (não espere o cron para testar). Devolve quantos avisos
--     foram criados; rodar de novo em seguida deve devolver 0, porque a
--     segunda vez já não é transição.
-- select public.carbo_alerta_estoque_caixa_rodar();
