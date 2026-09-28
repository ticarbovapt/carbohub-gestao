-- ═══════════════════════════════════════════════════════════════════════════
-- CarboVAPT por PORTE — a partir da NOTA, que é o que vale
--
-- Decisão do dono do processo em 28/09/2026, depois de eu ter entregue a seção
-- lendo o `/vender`: *"eu preciso disso aqui vindo do portal nacional e não do
-- nosso sistema interno, pq isso aqui é faturamento, vendas com nf que é o que
-- vale para gente"*. Está certo — o painel é de faturamento, e faturamento é NF.
--
-- ⚠️ MAS O PORTE NÃO EXISTE NA NOTA, e isso foi medido antes de escrever:
--
--   • a palavra "porte"/"P"/"M"/"G" NÃO aparece em nenhuma das 342 notas;
--   • o detalhe estruturado `texto|qtd|unit|total#` existe de 07/01 a 30/04 e
--     ACABA ali — 170 notas, R$ 266.542,32. De 04/05 em diante são 172 notas e
--     R$ 461.073,24 sem detalhe nenhum. Não é cobertura parcial: é CORTE DE
--     DATA, sem um dia de sobreposição, e a numeração das notas reiniciou
--     (2120 → 50), ou seja, trocou-se de emissor por volta de 01/05;
--   • a descrição tem ERRO DE DIGITAÇÃO real (`SERVO=IÇO DE DESACRBONIZAÇÃO`,
--     `DESCRBONIZAÇÃO`), então régua de TEXTO erra nos dois sentidos.
--
-- O que a nota tem é o VALOR. Logo, a régua é FAIXA DE VALOR → PORTE, e ela é
-- CADASTRO (`carbo_carbovapt_faixa`), nunca constante no código: o dia em que
-- o P passar de 400 para 450 não pode exigir deploy — e 450 JÁ aparece na base.
--
-- ⚠️ A FAIXA NASCE EXATA (min = max = preço de tabela), de propósito. Faixa
-- larga chutada por mim classificaria R$ 500 como P e R$ 800 como M sem que
-- ninguém pedisse, e o número sairia plausível — que é a doença do `0` de
-- exemplo da `20260969` e do `Math.round` inventando `×1`. Dia um: só o que é
-- CERTO é classificado; o resto aparece como "não classificado", com o R$ do
-- lado. Alargar é um UPDATE de uma linha, feito por quem sabe o preço.
--
-- ⚠️ E a garantia que torna isto conferível: A SOMA FECHA. Toda nota de
-- `140101` sai desta view exatamente uma vez (ou em linhas de detalhe que
-- somam o valor dela), então o total da seção bate com o card CarboVAPT. Uma
-- seção que não fecha com o total é uma segunda verdade sobre o mesmo número.
-- ═══════════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — o CADASTRO das faixas                                       ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

create table if not exists public.carbo_carbovapt_faixa (
  porte         text primary key,
  rotulo        text        not null,
  -- Dica de motor/combustível: o mesmo texto que o vendedor vê no /vender.
  hint          text,
  valor_min     numeric(12,2) not null,
  valor_max     numeric(12,2) not null,
  ordem         integer     not null default 0,
  ativo         boolean     not null default true,
  atualizado_em timestamptz not null default now(),
  constraint carbo_carbovapt_faixa_intervalo check (valor_max >= valor_min)
);

comment on table public.carbo_carbovapt_faixa is
  'Faixa de valor UNITARIO -> porte do CarboVAPT. Cadastro, nunca codigo: preco muda e 450 ja aparece na base. Nasce EXATA (min = max = preco de tabela) porque faixa larga chutada classifica errado sem ninguem notar; alargar e um update de uma linha. Faixa que se SOBREPOE a outra nao duplica dinheiro: a view elege UMA por `ordem` (left join lateral limit 1).';

insert into public.carbo_carbovapt_faixa (porte, rotulo, hint, valor_min, valor_max, ordem) values
  ('P', 'Descarbonização P', 'até 2.5L · flex',          400.00,  400.00, 1),
  ('M', 'Descarbonização M', '2.6L a 3.9L · flex ou diesel', 700.00,  700.00, 2),
  ('G', 'Descarbonização G', 'acima de 4.0L · diesel',  1400.00, 1400.00, 3)
on conflict (porte) do nothing;

alter table public.carbo_carbovapt_faixa enable row level security;
drop policy if exists carbo_carbovapt_faixa_read  on public.carbo_carbovapt_faixa;
drop policy if exists carbo_carbovapt_faixa_write on public.carbo_carbovapt_faixa;
create policy carbo_carbovapt_faixa_read on public.carbo_carbovapt_faixa
  for select to authenticated using (public.carbo_e_time_interno());
create policy carbo_carbovapt_faixa_write on public.carbo_carbovapt_faixa
  for update to authenticated
  using (public.carbo_e_time_interno()) with check (public.carbo_e_time_interno());

grant select on public.carbo_carbovapt_faixa to authenticated;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — a view: uma linha por SERVIÇO, com o porte quando dá        ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
--
-- ⚠️ Roda como DONO e se guarda no próprio WHERE com `carbo_e_time_interno()`
-- — o molde de `carbo_nfse_visao`, `carbo_usuarios_bloqueados` e
-- `ml_accounts_public`. Ela lê as MATVIEWS (que não têm RLS e não têm grant
-- nenhum): ligar `security_invoker` aqui a esvaziaria para todo mundo, e dar
-- grant nas matviews vazaria CNPJ, endereço e telefone de fornecedor para o
-- portal de lojas e o de licenciados, que usam a MESMA `profiles`.
--
-- ⚠️ Consequência conhecida: esta view volta VAZIA no SQL Editor, porque lá
-- `auth.uid()` é nulo. NÃO é defeito. Para conferir por fora, pergunte às
-- matviews. Confundir isso com "quebrou" é meia hora perdida.

create or replace view public.carbo_carbovapt_notas as
with base as (
  -- ⚠️ OS DOIS valores, e eles NAO sao a mesma coisa: `vLiq` e o liquido da
  -- nota e `vServ` o do servico; divergem quando ha retencao. O CARD soma
  -- `valor_liquido`, entao o DINHEIRO daqui tem de ser ele — senao a secao
  -- nao fecha com o total e vira uma segunda verdade. Ja o PRECO que
  -- classifica o porte e o `valor_servico`: e ele que e a tabela.
  select n.nsu, n.ambiente, n.chave_acesso, n.numero, n.emitida_em,
         n.toma_nome, n.toma_doc, n.valor_servico, n.valor_liquido, n.descricao
  from public.carbo_nfse_notas_mat n
  where n.ambiente = 'producao'
    and regexp_replace(coalesce(n.emit_cnpj, ''), '\D', '', 'g') = public.carbo_nfse_cnpj()
    and regexp_replace(coalesce(n.serv_cod_nacional, ''), '\D', '', 'g') = '140101'
),
-- As linhas do detalhe, onde ele existe. Os três `~` não são paranoia: campo
-- que não é número faria o `::numeric` derrubar a view inteira na leitura.
-- ⚠️ `with ordinality`: o `idx` é o que dá CHAVE ESTÁVEL à linha (nsu, idx).
-- Sem ele, duas linhas de detalhe idênticas na mesma nota são indistinguíveis,
-- e paginar por `range` devolveria a mesma linha duas vezes e outra nenhuma —
-- o teto silencioso que já fez esta tela mostrar 865 pedidos de 1.170.
det as (
  select b.nsu,
         t.idx::int                     as idx,
         split_part(t.p, '|', 2)::numeric as qtd,
         split_part(t.p, '|', 3)::numeric as unitario,
         split_part(t.p, '|', 4)::numeric as total_item
  from base b
  cross join lateral regexp_split_to_table(coalesce(b.descricao, ''), '#')
             with ordinality as t(p, idx)
  where t.p like '%|%|%|%'
    and split_part(t.p, '|', 2) ~ '^[0-9]+(\.[0-9]+)?$'
    and split_part(t.p, '|', 3) ~ '^[0-9]+(\.[0-9]+)?$'
    and split_part(t.p, '|', 4) ~ '^[0-9]+(\.[0-9]+)?$'
),
-- ⚠️ O detalhe só é ACEITO quando FECHA com o valor da nota. É identidade, não
-- semelhança — foi assim que a nota de R$ 11.000 se provou (3×400 + 6×700 +
-- 4×1400 = 11.000, exato). Detalhe que não fecha entraria somando dinheiro que
-- a nota não tem, ou perdendo o que ela tem, sem erro nenhum.
det_ok as (
  select d.nsu
  from det d
  join base b on b.nsu = d.nsu
  group by d.nsu, b.valor_servico
  having round(sum(d.total_item), 2) = round(b.valor_servico, 2)
),
linhas as (
  -- Ramo A — nota com detalhe que fecha: uma linha por item, unitário EXATO.
  select b.nsu, b.chave_acesso, b.numero, b.emitida_em, b.toma_nome, b.toma_doc,
         b.ambiente,
         d.idx           as idx,
         'detalhe'::text as origem,
         d.qtd           as quantidade,
         d.unitario      as valor_unitario,
         d.total_item    as valor
  from base b
  join det_ok o on o.nsu = b.nsu
  join det    d on d.nsu = b.nsu

  union all

  -- Ramo B — o resto: a nota inteira, e o "unitário" é o total dela. Só vira
  -- porte se casar EXATO numa faixa; caso contrário fica indefinido, e o
  -- dinheiro continua na conta (é o que faz a soma fechar com o card).
  select b.nsu, b.chave_acesso, b.numero, b.emitida_em, b.toma_nome, b.toma_doc,
         b.ambiente,
         0, 'nota'::text, null::numeric,
         coalesce(b.valor_servico, b.valor_liquido),
         coalesce(b.valor_liquido, b.valor_servico)
  from base b
  where not exists (select 1 from det_ok o where o.nsu = b.nsu)
)
select
  -- Chave ESTAVEL da linha — e por ela que o front pagina.
  l.nsu::text || ':' || l.idx::text as linha_id,
  l.nsu,
  l.chave_acesso,
  l.numero,
  l.emitida_em,
  l.toma_nome,
  l.toma_doc,
  (c.chave_acesso is not null)        as cancelada,
  l.origem,
  l.quantidade,
  coalesce(l.valor_unitario, l.valor) as valor_referencia,
  l.valor,
  f.porte,
  f.rotulo                            as porte_rotulo,
  f.hint                              as porte_hint,
  -- Veículos: do detalhe quando ele existe; 1 quando a nota casou exato numa
  -- faixa (nota de R$ 400 é um P); desconhecido no resto. ⚠️ NUNCA dividir o
  -- valor pela faixa para "descobrir" a quantidade: R$ 1.400 é um G ou dois M,
  -- e escolher um dos dois é inventar resposta a partir de ambiguidade.
  case when l.origem = 'detalhe' then l.quantidade
       when f.porte is not null  then 1
       else null end                  as veiculos
from linhas l
-- ⚠️ `lateral ... limit 1`, não um `left join` simples: faixa que se sobreponha
-- a outra casaria duas vezes e DUPLICARIA o dinheiro da linha. Quem desempata
-- é a `ordem`.
left join lateral (
  select ff.porte, ff.rotulo, ff.hint
  from public.carbo_carbovapt_faixa ff
  where ff.ativo
    and coalesce(l.valor_unitario, l.valor) between ff.valor_min and ff.valor_max
  order by ff.ordem
  limit 1
) f on true
left join lateral (
  select e.chave_acesso
  from public.carbo_nfse_eventos_mat e
  where e.ambiente = l.ambiente and e.chave_acesso = l.chave_acesso
    and public.carbo_nfse_evento_cancela(e.tipo_evento)
  order by e.ocorrido_em desc nulls last, e.nsu desc
  limit 1
) c on true
where public.carbo_e_time_interno();

comment on view public.carbo_carbovapt_notas is
  'Uma linha por SERVICO de CarboVAPT faturado (NFS-e 140101, emitidas). O porte vem de FAIXA DE VALOR (carbo_carbovapt_faixa), porque a nota NAO carrega porte: a palavra nunca aparece e o detalhe estruturado da descricao acabou em 30/04/2026 (trocaram de emissor, numeracao 2120 -> 50). Detalhe so e aceito quando FECHA com o valor da nota. Porte nulo = nao classificado, e o valor CONTINUA na conta — e isso que faz a soma fechar com o card CarboVAPT. ⚠️ Roda como DONO e se guarda no WHERE com carbo_e_time_interno(); volta VAZIA no SQL Editor, e isso nao e defeito.';

grant select on public.carbo_carbovapt_notas to authenticated;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 3 — conferência: rode UMA DE CADA VEZ                           ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- ⚠️ As consultas abaixo NÃO leem a view (ela volta vazia no editor, de
-- propósito). Elas refazem a mesma conta sobre as matviews, que o editor lê
-- como dono. É o preço de a view se guardar sozinha.

-- (a) As três faixas nasceram? ESPERADO: 3 linhas, min = max.
-- select porte, rotulo, valor_min, valor_max, ativo from public.carbo_carbovapt_faixa order by ordem;

-- (b) ⚠️ A ARITMÉTICA QUE FECHA — a conferência que importa.
--     `total_geral` tem de bater com o card CarboVAPT do dashboard, e
--     `classificado + nao_classificado` tem de dar exatamente `total_geral`.
--     Se não fechar, a seção virou uma segunda verdade e NÃO deve ir ao ar.
-- with base as (
--   select n.nsu, n.valor_servico, n.descricao
--   from public.carbo_nfse_notas_mat n
--   where n.ambiente = 'producao'
--     and regexp_replace(coalesce(n.emit_cnpj,''), '\D','','g') = public.carbo_nfse_cnpj()
--     and regexp_replace(coalesce(n.serv_cod_nacional,''), '\D','','g') = '140101'
-- ), det as (
--   select b.nsu, split_part(p,'|',3)::numeric as unitario, split_part(p,'|',4)::numeric as total_item
--   from base b cross join lateral regexp_split_to_table(coalesce(b.descricao,''), '#') p
--   where p like '%|%|%|%'
--     and split_part(p,'|',2) ~ '^[0-9]+(\.[0-9]+)?$'
--     and split_part(p,'|',3) ~ '^[0-9]+(\.[0-9]+)?$'
--     and split_part(p,'|',4) ~ '^[0-9]+(\.[0-9]+)?$'
-- ), det_ok as (
--   select d.nsu from det d join base b on b.nsu = d.nsu
--   group by d.nsu, b.valor_servico having round(sum(d.total_item),2) = round(b.valor_servico,2)
-- ), linhas as (
--   select d.unitario as ref, d.total_item as valor from base b
--     join det_ok o on o.nsu = b.nsu join det d on d.nsu = b.nsu
--   union all
--   select b.valor_servico, b.valor_servico from base b
--    where not exists (select 1 from det_ok o where o.nsu = b.nsu)
-- )
-- select
--   (select sum(valor_servico) from base)                                as total_geral,
--   sum(l.valor) filter (where f.porte is not null)                      as classificado,
--   sum(l.valor) filter (where f.porte is null)                          as nao_classificado,
--   sum(l.valor)                                                         as soma_das_linhas
-- from linhas l
-- left join lateral (
--   select ff.porte from public.carbo_carbovapt_faixa ff
--   where ff.ativo and l.ref between ff.valor_min and ff.valor_max order by ff.ordem limit 1
-- ) f on true;

-- (c) O que sobrou fora da tabela, por valor — é esta lista que diz quais
--     faixas alargar. ⚠️ 500 e 800 aparecem MUITO e não estão na tabela:
--     são preço negociado ou outro serviço? Quem responde é o dono do preço,
--     não a consulta.
-- with base as (
--   select n.valor_servico, n.descricao from public.carbo_nfse_notas_mat n
--   where n.ambiente = 'producao'
--     and regexp_replace(coalesce(n.emit_cnpj,''), '\D','','g') = public.carbo_nfse_cnpj()
--     and regexp_replace(coalesce(n.serv_cod_nacional,''), '\D','','g') = '140101'
--     and coalesce(n.descricao,'') not like '%|%|%|%'
-- )
-- select valor_servico, count(*) as notas, sum(valor_servico) as total
-- from base
-- where not exists (select 1 from public.carbo_carbovapt_faixa f
--                   where f.ativo and base.valor_servico between f.valor_min and f.valor_max)
-- group by 1 order by notas desc, 1;
