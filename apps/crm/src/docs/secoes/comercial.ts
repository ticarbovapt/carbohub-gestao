import type { Secao } from "../tipos";

// ─────────────────────────────────────────────────────────────────────────────
// Documentação do Carbo Sales — área COMERCIAL: Metas de Vendedores, Pontos de
// Venda, Minha Equipe e Carbo Chat.
//
// ⚠️ O `n` de cada item é o MESMO marcador do print (`chave`), medido pelo
// harness (docs-prints/shots_comercial.mjs). Mudou a tela: refaça o print.
// ─────────────────────────────────────────────────────────────────────────────

export const SECOES_COMERCIAL: Secao[] = [
  // ── Metas de Vendedores ─────────────────────────────────────────────────────
  {
    id: "metas",
    titulo: "Metas de Vendedores",
    rota: "/metas",
    resumo:
      "Mostra quanto cada vendedor já cumpriu da meta do mês e da semana, com o ranking do time. A tela é só para acompanhar: a meta é definida pela gestão, no Carbo Ops.",
    regras: {
      colaborador: [
        "Você vê o ranking do time inteiro, mas só em percentual (%): o valor em R$ da meta e do realizado dos colegas não aparece — nem o seu.",
        "O cartão de cima mostra o percentual cumprido pelo time no mês; o seu está na sua linha da lista.",
        "Ninguém altera meta por aqui.",
      ],
      gestor: [
        "Vê os valores em R$: realizado, meta, quanto falta e quanto precisa vender por dia — do time e de cada vendedor.",
        "Vê quantos vendedores já bateram a meta e a projeção em R$ do fim do mês.",
        "As metas são cadastradas no Carbo Ops; aqui também é só leitura.",
      ],
    },
    blocos: [
      {
        titulo: "O mês",
        print: { chave: "metas", legenda: "Metas do mês, visão do colaborador." },
        itens: [
          { n: 1, titulo: "Mensal ou Semanal", texto: "Troca entre a meta do mês e o desempenho da semana." },
          { n: 2, titulo: "Mês", texto: "As setas voltam e avançam o mês. Não dá para ir além do mês atual." },
          { n: 3, titulo: "Time", texto: "Todos, CGC ou Expansão: mostra só os vendedores daquele time." },
          { n: 4, titulo: "Esperado hoje", texto: "Quanto da meta já deveria estar feito pelo dia do mês (ex.: no dia 26 de 31, 83,9%). É a régua das cores: verde = no ritmo ou acima, amarelo = até 15 pontos abaixo, vermelho = mais que isso abaixo. O tracinho cinza na barra marca esse ponto." },
          { n: 5, titulo: "Cartão do mês", texto: "O percentual cumprido pelo time, os dias que faltam e a projeção: se o ritmo continuar igual, com quanto o mês fecha." },
          { n: 6, titulo: "Top 3 do Mês", texto: "O pódio de quem está mais perto (ou acima) da própria meta." },
          { n: 7, titulo: "Linha do vendedor", texto: "Posição no ranking, nome, barra de progresso e o percentual cumprido. O ranking é por percentual da meta de cada um, não por valor vendido." },
          { n: 8, titulo: "Projeção", texto: "Com quanto da meta a pessoa termina o mês se mantiver o ritmo de agora." },
          { titulo: "O que conta como realizado", texto: "Conta a venda faturada (com nota fiscal emitida), na data da venda. Orçamento e pedido cancelado não contam, e a parte de serviço de descarbonização fica de fora. Venda que ainda espera a nota entra quando a nota sai." },
        ],
      },
      {
        papel: "gestor",
        titulo: "O que o gestor vê a mais",
        print: { chave: "metas-gestor", legenda: "Metas do mês, visão do gestor.", papel: "gestor" },
        itens: [
          { n: 1, titulo: "Total do Time", texto: "Quanto o time já vendeu no mês sobre a soma das metas." },
          { n: 2, titulo: "Precisa por dia", texto: "Quanto o time precisa vender por dia, nos dias que restam, para bater a meta." },
          { n: 3, titulo: "Na meta", texto: "Quantos vendedores já passaram de 100% da própria meta." },
          { n: 4, titulo: "Projeção em R$", texto: "O valor com que o mês fecha se o ritmo continuar." },
          { n: 5, titulo: "Detalhe do vendedor", texto: "Quanto falta, quanto ele precisa vender por dia, a projeção, o número de pedidos e a comparação com o mês anterior." },
        ],
      },
      {
        titulo: "A semana",
        print: { chave: "metas-semanal", legenda: "Metas da semana." },
        itens: [
          { n: 1, titulo: "Semana", texto: "A semana comercial vai de sexta a quinta. As setas trocam de semana." },
          { n: 2, titulo: "Top 3 da Semana", texto: "Quem mais avançou na meta da semana." },
          { n: 3, titulo: "Desempenho da Semana", texto: "Uma barra por vendedor, em ordem alfabética, com o percentual da meta semanal (a meta do mês dividida pelas semanas). A cor mostra a tendência: verde se o ritmo leva a 100% até o fim da semana, amarelo a partir de 70%, vermelho abaixo disso." },
        ],
      },
    ],
  },

  // ── Pontos de Venda ─────────────────────────────────────────────────────────
  {
    id: "pdvs",
    titulo: "Pontos de Venda",
    rota: "/pdvs",
    resumo:
      "O cadastro dos PDVs — postos e lojas que revendem o CarboZé. Venda feita para um CNPJ daqui entra sozinha como canal Revenda. Cada PDV mostra também o que ele compra e o que ele vende na prateleira.",
    regras: {
      colaborador: [
        "Vê todos os PDVs do cadastro e o histórico de pedidos de cada um.",
        "Pode cadastrar PDV novo: quem acha a loja na rua cadastra na hora.",
        "Não edita, não pausa e não desativa PDV — peça ao seu gestor.",
      ],
      gestor: [
        "Edita qualquer PDV: dados, endereço, dono da carteira e mix de produto.",
        "Pausa, reativa e desativa PDV.",
      ],
    },
    blocos: [
      {
        titulo: "A lista",
        print: { chave: "pdvs", legenda: "Pontos de Venda, visão do colaborador." },
        itens: [
          { n: 1, titulo: "Novo PDV", texto: "Cadastra um ponto de venda. Veja “Cadastrar um PDV”, abaixo." },
          { n: 2, titulo: "Contadores", texto: "Total, Ativos, Cadastrados, Pausados e Inativos. Clique num deles para filtrar a lista. “Cadastrado” é o ponto que existe mas ainda não vende — ele não conta como ativo." },
          { n: 3, titulo: "Buscar", texto: "Procura por nome, razão social, CNPJ, rua, cidade, CEP, código do PDV ou nome do dono. Para CNPJ e CEP, basta digitar os números." },
          { n: 4, titulo: "UF", texto: "Mostra só os PDVs de um estado." },
          { n: 5, titulo: "Dono", texto: "Mostra só a carteira de um vendedor." },
          { n: 6, titulo: "Resumo", texto: "Quantos aparecem com os filtros, quantos já compraram, quantos estão sem documento e sem dono." },
          { n: 7, titulo: "Ordenar", texto: "Clique no nome de qualquer coluna para ordenar; clique de novo para inverter. Pedidos, Comprado e Última começam do maior/mais recente." },
          { n: 8, titulo: "Sem documento", texto: "PDV sem CNPJ/CPF. As vendas dele não viram Revenda sozinhas e o histórico de pedidos não aparece. Preencha o documento." },
          { n: 9, titulo: "Mix", texto: "O que o ponto revende: 10ml (sachê), 100ml e 1L. Verde = vende, cinza = não vende, laranja = a confirmar (ninguém conferiu ainda — é onde falta visita). Passe o mouse para ver o preço." },
          { n: 10, titulo: "Microdistribuidor", texto: "Etiqueta do PDV que também é microdistribuidor. Ele continua sendo ponto de venda e contando na base." },
          { n: 11, titulo: "Linha do PDV", texto: "Clique em qualquer lugar da linha para abrir o PDV. PDV que não está ativo aparece mais claro." },
        ],
      },
      {
        papel: "gestor",
        titulo: "Ações do gestor",
        print: { chave: "pdvs-gestor", legenda: "A coluna Ações, que só o gestor vê.", papel: "gestor" },
        itens: [
          { n: 1, titulo: "Editar", texto: "Abre o cadastro do PDV para alterar dados, endereço, dono e mix." },
          { n: 2, titulo: "Pausar", texto: "Marca o PDV como pausado (parou por um tempo)." },
          { n: 3, titulo: "Reativar", texto: "Volta o PDV pausado, cadastrado ou inativo para ativo." },
          { n: 4, titulo: "Desativar", texto: "Marca o PDV como inativo. Nada é apagado: o PDV continua na lista e os pedidos continuam ligados a ele." },
          { titulo: "Pausar não muda o passado", texto: "Pausar ou desativar não reclassifica vendas antigas: o que foi comprado enquanto era PDV continua contando como Revenda." },
        ],
      },
      {
        titulo: "Abrir um PDV",
        print: { chave: "pdv-detalhe", legenda: "O PDV aberto, com o histórico de pedidos." },
        itens: [
          { n: 1, titulo: "Cabeçalho", texto: "Nome, situação e código do PDV; embaixo, razão social, CNPJ e cidade." },
          { n: 2, titulo: "Números", texto: "Pedidos, total comprado, primeira e última compra, data de abertura do ponto e o vendedor dono da carteira." },
          { n: 3, titulo: "Abrir no mapa", texto: "Abre o endereço no Google Maps. Só aparece quando a rua está cadastrada. Sem endereço, o quadro avisa — edite o PDV para preencher." },
          { n: 4, titulo: "Mix de produto", texto: "O que o ponto vende e o preço ao consumidor final. “Preço não registrado” quer dizer que ninguém anotou — não que é de graça." },
          { n: 5, titulo: "Pedidos", texto: "Todas as compras feitas com o CNPJ deste PDV: número, data, vendedor, nota fiscal e total." },
          { n: 6, titulo: "Conta?", texto: "“Conta” = o pedido entra no faturamento. “Não conta” = orçamento, cancelado ou ainda sem nota fiscal." },
        ],
      },
      {
        titulo: "Cadastrar um PDV",
        print: { chave: "pdv-novo", legenda: "O formulário de PDV novo." },
        itens: [
          { n: 1, titulo: "Nome comercial", texto: "Como o time chama o ponto. É o único campo obrigatório." },
          { n: 2, titulo: "Razão social", texto: "Como sai na nota fiscal." },
          { n: 3, titulo: "CNPJ / CPF", texto: "O campo mais importante: é ele que liga o PDV às vendas. Pode digitar com ou sem pontuação. Cada CNPJ é um PDV — filiais da mesma rede são PDVs separados, e o nome não serve para identificar o ponto." },
          { n: 4, titulo: "Status", texto: "Ativo (já vende), Cadastrado (existe, mas ainda não vende), Pausado ou Inativo. Ponto que você acabou de conhecer e ainda não comprou entra como Cadastrado." },
          { n: 5, titulo: "Vendedor dono", texto: "De quem é a carteira do ponto. Não muda o vendedor das vendas já feitas nem a comissão." },
          { n: 6, titulo: "Também é microdistribuidor", texto: "Marque se o ponto também revende para outras lojas, e informe desde quando. Essa data é diferente da Abertura do ponto." },
          { n: 7, titulo: "Endereço", texto: "Rua, número e bairro; depois cidade, UF e CEP. É o endereço que a agenda de visitas e o mapa usam." },
          { n: 8, titulo: "Mix de produto", texto: "Para cada produto: Vende, Não vende ou A confirmar, e o preço de revenda. Deixe o preço em branco se não sabe — em branco fica vazio, não R$ 0,00." },
          { n: 9, titulo: "Cadastrar", texto: "Salva o PDV. Depois de salvo, só o gestor consegue alterar." },
        ],
      },
    ],
  },

  // ── Minha Equipe ────────────────────────────────────────────────────────────
  {
    id: "equipe",
    titulo: "Minha Equipe",
    rota: "/equipe",
    resumo:
      "A lista dos colegas do seu departamento, para achar contato rápido. É só para consultar: ninguém edita nada por aqui.",
    regras: {
      colaborador: [
        "Vê os colegas do(s) departamento(s) em que você está cadastrado, com função e e-mail.",
      ],
      gestor: [
        "Vê a mesma lista que o colaborador — esta tela não tem nada a mais para o gestor.",
        "Cadastro de pessoas, funções e acessos é feito pelo TI.",
      ],
    },
    blocos: [
      {
        print: { chave: "equipe", legenda: "Minha Equipe, aberta pelo menu da sua conta." },
        itens: [
          { n: 1, titulo: "Como chegar", texto: "Clique no seu nome, no canto de cima, e escolha “Minha equipe”." },
          { n: 2, titulo: "Buscar", texto: "Procura por nome, usuário ou e-mail." },
          { n: 3, titulo: "Colega", texto: "Foto, nome, função e departamento. Quem tem duas funções aparece com as duas." },
          { n: 4, titulo: "E-mail", texto: "Clique para escrever um e-mail para a pessoa." },
          { n: 5, titulo: "Sem e-mail", texto: "A pessoa não tem e-mail cadastrado. Fale com ela pelo Carbo Chat." },
        ],
      },
    ],
  },

  // ── Carbo Chat ──────────────────────────────────────────────────────────────
  {
    id: "chat",
    titulo: "Carbo Chat",
    rota: "/chat",
    resumo:
      "O chat interno do Grupo Carbo: conversas diretas com colegas, grupos e os avisos da empresa. É o mesmo chat em todos os sistemas — a conversa começada aqui continua no Ops, no Finanças e nos outros.",
    blocos: [
      {
        print: { chave: "chat", legenda: "O Carbo Chat com uma conversa aberta." },
        itens: [
          { n: 1, titulo: "Carbo Chat no menu", texto: "O número verde é quantas mensagens você ainda não leu, somando todas as conversas." },
          { n: 2, titulo: "Seu status", texto: "Clique para avisar se está Disponível, Em campo, Em reunião, De férias ou Ausente, e por quanto tempo. Os colegas veem ao lado do seu nome." },
          { n: 3, titulo: "Início / Mural", texto: "Abre o mural da empresa: avisos, recados e aniversariantes." },
          { n: 4, titulo: "Explorar canais", texto: "Lista os grupos abertos em que você pode entrar." },
          { n: 5, titulo: "Mensagens agendadas", texto: "As mensagens que você programou para enviar depois. Dá para editar ou cancelar antes do envio." },
          { n: 6, titulo: "Nova conversa", texto: "Começa uma conversa com um colega ou cria um grupo." },
          { n: 7, titulo: "Buscar", texto: "Procura conversas e mensagens. Atalho: Ctrl+K." },
          { n: 8, titulo: "Tudo / Grupos", texto: "Mostra todas as conversas ou só os grupos. Quando há conversa arquivada, aparece também “Arquivadas”." },
          { n: 9, titulo: "Uma conversa", texto: "Nome, última mensagem e o horário. A bolinha verde é o número de não lidas; o alfinete marca conversa fixada no topo e o sino cortado, conversa silenciada. Passe o mouse e clique em ⋯ para fixar, silenciar, arquivar ou marcar como não lida." },
          { n: 10, titulo: "Ligar", texto: "Faz uma chamada de voz com a pessoa (no grupo, abre a chamada do grupo)." },
          { n: 11, titulo: "Buscar na conversa", texto: "Procura uma mensagem antiga só nesta conversa." },
          { n: 12, titulo: "Reações", texto: "Passe o mouse numa mensagem para reagir com emoji, responder, editar ou apagar a sua." },
          { n: 13, titulo: "Anexar", texto: "Envia foto, vídeo, arquivo ou cria uma enquete. O botão ao lado insere emoji." },
          { n: 14, titulo: "Escrever", texto: "Enter envia; Shift+Enter pula linha. Com o campo vazio, o microfone à direita grava um áudio. Com texto, a seta ao lado do enviar deixa agendar o envio." },
          { titulo: "Avisos no celular", texto: "Para receber as mensagens com o sistema fechado, use o botão “Ativar notificações” que aparece embaixo da lista de conversas (só aparece quando o aparelho ainda não está ativado). No celular, ative pelo Hub (carbohub.com.br)." },
        ],
      },
    ],
  },
];
