import type { Secao } from "../tipos";

// Comece por aqui, navegação e Pipeline do Carbo Sales. O texto do Pipeline
// parte do do Pré-Vendas (os componentes do CRM são os mesmos nos dois apps),
// com o que é só do Sales: as quatro pipelines, o segmento e o repasse
// Outbound → Inbound.

export const SECOES_BASE: Secao[] = [
  // ── Comece por aqui ─────────────────────────────────────────────────────────
  {
    id: "comece",
    titulo: "Comece por aqui",
    resumo:
      "O Carbo Sales é o sistema do time comercial: o lead vira card no Pipeline, o card vira orçamento e venda, e a venda é acompanhada até a entrega. É também onde o vendedor registra as visitas aos pontos de venda, vê a sua caixa de estoque e acompanha as ordens de serviço da descarbonização.",
    blocos: [
      {
        titulo: "Como entrar",
        itens: [
          { titulo: "Pelo Hub", texto: "Entre sempre por carbohub.com.br com o seu usuário ou o seu e-mail, e a sua senha. No Hub, clique em “Acessar” no cartão Carbo Sales." },
          { titulo: "Esqueceu a senha?", texto: "Na tela de entrada do Hub, “Esqueci minha senha” manda um código para o e-mail cadastrado no seu primeiro acesso." },
        ],
      },
      {
        titulo: "O caminho de uma venda",
        itens: [
          { titulo: "1. Lead", texto: "O cliente em potencial vira um card no Pipeline (Comercial Expansão, Outbound, Inbound ou Follow up)." },
          { titulo: "2. Conversa", texto: "O card anda pelas etapas enquanto você registra ligações, notas e tarefas na linha do tempo dele." },
          { titulo: "3. Orçamento e venda", texto: "Em Orçamento o card oferece montar o orçamento; em Ganho, lançar a venda. Os dois abrem a tela Vender com o cliente preenchido." },
          { titulo: "4. Entrega", texto: "A venda aparece em Vendas e no Rastreio de venda, onde você acompanha a nota fiscal, a separação e a entrega." },
        ],
      },
      {
        titulo: "Colaborador e gestor",
        texto:
          "O sistema tem dois níveis. O colaborador trabalha os próprios clientes: vê e mexe no que ele criou ou que está com ele. O gestor acompanha o time inteiro.",
        itens: [
          { titulo: "Seu gestor pode comentar no seu card", texto: "Os comentários do gestor aparecem na linha do tempo do card, com o nome dele — muitas vezes fixados no topo, como orientação. Leia antes de ligar para o cliente." },
          { papel: "gestor", titulo: "O que muda para o gestor", texto: "Vê os cards, vendas, metas e visitas de todo o time, filtra por pessoa, transfere cards, lança venda em nome de outra pessoa, cancela e exclui vendas, e avalia os chamados de bug. Cada seção desta documentação tem o quadro “O gestor nesta tela”." },
          { papel: "gestor", titulo: "Quem é gestor", texto: "É a marcação “gestor” da função da pessoa no Admin (Estrutura)." },
        ],
      },
    ],
  },

  // ── Navegação ───────────────────────────────────────────────────────────────
  {
    id: "navegacao",
    titulo: "Navegação",
    resumo: "A barra lateral leva às telas do sistema; a barra de cima tem os atalhos que existem em todos os sistemas do Grupo Carbo. Ao entrar, o Sales abre no Pipeline.",
    blocos: [
      {
        print: { chave: "inicio", legenda: "O Carbo Sales, com a barra lateral e a barra de cima." },
        itens: [
          { n: 1, titulo: "Logo", texto: "Volta para o Hub (carbohub.com.br). Com o botão do meio do mouse, abre em outra guia." },
          { n: 2, titulo: "Menu", texto: "Carbo Chat; Comercial (Pipelines, Vendas, Metas, Pontos de Venda, Agenda de visitas); Pedidos (Rastreio de venda, Meu Estoque, Requisição de Compra); Descarbonização (Ordens de Serviço). A tela em que você está fica destacada." },
          { n: 3, titulo: "Documentação", texto: "Esta página." },
          { n: 4, titulo: "Recolher menu", texto: "Deixa a barra lateral só com os ícones, para sobrar espaço para o quadro. No celular o menu abre pelo botão ☰ do topo." },
          { n: 5, titulo: "Trocar de sistema", texto: "Lista os sistemas liberados para você e o Início (o Hub)." },
          { n: 6, titulo: "+ Nova Venda", texto: "Abre a tela de venda/orçamento (Vender) de qualquer lugar." },
          { n: 7, titulo: "Notificações", texto: "O sininho mostra avisos: lead repassado, comentário no seu card, bug corrigido. O número vermelho é o que você ainda não leu." },
          { n: 8, titulo: "Reportar bug ou sugestão", texto: "Abre o pedido ao TI. Veja a seção “Bugs e sugestões”." },
          { n: 9, titulo: "Tema claro / escuro", texto: "Troca as cores. A escolha vale para todos os sistemas do Grupo Carbo." },
          { n: 10, titulo: "Sua conta", texto: "Seu nome e função. O menu tem Meu Perfil, Minha Equipe, Bugs e sugestões e Sair." },
          { n: 11, titulo: "Pipelines", texto: "A tela inicial do Sales." },
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
      {
        titulo: "Venda on-line",
        texto:
          "Quem foi escolhido para receber o aviso de venda do e-commerce ouve um som e vê um aviso no canto da tela, em qualquer sistema que estiver usando. Para entrar ou sair dessa lista, fale com o TI.",
      },
    ],
  },

  // ── Pipeline ────────────────────────────────────────────────────────────────
  {
    id: "pipeline",
    titulo: "Pipeline",
    rota: "/crm/pipelines",
    resumo:
      "O quadro dos leads. Cada coluna é uma etapa e cada card é um cliente em potencial. São quatro pipelines: Comercial Expansão (PDVs, frotistas, licenciados e contas com motores), Outbound (o SDR prospectando), Inbound (o closer, que recebe o que o SDR qualificou e os leads de anúncio) e Follow up (recompra da base de clientes).",
    regras: {
      colaborador: [
        "Você vê os cards que você criou ou que estão com você.",
        "Os números do topo e das abas contam só os seus cards.",
        "O seu gestor vê os seus cards e pode comentar neles.",
      ],
      gestor: [
        "Vê os cards de todo o time.",
        "Filtra o quadro por pessoa (“Todos os vendedores”).",
        "Transfere o card para outra pessoa e arquiva card de qualquer um.",
      ],
    },
    blocos: [
      {
        titulo: "O quadro",
        print: { chave: "pipeline", legenda: "Comercial Expansão, visão do colaborador." },
        itens: [
          { n: 1, titulo: "Novo Lead", texto: "Cadastra um cliente em potencial. Veja “Cadastrar um lead”, abaixo." },
          { n: 2, titulo: "Números do quadro", texto: "Total de leads, quantos estão quentes, quantos estão há mais de 3 dias sem atividade, a soma do valor estimado (Pipeline R$) e a média de tentativas de contato." },
          { n: 3, titulo: "Qual pipeline", texto: "Todos, Comercial Expansão, Outbound, Inbound e Follow up. O número ao lado é a quantidade de cards." },
          { n: 4, titulo: "Situação", texto: "Atalhos de filtro: Comigo (cards em que você é o responsável), Aguardando (parados esperando alguém, ainda no prazo), Espera vencida (o prazo da espera passou) e Sem próximo passo (nada combinado — são os que estão sendo esquecidos). Logo abaixo, o filtro por Segmento (PDV, frotista, licenciado…)." },
          { n: 5, titulo: "Buscar", texto: "Procura por nome, razão social, contato, CNPJ ou cidade." },
          { n: 6, titulo: "Etapa", texto: "Mostra só os cards de uma etapa." },
          { n: 7, titulo: "Quadro ou lista", texto: "Troca entre as colunas e uma lista simples." },
          { n: 8, titulo: "+ da coluna", texto: "Cadastra um lead já naquela etapa. Abaixo do nome da coluna aparece quanto ela soma em valor estimado." },
          { n: 9, titulo: "Card", texto: "Clique para abrir o card. Arraste para outra coluna para mudar a etapa." },
        ],
      },
      {
        papel: "gestor",
        titulo: "O que o gestor vê a mais no quadro",
        print: { chave: "pipeline-gestor", legenda: "Comercial Expansão, visão do gestor.", papel: "gestor" },
        itens: [
          { n: 1, titulo: "Todos os vendedores", texto: "Filtra o quadro pela pessoa (responsável ou quem criou). “Avulso” marca quem não está cadastrado como vendedor." },
          { n: 2, titulo: "Contagens do time", texto: "Os números das abas e do topo somam os cards de todo o time." },
          { n: 3, titulo: "Cards de todos", texto: "Os cards de cada vendedor aparecem com o nome do responsável." },
        ],
      },
      {
        titulo: "Lendo um card",
        print: { chave: "card", legenda: "Um card do quadro, de perto." },
        itens: [
          { n: 1, titulo: "Temperatura", texto: "Bolinha azul = frio, laranja = morno, vermelha = quente." },
          { n: 2, titulo: "Nome", texto: "Razão social ou nome fantasia. Embaixo, a cidade." },
          { n: 3, titulo: "Telefone", texto: "Clique para abrir a conversa no WhatsApp." },
          { n: 4, titulo: "Valor estimado", texto: "O potencial do cliente, em reais." },
          { n: 5, titulo: "Origem e segmento", texto: "De onde o lead veio (indicação, anúncio, prospecção…) e o segmento dele. Card repassado mostra “⇄ Outbound · nome do SDR”." },
          { n: 6, titulo: "Aguardando", texto: "O card está parado esperando alguém (o cliente, o decisor, nós ou um documento) até a data mostrada. Fica vermelho quando a data passa." },
          { n: 7, titulo: "Responsável", texto: "Quem está com o card, e há quantos dias ele está na etapa. Faixa laranja na lateral = mais de 3 dias sem atividade; vermelha = mais de 7." },
          { n: 8, titulo: "Avançar", texto: "Leva o card para a próxima etapa." },
          { n: 9, titulo: "Perdido", texto: "Encerra o lead, pedindo o motivo." },
        ],
      },
      {
        titulo: "Orçamento e Ganho",
        texto:
          "Ao mover o card para Orçamento, o sistema oferece montar o orçamento; ao mover para Ganho, oferece fechar a venda. Os dois abrem a tela Vender com o cliente preenchido, e o orçamento fica ligado ao card. Se já existe orçamento no card, ele aparece ali para virar venda.",
      },
      {
        titulo: "Outbound → Inbound (repasse do SDR ao closer)",
        texto:
          "No Outbound, quando o lead está qualificado, mova o card para “Passado ao Closer”. Abre a confirmação “Passar ao closer”: um card novo nasce no Inbound, na fila, com todo o histórico e os comentários. Se faltar alguma resposta da qualificação, o aviso diz qual — dá para repassar assim mesmo. O campo “Recado ao closer” é opcional. O card do SDR fica em “Passado ao Closer”: conta como oportunidade entregue, nunca como receita.",
      },
      {
        titulo: "Perder ou descartar um lead",
        print: { chave: "descarte", legenda: "Encerrando um lead como perdido." },
        itens: [
          { n: 1, titulo: "Motivo", texto: "Obrigatório. A lista muda conforme a pipeline: no Outbound o SDR descarta (fora do perfil, sem contato…); nas outras o lead é perdido (preço, concorrente…). O motivo vira informação para melhorar a abordagem." },
          { n: 2, titulo: "Confirmar perda", texto: "Só libera depois de escolher o motivo. O card vai para a coluna Perdido (ou Descartado, no Outbound)." },
        ],
      },
      {
        titulo: "Cadastrar um lead",
        print: { chave: "novo-lead", legenda: "Formulário de novo lead." },
        itens: [
          { n: 1, titulo: "Pipeline", texto: "Em qual pipeline o card nasce." },
          { n: 2, titulo: "Segmento", texto: "PDV, frotista, licenciado… Pode ficar “A definir” e ser escolhido depois, no card." },
          { n: 3, titulo: "Nome / Empresa", texto: "O único campo de texto obrigatório." },
          { n: 4, titulo: "Contato", texto: "Telefone/WhatsApp, e-mail e a origem do lead. Abaixo, cidade, UF, receita estimada e observações." },
          { n: 5, titulo: "Dados de faturamento", texto: "CNPJ, IE, razão social e endereço (opcional). Vão preenchidos para a tela de venda." },
          { n: 6, titulo: "Criar lead", texto: "Salva. O card aparece na primeira etapa (ou na coluna do + que você usou)." },
        ],
      },
      {
        titulo: "O card aberto",
        texto: "Clique num card para abrir. O endereço da página muda — dá para copiar e mandar o link do card.",
        print: { chave: "card-aberto", legenda: "Card aberto: dados à esquerda, conversa à direita." },
        itens: [
          { n: 1, titulo: "Etapas", texto: "Clique numa etapa para mover o card (inclusive para trás). Perdido pede o motivo; Orçamento e Ganho oferecem montar o orçamento ou fechar a venda." },
          { n: 2, titulo: "Copiar link", texto: "Copia o endereço deste card, para mandar a alguém." },
          { n: 3, titulo: "Arquivar", texto: "Tira o card das listas sem apagar o histórico. Você arquiva os cards que você criou; a gestão pode desarquivar." },
          { n: 4, titulo: "Aguardando", texto: "Marque quando o negócio está parado esperando alguém: de quem depende, até quando e uma nota. Quando a data passa, o card avisa — renove o prazo ou volte a tocar o negócio." },
          { n: 5, titulo: "Sobre o negócio", texto: "Etapa, segmento (dá para trocar aqui), valor, origem e datas." },
          { n: 6, titulo: "Qualificação — Editar", texto: "Volume/frota, dor, decisor e prazo. É o que o closer precisa saber." },
          { n: 7, titulo: "Nota, Ligação, Tarefa", texto: "Escolha o tipo de registro: nota do que foi conversado, resumo de ligação ou tarefa com data." },
          { n: 8, titulo: "Registrar", texto: "Salva o registro na linha do tempo (atalho: Ctrl+Enter)." },
          { n: 9, titulo: "Linha do tempo", texto: "Tudo o que aconteceu, do mais novo para o mais antigo, com quem fez. O que está fixado fica no topo — o gestor costuma fixar orientações, como esta." },
          { n: 10, titulo: "Avançar", texto: "Próxima etapa." },
          { n: 11, titulo: "Perdido", texto: "Encerra com motivo." },
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
    ],
  },

  // ── Vendas ──────────────────────────────────────────────────────────────────
  {
    id: "vendas",
    titulo: "Vendas",
    rota: "/vendas",
    resumo: "As vendas e os orçamentos, mês a mês. É daqui que se baixa a nota fiscal e a segunda via do pedido, e que se abre um orçamento para editar ou converter em venda.",
    regras: {
      colaborador: [
        "Você vê as vendas e orçamentos em que você é o vendedor.",
        "Edita e cancela as suas vendas enquanto a nota não foi emitida.",
        "Baixar PDF e nota fiscal: liberado.",
      ],
      gestor: [
        "Vê as vendas de todo o time, com as colunas Vendedor e Criado por, e filtra por vendedor.",
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
          { n: 4, titulo: "Buscar", texto: "Procura pelo nome do cliente, cidade, CNPJ/CPF, IE, telefone, CEP, e-mail ou número do pedido, em todo o histórico (ignora o mês)." },
          { n: 5, titulo: "Status", texto: "Orçamento, Cancelado ou a etapa do pedido (Nova Venda, Em Separação, Em Transporte, Entregue…)." },
          { n: 6, titulo: "Filtros", texto: "“Ocultar pedidos Bling” esconde os pedidos importados do Bling (o número ao lado diz quantos e quanto somam — é o que explica um total diferente de outra tela). Unidade de negócio: revenda, consumo, on-line ou sem classificação. Tipo: produto (CarboZé), serviço (CarboVAPT) ou misto." },
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
          { n: 4, titulo: "Produtos", texto: "Itens, quantidades, descontos e totais. Mais abaixo: pagamento, prazos e observações." },
        ],
      },
      {
        titulo: "Cancelar uma venda",
        texto: "No detalhe da sua venda, “Cancelar venda” pede o motivo. A venda sai do faturamento, vai para Cancelado no rastreio e o estoque volta. Depois que a nota é emitida, a venda não se edita mais.",
      },
      {
        papel: "gestor",
        titulo: "O gestor em Vendas",
        print: { chave: "vendas-gestor", legenda: "Seleção em massa e filtro por vendedor.", papel: "gestor" },
        itens: [
          { n: 1, titulo: "Todos os vendedores", texto: "Filtra a tabela por vendedor." },
          { n: 2, titulo: "Seleção", texto: "Marque as vendas (ou todas) para agir em massa." },
          { n: 3, titulo: "Atribuir vendedor", texto: "Troca o vendedor das vendas selecionadas de uma vez (e, com isso, de quem é a comissão)." },
          { n: 4, titulo: "Vendedor", texto: "De quem é a venda." },
          { n: 5, titulo: "Criado por", texto: "Quem lançou, quando foi outra pessoa (ex.: o gestor lançando em nome do vendedor)." },
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
];
