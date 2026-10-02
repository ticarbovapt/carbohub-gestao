-- ═══════════════════════════════════════════════════════════════════════════
-- TRÊS números no mesmo WABA — e a janela de 24 h é por PAR, não por pessoa
--
-- Pedido do dono do processo em 02/10/2026: *"vou precisar colocar mais um
-- número aqui no Carbo atendimento que também é api oficial… vai haver um botão
-- para variar entre os números, hoje tínhamos apenas 1 que era o Da venda à
-- entrega… agora vamos ativar o número que vai ser o de recompra"*.
--
-- Confirmado por ele no painel da Meta, WABA 1777955220017913 (CarboZé):
--
--   98876-9187  CarboZé              serviço/pós-venda  1255756280958635  conectado
--   98174-7452  CarboZé Clube        recompra           1274076859132981  conectado, 2FA ok
--   98175-8713  CarboZé Atendimento  carrinho           1347087218483622  NÃO registrado
--
-- Mesmo WABA ⇒ mesmo token, MESMO webhook, e template aprovado vale para os
-- três. O que separa um número do outro no webhook é `metadata.phone_number_id`.
--
-- ── Por que isto NÃO é um botão na tela ──────────────────────────────────
--
-- ⚠️ A JANELA DE 24 H É POR PAR (nosso número ↔ cliente), e hoje ela mora em
-- `carbo_wa_contatos`, cuja PRIMARY KEY é só `wa_id`. Com dois números vivos,
-- o cliente que responde à OFERTA abriria, no nosso banco, a janela do número
-- de SERVIÇO — e a tela ofereceria texto livre que a Meta recusa com 131047,
-- depois de a pessoa ter escrito a resposta inteira. É exatamente o defeito que
-- o campo de resposta sumindo com a janela fechada existe para evitar.
--
-- ⚠️ E `carbo_wa_mensagens` não tem coluna dizendo por qual número NOSSO a
-- mensagem passou — o webhook nem lê o `metadata` que a Meta manda. Sem ela as
-- duas caixas são uma só, e o atendimento não consegue separar "cliente com
-- problema na entrega" de "cliente respondendo campanha". Esse argumento não é
-- meu: está escrito na `20260893`, que já separou serviço de comercial do lado
-- da EVOLUTION, com estas palavras — *"quem bloqueia por causa da campanha não
-- pode perder o aviso de entrega junto"*.
--
-- ── O que esta migração faz, e o que ela DELIBERADAMENTE não faz ─────────
--
-- Ela é INERTE: cria o cadastro e a coluna, com backfill. Nada lê nenhum dos
-- dois ainda. As chaves (`carbo_wa_contatos`, `_atendimento`, `_resolvidas`) e
-- as views ficam para a fase 2 — e a fase 2 só pode ser escrita a partir do
-- `pg_get_viewdef`, nunca da migração que criou a view. Essa regra custou um
-- `42P16` na `20261019`, e o erro foi SORTE: com as colunas batendo, o
-- `create or replace` teria removido em silêncio um gate de segurança que
-- ninguém sabia que existia.
--
-- ⚠️ RODE EM BLOCOS, e o BLOCO 0 UMA CONSULTA DE CADA VEZ — o SQL Editor mostra
-- só o resultado da ÚLTIMA consulta do bloco.
-- ═══════════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 0 — MEDIR. Uma de cada vez. É daqui que sai a fase 2.           ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- (a) O tamanho do que vai ser remarcado. Tudo isto é do número de SERVIÇO,
--     porque até hoje só existia ele.
-- select (select count(*) from public.carbo_wa_mensagens)   as mensagens,
--        (select count(*) from public.carbo_wa_contatos)    as contatos,
--        (select count(*) from public.carbo_wa_atendimento) as atendimentos,
--        (select count(*) from public.carbo_wa_notas)       as recados,
--        (select count(*) from public.carbo_wa_agendadas)   as agendadas,
--        now() at time zone 'America/Sao_Paulo'             as agora_brasilia;

-- (b) ⚠️ A PROVA de que o `metadata` chega e nunca foi lido. Se vier algum
--     `phone_number_id` DIFERENTE de 1255756280958635, mensagem de outro número
--     já entrou na caixa única — e aí o backfill do BLOCO 2 está errado e eu
--     preciso saber ANTES.
-- select payload -> 'metadata' ->> 'phone_number_id' as numero_que_recebeu,
--        count(*) as linhas,
--        min(ocorrido_em) as primeira, max(ocorrido_em) as ultima
-- from public.carbo_wa_mensagens
-- group by 1 order by 2 desc;

-- (c) ⚠️ O `metadata` pode não estar no payload gravado — o webhook grava a
--     MENSAGEM, e o `metadata` fica no nível do `change.value`. Se a (b) vier
--     tudo null, é isto: o dado nunca foi guardado, e o backfill por constante
--     é a única opção honesta. Esta consulta mostra o que REALMENTE tem lá.
-- select jsonb_object_keys(payload) as chave, count(*)
-- from public.carbo_wa_mensagens
-- where payload is not null
-- group by 1 order by 2 desc;

-- (d) ⚠️ AS VIEWS DA FASE 2, LIDAS DO BANCO. Cole a saída inteira no chat —
--     eu NÃO vou escrevê-las a partir das migrações do repo. A `20261019`
--     levou `42P16` por fazer isso, e o erro foi sorte: com as colunas batendo,
--     o `create or replace` teria apagado em silêncio um gate de segurança.
-- select c.relname,
--        c.reloptions,
--        pg_get_viewdef(c.oid, true) as definicao
-- from pg_class c
-- join pg_namespace n on n.oid = c.relnamespace
-- where n.nspname = 'public'
--   and c.relname in ('carbo_wa_conversas','carbo_msg_fila')
-- order by c.relname;

-- (e) O estado dos templates que vão mudar de canal. ESPERADO hoje:
--     recompra e os três carrinho com `canal_envio = 'evolution'` e
--     `meta_template_nome` NULO — é isso que a fase 3 preenche.
-- select etapa, canal_envio, instancia, meta_template_nome, meta_status,
--        meta_idioma, meta_variaveis, ativo
-- from public.carbo_msg_templates
-- order by etapa;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — o CADASTRO dos números                                      ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- ⚠️ A CHAVE É O `phone_number_id` DA META, não um uuid nosso. É ele que chega
-- no webhook (`metadata.phone_number_id`) e é ele que vai na URL de envio
-- (`/{phone_number_id}/messages`). Um id sintético criaria uma segunda
-- identidade para o mesmo número, com um mapa no meio para divergir — o erro do
-- `bling_nf_id`, onde duas coisas disputavam a mesma coluna.
--
-- ⚠️ CADASTRO, nunca CHECK nem constante no código. Número novo é um INSERT,
-- sem deploy — a lição de "plataforma nova entra em TRÊS CHECKs". E o
-- `phone_number_id` estava escrito em QUATRO edge functions
-- (`whatsapp-meta`, `-responder`, `-midia`, `-agendadas`), todas com o mesmo
-- `?? "1255756280958635"` de reserva: quatro cópias de um cadastro.

create table if not exists public.carbo_wa_numeros (
  -- O id da Meta. 15 dígitos hoje, mas é texto: identificador não é número.
  phone_number_id text primary key,
  -- Como ele se chama no painel da Meta. É o que a pessoa reconhece.
  rotulo          text not null,
  -- O número humano, para a tela — nunca para enviar.
  numero_exibicao text,
  -- ⚠️ A FUNÇÃO é o que o sistema usa para rotear, e ela é única: duas linhas
  -- com `funcao = 'recompra'` fariam a escolha depender da ordem que o
  -- PostgREST devolvesse, que é o defeito do mapa de SKU indexado só por SKU.
  funcao          text not null
                  check (funcao in ('servico','recompra','carrinho')),
  -- ⚠️ NASCE DESLIGADO, e isso não é cautela: o 98175-8713 está com o nome em
  -- análise e NÃO registrado na Cloud API. Enviar por número não registrado
  -- falha com erro genérico da Graph API, e erro genérico manda procurar no
  -- lugar errado. Ligar é um UPDATE, depois de registrar.
  ativo           boolean not null default false,
  -- Separado de `ativo` de propósito: "não registrei ainda" e "registrei e não
  -- quero usar" são respostas diferentes, e colapsá-las esconde qual é o
  -- trabalho que falta. Mesma razão de `e_online` ter TRÊS estados na
  -- `bling_lojas`.
  registrado      boolean not null default false,
  -- A cor do chip na tela. Escolhida por MEDIDA, não por gosto — ver a lição
  -- do laranja do `atendimento` contra o âmbar do Ops.
  cor             text,
  ordem           int not null default 100,
  criado_em       timestamptz not null default now()
);

-- ⚠️ Uma função, um número ATIVO. Índice PARCIAL: número desligado pode
-- repetir a função (é o caso de substituir um número por outro sem apagar o
-- histórico do antigo), mas dois ativos para a mesma função fariam o roteamento
-- escolher por acaso.
create unique index if not exists carbo_wa_numeros_funcao_ativa
  on public.carbo_wa_numeros (funcao) where ativo;

comment on table public.carbo_wa_numeros is
  'Os numeros da Cloud API da Meta no WABA 1777955220017913. A CHAVE e o phone_number_id da META, nunca um uuid nosso: e ele que chega no webhook (metadata.phone_number_id) e e ele que vai na URL de envio. CADASTRO, nunca constante em codigo — o id estava escrito em QUATRO edge functions com o mesmo valor de reserva. `ativo` nasce FALSE porque numero nao registrado na Cloud API falha com erro generico da Graph API; `registrado` e separado de `ativo` porque "nao registrei" e "registrei e nao quero usar" sao respostas diferentes. Indice unico PARCIAL em funcao: dois numeros ativos para a mesma funcao fariam o roteamento escolher por acaso.';

comment on column public.carbo_wa_numeros.funcao is
  'servico = avisos da esteira (pos-venda). recompra = a regua de 30 dias. carrinho = a recuperacao de checkout. A funcao e o que o sistema usa para rotear; o rotulo e so para a tela.';

-- ⚠️ Os três do painel, com o estado REAL de cada um em 02/10/2026. O terceiro
-- entra DESLIGADO e NÃO REGISTRADO — ele existe aqui para aparecer na lista de
-- trabalho, não para ser usado. Cadastro que esconde o que falta é cadastro que
-- parece feito.
insert into public.carbo_wa_numeros
  (phone_number_id, rotulo, numero_exibicao, funcao, ativo, registrado, cor, ordem)
values
  ('1255756280958635', 'CarboZé',             '(84) 98876-9187', 'servico',  true,  true,  '#10B981', 10),
  ('1274076859132981', 'CarboZé Clube',       '(84) 98174-7452', 'recompra', true,  true,  '#8B5CF6', 20),
  ('1347087218483622', 'CarboZé Atendimento', '(84) 98175-8713', 'carrinho', false, false, '#F59E0B', 30)
on conflict (phone_number_id) do nothing;

-- ── RLS ──────────────────────────────────────────────────────────────────
-- ⚠️ Leitura só para o TIME INTERNO. O portal de lojas e o de licenciados usam
-- a MESMA tabela `profiles`, e esta tabela diz quais números a Carbo opera.
-- Sem policy de escrita: número novo entra por migração ou pela service role.
alter table public.carbo_wa_numeros enable row level security;

drop policy if exists carbo_wa_numeros_leitura on public.carbo_wa_numeros;
create policy carbo_wa_numeros_leitura on public.carbo_wa_numeros
  for select to authenticated
  using (public.carbo_e_time_interno());

grant select on public.carbo_wa_numeros to authenticated;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — a coluna, com backfill. AINDA INERTE: ninguém lê.           ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- ⚠️ A ORDEM importa: a coluna nasce NULA, o backfill preenche, e só DEPOIS
-- ela vira `not null`. Criar `not null default '1255…'` pareceria o mesmo e
-- não é: o default ficaria valendo para mensagem FUTURA, e aí mensagem do
-- número de recompra que chegasse antes do webhook aprender a gravar seria
-- carimbada como serviço — calada, e indistinguível de dado bom.

alter table public.carbo_wa_mensagens
  add column if not exists numero_id text;

alter table public.carbo_wa_agendadas
  add column if not exists numero_id text;

-- Backfill. Tudo o que existe é do número de serviço, porque até hoje só
-- existia ele — e o BLOCO 0 (b) é quem confirma isso antes de rodar.
update public.carbo_wa_mensagens
   set numero_id = '1255756280958635'
 where numero_id is null;

update public.carbo_wa_agendadas
   set numero_id = '1255756280958635'
 where numero_id is null;

-- ⚠️ SEM `not null` ainda, e sem FK. Pôr os dois agora quebraria a escrita do
-- webhook, que hoje não manda a coluna — e o webhook é o que não pode parar:
-- o que ele não gravar existe só no celular do cliente. O aperto vem na fase 2,
-- junto com o deploy que passa a preencher. Mudança que fecha uma porta e
-- mudança que entrega a chave vão no MESMO passo, com a chave primeiro.

comment on column public.carbo_wa_mensagens.numero_id is
  'Por qual NUMERO NOSSO a mensagem passou (metadata.phone_number_id da Meta). Sem ela as caixas dos tres numeros viram uma so, e o atendimento nao separa "problema na entrega" de "respondendo campanha". Backfill = 1255756280958635 porque ate 02/10/2026 so existia esse numero. ⚠️ Ainda sem not null e sem FK de proposito: apertar antes de o webhook preencher pararia a gravacao, e o que o webhook nao grava existe so no celular do cliente.';

comment on column public.carbo_wa_agendadas.numero_id is
  'Por qual numero NOSSO a mensagem agendada vai sair. Mesma razao da coluna em carbo_wa_mensagens.';


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 3 — CONFERÊNCIA. Uma de cada vez.                               ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- (a) Os três no cadastro. ESPERADO: 3 linhas, e o `carrinho` com
--     ativo = false E registrado = false. Se ele vier ativo, alguém ligou um
--     número que a Cloud API ainda não registrou e o envio vai falhar com erro
--     genérico.
-- select phone_number_id, rotulo, numero_exibicao, funcao, ativo, registrado, ordem
-- from public.carbo_wa_numeros order by ordem;

-- (b) ESPERADO: zero linhas sem número, e o total batendo com a (a) do BLOCO 0.
-- select numero_id, count(*) from public.carbo_wa_mensagens group by 1 order by 2 desc;

-- (c) ⚠️ A trava da função única. ESPERADO: zero linhas. Linha aqui é dois
--     números ativos disputando a mesma função, e o roteamento escolheria por
--     acaso.
-- select funcao, count(*) from public.carbo_wa_numeros
-- where ativo group by funcao having count(*) > 1;
