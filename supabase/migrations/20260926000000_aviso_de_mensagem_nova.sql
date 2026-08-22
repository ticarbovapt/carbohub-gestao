-- ═══════════════════════════════════════════════════════════════════════════
-- Mensagem nova do cliente AVISA, e a conversa anda ao vivo
--
-- ── Por que isto é urgente, e não conforto ───────────────────────────────
--
-- O cliente responde e ninguém é avisado: só quem abrir a tela vê. Com a
-- janela de 24 h correndo, uma pergunta que passa a noite sem ser vista deixa
-- de ter resposta possível pela Cloud API — não é atraso, é perda.
--
-- E três dos seis templates PEDEM resposta em texto. A operação convida o
-- cliente a escrever; o mínimo é alguém saber que ele escreveu.
--
-- ── Quem decide que houve mensagem nova é o BANCO ─────────────────────────
--
-- Um gatilho, não a edge function. Mesma razão do `trg_ecommerce_sale_notify`:
-- se a decisão morasse no `whatsapp-meta-webhook`, todo caminho novo que
-- gravasse mensagem precisaria lembrar de avisar — e o que se esquece de
-- copiar é o que quebra em silêncio. Aqui basta a linha existir.
--
-- ⚠️ RODE EM BLOCOS.
-- ═══════════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — o aviso                                                     ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

create or replace function public.carbo_wa_notifica_inbound()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_nome   text;
  v_previa text;
begin
  -- Só mensagem DO CLIENTE. O que o atendimento manda não avisa o atendimento.
  if new.direcao <> 'entrada' then return new; end if;

  -- ⚠️ Rajada vira UM aviso, não cinco.
  --
  -- Quem escreve pelo WhatsApp costuma mandar três mensagens curtas em vez de
  -- uma longa. Um aviso por linha treinaria a equipe a ignorar o sininho — que
  -- é o oposto do que ele existe para fazer, e o mesmo raciocínio de não pintar
  -- de vermelho a janela já fechada.
  --
  -- Dez minutos, e a janela é contada a partir da mensagem NOVA: isso suprime a
  -- rajada sem nunca silenciar uma conversa que recomeça horas depois.
  if exists (
    select 1 from public.carbo_wa_mensagens m
    where m.wa_id = new.wa_id
      and m.direcao = 'entrada'
      and m.wamid <> new.wamid
      and m.ocorrido_em > new.ocorrido_em - interval '10 minutes'
  ) then
    return new;
  end if;

  select coalesce(nullif(trim(c.nome), ''), new.wa_id) into v_nome
  from public.carbo_wa_contatos c where c.wa_id = new.wa_id;
  v_nome := coalesce(v_nome, new.wa_id);

  -- A prévia é o texto, cortado. Mídia não tem texto e não pode virar aviso
  -- vazio: quem lê o sininho precisa saber se vale abrir agora.
  v_previa := coalesce(
    nullif(left(regexp_replace(coalesce(new.texto, ''), '\s+', ' ', 'g'), 120), ''),
    case when new.midia_id is not null then 'enviou um arquivo (' || new.tipo || ')'
         else 'enviou uma mensagem' end);

  -- ⚠️ `notify_time_interno`, nunca um insert direto em `notifications`: é ele
  -- que exclui o portal de lojas e o de licenciados, que usam a MESMA tabela
  -- `profiles`. Sem esse filtro o lojista receberia no sininho a conversa dos
  -- clientes da Carbo.
  perform public.notify_time_interno(
    'wa_inbound',
    '💬 ' || v_nome || ' respondeu',
    v_previa,
    'wa_conversa',
    -- ⚠️ NULL de propósito: `reference_id` é uuid e a conversa é identificada
    -- por `wa_id`, que é texto. Forçar um uuid aqui seria inventar uma chave
    -- que não aponta para nada. O sininho leva à tela; a conversa se acha pelo
    -- nome, que está no título.
    null,
    null
  );

  return new;
end $$;

comment on function public.carbo_wa_notifica_inbound is
  'Avisa o time interno quando o cliente responde no WhatsApp oficial. Rajada de mensagens seguidas gera UM aviso (janela de 10 min) — um por linha treinaria a equipe a ignorar o sininho. Usa notify_time_interno para excluir portal de lojas e licenciados.';

drop trigger if exists trg_carbo_wa_notifica_inbound on public.carbo_wa_mensagens;
create trigger trg_carbo_wa_notifica_inbound
  after insert on public.carbo_wa_mensagens
  for each row execute function public.carbo_wa_notifica_inbound();


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — a conversa ao vivo                                          ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
--
-- Sem isto a tela só descobre a mensagem na próxima rodada do `refetchInterval`
-- — até 30 s depois. Para um painel de acompanhamento seria irrelevante; para
-- alguém conversando, 30 s é a diferença entre uma conversa e um formulário.
--
-- ⚠️ `carbo_msg_envios` entra junto: o aviso da esteira aparece na mesma linha
-- do tempo, e ele é escrito por OUTRA função (`whatsapp-meta`). Sem a segunda
-- tabela na publicação, o balão do "saiu para entrega" só surgiria no próximo
-- refetch — e quem estivesse conversando responderia sem saber que o sistema
-- acabou de avisar a mesma coisa.

do $$
begin
  alter publication supabase_realtime add table public.carbo_wa_mensagens;
exception
  -- Já estar na publicação não é erro; é a migração rodando duas vezes.
  when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.carbo_msg_envios;
exception when duplicate_object then null;
end $$;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 3 — conferência                                                 ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- (a) As duas tabelas estão publicando? Tem de vir as duas.
select tablename from pg_publication_tables
where pubname = 'supabase_realtime'
  and tablename in ('carbo_wa_mensagens','carbo_msg_envios','notifications')
order by 1;

-- (b) O gatilho está no lugar?
select tgname, tgenabled from pg_trigger
where tgrelid = 'public.carbo_wa_mensagens'::regclass and not tgisinternal;

-- (c) ⚠️ ENSAIO DO AVISO, sem mexer em nada.
--     Quantas pessoas receberiam o sininho, e quem NÃO receberia. O segundo
--     número tem de ser exatamente o portal de lojas e o de licenciados — se
--     alguém do time interno cair ali, a lista de interfaces do
--     `notify_time_interno` está desatualizada e a pessoa some do aviso sem
--     erro nenhum.
select
  count(*) filter (where tem_interna)      as receberiam,
  count(*) filter (where not tem_interna)  as fora_do_aviso
from (
  select exists (
    select 1 from unnest(coalesce(p.allowed_interfaces, '{}')) x
    where lower(x) in ('carbo_admin','carbo_crm','carbo_ops','carbo_ops_app',
                       'carbo_financas','carbo_mkt','carbo_ti')
  ) as tem_interna
  from public.profiles p
) t;
