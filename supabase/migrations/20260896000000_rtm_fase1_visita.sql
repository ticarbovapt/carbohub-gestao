-- ═══════════════════════════════════════════════════════════════════════════
-- RTM · Fase 1 — Registro de visita (check-in, conferência, check-out)
--
-- Base: briefing de domínio "Carbo Core · Comercial NE · v1".
--
-- ── O que esta fase é, e o que ela deliberadamente NÃO é ──────────────────
--
-- É: a visita virar DADO. Hoje o que acontece dentro do PDV não existe em
-- lugar nenhum — o sistema só enxerga o pedido, que é a consequência. Sem o
-- registro da visita não há positivação (pedidos ÷ visitas), não há tempo em
-- PDV, não há ranking de motivo de não-pedido. Os três indicadores da camada
-- de atividade nascem daqui.
--
-- NÃO é: roteirização, curva ABC, sell-out, previsão. O briefing ordena as
-- fases e avisa que antecipar produz tela sem dado. A agenda aqui é MANUAL
-- (alguém marca a visita); a regra "setor X na terça, semana par" é Fase 4.
--
-- ── Quatro decisões que valem mais que o schema ───────────────────────────
--
-- 1. GEO SINALIZA, NUNCA BLOQUEIA. A distância entre o check-in e a coordenada
--    do PDV é gravada em metros e fica visível. Ela não impede check-in, não
--    invalida visita, não gera alerta automático para o gestor. GPS de celular
--    erra, posto tem cobertura de bomba, e metade das coordenadas cadastradas
--    veio de geocodificação de endereço — o erro mais provável é do CADASTRO,
--    não do vendedor. Sistema que acusa vendedor honesto de fraude é
--    desinstalado na primeira semana, e com razão.
--
-- 2. MOTIVO É LISTA FECHADA. Texto livre não agrega, não ranqueia, não vira
--    decisão. Só a opção "outro" abre campo de texto — e o CHECK garante isso,
--    porque a regra na tela sozinha vira dado sujo no primeiro app novo.
--
-- 3. A VISITA FECHADA É IMUTÁVEL. Enquanto o check-out não acontece a linha é
--    editável (é a visita em andamento). Depois do check-out ela congela: a
--    correção cria um NOVO registro apontando para o original, com autor e
--    justificativa. É isso que sustenta a confiança do time no número — se o
--    passado pode ser reescrito em silêncio, nenhum indicador é auditável.
--
-- 4. OFFLINE É REQUISITO, NÃO ENFEITE. Interior da Bahia e de Pernambuco têm
--    trecho sem sinal. Por isso toda linha nasce com `client_uuid` — a chave
--    de idempotência gerada NO APARELHO. É ela que deixa a fila local
--    reenviar à vontade sem duplicar visita. E os dois relógios são gravados
--    separados: `ts_dispositivo_*` (o que o aparelho marcou, sujeito a relógio
--    errado) e `ts_*` (o que o servidor recebeu). Guardar só um dos dois
--    torna impossível distinguir "visitou às 9h e sincronizou às 18h" de
--    "registrou tudo às 18h no estacionamento".
-- ═══════════════════════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════════════════════
-- 0. Pré-requisito
--
-- `is_manager_or_admin` foi criada fora de migração (como a própria tabela
-- `pdvs`) e é de quem depende toda a RLS deste arquivo. Falha aqui, cedo e
-- com nome, em vez de estourar "function does not exist" no meio das policies
-- — quando metade das tabelas já existe e o diagnóstico fica caro.
-- ═══════════════════════════════════════════════════════════════════════════

do $$
begin
  if to_regprocedure('public.is_manager_or_admin(uuid)') is null then
    raise exception
      'public.is_manager_or_admin(uuid) não existe neste banco. Toda a RLS do RTM depende dela — crie-a antes de rodar esta migração.';
  end if;
end $$;


-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Configuração — o que muda sem deploy
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.rtm_config (
  chave  text primary key,
  valor  text not null,
  nota   text
);

comment on table public.rtm_config is
  'Parâmetros do RTM que a operação ajusta sem deploy. Chave/valor em texto: são poucos e mudam por decisão de negócio, não por release.';

insert into public.rtm_config (chave, valor, nota) values
  ('raio_divergencia_m', '300',
   'Acima desta distância (metros) entre o check-in e a coordenada do PDV a visita aparece marcada como "confirmar local". SINALIZA, não bloqueia.'),
  ('foto_expositor_obrigatoria', 'true',
   'Exige ao menos uma foto do expositor para fechar a visita. É a evidência que sustenta a conferência — sem ela "conferido" é só um clique.'),
  ('minutos_visita_suspeita', '3',
   'Visita mais curta que isso fica marcada na revisão do gestor. Também só sinaliza.')
on conflict (chave) do nothing;


-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Motivos de não-pedido — lista fechada, ordenável, desativável
--
-- ⚠️ Motivo NUNCA é apagado, só desativado: visita antiga aponta para ele e o
-- ranking histórico precisa continuar legível.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.rtm_motivos (
  id           text primary key,
  label        text not null,
  ordem        int  not null default 100,
  ativo        boolean not null default true,
  -- Só o "outro" abre caixa de texto. Ver o CHECK em rtm_visitas.
  exige_texto  boolean not null default false
);

comment on table public.rtm_motivos is
  'Motivos de não-pedido. Lista FECHADA de propósito: texto livre não agrega, não ranqueia e não vira decisão. Desative, nunca apague — visita antiga aponta para cá.';

insert into public.rtm_motivos (id, label, ordem, exige_texto) values
  ('estoque_alto',      'Ainda tem estoque',                 10, false),
  ('sem_verba',         'Sem verba no momento',              20, false),
  ('dono_ausente',      'Decisor ausente',                   30, false),
  ('preco',             'Achou o preço alto',                40, false),
  ('inadimplente',      'Bloqueado / financeiro',            50, false),
  ('concorrencia',      'Comprou do concorrente',            60, false),
  ('sem_giro',          'Produto não está girando',          70, false),
  ('fechado',           'PDV fechado no horário',            80, false),
  ('outro',             'Outro (descrever)',                999, true)
on conflict (id) do nothing;


-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Checklist de conferência — configurável em tabela
--
-- "Expositor, itens e o que mais o roteiro exigir" é um conjunto que MUDA:
-- entra material de PDV numa campanha, sai no mês seguinte. Item em código
-- significa deploy a cada mudança de campanha; item em tabela significa uma
-- linha de INSERT. Por isso é dado, não enum.
--
-- ⚠️ Item não se apaga, se DESATIVA — a resposta de uma visita de março
-- referencia o item, e apagar deixaria o histórico sem pergunta.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.rtm_checklist_itens (
  id          uuid primary key default gen_random_uuid(),
  codigo      text not null unique,
  label       text not null,
  ajuda       text,
  -- sim_nao_na: "não se aplica" é resposta legítima e diferente de "não".
  -- PDV sem expositor não responde "não tem material no expositor".
  tipo        text not null default 'sim_nao_na'
              check (tipo in ('sim_nao', 'sim_nao_na', 'numero', 'texto')),
  obrigatorio boolean not null default false,
  -- Quando "não" também é problema: marca o item como achado para o gestor.
  nao_e_problema boolean not null default true,
  ordem       int not null default 100,
  ativo       boolean not null default true,
  created_at  timestamptz not null default now()
);

comment on table public.rtm_checklist_itens is
  'Perguntas da conferência no PDV. Em tabela e não em código porque o conjunto muda por campanha — item novo é um INSERT, não um deploy. Desative, nunca apague.';

insert into public.rtm_checklist_itens (codigo, label, ajuda, tipo, obrigatorio, ordem) values
  ('expositor_presente', 'O expositor está no PDV?',          'Se não estiver, registre no próximo passo.', 'sim_nao',    true,  10),
  ('expositor_visivel',  'Está em local de boa visibilidade?','Perto do caixa, na altura dos olhos.',       'sim_nao_na', false, 20),
  ('expositor_limpo',    'Está limpo e organizado?',          null,                                        'sim_nao_na', false, 30),
  ('preco_etiqueta',     'Preço está na etiqueta?',           null,                                        'sim_nao_na', false, 40),
  ('material_pdv',       'Material de PDV no lugar?',         'Wobbler, adesivo, folheto.',                 'sim_nao_na', false, 50),
  ('treinou_equipe',     'Falou com quem atende no balcão?',  'Quem vende o produto é o frentista.',        'sim_nao',    false, 60)
on conflict (codigo) do nothing;


-- ═══════════════════════════════════════════════════════════════════════════
-- 4. Visita PLANEJADA — o plano
--
-- ⚠️ Ela precisa existir ANTES do dia. Sem plano só dá para contar o que
-- aconteceu, nunca o que deixou de acontecer — e "o que deixou de acontecer"
-- é a aderência, o primeiro indicador de gestão de verdade.
--
-- Na Fase 1 quem cria é gente (vendedor ou gestor). Na Fase 4 a regra de
-- roteiro passa a gerar em lote; por isso `origem` já existe, para as duas
-- conviverem sem migração de dado.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.rtm_visita_planejada (
  id            uuid primary key default gen_random_uuid(),
  pdv_id        uuid not null references public.pdvs(id) on delete cascade,
  vendedor_id   uuid not null references public.profiles(id) on delete cascade,
  data_prevista date not null,
  -- Ordem sugerida do dia. Nulo = sem ordem definida.
  ordem         int,
  origem        text not null default 'manual' check (origem in ('manual', 'roteiro')),
  status        text not null default 'planejada'
                check (status in ('planejada', 'cumprida', 'cancelada')),
  -- Cancelar exige motivo: "não foi" sem porquê não vira aprendizado nenhum.
  cancelamento_motivo text,
  observacao    text,
  criado_por    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  -- O mesmo vendedor não planeja o mesmo PDV duas vezes no mesmo dia.
  unique (pdv_id, vendedor_id, data_prevista)
);

comment on table public.rtm_visita_planejada is
  'O PLANO de visita: qual PDV, qual vendedor, qual dia. Precisa existir antes do dia — sem ela não há como calcular aderência, só contar o que aconteceu.';

create index if not exists idx_rtm_plan_vendedor_data
  on public.rtm_visita_planejada (vendedor_id, data_prevista);
create index if not exists idx_rtm_plan_pdv
  on public.rtm_visita_planejada (pdv_id);


-- ═══════════════════════════════════════════════════════════════════════════
-- 5. VISITA — o registro real
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.rtm_visitas (
  id          uuid primary key default gen_random_uuid(),

  -- ⚠️ A chave de idempotência da fila offline. Gerada NO APARELHO antes do
  -- primeiro envio e reenviada em toda tentativa: é ela que deixa o celular
  -- retransmitir à vontade num trecho de sinal ruim sem criar visita dobrada.
  -- Sem isso, "enviou mas não recebeu o OK" vira duas visitas no relatório.
  client_uuid uuid not null unique,

  visita_planejada_id uuid references public.rtm_visita_planejada(id) on delete set null,
  pdv_id      uuid not null references public.pdvs(id) on delete cascade,
  vendedor_id uuid not null references public.profiles(id) on delete cascade,

  -- 'roteiro' entra na aderência; os outros dois NÃO entram no numerador,
  -- senão o indicador vira 100% sempre e perde qualquer utilidade. Continuam
  -- contando como trabalho legítimo em produtividade e positivação.
  tipo        text not null default 'roteiro'
              check (tipo in ('roteiro', 'fora_roteiro', 'prospeccao')),

  -- ── Check-in ────────────────────────────────────────────────────────────
  ts_checkin              timestamptz not null default now(),
  ts_dispositivo_checkin  timestamptz,
  checkin_lat             double precision,
  checkin_lng             double precision,
  checkin_precisao_m      numeric(8, 1),

  -- ── Check-out ───────────────────────────────────────────────────────────
  ts_checkout             timestamptz,
  ts_dispositivo_checkout timestamptz,
  checkout_lat            double precision,
  checkout_lng            double precision,
  checkout_precisao_m     numeric(8, 1),

  -- Distância entre o check-in e a coordenada cadastrada do PDV, em metros.
  -- Calculada por trigger. Nula quando falta coordenada de um dos lados —
  -- e falta é o caso comum hoje, não a exceção.
  distancia_pdv_m         numeric(10, 1),

  -- ── Desfecho ────────────────────────────────────────────────────────────
  resultado   text check (resultado in ('pedido', 'sem_pedido', 'pdv_fechado', 'nao_atendido')),
  motivo_id   text references public.rtm_motivos(id),
  motivo_texto text,
  proximo_passo text,
  proximo_passo_em date,
  pedido_id   uuid,

  -- ── Procedência do registro ─────────────────────────────────────────────
  origem_registro text not null default 'online' check (origem_registro in ('online', 'offline')),
  sincronizado_em timestamptz,

  -- ── Correção (append-only) ──────────────────────────────────────────────
  -- Visita fechada não muda: a correção nasce como linha nova apontando para
  -- a original. A view de leitura mostra a mais recente da cadeia.
  ajuste_de_id  uuid references public.rtm_visitas(id) on delete set null,
  ajuste_motivo text,
  ajustada_por  uuid references public.profiles(id) on delete set null,

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  -- Texto de motivo só existe com o motivo que pede texto. Deixar a regra
  -- só na tela produz dado sujo no primeiro app novo que gravar aqui.
  constraint rtm_visita_motivo_texto_coerente check (
    motivo_texto is null
    or (motivo_id is not null and length(trim(motivo_texto)) > 0)
  ),
  -- Correção é linha nova E precisa dizer por quê.
  constraint rtm_visita_ajuste_tem_motivo check (
    ajuste_de_id is null or nullif(trim(coalesce(ajuste_motivo, '')), '') is not null
  ),
  -- Check-out nunca antes do check-in. Relógio de aparelho erra; o do
  -- servidor não deve produzir visita de duração negativa.
  constraint rtm_visita_ordem_do_tempo check (
    ts_checkout is null or ts_checkout >= ts_checkin
  )
);

comment on table public.rtm_visitas is
  'Registro REAL da visita em campo. Append-only depois do check-out: correção cria linha nova apontando para a original (ajuste_de_id). client_uuid é a chave de idempotência da fila offline.';
comment on column public.rtm_visitas.client_uuid is
  'Gerado no aparelho antes do primeiro envio. Deixa a fila offline reenviar sem duplicar visita.';
comment on column public.rtm_visitas.distancia_pdv_m is
  'Distância do check-in até a coordenada do PDV. SINALIZA, nunca bloqueia: GPS erra e metade das coordenadas veio de geocodificação de endereço.';
comment on column public.rtm_visitas.tipo is
  'Só "roteiro" entra no numerador da aderência. Fora de roteiro é trabalho legítimo e conta em produtividade/positivação — mas somá-lo à aderência faz o indicador virar 100% sempre.';

create index if not exists idx_rtm_visitas_vendedor_ts on public.rtm_visitas (vendedor_id, ts_checkin desc);
create index if not exists idx_rtm_visitas_pdv_ts      on public.rtm_visitas (pdv_id, ts_checkin desc);
create index if not exists idx_rtm_visitas_planejada   on public.rtm_visitas (visita_planejada_id);
create index if not exists idx_rtm_visitas_ajuste      on public.rtm_visitas (ajuste_de_id);
-- Visita aberta é o que a tela procura ao abrir: "você tem check-in sem
-- check-out". Índice parcial porque abertas são poucas e o resto é histórico.
create index if not exists idx_rtm_visitas_abertas
  on public.rtm_visitas (vendedor_id) where ts_checkout is null;


-- ═══════════════════════════════════════════════════════════════════════════
-- 6. Respostas da conferência
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.rtm_visita_checklist (
  visita_id uuid not null references public.rtm_visitas(id) on delete cascade,
  item_id   uuid not null references public.rtm_checklist_itens(id),
  resposta  text check (resposta in ('sim', 'nao', 'na')),
  numero    numeric(12, 2),
  texto     text,
  primary key (visita_id, item_id)
);

comment on table public.rtm_visita_checklist is
  'Respostas da conferência, uma linha por item. Guarda o item_id e não o texto da pergunta: a pergunta pode ser reescrita e o histórico continua apontando para a mesma coisa.';


-- ═══════════════════════════════════════════════════════════════════════════
-- 7. Presença por SKU — a ruptura
--
-- Aqui é PRESENÇA (tem / não tem / não trabalha), não contagem. A contagem
-- física por SKU é Fase 5 e é ela que gera sell-out estimado; puxar para cá
-- alongaria a visita e produziria uma série temporal capenga — meia série é
-- pior que série nenhuma, porque parece que dá para calcular.
--
-- O que a presença já entrega hoje: índice de ruptura (PDV com SKU zerado ÷
-- PDVs visitados), que é indicador de execução e não depende de série.
--
-- O domínio de `produto` é o mesmo de `pdv_produto_mix` de propósito: são a
-- mesma prateleira vista de dois ângulos — o cadastro diz o que o PDV deveria
-- ter, a visita diz o que tinha no dia.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.rtm_visita_sku (
  visita_id uuid not null references public.rtm_visitas(id) on delete cascade,
  produto   text not null check (produto in ('10ml', '100ml', '1l')),
  -- 'nao_trabalha' ≠ 'zerado': o primeiro não é ruptura, é mix. Confundir os
  -- dois infla o índice de ruptura com PDV que nunca vendeu aquele SKU.
  situacao  text not null check (situacao in ('tem', 'zerado', 'nao_trabalha')),
  preco_encontrado numeric(10, 2),
  primary key (visita_id, produto)
);

comment on table public.rtm_visita_sku is
  'O que estava na prateleira no dia. "zerado" é ruptura; "nao_trabalha" é mix e NÃO entra no índice de ruptura. Contagem numérica é Fase 5.';


-- ═══════════════════════════════════════════════════════════════════════════
-- 8. Fotos
--
-- O caminho no bucket é o dado; a URL não é guardada porque o bucket é
-- privado e o link assinado expira. Guardar URL aqui seria guardar algo que
-- para de funcionar sozinho.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.rtm_visita_fotos (
  id          uuid primary key default gen_random_uuid(),
  visita_id   uuid not null references public.rtm_visitas(id) on delete cascade,
  tipo        text not null default 'expositor'
              check (tipo in ('expositor', 'fachada', 'gondola', 'material', 'outro')),
  storage_path text not null unique,
  -- O momento e o lugar em que a FOTO foi tirada, que não é o mesmo do envio:
  -- offline, a foto sai do bolso às 9h e sobe às 18h.
  ts_dispositivo timestamptz,
  lat         double precision,
  lng         double precision,
  bytes       int,
  legenda     text,
  created_at  timestamptz not null default now()
);

comment on table public.rtm_visita_fotos is
  'Fotos da conferência. Guarda o caminho no bucket privado, nunca a URL: link assinado expira e URL gravada vira link morto.';

create index if not exists idx_rtm_fotos_visita on public.rtm_visita_fotos (visita_id);


-- ═══════════════════════════════════════════════════════════════════════════
-- 9. Distância do check-in — trigger
--
-- Haversine em SQL puro. Sem PostGIS de propósito: é uma conta de trigonometria
-- e a precisão de metros basta para "está no PDV ou está a 4 km dele".
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.rtm_distancia_m(
  lat1 double precision, lng1 double precision,
  lat2 double precision, lng2 double precision
) returns double precision
language sql immutable parallel safe as $$
  select case
    when lat1 is null or lng1 is null or lat2 is null or lng2 is null then null
    else 6371000 * 2 * asin(sqrt(
      power(sin(radians(lat2 - lat1) / 2), 2)
      + cos(radians(lat1)) * cos(radians(lat2))
      * power(sin(radians(lng2 - lng1) / 2), 2)
    ))
  end;
$$;

comment on function public.rtm_distancia_m is
  'Haversine em metros. Sem PostGIS: a precisão de metros basta para distinguir "está no PDV" de "está a 4 km".';

create or replace function public.rtm_calcula_distancia()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  p record;
begin
  if new.checkin_lat is null or new.checkin_lng is null then
    new.distancia_pdv_m := null;
    return new;
  end if;

  select latitude, longitude into p from public.pdvs where id = new.pdv_id;

  -- Sem coordenada cadastrada não há o que comparar. Isso é o caso COMUM
  -- hoje, não a exceção: distância nula significa "não dá para saber", e a
  -- tela precisa dizer exatamente isso em vez de insinuar conformidade.
  new.distancia_pdv_m := round(
    public.rtm_distancia_m(new.checkin_lat, new.checkin_lng, p.latitude, p.longitude)::numeric, 1
  );
  return new;
end;
$$;

drop trigger if exists trg_rtm_distancia on public.rtm_visitas;
create trigger trg_rtm_distancia
  before insert or update of checkin_lat, checkin_lng, pdv_id on public.rtm_visitas
  for each row execute function public.rtm_calcula_distancia();


-- ═══════════════════════════════════════════════════════════════════════════
-- 10. Congelamento depois do check-out
--
-- Enquanto a visita está aberta ela é rascunho e pode mudar — é literalmente
-- o vendedor preenchendo. Fechada, congela.
--
-- ⚠️ O congelamento é no BANCO, não na tela. Regra de imutabilidade que mora
-- no front é regra que o próximo app esquece de copiar, e aí o histórico
-- passa a ser editável sem ninguém perceber. Essa é a mesma lição do
-- `useVendas`: o que não está num lugar só, diverge.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.rtm_visita_congela()
returns trigger
language plpgsql
as $$
begin
  if old.ts_checkout is null then
    new.updated_at := now();
    return new;                       -- visita em andamento: livre
  end if;

  -- Fechada. Só o vínculo com o pedido pode ser preenchido depois — ele nasce
  -- no fluxo de venda, que termina fora da tela de visita.
  if new.id is distinct from old.id
     or new.client_uuid   is distinct from old.client_uuid
     or new.pdv_id        is distinct from old.pdv_id
     or new.vendedor_id   is distinct from old.vendedor_id
     or new.tipo          is distinct from old.tipo
     or new.ts_checkin    is distinct from old.ts_checkin
     or new.ts_checkout   is distinct from old.ts_checkout
     or new.checkin_lat   is distinct from old.checkin_lat
     or new.checkin_lng   is distinct from old.checkin_lng
     or new.resultado     is distinct from old.resultado
     or new.motivo_id     is distinct from old.motivo_id
     or new.motivo_texto  is distinct from old.motivo_texto
  then
    raise exception
      'Visita já fechada não pode ser editada. Registre uma correção: nova visita com ajuste_de_id = % e ajuste_motivo preenchido.', old.id
      using errcode = 'check_violation';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_rtm_visita_congela on public.rtm_visitas;
create trigger trg_rtm_visita_congela
  before update on public.rtm_visitas
  for each row execute function public.rtm_visita_congela();

-- Conferência e fotos seguem a visita: fechada, param de aceitar escrita.
create or replace function public.rtm_filho_segue_a_visita()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  fechada boolean;
  alvo uuid := coalesce(new.visita_id, old.visita_id);
begin
  select ts_checkout is not null into fechada from public.rtm_visitas where id = alvo;
  if coalesce(fechada, false) then
    raise exception 'Visita já fechada: a conferência não aceita mais alteração.'
      using errcode = 'check_violation';
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_rtm_checklist_congela on public.rtm_visita_checklist;
create trigger trg_rtm_checklist_congela
  before insert or update or delete on public.rtm_visita_checklist
  for each row execute function public.rtm_filho_segue_a_visita();

drop trigger if exists trg_rtm_sku_congela on public.rtm_visita_sku;
create trigger trg_rtm_sku_congela
  before insert or update or delete on public.rtm_visita_sku
  for each row execute function public.rtm_filho_segue_a_visita();

drop trigger if exists trg_rtm_fotos_congela on public.rtm_visita_fotos;
create trigger trg_rtm_fotos_congela
  before insert or update or delete on public.rtm_visita_fotos
  for each row execute function public.rtm_filho_segue_a_visita();


-- ═══════════════════════════════════════════════════════════════════════════
-- 11. Fechar a visita — RPC
--
-- Fechamento é uma transação com regra, não um UPDATE. A tela poderia mandar
-- o UPDATE direto, mas aí a regra "precisa de foto do expositor" e "motivo é
-- obrigatório quando não houve pedido" moraria no front — e o front é o lugar
-- onde a fila offline reenvia, o app novo copia errado e ninguém vê falhar.
--
-- Idempotente de propósito: a fila offline REENVIA. Fechar uma visita já
-- fechada devolve sucesso em silêncio em vez de estourar erro no celular do
-- vendedor que só está com sinal ruim.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.rtm_fechar_visita(
  p_visita_id uuid,
  p_resultado text,
  p_motivo_id text default null,
  p_motivo_texto text default null,
  p_proximo_passo text default null,
  p_proximo_passo_em date default null,
  p_lat double precision default null,
  p_lng double precision default null,
  p_precisao_m numeric default null,
  p_ts_dispositivo timestamptz default null
) returns public.rtm_visitas
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.rtm_visitas;
  exige_foto boolean;
  tem_foto boolean;
  pendentes text;
begin
  select * into v from public.rtm_visitas where id = p_visita_id for update;
  if not found then
    raise exception 'Visita % não encontrada.', p_visita_id using errcode = 'no_data_found';
  end if;

  -- Reenvio da fila offline: já fechada, devolve o que existe.
  if v.ts_checkout is not null then
    return v;
  end if;

  if p_resultado is null then
    raise exception 'Informe o resultado da visita.' using errcode = 'check_violation';
  end if;

  -- Sem pedido exige motivo — é ele que vira o ranking que orienta a
  -- operação. Visita sem desfecho registrado é visita que não ensina nada.
  if p_resultado <> 'pedido' and p_motivo_id is null then
    raise exception 'Sem pedido: informe o motivo.' using errcode = 'check_violation';
  end if;

  if p_motivo_id is not null then
    if not exists (select 1 from public.rtm_motivos where id = p_motivo_id) then
      raise exception 'Motivo % não existe.', p_motivo_id using errcode = 'foreign_key_violation';
    end if;
    if exists (select 1 from public.rtm_motivos where id = p_motivo_id and exige_texto)
       and nullif(trim(coalesce(p_motivo_texto, '')), '') is null then
      raise exception 'Este motivo pede uma descrição.' using errcode = 'check_violation';
    end if;
  end if;

  -- Itens obrigatórios do checklist.
  select string_agg(i.label, ', ' order by i.ordem) into pendentes
  from public.rtm_checklist_itens i
  where i.ativo and i.obrigatorio
    and not exists (
      select 1 from public.rtm_visita_checklist c
      where c.visita_id = v.id and c.item_id = i.id
        and (c.resposta is not null or c.numero is not null
             or nullif(trim(coalesce(c.texto, '')), '') is not null)
    );
  if pendentes is not null then
    raise exception 'Conferência incompleta: %', pendentes using errcode = 'check_violation';
  end if;

  -- Foto do expositor. Dispensada quando o PDV estava fechado: não existe
  -- foto de expositor com a porta fechada, e exigir isso ensinaria o vendedor
  -- a fotografar qualquer coisa para o sistema deixar passar.
  select valor = 'true' into exige_foto from public.rtm_config where chave = 'foto_expositor_obrigatoria';
  if coalesce(exige_foto, false) and p_resultado not in ('pdv_fechado', 'nao_atendido') then
    select exists (
      select 1 from public.rtm_visita_fotos f where f.visita_id = v.id and f.tipo = 'expositor'
    ) into tem_foto;
    if not tem_foto then
      raise exception 'Falta a foto do expositor.' using errcode = 'check_violation';
    end if;
  end if;

  update public.rtm_visitas set
    ts_checkout             = now(),
    ts_dispositivo_checkout = p_ts_dispositivo,
    checkout_lat            = p_lat,
    checkout_lng            = p_lng,
    checkout_precisao_m     = p_precisao_m,
    resultado               = p_resultado,
    motivo_id               = p_motivo_id,
    motivo_texto            = nullif(trim(coalesce(p_motivo_texto, '')), ''),
    proximo_passo           = nullif(trim(coalesce(p_proximo_passo, '')), ''),
    proximo_passo_em        = p_proximo_passo_em,
    sincronizado_em         = now()
  where id = v.id
  returning * into v;

  -- O plano vira "cumprida" junto — o estado do plano não pode depender de um
  -- segundo request que a fila offline pode nunca conseguir mandar.
  if v.visita_planejada_id is not null then
    update public.rtm_visita_planejada
      set status = 'cumprida', updated_at = now()
      where id = v.visita_planejada_id and status = 'planejada';
  end if;

  return v;
end;
$$;

comment on function public.rtm_fechar_visita is
  'Fecha a visita validando motivo, checklist obrigatório e foto do expositor. IDEMPOTENTE: visita já fechada devolve o registro em vez de erro, porque a fila offline reenvia.';

revoke all on function public.rtm_fechar_visita from public;
grant execute on function public.rtm_fechar_visita to authenticated;


-- ═══════════════════════════════════════════════════════════════════════════
-- 12. Abrir a visita — RPC
--
-- Também idempotente, pela mesma razão: o check-in é o request com MAIOR
-- chance de sair sem resposta (é o momento em que a pessoa acabou de entrar
-- no posto, muitas vezes debaixo da cobertura de bomba). Reenviar o mesmo
-- client_uuid devolve a visita já criada.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.rtm_abrir_visita(
  p_client_uuid uuid,
  p_pdv_id uuid,
  p_tipo text default 'roteiro',
  p_visita_planejada_id uuid default null,
  p_lat double precision default null,
  p_lng double precision default null,
  p_precisao_m numeric default null,
  p_ts_dispositivo timestamptz default null,
  p_offline boolean default false
) returns public.rtm_visitas
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.rtm_visitas;
  aberta uuid;
begin
  select * into v from public.rtm_visitas where client_uuid = p_client_uuid;
  if found then
    return v;                          -- reenvio da fila: devolve o que existe
  end if;

  -- Duas visitas abertas ao mesmo tempo é sempre engano (esqueceu de fechar a
  -- anterior). Fechar sozinho a antiga seria inventar um check-out que não
  -- aconteceu; então recusa e manda resolver.
  select id into aberta from public.rtm_visitas
   where vendedor_id = auth.uid() and ts_checkout is null
   limit 1;
  if aberta is not null then
    raise exception 'Você tem uma visita em aberto. Finalize-a antes de iniciar outra.'
      using errcode = 'check_violation', hint = aberta::text;
  end if;

  insert into public.rtm_visitas (
    client_uuid, visita_planejada_id, pdv_id, vendedor_id, tipo,
    ts_dispositivo_checkin, checkin_lat, checkin_lng, checkin_precisao_m,
    origem_registro, sincronizado_em
  ) values (
    p_client_uuid, p_visita_planejada_id, p_pdv_id, auth.uid(), coalesce(p_tipo, 'roteiro'),
    p_ts_dispositivo, p_lat, p_lng, p_precisao_m,
    case when p_offline then 'offline' else 'online' end, now()
  )
  returning * into v;

  return v;
end;
$$;

comment on function public.rtm_abrir_visita is
  'Abre a visita (check-in). IDEMPOTENTE pelo client_uuid — o check-in é o request com maior chance de sair sem resposta. Recusa segunda visita aberta em vez de fechar a anterior sozinho.';

revoke all on function public.rtm_abrir_visita from public;
grant execute on function public.rtm_abrir_visita to authenticated;


-- ═══════════════════════════════════════════════════════════════════════════
-- 13. Views de leitura
-- ═══════════════════════════════════════════════════════════════════════════

-- Visita com tudo que a tela mostra. `security_invoker` para a RLS de quem
-- consulta continuar valendo dentro da view.
create or replace view public.rtm_visita_card
with (security_invoker = true) as
select
  v.id,
  v.client_uuid,
  v.pdv_id,
  p.name          as pdv_nome,
  p.pdv_code,
  p.address_city  as cidade,
  p.address_state as uf,
  p.latitude      as pdv_lat,
  p.longitude     as pdv_lng,
  v.vendedor_id,
  prof.full_name  as vendedor_nome,
  v.visita_planejada_id,
  v.tipo,
  v.ts_checkin,
  v.ts_checkout,
  v.ts_dispositivo_checkin,
  v.ts_dispositivo_checkout,
  v.checkin_lat, v.checkin_lng, v.checkin_precisao_m,
  v.distancia_pdv_m,
  v.resultado,
  v.motivo_id,
  m.label         as motivo_label,
  v.motivo_texto,
  v.proximo_passo,
  v.proximo_passo_em,
  v.origem_registro,
  v.ajuste_de_id,
  v.ajuste_motivo,
  v.created_at,

  -- Duração pelo relógio do SERVIDOR. O do aparelho serve para auditoria, não
  -- para indicador: celular com data errada produziria visita de -3 horas.
  case when v.ts_checkout is null then null
       else round(extract(epoch from (v.ts_checkout - v.ts_checkin)) / 60.0)::int
  end as minutos,

  -- Só sinaliza. A tela mostra "confirmar local", nunca "fora do PDV".
  case
    when v.distancia_pdv_m is null then 'sem_referencia'
    when v.distancia_pdv_m > (select valor::numeric from public.rtm_config where chave = 'raio_divergencia_m')
      then 'confirmar'
    else 'ok'
  end as local_status,

  (select count(*) from public.rtm_visita_fotos f where f.visita_id = v.id)   as fotos,
  (select count(*) from public.rtm_visita_sku s
     where s.visita_id = v.id and s.situacao = 'zerado')                      as skus_zerados,
  -- Achados: itens em que "não" é problema. É o que o gestor precisa ver sem
  -- abrir a visita uma a uma.
  (select count(*) from public.rtm_visita_checklist c
     join public.rtm_checklist_itens i on i.id = c.item_id
    where c.visita_id = v.id and c.resposta = 'nao' and not i.nao_e_problema)  as achados,

  -- A cadeia de correção: linha corrigida deixa de valer, mas continua no banco.
  exists (select 1 from public.rtm_visitas c where c.ajuste_de_id = v.id)      as foi_corrigida
from public.rtm_visitas v
join public.pdvs p        on p.id = v.pdv_id
left join public.profiles prof on prof.id = v.vendedor_id
left join public.rtm_motivos m on m.id = v.motivo_id;

comment on view public.rtm_visita_card is
  'A visita como a tela mostra. Duração vem do relógio do SERVIDOR: o do aparelho é auditoria, e celular com data errada produziria visita de duração negativa.';


-- A agenda: o plano do dia com o que já aconteceu ao lado. LEFT JOIN porque a
-- linha precisa existir mesmo sem visita — é justamente o "planejado e não
-- cumprido" que dá sentido à aderência.
create or replace view public.rtm_agenda
with (security_invoker = true) as
select
  pl.id            as planejada_id,
  pl.data_prevista,
  pl.ordem,
  pl.status        as status_plano,
  pl.origem,
  pl.observacao,
  pl.cancelamento_motivo,
  pl.vendedor_id,
  prof.full_name   as vendedor_nome,
  p.id             as pdv_id,
  p.name           as pdv_nome,
  p.pdv_code,
  p.address_street as endereco,
  p.address_city   as cidade,
  p.address_state  as uf,
  p.contact_name,
  p.contact_phone,
  p.latitude       as pdv_lat,
  p.longitude      as pdv_lng,
  v.id             as visita_id,
  v.ts_checkin,
  v.ts_checkout,
  v.resultado,
  case
    when pl.status = 'cancelada'    then 'cancelada'
    when v.ts_checkout is not null  then 'concluida'
    when v.id is not null           then 'em_andamento'
    when pl.data_prevista < (now() at time zone 'America/Sao_Paulo')::date then 'nao_cumprida'
    else 'pendente'
  end as situacao
from public.rtm_visita_planejada pl
join public.pdvs p        on p.id = pl.pdv_id
left join public.profiles prof on prof.id = pl.vendedor_id
left join lateral (
  select * from public.rtm_visitas x
   where x.visita_planejada_id = pl.id and x.ajuste_de_id is null
   order by x.ts_checkin desc limit 1
) v on true;

comment on view public.rtm_agenda is
  'Agenda do vendedor: o plano com o real ao lado. O dia é o de BRASÍLIA — comparar com a data UTC jogaria a visita das 21h para o dia seguinte.';


-- ═══════════════════════════════════════════════════════════════════════════
-- 14. RLS
--
-- Vendedor enxerga e escreve o próprio trabalho; gestor enxerga tudo. Não há
-- matriz tela-a-tela aqui — é o modelo de acesso dos sistemas novos.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.rtm_config           enable row level security;
alter table public.rtm_motivos          enable row level security;
alter table public.rtm_checklist_itens  enable row level security;
alter table public.rtm_visita_planejada enable row level security;
alter table public.rtm_visitas          enable row level security;
alter table public.rtm_visita_checklist enable row level security;
alter table public.rtm_visita_sku       enable row level security;
alter table public.rtm_visita_fotos     enable row level security;

-- Configuração e listas: todo mundo lê, gestor escreve.
do $$
declare t text;
begin
  foreach t in array array['rtm_config', 'rtm_motivos', 'rtm_checklist_itens'] loop
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (true)', t || '_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_write', t);
    execute format(
      'create policy %I on public.%I for all to authenticated
         using (public.is_manager_or_admin(auth.uid()))
         with check (public.is_manager_or_admin(auth.uid()))', t || '_write', t);
  end loop;
end $$;

-- Plano: o vendedor vê e mexe no próprio; o gestor, em todos.
drop policy if exists rtm_plan_select on public.rtm_visita_planejada;
create policy rtm_plan_select on public.rtm_visita_planejada
  for select to authenticated
  using (vendedor_id = auth.uid() or public.is_manager_or_admin(auth.uid()));

drop policy if exists rtm_plan_write on public.rtm_visita_planejada;
create policy rtm_plan_write on public.rtm_visita_planejada
  for all to authenticated
  using (vendedor_id = auth.uid() or public.is_manager_or_admin(auth.uid()))
  with check (vendedor_id = auth.uid() or public.is_manager_or_admin(auth.uid()));

-- Visita: mesma regra na leitura. Na escrita, o vendedor só cria visita PARA
-- SI — sem isso um vendedor poderia lançar visita no nome de outro, e a
-- positivação viraria número sem dono.
drop policy if exists rtm_visita_select on public.rtm_visitas;
create policy rtm_visita_select on public.rtm_visitas
  for select to authenticated
  using (vendedor_id = auth.uid() or public.is_manager_or_admin(auth.uid()));

drop policy if exists rtm_visita_insert on public.rtm_visitas;
create policy rtm_visita_insert on public.rtm_visitas
  for insert to authenticated
  with check (vendedor_id = auth.uid());

-- ⚠️ Sem policy de DELETE, em nenhuma das tabelas de registro, e isso é
-- proposital: o congelamento do trigger não valeria nada se a linha pudesse
-- ser apagada. Visita errada se corrige com linha nova, nunca sumindo.
drop policy if exists rtm_visita_update on public.rtm_visitas;
create policy rtm_visita_update on public.rtm_visitas
  for update to authenticated
  using (vendedor_id = auth.uid() or public.is_manager_or_admin(auth.uid()))
  with check (vendedor_id = auth.uid() or public.is_manager_or_admin(auth.uid()));

-- Filhos da visita: herdam o acesso da visita. Escrita só na visita aberta,
-- o que o trigger já garante — aqui é só o dono.
do $$
declare t text;
begin
  foreach t in array array['rtm_visita_checklist', 'rtm_visita_sku', 'rtm_visita_fotos'] loop
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format(
      'create policy %I on public.%I for select to authenticated
         using (exists (select 1 from public.rtm_visitas v
                         where v.id = visita_id
                           and (v.vendedor_id = auth.uid() or public.is_manager_or_admin(auth.uid()))))',
      t || '_select', t);

    execute format('drop policy if exists %I on public.%I', t || '_write', t);
    execute format(
      'create policy %I on public.%I for all to authenticated
         using (exists (select 1 from public.rtm_visitas v
                         where v.id = visita_id and v.vendedor_id = auth.uid()))
         with check (exists (select 1 from public.rtm_visitas v
                              where v.id = visita_id and v.vendedor_id = auth.uid()))',
      t || '_write', t);
  end loop;
end $$;

grant select on public.rtm_visita_card to authenticated;
grant select on public.rtm_agenda      to authenticated;


-- ═══════════════════════════════════════════════════════════════════════════
-- 15. Conferência
-- ═══════════════════════════════════════════════════════════════════════════

-- (a) As tabelas nasceram?
select table_name
from information_schema.tables
where table_schema = 'public' and table_name like 'rtm\_%'
order by table_name;

-- (b) O checklist e os motivos entraram?
select 'checklist' as lista, codigo as id, label, ordem from public.rtm_checklist_itens where ativo
union all
select 'motivo', id, label, ordem from public.rtm_motivos where ativo
order by lista, ordem;

-- (c) ⚠️ Quantos PDVs têm coordenada? É esse número que diz o quanto o
--     "confirmar local" vai conseguir dizer alguma coisa. Se for baixo, a
--     coluna de distância nasce quase toda nula — o que é honesto, mas
--     precisa ser sabido antes de alguém cobrar o vendedor por ela.
select count(*)                                                as pdvs,
       count(latitude)                                          as com_coordenada,
       round(100.0 * count(latitude) / nullif(count(*), 0), 1)  as pct
from public.pdvs
where status <> 'inactive';
