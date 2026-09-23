-- ═══════════════════════════════════════════════════════════════════════════
-- NFS-e Nacional (ADN) — FASE 1: o log cru, e a leitura por cima dele
--
-- Pedido do dono do processo em 23/09/2026: trazer o Portal Nacional da NFS-e
-- para dentro do sistema, no Finanças, "igual com o Bling", com as notas
-- EMITIDAS e as RECEBIDAS.
--
-- A Fase 0 (edge function `nfse-nacional`, só leitura) respondeu o que precisava
-- ser respondido antes de qualquer tabela existir: o ADN TEM as notas da
-- empresa. `DOCUMENTOS_LOCALIZADOS`, 50 documentos no primeiro lote, ambiente
-- de PRODUÇÃO. E, mais importante, mostrou o XML REAL — as colunas abaixo são
-- os campos que ele traz, não os que eu imaginaria.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- ⚠️ SEIS coisas que o XML real desmentiu, e cada uma muda o desenho
--
-- 1. ⚠️ O EVENTO NÃO DIZ DE QUEM É A NOTA. Medido no NSU 10 (CANCELAMENTO):
--    ele tem `CNPJAutor` (quem cancelou, 44276192000139) e `chNFSe`, e mais
--    nada. Não há `toma`, não há `emit`. Ou seja: **não dá para julgar um
--    evento isoladamente** — ele só ganha sentido ligado à NFS-e pela CHAVE.
--    Consequência: evento cuja nota ainda não chegou é ÓRFÃO, e tem de ser
--    guardado assim mesmo. Descartá-lo perderia um cancelamento para sempre,
--    e a nota continuaria valendo na tela. É a mesma razão de `payt_eventos`
--    guardar o corpo cru antes de qualquer interpretação.
--
-- 2. ⚠️ `ChaveAcesso` NÃO É ÚNICA no lote — ela é a chave da NOTA, e o evento
--    a repete (no NSU 10, `ChaveAcesso` == `chNFSe`). Uma nota cancelada
--    aparece em DUAS linhas com a mesma chave. Quem identifica a linha é o
--    **NSU**, e só ele. Índice único na chave recusaria o cancelamento.
--
-- 3. ⚠️ NSU NÃO É ORDEM DE EMISSÃO. No NSU 1 a nota foi emitida em
--    2023-02-03 e o ADN a gerou em 2023-05-10 — três meses depois. O NSU é a
--    ordem em que o ADN as enfileirou para NÓS. Por isso o checkpoint é o NSU,
--    nunca uma data: recortar por data pularia documento antigo que chegou hoje.
--
-- 4. ⚠️ NOME NÃO IDENTIFICA A EMPRESA — o CNPJ sim. No NSU 1 o `toma` é o
--    nosso CNPJ (36060692000100) com o nome "PPDB Assessoria Administrativa
--    Ltda", razão social ANTIGA. O certificado diz "CARBO SOLUCOES LTDA". Casar
--    por nome deixaria a própria empresa de fora, calado — exatamente a lição
--    já paga no cadastro de PDV.
--
-- 5. ⚠️ São DOIS valores, e eles não são o mesmo número.
--       infNFSe/valores/vLiq                    o LÍQUIDO da nota
--       infDPS/valores/vServPrest/vServ         o valor do SERVIÇO
--    Coincidem quando não há retenção nem desconto (no NSU 1, 57,00 e 57,00) —
--    e é essa coincidência que convida a unificar os dois, como já aconteceu
--    com `display_units_per_pack` e `unidades_por_venda`. Ficam SEPARADOS.
--
-- 6. ⚠️ `ambGer` NÃO serve para separar produção de teste. No NSU 1 ele é 1 e
--    no NSU 10 é 2, e os DOIS vieram de `TipoAmbiente: PRODUCAO`. Quem responde
--    isso é o ambiente da CONSULTA, que fica na coluna `ambiente`.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- ⚠️ GUARDA O CRU, INTERPRETA NA LEITURA
--
-- A tabela guarda o XML como veio. Toda regra — quem é emitente, quem é
-- tomador, qual o valor, se foi cancelada — é VIEW por cima. É o mesmo molde do
-- `conta_metrica`: regra calculada na leitura vale para o passado e para o
-- futuro, e corrigir um entendimento errado é republicar uma view, sem
-- re-sincronizar nada com o gov.br.
--
-- O oposto (gravar campo já interpretado) exigiria rebuscar tudo a cada vez que
-- eu entendesse melhor um campo — e o ADN entrega por NSU, então "rebuscar" é
-- justamente o que ele não facilita.
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────
-- 1. O LOG CRU
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists public.carbo_nfse_dfe (
  ambiente          text        not null default 'producao'
                                check (ambiente in ('producao','restrita')),
  nsu               bigint      not null,
  chave_acesso      text,
  tipo_documento    text,
  tipo_evento       text,
  data_hora_geracao timestamptz,
  xml               text        not null,
  -- ⚠️ `xml_ok` existe para que UM documento malformado não bloqueie o NSU
  -- para sempre. Guardar na coluna `xml` (type `xml`) faria o INSERT do lote
  -- inteiro abortar, e o checkpoint nunca passaria daquele ponto — o canal
  -- pararia calado. Aqui o documento entra, a flag o tira das views de leitura,
  -- e ele aparece na lista de trabalho em vez de sumir.
  xml_ok            boolean     not null default true,
  recebido_em       timestamptz not null default now(),
  primary key (ambiente, nsu)
);

comment on table public.carbo_nfse_dfe is
  'Log CRU do Ambiente de Dados Nacional da NFS-e, append-only. Uma linha por NSU. ⚠️ chave_acesso NÃO é única: o evento de cancelamento repete a chave da nota. Quem identifica a linha é (ambiente, nsu).';
comment on column public.carbo_nfse_dfe.nsu is
  'Número Sequencial Único do ADN. É o checkpoint da integração — e NÃO é ordem de emissão: o NSU 1 traz nota de fev/23 gerada no ADN em mai/23.';
comment on column public.carbo_nfse_dfe.xml_ok is
  'false quando o XML não passou no cast para o tipo xml. A linha fica guardada e sai das views de leitura — um documento estranho não pode travar o NSU.';

-- ⚠️ Índice por chave, NÃO único (ver nota 2 no topo): é por ele que o evento
-- encontra a nota, e é justamente aí que a chave se repete.
create index if not exists carbo_nfse_dfe_chave_idx
  on public.carbo_nfse_dfe (chave_acesso);
create index if not exists carbo_nfse_dfe_tipo_idx
  on public.carbo_nfse_dfe (ambiente, tipo_documento);

alter table public.carbo_nfse_dfe enable row level security;

-- ⚠️ SELECT só para o time interno. A nota traz CNPJ, endereço, telefone e
-- e-mail de fornecedor e da própria empresa — e o portal de lojas e o de
-- licenciados usam a MESMA tabela `profiles`.
drop policy if exists "time interno le o dfe da nfse" on public.carbo_nfse_dfe;
create policy "time interno le o dfe da nfse"
  on public.carbo_nfse_dfe for select
  using (public.carbo_e_time_interno());

-- ⚠️ NENHUMA policy de INSERT/UPDATE/DELETE, de propósito: quem grava é a edge
-- function com service role, que passa por cima da RLS. Sem policy, não existe
-- caminho pelo PostgREST para forjar ou apagar documento fiscal. Mesmo molde do
-- `carbo_usuario_bloqueio_log`.

-- ───────────────────────────────────────────────────────────────────────────
-- 2. O CNPJ DA EMPRESA — cadastro, não constante no código
-- ───────────────────────────────────────────────────────────────────────────
-- ⚠️ É ele que separa nota EMITIDA de nota RECEBIDA, e por isso não pode estar
-- escrito em código: o `emit` e o `toma` vêm os dois no XML, e quem diz qual
-- deles somos nós é este valor. Vai para `carbo_config_fiscal`, que já é onde
-- esse tipo de cadastro mora (`20260903`).
insert into public.carbo_config_fiscal (chave, valor, descricao)
values ('nfse_cnpj_proprio', '36060692000100',
        'CNPJ da empresa no Portal Nacional da NFS-e, só dígitos. Separa nota emitida de nota recebida. Veio do certificado A1 usado no mTLS (CN=CARBO SOLUCOES LTDA:36060692000100).')
on conflict (chave) do nothing;

-- ⚠️ SECURITY DEFINER pela MESMA razão da `carbo_natureza_e_bonificacao`:
-- `carbo_config_fiscal` tem RLS e as views abaixo são `security_invoker`. Em
-- invoker, um perfil sem leitura da config veria TODA nota como "indefinida" e
-- o total de notas emitidas mudaria conforme quem olha. Dois valores para o
-- mesmo número é pior que o furo original.
create or replace function public.carbo_nfse_cnpj()
returns text
language sql stable security definer set search_path = public as $$
  select regexp_replace(coalesce(valor,''), '\D', '', 'g')
  from public.carbo_config_fiscal
  where chave = 'nfse_cnpj_proprio'
  limit 1;
$$;

comment on function public.carbo_nfse_cnpj() is
  'CNPJ próprio (só dígitos) para decidir emitida x recebida. SECURITY DEFINER: a resposta não pode depender de quem lê. Vazio/nulo ⇒ papel fica `indefinido`, que APARECE na tela — nunca um chute.';

-- ───────────────────────────────────────────────────────────────────────────
-- 3. LER UM CAMPO DO XML
-- ───────────────────────────────────────────────────────────────────────────
-- O namespace `http://www.sped.fazenda.gov.br/nfse` está em TODO documento, e
-- xpath sem ele devolve vazio — sem erro. Repetir o array de namespace em cada
-- campo seria dezenas de chances de esquecer; um esquecimento devolve null e a
-- coluna aparece vazia na tela, calada.
create or replace function public.carbo_nfse_txt(p_xml xml, p_caminho text)
returns text
language sql immutable as $$
  select (xpath(p_caminho, p_xml,
                array[array['n','http://www.sped.fazenda.gov.br/nfse']]))[1]::text;
$$;

comment on function public.carbo_nfse_txt(xml, text) is
  'Primeiro nó do xpath como texto, já com o namespace do SPED. ⚠️ xpath sem o namespace devolve vazio SEM ERRO — por isso ninguém chama xpath direto aqui.';

-- ───────────────────────────────────────────────────────────────────────────
-- 4. AS NOTAS
-- ───────────────────────────────────────────────────────────────────────────
drop view if exists public.carbo_nfse_visao;
drop view if exists public.carbo_nfse_eventos;
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

  public.carbo_nfse_txt(b.x, '/n:NFSe/n:infNFSe/n:nNFSe/text()')        as numero,
  public.carbo_nfse_txt(b.x, '/n:NFSe/n:infNFSe/n:cStat/text()')        as situacao_codigo,
  public.carbo_nfse_txt(b.x, '/n:NFSe/n:infNFSe/n:xLocEmi/text()')      as municipio_emissao,
  public.carbo_nfse_txt(b.x, '/n:NFSe/n:infNFSe/n:xLocPrestacao/text()') as municipio_prestacao,
  public.carbo_nfse_txt(b.x, '/n:NFSe/n:infNFSe/n:xTribNac/text()')     as servico_nacional,

  -- Emitente (prestador)
  public.carbo_nfse_txt(b.x, '/n:NFSe/n:infNFSe/n:emit/n:CNPJ/text()')  as emit_cnpj,
  public.carbo_nfse_txt(b.x, '/n:NFSe/n:infNFSe/n:emit/n:xNome/text()') as emit_nome,

  -- Tomador. ⚠️ Pode ser CNPJ **ou** CPF — pessoa física é tomador legítimo, e
  -- só ler CNPJ deixaria essas notas sem contraparte, sem erro nenhum.
  coalesce(
    public.carbo_nfse_txt(b.x, '/n:NFSe/n:infNFSe/n:DPS/n:infDPS/n:toma/n:CNPJ/text()'),
    public.carbo_nfse_txt(b.x, '/n:NFSe/n:infNFSe/n:DPS/n:infDPS/n:toma/n:CPF/text()')
  )                                                                      as toma_doc,
  public.carbo_nfse_txt(b.x, '/n:NFSe/n:infNFSe/n:DPS/n:infDPS/n:toma/n:xNome/text()') as toma_nome,

  -- Datas. `dhEmi` é a emissão de verdade; `dhProc` é o processamento.
  nullif(public.carbo_nfse_txt(b.x, '/n:NFSe/n:infNFSe/n:DPS/n:infDPS/n:dhEmi/text()'), '')::timestamptz as emitida_em,
  nullif(public.carbo_nfse_txt(b.x, '/n:NFSe/n:infNFSe/n:dhProc/text()'), '')::timestamptz               as processada_em,
  nullif(public.carbo_nfse_txt(b.x, '/n:NFSe/n:infNFSe/n:DPS/n:infDPS/n:dCompet/text()'), '')::date      as competencia,

  -- ⚠️ DOIS valores, separados de propósito (nota 5 no topo).
  nullif(public.carbo_nfse_txt(b.x, '/n:NFSe/n:infNFSe/n:valores/n:vLiq/text()'), '')::numeric      as valor_liquido,
  nullif(public.carbo_nfse_txt(b.x, '/n:NFSe/n:infNFSe/n:valores/n:vBC/text()'), '')::numeric       as base_calculo,
  nullif(public.carbo_nfse_txt(b.x, '/n:NFSe/n:infNFSe/n:valores/n:vTotalRet/text()'), '')::numeric as total_retido,
  nullif(public.carbo_nfse_txt(b.x,
    '/n:NFSe/n:infNFSe/n:DPS/n:infDPS/n:valores/n:vServPrest/n:vServ/text()'), '')::numeric         as valor_servico,

  public.carbo_nfse_txt(b.x,
    '/n:NFSe/n:infNFSe/n:DPS/n:infDPS/n:serv/n:cServ/n:xDescServ/text()')                           as descricao
from base b;

comment on view public.carbo_nfse_notas is
  'As NFS-e do ADN, lidas do XML cru. Regra na LEITURA: corrigir um entendimento é republicar a view, sem rebuscar nada no gov.br.';

-- ───────────────────────────────────────────────────────────────────────────
-- 5. OS EVENTOS
-- ───────────────────────────────────────────────────────────────────────────
create view public.carbo_nfse_eventos
with (security_invoker = true) as
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
  -- ⚠️ `chNFSe` do corpo, com o `ChaveAcesso` do lote como reserva. No NSU 10
  -- os dois são iguais; usar SÓ o do lote confiaria num campo que o ADN monta,
  -- e usar só o do corpo perderia o evento cujo XML variar de formato.
  coalesce(
    public.carbo_nfse_txt(b.x,
      '/n:evento/n:infEvento/n:pedRegEvento/n:infPedReg/n:chNFSe/text()'),
    b.chave_acesso
  )                                                                     as chave_acesso,
  public.carbo_nfse_txt(b.x,
    '/n:evento/n:infEvento/n:pedRegEvento/n:infPedReg/n:CNPJAutor/text()') as autor_cnpj,
  nullif(public.carbo_nfse_txt(b.x,
    '/n:evento/n:infEvento/n:pedRegEvento/n:infPedReg/n:dhEvento/text()'), '')::timestamptz as ocorrido_em,
  public.carbo_nfse_txt(b.x,
    '/n:evento/n:infEvento/n:pedRegEvento/n:infPedReg/n:e101101/n:xMotivo/text()') as motivo,
  public.carbo_nfse_txt(b.x,
    '/n:evento/n:infEvento/n:pedRegEvento/n:infPedReg/n:e101101/n:cMotivo/text()') as motivo_codigo
from base b;

comment on view public.carbo_nfse_eventos is
  'Eventos do ADN (hoje só CANCELAMENTO). ⚠️ O evento NÃO diz de quem é a nota — não tem emitente nem tomador. Ele só ganha sentido ligado à NFS-e pela chave de acesso.';

-- ───────────────────────────────────────────────────────────────────────────
-- 6. A VISÃO DA TELA — nota + papel + cancelamento
-- ───────────────────────────────────────────────────────────────────────────
create view public.carbo_nfse_visao
with (security_invoker = true) as
select
  n.*,

  -- ⚠️ TRÊS estados, nunca dois. `indefinido` é o caso em que o CNPJ próprio
  -- não está cadastrado, ou a nota não cita nenhuma das duas pontas como nós —
  -- e ele precisa APARECER. Colapsá-lo em "recebida" (o palpite natural, já que
  -- a maioria é) inventaria nota de fornecedor a partir de ausência de resposta,
  -- que é a doença do `Math.round` devolvendo ×1.
  case
    when public.carbo_nfse_cnpj() = '' or public.carbo_nfse_cnpj() is null then 'indefinido'
    when regexp_replace(coalesce(n.emit_cnpj,''), '\D', '', 'g') = public.carbo_nfse_cnpj() then 'emitida'
    when regexp_replace(coalesce(n.toma_doc,''), '\D', '', 'g') = public.carbo_nfse_cnpj() then 'recebida'
    else 'indefinido'
  end as papel,

  (c.chave_acesso is not null)                                   as cancelada,
  c.ocorrido_em                                                  as cancelada_em,
  c.motivo                                                       as cancelamento_motivo
from public.carbo_nfse_notas n
-- ⚠️ `left join`, e sobre a chave: nota sem evento é o caso NORMAL. E o
-- cancelamento mais recente vence — a mesma nota pode receber mais de um
-- evento, e `nSeqEvento` existe justamente por isso.
left join lateral (
  select e.chave_acesso, e.ocorrido_em, e.motivo
  from public.carbo_nfse_eventos e
  where e.ambiente = n.ambiente
    and e.chave_acesso = n.chave_acesso
    and e.tipo_evento = 'CANCELAMENTO'
  order by e.ocorrido_em desc nulls last, e.nsu desc
  limit 1
) c on true;

comment on view public.carbo_nfse_visao is
  'A NFS-e pronta para tela: papel (emitida/recebida/indefinido) e cancelamento aplicado. ⚠️ `indefinido` é resposta, não defeito — significa CNPJ próprio não cadastrado ou nota que não cita a empresa.';

-- ───────────────────────────────────────────────────────────────────────────
-- 7. EVENTO ÓRFÃO — a lista de trabalho
-- ───────────────────────────────────────────────────────────────────────────
-- ⚠️ Existe porque o evento não se explica sozinho (nota 1 no topo). Cancelamento
-- cuja nota nunca chegou fica AQUI, visível, em vez de sumir — sumir significaria
-- uma nota valendo na tela depois de cancelada, que é o erro caro.
create or replace view public.carbo_nfse_eventos_orfaos
with (security_invoker = true) as
select e.*
from public.carbo_nfse_eventos e
where not exists (
  select 1 from public.carbo_nfse_notas n
  where n.ambiente = e.ambiente and n.chave_acesso = e.chave_acesso
);

comment on view public.carbo_nfse_eventos_orfaos is
  'Eventos cuja NFS-e não está no nosso log. Lista de trabalho: se não esvaziar sozinha conforme o NSU avança, o documento não vem pelo ADN e o cancelamento não está sendo aplicado a nada.';

-- ───────────────────────────────────────────────────────────────────────────
-- 8. A GRAVAÇÃO — idempotente, e o checkpoint é DERIVADO
-- ───────────────────────────────────────────────────────────────────────────
-- ⚠️ NÃO existe tabela de checkpoint, de propósito. O último NSU lido é
-- `max(nsu)` do próprio log — uma verdade só. Uma coluna separada criaria o par
-- que diverge (o log com o documento e o checkpoint dizendo que não), e nesse
-- par o erro é mudo nos dois sentidos: atrás, reprocessa; à frente, PULA
-- documento para sempre. Mesma razão de `banned_until` responder "está
-- bloqueado?" em vez do log de bloqueio.
create or replace function public.carbo_nfse_ultimo_nsu(p_ambiente text default 'producao')
returns bigint
language sql stable security definer set search_path = public as $$
  select coalesce(max(nsu), 0)
  from public.carbo_nfse_dfe
  where ambiente = p_ambiente;
$$;

-- Grava um lote inteiro. Recebe o `LoteDFe` como jsonb, exatamente como o ADN
-- devolve, com o `ArquivoXml` JÁ descompactado pela edge function.
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
    -- ⚠️ O cast é testado AQUI, não confiado. Um documento malformado entra
    -- com xml_ok=false e sai das views; ele não pode abortar o lote, senão o
    -- NSU trava naquele ponto e o canal para em silêncio.
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
    -- ⚠️ `do nothing`, NUNCA `do update`. O documento fiscal não muda depois de
    -- emitido; correção vem como EVENTO, em linha nova. Sobrescrever daria ao
    -- reprocessamento o poder de reescrever histórico — e é o `do nothing` que
    -- torna a rodada interrompida segura de repetir.
    on conflict (ambiente, nsu) do nothing;

    get diagnostics v_afetadas = row_count;
    if v_afetadas = 1 then
      v_grav := v_grav + 1;
      if not v_ok then v_mal := v_mal + 1; end if;
    else
      v_rep := v_rep + 1;
    end if;
  end loop;

  return query select v_grav, v_rep, v_mal;
end $$;

comment on function public.carbo_nfse_gravar_lote(jsonb, text) is
  'Grava um LoteDFe do ADN (ArquivoXml já descompactado). Idempotente por (ambiente, nsu) com do nothing: documento fiscal não é reescrito, correção vem como evento.';

-- ⚠️ Nenhum `grant execute` para `authenticated`: quem grava é a edge function
-- com service role. Função de escrita alcançável pelo PostgREST seria um
-- caminho para injetar documento fiscal.
revoke execute on function public.carbo_nfse_gravar_lote(jsonb, text) from public, anon, authenticated;

grant execute on function public.carbo_nfse_ultimo_nsu(text) to authenticated;
grant execute on function public.carbo_nfse_cnpj() to authenticated;
grant select on public.carbo_nfse_notas, public.carbo_nfse_eventos,
                public.carbo_nfse_visao, public.carbo_nfse_eventos_orfaos
  to authenticated;
