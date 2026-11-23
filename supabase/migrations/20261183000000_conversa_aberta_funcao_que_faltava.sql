-- ═══════════════════════════════════════════════════════════════════════════
-- A leitura da conversa ABERTA nunca chegou ao banco (23/11/2026)
--
-- A `20261125` criou `carbo_wa_conversa_mensagens` quando migração ainda era
-- colada à mão no SQL Editor — e ela não foi colada. Medido na tela: cada
-- conversa aberta dá 404 nessa função e cai na leitura de reserva (a view sob a
-- RLS de quem atende, ~150 ms POR MENSAGEM). É a causa dos chamados "mensagens
-- não carregam" e "o histórico some": conversa longa estourava o tempo e a
-- tela ficava só com o resumo da lista.
--
-- Este arquivo é a MESMA função da 20261125, de novo, para ela passar pelo
-- deploy automático. Idempotente (`create or replace`): onde já existir, nada
-- muda. A tela já a chama desde outubro; sem nenhuma mudança no front.
-- ⚠️ No SQL Editor ela volta VAZIA (sem usuário, a guarda é falsa) — está certo.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.carbo_wa_conversa_mensagens(p_numero_id text, p_wa_id text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(to_jsonb(c) order by c.ocorrido_em, c.wamid), '[]'::jsonb)
    from public.carbo_wa_conversas c
   where (select public.carbo_e_time_interno())
     and c.numero_id = p_numero_id
     and c.wa_id = p_wa_id;
$$;

comment on function public.carbo_wa_conversa_mensagens(text, text) is
  'A linha do tempo de UMA conversa (todas as colunas da carbo_wa_conversas). SECURITY DEFINER '
  'guardada por carbo_e_time_interno(): o custo não depende da RLS de quem chama (20261125/20261183).';

grant execute on function public.carbo_wa_conversa_mensagens(text, text) to authenticated, service_role;
revoke execute on function public.carbo_wa_conversa_mensagens(text, text) from anon, public;

-- O PostgREST passa a enxergar a função sem esperar o próximo recarregamento.
notify pgrst, 'reload schema';
