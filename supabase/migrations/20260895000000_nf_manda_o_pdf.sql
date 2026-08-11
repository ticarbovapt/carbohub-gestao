-- ═══════════════════════════════════════════════════════════════════════════
-- A mensagem da NF passa a mandar o PDF, não o número
--
-- ── Por que o número não serve ────────────────────────────────────────────
--
-- "A nota fiscal do seu pedido foi emitida (NF 000199)" não dá ao cliente nada
-- que ele possa usar. Ele não vai consultar a SEFAZ pelo número, não vai
-- guardar isso, e se precisar da nota — troca, garantia, reembolso de empresa —
-- vai ter que pedir mesmo assim. O número é vocabulário de quem emite.
--
-- O que ele usa é o DOCUMENTO. `bling2_nfe.pdf_url` já existe e já alimenta o
-- botão "DANFE" do card; faltava chegar ao cliente.
--
-- ── ⚠️ O link pode não ser público, e isso não dá para verificar daqui ────
--
-- `pdf_url` vem do campo `pdf` da API do Bling. O botão do card funciona no
-- navegador de quem está logado no Bling — o que NÃO prova que um link
-- anônimo funcione. Se ele exigir sessão, o cliente recebe uma URL que abre
-- uma tela de login, e a mensagem fica pior do que a que só dava o número.
--
-- Teste antes de ligar: abra uma janela anônima e cole o link de uma nota.
-- A consulta de conferência no fim deste arquivo entrega um para testar.
--
-- ── Degradação prevista ───────────────────────────────────────────────────
--
-- O texto tem DUAS linhas de propósito, e a ordem importa:
--
--   "Sua nota fiscal está aqui: {{link_nota}}"   some se não houver link
--   "Nota {{nf}} · pedido {{pedido}}"            some se não houver número
--
-- A regra do montador (linha cuja variável está vazia é removida) faz a
-- mensagem se ajustar sozinha: com link, o cliente recebe o documento; sem
-- link, ainda recebe o aviso de que a nota saiu. Sem as duas linhas, uma nota
-- sem PDF viraria uma mensagem sem conteúdo nenhum.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace view public.carbo_msg_fila
with (security_invoker = true) as
with base as (
  select e.bling_id, e.etapa, e.cliente_fone, e.cliente, e.pedido_loja, e.pedido_numero,
         e.pedido_codigo, e.canal, e.total, e.nf_numero, e.nf_pdf, e.transportadora,
         e.servico, e.rastreio, e.entrega_cidade, e.entrega_uf
  from public.bling2_esteira e
  where e.etapa <> 'cancelado'

  union all

  select e.bling_id, 'saiu_entrega', e.cliente_fone, e.cliente, e.pedido_loja, e.pedido_numero,
         e.pedido_codigo, e.canal, e.total, e.nf_numero, e.nf_pdf, e.transportadora,
         e.servico, e.rastreio, e.entrega_cidade, e.entrega_uf
  from public.bling2_esteira e
  join public.rastreio_card r on r.codigo = e.rastreio
  where r.status = 'saiu_entrega' and r.entregue_em is null and e.etapa <> 'cancelado'

  union all

  select e.bling_id, 'recompra', e.cliente_fone, e.cliente, e.pedido_loja, e.pedido_numero,
         e.pedido_codigo, e.canal, e.total, e.nf_numero, e.nf_pdf, e.transportadora,
         e.servico, e.rastreio, e.entrega_cidade, e.entrega_uf
  from public.bling2_esteira e
  join public.carbo_recompra_pipeline p on p.bling_id = e.bling_id
  where p.coluna = 'ofertar'
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
  -- O documento. Vai como variável de texto E, no `kanban-n8n`, como
  -- `anexo_url` no payload — para o n8n poder mandar o PDF anexado em vez de
  -- só colar uma URL. Receber o arquivo é diferente de receber um link.
  b.nf_pdf                                         as link_nota,
  b.transportadora,
  b.servico,
  b.rastreio,
  b.entrega_cidade                                 as cidade,
  b.entrega_uf                                     as uf,
  r.url_rastreio                                   as link_rastreio,
  r.previsao_entrega                               as previsao,
  t.instancia
from base b
join public.carbo_msg_templates t on t.etapa = b.etapa and t.ativo
left join public.rastreio_card r on r.codigo = b.rastreio
where not exists (
  select 1 from public.carbo_msg_envios v
  where v.bling_id = b.bling_id and v.etapa = b.etapa
)
  and nullif(trim(coalesce(b.cliente_fone, '')), '') is not null;


-- ── O texto novo ──────────────────────────────────────────────────────────
--
-- Só reescreve quem ainda está com a redação original. Se alguém já editou, a
-- versão da pessoa fica — mesma regra das outras correções de texto.

update public.carbo_msg_templates
set texto = 'Oi, {{primeiro_nome}}! Boas notícias 📄' || chr(10) || chr(10) ||
            'A nota fiscal do seu pedido {{pedido}} saiu.' || chr(10) ||
            'Sua nota está aqui: {{link_nota}}' || chr(10) || chr(10) ||
            'O próximo passo é a coleta pela transportadora — te aviso assim que sair.'
where etapa = 'nf_emitida'
  and texto like '%foi emitida (NF {{nf}})%';


-- ═══════════════════════════════════════════════════════════════════════════
-- Conferência
-- ═══════════════════════════════════════════════════════════════════════════

-- (a) ⚠️ TESTE OBRIGATÓRIO ANTES DE LIGAR: pegue este link e abra numa JANELA
--     ANÔNIMA. Se pedir login do Bling, o cliente receberia uma tela de login
--     em vez da nota — e aí o link não pode ir na mensagem.
select nf_numero, nf_pdf
from public.bling2_esteira
where nf_pdf is not null
order by nf_data desc nulls last
limit 3;

-- (b) Cobertura: quantas notas têm PDF. Se for baixo, a linha do link vai
--     sumir para muita gente e a mensagem fica só com o aviso.
select count(*)                                   as com_nf,
       count(nf_pdf)                              as com_pdf,
       round(100.0 * count(nf_pdf) / nullif(count(*), 0), 1) as pct
from public.bling2_esteira
where nf_numero is not null;
