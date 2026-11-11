-- ════════════════════════════════════════════════════════════════════════
-- Máquina de Vendas — o lead da LANDING PAGE entra sozinho no pipeline
--
-- A landing chama, do navegador do visitante, com a chave PÚBLICA (anon):
--   POST <SUPABASE_URL>/rest/v1/rpc/mv_lead_receber
--   apikey: <anon key>      Content-Type: application/json
--   { "p": { "nome": "...", "whatsapp": "...", "cidade": "...", "uf": "RN",
--            "veiculo": "...", "veiculos": 2, "email": "...", "mensagem": "...",
--            "utm_source": "...", "utm_campaign": "...", "pagina": "...", "site": "" } }
-- Resposta: { "ok": true, "id": "<uuid>" } ou { "ok": false, "erro": "<código>" }.
--
-- ⚠️ É a ÚNICA função do pipeline que `anon` executa, e é de propósito: o
--    visitante não tem login. Ela é a porta inteira — valida, limita, deduplica
--    e grava SÓ os campos de entrada. Nada de `insert` aberto em `mv_leads`:
--    anon escreveria etapa, técnico, valor e agenda.
-- ⚠️ Nasce DESLIGADA (`mv_config.aceitar_landing = false`): a Máquina de Vendas
--    está parada; ligar é um UPDATE no dia em que ela voltar.
-- ⚠️ Mesmo telefone com lead ABERTO não cria outro: a mensagem nova entra nas
--    anotações do existente e o responsável é avisado ("voltou pela landing").
-- ⚠️ `site` é ARMADILHA para robô (campo escondido na landing): veio preenchido,
--    responde ok e não grava nada — robô que recebe erro tenta de novo.
-- ⚠️ Teto por IP (5 em 10 min) e geral (`teto_por_minuto`). O IP vem do
--    cabeçalho que o PostgREST repassa e é guardado só como HASH, por 1 dia.
-- ════════════════════════════════════════════════════════════════════════

-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — colunas, configuração e a função de entrada             ║
-- ╚═══════════════════════════════════════════════════════════════════╝
alter table public.mv_leads add column if not exists origem text not null default 'manual';
alter table public.mv_leads add column if not exists email  text;
alter table public.mv_leads add column if not exists utm    jsonb;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'mv_leads_origem_valida') then
    alter table public.mv_leads add constraint mv_leads_origem_valida check (origem in ('manual','landing'));
  end if;
end $$;
create index if not exists mv_leads_whatsapp_idx
  on public.mv_leads (regexp_replace(coalesce(whatsapp, ''), '\D', '', 'g')) where arquivado_em is null;

-- Linha única. Quem recebe o lead novo é CADASTRO, nunca constante no código.
create table if not exists public.mv_config (
  id                     boolean primary key default true check (id),
  aceitar_landing        boolean not null default false,
  responsavel_padrao_id  uuid references auth.users(id) on delete set null,
  avisar                 uuid[] not null default '{}',
  teto_por_minuto        int not null default 20 check (teto_por_minuto between 1 and 1000)
);
insert into public.mv_config (id) values (true) on conflict do nothing;
alter table public.mv_config enable row level security;
drop policy if exists mv_config_ler on public.mv_config;
create policy mv_config_ler on public.mv_config for select to authenticated using ((select public.carbo_e_time_interno()));
grant select on public.mv_config to authenticated;

create table if not exists public.mv_entrada_log (
  id      bigint generated always as identity primary key,
  ip_hash text,
  em      timestamptz not null default now()
);
create index if not exists mv_entrada_log_idx on public.mv_entrada_log (em, ip_hash);
alter table public.mv_entrada_log enable row level security;  -- sem policy: só a função

create or replace function public.mv_lead_receber(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  c        public.mv_config;
  v_nome   text;
  v_fone   text;
  v_uf     text;
  v_qtd    int;
  v_msg    text;
  v_email  text;
  v_utm    jsonb;
  v_ip     text;
  v_hash   text;
  v_id     uuid;
  v_dup    public.mv_leads;
  v_quem   uuid[];
  v_titulo text;
  v_corpo  text;
begin
  select * into c from public.mv_config where id;
  if c is null or not c.aceitar_landing then
    return jsonb_build_object('ok', false, 'erro', 'desligado');
  end if;
  if p is null or jsonb_typeof(p) <> 'object' or length(p::text) > 20000 then
    return jsonb_build_object('ok', false, 'erro', 'formato');
  end if;
  -- Armadilha para robô: finge que deu certo.
  if nullif(trim(coalesce(p->>'site', '')), '') is not null then
    return jsonb_build_object('ok', true);
  end if;

  -- Limites: por IP (5 em 10 min) e geral por minuto.
  begin
    v_ip := trim(split_part(coalesce(current_setting('request.headers', true)::json->>'x-forwarded-for', ''), ',', 1));
  exception when others then v_ip := null; end;
  v_hash := case when nullif(v_ip, '') is null then null else md5('mv:' || v_ip) end;
  if v_hash is not null and (select count(*) from public.mv_entrada_log
                             where ip_hash = v_hash and em > now() - interval '10 minutes') >= 5 then
    return jsonb_build_object('ok', false, 'erro', 'muitas_tentativas');
  end if;
  if (select count(*) from public.mv_entrada_log where em > now() - interval '1 minute') >= c.teto_por_minuto then
    return jsonb_build_object('ok', false, 'erro', 'muitas_tentativas');
  end if;
  insert into public.mv_entrada_log (ip_hash) values (v_hash);
  delete from public.mv_entrada_log where em < now() - interval '1 day';

  v_nome := left(regexp_replace(trim(coalesce(p->>'nome', p->>'name', p->>'nome_completo', '')), '\s+', ' ', 'g'), 120);
  v_fone := regexp_replace(coalesce(p->>'whatsapp', p->>'telefone', p->>'celular', p->>'phone', p->>'fone', ''), '\D', '', 'g');
  if v_fone ~ '^55\d{10,11}$' then v_fone := substr(v_fone, 3); end if;
  if length(v_nome) < 2 then return jsonb_build_object('ok', false, 'erro', 'nome'); end if;
  if v_fone !~ '^\d{10,11}$' then return jsonb_build_object('ok', false, 'erro', 'telefone'); end if;

  v_uf := upper(trim(coalesce(p->>'uf', p->>'estado', '')));
  if v_uf !~ '^[A-Z]{2}$' then v_uf := null; end if;
  begin v_qtd := nullif(regexp_replace(coalesce(p->>'veiculos', p->>'qtd_veiculos', p->>'quantidade', ''), '\D', '', 'g'), '')::int;
  exception when others then v_qtd := null; end;
  if v_qtd is not null and (v_qtd < 1 or v_qtd > 500) then v_qtd := null; end if;
  v_email := lower(left(trim(coalesce(p->>'email', p->>'e-mail', '')), 160));
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then v_email := null; end if;
  v_msg := nullif(left(trim(coalesce(p->>'mensagem', p->>'message', p->>'observacao', '')), 2000), '');
  v_utm := jsonb_strip_nulls(jsonb_build_object(
    'utm_source', left(p->>'utm_source', 120), 'utm_medium', left(p->>'utm_medium', 120),
    'utm_campaign', left(p->>'utm_campaign', 200), 'utm_content', left(p->>'utm_content', 200),
    'utm_term', left(p->>'utm_term', 200), 'pagina', left(coalesce(p->>'pagina', p->>'url'), 500),
    'referrer', left(p->>'referrer', 500), 'recebido_em', now()));

  -- Mesmo telefone com lead aberto: junta, não duplica.
  select * into v_dup from public.mv_leads
   where arquivado_em is null and etapa in ('contato','orcado','agendado')
     and regexp_replace(coalesce(whatsapp, ''), '\D', '', 'g') in (v_fone, '55' || v_fone)
   order by created_at desc limit 1;

  if v_dup.id is not null then
    update public.mv_leads
       set anotacoes = left(concat_ws(E'\n\n', anotacoes,
             '[Landing ' || to_char(now() at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI') || '] '
             || coalesce(v_msg, 'Preencheu o formulário de novo.')), 8000),
           email = coalesce(email, v_email)
     where id = v_dup.id;
    v_id := v_dup.id;
    v_titulo := 'Lead voltou pela landing: ' || left(v_dup.nome, 60);
  else
    v_id := gen_random_uuid();
    insert into public.mv_leads (id, nome, whatsapp, cidade, uf, modelo, veiculos, email, anotacoes,
                                 origem, utm, responsavel_id, created_by)
    values (v_id, v_nome, v_fone,
            nullif(left(trim(coalesce(p->>'cidade', p->>'city', '')), 80), ''), v_uf,
            nullif(left(trim(coalesce(p->>'veiculo', p->>'modelo', p->>'carro', '')), 120), ''),
            v_qtd, v_email, v_msg, 'landing', v_utm, c.responsavel_padrao_id, null);
    v_titulo := 'Novo lead da landing: ' || left(v_nome, 60);
  end if;

  -- Aviso: o responsável padrão (ou o do lead, se já existia) e a lista `avisar`.
  -- Nunca derruba a entrada do lead.
  begin
    v_quem := array(select distinct u from unnest(c.avisar || coalesce(v_dup.responsavel_id, c.responsavel_padrao_id)) u
                     where u is not null);
    v_corpo := concat_ws(' · ',
      nullif(left(trim(coalesce(p->>'veiculo', p->>'modelo', p->>'carro', '')), 60), ''),
      nullif(left(trim(coalesce(p->>'cidade', p->>'city', '')), 60), '') || coalesce('/' || v_uf, ''),
      '(' || substr(v_fone, 1, 2) || ') ' || substr(v_fone, 3, length(v_fone) - 6) || '-' || right(v_fone, 4));
    insert into public.notifications (user_id, type, title, body, reference_type, reference_id, is_read)
    select u, 'mv_novo_lead', v_titulo, v_corpo, 'mv_lead', v_id::text, false
    from unnest(v_quem) u;
  exception when others then
    raise warning 'mv_lead_receber aviso: %', sqlerrm;
  end;

  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

-- A porta da landing: anon executa, de propósito (ver o cabeçalho).
revoke execute on function public.mv_lead_receber(jsonb) from public;
grant execute on function public.mv_lead_receber(jsonb) to anon, authenticated;

insert into public.carbo_notif_tipos (tipo, referencia, aba, rotulo, descricao) values
  ('mv_novo_lead', '', 'pessoal', 'Lead da landing', 'Lead novo (ou que voltou) pelo formulário da landing da Máquina de Vendas.')
on conflict do nothing;

-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — LIGAR (editar o e-mail antes; só quando a MV voltar)     ║
-- ╚═══════════════════════════════════════════════════════════════════╝
-- do $$
-- declare v_email text := null;   -- ← e-mail de quem recebe os leads (ex.: o do Lorran)
--         v_id uuid;
-- begin
--   if v_email is null then raise exception 'Preencha v_email antes de rodar.'; end if;
--   select id into v_id from auth.users where lower(email) = lower(v_email);
--   if v_id is null then raise exception 'Nenhum usuário com o e-mail %', v_email; end if;
--   update public.mv_config set responsavel_padrao_id = v_id, aceitar_landing = true where id;
-- end $$;

-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 3 — teste pelo SQL Editor (cria um lead de teste e arquiva)  ║
-- ╚═══════════════════════════════════════════════════════════════════╝
-- select public.mv_lead_receber('{"nome":"Teste Landing","whatsapp":"(84) 90000-0000","cidade":"Natal","uf":"RN","veiculo":"Hilux 2019","utm_source":"teste"}');
-- update public.mv_leads set arquivado_em = now() where nome = 'Teste Landing' and origem = 'landing';
