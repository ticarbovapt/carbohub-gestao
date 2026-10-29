import type { Secao } from "../tipos";

// Suprimentos (estoque por galpão), Estoque dos Vendedores e Requisição de Compra.
// ⚠️ O `n` de cada item é o marcador do print (docs-prints/shots_suprimentos.mjs).

export const SECOES_SUPRIMENTOS: Secao[] = [
  // ── Suprimentos ─────────────────────────────────────────────────────────────
  {
    id: "suprimentos",
    titulo: "Suprimentos",
    rota: "/suprimentos",
    resumo:
      "É o estoque da empresa, galpão por galpão: Hub Natal (onde se produz), CD SP LogHouse (de onde sai a venda on-line), CD SP Vendas, CD Bling, Escritório e o ML Full (o que está guardado no Mercado Livre). Aqui você vê o saldo, registra entrada e ajuste, manda mercadoria de um estoque para outro, aceita o que chegou, define o estoque mínimo e cuida do mapa que liga o anúncio da loja on-line ao produto da prateleira.",
    regras: {
      colaborador: [
        "Vê o estoque de todos os galpões e todas as movimentações.",
        "Pode registrar entrada, ajustar saldo, registrar envio, aceitar recebimento, mexer no estoque mínimo e no mapa de SKU.",
        "Tudo o que muda o saldo fica registrado em Movimentações, com o seu nome.",
      ],
      gestor: [
        "Vê e faz o mesmo que o colaborador: esta tela não muda para o gestor.",
      ],
    },
    blocos: [
      {
        titulo: "O estoque de um galpão",
        print: { chave: "sup-estoque", legenda: "Suprimentos, aba Estoque do Hub Natal." },
        itens: [
          { n: 1, titulo: "Galpões", texto: "Escolhe qual estoque você está olhando. As abas e os números abaixo mudam para o galpão escolhido. O endereço da página guarda o galpão e a aba: dá para mandar o link para um colega." },
          { n: 2, titulo: "Registrar Envio", texto: "Manda mercadoria deste galpão para outro, para a caixa de um vendedor ou para um licenciado. Veja “Mandar mercadoria para outro estoque”, abaixo. Não aparece no CD Bling nem no ML Full." },
          { n: 3, titulo: "Período", texto: "Últimos 7 dias, 30 dias, este mês, um mês específico ou um período que você escolhe. Vale para os números de entradas e saídas e para a lista de Movimentações." },
          { n: 4, titulo: "Números do galpão", texto: "Total de produtos, quantos estão abaixo do mínimo (Em Baixa) e quantas entradas, saídas e movimentações houve no período." },
          { n: 5, titulo: "Abas", texto: "Estoque, Movimentações, Envios, Recebimento e Política de Estoque existem em todos os galpões. Alguns têm abas próprias: o CD SP LogHouse tem Em Trânsito e Mapeamento SKU; o CD SP Vendas tem Remessas; o Hub Natal tem Notas Fiscais (ainda sem uso)." },
          { n: 6, titulo: "Buscar produto", texto: "Filtra pelo nome ou pelo código." },
          { n: 7, titulo: "Categoria", texto: "Mostra só uma categoria: Produto Final, Semi-acabado, Insumo, Embalagem, Carbonatação ou Trade Marketing." },
          { n: 8, titulo: "Só em baixa", texto: "Mostra só o que está abaixo do estoque mínimo deste galpão. O número entre parênteses é quantos são." },
          { n: 9, titulo: "Nova Entrada", texto: "Lança mercadoria que chegou neste galpão, ou acerta o saldo de um produto. Veja abaixo." },
          { n: 10, titulo: "Expandir / Recolher tudo", texto: "Abre ou fecha todos os grupos de categoria de uma vez. O navegador lembra o que você deixou fechado." },
          { n: 11, titulo: "Grupo de categoria", texto: "Clique para abrir ou fechar. Mostra quantos itens há e quantos estão em baixa." },
          { n: 12, titulo: "Cartão do produto", texto: "O saldo neste galpão, o mínimo e a situação: OK, Abaixo do mínimo, Zerado ou Sem mínimo (quando ninguém definiu o mínimo). A barra mostra o saldo comparado com o mínimo; clicar nela também abre o ajuste." },
          { n: 13, titulo: "Lápis (ajustar)", texto: "Corrige o saldo deste produto neste galpão. Veja abaixo." },
        ],
      },
      {
        titulo: "Aviso de reposição no CD SP",
        print: { chave: "sup-sp-alerta", legenda: "CD SP LogHouse: aviso de produto abaixo do mínimo." },
        itens: [
          { n: 1, titulo: "Produtos abaixo do nível de segurança", texto: "No CD SP LogHouse, aparece a lista do que ficou abaixo do mínimo, com o saldo de cada um. É o sinal para mandar reposição de Natal." },
          { n: 2, titulo: "Estoque do CD contratado", texto: "Lembra que o saldo do CD SP é atualizado pelas transferências e pelas contagens da LogHouse. Quando a LogHouse confirmar uma entrada, lance aqui." },
          { titulo: "Venda on-line baixa sozinha", texto: "As vendas da loja on-line (Nuvemshop, Mercado Livre, Amazon…) que saem da LogHouse baixam o estoque do CD SP sozinhas, alguns minutos depois de pagas. Por isso o saldo pode ficar negativo quando a LogHouse está sem produto: o número negativo é quanto ela deve quando o lote chegar. Venda cancelada devolve o saldo." },
        ],
      },
      {
        titulo: "Ajustar o saldo de um produto",
        print: { chave: "sup-ajuste", legenda: "Ajustar Estoque, aberto pelo lápis do cartão." },
        itens: [
          { n: 1, titulo: "Quantidade atual", texto: "O que o sistema diz que há hoje neste galpão." },
          { n: 2, titulo: "Nova quantidade", texto: "O saldo CERTO, contado na prateleira — não a diferença. Se o sistema diz 186 e você contou 192, digite 192." },
          { n: 3, titulo: "Motivo", texto: "Por que mudou: contagem, perda, correção… Fica registrado na movimentação." },
          { n: 4, titulo: "Salvar Ajuste", texto: "Grava o novo saldo. A diferença aparece em Movimentações como Ajuste, com o seu nome." },
          { titulo: "Contou e chegou venda no meio?", texto: "No CD SP as vendas on-line baixam o saldo a cada poucos minutos. Ajuste logo depois de contar; se demorar, uma venda que saiu entre a contagem e o ajuste some da conta." },
        ],
      },
      {
        titulo: "Lançar uma entrada",
        print: { chave: "sup-entrada", legenda: "Nova Entrada de Estoque." },
        itens: [
          { n: 1, titulo: "Produto", texto: "O produto que chegou." },
          { n: 2, titulo: "Quantidade", texto: "Quanto chegou (no tipo Entrada) ou o saldo final (no tipo Ajuste)." },
          { n: 3, titulo: "Tipo", texto: "Entrada (somar) acrescenta a quantidade ao saldo atual. Ajuste (definir saldo) troca o saldo pelo número digitado." },
          { n: 4, titulo: "Observações", texto: "NF, lote, motivo. Opcional, mas ajuda quem for conferir depois." },
          { n: 5, titulo: "Destino", texto: "O galpão que recebe a entrada: sempre o que está aberto na tela." },
          { n: 6, titulo: "Registrar Entrada", texto: "Grava e atualiza o saldo na hora." },
          { titulo: "Mercadoria que veio de outro galpão", texto: "Não lance como entrada: aceite em Recebimento. Lançar à mão contaria a mesma mercadoria duas vezes." },
        ],
      },
      {
        titulo: "Movimentações",
        print: { chave: "sup-movimentacoes", legenda: "Movimentações do CD SP LogHouse." },
        itens: [
          { n: 1, titulo: "Filtrar por produto", texto: "Procura pelo nome ou código do produto em todas as movimentações do período." },
          { n: 2, titulo: "Entradas e saídas", texto: "Mostra tudo, só as entradas ou só as saídas." },
          { n: 3, titulo: "Quantas e de quando", texto: "Quantas movimentações a lista tem e o período escolhido lá em cima. A lista mostra no máximo as 300 mais recentes; se passar disso, a tela avisa — filtre por produto ou encurte o período." },
          { n: 4, titulo: "Tipo", texto: "Entrada (somou ao saldo) ou Saída (tirou do saldo)." },
          { n: 5, titulo: "Por", texto: "Quem fez. “Automático” quer dizer que foi o sistema — por exemplo, a baixa de uma venda on-line. Um traço quer dizer que não se sabe quem fez (movimento antigo)." },
          { n: 6, titulo: "Origem", texto: "O que causou: Venda on-line, Venda, Ajuste, Transferência ou Produção, com o detalhe ao lado (por exemplo, “1 × 5 un · SKU 124”: uma venda do kit de 5)." },
          { n: 7, titulo: "Pedido on-line com link", texto: "O número do pedido na loja. Em azul, com a setinha, abre o pedido na Esteira do On-line (no Admin)." },
          { n: 8, titulo: "Pedido on-line sem link", texto: "O pedido ainda não foi faturado no Bling, por isso ainda não tem card na Esteira. A baixa já aconteceu; o link aparece depois." },
          { n: 9, titulo: "Pedido de venda", texto: "O número do pedido do sistema que tirou o produto. Ajuste e transferência não têm pedido e mostram um traço." },
        ],
      },
      {
        titulo: "Mandar mercadoria para outro estoque",
        texto:
          "O envio tem duas etapas. Ao registrar, o saldo SAI do galpão de origem na hora e fica em trânsito. Ele só ENTRA no destino quando alguém de lá der o aceite (aba Recebimento). Assim ninguém vende o que ainda está na estrada.",
        print: { chave: "sup-envio", legenda: "Registrar envio entre estoques." },
        itens: [
          { n: 1, titulo: "Origem", texto: "De onde sai. Já vem com o galpão da tela em que você está; confira antes de registrar." },
          { n: 2, titulo: "Destino", texto: "Para onde vai: outro galpão, um licenciado ou a caixa de um vendedor." },
          { n: 3, titulo: "Produto", texto: "O que está sendo enviado." },
          { n: 4, titulo: "Quantidade", texto: "Quanto sai. O sistema recusa se a origem não tiver saldo suficiente." },
          { n: 5, titulo: "Obs.", texto: "NF, número da remessa. Aparece no cartão do envio." },
          { n: 6, titulo: "Adicionar outro envio", texto: "Mais uma linha, com outro destino ou outro produto, saindo da mesma origem." },
          { n: 7, titulo: "O que vai acontecer", texto: "Resume, antes do clique, de onde o saldo sai e que ele fica em trânsito até o aceite." },
          { n: 8, titulo: "Registrar Envio", texto: "Grava os envios e debita a origem." },
        ],
      },
      {
        titulo: "Os destinos possíveis",
        print: { chave: "sup-envio-destinos", legenda: "A lista de destinos do envio." },
        itens: [
          { n: 1, titulo: "Galpões", texto: "Os outros estoques da empresa. O aceite é feito na aba Recebimento do galpão de destino." },
          { n: 2, titulo: "Licenciados", texto: "Cada licenciado tem o seu estoque. O aceite é feito pelo próprio licenciado, na tela de recebimentos do portal dele; só então o saldo conta para ele. O reagente vai para o estoque de reagente do licenciado, que é o que a ordem de serviço usa." },
          { n: 3, titulo: "Estoque de vendedor", texto: "A caixa de cada vendedor, para venda a pronta entrega. O aceite é feito em Estoque dos Vendedores (botão Chegou)." },
        ],
      },
      {
        titulo: "Envios: o que saiu daqui",
        print: { chave: "sup-envios", legenda: "Aba Envios do Hub Natal." },
        itens: [
          { n: 1, titulo: "Contagem", texto: "Quantos envios estão em trânsito, quantos foram entregues (aceitos) e quantos foram estornados." },
          { n: 2, titulo: "Para onde", texto: "O destino de cada envio, quando e por quem foi registrado, e a observação." },
          { n: 3, titulo: "Aceito", texto: "Quando o destino deu o aceite e quem deu. A partir daí a mercadoria é responsabilidade de quem aceitou." },
          { n: 4, titulo: "Situação", texto: "Em trânsito, Entregue ou Estornado. Aqui não há botão de confirmar: quem confirma é quem recebe." },
        ],
      },
      {
        titulo: "Recebimento: o que está chegando",
        print: { chave: "sup-recebimento", legenda: "Aba Recebimento do CD SP LogHouse." },
        itens: [
          { n: 1, titulo: "Contagem", texto: "Quantos envios estão esperando o aceite e quantos já foram recebidos." },
          { n: 2, titulo: "De onde", texto: "O galpão que mandou, quando, quem registrou e a observação (NF, remessa)." },
          { n: 3, titulo: "Aceitar recebimento", texto: "Confirme depois de conferir a mercadoria. O saldo entra neste galpão e fica registrado que foi você." },
          { n: 4, titulo: "Não chegou / Estornar", texto: "Use quando a carga não saiu ou não vai chegar. O envio é cancelado e a quantidade volta para o estoque de origem." },
          { n: 5, titulo: "Já recebido", texto: "Envio aceito, com a data e o nome de quem aceitou." },
          { titulo: "Em Trânsito e Remessas", texto: "O CD SP LogHouse tem também a aba Em Trânsito, e o CD SP Vendas a aba Remessas: as duas mostram o que está indo para lá, com os mesmos botões de aceitar e estornar." },
        ],
      },
      {
        print: { chave: "sup-aceite", legenda: "A confirmação antes do aceite." },
        itens: [
          { n: 1, titulo: "Cancelar", texto: "Fecha sem mudar nada." },
          { n: 2, titulo: "Confirmar Chegada", texto: "Marca o envio como entregue e soma a quantidade no estoque deste galpão. No estorno, o botão é “Confirmar Estorno” e a quantidade volta para a origem." },
        ],
      },
      {
        titulo: "Mapeamento SKU (CD SP LogHouse)",
        texto:
          "Cada anúncio da loja on-line tem um código (SKU). O mapa diz a qual produto da prateleira aquele código corresponde e quanto sai a cada venda. É ele que faz a venda on-line baixar o estoque do CD SP e que faz os painéis de venda contarem as unidades certas. Produto novo entra por aqui, sem precisar do TI.",
        print: { chave: "sup-mapa", legenda: "Mapeamento SKU, lista dos mapas cadastrados." },
        itens: [
          { n: 1, titulo: "Duas perguntas", texto: "Cliente recebe (quantas unidades vão na caixa do comprador) e Estoque baixa (o que sai da prateleira). O kit de 10 sachês entrega 10 sachês e tira 1 caixa fechada, porque a LogHouse guarda a caixa; o kit de 5 frascos entrega 5 e tira 5." },
          { n: 2, titulo: "Mapeamentos", texto: "Os mapas cadastrados, com a quantidade." },
          { n: 3, titulo: "SKUs vendidos sem mapa", texto: "A lista de trabalho: códigos que já venderam e não têm mapa. O número vermelho é quantos são. Veja abaixo." },
          { n: 4, titulo: "Novo mapeamento", texto: "Cadastra um mapa novo." },
          { n: 5, titulo: "SKU e plataforma", texto: "O código do anúncio e a loja. “Todas as plataformas” vale para qualquer loja que venda o mesmo código — é o caso comum. Um mapa de uma loja específica vale mais que o geral." },
          { n: 6, titulo: "Cliente recebe", texto: "Quantas unidades o comprador leva por venda. É o número que os painéis de venda contam. “não informado” (em amarelo) quer dizer que falta preencher." },
          { n: 7, titulo: "Estoque baixa", texto: "Quantas unidades de qual produto saem da prateleira a cada venda." },
          { n: 8, titulo: "Ativo / inativo", texto: "A bolinha verde liga e desliga o mapa. Mapa desligado não baixa estoque." },
          { n: 9, titulo: "Editar", texto: "Abre o mapa para corrigir." },
          { n: 10, titulo: "Apagar", texto: "Remove o mapa, depois de confirmar. As vendas daquele código deixam de baixar estoque até alguém mapear de novo." },
          { n: 11, titulo: "Não informado", texto: "Cadastro antigo sem o número do cliente. Edite e preencha “Cliente recebe”." },
        ],
      },
      {
        titulo: "SKUs vendidos sem mapa",
        print: { chave: "sup-sem-mapa", legenda: "A lista do que vendeu e ainda não tem mapa." },
        itens: [
          { n: 1, titulo: "Código e loja", texto: "O SKU que chegou nas vendas e de qual loja ele veio, com o nome do anúncio ao lado." },
          { n: 2, titulo: "Quanto vendeu", texto: "Quantas unidades, em quantas linhas de pedido, e a data da última venda. A lista vem do maior volume para o menor." },
          { n: 3, titulo: "Mapear", texto: "Abre o cadastro já com o código e a loja preenchidos — só falta escolher o produto e as quantidades." },
          { n: 4, titulo: "Sem SKU na origem", texto: "A venda chegou sem código nenhum, porque o anúncio está sem SKU no painel da loja. Não dá para mapear aqui (o botão fica apagado): a correção é preencher o SKU no anúncio, na própria loja. Enquanto isso, essas vendas não baixam estoque." },
          { titulo: "SKU sem mapa não dá erro", texto: "A venda simplesmente não baixa nada do estoque. Por isso vale olhar esta lista de vez em quando, principalmente depois de criar um anúncio novo." },
        ],
      },
      {
        titulo: "Cadastrar ou editar um mapa",
        print: { chave: "sup-mapa-form", legenda: "Novo mapeamento de SKU." },
        itens: [
          { n: 1, titulo: "SKU da plataforma", texto: "O código exatamente como está no anúncio." },
          { n: 2, titulo: "Plataforma", texto: "Todas as plataformas, ou uma loja só (Mercado Livre, Amazon, Nuvemshop, Shopee, PayT)." },
          { n: 3, titulo: "Produto de onde a unidade sai", texto: "O produto que o galpão GUARDA. O frasco de 100ml fica avulso na prateleira; o sachê fica na caixa fechada, e aí o produto é a caixa. Confira o saldo no CD SP antes: apontar para um produto que nunca tem saldo leva o estoque ao negativo na primeira venda." },
          { n: 4, titulo: "Cliente recebe, por venda", texto: "Kit de 5 frascos = 5. Kit de 10 sachês = 10." },
          { n: 5, titulo: "Estoque baixa, por venda", texto: "Número inteiro. Kit de 5 frascos apontando para o frasco = 5. Kit de 10 sachês apontando para a caixa = 1. Se você escolher um kit e puser mais que 1, a tela avisa: cada venda baixaria vários kits." },
          { n: 6, titulo: "Salvar", texto: "Grava o mapa. Só pode existir um mapa ativo para o mesmo código na mesma loja; se já houver, a tela diz para editar o existente." },
        ],
      },
      {
        titulo: "Política de Estoque",
        print: { chave: "sup-politica", legenda: "Política de Estoque do Hub Natal." },
        itens: [
          { n: 1, titulo: "Buscar produto", texto: "Filtra pelo nome ou código." },
          { n: 2, titulo: "Mínimo", texto: "O estoque mínimo de segurança deste produto NESTE galpão. Cada galpão tem o seu. Um traço quer dizer que não há mínimo, e aí o produto nunca entra no aviso de baixa." },
          { n: 3, titulo: "Configurar", texto: "Define o mínimo. Quando o saldo cair abaixo dele, o produto aparece como “Abaixo do mínimo”, conta em Em Baixa e, no CD SP, entra no aviso de reposição." },
        ],
      },
      {
        titulo: "ML Full",
        texto:
          "O ML Full mostra o que está guardado nos galpões do Mercado Livre (Full). Não é um galpão nosso: os números vêm do próprio Mercado Livre, atualizados a cada 15 minutos, e a venda lá não baixa nada daqui. A tela responde uma pergunta: preciso mandar mais para o Full?",
        print: { chave: "sup-mlfull", legenda: "ML Full: o estoque no Mercado Livre e as remessas a caminho." },
        itens: [
          { n: 1, titulo: "ML Full", texto: "Abre esta visão. Ela só tem a aba Estoque." },
          { n: 2, titulo: "Espelho do ML", texto: "Há quanto tempo os números foram lidos do Mercado Livre. Fica vermelho quando estão velhos — aí o número pode não ser o de agora." },
          { n: 3, titulo: "Atualizar", texto: "Relê a lista. A tela também se atualiza sozinha a cada minuto." },
          { n: 4, titulo: "No ML", texto: "Quanto o Mercado Livre diz que tem disponível para cada anúncio. Em vermelho quando zerou. Cada anúncio é um estoque separado no Full, mesmo quando é o mesmo produto." },
          { n: 5, titulo: "Em trânsito", texto: "O que já mandamos e o Mercado Livre ainda não recebeu. Explica um “No ML” baixo logo depois de um envio." },
          { n: 6, titulo: "Remessa", texto: "Registra um envio para o Full: a quantidade sai do Hub Natal e fica em trânsito. O número do ML só sobe quando o Mercado Livre receber." },
          { n: 7, titulo: "Sem mapa de SKU", texto: "O anúncio não tem mapa, então o sistema não sabe qual produto nosso sai da prateleira: a remessa fica indisponível. O número do ML continua valendo. Para liberar, cadastre o mapa no Mapeamento SKU." },
          { n: 8, titulo: "Em trânsito para o Full", texto: "As remessas já registradas e ainda não recebidas: produto, quantidade, de onde saiu, quando e a observação." },
          { n: 9, titulo: "Chegou", texto: "Marca a remessa como recebida pelo Mercado Livre. Nada é somado aqui: o saldo do Full vem do próprio ML." },
          { n: 10, titulo: "Cancelar", texto: "Cancela a remessa (pede o motivo) e a quantidade volta para o galpão de onde saiu." },
        ],
      },
      {
        titulo: "CD Bling",
        itens: [
          { titulo: "Saldo da integração", texto: "O CD Bling mostra o saldo que vem do Bling. Por isso não tem Registrar Envio, números do período nem estoque mínimo: um número lançado à mão ali seria apagado na próxima sincronização." },
        ],
      },
    ],
  },

  // ── Estoque dos Vendedores ──────────────────────────────────────────────────
  {
    id: "estoque-vendedores",
    titulo: "Estoque dos Vendedores",
    rota: "/suprimentos/vendedores",
    resumo:
      "Cada vendedor tem uma caixa: o estoque que ele leva consigo para vender a pronta entrega. Aqui você vê o que cada um tem, abastece a caixa a partir do Hub Natal, confirma a chegada, recebe as devoluções e corrige o saldo depois de uma contagem. A venda a pronta entrega lançada pelo vendedor baixa direto da caixa dele.",
    regras: {
      colaborador: [
        "Vê as caixas de todos os vendedores.",
        "Pode enviar, confirmar chegada, receber devolução, corrigir saldo e definir o mínimo de cada produto na caixa.",
      ],
      gestor: [
        "Vê e faz o mesmo que o colaborador: esta tela não muda para o gestor.",
      ],
    },
    blocos: [
      {
        titulo: "As caixas",
        print: { chave: "vend-caixas", legenda: "Estoque dos Vendedores, com a caixa da Ana aberta." },
        itens: [
          { n: 1, titulo: "Só o que tem saldo / Mostrando tudo", texto: "Dentro de cada caixa, mostra só os produtos com saldo ou o catálogo inteiro (com os zerados, que é o que falta na caixa)." },
          { n: 2, titulo: "A caminho", texto: "O que já saiu de Natal para a caixa de um vendedor e ainda não foi confirmado. Enquanto está aqui, não conta no saldo de ninguém." },
          { n: 3, titulo: "Chegou", texto: "Confirme quando o vendedor receber. O saldo entra na caixa dele na hora." },
          { n: 4, titulo: "Voltando", texto: "O que saiu da caixa de um vendedor (devolução ou repasse) e ainda não chegou ao destino." },
          { n: 5, titulo: "Recebi", texto: "Confirme quando a devolução chegar. O saldo entra no destino (o Hub Natal ou a caixa de outro vendedor)." },
          { n: 6, titulo: "Números", texto: "Quantos vendedores têm caixa, quantas unidades estão em campo e quantos envios estão a caminho." },
          { n: 7, titulo: "Abrir a caixa", texto: "Clique no nome do vendedor para ver os produtos da caixa dele, com o saldo de cada um." },
          { n: 8, titulo: "Devolver", texto: "Tira produto da caixa e manda de volta para o Hub Natal ou para a caixa de outro vendedor. Só aparece quando a caixa tem saldo." },
          { n: 9, titulo: "Enviar", texto: "Abastece a caixa com produto do Hub Natal." },
          { n: 10, titulo: "Mínimo", texto: "Clique para definir o mínimo daquele produto na caixa (Enter grava, Esc desiste). Com o sino em amarelo, a caixa está abaixo do mínimo. “mín —” quer dizer sem mínimo, sem aviso." },
          { n: 11, titulo: "Lápis (corrigir saldo)", texto: "Acerta o saldo depois de contar a caixa. Veja abaixo." },
          { n: 12, titulo: "Não vende a pronta entrega", texto: "A caixa está vazia: esse vendedor só consegue vender sob produção até ser abastecido." },
          { titulo: "De onde vem a caixa", texto: "A caixa nasce sozinha quando o cadastro da pessoa é marcado como vendedor. Se alguém deveria aparecer aqui e não aparece, confira o cadastro dele." },
        ],
      },
      {
        titulo: "Abastecer uma caixa",
        print: { chave: "vend-enviar", legenda: "Enviar para a caixa de um vendedor." },
        itens: [
          { n: 1, titulo: "Produto", texto: "O que vai para a caixa. Ao lado do nome, o saldo que o Hub Natal tem." },
          { n: 2, titulo: "Quantidade", texto: "Quanto vai. Embaixo, quanto há em Natal e quanto já há na caixa. Se pedir mais do que Natal tem, o botão fica bloqueado." },
          { n: 3, titulo: "Observação", texto: "Opcional: reposição da semana, viagem de terça…" },
          { n: 4, titulo: "Enviar", texto: "O produto sai do Hub Natal e fica a caminho. Só entra na caixa quando alguém confirmar a chegada (botão Chegou)." },
        ],
      },
      {
        titulo: "Corrigir o saldo da caixa",
        print: { chave: "vend-ajuste", legenda: "Corrigir saldo, aberto pelo lápis do produto." },
        itens: [
          { n: 1, titulo: "O que o sistema diz", texto: "O produto, o vendedor e o saldo que o sistema tem hoje." },
          { n: 2, titulo: "Quantidade contada", texto: "Digite o que você contou na caixa. Embaixo aparece a diferença: baixa (em vermelho) ou entrada (em verde)." },
          { n: 3, titulo: "Motivo", texto: "Erro de contagem, Quebra / avaria, Perda / extravio, Amostra / degustação, Devolução de cliente ou Outro." },
          { n: 4, titulo: "Corrigir", texto: "Grava o saldo novo. O movimento fica registrado no histórico, com o motivo." },
        ],
      },
      {
        titulo: "Devolver da caixa",
        print: { chave: "vend-devolver", legenda: "Devolver da caixa de um vendedor." },
        itens: [
          { n: 1, titulo: "Produto", texto: "Só os produtos que a caixa tem, com a quantidade." },
          { n: 2, titulo: "Para onde vai", texto: "Hub Natal (devolução) ou a caixa de outro vendedor (repasse)." },
          { n: 3, titulo: "Quantidade", texto: "Quanto sai. Não pode passar do que a caixa tem." },
          { n: 4, titulo: "Motivo / observação", texto: "Sobra da rota, produto perto do vencimento, repasse…" },
          { n: 5, titulo: "Devolver", texto: "Sai da caixa na hora e fica em “Voltando”. Só entra no destino quando alguém confirmar (botão Recebi)." },
        ],
      },
    ],
  },

  // ── Requisição de Compra ────────────────────────────────────────────────────
  {
    id: "compras",
    titulo: "Requisição de Compra",
    rota: "/requisicoes",
    resumo:
      "Para pedir uma compra: insumo, embalagem, peça de manutenção, equipamento — ou material de trabalho para você. A requisição vai para a aba Requisições do Carbo Finanças, que aprova, cota, faz a ordem de compra, recebe a nota e paga. Por aqui você abre a requisição e acompanha a situação dela.",
    regras: {
      colaborador: [
        "Abre requisição para o setor ou para uso pessoal, em seu nome ou em nome de um colega.",
        "Vê as requisições que abriu e as que foram abertas em seu nome.",
        "Quem aprova, cota e compra é o Financeiro, no Carbo Finanças. Por aqui não dá para editar nem cancelar uma requisição já enviada — fale com o Financeiro.",
      ],
      gestor: [
        "A tela é a mesma: o gestor também só abre e vê as próprias requisições.",
        "A aprovação acontece no Carbo Finanças, não aqui.",
      ],
    },
    blocos: [
      {
        titulo: "Nova requisição",
        print: { chave: "compras-nova", legenda: "Nova requisição de compra do setor." },
        itens: [
          { n: 1, titulo: "Para onde vai", texto: "Lembra que a requisição segue para a aba Requisições do Carbo Finanças." },
          { n: 2, titulo: "Solicitante", texto: "De quem é a necessidade. Já vem “Eu — para mim”; escolha um colega para abrir em nome dele. Veja abaixo." },
          { n: 3, titulo: "Compra do setor", texto: "Insumo e operação: reposição de estoque, produção, manutenção, equipamento." },
          { n: 4, titulo: "Compra individual", texto: "Material de trabalho de uso pessoal. O formulário fica mais curto (veja abaixo)." },
          { n: 5, titulo: "Motivo da requisição", texto: "Obrigatório na compra do setor: reposição (estoque de segurança atingido), ruptura, aumento de demanda, novo produto ou projeto, manutenção, equipamento (investimento) ou outro." },
          { n: 6, titulo: "Prioridade", texto: "Normal, Alta ou Crítica. Use Crítica só para o que para a operação." },
          { n: 7, titulo: "Centro de Custo", texto: "Obrigatório na compra do setor: a área que paga a compra (Produção, Operações, Manutenção, Logística…)." },
          { n: 8, titulo: "Precisa até", texto: "Opcional: a data em que o item tem de estar aqui." },
          { n: 9, titulo: "Adicionar item", texto: "Mais uma linha de item na mesma requisição." },
          { n: 10, titulo: "Item", texto: "O que comprar (obrigatório), a quantidade, a unidade (un, kg, L, cx, pç…) e o valor unitário que você conhece. A lixeira tira a linha." },
          { n: 11, titulo: "Valor estimado", texto: "A soma dos itens (quantidade × valor unitário). É uma estimativa: o valor final é o da compra." },
          { n: 12, titulo: "Cotações (opcional)", texto: "Se você já levantou preço, abra aqui e adicione, para cada item, o fornecedor, o preço, o link e uma observação (prazo, condição). Dá para marcar a cotação escolhida. O comprador também pode completar no Finanças." },
          { n: 13, titulo: "Observações", texto: "Opcional: contexto para o comprador." },
          { n: 14, titulo: "Limpar", texto: "Apaga o que foi preenchido e começa de novo." },
          { n: 15, titulo: "Salvar rascunho", texto: "Guarda sem mandar para aprovação. Aparece na lista como Rascunho." },
          { n: 16, titulo: "Enviar para aprovação", texto: "Manda para o Financeiro. Aparece na lista como Aguardando aprovação." },
        ],
      },
      {
        titulo: "Abrir em nome de um colega",
        print: { chave: "compras-em-nome", legenda: "Requisição aberta em nome de outra pessoa." },
        itens: [
          { n: 1, titulo: "Solicitante", texto: "Escolha a pessoa que precisa do item. O quadro fica amarelo para você não esquecer que está abrindo em nome de outra pessoa." },
          { n: 2, titulo: "Quem fica registrado", texto: "A requisição sai no nome do colega, e fica registrado que quem lançou foi você. Ela aparece na lista dos dois." },
        ],
      },
      {
        titulo: "Compra individual",
        print: { chave: "compras-individual", legenda: "Os campos da compra individual." },
        itens: [
          { n: 1, titulo: "Categoria", texto: "Obrigatória: Material de escritório, Equipamento / periférico, EPI / segurança, Software / licença ou Outro." },
          { n: 2, titulo: "Link de referência", texto: "Opcional: o link do produto que você quer, para o Financeiro comprar o item certo." },
          { titulo: "Sem centro de custo e prioridade", texto: "Na compra individual esses campos não aparecem: ela é lançada como pessoal, com prioridade normal." },
        ],
      },
      {
        titulo: "Requisições que eu abri",
        print: { chave: "compras-lista", legenda: "A lista das suas requisições." },
        itens: [
          { n: 1, titulo: "Nº RC", texto: "O número da requisição. Enquanto a requisição não tem número (rascunho), aparece um traço." },
          { n: 2, titulo: "Solicitante", texto: "Aparece quando há requisição aberta em nome de outra pessoa: “Eu” ou o nome do colega (em amarelo)." },
          { n: 3, titulo: "Escopo", texto: "Do setor ou Individual." },
          { n: 4, titulo: "Status", texto: "A situação da requisição (veja abaixo)." },
          { n: 5, titulo: "Páginas", texto: "Quantas requisições há, quantas mostrar por página (20, 50 ou 100) e os botões para passar de página." },
        ],
      },
      {
        titulo: "A situação da requisição",
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
