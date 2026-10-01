-- ═══════════════════════════════════════════════════════════════════════════
-- As duas naturezas que o CATÁLOGO apontou — e a prova vem do RODAPÉ
--
-- A `carbo_naturezas_fiscais` (criada em 01/10/2026 na `20261028`) fez na
-- PRIMEIRA execução o que a bonificação levou dez meses e a entrega futura
-- cinco para fazer por acaso: apontou natureza não classificada cujas notas
-- referenciam outra nota.
--
--   conta   natureza      notas  valor      referenciam  período
--   matriz  15110656619     2    4.314,50      2 de 2    03–04/06/2026
--   matriz  15109234302     1      315,00      1 de 1    15/12/2025
--
-- ⚠️ **100% das notas de cada uma referenciam outra nota.** Nenhuma venda comum
-- faz isso: referenciar é o que uma REMESSA faz, porque ela aponta para a nota
-- que já faturou. Foi exatamente este o sinal da Brisanet.
--
-- ⚠️ MAS 100% de 2 e 100% de 1 são amostras de 2 e de 1. O alarme é forte o
-- suficiente para MANDAR OLHAR e fraco demais para decidir sozinho — por isso o
-- BLOCO 0 lê o rodapé antes, e o BLOCO 1 só roda se ele confirmar.
--
-- ── Por que o id sozinho não decide ──────────────────────────────────────
--
-- Na matriz o detalhe do Bling traz `naturezaOperacao.id` e NADA mais: não há
-- descrição. Um id é um número — e classificar número é inventar resposta, a
-- doença do `Math.round` devolvendo `×1`. O rodapé (`informacoes_adicionais`)
-- é o único texto que essas notas carregam, e é ele que diz o que elas são.
--
-- ⚠️ RODE EM BLOCOS, e o BLOCO 0 PRIMEIRO.
-- ═══════════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 0 — LER o rodapé. Rode UMA DE CADA VEZ.                         ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- (a) ⚠️ O QUE DECIDE. O rodapé inteiro das três notas. Procure por "REMESSA",
--     "ENTREGA FUTURA", "CONSERTO", "COMODATO", "DEVOLUCAO", "DEMONSTRACAO" — e
--     pela nota que cada uma referencia.
--     ⚠️ Se o texto disser VENDA, NÃO rode o BLOCO 1: natureza de venda que
--     referencia outra nota é outra coisa (devolução parcial, complemento de
--     ICMS) e tirar do faturamento estaria errado.
-- select numero, data_emissao, valor_total,
--        nf.raw_data -> 'naturezaOperacao' ->> 'id' as natureza,
--        informacoes_adicionais
-- from public.bling_nfe nf
-- where nf.raw_data -> 'naturezaOperacao' ->> 'id' in ('15110656619', '15109234302')
-- order by data_emissao;

-- (b) ⚠️ Mede o IMPACTO antes de mexer: quantos pedidos que HOJE contam no
--     faturamento estão pendurados nessas notas?
--     ZERO aqui NÃO é motivo para não fazer — foi o caso da bonificação da
--     filial, em que a correção não consertou o passado e sim FECHOU UMA PORTA.
--     Mas é a diferença entre "o faturamento vai cair X" e "nada muda hoje", e
--     ela precisa ser sabida ANTES, não descoberta na conferência.
-- select m.order_number, m.status, m.total, m.nf_numero, m.motivo_fora,
--        m.conta_metrica
-- from public.carbo_vendas_metrica m
-- join public.bling_nfe n on n.bling_id = m.bling_nf_id
-- where n.raw_data -> 'naturezaOperacao' ->> 'id' in ('15110656619', '15109234302')
-- order by m.conta_metrica desc, m.total desc;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — classificar. SÓ se o BLOCO 0 (a) confirmar remessa.          ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- ⚠️ A chave TEM de conter `natureza_sem_faturamento` — é o padrão que
-- `carbo_natureza_sem_faturamento()` procura (`like '%natureza_sem_faturamento%'`).
-- Nome fora do padrão entra na tabela sem erro e NÃO É LIDO POR NINGUÉM:
-- cadastro que parece feito e não vale nada.
--
-- ⚠️ A `descricao` diz o que foi MEDIDO, não o que eu achei que a natureza é.
-- Quando o nome dela aparecer (se um dia o Bling devolver a descrição no
-- detalhe, ou alguém olhar no painel), é a descrição que se corrige — não a
-- régua. Rótulo inventado aqui é o que alguém lê como fato daqui a seis meses.

insert into public.carbo_config_fiscal (chave, valor, descricao)
values
  (
    'bling1_natureza_sem_faturamento_referenciada_15110656619',
    '15110656619',
    'Natureza da MATRIZ apontada por carbo_naturezas_fiscais em 01/10/2026: 2 notas (000003, 000005), R$ 4.314,50, 03-04/06/2026, e as DUAS referenciam outra nota fiscal no rodape. Referenciar e o que uma REMESSA faz e uma venda comum nunca faz. O nome da natureza NAO foi registrado porque o detalhe do Bling 1 traz so naturezaOperacao.id, sem descricao.'
  ),
  (
    'bling1_natureza_sem_faturamento_referenciada_15109234302',
    '15109234302',
    'Natureza da MATRIZ apontada por carbo_naturezas_fiscais em 01/10/2026: 1 nota (000120), R$ 315,00, 15/12/2025, referenciando outra nota fiscal no rodape. Mesma razao da linha acima.'
  )
on conflict (chave) do update
  set valor = excluded.valor, descricao = excluded.descricao, updated_at = now();


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — CONFERÊNCIA. Rode UMA DE CADA VEZ.                          ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- (a) A régua pegou as duas? ESPERADO: true, true.
-- select public.carbo_natureza_sem_faturamento('15110656619') as um,
--        public.carbo_natureza_sem_faturamento('15109234302') as dois;

-- (b) ⚠️ A LISTA DE TRABALHO ESVAZIOU? ESPERADO: zero linhas.
--     E esta é a consulta que vale rodar de tempos em tempos para sempre —
--     linha nova aqui é dinheiro contado duas vezes.
-- select * from public.carbo_naturezas_fiscais
-- where suspeita_de_remessa order by valor desc;

-- (c) O faturamento. ESPERADO: o que o BLOCO 0 (b) previu, e NADA ALÉM.
--     Referência de 01/10/2026, depois da `20261029`: 1.297 / R$ 930.044,52.
-- select count(*) as pedidos_que_contam, sum(total) as faturamento
-- from public.carbo_vendas_metrica where conta_metrica;

-- (d) Os motivos, separados. A remessa da Brisanet eram 6 pedidos /
--     R$ 11.050,00; a bonificacao, 3 / R$ 3.435,00.
-- select motivo_fora, count(*) as pedidos, sum(total) as valor
-- from public.carbo_vendas_metrica
-- where motivo_fora in ('bonificacao', 'remessa_entrega_futura')
-- group by 1 order by 3 desc;

-- (e) O catálogo inteiro, para ver o que existe e o que já foi decidido.
-- select conta, natureza, notas, valor, classificada, e_bonificacao,
--        sem_faturamento, referenciam_outra_nf, exemplos
-- from public.carbo_naturezas_fiscais
-- order by classificada, valor desc;
