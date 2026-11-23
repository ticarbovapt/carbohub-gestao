-- ─────────────────────────────────────────────────────────────────────────────
-- Chamados do Atendimento (Lorran Barba) feitos nas fases de Conversas
-- (23/11/2026): marca como RESOLVIDOS, com o Lucas Padilha como responsável.
-- Rode UM bloco por vez no SQL Editor; o resultado de cada um é a ÚLTIMA
-- consulta dele.
-- ─────────────────────────────────────────────────────────────────────────────

-- BLOCO 1 — Quem é o Lucas Padilha (tem de voltar UMA linha)
select id, full_name, department::text, funcao
  from public.profiles
 where full_name ilike 'lucas padilha%';

-- BLOCO 2 — Demandas do app Atendimento ainda abertas (só leitura)
select id, title, reporter_name, status, assignee_name, kind,
       created_at::date as aberta_em
  from public.carbo_bug_reports
 where app = 'atendimento'
   and status not in ('resolved', 'declined')
   and archived_at is null
 order by created_at;

-- BLOCO 3 — Marca os CINCO feitos como resolvidos, no nome do Lucas.
-- Aborta sem mudar nada se o Lucas não for UMA pessoa ou se não achar
-- exatamente os cinco chamados. A "Tela para solicitação de autorizações
-- internas" NÃO está aqui: não foi feita.
-- O histórico da demanda (quem mudou o status) sai no nome do Lucas.
do $$
declare
  v_lucas uuid;
  v_nome text;
  v_n int;
  v_qtd int;
begin
  select count(*), min(id::text)::uuid, min(full_name)
    into v_n, v_lucas, v_nome
    from public.profiles where full_name ilike 'lucas padilha%';
  if v_n <> 1 then
    raise exception 'ABORTADO: achei % perfis "Lucas Padilha%%" (precisa ser 1)', v_n;
  end if;

  create temp table _feitos (titulo text primary key, nota text) on commit drop;
  insert into _feitos values
    ('problema de histórico em conversa',
     'Corrigido: a conversa aberta não troca nem some ao enviar mensagem, e o histórico (áudio, foto e PDF inclusive) fica guardado no nosso servidor — não vence mais na Meta.'),
    ('abrir conversa em outra guia',
     'Feito: no Painel do atendimento, "Abrir conversa" abre numa nova guia.'),
    ('compartilhar imagem no recados interno das conversas.',
     'Feito: o recado interno aceita imagens e PDF — botão de clipe ou Ctrl+V com a aba Recado interno aberta. Funciona com a janela fechada.'),
    ('não consigo compartilhar imagem nas conversas',
     'Corrigido: PNG e JPG passam; webp, gif e foto acima de 5 MB viram JPEG antes de enviar.'),
    ('mensagens não carregam',
     'Corrigido: a lista e a conversa carregam muito mais rápido, e se a leitura falhar a tela mostra o erro em vez de esvaziar o histórico.');

  select count(*) into v_qtd
    from public.carbo_bug_reports b
    join _feitos f on f.titulo = lower(btrim(b.title))
   where b.app = 'atendimento' and b.reporter_name ilike 'lorran%'
     and b.archived_at is null;
  if v_qtd <> 5 then
    raise exception 'ABORTADO: achei % dos 5 chamados (compare os títulos com o BLOCO 2)', v_qtd;
  end if;

  -- O gatilho do histórico grava `auth.uid()`: assim a troca sai no nome dele.
  perform set_config('request.jwt.claims',
                     json_build_object('sub', v_lucas::text, 'role', 'authenticated')::text, true);

  update public.carbo_bug_reports b
     set status = 'resolved',
         assignee_id = v_lucas,
         assignee_name = v_nome,
         admin_notes = f.nota,
         updated_at = now()
    from _feitos f
   where f.titulo = lower(btrim(b.title))
     and b.app = 'atendimento' and b.reporter_name ilike 'lorran%'
     and b.archived_at is null;
end $$;

select title, status, assignee_name, admin_notes
  from public.carbo_bug_reports
 where app = 'atendimento' and reporter_name ilike 'lorran%'
 order by created_at;
