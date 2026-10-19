-- ═══════════════════════════════════════════════════════════════════════════
-- Conversas do WhatsApp: rápidas, e sem sumir cliente (19/10/2026)
--
-- ── O que o dono do processo viu ─────────────────────────────────────────
--
-- "Carregando…" demorado em atendimento.carbohub.com.br/conversas, e cliente
-- que RECEBEU e LEU os avisos (Deividi Rodrigues, NF lida 12/10 21:16) não
-- aparece na busca: "0 de 435 com deiv". Volume: mais de 500 vendas/semana.
--
-- ── As três causas, todas da família já conhecida do repo ────────────────
--
-- 1. ⚠️ O TETO. A tela lia `carbo_wa_conversas` (uma linha por MENSAGEM) com
--    `.limit(1000)`. Com ~5 avisos por pedido e 500 pedidos/semana, mil
--    mensagens são DOIS ou TRÊS dias — e a busca procura só no que chegou.
--    O Deividi (12/10) já estava fora. Sem erro: "0 de 435" parece resposta.
--
-- 2. ⚠️ A VIEW cruzava a `bling2_esteira` (a mais pesada do sistema: duas
--    contas Bling, NF, Melhor Envio, rastreio, plataforma) para cada mensagem,
--    SÓ para tirar o nome do cliente. Aqui o nome passa a vir das tabelas do
--    pedido — a mesma regra da esteira (cadastro do contato vence, o nome do
--    pedido é a reserva), sem montar a esteira.
--
-- 3. ⚠️ SEM ÍNDICE. Para cada mensagem a view procura "o último aviso enviado
--    a este número" em `carbo_msg_envios` (o vínculo aproximado), e a tabela
--    só tinha índice por (bling_id, etapa), wamid e status. Cada mensagem
--    varria a tabela inteira: custo que cresce com o QUADRADO do volume —
--    invisível com 200 pedidos/semana, a parede com 500.
--
-- ── O que muda ───────────────────────────────────────────────────────────
--
--   BLOCO 1  três índices (a lista, o vínculo aproximado, as mensagens)
--   BLOCO 2  a view perde o join da esteira — troca no texto VIVO, com backup
--   BLOCO 3  `carbo_wa_caixa(numero, dias)`: a LISTA montada no banco, só com
--            as mensagens que a lista usa; a conversa aberta lê as dela à parte
--
-- O que NÃO muda: nenhuma regra de quem espera resposta, janela, status — elas
-- continuam em `lib/conversas.ts`, que recebe as mesmas linhas de sempre (só
-- que menos delas). Nenhuma mensagem é enviada, nenhum dado é alterado.
--
-- ⚠️ RODE EM BLOCOS, na ordem. O BLOCO 0 só LÊ: cada consulta num bloco
-- próprio, porque o SQL Editor mostra só o resultado da ÚLTIMA.
-- ═══════════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 0 — MEDIR antes (só leitura; cada letra num bloco separado)      ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- (0a) Quantas mensagens há em 30 dias por número nosso — é isto que tem de
--      caber na lista. Mais de 1.000 no CarboZé confirma a causa 1.
select numero_id, count(*) as mensagens_30d, count(distinct wa_id) as conversas_30d
from (
  select numero_id, wa_id from public.carbo_wa_mensagens
   where ocorrido_em >= now() - interval '30 days'
  union all
  select numero_id, wa_id from public.carbo_msg_envios
   where canal = 'meta' and wamid is not null and wa_id is not null
     and enviado_em >= now() - interval '30 days'
     and status in ('enviado','entregue','lido')
) x
group by 1 order by 2 desc;

-- (0b) O caso que originou tudo: os avisos do Deividi existem?
select v.bling_id, v.etapa, v.status, v.enviado_em, v.wa_id, v.numero_id
from public.carbo_msg_envios v
join public.bling2_orders bo on bo.bling_id = v.bling_id
where bo.contato_nome ilike '%deividi%'
order by v.enviado_em;

-- (0c) O tempo de HOJE da consulta da tela (a mesma que ela faz). Anote o
--      "Execution Time" do fim — é o número para comparar no BLOCO 4.
explain (analyze, buffers)
select * from public.carbo_wa_conversas
where numero_id = '1255756280958635'
  and ocorrido_em >= now() - interval '30 days'
order by ocorrido_em desc
limit 1000;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — os índices                                                   ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
--
-- Só ACRESCENTA índice; nada muda de comportamento. `create index` trava a
-- escrita na tabela pelos segundos que leva — com a fila escrevendo a cada
-- minuto, rode num momento qualquer: o pior caso é um envio sair na rodada
-- seguinte.

-- O vínculo aproximado ("o último aviso enviado a este número, por este
-- número nosso, até este instante") — a causa 3.
create index if not exists carbo_msg_envios_conversa_idx
  on public.carbo_msg_envios (wa_id, numero_id, enviado_em desc)
  where canal = 'meta' and enviado_em is not null;

-- O ramo dos avisos na lista da caixa: por número nosso e data.
create index if not exists carbo_msg_envios_caixa_idx
  on public.carbo_msg_envios (numero_id, enviado_em desc)
  where canal = 'meta' and wamid is not null and wa_id is not null and enviado_em is not null;

-- O ramo das mensagens na lista da caixa.
create index if not exists carbo_wa_mensagens_caixa_idx
  on public.carbo_wa_mensagens (numero_id, ocorrido_em desc);

-- Espera: "Success. No rows returned".


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — a view para de montar a esteira para achar um nome           ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
--
-- ⚠️ O deparser escreve `FROM (resolvido r LEFT JOIN bling2_esteira b ON
-- ((b.bling_id = r.bling_id)));` — o terceiro parêntese é do FROM. A trava
-- casa a condição EXATA (com 0, 1 ou 2 pares), nunca "quantos houver".
-- ⚠️ Troca no texto VIVO (`pg_get_viewdef`), nunca a partir do repositório —
-- a lição da `vendedor_estoque`. Dois trechos, e cada um tem de aparecer
-- EXATAMENTE uma vez; achar zero ou dois ABORTA e nada muda.
-- ⚠️ O texto de antes vai para `carbo_backup_viewdef` (reverter = executar
-- aquele texto). As reloptions (`security_invoker`) vão JUNTO.
--
-- O nome segue a regra da esteira, ramo a ramo:
--   bling_id > 0  Bling 2   bling2_contacts.nome, senão bling2_orders.contato_nome
--   bling_id < 0  Bling 1   bling_contacts.nome,  senão bling_orders.contato_nome
-- A diferença: a esteira só tem pedido Atendido / loja on-line; aqui o nome
-- vem de qualquer pedido. Para o nome de quem recebeu um aviso, é igual —
-- o aviso só sai de pedido que estava na esteira.

do $$
declare
  v_def  text;
  v_opts text;
  v_novo text;
  v_n    int;
begin
  select pg_get_viewdef(c.oid), array_to_string(c.reloptions, ', ')
    into v_def, v_opts
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'carbo_wa_conversas';

  if v_def is null then raise exception 'View public.carbo_wa_conversas não encontrada'; end if;
  if v_def !~ 'bling2_esteira' then
    raise notice 'carbo_wa_conversas já não lê a bling2_esteira — nada a fazer';
    return;
  end if;

  select count(*) into v_n from regexp_matches(v_def,
    'LEFT\s+JOIN\s+(public\.)?bling2_esteira\s+b\s+ON\s+(\(\(\s*b\.bling_id\s*=\s*r\.bling_id\s*\)\)|\(\s*b\.bling_id\s*=\s*r\.bling_id\s*\)|b\.bling_id\s*=\s*r\.bling_id)', 'g');
  if v_n <> 1 then
    raise exception 'esperava 1 "LEFT JOIN bling2_esteira b ON b.bling_id = r.bling_id", achei %', v_n;
  end if;
  select count(*) into v_n from regexp_matches(v_def, 'b\.cliente\s+AS\s+cliente_pedido', 'g');
  if v_n <> 1 then
    raise exception 'esperava 1 "b.cliente AS cliente_pedido", achei %', v_n;
  end if;

  insert into public.carbo_backup_viewdef (nome, def, opcoes, motivo)
  values ('carbo_wa_conversas', v_def, v_opts, '20261099 — antes de tirar a bling2_esteira do nome');

  v_novo := regexp_replace(v_def, 'b\.cliente\s+AS\s+cliente_pedido', 'nm.cliente AS cliente_pedido');
  v_novo := regexp_replace(v_novo,
    'LEFT\s+JOIN\s+(public\.)?bling2_esteira\s+b\s+ON\s+(\(\(\s*b\.bling_id\s*=\s*r\.bling_id\s*\)\)|\(\s*b\.bling_id\s*=\s*r\.bling_id\s*\)|b\.bling_id\s*=\s*r\.bling_id)',
    'LEFT JOIN LATERAL (
       SELECT (CASE
         WHEN r.bling_id > 0 THEN (
           SELECT COALESCE(NULLIF(btrim(c2.nome), ''''), bo.contato_nome)
             FROM public.bling2_orders bo
             LEFT JOIN public.bling2_contacts c2 ON c2.bling_id = bo.contato_id
            WHERE bo.bling_id = r.bling_id)
         WHEN r.bling_id < 0 THEN (
           SELECT COALESCE(NULLIF(btrim(c1.nome), ''''), b1.contato_nome)
             FROM public.bling_orders b1
             LEFT JOIN public.bling_contacts c1 ON c1.bling_id = b1.contato_id
            WHERE b1.bling_id = - r.bling_id)
       END)::text AS cliente
     ) nm ON true');

  execute format('create or replace view public.carbo_wa_conversas %s as %s',
                 case when v_opts is null then '' else 'with (' || v_opts || ')' end,
                 v_novo);
end $$;

-- Espera: "Success. No rows returned". Erro com "esperava 1 …, achei N" =
-- a view viva não é a que esta migração conhece: NADA mudou, me mande a
-- mensagem e o resultado de `select pg_get_viewdef('public.carbo_wa_conversas')`.


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 3 — a LISTA da caixa, montada no banco                           ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
--
-- Devolve, por conversa, SÓ as mensagens que a lista usa — as mesmas que o
-- `agruparConversas` (lib/conversas.ts) lê para decidir tudo:
--
--   a mais recente                         prévia, data, ordem
--   a última NOSSA e a última DO CLIENTE   status, reabertura, corte
--   todas do cliente depois da última nossa   "esperando resposta" (contagem)
--   a mais recente com pedido              chip do pedido, filtro de etapa
--   a mais antiga com nome do pedido       o nome
--
-- ⚠️ O corte de "pendente" é max(última nossa, resolvido): as do cliente
-- depois da última NOSSA são um SUPERCONJUNTO das pendentes, então a conta
-- dá exatamente a mesma — sem esta função precisar saber de `resolvido`.
--
-- ⚠️ `jsonb` numa linha só, e não `setof`: o teto de 1.000 do PostgREST vale
-- para RPC também, e é o defeito inteiro que esta migração existe para tirar.
--
-- ⚠️ SECURITY INVOKER (o padrão): lê a view com a RLS de quem chama, a mesma
-- de antes. No SQL Editor (postgres) devolve tudo — está certo.

create or replace function public.carbo_wa_caixa(p_numero_id text, p_dias int default 30)
returns jsonb
language sql
stable
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
     where c.numero_id = p_numero_id
       and c.ocorrido_em >= now() - make_interval(days => greatest(1, least(coalesce(p_dias, 30), 120)))
  )
  -- ⚠️ Só as colunas que a LISTA lê, e o texto só onde ele aparece (a prévia
  -- da mais recente e as do cliente, que decidem "parece encerrada"). Com
  -- todas as colunas a caixa de 30 dias passava de 4 MB a cada recarga; o
  -- resto (mídia, erro, autor, botão) é da conversa ABERTA, que lê as dela.
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
  'jsonb (sem teto de 1.000). SECURITY INVOKER. 20261099.';

-- ⚠️ Função nova nasce executável por `anon` (default privileges do Supabase).
grant execute on function public.carbo_wa_caixa(text, int) to authenticated, service_role;
revoke execute on function public.carbo_wa_caixa(text, int) from anon, public;

-- Espera: "Success. No rows returned".


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 4 — conferir (cada letra num bloco separado)                     ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- (4a) A view nova não lê mais a esteira: ESPERADO false.
select pg_get_viewdef('public.carbo_wa_conversas') ~ 'bling2_esteira' as ainda_le_a_esteira;

-- (4b) O tempo da MESMA consulta do 0c. Compare o "Execution Time".
explain (analyze, buffers)
select * from public.carbo_wa_conversas
where numero_id = '1255756280958635'
  and ocorrido_em >= now() - interval '30 days'
order by ocorrido_em desc
limit 1000;

-- (4c) A caixa nova: quantas conversas e quantas linhas ela devolve, e o tempo.
--      `conversas` deve bater com `conversas_30d` do 0a para o CarboZé.
select jsonb_array_length(x) as linhas,
       (select count(distinct e->>'wa_id') from jsonb_array_elements(x) e) as conversas
from (select public.carbo_wa_caixa('1255756280958635', 30) as x) t;

-- (4d) O Deividi está na caixa: ESPERADO pelo menos 1 linha.
select e->>'wa_id' as wa_id, e->>'cliente_pedido' as cliente, e->>'ocorrido_em' as quando,
       e->>'sobre_a_etapa' as etapa
from jsonb_array_elements(public.carbo_wa_caixa('1255756280958635', 30)) e
where e->>'cliente_pedido' ilike '%deividi%';


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 5 — os AVISOS estão chegando? (só leitura; cada letra num bloco) ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
--
-- A pergunta do dono do processo, com número: *"pelo menos as mensagens
-- automáticas têm que chegar"*. Nada aqui muda dado.

-- (5a) Por etapa, nos últimos 7 dias: quanto saiu, chegou, foi lido, falhou,
--      está segurado ou foi ignorado. `chegou_pct` baixo numa etapa = ali está
--      o problema.
select etapa,
       count(*)                                                as linhas,
       count(*) filter (where status in ('enviado','entregue','lido')) as saiu,
       count(*) filter (where status in ('entregue','lido'))   as chegou,
       count(*) filter (where status = 'lido')                 as lido,
       count(*) filter (where status in ('erro','falhou'))     as falhou,
       count(*) filter (where status = 'pendente')             as segurado,
       count(*) filter (where status = 'ignorado')             as ignorado,
       round(100.0 * count(*) filter (where status in ('entregue','lido'))
             / nullif(count(*) filter (where status in ('enviado','entregue','lido','erro','falhou')), 0), 1) as chegou_pct
from public.carbo_msg_envios
where detectado_em >= now() - interval '7 days'
group by etapa
order by linhas desc;

-- (5b) O que está SEGURADO agora, e por quê. "esperando: rastreio" na etapa
--      `etiqueta` é a regra de 28/09 (só manda o código da transportadora) —
--      ver o texto que acompanha esta migração.
select etapa, motivo, count(*) as pedidos,
       min(detectado_em) as mais_antigo
from public.carbo_msg_envios
where status = 'pendente'
group by etapa, motivo
order by pedidos desc;

-- (5c) Por que FALHOU, nos últimos 7 dias (código e mensagem da Meta).
select etapa, erro_codigo, left(coalesce(erro_detalhe, motivo, ''), 120) as detalhe,
       count(*) as vezes, max(detectado_em) as ultima
from public.carbo_msg_envios
where status in ('erro','falhou') and detectado_em >= now() - interval '7 days'
group by 1, 2, 3
order by vezes desc
limit 20;

-- (5d) ⚠️ A FILA está respondendo? O cron marca `succeeded` mesmo quando a
--      função falha (o sucesso dele é ter POSTADO) — quem tem o desfecho é o
--      `net._http_response`. ESPERADO: zero linhas, ou só poucas e antigas.
--      `statement timeout` aqui é a fila estourando de novo, como em setembro.
select status_code, coalesce(error_msg, '') as erro_rede,
       left(coalesce(content::text, ''), 160) as resposta,
       count(*) as vezes, min(created) as primeira, max(created) as ultima
from net._http_response
where created >= now() - interval '24 hours'
  and (status_code is null or status_code >= 400 or content::text ilike '%timeout%')
group by 1, 2, 3
order by vezes desc
limit 20;

-- (5e) Quanto a fila demora para montar (a função lê dela a cada minuto).
--      Anote o "Execution Time": acima de ~8 s ela está perto do limite.
explain (analyze)
select count(*) from public.carbo_msg_fila;
