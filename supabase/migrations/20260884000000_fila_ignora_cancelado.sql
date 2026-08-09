-- ═══════════════════════════════════════════════════════════════════════════
-- Pedido cancelado não recebe "saiu para entrega hoje"
--
-- ── O defeito ─────────────────────────────────────────────────────────────
--
-- A `carbo_msg_fila` tem duas origens. A primeira usa a etapa da esteira; a
-- segunda usa a string fixa `'saiu_entrega'`, vinda do rastreio.
--
--   origem 1   join carbo_msg_templates t on t.etapa = b.etapa
--   origem 2   select e.bling_id, 'saiu_entrega', ...
--
-- A origem 1 nunca deixou passar pedido cancelado — mas **por acidente**:
-- `cancelado` não existe em `carbo_msg_templates`, então o join simplesmente
-- descarta a linha. Não há regra escrita em lugar nenhum dizendo "cancelado não
-- recebe aviso"; há uma coincidência entre duas listas.
--
-- A origem 2 não tem essa sorte. Ela carrega uma etapa literal que EXISTE nos
-- templates, então o join casa mesmo quando `e.etapa = 'cancelado'`. Resultado:
-- pedido cancelado no Bling depois de a transportadora já ter bipado a saída
-- dispara "Seu pedido SAIU PARA ENTREGA hoje 🛵 — deixe alguém no endereço para
-- receber". Para um pedido que não vai chegar.
--
-- ⚠️ Ninguém recebeu isso ainda: os seis templates estão todos com
-- `ativo = false`, e a origem 2 só entrou na fila hoje. O defeito seria
-- estreado no dia em que a primeira mensagem fosse ligada — que é justamente
-- quando ninguém estaria procurando por ele.
--
-- ── O conserto, nas DUAS origens ──────────────────────────────────────────
--
-- A origem 2 ganha o filtro porque está errada hoje. A origem 1 ganha o mesmo
-- filtro porque a proteção dela não pode continuar dependendo de sorte: a
-- auditoria levantou "avisar o cliente quando o pedido é cancelado" como
-- pendência real, e no dia em que alguém criar o template `cancelado` a origem
-- 1 passaria a disparar sozinha — para TODO pedido cancelado do histórico, de
-- uma vez, sem marco zero. Uma linha explícita agora custa nada e desarma isso.
--
-- Quem quiser criar o aviso de cancelamento no futuro terá de mexer AQUI, de
-- propósito, e escrever o marco zero junto.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace view public.carbo_msg_fila
with (security_invoker = true) as
with base as (
  -- Origem 1: a etapa da esteira.
  --
  -- ⚠️ O filtro de cancelado é EXPLÍCITO, e não redundante por acaso. Hoje ele
  -- não muda nada (o join com os templates já descartaria a linha, porque
  -- `cancelado` não é uma etapa de mensagem). Ele existe para que criar um
  -- template `cancelado` amanhã seja uma decisão, e não um efeito colateral que
  -- dispara o histórico inteiro de uma vez.
  select e.bling_id, e.etapa, e.cliente_fone, e.cliente, e.pedido_loja, e.pedido_numero,
         e.canal, e.total, e.nf_numero, e.transportadora, e.servico, e.rastreio,
         e.entrega_cidade, e.entrega_uf
  from public.bling2_esteira e
  where e.etapa <> 'cancelado'

  union all

  -- Origem 2: o rastreio disse que saiu para entrega. Não é coluna da esteira
  -- (ela vai de "Em trânsito" direto para "Entregue"), mas é o fato mais útil
  -- para o cliente — e a gente já tem.
  --
  -- ⚠️ AQUI estava o defeito. A etapa é uma string fixa que existe nos
  -- templates, então o join casava mesmo com pedido cancelado. A transportadora
  -- não sabe que a venda caiu: ela bipa a saída, o Bling cancela depois, e sem
  -- este filtro o cliente recebe "deixe alguém para receber" de um pacote que
  -- não vai chegar.
  select e.bling_id, 'saiu_entrega', e.cliente_fone, e.cliente, e.pedido_loja, e.pedido_numero,
         e.canal, e.total, e.nf_numero, e.transportadora, e.servico, e.rastreio,
         e.entrega_cidade, e.entrega_uf
  from public.bling2_esteira e
  join public.rastreio_card r on r.codigo = e.rastreio
  where r.status = 'saiu_entrega'
    and r.entregue_em is null
    and e.etapa <> 'cancelado'
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

comment on view public.carbo_msg_fila is
  'Pedidos que ainda não receberam o aviso da etapa em que estão. Duas origens: a etapa da bling2_esteira e o saiu_entrega do rastreio_card. Pedido cancelado é excluído EXPLICITAMENTE nas duas — na origem 1 o filtro é redundante hoje e proposital: sem ele, criar um template `cancelado` dispararia o histórico inteiro sem marco zero.';


-- ═══════════════════════════════════════════════════════════════════════════
-- Conferência
-- ═══════════════════════════════════════════════════════════════════════════

-- (a) Nenhum cancelado pode estar na fila. Tem de voltar ZERO.
select f.bling_id, f.etapa, f.nome, e.etapa as etapa_na_esteira
from public.carbo_msg_fila f
join public.bling2_esteira e on e.bling_id = f.bling_id
where e.etapa = 'cancelado';

-- (b) Ninguém recebeu isso antes do conserto? Também tem de voltar ZERO
--     (os templates estão todos desligados, mas confirmar é mais barato que
--     supor — e se aparecer linha, são clientes para avisar à mão).
select v.bling_id, v.etapa, v.status, v.enviado_em, e.etapa as etapa_na_esteira
from public.carbo_msg_envios v
join public.bling2_esteira e on e.bling_id = v.bling_id
where e.etapa = 'cancelado'
  and v.status = 'enviado';

-- (c) Quantos cancelados existem com rastreio que chegou a "saiu para entrega"
--     — ou seja, o tamanho real do risco que estava aberto.
select count(*) as cancelados_que_teriam_recebido
from public.bling2_esteira e
join public.rastreio_card r on r.codigo = e.rastreio
where e.etapa = 'cancelado' and r.status = 'saiu_entrega';
