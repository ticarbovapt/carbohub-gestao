-- ═══════════════════════════════════════════════════════════════════════════
-- Fecha os 7 pedidos "não classificados" que sobraram do backfill de PDVs
--
-- Depois da carga dos 69 PDVs e do trigger de canal, restaram 7 pedidos sem
-- segmento (R$ 28.330). São 3 casos distintos e cada um tem tratamento
-- diferente — classificar todos como "revenda" seria mentir em um deles.
--
--  1. CARBO SOLUCOES LTDA (BLING-171) → NÃO é venda. É o nosso próprio CNPJ.
--  2. 4 lojas automotivas → são PDVs que faltavam no cadastro.
--  3. M & D COMERCIO SERVICOS E LOCACOES → decisão do comercial, fica de fora.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Venda para o próprio CNPJ ──────────────────────────────────────────
-- 36.060.692/0001-00 é o CNPJ emissor da Carbo: está no OrderPrintView, em
-- todos os quotePdf.ts dos apps e no contrato da Jamef. Um pedido cujo
-- "cliente" somos nós é transferência/ajuste, não faturamento.
--
-- Hoje está `pending`, então já não entra na métrica (motivo_fora =
-- aguardando_nf). Marcar aqui é para que ele NÃO entre se alguém mudar o
-- status depois — que é exatamente como esse tipo de linha vira receita
-- fantasma no fechamento.
update public.carboze_orders
set excluir_metricas = true,
    notes = coalesce(notes || E'\n', '') ||
            '[auto] Excluído das métricas: CNPJ do cliente é o da própria Carbo (36.060.692/0001-00).'
where regexp_replace(coalesce(cnpj, ''), '\D', '', 'g') = '36060692000100'
  and coalesce(excluir_metricas, false) = false;

-- ── 2. Os PDVs que faltavam ───────────────────────────────────────────────
-- Mesmo perfil dos 69 já carregados (Autotech, Oficina Multimarcas, Guri
-- Autocenter...). Cidade, UF e razão social vêm do PEDIDO, não digitados à
-- mão: o pedido é o que foi faturado, então é a fonte correta — mesma regra
-- que valeu na carga dos 69.
insert into public.pdvs (name, legal_name, cnpj, address_city, address_state, status)
select
  v.nome,
  o.customer_name,
  v.cnpj,
  o.delivery_city,
  o.delivery_state,
  'active'
from (values
  ('Centro Automotivo Auto Diesel', '54927081000107'),
  ('Bravo Centro Automotivo',       '17772624000120'),
  ('ARTCAR Autocenter',             '52935898000193'),
  ('Sound Mix Equipadora',          '59406253000102')
) as v(nome, cnpj)
-- Pedido mais recente daquele CNPJ: é dele que sai a razão social do
-- faturamento e o endereço de entrega mais atual.
left join lateral (
  -- delivery_city/delivery_state: é o endereço de ENTREGA do pedido, o único
  -- endereço que carboze_orders guarda. Pode ficar nulo, e nesse caso o PDV
  -- entra sem cidade para alguém completar na tela.
  select customer_name, delivery_city, delivery_state
  from public.carboze_orders
  where regexp_replace(coalesce(cnpj, ''), '\D', '', 'g') = v.cnpj
    and status not in ('quote', 'cancelled')
  order by coalesce(sale_date, created_at::date) desc
  limit 1
) o on true
-- Guarda contra reexecução: cnpj tem índice único e o insert quebraria.
where not exists (
  select 1 from public.pdvs p
  where regexp_replace(coalesce(p.cnpj, ''), '\D', '', 'g') = v.cnpj
);

-- ── 3. Backfill do canal ──────────────────────────────────────────────────
-- Mesmo UPDATE da migração do trigger. O `segmento is null` continua sendo
-- obrigatório: sem ele isto atropelaria toda classificação feita à mão.
-- O trigger só cuida de INSERT, então o histórico destes 4 PDVs precisa
-- deste passo.
update public.carboze_orders o
set segmento = 'revenda'
where o.segmento is null
  and coalesce(o.cnpj, '') <> ''
  and coalesce(o.excluir_metricas, false) = false
  and exists (
    select 1 from public.pdvs p
    where regexp_replace(coalesce(p.cnpj, ''), '\D', '', 'g')
        = regexp_replace(o.cnpj, '\D', '', 'g')
  );

-- ── Conferência ───────────────────────────────────────────────────────────
-- Esperado: 73 PDVs; "não classificado" cai para 1 pedido (o M & D, R$ 5.600).
select coalesce(segmento, '(não classificado)') as canal,
       count(*) as pedidos,
       round(sum(total), 2) as valor
from public.carboze_orders
where status not in ('quote', 'cancelled')
  and coalesce(excluir_metricas, false) = false
group by 1
order by 3 desc nulls last;

select count(*) as pdvs,
       count(*) filter (where pedidos > 0) as ja_compraram
from public.carbo_pdvs_painel;
