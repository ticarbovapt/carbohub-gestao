-- ═══════════════════════════════════════════════════════════════════════════
-- Painel do atendimento — a tela do GESTOR no Carbo Atendimento (06/11/2026)
--
-- Pedido do dono do processo: "uma tela para gestores … TMA, TMPR etc, uma
-- tela completa para gestores acompanharem as informações de atendimento e
-- poderem cobrar quem atende". Medido no dia anterior: de cada 100 mensagens
-- que pediam resposta, ~15 tinham resposta; a caixa da Loja não tinha resposta
-- desde 10/10 e a do Clube desde 09/10 — e nada disso aparecia em tela nenhuma.
--
-- ⚠️ O CÁLCULO MORA AQUI, nunca na tela. A tela é de UM app só, mas o número
-- é o que o gestor cobra de alguém: duas definições de "respondida" (uma no
-- banco, outra no navegador) dariam dois números para a mesma cobrança.
--
-- As definições seguem o mercado adaptado ao assíncrono (Zendesk, Intercom,
-- HDI), e cada uma tem um porquê:
--
--   RODADA      as mensagens do cliente desde a última resposta de GENTE nossa.
--               É a unidade de "o cliente falou e espera". Aviso automático
--               não encerra rodada (não é atendimento). Silêncio de 24 h
--               também encerra (a janela da Meta fechou; o que vier depois é
--               outra conversa).
--   PEDE        a rodada tem ao menos uma mensagem que pede resposta. "Ok",
--               👍 e a resposta automática do WhatsApp Business do CLIENTE não
--               pedem — eram 2/3 do volume no serviço. Sem esta separação toda
--               taxa sai inventada (`carbo_wa_pede_resposta`).
--   TMR         tempo de resposta de cada rodada que pede: da 1ª mensagem que
--               pede até a 1ª resposta de gente.
--   TMPR        o TMR só da PRIMEIRA rodada de cada atendimento.
--   ATENDIMENTO (episódio) mensagens do mesmo par sem silêncio > 24 h.
--   TMA         duração do atendimento: da 1ª mensagem do cliente à última
--               resposta de gente. ⚠️ Em assíncrono o TMA NÃO mede esforço (o
--               relógio corre enquanto o cliente some) — por isso ele vem com
--               "mensagens por atendimento" ao lado, e a tela diz.
--   ÚTIL        a mesma conta só dentro do horário de atendimento
--               (`carbo_atendimento_config`). Sem isso a mensagem de sábado à
--               noite domina a média e cobra de quem não estava trabalhando.
--   FCR         atendimento com UMA rodada que pede, respondida, e o cliente
--               não voltou pedindo nada em 7 dias.
--   FECHADA SEM RESPOSTA  rodada que pede, sem resposta escrita, e alguém
--               marcou resolvido/aguardando. ⚠️ É a métrica que impede o TMPR
--               de melhorar quando se fecha sem responder (a armadilha da
--               Intercom: resolvida sem resposta sai do tempo de resposta).
--   PERDIDA     pedia, ninguém respondeu nem marcou, e a janela de 24 h fechou.
--
-- Mediana e p90 sempre; média só ao lado. Com ~10 conversas/dia uma demora só
-- arrasta a média.
--
-- Rode em BLOCOS, na ordem. Nada aqui apaga nem altera dado existente: são
-- tabelas, funções e um gatilho NOVOS. O gatilho só ACRESCENTA linha de
-- histórico, e erro dentro dele NUNCA derruba a gravação do status.
-- ═══════════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — quem é gestor do atendimento, e o horário/metas             ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- ⚠️ A MESMA regra do `isGestor` da tela (`isManager` = flag de função do
-- Admin) e do Pré-Vendas: `carbo_is_gestor` E o app. Head sem a flag de
-- gestor não entra — é decisão do cadastro de funções, não deste painel.
create or replace function public.carbo_atendimento_gestor()
returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null
     and public.carbo_is_gestor(auth.uid())
     and public.carbo_tem_app(array['carbo_atendimento']);
$$;
grant execute on function public.carbo_atendimento_gestor() to authenticated, service_role;
revoke execute on function public.carbo_atendimento_gestor() from anon, public;

-- ⚠️ CADASTRO, nunca constante: o horário muda (sábado, feriado de fim de
-- ano) e a meta é decisão do gestor. Linha ÚNICA (id boolean).
create table if not exists public.carbo_atendimento_config (
  id                         boolean primary key default true check (id),
  hora_inicio                time    not null default '08:00',
  hora_fim                   time    not null default '18:00',
  -- ISO: 1 = segunda … 7 = domingo.
  dias                       int[]   not null default '{1,2,3,4,5}',
  -- Meta da 1ª resposta, em minutos de HORÁRIO DE ATENDIMENTO. 15 = o que a
  -- pesquisa sugere para equipe pequena (o consumidor brasileiro espera
  -- ~5 min; com 2 pessoas e outras tarefas, 15 é cobrável).
  meta_resposta_min          int     not null default 15  check (meta_resposta_min between 1 and 1440),
  -- % das rodadas que pedem resposta respondidas dentro da meta.
  meta_sla_pct               int     not null default 90  check (meta_sla_pct between 1 and 100),
  -- Taxa de resposta mínima (respondidas ÷ que pedem).
  meta_taxa_resposta_pct     int     not null default 95  check (meta_taxa_resposta_pct between 1 and 100),
  atualizado_em              timestamptz not null default now(),
  atualizado_por             uuid,
  check (hora_fim > hora_inicio)
);
insert into public.carbo_atendimento_config (id) values (true) on conflict (id) do nothing;

alter table public.carbo_atendimento_config enable row level security;
drop policy if exists carbo_atendimento_config_leitura on public.carbo_atendimento_config;
create policy carbo_atendimento_config_leitura on public.carbo_atendimento_config
  for select to authenticated using ((select public.carbo_e_time_interno()));
-- ⚠️ Sem policy de escrita: muda só pela função, que confere o gestor.
grant select on public.carbo_atendimento_config to authenticated;

create or replace function public.carbo_atendimento_config_definir(
  p_hora_inicio time, p_hora_fim time, p_dias int[],
  p_meta_resposta_min int, p_meta_sla_pct int, p_meta_taxa_resposta_pct int
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.carbo_atendimento_gestor() then
    raise exception 'Somente gestores do Carbo Atendimento alteram o horário e as metas.' using errcode = '42501';
  end if;
  if p_dias is null or cardinality(p_dias) = 0
     or exists (select 1 from unnest(p_dias) d where d not between 1 and 7) then
    raise exception 'Escolha ao menos um dia da semana.';
  end if;
  update public.carbo_atendimento_config
     set hora_inicio = p_hora_inicio, hora_fim = p_hora_fim,
         dias = (select array_agg(distinct d order by d) from unnest(p_dias) d),
         meta_resposta_min = p_meta_resposta_min, meta_sla_pct = p_meta_sla_pct,
         meta_taxa_resposta_pct = p_meta_taxa_resposta_pct,
         atualizado_em = now(), atualizado_por = auth.uid()
   where id;
end $$;
grant execute on function public.carbo_atendimento_config_definir(time, time, int[], int, int, int) to authenticated;
revoke execute on function public.carbo_atendimento_config_definir(time, time, int[], int, int, int) from anon, public;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — o HISTÓRICO do status da conversa                           ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
--
-- `carbo_wa_atendimento` guarda só o estado ATUAL: quem marcou "resolvido"
-- ontem some quando a conversa reabre hoje. Sem histórico não há como dizer
-- quem fecha sem responder, nem quanto reabre.
--
-- ⚠️ Gatilho, não tela: a tela de Conversas grava o status por DOIS caminhos
-- (upsert e update), e cópia que alguém esquece de fazer não dá erro.
-- ⚠️ O passado não existe e não é inventado: a linha `retrato` é o estado de
-- HOJE de cada conversa (a única marca que sobreviveu), com a data em que ela
-- foi tomada. A tabela antiga `carbo_wa_resolvidas` entra como `resolvidas`.

create table if not exists public.carbo_wa_atendimento_hist (
  id               bigint generated always as identity primary key,
  numero_id        text,
  wa_id            text not null,
  status           text not null,
  status_antes     text,
  desde            timestamptz,
  responsavel      uuid,
  responsavel_nome text,
  por              uuid,
  por_nome         text,
  em               timestamptz not null default now(),
  origem           text not null default 'tela' check (origem in ('tela','retrato','resolvidas'))
);
create index if not exists carbo_wa_atendimento_hist_par on public.carbo_wa_atendimento_hist (numero_id, wa_id, em);
create index if not exists carbo_wa_atendimento_hist_por on public.carbo_wa_atendimento_hist (por, em) where por is not null;
create index if not exists carbo_wa_atendimento_hist_em  on public.carbo_wa_atendimento_hist (em);

comment on table public.carbo_wa_atendimento_hist is
  'Histórico de status/responsável de cada conversa do WhatsApp (append-only). Escrito pelo gatilho trg_wa_atendimento_hist. ⚠️ Linhas `retrato`/`resolvidas` = o que existia antes de 06/11/2026; o histórico completo começa ali.';

alter table public.carbo_wa_atendimento_hist enable row level security;
drop policy if exists carbo_wa_atendimento_hist_leitura on public.carbo_wa_atendimento_hist;
create policy carbo_wa_atendimento_hist_leitura on public.carbo_wa_atendimento_hist
  for select to authenticated using ((select public.carbo_e_time_interno()));
-- ⚠️ Nenhuma policy de escrita: histórico que se edita pela API é histórico forjável.
grant select on public.carbo_wa_atendimento_hist to authenticated;

create or replace function public.carbo_wa_atendimento_registra()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_por uuid;
begin
  if tg_op = 'UPDATE'
     and new.status      is not distinct from old.status
     and new.responsavel is not distinct from old.responsavel
     and new.desde       is not distinct from old.desde then
    return new;
  end if;
  begin
    v_por := coalesce(new.atualizado_por, auth.uid());
    insert into public.carbo_wa_atendimento_hist
      (numero_id, wa_id, status, status_antes, desde, responsavel, responsavel_nome, por, por_nome, em, origem)
    values
      (new.numero_id, new.wa_id, new.status,
       case when tg_op = 'UPDATE' then old.status end,
       new.desde, new.responsavel, new.responsavel_nome,
       v_por, (select p.full_name from public.profiles p where p.id = v_por),
       now(), 'tela');
  exception when others then
    -- ⚠️ Histórico que falha não pode desfazer o clique de quem atende.
    raise warning 'carbo_wa_atendimento_hist: %', sqlerrm;
  end;
  return new;
end $$;
revoke execute on function public.carbo_wa_atendimento_registra() from anon, public, authenticated;

drop trigger if exists trg_wa_atendimento_hist on public.carbo_wa_atendimento;
create trigger trg_wa_atendimento_hist
  after insert or update on public.carbo_wa_atendimento
  for each row execute function public.carbo_wa_atendimento_registra();

-- O retrato de hoje (só uma vez: não duplica se o bloco rodar de novo).
insert into public.carbo_wa_atendimento_hist
  (numero_id, wa_id, status, desde, responsavel, responsavel_nome, por, por_nome, em, origem)
select a.numero_id, a.wa_id, a.status, a.desde, a.responsavel, a.responsavel_nome,
       a.atualizado_por, p.full_name, coalesce(a.desde, a.atualizado_em), 'retrato'
  from public.carbo_wa_atendimento a
  left join public.profiles p on p.id = a.atualizado_por
 where not exists (select 1 from public.carbo_wa_atendimento_hist h where h.origem = 'retrato');

insert into public.carbo_wa_atendimento_hist
  (numero_id, wa_id, status, desde, por, por_nome, em, origem)
select r.numero_id, r.wa_id, 'resolvido', r.em, r.por, p.full_name, r.em, 'resolvidas'
  from public.carbo_wa_resolvidas r
  left join public.profiles p on p.id = r.por
 where not exists (select 1 from public.carbo_wa_atendimento_hist h where h.origem = 'resolvidas')
   and not exists (select 1 from public.carbo_wa_atendimento_hist h
                    where h.origem = 'retrato' and h.numero_id = r.numero_id
                      and h.wa_id = r.wa_id and h.status = 'resolvido'
                      and abs(extract(epoch from h.em - r.em)) < 60);


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 3 — as três leituras de TEXTO                                   ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- A mensagem do cliente PEDE resposta?
-- ⚠️ ESPELHO de `pareceEncerramento` em apps/atendimento/src/lib/conversas.ts
-- (a mesma lista ENCERRAMENTOS e EMOJI_OK). Mudou uma, mude a outra.
-- ⚠️ O método é SUBTRATIVO: tira as palavras de agradecimento e vê se sobrou
-- alguma coisa. "Ok recebido" esvazia; "ok mas não chegou" sobra "mas nao
-- chegou" e PEDE. O erro aceito é o de sobrar (contar um "obrigado pela
-- atenção" como pedido) — o contrário esconderia reclamação.
create or replace function public.carbo_wa_pede_resposta(p_tipo text, p_texto text)
returns boolean language plpgsql immutable set search_path = public as $$
declare
  t text; base text; tem_ok boolean := false; e text; w text; palavras text[];
begin
  if p_tipo in ('reaction', 'sticker') then return false; end if;
  if p_tipo in ('audio', 'voice', 'image', 'video', 'document', 'location', 'contacts') then return true; end if;
  t := btrim(coalesce(p_texto, ''));
  -- Tipo desconhecido sem texto: melhor sobrar (aparece) que sumir.
  if t = '' then return coalesce(p_tipo, '') not in ('text', 'button', 'interactive'); end if;
  -- ⚠️ A resposta automática do WhatsApp Business do PRÓPRIO cliente
  -- ("Fulano agradece seu contato. Como podemos ajudar?") não é pergunta,
  -- mesmo com "?": cliente não escreve "como podemos ajudar".
  if t ~* (
       'agradece (o |a )?(seu|sua) (contato|mensagem|prefer)|n[aã]o estamos dispon[ií]ve|'
    || 'como (podemos|posso) (te |lhe )?ajud|mensagem autom[aá]tica|retornare(i|mos)|responderemos|'
    || 'entraremos em contato|assim que poss[ií]vel (iremos|irei|retorn|respond|lhe)|'
    || 'seja bem[- ]vind|hor[aá]rio de atendimento') then
    return false;
  end if;
  if position('?' in t) > 0 then return true; end if;
  if length(t) > 60 then return true; end if;
  base := t;
  foreach e in array array['👍','👌','🙏','✅','❤️','❤','💚','😊','🙂','😉','🤝','👏','🚀','🫂','🥰','😁','😀','🙌','💪','👊'] loop
    if position(e in base) > 0 then tem_ok := true; base := replace(base, e, ' '); end if;
  end loop;
  base := translate(lower(base), 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc');
  base := regexp_replace(base, '[^a-z0-9\s]', ' ', 'g');
  palavras := array_remove(regexp_split_to_array(btrim(base), '\s+'), '');
  if coalesce(cardinality(palavras), 0) = 0 then return not tem_ok; end if;
  foreach w in array palavras loop
    if not (w = any (array[
      'ok','okay','oki','okk','blz','beleza','certo','combinado','fechado',
      'obrigado','obrigada','obg','obgd','vlw','valeu','grato','grata',
      'recebi','recebido','chegou','entendi','perfeito','otimo','excelente',
      'show','top','joia','tudo','bem','bom','boa','sim','isso','eh',
      'de','nada','ate','mais','abraco','bs','abs','att',
      -- acrescentadas em 06/11/2026, medidas nas conversas reais
      'muito','pela','pelo','atencao','retorno','agilidade','gentileza',
      'agradeco','agradecido','agradecida','deus','abencoe',
      'certinho','certinha','direitinho','tranquilo','maravilha','positivo',
      'confirmado','confirmo','ja','ta','to','td','tb','tbm','tambem','sucesso',
      'entregue','recebida','recebidos','recebidas','chegaram','bacana','legal','certa',
      'aqui','agora','o','a','os','as','e','foi','esta','grande',
      -- ⚠️ FORA de propósito: dia/tarde/noite ("Bom dia" abre conversa) e
      -- sem/problema/avaria/entrega ("sem entrega", "avaria" são reclamação).
      'ordem','conforme',
      'vou','vamos','testar','usar'
    ])) then
      return true;
    end if;
  end loop;
  return false;
end $$;

-- O ASSUNTO da rodada, por palavra-chave. ⚠️ Aproximado e declarado assim na
-- tela: serve para o gestor ver ONDE está o volume, não para classificar
-- conversa a conversa. A ORDEM é a regra — reclamação vence entrega.
create or replace function public.carbo_wa_tema(p_texto text)
returns text language sql immutable set search_path = public as $$
  select case
    when t = '' then 'outros'
    when t ~ '(procon|reclame aqui|reclamac|reclamar|advogad|justica|defesa do consumidor|processar|denunci|cancel|devolu|devolv|estorno|reembols|desist)' then 'reclamacao'
    when t ~ '(cobr|duplic|duas vezes|dois pedidos|2 pedidos|duas compras|2 compras|pix|cart(ao|oes)|boleto|pagamento|pagar|paguei|parcel|roleta|cupom|desconto|preco|valor|juros)' then 'pagamento'
    when t ~ '(vaz|molhad|amassad|quebr|errad|faltou|falta |veio aberto|chegou aberto|defeito|diferente|sem data|vencid)' then 'produto'
    when t ~ '(golpe|confi|fraude|site oficial|e seguro|enganad)' then 'confianca'
    when t ~ '(rastre|entreg|chega|receb|prazo|transportad|correio|jadlog|pacote|despach|demor|envio|enviad|pedido|compra|nao veio)' then 'entrega'
    when t ~ '(diesel|gasolina|etanol|alcool|flex|moto|tanque|litro|sache|frasco|quant|como us|serve|funciona|motor|carro|aditivo|carbur)' then 'uso'
    when t ~ '(loja fisica|onde (compro|encontro|vende|acho)|revend|representante|distribu|atacado|posto|na minha cidade|aqui em )' then 'onde_comprar'
    else 'outros'
  end
  from (select translate(lower(coalesce(p_texto, '')), 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc') as t) x;
$$;

-- Sinal de RISCO (Procon, advogado, golpe): é o que o gestor abre primeiro.
create or replace function public.carbo_wa_risco(p_texto text)
returns boolean language sql immutable set search_path = public as $$
  select translate(lower(coalesce(p_texto, '')), 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc')
         ~ '(procon|reclame aqui|advogad|justica|defesa do consumidor|processar|denunci|golpe|fraude|estorno|chargeback|cobrad[oa] duas|cobranca duplicada|nao autoriz)';
$$;

-- Minutos entre dois instantes contando SÓ o horário de atendimento (dia de
-- Brasília). Feriado não é conhecido — conta como dia útil.
create or replace function public.carbo_minutos_uteis(
  p_a timestamptz, p_b timestamptz, p_ini time, p_fim time, p_dias int[]
) returns numeric language plpgsql stable set search_path = public as $$
-- ⚠️ plpgsql com laço, e não generate_series: é chamada uma vez por rodada
-- respondida, e a versão em SQL custava ~0,12 ms por chamada (medido).
declare
  d     date := (p_a at time zone 'America/Sao_Paulo')::date;
  d_fim date := (p_b at time zone 'America/Sao_Paulo')::date;
  tot   numeric := 0;
  ini   timestamptz;
  fim   timestamptz;
begin
  if p_a is null or p_b is null or p_b <= p_a then return 0; end if;
  if d_fim - d > 60 then d := d_fim - 60; end if;   -- teto de sanidade
  while d <= d_fim loop
    if extract(isodow from d)::int = any (p_dias) then
      ini := greatest(p_a, (d + p_ini) at time zone 'America/Sao_Paulo');
      fim := least(p_b, (d + p_fim) at time zone 'America/Sao_Paulo');
      if fim > ini then tot := tot + extract(epoch from fim - ini); end if;
    end if;
    d := d + 1;
  end loop;
  return tot / 60.0;
end $$;

revoke execute on function public.carbo_wa_pede_resposta(text, text) from anon, public;
revoke execute on function public.carbo_wa_tema(text) from anon, public;
revoke execute on function public.carbo_wa_risco(text) from anon, public;
revoke execute on function public.carbo_minutos_uteis(timestamptz, timestamptz, time, time, int[]) from anon, public;
grant execute on function public.carbo_wa_pede_resposta(text, text) to authenticated, service_role;
grant execute on function public.carbo_wa_tema(text) to authenticated, service_role;
grant execute on function public.carbo_wa_risco(text) to authenticated, service_role;
grant execute on function public.carbo_minutos_uteis(timestamptz, timestamptz, time, time, int[]) to authenticated, service_role;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 4 — as RODADAS (a base de todas as contas)                      ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
--
-- ⚠️ INTERNA: ninguém a chama pela API (sem execute para authenticated). Quem
-- a lê são as duas funções do painel, que conferem o gestor antes.
-- ⚠️ Uma função só para as duas telas (painel e detalhe da pessoa): duas
-- cópias desta conta divergiriam no dia em que alguém mexesse numa.

drop function if exists public.carbo_atendimento_rodadas(timestamptz, text);
create or replace function public.carbo_atendimento_rodadas(p_desde timestamptz, p_numero text)
returns table (
  numero_id text, wa_id text, idx bigint, ep bigint,
  inicio timestamptz, inicio_pede timestamptz, ultimo_cliente_em timestamptz,
  proxima_em timestamptz, pede boolean, n_msgs bigint, n_pede bigint,
  textos text, ultimo_texto text, ultimo_tipo text,
  respondido_em timestamptz, resp_pessoa text, resp_nome text,
  n_humanos bigint, ultimo_humano_em timestamptz,
  mark_em timestamptz, mark_status text, mark_por text, mark_por_nome text,
  desfecho text, primeira_do_ep boolean
)
language sql stable set search_path = public as $$
  with msgs as (
    select m.numero_id, m.wa_id, m.wamid, m.ocorrido_em, m.tipo, m.texto,
           case when m.direcao = 'entrada' then 'cliente' else 'humano' end as quem,
           coalesce(m.enviado_por::text, 'nome:' || m.enviado_por_nome) as pessoa,
           coalesce(pr.full_name, m.enviado_por_nome) as pessoa_nome,
           m.direcao = 'entrada' and public.carbo_wa_pede_resposta(m.tipo, m.texto) as pede
      from public.carbo_wa_mensagens m
      left join public.profiles pr on pr.id = m.enviado_por
     where m.ocorrido_em >= p_desde
       and (p_numero is null or m.numero_id = p_numero)
       and (m.direcao = 'entrada'
            -- ⚠️ Só GENTE encerra rodada: aviso automático não é atendimento,
            -- e resposta que falhou não chegou ao cliente.
            or ((m.enviado_por is not null or m.enviado_por_nome is not null)
                and coalesce(m.status, '') <> 'falhou'))
  ),
  seq as (
    select s.*,
           count(*) filter (where s.quem = 'humano')
             over (partition by s.numero_id, s.wa_id order by s.ocorrido_em, s.wamid
                   rows between unbounded preceding and current row) as n_humano,
           lag(s.ocorrido_em)
             over (partition by s.numero_id, s.wa_id order by s.ocorrido_em, s.wamid) as anterior_em
      from msgs s
  ),
  seq2 as (
    select s.*,
           sum(case when s.anterior_em is null or s.ocorrido_em - s.anterior_em > interval '24 hours' then 1 else 0 end)
             over (partition by s.numero_id, s.wa_id order by s.ocorrido_em, s.wamid
                   rows between unbounded preceding and current row) as ep_n
      from seq s
  ),
  -- A qual rodada cada mensagem de gente responde: a última aberta antes dela.
  -- (n_humano só cresce, então o maior valor de cliente até ali é ela.)
  seq3 as (
    select s.*,
           max(case when s.quem = 'cliente' then s.n_humano end)
             over (partition by s.numero_id, s.wa_id order by s.ocorrido_em, s.wamid
                   rows between unbounded preceding and current row) as idx_resp
      from seq2 s
  ),
  rod as (
    select s.numero_id, s.wa_id, s.n_humano as idx, s.ep_n as ep,
           min(s.ocorrido_em) as inicio,
           min(s.ocorrido_em) filter (where s.pede) as inicio_pede,
           max(s.ocorrido_em) as ultimo_cliente_em,
           bool_or(s.pede) as pede,
           count(*) as n_msgs,
           count(*) filter (where s.pede) as n_pede,
           left(string_agg(coalesce(s.texto, ''), ' · ' order by s.ocorrido_em) filter (where s.pede), 2000) as textos,
           (array_agg(s.texto order by s.ocorrido_em desc))[1] as ultimo_texto,
           (array_agg(s.tipo  order by s.ocorrido_em desc))[1] as ultimo_tipo
      from seq3 s
     where s.quem = 'cliente'
     group by 1, 2, 3, 4
  ),
  hum as (
    select s.numero_id, s.wa_id, s.idx_resp as idx, s.ep_n as ep,
           min(s.ocorrido_em) as respondido_em,
           (array_agg(s.pessoa order by s.ocorrido_em))[1] as resp_pessoa,
           (array_agg(s.pessoa_nome order by s.ocorrido_em))[1] as resp_nome,
           count(*) as n_humanos,
           max(s.ocorrido_em) as ultimo_humano_em
      from seq3 s
     where s.quem = 'humano' and s.idx_resp is not null
     group by 1, 2, 3, 4
  ),
  junta as (
    select r.*, h.respondido_em, h.resp_pessoa, h.resp_nome,
           coalesce(h.n_humanos, 0) as n_humanos, h.ultimo_humano_em,
           lead(r.inicio) over (partition by r.numero_id, r.wa_id order by r.inicio) as proxima_em
      from rod r
      left join hum h on h.numero_id = r.numero_id and h.wa_id = r.wa_id
                     and h.idx = r.idx and h.ep = r.ep
  )
  select j.numero_id, j.wa_id, j.idx, j.ep, j.inicio, j.inicio_pede, j.ultimo_cliente_em,
         j.proxima_em, j.pede, j.n_msgs, j.n_pede, j.textos, j.ultimo_texto, j.ultimo_tipo,
         j.respondido_em, j.resp_pessoa, j.resp_nome, j.n_humanos, j.ultimo_humano_em,
         mk.em, mk.status, mk.por, mk.por_nome,
         case
           when not j.pede then 'nao_pede'
           when j.respondido_em is not null then 'respondida'
           when mk.em is not null then 'fechada_sem_resposta'
           when j.ultimo_cliente_em + interval '24 hours' > now() then 'aguardando'
           else 'perdida'
         end as desfecho,
         j.pede and j.inicio = min(j.inicio) filter (where j.pede)
                                 over (partition by j.numero_id, j.wa_id, j.ep) as primeira_do_ep
    from junta j
    -- A marca que fechou a rodada sem resposta: resolvido/aguardando dado
    -- DEPOIS da última mensagem dela e antes da próxima mensagem do cliente.
    left join lateral (
      select h.em, h.status, h.por::text as por,
             coalesce(h.por_nome, pr.full_name) as por_nome
        from public.carbo_wa_atendimento_hist h
        left join public.profiles pr on pr.id = h.por
       where j.respondido_em is null and j.pede
         and h.numero_id = j.numero_id and h.wa_id = j.wa_id
         and h.status in ('resolvido', 'aguardando')
         and coalesce(h.desde, h.em) >= j.ultimo_cliente_em
         and (j.proxima_em is null or coalesce(h.desde, h.em) < j.proxima_em)
       order by h.em
       limit 1
    ) mk on true;
$$;
revoke execute on function public.carbo_atendimento_rodadas(timestamptz, text) from anon, public, authenticated;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 5 — o PAINEL (uma chamada, tudo agregado no banco, jsonb)       ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
--
-- ⚠️ `jsonb`, nunca `setof`: o teto de 1.000 do PostgREST vale para RPC.
-- ⚠️ O período anterior (mesma duração, logo antes) vem na MESMA chamada,
-- pela MESMA conta — comparação calculada de dois jeitos não compara nada.
-- ⚠️ A FILA e as PERDIDAS RECENTES não dependem do período: são o trabalho
-- de AGORA.

drop function if exists public.carbo_atendimento_painel(date, date, text);
create or replace function public.carbo_atendimento_painel(p_de date, p_ate date, p_numero text default null)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_tz      constant text := 'America/Sao_Paulo';
  v_dias    int;
  v_ant_de  date;
  v_de      timestamptz;
  v_fim     timestamptz;
  v_ini     timestamptz;
  c         public.carbo_atendimento_config%rowtype;
  v_out     jsonb;
begin
  if not public.carbo_atendimento_gestor() then
    raise exception 'Somente gestores do Carbo Atendimento veem o painel.' using errcode = '42501';
  end if;
  if p_de is null or p_ate is null or p_ate < p_de then
    raise exception 'Período inválido.';
  end if;
  v_dias   := (p_ate - p_de) + 1;
  if v_dias > 400 then raise exception 'Período longo demais (máximo 400 dias).'; end if;
  v_ant_de := p_de - v_dias;
  v_de     := p_de::timestamp at time zone v_tz;
  v_fim    := (p_ate + 1)::timestamp at time zone v_tz;
  v_ini    := v_ant_de::timestamp at time zone v_tz;

  select * into c from public.carbo_atendimento_config where id;
  if not found then
    c.hora_inicio := '08:00'; c.hora_fim := '18:00'; c.dias := '{1,2,3,4,5}';
    c.meta_resposta_min := 15; c.meta_sla_pct := 90; c.meta_taxa_resposta_pct := 95;
  end if;

  with
  r0 as (
    -- 7 dias antes do período anterior: rodada e atendimento precisam do
    -- contexto (a resposta de ontem decide se a mensagem de hoje abre rodada).
    select * from public.carbo_atendimento_rodadas(v_ini - interval '7 days', p_numero)
  ),
  r as (
    select r0.*,
           case when r0.inicio >= v_de  and r0.inicio < v_fim then 'atual'
                when r0.inicio >= v_ini and r0.inicio < v_de  then 'anterior' end as periodo,
           (r0.inicio at time zone v_tz)::date as dia,
           extract(isodow from r0.inicio at time zone v_tz)::int as dow,
           extract(hour   from r0.inicio at time zone v_tz)::int as hora,
           case when r0.respondido_em is not null then
             extract(epoch from r0.respondido_em - coalesce(r0.inicio_pede, r0.inicio)) / 60.0 end as min_resp,
           case when r0.respondido_em is not null and r0.pede and r0.inicio >= v_ini then
             public.carbo_minutos_uteis(coalesce(r0.inicio_pede, r0.inicio), r0.respondido_em,
                                        c.hora_inicio, c.hora_fim, c.dias) end as min_util,
           public.carbo_wa_tema(r0.textos) as tema,
           public.carbo_wa_risco(r0.textos) as risco,
           -- A próxima rodada que PEDE do mesmo par (para o FCR, sem laço).
           lead(case when r0.pede then r0.inicio end) over (
             partition by r0.numero_id, r0.wa_id, r0.pede order by r0.inicio) as proxima_pede_em
      from r0
  ),
  rp as (select * from r where r.pede and r.periodo is not null),
  -- O atendimento (episódio): as rodadas do mesmo par sem silêncio de 24 h.
  ep as (
    select r.numero_id, r.wa_id, r.ep,
           min(r.inicio) as inicio,
           max(greatest(r.ultimo_cliente_em, coalesce(r.ultimo_humano_em, r.ultimo_cliente_em))) as fim,
           max(r.ultimo_humano_em) as ultimo_humano_em,
           max(r.proxima_pede_em) filter (where r.pede) as proxima_pede_em,
           sum(r.n_humanos) as msgs_humano,
           count(*) filter (where r.pede) as rodadas_pede,
           count(*) filter (where r.pede and r.respondido_em is not null) as rodadas_resp,
           bool_or(r.pede) as pede
      from r
     group by 1, 2, 3
  ),
  ep2 as (
    select e.*,
           case when e.inicio >= v_de  and e.inicio < v_fim then 'atual'
                when e.inicio >= v_ini and e.inicio < v_de  then 'anterior' end as periodo,
           extract(epoch from e.ultimo_humano_em - e.inicio) / 60.0 as min_tma,
           -- FCR: uma rodada que pede, respondida, e o cliente não voltou
           -- pedindo nada nos 7 dias seguintes.
           (e.rodadas_pede = 1 and e.rodadas_resp = 1
            and (e.proxima_pede_em is null or e.proxima_pede_em > e.fim + interval '7 days')) as fcr
      from ep e
     where e.pede
  ),
  -- Mensagens de gente no período (volume do atendente, e as que falharam).
  hm as (
    select m.numero_id, m.wa_id, m.ocorrido_em, m.status,
           coalesce(m.enviado_por::text, 'nome:' || m.enviado_por_nome) as pessoa,
           coalesce(pr.full_name, m.enviado_por_nome) as pessoa_nome,
           (m.ocorrido_em at time zone v_tz)::date as dia,
           extract(isodow from m.ocorrido_em at time zone v_tz)::int as dow,
           extract(hour   from m.ocorrido_em at time zone v_tz)::int as hora
      from public.carbo_wa_mensagens m
      left join public.profiles pr on pr.id = m.enviado_por
     where m.direcao = 'saida' and (m.enviado_por is not null or m.enviado_por_nome is not null)
       and m.ocorrido_em >= v_de and m.ocorrido_em < v_fim
       and (p_numero is null or m.numero_id = p_numero)
  ),
  -- Marcas de status no período (quem resolve), e se a conversa REABRIU:
  -- o cliente voltou pedindo algo em até 7 dias depois do "resolvido".
  mk as (
    select h.*, coalesce(h.por_nome, pr.full_name) as nome,
           h.status = 'resolvido' and exists (
             select 1 from public.carbo_wa_mensagens x
              where x.wa_id = h.wa_id and x.numero_id = h.numero_id
                and x.direcao = 'entrada'
                and x.ocorrido_em > coalesce(h.desde, h.em)
                and x.ocorrido_em <= coalesce(h.desde, h.em) + interval '7 days'
                and public.carbo_wa_pede_resposta(x.tipo, x.texto)) as reabriu
      from public.carbo_wa_atendimento_hist h
      left join public.profiles pr on pr.id = h.por
     where h.origem = 'tela' and h.em >= v_de and h.em < v_fim
       and (p_numero is null or h.numero_id = p_numero)
  ),
  kpi as (
    select p.periodo,
           count(*)                                                    as pedem,
           count(*) filter (where p.desfecho = 'respondida')           as respondidas,
           count(*) filter (where p.desfecho = 'fechada_sem_resposta') as fechadas_sem_resposta,
           count(*) filter (where p.desfecho = 'perdida')              as perdidas,
           count(*) filter (where p.desfecho = 'aguardando')           as aguardando,
           count(*) filter (where p.risco)                             as com_risco,
           count(distinct (p.numero_id, p.wa_id))                      as clientes,
           count(*) filter (where p.min_util <= c.meta_resposta_min)   as dentro_meta,
           round((percentile_cont(0.5) within group (order by p.min_resp))::numeric, 1) as tmr_mediana,
           round((percentile_cont(0.9) within group (order by p.min_resp))::numeric, 1) as tmr_p90,
           round(avg(p.min_resp)::numeric, 1)                                            as tmr_media,
           round((percentile_cont(0.5) within group (order by p.min_util))::numeric, 1) as tmr_util_mediana,
           round((percentile_cont(0.9) within group (order by p.min_util))::numeric, 1) as tmr_util_p90,
           round((percentile_cont(0.5) within group (order by p.min_resp) filter (where p.primeira_do_ep))::numeric, 1) as tmpr_mediana,
           round((percentile_cont(0.9) within group (order by p.min_resp) filter (where p.primeira_do_ep))::numeric, 1) as tmpr_p90,
           round((avg(p.min_resp) filter (where p.primeira_do_ep))::numeric, 1)                                         as tmpr_media,
           round((percentile_cont(0.5) within group (order by p.min_util) filter (where p.primeira_do_ep))::numeric, 1) as tmpr_util_mediana,
           round((percentile_cont(0.9) within group (order by p.min_util) filter (where p.primeira_do_ep))::numeric, 1) as tmpr_util_p90
      from rp p
     group by p.periodo
  ),
  kpi_nao as (
    select r.periodo, count(*) as nao_pedem
      from r where not r.pede and r.periodo is not null group by r.periodo
  ),
  kpi_ep as (
    select e.periodo,
           count(*)                                         as atendimentos,
           count(*) filter (where e.rodadas_resp > 0)       as atendimentos_respondidos,
           count(*) filter (where e.fcr)                    as fcr,
           round((percentile_cont(0.5) within group (order by e.min_tma))::numeric, 1) as tma_mediana,
           round((percentile_cont(0.9) within group (order by e.min_tma))::numeric, 1) as tma_p90,
           round(avg(e.min_tma)::numeric, 1)                as tma_media,
           round((avg(e.msgs_humano) filter (where e.rodadas_resp > 0))::numeric, 1)   as msgs_por_atendimento
      from ep2 e where e.periodo is not null group by e.periodo
  ),
  kpi_mk as (
    select count(*) filter (where status = 'resolvido') as resolvidas,
           count(*) filter (where status = 'resolvido' and reabriu) as reabertas
      from mk
  ),
  kpi_hm as (
    select count(*) as mensagens, count(*) filter (where status = 'falhou') as falharam,
           count(distinct pessoa) as atendentes_ativos
      from hm
  ),
  -- A pessoa: tudo o que ela fez no período, e o que ela tem AGORA.
  pessoas as (
    select pessoa as chave, max(pessoa_nome) as nome from hm group by pessoa
    union
    select resp_pessoa, max(resp_nome) from rp where periodo = 'atual' and resp_pessoa is not null group by resp_pessoa
    union
    select por::text, max(nome) from mk where por is not null group by por
    union
    -- ⚠️ Quem tem o app e não fez NADA também aparece: é exatamente quem o
    -- gestor precisa ver. Gestor/TI com a flag aparecem igual, e a tela
    -- separa "sem atividade" numa seção própria.
    select pr.id::text, pr.full_name
      from public.profiles pr
     where 'carbo_atendimento' = any (coalesce(pr.allowed_interfaces, '{}'))
       and coalesce(pr.status, '') not in ('deleted', 'rejected', 'blocked', 'inactive')
  ),
  pes as (
    select p.chave, max(p.nome) as nome from pessoas p where p.chave is not null group by p.chave
  ),
  atendentes as (
    select pe.chave, pe.nome,
           (select count(*) from rp x where x.periodo = 'atual' and x.resp_pessoa = pe.chave)                       as respondidas,
           (select count(*) from rp x where x.periodo = 'atual' and x.resp_pessoa = pe.chave and x.primeira_do_ep)  as primeiras,
           (select round((percentile_cont(0.5) within group (order by x.min_resp))::numeric, 1)
              from rp x where x.periodo = 'atual' and x.resp_pessoa = pe.chave)                                     as tmr_mediana,
           (select round((percentile_cont(0.9) within group (order by x.min_resp))::numeric, 1)
              from rp x where x.periodo = 'atual' and x.resp_pessoa = pe.chave)                                     as tmr_p90,
           (select round((percentile_cont(0.5) within group (order by x.min_util))::numeric, 1)
              from rp x where x.periodo = 'atual' and x.resp_pessoa = pe.chave)                                     as tmr_util_mediana,
           (select count(*) from rp x where x.periodo = 'atual' and x.resp_pessoa = pe.chave
                                        and x.min_util <= c.meta_resposta_min)                                       as dentro_meta,
           (select count(*) from hm where hm.pessoa = pe.chave)                                                      as mensagens,
           (select count(*) from hm where hm.pessoa = pe.chave and hm.status = 'falhou')                             as falharam,
           (select count(distinct (hm.numero_id, hm.wa_id)) from hm where hm.pessoa = pe.chave)                      as conversas,
           (select count(distinct hm.dia) from hm where hm.pessoa = pe.chave)                                        as dias_ativos,
           (select count(*) from mk where mk.por::text = pe.chave and mk.status = 'resolvido')                       as resolvidas,
           (select count(*) from mk where mk.por::text = pe.chave and mk.status = 'resolvido' and mk.reabriu)        as reabertas,
           (select count(*) from rp x where x.periodo = 'atual' and x.desfecho = 'fechada_sem_resposta'
                                        and x.mark_por = pe.chave)                                                   as fechadas_sem_resposta,
           (select count(*) from public.carbo_wa_notas n
             where n.autor::text = pe.chave and n.apagada_em is null
               and n.criado_em >= v_de and n.criado_em < v_fim
               and (p_numero is null or n.numero_id = p_numero))                                                    as notas,
           (select count(*) from public.carbo_wa_atendimento a
             where a.responsavel::text = pe.chave and a.status = 'em_atendimento'
               and (p_numero is null or a.numero_id = p_numero))                                                    as em_atendimento_agora,
           (select max(m.ocorrido_em) from public.carbo_wa_mensagens m
             where m.direcao = 'saida' and m.enviado_por::text = pe.chave)                                           as ultima_resposta_em,
           (select to_char(min((hm.ocorrido_em at time zone v_tz)::time), 'HH24:MI') from hm where hm.pessoa = pe.chave) as primeira_hora,
           (select to_char(max((hm.ocorrido_em at time zone v_tz)::time), 'HH24:MI') from hm where hm.pessoa = pe.chave) as ultima_hora
      from pes pe
  ),
  fila as (
    select r.*,
           extract(epoch from now() - coalesce(r.inicio_pede, r.inicio)) / 60.0 as espera_min,
           r.ultimo_cliente_em + interval '24 hours' as janela_ate
      from r
     where r.desfecho = 'aguardando'
  ),
  perdidas_rec as (
    select r.* from r
     where r.desfecho = 'perdida' and r.ultimo_cliente_em >= now() - interval '7 days'
       -- ⚠️ Quem voltou a escrever e FOI respondido depois já não é trabalho.
       and not exists (select 1 from r x
                        where x.numero_id = r.numero_id and x.wa_id = r.wa_id
                          and x.inicio > r.inicio and x.respondido_em is not null)
  ),
  ctt as (
    select distinct on (ct.numero_id, ct.wa_id) ct.numero_id, ct.wa_id, ct.nome
      from public.carbo_wa_contatos ct
     order by ct.numero_id, ct.wa_id
  )
  select jsonb_build_object(
    'gerado_em', now(),
    'periodo', jsonb_build_object('de', p_de, 'ate', p_ate, 'ant_de', v_ant_de, 'ant_ate', p_de - 1, 'dias', v_dias),
    'config', jsonb_build_object(
       'hora_inicio', to_char(c.hora_inicio, 'HH24:MI'), 'hora_fim', to_char(c.hora_fim, 'HH24:MI'),
       'dias', to_jsonb(c.dias), 'meta_resposta_min', c.meta_resposta_min,
       'meta_sla_pct', c.meta_sla_pct, 'meta_taxa_resposta_pct', c.meta_taxa_resposta_pct),
    'numeros', coalesce((select jsonb_agg(jsonb_build_object(
         'id', n.phone_number_id, 'rotulo', n.rotulo, 'funcao', n.funcao, 'cor', n.cor,
         'ativo', n.ativo, 'exibicao', n.numero_exibicao) order by n.ordem)
       from public.carbo_wa_numeros n), '[]'::jsonb),
    'kpis', coalesce((select jsonb_object_agg(k.periodo, to_jsonb(k) - 'periodo'
                                || coalesce((select to_jsonb(x) - 'periodo' from kpi_nao x where x.periodo = k.periodo), '{}'::jsonb)
                                || coalesce((select to_jsonb(x) - 'periodo' from kpi_ep  x where x.periodo = k.periodo), '{}'::jsonb))
                       from kpi k), '{}'::jsonb),
    'atividade', (select to_jsonb(a) from kpi_hm a) || (select to_jsonb(b) from kpi_mk b),
    'diario', coalesce((select jsonb_agg(d order by d.dia) from (
         select g.dia::date as dia,
                count(p.*) as pedem,
                count(p.*) filter (where p.desfecho = 'respondida') as respondidas,
                count(p.*) filter (where p.desfecho = 'perdida') as perdidas,
                count(p.*) filter (where p.desfecho = 'fechada_sem_resposta') as fechadas_sem_resposta,
                count(p.*) filter (where p.desfecho = 'aguardando') as aguardando,
                count(p.*) filter (where p.min_util <= c.meta_resposta_min) as dentro_meta,
                round((percentile_cont(0.5) within group (order by p.min_resp))::numeric, 1) as tmr_mediana,
                round((percentile_cont(0.5) within group (order by p.min_util))::numeric, 1) as tmr_util_mediana,
                (select count(*) from r x where x.periodo = 'atual' and not x.pede and x.dia = g.dia::date) as nao_pedem,
                (select count(*) from hm where hm.dia = g.dia::date) as mensagens
           from generate_series(p_de, p_ate, interval '1 day') g(dia)
           left join rp p on p.periodo = 'atual' and p.dia = g.dia::date
          group by g.dia) d), '[]'::jsonb),
    'faixas', coalesce((select jsonb_agg(f order by f.ordem) from (
         select x.ordem, x.faixa, count(p.*) as n
           from (values (1, 'ate_5'), (2, 'ate_15'), (3, 'ate_60'), (4, 'ate_4h'), (5, 'ate_24h'), (6, 'mais_24h'),
                        (7, 'fechada_sem_resposta'), (8, 'perdida'), (9, 'aguardando')) x(ordem, faixa)
           left join rp p on p.periodo = 'atual' and x.faixa = case
               when p.desfecho <> 'respondida' then p.desfecho
               when p.min_util <= 5    then 'ate_5'
               when p.min_util <= 15   then 'ate_15'
               when p.min_util <= 60   then 'ate_60'
               when p.min_util <= 240  then 'ate_4h'
               when p.min_util <= 1440 then 'ate_24h'
               else 'mais_24h' end
          group by x.ordem, x.faixa) f), '[]'::jsonb),
    'faixas_corrido', coalesce((select jsonb_agg(f order by f.ordem) from (
         select x.ordem, x.faixa, count(p.*) as n
           from (values (1, 'ate_5'), (2, 'ate_15'), (3, 'ate_60'), (4, 'ate_4h'), (5, 'ate_24h'), (6, 'mais_24h'),
                        (7, 'fechada_sem_resposta'), (8, 'perdida'), (9, 'aguardando')) x(ordem, faixa)
           left join rp p on p.periodo = 'atual' and x.faixa = case
               when p.desfecho <> 'respondida' then p.desfecho
               when p.min_resp <= 5    then 'ate_5'
               when p.min_resp <= 15   then 'ate_15'
               when p.min_resp <= 60   then 'ate_60'
               when p.min_resp <= 240  then 'ate_4h'
               when p.min_resp <= 1440 then 'ate_24h'
               else 'mais_24h' end
          group by x.ordem, x.faixa) f), '[]'::jsonb),
    'heatmap', coalesce((select jsonb_agg(h) from (
         select coalesce(a.dow, b.dow) as dow, coalesce(a.hora, b.hora) as hora,
                coalesce(a.pedem, 0) as pedem, coalesce(a.respondidas, 0) as respondidas,
                coalesce(a.sem_resposta, 0) as sem_resposta, a.tmr_mediana,
                coalesce(b.mensagens, 0) as mensagens
           from (select p.dow, p.hora, count(*) as pedem,
                        count(*) filter (where p.desfecho = 'respondida') as respondidas,
                        count(*) filter (where p.desfecho in ('perdida', 'fechada_sem_resposta')) as sem_resposta,
                        round((percentile_cont(0.5) within group (order by p.min_resp))::numeric, 1) as tmr_mediana
                   from rp p where p.periodo = 'atual' group by 1, 2) a
           full join (select hm.dow, hm.hora, count(*) as mensagens from hm group by 1, 2) b
             on a.dow = b.dow and a.hora = b.hora) h), '[]'::jsonb),
    'por_numero', coalesce((select jsonb_agg(x order by x.pedem desc) from (
         select p.numero_id, n.rotulo, n.cor,
                count(*) as pedem,
                count(*) filter (where p.desfecho = 'respondida') as respondidas,
                count(*) filter (where p.desfecho = 'perdida') as perdidas,
                count(*) filter (where p.desfecho = 'fechada_sem_resposta') as fechadas_sem_resposta,
                count(*) filter (where p.desfecho = 'aguardando') as aguardando,
                count(*) filter (where p.min_util <= c.meta_resposta_min) as dentro_meta,
                round((percentile_cont(0.5) within group (order by p.min_resp))::numeric, 1) as tmr_mediana,
                round((percentile_cont(0.5) within group (order by p.min_util))::numeric, 1) as tmr_util_mediana,
                (select max(m.ocorrido_em) from public.carbo_wa_mensagens m
                  where m.numero_id = p.numero_id and m.direcao = 'saida' and m.enviado_por is not null) as ultima_resposta_em
           from rp p left join public.carbo_wa_numeros n on n.phone_number_id = p.numero_id
          where p.periodo = 'atual'
          group by p.numero_id, n.rotulo, n.cor) x), '[]'::jsonb),
    'temas', coalesce((select jsonb_agg(x order by x.pedem desc) from (
         select p.tema, count(*) as pedem,
                count(*) filter (where p.desfecho = 'respondida') as respondidas,
                count(*) filter (where p.desfecho in ('perdida', 'fechada_sem_resposta')) as sem_resposta,
                round((percentile_cont(0.5) within group (order by p.min_resp))::numeric, 1) as tmr_mediana
           from rp p where p.periodo = 'atual' group by p.tema) x), '[]'::jsonb),
    'etiquetas', coalesce((select jsonb_agg(x order by x.n desc) from (
         select t.nome, t.cor, count(*) as n
           from public.carbo_wa_conversa_tag ct
           join public.carbo_wa_tags t on t.id = ct.tag_id
          where ct.criado_em >= v_de and ct.criado_em < v_fim
            and (p_numero is null or ct.numero_id = p_numero)
          group by t.nome, t.cor) x), '[]'::jsonb),
    'atendentes', coalesce((select jsonb_agg(to_jsonb(a) order by a.respondidas desc, a.mensagens desc, a.nome) from atendentes a), '[]'::jsonb),
    'atendentes_diario', coalesce((select jsonb_agg(x) from (
         select hm.pessoa as chave, hm.dia, count(*) as mensagens,
                count(distinct (hm.numero_id, hm.wa_id)) as conversas
           from hm group by hm.pessoa, hm.dia) x), '[]'::jsonb),
    'agora', jsonb_build_object(
       'esperando', (select count(*) from fila),
       'janela_ate_2h', (select count(*) from fila where janela_ate <= now() + interval '2 hours'),
       'janela_ate_6h', (select count(*) from fila where janela_ate <= now() + interval '6 hours'),
       'com_risco', (select count(*) from fila where risco),
       'mais_antiga_min', (select round(max(espera_min)::numeric, 0) from fila),
       'perdidas_7d', (select count(*) from perdidas_rec),
       'aguardando_cliente', (select count(*) from public.carbo_wa_atendimento a
                               where a.status = 'aguardando' and (p_numero is null or a.numero_id = p_numero)),
       'em_atendimento', (select count(*) from public.carbo_wa_atendimento a
                           where a.status = 'em_atendimento' and (p_numero is null or a.numero_id = p_numero))),
    'fila', coalesce((select jsonb_agg(jsonb_build_object(
         'numero_id', f.numero_id, 'wa_id', f.wa_id, 'nome', ctt.nome,
         'desde', coalesce(f.inicio_pede, f.inicio), 'ultima_em', f.ultimo_cliente_em,
         'espera_min', round(f.espera_min::numeric, 0), 'janela_ate', f.janela_ate,
         'texto', left(coalesce(f.ultimo_texto, ''), 300), 'tipo', f.ultimo_tipo, 'n_msgs', f.n_pede,
         'tema', f.tema, 'risco', f.risco,
         'status', a.status, 'responsavel_nome', a.responsavel_nome)
         order by f.risco desc, f.janela_ate)
       from fila f
       left join ctt on ctt.numero_id = f.numero_id and ctt.wa_id = f.wa_id
       left join public.carbo_wa_atendimento a on a.numero_id = f.numero_id and a.wa_id = f.wa_id), '[]'::jsonb),
    'perdidas_recentes', coalesce((select jsonb_agg(x order by x.risco desc, x.ultima_em desc) from (
         select q.numero_id, q.wa_id, ctt.nome, coalesce(q.inicio_pede, q.inicio) as desde,
                q.ultimo_cliente_em as ultima_em, left(coalesce(q.ultimo_texto, ''), 300) as texto,
                q.ultimo_tipo as tipo, q.tema, q.risco, q.n_pede as n_msgs
           from perdidas_rec q
           left join ctt on ctt.numero_id = q.numero_id and ctt.wa_id = q.wa_id
          order by q.risco desc, q.ultimo_cliente_em desc
          limit 300) x), '[]'::jsonb),
    'fechadas_sem_resposta', coalesce((select jsonb_agg(x order by x.risco desc, x.fechada_em desc) from (
         select q.numero_id, q.wa_id, ctt.nome, coalesce(q.inicio_pede, q.inicio) as desde,
                left(coalesce(q.textos, q.ultimo_texto, ''), 300) as texto, q.ultimo_tipo as tipo,
                q.tema, q.risco, q.mark_em as fechada_em, q.mark_status as como,
                q.mark_por as por, q.mark_por_nome as por_nome
           from rp q
           left join ctt on ctt.numero_id = q.numero_id and ctt.wa_id = q.wa_id
          where q.periodo = 'atual' and q.desfecho = 'fechada_sem_resposta'
          order by q.risco desc, q.mark_em desc
          limit 300) x), '[]'::jsonb),
    'historico_desde', (select min(h.em) from public.carbo_wa_atendimento_hist h where h.origem = 'tela')
  ) into v_out;

  return v_out;
end $$;
grant execute on function public.carbo_atendimento_painel(date, date, text) to authenticated;
revoke execute on function public.carbo_atendimento_painel(date, date, text) from anon, public;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 6 — o DETALHE de uma pessoa (o que se abre para cobrar)         ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
--
-- A conversa a conversa: o que ela respondeu e quanto levou, o que fechou sem
-- responder, o que reabriu. Cobrança sem o caso na mão vira discussão.

drop function if exists public.carbo_atendimento_pessoa(date, date, text, text);
create or replace function public.carbo_atendimento_pessoa(p_de date, p_ate date, p_pessoa text, p_numero text default null)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_tz  constant text := 'America/Sao_Paulo';
  v_de  timestamptz;
  v_fim timestamptz;
  c     public.carbo_atendimento_config%rowtype;
  v_out jsonb;
begin
  if not public.carbo_atendimento_gestor() then
    raise exception 'Somente gestores do Carbo Atendimento veem o painel.' using errcode = '42501';
  end if;
  if p_de is null or p_ate is null or p_ate < p_de or (p_ate - p_de) > 400 or p_pessoa is null then
    raise exception 'Parâmetros inválidos.';
  end if;
  v_de  := p_de::timestamp at time zone v_tz;
  v_fim := (p_ate + 1)::timestamp at time zone v_tz;
  select * into c from public.carbo_atendimento_config where id;
  if not found then
    c.hora_inicio := '08:00'; c.hora_fim := '18:00'; c.dias := '{1,2,3,4,5}'; c.meta_resposta_min := 15;
  end if;

  with
  r as (
    select x.*,
           extract(epoch from x.respondido_em - coalesce(x.inicio_pede, x.inicio)) / 60.0 as min_resp,
           public.carbo_minutos_uteis(coalesce(x.inicio_pede, x.inicio), x.respondido_em,
                                      c.hora_inicio, c.hora_fim, c.dias) as min_util,
           public.carbo_wa_tema(x.textos) as tema, public.carbo_wa_risco(x.textos) as risco
      from public.carbo_atendimento_rodadas(v_de - interval '7 days', p_numero) x
     where x.pede and x.inicio >= v_de and x.inicio < v_fim
  ),
  ctt as (
    select distinct on (ct.numero_id, ct.wa_id) ct.numero_id, ct.wa_id, ct.nome
      from public.carbo_wa_contatos ct order by ct.numero_id, ct.wa_id
  )
  select jsonb_build_object(
    'respondidas', coalesce((select jsonb_agg(y order by y.desde desc) from (
        select r.numero_id, r.wa_id, ctt.nome, coalesce(r.inicio_pede, r.inicio) as desde,
               r.respondido_em, round(r.min_resp::numeric, 1) as min_resp, round(r.min_util::numeric, 1) as min_util,
               r.min_util <= c.meta_resposta_min as dentro_meta, r.n_humanos,
               left(coalesce(r.textos, ''), 300) as texto, r.tema, r.risco
          from r left join ctt on ctt.numero_id = r.numero_id and ctt.wa_id = r.wa_id
         where r.resp_pessoa = p_pessoa
         order by r.inicio desc limit 500) y), '[]'::jsonb),
    'fechadas_sem_resposta', coalesce((select jsonb_agg(y order by y.fechada_em desc) from (
        select r.numero_id, r.wa_id, ctt.nome, coalesce(r.inicio_pede, r.inicio) as desde,
               r.mark_em as fechada_em, r.mark_status as como,
               left(coalesce(r.textos, ''), 300) as texto, r.tema, r.risco
          from r left join ctt on ctt.numero_id = r.numero_id and ctt.wa_id = r.wa_id
         where r.desfecho = 'fechada_sem_resposta' and r.mark_por = p_pessoa
         order by r.mark_em desc limit 300) y), '[]'::jsonb),
    'reabertas', coalesce((select jsonb_agg(y order by y.resolvida_em desc) from (
        select h.numero_id, h.wa_id, ctt.nome, h.em as resolvida_em,
               (select min(m.ocorrido_em) from public.carbo_wa_mensagens m
                 where m.numero_id = h.numero_id and m.wa_id = h.wa_id
                   and m.direcao = 'entrada' and m.ocorrido_em > coalesce(h.desde, h.em)
                   and public.carbo_wa_pede_resposta(m.tipo, m.texto)) as voltou_em,
               (select left(coalesce(m.texto, '[' || m.tipo || ']'), 300) from public.carbo_wa_mensagens m
                 where m.numero_id = h.numero_id and m.wa_id = h.wa_id
                   and m.direcao = 'entrada' and m.ocorrido_em > coalesce(h.desde, h.em)
                   and public.carbo_wa_pede_resposta(m.tipo, m.texto)
                 order by m.ocorrido_em limit 1) as texto
          from public.carbo_wa_atendimento_hist h
          left join ctt on ctt.numero_id = h.numero_id and ctt.wa_id = h.wa_id
         where h.origem = 'tela' and h.status = 'resolvido' and h.por::text = p_pessoa
           and h.em >= v_de and h.em < v_fim
           and (p_numero is null or h.numero_id = p_numero)
         order by h.em desc limit 300) y where y.voltou_em is not null
           and y.voltou_em <= y.resolvida_em + interval '7 days'), '[]'::jsonb),
    'por_hora', coalesce((select jsonb_agg(y order by y.hora) from (
        select extract(hour from m.ocorrido_em at time zone v_tz)::int as hora, count(*) as mensagens
          from public.carbo_wa_mensagens m
         where m.direcao = 'saida' and coalesce(m.enviado_por::text, 'nome:' || m.enviado_por_nome) = p_pessoa
           and m.ocorrido_em >= v_de and m.ocorrido_em < v_fim
           and (p_numero is null or m.numero_id = p_numero)
         group by 1) y), '[]'::jsonb)
  ) into v_out;
  return v_out;
end $$;
grant execute on function public.carbo_atendimento_pessoa(date, date, text, text) to authenticated;
revoke execute on function public.carbo_atendimento_pessoa(date, date, text, text) from anon, public;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 7 — conferência (só leitura)                                    ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- No SQL Editor `auth.uid()` é nulo e as funções do painel RECUSAM (está
-- certo). Confira pela base, que não tem guarda:
--
-- select desfecho, count(*)
--   from public.carbo_atendimento_rodadas(now() - interval '30 days', null)
--  where inicio >= now() - interval '30 days'
--  group by 1 order by 2 desc;
