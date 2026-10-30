import type { Secao } from "../tipos";

// ─────────────────────────────────────────────────────────────────────────────
// Esteira do On-line e Mensagens ao cliente.
//
// ⚠️ As duas telas são CÓPIAS das do Admin (e a Esteira também do Atendimento):
// o texto foi escrito para servir aos três apps. Mudou a tela lá, refaça o
// print aqui e confira os números.
// ⚠️ O `n` de cada item é o número do marcador no print (`chave`) — medido pelo
// harness em docs-prints/shots_esteira.mjs.
// ─────────────────────────────────────────────────────────────────────────────

export const SECOES_ESTEIRA: Secao[] = [
  // ── Esteira do On-line ──────────────────────────────────────────────────────
  {
    id: "esteira",
    titulo: "Esteira do On-line",
    rota: "/ecommerce/esteira",
    resumo:
      "O caminho de cada venda on-line, da compra até a entrega — e, no mesmo lugar, a régua de recompra e a recuperação de carrinho. A tela é um espelho: as etapas vêm do Bling, da nota fiscal, da etiqueta e das plataformas. Nenhum card se arrasta à mão.",
    regras: {
      colaborador: [
        "Todo mundo vê a mesma esteira: todos os pedidos on-line, de todos os canais.",
        "Só venda on-line aparece aqui (Nuvemshop, PayT, Mercado Livre, Amazon, Shopee…). Venda de balcão ou venda direta da equipe não entra — e também não recebe aviso por WhatsApp.",
        "Nada se move à mão: o card anda sozinho quando o fato acontece (nota emitida, etiqueta gerada, postagem, entrega).",
        "A tela se atualiza sozinha a cada poucos segundos — não precisa apertar F5.",
      ],
      gestor: [
        "A tela é a mesma para o gestor: não há botão nem dado a mais.",
      ],
    },
    blocos: [
      {
        titulo: "Da venda à entrega",
        print: { chave: "esteira", legenda: "O quadro “Da venda à entrega”, com os filtros e os números do topo." },
        itens: [
          { n: 1, titulo: "Qual quadro", texto: "Troca entre os três quadros da tela: Da venda à entrega (o padrão), Régua de recompra e Recuperação de carrinho. O quadro escolhido fica no endereço da página, então dá para mandar o link para alguém." },
          { n: 2, titulo: "Mensagens ao cliente", texto: "Abre a tela onde estão os textos do WhatsApp que o cliente recebe a cada etapa. Veja a seção “Mensagens ao cliente”." },
          { n: 3, titulo: "Números do topo", texto: "Pedidos em andamento, quanto eles somam em reais, quantos já foram entregues, quantos precisam de atenção e quantos estão sem telefone (esses não recebem aviso nenhum). Contam só o que os filtros deixam à vista." },
          { n: 4, titulo: "Buscar", texto: "Procura por nome do cliente, número CZ (o que o cliente vê), código de rastreio, número da nota, número do pedido na loja ou cidade." },
          { n: 5, titulo: "Canal", texto: "Mostra só um canal de venda: Nuvemshop, PayT, Mercado Livre, Amazon…" },
          { n: 6, titulo: "Período", texto: "Quais pedidos entram no quadro pela data da compra: 7 ou 30 dias, 3, 6 ou 12 meses, ou “Escolher datas…” para um intervalo livre." },
          { n: 7, titulo: "Aviso", texto: "Filtra pelo WhatsApp da etapa atual: Sem aviso enviado (inclui os que estão na fila e os sem telefone), Aviso com erro (a mensagem não chegou) e Aviso enviado (enviado, entregue ou lido)." },
          { n: 8, titulo: "Só os que precisam de atenção", texto: "Deixa no quadro apenas os problemas: entrega atrasada, pedido que não anda sozinho, etiqueta vencida, cancelada ou perto de vencer, e pedido parado há mais de uma semana na mesma etapa. O número ao lado é quantos são." },
          { n: 9, titulo: "Pago", texto: "Compras já pagas na loja que ainda não chegaram ao Bling. Aparece só quando há alguém dentro. O tempo fica laranja depois de 2 horas e vermelho depois de 6 — é hora de cobrar o faturamento. Vazia quer dizer que tudo o que foi pago já chegou ao Bling." },
          { n: 10, titulo: "Confirmado", texto: "Pedido atendido no Bling, ainda sem nota fiscal." },
          { n: 11, titulo: "Sem etiqueta", texto: "A nota já saiu e ainda não existe etiqueta de envio. É trabalho de expedição." },
          { n: 12, titulo: "Etiqueta", texto: "Etiqueta gerada, esperando a postagem." },
          { n: 13, titulo: "Em trânsito", texto: "Postado e a caminho do cliente." },
          { n: 14, titulo: "Entregue", texto: "Entrega confirmada. Aqui o mais recente fica no topo; nas outras colunas o topo é quem está esperando há mais tempo." },
          { n: 15, titulo: "Travados antes do período", texto: "Pedidos mais antigos que o período escolhido e que ainda não chegaram a Entregue. Ficariam escondidos pelo filtro de data, e são justamente os que esperam há mais tempo. Clique para abrir." },
          { n: 16, titulo: "Cancelados", texto: "Pedidos cancelados no período (no Bling, na nota ou na própria loja). Ficam fora das colunas, mas não somem." },
        ],
      },
      {
        titulo: "Lendo um card",
        texto:
          "O card mostra primeiro quem é o cliente e quanto vale o pedido; depois onde o pedido está e quando chega. Cor só aparece quando há algo fora do normal: vermelho é problema, laranja pede atenção.",
        print: { chave: "esteira-cards", legenda: "Cards das colunas Sem etiqueta, Etiqueta e Em trânsito." },
        itens: [
          { n: 1, titulo: "Cliente", texto: "Clique em qualquer parte do card para abri-lo (veja “O card aberto”)." },
          { n: 2, titulo: "Valor do pedido", texto: "O total da compra." },
          { n: 3, titulo: "Canal e cidade", texto: "Por onde a venda entrou e para onde vai." },
          { n: 4, titulo: "Idade do pedido", texto: "Há quanto tempo foi comprado. Fica laranja quando o pedido passou de uma semana numa etapa que ainda não é transporte." },
          { n: 5, titulo: "Parado há N dias", texto: "O pedido passou do prazo daquela etapa (por exemplo, nota emitida e nenhuma etiqueta). Passe o mouse para ler o motivo." },
          { n: 6, titulo: "Aviso: falhou", texto: "A mensagem desta etapa saiu e não chegou ao cliente — quase sempre porque o número não tem WhatsApp. Abra o card para ver o motivo." },
          { n: 7, titulo: "Etiqueta em preparação", texto: "O envio já está montado no Melhor Envio, só falta pagar a etiqueta. Não é abandono." },
          { n: 8, titulo: "Aviso: avisado", texto: "O cliente recebeu a mensagem desta etapa (enviada, entregue ou lida). Outros sinais possíveis: “na fila” (vai sair em instantes), “sem aviso” (devia ter saído e não há registro) e “sem telefone”." },
          { n: 9, titulo: "Previsão", texto: "Quando a transportadora diz que chega. Fica vermelho com “atrasado” quando a data passou; vira “entregue” com a data quando chega." },
          { n: 10, titulo: "Via Melhor Envio", texto: "O rastreio veio do Melhor Envio (etiqueta comprada direto no painel dele), não do Bling. Quando vem do Bling, nada aparece." },
          { n: 11, titulo: "Atrasado", texto: "Card com borda vermelha: a entrega passou da previsão da transportadora. É o primeiro da coluna." },
          { n: 12, titulo: "Sem telefone", texto: "O pedido não tem telefone, então o cliente não recebe aviso nenhum. No Mercado Livre isso é normal: a plataforma não entrega o telefone do comprador." },
          { n: 13, titulo: "Nota e data", texto: "Número da nota fiscal e data do pedido. Sem nota, aparece “sem NF” em laranja." },
          { n: 14, titulo: "Copiar rastreio", texto: "Copia o código de rastreio sem precisar abrir o card." },
        ],
      },
      {
        titulo: "Outros sinais do quadro",
        print: { chave: "esteira-cards2", legenda: "A coluna Pago e cards de Confirmado, Sem etiqueta e Etiqueta." },
        itens: [
          { n: 1, titulo: "Tempo no Pago", texto: "Há quanto tempo a compra foi paga e ainda não chegou ao Bling. Cinza até 2 h, laranja até 6 h, vermelho depois." },
          { n: 2, titulo: "Sem telefone na plataforma", texto: "A loja não mandou o telefone (Mercado Livre e Amazon não mandam). Esse cliente não vai receber os avisos." },
          { n: 3, titulo: "Etiqueta vence em N dias", texto: "Etiqueta do Melhor Envio perto do vencimento — se vencer sem postar, o frete pago se perde. Também pode aparecer “etiqueta vencida” ou “etiqueta cancelada”, em vermelho." },
          { n: 4, titulo: "Na fila", texto: "O aviso desta etapa está esperando para sair. Às vezes espera um dado (por exemplo, o código de rastreio da transportadora, que só nasce na coleta)." },
          { n: 5, titulo: "Triângulo laranja", texto: "O pedido não avança sozinho para Em trânsito e Entregue: a loja ainda não foi ligada a ele. Não é atraso da transportadora — esse avanço precisa de alguém." },
          { n: 6, titulo: "Sem NF", texto: "Pedido confirmado que ainda não tem nota fiscal." },
        ],
      },
      {
        titulo: "O card aberto",
        texto:
          "O pedido aberto fica no endereço da página (…/esteira?pedido=número). Se você colar um link de pedido que está fora do período escolhido, a tela avisa em laranja: amplie as datas no filtro para encontrá-lo.",
        print: { chave: "esteira-detalhe", legenda: "Um pedido em trânsito, aberto." },
        itens: [
          { n: 1, titulo: "Cliente, canal e etapa", texto: "Quem comprou, por onde e em que coluna o pedido está. “Atrasado” aparece aqui também." },
          { n: 2, titulo: "Valor e data", texto: "Total do pedido e data da compra." },
          { n: 3, titulo: "Copiar mensagem ao cliente", texto: "Copia um texto pronto com transportadora, código, link e previsão, para mandar ao cliente pelo canal que você usar." },
          { n: 4, titulo: "Rastrear", texto: "Abre a página de rastreio da transportadora." },
          { n: 5, titulo: "DANFE", texto: "Abre o PDF da nota fiscal." },
          { n: 6, titulo: "Copiar link", texto: "Copia o endereço deste pedido aberto, para mandar a um colega." },
          { n: 7, titulo: "Trajeto", texto: "Transportadora, serviço, previsão (ou data de entrega), volumes e peso, o código (clique para copiar) e os eventos do mais recente para o mais antigo. Quando a loja já confirmou a entrega e a transportadora ainda não, aparece um aviso verde: vale a loja." },
          { n: 8, titulo: "Avisos ao cliente", texto: "O que o cliente já recebeu por WhatsApp, etapa por etapa: lido, entregue, enviado, na fila, falhou (com o motivo), “ainda não” (a etapa ainda não aconteceu) ou “aviso desligado”. Leia antes de falar com o cliente." },
          { n: 9, titulo: "Pedido", texto: "Os números do pedido: o do cliente (CZ…, clique para copiar), o do Bling e o da loja." },
          { n: 10, titulo: "Nota fiscal", texto: "Número, situação, data de emissão e chave (clique para copiar)." },
          { n: 11, titulo: "Cliente", texto: "CPF/CNPJ e telefone (clique para copiar)." },
          { n: 12, titulo: "Entrega", texto: "Endereço, cidade e CEP de entrega." },
          { n: 13, titulo: "Itens", texto: "O que foi comprado, com quantidade e valor." },
        ],
      },
      {
        titulo: "Telefone com problema",
        texto: "Quando o número do cliente parece errado, ou quando o WhatsApp recusou a entrega, uma faixa aparece no topo do card aberto. O pedido continua andando normalmente — só os avisos podem não chegar.",
        print: { chave: "esteira-telefone", legenda: "Faixa de telefone e a lista de avisos de um pedido cujo aviso falhou." },
        itens: [
          { n: 1, titulo: "A faixa", texto: "Vermelha quando o WhatsApp confirmou que o número não recebe mensagens. Laranja quando é só suspeita pelo formato: celular sem o 9 depois do DDD (a tela sugere o número certo), telefone fixo ou número repetido. Se uma mensagem já foi entregue, a suspeita some. O caminho é pedir outro contato ao cliente." },
          { n: 2, titulo: "Motivo da falha", texto: "O código e a explicação de por que a mensagem não chegou." },
          { n: 3, titulo: "Ainda não", texto: "Etapas que o pedido ainda não alcançou — não é falha." },
        ],
      },
      {
        titulo: "Fonte parada",
        texto: "Se o Bling ou outra fonte de dados para de atualizar, uma faixa vermelha aparece acima do quadro. Ela importa: com a fonte parada, o quadro mostra uma situação velha e as mensagens ao cliente não saem. Avise o TI.",
        print: { chave: "esteira-alarme", legenda: "O aviso de fonte parada." },
        itens: [
          { n: 1, titulo: "O aviso", texto: "Quantas fontes pararam de atualizar." },
          { n: 2, titulo: "Qual fonte", texto: "O nome da fonte, há quanto tempo está parada e o limite aceito para ela." },
        ],
      },
      {
        titulo: "Régua de recompra",
        texto:
          "Para quem já recebeu: o cliente descansa alguns dias, recebe uma oferta para repor pelo WhatsApp e volta a comprar — ou não. A coluna é calculada pelo sistema a partir da data de entrega e de compra nova do mesmo CPF.",
        print: { chave: "esteira-recompra", legenda: "O quadro da régua de recompra." },
        itens: [
          { n: 1, titulo: "Qual quadro", texto: "“Régua de recompra” escolhido. A busca e os filtros de cima são só do quadro de entrega." },
          { n: 2, titulo: "A régua em vigor", texto: "Quantos dias depois da entrega a oferta sai, e quantos dias depois da oferta o cliente passa para Sem retorno." },
          { n: 3, titulo: "Entregue", texto: "Recebeu e está no período de descanso." },
          { n: 4, titulo: "Hora de ofertar", texto: "Já passou o descanso e a oferta ainda não saiu." },
          { n: 5, titulo: "Ofertado", texto: "A oferta foi enviada; esperando o cliente." },
          { n: 6, titulo: "Recomprou", texto: "Voltou a comprar depois da entrega. É observação: o sistema vê que voltou, não que voltou por causa da oferta." },
          { n: 7, titulo: "Sem retorno", texto: "Foi ofertado e não voltou no prazo." },
          { n: 8, titulo: "Sem telefone (recolhida)", texto: "Quem não tem como receber a oferta. A coluna fica fechada para não poluir o quadro, mas o número está sempre à vista. Clique para abrir." },
          { n: 9, titulo: "Erro ao enviar (recolhida)", texto: "A oferta saiu e não chegou." },
          { n: 10, titulo: "Não contatar (recolhida)", texto: "Pediu para não receber ofertas. Não recebe mais nada comercial (os avisos do pedido continuam). Quem marca é o atendimento, na conversa do cliente." },
          { n: 11, titulo: "Entregues antes da régua", texto: "Pedidos entregues antes de a régua existir, com data estimada. Ficam fora do envio automático: ofertar a essa base é uma campanha à parte, decidida por alguém." },
        ],
      },
      {
        titulo: "Colunas recolhidas, abertas",
        print: { chave: "esteira-recolhidas", legenda: "Sem telefone e Erro ao enviar abertas; Não contatar fechada." },
        itens: [
          { n: 1, titulo: "Recolher", texto: "Fecha a coluna de novo." },
          { n: 2, titulo: "Card sem telefone", texto: "O cliente não tem telefone cadastrado — dá para tentar por e-mail ou ligação." },
          { n: 3, titulo: "Motivo do erro", texto: "Por que a mensagem não chegou." },
          { n: 4, titulo: "Coluna fechada", texto: "Mostra a quantidade. Clique para abrir." },
        ],
      },
      {
        titulo: "Recuperação de carrinho",
        texto:
          "Para quem encheu o carrinho e não terminou a compra. Só existe para a loja própria (Nuvemshop e PayT): Mercado Livre e Amazon fazem a recuperação delas e não entregam o contato de quem abandonou. São até três mensagens, cada uma contada a partir da anterior — nunca três de uma vez.",
        print: { chave: "esteira-carrinho", legenda: "O quadro da recuperação de carrinho." },
        itens: [
          { n: 1, titulo: "Números do topo", texto: "Neste quadro os números mudam: carrinhos em perseguição (ainda podem virar venda), quanto eles somam, quantos foram recuperados e quantos estão sem telefone." },
          { n: 2, titulo: "A régua em vigor", texto: "Quando sai cada mensagem: a 1ª minutos após o abandono, a 2ª num horário do dia seguinte à 1ª, a 3ª alguns dias depois da 2ª." },
          { n: 3, titulo: "Abandonado", texto: "Ainda dentro da espera da 1ª mensagem." },
          { n: 4, titulo: "1ª mensagem", texto: "O primeiro lembrete saiu." },
          { n: 5, titulo: "2ª mensagem", texto: "A segunda tentativa saiu." },
          { n: 6, titulo: "3ª mensagem", texto: "A última. Depois dela o sistema não insiste." },
          { n: 7, titulo: "Respondeu", texto: "O cliente respondeu a uma das mensagens: a sequência para e uma pessoa assume a conversa." },
          { n: 8, titulo: "Recuperado", texto: "Houve compra da mesma pessoa depois do abandono. É observação, não prova de que veio da mensagem." },
          { n: 9, titulo: "Perdido", texto: "Não voltou, ou é carrinho que ficou fora da régua (anterior a ela, ou uma tentativa repetida da mesma pessoa). Nenhum deles recebe mensagem." },
          { n: 10, titulo: "Recolhidas", texto: "Sem telefone (só e-mail), Erro ao enviar e Não contatar — fechadas, com o número à vista. Clique para abrir." },
        ],
      },
      {
        titulo: "O card do carrinho",
        print: { chave: "esteira-carrinho-card", legenda: "Cards de carrinho abandonado." },
        itens: [
          { n: 1, titulo: "O que estava no carrinho", texto: "Os produtos escolhidos." },
          { n: 2, titulo: "Loja e tempo", texto: "Em qual loja (Nuvemshop ou PayT) e há quanto tempo o carrinho foi abandonado." },
          { n: 3, titulo: "Próxima mensagem", texto: "Quanto falta para a próxima mensagem sair. “Na fila” quer dizer que já venceu e sai na próxima rodada." },
          { n: 4, titulo: "Telefone e e-mail", texto: "O contato do cliente. Sem telefone, aparece “sem telefone” em vermelho." },
          { n: 5, titulo: "Abrir o carrinho", texto: "Abre o carrinho salvo na loja — o mesmo link que vai na mensagem." },
          { n: 6, titulo: "Carrinho da PayT", texto: "Carrinho do checkout da PayT, no mesmo quadro." },
          { n: 7, titulo: "Respondeu", texto: "Há quanto tempo o cliente respondeu." },
          { n: 8, titulo: "Abrir conversa", texto: "Abre a conversa com o cliente no Carbo Atendimento, para alguém responder." },
        ],
      },
    ],
  },

  // ── Mensagens ao cliente ────────────────────────────────────────────────────
  {
    id: "mensagens",
    titulo: "Mensagens ao cliente",
    rota: "/ecommerce/mensagens",
    resumo:
      "Os textos de WhatsApp que o cliente recebe a cada avanço da esteira, na régua de recompra e na recuperação de carrinho. Aqui se liga e desliga cada mensagem e se confere como ela chega. A tela não dispara nada: quem envia é o sistema, quando o pedido muda de etapa.",
    regras: {
      colaborador: [
        "Todo mundo vê os mesmos textos e o mesmo histórico de envios.",
        "As mensagens saem pela API oficial do WhatsApp (Meta). O texto é o que a Meta aprovou: editar aqui não muda o que o cliente recebe — mudar a redação exige um modelo novo e nova aprovação.",
        "Toda mensagem nasce desligada. Ligar é uma decisão: confira a pré-visualização e ligue uma de cada vez. Pedidos que já existiam não recebem nada; só quem avançar de etapa a partir daí.",
        "Ligar não basta se a Meta ainda não aprovou o modelo: enquanto o status não for APPROVED, nada sai.",
      ],
      gestor: [
        "A tela é a mesma para o gestor.",
      ],
    },
    blocos: [
      {
        titulo: "A tela",
        print: { chave: "mensagens", legenda: "Mensagens ao cliente, grupo “Da venda à entrega”." },
        itens: [
          { n: 1, titulo: "Voltar à Esteira", texto: "Volta para a Esteira do On-line." },
          { n: 2, titulo: "Ligadas", texto: "Quantas mensagens estão ligadas." },
          { n: 3, titulo: "Na fila agora", texto: "Quantos avisos estão esperando para sair. É um número de referência, atualizado de 5 em 5 minutos." },
          { n: 4, titulo: "Grupos", texto: "Três conversas diferentes, cada uma com o seu número de WhatsApp: Da venda à entrega (avisos de serviço do pedido), Recompra (oferta dias depois da entrega) e Carrinho abandonado (para quem ainda não comprou). O número no botão é quantas estão ligadas." },
          { n: 5, titulo: "Sai pelo número", texto: "De qual número de WhatsApp o grupo envia." },
          { n: 6, titulo: "Uma mensagem", texto: "Cada etapa tem o seu cartão. Veja abaixo." },
        ],
      },
      {
        titulo: "O cartão de uma mensagem",
        print: { chave: "mensagens-editor", legenda: "A mensagem da etapa Em trânsito." },
        itens: [
          { n: 1, titulo: "Etapa e situação", texto: "O nome da etapa (o mesmo da coluna da esteira) e se está ligada ou desligada." },
          { n: 2, titulo: "Enviar", texto: "Liga ou desliga a mensagem. Só vale depois de Salvar." },
          { n: 3, titulo: "Texto aprovado pela Meta", texto: "O nome do modelo aprovado no WhatsApp e o status dele na Meta. Enquanto não for APPROVED, nada é enviado." },
          { n: 4, titulo: "O texto", texto: "Só para conferência — não dá para editar, porque o que sai é o texto aprovado pela Meta." },
          { n: 5, titulo: "Variáveis", texto: "Os dados que entram na mensagem. Com asterisco laranja é obrigatória: sem o dado, a mensagem espera até ele existir, em vez de sair incompleta. As outras têm um texto de reserva (por exemplo, “tudo bem” no lugar do nome)." },
          { n: 6, titulo: "Como chega no WhatsApp", texto: "A pré-visualização com dados de exemplo. Se faltar algum dado obrigatório, aparece embaixo, em laranja, o que está segurando o envio." },
          { n: 7, titulo: "Salvar", texto: "Grava a mudança (ligar, desligar e, na mensagem de Entregue, quantos minutos esperar depois da entrega). “Alterações não salvas” aparece enquanto houver algo para gravar." },
          { titulo: "Quando sai", texto: "“Saiu para entrega” não é coluna da esteira: vem do rastreio da transportadora. As de carrinho vão para quem ainda não comprou." },
        ],
      },
      {
        titulo: "Últimos envios",
        print: { chave: "mensagens-envios", legenda: "O histórico do que saiu." },
        itens: [
          { n: 1, titulo: "Um envio", texto: "Cada linha é uma mensagem: a etapa, o telefone, o motivo quando não saiu (ou o começo do texto) e a hora. O símbolo verde é enviado; o relógio laranja, na fila." },
        ],
      },
      {
        titulo: "WhatsApp que envia os avisos",
        texto:
          "Se alguma mensagem voltar a sair pela Evolution (o WhatsApp comum, ligado por QR Code), aparece no topo um cartão com o estado da conexão e os botões Conectar número (mostra o QR Code, que se renova sozinho), Desconectar e Reiniciar instância. Hoje todas as mensagens saem pela API oficial, e por isso o cartão não aparece.",
      },
    ],
  },
];
