import type { Secao } from "../tipos";

// ─────────────────────────────────────────────────────────────────────────────
// Documentação do Carbo Marketing — as visões de um quadro (Calendário,
// Timeline, Tabela, Dashboard, Mapa), as visões de todos os quadros juntos e
// Campanhas.
//
// ⚠️ O `n` de cada item é o MESMO marcador do print (`chave`), medido pelo
// harness (docs-prints/shots_visoes.mjs). Mudou a tela: refaça o print.
// ─────────────────────────────────────────────────────────────────────────────

const REGRAS_VISOES = {
  colaborador: [
    "Vê e mexe em todos os cartões do quadro, como no Quadro: as visões são só outro jeito de olhar os mesmos cartões.",
    "O que você muda aqui (data, título, campo) muda no cartão, e aparece igual no Quadro e nas outras visões.",
    "Cartão arquivado, ou de lista arquivada, não aparece em nenhuma visão.",
  ],
  gestor: [
    "Vê exatamente o mesmo que o colaborador — estas telas não têm nada a mais para o gestor.",
  ],
};

export const SECOES_VISOES: Secao[] = [
  // ── Visões de um quadro ─────────────────────────────────────────────────────
  {
    id: "visoes",
    titulo: "Visões do quadro",
    rota: "/quadros",
    resumo:
      "Todo quadro pode ser visto de seis jeitos: Quadro (as colunas), Calendário, Timeline, Tabela, Dashboard e Mapa. São sempre os mesmos cartões — muda só a forma de mostrar. Troque de visão pelos botões ao lado do nome do quadro.",
    regras: REGRAS_VISOES,
    blocos: [
      {
        titulo: "Calendário",
        texto: "Os cartões no dia da entrega (ou do início, quando não há entrega). Bom para ver o mês de publicações de uma vez.",
        print: { chave: "visao-calendario", legenda: "O Calendário de um quadro, no mês atual." },
        itens: [
          { n: 1, titulo: "Trocar de visão", texto: "Quadro, Calendário, Timeline, Tabela, Dashboard e Mapa. A visão aberta fica destacada." },
          { n: 2, titulo: "Andar no tempo", texto: "As setas vão para o mês (ou a semana) anterior e o seguinte. “Hoje” volta para a data de hoje, marcada com uma bolinha verde." },
          { n: 3, titulo: "Mês ou semana", texto: "Mostra o mês inteiro ou só a semana, com mais espaço para cada dia." },
          { n: 4, titulo: "Cor do cartão", texto: "Pinta a borda do cartão pela cor da lista em que ele está, ou pela cor da primeira etiqueta." },
          { n: 5, titulo: "Cartão no dia", texto: "Clique para abrir o cartão. Arraste para outro dia para mudar a data de entrega — muda na hora, e volta sozinho se não der para salvar." },
          { n: 6, titulo: "Sem data", texto: "Os cartões que ainda não têm data. Arraste um deles para um dia para dar a data; solte um cartão do calendário aqui para tirar a data." },
        ],
      },
      {
        titulo: "Timeline",
        texto: "Cada cartão vira uma barra que vai do início até a entrega. Bom para ver o que corre ao mesmo tempo e o que está encavalado.",
        print: { chave: "visao-timeline", legenda: "A Timeline, agrupada por lista, no zoom de dia." },
        itens: [
          { n: 1, titulo: "Por lista ou por membro", texto: "Agrupa as barras pela lista do cartão ou por quem está no cartão. Cartão com duas pessoas aparece nas duas; sem ninguém, em “Sem responsável”." },
          { n: 2, titulo: "Zoom", texto: "Dia, semana ou mês: quanto mais aberto, mais tempo cabe na tela." },
          { n: 3, titulo: "Grupo", texto: "O nome da lista (ou da pessoa) e quantos cartões com data ela tem." },
          { n: 4, titulo: "Barra do cartão", texto: "Clique para abrir o cartão. Arraste a barra para mudar as duas datas juntas; arraste as pontas para mudar só o início ou só a entrega (as pontas só aparecem quando o cartão tem as duas datas)." },
          { n: 5, titulo: "Hoje", texto: "A linha vermelha marca o dia de hoje." },
          { titulo: "Sem datas", texto: "Embaixo da linha do tempo ficam os cartões sem data nenhuma. Clique para abrir e dar a data." },
        ],
      },
      {
        titulo: "Tabela",
        texto: "Os cartões como planilha: um por linha, com lista, etiquetas, pessoas, datas, checklist e os campos personalizados do quadro.",
        print: { chave: "visao-tabela", legenda: "A Tabela de um quadro, com um campo personalizado (Formato)." },
        itens: [
          { n: 1, titulo: "Buscar", texto: "Procura pelo título do cartão." },
          { n: 2, titulo: "Etiqueta", texto: "Mostra só os cartões com a etiqueta escolhida." },
          { n: 3, titulo: "Membro", texto: "Mostra só os cartões de uma pessoa." },
          { n: 4, titulo: "Ordenar", texto: "Clique no nome da coluna para ordenar; clique de novo para inverter. A seta mostra a coluna e o sentido." },
          { n: 5, titulo: "Abrir cartão", texto: "Abre o cartão completo, com descrição, comentários e anexos." },
          { n: 6, titulo: "Editar na linha", texto: "Título, início e entrega se mudam direto na tabela: clique no título para reescrever, ou na data para escolher outra. Muda na hora." },
          { n: 7, titulo: "Campos personalizados", texto: "Cada campo do quadro vira uma coluna, editável na própria linha." },
        ],
      },
      {
        titulo: "Dashboard",
        texto: "Os números do quadro: quantos cartões há, quantos terminaram, quantos estão atrasados e com quem está o trabalho.",
        print: { chave: "visao-dashboard", legenda: "O Dashboard de um quadro." },
        itens: [
          { n: 1, titulo: "Cartões", texto: "Quantos cartões o quadro tem, sem contar os arquivados." },
          { n: 2, titulo: "Conclusão", texto: "Cartões concluídos e a porcentagem. Conta o “Concluído” marcado no cartão — o checklist completo não conta sozinho." },
          { n: 3, titulo: "Atrasados e sem data", texto: "Atrasado é o cartão não concluído com a entrega antes de hoje. “Sem data” é o que não tem nem início nem entrega." },
          { n: 4, titulo: "Cartões por lista", texto: "Quantos cartões há em cada lista, na cor da lista. Mostra onde o trabalho está parado." },
          { n: 5, titulo: "Carga por membro", texto: "Quantos cartões cada pessoa tem. Cartão com duas pessoas conta para as duas." },
          { n: 6, titulo: "Lista de atrasados", texto: "Os atrasados, do mais atrasado para o menos, com a lista, a data de entrega e quantos dias passou. Clique para abrir o cartão." },
        ],
      },
      {
        titulo: "Mapa",
        texto: "Os cartões que têm um endereço, como pinos no mapa. Bom para gravações, eventos e ações em lojas.",
        print: { chave: "visao-mapa", legenda: "O Mapa, com o balão de um cartão aberto." },
        itens: [
          { n: 1, titulo: "Quantos têm local", texto: "Quantos cartões aparecem no mapa e quantos ainda não têm endereço." },
          { n: 2, titulo: "Pino", texto: "Um por cartão com endereço. O mapa se ajusta sozinho para caber todos." },
          { n: 3, titulo: "Balão", texto: "Clique no pino para ver o título e o local. “Abrir cartão” abre o cartão completo." },
          { titulo: "Como pôr um cartão no mapa", texto: "Abra o cartão e defina o local (endereço). Sem local, o cartão não aparece aqui." },
        ],
      },
    ],
  },

  // ── Todos os quadros ────────────────────────────────────────────────────────
  {
    id: "todos",
    titulo: "Todos os quadros",
    rota: "/calendario-geral",
    resumo:
      "O Calendário e a Tabela com os cartões de TODOS os quadros juntos. Serve para ver a semana do time inteiro, sem abrir quadro por quadro.",
    regras: {
      colaborador: [
        "Mostra os cartões de todos os quadros ativos do Marketing. Quadro arquivado fica de fora.",
        "Cartão espelhado aparece uma vez só, no quadro de origem.",
        "Mudar data ou título aqui muda o cartão no quadro dele.",
      ],
      gestor: ["Vê exatamente o mesmo que o colaborador."],
    },
    blocos: [
      {
        titulo: "Calendário de todos os quadros",
        print: { chave: "todos-calendario", legenda: "O Calendário com os cartões de todos os quadros." },
        itens: [
          { n: 1, titulo: "Calendário ou Tabela", texto: "Troca entre as duas visões de todos os quadros." },
          { n: 2, titulo: "Cor do cartão", texto: "Pinta pela cor do quadro (padrão) ou pela primeira etiqueta. As setas, “Hoje” e Mês/Semana funcionam como no calendário de um quadro." },
          { n: 3, titulo: "Legenda dos quadros", texto: "Que cor é de qual quadro. Clique no nome para abrir o calendário só daquele quadro." },
          { n: 4, titulo: "Cartão", texto: "Clique para abrir; arraste para outro dia para mudar a entrega." },
        ],
      },
      {
        titulo: "Tabela de todos os quadros",
        print: { chave: "todos-tabela", legenda: "A Tabela com os cartões de todos os quadros." },
        itens: [
          { n: 1, titulo: "Calendário ou Tabela", texto: "Troca entre as duas visões de todos os quadros." },
          { n: 2, titulo: "Filtrar por quadro", texto: "Mostra só um quadro. Ao lado: busca pelo título, etiqueta e membro, como na tabela de um quadro." },
          { n: 3, titulo: "Quadro do cartão", texto: "Em que quadro o cartão mora. Clique para abrir o quadro." },
          { n: 4, titulo: "Ordenar e editar", texto: "Clique no nome da coluna para ordenar. Título e datas se mudam direto na linha. Campos personalizados não aparecem aqui, porque cada quadro tem os seus." },
        ],
      },
    ],
  },

  // ── Campanhas ───────────────────────────────────────────────────────────────
  {
    id: "campanhas",
    titulo: "Campanhas",
    rota: "/campanhas",
    resumo:
      "O lugar das campanhas de marketing. A tela ainda está em construção: por enquanto não há nada para fazer nela.",
    blocos: [
      {
        print: { chave: "campanhas", legenda: "A tela de Campanhas, ainda em construção." },
        itens: [
          { n: 1, titulo: "Em construção", texto: "As funções de Campanhas vão aparecer aqui. Enquanto isso, organize as campanhas nos quadros — uma etiqueta por campanha ajuda a filtrar depois." },
        ],
      },
    ],
  },
];
