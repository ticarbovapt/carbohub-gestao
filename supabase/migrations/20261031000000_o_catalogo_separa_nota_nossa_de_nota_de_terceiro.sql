-- ═══════════════════════════════════════════════════════════════════════════
-- O catálogo separa NOTA NOSSA de NOTA DE TERCEIRO — e uma classificação volta
--
-- Medido em 01/10/2026, no dia seguinte ao catálogo nascer. Ele apontou duas
-- naturezas não classificadas cujas notas referenciam outra nota, eu classifiquei
-- as DUAS como `sem_faturamento`, e o CNPJ dentro da chave referenciada desmentiu
-- metade:
--
--   nossos CNPJs     36060692000100 (matriz) · 36060692000291 (filial)
--
--   000003 · 000005  →  36060692000100   NOSSA    natureza 15110656619  ✅
--   000120           →  03793451000111   TERCEIRO natureza 15109234302  ❌
--
-- ⚠️ **Referenciar nota NOSSA e referenciar nota de TERCEIRO são fatos
-- diferentes**, e o catálogo os tratava como um só:
--
--   nossa     a nota que já faturou é a MÃE          → remessa, entrega futura
--   terceiro  a nota é do fornecedor/cliente         → devolução, retorno, conserto
--
-- As duas saem do faturamento. Mas o `motivo_fora` diria
-- `remessa_entrega_futura` para uma DEVOLUÇÃO — e foi exatamente esse rótulo
-- mentindo que me fez recusar reusar `carbo_natureza_e_bonificacao` na
-- `20261028`. Manter a classificação seria ser incoerente em dois dias.
--
-- ⚠️ **Impacto medido ANTES: ZERO pedidos.** Nenhum pedido que contava estava
-- nessas notas (o faturamento ficou em 1.297 / R$ 930.044,52 depois de
-- classificar). Então desfazer não muda número nenhum, e é por isso que dá para
-- fazer a coisa certa em vez da conveniente.
--
-- ── O que não é pontual ──────────────────────────────────────────────────
--
-- O pedido do dono do processo foi *"consegue verificar para casos assim no
-- futuro?"*. O que resolveu este caso em uma consulta foi comparar o CNPJ da
-- chave referenciada com os nossos. Isso vira COLUNA do catálogo: a próxima
-- natureza aparece já separada, e ninguém precisa descobrir o truque de novo.
--
-- ⚠️ RODE EM BLOCOS.
-- ═══════════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — quais CNPJs são NOSSOS                                      ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- ⚠️ DERIVADO, nunca escrito no código. A chave de acesso de 44 dígitos traz o
-- CNPJ do emitente nas posições 7..20, e toda nota que NÓS emitimos tem a nossa
-- lá. Então a lista se mantém sozinha: conta nova, CNPJ novo ou filial nova
-- entram no instante em que emitem a primeira nota.
--
-- Lista escrita à mão seria mais uma cópia de cadastro — e divergir dela não
-- daria erro: daria nota NOSSA classificada como de terceiro, calada. É a lição
-- do mapa SKU→produto e das listas de "time interno" que vivem copiadas.

create or replace function public.carbo_nossos_cnpjs()
returns setof text
language sql
stable
security definer
set search_path = public
as $$
  select distinct substring(chave_acesso from 7 for 14)
  from public.bling_nfe
  where chave_acesso is not null and length(chave_acesso) = 44
  union
  select distinct substring(chave_acesso from 7 for 14)
  from public.bling2_nfe
  where chave_acesso is not null and length(chave_acesso) = 44;
$$;

comment on function public.carbo_nossos_cnpjs is
  'Os CNPJs que EMITEM nota em nome da empresa, derivados das posicoes 7..20 da chave de acesso das notas das duas contas Bling. DERIVADO de proposito: conta nova, CNPJ novo ou filial nova entram sozinhos ao emitir a primeira nota. Lista escrita a mao seria mais uma copia de cadastro, e divergir dela nao daria erro — daria nota NOSSA classificada como de terceiro, calada. SECURITY DEFINER pela razao de carbo_natureza_e_bonificacao: a resposta nao pode depender de quem le.';

revoke all on function public.carbo_nossos_cnpjs() from public, anon;
grant execute on function public.carbo_nossos_cnpjs() to authenticated;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — a nota referencia QUEM?                                     ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- ⚠️ Pergunta deliberadamente SIMPLES: os dígitos do rodapé contêm algum CNPJ
-- nosso? Extrair a chave de 44 dígitos do texto não dá — o rodapé é livre e o
-- NÚMERO da nota vem junto ("NF 024.630: 2425 1203 ..."), então tirar os
-- não-dígitos produz 50 dígitos e não 44. Qualquer corte por posição erraria.
--
-- A pergunta "contém o nosso CNPJ" não depende de achar onde a chave começa.
-- ⚠️ E o risco é conhecido: um CNPJ de 14 dígitos poderia aparecer por
-- coincidência dentro de uma tira de dígitos. Com 14 dígitos específicos a
-- chance é desprezível, e o erro possível é no sentido de "achar que é nossa" —
-- que mantém a nota na lista de remessa, onde alguém olha, em vez de escondê-la.
--
-- ⚠️ Três estados, e `null` NÃO é "terceiro": sem rodapé, não há o que ler.
-- Colapsar ausência em resposta é a doença do `Math.round` inventando `×1`.

create or replace function public.carbo_nf_referencia_nota_nossa(p_rodape text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_rodape is null or btrim(p_rodape) = '' then null
    when p_rodape !~* 'nota\s+fiscal\s+referenciada' then null
    else exists (
      select 1 from public.carbo_nossos_cnpjs() c
      where regexp_replace(p_rodape, '\D', '', 'g') like '%' || c || '%'
    )
  end;
$$;

comment on function public.carbo_nf_referencia_nota_nossa is
  'true quando o rodape referencia uma nota EMITIDA POR NOS (remessa, entrega futura), false quando referencia nota de TERCEIRO (devolucao, retorno), NULL quando nao ha referencia nenhuma. Os dois primeiros saem do faturamento por razoes DIFERENTES e precisam de rotulos diferentes. Compara por conteudo e nao por posicao porque o rodape e texto livre: o numero da nota vem junto da chave, entao tirar os nao-digitos da 50 digitos e nao 44, e qualquer corte por posicao erraria.';

revoke all on function public.carbo_nf_referencia_nota_nossa(text) from public, anon;
grant execute on function public.carbo_nf_referencia_nota_nossa(text) to authenticated;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 3 — desfazer a classificação ERRADA (só uma das duas)            ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- ⚠️ A `15110656619` FICA: as duas notas dela referenciam a nossa matriz, que é
-- a assinatura de remessa, e o rótulo `remessa_entrega_futura` está correto.
-- Apagar as duas junto — que era o `delete` que eu tinha oferecido — levaria a
-- certa com a errada.
--
-- A `15109234302` SAI e volta para a lista de trabalho. ⚠️ Isso NÃO é
-- regressão: "não classificado" é um estado honesto, e o catálogo existe para
-- carregar exatamente o que ninguém decidiu ainda. O que não pode é uma tela
-- afirmar `remessa_entrega_futura` sobre o que talvez seja devolução.

delete from public.carbo_config_fiscal
where chave = 'bling1_natureza_sem_faturamento_referenciada_15109234302';


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 4 — o catálogo aprende a distinção                               ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- ⚠️ `create or replace view` só aceita coluna nova NO FIM (`42P16 cannot
-- change name of view column` se entrar no meio), então as doze colunas antigas
-- ficam na ordem e nos tipos exatos e as três novas vão depois.
--
-- `suspeita_de_remessa` MUDA DE SENTIDO e mantém o nome: passa a exigir
-- referência a nota NOSSA. É mais apertado do que era, e de propósito — antes
-- ele acusava devolução como remessa, que é o engano que esta migração desfaz.
--
-- ⚠️ `security_invoker = true` REPETIDO: `create or replace view` sem `with`
-- APAGA as reloptions, e foi assim que a `bling2_esteira` passou a rodar como
-- dono com RLS ignorada.

create or replace view public.carbo_naturezas_fiscais
with (security_invoker = true) as
with notas as (
  select
    'matriz'::text                                      as conta,
    nf.raw_data -> 'naturezaOperacao' ->> 'id'          as natureza,
    nf.numero, nf.valor_total, nf.data_emissao,
    (nf.informacoes_adicionais ilike '%NOTA FISCAL REFERENCIADA%') as referencia_outra_nf,
    public.carbo_nf_referencia_nota_nossa(nf.informacoes_adicionais) as ref_nossa
  from public.bling_nfe nf
  union all
  select
    'filial', nf.natureza_operacao,
    nf.numero, nf.valor_total, nf.data_emissao,
    (nf.informacoes_adicionais ilike '%NOTA FISCAL REFERENCIADA%'),
    public.carbo_nf_referencia_nota_nossa(nf.informacoes_adicionais)
  from public.bling2_nfe nf
)
select
  n.conta,
  n.natureza,
  count(*)                                              as notas,
  sum(n.valor_total)                                    as valor,
  min(n.data_emissao)                                   as primeira,
  max(n.data_emissao)                                   as ultima,
  count(*) filter (where n.referencia_outra_nf)         as referenciam_outra_nf,
  public.carbo_natureza_e_bonificacao(n.natureza)       as e_bonificacao,
  public.carbo_natureza_sem_faturamento(n.natureza)     as sem_faturamento,
  (public.carbo_natureza_e_bonificacao(n.natureza)
   or public.carbo_natureza_sem_faturamento(n.natureza)) as classificada,
  -- ⚠️ APERTADO em 01/10/2026: agora exige referência a nota NOSSA. Referenciar
  -- nota de terceiro é devolução, não remessa, e acusá-la aqui faria alguém
  -- cadastrá-la sob um rótulo que mente.
  (not (public.carbo_natureza_e_bonificacao(n.natureza)
        or public.carbo_natureza_sem_faturamento(n.natureza))
   and count(*) filter (where n.ref_nossa) > 0)         as suspeita_de_remessa,
  (array_agg(n.numero order by n.data_emissao desc))[1:3] as exemplos,
  -- ── colunas NOVAS, no fim, por exigência do `create or replace view` ──
  count(*) filter (where n.ref_nossa)                   as referenciam_nota_nossa,
  count(*) filter (where n.ref_nossa is false)          as referenciam_de_terceiro,
  -- A SEGUNDA lista de trabalho, e ela pede outra decisão: devolução, retorno
  -- de conserto, remessa recebida. Também não é receita, e também não é
  -- `remessa_entrega_futura`.
  (not (public.carbo_natureza_e_bonificacao(n.natureza)
        or public.carbo_natureza_sem_faturamento(n.natureza))
   and count(*) filter (where n.ref_nossa is false) > 0) as suspeita_de_devolucao
from notas n
where n.natureza is not null
group by n.conta, n.natureza;

comment on view public.carbo_naturezas_fiscais is
  'Toda natureza de operacao vista nas duas contas Bling, com quanto dinheiro ela carrega e se ja foi classificada. Existe porque bonificacao levou DEZ MESES para aparecer (0,61% do faturamento) e entrega futura levou cinco (1,2%) — as duas achadas por acaso. Desde 01/10/2026 separa DUAS suspeitas, porque referenciar nota NOSSA e referenciar nota de TERCEIRO sao fatos diferentes: suspeita_de_remessa (a nota mae e nossa — entrega futura) e suspeita_de_devolucao (a nota e do fornecedor ou cliente). As duas saem do faturamento, por razoes diferentes, e o motivo_fora precisa dizer qual.';

grant select on public.carbo_naturezas_fiscais to authenticated;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 5 — CONFERÊNCIA. Rode UMA DE CADA VEZ.                          ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- (a) Os nossos CNPJs. ESPERADO: 36060692000100 e 36060692000291.
--     ⚠️ Linha a mais aqui é CNPJ que começou a emitir — não é erro, é
--     cadastro novo. Linha a MENOS seria o problema.
-- select * from public.carbo_nossos_cnpjs();

-- (b) A régua nas três notas do caso. ESPERADO: 000003 e 000005 TRUE
--     (referenciam a matriz), 000120 FALSE (referencia terceiro).
-- select numero,
--        public.carbo_nf_referencia_nota_nossa(informacoes_adicionais) as ref_nossa
-- from public.bling_nfe
-- where numero in ('000003', '000005', '000120')
-- order by numero;

-- (c) ⚠️ O que a classificação virou. ESPERADO: 15110656619 com
--     sem_faturamento = true e suspeita_de_remessa = false (já decidida);
--     15109234302 com sem_faturamento = false e suspeita_de_DEVOLUCAO = true.
-- select conta, natureza, notas, valor, sem_faturamento,
--        referenciam_nota_nossa, referenciam_de_terceiro,
--        suspeita_de_remessa, suspeita_de_devolucao, exemplos
-- from public.carbo_naturezas_fiscais
-- where natureza in ('15110656619', '15109234302');

-- (d) ⚠️ O FATURAMENTO NÃO PODE MUDAR. A natureza que saiu não tinha pedido
--     nenhum que contava — medido antes de classificar. ESPERADO: os mesmos
--     1.297 / R$ 930.044,52.
-- select count(*) as pedidos_que_contam, sum(total) as faturamento
-- from public.carbo_vendas_metrica where conta_metrica;

-- (e) AS DUAS listas de trabalho, que é o que se roda de tempos em tempos.
-- select conta, natureza, notas, valor,
--        referenciam_nota_nossa, referenciam_de_terceiro,
--        suspeita_de_remessa, suspeita_de_devolucao, exemplos
-- from public.carbo_naturezas_fiscais
-- where suspeita_de_remessa or suspeita_de_devolucao
-- order by valor desc;
