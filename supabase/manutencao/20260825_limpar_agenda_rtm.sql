-- ═══════════════════════════════════════════════════════════════════════════
-- MANUTENÇÃO (uso único) — apagar todos os agendamentos e visitas do RTM
--
-- ⚠️ NÃO É MIGRAÇÃO, e por isso não está em supabase/migrations/. Migração roda
-- em todo ambiente novo; um DELETE sem WHERE dentro de migrações apagaria dado
-- de produção na próxima vez que alguém rodasse a sequência do zero.
--
-- Pedido do dono do processo em 25/08/2026: zerar a base de teste do RTM antes
-- do uso real. Eram 6 visitas (13/08 a 21/08, todas `tipo = 'roteiro'`) e os
-- agendamentos correspondentes.
--
-- ── ⚠️ ISTO CONTRARIA UMA REGRA DO PROJETO, CONSCIENTEMENTE ────────────────
--
-- O RTM foi desenhado SEM policy de DELETE em nenhuma tabela de registro, de
-- propósito: visita fechada é imutável e correção é linha nova com
-- `ajuste_de_id`. Este script só funciona porque o SQL Editor roda como dono do
-- banco e RLS não se aplica a ele.
--
-- Isso é aceitável aqui porque o conteúdo é dado de TESTE. Não vire hábito: a
-- partir do momento em que houver visita real, apagar destrói a única prova de
-- que alguém esteve no PDV, e a aderência do mês passa a ser recontável para
-- qualquer valor que se queira.
--
-- ── ⚠️ A ARMADILHA: o celular ressuscita o que o banco apaga ───────────────
--
-- A fila do RTM é offline-first. O IndexedDB do aparelho é a fonte da verdade
-- enquanto a visita está em andamento, e `rtmSincronizar` roda a cada 45 s e no
-- evento `online`. Havia 2 visitas ABERTAS no momento deste script.
--
-- Se o aparelho do vendedor ainda tiver a visita na fila, a sincronização vai
-- tentar reenviá-la depois deste DELETE. E não vai apenas recriá-la: ela leva o
-- `visita_planejada_id` do agendamento que acabou de ser apagado, então a FK
-- recusa e a visita fica ERRADA E PRESA na fila, com `erro` preenchido, a cada
-- 45 segundos, para sempre.
--
-- Por isso o BLOCO 0 é no navegador, não no banco, e vem PRIMEIRO.
-- ═══════════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 0 — NO CELULAR/NAVEGADOR DE QUEM TEM VISITA ABERTA, ANTES       ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
--
-- Console do navegador (F12) em sales.carbohub.com.br, com a sessão aberta:
--
--     __rtmFila.estado()      -- mostra o que está guardado no aparelho
--     __rtmFila.limpar()      -- apaga a fila local e recarrega a tela
--
-- Faça isso em TODO aparelho que tenha usado a tela de visita. Um aparelho
-- esquecido reintroduz a visita sozinho.


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — o que existe hoje (rode antes, para ter o "antes")          ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

select
  (select count(*) from public.rtm_visita_planejada)  as agendamentos,
  (select count(*) from public.rtm_visitas)           as visitas,
  (select count(*) from public.rtm_visitas
    where ts_checkout is null)                        as visitas_abertas,
  (select count(*) from public.rtm_visita_fotos)      as fotos,
  (select count(*) from public.rtm_visita_checklist)  as respostas_checklist,
  (select count(*) from public.rtm_visita_sku)        as linhas_de_sku;

-- As fotos no bucket, que o DELETE das tabelas NÃO remove (ver BLOCO 4).
select count(*) as objetos_no_bucket
from storage.objects where bucket_id = 'rtm-visitas';


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — as visitas                                                  ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
--
-- ⚠️ VISITAS PRIMEIRO, agendamentos depois. `rtm_visitas.visita_planejada_id`
-- é `on delete set null`: apagar o agendamento antes deixaria a visita órfã e
-- viva, fora da agenda e invisível na tela — dado sem dono é pior que dado
-- apagado, porque ninguém sabe que ele está lá.
--
-- Filhas (fotos, checklist, SKU) são `on delete cascade` e vão junto. O
-- `ajuste_de_id` é auto-referência `on delete set null`, então não bloqueia.

delete from public.rtm_visitas;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 3 — os agendamentos                                             ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

delete from public.rtm_visita_planejada;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 4 — as fotos no bucket                                          ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
--
-- ⚠️ Apagar a linha de `rtm_visita_fotos` NÃO apaga o arquivo. O bucket é
-- privado e os objetos ficariam órfãos, ocupando espaço e — pior — ainda
-- acessíveis por URL assinada para quem tivesse guardado o caminho. Storage e
-- tabela são dois sistemas; só o `on delete cascade` do Postgres não alcança o
-- segundo.
--
-- ⚠️ E NÃO DÁ PARA APAGAR POR SQL. Testado em 25/08/2026:
--
--     ERROR: 42501: Direct deletion from storage tables is not allowed.
--            Use the Storage API instead.
--     CONTEXT: PL/pgSQL function storage.protect_delete()
--
-- O Supabase passou a proteger `storage.objects` com um gatilho, justamente
-- para impedir o inverso do problema acima: linha apagada com o arquivo vivo.
-- A remoção tem de passar pela Storage API, que apaga os dois lados juntos.
--
-- O SELECT continua permitido — só o DELETE é barrado. Para ver o que sobrou:
--
--     select name,
--            (storage.foldername(name))[1] as dono_uuid,
--            round((metadata->>'size')::numeric / 1024) as kb,
--            created_at
--     from storage.objects
--     where bucket_id = 'rtm-visitas'
--     order by created_at;
--
-- Caminho A (o curto): painel do Supabase → Storage → bucket `rtm-visitas` →
-- entrar na pasta do UUID → selecionar → Delete. O painel usa a service role e
-- apaga independentemente de quem enviou.
--
-- Caminho B (console do navegador): só funciona para o DONO dos arquivos. A
-- policy `rtm_fotos_delete` da migração 20260897 autoriza apenas
-- `(storage.foldername(name))[1] = auth.uid()` — gestor LÊ mas não apaga, e
-- isso é intencional: apagar foto serve para corrigir dedo na lente antes de
-- fechar a visita, não para gestão mexer em evidência de terceiro.
--
--     const { data } = await supabase.storage.from('rtm-visitas').list(DONO_UUID);
--     await supabase.storage.from('rtm-visitas')
--       .remove(data.map(f => `${DONO_UUID}/${f.name}`));


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 5 — conferência (tudo tem de vir zero)                          ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

select
  (select count(*) from public.rtm_visita_planejada)  as agendamentos,
  (select count(*) from public.rtm_visitas)           as visitas,
  (select count(*) from public.rtm_visita_fotos)      as fotos,
  (select count(*) from public.rtm_visita_checklist)  as respostas_checklist,
  (select count(*) from public.rtm_visita_sku)        as linhas_de_sku,
  (select count(*) from storage.objects
    where bucket_id = 'rtm-visitas')                  as objetos_no_bucket;

-- ⚠️ O que NÃO foi tocado, e não deve ser: `rtm_motivos`, `rtm_checklist_itens`
-- e `rtm_config` são CADASTRO, não registro. Apagar o checklist deixaria a
-- visita sem o que conferir, e apagar os motivos faria "Fez pedido" virar a
-- única forma de fechar visita — ou seja, o app passaria a pressionar o
-- vendedor a registrar uma venda que não houve.
select
  (select count(*) from public.rtm_motivos)          as motivos,
  (select count(*) from public.rtm_checklist_itens)  as itens_de_checklist;
