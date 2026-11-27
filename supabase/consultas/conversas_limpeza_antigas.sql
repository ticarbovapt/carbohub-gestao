-- ═══════════════════════════════════════════════════════════════════════════
-- Conversas: marcar como RESOLVIDA tudo que parou até 24/11/2026 (27/11/2026)
-- Função da migração 20261204. Rode no SQL Editor, um bloco por vez.
-- ⚠️ No histórico de status fica `origem = 'limpeza'` e `marca = false`: o
-- Painel do atendimento não conta isso como "fechada sem resposta" de
-- ninguém, e o Pós-venda não tira reclamação da fila por causa disso.
-- ⚠️ Cliente que escrever depois REABRE a conversa, como sempre.
-- ═══════════════════════════════════════════════════════════════════════════

-- BLOCO 1 — ENSAIO (não muda nada). Quantas, por número e por situação.
-- ESPERADO: "ensaio": true, "marcadas_agora": 0, e em por_numero o CarboZé
-- com a maior parte (sem_resposta + respondida_sem_encerrar + aguardando).
select jsonb_pretty(public.carbo_wa_resolver_antigas(
  timestamptz '2026-11-25 00:00:00-03'));


-- BLOCO 2 — DE VERDADE. Mesmo corte, com `false`.
-- ESPERADO: "marcadas_agora" = o "conversas" do BLOCO 1.
select jsonb_pretty(public.carbo_wa_resolver_antigas(
  timestamptz '2026-11-25 00:00:00-03', false));


-- BLOCO 3 — CONFERIR: quantas "Não respondidas" sobraram por número (a mesma
-- conta da bolinha do menu, sem a guarda de usuário — no SQL Editor a função
-- da tela volta vazia).
-- ESPERADO: só conversas de 25/11 para cá.
select nu.rotulo, count(*) as nao_respondidas,
       to_char(min(r.ultima_em) at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI') as mais_antiga
  from public.carbo_wa_resumo r
  join public.carbo_wa_numeros nu on nu.phone_number_id = r.numero_id and nu.ativo
  left join public.carbo_wa_atendimento a on a.numero_id = r.numero_id and a.wa_id = r.wa_id
 where r.ultima_em >= now() - interval '30 days'
   and cardinality(r.pendentes_em) > 0
   and exists (select 1 from unnest(r.pendentes_em) t
                where t > coalesce(greatest(r.ultima_resposta_em,
                                            case when a.status = 'resolvido' then a.desde end),
                                   '-infinity'::timestamptz))
   and (coalesce(a.status, '') not in ('aguardando', 'resolvido')
        or coalesce(r.ultima_entrada_em > a.desde, false))
 group by nu.rotulo, nu.ordem
 order by nu.ordem;


-- BLOCO 4 — quem marcou "Ciente" no aviso de conversas paradas (depois de uns
-- dias de uso). Só lê.
select to_char(c.em at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI') as em,
       p.full_name as pessoa, nu.rotulo as numero,
       c.sem_resposta, c.sem_resolver, c.acao
  from public.carbo_wa_aviso_ciente c
  left join public.profiles p on p.id = c.user_id
  left join public.carbo_wa_numeros nu on nu.phone_number_id = c.numero_id
 order by c.em desc
 limit 100;
