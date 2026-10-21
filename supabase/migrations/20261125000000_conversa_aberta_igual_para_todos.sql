-- ═══════════════════════════════════════════════════════════════════════════
-- A conversa ABERTA também custa o mesmo para todo mundo (21/10/2026)
--
-- Irmã da 20261124 (a lista). Medido como a Mirian (não admin), abrindo uma
-- conversa de 3 mensagens: 459 ms, dos quais ~150 ms POR MENSAGEM numa
-- varredura inteira de `bling2_orders` (Seq Scan, 1.860 linhas) para achar o
-- nome do cliente — a RLS dela (`is_ceo(...) OR is_gestor(...)` …) impede o
-- índice. Conversa de 50 mensagens = ~7 s, e a tela desiste em 8. Para admin
-- é instantâneo, que é por que "a maioria abre".
--
-- A troca: a tela passa a ler a conversa por `carbo_wa_conversa_mensagens`,
-- SECURITY DEFINER guardada uma vez por `carbo_e_time_interno()` — a mesma
-- régua da tabela de mensagens e da `carbo_wa_caixa`. Devolve as MESMAS
-- colunas da view (`to_jsonb(c)`), em `jsonb` (sem teto de 1.000).
-- ⚠️ Front antes do SQL não quebra: sem a função, a tela cai na leitura antiga.
-- ⚠️ No SQL Editor volta VAZIA (sem usuário, a guarda é falsa) — está certo.
-- ═══════════════════════════════════════════════════════════════════════════

-- BLOCO 1
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
  'guardada por carbo_e_time_interno(): o custo não depende da RLS de quem chama (20261125).';

grant execute on function public.carbo_wa_conversa_mensagens(text, text) to authenticated, service_role;
revoke execute on function public.carbo_wa_conversa_mensagens(text, text) from anon, public;

-- Espera: "Success. No rows returned".


-- BLOCO 2 — conferir como a Mirian, na conversa MAIS LONGA da caixa (desfeito)
-- ESPERADO: mensagens > 0 e o bloco em menos de ~1 s.
--
-- begin;
-- select set_config('request.jwt.claims',
--   json_build_object('sub', (select id from public.profiles where full_name ilike 'Mirian%' limit 1),
--                     'role', 'authenticated')::text, true);
-- set local role authenticated;
-- explain analyze
-- select jsonb_array_length(public.carbo_wa_conversa_mensagens('1255756280958635',
--          (select wa_id from public.carbo_wa_mensagens where numero_id = '1255756280958635'
--            group by wa_id order by count(*) desc limit 1)));
-- rollback;
