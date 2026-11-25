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


-- ═══════════════════════════════════════════════════════════════════════════
-- LISTAS POR LOTE — cada CSV do time vira um lote em `carbo_msg_disparo_entrada`
-- (migração própria). Lotes: `atraso_2026_11_23` (438, 20261195, enviado em
-- 24/11) e `atraso_2026_11_24` (259, 20261196). Lote novo: troque o nome nos
-- TRÊS blocos L.
-- Casa pelo PEDIDO DA LOJA (PAYT_LYK2ZA_…), com o pedido do Bling como reserva;
-- o telefone vem da esteira e, na falta, do pedido da PayT. O link é o do CSV.
-- ⚠️ UMA mensagem por PESSOA, não por pedido: quem já está na lista do disparo
-- (recebeu, falhou ou espera) por OUTRO pedido fica fora (`já recebeu por outro
-- pedido`). A PK de `carbo_msg_envios` só trava o MESMO pedido.
-- ═══════════════════════════════════════════════════════════════════════════

-- BLOCO R — REPESCAGEM do 131049 (limite de marketing da Meta POR PESSOA, que
-- libera no dia seguinte). Apaga só esses registros: o pedido volta à fila e
-- sai quando o envio for ligado. 131026 (número sem WhatsApp) e 130472
-- (pessoa no grupo de controle da Meta) NÃO voltam: tentar de novo só falha.
-- ⚠️ Rode no MÍNIMO um dia depois da falha.
-- ESPERADO: as linhas apagadas (pedido, nome, quando falhou).
delete from public.carbo_msg_envios v
 using public.carbo_msg_disparo d
 where v.etapa = 'aviso_atraso' and v.status = 'falhou' and v.erro_codigo = 131049
   and d.etapa = v.etapa and d.bling_id = v.bling_id
   and v.enviado_em < date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo'
returning v.bling_id, d.nome,
          to_char(v.enviado_em at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI') as falhou_em;


-- BLOCO L1 — LOCALIZAR (só lê). Uma linha por situação, com a contagem.
-- ESPERADO: quase tudo em `ok`. Qualquer outra situação: rode o L2 e me mande.
with ent as (
  select * from public.carbo_msg_disparo_entrada where lote = 'atraso_2026_11_24'
),
m as (
  select ent.id_pedido_loja, e.bling_id, e.pedido_loja, e.pedido_numero::text as pedido_numero,
         e.nf_numero::text as nf_numero, e.cliente, e.cliente_fone, 'pedido da loja' as via
    from ent join public.bling2_esteira e on e.pedido_loja = ent.id_pedido_loja
  union all
  select ent.id_pedido_loja, e.bling_id, e.pedido_loja, e.pedido_numero::text,
         e.nf_numero::text, e.cliente, e.cliente_fone, 'pedido do Bling'
    from ent join public.bling2_esteira e on e.bling_id > 0 and e.pedido_numero::text = ent.pedido_bling
   where not exists (select 1 from public.bling2_esteira x where x.pedido_loja = ent.id_pedido_loja)
),
r as (
  select ent.*, m.bling_id, m.via, m.cliente, m.nf_numero,
         count(m.bling_id) over (partition by ent.id_pedido_loja) as achados,
         coalesce(nullif(btrim(m.cliente_fone), ''),
                  (select o.cliente_fone from public.ecommerce_orders o
                    where o.platform = 'payt' and ent.id_pedido_loja like 'PAYT\_%'
                      and o.order_id like split_part(ent.id_pedido_loja, '_', 3) || '-%'
                      and nullif(btrim(o.cliente_fone), '') is not null
                    order by o.ordered_at desc limit 1)) as fone
    from ent left join m on m.id_pedido_loja = ent.id_pedido_loja
),
s as (
  select r.*,
         case when r.bling_id is null then 'NÃO ACHADO'
              when r.achados > 1 then 'AMBÍGUO'
              when r.fone is null then 'sem telefone'
              when exists (select 1 from public.carbo_wa_nao_contatar n
                            where n.removido_em is null and n.chave = public.carbo_fone_chave(r.fone))
                then 'não contatar'
              when exists (select 1 from public.carbo_msg_envios v
                            where v.bling_id = r.bling_id and v.etapa = 'aviso_atraso' and v.status <> 'pendente')
                then 'já enviado'
              when exists (select 1 from public.carbo_msg_disparo q
                        where q.etapa = 'aviso_atraso' and q.bling_id <> r.bling_id
                          and public.carbo_fone_chave(q.telefone) = public.carbo_fone_chave(r.fone))
                then 'já recebeu por outro pedido'
              else 'ok' end as situacao
    from r
)
select situacao, count(distinct id_pedido_loja) as pedidos,
       count(distinct public.carbo_fone_chave(fone)) as pessoas,
       count(*) filter (where via = 'pedido do Bling') as achados_pelo_bling,
       count(*) filter (where nf_numero is not null and ltrim(nf_numero, '0') <> ltrim(nf, '0')) as nf_diferente
  from s group by situacao order by pedidos desc;


-- BLOCO L2 — o DETALHE de quem não está `ok` (só lê).
with ent as (
  select * from public.carbo_msg_disparo_entrada where lote = 'atraso_2026_11_24'
),
m as (
  select ent.id_pedido_loja, e.bling_id, e.pedido_loja, e.cliente, e.cliente_fone, e.nf_numero::text as nf_numero
    from ent join public.bling2_esteira e on e.pedido_loja = ent.id_pedido_loja
  union all
  select ent.id_pedido_loja, e.bling_id, e.pedido_loja, e.cliente, e.cliente_fone, e.nf_numero::text
    from ent join public.bling2_esteira e on e.bling_id > 0 and e.pedido_numero::text = ent.pedido_bling
   where not exists (select 1 from public.bling2_esteira x where x.pedido_loja = ent.id_pedido_loja)
),
r as (
  select ent.id_pedido_loja, ent.nf, ent.pedido_bling, ent.primeiro_nome, m.bling_id, m.cliente, m.nf_numero,
         count(m.bling_id) over (partition by ent.id_pedido_loja) as achados,
         coalesce(nullif(btrim(m.cliente_fone), ''),
                  (select o.cliente_fone from public.ecommerce_orders o
                    where o.platform = 'payt' and ent.id_pedido_loja like 'PAYT\_%'
                      and o.order_id like split_part(ent.id_pedido_loja, '_', 3) || '-%'
                      and nullif(btrim(o.cliente_fone), '') is not null
                    order by o.ordered_at desc limit 1)) as fone
    from ent left join m on m.id_pedido_loja = ent.id_pedido_loja
)
select case when bling_id is null then 'NÃO ACHADO' when achados > 1 then 'AMBÍGUO'
            when fone is null then 'sem telefone'
            when exists (select 1 from public.carbo_wa_nao_contatar n
                          where n.removido_em is null and n.chave = public.carbo_fone_chave(fone)) then 'não contatar'
            when exists (select 1 from public.carbo_msg_disparo q
                        where q.etapa = 'aviso_atraso' and q.bling_id <> bling_id
                          and public.carbo_fone_chave(q.telefone) = public.carbo_fone_chave(fone)) then 'já recebeu por outro pedido'
            else 'ok, mas NF diferente' end as situacao,
       id_pedido_loja, nf, nf_numero as nf_no_sistema, pedido_bling, primeiro_nome, cliente, fone, bling_id
  from r
 where bling_id is null or achados > 1 or fone is null
    or exists (select 1 from public.carbo_wa_nao_contatar n
                where n.removido_em is null and n.chave = public.carbo_fone_chave(fone))
    or exists (select 1 from public.carbo_msg_disparo q
                        where q.etapa = 'aviso_atraso' and q.bling_id <> bling_id
                          and public.carbo_fone_chave(q.telefone) = public.carbo_fone_chave(fone))
    or (nf_numero is not null and ltrim(nf_numero, '0') <> ltrim(nf, '0'))
 order by 1, id_pedido_loja;


-- BLOCO L3 — CARREGAR na lista do disparo só os `ok`. Não envia nada (o envio
-- continua desligado). A mesma PESSOA com dois pedidos entra UMA vez (o pedido
-- mais recente), e quem já está na lista por pedido de OUTRO lote não entra.
-- Rodar de novo não duplica.
-- ESPERADO: `carregados_agora` = os `ok` do L1 menos as pessoas repetidas.
with ent as (
  select * from public.carbo_msg_disparo_entrada where lote = 'atraso_2026_11_24'
),
m as (
  select ent.id_pedido_loja, e.bling_id, e.cliente, e.cliente_fone, e.data_pedido
    from ent join public.bling2_esteira e on e.pedido_loja = ent.id_pedido_loja
  union all
  select ent.id_pedido_loja, e.bling_id, e.cliente, e.cliente_fone, e.data_pedido
    from ent join public.bling2_esteira e on e.bling_id > 0 and e.pedido_numero::text = ent.pedido_bling
   where not exists (select 1 from public.bling2_esteira x where x.pedido_loja = ent.id_pedido_loja)
),
r as (
  select ent.*, m.bling_id, m.cliente, m.data_pedido,
         count(m.bling_id) over (partition by ent.id_pedido_loja) as achados,
         coalesce(nullif(btrim(m.cliente_fone), ''),
                  (select o.cliente_fone from public.ecommerce_orders o
                    where o.platform = 'payt' and ent.id_pedido_loja like 'PAYT\_%'
                      and o.order_id like split_part(ent.id_pedido_loja, '_', 3) || '-%'
                      and nullif(btrim(o.cliente_fone), '') is not null
                    order by o.ordered_at desc limit 1)) as fone
    from ent join m on m.id_pedido_loja = ent.id_pedido_loja
),
bons as (
  select r.*, row_number() over (partition by public.carbo_fone_chave(r.fone)
                                 order by r.data_pedido desc nulls last, r.bling_id desc) as n
    from r
   where r.achados = 1 and r.fone is not null
     and not exists (select 1 from public.carbo_wa_nao_contatar x
                      where x.removido_em is null and x.chave = public.carbo_fone_chave(r.fone))
     and not exists (select 1 from public.carbo_msg_disparo q
                        where q.etapa = 'aviso_atraso' and q.bling_id <> r.bling_id
                          and public.carbo_fone_chave(q.telefone) = public.carbo_fone_chave(r.fone))
),
ins as (
  insert into public.carbo_msg_disparo (etapa, bling_id, telefone, nome, dados, observacao)
  select 'aviso_atraso', bling_id, fone, coalesce(nullif(btrim(primeiro_nome), ''), cliente),
         jsonb_build_object('link_rastreio', link_rastreio),
         'lote atraso_2026_11_24 · ' || id_pedido_loja || ' · NF ' || nf
    from bons where n = 1
  on conflict (etapa, bling_id) do nothing
  returning 1
)
select (select count(*) from ent) as na_lista,
       (select count(*) from ins) as carregados_agora,
       (select count(*) from public.carbo_msg_disparo where etapa = 'aviso_atraso')
         + (select count(*) from ins) as total_no_disparo;
