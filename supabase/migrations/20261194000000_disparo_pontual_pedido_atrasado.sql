-- ═══════════════════════════════════════════════════════════════════════════
-- Disparo PONTUAL de um template para uma lista escolhida — o primeiro uso é
-- o aviso aos pedidos que atrasaram e estão saindo agora (24/11/2026)
--
-- Pedido do dono do processo: os clientes cujo pedido atrasou muito recebem
-- UMA mensagem (template aprovado na Meta, variáveis por NÚMERO):
--   {{1}} primeiro nome · {{2}} link do rastreio · {{3}} checkout com 20% off
-- E SÓ eles: a lista vem do time, e o banco não decide quem entra.
--
-- ── Por que tabela + view, e não uma etapa da `carbo_msg_fila` ──────────────
-- A fila é a consulta mais cara do banco e decide o WhatsApp da esteira; mexer
-- nela por uma mensagem de uma vez seria mexer no gatilho de todos os avisos.
-- Aqui a lista é DADA (`carbo_msg_disparo`), e a view só devolve o que ainda
-- não saiu. O `whatsapp-meta` lê as duas e passa as linhas pelo MESMO laço:
-- registro antes da chamada, `pendente` no transitório, wa_id conhecido, TETO
-- e pausa. O envio vai para `carbo_msg_envios` com o `bling_id` do PEDIDO, e é
-- isso que o põe na conversa (Atendimento) e no status entregue/lido.
--
-- ⚠️ A PK (bling_id, etapa) de `carbo_msg_envios` é a trava: um pedido recebe
-- este aviso UMA vez, para sempre, mesmo que a lista seja carregada de novo.
-- Pessoa com dois pedidos atrasados: quem carrega a lista escolhe UM (a
-- consulta `supabase/consultas/aviso_pedido_atrasado.sql` já faz isso).
--
-- ⚠️ NASCE DESLIGADO e sem o nome do template: liga-se pela consulta, depois
-- de `?conferir=1` dizer que o modelo da Meta bate e do teste no celular.
-- ═══════════════════════════════════════════════════════════════════════════


-- ── A lista ─────────────────────────────────────────────────────────────────
create table if not exists public.carbo_msg_disparo (
  etapa       text   not null,
  bling_id    bigint not null,           -- o id do card da esteira (Bling 1 negativo)
  telefone    text   not null,
  nome        text,
  -- As colunas que as variáveis do template leem (`meta_variaveis[].de`),
  -- além de `primeiro_nome`. Ex.: {"link_rastreio": "https://…"}.
  dados       jsonb  not null default '{}'::jsonb,
  observacao  text,
  incluido_em timestamptz not null default now(),
  primary key (etapa, bling_id)
);

comment on table public.carbo_msg_disparo is
  'Lista de um disparo PONTUAL de template (ex.: aviso aos pedidos atrasados). O whatsapp-meta envia o que a view carbo_msg_disparo_fila devolve; a trava de uma vez por pedido é a PK de carbo_msg_envios. Carregada pelo SQL Editor, nunca pela tela.';

alter table public.carbo_msg_disparo enable row level security;

-- Ler: time interno (a lista tem telefone). Escrever: nenhuma policy — só o
-- SQL Editor e a service role.
drop policy if exists carbo_msg_disparo_ler on public.carbo_msg_disparo;
create policy carbo_msg_disparo_ler on public.carbo_msg_disparo
  for select to authenticated using ((select public.carbo_e_time_interno()));

grant select on public.carbo_msg_disparo to authenticated;
grant all on public.carbo_msg_disparo to service_role;


-- ── A etapa nova no CHECK (refeito a partir do BANCO, molde da 20261177) ────
do $$
declare
  v_lista text;
  r record;
begin
  select string_agg(quote_literal(e), ', ' order by e) into v_lista from (
    select etapa as e from public.carbo_msg_templates
    union
    select unnest(array['confirmado','nf_emitida','etiqueta','em_transito','saiu_entrega','entregue',
                        'recompra','carrinho_1','carrinho_2','carrinho_3'])
    union
    select 'recompra_' || f || '_d' || d from unnest(array['sache','frasco']) f, generate_series(1, 7) d
    union
    select 'aviso_atraso'
  ) s;

  for r in
    select con.conname
      from pg_constraint con
     where con.conrelid = 'public.carbo_msg_templates'::regclass and con.contype = 'c'
       and pg_get_constraintdef(con.oid) ~ 'etapa'
       and pg_get_constraintdef(con.oid) ~ 'carrinho_1'
  loop
    execute format('alter table public.carbo_msg_templates drop constraint %I', r.conname);
  end loop;
  execute 'alter table public.carbo_msg_templates add constraint carbo_msg_templates_etapa_check check (etapa in ('
          || v_lista || '))';
end $$;


-- ── O template (DESLIGADO, sem nome — a consulta preenche) ──────────────────
-- ⚠️ Variáveis com nome de NÚMERO = o envio manda POSICIONAL (`montarPayload`).
-- {{1}} e {{2}} sem `fallback` = obrigatórias: sem rastreio a linha ESPERA.
-- {{3}} é o MESMO link para todos: mora no `fallback` (a consulta grava), e
-- sem ele cadastrado a fila SEGURA em vez de mandar sem checkout.
-- `texto` é o ESPELHO do aprovado (é o que o balão da conversa mostra).
-- Sai pelo número de SERVIÇO, o mesmo dos avisos do pedido.
insert into public.carbo_msg_templates
  (etapa, ativo, titulo, texto, atraso_min, canal_envio, meta_template_nome, meta_idioma,
   meta_variaveis, meta_status, meta_botao_url_de, numero_id)
values (
  'aviso_atraso', false, 'Pedido atrasado · já enviado',
  $t$Oi, {{1}}! Tudo bem? 💚

Aqui é do CarboZé, e temos uma boa notícia: seu pedido já foi enviado! 📦

A procura pelo CarboZé foi muito acima do esperado nas últimas semanas, e isso fez seu envio levar mais tempo do que gostaríamos. Pedimos desculpas pela espera.

Já está tudo normalizado, e seu pedido está a caminho com nota fiscal.

🔎 Seu código de rastreio: {{2}}

Para agradecer pela sua paciência, você ganhou 20% de desconto na sua próxima compra. É só usar o checkout abaixo. 🎁

Seu checkout com 20% off: {{3}}

Obrigado por estar com a gente! 💚$t$,
  0, 'meta', null, 'pt_BR',
  '[{"nome": "1", "de": "primeiro_nome"},
    {"nome": "2", "de": "link_rastreio"},
    {"nome": "3", "de": "link_checkout"}]'::jsonb,
  'PENDING', null, '1255756280958635'
)
on conflict (etapa) do nothing;


-- ── O que ainda falta mandar ────────────────────────────────────────────────
-- ⚠️ As MESMAS travas da `carbo_msg_fila`: template ligado E aprovado, canal
-- Meta, número ativo, telefone preenchido, e nada em `carbo_msg_envios` além
-- de `pendente` para o par (pedido, etapa).
create or replace view public.carbo_msg_disparo_fila
with (security_invoker = true) as
select
  d.bling_id,
  d.etapa,
  t.titulo,
  t.atraso_min,
  d.telefone,
  d.nome,
  -- Nome do Bling costuma vir em CAIXA ALTA: "Oi, MARIA!" grita.
  initcap(lower(split_part(btrim(coalesce(d.nome, '')), ' ', 1))) as primeiro_nome,
  t.canal_envio,
  t.meta_template_nome,
  t.meta_idioma,
  t.meta_variaveis,
  t.meta_botao_url_de,
  t.meta_status,
  t.numero_id,
  1 as prioridade,
  d.dados
from public.carbo_msg_disparo d
join public.carbo_msg_templates t
  on t.etapa = d.etapa and t.ativo and t.canal_envio = 'meta'
 and t.meta_status = 'APPROVED' and t.meta_template_nome is not null
join public.carbo_wa_numeros n on n.phone_number_id = t.numero_id and n.ativo
where nullif(btrim(d.telefone), '') is not null
  and not exists (
    select 1 from public.carbo_msg_envios v
     where v.bling_id = d.bling_id and v.etapa = d.etapa and v.status <> 'pendente'
  )
order by d.incluido_em, d.bling_id;

revoke all on public.carbo_msg_disparo_fila from anon, authenticated;
grant select on public.carbo_msg_disparo_fila to service_role;


-- ── O balão da conversa também para variável POSICIONAL ─────────────────────
-- A reconstrução casava só por `parameter_name`; o posicional não tem nome, e
-- o balão mostraria "{{2}}" — quem atende leria que o cliente recebeu isso.
-- Agora o parâmetro sem nome substitui {{N}} pela POSIÇÃO. O nomeado segue
-- exatamente como era.
create or replace function public.carbo_wa_texto_do_template(
  p_texto   text,
  p_payload jsonb
) returns text
language plpgsql immutable as $$
declare
  v_texto text := p_texto;
  r record;
begin
  if p_texto is null or p_payload is null then return null; end if;

  for r in
    select e.valor, e.posicao
      from jsonb_array_elements(p_payload -> 'template' -> 'components') c,
           jsonb_array_elements(c -> 'parameters') with ordinality as e(valor, posicao)
     where c ->> 'type' = 'body'
  loop
    if r.valor ? 'parameter_name' then
      v_texto := replace(v_texto, '{{' || (r.valor ->> 'parameter_name') || '}}',
                         coalesce(r.valor ->> 'text', ''));
    else
      v_texto := replace(v_texto, '{{' || r.posicao || '}}', coalesce(r.valor ->> 'text', ''));
    end if;
  end loop;

  return v_texto;
end $$;

comment on function public.carbo_wa_texto_do_template is
  'Reconstrói a mensagem que o cliente recebeu, substituindo os parâmetros do payload no corpo aprovado: por nome ({{nome}}) ou, sem parameter_name, pela posição ({{1}}). NÃO é uma segunda redação. Devolve NULL sem payload.';


-- ── Conferência (aborta se algo não ficou de pé) ────────────────────────────
do $$
begin
  if not exists (select 1 from public.carbo_msg_templates where etapa = 'aviso_atraso') then
    raise exception 'a etapa aviso_atraso não foi criada';
  end if;
  if public.carbo_wa_texto_do_template('Oi {{1}}, {{2}}',
       '{"template":{"components":[{"type":"body","parameters":[{"type":"text","text":"Ana"},{"type":"text","text":"x"}]}]}}'::jsonb)
     <> 'Oi Ana, x' then
    raise exception 'a reconstrução posicional não fechou';
  end if;
  if public.carbo_wa_texto_do_template('Oi {{primeiro_nome}}',
       '{"template":{"components":[{"type":"body","parameters":[{"type":"text","parameter_name":"primeiro_nome","text":"Ana"}]}]}}'::jsonb)
     <> 'Oi Ana' then
    raise exception 'a reconstrução nomeada mudou';
  end if;
  perform count(*) from public.carbo_msg_disparo_fila;
end $$;
