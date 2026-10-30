-- ═══════════════════════════════════════════════════════════════════════════
-- Revenda confirmada vira ponto de venda
--
-- ── O ciclo que isto fecha ───────────────────────────────────────────────
--
-- O vendedor passa a marcar Consumo ou Revenda no /vender. Quando a venda de
-- REVENDA é confirmada, o cliente entra em `pdvs` — e aí a Regra 1 do
-- `carbo_set_segmento_pdv` ("PDV cadastrado → revenda") classifica sozinha
-- TODO pedido futuro daquele CNPJ.
--
-- Resolve-se o cliente uma vez, na venda, e o histórico se mantém sem ninguém
-- preencher nada. Hoje são 108 pedidos de 85 clientes distintos sem canal.
--
-- ── Por que no BANCO e não na tela ───────────────────────────────────────
--
-- O `/vender` existe em OITO cópias byte a byte (crm, admin, ops, ti,
-- financas, mkt, atendimento, prevendas), e a venda também é confirmada pelo
-- Faturamento e pelo Ops. Regra em tela valeria só no caminho que a tivesse —
-- é o mesmo raciocínio que já pôs a dedução de estoque no banco.
--
-- ── O que conta como "confirmar" ─────────────────────────────────────────
--
-- Sair de `quote`/`cancelled`. É o momento em que o orçamento vira venda, que
-- é o que o pedido chamou de confirmar. Dispara tanto no INSERT (salvo direto
-- como venda) quanto no UPDATE (orçamento convertido depois).
--
-- ── As quatro guardas, e por que cada uma existe ─────────────────────────
--
-- 1. SÓ `segmento = 'revenda'`. Consumo não é ponto de venda.
-- 2. SEM CNPJ/CPF válido não cria. São 7 pedidos assim: sem documento não há
--    como deduplicar, e PDV duplicado é pior que PDV faltando — ele entra na
--    contagem de pontos que a diretoria lê.
-- 3. DEDUPE por DÍGITOS do documento, do mesmo jeito que o
--    `carbo_set_segmento_pdv` compara: `carboze_orders.cnpj` guarda o que foi
--    digitado e a ponte do Bling grava no formato dela.
-- 4. NUNCA derruba o pedido. Igual ao trigger irmão: a ponte do Bling engole
--    exceção como `totalFailed++` num log, e o pedido sumiria sem ninguém
--    saber. Cadastrar PDV é conveniência; perder venda, não.
--
-- O PDV nasce `active`, não `registered`: `registered` quer dizer "cadastrado,
-- ainda não vendeu" e fica fora da contagem de ativos — mas este acabou de
-- vender, foi por isso que nasceu.
--
-- ⚠️ RODE EM BLOCOS.
-- ═══════════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — a função                                                    ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

create or replace function public.carbo_revenda_vira_pdv()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_doc  text;
  v_nome text;
begin
  -- Só revenda, e só venda de verdade.
  if NEW.segmento is distinct from 'revenda' then return NEW; end if;
  if NEW.status in ('quote', 'cancelled')    then return NEW; end if;

  -- ⚠️ No UPDATE, só age na TRANSIÇÃO. Sem isto, todo update posterior do
  -- pedido (mudança de etapa, vínculo de NF, correção de endereço) reentraria
  -- aqui — barato, porque o dedupe segura, mas é trabalho à toa num gatilho
  -- que roda em toda escrita de pedido.
  if TG_OP = 'UPDATE'
     and OLD.segmento is not distinct from NEW.segmento
     and OLD.status not in ('quote', 'cancelled') then
    return NEW;
  end if;

  v_doc := regexp_replace(coalesce(NEW.cnpj, ''), '\D', '', 'g');
  if length(v_doc) not in (11, 14) then return NEW; end if;

  -- Já existe PDV com este documento? Não cria segundo.
  if exists (
    select 1 from public.pdvs p
    where regexp_replace(coalesce(p.cnpj, ''), '\D', '', 'g') = v_doc
  ) then
    return NEW;
  end if;

  v_nome := nullif(btrim(coalesce(NEW.legal_name, NEW.customer_name, '')), '');
  if v_nome is null then return NEW; end if;   -- `name` é obrigatório em pdvs

  insert into public.pdvs (
    pdv_code, name, cnpj, legal_name, status,
    contact_name, contact_phone, email,
    address_street, address_city, address_state, address_zip,
    latitude, longitude,
    owner_seller_id, owner_seller_name, opened_at,
    notes, created_by
  ) values (
    -- ⚠️ NULL, não `generate_pdv_code()`.
    --
    -- Aquilo é função de TRIGGER (retorna `trigger` e preenche `NEW.pdv_code`),
    -- não escalar: chamá-la aqui lança "trigger functions can only be called as
    -- triggers". E como o bloco abaixo captura tudo e vira `raise warning`, a
    -- falha não derrubava o pedido — ela simplesmente NÃO criava o PDV, calada.
    -- Foi assim que a primeira versão desta função passou despercebida.
    --
    -- Quem preenche é o `set_pdv_code`, BEFORE INSERT em `pdvs`, com
    -- `WHEN (new.pdv_code IS NULL OR new.pdv_code = '')`. BEFORE roda antes da
    -- checagem de NOT NULL, então mandar NULL é o caminho correto.
    null, v_nome,
    NEW.cnpj, NEW.legal_name, 'active',
    NEW.customer_name, NEW.customer_phone, NEW.customer_email,
    NEW.delivery_address, NEW.delivery_city, NEW.delivery_state, NEW.delivery_zip,
    NEW.latitude, NEW.longitude,
    NEW.vendedor_id, NEW.vendedor_name, current_date,
    'Cadastrado automaticamente na confirmacao do pedido ' || coalesce(NEW.order_number, '(sem numero)'),
    NEW.created_by
  );

  return NEW;
exception when others then
  -- ⚠️ Mesmo contrato do `carbo_set_segmento_pdv`: classificar/cadastrar é
  -- conveniência, perder o pedido não é aceitável.
  raise warning 'carbo_revenda_vira_pdv falhou para % : %', NEW.order_number, sqlerrm;
  return NEW;
end
$fn$;

comment on function public.carbo_revenda_vira_pdv() is
  'Cria o PDV quando uma venda marcada como revenda e confirmada (sai de quote/cancelled). '
  'Deduplica por digitos do CNPJ; nao cria sem documento nem sem nome; nunca derruba o pedido.';


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — o gatilho                                                   ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
--
-- ⚠️ AFTER, não BEFORE. O `carbo_set_segmento_pdv` é BEFORE e é ele que pode
-- PREENCHER o `segmento` por inferência; rodando depois, este aqui enxerga o
-- valor final — inclusive quando o vendedor não escolheu e o histórico
-- classificou como revenda.

drop trigger if exists trg_carbo_revenda_vira_pdv on public.carboze_orders;

create trigger trg_carbo_revenda_vira_pdv
after insert or update of status, segmento on public.carboze_orders
for each row
execute function public.carbo_revenda_vira_pdv();


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 3 — o que esta migração NÃO faz                                 ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
--
-- NÃO cria PDV para o histórico. São 85 clientes sem canal e 74 PDVs já
-- cadastrados; rodar para trás criaria dezenas de pontos de uma vez, sem
-- ninguém conferir, dentro do número que a diretoria lê como cobertura.
--
-- O backfill, se for desejado, é decisão à parte e com a lista na mão. Esta é
-- a consulta que mostra quem ENTRARIA — rode antes de pedir qualquer coisa:
--
--   select distinct regexp_replace(o.cnpj,'\D','','g') as doc,
--          coalesce(o.legal_name, o.customer_name) as nome, count(*) as pedidos
--   from carboze_orders o
--   where o.segmento = 'revenda'
--     and o.status not in ('quote','cancelled')
--     and length(regexp_replace(coalesce(o.cnpj,''),'\D','','g')) in (11,14)
--     and not exists (select 1 from pdvs p
--                      where regexp_replace(coalesce(p.cnpj,''),'\D','','g')
--                          = regexp_replace(o.cnpj,'\D','','g'))
--   group by 1,2 order by 3 desc;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 4 — conferência                                                 ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- O gatilho existe e é AFTER?
select tgname, tgtype, pg_get_triggerdef(oid) as definicao
from pg_trigger where tgname = 'trg_carbo_revenda_vira_pdv';

-- Quantos PDVs hoje (referência antes de começar a usar).
select count(*) as pdvs_hoje, count(*) filter (where is_micro) as micro from public.pdvs;
