import type { Secao } from "../tipos";

// ─────────────────────────────────────────────────────────────────────────────
// Documentação do Carbo Finanças — seção Suprimentos do menu: Compras (as quatro
// etapas: requisição → ordem de compra → recebimento → NF do fornecedor) e
// Suprimentos (estoque de insumos, movimentações, planejamento e política).
//
// ⚠️ O `n` de cada item é o MESMO marcador do print (`chave`), medido pelo
// harness (docs-prints/shots_compras.mjs). Mudou a tela: refaça o print.
// ─────────────────────────────────────────────────────────────────────────────

export const SECOES_COMPRAS: Secao[] = [
  // ── Compras ─────────────────────────────────────────────────────────────────
  {
    id: "compras",
    titulo: "Compras",
    rota: "/compras/requisicoes",
    resumo:
      "O caminho de uma compra, do pedido de quem precisa até a conta a pagar: requisição (RC) → aprovação → ordem de compra (OC) → registro da compra → recebimento → NF do fornecedor. Cada etapa é uma aba, e o número amarelo na aba é o que está esperando nela.",
    regras: {
      colaborador: [
        "Abre requisição para si ou em nome de outra pessoa, salva rascunho, cota e envia para aprovação.",
        "Cancela as próprias requisições enquanto não viraram OC.",
        "Gera a OC de uma requisição aprovada, registra a compra, confere o recebimento e lança a NF.",
      ],
      gestor: [
        "Aprova ou rejeita requisições — de qualquer pessoa, menos as próprias (essas vão para outro gestor).",
        "Na visão “Precisa de ação”, vê as requisições de todos que esperam aprovação ou que já podem virar OC.",
        "Cancela qualquer requisição antes de virar OC, e cancela OC gerada ou com compra registrada.",
      ],
    },
    blocos: [
      {
        titulo: "O passo a passo de uma compra",
        itens: [
          { titulo: "1. Requisição", texto: "Quem precisa abre a RC em Compras → Requisições → “Nova requisição”, com os itens e o valor estimado, e envia para aprovação (ou salva como rascunho para terminar depois)." },
          { titulo: "2. Cotação", texto: "Na RC aberta, cada item recebe as cotações dos fornecedores (“+ Cotação”), e uma delas é marcada como “Escolhida”. Dá para cotar no rascunho e enquanto a RC espera aprovação." },
          { titulo: "3. Aprovação", texto: "Um gestor aprova ou rejeita. A rejeição sempre leva um motivo, que o solicitante lê na própria RC." },
          { titulo: "4. Ordem de compra", texto: "Na RC aprovada, “Gerar OC” cria a ordem com o fornecedor e o preço da cotação escolhida — uma OC por fornecedor. A RC passa a “Convertida em OC”." },
          { titulo: "5. Registrar a compra", texto: "Em Ordens de compra, “Registrar compra” diz se ela já foi paga (e como) ou se vai ser paga depois (e quando vence)." },
          { titulo: "6. Recebimento", texto: "Quando a mercadoria chega, a aba Recebimento confere item a item o que veio. Se veio a menos, a OC fica “Parcialmente recebida” e volta para a fila com o saldo." },
          { titulo: "7. NF do fornecedor", texto: "A aba NF de compra lança a nota com as parcelas. Ao lançar, as parcelas viram contas em Contas a pagar — a não ser que a compra já tenha sido paga no registro." },
        ],
      },

      // Requisições
      {
        titulo: "Requisições",
        print: { chave: "compras-rc-lista", legenda: "A aba Requisições, na visão “Precisa de ação”." },
        itens: [
          { n: 1, titulo: "Etapas", texto: "Requisições, Ordens de compra, Recebimento e NF de compra. O número amarelo é a fila de cada uma: RCs aguardando aprovação, OCs geradas sem compra registrada, OCs esperando recebimento. Cada aba é um link: com o botão do meio do mouse abre em outra guia." },
          { n: 2, titulo: "Nova requisição", texto: "Abre o formulário logo acima da lista. Só aparece nesta aba." },
          { n: 3, titulo: "Precisa de ação / Todas", texto: "“Precisa de ação” mostra as suas RCs em rascunho, aguardando, aprovadas (prontas para virar OC) e rejeitadas. Para o gestor, entram também as de todo mundo que aguardam aprovação ou já estão aprovadas. “Todas” mostra o histórico inteiro." },
          { n: 4, titulo: "Busca", texto: "Procura pelo número da RC, pelo solicitante, pelo centro de custo ou pelo fornecedor sugerido. Acentos não importam." },
          { n: 5, titulo: "Filtros", texto: "Status, tipo de compra (Estoque, Uso Direto, Investimento), setor de quem pediu e escopo (do setor ou individual). Escolher um status mostra todas daquele status, de qualquer pessoa. Os filtros ficam no endereço da página." },
          { n: 6, titulo: "Uma requisição", texto: "Clique em qualquer ponto da linha para abrir o detalhe. A linha mostra o solicitante e o setor dele, o tipo (com as etiquetas Setor/Individual e de prioridade Alta ou Crítica), o valor estimado e o prazo em que o item é necessário." },
          { n: 7, titulo: "Status", texto: "Rascunho · Aguardando Aprovação · Aprovada · Rejeitada · Cancelada · Convertida em OC. Na aprovada aparece o botão “Gerar OC” no fim da linha." },
        ],
      },
      {
        titulo: "Nova requisição: os campos",
        print: { chave: "rc-form", legenda: "O formulário da nova requisição, preenchido." },
        itens: [
          { n: 1, titulo: "Solicitante", texto: "De quem é a necessidade. O padrão é você. Para abrir em nome de outra pessoa, escolha o nome dela: a faixa fica âmbar e avisa que a RC sai no nome dela, com registro de que foi você quem lançou." },
          { n: 2, titulo: "Centro de Custo *", texto: "A área que vai pagar a compra (Operações, Produção, Logística, Administrativo…). Obrigatório." },
          { n: 3, titulo: "Tipo de Compra", texto: "Estoque (reposição de insumo, para não faltar), Uso Direto (material do dia a dia) ou Investimento (equipamento, bem durável). O padrão é Uso Direto." },
          { n: 4, titulo: "Fornecedor Sugerido", texto: "Opcional. A lista vem do cadastro de Fornecedores (só os ativos). Quem decide o fornecedor de verdade é a cotação escolhida." },
          { n: 5, titulo: "Justificativa *", texto: "Por que a compra é necessária. Obrigatória — é o que o gestor lê para decidir." },
          { n: 6, titulo: "Impacto Operacional", texto: "Opcional: o que acontece se a compra não for aprovada (ex.: “o envase para em 10 dias”)." },
          { n: 7, titulo: "Itens da Requisição", texto: "Uma linha por item: descrição (obrigatória), quantidade, unidade (un, kg, L, cx, pct…) e valor unitário estimado. “Adicionar Item” acrescenta uma linha; a lixeira tira." },
          { n: 8, titulo: "Valor Estimado", texto: "Soma de quantidade × valor unitário de todos os itens. É calculado sozinho." },
          { n: 9, titulo: "Salvar Rascunho", texto: "Guarda a RC sem mandar para ninguém. Pode ficar sem valor. Ela aparece na sua lista como Rascunho para você cotar e enviar depois." },
          { n: 10, titulo: "Enviar para Aprovação", texto: "Manda direto para os gestores. Exige o valor estimado maior que zero." },
        ],
      },
      {
        titulo: "Antes de enviar a requisição, confira",
        itens: [
          { titulo: "Solicitante", texto: "É a pessoa que precisa do item? Se você está lançando por alguém, escolha o nome dela — é por ele que a RC é filtrada por setor." },
          { titulo: "Centro de custo e tipo", texto: "O centro de custo é o da área que usa o item, e o tipo diz se ele vai para o estoque, para o uso do dia a dia ou se é um bem durável." },
          { titulo: "Itens", texto: "Cada item com descrição clara (o que é, medida, cor, modelo), quantidade e unidade certas. Uma descrição que o comprador entende sem perguntar é a que vira a OC sem retrabalho." },
          { titulo: "Valor", texto: "O valor unitário estimado preenchido em todos os itens, para o Valor Estimado não sair zerado ou baixo demais." },
          { titulo: "Justificativa", texto: "Diz o porquê e, se houver, até quando o item é necessário." },
        ],
      },
      {
        titulo: "O detalhe da requisição",
        print: { chave: "rc-detalhe", legenda: "Uma requisição em rascunho aberta pelo solicitante." },
        itens: [
          { n: 1, titulo: "Dados", texto: "Solicitante (e quem registrou, quando foi outra pessoa), setor, escopo, motivo, prioridade, prazo, centro de custo, tipo, fornecedor sugerido e valor estimado. Embaixo, a justificativa e o impacto operacional." },
          { n: 2, titulo: "Itens", texto: "O que foi pedido, com quantidade, valor unitário e total de cada linha." },
          { n: 3, titulo: "Cotações por item", texto: "“+ Cotação” registra o preço de um fornecedor para aquele item. Dá para cotar enquanto a RC está em rascunho ou aguardando aprovação; depois disso as cotações ficam só para leitura." },
          { n: 4, titulo: "Cancelar requisição", texto: "Tira a RC do fluxo, com confirmação. Não dá para reabrir; as cotações ficam guardadas nela. Aparece para quem abriu a RC e para o gestor, até ela virar OC." },
          { n: 5, titulo: "Enviar para aprovação", texto: "No rascunho, manda a RC para os gestores. Exige valor estimado maior que zero." },
        ],
      },
      {
        titulo: "Registrar uma cotação",
        print: { chave: "rc-cotacao", legenda: "A cotação de um item, preenchida." },
        itens: [
          { n: 1, titulo: "Fornecedor *", texto: "Comece a digitar e escolha da lista do cadastro de Fornecedores, para o mesmo fornecedor não aparecer com dois nomes. Dá para digitar um nome novo." },
          { n: 2, titulo: "Preço unitário (R$)", texto: "O preço de UMA unidade. O total (preço × quantidade do item) aparece embaixo para conferir." },
          { n: 3, titulo: "Link", texto: "Opcional: o link da proposta ou do produto." },
          { n: 4, titulo: "Observação", texto: "Opcional: prazo de entrega, condição de pagamento, frete." },
          { n: 5, titulo: "Adicionar", texto: "Grava a cotação no item. Repita para cada fornecedor cotado." },
        ],
      },
      {
        titulo: "Aprovar ou rejeitar",
        papel: "gestor",
        print: { chave: "rc-aprovar", legenda: "Uma requisição aguardando aprovação, aberta pelo gestor.", papel: "gestor" },
        itens: [
          { n: 1, titulo: "Justificativa e impacto", texto: "O que quem pediu escreveu para justificar a compra." },
          { n: 2, titulo: "Menor preço", texto: "Quando um item tem mais de uma cotação, a mais barata ganha a etiqueta “menor preço”." },
          { n: 3, titulo: "Escolher", texto: "Marca qual cotação vale para o item (só uma por item; clicar na escolhida desmarca). É a escolhida que define o fornecedor e o preço da OC." },
          { n: 4, titulo: "Estimado · Cotado", texto: "O rodapé compara o valor estimado da RC com o total das cotações escolhidas, e avisa quantos itens ainda estão sem cotação escolhida." },
          { n: 5, titulo: "Rejeitar", texto: "Pede o motivo (obrigatório). O solicitante lê esse texto na RC rejeitada." },
          { n: 6, titulo: "Aprovar", texto: "Aprova com um clique. A RC fica “Aprovada” e pronta para virar OC." },
        ],
      },
      {
        titulo: "A requisição que é sua",
        papel: "gestor",
        texto: "O gestor não aprova a própria requisição: o rodapé avisa e os botões Aprovar e Rejeitar ficam desligados. Ela espera outro gestor.",
        print: { chave: "rc-propria", legenda: "Rodapé de uma requisição aberta pelo próprio gestor.", papel: "gestor" },
        itens: [
          { n: 1, titulo: "Aviso", texto: "“Esta requisição é sua — quem aprova é outro gestor.”" },
          { n: 2, titulo: "Aprovar desligado", texto: "Passe o mouse para ver o motivo." },
        ],
      },
      {
        titulo: "Gerar a ordem de compra",
        print: { chave: "rc-gerar-oc", legenda: "Gerar OC de uma requisição aprovada com cotações de dois fornecedores." },
        itens: [
          { n: 1, titulo: "Uma OC por fornecedor", texto: "Os itens são agrupados pelo fornecedor da cotação escolhida. Cotações escolhidas de dois fornecedores geram duas OCs." },
          { n: 2, titulo: "Grupo de um fornecedor", texto: "Os itens, a quantidade e o preço da cotação escolhida, com o total da OC." },
          { n: 3, titulo: "Outro fornecedor", texto: "A segunda OC, com os itens dela." },
          { n: 4, titulo: "Gerar", texto: "Cria todas as OCs de uma vez (ou nenhuma, se algo falhar) e a RC vira “Convertida em OC”." },
          { titulo: "Item sem cotação escolhida", texto: "Vai para uma OC “A definir”, com o valor estimado da RC, e o diálogo avisa. A OC não se edita depois: escolha a cotação antes de gerar." },
        ],
      },

      // Ordens de compra
      {
        titulo: "Ordens de compra",
        print: { chave: "oc-lista", legenda: "A aba Ordens de compra." },
        itens: [
          { n: 1, titulo: "Status", texto: "Gerada · Compra feita · Enviada ao Fornecedor · Parcialmente Recebida · Recebida · Cancelada." },
          { n: 2, titulo: "Busca", texto: "Pelo número da OC ou pelo fornecedor." },
          { n: 3, titulo: "Pagamento", texto: "Depois de registrada a compra: “Pago” ou “A pagar”, e a forma usada. Antes disso, “—”." },
          { n: 4, titulo: "Registrar compra", texto: "Aparece na OC “Gerada”: é o passo que diz como a compra foi paga ou quando vai vencer." },
          { n: 5, titulo: "Parcialmente Recebida", texto: "Parte da mercadoria chegou; o saldo continua na aba Recebimento." },
          { titulo: "O detalhe", texto: "Clique na linha para ver fornecedor, CNPJ/CPF, condição de pagamento, previsão de entrega, quando foi comprada e os itens." },
        ],
      },
      {
        titulo: "Registrar a compra",
        print: { chave: "oc-registrar", legenda: "Registrar compra — compra já paga no cartão." },
        itens: [
          { n: 1, titulo: "Já foi paga", texto: "A compra já saiu do caixa. A saída entra em Contas a pagar já como paga, e a NF lançada depois não cria outra conta." },
          { n: 2, titulo: "Vou pagar depois", texto: "A conta a pagar nasce quando a NF for lançada, com as parcelas." },
          { n: 3, titulo: "Como foi pago? *", texto: "Os cartões cadastrados em Formas de pagamento, ou Pix, Boleto e Manual/outro. Obrigatório na compra já paga." },
          { n: 4, titulo: "Pago em *", texto: "A data do pagamento. Não aceita data futura." },
          { n: 5, titulo: "Confirmar compra", texto: "A OC passa a “Compra feita” e entra na fila do Recebimento." },
        ],
      },
      {
        titulo: "Compra paga depois",
        print: { chave: "oc-registrar-depois", legenda: "Registrar compra — “Vou pagar depois”." },
        itens: [
          { n: 1, titulo: "Previsão de vencimento *", texto: "Quando a compra deve vencer. Ela preenche a primeira parcela ao lançar a NF — ali ainda dá para ajustar." },
        ],
      },
      {
        titulo: "Cancelar uma OC",
        papel: "gestor",
        print: { chave: "oc-detalhe-gestor", legenda: "O detalhe de uma OC com compra registrada, aberto pelo gestor.", papel: "gestor" },
        itens: [
          { n: 1, titulo: "Pagamento", texto: "Em aberto e quando vence, ou pago e em que data." },
          { n: 2, titulo: "Cancelar OC", texto: "Para a OC gerada por engano ou a compra que não vai acontecer. Ela sai do fluxo: não pode mais ser recebida nem receber NF. Pede confirmação." },
        ],
      },

      // Recebimento
      {
        titulo: "Recebimento",
        print: { chave: "receb-lista", legenda: "A aba Recebimento: a fila e o histórico." },
        itens: [
          { n: 1, titulo: "Aguardando recebimento", texto: "As OCs com compra feita e as parcialmente recebidas que ainda têm saldo. OC só “Gerada” precisa ter a compra registrada antes de aparecer aqui." },
          { n: 2, titulo: "Parcial", texto: "A etiqueta “parcial” e quantas unidades ainda faltam chegar." },
          { n: 3, titulo: "Conferir", texto: "Abre a conferência da OC que ainda não recebeu nada." },
          { n: 4, titulo: "Receber saldo", texto: "Na parcial, abre a conferência só do que falta." },
          { n: 5, titulo: "Histórico de recebimentos", texto: "Cada conferência feita: data e hora, itens, status (conferido OK ou com divergência)." },
          { n: 6, titulo: "Divergência", texto: "O que foi escrito na conferência quando veio diferente do esperado." },
        ],
      },
      {
        titulo: "Conferir o que chegou",
        print: { chave: "receb-dialogo", legenda: "Conferência do saldo de uma OC parcialmente recebida." },
        itens: [
          { n: 1, titulo: "O que já chegou", texto: "Na OC que já teve recebimento, cada item mostra o pedido e quanto já chegou." },
          { n: 2, titulo: "Esperado", texto: "O saldo: o que falta chegar daquele item (o pedido inteiro, na primeira conferência)." },
          { n: 3, titulo: "Recebido", texto: "Já vem com o esperado. Troque pelo que chegou de fato, contado na caixa." },
          { n: 4, titulo: "Qualidade", texto: "OK, Parcial ou Rejeitado. Item rejeitado não conta como recebido: continua no saldo, esperando chegar." },
          { n: 5, titulo: "Observação da divergência *", texto: "Aparece quando a quantidade ou a qualidade foge do esperado, e é obrigatória: o que veio diferente." },
          { n: 6, titulo: "Registrar recebimento", texto: "Grava a conferência. Com divergência, a OC fica “Parcialmente recebida” e volta à fila com o saldo; sem divergência, fica “Recebida” e vai para a fila da NF." },
        ],
      },
      {
        titulo: "Antes de registrar o recebimento, confira",
        itens: [
          { titulo: "A quantidade", texto: "O campo Recebido nasce igual ao esperado. Ele vale o que foi contado na mercadoria, não o que diz a nota do fornecedor." },
          { titulo: "A qualidade", texto: "Item avariado ou fora do pedido vai como Rejeitado (ou Parcial), para continuar no saldo e ser cobrado do fornecedor." },
          { titulo: "A observação", texto: "Com divergência, diga o que faltou ou veio errado e, se souber, quando o resto chega." },
        ],
      },

      // NF de compra
      {
        titulo: "NF de compra",
        print: { chave: "nfcompra-lista", legenda: "A aba NF de compra: a fila e as notas lançadas." },
        itens: [
          { n: 1, titulo: "Aguardando lançamento de NF", texto: "OCs recebidas (por inteiro ou em parte) que ainda não têm nota lançada." },
          { n: 2, titulo: "Parcial", texto: "A OC recebida em parte também pode ter a NF lançada." },
          { n: 3, titulo: "Lançar NF", texto: "Abre o lançamento da nota do fornecedor." },
          { n: 4, titulo: "As conferências", texto: "Nas notas lançadas: OC ✓, Receb. ✓ e Valor ✓ — se a nota bate com a OC, com um recebimento conferido e com o valor da OC." },
          { n: 5, titulo: "Anexo", texto: "Baixa o PDF ou o XML anexado à nota." },
        ],
      },
      {
        titulo: "Lançar a NF do fornecedor",
        print: { chave: "nfcompra-dialogo", legenda: "Lançamento de uma NF em três parcelas (30/60/90)." },
        itens: [
          { n: 1, titulo: "Nº da NF *", texto: "O número da nota do fornecedor. Obrigatório." },
          { n: 2, titulo: "Data", texto: "A data de emissão da nota. As parcelas contam a partir dela." },
          { n: 3, titulo: "Valor da NF (R$)", texto: "Já vem com o valor da OC. Troque pelo valor da nota; as parcelas são redistribuídas sozinhas." },
          { n: 4, titulo: "Conferência de três vias", texto: "OC, Recebimento e Valor: verde quando a nota bate com a OC, com um recebimento completo e conferido, e com o valor da OC (tolerância de 1%). Qualquer um vermelho deixa a nota marcada com “Divergência” — ela pode ser lançada assim mesmo." },
          { n: 5, titulo: "Anexo da NF", texto: "Opcional: o PDF ou o XML da nota, que fica guardado para baixar depois." },
          { n: 6, titulo: "Gerar conta a pagar", texto: "Ligado, as parcelas abaixo viram contas em Contas a pagar. Se a compra foi registrada como já paga, a caixa não aparece: o pagamento já está lá, e a nota não cria outra conta." },
          { n: 7, titulo: "Prazo", texto: "Escreva o prazo do fornecedor — “30/60/90”, “28 dias”, “à vista” — e as parcelas se montam a partir da data da NF. Já vem com a condição de pagamento da OC, mas as parcelas só se dividem quando o prazo é digitado: com ele pré-preenchido, a tela abre com uma parcela só, na previsão de vencimento registrada na compra. Para dividir, apague e escreva o prazo de novo." },
          { n: 8, titulo: "Parcelas", texto: "Uma linha por parcela, com vencimento e valor, que dá para ajustar uma a uma. “+ Parcela” divide o valor em mais uma; a lixeira tira." },
          { n: 9, titulo: "Soma das parcelas", texto: "Tem de fechar com o valor da NF. Enquanto não fecha, aparece em vermelho quanto falta, e o botão de lançar fica desligado." },
          { n: 10, titulo: "Lançar NF", texto: "Grava a nota e as parcelas juntas. O botão diz quantas parcelas vão para Contas a pagar." },
        ],
      },
      {
        titulo: "Antes de lançar a NF, confira",
        itens: [
          { titulo: "Número e data", texto: "Iguais aos da nota do fornecedor. A data da NF é a base dos vencimentos." },
          { titulo: "Valor", texto: "O total da nota, com frete e impostos que estiverem nela. Se for diferente da OC, a etiqueta Valor fica vermelha — confira se a diferença está combinada com o fornecedor." },
          { titulo: "Parcelas", texto: "Quantidade, vencimentos e valores iguais aos boletos ou ao combinado com o fornecedor, e a soma fechando com a nota." },
          { titulo: "Anexo", texto: "O PDF ou o XML anexado, para quem for pagar ter a nota à mão." },
        ],
      },
    ],
  },

  // ── Suprimentos ─────────────────────────────────────────────────────────────
  {
    id: "suprimentos",
    titulo: "Suprimentos",
    rota: "/suprimentos",
    resumo:
      "O estoque de insumos e embalagens por hub (Hub Natal, CD SP…), com o giro, a cobertura em dias e a data provável de ruptura de cada um; as movimentações de entrada e saída; as sugestões de transferência e de produção; e a política de estoque mínimo por produto e por hub. Recebimento e Notas Fiscais levam para a tela de Compras.",
    regras: {
      colaborador: [
        "Vê o estoque, as movimentações e a política de estoque mínimo, e exporta a planilha.",
        "Liga o Modo Planejamento para ver as sugestões pendentes.",
      ],
      gestor: [
        "Ajusta o estoque de um produto por hub (lápis no cartão) e registra movimento manual.",
        "Aprova, edita, rejeita e executa as sugestões de transferência e de produção, também em lote.",
      ],
    },
    blocos: [
      {
        titulo: "Estoque",
        print: { chave: "suprim-estoque", legenda: "A aba Estoque: cartões por produto, agrupados por categoria." },
        itens: [
          { n: 1, titulo: "Indicadores", texto: "Total de produtos, quantos estão em baixa (abaixo do mínimo), e as entradas, saídas e movimentações dos últimos 7 dias." },
          { n: 2, titulo: "Modo Planejamento", texto: "Mostra, acima das abas, as sugestões pendentes de transferência entre hubs e de produção." },
          { n: 3, titulo: "Abas", texto: "Estoque, Movimentações e Política de Estoque. Recebimento ↗ e Notas Fiscais ↗ abrem as abas de Compras." },
          { n: 4, titulo: "Buscar produto", texto: "Pelo nome ou pelo código." },
          { n: 5, titulo: "Centro de distribuição", texto: "Escolhe o hub." },
          { n: 6, titulo: "Exportar Excel", texto: "Baixa a planilha com código, nome, categoria, estoque total, segurança e o saldo de cada hub." },
          { n: 7, titulo: "Situação", texto: "Pela cobertura em dias: Ruptura iminente (menos de 7), Atenção (menos de 15), Estável (menos de 30), Saudável (menos de 60), Excedente (60 ou mais), Sem consumo (sem saída nos últimos 30 dias)." },
          { n: 8, titulo: "Giro, cobertura e ruptura", texto: "Quanto sai por dia (média de 30 dias), para quantos dias o estoque total dá e em que dia ele acaba nesse ritmo. O número grande acima é o estoque total, somando os hubs, com o nível de segurança." },
          { n: 9, titulo: "Saldo por hub", texto: "Uma barra por hub, com o saldo e quanto falta (ou sobra) em relação ao nível de segurança." },
          { n: 10, titulo: "Saídas 30 dias", texto: "O gráfico das saídas do mês e a tendência dos últimos 7 dias contra a média (vermelho = saindo mais rápido)." },
          { titulo: "Categorias", texto: "Cada categoria (Embalagem, Rotulagem, Insumo químico…) recolhe e expande no título, que diz quantos itens estão em baixa. “Expandir tudo” e “Recolher tudo” ficam acima da lista." },
        ],
      },
      {
        titulo: "Ajustar o estoque de um hub",
        papel: "gestor",
        texto: "O lápis no canto do cartão abre o ajuste. Use para corrigir o saldo depois de uma contagem física.",
        print: { chave: "suprim-ajuste", legenda: "Ajustar Estoque por HUB.", papel: "gestor" },
        itens: [
          { n: 1, titulo: "HUB", texto: "Qual hub está sendo ajustado. O estoque atual dele aparece ao lado." },
          { n: 2, titulo: "Novo estoque", texto: "O saldo contado, não a diferença. O sistema calcula a entrada ou a saída e registra em Movimentações como “ajuste”." },
          { n: 3, titulo: "Novo nível de segurança", texto: "Opcional: troca o nível de segurança do produto." },
          { n: 4, titulo: "Motivo do ajuste *", texto: "Obrigatório (ex.: contagem física, correção de inventário). Vai na observação do movimento, junto com o nome do hub." },
          { n: 5, titulo: "Salvar", texto: "Grava o saldo novo e o movimento." },
        ],
      },
      {
        titulo: "Movimentações",
        print: { chave: "suprim-mov", legenda: "A aba Movimentações." },
        itens: [
          { n: 1, titulo: "Tipo", texto: "Todos, Entradas ou Saídas." },
          { n: 2, titulo: "Movimento Manual", texto: "Registra uma entrada ou saída à mão. Só para gestor.", papel: "gestor" },
          { n: 3, titulo: "Um movimento", texto: "Entrada (seta verde) ou saída (seta vermelha), a origem (PC = compra, OP = produção, ajuste), a observação, a quantidade e a data e hora. O produto aparece pelo código interno do cadastro, não pelo nome. Mostra os 200 mais recentes." },
        ],
      },
      {
        titulo: "Movimento manual",
        papel: "gestor",
        print: { chave: "suprim-mov-dialogo", legenda: "Registrar Movimento de Estoque.", papel: "gestor" },
        itens: [
          { n: 1, titulo: "Produto", texto: "O insumo ou produto que entrou ou saiu." },
          { n: 2, titulo: "Tipo", texto: "Entrada ou Saída." },
          { n: 3, titulo: "Quantidade", texto: "Quanto entrou ou saiu (maior que zero)." },
          { n: 4, titulo: "Origem", texto: "PC (compra), OP (ordem de produção) ou Ajuste." },
          { n: 5, titulo: "Observações", texto: "De onde veio ou para onde foi." },
        ],
      },
      {
        titulo: "Modo Planejamento",
        print: { chave: "suprim-planejamento", legenda: "As sugestões pendentes, com o Modo Planejamento ligado (visão do gestor)." },
        itens: [
          { n: 1, titulo: "Transferências / Produção", texto: "Transferências sugeridas entre hubs (de onde, para onde, quantas unidades e o motivo) e ordens de produção sugeridas." },
          { n: 2, titulo: "Selecionar tudo", texto: "Marca as pendentes para “Aprovar em lote”, que aparece no topo com a quantidade marcada.", papel: "gestor" },
          { n: 3, titulo: "Editar, aprovar, rejeitar", texto: "Na pendente: o lápis ajusta a quantidade antes de aprovar, o ✓ aprova e o ✕ rejeita.", papel: "gestor" },
          { n: 4, titulo: "Executar / Criar OP", texto: "Na aprovada: “Executar” faz a transferência entre os hubs; na produção, “Criar OP” abre a ordem de produção.", papel: "gestor" },
        ],
      },
      {
        titulo: "Política de Estoque",
        print: { chave: "suprim-politica", legenda: "A aba Política de Estoque." },
        itens: [
          { n: 1, titulo: "Insumos abaixo do necessário", texto: "Os insumos que não dão para a produção pedida pela política: quanto tem, quanto precisa e o déficit, por hub." },
          { n: 2, titulo: "Buscar SKU", texto: "Pelo nome ou código do produto final (CarboZé 100ml, 1 Litro…)." },
          { n: 3, titulo: "Estoque mínimo por hub", texto: "Um quadro por hub com o estoque mínimo configurado. Tracejado com “Configurar” = ainda sem mínimo. Clique para definir." },
        ],
      },
      {
        titulo: "Definir o estoque mínimo",
        print: { chave: "suprim-politica-dialogo", legenda: "Estoque mínimo de um produto num hub." },
        itens: [
          { n: 1, titulo: "Estoque mínimo de segurança", texto: "Em unidades. Abaixo dele, o sistema alerta e sugere ordem de produção ou compra." },
          { n: 2, titulo: "Cobertura mínima (dias)", texto: "Para quantos dias o estoque precisa dar: 7, 15, 30, 45, 60 ou 90." },
          { n: 3, titulo: "Salvar", texto: "Grava a política daquele produto naquele hub." },
        ],
      },
    ],
  },
];
