import type { Secao } from "../tipos";

// Comece por aqui, Início e navegação do Carbo Atendimento. A barra de cima e o menu
// são o shell comum aos apps; o texto parte do do Sales.

export const SECOES_BASE: Secao[] = [
  // ── Comece por aqui ─────────────────────────────────────────────────────────
  {
    id: "comece",
    titulo: "Comece por aqui",
    resumo:
      "O Carbo Atendimento é o sistema de quem fala com o cliente: as Conversas do WhatsApp oficial da empresa, a Esteira do On-line (o caminho de cada pedido da venda à entrega) e as Mensagens ao cliente que saem sozinhas a cada etapa.",
    blocos: [
      {
        titulo: "Como entrar",
        itens: [
          { titulo: "Pelo Hub", texto: "Entre sempre por carbohub.com.br com o seu usuário ou o seu e-mail, e a sua senha. No Hub, clique em “Acessar” no cartão Carbo Atendimento." },
          { titulo: "Esqueceu a senha?", texto: "Na tela de entrada do Hub, “Esqueci minha senha” manda um código para o e-mail cadastrado no seu primeiro acesso." },
        ],
      },
      {
        titulo: "Colaborador e gestor",
        texto: "O sistema tem dois níveis. O colaborador atende as conversas e acompanha os pedidos; o gestor tem, além disso, as ações de gestão de cada tela.",
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
    resumo: "A primeira tela do Atendimento tem quatro atalhos: Carbo Chat, Vender, Bugs e sugestões e Meu perfil. Conversas, Esteira e Mensagens ficam no menu, em Cliente.",
    blocos: [{ texto: "Clique num cartão para ir à tela." }],
  },

  // ── Navegação ───────────────────────────────────────────────────────────────
  {
    id: "navegacao",
    titulo: "Navegação",
    resumo: "A barra lateral leva às telas do sistema; a barra de cima tem os atalhos que existem em todos os sistemas do Grupo Carbo.",
    blocos: [
      {
        print: { chave: "inicio", legenda: "O Carbo Atendimento, com a barra lateral e a barra de cima." },
        itens: [
          { n: 1, titulo: "Logo", texto: "Volta para o Hub (carbohub.com.br). Com o botão do meio do mouse, abre em outra guia." },
          { n: 2, titulo: "Menu", texto: "Visão geral e Carbo Chat; Cliente (Conversas, Esteira do On-line, Mensagens ao Cliente). A tela em que você está fica destacada." },
          { n: 3, titulo: "Documentação", texto: "Esta página." },
          { n: 4, titulo: "Recolher menu", texto: "Deixa a barra lateral só com os ícones. No celular o menu abre pelo botão ☰ do topo." },
          { n: 5, titulo: "Trocar de sistema", texto: "Lista os sistemas liberados para você e o Início (o Hub)." },
          { n: 6, titulo: "+ Nova Venda", texto: "Abre a tela de venda/orçamento (Vender) de qualquer lugar." },
          { n: 7, titulo: "Notificações", texto: "O sininho mostra avisos: mensagem nova de cliente, menção, bug corrigido. Venda on-line aparece aqui para quem foi escolhido para recebê-la. O número vermelho é o que você ainda não leu." },
          { n: 8, titulo: "Reportar bug ou sugestão", texto: "Abre o pedido ao TI. Veja a seção “Bugs e sugestões”." },
          { n: 9, titulo: "Tema claro / escuro", texto: "Troca as cores. A escolha vale para todos os sistemas do Grupo Carbo." },
          { n: 10, titulo: "Sua conta", texto: "Seu nome e função. O menu tem Meu Perfil, Bugs e sugestões e Sair." },
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
        titulo: "Esteira e Mensagens também estão no Admin",
        texto: "A Esteira do On-line e as Mensagens ao cliente são as MESMAS telas do Admin e do Marketing, com os mesmos pedidos. As Conversas só existem aqui.",
      },
    ],
  },
];
