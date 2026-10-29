import type { Secao } from "../tipos";

// Ordens de Serviço (descarbonização CarboVAPT) e Agenda de visitas (RTM).
// ⚠️ O `n` de cada item é o marcador do print (docs-prints/shots_campo.mjs).

export const SECOES_CAMPO: Secao[] = [
  // ── Ordens de Serviço ───────────────────────────────────────────────────────
  {
    id: "os",
    titulo: "Ordens de Serviço",
    rota: "/os",
    resumo:
      "Aqui você acompanha as ordens de serviço (OS) da descarbonização CarboVAPT. A OS é o pedido de execução que vai para o portal dos licenciados: a OS nasce da venda (ou é aberta aqui), o Ops e o Sales acompanham, e quem executa registra cada veículo pelo Carbox. É a mesma tela das Ordens de Serviço do Sales. A tela tem três visões da mesma lista — Quadro, Lista e Agenda — e muda sozinha quando uma OS anda lá no portal.",
    regras: {
      colaborador: [
        "Vê todas as ordens de serviço da descarbonização, de todo o time.",
        "Cria OS nova pelo botão “Nova descarbonização”.",
        "Não move a OS de etapa: quem diz que começou ou terminou é quem executa, no Carbox.",
      ],
      gestor: [
        "Vê e faz o mesmo que o colaborador: esta tela não muda para o gestor.",
      ],
    },
    blocos: [
      {
        titulo: "De onde vem a OS",
        itens: [
          { titulo: "Da venda", texto: "Toda venda CarboVAPT lançada em Vender cria a OS sozinha, com uma vaga para cada veículo vendido. A placa e o modelo de cada carro são preenchidos por quem executa, na hora do serviço." },
          { titulo: "À mão", texto: "“Nova descarbonização” cria uma OS avulsa, sem venda — por exemplo, um atendimento combinado direto com o licenciado. Ela aparece como “Manual” na lista." },
        ],
      },
      {
        titulo: "O Quadro",
        print: { chave: "os-quadro", legenda: "Ordens de Serviço, visão Quadro." },
        itens: [
          { n: 1, titulo: "Nova descarbonização", texto: "Cria uma OS à mão. Veja “Criar uma OS”, abaixo." },
          { n: 2, titulo: "Atualizar", texto: "Relê as OS. Normalmente não precisa: a tela se atualiza sozinha quando algo muda no portal." },
          { n: 3, titulo: "Números", texto: "Em aberto (tudo que não foi concluído nem cancelado), agendadas para hoje, em execução e concluídas no mês." },
          { n: 4, titulo: "Vendas sem ordem de serviço", texto: "Aparece quando uma venda de descarbonização ficou sem OS (a criação falhou na hora da venda). Sem a OS, o serviço não chega a quem executa. Veja abaixo como resolver." },
          { n: 5, titulo: "Buscar", texto: "Procura pelo número da OS, nome do cliente, placa ou número do pedido. Vale para as três visões." },
          { n: 6, titulo: "Quadro, Lista ou Agenda", texto: "Troca a visão. A escolha fica no endereço da página: dá para mandar o link já na Agenda, por exemplo." },
          { n: 7, titulo: "Colunas", texto: "Nova (ainda não começou), Em execução (o licenciado já está fazendo) e Concluída. O número ao lado é a quantidade de OS. A coluna rola por dentro quando tem muitas OS." },
          { n: 8, titulo: "Cartão da OS", texto: "Uma OS. Os cartões de cada coluna vêm pela data agendada, a mais próxima primeiro. Veja “Lendo o cartão”." },
        ],
      },
      {
        titulo: "Lendo o cartão",
        print: { chave: "os-card", legenda: "Um cartão de OS, de perto." },
        itens: [
          { n: 1, titulo: "Cliente", texto: "Nome ou razão social de quem contratou." },
          { n: 2, titulo: "Número da OS", texto: "Gerado sozinho (OS-ano-número). Ao lado, a placa e o modelo do primeiro veículo, quando já preenchidos." },
          { n: 3, titulo: "Tipo", texto: "B2C (pessoa física), B2B (empresa) ou Frota. Na venda, quem decide é o documento do cliente: CPF vira B2C, CNPJ vira B2B." },
          { n: 4, titulo: "Veículos feitos", texto: "Quantos veículos já foram descarbonizados, de quantos a OS tem (“3 de 9 veículos”)." },
          { n: 5, titulo: "Categorias", texto: "Quantos veículos são leves (carros e caminhonetes, R$ 700) e quantos são pesados (R$ 1.400), por exemplo “8 leves · 1 pesado”." },
          { n: 6, titulo: "Barra de andamento", texto: "A mesma conta do item 4, em desenho. Só aparece quando a OS tem mais de um veículo." },
          { n: 7, titulo: "Data agendada", texto: "Quando o serviço está previsto. Fica laranja quando a data já passou e a OS ainda não foi concluída. “Sem data” quando ninguém marcou." },
          { n: 8, titulo: "Pedido", texto: "O número da venda que gerou a OS." },
          { n: 9, titulo: "Valor", texto: "O total da venda." },
        ],
      },
      {
        titulo: "Venda sem ordem de serviço",
        print: { chave: "os-sem-os", legenda: "O aviso aberto, com a venda que ficou sem OS." },
        itens: [
          { n: 1, titulo: "Ver vendas / Ocultar", texto: "Mostra ou esconde a lista das vendas sem OS." },
          { n: 2, titulo: "Abrir OS", texto: "Abre o formulário de OS nova para você cadastrar o serviço dessa venda." },
          { n: 3, titulo: "A venda", texto: "Pedido, cliente, vendedor, valor da descarbonização, data da venda e data prevista de execução. Use esses dados para abrir a OS. Se não souber o que fazer, avise o Ops." },
        ],
      },
      {
        titulo: "A Lista",
        print: { chave: "os-lista", legenda: "Ordens de Serviço, visão Lista." },
        itens: [
          { n: 1, titulo: "Lista", texto: "Todas as OS numa tabela, inclusive as canceladas (que não aparecem no Quadro)." },
          { n: 2, titulo: "Ordenar", texto: "Clique no título Cliente, Agendada ou Etapa para ordenar; clique de novo para inverter. Começa pela data agendada, e OS sem data vai para o fim." },
          { n: 3, titulo: "Veículos", texto: "Feitos / total, a barra de andamento e as categorias (leves e pesados)." },
          { n: 4, titulo: "Agendada", texto: "A data prevista. Em laranja, a que já passou sem a OS ser concluída." },
          { n: 5, titulo: "Pedido", texto: "O número da venda. “Manual” quando a OS foi criada à mão, sem venda." },
          { n: 6, titulo: "Etapa", texto: "Nova, Em execução, Concluída ou Cancelada." },
        ],
      },
      {
        titulo: "A Agenda",
        print: { chave: "os-agenda", legenda: "Ordens de Serviço, visão Agenda." },
        itens: [
          { n: 1, titulo: "Hoje", texto: "Volta para o mês atual e abre o dia de hoje no painel da direita." },
          { n: 2, titulo: "Mês anterior / próximo", texto: "Anda pelos meses." },
          { n: 3, titulo: "Um dia", texto: "Cada dia mostra até três OS, na cor do tipo; “9×” é a quantidade de veículos. OS cancelada aparece riscada. Clique no dia para ver todas as OS dele no painel." },
          { n: 4, titulo: "Legenda", texto: "Verde = B2C, azul = B2B, laranja = Frota." },
          { n: 5, titulo: "Total do mês", texto: "Quantos agendamentos e quantos veículos o mês tem (sem contar os cancelados)." },
          { n: 6, titulo: "Sem data", texto: "As OS que ainda não têm data. Clique para listá-las no painel — vale combinar a data com o cliente." },
          { n: 7, titulo: "Painel", texto: "Mostra os próximos agendamentos a partir de hoje, ou o dia que você clicou, ou as OS sem data. O X volta para os próximos." },
        ],
      },
      {
        titulo: "Criar uma OS",
        texto: "Use para serviço que não passou por Vender. Venda CarboVAPT já cria a OS sozinha — não crie outra para ela, senão o serviço aparece duas vezes para quem executa.",
        print: { chave: "os-nova", legenda: "Nova Ordem de Serviço, tipo B2C." },
        itens: [
          { n: 1, titulo: "Tipo de serviço", texto: "B2C (pessoa física), B2B (empresa) ou Frota (empresa, com data marcada). O tipo muda os campos pedidos abaixo." },
          { n: 2, titulo: "Telefone / CNPJ", texto: "Obrigatório. No B2C é o telefone; no B2B e na Frota, o CNPJ. Se o cliente já fez descarbonização antes, ao sair do campo os dados dele são preenchidos sozinhos (“Cliente recorrente”)." },
          { n: 3, titulo: "Nome", texto: "Obrigatório. Nome da pessoa ou razão social da empresa." },
          { n: 4, titulo: "E-mail", texto: "Opcional." },
          { n: 5, titulo: "Veículo", texto: "Placa, ano e modelo, se você já souber. Pode ficar em branco: quem executa preenche no Carbox." },
          { n: 6, titulo: "Data prevista", texto: "Quando o serviço deve acontecer. Opcional no B2C e no B2B." },
          { n: 7, titulo: "Criar OS", texto: "Libera quando o obrigatório está preenchido. O número da OS aparece no aviso de confirmação, e a OS entra na coluna Nova." },
        ],
      },
      {
        print: { chave: "os-nova-frota", legenda: "Nova Ordem de Serviço, tipo Frota." },
        itens: [
          { n: 1, titulo: "CNPJ", texto: "Obrigatório na Frota e no B2B." },
          { n: 2, titulo: "Nome fantasia", texto: "Opcional, para empresa." },
          { n: 3, titulo: "Data prevista", texto: "Obrigatória na Frota. Mais veículos da mesma frota são acrescentados na mesma OS depois, no Carbox." },
          { n: 4, titulo: "Responsáveis pela empresa", texto: "Quem acompanha a descarbonização do lado do cliente: nome e telefone. Pode ter vários; “Remover” tira um." },
        ],
      },
    ],
  },
];
