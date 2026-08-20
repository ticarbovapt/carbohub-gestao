-- ═══════════════════════════════════════════════════════════════════════════
-- FASE 1 — o espelho dos envios do Melhor Envio
--
-- ── O buraco, numa linha ──────────────────────────────────────────────────
--
-- O `rastreio-sync` monta a fila assim:
--
--     from("bling2_esteira").not("rastreio", "is", null)
--
-- Ou seja: ele só rastreia envio cujo código o BLING já conhece. Etiqueta
-- gerada no painel do Melhor Envio nasce fora do Bling, não tem código lá, e
-- por isso nunca entra na fila. O envio existe, está pago, às vezes já foi
-- postado — e a esteira mostra "NF emitida".
--
-- ⚠️ E o dado JÁ É BAIXADO: o `mapearPedidosME()` lista `/api/v2/me/orders`
-- toda rodada e descarta tudo que não casa com a esteira. O que faltava não era
-- a chamada — era um lugar para guardar o envio sem depender do Bling.
--
-- ── Por que tabela nova, e não `rastreio_envios` ──────────────────────────
--
-- `rastreio_envios` é chaveada por `codigo` e representa O TRAJETO DE UM
-- CÓDIGO. Uma etiqueta gerada e ainda não paga **não tem código nenhum** — é
-- exatamente o estado dos 19 pedidos que motivaram este trabalho. Chaveada por
-- código, ela não consegue guardar o caso que interessa.
--
-- Aqui a chave é o `me_id`, o id do envio dentro do Melhor Envio. Ele existe
-- desde o instante em que a etiqueta é criada, e é a única identidade estável
-- do envio.
--
-- ── ⚠️ `bling_id` NÃO é único, e isso é de propósito ──────────────────────
--
-- Etiqueta cancelada e refeita gera um `me_id` NOVO para o mesmo pedido —
-- apontado pelo dono do processo com dois casos reais (Willeam Alves Aguiar
-- com "Envio cancelado", Jaime Schiavon com etiqueta vencendo).
--
-- Então um pedido acumula vários envios ao longo do tempo, e existe o conceito
-- de ENVIO VIGENTE: o mais recente que não foi cancelado nem venceu. É a view
-- `melhorenvio_envio_vigente` do BLOCO 3, e ela é obrigatória em dois lugares —
-- ao decidir a etapa da esteira e ao disparar a escrita na Nuvemshop. Sem ela,
-- um envio CANCELADO pode marcar o pedido como enviado.
--
-- ⚠️ RODE EM BLOCOS.
-- ═══════════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — o espelho                                                   ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

create table if not exists public.melhorenvio_envios (
  me_id             text primary key,          -- id do envio no Melhor Envio

  -- Os quatro nomes que já vimos carregar um código de rastreio. Guardados
  -- separados porque o Bling grava um e o Melhor Envio lista por outro — foi
  -- essa divergência que deixou 48 cards "em trânsito" sem trajeto.
  tracking          text,
  self_tracking     text,
  protocol          text,
  melhorenvio_tracking text,

  status_me         text,                      -- o texto cru do ME, sem tradução

  -- Os MARCOS. O Melhor Envio não devolve lista de eventos (medido: procurei
  -- `events`, `history`, `tracking_events` e `ocorrencias`; nenhum existe).
  -- O que existe é este punhado de carimbos, e é com eles que a etapa é
  -- decidida.
  criado_em_me      timestamptz,
  pago_em           timestamptz,
  gerado_em         timestamptz,
  postado_em        timestamptz,
  entregue_em       timestamptz,
  cancelado_em      timestamptz,
  expirado_em       timestamptz,

  -- ⚠️ Coluna GERADA. "Ativo" é derivado dos carimbos, então derivar é o certo:
  -- um booleano gravado à mão vira mentira no dia em que alguém esquecer de
  -- atualizá-lo junto com a data.
  ativo             boolean generated always as
                      (cancelado_em is null and expirado_em is null) stored,

  destinatario_nome text,
  -- ⚠️ SÓ DÍGITOS, normalizado na gravação. É a chave de conciliação mais
  -- confiável que existe aqui: exata, presente nos dois lados, e imune à
  -- bagunça dos nomes reais desta base ("Jailton Moreira Andrade De Souza
  -- MOREIRA", "Perivaldo, Silva Neves", "Leomir Da Motta Lopes Oliveira Lopes
  -- Oliveira" — sobrenome duplicado, vírgula solta, caixa alta aleatória).
  destinatario_doc  text,
  destinatario_cep  text,
  valor             numeric(14,2),             -- valor declarado do conteúdo

  transportadora    text,
  servico           text,
  prazo_dias        integer,
  url_rastreio      text,

  -- As portas EXATAS de conciliação.
  --
  -- ⚠️ MEDIDO em produção (328 envios), e uma previsão se inverteu: esperava-se
  -- que a NF fosse pouco confiável, porque muito envio sai com declaração de
  -- conteúdo. O real é 306 de 320 com `invoice.key` — 96%. A NF NÃO é o
  -- fallback: é a porta principal. `pedido_loja` sozinho resolve 11.
  pedido_loja       text,
  pedido_loja_raw   text,   -- as tags como o ME as mostra, para diagnóstico
  -- ⚠️ As tags da integração, medidas em produção (ver BLOCO 1-B):
  --   mi:reference_code   → o número do pedido no Bling
  --   mi:reference_link   → o ID INTERNO do Bling, dentro da URL
  --   mi:marketplace_code → o número do pedido na loja
  -- `bling_id_ref` é a melhor porta que existe: exata, direta, sem casar nada.
  bling_numero      text,
  bling_id_ref      bigint,
  nf_chave          text,
  nf_numero         text,

  -- ── Vínculo (a Fase 2 usa; as colunas nascem aqui) ──────────────────────
  -- Na PRÓPRIA linha, não em tabela de junção: é 1:1 por envio, e uma tabela à
  -- parte só acrescentaria um join a toda consulta.
  bling_id          bigint,
  vinculo_status    text not null default 'sem_match'
                      check (vinculo_status in
                        ('sem_match','confirmado','ambiguo','manual','ignorado')),
  -- Como foi casado. `heuristica` NUNCA aparece aqui sozinha: a heurística
  -- sugere e uma pessoa confirma, e aí grava 'manual'. Decidido depois de
  -- cinco casos reais de cliente com dois pedidos simultâneos (Guilherme Iop
  -- #470/#471, Cristiano Almeida #414/#415, Rafael Dippold #443/#444, José
  -- Eurico #396/#398, Perivaldo #419/#420) — em que nem CPF + valor desempata,
  -- porque os dois pedidos têm o mesmo valor.
  vinculo_via       text
                      check (vinculo_via is null or vinculo_via in
                        ('pedido_loja','nf_chave','cpf_valor','cpf_unico','manual')),
  vinculo_em        timestamptz,
  vinculo_por       uuid,

  visto_em          timestamptz not null default now(),
  atualizado_em     timestamptz not null default now(),
  raw               jsonb
);

comment on table public.melhorenvio_envios is
  'Espelho dos envios do Melhor Envio, INDEPENDENTE do Bling. Chaveado por me_id e não por código de rastreio porque etiqueta gerada e não paga ainda não tem código — que é exatamente o caso que motivou esta tabela. ⚠️ bling_id NÃO é único: etiqueta cancelada e refeita gera me_id novo para o mesmo pedido. Use melhorenvio_envio_vigente para decidir qualquer coisa.';

comment on column public.melhorenvio_envios.ativo is
  'Derivada dos carimbos: nem cancelado nem vencido. Coluna gerada de propósito — booleano gravado à mão vira mentira no dia em que alguém esquecer de atualizá-lo junto com a data.';

comment on column public.melhorenvio_envios.vinculo_via is
  'Como o envio foi casado ao pedido. `heuristica` não existe aqui: a heurística RANQUEIA candidatos e uma pessoa confirma, gravando `manual`. Casamento automático só por porta exata (pedido_loja, nf_chave, CPF).';

create index if not exists melhorenvio_envios_bling_idx
  on public.melhorenvio_envios (bling_id) where bling_id is not null;
create index if not exists melhorenvio_envios_vinculo_idx
  on public.melhorenvio_envios (vinculo_status);
create index if not exists melhorenvio_envios_doc_idx
  on public.melhorenvio_envios (destinatario_doc) where destinatario_doc is not null;
create index if not exists melhorenvio_envios_pedido_idx
  on public.melhorenvio_envios (pedido_loja) where pedido_loja is not null;
create index if not exists melhorenvio_envios_blingref_idx
  on public.melhorenvio_envios (bling_id_ref) where bling_id_ref is not null;
create index if not exists melhorenvio_envios_nf_idx
  on public.melhorenvio_envios (nf_chave) where nf_chave is not null;
-- Os códigos, para o casamento pelo que o Bling guardou.
create index if not exists melhorenvio_envios_tracking_idx
  on public.melhorenvio_envios (tracking) where tracking is not null;
create index if not exists melhorenvio_envios_self_idx
  on public.melhorenvio_envios (self_tracking) where self_tracking is not null;

alter table public.melhorenvio_envios enable row level security;

drop policy if exists melhorenvio_envios_leitura on public.melhorenvio_envios;
drop policy if exists melhorenvio_envios_service on public.melhorenvio_envios;
drop policy if exists melhorenvio_envios_vinculo on public.melhorenvio_envios;

create policy melhorenvio_envios_leitura on public.melhorenvio_envios
  for select to authenticated using (true);
-- Escrita do espelho é da função, e só dela.
create policy melhorenvio_envios_service on public.melhorenvio_envios
  for all to service_role using (true) with check (true);
-- ⚠️ A ÚNICA escrita humana permitida é a confirmação do vínculo, e ela é a
-- Fase 2. As colunas liberadas estão no grant abaixo: ninguém edita carimbo,
-- código nem status do envio pela tela — isso é espelho.
create policy melhorenvio_envios_vinculo on public.melhorenvio_envios
  for update to authenticated using (true) with check (true);

grant select on public.melhorenvio_envios to authenticated;
grant update (bling_id, vinculo_status, vinculo_via, vinculo_em, vinculo_por)
  on public.melhorenvio_envios to authenticated;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — a situação, traduzida uma vez                               ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- Em função, e não repetida em cada view: os carimbos são a fonte, e a
-- tradução deles para uma palavra precisa ser a mesma em todo lugar.

create or replace function public.melhorenvio_situacao(
  p_cancelado timestamptz, p_expirado timestamptz, p_entregue timestamptz,
  p_postado timestamptz, p_gerado timestamptz, p_pago timestamptz
) returns text language sql immutable as $$
  select case
    when p_cancelado is not null then 'cancelado'
    when p_entregue  is not null then 'entregue'
    when p_postado   is not null then 'postado'
    -- ⚠️ Vencida ANTES de "gerada": etiqueta que expirou sem uso continua
    -- tendo `generated_at`, e chamá-la de "gerada" faria a esteira prometer um
    -- envio que não vai acontecer.
    when p_expirado  is not null then 'vencido'
    when p_gerado    is not null then 'gerado'
    when p_pago      is not null then 'pago'
    else                              'rascunho'
  end
$$;

comment on function public.melhorenvio_situacao is
  'Traduz os carimbos do Melhor Envio numa palavra. Ordem importa: cancelado ganha de tudo, e vencido ganha de gerado — etiqueta expirada ainda tem generated_at, e chamá-la de gerada faria a esteira prometer um envio que não vai acontecer.';


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 3 — o ENVIO VIGENTE                                             ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
--
-- ⚠️ Esta view é obrigatória em dois lugares: ao decidir a etapa da esteira e
-- ao disparar a escrita na Nuvemshop. Sem ela, um envio CANCELADO pode marcar
-- o pedido como enviado — que é justamente o erro que a Fase 3 não pode
-- cometer.
--
-- Um pedido por linha, com o envio ativo mais recente. Cancelados e vencidos
-- ficam de fora por construção, não por filtro que alguém pode remover.

create or replace view public.melhorenvio_envio_vigente
with (security_invoker = true) as
select distinct on (e.bling_id)
  e.bling_id,
  e.me_id,
  e.tracking,
  e.self_tracking,
  coalesce(e.tracking, e.self_tracking, e.protocol) as codigo,
  public.melhorenvio_situacao(e.cancelado_em, e.expirado_em, e.entregue_em,
                              e.postado_em, e.gerado_em, e.pago_em) as situacao,
  e.gerado_em, e.postado_em, e.entregue_em, e.expirado_em,
  e.transportadora, e.servico, e.prazo_dias, e.url_rastreio,
  e.vinculo_status, e.vinculo_via,
  e.destinatario_nome, e.destinatario_doc, e.valor
from public.melhorenvio_envios e
where e.bling_id is not null
  and e.ativo
order by e.bling_id,
         -- O mais recente vence. `gerado_em` primeiro porque é o instante que
         -- importa para o envio; `criado_em_me` desempata quando a etiqueta
         -- ainda não foi gerada.
         e.gerado_em desc nulls last,
         e.criado_em_me desc nulls last,
         e.me_id desc;

comment on view public.melhorenvio_envio_vigente is
  'Um envio por pedido: o ativo mais recente. ⚠️ Obrigatória para decidir etapa da esteira e para disparar a escrita na Nuvemshop — etiqueta cancelada e refeita gera me_id novo, e sem esta view o envio cancelado poderia marcar o pedido como enviado.';

grant select on public.melhorenvio_envio_vigente to authenticated;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 4 — conferência (rode DEPOIS da primeira sincronização)         ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- (a) Está vazia agora. Enche quando a função `melhor-envio-envios` rodar.
select count(*) as envios from public.melhorenvio_envios;

-- (b) ⚠️ O NÚMERO QUE DECIDE A FASE 2. Quantos envios têm cada porta de
--     conciliação. `sem_porta_nenhuma` é o tamanho do trabalho manual.
select
  count(*)                                                        as envios,
  count(*) filter (where pedido_loja is not null)                 as com_pedido_loja,
  count(*) filter (where nf_chave    is not null)                 as com_nf,
  count(*) filter (where destinatario_doc is not null)            as com_cpf,
  count(*) filter (where pedido_loja is null
                     and nf_chave    is null
                     and destinatario_doc is null)                as sem_porta_nenhuma
from public.melhorenvio_envios
where ativo;

-- (c) A distribuição por situação. É aqui que aparecem as ~24 liberadas.
select public.melhorenvio_situacao(cancelado_em, expirado_em, entregue_em,
                                   postado_em, gerado_em, pago_em) as situacao,
       count(*), min(criado_em_me)::date as mais_antigo
from public.melhorenvio_envios
group by 1 order by 2 desc;

-- (d) ⚠️ O CASO DOS 19: envio ativo com etiqueta gerada, cujo código o Bling
--     NÃO conhece. Cada linha aqui é um card parado em "NF emitida" que já tem
--     etiqueta.
select e.me_id, e.destinatario_nome, e.valor, e.transportadora,
       coalesce(e.tracking, e.self_tracking) as codigo,
       e.gerado_em::date, e.pedido_loja, e.nf_numero
from public.melhorenvio_envios e
where e.ativo
  and e.gerado_em is not null
  and not exists (
    select 1 from public.bling2_esteira b
    where b.rastreio in (e.tracking, e.self_tracking, e.protocol)
  )
order by e.gerado_em;

-- (e) Etiquetas de cliente com mais de um envio ativo — o caso "cancelada e
--     refeita" e o caso "dois pedidos simultâneos". A vigente resolve o
--     primeiro; o segundo é o que vai para confirmação humana na Fase 2.
select destinatario_doc, destinatario_nome, count(*) as envios_ativos,
       string_agg(me_id, ', ') as ids
from public.melhorenvio_envios
where ativo and destinatario_doc is not null
group by 1, 2 having count(*) > 1
order by 3 desc;
