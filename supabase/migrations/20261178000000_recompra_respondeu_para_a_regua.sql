-- ═══════════════════════════════════════════════════════════════════════════
-- Recompra: o cliente RESPONDEU → a régua de 7 dias PARA (19/11/2026)
--
-- Pedido do dono do processo: *"cliente respondeu, a cadência para de mandar
-- mensagem para ele … independente do que seja a resposta, para não spamar se
-- ele falar que quer ou se falar que não quer"*, com uma coluna "Respondeu" e,
-- sem recompra em 7 dias, a saída para "Não comprou".
--
-- Mesmo desenho do carrinho (20261051), com uma diferença de propósito:
--
-- 1. ⚠️ QUALQUER resposta para — não se tenta ler "sim" ou "não". Uma pessoa
--    assume em Conversas.
-- 2. ⚠️ Casado por IDENTIDADE: o `wa_id` que a Meta devolveu no envio + o MESMO
--    número nosso (`numero_id`) + mensagem do cliente DEPOIS do primeiro envio
--    da régua daquele pedido. Telefone parecido erra pelo 9º dígito.
-- 3. ⚠️ Aqui quem PARA é a própria pipeline: `coluna = 'respondeu'` não é
--    `ofertar` nem `dia_N`, e a `carbo_recompra_devido` só tira passo dessas
--    duas. Não precisa de linha `ignorado` (o carrinho precisou porque a view
--    dele não podia ser tocada). Respondeu há 7 dias ou mais, sem recompra:
--    `sem_retorno`.
-- 4. Cron, não gatilho em `carbo_wa_mensagens`: erro dentro do gatilho abortaria
--    a gravação da mensagem do cliente, que só existe no celular dele. O próximo
--    passo da régua só sai no dia seguinte, e o cron é de 1 min.
--
-- E o RODAPÉ "Zé, do CarboZé 💚" saiu dos 14 (decisão do dono do processo): o
-- `texto` de conferência no banco deixa de mostrá-lo. O envio nunca o mandou
-- (rodapé não tem parâmetro); o que a Meta mostra é o template de lá.
--
-- Volta: BLOCO R (comentado) no fim.
-- ═══════════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — quem respondeu (fato: a PRIMEIRA resposta, nunca apagada)   ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
create table if not exists public.carbo_recompra_respostas (
  bling_id       bigint primary key,
  wa_id          text not null,
  numero_id      text,
  wamid_resposta text not null,
  respondeu_em   timestamptz not null,
  detectado_em   timestamptz not null default now()
);

comment on table public.carbo_recompra_respostas is
  'Pedido da régua de recompra cujo cliente RESPONDEU no WhatsApp (wa_id devolvido pela Meta no envio + mesmo numero_id + resposta depois do primeiro envio). Preenchida só por carbo_recompra_marcar_respostas() (cron 1 min). A carbo_recompra_pipeline a lê: coluna respondeu por 7 dias, depois sem_retorno.';

alter table public.carbo_recompra_respostas enable row level security;

drop policy if exists carbo_recompra_respostas_le on public.carbo_recompra_respostas;
create policy carbo_recompra_respostas_le on public.carbo_recompra_respostas
  for select to authenticated using ((select public.carbo_e_time_interno()));

grant select on public.carbo_recompra_respostas to authenticated;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — a função que detecta a resposta                             ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
create or replace function public.carbo_recompra_marcar_respostas()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_novas integer;
begin
  with envios as (
    select v.bling_id, v.wa_id, v.numero_id,
           min(coalesce(v.enviado_em, v.detectado_em)) as primeiro_envio
      from public.carbo_msg_envios v
     where (v.etapa = 'recompra' or v.etapa ~ '^recompra_[a-z]+_d[1-7]$')
       and v.status in ('enviado', 'entregue', 'lido')   -- só o que SAIU
       and v.wa_id is not null
       and v.numero_id is not null
       and coalesce(v.enviado_em, v.detectado_em) > now() - interval '30 days'
       and not exists (select 1 from public.carbo_recompra_respostas r where r.bling_id = v.bling_id)
     group by 1, 2, 3
  ),
  resp as (
    select distinct on (e.bling_id)
           e.bling_id, m.wa_id, m.numero_id, m.wamid, m.ocorrido_em
      from envios e
      join public.carbo_wa_mensagens m
        on m.wa_id = e.wa_id
       and m.numero_id = e.numero_id
       and m.direcao = 'entrada'
       and m.ocorrido_em > e.primeiro_envio
     order by e.bling_id, m.ocorrido_em
  )
  insert into public.carbo_recompra_respostas (bling_id, wa_id, numero_id, wamid_resposta, respondeu_em)
  select bling_id, wa_id, numero_id, wamid, ocorrido_em from resp
  on conflict (bling_id) do nothing;

  get diagnostics v_novas = row_count;
  return v_novas;
end;
$$;

comment on function public.carbo_recompra_marcar_respostas() is
  'Cron 1 min. Registra em carbo_recompra_respostas quem respondeu a uma mensagem da régua de recompra (identidade: wa_id + numero_id, resposta depois do primeiro envio). A pipeline faz o resto. Devolve quantas respostas novas achou.';

revoke execute on function public.carbo_recompra_marcar_respostas() from public, anon, authenticated;

select cron.schedule('recompra-respostas-1min', '* * * * *',
                     'select public.carbo_recompra_marcar_respostas()');


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 3 — a pipeline ganha a coluna "respondeu"                       ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- ⚠️ A view viva tem de ser EXATAMENTE a da 20261177 — conferido no banco: uma
-- cópia dela é criada com outro nome e as duas definições (pg_get_viewdef) são
-- comparadas. Diferente ⇒ ABORTA (alguém mexeu nela depois, e reescrevê-la
-- apagaria essa mudança calada). Só muda: dois WHEN depois de `historico`, a
-- colunas `respondeu_em`, `respondeu_wa_id` e
-- `respondeu_numero_id` no FIM (o card abre a conversa) e o LEFT JOIN na tabela de respostas.
do $guarda$
declare
  v_viva text;
  v_ref  text;
begin
  select pg_get_viewdef(c.oid) into v_viva
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'carbo_recompra_pipeline' and c.relkind = 'v';
  if v_viva is null then
    raise exception 'ABORTADO: view public.carbo_recompra_pipeline não encontrada';
  end if;
  if v_viva ~* 'carbo_recompra_respostas' then
    raise notice 'BLOCO 3: a pipeline já lê carbo_recompra_respostas — nada a fazer';
    return;
  end if;

  execute $ref$create view public.carbo_recompra_pipeline_ref_20261178 as
 WITH cfg AS (
   SELECT carbo_recompra_config.dias_para_ofertar, carbo_recompra_config.dias_para_desistir,
          carbo_recompra_config.inicio_regua_7
     FROM public.carbo_recompra_config
    WHERE carbo_recompra_config.id
 ), padrao AS (
   SELECT f0.fluxo FROM public.carbo_recompra_fluxos f0 WHERE f0.padrao_sem_casamento
 ), hoje AS (
   SELECT (timezone('America/Sao_Paulo'::text, now()))::date AS dia
 )
 SELECT r.bling_id, r.pedido_loja, r.canal, r.cliente, r.cliente_fone, r.cpf_cnpj, r.total,
        r.entrega_cidade, r.entrega_uf, r.entregue_em, r.origem AS origem_da_data, r.ofertado_em, r.recomprou,
        (CURRENT_DATE - r.entregue_em::date) AS dias_desde_entrega,
        CASE
          WHEN r.recomprou THEN 'recomprou'
          WHEN r.origem = 'historico' THEN 'historico'
          WHEN s.d1_em IS NOT NULL
               AND (h.dia - (timezone('America/Sao_Paulo'::text, s.d1_em))::date) > 6 THEN 'sem_retorno'
          WHEN s.d1_em IS NOT NULL THEN 'dia_' || s.passo
          WHEN r.ofertado_em IS NOT NULL
               AND (CURRENT_DATE - r.ofertado_em::date) > c.dias_para_desistir THEN 'sem_retorno'
          WHEN r.ofertado_em IS NOT NULL THEN 'ofertado'
          -- ⚠️ Sem fluxo (cadastro vazio) ninguém está "na hora": sem isto a
          -- conta abaixo daria nulo e o pedido cairia em "ofertar".
          WHEN f.fluxo IS NULL THEN 'entregue'
          WHEN (CURRENT_DATE - r.entregue_em::date) < f.dias_apos_entrega THEN 'entregue'
          WHEN (r.entregue_em::date + f.dias_apos_entrega) < c.inicio_regua_7 THEN 'sem_retorno'
          ELSE 'ofertar'
        END AS coluna,
        f.fluxo,
        f.dias_apos_entrega,
        COALESCE(s.passo, 0) AS passo,
        s.d1_em,
        CASE WHEN s.d1_em IS NOT NULL
             THEN h.dia - (timezone('America/Sao_Paulo'::text, s.d1_em))::date + 1 END AS dia_da_regua,
        s.ultimo_em
   FROM public.carbo_recompra_base r
   CROSS JOIN cfg c
   CROSS JOIN hoje h
   LEFT JOIN LATERAL (
     SELECT max(x.k) FILTER (WHERE x.ok) AS passo,
            max(x.enviado_em) FILTER (WHERE x.k = 1 AND x.ok) AS d1_em,
            max(x.fluxo) FILTER (WHERE x.k = 1 AND x.ok) AS fluxo_d1,
            max(x.enviado_em) FILTER (WHERE x.status <> 'pendente') AS ultimo_em
       FROM (SELECT (substring(v.etapa FROM '_d([1-7])$'))::int AS k,
                    substring(v.etapa FROM '^recompra_([a-z]+)_d[1-7]$') AS fluxo,
                    v.status, v.enviado_em,
                    v.status = ANY (ARRAY['enviado'::text, 'entregue'::text, 'lido'::text]) AS ok
               FROM public.carbo_msg_envios v
              WHERE v.bling_id = r.bling_id
                AND v.etapa ~ '^recompra_[a-z]+_d[1-7]$'
                AND NOT r.recomprou
                AND r.origem <> 'historico'
                AND r.entregue_em::date >= (c.inicio_regua_7 - 60)) x
   ) s ON true
   LEFT JOIN public.carbo_recompra_fluxos f
     ON f.fluxo = COALESCE(s.fluxo_d1, r.fluxo, (SELECT padrao.fluxo FROM padrao));$ref$;
  select pg_get_viewdef('public.carbo_recompra_pipeline_ref_20261178'::regclass) into v_ref;
  drop view public.carbo_recompra_pipeline_ref_20261178;

  if v_ref is distinct from v_viva then
    raise exception 'ABORTADO: a carbo_recompra_pipeline viva não é a da 20261177. Nada foi mudado.';
  end if;

  insert into public.carbo_backup_viewdef (nome, def, opcoes, motivo)
  values ('carbo_recompra_pipeline', v_viva, 'security_invoker=true', '20261178 — antes da coluna respondeu');

  execute $novo$create or replace view public.carbo_recompra_pipeline with (security_invoker = true) as
 WITH cfg AS (
   SELECT carbo_recompra_config.dias_para_ofertar, carbo_recompra_config.dias_para_desistir,
          carbo_recompra_config.inicio_regua_7
     FROM public.carbo_recompra_config
    WHERE carbo_recompra_config.id
 ), padrao AS (
   SELECT f0.fluxo FROM public.carbo_recompra_fluxos f0 WHERE f0.padrao_sem_casamento
 ), hoje AS (
   SELECT (timezone('America/Sao_Paulo'::text, now()))::date AS dia
 )
 SELECT r.bling_id, r.pedido_loja, r.canal, r.cliente, r.cliente_fone, r.cpf_cnpj, r.total,
        r.entrega_cidade, r.entrega_uf, r.entregue_em, r.origem AS origem_da_data, r.ofertado_em, r.recomprou,
        (CURRENT_DATE - r.entregue_em::date) AS dias_desde_entrega,
        CASE
          WHEN r.recomprou THEN 'recomprou'
          WHEN r.origem = 'historico' THEN 'historico'
          -- O cliente RESPONDEU (qualquer resposta): a régua para. Fica em
          -- "respondeu" por 7 dias para uma pessoa tratar; sem recompra, vai
          -- para "sem_retorno" (na tela: "Não comprou").
          WHEN rr.respondeu_em IS NOT NULL
               AND (h.dia - (timezone('America/Sao_Paulo'::text, rr.respondeu_em))::date) < 7 THEN 'respondeu'
          WHEN rr.respondeu_em IS NOT NULL THEN 'sem_retorno'
          WHEN s.d1_em IS NOT NULL
               AND (h.dia - (timezone('America/Sao_Paulo'::text, s.d1_em))::date) > 6 THEN 'sem_retorno'
          WHEN s.d1_em IS NOT NULL THEN 'dia_' || s.passo
          WHEN r.ofertado_em IS NOT NULL
               AND (CURRENT_DATE - r.ofertado_em::date) > c.dias_para_desistir THEN 'sem_retorno'
          WHEN r.ofertado_em IS NOT NULL THEN 'ofertado'
          -- ⚠️ Sem fluxo (cadastro vazio) ninguém está "na hora": sem isto a
          -- conta abaixo daria nulo e o pedido cairia em "ofertar".
          WHEN f.fluxo IS NULL THEN 'entregue'
          WHEN (CURRENT_DATE - r.entregue_em::date) < f.dias_apos_entrega THEN 'entregue'
          WHEN (r.entregue_em::date + f.dias_apos_entrega) < c.inicio_regua_7 THEN 'sem_retorno'
          ELSE 'ofertar'
        END AS coluna,
        f.fluxo,
        f.dias_apos_entrega,
        COALESCE(s.passo, 0) AS passo,
        s.d1_em,
        CASE WHEN s.d1_em IS NOT NULL
             THEN h.dia - (timezone('America/Sao_Paulo'::text, s.d1_em))::date + 1 END AS dia_da_regua,
        s.ultimo_em,
        rr.respondeu_em,
        rr.wa_id AS respondeu_wa_id,
        rr.numero_id AS respondeu_numero_id
   FROM public.carbo_recompra_base r
   CROSS JOIN cfg c
   CROSS JOIN hoje h
   LEFT JOIN LATERAL (
     SELECT max(x.k) FILTER (WHERE x.ok) AS passo,
            max(x.enviado_em) FILTER (WHERE x.k = 1 AND x.ok) AS d1_em,
            max(x.fluxo) FILTER (WHERE x.k = 1 AND x.ok) AS fluxo_d1,
            max(x.enviado_em) FILTER (WHERE x.status <> 'pendente') AS ultimo_em
       FROM (SELECT (substring(v.etapa FROM '_d([1-7])$'))::int AS k,
                    substring(v.etapa FROM '^recompra_([a-z]+)_d[1-7]$') AS fluxo,
                    v.status, v.enviado_em,
                    v.status = ANY (ARRAY['enviado'::text, 'entregue'::text, 'lido'::text]) AS ok
               FROM public.carbo_msg_envios v
              WHERE v.bling_id = r.bling_id
                AND v.etapa ~ '^recompra_[a-z]+_d[1-7]$'
                AND NOT r.recomprou
                AND r.origem <> 'historico'
                AND r.entregue_em::date >= (c.inicio_regua_7 - 60)) x
   ) s ON true
   LEFT JOIN public.carbo_recompra_fluxos f
     ON f.fluxo = COALESCE(s.fluxo_d1, r.fluxo, (SELECT padrao.fluxo FROM padrao))
   LEFT JOIN public.carbo_recompra_respostas rr ON rr.bling_id = r.bling_id;$novo$;
end $guarda$;

grant select on public.carbo_recompra_pipeline to authenticated;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 4 — o rodapé sai do espelho dos 14                              ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
update public.carbo_msg_templates
   set texto = left(texto, length(texto) - length(E'\n\nZé, do CarboZé 💚'))
 where etapa ~ '^recompra_[a-z]+_d[1-7]$'
   and right(texto, length(E'\n\nZé, do CarboZé 💚')) = E'\n\nZé, do CarboZé 💚';


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO R — VOLTA (rodar só se precisar)                                ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- O jeito simples é desligar o robô: sem linha em carbo_recompra_respostas a
-- pipeline se comporta exatamente como a da 20261177.
--   select cron.unschedule('recompra-respostas-1min');
--   truncate public.carbo_recompra_respostas;
