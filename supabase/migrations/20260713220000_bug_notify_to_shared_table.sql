-- Consolida as notificações de bug/sugestão dos apps novos na tabela
-- COMPARTILHADA public.notifications (a que todos os sininhos leem). Antes
-- gravavam em carbo_notifications, que nenhum sininho mais lê → bug reportado
-- pelo botão novo não notificava ninguém. Só muda o destino (e o tipo do
-- resolvido, pra o ícone certo). O fluxo e o escopo continuam iguais.

-- 1) Novo report → avisa liderança/TI (command, ti_suporte, head, ceo).
CREATE OR REPLACE FUNCTION public.carbo_bug_notify_gestores()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.notifications (user_id, type, title, body, reference_type, reference_id)
  SELECT p.id,
         'bug_report',
         CASE WHEN NEW.kind = 'sugestao' THEN '💡 Nova sugestão' ELSE '🐞 Novo bug reportado' END,
         coalesce(NEW.reporter_name, 'Alguém') || ' · ' || NEW.title,
         'carbo_bug_report',
         NEW.id::text
  FROM public.profiles p
  WHERE (p.department IN ('command', 'ti_suporte')
      OR p.secondary_department IN ('command', 'ti_suporte')
      OR p.funcao IN ('head', 'ceo', 'command')
      OR p.secondary_funcao IN ('head', 'ceo', 'command'))
    AND p.id IS DISTINCT FROM NEW.reporter_id;
  RETURN NEW;
END $$;

-- 2) Resolvido/recusado → avisa quem reportou.
CREATE OR REPLACE FUNCTION public.carbo_bug_notify_reporter()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status
     AND NEW.status IN ('resolved', 'declined')
     AND NEW.reporter_id IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, type, title, body, reference_type, reference_id)
    VALUES (
      NEW.reporter_id,
      CASE WHEN NEW.status = 'resolved' THEN 'bug_resolved' ELSE 'bug_update' END,
      CASE
        WHEN NEW.status = 'resolved' AND NEW.kind = 'sugestao' THEN '✅ Sugestão implementada'
        WHEN NEW.status = 'resolved'                           THEN '✅ Bug resolvido'
        WHEN NEW.kind = 'sugestao'                             THEN '🛈 Sugestão avaliada'
        ELSE '🛈 Report avaliado'
      END,
      NEW.title || coalesce(' — ' || NEW.admin_notes, ''),
      'carbo_bug_report',
      NEW.id::text
    );
  END IF;
  RETURN NEW;
END $$;

-- Os triggers já existem apontando pra estas funções — só a definição mudou.
