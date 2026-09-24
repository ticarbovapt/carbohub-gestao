-- ═══════════════════════════════════════════════════════════════════════════
-- NFS-e: o parse do XML vira MATERIALIZADO
--
-- Sintoma, em 24/09/2026, na primeira abertura real da tela:
--   "Não consegui ler as notas: canceling statement due to statement timeout"
--
-- ⚠️ O defeito é de DESENHO, e é meu. Eu escolhi interpretar o XML na LEITURA
-- e defendi essa escolha — a razão continua boa (corrigir um entendimento é
-- republicar view, sem rebuscar nada no gov.br). O que eu não fiz foi MEDIR o
-- custo dela com o volume real.
--
-- A conta que faltou:
--   697 notas × ~20 xpath  = ~14 mil parses de XML por abertura de tela
--   + TRÊS `left join lateral` sobre `carbo_nfse_eventos`, que é OUTRA view
--     sobre XML — reavaliada POR LINHA, ou seja, até 697 × 3 varreduras que
--     reparseiam os 66 eventos cada vez.
--
-- ⚠️ E isso é da mesma família dos tetos silenciosos deste repo (`lerTudo`,
-- o `.limit(200)` do chat): **funciona até o volume cruzar**, e cruza sem
-- avisar. Na sonda eram 50 documentos e era instantâneo.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- ⚠️ MATERIALIZAR NÃO REVOGA "interpreta na leitura"
--
-- A regra continua: o que está guardado é o XML CRU, e toda interpretação é
-- DERIVADA dele. Mudou só o momento em que ela é calculada — na ingestão, em
-- vez de a cada clique. Corrigir um entendimento continua sendo republicar a
-- definição e mandar recalcular; nada é rebuscado no gov.br.
--
-- O que se PERDE: a correção não vale no instante em que a view é republicada,
-- só depois do `carbo_nfse_atualizar()`. Por isso ele é chamado pela própria
-- ingestão — sem isso, a tela mostraria a interpretação de ontem sem erro
-- nenhum, que é a doença conhecida daqui.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- ⚠️ MATVIEW NÃO TEM RLS, e esse é o risco desta migração
--
-- `security_invoker` não existe para materializada, e policy não se aplica. Um
-- `grant select ... to authenticated` aqui entregaria CNPJ, endereço e telefone
-- de fornecedor ao portal de lojas e ao de licenciados, que usam a MESMA tabela
-- `profiles`. Por isso:
--   • as matviews NÃO recebem grant nenhum para `authenticated`;
--   • quem o front lê são views comuns por cima, rodando como DONO e guardadas
--     no próprio WHERE por `carbo_e_time_interno()`.
-- É o mesmo molde de `carbo_usuarios_bloqueados` e `ml_accounts_public`.
-- ═══════════════════════════════════════════════════════════════════════════

drop view if exists public.carbo_nfse_eventos_orfaos;
drop view if exists public.carbo_nfse_eventos_tipos;
drop view if exists public.carbo_nfse_visao;
drop view if exists public.carbo_nfse_eventos;
drop view if exists public.carbo_nfse_notas;
drop materialized view if exists public.carbo_nfse_eventos_mat;
drop materialized view if exists public.carbo_nfse_notas_mat;

-- ───────────────────────────────────────────────────────────────────────────
-- 1. O PARSE, calculado uma vez
-- ───────────────────────────────────────────────────────────────────────────
create materialized view public.carbo_nfse_notas_mat as
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
  nullif(public.carbo_nfse_txt(b.x, '//n:subst/n:chSubstda/text()'), '')   as substitui_chave,
  nullif(public.carbo_nfse_txt(b.x, '//n:subst/n:cMotivo/text()'), '')     as substituicao_motivo_codigo,
  nullif(public.carbo_nfse_txt(b.x, '//n:subst/n:xMotivo/text()'), '')     as substituicao_motivo
from base b;

-- ⚠️ O índice ÚNICO não é só performance: sem ele `refresh ... concurrently`
-- é recusado. Fica aqui mesmo sem usarmos o concurrently hoje (ver nota no
-- `carbo_nfse_atualizar`), porque é o que deixa a porta aberta.
create unique index carbo_nfse_notas_mat_pk
  on public.carbo_nfse_notas_mat (ambiente, nsu);
-- É por ele que a nota encontra o evento e a substituta.
create index carbo_nfse_notas_mat_chave
  on public.carbo_nfse_notas_mat (ambiente, chave_acesso);
create index carbo_nfse_notas_mat_subst
  on public.carbo_nfse_notas_mat (ambiente, substitui_chave);
create index carbo_nfse_notas_mat_emissao
  on public.carbo_nfse_notas_mat (emitida_em desc);

create materialized view public.carbo_nfse_eventos_mat as
with base as (
  select d.ambiente, d.nsu, d.chave_acesso, d.tipo_evento,
         d.data_hora_geracao, d.xml::xml as x
  from public.carbo_nfse_dfe d
  where d.tipo_documento = 'EVENTO' and d.xml_ok
)
select
  b.ambiente,
  b.nsu,
  b.tipo_evento,
  b.data_hora_geracao,
  coalesce(
    public.carbo_nfse_txt(b.x,
      '/n:evento/n:infEvento/n:pedRegEvento/n:infPedReg/n:chNFSe/text()'),
    b.chave_acesso
  )                                                                        as chave_acesso,
  public.carbo_nfse_txt(b.x,
    '/n:evento/n:infEvento/n:pedRegEvento/n:infPedReg/n:CNPJAutor/text()') as autor_cnpj,
  nullif(public.carbo_nfse_txt(b.x,
    '/n:evento/n:infEvento/n:pedRegEvento/n:infPedReg/n:dhEvento/text()'), '')::timestamptz as ocorrido_em,
  public.carbo_nfse_txt(b.x,
    '/n:evento/n:infEvento/n:pedRegEvento/n:infPedReg/n:e101101/n:xMotivo/text()') as motivo,
  public.carbo_nfse_txt(b.x,
    '/n:evento/n:infEvento/n:pedRegEvento/n:infPedReg/n:e101101/n:cMotivo/text()') as motivo_codigo
from base b;

create unique index carbo_nfse_eventos_mat_pk
  on public.carbo_nfse_eventos_mat (ambiente, nsu);
create index carbo_nfse_eventos_mat_chave
  on public.carbo_nfse_eventos_mat (ambiente, chave_acesso);

-- ⚠️ NENHUM grant para `authenticated` nas duas matviews. Matview não tem RLS
-- e não aceita `security_invoker`: grant aqui é vazamento direto pelo
-- PostgREST. Quem lê é a view comum abaixo.
revoke all on public.carbo_nfse_notas_mat from public, anon, authenticated;
revoke all on public.carbo_nfse_eventos_mat from public, anon, authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- 2. AS VIEWS DE LEITURA — rodam como DONO e se guardam no WHERE
-- ───────────────────────────────────────────────────────────────────────────
-- ⚠️ SEM `security_invoker`, de propósito e ao contrário das versões
-- anteriores: é rodando como dono que elas alcançam a matview, que
-- `authenticated` não pode ler. A proteção deixou de ser RLS e passou a ser o
-- `carbo_e_time_interno()` no próprio WHERE — mesmo molde de
-- `carbo_usuarios_bloqueados` e `ml_accounts_public`.
create view public.carbo_nfse_notas as
select * from public.carbo_nfse_notas_mat
where public.carbo_e_time_interno();

comment on view public.carbo_nfse_notas is
  'As NFS-e do ADN, ja parseadas (matview). Roda como DONO — e por isso se guarda no proprio WHERE com carbo_e_time_interno(): matview nao tem RLS.';

create view public.carbo_nfse_eventos as
select * from public.carbo_nfse_eventos_mat
where public.carbo_e_time_interno();

comment on view public.carbo_nfse_eventos is
  'Eventos do ADN, ja parseados. O evento NAO diz de quem e a nota — so ganha sentido ligado a NFS-e pela chave.';

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
-- ⚠️ Os lateral leem as MATVIEWS, não as views acima: view sobre view faria o
-- `carbo_e_time_interno()` ser avaliado por linha, que é justamente o tipo de
-- reavaliação que causou o timeout. A guarda fica UMA vez, no WHERE final.
from public.carbo_nfse_notas_mat n
left join lateral (
  select e.chave_acesso, e.tipo_evento, e.ocorrido_em, e.motivo
  from public.carbo_nfse_eventos_mat e
  where e.ambiente = n.ambiente
    and e.chave_acesso = n.chave_acesso
    and public.carbo_nfse_evento_cancela(e.tipo_evento)
  order by e.ocorrido_em desc nulls last, e.nsu desc
  limit 1
) c on true
left join lateral (
  select e.chave_acesso, e.ocorrido_em
  from public.carbo_nfse_eventos_mat e
  where e.ambiente = n.ambiente
    and e.chave_acesso = n.chave_acesso
    and upper(coalesce(e.tipo_evento,'')) = 'CONFIRMACAO_TOMADOR'
  order by e.ocorrido_em desc nulls last, e.nsu desc
  limit 1
) t on true
left join lateral (
  select nn.chave_acesso, nn.numero
  from public.carbo_nfse_notas_mat nn
  where nn.ambiente = n.ambiente
    and nn.substitui_chave = n.chave_acesso
  order by nn.nsu desc
  limit 1
) s on true
where public.carbo_e_time_interno();

comment on view public.carbo_nfse_visao is
  'A NFS-e pronta para tela: papel, cancelamento (CANCELAMENTO e CANCELAMENTO_POR_SUBSTITUICAO) e o par de substituicao. Le as matviews direto para a guarda ser avaliada UMA vez.';

create view public.carbo_nfse_eventos_orfaos as
select e.*
from public.carbo_nfse_eventos_mat e
where not exists (
  select 1 from public.carbo_nfse_notas_mat n
  where n.ambiente = e.ambiente and n.chave_acesso = e.chave_acesso
)
and public.carbo_e_time_interno();

comment on view public.carbo_nfse_eventos_orfaos is
  'Eventos cuja NFS-e nao esta no nosso log. Lista de trabalho.';

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

comment on view public.carbo_nfse_eventos_tipos is
  'Censo dos tipos de evento do ADN. `conhecido = false` e lista de trabalho: tipo novo nao faz nada ate alguem decidir o que ele significa.';

grant select on public.carbo_nfse_notas, public.carbo_nfse_eventos,
                public.carbo_nfse_visao, public.carbo_nfse_eventos_orfaos,
                public.carbo_nfse_eventos_tipos
  to authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- 3. RECALCULAR
-- ───────────────────────────────────────────────────────────────────────────
-- ⚠️ `refresh materialized view` SEM `concurrently` porque uma função plpgsql
-- JÁ É uma transação, e o `concurrently` é recusado dentro de bloco
-- transacional. O preço é um AccessExclusiveLock durante o recálculo — com
-- ~700 linhas isso são milissegundos, e o índice único fica criado para o dia
-- em que valer a pena chamar o concurrently de fora de uma função.
create or replace function public.carbo_nfse_atualizar()
returns void
language plpgsql security definer set search_path = public as $$
begin
  refresh materialized view public.carbo_nfse_notas_mat;
  refresh materialized view public.carbo_nfse_eventos_mat;
end $$;

comment on function public.carbo_nfse_atualizar() is
  'Recalcula o parse do XML. Chamada pela ingestao quando ela grava documento novo — sem isso a tela mostraria a interpretacao de ontem, sem erro nenhum.';

revoke execute on function public.carbo_nfse_atualizar() from public, anon;
grant execute on function public.carbo_nfse_atualizar() to authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- 4. A INGESTÃO PASSA A RECALCULAR
-- ───────────────────────────────────────────────────────────────────────────
-- ⚠️ Só quando GRAVOU algo. O cron roda de hora em hora e quase sempre volta
-- vazio; recalcular à toa pegaria o lock por nada.
create or replace function public.carbo_nfse_gravar_lote(
  p_lote jsonb,
  p_ambiente text default 'producao'
)
returns table (gravados int, repetidos int, malformados int)
language plpgsql security definer set search_path = public as $$
declare
  item jsonb;
  v_ok boolean;
  v_grav int := 0;
  v_rep  int := 0;
  v_mal  int := 0;
  v_afetadas int;
begin
  for item in select * from jsonb_array_elements(coalesce(p_lote, '[]'::jsonb)) loop
    begin
      perform (item->>'ArquivoXml')::xml;
      v_ok := true;
    exception when others then
      v_ok := false;
    end;

    insert into public.carbo_nfse_dfe
      (ambiente, nsu, chave_acesso, tipo_documento, tipo_evento,
       data_hora_geracao, xml, xml_ok)
    values (
      p_ambiente,
      (item->>'NSU')::bigint,
      item->>'ChaveAcesso',
      item->>'TipoDocumento',
      item->>'TipoEvento',
      nullif(item->>'DataHoraGeracao','')::timestamptz,
      coalesce(item->>'ArquivoXml',''),
      v_ok
    )
    on conflict (ambiente, nsu) do nothing;

    get diagnostics v_afetadas = row_count;
    if v_afetadas = 1 then
      v_grav := v_grav + 1;
      if not v_ok then v_mal := v_mal + 1; end if;
    else
      v_rep := v_rep + 1;
    end if;
  end loop;

  if v_grav > 0 then
    perform public.carbo_nfse_atualizar();
  end if;

  return query select v_grav, v_rep, v_mal;
end $$;

comment on function public.carbo_nfse_gravar_lote(jsonb, text) is
  'Grava um LoteDFe do ADN (ArquivoXml ja descompactado) e recalcula o parse quando entra documento novo. Idempotente por (ambiente, nsu) com do nothing.';

revoke execute on function public.carbo_nfse_gravar_lote(jsonb, text) from public, anon, authenticated;
