-- ═══════════════════════════════════════════════════════════════════════════
-- "🎉 Nova venda! Realizada por: —" — o filtro que envelheceu
--
-- ── O sintoma ─────────────────────────────────────────────────────────────
--
-- Duas notificações para a MESMA venda on-line:
--
--   "Nova venda · NS"   Nuvemshop · R$ 149,50 · 1 un. · CarboZé Kit…
--   "🎉 Nova venda!"    Realizada por: —
--
-- A primeira é a boa, do gatilho de `ecommerce_orders`. A segunda vem do
-- gatilho de VENDA MANUAL, em `carboze_orders`, que não tem valor nem canal por
-- decisão de processo — e sem vendedor, porque marketplace não tem vendedor.
--
-- ── A causa ───────────────────────────────────────────────────────────────
--
-- O gatilho de venda manual já tinha a trava certa, escrita quando só existia
-- uma conta Bling:
--
--     if coalesce(NEW.order_number, '') like 'BLING-%' then return NEW; end if;
--
-- `BLING-%` exige o hífen imediatamente depois de "BLING". O namespace da
-- segunda conta é `BLING2-` (ele existe justamente porque os dois Blings
-- numeram do zero e colidiriam). `BLING2-209` não casa com `BLING-%`, a trava
-- não pega, e todo pedido que a ponte traz do Bling 2 vira "venda manual".
--
-- Nada quebrou quando o Bling 2 entrou: a exclusão só deixou de cobrir, calada.
--
-- ── Por que só agora incomodou ────────────────────────────────────────────
--
-- Até hoje o pedido só cruzava a ponte depois do `order_details`, que rodava
-- 1×/dia às 14:30. O aviso vazio chegava horas depois do bom e parecia ruído
-- solto. Com o pipeline em ~2 minutos, os dois caem quase juntos e o par ficou
-- evidente. A frequência não criou o defeito — só parou de escondê-lo.
--
-- ── O conserto ────────────────────────────────────────────────────────────
--
-- NÃO trocar `'BLING-%'` por `'BLING2-%'`. Isso conserta hoje e quebra de novo
-- no dia em que existir uma terceira conta — o mesmo erro, de novo, pelo mesmo
-- motivo. A trava passa a expressar a INTENÇÃO ("pedido nascido em espelho não
-- notifica") em vez de um nome específico:
--
--     if NEW.order_number ~ '^BLING' then return NEW; end if;
--
-- ⚠️ Isto NÃO silencia a venda on-line: ela continua avisando pelo gatilho de
-- `ecommerce_orders`, que é o completo. O que some é a segunda notificação,
-- pobre e sem vendedor, da mesma venda.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.trg_venda_manual_notify()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_nome text;
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

  perform public.notify_time_interno(
    'ecommerce_sale',   -- reaproveita o ícone/rótulo de "Nova venda" do sininho
    '🎉 Nova venda!',
    'Realizada por: ' || coalesce(v_nome, '—'),
    'carboze_order', NEW.id,
    -- Quem vendeu não precisa ser avisado da própria venda.
    NEW.vendedor_id);
  return NEW;
exception when others then
  -- Notificação nunca derruba a gravação da venda.
  return NEW;
end $$;

comment on function public.trg_venda_manual_notify is
  'Avisa o time interno quando uma venda manual nasce (ou quando um orçamento vira venda). Sem valor e sem canal, por decisão de processo. Pedido de QUALQUER espelho do Bling (order_number ~ ^BLING) fica de fora: a venda on-line já é avisada pelo gatilho de ecommerce_orders, com valor e produto.';


-- ═══════════════════════════════════════════════════════════════════════════
-- Conferência
-- ═══════════════════════════════════════════════════════════════════════════

-- (a) Daqui para frente, nenhum aviso novo de pedido BLING*. Rode depois da
--     próxima venda on-line cruzar a ponte (ciclo de 2 min): a contagem NÃO
--     pode crescer.
select count(*) as avisos_de_espelho_ate_agora
from public.notifications n
join public.carboze_orders o
  on o.id::text = n.reference_id and n.reference_type = 'carboze_order'
where n.type = 'ecommerce_sale'
  and o.order_number ~ '^BLING';

-- (b) A venda on-line continua avisando pelo caminho certo — o gatilho de
--     ecommerce_orders, com plataforma e produto no corpo.
select n.created_at, n.title, left(n.body, 60) as corpo
from public.notifications n
where n.type = 'ecommerce_sale'
  and n.reference_type <> 'carboze_order'
order by n.created_at desc
limit 5;
