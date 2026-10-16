import type { Secao } from "./tipos";

// ─────────────────────────────────────────────────────────────────────────────
// Conteúdo da Documentação do Carbo Pré-Vendas.
//
// ⚠️ O número `n` de cada item é o MESMO marcador desenhado no print (`chave`)
// — quem mede a posição é o harness de prints, que usa a mesma numeração.
// Mudou um botão de lugar ou de nome: refaça o print e confira o número.
// ⚠️ `papel: "gestor"` some para o colaborador (seção, bloco, print ou item).
// ─────────────────────────────────────────────────────────────────────────────

export const SECOES: Secao[] = [
  // ── Comece por aqui ─────────────────────────────────────────────────────────
  {
    id: "comece",
    titulo: "Comece por aqui",
    resumo:
      "O Carbo Pré-Vendas é o sistema da pré-venda: aqui o SDR cadastra o posto indicado, conversa, qualifica e passa a oportunidade para o closer, que fecha a venda. Tudo o que acontece com o lead fica registrado no card dele.",
    blocos: [
      {
        titulo: "Como entrar",
        itens: [
          { titulo: "Pelo Hub", texto: "Entre sempre por carbohub.com.br com o seu usuário (ex.: PSG001) ou o seu e-mail, e a sua senha. No Hub, clique em “Acessar” no cartão Carbo Pré-Vendas." },
          { titulo: "Esqueceu a senha?", texto: "Na tela de entrada do Hub, “Esqueci minha senha” manda um código para o e-mail cadastrado no seu primeiro acesso." },
        ],
      },
      {
        titulo: "O caminho de um lead",
        itens: [
          { titulo: "1. Cadastro", texto: "O posto indicado vira um card na coluna Prospecção, no quadro Pré-Vendas." },
          { titulo: "2. Conversa e qualificação", texto: "O card anda pelas etapas (Primeiro Contato, Qualificação, Conexão com Decisor, Agendamento, Reunião Realizada) enquanto você registra o que foi conversado e responde as perguntas de qualificação." },
          { titulo: "3. Repasse", texto: "Quando o posto está pronto, o card vai para “Oportunidade Qualificada”: um card novo nasce no quadro do Closer, com todo o histórico." },
          { titulo: "4. Fechamento", texto: "O closer leva o card até Ganho e lança a venda. A venda aparece em Vendas e conta nos seus Resultados." },
        ],
      },
      {
        titulo: "Colaborador e gestor",
        texto:
          "O sistema tem dois níveis. O colaborador trabalha os próprios leads: vê e mexe nos cards que ele criou ou que estão com ele. O gestor acompanha o time inteiro.",
        itens: [
          { titulo: "Seu gestor pode comentar no seu card", texto: "Os comentários do gestor aparecem na linha do tempo do card, com o nome dele — muitas vezes fixados no topo, como orientação. Leia antes de ligar para o posto." },
          { papel: "gestor", titulo: "O que muda para o gestor", texto: "Vê os cards, vendas e resultados de todos os SDRs, filtra por pessoa, transfere cards, lança venda em nome de outra pessoa, exclui e atribui vendas, e avalia os chamados de bug. Cada seção desta documentação tem o quadro “O gestor nesta tela”." },
          { papel: "gestor", titulo: "Quem é gestor", texto: "É a marcação “gestor” da função da pessoa no Admin (Estrutura). O closer do Pré-Vendas é gestor; o SDR é colaborador." },
        ],
      },
    ],
  },

  // ── Navegação ───────────────────────────────────────────────────────────────
  {
    id: "navegacao",
    titulo: "Navegação e Visão geral",
    rota: "/",
    resumo: "A barra lateral leva às telas do sistema; a barra de cima tem os atalhos que existem em todos os sistemas do Grupo Carbo.",
    blocos: [
      {
        print: { chave: "inicio", legenda: "Visão geral do Carbo Pré-Vendas, com a barra lateral e a barra de cima." },
        itens: [
          { n: 1, titulo: "Logo", texto: "Volta para o Hub (carbohub.com.br). Com o botão do meio do mouse, abre em outra guia." },
          { n: 2, titulo: "Menu", texto: "Visão geral, Pipeline, Vendas, Resultados e Atendimento. A tela em que você está fica destacada." },
          { n: 3, titulo: "Documentação", texto: "Esta página." },
          { n: 4, titulo: "Recolher menu", texto: "Deixa a barra lateral só com os ícones, para sobrar espaço para o quadro. No celular o menu abre pelo botão ☰ do topo." },
          { n: 5, titulo: "Trocar de sistema", texto: "Lista os sistemas liberados para você e o Início (o Hub)." },
          { n: 6, titulo: "+ Nova Venda", texto: "Abre a tela de venda/orçamento (Vender) de qualquer lugar." },
          { n: 7, titulo: "Notificações", texto: "O sininho mostra avisos: card repassado, comentário no seu card, bug corrigido. O número vermelho é o que você ainda não leu. Clique no aviso para ir até ele; “Marcar lidas” limpa todos." },
          { n: 8, titulo: "Reportar bug ou sugestão", texto: "Abre o pedido ao TI. Veja a seção “Bugs e sugestões”." },
          { n: 9, titulo: "Tema claro / escuro", texto: "Troca as cores. A escolha vale para todos os sistemas do Grupo Carbo." },
          { n: 10, titulo: "Sua conta", texto: "Seu nome e função. O menu tem Meu Perfil, Bugs e sugestões e Sair." },
          { n: 11, titulo: "Atalhos da Visão geral", texto: "Cada cartão abre uma tela: Pipeline, Vendas, Resultados, Atendimento, Vender, Bugs e sugestões, Meu perfil e esta Documentação." },
        ],
      },
      {
        titulo: "Notificações",
        print: { chave: "notificacoes", legenda: "O sininho aberto." },
        itens: [
          { n: 1, titulo: "Não lidas / Todas", texto: "Alterna entre o que você ainda não viu e o histórico." },
          { n: 2, titulo: "Marcar lidas", texto: "Marca todas como lidas de uma vez." },
          { n: 3, titulo: "Um aviso", texto: "Clique para ir até o que ele fala (o card, o chamado…). Passe o mouse para ver a lixeira e apagar o aviso." },
        ],
      },
      {
        titulo: "Faixa de aviso no topo",
        texto:
          "Quando o sistema está instável ou em manutenção, aparece uma faixa colorida logo abaixo da barra de cima. Ela não fecha: some sozinha quando tudo volta ao normal (fica verde por um tempo, dizendo que normalizou). Se a faixa estiver lá, não precisa abrir chamado — o TI já sabe.",
      },
    ],
  },

  // ── Pipeline ────────────────────────────────────────────────────────────────
  {
    id: "pipeline",
    titulo: "Pipeline",
    rota: "/crm/pipelines",
    resumo:
      "O quadro dos leads. Cada coluna é uma etapa e cada card é um posto. O quadro Pré-Vendas é o do SDR; o quadro Closer é para onde vai o que foi repassado.",
    regras: {
      colaborador: [
        "Você vê os cards que você criou ou que estão com você.",
        "No quadro Closer você vê só os cards que você mesmo repassou — para acompanhar o que aconteceu com eles.",
        "Os nomes de responsável que aparecem para você são o seu; card de outra pessoa não chega a você.",
        "O seu gestor vê os seus cards e pode comentar neles.",
      ],
      gestor: [
        "Vê todos os cards do Pré-Vendas e do Closer, de todos os SDRs.",
        "Filtra o quadro por pessoa (“Todos os vendedores”).",
        "Transfere o card para outra pessoa e arquiva card de qualquer um.",
        "Pega os cards que chegam na fila do Closer.",
      ],
    },
    blocos: [
      {
        titulo: "O quadro",
        print: { chave: "pipeline", legenda: "Quadro Pré-Vendas, visão do colaborador." },
        itens: [
          { n: 1, titulo: "Novo Lead", texto: "Cadastra um posto. Veja “Cadastrar um lead”, abaixo." },
          { n: 2, titulo: "Números do quadro", texto: "Total de leads, quantos estão há mais de 3 dias sem atividade e a soma do valor estimado (Pipeline R$). Contam só os cards que você enxerga." },
          { n: 3, titulo: "Qual quadro", texto: "Pré-Vendas (os seus leads), Closer (o que foi repassado) e Todos (os dois juntos, resumidos em colunas Novos, Em andamento, Negociação, Ganhos, Perdidos e Repassados). O número ao lado é a quantidade de cards." },
          { n: 4, titulo: "Situação", texto: "Atalhos de filtro: Comigo (cards em que você é o responsável), Aguardando (parados esperando alguém, ainda no prazo), Espera vencida (o prazo da espera passou) e Sem próximo passo (nada combinado — são os que estão sendo esquecidos)." },
          { n: 5, titulo: "Buscar", texto: "Procura por nome do posto, razão social, contato, CNPJ ou cidade." },
          { n: 6, titulo: "Etapa", texto: "Mostra só os cards de uma etapa." },
          { n: 7, titulo: "Quadro ou lista", texto: "Troca entre as colunas e uma lista simples." },
          { n: 8, titulo: "+ da coluna", texto: "Cadastra um lead já naquela etapa. Abaixo do nome da coluna aparece quanto ela soma em valor estimado." },
          { n: 9, titulo: "Card", texto: "Clique para abrir o card. Arraste para outra coluna para mudar a etapa." },
        ],
      },
      {
        papel: "gestor",
        titulo: "O que o gestor vê a mais no quadro",
        print: { chave: "pipeline-gestor", legenda: "Quadro Pré-Vendas, visão do gestor.", papel: "gestor" },
        itens: [
          { n: 1, titulo: "Todos os vendedores", texto: "Filtra o quadro pela pessoa (responsável ou quem criou). “Avulso” marca quem não está cadastrado como vendedor." },
          { n: 2, titulo: "Contagens do time", texto: "Os números das abas e do topo somam os cards de todos os SDRs." },
          { n: 3, titulo: "Cards de todos", texto: "Os cards de cada SDR aparecem com o nome do responsável." },
        ],
      },
      {
        titulo: "Lendo um card",
        print: { chave: "card", legenda: "Um card do quadro, de perto." },
        itens: [
          { n: 1, titulo: "Temperatura", texto: "Bolinha azul = frio, laranja = morno, vermelha = quente." },
          { n: 2, titulo: "Nome do posto", texto: "Razão social ou nome fantasia. Embaixo, a cidade." },
          { n: 3, titulo: "Telefone", texto: "Clique para abrir a conversa no WhatsApp." },
          { n: 4, titulo: "Valor estimado", texto: "O potencial do posto, em reais." },
          { n: 5, titulo: "Origem", texto: "De onde o lead veio (no Pré-Vendas, quase sempre Indicação). No Closer aparece “⇄ Pré-Vendas · nome do SDR”." },
          { n: 6, titulo: "Aguardando", texto: "O card está parado esperando alguém (o cliente, o decisor, nós ou um documento) até a data mostrada. Fica vermelho quando a data passa." },
          { n: 7, titulo: "Responsável", texto: "Quem está com o card, e há quantos dias ele está na etapa. Faixa laranja na lateral = mais de 3 dias sem atividade; vermelha = mais de 7." },
          { n: 8, titulo: "Avançar", texto: "Leva o card para a próxima etapa. Na etapa antes de Oportunidade Qualificada, abre o repasse." },
          { n: 9, titulo: "Perdido", texto: "Descarta o lead, pedindo o motivo." },
        ],
      },
      {
        titulo: "Passar ao closer (repasse)",
        texto:
          "Arraste o card para “Oportunidade Qualificada” (ou clique em Avançar a partir de Reunião Realizada). Antes de confirmar, o sistema mostra o que vai acontecer.",
        print: { chave: "repasse", legenda: "Confirmação do repasse ao closer." },
        itens: [
          { n: 1, titulo: "O que acontece", texto: "Nasce um card novo no quadro Closer, na fila, com todo o histórico e os comentários. O seu card fica em Oportunidade Qualificada: ele conta como oportunidade entregue, não como venda." },
          { n: 2, titulo: "Qualificação incompleta", texto: "Se faltar alguma resposta (quantos postos, quem decide, movimento, reação, próximo passo), o aviso diz qual. Dá para repassar assim mesmo, mas o closer recebe sem essa informação — preencha antes sempre que puder." },
          { n: 3, titulo: "Recado ao closer", texto: "Opcional: o que o closer precisa saber para a primeira ligação (melhor horário, como o posto conheceu o produto…)." },
          { n: 4, titulo: "Passar ao closer", texto: "Confirma o repasse. Para desistir, clique em Cancelar." },
        ],
      },
      {
        titulo: "Descartar um lead",
        print: { chave: "descarte", legenda: "Descarte com motivo." },
        itens: [
          { n: 1, titulo: "Motivo do descarte", texto: "Obrigatório: fora do perfil, sem volume, não achei o decisor, sem contato válido, não respondeu, já é cliente, concorrente, empresa fechou, duplicado ou outro. O motivo vira informação para melhorar as indicações." },
          { n: 2, titulo: "Confirmar descarte", texto: "Só libera depois de escolher o motivo. O card vai para a coluna Descartado." },
        ],
      },
      {
        titulo: "Cadastrar um lead",
        print: { chave: "novo-lead", legenda: "Formulário de novo lead." },
        itens: [
          { n: 1, titulo: "Pipeline", texto: "Em qual quadro o card nasce. Para o SDR, sempre Pré-Vendas." },
          { n: 2, titulo: "Nome / Empresa", texto: "O único campo obrigatório." },
          { n: 3, titulo: "Contato", texto: "Telefone/WhatsApp, e-mail e origem (já vem Indicação)." },
          { n: 4, titulo: "Qualificação", texto: "As cinco perguntas que o closer precisa: quantos postos (rede), quem decide, movimento do posto, como reagiu à indicação e próximo passo combinado. Pode ficar em branco agora e ser preenchido conforme a conversa avança. Quantos postos é o que mostra o tamanho da oportunidade: uma rede de 20 postos vale muito mais que um posto só." },
          { n: 5, titulo: "Mais detalhes", texto: "Cidade, UF, receita estimada, observações e os dados de faturamento (CNPJ, IE, razão social, endereço). Os dados de faturamento vão preenchidos para a venda." },
          { n: 6, titulo: "Criar lead", texto: "Salva. O card aparece na primeira etapa (ou na coluna do + que você usou)." },
        ],
      },
      {
        titulo: "O card aberto",
        texto: "Clique num card para abrir. O endereço da página muda — dá para copiar e mandar o link do card.",
        print: { chave: "card-aberto", legenda: "Card aberto: dados à esquerda, conversa à direita." },
        itens: [
          { n: 1, titulo: "Etapas", texto: "Clique numa etapa para mover o card (inclusive para trás). Oportunidade Qualificada abre o repasse; Descartado pede o motivo." },
          { n: 2, titulo: "Copiar link", texto: "Copia o endereço deste card, para mandar a alguém." },
          { n: 3, titulo: "Arquivar", texto: "Tira o card das listas sem apagar o histórico. Você arquiva os cards que você criou; a gestão pode desarquivar." },
          { n: 4, titulo: "Aguardando", texto: "Marque quando o negócio está parado esperando alguém: de quem depende, até quando e uma nota. Quando a data passa, o card avisa — renove o prazo ou volte a tocar o negócio." },
          { n: 5, titulo: "Sobre o negócio", texto: "Etapa, valor, origem e datas." },
          { n: 6, titulo: "Qualificação — Editar", texto: "As cinco respostas que vão para o closer. Se faltar alguma, aparece o aviso." },
          { n: 7, titulo: "Nota, Ligação, Tarefa", texto: "Escolha o tipo de registro: nota do que foi conversado, resumo de ligação ou tarefa com data." },
          { n: 8, titulo: "Registrar", texto: "Salva o registro na linha do tempo (atalho: Ctrl+Enter)." },
          { n: 9, titulo: "Linha do tempo", texto: "Tudo o que aconteceu, do mais novo para o mais antigo, com quem fez. O que está fixado fica no topo — o gestor costuma fixar orientações, como esta." },
          { n: 10, titulo: "Avançar", texto: "Próxima etapa." },
          { n: 11, titulo: "Perdido", texto: "Descarta com motivo." },
        ],
      },
      {
        print: { chave: "card-aberto-2", legenda: "Card aberto, mais abaixo na coluna da esquerda." },
        itens: [
          { n: 1, titulo: "Cliente / Contato", texto: "Nome do contato, telefone, e-mail, WhatsApp, cidade, CNPJ. “Editar” corrige." },
          { n: 2, titulo: "Dados de faturamento", texto: "CNPJ/CPF, razão social, IE, endereço. Vão preenchidos para a tela de venda; quando o orçamento é feito, voltam preenchidos para cá." },
          { n: 3, titulo: "Responsável", texto: "Quem está com o card, e o histórico de quem já esteve." },
        ],
      },
      {
        papel: "gestor",
        titulo: "O gestor no card aberto",
        print: { chave: "card-aberto-gestor", legenda: "Card aberto, visão do gestor.", papel: "gestor" },
        itens: [
          { n: 1, titulo: "Transferir para…", texto: "Escolha a pessoa que vai assumir o card." },
          { n: 2, titulo: "Transferir", texto: "Confirma a troca. Fica registrado no histórico de responsáveis." },
          { n: 3, titulo: "Arquivar", texto: "O gestor arquiva o card de qualquer pessoa." },
        ],
      },
      {
        titulo: "O quadro Closer",
        texto:
          "É para onde vão os repasses. O card chega em “Qualificado”, sem dono, e o closer o pega para trabalhar. As etapas são: Lead Recebido, Contato Feito, Qualificado, Orçamento, Proposta Enviada, Negociação, Formalização, Ganho e Perdido.",
        print: { chave: "closer-colaborador", legenda: "Quadro Closer, visão do SDR: só o que ele repassou." },
        itens: [
          { n: 1, titulo: "Aba Closer", texto: "Acompanhe aqui o que aconteceu com os seus repasses." },
          { n: 2, titulo: "Seu repasse", texto: "O card mostra em que etapa o closer está. Quando ele chega em Ganho, a venda aparece em Vendas e nos seus Resultados. Enquanto ninguém assume, o card aberto diz “Repassado ao closer” — quem pega o card é o closer, não o SDR." },
        ],
      },
      {
        papel: "gestor",
        titulo: "O closer pegando o card",
        print: { chave: "closer-gestor", legenda: "Quadro Closer, visão do gestor/closer.", papel: "gestor" },
        itens: [
          { n: 1, titulo: "A fila", texto: "Os repasses chegam em Qualificado, sem responsável." },
          { n: 2, titulo: "De onde veio", texto: "“⇄ Pré-Vendas · nome do SDR” mostra quem repassou." },
          { n: 3, titulo: "Em andamento", texto: "Cards que já têm closer seguem as etapas até Ganho ou Perdido. Em Orçamento e Ganho o sistema oferece montar o orçamento ou lançar a venda." },
        ],
      },
      {
        papel: "gestor",
        print: { chave: "closer-fila", legenda: "Card na fila, aberto pelo closer.", papel: "gestor" },
        itens: [
          { n: 1, titulo: "Pegar este card", texto: "Assume o card: ele passa a ser seu e sai da fila. No quadro Closer só o gestor pega — o SDR acompanha o card dele, mas não o assume." },
          { n: 2, titulo: "Qualificação do SDR", texto: "As respostas que o SDR levantou chegam junto, com o histórico da conversa." },
        ],
      },
    ],
  },

  // ── Vender ──────────────────────────────────────────────────────────────────
  {
    id: "vender",
    titulo: "Vender (orçamento e venda)",
    rota: "/vender",
    resumo:
      "A tela onde nasce o orçamento e a venda. Abre pelo + do topo, pelo atalho Vender da Visão geral, ou pelo card (Montar orçamento), que já traz o cliente preenchido. Os preços vêm da tabela da gestão — ninguém digita preço aqui.",
    regras: {
      colaborador: [
        "A venda fica no seu nome: você é o vendedor e a comissão é sua.",
        "Preço e desconto são os mesmos para todos — o preço vem da tabela e o desconto pode pedir aprovação, conforme a faixa.",
        "Pronta entrega sai da SUA caixa de estoque, quando você tem uma.",
      ],
      gestor: [
        "Tem o quadro “Responsável pela venda”: lança a venda em nome de outra pessoa, e a comissão vai para quem foi escolhido.",
        "Em pronta entrega, o estoque que conta é o da pessoa escolhida.",
      ],
    },
    blocos: [
      {
        titulo: "Cliente",
        print: { chave: "vender-topo", legenda: "Topo da tela de venda, com um orçamento aberto para edição." },
        itens: [
          { n: 1, titulo: "Aviso de edição", texto: "Aparece quando você abre um orçamento ou venda já salvos: diz o número e o que acontece ao salvar. Venda com nota emitida não pode mais mudar itens nem valores — o aviso fica vermelho." },
          { n: 2, titulo: "Tipo de Operação", texto: "CarboZé = produto (nota pelo Bling). CarboVAPT = serviço de descarbonização (nota pelo Portal Nacional). Uma venda é de um tipo só; para vender os dois ao mesmo cliente, registre duas vendas. Trocar o tipo limpa os itens do outro tipo." },
          { n: 3, titulo: "CNPJ ou CPF", texto: "Comece a digitar: se o cliente já está na nossa base (cliente ou lead), ele aparece na lista e os dados vêm junto." },
          { n: 4, titulo: "Buscar dados", texto: "Cliente novo: com CNPJ, busca nome, telefone e endereço na Receita. CPF é só validado — os dados seguem manuais." },
          { n: 5, titulo: "Nome / Razão Social", texto: "Obrigatório: sem nome o pedido não fatura nem é encontrado depois." },
          { n: 6, titulo: "É Licenciado?", texto: "Marque se o cliente é um licenciado Carbo." },
          { n: 7, titulo: "Inscrição Estadual", texto: "Escolha a UF e digite a IE: o sistema confere formato e dígito de qualquer estado. Sem IE, marque “Isento”." },
        ],
      },
      {
        papel: "gestor",
        titulo: "Lançar em nome de outra pessoa",
        print: { chave: "vender-gestor", legenda: "Quadro do responsável pela venda (só gestor).", papel: "gestor" },
        itens: [
          { n: 1, titulo: "Responsável pela venda", texto: "“Eu” deixa a venda no seu nome. Escolhendo outra pessoa o quadro fica laranja (“Lançar venda em nome de”) e a comissão vai para ela." },
        ],
      },
      {
        titulo: "Endereço",
        print: { chave: "vender-endereco", legenda: "Endereço de entrega." },
        itens: [
          { n: 1, titulo: "CEP", texto: "Digite o CEP e a rua, o bairro e a cidade se preenchem. Confira o número." },
          { n: 2, titulo: "Localizar no mapa", texto: "Mostra o ponto aproximado — confira se bate com o local de entrega." },
          { n: 3, titulo: "S/N", texto: "Para endereço sem número." },
          { n: 4, titulo: "Mesmo endereço da entrega", texto: "Desmarque se a nota deve sair com outro endereço (o da empresa). No CarboVAPT esta parte não existe: o endereço da tela já é o de faturamento." },
        ],
      },
      {
        titulo: "Itens do pedido (CarboZé)",
        print: { chave: "vender-itens", legenda: "Itens do pedido com faixa de preço, bonificação e desconto." },
        itens: [
          { n: 1, titulo: "Adicionar Item", texto: "Uma linha nova para outro produto." },
          { n: 2, titulo: "Produto", texto: "Escolha o produto e o preço dele (veja abaixo). O campo mostra o nome completo do que foi escolhido." },
          { n: 3, titulo: "Quantidade", texto: "Quantas unidades. O preço unitário vem da tabela e não se edita; o total da linha é calculado." },
          { n: 4, titulo: "Faixa de preço", texto: "Depois de escolher, a linha confirma qual preço está sendo usado (ex.: Preço de PDV)." },
          { n: 5, titulo: "Desconto", texto: "Em % ou em R$, por linha." },
          { n: 6, titulo: "Bonificação", texto: "O produto de bonificação sai a R$ 0,00 nesta venda e na nota — o desconto de 100% já vem travado." },
          { n: 7, titulo: "Motivo do desconto", texto: "Aparece quando há desconto. Opcional, mas ajuda quem aprova." },
          { n: 8, titulo: "Aprovação", texto: "Diz se o desconto é aprovado automaticamente ou precisa do gestor ou do CEO, conforme o tamanho. É só um aviso: não impede salvar." },
          { n: 9, titulo: "Resumo", texto: "Subtotal, desconto e total do pedido." },
        ],
      },
      {
        titulo: "Escolhendo o produto e o preço",
        texto: "O mesmo produto tem preços diferentes conforme o tipo de cliente. Não é desconto: o valor sai cheio na nota.",
        print: { chave: "vender-produto", legenda: "A lista de produtos aberta." },
        itens: [
          { n: 1, titulo: "Produto", texto: "O nome do produto é o título do grupo." },
          { n: 2, titulo: "Padrão", texto: "O preço de sempre, para compra esporádica." },
          { n: 3, titulo: "PDV", texto: "Para o ponto de venda que revende o nosso produto." },
          { n: 4, titulo: "Microdistribuidor", texto: "Para quem compra em volume e revende como quiser. Use só para quem é microdistribuidor de fato." },
          { n: 5, titulo: "Bonificação", texto: "Grátis: é o brinde, sempre por último. “sem preço” em vermelho significa que a gestão ainda não cadastrou o preço — a venda não sai com esse item." },
        ],
      },
      {
        titulo: "Saída, prazo e recorrência",
        print: { chave: "vender-prazo", legenda: "Como o produto sai, prazo de entrega e recorrência." },
        itens: [
          { n: 1, titulo: "Precisa produzir", texto: "Segue a esteira normal: produção, separação e envio." },
          { n: 2, titulo: "Pronta entrega", texto: "Sai da sua caixa de estoque na hora e o pedido vai direto para a nota. Só aparece liberado se você tem caixa; se faltar produto, a tela diz quanto." },
          { n: 3, titulo: "Data de entrega combinada", texto: "Combine com o cliente. O sistema calcula até quando fabricar (PPF) e expedir (PPE), em dias úteis." },
          { n: 4, titulo: "Prazos calculados", texto: "Se a data for curta demais, aparece o aviso e uma data sugerida — ou a venda abre um pedido de liberação para o gestor." },
          { n: 5, titulo: "Recorrência", texto: "Repete o mesmo pedido nos próximos meses (mensal a anual, de 2 a 60 entregas), já gravado. Cada entrega entra no faturamento do seu mês." },
        ],
      },
      {
        titulo: "Pagamento e observações",
        print: { chave: "vender-pagamento", legenda: "Forma de pagamento, dados estratégicos e observações." },
        itens: [
          { n: 1, titulo: "Forma de Pagamento", texto: "Obrigatória: PIX, boleto à vista, boleto faturado, débito ou crédito parcelado." },
          { n: 2, titulo: "Prazo do faturamento", texto: "Para boleto faturado (ex.: 30/60/90). No crédito aparecem as parcelas." },
          { n: 3, titulo: "Dados Estratégicos", texto: "Opcional: tipo de ponto, classificação, volume mensal, diesel e frotas. Ficam nas notas internas." },
          { n: 4, titulo: "Observações", texto: "Observações públicas saem no orçamento que o cliente recebe. Notas internas só a equipe vê." },
        ],
      },
      {
        titulo: "Salvar",
        print: { chave: "vender-rodape", legenda: "O rodapé da tela, sempre visível." },
        itens: [
          { n: 1, titulo: "Total", texto: "O valor do pedido." },
          { n: 2, titulo: "Cancelar", texto: "Volta sem salvar." },
          { n: 3, titulo: "Gerar Orçamento / Salvar e Gerar PDF", texto: "Salva como orçamento e baixa o PDF (válido por 7 dias). Fica ligado ao card do lead." },
          { n: 4, titulo: "Enviar por E-mail", texto: "Salva e manda o PDF para o e-mail do cliente." },
          { n: 5, titulo: "Gerar Venda / Salvar e Vender", texto: "Registra a venda. Editando uma venda, o botão vira “Salvar alterações”; com nota emitida, “Nota já emitida” e não salva." },
        ],
      },
      {
        titulo: "CarboVAPT (serviço)",
        print: { chave: "vender-vapt", legenda: "Itens de serviço e previsão de execução." },
        itens: [
          { n: 1, titulo: "Modalidade", texto: "Descarbonização P (até 2.5L, flex), M (2.6L a 3.9L) ou G (acima de 4.0L, diesel). O preço é fixo." },
          { n: 2, titulo: "Tem bonificação", texto: "Veículos de cortesia: entram na OS e saem a R$ 0,00." },
          { n: 3, titulo: "Ordem de serviço", texto: "Mostra quantos veículos a OS vai ter para o licenciado executar." },
          { n: 4, titulo: "Serviços que acompanham", texto: "Laudo de Opacidade e Medição de Ruído: entram no orçamento como bonificação, a R$ 0,00. Precisam de ao menos uma descarbonização." },
          { n: 5, titulo: "Previsão de execução", texto: "A data estimada da descarbonização." },
        ],
      },
    ],
  },

  // ── Vendas ──────────────────────────────────────────────────────────────────
  {
    id: "vendas",
    titulo: "Vendas",
    rota: "/vendas",
    resumo: "As vendas e orçamentos que nasceram do Pré-Vendas, com o SDR que originou e o closer que fechou. É daqui que se baixa a nota e a segunda via do orçamento.",
    regras: {
      colaborador: [
        "Você vê as vendas em que você é o SDR, o closer ou quem lançou.",
        "Editar e cancelar uma venda só aparece para quem é o closer (o vendedor) dela.",
        "Baixar PDF e nota fiscal: liberado.",
      ],
      gestor: [
        "Vê as vendas de todo o Pré-Vendas e filtra por closer.",
        "Edita e cancela qualquer venda; só o gestor exclui.",
        "Seleciona várias vendas e atribui o vendedor de uma vez.",
      ],
    },
    blocos: [
      {
        print: { chave: "vendas", legenda: "Vendas e Orçamentos, visão do colaborador." },
        itens: [
          { n: 1, titulo: "Mês", texto: "Navega entre os meses. A data que vale é a do faturamento." },
          { n: 2, titulo: "Período", texto: "Escolha um intervalo livre de datas. “Limpar” volta ao mês." },
          { n: 3, titulo: "Números do mês", texto: "Total vendido, faturado, aguardando faturamento, vindo de meses anteriores, em orçamento e canceladas. Clique num número para filtrar a tabela por ele; clique de novo para tirar o filtro." },
          { n: 4, titulo: "Buscar", texto: "Procura pelo nome do cliente, cidade, CNPJ/CPF, IE, telefone, CEP, e-mail ou número do pedido, em todo o histórico (ignora o mês). Número com 3 dígitos ou mais casa em qualquer parte do documento, telefone, CEP ou IE." },
          { n: 5, titulo: "Status", texto: "Orçamento, Cancelado ou a etapa do pedido (Nova Venda, Em Separação, Em Transporte, Entregue…)." },
          { n: 6, titulo: "SDR e Closer", texto: "Quem originou o lead e quem fechou a venda." },
          { n: 7, titulo: "Editar / Converter", texto: "Em orçamentos: editar, converter em venda ou baixar o PDF." },
          { n: 8, titulo: "Baixar NF", texto: "Abre a nota fiscal (PDF, ou XML se o PDF ainda não chegou). “PDF” baixa a segunda via do pedido." },
          { n: 9, titulo: "Linha", texto: "Clique para abrir os detalhes da venda." },
        ],
      },
      {
        print: { chave: "vendas-detalhe", legenda: "Detalhe de uma venda." },
        itens: [
          { n: 1, titulo: "Cliente", texto: "Nome, CNPJ/CPF, IE e contato." },
          { n: 2, titulo: "Endereços", texto: "Entrega e faturamento." },
          { n: 3, titulo: "Nota fiscal", texto: "O número da nota, quando já emitida." },
          { n: 4, titulo: "Produtos", texto: "Itens, quantidades, descontos e totais. Mais abaixo: pagamento, prazos, SDR/Closer e observações." },
        ],
      },
      {
        papel: "gestor",
        titulo: "O gestor em Vendas",
        print: { chave: "vendas-gestor", legenda: "Seleção em massa e filtro por closer.", papel: "gestor" },
        itens: [
          { n: 1, titulo: "Todos os closers", texto: "Filtra a tabela por quem fechou." },
          { n: 2, titulo: "Seleção", texto: "Marque as vendas (ou todas) para agir em massa." },
          { n: 3, titulo: "Atribuir vendedor", texto: "Troca o vendedor das vendas selecionadas de uma vez." },
        ],
      },
      {
        papel: "gestor",
        print: { chave: "vendas-gestor-detalhe", legenda: "Ações da venda no detalhe (gestor).", papel: "gestor" },
        itens: [
          { n: 1, titulo: "Editar venda", texto: "Abre a venda na tela de venda. Some depois que a nota é emitida." },
          { n: 2, titulo: "Cancelar venda", texto: "Pede o motivo. A venda sai do faturamento, vai para Cancelado no rastreio e o estoque volta." },
          { n: 3, titulo: "Excluir venda", texto: "Só o gestor. Apaga de vez — prefira cancelar, que guarda o histórico." },
          { n: 4, titulo: "Notas internas", texto: "O que a equipe anotou e o cliente não vê." },
        ],
      },
    ],
  },

  // ── Resultados ──────────────────────────────────────────────────────────────
  {
    id: "resultados",
    titulo: "Resultados",
    rota: "/resultados",
    resumo: "Do repasse ao fechamento: o que aconteceu com os leads passados ao closer. Conta pela data do REPASSE — “dos que repassei em outubro, quantos fecharam”, mesmo que tenham fechado em novembro.",
    regras: {
      colaborador: ["Você vê os seus repasses e os seus leads."],
      gestor: ["Vê o time inteiro, com a tabela “Por SDR”, ou escolhe um SDR para ver como ele vê."],
    },
    blocos: [
      {
        print: { chave: "resultados", legenda: "Resultados do mês, visão do colaborador." },
        itens: [
          { n: 1, titulo: "Mês", texto: "Navega entre os meses de repasse." },
          { n: 2, titulo: "Números", texto: "Repassados, fechados, conversão, receita gerada pelos repasses e o tempo médio do repasse até fechar." },
          { n: 3, titulo: "Situação dos repassados", texto: "Quantos fecharam, estão em negociação (e em que etapa), estão na fila sem closer ou foram perdidos." },
          { n: 4, titulo: "Por closer", texto: "Quanto cada closer recebeu, fechou e vendeu." },
          { n: 5, titulo: "Antes do repasse", texto: "Leads criados no mês, descartados e a taxa de repasse." },
          { n: 6, titulo: "Repasses", texto: "Cada lead repassado, com o closer, a etapa e o valor vendido. Clique no nome para abrir o card. “Na fila” = ainda sem closer." },
        ],
      },
      {
        papel: "gestor",
        print: { chave: "resultados-gestor", legenda: "Resultados do time (gestor).", papel: "gestor" },
        itens: [
          { n: 1, titulo: "Todos os SDRs", texto: "Escolha um SDR para ver só os números dele." },
          { n: 2, titulo: "Por SDR", texto: "Repassados, fechados, conversão e receita de cada SDR." },
          { n: 3, titulo: "Coluna SDR", texto: "Na lista de repasses, quem repassou cada lead." },
        ],
      },
    ],
  },

  // ── Atendimento ─────────────────────────────────────────────────────────────
  {
    id: "atendimento",
    titulo: "Atendimento",
    rota: "/atendimento",
    resumo: "Onde vão morar as conversas de WhatsApp com os postos. Por enquanto o Pré-Vendas não tem número próprio: o atendimento é feito pelo WhatsApp Web, e esta tela ainda não envia nem recebe nada.",
    blocos: [
      {
        print: { chave: "atendimento", legenda: "A tela de Atendimento, ainda sem número ativo." },
        itens: [
          { n: 1, titulo: "Sem número ativo", texto: "Enquanto aparecer este aviso, nada é enviado por aqui — use o WhatsApp Web." },
          { n: 2, titulo: "Buscar", texto: "Quando houver conversas: procura por nome ou número." },
          { n: 3, titulo: "Filas", texto: "Não respondidas, Minhas, Sem responsável, Janela aberta e Todas." },
          { n: 4, titulo: "Quem recebe aviso", texto: "Quem é avisado quando chega mensagem nova." },
        ],
      },
    ],
  },

  // ── Bugs e sugestões ────────────────────────────────────────────────────────
  {
    id: "bugs",
    titulo: "Bugs e sugestões",
    rota: "/bugs",
    resumo: "O canal com o TI: algo errado, uma ideia, equipamento, acesso ou dúvida. Abre pela baratinha do topo, de qualquer tela — a tela e o seu usuário já vão junto.",
    regras: {
      colaborador: ["Você reporta e acompanha. Vê a resposta do TI quando houver."],
      gestor: ["Avalia os chamados: escreve a resposta do TI, marca como resolvido, recusa, reabre ou remove."],
    },
    blocos: [
      {
        titulo: "Reportar",
        print: { chave: "bug-dialogo", legenda: "O formulário de reporte." },
        itens: [
          { n: 1, titulo: "Tipo", texto: "Bug (algo errado), Sugestão (melhoria), Equipamento, Acesso (login, permissão, senha) ou Ajuda (dúvida de uso)." },
          { n: 2, titulo: "Resumo", texto: "Uma frase sobre o assunto." },
          { n: 3, titulo: "O que aconteceu", texto: "Conte o passo a passo. Em bug, “usar roteiro” ajuda a não esquecer nada." },
          { n: 4, titulo: "Impacto", texto: "Se te impede de trabalhar, e quem mais sente. É o que define a prioridade." },
          { n: 5, titulo: "Anexar print", texto: "Até 3 imagens — dá para colar com Ctrl+V." },
          { n: 6, titulo: "Enviar", texto: "Manda ao TI (atalho Ctrl+Enter). Depois, “Acompanhar” leva à lista." },
        ],
      },
      {
        titulo: "Acompanhar",
        print: { chave: "bugs", legenda: "A lista de bugs e sugestões." },
        itens: [
          { n: 1, titulo: "Bugs / Sugestões", texto: "Troca entre os dois tipos." },
          { n: 2, titulo: "Situação", texto: "Em andamento, Resolvidos (Feitas), Recusados e Todos." },
          { n: 3, titulo: "Um chamado", texto: "Clique para ver a descrição, o status e a resposta do TI." },
        ],
      },
      {
        papel: "gestor",
        print: { chave: "bugs-gestor", legenda: "Avaliando um chamado (gestor).", papel: "gestor" },
        itens: [
          { n: 1, titulo: "Resposta do TI", texto: "O que quem reportou vai ler." },
          { n: 2, titulo: "Recusar", texto: "Encerra sem atender." },
          { n: 3, titulo: "Marcar como resolvido / feita", texto: "Encerra como atendido." },
        ],
      },
    ],
  },

  // ── Meu perfil ──────────────────────────────────────────────────────────────
  {
    id: "perfil",
    titulo: "Meu perfil",
    rota: "/perfil",
    resumo: "Sua foto e os seus dados no sistema. Pelo menu da sua conta, no canto de cima.",
    blocos: [
      {
        print: { chave: "perfil", legenda: "Meu Perfil." },
        itens: [
          { n: 1, titulo: "Alterar foto", texto: "Escolha uma imagem e ajuste o recorte." },
          { n: 2, titulo: "Seus dados", texto: "Nome, e-mail, departamento e função." },
          { n: 3, titulo: "Outras mudanças", texto: "Para mudar nome, função ou acesso, peça ao seu gestor. A senha se troca pelo Hub (Esqueci minha senha)." },
        ],
      },
    ],
  },
];
