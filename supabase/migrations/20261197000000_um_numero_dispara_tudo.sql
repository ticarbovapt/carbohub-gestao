-- ═══════════════════════════════════════════════════════════════════════════
-- UM número dispara tudo: o CarboZé (26/11/2026)
--
-- Pedido do dono do processo: *"a partir de agora 1 só vai fazer tudo isso,
-- que é o número do CarboZé … para facilitar e concentrar tudo em um só"*.
--
--   antes                                   depois
--   CarboZé       serviço  (avisos)         CarboZé    serviço + recompra + carrinho
--   CarboZé Clube recompra                  CarboVAPT  caixa do outro produto
--   CarboZé Loja  carrinho                  CarboZé SAC dúvidas, ajuda, pós-venda
--
-- O que muda é a ETAPA (`carbo_msg_templates.numero_id`), que é quem decide de
-- qual número cada mensagem automática sai — nada no código roteia por
-- `funcao`. O nome na tela é o `rotulo` do cadastro.
--
-- ⚠️ Por que não quebra os próximos envios:
-- 1. Os modelos são do WABA, não do número: o mesmo template aprovado sai por
--    qualquer um dos três. A fila só exige o número da etapa ATIVO, e o CarboZé é.
-- 2. Régua no meio do caminho: quem recebeu o Dia 2 pelo Clube recebe o Dia 3
--    pelo CarboZé. "Respondeu" casa (wa_id + número) com CADA envio, então a
--    resposta em qualquer dos dois números para a régua, como antes.
-- 3. A conversa antiga continua na caixa dela (agora CarboVAPT / SAC): a
--    resposta a uma mensagem que saiu pelo Clube cai no Clube. As novas caem
--    na caixa do CarboZé.
-- 4. "Não contatar" e o freio de pessoa são por pessoa, não por número.
--
-- ⚠️ O RISCO que fica, e é do negócio: oferta (marketing) pelo número que manda
-- os avisos do pedido. Se a nota do número cair, a Meta corta o limite dele —
-- inclusive para o "saiu para entrega". A trava que já existe (20261179):
-- com a nota em `pausa_qualidade` (AMARELO) a recompra e o carrinho DESTE
-- número esperam, e os avisos seguem. Aqui ela é garantida no CarboZé.
--
-- ⚠️ O nome que o CLIENTE vê no WhatsApp é o de exibição na Meta (WhatsApp
-- Manager), não o rótulo daqui. Trocar lá passa por revisão da Meta.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── As funções novas no CHECK (refeito a partir do BANCO) ───────────────────
-- Os valores antigos continuam aceitos: nada deixa de caber.
do $$
declare r record;
begin
  for r in
    select con.conname
      from pg_constraint con
     where con.conrelid = 'public.carbo_wa_numeros'::regclass and con.contype = 'c'
       and pg_get_constraintdef(con.oid) ~ 'funcao'
       and pg_get_constraintdef(con.oid) ~ 'carrinho'
  loop
    execute format('alter table public.carbo_wa_numeros drop constraint %I', r.conname);
  end loop;
  alter table public.carbo_wa_numeros
    add constraint carbo_wa_numeros_funcao_check
    check (funcao in ('servico', 'recompra', 'carrinho', 'sac', 'carbovapt'));
end $$;

comment on column public.carbo_wa_numeros.funcao is
  'servico = o CarboZé: avisos do pedido, recompra e carrinho (desde 26/11/2026 tudo que é automático sai por ele). sac = dúvidas, ajuda e pós-venda. carbovapt = a caixa do CarboVAPT. recompra/carrinho = funções antigas, sem número ativo. Quem decide de onde a mensagem automática sai é carbo_msg_templates.numero_id; o rótulo é só para a tela.';


-- ── Os nomes e as funções dos dois números ──────────────────────────────────
-- Os dois continuam ATIVOS: são caixas de atendimento, e é nelas que chega a
-- resposta a tudo que já saiu por eles.
update public.carbo_wa_numeros
   set rotulo = 'CarboVAPT', funcao = 'carbovapt'
 where phone_number_id = '1274076859132981';

update public.carbo_wa_numeros
   set rotulo = 'CarboZé SAC', funcao = 'sac'
 where phone_number_id = '1347087218483622';

-- A trava de qualidade no número que agora leva o comercial: nula = nunca
-- pausaria, e a oferta poderia derrubar a nota de quem avisa a entrega.
update public.carbo_wa_numeros
   set pausa_qualidade = 'YELLOW'
 where phone_number_id = '1255756280958635' and pausa_qualidade is null;


-- ── Toda etapa automática sai pelo CarboZé ──────────────────────────────────
update public.carbo_msg_templates
   set numero_id = '1255756280958635'
 where numero_id in ('1274076859132981', '1347087218483622');


-- ── Conferência (aborta: nada muda se não fechar) ───────────────────────────
do $$
declare n int;
begin
  if not exists (select 1 from public.carbo_wa_numeros
                  where phone_number_id = '1255756280958635' and ativo) then
    raise exception 'o número do CarboZé (1255756280958635) não está ativo — nada foi alterado';
  end if;

  select count(*) into n from public.carbo_msg_templates
   where numero_id in ('1274076859132981', '1347087218483622');
  if n > 0 then
    raise exception 'ainda há % etapa(s) saindo pelo Clube/Loja', n;
  end if;

  select count(*) into n from public.carbo_wa_numeros
   where (phone_number_id = '1274076859132981' and rotulo = 'CarboVAPT')
      or (phone_number_id = '1347087218483622' and rotulo = 'CarboZé SAC');
  if n <> 2 then
    raise exception 'os rótulos não ficaram como esperado (% de 2)', n;
  end if;
end $$;
