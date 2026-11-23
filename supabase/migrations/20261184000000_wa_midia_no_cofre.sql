-- ═══════════════════════════════════════════════════════════════════════════
-- A mídia do WhatsApp guardada no NOSSO storage (23/11/2026)
--
-- O sistema guardava só o `media_id`; o arquivo ficava na Meta, que o guarda
-- por ~30 dias. Medido na tela: figurinha, vídeo e PDF de 17 dias já não
-- abriam (comprovante de pagamento e NF de cliente inclusive), e cada abertura
-- buscava o arquivo de novo na Meta.
--
-- Bucket PRIVADO `wa-midia`, caminho `m/<media_id>`. Quem escreve e lê são as
-- edge functions (service role): o webhook ao receber, o `whatsapp-midia` ao
-- enviar e o `whatsapp-midia-baixar` na primeira abertura do que ainda não
-- estava guardado. ⚠️ SEM policy para `authenticated`, de propósito: o arquivo
-- é de cliente, e quem atende o recebe pela função, que confere o acesso.
-- ═══════════════════════════════════════════════════════════════════════════

insert into storage.buckets (id, name, public, file_size_limit)
values ('wa-midia', 'wa-midia', false, 104857600)   -- 100 MB: o teto da Meta para documento
on conflict (id) do update set public = false;

-- A função de baixar confere que o `media_id` é de uma mensagem nossa antes de
-- entregar o arquivo; sem índice, cada imagem aberta varria a tabela inteira.
create index if not exists carbo_wa_mensagens_midia_id
  on public.carbo_wa_mensagens (midia_id) where midia_id is not null;
