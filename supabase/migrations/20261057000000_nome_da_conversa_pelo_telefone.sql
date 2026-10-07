-- ═══════════════════════════════════════════════════════════════════════════
-- Conversas: nome do cliente pelo TELEFONE, para quem ficou "Sem nome"
--
-- Pedido do dono do processo em 07/10/2026: "a resolução tem que ser geral".
-- A `carbo_wa_conversas` só conhece o nome por DOIS caminhos — o pedido da
-- esteira (`bling_id`) e o perfil do WhatsApp (só depois que o cliente
-- escreve). Conversa que não passa por nenhum dos dois (envio de teste,
-- carrinho cujo checkout não tem nome, cliente que ainda não respondeu) nascia
-- "Sem nome" mesmo com a pessoa cadastrada no carrinho ou num pedido.
--
-- Esta função é a TERCEIRA reserva: casa pelo telefone (`carbo_fone_chave`,
-- DDD + últimos 8 dígitos) em `nuvemshop_carrinhos` e `ecommerce_orders`, e
-- devolve o nome MAIS RECENTE de cada número.
--
-- 1. ⚠️ É reserva de APRESENTAÇÃO, nunca de identidade: só preenche o nome que
--    aparece na lista. Não liga a conversa a pedido nenhum.
-- 2. ⚠️ SECURITY DEFINER e guardada por `carbo_e_time_interno()` no próprio
--    corpo: devolve nome de cliente a partir de telefone, e o portal de lojas e
--    o de licenciados usam a MESMA `profiles`. Fora do time interno, nada.
-- 3. A chave é frouxa (ignora o 9º dígito). Errar aqui mostra um nome trocado
--    numa conversa SEM nome — o número continua à vista logo abaixo.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.carbo_wa_nomes_por_fone(p_wa_ids text[])
returns table (wa_id text, nome text)
language sql
stable
security definer
set search_path = public
as $$
  with alvo as (
    select w, public.carbo_fone_chave(w) as k
      from unnest(p_wa_ids) w
     where public.carbo_e_time_interno()
  ),
  fontes as (
    select public.carbo_fone_chave(c.telefone) as k, trim(c.cliente) as nome,
           c.abandonado_em as quando
      from public.nuvemshop_carrinhos c
     where nullif(trim(c.cliente), '') is not null and c.telefone is not null
    union all
    select public.carbo_fone_chave(o.cliente_fone), trim(o.cliente_nome), o.ordered_at
      from public.ecommerce_orders o
     where nullif(trim(o.cliente_nome), '') is not null and o.cliente_fone is not null
  )
  select distinct on (a.w) a.w::text, f.nome::text
    from alvo a
    join fontes f on f.k = a.k
   where a.k is not null
   order by a.w, f.quando desc nulls last;
$$;

revoke execute on function public.carbo_wa_nomes_por_fone(text[]) from public, anon;
grant execute on function public.carbo_wa_nomes_por_fone(text[]) to authenticated;

comment on function public.carbo_wa_nomes_por_fone(text[]) is
  'Nome mais recente de cada wa_id, casado por telefone (carbo_fone_chave) em nuvemshop_carrinhos e ecommerce_orders. Reserva de APRESENTAÇÃO da tela de Conversas para quem não tem nome pelo pedido nem pelo WhatsApp. Guardada por carbo_e_time_interno().';

-- CONFERÊNCIA — no SQL Editor a guarda devolve VAZIO (sem usuário). Para
-- medir, rode a consulta de dentro sem a guarda:
-- select distinct on (o.cliente_nome) o.cliente_nome
--   from public.ecommerce_orders o
--  where public.carbo_fone_chave(o.cliente_fone) = '8487346304'
-- union
-- select c.cliente from public.nuvemshop_carrinhos c
--  where public.carbo_fone_chave(c.telefone) = '8487346304';
