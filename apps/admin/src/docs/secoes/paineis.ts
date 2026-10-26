import type { Secao } from "../tipos";

// ─────────────────────────────────────────────────────────────────────────────
// Documentação do Carbo Admin — Dashboards (Mapa da Conquista, Portal de
// Vendas, Licenciados, Metas (Placar), Suprimentos) e Configurar Metas.
//
// ⚠️ O `n` de cada item é o MESMO marcador do print (`chave`), medido pelo
// harness (docs-prints/shots_paineis.mjs). Mudou a tela: refaça o print.
// ─────────────────────────────────────────────────────────────────────────────

const SO_LEITURA = "Esta tela só mostra números: nada do que você clica aqui altera venda, estoque ou meta.";

export const SECOES_PAINEIS: Secao[] = [
  // ── Mapa da Conquista ─────────────────────────────────────────────────────
  {
    id: "mapa-conquista",
    titulo: "Mapa da Conquista",
    rota: "/dashboards/mapa-conquista",
    resumo:
      "Onde a Carbo já chegou. Cada estado (e, ao abrir um estado, cada município) acende quando tem presença: uma venda, um ponto de venda ou um licenciado. O mapa responde “chegamos ou não” — para saber quanto vendemos, use o Dashboard Comercial. " + SO_LEITURA,
    regras: {
      colaborador: [
        "Vê o mapa inteiro, com todas as cidades e os números da empresa.",
      ],
      gestor: [
        "Vê exatamente a mesma tela que o colaborador.",
      ],
    },
    blocos: [
      {
        titulo: "A tela",
        print: { chave: "mapa-conquista", legenda: "O Brasil por estado, com o período “Este mês”." },
        itens: [
          { n: 1, titulo: "Cidades", texto: "Quantos municípios já têm presença da Carbo, e quantos municípios o Brasil tem ao todo." },
          { n: 2, titulo: "Estados", texto: "Em quantos dos 27 estados a Carbo já chegou." },
          { n: 3, titulo: "Novas no período", texto: "Cidades que fizeram a PRIMEIRA compra dentro do período escolhido (item 8). É o número de conquistas." },
          { n: 4, titulo: "Pedidos", texto: "Quantos pedidos essas cidades somam. Com um estado aberto, conta só as cidades daquele estado." },
          { n: 5, titulo: "Faturamento", texto: "Quanto essas cidades somam em vendas. Com um estado aberto, só aquele estado." },
          { n: 6, titulo: "Que presença mostrar", texto: "“Toda presença” acende qualquer cidade com venda, PDV ou licenciado. Os outros botões mostram só um tipo: só onde houve venda, só onde há ponto de venda ou só onde há licenciado." },
          { n: 7, titulo: "Tela cheia", texto: "Esconde os números e a lista ao lado e deixa só o mapa, maior. Bom para deixar numa TV. Clique de novo para sair." },
          { n: 8, titulo: "Período", texto: "Este mês, últimos 30 dias, últimos 90 dias ou este ano. Decide o que conta como “conquista nova”: o cartão Novas, a cor âmbar no mapa e a lista Conquistas mudam juntos." },
          { n: 9, titulo: "Por estado / Por município", texto: "Como o Brasil é desenhado: 27 estados (mais forte = mais cidades conquistadas) ou todos os municípios de uma vez. Dentro de um estado aberto o desenho é sempre por município." },
          { n: 10, titulo: "O mapa", texto: "Passe o mouse num estado para ver quantos municípios dele já acenderam. Clique para abrir o estado: aí aparecem os municípios, e o botão “Ver o Brasil” volta. Dentro do estado, o mouse sobre uma cidade mostra pedidos, PDVs e licenciados dela. A roda do mouse aproxima." },
          { n: 11, titulo: "Legenda", texto: "Verde = conquistado. Âmbar = conquistado dentro do período escolhido (só aparece com os municípios). Escuro = ainda não." },
          { n: 12, titulo: "Conquistas do período", texto: "As cidades mais recentes, com o dia da primeira compra. Mostra até 12; quando há mais, diz “12 de N”." },
          { n: 13, titulo: "Cidades por estado", texto: "Quantos municípios de cada estado já acenderam, de quantos existem. Clique num estado para abri-lo no mapa." },
        ],
      },
      {
        titulo: "Cidade que não aparece no mapa",
        print: { chave: "mapa-nao-localizadas", legenda: "O aviso das cidades que não casaram com a lista do IBGE." },
        itens: [
          { n: 1, titulo: "O aviso", texto: "Aparece só quando alguma cidade não foi achada na lista oficial de municípios. Ela conta nos números do topo, mas não tem onde ser pintada." },
          { n: 2, titulo: "As cidades", texto: "Quase sempre é o comprador escrevendo o nome curto, o bairro ou com erro no endereço (ex.: “Jaboatão” em vez de “Jaboatão dos Guararapes”). Corrigir o pedido não adianta — o próximo chega igual. Mande a lista ao TI: ele cadastra o apelido uma vez e a cidade acende dali em diante." },
          { titulo: "Se o mapa não carregar", texto: "O desenho do mapa vem do IBGE. Se a tela disser “Não consegui carregar o mapa”, o IBGE ou o banco estão fora do ar; tente de novo mais tarde." },
        ],
      },
    ],
  },

  // ── Portal de Vendas ──────────────────────────────────────────────────────
  {
    id: "painel-lojas",
    titulo: "Portal de Vendas (painel)",
    rota: "/dashboards/lojas",
    resumo:
      "O consolidado das lojas que usam o Portal de Vendas (o balcão do CarboZé nos postos): quanto a rede vendeu, quantas unidades e quantas lojas estão ativas no período. " + SO_LEITURA,
    regras: {
      colaborador: [
        "Não vê os números: a tela mostra só o aviso “Sem dados do Portal de Vendas”.",
      ],
      gestor: [
        "Vê o painel inteiro.",
        "Além de ser gestor, precisa ter o Portal de Vendas liberado em Usuários → Sistemas liberados. Sem essa liberação a tela também mostra o aviso, mesmo para o gestor.",
      ],
    },
    blocos: [
      {
        titulo: "A tela",
        papel: "gestor",
        print: { chave: "painel-lojas", legenda: "O painel do mês atual.", papel: "gestor" },
        itens: [
          { n: 1, titulo: "Período", texto: "7 dias, 15 dias, mês atual ou personalizado (duas datas). Vale para a tela inteira. Abre sempre no mês atual." },
          { n: 2, titulo: "Receita", texto: "Quanto as lojas venderam no período, com a variação contra o período anterior de mesmo tamanho (verde subiu, vermelho caiu)." },
          { n: 3, titulo: "Vendas", texto: "Quantas vendas foram registradas no balcão, com a variação contra o período anterior." },
          { n: 4, titulo: "Unidades vendidas", texto: "Quantos produtos saíram no balcão." },
          { n: 5, titulo: "Lojas ativas", texto: "Quantas lojas venderam no período." },
          { n: 6, titulo: "Total de lojas", texto: "Quantas lojas estão cadastradas no Portal, vendendo ou não." },
          { n: 7, titulo: "Estoque", texto: "“Atenção” quando alguma loja tem produto abaixo do mínimo; “Em dia” quando não." },
          { n: 8, titulo: "Ticket médio", texto: "Receita dividida pelo número de vendas." },
          { n: 9, titulo: "Total faturado no período", texto: "Faturamento dia a dia, com o acumulado em cima. Passe o mouse na barra para ver o valor do dia." },
          { n: 10, titulo: "Unidades vendidas no período", texto: "Unidades dia a dia, com o total em cima." },
        ],
      },
      {
        titulo: "Sem acesso",
        print: { chave: "painel-lojas-colab", legenda: "O que aparece para quem não tem acesso." },
        itens: [
          { n: 1, titulo: "Sem dados do Portal de Vendas", texto: "Quem não é gestor vê este aviso. O gestor também o vê se o Portal de Vendas não estiver liberado no usuário dele — peça ao TI para liberar em Usuários → Sistemas liberados." },
        ],
      },
    ],
  },

  // ── Licenciados ───────────────────────────────────────────────────────────
  {
    id: "painel-licenciados",
    titulo: "Licenciados (painel)",
    rota: "/dashboards/franqueados",
    resumo:
      "O consolidado da rede de descarbonização CarboVAPT: quanto os licenciados faturaram, quantos serviços fizeram, quem mais fez e quais lojas não registraram nada no período. " + SO_LEITURA,
    regras: {
      colaborador: [
        "Não vê os números: a tela mostra só o aviso “Sem acesso aos dados da rede”.",
      ],
      gestor: [
        "Vê o painel inteiro.",
        "Além de ser gestor, precisa ter o Portal de Licenciados liberado em Usuários → Sistemas liberados; sem isso a tela mostra o mesmo aviso.",
      ],
    },
    blocos: [
      {
        titulo: "A tela",
        papel: "gestor",
        print: { chave: "painel-licenciados", legenda: "O painel do mês atual.", papel: "gestor" },
        itens: [
          { n: 1, titulo: "Período", texto: "7 dias, 15 dias, mês atual ou personalizado. Vale para todos os blocos da tela." },
          { n: 2, titulo: "Receita no período", texto: "Quanto a rede faturou com serviços, com a variação contra o período anterior. Sem período anterior para comparar, a variação não aparece (em vez de mostrar um 0% que não quer dizer nada)." },
          { n: 3, titulo: "Serviços no período", texto: "Quantas descarbonizações foram registradas, com a variação." },
          { n: 4, titulo: "Ticket médio", texto: "Valor médio de um serviço." },
          { n: 5, titulo: "Lojas ativas", texto: "Quantas lojas estão ativas, de quantas existem." },
          { n: 6, titulo: "Receita / Serviços", texto: "Escolhe o que o gráfico mostra: dinheiro ou quantidade de serviços." },
          { n: 7, titulo: "Dia / Mês", texto: "Barras por dia ou por mês. Em períodos de mais de dois meses a tela já começa por mês." },
          { n: 8, titulo: "Top Licenciados", texto: "As seis lojas que mais fizeram serviços no período, com cidade e faturamento." },
          { n: 9, titulo: "Serviços por categoria", texto: "Leves e caminhonetes (R$ 700) contra pesados (R$ 1.400). Serviço antigo com porte P ou M entra em leves; G entra em pesados. Serviço sem categoria informada não entra no gráfico — embaixo aparece quantos ficaram de fora." },
          { n: 10, titulo: "Últimos serviços", texto: "Os dez serviços mais recentes da rede: loja, categoria, combustível, dia e valor. Esta lista não segue o período — é sempre o que acabou de acontecer." },
        ],
      },
      {
        titulo: "Lojas ativas",
        papel: "gestor",
        print: { chave: "painel-licenciados-lojas", legenda: "A lista das lojas ativas, no fim da tela, depois de “Mostrar mais”.", papel: "gestor" },
        itens: [
          { n: 1, titulo: "Quantas e quantas sem registro", texto: "Total de lojas ativas e quantas não registraram nenhum serviço no período. É a lista de quem precisa de atenção." },
          { n: 2, titulo: "Sem registro", texto: "Loja ativa que não lançou serviço no período. Pode estar parada ou fazendo serviço sem registrar no portal." },
          { n: 3, titulo: "Mostrar mais / Recolher", texto: "A lista mostra 10 lojas por vez, das que mais fizeram para as que menos fizeram. “Mostrar mais” traz as próximas (no print, já clicado); “Recolher” volta às 10 primeiras." },
        ],
      },
    ],
  },

  // ── Metas (Placar) ────────────────────────────────────────────────────────
  {
    id: "painel-metas",
    titulo: "Metas (Placar)",
    rota: "/dashboards/metas",
    resumo:
      "O placar dos vendedores: quanto cada um já vendeu da meta do mês, quem está no ritmo e quem está atrás. É o mesmo placar do Carbo Sales, com os valores em reais. " + SO_LEITURA + " As metas se definem em Configurar Metas.",
    regras: {
      colaborador: [
        "Não vê o placar: a tela mostra “Acesso restrito a gestores”. O vendedor acompanha a própria meta no Carbo Sales.",
      ],
      gestor: [
        "Vê o placar de todos os vendedores, com os valores em reais (realizado, meta, quanto falta e quanto precisa por dia).",
      ],
    },
    blocos: [
      {
        titulo: "O placar do mês",
        papel: "gestor",
        print: { chave: "placar-metas", legenda: "O placar mensal do mês atual.", papel: "gestor" },
        itens: [
          { n: 1, titulo: "Mensal / Semanal", texto: "Troca entre o placar do mês e o da semana comercial (que começa na sexta)." },
          { n: 2, titulo: "O mês", texto: "As setas vão para o mês anterior ou o seguinte. Não dá para passar do mês atual." },
          { n: 3, titulo: "Esperado hoje", texto: "Quanto da meta já deveria estar feito, pelo dia do mês (dia 26 de 31 = 83,9%). As cores comparam cada vendedor com esse número: verde = no ritmo ou à frente, amarelo = até 15 pontos atrás, vermelho = mais atrás que isso." },
          { n: 4, titulo: "Total do time", texto: "Quanto o time inteiro já vendeu, a meta do time e a porcentagem. A barra tem um traço fino na posição do “esperado hoje”." },
          { n: 5, titulo: "Dias restantes, precisa por dia e na meta", texto: "Quantos dias faltam no mês, quanto o time precisa vender por dia para fechar a meta e quantos vendedores já passaram de 100%." },
          { n: 6, titulo: "Projeção", texto: "Se o time continuar no ritmo de hoje, onde ele termina o mês (em reais e em %)." },
          { n: 7, titulo: "Top 3 do mês", texto: "O pódio: os três vendedores com maior porcentagem da meta." },
          { n: 8, titulo: "Cada vendedor", texto: "Uma linha por vendedor, do maior para o menor %: realizado / meta, a porcentagem, a barra com o traço do esperado e a cor do ritmo." },
          { n: 9, titulo: "Faltam e por dia", texto: "Quanto falta para a meta e quanto o vendedor precisa vender por dia até o fim do mês. Ao lado, a projeção dele e quantos pedidos fez." },
          { n: 10, titulo: "Comparado ao mês anterior", texto: "Quanto o vendedor subiu ou caiu contra o mês passado. “primeiro mês” quando não havia venda antes." },
          { titulo: "O que conta como realizado", texto: "A conta é feita no banco e é a mesma do placar do Carbo Sales — os dois mostram o mesmo número." },
        ],
      },
      {
        titulo: "O placar da semana",
        papel: "gestor",
        print: { chave: "placar-semanal", legenda: "A visão semanal.", papel: "gestor" },
        itens: [
          { n: 1, titulo: "Semanal", texto: "A semana comercial vai de sexta a quinta." },
          { n: 2, titulo: "A semana", texto: "As setas andam uma semana para trás ou para a frente, até a semana atual." },
          { n: 3, titulo: "Top 3 da semana", texto: "Os três com maior porcentagem da meta da semana (a meta do mês dividida pelas semanas do mês), com o valor vendido." },
          { n: 4, titulo: "Desempenho da semana", texto: "Uma barra por vendedor, em ordem alfabética, com a % da meta da semana em cima e a posição embaixo. A cor é a projeção: verde = vai fechar a semana, amarelo = perto, vermelho = longe." },
        ],
      },
    ],
  },

  // ── Suprimentos ───────────────────────────────────────────────────────────
  {
    id: "painel-suprimentos",
    titulo: "Suprimentos (painel)",
    rota: "/dashboards/suprimentos",
    resumo:
      "A visão da diretoria sobre o estoque do Hub Natal: quanto dinheiro está parado em estoque, quanto tempo ele dura, o que corre risco de faltar e quanto custa fabricar cada produto. Hoje a tela olha só o Hub Natal; os CDs de São Paulo são acompanhados no Ops. " + SO_LEITURA + " Registrar remessa, ajustar estoque ou mudar mínimo é no Carbo Ops.",
    regras: {
      colaborador: [
        "Não vê o painel: a tela mostra “Área restrita a gestores”.",
      ],
      gestor: [
        "Vê o painel inteiro.",
      ],
    },
    blocos: [
      {
        titulo: "Saúde do estoque",
        papel: "gestor",
        print: { chave: "suprimentos-topo", legenda: "Os cartões do topo, o risco de ruptura e o capital congelado.", papel: "gestor" },
        itens: [
          { n: 1, titulo: "Capital em estoque", texto: "Quanto vale o estoque (quantidade × custo de cada produto) e quantos produtos ativos existem. A setinha embaixo compara com cerca de uma semana atrás." },
          { n: 2, titulo: "Giro anualizado", texto: "Quantas vezes por ano o estoque “gira” no ritmo dos últimos 90 dias, e para quantos dias ele dá. Mais giro = menos dinheiro parado." },
          { n: 3, titulo: "Capital congelado", texto: "Dinheiro que não está trabalhando: o estoque parado (sem movimento em 90 dias) mais o excesso (estoque além de 90 dias de consumo)." },
          { n: 4, titulo: "Risco de ruptura (R$)", texto: "Quanto custaria repor até o mínimo tudo o que está abaixo dele, quantos produtos estão abaixo e quantos estão zerados. A borda fica vermelha quando há produto zerado." },
          { n: 5, titulo: "Cobertura de custo", texto: "Quantos por cento dos produtos têm custo cadastrado. Produto sem custo some do valor do estoque — abaixo de 80% os números de dinheiro da tela ficam menores que a realidade." },
          { n: 6, titulo: "Risco de ruptura", texto: "Os produtos abaixo do mínimo, zerados primeiro e depois os mais caros de repor: quanto tem / quanto deveria ter, para quantos dias dá e quanto custa repor." },
          { n: 7, titulo: "Produtos parados", texto: "Têm estoque e não se mexeram nenhuma vez em 90 dias. São candidatos a liquidação ou a parar de comprar." },
          { n: 8, titulo: "Excesso de estoque", texto: "Ainda vendem, mas há mais de 90 dias de consumo na prateleira. Mostra para quantos dias dá e quanto vale o que passa dos 90 dias." },
        ],
      },
      {
        titulo: "Onde está o dinheiro e quanto custa fabricar",
        papel: "gestor",
        print: { chave: "suprimentos-meio", legenda: "Concentração, maiores valores e custo de fabricação.", papel: "gestor" },
        itens: [
          { n: 1, titulo: "Concentração (ABC)", texto: "Classe A = os poucos produtos que somam 80% do valor do estoque; B = os próximos 15%; C = o resto. Controle mais de perto os itens A." },
          { n: 2, titulo: "Top 10 produtos por valor", texto: "Os dez produtos com mais dinheiro em estoque e quanto do total eles representam." },
          { n: 3, titulo: "Custo de fabricação", texto: "Quanto custa produzir uma unidade, somando os insumos da ficha técnica. Quando o produto usa um semi-acabado, a tela compara “Rotular” (usar o semi-acabado pronto) com “Do zero” e mostra a rota mais barata. Ao lado, o preço sugerido e a margem. Ficha com insumo sem custo aparece como “custo incompleto” e não sugere preço, para não mostrar número enganoso." },
        ],
      },
      {
        titulo: "Entradas, saídas e o que falta cadastrar",
        papel: "gestor",
        print: { chave: "suprimentos-fim", legenda: "O fluxo do estoque e os custos a cadastrar.", papel: "gestor" },
        itens: [
          { n: 1, titulo: "Fluxo de caixa em estoque", texto: "Quanto entrou (produção e compras) e quanto saiu do estoque por dia, em reais." },
          { n: 2, titulo: "30d / 90d", texto: "O período dos dois gráficos de fluxo." },
          { n: 3, titulo: "Fluxo líquido por categoria", texto: "Entradas menos saídas de cada categoria. Positivo = o estoque daquela categoria está crescendo; negativo = está sendo consumido." },
          { n: 4, titulo: "Valor mobilizado por categoria", texto: "Quanto do estoque está em produto final, insumo, embalagem, trade marketing etc." },
          { n: 5, titulo: "Custos a cadastrar", texto: "Produtos que têm estoque mas estão com custo zero. Eles não entram no valor do estoque; o cadastro do custo é feito no Ops." },
        ],
      },
    ],
  },

  // ── Configurar Metas ──────────────────────────────────────────────────────
  {
    id: "configurar-metas",
    titulo: "Configurar Metas",
    rota: "/metas/configurar",
    resumo:
      "Onde se definem as metas de faturamento do mês: a meta de cada vendedor e a meta de cada canal do e-commerce. É daqui que saem os números do Placar de Metas, do Carbo Sales e do Acompanhamento de Metas do e-commerce.",
    regras: {
      colaborador: [
        "Abre a tela, mas os valores realizados mostram só as vendas que ele enxerga — use a versão do gestor como referência.",
      ],
      gestor: [
        "Define a meta padrão e a meta do mês de cada vendedor, a meta geral e a distribuição entre vendedores ou canais.",
        "Toda gravação avisa com uma mensagem no canto da tela (“Meta salva!”).",
      ],
    },
    blocos: [
      {
        titulo: "Metas dos vendedores",
        print: { chave: "metas-config", legenda: "A aba Vendedores do mês atual." },
        itens: [
          { n: 1, titulo: "Vendedores / E-commerce", texto: "As duas abas: metas do time de vendas e metas dos canais da internet." },
          { n: 2, titulo: "O mês", texto: "Vale para as DUAS abas. As setas trocam o mês; não dá para passar do mês atual. Confira o mês antes de salvar." },
          { n: 3, titulo: "Meta geral do mês", texto: "A meta do time inteiro no mês e quanto dela já foi distribuído entre os vendedores. O selo diz se a soma fecha, se faltam reais ou se passou do total." },
          { n: 4, titulo: "Ajustar distribuição", texto: "Abre o painel para definir a meta geral e reparti-la entre os vendedores (veja abaixo). Fica fechado no dia a dia." },
          { n: 5, titulo: "Meta padrão (novo)", texto: "Abre a janela para criar a meta padrão de um vendedor. Hoje a lista de vendedores dessa janela vem vazia — para dar meta a quem está “Sem meta”, use o botão “Meta padrão” na linha da pessoa (item 8)." },
          { n: 6, titulo: "Padrão x deste mês", texto: "A meta padrão vale para todos os meses, sozinha. Quando um mês precisa ser diferente, crie a meta deste mês: ela vale só naquele mês e vence a padrão." },
          { n: 7, titulo: "Selo da meta", texto: "“Meta padrão” (verde), “Específica deste mês” (âmbar) ou “Sem meta”. Embaixo do nome: a meta que vale, o realizado e a porcentagem." },
          { n: 8, titulo: "Meta padrão (editar)", texto: "Muda a meta padrão do vendedor, que vale para todos os meses sem exceção." },
          { n: 9, titulo: "Meta deste mês", texto: "Cria ou muda a exceção só do mês escolhido. Começa preenchida com a meta que vale hoje, para facilitar o ajuste." },
          { n: 10, titulo: "Voltar ao padrão", texto: "Aparece só em quem tem meta específica do mês. Apaga a exceção (com confirmação) e o mês volta a usar a meta padrão." },
        ],
      },
      {
        titulo: "Distribuir a meta geral",
        print: { chave: "metas-distribuir", legenda: "O painel aberto por “Ajustar distribuição”." },
        itens: [
          { n: 1, titulo: "Valor da meta geral", texto: "A meta do time no mês. Digite o valor em reais." },
          { n: 2, titulo: "Dividir igual", texto: "Reparte a meta geral em partes iguais entre as linhas que não estão travadas." },
          { n: 3, titulo: "Proporcional ao realizado", texto: "Reparte de acordo com o que cada um já vendeu no mês. Fica desligado se ninguém vendeu ainda." },
          { n: 4, titulo: "A barra", texto: "Quanto já foi distribuído do total. Verde = fecha; âmbar = falta distribuir; vermelho = passou do total." },
          { n: 5, titulo: "Meta de cada um", texto: "Dá para digitar o valor de uma pessoa à mão. Ao lado, a porcentagem do total e o que ela já vendeu." },
          { n: 6, titulo: "Cadeado", texto: "Trava a linha: os botões de repartir não mexem nela. Digitar um valor à mão já trava sozinho." },
          { n: 7, titulo: "Salvar distribuição", texto: "Grava a meta geral e a meta do mês de cada pessoa. Até salvar, nada mudou — ao fechar o painel com alterações, aparece “alterações não salvas”." },
        ],
      },
      {
        titulo: "Editar a meta de um vendedor",
        print: { chave: "metas-dialogo", legenda: "A janela da meta deste mês." },
        itens: [
          { n: 1, titulo: "Qual meta", texto: "O título diz se você está mexendo na meta padrão (vale todo mês) ou na meta deste mês (só o mês escolhido)." },
          { n: 2, titulo: "Vendedor", texto: "Ao editar, a meta é da pessoa da linha em que você clicou e o campo não muda. Hoje ele aparece em branco, mas a meta é gravada para a pessoa certa." },
          { n: 3, titulo: "Meta de faturamento", texto: "O valor em reais. Digite só os números; a tela formata." },
          { n: 4, titulo: "Salvar", texto: "Grava a meta. Na meta padrão aparece também “Remover padrão”, que tira a meta padrão do vendedor." },
        ],
      },
      {
        titulo: "Metas do e-commerce",
        print: { chave: "metas-ecommerce", legenda: "A aba E-commerce." },
        itens: [
          { n: 1, titulo: "E-commerce", texto: "A aba das metas por canal da internet, no mesmo mês escolhido em cima." },
          { n: 2, titulo: "Meta geral do on-line", texto: "A meta do e-commerce inteiro no mês, com o mesmo “Ajustar distribuição” da aba Vendedores — aqui a meta geral é repartida entre os canais." },
          { n: 3, titulo: "Meta geral e soma dos canais", texto: "A meta geral é guardada à parte. A soma dos canais não precisa bater com ela; a diferença aparece na barra para você decidir." },
          { n: 4, titulo: "Cada canal", texto: "A meta do canal, o realizado no mês (vendas pagas) e a porcentagem." },
          { n: 5, titulo: "Engrenagem", texto: "Abre a janela para definir a meta daquele canal no mês." },
          { n: 6, titulo: "Canal sem meta", texto: "Mostra “Não definida” e não mostra porcentagem — 0% de nada não quer dizer que o canal foi mal." },
          { n: 7, titulo: "Total geral", texto: "A soma das metas dos canais e quantos canais têm meta. É o resultado das metas de cada canal, não um campo para preencher." },
        ],
      },
    ],
  },
];
