import type { Secao } from "../tipos";

// Telas que são as MESMAS em vários apps (o `Vender.tsx`, o `BugReports.tsx` e o
// `Profile.tsx` são byte a byte iguais nos oito). Texto portado da documentação
// do Pré-Vendas; mudou a tela, mude o texto nos apps que a documentam.
export const SECOES_VENDER: Secao[] = [
  {
    id: "vender",
    titulo: "Vender (orçamento e venda)",
    rota: "/vender",
    resumo:
      "A tela onde nasce o orçamento e a venda. Abre pelo + do topo, de qualquer tela. Os preços vêm da tabela da gestão; só o gestor pode trocar o preço de uma linha.",
    regras: {
      colaborador: [
        "A venda fica no seu nome: você é o vendedor e a comissão é sua.",
        "O preço vem da tabela e não se edita; o desconto pode pedir aprovação, conforme a faixa.",
        "Pronta entrega sai da SUA caixa de estoque, quando você tem uma.",
      ],
      gestor: [
        "Tem o quadro “Responsável pela venda”: lança a venda em nome de outra pessoa, e a comissão vai para quem foi escolhido.",
        "Em pronta entrega, o estoque que conta é o da pessoa escolhida.",
        "Pode digitar o preço unitário de uma linha (o campo fica âmbar e mostra o preço da tabela, com “voltar”). Bonificação continua travada.",
      ],
    },
    blocos: [
      {
        titulo: "Cliente",
        print: { chave: "vender-topo", legenda: "Topo da tela de venda, com um orçamento aberto para edição." },
        itens: [
          { n: 1, titulo: "Aviso de edição", texto: "Aparece quando você abre um orçamento ou venda já salvos: diz o número e o que acontece ao salvar. Venda com nota emitida não pode mais mudar itens nem valores — o aviso fica vermelho." },
          { n: 2, titulo: "Tipo de Operação", texto: "CarboZé = produto (nota pelo Bling). CarboVAPT = serviço de descarbonização (nota pelo Portal Nacional). Uma venda é de um tipo só; para vender os dois ao mesmo cliente, registre duas vendas. Trocar o tipo limpa os itens do outro tipo." },
          { n: 3, titulo: "CNPJ ou CPF", texto: "Comece a digitar: se o cliente já está na nossa base (cliente ou lead), ele aparece na lista e os dados vêm junto." },
          { n: 4, titulo: "Buscar dados", texto: "Cliente novo: com CNPJ, busca nome, telefone e endereço na Receita. CPF é só validado — os dados seguem manuais." },
          { n: 5, titulo: "Nome / Razão Social", texto: "Obrigatório: sem nome o pedido não fatura nem é encontrado depois." },
          { n: 6, titulo: "É Licenciado?", texto: "Marque se o cliente é um licenciado Carbo." },
          { n: 7, titulo: "Inscrição Estadual", texto: "Escolha a UF e digite a IE: o sistema confere formato e dígito de qualquer estado. Sem IE, marque “Isento”." },
        ],
      },
      {
        papel: "gestor",
        titulo: "Lançar em nome de outra pessoa",
        print: { chave: "vender-gestor", legenda: "Quadro do responsável pela venda (só gestor).", papel: "gestor" },
        itens: [
          { n: 1, titulo: "Responsável pela venda", texto: "“Eu” deixa a venda no seu nome. Escolhendo outra pessoa o quadro fica laranja (“Lançar venda em nome de”) e a comissão vai para ela." },
        ],
      },
      {
        titulo: "Endereço",
        print: { chave: "vender-endereco", legenda: "Endereço de entrega." },
        itens: [
          { n: 1, titulo: "CEP", texto: "Digite o CEP e a rua, o bairro e a cidade se preenchem. Confira o número." },
          { n: 2, titulo: "Localizar no mapa", texto: "Mostra o ponto aproximado — confira se bate com o local de entrega." },
          { n: 3, titulo: "S/N", texto: "Para endereço sem número." },
          { n: 4, titulo: "Mesmo endereço da entrega", texto: "Desmarque se a nota deve sair com outro endereço (o da empresa). No CarboVAPT esta parte não existe: o endereço da tela já é o de faturamento." },
        ],
      },
      {
        titulo: "Itens do pedido (CarboZé)",
        print: { chave: "vender-itens", legenda: "Itens do pedido com faixa de preço, bonificação e desconto." },
        itens: [
          { n: 1, titulo: "Adicionar Item", texto: "Uma linha nova para outro produto." },
          { n: 2, titulo: "Produto", texto: "Escolha o produto e o preço dele (veja abaixo). O campo mostra o nome completo do que foi escolhido." },
          { n: 3, titulo: "Quantidade", texto: "Quantas unidades. O preço unitário vem da tabela e o total da linha é calculado. Só o gestor pode alterar o preço; se ele alterou, quem reabre vê “Preço definido pela gestão”." },
          { n: 4, titulo: "Faixa de preço", texto: "Depois de escolher, a linha confirma qual preço está sendo usado (ex.: Preço de PDV)." },
          { n: 5, titulo: "Desconto", texto: "Em % ou em R$, por linha." },
          { n: 6, titulo: "Bonificação", texto: "O produto de bonificação sai a R$ 0,00 nesta venda e na nota — o desconto de 100% já vem travado." },
          { n: 7, titulo: "Motivo do desconto", texto: "Aparece quando há desconto. Opcional, mas ajuda quem aprova." },
          { n: 8, titulo: "Aprovação", texto: "Diz se o desconto é aprovado automaticamente ou precisa do gestor ou do CEO, conforme o tamanho. É só um aviso: não impede salvar." },
          { n: 9, titulo: "Resumo", texto: "Subtotal, desconto e total do pedido." },
        ],
      },
      {
        titulo: "Escolhendo o produto e o preço",
        texto: "O mesmo produto tem preços diferentes conforme o tipo de cliente. Não é desconto: o valor sai cheio na nota.",
        print: { chave: "vender-produto", legenda: "A lista de produtos aberta." },
        itens: [
          { n: 1, titulo: "Produto", texto: "O nome do produto é o título do grupo." },
          { n: 2, titulo: "Padrão", texto: "O preço de sempre, para compra esporádica." },
          { n: 3, titulo: "PDV", texto: "Para o ponto de venda que revende o nosso produto." },
          { n: 4, titulo: "Microdistribuidor", texto: "Para quem compra em volume e revende como quiser. Use só para quem é microdistribuidor de fato." },
          { n: 5, titulo: "Bonificação", texto: "Grátis: é o brinde, sempre por último. “sem preço” em vermelho significa que a gestão ainda não cadastrou o preço — a venda não sai com esse item." },
        ],
      },
      {
        titulo: "Saída, prazo e recorrência",
        print: { chave: "vender-prazo", legenda: "Como o produto sai, prazo de entrega e recorrência." },
        itens: [
          { n: 1, titulo: "Precisa produzir", texto: "Segue a esteira normal: produção, separação e envio." },
          { n: 2, titulo: "Pronta entrega", texto: "Sai da sua caixa de estoque na hora e o pedido vai direto para a nota. Só aparece liberado se você tem caixa; se faltar produto, a tela diz quanto." },
          { n: 3, titulo: "Data de entrega combinada", texto: "Combine com o cliente. O sistema calcula até quando fabricar (PPF) e expedir (PPE), em dias úteis." },
          { n: 4, titulo: "Prazos calculados", texto: "Se a data for curta demais, aparece o aviso e uma data sugerida — ou a venda abre um pedido de liberação para o gestor." },
          { n: 5, titulo: "Recorrência", texto: "Repete o mesmo pedido nos próximos meses (mensal a anual, de 2 a 60 entregas), já gravado. Cada entrega entra no faturamento do seu mês." },
        ],
      },
      {
        titulo: "Pagamento e observações",
        print: { chave: "vender-pagamento", legenda: "Forma de pagamento, dados estratégicos e observações." },
        itens: [
          { n: 1, titulo: "Forma de Pagamento", texto: "Obrigatória: PIX, boleto à vista, boleto faturado, débito ou crédito parcelado." },
          { n: 2, titulo: "Prazo do faturamento", texto: "Para boleto faturado (ex.: 30/60/90). No crédito aparecem as parcelas." },
          { n: 3, titulo: "Dados Estratégicos", texto: "Opcional: tipo de ponto, classificação, volume mensal, diesel e frotas. Ficam nas notas internas." },
          { n: 4, titulo: "Observações", texto: "Observações públicas saem no orçamento que o cliente recebe. Notas internas só a equipe vê." },
        ],
      },
      {
        titulo: "Salvar",
        print: { chave: "vender-rodape", legenda: "O rodapé da tela, sempre visível." },
        itens: [
          { n: 1, titulo: "Total", texto: "O valor do pedido." },
          { n: 2, titulo: "Cancelar", texto: "Volta sem salvar." },
          { n: 3, titulo: "Gerar Orçamento / Salvar e Gerar PDF", texto: "Salva como orçamento e baixa o PDF (válido por 7 dias). Fica ligado ao card do lead." },
          { n: 4, titulo: "Enviar por E-mail", texto: "Salva e manda o PDF para o e-mail do cliente." },
          { n: 5, titulo: "Gerar Venda / Salvar e Vender", texto: "Registra a venda. Editando uma venda, o botão vira “Salvar alterações”; com nota emitida, “Nota já emitida” e não salva." },
        ],
      },
      {
        titulo: "CarboVAPT (serviço)",
        print: { chave: "vender-vapt", legenda: "Itens de serviço e previsão de execução." },
        itens: [
          { n: 1, titulo: "Categoria", texto: "Veículos leves e caminhonetes (R$ 700,00) ou veículos pesados (R$ 1.400,00). O preço é fixo. Em “Veículos” dá para escrever quais são (ex.: 2 caminhões e 1 colheitadeira) — sai no orçamento." },
          { n: 2, titulo: "Tem bonificação", texto: "Veículos de cortesia: entram na OS e saem a R$ 0,00." },
          { n: 3, titulo: "Ordem de serviço", texto: "Mostra quantos veículos a OS vai ter para o licenciado executar." },
          { n: 4, titulo: "Serviços que acompanham", texto: "Laudo de Opacidade e Medição de Ruído: sempre bonificados, um por veículo (a quantidade pode ser mudada). Não mudam o valor. Precisam de ao menos uma descarbonização." },
          { n: 5, titulo: "Previsão de execução", texto: "A data estimada da descarbonização." },
        ],
      },
    ],
  },
];

export const SECOES_FIM: Secao[] = [
  {
    id: "bugs",
    titulo: "Bugs e sugestões",
    rota: "/bugs",
    resumo: "O canal com o TI: algo errado, uma ideia, equipamento, acesso ou dúvida. Abre pela baratinha do topo, de qualquer tela — a tela e o seu usuário já vão junto.",
    regras: {
      colaborador: ["Você reporta e acompanha. Vê a resposta do TI quando houver."],
      gestor: ["Avalia os chamados: escreve a resposta do TI, marca como resolvido, recusa, reabre ou remove."],
    },
    blocos: [
      {
        titulo: "Reportar",
        print: { chave: "bug-dialogo", legenda: "O formulário de reporte." },
        itens: [
          { n: 1, titulo: "Tipo", texto: "Bug (algo errado), Sugestão (melhoria), Equipamento, Acesso (login, permissão, senha) ou Ajuda (dúvida de uso)." },
          { n: 2, titulo: "Resumo", texto: "Uma frase sobre o assunto." },
          { n: 3, titulo: "O que aconteceu", texto: "Conte o passo a passo. Em bug, “usar roteiro” ajuda a não esquecer nada." },
          { n: 4, titulo: "Impacto", texto: "Se te impede de trabalhar, e quem mais sente. É o que define a prioridade." },
          { n: 5, titulo: "Anexar print", texto: "Até 3 imagens — dá para colar com Ctrl+V." },
          { n: 6, titulo: "Enviar", texto: "Manda ao TI (atalho Ctrl+Enter). Depois, “Acompanhar” leva à lista." },
        ],
      },
      {
        titulo: "Acompanhar",
        print: { chave: "bugs", legenda: "A lista de bugs e sugestões." },
        itens: [
          { n: 1, titulo: "Bugs / Sugestões", texto: "Troca entre os dois tipos." },
          { n: 2, titulo: "Situação", texto: "Em andamento, Resolvidos (Feitas), Recusados e Todos." },
          { n: 3, titulo: "Um chamado", texto: "Clique para ver a descrição, o status e a resposta do TI." },
        ],
      },
      {
        papel: "gestor",
        print: { chave: "bugs-gestor", legenda: "Avaliando um chamado (gestor).", papel: "gestor" },
        itens: [
          { n: 1, titulo: "Resposta do TI", texto: "O que quem reportou vai ler." },
          { n: 2, titulo: "Recusar", texto: "Encerra sem atender." },
          { n: 3, titulo: "Marcar como resolvido / feita", texto: "Encerra como atendido." },
        ],
      },
    ],
  },
  {
    id: "perfil",
    titulo: "Meu perfil",
    rota: "/perfil",
    resumo: "Sua foto e os seus dados no sistema. Pelo menu da sua conta, no canto de cima.",
    blocos: [
      {
        print: { chave: "perfil", legenda: "Meu Perfil." },
        itens: [
          { n: 1, titulo: "Alterar foto", texto: "Escolha uma imagem e ajuste o recorte." },
          { n: 2, titulo: "Seus dados", texto: "Nome, e-mail, departamento e função." },
          { n: 3, titulo: "Outras mudanças", texto: "Para mudar nome, função ou acesso, peça ao seu gestor. A senha se troca pelo Hub (Esqueci minha senha)." },
        ],
      },
    ],
  },
];
