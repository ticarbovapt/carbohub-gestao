-- ═══════════════════════════════════════════════════════════════════════════
-- FASE 2 — casar o envio do Melhor Envio com o pedido do Bling
--
-- ⚠️ ESTE ARQUIVO É RECONSTITUIÇÃO. O SQL abaixo foi rodado em produção pelo
-- SQL Editor em 20/08/2026, e ficou fora do repositório — o repo passou a não
-- descrever a produção. É exatamente o modo de falha que o CLAUDE.md descreve
-- para arquivos replicados: o que ninguém sabe que existe só é mantido por
-- acaso. Tudo aqui é idempotente; rodar de novo não muda nada.
--
-- ── Por que SQL puro e não edge function ──────────────────────────────────
--
-- É banco→banco, como a ponte do Bling 2. Não depende de deploy, de segredo
-- nem de a função estar de pé. Entra rodando a migração.
--
-- ── A cascata ─────────────────────────────────────────────────────────────
--
--   1. bling_id_ref  o id interno do Bling, que vem na TAG da integração
--   2. nf_chave      44 dígitos, únicos por definição fiscal
--   3. pedido_loja   número do pedido na loja  — exige candidato ÚNICO
--   4. cpf_valor     CPF + valor               — exige candidato ÚNICO
--
-- As duas primeiras são identidade, não semelhança: ambiguidade é impossível.
-- As duas últimas são heurística, e por isso só casam com candidato único.
--
-- Medido na primeira rodada: 311 de 320 (97%), sem uma única confirmação
-- humana. `bling_id_ref` sozinha resolveu 300 — ela não estava no desenho
-- original, foram os dados que a revelaram.
-- ═══════════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — a porta nova no CHECK                                       ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

alter table public.melhorenvio_envios
  drop constraint if exists melhorenvio_envios_vinculo_via_check;

alter table public.melhorenvio_envios
  add constraint melhorenvio_envios_vinculo_via_check
  check (vinculo_via is null or vinculo_via in
    ('bling_id_ref','nf_chave','pedido_loja','cpf_valor','cpf_unico','manual'));


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — a conciliação                                               ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

create or replace function public.carbo_melhorenvio_conciliar()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  n1 int := 0; n2 int := 0; n3 int := 0; n4 int := 0; namb int := 0;
begin
  -- ⚠️ NUNCA toca em 'confirmado', 'manual' nem 'ignorado'. Só tenta o que
  -- ainda não foi resolvido e o que ficou ambíguo — este pode virar resolvido
  -- quando o dado melhorar (a NF chega depois da etiqueta, por exemplo).
  --
  -- Sem esta trava, uma rodada desfaria a conciliação que uma pessoa fez à mão
  -- na tela. É o mesmo cuidado do upsert do espelho, que deixa as colunas de
  -- vínculo de fora.

  -- ── Porta 1: o id interno do Bling, vindo da tag da integração ───────────
  -- Exata e direta: não casa número nenhum, é a mesma identidade. Ambiguidade
  -- é impossível aqui — bling_id é chave primária do outro lado.
  update public.melhorenvio_envios e
  set bling_id = o.bling_id, vinculo_status = 'confirmado',
      vinculo_via = 'bling_id_ref', vinculo_em = now()
  from public.bling2_orders o
  where e.vinculo_status in ('sem_match','ambiguo')
    and e.bling_id_ref is not null
    and o.bling_id = e.bling_id_ref;
  get diagnostics n1 = row_count;

  -- ── Porta 2: a chave da NF-e ─────────────────────────────────────────────
  update public.melhorenvio_envios e
  set bling_id = o.bling_id, vinculo_status = 'confirmado',
      vinculo_via = 'nf_chave', vinculo_em = now()
  from public.bling2_orders o
  join public.bling2_nfe n on n.bling_id = o.nf_bling_id
  where e.vinculo_status in ('sem_match','ambiguo')
    and e.nf_chave is not null
    and upper(n.chave_acesso) = upper(e.nf_chave);
  get diagnostics n2 = row_count;

  -- ── Porta 3: o número do pedido na loja ──────────────────────────────────
  -- ⚠️ Aqui a ambiguidade JÁ É POSSÍVEL: o mesmo `numero_loja` pode aparecer
  -- em mais de um pedido do Bling (reimportação, pedido refeito). Por isso o
  -- `count(*) = 1` — só casa quando existe UM candidato.
  update public.melhorenvio_envios e
  set bling_id = c.bling_id, vinculo_status = 'confirmado',
      vinculo_via = 'pedido_loja', vinculo_em = now()
  from (
    select o.numero_loja, min(o.bling_id) as bling_id
    from public.bling2_orders o
    where o.numero_loja is not null
    group by o.numero_loja having count(*) = 1
  ) c
  where e.vinculo_status in ('sem_match','ambiguo')
    and e.pedido_loja is not null
    and c.numero_loja = e.pedido_loja;
  get diagnostics n3 = row_count;

  -- ── Porta 4: CPF + valor ─────────────────────────────────────────────────
  -- ⚠️ A última automática, e a única que pode errar. Só casa com candidato
  -- ÚNICO — é exatamente o caso de dois pedidos do mesmo CPF com valores
  -- diferentes que o `count(*) = 1` protege: se os dois tivessem o mesmo
  -- valor, nenhum seria escolhido.
  update public.melhorenvio_envios e
  set bling_id = c.bling_id, vinculo_status = 'confirmado',
      vinculo_via = 'cpf_valor', vinculo_em = now()
  from (
    select regexp_replace(coalesce(ct.cpf_cnpj,''), '\D', '', 'g') as doc,
           round(o.total, 2) as total, min(o.bling_id) as bling_id
    from public.bling2_orders o
    join public.bling2_contacts ct on ct.bling_id = o.contato_id
    where ct.cpf_cnpj is not null
    group by 1, 2 having count(*) = 1
  ) c
  where e.vinculo_status in ('sem_match','ambiguo')
    and e.destinatario_doc is not null
    and e.valor is not null
    and c.doc = e.destinatario_doc
    and c.total = round(e.valor, 2);
  get diagnostics n4 = row_count;

  -- ── O que sobrou COM candidato vira ambíguo, não sem_match ───────────────
  -- ⚠️ A diferença importa para quem vai olhar a tela: "ambíguo" é trabalho
  -- humano de um clique; "sem_match" é envio que o sistema não sabe de onde
  -- veio. Misturar os dois faz a fila de trabalho parecer maior do que é.
  update public.melhorenvio_envios e
  set vinculo_status = 'ambiguo'
  where e.vinculo_status = 'sem_match'
    and e.destinatario_doc is not null
    and exists (
      select 1 from public.bling2_orders o
      join public.bling2_contacts ct on ct.bling_id = o.contato_id
      where regexp_replace(coalesce(ct.cpf_cnpj,''), '\D', '', 'g') = e.destinatario_doc
    );
  get diagnostics namb = row_count;

  return jsonb_build_object(
    'bling_id_ref', n1, 'nf_chave', n2, 'pedido_loja', n3,
    'cpf_valor', n4, 'viraram_ambiguo', namb);
end $$;

comment on function public.carbo_melhorenvio_conciliar is
  'Casa envio do Melhor Envio com pedido do Bling, em cascata de portas EXATAS. Idempotente e nunca toca em confirmado/manual/ignorado — uma rodada não pode desfazer o que uma pessoa conciliou a mao. Porta 3 e 4 exigem candidato UNICO: com dois, vira ambiguo e vai para confirmacao humana.';


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 3 — a cadência                                                  ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
--
-- ⚠️ SEM `net.http_post` na conciliação: é SQL puro, então o cron chama a
-- função direto. Não depende de segredo, de deploy nem de a edge function
-- estar de pé — mesma razão pela qual a ponte do Bling 2 é SQL.
--
-- 5 min e não 15: ela é barata (quatro UPDATEs indexados) e precisa ser mais
-- rápida que o espelho, senão um envio novo passa até 15 min sem vínculo — e
-- SEM VÍNCULO O CARD NÃO ANDA e a Fase 3 não dispara.

do $$
declare v_seg text; j bigint;
begin
  select valor into v_seg from private.cron_config where chave = 'rastreio_cron_secret';
  if v_seg is null or v_seg = '' then
    raise exception 'Falta o segredo em private.cron_config.';
  end if;

  for j in select jobid from cron.job where jobname = 'melhor-envio-envios-15min' loop
    perform cron.unschedule(j);
  end loop;

  -- ⚠️ Minuto :06 para não empilhar com order_details (:03), carrinhos (:04)
  -- nem nfe_recheck (:07). São até 500 envios por rodada, com pausa entre
  -- páginas — cabe folgado na janela.
  perform cron.schedule(
    'melhor-envio-envios-15min', '6-59/15 * * * *',
    format($cmd$
      select net.http_post(
        url     := 'https://wpkfirmapxevzpxjovjr.supabase.co/functions/v1/melhor-envio-envios',
        headers := jsonb_build_object('Content-Type','application/json','X-Cron-Secret', %L),
        body    := '{"source":"cron"}'::jsonb,
        timeout_milliseconds := 60000
      );
    $cmd$, v_seg)
  );
end $$;

do $$
declare j bigint;
begin
  for j in select jobid from cron.job where jobname = 'melhorenvio-conciliar-5min' loop
    perform cron.unschedule(j);
  end loop;
  perform cron.schedule('melhorenvio-conciliar-5min', '*/5 * * * *',
    'select public.carbo_melhorenvio_conciliar();');
end $$;
