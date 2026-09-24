-- ═══════════════════════════════════════════════════════════════════════════
-- NFS-e: os campos que a DANFSE mostra e nós não líamos
--
-- Em 24/09/2026 o dono do processo mandou a DANFSE OFICIAL (v2.0) baixada do
-- portal, ao lado do PDF que eu gerava. A comparação foi o teste que faltava:
-- o oficial é uma GRADE densa com endereço, inscrição municipal, telefone,
-- e-mail, número/série da DPS e três blocos de tributação — e o nosso parse
-- extraía menos de metade disso.
--
-- ⚠️ A lição é a de sempre, e desta vez o dado veio de fora: **eu tinha
-- escolhido as colunas pelo que a LISTA precisava mostrar**, não pelo que o
-- documento contém. Enquanto a tela era uma lista, ninguém notava. No dia em
-- que ela precisou gerar um papel, a falta apareceu inteira.
--
-- Tudo isto já estava no XML guardado desde a primeira carga — nada é
-- rebuscado no gov.br. É exatamente o que a decisão de "guardar o CRU" comprou:
-- ampliar o parse é republicar a matview e recalcular.
-- ═══════════════════════════════════════════════════════════════════════════

drop view if exists public.carbo_nfse_eventos_orfaos;
drop view if exists public.carbo_nfse_eventos_tipos;
drop view if exists public.carbo_nfse_visao;
drop view if exists public.carbo_nfse_eventos;
drop view if exists public.carbo_nfse_notas;
drop materialized view if exists public.carbo_nfse_notas_mat;

create materialized view public.carbo_nfse_notas_mat as
with base as (
  select d.ambiente, d.nsu, d.chave_acesso, d.data_hora_geracao,
         d.recebido_em, d.xml::xml as x
  from public.carbo_nfse_dfe d
  where d.tipo_documento = 'NFSE' and d.xml_ok
)
select
  b.ambiente, b.nsu, b.chave_acesso, b.data_hora_geracao, b.recebido_em,

  -- ── Identificação da nota ───────────────────────────────────────────────
  public.carbo_nfse_txt(b.x, '/n:NFSe/n:infNFSe/n:nNFSe/text()')         as numero,
  public.carbo_nfse_txt(b.x, '/n:NFSe/n:infNFSe/n:cStat/text()')         as situacao_codigo,
  public.carbo_nfse_txt(b.x, '/n:NFSe/n:infNFSe/n:ambGer/text()')        as ambiente_gerador,
  public.carbo_nfse_txt(b.x, '/n:NFSe/n:infNFSe/n:verAplic/text()')      as versao_aplicativo,
  public.carbo_nfse_txt(b.x, '/n:NFSe/n:infNFSe/n:xLocEmi/text()')       as municipio_emissao,
  public.carbo_nfse_txt(b.x, '/n:NFSe/n:infNFSe/n:xLocPrestacao/text()') as municipio_prestacao,
  public.carbo_nfse_txt(b.x, '/n:NFSe/n:infNFSe/n:xLocIncid/text()')     as municipio_incidencia,
  public.carbo_nfse_txt(b.x, '/n:NFSe/n:infNFSe/n:xTribNac/text()')      as servico_nacional,
  public.carbo_nfse_txt(b.x, '/n:NFSe/n:infNFSe/n:xTribMun/text()')      as servico_municipal,

  -- ── A DPS (a declaração que gerou a nota) ───────────────────────────────
  -- ⚠️ A DANFSE mostra os DOIS números: o da NFS-e e o da DPS, com série. Eles
  -- são diferentes (174 e 320 no exemplo), e quem concilia com o emissor
  -- procura pelo da DPS.
  public.carbo_nfse_txt(b.x, '/n:NFSe/n:infNFSe/n:DPS/n:infDPS/n:nDPS/text()')   as dps_numero,
  public.carbo_nfse_txt(b.x, '/n:NFSe/n:infNFSe/n:DPS/n:infDPS/n:serie/text()')  as dps_serie,
  public.carbo_nfse_txt(b.x, '/n:NFSe/n:infNFSe/n:DPS/n:infDPS/n:tpEmit/text()') as dps_tipo_emitente,

  -- ── Prestador ───────────────────────────────────────────────────────────
  public.carbo_nfse_txt(b.x, '/n:NFSe/n:infNFSe/n:emit/n:CNPJ/text()')   as emit_cnpj,
  public.carbo_nfse_txt(b.x, '/n:NFSe/n:infNFSe/n:emit/n:xNome/text()')  as emit_nome,
  public.carbo_nfse_txt(b.x, '/n:NFSe/n:infNFSe/n:emit/n:IM/text()')     as emit_im,
  public.carbo_nfse_txt(b.x, '/n:NFSe/n:infNFSe/n:emit/n:fone/text()')   as emit_fone,
  public.carbo_nfse_txt(b.x, '/n:NFSe/n:infNFSe/n:emit/n:email/text()')  as emit_email,
  public.carbo_nfse_txt(b.x, '/n:NFSe/n:infNFSe/n:emit/n:enderNac/n:xLgr/text()')    as emit_logradouro,
  public.carbo_nfse_txt(b.x, '/n:NFSe/n:infNFSe/n:emit/n:enderNac/n:nro/text()')     as emit_numero,
  public.carbo_nfse_txt(b.x, '/n:NFSe/n:infNFSe/n:emit/n:enderNac/n:xCpl/text()')    as emit_complemento,
  public.carbo_nfse_txt(b.x, '/n:NFSe/n:infNFSe/n:emit/n:enderNac/n:xBairro/text()') as emit_bairro,
  public.carbo_nfse_txt(b.x, '/n:NFSe/n:infNFSe/n:emit/n:enderNac/n:cMun/text()')    as emit_municipio_ibge,
  public.carbo_nfse_txt(b.x, '/n:NFSe/n:infNFSe/n:emit/n:enderNac/n:UF/text()')      as emit_uf,
  public.carbo_nfse_txt(b.x, '/n:NFSe/n:infNFSe/n:emit/n:enderNac/n:CEP/text()')     as emit_cep,

  -- ── Tomador ─────────────────────────────────────────────────────────────
  -- ⚠️ CNPJ **ou** CPF: pessoa física é tomador legítimo, e ler só CNPJ
  -- deixaria essas notas sem contraparte, sem erro nenhum.
  coalesce(
    public.carbo_nfse_txt(b.x, '/n:NFSe/n:infNFSe/n:DPS/n:infDPS/n:toma/n:CNPJ/text()'),
    public.carbo_nfse_txt(b.x, '/n:NFSe/n:infNFSe/n:DPS/n:infDPS/n:toma/n:CPF/text()')
  )                                                                      as toma_doc,
  public.carbo_nfse_txt(b.x, '/n:NFSe/n:infNFSe/n:DPS/n:infDPS/n:toma/n:xNome/text()') as toma_nome,
  public.carbo_nfse_txt(b.x, '/n:NFSe/n:infNFSe/n:DPS/n:infDPS/n:toma/n:IM/text()')    as toma_im,
  public.carbo_nfse_txt(b.x, '/n:NFSe/n:infNFSe/n:DPS/n:infDPS/n:toma/n:fone/text()')  as toma_fone,
  public.carbo_nfse_txt(b.x, '/n:NFSe/n:infNFSe/n:DPS/n:infDPS/n:toma/n:email/text()') as toma_email,
  public.carbo_nfse_txt(b.x, '/n:NFSe/n:infNFSe/n:DPS/n:infDPS/n:toma/n:end/n:xLgr/text()')    as toma_logradouro,
  public.carbo_nfse_txt(b.x, '/n:NFSe/n:infNFSe/n:DPS/n:infDPS/n:toma/n:end/n:nro/text()')     as toma_numero,
  public.carbo_nfse_txt(b.x, '/n:NFSe/n:infNFSe/n:DPS/n:infDPS/n:toma/n:end/n:xCpl/text()')    as toma_complemento,
  public.carbo_nfse_txt(b.x, '/n:NFSe/n:infNFSe/n:DPS/n:infDPS/n:toma/n:end/n:xBairro/text()') as toma_bairro,
  public.carbo_nfse_txt(b.x, '/n:NFSe/n:infNFSe/n:DPS/n:infDPS/n:toma/n:end/n:endNac/n:cMun/text()') as toma_municipio_ibge,
  public.carbo_nfse_txt(b.x, '/n:NFSe/n:infNFSe/n:DPS/n:infDPS/n:toma/n:end/n:endNac/n:CEP/text()')  as toma_cep,

  -- ── Datas ───────────────────────────────────────────────────────────────
  nullif(public.carbo_nfse_txt(b.x, '/n:NFSe/n:infNFSe/n:DPS/n:infDPS/n:dhEmi/text()'), '')::timestamptz as emitida_em,
  nullif(public.carbo_nfse_txt(b.x, '/n:NFSe/n:infNFSe/n:dhProc/text()'), '')::timestamptz               as processada_em,
  nullif(public.carbo_nfse_txt(b.x, '/n:NFSe/n:infNFSe/n:DPS/n:infDPS/n:dCompet/text()'), '')::date      as competencia,

  -- ── Serviço ─────────────────────────────────────────────────────────────
  public.carbo_nfse_txt(b.x, '/n:NFSe/n:infNFSe/n:DPS/n:infDPS/n:serv/n:cServ/n:cTribNac/text()')  as serv_cod_nacional,
  public.carbo_nfse_txt(b.x, '/n:NFSe/n:infNFSe/n:DPS/n:infDPS/n:serv/n:cServ/n:cTribMun/text()')  as serv_cod_municipal,
  public.carbo_nfse_txt(b.x, '/n:NFSe/n:infNFSe/n:DPS/n:infDPS/n:serv/n:cServ/n:cNBS/text()')      as serv_cod_nbs,
  public.carbo_nfse_txt(b.x, '/n:NFSe/n:infNFSe/n:DPS/n:infDPS/n:serv/n:cServ/n:xDescServ/text()') as descricao,
  public.carbo_nfse_txt(b.x, '/n:NFSe/n:infNFSe/n:DPS/n:infDPS/n:serv/n:infoCompl/n:xInfComp/text()') as info_complementar,

  -- ── Valores ─────────────────────────────────────────────────────────────
  -- ⚠️ `vLiq` e `vServ` continuam SEPARADOS — divergem em 7 das 697 notas.
  nullif(public.carbo_nfse_txt(b.x, '/n:NFSe/n:infNFSe/n:valores/n:vLiq/text()'), '')::numeric      as valor_liquido,
  nullif(public.carbo_nfse_txt(b.x, '/n:NFSe/n:infNFSe/n:valores/n:vBC/text()'), '')::numeric       as base_calculo,
  nullif(public.carbo_nfse_txt(b.x, '/n:NFSe/n:infNFSe/n:valores/n:vTotalRet/text()'), '')::numeric as total_retido,
  nullif(public.carbo_nfse_txt(b.x, '/n:NFSe/n:infNFSe/n:valores/n:vCalcDR/text()'), '')::numeric   as valor_deducao,
  public.carbo_nfse_txt(b.x, '/n:NFSe/n:infNFSe/n:valores/n:xOutInf/text()')                        as outras_informacoes,
  nullif(public.carbo_nfse_txt(b.x,
    '/n:NFSe/n:infNFSe/n:DPS/n:infDPS/n:valores/n:vServPrest/n:vServ/text()'), '')::numeric         as valor_servico,
  nullif(public.carbo_nfse_txt(b.x,
    '/n:NFSe/n:infNFSe/n:DPS/n:infDPS/n:valores/n:vDescCondIncond/n:vDescIncond/text()'), '')::numeric as desconto_incondicionado,
  nullif(public.carbo_nfse_txt(b.x,
    '/n:NFSe/n:infNFSe/n:DPS/n:infDPS/n:valores/n:vDescCondIncond/n:vDescCond/text()'), '')::numeric   as desconto_condicionado,

  -- ── Tributação ──────────────────────────────────────────────────────────
  public.carbo_nfse_txt(b.x,
    '/n:NFSe/n:infNFSe/n:DPS/n:infDPS/n:valores/n:trib/n:tribMun/n:tribISSQN/text()')   as issqn_tipo,
  public.carbo_nfse_txt(b.x,
    '/n:NFSe/n:infNFSe/n:DPS/n:infDPS/n:valores/n:trib/n:tribMun/n:tpRetISSQN/text()')  as issqn_retencao,
  nullif(public.carbo_nfse_txt(b.x,
    '/n:NFSe/n:infNFSe/n:DPS/n:infDPS/n:valores/n:trib/n:tribFed/n:piscofins/n:vPis/text()'), '')::numeric    as vl_pis,
  nullif(public.carbo_nfse_txt(b.x,
    '/n:NFSe/n:infNFSe/n:DPS/n:infDPS/n:valores/n:trib/n:tribFed/n:piscofins/n:vCofins/text()'), '')::numeric as vl_cofins,
  nullif(public.carbo_nfse_txt(b.x,
    '/n:NFSe/n:infNFSe/n:DPS/n:infDPS/n:valores/n:trib/n:tribFed/n:vRetCP/text()'), '')::numeric    as vl_ret_cp,
  nullif(public.carbo_nfse_txt(b.x,
    '/n:NFSe/n:infNFSe/n:DPS/n:infDPS/n:valores/n:trib/n:tribFed/n:vRetIRRF/text()'), '')::numeric  as vl_ret_irrf,
  nullif(public.carbo_nfse_txt(b.x,
    '/n:NFSe/n:infNFSe/n:DPS/n:infDPS/n:valores/n:trib/n:tribFed/n:vRetCSLL/text()'), '')::numeric  as vl_ret_csll,

  -- ── Substituição ────────────────────────────────────────────────────────
  -- ⚠️ `//n:subst`, não caminho fixo: o schema é nacional, mas cada prefeitura
  -- preenche o que usa, e caminho fixo errado devolve null SEM ERRO.
  nullif(public.carbo_nfse_txt(b.x, '//n:subst/n:chSubstda/text()'), '')   as substitui_chave,
  nullif(public.carbo_nfse_txt(b.x, '//n:subst/n:cMotivo/text()'), '')     as substituicao_motivo_codigo,
  nullif(public.carbo_nfse_txt(b.x, '//n:subst/n:xMotivo/text()'), '')     as substituicao_motivo
from base b;

create unique index carbo_nfse_notas_mat_pk   on public.carbo_nfse_notas_mat (ambiente, nsu);
create index carbo_nfse_notas_mat_chave       on public.carbo_nfse_notas_mat (ambiente, chave_acesso);
create index carbo_nfse_notas_mat_subst       on public.carbo_nfse_notas_mat (ambiente, substitui_chave);
create index carbo_nfse_notas_mat_emissao     on public.carbo_nfse_notas_mat (emitida_em desc);

-- ⚠️ NENHUM grant para `authenticated`: matview não tem RLS nem aceita
-- `security_invoker`. Quem o front lê são as views abaixo, que rodam como DONO
-- e se guardam no próprio WHERE.
revoke all on public.carbo_nfse_notas_mat from public, anon, authenticated;

create view public.carbo_nfse_notas as
select * from public.carbo_nfse_notas_mat
where public.carbo_e_time_interno();

create view public.carbo_nfse_eventos as
select * from public.carbo_nfse_eventos_mat
where public.carbo_e_time_interno();

create view public.carbo_nfse_visao as
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
  s.chave_acesso               as substituida_por_chave,
  s.numero                     as substituida_por_numero
from public.carbo_nfse_notas_mat n
left join lateral (
  select e.chave_acesso, e.tipo_evento, e.ocorrido_em, e.motivo
  from public.carbo_nfse_eventos_mat e
  where e.ambiente = n.ambiente and e.chave_acesso = n.chave_acesso
    and public.carbo_nfse_evento_cancela(e.tipo_evento)
  order by e.ocorrido_em desc nulls last, e.nsu desc limit 1
) c on true
left join lateral (
  select e.chave_acesso, e.ocorrido_em
  from public.carbo_nfse_eventos_mat e
  where e.ambiente = n.ambiente and e.chave_acesso = n.chave_acesso
    and upper(coalesce(e.tipo_evento,'')) = 'CONFIRMACAO_TOMADOR'
  order by e.ocorrido_em desc nulls last, e.nsu desc limit 1
) t on true
left join lateral (
  select nn.chave_acesso, nn.numero
  from public.carbo_nfse_notas_mat nn
  where nn.ambiente = n.ambiente and nn.substitui_chave = n.chave_acesso
  order by nn.nsu desc limit 1
) s on true
where public.carbo_e_time_interno();

create view public.carbo_nfse_eventos_orfaos as
select e.*
from public.carbo_nfse_eventos_mat e
where not exists (
  select 1 from public.carbo_nfse_notas_mat n
  where n.ambiente = e.ambiente and n.chave_acesso = e.chave_acesso
)
and public.carbo_e_time_interno();

create view public.carbo_nfse_eventos_tipos as
select
  e.tipo_evento,
  count(*)                       as eventos,
  count(distinct e.chave_acesso) as notas,
  max(e.ocorrido_em)             as mais_recente,
  public.carbo_nfse_evento_cancela(e.tipo_evento) as cancela,
  (upper(coalesce(e.tipo_evento,'')) in
     ('CANCELAMENTO','CANCELAMENTO_POR_SUBSTITUICAO','CONFIRMACAO_TOMADOR')) as conhecido
from public.carbo_nfse_eventos_mat e
where public.carbo_e_time_interno()
group by e.tipo_evento;

grant select on public.carbo_nfse_notas, public.carbo_nfse_eventos,
                public.carbo_nfse_visao, public.carbo_nfse_eventos_orfaos,
                public.carbo_nfse_eventos_tipos
  to authenticated;
