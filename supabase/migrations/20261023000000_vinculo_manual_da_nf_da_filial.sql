-- ═══════════════════════════════════════════════════════════════════════════
-- Vínculo MANUAL da NF da filial — a rede das duas automáticas
--
-- A `20261022` deu à filial os dois caminhos automáticos (id exato e rodapé).
-- Nenhum dos dois alcança tudo, e os buracos são conhecidos:
--
--   · pedido com `external_ref` de prefixo errado — medido, existe;
--   · NF emitida avulsa no painel da filial, sem pedido nosso por trás;
--   · nota em que o rodapé não chegou (o Bling substitui a observação pelo
--     texto fiscal da natureza — `20260996`).
--
-- A matriz já tem essa rede desde sempre (`useNfeLinking.ts` → `bling_nfe`).
-- A filial não tinha nenhuma: pedido que os automáticos não pegassem ficava
-- preso para sempre, e a única saída era SQL na mão.
--
-- ⚠️ NÃO existe `bling2_nfe.order_id`, e isto é decisão, não esquecimento.
-- A matriz guarda o vínculo nos DOIS lados (`bling_nfe.order_id` e
-- `carboze_orders.bling_nf_id`) e isso é um par que pode divergir — é
-- exatamente o defeito do `bling_nf_id` disputado por duas notas que a
-- `20260996` teve de desfazer. Aqui a verdade mora num lugar só:
-- `carboze_orders.bling2_nf_id`. "A nota está livre?" é uma PERGUNTA, e ela se
-- responde olhando os pedidos — não uma coluna espelho.
--
-- ⚠️ RODE EM BLOCOS.
-- ═══════════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — as notas da filial que nenhum pedido reivindicou            ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- ⚠️ `security_invoker = true` e a cláusula REPETIDA: `create or replace view`
-- sem `with` APAGA as reloptions (`AT_ReplaceRelOptions`), e foi assim que a
-- `bling2_esteira` perdeu o invoker e passou a rodar como dono, com RLS
-- ignorada e `grant to authenticated` intacto — lojista e licenciado lendo a
-- logística inteira da Carbo. Toda republicação repete a cláusula.
--
-- Com invoker, quem lê aqui passa pelas MESMAS policies de `bling2_nfe`
-- (leitura para o time interno, `20260936`). Nenhum acesso novo é criado.

create or replace view public.carbo_nf_filial_sem_pedido
with (security_invoker = true) as
select
  nf.bling_id,
  nf.numero,
  nf.serie,
  nf.chave_acesso,
  nf.data_emissao,
  nf.contato_nome,
  nf.contato_cnpj,
  nf.valor_total,
  nf.situacao,
  nf.natureza_operacao,
  -- ⚠️ A natureza vira BOOLEANO aqui, e não na tela. A regra de "isto é
  -- bonificação" mora em `carbo_natureza_e_bonificacao` desde a `20260981`;
  -- reescrevê-la no front seria a segunda cópia de um cadastro, e divergir
  -- dela não dá erro — dá bonificação entrando como receita.
  public.carbo_natureza_e_bonificacao(nf.natureza_operacao) as e_bonificacao,
  -- O código que o rodapé anuncia, quando há. É ele que a tela mostra como
  -- sugestão — o humano confirma, o sistema nunca aplica sozinho.
  upper((regexp_match(nf.informacoes_adicionais,
                      '(V[0-9]{10}|PED-[0-9]{4}-[0-9]{5})', 'i'))[1]) as codigo_no_rodape,
  nf.informacoes_adicionais,
  nf.pdf_url,
  nf.xml_url
from public.bling2_nfe nf
-- ⚠️ Nota morta NÃO entra na fila de vincular. Ligá-la a um pedido criaria um
-- pedido que PARECE faturado, que é o oposto do que esta tela existe para
-- fazer. Mesma lista branca do casamento automático.
where public.bling2_nf_e_valida(nf.situacao)
  and not exists (
    select 1 from public.carboze_orders o
     where o.bling2_nf_id = nf.bling_id
        or o.bling2_nf_bonificacao_id = nf.bling_id
  );

comment on view public.carbo_nf_filial_sem_pedido is
  'NFs da filial que nenhum pedido reivindicou — a fila do vinculo manual. Deriva de carboze_orders (nao ha bling2_nfe.order_id de proposito: um par espelho pode divergir). Nota fora da lista branca fica FORA: vincular nota morta criaria pedido que parece faturado.';

grant select on public.carbo_nf_filial_sem_pedido to authenticated;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — vincular e desvincular, pela RPC                            ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- ⚠️ RPC, e não um `update` do front. Três razões, e a terceira é a que pesa:
--   1. `carboze_orders` não tem policy de UPDATE aberta para isso;
--   2. a decisão "em qual coluna a nota entra" é a MESMA do automático, e
--      duplicá-la no TypeScript é a cópia que diverge;
--   3. a tela existe em um app hoje — mas a regra de qual nota pode ser
--      vinculada é fiscal, e regra fiscal não mora em tela. Mesmo princípio da
--      dedução de estoque morar na RPC e não no `/vender`.

create or replace function public.carbo_nf_filial_vincular(
  p_order_number text,
  p_nf_bling_id  bigint
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order  record;
  v_nf     record;
begin
  if not public.carbo_e_time_interno() then
    raise exception 'Sem permissão.' using errcode = 'insufficient_privilege';
  end if;

  select id, order_number, bling_nf_id, bling2_nf_id, bling2_nf_bonificacao_id
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

  -- ⚠️ A lista branca é conferida AQUI também, não só na view. A view é o que
  -- a tela MOSTRA; esta função é por onde o vínculo passa. Guardar só na
  -- listagem é a mesma diferença entre esconder o campo e ter a regra no
  -- submit — uma é a aparência, a outra é a regra.
  if not public.bling2_nf_e_valida(v_nf.situacao) then
    raise exception 'A NF % está como "%" e não pode ser vinculada.',
      coalesce(v_nf.numero, p_nf_bling_id::text), coalesce(v_nf.situacao, 'sem situação')
      using errcode = 'check_violation';
  end if;

  -- ⚠️ RECUSA se a nota já é de outro pedido. Sem isto, dois pedidos
  -- apontariam para a mesma NF e o faturamento contaria a mesma nota duas
  -- vezes — e ninguém veria, porque cada tela olha um pedido só.
  if exists (
    select 1 from public.carboze_orders o
     where o.id <> v_order.id
       and (o.bling2_nf_id = v_nf.bling_id or o.bling2_nf_bonificacao_id = v_nf.bling_id)
  ) then
    raise exception 'A NF % já está vinculada a outro pedido.',
      coalesce(v_nf.numero, p_nf_bling_id::text) using errcode = 'unique_violation';
  end if;

  if public.carbo_natureza_e_bonificacao(v_nf.natureza_operacao) then
    -- Remessa de bonificação: vai para as colunas dela. ⚠️ Quem decide é a
    -- NATUREZA, igual ao automático — nunca o texto do rodapé, que é o MESMO
    -- nas duas notas da venda com brinde.
    update public.carboze_orders
       set bling2_nf_bonificacao_id    = v_nf.bling_id,
           nf2_bonificacao_access_key  = v_nf.chave_acesso,
           invoice2_bonificacao_number = v_nf.numero,
           updated_at                  = now()
     where id = v_order.id;
  else
    -- ⚠️ Pedido já faturado na MATRIZ não recebe nota da filial por cima.
    -- `carbo_vendas_metrica` junta `bling_nfe` por `bling_nf_id`: deixar os
    -- dois preenchidos faria o mesmo pedido existir nas duas contas, e o
    -- número do faturamento deixaria de fechar com qualquer uma delas.
    if v_order.bling_nf_id is not null then
      raise exception 'O pedido % já tem nota na MATRIZ. Desvincule lá antes.',
        v_order.order_number using errcode = 'check_violation';
    end if;

    update public.carboze_orders
       set bling2_nf_id    = v_nf.bling_id,
           nf2_access_key  = v_nf.chave_acesso,
           invoice2_number = v_nf.numero,
           -- É `bling_conta` que faz a tela de Faturamento ler as colunas
           -- `*2_*`. Sem ele o vínculo existiria no banco e a tela continuaria
           -- dizendo "Sem NF" — resolvido e errado ao mesmo tempo.
           bling_conta     = 2,
           updated_at      = now()
     where id = v_order.id;
  end if;
end;
$$;

comment on function public.carbo_nf_filial_vincular is
  'Vincula manualmente uma NF da filial a um pedido. A NATUREZA decide a coluna (venda x bonificacao), a lista branca e conferida aqui e nao so na listagem, e recusa NF ja usada por outro pedido ou pedido ja faturado na matriz.';

revoke all on function public.carbo_nf_filial_vincular(text, bigint) from public, anon;
grant execute on function public.carbo_nf_filial_vincular(text, bigint) to authenticated;


create or replace function public.carbo_nf_filial_desvincular(
  p_order_number text,
  p_bonificacao  boolean default false
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.carbo_e_time_interno() then
    raise exception 'Sem permissão.' using errcode = 'insufficient_privilege';
  end if;

  -- ⚠️ Desvincular EXISTE porque vincular à mão erra. Sem ele, um vínculo
  -- errado só se desfaz por SQL — e o custo de errar passaria a ser "chama o
  -- TI", que é como as pessoas param de usar a tela e voltam a pedir no chat.
  --
  -- ⚠️ E NÃO apaga a nota de lugar nenhum: ela volta para a fila de
  -- `carbo_nf_filial_sem_pedido` no mesmo instante, porque aquela view deriva
  -- daqui. Uma escrita, um efeito.
  if p_bonificacao then
    update public.carboze_orders
       set bling2_nf_bonificacao_id    = null,
           nf2_bonificacao_access_key  = null,
           invoice2_bonificacao_number = null,
           updated_at                  = now()
     where order_number = upper(btrim(p_order_number));
  else
    update public.carboze_orders
       set bling2_nf_id    = null,
           nf2_access_key  = null,
           invoice2_number = null,
           updated_at      = now()
     where order_number = upper(btrim(p_order_number));
  end if;

  if not found then
    raise exception 'Pedido % não existe.', p_order_number using errcode = 'no_data_found';
  end if;
end;
$$;

comment on function public.carbo_nf_filial_desvincular is
  'Desfaz o vinculo manual. A nota volta para a fila no mesmo instante, porque carbo_nf_filial_sem_pedido deriva de carboze_orders — uma escrita, um efeito.';

revoke all on function public.carbo_nf_filial_desvincular(text, boolean) from public, anon;
grant execute on function public.carbo_nf_filial_desvincular(text, boolean) to authenticated;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 3 — CONFERÊNCIA. Rode UMA DE CADA VEZ.                          ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- (a) O tamanho da fila, e quantas já anunciam o pedido no rodapé.
--     ⚠️ `com_codigo` > 0 significa que o automático da `20261022` vai pegar
--     essas sozinho na próxima rodada — a fila manual é o RESTO.
-- select count(*)                                             as sem_pedido,
--        count(*) filter (where codigo_no_rodape is not null) as com_codigo,
--        count(*) filter (where e_bonificacao)                as de_bonificacao
-- from public.carbo_nf_filial_sem_pedido;

-- (b) A view manteve o security_invoker? ESPERADO: {security_invoker=true}.
--     ⚠️ Vazio aqui é o furo da `bling2_esteira`: view sem invoker roda como
--     DONO e ignora RLS.
-- select relname, reloptions from pg_class where relname = 'carbo_nf_filial_sem_pedido';

-- (c) As dez mais recentes da fila, para conferir na tela.
-- select numero, data_emissao, contato_nome, valor_total, situacao,
--        codigo_no_rodape, e_bonificacao
-- from public.carbo_nf_filial_sem_pedido
-- order by data_emissao desc nulls last
-- limit 10;
