-- ═══════════════════════════════════════════════════════════════════════════
-- NFS-e: o elo da SUBSTITUIÇÃO, e por que ele importa mais que o cancelamento
--
-- A `20261004` fez `CANCELAMENTO_POR_SUBSTITUICAO` tirar a nota do total —
-- 8 notas, R$ 42.957,34, que antes contavam como válidas. Mas esse número
-- provavelmente SUBESTIMA o erro, e por um motivo específico:
--
-- ⚠️ Substituição significa que existe uma nota NOVA no lugar. Se a substituta
-- também está na base — e ela está, o ADN entrega as duas —, então a view
-- antiga contava AS DUAS. Isso não é "contar algo cancelado": é contar a mesma
-- prestação DUAS VEZES, que é o erro de 31/08 com outra roupa.
--
-- ⚠️ E o elo NÃO está no evento. O evento de cancelamento só tem `chNFSe` e o
-- motivo — ele diz que a nota morreu, não quem nasceu no lugar. Quem carrega o
-- vínculo é a nota SUBSTITUTA, em `infDPS/subst/chSubstda`. Medido no XML cru
-- antes de escrever esta migração; a alternativa seria casar por valor + data,
-- que é lixo e já foi medido neste projeto (ligou `Leandro Teodolino` a
-- `Mauro Nishimoto`, e um carrinho PayT a um pedido do ML).
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────
-- 1. A nota passa a dizer QUEM ela substitui
-- ───────────────────────────────────────────────────────────────────────────
-- ⚠️ DROP + recreate porque a lista de colunas muda, e `with
-- (security_invoker = true)` REPETIDO em cada uma: `CREATE VIEW` sem `WITH`
-- apaga as reloptions, e foi assim que a `bling2_esteira` passou a rodar com
-- os privilégios do dono, ignorando RLS.
drop view if exists public.carbo_nfse_eventos_orfaos;
drop view if exists public.carbo_nfse_visao;
drop view if exists public.carbo_nfse_notas;

create view public.carbo_nfse_notas
with (security_invoker = true) as
with base as (
  select d.ambiente, d.nsu, d.chave_acesso, d.data_hora_geracao,
         d.recebido_em, d.xml::xml as x
  from public.carbo_nfse_dfe d
  where d.tipo_documento = 'NFSE' and d.xml_ok
)
select
  b.ambiente,
  b.nsu,
  b.chave_acesso,
  b.data_hora_geracao,
  b.recebido_em,
  public.carbo_nfse_txt(b.x, '/n:NFSe/n:infNFSe/n:nNFSe/text()')         as numero,
  public.carbo_nfse_txt(b.x, '/n:NFSe/n:infNFSe/n:cStat/text()')         as situacao_codigo,
  public.carbo_nfse_txt(b.x, '/n:NFSe/n:infNFSe/n:xLocEmi/text()')       as municipio_emissao,
  public.carbo_nfse_txt(b.x, '/n:NFSe/n:infNFSe/n:xLocPrestacao/text()') as municipio_prestacao,
  public.carbo_nfse_txt(b.x, '/n:NFSe/n:infNFSe/n:xTribNac/text()')      as servico_nacional,
  public.carbo_nfse_txt(b.x, '/n:NFSe/n:infNFSe/n:emit/n:CNPJ/text()')   as emit_cnpj,
  public.carbo_nfse_txt(b.x, '/n:NFSe/n:infNFSe/n:emit/n:xNome/text()')  as emit_nome,
  coalesce(
    public.carbo_nfse_txt(b.x, '/n:NFSe/n:infNFSe/n:DPS/n:infDPS/n:toma/n:CNPJ/text()'),
    public.carbo_nfse_txt(b.x, '/n:NFSe/n:infNFSe/n:DPS/n:infDPS/n:toma/n:CPF/text()')
  )                                                                      as toma_doc,
  public.carbo_nfse_txt(b.x, '/n:NFSe/n:infNFSe/n:DPS/n:infDPS/n:toma/n:xNome/text()') as toma_nome,
  nullif(public.carbo_nfse_txt(b.x, '/n:NFSe/n:infNFSe/n:DPS/n:infDPS/n:dhEmi/text()'), '')::timestamptz as emitida_em,
  nullif(public.carbo_nfse_txt(b.x, '/n:NFSe/n:infNFSe/n:dhProc/text()'), '')::timestamptz               as processada_em,
  nullif(public.carbo_nfse_txt(b.x, '/n:NFSe/n:infNFSe/n:DPS/n:infDPS/n:dCompet/text()'), '')::date      as competencia,
  nullif(public.carbo_nfse_txt(b.x, '/n:NFSe/n:infNFSe/n:valores/n:vLiq/text()'), '')::numeric      as valor_liquido,
  nullif(public.carbo_nfse_txt(b.x, '/n:NFSe/n:infNFSe/n:valores/n:vBC/text()'), '')::numeric       as base_calculo,
  nullif(public.carbo_nfse_txt(b.x, '/n:NFSe/n:infNFSe/n:valores/n:vTotalRet/text()'), '')::numeric as total_retido,
  nullif(public.carbo_nfse_txt(b.x,
    '/n:NFSe/n:infNFSe/n:DPS/n:infDPS/n:valores/n:vServPrest/n:vServ/text()'), '')::numeric         as valor_servico,
  public.carbo_nfse_txt(b.x,
    '/n:NFSe/n:infNFSe/n:DPS/n:infDPS/n:serv/n:cServ/n:xDescServ/text()')                           as descricao,

  -- ⚠️ O ELO. Ele está na nota SUBSTITUTA, apontando para a substituída — a
  -- direção contrária da que se espera. Procurado com `//` porque o `subst`
  -- pode não estar exatamente sob `infDPS` em todo município: o XML do sistema
  -- nacional é comum, mas cada prefeitura preenche o que usa. `//` acha onde
  -- estiver; caminho fixo errado devolveria null SEM ERRO, e a coluna ficaria
  -- vazia parecendo "não houve substituição".
  nullif(public.carbo_nfse_txt(b.x, '//n:subst/n:chSubstda/text()'), '')    as substitui_chave,
  nullif(public.carbo_nfse_txt(b.x, '//n:subst/n:cMotivo/text()'), '')      as substituicao_motivo_codigo,
  nullif(public.carbo_nfse_txt(b.x, '//n:subst/n:xMotivo/text()'), '')      as substituicao_motivo
from base b;

comment on view public.carbo_nfse_notas is
  'As NFS-e do ADN, lidas do XML cru. `substitui_chave` aponta da nota NOVA para a que ela substituiu — o elo mora na substituta, nao no evento de cancelamento.';

-- ───────────────────────────────────────────────────────────────────────────
-- 2. A visão, com os dois lados do par
-- ───────────────────────────────────────────────────────────────────────────
create view public.carbo_nfse_visao
with (security_invoker = true) as
select
  n.*,
  case
    when public.carbo_nfse_cnpj() = '' or public.carbo_nfse_cnpj() is null then 'indefinido'
    when regexp_replace(coalesce(n.emit_cnpj,''), '\D', '', 'g') = public.carbo_nfse_cnpj() then 'emitida'
    when regexp_replace(coalesce(n.toma_doc,''), '\D', '', 'g') = public.carbo_nfse_cnpj() then 'recebida'
    else 'indefinido'
  end as papel,
  (c.chave_acesso is not null) as cancelada,
  c.tipo_evento                as cancelamento_tipo,
  c.ocorrido_em                as cancelada_em,
  c.motivo                     as cancelamento_motivo,
  (t.chave_acesso is not null) as confirmada_tomador,
  t.ocorrido_em                as confirmada_em,
  -- ⚠️ O outro lado do par: quem substituiu ESTA nota. Sem ele, quem olha uma
  -- nota substituída vê "Substituída" e não tem como chegar à que vale — e
  -- rótulo que informa um fim sem apontar a continuação é meia resposta.
  s.chave_acesso               as substituida_por_chave,
  s.numero                     as substituida_por_numero
from public.carbo_nfse_notas n
left join lateral (
  select e.chave_acesso, e.tipo_evento, e.ocorrido_em, e.motivo
  from public.carbo_nfse_eventos e
  where e.ambiente = n.ambiente
    and e.chave_acesso = n.chave_acesso
    and public.carbo_nfse_evento_cancela(e.tipo_evento)
  order by e.ocorrido_em desc nulls last, e.nsu desc
  limit 1
) c on true
left join lateral (
  select e.chave_acesso, e.ocorrido_em
  from public.carbo_nfse_eventos e
  where e.ambiente = n.ambiente
    and e.chave_acesso = n.chave_acesso
    and upper(coalesce(e.tipo_evento,'')) = 'CONFIRMACAO_TOMADOR'
  order by e.ocorrido_em desc nulls last, e.nsu desc
  limit 1
) t on true
left join lateral (
  select nn.chave_acesso, nn.numero
  from public.carbo_nfse_notas nn
  where nn.ambiente = n.ambiente
    and nn.substitui_chave = n.chave_acesso
  order by nn.nsu desc
  limit 1
) s on true;

comment on view public.carbo_nfse_visao is
  'A NFS-e pronta para tela. `cancelada` cobre CANCELAMENTO e CANCELAMENTO_POR_SUBSTITUICAO. `substituida_por_*` aponta a nota que ocupou o lugar — sem isso o rotulo "Substituida" informa um fim sem apontar a continuacao.';

create view public.carbo_nfse_eventos_orfaos
with (security_invoker = true) as
select e.*
from public.carbo_nfse_eventos e
where not exists (
  select 1 from public.carbo_nfse_notas n
  where n.ambiente = e.ambiente and n.chave_acesso = e.chave_acesso
);

comment on view public.carbo_nfse_eventos_orfaos is
  'Eventos cuja NFS-e nao esta no nosso log. Lista de trabalho.';

grant select on public.carbo_nfse_notas, public.carbo_nfse_visao,
                public.carbo_nfse_eventos_orfaos to authenticated;
