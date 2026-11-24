-- ═══════════════════════════════════════════════════════════════════════════
-- Aviso aos pedidos ATRASADOS que estão saindo agora (24/11/2026, 20261194)
--
-- Template aprovado na Meta, variáveis por NÚMERO:
--   {{1}} primeiro nome · {{2}} link do rastreio · {{3}} checkout com 20% off
-- Sai pelo número de SERVIÇO (98876-9187), UMA vez por pedido, só para a lista.
--
-- Ordem: A (nome do modelo e link) → B/C (conferir na Meta) → D (teste no seu
-- celular) → E (localizar a lista) → F (carregar) → G (ver as mensagens prontas)
-- → H (ligar) → I (acompanhar). J desliga a qualquer momento.
-- Roda no SQL Editor, UM bloco por vez. O segredo do cron é copiado de dentro
-- do banco e nunca aparece no resultado.
-- ═══════════════════════════════════════════════════════════════════════════


-- BLOCO A — o NOME do modelo na Meta e o link do checkout com 20% off.
-- ⚠️ EDITE os dois. Do jeito que está, RECUSA rodar.
do $a$
declare
  v_nome text := null;   -- ex.: 'carboze_pedido_atrasado_enviado'  (o nome EXATO na Meta)
  v_link text := null;   -- ex.: 'https://payt.site/XXXXXXX'        (o checkout com 20% off)
begin
  if v_nome is null or v_link is null then
    raise exception 'Preencha v_nome (nome do modelo na Meta) e v_link (checkout com 20%% off).';
  end if;
  update public.carbo_msg_templates
     set meta_template_nome = v_nome,
         meta_status = 'APPROVED',
         meta_variaveis = jsonb_build_array(
           jsonb_build_object('nome', '1', 'de', 'primeiro_nome'),
           jsonb_build_object('nome', '2', 'de', 'link_rastreio'),
           jsonb_build_object('nome', '3', 'de', 'link_checkout', 'fallback', v_link))
   where etapa = 'aviso_atraso';
  if not found then raise exception 'a etapa aviso_atraso não existe — a migração 20261194 rodou?'; end if;
end $a$;

select etapa, ativo, meta_template_nome, meta_status, meta_variaveis, numero_id
  from public.carbo_msg_templates where etapa = 'aviso_atraso';


-- BLOCO B — CONFERIR o modelo contra o que a Meta aprovou (não manda nada).
-- Devolve uma linha com o request_id.
select net.http_post(
         url := 'https://wpkfirmapxevzpxjovjr.supabase.co/functions/v1/whatsapp-meta?conferir=1&etapa=aviso_atraso',
         body := '{}'::jsonb,
         headers := jsonb_build_object('Content-Type', 'application/json', 'X-Cron-Secret', s.segredo),
         timeout_milliseconds := 60000) as request_id
  from (select (regexp_match(command, 'X-Cron-Secret''\s*,\s*''([^'']+)'''))[1] as segredo
          from cron.job where jobname = 'bling2-sync-incremental' limit 1) s
 where s.segredo is not null;


-- BLOCO C — o resultado (espere uns 15 s). ESPERADO: ok = true, problemas [].
-- `avisos` não impede o envio (ex.: quebra de linha diferente no espelho).
with r as (
  select content::jsonb as c, created from net._http_response
   where content like '%"modelos_com_problema"%' order by created desc limit 1
)
select m->>'etapa' as etapa, (m->>'ok')::boolean as ok, m->'problemas' as problemas,
       m->'avisos' as avisos,
       to_char(r.created at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI:SS') as conferido_em
  from r, jsonb_array_elements(r.c->'detalhe') m;


-- BLOCO D — TESTE de verdade no SEU celular (não entra na lista de ninguém).
-- ⚠️ EDITE v_fone. Do jeito que está, RECUSA rodar.
do $teste$
declare
  v_fone    text := null;   -- ex.: '84999998888'
  v_segredo text;
begin
  if v_fone is null then raise exception 'Preencha v_fone com o seu celular.'; end if;
  select (regexp_match(command, 'X-Cron-Secret''\s*,\s*''([^'']+)'''))[1] into v_segredo
    from cron.job where jobname = 'bling2-sync-incremental' limit 1;
  if v_segredo is null then raise exception 'Não consegui ler o segredo do job bling2-sync-incremental.'; end if;
  perform net.http_post(
    url := 'https://wpkfirmapxevzpxjovjr.supabase.co/functions/v1/whatsapp-meta'
           || '?teste=' || v_fone || '&etapa=aviso_atraso&nome=Ana'
           || '&link_rastreio=https://rastreio.carboze.com.br/rastreio/AA123456789BR',
    body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'X-Cron-Secret', v_segredo),
    timeout_milliseconds := 30000);
end $teste$;

-- O resultado do teste (espere uns 5 s). ESPERADO: ok = true e a mensagem no celular.
select status_code, content::jsonb ->> 'ok' as ok, content::jsonb ->> 'erro' as erro,
       to_char(created at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI:SS') as em
  from net._http_response
 where content like '%mensagem REAL para um número%' order by created desc limit 3;


-- BLOCO E — LOCALIZAR a lista na esteira (só lê).
-- ⚠️ Cole a lista no `values`, um por linha: nº do pedido da loja, código CZ,
-- nº da NF, telefone ou NOME COMPLETO. Olha os pedidos dos últimos 180 dias.
-- `situacao`: ok · AMBÍGUO (mais de um pedido — escolha pelo bling_id) ·
-- NÃO ACHADO · sem telefone · sem rastreio (o aviso ESPERARIA).
with lista(busca) as (values
  (null::text)
),
l as (
  select btrim(busca) as b, regexp_replace(busca, '\D', '', 'g') as dig
    from lista where nullif(btrim(busca), '') is not null
),
e as (select * from public.bling2_esteira where data_pedido >= now() - interval '180 days'),
m as (
  select l.b, e.*
    from l join e on
         (length(l.dig) >= 3 and (
              regexp_replace(coalesce(e.pedido_loja, ''), '\D', '', 'g') = l.dig
           or e.pedido_numero::text = l.dig
           or ltrim(coalesce(e.nf_numero::text, ''), '0') = ltrim(l.dig, '0')
           or (length(l.dig) >= 10 and public.carbo_fone_chave(e.cliente_fone) = public.carbo_fone_chave(l.dig))))
      or upper(coalesce(e.pedido_codigo, '')) = upper(l.b)
      or upper(coalesce(e.pedido_loja, '')) = upper(l.b)
      or (l.dig = '' and public.carbo_nome_chave(e.cliente) = public.carbo_nome_chave(l.b))
)
select l.b as busca,
       case when m.bling_id is null then 'NÃO ACHADO'
            when count(*) over (partition by l.b) > 1 then 'AMBÍGUO'
            when nullif(btrim(coalesce(m.cliente_fone, '')), '') is null then 'sem telefone'
            when m.rastreio_transportadora is null then 'sem rastreio'
            else 'ok' end as situacao,
       m.bling_id, m.canal, m.pedido_loja, m.pedido_codigo, m.nf_numero, m.cliente, m.cliente_fone,
       m.etapa, m.transportadora, m.rastreio_transportadora, m.data_pedido::date as pedido_em
  from l left join m on m.b = l.b
 order by situacao desc, l.b;


-- BLOCO F — CARREGAR a lista (só o que veio `ok` no BLOCO E).
-- ⚠️ Cole a MESMA lista. Ambíguo, não achado, sem telefone e sem rastreio
-- ficam FORA (resolva e rode de novo — o que já entrou não duplica). A mesma
-- PESSOA com dois pedidos entra UMA vez (o pedido mais recente).
with lista(busca) as (values
  (null::text)
),
l as (
  select btrim(busca) as b, regexp_replace(busca, '\D', '', 'g') as dig
    from lista where nullif(btrim(busca), '') is not null
),
e as (select * from public.bling2_esteira where data_pedido >= now() - interval '180 days'),
m as (
  select l.b, e.*, count(*) over (partition by l.b) as achados
    from l join e on
         (length(l.dig) >= 3 and (
              regexp_replace(coalesce(e.pedido_loja, ''), '\D', '', 'g') = l.dig
           or e.pedido_numero::text = l.dig
           or ltrim(coalesce(e.nf_numero::text, ''), '0') = ltrim(l.dig, '0')
           or (length(l.dig) >= 10 and public.carbo_fone_chave(e.cliente_fone) = public.carbo_fone_chave(l.dig))))
      or upper(coalesce(e.pedido_codigo, '')) = upper(l.b)
      or upper(coalesce(e.pedido_loja, '')) = upper(l.b)
      or (l.dig = '' and public.carbo_nome_chave(e.cliente) = public.carbo_nome_chave(l.b))
),
bons as (
  select *, row_number() over (partition by public.carbo_fone_chave(cliente_fone)
                               order by data_pedido desc, bling_id desc) as n
    from m
   where achados = 1
     and nullif(btrim(coalesce(cliente_fone, '')), '') is not null
     and rastreio_transportadora is not null
),
ins as (
  insert into public.carbo_msg_disparo (etapa, bling_id, telefone, nome, dados, observacao)
  select 'aviso_atraso', bling_id, cliente_fone, cliente,
         jsonb_build_object('link_rastreio',
                            'https://rastreio.carboze.com.br/rastreio/' || rastreio_transportadora),
         'lista de ' || to_char(now() at time zone 'America/Sao_Paulo', 'DD/MM') || ' · busca: ' || b
    from bons where n = 1
  on conflict (etapa, bling_id) do nothing
  returning 1
)
select (select count(*) from l) as na_lista,
       (select count(*) from ins) as carregados_agora,
       -- (a contagem lê a tabela de ANTES do insert, por isso soma os de agora)
       (select count(*) from public.carbo_msg_disparo where etapa = 'aviso_atraso')
         + (select count(*) from ins) as total_na_lista;


-- BLOCO G — ENSAIO: a mensagem EXATA de cada um, sem mandar nada.
-- Confira nome, link do rastreio e telefone antes de ligar.
select d.bling_id, d.telefone, d.nome,
       replace(replace(replace(t.texto,
         '{{1}}', initcap(lower(split_part(btrim(coalesce(d.nome, '')), ' ', 1)))),
         '{{2}}', coalesce(d.dados->>'link_rastreio', '⚠️ SEM RASTREIO')),
         '{{3}}', coalesce(t.meta_variaveis->2->>'fallback', '⚠️ SEM LINK')) as mensagem,
       v.status as ja_enviado
  from public.carbo_msg_disparo d
  join public.carbo_msg_templates t on t.etapa = d.etapa
  left join public.carbo_msg_envios v on v.bling_id = d.bling_id and v.etapa = d.etapa
 where d.etapa = 'aviso_atraso'
 order by d.incluido_em, d.bling_id;


-- BLOCO H — LIGAR. Sai em lotes de até 20 por minuto, depois dos avisos da
-- esteira. A lista acaba sozinha; depois disso nada mais sai.
update public.carbo_msg_templates set ativo = true where etapa = 'aviso_atraso';


-- BLOCO I — ACOMPANHAR. enviado → entregue → lido vem do webhook da Meta.
-- `falhou` tem o motivo; `pendente` é instabilidade da Meta (tenta de novo).
select coalesce(v.status, 'na fila') as status, count(*)
  from public.carbo_msg_disparo d
  left join public.carbo_msg_envios v on v.bling_id = d.bling_id and v.etapa = d.etapa
 where d.etapa = 'aviso_atraso'
 group by 1 order by 2 desc;

select d.nome, d.telefone, v.status, v.motivo, v.erro_detalhe,
       to_char(v.enviado_em at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI') as em
  from public.carbo_msg_disparo d
  join public.carbo_msg_envios v on v.bling_id = d.bling_id and v.etapa = d.etapa
 where d.etapa = 'aviso_atraso' and v.status not in ('enviado', 'entregue', 'lido')
 order by v.enviado_em desc nulls last;


-- BLOCO J — DESLIGAR (para no próximo minuto; o que já saiu não volta).
-- update public.carbo_msg_templates set ativo = false where etapa = 'aviso_atraso';
