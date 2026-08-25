-- ═══════════════════════════════════════════════════════════════════════════
-- Quem mandou a mensagem — autoria de primeira classe, não enterrada no JSON
--
-- A autoria JÁ EXISTIA, e é isso que torna esta migração barata: o
-- `whatsapp-responder` e o `whatsapp-midia` gravam `payload->>'por'` com o nome
-- de quem enviou desde que foram escritos.
--
-- O problema é que ela mora dentro de um JSONB. Consequências práticas:
--
--   · a tela não mostra — e não mostrar é o mesmo que não ter, para quem
--     precisa saber quem falou com o cliente;
--   · não dá para filtrar nem contar sem `payload->>` espalhado por consulta,
--     e cada lugar que escrever isso vai escrever de um jeito;
--   · guarda o NOME, não o id. Nome muda (casamento, correção de digitação) e
--     o histórico passa a apontar para alguém que não existe mais com aquele
--     nome — é a mesma razão pela qual o `code` da caixa do vendedor deriva do
--     id e não do nome.
--
-- ⚠️ E o AGENDAMENTO não gravava autor nenhum: o `whatsapp-agendadas` põe só
-- `agendada_id` no payload. O autor existe em `carbo_wa_agendadas.criado_por` e
-- nunca chegava à mensagem. Quem agendou às 18h de sexta e a mensagem saiu
-- sábado de manhã era, para a tela, ninguém.
--
-- ── O que esta migração NÃO faz ───────────────────────────────────────────
--
-- Não muda NADA do que o cliente recebe. As colunas são internas; a Meta não
-- vê, o WhatsApp do cliente não vê, e nenhum caminho de envio lê daqui. É a
-- mesma garantia do recado interno (`carbo_wa_notas`): o que protege não é a
-- cor na tela, é não existir SELECT de envio que passe por aqui.
-- ═══════════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — as colunas                                                  ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
--
-- ⚠️ DUAS colunas, e as duas são necessárias:
--
--   `enviado_por`      o id — é a chave estável, sobrevive a troca de nome e
--                      permite juntar com profiles para filtrar por pessoa;
--   `enviado_por_nome` o nome CONGELADO no momento do envio.
--
-- O nome congelado não é redundância. Mesma decisão do `responsavel_nome` no
-- atendimento e do recado interno: quem atendeu continua sendo quem atendeu
-- depois de sair da empresa ou de ter o perfil desativado. Sem ele, o histórico
-- de meses atrás vira "—" no dia em que alguém for excluído.

alter table public.carbo_wa_mensagens
  add column if not exists enviado_por      uuid references public.profiles(id) on delete set null,
  add column if not exists enviado_por_nome text;

comment on column public.carbo_wa_mensagens.enviado_por is
  'Quem clicou em enviar. NULO em mensagem de ENTRADA (é o cliente) e nos avisos automáticos da esteira (é o sistema) — nulo aqui é informação, não falta de dado.';
comment on column public.carbo_wa_mensagens.enviado_por_nome is
  'Nome de quem enviou, CONGELADO no momento do envio. Existe junto com o id porque nome muda e perfil é excluído — sem ele o histórico antigo vira "—".';

-- Para "o que o Fulano mandou esta semana", que é a pergunta que motivou tudo.
create index if not exists carbo_wa_mensagens_autor_idx
  on public.carbo_wa_mensagens (enviado_por, ocorrido_em desc)
  where enviado_por is not null;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — trazer para a coluna o que já estava no JSON                ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
--
-- ⚠️ Só o NOME dá para recuperar: o payload nunca guardou o id. Casar por nome
-- contra `profiles` para descobrir o id seria adivinhação — dois "Ana" no
-- cadastro e o histórico passaria a atribuir mensagem à pessoa errada, com
-- cara de registro. Melhor nome sem id do que id errado.

update public.carbo_wa_mensagens
set enviado_por_nome = payload->>'por'
where direcao = 'saida'
  and enviado_por_nome is null
  and coalesce(payload->>'por', '') <> '';

-- O agendamento tem o autor na tabela dele, e ali o id EXISTE.
update public.carbo_wa_mensagens m
set enviado_por      = a.criado_por,
    enviado_por_nome = coalesce(m.enviado_por_nome, p.full_name)
from public.carbo_wa_agendadas a
left join public.profiles p on p.id = a.criado_por
where (m.payload->>'agendada_id')::uuid = a.id
  and m.direcao = 'saida'
  and m.enviado_por is null
  and a.criado_por is not null;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 3 — a fila do disparo passa a levar o autor junto              ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
--
-- ⚠️ SEM ESTE BLOCO o BLOCO 2 conserta o passado e o futuro continua quebrado.
-- O `whatsapp-agendadas` lê de `carbo_wa_agendadas_fila`, não da tabela — e a
-- view não expõe `criado_por`. A função pode gravar a coluna nova o quanto
-- quiser: o valor chega nulo porque a fila nunca o entregou.
--
-- ⚠️ As colunas novas vão no FIM e as antigas ficam na ordem exata em que
-- estavam. `CREATE OR REPLACE VIEW` só sabe ACRESCENTAR — reordenar devolve
-- 42P16 e a migração para no meio. E a cláusula `security_invoker` é REPETIDA:
-- republicar sem ela APAGA as reloptions.

create or replace view public.carbo_wa_agendadas_fila
with (security_invoker = true) as
select
  a.id, a.wa_id, a.texto, a.enviar_em,
  c.last_inbound_at,
  c.last_inbound_at + interval '24 hours' as janela_ate,
  (c.last_inbound_at > now() - interval '24 hours') as janela_aberta,
  -- ── acrescentadas aqui, no fim ──────────────────────────────────────────
  a.criado_por,
  p.full_name as criado_por_nome
from public.carbo_wa_agendadas a
left join public.carbo_wa_contatos c on c.wa_id = a.wa_id
left join public.profiles p          on p.id    = a.criado_por
where a.status = 'pendente'
  and a.enviar_em <= now();

comment on view public.carbo_wa_agendadas_fila is
  'O que já passou da hora e ainda não saiu, com o estado da janela no INSTANTE da leitura e QUEM agendou. A função de envio decide olhando isto — a validação da tela é a primeira barreira, esta é a que vale. ⚠️ security_invoker = true — repita a cláusula em toda republicação.';

grant select on public.carbo_wa_agendadas_fila to authenticated;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 4 — a conversa mostra o autor                                   ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
--
-- ⚠️ A tela lê da view `carbo_wa_conversas`, não da tabela. Sem este bloco a
-- coluna existe, é preenchida, e não chega ao navegador — o mesmo buraco que
-- fez o endereço do PDV ficar invisível depois de importado: trazer o dado não
-- o coloca na tela.
--
-- A view é uma UNION de duas fontes, e as duas precisam responder:
--   · `carbo_wa_mensagens` → a coluna nova;
--   · `carbo_msg_envios`   → NULO, e nulo aqui é a resposta certa. Aviso da
--     esteira não tem autor: quem mandou foi o sistema, e inventar um nome ali
--     faria parecer que alguém digitou aquilo.
--
-- ⚠️ Coluna nova no FIM, ordem das antigas intacta, e `security_invoker`
-- repetido — as três regras de republicar view neste banco.

create or replace view public.carbo_wa_conversas
with (security_invoker = true) as
with tudo as (
  select
    m.wamid, m.wa_id, m.direcao, m.tipo, m.texto, m.midia_id,
    m.ocorrido_em, m.responde_a,
    null::bigint as envio_bling_id,
    null::text   as envio_etapa,
    null::text   as botao,
    m.status       as msg_status,
    m.erro_codigo  as msg_erro_codigo,
    m.erro_detalhe as msg_erro_detalhe,
    m.enviado_por_nome as msg_autor
  from public.carbo_wa_mensagens m

  union all

  select
    v.wamid, v.wa_id, 'saida', 'template',
    coalesce(
      nullif(public.carbo_wa_texto_do_template(t.texto, v.payload), ''),
      t.titulo, v.etapa),
    null::text,
    v.enviado_em, null::text,
    v.bling_id, v.etapa,
    public.carbo_wa_botao_do_template(v.payload),
    v.status, v.erro_codigo, v.erro_detalhe,
    null::text                                   -- aviso automático não tem autor
  from public.carbo_msg_envios v
  left join public.carbo_msg_templates t on t.etapa = v.etapa
  where v.canal = 'meta'
    and v.wamid is not null
    and v.wa_id is not null
    and v.enviado_em is not null
    and v.status in ('enviado','entregue','lido')
),
resolvido as (
  select
    x.wamid,
    x.wa_id,
    c.nome                                     as nome_whatsapp,
    x.direcao,
    x.tipo,
    x.texto,
    x.midia_id,
    x.ocorrido_em,
    coalesce(x.envio_bling_id, e.bling_id, u.bling_id) as bling_id,
    coalesce(x.envio_etapa,    e.etapa,    u.etapa)    as sobre_a_etapa,
    (x.envio_bling_id is not null or e.bling_id is not null) as vinculo_exato,
    x.botao,
    x.msg_status, x.msg_erro_codigo, x.msg_erro_detalhe,
    x.msg_autor
  from tudo x
  left join public.carbo_wa_contatos c on c.wa_id = x.wa_id
  left join lateral (
    select v.bling_id, v.etapa
    from public.carbo_msg_envios v
    where v.wamid = x.responde_a
    limit 1
  ) e on true
  left join lateral (
    select v.bling_id, v.etapa
    from public.carbo_msg_envios v
    where v.canal = 'meta' and v.wa_id = x.wa_id
      and v.enviado_em is not null and v.enviado_em <= x.ocorrido_em
    order by v.enviado_em desc
    limit 1
  ) u on true
)
select
  r.wamid,
  r.wa_id,
  r.nome_whatsapp                            as cliente,
  r.direcao,
  r.tipo,
  r.texto,
  r.midia_id,
  r.ocorrido_em,
  r.bling_id,
  r.sobre_a_etapa,
  r.vinculo_exato,
  r.botao                                    as botao_rastreio,
  b.cliente                                  as cliente_pedido,
  r.nome_whatsapp,
  r.msg_status                               as status,
  r.msg_erro_codigo                          as erro_codigo,
  r.msg_erro_detalhe                         as erro_detalhe,
  -- ── acrescentada aqui, no fim ───────────────────────────────────────────
  r.msg_autor                                as enviado_por_nome
from resolvido r
left join public.bling2_esteira b on b.bling_id = r.bling_id;

comment on view public.carbo_wa_conversas is
  'A conversa completa: avisos da esteira e mensagens do webhook na mesma linha do tempo, com o pedido de que tratam e QUEM enviou. ⚠️ `enviado_por_nome` nulo em aviso automático da esteira é a resposta certa — quem mandou foi o sistema. ⚠️ security_invoker = true — repita a cláusula em toda republicação.';

grant select on public.carbo_wa_conversas to authenticated;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 5 — conferência                                                 ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- (0) ⚠️ A view manteve o security_invoker e ganhou as duas colunas no fim.
select relname, reloptions from pg_class where relname = 'carbo_wa_agendadas_fila';
select ordinal_position, column_name from information_schema.columns
where table_schema = 'public' and table_name = 'carbo_wa_agendadas_fila'
order by ordinal_position;

-- (a) O retrato: quanto do histórico ganhou autor, e quanto ficou sem.
--     ⚠️ "sem autor" NÃO é tudo defeito: aviso automático da esteira não tem
--     autor por definição, e é a maioria das saídas.
select
  count(*) filter (where direcao = 'saida')                              as saidas,
  count(*) filter (where direcao = 'saida' and enviado_por_nome is not null) as com_nome,
  count(*) filter (where direcao = 'saida' and enviado_por is not null)      as com_id,
  count(*) filter (where direcao = 'saida' and tipo = 'template')            as automaticas_da_esteira
from public.carbo_wa_mensagens;

-- (b) Quem falou com cliente, e quantas vezes. É a resposta da pergunta.
select coalesce(enviado_por_nome, '— sem autor registrado —') as quem,
       count(*) as mensagens,
       min(ocorrido_em)::date as primeira,
       max(ocorrido_em)::date as ultima
from public.carbo_wa_mensagens
where direcao = 'saida'
group by 1 order by mensagens desc;

-- (c) ⚠️ As que continuam sem autor e NÃO são template. Depois do deploy das
--     três funções esta contagem para de crescer; o que estiver aqui é
--     histórico anterior, e não há de onde recuperar.
select tipo, count(*) as sem_autor, max(ocorrido_em)::date as mais_recente
from public.carbo_wa_mensagens
where direcao = 'saida' and enviado_por_nome is null and tipo <> 'template'
group by 1 order by 2 desc;
