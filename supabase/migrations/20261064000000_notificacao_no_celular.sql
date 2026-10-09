-- ─────────────────────────────────────────────────────────────────────────────
-- O SININHO no CELULAR — toda notificação, não só a do Carbo Chat.
--
-- Pedido do dono do processo em 09/10/2026: a venda on-line (e o resto do
-- sininho) aparecer no Android como a mensagem do WhatsApp, inclusive com o app
-- fechado — "meu CEO precisa ver as notificações".
--
-- O mecanismo JÁ EXISTIA para o chat (Web Push / VAPID, `chat-push`,
-- `chat_push_subscriptions`). Aqui ele passa a valer para a tabela
-- `notifications` inteira, sem tocar no chat:
--
--   1. ⚠️ Gatilho POR COMANDO, não por linha. A venda on-line entra pelo
--      `notify_time_interno` como UM insert de ~30 linhas; por linha seriam 30
--      chamadas HTTP por venda. Aqui é UMA, com o lote.
--   2. ⚠️ `chat_message` fica FORA: o chat já tem o seu push (com a regra de
--      "não avisar quem está com a conversa aberta"). Mandar pelos dois
--      caminhos daria duas notificações por mensagem.
--   3. ⚠️ Só vai para quem tem aparelho cadastrado (`chat_push_subscriptions`)
--      — quem ATIVOU no celular. Ninguém recebe o que não pediu; o sininho
--      continua igual para todo mundo.
--   4. ⚠️ Best-effort: erro de rede ou de configuração NUNCA desfaz a
--      notificação. O sininho é a verdade; o celular é o aviso.
--   5. A URL e o segredo são os do chat (`chat_push_config`) — a função nova
--      mora ao lado (`carbo-push`) e lê o MESMO secret. Config em dois lugares
--      seria o par que diverge.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.carbo_notificacao_push()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_cfg   public.chat_push_config%rowtype;
  v_itens jsonb;
begin
  select jsonb_agg(jsonb_build_object(
           'user_id', n.user_id, 'type', n.type, 'title', n.title, 'body', n.body,
           'reference_type', n.reference_type, 'reference_id', n.reference_id))
    into v_itens
    from novas n
   where n.type is distinct from 'chat_message'
     and exists (select 1 from public.chat_push_subscriptions s where s.user_id = n.user_id);

  if v_itens is null then return null; end if;

  select * into v_cfg from public.chat_push_config where id limit 1;
  if not found or v_cfg.function_url is null then return null; end if;

  begin
    perform net.http_post(
      url     := replace(v_cfg.function_url, '/chat-push', '/carbo-push'),
      headers := jsonb_build_object('Content-Type', 'application/json',
                                    'x-chat-push-secret', v_cfg.shared_secret),
      body    := jsonb_build_object('itens', v_itens)
    );
  exception when others then
    null;  -- best-effort: o sininho já gravou; o celular é extra
  end;
  return null;
end $$;

drop trigger if exists trg_notificacao_push on public.notifications;
create trigger trg_notificacao_push
  after insert on public.notifications
  referencing new table as novas
  for each statement execute function public.carbo_notificacao_push();

-- Teste de ponta a ponta, chamado pelo botão "Testar" do Hub: grava UMA
-- notificação para QUEM CLICOU — passa pelo mesmo gatilho e pela mesma função
-- que a venda real. Teste que usa outro caminho prova o caminho errado.
create or replace function public.carbo_push_teste()
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'sem sessão'; end if;
  insert into public.notifications (user_id, type, title, body, reference_type, reference_id, is_read)
  values (auth.uid(), 'push_teste', 'Notificações ativas ✅',
          'É assim que as vendas e os avisos vão aparecer neste aparelho.', null, null, false);
end $$;
revoke execute on function public.carbo_push_teste() from public, anon;
grant execute on function public.carbo_push_teste() to authenticated;
