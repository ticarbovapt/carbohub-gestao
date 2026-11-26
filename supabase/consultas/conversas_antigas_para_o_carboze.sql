-- ═══════════════════════════════════════════════════════════════════════════
-- Trazer para o CarboZé as conversas ANTIGAS do CarboVAPT e do SAC (20261200)
--
-- Rode no SQL Editor, UM BLOCO DE CADA VEZ, nesta ordem. A função recusa
-- quem está logado: é só por aqui.
--
-- O corte é o instante da troca de papel dos números (a 20261197), lido do
-- registro de mudanças de estrutura do banco. Conversa com qualquer coisa
-- DEPOIS dele fica onde está: o cliente está falando com aquele número.
-- ═══════════════════════════════════════════════════════════════════════════


-- BLOCO A — o corte. ESPERADO: uma linha de hoje (26/11), na hora do merge da
-- troca de números; e nenhum aviso automático saindo pelo CarboVAPT/SAC depois
-- dele (ultimo_aviso_antigo ANTES do corte). Corte nulo = não achou no
-- registro: pare e me mande o resultado.
select
  (select min(em) from public.carbo_ddl_log
    where objeto ilike '%carbo_wa_numeros%' and em >= timestamptz '2026-11-26') as corte,
  (select max(enviado_em) from public.carbo_msg_envios
    where numero_id in ('1274076859132981', '1347087218483622')) as ultimo_aviso_antigo,
  (select min(enviado_em) from public.carbo_msg_envios
    where numero_id = '1255756280958635'
      and (etapa like 'recompra%' or etapa like 'carrinho%')
      and enviado_em >= timestamptz '2026-11-26') as primeiro_comercial_pelo_carboze;


-- BLOCO B — ENSAIO (não muda nada). Por número: quantas conversas existem,
-- quantas MOVEM e quantas FICAM, por quê:
--   ficam_viva_depois_da_troca  o cliente falou com aquele número depois do corte
--   ficam_janela_aberta         escreveu nas últimas 24 h (vão na próxima rodada)
--   ficam_agendada_pendente     tem mensagem agendada para sair por aquele número
select jsonb_pretty(public.carbo_wa_trazer_conversas_antigas(
  (select min(em) from public.carbo_ddl_log
    where objeto ilike '%carbo_wa_numeros%' and em >= timestamptz '2026-11-26'),
  true));


-- BLOCO C — MOVE de verdade, 100 conversas por vez. Rode de novo até
-- "restam": 0. Cada rodada devolve o que moveu (conversas, mensagens, avisos,
-- status e dono, recados, etiquetas).
select jsonb_pretty(public.carbo_wa_trazer_conversas_antigas(
  (select min(em) from public.carbo_ddl_log
    where objeto ilike '%carbo_wa_numeros%' and em >= timestamptz '2026-11-26'),
  false, 100));


-- BLOCO D — conferência. ESPERADO: nas caixas do CarboVAPT e do SAC sobram só
-- as conversas que o ensaio disse que ficam; no CarboZé aparecem as trazidas.
select n.rotulo,
       count(*) filter (where r.ultima_em < (select min(em) from public.carbo_ddl_log
                                               where objeto ilike '%carbo_wa_numeros%'
                                                 and em >= timestamptz '2026-11-26')) as conversas_de_antes_da_troca,
       count(*) as conversas_na_caixa
  from public.carbo_wa_resumo r
  join public.carbo_wa_numeros n on n.phone_number_id = r.numero_id
 group by n.rotulo
 order by n.rotulo;


-- BLOCO E — de onde vieram as trazidas (o número de verdade fica guardado).
select coalesce(n.rotulo, m.numero_original) as veio_de,
       count(distinct m.wa_id) as conversas, count(*) as mensagens
  from public.carbo_wa_mensagens m
  left join public.carbo_wa_numeros n on n.phone_number_id = m.numero_original
 where m.numero_original is not null
 group by 1;


-- AMANHÃ — as de janela aberta: rode o BLOCO C de novo. Ele só traz as que
-- continuaram quietas; a que o cliente voltou a usar fica no número dela.
