-- ═══════════════════════════════════════════════════════════════════════════
-- Conversas: RESPONDER CITANDO e REAGIR (26/11/2026)
--
-- Pedido do time de atendimento (sugestão no app do TI): marcar uma mensagem
-- e respondê-la, como no WhatsApp — e reagir. As duas são da Cloud API, então
-- o CLIENTE vê no celular dele a citação e a reação.
--
-- O que já existia e só não aparecia:
--   • `carbo_wa_mensagens.responde_a` — o webhook grava o `context.id` de toda
--     mensagem do cliente que cita outra. A view `carbo_wa_conversas` não o
--     expõe, então a tela nunca mostrou "o cliente respondeu a ISTO".
--   • a reação do cliente — chega como mensagem `reaction`, com o alvo no
--     payload (`reaction.message_id`). A tela a desenhava solta, sem dizer a
--     QUAL mensagem.
--
-- O que é novo:
--   • `carbo_wa_reacoes` — a reação NOSSA, uma por mensagem (a última vale).
--     ⚠️ Mora FORA de `carbo_wa_mensagens` de propósito: lá toda SAÍDA de gente
--     conta como resposta (lista, resumo, painel, SLA). Um 👍 não responde
--     pergunta nenhuma — se contasse, reagir "fecharia" a espera do cliente.
--   • `carbo_wa_conversa_mensagens` passa a devolver, por mensagem:
--       responde_a       o wamid citado (nossa resposta citando OU a do cliente)
--       reage_a          o alvo, quando a linha é uma reação do cliente
--       nossa_reacao     o emoji que NÓS pusemos nesta mensagem (nulo = nenhum)
--       nossa_reacao_por quem pôs
--     A view NÃO é tocada (ela alimenta lista, resumo e vínculo de pedido).
--
-- ⚠️ No SQL Editor a função volta VAZIA (sem usuário a guarda é falsa) — certo.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.carbo_wa_reacoes (
  numero_id   text        not null,
  wa_id       text        not null,
  alvo_wamid  text        not null,
  -- nulo = a reação foi TIRADA (a Meta recebe emoji vazio). A linha fica:
  -- é o registro de quem tirou e quando.
  emoji       text,
  wamid       text,
  em          timestamptz not null default now(),
  por         uuid,
  por_nome    text,
  primary key (numero_id, alvo_wamid)
);

create index if not exists carbo_wa_reacoes_conversa_idx
  on public.carbo_wa_reacoes (numero_id, wa_id);

comment on table public.carbo_wa_reacoes is
  'A reação NOSSA a uma mensagem do cliente (uma por mensagem; emoji nulo = tirada). Escrita só pela '
  'whatsapp-responder (service role). Fora de carbo_wa_mensagens porque lá toda saída de gente conta '
  'como resposta, e reagir não responde (20261198).';

alter table public.carbo_wa_reacoes enable row level security;

drop policy if exists carbo_wa_reacoes_le on public.carbo_wa_reacoes;
create policy carbo_wa_reacoes_le on public.carbo_wa_reacoes
  for select to authenticated using ((select public.carbo_e_time_interno()));
-- ⚠️ SEM policy de escrita: só a função grava (com a janela e a Meta conferidas).

grant select on public.carbo_wa_reacoes to authenticated;
revoke all on public.carbo_wa_reacoes from anon;

-- Ao vivo: quem está com a conversa aberta vê a reação da colega na hora.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables
                      where pubname = 'supabase_realtime'
                        and schemaname = 'public' and tablename = 'carbo_wa_reacoes') then
    alter publication supabase_realtime add table public.carbo_wa_reacoes;
  end if;
end $$;


-- ── A leitura da conversa aberta ganha citação e reação ─────────────────────
-- Mesma assinatura, mesmo tipo de retorno, mesma guarda (20261183): só
-- ACRESCENTA chaves a cada mensagem. Front antigo ignora as chaves novas.
create or replace function public.carbo_wa_conversa_mensagens(p_numero_id text, p_wa_id text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(
           to_jsonb(c) || jsonb_build_object(
             'responde_a',       m.responde_a,
             'reage_a',          case when c.tipo = 'reaction'
                                      then m.payload -> 'reaction' ->> 'message_id' end,
             'nossa_reacao',     r.emoji,
             'nossa_reacao_por', case when r.emoji is not null then r.por_nome end)
           order by c.ocorrido_em, c.wamid), '[]'::jsonb)
    from public.carbo_wa_conversas c
    left join public.carbo_wa_mensagens m on m.wamid = c.wamid
    left join public.carbo_wa_reacoes   r on r.numero_id = c.numero_id and r.alvo_wamid = c.wamid
   where (select public.carbo_e_time_interno())
     and c.numero_id = p_numero_id
     and c.wa_id = p_wa_id;
$$;

comment on function public.carbo_wa_conversa_mensagens(text, text) is
  'A linha do tempo de UMA conversa (todas as colunas da carbo_wa_conversas + responde_a, reage_a, '
  'nossa_reacao, nossa_reacao_por). SECURITY DEFINER guardada por carbo_e_time_interno() '
  '(20261125/20261183/20261198).';

grant execute on function public.carbo_wa_conversa_mensagens(text, text) to authenticated, service_role;
revoke execute on function public.carbo_wa_conversa_mensagens(text, text) from anon, public;

notify pgrst, 'reload schema';
