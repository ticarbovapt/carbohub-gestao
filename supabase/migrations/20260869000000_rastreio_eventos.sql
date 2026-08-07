-- ═══════════════════════════════════════════════════════════════════════════
-- Rastreio dos envios: o caminho, não só a etapa
--
-- A esteira hoje sabe em que ETAPA o pedido está (etiqueta / em trânsito /
-- entregue), porque isso ela deduz do Bling e da plataforma. O que ela não sabe
-- é o CAMINHO: onde o volume passou, quando, e quando deve chegar. Esse dado só
-- existe na transportadora.
--
-- ── O desenho, e por que ele é assim ──────────────────────────────────────
--
--   rastreio_envios   uma linha por CÓDIGO de rastreio — o estado atual
--   rastreio_eventos  uma linha por MOVIMENTAÇÃO — o histórico
--
-- Separados de propósito. O card precisa do estado atual a cada abertura (uma
-- linha, barato) e do histórico só quando alguém expande (muitas linhas). Num
-- jsonb único, toda abertura de quadro arrastaria o trajeto inteiro de 130
-- pedidos.
--
-- A chave é o CÓDIGO, não o pedido. Um pedido pode ter mais de um volume, com
-- códigos diferentes e trajetos diferentes; e o mesmo código nunca pertence a
-- dois pedidos. Amarrar em `bling_id` daria empate no dia em que o primeiro
-- pedido de dois volumes aparecesse — e ele aparece.
--
-- ── Duas fontes, não cinco transportadoras ────────────────────────────────
--
-- Olhando os ~170 pedidos com rastreio, o volume se concentra em dois lugares
-- que sabem responder:
--
--   Mercado Envios   ~74  API do ML (já temos token; já chamamos /shipments)
--   Melhor Envio     ~78  Jadlog `.Package` + Correios (Mini Envios/PAC/SEDEX)
--   Amazon DBA       ~10  só status, sem trajeto
--   Mandaê            ~4  API própria
--
-- Correios e Jadlog entram pelo Melhor Envio porque a etiqueta foi comprada
-- lá. Isso importa: a API pública de rastreio dos Correios foi descontinuada
-- em 2023 e hoje exige contrato e credencial CWS. Quem comprou a etiqueta no
-- Melhor Envio pula esse problema inteiro.
--
-- Por isso `fonte` é de onde veio a INFORMAÇÃO, e `transportadora` é quem
-- carrega a caixa. São coisas diferentes: um envio da Jadlog tem
-- fonte = 'melhorenvio'. Misturar os dois campos é o que faz alguém procurar
-- uma "API da Jadlog" que não vamos usar.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.rastreio_envios (
  codigo            text primary key,
  -- De onde vem a informação, NÃO quem carrega a caixa.
  fonte             text not null
                      check (fonte in ('mercadolivre','melhorenvio','desconhecida')),
  bling_id          bigint,
  -- Id do envio DENTRO da fonte (o pedido no Melhor Envio, o shipment no ML).
  -- Descobrir esse id custa uma busca; guardá-lo transforma toda rodada
  -- seguinte numa consulta direta.
  fonte_id          text,
  transportadora    text,
  servico           text,

  -- Lista branca, como todo status neste banco. Valor fora dela é INSERT
  -- falhando alto, em vez de um estado novo que nenhuma tela sabe pintar.
  status            text
                      check (status is null or status in
                        ('postado','em_transito','saiu_entrega','entregue',
                         'problema','devolvido','cancelado')),
  status_descricao  text,          -- o texto cru da transportadora

  previsao_entrega  date,
  postado_em        timestamptz,
  entregue_em       timestamptz,
  ultimo_evento_em  timestamptz,
  url_rastreio      text,

  -- Consulta que falhou não pode virar silêncio: fica escrito o que houve e
  -- quando. Sem isto, "sem eventos" e "a API recusou o token" são a mesma
  -- tela vazia — foi assim que o sync do Meta passou 719 rodadas sem ninguém
  -- perceber.
  consultado_em     timestamptz,
  erro              text,
  raw               jsonb,
  criado_em         timestamptz not null default now()
);

create index if not exists rastreio_envios_bling_idx  on public.rastreio_envios (bling_id);
create index if not exists rastreio_envios_fila_idx   on public.rastreio_envios (consultado_em)
  where status is distinct from 'entregue';

comment on table public.rastreio_envios is
  'Estado atual de cada código de rastreio. `fonte` = quem informa (API do ML ou do Melhor Envio); `transportadora` = quem carrega. Chave é o código porque um pedido pode ter vários volumes.';


create table if not exists public.rastreio_eventos (
  codigo      text not null references public.rastreio_envios(codigo) on delete cascade,
  ocorrido_em timestamptz not null,
  descricao   text not null,
  status      text,
  cidade      text,
  uf          text,
  criado_em   timestamptz not null default now(),
  -- A chave natural é o dedupe. Toda rodada relê o histórico inteiro da
  -- transportadora; sem isto, um evento viraria uma linha nova a cada meia
  -- hora e o trajeto do card seria a mesma parada repetida quarenta vezes.
  primary key (codigo, ocorrido_em, descricao)
);

create index if not exists rastreio_eventos_ordem_idx
  on public.rastreio_eventos (codigo, ocorrido_em desc);

comment on table public.rastreio_eventos is
  'Uma linha por movimentação. A PK (codigo, ocorrido_em, descricao) é o dedupe: a coleta relê o histórico inteiro a cada rodada.';


-- ── RLS ────────────────────────────────────────────────────────────────────
alter table public.rastreio_envios  enable row level security;
alter table public.rastreio_eventos enable row level security;

drop policy if exists rastreio_envios_leitura  on public.rastreio_envios;
drop policy if exists rastreio_eventos_leitura on public.rastreio_eventos;
drop policy if exists rastreio_envios_service  on public.rastreio_envios;
drop policy if exists rastreio_eventos_service on public.rastreio_eventos;

create policy rastreio_envios_leitura  on public.rastreio_envios  for select to authenticated using (true);
create policy rastreio_eventos_leitura on public.rastreio_eventos for select to authenticated using (true);
create policy rastreio_envios_service  on public.rastreio_envios  for all to service_role using (true) with check (true);
create policy rastreio_eventos_service on public.rastreio_eventos for all to service_role using (true) with check (true);

grant select on public.rastreio_envios, public.rastreio_eventos to authenticated;


-- ── A view que o card lê ───────────────────────────────────────────────────
--
-- Uma linha por código, com o trajeto embutido. Não mexo na `bling2_esteira`:
-- ela foi criada com `o.*`, o que congelou a lista de colunas, e um
-- CREATE OR REPLACE nela já falhou antes ("cannot change name of view
-- column"). A tela cruza pelo código, que ela já tem.

create or replace view public.rastreio_card
with (security_invoker = true) as
select
  e.codigo,
  e.fonte,
  e.bling_id,
  e.fonte_id,
  e.transportadora,
  e.servico,
  e.status,
  e.status_descricao,
  e.previsao_entrega,
  e.postado_em,
  e.entregue_em,
  e.ultimo_evento_em,
  e.url_rastreio,
  e.consultado_em,
  e.erro,
  -- Atrasado é passou da previsão E ainda não chegou. Sem a segunda metade,
  -- todo pedido entregue com um dia de atraso ficaria vermelho para sempre.
  (e.previsao_entrega is not null
     and e.entregue_em is null
     and e.previsao_entrega < current_date)                    as atrasado,
  (select count(*) from public.rastreio_eventos v where v.codigo = e.codigo) as qtd_eventos,
  coalesce((
    select jsonb_agg(jsonb_build_object(
             'ocorrido_em', v.ocorrido_em,
             'descricao',   v.descricao,
             'status',      v.status,
             'cidade',      v.cidade,
             'uf',          v.uf)
           order by v.ocorrido_em desc)
    from public.rastreio_eventos v
    where v.codigo = e.codigo
  ), '[]'::jsonb)                                              as eventos
from public.rastreio_envios e;

comment on view public.rastreio_card is
  'Estado + trajeto de cada código, para o card da Esteira do On-line. A tela cruza pelo código do rastreio; a bling2_esteira não é tocada (foi criada com o.* e não aceita CREATE OR REPLACE).';

grant select on public.rastreio_card to authenticated;


-- ═══════════════════════════════════════════════════════════════════════════
-- Segredo do cron — fora do repositório
--
-- O cron do Bling 2 (`20260838000000`) tem o `X-Cron-Secret` em texto puro
-- dentro do arquivo, versionado no GitHub. Não vou repetir isso: aqui o valor
-- mora numa tabela de um schema privado, sem grant para ninguém, e o comando
-- do cron lê de lá. Quem insere o valor é você, no SQL Editor — ele nunca
-- passa pelo repositório.
-- ═══════════════════════════════════════════════════════════════════════════

create schema if not exists private;

create table if not exists private.cron_config (
  chave text primary key,
  valor text not null,
  criado_em timestamptz not null default now()
);

comment on table private.cron_config is
  'Segredos usados pelos comandos de cron. Schema privado, sem grant: só o superusuário e as funções SECURITY DEFINER enxergam. Existe para que segredo nenhum precise ser versionado numa migração.';

revoke all on schema private from public, anon, authenticated;
revoke all on private.cron_config from public, anon, authenticated;


-- ═══════════════════════════════════════════════════════════════════════════
-- Conferência
-- ═══════════════════════════════════════════════════════════════════════════

-- Deve voltar as duas tabelas e a view, todas vazias por enquanto.
select 'rastreio_envios'  as objeto, count(*) from public.rastreio_envios
union all
select 'rastreio_eventos', count(*) from public.rastreio_eventos
union all
select 'rastreio_card',    count(*) from public.rastreio_card;

-- Quantos códigos existem hoje esperando para serem consultados, por fonte
-- provável. É o tamanho do trabalho que a coleta vai encontrar na 1ª rodada.
select coalesce(e.transportadora, '(sem transportadora)') as transportadora,
       count(*)                                           as pedidos,
       count(e.rastreio)                                  as com_codigo
from public.bling2_esteira e
where e.etapa <> 'cancelado'
group by 1
order by 2 desc;
