import type { Secao } from "../tipos";

// Comece por aqui, Início e navegação do Carbo Ops. A barra de cima e o menu
// são o shell comum aos apps; o texto parte do do Sales.

export const SECOES_BASE: Secao[] = [
  // ── Comece por aqui ─────────────────────────────────────────────────────────
  {
    id: "comece",
    titulo: "Comece por aqui",
    resumo:
      "O Carbo Ops é o sistema da operação: produção (ordens de produção e MRP), estoque nos hubs e nas caixas dos vendedores, compras, o Rastreio das vendas até a entrega, a logística e as ordens de serviço da descarbonização.",
    blocos: [
      {
        titulo: "Como entrar",
        itens: [
          { titulo: "Pelo Hub", texto: "Entre sempre por carbohub.com.br com o seu usuário ou o seu e-mail, e a sua senha. No Hub, clique em “Acessar” no cartão Carbo Ops." },
          { titulo: "Esqueceu a senha?", texto: "Na tela de entrada do Hub, “Esqueci minha senha” manda um código para o e-mail cadastrado no seu primeiro acesso." },
        ],
      },
      {
        titulo: "O caminho de um pedido",
        itens: [
          { titulo: "1. A venda chega", texto: "O vendedor registra a venda no Sales (ou ela vem do e-commerce). Ela aparece no Rastreio de venda, na primeira etapa." },
          { titulo: "2. Produzir ou separar", texto: "Se falta produto, nasce a ordem de produção; se tem na prateleira, o pedido vai para separação." },
          { titulo: "3. Nota e expedição", texto: "Com a nota fiscal emitida, o pedido é embalado, etiquetado e despachado." },
          { titulo: "4. Entrega", texto: "O Rastreio acompanha o transporte até a entrega, e o vendedor vê tudo isso do lado dele." },
        ],
      },
      {
        titulo: "Colaborador e gestor",
        texto: "O sistema tem dois níveis. O colaborador opera as telas do dia a dia; o gestor tem, além disso, as ações de gestão de cada tela.",
        itens: [
          { papel: "gestor", titulo: "O que muda para o gestor", texto: "Cada seção desta documentação tem o quadro “O gestor nesta tela”, com o que ele vê e pode a mais." },
          { papel: "gestor", titulo: "Quem é gestor", texto: "É a marcação “gestor” da função da pessoa no Admin (Estrutura)." },
        ],
      },
    ],
  },

  // ── Início ──────────────────────────────────────────────────────────────────
  {
    id: "inicio",
    titulo: "Início",
    rota: "/",
    resumo: "A primeira tela do Ops: o que está esperando por você hoje, área por área. Cada cartão leva à tela onde aquilo se resolve.",
    blocos: [
      {
        print: { chave: "home", legenda: "A tela Início do Carbo Ops." },
        itens: [
          { n: 1, titulo: "O que pede ação", texto: "A faixa do topo junta o que precisa de alguém agora: produto zerado ou abaixo do mínimo, ordens de produção esperando e OS com data vencida. Clique num item para ir até ele. Sem pendência, a faixa não aparece." },
          { n: 2, titulo: "Carbo Chat", texto: "As conversas com mensagem não lida. Clique para abrir." },
          { n: 3, titulo: "Produção", texto: "Ordens de produção em aberto, quantas estão no chão de fábrica e quantas esperando alguém." },
          { n: 4, titulo: "Estoque", texto: "Produtos zerados em algum hub e abaixo do mínimo." },
          { n: 5, titulo: "Logística", texto: "Pedidos a separar, separando, prontos e em trânsito." },
          { n: 6, titulo: "Operação de campo", texto: "OS agendadas hoje, nos próximos 7 dias e em aberto, com as que estão com data vencida ou sem data." },
          { n: 7, titulo: "Todas as telas do Ops", texto: "Abre a lista completa de telas, para quem prefere ir direto." },
        ],
      },
    ],
  },

  // ── Navegação ───────────────────────────────────────────────────────────────
  {
    id: "navegacao",
    titulo: "Navegação",
    resumo: "A barra lateral leva às telas do sistema; a barra de cima tem os atalhos que existem em todos os sistemas do Grupo Carbo.",
    blocos: [
      {
        print: { chave: "inicio", legenda: "O Carbo Ops, com a barra lateral e a barra de cima." },
        itens: [
          { n: 1, titulo: "Logo", texto: "Volta para o Hub (carbohub.com.br). Com o botão do meio do mouse, abre em outra guia." },
          { n: 2, titulo: "Menu", texto: "Início e Carbo Chat; Produção (Painel de Produção, Ordens de Produção, MRP); Suprimentos (Suprimentos, Estoque dos Vendedores, Requisição de Compra); Logística (Logística, Rastreio de venda, Vendas de Recorrência, Viagens & PC); Operação de Campo (OS Descarbonização, Alertas Operacionais). A tela em que você está fica destacada." },
          { n: 3, titulo: "Documentação", texto: "Esta página." },
          { n: 4, titulo: "Recolher menu", texto: "Deixa a barra lateral só com os ícones. No celular o menu abre pelo botão ☰ do topo." },
          { n: 5, titulo: "Trocar de sistema", texto: "Lista os sistemas liberados para você e o Início (o Hub)." },
          { n: 6, titulo: "+ Nova Venda", texto: "Abre a tela de venda/orçamento (Vender) de qualquer lugar." },
          { n: 7, titulo: "Notificações", texto: "O sininho mostra avisos: menção, pedido pronto, bug corrigido. O número vermelho é o que você ainda não leu." },
          { n: 8, titulo: "Reportar bug ou sugestão", texto: "Abre o pedido ao TI. Veja a seção “Bugs e sugestões”." },
          { n: 9, titulo: "Tema claro / escuro", texto: "Troca as cores. A escolha vale para todos os sistemas do Grupo Carbo." },
          { n: 10, titulo: "Sua conta", texto: "Seu nome e função. O menu tem Meu Perfil, Minha Equipe, Bugs e sugestões e Sair." },
          { n: 11, titulo: "Ajuda", texto: "A Documentação fica sempre no fim do menu." },
        ],
      },
      {
        titulo: "Notificações",
        print: { chave: "notificacoes", legenda: "O sininho aberto." },
        itens: [
          { n: 1, titulo: "Não lidas / Todas", texto: "Alterna entre o que você ainda não viu e o histórico." },
          { n: 2, titulo: "Marcar lidas", texto: "Marca todas como lidas de uma vez." },
          { n: 3, titulo: "Um aviso", texto: "Clique para ir até o que ele fala. Passe o mouse para ver a lixeira e apagar o aviso." },
        ],
      },
      {
        titulo: "Faixa de aviso no topo",
        texto:
          "Quando o sistema está instável ou em manutenção, aparece uma faixa colorida logo abaixo da barra de cima. Ela não fecha: some sozinha quando tudo volta ao normal (fica verde por um tempo, dizendo que normalizou). Se a faixa estiver lá, não precisa abrir chamado — o TI já sabe.",
      },
      {
        titulo: "Telas que saíram do Ops",
        texto:
          "A Esteira do On-line e as Mensagens ao cliente moram no Admin; os endereços antigos do Ops levam para lá. Agendamentos virou a visão Agenda das Ordens de Serviço.",
      },
    ],
  },
];
