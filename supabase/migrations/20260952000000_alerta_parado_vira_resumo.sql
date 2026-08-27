-- ═══════════════════════════════════════════════════════════════════════════
-- O alerta de parado vira RESUMO — porque 70 avisos não são um alerta
--
-- ⚠️ Corrige o desenho da 20260951, no mesmo dia, com a evidência da primeira
-- rodada em produção.
--
-- ── O que a primeira rodada mostrou ──────────────────────────────────────
--
--     {"novos": 70, "reavisados": 0, "parados_agora": 70}
--
-- Setenta pedidos, e `notify_time_interno` faz fan-out para todo o time
-- interno: **2.100 linhas em `notifications`**, setenta itens não lidos no
-- sininho de cada uma das 30 pessoas, de uma vez.
--
-- Isso não é um alerta. É a coisa que ensina o time a fechar o sininho sem
-- ler — e a partir daí nenhum aviso funciona, nem este nem os que já
-- funcionavam. O alerta de venda online mora no mesmo sino.
--
-- ── E os limiares não cabiam na operação real ────────────────────────────
--
-- Dos 70, cerca de 40 eram "etiqueta comprada e não postada" com **3 ou 4
-- dias**. Isso é coleta normal: etiqueta gerada na sexta é postada na segunda,
-- e um fim de semana já estoura o limiar de 3.
--
-- Eu escolhi 3 dias por raciocínio ("a etiqueta deve sair no mesmo dia"), não
-- por medição. A distribuição real diz outra coisa, e limiar que dispara no
-- fluxo normal é limiar que vira ruído — o efeito é o mesmo de não ter alerta,
-- com o custo extra de treinar as pessoas a ignorar.
--
-- ── O desenho novo: um resumo por dia, e individual só para o grave ──────
--
-- **Resumo diário, uma notificação**: quantos, quanto em R$, o mais antigo, e a
-- quebra por etapa. É o que uma pessoa consegue ler antes do café e é o que a
-- faz abrir a tela — onde a lista completa já está, com o chip "parado há Nd" e
-- o filtro de problemas.
--
-- **Individual só para etiqueta MORTA** (vencida ou cancelada): são poucos
-- (três hoje), cada um é frete já pago que não vai virar entrega, e a ação é
-- específica e de um clique — comprar outra etiqueta. Aviso individual só se
-- justifica quando ele nomeia uma ação, não quando ele descreve um estado.
--
-- ⚠️ Continua INTERNO. Nada aqui escreve em `carbo_msg_envios` nem em
-- `carbo_msg_fila`, e nenhum caminho de WhatsApp lê estas tabelas.
--
-- ⚠️ RODE EM BLOCOS, na ordem.
-- ═══════════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — desfazer a enxurrada                                        ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
--
-- ⚠️ Apaga as notificações da primeira rodada ANTES de qualquer outra coisa.
-- Elas já estão no sininho de 30 pessoas, e o resumo do BLOCO 4 não substitui o
-- que já foi entregue — soma.
--
-- Só as desta rodada, pelo `type`: nenhuma outra notificação é tocada.

delete from public.notifications
where type = 'esteira_parado';

-- E o registro de quem "já foi avisado". Sem limpar, o resumo novo acharia que
-- todos os 70 já foram tratados e o primeiro dia viria vazio — silêncio que
-- pareceria "não há nada parado", que é a mentira oposta.
--
-- ⚠️ As de etiqueta morta ficam? NÃO. Elas foram avisadas no formato antigo e
-- apagadas acima; manter a linha as tornaria invisíveis no formato novo.
delete from public.carbo_esteira_alerta;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — limiares medidos, não supostos                              ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
--
-- Baseado na distribuição real de 26/08/2026. O objetivo não é "pegar tudo que
-- está atrasado" — é separar o que saiu do fluxo normal.
--
--   etiqueta     3 → 7   Havia ~40 pedidos com 3-4 dias. Etiqueta de sexta
--                        postada na segunda estoura 3 e é operação certa.
--                        Com 7, sobram 6 — e todos os 6 são reais.
--   nf_emitida   3 → 7   Mesma razão; com 7 sobram 11.
--   confirmado   2 → 3   A NF sai em horas, mas o fim de semana existe.
--   em_transito 15 → 20  O prazo para o N/NE passa de 15 com frequência, e
--                        quatro dos cinco eram Amazon sem integração de status
--                        — atraso de INFORMAÇÃO, não de entrega.
--
-- ⚠️ Estes números são um ponto de partida MEDIDO, não uma verdade. Se o
-- resumo diário continuar grande demais para agir, suba de novo: a tabela
-- existe exatamente para isso, e mexer nela não exige deploy.

update public.carbo_esteira_limite set dias =  7 where etapa = 'etiqueta';
update public.carbo_esteira_limite set dias =  7 where etapa = 'nf_emitida';
update public.carbo_esteira_limite set dias =  3 where etapa = 'confirmado';
update public.carbo_esteira_limite set dias = 20 where etapa = 'em_transito';

-- Quanto sobra com os limiares novos. Este é o tamanho da lista que a operação
-- vai receber todo dia — se não couber numa manhã, suba mais antes do BLOCO 4.
select etapa, count(*) as pedidos, sum(total) as valor,
       min(dias_parado) as menos, max(dias_parado) as mais,
       count(*) filter (where etiqueta_morta) as etiquetas_mortas
from public.carbo_esteira_parados
group by 1 order by 2 desc;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 3 — a função: um resumo, e o individual só para o grave         ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

create or replace function public.carbo_alertar_parados()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  r          record;
  v_mortas   int := 0;
  v_total    int := 0;
  v_valor    numeric := 0;
  v_mais     int := 0;
  v_quebra   text;
  v_titulo   text;
  v_corpo    text;
  v_ja_hoje  boolean;
  v_reais    text;
begin
  -- ── Parte 1: individual, SÓ para etiqueta morta ────────────────────────
  --
  -- Frete pago que não vira entrega, e a ação é uma só: comprar outra etiqueta.
  -- Aviso individual se justifica quando NOMEIA uma ação; quando só descreve um
  -- estado, ele pertence ao resumo.
  for r in
    select p.*
    from public.carbo_esteira_parados p
    left join public.carbo_esteira_alerta a
           on a.bling_id = p.bling_id and a.etapa = p.etapa
    where p.etiqueta_morta
      and (a.bling_id is null
           or a.ultimo_em < now() - (p.dias_para_repetir || ' days')::interval)
    order by p.dias_parado desc
  loop
    -- ⚠️ `,` e `.` LITERAIS no molde, não `G` e `D`: os dois seguem o locale do
    -- banco, que no Supabase é en_US — sairia "R$ 1,234.56" para um time
    -- brasileiro.
    v_reais := replace(replace(replace(
                 to_char(coalesce(r.total, 0), 'FM999,999,990.00'),
                 ',', '#'), '.', ','), '#', '.');

    perform public.notify_time_interno(
      'esteira_etiqueta_morta',
      'Etiqueta morta: ' || coalesce(r.cliente, 'sem nome'),
      coalesce(r.canal, 'canal ?')
        || ' · pedido ' || coalesce(r.pedido_codigo, r.pedido_loja, r.pedido_numero, '?')
        || ' · ' || r.diagnostico
        || ' · há ' || r.dias_parado || ' dias · R$ ' || v_reais,
      'esteira', r.carboze_order_id, null);

    insert into public.carbo_esteira_alerta (bling_id, etapa, dias_no_ultimo)
    values (r.bling_id, r.etapa, r.dias_parado)
    on conflict (bling_id, etapa) do update
      set ultimo_em = now(),
          vezes = public.carbo_esteira_alerta.vezes + 1,
          dias_no_ultimo = excluded.dias_no_ultimo;

    v_mortas := v_mortas + 1;
  end loop;

  -- ── Parte 2: o resumo, uma notificação por dia ──────────────────────────
  select count(*), coalesce(sum(total), 0), coalesce(max(dias_parado), 0)
    into v_total, v_valor, v_mais
  from public.carbo_esteira_parados;

  if v_total = 0 then
    -- ⚠️ Sem parados, NÃO manda "está tudo bem". Notificação diária de rotina é
    -- a forma mais rápida de treinar alguém a não ler o sininho. Ausência de
    -- aviso já significa ausência de problema, e a tela está lá para conferir.
    return jsonb_build_object('resumo', false, 'etiquetas_mortas', v_mortas,
                              'parados_agora', 0);
  end if;

  -- Uma por dia. Sem isso, cada execução manual (ou um cron duplicado) repetiria
  -- o resumo inteiro para 30 pessoas.
  select exists (
    select 1 from public.notifications
    where type = 'esteira_parado_resumo'
      and created_at >= date_trunc('day', now() at time zone 'America/Sao_Paulo')
                         at time zone 'America/Sao_Paulo'
  ) into v_ja_hoje;

  if v_ja_hoje then
    return jsonb_build_object('resumo', false, 'motivo', 'ja mandado hoje',
                              'etiquetas_mortas', v_mortas, 'parados_agora', v_total);
  end if;

  select string_agg(t.linha, ' · ' order by t.ordem)
    into v_quebra
  from (
    select case etapa
             when 'confirmado'  then 1 when 'nf_emitida' then 2
             when 'etiqueta'    then 3 else 4 end as ordem,
           count(*) || ' ' || case etapa
             when 'confirmado'  then 'sem NF'
             when 'nf_emitida'  then 'sem etiqueta'
             when 'etiqueta'    then 'sem postar'
             when 'em_transito' then 'sem entrega'
             else etapa end                        as linha
    from public.carbo_esteira_parados
    group by etapa
  ) t;

  v_reais := replace(replace(replace(
               to_char(v_valor, 'FM999,999,990.00'), ',', '#'), '.', ','), '#', '.');

  v_titulo := v_total || ' pedido' || case when v_total > 1 then 's' else '' end
              || ' parado' || case when v_total > 1 then 's' else '' end
              || ' na esteira';
  v_corpo  := coalesce(v_quebra, '') || ' · R$ ' || v_reais
              || ' · o mais antigo há ' || v_mais || ' dias'
              || ' — abra a esteira e filtre por problemas';

  perform public.notify_time_interno(
    'esteira_parado_resumo', v_titulo, v_corpo, 'esteira', null, null);

  return jsonb_build_object('resumo', true, 'etiquetas_mortas', v_mortas,
                            'parados_agora', v_total, 'valor', v_valor);
end $$;

comment on function public.carbo_alertar_parados is
  'Avisa o time interno sobre pedidos parados. UM resumo por dia (quantos, quanto, o mais antigo) e notificação individual SÓ para etiqueta morta — a primeira versão mandava uma por pedido e produziu 70 avisos × 30 pessoas na estreia, que é a forma mais rápida de ensinar o time a fechar o sininho sem ler. Sem parados, não manda nada: ausência de aviso já significa ausência de problema. ⚠️ INTERNO — nenhum caminho de WhatsApp lê estas tabelas.';


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 4 — rodar e conferir                                            ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

select public.carbo_alertar_parados() as primeira_rodada;

-- ⚠️ De novo: `resumo` tem de vir FALSE com motivo "ja mandado hoje", e
-- `etiquetas_mortas` ZERO. Se o resumo repetir, 30 pessoas recebem duas vezes.
select public.carbo_alertar_parados() as segunda_rodada;

-- O que caiu no sininho agora. Esperado: 1 resumo + 1 por etiqueta morta.
select type, title, body, count(*) as pessoas
from public.notifications
where type in ('esteira_parado_resumo','esteira_etiqueta_morta')
  and created_at > now() - interval '10 minutes'
group by 1, 2, 3
order by 1, 2;

-- ⚠️ Sobrou alguma da versão antiga? Tem de vir 0.
select count(*) as sobras_do_formato_antigo
from public.notifications where type = 'esteira_parado';

-- ⚠️ E a prova de que nada disto virou mensagem para cliente: tem de vir 0.
select count(*) as mensagens_indevidas
from public.carbo_msg_envios
where etapa like 'esteira%' or motivo ilike '%parado%';
