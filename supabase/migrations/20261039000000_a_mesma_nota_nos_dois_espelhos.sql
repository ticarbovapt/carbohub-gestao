-- ═══════════════════════════════════════════════════════════════════════════
-- A MESMA nota existe nos DOIS espelhos — e o saldo não duplicou por SORTE
--
-- Achado em 02/10/2026, quando o backfill de natureza da filial terminou
-- (`faltam = 0`, 1.040 notas com natureza) e o catálogo passou a mostrar uma
-- linha que antes não existia:
--
--   filial · "Devolucao de mercadoria recebida em transferencia para comer…"
--            2 notas · R$ 4.314,50 · 03–04/06 · exemplos 000005, 000003
--
-- Mesmos números, mesmos valores, mesmas datas das notas que a MATRIZ já
-- mostrava sob a natureza `15110656619`. A chave de acesso desempatou:
--
--   35260636060692000291550010000000031826577470   ← IDÊNTICA nas duas
--
-- É a MESMA nota, gravada em `bling_nfe` E em `bling2_nfe`. Emitida pela
-- FILIAL (`...000291` na chave), destinatário a matriz.
--
-- ── Medido antes de mexer ────────────────────────────────────────────────
--
--   20 chaves duplicadas · R$ 16.370,59 · 27/05 a 15/06      janela FECHADA
--   mesmo_id = false nas 20                                  ids NÃO colidem
--   remetido_demais = false                                  saldo não duplicou
--
-- ⚠️ Os ids NÃO colidirem é o que impede isso de ser grave: `bling_nf_id` e
-- `bling2_nf_id` continuam apontando para linhas distintas, e a regra de ouro
-- do repo ("as duas contas numeram do zero") segue de pé. E a janela terminou
-- em 15/06 — é artefato da transição para o espelho da conta 2, não um fluxo
-- vivo.
--
-- ── Mas o saldo não duplicou por SORTE, e é isso que esta migração conserta ──
--
-- A cópia da MATRIZ traz a natureza como **id** (`15110656619`, que está
-- cadastrada em `carbo_config_fiscal`); a da FILIAL traz a **descrição**
-- ("Devolucao de mercadoria recebida…"), que NÃO está cadastrada. Então hoje
-- só uma das duas passa por `carbo_natureza_sem_faturamento()` e vira remessa.
--
-- ⚠️ No dia em que alguém cadastrar a DESCRIÇÃO — exatamente o que já foi feito
-- para a bonificação da filial (`bling2_natureza_bonificacao_descricao`, na
-- `20261026`) — as duas cópias passam a contar, e os R$ 4.314,50 entram em
-- DOBRO no saldo do contrato. Sem erro, sem aviso.
--
-- Depender de uma lacuna de cadastro para o número fechar é o mesmo que o
-- `CZ100` em que `display_units_per_pack` e `unidades_por_venda` coincidiam: a
-- coincidência esconde o defeito até o dia em que ela acaba.
--
-- ⚠️ RODE EM BLOCOS.
-- ═══════════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 0 — MEDIR. Rode UMA DE CADA VEZ.                                ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- (a) A duplicação, e se ela PAROU. ⚠️ `ultima` recente significa que o fluxo
--     continua acontecendo, e aí a causa precisa ser achada no sync — esta
--     migração só impede o efeito, não a origem.
-- select count(*) as chaves_duplicadas, sum(n1.valor_total) as valor,
--        min(n1.data_emissao) as primeira, max(n1.data_emissao) as ultima,
--        count(*) filter (where n1.bling_id = n2.bling_id) as com_id_colidindo
-- from public.bling_nfe n1
-- join public.bling2_nfe n2 on n2.chave_acesso = n1.chave_acesso
-- where n1.chave_acesso is not null;

-- (b) ⚠️ A PROVA de que hoje é sorte: a mesma nota, com natureza que resolve
--     num espelho e não no outro.
-- select n1.numero,
--        public.carbo_natureza_sem_faturamento(n1.raw_data -> 'naturezaOperacao' ->> 'id') as matriz_conta,
--        public.carbo_natureza_sem_faturamento(n2.natureza_operacao)                       as filial_conta
-- from public.bling_nfe n1
-- join public.bling2_nfe n2 on n2.chave_acesso = n1.chave_acesso
-- where n1.chave_acesso is not null
-- order by n1.numero;

-- (c) O saldo ANTES. Referência medida: 000232 e 000234 com 6 remessas e
--     50,00%; 000247 e 000251 com 1 remessa e 100%.
-- select mae_numero, cliente, mae_valor, remessas, ja_remetido, saldo,
--        pct_remetido, remetido_demais
-- from public.carbo_entrega_futura_saldo
-- order by mae_conta, mae_numero;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — uma CHAVE, uma nota                                         ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- ⚠️ A chave de acesso é o identificador FISCAL do documento: 44 dígitos que
-- carregam CNPJ do emitente, série, número e dígito verificador. Duas linhas
-- com a mesma chave são a MESMA nota, por definição — não é heurística, é o
-- que a chave significa.
--
-- ⚠️ E a escolha de QUAL cópia manter não é arbitrária: fica a que tem natureza
-- QUE RESOLVE. Manter a outra faria `000247`/`000251` sumirem do saldo hoje —
-- trocaria uma duplicação futura por uma omissão presente, que é pior porque
-- ninguém procura o que não está na tela.
--
-- ⚠️ `security_invoker = true` REPETIDO: `create or replace view` sem `with`
-- APAGA as reloptions.

create or replace view public.carbo_entrega_futura_saldo
with (security_invoker = true) as
with bruto as (
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
-- ⚠️ UMA CHAVE, UMA NOTA. Medido em 02/10/2026: 20 documentos existem nos dois
-- espelhos (R$ 16.370,59, 27/05 a 15/06, artefato da transição para o espelho
-- da conta 2). Hoje o saldo não duplica porque a natureza resolve só num dos
-- lados — e isso é SORTE, não desenho: cadastrar a descrição da natureza, como
-- já foi feito para a bonificação da filial, faria o par contar em dobro.
--
-- ⚠️ A ordenação é a regra: fica a cópia cuja natureza RESOLVE. `nulls last` em
-- `chave_acesso` protege a nota sem chave (não entra no `distinct on`, mas o
-- `coalesce` abaixo a mantém com identidade própria).
todas as (
  select distinct on (coalesce(b.chave_acesso, b.conta || ':' || b.bling_id))
         b.*
  from bruto b
  order by coalesce(b.chave_acesso, b.conta || ':' || b.bling_id),
           public.carbo_natureza_sem_faturamento(b.natureza) desc,
           b.conta
),
remessa as (
  select r.*, regexp_replace(coalesce(r.rodape, ''), '\D', '', 'g') as digitos
  from todas r
  where public.carbo_natureza_sem_faturamento(r.natureza)
    and r.valida
),
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
  (sum(p.remessa_valor) > p.mae_valor)             as remetido_demais
from par p
group by p.mae_conta, p.mae_numero, p.cliente, p.mae_valor, p.mae_data;

comment on view public.carbo_entrega_futura_saldo is
  'Saldo de cada contrato de ENTREGA FUTURA: a nota MAE faturou o contrato inteiro e as FILHAS so movimentam a mercadoria, descontando dela. A Brisanet sao DUAS maes, cada uma com o proprio cronograma — agrupa por mae e NUNCA soma as duas. A mae e DERIVADA da referencia no rodape da remessa, nao cadastrada: ela se anuncia, entao contrato novo aparece sozinho no dia da primeira remessa. UMA CHAVE, UMA NOTA: 20 documentos existem nos DOIS espelhos (bling_nfe e bling2_nfe, R$ 16.370,59, 27/05 a 15/06, artefato da transicao), e sem o distinct on eles contariam em dobro no dia em que a DESCRICAO da natureza for cadastrada ao lado do id — como ja foi feito para a bonificacao da filial. Fica a copia cuja natureza RESOLVE: manter a outra tiraria contratos da tela hoje para evitar uma duplicacao futura. A chave casa por CONTEUDO, nunca por posicao. remetido_demais marca saldo negativo.';

grant select on public.carbo_entrega_futura_saldo to authenticated;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — CONFERÊNCIA. Rode UMA DE CADA VEZ.                          ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- (a) ⚠️ O saldo NÃO PODE TER MUDADO: 000232 e 000234 com 6 remessas e 50,00%;
--     000247 e 000251 com 1 remessa e 100%. Esta migração fecha uma porta
--     FUTURA — se algum número se mexer agora, o `distinct on` cortou o que não
--     devia e eu preciso ver.
-- select mae_numero, cliente, mae_valor, remessas, ja_remetido, saldo,
--        pct_remetido, remetido_demais
-- from public.carbo_entrega_futura_saldo
-- order by mae_conta, mae_numero;

-- (b) A aritmética que fecha, agora contando DOCUMENTO e não linha de espelho.
--     ESPERADO: os dois iguais.
-- with remessas_unicas as (
--   select count(distinct coalesce(n.chave_acesso, '1:' || n.bling_id)) as n
--   from public.bling_nfe n
--   where public.carbo_natureza_sem_faturamento(n.raw_data -> 'naturezaOperacao' ->> 'id')
--     and public.carbo_nf_valida(n.situacao)
-- )
-- select (select sum(remessas) from public.carbo_entrega_futura_saldo) as no_saldo,
--        (select n from remessas_unicas)                               as documentos;

-- (c) ⚠️ A DUPLICAÇÃO CONTINUA ACONTECENDO? `ultima` tem de ficar em 15/06.
--     Data recente significa que o sync voltou a gravar a nota da filial no
--     espelho da matriz, e aí a causa está no `bling-sync`, não aqui.
-- select count(*) as chaves_duplicadas, max(n1.data_emissao) as ultima
-- from public.bling_nfe n1
-- join public.bling2_nfe n2 on n2.chave_acesso = n1.chave_acesso
-- where n1.chave_acesso is not null;
