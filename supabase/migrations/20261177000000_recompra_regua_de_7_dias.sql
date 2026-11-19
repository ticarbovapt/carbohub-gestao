-- ═══════════════════════════════════════════════════════════════════════════
-- 20261177 — a recompra vira uma RÉGUA DE 7 DIAS, em dois fluxos (19/11/2026)
--
-- Pedido do dono do processo, com o PDF "CarboZé · Recompra no WhatsApp":
-- 14 templates (Sachês e Frascos, Dia 1 a Dia 7), a mensagem EXATAMENTE a do
-- PDF. Os textos moram em `docs/whatsapp/recompra/textos.mjs` (fonte única;
-- `gerar.mjs` produz o JSON da Meta, o prompt do cadastro e o espelho abaixo).
--
--   Sachês   Kit 10 Sachês (moto)   entra 30 dias após a entrega
--   Frascos  Kit 5 Frascos (carro)  entra 45 dias após a entrega
--
-- As regras do PDF, e onde cada uma mora:
--   1 template por dia, 7 dias, mesmo horário   carbo_recompra_devido (a hora do D1)
--   Comprou: sai na hora                       recomprou (robô) + compra na loja depois do D1
--   Pediu para parar: opt-out permanente       carbo_wa_optout_automatico() + a lista "não contatar"
--   Escreveu outra coisa: o fluxo segue        nada a fazer (a conversa vai para o Atendimento)
--   Carrinho abandonado: pausa                 carrinho aberto do mesmo telefone segura o envio
--   Erro 131049: reenvia no dia seguinte       a fila aceita de novo o `falhou` 131049 do dia anterior
--   O Dia 7 sai sempre no último dia           o Dia 6 e o Dia 7 têm dia FIXO; 2 a 5 escorregam
--
-- ⚠️ NADA SAI COM ESTA MIGRAÇÃO. Os 14 nascem `ativo = false`, `PENDING`, e o
-- link do checkout VAZIO (sem link a fila SEGURA: "esperando: link_checkout").
-- Até o D1 de um fluxo estar ligado E aprovado, a oferta antiga (`recompra`,
-- `recompra_lembrete`) continua saindo como hoje — sem buraco entre as duas.
--
-- ⚠️ A troca na `carbo_msg_fila` é no TEXTO VIVO, com trava: cada trecho tem
-- de aparecer exatamente uma vez, senão ABORTA e nada muda. Cópia em
-- `carbo_backup_viewdef`. A régua de entrega e o carrinho não são tocados.
-- Volta: BLOCO R (comentado) no fim.
-- ═══════════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — os dois fluxos (CADASTRO) e o marco zero da régua nova      ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
create table if not exists public.carbo_recompra_fluxos (
  fluxo                text primary key check (fluxo ~ '^[a-z]+$'),
  rotulo               text not null,
  -- Expressão regular sobre `lower(codigo || ' ' || descricao)` de cada item do
  -- pedido no Bling. O primeiro fluxo (menor `ordem`) que casar com algum item
  -- vence; sem casamento nenhum, vale o `padrao_sem_casamento`.
  padrao               text,
  ordem                int  not null,
  padrao_sem_casamento boolean not null default false,
  dias_apos_entrega    int  not null check (dias_apos_entrega > 0),
  atualizado_em        timestamptz not null default now()
);
create unique index if not exists carbo_recompra_fluxos_um_padrao
  on public.carbo_recompra_fluxos (padrao_sem_casamento) where padrao_sem_casamento;

comment on table public.carbo_recompra_fluxos is
  'Os fluxos da régua de recompra de 7 dias (20261177). O fluxo de um pedido sai dos ITENS dele no Bling (padrao). Pedido misto (frasco + sachê) vai para Frascos, que vem primeiro na ordem. Sem casamento, o padrão (Frascos). Depois que o Dia 1 sai, o fluxo fica preso ao do Dia 1.';

insert into public.carbo_recompra_fluxos (fluxo, rotulo, padrao, ordem, padrao_sem_casamento, dias_apos_entrega) values
  ('frasco', 'Kit 5 Frascos', 'frasco|cz100|100 ?ml', 1, true,  45),
  ('sache',  'Kit 10 Sachês', 'sach',                 2, false, 30)
on conflict (fluxo) do nothing;

alter table public.carbo_recompra_fluxos enable row level security;
drop policy if exists carbo_recompra_fluxos_ler on public.carbo_recompra_fluxos;
create policy carbo_recompra_fluxos_ler on public.carbo_recompra_fluxos
  for select to authenticated using ((select public.carbo_e_time_interno()));
grant select on public.carbo_recompra_fluxos to authenticated;

-- ⚠️ O MARCO ZERO da régua nova. Pedido cuja data de entrada (entrega + 30/45
-- dias) é anterior a ele NÃO entra — sem isto, ligar os templates mandaria o
-- Dia 1 a todo o estoque de "Hora de ofertar" no mesmo minuto. Nasce dois dias
-- antes da migração (quem entrou ontem e anteontem ainda está no prazo).
-- Voltar a data é uma decisão: cada dia a menos é uma leva de Dia 1.
alter table public.carbo_recompra_config
  add column if not exists inicio_regua_7 date not null default (current_date - 2);
-- Carrinho aberto do mesmo telefone PAUSA a recompra: abandonado nos últimos
-- N dias e não concluído (a régua do carrinho dura ~3 dias).
alter table public.carbo_recompra_config
  add column if not exists pausa_carrinho_dias int not null default 4 check (pausa_carrinho_dias between 0 and 30);


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — o fluxo de cada pedido entregue                             ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
create or replace function public.carbo_recompra_fluxo_do_pedido(p_bling_id bigint)
returns text
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select f.fluxo
       from carbo_recompra_fluxos f
      where f.padrao is not null
        and exists (
          select 1
            from bling2_orders o
            cross join lateral jsonb_array_elements(
              case when jsonb_typeof(o.items) = 'array' then o.items else '[]'::jsonb end) i
           where o.bling_id = p_bling_id
             and lower(coalesce(i->>'codigo', '') || ' ' || coalesce(i->>'descricao', '')) ~ f.padrao)
      order by f.ordem
      limit 1),
    (select fluxo from carbo_recompra_fluxos where padrao_sem_casamento limit 1));
$$;
revoke all on function public.carbo_recompra_fluxo_do_pedido(bigint) from public, anon, authenticated;

alter table public.carbo_recompra_base add column if not exists fluxo text;

-- ⚠️ Gatilho, e não o robô: a `carbo_recompra_atualizar()` apaga e reinsere a
-- linha, e o fluxo nasce em todo insert sem tocar no robô. Erro aqui NUNCA
-- derruba o robô: o fluxo fica nulo e a leitura usa o padrão.
create or replace function public.carbo_recompra_base_fluxo()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  begin
    new.fluxo := public.carbo_recompra_fluxo_do_pedido(new.bling_id);
  exception when others then
    new.fluxo := null;
  end;
  return new;
end $$;
revoke all on function public.carbo_recompra_base_fluxo() from public, anon, authenticated;

drop trigger if exists trg_recompra_base_fluxo on public.carbo_recompra_base;
create trigger trg_recompra_base_fluxo
  before insert on public.carbo_recompra_base
  for each row execute function public.carbo_recompra_base_fluxo();

update public.carbo_recompra_base b
   set fluxo = public.carbo_recompra_fluxo_do_pedido(b.bling_id)
 where b.fluxo is null;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 3 — a pipeline sabe em que DIA da régua cada pedido está        ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- Mesmas 15 colunas, mesma ordem (a tela e a fila não mudam de forma); seis
-- novas no FIM. A `coluna` ganha `dia_1` … `dia_7`; `ofertado` fica só para o
-- pedido que recebeu a oferta ANTIGA (uma mensagem só).
--
--   entregue     descansando até 30 (sachês) ou 45 dias (frascos)
--   ofertar      passou a janela; o Dia 1 é o próximo a sair
--   dia_N        o último dia que SAIU (o N do Dia N)
--   sem_retorno  a régua acabou (depois do Dia 7) sem compra — ou o pedido
--                entrou antes do marco zero da régua nova
--
-- ⚠️ O lateral sobre `carbo_msg_envios` só roda para quem pode estar na régua
-- (não recomprou, não é histórico, entregue depois do marco − 60 dias): é a
-- PK (bling_id, etapa), uma busca por índice, e o resto da base nem a faz.
do $$
declare
  v_def  text;
begin
  select pg_get_viewdef(c.oid) into v_def
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'carbo_recompra_pipeline' and c.relkind = 'v';
  if v_def is null then
    raise exception 'ABORTADO: view public.carbo_recompra_pipeline não encontrada';
  end if;
  if v_def !~* 'carbo_recompra_base' then
    raise exception 'ABORTADO: a carbo_recompra_pipeline não lê a carbo_recompra_base (a 20261160 não está aplicada)';
  end if;
  if v_def ~* 'dia_da_regua' then
    raise notice 'BLOCO 3: a pipeline já tem a régua de 7 dias — pulando';
    return;
  end if;
  insert into public.carbo_backup_viewdef (nome, def, opcoes, motivo)
  values ('carbo_recompra_pipeline', v_def, 'security_invoker=true', '20261177 — antes da régua de 7 dias');
end $$;

create or replace view public.carbo_recompra_pipeline with (security_invoker = true) as
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
     ON f.fluxo = COALESCE(s.fluxo_d1, r.fluxo, (SELECT padrao.fluxo FROM padrao));

grant select on public.carbo_recompra_pipeline to authenticated;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 4 — o que sai HOJE: um passo por pedido, no máximo              ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- N = dias desde o Dia 1 (data de Brasília). O passo de hoje:
--   N = 6         Dia 7 (o último dia do prazo — fixo)
--   N = 5         Dia 6 ("amanhã acaba" — fixo)
--   N = 1 a 4     o seguinte ao último que SAIU (2 a 5 escorregam um dia quando
--                 a Meta devolve 131049; o que não couber até o Dia 6 não sai)
--   sem Dia 1     Dia 1, quando a pipeline diz "ofertar"
-- Um passo por dia: tentou hoje (inclusive falhou), só amanhã. Mesmo horário:
-- o Dia 2 em diante só sai a partir da HORA em que o Dia 1 saiu.
--
-- ⚠️ Enquanto o Dia 1 de um fluxo não estiver ligado E aprovado, o passo 1 sai
-- como a oferta ANTIGA (`recompra`). Assim a troca não deixa buraco.
create or replace view public.carbo_recompra_devido with (security_invoker = true) as
 WITH agora AS (
   SELECT now() AS ts,
          (timezone('America/Sao_Paulo'::text, now()))::date AS dia,
          (extract(hour FROM timezone('America/Sao_Paulo'::text, now())))::int AS hora
 ), cfg AS (
   SELECT carbo_recompra_config.pausa_carrinho_dias
     FROM public.carbo_recompra_config
    WHERE carbo_recompra_config.id
 ), pronto AS (
   SELECT substring(t.etapa FROM '^recompra_([a-z]+)_d1$') AS fluxo
     FROM public.carbo_msg_templates t
    WHERE t.etapa ~ '^recompra_[a-z]+_d1$' AND t.ativo AND t.meta_status = 'APPROVED'
 ),
 -- ⚠️ As chaves de telefone vêm PRÉ-AGRUPADAS (uma linha por pessoa), em CTE
 -- materializado: comparando a função linha a linha o planejador escolheu laço
 -- aninhado e o teste a 100× foi a 7,9 s (2 milhões de comparações).
 carrinhos AS MATERIALIZED (
   SELECT public.carbo_fone_chave(ca.telefone) AS chave, max(ca.abandonado_em) AS ultimo
     FROM public.nuvemshop_carrinhos ca
    WHERE ca.completado_em IS NULL AND ca.abandonado_em >= now() - interval '30 days'
    GROUP BY 1
 ), compras AS MATERIALIZED (
   SELECT public.carbo_fone_chave(o.cliente_fone) AS chave, max(o.ordered_at) AS ultima
     FROM public.ecommerce_orders o
    WHERE o.ordered_at > now() - interval '10 days' AND public.ecommerce_status_e_venda(o.status)
    GROUP BY 1
 )
 SELECT p.bling_id,
        CASE WHEN x.k = 1 AND NOT (EXISTS (SELECT 1 FROM pronto WHERE pronto.fluxo = p.fluxo))
             THEN 'recompra'::text
             ELSE ('recompra_' || p.fluxo || '_d' || x.k) END AS etapa,
        x.k AS passo, p.fluxo, p.cliente_fone, p.cliente, p.pedido_loja, p.canal, p.total,
        p.entrega_cidade, p.entrega_uf, p.entregue_em, p.d1_em
   FROM public.carbo_recompra_pipeline p
   CROSS JOIN agora a
   CROSS JOIN cfg
   CROSS JOIN LATERAL (
     SELECT CASE
              WHEN p.coluna = 'ofertar' THEN 1
              WHEN p.d1_em IS NULL OR p.coluna !~ '^dia_[1-6]$' THEN NULL
              WHEN a.dia - (timezone('America/Sao_Paulo'::text, p.d1_em))::date = 6 THEN 7
              WHEN a.dia - (timezone('America/Sao_Paulo'::text, p.d1_em))::date = 5 THEN 6
              WHEN a.dia - (timezone('America/Sao_Paulo'::text, p.d1_em))::date BETWEEN 1 AND 4
                   AND p.passo < 5 THEN p.passo + 1
              ELSE NULL
            END AS k
   ) x
  WHERE x.k IS NOT NULL
    AND x.k > p.passo
    AND p.fluxo IS NOT NULL
    AND (p.ultimo_em IS NULL OR (timezone('America/Sao_Paulo'::text, p.ultimo_em))::date < a.dia)
    AND (p.d1_em IS NULL OR a.hora >= (extract(hour FROM timezone('America/Sao_Paulo'::text, p.d1_em)))::int)
    AND NULLIF(btrim(COALESCE(p.cliente_fone, '')), '') IS NOT NULL
    -- Pediu para parar: sai de toda mensagem comercial (a lista "não contatar").
    AND NOT (EXISTS (SELECT 1 FROM public.carbo_wa_nao_contatar n
                      WHERE n.chave = public.carbo_fone_chave(p.cliente_fone) AND n.removido_em IS NULL))
    -- Carrinho aberto do mesmo telefone: PAUSA (a régua do carrinho fala primeiro).
    AND NOT (EXISTS (SELECT 1 FROM carrinhos k
                      WHERE k.chave = public.carbo_fone_chave(p.cliente_fone)
                        AND k.ultimo >= a.ts - make_interval(days => cfg.pausa_carrinho_dias)))
    -- Comprou na loja (Nuvemshop, PayT…) depois do Dia 1: sai NA HORA, antes de
    -- o pedido chegar ao Bling e o robô marcar "recomprou".
    AND NOT (EXISTS (SELECT 1 FROM compras k
                      WHERE k.chave = public.carbo_fone_chave(p.cliente_fone)
                        AND k.ultima > COALESCE(p.d1_em, a.ts - interval '3 days')));

grant select on public.carbo_recompra_devido to authenticated;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 5 — a fila passa a ler o passo do dia (texto VIVO, com trava)   ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- Três trocas, cada uma exigindo UMA ocorrência:
--   a) o ramo da recompra: `'recompra'::text,` vira `p.etapa,` e o FROM/WHERE
--      vira `FROM carbo_recompra_devido p` (o marco zero e as travas moram lá)
--   b) a prioridade: `recompra_*` é comercial (1), como a `recompra`
--   c) o 131049 do dia ANTERIOR volta a ser elegível (a Meta segura mensagem de
--      marketing para quem recebeu muitas — o PDF manda reenviar no dia seguinte)
do $$
declare
  v_def   text;
  v_opts  text;
  v_n     int;
  i_ini   int;
  i_sel   int;
  i_from  int;
  i_fim   int;
  v_ramo  text;
  v_novo  text;
  v_antes text;
begin
  select pg_get_viewdef(c.oid), array_to_string(c.reloptions, ', ')
    into v_def, v_opts
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'carbo_msg_fila' and c.relkind = 'v';
  if v_def is null then raise exception 'ABORTADO: view public.carbo_msg_fila não encontrada'; end if;
  if v_def ~ 'carbo_recompra_devido' then
    raise notice 'BLOCO 5: a fila já lê a carbo_recompra_devido — pulando';
    return;
  end if;
  v_antes := v_def;

  -- a) o ramo
  -- ⚠️ O viewdef escreve `'recompra'::text AS text,` (o nome da coluna vem do
  -- primeiro ramo da união); o `AS text` é opcional no padrão.
  v_n := regexp_count(v_def, '''recompra''::text(\s+AS\s+text)?,');
  if v_n <> 1 then raise exception 'ABORTADO (a): esperava 1 "''recompra''::text," na fila, achei %', v_n; end if;
  i_ini := regexp_instr(v_def, '''recompra''::text(\s+AS\s+text)?,');
  -- o SELECT do ramo é o último antes do rótulo
  i_sel := i_ini - 1 - strpos(reverse(left(v_def, i_ini - 1)), 'TCELES') - 4;
  if i_sel < 1 or substr(v_def, i_sel, 6) <> 'SELECT' then
    raise exception 'ABORTADO (a): não achei o SELECT do ramo da recompra';
  end if;
  i_fim := strpos(substr(v_def, i_ini), 'UNION ALL');
  if i_fim = 0 then raise exception 'ABORTADO (a): o ramo da recompra não é seguido de UNION ALL'; end if;
  i_fim := i_ini + i_fim - 1;
  v_ramo := substr(v_def, i_sel, i_fim - i_sel);
  if v_ramo !~ '^SELECT\s+p\.bling_id,\s+''recompra''::text(\s+AS\s+text)?,' then
    raise exception 'ABORTADO (a): o ramo não começa por "SELECT p.bling_id, ''recompra''::text,": %', left(v_ramo, 120);
  end if;
  v_n := regexp_count(v_ramo, 'FROM\s+(public\.)?carbo_recompra_pipeline\s+p\M');
  if v_n <> 1 then raise exception 'ABORTADO (a): esperava 1 FROM carbo_recompra_pipeline p no ramo, achei %', v_n; end if;
  if v_ramo ~ 'elegivel|bling2_esteira|carbo_carrinho_pipeline' then
    raise exception 'ABORTADO (a): o trecho recortado passou do ramo da recompra';
  end if;
  i_from := regexp_instr(v_ramo, 'FROM\s+(public\.)?carbo_recompra_pipeline\s+p\M');
  v_novo := regexp_replace(left(v_ramo, i_from - 1), '''recompra''::text(\s+AS\s+text)?,', 'p.etapa,')
            || 'FROM carbo_recompra_devido p' || E'\n        ';
  v_def := left(v_def, i_sel - 1) || v_novo || substr(v_def, i_fim);

  -- b) a prioridade
  v_n := regexp_count(v_def, '''recompra''::text\]\)');
  if v_n <> 1 then raise exception 'ABORTADO (b): esperava 1 "''recompra''::text])" na fila, achei %', v_n; end if;
  v_def := replace(v_def, '''recompra''::text])',
                   '''recompra''::text]) OR b.etapa ~~ ''recompra\_%''::text');

  -- c) o 131049 do dia anterior
  v_n := regexp_count(v_def, 'v\.status <> ''pendente''::text');
  if v_n <> 1 then raise exception 'ABORTADO (c): esperava 1 "v.status <> ''pendente''::text" na fila, achei %', v_n; end if;
  v_def := replace(v_def, 'v.status <> ''pendente''::text',
    'v.status <> ''pendente''::text AND NOT (v.status = ''falhou''::text AND v.erro_codigo = 131049'
    || ' AND v.etapa ~~ ''recompra\_%''::text'
    || ' AND (timezone(''America/Sao_Paulo''::text, v.enviado_em))::date < (timezone(''America/Sao_Paulo''::text, now()))::date)');

  insert into public.carbo_backup_viewdef (nome, def, opcoes, motivo)
  values ('carbo_msg_fila', v_antes, v_opts, '20261177 — antes da régua de 7 dias');

  execute format('create or replace view public.carbo_msg_fila %s as %s',
                 case when v_opts is null then '' else 'with (' || v_opts || ')' end,
                 rtrim(v_def, E'; \n'));

  -- A fila nova tem de RODAR (erro aqui desfaz a migração inteira).
  perform count(*) from public.carbo_msg_fila;
end $$;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 6 — os 14 templates (DESLIGADOS, aguardando a Meta)             ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- O CHECK de `etapa` é refeito a partir do BANCO: o que existe na tabela, a
-- lista conhecida e as 14 novas. Valor que só existisse no CHECK de produção
-- (sem linha) entra pela lista conhecida.
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

-- ⚠️ `link_checkout` SEM fallback = obrigatório: até o link ser cadastrado
-- (`carbo_recompra_definir_link`), a fila SEGURA o envio em vez de mandar
-- mensagem sem link. `primeiro_nome` sem nome vira "amigo", como no PDF.
insert into public.carbo_msg_templates
  (etapa, ativo, titulo, texto, atraso_min, instancia, canal_envio, meta_template_nome, meta_idioma,
   meta_variaveis, meta_status, meta_botao_url_de, numero_id, teto_diario, liberar_anteriores,
   hora_inicio, hora_fim, dias_uteis)
select v.etapa, false, v.titulo, v.texto, 0, r.instancia, 'meta', v.nome_meta, 'pt_BR',
       '[{"nome": "primeiro_nome", "de": "primeiro_nome", "fallback": "amigo"},
         {"nome": "link_checkout", "de": "link_checkout"}]'::jsonb,
       'PENDING', null, '1274076859132981', null, false,
       -- ⚠️ Sem `dias_uteis`: são 7 dias SEGUIDOS (o prazo do cupom vence no 7º).
       -- O link está no texto e nenhuma mensagem pede resposta.
       9, 18, false
  from
  (values
  ('recompra_sache_d1', 'carboze_recompra_sache_d1', 'Kit 10 Sachês · Dia 1 · Antes de acabar', $t$Ei {{primeiro_nome}}, seu último sachê de CarboZé já foi pro tanque? ⛽

É o Zé, do CarboZé 💚 Pelas minhas contas, o seu kit tá no fim: são 10 sachês, 10 abastecimentos da sua moto.

E no primeiro abastecimento sem a dose, a água volta a juntar no fundo do tanque.

Por você já ser cliente, sua reposição sai com *20% OFF, já aplicado* no link:

✅ Kit 10 Sachês por *R$47,92*. É como levar *2 sachês de graça*, com frete grátis.

👉 {{link_checkout}}

⏳ Vale por 7 dias. Depois disso, volta pro preço cheio.

Zé, do CarboZé 💚$t$),
  ('recompra_sache_d2', 'carboze_recompra_sache_d2', 'Kit 10 Sachês · Dia 2 · Não perder o que já fez', $t$Ô {{primeiro_nome}}, tanque de moto é pequeno. Pouca água ali dentro já é muita coisa. 🏍️

E os primeiros abastecimentos sem CarboZé você nem sente… é justamente aí que mora o problema.

Lá dentro a água volta a juntar, a borra volta a se formar e vai, aos pouquinhos, pro filtro e pro bico injetor.

Tudo o que você tratou nos últimos 100 litros começa a se perder.

Você não precisa recomeçar do zero. Só não pode parar agora.

Sua reposição com 20% OFF já tá pronta:
👉 {{link_checkout}}

Frete grátis, direto na sua casa.

Zé, do CarboZé 💚$t$),
  ('recompra_sache_d3', 'carboze_recompra_sache_d3', 'Kit 10 Sachês · Dia 3 · Um clique', $t$E aí, {{primeiro_nome}}, sua reposição já tá pronta. É só confirmar. 🙌

Separei o seu Kit Sachês com os 20% de cliente já aplicados no link.

Você abre, confirma o pagamento e pronto. Leva menos de 1 minuto.

👉 {{link_checkout}}

✅ Kit 10 Sachês por *R$47,92*, com frete grátis, direto na sua casa.

Zé, do CarboZé 💚$t$),
  ('recompra_sache_d4', 'carboze_recompra_sache_d4', 'Kit 10 Sachês · Dia 4 · Hábito', $t$Fala, {{primeiro_nome}}, quer um jeito de nunca mais esquecer a dose antes da bomba? ⛽

Deixa uns sachês no baú da moto.

Parou no posto, abre o sachê, despeja no tanque e abastece. 10 segundos, e o combustível já entra tratado.

Quem faz isso nunca fica um abastecimento sequer sem CarboZé.

Sua reposição com 20% OFF já tá aqui: 👉 {{link_checkout}}

✅ Kit 10 Sachês por *R$47,92*, com frete grátis.

Zé, do CarboZé 💚$t$),
  ('recompra_sache_d5', 'carboze_recompra_sache_d5', 'Kit 10 Sachês · Dia 5 · Sentiu diferença?', $t$Ei {{primeiro_nome}}, você sentiu diferença na sua moto com o CarboZé? 🤔

Se sentiu, você já sabe o que acontece quando continua.

Se ainda não reparou, faz sentido: o CarboZé age desde o primeiro abastecimento, mas a diferença fica mais clara com o uso contínuo. Parar agora é parar justamente quando começa a aparecer.

Pra repor com os seus 20%: 👉 {{link_checkout}}

✅ Kit 10 Sachês por *R$47,92*, com frete grátis.

Zé, do CarboZé 💚$t$),
  ('recompra_sache_d6', 'carboze_recompra_sache_d6', 'Kit 10 Sachês · Dia 6 · Prova + amanhã acaba', $t$Ô {{primeiro_nome}}, sabe quem nunca deixa o tanque sem CarboZé? 🚛

Quem vive de rodar.

Empresas como Grupo Duarte, Riograndense e MB Limpeza Urbana tratam o combustível de todo veículo, todo abastecimento. Sem pausa.

Elas medem cada litro na planilha, e já viram o que você também viu: o resultado vem de não parar.

⏳ Seus 20% de cliente acabam *amanhã à meia-noite*.

👉 {{link_checkout}}

✅ Kit 10 Sachês por *R$47,92*, com frete grátis.

Zé, do CarboZé 💚$t$),
  ('recompra_sache_d7', 'carboze_recompra_sache_d7', 'Kit 10 Sachês · Dia 7 · Último dia', $t$Atenção, {{primeiro_nome}}: hoje é o último dia dos seus 20% OFF. ⏰

À meia-noite o link volta pro preço cheio de R$59,90, e eu não te chamo mais sobre essa reposição.

Com o desconto, cada sachê sai *R$4,79*. Menos que um café na conveniência do posto.

Cada abastecimento sem CarboZé é mais água no fundo do tanque da sua moto.

👉 {{link_checkout}}

Ou você trata agora, ou paga depois. ⛽

Zé, do CarboZé 💚$t$),
  ('recompra_frasco_d1', 'carboze_recompra_frasco_d1', 'Kit 5 Frascos · Dia 1 · Antes de acabar', $t$Ei {{primeiro_nome}}, seu último frasco de CarboZé já foi pro tanque? ⛽

É o Zé, do CarboZé 💚 Pelas minhas contas, o seu kit tá no fim: são 5 frascos, 500 litros tratados, uns 10 tanques cheios.

E no primeiro abastecimento sem a dose, a água volta a juntar no fundo do tanque.

Por você já ser cliente, sua reposição sai com *20% OFF, já aplicado* no link:

✅ Kit 5 Frascos por *R$119,60*. É como levar *1 frasco de graça*, com frete grátis.

👉 {{link_checkout}}

⏳ Vale por 7 dias. Depois disso, volta pro preço cheio.

Zé, do CarboZé 💚$t$),
  ('recompra_frasco_d2', 'carboze_recompra_frasco_d2', 'Kit 5 Frascos · Dia 2 · Não perder o que já fez', $t$Ô {{primeiro_nome}}, os primeiros tanques sem CarboZé você nem sente… 🚗

E é exatamente aí que mora o problema.

Lá dentro a água volta a juntar no fundo. A borra volta a se formar. E vai, aos pouquinhos, pro filtro e pros bicos injetores.

Tudo o que você tratou nos últimos 500 litros começa a se perder, tanque após tanque.

E quando a borra chega nos bicos, a conta da oficina é bem maior que um kit de CarboZé.

Você não precisa recomeçar do zero. Só não pode parar agora.

Sua reposição com 20% OFF já tá pronta:
👉 {{link_checkout}}

Frete grátis, direto na sua casa.

Zé, do CarboZé 💚$t$),
  ('recompra_frasco_d3', 'carboze_recompra_frasco_d3', 'Kit 5 Frascos · Dia 3 · Um clique', $t$E aí, {{primeiro_nome}}, sua reposição já tá pronta. É só confirmar. 🙌

Separei o seu Kit Frascos com os 20% de cliente já aplicados no link.

Você abre, confirma o pagamento e pronto. Leva menos de 1 minuto.

👉 {{link_checkout}}

✅ Kit 5 Frascos por *R$119,60*, com frete grátis, direto na sua casa.

Zé, do CarboZé 💚$t$),
  ('recompra_frasco_d4', 'carboze_recompra_frasco_d4', 'Kit 5 Frascos · Dia 4 · Hábito', $t$Fala, {{primeiro_nome}}, quer um jeito de nunca mais esquecer a dose antes da bomba? ⛽

Deixa um frasco no porta-luvas.

Parou no posto, coloca no tanque, depois abastece. 10 segundos, e o combustível já entra tratado.

Quem faz isso nunca fica um tanque sequer sem CarboZé.

Sua reposição com 20% OFF já tá aqui: 👉 {{link_checkout}}

✅ Kit 5 Frascos por *R$119,60*, com frete grátis.

Zé, do CarboZé 💚$t$),
  ('recompra_frasco_d5', 'carboze_recompra_frasco_d5', 'Kit 5 Frascos · Dia 5 · Sentiu diferença?', $t$Ei {{primeiro_nome}}, você sentiu diferença no seu carro com o CarboZé? 🤔

Se sentiu, você já sabe o que acontece quando continua.

Se ainda não reparou, faz sentido: o CarboZé age desde o primeiro tanque, mas a diferença fica mais clara com o uso contínuo. Parar agora é parar justamente quando começa a aparecer.

Pra repor com os seus 20%: 👉 {{link_checkout}}

✅ Kit 5 Frascos por *R$119,60*, com frete grátis.

Zé, do CarboZé 💚$t$),
  ('recompra_frasco_d6', 'carboze_recompra_frasco_d6', 'Kit 5 Frascos · Dia 6 · Prova + amanhã acaba', $t$Ô {{primeiro_nome}}, sabe quem nunca deixa o tanque sem CarboZé? 🚛

Quem tem frota.

Gestor de frota não compra no achismo. Ele olha planilha de consumo, conta de manutenção, caminhão parado na oficina.

E empresas como Grupo Duarte, Riograndense e MB Limpeza Urbana tratam o combustível de todo veículo, todo abastecimento. Sem pausa.

⏳ Seus 20% de cliente acabam *amanhã à meia-noite*.

👉 {{link_checkout}}

✅ Kit 5 Frascos por *R$119,60*, com frete grátis.

Zé, do CarboZé 💚$t$),
  ('recompra_frasco_d7', 'carboze_recompra_frasco_d7', 'Kit 5 Frascos · Dia 7 · Último dia', $t$Atenção, {{primeiro_nome}}: hoje é o último dia dos seus 20% OFF. ⏰

À meia-noite o link volta pro preço cheio de R$149,50, e eu não te chamo mais sobre essa reposição.

Com o desconto, cada litro tratado sai *24 centavos*. Num abastecimento de R$100, o CarboZé custa menos de R$4.

Cada tanque sem CarboZé é mais água acumulando no fundo do seu tanque.

👉 {{link_checkout}}

Ou você trata agora, ou paga depois. ⛽

Zé, do CarboZé 💚$t$)
  ) as v(etapa, nome_meta, titulo, texto)
  left join (select instancia from public.carbo_msg_templates where etapa = 'recompra') r on true
on conflict (etapa) do nothing;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 7 — o link do checkout de cada fluxo                            ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- O link é o MESMO para os 7 dias de um fluxo (o kit com os 20% de cliente),
-- então ele mora na reserva (`fallback`) da variável `link_checkout` dos sete.
-- Roda-se no SQL Editor, uma vez por fluxo:
--   select public.carbo_recompra_definir_link('sache',  'https://…');
--   select public.carbo_recompra_definir_link('frasco', 'https://…');
create or replace function public.carbo_recompra_definir_link(p_fluxo text, p_link text)
returns int
language plpgsql security definer set search_path = public as $$
declare
  v int;
begin
  if p_link is null or p_link !~ '^https://\S+$' then
    raise exception 'Link inválido: tem de começar com https:// e não ter espaço';
  end if;
  if not exists (select 1 from carbo_recompra_fluxos where fluxo = p_fluxo) then
    raise exception 'Fluxo desconhecido: % (use sache ou frasco)', p_fluxo;
  end if;
  update carbo_msg_templates t
     set meta_variaveis = (
           select jsonb_agg(case when e->>'nome' = 'link_checkout'
                                 then e || jsonb_build_object('fallback', p_link) else e end
                            order by o)
             from jsonb_array_elements(t.meta_variaveis) with ordinality a(e, o)),
         atualizado_em = now()
   where t.etapa ~ ('^recompra_' || p_fluxo || '_d[1-7]$');
  get diagnostics v = row_count;
  if v <> 7 then raise exception 'Esperava as 7 mensagens do fluxo %, achei %', p_fluxo, v; end if;
  return v;
end $$;
revoke all on function public.carbo_recompra_definir_link(text, text) from public, anon, authenticated;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 8 — "pediu para parar" vira "não contatar" sozinho              ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- Duas portas, as duas para a MESMA lista que o botão de Conversas usa:
--   1. o cliente escreveu SÓ um pedido de parada ("parar", "sair", "não quero
--      mais", "me tira da lista"…) — a mensagem INTEIRA, nunca uma palavra
--      solta no meio de uma frase ("pode parar de mandar o boleto?" não conta)
--   2. a Meta recusou com 131050: a pessoa desligou as ofertas da empresa no
--      próprio WhatsApp
-- ⚠️ Vale para o COMERCIAL (recompra e carrinho): os avisos do pedido seguem.
-- ⚠️ Desmarcar continua sendo à mão; só um pedido NOVO depois do desmarcar
-- marca de novo.
create or replace function public.carbo_wa_texto_pede_parar(p text)
returns boolean
language sql immutable set search_path = public as $$
  select btrim(regexp_replace(
           translate(lower(coalesce(p, '')),
                     'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc'),
           '[^a-z]+', ' ', 'g'))
         ~ ('^(por favor |pfv |pf )?'
            || '(parar|pare|para|sair|stop|cancelar|cancela|descadastrar|descadastre|'
            || 'remover|remova|me remova|me remove|me tira|me tire|'
            || 'sem interesse|nao tenho interesse|nao tenho mais interesse|'
            || 'nao quero|nao quero mais|nao quero receber|nao quero receber mais|nao quero mais receber|'
            || 'nao mande mais|nao me mande mais|nao envie mais|nao me envie mais|'
            || '(pare|para) de (me )?(mandar|enviar))'
            || '( mensagem| mensagens)?( da (sua )?lista| dessa lista| desta lista)?'
            || '( por favor| pfv| pf| obrigad[oa])?$');
$$;

create table if not exists public.carbo_wa_optout_estado (
  id             boolean primary key default true check (id),
  ultima_leitura timestamptz
);
insert into public.carbo_wa_optout_estado (id) values (true) on conflict do nothing;
alter table public.carbo_wa_optout_estado enable row level security;

create or replace function public.carbo_wa_optout_automatico()
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_ini   timestamptz := clock_timestamp();
  v_desde timestamptz;
  v_msg   int := 0;
  v_meta  int := 0;
begin
  if not pg_try_advisory_xact_lock(hashtext('carbo_wa_optout_automatico')) then
    return jsonb_build_object('pulou', true);
  end if;
  -- ⚠️ Na PRIMEIRA rodada lê o histórico inteiro: quem já pediu para parar
  -- antes desta migração também não pode receber a régua nova.
  select ultima_leitura - interval '10 minutes' into v_desde from carbo_wa_optout_estado where id;
  v_desde := coalesce(v_desde, '-infinity'::timestamptz);

  insert into carbo_wa_nao_contatar (chave, wa_id, numero_id, motivo)
  select distinct on (public.carbo_fone_chave(m.wa_id))
         public.carbo_fone_chave(m.wa_id), m.wa_id, m.numero_id,
         'pediu para parar: "' || left(btrim(m.texto), 80) || '"'
    from carbo_wa_mensagens m
   where m.direcao = 'entrada'
     and m.ocorrido_em >= v_desde
     and public.carbo_wa_texto_pede_parar(m.texto)
     and public.carbo_fone_chave(m.wa_id) is not null
     and not exists (select 1 from carbo_wa_nao_contatar n
                      where n.chave = public.carbo_fone_chave(m.wa_id)
                        and (n.removido_em is null or n.removido_em >= m.ocorrido_em))
   order by public.carbo_fone_chave(m.wa_id), m.ocorrido_em desc
  on conflict (chave) do update
     set removido_em = null, removido_por = null, marcado_por = null,
         marcado_em = now(), motivo = excluded.motivo, wa_id = excluded.wa_id, numero_id = excluded.numero_id;
  get diagnostics v_msg = row_count;

  insert into carbo_wa_nao_contatar (chave, wa_id, numero_id, motivo)
  select distinct on (public.carbo_fone_chave(coalesce(v.wa_id, v.telefone)))
         public.carbo_fone_chave(coalesce(v.wa_id, v.telefone)), v.wa_id, v.numero_id,
         'desligou as ofertas da empresa no WhatsApp (Meta 131050)'
    from carbo_msg_envios v
   where v.erro_codigo = 131050
     and coalesce(v.enviado_em, v.detectado_em) >= v_desde
     and public.carbo_fone_chave(coalesce(v.wa_id, v.telefone)) is not null
     and not exists (select 1 from carbo_wa_nao_contatar n
                      where n.chave = public.carbo_fone_chave(coalesce(v.wa_id, v.telefone))
                        and (n.removido_em is null or n.removido_em >= coalesce(v.enviado_em, v.detectado_em)))
   order by public.carbo_fone_chave(coalesce(v.wa_id, v.telefone)), coalesce(v.enviado_em, v.detectado_em) desc
  on conflict (chave) do update
     set removido_em = null, removido_por = null, marcado_por = null,
         marcado_em = now(), motivo = excluded.motivo;
  get diagnostics v_meta = row_count;

  update carbo_wa_optout_estado set ultima_leitura = v_ini where id;
  return jsonb_build_object('pediram_para_parar', v_msg, 'meta_131050', v_meta);
end $$;
revoke all on function public.carbo_wa_optout_automatico() from public, anon, authenticated;

select cron.unschedule(jobid) from cron.job where jobname = 'wa-optout-automatico-10min';
select cron.schedule('wa-optout-automatico-10min', '7-59/10 * * * *',
                     $$select public.carbo_wa_optout_automatico()$$);
-- A primeira rodada já, para o histórico entrar antes de qualquer Dia 1.
select public.carbo_wa_optout_automatico();


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ CONFERÊNCIA (leitura — supabase/consultas/recompra_7_dias.sql)        ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- Os blocos que MEDEM ficam em `supabase/consultas/recompra_7_dias.sql`:
-- quantos pedidos em cada fluxo, quem está em que dia, o que sairia se os
-- templates fossem ligados agora, e o tempo da fila.


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO R — VOLTA (rodar só se precisar)                                ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- A volta é a FILA (ela deixa de ler a régua nova); a pipeline pode ficar —
-- as colunas novas estão no fim e a `coluna` antiga "ofertar" continua
-- significando "o próximo a ofertar".
-- update public.carbo_msg_templates set ativo = false where etapa ~ '^recompra_[a-z]+_d[1-7]$';
-- do $$ declare v record; begin
--   select def, opcoes into v from public.carbo_backup_viewdef
--    where nome = 'carbo_msg_fila' and motivo like '20261177%' order by id desc limit 1;
--   if v.def is null then raise exception 'backup da fila não encontrado'; end if;
--   execute format('create or replace view public.carbo_msg_fila %s as %s',
--     case when v.opcoes is null then '' else 'with (' || v.opcoes || ')' end, rtrim(v.def, E'; \n'));
-- end $$;
-- select cron.unschedule(jobid) from cron.job where jobname = 'wa-optout-automatico-10min';
