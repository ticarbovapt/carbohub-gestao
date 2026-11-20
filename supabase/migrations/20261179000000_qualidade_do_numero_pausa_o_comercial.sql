-- ═══════════════════════════════════════════════════════════════════════════
-- A QUALIDADE do número na Meta pausa o comercial (20/11/2026)
--
-- Pedido do dono do processo, ao ligar a régua de recompra de 7 dias:
-- *"garantir a qualidade do número nosso"*.
--
-- A Meta dá a cada número uma nota (verde · amarela · vermelha) a partir de
-- bloqueios e denúncias dos clientes, e é a mensagem de MARKETING que mais pesa
-- nela. Nota caindo ⇒ limite diário menor ⇒ número bloqueado — e o Clube é o
-- número por onde o cliente fala com a gente.
--
--   carbo_wa_numeros.qualidade …          a nota, o limite e quando foi lida
--   carbo_wa_numeros.pausa_qualidade      a partir de que nota o COMERCIAL pausa
--                                         (YELLOW, padrão · RED · nulo = nunca)
--   carbo_wa_numeros.comercial_pausado    a pausa MANUAL ("pare as ofertas já")
--   carbo_wa_qualidade_hist               cada troca de nota, para sempre
--   carbo_wa_qualidade_registrar(...)     o `whatsapp-meta` grava aqui (15 em 15 min)
--
-- 1. ⚠️ Quem LÊ a nota é o `whatsapp-meta` (só ele tem o token); quem DECIDE a
--    pausa também (`comercialPausado`, `_shared/metaQualidade.ts`, testado):
--    recompra e carrinho do número ficam na fila, sem gravar nada, até a nota
--    voltar. Os avisos do pedido (esteira) não pausam: são serviço e saem pelo
--    número de serviço.
-- 2. ⚠️ Leitura que FALHA não pausa (fica em `qualidade_erro`): fechar ali
--    pararia a régua toda vez que o token não pudesse ler a nota, calado.
-- 3. O aviso vai SÓ ao TI (`carbo_ti`), UM por troca de nota, com os tipos do
--    vigia da esteira (`esteira_fonte_parada`/`_voltou`, já cadastrados e já
--    nos oito sininhos) — sem tipo novo, sem mexer em app.
-- ═══════════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — a nota no cadastro dos números                              ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
alter table public.carbo_wa_numeros
  add column if not exists qualidade                text,
  add column if not exists qualidade_limite         text,
  add column if not exists qualidade_lida_em        timestamptz,
  add column if not exists qualidade_erro           text,
  add column if not exists pausa_qualidade          text default 'YELLOW',
  add column if not exists comercial_pausado        boolean not null default false,
  add column if not exists comercial_pausado_motivo text;

do $$ begin
  alter table public.carbo_wa_numeros
    add constraint carbo_wa_numeros_pausa_qualidade_ck
    check (pausa_qualidade is null or pausa_qualidade in ('YELLOW', 'RED'));
exception when duplicate_object then null;
end $$;

comment on column public.carbo_wa_numeros.pausa_qualidade is
  'A partir de que nota da Meta o comercial (recompra, carrinho) deste número PAUSA: YELLOW (amarela ou vermelha), RED (só vermelha) ou nulo (nunca).';
comment on column public.carbo_wa_numeros.comercial_pausado is
  'Pausa MANUAL do comercial deste número (recompra e carrinho ficam na fila). Os avisos do pedido seguem.';


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — o histórico das notas                                       ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
create table if not exists public.carbo_wa_qualidade_hist (
  id         bigserial primary key,
  numero_id  text not null references public.carbo_wa_numeros(phone_number_id),
  qualidade  text,
  limite     text,
  em         timestamptz not null default now()
);
create index if not exists carbo_wa_qualidade_hist_numero_idx
  on public.carbo_wa_qualidade_hist (numero_id, em desc);

alter table public.carbo_wa_qualidade_hist enable row level security;
drop policy if exists carbo_wa_qualidade_hist_le on public.carbo_wa_qualidade_hist;
create policy carbo_wa_qualidade_hist_le on public.carbo_wa_qualidade_hist
  for select to authenticated using ((select public.carbo_e_time_interno()));
grant select on public.carbo_wa_qualidade_hist to authenticated;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 3 — o registro da nota (e o aviso ao TI quando ela troca)       ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
create or replace function public.carbo_wa_qualidade_registrar(
  p_numero_id text, p_qualidade text, p_limite text, p_erro text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_num   public.carbo_wa_numeros%rowtype;
  v_nova  text := upper(nullif(btrim(coalesce(p_qualidade, '')), ''));
  v_cor   jsonb := '{"GREEN":"VERDE","YELLOW":"AMARELA","RED":"VERMELHA"}';
  v_ordem jsonb := '{"GREEN":0,"YELLOW":1,"RED":2}';
  v_pausa_antes boolean;
  v_pausa_agora boolean;
  v_titulo text;
  v_corpo  text;
begin
  select * into v_num from public.carbo_wa_numeros where phone_number_id = p_numero_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'erro', 'número não cadastrado');
  end if;

  -- Leitura que falhou: guarda o erro e MANTÉM a nota anterior.
  if v_nova is null then
    update public.carbo_wa_numeros
       set qualidade_lida_em = now(), qualidade_erro = p_erro
     where phone_number_id = p_numero_id;
    return jsonb_build_object('ok', true, 'mudou', false, 'erro', p_erro);
  end if;

  update public.carbo_wa_numeros
     set qualidade = v_nova, qualidade_limite = p_limite,
         qualidade_lida_em = now(), qualidade_erro = null
   where phone_number_id = p_numero_id;

  if v_num.qualidade is not distinct from v_nova then
    return jsonb_build_object('ok', true, 'mudou', false);
  end if;

  insert into public.carbo_wa_qualidade_hist (numero_id, qualidade, limite)
  values (p_numero_id, v_nova, p_limite);

  -- O aviso só fala de nota CONHECIDA (verde/amarela/vermelha). A 1ª leitura
  -- (antes nula) só avisa se já nasce fora do verde.
  if not (v_ordem ? v_nova) or (v_num.qualidade is null and v_nova = 'GREEN') then
    return jsonb_build_object('ok', true, 'mudou', true, 'avisou', false);
  end if;

  -- ⚠️ coalesce: nota anterior nula daria NULL, e `not NULL` cairia no ramo errado.
  v_pausa_antes := coalesce(v_num.pausa_qualidade is not null
                   and (v_ordem ->> v_num.qualidade)::int >= (v_ordem ->> v_num.pausa_qualidade)::int, false);
  v_pausa_agora := coalesce(v_num.pausa_qualidade is not null
                   and (v_ordem ->> v_nova)::int >= (v_ordem ->> v_num.pausa_qualidade)::int, false);

  v_titulo := 'WhatsApp ' || v_num.rotulo || ': qualidade ' || (v_cor ->> v_nova);
  v_corpo := 'A Meta mudou a nota do número'
          || coalesce(' ' || v_num.numero_exibicao, '') || ' de '
          || coalesce(v_cor ->> v_num.qualidade, 'sem nota') || ' para ' || (v_cor ->> v_nova)
          || coalesce(' (limite ' || p_limite || ')', '') || '. '
          || case
               when v_pausa_agora and not v_pausa_antes then 'As ofertas (recompra e carrinho) deste número foram PAUSADAS e voltam sozinhas quando a nota voltar.'
               when v_pausa_antes and not v_pausa_agora then 'As ofertas deste número foram LIBERADAS de novo.'
               when v_pausa_agora then 'As ofertas continuam pausadas.'
               else 'As ofertas seguem saindo.'
             end;

  insert into public.notifications (user_id, type, title, body, reference_type, reference_id, is_read)
  select p.id,
         case when (v_ordem ->> v_nova)::int > coalesce((v_ordem ->> v_num.qualidade)::int, 0)
              then 'esteira_fonte_parada' else 'esteira_fonte_voltou' end,
         v_titulo, v_corpo, 'esteira', null, false
    from public.profiles p
   where 'carbo_ti' = any (coalesce(p.allowed_interfaces, '{}'));

  return jsonb_build_object('ok', true, 'mudou', true, 'avisou', true,
                            'pausado', v_pausa_agora);
end $$;

revoke all on function public.carbo_wa_qualidade_registrar(text, text, text, text) from public, anon, authenticated;
grant execute on function public.carbo_wa_qualidade_registrar(text, text, text, text) to service_role;
comment on function public.carbo_wa_qualidade_registrar(text, text, text, text) is
  'Chamada pelo whatsapp-meta (a cada 15 min): grava a nota da Meta de um número, guarda a troca em carbo_wa_qualidade_hist e avisa o TI quando ela muda. Leitura que falhou (p_qualidade nulo) só guarda o erro.';
