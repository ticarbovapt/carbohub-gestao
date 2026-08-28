-- ═══════════════════════════════════════════════════════════════════════════
-- `carbo_atendimento` entra na lista de interfaces INTERNAS
--
-- ── Por que ──────────────────────────────────────────────────────────────
--
-- Nasce o app `Carbo Atendimento` (atendimento.carbohub.com.br) e a flag dele
-- em `profiles.allowed_interfaces` é `carbo_atendimento`. A lista de interfaces
-- internas mora num lugar só desde a `20260927000000_quem_recebe_o_aviso.sql`:
-- `public.carbo_interface_e_interna(text[])`. Quem chama:
--
--   carbo_e_time_interno()   → RLS de carbo_wa_mensagens, carbo_wa_contatos,
--                              sku_product_mappings, carbo_canal_estoque,
--                              bling2_orders/nfe/contacts/lojas (20260936) …
--   notify_time_interno()    → todo aviso do sininho (venda online, resumo da
--                              esteira, alerta de pedido parado)
--   carbo_wa_notificaveis    → quem PODE ser marcado para o aviso de resposta
--   carbo_wa_notifica_inbound → a segunda trava do gatilho
--
-- ⚠️ Uma pessoa cujo ÚNICO acesso seja o Atendimento, ficando de fora daqui,
-- não recebe notificação NENHUMA e é barrada pela RLS naquelas tabelas — a
-- tela abre e volta VAZIA, sem erro em lugar nenhum. É exatamente o sintoma
-- que a `20260936` documentou na `bling2_esteira` ("tudo travado na primeira
-- coluna" porque a view voltava vazia).
--
-- `portal_pdv` e `portal_licenciado` continuam DE FORA de propósito: são os
-- portais externos, que compartilham a MESMA tabela `profiles`.
--
-- ⚠️ RODE EM BLOCOS.
-- ═══════════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 0 — MEDIR o estado atual (antes de mexer)                       ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
--
-- ⚠️ Pergunte ao BANCO, não à migração que criou a função. Este repo já pagou
-- por afirmar comportamento a partir do arquivo de nascimento (o CHECK da
-- porta 1 do Melhor Envio, que a `20260918` já havia alterado).

-- (0.a) A definição que está RODANDO hoje. Confira aqui quais interfaces a
--       lista tem de verdade antes de reescrevê-la.
select pg_get_functiondef(p.oid) as definicao_hoje
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'carbo_interface_e_interna';

-- (0.b) Quantos perfis têm cada interface, e quantos são internos HOJE.
--       Guarde estes números: o BLOCO 2 compara com eles.
select lower(x)                                   as interface,
       count(*)                                   as perfis,
       count(*) filter (where public.carbo_interface_e_interna(p.allowed_interfaces))
                                                  as contam_como_internos_hoje
from public.profiles p,
     lateral unnest(coalesce(p.allowed_interfaces, '{}')) x
group by 1
order by 2 desc;

-- (0.c) O total de gente interna hoje. É o número que NÃO pode encolher.
select count(*) as time_interno_hoje
from public.profiles p
where public.carbo_interface_e_interna(p.allowed_interfaces);

-- (0.d) Quem já tem `carbo_atendimento` (pode ser zero — o app está nascendo).
select p.id, p.full_name, p.allowed_interfaces
from public.profiles p
where 'carbo_atendimento' = any (select lower(x) from unnest(coalesce(p.allowed_interfaces, '{}')) x);


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — a lista, reescrita inteira, com `carbo_atendimento`         ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
--
-- A função é reescrita POR COMPLETO (é `create or replace`, não há como
-- acrescentar um item), então os comentários que explicam a lista vêm junto —
-- razão documentada não se apaga na hora de editar.

create or replace function public.carbo_interface_e_interna(p_interfaces text[])
returns boolean language sql immutable as $$
  select exists (
    select 1 from unnest(coalesce(p_interfaces, '{}')) x
    -- ⚠️ Conferida contra os perfis REAIS, não contra o nome dos apps. O Ops
    -- aparece como `carbo_ops_app` em quase todo mundo e como `carbo_ops` num
    -- perfil — os dois valem. `carbo_sales` NÃO existe: o Sales é `carbo_crm`.
    -- `portal_pdv` e `portal_licenciado` ficam DE FORA de propósito: são os
    -- portais externos, que compartilham a tabela `profiles`.
    -- `carbo_atendimento` (20260961) é o app de atendimento ao cliente —
    -- interno: quem atende lê as conversas do WhatsApp e recebe o sininho.
    where lower(x) in ('carbo_admin','carbo_crm','carbo_ops','carbo_ops_app',
                       'carbo_financas','carbo_mkt','carbo_ti','carbo_atendimento')
  );
$$;

comment on function public.carbo_interface_e_interna is
  'A lista de interfaces INTERNAS, num lugar só. Antes estava copiada no notify_time_interno e no carbo_e_time_interno — duas listas divergem, e divergir aqui abre acesso em vez de fechar. Interface interna nova entra AQUI e em nenhum outro lugar.';

-- Nada mais muda: `carbo_e_time_interno`, `notify_time_interno`,
-- `carbo_wa_notificaveis` e `carbo_wa_notifica_inbound` já chamam esta função.


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — conferência                                                 ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- (2.a) A prova direta: `carbo_atendimento` passou a contar como interna, e os
--       portais continuam fora. Esperado: t, t, f, f.
select public.carbo_interface_e_interna(array['carbo_atendimento'])  as atendimento_e_interna,
       public.carbo_interface_e_interna(array['carbo_ops_app'])      as ops_app_continua,
       public.carbo_interface_e_interna(array['portal_pdv'])         as pdv_fora,
       public.carbo_interface_e_interna(array['portal_licenciado'])  as licenciado_fora;

-- (2.b) ⚠️ Nenhuma OUTRA interface mudou de classificação. Compara a lista
--       nova, interface a interface, com a lista de antes escrita à mão — a
--       de nascimento da função (20260927). A única linha com
--       `mudou = true` tem de ser `carbo_atendimento`.
--
--       Não basta olhar o total: duas trocas simultâneas (uma entra, outra
--       cai) manteriam o número e derrubariam alguém em silêncio.
with universo(iface) as (
  select unnest(array[
    'carbo_admin','carbo_crm','carbo_ops','carbo_ops_app','carbo_financas',
    'carbo_mkt','carbo_ti','carbo_atendimento','portal_pdv','portal_licenciado'
  ])
),
antes(iface) as (   -- a lista como estava antes desta migração
  select unnest(array[
    'carbo_admin','carbo_crm','carbo_ops','carbo_ops_app','carbo_financas',
    'carbo_mkt','carbo_ti'
  ])
)
select u.iface,
       (u.iface in (select iface from antes))          as era_interna,
       public.carbo_interface_e_interna(array[u.iface]) as e_interna_agora,
       (u.iface in (select iface from antes))
         is distinct from public.carbo_interface_e_interna(array[u.iface])
                                                       as mudou
from universo u
order by mudou desc, u.iface;

-- (2.c) O time interno NÃO pode ter encolhido. Este número tem de ser igual ao
--       de (0.c), mais quem tiver `carbo_atendimento` e nenhuma outra interna.
select count(*) as time_interno_agora
from public.profiles p
where public.carbo_interface_e_interna(p.allowed_interfaces);

-- (2.d) Ninguém de portal entrou. Tem de vir ZERO.
select count(*) as portais_indevidos
from public.profiles p
where public.carbo_interface_e_interna(p.allowed_interfaces)
  and not exists (select 1 from unnest(coalesce(p.allowed_interfaces, '{}')) x
                  where lower(x) like 'carbo\_%');

-- (2.e) Quem passou a poder receber o aviso de mensagem nova por causa desta
--       migração (só quem tem Atendimento e nada mais de interno). Continuam
--       com `recebe = false`: a lista de `carbo_wa_notificados` é clique, não
--       migração.
select full_name, recebe, allowed_interfaces
from public.carbo_wa_notificaveis
where 'carbo_atendimento' = any (select lower(x) from unnest(coalesce(allowed_interfaces, '{}')) x)
order by full_name;
