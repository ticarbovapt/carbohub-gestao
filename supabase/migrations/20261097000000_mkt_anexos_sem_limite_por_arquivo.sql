-- =====================================================================
-- Marketing: o bucket `mkt-anexos` deixa de ter limite PRÓPRIO por arquivo
-- (16/10/2026, decisão do dono do processo: "pode deixar sem limite isso por
-- card, não faz diferença").
--
-- O vídeo [ADS]_01_EMMILY.mp4 passava dos 300 MB da `20261060` e o Storage
-- respondia 413. Sem limite no bucket, quem manda é o GLOBAL do projeto
-- (Supabase → Storage → Settings), hoje 5 GB — teto do plano com o spend cap
-- ligado (sem ele, até 500 GB).
--
-- ⚠️ `null` = sem limite PRÓPRIO, não "sem limite nenhum": o global continua
-- valendo. A tela espelha os 5 GB em `LIMITE_BYTES` (`apps/mkt/src/lib/
-- mktArquivos.ts`) só para recusar ANTES de subir; mudou o global, mude lá.
-- =====================================================================

-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 0 — como está (só leitura)                                   ║
-- ╚═══════════════════════════════════════════════════════════════════╝
-- ESPERADO: 1 linha, limite_mb = 300.
select id, file_size_limit, file_size_limit / 1024 / 1024 as limite_mb
from storage.buckets where id = 'mkt-anexos';

-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — tira o limite do bucket                                  ║
-- ╚═══════════════════════════════════════════════════════════════════╝
update storage.buckets set file_size_limit = null where id = 'mkt-anexos';

-- CONFERÊNCIA — ESPERADO: 1 linha, file_size_limit nulo.
select id, file_size_limit from storage.buckets where id = 'mkt-anexos';
