-- ═══════════════════════════════════════════════════════════════════════════
-- Alerta de pedido parado na esteira
--
-- ── O buraco ─────────────────────────────────────────────────────────────
--
-- Em 26/08/2026 uma consulta à mão achou DOZE pedidos parados há mais de dez
-- dias: três clientes que pagaram e cuja encomenda nunca saiu (R$ 382,37) e
-- sete com NF emitida e nenhuma etiqueta comprada (R$ 1.193,71). O mais antigo
-- estava há 63 dias.
--
-- Nada no sistema avisava. A esteira mostra o card, o chip de etiqueta vencida
-- existe, o filtro de problemas existe — mas TUDO depende de alguém abrir a
-- tela e reparar. É o mesmo alarme passivo que o CLAUDE.md já registra para o
-- `fontes_saude`, e a conclusão é a mesma: para uma fonte que move dinheiro,
-- passivo é o mesmo que não ter.
--
-- ── ⚠️ Isto é alerta INTERNO. Nunca vira mensagem para o cliente ─────────
--
-- Este arquivo e a `carbo_msg_fila` se parecem: leem a mesma esteira, decidem
-- por etapa, disparam sozinhos. A diferença é para QUEM, e ela é absoluta.
--
-- O caminho aqui é `notify_time_interno` → tabela `notifications` → sininho.
-- Nenhuma função de WhatsApp lê `carbo_esteira_alerta`, e nada aqui escreve em
-- `carbo_msg_envios` nem em `carbo_msg_fila`. É a mesma garantia estrutural do
-- recado interno das conversas, que mora em `carbo_wa_notas` e não numa coluna
-- `interna` — não existe SELECT futuro que possa esquecer o filtro, porque não
-- há filtro: são caminhos separados.
--
-- ── O relógio é POR ETAPA, e é isso que torna o número útil ──────────────
--
-- "Parado há 30 dias" contado da data do pedido mistura demora de faturamento
-- com demora de expedição, e um pedido que foi faturado ontem depois de o
-- cliente atrasar o pagamento apareceria como problema de logística.
--
-- Cada etapa tem o carimbo que a começou:
--   confirmado   → data do pedido
--   nf_emitida   → data de emissão da NF
--   etiqueta     → quando a etiqueta foi gerada no Melhor Envio
--   em_transito  → quando a encomenda foi postada
--
-- ── Duas coisas que NÃO alertam, de propósito ────────────────────────────
--
-- `entregue` e `cancelado` são saídas da esteira, não paradas.
--
-- E pedido de marketplace cuja plataforma não informa avanço
-- (`tem_status_da_plataforma = false`) alerta pelo tempo como qualquer outro —
-- mas o texto DIZ que a origem pode ser falta de integração, e não sumiço da
-- encomenda. Sem essa distinção, o Mercado Livre e a Amazon encheriam o
-- sininho de casos que não são de logística, e o alerta seria desligado em uma
-- semana.
--
-- ⚠️ RODE EM BLOCOS.
-- ═══════════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — os limiares, em TABELA                                      ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
--
-- ⚠️ Em tabela e não em constante no código, pela mesma razão do
-- `carbo_recompra_config`: mudar "3 dias para comprar a etiqueta" é decisão de
-- operação, e se exigir deploy ninguém muda — e um limiar que não cabe na
-- realidade vira alerta ignorado, que é pior que nenhum.

create table if not exists public.carbo_esteira_limite (
  etapa            text primary key
                     check (etapa in ('confirmado','nf_emitida','etiqueta','em_transito')),
  dias             integer not null check (dias > 0),
  -- Quantos dias até reavisar um pedido que continua parado. Um alerta único
  -- que todo mundo ignorou é indistinguível de nenhum alerta.
  dias_para_repetir integer not null default 7 check (dias_para_repetir > 0),
  ativo            boolean not null default true
);

comment on table public.carbo_esteira_limite is
  'Quantos dias em cada etapa da esteira caracterizam pedido PARADO. Em tabela para a operação ajustar sem deploy — limiar que não cabe na realidade vira alerta ignorado.';

insert into public.carbo_esteira_limite (etapa, dias, dias_para_repetir) values
  -- Faturado e sem NF válida: a nota sai em horas quando o Bling está de pé.
  ('confirmado',   2,  7),
  -- NF emitida e nenhuma etiqueta em lugar nenhum: é o caso dos sete de agosto.
  ('nf_emitida',   3,  7),
  -- Etiqueta comprada e não postada: a validade do Melhor Envio é curta, e
  -- passar dela é frete pago e perdido.
  ('etiqueta',     3,  7),
  -- Postado e sem chegar. Mais folgado de propósito: prazo de transportadora
  -- para o Norte e o Nordeste passa de dez dias com frequência.
  ('em_transito', 15, 10)
on conflict (etapa) do nothing;

alter table public.carbo_esteira_limite enable row level security;
drop policy if exists carbo_esteira_limite_read on public.carbo_esteira_limite;
create policy carbo_esteira_limite_read on public.carbo_esteira_limite
  for select to authenticated using (public.carbo_e_time_interno());


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — o registro de quem já foi avisado                           ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
--
-- Mesmo padrão do `carbo_msg_envios`: a chave é (bling_id, etapa), e é ela que
-- impede o sininho de repetir o mesmo pedido a cada rodada.
--
-- ⚠️ `vezes` e `ultimo_em` existem para o reaviso. Um pedido parado há 40 dias
-- deve voltar a incomodar, senão o primeiro alerta é engolido e o pedido
-- adormece de novo — que é exatamente o que aconteceu com os doze.

create table if not exists public.carbo_esteira_alerta (
  bling_id     bigint  not null,
  etapa        text    not null,
  primeiro_em  timestamptz not null default now(),
  ultimo_em    timestamptz not null default now(),
  vezes        integer not null default 1,
  dias_no_ultimo integer,
  primary key (bling_id, etapa)
);

comment on table public.carbo_esteira_alerta is
  'Quem já recebeu alerta de parado, por (pedido, etapa). ⚠️ NENHUM caminho de WhatsApp lê esta tabela — o alerta é interno, vai só para o sininho por notify_time_interno.';

create index if not exists carbo_esteira_alerta_ultimo_idx
  on public.carbo_esteira_alerta (ultimo_em desc);

alter table public.carbo_esteira_alerta enable row level security;
drop policy if exists carbo_esteira_alerta_read on public.carbo_esteira_alerta;
create policy carbo_esteira_alerta_read on public.carbo_esteira_alerta
  for select to authenticated using (public.carbo_e_time_interno());


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 3 — a view: o que está parado, e há quanto tempo                ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
--
-- Uma view, não um cálculo dentro da função de alerta: a TELA precisa da mesma
-- conta para mostrar "parado há 12d" no card. Duas implementações da mesma
-- regra divergem — é a doença do `pedidoRaiz` e a do `quotePdf` do mkt.

create or replace view public.carbo_esteira_parados
with (security_invoker = true) as
select
  e.bling_id,
  e.etapa,
  e.canal,
  e.cliente,
  e.pedido_codigo,
  e.pedido_numero,
  e.pedido_loja,
  e.total,
  e.data_pedido,
  e.carboze_order_id,
  e.rastreio,
  e.me_situacao,
  e.me_tem_ativo,
  e.tem_status_da_plataforma,
  -- ⚠️ O carimbo que COMEÇOU a etapa atual, com queda para o anterior quando
  -- ele não existe. Sem o coalesce, um pedido sem `nf_data` teria idade nula e
  -- sumiria do alerta — ausência de dado viraria ausência de problema.
  case e.etapa
    when 'confirmado'  then e.data_pedido
    when 'nf_emitida'  then coalesce(e.nf_data::date, e.data_pedido)
    when 'etiqueta'    then coalesce(e.me_gerado_em::date, e.nf_data::date, e.data_pedido)
    when 'em_transito' then coalesce(r.postado_em::date, e.me_gerado_em::date, e.data_pedido)
  end                                              as desde,
  (current_date - (case e.etapa
    when 'confirmado'  then e.data_pedido
    when 'nf_emitida'  then coalesce(e.nf_data::date, e.data_pedido)
    when 'etiqueta'    then coalesce(e.me_gerado_em::date, e.nf_data::date, e.data_pedido)
    when 'em_transito' then coalesce(r.postado_em::date, e.me_gerado_em::date, e.data_pedido)
  end))                                            as dias_parado,
  l.dias                                           as limite_dias,
  l.dias_para_repetir,
  -- ⚠️ Etiqueta MORTA é urgente independentemente de dias: o frete já foi pago
  -- e a encomenda não vai sair até alguém comprar outra. Foi assim que seis
  -- etiquetas vencidas (R$ 688,10) ficaram invisíveis até virarem planilha.
  (e.me_tem_ativo is false)                        as etiqueta_morta,
  case
    when e.me_tem_ativo is false and e.me_situacao = 'vencido'   then 'etiqueta VENCIDA — comprar outra'
    when e.me_tem_ativo is false and e.me_situacao = 'cancelado' then 'etiqueta CANCELADA — comprar outra'
    when e.me_tem_ativo is false                                 then 'sem etiqueta ativa — comprar outra'
    when e.etapa = 'nf_emitida' and e.rastreio is null           then 'NF emitida e nenhuma etiqueta comprada'
    when e.etapa = 'etiqueta'                                    then 'etiqueta comprada e não postada'
    when e.etapa = 'confirmado'                                  then 'faturado e sem NF válida'
    -- ⚠️ Marketplace sem integração de status: pode ter sido entregue e nós não
    -- sabermos. Dizer isso evita que o alerta seja lido como sumiço de
    -- encomenda e acabe desligado por "falso positivo" que não é falso.
    when e.etapa = 'em_transito' and not e.tem_status_da_plataforma
                                                                 then 'postado; o canal não informa entrega — conferir na plataforma'
    when e.etapa = 'em_transito'                                 then 'postado e sem confirmação de entrega'
    else                                                              'parado'
  end                                              as diagnostico
from public.bling2_esteira e
join public.carbo_esteira_limite l on l.etapa = e.etapa and l.ativo
left join public.rastreio_envios r on r.codigo = e.rastreio
where e.etapa not in ('entregue','cancelado')
  and (current_date - (case e.etapa
        when 'confirmado'  then e.data_pedido
        when 'nf_emitida'  then coalesce(e.nf_data::date, e.data_pedido)
        when 'etiqueta'    then coalesce(e.me_gerado_em::date, e.nf_data::date, e.data_pedido)
        when 'em_transito' then coalesce(r.postado_em::date, e.me_gerado_em::date, e.data_pedido)
      end)) >= l.dias;

comment on view public.carbo_esteira_parados is
  'Pedidos parados além do limite da sua etapa. O relógio é POR ETAPA (NF conta da emissão, etiqueta da geração, trânsito da postagem) — contar da data do pedido misturaria demora de faturamento com demora de expedição. ⚠️ security_invoker = true — repita a cláusula em toda republicação.';

grant select on public.carbo_esteira_parados to authenticated;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 4 — ⚠️ O QUE ALERTARIA HOJE. Rode ANTES do BLOCO 5.             ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
--
-- A primeira rodada avisa TODO o acumulado de uma vez. Isso é desejado — esse
-- acumulado é o trabalho represado — mas tem de ser um número conhecido antes,
-- e não uma surpresa no sininho de todo mundo.
--
-- Se vier grande demais para uma manhã, suba os limiares no BLOCO 1, rode isto
-- de novo, e só então ligue o cron.

select etapa, count(*) as pedidos, sum(total) as valor,
       min(dias_parado) as menos_dias, max(dias_parado) as mais_dias,
       count(*) filter (where etiqueta_morta) as com_etiqueta_morta
from public.carbo_esteira_parados
group by 1 order by 2 desc;

-- A lista, para conferir se os limiares fazem sentido antes de ligar.
select bling_id, canal, cliente, pedido_codigo, etapa, dias_parado, limite_dias,
       total, diagnostico
from public.carbo_esteira_parados
order by dias_parado desc;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 5 — a função que avisa                                          ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

create or replace function public.carbo_alertar_parados()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  r        record;
  v_novos  int := 0;
  v_repet  int := 0;
  v_titulo text;
  v_corpo  text;
begin
  for r in
    select p.*, a.ultimo_em, a.vezes
    from public.carbo_esteira_parados p
    left join public.carbo_esteira_alerta a
           on a.bling_id = p.bling_id and a.etapa = p.etapa
    where a.bling_id is null                                   -- nunca avisado
       or a.ultimo_em < now() - (p.dias_para_repetir || ' days')::interval
    order by p.dias_parado desc
  loop
    v_titulo := case when r.etiqueta_morta then 'Etiqueta morta: ' else 'Pedido parado: ' end
                || coalesce(r.cliente, 'sem nome');

    v_corpo := coalesce(r.canal, 'canal ?')
               || ' · pedido ' || coalesce(r.pedido_codigo, r.pedido_loja, r.pedido_numero, '?')
               || ' · ' || r.diagnostico
               || ' · há ' || r.dias_parado || ' dias'
               -- ⚠️ `,` e `.` LITERAIS no molde, não `G` e `D`. Os dois últimos
               -- seguem o locale do banco, que no Supabase é en_US: o valor
               -- sairia "R$ 1,234.56" no sininho de um time brasileiro. Com o
               -- molde literal a saída é sempre "1,234.56", e a troca abaixo a
               -- leva para "1.234,56" sem depender de configuração nenhuma.
               || ' · R$ ' || replace(replace(replace(
                    to_char(coalesce(r.total, 0), 'FM999,999,990.00'),
                    ',', '#'), '.', ','), '#', '.');

    -- ⚠️ `reference_id` é uuid e `bling_id` é bigint: não cabe. Vai o id do
    -- pedido no CarboZé quando existe, e null quando não — o corpo carrega o
    -- número que a pessoa precisa para achar o card. Forçar um cast aqui
    -- gravaria um id que não aponta para lugar nenhum.
    perform public.notify_time_interno(
      'esteira_parado', v_titulo, v_corpo, 'esteira', r.carboze_order_id, null);

    insert into public.carbo_esteira_alerta (bling_id, etapa, dias_no_ultimo)
    values (r.bling_id, r.etapa, r.dias_parado)
    on conflict (bling_id, etapa) do update
      set ultimo_em = now(),
          vezes = public.carbo_esteira_alerta.vezes + 1,
          dias_no_ultimo = excluded.dias_no_ultimo;

    if r.vezes is null then v_novos := v_novos + 1; else v_repet := v_repet + 1; end if;
  end loop;

  return jsonb_build_object('novos', v_novos, 'reavisados', v_repet,
                            'parados_agora', (select count(*) from public.carbo_esteira_parados));
end $$;

comment on function public.carbo_alertar_parados is
  'Avisa o time interno sobre pedido parado além do limite da etapa. ⚠️ INTERNO: escreve só em notifications (via notify_time_interno) e em carbo_esteira_alerta. Nenhum caminho de WhatsApp lê essas tabelas — o cliente nunca recebe nada daqui. Reavisa a cada dias_para_repetir, porque alerta único que todos ignoraram é o mesmo que nenhum.';


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 6 — a cadência                                                  ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
--
-- ⚠️ UMA VEZ POR DIA, e de manhã. Pedido parado é problema de dias, não de
-- minutos: rodar de hora em hora não descobriria nada mais cedo em termos
-- úteis e encheria o sininho. 11:00 UTC = 08:00 de Brasília — chega junto com
-- a pessoa, não no meio da madrugada.
--
-- É SQL puro (banco→banco), então não depende de deploy nem de segredo.

do $$
declare j bigint;
begin
  for j in select jobid from cron.job where jobname = 'esteira-parados-diario' loop
    perform cron.unschedule(j);
  end loop;
  perform cron.schedule('esteira-parados-diario', '0 11 * * *',
    'select public.carbo_alertar_parados();');
end $$;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 7 — a primeira rodada, à mão, para você ver o resultado         ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

select public.carbo_alertar_parados() as primeira_rodada;

-- ⚠️ Rode DE NOVO: `novos` e `reavisados` têm de vir ZERO. Se não vierem, o
-- dedupe não está segurando e o sininho receberia o mesmo pedido a cada dia.
select public.carbo_alertar_parados() as segunda_rodada;

-- O que caiu no sininho de cada pessoa.
select n.title, n.body, n.created_at, count(*) as pessoas
from public.notifications n
where n.type = 'esteira_parado' and n.created_at > now() - interval '10 minutes'
group by 1, 2, 3
order by 3 desc;

-- ⚠️ E a prova de que isto NÃO virou mensagem para cliente: tem de vir vazio.
select count(*) as mensagens_indevidas
from public.carbo_msg_envios
where etapa = 'esteira_parado' or motivo ilike '%parado%';
