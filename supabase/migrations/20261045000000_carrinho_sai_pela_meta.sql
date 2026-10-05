-- ═══════════════════════════════════════════════════════════════════════════
-- O carrinho abandonado sai pela Meta, pelo número da LOJA
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Pedido do dono do processo em 05/10/2026: a terceira pipeline vai para a API
-- oficial, como a esteira e a recompra, pelo número que era "CarboZé
-- Atendimento" e passa a se chamar "CarboZé Loja" (98175-8713,
-- 1347087218483622). Templates aprovados no mesmo WABA:
--
--   carrinho_1  carrinho_lembrete_1  primeiro_nome · produtos · link_carrinho
--   carrinho_2  carrinho_lembrete_2  primeiro_nome · valor · produtos · link_carrinho
--   carrinho_3  carrinho_lembrete_3  primeiro_nome · link_carrinho
--
-- ⚠️ ESTA MIGRAÇÃO NÃO LIGA NADA. Ela configura, e deixa DUAS travas fechadas:
-- `ativo = false` nos três templates, e o número desligado no cadastro até o
-- teste provar que ele fala. Ligar é o BLOCO 3, à parte, com o time na mesa.
--
-- ⚠️ `valor` leva `formato: brl`. A fila entrega número cru (`numeric(12,2)`)
-- e o caminho antigo (Evolution, `kanban-n8n`) formatava à mão; sem isto a Meta
-- mandaria "Seu carrinho de 149.00". O formatador mora em
-- `_shared/metaTemplate.ts` e só age onde o cadastro DECLARA — nenhum dos seis
-- da esteira usa `valor`, então nada muda neles.
--
-- ⚠️ Os FALLBACKS são escolha de texto, conferida lendo a frase inteira:
--   primeiro_nome → "tudo bem"   "Oi, tudo bem! Aqui é do CarboZé"
--   produtos      → "os produtos que você escolheu"
--   valor         → "compras"    "Seu carrinho de compras continua salvo"
--   link_carrinho → NENHUM, de propósito: sem o link a mensagem não serve para
--                   nada, e o envio ESPERA o dado em vez de mandar torto.
--
-- ⚠️ ORDEM DE DEPLOY: o `formato` só é lido pelo `whatsapp-meta` que já tem o
-- `brl`. Rodar isto antes do deploy não manda nada errado — os templates estão
-- desligados —, mas o TESTE só deve ser feito depois do Actions terminar.


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — os três templates passam a ser da Meta (continuam DESLIGADOS)║
-- ╚═══════════════════════════════════════════════════════════════════════╝

update public.carbo_msg_templates set
  canal_envio        = 'meta',
  meta_template_nome = 'carrinho_lembrete_1',
  meta_idioma        = 'pt_BR',
  meta_status        = 'APPROVED',
  meta_botao_url_de  = null,
  numero_id          = '1347087218483622',
  meta_variaveis     = '[
    {"nome": "primeiro_nome", "de": "primeiro_nome", "fallback": "tudo bem"},
    {"nome": "produtos",      "de": "produtos",      "fallback": "os produtos que você escolheu"},
    {"nome": "link_carrinho", "de": "link_carrinho"}
  ]'::jsonb,
  texto = $t$Oi, {{primeiro_nome}}! Aqui é do CarboZé 💚⛽

Vi que você começou um pedido e não finalizou:
{{produtos}}

Tá tudo salvo do jeito que você deixou. Pra concluir é só clicar aqui:
{{link_carrinho}}

Ficou com dúvida sobre o produto? Me chama aqui que eu te ajudo.$t$
where etapa = 'carrinho_1';

update public.carbo_msg_templates set
  canal_envio        = 'meta',
  meta_template_nome = 'carrinho_lembrete_2',
  meta_idioma        = 'pt_BR',
  meta_status        = 'APPROVED',
  meta_botao_url_de  = null,
  numero_id          = '1347087218483622',
  meta_variaveis     = '[
    {"nome": "primeiro_nome", "de": "primeiro_nome", "fallback": "tudo bem"},
    {"nome": "valor",         "de": "valor",         "fallback": "compras", "formato": "brl"},
    {"nome": "produtos",      "de": "produtos",      "fallback": "os produtos que você escolheu"},
    {"nome": "link_carrinho", "de": "link_carrinho"}
  ]'::jsonb,
  texto = $t$Oi, {{primeiro_nome}}! Passando aqui de novo 💚⛽

Seu carrinho de {{valor}} continua salvo:
{{produtos}}

Pra finalizar é rapidinho: {{link_carrinho}}

Se preferir, me responde aqui que eu fecho o pedido com você.$t$
where etapa = 'carrinho_2';

update public.carbo_msg_templates set
  canal_envio        = 'meta',
  meta_template_nome = 'carrinho_lembrete_3',
  meta_idioma        = 'pt_BR',
  meta_status        = 'APPROVED',
  meta_botao_url_de  = null,
  numero_id          = '1347087218483622',
  meta_variaveis     = '[
    {"nome": "primeiro_nome", "de": "primeiro_nome", "fallback": "tudo bem"},
    {"nome": "link_carrinho", "de": "link_carrinho"}
  ]'::jsonb,
  texto = $t$Oi, {{primeiro_nome}}! Última mensagem sobre esse carrinho, prometo 💚⛽

Se ainda quiser, ele tá aqui: {{link_carrinho}}

Se não for a hora, sem problema. É só me avisar que eu não te chamo mais sobre isso.$t$
where etapa = 'carrinho_3';


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — o número vira "CarboZé Loja" e entra na tela                 ║
-- ║ ⚠️ SÓ depois do teste `hello_world` chegar pelo número                 ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
--
-- `registrado` e `ativo` são perguntas diferentes (a lição dos três estados de
-- `e_online`): um diz "a Meta aceita enviar por ele", o outro "queremos usar".
-- Ligar o número NÃO dispara nada — quem segura o envio é o `ativo` dos
-- templates. O que muda é o seletor da tela de Conversas ganhar a terceira
-- caixa.

update public.carbo_wa_numeros
   set rotulo = 'CarboZé Loja', registrado = true, ativo = true
 where phone_number_id = '1347087218483622';


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 3 — LIGAR. À parte, quando decidir.                              ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
--
-- ⚠️ O MARCO ZERO ANDA JUNTO, e aqui isso é o desenho, não remendo. Carrinho
-- com telefone que nunca recebeu mensagem fica em "aberto" PARA SEMPRE — não
-- há prazo de validade —, e o `inicio_em` é de quando a tabela nasceu. Ligar
-- sem mexer nele manda "Vi que você começou um pedido" para todo carrinho
-- desde setembro, de uma vez. O carrinho mais velho que 24 h vira `historico`:
-- continua visível no quadro, fora do automático (campanha, se quiser, é
-- decisão à parte).
--
-- ⚠️ Isto NÃO contradiz o "nunca mover o marco zero" da dedução de estoque.
-- Lá ele é filtro de data competindo com o ledger; aqui ele é, por definição
-- na própria tabela, "o que impede a primeira sincronização de virar rajada".
-- E só é seguro porque nenhum carrinho está no meio da sequência (medir
-- `carbo_msg_envios` antes): `historico` vem ANTES de `msg1`/`msg2` no CASE da
-- pipeline, então um carrinho já avisado anterior ao marco PERDERIA as próximas
-- mensagens.
--
-- update public.carbo_carrinho_config set inicio_em = now() - interval '24 hours' where id;
-- update public.carbo_msg_templates set ativo = true
--  where etapa in ('carrinho_1','carrinho_2','carrinho_3');
