import type { Secao } from "../tipos";

// Comece por aqui, navegação e Início do Carbo Finanças. A barra de cima e o
// menu são o shell comum aos apps; o texto parte do do Sales.

export const SECOES_BASE: Secao[] = [
  // ── Comece por aqui ─────────────────────────────────────────────────────────
  {
    id: "comece",
    titulo: "Comece por aqui",
    resumo:
      "O Carbo Finanças é o sistema do financeiro: contas a pagar e a receber (da matriz e da filial), fluxo de caixa, faturamento das vendas (NF-e pelo Bling e NFS-e pelo Portal Nacional), comissões, compras e suprimentos, e as integrações com o Bling.",
    blocos: [
      {
        titulo: "Como entrar",
        itens: [
          { titulo: "Pelo Hub", texto: "Entre sempre por carbohub.com.br com o seu usuário ou o seu e-mail, e a sua senha. No Hub, clique em “Acessar” no cartão Carbo Finanças." },
          { titulo: "Esqueceu a senha?", texto: "Na tela de entrada do Hub, “Esqueci minha senha” manda um código para o e-mail cadastrado no seu primeiro acesso." },
          { titulo: "Sem acesso?", texto: "Se aparecer “Acesso ao Finanças não liberado”, peça a um gestor para marcar o Carbo Finanças no seu usuário (tela de Usuários, no TI)." },
        ],
      },
      {
        titulo: "Matriz e filial",
        texto:
          "A empresa tem duas contas no Bling: o Bling 1 é a MATRIZ e o Bling 2 é a FILIAL SP. Cada uma tem os próprios clientes, fornecedores, produtos, contas e notas. Nas telas de contas, o seletor “Matriz | Filial” escolhe qual você está vendo; no faturamento, a conta é escolhida pedido a pedido.",
      },
      {
        titulo: "Colaborador e gestor",
        texto: "O sistema tem dois níveis. O colaborador opera as contas, o faturamento e as compras; o gestor tem, além disso, as ações de gestão de cada tela.",
        itens: [
          { papel: "gestor", titulo: "O que muda para o gestor", texto: "Cada seção desta documentação tem o quadro “O gestor nesta tela”, com o que ele vê e pode a mais — por exemplo, o Painel financeiro, aprovar requisições de compra e conectar o Bling 2." },
          { papel: "gestor", titulo: "Quem é gestor", texto: "É a marcação “gestor” da função da pessoa em Departamentos e funções, no TI." },
        ],
      },
      {
        titulo: "O Bling desconectou?",
        texto:
          "Qualquer pessoa com o Finanças consegue conectar o Bling 1 de novo, e um gestor conecta o Bling 2 — o passo a passo está na seção “Bling desconectou? Como conectar de novo”, em Configurações.",
      },
    ],
  },

  // ── Navegação ───────────────────────────────────────────────────────────────
  {
    id: "navegacao",
    titulo: "Navegação",
    resumo: "A barra lateral leva às telas do sistema; a barra de cima tem os atalhos que existem em todos os sistemas do Grupo Carbo.",
    blocos: [
      {
        print: { chave: "inicio", legenda: "O Carbo Finanças, com a barra lateral e a barra de cima." },
        itens: [
          { n: 1, titulo: "Logo", texto: "Volta para o Hub (carbohub.com.br). Com o botão do meio do mouse, abre em outra guia." },
          { n: 2, titulo: "Menu", texto: "Início e Carbo Chat; Contas (Contas a pagar, Assinaturas, Contas a receber, Fluxo de caixa, Painel financeiro); Vendas (Faturamento, Comissionamento, Pedidos de Venda); Suprimentos (Compras, Suprimentos); Cadastros (Fornecedores, Formas de pagamento); Configurações (Funcionários, Integração Bling, Integração Bling 2, NFS-e Nacional). A tela em que você está fica destacada." },
          { n: 3, titulo: "Documentação", texto: "Esta página." },
          { n: 4, titulo: "Recolher menu", texto: "Deixa a barra lateral só com os ícones. No celular o menu abre pelo botão ☰ do topo." },
          { n: 5, titulo: "Trocar de sistema", texto: "Lista os sistemas liberados para você e o Início (o Hub)." },
          { n: 6, titulo: "+ Nova Venda", texto: "Abre a tela de venda/orçamento (Vender) de qualquer lugar." },
          { n: 7, titulo: "Notificações", texto: "O sininho mostra avisos: pedido liberado para faturar, menção, bug corrigido. O número vermelho é o que você ainda não leu." },
          { n: 8, titulo: "Reportar bug ou sugestão", texto: "Abre o pedido ao TI. Veja a seção “Bugs e sugestões”." },
          { n: 9, titulo: "Tema claro / escuro", texto: "Troca as cores. A escolha vale para todos os sistemas do Grupo Carbo." },
          { n: 10, titulo: "Sua conta", texto: "Seu nome e função. O menu tem Meu Perfil, Minha Equipe, Bugs e sugestões e Sair." },
          { n: 11, titulo: "Ajuda", texto: "A Documentação fica sempre no fim do menu." },
        ],
      },
      {
        titulo: "Notificações",
        print: { chave: "notificacoes", legenda: "O sininho aberto." },
        itens: [
          { n: 1, titulo: "Não lidas / Todas", texto: "Alterna entre o que você ainda não viu e o histórico." },
          { n: 2, titulo: "Marcar lidas", texto: "Marca todas como lidas de uma vez." },
          { n: 3, titulo: "Um aviso", texto: "Clique para ir até o que ele fala. Passe o mouse para ver a lixeira e apagar o aviso." },
        ],
      },
      {
        titulo: "Faixa de aviso no topo",
        texto:
          "Quando o sistema está instável ou em manutenção, aparece uma faixa colorida logo abaixo da barra de cima. Ela não fecha: some sozinha quando tudo volta ao normal (fica verde por um tempo, dizendo que normalizou). Se a faixa estiver lá, não precisa abrir chamado — o TI já sabe.",
      },
      {
        titulo: "Filtros ficam no endereço",
        texto:
          "Mês, situação, busca e aba escolhidos ficam no endereço da página: o F5 não os perde, o Voltar do navegador volta ao filtro anterior e dá para copiar o link e mandar a um colega já filtrado.",
      },
    ],
  },

  // ── Início ──────────────────────────────────────────────────────────────────
  {
    id: "inicio-fin",
    titulo: "Início",
    resumo: "A primeira tela: o resumo do caixa em cinco números e os atalhos para cada área.",
    blocos: [
      {
        print: { chave: "inicio-fin", legenda: "O Início do Finanças." },
        itens: [
          { n: 1, titulo: "A pagar vencido", texto: "Soma das contas a pagar em aberto com vencimento antes de hoje. Fica vermelho quando há alguma. O clique abre Contas a pagar já filtrada nos vencidos." },
          { n: 2, titulo: "A pagar (30 dias)", texto: "O que vence de hoje até daqui a 30 dias." },
          { n: 3, titulo: "A receber vencido", texto: "Títulos a receber em aberto e já vencidos — a inadimplência. O clique abre Contas a receber nos atrasados." },
          { n: 4, titulo: "Previsto (8 sem.)", texto: "Entradas menos saídas previstas para as próximas 8 semanas, pelos vencimentos. Não considera o saldo que já está no banco." },
          { n: 5, titulo: "RCs a aprovar", texto: "Requisições de compra esperando a aprovação de um gestor." },
          { n: 6, titulo: "Atalhos", texto: "Um cartão por área, com os mesmos endereços do menu." },
          { n: 7, papel: "gestor", titulo: "Painel financeiro", texto: "O cartão do Painel financeiro só aparece para gestor." },
        ],
      },
      {
        titulo: "Números arredondados",
        texto: "Os cartões mostram o valor abreviado (R$ 4,3 mil). O valor exato está na tela de cada um.",
      },
    ],
  },
];
