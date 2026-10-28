-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ Notificações: QUEM RECEBE O QUÊ, por aba, com padrão pelo APP           ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- Pedido do dono do processo (28/10/2026): o sininho de todo mundo enche de
-- aviso que não é da pessoa, e a notificação real some no meio. A tela do TI
-- "Quem recebe a venda" vira "Notificações", com uma aba por assunto (vendas
-- internas, vendas online, marketing…) e um interruptor por pessoa.
-- Regra de partida: quem tem o APP que gera o aviso recebe; quem não tem, não.
--
-- O DESENHO: um PORTEIRO só, em vez de mexer nas ~25 funções que geram aviso.
--   carbo_notif_abas      as abas da tela (CADASTRO): modo e apps de cada uma
--   carbo_notif_tipos     tipo de notificação → aba (CADASTRO)
--   carbo_notif_escolha   o interruptor por pessoa e aba (ligado/desligado à mão)
--   carbo_notif_config    o interruptor GERAL do filtro (nasce DESLIGADO)
--   trg_notificacao_filtro  BEFORE INSERT em notifications: devolve NULL para
--                          quem não deve receber — a linha nem nasce, então
--                          sininho, som, toast e celular somem JUNTOS.
--
-- ⚠️ O porteiro só TIRA, nunca acrescenta: quem a função geradora não escolheu
--    continua sem receber. Ele é um E em cima do que já existe.
-- ⚠️ Tipo NÃO CADASTRADO passa (e aparece na aba "Sem aba" da tela). Aviso
--    novo que some calado porque ninguém o classificou é pior que aviso a mais.
-- ⚠️ Erro dentro do porteiro DEIXA PASSAR (exception → new). Notificação
--    perdida por defeito do filtro não volta mais.
-- ⚠️ Três MODOS de aba:
--    app      padrão = tem uma das flags da aba; o interruptor muda por pessoa
--    lista    o próprio gerador já escolhe quem recebe (venda online →
--             carbo_aviso_venda_online; mensagem de cliente → carbo_wa_notificados).
--             O porteiro não mexe: a tela edita aquela lista.
--    pessoal  aviso dirigido A VOCÊ (menção, seu chamado, seu curso): padrão
--             recebe; o interruptor pode desligar.
-- ⚠️ `ecommerce_sale` serve a DUAS coisas: a venda interna (reference_type
--    `carboze_order`) e a on-line (`ecommerce_order`). Por isso o cadastro é
--    por (tipo, referência), e a referência vazia vale para o resto.

-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 0 — MEDIR (só lê). Rode ANTES. Uma consulta só, para o SQL Editor ║
-- ║ mostrar o resultado (ele exibe só a ÚLTIMA consulta do bloco).          ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- O que chegou nos últimos 30 dias, por tipo: quantas linhas, para quantas
-- pessoas, e quantos AVISOS (mesmo título no mesmo minuto = um aviso só,
-- multiplicado pelo fan-out). ESPERADO: uma tabela, ordenada pelo volume.
-- Tipo que não estiver na lista do BLOCO 1 aparece depois na aba "Sem aba".
--
-- select type, coalesce(reference_type, '') as referencia,
--        count(*) as linhas,
--        count(distinct user_id) as pessoas,
--        count(distinct (title, date_trunc('minute', created_at))) as avisos,
--        round(count(*)::numeric / nullif(count(distinct (title, date_trunc('minute', created_at))), 0), 1) as pessoas_por_aviso,
--        count(*) filter (where not is_read) as nao_lidas
--   from public.notifications
--  where created_at > now() - interval '30 days'
--  group by 1, 2
--  order by linhas desc;

-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — CRIAR (não muda o que ninguém recebe: o filtro nasce OFF)     ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- ESPERADO: "Success. No rows returned".

create table if not exists public.carbo_notif_abas (
  aba        text primary key,
  rotulo     text not null,
  descricao  text not null default '',
  modo       text not null check (modo in ('app', 'lista', 'pessoal')),
  apps       text[] not null default '{}',
  ordem      int not null default 100
);
comment on table public.carbo_notif_abas is
  'As abas da tela Notificações (TI). modo app = padrão por flag do app; lista = o gerador escolhe (a tela edita a lista dele); pessoal = aviso dirigido à pessoa. CADASTRO: aba nova é INSERT.';

create table if not exists public.carbo_notif_tipos (
  tipo        text not null,
  referencia  text not null default '',   -- reference_type; '' = qualquer outra
  aba         text not null references public.carbo_notif_abas(aba),
  rotulo      text not null,
  descricao   text not null default '',
  primary key (tipo, referencia)
);
comment on table public.carbo_notif_tipos is
  'Tipo de notificação → aba. ⚠️ Tipo fora daqui PASSA pelo filtro e aparece na aba "Sem aba" da tela — é a lista de trabalho.';

create table if not exists public.carbo_notif_escolha (
  user_id       uuid not null references public.profiles(id) on delete cascade,
  aba           text not null references public.carbo_notif_abas(aba) on delete cascade,
  recebe        boolean not null,
  definido_por  uuid,
  definido_em   timestamptz not null default now(),
  primary key (user_id, aba)
);
create index if not exists carbo_notif_escolha_aba_idx on public.carbo_notif_escolha (aba);
comment on table public.carbo_notif_escolha is
  'O interruptor por pessoa e aba. Sem linha = vale o padrão da aba. "Voltar ao padrão" APAGA a linha.';

create table if not exists public.carbo_notif_config (
  id            boolean primary key default true check (id),
  filtro_ativo  boolean not null default false,
  ligado_em     timestamptz,
  ligado_por    uuid
);
insert into public.carbo_notif_config (id) values (true) on conflict do nothing;
comment on table public.carbo_notif_config is
  'O interruptor GERAL. Nasce false: as escolhas ficam salvas mas ninguém deixa de receber até ligar (BLOCO 3).';

-- Ninguém lê nem escreve pelo PostgREST: a tela usa as duas RPCs abaixo.
alter table public.carbo_notif_abas    enable row level security;
alter table public.carbo_notif_tipos   enable row level security;
alter table public.carbo_notif_escolha enable row level security;
alter table public.carbo_notif_config  enable row level security;

-- ── O cadastro inicial ────────────────────────────────────────────────────
-- ⚠️ `on conflict do nothing`: rodar de novo não desfaz o que o TI já mudou.
insert into public.carbo_notif_abas (aba, rotulo, descricao, modo, apps, ordem) values
  ('venda_interna', 'Vendas internas',
   'O "🎉 Nova venda!" de cada venda feita pelo /vender.',
   'app', array['carbo_crm','carbo_admin'], 10),
  ('venda_online', 'Vendas online',
   'A venda do e-commerce (som, toast, sininho e celular). Só recebe quem for ligado à mão.',
   'lista', '{}', 20),
  ('ecommerce', 'E-commerce e Esteira',
   'Resumo diário dos pedidos parados na Esteira, etiqueta morta e canal de e-commerce desconectado.',
   'app', array['carbo_admin','carbo_mkt','carbo_atendimento'], 30),
  ('atendimento', 'Mensagem de cliente',
   'Cliente respondeu no WhatsApp. A lista é a da tela Conversas, no Atendimento.',
   'lista', '{}', 40),
  ('marketing', 'Quadros do Marketing',
   'Menção, prazo, lembrete, cartão seguido e quadro compartilhado.',
   'app', array['carbo_mkt'], 50),
  ('financas', 'Finanças e Compras',
   'Requisição de compra esperando aprovação e ordem de compra nova.',
   'app', array['carbo_financas'], 60),
  ('estoque', 'Estoque e Operação',
   'Estoque baixo na caixa de vendedor e nas máquinas.',
   'app', array['carbo_ops'], 70),
  ('ti', 'TI e Academy',
   'Chamado novo, chamado atribuído e pedido de acesso a curso do Academy.',
   'app', array['carbo_ti'], 80),
  ('chat', 'Carbo Chat',
   'Mensagem e lembrete de comunicado do chat.',
   'pessoal', '{}', 90),
  ('pessoal', 'Avisos para você',
   'Avisos dirigidos à pessoa: menção, o próprio chamado, a NF cancelada da própria venda, curso liberado.',
   'pessoal', '{}', 100)
on conflict (aba) do nothing;

insert into public.carbo_notif_tipos (tipo, referencia, aba, rotulo, descricao) values
  ('ecommerce_sale', 'carboze_order', 'venda_interna', 'Nova venda', 'Venda registrada pelo /vender.'),
  ('ecommerce_sale', 'ecommerce_order', 'venda_online', 'Venda on-line', 'Venda paga no e-commerce (inclusive upsell).'),
  ('ecommerce_sale', '', 'venda_online', 'Venda', 'Venda sem referência conhecida.'),
  ('esteira_parado_resumo', '', 'ecommerce', 'Pedidos parados', 'Resumo diário da Esteira do On-line.'),
  ('esteira_etiqueta_morta', '', 'ecommerce', 'Etiqueta morta', 'Etiqueta cancelada ou vencida num pedido que não saiu.'),
  ('ecommerce_disconnected', '', 'ecommerce', 'E-commerce caído', 'Um canal de e-commerce perdeu a conexão.'),
  ('wa_inbound', '', 'atendimento', 'Cliente respondeu', 'Mensagem nova de cliente no WhatsApp.'),
  ('mkt_mencao', '', 'marketing', 'Menção no quadro', 'Alguém citou a pessoa num cartão.'),
  ('mkt_seguindo', '', 'marketing', 'Cartão seguido', 'Comentário, mudança de lista ou arquivamento de cartão/lista seguido.'),
  ('mkt_prazo', '', 'marketing', 'Prazo e lembrete', 'Prazo de cartão chegando, atrasado ou lembrete.'),
  ('mkt_quadro', '', 'marketing', 'Quadro compartilhado', 'A pessoa foi adicionada a um quadro.'),
  ('finance_rc_pendente', '', 'financas', 'Requisição a aprovar', 'Requisição de compra esperando aprovação.'),
  ('finance_oc_nova', '', 'financas', 'Ordem de compra nova', 'Ordem de compra gerada.'),
  ('estoque_vendedor_baixo', '', 'estoque', 'Caixa de vendedor baixa', 'Produto abaixo do mínimo na caixa de um vendedor.'),
  ('low_stock_alert', '', 'estoque', 'Máquina com estoque baixo', 'Alerta de estoque baixo de máquina.'),
  ('bug_report', '', 'ti', 'Chamado novo', 'Bug, sugestão ou pedido aberto ao TI.'),
  ('bug_assigned', '', 'ti', 'Chamado atribuído', 'Um chamado foi atribuído à pessoa.'),
  ('academy_acesso', '', 'ti', 'Pedido de acesso ao Academy', 'Alguém pediu acesso a um curso.'),
  ('chat_message', '', 'chat', 'Mensagem no chat', 'Mensagem ou menção numa conversa do Carbo Chat.'),
  ('announcement_reminder', '', 'chat', 'Lembrete de comunicado', 'Comunicado do chat ainda não confirmado.'),
  ('mention', '', 'pessoal', 'Menção', 'Alguém citou a pessoa.'),
  ('action_assigned', '', 'pessoal', 'Ação atribuída', 'Uma ação foi atribuída à pessoa.'),
  ('action_completed', '', 'pessoal', 'Ação concluída', 'Uma ação da pessoa foi concluída.'),
  ('message', '', 'pessoal', 'Mensagem', 'Mensagem dirigida à pessoa.'),
  ('bug_update', '', 'pessoal', 'Seu chamado andou', 'O TI respondeu ou mudou o chamado da pessoa.'),
  ('bug_resolved', '', 'pessoal', 'Seu chamado resolvido', 'O chamado da pessoa foi resolvido.'),
  ('nf_invalida', '', 'pessoal', 'NF da sua venda cancelada', 'A nota de uma venda da pessoa foi cancelada no Bling.'),
  ('academy_liberado', '', 'pessoal', 'Curso liberado', 'O acesso pedido ao Academy foi liberado.'),
  ('request_confirmed', '', 'pessoal', 'Pedido confirmado', 'Pedido do licenciado confirmado.'),
  ('push_teste', '', 'pessoal', 'Teste do celular', 'O botão de teste do aviso no celular.')
on conflict (tipo, referencia) do nothing;

-- ── A regra (sem olhar o interruptor geral) ──────────────────────────────
create or replace function public.carbo_notif_regra(p_user uuid, p_tipo text, p_ref text)
returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
  v_aba    text;
  v_modo   text;
  v_apps   text[];
  v_esc    boolean;
begin
  select t.aba, a.modo, a.apps into v_aba, v_modo, v_apps
    from public.carbo_notif_tipos t
    join public.carbo_notif_abas a on a.aba = t.aba
   where t.tipo = p_tipo and t.referencia in (coalesce(p_ref, ''), '')
   order by (t.referencia = '')            -- a referência exata vence a genérica
   limit 1;

  if v_aba is null or v_modo = 'lista' then
    return true;                           -- desconhecido passa; lista é do gerador
  end if;

  select e.recebe into v_esc
    from public.carbo_notif_escolha e
   where e.user_id = p_user and e.aba = v_aba;
  if v_esc is not null then
    return v_esc;
  end if;

  if v_modo = 'pessoal' then
    return true;
  end if;

  return exists (select 1 from public.profiles p
                  where p.id = p_user
                    and coalesce(p.allowed_interfaces, '{}') && v_apps);
end $$;
revoke execute on function public.carbo_notif_regra(uuid, text, text) from public, anon, authenticated;
grant  execute on function public.carbo_notif_regra(uuid, text, text) to service_role;

-- ── O porteiro ───────────────────────────────────────────────────────────
create or replace function public.trg_notificacao_filtro()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not coalesce((select filtro_ativo from public.carbo_notif_config where id), false) then
    return new;
  end if;
  if public.carbo_notif_regra(new.user_id, new.type, new.reference_type) then
    return new;
  end if;
  return null;                              -- não nasce: sem sininho, som nem celular
exception when others then
  return new;                               -- defeito do filtro nunca some com aviso
end $$;
revoke execute on function public.trg_notificacao_filtro() from public, anon, authenticated;

drop trigger if exists trg_notificacao_filtro on public.notifications;
create trigger trg_notificacao_filtro
  before insert on public.notifications
  for each row execute function public.trg_notificacao_filtro();

-- ── A tela: tudo numa leitura só ─────────────────────────────────────────
-- ⚠️ jsonb, nunca `setof`: o teto de 1.000 do PostgREST vale para RPC.
create or replace function public.carbo_notif_painel()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_r jsonb;
begin
  if not public.carbo_tem_app(array['carbo_ti','carbo_admin']) then
    raise exception 'Sem permissão: só quem tem o TI ou o Admin define as notificações.'
      using errcode = '42501';
  end if;

  with uso as (
    select n.type as tipo, coalesce(n.reference_type, '') as referencia,
           count(*) as linhas, count(distinct n.user_id) as pessoas
      from public.notifications n
     where n.created_at > now() - interval '30 days'
     group by 1, 2
  ), classif as (
    select u.*, (
             select t.aba from public.carbo_notif_tipos t
              where t.tipo = u.tipo and t.referencia in (u.referencia, '')
              order by (t.referencia = '') limit 1) as aba
      from uso u
  )
  select jsonb_build_object(
    'filtro_ativo', coalesce((select filtro_ativo from public.carbo_notif_config where id), false),
    'abas', coalesce((select jsonb_agg(to_jsonb(a) order by a.ordem) from public.carbo_notif_abas a), '[]'),
    'tipos', coalesce((
      select jsonb_agg(jsonb_build_object(
               'tipo', t.tipo, 'referencia', t.referencia, 'aba', t.aba,
               'rotulo', t.rotulo, 'descricao', t.descricao,
               'linhas_30d', coalesce((select sum(c.linhas) from classif c
                                        where c.tipo = t.tipo and c.referencia = t.referencia), 0),
               'pessoas_30d', coalesce((select max(c.pessoas) from classif c
                                         where c.tipo = t.tipo and c.referencia = t.referencia), 0))
             order by t.aba, t.rotulo)
        from public.carbo_notif_tipos t), '[]'),
    'sem_aba', coalesce((
      select jsonb_agg(jsonb_build_object('tipo', c.tipo, 'referencia', c.referencia,
                                          'linhas_30d', c.linhas, 'pessoas_30d', c.pessoas)
                       order by c.linhas desc)
        from classif c where c.aba is null), '[]'),
    'pessoas', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', p.id, 'nome', p.full_name, 'avatar_url', p.avatar_url,
               'departamento', p.department::text, 'funcao', p.funcao,
               'departamento_2', p.secondary_department::text, 'funcao_2', p.secondary_funcao,
               'apps', coalesce(p.allowed_interfaces, '{}'))
             order by p.full_name)
        from public.profiles p
       where public.carbo_interface_e_interna(p.allowed_interfaces)
         and coalesce(p.status, '') not in ('deleted', 'rejected')), '[]'),
    'escolhas', coalesce((
      select jsonb_agg(jsonb_build_object('user_id', e.user_id, 'aba', e.aba, 'recebe', e.recebe,
                                          'definido_em', e.definido_em, 'definido_por_nome', dp.full_name))
        from public.carbo_notif_escolha e
        left join public.profiles dp on dp.id = e.definido_por), '[]')
  ) into v_r;
  return v_r;
end $$;
revoke execute on function public.carbo_notif_painel() from public, anon;
grant  execute on function public.carbo_notif_painel() to authenticated;

-- p_recebe NULL = volta ao padrão da aba (apaga a escolha).
create or replace function public.carbo_notif_definir(p_user uuid, p_aba text, p_recebe boolean)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_modo text;
begin
  if not public.carbo_tem_app(array['carbo_ti','carbo_admin']) then
    raise exception 'Sem permissão: só quem tem o TI ou o Admin define as notificações.'
      using errcode = '42501';
  end if;
  select modo into v_modo from public.carbo_notif_abas where aba = p_aba;
  if v_modo is null then
    raise exception 'Aba desconhecida: %', p_aba using errcode = '22023';
  end if;
  if v_modo = 'lista' then
    raise exception 'Esta aba tem lista própria; ela é editada na própria aba.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles p
                  where p.id = p_user and public.carbo_interface_e_interna(p.allowed_interfaces)) then
    raise exception 'Só quem é do time interno entra nesta lista.' using errcode = '42501';
  end if;

  if p_recebe is null then
    delete from public.carbo_notif_escolha where user_id = p_user and aba = p_aba;
  else
    insert into public.carbo_notif_escolha as e (user_id, aba, recebe, definido_por, definido_em)
    values (p_user, p_aba, p_recebe, auth.uid(), now())
    on conflict (user_id, aba) do update
       set recebe = excluded.recebe, definido_por = excluded.definido_por, definido_em = now()
     where e.recebe is distinct from excluded.recebe;
  end if;
end $$;
revoke execute on function public.carbo_notif_definir(uuid, text, boolean) from public, anon;
grant  execute on function public.carbo_notif_definir(uuid, text, boolean) to authenticated;

-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — ENSAIO (só lê): o que o filtro teria cortado nos 30 dias     ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- Roda a MESMA regra do porteiro sobre o que já chegou. Rode depois de ajustar
-- as abas na tela. ESPERADO: uma tabela por aba — linhas que ficam, linhas que
-- sairiam e quantas pessoas deixariam de receber. "sem aba" = passa como hoje.
--
-- select coalesce(a.rotulo, 'sem aba') as aba,
--        count(*) filter (where r.passa)     as ficam,
--        count(*) filter (where not r.passa) as sairiam,
--        count(distinct n.user_id) filter (where not r.passa) as pessoas_que_deixam_de_receber
--   from public.notifications n
--   cross join lateral (select public.carbo_notif_regra(n.user_id, n.type, n.reference_type) as passa) r
--   left join lateral (select t.aba from public.carbo_notif_tipos t
--                       where t.tipo = n.type and t.referencia in (coalesce(n.reference_type, ''), '')
--                       order by (t.referencia = '') limit 1) t on true
--   left join public.carbo_notif_abas a on a.aba = t.aba
--  where n.created_at > now() - interval '30 days'
--  group by 1
--  order by sairiam desc;

-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 3 — LIGAR o filtro (desfazer: o mesmo update com false)          ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- ESPERADO: 1 linha, filtro_ativo = true.
--
-- update public.carbo_notif_config
--    set filtro_ativo = true, ligado_em = now()
--  where id
-- returning filtro_ativo, ligado_em;
