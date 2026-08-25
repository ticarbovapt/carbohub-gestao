-- ═══════════════════════════════════════════════════════════════════════════
-- A conciliação do Melhor Envio: uma porta que nunca acertou, e um cron mudo
--
-- Sem `bling_id` o envio é invisível para TUDO: a `melhorenvio_envio_vigente`
-- começa com `where e.bling_id is not null`, a esteira lê dela, e nenhuma tela
-- do produto lê a tabela crua. Envio órfão não existe para nenhum contador,
-- nenhum alerta, nenhuma coluna.
--
-- ── DEFEITO 1: a porta 4 compara grandezas diferentes ────────────────────
--
-- Ela exige `round(o.total,2) = round(e.valor,2)`, onde:
--   · `e.valor` é o `insurance_value` — o valor DECLARADO DO CONTEÚDO;
--   · `o.total` é o total do pedido, que INCLUI o frete cobrado do cliente.
--
-- Medido em 25/08/2026, sobre os órfãos com CPF conhecido no Bling:
--
--     pares_doc 36 · bate_com_total 0 · bate_com_produtos 16
--
-- ZERO. A porta nunca acertou uma vez desde que existe. E o modo de falhar é o
-- pior possível: os envios caem em `ambiguo`, que a modelagem reserva para
-- "sei de quem é, não sei de qual pedido" — trabalho humano de um clique. A
-- fila de trabalho parecia grande por comparação errada, não por ambiguidade.
--
-- O conserto é aceitar `total_produtos` TAMBÉM, mantendo o `total` (pedido com
-- frete grátis casa pelos dois, e há histórico casado assim).
--
-- ⚠️ A exigência de candidato ÚNICO fica, e agora sobre os dois valores
-- juntos: se um pedido casa pelo total e outro pelo total_produtos, são dois
-- candidatos e nenhum é escolhido. Afrouxar a comparação sem apertar a
-- unicidade transformaria um erro de "não casa nunca" num de "casa errado" —
-- e vínculo errado é pior que vínculo nenhum, porque dispara e-mail de
-- fulfillment e WhatsApp para o cliente trocado.
--
-- ── DEFEITO 2: o primeiro palpite vence para sempre ──────────────────────
--
-- Todas as quatro portas filtram `vinculo_status in ('sem_match','ambiguo')`.
-- Assim que a porta 4 (a mais fraca) grava `confirmado`, a porta 1 (a exata)
-- nunca mais é tentada — mesmo quando o dado melhora. E ele melhora sempre: o
-- espelho reescreve `bling_id_ref` a cada rodada e pedidos novos entram de
-- minuto em minuto.
--
-- Cenário já vivido aqui: durante as 15 h em que o Bling 2 ficou parado, um
-- pedido novo não está espelhado. A porta 1 falha (o pedido não existe ainda),
-- uma porta fraca acha um pedido ANTIGO do mesmo cliente com o mesmo valor —
-- base de recompra, mesmo kit — e grava. Quando o pedido certo chega, nada
-- reexamina. Vínculo errado, permanente, silencioso.
--
-- Agora as duas portas EXATAS (id do Bling e chave da NF) sobrepõem vínculo
-- feito por porta fraca. ⚠️ `manual` e `ignorado` continuam intocáveis: uma
-- rodada não pode desfazer o que uma pessoa decidiu.
--
-- ── DEFEITO 3: a função devolve um relatório e o cron joga fora ──────────
--
--     select public.carbo_melhorenvio_conciliar();
--
-- Ela monta os contadores por porta e o retorno vai para o vazio. Não há
-- tabela de log. O `pg_cron` marca `succeeded` a cada 5 minutos mesmo que a
-- função case zero envios por semanas — o mesmo `succeeded` que já custou 25 h
-- de sincronismo morto neste projeto.
--
-- Foi por isso que "4 de 6 etiquetas vencidas sem vínculo" só apareceu quando
-- alguém montou planilha à mão.
--
-- ⚠️ RODE EM BLOCOS.
-- ═══════════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — o retrato ANTES                                             ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

select
  count(*)                                             as envios,
  count(*) filter (where bling_id is null)             as orfaos,
  count(*) filter (where vinculo_status = 'sem_match') as sem_match,
  count(*) filter (where vinculo_status = 'ambiguo')   as ambiguo,
  count(*) filter (where vinculo_via = 'bling_id_ref') as via_id_do_bling,
  count(*) filter (where vinculo_via = 'nf_chave')     as via_nf,
  count(*) filter (where vinculo_via = 'pedido_loja')  as via_pedido_loja,
  count(*) filter (where vinculo_via = 'cpf_valor')    as via_cpf_valor,
  count(*) filter (where vinculo_via = 'manual')       as via_manual
from public.melhorenvio_envios;

-- ⚠️ TEM DE VIR VAZIO. Toda linha aqui é vínculo errado provado: o envio traz
-- o id do pedido na tag da integração e está ligado a OUTRO pedido.
select me_id, vinculo_via, bling_id as ligado_em, bling_id_ref as deveria_ser,
       destinatario_nome, vinculo_em::date
from public.melhorenvio_envios
where bling_id_ref is not null and bling_id is not null and bling_id <> bling_id_ref;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — o log, para o silêncio deixar de ser possível               ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

create table if not exists public.melhorenvio_conciliar_log (
  id           bigint generated always as identity primary key,
  rodou_em     timestamptz not null default now(),
  resultado    jsonb       not null,
  orfaos_antes integer,
  orfaos_depois integer
);

comment on table public.melhorenvio_conciliar_log is
  'Uma linha por rodada da conciliação. Existe porque `pg_cron` marcando succeeded não prova que a função fez alguma coisa — ela pode casar zero envios por semanas sem deixar sinal. `orfaos_depois` parado por dias é o alarme.';

create index if not exists melhorenvio_conciliar_log_data_idx
  on public.melhorenvio_conciliar_log (rodou_em desc);

alter table public.melhorenvio_conciliar_log enable row level security;
drop policy if exists melhorenvio_conciliar_log_read on public.melhorenvio_conciliar_log;
-- ⚠️ `carbo_e_time_interno()`, não `using (true)`: o portal de lojas e o de
-- licenciados usam a MESMA tabela `profiles`, e `authenticated` inclui os dois.
create policy melhorenvio_conciliar_log_read on public.melhorenvio_conciliar_log
  for select to authenticated using (public.carbo_e_time_interno());


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 3 — a função                                                    ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

create or replace function public.carbo_melhorenvio_conciliar()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  n1 int := 0; n2 int := 0; n3 int := 0; n4 int := 0; namb int := 0;
  v_antes int; v_depois int; v_res jsonb;
begin
  select count(*) into v_antes from public.melhorenvio_envios where bling_id is null;

  -- ── Porta 1: o id interno do Bling, vindo da tag da integração ───────────
  -- Exata e direta: não casa número nenhum, é a mesma identidade. Ambiguidade
  -- é impossível — `bling_id` é chave primária do outro lado.
  --
  -- ⚠️ Ela agora SOBREPÕE vínculo feito por porta fraca. Sem isso, o primeiro
  -- palpite vence para sempre e o dado que melhora não é reaproveitado.
  -- `manual` e `ignorado` seguem intocáveis.
  update public.melhorenvio_envios e
  set bling_id = o.bling_id, vinculo_status = 'confirmado',
      vinculo_via = 'bling_id_ref', vinculo_em = now()
  from public.bling2_orders o
  where (e.vinculo_status in ('sem_match','ambiguo')
         or (e.vinculo_status = 'confirmado'
             and e.vinculo_via in ('pedido_loja','cpf_valor')))
    and e.bling_id_ref is not null
    and o.bling_id = e.bling_id_ref
    -- Não conta como trabalho reescrever o que já está certo.
    and e.bling_id is distinct from o.bling_id;
  get diagnostics n1 = row_count;

  -- ── Porta 2: a chave da NF-e ─────────────────────────────────────────────
  -- Também exata (44 dígitos, a mesma dos dois lados), então também sobrepõe
  -- porta fraca.
  update public.melhorenvio_envios e
  set bling_id = o.bling_id, vinculo_status = 'confirmado',
      vinculo_via = 'nf_chave', vinculo_em = now()
  from public.bling2_orders o
  join public.bling2_nfe n on n.bling_id = o.nf_bling_id
  where (e.vinculo_status in ('sem_match','ambiguo')
         or (e.vinculo_status = 'confirmado'
             and e.vinculo_via in ('pedido_loja','cpf_valor')))
    and e.nf_chave is not null
    and upper(n.chave_acesso) = upper(e.nf_chave)
    and e.bling_id is distinct from o.bling_id;
  get diagnostics n2 = row_count;

  -- ── Porta 3: o número do pedido na loja ──────────────────────────────────
  -- ⚠️ Aqui a ambiguidade JÁ É POSSÍVEL: o mesmo `numero_loja` pode aparecer
  -- em mais de um pedido do Bling (reimportação, pedido refeito). Por isso o
  -- `count(*) = 1` — só casa quando existe UM candidato. Não sobrepõe nada.
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
  --
  -- ⚠️ O CONSERTO ESTÁ AQUI. `e.valor` é o valor DECLARADO DO CONTEÚDO
  -- (`insurance_value`), e ele bate com o total do pedido SEM o frete. Comparar
  -- só com `o.total` fazia a porta errar em todo pedido com frete cobrado —
  -- medido: 0 acertos em 36 pares.
  --
  -- Os dois valores entram como candidatos, e a unicidade é conferida DEPOIS,
  -- sobre o conjunto: pedido que casa pelo total e outro que casa pelo
  -- total_produtos são DOIS candidatos, e aí nenhum é escolhido.
  update public.melhorenvio_envios e
  set bling_id = c.bling_id, vinculo_status = 'confirmado',
      vinculo_via = 'cpf_valor', vinculo_em = now()
  from (
    select doc, valor_ref, min(bling_id) as bling_id
    from (
      -- `union` (não `all`): o mesmo pedido entra uma vez por valor distinto,
      -- e pedido com frete grátis tem total = total_produtos, então entra uma
      -- vez só e não se torna "dois candidatos" contra si mesmo.
      select regexp_replace(coalesce(ct.cpf_cnpj,''), '\D', '', 'g') as doc,
             round(o.total, 2) as valor_ref, o.bling_id
      from public.bling2_orders o
      join public.bling2_contacts ct on ct.bling_id = o.contato_id
      where ct.cpf_cnpj is not null and o.total is not null
      union
      select regexp_replace(coalesce(ct.cpf_cnpj,''), '\D', '', 'g'),
             round(o.total_produtos, 2), o.bling_id
      from public.bling2_orders o
      join public.bling2_contacts ct on ct.bling_id = o.contato_id
      where ct.cpf_cnpj is not null and o.total_produtos is not null
    ) x
    group by doc, valor_ref
    having count(distinct bling_id) = 1
  ) c
  where e.vinculo_status in ('sem_match','ambiguo')
    and e.destinatario_doc is not null
    and e.valor is not null
    and c.doc = e.destinatario_doc
    and c.valor_ref = round(e.valor, 2);
  get diagnostics n4 = row_count;

  -- ── O que sobrou COM candidato vira ambíguo, não sem_match ───────────────
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

  select count(*) into v_depois from public.melhorenvio_envios where bling_id is null;

  v_res := jsonb_build_object(
    'bling_id_ref', n1, 'nf_chave', n2, 'pedido_loja', n3,
    'cpf_valor', n4, 'viraram_ambiguo', namb);

  -- ⚠️ O log é a diferença entre "rodou" e "funcionou". Só grava rodada que
  -- MEXEU em alguma coisa — 288 linhas por dia de "não fiz nada" afogariam o
  -- sinal, que é justamente o que se quer enxergar.
  if (n1 + n2 + n3 + n4 + namb) > 0 or v_antes <> v_depois then
    insert into public.melhorenvio_conciliar_log (resultado, orfaos_antes, orfaos_depois)
    values (v_res, v_antes, v_depois);
  end if;

  return v_res || jsonb_build_object('orfaos_antes', v_antes, 'orfaos_depois', v_depois);
end $$;

comment on function public.carbo_melhorenvio_conciliar is
  'Casa envio do Melhor Envio com pedido do Bling, em cascata de portas. ⚠️ As duas EXATAS (id do Bling, chave da NF) sobrepõem vínculo feito por porta fraca — sem isso o primeiro palpite vence para sempre. `manual` e `ignorado` nunca são tocados. ⚠️ A porta de CPF+valor aceita total E total_produtos: `insurance_value` é o conteúdo declarado e não inclui frete — comparar só com o total dava 0 acerto em 36. Unicidade conferida sobre os dois valores juntos. Grava em melhorenvio_conciliar_log toda rodada que mexeu em algo.';


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 4 — conferência                                                 ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- (a) ⭐ Rode a função à mão e leia o resultado. `orfaos_depois` menor que
--     `orfaos_antes` é a prova do conserto da porta 4.
select public.carbo_melhorenvio_conciliar() as primeira_rodada;

-- (b) ⚠️ Rode DE NOVO. Tem de vir tudo zero e os órfãos iguais — se a segunda
--     rodada continuar mexendo, alguma porta está oscilando (duas se
--     sobrepondo em laço), e isso reescreveria vínculo a cada 5 minutos.
select public.carbo_melhorenvio_conciliar() as segunda_rodada;

-- (c) O retrato depois, para comparar com o BLOCO 1.
select
  count(*)                                             as envios,
  count(*) filter (where bling_id is null)             as orfaos,
  count(*) filter (where vinculo_status = 'ambiguo')   as ambiguo,
  count(*) filter (where vinculo_via = 'cpf_valor')    as via_cpf_valor
from public.melhorenvio_envios;

-- (d) ⚠️ Continua tendo de vir VAZIO. Se aparecer linha aqui depois da
--     mudança, a sobreposição da porta 1 não está funcionando.
select me_id, vinculo_via, bling_id as ligado_em, bling_id_ref as deveria_ser
from public.melhorenvio_envios
where bling_id_ref is not null and bling_id is not null and bling_id <> bling_id_ref;

-- (e) ⭐ Quem ganhou vínculo agora: são pedidos que voltam a existir para a
--     esteira. Vários deles já foram ENTREGUES — pacote que chegou, card preso
--     em "NF emitida", cliente sem nenhum aviso.
select me_id, destinatario_nome, valor, transportadora, vinculo_via,
       gerado_em::date, postado_em::date, entregue_em::date, expirado_em::date
from public.melhorenvio_envios
where vinculo_em > now() - interval '10 minutes'
order by gerado_em;

-- (f) Os órfãos que sobraram, com o motivo de cada porta ter falhado.
select e.me_id, e.destinatario_nome, e.destinatario_doc, e.valor,
       e.criado_em_me::date, e.vinculo_status,
       (e.bling_id_ref is not null)                    as p1_tem_tag,
       (e.nf_chave is not null)                        as p2_tem_nf,
       e.pedido_loja                                   as p3_numero,
       (select count(*) from public.bling2_orders o
         join public.bling2_contacts ct on ct.bling_id = o.contato_id
        where regexp_replace(coalesce(ct.cpf_cnpj,''),'\D','','g') = e.destinatario_doc)
                                                       as p4_pedidos_do_doc
from public.melhorenvio_envios e
where e.bling_id is null
order by e.criado_em_me desc nulls last;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 5 — o cron passa a guardar o que a função diz                   ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
--
-- A função já grava sozinha no log; reagendar aqui é só para o comando deixar
-- de parecer que o retorno é descartável.

do $$
declare j bigint;
begin
  for j in select jobid from cron.job where jobname = 'melhorenvio-conciliar-5min' loop
    perform cron.unschedule(j);
  end loop;
  perform cron.schedule('melhorenvio-conciliar-5min', '*/5 * * * *',
    'select public.carbo_melhorenvio_conciliar();');
end $$;

-- ⚠️ O alarme que faltava. `ultima_vez_que_mexeu` parado há dias com
-- `orfaos_agora` alto significa conciliação que roda e não resolve — o
-- `succeeded` do pg_cron não distingue os dois casos.
select
  (select count(*) from public.melhorenvio_envios where bling_id is null) as orfaos_agora,
  (select max(rodou_em) from public.melhorenvio_conciliar_log)            as ultima_vez_que_mexeu,
  (select orfaos_depois from public.melhorenvio_conciliar_log
    order by rodou_em desc limit 1)                                       as orfaos_na_ultima;
