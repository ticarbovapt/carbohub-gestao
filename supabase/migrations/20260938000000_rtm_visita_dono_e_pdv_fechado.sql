-- ─────────────────────────────────────────────────────────────────────────────
-- RTM: três buracos achados na revisão do fluxo de visita
--
-- Uma revisão do caminho inteiro (agendar → check-in → conferência → foto →
-- check-out) encontrou os três problemas corrigidos aqui. Os três eram
-- SILENCIOSOS — nenhum deles dá erro para quem está usando.
-- ─────────────────────────────────────────────────────────────────────────────

-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — 🔴 `rtm_fechar_visita` não conferia DONO                    ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
--
-- A função é `security definer` (precisa ser: ela escreve em tabelas que o
-- vendedor não pode escrever direto) e tem `grant execute to authenticated` —
-- mas o corpo inteiro não mencionava `auth.uid()` nenhuma vez. Ela recebia
-- `p_visita_id` de fora e fechava.
--
-- ⚠️ Efeito: QUALQUER usuário logado podia fechar a visita aberta de qualquer
-- vendedor, escolhendo resultado, motivo e coordenadas de check-out — e isso
-- inclui o lojista do portal e o licenciado, que compartilham a tabela
-- `profiles` e também são `authenticated`. Como o fechamento marca o plano como
-- `cumprida`, dava para mexer na aderência, que é o indicador que esta fase
-- inteira existe para produzir.
--
-- E o congelamento não protegia: o trigger barra edição DEPOIS do check-out;
-- quem fecha primeiro é quem escreve o registro definitivo.
--
-- A correção é a checagem explícita. Em `security definer` ela nunca é
-- automática — é justamente o que o `definer` desliga.

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
  sem_conferencia boolean;
begin
  select * into v from public.rtm_visitas where id = p_visita_id for update;
  if not found then
    raise exception 'Visita % não encontrada.', p_visita_id using errcode = 'no_data_found';
  end if;

  -- ⚠️ A CHECAGEM QUE FALTAVA. Gestor fecha (acontece: vendedor sai de campo
  -- sem sinal e alguém encerra pelo escritório), mas terceiro nenhum.
  if v.vendedor_id <> auth.uid() and not public.is_manager_or_admin(auth.uid()) then
    raise exception 'Esta visita é de outra pessoa.' using errcode = 'insufficient_privilege';
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

  -- ╔═══════════════════════════════════════════════════════════════════╗
  -- ║ BLOCO 2 — 🔴 "PDV fechado" nunca conseguia fechar                 ║
  -- ╚═══════════════════════════════════════════════════════════════════╝
  --
  -- A TELA já pulava checklist e foto em `pdv_fechado`/`nao_atendido`
  -- (`semConferencia`, em Visita.tsx). O BANCO pulava só a foto. O checklist
  -- semeado tem `expositor_presente` como obrigatório — então esses dois
  -- resultados eram recusados aqui, para sempre.
  --
  -- ⚠️ E a recusa era invisível: a tela dizia "Visita concluída e enviada",
  -- voltava para a agenda, e a fila tentava de novo a cada 45 s sem que
  -- ninguém visse o erro. Com `fechamento` preenchido a tela trava os campos,
  -- então o vendedor também não tinha como corrigir. A visita morria no
  -- aparelho — e "PDV fechado" é um dos desfechos mais comuns em campo.
  --
  -- A regra estava em DOIS lugares e eles discordavam. Agora ela está aqui, e
  -- a tela só antecipa o que o banco decide.
  sem_conferencia := p_resultado in ('pdv_fechado', 'nao_atendido');

  if not sem_conferencia then
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
  end if;

  -- Foto do expositor. Dispensada pela MESMA condição: não existe foto de
  -- expositor com a porta fechada, e exigir isso ensinaria o vendedor a
  -- fotografar qualquer coisa para o sistema deixar passar.
  select valor = 'true' into exige_foto from public.rtm_config where chave = 'foto_expositor_obrigatoria';
  if coalesce(exige_foto, false) and not sem_conferencia then
    select exists (
      select 1 from public.rtm_visita_fotos f where f.visita_id = v.id and f.tipo = 'expositor'
    ) into tem_foto;
    if not tem_foto then
      raise exception 'Falta a foto do expositor.' using errcode = 'check_violation';
    end if;
  end if;

  update public.rtm_visitas set
    resultado             = p_resultado,
    motivo_id             = p_motivo_id,
    motivo_texto          = p_motivo_texto,
    proximo_passo         = p_proximo_passo,
    proximo_passo_em      = p_proximo_passo_em,
    checkout_lat          = p_lat,
    checkout_lng          = p_lng,
    checkout_precisao_m   = p_precisao_m,
    ts_dispositivo_checkout = p_ts_dispositivo,
    ts_checkout           = now()
  where id = v.id
  returning * into v;

  if v.visita_planejada_id is not null then
    update public.rtm_visita_planejada
       set status = 'cumprida'
     where id = v.visita_planejada_id;
  end if;

  return v;
end $$;

comment on function public.rtm_fechar_visita is
  'Fecha a visita. ⚠️ security definer COM checagem de dono (vendedor ou gestor): sem ela, qualquer authenticated fechava a visita de qualquer um. Checklist e foto são dispensados nos MESMOS dois resultados (pdv_fechado, nao_atendido) — a tela só antecipa o que esta função decide.';

-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 3 — o plano alheio                                              ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
--
-- `rtm_abrir_visita` força `vendedor_id = auth.uid()` no INSERT (certo), mas
-- aceitava `p_visita_planejada_id` de qualquer um: dava para pendurar a própria
-- visita no plano do colega e, ao fechar, marcar o plano dele como cumprido.
--
-- Em vez de reescrever a função inteira, o vínculo é conferido por gatilho —
-- ele pega TODOS os caminhos, inclusive INSERT direto pela policy.

create or replace function public.rtm_plano_e_meu()
returns trigger language plpgsql security definer set search_path = public as $$
declare dono uuid;
begin
  if new.visita_planejada_id is null then return new; end if;
  select vendedor_id into dono
  from public.rtm_visita_planejada where id = new.visita_planejada_id;
  if dono is null then return new; end if;
  if dono <> new.vendedor_id and not public.is_manager_or_admin(auth.uid()) then
    raise exception 'Este planejamento é de outro vendedor.' using errcode = 'insufficient_privilege';
  end if;
  return new;
end $$;

drop trigger if exists trg_rtm_plano_e_meu on public.rtm_visitas;
create trigger trg_rtm_plano_e_meu
  before insert or update of visita_planejada_id on public.rtm_visitas
  for each row execute function public.rtm_plano_e_meu();

-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 4 — 🔴 o bucket sem UPDATE: o reenvio quebrava                  ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
--
-- O bucket `rtm-visitas` tem policy de INSERT, SELECT e DELETE — não de UPDATE.
-- Mas o `rtmFila.ts` sobe com `upsert: true` (de propósito: "reenvio sobrescreve
-- o mesmo objeto" é a premissa de idempotência da fila).
--
-- ⚠️ No Storage, `upsert` sobre objeto QUE JÁ EXISTE é UPDATE em
-- `storage.objects`. Sem policy, volta 403. Ou seja: a primeira tentativa
-- funciona, e toda tentativa seguinte morre no upload — exatamente no cenário
-- de rede ruim para o qual a fila foi escrita. A visita ficava presa para
-- sempre.

drop policy if exists rtm_fotos_update on storage.objects;
create policy rtm_fotos_update on storage.objects
  for update to authenticated
  using (bucket_id = 'rtm-visitas'
         and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'rtm-visitas'
              and (storage.foldername(name))[1] = auth.uid()::text);

-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 5 — o plano não se apaga                                        ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
--
-- `rtm_plan_write` era `for all`, o que inclui DELETE. Isso contradiz o desenho
-- da própria migração: `cancelamento_motivo` existe porque "'não foi' sem
-- porquê não vira aprendizado nenhum", e `nao_cumprida` é o único registro do
-- que deixou de acontecer. Com DELETE liberado, quem não cumpriu o roteiro
-- apagava a linha e a não-conformidade sumia sem rastro — inclusive um plano
-- criado pelo gestor.
--
-- Mesma regra do resto do RTM: sem policy de DELETE em tabela de registro.

drop policy if exists rtm_plan_write on public.rtm_visita_planejada;

create policy rtm_plan_insert on public.rtm_visita_planejada
  for insert to authenticated
  with check (vendedor_id = auth.uid() or public.is_manager_or_admin(auth.uid()));

create policy rtm_plan_update on public.rtm_visita_planejada
  for update to authenticated
  using (vendedor_id = auth.uid() or public.is_manager_or_admin(auth.uid()))
  with check (vendedor_id = auth.uid() or public.is_manager_or_admin(auth.uid()));

-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 6 — conferência                                                 ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- (a) A função agora menciona auth.uid() — se vier 0, a checagem de dono sumiu.
select count(*) as tem_checagem_de_dono
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'rtm_fechar_visita'
  and p.prosrc ilike '%vendedor_id <> auth.uid()%';

-- (b) O bucket tem as QUATRO policies (insert, select, update, delete).
select policyname, cmd from pg_policies
where tablename = 'objects' and schemaname = 'storage'
  and policyname ilike 'rtm_fotos%'
order by cmd;

-- (c) O plano não aceita mais DELETE.
select policyname, cmd from pg_policies
where tablename = 'rtm_visita_planejada' order by cmd;

-- (d) ⚠️ As visitas que estavam PRESAS: abertas, com resultado de PDV fechado
--     preenchido pela tela e recusadas pelo banco. Depois desta migração o
--     próximo reenvio da fila fecha sozinho — esta consulta é para saber
--     quantas eram, não para consertar nada à mão.
select count(*) as visitas_abertas_ha_mais_de_1h
from public.rtm_visitas
where ts_checkout is null and ts_checkin < now() - interval '1 hour';
