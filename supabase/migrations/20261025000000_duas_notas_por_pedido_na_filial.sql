-- ═══════════════════════════════════════════════════════════════════════════
-- DUAS notas por pedido na filial — e o vínculo para de sobrescrever
--
-- Achado em 01/10/2026 pelo dono do processo, com um caso concreto: o pedido
-- `V2026090081` tem DUAS notas da NOVA NB na filial — a 000986 (R$ 1.248,00) e
-- a 000987 (R$ 1.668,00). Ele vinculou uma, "o valor mudou e ficou pendente", e
-- a outra voltou para a fila.
--
-- É isto: `carbo_nf_filial_vincular` fazia um `update` SEM conferir se a coluna
-- já tinha nota. A segunda nota tomava o lugar da primeira, calado, e a
-- primeira reaparecia na fila como se nunca tivesse sido vinculada.
--
-- ⚠️ E a causa de fundo é a que já estava medida: **com_natureza = 0**. A
-- matriz distingue as duas notas pela NATUREZA (`20260996`), e a filial não
-- tem natureza nenhuma gravada ainda — então `carbo_natureza_e_bonificacao`
-- devolve `false` para as duas e as duas disputam `bling2_nf_id`.
--
-- Duas correções, e elas se completam:
--
--   1. o vínculo RECUSA sobrescrever, e DIZ qual nota está lá;
--   2. quando a natureza é desconhecida, QUEM DECIDE é a pessoa — explícito,
--      no parâmetro, e nunca por omissão.
--
-- ⚠️ RODE EM BLOCOS.
-- ═══════════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 0 — MEDIR. Quantos pedidos têm as duas notas? E quantas notas   ║
-- ║ ainda estão sem natureza?                                             ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- select
--   count(*) filter (where natureza_operacao is null)     as sem_natureza,
--   count(*) filter (where natureza_operacao is not null) as com_natureza
-- from public.bling2_nfe;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — o automático EXIGE natureza conhecida                       ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- ⚠️ AUSÊNCIA FECHA, e aqui isso é o oposto do que a função fazia. Sem
-- natureza, `carbo_natureza_e_bonificacao(null)` é `false` — ou seja, uma nota
-- de REMESSA com rodapé seria gravada em `bling2_nf_id`, o lugar da nota
-- PRINCIPAL. O pedido apareceria faturado pela nota errada e o valor da
-- bonificação entraria no faturamento. É o `V2026090052` da matriz, que lá
-- custou meses até alguém notar.
--
-- O custo de fechar é conhecido e pequeno: a nota espera o backfill trazer a
-- natureza (cron `bling2-nfe-detalhe-10min`), ou alguém a vincula à mão
-- dizendo qual é. O custo de NÃO fechar é dinheiro errado no faturamento.
--
-- Esta é a MESMA régua do `CRON_SECRET`: ausência fecha, nunca abre.

create or replace function public.carbo_vincula_nf_filial()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  n int := 0;
begin
  -- ══ PASSO 1 — por ID EXATO (inalterado) ════════════════════════════════
  for r in
    select
      o.id                                                       as order_id,
      nullif(replace(o.external_ref, 'bling2-', ''), '')::bigint  as pedido_bling,
      o.bling2_pedido_bonificacao_id                             as pedido_bon,
      o.bling2_nf_id                                             as nf_atual
    from public.carboze_orders o
    where o.bling_conta = 2
      and o.external_ref like 'bling2-%'
  loop
    declare
      v_nf record;
    begin
      select nf.bling_id, nf.chave_acesso, nf.numero, nf.situacao
        into v_nf
        from public.bling2_orders bo
        join public.bling2_nfe    nf on nf.bling_id = bo.nf_bling_id
       where bo.bling_id = r.pedido_bling
       limit 1;

      if found and public.bling2_nf_e_valida(v_nf.situacao) then
        if r.nf_atual is distinct from v_nf.bling_id then
          update public.carboze_orders
             set bling2_nf_id    = v_nf.bling_id,
                 nf2_access_key  = v_nf.chave_acesso,
                 invoice2_number = v_nf.numero,
                 updated_at      = now()
           where id = r.order_id;
          n := n + 1;
        end if;
      elsif r.nf_atual is not null then
        update public.carboze_orders
           set bling2_nf_id = null, nf2_access_key = null, invoice2_number = null,
               updated_at = now()
         where id = r.order_id;
        n := n + 1;
      end if;
    end;

    if r.pedido_bon is not null then
      declare
        v_bon record;
      begin
        select nf.bling_id, nf.chave_acesso, nf.numero, nf.situacao
          into v_bon
          from public.bling2_orders bo
          join public.bling2_nfe    nf on nf.bling_id = bo.nf_bling_id
         where bo.bling_id = r.pedido_bon
         limit 1;

        if found and public.bling2_nf_e_valida(v_bon.situacao) then
          update public.carboze_orders
             set bling2_nf_bonificacao_id    = v_bon.bling_id,
                 nf2_bonificacao_access_key  = v_bon.chave_acesso,
                 invoice2_bonificacao_number = v_bon.numero,
                 updated_at                  = now()
           where id = r.order_id
             and bling2_nf_bonificacao_id is distinct from v_bon.bling_id;
        end if;
      end;
    end if;
  end loop;

  -- ══ PASSO 2 — pelo RODAPÉ, e SÓ com natureza conhecida ═════════════════
  for r in
    select
      nf.bling_id, nf.chave_acesso, nf.numero, nf.situacao, nf.natureza_operacao,
      upper((regexp_match(nf.informacoes_adicionais,
             '(V[0-9]{10}|PED-[0-9]{4}-[0-9]{5})', 'i'))[1]) as cod
    from public.bling2_nfe nf
    where nf.informacoes_adicionais is not null
      and nf.informacoes_adicionais ~* '(V[0-9]{10}|PED-[0-9]{4}-[0-9]{5})'
      -- ⚠️ A trava nova. Ver o cabeçalho do bloco.
      and nf.natureza_operacao is not null
  loop
    continue when r.cod is null;
    continue when not public.bling2_nf_e_valida(r.situacao);

    if public.carbo_natureza_e_bonificacao(r.natureza_operacao) then
      update public.carboze_orders o
         set bling2_nf_bonificacao_id    = r.bling_id,
             nf2_bonificacao_access_key  = r.chave_acesso,
             invoice2_bonificacao_number = r.numero,
             updated_at                  = now()
       where o.order_number = r.cod
         and o.bling2_nf_bonificacao_id is null;
    else
      update public.carboze_orders o
         set bling2_nf_id    = r.bling_id,
             nf2_access_key  = r.chave_acesso,
             invoice2_number = r.numero,
             bling_conta     = 2,
             updated_at      = now()
       where o.order_number = r.cod
         and o.bling2_nf_id is null
         and o.bling_nf_id is null;
    end if;

    if found then n := n + 1; end if;
  end loop;

  return n;
exception when others then
  raise warning 'carbo_vincula_nf_filial falhou: %', sqlerrm;
  return n;
end;
$$;

comment on function public.carbo_vincula_nf_filial is
  'Liga a NF da filial ao pedido. DOIS caminhos: 1) id exato, 2) o rodape — este ULTIMO so com natureza conhecida, porque sem ela uma remessa de bonificacao seria gravada na coluna da nota PRINCIPAL e o valor dela entraria no faturamento (o V2026090052 da matriz). Ausencia FECHA.';


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — o vínculo manual: recusa sobrescrever, e aceita a escolha   ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- ⚠️ `drop` ANTES, e não só `create or replace`. Acrescentar parâmetro com
-- default cria SOBRECARGA, não substitui — e como o PostgREST chama por nome,
-- as duas assinaturas conviveriam e a chamada ficaria ambígua
-- (`function is not unique`). O SQL diria "Success" e a tela pararia.

drop function if exists public.carbo_nf_filial_vincular(text, bigint);

create or replace function public.carbo_nf_filial_vincular(
  p_order_number text,
  p_nf_bling_id  bigint,
  -- 'venda' | 'bonificacao' | null. Null = "decida pela natureza".
  p_como         text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order  record;
  v_nf     record;
  v_bon    boolean;
begin
  if not public.carbo_e_time_interno() then
    raise exception 'Sem permissão.' using errcode = 'insufficient_privilege';
  end if;

  select id, order_number, bling_nf_id, bling2_nf_id, bling2_nf_bonificacao_id,
         invoice2_number, invoice2_bonificacao_number
    into v_order
    from public.carboze_orders
   where order_number = upper(btrim(p_order_number));
  if not found then
    raise exception 'Pedido % não existe.', p_order_number using errcode = 'no_data_found';
  end if;

  select bling_id, chave_acesso, numero, situacao, natureza_operacao
    into v_nf
    from public.bling2_nfe
   where bling_id = p_nf_bling_id;
  if not found then
    raise exception 'NF % não está no espelho da filial.', p_nf_bling_id using errcode = 'no_data_found';
  end if;

  if not public.bling2_nf_e_valida(v_nf.situacao) then
    raise exception 'A NF % está como "%" e não pode ser vinculada.',
      coalesce(v_nf.numero, p_nf_bling_id::text), coalesce(v_nf.situacao, 'sem situação')
      using errcode = 'check_violation';
  end if;

  if exists (
    select 1 from public.carboze_orders o
     where o.id <> v_order.id
       and (o.bling2_nf_id = v_nf.bling_id or o.bling2_nf_bonificacao_id = v_nf.bling_id)
  ) then
    raise exception 'A NF % já está vinculada a outro pedido.',
      coalesce(v_nf.numero, p_nf_bling_id::text) using errcode = 'unique_violation';
  end if;

  -- ── Qual das duas notas é esta? ──────────────────────────────────────────
  --
  -- ⚠️ A NATUREZA MANDA quando existe. Ela é cadastro fiscal do Bling, e a
  -- pessoa pode se enganar — deixar a escolha humana vencer a natureza seria
  -- pôr opinião acima do documento. Por isso, quando as duas discordam, a
  -- função RECUSA em vez de escolher uma: discordância aqui é sinal de que a
  -- nota não é a que a pessoa pensa, e enterrá-la é como se descobre o erro
  -- meses depois, no fechamento.
  if v_nf.natureza_operacao is not null then
    v_bon := public.carbo_natureza_e_bonificacao(v_nf.natureza_operacao);
    if p_como is not null and p_como <> (case when v_bon then 'bonificacao' else 'venda' end) then
      raise exception 'A natureza da NF % é "%" — ela é nota de %, não de %.',
        coalesce(v_nf.numero, p_nf_bling_id::text), v_nf.natureza_operacao,
        case when v_bon then 'BONIFICAÇÃO' else 'VENDA' end, upper(p_como)
        using errcode = 'check_violation';
    end if;
  else
    -- ⚠️ Sem natureza, a função NÃO ADIVINHA. A versão anterior caía no
    -- `false` do `carbo_natureza_e_bonificacao(null)` e mandava TODA nota para
    -- a coluna da venda — foi assim que a segunda nota da NOVA NB tomou o
    -- lugar da primeira. Quem decide passa a ser quem está olhando a nota, e a
    -- decisão é EXPLÍCITA: omitir não vale.
    if p_como is null then
      raise exception 'A NF % está sem natureza no espelho. Diga se ela é a nota da VENDA ou a REMESSA de bonificação.',
        coalesce(v_nf.numero, p_nf_bling_id::text) using errcode = 'check_violation';
    end if;
    if p_como not in ('venda', 'bonificacao') then
      raise exception 'Valor inválido para o tipo da nota: %.', p_como using errcode = 'check_violation';
    end if;
    v_bon := (p_como = 'bonificacao');
  end if;

  -- ── Grava, e NUNCA por cima ──────────────────────────────────────────────
  --
  -- ⚠️ Esta é a correção do defeito relatado. O `update` era incondicional: a
  -- segunda nota tomava o lugar da primeira, a primeira voltava para a fila
  -- como se nunca tivesse sido vinculada, e o valor do pedido mudava sozinho.
  -- Nada disso dava erro.
  --
  -- Recusar é melhor que trocar porque o pedido com DUAS notas é o caso
  -- NORMAL (venda + remessa de bonificação), e substituir uma pela outra é
  -- sempre o engano — nunca a intenção.
  if v_bon then
    if v_order.bling2_nf_bonificacao_id is not null
       and v_order.bling2_nf_bonificacao_id <> v_nf.bling_id then
      raise exception 'O pedido % já tem a nota de bonificação % vinculada. Desvincule-a antes.',
        v_order.order_number,
        coalesce(v_order.invoice2_bonificacao_number, v_order.bling2_nf_bonificacao_id::text)
        using errcode = 'unique_violation';
    end if;

    update public.carboze_orders
       set bling2_nf_bonificacao_id    = v_nf.bling_id,
           nf2_bonificacao_access_key  = v_nf.chave_acesso,
           invoice2_bonificacao_number = v_nf.numero,
           updated_at                  = now()
     where id = v_order.id;
  else
    if v_order.bling_nf_id is not null then
      raise exception 'O pedido % já tem nota na MATRIZ. Desvincule lá antes.',
        v_order.order_number using errcode = 'check_violation';
    end if;
    if v_order.bling2_nf_id is not null and v_order.bling2_nf_id <> v_nf.bling_id then
      raise exception 'O pedido % já tem a nota de venda % vinculada. Desvincule-a antes, ou marque esta como remessa de bonificação.',
        v_order.order_number,
        coalesce(v_order.invoice2_number, v_order.bling2_nf_id::text)
        using errcode = 'unique_violation';
    end if;

    update public.carboze_orders
       set bling2_nf_id    = v_nf.bling_id,
           nf2_access_key  = v_nf.chave_acesso,
           invoice2_number = v_nf.numero,
           bling_conta     = 2,
           updated_at      = now()
     where id = v_order.id;
  end if;
end;
$$;

comment on function public.carbo_nf_filial_vincular is
  'Vincula manualmente uma NF da filial. RECUSA sobrescrever nota ja vinculada (pedido com DUAS notas — venda + remessa — e o caso NORMAL, trocar uma pela outra e sempre o engano). A natureza manda quando existe e a funcao recusa se a escolha humana discordar dela; sem natureza, a escolha e OBRIGATORIA e explicita.';

revoke all on function public.carbo_nf_filial_vincular(text, bigint, text) from public, anon;
grant execute on function public.carbo_nf_filial_vincular(text, bigint, text) to authenticated;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 3 — CONFERÊNCIA. Rode UMA DE CADA VEZ.                          ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- (a) ⚠️ A assinatura antiga SUMIU? Duas assinaturas vivas = `function is not
--     unique` no PostgREST, e a tela para sem erro no SQL.
--     ESPERADO: UMA linha, com três argumentos.
-- select p.oid::regprocedure as assinatura
-- from pg_proc p join pg_namespace n on n.oid = p.pronamespace
-- where n.nspname = 'public' and p.proname = 'carbo_nf_filial_vincular';

-- (b) O caso que abriu esta migração: as duas notas da NOVA NB e o pedido.
-- select o.order_number, o.total,
--        o.bling2_nf_id, o.invoice2_number            as nota_de_venda,
--        o.bling2_nf_bonificacao_id, o.invoice2_bonificacao_number as nota_de_remessa
-- from public.carboze_orders o
-- where o.order_number = 'V2026090081';

-- (c) Quantas notas ainda esperam a natureza — ou seja, quantas o automático
--     NÃO vai casar até o backfill passar por elas.
-- select count(*) filter (where natureza_operacao is null) as esperando_natureza,
--        count(*) filter (where natureza_operacao is not null) as prontas
-- from public.bling2_nfe;
