import type { Secao } from "../tipos";

// Seções da área "sistema": Avisos de status e Carbo Academy — acessos.
// ⚠️ O `n` de cada item é o marcador do print (docs-prints/shots_sistema.mjs).

export const SECOES_SISTEMA: Secao[] = [
  // ── Avisos de status ────────────────────────────────────────────────────────
  {
    id: "status",
    titulo: "Avisos de status",
    rota: "/status",
    resumo:
      "Aqui o TI publica a faixa colorida que aparece no topo dos sistemas do Grupo Carbo quando algo está fora do ar, instável ou em manutenção. Quem vê a faixa sabe que o TI já está cuidando — e não precisa abrir chamado.",
    regras: {
      colaborador: [
        "Todo o time de TI publica, encerra e reabre avisos. A tela é a mesma para todos.",
        "A faixa aparece só nos sistemas escolhidos no aviso, para todo mundo que estiver usando — inclusive na tela de entrada, antes do login.",
        "Ninguém consegue fechar a faixa: ela só sai quando o TI encerra.",
        "Aviso encerrado nunca é apagado: fica no Histórico.",
      ],
      gestor: [
        "Faz o mesmo que o colaborador — não há botão a mais nesta tela.",
      ],
    },
    blocos: [
      {
        titulo: "O que está no ar",
        print: { chave: "status", legenda: "Um aviso de manutenção no ar, com a faixa no topo do sistema." },
        itens: [
          { n: 1, titulo: "A faixa", texto: "É assim que o aviso aparece no topo dos sistemas escolhidos: título em negrito, o detalhe e a previsão. A cor diz o tipo (vermelho fora do ar, amarelo instabilidade, cinza manutenção, azul aviso)." },
          { n: 2, titulo: "No ar agora", texto: "Os avisos que estão aparecendo neste momento, com os sistemas, a hora de início e a previsão. Vazio = “Nada no ar”." },
          { n: 3, titulo: "Encerrar", texto: "Tira o aviso do ar quando o problema acabou. A faixa não some na hora: fica verde pelo tempo escolhido, dizendo que normalizou, e depois sai." },
        ],
      },
      {
        titulo: "Publicar um aviso",
        print: { chave: "status-publicar", legenda: "O formulário preenchido, com a prévia da faixa." },
        itens: [
          { n: 1, titulo: "O que está acontecendo", texto: "Escolha o tipo: Fora do ar (não dá para trabalhar), Instabilidade (lento ou falhando às vezes), Manutenção (programada) ou Aviso (só informação). Ele define a cor e o ícone da faixa." },
          { n: 2, titulo: "Título", texto: "A frase curta que sai em negrito. Diga o que parou, não o porquê técnico: “Emissão de nota fiscal indisponível”." },
          { n: 3, titulo: "Previsão de normalização", texto: "Opcional. É só informação: a faixa não sai sozinha nessa hora — se a manutenção se estender, ela continua no ar até alguém encerrar." },
          { n: 4, titulo: "Detalhe", texto: "Opcional. Diga o que AINDA funciona (“os pedidos continuam sendo registrados”): isso evita metade das perguntas." },
          { n: 5, titulo: "Em quais apps", texto: "“Todos os apps” é o caso comum. Para um problema de um sistema só, clique nos sistemas certos — a faixa aparece só neles." },
          { n: 6, titulo: "Quando você encerrar", texto: "Por quantos minutos a faixa fica verde depois do “Encerrar” (0 = some no clique) e o texto dela. Vazio usa: “O problema … foi resolvido e o sistema voltou ao normal”." },
          { n: 7, titulo: "Como vai aparecer", texto: "A prévia da faixa, exatamente como as pessoas vão ver. Confira o texto antes de publicar: ele vai para vários sistemas ao mesmo tempo." },
          { n: 8, titulo: "Publicar a tarja", texto: "Coloca o aviso no ar. Em segundos a faixa aparece para quem estiver com a tela aberta. Só libera com título e ao menos um sistema escolhido." },
        ],
      },
      {
        titulo: "Histórico",
        print: { chave: "status-historico", legenda: "Avisos já encerrados." },
        itens: [
          { n: 1, titulo: "Um aviso encerrado", texto: "Tipo, título, detalhe, sistemas, hora de início e de encerramento. É o registro de quando e por quanto tempo algo esteve fora." },
          { n: 2, titulo: "Reabrir", texto: "Coloca o mesmo aviso no ar de novo — útil quando o problema voltou logo depois de encerrado." },
        ],
      },
      {
        titulo: "O que esta tela não cobre",
        texto:
          "Quando o próprio banco de dados do sistema cai, esta tela não consegue publicar nada. Para esse caso a faixa acende SOZINHA: cada sistema mede se o servidor responde e mostra o aviso vermelho sem ninguém publicar. Se a internet de quem olha caiu, a faixa diz isso em cinza, para não culparem o sistema.",
      },
    ],
  },

  // ── Carbo Academy — acessos ─────────────────────────────────────────────────
  {
    id: "academy",
    titulo: "Carbo Academy — acessos",
    rota: "/academy/acessos",
    resumo:
      "Quem pediu para assistir a um curso do Carbo Academy espera aqui. Só depois que o TI libera é que as aulas, os vídeos e os PDFs daquele curso abrem para a pessoa — vale para todo mundo, do time interno a frentista de posto e licenciado.",
    regras: {
      colaborador: [
        "Todo o time de TI vê a fila inteira e libera, recusa ou tira acesso. A tela é a mesma para todos.",
        "Cada pedido novo também chega no sininho e como aviso na tela, com os botões Liberar e Negar.",
        "Tirar o acesso não apaga nada: o progresso e o certificado da pessoa ficam guardados e voltam a valer se o acesso for devolvido.",
      ],
      gestor: [
        "Faz o mesmo que o colaborador — não há botão a mais nesta tela.",
      ],
    },
    blocos: [
      {
        titulo: "A fila de pedidos",
        print: { chave: "academy", legenda: "Pedidos esperando decisão." },
        itens: [
          { n: 1, titulo: "Abas", texto: "Pendentes (esperando você), Liberados, Recusados e Todos. O número é a quantidade em cada uma; a tela abre em Pendentes." },
          { n: 2, titulo: "Buscar", texto: "Procura por nome, e-mail, curso ou de onde a pessoa vem." },
          { n: 3, titulo: "Quem pediu", texto: "Nome, e-mail e de onde a pessoa vem: Time do Grupo Carbo, Licenciado, ou o papel e a loja do Portal (ex.: “Equipe · Posto Exemplo Centro”)." },
          { n: 4, titulo: "O curso", texto: "Qual curso a pessoa quer assistir e quando pediu." },
          { n: 5, titulo: "Liberar", texto: "Dá o acesso na hora. A pessoa recebe um aviso de “Curso liberado” com o link para abrir." },
          { n: 6, titulo: "Recusar", texto: "Abre a confirmação, com espaço para o motivo." },
          { n: 7, titulo: "Selo no menu", texto: "Quantos pedidos estão esperando. Aparece em qualquer tela do Carbo TI, para ninguém precisar abrir a fila para saber." },
        ],
      },
      {
        titulo: "Recusar um pedido",
        print: { chave: "academy-recusar", legenda: "A confirmação de recusa." },
        itens: [
          { n: 1, titulo: "Motivo", texto: "Opcional, e a pessoa LÊ esse texto no curso. Diga o que ela precisa fazer (“peça pelo cadastro do licenciado”). Ela pode pedir de novo." },
          { n: 2, titulo: "Recusar", texto: "Confirma. “Cancelar” fecha sem mudar nada." },
        ],
      },
      {
        titulo: "Liberados e recusados",
        print: { chave: "academy-todos", legenda: "A aba Todos, com pedidos nas três situações." },
        itens: [
          { n: 1, titulo: "Tirar acesso", texto: "Para quem já está liberado. A pessoa deixa de abrir as aulas na hora e vê o curso com “Pedir de novo”. Pede motivo, como a recusa." },
          { n: 2, titulo: "Quem decidiu", texto: "Quando o acesso foi liberado ou recusado, e por quem do TI." },
          { n: 3, titulo: "Motivo", texto: "O texto que a pessoa recebeu na recusa. Passe o mouse para ler inteiro." },
          { n: 4, titulo: "Liberar (de novo)", texto: "Devolve o acesso a quem foi recusado, depois de uma confirmação." },
        ],
      },
    ],
  },
];
