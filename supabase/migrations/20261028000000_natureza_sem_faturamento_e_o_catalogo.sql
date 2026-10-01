-- ═══════════════════════════════════════════════════════════════════════════
-- Natureza que NÃO é faturamento — e o catálogo que denuncia a próxima
--
-- Achado em 01/10/2026 investigando os cards da Brisanet. O rodapé das notas
-- dá a prova, e não é semelhança — é identidade:
--
--   000303  NOTA FISCAL REFERENCIADA: 2426 ... 55 001 000000234 ...
--   000304  NOTA FISCAL REFERENCIADA: 2426 ... 55 001 000000232 ...
--
-- É **entrega futura**: a nota MÃE fatura o contrato inteiro e as FILHAS só
-- movimentam a mercadoria, mês a mês, descontando da mãe. Duas naturezas, e
-- elas se separam sem zona cinzenta:
--
--   15110465964   MÃE      000232 (R$ 55.380) · 000234 (R$ 21.840)
--   15110465968   REMESSA  000255 · 000303 · 000304 · 000384 · 000445 · 000446
--
-- ⚠️ O faturamento da Brisanet já foi contado INTEIRO nas mães (R$ 77.220) — e
-- as seis remessas estão somando de novo: **R$ 11.050 contados em dobro**,
-- mais R$ 25.480 que viriam nas 14 parcelas restantes até abril/27.
--
-- Sobre R$ 940.937,41, são 1,2%. Pequeno o bastante para nunca chamar atenção
-- — que é exatamente por que a bonificação durou dez meses com 0,61%.
--
-- ── Por que NÃO reusar `carbo_natureza_e_bonificacao` ────────────────────
--
-- Mecanicamente funcionaria: basta cadastrar o id sob uma chave
-- `%natureza_bonificacao%` e pronto, sem mexer em view nenhuma. E seria
-- errado: o `motivo_fora` passaria a dizer **"bonificacao"** para uma remessa
-- de entrega futura. Rótulo que mente na tela é como alguém conclui a coisa
-- errada meses depois — e esta tela é lida por quem fecha o mês.
--
-- São conceitos IRMÃOS, não o mesmo: os dois tiram do faturamento, por razões
-- diferentes, e a tela precisa dizer qual.
--
-- ⚠️ RODE EM BLOCOS.
-- ═══════════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — a régua                                                     ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- Gêmea de `carbo_natureza_e_bonificacao`, e de propósito: mesma forma, mesmo
-- padrão de chave, mesma comparação por `carbo_nome_chave` (que é identidade
-- para id e tolera acento/caixa na descrição da filial).
--
-- ⚠️ `SECURITY DEFINER` pela razão da irmã: `carbo_config_fiscal` tem RLS e a
-- view do faturamento é `security_invoker`. Em invoker, um perfil sem leitura
-- da config receberia "nenhuma natureza configurada" e veria o faturamento
-- INFLADO, enquanto o gestor veria o certo. Dois valores para o mesmo número,
-- conforme quem olha, é pior que o furo original.
--
-- ⚠️ E aqui também NÃO existe "ausência fecha": sem natureza cadastrada
-- devolve `false` e tudo continua contando. Fechar significaria tirar do
-- faturamento toda nota cuja natureza ninguém classificou — ou seja, zerar o
-- faturamento. Quem protege contra o esquecimento é o CATÁLOGO do BLOCO 3.

create or replace function public.carbo_natureza_sem_faturamento(p_natureza text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    p_natureza is not null
    and btrim(p_natureza) <> ''
    and exists (
      select 1
      from public.carbo_config_fiscal c
      where c.chave like '%natureza_sem_faturamento%'
        and c.valor is not null
        and btrim(c.valor) <> ''
        and public.carbo_nome_chave(c.valor) = public.carbo_nome_chave(p_natureza)
    ),
    false
  );
$$;

comment on function public.carbo_natureza_sem_faturamento is
  'true quando a natureza NAO representa receita — remessa de entrega futura, remessa para conserto, comodato e afins. IRMA de carbo_natureza_e_bonificacao: as duas tiram do faturamento por razoes DIFERENTES, e o motivo_fora precisa dizer qual. O argumento pode ser o ID (matriz) ou a DESCRICAO (filial), como na irma. SECURITY DEFINER: a resposta nao pode depender de quem le.';

revoke all on function public.carbo_natureza_sem_faturamento(text) from public, anon;
grant execute on function public.carbo_natureza_sem_faturamento(text) to authenticated;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — a natureza de remessa da Brisanet                           ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- ⚠️ A chave TEM de conter `natureza_sem_faturamento` — é o padrão que a
-- função procura. Nome fora do padrão entra na tabela sem erro e não é lido
-- por ninguém: cadastro que parece feito e não vale nada.

insert into public.carbo_config_fiscal (chave, valor, descricao)
values (
  'bling1_natureza_sem_faturamento_remessa_entrega_futura',
  '15110465968',
  'Remessa de entrega futura (matriz). A nota MAE (15110465964) fatura o contrato inteiro; estas so movimentam a mercadoria mes a mes, descontando dela. Contar as duas e dupla contagem: medido em 01/10/2026 na Brisanet, R$ 11.050 ja contados em dobro.'
)
on conflict (chave) do update
  set valor = excluded.valor, descricao = excluded.descricao, updated_at = now();


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 3 — O CATÁLOGO: a lista de trabalho que denuncia a próxima      ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- Esta é a parte que importa mais, e o pedido foi literal: *"consegue
-- verificar para casos assim no futuro? dai não fazemos algo apenas pontual,
-- pq isso passa despercebido"*.
--
-- A bonificação levou DEZ MESES para aparecer (0,61% do faturamento). A
-- entrega futura levou cinco (1,2%). As duas foram achadas por acaso, olhando
-- outra coisa. O que faltava não era régua — era uma lista onde natureza NOVA
-- aparece sozinha, com o dinheiro que ela carrega ao lado.
--
-- É o molde do `carbo_nfse_eventos_tipos`: tipo desconhecido não faz nada e
-- APARECE com `conhecido = false`. Lista branca explícita, nunca regra
-- negativa — regra negativa faria natureza nova mudar o faturamento sozinha,
-- calada, que é o defeito oposto e pior.
--
-- ⚠️ `security_invoker = true` e a cláusula REPETIDA: `create or replace view`
-- sem `with` APAGA as reloptions, e foi assim que a `bling2_esteira` passou a
-- rodar como dono com RLS ignorada.

create or replace view public.carbo_naturezas_fiscais
with (security_invoker = true) as
with notas as (
  select
    'matriz'::text                                      as conta,
    -- ⚠️ Na matriz o detalhe traz `naturezaOperacao.id` e NADA mais — não há
    -- descrição. Por isso o catálogo mostra exemplos de nota: um id sozinho
    -- não permite decidir nada, e lista que não dá para decidir é lista que
    -- ninguém abre.
    nf.raw_data -> 'naturezaOperacao' ->> 'id'          as natureza,
    nf.numero, nf.valor_total, nf.data_emissao,
    -- O sinal que denunciou a Brisanet. "NOTA FISCAL REFERENCIADA" no rodapé
    -- é o que uma nota de REMESSA carrega: ela aponta para a nota que já
    -- faturou. Nenhuma venda comum referencia outra nota.
    (nf.informacoes_adicionais ilike '%NOTA FISCAL REFERENCIADA%') as referencia_outra_nf
  from public.bling_nfe nf
  union all
  select
    'filial', nf.natureza_operacao,
    nf.numero, nf.valor_total, nf.data_emissao,
    (nf.informacoes_adicionais ilike '%NOTA FISCAL REFERENCIADA%')
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
  -- ⚠️ O ALARME. Natureza cujas notas referenciam outra nota é quase sempre
  -- remessa — e se ela não está classificada, está contando receita que já foi
  -- contada. Foi exatamente este o caso da Brisanet, e ele só apareceu porque
  -- alguém foi olhar um card parado.
  (not (public.carbo_natureza_e_bonificacao(n.natureza)
        or public.carbo_natureza_sem_faturamento(n.natureza))
   and count(*) filter (where n.referencia_outra_nf) > 0) as suspeita_de_remessa,
  -- Exemplos para quem for decidir: sem eles o id da matriz é só um número.
  (array_agg(n.numero order by n.data_emissao desc))[1:3] as exemplos
from notas n
where n.natureza is not null
group by n.conta, n.natureza;

comment on view public.carbo_naturezas_fiscais is
  'Toda natureza de operacao vista nas duas contas Bling, com quanto dinheiro ela carrega e se ja foi classificada. Existe porque bonificacao levou DEZ MESES para aparecer (0,61% do faturamento) e entrega futura levou cinco (1,2%) — as duas achadas por acaso. suspeita_de_remessa marca natureza NAO classificada cujas notas referenciam outra nota, que e o que uma remessa faz e uma venda nunca faz.';

grant select on public.carbo_naturezas_fiscais to authenticated;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 4 — CONFERÊNCIA. Rode UMA DE CADA VEZ.                          ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- (a) ⚠️ A LISTA DE TRABALHO. É esta consulta que você roda de tempos em
--     tempos. Linha aqui é dinheiro contado duas vezes.
-- select * from public.carbo_naturezas_fiscais
-- where suspeita_de_remessa
-- order by valor desc;

-- (b) O catálogo inteiro, para ver o que existe e o que já foi decidido.
-- select conta, natureza, notas, valor, classificada, e_bonificacao,
--        sem_faturamento, referenciam_outra_nf, exemplos
-- from public.carbo_naturezas_fiscais
-- order by classificada, valor desc;

-- (c) A régua pegou a natureza da Brisanet? ESPERADO: true.
-- select public.carbo_natureza_sem_faturamento('15110465968') as remessa,
--        public.carbo_natureza_sem_faturamento('15110465964') as mae_nao_pode_ser_true;

-- (d) ⚠️ O faturamento AINDA NÃO mudou — este bloco não toca na
--     `carbo_vendas_metrica`. O número aqui tem de ser o MESMO de antes, e
--     mudar significa que algo saiu do lugar sem ninguém pedir.
-- select count(*) as pedidos_que_contam, sum(total) as faturamento
-- from public.carbo_vendas_metrica where conta_metrica;
