import type { Secao } from "../tipos";

// ─────────────────────────────────────────────────────────────────────────────
// Documentação do Carbo Marketing — E-commerce: Vendas Online, Acompanhamento
// de Metas e Anúncios da Meta. As três telas são CÓPIAS das do Admin (mesmas
// rotas `/ecommerce/...`, mesmos números): este texto vale para os dois apps.
//
// ⚠️ O `n` de cada item é o MESMO marcador do print (`chave`), medido pelo
// harness (docs-prints/shots_ecommerce.mjs). Mudou a tela: refaça o print.
// ─────────────────────────────────────────────────────────────────────────────

const MESMA_TELA = "É a mesma tela do Admin, com os mesmos números: o que você vê aqui é o que a diretoria vê lá.";

export const SECOES_ECOMMERCE: Secao[] = [
  // ── Vendas Online ───────────────────────────────────────────────────────────
  {
    id: "vendas-online",
    titulo: "Vendas Online",
    rota: "/ecommerce/vendas-online",
    resumo:
      "O painel das vendas da internet: loja própria (Nuvemshop e PayT), Mercado Livre (LogHouse e Full), Amazon e Shopee. Uma aba por canal, o Comparativo entre eles e o Histórico mês a mês. " + MESMA_TELA,
    regras: {
      colaborador: [
        "Vê todos os canais, o Comparativo e o Histórico — os números são da empresa inteira, não só seus.",
        "Pode abrir a comissão de cada canal e cadastrar uma taxa nova.",
      ],
      gestor: [
        "Vê exatamente a mesma tela que o colaborador — esta tela não tem nada a mais para o gestor.",
        "O mapa de SKU (quantas unidades tem cada kit) é cadastrado pelo Ops, em Suprimentos → CD SP → Mapeamento SKU.",
      ],
    },
    blocos: [
      {
        titulo: "Como ler os números",
        itens: [
          { titulo: "Pedido x venda", texto: "“Pedidos recebidos” são todos os que entraram no período, em qualquer situação. “Vendas” são só os que foram pagos (pagos, enviados ou entregues). Faturamento, ticket médio e unidades vendidas contam só as vendas." },
          { titulo: "Um pedido com dois produtos é UMA venda", texto: "A plataforma manda uma linha por produto, mas a tela conta o pedido uma vez só. Receita e unidades somam todos os produtos do pedido." },
          { titulo: "Pack e unidade são coisas diferentes", texto: "Pack é o que a plataforma vendeu (1 kit). Unidade é o que o cliente levou: o kit de 5 frascos conta 5 unidades; o kit de sachês, 10. Por isso “Qtd. packs” e “Unidades” não batem — e não é para bater." },
          { titulo: "O dia é o de Brasília", texto: "Pedido feito às 21h entra no dia em que foi feito, não no dia seguinte." },
          { titulo: "Atualiza sozinha", texto: "A tela confere a conexão a cada minuto e se atualiza quando chega pedido novo. Não precisa apertar F5." },
          { titulo: "Pode mandar o link", texto: "A aba e o período ficam no endereço da página. Copie o link e quem abrir vê a mesma aba e o mesmo período (ex.: “ML LogHouse, setembro”)." },
        ],
      },
      {
        titulo: "A aba de um canal",
        print: { chave: "ecom-canal", legenda: "A aba ML LogHouse, em “Este mês (até hoje)”." },
        itens: [
          { n: 1, titulo: "Período", texto: "Escolhe de quando são os números. Veja “O seletor de período”, logo abaixo." },
          { n: 2, titulo: "Canais", texto: "Um botão por canal, mais Comparativo e Histórico Mensal. ML LogHouse é o Mercado Livre que sai do nosso galpão; ML Full é o Mercado Livre em que a mercadoria já está no galpão do ML. No celular a faixa rola de lado. A tela lembra a última aba que você usou." },
          { n: 3, titulo: "Selo da conexão", texto: "“Conectado” (verde) = os pedidos estão entrando. “Sem sincronizar há …” (âmbar) = a conexão existe, mas faz mais de uma hora que não chega pedido novo — os números podem estar atrasados; avise o TI. “Aguardando integração” = o canal não está ligado." },
          { n: 4, titulo: "Vendas", texto: "Quantos pedidos foram pagos, e embaixo quantos chegaram no total." },
          { n: 5, titulo: "Faturamento", texto: "Quanto as vendas somaram (valor dos produtos, sem o frete) e o ticket médio por venda." },
          { n: 6, titulo: "A Receber", texto: "Pedidos que ainda não foram pagos (PIX ou boleto gerado e não pago). É dinheiro que ainda pode entrar." },
          { n: 7, titulo: "Comissão da Plataforma", texto: "Quanto o canal fica de comissão sobre o faturamento do período. Clique para ver o detalhe e cadastrar a taxa. “—” quer dizer que a taxa daquele canal ainda não foi cadastrada." },
          { n: 8, titulo: "Unidades Vendidas", texto: "Quantas unidades o cliente levou nas vendas pagas. Embaixo, o total contando também os não pagos e os cancelados." },
          { n: 9, titulo: "Cancelados", texto: "Quantos pedidos foram cancelados, quanto valiam e que fatia dos pedidos eles são." },
          { n: 10, titulo: "O que aconteceu com os pedidos", texto: "O caminho dos pedidos do período: das vendas pagas, quantas aguardam envio, estão em transporte ou já foram entregues; e, à parte, os que aguardam pagamento e os cancelados, com o valor de cada grupo." },
          { n: 11, titulo: "Produto mais vendido", texto: "O produto com mais packs vendidos no período, com o faturamento dele." },
          { n: 12, titulo: "Verificação de Integridade", texto: "Confere a tela contra a soma direta do banco. Diferença verde (até 1%) = tudo certo. Amarela ou vermelha = algo não bateu; avise o TI com um print desta parte." },
          { n: 13, titulo: "Evolução de Vendas", texto: "Pedidos e unidades por dia. Passe o mouse sobre a barra para ver o número do dia." },
          { n: 14, titulo: "Produtos Vendidos", texto: "Um produto por linha: código (SKU), packs vendidos, quantas unidades tem cada pack (×5, ×10), unidades e receita. O total da coluna Receita é o mesmo do cartão Faturamento." },
        ],
      },
      {
        titulo: "O seletor de período",
        print: { chave: "ecom-periodo", legenda: "As opções de período." },
        itens: [
          { n: 1, titulo: "Hoje, Ontem, Últimos 7 e 30 dias", texto: "Períodos que andam com o calendário. Ao abrir a tela sem nada escolhido, ela mostra os últimos 7 dias." },
          { n: 2, titulo: "Este mês (até hoje)", texto: "Do dia 1 até hoje. É o mês ainda em andamento — serve para ver “como vai o mês”, não para comparar com um mês que já acabou." },
          { n: 3, titulo: "Mês fechado…", texto: "Um mês inteiro, do dia 1 ao último dia. Ao escolher, aparece ao lado a caixa do mês (veja abaixo). Use este para comparar um mês com outro." },
          { n: 4, titulo: "Por período…", texto: "Duas datas, de e até, escolhidas no calendário. As duas já vêm preenchidas (os últimos 30 dias); mude só o que precisar." },
        ],
      },
      {
        print: { chave: "ecom-mes-fechado", legenda: "“Mês fechado…” com setembro escolhido." },
        itens: [
          { n: 1, titulo: "Mês fechado…", texto: "O modo escolhido." },
          { n: 2, titulo: "O mês", texto: "Escolha qual mês. Os mais recentes aparecem primeiro." },
          { titulo: "Cuidado ao comparar", texto: "Comparar “Este mês (até hoje)” com um mês fechado sempre parece queda: um tem poucos dias, o outro tem o mês inteiro. Compare mês fechado com mês fechado." },
        ],
      },
      {
        titulo: "Comissão da plataforma",
        print: { chave: "ecom-comissao", legenda: "A comissão do ML LogHouse, aberta pelo cartão." },
        itens: [
          { n: 1, titulo: "Resumo", texto: "Receita do período, a comissão do canal e o que sobra depois dela." },
          { n: 2, titulo: "Cadastrar nova taxa", texto: "Digite a taxa em % e a data a partir de quando ela vale. Pedidos de antes dessa data continuam calculados com a taxa antiga." },
          { n: 3, titulo: "Salvar taxa", texto: "Grava a taxa nova. Ela passa a valer para todas as telas de e-commerce." },
          { n: 4, titulo: "Histórico de taxas", texto: "Todas as taxas que já valeram, com a data de início e quando foram cadastradas." },
          { n: 5, titulo: "Atual", texto: "A taxa que vale hoje." },
          { titulo: "Canal sem taxa", texto: "Enquanto a taxa de um canal não é cadastrada, o cartão mostra “—” em vez de inventar um número." },
        ],
      },
      {
        titulo: "Quando algo não está completo",
        print: { chave: "ecom-shopee", legenda: "A aba da Shopee com o selo âmbar e uma linha sem SKU." },
        itens: [
          { n: 1, titulo: "Sem sincronizar há …", texto: "A conexão está de pé, mas não chega pedido novo há mais de uma hora. Os números são de até aquela hora. Avise o TI." },
          { n: 2, titulo: "sem SKU", texto: "A plataforma mandou a venda sem o código do produto — quase sempre é um anúncio sem SKU cadastrado no painel da plataforma. A correção é preencher o SKU no anúncio, lá na plataforma." },
          { n: 3, titulo: "×?", texto: "O sistema não sabe quantas unidades tem esse pack (falta o SKU ou o cadastro dele). As unidades dessa linha são o número que a plataforma mandou, então o total de unidades fica menor do que o real." },
          { n: 4, titulo: "×5, ×10", texto: "Quantas unidades o cliente leva em cada pack daquele SKU, pelo cadastro do Ops." },
        ],
      },
      {
        titulo: "Comparativo",
        print: { chave: "ecom-comparativo", legenda: "O Comparativo com todos os canais marcados." },
        itens: [
          { n: 1, titulo: "Quais canais", texto: "Clique para tirar ou pôr um canal na comparação. Pelo menos um fica sempre marcado. Os números de cima somam só os canais marcados." },
          { n: 2, titulo: "Vendas e Faturamento", texto: "A soma dos canais marcados, com os pedidos recebidos e o ticket médio." },
          { n: 3, titulo: "Unidades", texto: "Unidades entregues ao cliente nas vendas pagas, já com a quantidade de cada kit." },
          { n: 4, titulo: "Líder em faturamento", texto: "O canal que mais faturou e a fatia dele no total." },
          { n: 5, titulo: "Um cartão por produto", texto: "Quantos packs de cada produto saíram, a fatia dele nos packs, as unidades e o faturamento. Produto novo cadastrado ganha cartão sozinho." },
          { n: 6, titulo: "Produto sem mapeamento", texto: "Aparece quando alguma venda não tem SKU cadastrado. Enquanto não for cadastrado no Ops (Suprimentos → CD SP → Mapeamento SKU), o total de unidades fica abaixo do real." },
          { n: 7, titulo: "Resumo Comparativo", texto: "Uma linha por canal, do que mais faturou para o que menos: vendas, recebidos, packs de cada produto, unidades, faturamento com a barra de participação, ticket médio e cancelados. O troféu marca o líder." },
          { n: 8, titulo: "Colunas de produto", texto: "Packs de cada produto por canal. A soma delas não fecha com “Vendas”: um pedido pode levar mais de um pack ou mais de um produto." },
          { n: 9, titulo: "Mix de Receita", texto: "A pizza do faturamento por canal. Passe o mouse para ver valor e porcentagem." },
          { n: 10, titulo: "Evolução", texto: "Receita, pedidos ou unidades por dia, uma linha por canal. Os botões trocam o que o gráfico mostra." },
        ],
      },
      {
        titulo: "Histórico Mensal",
        print: { chave: "ecom-historico", legenda: "O Histórico Mensal dos últimos três meses." },
        itens: [
          { n: 1, titulo: "Plataformas", texto: "Quais canais entram na conta. Pelo menos um fica marcado." },
          { n: 2, titulo: "Período", texto: "Do mês até o mês. Abre nos últimos três meses (o atual incluído, ainda em andamento). Esta aba não usa o seletor de período do topo." },
          { n: 3, titulo: "Resumo", texto: "Faturamento (com a variação contra o mês anterior), vendas, unidades vendidas, ticket médio e cancelamentos do período inteiro. Atenção: o mês atual ainda não acabou, então a variação dele contra o mês anterior quase sempre aparece como queda." },
          { n: 4, titulo: "Não entrou", texto: "O que ficou fora do faturamento: o que ainda está a receber e o que foi cancelado." },
          { n: 5, titulo: "Melhor Mês", texto: "O mês de maior faturamento no período escolhido." },
          { n: 6, titulo: "Por canal", texto: "Um cartão por canal com faturamento, vendas, unidades, a fatia no total e a variação do último mês contra o anterior." },
          { n: 7, titulo: "Gráficos mensais", texto: "Faturamento e vendas por mês e por canal. Mais abaixo, ticket médio e taxa de cancelamento por mês." },
        ],
      },
      {
        print: { chave: "ecom-historico-tabela", legenda: "O detalhamento do Histórico Mensal." },
        itens: [
          { titulo: "Detalhamento por Mês e Plataforma", texto: "Uma linha por mês e canal, com pedidos, unidades, receita e ticket médio. O troféu e a linha verde marcam o melhor mês de cada canal." },
          { n: 1, titulo: "Cancel.", texto: "A porcentagem dos pedidos daquele mês que foram cancelados." },
          { n: 2, titulo: "MoM", texto: "Variação do faturamento contra o mês anterior do mesmo canal (verde subiu, vermelho caiu)." },
        ],
      },
    ],
  },

  // ── Acompanhamento de Metas ─────────────────────────────────────────────────
  {
    id: "metas-ecommerce",
    titulo: "Acompanhamento de Metas",
    rota: "/ecommerce/metas",
    resumo:
      "O faturamento do e-commerce contra a meta do mês, no total e por canal: quanto já entrou, quanto deveria ter entrado até hoje, a projeção para o fim do mês e quanto falta por dia. " + MESMA_TELA,
    regras: {
      colaborador: [
        "Vê as metas e o realizado de todos os canais.",
        "Não cadastra meta: esta tela é só para acompanhar.",
      ],
      gestor: [
        "Vê a mesma tela que o colaborador.",
        "As metas do e-commerce são cadastradas no Admin, em Configurar Metas, canal por canal. A meta total é a soma das metas dos canais.",
      ],
    },
    blocos: [
      {
        titulo: "Como ler as cores",
        itens: [
          { titulo: "Esperado hoje", texto: "Quanto da meta já deveria ter entrado, pelo dia do mês. No dia 15 de um mês de 30 dias, o esperado é 50%." },
          { titulo: "Verde, amarelo, vermelho", texto: "Verde = o realizado está no esperado ou acima. Amarelo = até 15 pontos abaixo. Vermelho = mais que isso abaixo. Cinza = o canal não tem meta no mês." },
          { titulo: "Conta só venda paga", texto: "O realizado soma os pedidos pagos, enviados ou entregues. Pedido não pago e cancelado ficam de fora — é o mesmo faturamento da tela Vendas Online." },
          { titulo: "Atualiza sozinha", texto: "Os números se refazem a cada 30 segundos. A hora da última atualização aparece ao lado do título." },
        ],
      },
      {
        print: { chave: "metas", legenda: "O Acompanhamento de Metas no mês corrente." },
        itens: [
          { n: 1, titulo: "Mês", texto: "As setas voltam e avançam o mês. Não dá para ir além do mês atual. Em mês passado, a tela compara o mês inteiro." },
          { n: 2, titulo: "Faturamento Total do Mês", texto: "Quanto já entrou no mês, somando os canais, ao lado da meta total." },
          { n: 3, titulo: "Realizado, esperado e comparação", texto: "Quanto da meta já foi feito, quanto deveria ter sido até hoje e a variação contra o mesmo pedaço do mês anterior (do dia 1 até o mesmo dia e hora) — assim a comparação é justa mesmo no começo do mês." },
          { n: 4, titulo: "Projeção FDM", texto: "Onde o mês termina se o ritmo de vendas continuar igual (FDM = fim do mês), e quanto isso é da meta." },
          { n: 5, titulo: "Faltam", texto: "Quanto falta para bater a meta. Batida, aparece “Meta batida!”." },
          { n: 6, titulo: "Dias restantes e Precisa/dia", texto: "Quantos dias faltam no mês e quanto é preciso vender por dia, daqui em diante, para chegar na meta." },
          { n: 7, titulo: "Barra de progresso", texto: "A barra mostra o realizado; o tracinho vertical marca onde deveria estar hoje." },
          { n: 8, titulo: "Por Plataforma", texto: "Um cartão por canal. Veja o detalhe abaixo." },
          { n: 9, titulo: "Filtro dos gráficos", texto: "Total ou um canal só. A porcentagem ao lado do nome é quanto da meta daquele canal já foi feito." },
          { n: 10, titulo: "Diário, Acumulado, Histórico", texto: "Três gráficos do faturamento. Veja “Os gráficos”, abaixo." },
          { n: 11, titulo: "Ranking de Performance", texto: "Os canais do que está mais adiantado na meta para o mais atrasado, com o tracinho do esperado para hoje. Só aparece quando algum canal tem meta." },
        ],
      },
      {
        titulo: "O cartão de um canal",
        print: { chave: "metas-card", legenda: "O cartão de um canal em Por Plataforma." },
        itens: [
          { n: 1, titulo: "Meta", texto: "A meta do canal no mês. “Sem meta definida” = ninguém cadastrou meta para ele." },
          { n: 2, titulo: "% realizado", texto: "Quanto da meta já entrou, na cor do andamento. “—” quando não há meta." },
          { n: 3, titulo: "Comparação", texto: "Quanto o canal vendeu a mais ou a menos que no mesmo pedaço do mês anterior." },
          { n: 4, titulo: "Barra", texto: "O realizado, com o tracinho do esperado para hoje." },
          { n: 5, titulo: "Projeção FDM", texto: "Onde o canal termina o mês no ritmo atual." },
          { n: 6, titulo: "Faltam", texto: "Quanto falta para a meta do canal. “✓ Batida” quando passou; “—” sem meta." },
        ],
      },
      {
        titulo: "Os gráficos",
        print: { chave: "metas-acumulado", legenda: "O gráfico Acumulado, com a meta tracejada." },
        itens: [
          { titulo: "Diário", texto: "Uma barra por dia: verde quando o dia bateu a meta diária, amarela quando chegou perto, vermelha abaixo. A linha tracejada é a meta por dia, e o número em cima da barra é quanto aquele dia representa do mês." },
          { n: 1, titulo: "Acumulado", texto: "O faturamento somado dia a dia contra a meta acumulada (tracejada). Se a linha cheia está acima da tracejada, o mês está adiantado. Quando a meta é batida, aparece o alvo 🎯 no dia em que aconteceu." },
          { n: 2, titulo: "A linha do realizado", texto: "Fica verde, amarela ou vermelha conforme o último dia está acima, perto ou abaixo da meta acumulada." },
          { n: 3, titulo: "Histórico", texto: "O faturamento mês a mês contra a meta de cada mês. Escolha 3, 6, 12 meses ou Tudo." },
        ],
      },
    ],
  },

  // ── Anúncios da Meta ────────────────────────────────────────────────────────
  {
    id: "anuncios",
    titulo: "Anúncios da Meta",
    rota: "/ecommerce/anuncios",
    resumo:
      "Quanto foi investido nos anúncios do Facebook e do Instagram e o que a Meta diz que eles trouxeram — ao lado do faturamento real da loja própria, do funil do anúncio à compra, dos melhores e piores anúncios e de quem compra. " + MESMA_TELA,
    regras: {
      colaborador: [
        "Vê o painel de todas as contas de anúncio ligadas.",
        "Pode apertar “Sincronizar agora” para buscar os números mais recentes na Meta.",
        "Pode abrir “Contas” para ver quais contas o sistema lê.",
      ],
      gestor: [
        "Vê a mesma tela que o colaborador.",
        "Ligar ou desligar uma conta de anúncio (“Usar esta conta” / “Parar de ler”) só funciona para quem tem acesso ao Admin — para os demais, a Meta recusa e a tela avisa.",
      ],
    },
    blocos: [
      {
        titulo: "Antes de ler: o que a Meta conta",
        itens: [
          { titulo: "“Vendas” e “ROAS” são da Meta", texto: "São as compras que a própria Meta diz ter gerado (clicou no anúncio nos últimos 7 dias ou viu no último dia). Ela não enxerga cancelamento nem devolução, e se credita vendas que vieram por outro caminho. Use para comparar anúncios entre si, não como faturamento." },
          { titulo: "O faturamento real é outro número", texto: "O faturamento de verdade está no bloco “O resultado real da loja própria” e na tela Vendas Online." },
          { titulo: "Quando os números chegam", texto: "A Meta é lida sozinha três vezes por dia. Para ver agora, use “Sincronizar agora”." },
          { titulo: "Comparação com o período anterior", texto: "Embaixo de cada cartão: quanto o número subiu ou caiu contra o mesmo número de dias logo antes. Verde é bom, vermelho é ruim (para custo, subir é ruim)." },
        ],
      },
      {
        print: { chave: "anuncios", legenda: "Anúncios da Meta nos últimos 30 dias, todas as contas." },
        itens: [
          { n: 1, titulo: "Conta", texto: "Todas as contas ou uma só. Só aparece quando há mais de uma conta ligada." },
          { n: 2, titulo: "Período", texto: "Hoje, Ontem, Últimos 7 dias, Últimos 30 dias ou Mês atual. Abre em 30 dias." },
          { n: 3, titulo: "Contas", texto: "Mostra as contas de anúncio que o sistema enxerga e quais estão ligadas. Veja “Contas de anúncio”, abaixo." },
          { n: 4, titulo: "Sincronizar agora", texto: "Busca na Meta os últimos 30 dias. Leva alguns segundos; ao terminar, avisa quantas linhas chegaram." },
          { n: 5, titulo: "Os seis números", texto: "Investimento (e impressões), Vendas da Meta (e compras), ROAS, CPA (custo por compra), CPM (custo por mil impressões) e CTR (de cada 100 que viram, quantos clicaram no link)." },
          { n: 6, titulo: "ROAS (Meta)", texto: "Quanto a Meta diz ter vendido para cada R$ 1 investido. 3x = R$ 3 de venda por R$ 1 de anúncio." },
          { n: 7, titulo: "O resultado real da loja própria", texto: "O que a loja própria (Nuvemshop + PayT) vendeu de verdade no mesmo período, sem depender da Meta: faturamento, pedidos, investimento por pedido e quanto do faturamento a Meta diz ter gerado. Não se divide por conta de anúncio. Quando a Meta diz ter gerado mais do que a loja vendeu, aparece um aviso âmbar: é sinal de que ela está contando venda que veio por outro caminho." },
          { n: 8, titulo: "MER", texto: "Faturamento real da loja ÷ investimento em anúncio. É o número que diz se o dinheiro em anúncio está voltando no caixa." },
          { n: 9, titulo: "Investimento × retorno por dia", texto: "Barras = investimento; linha verde = vendas que a Meta atribui; linha azul tracejada = faturamento real da loja. Passe o mouse para ver o dia." },
          { n: 10, titulo: "Do anúncio à compra", texto: "O funil: cliques, chegaram à página, iniciaram o checkout, preencheram o pagamento e compraram. Cada etapa mostra quantos seguiram da anterior e quanto custou cada um. Embaixo, à parte, quem viu o produto e quem pôs no carrinho." },
          { n: 11, titulo: "Os anúncios que mais retornam", texto: "Os cinco de maior ROAS, entre os que investiram um mínimo no período (o valor mínimo está escrito no cartão)." },
          { n: 12, titulo: "Investindo e sem venda", texto: "Anúncios feitos para vender que gastaram acima do mínimo e não tiveram compra. São os primeiros a revisar. Anúncio de alcance ou engajamento fica de fora: não foi feito para vender." },
          { n: 13, titulo: "Quem compra, e onde", texto: "Idade e gênero, posicionamento e região. Veja abaixo." },
          { n: 14, titulo: "Campanhas", texto: "A tabela de campanhas, do maior investimento para o menor. Clique para abrir conjuntos e anúncios. Veja abaixo." },
          { n: 15, titulo: "Aviso da atribuição", texto: "Lembra que Vendas e ROAS são da Meta, e diz a hora da última atualização." },
          { titulo: "Avisos no topo", texto: "Se a última leitura de uma conta falhou, aparece uma faixa âmbar com o motivo: os números podem estar desatualizados. Sem conta ligada, a tela mostra o passo “Conectar a conta de anúncios”." },
        ],
      },
      {
        titulo: "Campanhas, conjuntos e anúncios",
        print: { chave: "anuncios-campanhas", legenda: "Uma campanha aberta até o anúncio." },
        itens: [
          { n: 1, titulo: "Campanha", texto: "Clique na seta para abrir os conjuntos de anúncios dela." },
          { n: 2, titulo: "Conjunto", texto: "Clique para abrir os anúncios do conjunto." },
          { n: 3, titulo: "Anúncio", texto: "Com a miniatura do criativo (clique para abrir a imagem) e a situação: ativo, pausado, em revisão… Imagem que não carrega vira um ícone." },
          { n: 4, titulo: "ROAS", texto: "Verde = a Meta atribui mais venda do que o gasto; vermelho = menos." },
          { n: 5, titulo: "Total", texto: "A soma de todas as campanhas — os mesmos números dos cartões do topo." },
          { titulo: "Colunas", texto: "Investido, impressões, CTR, CPC (custo por clique), compras, CPA, vendas e ROAS." },
        ],
      },
      {
        titulo: "Quem compra, e onde",
        print: { chave: "anuncios-segmentos", legenda: "A aba Idade e gênero." },
        itens: [
          { n: 1, titulo: "Abas", texto: "Idade e gênero, Posicionamento (Facebook, Instagram e o lugar do anúncio: feed, stories, reels…) e Região (estado). Na Região aparecem as 12 principais e um botão para ver todas." },
          { n: 2, titulo: "Cartões", texto: "ROAS, investimento, compras e CPA de cada gênero (ou das principais plataformas, na aba Posicionamento)." },
          { n: 3, titulo: "Tabela", texto: "Um segmento por linha, com a barra do investimento para comparar o tamanho de cada um." },
          { n: 4, titulo: "ROAS mulheres · homens", texto: "O retorno de cada gênero dentro da faixa de idade." },
          { titulo: "A soma não fecha", texto: "A Meta estima parte das compras por segmento, então a soma dos segmentos pode não bater com o total da página. Use para comparar segmentos entre si." },
        ],
      },
      {
        print: { chave: "anuncios-posicao", legenda: "A aba Posicionamento." },
        itens: [
          { n: 1, titulo: "Investimento pequeno demais", texto: "Segmento que gastou quase nada aparece com o ROAS em cinza e a nota “investimento irrisório”: com poucos reais, uma única compra dá um ROAS enorme que não quer dizer nada." },
        ],
      },
      {
        titulo: "Contas de anúncio",
        print: { chave: "anuncios-contas", legenda: "As contas que o token da Meta enxerga." },
        itens: [
          { n: 1, titulo: "Conta ligada", texto: "Nome, código e moeda. O ✓ verde marca as que entram no painel." },
          { n: 2, titulo: "Parar de ler", texto: "Tira a conta do painel. Os números já lidos continuam guardados." },
          { n: 3, titulo: "Usar esta conta", texto: "Liga a conta e já lê os últimos 90 dias (é o que permite comparar com o período anterior). Depois ela é relida sozinha." },
          { n: 4, titulo: "Situação da conta", texto: "Conta que não está ativa na Meta (desativada, pagamento pendente…) aparece em âmbar." },
          { titulo: "Quem liga e desliga", texto: "Ligar ou desligar conta é para quem tem acesso ao Admin. Se falta o token da Meta, a janela explica, passo a passo, o que quem administra o Business Manager precisa fazer." },
        ],
      },
    ],
  },
];
