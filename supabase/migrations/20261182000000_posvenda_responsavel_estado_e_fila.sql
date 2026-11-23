-- ═══════════════════════════════════════════════════════════════════════════
-- Pós-venda de verdade: responsável e estado do caso, e a fila que esvazia
-- (23/11/2026)
--
-- Pedido do dono do processo: "Para tratar" tinha ~941 itens, coisa antiga e
-- já resolvida. Quatro decisões dele, nesta ordem:
--
--   1. Reclamação com mais de 30 dias e sem caso sai da fila e vai para
--      "Antigas" (continua visível). Aqui: `reclamacao.antiga`.
--   2. Conversa marcada RESOLVIDA depois da reclamação conta como tratada:
--      `reclamacao.resolvida_na_conversa`, e ela deixa de ser `pendente`.
--   3. "Cobra resposta ou solução" (`sem_resposta`) e "Embalagem ruim ou
--      sugestão" (`embalagem`) não são reclamação de PÓS-VENDA: saem de
--      `carbo_posvenda_reclamacoes`. O painel do atendimento não muda.
--   4. Prazo de 1ª resposta de 24 h úteis: a conta é da TELA; o banco dá
--      `aguarda_desde` (a 1ª reclamação ainda sem resposta de GENTE) e
--      `respondida_em`.
--
-- E o caso ganha DONO e ESTADO:
--   responsavel  quem abre vira o responsável; "Pegar"/transferir pela função
--   estado       em_atendimento · aguardando_cliente · aguardando_terceiro
--
-- ⚠️ "Dispensar" da fila NÃO existe, por decisão do dono do processo.
-- ⚠️ Trocas no TEXTO VIVO (`prosrc`), por padrão (`\s+`) e exigindo UMA
-- ocorrência de cada trecho; não bateu ⇒ ABORTA e nada muda. O antes vai para
-- `carbo_backup_funcoes`. Assinaturas NÃO mudam.
-- ⚠️ A regra de `pendente` mora em DOIS lugares da função (o JSON e o filtro
-- de "Para tratar") — os dois recebem a mesma condição, e a tela
-- (`precisaDeAtencao`) lê o `pendente` daqui.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.carbo_backup_funcoes (
  feito_em  timestamptz not null default now(),
  funcao    text not null,
  definicao text not null
);
alter table public.carbo_backup_funcoes enable row level security;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — o caso ganha responsável e estado                           ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
alter table public.carbo_posvenda_casos add column if not exists responsavel uuid;
alter table public.carbo_posvenda_casos add column if not exists estado text not null default 'em_atendimento';
alter table public.carbo_posvenda_casos add column if not exists estado_em timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint
                  where conname = 'carbo_posvenda_casos_estado_valido'
                    and conrelid = 'public.carbo_posvenda_casos'::regclass) then
    alter table public.carbo_posvenda_casos add constraint carbo_posvenda_casos_estado_valido
      check (estado in ('em_atendimento', 'aguardando_cliente', 'aguardando_terceiro'));
  end if;
end $$;

comment on column public.carbo_posvenda_casos.responsavel is
  'Quem cuida do caso. Nasce = aberto_por (gatilho); muda por carbo_posvenda_caso_atribuir ("Pegar" / transferir). Ver 20261182.';
comment on column public.carbo_posvenda_casos.estado is
  'Com quem está a bola no caso ABERTO: em_atendimento (conosco), aguardando_cliente, aguardando_terceiro (transportadora, Financeiro…). Muda por carbo_posvenda_caso_estado. Ver 20261182.';

create index if not exists carbo_posvenda_casos_responsavel
  on public.carbo_posvenda_casos (responsavel) where status = 'aberto';

-- Quem abriu é o responsável até alguém mudar.
update public.carbo_posvenda_casos set responsavel = aberto_por
 where responsavel is null and aberto_por is not null;

-- ⚠️ O caso ANDOU (passo, tipo ou status mudou) ⇒ a bola volta a ser nossa:
-- "aguardando cliente" de um passo não vale para o próximo. Gatilho, e não
-- troca em responder/voltar/encerrar: são três caminhos (e o do reembolso).
create or replace function public.carbo_posvenda_caso_dono()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.responsavel := coalesce(new.responsavel, new.aberto_por);
  elsif (new.passo, new.tipo, new.status) is distinct from (old.passo, old.tipo, old.status)
        and new.estado is not distinct from old.estado
        and new.estado <> 'em_atendimento' then
    new.estado    := 'em_atendimento';
    new.estado_em := now();
  end if;
  return new;
end $$;
revoke execute on function public.carbo_posvenda_caso_dono() from public, anon, authenticated;

drop trigger if exists trg_posvenda_caso_dono on public.carbo_posvenda_casos;
create trigger trg_posvenda_caso_dono
  before insert or update on public.carbo_posvenda_casos
  for each row execute function public.carbo_posvenda_caso_dono();

-- O histórico aceita as duas ações novas.
do $$
declare v_nome text;
begin
  select c.conname into v_nome
    from pg_constraint c
   where c.conrelid = 'public.carbo_posvenda_caso_hist'::regclass and c.contype = 'c'
     and pg_get_constraintdef(c.oid) ~ 'acao';
  if v_nome is not null then
    execute format('alter table public.carbo_posvenda_caso_hist drop constraint %I', v_nome);
  end if;
  alter table public.carbo_posvenda_caso_hist add constraint carbo_posvenda_caso_hist_acao_check
    check (acao in ('abriu', 'respondeu', 'mudou_tipo', 'voltou', 'nota', 'encerrou', 'atribuiu', 'estado'));
end $$;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — as portas: atribuir e mudar o estado                        ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- `p_pessoa` nulo = "Pegar" (eu).
create or replace function public.carbo_posvenda_caso_atribuir(p_caso uuid, p_pessoa uuid default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  c      public.carbo_posvenda_casos;
  v_para uuid := coalesce(p_pessoa, auth.uid());
begin
  if not coalesce((select public.carbo_e_time_interno()), false) then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  if v_para is null then
    raise exception 'Informe quem vai cuidar do caso' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles p where p.id = v_para) then
    raise exception 'Pessoa não encontrada' using errcode = 'P0002';
  end if;
  select * into c from public.carbo_posvenda_casos where id = p_caso for update;
  if not found then
    raise exception 'Caso não encontrado' using errcode = 'P0002';
  end if;
  if c.status <> 'aberto' then
    raise exception 'Este caso já foi encerrado' using errcode = '55000';
  end if;
  if c.responsavel is not distinct from v_para then
    return;
  end if;
  insert into public.carbo_posvenda_caso_hist (caso_id, acao, tipo, passo, campos, por)
  values (c.id, 'atribuiu', c.tipo, c.passo,
          jsonb_build_object('de', c.responsavel, 'para', v_para), auth.uid());
  update public.carbo_posvenda_casos set
    responsavel = v_para, atualizado_por = auth.uid(), atualizado_em = now()
  where id = c.id;
end $$;

create or replace function public.carbo_posvenda_caso_estado(p_caso uuid, p_estado text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  c public.carbo_posvenda_casos;
begin
  if not coalesce((select public.carbo_e_time_interno()), false) then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  if p_estado is null or p_estado not in ('em_atendimento', 'aguardando_cliente', 'aguardando_terceiro') then
    raise exception 'Estado inválido' using errcode = '22023';
  end if;
  select * into c from public.carbo_posvenda_casos where id = p_caso for update;
  if not found then
    raise exception 'Caso não encontrado' using errcode = 'P0002';
  end if;
  if c.status <> 'aberto' then
    raise exception 'Este caso já foi encerrado' using errcode = '55000';
  end if;
  if c.estado = p_estado then
    return;
  end if;
  insert into public.carbo_posvenda_caso_hist (caso_id, acao, tipo, passo, opcao, campos, por)
  values (c.id, 'estado', c.tipo, c.passo, p_estado,
          jsonb_build_object('de', c.estado, 'para', p_estado), auth.uid());
  update public.carbo_posvenda_casos set
    estado = p_estado, estado_em = now(), atualizado_por = auth.uid(), atualizado_em = now()
  where id = c.id;
end $$;

revoke execute on function public.carbo_posvenda_caso_atribuir(uuid, uuid) from public, anon;
revoke execute on function public.carbo_posvenda_caso_estado(uuid, text) from public, anon;
grant execute on function public.carbo_posvenda_caso_atribuir(uuid, uuid) to authenticated;
grant execute on function public.carbo_posvenda_caso_estado(uuid, text) to authenticated;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 3 — reclamação de pós-venda sem "cobra resposta" e "embalagem"  ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
do $m$
declare
  v_oid oid;
  v_src text;
  v_n   int;
  v_pat text := $p$a\.ativo\s+and\s+\(a\.grupo\s+=\s+'reclamacao'\s+or\s+a\.codigo\s+=\s+'cancelamento'\)$p$;
begin
  select p.oid, p.prosrc into v_oid, v_src
    from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public' and p.proname = 'carbo_posvenda_reclamacoes'
     and pg_get_function_identity_arguments(p.oid) = 'p_desde timestamp with time zone, p_ate timestamp with time zone';
  if v_oid is null then
    raise exception 'ABORTADO: carbo_posvenda_reclamacoes(timestamptz, timestamptz) não encontrada';
  end if;
  if v_src ~ 'sem_resposta' then
    raise exception 'ABORTADO: o texto vivo de carbo_posvenda_reclamacoes já fala em sem_resposta';
  end if;
  select count(*) into v_n from regexp_matches(v_src, v_pat, 'g');
  if v_n <> 1 then
    raise exception 'ABORTADO: filtro de assuntos achado % vezes em carbo_posvenda_reclamacoes (esperado 1)', v_n;
  end if;

  insert into public.carbo_backup_funcoes (funcao, definicao)
  values ('carbo_posvenda_reclamacoes (antes de 20261182)', pg_get_functiondef(v_oid));

  v_src := regexp_replace(v_src, v_pat,
    $r$a.ativo and (a.grupo = 'reclamacao' or a.codigo = 'cancelamento')
       and a.codigo not in ('sem_resposta', 'embalagem')$r$);

  -- create or replace mantém dono e grants (a função é INTERNA: sem execute para a API).
  execute format($f$
    create or replace function public.carbo_posvenda_reclamacoes(p_desde timestamptz, p_ate timestamptz default null)
    returns table (bling_id bigint, wamid text, numero_id text, wa_id text,
                   ocorrido_em timestamptz, texto text, assuntos text[])
    language sql stable security definer set search_path = public as %L
  $f$, v_src);
end $m$;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 4 — a lista: dono e estado do caso, e a reclamação que esvazia  ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
do $m$
declare
  v_oid  oid;
  v_src  text;
  v_n    int;
  v_tr   text[][] := array[
    -- 1) o caso diz quem cuida e com quem está a bola
    array[$p$'encerrado_em',\s+c\.encerrado_em\)$p$,
          $r$'encerrado_em', c.encerrado_em,
                  'responsavel', c.responsavel,
                  'responsavel_nome', (select nullif(btrim(pr2.full_name), '')
                                         from public.profiles pr2 where pr2.id = c.responsavel),
                  'estado', c.estado, 'estado_em', c.estado_em)$r$],
    -- 2) a agregação das reclamações vira a base de uma segunda etapa
    array[$p$\mrec\s+as\s+materialized\s+\($p$,
          $r$rec0 as materialized ($r$],
    -- 3) a segunda etapa: resolvida na conversa, resposta de gente, antiga
    array[$p$from\s+rec_msg\s+m\s+group\s+by\s+m\.bling_id\s*\)$p$,
          $r$from rec_msg m group by m.bling_id
  ),
  rec as materialized (
    select r0.*,
           -- A conversa foi marcada RESOLVIDA depois da última reclamação
           -- (o instante é o do SERVIDOR, no histórico — nunca o `desde`, que
           -- vem do navegador).
           coalesce(exists (
             select 1 from public.carbo_wa_atendimento a
              where a.numero_id = r0.numero_id and a.wa_id = r0.wa_id
                and a.status = 'resolvido'
                and (select max(h.em) from public.carbo_wa_atendimento_hist h
                      where h.numero_id = r0.numero_id and h.wa_id = r0.wa_id
                        and h.status = 'resolvido' and h.marca) > r0.ultima_em
           ), false) as resolvida_na_conversa,
           g.respondida_em, g.ultima_entrada_em,
           (select min(m3.ocorrido_em) from rec_msg m3
             where m3.bling_id = r0.bling_id
               and m3.ocorrido_em > coalesce(g.resp_antes, '-infinity'::timestamptz)) as aguarda_desde,
           r0.ultima_em < now() - interval '30 days' as antiga
      from rec0 r0
      left join lateral (
        select min(mm.ocorrido_em) filter (where mm.direcao = 'saida' and mm.ocorrido_em > r0.ultima_em
                                             and (mm.enviado_por is not null or mm.enviado_por_nome is not null))
                 as respondida_em,
               max(mm.ocorrido_em) filter (where mm.direcao = 'saida' and mm.ocorrido_em <= r0.ultima_em
                                             and (mm.enviado_por is not null or mm.enviado_por_nome is not null))
                 as resp_antes,
               max(mm.ocorrido_em) filter (where mm.direcao = 'entrada') as ultima_entrada_em
          from public.carbo_wa_mensagens mm
         where mm.wa_id = r0.wa_id and mm.numero_id = r0.numero_id
           and mm.ocorrido_em >= r0.primeira_em
      ) g on true
  )$r$],
    -- 4) o JSON da reclamação leva os campos novos
    array[$p$'wa_id',\s+r\.wa_id,\s+'numero_id',\s+r\.numero_id,$p$,
          $r$'wa_id', r.wa_id, 'numero_id', r.numero_id,
                         'resolvida_na_conversa', r.resolvida_na_conversa,
                         'respondida_em', r.respondida_em,
                         'aguarda_desde', r.aguarda_desde,
                         'ultima_entrada_em', r.ultima_entrada_em,
                         'antiga', r.antiga,$r$],
    -- 5) pendente (o JSON): resolvida na conversa não é pendente
    array[$p$'pendente',\s+coalesce\(c\.caso\s+->>\s+'status',\s+''\)\s+<>\s+'aberto'$p$,
          $r$'pendente', not r.resolvida_na_conversa
                           and coalesce(c.caso ->> 'status', '') <> 'aberto'$r$],
    -- 6) pendente (o filtro de "Para tratar"): a MESMA condição
    array[$p$or\s+\(r\.bling_id\s+is\s+not\s+null\s+and\s+coalesce\(c\.caso\s+->>\s+'status',\s+''\)\s+<>\s+'aberto'$p$,
          $r$or (r.bling_id is not null and not r.resolvida_na_conversa
                       and coalesce(c.caso ->> 'status', '') <> 'aberto'$r$]
  ];
  i int;
begin
  select p.oid, p.prosrc into v_oid, v_src
    from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public' and p.proname = 'carbo_posvenda'
     and pg_get_function_identity_arguments(p.oid)
         = 'p_de date, p_ate date, p_corte date, p_so_casos boolean, p_pedido bigint, p_so_atencao boolean';
  if v_oid is null then
    raise exception 'ABORTADO: carbo_posvenda(date, date, date, boolean, bigint, boolean) não encontrada';
  end if;
  if v_src ~ 'resolvida_na_conversa' then
    raise exception 'ABORTADO: o texto vivo já fala em resolvida_na_conversa';
  end if;

  insert into public.carbo_backup_funcoes (funcao, definicao)
  values ('carbo_posvenda (antes de 20261182)', pg_get_functiondef(v_oid));

  for i in 1 .. array_length(v_tr, 1) loop
    select count(*) into v_n from regexp_matches(v_src, v_tr[i][1], 'g');
    if v_n <> 1 then
      raise exception 'ABORTADO: trecho % achado % vezes no texto vivo (esperado 1)', i, v_n;
    end if;
    v_src := regexp_replace(v_src, v_tr[i][1], v_tr[i][2]);
  end loop;

  execute format($f$
    create or replace function public.carbo_posvenda(
      p_de         date    default null,
      p_ate        date    default null,
      p_corte      date    default date '2026-11-06',
      p_so_casos   boolean default false,
      p_pedido     bigint  default null,
      p_so_atencao boolean default false
    )
    returns jsonb
    language plpgsql stable security definer set search_path = public as %L
  $f$, v_src);
end $m$;

comment on function public.carbo_posvenda(date, date, date, boolean, bigint, boolean) is
  'Pós-venda (Atendimento /pos-venda): todo pedido do período menos o ML Full, com o problema, a tratativa, o caso (com responsável e estado) e a reclamação do WhatsApp (pendente, resolvida na conversa, respondida, antiga). p_so_casos = casos abertos de qualquer data; p_pedido = um pedido só; p_so_atencao = a lista Para tratar. Ver 20261172/73/74/81/82.';


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ Conferência que ABORTA                                                ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
do $$
begin
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'carbo_posvenda') <> 1 then
    raise exception 'ABORTADO: carbo_posvenda ficou com mais de uma assinatura';
  end if;
  if not has_function_privilege('authenticated', 'public.carbo_posvenda(date, date, date, boolean, bigint, boolean)', 'execute') then
    raise exception 'ABORTADO: a tela não executa carbo_posvenda';
  end if;
  if has_function_privilege('authenticated', 'public.carbo_posvenda_reclamacoes(timestamptz, timestamptz)', 'execute') then
    raise exception 'ABORTADO: a API executa carbo_posvenda_reclamacoes';
  end if;
  if has_function_privilege('anon', 'public.carbo_posvenda_caso_atribuir(uuid, uuid)', 'execute')
     or has_function_privilege('anon', 'public.carbo_posvenda_caso_estado(uuid, text)', 'execute') then
    raise exception 'ABORTADO: anon executa as portas do caso';
  end if;
  if not has_function_privilege('authenticated', 'public.carbo_posvenda_caso_atribuir(uuid, uuid)', 'execute')
     or not has_function_privilege('authenticated', 'public.carbo_posvenda_caso_estado(uuid, text)', 'execute') then
    raise exception 'ABORTADO: a tela não executa as portas do caso';
  end if;
  if exists (select 1 from public.carbo_posvenda_casos where responsavel is null and aberto_por is not null) then
    raise exception 'ABORTADO: caso sem responsável depois do preenchimento';
  end if;
  if (select prosrc from pg_proc where oid = 'public.carbo_posvenda_reclamacoes(timestamptz, timestamptz)'::regprocedure)
     !~ 'sem_resposta' then
    raise exception 'ABORTADO: o filtro de assuntos não entrou';
  end if;
end $$;
