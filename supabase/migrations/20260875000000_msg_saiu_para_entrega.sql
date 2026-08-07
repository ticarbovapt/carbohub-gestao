-- ═══════════════════════════════════════════════════════════════════════════
-- Mensagem de "saiu para entrega" — e o conserto de um nome errado
--
-- ── O nome errado ─────────────────────────────────────────────────────────
--
-- A etapa `em_transito` estava rotulada na tela como "Saiu para entrega". Na
-- esteira essa coluna se chama "Em trânsito" e significa outra coisa: a
-- plataforma confirmou o ENVIO. Sair para entrega é o último trecho, dias
-- depois. Com o rótulo trocado, parecia faltar a mensagem do rastreio — que
-- existia, com o nome de outra.
--
-- ── A falta de verdade ────────────────────────────────────────────────────
--
-- "Saiu para entrega" É um fato que a gente tem: `rastreio_envios.status`
-- guarda `saiu_entrega`, vindo do `date_first_visit` do Mercado Envios e do
-- histórico do Melhor Envio. Só que ele NÃO é uma coluna da esteira — a esteira
-- para em "Em trânsito" e vai direto para "Entregue".
--
-- Por isso a fila passa a ter DUAS origens:
--
--   etapa da esteira   confirmado, nf_emitida, etiqueta, em_transito, entregue
--   status do rastreio saiu_entrega
--
-- É a mensagem de maior valor no e-commerce: quem sabe que o pacote sai hoje
-- fica em casa, e entrega que não encontra ninguém volta para o CD.
--
-- ⚠️ Marco zero de novo. Quem JÁ está com `saiu_entrega` hoje é marcado como
-- ignorado — senão, ligar esta mensagem manda "sai para entrega hoje" para
-- pedidos que saíram semana passada.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.carbo_msg_templates
  drop constraint if exists carbo_msg_templates_etapa_check;

alter table public.carbo_msg_templates
  add constraint carbo_msg_templates_etapa_check
  check (etapa in ('confirmado','nf_emitida','etiqueta','em_transito','saiu_entrega','entregue'));


-- ── Texto novo ─────────────────────────────────────────────────────────────

insert into public.carbo_msg_templates (etapa, ativo, titulo, texto, atraso_min) values
  ('saiu_entrega', false, 'Saiu para entrega hoje',
   'Oi, {{primeiro_nome}}! Seu pedido {{pedido}} SAIU PARA ENTREGA hoje 🛵' || chr(10) || chr(10) ||
   'Se puder, deixe alguém no endereço para receber — se não tiver ninguém, a entrega volta e atrasa alguns dias.' || chr(10) || chr(10) ||
   'Acompanhe em tempo real: {{link_rastreio}}' || chr(10) ||
   'Código: {{rastreio}}', 0)
on conflict (etapa) do nothing;


-- ── Correção dos textos que estavam com a redação da etapa errada ─────────
--
-- Só reescreve quem ainda está com o texto original — se alguém já editou, a
-- redação da pessoa fica. Escolher entre "corrigir" e "preservar o que o
-- usuário escreveu" é sempre a favor do que ele escreveu.

update public.carbo_msg_templates
set titulo = 'Em trânsito — com o rastreio',
    texto  = 'Oi, {{primeiro_nome}}! Seu pedido {{pedido}} já está a caminho 📦' || chr(10) || chr(10) ||
             'Transportadora: {{transportadora}}' || chr(10) ||
             'Código de rastreio: {{rastreio}}' || chr(10) ||
             'Acompanhe aqui: {{link_rastreio}}' || chr(10) ||
             'Previsão de entrega: {{previsao}}' || chr(10) || chr(10) ||
             'Te aviso de novo quando ele sair para entrega.'
where etapa = 'em_transito'
  and texto like '%saiu para entrega 🚚%';

-- A etiqueta JÁ tem código de rastreio (a coluna se chama "rastreio gerado").
-- Prometer "te mando o rastreio depois" quando ele já existe é fazer o cliente
-- esperar por algo que está pronto.
update public.carbo_msg_templates
set texto = 'Oi, {{primeiro_nome}}! Seu pedido {{pedido}} está embalado e aguardando a coleta da {{transportadora}}.' || chr(10) || chr(10) ||
            'Já pode acompanhar por aqui: {{link_rastreio}}' || chr(10) ||
            'Código: {{rastreio}}' || chr(10) || chr(10) ||
            'O rastreio começa a mostrar movimentação assim que a transportadora retirar.'
where etapa = 'etiqueta'
  and texto like '%Assim que ela retirar, te mando o rastreio.%';


-- ── A fila, agora com duas origens ────────────────────────────────────────

create or replace view public.carbo_msg_fila
with (security_invoker = true) as
with base as (
  -- Origem 1: a etapa da esteira.
  select e.bling_id, e.etapa, e.cliente_fone, e.cliente, e.pedido_loja, e.pedido_numero,
         e.canal, e.total, e.nf_numero, e.transportadora, e.servico, e.rastreio,
         e.entrega_cidade, e.entrega_uf
  from public.bling2_esteira e

  union all

  -- Origem 2: o rastreio disse que saiu para entrega. Não é coluna da esteira
  -- (ela vai de "Em trânsito" direto para "Entregue"), mas é o fato mais útil
  -- para o cliente — e a gente já tem.
  select e.bling_id, 'saiu_entrega', e.cliente_fone, e.cliente, e.pedido_loja, e.pedido_numero,
         e.canal, e.total, e.nf_numero, e.transportadora, e.servico, e.rastreio,
         e.entrega_cidade, e.entrega_uf
  from public.bling2_esteira e
  join public.rastreio_card r on r.codigo = e.rastreio
  where r.status = 'saiu_entrega' and r.entregue_em is null
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
  coalesce(b.pedido_loja, b.pedido_numero, '')     as pedido,
  b.canal,
  b.total                                          as valor,
  b.nf_numero                                      as nf,
  b.transportadora,
  b.servico,
  b.rastreio,
  b.entrega_cidade                                 as cidade,
  b.entrega_uf                                     as uf,
  r.url_rastreio                                   as link_rastreio,
  r.previsao_entrega                               as previsao
from base b
join public.carbo_msg_templates t on t.etapa = b.etapa and t.ativo
left join public.rastreio_card r on r.codigo = b.rastreio
where not exists (
  select 1 from public.carbo_msg_envios v
  where v.bling_id = b.bling_id and v.etapa = b.etapa
)
  and nullif(trim(coalesce(b.cliente_fone, '')), '') is not null;


-- ── Marco zero da etapa nova ──────────────────────────────────────────────
insert into public.carbo_msg_envios (bling_id, etapa, status, motivo, enviado_em)
select e.bling_id, 'saiu_entrega', 'ignorado', 'já existia quando o aviso foi ligado', now()
from public.bling2_esteira e
join public.rastreio_card r on r.codigo = e.rastreio
where r.status = 'saiu_entrega'
on conflict (bling_id, etapa) do nothing;


-- ═══════════════════════════════════════════════════════════════════════════
-- Conferência
-- ═══════════════════════════════════════════════════════════════════════════

-- (a) Seis textos, na ordem em que o cliente recebe. Todos desligados.
select etapa, ativo, titulo, atraso_min
from public.carbo_msg_templates
order by array_position(
  array['confirmado','nf_emitida','etiqueta','em_transito','saiu_entrega','entregue'], etapa);

-- (b) A fila continua vazia (nada ligado).
select count(*) as na_fila from public.carbo_msg_fila;

-- (c) Quantos envios ficaram travados pelo marco zero, por etapa.
select etapa, count(*) from public.carbo_msg_envios where status = 'ignorado' group by 1 order by 1;
