import type { Secao } from "../tipos";

// Rastreio de venda, Vendas de Recorrência, Logística, Viagens & PC e Alertas
// Operacionais do Carbo Ops.
// ⚠️ O `n` de cada item é o marcador do print (docs-prints/shots_logistica.mjs).

export const SECOES_LOGISTICA: Secao[] = [
  // ── Rastreio de venda ───────────────────────────────────────────────────────
  {
    id: "rastreio",
    titulo: "Rastreio de venda",
    rota: "/rastreio",
    resumo:
      "O caminho de cada venda depois de fechada, da Nova Venda até a entrega, num quadro por etapa. Quem move o pedido de uma etapa para a outra é Operações, aqui no Carbo Ops — o vendedor só acompanha o mesmo quadro no Carbo Sales. Cada mudança aparece na hora na tela de todos.",
    regras: {
      colaborador: [
        "Vê os pedidos de todos os vendedores e move qualquer um de etapa.",
        "Entram no quadro as vendas lançadas pela tela Vender (no Sales ou aqui). Pedidos de loja on-line e pedidos que nasceram no Bling não entram. Venda só de serviço (descarbonização) também não: ela segue pela Ordem de Serviço.",
        "Pedidos entregues e cancelados aparecem só dos últimos 30 dias, a não ser que você mude o filtro “Finalizados”.",
        "O quadro se atualiza sozinho: quando alguém move um card, ele muda na sua tela também.",
      ],
      gestor: [
        "Vê e faz o mesmo que o colaborador: esta tela não muda para o gestor.",
      ],
    },
    blocos: [
      {
        titulo: "O quadro",
        print: { chave: "rastreio", legenda: "Rastreio de venda com os pedidos em cada etapa." },
        itens: [
          { n: 1, titulo: "Rastreio de venda", texto: "A jornada das vendas manuais. Operações controla da Nova Venda até a Entrega." },
          { n: 2, titulo: "Finalizados", texto: "Quantos dias de pedidos entregues e cancelados aparecem: últimos 30 dias, últimos 90 dias ou tudo. Os pedidos em andamento aparecem sempre, todos." },
          { n: 3, titulo: "Finalizados ocultos", texto: "Avisa quantos entregues/cancelados ficaram fora do período escolhido. Clique para ver tudo." },
          { n: 4, titulo: "Coluna = etapa", texto: "Cada coluna é uma etapa, na ordem em que o pedido anda. Role o quadro para o lado para ver as outras: são doze." },
          { n: 5, titulo: "Quantidade", texto: "Quantos pedidos estão naquela etapa agora." },
          { n: 6, titulo: "Card do pedido", texto: "Um pedido. Clique para abrir os detalhes; arraste para outra coluna para mudar a etapa." },
          { n: 7, titulo: "Seletor de etapa", texto: "Outra forma de mudar a etapa, sem arrastar: escolha a nova etapa na lista. Arrastar e escolher passam pelas mesmas conferências (veja “Mudando de etapa”)." },
          { n: 8, titulo: "Dica", texto: "Lembra os dois jeitos de mover e que o clique abre os detalhes." },
        ],
      },
      {
        titulo: "As etapas, em ordem",
        texto: "O pedido anda da esquerda para a direita. Nem todo pedido passa por todas: quem tem produto em estoque pula a produção.",
        itens: [
          { titulo: "Agendado (recorrência)", texto: "Parcela de uma venda recorrente cujo mês ainda não chegou. Não se move à mão: entra sozinha na fila quando o mês dela chega." },
          { titulo: "Nova Venda", texto: "A venda acabou de ser lançada e ainda não foi recebida." },
          { titulo: "Pedido Recebido", texto: "Operações recebeu o pedido e vai conferir o estoque." },
          { titulo: "Criar Ordem de Produção", texto: "Falta produto: ao entrar aqui nasce uma ordem de produção (OP) para cada produto, no Backlog da Produção." },
          { titulo: "Em Separação", texto: "O produto está sendo separado no Hub Natal." },
          { titulo: "Separado", texto: "Separado, contado e pesado. É aqui que o estoque do Hub Natal é baixado e que a remessa nasce na tela Logística." },
          { titulo: "Gerar Nota Fiscal", texto: "O pedido foi liberado para o Faturamento emitir a nota. Quando a nota é emitida (na matriz ou na filial), o card avança sozinho para Emitir Etiqueta." },
          { titulo: "Emitir Etiqueta", texto: "A nota de venda já foi emitida: falta gerar a etiqueta de envio." },
          { titulo: "Etiqueta emitida · aguardando despacho", texto: "A etiqueta foi gerada e a caixa espera a transportadora. Quando a carga sair, mova para Em Transporte." },
          { titulo: "Em Transporte", texto: "A mercadoria saiu e está a caminho do cliente." },
          { titulo: "Entregue", texto: "O cliente recebeu." },
          { titulo: "Cancelado", texto: "O pedido foi cancelado. Mover para cá cancela a VENDA de verdade: ela sai do faturamento e o estoque que já tinha sido baixado volta para o Hub Natal." },
        ],
      },
      {
        titulo: "Lendo um card",
        print: { chave: "rastreio-card", legenda: "Um card de perto: pedido faturado, com bonificação, pronto para a etiqueta." },
        itens: [
          { n: 1, titulo: "Cliente", texto: "Nome do cliente do pedido." },
          { n: 2, titulo: "Valor", texto: "Total do pedido." },
          { n: 3, titulo: "Caixa separada de bonificação", texto: "O pedido tem brinde. A bonificação sai em caixa separada e com nota própria (a nota de remessa em bonificação). Embale à parte, senão a nota não fecha com o volume." },
          { n: 4, titulo: "O que é o pedido", texto: "O primeiro produto e a quantidade; “+1” quer dizer que há mais itens (veja todos nos detalhes)." },
          { n: 5, titulo: "Número do pedido", texto: "O número da venda (começa com V). É o mesmo do Sales e do rodapé da nota fiscal." },
          { n: 6, titulo: "Prazo de entrega", texto: "Quantos dias faltam para a entrega combinada com o cliente: em âmbar quando faltam 3 dias ou menos, em vermelho quando já passou (“2d atrasado”)." },
          { n: 7, titulo: "NF de venda", texto: "A nota fiscal de venda. Clique para abrir o DANFE (o PDF da nota) e mandar com a carga. Se o PDF ainda não existir, abre o XML. O chip acompanha o card até a entrega, porque é depois dela que o cliente costuma pedir a nota." },
          { n: 8, titulo: "NF de bonificação", texto: "A nota de remessa do brinde. Clique para abrir o DANFE dela. As duas notas viajam juntas com a carga." },
          { n: 9, titulo: "Emitir etiqueta", texto: "Só aparece na etapa Emitir Etiqueta. Abre a emissão da etiqueta de transporte (veja abaixo). Em Etiqueta emitida o botão vira “Reimprimir etiqueta”." },
          { n: 10, titulo: "Vendedor e data", texto: "Quem vendeu e quando a venda foi lançada." },
          { n: 11, titulo: "Seletor de etapa", texto: "Muda a etapa do pedido. Na parcela agendada ele não aparece (veja “Parcela de recorrência”)." },
          { titulo: "Nota da matriz ou da filial", texto: "O pedido pode ter sido faturado na matriz (Natal) ou na filial (SP). O card mostra a nota certa nos dois casos e busca o arquivo na conta certa. Se aparecer “A nota ainda não tem arquivo no Bling”, espere alguns minutos e tente de novo." },
        ],
      },
      {
        titulo: "Avisos de nota fiscal",
        texto: "Venda com brinde tem DUAS notas: a de venda e a de remessa em bonificação. Os avisos existem para nenhuma das duas faltar na carga.",
        print: { chave: "rastreio-sem-nf", legenda: "Aviso vermelho: a carga tem só a nota de bonificação." },
        itens: [
          { n: 1, titulo: "Só a NF de bonificação está vinculada (vermelho)", texto: "O pedido tem produto pago, já tem a nota do brinde e NÃO tem a nota de venda. Não despache sem ela: fale com o Faturamento. Ele aparece em qualquer etapa, inclusive depois que a carga saiu, porque é aí que o erro já aconteceu." },
          { n: 2, titulo: "A nota que existe", texto: "Só o chip da bonificação aparece: é o sinal de que a de venda está faltando." },
          { titulo: "Tem bonificação e a NF de remessa não está vinculada (âmbar)", texto: "O contrário: o pedido tem brinde e falta a nota de remessa. Esse aviso aparece na emissão da etiqueta. Confira no Bling antes de despachar — sem a nota a caixa do brinde viaja sem documento." },
          { titulo: "Pedido 100% brinde", texto: "Pedido só de bonificação tem uma nota só, a de remessa, e está certo assim: nenhum aviso aparece para ele." },
        ],
      },
      {
        titulo: "Gerar Nota Fiscal e Emitir Etiqueta",
        print: { chave: "rastreio-nf", legenda: "Pedido esperando a nota e pedidos já faturados." },
        itens: [
          { n: 1, titulo: "Liberado no Faturamento — aguardando NF", texto: "O pedido está com o Faturamento, esperando a nota de venda. O selo some sozinho quando a nota é vinculada, e o card passa para Emitir Etiqueta." },
          { n: 2, titulo: "NF emitida", texto: "Em Emitir Etiqueta o chip da nota fica verde. Nas etapas seguintes ele continua no card, em azul." },
          { n: 3, titulo: "Parcela faturada", texto: "Parcela de recorrência também mostra o mês e o número da parcela (2/4) no topo do card." },
        ],
      },
      {
        titulo: "Produção do pedido",
        print: { chave: "rastreio-op", legenda: "Coluna Criar Ordem de Produção." },
        itens: [
          { n: 1, titulo: "Prontos", texto: "Quantos pedidos desta coluna já foram produzidos e estão esperando alguém movê-los para Em Separação." },
          { n: 2, titulo: "Andamento da produção", texto: "Quantas OPs do pedido já foram concluídas (uma por produto) e em que setor está a mais atrasada (Envase, Rotulagem, Qualidade…)." },
          { n: 3, titulo: "Produzido — mover p/ Em Separação", texto: "Todas as OPs terminaram. Mova o card para Em Separação." },
          { titulo: "Sem OP — recriar", texto: "Aparece quando o pedido está nesta coluna e não tem ordem de produção. Para criar de novo, mova o card para Pedido Recebido e volte para Criar Ordem de Produção." },
          { titulo: "A OP é do produto físico", texto: "“CarboZé 100ml - PDV” e “CarboZé 100ml - bonificação” são produzidos como CarboZé 100ml: a OP sai do produto que vai para a prateleira, com as quantidades somadas." },
        ],
      },
      {
        titulo: "Parcela de recorrência",
        print: { chave: "rastreio-agendado", legenda: "Parcela de um contrato mensal, agendada para o mês dela." },
        itens: [
          { n: 1, titulo: "Mês e parcela", texto: "O mês da entrega e qual parcela do contrato ela é (4 de 6). É o que diferencia as parcelas do mesmo cliente." },
          { n: 2, titulo: "Entra na fila em…", texto: "A parcela agendada não tem seletor de etapa: ela vai sozinha para Nova Venda quando o mês dela chega. Até ser faturada, ela pode ser editada em Vendas de Recorrência." },
        ],
      },
      {
        titulo: "Mudando de etapa",
        texto: "Arrastar o card ou usar o seletor dá no mesmo. Algumas etapas pedem uma conferência antes de o card andar.",
        itens: [
          { titulo: "Para Em Separação, Separado ou Criar Ordem de Produção", texto: "Abre a conferência de estoque do Hub Natal (veja abaixo). Quem decide é você." },
          { titulo: "Para Separado", texto: "Depois da conferência, pede volumes e peso." },
          { titulo: "Para Gerar Nota Fiscal", texto: "Pede a transportadora e o valor da cotação do frete." },
          { titulo: "Para Emitir Etiqueta, Etiqueta emitida, Em Transporte ou Entregue", texto: "Só com nota fiscal de venda. Sem ela o card não anda e a tela avisa “Emita a NF antes de gerar etiqueta/enviar”." },
          { titulo: "Voltar de Separado", texto: "Levar o card de volta para uma etapa anterior à separação (ou cancelar) devolve ao Hub Natal o estoque que tinha sido baixado. A tela confirma com “estoque estornado”." },
          { titulo: "A remessa acompanha", texto: "Ao separar, nasce a remessa na tela Logística → Gestão. Em Transporte, Entregue e Cancelado são copiados para ela." },
        ],
      },
      {
        titulo: "Conferência de estoque",
        print: { chave: "rastreio-estoque", legenda: "Indo para Em Separação, com estoque suficiente." },
        itens: [
          { n: 1, titulo: "Resultado", texto: "“Produto em estoque” ou “Sem estoque”, conferido no Hub Natal na hora." },
          { n: 2, titulo: "Pedido", texto: "Quanto o pedido precisa daquele produto." },
          { n: 3, titulo: "Estoque", texto: "Quanto há no Hub Natal agora." },
          { n: 4, titulo: "Sobra", texto: "O que fica depois de separar. Negativo, em vermelho, quer dizer que falta." },
          { n: 5, titulo: "Confirmar", texto: "Leva o card para a etapa escolhida." },
        ],
      },
      {
        print: { chave: "rastreio-sem-estoque", legenda: "Sem estoque: o pedido precisa ser produzido." },
        itens: [
          { n: 1, titulo: "Sem estoque", texto: "O Hub Natal não tem o suficiente para o pedido." },
          { n: 2, titulo: "Somado pelo produto físico", texto: "As linhas de faixa de preço (PDV, Microdistribuidor) e a bonificação são o mesmo produto da prateleira: aqui 150 “PDV” + 10 de bonificação aparecem como 160 de CarboZé 100ml." },
          { n: 3, titulo: "OK, produzir", texto: "Sem estoque, a única saída é produzir: o card vai para Criar Ordem de Produção e a OP nasce. Se o produto tiver estoque e você mandar produzir, a tela pergunta se quer produzir mesmo assim ou usar o estoque." },
          { titulo: "Item sem produto vinculado", texto: "Se algum item não estiver ligado a um produto do catálogo, não dá para conferir: a tela deixa você escolher entre produzir e separar." },
        ],
      },
      {
        titulo: "Volumes e peso (ao separar)",
        print: { chave: "rastreio-separado", legenda: "Depois da conferência, indo para Separado." },
        itens: [
          { n: 1, titulo: "O que acontece", texto: "Ao confirmar, o card vai para Separado e o estoque é baixado do Hub Natal." },
          { n: 2, titulo: "Volumes", texto: "Quantas caixas o pedido fechado tem. É o número de etiquetas que vão ser impressas." },
          { n: 3, titulo: "Peso bruto", texto: "O peso do pedido fechado, em kg (aceita vírgula)." },
          { n: 4, titulo: "Confirmar → Separado", texto: "Grava volumes e peso e move o card. Se nada for baixado (já tinha sido baixado antes, ou item sem produto), a tela avisa." },
        ],
      },
      {
        titulo: "Frete (ao gerar a nota)",
        print: { chave: "rastreio-frete", legenda: "Indo de Separado para Gerar Nota Fiscal." },
        itens: [
          { n: 1, titulo: "Volumes e peso", texto: "Os que foram informados na separação, só para conferir: são eles que sustentam a cotação. Para corrigir, use “Editar” nos detalhes do pedido." },
          { n: 2, titulo: "Transportadora", texto: "Quem vai levar o pedido. Sai impresso na etiqueta." },
          { n: 3, titulo: "Valor da cotação", texto: "Opcional. O que a transportadora cobrou (não é o frete cobrado do cliente). Vazio fica vazio, nunca zero." },
          { n: 4, titulo: "Confirmar → Gerar Nota Fiscal", texto: "Grava e libera o pedido para o Faturamento emitir a nota." },
        ],
      },
      {
        titulo: "Emitir etiqueta",
        print: { chave: "rastreio-etiqueta", legenda: "Emissão da etiqueta de um pedido com bonificação." },
        itens: [
          { n: 1, titulo: "NF venda", texto: "Número da nota de venda, com os links DANFE e XML para imprimir e mandar com a carga." },
          { n: 2, titulo: "NF bonificação", texto: "A nota de remessa do brinde, também com DANFE e XML. Quando o pedido tem brinde e essa nota falta, aqui aparece o aviso âmbar." },
          { n: 3, titulo: "Código de barras", texto: "A etiqueta usa a chave de acesso da nota de venda. Se a chave não estiver disponível, usa o número do pedido." },
          { n: 4, titulo: "Volumes, peso e transportadora", texto: "Só leitura: sai uma etiqueta por volume. Para mudar, feche e use “Editar” nos detalhes do pedido." },
          { n: 5, titulo: "Gerar PDF (10×15)", texto: "Baixa o PDF das etiquetas no tamanho 10×15 cm e move o card para Etiqueta emitida · aguardando despacho. Reimprimir não move o card." },
          { n: 6, titulo: "Gerar e enviar → Em Transporte", texto: "Baixa as etiquetas e já move o card para Em Transporte." },
        ],
      },
      {
        titulo: "Abrindo o card",
        print: { chave: "rastreio-detalhe", legenda: "Detalhes de um pedido." },
        itens: [
          { n: 1, titulo: "Cliente e etapa", texto: "Nome do cliente e a etapa em que o pedido está." },
          { n: 2, titulo: "Pedido, vendedor e data", texto: "Número do pedido, quem vendeu e quando." },
          { n: 3, titulo: "Notas", texto: "As notas do pedido, logo no topo. Clique para abrir o DANFE." },
          { n: 4, titulo: "Contato", texto: "Telefone e e-mail informados na venda." },
          { n: 5, titulo: "Endereço de entrega", texto: "Rua, cidade, estado e CEP." },
          { n: 6, titulo: "Dados fiscais e pagamento", texto: "CNPJ ou CPF, inscrição estadual, forma de pagamento e tipo de frete. Vêm da venda e não se editam aqui." },
          { n: 7, titulo: "Expedição", texto: "Volumes, peso bruto, transportadora e a cotação do frete." },
          { n: 8, titulo: "Editar", texto: "Corrige os dados de expedição sem mudar a etapa. São os que saem na etiqueta." },
          { n: 9, titulo: "Prazos", texto: "A entrega combinada com o cliente e os prazos internos: Fabricar até (PPF) e Expedir até (PPE)." },
          { n: 10, titulo: "Itens", texto: "Produtos, quantidades e valores. A bonificação aparece como linha própria, a R$ 0,00." },
          { n: 11, titulo: "Valores", texto: "Subtotal, frete e desconto (quando houver) e o total." },
          { n: 12, titulo: "Observações", texto: "O que foi anotado na venda." },
        ],
      },
    ],
  },

  // ── Vendas de Recorrência ───────────────────────────────────────────────────
  {
    id: "recorrencias",
    titulo: "Vendas de Recorrência",
    rota: "/recorrencias",
    resumo:
      "As entregas de cada mês dos contratos de recorrência (mensal, trimestral, semestral). Cada parcela é um pedido próprio, que entra no Rastreio de venda quando o mês dela chega — aqui você vê o mês inteiro de uma vez, com os prazos de produção e de envio.",
    regras: {
      colaborador: [
        "Vê as parcelas de todos os contratos, de todos os vendedores.",
        "Edita, cancela e exclui parcelas. Parcela que já tem nota fiscal não pode mais ser editada.",
      ],
      gestor: [
        "Vê e faz o mesmo que o colaborador: esta tela não muda para o gestor.",
      ],
    },
    blocos: [
      {
        print: { chave: "recorrencias", legenda: "Entregas do mês." },
        itens: [
          { n: 1, titulo: "Mês", texto: "Use as setas para ir ao mês anterior ou ao próximo. O mês fica no endereço da tela: dá para mandar o link de um mês a alguém." },
          { n: 2, titulo: "Resumo do mês", texto: "Quantas entregas há no mês e o valor somado." },
          { n: 3, titulo: "Hoje", texto: "Volta para o mês atual." },
          { n: 4, titulo: "Próximos 12 meses", texto: "Os meses com bolinha têm entrega. Clique em um para ir direto a ele." },
          { n: 5, titulo: "Empresa", texto: "O cliente, o número do pedido da parcela, qual parcela ela é (2/4) e a frequência do contrato." },
          { n: 6, titulo: "Entregas restantes", texto: "Quantas entregas do contrato ainda faltam, contando esta (as canceladas não contam)." },
          { n: 7, titulo: "Produzir até", texto: "Prazo de produção da parcela (PPF). Vermelho quando já passou; âmbar quando falta uma semana ou menos." },
          { n: 8, titulo: "Enviar até", texto: "Prazo de expedição (PPE), com as mesmas cores." },
          { n: 9, titulo: "Situação", texto: "Agendada (o mês ainda não chegou), a etapa em que ela está no Rastreio, “NF …” quando já foi faturada, ou Cancelada." },
          { n: 10, titulo: "Editar", texto: "Abre a parcela na tela Vender para mudar itens, valores ou datas. Some quando a parcela já tem nota." },
          { n: 11, titulo: "Cancelar", texto: "Cancela a parcela (veja abaixo)." },
          { n: 12, titulo: "Excluir", texto: "Apaga a parcela do sistema. Não volta. As outras parcelas do contrato continuam." },
          { titulo: "Editar parcela agendada", texto: "A parcela editada continua agendada e entra na fila no mês dela, como as outras." },
        ],
      },
      {
        titulo: "Cancelar ou excluir?",
        print: { chave: "recorrencias-cancelar", legenda: "Confirmação de cancelamento de uma parcela." },
        itens: [
          { n: 1, titulo: "Cancelar", texto: "A parcela sai do faturamento e o estoque que já tinha sido separado volta para o Hub Natal. Ela fica no histórico. É o certo quando a venda existiu e só não vai acontecer." },
          { n: 2, titulo: "Cancelar venda", texto: "Confirma o cancelamento. “Voltar” desiste." },
          { titulo: "Excluir", texto: "Some do sistema de vez. Use só para parcela lançada por engano." },
        ],
      },
    ],
  },

  // ── Logística ───────────────────────────────────────────────────────────────
  {
    id: "logistica",
    titulo: "Logística",
    rota: "/logistica",
    resumo:
      "Duas ferramentas da expedição: a calculadora de frete, que cota a remessa nas transportadoras e na tabela de contrato da Jamef, e o quadro de remessas, que acompanha o que foi separado, enviado e entregue.",
    regras: {
      colaborador: [
        "Cota frete, cria remessas e muda o status, a transportadora e o rastreio de qualquer remessa.",
        "Uma remessa ligada a um pedido só vai para Em Transporte ou Entregue se o pedido já tiver nota fiscal.",
      ],
      gestor: [
        "Vê e faz o mesmo que o colaborador: esta tela não muda para o gestor.",
      ],
    },
    blocos: [
      {
        titulo: "Calculadora de frete",
        print: { chave: "logistica-frete", legenda: "Aba Frete, com uma cotação feita." },
        itens: [
          { n: 1, titulo: "Nova Remessa", texto: "Registra uma remessa à mão (veja “Gestão”)." },
          { n: 2, titulo: "Abas", texto: "Frete (a calculadora), Gestão (o quadro de remessas) e Estratégico (em breve). A aba fica no endereço da tela." },
          { n: 3, titulo: "Origem", texto: "De onde a carga sai: Natal (matriz), o CD SP LogHouse ou outro CEP." },
          { n: 4, titulo: "CEP de destino", texto: "Para onde a carga vai." },
          { n: 5, titulo: "Endereço do CEP", texto: "A cidade e a rua do CEP digitado, para conferir antes de cotar. Se aparecer “CEP não encontrado”, confira o número." },
          { n: 6, titulo: "Peso e valor da mercadoria", texto: "O peso TOTAL da remessa, em kg, e o valor da nota (entra no seguro e nas taxas)." },
          { n: 7, titulo: "Caixas", texto: "Quantidade e medidas (altura, largura e comprimento, em cm) das caixas. Embaixo, o total de volumes e de metros cúbicos que vai ser cotado." },
          { n: 8, titulo: "Outro tamanho", texto: "Acrescenta uma linha para caixas de outro tamanho. O × remove a linha." },
          { n: 9, titulo: "Calcular Frete", texto: "Cota nas transportadoras e na tabela da Jamef ao mesmo tempo." },
          { n: 10, titulo: "Sugestão", texto: "A opção mais barata entre todas que responderam, com o prazo e quanto ela economiza. Se o prazo apertar, ela diz qual entrega mais rápido." },
          { n: 11, titulo: "Jamef", texto: "Preço da tabela do nosso contrato com a Jamef (só para saída de Natal). Ela não informa prazo: confirme com a transportadora antes de prometer a data ao cliente. Clique para ver de onde sai cada valor." },
          { n: 12, titulo: "Transportadoras", texto: "As outras opções, com preço e prazo em dias úteis. A mais barata leva o selo “Mais barato”." },
          { titulo: "Estimativa aproximada", texto: "Se a cotação em tempo real estiver fora do ar, a tela mostra uma estimativa e avisa. Use só como referência." },
        ],
      },
      {
        print: { chave: "logistica-jamef", legenda: "A conta da Jamef aberta." },
        itens: [
          { n: 1, titulo: "Peso cobrado", texto: "O peso real, o peso cubado (pelas medidas) e o que foi cobrado — o maior dos dois." },
          { n: 2, titulo: "Composição", texto: "Frete peso, ad valorem, GRIS, pedágio, TAS, taxa CTRC e ICMS, somando o total. É o que mostrar quando alguém perguntar de onde saiu o valor." },
          { n: 3, titulo: "Tabela", texto: "Qual tabela de contrato foi usada e a vigência dela." },
        ],
      },
      {
        titulo: "Gestão de remessas",
        texto: "A remessa nasce sozinha quando o pedido é separado no Rastreio de venda. Também dá para criar uma à mão, para envio que não é venda (amostra, material de feira).",
        print: { chave: "logistica-gestao", legenda: "Aba Gestão, com as remessas por status." },
        itens: [
          { n: 1, titulo: "Números", texto: "Pendentes (aguardando ou em separação), em transporte, entregues e atrasados." },
          { n: 2, titulo: "Coluna = status", texto: "Aguardando Separação, Em Separação, Separado, Em Transporte e Entregue, com a quantidade em cada um." },
          { n: 3, titulo: "Remessa", texto: "Número do pedido, cliente, destino, quantidade de itens e, quando houver, transportadora e código de rastreio. Clique para abrir." },
        ],
      },
      {
        print: { chave: "logistica-remessa", legenda: "Uma remessa aberta." },
        itens: [
          { n: 1, titulo: "Dados", texto: "Cliente, destino e quantidade de itens." },
          { n: 2, titulo: "Status", texto: "Muda o status da remessa. Em Transporte e Entregue também movem o pedido ligado no Rastreio de venda — e só se ele já tiver nota fiscal." },
          { n: 3, titulo: "Transportadora", texto: "Quem leva a carga." },
          { n: 4, titulo: "Código de rastreio", texto: "O código da transportadora para acompanhar a entrega." },
          { n: 5, titulo: "Salvar", texto: "Grava as mudanças." },
          { titulo: "Cancelar a remessa não cancela o pedido", texto: "Para cancelar a venda (e devolver o estoque), cancele o pedido no Rastreio de venda." },
        ],
      },
      {
        print: { chave: "logistica-nova", legenda: "Nova Remessa." },
        itens: [
          { n: 1, titulo: "Nº do pedido", texto: "Obrigatório. O número que identifica o envio." },
          { n: 2, titulo: "Cliente", texto: "Obrigatório. Para quem vai." },
          { n: 3, titulo: "Destino", texto: "Cidade/UF de entrega." },
          { n: 4, titulo: "Criar Remessa", texto: "A remessa entra em Aguardando Separação. Transportadora e rastreio são opcionais e podem ser preenchidos depois." },
        ],
      },
    ],
  },

  // ── Viagens & PC ────────────────────────────────────────────────────────────
  {
    id: "viagens",
    titulo: "Viagens & PC",
    rota: "/viagens",
    resumo:
      "Pedido, aprovação e prestação de contas (PC) das viagens a trabalho: quem vai viajar solicita, a viagem é aprovada ou reprovada, e depois da viagem se informa o quanto foi gasto.",
    regras: {
      colaborador: [
        "Solicita viagem e vê as viagens de todos.",
        "Os botões de aprovar, reprovar e prestar contas aparecem para todos os usuários do Ops: combine no time quem aprova.",
      ],
      gestor: [
        "Vê e faz o mesmo que o colaborador: esta tela não muda para o gestor.",
      ],
    },
    blocos: [
      {
        print: { chave: "viagens", legenda: "Lista de viagens." },
        itens: [
          { n: 1, titulo: "Nova Solicitação", texto: "Pede uma viagem (veja abaixo)." },
          { n: 2, titulo: "Abas", texto: "Minhas (as que você criou), Pendentes (esperando aprovação) e Todas. A aba fica no endereço da tela." },
          { n: 3, titulo: "Destino e objetivo", texto: "Para onde e para quê." },
          { n: 4, titulo: "Status", texto: "Pendente, Aprovado, Reprovado, Em Andamento, Concluído ou Cancelado." },
          { n: 5, titulo: "PC", texto: "Como está a prestação de contas: Em Preenchimento, Aguardando Aprovação, Aprovada, Reprovada ou Encerrada." },
          { n: 6, titulo: "Detalhes", texto: "Abre a viagem: período, centro de custo, objetivo, valor estimado e a prestação de contas. Na reprovada, mostra o motivo." },
          { n: 7, titulo: "Aprovar", texto: "Só na viagem pendente. Pede confirmação." },
          { n: 8, titulo: "Reprovar", texto: "Só na viagem pendente. Pede o motivo, que fica visível nos detalhes." },
          { n: 9, titulo: "Prestar contas", texto: "Aparece na viagem aprovada, em andamento ou concluída." },
        ],
      },
      {
        titulo: "Solicitar viagem",
        print: { chave: "viagens-nova", legenda: "Nova Solicitação de Viagem." },
        itens: [
          { n: 1, titulo: "Solicitante", texto: "Quem vai viajar." },
          { n: 2, titulo: "Destino", texto: "Cidade/UF." },
          { n: 3, titulo: "Datas", texto: "Ida e volta. Não aceita data passada." },
          { n: 4, titulo: "Centro de custo", texto: "A área que paga a viagem (Prospecção, Pós-venda, Logística, Manutenção, Treinamento PDV ou Diretoria)." },
          { n: 5, titulo: "Valor estimado", texto: "Quanto se espera gastar, em reais." },
          { n: 6, titulo: "Motivo / Objetivo", texto: "Para que é a viagem." },
          { n: 7, titulo: "Enviar Solicitação", texto: "A viagem entra como Pendente, esperando aprovação." },
        ],
      },
      {
        titulo: "Prestação de contas",
        print: { chave: "viagens-pc", legenda: "Prestação de contas de uma viagem aprovada." },
        itens: [
          { n: 1, titulo: "Total comprovado", texto: "Quanto foi gasto, com comprovante." },
          { n: 2, titulo: "Status", texto: "Em preenchimento enquanto você junta os comprovantes; Enviada para aprovação quando terminar. Aprovada, Reprovada e Encerrada são o desfecho." },
          { n: 3, titulo: "Observações", texto: "O detalhe dos gastos e o que ainda falta comprovar." },
          { n: 4, titulo: "Salvar", texto: "Grava. Dá para voltar e completar depois." },
        ],
      },
    ],
  },

  // ── Alertas Operacionais ────────────────────────────────────────────────────
  {
    id: "alertas",
    titulo: "Alertas Operacionais",
    rota: "/alertas",
    resumo:
      "Tudo o que precisa de ação agora, de todas as áreas do Ops, numa lista só: estoque baixo, pedidos parados, produção atrasada e ordens de serviço vencidas. Os alertas nascem dos dados e somem sozinhos quando a pendência é resolvida — não há o que marcar como lido.",
    regras: {
      colaborador: [
        "Vê os alertas de todas as áreas.",
        "A tela só mostra: para resolver, use o botão do alerta, que leva à tela certa.",
      ],
      gestor: [
        "Vê e faz o mesmo que o colaborador: esta tela não muda para o gestor.",
      ],
    },
    blocos: [
      {
        print: { chave: "alertas", legenda: "Alertas Operacionais." },
        itens: [
          { n: 1, titulo: "Resumo", texto: "Quantas pendências há e quantas são críticas." },
          { n: 2, titulo: "Atualizar", texto: "Relê todas as fontes agora." },
          { n: 3, titulo: "Áreas", texto: "Estoque, Pedidos, Produção e OS de campo, com o total e os críticos. Clique num cartão para ver só aquela área; clique de novo para voltar." },
          { n: 4, titulo: "Total e críticos", texto: "O número grande é o total de alertas da área; em vermelho, quantos deles são críticos. O cartão escolhido fica contornado." },
          { n: 5, titulo: "Buscar", texto: "Procura por produto, cliente, pedido ou OP." },
          { n: 6, titulo: "Prioridade", texto: "Todas, Críticos, Altas ou Médias. O número de cada uma já considera a área e a busca escolhidas." },
          { n: 7, titulo: "Alerta", texto: "O que é, o selo do tipo (Negativo, Zerado, Parado, NF, Atrasada…) e o detalhe. A barrinha da esquerda é a prioridade: vermelha crítica, laranja alta, amarela média." },
          { n: 8, titulo: "Requisitar", texto: "Nos alertas de estoque: abre a Requisição de Compra já preenchida com o produto e a quantidade que falta para o mínimo." },
          { n: 9, titulo: "Ver / Abrir", texto: "Leva à tela onde o alerta se resolve: o estoque do hub, o Rastreio de venda, as Ordens de Produção ou as OS." },
          { n: 10, titulo: "Grupo da área", texto: "Os alertas de cada área, os mais graves primeiro. Com mais de seis, aparece “Mostrar mais”." },
          { titulo: "Não foi possível ler", texto: "Se alguma fonte falhar, uma faixa vermelha diz qual. Os alertas dela não aparecem — não leia a lista vazia como “tudo certo”, clique em Atualizar." },
        ],
      },
      {
        titulo: "O que vira alerta",
        print: { chave: "alertas-filtro", legenda: "Só a área Pedidos." },
        itens: [
          { n: 1, titulo: "Filtrando por área", texto: "Com uma área escolhida, todos os alertas dela aparecem, sem o “Mostrar mais”." },
          { n: 2, titulo: "Limpar", texto: "Tira área, prioridade e busca de uma vez." },
          { n: 3, titulo: "Produzido", texto: "Pedido em Criar Ordem de Produção já produzido e não movido para Em Separação. Crítico a partir de 2 dias." },
          { n: 4, titulo: "NF", texto: "Pedido em Gerar Nota Fiscal, esperando a nota. Alta a partir de 5 dias." },
          { n: 5, titulo: "Parado", texto: "Pedido na mesma etapa há 3 dias ou mais. Alta com 7 dias, crítico com 10." },
          { titulo: "Estoque", texto: "Produto negativo, zerado ou abaixo do mínimo em um hub (Hub Natal, CD SP LogHouse, CD SP Vendas, Escritório). Zerado e negativo são críticos; abaixo da metade do mínimo, alta." },
          { titulo: "Produção", texto: "OP com prazo vencido (Atrasada), OP na mesma etapa há 2 dias ou mais (Parada), OP pronta para separar ou travada por falta de insumo, e insumo zerado que trava produções (Gargalo)." },
          { titulo: "OS de campo", texto: "Venda de descarbonização sem ordem de serviço (crítico: o serviço nunca chega a quem executa) e OS agendada para hoje ou já vencida sem terminar." },
        ],
      },
    ],
  },
];
