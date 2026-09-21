-- ═══════════════════════════════════════════════════════════════════════════
-- Nota de BONIFICAÇÃO não é faturamento — e a régua não sabia disso
--
-- Medido em 21/09/2026: 4 pedidos, R$ 5.523,00, somando dentro do faturamento
-- há dez meses.
--
--   V2026090052   11/09/2026   NF 000437   R$ 2.088,00
--   BLING-72      16/03/2026   NF 000187   R$   975,00
--   BLING-61      30/01/2026   NF 000150   R$ 1.950,00
--   BLING-21      06/11/2025   NF 000105   R$   510,00
--
-- Em cima dos R$ 894.017,38 que contam, é 0,62% — pequeno o bastante para
-- nunca ter chamado atenção, que é exatamente por que durou tanto.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- POR QUE ESCAPARAM, E POR QUE A GUARDA EXISTENTE NÃO PEGA
--
-- A `20260903` montou a arquitetura certa: bonificação tem PEDIDO e NOTA
-- próprios, e a nota dela mora em `bling_nf_bonificacao_id` — coluna separada
-- de `bling_nf_id` justamente para uma não sobrescrever a outra. O gatilho
-- `trg_bloqueia_remessa_bonificacao` impede a remessa de voltar do Bling como
-- pedido.
--
-- ⚠️ Mas a marca daquela guarda é o SUFIXO `-BON` na observação ou no número,
-- e ela só alcança o que o NOSSO sistema criou. Não alcança:
--
--   · o que é ANTERIOR a ela (03/09/2026) — os três `BLING-*` acima;
--   · pedido faturado direto no painel do Bling com a natureza de bonificação,
--     que chega sem `-BON` nenhum — o `V2026090052`, de 11/09, oito dias
--     DEPOIS do gatilho. É a prova de que a marca não é suficiente.
--
-- Nos quatro, a nota de bonificação foi parar em `bling_nf_id` (a coluna da
-- nota PRINCIPAL) e por isso o valor conta.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- A REGRA QUE ENTRA: pergunta à NATUREZA, não ao nome
--
-- Natureza de operação é o que o fisco enxerga, é o que o contador cadastra, e
-- é a razão de o trabalho todo da `20260903` existir ("numa nota de natureza
-- normal, desconto de 100% AINDA GERA IMPOSTO"). Se a nota saiu com natureza
-- de remessa em bonificação, ela não é receita — não importa por que caminho
-- o pedido chegou aqui.
--
-- ⚠️ Foi o CFOP que se cogitou primeiro, e o dado o descartou: `naturezaOperacao`
-- vem em 828/828 e 369/369 das notas; `itens` (onde mora o CFOP) vem em
-- 219/828 e 11/369. Sinal que falta em 3 de cada 4 notas não é sinal.
--
-- ⚠️ E a natureza SEPARA: dos 1.170 pedidos que contam hoje, ZERO usam a
-- natureza de bonificação. Não há zona cinzenta — foi essa medição que
-- autorizou aplicar a regra a todos, e não só aos quatro conhecidos.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- POR QUE NA VIEW, E NÃO MARCANDO `excluir_metricas`
--
-- `excluir_metricas` existe (`20260630`) e as SETE cópias de
-- `useCarbozeVendas.ts` já a respeitam. Marcar os quatro resolveria hoje.
--
-- Não resolve amanhã: marcar é um UPDATE, e alguém (gatilho, cron, pessoa)
-- teria de lembrar de rodá-lo quando a próxima nota chegasse. A nota chega
-- DEPOIS do pedido, então o gatilho moraria em `bling_nfe` — mais uma peça
-- móvel que falha calada, que é a família de defeito que este repositório já
-- pagou várias vezes.
--
-- A regra em `carbo_vendas_metrica` é calculada na LEITURA: vale para o
-- passado e para o futuro, não depende de nada rodar, e `conta_metrica` já é
-- a "fonte ÚNICA de esta venda conta". Uma regra, um lugar.
--
-- ⚠️ E ela NÃO apaga dado: `total` continua lá, o pedido continua na lista,
-- as notas continuam nos espelhos. Reverter é republicar a view.
--
-- ⚠️ Consequência que precisa ser dita em voz alta: o número do PASSADO muda.
-- Novembro/2025 cai R$ 510,00, janeiro R$ 1.950,00, março R$ 975,00, setembro
-- R$ 2.088,00. É o objetivo — mas quem fechou aqueles meses vai ver outro
-- número.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- ⚠️ POR QUE ESTE ARQUIVO DERRUBA E RECRIA A VIEW
--
-- Herdado da `20260911`, e continua valendo: a view começa com `o.*`, que é
-- expandido NA CRIAÇÃO. Toda coluna que `carboze_orders` ganhou depois entra
-- no meio da lista e empurra as calculadas — `CREATE OR REPLACE VIEW` recusa
-- com `42P16: cannot change name of view column`.
--
-- E duas funções declaram `returns setof carbo_vendas_metrica`, então
-- dependem do TIPO da view e travam o DROP. `CASCADE` as apagaria em silêncio
-- e a busca global do Sales sumiria sem ninguém saber por quê. Por isso:
-- dropa as dependentes explicitamente, recria a view, recria as dependentes —
-- numa transação só.
--
-- ⚠️ SÃO TRÊS DEPENDENTES, NÃO DUAS. A lista da `20260911` está desatualizada:
-- a view `carbo_vendas_nf_cancelada` nasceu na `20260912`, depois dela, e
-- deu `2BP01: cannot drop view ... because other objects depend on it` na
-- primeira tentativa desta migração. O erro foi barato (a transação inteira
-- abortou, nada ficou pela metade) — mas ele só apareceu porque a lista foi
-- lida do REPOSITÓRIO. A pergunta certa é ao banco, e ela está no BLOCO 0.
--
-- ⚠️ E um `join` dentro de uma view É dependência. Ao conferir "quem mexeu na
-- view depois", procurar só por `create/replace view carbo_vendas_metrica`
-- deixa passar quem apenas a lê — que é o caso desta.
--
-- Os corpos das três dependentes abaixo são cópia LITERAL da `20260911` e da
-- `20260912`, com UMA alteração, explicada no lugar: a `nf_cancelada` passa a
-- filtrar pela coluna `nf_invalida` em vez da string `motivo_fora`.
--
-- ⚠️ RODE EM BLOCOS, na ordem.
-- ═══════════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — a pergunta "esta natureza é de bonificação?"                ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- Lê `carbo_config_fiscal`, que é onde a `20260903` decidiu que esse cadastro
-- mora ("o id é diferente em cada conta, e muda se o contador recadastrar").
--
-- ⚠️ Casa por PADRÃO de chave (`%natureza_bonificacao%`), não por uma lista de
-- nomes. Hoje existem três chaves nessa família — a original
-- `bling_natureza_bonificacao_id` e as duas por conta, `bling1_*` e `bling2_*`
-- — e uma quarta conta amanhã entraria com nome novo. Lista de nomes escrita
-- aqui seria a quarta cópia de um cadastro, e divergir dela não dá erro: dá
-- uma nota de bonificação contando como receita, calada.
--
-- ⚠️ SECURITY DEFINER de propósito. `carbo_config_fiscal` tem RLS, e a view é
-- `security_invoker` — com a função em invoker, um perfil sem leitura da
-- config receberia "nenhuma natureza configurada" e veria o faturamento
-- INFLADO, enquanto um gestor veria o certo. Duas verdades sobre o mesmo
-- número, dependendo de quem olha, é pior que o furo original. A regra não é
-- segredo: são dois ids de cadastro do Bling.
--
-- ⚠️ Sem natureza configurada, a função devolve false e TUDO continua contando
-- — ou seja, ausência mantém o estado de hoje. Isto NÃO é o padrão "ausência
-- FECHA" do CRON_SECRET, e não adianta fingir que é: não existe um lado
-- seguro aqui. Fechar significaria tratar toda nota como bonificação e zerar
-- o faturamento inteiro. O que protege é a CONFERÊNCIA do Bloco 3, que conta
-- quantas naturezas estão configuradas.

create or replace function public.carbo_natureza_e_bonificacao(p_natureza_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    p_natureza_id is not null
    and exists (
      select 1
      from public.carbo_config_fiscal c
      where c.chave like '%natureza_bonificacao%'
        and c.valor is not null
        and btrim(c.valor) <> ''
        and btrim(c.valor) = btrim(p_natureza_id)
    ),
    false
  );
$$;

comment on function public.carbo_natureza_e_bonificacao(text) is
  'true quando o id de natureza de operação é uma das naturezas de bonificação cadastradas em carbo_config_fiscal (qualquer chave %natureza_bonificacao%). SECURITY DEFINER: a resposta não pode depender de quem lê, senão o mesmo faturamento teria dois valores. Sem natureza cadastrada devolve false — mantém o estado atual, porque aqui não existe lado seguro.';

grant execute on function public.carbo_natureza_e_bonificacao(text) to authenticated;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 0 — QUEM depende da view, segundo o BANCO                       ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- ⚠️ Rode ANTES do Bloco 2, sempre que for republicar esta view. Leitura pura.
--
-- Hoje espera-se TRÊS linhas: carbo_vendas_busca, carbo_pdv_pedidos e
-- carbo_vendas_nf_cancelada. Se aparecer uma QUARTA, o Bloco 2 vai abortar com
-- 2BP01 — e a saída é acrescentá-la ao drop/recreate, com o corpo que
-- `pg_get_viewdef`/`pg_get_functiondef` devolve, NUNCA `DROP ... CASCADE`:
-- cascade apaga a dependente em silêncio e ela some do sistema sem erro.

select distinct
  dependente.relkind,
  dependente.relname as depende_de_carbo_vendas_metrica
from pg_depend d
join pg_rewrite r     on r.oid = d.objid
join pg_class dependente on dependente.oid = r.ev_class
join pg_class alvo    on alvo.oid = d.refobjid
where alvo.relname = 'carbo_vendas_metrica'
  and dependente.relname <> 'carbo_vendas_metrica'
order by 2;

-- E as funções que declaram `returns setof carbo_vendas_metrica` (elas
-- dependem do TIPO da view, não das colunas, e não aparecem na consulta acima
-- em toda versão do Postgres):
select p.oid::regprocedure as assinatura
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.prorettype = (
    select c.reltype from pg_class c
    join pg_namespace cn on cn.oid = c.relnamespace
    where cn.nspname = 'public' and c.relname = 'carbo_vendas_metrica'
  );


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — a régua aprende a diferença                                 ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- Transação única: se qualquer passo falhar, nada fica pela metade.

begin;

-- ── 1. As dependentes saem (recriadas idênticas no passo 3) ───────────────
drop view     if exists public.carbo_vendas_nf_cancelada;
drop function if exists public.carbo_vendas_busca(text, integer);
drop function if exists public.carbo_pdv_pedidos(text);

-- ── 2. A view ─────────────────────────────────────────────────────────────
drop view if exists public.carbo_vendas_metrica;

create view public.carbo_vendas_metrica
with (security_invoker = true) as
select
  o.*,
  -- Número e situação da nota que ESTE pedido tem, seja de qual conta for.
  -- ⚠️ coalesce, e não "n2 quando bling_conta = 2": pedido antigo faturado
  -- manualmente na filial não tem `bling_conta` preenchido.
  coalesce(n.numero,   n2.numero)   as nf_numero,
  coalesce(n.situacao, n2.situacao) as nf_situacao,

  -- ⚠️ Cada espelho tem a SUA lista branca de situações. A da matriz
  -- (`carbo_nf_valida`) e a da filial (`bling2_nf_e_valida`) hoje coincidem,
  -- mas são cadastros diferentes e podem divergir — usar uma para julgar a
  -- outra seria supor que o Bling escreve igual nas duas contas.
  (public.carbo_nf_valida(n.situacao) or public.bling2_nf_e_valida(n2.situacao))
    as nf_valida,
  (public.carbo_nf_invalida(n.situacao)
   or (n2.bling_id is not null and not public.bling2_nf_e_valida(n2.situacao)))
    as nf_invalida,

  -- ⬅ NOVO. A natureza da nota PRINCIPAL deste pedido, das duas contas.
  -- ⚠️ Lê `bling_nf_id`/`bling2_nf_id`, NUNCA `bling_nf_bonificacao_id`: a
  -- segunda nota é bonificação por construção e o pedido dela continua
  -- contando normalmente pelo que foi VENDIDO. O defeito que isto corrige é a
  -- nota de bonificação ocupando a coluna da principal.
  public.carbo_natureza_e_bonificacao(
    coalesce(n.raw_data  -> 'naturezaOperacao' ->> 'id',
             n2.raw_data -> 'naturezaOperacao' ->> 'id')
  ) as e_bonificacao,

  coalesce(o.sale_date, o.created_at::date) as data_efetiva,

  (
    o.status not in ('quote', 'cancelled')
    and not public.carbo_natureza_e_bonificacao(          -- ⬅ NOVO
          coalesce(n.raw_data  -> 'naturezaOperacao' ->> 'id',
                   n2.raw_data -> 'naturezaOperacao' ->> 'id'))
    and (
          public.carbo_nf_valida(n.situacao)
       or public.bling2_nf_e_valida(n2.situacao)
       or o.status in ('invoiced', 'shipped', 'delivered')
    )
  ) as conta_metrica,

  case
    when o.status = 'quote'     then 'orcamento'
    when o.status = 'cancelled' then 'cancelado'
    -- ⚠️ A POSIÇÃO é a regra. Entra DEPOIS de orçamento e cancelado, que são
    -- estado do PEDIDO, e ANTES de nf_invalida/aguardando_nf, que são estado
    -- da NOTA: uma nota de bonificação VÁLIDA não tem nada de inválida, e
    -- dizer "aguardando emissão" de um pedido cuja nota já existe mandaria
    -- alguém emitir a segunda. O motivo tem de nomear a verdade durável.
    when public.carbo_natureza_e_bonificacao(
           coalesce(n.raw_data  -> 'naturezaOperacao' ->> 'id',
                    n2.raw_data -> 'naturezaOperacao' ->> 'id'))
      then 'bonificacao'
    when public.carbo_nf_invalida(n.situacao) then 'nf_invalida'
    when n2.bling_id is not null and not public.bling2_nf_e_valida(n2.situacao)
      then 'nf_invalida'
    when not public.carbo_nf_valida(n.situacao)
     and not public.bling2_nf_e_valida(n2.situacao)
     and o.status not in ('invoiced','shipped','delivered') then 'aguardando_nf'
    else null
  end as motivo_fora
from public.carboze_orders o
left join public.bling_nfe  n  on n.bling_id  = o.bling_nf_id
left join public.bling2_nfe n2 on n2.bling_id = o.bling2_nf_id;

comment on view public.carbo_vendas_metrica is
  'Fonte ÚNICA de "esta venda conta". Junta os DOIS espelhos de NF, cada um pela sua coluna (bling_nf_id → bling_nfe, bling2_nf_id → bling2_nfe). Nunca gravar id da conta 2 em bling_nf_id: os dois Blings numeram do zero e o id colidiria com nota real da outra empresa. Nota com natureza de bonificação NÃO é faturamento (e_bonificacao / motivo_fora = bonificacao) — a natureza é o sinal porque vem em 100% das notas, ao contrário do CFOP. ⚠️ Começa com o.* — ganhar coluna em carboze_orders obriga a DROP + recreate desta view e das duas funções que a retornam.';

grant select on public.carbo_vendas_metrica to authenticated;

-- ── 3. As dependentes voltam, IDÊNTICAS ao que eram ───────────────────────
-- Corpo copiado da 20260911, sem alteração nenhuma.

create function public.carbo_vendas_busca(
  p_termo text,
  p_limit integer default 300
) returns setof public.carbo_vendas_metrica
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_raw    text    := coalesce(p_termo, '');
  v_trim   text    := btrim(v_raw);
  v_exato  boolean := v_raw <> '' and v_raw ~ '\s$';
  v_tokens text[];
  v_n      integer;
begin
  if v_trim = '' then
    return;
  end if;

  v_tokens := regexp_split_to_array(lower(v_trim), '\s+');
  v_n := array_length(v_tokens, 1);

  return query
  select o.*
  from public.carbo_vendas_metrica o
  cross join lateral (
    select
      lower(concat_ws(' ',
        o.customer_name, o.order_number, o.delivery_city, o.delivery_state,
        o.customer_email, o.delivery_address, o.customer_ie
      )) as txt,
      concat_ws(' ',
        regexp_replace(coalesce(o.cnpj, ''),           '\D', '', 'g'),
        regexp_replace(coalesce(o.customer_phone, ''), '\D', '', 'g'),
        regexp_replace(coalesce(o.delivery_zip, ''),   '\D', '', 'g'),
        regexp_replace(coalesce(o.customer_ie, ''),    '\D', '', 'g')
      ) as dig
  ) b
  where o.excluir_metricas <> true
    and not exists (
      select 1
      from unnest(v_tokens) with ordinality as t(tok, ord)
      where not (
        (
          length(regexp_replace(t.tok, '\D', '', 'g')) >= 3
          and b.dig like '%' || regexp_replace(t.tok, '\D', '', 'g') || '%'
        )
        or
        b.txt ~ (
          '\m'
          || regexp_replace(t.tok, '([.^$*+?()\[\]{}|\\-])', '\\\1', 'g')
          || case when v_exato and t.ord = v_n then '\M' else '' end
        )
      )
    )
  order by coalesce(o.sale_date, o.created_at::date) desc, o.created_at desc
  limit greatest(coalesce(p_limit, 300), 1);
end $$;

comment on function public.carbo_vendas_busca is
  'Busca global em carbo_vendas_metrica (traz conta_metrica/motivo_fora junto). Casa por início de palavra (todas as palavras digitadas); espaço no fim exige palavra inteira; número 3+ dígitos casa em qualquer posição de CNPJ/CPF, telefone, CEP e IE. SECURITY INVOKER: respeita a RLS de quem chama.';

grant execute on function public.carbo_vendas_busca(text, integer) to authenticated;


create function public.carbo_pdv_pedidos(p_cnpj text)
returns setof public.carbo_vendas_metrica
language sql
stable
security invoker
set search_path = public
as $$
  select v.*
  from public.carbo_vendas_metrica v
  where regexp_replace(coalesce(v.cnpj, ''), '\D', '', 'g')
      = regexp_replace(coalesce(p_cnpj, ''), '\D', '', 'g')
    and length(regexp_replace(coalesce(p_cnpj, ''), '\D', '', 'g')) >= 11
  order by coalesce(v.sale_date, v.created_at::date) desc, v.created_at desc
  limit 200;
$$;

comment on function public.carbo_pdv_pedidos is
  'Pedidos de um PDV, casando por CNPJ só-dígitos dos dois lados. SECURITY INVOKER: respeita a RLS.';

grant execute on function public.carbo_pdv_pedidos(text) to authenticated;


-- Corpo da `20260912`, com UMA alteração — o `where`.
--
-- ⚠️ Ela filtrava por `m.motivo_fora = 'nf_invalida'`, e `motivo_fora` é um
-- CASE com PRIORIDADE: agora que `'bonificacao'` entra antes de
-- `'nf_invalida'`, um pedido de bonificação com a nota cancelada sairia desta
-- lista sem ninguém ter pedido isso. Ele continua não sendo faturamento — mas
-- a pergunta desta view é outra ("a nota deixou de valer, alguém decide se
-- cancela ou reemite"), e ela não deve mudar de resposta porque eu mexi no
-- rótulo de um caso vizinho.
--
-- A view já expõe `nf_invalida` como COLUNA PRÓPRIA, calculada fora do CASE e
-- imune à ordem dele. Filtrar por ela é exatamente o comportamento anterior:
-- a expressão da coluna é idêntica à soma dos dois ramos `nf_invalida` do
-- CASE, e os status `quote`/`cancelled` já são excluídos no próprio `where`
-- daqui.
--
-- ⚠️ A lição geral: `motivo_fora` é RÓTULO, para a tela. Quem filtra em SQL
-- usa a coluna booleana — string de exibição com ordem de precedência muda de
-- significado toda vez que alguém acrescenta um caso.
create view public.carbo_vendas_nf_cancelada
with (security_invoker = true) as
select
  o.order_number,
  o.customer_name,
  o.total,
  o.bling_conta,
  coalesce(o.invoice_number, o.invoice2_number) as nf_numero,
  m.nf_situacao,
  o.sale_date,
  o.updated_at
from public.carboze_orders o
join public.carbo_vendas_metrica m on m.id = o.id
where m.nf_invalida                                  -- era: m.motivo_fora = 'nf_invalida'
  and o.status not in ('quote', 'cancelled');

grant select on public.carbo_vendas_nf_cancelada to authenticated;

comment on view public.carbo_vendas_nf_cancelada is
  'Vendas cuja NF deixou de ser documento válido (cancelada/denegada) mas que continuam abertas no sistema. Sair do faturamento é automático; APARECER aqui é o que faz alguém decidir se cancela a venda ou reemite. Filtra pela COLUNA nf_invalida, nunca por motivo_fora: aquele é um CASE com precedência e muda de significado a cada caso novo (foi o que a 20260981 quase provocou ao inserir bonificacao antes de nf_invalida).';

commit;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 3 — CONFERÊNCIA (rode DEPOIS do commit)                         ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- (a) ⚠️ A pergunta que protege a regra inteira: quantas naturezas estão
--     cadastradas? Tem de vir 2 ou mais. Se vier 0, a função devolve false
--     para tudo e esta migração não fez NADA — sem erro, o que é o modo de
--     falhar que mais custou tempo neste projeto.
select count(*) as naturezas_configuradas
from public.carbo_config_fiscal
where chave like '%natureza_bonificacao%'
  and valor is not null and btrim(valor) <> '';

-- (b) As TRÊS dependentes voltaram? Tem de trazer TRÊS linhas. Se vier menos,
--     a busca global do Sales ou a lista de NF cancelada está fora do ar.
select 'funcao'::text as tipo, p.oid::regprocedure::text as objeto
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('carbo_vendas_busca', 'carbo_pdv_pedidos')
union all
select 'view', c.relname
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname = 'carbo_vendas_nf_cancelada'
order by 1, 2;

-- (b2) ⚠️ A nf_cancelada manteve o security_invoker? Ela é recriada junto, e
--      `create view` sem `WITH` apaga as reloptions. Tem de vir
--      {security_invoker=true}.
select relname, reloptions
from pg_class
where relname = 'carbo_vendas_nf_cancelada';

-- (c) ⚠️ A view manteve o security_invoker? `CREATE VIEW` sem `WITH` apaga as
--     reloptions, e foi assim que a bling2_esteira vazou a esteira inteira
--     para lojista e licenciado. Tem de mostrar {security_invoker=true}.
select relname, reloptions
from pg_class
where relname = 'carbo_vendas_metrica';

-- (d) O placar: os 4 pedidos saíram do faturamento e ninguém mais saiu junto.
--     Esperado: exatamente 4 linhas, somando R$ 5.523,00.
select order_number, data_efetiva, nf_numero, total, motivo_fora
from public.carbo_vendas_metrica
where e_bonificacao
order by data_efetiva desc;

-- (e) O total que conta. Esperado: 1.166 pedidos e R$ 888.494,38
--     (eram 1.170 e R$ 894.017,38 — a diferença é exatamente os 5.523,00).
--     ⚠️ Os números de referência são de 21/09/2026; venda nova entra aqui,
--     então confira a DIFERENÇA, não o valor absoluto.
select count(*) as pedidos_que_contam, sum(total) as faturamento
from public.carbo_vendas_metrica
where conta_metrica and not excluir_metricas;

-- (f) ⚠️ A conferência que impede o falso positivo: nenhum pedido com nota
--     NORMAL pode ter sido marcado. Tem de vir ZERO.
select count(*) as normais_marcados_por_engano
from public.carbo_vendas_metrica
where e_bonificacao
  and order_number not in ('V2026090052', 'BLING-72', 'BLING-61', 'BLING-21');
