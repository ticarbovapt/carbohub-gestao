-- ═══════════════════════════════════════════════════════════════════════════
-- As respostas do cliente passam a ser GRAVADAS
--
-- ── ⚠️ Correção de uma decisão minha, e o motivo dela ter mudado ──────────
--
-- Na Fase 3 eu decidi NÃO guardar o conteúdo das mensagens recebidas. O
-- raciocínio era: elas vivem no Inbox do Gerenciador da Meta, guardar aqui
-- seria uma segunda verdade, e a tela viraria fase própria com dado real para
-- desenhar em cima.
--
-- O raciocínio estava certo e a premissa, errada. A Caixa de Entrada do Meta
-- Business Suite só aceita número do APLICATIVO WhatsApp Business — o
-- +55 84 8876-9187 da CarboZé está na Cloud API, e número da Cloud API é
-- propriedade do app e do webhook. Ele não aparece naquela tela, e não existe
-- endpoint de histórico na Cloud API.
--
-- Ou seja: mensagem que chega e não é gravada aqui não fica "para ver depois".
-- Ela existe só no celular do cliente.
--
-- E isso importa AGORA porque três dos seis templates que acabaram de ser
-- ligados pedem resposta em texto — "Qualquer dúvida, é só responder esta
-- mensagem", "responda aqui que a gente resolve", "Deu tudo certo com a
-- entrega?". Convidar o cliente a responder para o vazio é pior do que não
-- convidar.
--
-- ── O que esta migração faz, e o que ela NÃO faz ──────────────────────────
--
-- Faz: para a perda. A partir daqui toda mensagem recebida fica gravada, com
-- o vínculo para o pedido de que ela trata.
--
-- Não faz: tela. Ela vem em seguida, e o dado acumulado nestes dias é o que
-- diz o que a tela precisa mostrar — o que os clientes de fato perguntam, não
-- o que a gente imagina que perguntam.
--
-- ⚠️ RODE EM BLOCOS.
-- ═══════════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — quem é do time interno                                      ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
--
-- ⚠️ Conversa de cliente NÃO pode ser legível por `authenticated` puro. O
-- portal de lojas e o de licenciados usam a MESMA tabela `profiles`, e uma
-- policy `using (true)` entregaria o atendimento inteiro da Carbo ao lojista
-- pelo PostgREST. É a mesma armadilha do sininho de venda online e a mesma que
-- a `bling2_esteira` levou ontem ao perder o `security_invoker`.
--
-- A lista sai do `notify_time_interno`, que já a mantinha embutida. Agora ela
-- tem um nome e um lugar só — duas listas divergem, e divergir aqui abre acesso
-- em vez de fechar.

create or replace function public.carbo_e_time_interno()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.allowed_interfaces is not null
      and exists (
        select 1 from unnest(p.allowed_interfaces) x
        where lower(x) in ('carbo_admin','carbo_crm','carbo_ops','carbo_ops_app',
                           'carbo_financas','carbo_mkt','carbo_ti')
      )
  );
$$;

comment on function public.carbo_e_time_interno is
  'Quem tem ALGUMA interface interna liberada. Mesma lista do notify_time_interno, agora num lugar só. Serve de guarda para dado que o portal de lojas e o de licenciados não podem ver — eles compartilham a tabela profiles.';

grant execute on function public.carbo_e_time_interno() to authenticated;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — a conversa                                                  ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

create table if not exists public.carbo_wa_mensagens (
  -- O id da Meta é a chave: ela não reaproveita, e é ele que chega no webhook.
  wamid       text primary key,
  wa_id       text not null,
  direcao     text not null check (direcao in ('entrada','saida')),
  -- text, button, image, audio, document, video, sticker, location, unknown…
  tipo        text not null,
  -- O corpo, ou o rótulo do botão que a pessoa tocou.
  texto       text,
  -- ⚠️ Mídia NÃO é baixada aqui. O que a Meta manda é um id, e o arquivo tem
  -- validade — baixar é outra decisão (storage, custo, LGPD) e não pode
  -- atrasar a captura do texto, que é o que se perde para sempre.
  midia_id    text,
  midia_mime  text,
  -- ⚠️ O vínculo que faz a tela valer alguma coisa: `context.id` é o wamid da
  -- NOSSA mensagem que a pessoa respondeu. Com ele, "chegou quebrado" deixa de
  -- ser um recado solto e vira um recado sobre o pedido CZ2026080319.
  responde_a  text,
  ocorrido_em timestamptz not null,
  recebido_em timestamptz not null default now(),
  -- O payload cru, para quando o parsing tiver deixado algo de fora. Tipo novo
  -- de mensagem não pode virar linha vazia sem recurso.
  payload     jsonb
);

create index if not exists carbo_wa_mensagens_conversa_idx
  on public.carbo_wa_mensagens (wa_id, ocorrido_em desc);
create index if not exists carbo_wa_mensagens_responde_idx
  on public.carbo_wa_mensagens (responde_a) where responde_a is not null;

comment on table public.carbo_wa_mensagens is
  'As conversas do número oficial. ⚠️ Número da Cloud API não aparece na Caixa de Entrada do Business Suite e a Cloud API não tem endpoint de histórico: o que não for gravado aqui existe só no celular do cliente. `responde_a` liga a resposta à mensagem nossa que a gerou, e por ela ao pedido.';

alter table public.carbo_wa_mensagens enable row level security;
drop policy if exists carbo_wa_mensagens_leitura on public.carbo_wa_mensagens;
drop policy if exists carbo_wa_mensagens_service on public.carbo_wa_mensagens;
create policy carbo_wa_mensagens_leitura on public.carbo_wa_mensagens
  for select to authenticated using (public.carbo_e_time_interno());
create policy carbo_wa_mensagens_service on public.carbo_wa_mensagens
  for all to service_role using (true) with check (true);

grant select on public.carbo_wa_mensagens to authenticated;

-- ⚠️ E a `carbo_wa_contatos` tinha `using (true)`. Ela guarda nome e número de
-- cliente — mesmo problema, corrigido junto.
drop policy if exists carbo_wa_contatos_leitura on public.carbo_wa_contatos;
create policy carbo_wa_contatos_leitura on public.carbo_wa_contatos
  for select to authenticated using (public.carbo_e_time_interno());


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 3 — a conversa, já ligada ao pedido                             ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
--
-- Uma linha por mensagem, com quem é a pessoa e de que pedido ela fala. É a
-- consulta que serve HOJE, por SQL, enquanto a tela não existe — e é ela que a
-- tela vai ler quando existir.

create or replace view public.carbo_wa_conversas
with (security_invoker = true) as
select
  m.wamid,
  m.wa_id,
  c.nome                            as cliente,
  m.direcao,
  m.tipo,
  m.texto,
  m.midia_id,
  m.ocorrido_em,
  -- ⚠️ De qual pedido a pessoa está falando. Vem por dois caminhos, nesta
  -- ordem: o `context.id` da resposta (exato) e, na falta dele, o último aviso
  -- que mandamos para aquele número (aproximado, mas quase sempre certo — a
  -- pessoa responde ao que acabou de receber).
  coalesce(e.bling_id, u.bling_id)  as bling_id,
  coalesce(e.etapa,    u.etapa)     as sobre_a_etapa,
  (e.bling_id is not null)          as vinculo_exato
from public.carbo_wa_mensagens m
left join public.carbo_wa_contatos c on c.wa_id = m.wa_id
left join lateral (
  select v.bling_id, v.etapa
  from public.carbo_msg_envios v
  where v.wamid = m.responde_a
  limit 1
) e on true
left join lateral (
  select v.bling_id, v.etapa
  from public.carbo_msg_envios v
  where v.canal = 'meta' and v.wa_id = m.wa_id
    and v.enviado_em is not null and v.enviado_em <= m.ocorrido_em
  order by v.enviado_em desc
  limit 1
) u on true;

comment on view public.carbo_wa_conversas is
  'As mensagens com o pedido de que tratam. O vínculo exato vem do context.id da resposta; na falta dele, do último aviso enviado àquele número antes da mensagem. `vinculo_exato` diz qual dos dois foi — aproximação não pode se passar por certeza.';

grant select on public.carbo_wa_conversas to authenticated;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 4 — o que olhar enquanto a tela não existe                      ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- (a) A caixa de entrada, em SQL. É esta consulta que vale rodar todo dia até
--     a tela existir — e o que ela mostrar é o que a tela precisa fazer.
select ocorrido_em, cliente, wa_id, texto, sobre_a_etapa, vinculo_exato
from public.carbo_wa_conversas
where direcao = 'entrada'
order by ocorrido_em desc
limit 50;

-- (b) ⚠️ Quem está esperando resposta: falou e a janela de 24h ainda está
--     aberta. Passada a janela, só template resolve — e nenhum dos seis serve
--     para responder dúvida.
select c.wa_id, c.nome, c.last_inbound_at,
       c.last_inbound_at + interval '24 hours' as janela_ate
from public.carbo_wa_contatos c
where c.last_inbound_at > now() - interval '24 hours'
order by c.last_inbound_at desc;

-- (c) A prova da guarda: só time interno lê. Rodando pelo SQL Editor isto vem
--     `false` (não há auth.uid()), e é o esperado — o teste de verdade é abrir
--     a tela com um usuário do portal de lojas e não ver nada.
select public.carbo_e_time_interno() as sou_time_interno;
