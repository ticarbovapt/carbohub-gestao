-- ═══════════════════════════════════════════════════════════════════════════
-- 20261111 — O aviso de venda ON-LINE passa a ir só para quem foi LIGADO à mão
--
-- Pedido do dono do processo em 19/10/2026: *"hoje a notificação da venda
-- chega para todo mundo do sistema, isso não faz sentido mais devido a
-- quantidade de pessoas e a quantidade de vendas alta … quero colocar apenas
-- para quem for head … mas isso não é para ser regra do sistema … ninguém vai
-- ser ligado a não ser manualmente"*.
--
-- Hoje: `trg_ecommerce_sale_notify` → `notify_time_interno` → TODO o time
-- interno (~30 pessoas × 500+ vendas por semana = ~15 mil linhas por semana em
-- `notifications`, e um toque no celular de cada um).
--
-- Daqui para frente:
--   carbo_aviso_venda_online             quem recebe — CADASTRO, uma linha por pessoa
--   notify_venda_online(...)             o fan-out, só para quem está ligado
--   carbo_aviso_venda_online_lista()     a tela (Admin → E-commerce → Quem recebe a venda)
--   carbo_aviso_venda_online_definir()   o interruptor da tela
--
-- 1. ⚠️ "Head" NÃO é a regra — é a AJUDA para escolher. A tela marca quem é
--    head/CEO (a MESMA lista do `GESTOR_FUNCOES` do ecossistema), e só recebe
--    quem alguém LIGOU. Promover alguém a head não liga o aviso dele, e
--    deixar de ser head não desliga.
-- 2. ⚠️ A venda INTERNA (`trg_venda_manual_notify`, "🎉 Nova venda!") NÃO foi
--    tocada: continua indo para o time interno como hoje.
-- 3. Som, toast, sininho e o push do celular saem todos da linha em
--    `notifications` de cada pessoa (os hooks filtram `user_id = eu`), então
--    trocar QUEM ganha a linha troca os quatro juntos — sem mexer em app.
-- 4. ⚠️ Desligar NÃO apaga a linha (`recebe = false`, com quem e quando): é o
--    que deixa a tela dizer "desligado por X em DD/MM" em vez de "nunca foi
--    ligado" — respostas diferentes.
-- 5. ⚠️ Lista vazia = NINGUÉM recebe. Por isso o BLOCO 2 (a troca do gatilho)
--    RECUSA rodar com ninguém ligado: ligar primeiro na tela, trocar depois.
--
-- Cada BLOCO é UM resultado (o SQL Editor mostra só o último).
-- ═══════════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 0 — MEDIR: quantos recebem hoje e quem é head (leitura)      ║
-- ╚═══════════════════════════════════════════════════════════════════╝
-- ESPERADO: uma linha por head/CEO, com `recebem_hoje` (o time interno
-- inteiro) repetido em todas. São os candidatos que a tela vai destacar.
select p.full_name                          as nome,
       p.department::text                   as departamento,
       p.funcao,
       p.secondary_funcao                   as funcao_secundaria,
       count(*) over ()                     as heads,
       (select count(*) from public.profiles x
         where public.carbo_interface_e_interna(x.allowed_interfaces)) as recebem_hoje
  from public.profiles p
 where public.carbo_interface_e_interna(p.allowed_interfaces)
   and coalesce(p.status, '') not in ('deleted', 'rejected')
   and (p.funcao in ('head', 'ceo', 'command') or p.secondary_funcao in ('head', 'ceo', 'command'))
 order by p.full_name;


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — o cadastro, o fan-out e as duas funções da tela          ║
-- ╚═══════════════════════════════════════════════════════════════════╝
-- Não muda NADA no aviso ainda — o gatilho continua chamando o fan-out antigo.
-- ESPERADO: "Success. No rows returned".
create table if not exists public.carbo_aviso_venda_online (
  user_id       uuid primary key references public.profiles(id) on delete cascade,
  recebe        boolean     not null default true,
  ligado_por    uuid,
  ligado_em     timestamptz,
  desligado_por uuid,
  desligado_em  timestamptz
);

comment on table public.carbo_aviso_venda_online is
  'Quem recebe o aviso de venda ON-LINE (sininho, som, toast e celular). Cadastro manual pela tela do Admin; head é só a ajuda para escolher, nunca a regra. Desligar não apaga a linha. Ver 20261111.';

-- ⚠️ Sem policy nenhuma: a tela lê e grava pelas duas funções abaixo, que
-- conferem a flag do Admin. Policy de leitura aberta ao time mostraria a quem
-- não é admin quem recebe o quê.
alter table public.carbo_aviso_venda_online enable row level security;


create or replace function public.notify_venda_online(
  p_type text, p_title text, p_body text, p_ref_type text, p_ref_id uuid
) returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.notifications (user_id, type, title, body, reference_type, reference_id, is_read)
  select p.id, p_type, p_title, p_body, p_ref_type, p_ref_id, false
    from public.carbo_aviso_venda_online a
    join public.profiles p on p.id = a.user_id
   where a.recebe
     -- ⚠️ Quem perdeu o acesso interno sai sozinho, sem ninguém desligar: o
     -- portal de lojas e o de licenciados usam a MESMA `profiles`.
     and public.carbo_interface_e_interna(p.allowed_interfaces)
     and coalesce(p.status, '') not in ('deleted', 'rejected');
end $$;

comment on function public.notify_venda_online is
  'Fan-out do aviso de venda on-line: só quem está ligado em carbo_aviso_venda_online e continua no time interno. Chamada pelo trg_ecommerce_sale_notify. Ver 20261111.';

-- ⚠️ Só o gatilho chama (ele roda como dono). Ninguém de fora dispara aviso.
revoke execute on function public.notify_venda_online(text, text, text, text, uuid)
  from public, anon, authenticated;


create or replace function public.carbo_aviso_venda_online_lista()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.carbo_tem_app(array['carbo_admin']) then
    raise exception 'Sem permissão: só quem tem o Admin define quem recebe a venda on-line.'
      using errcode = '42501';
  end if;

  -- ⚠️ jsonb, nunca `setof`: o teto de 1.000 do PostgREST vale para RPC.
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id',                p.id,
             'nome',              p.full_name,
             'avatar_url',        p.avatar_url,
             'departamento',      p.department::text,
             'funcao',            p.funcao,
             'departamento_2',    p.secondary_department::text,
             'funcao_2',          p.secondary_funcao,
             'e_head',            coalesce(p.funcao in ('head', 'ceo', 'command')
                                   or p.secondary_funcao in ('head', 'ceo', 'command'), false),
             'recebe',            coalesce(a.recebe, false),
             'ligado_em',         a.ligado_em,
             'ligado_por_nome',   lp.full_name,
             'desligado_em',      a.desligado_em,
             'desligado_por_nome', dp.full_name
           ) order by coalesce(a.recebe, false) desc, p.full_name)
      from public.profiles p
      left join public.carbo_aviso_venda_online a on a.user_id = p.id
      left join public.profiles lp on lp.id = a.ligado_por
      left join public.profiles dp on dp.id = a.desligado_por
     where public.carbo_interface_e_interna(p.allowed_interfaces)
       and coalesce(p.status, '') not in ('deleted', 'rejected')
  ), '[]'::jsonb);
end $$;

revoke execute on function public.carbo_aviso_venda_online_lista() from public, anon;
grant  execute on function public.carbo_aviso_venda_online_lista() to authenticated;


create or replace function public.carbo_aviso_venda_online_definir(p_user uuid, p_recebe boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.carbo_tem_app(array['carbo_admin']) then
    raise exception 'Sem permissão: só quem tem o Admin define quem recebe a venda on-line.'
      using errcode = '42501';
  end if;
  if p_user is null or p_recebe is null then
    raise exception 'Pessoa e escolha são obrigatórias.' using errcode = '22004';
  end if;
  if not exists (select 1 from public.profiles p
                  where p.id = p_user
                    and public.carbo_interface_e_interna(p.allowed_interfaces)) then
    raise exception 'Só quem é do time interno pode receber o aviso de venda on-line.'
      using errcode = '42501';
  end if;

  if p_recebe then
    insert into public.carbo_aviso_venda_online as t (user_id, recebe, ligado_por, ligado_em)
    values (p_user, true, auth.uid(), now())
    on conflict (user_id) do update
       set recebe = true, ligado_por = auth.uid(), ligado_em = now()
     where not t.recebe;          -- ligar quem já está ligado não reescreve a data
  else
    insert into public.carbo_aviso_venda_online as t (user_id, recebe, desligado_por, desligado_em)
    values (p_user, false, auth.uid(), now())
    on conflict (user_id) do update
       set recebe = false, desligado_por = auth.uid(), desligado_em = now()
     where t.recebe;
  end if;
end $$;

revoke execute on function public.carbo_aviso_venda_online_definir(uuid, boolean) from public, anon;
grant  execute on function public.carbo_aviso_venda_online_definir(uuid, boolean) to authenticated;


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — A TROCA: o aviso on-line passa a ir só para a lista      ║
-- ╚═══════════════════════════════════════════════════════════════════╝
-- ⚠️ Rode DEPOIS de ligar as pessoas na tela (Admin → E-commerce → Quem
-- recebe a venda). Com ninguém ligado ele ABORTA sem mudar nada — senão a
-- venda on-line ficaria muda para todo mundo, calada.
-- Troca no texto VIVO do gatilho (`pg_get_functiondef`), só a chamada do
-- fan-out; o antes vai para `carbo_backup_funcoes`.
-- ESPERADO: "Success. No rows returned".
-- Erro "ninguém ligado" = ligue alguém na tela e rode de novo.
-- Erro "achei N chamadas" = o gatilho mudou desde a 20261086; me mande.
do $$
declare
  v_def  text := pg_get_functiondef('public.trg_ecommerce_sale_notify()'::regprocedure);
  v_novo text;
  v_n    int;
begin
  if v_def like '%notify_venda_online(%' then
    raise notice 'O gatilho já usa notify_venda_online — nada a fazer.';
    return;
  end if;

  if not exists (select 1 from public.carbo_aviso_venda_online where recebe) then
    raise exception 'Ninguém ligado em carbo_aviso_venda_online — nada foi alterado. Ligue as pessoas na tela e rode de novo.';
  end if;

  v_n := regexp_count(v_def, 'perform\s+public\.notify_time_interno\(');
  if v_n <> 1 then
    raise exception 'Achei % chamadas de notify_time_interno no gatilho (esperava 1) — nada foi alterado.', v_n;
  end if;

  insert into public.carbo_backup_funcoes (funcao, definicao)
  values ('trg_ecommerce_sale_notify()', v_def);

  v_novo := regexp_replace(v_def, 'perform\s+public\.notify_time_interno\(',
                           'perform public.notify_venda_online(');
  execute v_novo;

  comment on function public.trg_ecommerce_sale_notify is
    'Aviso de venda on-line: UM por TRANSAÇÃO na PayT (por pedido nos demais). Upsell toca, com título "⬆️ Upsell". Vai SÓ para quem está ligado em carbo_aviso_venda_online (20261111) — antes ia para o time interno inteiro. Canais, lista branca, janela de 12 h e transição para venda são os da 20260985; texto da 20261086.';
end $$;


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 3 — CONFERÊNCIA                                              ║
-- ╚═══════════════════════════════════════════════════════════════════╝
-- ESPERADO: uma linha, `gatilho_novo = true`, `venda_interna_intacta = true`,
-- `recebem` = quantos você ligou e `quem` = os nomes.
-- `gatilho_novo = false` = o BLOCO 2 não rodou (ou abortou).
select pg_get_functiondef('public.trg_ecommerce_sale_notify()'::regprocedure)
         like '%notify_venda_online(%'                                    as gatilho_novo,
       pg_get_functiondef('public.trg_venda_manual_notify()'::regprocedure)
         like '%notify_time_interno(%'                                    as venda_interna_intacta,
       (select count(*) from public.carbo_aviso_venda_online a
          join public.profiles p on p.id = a.user_id
         where a.recebe and public.carbo_interface_e_interna(p.allowed_interfaces)) as recebem,
       (select string_agg(p.full_name, ', ' order by p.full_name)
          from public.carbo_aviso_venda_online a
          join public.profiles p on p.id = a.user_id
         where a.recebe)                                                  as quem;


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ DESFAZER (só se precisar) — volta a avisar o time inteiro          ║
-- ╚═══════════════════════════════════════════════════════════════════╝
-- do $$ declare v text; begin
--   select definicao into v from public.carbo_backup_funcoes
--    where funcao = 'trg_ecommerce_sale_notify()' order by feito_em desc limit 1;
--   execute v;
-- end $$;
