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
      "Aqui você acompanha as ordens de serviço (OS) da descarbonização CarboVAPT. A OS é o pedido de execução que vai para o portal dos licenciados: o Sales cria e acompanha, e quem executa registra cada veículo pelo Carbox. A tela tem três visões da mesma lista — Quadro, Lista e Agenda — e muda sozinha quando uma OS anda lá no portal.",
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

  // ── Agenda de visitas (RTM) ─────────────────────────────────────────────────
  {
    id: "visitas",
    titulo: "Agenda de visitas",
    rota: "/rtm/agenda",
    resumo:
      "A agenda dos pontos de venda (PDVs) que você vai visitar, e o registro do que aconteceu em cada visita: check-in na chegada, conferência do posto com fotos, e check-out com o resultado. Ela mostra ao mesmo tempo o que estava planejado e o que foi feito — a visita que ficou para trás aparece como “Não cumprida”. Funciona sem internet: a visita fica guardada no celular e sobe sozinha quando o sinal volta.",
    regras: {
      colaborador: [
        "Vê a própria agenda e as próprias visitas.",
        "Agenda visitas para si mesmo, faz check-in e conclui as próprias visitas.",
        "Cancela visita própria, sempre com o motivo.",
        "O gestor pode colocar visitas na sua agenda — elas aparecem com “agendado por” e o nome dele.",
      ],
      gestor: [
        "Vê a agenda do time inteiro (“Todo o time”) ou de uma pessoa.",
        "Agenda visitas para qualquer vendedor da equipe.",
        "Não faz check-in nem cancela a visita de outra pessoa: quem registra a visita é quem foi ao PDV.",
      ],
    },
    blocos: [
      {
        titulo: "O roteiro do dia",
        print: { chave: "visitas", legenda: "Agenda de visitas, visão Roteiro." },
        itens: [
          { n: 1, titulo: "Roteiro ou Mês", texto: "Roteiro é a lista de trabalho do dia. Mês é o calendário, para ver a carga e a aderência (veja abaixo)." },
          { n: 2, titulo: "Agendar", texto: "Põe um PDV na agenda. No celular o botão fica no fim da lista. Veja “Agendar uma visita”." },
          { n: 3, titulo: "Dia", texto: "Escolhe o dia da lista. “Hoje” aparece ao lado quando você está em outro dia." },
          { n: 4, titulo: "Faixa de dias", texto: "Três dias antes e três depois. Toque para trocar de dia sem abrir o calendário." },
          { n: 5, titulo: "Atrasadas", texto: "Visitas de dias anteriores que não aconteceram. Aparecem no topo do dia de hoje para não serem esquecidas — ainda dá para fazer o check-in nelas. Toque no título para recolher." },
          { n: 6, titulo: "Check-in", texto: "Toque quando chegar ao PDV. A visita abre na hora, mesmo sem internet. Veja “A visita”." },
          { n: 7, titulo: "Rota", texto: "Abre o mapa do celular com o caminho até o PDV." },
          { n: 8, titulo: "Ligar", texto: "Liga para o contato do PDV. Vale ligar antes de ir, para não perder a viagem com o decisor ausente." },
          { n: 9, titulo: "Não vai acontecer", texto: "Cancela a visita planejada, pedindo o motivo. Veja abaixo." },
          { n: 10, titulo: "Resumo do dia", texto: "Quantas foram feitas, quantas não cumpridas (toque para ver só elas) e a aderência: feitas ÷ planejadas. Visita cancelada com motivo não entra na conta." },
          { n: 11, titulo: "Próximos dias", texto: "Os dias seguintes já planejados. Toque para abrir a lista do dia — bom para planejar o amanhã." },
        ],
      },
      {
        titulo: "Lendo uma linha da agenda",
        print: { chave: "visitas-linha", legenda: "Uma visita a fazer e uma concluída." },
        itens: [
          { n: 1, titulo: "Situação", texto: "A visitar, Em andamento, Concluída, Não cumprida (o dia passou e não houve visita) ou Cancelada (com o motivo, em itálico)." },
          { n: 2, titulo: "Endereço", texto: "Rua, cidade e UF do PDV." },
          { n: 3, titulo: "Agendado por", texto: "Aparece quando outra pessoa (normalmente o gestor) colocou a visita na sua agenda. Se não reconhecer a visita, é com ela que você fala." },
          { n: 4, titulo: "Observação", texto: "O recado de quem agendou: o que levar, com quem falar." },
          { n: 5, titulo: "Contato", texto: "A pessoa do PDV." },
          { n: 6, titulo: "Concluída", texto: "Visita já registrada." },
          { n: 7, titulo: "Horário e resultado", texto: "Hora do check-in e do check-out, e o resultado: Fez pedido, Sem pedido, PDV fechado ou Não fui atendido." },
          { n: 8, titulo: "Ver", texto: "Abre a visita registrada, com as fotos da conferência." },
        ],
      },
      {
        titulo: "A visita: check-in, conferência e check-out",
        texto:
          "Depois do check-in a tela da visita abre. Preencha na ordem que quiser: tudo fica salvo no celular na mesma hora, com ou sem sinal. Nada aqui espera a internet.",
        print: { chave: "visita", legenda: "Visita em andamento: resultado, conferência, prateleira e fotos." },
        itens: [
          { n: 1, titulo: "Voltar", texto: "Volta para a agenda. A visita continua aberta e salva — você retoma pela faixa azul (veja abaixo)." },
          { n: 2, titulo: "Tempo e local", texto: "Há quantos minutos você está no PDV (é o tempo de visita que fica registrado). “Local registrado” quando o GPS respondeu; “sem GPS” quando não. O GPS pode chegar alguns segundos depois do check-in." },
          { n: 3, titulo: "Como foi a visita?", texto: "Obrigatório. Fez pedido, Sem pedido, PDV fechado ou Não fui atendido. PDV fechado e Não fui atendido dispensam a conferência e a foto." },
          { n: 4, titulo: "Motivo", texto: "Quando não houve pedido, escolha o motivo na lista. “Outro” pede para escrever." },
          { n: 5, titulo: "Conferência no PDV", texto: "As perguntas sobre o posto. As marcadas com * são obrigatórias para concluir; o aviso laranja diz quantas faltam. “Não” fica laranja quando é um problema a resolver." },
          { n: 6, titulo: "O que tinha na prateleira", texto: "Para cada produto: Tem, Zerado ou Não trabalha. Só “Zerado” conta como falta de produto (ruptura) — “Não trabalha” quer dizer que o posto não vende aquele item." },
          { n: 7, titulo: "Fotos", texto: "“Foto do expositor” é obrigatória (exceto PDV fechado / não atendido) e abre a câmera traseira. “Outra foto” para o que mais valer registrar. A lixeira apaga a foto antes de concluir." },
          { n: 8, titulo: "Próximo passo", texto: "Opcional: o que ficou combinado para a próxima vez." },
          { n: 9, titulo: "Concluir visita", texto: "Faz o check-out. Se faltar algo, a tela diz o quê. Sem sinal, a visita fica no celular e sobe sozinha depois (“Visita concluída. Sobe quando o sinal voltar”)." },
        ],
      },
      {
        titulo: "A distância do GPS: sinaliza, não bloqueia",
        texto:
          "No check-in e no check-out o celular tenta registrar onde você está, e o sistema calcula a distância até o endereço do PDV. Essa distância aparece para o gestor como informação — ela nunca impede o check-in nem a conclusão. GPS erra (principalmente debaixo da cobertura do posto) e o endereço cadastrado do PDV também pode estar errado. Se o celular pedir permissão de localização, permita: sem ela a visita vale do mesmo jeito, só sai sem a distância.",
      },
      {
        titulo: "Visita em andamento",
        print: { chave: "visita-andamento", legenda: "A faixa azul no topo da agenda." },
        itens: [
          { n: 1, titulo: "Toque para continuar", texto: "Enquanto uma visita estiver aberta, essa faixa fica no topo da agenda e leva de volta para ela. Só existe uma visita aberta por vez: conclua antes de fazer o check-in no próximo PDV." },
        ],
      },
      {
        titulo: "Sem internet",
        itens: [
          { titulo: "Tudo fica no celular", texto: "Check-in, respostas, fotos e conclusão são gravados no aparelho na hora. Quando o sinal volta, as visitas sobem sozinhas, na ordem em que aconteceram." },
          { titulo: "Faixa “aguardando envio”", texto: "No topo da agenda aparece quantas visitas ainda não subiram, há quanto tempo nada é enviado, e o botão “Enviar agora”. Sem conexão, a faixa cinza avisa que está tudo salvo no aparelho." },
          { titulo: "Faixa vermelha “o envio foi recusado”", texto: "O sistema recusou aquela visita e diz o motivo. Não é falta de sinal: abra um chamado (Reportar bug) com o print da faixa." },
          { titulo: "Não apague os dados do navegador", texto: "Visita que ainda não subiu só existe no seu celular. Limpar os dados do navegador ou trocar de aparelho antes de enviar perde a visita." },
        ],
      },
      {
        titulo: "Visita concluída não se edita",
        texto:
          "Depois do check-out a visita fica só para leitura — nem a tela nem o sistema deixam mudar. Isso mantém o histórico confiável. Se algo foi registrado errado, peça a correção ao seu gestor: ela entra como um registro novo ligado ao original.",
      },
      {
        titulo: "O calendário do mês",
        print: { chave: "visitas-mes", legenda: "Agenda de visitas, visão Mês." },
        itens: [
          { n: 1, titulo: "Números do mês", texto: "Planejadas no mês, concluídas e não cumpridas (em amarelo quando há alguma)." },
          { n: 2, titulo: "Aderência (até hoje)", texto: "Concluídas ÷ planejadas, só nos dias que já passaram — o resto do mês ainda não aconteceu. Canceladas não entram." },
          { n: 3, titulo: "Mês anterior / próximo", texto: "Anda pelos meses." },
          { n: 4, titulo: "Um dia", texto: "O número de baixo é quantas visitas estão planejadas; a barrinha mostra a proporção de concluídas, não cumpridas e a visitar. Dia em branco é dia com espaço para visita nova. Toque no dia para abrir o Roteiro dele." },
          { n: 5, titulo: "Legenda", texto: "Verde = concluída, laranja = não cumprida, cinza = a visitar." },
        ],
      },
      {
        titulo: "Agendar uma visita",
        texto: "A visita entra na agenda antes do dia. É isso que separa “não estava no plano” de “estava e não aconteceu”.",
        print: { chave: "visitas-agendar", legenda: "Agendar visita (visão do gestor, com o campo Vendedor)." },
        itens: [
          { n: 1, titulo: "Dia", texto: "Já vem com o dia que está aberto na agenda." },
          { n: 2, titulo: "Vendedor", texto: "Só para o gestor: de quem é a visita. O colaborador agenda sempre para si.", papel: "gestor" },
          { n: 3, titulo: "Buscar PDV", texto: "Por nome, rua, cidade, CEP ou código do PDV. Buscar pela rua ajuda a montar roteiro com postos vizinhos. PDV inativo não aparece." },
          { n: 4, titulo: "PDV escolhido", texto: "Fica marcado com ✓. Embaixo do nome, a rua e a cidade, para não confundir filiais da mesma rede." },
          { n: 5, titulo: "Observação", texto: "Opcional: o que levar, com quem falar. Aparece na linha da agenda." },
          { n: 6, titulo: "Agendar", texto: "Salva. O mesmo PDV não pode ser agendado duas vezes para a mesma pessoa no mesmo dia." },
        ],
      },
      {
        titulo: "Cancelar uma visita planejada",
        print: { chave: "visitas-cancelar", legenda: "Cancelar visita, com o motivo." },
        itens: [
          { n: 1, titulo: "Motivo", texto: "Obrigatório: por que a visita não vai acontecer (cliente pediu para remarcar, posto em reforma…). Visita cancelada com motivo sai da conta da aderência; visita que simplesmente não acontece vira “Não cumprida” e conta." },
          { n: 2, titulo: "Cancelar visita", texto: "Confirma. A visita fica na agenda como Cancelada, com o motivo." },
        ],
      },
      {
        papel: "gestor",
        titulo: "O que o gestor vê a mais",
        print: { chave: "visitas-gestor", legenda: "Agenda de visitas, visão do gestor.", papel: "gestor" },
        itens: [
          { n: 1, titulo: "Todo o time", texto: "Escolhe de quem é a agenda: o time inteiro ou uma pessoa. Com o time inteiro, a lista mostra 3 dias para trás e 3 para frente; com uma pessoa, uma semana." },
          { n: 2, titulo: "Nome do vendedor", texto: "Em cada visita aparece de quem ela é." },
          { n: 3, titulo: "Atrasadas do time", texto: "As visitas não cumpridas de todos. O gestor não tem Check-in nem “Não vai acontecer” nas visitas dos outros: quem registra é quem vai ao PDV." },
        ],
      },
    ],
  },
];
