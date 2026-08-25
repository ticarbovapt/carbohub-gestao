-- ═══════════════════════════════════════════════════════════════════════════
-- A etiqueta morta aparece na esteira, mas NÃO promete envio ao cliente
--
-- ⚠️ Isto conserta uma regressão introduzida pela 20260946.
--
-- ── O que a 20260946 fez, e o efeito colateral que ela não mediu ──────────
--
-- Ela tirou o `and e.ativo` do WHERE da `melhorenvio_envio_vigente` e o
-- transformou em precedência no ORDER BY. O ganho é real: pedido cuja única
-- etiqueta venceu parou de sumir da view — antes ele caía para a etapa
-- anterior e a tela dizia "falta gerar etiqueta" para uma etiqueta que tinha
-- sido comprada, paga e vencida.
--
-- O que ela não considerou: a `bling2_esteira` decide etapa por CARIMBO CRU,
-- não pela situação —
--
--     when ... or me.entregue_em is not null   then 'entregue'
--     when ... or me.postado_em  is not null   then 'em_transito'
--
-- Enquanto a vigente filtrava por `ativo`, esses carimbos só podiam vir de
-- etiqueta viva. Agora, quando um pedido não tem NENHUMA etiqueta ativa, a
-- morta é eleita e os carimbos dela movem o card.
--
-- A conferência (c2) daquela migração mediu UMA forma disso — cancelada E
-- entregue — e a julgou defensável (o pacote chegou; cancelar depois é ato
-- administrativo). Faltou a irmã: **cancelada depois de postar e antes de
-- entregar**, que joga o card em `em_transito`.
--
-- E `em_transito` não é só tela: a `carbo_msg_fila` lê a etapa atual, e o
-- template manda "Seu pedido saiu para entrega 🚚" com o código de rastreio.
-- Numa etiqueta cancelada isso é uma promessa verificável sobre um envio que
-- não existe — o falso positivo mais caro do conjunto, porque o cliente
-- confere o código e não encontra nada.
--
-- ── A decisão: separar o que a TELA mostra do que a MENSAGEM promete ──────
--
-- Não mexo no CASE da etapa. Ele conta a verdade dos carimbos: se `postado_em`
-- está preenchido, a encomenda FOI postada, e isso continua sendo fato mesmo
-- que a etiqueta tenha sido cancelada depois. Trocar carimbo por `situacao`
-- faria um pacote entregue voltar a aparecer como "sem etiqueta", que é mentira
-- de outro tipo.
--
-- O que muda é o gatilho da MENSAGEM: `em_transito` deixa de ser entregue à
-- fila quando a etiqueta eleita está CANCELADA. Anunciar é irreversível;
-- mostrar na tela, não. Quando as duas leituras divergem, quem tem de ceder é
-- a que não dá para desfazer.
--
-- ⚠️ `vencida` NÃO entra nessa trava. Etiqueta com `postado_em` foi usada — o
-- vencimento posterior é contabilidade, não desmentido da postagem. Travar aí
-- calaria avisos legítimos.
--
-- ── Marco zero: por que esta migração NÃO precisa de um ──────────────────
--
-- Toda migração que MOVE cards grava `'ignorado'` em `carbo_msg_envios` antes
-- de republicar a view (20260873, 20260875, 20260890, 20260919, 20260920). A
-- 20260946 devia ter feito isso e não fez — falha minha.
--
-- Medido depois: saiu UMA mensagem com mais de 20 dias entre pedido e aviso
-- (pedido de 20/07, aviso em 25/08), e o Melhor Envio registra a entrega dela
-- no MESMO dia do aviso. Ou seja: a mensagem estava certa, era entrega
-- demorada e não aviso retroativo. A rajada não aconteceu porque a população
-- exposta era pequena por construção — só pedido SEM nenhuma etiqueta viva.
--
-- Esta migração aqui não move card nenhum: acrescenta uma coluna e RESTRINGE
-- a fila. Não há nada para congelar. Registro isso porque "não precisa" tem de
-- ser uma conclusão medida, não um esquecimento — que foi exatamente o que
-- aconteceu da outra vez.
--
-- ⚠️ RODE EM BLOCOS.
-- ═══════════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 0 — o retrato ANTES                                             ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- (a) ⭐ O caso que motivou tudo: card andando por etiqueta CANCELADA, e se a
--     mensagem já saiu. Se `msg_em_transito` vier preenchido, o cliente já
--     recebeu "saiu para entrega" com um código morto.
select e.bling_id, e.me_id, e.destinatario_nome, e.valor,
       e.postado_em::date, e.entregue_em::date, e.cancelado_em::date,
       coalesce(e.tracking, e.self_tracking) as codigo,
       b.etapa, b.canal, b.cliente_fone,
       (select v.status from public.carbo_msg_envios v
         where v.bling_id = e.bling_id and v.etapa = 'em_transito') as msg_em_transito
from public.melhorenvio_envios e
join public.melhorenvio_envio_vigente ev on ev.me_id = e.me_id
left join public.bling2_esteira b on b.bling_id = e.bling_id
where e.cancelado_em is not null
  and e.postado_em is not null
  and e.entregue_em is null
order by e.cancelado_em desc;

-- (b) Todo card que hoje anda por etiqueta morta, com o aviso já disparado.
select b.etapa, v.situacao, count(*) as cards,
       count(*) filter (where exists (
         select 1 from public.carbo_msg_envios m
         where m.bling_id = b.bling_id and m.etapa = b.etapa and m.status <> 'ignorado'
       )) as ja_mandaram_whatsapp,
       sum(b.total) as valor
from public.bling2_esteira b
join public.melhorenvio_envio_vigente v on v.bling_id = b.bling_id
where not v.tem_ativo
group by 1, 2
order by 3 desc;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — a esteira passa a DIZER que a etiqueta está morta           ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
--
-- ⚠️ A 20260946 criou `tem_ativo` na `melhorenvio_envio_vigente` e a coluna
-- morreu ali: a esteira nunca foi republicada, então a tela nunca a viu. Um
-- dado que existe e não chega em lugar nenhum é a mesma doença do endereço de
-- PDV importado que a tela não mostrava.
--
-- `me_situacao` já distingue quase tudo (`vencido`, `cancelado`), MENOS o caso
-- perigoso: etiqueta morta que tem carimbo de postagem/entrega devolve
-- `postado`/`entregue`, porque na `melhorenvio_situacao` esses vêm antes de
-- `vencido`. É justamente aí que o card anda e a tela não tem como saber.
--
-- ⚠️ Coluna nova no FIM, ordem das antigas intacta, e `security_invoker`
-- REPETIDO — republicar sem ele apaga as reloptions e a RLS deixa de valer.

create or replace view public.bling2_esteira
with (security_invoker = true) as
with plataforma as (
  select platform_order_number,
    max(case lower(status)
          when 'delivered' then 3 when 'shipped' then 2 when 'paid' then 1 else 0 end) as avanco,
    max(ordered_at) as ordered_at,
    max(cliente_fone) as cliente_fone,
    max(cliente_email) as cliente_email
  from public.ecommerce_orders
  where platform_order_number is not null
  group by 1
)
select
  bo.bling_id,
  bo.numero                                       as pedido_numero,
  bo.numero_loja                                  as pedido_loja,
  coalesce(nullif(l.nome, ''), 'Canal ' || bo.loja_id::text) as canal,
  bo.loja_id,
  bo.data::date                                   as data_pedido,
  bo.total,
  bo.contato_nome                                 as cliente,
  c.cpf_cnpj                                      as cliente_doc,
  coalesce(c.telefone, c.celular, p.cliente_fone) as cliente_fone,
  nullif(trim(concat_ws(', ',
    nullif(bo.raw_detalhe -> 'transporte' -> 'etiqueta' ->> 'endereco', ''),
    nullif(bo.raw_detalhe -> 'transporte' -> 'etiqueta' ->> 'numero', ''))), '') as entrega_endereco,
  nullif(bo.raw_detalhe -> 'transporte' -> 'etiqueta' ->> 'bairro', '')    as entrega_bairro,
  nullif(bo.raw_detalhe -> 'transporte' -> 'etiqueta' ->> 'municipio', '') as entrega_cidade,
  upper(left(coalesce(bo.raw_detalhe -> 'transporte' -> 'etiqueta' ->> 'uf', ''), 2)) as entrega_uf,
  nullif(regexp_replace(coalesce(bo.raw_detalhe -> 'transporte' -> 'etiqueta' ->> 'cep', ''), '\D', '', 'g'), '') as entrega_cep,
  nf.numero                                       as nf_numero,
  nf.chave_acesso                                 as nf_chave,
  nf.situacao                                     as nf_situacao,
  nf.data_emissao                                 as nf_data,
  nf.pdf_url                                      as nf_pdf,
  coalesce(nullif(bo.raw_detalhe -> 'transporte' -> 'contato' ->> 'nome', ''),
           me.transportadora)                     as transportadora,
  coalesce(nullif(bo.raw_detalhe -> 'transporte' -> 'volumes' -> 0 ->> 'servico', ''),
           me.servico)                            as servico,
  coalesce(nullif(bo.raw_detalhe -> 'transporte' -> 'volumes' -> 0 ->> 'codigoRastreamento', ''),
           me.codigo)                             as rastreio,
  (bo.raw_detalhe -> 'transporte' ->> 'quantidadeVolumes')::numeric::integer as volumes,
  (bo.raw_detalhe -> 'transporte' ->> 'pesoBruto')::numeric                  as peso_kg,
  bo.items,
  o.id                                            as carboze_order_id,
  o.order_number                                  as carboze_order_number,
  -- ⚠️ O CASE continua lendo CARIMBO, de propósito. `postado_em` preenchido
  -- significa que a transportadora recebeu a encomenda — fato que não deixa de
  -- ser verdade porque a etiqueta foi cancelada depois. Quem cede é a MENSAGEM
  -- (BLOCO 2), não a tela.
  case
    when bo.situacao_id = 12
      or (nf.situacao is not null and not public.bling2_nf_e_valida(nf.situacao))
                                        then 'cancelado'
    when p.avanco >= 3 or r.entregue_em is not null
      or me.entregue_em is not null                   then 'entregue'
    when p.avanco = 2  or r.postado_em  is not null
      or me.postado_em is not null                    then 'em_transito'
    when nullif(bo.raw_detalhe -> 'transporte' -> 'volumes' -> 0 ->> 'codigoRastreamento', '') is not null
      or me.situacao = 'gerado'                       then 'etiqueta'
    when nf.id is not null and public.bling2_nf_e_valida(nf.situacao)
                                        then 'nf_emitida'
    else                                     'confirmado'
  end                                             as etapa,
  (p.platform_order_number is not null)           as tem_status_da_plataforma,
  pc.codigo                                       as pedido_codigo,
  case
    when nullif(bo.raw_detalhe -> 'transporte' -> 'volumes' -> 0 ->> 'codigoRastreamento', '') is not null
      then 'bling'
    when me.codigo is not null then 'melhorenvio'
    when p.platform_order_number is not null and p.avanco >= 2 then 'plataforma'
    else null
  end                                             as rastreio_origem,
  me.situacao                                     as me_situacao,
  me.gerado_em                                    as me_gerado_em,
  me.expirado_em                                  as me_expirado_em,
  coalesce(nullif(bo.raw_detalhe -> 'transporte' -> 'volumes' -> 0 ->> 'codigoRastreamento', ''),
           mev.tracking)                          as rastreio_transportadora,
  -- ── Coluna NOVA, no fim ─────────────────────────────────────────────────
  -- ⚠️ `false` = o pedido NÃO tem nenhuma etiqueta viva, e o que se vê é o
  -- último estado morto. É o que separa "ainda vai sair" de "não vai sair e
  -- ninguém refez" — a distinção que a tela não conseguia fazer, e que fez seis
  -- etiquetas vencidas (R$ 688,10 de frete) só aparecerem numa planilha à mão.
  --
  -- Nulo aqui não é o mesmo que `false`: significa que o pedido não tem envio
  -- no Melhor Envio nenhum (etiqueta do Bling, marketplace, retirada).
  me.tem_ativo                                    as me_tem_ativo
from public.bling2_orders bo
left join public.bling2_nfe      nf on nf.bling_id = bo.nf_bling_id
left join public.bling2_contacts c  on c.bling_id  = bo.contato_id
left join public.bling2_lojas    l  on l.bling_id  = bo.loja_id
left join public.carboze_orders  o  on o.external_ref = 'bling2-' || bo.bling_id
left join plataforma             p  on p.platform_order_number = bo.numero_loja
left join public.rastreio_envios r
       on r.codigo = nullif(bo.raw_detalhe -> 'transporte' -> 'volumes' -> 0 ->> 'codigoRastreamento', '')
left join public.carbo_pedido_codigo pc on pc.bling_id = bo.bling_id
left join public.melhorenvio_envio_vigente me on me.bling_id = bo.bling_id
left join public.melhorenvio_envios mev on mev.me_id = me.me_id
where bo.situacao_id in (9, 12);

grant select on public.bling2_esteira to authenticated;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — a fila para de prometer envio de etiqueta CANCELADA         ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
--
-- Única mudança de comportamento: `em_transito` não é entregue à fila quando a
-- etiqueta eleita está cancelada. Todo o resto é idêntico à 20260928.
--
-- ⚠️ A coluna nova entra no CTE `base` (interno), NÃO na lista de saída da
-- view — `create or replace view` não deixa reordenar coluna publicada, e a
-- fila é lida por duas edge functions por posição de nome.

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
         null::text as link_carrinho, null::text as produtos,
         e.rastreio_transportadora,
         -- ⚠️ CANCELADA, não "morta". Vencida com `postado_em` foi USADA — o
         -- vencimento depois é contabilidade, e travar aí calaria aviso
         -- legítimo. Cancelada é a única em que o código pode ter deixado de
         -- valer na transportadora.
         (e.me_situacao = 'cancelado')             as etiqueta_cancelada
  from public.bling2_esteira e
  where e.etapa <> 'cancelado'

  union all

  select e.bling_id, 'saiu_entrega', e.cliente_fone, e.cliente, e.pedido_loja, e.pedido_numero,
         e.pedido_codigo, e.canal, e.total, e.nf_numero, e.nf_pdf, e.transportadora,
         e.servico, e.rastreio, e.entrega_cidade, e.entrega_uf,
         null::text, null::text, e.rastreio_transportadora,
         -- `saiu_entrega` vem de evento REAL da transportadora (rastreio_card),
         -- não de carimbo de etiqueta: se ela saiu para entrega, ela existe.
         false
  from public.bling2_esteira e
  join public.rastreio_card r on r.codigo = e.rastreio
  where r.status = 'saiu_entrega' and r.entregue_em is null and e.etapa <> 'cancelado'

  union all

  select e.bling_id, 'recompra', e.cliente_fone, e.cliente, e.pedido_loja, e.pedido_numero,
         e.pedido_codigo, e.canal, e.total, e.nf_numero, e.nf_pdf, e.transportadora,
         e.servico, e.rastreio, e.entrega_cidade, e.entrega_uf,
         null::text, null::text, e.rastreio_transportadora,
         false
  from public.bling2_esteira e
  join public.carbo_recompra_pipeline p on p.bling_id = e.bling_id
  where p.coluna = 'ofertar'

  union all

  select c.checkout_id, 'carrinho_1', c.telefone, c.cliente, null, null,
         null, 'Nuvemshop', c.total, null, null, null,
         null, null, null, null, c.link, c.produtos, null::text, false
  from public.carbo_carrinho_pipeline p
  join public.nuvemshop_carrinhos c on c.checkout_id = p.checkout_id
  where p.coluna = 'aberto'
    and now() >= c.abandonado_em + ((select minutos_1 from cfg) || ' minutes')::interval

  union all

  select c.checkout_id, 'carrinho_2', c.telefone, c.cliente, null, null,
         null, 'Nuvemshop', c.total, null, null, null,
         null, null, null, null, c.link, c.produtos, null::text, false
  from public.carbo_carrinho_pipeline p
  join public.nuvemshop_carrinhos c on c.checkout_id = p.checkout_id
  where p.coluna = 'msg1'
    and now() >= p.msg1_em + ((select horas_2 from cfg) || ' hours')::interval

  union all

  select c.checkout_id, 'carrinho_3', c.telefone, c.cliente, null, null,
         null, 'Nuvemshop', c.total, null, null, null,
         null, null, null, null, c.link, c.produtos, null::text, false
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
  b.total::numeric(12,2)                           as valor,
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
  case when b.etapa in ('carrinho_1','carrinho_2','carrinho_3','recompra')
       then 1 else 0 end                          as prioridade,
  t.canal_envio,
  t.meta_template_nome,
  t.meta_idioma,
  t.meta_variaveis,
  t.meta_botao_url_de,
  t.meta_status,
  b.rastreio_transportadora,
  b.pedido_codigo
from base b
join public.carbo_msg_templates t on t.etapa = b.etapa and t.ativo
left join public.rastreio_card r on r.codigo = b.rastreio
where not exists (
  select 1 from public.carbo_msg_envios v
  where v.bling_id = b.bling_id
    and v.etapa = b.etapa
    and v.status <> 'pendente'
)
  and nullif(trim(coalesce(b.cliente_fone, '')), '') is not null
  and (t.canal_envio <> 'meta' or t.meta_status = 'APPROVED')
  -- ⚠️ A TRAVA. "Saiu para entrega" com etiqueta cancelada é promessa
  -- verificável sobre envio que não existe: o cliente confere o código e não
  -- acha nada. O card continua mostrando `em_transito` (o carimbo de postagem
  -- é fato); só o ANÚNCIO é segurado, porque anunciar não se desfaz.
  and not (b.etapa = 'em_transito' and b.etiqueta_cancelada);

grant select on public.carbo_msg_fila to authenticated;

comment on view public.carbo_msg_fila is
  'Uma etapa por pedido, pronta para virar mensagem. ⚠️ `em_transito` é segurado quando a etiqueta eleita está CANCELADA — a tela continua mostrando o card (postagem é fato), mas o anúncio não sai, porque anunciar é irreversível. Vencida NÃO é travada: etiqueta com postado_em foi usada. ⚠️ security_invoker = true — repita a cláusula em toda republicação.';


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 3 — conferência                                                 ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- (a) ⚠️ As duas views com security_invoker. Nulo aqui = rodando como DONO,
--     RLS ignorada — e `authenticated` inclui o portal de lojas e o de
--     licenciados, que usam a MESMA tabela `profiles`.
select relname, reloptions from pg_class
where relname in ('bling2_esteira', 'carbo_msg_fila');

-- (b) A coluna nova chegou à esteira?
select column_name, ordinal_position
from information_schema.columns
where table_schema = 'public' and table_name = 'bling2_esteira'
  and column_name in ('me_situacao','me_expirado_em','rastreio_transportadora','me_tem_ativo')
order by ordinal_position;

-- (c) ⭐ O que a tela passa a conseguir dizer: etiqueta morta por etapa.
--     `me_tem_ativo` nulo = pedido sem envio no Melhor Envio (Bling,
--     marketplace, retirada) — não confundir com `false`.
select etapa,
       count(*) filter (where me_tem_ativo)                as etiqueta_viva,
       count(*) filter (where me_tem_ativo is false)       as so_etiqueta_morta,
       count(*) filter (where me_tem_ativo is null)        as sem_envio_no_me,
       count(*)                                            as cards
from public.bling2_esteira
where etapa <> 'cancelado'
group by 1 order by 5 desc;

-- (d) ⭐ A trava mordeu? Estes são os avisos de "saiu para entrega" que NÃO
--     vão mais sair — cada linha é um cliente que não vai conferir um código
--     morto. Vazio significa que o caso é teórico hoje; a trava fica de pé
--     para quando não for.
select e.bling_id, e.cliente, e.canal, e.total, e.rastreio, e.me_situacao
from public.bling2_esteira e
where e.etapa = 'em_transito'
  and e.me_situacao = 'cancelado'
  and not exists (
    select 1 from public.carbo_msg_envios v
    where v.bling_id = e.bling_id and v.etapa = 'em_transito' and v.status <> 'pendente'
  );

-- (e) ⚠️ A fila não pode ter encolhido em mais nada. Compare com o que você
--     viu antes de rodar: só `em_transito` pode ter diminuído.
select etapa, canal_envio, count(*) as na_fila
from public.carbo_msg_fila
group by 1, 2 order by 3 desc;

-- (f) ⭐ NÃO É DESTA MIGRAÇÃO, mas é o que a lista de parados revelou e é o
--     número que a operação precisa ver: pedido pago, parado, sem ninguém
--     avisado. Etiqueta vencida/cancelada sem substituta, e NF sem etiqueta
--     nenhuma, são coisas diferentes — a coluna `me_tem_ativo` agora separa.
select b.bling_id, b.canal, b.cliente, b.pedido_numero, b.data_pedido, b.total,
       b.etapa, b.me_situacao, b.me_tem_ativo, b.me_expirado_em::date,
       b.rastreio, r.status as status_do_rastreio,
       (current_date - b.data_pedido) as dias_parado,
       case
         when b.me_tem_ativo is false then 'ETIQUETA MORTA — comprar outra'
         when b.rastreio is null and b.etapa = 'nf_emitida' then 'SEM ETIQUETA — ninguem comprou'
         when r.status is null and b.rastreio is not null then 'codigo sem movimento — conferir'
         else 'conferir'
       end as o_que_fazer
from public.bling2_esteira b
left join public.rastreio_envios r on r.codigo = b.rastreio
where b.etapa in ('etiqueta','nf_emitida','confirmado')
  and current_date - b.data_pedido > 10
order by b.data_pedido;
