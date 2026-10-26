import type { Secao } from "../tipos";

// ─────────────────────────────────────────────────────────────────────────────
// Conversas (/conversas) — a caixa do WhatsApp oficial.
//
// ⚠️ O `n` de cada item é o número do marcador no print (`chave`) — medido pelo
// harness em docs-prints/shots_conversas.mjs. Mudou a tela, refaça o print e
// confira os números.
// ─────────────────────────────────────────────────────────────────────────────

export const SECOES_CONVERSAS: Secao[] = [
  // ── A caixa: números, lista, busca e filtros ────────────────────────────────
  {
    id: "conversas",
    titulo: "Conversas",
    rota: "/conversas",
    resumo:
      "As mensagens que os clientes mandam para os números oficiais de WhatsApp da CarboZé — e as respostas do time. Esta tela é o único lugar onde essas conversas existem: elas não aparecem no WhatsApp do celular nem em outro painel. Cada número tem a sua caixa, e a regra que manda em tudo é a janela de 24 horas.",
    regras: {
      colaborador: [
        "Todo o time de atendimento vê as mesmas caixas e as mesmas conversas.",
        "Qualquer pessoa pode responder, assumir uma conversa, passá-la para alguém, marcar etiquetas e escrever recados internos.",
        "A janela de 24 h: só dá para escrever livremente ao cliente até 24 horas depois da ÚLTIMA mensagem dele. Passou disso, o WhatsApp recusa — e o campo de resposta some.",
        "A mensagem que nós mandamos não abre a janela. Só o cliente abre, quando escreve.",
        "A tela se atualiza sozinha: mensagem nova aparece sem precisar apertar F5, e o relógio da janela anda sozinho.",
        "A conversa aberta e a caixa escolhida ficam no endereço da página — dá para mandar o link para um colega abrir a mesma conversa.",
      ],
      gestor: [
        "A tela é a mesma para o gestor: não há botão nem conversa a mais.",
        "Respostas rápidas: na tela, só quem criou vê a lixeira para apagar; o gestor consegue apagar qualquer uma (por exemplo, a de quem saiu da empresa).",
      ],
    },
    blocos: [
      {
        titulo: "A tela",
        texto:
          "São três colunas: à esquerda a lista de conversas, no meio a conversa aberta e à direita o painel do contato. Em telas menores o painel do contato sai e o que ele mostra fica no topo da conversa; no celular aparece a lista OU a conversa, como num aplicativo de mensagens.",
        print: { chave: "conversas", legenda: "A caixa do número CarboZé, com a conversa da Luana aberta." },
        itens: [
          { n: 1, titulo: "Qual número (caixa)", texto: "Cada número oficial tem a sua caixa: CarboZé (os avisos do pedido e o atendimento), CarboZé Clube (a oferta de recompra) e CarboZé Loja (o lembrete de carrinho abandonado). A mesma pessoa em dois números são duas conversas diferentes, cada uma com a sua janela de 24 h. Trocar de caixa fecha a conversa que estava aberta." },
          { n: 2, titulo: "Esperando resposta", texto: "Quantas conversas desta caixa precisam de resposta. A primeira conta é das que ainda estão dentro da janela (dá para responder); a segunda, quando aparece, é das que já estão com a janela fechada. Conta a caixa inteira, sem olhar busca ou filtro." },
          { n: 3, titulo: "Quem recebe aviso", texto: "Quantas pessoas são avisadas (sininho e notificação) quando um cliente escreve. Em laranja, “Ninguém recebe aviso”, quer dizer que ninguém está sendo avisado. Clique para escolher quem recebe — veja “Quem recebe o aviso”, abaixo." },
          { n: 4, titulo: "Voltar", texto: "Volta para a tela de onde você veio (por padrão, Mensagens ao cliente)." },
          { n: 5, titulo: "A lista", texto: "As conversas dos últimos 30 dias desta caixa, agrupadas pela situação. Clique numa para abri-la." },
          { n: 6, titulo: "A conversa", texto: "A conversa aberta: mensagens do cliente, respostas do time, avisos automáticos e recados internos, em ordem. Veja a seção “A conversa aberta”." },
          { n: 7, titulo: "O painel do contato", texto: "Quem é o cliente, a situação do atendimento, o responsável, as etiquetas, o pedido e os links de checkout." },
        ],
      },
      {
        titulo: "A lista de conversas",
        texto:
          "A lista abre em “Não respondidas” quando há alguém esperando, e em “Todas” quando não há. Os números das abas são da caixa inteira — a busca e os filtros não mexem neles.",
        print: { chave: "conversas-lista", legenda: "A lista na aba Todas, com os cinco grupos." },
        itens: [
          { n: 1, titulo: "Buscar", texto: "Procura pelo nome do cliente (o do pedido ou o que ele usa no WhatsApp) ou por parte do número de telefone, digitado de qualquer jeito. Sem acento e sem diferença de maiúscula. Abaixo do campo aparece quantas conversas casaram." },
          { n: 2, titulo: "Não respondidas", texto: "Conversas em que o cliente escreveu por último e ninguém respondeu. Fica laranja quando tem alguém dentro." },
          { n: 3, titulo: "Minhas", texto: "Conversas em que você é o responsável." },
          { n: 4, titulo: "Sem responsável", texto: "Conversas que ninguém assumiu (as resolvidas ficam de fora)." },
          { n: 5, titulo: "Janela aberta", texto: "Conversas em que ainda dá para responder livremente — o cliente escreveu há menos de 24 h." },
          { n: 6, titulo: "Todas", texto: "Tudo, inclusive as resolvidas e as que só receberam aviso automático." },
          { n: 7, titulo: "Filtros", texto: "Abre filtros por responsável, etiqueta, etapa do aviso e situação, e a ordem da lista. O número no botão diz quantos filtros estão ligados; o X ao lado limpa todos." },
          { n: 8, titulo: "Grupos", texto: "A lista é separada pela situação, na ordem da urgência: Abertas (ninguém respondeu), Em atendimento, Aguardando o cliente, Resolvidas e Sem pendência. O número à direita é quantas há no grupo. Com muitas conversas, cada grupo mostra 100 e um botão “Mostrar mais”." },
          { n: 9, titulo: "Tempo de janela", texto: "Quanto falta para a janela de 24 h fechar. Em cinza com folga; fica laranja com menos de 6 horas." },
          { n: 10, titulo: "Janela fechando", texto: "Em vermelho, falta menos de 1 hora: é a conversa para responder primeiro." },
          { n: 11, titulo: "Cadeado", texto: "A janela está fechada (ou o cliente nunca escreveu): não dá mais para responder por aqui até ele escrever de novo. Ao lado fica o dia e a hora da última mensagem." },
          { n: 12, titulo: "Parece só um agradecimento", texto: "A estrelinha verde avisa que a última mensagem do cliente parece só um “ok, obrigado” — provavelmente não precisa de resposta. É uma sugestão: quem decide é você, ao abrir." },
          { n: 13, titulo: "Situação", texto: "Aberto (cliente esperando), Em atendimento (o time respondeu por último), Aguardando (alguém marcou que espera o cliente) ou Resolvido. As duas primeiras o sistema calcula sozinho; as duas últimas são marcadas por uma pessoa." },
          { n: 14, titulo: "Etiqueta", texto: "A primeira etiqueta da conversa; “+1” quer dizer que há mais." },
          { n: 15, titulo: "Sem dono", texto: "Ninguém assumiu a conversa ainda." },
          { n: 16, titulo: "Responsável", texto: "O primeiro nome de quem está com a conversa." },
          { n: 17, titulo: "Mensagens sem resposta", texto: "Quantas mensagens do cliente chegaram depois da nossa última resposta." },
        ],
      },
      {
        titulo: "Filtros",
        texto:
          "Os filtros só aparecem com opções que existem nas conversas carregadas — etiqueta que ninguém usou não aparece para ser escolhida.",
        print: { chave: "conversas-filtros", legenda: "O painel de filtros aberto." },
        itens: [
          { n: 1, titulo: "Responsável", texto: "Só as conversas de uma pessoa específica." },
          { n: 2, titulo: "Etiqueta", texto: "Só as conversas com uma etiqueta." },
          { n: 3, titulo: "Etapa do aviso", texto: "Pelo assunto do último aviso automático: Compra identificada, Nota fiscal emitida, Aguardando coleta, A caminho, Saiu para entrega, Entregue, Hora de repor ou um dos lembretes de carrinho." },
          { n: 4, titulo: "Status", texto: "Pela situação: Aberto, Em atendimento, Aguardando ou Resolvido." },
          { n: 5, titulo: "Ordem", texto: "Mais recentes ou mais antigas primeiro. A ordem vale dentro de cada grupo; os grupos continuam na ordem da urgência." },
        ],
      },
      {
        titulo: "As outras caixas: Clube e Loja",
        texto:
          "A caixa do CarboZé Clube recebe as respostas à oferta de recompra (“Hora de repor”), e a do CarboZé Loja as respostas ao lembrete de carrinho abandonado. A conversa aparece na lista assim que a mensagem é enviada — com o nome do cliente —, mas o campo de resposta só aparece quando o cliente responde: a oferta não abre a janela. A oferta não leva link; quem manda o link é você, pelo painel “Links de checkout”.",
        print: { chave: "conversas-clube", legenda: "A caixa do CarboZé Clube, com uma cliente que pediu para não receber ofertas." },
        itens: [
          { n: 1, titulo: "Caixa escolhida", texto: "A caixa aberta fica destacada. Cada caixa tem a sua lista, as suas janelas, situações e etiquetas." },
          { n: 2, titulo: "Conversa da recompra", texto: "A cliente respondeu à oferta. Responda dentro das 24 h." },
          { n: 3, titulo: "Aviso automático da oferta", texto: "A mensagem “Hora de repor” que o sistema mandou, com o nome da etapa." },
          { n: 4, titulo: "Não recebe ofertas", texto: "Esta pessoa pediu para parar: não recebe mais oferta de recompra nem lembrete de carrinho, em nenhum dos números. A data é de quando foi marcado." },
          { n: 5, titulo: "Voltar a enviar", texto: "Desfaz a marca — use só se o próprio cliente pedir." },
        ],
      },
      {
        titulo: "Quem recebe o aviso",
        texto:
          "Escolhe quem é avisado (toast e sininho, em qualquer app do Carbo) quando um cliente escreve. Ninguém é avisado até ser marcado aqui.",
        print: { chave: "quem-recebe", legenda: "A lista de quem recebe o aviso de mensagem nova." },
        itens: [
          { n: 1, titulo: "Buscar pessoa", texto: "Procura alguém do time pelo nome." },
          { n: 2, titulo: "Marcado", texto: "Em verde: esta pessoa recebe o aviso. Clique para desmarcar." },
          { n: 3, titulo: "Não marcado", texto: "Esta pessoa não é avisada. Clique para marcar. Só aparece quem é do time interno — lojista e licenciado não podem ser marcados." },
          { n: 4, titulo: "Fechar", texto: "Fecha a lista. O botão no topo da tela continua mostrando quantas pessoas recebem." },
        ],
      },
    ],
  },

  // ── A conversa aberta ───────────────────────────────────────────────────────
  {
    id: "conversa-aberta",
    titulo: "Conversas — a conversa aberta",
    rota: "/conversas",
    resumo:
      "Como ler a conversa, responder (texto, foto, documento ou áudio), agendar uma mensagem, deixar um recado para o time e cuidar da situação do atendimento — responsável, etiquetas, pedido e o pedido de não receber ofertas.",
    regras: {
      colaborador: [
        "Responder só funciona com a janela de 24 h aberta. Fechada, o campo some e aparece o aviso; ela reabre sozinha quando o cliente escrever de novo.",
        "Recado interno nunca vai para o cliente e funciona mesmo com a janela fechada.",
        "“Aguardando” e “Resolvido” voltam a “Aberto” sozinhos quando o cliente escreve de novo — e a tela avisa que a conversa foi reaberta.",
        "“Parar de enviar ofertas” vale para a pessoa em todos os números, e só para oferta de recompra e lembrete de carrinho. Os avisos do pedido continuam.",
      ],
      gestor: [
        "A conversa é a mesma para o gestor: não há botão a mais.",
      ],
    },
    blocos: [
      {
        titulo: "Lendo a conversa",
        texto:
          "As mensagens do cliente ficam à esquerda, em cinza; as do time, à direita, em verde. Os avisos automáticos (da esteira, da recompra e do carrinho) ficam à direita com contorno tracejado. Mensagens seguidas em poucos minutos viram um bloco, com a hora só na última.",
        print: { chave: "conversa-aberta", legenda: "A conversa da Luana: avisos automáticos, mensagens, um áudio e um recado interno." },
        itens: [
          { n: 1, titulo: "Procurar nesta conversa", texto: "Busca uma palavra na conversa inteira, desde o começo (a partir de 2 letras). Clique num resultado para ir até a mensagem." },
          { n: 2, titulo: "Arquivos da conversa", texto: "Lista as fotos, documentos e áudios trocados nesta conversa, do mais novo para o mais antigo." },
          { n: 3, titulo: "Marcar resolvida", texto: "Tira a conversa da fila sem precisar responder — para quando o cliente só agradeceu. Quando ela já está resolvida, o botão vira “Reabrir”." },
          { n: 4, titulo: "Janela de 24 h", texto: "Quanto tempo ainda dá para responder, com a barrinha. Verde com folga, laranja com menos de 6 h, vermelho com menos de 1 h (“fecha em menos de 1 h”)." },
          { n: 5, titulo: "Dia", texto: "Separador de dia: Hoje, Ontem ou a data." },
          { n: 6, titulo: "Aviso automático", texto: "Mensagem que o sistema mandou sozinho. Em cima diz de qual etapa é (por exemplo, “A caminho”). Não conta como atendimento." },
          { n: 7, titulo: "Botão do aviso", texto: "O botão “Acompanhar pedido” que o cliente recebeu junto, com o código de rastreio." },
          { n: 8, titulo: "Mensagem do cliente", texto: "O que o cliente escreveu, com a hora." },
          { n: 9, titulo: "Resposta do time", texto: "Embaixo, quem do time enviou e a hora (o cliente não vê o nome). Um tique: enviada; dois: entregue; dois azuis: lida. Se não chegar, aparece em vermelho “não chegou ao cliente” com o motivo." },
          { n: 10, titulo: "Áudio, documento ou foto", texto: "Foto aparece sozinha; áudio e documento abrem no clique (“toque para ouvir”, “toque para abrir”). Se o cliente mandou um formato que o WhatsApp não entrega, aparece “mensagem não entregue pelo WhatsApp” — peça para ele reenviar como texto, foto ou áudio." },
          { n: 11, titulo: "Recado interno", texto: "Anotação do time, com moldura tracejada laranja e “só o time vê”. Fica no ponto da conversa em que foi escrita, com o autor e a hora. Nunca vai para o cliente." },
          { n: 12, titulo: "Responder", texto: "Aba para escrever ao cliente." },
          { n: 13, titulo: "Recado interno", texto: "Aba para escrever um recado para o time em vez de para o cliente." },
          { n: 14, titulo: "Campo de resposta", texto: "Escreva a mensagem. Ctrl + Enter (⌘ + Enter no Mac) envia. Digite / para usar uma resposta pronta e cole um print com Ctrl + V para enviá-lo como foto." },
          { n: 15, titulo: "Respostas rápidas", texto: "Abre as frases prontas do time para usar, criar ou apagar. Veja “Respostas rápidas”, abaixo." },
          { n: 16, titulo: "Enviar foto ou documento", texto: "Escolhe uma imagem (JPG ou PNG), PDF ou texto. Antes de sair, aparece uma prévia para conferir, com campo para legenda." },
          { n: 17, titulo: "Gravar áudio", texto: "Grava um áudio pelo microfone. Ao parar, você ouve antes de enviar e pode descartar." },
          { n: 18, titulo: "Agendar", texto: "Marca a mensagem escrita para sair mais tarde, sempre dentro da janela de 24 h. Só acende com texto escrito." },
          { n: 19, titulo: "Enviar", texto: "Manda a mensagem agora." },
        ],
      },
      {
        titulo: "Agendar uma mensagem",
        print: { chave: "conversa-agendar", legenda: "A conversa do Rodrigo, com uma mensagem já agendada e outra sendo agendada." },
        itens: [
          { n: 1, titulo: "Documento do cliente", texto: "Clique para baixar e abrir o arquivo que o cliente mandou." },
          { n: 2, titulo: "Mensagem agendada", texto: "Fica visível até sair, com o dia e a hora. “Cancelar” desiste do envio. Se o envio falhar, a faixa fica vermelha com “Não foi enviada” e o motivo." },
          { n: 3, titulo: "Enviar em", texto: "O dia e a hora do envio. O sistema sugere daqui a uma hora (ou o fim da janela, se faltar menos)." },
          { n: 4, titulo: "Confirmar", texto: "Agenda a mensagem e limpa o campo." },
          { n: 5, titulo: "Limite", texto: "O último horário possível: depois disso a janela fecha e o WhatsApp recusaria a mensagem." },
        ],
      },
      {
        titulo: "Recado interno",
        print: { chave: "conversa-recado", legenda: "A aba Recado interno, com um recado sendo escrito." },
        itens: [
          { n: 1, titulo: "Aba Recado interno", texto: "O campo passa a escrever para o time, em laranja." },
          { n: 2, titulo: "O recado", texto: "Escreva o que o colega precisa saber (até 2.000 letras). Ctrl + Enter também anota." },
          { n: 3, titulo: "Não vai para o WhatsApp", texto: "Lembrete de que o cliente nunca vê este texto." },
          { n: 4, titulo: "Anotar", texto: "Grava o recado na conversa e volta para a aba Responder. Funciona mesmo com a janela fechada." },
        ],
      },
      {
        titulo: "Respostas rápidas",
        texto:
          "As frases que o time repete todo dia. Elas são COLADAS no campo, nunca enviadas direto: ajuste o nome do cliente ou o que precisar e depois envie.",
        print: { chave: "conversa-barra", legenda: "Digitando / no campo de resposta." },
        itens: [
          { n: 1, titulo: "Digite /", texto: "Comece com / e as letras do atalho (por exemplo, /frete). As respostas que combinam aparecem acima do campo." },
          { n: 2, titulo: "Escolher", texto: "Clique, ou use as setas e Enter, para colar o texto no campo. Esc fecha a lista." },
        ],
      },
      {
        print: { chave: "respostas-rapidas", legenda: "O botão Respostas rápidas, criando uma resposta nova." },
        itens: [
          { n: 1, titulo: "Nova", texto: "Abre o formulário para criar uma resposta (o botão vira “Cancelar”)." },
          { n: 2, titulo: "Atalho", texto: "A palavra que chama a resposta depois da /. Só letras, números, hífen e _, até 24, sem espaço. Abaixo aparece como ela vai ficar." },
          { n: 3, titulo: "Texto", texto: "A frase que vai ser colada no campo." },
          { n: 4, titulo: "Salvar", texto: "Grava a resposta para todo o time." },
          { n: 5, titulo: "Respostas do time", texto: "Clique numa para colar no campo. A lixeira (ao passar o mouse) aparece só nas que você criou.", },
        ],
      },
      {
        titulo: "Sinais que a conversa mostra",
        print: { chave: "conversa-sinais", legenda: "Cliente que só agradeceu, com a janela quase fechando." },
        itens: [
          { n: 1, titulo: "Janela fechando", texto: "Menos de 1 hora para responder: vermelho e “fecha em menos de 1 h”." },
          { n: 2, titulo: "Parece só um agradecimento", texto: "A última mensagem parece só um “ok, obrigada” — provavelmente não precisa de resposta. Leia antes de decidir." },
          { n: 3, titulo: "Resolver", texto: "Marca a conversa como resolvida com um clique." },
        ],
      },
      {
        print: { chave: "conversa-reaberta", legenda: "Conversa resolvida que o cliente reabriu, com o pedido deduzido." },
        itens: [
          { n: 1, titulo: "Reaberta", texto: "Alguém tinha marcado a conversa como resolvida (ou aguardando) e o cliente escreveu depois. Ela voltou para a fila sozinha — a faixa diz o porquê e a hora." },
          { n: 2, titulo: "Vínculo provável", texto: "O número do pedido foi deduzido do último aviso enviado a este telefone, não da resposta do cliente. Confira o pedido (clique para abrir) antes de tratar como certo." },
        ],
      },
      {
        print: { chave: "conversa-fechada", legenda: "Conversa resolvida, com a janela de 24 h fechada." },
        itens: [
          { n: 1, titulo: "Janela fechada", texto: "Passaram-se mais de 24 h desde a última mensagem do cliente." },
          { n: 2, titulo: "Reabrir", texto: "Devolve a conversa resolvida para a fila." },
          { n: 3, titulo: "Não dá para responder", texto: "Com a janela fechada o campo de resposta some: o WhatsApp só aceita mensagem modelo aprovada, e os avisos automáticos não servem para responder dúvida. A janela reabre quando o cliente escrever; até lá, use outro canal. O recado interno continua funcionando." },
        ],
      },
      {
        titulo: "O painel do contato",
        texto: "A coluna da direita. Em telas menores ela não aparece; o nome, o número e o pedido ficam no topo da conversa.",
        print: { chave: "conversa-painel", legenda: "O painel do Rodrigo, que está em atendimento com você." },
        itens: [
          { n: 1, titulo: "Cliente", texto: "O nome do pedido. Quando o nome do WhatsApp é outro, aparece embaixo (“no WhatsApp: …”)." },
          { n: 2, titulo: "Copiar número", texto: "Copia o telefone sem máscara, pronto para colar na busca do Bling ou da loja. Também dá para selecionar com o mouse." },
          { n: 3, titulo: "Situação", texto: "A situação atual do atendimento. “Sem pendência” quando não há nada a fazer." },
          { n: 4, titulo: "Aguardando", texto: "Marca que você está esperando o cliente (um comprovante, uma foto) ou outro setor. Clicando de novo vira “Retomar”." },
          { n: 5, titulo: "Resolver", texto: "Encerra a conversa até o cliente voltar a escrever. Na conversa resolvida o botão vira “Reabrir”." },
          { n: 6, titulo: "Responsável", texto: "“Você é o responsável” quando a conversa é sua. Se não for, o botão “Assumir” (ou “Assumir de Ana”, quando já há dono) pega a conversa para você e a marca como em atendimento." },
          { n: 7, titulo: "Passar para outra pessoa", texto: "Abre a lista do time para passar a conversa a alguém, ou “Sem responsável” para tirar o dono." },
          { n: 8, titulo: "Parar de enviar ofertas", texto: "Para quando o cliente pede para não receber mais ofertas. Pede confirmação antes — veja abaixo." },
          { n: 9, titulo: "Etiquetas", texto: "As etiquetas da conversa. Clique numa para tirá-la." },
          { n: 10, titulo: "+ etiqueta", texto: "Abre a lista de etiquetas para marcar, e um campo para criar uma nova." },
          { n: 11, titulo: "Pedido", texto: "O pedido de que a conversa trata: número, etapa, valor, data e os itens comprados. Clique para abrir o card completo da Esteira do On-line sem sair da conversa." },
          { n: 12, titulo: "Links de checkout", texto: "Os links de compra dos kits, do preço cheio ao maior desconto. O ícone de copiar põe o link na área de transferência para colar na resposta; a seta abre o checkout numa nova aba. Nada é enviado sozinho." },
        ],
      },
      {
        titulo: "Parar de enviar ofertas",
        print: { chave: "nao-contatar", legenda: "A confirmação antes de parar as ofertas." },
        itens: [
          { n: 1, titulo: "O que muda", texto: "O cliente deixa de receber a oferta de recompra e o lembrete de carrinho, em todos os números. Os avisos do pedido (nota, envio, entrega) continuam." },
          { n: 2, titulo: "Parar ofertas", texto: "Confirma. Depois, o painel mostra “Não recebe ofertas desde …” com “Voltar a enviar” ao lado. “Cancelar” desiste." },
        ],
      },
    ],
  },
];
