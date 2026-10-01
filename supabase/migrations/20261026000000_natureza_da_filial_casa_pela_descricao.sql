-- ═══════════════════════════════════════════════════════════════════════════
-- A natureza da FILIAL casa pela DESCRIÇÃO — porque o id não existe lá
--
-- Medido em 01/10/2026, com o caso que o dono do processo trouxe:
--
--   nf     natureza_operacao                        reconhecida_como_bonificacao
--   000986 Venda de mercadoria a nao contribuinte   false   ← certo
--   000987 Saida em bonificacao                     false   ← ERRADO
--
--   carbo_config_fiscal
--     bling1_natureza_bonificacao_id   15104790196
--     bling2_natureza_bonificacao_id   15110737957
--
-- ⚠️ O cadastro guarda o **ID** da natureza; a nota da filial traz a
-- **DESCRIÇÃO**. A comparação é por igualdade exata, então ela nunca casa — e
-- `carbo_natureza_e_bonificacao` devolve `false` para uma nota cujo rodapé diz
-- literalmente "REMESSA EM BONIFICACAO nao cobrar".
--
-- O sintoma foi o vínculo manual BLOQUEAR: a 000987 caía no ramo de venda,
-- encontrava a 000986 já lá, e recusava. A recusa estava certa; a
-- classificação é que estava errada.
--
-- ── Por que a filial não tem o id, e por que isso não se conserta lá ──────
--
-- A matriz passa `nf.raw_data -> 'naturezaOperacao' ->> 'id'` — o detalhe do
-- Bling 1 traz o objeto completo. O da conta 2 NÃO traz natureza nenhuma
-- (medido: 884 notas, zero). O que temos lá é o `<natOp>` do XML, que é a
-- descrição e só. Não existe de onde tirar o id.
--
-- Então a chave de comparação passa a poder ser as DUAS coisas — e isso não é
-- gambiarra, é o desenho que já estava lá: a função casa por PADRÃO de chave
-- (`%natureza_bonificacao%`), justamente para "natureza nova entra com INSERT,
-- sem deploy". Uma chave de descrição é mais uma linha de cadastro.
--
-- ⚠️ RODE EM BLOCOS.
-- ═══════════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 0 — MEDIR. Quantas notas da filial são de bonificação e hoje    ║
-- ║ passam despercebidas?                                                 ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- ⚠️ Este número é o tamanho do estrago: cada uma delas poderia entrar em
-- `bling2_nf_id` — o lugar da nota de VENDA — e levar o valor da bonificação
-- para dentro do faturamento.
-- select natureza_operacao, count(*) as notas
-- from public.bling2_nfe
-- where natureza_operacao is not null
-- group by 1 order by 2 desc;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — a comparação deixa de depender de acento e caixa            ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- ⚠️ `carbo_nome_chave` dos dois lados. Para um ID ela é identidade (só
-- dígitos), então o comportamento da MATRIZ não muda em nada. Para uma
-- descrição, ela é o que impede o modo de falha mais provável daqui para a
-- frente: o Bling mostrar "Saída em bonificação" e o XML gravar "Saida em
-- bonificacao". Comparação exata entre esses dois devolve `false` e NÃO dá
-- erro — é a mesma lição que o cadastro de PDV pagou, e por isso aquela função
-- existe.
--
-- ⚠️ O nome do parâmetro continua `p_natureza_id`, e sabidamente impreciso:
-- `create or replace function` NÃO permite renomear parâmetro, e trocar o nome
-- exigiria `drop`, que derrubaria `carbo_vendas_metrica` e as três dependentes
-- dela. O comentário abaixo é o que corrige a leitura.

create or replace function public.carbo_natureza_e_bonificacao(p_natureza_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    p_natureza_id is not null
    and btrim(p_natureza_id) <> ''
    and exists (
      select 1
      from public.carbo_config_fiscal c
      where c.chave like '%natureza_bonificacao%'
        and c.valor is not null
        and btrim(c.valor) <> ''
        and public.carbo_nome_chave(c.valor) = public.carbo_nome_chave(p_natureza_id)
    ),
    false
  );
$$;

comment on function public.carbo_natureza_e_bonificacao(text) is
  'true quando a natureza recebida e uma das naturezas de bonificacao cadastradas em carbo_config_fiscal (qualquer chave %natureza_bonificacao%). ATENCAO: o argumento pode ser o ID (matriz — o detalhe do Bling 1 traz naturezaOperacao.id) OU a DESCRICAO (filial — o detalhe da conta 2 nao traz natureza, so o <natOp> do XML). O nome do parametro continua p_natureza_id porque create or replace nao renomeia parametro e o drop derrubaria carbo_vendas_metrica. Compara por carbo_nome_chave: para id e identidade, para descricao evita que acento e caixa facam a comparacao falhar em silencio. SECURITY DEFINER: a resposta nao pode depender de quem le, senao o mesmo faturamento teria dois valores.';

grant execute on function public.carbo_natureza_e_bonificacao(text) to authenticated;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — a descrição da natureza de bonificação da FILIAL            ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- ⚠️ A chave TEM de conter `natureza_bonificacao` — é o padrão que a função
-- procura. Nome fora do padrão entra na tabela sem erro e não é lido por
-- ninguém: cadastro que parece feito e não vale nada.
--
-- ⚠️ E ela NÃO substitui `bling2_natureza_bonificacao_id`. Aquele id continua
-- sendo o que o `bling-sync` usa para EMITIR a nota de remessa; este texto é o
-- que permite RECONHECÊ-LA depois. São duas perguntas diferentes sobre a mesma
-- natureza, e juntá-las numa chave só quebraria a emissão.

insert into public.carbo_config_fiscal (chave, valor, descricao)
values (
  'bling2_natureza_bonificacao_descricao',
  'Saida em bonificacao',
  'A DESCRICAO da natureza de bonificacao da filial (conta 2). Existe porque o detalhe de /nfe/{id} da conta 2 nao devolve naturezaOperacao.id — so o <natOp> do XML, que e texto. A comparacao ignora acento e caixa (carbo_nome_chave).'
)
on conflict (chave) do update
  set valor      = excluded.valor,
      descricao  = excluded.descricao,
      updated_at = now();


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 3 — CONFERÊNCIA. Rode UMA DE CADA VEZ.                          ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- (a) O caso que abriu a migração. ESPERADO: 000986 false, 000987 TRUE.
-- select numero, natureza_operacao,
--        public.carbo_natureza_e_bonificacao(natureza_operacao) as e_bonificacao
-- from public.bling2_nfe
-- where numero in ('000986', '000987');

-- (b) ⚠️ A MATRIZ não pode ter mudado. Este número tem de ser o MESMO de antes
--     da migração — a comparação por `carbo_nome_chave` é identidade para id,
--     mas é a conferência que prova, não o raciocínio.
-- select count(*) as pedidos_que_contam, sum(total) as faturamento
-- from public.carbo_vendas_metrica
-- where conta_metrica;

-- (c) Quantas notas da filial passam a ser reconhecidas como bonificação.
-- select count(*) as notas_de_bonificacao_na_filial
-- from public.bling2_nfe
-- where public.carbo_natureza_e_bonificacao(natureza_operacao);

-- (d) Depois disso, o casamento automático pega as que têm rodapé:
-- select public.carbo_vincula_nf_filial() as vinculos_alterados;
