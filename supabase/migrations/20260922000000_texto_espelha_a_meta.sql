-- ═══════════════════════════════════════════════════════════════════════════
-- Os seis textos aprovados viram ESPELHO
--
-- Templates aprovados pela Meta em 22/08/2026. Os corpos abaixo são cópia
-- literal do que foi aprovado, lido das telas de edição do Gerenciador DEPOIS
-- da aprovação — não do que foi submetido.
--
-- ── ⚠️ Isto não é "o texto da mensagem". É o espelho dele ─────────────────
--
-- A partir da aprovação, a redação que o cliente lê é a da Meta. Este campo
-- existe para conferência na tela `/ecommerce/mensagens`, e a tela o mostra
-- travado nas etapas `canal_envio = 'meta'`, com o aviso de onde se edita de
-- verdade. O `useSalvarTemplate` também deixou de mandar `texto` no update
-- dessas etapas — a tela trava, isto é o cinto.
--
-- Sem esta migração o campo continuaria com a redação antiga, do tempo da
-- Evolution: com a linha "Acompanhe aqui: {{link_rastreio}}", que não existe em
-- nenhum dos templates aprovados. Quem abrisse a tela leria uma mensagem que o
-- cliente nunca recebeu — a mesma doença do `quotePdf.ts` no `mkt`, que passou
-- meses mostrando uma coisa e entregando outra sem dar erro.
--
-- ⚠️ O texto é byte a byte igual ao aprovado, SEM a linha do botão. O botão
-- não faz parte do corpo do template; ele é um componente à parte, e descrevê-lo
-- aqui dentro já faria deste campo outra coisa que não um espelho. A tela mostra
-- o botão separado, a partir de `meta_botao_url_de`.
--
-- Nada aqui muda o que é enviado: quem envia lê `meta_template_nome` e
-- `meta_variaveis`, nunca `texto`.
-- ═══════════════════════════════════════════════════════════════════════════

update public.carbo_msg_templates set texto =
  'Olá, {{primeiro_nome}}. Aqui é do CarboZé.' || chr(10) ||
  'Recebemos seu pedido {{pedido}} e ele já está em separação.' || chr(10) ||
  'Assim que a nota fiscal for emitida e a postagem confirmada, envio por aqui o código de rastreio.' || chr(10) ||
  'Qualquer dúvida, é só responder esta mensagem.'
where etapa = 'confirmado';

update public.carbo_msg_templates set texto =
  'Boas notícias, {{primeiro_nome}}: a nota fiscal do seu pedido {{pedido}} já foi emitida (NF {{nf}}).' || chr(10) ||
  'O próximo passo é a coleta pela transportadora. Assim que ela retirar o pedido, aviso você por aqui.'
where etapa = 'nf_emitida';

update public.carbo_msg_templates set texto =
  'Atualização do seu pedido, {{primeiro_nome}}: o pedido {{pedido}} está embalado e aguardando a coleta da {{transportadora}}.' || chr(10) ||
  'Código de rastreio: {{rastreio}}' || chr(10) ||
  'A movimentação começa a aparecer assim que a transportadora fizer a retirada.'
where etapa = 'etiqueta';

update public.carbo_msg_templates set texto =
  'Seu pedido está a caminho, {{primeiro_nome}}. 📦' || chr(10) ||
  'Pedido: {{pedido}}' || chr(10) ||
  'Transportadora: {{transportadora}}' || chr(10) ||
  'Código de rastreio: {{rastreio}}' || chr(10) ||
  'Previsão de entrega: {{previsao}}' || chr(10) ||
  'Aviso novamente quando ele sair para entrega.'
where etapa = 'em_transito';

update public.carbo_msg_templates set texto =
  'Chegou o dia, {{primeiro_nome}}: seu pedido {{pedido}} saiu para entrega hoje.' || chr(10) ||
  'Código de rastreio: {{rastreio}}' || chr(10) ||
  'Se puder, deixe alguém no endereço para receber — sem ninguém no local, a entrega retorna e pode atrasar alguns dias.'
where etapa = 'saiu_entrega';

update public.carbo_msg_templates set texto =
  'Entrega confirmada, {{primeiro_nome}}. ✅ Seu pedido {{pedido}} foi entregue.' || chr(10) ||
  'Deu tudo certo com a entrega? Se faltou algum item ou o produto chegou com qualquer avaria, responda aqui que a gente resolve.' || chr(10) ||
  'Estando tudo certo, obrigado pela confiança no CarboZé. Bons quilômetros.'
where etapa = 'entregue';

-- ── A aprovação, espelhada ────────────────────────────────────────────────
--
-- Daqui para frente quem mantém esta coluna é o webhook
-- (`message_template_status_update`). Este update é o ponto de partida: os seis
-- foram aprovados ANTES de o webhook estar assinado.

update public.carbo_msg_templates
set meta_status = 'APPROVED', meta_status_em = now(), meta_motivo_recusa = null
where canal_envio = 'meta'
  and meta_template_nome in (
    'pedido_confirmado_separacao','nota_fiscal_emitida','pedido_aguardando_coleta',
    'pedido_a_caminho','pedido_saiu_para_entrega','pedido_entregue');


-- ── Conferência ───────────────────────────────────────────────────────────

-- (a) Os seis, com o começo do texto. `em_transito` tem de começar com
--     "Seu pedido está a caminho" — se começar com "Oi, {{primeiro_nome}}!",
--     é a redação antiga, do tempo da Evolution.
select etapa, meta_template_nome, meta_status, left(texto, 60) as comeco
from public.carbo_msg_templates where canal_envio = 'meta' order by etapa;

-- (b) ⚠️ Nenhum texto de etapa `meta` pode citar variável que não existe no
--     template aprovado. `link_rastreio` e `link_nota` são as duas do modelo
--     antigo: se aparecerem aqui, o espelho não é espelho.
select etapa, texto from public.carbo_msg_templates
where canal_envio = 'meta'
  and (texto like '%link_rastreio%' or texto like '%link_nota%');
