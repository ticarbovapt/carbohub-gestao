-- ═══════════════════════════════════════════════════════════════════════════
-- Zerar a caixa de pronta entrega de UM vendedor — limpeza, não devolução
--
-- Pedido do dono do processo em 22/09/2026: *"quero zerar o estoque de Rodrigo
-- por SQL, nada de devolver, zerar mesmo só para limpar"*.
--
-- ⚠️ ZERAR ≠ DEVOLVER, e a diferença tem consequência contábil.
--
--   devolver  →  `transferencia`: sai da caixa e ENTRA no HUB-RN. O total da
--                empresa não muda; a mercadoria voltou para Natal.
--   zerar     →  `ajuste`: sai da caixa e não entra em lugar nenhum. O total
--                da empresa DIMINUI em 795 unidades.
--
-- Foi zerar o que se pediu — a caixa está sendo limpa, não recolhida. Mas isso
-- precisa estar escrito, porque daqui a um mês "sumiram 795 unidades" é uma
-- pergunta que alguém faz, e a resposta tem de estar no movimento.
--
-- ⚠️ O movimento é REGISTRADO, não só o saldo apagado. `update warehouse_stock
-- set quantity = 0` sozinho funcionaria e deixaria a queda sem explicação em
-- Movimentações — que é exatamente o "—" que a tela mostra quando não se sabe
-- quem fez. A linha de ajuste é o que torna isto auditável.
--
-- ⚠️ NOME NÃO É CHAVE. O bloco recusa rodar se "Rodrigo" casar com duas
-- pessoas, em vez de escolher uma — a mesma regra da carga de PDV. E recusa se
-- não casar com ninguém, em vez de rodar e não fazer nada.
--
-- ⚠️ RODE EM BLOCOS.
-- ═══════════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 0 — a FOTO DO ANTES (leitura pura)                              ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- (a) ⭐ Quem é "Rodrigo" e qual é a caixa dele. ESPERADO: UMA linha.
--     Vindo duas, PARE — o BLOCO 1 vai recusar rodar, e está certo.
select w.id as warehouse_id, w.code, w.name, w.owner_id, p.full_name
from public.warehouses w
join public.profiles p on p.id = w.owner_id
where w.kind = 'vendedor'
  and p.full_name ilike '%rodrigo%'
order by p.full_name;

-- (b) ⭐ O saldo de HOJE. Tem de bater com a tela `/meu-estoque`:
--     CZ100 = 155 · CARB-SACH-10ML = 640 · total 795.
--     ⚠️ Não vindo 795, NÃO rode o BLOCO 1 — ou a caixa é outra, ou a tela
--     está olhando outra coisa, e nos dois casos a medição é que manda.
select pr.product_code, pr.name, ws.quantity
from public.warehouse_stock ws
join public.warehouses w on w.id = ws.warehouse_id
join public.profiles p   on p.id = w.owner_id
join public.mrp_products pr on pr.id = ws.product_id
where w.kind = 'vendedor' and p.full_name ilike '%rodrigo%'
  and ws.quantity <> 0
order by pr.product_code;

-- (c) Nada em trânsito para ela? A tela diz "A caminho: 0".
--     ⚠️ Transferência aberta NÃO é tocada por este ajuste: ela credita a caixa
--     quando for confirmada, e o saldo volta do nada. Vindo linha aqui,
--     resolva a transferência ANTES.
--
--     ⚠️ A coluna é `to_hub`, não `to_warehouse_id` — e o vocabulário de status
--     é `approved` (em trânsito, já debitado do HUB-RN) → `executed`
--     (confirmado, creditado) / `cancelled` (estornado). Escrevi os dois
--     errados na primeira versão e o erro foi ALTO (42703), que é o modo bom
--     de falhar: nome de coluna inventado numa cláusula de GUARDA que voltasse
--     vazia seria lido como "não há nada em trânsito".
select t.id, t.status, t.created_at, pr.product_code, t.quantity
from public.stock_transfers t
join public.warehouses w on w.id = t.to_hub
join public.profiles p   on p.id = w.owner_id
left join public.mrp_products pr on pr.id = t.product_id
where w.kind = 'vendedor' and p.full_name ilike '%rodrigo%'
  and t.status = 'approved'
order by t.created_at desc;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — zerar, registrando a saída                                  ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
--
-- ⚠️ Confira o BLOCO 0 antes. Este bloco é DESTRUTIVO: as unidades saem da
-- contagem da empresa e não voltam por si.
--
-- Ele aborta sozinho se o nome não resolver para exatamente uma pessoa —
-- exemplo indistinguível de resposta é a doença do `('CZ100', 0)` da `20260969`.

do $$
declare
  v_wh    uuid;
  v_nome  text;
  v_qtd   int;
  v_total numeric;
begin
  select w.id, p.full_name into v_wh, v_nome
  from public.warehouses w
  join public.profiles p on p.id = w.owner_id
  where w.kind = 'vendedor' and p.full_name ilike '%rodrigo%';

  if not found then
    raise exception 'Nenhuma caixa de vendedor para "rodrigo". Rode o BLOCO 0 (a) e ajuste o filtro.';
  end if;
  -- `select into` com duas linhas pega a primeira CALADO. Só a contagem
  -- explícita transforma ambiguidade em erro em vez de em escolha ao acaso.
  if (select count(*) from public.warehouses w
      join public.profiles p on p.id = w.owner_id
      where w.kind = 'vendedor' and p.full_name ilike '%rodrigo%') > 1 then
    raise exception 'Mais de um "rodrigo" com caixa. Troque o filtro pelo warehouse_id exato do BLOCO 0 (a).';
  end if;

  -- 1) A linha de auditoria, ANTES de apagar o saldo — é ela que explica a
  --    queda em Movimentações. `origem = 'ajuste'` (não `transferencia`):
  --    nada está voltando para o HUB-RN.
  insert into public.stock_movements
    (product_id, warehouse_id, tipo, quantidade, origem, observacoes, created_by)
  select ws.product_id, ws.warehouse_id, 'saida', ws.quantity, 'ajuste',
         'Zeragem da caixa de ' || v_nome || ' — limpeza, sem devolução ao HUB-RN',
         auth.uid()
  from public.warehouse_stock ws
  where ws.warehouse_id = v_wh and ws.quantity <> 0;

  get diagnostics v_qtd = row_count;

  select coalesce(sum(quantity), 0) into v_total
  from public.warehouse_stock where warehouse_id = v_wh and quantity <> 0;

  -- 2) O saldo. Só desta caixa — o `where` é a regra inteira aqui.
  update public.warehouse_stock
     set quantity = 0, updated_at = now()
   where warehouse_id = v_wh and quantity <> 0;

  raise notice 'Caixa de % zerada: % produto(s), % unidade(s).', v_nome, v_qtd, v_total;
end $$;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — CONFERÊNCIA                                                 ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- (a) ⭐ A caixa está vazia. ESPERADO: ZERO linhas.
select pr.product_code, ws.quantity
from public.warehouse_stock ws
join public.warehouses w on w.id = ws.warehouse_id
join public.profiles p   on p.id = w.owner_id
join public.mrp_products pr on pr.id = ws.product_id
where w.kind = 'vendedor' and p.full_name ilike '%rodrigo%' and ws.quantity <> 0;

-- (b) ⭐ E a saída ficou REGISTRADA. ESPERADO: duas linhas, 155 e 640.
select m.created_at, pr.product_code, m.tipo, m.quantidade, m.origem, m.observacoes
from public.stock_movements m
join public.warehouses w on w.id = m.warehouse_id
join public.profiles p   on p.id = w.owner_id
join public.mrp_products pr on pr.id = m.product_id
where w.kind = 'vendedor' and p.full_name ilike '%rodrigo%'
order by m.created_at desc limit 10;
-- ⚠️ (a) vazio com (b) vazio significa que o saldo foi apagado sem rastro —
-- não é o caso deste bloco, mas é o que se confere.
