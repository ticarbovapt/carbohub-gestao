-- ═══════════════════════════════════════════════════════════════════════════
-- Distribuir meta: um comando só, ou nenhum
--
-- ── Por que RPC, e não 9 upserts do navegador ────────────────────────────
--
-- Distribuir R$ 100.000 entre 9 vendedores pela tela seriam 10 escritas soltas
-- (1 total + 9 linhas). Se a quarta falhar — rede caiu, aba fechou, token
-- expirou — o mês fica com o total novo e a distribuição pela metade, e ninguém
-- percebe: a tela recarrega e mostra números que somam errado. É a mesma classe
-- de erro que fez este banco ter SEIS linhas de total em maio.
--
-- Aqui é tudo ou nada: função é transação.
--
-- ── A guarda: a regra mais estrita das três tabelas ──────────────────────
--
-- As políticas de hoje discordam entre si:
--
--   canal_metas    → is_admin() OR is_ceo()          (estrita)
--   meta_ecommerce → auth.uid() IS NOT NULL          (qualquer um logado)
--   sales_targets  → true, para authenticated        (qualquer um, de qualquer vendedor)
--
-- Como esta função é SECURITY DEFINER (ignora RLS), a guarda interna É o
-- controle. Adotamos a mais estrita — quem já podia mexer em `canal_metas`
-- continua podendo, e ninguém ganha poder que não tinha.
--
-- ⚠️ As políticas frouxas das outras duas continuam de pé: qualquer pessoa
-- logada ainda consegue reescrever a meta de qualquer vendedor indo direto na
-- tabela. Fechar isso é decisão à parte (o BLOCO 3 traz o SQL pronto,
-- comentado), porque apertar RLS pode quebrar tela que hoje funciona.
--
-- ── O payload é a distribuição INTEIRA do mês ────────────────────────────
--
-- `p_itens` não é um "patch", é o estado final. O que não estiver nele é
-- APAGADO daquele mês. Sem isso, tirar um vendedor da distribuição na tela não
-- tiraria a meta dele no banco, e a soma nunca mais fecharia.
--
-- ⚠️ RODE EM BLOCOS.
-- ═══════════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — a função                                                    ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

create or replace function public.carbo_distribuir_meta(
  p_escopo text,        -- 'vendedores' | 'ecommerce'
  p_mes    date,
  p_total  numeric,
  p_itens  jsonb        -- [{"id": "<uuid | plataforma>", "valor": 30000}, ...]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mes         date;
  v_canal       text;
  v_distribuido numeric;
  v_gravados    int := 0;
  v_inseridos   int := 0;
  v_removidos   int := 0;
  -- ⚠️ ESTA LISTA TEM DE ESPELHAR `ALL_PLATFORMS` em
  -- apps/admin/src/hooks/useMetaEcommerce.ts. Foi por divergir de uma lista
  -- gêmea que R$ 210.000 de meta foram parar em `vindi`, uma plataforma que a
  -- tela não soma — o valor existe no banco e é invisível no painel.
  -- Plataforma nova entra NOS DOIS lugares, no mesmo commit.
  v_plataformas text[] := array['mercadolivre','nuvemshop','amazon','shopee','payt'];
begin
  -- ── Guarda ──────────────────────────────────────────────────────────────
  if not (is_admin(auth.uid()) or is_ceo(auth.uid())) then
    raise exception 'Sem permissao para definir metas (exige admin ou CEO).'
      using errcode = '42501';
  end if;

  if p_escopo not in ('vendedores', 'ecommerce') then
    raise exception 'Escopo invalido: %. Use vendedores ou ecommerce.', p_escopo;
  end if;

  if p_total is null or p_total < 0 then
    raise exception 'Meta geral invalida: %.', p_total;
  end if;

  if p_itens is null or jsonb_typeof(p_itens) <> 'array' then
    raise exception 'p_itens precisa ser um array JSON.';
  end if;

  -- Normaliza para o dia 1. A tela manda um Date qualquer do mês e as tabelas
  -- guardam sempre o primeiro dia; sem isto, "setembro" viraria dois meses.
  v_mes   := date_trunc('month', p_mes)::date;
  v_canal := case p_escopo when 'vendedores' then 'revenda' else 'online' end;

  -- ── Validação do payload, ANTES de escrever qualquer coisa ─────────────
  if exists (select 1 from jsonb_array_elements(p_itens) e
              where (e->>'valor')::numeric < 0) then
    raise exception 'Ha item com valor negativo na distribuicao.';
  end if;

  if (select count(*) from jsonb_array_elements(p_itens) e)
     <> (select count(distinct e->>'id') from jsonb_array_elements(p_itens) e) then
    raise exception 'Ha id repetido no payload — a distribuicao ficaria ambigua.';
  end if;

  if p_escopo = 'ecommerce' then
    if exists (select 1 from jsonb_array_elements(p_itens) e
                where (e->>'id') <> all (v_plataformas)) then
      raise exception 'Plataforma desconhecida no payload. Aceitas: %.',
        array_to_string(v_plataformas, ', ');
    end if;
  else
    if exists (select 1 from jsonb_array_elements(p_itens) e
                where not exists (select 1 from profiles p
                                   where p.id = (e->>'id')::uuid)) then
      raise exception 'Ha vendedor inexistente no payload.';
    end if;
  end if;

  select coalesce(sum((e->>'valor')::numeric), 0)
    into v_distribuido
    from jsonb_array_elements(p_itens) e;

  -- ⚠️ A soma NÃO precisa fechar com o total, e isso é de propósito: definir
  -- 100.000 e distribuir 78.000 é um estado de trabalho legítimo. A função
  -- devolve o resíduo e a TELA mostra o buraco. Recusar aqui obrigaria a
  -- fechar a conta de uma sentada; corrigir sozinha inventaria número.

  -- ── A meta geral ────────────────────────────────────────────────────────
  insert into canal_metas (ano, mes, canal, valor, updated_by, updated_at)
  values (extract(year from v_mes)::int, extract(month from v_mes)::int,
          v_canal, p_total, auth.uid(), now())
  on conflict (ano, mes, canal) do update
    set valor = excluded.valor, updated_by = excluded.updated_by, updated_at = now();

  -- ── A distribuição ──────────────────────────────────────────────────────
  if p_escopo = 'ecommerce' then

    delete from meta_ecommerce
     where month = v_mes
       and platform <> all (
             select e->>'id' from jsonb_array_elements(p_itens) e);
    get diagnostics v_removidos = row_count;

    insert into meta_ecommerce (month, platform, target_amount, created_by, updated_at)
    select v_mes, e->>'id', (e->>'valor')::numeric, auth.uid(), now()
      from jsonb_array_elements(p_itens) e
    on conflict (month, platform) do update
      set target_amount = excluded.target_amount, updated_at = now();
    get diagnostics v_gravados = row_count;

  else

    -- ⚠️ Escopo do DELETE preso a `linha is null`. Hoje toda linha de
    -- `sales_targets` tem `linha` nulo, mas a coluna existe e a unique é
    -- (vendedor_id, month, coalesce(linha,'')). Sem este filtro, distribuir a
    -- meta geral apagaria metas por linha de produto que alguém viesse a criar.
    delete from sales_targets
     where month = v_mes
       and linha is null
       and vendedor_id <> all (
             select (e->>'id')::uuid from jsonb_array_elements(p_itens) e);
    get diagnostics v_removidos = row_count;

    -- ⚠️ UPDATE-e-depois-INSERT em vez de ON CONFLICT, de propósito.
    --
    -- Esta tabela tem DOIS índices únicos que cobrem quase as mesmas colunas:
    --
    --   sales_targets_vendedor_month_linha_key  (vendedor_id, month, linha)
    --   sales_targets_vendedor_month_linha_uq   (vendedor_id, month, COALESCE(linha,''))
    --
    -- O primeiro é inútil aqui — `linha` é NULL em toda linha, e NULL <> NULL,
    -- então ele nunca acusa conflito (o mesmo defeito que duplicou o total do
    -- e-commerce em maio). Só o segundo funciona, e inferir índice por
    -- EXPRESSÃO no ON CONFLICT é frágil: basta o tipo do literal não casar para
    -- o Postgres escolher o outro — e aí a gravação vira INSERT duplicado em
    -- vez de UPDATE, silenciosamente.
    --
    -- Escrito assim não há o que inferir. A unique continua de guarda-costas.
    update sales_targets t
       set target_amount = e.valor,
           updated_at    = now()
      from (select (x->>'id')::uuid as id, (x->>'valor')::numeric as valor
              from jsonb_array_elements(p_itens) x) e
     where t.vendedor_id = e.id
       and t.month       = v_mes
       and t.linha is null;
    get diagnostics v_gravados = row_count;

    insert into sales_targets (vendedor_id, month, target_amount, linha, updated_at)
    select e.id, v_mes, e.valor, null, now()
      from (select (x->>'id')::uuid as id, (x->>'valor')::numeric as valor
              from jsonb_array_elements(p_itens) x) e
     where not exists (select 1 from sales_targets t
                        where t.vendedor_id = e.id
                          and t.month       = v_mes
                          and t.linha is null);
    get diagnostics v_inseridos = row_count;

    v_gravados := v_gravados + v_inseridos;

  end if;

  return jsonb_build_object(
    'mes',         v_mes,
    'escopo',      p_escopo,
    'total',       p_total,
    'distribuido', v_distribuido,
    'residual',    p_total - v_distribuido,
    'gravados',    v_gravados,
    'removidos',   v_removidos
  );
end;
$$;

comment on function public.carbo_distribuir_meta(text, date, numeric, jsonb) is
  'Grava a meta geral do mes (canal_metas) e a distribuicao inteira (por '
  'plataforma ou por vendedor) numa transacao so. p_itens e o estado FINAL: o '
  'que nao estiver nele e apagado daquele mes. A soma nao precisa fechar com o '
  'total — o residual volta no retorno para a tela mostrar.';

revoke all on function public.carbo_distribuir_meta(text, date, numeric, jsonb) from public;
grant execute on function public.carbo_distribuir_meta(text, date, numeric, jsonb) to authenticated;
-- A permissão fina é a guarda interna (admin/CEO); o grant só permite chamar.


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — conferência (não escreve nada)                              ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
--
-- Chamada de exemplo, para rodar DEPOIS de conferir os números do mês. Trocar
-- os ids. Rodando como admin/CEO, devolve o JSON com o residual.
--
-- select public.carbo_distribuir_meta(
--   'ecommerce', date '2026-09-01', 100000,
--   '[{"id":"nuvemshop","valor":70000},
--     {"id":"mercadolivre","valor":20000},
--     {"id":"amazon","valor":10000}]'::jsonb
-- );


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 3 — OPCIONAL: fechar as políticas frouxas                       ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
--
-- ⚠️ NÃO rode sem decidir. Hoje QUALQUER usuário logado pode reescrever a meta
-- de QUALQUER vendedor indo direto na tabela — a RPC não impede isso, ela só
-- garante que o caminho dela é seguro.
--
-- Apertar isto alinha as três tabelas com `canal_metas`. O risco é quebrar
-- alguma tela que hoje grave meta com usuário não-admin (a MetaConfig do Admin
-- é usada por gestor/CEO, mas confirme antes).
--
-- drop policy if exists "sales_targets_insert" on public.sales_targets;
-- drop policy if exists "sales_targets_update" on public.sales_targets;
-- drop policy if exists "sales_targets_delete" on public.sales_targets;
-- create policy "sales_targets: so admin ou ceo escreve" on public.sales_targets
--   for all to authenticated
--   using (is_admin(auth.uid()) or is_ceo(auth.uid()))
--   with check (is_admin(auth.uid()) or is_ceo(auth.uid()));
--
-- drop policy if exists "meta_ecommerce_write" on public.meta_ecommerce;
-- create policy "meta_ecommerce: so admin ou ceo escreve" on public.meta_ecommerce
--   for all to authenticated
--   using (is_admin(auth.uid()) or is_ceo(auth.uid()))
--   with check (is_admin(auth.uid()) or is_ceo(auth.uid()));
