import type { Secao } from "../tipos";

// Contas a pagar e a receber, a conta nova lançada no Bling, a baixa,
// Assinaturas, Fluxo de caixa, Painel financeiro, Fornecedores e Formas de
// pagamento. Os números dos itens são os marcadores de docs-prints/shots_contas.mjs.

const SO_LEITURA = "Vê a tela inteira; criar, editar e excluir ficam com o gestor.";

export const SECOES_CONTAS: Secao[] = [
  // ── Contas a pagar ──────────────────────────────────────────────────────────
  {
    id: "pagar",
    titulo: "Contas a pagar",
    rota: "/pagar",
    resumo:
      "As contas a pagar da matriz (Bling 1) e da filial SP (Bling 2), em telas separadas. A tela abre na fila de trabalho: o que já venceu, o que vence hoje e o que vence nos próximos 7 dias. Daqui se lança conta nova no Bling e se dá baixa.",
    regras: {
      colaborador: [
        "Vê as contas das duas empresas, lança conta nova no Bling, dá baixa, estorna e cancela.",
        "As ações que desfazem algo (cancelar, estornar, excluir no Bling) pedem confirmação.",
      ],
      gestor: ["Tudo o que o colaborador faz. Nesta tela não há ação só de gestor."],
    },
    blocos: [
      {
        titulo: "A tela",
        print: { chave: "pagar-lista", legenda: "Contas a pagar da matriz, na fila de trabalho." },
        itens: [
          { n: 1, titulo: "Nova conta a pagar", texto: "Lança a conta direto no Bling da empresa escolhida. Veja a seção “Conta nova no Bling”. Se o botão não aparecer para uma das empresas, o lançamento pelo sistema ainda não foi ligado para ela — fale com o TI." },
          { n: 2, titulo: "Matriz / Filial SP", texto: "Troca a tela inteira de empresa. A matriz é o Bling 1 e a filial é o Bling 2. As duas nunca se somam: cada uma tem os próprios números." },
          { n: 3, titulo: "De onde vêm os dados", texto: "Diz qual Bling a tela está mostrando e se a baixa feita aqui vai para o Bling na hora." },
          { n: 4, titulo: "Cartões", texto: "Em aberto, Vencido, Vence hoje e Próximos 7 dias, sempre sobre tudo o que está em aberto. Clicar num cartão aplica o filtro que mostra exatamente aqueles títulos." },
          { n: 5, titulo: "Buscar", texto: "Pelo nome do fornecedor ou pelo número do documento." },
          { n: 6, titulo: "Status", texto: "Fila de trabalho (o padrão), Vencidos, Vencem hoje, Próximos 7 dias, A vencer, Em aberto, Pagos, Cancelados ou Todos." },
          { n: 7, titulo: "Origem", texto: "Bling (veio do Bling) ou Sistema (lançada só aqui, sem Bling)." },
          { n: 8, titulo: "Vencimento", texto: "Um mês inteiro ou um intervalo de datas, escolhidos no calendário. Escolher um limpa o outro. Com período escolhido, a fila de trabalho passa para “Todos”, senão um mês futuro viria vazio." },
          { n: 9, titulo: "Ordenar", texto: "Por nome, vencimento, valor ou data de pagamento, crescente ou decrescente." },
          { n: 10, titulo: "Cabeçalho da coluna", texto: "Clicar em Fornecedor, Vencimento, Valor ou Pago em também ordena — é o mesmo “Ordenar” da barra." },
          { n: 11, titulo: "Parcial", texto: "O título teve uma baixa parcial no Bling. O valor grande é o que falta pagar; embaixo, o valor original." },
          { n: 12, titulo: "criada por", texto: "A conta foi lançada no Bling por esta tela, e diz por quem." },
          { n: 13, titulo: "Pagar", texto: "Abre a baixa: banco, data, juros, multa, desconto e o valor pago. Veja a seção “Dar baixa”." },
          { n: 14, titulo: "Menu ⋯", texto: "Cancelar conta (vale só aqui; no Bling o título continua em aberto) ou, na conta que nasceu por esta tela, Excluir no Bling (exclui lá e cancela aqui)." },
          { n: 15, titulo: "Páginas", texto: "Quantos títulos por página e as setas para avançar. O tamanho da página fica guardado no seu navegador." },
        ],
      },
      {
        titulo: "Vencido é sempre a mesma conta",
        texto:
          "Um título está vencido quando está em aberto e o vencimento é anterior a hoje (no horário de Brasília). A lista, os cartões e a etiqueta usam essa mesma regra. Os filtros ficam no endereço da página: dá para atualizar (F5), voltar e mandar o link para alguém — a pessoa abre a mesma lista.",
      },
      {
        titulo: "Os já pagos",
        print: { chave: "pagar-pagos", legenda: "Filtro Pagos." },
        itens: [
          { n: 1, titulo: "Valor de fato e ajustes", texto: "Quando o pagamento foi diferente do título, aparece o valor que saiu e os ajustes (juros, multa, desconto)." },
          { n: 2, titulo: "no Bling ✓", texto: "A baixa feita aqui chegou ao Bling. Se o Bling recusar, aparece “Bling recusou” (passe o mouse para ver o motivo) com “Tentar de novo”." },
          { n: 3, titulo: "Pago em “no Bling”", texto: "O título foi baixado no próprio Bling e ele ainda não informou a data do pagamento." },
          { n: 4, titulo: "Estornar pagamento", texto: "No menu ⋯. Com o envio ao Bling ligado, o estorno é feito primeiro no Bling e só depois aqui; se o Bling recusar, nada muda. Título pago no próprio Bling se desfaz lá — o sistema acompanha em até 15 minutos." },
        ],
      },
      {
        titulo: "A filial SP (Bling 2)",
        print: { chave: "pagar-filial", legenda: "Contas a pagar da filial, filtro Todos." },
        itens: [
          { n: 1, titulo: "Filial SP", texto: "Mostra o Bling 2. Os filtros são Fila de trabalho, Em aberto, Quitados e Todos, com a mesma busca, período e ordenação da matriz." },
          { n: 2, titulo: "Sincronizado", texto: "Quando o Bling 2 foi lido pela última vez. Ele é relido a cada 10 minutos. “baixa só pelo Bling” quer dizer que a baixa pela tela ainda não está ligada para a filial." },
          { n: 3, titulo: "Parcial", texto: "Baixa parcial: o valor mostrado é o que falta." },
          { n: 4, titulo: "Baixado aqui", texto: "Com o ✓ e o primeiro nome de quem deu a baixa pelo sistema. O menu ⋯ tem “Desfazer baixa” — só para baixas feitas pelo sistema; a feita no próprio Bling 2 se desfaz lá." },
          { n: 5, titulo: "Pagar", texto: "Na filial a baixa vai PRIMEIRO ao Bling 2. Se ele recusar, nada muda aqui e a tela diz o motivo." },
        ],
      },
    ],
  },

  // ── Conta nova no Bling ─────────────────────────────────────────────────────
  {
    id: "nova-conta",
    titulo: "Conta nova no Bling (a pagar e a receber)",
    rota: "/pagar",
    resumo:
      "Como lançar uma conta a pagar ou a receber pelo sistema, campo a campo. A conta é criada no Bling da empresa escolhida (matriz ou filial SP) e só depois aparece aqui — com o mesmo número do Bling.",
    regras: {
      colaborador: ["Lança contas a pagar e a receber nas duas empresas e pode excluir no Bling a conta que ela mesma lançou, enquanto estiver em aberto."],
      gestor: ["O mesmo que o colaborador."],
    },
    blocos: [
      {
        titulo: "Passo a passo",
        itens: [
          { titulo: "1. Escolha a empresa", texto: "Em Contas a pagar (ou a receber), deixe selecionada a empresa certa: Matriz (Bling 1) ou Filial SP (Bling 2). A conta nasce no Bling dessa empresa — o título do formulário confirma: “Conta a pagar · matriz” ou “· filial SP”." },
          { titulo: "2. Clique em “Nova conta a pagar” (ou “a receber”)", texto: "O formulário abre com emissão e competência em hoje e o resto vazio." },
          { titulo: "3. Preencha os campos", texto: "Os obrigatórios têm um * vermelho: fornecedor (ou cliente), valor, emissão, competência e vencimento. Os outros são opcionais, mas são eles que deixam a conta completa no Bling — veja cada um abaixo." },
          { titulo: "4. Salvar", texto: "O botão Salvar só acende com os obrigatórios preenchidos. Enquanto o Bling responde, ele diz “Lançando no Bling…”." },
          { titulo: "5. Confira o aviso", texto: "“Conta lançada no Bling” (ou “N parcelas lançadas no Bling”) e a conta aparece na lista com “criada por” e o seu nome. Se o Bling recusar, a mensagem é “O Bling não aceitou — nada foi lançado”, com o motivo." },
        ],
      },
      {
        titulo: "Encontrar o fornecedor (ou o cliente)",
        print: { chave: "conta-busca", legenda: "A busca do fornecedor, no cadastro do Bling." },
        itens: [
          { n: 1, titulo: "A empresa da conta", texto: "Matriz ou filial SP. Cada empresa tem o seu cadastro de contatos no Bling." },
          { n: 2, titulo: "Buscar", texto: "Digite pelo menos 2 letras do nome, do nome fantasia ou o CNPJ/CPF. A busca é no cadastro de contatos do Bling daquela empresa." },
          { n: 3, titulo: "Escolher", texto: "Clique na linha certa. Ela mostra a razão social e, embaixo, o nome fantasia." },
          { n: 4, titulo: "CNPJ/CPF", texto: "À direita de cada resultado. Quando a empresa tem filiais com o mesmo nome, é o documento que diz qual é qual." },
          { titulo: "Não achou?", texto: "Aparece “Nenhum contato com esse nome ou documento no Bling da …”. O contato precisa existir no Bling daquela empresa: cadastre-o lá e busque de novo. O cadastro de Fornecedores do Finanças não serve aqui — ele é outro, das compras." },
          { titulo: "Trocar", texto: "Depois de escolhido, o contato fica no campo com o botão “Trocar”." },
        ],
      },
      {
        titulo: "Os campos",
        print: { chave: "conta-pagar", legenda: "Conta a pagar da matriz, preenchida." },
        itens: [
          { n: 1, titulo: "Fornecedor *", texto: "O contato escolhido na busca. Obrigatório." },
          { n: 2, titulo: "Valor (R$) *", texto: "O valor da conta. Use vírgula para os centavos: 2.480,00 (com ou sem o ponto do milhar). Só ponto também vale como decimal: 2480.00. Obrigatório e maior que zero." },
          { n: 3, titulo: "Emissão *", texto: "A data do documento (nota, boleto, recibo). Vem com hoje; troque pela data do documento." },
          { n: 4, titulo: "Competência *", texto: "O mês a que a despesa (ou a receita) pertence — é o que separa os meses no Bling. Vem com hoje: uma conta de setembro paga em outubro tem competência em setembro." },
          { n: 5, titulo: "Vencimento *", texto: "Quando a conta vence. Começa vazio. Com mais de uma parcela, o campo vira “1º vencimento”." },
          { n: 6, titulo: "Histórico", texto: "O texto que identifica a conta no Bling: o número da nota, do pedido, a que se refere. Até 2.000 caracteres (o contador fica embaixo). Em conta parcelada, cada parcela leva no fim “— parcela 1/3”, “2/3”…" },
          { n: 7, titulo: "Forma de pagamento", texto: "Boleto, Pix, transferência… A lista vem do Bling daquela empresa, as mais usadas primeiro." },
          { n: 8, titulo: "Conta financeira", texto: "O banco (ou caixa) de onde a conta sai — ou onde a conta a receber entra. A lista vem do Bling; a mais usada já vem escolhida quando há uso anterior. Troque se for outra." },
          { n: 9, titulo: "Categoria", texto: "A categoria financeira do Bling (insumos, frete, venda de produtos…). A lista mostra as de despesa na conta a pagar e as de receita na conta a receber." },
          { n: 10, titulo: "Nº documento", texto: "O número da nota, do boleto ou do contrato." },
          { n: 11, titulo: "Juros mensal (%) e Multa (%)", texto: "Só leitura: vêm da forma de pagamento escolhida, como no Bling. Para mudar, a forma de pagamento é que muda — no Bling." },
          { n: 12, titulo: "Resumo", texto: "Vencimento e valor originais, juros, multa e valor total. Com vencimento já passado, juros, multa e total aparecem como “no Bling”: quem calcula é ele." },
          { n: 13, titulo: "Parcelas", texto: "1 = conta única. De 2 a 36 = parcelada (veja abaixo)." },
          { n: 14, titulo: "Salvar e dar baixa", texto: "Lança a conta e já abre a baixa dela — para a conta que já foi paga (ou recebida). Só em conta única." },
          { n: 15, titulo: "Salvar", texto: "Lança no Bling. Com parcelas, o botão diz “Salvar N parcelas”." },
        ],
      },
      {
        titulo: "Conta a receber: o cliente e o vendedor",
        print: { chave: "conta-receber", legenda: "Conta a receber da matriz, preenchida." },
        itens: [
          { n: 1, titulo: "Cliente *", texto: "A mesma busca do fornecedor, no cadastro de contatos do Bling da empresa." },
          { n: 2, titulo: "Forma de pagamento", texto: "Como o cliente vai pagar." },
          { n: 3, titulo: "Conta financeira", texto: "O banco onde o dinheiro vai entrar." },
          { n: 4, titulo: "Vendedor", texto: "Só existe na conta a receber: quem fez a venda, da lista de vendedores do Bling. “Sem vendedor” se não houver." },
          { n: 5, titulo: "Categoria", texto: "As categorias de receita (venda de produtos, serviços…)." },
        ],
      },
      {
        titulo: "Parcelada",
        print: { chave: "conta-parcelas", legenda: "Três parcelas a partir do 1º vencimento." },
        itens: [
          { n: 1, titulo: "Parcelas", texto: "Quantas contas vão nascer no Bling — uma por parcela, de 2 a 36." },
          { n: 2, titulo: "Como ficam", texto: "De mês em mês a partir do 1º vencimento, com o valor dividido igualmente (os centavos que sobram vão na última)." },
          { n: 3, titulo: "Cada parcela", texto: "Data e valor de cada uma podem ser trocados à mão — por exemplo, uma entrada maior." },
          { n: 4, titulo: "Soma das parcelas", texto: "Fica em âmbar, com “diferente do valor”, quando a soma não bate com o valor da conta. Confira antes de salvar." },
          { n: 5, titulo: "Salvar e dar baixa", texto: "Fica desligado: dar baixa na hora só vale para conta única. Parcela paga se baixa depois, na linha dela." },
          { n: 6, titulo: "Salvar N parcelas", texto: "Todas ou nenhuma: se o Bling recusar uma no meio do caminho, as que já tinham sido criadas são desfeitas lá e a mensagem diz isso." },
        ],
      },
      {
        titulo: "Depois de salvar",
        itens: [
          { titulo: "A conta nasce no Bling primeiro", texto: "Por isso ela aparece aqui já com o número do Bling. Na maior parte das vezes ela entra na lista na hora; se a mensagem disser que a tela leva até 10 minutos, ela está no Bling e só falta a lista atualizar." },
          { titulo: "“O Bling não guardou: …”", texto: "Depois de criar, o sistema relê a conta no Bling. Se ele não guardou algum campo (forma de pagamento, conta financeira, categoria ou vendedor), o aviso diz qual — abra a conta no Bling e complete por lá." },
          { titulo: "Excluir no Bling", texto: "A conta lançada por esta tela, enquanto estiver em aberto, pode ser excluída pelo menu ⋯ da linha: ela some do Bling e é cancelada aqui. Se o Bling recusar, nada muda." },
          { titulo: "Contas a receber da matriz sem o botão", texto: "Quando o lançamento no Bling não está ligado para a matriz, o botão da tela de Contas a receber é “Novo título”: ele cria o título só aqui (cliente, valor, vencimento e observação), sem ir ao Bling." },
        ],
      },
      {
        titulo: "Antes de salvar, confira",
        itens: [
          { titulo: "Empresa", texto: "O título do formulário diz matriz ou filial SP — é nesse Bling que a conta vai nascer." },
          { titulo: "Contato", texto: "O CNPJ/CPF é o do documento (nota ou boleto), não só o nome parecido." },
          { titulo: "Valor", texto: "Com vírgula nos centavos, igual ao do documento." },
          { titulo: "Datas", texto: "Emissão = data do documento; competência = mês da despesa/receita; vencimento = data do boleto." },
          { titulo: "Histórico", texto: "Com o número da nota ou do pedido, para achar a conta depois." },
          { titulo: "Pagamento", texto: "Forma de pagamento, conta financeira e categoria escolhidas (e o vendedor, na conta a receber)." },
          { titulo: "Parcelas", texto: "A soma das parcelas igual ao valor, e as datas de cada uma." },
        ],
      },
    ],
  },

  // ── Dar baixa ───────────────────────────────────────────────────────────────
  {
    id: "baixa",
    titulo: "Dar baixa (pagar e receber)",
    rota: "/pagar",
    resumo:
      "O mesmo formulário nas quatro telas (pagar e receber, matriz e filial), no desenho da baixa do Bling: o banco por onde o dinheiro passou, a data, juros, multa, desconto, tarifa e o valor de fato. Valor menor que o saldo vira baixa parcial.",
    regras: {
      colaborador: ["Dá baixa, estorna e desfaz baixa nas duas empresas."],
      gestor: ["O mesmo que o colaborador."],
    },
    blocos: [
      {
        titulo: "O formulário",
        print: { chave: "baixa-pagar", legenda: "Pagamento com juros, na matriz." },
        itens: [
          { n: 1, titulo: "O título", texto: "Fornecedor (ou cliente), documento, vencimento e valor original. Com baixa parcial anterior, aparece também quanto está em aberto." },
          { n: 2, titulo: "Conta (banco)", texto: "Por onde o dinheiro saiu (ou entrou). Já vem a conta que o título tem no Bling; troque se foi outro banco. É ela que faz o extrato do banco no Bling bater." },
          { n: 3, titulo: "Data do pagamento", texto: "Hoje, por padrão. Não aceita data futura." },
          { n: 4, titulo: "Juros", texto: "O que foi pago a mais por atraso. Soma no valor pago." },
          { n: 5, titulo: "Multa", texto: "Também soma no valor pago." },
          { n: 6, titulo: "Desconto", texto: "O que foi abatido. Sai do valor pago." },
          { n: 7, titulo: "Valor pago", texto: "Calculado sozinho: o que está em aberto + juros + multa − desconto (− tarifa, no recebimento). Pode ser digitado; aí aparece “usar R$ …” para voltar ao calculado." },
          { n: 8, titulo: "Histórico", texto: "O texto da baixa no Bling. Vem com o histórico do título; complete com o que ajuda a achar a baixa depois (ex.: “Ref. ao pedido 219 | pix”). Até 2.000 caracteres. Em branco, vai “Baixa pelo CarboHub Finanças” com o seu nome." },
          { n: 9, titulo: "Quita ou parcial", texto: "Verde “Quita o título”; âmbar “Baixa parcial — ficam R$ … em aberto”; vermelho quando algo não fecha (por exemplo, valor maior que o saldo: a diferença entra como juros ou multa)." },
          { n: 10, titulo: "Para onde vai", texto: "“A baixa vai para o Bling na hora, na conta escolhida”, ou “A baixa vale só aqui” quando o envio ao Bling não está ligado." },
          { n: 11, titulo: "Confirmar pagamento", texto: "Só acende quando a conta fecha. No recebimento, “Confirmar recebimento”." },
        ],
      },
      {
        titulo: "Recebimento com tarifa (e parcial)",
        print: { chave: "baixa-receber", legenda: "Recebimento com tarifa e valor menor que o saldo." },
        itens: [
          { n: 1, titulo: "Tarifa", texto: "Só no recebimento: o que o banco ou a plataforma reteve (ex.: a taxa do Mercado Livre). Entra a menos no valor recebido, mas quita o título junto." },
          { n: 2, titulo: "Valor recebido", texto: "O que entrou de fato na conta." },
          { n: 3, titulo: "usar R$ …", texto: "Volta para o valor calculado." },
          { n: 4, titulo: "Baixa parcial", texto: "O título continua em aberto com o saldo que sobrou, e na lista aparece “Parcial”. Parcial só existe com o envio ao Bling ligado — é o Bling que guarda o saldo." },
        ],
      },
      {
        titulo: "Matriz e filial têm caminhos diferentes",
        itens: [
          { titulo: "Matriz (Bling 1)", texto: "A baixa é gravada aqui e enviada ao Bling logo em seguida. Se o Bling recusar, a baixa daqui continua, e a linha mostra “Bling recusou” com “Tentar de novo”. Baixa parcial vai direto ao Bling e não marca nada como pago aqui." },
          { titulo: "Filial (Bling 2)", texto: "A baixa vai primeiro ao Bling 2. Se ele recusar, nada muda aqui e a tela diz o motivo." },
          { titulo: "Desfazer", texto: "Matriz: “Estornar pagamento/recebimento” no menu ⋯. Filial: “Desfazer baixa” no menu ⋯. Os dois só desfazem a baixa feita pelo sistema; a baixa feita no próprio Bling se desfaz no Bling, e a tela acompanha." },
        ],
      },
    ],
  },

  // ── Assinaturas ─────────────────────────────────────────────────────────────
  {
    id: "assinaturas",
    titulo: "Assinaturas",
    rota: "/pagar/assinaturas",
    resumo: "Os serviços recorrentes da empresa: o que renova, quando, quanto custa por mês e em qual cartão é cobrado.",
    regras: {
      colaborador: [SO_LEITURA],
      gestor: ["Cadastra, edita, pausa, reativa e exclui assinaturas."],
    },
    blocos: [
      {
        print: { chave: "assin-lista", legenda: "A lista de assinaturas ativas, vista pelo gestor." },
        itens: [
          { n: 1, titulo: "Cartões", texto: "Quantas assinaturas ativas, o custo por mês em cada moeda (real e dólar nunca se somam), as de cobrança manual vencidas e as que vencem nos próximos 7 dias." },
          { n: 2, titulo: "Ativas / Pausadas / Canceladas", texto: "Qual grupo a lista mostra." },
          { n: 3, titulo: "Setor", texto: "Filtra pelo setor dono da assinatura." },
          { n: 4, titulo: "Nova assinatura", texto: "Abre o cadastro (veja abaixo).", papel: "gestor" },
          { n: 5, titulo: "Próximo vencimento", texto: "Em vermelho, com os dias que faltam, quando a cobrança é manual e vence em até 7 dias — é a que precisa de alguém para pagar." },
          { n: 6, titulo: "Manual", texto: "A cobrança não cai sozinha no cartão: alguém precisa pagar." },
          { n: 7, titulo: "Ações", texto: "Editar, pausar (ou reativar) e excluir. Cancelada não volta com um clique: reativar é pelo Editar, no campo Status. Excluir apaga do histórico — para uma assinatura encerrada, marque Cancelada.", papel: "gestor" },
        ],
      },
      {
        titulo: "Cadastrar",
        papel: "gestor",
        print: { chave: "assin-form", legenda: "Nova assinatura.", papel: "gestor" },
        itens: [
          { n: 1, titulo: "Nome *", texto: "Como o time conhece o serviço." },
          { n: 2, titulo: "Setor", texto: "Quem usa (TI, Ops, Marketing…)." },
          { n: 3, titulo: "Valor", texto: "O valor de cada cobrança." },
          { n: 4, titulo: "Moeda", texto: "Real ou dólar." },
          { n: 5, titulo: "Ciclo", texto: "Mensal, trimestral, anual… O custo por mês dos cartões é calculado a partir dele." },
          { n: 6, titulo: "Cobrança", texto: "Automática (cai no cartão) ou Manual (alguém precisa lembrar de pagar)." },
          { n: 7, titulo: "Próximo vencimento", texto: "A próxima data de cobrança." },
          { n: 8, titulo: "Cartão / forma de pagamento", texto: "Em qual das Formas de pagamento cadastradas ela é cobrada." },
        ],
      },
    ],
  },

  // ── Contas a receber ────────────────────────────────────────────────────────
  {
    id: "receber",
    titulo: "Contas a receber",
    rota: "/receber",
    resumo:
      "Os títulos a receber da matriz (Bling 1, atualizado a cada 10 minutos) e da filial SP (Bling 2), em telas separadas. Funciona igual a Contas a pagar: fila de trabalho, cartões que filtram, conta nova no Bling e baixa.",
    regras: {
      colaborador: ["Vê, lança, recebe, estorna e cancela títulos nas duas empresas."],
      gestor: ["O mesmo que o colaborador."],
    },
    blocos: [
      {
        print: { chave: "receber-lista", legenda: "Contas a receber da matriz, na fila de trabalho." },
        itens: [
          { n: 1, titulo: "Nova conta a receber", texto: "Lança no Bling da empresa escolhida, com cliente, vendedor e categoria de receita. Veja “Conta nova no Bling”. Sem o lançamento ligado para a matriz, o botão é “Novo título” (só aqui)." },
          { n: 2, titulo: "Matriz / Filial SP", texto: "Troca a tela inteira de empresa." },
          { n: 3, titulo: "Cartões", texto: "Em aberto, Vencido, Vence hoje e Próximos 7 dias. Os dois primeiros são atalhos de filtro." },
          { n: 4, titulo: "Buscar", texto: "Por cliente, número do pedido, número da NF ou CNPJ (com ou sem pontuação)." },
          { n: 5, titulo: "Status", texto: "Fila de trabalho, Em aberto, Vencidos, A vencer, Recebidos, Cancelados ou Todos. Em Recebidos, o filtro de período passa a ser pela data do recebimento." },
          { n: 6, titulo: "Origem", texto: "Bling, NF (título gerado a partir da nota) ou Sistema." },
          { n: 7, titulo: "Parcela, pedido e NF", texto: "Embaixo do cliente: a parcela (2/3), o pedido e a nota de origem, quando o título os tem." },
          { n: 8, titulo: "Receber", texto: "Abre a baixa — com o campo Tarifa, que só existe no recebimento." },
        ],
      },
      {
        titulo: "Os já recebidos",
        print: { chave: "receber-recebidos", legenda: "Filtro Recebidos." },
        itens: [
          { n: 1, titulo: "Valor e ajustes", texto: "O valor que entrou e o que foi retido ou acrescentado (tarifa, juros, desconto)." },
          { n: 2, titulo: "no Bling ✓", texto: "A baixa chegou ao Bling. “pelo banco” aparece quando o recebimento veio do retorno do banco." },
        ],
      },
    ],
  },

  // ── Fluxo de caixa ──────────────────────────────────────────────────────────
  {
    id: "fluxo-caixa",
    titulo: "Fluxo de caixa",
    rota: "/fluxo-caixa",
    resumo:
      "O que deve entrar (contas a receber) contra o que deve sair (contas a pagar), semana a semana. Só contas em real. Não inclui o saldo que já está no banco.",
    regras: {
      colaborador: ["Vê a tela inteira."],
      gestor: ["O mesmo que o colaborador."],
    },
    blocos: [
      {
        print: { chave: "fluxo", legenda: "As próximas 8 semanas." },
        itens: [
          { n: 1, titulo: "Origem", texto: "Todas, Sistema ou Bling." },
          { n: 2, titulo: "Horizonte", texto: "4, 8 ou 12 semanas à frente." },
          { n: 3, titulo: "Cartões", texto: "Entradas previstas, saídas previstas, saldo previsto (entradas − saídas) e a inadimplência (o que está vencido a receber)." },
          { n: 4, titulo: "A 1ª semana", texto: "Leva todo o vencido em aberto, de qualquer data — por isso costuma ser a barra maior." },
          { n: 5, titulo: "Gráfico", texto: "Barras verdes = entradas, vermelhas = saídas; a linha amarela é o saldo previsto acumulado. Embaixo, quanto dos recebimentos chegou no prazo." },
          { n: 6, titulo: "Aging de clientes", texto: "O a receber em aberto por faixa: vencido há mais de 30 dias, até 30 dias, hoje, e a vencer em 7, 30 ou mais dias." },
          { n: 7, titulo: "Aging de fornecedores", texto: "As mesmas faixas, para o a pagar." },
        ],
      },
    ],
  },

  // ── Painel financeiro ───────────────────────────────────────────────────────
  {
    id: "painel-financeiro",
    titulo: "Painel financeiro",
    rota: "/painel-financeiro",
    papel: "gestor",
    resumo: "Os indicadores do contas a pagar e das compras num lugar só: vencido, previsão de desembolso, concentração por fornecedor, tempo de cada etapa das compras e assinaturas.",
    regras: {
      colaborador: ["Não vê a tela: ao abrir o endereço, aparece o aviso de que ela é só para gestores."],
      gestor: ["Vê o painel inteiro, com os filtros de origem e período."],
    },
    blocos: [
      {
        print: { chave: "painelfin", legenda: "O painel, últimos 12 meses." },
        itens: [
          { n: 1, titulo: "Origem", texto: "Todas, Sistema ou Bling." },
          { n: 2, titulo: "Período", texto: "6 meses, 12 meses ou tudo. Vale para os gráficos de status, evolução e fornecedores." },
          { n: 3, titulo: "Cartões", texto: "Vencido em aberto, a vencer em 30 dias, % pago no prazo e % de notas de compra que bateram com o pedido e o recebimento (3-way)." },
          { n: 4, titulo: "Aging", texto: "O a pagar em aberto por faixa de vencimento." },
          { n: 5, titulo: "Previsão de desembolso", texto: "Quanto vence em cada uma das próximas 8 semanas." },
          { n: 6, titulo: "Por status", texto: "Pago, programado e atrasado no período." },
          { n: 7, titulo: "Evolução mensal", texto: "Pago e em aberto, mês a mês." },
          { n: 8, titulo: "Curva ABC", texto: "Os fornecedores que mais pesam, com o % acumulado sobre o total do período." },
          { n: 9, titulo: "Tempo de ciclo", texto: "Quantos dias (mediana) cada etapa das compras leva: requisição → aprovação → ordem de compra → recebimento → nota." },
          { n: 10, titulo: "RCs paradas", texto: "As requisições esperando aprovação, com há quantos dias. Vermelho a partir de 3 dias." },
          { n: 11, titulo: "Assinaturas por setor", texto: "O custo mensal das assinaturas ativas, real e dólar separados." },
          { n: 12, titulo: "Próximas renovações", texto: "O que renova nos próximos 60 dias." },
        ],
      },
    ],
  },

  // ── Fornecedores ────────────────────────────────────────────────────────────
  {
    id: "fornecedores",
    titulo: "Fornecedores",
    rota: "/fornecedores",
    resumo:
      "O cadastro de fornecedores das compras (requisições, cotações e ordens de compra). Ele não é o cadastro de contatos do Bling: a conta nova lançada no Bling busca o fornecedor no Bling.",
    regras: {
      colaborador: [SO_LEITURA],
      gestor: ["Cadastra, edita, inativa e exclui fornecedores."],
    },
    blocos: [
      {
        print: { chave: "fornec-lista", legenda: "A lista de fornecedores." },
        itens: [
          { n: 1, titulo: "Buscar", texto: "Por nome, razão social, CNPJ (com ou sem pontuação) ou cidade, com ou sem acento." },
          { n: 2, titulo: "Novo fornecedor", texto: "Abre o cadastro.", papel: "gestor" },
          { n: 3, titulo: "Inativo", texto: "O fornecedor continua no histórico, mas sai das listas de escolha." },
          { n: 4, titulo: "Ações", texto: "Editar, inativar (ou ativar) e excluir.", papel: "gestor" },
        ],
      },
      {
        titulo: "Cadastrar",
        papel: "gestor",
        print: { chave: "fornec-form", legenda: "Novo fornecedor.", papel: "gestor" },
        itens: [
          { n: 1, titulo: "Nome *", texto: "Como o time chama o fornecedor." },
          { n: 2, titulo: "Razão social", texto: "Como sai na nota fiscal." },
          { n: 3, titulo: "CNPJ/CPF", texto: "O documento do fornecedor." },
          { n: 4, titulo: "Categoria", texto: "Embalagem, insumo, frete… Sugere as categorias que já existem." },
          { n: 5, titulo: "Observações", texto: "Condição de pagamento, contato comercial…" },
        ],
      },
    ],
  },

  // ── Formas de pagamento ─────────────────────────────────────────────────────
  {
    id: "formas-pagamento",
    titulo: "Formas de pagamento",
    rota: "/formas-pagamento",
    resumo:
      "Os cartões e meios de pagamento usados nas compras e nas assinaturas. É um cadastro do Finanças — diferente da “forma de pagamento” do Bling, que aparece na conta nova lançada no Bling.",
    regras: {
      colaborador: [SO_LEITURA],
      gestor: ["Cadastra, edita, inativa e exclui formas de pagamento."],
    },
    blocos: [
      {
        print: { chave: "formas-lista", legenda: "A lista de formas de pagamento." },
        itens: [
          { n: 1, titulo: "Só os 4 últimos dígitos", texto: "Por segurança, o sistema guarda só a bandeira e os 4 últimos dígitos do cartão — nunca o número completo." },
          { n: 2, titulo: "Nova forma de pagamento", texto: "Abre o cadastro.", papel: "gestor" },
          { n: 3, titulo: "Inativo", texto: "Cartão cancelado: sai das listas de escolha, fica no histórico." },
          { n: 4, titulo: "Ações", texto: "Editar, inativar (ou ativar) e excluir.", papel: "gestor" },
        ],
      },
      {
        titulo: "Cadastrar",
        papel: "gestor",
        print: { chave: "formas-form", legenda: "Nova forma de pagamento.", papel: "gestor" },
        itens: [
          { n: 1, titulo: "Apelido *", texto: "Como o time reconhece: “Nubank TI”, “Inter PJ”." },
          { n: 2, titulo: "Tipo", texto: "Cartão de crédito, débito, Pix, boleto ou outro." },
          { n: 3, titulo: "Bandeira", texto: "Só para cartão." },
          { n: 4, titulo: "4 últimos dígitos", texto: "Só para cartão." },
          { n: 5, titulo: "Titular", texto: "O nome impresso no cartão ou o dono da conta." },
        ],
      },
    ],
  },
];
