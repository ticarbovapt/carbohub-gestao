-- ═══════════════════════════════════════════════════════════════════════════
-- FASE 4A — em qual Bling o pedido foi faturado (fundação, INERTE)
--
-- Duas contas: Bling 1 = MATRIZ, Bling 2 = FILIAL SP. Hoje só a matriz emite;
-- a conta 2 é espelho declarado ("não escreve fora de bling2_*, não cria
-- pedido"). Alguns pedidos passam a ser faturados em SP.
--
-- ⚠️ Esta migração NÃO liga nada. Ela cria a coluna, as colunas de NF da conta
-- 2 e a guarda anti-duplicata. A emissão por conta é a parte 4B (edge
-- function) e o seletor é a 4C (front).
--
-- ── O risco que a fundação existe para impedir ────────────────────────────
--
-- A ponte do Bling 2 importa para `carboze_orders` todo pedido faturado que
-- ainda não exista, pulando o que já tem `external_ref = 'bling2-<id>'`. Mas a
-- emissão grava `'bling-<id>'`. Um pedido faturado em SP voltaria como uma
-- linha NOVA (`BLING2-…`, status entregue, valor cheio): o mesmo pedido físico
-- duas vezes em `carboze_orders`, DOBRANDO faturamento em qualquer soma. E a
-- ponte roda dentro do cron, então a duplicata apareceria sem log visível.
--
-- ⚠️ RODE EM BLOCOS.
-- ═══════════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — de qual conta é o pedido                                    ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- Hoje a conta só é inferível por prefixo de string (`BLING-`, `BLING2-`,
-- `bling-`, `bling2-`) — e para uma venda NATIVA faturada não há marca
-- nenhuma: `external_ref = 'bling-<id>'` é o mesmo texto nas duas hipóteses.
--
-- NULL = conta 1. Todo o histórico é da matriz, e default explícito seria
-- mentir sobre pedido que nunca foi faturado.

set lock_timeout = '5s';

alter table public.carboze_orders
  add column if not exists bling_conta smallint;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'carboze_orders_bling_conta_check') then
    alter table public.carboze_orders
      add constraint carboze_orders_bling_conta_check
      check (bling_conta is null or bling_conta in (1, 2));
  end if;
end $$;

reset lock_timeout;

comment on column public.carboze_orders.bling_conta is
  '1 = matriz (Bling 1), 2 = filial SP (Bling 2). NULL = nunca faturado, ou histórico (tudo era matriz). É o que diz onde consultar/cancelar a nota.';


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — a NF da conta 2 vai para colunas PRÓPRIAS                   ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- ⚠️ NÃO reaproveitar `bling_nf_id` para nota da conta 2. Isso já foi tentado
-- e revertido: `carbo_vendas_metrica` faz `join bling_nfe on bling_id =
-- o.bling_nf_id`, e os dois Blings numeram do zero — um id da conta 2 pode
-- casar com uma nota REAL da conta 1. O sintoma seria nota cancelada de uma
-- empresa derrubando venda da outra. A migração que reverteu isso ainda limpou
-- os valores gravados por engano.
--
-- Colunas separadas custam quatro campos e eliminam a classe inteira do
-- problema: nada que hoje lê `bling_nf_id` passa a enxergar a conta 2 por
-- acidente.

set lock_timeout = '5s';

alter table public.carboze_orders
  add column if not exists bling2_nf_id            bigint,
  add column if not exists nf2_access_key          text,
  add column if not exists invoice2_number         text,
  add column if not exists bling2_pedido_id        bigint;

reset lock_timeout;

comment on column public.carboze_orders.bling2_nf_id is
  'NF emitida na FILIAL SP. Separada de bling_nf_id de propósito: os dois Blings numeram do zero e carbo_vendas_metrica junta bling_nfe por esse id — um id da conta 2 casaria com nota real da conta 1.';


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 3 — a guarda anti-duplicata                                     ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- A ponte já pula o que tem `external_ref = 'bling2-<bling_id>'`. Basta que a
-- emissão na conta 2 grave exatamente esse formato — é a parte 4B.
--
-- Esta guarda é o CINTO: se por qualquer motivo o external_ref não for gravado
-- (falha de rede entre o POST e o UPDATE, por exemplo), a ponte importaria o
-- pedido como novo. Aqui ele é reconhecido pelo número do pedido na observação
-- e descartado, com registro — mesma mecânica já usada para a remessa de
-- bonificação.
--
-- ⚠️ Reusa a tabela de descarte que já existe, em vez de criar outra: as duas
-- respondem a mesma pergunta ("o que voltou do Bling e não virou pedido?"), e
-- duas tabelas fariam alguém olhar só uma.

create or replace function public.carbo_bloqueia_remessa_bonificacao()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_num text;
begin
  -- (a) remessa de bonificação — regra original
  if coalesce(new.notes, '') ~* '(V[0-9]{10}|PED-[0-9]{4}-[0-9]{5})-BON'
     or coalesce(new.order_number, '') ~* '-BON$' then
    insert into public.carbo_remessas_bonificacao_ignoradas
      (order_number, external_ref, total, observacao)
    values (new.order_number, new.external_ref, new.total, left(coalesce(new.notes,''), 500));
    return null;
  end if;

  -- (b) pedido que NÓS criamos no Bling e voltou pela ponte.
  --     O número do nosso pedido na observação é a assinatura: pedido nascido
  --     no Bling nunca tem um `V…`/`PED-…` nosso lá dentro.
  if coalesce(new.source_file, '') in ('bling2_bridge', 'bling_sync') then
    v_num := substring(coalesce(new.notes, '') from '(V[0-9]{10}|PED-[0-9]{4}-[0-9]{5})');
    if v_num is not null and exists (
      select 1 from public.carboze_orders o where o.order_number = v_num
    ) then
      insert into public.carbo_remessas_bonificacao_ignoradas
        (order_number, external_ref, total, observacao)
      values (new.order_number, new.external_ref, new.total,
              'DUPLICATA de ' || v_num || ' · ' || left(coalesce(new.notes,''), 400));
      return null;
    end if;
  end if;

  return new;
end;
$$;

comment on function public.carbo_bloqueia_remessa_bonificacao is
  'Descarta, na entrada, o que voltou do Bling e NÃO deve virar pedido: a remessa de bonificação e o pedido que nós mesmos criamos lá (reconhecido pelo nosso número na observação). Registra tudo que descarta — linha que some sem rastro vira "sumiu um pedido" três meses depois.';


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 4 — natureza de bonificação da filial                           ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- A chave já foi criada. Este bloco só lembra que ela precisa ser preenchida
-- ANTES de faturar em SP um pedido com brinde — senão o pedido pago é criado e
-- a remessa falha, deixando o faturamento pela metade.

select chave, coalesce(valor, '(NÃO CONFIGURADO)') as valor, descricao
from public.carbo_config_fiscal
order by chave;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 5 — conferência                                                 ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- (a) As colunas existem?
select column_name from information_schema.columns
where table_schema='public' and table_name='carboze_orders'
  and column_name in ('bling_conta','bling2_nf_id','nf2_access_key','invoice2_number','bling2_pedido_id')
order by column_name;

-- (b) O que já foi descartado na entrada (bonificação + duplicatas).
--     Deve estar vazio hoje.
select order_number, external_ref, total, left(observacao, 80) as observacao, ignorado_em
from public.carbo_remessas_bonificacao_ignoradas
order by ignorado_em desc limit 20;

-- (c) Distribuição atual — tudo NULL, porque nada foi faturado por conta ainda.
select coalesce(bling_conta::text, 'não faturado / histórico') as conta, count(*)
from public.carboze_orders group by 1 order by 2 desc;
