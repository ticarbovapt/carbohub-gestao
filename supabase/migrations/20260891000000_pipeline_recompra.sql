-- ═══════════════════════════════════════════════════════════════════════════
-- Pipeline de recompra — a base de dados
--
-- ── Os dois números que decidiram o desenho ───────────────────────────────
--
--   CPF nos entregues        104/104   (100%)  → identidade sólida
--   Data de entrega real      19/104   ( 18%)  → a régua não tem de onde contar
--
-- A régua é "X dias APÓS A ENTREGA", e em 82% dos pedidos a gente sabe QUE
-- entregou e não QUANDO. `rastreio_envios.entregue_em` só existe quando o
-- código casou com a transportadora; nos demais quem disse "entregue" foi a
-- plataforma, sem carimbo.
--
-- ── Por que um carimbo próprio ────────────────────────────────────────────
--
-- Não dá para derivar a data depois: a esteira é uma view CALCULADA, não guarda
-- histórico de etapa. Se ninguém anotar o momento em que o pedido virou
-- "entregue", esse instante se perde para sempre.
--
-- Então `carbo_entrega_carimbo` anota. A `origem` diz de onde veio a data, e
-- essa coluna não é enfeite:
--
--   rastreio   a transportadora deu baixa — é fato
--   carimbo    a plataforma disse "entregue" e nós anotamos a hora — é fato,
--              com precisão de minutos
--   historico  pedido que JÁ estava entregue quando isto foi criado — é
--              ESTIMATIVA, e por isso fica fora da régua automática
--
-- Misturar estimativa com fato numa coluna só é como um relatório passa a
-- mentir sem ninguém perceber. Aqui a diferença fica escrita na linha.
--
-- ── ⚠️ O histórico NÃO entra na régua ─────────────────────────────────────
--
-- Os 104 pedidos já entregues receberiam a oferta no mesmo instante em que a
-- mensagem fosse ligada — 104 WhatsApps de uma vez, alguns para quem recebeu
-- há dois meses. É o mesmo acidente que o marco zero da 20260873 existe para
-- impedir.
--
-- Eles ficam marcados como `historico` e a régua os ignora. Se um dia você
-- quiser ofertar para essa base, é uma campanha DELIBERADA, não um efeito
-- colateral de ligar uma função.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.carbo_entrega_carimbo (
  bling_id     bigint primary key,
  entregue_em  timestamptz not null,
  origem       text not null check (origem in ('rastreio', 'carimbo', 'historico')),
  criado_em    timestamptz not null default now()
);

comment on table public.carbo_entrega_carimbo is
  'Quando cada pedido foi entregue. Existe porque a esteira é view calculada e não guarda histórico de etapa — sem anotar, o instante se perde. `origem` separa FATO (rastreio/carimbo) de ESTIMATIVA (historico), e só os fatos entram na régua de recompra.';

create index if not exists carbo_entrega_carimbo_data_idx
  on public.carbo_entrega_carimbo (entregue_em) where origem <> 'historico';

alter table public.carbo_entrega_carimbo enable row level security;
drop policy if exists carbo_entrega_carimbo_read on public.carbo_entrega_carimbo;
create policy carbo_entrega_carimbo_read on public.carbo_entrega_carimbo
  for select to authenticated using (true);


-- ── Os ajustes da régua ───────────────────────────────────────────────────
--
-- Em tabela, não em constante no código: mudar "45 dias" tem de ser uma
-- decisão de operação, não um deploy.

create table if not exists public.carbo_recompra_config (
  id                 boolean primary key default true check (id),
  dias_para_ofertar  integer not null default 45 check (dias_para_ofertar > 0),
  dias_para_desistir integer not null default 30 check (dias_para_desistir > 0),
  atualizado_em      timestamptz not null default now()
);

insert into public.carbo_recompra_config (id) values (true)
on conflict (id) do nothing;

comment on table public.carbo_recompra_config is
  'Uma linha só (id=true). dias_para_ofertar: espera após a entrega. dias_para_desistir: quanto tempo depois da oferta o cliente sai da régua e vira base de campanha.';

alter table public.carbo_recompra_config enable row level security;
drop policy if exists carbo_recompra_config_read on public.carbo_recompra_config;
create policy carbo_recompra_config_read on public.carbo_recompra_config
  for select to authenticated using (true);
drop policy if exists carbo_recompra_config_write on public.carbo_recompra_config;
create policy carbo_recompra_config_write on public.carbo_recompra_config
  for update to authenticated using (true) with check (true);


-- ── Quem carimba ──────────────────────────────────────────────────────────
--
-- Roda junto da ponte (a cada 2 min). Idempotente: só anota pedido que ainda
-- não tem carimbo, então rodar mil vezes não muda nada.

create or replace function public.carbo_carimbar_entregas()
returns integer language plpgsql security definer set search_path = public as $$
declare v_qtd integer;
begin
  insert into public.carbo_entrega_carimbo (bling_id, entregue_em, origem)
  select e.bling_id,
         -- A data da transportadora ganha da hora em que nós percebemos: ela é
         -- quando o cliente RECEBEU, e é disso que a régua precisa contar.
         coalesce(r.entregue_em, now()),
         case when r.entregue_em is not null then 'rastreio' else 'carimbo' end
  from public.bling2_esteira e
  left join public.rastreio_envios r on r.codigo = e.rastreio
  where e.etapa = 'entregue'
  on conflict (bling_id) do nothing;

  get diagnostics v_qtd = row_count;
  return v_qtd;
end $$;


-- ── Marco zero: o que já está entregue vira histórico ─────────────────────
--
-- ⚠️ ANTES da primeira carimbagem automática, senão os 104 pedidos antigos
-- receberiam `entregue_em = now()` e entrariam na régua daqui a 45 dias, todos
-- no mesmo dia, como se tivessem sido entregues hoje.
--
-- A estimativa usa a média medida do próprio sistema (compra→postagem 3,1 dias
-- + postagem→entrega 2,5 ≈ 6). Ela NÃO é usada para nada automático — serve só
-- para a linha ter uma data plausível se alguém for montar uma campanha manual.

insert into public.carbo_entrega_carimbo (bling_id, entregue_em, origem)
select e.bling_id,
       coalesce(r.entregue_em, (e.data_pedido + 6)::timestamptz),
       case when r.entregue_em is not null then 'rastreio' else 'historico' end
from public.bling2_esteira e
left join public.rastreio_envios r on r.codigo = e.rastreio
where e.etapa = 'entregue'
on conflict (bling_id) do nothing;


-- ═══════════════════════════════════════════════════════════════════════════
-- A pipeline
--
-- Coluna é CALCULADA, como na esteira de entrega. Nada se arrasta: um card
-- movido à mão mentiria assim que a próxima venda chegasse.
--
-- ⚠️ "Recomprou" é OBSERVAÇÃO, não atribuição. A view enxerga que houve venda
-- nova do mesmo CPF depois da entrega — não que ela aconteceu POR CAUSA da
-- oferta. O nome da coluna e este comentário existem para que ninguém
-- transforme correlação em métrica de campanha sem perceber.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace view public.carbo_recompra_pipeline
with (security_invoker = true) as
with cfg as (
  select dias_para_ofertar, dias_para_desistir from public.carbo_recompra_config where id
),
entregue as (
  select e.bling_id, e.pedido_loja, e.canal, e.cliente, e.cliente_fone, e.total,
         e.entrega_cidade, e.entrega_uf,
         bo.contato_id,
         c.cpf_cnpj,
         ca.entregue_em,
         ca.origem
  from public.bling2_esteira e
  join public.bling2_orders  bo on bo.bling_id = e.bling_id
  join public.carbo_entrega_carimbo ca on ca.bling_id = e.bling_id
  left join public.bling2_contacts c on c.bling_id = bo.contato_id
  where e.etapa = 'entregue'
),
com_recompra as (
  select ent.*,
    -- Venda nova do MESMO CPF depois da entrega, em QUALQUER canal: o que
    -- importa é o cliente ter voltado, não por onde ele voltou.
    exists (
      select 1
      from public.bling2_orders b2
      join public.bling2_contacts c2 on c2.bling_id = b2.contato_id
      where c2.cpf_cnpj = ent.cpf_cnpj
        and ent.cpf_cnpj is not null
        and b2.bling_id <> ent.bling_id
        and b2.situacao_id = 9
        and b2.data::date > ent.entregue_em::date
    ) as recomprou,
    -- A oferta já saiu? Mesma máquina das outras mensagens: uma linha por
    -- (bling_id, etapa) em carbo_msg_envios, aqui com etapa 'recompra'.
    (select v.enviado_em from public.carbo_msg_envios v
      where v.bling_id = ent.bling_id and v.etapa = 'recompra'
        and v.status = 'enviado') as ofertado_em
  from entregue ent
)
select
  r.bling_id,
  r.pedido_loja,
  r.canal,
  r.cliente,
  r.cliente_fone,
  r.cpf_cnpj,
  r.total,
  r.entrega_cidade,
  r.entrega_uf,
  r.entregue_em,
  r.origem                                       as origem_da_data,
  r.ofertado_em,
  r.recomprou,
  (current_date - r.entregue_em::date)           as dias_desde_entrega,
  case
    -- Voltou: acabou a régua para este pedido, independente do resto.
    when r.recomprou                                          then 'recomprou'
    -- Histórico nunca entra na régua automática — a data é estimada.
    when r.origem = 'historico'                               then 'historico'
    when r.ofertado_em is not null
     and current_date - r.ofertado_em::date > (select dias_para_desistir from cfg)
                                                              then 'sem_retorno'
    when r.ofertado_em is not null                            then 'ofertado'
    when current_date - r.entregue_em::date >= (select dias_para_ofertar from cfg)
                                                              then 'ofertar'
    else                                                           'entregue'
  end                                            as coluna
from com_recompra r;

comment on view public.carbo_recompra_pipeline is
  'Régua de recompra: entregue → ofertar → ofertado → recomprou / sem_retorno. Coluna calculada, nada arrastável. `historico` é pedido entregue antes desta régua existir (data estimada) e fica FORA do disparo automático — ofertar a essa base é campanha deliberada.';


-- ═══════════════════════════════════════════════════════════════════════════
-- Conferência
-- ═══════════════════════════════════════════════════════════════════════════

-- (a) Como a base se distribui hoje. Espera-se quase tudo em `historico` —
--     é o marco zero funcionando, não erro.
select coluna, count(*) as pedidos, sum(total) as valor
from public.carbo_recompra_pipeline
group by coluna
order by 2 desc;

-- (b) Quantos JÁ recompraram — o número que diz se a régua vale a pena.
select count(*) filter (where recomprou)                as ja_recompraram,
       count(*)                                         as base,
       round(100.0 * count(*) filter (where recomprou) / nullif(count(*),0), 1) as pct
from public.carbo_recompra_pipeline;

-- (c) A origem das datas. `historico` só deve existir para o que já estava
--     entregue hoje; daqui pra frente tudo vira `rastreio` ou `carimbo`.
select origem_da_data, count(*), min(entregue_em), max(entregue_em)
from public.carbo_recompra_pipeline
group by origem_da_data
order by 2 desc;
