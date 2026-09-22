-- ═══════════════════════════════════════════════════════════════════════════
-- "🎉 Nova venda!" passa a dizer QUAL venda
--
-- Pedido do dono do processo em 22/09/2026: *"só um aditivo mesmo com o número
-- da venda — para os outros ninguém vai ter o dado da venda, mas o gestor vai
-- poder buscar o número no sistema e identificar"*.
--
-- Hoje o aviso é:
--     🎉 Nova venda!
--     Realizada por: Rodrigo Torquato
--
-- Quem recebe sabe que ALGUÉM vendeu e não tem como descobrir O QUÊ. O corpo
-- continua sem valor e sem cliente — isso é decisão de processo, e o número não
-- a desfaz: ele é uma CHAVE DE BUSCA, não um dado comercial. Quem pode ver o
-- valor procura em `/vendas`; quem não pode continua sem vê-lo.
--
-- ⚠️ SEPARADOR `·`, NÃO quebra de linha — e isso é medido, não gosto.
-- O `NotificationBell.tsx` renderiza o corpo em `<p class="line-clamp-2">`,
-- SEM `whitespace-pre-line`: um `\n` vira espaço e a "linha própria" não
-- acontece. Fazê-la acontecer exigiria mexer no sininho dos SETE apps — que
-- hoje já tem TRÊS versões diferentes entre si (conferido por md5). Mudar sete
-- arquivos divergentes por uma quebra de linha é como se ganha divergência
-- nova; o `·` entrega a informação sem tocar em nenhum.
--
-- ⚠️ Isto NÃO alcança a venda ON-LINE. Aquele aviso vem de
-- `trg_ecommerce_sale_notify`, em `ecommerce_orders`, e já carrega canal, valor
-- e produto. Este gatilho é só da venda MANUAL — e continua ignorando qualquer
-- pedido `^BLING` (ver `20260886`), senão haveria dois avisos para a mesma
-- venda on-line.
--
-- Roda em bloco único. `Success. No rows returned`.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.trg_venda_manual_notify()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_nome text;
  v_num  text;
  v_corpo text;
begin
  -- Orçamento não é venda. Avisar aqui encheria o sino de proposta que talvez
  -- nunca feche — e quando ela fechar, o aviso vem pela conversão.
  if NEW.status = 'quote' then return NEW; end if;
  if NEW.status = 'cancelled' then return NEW; end if;

  -- ⚠️ Pedido nascido em QUALQUER espelho do Bling fica de fora.
  --
  -- Era `like 'BLING-%'`, que só cobria a conta 1: `BLING2-209` passava e virava
  -- "venda manual" sem vendedor, duplicando o aviso que o gatilho de
  -- `ecommerce_orders` já dá com valor, canal e produto.
  --
  -- A expressão regular casa o prefixo, não o nome exato, então uma conta nova
  -- (`BLING3-`) nasce coberta em vez de reabrir este mesmo bug.
  if coalesce(NEW.order_number, '') ~ '^BLING' then return NEW; end if;

  -- Nome de quem vendeu. `vendedor_name` é o que a venda gravou; o perfil é o
  -- desempate quando só veio o id (e fica atualizado se a pessoa trocar de
  -- nome).
  v_nome := nullif(btrim(coalesce(NEW.vendedor_name, '')), '');
  if v_nome is null and NEW.vendedor_id is not null then
    select nullif(btrim(full_name), '') into v_nome from public.profiles where id = NEW.vendedor_id;
  end if;

  -- O NÚMERO da venda — a chave de busca.
  --
  -- ⚠️ Os dois gatilhos são AFTER (insert e update de status), então
  -- `generate_order_number_trigger` (BEFORE INSERT) já rodou e `order_number`
  -- está preenchido. Ainda assim o corpo é montado condicionalmente: número
  -- vazio viraria "· Nº " pendurado no fim, que parece defeito de tela e manda
  -- procurar um número que não existe.
  v_num := nullif(btrim(coalesce(NEW.order_number, '')), '');

  v_corpo := 'Realizada por: ' || coalesce(v_nome, '—');
  if v_num is not null then
    v_corpo := v_corpo || ' · Nº ' || v_num;
  end if;

  perform public.notify_time_interno(
    'ecommerce_sale',   -- reaproveita o ícone/rótulo de "Nova venda" do sininho
    '🎉 Nova venda!',
    v_corpo,
    'carboze_order', NEW.id,
    -- Quem vendeu não precisa ser avisado da própria venda.
    NEW.vendedor_id);
  return NEW;
exception when others then
  -- Notificação nunca derruba a gravação da venda.
  return NEW;
end $$;

comment on function public.trg_venda_manual_notify is
  'Avisa o time interno quando uma venda manual nasce (ou quando um orçamento vira venda). '
  'Corpo: "Realizada por: <vendedor> · Nº <order_number>". Sem valor e sem cliente, por '
  'decisão de processo — o número é chave de BUSCA, não dado comercial. Separador "·" e não '
  'quebra de linha porque o NotificationBell renderiza sem whitespace-pre-line. Pedido de '
  'QUALQUER espelho do Bling (order_number ~ ^BLING) fica de fora: a venda on-line já é '
  'avisada pelo gatilho de ecommerce_orders, com valor e produto.';


-- ═══════════════════════════════════════════════════════════════════════════
-- Conferência
-- ═══════════════════════════════════════════════════════════════════════════

-- (a) Os últimos avisos de venda MANUAL. Os antigos seguem sem o número (o
--     corpo foi gravado no ato e não é reescrito — histórico não se reescreve);
--     o próximo é que tem de vir com ` · Nº V…`.
select n.created_at, n.title, n.body
from public.notifications n
where n.type = 'ecommerce_sale' and n.reference_type = 'carboze_order'
order by n.created_at desc
limit 5;

-- (b) ⭐ O TESTE: lance uma venda no `/vender` (venda, não orçamento) e repita
--     o (a). O corpo da linha nova tem de ser:
--         Realizada por: <nome> · Nº V2026090086
--
--     ⚠️ Vindo SEM o "· Nº", o gatilho antigo ainda está no ar — `create or
--     replace` não falha por já existir, então não há erro para ver.
--
--     ⚠️ E quem lança NÃO recebe o próprio aviso (último argumento do
--     `notify_time_interno`). Confira no sininho de outra pessoa, ou por esta
--     consulta — olhar o seu próprio sino e não ver nada é o resultado
--     ESPERADO, não uma falha.
