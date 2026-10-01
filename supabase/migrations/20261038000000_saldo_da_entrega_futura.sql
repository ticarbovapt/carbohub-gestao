-- ═══════════════════════════════════════════════════════════════════════════
-- Saldo da ENTREGA FUTURA — quanto a mãe faturou, quanto já saiu, quanto falta
--
-- Confirmado pelo dono do processo em 01/10/2026: *"são duas notas mães"*. Não
-- é um contrato partido em dois documentos — são dois, cada um com o próprio
-- cronograma. Por isso a view agrupa POR MÃE e nunca soma as duas.
--
-- Medido antes de escrever, e o número é IDENTIDADE, não semelhança:
--
--   mãe 000232   R$ 55.380   6 remessas   R$ 27.690   = 50,00% exatos
--   mãe 000234   R$ 21.840   6 remessas   R$ 10.920   = 50,00% exatos
--
-- Os dois na metade exata, e a soma (R$ 38.610) fecha com a medição
-- independente das 12 notas de remessa. **Dois números que deveriam bater e
-- batem** — foi isso que autorizou construir em cima.
--
-- ── Por que a MÃE não é cadastro ─────────────────────────────────────────
--
-- O caminho óbvio seria cadastrar a natureza da mãe (`15110465964`) ao lado da
-- de remessa. ⚠️ E seria pior: a mãe não precisa ser declarada, porque ela se
-- ANUNCIA — é a nota cuja chave as remessas referenciam no rodapé. Derivar
-- significa que contrato NOVO de entrega futura aparece aqui sozinho, no dia da
-- primeira remessa, sem ninguém cadastrar nada.
--
-- É a mesma decisão de `carbo_nossos_cnpjs()`: o que o dado já diz não vira
-- linha de cadastro, porque cadastro que ninguém lembra de preencher é a
-- origem de metade dos buracos deste repo.
--
-- ⚠️ O que PRECISA de cadastro continua sendo só a natureza de REMESSA
-- (`%natureza_sem_faturamento%`) — é ela que tira do faturamento, e essa parte
-- tem de ser decisão humana explícita.
--
-- ── A chave casa por CONTEÚDO, nunca por posição ─────────────────────────
--
-- Os rodapés reais trazem a chave de três jeitos diferentes:
--
--   NOTA FISCAL REFERENCIADA: 2426 0536 ... (em grupos de 4)
--   NOTA FISCAL REFERENCIADA:24260536...    (colada)
--   CHAVE DE ACESSO NOTA FISCAL REFERENCIADA NF 024.630: 2425 1203 ...
--
-- ⚠️ O terceiro tem o NÚMERO da nota com PONTOS antes da chave, então
-- `regexp_match` ancorado em "REFERENCIADA:" falha nele — e falha em silêncio,
-- devolvendo null como se não houvesse referência. Por isso o casamento é
-- `digitos_do_rodape like '%' || chave_acesso || '%'`: 44 dígitos são
-- específicos o bastante para coincidência ser desprezível, e isso não depende
-- de onde a chave começa. Mesma lição de `carbo_nf_referencia_nota_nossa`.
--
-- ⚠️ RODE EM BLOCOS.
-- ═══════════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — a view                                                      ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- ⚠️ `security_invoker = true`: a nota traz CNPJ e razão social de cliente, e o
-- portal de lojas e o de licenciados usam a MESMA `profiles`. `create view` sem
-- `with` apaga as reloptions — foi assim que a `bling2_esteira` vazou.

create or replace view public.carbo_entrega_futura_saldo
with (security_invoker = true) as
with todas as (
  select 1 as conta, nf.bling_id, nf.numero, nf.valor_total, nf.data_emissao,
         nf.chave_acesso, nf.contato_nome, nf.situacao,
         nf.informacoes_adicionais                      as rodape,
         nf.raw_data -> 'naturezaOperacao' ->> 'id'     as natureza,
         public.carbo_nf_valida(nf.situacao)            as valida
  from public.bling_nfe nf
  union all
  select 2, nf.bling_id, nf.numero, nf.valor_total, nf.data_emissao,
         nf.chave_acesso, nf.contato_nome, nf.situacao,
         nf.informacoes_adicionais,
         nf.natureza_operacao,
         public.bling2_nf_e_valida(nf.situacao)
  from public.bling2_nfe nf
),
-- As remessas: natureza CADASTRADA como sem faturamento. ⚠️ Nota cancelada
-- fica de fora — ela não movimentou nada, e contá-la faria o saldo mentir para
-- MENOS, que é o erro mais caro aqui (sugere que falta entregar o que já foi).
remessa as (
  select r.*, regexp_replace(coalesce(r.rodape, ''), '\D', '', 'g') as digitos
  from todas r
  where public.carbo_natureza_sem_faturamento(r.natureza)
    and r.valida
),
-- ⚠️ A MÃE é DERIVADA: é a nota cuja chave aparece nos dígitos do rodapé de
-- uma remessa. Nada é cadastrado, então contrato novo entra sozinho.
par as (
  select m.conta as mae_conta, m.numero as mae_numero, m.valor_total as mae_valor,
         m.data_emissao as mae_data, m.contato_nome as cliente, m.chave_acesso as mae_chave,
         r.numero as remessa_numero, r.valor_total as remessa_valor,
         r.data_emissao as remessa_data
  from remessa r
  join todas m
    on m.chave_acesso is not null
   and length(m.chave_acesso) = 44
   and r.digitos like '%' || m.chave_acesso || '%'
   -- ⚠️ A remessa não pode ser mãe de si mesma: o rodapé dela contém a própria
   -- chave em alguns formatos, e sem isto o saldo se cancelaria sozinho.
   and m.chave_acesso is distinct from r.chave_acesso
)
select
  p.mae_conta, p.mae_numero, p.cliente, p.mae_valor, p.mae_data,
  count(*)                                         as remessas,
  sum(p.remessa_valor)                             as ja_remetido,
  p.mae_valor - sum(p.remessa_valor)               as saldo,
  round(100.0 * sum(p.remessa_valor) / nullif(p.mae_valor, 0), 2) as pct_remetido,
  min(p.remessa_data)                              as primeira_remessa,
  max(p.remessa_data)                              as ultima_remessa,
  -- ⚠️ ALARME. Remetido MAIOR que a mãe significa que saiu mercadoria que a
  -- nota não cobre — ou que uma remessa foi casada com a mãe errada. Os dois
  -- são trabalho, e nenhum dos dois dá erro em lugar nenhum.
  (sum(p.remessa_valor) > p.mae_valor)             as remetido_demais
from par p
group by p.mae_conta, p.mae_numero, p.cliente, p.mae_valor, p.mae_data;

comment on view public.carbo_entrega_futura_saldo is
  'Saldo de cada contrato de ENTREGA FUTURA: a nota MAE faturou o contrato inteiro e as FILHAS so movimentam a mercadoria, descontando dela. Confirmado pelo dono do processo em 01/10/2026 que a Brisanet sao DUAS maes, cada uma com o proprio cronograma — por isso agrupa por mae e NUNCA soma as duas. A mae e DERIVADA da referencia no rodape da remessa, nao cadastrada: ela se anuncia, entao contrato novo aparece aqui sozinho no dia da primeira remessa. So a natureza de REMESSA e cadastro (%natureza_sem_faturamento%), porque e ela que tira do faturamento e isso tem de ser decisao humana. A chave casa por CONTEUDO (digitos do rodape contem a chave de 44), nunca por posicao: os rodapes reais trazem a chave em tres formatos e um deles tem o numero da nota com pontos antes dela, onde ancorar em REFERENCIADA: falha em silencio. remetido_demais marca saldo negativo — saiu mercadoria que a nota nao cobre, ou uma remessa casou com a mae errada.';

grant select on public.carbo_entrega_futura_saldo to authenticated;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — CONFERÊNCIA. Rode UMA DE CADA VEZ.                          ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- (a) ⚠️ O NÚMERO QUE PROVA A LEITURA. ESPERADO, medido antes de escrever:
--       000232  R$ 55.380  6 remessas  R$ 27.690  50,00%
--       000234  R$ 21.840  6 remessas  R$ 10.920  50,00%
--     Se os percentuais NÃO derem 50,00 redondos, o casamento da chave pegou
--     remessa demais ou de menos — pare e meça com a (c).
-- select mae_numero, cliente, mae_valor, remessas, ja_remetido, saldo,
--        pct_remetido, primeira_remessa, ultima_remessa, remetido_demais
-- from public.carbo_entrega_futura_saldo
-- order by mae_conta, mae_numero;

-- (b) ⚠️ O ALARME. ESPERADO: zero linhas. Linha aqui é mercadoria saindo além
--     do que a nota cobre, ou remessa casada com a mãe errada.
-- select * from public.carbo_entrega_futura_saldo where remetido_demais;

-- (c) ⚠️ A ARITMÉTICA QUE FECHA, e é a melhor conferência que existe: toda
--     remessa válida tem de aparecer em exatamente UMA mãe.
--     ESPERADO: `remessas_no_saldo` = `remessas_existentes` = 12.
--     Diferente significa remessa órfã (rodapé que não casou) ou contada duas
--     vezes (casou com duas mães) — e as duas passam caladas.
-- with existentes as (
--   select count(*) as n from public.bling_nfe nf
--   where public.carbo_natureza_sem_faturamento(nf.raw_data -> 'naturezaOperacao' ->> 'id')
--     and public.carbo_nf_valida(nf.situacao)
-- )
-- select (select sum(remessas) from public.carbo_entrega_futura_saldo) as remessas_no_saldo,
--        (select n from existentes)                                    as remessas_existentes;

-- (d) ⚠️ A REMESSA ÓRFÃ, nominalmente — a que a (c) acusa sem dizer qual.
--     Ela é trabalho: ou o rodapé veio em formato novo, ou a mãe não está no
--     espelho (o do Bling 2 começa em 12/06/2026).
-- select nf.numero, nf.valor_total, nf.data_emissao, nf.contato_nome,
--        left(nf.informacoes_adicionais, 160) as rodape
-- from public.bling_nfe nf
-- where public.carbo_natureza_sem_faturamento(nf.raw_data -> 'naturezaOperacao' ->> 'id')
--   and public.carbo_nf_valida(nf.situacao)
--   and not exists (
--     select 1 from public.bling_nfe m
--     where m.chave_acesso is not null and length(m.chave_acesso) = 44
--       and m.chave_acesso is distinct from nf.chave_acesso
--       and regexp_replace(coalesce(nf.informacoes_adicionais, ''), '\D', '', 'g')
--           like '%' || m.chave_acesso || '%'
--   )
-- order by nf.data_emissao;

-- (e) ⚠️ E o que isto NÃO responde: QUAL pedido é QUAL parcela. As 14 vendas de
--     R$ 1.820 e as remessas de R$ 1.820 são indistinguíveis por valor, e o
--     saldo não resolve isso — ele diz quanto falta do CONTRATO, não a quem
--     cada parcela pertence. Continua sendo decisão de quem acompanha.
-- select order_number, total, dias_esperando, veredito, pedidos_disputando_a_nota
-- from public.carbo_pedido_sem_nota
-- where customer_name ilike '%brisanet%'
-- order by order_number;
