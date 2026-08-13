-- ═══════════════════════════════════════════════════════════════════════════
-- FASE 0 — caixa de vendedor não é hub, e saldo não é de todo mundo
--
-- Duas correções do que JÁ ESTÁ RODANDO, achadas ao mapear as fases seguintes.
-- Nenhuma é funcionalidade nova.
--
-- ── O que aconteceu ───────────────────────────────────────────────────────
--
-- Reusar `warehouses` para as caixas dos vendedores foi (e continua sendo) a
-- decisão certa: `warehouse_stock`, `stock_movements`, `stock_transfers` e
-- `ops_stock_min` já giram em torno de `warehouse_id`, e uma tabela paralela
-- teria duplicado as quatro.
--
-- O preço é este: TODO lugar que varre `warehouses` ou `warehouse_stock`
-- supondo "isto aqui é um galpão" passou a enxergar quinze vans. O front foi
-- protegido desde o início (`useStock.ts` ignora código desconhecido em três
-- passagens); o BANCO não foi, e ninguém procurou.
--
-- ⚠️ RODE EM BLOCOS.
-- ═══════════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — o MRP não pode sugerir tirar estoque da van do vendedor     ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- `suggest_hub_transfer_before_op` procura, para um produto abaixo do estoque
-- de segurança, um armazém com excedente para abastecer outro em déficit. Ela
-- varre `warehouse_stock` inteiro — e as caixas agora estão lá.
--
-- O resultado seria uma sugestão de transferência SAINDO da caixa de um
-- vendedor para abastecer uma ordem de produção. Pior: a tela que aprova a
-- sugestão (`PendingSuggestions`) escreve `warehouse_stock` direto, fora das
-- RPCs e sem trava — o vendedor perderia estoque sem nada na tela dele mudar
-- de forma explicável.
--
-- Três lugares na função precisam do filtro, não um: a CONTAGEM de armazéns
-- (que decide se há dois para transferir entre eles), o déficit e o excedente.
-- Corrigir só os dois últimos deixaria `v_hub_count` contando vans, e o alvo
-- por hub (`safety / v_hub_count`) sairia diluído — sugestão pequena demais,
-- calada.

create or replace function public.suggest_hub_transfer_before_op()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
DECLARE
  v_deficit_hub RECORD;
  v_surplus_hub RECORD;
  v_hub_count integer;
  v_hub_target integer;
  v_transfer_qty integer;
  v_has_pending_transfer boolean;
BEGIN
  IF NEW.current_stock_qty >= NEW.safety_stock_qty OR NEW.safety_stock_qty <= 0 THEN
    RETURN NEW;
  END IF;

  -- ⬅ kind = 'hub': caixa de vendedor não entra na conta.
  SELECT COUNT(*) INTO v_hub_count
    FROM public.warehouses WHERE is_active = true AND kind = 'hub';
  IF v_hub_count < 2 THEN
    RETURN NEW;
  END IF;

  v_hub_target := CEIL(NEW.safety_stock_qty::numeric / v_hub_count);

  SELECT EXISTS (
    SELECT 1 FROM public.stock_transfers
    WHERE product_id = NEW.id AND status IN ('suggested', 'approved')
  ) INTO v_has_pending_transfer;

  IF v_has_pending_transfer THEN
    RETURN NEW;
  END IF;

  SELECT ws.warehouse_id, ws.quantity INTO v_deficit_hub
  FROM public.warehouse_stock ws
  JOIN public.warehouses w ON w.id = ws.warehouse_id AND w.kind = 'hub'   -- ⬅
  WHERE ws.product_id = NEW.id AND ws.quantity < v_hub_target
  ORDER BY ws.quantity ASC
  LIMIT 1;

  SELECT ws.warehouse_id, ws.quantity INTO v_surplus_hub
  FROM public.warehouse_stock ws
  JOIN public.warehouses w ON w.id = ws.warehouse_id AND w.kind = 'hub'   -- ⬅
  WHERE ws.product_id = NEW.id AND ws.quantity > v_hub_target
  ORDER BY ws.quantity DESC
  LIMIT 1;

  IF v_deficit_hub IS NOT NULL AND v_surplus_hub IS NOT NULL THEN
    v_transfer_qty := LEAST(
      v_surplus_hub.quantity - v_hub_target,
      v_hub_target - v_deficit_hub.quantity
    );

    IF v_transfer_qty > 0 THEN
      INSERT INTO public.stock_transfers (
        product_id, product_code, from_hub, to_hub, quantity, status, notes
      ) VALUES (
        NEW.id, NEW.product_code, v_surplus_hub.warehouse_id, v_deficit_hub.warehouse_id,
        v_transfer_qty, 'suggested',
        format('Sugestão automática: Hub com %s un excedentes → Hub com déficit de %s un',
               v_surplus_hub.quantity - v_hub_target, v_hub_target - v_deficit_hub.quantity)
      );
      RETURN NEW;
    END IF;
  END IF;

  RETURN NEW;
END $$;

comment on function public.suggest_hub_transfer_before_op is
  'Sugere transferência entre GALPÕES antes de abrir OP. Filtra kind=hub nos três pontos (contagem, déficit, excedente): sem isso sugeria tirar estoque da caixa de um vendedor, e a tela de aprovação escreve warehouse_stock direto, sem trava.';


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — o snapshot do CEO não conta van como galpão                 ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- `capture_suprimentos_snapshot` roda todo dia às 5h e alimenta os
-- indicadores de risco de ruptura. O CTE `hubs` seleciona
-- `warehouses where is_active`, SEM `kind` — então cada produto passou a ser
-- cruzado também com cada caixa de vendedor.
--
-- Hoje isso já infla `risco_qtd`/`risco_valor` pelo fallback
-- `COALESCE(min_qty, safety_stock_qty)`: a caixa não tem mínimo configurado,
-- cai no estoque de segurança do PRODUTO, e toda caixa vazia vira "risco".
--
-- ⚠️ E pioraria calado na Fase 3: no dia em que mínimos de vendedor forem
-- cadastrados, a falta das vans entra no número do CEO somada à dos galpões —
-- enquanto o cockpit do Admin, que filtra só o HUB-RN, mostraria outro valor.
-- Banco e tela discordando sem ninguém saber qual está certo.
--
-- ⚠️ Só o CTE `hubs` muda. O resto da função fica como está.

do $$
declare v_src text;
begin
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'capture_suprimentos_snapshot'
   limit 1;

  if v_src is null then
    raise notice 'capture_suprimentos_snapshot não existe — nada a fazer.';
    return;
  end if;

  if v_src not like '%FROM public.warehouses WHERE is_active%' then
    raise exception
      'O CTE `hubs` não está na forma esperada. NÃO altere às cegas: '
      'leia a definição atual (pg_get_functiondef) e aplique o filtro kind=''hub'' à mão.';
  end if;

  -- Substituição cirúrgica: só a linha do CTE.
  v_src := replace(
    v_src,
    'SELECT id FROM public.warehouses WHERE is_active',
    'SELECT id FROM public.warehouses WHERE is_active AND kind = ''hub''');

  execute v_src;
  raise notice 'capture_suprimentos_snapshot atualizada: CTE hubs agora filtra kind=hub.';
end $$;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 3 — quem pode MEXER em estoque                                  ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- Regra do dono do processo: mexer em saldo é de quem tem acesso ao Carbo Ops,
-- e esse acesso é a flag que o Carbo Admin concede (`allowed_interfaces`).
--
-- ⚠️ Hoje as políticas são `FOR ALL TO authenticated USING (true) WITH CHECK
-- (true)` em `warehouse_stock`, `stock_movements`, `stock_transfers` e
-- `ops_stock_min`. Ou seja: qualquer pessoa logada escreve o saldo de qualquer
-- caixa pela API — inclusive o próprio vendedor na dele. Enquanto a única
-- escrita real passava por RPC isso era teórico; deixa de ser na fase da
-- devolução, quando a origem da transferência passa a ser arbitrária.
--
-- ⚠️ LEITURA CONTINUA ABERTA a qualquer autenticado, de propósito. O aviso de
-- saldo do `/vender` e a tela "Meu Estoque" leem `vendedor_estoque`, que é
-- `security_invoker` — apertar o SELECT cegaria o vendedor sobre a própria
-- caixa. O que se fecha é a ESCRITA.
--
-- ⚠️ As RPCs não são afetadas: `carbo_pronta_entrega_deduzir`,
-- `ops_transfer_*` e `pos_venda_*` são SECURITY DEFINER e passam por cima de
-- RLS. A venda a pronta entrega do vendedor continua funcionando — é a edição
-- MANUAL de saldo que passa a exigir a flag.

create or replace function public.carbo_pode_mexer_estoque()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    public.is_admin(auth.uid())
    or public.is_ceo(auth.uid())
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and (
          'carbo_ops'     = any (select lower(x) from unnest(coalesce(p.allowed_interfaces, '{}')) x)
          or 'carbo_ops_app' = any (select lower(x) from unnest(coalesce(p.allowed_interfaces, '{}')) x)
        )
    ),
    false);   -- ⬅ sem sessão / perfil ausente = NÃO. Nunca abre por omissão.
$$;

comment on function public.carbo_pode_mexer_estoque is
  'Pode editar saldo/movimento/transferência/mínimo? Admin, CEO ou quem tem a flag do Carbo Ops em allowed_interfaces. Devolve false por omissão — ausência de configuração fecha.';

grant execute on function public.carbo_pode_mexer_estoque() to authenticated;

-- ── warehouse_stock ────────────────────────────────────────────────────────
drop policy if exists "warehouse_stock_ops_write" on public.warehouse_stock;
drop policy if exists "warehouse_stock_ops_read"  on public.warehouse_stock;

create policy "warehouse_stock_read"  on public.warehouse_stock
  for select to authenticated using (true);
create policy "warehouse_stock_write" on public.warehouse_stock
  for insert to authenticated with check (public.carbo_pode_mexer_estoque());
create policy "warehouse_stock_upd"   on public.warehouse_stock
  for update to authenticated
  using (public.carbo_pode_mexer_estoque()) with check (public.carbo_pode_mexer_estoque());
create policy "warehouse_stock_del"   on public.warehouse_stock
  for delete to authenticated using (public.carbo_pode_mexer_estoque());

-- ── stock_movements ────────────────────────────────────────────────────────
-- ⚠️ Sem DELETE, de propósito: movimento é histórico. Correção é linha nova
-- em sentido contrário, como no RTM. Ledger que se apaga não é ledger.
drop policy if exists "stock_movements_ops_write" on public.stock_movements;
drop policy if exists "stock_movements_ops_read"  on public.stock_movements;

create policy "stock_movements_read"  on public.stock_movements
  for select to authenticated using (true);
create policy "stock_movements_write" on public.stock_movements
  for insert to authenticated with check (public.carbo_pode_mexer_estoque());

-- ── stock_transfers ────────────────────────────────────────────────────────
drop policy if exists "stock_transfers_ops_all" on public.stock_transfers;

create policy "stock_transfers_read"  on public.stock_transfers
  for select to authenticated using (true);
create policy "stock_transfers_write" on public.stock_transfers
  for insert to authenticated with check (public.carbo_pode_mexer_estoque());
create policy "stock_transfers_upd"   on public.stock_transfers
  for update to authenticated
  using (public.carbo_pode_mexer_estoque()) with check (public.carbo_pode_mexer_estoque());

-- ── ops_stock_min ──────────────────────────────────────────────────────────
drop policy if exists "ops_stock_min_all" on public.ops_stock_min;

create policy "ops_stock_min_read"  on public.ops_stock_min
  for select to authenticated using (true);
create policy "ops_stock_min_write" on public.ops_stock_min
  for all to authenticated
  using (public.carbo_pode_mexer_estoque()) with check (public.carbo_pode_mexer_estoque());


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 4 — conferência                                                 ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- (a) Você mesmo passa na regra? Se vier `false`, você não edita mais saldo
--     pela tela — pegue a flag do Carbo Ops no Carbo Admin.
select public.carbo_pode_mexer_estoque() as eu_posso_mexer;

-- (b) Quem passa a poder. Confira se o time de Suprimentos está aqui —
--     ⚠️ inclusive quem usa a tela de sugestões no FINANÇAS e no CONTROLE,
--     que escrevem saldo direto e vão passar a ser recusados sem a flag.
select p.full_name, p.allowed_interfaces
from public.profiles p
where 'carbo_ops' = any (select lower(x) from unnest(coalesce(p.allowed_interfaces,'{}')) x)
   or 'carbo_ops_app' = any (select lower(x) from unnest(coalesce(p.allowed_interfaces,'{}')) x)
order by p.full_name;

-- (c) As políticas ficaram como esperado?
select tablename, policyname, cmd
from pg_policies
where schemaname = 'public'
  and tablename in ('warehouse_stock','stock_movements','stock_transfers','ops_stock_min')
order by tablename, cmd, policyname;

-- (d) O snapshot parou de contar as vans? Rode e compare com o de ontem: o
--     risco deve CAIR (some a falta fantasma das caixas sem mínimo).
-- select public.capture_suprimentos_snapshot();
