import type { Secao } from "../tipos";

// ─────────────────────────────────────────────────────────────────────────────
// Documentação do Carbo Admin — seção Comercial do menu: Dashboard Comercial,
// Dados Comerciais (fonte), Aprovações (desconto e fabricação) e Tabela de
// preços.
//
// ⚠️ As quatro telas só abrem para GESTOR: o colaborador vê "Área restrita a
// gestores". Por isso os prints são da versão gestor.
// ⚠️ O `n` de cada item é o MESMO marcador do print (`chave`), medido pelo
// harness (docs-prints/shots_painelcom.mjs). Mudou a tela: refaça o print.
// ─────────────────────────────────────────────────────────────────────────────

const SO_GESTOR = [
  "Não abre: no lugar da tela aparece o aviso “Área restrita a gestores”.",
  "Se você precisa destes números, peça ao seu gestor ou ao TI.",
];

export const SECOES_PAINELCOM: Secao[] = [
  // ── Dashboard Comercial ─────────────────────────────────────────────────────
  {
    id: "dashboard-comercial",
    titulo: "Dashboard Comercial",
    rota: "/painel-comercial",
    resumo:
      "O painel de vendas do Grupo Carbo: quanto foi faturado, por onde (on-line, Comercial Expansão e CarboVAPT), como o mês está contra o anterior, as metas por canal e as unidades vendidas por produto. É a tela que abre quando você entra no Admin.",
    regras: {
      colaborador: SO_GESTOR,
      gestor: [
        "Vê os números de toda a empresa e pode filtrar por período, vendedor e canal.",
        "Edita as metas por canal (botão “Editar metas”).",
      ],
    },
    blocos: [
      {
        titulo: "De onde vêm os números",
        texto:
          "Produto (CarboZé, CarboPRO) conta pela nota fiscal emitida no Bling: pedido sem nota válida, orçamento, cancelado e nota de bonificação ficam de fora. Serviço (CarboVAPT) conta pela nota de serviço (NFS-e) do Portal Nacional. As duas bases não se repetem, por isso o total é a soma das duas. Para ver pedido a pedido o que entrou e o que ficou fora, use Dados Comerciais (fonte).",
      },
      {
        titulo: "Quem não é gestor",
        texto: "As quatro telas da seção Comercial (Dashboard, Dados, Aprovações e Tabela de preços) são só para gestor. Para os demais, a tela mostra este aviso.",
        print: { chave: "pc-restrito", legenda: "O que aparece para quem não é gestor." },
      },
      {
        titulo: "Topo: filtros e totais",
        print: { chave: "pc-dash-topo", legenda: "O topo do Dashboard Comercial: filtros, faturamento por origem e o mês contra o anterior." },
        itens: [
          { n: 1, titulo: "Gráficos / Dados (fonte)", texto: "Alterna entre este painel e a tabela com os pedidos que formam cada número." },
          { n: 2, titulo: "Período", texto: "Data de início e de fim. Vazio = todo o histórico. A data que vale é a da venda (a do faturamento), não a do dia em que o pedido foi digitado." },
          { n: 3, titulo: "Vendedor", texto: "Mostra só as vendas de uma pessoa. Não vale para o CarboVAPT: a nota de serviço não tem vendedor." },
          { n: 4, titulo: "Canal", texto: "Consumo (B2B), Revenda (PDV), On-line ou Não classificado. “Limpar” aparece ao lado quando algum filtro está ligado e volta tudo ao padrão. Os filtros ficam no endereço da página: dá para mandar o link para alguém." },
          { n: 5, titulo: "CarboZé on-line", texto: "O que foi faturado nos marketplaces e na loja própria (Mercado Livre, Amazon, Nuvemshop, PayT…)." },
          { n: 6, titulo: "Comercial Expansão", texto: "Venda direta e revenda: o que o time comercial vendeu." },
          { n: 7, titulo: "CarboVAPT", texto: "O serviço de descarbonização, pelas notas de serviço. Quando há outro tipo de serviço, ele aparece somado embaixo (“em outros serviços”)." },
          { n: 8, titulo: "Faturamento total", texto: "Produto + serviço. É a soma dos três cartões ao lado." },
          { n: 9, titulo: "Aviso da NFS-e", texto: "O portal só tem notas de serviço a partir do mês indicado. Mês anterior sem CarboVAPT é falta de dado no portal, não falta de serviço." },
          { n: 10, titulo: "Total de Vendas", texto: "Pedidos de produto mais notas de serviço, com a conta aberta embaixo." },
          { n: 11, titulo: "Maior Venda", texto: "A maior venda do período, olhando produto e serviço, com o cliente." },
          { n: 12, titulo: "Top Recorrência", texto: "O cliente que mais comprou no período (pelo CNPJ/CPF, juntando produto e serviço)." },
          { n: 13, titulo: "Ticket Médio", texto: "Faturamento total dividido pelo total de vendas. Embaixo, o ticket de cada origem." },
          { n: 14, titulo: "Mês contra o anterior", texto: "Um cartão por origem (Total, On-line, Comercial Expansão, CarboVAPT): faturamento e volume do mês atual, a variação em % e, embaixo, o número do mês anterior. Verde subiu, vermelho caiu; “s/d” quando não há mês anterior para comparar." },
          { n: 15, titulo: "CarboVAPT no comparativo", texto: "No serviço, o volume é contado em notas, não em pedidos." },
        ],
      },
      {
        titulo: "Evolução mensal",
        print: { chave: "pc-dash-evolucao", legenda: "Faturado e número de vendas dos últimos 12 meses, por origem." },
        itens: [
          { n: 1, titulo: "Ver pedidos", texto: "Abre a lista de pedidos em Dados Comerciais." },
          { n: 2, titulo: "Faturado · TOTAL", texto: "Barras com o faturamento de cada mês; o número grande no canto é o acumulado do período. Passe o mouse numa barra para ver o valor exato." },
          { n: 3, titulo: "Faturado por origem", texto: "Os mesmos 12 meses separados: on-line, Comercial Expansão e CarboVAPT, sempre nessa ordem." },
          { n: 4, titulo: "Faturado · CarboVAPT", texto: "Começa no mês em que o portal passou a ter as notas de serviço (veja o aviso do topo)." },
          { n: 5, titulo: "Vendas", texto: "A mesma leitura em quantidade: pedidos (produto) e notas (serviço) por mês." },
        ],
      },
      {
        titulo: "Crescimento anual e ticket médio",
        print: { chave: "pc-dash-anual", legenda: "Real contra a meta do ano e a evolução do ticket médio." },
        itens: [
          { n: 1, titulo: "Crescimento Anual", texto: "O faturamento real de cada mês do ano (produto + serviço) contra a meta de vendas configurada." },
          { n: 2, titulo: "Real e Meta", texto: "Barra verde = real; linha laranja tracejada = meta. A meta é a soma das metas dos vendedores (filtrando um vendedor, só a dele)." },
          { n: 3, titulo: "Ticket médio por mês", texto: "Quanto vale, em média, cada venda em cada mês: total, on-line, Comercial Expansão e CarboVAPT." },
        ],
      },
      {
        titulo: "Análise por canal e metas",
        print: { chave: "pc-dash-canais", legenda: "Vendas por canal, crescimento de clientes e metas por canal." },
        itens: [
          { n: 1, titulo: "Vendas por canal", texto: "Cada linha mostra o faturamento, a quantidade e a fatia (%) do canal no total. A barrinha ajuda a comparar." },
          { n: 2, titulo: "CarboVAPT", texto: "O serviço entra na conta da fatia; por isso as cinco linhas somam 100%." },
          { n: 3, titulo: "Não classificado", texto: "Pedido que ainda não teve o canal definido. Classifique em Dados Comerciais → Pedidos (lápis da linha ou seleção em massa)." },
          { n: 4, titulo: "Acumulado / Ativos / Novos", texto: "Muda o que o gráfico de clientes conta: o tamanho da base até o mês, quem comprou no mês ou quem comprou pela primeira vez no mês. Cliente é contado pelo CNPJ/CPF; a linha do PDV vem do cadastro de pontos de venda." },
          { n: 5, titulo: "PDV no mês", texto: "Quanto a base de PDVs cresceu do mês anterior para o atual, com os dois números." },
          { n: 6, titulo: "Editar metas", texto: "Abre a janela para definir a meta mensal de cada canal (veja abaixo).", papel: "gestor" },
          { n: 7, titulo: "Meta por canal", texto: "Barras = real do mês; linha laranja = meta. Embaixo do título, a regra da meta daquele canal." },
        ],
      },
      {
        titulo: "Editar metas por canal",
        papel: "gestor",
        print: { chave: "pc-dash-metas", legenda: "A janela Metas por Canal.", papel: "gestor" },
        itens: [
          { n: 1, titulo: "Mês", texto: "Escolha o mês do ano que vai receber a meta." },
          { n: 2, titulo: "Consumo (B2B)", texto: "Deixe vazio para usar a regra automática: o real do mês anterior + 15%." },
          { n: 3, titulo: "Revenda e On-line", texto: "Digite o valor da meta do mês. Campo vazio não muda nada." },
          { n: 4, titulo: "Salvar metas", texto: "Grava só os campos preenchidos. O gráfico de metas atualiza na hora." },
        ],
      },
      {
        titulo: "Unidades vendidas",
        print: { chave: "pc-dash-unidades", legenda: "Unidades vendidas por produto, on-line e Comercial Expansão." },
        itens: [
          { n: 1, titulo: "Período", texto: "De quando são estes números. Só entram pedidos que contam (com nota válida); bonificação entra, insumo e serviço não." },
          { n: 2, titulo: "Cobertura", texto: "Quanto do valor vendido já tem nota válida. Abaixo de 95% fica em laranja. Diz quantos pedidos ainda estão sem nota e quantas entregas estão agendadas para datas futuras (essas ficam fora da conta, porque ainda não aconteceram)." },
          { n: 3, titulo: "Unidades · On-line", texto: "Conta em packs (o que a plataforma anunciou) e em unidades que o cliente levou: um kit de 5 frascos é 1 pack e 5 unidades." },
          { n: 4, titulo: "Produto sem mapa", texto: "Cartão laranja = anúncio que ainda não foi ligado a um produto do cadastro. O número é o mínimo. O mapeamento é feito no Ops (Suprimentos → Mapeamento SKU)." },
          { n: 5, titulo: "Unidades · Comercial Expansão", texto: "Conta em itens do catálogo, como saem no pedido. As duas listas não se somam: pack e item de catálogo são medidas diferentes." },
          { n: 6, titulo: "Bonificação", texto: "“inclui N bonif.” mostra quantos daqueles itens foram brinde." },
        ],
      },
    ],
  },

  // ── Dados Comerciais (fonte) ────────────────────────────────────────────────
  {
    id: "dados-comerciais",
    titulo: "Dados Comerciais (fonte)",
    rota: "/dados-comerciais",
    resumo:
      "As linhas que formam o Dashboard Comercial: cada pedido, cada nota de serviço e cada cliente, com o motivo de ter entrado ou não na conta. É aqui que se confere um número, classifica o canal de um pedido e cria follow-up para um cliente.",
    regras: {
      colaborador: SO_GESTOR,
      gestor: [
        "Vê todos os pedidos, notas de serviço e clientes, com os mesmos filtros do Dashboard.",
        "Corrige o canal e a origem de um pedido, um a um ou vários de uma vez, e atribui vendedor.",
        "Cria o card de follow-up de um cliente.",
      ],
    },
    blocos: [
      {
        titulo: "Pedidos",
        print: { chave: "pc-dados-pedidos", legenda: "A aba Pedidos internos." },
        itens: [
          { n: 1, titulo: "Gráficos / Dados (fonte)", texto: "Volta para o Dashboard. O período, o vendedor e o canal funcionam como lá." },
          { n: 2, titulo: "Cartões do topo", texto: "Somam o que está na tela agora (respeitam a aba, a busca e os filtros): quantos pedidos contam, o total e o ticket médio." },
          { n: 3, titulo: "Excluídos das métricas", texto: "Pedidos válidos que NÃO entram na conta: sem nota, nota cancelada, bonificação ou excluídos à mão." },
          { n: 4, titulo: "Abas", texto: "Pedidos internos, Pedidos online, Descarbonização (notas de serviço), Clientes internos e Clientes online. On-line e interno ficam separados porque são gestões diferentes. Cada aba tem endereço próprio." },
          { n: 5, titulo: "Buscar", texto: "Por nome do cliente ou número do pedido." },
          { n: 6, titulo: "Status", texto: "Mostra só os pedidos de um status." },
          { n: 7, titulo: "Só os que contam métrica", texto: "Esconde o que está fora da conta, para conferir o número do Dashboard." },
          { n: 8, titulo: "Exportar CSV", texto: "Baixa a lista da tela, na mesma ordem, para abrir no Excel." },
          { n: 9, titulo: "Contagem", texto: "Quantas linhas estão na tela de quantas existem. A tabela desenha até 500; para o resto, filtre ou exporte." },
          { n: 10, titulo: "Selecionar", texto: "Marca todos os pedidos visíveis (ou um a um, na linha) para alterar vários de uma vez." },
          { n: 11, titulo: "Nota fiscal", texto: "Verde = nota válida; vermelha = cancelada ou rejeitada, com a situação." },
          { n: 12, titulo: "Por que não conta", texto: "Embaixo do status, em palavras: aguardando emissão da NF, orçamento, cancelado, NF cancelada, bonificação, remessa de entrega futura (já faturada na nota mãe) ou excluído manualmente." },
          { n: 13, titulo: "Conta?", texto: "“Conta” = entra no faturamento. “Não conta” em laranja = pedido de verdade que está fora; em cinza = orçamento ou cancelado." },
          { n: 14, titulo: "Origem", texto: "Bling (entrou pela integração) ou Manual (lançado no sistema)." },
          { n: 15, titulo: "Editar", texto: "Abre a janela para corrigir o canal e a origem do pedido.", papel: "gestor" },
          { titulo: "Ordenar", texto: "Clique no nome de qualquer coluna para ordenar; clique de novo para inverter." },
        ],
      },
      {
        titulo: "Alterar vários pedidos de uma vez",
        papel: "gestor",
        print: { chave: "pc-dados-massa", legenda: "Três pedidos marcados e a barra de ações.", papel: "gestor" },
        itens: [
          { n: 1, titulo: "Barra de seleção", texto: "Aparece quando há pedido marcado e diz quantos são. Mudar a busca ou um filtro desmarca tudo, para não alterar pedido que você não está vendo." },
          { n: 2, titulo: "Classificar canal", texto: "Escolha o canal e clique em Aplicar: vale para todos os marcados." },
          { n: 3, titulo: "Atribuir vendedor", texto: "Escolha o vendedor e clique em Aplicar. A venda passa a contar para ele." },
          { n: 4, titulo: "Limpar seleção", texto: "Desmarca tudo sem alterar nada." },
          { n: 5, titulo: "Marcar um pedido", texto: "A caixinha da linha. Se algum pedido não puder ser alterado por falta de permissão, o aviso diz quantos." },
        ],
      },
      {
        titulo: "Editar um pedido",
        papel: "gestor",
        print: { chave: "pc-dados-editar", legenda: "A janela Editar pedido (lápis da linha).", papel: "gestor" },
        itens: [
          { n: 1, titulo: "Canal", texto: "Não classificado, Consumo (B2B), Revenda (PDV) ou On-line." },
          { n: 2, titulo: "Origem", texto: "“Automática” segue o lugar por onde o pedido entrou. Manual ou Bling só troca o rótulo; não mexe no vínculo com o Bling." },
          { n: 3, titulo: "Salvar", texto: "Grava e atualiza a lista e o Dashboard." },
        ],
      },
      {
        titulo: "Descarbonização (notas de serviço)",
        print: { chave: "pc-dados-descarb", legenda: "A aba Descarbonização: as NFS-e emitidas no Portal Nacional." },
        itens: [
          { n: 1, titulo: "Aba Descarbonização", texto: "Lista as notas de serviço que formam o CarboVAPT no Dashboard. A nota não tem vendedor, por isso o filtro de vendedor não vale aqui." },
          { n: 2, titulo: "Notas válidas", texto: "Quantas notas contam, o total e o ticket médio." },
          { n: 3, titulo: "Canceladas", texto: "Notas canceladas no portal. Elas continuam na lista, mas não entram no total." },
          { n: 4, titulo: "Código do serviço", texto: "O código nacional da nota. 14.01.01 é descarbonização." },
          { n: 5, titulo: "Outro serviço", texto: "Nota com outro código: entra no total de serviço, mas não no CarboVAPT." },
          { n: 6, titulo: "Situação", texto: "Válida ou Cancelada." },
          { n: 7, titulo: "Conta?", texto: "Nota cancelada não conta." },
        ],
      },
      {
        titulo: "Clientes",
        print: { chave: "pc-dados-clientes", legenda: "A aba Clientes internos: um cliente por CNPJ/CPF." },
        itens: [
          { n: 1, titulo: "Aba Clientes", texto: "Junta os pedidos por documento (CNPJ/CPF): pedidos, total, primeira e última compra e há quantos dias foi a última. Há a mesma aba para clientes on-line." },
          { n: 2, titulo: "Agrupar nomes iguais", texto: "Junta os documentos que têm o mesmo nome (útil para redes com vários CNPJs). Clique de novo para voltar a um por documento." },
          { n: 3, titulo: "Contagem", texto: "Quantos documentos e quantos nomes diferentes há na lista." },
          { n: 4, titulo: "Nomes diferentes no mesmo doc", texto: "O mesmo CNPJ foi gravado com nomes diferentes em pedidos diferentes. Vale conferir o cadastro." },
          { n: 5, titulo: "No follow-up", texto: "O cliente já tem um card de follow-up aberto no Sales." },
          { n: 6, titulo: "Criar follow-up", texto: "Cria o card de follow-up no Sales, no nome do vendedor do último pedido. Se o pedido não tem vendedor, o sistema pergunta quem será o dono. Cliente sem CNPJ não pode ter follow-up.", papel: "gestor" },
          { n: 7, titulo: "Abrir o cliente", texto: "Clique na linha para ver o resumo e todos os pedidos do cliente." },
        ],
      },
      {
        titulo: "Detalhe do cliente",
        print: { chave: "pc-dados-cliente", legenda: "O resumo de um cliente." },
        itens: [
          { n: 1, titulo: "Cliente", texto: "Nome, canal e documento. Quando o grupo junta vários CNPJs, aparece a lista deles com o total de cada um." },
          { n: 2, titulo: "Resumo", texto: "Pedidos, total, ticket médio e a última compra." },
          { n: 3, titulo: "Vendedores", texto: "Quem já vendeu para este cliente." },
          { n: 4, titulo: "Pedidos", texto: "Todos os pedidos, do mais novo para o mais antigo; o mais recente vem marcado “último”." },
        ],
      },
    ],
  },

  // ── Aprovações ──────────────────────────────────────────────────────────────
  {
    id: "aprovacoes",
    titulo: "Aprovações de desconto e fabricação",
    rota: "/aprovacoes",
    resumo:
      "Onde o gestor decide o que precisa de aval: descontos acima do limite do vendedor e vendas com prazo de entrega curto demais para fabricar. Também é onde se configuram as regras (a alçada de desconto e os prazos de fabricação).",
    regras: {
      colaborador: SO_GESTOR,
      gestor: [
        "Aprova ou recusa descontos e liberações de fabricação, com observação opcional.",
        "Liga ou desliga a alçada e define as faixas de desconto e as regras de prazo.",
      ],
    },
    blocos: [
      {
        titulo: "Como funciona",
        texto:
          "Quando o vendedor dá um desconto no Vender, a porcentagem cai numa faixa da alçada: até a primeira faixa é aprovado sozinho; acima, o pedido entra na fila do gestor ou do CEO. Com a alçada desligada, tudo é aprovado automaticamente e nada entra na fila. A fabricação segue a mesma ideia: venda com entrega combinada em menos dias úteis do que o mínimo para fabricar precisa ser liberada.",
      },
      {
        titulo: "Fila de descontos",
        print: { chave: "pc-desc-fila", legenda: "Descontos aguardando aprovação." },
        itens: [
          { n: 1, titulo: "Desconto / Fabricação", texto: "Troca entre as duas filas." },
          { n: 2, titulo: "Fila / Configuração da alçada", texto: "A fila de pedidos ou as regras (veja abaixo)." },
          { n: 3, titulo: "Filtros", texto: "Pendentes (o padrão), Aprovados, Recusados ou Todos. A fila se atualiza sozinha a cada 30 segundos." },
          { n: 4, titulo: "Desconto", texto: "O valor do desconto e a porcentagem sobre o subtotal." },
          { n: 5, titulo: "Alçada", texto: "Quem precisa aprovar: Auto, Gestor ou CEO." },
          { n: 6, titulo: "Aprovar / Recusar", texto: "O ✓ aprova e o ✕ recusa na hora, sem observação. Se a tabela não couber na tela, role para o lado para ver os dois botões." },
          { n: 7, titulo: "Abrir o pedido", texto: "Clique na linha para ver o motivo do vendedor e decidir com uma observação." },
        ],
      },
      {
        titulo: "Histórico de decisões",
        print: { chave: "pc-desc-todos", legenda: "O filtro Todos." },
        itens: [
          { n: 1, titulo: "Quem decidiu", texto: "Embaixo do status: quem aprovou ou recusou e quando." },
          { n: 2, titulo: "Auto-aprovado", texto: "Desconto dentro da faixa automática: não passou por ninguém." },
        ],
      },
      {
        titulo: "Decidir um desconto",
        print: { chave: "pc-desc-detalhe", legenda: "Um desconto pendente aberto." },
        itens: [
          { n: 1, titulo: "Resumo", texto: "Cliente, vendedor, subtotal, desconto, total e a alçada exigida." },
          { n: 2, titulo: "Motivo", texto: "O que o vendedor escreveu ao pedir o desconto." },
          { n: 3, titulo: "Observação", texto: "Opcional. Fica gravada como nota do aprovador." },
          { n: 4, titulo: "Recusar", texto: "Recusa o desconto." },
          { n: 5, titulo: "Aprovar", texto: "Aprova o desconto." },
        ],
      },
      {
        titulo: "Configuração da alçada",
        papel: "gestor",
        print: { chave: "pc-desc-config", legenda: "As faixas de aprovação de desconto.", papel: "gestor" },
        itens: [
          { n: 1, titulo: "Alçada ativada", texto: "Desligada = todo desconto é aprovado automaticamente." },
          { n: 2, titulo: "Faixa", texto: "De (%) e Até (%) do desconto. “Até” vazio significa sem limite." },
          { n: 3, titulo: "Aprovado por", texto: "Automático (sem aprovação), Gestor (superior) ou CEO." },
          { n: 4, titulo: "+ Faixa", texto: "Acrescenta uma faixa nova no fim." },
          { n: 5, titulo: "Remover", texto: "Tira a faixa da lista." },
          { n: 6, titulo: "Salvar configuração", texto: "Nada muda até salvar. A regra nova vale para os próximos pedidos." },
        ],
      },
      {
        titulo: "Fila de fabricação",
        print: { chave: "pc-fab-fila", legenda: "Vendas com prazo curto aguardando liberação." },
        itens: [
          { n: 1, titulo: "Fabricação", texto: "Abre a fila de fabricação." },
          { n: 2, titulo: "Abaixo do mínimo", texto: "Mostra todas as vendas com prazo menor que o mínimo, já decididas ou não." },
          { n: 3, titulo: "Entrega", texto: "A data de entrega combinada com o cliente." },
          { n: 4, titulo: "PPF e PPE", texto: "Prazo para fabricar e prazo para expedir, calculados a partir da entrega." },
          { n: 5, titulo: "Dias úteis", texto: "Quantos dias úteis sobram para fabricar. Em vermelho quando está abaixo do mínimo." },
          { n: 6, titulo: "Liberar / Recusar", texto: "Libera ou recusa a fabricação. Clique na linha para decidir com observação (botão “Liberar fabricação”)." },
        ],
      },
      {
        titulo: "Regras de prazo",
        papel: "gestor",
        print: { chave: "pc-fab-config", legenda: "As regras de prazo de fabricação.", papel: "gestor" },
        itens: [
          { n: 1, titulo: "Alçada de fabricação ativada", texto: "Desligada = venda com prazo curto só fica sinalizada e é liberada sozinha." },
          { n: 2, titulo: "Mínimo de dias úteis", texto: "Abaixo disso, a venda precisa de liberação." },
          { n: 3, titulo: "Offset do PPE", texto: "Quantos dias úteis depois da fabricação a carga deve sair." },
          { n: 4, titulo: "Salvar configuração", texto: "Grava as regras." },
        ],
      },
    ],
  },

  // ── Tabela de preços ────────────────────────────────────────────────────────
  {
    id: "precos",
    titulo: "Tabela de preços",
    rota: "/tabela-de-precos",
    resumo:
      "O preço de cada produto final e das faixas por tipo de cliente (PDV e Microdistribuidor). O Vender usa estes valores: o vendedor não digita preço. Aqui também se escolhe o que aparece na lista de produtos do Vender.",
    regras: {
      colaborador: SO_GESTOR,
      gestor: [
        "Define e altera o preço dos produtos e das faixas.",
        "Cria a faixa de preço de um produto e liga ou desliga o produto na lista do Vender.",
      ],
    },
    blocos: [
      {
        titulo: "Faixa de preço e bonificação",
        texto:
          "Faixa (PDV, Microdistribuidor) é o mesmo produto com outro preço cheio na nota fiscal, para quem revende ou compra em volume. Não é desconto: a nota sai com o preço da faixa. Bonificação é o brinde: escolhida no Vender, a linha sai com 100% de desconto. Nos dois casos o estoque baixa do produto principal.",
      },
      {
        print: { chave: "pc-precos", legenda: "A Tabela de preços." },
        itens: [
          { n: 1, titulo: "Buscar", texto: "Por nome ou código. A busca traz o produto com as faixas e a bonificação dele." },
          { n: 2, titulo: "Resumo", texto: "Quantos produtos há, quantos estão sem preço e quantas linhas aparecem hoje na lista de produtos do Vender." },
          { n: 3, titulo: "Produto", texto: "O produto principal, com o código. Abaixo dele, recuadas, as faixas e a bonificação." },
          { n: 4, titulo: "Faixa", texto: "A etiqueta diz de qual faixa é o preço (PDV, Microdistribuidor)." },
          { n: 5, titulo: "Sem preço", texto: "Faixa criada e ainda sem preço não aparece para venda. Preencha o preço e salve." },
          { n: 6, titulo: "Bonificação", texto: "O brinde do produto." },
          { n: 7, titulo: "Espelha o pai", texto: "O preço da bonificação é sempre o do produto principal; não se edita aqui. Ele aparece no orçamento riscado, para o cliente ver o tamanho do brinde." },
          { n: 8, titulo: "Preço fixo", texto: "Digite o novo preço. Enter também salva." },
          { n: 9, titulo: "No /vender", texto: "Ligado = aparece na lista de produtos do Vender. Desligar só tira da lista: o produto continua no estoque e na produção, e um orçamento antigo com ele continua abrindo." },
          { n: 10, titulo: "Atualizado", texto: "Quem mudou o preço por último e quando. “nunca definido” = ainda sem preço." },
          { n: 11, titulo: "Salvar", texto: "Fica ativo quando o preço da linha foi alterado." },
          { n: 12, titulo: "Criar faixa", texto: "Cria a faixa que o produto ainda não tem. Ela nasce sem preço: defina o preço logo em seguida." },
          { n: 13, titulo: "Linha apagada", texto: "Produto desligado do Vender aparece mais claro." },
        ],
      },
    ],
  },
];
