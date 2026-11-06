import type { Secao } from "../tipos";

// ─────────────────────────────────────────────────────────────────────────────
// Painel do atendimento (/painel) e a aba Assuntos — telas SÓ do gestor.
//
// ⚠️ O `n` de cada item é o número do marcador no print (`chave`) — medido pelo
// harness em docs-prints/shots_painel.mjs. Mudou a tela, refaça o print e
// confira os números.
// ⚠️ As DEFINIÇÕES (rodada, TMR, TMPR, TMA, SLA, FCR…) espelham o cabeçalho da
// migração 20261148 e a 20261149 (assuntos). Mudou a conta lá, mude o texto aqui.
// ─────────────────────────────────────────────────────────────────────────────

export const SECOES_PAINEL: Secao[] = [
  {
    id: "painel",
    titulo: "Painel do atendimento",
    rota: "/painel",
    papel: "gestor",
    resumo:
      "Os números do atendimento pelo WhatsApp oficial, para acompanhar o time e cobrar: quem está esperando resposta agora, quanto tempo o cliente espera, quantas conversas foram fechadas sem resposta e o que cada pessoa fez no período. Só o gestor vê esta tela.",
    regras: {
      colaborador: ["O colaborador não vê esta tela: ela não está no menu dele, e o endereço mostra “Acesso restrito”."],
      gestor: [
        "Só aparece para gestor (no menu, em Gestão, e como primeiro atalho do Início).",
        "Todas as contas são feitas no banco, com a mesma regra para todo mundo: o número que você vê é o mesmo que outro gestor vê.",
        "A tela se atualiza sozinha a cada minuto — a fila é a de AGORA.",
        "Aba, período, número, pessoa aberta e filtros ficam no endereço: dá para mandar o link de uma visão exata para alguém.",
        "Quem resolveu, marcou aguardando ou reabriu só é registrado desde 06/11/2026. Antes disso as colunas dessas contas aparecem com a marca “desde 06/11”.",
      ],
    },
    blocos: [
      {
        titulo: "Como as contas funcionam",
        texto:
          "Algumas palavras têm sentido exato nesta tela, e entender cada uma evita cobrança errada.",
        itens: [
          { titulo: "Rodada", texto: "As mensagens que o cliente manda até alguém do time responder. Três mensagens seguidas do cliente são uma rodada só. Aviso automático (nota emitida, saiu para entrega…) não conta como resposta. Se o cliente ficar 24 h sem escrever, a próxima mensagem dele abre outra rodada." },
          { titulo: "Pede resposta", texto: "Nem toda mensagem pede resposta. “Ok”, “obrigado”, 👍, “chegou tudo certo”, figurinha e a resposta automática do WhatsApp Business do próprio cliente NÃO pedem. Uma rodada só entra na taxa e nos tempos se pedir resposta." },
          { titulo: "Atendimento", texto: "As rodadas da mesma pessoa no mesmo número sem um silêncio de mais de 24 h entre elas. É a “conversa” do ponto de vista do cliente." },
          { titulo: "Horário útil × corrido", texto: "No horário útil o relógio só anda dentro do horário de atendimento (configurado em “Horário e metas”): mensagem às 22h respondida às 8h10 conta 10 minutos. No corrido conta tudo — 10h10. A meta de 1ª resposta vale para o horário útil." },
          { titulo: "Mediana e p90", texto: "Mediana é o tempo do meio: metade das respostas saiu mais rápido que isso. p90 é o tempo em que 90% foram respondidas — mostra a demora dos casos ruins, que a mediana esconde." },
          { titulo: "Fechada sem resposta", texto: "O cliente pediu resposta, ninguém escreveu nada e alguém marcou a conversa como resolvida ou aguardando. É conta própria de propósito: sem ela, fechar sem responder MELHORARIA o tempo de resposta." },
          { titulo: "Perdida", texto: "O cliente pediu resposta, ninguém respondeu nem marcou nada, e a janela de 24 h do WhatsApp fechou. Depois disso só dá para escrever a ele com um modelo aprovado." },
        ],
      },
      {
        titulo: "O topo da tela",
        texto: "Os filtros do topo valem para todas as abas, exceto a fila de agora, que é sempre a de este momento.",
        print: { chave: "painel", legenda: "O topo do painel, com os filtros, os números de agora, os indicadores do período e as abas." },
        itens: [
          { n: 1, titulo: "Período", texto: "Os dias contados nos indicadores, gráficos e tabelas. Abre em “Últimos 30 dias”. Cada indicador compara com o período anterior do mesmo tamanho." },
          { n: 2, titulo: "Número", texto: "Todos os números juntos ou um só (CarboZé, Clube, Loja). Também dá para escolher clicando no número na tabela “Por número”." },
          { n: 3, titulo: "Horário útil | Corrido", texto: "Como os tempos são contados (veja “Como as contas funcionam”). A Duração do atendimento é sempre corrida." },
          { n: 4, titulo: "Horário e metas", texto: "O horário de atendimento e as metas do time. Veja “Horário e metas”, abaixo." },
          { n: 5, titulo: "Atualizado às", texto: "Quando os números foram calculados. A tela recalcula sozinha a cada minuto." },
          { n: 6, titulo: "Agora", texto: "A situação deste momento: quem está esperando e quanto tempo falta para a janela fechar." },
          { n: 7, titulo: "Indicadores do período", texto: "Os números do período escolhido, com a meta e a comparação com o período anterior." },
          { n: 8, titulo: "As abas", texto: "Visão geral, Fila agora (com quantos esperam; vermelho se alguma janela fecha em até 2 h), Assuntos, Atendentes, Exceções (com quantas foram fechadas sem resposta) e Horários." },
        ],
      },
      {
        titulo: "Agora",
        print: { chave: "painel-agora", legenda: "A faixa de agora: 9 esperando, a mais antiga há 21 h, 3 com risco." },
        itens: [
          { n: 1, titulo: "Esperando resposta", texto: "Quantas conversas têm uma rodada pedindo resposta neste momento, e quantas delas têm a janela fechando em até 2 h e em até 6 h. Vermelho quando alguma fecha em até 2 h. Clique para abrir a fila." },
          { n: 2, titulo: "A mais antiga", texto: "Há quanto tempo espera o cliente que está esperando há mais tempo. Fica âmbar a partir de 1 hora." },
          { n: 3, titulo: "Com risco", texto: "Quantos dos que esperam falaram em Procon, Reclame Aqui, polícia, processo, golpe ou estorno. Clique para ver só esses na fila." },
          { n: 4, titulo: "Perdidas em 7 dias", texto: "Quantas janelas fecharam sem resposta nos últimos 7 dias. Clique para ver a lista, no fim da fila." },
          { n: 5, titulo: "Aguardando o cliente", texto: "Conversas marcadas como “aguardando” — a bola está com o cliente. Abre a lista em Conversas." },
          { n: 6, titulo: "Em atendimento", texto: "Conversas com responsável e em atendimento agora. Clique para ver por pessoa, na aba Atendentes." },
        ],
      },
      {
        titulo: "Os indicadores do período",
        texto:
          "Cada cartão mostra o número, a meta (quando há), de onde ele sai e a comparação com o período anterior. Verde é melhora, vermelho é piora. O “n” no canto é quantos casos entraram na conta — número com n pequeno varia muito de um período para outro.",
        print: { chave: "painel-indicadores", legenda: "Os dez indicadores do período." },
        itens: [
          { n: 1, titulo: "Taxa de resposta", texto: "De todas as rodadas que pediam resposta e já tiveram desfecho, quantas foram respondidas por alguém do time. As que ainda estão esperando não entram na conta (aparecem ao lado). Vermelho abaixo da meta." },
          { n: 2, titulo: "1ª resposta (TMPR)", texto: "Quanto o cliente espera pela PRIMEIRA resposta de cada atendimento — é a espera que ele mais sente. Mediana, com o p90 abaixo. A meta aparece só no horário útil." },
          { n: 3, titulo: "Tempo de resposta (TMR)", texto: "O mesmo, para TODAS as rodadas respondidas, não só a primeira." },
          { n: 4, titulo: "Dentro da meta (SLA)", texto: "Das rodadas que pediam resposta, quantas foram respondidas dentro da meta de minutos. A que foi fechada sem resposta ou perdida conta como fora; a que ainda espera só entra depois de passar da meta." },
          { n: 5, titulo: "Duração do atendimento (TMA)", texto: "Da primeira mensagem do cliente até a última resposta do time, em tempo corrido, com quantas mensagens o atendimento teve. No WhatsApp o cliente some e volta: tempo longo nem sempre é esforço — olhe junto com as mensagens." },
          { n: 6, titulo: "Resolvidos no 1º contato (FCR)", texto: "Atendimentos com uma única rodada, respondida, em que o cliente não voltou pedindo nada nos 7 dias seguintes. Só entram os atendimentos com 7 dias ou mais — o de ontem sairia sempre perfeito." },
          { n: 7, titulo: "Fechadas sem resposta", texto: "Quantas rodadas que pediam resposta foram marcadas como resolvidas ou aguardando sem ninguém escrever. A lista, com quem fechou, está na aba Exceções." },
          { n: 8, titulo: "Perdidas (janela fechou)", texto: "Quantas rodadas que pediam resposta ficaram sem resposta até a janela de 24 h fechar." },
          { n: 9, titulo: "Reabertas", texto: "Das conversas resolvidas há 7 dias ou mais, quantas o cliente reabriu escrevendo de novo." },
          { n: 10, titulo: "Pediam resposta", texto: "Quantas rodadas do período pediam resposta — a base das contas acima —, quantas eram só agradecimento e quantos clientes diferentes." },
        ],
      },
      {
        titulo: "Visão geral",
        print: { chave: "painel-geral", legenda: "A Visão geral: o dia a dia, o tempo até a resposta e a tabela por número." },
        itens: [
          { n: 1, titulo: "Por dia", texto: "Para cada dia, as rodadas que pediam resposta, divididas em respondidas, fechadas sem resposta, perdidas e aguardando. Passe o mouse para ver os números do dia." },
          { n: 2, titulo: "Mediana de resposta", texto: "A linha mostra a mediana do tempo de resposta de cada dia; a linha tracejada é a meta." },
          { n: 3, titulo: "Tempo até a resposta", texto: "Quantas rodadas foram respondidas em até 5 min, de 5 a 15, de 15 a 60, de 1 a 4 h, de 4 a 24 h e com mais de 24 h. A faixa da meta vem marcada." },
          { n: 4, titulo: "As que não tiveram resposta", texto: "No fim da lista, as fechadas sem resposta, as perdidas e as que ainda aguardam." },
          { n: 5, titulo: "Por número", texto: "Os mesmos números separados por número de WhatsApp. “Última resposta” fica vermelha quando aquele número está há mais de 2 dias sem resposta do time — ou nunca respondeu. Clique no número para filtrar a tela por ele." },
        ],
      },
      {
        titulo: "Fila agora",
        texto: "Quem está esperando resposta neste momento, do que espera há mais tempo para o mais recente. É a lista de trabalho do dia.",
        print: { chave: "painel-fila", legenda: "A fila com 9 conversas esperando." },
        itens: [
          { n: 1, titulo: "Assunto", texto: "Mostra só as conversas de um assunto (reclamação, pagamento, produto, confiança, entrega, uso, onde comprar, outros)." },
          { n: 2, titulo: "Só com risco", texto: "Só quem falou em Procon, Reclame Aqui, polícia, processo, golpe ou estorno." },
          { n: 3, titulo: "Uma conversa", texto: "O cliente, o número, o assunto, a última mensagem (e quantas mandou), o responsável e a situação." },
          { n: 4, titulo: "Esperando há", texto: "Há quanto tempo o cliente espera." },
          { n: 5, titulo: "Janela", texto: "Quanto falta para a janela de 24 h fechar. Vermelho em até 2 h, âmbar em até 6 h — responda antes, senão só com modelo." },
          { n: 6, titulo: "Abrir conversa", texto: "Abre a conversa na tela de Conversas, na caixa certa." },
        ],
      },
      {
        titulo: "Janelas que fecharam",
        texto: "No fim da fila, as conversas cuja janela fechou sem resposta nos últimos 7 dias. Para falar com essas pessoas agora, só com um modelo aprovado.",
        print: { chave: "painel-perdidas", legenda: "As conversas perdidas nos últimos 7 dias." },
        itens: [
          { n: 1, titulo: "Janela fechou", texto: "Quando o cliente escreveu pela última vez e quando a janela fechou." },
        ],
      },
      {
        titulo: "Atendentes",
        texto:
          "O que cada pessoa fez no período. Clique no cabeçalho para ordenar e numa linha para abrir o detalhe. Quem respondeu menos de 5 rodadas aparece apagado: número com tão poucos casos ainda não diz muito. Quem não fez nada no período fica em “Sem atividade”, recolhido no fim.",
        print: { chave: "painel-atendentes", legenda: "A tabela de quem atendeu no período." },
        itens: [
          { n: 1, titulo: "Pessoa", texto: "Clique para abrir o detalhe da pessoa." },
          { n: 2, titulo: "Respondidas", texto: "Quantas rodadas que pediam resposta a pessoa respondeu (a primeira resposta da rodada é de quem a respondeu)." },
          { n: 3, titulo: "Mediana e p90", texto: "Quanto o cliente esperou pelas respostas dessa pessoa." },
          { n: 4, titulo: "Na meta", texto: "Das respostas dela, quantas saíram dentro da meta de minutos. Vermelho abaixo da meta, a partir de 5 respondidas." },
          { n: 5, titulo: "Fechou sem responder", texto: "Quantas vezes a pessoa marcou resolvido ou aguardando numa conversa em que o cliente pedia resposta e ninguém respondeu. É o número para conversar com ela." },
          { n: 6, titulo: "Reabertas", texto: "Das conversas que a pessoa resolveu, quantas o cliente reabriu (e a porcentagem, sobre as resolvidas há 7 dias ou mais)." },
          { n: 7, titulo: "Última", texto: "Quando a pessoa respondeu pela última vez. Ao lado: mensagens enviadas (as que falharam, entre parênteses), conversas, dias com atividade, notas internas, quantas atende agora e o horário entre a primeira e a última mensagem." },
        ],
      },
      {
        titulo: "O detalhe de uma pessoa",
        print: { chave: "painel-pessoa", legenda: "O detalhe do Rafael, na lista de fechadas sem resposta." },
        itens: [
          { n: 1, titulo: "Quem e quando", texto: "Há quanto tempo foi a última resposta e o horário em que a pessoa mandou mensagens no período." },
          { n: 2, titulo: "Os números", texto: "Os mesmos números da tabela, num lugar só." },
          { n: 3, titulo: "Mensagens por dia", texto: "Quanto a pessoa escreveu em cada dia do período." },
          { n: 4, titulo: "Mensagens por hora", texto: "Em que horas ela escreve: escuro dentro do horário de atendimento, claro fora." },
          { n: 5, titulo: "As listas", texto: "As rodadas que ela respondeu (as mais lentas ou as mais recentes primeiro), as que ela fechou sem responder e as que foram reabertas — cada uma com “Abrir” para ir à conversa." },
        ],
      },
      {
        titulo: "Exceções",
        texto: "As conversas fechadas sem resposta, uma a uma, com quem fechou. É a lista para revisar e cobrar.",
        print: { chave: "painel-excecoes", legenda: "As conversas fechadas sem resposta, de todo o time." },
        itens: [
          { n: 1, titulo: "Por pessoa", texto: "Todas, ou só as de uma pessoa (com quantas cada uma fechou)." },
          { n: 2, titulo: "Só com risco", texto: "Só as conversas em que o cliente falou em Procon, golpe, estorno etc." },
          { n: 3, titulo: "Quem fechou", texto: "Se marcou resolvido ou aguardando, e quem." },
          { n: 4, titulo: "Quanto depois", texto: "Quando o cliente escreveu, quando a conversa foi fechada e quanto tempo depois." },
        ],
      },
      {
        titulo: "Horários",
        texto: "Em que dias e horas os clientes escrevem, e em quais o time responde. Serve para decidir escala e horário de atendimento.",
        print: { chave: "painel-horarios", legenda: "O mapa de dia da semana × hora, lendo a demanda." },
        itens: [
          { n: 1, titulo: "O que o mapa mostra", texto: "Demanda (rodadas que pediam resposta), Sem resposta (fechadas sem resposta e perdidas), Tempo de resposta (a mediana) e Mensagens da equipe. Quanto mais escuro, mais. Passe o mouse num quadrado para ver o número." },
          { n: 2, titulo: "Horário de atendimento", texto: "O contorno marca o horário de atendimento configurado. Demanda forte fora dele é sinal de escala a rever." },
          { n: 3, titulo: "Total", texto: "A soma de cada hora, em todos os dias." },
        ],
      },
      {
        titulo: "Horário e metas",
        texto: "Vale para o time inteiro e muda as contas na hora, inclusive as do passado.",
        print: { chave: "painel-config", legenda: "O horário de atendimento e as metas." },
        itens: [
          { n: 1, titulo: "Início e fim", texto: "O horário de atendimento. É dele que sai o tempo em horário útil e o contorno do mapa de Horários." },
          { n: 2, titulo: "Dias", texto: "Os dias em que há atendimento. Dia desmarcado não conta no horário útil." },
          { n: 3, titulo: "1ª resposta em até", texto: "A meta, em minutos, de tempo até a resposta (horário útil)." },
          { n: 4, titulo: "Dentro da meta", texto: "Quantos por cento das rodadas o time quer responder dentro da meta de minutos." },
          { n: 5, titulo: "Taxa de resposta", texto: "Quantos por cento das rodadas que pediam resposta o time quer responder." },
        ],
      },
    ],
  },

  // ── Aba Assuntos ───────────────────────────────────────────────────────────
  {
    id: "painel-assuntos",
    titulo: "Painel do atendimento — Assuntos",
    rota: "/painel?aba=assuntos",
    papel: "gestor",
    resumo:
      "Do que os clientes falam no WhatsApp: reclamações (separadas em atraso, não recebeu, veio errado, não funcionou…), dúvidas, pedido e entrega, comercial e elogios. Serve para medir problema — quantos clientes reclamaram de atraso este mês — e para achar elogio rápido.",
    regras: {
      colaborador: ["O colaborador não vê esta aba: o painel inteiro é só do gestor."],
      gestor: [
        "Conta CLIENTES, não mensagens: quem mandou cinco mensagens de atraso é um cliente com atraso. O número de mensagens aparece ao lado.",
        "O assunto é lido pelas palavras da mensagem do cliente. É uma leitura, não uma certeza: mensagem curta ou ambígua pode cair em “Outros” ou no assunto vizinho.",
        "Uma mensagem tem no máximo UM assunto por grupo, mas pode ter vários grupos (ex.: uma reclamação de atraso que também pede cancelamento).",
        "Reclamação tira o elogio da mesma mensagem: “demorou mas chegou, obrigado” não conta como elogio.",
        "A lista de assuntos e as palavras de cada um são cadastro: dá para corrigir sem mudar o sistema (peça ao TI).",
        "Os filtros do topo (período e número) valem aqui também.",
      ],
    },
    blocos: [
      {
        titulo: "A aba",
        print: { chave: "painel-assuntos", legenda: "A aba Assuntos nos últimos 30 dias." },
        itens: [
          { n: 1, titulo: "Os grupos", texto: "Reclamações, Pedido e entrega, Dúvidas, Comercial, Elogios e Outros: quantos clientes falaram de cada um, com quantas mensagens e a comparação com o período anterior. Reclamação subindo fica vermelha, elogio subindo fica verde. Clique num grupo para ver só os assuntos dele." },
          { n: 2, titulo: "Clientes por dia", texto: "Quantos clientes falaram de cada grupo em cada dia (ou semana, em período longo). Um pico de reclamação mostra o dia em que algo deu errado." },
          { n: 3, titulo: "Risco", texto: "Quem falou em Procon, Reclame Aqui, polícia, redes sociais, golpe ou estorno, do mais recente para o mais antigo. “Ver todos” abre a lista inteira." },
          { n: 4, titulo: "Sem resposta / Respondido", texto: "Se alguém do time respondeu depois daquela mensagem." },
          { n: 5, titulo: "Um assunto", texto: "Quantos clientes, a barra (comparada ao maior assunto do grupo), a variação, quantos ficaram sem resposta, o tempo até a 1ª resposta e o minigráfico do período. O escudo ao lado do nome diz quantos daqueles clientes falaram em risco. Clique na linha para ver quem falou." },
          { n: 6, titulo: "vs. anterior", texto: "A variação de clientes em relação ao período anterior do mesmo tamanho. “antes 0” = ninguém tinha falado disso antes." },
          { n: 7, titulo: "Sem resposta", texto: "Quantos daqueles clientes ficaram sem resposta do time. Só aparece nos assuntos que pedem resposta — “chegou tudo certo” ou “avisou que pagou” não pedem." },
          { n: 8, titulo: "1ª resposta", texto: "A mediana do tempo, corrido, entre a mensagem do cliente sobre aquele assunto e a 1ª resposta do time." },
          { n: 9, titulo: "Minigráfico", texto: "Como aquele assunto andou dia a dia no período." },
          { n: 10, titulo: "O grupo", texto: "A linha do grupo, com o total de clientes dele. Clique para ver todos os clientes do grupo." },
        ],
      },
      {
        titulo: "Elogios",
        texto: "No fim da aba, os elogios mais recentes, com o texto do cliente — para achar rápido um depoimento ou um atendimento que deu certo.",
        print: { chave: "painel-assuntos-elogios", legenda: "Os elogios mais recentes." },
        itens: [
          { n: 1, titulo: "Ver todos", texto: "Abre a lista de todos os clientes que elogiaram no período." },
          { n: 2, titulo: "Abrir", texto: "Abre a conversa em Conversas." },
        ],
      },
      {
        titulo: "Quem falou",
        texto: "Ao clicar num assunto, num grupo, em “Ver todos” do Risco ou dos Elogios, abre a lista de quem falou, do mais recente para o mais antigo. O endereço da página guarda o que está aberto.",
        print: { chave: "painel-assuntos-quem", legenda: "Os clientes que reclamaram de atraso." },
        itens: [
          { n: 1, titulo: "O assunto", texto: "O que está sendo listado." },
          { n: 2, titulo: "Quantos e quando", texto: "Quantos clientes, e o período." },
          { n: 3, titulo: "Risco e Sem resposta", texto: "Se o cliente falou em risco e se ainda está sem resposta do time." },
          { n: 4, titulo: "As mensagens", texto: "As últimas mensagens do cliente sobre aquele assunto, com dia e hora. Se a mensagem também é de outro assunto, ele aparece ao lado." },
          { n: 5, titulo: "Abrir", texto: "Abre a conversa em Conversas, na caixa certa." },
          { n: 6, titulo: "Mostrar mais", texto: "A lista vem de 30 em 30; o botão traz os próximos." },
        ],
      },
    ],
  },
];
