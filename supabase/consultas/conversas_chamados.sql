-- ─────────────────────────────────────────────────────────────────────────────
-- Chamados do TI (bug / sugestão) sobre CONVERSAS — SÓ LEITURA.
-- Rode no SQL Editor e cole o resultado no chat. Não altera nada.
--
-- Pega os chamados ainda NÃO encerrados (status fora de resolved/declined) que:
--   · vieram do app Atendimento, OU
--   · foram abertos com a tela de Conversas aberta (url), OU
--   · falam de conversa / WhatsApp / mensagem / atendimento no título ou texto.
-- O bloco 2 traz os ENCERRADOS dos últimos 90 dias, para ver o que já voltou.
-- ─────────────────────────────────────────────────────────────────────────────

-- BLOCO 1 — abertos
select b.id,
       to_char(b.created_at at time zone 'America/Sao_Paulo', 'DD/MM/YY HH24:MI') as aberto_em,
       b.kind, b.status, b.app,
       b.reporter_name as quem,
       b.title as titulo,
       left(regexp_replace(coalesce(b.description, ''), '\s+', ' ', 'g'), 600) as descricao,
       b.url,
       coalesce(jsonb_array_length(case when jsonb_typeof(b.attachments::jsonb) = 'array'
                                        then b.attachments::jsonb end), 0) as anexos,
       left(coalesce(b.admin_notes, ''), 300) as nota_do_ti
  from public.carbo_bug_reports b
 where coalesce(b.status, 'open') not in ('resolved', 'declined')
   and (   b.app = 'atendimento'
        or b.url ilike '%/conversas%'
        or b.url ilike '%atendimento.carbohub%'
        or concat_ws(' ', b.title, b.description) ~* '(convers|whats|mensag|atendiment|janela|resposta r[aá]pida|recado|etiqueta|assumir|respons[aá]vel)')
 order by b.created_at;

-- BLOCO 2 — encerrados nos últimos 90 dias (mesmo recorte)
select b.id,
       to_char(b.created_at at time zone 'America/Sao_Paulo', 'DD/MM/YY') as aberto_em,
       to_char(b.updated_at at time zone 'America/Sao_Paulo', 'DD/MM/YY') as mexido_em,
       b.kind, b.status, b.app, b.reporter_name as quem, b.title as titulo,
       left(regexp_replace(coalesce(b.description, ''), '\s+', ' ', 'g'), 300) as descricao
  from public.carbo_bug_reports b
 where b.status in ('resolved', 'declined')
   and b.updated_at > now() - interval '90 days'
   and (   b.app = 'atendimento'
        or b.url ilike '%/conversas%'
        or concat_ws(' ', b.title, b.description) ~* '(convers|whats|mensag|atendiment|janela)')
 order by b.updated_at desc;
