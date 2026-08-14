-- ═══════════════════════════════════════════════════════════════════════════
-- Terceira pipeline: recuperação de carrinho
--
-- Da venda à entrega (1ª) e régua de recompra (2ª) falam com quem JÁ comprou.
-- Esta fala com quem quase comprou: encheu o carrinho, chegou no checkout e não
-- terminou.
--
-- ── Por que só a Nuvemshop ────────────────────────────────────────────────
--
-- Mercado Livre e Amazon já fazem a própria recuperação, com o próprio texto e
-- pelo próprio canal — e não expõem o contato de quem abandonou (nem poderiam:
-- o comprador é cliente DELES até o pedido existir). A loja própria é o único
-- lugar onde o carrinho é nosso, e por isso é o único lugar onde isso pode ser
-- feito. Não é limitação da implementação; é de onde o dado existe.
--
-- ── ⚠️ As três travas, e nenhuma delas é opcional ─────────────────────────
--
-- Mensagem de recuperação é a mais perigosa das três pipelines: ela vai para
-- quem NÃO é cliente ainda, é puramente comercial, e o erro típico não é não
-- enviar — é enviar demais, ou enviar para quem já comprou.
--
--   1. MARCO ZERO por data, não por marcação.
--      `inicio_em` na config. Carrinho abandonado ANTES desse instante é
--      histórico e nunca entra na fila. Sem isso, a primeira sincronização
--      importaria semanas de carrinhos velhos e mandaria a 1ª mensagem para
--      todos de uma vez — inclusive para gente que já comprou por outro
--      caminho. Escolhi data em vez de marcar linha a linha (como fez a
--      20260873) porque aqui a tabela nasce VAZIA: não há o que marcar na
--      migração, e a enxurrada viria na primeira rodada do sync, depois.
--
--   2. O RELÓGIO DE CADA PASSO COMEÇA NO PASSO ANTERIOR.
--      A 1ª conta do abandono; a 2ª conta da 1ª; a 3ª conta da 2ª. Se as três
--      contassem do abandono, um carrinho que aparecesse já velho (sync parado
--      duas horas, importação inicial, qualquer atraso) ficaria com as três
--      janelas vencidas ao mesmo tempo e a pessoa receberia três mensagens
--      seguidas. Encadeado, isso é impossível por construção.
--
--   3. RECUPERADO SAI DA FILA ANTES DE QUALQUER COISA.
--      É a primeira condição do CASE. Mandar "esqueceu algo no carrinho?" para
--      quem acabou de comprar é o erro que faz a operação desligar a função
--      inteira — e com razão.
--
-- ⚠️ RODE EM BLOCOS.
-- ═══════════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — o espelho do carrinho                                       ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
--
-- Tabela própria, e não uma linha em `ecommerce_orders`, por uma razão que não
-- é de organização: `ecommerce_orders` tem uma linha por ITEM e alimenta
-- faturamento, meta, dashboard e dedução de estoque. Carrinho abandonado não é
-- venda de nada; enfiá-lo lá exigiria que TODA consulta de receita passasse a
-- excluir um status novo — e a que alguém esquecesse de mudar passaria a contar
-- dinheiro que nunca entrou.

create table if not exists public.nuvemshop_carrinhos (
  checkout_id    bigint primary key,
  token          text,

  abandonado_em  timestamptz not null,
  -- Quando NÓS vimos pela primeira vez. Diferente de `abandonado_em`: serve
  -- para saber se um carrinho entrou atrasado (sync parado) sem confundir isso
  -- com o cliente ter demorado.
  visto_em       timestamptz not null default now(),
  atualizado_em  timestamptz not null default now(),

  -- A plataforma diz que o checkout foi concluído. É o FATO da recuperação;
  -- o cruzamento por e-mail (na view) é a rede de segurança para quando este
  -- campo não vier.
  completado_em  timestamptz,

  cliente        text,
  -- ⚠️ Telefone CRU, como a plataforma mandou. Quem normaliza é o `kanban-n8n`,
  -- e só ele — mesma regra de `ecommerce_orders.cliente_fone`. Dois
  -- normalizadores divergem, e o que diverge aqui manda WhatsApp para um número
  -- que não existe.
  telefone       text,
  email          text,

  total          numeric(14,2) not null default 0,
  moeda          text,
  itens          integer not null default 0,
  -- Legível, para a mensagem e para o card: "CarboZé 100ml ×2 · Kit 5un ×1".
  produtos       text,

  -- ⚠️ O link é a peça central desta pipeline. Uma mensagem de recuperação sem
  -- o caminho de volta ao carrinho é só um lembrete de que a pessoa desistiu:
  -- ela teria de reabrir a loja e refazer a escolha, que é exatamente o atrito
  -- que a fez abandonar. A Nuvemshop devolve uma URL que restaura o carrinho.
  link           text,

  raw            jsonb
);

comment on table public.nuvemshop_carrinhos is
  'Checkouts abandonados da loja própria (Nuvemshop). Tabela separada de ecommerce_orders de propósito: aquela tem uma linha por item e alimenta faturamento — carrinho abandonado não é venda, e misturá-lo obrigaria toda consulta de receita a excluir um status novo.';

create index if not exists nuvemshop_carrinhos_abandono_idx
  on public.nuvemshop_carrinhos (abandonado_em desc);
create index if not exists nuvemshop_carrinhos_abertos_idx
  on public.nuvemshop_carrinhos (abandonado_em) where completado_em is null;

alter table public.nuvemshop_carrinhos enable row level security;

drop policy if exists nuvemshop_carrinhos_leitura on public.nuvemshop_carrinhos;
drop policy if exists nuvemshop_carrinhos_service on public.nuvemshop_carrinhos;

create policy nuvemshop_carrinhos_leitura on public.nuvemshop_carrinhos
  for select to authenticated using (true);
-- Escrita é do sync, e só dele: o carrinho é espelho da plataforma. Não há
-- policy de update/delete para `authenticated` pelo mesmo motivo da esteira —
-- linha editada à mão mente na rodada seguinte.
create policy nuvemshop_carrinhos_service on public.nuvemshop_carrinhos
  for all to service_role using (true) with check (true);

grant select on public.nuvemshop_carrinhos to authenticated;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — as janelas                                                  ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
--
-- Em tabela, não em constante no código, pela mesma razão da régua de recompra:
-- mudar "1 hora" tem de ser decisão de operação, não deploy.

create table if not exists public.carbo_carrinho_config (
  id              boolean primary key default true check (id),

  -- 1ª mensagem: minutos APÓS O ABANDONO. Minutos, e não horas, porque esta é a
  -- única janela curta — o resto do mercado dispara entre 30 min e 2 h, quando a
  -- intenção de compra ainda está viva.
  minutos_1       integer not null default 60  check (minutos_1 >= 15),
  -- 2ª: horas APÓS A 1ª. 3ª: horas APÓS A 2ª. Ver a trava 2 no cabeçalho.
  horas_2         integer not null default 23  check (horas_2 > 0),
  horas_3         integer not null default 48  check (horas_3 > 0),
  -- Depois da 3ª, quanto tempo até declarar perdido. Não muda envio nenhum —
  -- muda de coluna, para o quadro não acumular carrinho morto para sempre.
  horas_desistir  integer not null default 168 check (horas_desistir > 0),

  -- Carrinho abaixo disto não é perseguido. Frete de um produto de R$ 20 come a
  -- margem inteira, e cada mensagem gasta um crédito e um pouco da paciência de
  -- quem recebe. 0 = persegue todos.
  valor_minimo    numeric(14,2) not null default 0 check (valor_minimo >= 0),

  -- ⚠️ MARCO ZERO. Carrinho abandonado antes disto é histórico e NUNCA entra na
  -- fila. É o que impede a primeira sincronização de virar uma rajada.
  inicio_em       timestamptz not null default now(),

  atualizado_em   timestamptz not null default now()
);

insert into public.carbo_carrinho_config (id) values (true)
on conflict (id) do nothing;

comment on table public.carbo_carrinho_config is
  'Uma linha só (id=true). minutos_1 conta do ABANDONO; horas_2 conta da 1ª mensagem; horas_3 conta da 2ª — encadeado de propósito, senão um carrinho que aparece já velho dispara as três de uma vez. inicio_em é o marco zero: carrinho anterior é histórico e nunca entra na fila.';

alter table public.carbo_carrinho_config enable row level security;
drop policy if exists carbo_carrinho_config_read  on public.carbo_carrinho_config;
drop policy if exists carbo_carrinho_config_write on public.carbo_carrinho_config;
create policy carbo_carrinho_config_read on public.carbo_carrinho_config
  for select to authenticated using (true);
create policy carbo_carrinho_config_write on public.carbo_carrinho_config
  for update to authenticated using (true) with check (true);

grant select on public.carbo_carrinho_config to authenticated;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 3 — os três textos                                              ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
--
-- Entram como etapas em `carbo_msg_templates`, iguais às outras: nada de fila
-- nova, cron novo ou função nova. A PK (bling_id, etapa) de `carbo_msg_envios`
-- garante UMA de cada por carrinho, para sempre.
--
-- ⚠️ Sobre reusar `bling_id` para guardar o id do CHECKOUT.
--
-- Não é gambiarra e não colide, mas o motivo precisa estar escrito: a chave é
-- (bling_id, etapa), e as etapas `carrinho_*` são de uso EXCLUSIVO desta
-- pipeline — nenhum pedido do Bling as usa, porque as etapas da esteira são uma
-- lista fechada calculada pela `bling2_esteira`. Ou seja: mesmo que um checkout
-- da Nuvemshop tenha por acaso o mesmo número de um pedido do Bling, as duas
-- linhas nunca ocupam a mesma chave.
--
-- Isto é o oposto do erro do `bling_nf_id`, onde um id da conta 2 podia casar
-- com nota REAL da conta 1: lá as duas coisas disputavam a MESMA coluna com o
-- MESMO significado. Aqui o significado está na etapa.

alter table public.carbo_msg_templates
  drop constraint if exists carbo_msg_templates_etapa_check;

alter table public.carbo_msg_templates
  add constraint carbo_msg_templates_etapa_check
  check (etapa in ('confirmado','nf_emitida','etiqueta','em_transito',
                   'saiu_entrega','entregue','recompra',
                   'carrinho_1','carrinho_2','carrinho_3'));

insert into public.carbo_msg_templates (etapa, ativo, titulo, texto, atraso_min, instancia) values
  ('carrinho_1', false, 'Carrinho — lembrete',
   'Oi, {{primeiro_nome}}! Aqui é da Carbo 👋' || chr(10) || chr(10) ||
   'Vi que você montou seu pedido e não chegou a finalizar:' || chr(10) ||
   '{{produtos}}' || chr(10) || chr(10) ||
   'Deixei tudo separado do jeito que você escolheu — é só terminar por aqui:' || chr(10) ||
   '{{link_carrinho}}' || chr(10) || chr(10) ||
   'Se ficou alguma dúvida sobre o produto, me responde que eu te ajudo.',
   -- ⚠️ ZERO, e é importante que seja. A espera desta pipeline são as janelas
   -- da `carbo_carrinho_config`, aplicadas na FILA. `atraso_min` conta a partir
   -- da detecção, que é outra coisa — usar os dois somaria duas esperas.
   0, 'carbo-comercial'),

  ('carrinho_2', false, 'Carrinho — ainda dá tempo',
   'Oi, {{primeiro_nome}}! Passando de novo por aqui 🙂' || chr(10) || chr(10) ||
   'Seu carrinho de {{valor}} ainda está guardado:' || chr(10) ||
   '{{produtos}}' || chr(10) || chr(10) ||
   'Finalizar leva menos de um minuto: {{link_carrinho}}' || chr(10) || chr(10) ||
   'Se preferir, me diz por aqui que eu fecho o pedido pra você.',
   0, 'carbo-comercial'),

  ('carrinho_3', false, 'Carrinho — última mensagem',
   'Oi, {{primeiro_nome}}! Esta é minha última mensagem sobre esse carrinho, prometo 🙂' || chr(10) || chr(10) ||
   'Se ainda quiser, ele está aqui: {{link_carrinho}}' || chr(10) || chr(10) ||
   'E se não for o momento, tudo bem — é só me avisar que eu não te chamo mais sobre isso.',
   0, 'carbo-comercial')
on conflict (etapa) do nothing;

-- ⚠️ Instância COMERCIAL, junto com a recompra, nunca a de serviço.
--
-- Recuperação é a conversa mais fácil de ser recebida como spam das três: vai
-- para quem não comprou, sem pedido para justificar o contato. Se ela sair do
-- mesmo número do "seu pedido saiu para entrega", quem bloquear por causa dela
-- perde o aviso de entrega junto — e aí a pipeline de serviço paga a conta de
-- uma campanha comercial.


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 4 — a pipeline                                                  ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
--
-- Coluna CALCULADA, como nas outras duas. Nada se arrasta: um card movido à mão
-- mentiria na rodada seguinte do sync.

create or replace view public.carbo_carrinho_pipeline
with (security_invoker = true) as
with cfg as (
  select minutos_1, horas_2, horas_3, horas_desistir, valor_minimo, inicio_em
  from public.carbo_carrinho_config where id
),
envios as (
  -- Uma linha por carrinho com o instante de cada uma das três mensagens.
  -- ⚠️ `coalesce(enviado_em, detectado_em)`, e não só `enviado_em`: a fila
  -- exclui qualquer carrinho que JÁ TENHA linha, com qualquer status. Olhar só
  -- o enviado deixaria um envio que falhou parado para sempre na coluna "hora
  -- de mandar", pedindo uma ação que o sistema nunca mais vai executar. Foi
  -- exatamente esse o conserto da 20260892 na régua de recompra.
  select v.bling_id as checkout_id,
    max(case when v.etapa = 'carrinho_1' then coalesce(v.enviado_em, v.detectado_em) end) as msg1_em,
    max(case when v.etapa = 'carrinho_2' then coalesce(v.enviado_em, v.detectado_em) end) as msg2_em,
    max(case when v.etapa = 'carrinho_3' then coalesce(v.enviado_em, v.detectado_em) end) as msg3_em
  from public.carbo_msg_envios v
  where v.etapa in ('carrinho_1','carrinho_2','carrinho_3')
  group by v.bling_id
),
base as (
  select
    c.*,
    e.msg1_em, e.msg2_em, e.msg3_em,
    -- ⚠️ OBSERVAÇÃO, não atribuição — mesma ressalva da régua de recompra.
    -- A view enxerga que houve pedido do mesmo e-mail depois do abandono. Não
    -- que ele aconteceu POR CAUSA da mensagem: a pessoa pode ter voltado
    -- sozinha, que é de longe o caso mais comum.
    --
    -- O que ela precisa acertar é o lado seguro: na dúvida, PAROU de perseguir.
    -- Por isso o cruzamento é frouxo de propósito (qualquer pedido do mesmo
    -- e-mail depois do abandono, em qualquer status que não seja cancelado).
    -- Falso positivo custa uma recuperação perdida; falso negativo custa
    -- mandar "esqueceu algo?" para quem já pagou.
    (c.completado_em is not null or exists (
      select 1 from public.ecommerce_orders o
      where o.platform = 'nuvemshop'
        and o.status <> 'cancelled'
        and nullif(lower(trim(o.cliente_email)), '') = nullif(lower(trim(c.email)), '')
        and o.ordered_at >= c.abandonado_em
    )) as recuperado,
    nullif(trim(coalesce(c.telefone, '')), '') is not null as tem_telefone,
    c.abandonado_em < (select inicio_em from cfg) as antes_do_marco
  from public.nuvemshop_carrinhos c
  left join envios e on e.checkout_id = c.checkout_id
)
select
  b.checkout_id,
  b.abandonado_em,
  b.completado_em,
  b.cliente,
  b.telefone,
  b.email,
  b.total,
  b.itens,
  b.produtos,
  b.link,
  b.msg1_em,
  b.msg2_em,
  b.msg3_em,
  b.recuperado,
  b.tem_telefone,
  round(extract(epoch from (now() - b.abandonado_em)) / 60)::integer as minutos_parado,

  -- Quando a PRÓXIMA mensagem vence. É o que faz o card dizer "em 40 min" em
  -- vez de deixar quem olha calcular de cabeça — e é o mesmo cálculo que a
  -- fila usa, escrito uma vez.
  case
    when b.msg3_em is not null then null
    when b.msg2_em is not null then b.msg2_em + ((select horas_3   from cfg) || ' hours')::interval
    when b.msg1_em is not null then b.msg1_em + ((select horas_2   from cfg) || ' hours')::interval
    else b.abandonado_em       + ((select minutos_1 from cfg) || ' minutes')::interval
  end as proxima_em,

  case
    -- 1º de todos: voltou a comprar. Acabou a perseguição, sempre.
    when b.recuperado                     then 'recuperado'
    -- Antes do marco zero: importado, nunca perseguido. Fica visível para
    -- campanha deliberada, fora do automático — igual ao histórico da recompra.
    when b.antes_do_marco                 then 'historico'
    -- Abaixo do valor mínimo: não vale o crédito nem o incômodo.
    when b.total < (select valor_minimo from cfg) then 'ignorado'
    -- ⚠️ Sem telefone é coluna PRÓPRIA, não um carrinho aberto qualquer.
    -- Ele nunca vai avançar sozinho: fica parado em "aberto" para sempre,
    -- inflando uma coluna de trabalho que ninguém pode fazer. Separado, vira o
    -- que de fato é — uma lista de gente com quem só dá para falar por e-mail,
    -- e um número que mede quanto a loja perde por não pedir o telefone antes.
    when not b.tem_telefone               then 'sem_telefone'
    when b.msg3_em is not null
     and now() > b.msg3_em + ((select horas_desistir from cfg) || ' hours')::interval
                                          then 'perdido'
    when b.msg3_em is not null            then 'msg3'
    when b.msg2_em is not null            then 'msg2'
    when b.msg1_em is not null            then 'msg1'
    else                                       'aberto'
  end as coluna
from base b;

comment on view public.carbo_carrinho_pipeline is
  'Recuperação de carrinho da loja própria: aberto → 1ª → 2ª → 3ª → recuperado / perdido. Coluna calculada, nada arrastável. `sem_telefone` é coluna própria porque esse carrinho nunca avança sozinho; `historico` é anterior ao marco zero e nunca entra na fila. `recuperado` é observação (houve pedido do mesmo e-mail depois do abandono), não atribuição — e é frouxo de propósito: errar para o lado de PARAR de perseguir é o erro barato.';

grant select on public.carbo_carrinho_pipeline to authenticated;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 5 — a fila ganha a quarta origem                                ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
--
-- Origem 1: a etapa da esteira.        Origem 2: `saiu_entrega`, do rastreio.
-- Origem 3: a régua de recompra.       Origem 4: os três passos do carrinho.
--
-- ⚠️ Duas colunas NOVAS no fim (`link_carrinho`, `produtos`) e nenhuma
-- reordenada: `create or replace view` só aceita ACRESCENTAR no fim. Mover ou
-- renomear obriga a DROP, e esta view é lida pelo `kanban-n8n` a cada minuto.
--
-- ⚠️ E uma CORREÇÃO que não é do carrinho, explicada no fim do bloco.

create or replace view public.carbo_msg_fila
with (security_invoker = true) as
with cfg as (
  select minutos_1, horas_2, horas_3, valor_minimo, inicio_em
  from public.carbo_carrinho_config where id
),
base as (
  select e.bling_id, e.etapa, e.cliente_fone, e.cliente, e.pedido_loja, e.pedido_numero,
         e.pedido_codigo, e.canal, e.total, e.nf_numero, e.nf_pdf, e.transportadora,
         e.servico, e.rastreio, e.entrega_cidade, e.entrega_uf,
         null::text as link_carrinho, null::text as produtos
  from public.bling2_esteira e
  where e.etapa <> 'cancelado'

  union all

  select e.bling_id, 'saiu_entrega', e.cliente_fone, e.cliente, e.pedido_loja, e.pedido_numero,
         e.pedido_codigo, e.canal, e.total, e.nf_numero, e.nf_pdf, e.transportadora,
         e.servico, e.rastreio, e.entrega_cidade, e.entrega_uf,
         null::text, null::text
  from public.bling2_esteira e
  join public.rastreio_card r on r.codigo = e.rastreio
  where r.status = 'saiu_entrega' and r.entregue_em is null and e.etapa <> 'cancelado'

  union all

  select e.bling_id, 'recompra', e.cliente_fone, e.cliente, e.pedido_loja, e.pedido_numero,
         e.pedido_codigo, e.canal, e.total, e.nf_numero, e.nf_pdf, e.transportadora,
         e.servico, e.rastreio, e.entrega_cidade, e.entrega_uf,
         null::text, null::text
  from public.bling2_esteira e
  join public.carbo_recompra_pipeline p on p.bling_id = e.bling_id
  where p.coluna = 'ofertar'

  union all

  -- ── Origem 4: recuperação de carrinho ────────────────────────────────────
  --
  -- Três `select`, um por passo, e cada um com a SUA condição de vencimento.
  -- Escritos separados de propósito: um único select com CASE decidindo a etapa
  -- esconderia justamente o que precisa ser óbvio aqui — que a 2ª só existe
  -- depois da 1ª ter saído, e a 3ª depois da 2ª.
  --
  -- `p.coluna = 'aberto'` (e 'msg1', 'msg2') já carrega, de graça, TODAS as
  -- travas: recuperado, histórico, abaixo do mínimo e sem telefone não estão em
  -- nenhuma dessas colunas. Repetir os filtros aqui seria uma segunda régua
  -- para divergir da primeira.
  select c.checkout_id, 'carrinho_1', c.telefone, c.cliente, null, null,
         null, 'Nuvemshop', c.total, null, null, null,
         null, null, null, null,
         c.link, c.produtos
  from public.carbo_carrinho_pipeline p
  join public.nuvemshop_carrinhos c on c.checkout_id = p.checkout_id
  where p.coluna = 'aberto'
    and now() >= c.abandonado_em + ((select minutos_1 from cfg) || ' minutes')::interval

  union all

  select c.checkout_id, 'carrinho_2', c.telefone, c.cliente, null, null,
         null, 'Nuvemshop', c.total, null, null, null,
         null, null, null, null,
         c.link, c.produtos
  from public.carbo_carrinho_pipeline p
  join public.nuvemshop_carrinhos c on c.checkout_id = p.checkout_id
  where p.coluna = 'msg1'
    and now() >= p.msg1_em + ((select horas_2 from cfg) || ' hours')::interval

  union all

  select c.checkout_id, 'carrinho_3', c.telefone, c.cliente, null, null,
         null, 'Nuvemshop', c.total, null, null, null,
         null, null, null, null,
         c.link, c.produtos
  from public.carbo_carrinho_pipeline p
  join public.nuvemshop_carrinhos c on c.checkout_id = p.checkout_id
  where p.coluna = 'msg2'
    and now() >= p.msg2_em + ((select horas_3 from cfg) || ' hours')::interval
)
select
  b.bling_id,
  b.etapa,
  t.titulo,
  t.texto,
  t.atraso_min,
  b.cliente_fone                                   as telefone,
  b.cliente                                        as nome,
  split_part(trim(b.cliente), ' ', 1)              as primeiro_nome,
  coalesce(b.pedido_codigo, b.pedido_loja, b.pedido_numero, '') as pedido,
  b.canal,
  b.total                                          as valor,
  b.nf_numero                                      as nf,
  b.nf_pdf                                         as link_nota,
  b.transportadora,
  b.servico,
  b.rastreio,
  b.entrega_cidade                                 as cidade,
  b.entrega_uf                                     as uf,
  r.url_rastreio                                   as link_rastreio,
  r.previsao_entrega                               as previsao,
  t.instancia,
  b.link_carrinho,
  b.produtos,
  -- ⚠️ Prioridade, e ela nasce agora porque só agora passou a fazer falta.
  --
  -- O `kanban-n8n` pega 20 linhas por rodada, sem ordem nenhuma — o que era
  -- inofensivo enquanto a fila só tinha aviso de entrega, todos igualmente
  -- urgentes. Com a recuperação de carrinho dentro dela, uma manhã de 60
  -- carrinhos abandonados pode consumir três rodadas inteiras e empurrar o
  -- "seu pedido saiu para entrega" para meia hora depois.
  --
  -- Serviço na frente do comercial: o cliente que está esperando a encomenda
  -- não pode ficar atrás de uma campanha. Quem ordena é a função de envio; aqui
  -- só se diz o que é o quê.
  case when b.etapa in ('carrinho_1','carrinho_2','carrinho_3','recompra')
       then 1 else 0 end                          as prioridade
from base b
join public.carbo_msg_templates t on t.etapa = b.etapa and t.ativo
left join public.rastreio_card r on r.codigo = b.rastreio
where not exists (
  select 1 from public.carbo_msg_envios v
  where v.bling_id = b.bling_id
    and v.etapa = b.etapa
    -- ⚠️ CORREÇÃO, e ela não é do carrinho — é da espera `atraso_min`.
    --
    -- O `kanban-n8n`, quando o template tem `atraso_min > 0`, grava uma linha
    -- 'pendente' e volta na rodada seguinte para conferir se o tempo passou.
    -- Só que a fila excluía QUALQUER linha existente, inclusive a 'pendente' —
    -- então a rodada seguinte não via mais o pedido, e a mensagem NUNCA saía.
    --
    -- Ninguém notou porque a única etapa com atraso é `entregue` (180 min), e
    -- ela está desligada desde que nasceu. Ligar seria descobrir do pior jeito:
    -- sem erro, sem log, só o cliente não recebendo.
    --
    -- Deixar a 'pendente' voltar à fila é o que fecha o ciclo — quem decide se
    -- já pode enviar é o `kanban-n8n`, que é quem tem o relógio.
    and v.status <> 'pendente'
)
  and nullif(trim(coalesce(b.cliente_fone, '')), '') is not null;

comment on view public.carbo_msg_fila is
  'O que está esperando aviso, de QUATRO origens: etapa da esteira, saiu_entrega (rastreio), régua de recompra e os três passos da recuperação de carrinho. A função de envio só troca as variáveis e entrega ao n8n. ⚠️ Linha `pendente` em carbo_msg_envios CONTINUA na fila de propósito: é assim que o atraso_min do template funciona.';


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 6 — o sync do carrinho entra na grade                           ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
--
-- 15 minutos, e não 1: a menor janela desta pipeline é de 60 min, então
-- sincronizar de minuto em minuto só gastaria cota de API para reler carrinho
-- que não mudou. E o atraso máximo que isso introduz (15 min sobre uma janela
-- de 60) não muda nada para quem recebe.
--
-- ⚠️ Minuto 4, para não empilhar com o `bling2-order-details` (:03) nem com o
-- `bling2-nfe-recheck` (:07). Fase que sobe junto com outra é fase que morre no
-- meio quando a janela de API estoura.

do $$
declare v_seg text; j bigint;
begin
  select valor into v_seg from private.cron_config where chave = 'rastreio_cron_secret';
  if v_seg is null or v_seg = '' then
    raise exception 'Falta o segredo em private.cron_config (chave rastreio_cron_secret).';
  end if;

  for j in select jobid from cron.job where jobname = 'nuvemshop-carrinhos-15min' loop
    perform cron.unschedule(j);
  end loop;

  perform cron.schedule(
    'nuvemshop-carrinhos-15min', '4-59/15 * * * *',
    format($cmd$
      select net.http_post(
        url     := 'https://wpkfirmapxevzpxjovjr.supabase.co/functions/v1/nuvemshop-carrinhos',
        headers := jsonb_build_object('Content-Type','application/json','X-Cron-Secret', %L),
        body    := '{"source":"cron"}'::jsonb,
        timeout_milliseconds := 30000
      );
    $cmd$, v_seg)
  );
end $$;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 7 — conferência                                                 ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- (a) As dez etapas de mensagem. As três de carrinho DESLIGADAS, saindo pela
--     instância comercial. Nada dispara até alguém ligar na tela.
select etapa, ativo, instancia, titulo, atraso_min
from public.carbo_msg_templates
order by array_position(
  array['confirmado','nf_emitida','etiqueta','em_transito','saiu_entrega','entregue',
        'recompra','carrinho_1','carrinho_2','carrinho_3'], etapa);

-- (b) O marco zero e as janelas valendo agora.
select inicio_em, minutos_1, horas_2, horas_3, horas_desistir, valor_minimo
from public.carbo_carrinho_config;

-- (c) A tabela de carrinhos está VAZIA — ela só enche quando a edge function
--     `nuvemshop-carrinhos` for publicada e rodar pela primeira vez.
select count(*) as carrinhos from public.nuvemshop_carrinhos;

-- (d) A fila NÃO pode ter ganhado linha nenhuma com esta migração (templates
--     de carrinho desligados + tabela vazia). Se aparecer `carrinho_*` aqui,
--     pare: alguém ligou o template antes de conferir o que o sync trouxe.
select etapa, count(*) as na_fila
from public.carbo_msg_fila group by etapa order by 1;

-- (e) O agendamento existe?
select jobname, schedule, active from cron.job
where jobname = 'nuvemshop-carrinhos-15min';
