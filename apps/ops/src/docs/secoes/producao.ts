import type { Secao } from "../tipos";

// Produção: Dashboard de Produção, Ordens de Produção e MRP (Produtos, SKUs,
// Lotes e Fornecedores). ⚠️ O `n` de cada item é o marcador do print
// (docs-prints/shots_producao.mjs).
//
// ⚠️ Estas telas ainda NÃO separam gestor de colaborador (`canManage = true`
// nas páginas): todos que entram no Ops veem e fazem o mesmo. Se isso mudar,
// as `regras` abaixo mudam junto.

const IGUAL = "Vê e faz o mesmo que o colaborador: esta tela ainda não muda para o gestor.";

export const SECOES_PRODUCAO: Secao[] = [
  // ── Dashboard de Produção ───────────────────────────────────────────────────
  {
    id: "producao-dashboard",
    titulo: "Dashboard de Produção",
    rota: "/producao/dashboard",
    resumo:
      "Um resumo da fábrica em uma tela: quantas ordens de produção (OP) estão andando, quantas terminaram, como vão os checklists da operação e o que foi criado e concluído na última semana. É só para olhar — para mexer numa OP, use Ordens de Produção.",
    regras: {
      colaborador: ["Vê os números de toda a fábrica, não só os seus.", "Não altera nada por aqui: a tela é só de leitura."],
      gestor: [IGUAL],
    },
    blocos: [
      {
        print: { chave: "prod-dashboard", legenda: "Dashboard de Produção." },
        itens: [
          { n: 1, titulo: "OP Ativas", texto: "Ordens que ainda não foram concluídas nem canceladas. Embaixo, quantas já foram concluídas do total de OPs." },
          { n: 2, titulo: "OPs Concluídas", texto: "Ordens que já terminaram (confirmadas ou concluídas)." },
          { n: 3, titulo: "Taxa de Conclusão", texto: "Quantos checklists da operação estão completos, de todos os que existem, em porcentagem." },
          { n: 4, titulo: "Etapas Pendentes", texto: "Itens ainda não marcados dentro dos checklists que estão abertos." },
          { n: 5, titulo: "Últimos 7 dias", texto: "Quantas OPs foram criadas (azul) e quantas foram concluídas (verde) em cada dia da última semana. Criar muito mais do que concluir, vários dias seguidos, é fila crescendo." },
          { n: 6, titulo: "OPs por Status", texto: "Como as OPs estão divididas agora entre as etapas. Passe o mouse numa fatia para ver a quantidade." },
          { n: 7, titulo: "Checklists Recentes", texto: "Os últimos checklists atualizados, com o setor, quantos itens já foram feitos e se está concluído ou em andamento." },
        ],
      },
    ],
  },

  // ── Ordens de Produção ──────────────────────────────────────────────────────
  {
    id: "producao-ordens",
    titulo: "Ordens de Produção",
    rota: "/producao/ordens",
    resumo:
      "Aqui a fábrica acompanha cada ordem de produção (OP), da entrada do pedido até a conclusão. Cada OP diz o que produzir, quanto e até quando. Mover a OP de etapa mexe no estoque do Hub Natal: ao separar, os insumos saem; ao concluir, o produto pronto entra. A tela é compartilhada e muda ao vivo quando alguém move um cartão.",
    regras: {
      colaborador: [
        "Vê todas as OPs da fábrica.",
        "Cria, edita, move de etapa, confirma, conclui e exclui OP.",
        "A quantidade de uma OP que veio de venda não pode ser mudada aqui: ela segue o pedido.",
      ],
      gestor: [IGUAL],
    },
    blocos: [
      {
        titulo: "De onde vem a OP",
        itens: [
          { titulo: "Da venda", texto: "Quando uma venda precisa ser produzida, a OP nasce sozinha em “Pedidos”, com o cliente e a quantidade do pedido." },
          { titulo: "Da recorrência", texto: "Parcelas de vendas recorrentes aparecem na primeira coluna do quadro e viram OP sozinhas quando o mês delas chega." },
          { titulo: "À mão", texto: "“Nova OP” ou “Criar OP” na Reposição sugerida, por exemplo para repor estoque. Ela já nasce em “Planejada”." },
        ],
      },
      {
        titulo: "O topo da tela",
        print: { chave: "op-topo", legenda: "Ordens de Produção: números, filtros e avisos." },
        itens: [
          { n: 1, titulo: "Kanban ou Lista", texto: "Troca entre o quadro de colunas e a tabela. A tela lembra a sua escolha. No celular, ela abre na Lista." },
          { n: 2, titulo: "Nova OP", texto: "Cria uma OP à mão. Veja “Criar uma OP”, abaixo." },
          { n: 3, titulo: "OPs Abertas", texto: "Todas as OPs que ainda não foram concluídas nem canceladas." },
          { n: 4, titulo: "Prontas p/ Separar", texto: "OPs que ainda não começaram e que têm todo o insumo no Hub Natal. A conta segue a fila (prazo mais próximo primeiro): se duas OPs disputam o mesmo insumo e só dá para uma, só a primeira conta como pronta." },
          { n: 5, titulo: "Atrasadas", texto: "OPs abertas com a data de necessidade já vencida." },
          { n: 6, titulo: "A Produzir", texto: "A soma das quantidades planejadas das OPs abertas." },
          { n: 7, titulo: "Rendimento Médio", texto: "De tudo que foi produzido, quanto saiu bom (aprovado). OP grande pesa mais que OP pequena; canceladas não entram." },
          { n: 8, titulo: "Perdas Totais", texto: "Unidades de produto refugadas. Clique para ver também as perdas de insumo (veja “Perdas”, abaixo)." },
          { n: 9, titulo: "Buscar", texto: "Procura pelo número da OP, código ou nome do produto." },
          { n: 10, titulo: "Status", texto: "Mostra só as OPs de um status." },
          { n: 11, titulo: "Prioridade", texto: "Mostra só as OPs de uma prioridade (Urgente, Alta, Normal, Baixa, Planejado). Busca e filtros ficam no endereço da página: dá para mandar o link já filtrado." },
          { n: 12, titulo: "Insumo em falta travando produção", texto: "Insumo que está zerado no Hub Natal e é usado por dois ou mais produtos. Um só desses trava várias produções — é o primeiro a comprar." },
          { n: 13, titulo: "Reposição sugerida", texto: "Abre ou fecha a lista de produtos com estoque baixo no Hub Natal (no mínimo ou até 25% acima dele). Começa fechada e lembra a sua escolha. Ao lado, quantos estão no ponto de reposição e quantos já estão abaixo do mínimo." },
          { n: 14, titulo: "Só críticos", texto: "Mostra só os que já estão abaixo do mínimo." },
          { n: 15, titulo: "Criar OP", texto: "Abre a Nova OP já com o produto escolhido e a fonte “Safety Stock”. A tela diz quanto falta para o mínimo, mas a quantidade a produzir é decisão da fábrica." },
          { n: 16, titulo: "Rota recomendada", texto: "Para produto que usa o envasado: “dá pra só rotular” quando há envasado pronto em estoque, ou “produzir do zero” quando não há. Se o envasado também está baixo, a tela avisa para produzi-lo antes." },
          { n: 17, titulo: "OP em andamento", texto: "O produto já tem uma OP aberta: não precisa criar outra. Esses ficam no fim da lista. OP bloqueada não conta." },
        ],
      },
      {
        titulo: "O quadro",
        print: { chave: "op-quadro", legenda: "O quadro de OPs, da recorrência até o envase." },
        itens: [
          { n: 1, titulo: "Pedidos de Recorrência", texto: "Parcelas de vendas recorrentes que ainda não chegaram. Mostram o mês, o que produzir, o cliente, a parcela (2/6) e o valor. Servem para planejar insumo do que já está vendido." },
          { n: 2, titulo: "Vira OP sozinho", texto: "Esta coluna é só de leitura: não dá para arrastar nada para ela nem a partir dela. A OP nasce quando o mês da parcela chega." },
          { n: 3, titulo: "Pedidos", texto: "OPs que acabaram de chegar (de venda, por exemplo). O número ao lado é a quantidade de OPs na coluna." },
          { n: 4, titulo: "+ em Planejada", texto: "Atalho para criar uma OP nova." },
          { n: 5, titulo: "Cartão da OP", texto: "Uma OP. Arraste para outra coluna para mudar de etapa, ou use o seletor no pé do cartão. Clique no cartão para ver os detalhes. Veja “Lendo o cartão”." },
          { n: 6, titulo: "Separação", texto: "Os insumos foram separados e já saíram do estoque do Hub Natal." },
          { n: 7, titulo: "Envase", texto: "O produto está sendo envasado." },
        ],
      },
      {
        print: { chave: "op-quadro-fim", legenda: "O fim do quadro (role para a direita)." },
        itens: [
          { n: 1, titulo: "Rotulagem", texto: "O produto está sendo rotulado." },
          { n: 2, titulo: "Qualidade", texto: "Produção feita, aguardando conferência e confirmação." },
          { n: 3, titulo: "Concluída", texto: "OP terminada: o produto bom já entrou no estoque do Hub Natal. Mostra as 12 mais recentes; o resto fica em “+N mais — ver na Lista”." },
          { n: 4, titulo: "Bloqueada", texto: "OP travada ou cancelada. Também mostra só as 12 mais recentes." },
          { titulo: "Etapa que a OP pula", texto: "O envasado (semi-acabado) não passa por Rotulagem, e a OP de “só rotular” não passa por Envase. No seletor do cartão essa etapa aparece como “(pula)” e não pode ser escolhida. No arraste a coluna fica apagada; soltar lá mesmo assim abre um aviso pedindo confirmação." },
        ],
      },
      {
        titulo: "Lendo o cartão",
        print: { chave: "op-card", legenda: "Um cartão de OP, de perto." },
        itens: [
          { n: 1, titulo: "Número da OP", texto: "Gerado sozinho." },
          { n: 2, titulo: "Prioridade", texto: "Urgente, Alta, Normal, Baixa ou Planejado. OP Urgente ou Alta ganha borda vermelha." },
          { n: 3, titulo: "Produto", texto: "O que vai ser produzido." },
          { n: 4, titulo: "Cliente", texto: "Quem comprou, quando a OP vem de venda ou recorrência. Nas OPs internas aparece a fonte e a data de criação (“PCP Manual · 25/10/2026”)." },
          { n: 5, titulo: "Quantidade e fonte", texto: "Quantas unidades e de onde veio a demanda: Venda, Recorrência, Safety Stock (repor estoque), PCP Manual ou Pós-venda." },
          { n: 6, titulo: "Prazo", texto: "A data de necessidade. Fica vermelho com “vencido” quando passou e a OP ainda está aberta." },
          { n: 7, titulo: "Parado há", texto: "Há quanto tempo a OP está nesta etapa e quem a moveu por último." },
          { n: 8, titulo: "Selos", texto: "“pronto”: tem insumo para separar agora. “falta insumo”: não tem. “sem ficha”: o produto não tem ficha técnica e a tela não sabe o que ele consome. “Rotular” ou “Do zero”: a rota escolhida na separação. Os três primeiros só aparecem antes da separação." },
          { n: 9, titulo: "Seletor de etapa", texto: "Muda a OP de etapa, para frente ou para trás, sem precisar arrastar." },
        ],
      },
      {
        titulo: "Criar uma OP",
        print: { chave: "op-nova", legenda: "Nova Ordem de Produção, com a conferência de insumos." },
        itens: [
          { n: 1, titulo: "Produto Final", texto: "O que produzir. Entram os produtos finais e os semi-acabados (por exemplo, envasar sem rotular para estoque). “(sem ficha)” avisa que aquele produto não tem ficha técnica." },
          { n: 2, titulo: "Quantidade Planejada", texto: "Quantas unidades produzir." },
          { n: 3, titulo: "Conferência de insumos", texto: "Assim que produto e quantidade estão preenchidos, a tela confere a ficha técnica contra o estoque do Hub Natal, insumo por insumo: “ok” ou “falta N”. O triângulo marca insumo crítico. Faltar insumo não impede criar a OP." },
          { n: 4, titulo: "Prioridade", texto: "Começa em Normal." },
          { n: 5, titulo: "Fonte de Demanda", texto: "Por que esta OP existe. Opcional." },
          { n: 6, titulo: "Cliente / Empresa", texto: "Obrigatório quando a fonte é Venda ou Recorrência — é o que identifica o cartão. Nas outras, o cartão mostra a fonte e a data." },
          { n: 7, titulo: "Data de Necessidade", texto: "Até quando precisa estar pronta. É ela que ordena a fila e define o que está atrasado." },
          { n: 8, titulo: "Observações", texto: "Texto livre sobre a OP." },
          { n: 9, titulo: "Criar OP", texto: "Grava. A OP nasce em “Planejada”." },
        ],
      },
      {
        titulo: "Detalhes e edição",
        print: { chave: "op-detalhe", legenda: "Editar Ordem de Produção (clique no cartão)." },
        itens: [
          { titulo: "Abrir", texto: "Clique no corpo do cartão (no quadro) ou no lápis (na Lista). Os mesmos campos da criação podem ser mudados, inclusive o produto — útil para OP que chegou da venda com o produto só em texto." },
          { n: 1, titulo: "Quantidade travada", texto: "Na OP que veio de um pedido de venda, a quantidade e o cliente seguem o pedido e não podem ser mudados aqui." },
          { n: 2, titulo: "Histórico de movimentações", texto: "Cada mudança de etapa: de onde, para onde, quem moveu e quando." },
          { n: 3, titulo: "Salvar", texto: "Grava as alterações." },
        ],
      },
      {
        titulo: "Separar materiais",
        texto: "Mover a OP para Separação abre esta confirmação. Ao confirmar, os insumos saem do estoque do Hub Natal.",
        print: { chave: "op-separar", legenda: "Mover para Separação: a escolha da rota e a baixa dos insumos." },
        itens: [
          { n: 1, titulo: "De → Para", texto: "A etapa atual e a etapa de destino." },
          { n: 2, titulo: "Só rotular", texto: "Usa o envasado que já está pronto no estoque e só põe o rótulo. Mostra quanto envasado existe." },
          { n: 3, titulo: "Produzir do zero", texto: "Fabrica o envasado agora (frasco, líquido, tampa) e rotula. A escolha da rota só aparece para produtos que usam o envasado, e é obrigatória para eles." },
          { n: 4, titulo: "O que vai sair do estoque", texto: "Cada insumo, quanto precisa e quanto há no Hub Natal. Verde: dá para separar tudo. Vermelho: faltam itens." },
          { n: 5, titulo: "Separar", texto: "Confirma e dá baixa nos insumos. Se faltar algum, o botão vira “Separar mesmo assim”: dá para seguir, e o saldo daquele insumo fica negativo — é o aviso de que a contagem está atrás. Se a unidade de algum insumo não bate com a do estoque (ml contra unidade, por exemplo), a separação é recusada até a ficha ser corrigida." },
          { titulo: "Voltar ou cancelar devolve", texto: "Levar a OP de volta para Pedidos ou Planejada, cancelar ou excluir devolve ao estoque exatamente o que tinha saído." },
          { titulo: "Alguém já moveu", texto: "Se outra pessoa mudou a OP de etapa enquanto você confirmava, a tela avisa e atualiza o quadro em vez de sobrescrever." },
        ],
      },
      {
        titulo: "Concluir a produção",
        texto: "Mover a OP para Concluída abre esta confirmação. Ao confirmar, o produto bom entra no estoque do Hub Natal.",
        print: { chave: "op-concluir", legenda: "Concluir produção: boas, refugo e insumos usados." },
        itens: [
          { n: 1, titulo: "Boas (aprovadas)", texto: "Quantas unidades saíram boas. Começa com a quantidade planejada." },
          { n: 2, titulo: "Refugo (perdas)", texto: "Quantas unidades foram perdidas. Se boas + refugo não der o planejado, a tela avisa (mas deixa seguir)." },
          { n: 3, titulo: "O que entra no estoque", texto: "Só as boas entram no Hub Natal. O refugo vai para Perdas Totais." },
          { n: 4, titulo: "Insumos usados", texto: "Quanto de cada insumo foi usado de verdade. O previsto é a ficha × as boas. Usou mais que o previsto? A diferença aparece em vermelho como perda e vai para Perdas Totais. Se não mudar nada, vale o previsto." },
          { n: 5, titulo: "Concluir", texto: "Grava a conclusão e ajusta o estoque. Se a OP é de uma venda e saiu menos que o pedido, a tela avisa que pode faltar produto no envio. O cartão do pedido no Rastreio não anda sozinho: alguém confere e move." },
          { titulo: "Reabrir uma concluída", texto: "Tirar uma OP de Concluída desfaz a entrada do produto no estoque, para que concluir de novo não conte duas vezes." },
        ],
      },
      {
        titulo: "A Lista",
        print: { chave: "op-lista", legenda: "Ordens de Produção, visão Lista." },
        itens: [
          { n: 1, titulo: "Colunas", texto: "Número da OP, produto, quantidade (e boas/rejeitadas quando já houver), prioridade, status, fonte e data de necessidade. Busca e filtros do topo valem aqui também." },
          { n: 2, titulo: "Confirmar Produção", texto: "Só aparece nas OPs aguardando confirmação. Registra boas, rejeitadas, o motivo da rejeição e desvios, e passa a OP para Confirmada. Não mexe no estoque — o estoque só muda na separação e na conclusão." },
          { n: 3, titulo: "Editar", texto: "Abre os detalhes da OP." },
          { n: 4, titulo: "Excluir", texto: "Apaga a OP de vez, depois de confirmar. Antes de apagar, o que ela tinha tirado do estoque volta." },
        ],
      },
      {
        titulo: "Perdas",
        print: { chave: "op-perdas", legenda: "Perdas (clique em Perdas Totais)." },
        itens: [
          { n: 1, titulo: "Refugo de produto", texto: "O total de unidades de produto perdidas nas OPs." },
          { n: 2, titulo: "Perda por insumo", texto: "Cada insumo que foi usado além do previsto na conclusão: em quantas OPs, quanto foi usado contra o previsto, a perda e a porcentagem. Os que mais se perdem vêm primeiro." },
        ],
      },
    ],
  },

  // ── MRP ─────────────────────────────────────────────────────────────────────
  {
    id: "mrp",
    titulo: "MRP",
    rota: "/producao/mrp",
    resumo:
      "O cadastro da fábrica: os produtos e insumos com o estoque de cada hub, a ficha técnica (o que cada produto consome), os SKUs, os lotes de reagente e os fornecedores. São quatro abas no topo; cada uma tem endereço próprio, então o link e o F5 voltam na mesma aba.",
    regras: {
      colaborador: ["Vê e edita todo o cadastro: produtos, ficha técnica, SKUs, lotes e fornecedores."],
      gestor: [IGUAL],
    },
    blocos: [
      {
        titulo: "Produtos",
        print: { chave: "mrp-produtos", legenda: "MRP, aba Produtos." },
        itens: [
          { n: 1, titulo: "Abas do MRP", texto: "Produtos, SKUs, Lotes e Fornecedores." },
          { n: 2, titulo: "Novo Produto", texto: "Cadastra um produto ou insumo: nome, código, categoria, unidade, estoque de segurança, custo unitário, em quais hubs ele existe e observações." },
          { n: 3, titulo: "Insumos / SKUs ou BOM Lists", texto: "A lista de produtos, ou a lista dos produtos que têm ficha técnica (produtos finais e semi-acabados), cada um com “Ver / Editar BOM”." },
          { n: 4, titulo: "Buscar", texto: "Procura pelo código ou nome." },
          { n: 5, titulo: "Categorias", texto: "Filtra por Produto Final, Semi-acabado, Insumos, Embalagem, Carbonatação ou Trade Marketing." },
          { n: 6, titulo: "Abrir a ficha técnica", texto: "Nos produtos finais e semi-acabados o nome é um link: abre a ficha técnica (BOM). Veja abaixo." },
          { n: 7, titulo: "Sem BOM", texto: "Produto final sem ficha técnica. Sem ficha, a produção não sabe o que ele consome: nada sai do estoque na separação e a OP fica “sem ficha”." },
          { n: 8, titulo: "Estoque Total", texto: "A soma do saldo em todos os hubs. Ao lado, o estoque de segurança, que é só referência — o mínimo de cada hub, que dispara a Reposição sugerida, é definido em Suprimentos." },
          { n: 9, titulo: "Status", texto: "“Baixo”: o total está abaixo do estoque de segurança. “Risco em HUB”: algum hub está zerado. “OK”: nenhum dos dois." },
          { n: 10, titulo: "Hubs", texto: "O saldo de cada hub (HUB-RN = Hub Natal, HUB-SP = CD SP). Zero aparece em vermelho." },
          { n: 11, titulo: "Editar e excluir", texto: "O lápis abre o cadastro. A lixeira só apaga produto sem estoque, sem OP e que não é usado na ficha de outro; se houver vínculo, a tela oferece “Desativar” em vez de apagar." },
          { titulo: "O que não aparece aqui", texto: "As linhas de bonificação (“CarboZé 100ml - bonificação”) e de faixa de preço (“- PDV”, “- Microdistribuidor”) são só para a venda e a nota: o produto físico é o mesmo, e o estoque é o do produto principal." },
        ],
      },
      {
        titulo: "Ficha técnica (BOM)",
        print: { chave: "mrp-bom", legenda: "Ficha técnica de um produto que usa o envasado." },
        itens: [
          { n: 1, titulo: "Adicionar um insumo", texto: "Escolha o insumo, a quantidade por unidade produzida e a unidade. Pode cadastrar em outra unidade da mesma medida (100 ml de um insumo estocado em litros): a produção converte sozinha." },
          { n: 2, titulo: "Crítico", texto: "Marca o insumo como essencial. Ele ganha o triângulo nas conferências de estoque." },
          { n: 3, titulo: "Adicionar insumo", texto: "Grava a linha. A tela recusa insumo repetido e insumo que criaria um laço (o insumo depender do próprio produto)." },
          { n: 4, titulo: "A ficha", texto: "O que uma unidade do produto consome, com o custo de cada linha (“sem custo” quando o insumo não tem custo cadastrado)." },
          { n: 5, titulo: "Custo total", texto: "O custo de uma unidade, somando as linhas. Avisa quantos insumos estão sem custo." },
          { n: 6, titulo: "Do zero", texto: "Para produto que usa o envasado: a receita montada a partir dos insumos crus, calculada da ficha do envasado. É só leitura." },
          { n: 7, titulo: "Editar e remover linha", texto: "Muda a quantidade, a unidade ou o crítico de uma linha, ou tira o insumo da ficha." },
        ],
      },
      {
        titulo: "SKUs",
        print: { chave: "mrp-skus", legenda: "MRP, aba SKUs." },
        itens: [
          { n: 1, titulo: "Atualizar", texto: "Relê a lista." },
          { n: 2, titulo: "Novo SKU", texto: "Cadastra um SKU: código, nome, descrição, categoria (Produto Final ou Reagente), status, volume, unidade, estoque de segurança e cobertura alvo em dias." },
          { n: 3, titulo: "Números", texto: "Total de SKUs, ativos e inativos." },
          { n: 4, titulo: "Buscar", texto: "Procura pelo código ou nome." },
          { n: 5, titulo: "Categoria", texto: "Filtra Produto Final ou Reagente." },
          { n: 6, titulo: "BOM", texto: "A versão da ficha técnica ativa do SKU (v3, por exemplo). “---” quando não há." },
          { n: 7, titulo: "Status", texto: "Ativo ou Inativo." },
          { n: 8, titulo: "Editar e excluir", texto: "Clicar na linha ou no lápis abre o cadastro. A lixeira apaga o SKU de vez, depois de confirmar." },
        ],
      },
      {
        titulo: "Lotes",
        print: { chave: "mrp-lotes", legenda: "MRP, aba Lotes." },
        itens: [
          { n: 1, titulo: "Novo Lote", texto: "Registra um lote de reagente: produto, volume inicial (ml), amostras esperadas, fornecedor, datas de recebimento e validade, e observações. O código do lote é gerado sozinho." },
          { n: 2, titulo: "Números", texto: "Total de lotes, em quarentena, aprovados e bloqueados (bloqueados + reprovados)." },
          { n: 3, titulo: "Status", texto: "Filtra pelo status: Criado, Recebido, Em Quarentena, Amostrado, Aprovado, Bloqueado, Reprovado ou Encerrado. Busca e filtro ficam no endereço da página." },
          { n: 4, titulo: "Volume", texto: "Quanto ainda há do lote, do volume inicial. A barra fica amarela abaixo de 50% e vermelha abaixo de 20%." },
          { n: 5, titulo: "Status do lote", texto: "Em que ponto da qualidade o lote está." },
          { n: 6, titulo: "Amostras", texto: "Amostras coletadas de quantas são esperadas." },
          { n: 7, titulo: "Editar e excluir", texto: "O lápis abre o cadastro do lote; a lixeira apaga de vez, depois de confirmar." },
        ],
      },
      {
        titulo: "Fornecedores",
        print: { chave: "mrp-fornecedores", legenda: "MRP, aba Fornecedores." },
        itens: [
          { n: 1, titulo: "Novo Fornecedor", texto: "Cadastra nome, CNPJ, contato, e-mail, telefone e observações." },
          { n: 2, titulo: "Buscar", texto: "Procura por CNPJ, razão social ou nome fantasia." },
          { n: 3, titulo: "Status", texto: "Ativo ou Inativo." },
          { n: 4, titulo: "Editar", texto: "Abre o cadastro do fornecedor." },
        ],
      },
    ],
  },
];
