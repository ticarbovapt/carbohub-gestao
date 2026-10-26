import type { Secao } from "../tipos";

// Rastreio de venda (/pos-venda), Meu Estoque (/meu-estoque) e Requisição de
// Compra (/compras) do Carbo Sales. As três são de ACOMPANHAR: quem move a
// etapa do pedido e quem corrige o saldo da caixa é o time de Operações (Ops);
// quem aprova a compra é o Financeiro (Finanças).

export const SECOES_RASTREIO: Secao[] = [
  // ── Rastreio de venda ───────────────────────────────────────────────────────
  {
    id: "rastreio",
    titulo: "Rastreio de venda",
    rota: "/pos-venda",
    resumo:
      "O caminho de cada pedido depois da venda, da separação até a entrega, num quadro por etapa. Aqui você só acompanha: quem muda a etapa é o time de Operações, no Carbo Ops. Use a tela para responder ao cliente “onde está o meu pedido?” sem precisar perguntar a ninguém.",
    regras: {
      colaborador: [
        "Você vê só os pedidos que você vendeu (o título da tela é “Meus Pedidos”).",
        "Nada se move por aqui: não há arrastar, botão de etapa nem edição. A etapa muda quando Operações avança o pedido no Carbo Ops.",
        "Aparecem as vendas lançadas pela tela Vender. Pedidos de loja on-line e pedidos importados do Bling não entram neste quadro.",
        "O quadro se atualiza sozinho a cada minuto.",
      ],
      gestor: [
        "Vê os pedidos de todo o time (o título vira “Rastreio de venda”).",
        "Filtra o quadro por vendedor.",
        "Cada card mostra o nome de quem vendeu.",
        "Também não move etapa por aqui — isso continua com Operações.",
      ],
    },
    blocos: [
      {
        titulo: "O quadro",
        print: { chave: "rastreio", legenda: "Rastreio de venda, visão do vendedor (“Meus Pedidos”)." },
        itens: [
          { n: 1, titulo: "Título", texto: "“Pós-venda — Meus Pedidos” para o vendedor; “Pós-venda — Rastreio de venda” para o gestor, que vê o time inteiro." },
          { n: 2, titulo: "Somente leitura", texto: "Lembra que as etapas são atualizadas pelo time de Operações. Se um pedido parece parado, fale com Operações — por aqui não há como mudá-lo." },
          { n: 3, titulo: "Coluna = etapa", texto: "Cada coluna é uma etapa da jornada do pedido, na ordem em que ela acontece. A bolinha colorida ajuda a reconhecer a etapa de longe." },
          { n: 4, titulo: "Quantidade", texto: "Quantos pedidos estão naquela etapa agora." },
          { n: 5, titulo: "Card do pedido", texto: "Um pedido. Clique para abrir os detalhes (veja abaixo)." },
          { n: 6, titulo: "Vazio", texto: "Nenhum pedido seu nesta etapa. A coluna aparece mesmo vazia, para você saber que a etapa existe." },
          { titulo: "Mais colunas à direita", texto: "São doze etapas e elas não cabem todas na tela: role o quadro para o lado (no celular, arraste uma coluna por vez)." },
        ],
      },
      {
        titulo: "As etapas, em ordem",
        texto: "O pedido anda da esquerda para a direita. Nem todo pedido passa por todas: quem tem o produto em estoque pula a produção.",
        itens: [
          { titulo: "Agendado (recorrência)", texto: "Parcela de uma venda recorrente cujo mês ainda não chegou. Fica parada aqui de propósito e sai sozinha quando chega o mês dela." },
          { titulo: "Nova Venda", texto: "A venda acabou de ser lançada e ainda não foi recebida por Operações." },
          { titulo: "Pedido Recebido", texto: "Operações recebeu o pedido e vai conferir o estoque." },
          { titulo: "Criar Ordem de Produção", texto: "Falta produto em estoque: o pedido espera a produção ser programada." },
          { titulo: "Em Separação", texto: "O produto está sendo separado (ou produzido) para o pedido." },
          { titulo: "Separado", texto: "Tudo separado, pronto para faturar." },
          { titulo: "Gerar Nota Fiscal", texto: "O pedido está no Faturamento esperando a nota fiscal. Assim que a nota é emitida — na matriz ou na filial — o pedido avança sozinho." },
          { titulo: "NF Finalizada", texto: "A nota fiscal foi emitida." },
          { titulo: "Emitir Etiqueta", texto: "Falta gerar a etiqueta de envio da transportadora." },
          { titulo: "Em Transporte", texto: "A mercadoria saiu e está a caminho do cliente." },
          { titulo: "Entregue", texto: "O cliente recebeu." },
          { titulo: "Cancelado", texto: "O pedido foi cancelado." },
        ],
      },
      {
        titulo: "Lendo um card",
        print: { chave: "rastreio-card", legenda: "Um card do quadro, de perto (visão do gestor)." },
        itens: [
          { n: 1, titulo: "Cliente", texto: "Nome do cliente do pedido." },
          { n: 2, titulo: "Valor", texto: "Total do pedido, já com desconto e frete." },
          { n: 3, titulo: "Número do pedido", texto: "O número da venda (começa com V). É o mesmo que aparece em Vendas e no rodapé da nota fiscal." },
          { n: 4, titulo: "Data da venda", texto: "Quando o pedido foi lançado." },
          { n: 5, titulo: "Vendedor", texto: "Quem vendeu. Só aparece para o gestor — o vendedor já sabe que o pedido é dele.", papel: "gestor" },
          { titulo: "E a nota fiscal?", texto: "O card não mostra selo de nota. A coluna já diz em que ponto o pedido está (Gerar Nota Fiscal → NF Finalizada), e o número da nota aparece ao abrir o card." },
        ],
      },
      {
        papel: "gestor",
        titulo: "O que o gestor vê a mais",
        print: { chave: "rastreio-gestor", legenda: "Rastreio de venda, visão do gestor.", papel: "gestor" },
        itens: [
          { n: 1, titulo: "Rastreio do time", texto: "O título muda para “Rastreio de venda”: o quadro traz os pedidos de todos os vendedores." },
          { n: 2, titulo: "Todos os vendedores", texto: "Filtra o quadro por uma pessoa. Se ela não tiver pedido em acompanhamento, o quadro avisa." },
          { n: 3, titulo: "Cards com nome", texto: "Cada card mostra quem vendeu, para você saber a quem perguntar." },
        ],
      },
      {
        titulo: "Abrindo o card",
        print: { chave: "rastreio-detalhe", legenda: "Detalhes de um pedido." },
        itens: [
          { n: 1, titulo: "Cliente", texto: "Nome do cliente." },
          { n: 2, titulo: "Etapa atual", texto: "Em que etapa o pedido está agora." },
          { n: 3, titulo: "Pedido, vendedor e data", texto: "Número do pedido, quem vendeu e quando foi lançado." },
          { n: 4, titulo: "Contato", texto: "Telefone e e-mail do cliente, como foram informados na venda." },
          { n: 5, titulo: "Endereço de entrega", texto: "Para onde o pedido vai: rua, cidade, estado e CEP." },
          { n: 6, titulo: "Itens", texto: "Produtos e quantidades. A bonificação aparece como uma linha própria (“… - bonificação”)." },
          { n: 7, titulo: "Valores", texto: "Subtotal, frete e desconto (quando houver) e o total do pedido." },
          { n: 8, titulo: "Dados fiscais e pagamento", texto: "CNPJ ou CPF, inscrição estadual, forma de pagamento e tipo de frete. Confira aqui quando o cliente ligar perguntando de boleto ou de nota." },
          { n: 9, titulo: "Prazos", texto: "A entrega combinada com o cliente e os prazos internos: Fabricar até (PPF) e Expedir até (PPE). Use para saber se a data que você prometeu ainda está de pé." },
          { n: 10, titulo: "Observações", texto: "O que foi anotado no pedido na hora da venda." },
        ],
      },
      {
        titulo: "Nota fiscal e expedição",
        texto: "Esses dados só aparecem quando Operações já os preencheu — em pedido novo eles ainda não existem.",
        print: { chave: "rastreio-expedicao", legenda: "Pedido já faturado, com os dados da expedição." },
        itens: [
          { n: 1, titulo: "Nota fiscal", texto: "O número da nota fiscal de venda, depois de emitida." },
          { n: 2, titulo: "Expedição", texto: "Quantidade de volumes (caixas), peso bruto e a transportadora que leva o pedido." },
        ],
      },
    ],
  },

  // ── Meu Estoque ─────────────────────────────────────────────────────────────
  {
    id: "meu-estoque",
    titulo: "Meu Estoque",
    rota: "/meu-estoque",
    resumo:
      "A sua caixa de estoque: o produto que está com você para vender a pronta entrega. É aqui que você confere, antes de oferecer, se tem o produto em mãos — e confirma quando chega uma remessa de Natal.",
    regras: {
      colaborador: [
        "Você vê só a sua caixa.",
        "O saldo é só leitura: quem corrige a contagem é o time de Operações. Se o número não bate com o que você tem na mala, fale com eles.",
        "A venda a pronta entrega baixa o produto da sua caixa na hora. Se não houver saldo, a venda é recusada — a tela Vender já avisa antes.",
        "Só você confirma a chegada de uma remessa para a sua caixa.",
      ],
      gestor: [
        "Escolhe qualquer vendedor no seletor do topo e vê a caixa dele.",
        "Na caixa de outra pessoa o botão “Recebi” não aparece: quem confirma é o dono da caixa (ou a gestão, pelo Carbo Ops).",
      ],
    },
    blocos: [
      {
        print: { chave: "meu-estoque", legenda: "Meu Estoque, com uma remessa a caminho e uma devolução saindo." },
        itens: [
          { n: 1, titulo: "Unidades e Produtos", texto: "Quantas unidades você tem na caixa, somando tudo, e quantos produtos diferentes têm saldo." },
          { n: 2, titulo: "A caminho", texto: "Quantas unidades já saíram de Natal para você e ainda não chegaram. Fica amarelo enquanto houver algo a caminho." },
          { n: 3, titulo: "Lista “A caminho”", texto: "Cada envio de Natal para a sua caixa, com a data e a observação de quem enviou. Enquanto estiver aqui, o produto ainda não está no seu saldo e não dá para vendê-lo." },
          { n: 4, titulo: "Recebi", texto: "Confirma que a remessa chegou. O produto entra no seu saldo na hora e passa a poder ser vendido. Confirme só o que estiver fisicamente com você: o aceite fica registrado no seu nome." },
          { n: 5, titulo: "Saindo da sua caixa", texto: "Devolução ou repasse que você registrou e o destino ainda não confirmou. O produto já saiu do seu saldo — ele está aqui, não sumiu." },
          { n: 6, titulo: "Buscar produto", texto: "Procura pelo nome ou pelo código do produto." },
          { n: 7, titulo: "Só o que tenho / Tudo", texto: "“Só o que tenho” mostra só os produtos com saldo. “Tudo” mostra o catálogo inteiro, com “zerado” nos que você não tem." },
          { n: 8, titulo: "Saldo por produto", texto: "Nome, código e quantas unidades você tem de cada produto." },
        ],
      },
      {
        titulo: "Não tenho caixa",
        texto:
          "Se a tela disser “Você não tem caixa de estoque”, você ainda não pode vender a pronta entrega: toda venda sua vai para a produção e sai de Natal. Para abrir a sua caixa, fale com o time de Operações.",
      },
      {
        papel: "gestor",
        titulo: "Olhando a caixa de outro vendedor",
        print: { chave: "meu-estoque-gestor", legenda: "O gestor olhando a caixa de outra vendedora.", papel: "gestor" },
        itens: [
          { n: 1, titulo: "Vendedor", texto: "Escolha de quem é a caixa. Os números, a lista e o “A caminho” passam a ser dessa pessoa." },
          { n: 2, titulo: "Sem o botão “Recebi”", texto: "Na caixa de outra pessoa você só acompanha. Quem confirma a chegada é quem está com o produto na mão; a gestão confirma pelo Carbo Ops, onde a decisão fica registrada no nome dela." },
        ],
      },
    ],
  },

  // ── Requisição de Compra ────────────────────────────────────────────────────
  {
    id: "compras",
    titulo: "Requisição de Compra",
    rota: "/compras",
    resumo:
      "Para pedir material de trabalho para você mesmo — fone, mochila, material de escritório, um programa. A solicitação vai para o Financeiro, no Carbo Finanças, que aprova e faz a compra. Insumo do setor (o que é da operação, não seu) é pedido no Carbo Ops.",
    regras: {
      colaborador: [
        "Toda solicitação feita aqui é PESSOAL: material para o seu uso.",
        "Você vê só as solicitações que você fez.",
        "Quem aprova, cota e compra é o Financeiro. Por aqui não dá para editar nem cancelar uma solicitação já feita — fale com o Financeiro.",
      ],
      gestor: [
        "A tela é a mesma: o gestor também só faz e vê as próprias solicitações.",
        "A aprovação das solicitações acontece no Carbo Finanças, não aqui.",
      ],
    },
    blocos: [
      {
        print: { chave: "compras", legenda: "Nova solicitação e a lista das suas solicitações." },
        itens: [
          { n: 1, titulo: "Compra pessoal", texto: "Lembra para onde a solicitação vai (Requisições do Carbo Finanças) e que insumo do setor é pedido no Carbo Ops." },
          { n: 2, titulo: "Categoria", texto: "Obrigatória: Material de escritório, Equipamento / periférico, EPI / segurança, Software / licença ou Outro." },
          { n: 3, titulo: "Link de referência", texto: "Opcional. Cole o link do produto que você quer — ajuda o Financeiro a comprar o item certo." },
          { n: 4, titulo: "Adicionar item", texto: "Acrescenta mais uma linha de item na mesma solicitação." },
          { n: 5, titulo: "Item", texto: "O que comprar (obrigatório), a quantidade, a unidade (un, kg, cx, par…) e o valor unitário que você encontrou." },
          { n: 6, titulo: "Valor estimado", texto: "A soma dos itens (quantidade × valor unitário). É uma estimativa: o valor final é o da compra." },
          { n: 7, titulo: "Cotações (opcional)", texto: "Se você levantou preço em mais de um lugar, abra aqui e adicione, para cada item, o fornecedor, o preço, o link e uma observação (prazo, condição). Você pode marcar a cotação escolhida; o Financeiro também pode completar depois." },
          { n: 8, titulo: "Observação", texto: "Opcional. Para que você precisa — ajuda o Financeiro a decidir." },
          { n: 9, titulo: "Limpar", texto: "Apaga o que foi preenchido e começa de novo." },
          { n: 10, titulo: "Salvar rascunho", texto: "Guarda a solicitação sem mandar para aprovação. Ela aparece na lista como Rascunho." },
          { n: 11, titulo: "Enviar para aprovação", texto: "Manda a solicitação para o Financeiro. Ela aparece na lista como Aguardando aprovação." },
          { n: 12, titulo: "Minhas Solicitações", texto: "Tudo o que você pediu, com o número, o valor estimado, a situação e a data. O número aparece como “—” até o Financeiro numerar a solicitação." },
        ],
      },
      {
        titulo: "A situação da solicitação",
        itens: [
          { titulo: "Rascunho", texto: "Guardada, ainda não enviada ao Financeiro." },
          { titulo: "Aguardando aprovação", texto: "Com o Financeiro, esperando a decisão." },
          { titulo: "Aprovada", texto: "O Financeiro aprovou; a compra vai ser feita." },
          { titulo: "Convertida em OC", texto: "Virou ordem de compra: o pedido ao fornecedor já foi feito." },
          { titulo: "Rejeitada", texto: "O Financeiro não aprovou. Para saber o motivo, fale com ele." },
        ],
      },
    ],
  },
];
