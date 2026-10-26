import type { Secao } from "../tipos";

// ─────────────────────────────────────────────────────────────────────────────
// Documentação do Carbo TI — seção "Auditoria" do menu: Central de Auditoria,
// Acompanhamento Comercial, Último acesso e Adoção do Carbo Chat.
//
// ⚠️ O `n` de cada item é o MESMO marcador do print (`chave`), medido pelo
// harness (docs-prints/shots_auditoria.mjs). Mudou a tela: refaça o print.
// ⚠️ As três primeiras telas só respondem a GESTOR no banco: quem não é vê a
// tela com uma mensagem de erro, não uma tela vazia. A quarta (Chat) responde
// a quem tem o Carbo TI ou o Carbo Admin liberado.
// ─────────────────────────────────────────────────────────────────────────────

export const SECOES_AUDITORIA: Secao[] = [
  // ── Central de Auditoria ────────────────────────────────────────────────────
  {
    id: "auditoria",
    titulo: "Central de Auditoria",
    rota: "/auditoria",
    resumo:
      "Tudo o que aconteceu no sistema, numa lista só e do mais recente para o mais antigo: venda que mudou de status, card excluído ou transferido, saída de estoque, etapa de produção, compra aprovada, sincronização do Bling, acesso liberado e mais. Serve para responder “quem fez isso, e quando?”.",
    regras: {
      colaborador: [
        "Não abre: a tela mostra “Acesso restrito: somente gestores”.",
      ],
      gestor: [
        "Vê os eventos de todas as áreas e de todas as pessoas.",
        "É só leitura: nada se desfaz por aqui. Para corrigir algo, vá à tela de onde o evento veio.",
      ],
    },
    blocos: [
      {
        print: { chave: "auditoria", legenda: "A Central de Auditoria com os eventos do dia.", papel: "gestor" },
        itens: [
          { n: 1, titulo: "Central de Auditoria", texto: "O feed de tudo o que aconteceu, do mais novo para o mais antigo." },
          { n: 2, titulo: "Atualizar", texto: "Busca de novo os eventos mais recentes. A tela não se atualiza sozinha." },
          { n: 3, titulo: "Buscar", texto: "Procura pela descrição, pelo item (número do pedido, nome do produto, do card) ou pelo nome de quem fez." },
          { n: 4, titulo: "Todas", texto: "Mostra todas as categorias. É o padrão ao abrir." },
          { n: 5, titulo: "Categorias", texto: "Clique numa categoria (CRM, Vendas, Estoque, Produção, PDV, Compras, Bling, Financeiro, Governança, Sistema) para ver só ela. Dá para marcar mais de uma; clicar de novo desmarca." },
          { n: 6, titulo: "Um evento", texto: "A categoria colorida, o que aconteceu, o resumo e, embaixo, quem fez e quando. Clique para ver os detalhes." },
          { n: 7, titulo: "Quantos eventos", texto: "Quantos eventos estão na tela. A lista vem de 100 em 100: quando houver mais, aparece o botão “Carregar mais” logo acima." },
        ],
      },
      {
        titulo: "Detalhes de um evento",
        print: { chave: "auditoria-detalhe", legenda: "Um evento aberto, com os detalhes.", papel: "gestor" },
        itens: [
          { n: 1, titulo: "Categoria", texto: "De que parte do sistema o evento veio. A cor é a mesma do filtro." },
          { n: 2, titulo: "Resumo", texto: "O que mudou, em uma linha." },
          { n: 3, titulo: "Quem e quando", texto: "Quem fez e o dia e a hora. Quando aparece “—”, foi o próprio sistema (uma sincronização ou rotina automática), sem uma pessoa por trás." },
          { n: 4, titulo: "Detalhes", texto: "Os dados completos do evento: o antes e o depois, o pedido, a quantidade, a conta. Clique de novo no evento para fechar." },
        ],
      },
    ],
  },

  // ── Acompanhamento Comercial ────────────────────────────────────────────────
  {
    id: "acompanhamento",
    titulo: "Acompanhamento Comercial",
    rota: "/acompanhamento",
    resumo:
      "Como o time comercial se comportou no período: o que entrou, andou, foi ganho e foi perdido, quanto dinheiro está em jogo, quem tem card parado e quais negócios foram esquecidos. Os números vêm das pipelines do Carbo Sales, ao vivo.",
    regras: {
      colaborador: [
        "Não abre: a tela mostra “Tela restrita à gestão”.",
      ],
      gestor: [
        "Vê o time inteiro ou um vendedor por vez.",
        "Abre qualquer card esquecido e comenta nele sem sair do TI.",
        "Muda o prazo de cada etapa (botão Prazos).",
      ],
    },
    blocos: [
      {
        print: { chave: "acompanhamento", legenda: "O topo do Acompanhamento: o dia, o dinheiro e o movimento diário.", papel: "gestor" },
        itens: [
          { n: 1, titulo: "Período", texto: "Últimos 7, 30 ou 90 dias. Vale para os números “no período”, o gráfico e as perdas." },
          { n: 2, titulo: "Vendedor", texto: "Mostra o time todo ou só uma pessoa." },
          { n: 3, titulo: "Prazos", texto: "Abre a lista de quantos dias cada etapa tolera antes de o card contar como parado (veja abaixo)." },
          { n: 4, titulo: "O dia de hoje", texto: "Cards criados, movimentados, ganhos e perdidos hoje." },
          { n: 5, titulo: "Esquecidos", texto: "Cards que passaram do prazo da etapa e não têm próximo passo nem tarefa marcada. É o número para agir agora; embaixo, quantos estão parados de todos os abertos." },
          { n: 6, titulo: "Em orçamento", texto: "Quanto está na etapa de orçamento esperando preço, e quantos cards." },
          { n: 7, titulo: "Valores", texto: "O que já tem preço montado no Vender, o que foi ganho e o que foi perdido no período. São valores de orçamento de verdade, não estimativa." },
          { n: 8, titulo: "Estimativa", texto: "O valor que quem cadastrou o card estimou. Fica à parte de propósito: é um palpite, e só cobre o que ainda não tem orçamento." },
          { n: 9, titulo: "Movimento diário", texto: "Barras de criados, ganhos e perdidos por dia, e a linha de cards movimentados. Passe o mouse para ver os números de um dia." },
          { titulo: "Aviso amarelo no topo", texto: "Escolhendo um período que vai antes de 06/07/2026, a tela avisa que a movimentação daqueles dias aparece zerada por falta de registro, não por falta de trabalho." },
        ],
      },
      {
        titulo: "Quem, onde e por quê",
        print: { chave: "acompanhamento-listas", legenda: "As tabelas por pessoa e por etapa, os repasses, as perdas e as listas de esquecidos.", papel: "gestor" },
        itens: [
          { n: 1, titulo: "Por pessoa", texto: "Para cada vendedor: cards abertos, parados, esquecidos (em laranja quando há), valor em aberto, valor ganho e há quantos dias está o card mais parado." },
          { n: 2, titulo: "Funil agora", texto: "Cada etapa de cada pipeline: quantos cards, quantos parados, o valor (e quantos já têm orçamento), a média de dias na etapa e o prazo dela. Etapa que acumula é gargalo." },
          { n: 3, titulo: "Repasses ao closer", texto: "Quanto cada SDR passou ao closer e no que deu. “Sem qualif.” conta os repasses sem volume, dor, decisor ou prazo preenchidos: volume alto com essa coluna alta é entrega ruim. No canto, quantos repasses estão na fila sem dono agora." },
          { n: 4, titulo: "Por que perdemos", texto: "Os motivos de perda e descarte do período, por pipeline, com quantidade e valor." },
          { n: 5, titulo: "Esquecidos", texto: "A lista dos cards esquecidos, com pipeline, etapa, dono, valor e dias parado contra o prazo (8d / 3d). Clique para abrir o card." },
          { n: 6, titulo: "Esperas vencidas", texto: "Cards em que o vendedor marcou “aguardando” até uma data, e a data passou. É cobrança, não abandono: ou renova a espera, ou volta a tocar o negócio. Só aparece quando há alguma." },
        ],
      },
      {
        titulo: "Abrir um card",
        print: { chave: "acompanhamento-card", legenda: "Um card esquecido aberto, no painel lateral.", papel: "gestor" },
        itens: [
          { n: 1, titulo: "Abrir no Sales", texto: "Abre o mesmo card no Carbo Sales, numa nova guia. O X ao lado fecha o painel." },
          { n: 2, titulo: "Dados do negócio", texto: "Valor estimado, origem, contato, telefone, cidade e quando o card foi criado." },
          { n: 3, titulo: "Qualificação", texto: "O que o SDR levantou: volume, decisor, dor e prazo. Só aparece quando há algo preenchido." },
          { n: 4, titulo: "Orçamentos", texto: "Os orçamentos montados para este card, com número, situação e valor." },
          { n: 5, titulo: "Comentar", texto: "Escreva e clique em Comentar (ou Ctrl+Enter). O comentário entra no histórico do card com o seu nome, e o vendedor o vê no Sales." },
          { n: 6, titulo: "Histórico", texto: "Tudo o que aconteceu no card: notas, ligações, tarefas e mudanças de etapa, com quem fez e quando. Atualiza sozinho quando o vendedor mexe." },
        ],
      },
      {
        titulo: "Prazo por etapa",
        print: { chave: "acompanhamento-prazos", legenda: "A janela de prazos, aberta pelo botão Prazos.", papel: "gestor" },
        itens: [
          { n: 1, titulo: "Pipeline", texto: "As etapas aparecem agrupadas por pipeline." },
          { n: 2, titulo: "Dias", texto: "Quantos dias um card pode ficar nesta etapa sem se mover antes de contar como parado. De 1 a 365." },
          { n: 3, titulo: "Salvar", texto: "Fica ativo quando você muda o número. Salva só aquela etapa, e os números da tela são recalculados." },
          { titulo: "Por que um prazo por etapa", texto: "Nutrição tolera semanas; negociação, poucos dias. Um prazo só para tudo faria a lista de parados encher de cards que estão no ritmo certo." },
        ],
      },
    ],
  },

  // ── Último acesso ───────────────────────────────────────────────────────────
  {
    id: "ultimo-acesso",
    titulo: "Último acesso",
    rota: "/ultimo-acesso",
    resumo:
      "Quem está usando o ecossistema e quem não está: para cada pessoa, quando entrou pela última vez e por qual sistema. Separa o time interno, os licenciados e as lojas.",
    regras: {
      colaborador: [
        "Não abre: a tela mostra “Erro ao carregar dados de acesso. Verifique as permissões.”",
      ],
      gestor: [
        "Vê todas as pessoas dos três grupos.",
        "É só leitura. Para liberar ou bloquear acesso, use a tela Usuários.",
      ],
    },
    blocos: [
      {
        print: { chave: "ultimo-acesso", legenda: "Último acesso, na aba do time interno.", papel: "gestor" },
        itens: [
          { n: 1, titulo: "Totais", texto: "Quantas pessoas há em cada grupo: internos, licenciados e lojas." },
          { n: 2, titulo: "Abas", texto: "Troca entre Internos, Licenciados e Lojas." },
          { n: 3, titulo: "Buscar", texto: "Procura pelo nome." },
          { n: 4, titulo: "Departamento", texto: "Mostra só um departamento." },
          { n: 5, titulo: "Sistema", texto: "Mostra só quem entrou por último num sistema (Sales, Ops, TI…)." },
          { n: 6, titulo: "Status", texto: "Filtra por quando foi o último acesso: hoje, últimos 7 dias, mais de 7, mais de 30, ou nunca." },
          { n: 7, titulo: "Último sistema", texto: "Por qual sistema a pessoa entrou da última vez. O horário ao lado é o desse acesso." },
          { n: 8, titulo: "Status", texto: "🟢 entrou hoje · 🟡 nos últimos 7 dias · 🔴 há mais de 7 · ⚫ há mais de 30 dias ou nunca acessou." },
          { n: 9, titulo: "Quantos", texto: "Quantas pessoas a lista mostra com os filtros de agora." },
          { titulo: "Atualização", texto: "A tela se atualiza sozinha a cada minuto." },
        ],
      },
      {
        titulo: "Licenciados",
        print: { chave: "ultimo-acesso-licenciados", legenda: "A aba Licenciados.", papel: "gestor" },
        itens: [
          { n: 1, titulo: "Região", texto: "Mostra só os licenciados de uma região." },
          { n: 2, titulo: "Pedidos (30d)", texto: "Quantos pedidos o licenciado fez nos últimos 30 dias." },
          { n: 3, titulo: "Status", texto: "Ativo: entrou nos últimos 30 dias e fez pedido. Passivo: entrou, mas não pediu nada. Inativo: não entra há mais de 30 dias, ou nunca entrou." },
        ],
      },
      {
        titulo: "Lojas",
        print: { chave: "ultimo-acesso-lojas", legenda: "A aba Lojas.", papel: "gestor" },
        itens: [
          { n: 1, titulo: "Rede", texto: "Mostra só as lojas de uma rede." },
          { n: 2, titulo: "Última reposição", texto: "Quando a loja recebeu reposição de estoque pela última vez." },
          { n: 3, titulo: "Status", texto: "A mesma régua do time interno: hoje, 7 dias, mais de 7, mais de 30 ou nunca." },
        ],
      },
    ],
  },

  // ── Adoção do Carbo Chat ────────────────────────────────────────────────────
  {
    id: "chat-adocao",
    titulo: "Adoção do Carbo Chat",
    rota: "/chat/adocao",
    resumo:
      "Mede a mudança do WhatsApp para o Carbo Chat: quantas pessoas estão usando, quantas mensagens por setor, e quem ainda não instalou ou não ativou os avisos. Mostra só números — nenhuma mensagem é lida por esta tela.",
    regras: {
      colaborador: [
        "Abre para quem tem o Carbo TI (ou o Carbo Admin) liberado, e mostra os números de toda a empresa.",
      ],
      gestor: [
        "Vê o mesmo que o colaborador — esta tela não muda para o gestor.",
      ],
    },
    blocos: [
      {
        print: { chave: "chat-adocao", legenda: "Os números de uso e os gráficos.", papel: "gestor" },
        itens: [
          { n: 1, titulo: "Ativos", texto: "Quantas pessoas mandaram mensagem hoje, nos últimos 7 e nos últimos 30 dias. No de 30 dias, a fatia dos internos: verde a partir de 60%, laranja abaixo." },
          { n: 2, titulo: "Mensagens", texto: "Quantas mensagens foram trocadas em 30 dias. Ao lado, os grupos e as conversas diretas que tiveram movimento." },
          { n: 3, titulo: "Com push", texto: "Quantas pessoas ativaram os avisos no aparelho. Verde a partir de 70% dos internos." },
          { n: 4, titulo: "Sem push", texto: "Quem ainda não ativou os avisos: sem isso a pessoa só vê a mensagem quando abre o sistema. É a lista para correr atrás (está mais abaixo)." },
          { n: 5, titulo: "Tendência", texto: "Pessoas ativas e mensagens por dia, nos últimos 30 dias." },
          { n: 6, titulo: "Mensagens por setor", texto: "Quantas mensagens cada departamento mandou em 30 dias." },
          { n: 7, titulo: "Canais e conversas", texto: "Grupos com movimento sobre o total, conversas diretas com movimento sobre o total, e a média de pessoas por grupo." },
        ],
      },
      {
        titulo: "Pendências de onboarding",
        print: { chave: "chat-adocao-pendencias", legenda: "Quem ainda falta instalar ou ativar os avisos.", papel: "gestor" },
        itens: [
          { n: 1, titulo: "Instalação & push", texto: "A lista das pessoas, com o que falta para cada uma." },
          { n: 2, titulo: "Push", texto: "“ok” quando os avisos estão ativos no aparelho; “sem push” quando não." },
          { n: 3, titulo: "App", texto: "“usou” quando a pessoa já entrou no Carbo Chat; “nunca” quando ainda não." },
          { n: 4, titulo: "Inativos", texto: "Troca para a lista de quem parou de usar (veja abaixo)." },
        ],
      },
      {
        titulo: "Inativos",
        print: { chave: "chat-adocao-inativos", legenda: "A aba Inativos.", papel: "gestor" },
        itens: [
          { n: 1, titulo: "Há mais de", texto: "Escolha 3, 7, 14 ou 30 dias sem atividade." },
          { n: 2, titulo: "Nunca entrou", texto: "A pessoa nunca usou o Carbo Chat." },
          { n: 3, titulo: "Dias parado", texto: "Há quantos dias a pessoa não usa o chat." },
        ],
      },
    ],
  },
];
