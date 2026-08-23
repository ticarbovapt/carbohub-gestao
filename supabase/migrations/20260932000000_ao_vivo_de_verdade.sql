-- ─────────────────────────────────────────────────────────────────────────────
-- O "ao vivo" que não estava no ar
--
-- A tela de Conversas escuta quatro tabelas por Realtime. Escutar não basta: o
-- Postgres só publica a linha se a tabela estiver na publicação
-- `supabase_realtime` — e só `carbo_wa_resolvidas` foi adicionada (migração
-- 20260929). As outras três nunca entraram.
--
-- ⚠️ Isso NÃO dá erro em lugar nenhum. O `.subscribe()` volta `SUBSCRIBED`, o
-- canal fica conectado e nada chega — a tela continua andando pelo
-- `refetchInterval`, que é rede de segurança e virou o mecanismo principal sem
-- ninguém perceber. O sintoma medido: mensagem agendada que JÁ SAIU continuava
-- na tarja "Agendada para…" por até um minuto, porque a lista de agendadas
-- reconsulta a cada 60 s; e o balão da resposta aparecia antes disso, pelo
-- refetch de 30 s da conversa. Duas verdades na mesma tela, com atraso
-- diferente cada uma.
--
-- É o mesmo formato de falha do `pg_cron` marcando `succeeded`: o sucesso
-- medido não é o que interessa.
-- ─────────────────────────────────────────────────────────────────────────────

do $$
declare t text;
begin
  foreach t in array array[
    'carbo_wa_mensagens',   -- o que o cliente escreveu e o que o atendimento digitou
    'carbo_msg_envios',     -- os avisos da esteira (outra origem da mesma linha do tempo)
    'carbo_wa_agendadas',   -- pendente → enviado / falhou
    'carbo_wa_resolvidas'   -- já estava; repetido por idempotência
  ] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- ⚠️ `replica identity full` nas que mudam por UPDATE.
--
-- O Realtime do Supabase confere RLS sobre a linha ANTES de entregar, e com a
-- identidade padrão (só a PK) o registro anterior não vai no WAL. Sem isso, o
-- UPDATE de status (`pendente → enviado`, `enviado → entregue → lido`) chega
-- capado ou não chega — que é exatamente o evento que esta migração existe para
-- fazer chegar. INSERT já funcionaria sem ela; UPDATE, não.
alter table public.carbo_wa_agendadas replica identity full;
alter table public.carbo_msg_envios   replica identity full;

-- Conferência: as quatro têm de aparecer.
select tablename from pg_publication_tables
where pubname = 'supabase_realtime' and schemaname = 'public'
  and tablename in ('carbo_wa_mensagens','carbo_msg_envios',
                    'carbo_wa_agendadas','carbo_wa_resolvidas')
order by tablename;
