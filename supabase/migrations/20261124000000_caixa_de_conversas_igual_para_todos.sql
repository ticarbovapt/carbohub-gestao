-- ═══════════════════════════════════════════════════════════════════════════
-- A caixa de Conversas custa o MESMO para todo mundo (21/10/2026)
--
-- Sintoma: atendimento.carbohub.com.br/conversas abre para a maioria e, para
-- ALGUMAS pessoas (ex.: Mirian, colaboradora do Marketing), dá
-- "Não consegui carregar: canceling statement due to statement timeout" —
-- `carbo_wa_caixa` devolvendo 500 a cada tentativa.
--
-- Causa: a `carbo_wa_caixa` (20261099) é SECURITY INVOKER, então lê a view
-- `carbo_wa_conversas` (security_invoker) com a RLS de QUEM CHAMA, em seis
-- tabelas (mensagens, envios, contatos, pedidos e contatos das duas contas
-- Bling). Regras de SELECT se somam com OR, e quem NÃO passa pela regra
-- barata (admin/gestor) paga as outras LINHA A LINHA — funções SECURITY
-- DEFINER, que o Postgres não embute. Por isso "a maioria abre e outras não":
-- o custo depende do PERFIL de quem olha, não da caixa.
--
-- A troca: a função passa a rodar como DONO e se guarda UMA vez, no próprio
-- corpo, com a MESMA régua da tabela de mensagens (`carbo_e_time_interno()`,
-- embrulhada em SELECT, calculada uma vez). Quem via continua vendo, quem não
-- via continua sem ver — muda só o CUSTO, que passa a ser o do SQL Editor.
--
-- ⚠️ Molde da `carbo_wa_nomes_por_fone` (20261057): SECURITY DEFINER guardada
-- por `carbo_e_time_interno()`. No SQL Editor ela volta VAZIA (sem usuário, a
-- guarda é falsa) — está certo; o BLOCO 0/2 simula o usuário para medir.
-- ⚠️ O corpo é o da 20261099, letra por letra, mais a guarda. Nenhuma regra
-- de conversa muda.
-- ⚠️ RODE EM BLOCOS, um de cada vez.
-- ═══════════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 0 — MEDIR como a pessoa que não abre (só leitura, desfeito)      ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- ⚠️ EDITE o nome se não for a Mirian. Roda como ela (o mesmo papel e o mesmo
-- usuário que o PostgREST usa), mede e DESFAZ (rollback). Olhe o "Execution
-- Time" no fim. Acima de ~8.000 ms = é isto que estoura na tela dela.
--
-- begin;
-- select set_config('request.jwt.claims',
--   json_build_object('sub', (select id from public.profiles where full_name ilike 'Mirian%' limit 1),
--                     'role', 'authenticated')::text, true);
-- set local role authenticated;
-- explain analyze select public.carbo_wa_caixa('1255756280958635', 30);
-- rollback;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — a função roda como DONO, guardada uma vez                    ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

create or replace function public.carbo_wa_caixa(p_numero_id text, p_dias int default 30)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with m as (
    select c.*,
           row_number() over (partition by c.wa_id order by c.ocorrido_em desc, c.wamid desc) as _rn,
           row_number() over (partition by c.wa_id, c.direcao order by c.ocorrido_em desc, c.wamid desc) as _rn_dir,
           max(c.ocorrido_em) filter (where c.direcao = 'saida') over (partition by c.wa_id) as _ult_saida,
           row_number() over (partition by c.wa_id, (c.bling_id is not null)
                              order by c.ocorrido_em desc, c.wamid desc) as _rn_ped,
           row_number() over (partition by c.wa_id, (c.cliente_pedido is not null)
                              order by c.ocorrido_em asc, c.wamid asc) as _rn_nome
      from public.carbo_wa_conversas c
     where (select public.carbo_e_time_interno())
       and c.numero_id = p_numero_id
       and c.ocorrido_em >= now() - make_interval(days => greatest(1, least(coalesce(p_dias, 30), 120)))
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'wamid', m.wamid, 'wa_id', m.wa_id, 'numero_id', m.numero_id,
           'direcao', m.direcao, 'tipo', m.tipo, 'ocorrido_em', m.ocorrido_em,
           'texto', case when m._rn = 1 or m.direcao = 'entrada' then m.texto end,
           'bling_id', m.bling_id, 'sobre_a_etapa', m.sobre_a_etapa,
           'vinculo_exato', m.vinculo_exato,
           'cliente_pedido', m.cliente_pedido, 'nome_whatsapp', m.nome_whatsapp)
           order by m.ocorrido_em desc, m.wamid desc), '[]'::jsonb)
    from m
   where m._rn = 1
      or m._rn_dir = 1
      or (m.direcao = 'entrada' and m.ocorrido_em > coalesce(m._ult_saida, '-infinity'::timestamptz))
      or (m.bling_id is not null and m._rn_ped = 1)
      or (m.cliente_pedido is not null and m._rn_nome = 1);
$$;

comment on function public.carbo_wa_caixa(text, int) is
  'A lista da caixa de Conversas: por conversa, só as mensagens que agruparConversas usa. '
  'jsonb (sem teto de 1.000). SECURITY DEFINER guardada por carbo_e_time_interno() — '
  'o custo não depende da RLS de quem chama (20261124). No SQL Editor volta vazia.';

grant execute on function public.carbo_wa_caixa(text, int) to authenticated, service_role;
revoke execute on function public.carbo_wa_caixa(text, int) from anon, public;

-- Espera: "Success. No rows returned".


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — conferir como a MESMA pessoa (desfeito no fim)               ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- ESPERADO: conversas > 0 e o tempo do bloco em ~1 s. conversas = 0 = a
-- pessoa não é time interno (e também não via antes).
--
-- begin;
-- select set_config('request.jwt.claims',
--   json_build_object('sub', (select id from public.profiles where full_name ilike 'Mirian%' limit 1),
--                     'role', 'authenticated')::text, true);
-- set local role authenticated;
-- select jsonb_array_length(x) as linhas,
--        (select count(distinct e->>'wa_id') from jsonb_array_elements(x) e) as conversas
--   from (select public.carbo_wa_caixa('1255756280958635', 30) as x) t;
-- rollback;
