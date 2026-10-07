-- ═══════════════════════════════════════════════════════════════════════════
-- Recuperação de carrinho: o cliente RESPONDEU → a sequência PARA
--
-- Pedido do dono do processo em 07/10/2026. Até aqui a 2ª e a 3ª mensagem
-- saíam só pelo RELÓGIO: quem respondesse "não quero" à 1ª recebia a 2ª 23 h
-- depois e a 3ª 48 h depois dela. É quem aperta "denunciar", e a denúncia
-- derruba a qualidade do número na Meta.
--
-- ── As três decisões ─────────────────────────────────────────────────────
--
-- 1. ⚠️ QUALQUER resposta para. Não se tenta ler "sim" ou "não": a leitura
--    automática erra ("não, já comprei", "agora não, semana que vem"), e um
--    erro é uma mensagem a mais para quem disse não. Respondeu → uma PESSOA
--    assume em Conversas. Na dúvida, para.
--
-- 2. ⚠️ A pessoa é casada por IDENTIDADE, nunca por semelhança: o `wa_id` que
--    a META devolveu no envio (`carbo_msg_envios.wa_id`) + o MESMO número nosso
--    (`numero_id`) + resposta DEPOIS do primeiro envio. Telefone "parecido"
--    erra pelo 9º dígito — e casar errado aqui é parar a sequência de outra
--    pessoa, ou não parar a de quem pediu.
--
-- 3. ⚠️ O FREIO é o que a fila JÁ respeita, e por isso nenhuma view muda: a
--    `carbo_msg_fila` não entrega etapa que já tenha linha em
--    `carbo_msg_envios` com status ≠ 'pendente'. Gravar 'ignorado' nas etapas
--    que faltam é exatamente o freio que o marco zero e o "sem telefone" já
--    usam. Republicar a `carbo_carrinho_pipeline` ou a `carbo_msg_fila` — as
--    duas alimentam o WhatsApp — para isso seria mexer no gatilho sem
--    necessidade.
--    ⚠️ Consequência ACEITA: a view passa a ver `msg2_em`/`msg3_em` preenchidos
--    (é o `detectado_em` do 'ignorado') e o card "andaria" de coluna. Quem diz
--    onde ele aparece é a TELA, lendo `carbo_carrinho_respostas` — a mesma
--    técnica das colunas "Sem telefone" e "Erro ao enviar".
--
-- Por que CRON e não gatilho em `carbo_wa_mensagens`: o gatilho rodaria dentro
-- da gravação do webhook, e qualquer erro dele abortaria a gravação da
-- mensagem do cliente — que existe só no celular dele. O cron de 1 min fica
-- fora desse caminho, e a 2ª mensagem só vence 23 h depois da 1ª.
--
-- `recuperado` continua mandando: comprar sempre vence. A tela trata.
--
-- ⚠️ RODE EM BLOCOS, na ordem.
-- ═══════════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 0 — MEDIR. Uma consulta de cada vez.                            ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- (a) Envios de carrinho que já existem, e quantos guardaram o `wa_id`.
--     ESPERADO: zero linhas ou poucas — a recuperação de carrinho está
--     DESLIGADA. Se houver envio SEM `wa_id`, ele não consegue ser casado com
--     resposta nenhuma (é o caso do canal antigo, Evolution).
-- select etapa, status, count(*) as envios, count(wa_id) as com_wa_id
--   from public.carbo_msg_envios
--  where etapa in ('carrinho_1','carrinho_2','carrinho_3')
--  group by 1, 2 order by 1, 2;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — a tabela das respostas                                      ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- Uma linha por carrinho, para sempre: a PRIMEIRA resposta é a que importa
-- (é ela que parou a sequência). Fato, não estado — nada aqui é apagado.
create table if not exists public.carbo_carrinho_respostas (
  checkout_id    bigint primary key,
  wa_id          text not null,
  numero_id      text,
  wamid_resposta text not null,
  respondeu_em   timestamptz not null,
  detectado_em   timestamptz not null default now()
);

comment on table public.carbo_carrinho_respostas is
  'Carrinho cujo cliente RESPONDEU no WhatsApp. Casado por identidade (wa_id devolvido pela Meta no envio + mesmo numero_id + resposta depois do primeiro envio). Preenchida so por carbo_carrinho_marcar_respostas() (cron 1 min). E o que a Esteira le para a coluna "Respondeu"; quem PARA o envio sao as linhas ignorado em carbo_msg_envios.';

alter table public.carbo_carrinho_respostas enable row level security;

-- ⚠️ SELECT só para o time interno, e NENHUMA policy de escrita: o portal de
-- lojas e o de licenciados usam a MESMA `profiles`, e quem grava é a função,
-- que roda como dono.
drop policy if exists carbo_carrinho_respostas_le on public.carbo_carrinho_respostas;
create policy carbo_carrinho_respostas_le on public.carbo_carrinho_respostas
  for select to authenticated using (public.carbo_e_time_interno());

grant select on public.carbo_carrinho_respostas to authenticated;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — a função que detecta a resposta e PARA a sequência           ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
create or replace function public.carbo_carrinho_marcar_respostas()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_novas integer;
begin
  -- 1) Quem respondeu, e ainda não foi registrado.
  with envios as (
    select v.bling_id as checkout_id, v.wa_id, v.numero_id,
           min(coalesce(v.enviado_em, v.detectado_em)) as primeiro_envio
      from public.carbo_msg_envios v
     where v.etapa in ('carrinho_1','carrinho_2','carrinho_3')
       and v.status in ('enviado','entregue','lido')   -- só o que SAIU
       and v.wa_id is not null
       and v.numero_id is not null
     group by 1, 2, 3
  ),
  resp as (
    select distinct on (e.checkout_id)
           e.checkout_id, m.wa_id, m.numero_id, m.wamid, m.ocorrido_em
      from envios e
      join public.carbo_wa_mensagens m
        on m.wa_id = e.wa_id
       and m.numero_id = e.numero_id
       and m.direcao = 'entrada'
       and m.ocorrido_em > e.primeiro_envio
     where not exists (select 1 from public.carbo_carrinho_respostas r
                        where r.checkout_id = e.checkout_id)
     order by e.checkout_id, m.ocorrido_em
  )
  insert into public.carbo_carrinho_respostas
         (checkout_id, wa_id, numero_id, wamid_resposta, respondeu_em)
  select checkout_id, wa_id, numero_id, wamid, ocorrido_em from resp
  on conflict (checkout_id) do nothing;

  get diagnostics v_novas = row_count;

  -- 2) O FREIO: as etapas que ainda não saíram viram 'ignorado'. A fila não
  --    entrega etapa com linha ≠ 'pendente'. ⚠️ `on conflict do nothing`:
  --    etapa que já tem linha (enviada, com erro, em voo) não é tocada.
  insert into public.carbo_msg_envios (bling_id, etapa, status, motivo, detectado_em)
  select r.checkout_id, et.etapa, 'ignorado',
         'respondeu: o cliente respondeu em '
           || to_char(r.respondeu_em at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI')
           || ' — a sequência parou e uma pessoa assume na conversa',
         now()
    from public.carbo_carrinho_respostas r
   cross join (values ('carrinho_2'), ('carrinho_3')) as et(etapa)
   where not exists (select 1 from public.carbo_msg_envios v
                      where v.bling_id = r.checkout_id and v.etapa = et.etapa)
  on conflict (bling_id, etapa) do nothing;

  return v_novas;
end;
$$;

comment on function public.carbo_carrinho_marcar_respostas() is
  'Cron 1 min. Registra em carbo_carrinho_respostas quem respondeu a uma mensagem de carrinho (identidade: wa_id + numero_id) e grava ignorado nas etapas que faltam, que e o freio que a carbo_msg_fila ja respeita. Devolve quantas respostas novas achou.';

-- ⚠️ Função de manutenção, chamada só pelo cron: ninguém mais a executa.
revoke execute on function public.carbo_carrinho_marcar_respostas() from public, anon, authenticated;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 3 — o agendamento (SQL puro, a cada minuto)                     ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- Mesmo nome reagenda em vez de duplicar.
select cron.schedule('carrinho-respostas-1min', '* * * * *',
                     'select public.carbo_carrinho_marcar_respostas()');


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ CONFERÊNCIA                                                           ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- (a) Roda uma vez na mão. ESPERADO: 0 (a recuperação está desligada, não há
--     envio de carrinho para alguém ter respondido).
-- select public.carbo_carrinho_marcar_respostas() as respostas_novas;
--
-- (b) O job existe e está ativo. ESPERADO: uma linha, active = true.
-- select jobname, schedule, active from cron.job where jobname = 'carrinho-respostas-1min';
