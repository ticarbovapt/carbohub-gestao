-- ═══════════════════════════════════════════════════════════════════════════
-- Backfill de PDV: a lista primeiro, o cadastro depois
--
-- São 138 clientes que já compraram como revenda e ainda não são ponto de
-- venda (182 pedidos, 11 UFs). Criar os 138 de uma vez dobraria a base — de
-- 79 para ~217 — dentro do número que a diretoria lê como cobertura
-- comercial. Por isso não há "rodar tudo": há uma VISÃO de candidatos e um
-- INSERT que exige recorte e limite.
--
-- ⚠️ O ALVO SE MOVE. Com o seletor novo no /vender, o time está classificando
-- agora: entre duas medições com ~15 min de intervalo, os candidatos foram de
-- 98 para 138. Rode o dry-run IMEDIATAMENTE antes de cada lote; número de
-- ontem não vale.
--
-- ── Por que uma VIEW e não duas consultas ────────────────────────────────
--
-- O dry-run e o INSERT precisam selecionar EXATAMENTE as mesmas linhas. Com
-- duas consultas irmãs, a primeira divergência entre elas faz o dry-run
-- prometer uma coisa e o INSERT gravar outra — e ninguém descobre, porque o
-- que se confere é a lista, não o que foi gravado. Uma definição, dois usos.
--
-- ⚠️ A view REPETE as guardas do gatilho `carbo_revenda_vira_pdv` de propósito:
-- revenda, venda de verdade, documento válido, nome presente, e quem já tem
-- PDV fica de fora. As duas portas de entrada do cadastro precisam concordar.
-- ═══════════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — a visão de candidatos (só leitura; não grava nada)          ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

create or replace view public.carbo_pdv_backfill_candidatos as
select distinct on (regexp_replace(coalesce(o.cnpj, ''), '\D', '', 'g'))
  regexp_replace(coalesce(o.cnpj, ''), '\D', '', 'g')                as doc,
  nullif(btrim(coalesce(o.legal_name, o.customer_name, '')), '')     as nome,
  o.cnpj, o.legal_name,
  o.customer_name, o.customer_phone, o.customer_email,
  o.delivery_address, o.delivery_city, o.delivery_state, o.delivery_zip,
  o.latitude, o.longitude,
  o.vendedor_id, o.vendedor_name,
  o.created_by,
  o.order_number                                                      as pedido_referencia,
  coalesce(o.sale_date, o.created_at::date)                           as data_referencia
from public.carboze_orders o
where o.segmento = 'revenda'
  and o.status not in ('quote', 'cancelled')
  and length(regexp_replace(coalesce(o.cnpj, ''), '\D', '', 'g')) in (11, 14)
  and nullif(btrim(coalesce(o.legal_name, o.customer_name, '')), '') is not null
  and not exists (
    select 1 from public.pdvs p
    where regexp_replace(coalesce(p.cnpj, ''), '\D', '', 'g')
        = regexp_replace(coalesce(o.cnpj, ''), '\D', '', 'g'))
-- ⚠️ `distinct on` + este ORDER BY = o pedido MAIS RECENTE de cada cliente.
-- É dele que saem endereço, telefone e vendedor: o cadastro nasce com o dado
-- mais novo, não com o primeiro que apareceu.
order by 1, coalesce(o.sale_date, o.created_at::date) desc, o.created_at desc;

alter view public.carbo_pdv_backfill_candidatos set (security_invoker = true);

comment on view public.carbo_pdv_backfill_candidatos is
  'Clientes que ja compraram como revenda e ainda nao sao PDV, um por documento, '
  'com os dados do pedido mais recente. Mesmas guardas do gatilho '
  'carbo_revenda_vira_pdv. Base do dry-run e do INSERT do backfill.';


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — DRY-RUN. Só leitura. Rode antes de CADA lote.               ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
--
-- Edite o recorte. Sem recorte vem tudo — e o objetivo é justamente não
-- cadastrar tudo de uma vez.

select doc, nome, delivery_city as cidade, delivery_state as uf,
       vendedor_name as vendedor, customer_phone as telefone,
       pedido_referencia, data_referencia
from public.carbo_pdv_backfill_candidatos
where (delivery_state = 'RN')          -- ← TROQUE a UF (ou comente a linha)
--  and vendedor_name = 'Fulano'       -- ← opcional: um vendedor por vez
order by nome
limit 25;                              -- ← o tamanho do lote

-- Visão geral, para escolher por onde começar:
select coalesce(delivery_state,'(sem uf)') as uf, count(*) as candidatos
from public.carbo_pdv_backfill_candidatos
group by 1 order by 2 desc;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 3 — O LOTE. Só rode depois de LER a lista do BLOCO 2.           ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
--
-- ⚠️ O WHERE e o LIMIT têm de ser OS MESMOS do dry-run que você acabou de
-- conferir. Se mudar um, você grava um conjunto que ninguém olhou.
--
-- ⚠️ `pdv_code` NÃO é passado: o gatilho `set_pdv_code` (BEFORE INSERT em
-- `pdvs`, WHEN pdv_code IS NULL) gera o `PDV-0080`, `PDV-0081`… Passá-lo
-- chamando `generate_pdv_code()` é ERRO — aquilo é função de trigger, não
-- escalar, e a chamada lança exceção.
--
-- Re-rodar é seguro: quem acabou de virar PDV sai da view sozinho.

insert into public.pdvs (
  name, cnpj, legal_name, status,
  contact_name, contact_phone, email,
  address_street, address_city, address_state, address_zip,
  latitude, longitude,
  owner_seller_id, owner_seller_name, opened_at,
  notes, created_by
)
select
  c.nome, c.cnpj, c.legal_name, 'active',
  c.customer_name, c.customer_phone, c.customer_email,
  c.delivery_address, c.delivery_city, c.delivery_state, c.delivery_zip,
  c.latitude, c.longitude,
  c.vendedor_id, c.vendedor_name, c.data_referencia,
  'Backfill: ja comprava como revenda. Pedido de referencia ' || coalesce(c.pedido_referencia,'(sem numero)'),
  c.created_by
from public.carbo_pdv_backfill_candidatos c
where (c.delivery_state = 'RN')        -- ← IGUAL ao dry-run
order by c.nome
limit 25                               -- ← IGUAL ao dry-run
returning pdv_code, name, address_state as uf, cnpj;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 4 — conferência depois de cada lote                             ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- Quantos entraram por backfill, quantos faltam.
select (select count(*) from public.pdvs)                                    as pdvs_total,
       (select count(*) from public.pdvs where notes like 'Backfill:%')      as vindos_do_backfill,
       (select count(*) from public.carbo_pdv_backfill_candidatos)           as ainda_faltam;

-- ⚠️ Nenhum documento pode ter dois PDVs. Tem de vir ZERO linhas.
select regexp_replace(coalesce(cnpj,''),'\D','','g') as doc, count(*) as pdvs
from public.pdvs
where coalesce(btrim(cnpj),'') <> ''
group by 1 having count(*) > 1;
