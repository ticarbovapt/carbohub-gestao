-- ═══════════════════════════════════════════════════════════════════════════
-- Assuntos do atendimento — o que os clientes falam, medido (06/11/2026)
--
-- Pedido do dono do processo: "verificar todas as conversas para identificar
-- os assuntos … o que seria reclamação e dividir por não recebeu, não
-- funcionou etc, o que seria elogio … pra gente poder mensurar", numa aba
-- nova do Painel do atendimento.
--
-- A lista de assuntos NÃO foi inventada: saiu da leitura das 2.286 mensagens
-- de cliente de 22/08 a 06/11/2026 (1.038 conversas, os três números), e cada
-- regra foi conferida contra elas antes de entrar aqui.
--
--   carbo_wa_assunto_grupos     os 6 grupos (reclamação, pedido, dúvida,
--                               comercial, elogio, outros) — CADASTRO
--   carbo_wa_assuntos           os assuntos e a REGRA de cada um — CADASTRO
--   carbo_wa_msg_assunto        o CACHE: a classificação de cada mensagem
--   carbo_wa_assuntos_janela()  a leitura que as telas usam (cache + o que falta)
--   carbo_atendimento_assuntos()          a aba (jsonb, tudo agregado)
--   carbo_atendimento_assunto_clientes()  quem falou de um assunto (paginado)
--
-- ⚠️ ASSUNTO É CADASTRO, nunca código: regra nova ou corrigida é um UPDATE em
-- `carbo_wa_assuntos.padrao`, sem deploy. O gatilho confere a expressão
-- (expressão inválida é RECUSADA na gravação, nunca derruba o painel) e sobe a
-- versão — o cache se refaz sozinho na rodada seguinte do cron.
--
-- ⚠️ Uma mensagem pode ter MAIS DE UM assunto ("chegou certo, como uso?" é
-- entrega E dúvida), mas UM por grupo: dentro do grupo vence a `ordem`. E
-- RECLAMAÇÃO SUPRIME ELOGIO ("chegou tudo certo, só faltou um frasco" não é
-- elogio). A conta principal da tela é CLIENTE, não mensagem: um cliente
-- irritado manda 15 "não recebi" e é um problema, não quinze.
--
-- ⚠️ E isto CORRIGE o "pede resposta" do painel (20261148): resposta
-- automática de outra empresa ("Seja bem-vindo à ADM transportes…"),
-- "chegou tudo certo", "ainda tenho 4 frascos", "já comprei no Mercado Livre"
-- contavam como mensagem esperando resposta — e inflavam as PERDIDAS. Medido
-- nas 2.286: ver o BLOCO 6. Só o painel muda; a tela de Conversas continua com
-- a regra de palavras (`pareceEncerramento`), que é espelho só da parte de
-- palavras.
--
-- Rode em BLOCOS, na ordem. Nada aqui apaga nem altera dado de mensagem: são
-- tabelas e funções NOVAS, mais a troca do corpo de `carbo_atendimento_rodadas`
-- (BLOCO 3, que confere antes de trocar).
-- ═══════════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 0 — conferir o terreno (só leitura)                             ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- Espera: UMA linha com as quatro colunas TRUE.
--   painel_instalado = false  → a 20261148 não está no banco; rode-a antes.
--   rodadas_como_no_repo = false → alguém mexeu na função depois da 20261148;
--                         o BLOCO 3 recusa trocar — me mande o resultado.
select
  exists (select 1 from pg_proc where proname = 'carbo_atendimento_painel') as painel_instalado,
  coalesce((select md5(regexp_replace(prosrc, '\s+', '', 'g')) = 'ca6b6aa1c22bff2a68c9cffe1ceed0ba'
              from pg_proc where proname = 'carbo_atendimento_rodadas'), false) as rodadas_como_no_repo,
  not exists (select 1 from pg_class where relname = 'carbo_wa_assuntos') as cadastro_ainda_nao_existe,
  exists (select 1 from pg_extension where extname = 'pg_cron') as tem_pg_cron;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — o CADASTRO de grupos e assuntos                             ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

create table if not exists public.carbo_wa_assunto_grupos (
  codigo  text primary key,
  rotulo  text not null,
  ordem   int  not null,
  cor     text not null
);

create table if not exists public.carbo_wa_assuntos (
  codigo      text primary key,
  grupo       text not null references public.carbo_wa_assunto_grupos(codigo),
  rotulo      text not null,
  -- Expressão regular (Postgres, ARE) sobre o texto NORMALIZADO por
  -- `carbo_wa_texto_chave`: minúsculo, sem acento, pontuação virando espaço
  -- (o "?" fica), "n" sozinho virando "nao" e "sem avaria" virando "semproblema".
  padrao      text not null,
  -- Prioridade: dentro do grupo vence a MENOR; entre grupos, todos valem.
  ordem       int  not null,
  -- Sozinho, este assunto pede resposta? ("Chegou tudo certo" não pede.)
  -- ⚠️ "?" na mensagem sempre pede, seja qual for o assunto.
  pede        boolean not null default true,
  -- Casou, é só ele (resposta automática de outra empresa, spam).
  exclusivo   boolean not null default false,
  -- Só vale se NADA mais casou (cumprimento, "ok obrigado").
  so_se_vazio boolean not null default false,
  -- Códigos de assunto OU de grupo que somem quando este aparece.
  suprime     text[] not null default '{}',
  -- O "tema" grosso do painel antigo (fila, perdidas), para referência.
  tema        text not null default 'outros',
  ativo       boolean not null default true,
  atualizado_em timestamptz not null default now()
);

-- A versão do cadastro: o cache só vale se foi feito com a versão de agora.
create table if not exists public.carbo_wa_assunto_versao (
  id     boolean primary key default true check (id),
  versao int not null default 1,
  em     timestamptz not null default now()
);
insert into public.carbo_wa_assunto_versao (id) values (true) on conflict (id) do nothing;

-- ⚠️ A expressão é conferida NA GRAVAÇÃO: regra quebrada não entra. Sem isto,
-- um parêntese a mais num UPDATE derrubaria o painel inteiro na próxima leitura.
create or replace function public.carbo_wa_assuntos_valida()
returns trigger language plpgsql set search_path = public as $$
begin
  begin
    perform '' ~ new.padrao;
  exception when others then
    raise exception 'Assunto %: expressão inválida (%).', new.codigo, sqlerrm using errcode = '22023';
  end;
  new.atualizado_em := now();
  return new;
end $$;
drop trigger if exists trg_carbo_wa_assuntos_valida on public.carbo_wa_assuntos;
create trigger trg_carbo_wa_assuntos_valida
  before insert or update on public.carbo_wa_assuntos
  for each row execute function public.carbo_wa_assuntos_valida();

create or replace function public.carbo_wa_assuntos_nova_versao()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.carbo_wa_assunto_versao set versao = versao + 1, em = now() where id;
  return null;
end $$;
drop trigger if exists trg_carbo_wa_assuntos_versao on public.carbo_wa_assuntos;
create trigger trg_carbo_wa_assuntos_versao
  after insert or update or delete on public.carbo_wa_assuntos
  for each statement execute function public.carbo_wa_assuntos_nova_versao();

-- O cache. Uma linha por mensagem de cliente classificada.
create table if not exists public.carbo_wa_msg_assunto (
  wamid    text primary key,
  versao   int not null,
  assuntos text[] not null,
  em       timestamptz not null default now()
);

-- ⚠️ Leitura do cadastro: time interno (a tela pode mostrar os rótulos).
-- ESCRITA: nenhuma policy — muda-se pelo SQL Editor, como a config fiscal.
-- O cache e a versão não têm policy nenhuma: só as funções (dono) os leem.
alter table public.carbo_wa_assunto_grupos enable row level security;
alter table public.carbo_wa_assuntos       enable row level security;
alter table public.carbo_wa_assunto_versao enable row level security;
alter table public.carbo_wa_msg_assunto    enable row level security;
drop policy if exists carbo_wa_assunto_grupos_le on public.carbo_wa_assunto_grupos;
create policy carbo_wa_assunto_grupos_le on public.carbo_wa_assunto_grupos
  for select to authenticated using ((select public.carbo_e_time_interno()));
drop policy if exists carbo_wa_assuntos_le on public.carbo_wa_assuntos;
create policy carbo_wa_assuntos_le on public.carbo_wa_assuntos
  for select to authenticated using ((select public.carbo_e_time_interno()));
grant select on public.carbo_wa_assunto_grupos, public.carbo_wa_assuntos to authenticated;
revoke all on public.carbo_wa_assunto_versao, public.carbo_wa_msg_assunto from anon, authenticated;

-- A carga inicial. ⚠️ `on conflict do nothing`: rodar de novo NÃO desfaz uma
-- regra que alguém já corrigiu no banco.
insert into public.carbo_wa_assunto_grupos (codigo, rotulo, ordem, cor) values
  ('reclamacao', 'Reclamações',       1, '#DC2626'),
  ('pedido',     'Pedido e entrega',  2, '#2563EB'),
  ('duvida',     'Dúvidas',           3, '#7C3AED'),
  ('comercial',  'Comercial',         4, '#D97706'),
  ('elogio',     'Elogios',           5, '#16A34A'),
  ('outros',     'Outros',            6, '#64748B')
on conflict (codigo) do nothing;;

insert into public.carbo_wa_assuntos (codigo, grupo, rotulo, ordem, pede, exclusivo, so_se_vazio, suprime, tema, padrao) values
-- ── OUTROS que vencem tudo: não é o cliente falando ─────────────────────────
('resposta_automatica', 'outros', 'Resposta automática ou spam', 10, false, true, false, '{}', 'outros',
 'agradec\w* (o |a |pelo |pela |por )?((o )?seu |(a )?sua )?(contato|mensagem|preferencia|opcao)\M'
 || '|obrigad[oa] (pelo|por) (seu )?contat|como (podemos|posso) (te |lhe )?(ajudar|atender)|em que (posso|podemos) (te |lhe )?ajudar'
 || '|nao (estamos|estou) disponive|fora do horario|(nosso|o nosso) horario|horario de (atendimento ?$|funcionamento|plantao)|horario de atendimento (e |segunda|seg)|atendemos de seg|atendimento por agendamento'
 || '|retornare(i|mos)|responderei|responderemos|entrare(i|mos) em contato|lhe responder|te respondo|retorno (em seguida|assim que|em breve|logo)|darei a atencao'
 || '|\mseja(s)? bem ?vind|bem ?vind[oa]s? (a|ao|à) |deixe (seu|sua) (recado|mensagem)|receber sua mensagem|mensagem e importante'
 || '|temu com|continue setting up your account|whatsapp manager|ja estamos abertos|^(teste|testando|testando tudo|oi tetse|ta recebendo ?\?)$'
 || '|deu tudo certo com a entrega\? se faltou|o proximo passo e a coleta|a movimentacao comeca a aparecer|boas noticias [a-z]+ a nota fiscal|atualizacao do seu pedido [a-z]+ o pedido|entrega confirmada [a-z]+ seu pedido'),

-- ── RECLAMAÇÕES ─────────────────────────────────────────────────────────────
('faltou_item', 'reclamacao', 'Veio faltando ou veio errado', 100, true, false, false, '{elogio,status_pedido}', 'produto',
 'falt(ou|ando) (um|uma|o|a|os|as|\d|algum|item|frasco|sache|produto|unidade|de|da|do)\M|falta (um|uma|\d) (frasco|sache|unidade|item|produto|kit)'
 || '|(veio|vieram|chegou|chegaram|chego|recebi) (so|somente|apenas) |(so|somente|apenas) (veio|vieram|chegou|chego|chegaram|recebi) (apenas |so )?(o|a|os|as|um|uma|\d)\M'
 || '|(comprei|comprado|comprada|paguei|pedi|adquiri|compra (foi )?de)\M.{0,40}(veio|vieram|chegou|chegaram|entregue|entregaram|foi entregue) (so |somente |apenas )?\d'
 || '|(veio|vieram|chegou|chegaram) \d+ .{0,25}(e nao|ao inves|mas comprei|mas paguei)|veio errad|entregaram (tres|outra|outro|uma)|bl[uo]z?s?inha'
 || '|nao chegou junto|(que )?(tambem |tbm )?(encomendei|pedi|comprei) nao (chegou|chegaram|veio)|ess[ea]s? nao (chegou|chegaram|me enviaram|veio)|nao me enviaram|(so|somente) me (mandaram|enviaram)|(unidades|frascos|kits?|saches) que nao (enviaram|vieram|chegaram)'
 || '|(pacote|pedido|kit|compra) (extra|da promocao|principal).{0,60}nao (chegou|recebi)|(segunda|segundo|outra|outro) (compra|caixa|pedido|kit) nao chegou'),

('produto_diferente', 'reclamacao', 'Produto diferente ou suspeita de falso', 105, true, false, false, '{elogio,status_pedido}', 'produto',
 '(nao (e|eh|parece|seja)|se (e|eh)|sera que (e|eh)|e mesmo|ser) original|falsificad|pirata|\moriginal\M.{0,20}\?|consistencia|sem data de (fabricacao|validade)|diluiram|diluid[oa]|mais fraco|a ?cor (foi )?diferente|cor .{0,30}(cheiro|diferente)'),

('avaria', 'reclamacao', 'Chegou violado, vazando ou amassado', 110, true, false, false, '{elogio,status_pedido}', 'produto',
 'vaz(ou|ando|ament|ad)|\mvasa|violad|amassad|molhad|manchad|avariad|\mavaria|(veio|chegou|pacote|caixa|encomenda) (todo |toda |um pouco )?abert|fita (lacre )?.{0,15}cortad|pela metade|destru|cheiro (muito )?forte|derramad|quebrad|rasgad|danificad'),

('entrega_falhou', 'reclamacao', 'Consta entregue e não recebeu', 120, true, false, false, '{elogio,status_pedido}', 'entrega',
 '(consta|diz|dizendo|informa|fala|falando|mostra|mostrou|aparece|status|rastre\w*|colocaram)\M.{0,60}entregue.{0,80}(nao|nada|ninguem)'
 || '|entregue.{0,40}(mas|porem|so que) .{0,20}(nao|nada)|(foi )?entregue (a|para|pra) (quem|algum|alguem)|quem recebeu|entregue onde|entregaram (em|no|na) .{0,40}(nada a ver|errad|outr)'
 || '|nao (chamou|tocou)|jogou (por cima|o pacote)|(duas|2) tentativas|nao (fez|fizeram) tentativa|devolveu (para|pra) a agencia|nao foi atendido no local'
 || '|nao (foi possivel|pode ser|pode) entreg|nao (conseguiram|conseguiu) entregar|recebi no outro endereco|falar com o entregador|com quem deixaram|comprovante de entrega|em que endereco'
 || '|nao foi nada entregue|nao confirmo a entrega|entregaram onde|(para|pra|a) quem (foi )?entreg|estava fechado|nao encontrou ninguem|camera|endereco (tava|estava|esta) errado'),

('cobranca_duplicada', 'reclamacao', 'Cobrança ou pedido em dobro (roleta)', 130, true, false, false, '{elogio,status_pedido}', 'pagamento',
 'cobr\w*.{0,40}(duas|2|dupl|dobr|indevid)|(duas|2) (vezes|cobrancas)|(duas|dois|2) (compras|pedidos)|duplicad|duplicidade|roleta'
 || '|(segundo|outro) pedido.{0,40}cancel|mais (algum|alguma|de um) pedido no meu nome|\m119\M.{0,60}\m14[25]\M|\m14[25]\M.{0,60}\m119\M'),

('nao_funcionou', 'reclamacao', 'Não funcionou ou piorou', 140, true, false, false, '{elogio,status_pedido}', 'produto',
 'nao (funcionou|funciona como|presta|economizou|alterou|melhorou|resolveu|fez (nada|efeito|diferenca)|deu (resultado|efeito)|vi (nenhuma |nenhum )?(mudanca|diferenca|melhora|resultado)|(esta|ta) dando (de )?conta)'
 || '|nenhuma (mudanca|melhora|diferenca)|aument\w* o consumo|gastando mais|beb(er|endo|e) mais|autonomia.{0,20}caiu|aditivos melhores|(o|a) (da|do) \w+ (e|eh) (bem |muito )?melhor|insatisfeito'),

('pagamento', 'reclamacao', 'Problema no site ou no pagamento', 150, true, false, false, '{elogio}', 'pagamento',
 'cart(ao|oes).{0,50}(recus|invalid|nao (aceit|aprov|passa|permit|liber)|erro|errad|problema|estranho|bloque|negad)|(recus|nao aceit|nao aprov|bloque)\w*.{0,30}cart(ao|oes)'
 || '|pix.{0,40}(invalid|erro|fora do padrao|nao (funciona|gera|passa))|erro.{0,30}(pix|pagamento|compra|cartao)|nao (esta |ta )?finaliz\w* (a )?compra'
 || '|site.{0,30}(instavel|problema|erro|travad|nao (finaliz|abre|funciona))|deu (erro|problema) (na|no|em) (compra|pagamento|cartao|pix)|boleto|parcel|sem juros|divid\w* no cartao|nome do cartao'
 || '|(vezes|parcelad\w*) e nao a vista|saiu (pgto |pagamento )?a vista|jogava no valor maior|tentei comprar.{0,60}nao consegui|desconto.{0,40}(nao aparece|sumiu|nao deu certo)|nao encontrei a possibilidade|recusou o pedido|problema (no|com o) (meu )?cartao|nao (da|tem como) (pra |para )?ver (os )?pedidos|nao tem cadastro'),

('sem_resposta', 'reclamacao', 'Cobra resposta ou solução', 197, true, false, false, '{elogio}', 'reclamacao',
 'ninguem (que )?(me )?(responde|responda|atende|atenda|fala|fale)|nao (estao |estou sendo )?(me )?respond|nao me responderam|(vcs|voces|vc) nao respond|nao atende'
 || '|(quero|gostaria de|aguardo|consigo|preciso de|preciso|cade|teria|tenho) (uma |alguma |a |sua )?resposta|nem retorno|nenhum retorno|sem retorno|tem alguem|alguem (que possa|pra|para) (me )?(responder|atender|ajudar)|(por onde|como) (consigo|falo|posso falar).{0,30}(atendimento|alguem|atendente)'
 || '|falar com (alguem|um atendente|atendente)|passar (pra|para) um atendente|com quem eu falo|responda aqui que a gente resolve|cade voces|tentando falar com (voces|vcs)|esperando (um |o |seu )?retorno|aguardando (sua|a) resposta|^[ ?]*\?[ ?]*$|mande?i (um )?e ?mail|chamei no (instagram|insta)|aqui no whatsapp|como (ficamos|fico)\M|^e entao ?\?|resolver isso|resolvam|o que foi resolvido|gostaria de resolver|^por favor$'),

('embalagem', 'reclamacao', 'Embalagem ruim ou sugestão', 170, true, false, false, '{elogio,status_pedido}', 'produto',
 'sache\w*.{0,40}(horrive|ruim|dificil|mela|derrama|vaza|pessim)|saquinhos? .{0,25}(horrive|ruim)|dosador|tampa|embalagem (muito )?(ruim|pessima)|deixou a desejar|\d+ ?ml (e|eh) (muito |mto )?pouco|nao quero em sache|(prefir|preferia|melhor seria|podia ser|poderia ser|deveria ser).{0,30}(potinho|pote|frasco)|galao|recipiente|garrafa pet|sugest|sugiro|manuseio|estudo de melhorias|ruim (para|pra) (por|colocar)'),

('atraso', 'reclamacao', 'Atraso, ainda não chegou', 180, true, false, false, '{elogio,status_pedido}', 'entrega',
 '(ainda )?nao (chegou|chego|veio|foi (entregue|enviad\w*|despachad\w*|postad\w*|coletad\w*))\M|nao recebi (o |a )?(meu |minha )?(produto|pedido|encomenda|compra|mercadoria|pacote|nada|ainda)|nao recebi ?$|ainda nao (recebi|tive a entrega)'
 || '|ate (agora|hoje|o momento|entao) (nada|nao)|nada (ainda|da entrega|do (meu )?(pedido|produto)|da minha encomenda|de encomenda)|demor(ado|ando|ou)\M|demora (muito|heim|hein|mesmo|tanto)|muito demor|que demora|atras(o|ad|ou)|prazo.{0,40}(passou|venc|nao (cumpr|se concretiz))|data ja passou|ja passou'
 || '|(hoje|hj) (ja )?(e|eh|sao)? ?(dia )?\d{1,2}\M|cade (o |a )?(meu|minha) (pedido|compra|produto|encomenda)|nunca mais vai entregar|nao saiu|parad[oa]'
 || '|nem foi (postad|despachad|recolhid)|nao foi nem (postad|despachad)|pq ainda nao|por ?que ainda nao|paguei .{0,15}a mais pra chegar|ultima vez que compro|urgente|urgencia|era ate o dia|data de entrega (em|era|\d)|tinha data de entrega|prometeu entregar|prometendo|nao chega (ate|a tempo)|nao era (ate|em) \d|dias uteis\?|nao (despachou|enviou|postou|enviaram|despacharam|postaram)|nada foi entregue|nao (vao|vai) (mesmo )?entregar|nao recebi ate|nenhuma (atualizac|noticia)|(pedido|compra) foi (feit[oa]|realizad[oa]) (e pago )?(em|dia|no dia)'),

('rastreio', 'reclamacao', 'Rastreio não funciona', 190, true, false, false, '{elogio,status_pedido}', 'entrega',
 'nao (estou |to )?(consigo|conseguindo|consegui|da para|da pra|aparece|tem) .{0,25}(rastre|acompanhar)|rastre\w*.{0,40}(nao|erro|invalid|parad|pessimo|nada)|codigo .{0,30}(nao|invalid|errad)'
 || '|nao (esta )?(atualiza|ativo)|sem atualizac|nao (foi |esta |ta )?(sendo )?encontrad|aguardando postagem|nao recolhido|melhor ?rastreio.{0,30}(pessimo|ruim)|cade o codigo|nao recebi o (codigo|rastre)|consig\w* (o )?rastre|nao aparece o pacote'),

('ameaca', 'reclamacao', 'Ameaça (Procon, Reclame Aqui, polícia, redes)', 195, true, false, false, '{elogio}', 'reclamacao',
 'procon|reclame aqui|advogad|justica|defesa do consumidor|processar|denunci|redes sociais|campanha contra|delegad|policia|ocorrencia policial|estelionat|crime|providencias cabiveis'),

('outra_reclamacao', 'reclamacao', 'Outra reclamação', 199, true, false, false, '{elogio}', 'reclamacao',
 'reclama|chatead|lamentavel|pessim|horrivel|absurdo|desrespeito|vergonha|lesad|perdi dinheiro|nao serve|chatos|pqp|\mcai (num|em um|no) golpe|puro golpe|(isso|isto) (e|eh) (um )?golpe|deu (esse |um |o mesmo )?problema|sem qualidade|incompetencia|falha no sistema|confuso|estou com (um )?problema|(tive|teve) um problema|nao deu (nada )?certo'),

-- ── PEDIDO E ENTREGA ────────────────────────────────────────────────────────
('cancelamento', 'pedido', 'Cancelar, reembolso ou reenvio', 300, true, false, false, '{}', 'reclamacao',
 'cancel|reembols|estorn|devolu|devolv|(dinheiro|pagamento) de volta|ressarc|nao quero mais|desconsidera|chave pix|pix cpf|acidentalmente|sem querer|por engano|compras? errad|enviar outr[ao]|reenvi|nova entrega'),

('alterar_dados', 'pedido', 'Endereço ou dados de entrega', 310, true, false, false, '{}', 'entrega',
 '\mcep\M|\m\d{5} ?\d{3}\M|(numero|nao) da (minha )?casa|casa (e|eh) \d|endereco.{0,30}(errad|corret|alter|e de|e rua)|alterar.{0,40}(endereco|numero|cep)|coloquei.{0,30}errad'
 || '|(deixar|deixa|deixe) (com|no|na) (o |a )?(zelador|porteiro|vizinho|portaria)|aos cuidados de|\mrua \w+.{0,40}\d|apartamento|\mbairro\M|@(gmail|hotmail|outlook|yahoo)|so mim liga|deixar para o dia|pede para deixar|meus dados|mesmo pacote|pode (jogar|deixar) n|garagem|portaria'),

('status_pedido', 'pedido', 'Onde está o pedido, prazo', 320, true, false, false, '{}', 'entrega',
 '(sobre|saber|posicao|informac|andamento|atualiza|noticia|status|como esta|parecer|referente)\w*.{0,30}(pedido|compra|encomenda|entrega|mercadoria|pacote)|meu pedido ?\??$|(onde|aonde) (esta|anda|ta) (o |a )?(meu|minha)|meu pedido onde'
 || '|quando (chega|vai chegar|receberei|recebo|vou receber|vai ser|sera)|previsao|qual (e )?(o )?prazo|prazo (de|para|pra) (entrega|chegar|envio)|tem prazo|\mprazo\M ?\?|quanto tempo|quantos dias|(ja )?(foi|esta) (enviad|despachad|postad|na transportadora)|despachad|em separacao'
 || '|como (posso |eu |que eu )?acompanh|acompanhar (o |meu )?pedido|codigo de rastre|rastreamento ?\??$|(enviar|passar|mandar) o rastre|chega amanha|entregaram hoje|conseguiram enviar|como e feito o envio|pelos correios'
 || '|^(cz ?\d{6,}|\d{12,}|[a-z]{2} ?\d{9} ?br|pedido \w+|codigo de rastreio \d+)$|melhorrastreio|(vao|vai) (mandar|enviar)|que dia (irei|vou|vai|eu)|postar|aguardo receber|aguardando (a |minha )?(entrega|encomenda)|esperando (a |minha )?encomenda|aguardando minha encomenda|alguma (posicao|novidade|atualizacao|noticia)|tempo (estimado|de entrega)|codigo (de )?rastre\w* \d|\mmeu pedido\M|(pode|poderia|consegue) (me )?confirmar|(dia|hora) da entrega|numero do rastreio|qdo vem|quando vem'),

('confirmou_compra', 'pedido', 'Avisou que comprou ou pagou', 330, false, false, false, '{}', 'pagamento',
 '^(?!.*(mercado ?livre|\m(no|pelo|via|do|na) (ml|m l)\M|shop+e|shoppe|amazon|em loja|na loja)).*('
 || 'ja (comprei|fiz (a|o) (compra|pedido|pix|pagamento|comprar)|efetuei|finalizei|conclui|paguei|terminei|fechei)|(fiz|efetuei|realizei) (o|a) (pix|pagamento|compra)'
 || '|pagamento (feito|efetuado|realizado)|comprovante(?! de entrega)|concluid|finalizad|^(feito|pago|pago ok|ok pago)$|compra efetiva|finalizei (sim|o pedido|meus pedidos)|efetuei (sim )?o pagamento|eu efetuei|comprob|recibo|^ok pago$)'),

-- ── DÚVIDAS ─────────────────────────────────────────────────────────────────
('como_usar', 'duvida', 'Como usar, quanto colocar', 500, true, false, false, '{}', 'uso',
 'como (eu |q |que )?(usa|uso|usar|ussa|aplica|utiliza|faco (pra|para) usar|fasso)|forma de us|modo de us|instruc|uso correto'
 || '|(quant[oa]s?|qual a quantidade|que quantidade)\M.{0,15}(sache|chache|ml|frasco|litro|dose|tanque|diesel|gasolina)|quanto (eu )?(coloco|colocar|uso|devo)|coloco quanto|colocar quanto|quantidade (do produto|de carboze|colocad)|(sache|chache|ml|frasco|dose)\w* .{0,40}(por|cada|para|pra) (tanque|litro)'
 || '|dosagem|proporc(ao|oes)|percentual (que|para|pra) (devo )?colocar|percentual no tanque|a cada (quantos )?(tanque|abastec|litro)|(antes|depois) de (abastecer|encher)|tanque (tem q|tem que|precisa).{0,20}(vazio|cheio)|frequencia|constante ou'
 || '|lavar o tanque|\d+ ?ml (por|para|pra|a cada|cada) (litro|tanque|\d+ ?l)|trata quantos|(pra|para) quantos (litros|tanque)|(colocar|coloco) (mais|metade|meio|dois|2)|tanque (de|vai|e de|pega).{0,15}\d|\d+ ?litros?\M|quantos sache|e usado \d|so despejar|se colocar mais|apos (eu )?ter abastecido|depois de abastecer|antes de abastecer|qual (a )?quantidade|quantidades|^pra usar|colocar prime?ro'),

('combustivel_veiculo', 'duvida', 'Serve para diesel, flex, moto ou carro?', 510, true, false, false, '{}', 'uso',
 'diesel|\mflex\M|etanol|alcool|gasolina (e|ou|aditivada)|(todos|qualquer|qq) (os )?combust|(moto|carro|veiculo)s?\M.{0,30}(diferen|serve|mesmo|tambem|pode)'
 || '|(serve|da certo|pode (ser )?usa\w*|compativel|funciona|ajudaria|posso usar|pode usar|posso colocar|usar normal).{0,40}(carro|moto|veiculo|motor|jet ski|popa|carburad|pcx|cb ?\d|jeep|fusion|santa fe|toro|virtus|passat|outlander|jimny)'
 || '|carburad|jet ski|motor(es)? de popa|motocross|moto (zero|nova|e zero)|perde (a )?garantia|meu carro (e|eh)\M|tenho (um|uma) (jeep|carro|moto|asx|land|cb)|s ?500|so gasolina|somente na gasolina|pedi certo|pra flex|nao tenho moto|nem moto|moto (pra|para|e) .{0,10}carro|diferen.{0,40}(moto|carro)|^(carro|moto)\M|carro a (gasolina|diesel|alcool)|\mmeu e (carro|moto)|na moto e no carro|da moto (para|pra) o carro'),

('duvida_produto', 'duvida', 'O que faz, funciona mesmo?', 495, true, false, false, '{}', 'uso',
 'o que (ele |o produto |isso |esse produto )?(faz|melhora)|(funciona|funcione) mesmo.*\?|isso funciona|realmente (funciona|faz).*\?|faz (limpeza|o que promete)|economia de combust|gera economia'
 || '|(mais |maiores )?informac\w* (sobre|do|de|a respeito) (o |do |vosso |seu |esse |este )?(produto|carboze|aditivo)|saber mais (sobre|do|a respeito)|duvida (sobre|do|de|com) (o )?produto|documentac|detergente|dispersante|catali[sz]ador|poluente|(voces|vcs|vc) garant|melhor que o|racional|funcoes|residuos'
 || '|nao (entendi|consegui entender).{0,20}o que|mecanico.{0,30}(falou|disse|\musa\M|\musou\M)|faz realmente|que ele faz'),

('onde_comprar', 'duvida', 'Loja física, onde comprar', 530, true, false, false, '{}', 'onde_comprar',
 'loja fisica|onde (compro|encontro|posso comprar|vende|acho|tem)|tem onde comprar|revendedor (na|em|aqui)|ponto(s)? de venda|(vende|vendem|tem) .{0,15}postos?|algum posto'
 || '|na minha cidade|(aqui|na) (em|na|no) [a-z]+ (tem|vende)|vende (pelo|no|na) (mercado|ml|shop)|vc vende pelo|aqui na bahia|fabrica de voces|onde fica a fabrica|loja (que venda|aqui)|produto eu encontro|onde na \w+\?'),

('desconfianca', 'duvida', 'Desconfiança, acha que é golpe', 540, true, false, false, '{}', 'confianca',
 'golpe|confiavel|confianca|insegur|enganad|site oficial|nao tem contato.{0,20}anuncio|achei que (era|teria)|pensei que (era|tinha)|seguro comprar|fraude|desconfi|posso confiar'),

-- ── COMERCIAL ───────────────────────────────────────────────────────────────
('revenda', 'comercial', 'Quer revender ou comprar em quantidade', 600, true, false, false, '{}', 'onde_comprar',
 'revend|represent|distribu|atacado|em quantidade|valor diferenciado|meus grupos|oficina.{0,80}(divulg|clientes)|ser vendedor|mais de um kit|varios kits|comercio|minha loja|meu posto'),

('preco', 'comercial', 'Preço, promoção e kits', 605, true, false, false, '{}', 'pagamento',
 '\mcaro\M|puxado|mais barat|mais em conta|(mercado ?livre|\m(no|pelo|via|do|na) ml\M|shop+e).{0,40}(\d|barat|preco|igual|frete)|achei .{0,25}(por|a) \d|\d+ reais|\m(qual (e )?(o )?|o |esse |este |novo )valor\M|valor (do|da|de|atual|com desconto)\M|preco(?! da gasolina| do combustivel)|quanto (esta|custa|sai|fica)'
 || '|promoc|cupom|desconto|oferta|opcoes de kits|quais (opcoes|kits)|nao (quero|preciso) (comprar )?(o kit|de \d+)|(so|quero so) (um|1|\d) (para|pra) testar|so quero \d|quero so|nao o de 100|orcamento|brinde|quero aquele|de frasco|combo|produto liquido|preciso de \d kit'),

('recompra', 'comercial', 'Quer comprar de novo', 610, true, false, false, '{}', 'outros',
 'vamos repor|bora repor|(^|\m(?!nao\M)\w+ )quero mais|compr(ar|arei|o) (mais|novamente|outra|de novo|sempre)|outra compra|renovar a compra|link (para|pra) (a |fazer )?(outra )?compra|ja estou precisando'
 || '|vou ter que comprar|posso fazer compras? por aqui|como (faco|posso|consigo) (pra |para )?comprar|tem como enviar|vou querer|como posso comprar|nao tenho mais|\macabou\M(?! de)|vou comprar (para|pra) meu|quero (comprar|pedir|o carboze)|comprar por aqui|por aqui e mais facil'),

('comprou_outro_canal', 'comercial', 'Comprou no Mercado Livre, Shopee ou loja', 603, false, false, false, '{}', 'outros',
 '(comprei|compro|adquiri|efetuei|finalizei|fechei|pedido|compra|pedi|faco)\w*.{0,40}(mercado ?livre|\m(no|pelo|via|do|na) (ml|m l)\M|shop+e|shoppe|amazon|em loja|na loja|mercado pago)|^(no |ou |pelo |na )?(mercado ?livre|ml|shop+e|shoope|amazon)$'),

('ainda_tem', 'comercial', 'Ainda tem produto', 620, false, false, false, '{}', 'outros',
 'ainda (tenho|tem|restam)\M|tenho (ainda|bastante)|tenho (\d+|dois|tres|um|uma) (ainda|frascos?|saches?|unidades?)\M|(rodo|rodado|uso) (muito )?pouco|nao rodo muito|quando (estiver acabando|acabar|terminar)|assim que (precisar|terminar|acabar|tiver acabado)|so em (novembro|dezembro|janeiro)|acho que semana que vem|vou salvar aqui|^ainda nao$|\mja tenho\M|por enquanto|nao usei'),

('vai_comprar_depois', 'comercial', 'Vai comprar depois', 640, false, false, false, '{}', 'outros',
 '(cair|entrar) (o )?dinheiro|cartao (liberar|virar|fechar|estara|bom)|fechar o cartao|melhor dia no cartao|mes que vem|faltou grana|comeco do mes|(amanha|mais tarde|segunda|sexta).{0,30}(compro|finaliz|efetiv|vou comprar)'
 || '|vou (efetivar|finalizar|fazer o pedido|comprar sim|avaliar|pensar)|irei finalizar|quando estiver em|vamos fechar o pedido|estou avaliando|avaliando concluir|depois eu vejo|depois digo|(estou|to|ainda) em duvida|nao estou com cartao|estou atras|farei em pix|vou pagar'),

('sem_interesse', 'comercial', 'Sem interesse ou desistiu', 650, false, false, false, '{}', 'outros',
 'nao (tenho )?interesse|nao (vou|quero) comprar|nao preciso mais|desisti|no momento nao|nao (vou comprar )?no momento|usei outro produto|vou aguardar um pouco|nao conheco o produto|eu nao preciso'),

-- ── ELOGIOS ─────────────────────────────────────────────────────────────────
('entrega_ok', 'elogio', 'Chegou tudo certo', 700, false, false, false, '{}', 'entrega',
 '(chegou|chego|chegaram|recebi|recebido|veio|entregue|entrega|entregou)\M.{0,25}(tudo )?(certo|certinho|certim|direitinho|bem|perfeit|ok|em ordem|tranquilo|bacana|conforme|integro|sucesso)'
 || '|(tudo|ta tudo|esta tudo|td|tdo|ta td|tido) (certo|certinho|ok|em ordem|perfeito|conforme|crt|tranquilo|direitinho|dentro do esperado)|^(chegou|recebi|entregue|entrege)\M'
 || '|produto recebido|entrega (ok|confirmada|recebida|feita|dentro do prazo)|bem embalad|semproblema|antes da data|mais rapido que|chegou perfeitamente|ja chegou|sim chegou|chegou sim|sim recebi|recebi sim|confirmo (a )?entreg'
 || '|(material|mercadoria|encomenda) (recebid|chegou)|ja localizei|tava no vizinho|estava na caixa de correio|acabou de chegar|recebi hoje|retirei.{0,20}correios|pegar a guarita|recebido agora|^(?!.*\?).*deu (tudo )?certo|foi sim|(^| )chegou ?$|^chego agora|^(?!.*\?).*(foi|ja foi|tudo|pedido|ok) entregue|entreguei|confirmo (a )?(entreg|emtreg)|deu sim|essa eu recebi|produto entregue|^deu$'),

('produto_aprovado', 'elogio', 'Gostou do produto', 710, false, false, false, '{}', 'uso',
 'gostei|gostou|aprovad|aprovei\M|recomend|satisfeit|(otimo|excelente|muito bom|bom demais|maravilhos\w*) (o )?produto|produto (de )?(otima|excelente|boa) qualidade'
 || '|(ficou|esta|ta) (bastante |mais |muito )?(economic|disposta|rapid|forte)|(motor|carro|moto|consumo|desempenho).{0,20}melhorou|melhorou (o |a )?(desempenho|consumo|motor|rendimento)'
 || '|segunda vez que|vou indicar|indicarei|funciona(ndo)? (muito )?bem|resultado (bom|otimo|favoravel|positivo)|produto e bom'),

('atendimento_elogiado', 'elogio', 'Elogiou o atendimento', 720, false, false, false, '{}', 'outros',
 'obrigad\w* (pela|por|pelo) (atencao|agilidade|gentileza|carinho|tudo|ajuda|alinhamento|atualizac|aviso|me manter|paciencia)|parabens|vendedor honesto|empresa confiavel'
 || '|(bom|otimo|excelente) atendimento|so o fato de (esta|estar) sendo atendido|agradeco (a|pela) atencao|grat[oa] pela atencao|desde o momento da compra|pelo servico|atencao e carinho|grat[oa] pel[oa] (aviso|alinhamento)'),

('vai_testar', 'elogio', 'Recebeu e vai testar', 730, false, false, false, '{}', 'uso',
 'vou (testar|usar|experimentar|colocar|utilizar|provar|ver se|fazer o teste|abastecer)|vamos (testar|ao teste|aos testes|ao uso|usar|acompanhar|a melhoria)|agora (e|eh)? ?(so |a )?(testar|usar|colocar|provar|experimentar)'
 || '|(fazer|faco|falta fazer) (o )?teste|espero que (funcione|resolva|seja|sim|realmente|o produto)|tomara que|ver (o )?(resultado|desempenho|se (realmente|funciona))|ja (comecei a usar|coloquei|estou (usando|testando))'
 || '|irei testar|fase de testes|(doido|ansioso) (pra|para) (testar|utilizar)|depois (mando|dou|relato|informo)|feedback|fit back|me aguardem|so falta (agora )?(eu )?(experimentar|o carro)|so usar e|faco a avaliacao|mando avaliacao|(pra|para) (experimentar|testar)'),

-- ── OUTROS (só quando nada acima casou) ─────────────────────────────────────
('saudacao', 'outros', 'Só cumprimento', 900, true, false, true, '{}', 'outros',
 '^((oi+e?|ola+|opa|alo|e ?ai|eae|bo[am]+|boa|dia+|diaa+|tarde|noite|tudo|bem|bom|como|vai|amigos?|familia|pessoal|b|td|fera|boim|bia|sim|e|voce|vc|ol|ok|abencoad[oa]|por|deus|\?+)( |$))+$|^bom[- ]?dia|^boa[- ]?(tarde|noite)$'),

('confirmacao', 'outros', 'Ok, obrigado', 910, false, false, true, '{}', 'outros',
 '^(( ?)(ok+|okay|oki|blz|blza+|beleza|certo|combinado|fechado|obrigad[oa]s?|obrigaduu+|obg|obgd|obgdo|brigad[oa]|bgdo|vlw|valeu+|grat[oa]|gratidao|recebid[oa]s?|recebi|entendi|perfeito|perfeitamente|otimo|excelente|show|top|joia|massa|positivo|confirmado|confirmo|tks|sim|isso|tudo|bem|bom|boa|muito|ta|de|tranquilo|maravilha|certinho|deus|abencoe|amem|agradecid[oa]|agradeco|pela|pelo|atencao|retorno|o|a|e|mesmo|desde|ja|aguardo|aguardando|no|fico|ficou|estou|em|entendo|ate|proxima|mais|uma|vez|marav8|otimo|fico no aguardo|tchau|abraco|abracos|dia|tarde|noite|ola|oi|opa|por|nada|ata|viu|amigao|amigo|bons|negocios|k+|disposicao|pode|deixar|positiva|vamos|esperar|entao|esse|compra|vou|confirmar|dar|olhada|para|vcs|chamo)( |$))+$|^$'),

('pedido_ajuda', 'duvida', 'Pediu ajuda ou informação', 590, true, false, true, '{}', 'uso',
 '(tirar|tira) (umas |uma |algumas )?duvida|(tenho|tem|uma|outra|minha|algumas|umas|com uma) duvida|\mduvidas\M|^duvidas?\??$|sim duvida|(^|\m(?!nao\M)\w+ )(fiquei|estou|to) (c |com |na )?duvida|informac|explica|uma pergunta|me ajud|me informa|pode me ajudar|preciso de ajuda|\majuda\M|esclarec|observacao'),

('servico_descarbonizacao', 'comercial', 'Quer o serviço de descarbonização (CarboVAPT)', 602, true, false, false, '{}', 'outros',
 'descarboniza(cao|coes|r)\M|carbovapt|carbo vapt'),

-- Marcadores sem regra própria (a função os atribui pelo TIPO da mensagem).
('midia', 'outros', 'Áudio, foto ou arquivo sem texto', 950, true, false, false, '{}', 'outros', '(?!)')
on conflict (codigo) do nothing;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — o classificador, o cache e a leitura                        ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- O texto como as regras o leem. ⚠️ Duas trocas que mudam o sentido, e por isso
-- moram AQUI, num lugar só: "sem avaria"/"nenhum problema" viram "semproblema"
-- (senão "chegou sem avaria" seria reclamação de avaria) e "desculpa a demora"
-- some (senão "desculpa a demora pra responder, chegou tudo certo" seria
-- reclamação de atraso).
create or replace function public.carbo_wa_texto_chave(p_texto text)
returns text language sql immutable set search_path = public as $$
  select btrim(regexp_replace(
           regexp_replace(
             regexp_replace(
               regexp_replace(
                 regexp_replace(
                   regexp_replace(
                     translate(lower(coalesce(p_texto, '')),
                               'áàâãäéèêëíìîïóòôõöúùûüçñ', 'aaaaaeeeeiiiiooooouuuucn'),
                     '[^a-z0-9?@]+', ' ', 'g'),
                   '\m(n|nn)\M', 'nao', 'g'),
                 '\m(sem|nenhum|nenhuma|nao (tive|teve|houve|tem|tinha)) (nenhum |nenhuma |qualquer )?(avaria|avarias|problema|problemas|reclamacao|reclamacoes|dano|danos)\M|\maem avaria\M',
                 ' semproblema ', 'g'),
               '\mnao (estou |fiquei |ficamos |to )?satisfeit[oa]s?\M', ' insatisfeito ', 'g'),
             '\mdesculp\w* (a |pela |minha )?demora\M', ' ', 'g'),
           '\s+', ' ', 'g'));
$$;

-- Classifica um CONJUNTO de mensagens de cliente (janela de tempo, número).
-- ⚠️ REGRA POR REGRA, nunca mensagem por mensagem — e é por isso que não existe
-- uma função "assunto desta mensagem". O Postgres guarda só 32 expressões
-- compiladas; percorrer as ~37 regras para cada mensagem recompila todas, toda
-- vez. Medido nas 2.286 mensagens reais: 34 s mensagem a mensagem, 0,9 s regra
-- por regra. O `offset 0` é o que segura a ordem (sem ele o planejador põe a
-- mensagem por fora e volta aos 34 s).
create or replace function public.carbo_wa_assuntos_calcular(
  p_desde timestamptz, p_ate timestamptz, p_numero text, p_so_faltantes boolean
) returns table (wamid text, assuntos text[])
language sql stable security definer set search_path = public as $$
  with v as (select versao from public.carbo_wa_assunto_versao where id),
  m as (
    select m.wamid, m.tipo, m.texto, public.carbo_wa_texto_chave(m.texto) as k
      from public.carbo_wa_mensagens m
     where m.direcao = 'entrada'
       and m.ocorrido_em >= p_desde
       and (p_ate is null or m.ocorrido_em < p_ate)
       and (p_numero is null or m.numero_id = p_numero)
       and (not p_so_faltantes or not exists (
             select 1 from public.carbo_wa_msg_assunto c, v
              where c.wamid = m.wamid and c.versao = v.versao))
  ),
  mt as materialized (
    select m.wamid, m.k from m
     where m.k <> '' and coalesce(m.tipo, '') not in ('reaction', 'sticker')
  ),
  casa as (
    select x.wamid, a.codigo, a.grupo, a.ordem, a.exclusivo, a.so_se_vazio, a.suprime
      from public.carbo_wa_assuntos a
      cross join lateral (select mt.wamid from mt where mt.k ~ a.padrao offset 0) x
     where a.ativo
  ),
  excl as (
    select distinct on (c.wamid) c.wamid, c.codigo
      from casa c where c.exclusivo order by c.wamid, c.ordem
  ),
  -- Um por grupo, o de menor ordem.
  porgrupo as (
    select distinct on (c.wamid, c.grupo) c.*
      from casa c
     where not c.exclusivo and not c.so_se_vazio
       and not exists (select 1 from excl e where e.wamid = c.wamid)
     order by c.wamid, c.grupo, c.ordem
  ),
  supr as (select p.wamid, s.s from porgrupo p cross join lateral unnest(p.suprime) s(s)),
  fica as (
    select p.wamid, array_agg(p.codigo order by p.ordem) as assuntos
      from porgrupo p
     where not exists (select 1 from supr s where s.wamid = p.wamid and (s.s = p.codigo or s.s = p.grupo))
     group by p.wamid
  ),
  reserva as (
    select distinct on (c.wamid) c.wamid, c.codigo
      from casa c where c.so_se_vazio order by c.wamid, c.ordem
  )
  select m.wamid,
         case
           when coalesce(m.tipo, '') in ('reaction', 'sticker') then array['confirmacao']
           -- Só emoji ("👍", "🙏🏼") também é "ok": a reação vem como texto às vezes.
           when m.k = '' and coalesce(btrim(m.texto), '') <> '' then array['confirmacao']
           when m.k = '' then case when coalesce(m.tipo, 'text') in ('text', 'button', 'interactive')
                                   then '{}'::text[] else array['midia'] end
           when e.codigo is not null then array[e.codigo]
           when f.assuntos is not null then f.assuntos
           when r.codigo is not null then array[r.codigo]
           else '{}'::text[]
         end
    from m
    left join excl e on e.wamid = m.wamid
    left join fica f on f.wamid = m.wamid
    left join reserva r on r.wamid = m.wamid;
$$;

-- O cron: classifica o que falta (mensagem nova, ou tudo depois de mudar o
-- cadastro). Devolve quantas linhas gravou.
-- ⚠️ O cache ACELERA, nunca decide: o que ele não tem a leitura calcula na hora
-- (`carbo_wa_assuntos_janela`). Cron parado deixa a tela mais lenta, não errada.
create or replace function public.carbo_wa_assuntos_classificar()
returns int language plpgsql volatile security definer set search_path = public as $$
declare v int; n int;
begin
  select versao into v from public.carbo_wa_assunto_versao where id;
  insert into public.carbo_wa_msg_assunto (wamid, versao, assuntos, em)
  select c.wamid, v, c.assuntos, now()
    from public.carbo_wa_assuntos_calcular(now() - interval '800 days', null, null, true) c
  on conflict (wamid) do update
     set versao = excluded.versao, assuntos = excluded.assuntos, em = excluded.em;
  get diagnostics n = row_count;
  return n;
end $$;

-- Os assuntos desta mensagem DISPENSAM resposta? (resposta automática, ou só
-- assuntos que não pedem e nenhum "?").
create or replace function public.carbo_wa_assuntos_dispensam(p_assuntos text[], p_texto text)
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when coalesce(cardinality(p_assuntos), 0) = 0 then false
    when exists (select 1 from public.carbo_wa_assuntos a where a.codigo = any (p_assuntos) and a.exclusivo) then true
    when position('?' in coalesce(p_texto, '')) > 0 then false
    else not exists (select 1 from unnest(p_assuntos) u(c)
                       left join public.carbo_wa_assuntos a on a.codigo = u.c
                      where coalesce(a.pede, true))
  end;
$$;

-- A LEITURA que todas as telas usam: as mensagens de cliente da janela, com os
-- assuntos (do cache, ou calculados agora) e o "pede" já corrigido.
create or replace function public.carbo_wa_assuntos_janela(p_desde timestamptz, p_ate timestamptz, p_numero text)
returns table (wamid text, numero_id text, wa_id text, ocorrido_em timestamptz,
               tipo text, texto text, assuntos text[], pede boolean)
language sql stable security definer set search_path = public as $$
  with v as (select versao from public.carbo_wa_assunto_versao where id),
  falta as (select * from public.carbo_wa_assuntos_calcular(p_desde, p_ate, p_numero, true)),
  m as (
    select m.wamid, m.numero_id, m.wa_id, m.ocorrido_em, m.tipo, m.texto
      from public.carbo_wa_mensagens m
     where m.direcao = 'entrada'
       and m.ocorrido_em >= p_desde
       and (p_ate is null or m.ocorrido_em < p_ate)
       and (p_numero is null or m.numero_id = p_numero)
  )
  select m.wamid, m.numero_id, m.wa_id, m.ocorrido_em, m.tipo, m.texto, a.assuntos,
         public.carbo_wa_pede_resposta(m.tipo, m.texto)
           and not public.carbo_wa_assuntos_dispensam(a.assuntos, m.texto) as pede
    from m
    cross join v
    left join public.carbo_wa_msg_assunto c on c.wamid = m.wamid and c.versao = v.versao
    left join falta f on f.wamid = m.wamid
    cross join lateral (select coalesce(c.assuntos, f.assuntos, '{}'::text[]) as assuntos) a;
$$;

-- O sinal de RISCO ganha o que as conversas reais mostraram: redes sociais,
-- polícia/delegado, "campanha contra", "providências cabíveis".
create or replace function public.carbo_wa_risco(p_texto text)
returns boolean language sql immutable set search_path = public as $$
  select translate(lower(coalesce(p_texto, '')), 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc')
         ~ '(procon|reclame aqui|advogad|justica|defesa do consumidor|vou processar|processar (voces|vcs|a empresa)|denunci|golpe|fraude|estorno|chargeback|cobrad[oa] duas|cobranca duplicada|nao autoriz|redes sociais|campanha contra|delegad|policia|estelionat|providencias cabiveis)';
$$;

revoke execute on function public.carbo_wa_texto_chave(text) from anon, public;
grant  execute on function public.carbo_wa_texto_chave(text) to authenticated, service_role;
revoke execute on function public.carbo_wa_assuntos_calcular(timestamptz, timestamptz, text, boolean) from anon, public, authenticated;
revoke execute on function public.carbo_wa_assuntos_classificar() from anon, public, authenticated;
revoke execute on function public.carbo_wa_assuntos_dispensam(text[], text) from anon, public, authenticated;
revoke execute on function public.carbo_wa_assuntos_janela(timestamptz, timestamptz, text) from anon, public, authenticated;
revoke execute on function public.carbo_wa_assuntos_nova_versao() from anon, public, authenticated;
revoke execute on function public.carbo_wa_risco(text) from anon, public;
grant  execute on function public.carbo_wa_risco(text) to authenticated, service_role;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 3 — as RODADAS passam a usar o "pede" dos assuntos              ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- ⚠️ O corpo é o da 20261148 com UMA troca (o `pede` vem da janela). Ele só é
-- trocado se a função no banco ainda for a da 20261148 — a mesma conferência
-- do BLOCO 0; se alguém a mudou, este bloco ABORTA sem mexer em nada.
-- Espera: "Success. No rows returned".
do $$
begin
  if coalesce((select md5(regexp_replace(prosrc, '\s+', '', 'g')) from pg_proc
                where proname = 'carbo_atendimento_rodadas'), '') not in
     ('ca6b6aa1c22bff2a68c9cffe1ceed0ba', 'ef0a83e0e35599875f221624d523e0e5') then
    raise exception 'carbo_atendimento_rodadas não é a da 20261148 — não troquei. Mande o resultado do BLOCO 0.';
  end if;
end $$;

create or replace function public.carbo_atendimento_rodadas(p_desde timestamptz, p_numero text)
returns table (
  numero_id text, wa_id text, idx bigint, ep bigint,
  inicio timestamptz, inicio_pede timestamptz, ultimo_cliente_em timestamptz, ultimo_pede_em timestamptz,
  proxima_em timestamptz, pede boolean, n_msgs bigint, n_pede bigint,
  textos text, ultimo_texto text, ultimo_tipo text,
  respondido_em timestamptz, resp_pessoa text, resp_nome text,
  n_humanos bigint, ultimo_humano_em timestamptz,
  mark_em timestamptz, mark_status text, mark_por text, mark_por_nome text,
  desfecho text, primeira_do_ep boolean, respondida_depois boolean
)
language sql stable set search_path = public as $$
  with jan as (
    select j.wamid, j.pede from public.carbo_wa_assuntos_janela(p_desde, null, p_numero) j
  ),
  msgs as (
    select m.numero_id, m.wa_id, m.wamid, m.ocorrido_em, m.tipo, m.texto,
           case when m.direcao = 'entrada' then 'cliente' else 'humano' end as quem,
           coalesce(m.enviado_por::text, 'nome:' || m.enviado_por_nome) as pessoa,
           coalesce(pr.full_name, m.enviado_por_nome) as pessoa_nome,
           -- ⚠️ Desde a 20261149 o "pede" passa pelos ASSUNTOS: resposta automática,
           -- "chegou tudo certo", "ainda tenho", "já comprei no ML" não esperam
           -- resposta. Mensagem ainda sem cache cai na regra de palavras.
           m.direcao = 'entrada' and coalesce(jan.pede, public.carbo_wa_pede_resposta(m.tipo, m.texto)) as pede
      from public.carbo_wa_mensagens m
      left join public.profiles pr on pr.id = m.enviado_por
      left join jan on jan.wamid = m.wamid
     where m.ocorrido_em >= p_desde
       and (p_numero is null or m.numero_id = p_numero)
       and (m.direcao = 'entrada'
            -- ⚠️ Só GENTE encerra rodada: aviso automático não é atendimento,
            -- e resposta que falhou não chegou ao cliente.
            or ((m.enviado_por is not null or m.enviado_por_nome is not null)
                and coalesce(m.status, '') <> 'falhou'))
  ),
  -- ⚠️ Ordem: instante, e no EMPATE a mensagem de gente vem antes — senão uma
  -- resposta e uma pergunta no mesmo segundo fariam a resposta "responder" a
  -- pergunta que chegou junto, e o desempate seria o wamid (aleatório).
  seq as (
    select s.*,
           count(*) filter (where s.quem = 'humano')
             over (partition by s.numero_id, s.wa_id order by s.ocorrido_em, (s.quem = 'cliente'), s.wamid
                   rows between unbounded preceding and current row) as n_humano,
           lag(s.ocorrido_em)
             over (partition by s.numero_id, s.wa_id order by s.ocorrido_em, (s.quem = 'cliente'), s.wamid) as anterior_em
      from msgs s
  ),
  seq2 as (
    select s.*,
           sum(case when s.anterior_em is null or s.ocorrido_em - s.anterior_em > interval '24 hours' then 1 else 0 end)
             over (partition by s.numero_id, s.wa_id order by s.ocorrido_em, (s.quem = 'cliente'), s.wamid
                   rows between unbounded preceding and current row) as ep_n
      from seq s
  ),
  -- A qual rodada cada mensagem de gente responde: a última aberta antes dela
  -- (n_humano e ep_n só crescem, então o maior valor de cliente até ali é ela).
  -- ⚠️ O episódio é o da RODADA, não o da resposta: resposta dada mais de 24 h
  -- depois (por modelo da Meta) cai num episódio novo, e juntando pelo dela a
  -- rodada virava "perdida" e a demora sumia do tempo de resposta.
  seq3 as (
    select s.*,
           max(case when s.quem = 'cliente' then s.n_humano end)
             over (partition by s.numero_id, s.wa_id order by s.ocorrido_em, (s.quem = 'cliente'), s.wamid
                   rows between unbounded preceding and current row) as idx_resp,
           max(case when s.quem = 'cliente' then s.ep_n end)
             over (partition by s.numero_id, s.wa_id order by s.ocorrido_em, (s.quem = 'cliente'), s.wamid
                   rows between unbounded preceding and current row) as ep_resp
      from seq2 s
  ),
  rod as (
    select s.numero_id, s.wa_id, s.n_humano as idx, s.ep_n as ep,
           min(s.ocorrido_em) as inicio,
           min(s.ocorrido_em) filter (where s.pede) as inicio_pede,
           max(s.ocorrido_em) as ultimo_cliente_em,
           max(s.ocorrido_em) filter (where s.pede) as ultimo_pede_em,
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
    select s.numero_id, s.wa_id, s.idx_resp as idx, s.ep_resp as ep,
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
           lead(r.inicio) over (partition by r.numero_id, r.wa_id order by r.inicio) as proxima_em,
           -- Alguma rodada DEPOIS desta foi respondida? (quem voltou e foi
           -- atendido não é mais trabalho — sem laço sobre a tabela inteira.)
           max(h.respondido_em) over (partition by r.numero_id, r.wa_id order by r.inicio
                                      rows between 1 following and unbounded following) is not null as respondida_depois
      from rod r
      left join hum h on h.numero_id = r.numero_id and h.wa_id = r.wa_id
                     and h.idx = r.idx and h.ep = r.ep
  )
  select j.numero_id, j.wa_id, j.idx, j.ep, j.inicio, j.inicio_pede, j.ultimo_cliente_em, j.ultimo_pede_em,
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
                                 over (partition by j.numero_id, j.wa_id, j.ep) as primeira_do_ep,
         j.respondida_depois
    from junta j
    -- A marca que fechou a rodada sem resposta: uma DECISÃO resolvido/aguardando
    -- depois da última mensagem que PEDE (um 👍 do cliente depois não a anula)
    -- e antes da próxima rodada.
    -- ⚠️ Pelo `em` (relógio do SERVIDOR), nunca pelo `desde`, que vem do
    -- navegador: PC 2 min atrasado fazia a marca cair antes da mensagem.
    left join lateral (
      select h.em, h.status, h.por::text as por,
             coalesce(h.por_nome, pr.full_name) as por_nome
        from public.carbo_wa_atendimento_hist h
        left join public.profiles pr on pr.id = h.por
       where j.respondido_em is null and j.pede
         and h.numero_id = j.numero_id and h.wa_id = j.wa_id
         and h.marca
         and h.status in ('resolvido', 'aguardando')
         and h.em >= j.ultimo_pede_em
         and (j.proxima_em is null or h.em < j.proxima_em)
       order by h.em
       limit 1
    ) mk on true;
$$;
revoke execute on function public.carbo_atendimento_rodadas(timestamptz, text) from anon, public, authenticated;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 4 — a ABA "Assuntos" (jsonb, tudo agregado no banco)            ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
--
-- ⚠️ A conta principal é CLIENTE (o par número × wa_id), não mensagem.
-- ⚠️ O período anterior (mesma duração, logo antes) vem na MESMA chamada.
-- ⚠️ "Sem resposta" = depois da ÚLTIMA mensagem do cliente naquele assunto
-- ninguém da equipe escreveu. Só faz sentido para assunto que PEDE resposta
-- (a tela não mostra o número para "chegou tudo certo").
-- Espera: "Success. No rows returned".

drop function if exists public.carbo_atendimento_assuntos(date, date, text);
create or replace function public.carbo_atendimento_assuntos(p_de date, p_ate date, p_numero text default null)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_tz     constant text := 'America/Sao_Paulo';
  v_dias   int;
  v_ant_de date;
  v_de     timestamptz;
  v_fim    timestamptz;
  v_ini    timestamptz;
  v_balde  text;
  v_out    jsonb;
begin
  if not public.carbo_atendimento_gestor() then
    raise exception 'Somente gestores do Carbo Atendimento veem o painel.' using errcode = '42501';
  end if;
  if p_de is null or p_ate is null or p_ate < p_de then raise exception 'Período inválido.'; end if;
  v_dias := (p_ate - p_de) + 1;
  if v_dias > 400 then raise exception 'Período longo demais (máximo 400 dias).'; end if;
  v_ant_de := p_de - v_dias;
  v_de  := p_de::timestamp at time zone v_tz;
  v_fim := (p_ate + 1)::timestamp at time zone v_tz;
  v_ini := v_ant_de::timestamp at time zone v_tz;
  v_balde := case when v_dias <= 45 then 'dia' else 'semana' end;

  with
  j as (select * from public.carbo_wa_assuntos_janela(v_ini, v_fim, p_numero)),
  ex as (select a.codigo from public.carbo_wa_assuntos a where a.exclusivo),
  x as (
    select j.*, j.ocorrido_em >= v_de as atual,
           public.carbo_wa_risco(j.texto) as risco,
           exists (select 1 from ex where ex.codigo = any (j.assuntos)) as auto,
           case when v_balde = 'dia' then (j.ocorrido_em at time zone v_tz)::date
                else date_trunc('week', j.ocorrido_em at time zone v_tz)::date end as balde
      from j
  ),
  xa as (
    select x.*, u.codigo
      from x cross join lateral unnest(
             case when coalesce(cardinality(x.assuntos), 0) = 0 then array['_nenhum'] else x.assuntos end) u(codigo)
  ),
  ca as (
    select a.codigo, a.grupo, a.rotulo, a.ordem, a.pede, a.exclusivo from public.carbo_wa_assuntos a where a.ativo
    union all
    select '_nenhum', 'outros', 'Sem assunto reconhecido', 999, true, false
  ),
  -- Por (cliente, assunto), no período atual.
  par as (
    select xa.numero_id, xa.wa_id, xa.codigo,
           min(xa.ocorrido_em) as primeira_em, max(xa.ocorrido_em) as ultima_em,
           count(*) as n, bool_or(xa.risco) as risco
      from xa where xa.atual group by 1, 2, 3
  ),
  parr as (
    select p.*,
           (select min(h.ocorrido_em) from public.carbo_wa_mensagens h
             where h.wa_id = p.wa_id and h.numero_id = p.numero_id and h.direcao = 'saida'
               and (h.enviado_por is not null or h.enviado_por_nome is not null)
               and coalesce(h.status, '') <> 'falhou' and h.ocorrido_em >= p.primeira_em) as resp1_em,
           exists (select 1 from public.carbo_wa_mensagens h
             where h.wa_id = p.wa_id and h.numero_id = p.numero_id and h.direcao = 'saida'
               and (h.enviado_por is not null or h.enviado_por_nome is not null)
               and coalesce(h.status, '') <> 'falhou' and h.ocorrido_em >= p.ultima_em) as resp_depois
      from par p
  ),
  cur as (
    select p.codigo, count(*) as clientes, sum(p.n) as mensagens,
           count(*) filter (where not p.resp_depois) as sem_resposta,
           count(*) filter (where p.resp1_em is not null) as respondidos,
           count(*) filter (where p.risco) as com_risco,
           round((percentile_cont(0.5) within group (
             order by extract(epoch from p.resp1_em - p.primeira_em) / 60.0))::numeric, 1) as resposta_mediana_min
      from parr p group by p.codigo
  ),
  ant as (
    select xa.codigo, count(distinct (xa.numero_id, xa.wa_id)) as clientes, count(*) as mensagens
      from xa where not xa.atual group by xa.codigo
  ),
  ctt as (
    select distinct on (ct.numero_id, ct.wa_id) ct.numero_id, ct.wa_id, ct.nome
      from public.carbo_wa_contatos ct order by ct.numero_id, ct.wa_id
  ),
  -- O que vira DESTAQUE: o texto do cliente, como ele escreveu.
  dest as (
    select x.*, ctt.nome from x
      left join ctt on ctt.numero_id = x.numero_id and ctt.wa_id = x.wa_id
     where x.atual
  )
  select jsonb_build_object(
    'gerado_em', now(),
    'periodo', jsonb_build_object('de', p_de, 'ate', p_ate, 'ant_de', v_ant_de, 'ant_ate', p_de - 1, 'dias', v_dias),
    'balde', v_balde,
    'baldes', (select jsonb_agg(b order by b) from (
        select distinct case when v_balde = 'dia' then d::date else date_trunc('week', d)::date end as b
          from generate_series(p_de::timestamp, p_ate::timestamp, interval '1 day') d) bb),
    'versao', (select versao from public.carbo_wa_assunto_versao where id),
    'grupos', coalesce((select jsonb_agg(jsonb_build_object(
         'codigo', g.codigo, 'rotulo', g.rotulo, 'ordem', g.ordem, 'cor', g.cor,
         'clientes', (select count(distinct (p.numero_id, p.wa_id)) from parr p join ca on ca.codigo = p.codigo where ca.grupo = g.codigo),
         'mensagens', (select count(distinct xa.wamid) from xa join ca on ca.codigo = xa.codigo where xa.atual and ca.grupo = g.codigo),
         'clientes_ant', (select count(distinct (xa.numero_id, xa.wa_id)) from xa join ca on ca.codigo = xa.codigo where not xa.atual and ca.grupo = g.codigo)
       ) order by g.ordem) from public.carbo_wa_assunto_grupos g), '[]'::jsonb),
    'assuntos', coalesce((select jsonb_agg(jsonb_build_object(
         'codigo', ca.codigo, 'grupo', ca.grupo, 'rotulo', ca.rotulo, 'ordem', ca.ordem, 'pede', ca.pede,
         'automatico', ca.exclusivo,
         'clientes', coalesce(cur.clientes, 0), 'mensagens', coalesce(cur.mensagens, 0),
         'clientes_ant', coalesce(ant.clientes, 0), 'mensagens_ant', coalesce(ant.mensagens, 0),
         'sem_resposta', coalesce(cur.sem_resposta, 0), 'respondidos', coalesce(cur.respondidos, 0),
         'com_risco', coalesce(cur.com_risco, 0), 'resposta_mediana_min', cur.resposta_mediana_min
       ) order by ca.ordem)
       from ca left join cur on cur.codigo = ca.codigo left join ant on ant.codigo = ca.codigo), '[]'::jsonb),
    'serie', coalesce((select jsonb_agg(s) from (
         select xa.balde, xa.codigo, count(distinct (xa.numero_id, xa.wa_id)) as clientes
           from xa where xa.atual group by 1, 2) s), '[]'::jsonb),
    -- O mesmo, por GRUPO (cliente contado uma vez por grupo e balde — somar a
    -- série dos assuntos contaria duas vezes quem falou de dois do mesmo grupo).
    'serie_grupo', coalesce((select jsonb_agg(s) from (
         select xa.balde, ca.grupo, count(distinct (xa.numero_id, xa.wa_id)) as clientes
           from xa join ca on ca.codigo = xa.codigo where xa.atual group by 1, 2) s), '[]'::jsonb),
    'por_numero', coalesce((select jsonb_agg(s) from (
         select p.numero_id, ca.grupo, count(distinct p.wa_id) as clientes
           from parr p join ca on ca.codigo = p.codigo group by 1, 2) s), '[]'::jsonb),
    'totais', (select jsonb_build_object(
         'mensagens', count(*) filter (where x.atual),
         'mensagens_ant', count(*) filter (where not x.atual),
         'clientes', count(distinct (x.numero_id, x.wa_id)) filter (where x.atual and not x.auto),
         'clientes_ant', count(distinct (x.numero_id, x.wa_id)) filter (where not x.atual and not x.auto),
         'automaticas', count(*) filter (where x.atual and x.auto),
         'sem_assunto', count(*) filter (where x.atual and coalesce(cardinality(x.assuntos), 0) = 0),
         'com_risco', count(distinct (x.numero_id, x.wa_id)) filter (where x.atual and x.risco),
         'pedem', count(*) filter (where x.atual and x.pede)
       ) from x),
    -- O elogio como o cliente escreveu (os curtos — "ok, chegou" — não dizem nada).
    'elogios', coalesce((select jsonb_agg(e order by e.ocorrido_em desc) from (
         select d.numero_id, d.wa_id, d.nome, d.ocorrido_em, left(d.texto, 400) as texto, d.assuntos
           from dest d
          where exists (select 1 from public.carbo_wa_assuntos a
                         where a.codigo = any (d.assuntos) and a.grupo = 'elogio' and a.codigo <> 'vai_testar')
            and length(coalesce(d.texto, '')) >= 28
          order by d.ocorrido_em desc limit 40) e), '[]'::jsonb),
    'riscos', coalesce((select jsonb_agg(e order by e.ocorrido_em desc) from (
         select distinct on (d.numero_id, d.wa_id) d.numero_id, d.wa_id, d.nome, d.ocorrido_em,
                left(d.texto, 400) as texto, d.assuntos,
                exists (select 1 from public.carbo_wa_mensagens h
                         where h.wa_id = d.wa_id and h.numero_id = d.numero_id and h.direcao = 'saida'
                           and (h.enviado_por is not null or h.enviado_por_nome is not null)
                           and coalesce(h.status, '') <> 'falhou' and h.ocorrido_em >= d.ocorrido_em) as respondido
           from dest d where d.risco
          order by d.numero_id, d.wa_id, d.ocorrido_em desc) e), '[]'::jsonb)
  ) into v_out;
  return v_out;
end $$;
grant execute on function public.carbo_atendimento_assuntos(date, date, text) to authenticated;
revoke execute on function public.carbo_atendimento_assuntos(date, date, text) from anon, public;

-- QUEM falou de um assunto: um cliente por linha, com as últimas mensagens dele
-- naquele assunto. Paginado (o assunto "chegou tudo certo" passa de centenas).
--   p_filtro = código do assunto | '_nenhum' | 'grupo:<código>' | 'risco'
drop function if exists public.carbo_atendimento_assunto_clientes(date, date, text, text, int, int);
create or replace function public.carbo_atendimento_assunto_clientes(
  p_de date, p_ate date, p_filtro text, p_numero text default null, p_limite int default 30, p_offset int default 0
) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_tz  constant text := 'America/Sao_Paulo';
  v_de  timestamptz;
  v_fim timestamptz;
  v_lim int := least(greatest(coalesce(p_limite, 30), 1), 100);
  v_off int := greatest(coalesce(p_offset, 0), 0);
  v_out jsonb;
begin
  if not public.carbo_atendimento_gestor() then
    raise exception 'Somente gestores do Carbo Atendimento veem o painel.' using errcode = '42501';
  end if;
  if p_de is null or p_ate is null or p_ate < p_de or (p_ate - p_de) > 400 then raise exception 'Período inválido.'; end if;
  if coalesce(p_filtro, '') = '' then raise exception 'Assunto não informado.'; end if;
  v_de  := p_de::timestamp at time zone v_tz;
  v_fim := (p_ate + 1)::timestamp at time zone v_tz;

  with
  j as (select * from public.carbo_wa_assuntos_janela(v_de, v_fim, p_numero)),
  x as (select j.*, public.carbo_wa_risco(j.texto) as risco from j),
  f as (
    select x.* from x
     where case
             when p_filtro = 'risco' then x.risco
             when p_filtro = '_nenhum' then coalesce(cardinality(x.assuntos), 0) = 0
             when p_filtro like 'grupo:%' then exists (
               select 1 from public.carbo_wa_assuntos a
                where a.codigo = any (x.assuntos) and a.grupo = substr(p_filtro, 7))
             else p_filtro = any (x.assuntos)
           end
  ),
  cl as (
    select f.numero_id, f.wa_id, min(f.ocorrido_em) as primeira_em, max(f.ocorrido_em) as ultima_em,
           count(*) as n, bool_or(f.risco) as risco,
           (array_agg(jsonb_build_object('em', f.ocorrido_em, 'tipo', f.tipo, 'texto', left(coalesce(f.texto, ''), 500),
                                         'assuntos', f.assuntos) order by f.ocorrido_em desc))[1:6] as msgs
      from f group by 1, 2
  ),
  pg as (
    select cl.* from cl order by cl.risco desc, cl.ultima_em desc, cl.numero_id, cl.wa_id
    limit v_lim offset v_off
  ),
  ctt as (
    select distinct on (ct.numero_id, ct.wa_id) ct.numero_id, ct.wa_id, ct.nome
      from public.carbo_wa_contatos ct
     where (ct.numero_id, ct.wa_id) in (select pg.numero_id, pg.wa_id from pg)
     order by ct.numero_id, ct.wa_id
  )
  select jsonb_build_object(
    'total', (select count(*) from cl),
    'itens', coalesce((select jsonb_agg(jsonb_build_object(
        'numero_id', pg.numero_id, 'wa_id', pg.wa_id, 'nome', ctt.nome,
        'primeira_em', pg.primeira_em, 'ultima_em', pg.ultima_em, 'n', pg.n, 'risco', pg.risco,
        'mensagens', to_jsonb(pg.msgs),
        'respondido_depois', exists (select 1 from public.carbo_wa_mensagens h
             where h.wa_id = pg.wa_id and h.numero_id = pg.numero_id and h.direcao = 'saida'
               and (h.enviado_por is not null or h.enviado_por_nome is not null)
               and coalesce(h.status, '') <> 'falhou' and h.ocorrido_em >= pg.ultima_em)
      ) order by pg.risco desc, pg.ultima_em desc, pg.numero_id, pg.wa_id)
      from pg left join ctt on ctt.numero_id = pg.numero_id and ctt.wa_id = pg.wa_id), '[]'::jsonb)
  ) into v_out;
  return v_out;
end $$;
grant execute on function public.carbo_atendimento_assunto_clientes(date, date, text, text, int, int) to authenticated;
revoke execute on function public.carbo_atendimento_assunto_clientes(date, date, text, text, int, int) from anon, public;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 5 — classificar o histórico e ligar o cron                      ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- Espera: UMA linha, `classificadas` ≈ o total de mensagens de cliente
-- (medido: ~2.300 até 06/11) e `cron` = true. Leva alguns segundos.
-- ⚠️ Minuto 17 de toda hora: é o único minuto ímpar livre na grade. O cron
-- não decide nada (ver BLOCO 2) — se ele parar, a tela fica mais lenta.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'atendimento-assuntos-classificar') then
    perform cron.unschedule('atendimento-assuntos-classificar');
  end if;
  perform cron.schedule('atendimento-assuntos-classificar', '17 * * * *',
                        'select public.carbo_wa_assuntos_classificar()');
end $$;
select public.carbo_wa_assuntos_classificar() as classificadas,
       exists (select 1 from cron.job where jobname = 'atendimento-assuntos-classificar') as cron;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 6 — conferência (só leitura)                                    ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- (a) Clientes por assunto nos últimos 30 dias. Espera: "chegou tudo certo",
--     "onde está o pedido" e "atraso" no topo; "sem assunto" abaixo de ~15%.
--     ⚠️ Se TUDO vier "sem assunto", o cadastro não carregou (BLOCO 1).
select coalesce(a.codigo, '(sem assunto)') as assunto, a.rotulo,
       count(distinct (j.numero_id, j.wa_id)) as clientes, count(*) as mensagens
  from public.carbo_wa_assuntos_janela(now() - interval '30 days', null, null) j
  left join lateral unnest(case when cardinality(j.assuntos) = 0 then array[null::text] else j.assuntos end) u(c) on true
  left join public.carbo_wa_assuntos a on a.codigo = u.c
 group by 1, 2 order by 3 desc;

-- (b) O "pede resposta" ANTES e DEPOIS, nos últimos 30 dias: quantas mensagens
--     deixaram de contar como esperando resposta, e por qual assunto.
--     Espera: dezenas, quase todas "resposta automática", "chegou tudo certo",
--     "ainda tem produto", "comprou no ML". Assunto de reclamação ali é ERRO.
select coalesce(a.rotulo, '(sem assunto)') as assunto, count(*) as deixaram_de_pedir
  from public.carbo_wa_assuntos_janela(now() - interval '30 days', null, null) j
  left join lateral unnest(case when cardinality(j.assuntos) = 0 then array[null::text] else j.assuntos end) u(c) on true
  left join public.carbo_wa_assuntos a on a.codigo = u.c
 where public.carbo_wa_pede_resposta(j.tipo, j.texto) and not j.pede
 group by 1 order by 2 desc;
