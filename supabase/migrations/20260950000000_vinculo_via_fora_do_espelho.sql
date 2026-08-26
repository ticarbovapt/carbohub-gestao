-- ═══════════════════════════════════════════════════════════════════════════
-- `vinculo_via` ganha 'fora_do_espelho_bling2' — e uma lição sobre CHECK
--
-- ── O que muda: um valor ─────────────────────────────────────────────────
--
-- O espelho do Bling 2 começa em 12/06/2026. Existem 13 envios do Melhor Envio
-- de 04/06 a 15/06 cujo `bling_id_ref` foi conferido e existe em
-- `bling_orders` — o espelho do Bling 1, a MATRIZ. São pedidos de antes de a
-- operação online migrar de conta.
--
-- As quatro portas da `carbo_melhorenvio_conciliar()` partem de
-- `bling2_orders`. Nenhuma delas pode alcançar um pedido que está na outra
-- conta — não hoje, não nunca. Deixá-los como `sem_match` faz 15 órfãos
-- permanentes parecerem fila de trabalho, e contador que nunca zera é contador
-- que ninguém olha.
--
-- `ignorado` já existia para isto. O que faltava era um `vinculo_via` que
-- dissesse POR QUE, em vez de deixar a resposta na cabeça de quem marcou.
--
-- ── ⚠️ A lição, que é maior que a mudança ────────────────────────────────
--
-- Ao escrever isto eu afirmei — com todas as letras, num commit — que a porta
-- 1 da conciliação NUNCA tinha conseguido gravar, porque `'bling_id_ref'` não
-- estava no CHECK. A conclusão veio de ler a definição de NASCIMENTO da
-- coluna, na 20260916:
--
--     check (vinculo_via is null or vinculo_via in
--       ('pedido_loja','nf_chave','cpf_valor','cpf_unico','manual'))
--
-- Era falso. A 20260918 já corrige o CHECK na LINHA 41 — no mesmo arquivo cuja
-- cascata eu estava lendo, 22 linhas acima do trecho que eu tinha aberto.
--
-- Os números de produção desmentiram na hora:
--   · `casados_pela_porta_1` = 391 envios;
--   · `cron.job_run_details`: 1755 rodadas, TODAS succeeded, zero falhas.
--
-- ⚠️ Definição de tabela em migração antiga descreve o dia em que a tabela
-- nasceu, não o banco de hoje. Antes de afirmar que uma constraint recusa
-- alguma coisa, pergunte ao BANCO:
--
--     select conname, pg_get_constraintdef(oid) from pg_constraint
--     where conrelid = 'public.melhorenvio_envios'::regclass;
--
-- É a mesma família do aviso que já está no CLAUDE.md sobre comentários de
-- migrações antigas explicando horários de cron que não valem mais. Aqui o
-- erro custou um alarme falso; num sentido menos feliz, custaria o oposto —
-- concluir que uma trava existe quando ela já foi removida.
--
-- ⚠️ RODE EM BLOCOS.
-- ═══════════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — o CHECK como ele está HOJE (não como nasceu)                ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

select conname, pg_get_constraintdef(oid) as definicao
from pg_constraint
where conrelid = 'public.melhorenvio_envios'::regclass
  and conname like '%vinculo_via%';

-- A distribuição real das vias. `bling_id_ref` alto confirma que a porta mais
-- exata é a que mais trabalha — que é exatamente o desenho da cascata.
select coalesce(vinculo_via, '(sem via)') as via, count(*) as envios
from public.melhorenvio_envios
group by 1 order by 2 desc;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — o valor novo                                                ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
--
-- ⚠️ Os dois comandos JUNTOS, num envio só: acrescentar valor a um CHECK é
-- DROP + ADD, não existe "alter check".
--
-- A lista abaixo é a de produção (conferida no BLOCO 1) mais o valor novo.
-- `cpf_unico` foi previsto na 20260916 e nunca usado; fica, porque removê-lo
-- não ganha nada e ele pode voltar.

alter table public.melhorenvio_envios
  drop constraint if exists melhorenvio_envios_vinculo_via_check;

alter table public.melhorenvio_envios
  add constraint melhorenvio_envios_vinculo_via_check
  check (vinculo_via is null or vinculo_via in (
    'bling_id_ref',
    'nf_chave',
    'pedido_loja',
    'cpf_valor',
    'cpf_unico',
    'manual',
    'fora_do_espelho_bling2'   -- ← o único acréscimo
  ));

comment on column public.melhorenvio_envios.vinculo_via is
  'Como o envio foi casado com o pedido. `fora_do_espelho_bling2` marca envio da MATRIZ (Bling 1), anterior ao início do espelho do Bling 2 em 12/06/2026 — as quatro portas partem de bling2_orders e não podem alcançá-lo, nunca. ⚠️ Valor novo entra NESTE CHECK antes de qualquer código escrevê-lo, e a lista de referência é a do BANCO (pg_get_constraintdef), não a da migração que criou a tabela.';


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 3 — os treze da matriz saem da fila de trabalho                 ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
--
-- Reversível e conservador: `ignorado` tira o envio das quatro portas, mas não
-- apaga nada — a tag, a chave da NF e o número da loja continuam na linha.

update public.melhorenvio_envios e
set vinculo_status = 'ignorado',
    vinculo_via    = 'fora_do_espelho_bling2',
    vinculo_em     = now()
where e.bling_id is null
  and e.criado_em_me < '2026-06-16'::date
  -- ⚠️ As TRÊS condições, não só a data. Sem elas isto viraria "desisti de
  -- tudo que é velho", e envio recente sem vínculo é problema de verdade que
  -- não pode ser varrido junto.
  and (e.bling_id_ref is null
       or not exists (select 1 from public.bling2_orders o where o.bling_id = e.bling_id_ref))
  and (e.nf_chave is null
       or not exists (select 1 from public.bling2_orders o
                      join public.bling2_nfe n on n.bling_id = o.nf_bling_id
                      where upper(n.chave_acesso) = upper(e.nf_chave)))
  and (e.pedido_loja is null
       or not exists (select 1 from public.bling2_orders o where o.numero_loja = e.pedido_loja));


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 4 — conferência                                                 ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- ⭐ `orfaos_reais` é o número que passa a valer como trabalho. Zero significa
--    que daqui em diante qualquer órfão é sinal, não ruído herdado.
--    Medido em 26/08/2026: 0 reais, 15 fora do espelho, 402 vinculados.
select count(*) filter (where bling_id is null and vinculo_status <> 'ignorado') as orfaos_reais,
       count(*) filter (where vinculo_status = 'ignorado')                       as fora_do_espelho,
       count(*) filter (where bling_id is not null)                              as vinculados,
       count(*)                                                                  as envios
from public.melhorenvio_envios;

-- ⚠️ O alarme que passa a valer. Órfão NOVO (posterior ao espelho) é problema
-- de verdade: sem vínculo o card não anda e o cliente não é avisado.
select me_id, destinatario_nome, destinatario_doc, valor, transportadora,
       criado_em_me::date, vinculo_status,
       (bling_id_ref is not null) as tem_tag, (nf_chave is not null) as tem_nf, pedido_loja
from public.melhorenvio_envios
where bling_id is null and vinculo_status <> 'ignorado'
order by criado_em_me;
