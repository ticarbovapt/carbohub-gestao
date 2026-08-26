-- ═══════════════════════════════════════════════════════════════════════════
-- A porta mais forte da conciliação nunca pôde gravar
--
-- `melhorenvio_envios.vinculo_via` nasceu na 20260916 com este CHECK:
--
--     check (vinculo_via is null or vinculo_via in
--       ('pedido_loja','nf_chave','cpf_valor','cpf_unico','manual'))
--
-- E a 20260918 escreveu a cascata usando `'bling_id_ref'` na porta 1 — o id
-- interno do Bling, vindo da tag da integração. **Esse valor não está na
-- lista.** A porta mais exata de todas, a única sem ambiguidade possível
-- (`bling_id` é chave primária do outro lado), jamais conseguiu gravar uma
-- linha: qualquer casamento dela levanta `23514` e ABORTA a função inteira,
-- levando junto as portas 2, 3 e 4 daquela rodada.
--
-- ⚠️ E o sintoma é o silêncio de sempre. `carbo_melhorenvio_conciliar()` roda
-- por `pg_cron`, que registra a falha em `cron.job_run_details` — uma tabela
-- que ninguém abre. Do lado de fora parece uma conciliação que "não acha
-- nada", não uma que explode.
--
-- É a mesma família do `segmento = 'online'` que teve de entrar no CHECK do
-- Bling 2, e da lição que o CLAUDE.md registra: valor novo num CHECK é escrita
-- falhando sem que ninguém veja. A diferença é que aqui a falha derruba as
-- outras três portas junto.
--
-- ── `cpf_unico` é o oposto: está na lista e ninguém escreve ──────────────
--
-- Ele foi previsto na 20260916 e a 20260918 nunca o usou. Fica, porque tirá-lo
-- não ganha nada e removê-lo de um CHECK exige reescrever a constraint por um
-- valor que talvez volte.
--
-- ── `fora_do_espelho_bling2` ─────────────────────────────────────────────
--
-- Valor novo, para um caso real e permanente. O espelho do Bling 2 começa em
-- 12/06/2026; há 13 envios de 04/06 a 15/06 cujo `bling_id_ref` foi conferido
-- e existe em `bling_orders` — o espelho do Bling 1, a matriz. São pedidos de
-- antes de a operação online migrar de conta.
--
-- As quatro portas partem de `bling2_orders`, então nenhuma delas pode
-- alcançá-los. Nunca. Deixá-los como `sem_match` faz 15 órfãos permanentes
-- parecerem fila de trabalho, e um contador que nunca zera é um contador que
-- ninguém olha. `ignorado` já existe para isto; faltava dizer POR QUE.
--
-- ⚠️ RODE EM BLOCOS.
-- ═══════════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — a prova de que a porta 1 vinha abortando                    ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- (a) A lista atual. `bling_id_ref` NÃO está nela — e é o que a porta 1 grava.
select conname, pg_get_constraintdef(oid) as definicao
from pg_constraint
where conrelid = 'public.melhorenvio_envios'::regclass
  and conname like '%vinculo_via%';

-- (b) ⭐ Quantas vezes o cron da conciliação falhou. Se houver linhas aqui, a
--     função vinha explodindo — e cada explosão levou junto as portas 2, 3 e 4
--     daquela rodada.
select status, count(*) as rodadas,
       min(start_time) as primeira, max(start_time) as ultima,
       (array_agg(return_message order by start_time desc))[1] as ultima_mensagem
from cron.job_run_details d
join cron.job j on j.jobid = d.jobid
where j.jobname = 'melhorenvio-conciliar-5min'
group by status
order by 2 desc;

-- (c) Nenhum envio foi casado pela porta 1 até hoje — tem de vir 0.
select count(*) as casados_pela_porta_1
from public.melhorenvio_envios where vinculo_via = 'bling_id_ref';


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — a lista passa a aceitar o que a função escreve              ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
--
-- ⚠️ Acrescentar valor a um CHECK é DROP + ADD; não existe "alter check". A
-- janela entre os dois é de milissegundos e dentro da mesma transação implícita
-- do comando — mas rode os dois JUNTOS, num único envio, e não um de cada vez.

alter table public.melhorenvio_envios
  drop constraint if exists melhorenvio_envios_vinculo_via_check;

alter table public.melhorenvio_envios
  add constraint melhorenvio_envios_vinculo_via_check
  check (vinculo_via is null or vinculo_via in (
    'bling_id_ref',            -- ⚠️ FALTAVA. A porta 1 grava isto desde a 20260918.
    'nf_chave',
    'pedido_loja',
    'cpf_valor',
    'cpf_unico',               -- previsto na 20260916, nunca usado. Fica.
    'manual',
    'fora_do_espelho_bling2'   -- pedido da matriz (Bling 1), fora do alcance das portas.
  ));

comment on column public.melhorenvio_envios.vinculo_via is
  'Como o envio foi casado com o pedido. ⚠️ `bling_id_ref` ficou FORA desta lista da 20260916 até a 20260950, e é o que a porta 1 grava — a porta mais exata da cascata nunca conseguiu gravar, e cada tentativa abortava a função inteira com 23514, derrubando as portas 2/3/4 da mesma rodada. O sintoma era uma conciliação que parecia não achar nada. ⚠️ Valor novo aqui entra no CHECK ANTES de a função escrevê-lo.';


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 3 — a porta 1 finalmente roda                                   ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- ⭐ `bling_id_ref` maior que zero é a prova. Ela pode casar envios que estavam
--    parados desde 20/08 — e cada um é um card que volta a andar na esteira.
select public.carbo_melhorenvio_conciliar() as agora_com_a_porta_1;

-- ⚠️ De novo: tem de vir tudo zero. A porta 1 sobrepõe vínculo fraco, então a
--    primeira rodada depois desta correção pode reescrever vários — a segunda
--    não pode reescrever nenhum, senão está oscilando.
select public.carbo_melhorenvio_conciliar() as segunda_rodada;

-- ⚠️ Continua tendo de vir VAZIO: toda linha aqui é vínculo errado provado.
select me_id, vinculo_via, bling_id as ligado_em, bling_id_ref as deveria_ser,
       destinatario_nome
from public.melhorenvio_envios
where bling_id_ref is not null and bling_id is not null and bling_id <> bling_id_ref;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 4 — os treze da matriz saem da fila de trabalho                 ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
--
-- ⚠️ Rode DEPOIS do BLOCO 3. Se a porta 1 casar algum deles, ele não é da
-- matriz e não pode ser marcado — o `bling_id is null` abaixo já garante isso,
-- mas a ordem evita marcar e desmarcar.
--
-- Reversível e conservador: `ignorado` tira o envio das quatro portas, mas não
-- apaga nada — a tag, a NF e o número da loja continuam na linha.

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

-- ⭐ `orfaos_reais` é o número que passa a valer como trabalho. Zero significa
--    que daqui em diante qualquer órfão é sinal, não ruído herdado.
select count(*) filter (where bling_id is null and vinculo_status <> 'ignorado') as orfaos_reais,
       count(*) filter (where vinculo_status = 'ignorado')                       as fora_do_espelho,
       count(*) filter (where bling_id is not null)                              as vinculados,
       count(*)                                                                  as envios
from public.melhorenvio_envios;
