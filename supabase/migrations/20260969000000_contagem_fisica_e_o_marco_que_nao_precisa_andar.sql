-- ═══════════════════════════════════════════════════════════════════════════
-- Contagem física do HUB-SP — e por que NÃO se avança o marco
--
-- ── ⚠️ PRIMEIRO: por que este bloco ABORTA se você rodar sem editar ──────
--
-- A versão anterior desta migração trazia a contagem de exemplo como zeros:
--
--     ('CZ100', 0),   ('KIT-CARB-SACH-10ML', 0)
--
-- Rodada sem edição, ela ZEROU os dois saldos (275 → 0 e 1.145 → 0) sem
-- reclamar de nada. E não podia reclamar: `0` é um saldo perfeitamente válido —
-- `CARB-SACH-10ML` tem 0 de verdade. O valor de exemplo era indistinguível de
-- uma resposta.
--
-- É a MESMA doença que este repositório persegue em todo lugar: o erro não deu
-- erro. `Math.round` inventando o fator `×1` no lugar de admitir que não sabia;
-- o link `?pedido=` abrindo a tela com o card fechado; o `pg_cron` marcando
-- `succeeded` porque conseguiu POSTAR. Ausência disfarçada de resposta.
--
-- Por isso o valor de exemplo agora é `null` e o bloco é plpgsql: `null` não é
-- um saldo possível, e a primeira coisa que o código faz é RECUSAR-SE a rodar
-- com ele, dizendo qual produto falta. Placeholder que executa em silêncio não
-- é placeholder, é armadilha.
--
-- ── ⭐ O que a medição de 31/08 16:30 mostrou ────────────────────────────
--
-- `carbo_ecommerce_deduzir_estoque()` voltou VAZIO: o cron está em dia e tudo
-- que era elegível já tem linha no ledger. Não há atraso para compensar, e
-- portanto não há nada a semear no ledger — só o saldo a corrigir.
--
-- ── ⚠️ O perigo que o ajuste ingênuo CRIA ───────────────────────────────
--
-- `quantity = <contado>` escreve um número ABSOLUTO, mas a contagem descreve a
-- prateleira num INSTANTE, e o cron deduz a cada 10 min:
--
--     16:30  você conta 800 na prateleira
--     16:38  o cron deduz 5 de uma venda nova   → saldo vai a 795 (certo)
--     17:10  você roda `quantity = 800`         → a venda das 16:38 SUMIU
--
-- Silencioso, e do tamanho do tempo entre contar e rodar. É a dupla contagem ao
-- contrário: lá a saída era contada duas vezes, aqui deixa de ser contada.
--
-- Por isso o bloco pede o INSTANTE da contagem e desconta sozinho o que a
-- dedução automática tirou depois dele. Contar às 16:30 e rodar às 23:00
-- continua dando o número certo.
--
-- ── Por que o marco zero fica ONDE ESTÁ ──────────────────────────────────
--
-- Marco zero é filtro por DATA (`ordered_at > deduz_a_partir_de`): pergunta se
-- a venda é ANTIGA, não se ela já foi contabilizada. Avançá-lo pegaria por
-- engano todo pedido feito antes da contagem que ainda não é venda — mercadoria
-- que estava na prateleira, ENTROU na contagem, e que ao ser paga sai de
-- verdade sem nunca ser descontada.
--
-- ⭐ Medido: 50 pedidos pendentes, 68 itens (nuvemshop 44, mercadolivre 5,
-- shopee 1). Cada um é uma saída futura que o marco avançado tornaria invisível
-- para sempre. Como o ledger já cobre tudo que foi deduzido, avançar o marco não
-- protegeria de nada hoje — só criaria esse vazamento.
--
-- ⚠️ RODE EM BLOCOS.
-- ═══════════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 0 — reconferir na hora de rodar (o estado muda a cada 10 min)   ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- (0.a) ⭐ TEM DE VIR VAZIO. Linha aqui = o cron atrasou e essas vendas
--       deduziriam POR CIMA da contagem. Pare e resolva antes.
select * from public.carbo_ecommerce_deduzir_estoque();

-- (0.b) O saldo de agora, para comparar com o que você contou.
--       ⚠️ `CARB-SACH-10ML` com 0 é LEGÍTIMO: a LogHouse guarda kits fechados,
--       não sachês soltos. Não o inclua na contagem só porque está zerado.
select p.product_code, p.name, ws.quantity as saldo_no_sistema, ws.updated_at
from public.warehouse_stock ws
join public.mrp_products p on p.id = ws.product_id
join public.warehouses  w on w.id = ws.warehouse_id
where w.code = 'HUB-SP'
order by p.product_code;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — o ajuste                                                    ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
--
-- ⚠️ EDITE `v_contado_em` E os `null` da lista. Rodar sem editar ABORTA com
-- mensagem, sem tocar em nada — o DO é uma transação só.
--
-- ⚠️ O número é o SALDO FINAL CONTADO na prateleira, NUNCA o que chegou de
-- reposição. Com saldo em −200, digitar "800" porque chegaram 800 gera entrada
-- de 1.000 e conta a dívida duas vezes. O código calcula a diferença sozinho.
--
-- ⚠️ Produto que você NÃO contou: APAGUE a linha dele. Deixar `null` aborta —
-- de propósito. "Não contei" e "contei zero" são respostas diferentes, e a
-- segunda apaga estoque bom.

do $$
declare
  -- ┌─ INSTANTE DA CONTAGEM ────────────────────────────────────────────────┐
  v_contado_em timestamptz := null;   -- ex.: timestamptz '2026-08-31 16:30:00-03'
  --                                     contando agora? use: now()
  -- └───────────────────────────────────────────────────────────────────────┘
  v_hub    text := 'HUB-SP';
  v_wh     uuid;
  r        record;
  v_pid    uuid;
  v_antes  integer;
  v_delta  integer;
  v_alvo   integer;
begin
  if v_contado_em is null then
    raise exception
      'Preencha v_contado_em com o instante da contagem (ou now()). Nada foi alterado.';
  end if;
  if v_contado_em > now() then
    raise exception 'v_contado_em está no FUTURO (%). Nada foi alterado.', v_contado_em;
  end if;

  select w.id into v_wh from public.warehouses w where w.code = v_hub;
  if v_wh is null then
    raise exception 'Galpão % não existe em warehouses. Nada foi alterado.', v_hub;
  end if;

  for r in
    select * from (values
      -- ┌──────────────────────────┬──────────────────────────────────────┐
      -- │ código do produto        │ SALDO FINAL CONTADO (troque o null)  │
      ('CZ100'::text                , null::integer),
      ('KIT-CARB-SACH-10ML'         , null::integer)
      -- └──────────────────────────┴──────────────────────────────────────┘
      -- Produto não contado: APAGUE a linha. Não deixe null, não escreva 0.
    ) t(product_code, saldo_contado)
  loop
    -- ⭐ A TRAVA que faltava. `null` não é saldo possível, então ele só pode
    --    significar "o exemplo não foi editado" — e aqui isso PARA tudo, em vez
    --    de virar um zero que apaga estoque bom sem reclamar.
    if r.saldo_contado is null then
      raise exception
        'Contagem não preenchida para "%". Troque o null pelo saldo FINAL contado, '
        'ou APAGUE a linha se não contou esse produto. Nada foi alterado.',
        r.product_code;
    end if;
    if r.saldo_contado < 0 then
      raise exception 'Contagem negativa para "%" (%). Nada foi alterado.',
        r.product_code, r.saldo_contado;
    end if;

    select p.id into v_pid
    from public.mrp_products p where p.product_code = r.product_code;
    if v_pid is null then
      raise exception 'Produto "%" não existe em mrp_products. Nada foi alterado.',
        r.product_code;
    end if;

    -- ⚠️ FOR UPDATE antes de ler: o cron pode estar deduzindo neste instante.
    select ws.quantity into v_antes
    from public.warehouse_stock ws
    where ws.warehouse_id = v_wh and ws.product_id = v_pid
    for update;
    v_antes := coalesce(v_antes, 0);

    -- ⭐ O que a dedução automática mexeu DEPOIS da contagem. Sem isto o ajuste
    --    apagaria essas vendas.  Saída conta negativo, estorno conta positivo.
    select coalesce(sum(case when m.tipo = 'saida' then -m.quantidade
                                                   else  m.quantidade end), 0)
      into v_delta
    from public.stock_movements m
    where m.product_id   = v_pid
      and m.warehouse_id = v_wh
      and m.origem       = 'ecommerce'
      and m.created_at   > v_contado_em;

    v_alvo := r.saldo_contado + v_delta;

    if v_alvo = v_antes then
      raise notice '% · contado % · já batia (%). Sem movimento.',
        r.product_code, r.saldo_contado, v_antes;
      continue;                       -- ajuste de zero só polui Movimentações
    end if;

    -- O ajuste vira UMA linha em Movimentações, com a conta escrita. Ajuste sem
    -- rastro é saldo que ninguém consegue explicar três meses depois.
    insert into public.stock_movements
      (product_id, warehouse_id, tipo, quantidade, origem, observacoes, executor)
    values
      (v_pid, v_wh,
       case when v_alvo >= v_antes then 'entrada' else 'saida' end,
       abs(v_alvo - v_antes),
       'ajuste',
       'Contagem física LogHouse · contado ' || r.saldo_contado
         || ' em ' || to_char(v_contado_em at time zone 'America/Sao_Paulo',
                              'DD/MM HH24:MI')
         || case when v_delta <> 0
                 then ' · ' || v_delta || ' de venda on-line depois da contagem'
                 else '' end
         || ' · sistema ' || v_antes || ' → ' || v_alvo,
       'contagem:loghouse');

    insert into public.warehouse_stock (warehouse_id, product_id, quantity)
    values (v_wh, v_pid, v_alvo)
    on conflict (warehouse_id, product_id)
    do update set quantity = excluded.quantity, updated_at = now();

    raise notice '% · % → % (contado %, % de venda depois da contagem)',
      r.product_code, v_antes, v_alvo, r.saldo_contado, v_delta;
  end loop;
end $$;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — conferência                                                 ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- (2.a) O saldo ficou no valor esperado (contado, menos o que saiu depois).
select p.product_code, ws.quantity as saldo_agora, ws.updated_at
from public.warehouse_stock ws
join public.mrp_products p on p.id = ws.product_id
join public.warehouses  w on w.id = ws.warehouse_id
where w.code = 'HUB-SP'
order by p.product_code;

-- (2.b) O ajuste aparece em Movimentações com a conta na observação.
select m.created_at, p.product_code, m.tipo, m.quantidade, m.origem,
       m.executor, m.observacoes
from public.stock_movements m
join public.mrp_products p on p.id = m.product_id
where m.origem = 'ajuste' and m.executor like 'contagem%' or m.executor like 'estorno%'
order by m.created_at desc limit 10;

-- (2.c) ⭐ Continua VAZIO: o ajuste não reabriu nada para deduzir.
select * from public.carbo_ecommerce_deduzir_estoque();

-- (2.d) ⚠️ A garantia permanente (a mesma da 20260967): nada fora da lista
--       branca pode ter linha no ledger. Tem de vir ZERO.
select count(*) as consumos_indevidos
from public.carbo_estoque_consumo k
join public.ecommerce_orders o on o.platform || ':' || o.order_id = k.origem_chave
where k.origem_tipo = 'ecommerce'
  and not public.ecommerce_status_e_venda(o.status);


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 3 — o estorno, se um ajuste sair errado                         ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
--
-- Desfaz TODO ajuste de contagem ainda não estornado, calculando pelo próprio
-- movimento gravado — então funciona mesmo que o cron tenha deduzido em cima do
-- saldo errado nesse intervalo. Foi usado em 31/08, quando o bloco com valores
-- de exemplo zerou os dois saldos.
--
-- ⚠️ Ele NÃO apaga o movimento errado: acrescenta o contrário. Ledger é
-- append-only, e o par (erro + estorno) é o que conta a história — apagar
-- deixaria um saldo que muda sozinho sem explicação.

/*  Descomente para usar.
begin;
with errados as (
  select m.id, m.product_id, m.warehouse_id, m.tipo, m.quantidade
  from public.stock_movements m
  where m.origem = 'ajuste'
    and m.executor = 'contagem:loghouse'
    and not exists (
      select 1 from public.stock_movements r
      where r.executor = 'estorno:contagem-exemplo'
        and r.ref_externa = m.id::text
    )
),
volta as (
  insert into public.stock_movements
    (product_id, warehouse_id, tipo, quantidade, origem, observacoes,
     executor, ref_externa)
  select e.product_id, e.warehouse_id,
         case when e.tipo = 'saida' then 'entrada' else 'saida' end,
         e.quantidade, 'ajuste',
         'Estorno de ajuste de contagem — desfaz o movimento ' || e.id,
         'estorno:contagem-exemplo', e.id::text
  from errados e
  returning 1
)
update public.warehouse_stock ws
   set quantity = ws.quantity
                  + case when e.tipo = 'saida' then e.quantidade else -e.quantidade end,
       updated_at = now()
from errados e
where ws.warehouse_id = e.warehouse_id and ws.product_id = e.product_id;
commit;
*/
