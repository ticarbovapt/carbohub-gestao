import type { Secao } from "../tipos";

// Visão geral (/) e o quadro de Demandas (/demandas) do Carbo TI.
// Os números (`n`) batem com os marcadores dos prints em docs-prints/shots_demandas.mjs.

const QUEM_MEXE =
  "Quem altera uma demanda (etapa, responsável, prioridade, arquivar) é o time de TI — departamento TI/Suporte ou Diretoria — e o próprio responsável por ela. Para os demais, a mudança é recusada e a tela avisa “Sem permissão”.";

export const SECOES_DEMANDAS: Secao[] = [
  // ── Visão geral ─────────────────────────────────────────────────────────────
  {
    id: "inicio",
    titulo: "Visão geral",
    rota: "/",
    resumo:
      "A primeira tela do Carbo TI: o que chegou, o que falta resolver e como anda o fluxo das demandas de todos os sistemas. Tudo aqui leva ao quadro de Demandas.",
    regras: {
      colaborador: [
        "Vê os números e as listas de todas as demandas, de todos os sistemas.",
        "“Minhas demandas” mostra só as que estão com você.",
        "O quadro “Time de TI” mostra os números de todo o time — inclusive os seus, destacados em verde.",
      ],
      gestor: [
        "Vê a mesma tela: a Visão geral não muda para o gestor.",
        "Use “Sem responsável” e “Paradas há mais de 7 dias” para distribuir o trabalho no quadro.",
      ],
    },
    blocos: [
      {
        titulo: "O que falta fazer",
        print: { chave: "visao-geral", legenda: "O topo da Visão geral." },
        itens: [
          { n: 1, titulo: "Abrir quadro", texto: "Vai para o quadro de Demandas. Os cartões de número e as linhas das listas também levam até lá." },
          { n: 2, titulo: "Na fila (não resolvidas)", texto: "Quantas demandas ainda dependem do TI: Entrada, Na fila, Em andamento e Em teste. As que estão em Aguardando (esperando quem pediu) não entram." },
          { n: 3, titulo: "Em andamento", texto: "Quantas alguém está resolvendo agora." },
          { n: 4, titulo: "Sem responsável", texto: "Demandas da fila que ninguém assumiu ainda. Fica vermelho quando é mais de zero." },
          { n: 5, titulo: "Críticas abertas", texto: "Demandas de prioridade Crítica ainda não entregues." },
          { n: 6, titulo: "Últimos 7 dias", texto: "Quantas entraram e quantas saíram (concluídas ou recusadas) na semana — e se a fila está crescendo ou diminuindo. Ao lado: quantas faltam triar, quantas esperam o solicitante, quantas já foram reabertas e o tempo médio até concluir." },
          { n: 7, titulo: "Minhas demandas", texto: "As que estão com você e ainda não foram entregues, da mais urgente para a menos urgente." },
          { n: 8, titulo: "Sem responsável", texto: "As que precisam de alguém para assumir. O número no canto é o total." },
          { n: 9, titulo: "Paradas há mais de 7 dias", texto: "As que não mudam de etapa há mais de uma semana — o risco de ficarem esquecidas. Espera por quem pediu não conta como parada." },
        ],
      },
      {
        titulo: "Cada linha das listas",
        texto:
          "A bolinha colorida é a prioridade (vermelha crítica, laranja alta, amarela média, cinza baixa ou a triar). Embaixo do título: o sistema de onde veio, a etapa e o responsável. O número em laranja ou vermelho à direita é há quantos dias ela está na mesma etapa; o ícone é o tipo (bug, sugestão, equipamento, acesso ou ajuda).",
      },
      {
        titulo: "Indicadores",
        print: { chave: "visao-indicadores", legenda: "Os gráficos e as entradas mais recentes." },
        itens: [
          { n: 1, titulo: "Por etapa", texto: "Quantas demandas há em cada etapa do fluxo, incluindo as concluídas e recusadas. Passe o mouse para ver o número." },
          { n: 2, titulo: "Fila por prioridade", texto: "Só o que ainda não foi entregue, separado por Crítica, Alta, Média e Baixa." },
          { n: 3, titulo: "Por sistema", texto: "De onde vêm as demandas: quantas estão abertas de quantas chegaram de cada sistema. A barra é a parte ainda aberta." },
          { n: 4, titulo: "Chegaram por último", texto: "As seis entradas mais recentes, com quem pediu, o sistema, a data e a etapa. “Ver todas” abre o quadro." },
        ],
      },
      {
        titulo: "Time de TI (o Ranking)",
        texto:
          "No fim da Visão geral. Mostra como está o fluxo das demandas — não é nota das pessoas. Não há pódio nem pontuação única: cada coluna é uma informação separada.",
        print: { chave: "ranking-ti", legenda: "O quadro Time de TI, com “Como é calculado” aberto." },
        itens: [
          { n: 1, titulo: "Período", texto: "Últimos 30 ou 90 dias." },
          { n: 2, titulo: "Como é calculado", texto: "Abre e fecha a explicação de cada número." },
          { n: 3, titulo: "Números do time", texto: "Quantas foram entregues, o tempo típico do pedido à entrega (e em quanto tempo saem 90% delas), o tempo até triar, a firmeza (quanto do que foi entregue não voltou) e quantas estão na fila há mais de 14 dias." },
          { n: 4, titulo: "As colunas", texto: "Entregas: concluídas no período, com peso pela prioridade (crítica vale mais que baixa); entrega que reabre em até 14 dias vale zero. Velocidade: o tempo que a demanda ficou na mão da pessoa (Em andamento + Em teste) comparado com o típico do time na mesma prioridade — 0,8× é 20% mais rápido que o normal. Firmeza: quanto do que ela entregou não foi reaberto. Assumidas / Em aberto: a carga de cada um." },
          { n: 5, titulo: "Uma pessoa", texto: "A sua linha fica destacada em verde. Embaixo do nome aparecem os destaques do período: mais entregas, mais críticas, mais rápido, zero reaberturas." },
          { n: 6, titulo: "Amostra em formação", texto: "Quem tem menos de 5 entregas no período fica fora da lista, só com o número de entregas: com tão poucas, a comparação seria sorte. Com menos de 3 pessoas na lista, ela aparece sem ordenação." },
        ],
      },
    ],
  },

  // ── Demandas ────────────────────────────────────────────────────────────────
  {
    id: "demandas",
    titulo: "Demandas",
    rota: "/demandas",
    resumo:
      "O quadro do TI com tudo o que chega de todos os sistemas: o que as pessoas mandam pelo botão “Reportar bug ou sugestão” (o insetinho da barra de cima) e o que o próprio TI registra. Cada coluna é uma etapa; cada cartão, uma demanda.",
    regras: {
      colaborador: [
        "Vê todas as demandas de todos os sistemas.",
        "Assume demandas, move de etapa, comenta, cria tarefas e registra demandas novas.",
        "Só quem é do time de TI aparece na lista de responsáveis.",
        QUEM_MEXE,
      ],
      gestor: [
        "O quadro é o mesmo para o gestor — não há botão a mais.",
        "Para distribuir o trabalho: filtre por “Sem responsável” e escolha o responsável no card aberto.",
        "Para ver o que cada um tem: o filtro de pessoa, em “Responsável (quem resolve)”.",
      ],
    },
    blocos: [
      {
        titulo: "As etapas",
        itens: [
          { titulo: "Entrada", texto: "Chegou e ainda falta triar (ver o que é, dar prioridade, escolher quem faz)." },
          { titulo: "Na fila", texto: "Já triada, esperando alguém começar. Assumir uma demanda da Entrada a traz para cá." },
          { titulo: "Em andamento", texto: "Alguém está resolvendo. Com mais de 5 aqui, o número da coluna fica vermelho: é trabalho demais em paralelo." },
          { titulo: "Aguardando", texto: "Esperando resposta de quem pediu. Enquanto ela estiver aqui, o relógio do TI para: não conta como parada nem como atraso." },
          { titulo: "Em teste", texto: "Feito, esperando quem pediu confirmar que ficou certo." },
          { titulo: "Concluída e Recusada", texto: "Os finais. Para chegar a eles é preciso escrever a resposta, que vai para quem pediu na notificação." },
        ],
      },
      {
        titulo: "O quadro",
        print: { chave: "demandas-quadro", legenda: "O quadro de Demandas, com o menu recolhido." },
        itens: [
          { n: 1, titulo: "Nova", texto: "Registra uma demanda que chegou por fora do botão de reporte — telefone, corredor, mensagem. Veja “Registrar uma demanda”, abaixo. O número ao lado do título é quantas demandas o quadro está mostrando." },
          { n: 2, titulo: "Buscar", texto: "Procura no título, na descrição, em quem pediu e no responsável." },
          { n: 3, titulo: "Minhas", texto: "Mostra só as demandas em que você é o responsável. Clique de novo para voltar a ver todas." },
          { n: 4, titulo: "Pessoa", texto: "Filtra por uma pessoa como responsável (quem resolve) ou como solicitante (quem pediu), ou só as sem responsável." },
          { n: 5, titulo: "Tipo", texto: "Bug, Sugestão, Equipamento, Acesso ou Ajuda." },
          { n: 6, titulo: "Sistema", texto: "De qual sistema a demanda veio (SALES, OPS, FINANCAS, MKT…)." },
          { n: 7, titulo: "Prioridade", texto: "Crítica, Alta, Média, Baixa, ou “A triar” para as que ainda não têm prioridade." },
          { n: 8, titulo: "Coluna", texto: "Nome da etapa e quantas demandas há nela. Para mudar a etapa, arraste o cartão para outra coluna — dá para desfazer pelo aviso que aparece. A setinha recolhe a coluna." },
          { n: 9, titulo: "N sem dono", texto: "Quantas demandas da coluna estão sem responsável. Clique para filtrar o quadro só por elas." },
          { n: 10, titulo: "N parada(s)", texto: "Quantas estão há mais de 7 dias na mesma etapa." },
          { n: 11, titulo: "Colunas recolhidas", texto: "Concluída e Recusada começam recolhidas, para o quadro mostrar o trabalho em aberto. Clique na setinha para abrir; dá para soltar cartão nelas mesmo recolhidas. O quadro lembra o que você recolheu." },
        ],
      },
      {
        titulo: "Filtrar por pessoa",
        print: { chave: "demandas-pessoa", legenda: "O filtro de pessoa aberto." },
        itens: [
          { n: 1, titulo: "Sem responsável", texto: "Só as demandas que ninguém assumiu." },
          { n: 2, titulo: "Responsável (quem resolve)", texto: "As pessoas que têm alguma demanda com elas. Escolher uma mostra o que ela está resolvendo." },
          { n: 3, titulo: "Solicitante (quem pediu)", texto: "As pessoas que abriram demandas. Escolher uma mostra tudo o que ela pediu." },
        ],
      },
      {
        titulo: "Com filtro ligado",
        print: { chave: "demandas-filtro-ativo", legenda: "O quadro filtrado por “Minhas”." },
        itens: [
          { n: 1, titulo: "Faixa do filtro", texto: "Diz de quem e em qual papel são as demandas que o quadro está mostrando, e quantas de quantas." },
          { n: 2, titulo: "Remover", texto: "Tira só o filtro de pessoa." },
          { n: 3, titulo: "Limpar", texto: "Tira todos os filtros e a busca de uma vez." },
        ],
      },
      {
        titulo: "O cartão",
        texto: "A borda esquerda do cartão tem a cor da prioridade. Os cartões de cada coluna vêm do mais urgente para o menos urgente e, no empate, do que está há mais tempo na etapa.",
        print: { chave: "demandas-cartao", legenda: "Cartões na Entrada, ainda sem responsável." },
        itens: [
          { n: 1, titulo: "Título", texto: "Clique no cartão para abrir a demanda." },
          { n: 2, titulo: "Tipo", texto: "O ícone diz se é bug, sugestão, equipamento, acesso ou ajuda. Passe o mouse para ver o nome." },
          { n: 3, titulo: "Quem pediu", texto: "Aparece enquanto a demanda está na Entrada, que é quando essa informação mais importa." },
          { n: 4, titulo: "Sistema e prioridade", texto: "A etiqueta cinza é o sistema de onde veio (ou o tipo, em pedido que não é de sistema, como equipamento e acesso). A prioridade só aparece como etiqueta quando é Alta ou Crítica." },
          { n: 5, titulo: "a triar", texto: "A demanda ainda não tem prioridade." },
          { n: 6, titulo: "Assumir", texto: "Torna você o responsável. Se a demanda estava na Entrada, ela vai para Na fila; para começar, arraste para Em andamento." },
          { n: 7, titulo: "Tempo na etapa", texto: "Há quantos dias está na etapa atual. Laranja passou de 3 dias, vermelho passou de 7." },
        ],
      },
      {
        print: { chave: "demandas-cartao-dono", legenda: "Cartões com responsável." },
        itens: [
          { n: 1, titulo: "Responsável", texto: "Foto e nome de quem está resolvendo." },
          { n: 2, titulo: "Comentários", texto: "Quantos comentários a demanda tem." },
          { n: 3, titulo: "Tarefas pendentes", texto: "Quantas tarefas ainda estão por fazer." },
          { n: 4, titulo: "Tempo na etapa", texto: "Em Aguardando aparece um sinal de pausa com os dias: é o tempo esperando quem pediu, que não conta como atraso." },
        ],
      },
      {
        titulo: "A demanda aberta",
        print: { chave: "demanda-aberta", legenda: "Uma demanda aberta, de outra pessoa do time." },
        itens: [
          { n: 1, titulo: "Título e tipo", texto: "O que foi pedido." },
          { n: 2, titulo: "Etiquetas", texto: "Tipo, sistema, etapa e prioridade. Em vermelho, há quantos dias está sem movimentação, quando passa de 7." },
          { n: 3, titulo: "Arquivar", texto: "Tira a demanda do quadro, pedindo confirmação. Nada é apagado: o registro e o histórico ficam guardados. Use para duplicada ou aberta por engano." },
          { n: 4, titulo: "Etapas", texto: "Clique numa etapa para mover a demanda direto para ela. Concluída e Recusada pedem a resposta antes." },
          { n: 5, titulo: "Assumir esta demanda", texto: "Torna você o responsável. Não aparece quando a demanda já é sua (aí está escrito “Você é o responsável”) nem quando ela já terminou." },
          { n: 6, titulo: "Responsável", texto: "Troca quem resolve ou deixa sem responsável. Só aparecem pessoas do time de TI." },
          { n: 7, titulo: "Prioridade", texto: "Crítica, Alta, Média, Baixa ou A triar. Quando quem pediu informou o impacto, aparece embaixo a prioridade sugerida por ele (por exemplo “Estou travado · afeta Meu time”)." },
          { n: 8, titulo: "Descrição", texto: "O que a pessoa escreveu. Se ela anexou prints, eles aparecem logo abaixo — clique para abrir." },
          { n: 9, titulo: "Origem", texto: "Quem reportou, e-mail, departamento, sistema, tipo, quando, impacto e alcance informados, quantas vezes já foi reaberta, a resposta do TI e o link da tela em que a pessoa estava quando reportou." },
          { n: 10, titulo: "Registrar", texto: "Escreva um comentário (o que foi feito, o que falta) ou crie uma tarefa. Ctrl+Enter também registra." },
          { n: 11, titulo: "Histórico", texto: "Tudo o que aconteceu com a demanda, do mais novo para o mais antigo, separado por dia. Os fixados ficam no topo." },
          { n: 12, titulo: "Avançar para…", texto: "Leva a demanda para a próxima etapa do fluxo." },
          { n: 13, titulo: "Recusar", texto: "Encerra sem fazer. Pede o motivo, que vai para quem pediu." },
          { n: 14, titulo: "Concluir", texto: "Encerra como feita. Pede a resposta, que vai para quem pediu. Depois de concluída ou recusada, o rodapé passa a ter “Reabrir demanda”, que a devolve para a Entrada." },
        ],
      },
      {
        titulo: "Comentários, tarefas e histórico",
        print: { chave: "demanda-timeline", legenda: "O lado direito da demanda aberta." },
        itens: [
          { n: 1, titulo: "Comentário", texto: "Uma anotação no histórico." },
          { n: 2, titulo: "Tarefa", texto: "Algo a fazer, com prazo opcional. Tarefa pendente aparece contada no cartão." },
          { n: 3, titulo: "Registrar", texto: "Grava o comentário ou a tarefa." },
          { n: 4, titulo: "Fixar / Desafixar", texto: "Leva o registro para o topo do histórico, em “Fixados” — use para o que todo mundo precisa ler primeiro." },
          { n: 5, titulo: "Concluir tarefa", texto: "Marca a tarefa como feita (ela fica riscada). “Reabrir” desfaz." },
          { n: 6, titulo: "Mudanças automáticas", texto: "Troca de etapa e de responsável entram no histórico sozinhas, com quem fez e quando — de qualquer lugar que a mudança tenha vindo." },
        ],
      },
      {
        titulo: "Concluir ou recusar",
        print: { chave: "demanda-concluir", legenda: "A resposta pedida ao concluir." },
        itens: [
          { n: 1, titulo: "A resposta", texto: "Obrigatória. É o texto que quem pediu recebe na notificação — escreva para ele entender sem precisar perguntar." },
          { n: 2, titulo: "Concluir / Recusar", texto: "Só fica disponível com a resposta escrita." },
        ],
      },
      {
        titulo: "Registrar uma demanda",
        texto: "Para o que chegou por telefone, pessoalmente ou por mensagem, sem que a pessoa tenha usado o botão de reporte.",
        print: { chave: "demanda-nova", legenda: "O formulário de Nova demanda." },
        itens: [
          { n: 1, titulo: "Assunto", texto: "O resumo em uma linha. Obrigatório." },
          { n: 2, titulo: "Descrição", texto: "O que acontece, em qual tela, o que era esperado. Obrigatória." },
          { n: 3, titulo: "Tipo", texto: "Bug, Sugestão, Equipamento, Acesso ou Ajuda — cada opção tem a explicação ao lado." },
          { n: 4, titulo: "Sistema", texto: "De qual sistema é. Só aparece para Bug, Sugestão e Ajuda; equipamento e acesso não pedem sistema." },
          { n: 5, titulo: "Quem pediu", texto: "A pessoa que fez o pedido. Ela aparece como solicitante e recebe a resposta." },
          { n: 6, titulo: "Impacto", texto: "Se impede de trabalhar e quem é afetado. Com as duas respostas, a prioridade é sugerida sozinha (por exemplo: travado e afeta o time = Crítica). Sem elas, a demanda nasce “a triar”. Dá para mudar a prioridade depois no card." },
          { n: 7, titulo: "Criar demanda", texto: "Grava a demanda na Entrada." },
        ],
      },
    ],
  },
];
