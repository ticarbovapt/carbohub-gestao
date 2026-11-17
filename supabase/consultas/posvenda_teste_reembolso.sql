-- ═══════════════════════════════════════════════════════════════════════════
-- Pós-venda: um PEDIDO e uma RECLAMAÇÃO de TESTE, para treinar o roteiro
-- inteiro (caso → reembolso → Financeiro → comprovante) e voltar ao zero.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Cole no SQL Editor. NÃO é migração: não vai para `supabase/migrations/`.
--
-- Tudo é FICTÍCIO e não casa com venda real:
--   pedido    bling_id -9900000000001 · CZTESTE0001 · "Cliente Teste Pós-venda"
--   telefone  (00) 99999-0001 · wa_id 5500999990001 — DDD 00 não existe, então
--             a chave de telefone (DDD + 8 dígitos) não liga a pedido de ninguém
--             e a Meta recusa qualquer envio para ele.
--
-- O que ele cria:
--   • um cartão "entregue" na Esteira (carbo_esteira_cards) de HOJE — aparece
--     no Pós-venda na semana atual e na coluna "Entregue" da Esteira;
--   • "ignorado" em TODAS as mensagens automáticas desse pedido (esteira e
--     recompra): nenhum WhatsApp sai para ele;
--   • duas mensagens do cliente no número de SERVIÇO reclamando de item
--     faltando e pedindo reembolso, com a janela de 24 h aberta.
--
-- ⚠️ Quem está ligado em "Mensagem de cliente" (TI → Notificações) recebe UM
--    aviso "💬 Cliente Teste Pós-venda respondeu" a cada BLOCO 1.
-- ⚠️ O "Enviar pelo WhatsApp" do último passo vai FALHAR com este telefone
--    (o número não existe) — use "Já enviei por outro meio" para encerrar.
--    Para ver o comprovante chegar de verdade, troque v_wa e v_fone pelo SEU
--    número no BLOCO 1 (o pedido continua fictício; os seus pedidos reais
--    aparecem no cartão "Pós-venda" da conversa).
-- ⚠️ O comprovante que o Financeiro subir no teste FICA no bucket (não se
--    apaga comprovante por SQL). Ele não aparece em lugar nenhum depois do reset.


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — CRIAR ou RESETAR (rode quantas vezes quiser)                ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- ESPERADO: uma linha com pedido = 1, mensagens = 2, reclamacao_ligada = true
-- e os assuntos (faltou_item, cancelamento…). reclamacao_ligada = false quer
-- dizer que a reclamação não casou com o pedido de teste: mande o resultado.
do $$
declare
  v_id   constant bigint := -9900000000001;
  v_wa   constant text   := '5500999990001';      -- troque pelo SEU número (55 + DDD + número) para receber o comprovante
  v_fone constant text   := '(00) 99999-0001';    -- e aqui o mesmo número, formatado
  v_num  text;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  select phone_number_id into v_num from public.carbo_wa_numeros where funcao = 'servico' and ativo limit 1;
  v_num := coalesce(v_num, '1255756280958635');

  -- ── Limpa o teste anterior ──────────────────────────────────────────────
  delete from public.notifications
   where (reference_type = 'posvenda_pedido' and reference_id = v_id::text)
      or (reference_type = 'posvenda_reembolso' and reference_id in (
            select r.id::text from public.carbo_posvenda_reembolsos r where r.bling_id = v_id));
  delete from public.carbo_posvenda_casos where bling_id = v_id;          -- leva histórico e reembolsos
  delete from public.carbo_entrega_trato where bling_id = v_id;
  delete from public.carbo_msg_envios where bling_id = v_id;
  delete from public.carbo_wa_msg_assunto where wamid like 'teste-posvenda-%';
  delete from public.carbo_wa_mensagens where wamid like 'teste-posvenda-%';
  delete from public.carbo_wa_atendimento where numero_id = v_num and wa_id = v_wa;
  delete from public.carbo_wa_contatos where numero_id = v_num and wa_id = v_wa;
  if to_regclass('public.carbo_recompra_base') is not null then
    execute 'delete from public.carbo_recompra_base where bling_id = $1' using v_id;
  end if;
  delete from public.carbo_esteira_cards where bling_id = v_id;

  -- ── O pedido (entregue: a varredura do robô da Esteira não o recalcula) ─
  insert into public.carbo_esteira_cards
    (bling_id, pedido_numero, pedido_codigo, canal, data_pedido, total, cliente, cliente_fone,
     entrega_cidade, entrega_uf, etapa, transportadora, nf_numero)
  values (v_id, 'TESTE-0001', 'CZTESTE0001', 'Teste (não é venda)', v_hoje, 149.50,
          'Cliente Teste Pós-venda', v_fone, 'Cidade Teste', 'RN', 'entregue', 'Teste', '000000');

  -- ── Nenhuma mensagem automática para este pedido ───────────────────────
  insert into public.carbo_msg_envios (bling_id, etapa, status, motivo)
  select v_id, e, 'ignorado', 'teste do pós-venda: não enviar'
    from unnest(array['confirmado','nf_emitida','etiqueta','em_transito','saiu_entrega','entregue','recompra']) e
  on conflict (bling_id, etapa) do update set status = 'ignorado', motivo = excluded.motivo;

  -- ── A conversa: janela de 24 h aberta, duas mensagens de reclamação ────
  insert into public.carbo_wa_contatos (numero_id, wa_id, nome, last_inbound_at)
  values (v_num, v_wa, 'Cliente Teste Pós-venda', now() - interval '8 minutes')
  on conflict (numero_id, wa_id) do update set nome = excluded.nome, last_inbound_at = excluded.last_inbound_at;

  insert into public.carbo_wa_mensagens (wamid, wa_id, numero_id, direcao, tipo, texto, ocorrido_em, payload)
  values
    ('teste-posvenda-1', v_wa, v_num, 'entrada', 'text',
     'Boa tarde! Recebi meu pedido hoje mas faltou um frasco, veio só 4 dos 5 do kit.',
     now() - interval '10 minutes', '{"teste": true}'),
    ('teste-posvenda-2', v_wa, v_num, 'entrada', 'text',
     'Quero o reembolso do frasco que faltou, por favor.',
     now() - interval '8 minutes', '{"teste": true}');
end $$;

select
  (select count(*) from public.carbo_esteira_cards where bling_id = -9900000000001) as pedido,
  (select count(*) from public.carbo_wa_mensagens where wamid like 'teste-posvenda-%') as mensagens,
  coalesce((select bool_and(r.bling_id = -9900000000001)
              from public.carbo_posvenda_reclamacoes(now() - interval '1 day', null) r
             where r.wamid like 'teste-posvenda-%'), false) as reclamacao_ligada,
  (select array_agg(distinct a) from public.carbo_posvenda_reclamacoes(now() - interval '1 day', null) r,
          unnest(r.assuntos) a where r.wamid like 'teste-posvenda-%') as assuntos;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — APAGAR o teste (quando terminar)                            ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- ESPERADO: uma linha com zeros. O pedido, a conversa, o caso, o reembolso e
-- os avisos somem; o comprovante fica no bucket (ver o aviso no topo).
--
-- do $$
-- declare
--   v_id constant bigint := -9900000000001;
--   v_wa constant text   := '5500999990001';      -- o MESMO do BLOCO 1
--   v_num text;
-- begin
--   select phone_number_id into v_num from public.carbo_wa_numeros where funcao = 'servico' and ativo limit 1;
--   v_num := coalesce(v_num, '1255756280958635');
--   delete from public.notifications
--    where (reference_type = 'posvenda_pedido' and reference_id = v_id::text)
--       or (reference_type = 'posvenda_reembolso' and reference_id in (
--             select r.id::text from public.carbo_posvenda_reembolsos r where r.bling_id = v_id));
--   delete from public.carbo_posvenda_casos where bling_id = v_id;
--   delete from public.carbo_entrega_trato where bling_id = v_id;
--   delete from public.carbo_msg_envios where bling_id = v_id;
--   delete from public.carbo_wa_msg_assunto where wamid like 'teste-posvenda-%';
--   delete from public.carbo_wa_mensagens where wamid like 'teste-posvenda-%';
--   delete from public.carbo_wa_atendimento where numero_id = v_num and wa_id = v_wa;
--   delete from public.carbo_wa_contatos where numero_id = v_num and wa_id = v_wa;
--   if to_regclass('public.carbo_recompra_base') is not null then
--     execute 'delete from public.carbo_recompra_base where bling_id = $1' using v_id;
--   end if;
--   delete from public.carbo_esteira_cards where bling_id = v_id;
-- end $$;
--
-- select
--   (select count(*) from public.carbo_esteira_cards where bling_id = -9900000000001) as pedido,
--   (select count(*) from public.carbo_wa_mensagens where wamid like 'teste-posvenda-%') as mensagens,
--   (select count(*) from public.carbo_posvenda_casos where bling_id = -9900000000001) as casos;
