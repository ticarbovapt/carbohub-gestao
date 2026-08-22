-- ═══════════════════════════════════════════════════════════════════════════
-- O balão do aviso mostra a MENSAGEM, não o nome da etapa
--
-- ── Correção de uma decisão minha, e por que ela estava errada ────────────
--
-- Na migração anterior o aviso da esteira aparecia na conversa pelo TÍTULO da
-- etapa ("Em trânsito — com o rastreio"). O raciocínio: a redação mora na Meta
-- desde a aprovação, e reproduzi-la aqui criaria uma segunda versão para
-- divergir — a doença do `quotePdf.ts`.
--
-- O receio era legítimo, a conclusão não. Quem atende precisa conferir o que o
-- cliente REALMENTE recebeu: qual código de rastreio foi mandado, qual
-- transportadora, qual previsão. Com o título, ele sabe que houve aviso e não
-- sabe o que ele dizia — e vai perguntar ao cliente uma informação que nós
-- mandamos.
--
-- E o dado existe. Não é caso de "não dá para saber":
--
--   carbo_msg_templates.texto    o corpo APROVADO, espelhado e travado na tela
--   carbo_msg_envios.payload     os parâmetros exatos que foram para a Meta
--
-- Substituir um no outro é a MESMA operação que a Meta faz para montar a
-- mensagem. Não é uma segunda redação: é a primeira, resolvida.
--
-- ⚠️ E isso só é seguro porque o espelho é mantido. Se alguém editar
-- `carbo_msg_templates.texto` de uma etapa `meta`, a tela passa a mostrar um
-- texto que o cliente não recebeu. É por isso que o campo está travado na tela
-- E o `useSalvarTemplate` não manda `texto` no update dessas etapas — as duas
-- travas existem, e agora elas protegem também esta reconstrução.
-- ═══════════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — a reconstrução                                              ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

create or replace function public.carbo_wa_texto_do_template(
  p_texto   text,     -- o corpo aprovado, com {{marcadores}}
  p_payload jsonb     -- o que foi POSTado no Graph API
) returns text
language plpgsql immutable as $$
declare
  v_texto text := p_texto;
  v_param jsonb;
begin
  -- ⚠️ Sem payload não há reconstrução, e devolver o texto com os marcadores
  -- crus seria pior que devolver nada: quem atende leria "{{rastreio}}" e
  -- pensaria que foi ISSO que o cliente recebeu. NULL deixa a view cair no
  -- título, que é honesto.
  if p_texto is null or p_payload is null then return null; end if;

  for v_param in
    select jsonb_array_elements(c -> 'parameters')
    from jsonb_array_elements(p_payload -> 'template' -> 'components') c
    where c ->> 'type' = 'body'
  loop
    -- O formato é NOMEADO (`parameter_name`), então o casamento é por nome e
    -- não por posição — trocar rastreio por número do pedido é impossível aqui.
    if v_param ? 'parameter_name' then
      v_texto := replace(
        v_texto,
        '{{' || (v_param ->> 'parameter_name') || '}}',
        coalesce(v_param ->> 'text', '')
      );
    end if;
  end loop;

  return v_texto;
end $$;

comment on function public.carbo_wa_texto_do_template is
  'Reconstrói a mensagem que o cliente recebeu, substituindo os parâmetros do payload no corpo aprovado. NÃO é uma segunda redação: é a mesma substituição que a Meta faz. Devolve NULL sem payload — texto com marcadores crus faria quem atende achar que o cliente recebeu "{{rastreio}}".';


-- O sufixo do botão, quando o template tem um. Ele não faz parte do corpo, mas
-- faz parte do que o cliente recebeu — e é justamente o código que o
-- atendimento vai querer conferir.
create or replace function public.carbo_wa_botao_do_template(p_payload jsonb)
returns text language sql immutable as $$
  select c -> 'parameters' -> 0 ->> 'text'
  from jsonb_array_elements(coalesce(p_payload -> 'template' -> 'components', '[]'::jsonb)) c
  where c ->> 'type' = 'button'
  limit 1;
$$;

comment on function public.carbo_wa_botao_do_template is
  'O sufixo do botão URL que foi enviado — o código de rastreio. A base (rastreio.carboze.com.br/rastreio/) está no template aprovado, não no envio.';


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — a view                                                      ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
--
-- `botao_rastreio` entra no FIM: `create or replace view` aceita acrescentar
-- coluna ao final, nunca renomear nem reordenar.

create or replace view public.carbo_wa_conversas
with (security_invoker = true) as
with tudo as (
  select
    m.wamid, m.wa_id, m.direcao, m.tipo, m.texto, m.midia_id,
    m.ocorrido_em, m.responde_a,
    null::bigint as envio_bling_id,
    null::text   as envio_etapa,
    null::text   as botao
  from public.carbo_wa_mensagens m

  union all

  select
    v.wamid, v.wa_id, 'saida', 'template',
    -- A mensagem de verdade. Cai no título só quando falta payload — pedido
    -- antigo, de antes de a coluna existir.
    coalesce(
      nullif(public.carbo_wa_texto_do_template(t.texto, v.payload), ''),
      t.titulo, v.etapa),
    null::text,
    v.enviado_em, null::text,
    v.bling_id, v.etapa,
    public.carbo_wa_botao_do_template(v.payload)
  from public.carbo_msg_envios v
  left join public.carbo_msg_templates t on t.etapa = v.etapa
  where v.canal = 'meta'
    and v.wamid is not null
    and v.wa_id is not null
    and v.enviado_em is not null
    and v.status in ('enviado','entregue','lido')
)
select
  x.wamid,
  x.wa_id,
  c.nome                                     as cliente,
  x.direcao,
  x.tipo,
  x.texto,
  x.midia_id,
  x.ocorrido_em,
  coalesce(x.envio_bling_id, e.bling_id, u.bling_id) as bling_id,
  coalesce(x.envio_etapa,    e.etapa,    u.etapa)    as sobre_a_etapa,
  (x.envio_bling_id is not null or e.bling_id is not null) as vinculo_exato,
  x.botao                                    as botao_rastreio
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
) u on true;

comment on view public.carbo_wa_conversas is
  'A conversa completa: os avisos da esteira (carbo_msg_envios) e as mensagens do webhook (carbo_wa_mensagens), na mesma linha do tempo. O aviso mostra a MENSAGEM que o cliente recebeu, reconstruída do corpo aprovado + os parâmetros enviados — quem atende precisa conferir o codigo de rastreio que foi mandado, nao so saber que houve aviso. ⚠️ Só entra aviso que a Meta ACEITOU e que foi pelo canal meta.';

grant select on public.carbo_wa_conversas to authenticated;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 3 — conferência                                                 ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- (a) ⚠️ O TESTE QUE IMPORTA: nenhum aviso pode sobrar com marcador cru. Se
--     aparecer linha aqui, a reconstrução falhou e quem atende leria
--     "{{rastreio}}" achando que foi isso que o cliente recebeu. Tem de vir ZERO.
select count(*) as com_marcador_cru
from public.carbo_wa_conversas
where tipo = 'template' and texto like '%{{%';

-- (b) A mensagem reconstruída, do jeito que a tela mostra. Compare com o que
--     chegou no celular do cliente: tem de ser igual, palavra por palavra.
select ocorrido_em, cliente, sobre_a_etapa, botao_rastreio, texto
from public.carbo_wa_conversas
where tipo = 'template'
order by ocorrido_em desc limit 10;

-- (c) ⚠️ A trava que sustenta tudo isto: o espelho não pode ter divergido. Se
--     alguma etapa `meta` tiver texto com variável do modelo antigo, a
--     reconstrução mostra algo que o cliente não recebeu. Tem de vir ZERO.
select count(*) as espelho_divergente
from public.carbo_msg_templates
where canal_envio = 'meta'
  and (texto like '%link_rastreio%' or texto like '%link_nota%');
