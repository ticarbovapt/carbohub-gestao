import type { Secao } from "../tipos";

// ─────────────────────────────────────────────────────────────────────────────
// Documentação do Carbo Finanças — Configurações: Funcionários, a reconexão do
// Bling (1 e 2), as telas de Integração Bling e Bling 2, e a NFS-e Nacional.
//
// ⚠️ O `n` de cada item é o MESMO marcador do print (`chave`), medido pelo
// harness (docs-prints/shots_config.mjs). Mudou a tela: refaça o print.
// ⚠️ A seção "bling-conexao" é escrita para quem NÃO é técnico: é ela que o
// time abre quando o Bling cai. Regra do OAuth mudou (bling-auth/bling2-auth):
// confira o passo a passo aqui também.
// ─────────────────────────────────────────────────────────────────────────────

export const SECOES_CONFIG: Secao[] = [
  // ── Bling desconectou? ─────────────────────────────────────────────────────
  {
    id: "bling-conexao",
    titulo: "Bling desconectou? Como conectar de novo",
    rota: "/integracoes/bling",
    resumo:
      "O Carbo Finanças conversa com duas contas do Bling: o Bling 1 (a matriz) e o Bling 2 (a filial SP). Cada uma tem uma conexão própria, e de vez em quando ela precisa ser refeita. Leva um minuto e não apaga nada: pedidos, notas e contas já sincronizados continuam onde estão. Esta seção é o passo a passo completo.",
    regras: {
      colaborador: [
        "Bling 1: pode conectar e renovar. Desconectar é só do gestor.",
        "Bling 2: só vê a situação. Para conectar, chame um gestor.",
      ],
      gestor: [
        "Bling 1 e Bling 2: conecta, renova e desconecta.",
        "Desconectar o Bling 1 tira o Bling de todo o Grupo Carbo, não só do Finanças.",
      ],
    },
    blocos: [
      {
        titulo: "Bling 1 × Bling 2, num quadro",
        texto:
          "Bling 1 — empresa: a matriz · tela: Configurações › Integração Bling · botão: “Conectar ao Bling” · quem conecta: qualquer pessoa com o Finanças · desconectar: só gestor, e vale para todo o Grupo Carbo (emissão de NF, pedidos, contas). " +
          "Bling 2 — empresa: a filial SP · tela: Configurações › Integração Bling 2 · botão: “Conectar ao Bling 2” · quem conecta: só gestor · desconectar: só gestor, e afeta só a filial.",
      },
      {
        titulo: "1. Como saber que caiu",
        print: { chave: "blingcon-conectado", legenda: "Tudo certo: o selo verde “Conectado”." },
        itens: [
          { n: 1, titulo: "Conectado (verde)", texto: "A conexão está de pé. Não precisa fazer nada." },
          { n: 2, titulo: "Desconectar", texto: "Não clique para “testar”. Desconectar o Bling 1 para de emitir nota e de atualizar pedidos e contas no Grupo Carbo inteiro até alguém conectar de novo." },
        ],
      },
      {
        print: { chave: "blingcon-desconectado", legenda: "A conexão caiu: no lugar do selo aparece o botão “Conectar ao Bling”." },
        itens: [
          { n: 1, titulo: "Conectar ao Bling", texto: "Se é isto que você vê, a conexão precisa ser refeita. Siga o passo a passo abaixo." },
        ],
      },
      {
        print: { chave: "blingcon-expirado", legenda: "“Token Expirado”: a chave de acesso venceu e ainda não foi renovada." },
        itens: [
          { n: 1, titulo: "Token Expirado (vermelho)", texto: "A chave de acesso do Bling dura algumas horas e o sistema a renova sozinho quando precisa dela. Ver este selo por um tempo não quer dizer, por si só, que caiu." },
          { n: 2, titulo: "Renovar", texto: "Clique UMA vez. Se aparecer “Token atualizado!”, pronto. Se aparecer erro (por exemplo, pedindo para reconectar), a conexão caiu: o selo some e volta o botão “Conectar ao Bling” — siga o passo a passo." },
        ],
      },
      {
        titulo: "Os sinais em outras telas",
        print: { chave: "blingcon-historico", legenda: "O histórico de sincronização com erro de acesso." },
        itens: [
          { n: 1, titulo: "Sincronização com ✕ vermelho", texto: "No fim da tela de integração, o histórico mostra a última rodada de cada tipo (notas, pedidos, contas). Várias com ✕ ao mesmo tempo, todas recentes, é o sinal mais claro." },
          { n: 2, titulo: "A mensagem", texto: "Erro de acesso (“401”, “invalid_token”, “reconecte”) é conexão. Outros erros (um pedido com dado faltando, por exemplo) não se resolvem reconectando." },
          { titulo: "No resto do Finanças", texto: "“Criar no Bling” do Faturamento devolve erro; a baixa no Bling não vai; a linha “sincronizado há…” das contas a pagar e a receber fica parada no passado. Viu um desses, abra a tela de integração da empresa certa e olhe o selo." },
          { titulo: "Bling 2 pode parar sem erro", texto: "Quando a conexão da filial cai, o histórico dela simplesmente para de andar — não aparece ✕. Olhe o horário da linha mais recente: o Bling 2 sincroniza de minuto em minuto, então uma última rodada de mais de uma hora atrás, num dia útil, pede atenção." },
        ],
      },
      {
        titulo: "2. Antes de clicar: confira a empresa no Bling",
        texto:
          "O Bling conecta a empresa em que você está logado no navegador. Abra bling.com.br NO MESMO navegador do Finanças, entre e confira o nome da empresa no topo da tela do Bling (no canto de cima, à direita, junto do seu usuário). Para o Bling 1 tem de ser a MATRIZ; para o Bling 2, a FILIAL SP. Se o seu usuário do Bling tem as duas empresas, troque para a certa antes de seguir.",
        itens: [
          { titulo: "Por que isso importa", texto: "Conectar o Bling 1 na empresa da filial faria o sistema emitir nota e ler contas do CNPJ errado. Um minuto de conferência evita isso." },
          { titulo: "Conectou a empresa errada?", texto: "Não emita nenhuma nota. Peça a um gestor para clicar em “Desconectar”, entre no Bling com a empresa certa e conecte de novo." },
        ],
      },
      {
        titulo: "3. O passo a passo",
        print: { chave: "blingcon-menu", legenda: "No menu, em Configurações." },
        itens: [
          { n: 1, titulo: "Passo 1 · Abra a tela da empresa", texto: "Integração Bling é a matriz (Bling 1)." },
          { n: 2, titulo: "Integração Bling 2", texto: "É a filial SP (Bling 2). Os passos são os mesmos; só muda o botão, “Conectar ao Bling 2”, e só o gestor o vê funcionar." },
          { titulo: "Passo 2 · Clique em “Conectar ao Bling”", texto: "A página vai para o site do Bling. Se ele pedir login, entre com o usuário da empresa certa (ver o item 2 acima)." },
          { titulo: "Passo 3 · Autorize no Bling", texto: "O Bling mostra o aplicativo do Carbo e o que ele pode acessar. Confira a empresa mais uma vez e clique em “Autorizar”." },
          { titulo: "Passo 4 · Espere voltar sozinho", texto: "O Bling devolve você ao Finanças, numa tela branca com a mensagem do resultado. Não feche a aba, não aperte Voltar e não recarregue: em dois segundos ela leva você de volta à tela de integração." },
          { titulo: "Passo 5 · Confira o selo", texto: "Na tela de integração deve aparecer o selo verde “Conectado”. Em um ou dois minutos o histórico de sincronização volta a mostrar rodadas novas com ✓ verde." },
        ],
      },
      {
        print: { chave: "blingcon-sucesso", legenda: "O retorno do Bling quando deu certo." },
        itens: [
          { n: 1, titulo: "Conectado com sucesso", texto: "A conexão nova já está valendo. A tela volta sozinha para a integração; se não voltar, abra o menu Integração Bling." },
        ],
      },
      {
        titulo: "Conectar o Bling 2 (filial)",
        print: { chave: "blingcon-b2", legenda: "O Bling 2 desconectado." },
        itens: [
          { n: 1, titulo: "Conectar ao Bling 2", texto: "Só funciona para gestor. Para o colaborador, o clique avisa “Só gestor pode conectar uma integração” — chame um gestor do Financeiro." },
          { titulo: "Não mexe no Bling 1", texto: "Conectar, renovar ou desconectar aqui não interfere na matriz." },
        ],
      },
      {
        titulo: "4. Regras para dar certo de primeira",
        itens: [
          { titulo: "Termine o que começou", texto: "Ao clicar em Conectar, vá até o fim. A conexão antiga é trocada pela nova no último passo; parar no meio (fechar a aba no Bling) deixa tudo como estava, e você pode recomeçar." },
          { titulo: "Uma aba só", texto: "Não abra a conexão em duas abas ou em dois computadores ao mesmo tempo. Cada autorização do Bling vale uma vez, e a segunda tentativa costuma falhar." },
          { titulo: "Combine com o time", texto: "Se a conexão caiu, avise no Carbo Chat que você vai reconectar. Assim duas pessoas não fazem ao mesmo tempo." },
          { titulo: "Não precisa de senha do Carbo nova", texto: "Reconectar o Bling não troca nenhuma senha, nem a sua nem a do Bling." },
        ],
      },
      {
        titulo: "5. Se der erro no retorno",
        print: { chave: "blingcon-erro", legenda: "O retorno do Bling quando a autorização foi recusada." },
        itens: [
          { n: 1, titulo: "“Bling retornou um erro: access_denied”", texto: "A autorização foi cancelada ou recusada na tela do Bling. Clique em “Voltar para integrações” e comece de novo pelo Passo 2, desta vez clicando em “Autorizar”." },
          { n: 2, titulo: "Voltar para integrações", texto: "Leva de volta à tela de integração, de onde se recomeça." },
        ],
      },
      {
        print: { chave: "blingcon-codigo", legenda: "Código de autorização vencido ou já usado." },
        itens: [
          { n: 1, titulo: "“invalid_grant” / código expirado", texto: "A autorização do Bling vale por pouco tempo e uma única vez. Acontece ao recarregar a tela de retorno, voltar pelo navegador ou demorar na tela do Bling. Volte para integrações e comece de novo pelo Passo 2." },
          { n: 2, titulo: "Voltar para integrações", texto: "Recomece por aqui." },
          { titulo: "“Código de autorização não encontrado na URL”", texto: "A tela de retorno foi aberta sem vir do Bling (por um favorito ou um link copiado). Ela só funciona quando o Bling manda você para lá. Comece pelo Passo 2." },
          { titulo: "“redirect_uri_mismatch” na tela do Bling", texto: "É configuração do aplicativo no Bling, não algo que se resolve repetindo. Tire um print e abra um chamado ao TI pelo botão de bug." },
          { titulo: "Deu certo e o selo voltou a cair logo depois", texto: "Confira de novo a empresa no Bling (item 2) e abra um chamado ao TI com o horário em que aconteceu." },
        ],
      },
      {
        titulo: "Desconectar: só quando for preciso",
        papel: "gestor",
        print: { chave: "blingcon-desconectar", legenda: "A confirmação antes de desconectar o Bling 1.", papel: "gestor" },
        itens: [
          { n: 1, titulo: "O aviso", texto: "Desconectar o Bling 1 vale para todo o Grupo Carbo: a emissão de NF e a leitura de pedidos e contas param em todos os sistemas até alguém conectar de novo. Os dados já lidos não são apagados.", papel: "gestor" },
          { n: 2, titulo: "Cancelar", texto: "Fecha sem mudar nada.", papel: "gestor" },
          { n: 3, titulo: "Desconectar", texto: "Use só para trocar a empresa conectada ou a pedido do TI. Para “dar uma reiniciada” não é preciso desconectar: se a conexão caiu, o botão Conectar já aparece sozinho.", papel: "gestor" },
        ],
      },
    ],
  },

  // ── Integração Bling (Bling 1) ─────────────────────────────────────────────
  {
    id: "bling1",
    titulo: "Integração Bling (matriz)",
    rota: "/integracoes/bling",
    resumo:
      "A conexão com o Bling 1, a conta da matriz. É dela que saem as notas fiscais de venda, os pedidos importados e as contas a pagar e a receber da matriz. O sistema sincroniza sozinho; os botões desta tela servem para buscar na hora o que você não quer esperar.",
    regras: {
      colaborador: ["Vê a tela, sincroniza e importa pedidos.", "Pode conectar quando a conexão cai."],
      gestor: ["Tudo o que o colaborador faz.", "Pode desconectar (vale para todo o Grupo Carbo)."],
    },
    blocos: [
      {
        titulo: "A tela",
        print: { chave: "bling1-tela", legenda: "A integração da matriz, conectada." },
        itens: [
          { n: 1, titulo: "A conexão", texto: "O selo diz se está conectado. Para reconectar, veja a seção “Bling desconectou? Como conectar de novo”." },
          { n: 2, titulo: "Produtos", texto: "Quantos produtos do Bling estão espelhados aqui. “Sincronizar” busca de novo só os produtos." },
          { n: 3, titulo: "Contatos", texto: "Clientes e fornecedores do cadastro do Bling (são eles que aparecem ao escolher o fornecedor de uma conta nova). “Sincronizar” busca os contatos novos agora." },
          { n: 4, titulo: "Pedidos", texto: "Os pedidos de venda lidos do Bling." },
          { n: 5, titulo: "Sincronizar Tudo", texto: "Busca de uma vez produtos, estoque, contatos, pedidos, vendedores, notas fiscais, contas a pagar e pedidos de compra. Pode levar alguns minutos; espere a mensagem no canto da tela. Se alguma parte falhar, a mensagem diz qual e o histórico mostra o motivo." },
          { n: 6, titulo: "Importar Pedidos Bling → CarboHub", texto: "Leva os pedidos lidos para a tela de Pedidos de Venda. Rode depois do Sincronizar Tudo. Repetir não duplica: só atualiza o que mudou." },
          { n: 7, titulo: "Histórico de Sincronização", texto: "Uma linha por tipo, com a rodada mais recente: ✓ verde deu certo, ✕ vermelho falhou (com o motivo embaixo), o círculo girando ainda está rodando. O horário à direita diz quando foi." },
          { titulo: "Como funciona a importação", texto: "O produto casa pelo código (SKU), o licenciado pelo nome, e a situação do Bling vira a etapa do pedido aqui." },
        ],
      },
      {
        titulo: "Preciso apertar os botões todo dia?",
        texto:
          "Não. As notas, os pedidos e as contas são lidos automaticamente ao longo do dia. Os botões são para quando você precisa ver agora algo que acabou de lançar no Bling.",
      },
    ],
  },

  // ── Integração Bling 2 (filial) ────────────────────────────────────────────
  {
    id: "bling2",
    titulo: "Integração Bling 2 (filial SP)",
    rota: "/integracoes/bling2",
    resumo:
      "A conexão com o Bling 2, a conta da filial SP. Tudo daqui fica separado da matriz: conectar, sincronizar ou desconectar não mexe no Bling 1. É daqui que vêm as contas a pagar e a receber da filial e as notas da operação on-line.",
    regras: {
      colaborador: ["Vê a tela e pode sincronizar.", "Conectar e desconectar: chame um gestor."],
      gestor: ["Tudo o que o colaborador faz.", "Conecta e desconecta a filial (não afeta a matriz)."],
    },
    blocos: [
      {
        titulo: "A tela",
        print: { chave: "bling2-tela", legenda: "A integração da filial, conectada." },
        itens: [
          { n: 1, titulo: "A conexão", texto: "O nome da conta conectada e o selo. Para reconectar, veja “Bling desconectou? Como conectar de novo”." },
          { n: 2, titulo: "Os cartões", texto: "Um por tipo de dado — produtos, variações, contatos, vendedores, pedidos de venda, notas fiscais, contas a pagar, contas a receber e pedidos de compra —, com a quantidade espelhada e o “Sincronizar” de cada um." },
          { n: 3, titulo: "Sincronizar tudo", texto: "Busca todos os tipos de uma vez. Espere a mensagem no canto da tela." },
          { n: 4, titulo: "Buscar itens dos pedidos", texto: "Os itens de cada pedido são lidos um a um, até 200 por vez. Depois de uma carga grande, repita até a contagem parar de subir. No dia a dia o sistema faz isso sozinho." },
          { n: 5, titulo: "Histórico de sincronização", texto: "A rodada mais recente de cada tipo. Os pedidos e as notas recentes rodam de minuto em minuto, então o horário delas deve estar sempre perto de agora." },
          { titulo: "Não cruza com o Bling 1", texto: "Os dados da filial ficam à parte: mexer aqui não altera a integração da matriz." },
        ],
      },
    ],
  },

  // ── NFS-e Nacional ─────────────────────────────────────────────────────────
  {
    id: "nfse",
    titulo: "NFS-e Nacional",
    rota: "/integracoes/nfse",
    resumo:
      "As notas fiscais de SERVIÇO do Portal Nacional (gov.br): as que a Carbo emite (CarboVAPT, receita) e as que recebe de fornecedores de serviço (despesa). O sistema lê o portal sozinho a cada hora. Esta tela só consulta: não emite nem cancela nota — a emissão do CarboVAPT é feita no Faturamento.",
    regras: {
      colaborador: ["Vê todas as notas, filtra e baixa XML e PDF."],
      gestor: ["Vê exatamente a mesma tela."],
    },
    blocos: [
      {
        titulo: "A tela",
        print: { chave: "nfse-tela", legenda: "As notas emitidas, com os filtros no topo." },
        itens: [
          { n: 1, titulo: "Saúde da leitura", texto: "Até onde o portal já foi lido, quantas notas e eventos existem e quando foi a última leitura. Aparece “Sem leitura há mais de 3 h” ou “Erro na última leitura” quando algo parou — aí, abra um chamado ao TI." },
          { n: 2, titulo: "Os cartões", texto: "Quantas notas há no filtro, a receita (emitidas válidas), a despesa (recebidas válidas) e as canceladas. Nota cancelada fica na lista, mas fora dos totais. Os cartões somam o filtro inteiro, não só a página." },
          { n: 3, titulo: "Emitidas · Recebidas · Todas", texto: "Emitidas = serviço que a Carbo prestou (receita). Recebidas = serviço que a Carbo contratou (despesa)." },
          { n: 4, titulo: "Situação", texto: "Todas, só válidas ou só canceladas." },
          { n: 5, titulo: "Ano", texto: "Escolhido um ano, aparece também o filtro de mês." },
          { n: 6, titulo: "Busca", texto: "Pelo número da nota, CNPJ/CPF, nome, descrição do serviço ou chave de acesso." },
          { n: 7, titulo: "Ordenar", texto: "Clique no título da coluna (número, data, tomador, serviço, valor, situação). Clique de novo para inverter." },
          { n: 8, titulo: "Valor", texto: "O valor líquido da nota. Quando houve retenção de imposto, aparece embaixo, menor, o valor do serviço." },
          { n: 9, titulo: "Situação da nota", texto: "Válida, Confirmada (o tomador confirmou), Cancelada, ou Substituída — com o número da nota que a substituiu. A substituta aparece como “Substitui outra”." },
          { n: 10, titulo: "XML", texto: "Baixa o XML assinado: é ele o documento fiscal." },
          { n: 11, titulo: "PDF", texto: "Gera um PDF a partir do XML, para consulta. Não é a DANFSe oficial do portal." },
          { n: 12, titulo: "Copiar a chave", texto: "Copia a chave de acesso. Cole na consulta pública do gov.br para abrir a DANFSe oficial." },
          { n: 13, titulo: "Páginas", texto: "Quantas notas por página e a navegação entre páginas." },
        ],
      },
      {
        titulo: "Todas: receita e despesa não se somam",
        print: { chave: "nfse-todas", legenda: "A aba Todas mostra o saldo, e não a soma." },
        itens: [
          { n: 1, titulo: "Saldo", texto: "Receita menos despesa, só de serviços. Não é lucro e não inclui venda de produto." },
          { n: 2, titulo: "O aviso", texto: "Lembra que nota emitida e nota recebida vão em direções opostas, e quantas canceladas estão na lista e fora dos totais." },
        ],
      },
      {
        titulo: "Anos antes de 2026",
        print: { chave: "nfse-ano", legenda: "Um ano anterior a 2026 nas emitidas." },
        itens: [
          { n: 1, titulo: "Mês", texto: "Com um ano escolhido, filtra também o mês." },
          { n: 2, titulo: "Por que não há emitidas", texto: "A Carbo passou a emitir pelo sistema nacional em janeiro de 2026. Antes disso as notas emitidas não estão no portal — não é falta de faturamento. As recebidas existem desde 2023." },
        ],
      },
    ],
  },

  // ── Funcionários ───────────────────────────────────────────────────────────
  {
    id: "funcionarios",
    titulo: "Funcionários",
    rota: "/funcionarios",
    resumo:
      "Os dados para pagar cada pessoa — chave PIX, banco, agência e conta — e o contato de emergência. A lista junta quem é usuário do sistema e quem não é (diarista, prestador avulso). A aba Aniversariantes mostra quem faz aniversário hoje e nos próximos dias.",
    regras: {
      colaborador: ["Não abre a tela: dado bancário de funcionário é só do gestor."],
      gestor: ["Vê e edita os dados de todos.", "Cadastra funcionário avulso, que não é usuário do sistema."],
    },
    blocos: [
      {
        titulo: "Para o colaborador",
        print: { chave: "func-colab", legenda: "O que o colaborador vê." },
        itens: [
          { n: 1, titulo: "Acesso restrito", texto: "PIX e conta bancária são dados sensíveis, por isso a tela é só do gestor. Precisa de algo daqui? Fale com um gestor do Financeiro." },
        ],
      },
      {
        titulo: "A equipe",
        papel: "gestor",
        print: { chave: "func-equipe", legenda: "A lista de funcionários.", papel: "gestor" },
        itens: [
          { n: 1, titulo: "Novo funcionário", texto: "Para quem NÃO é usuário do sistema (diarista, prestador). Quem já tem usuário aparece sozinho na lista: é só editar a linha dele.", papel: "gestor" },
          { n: 2, titulo: "Equipe / Aniversariantes", texto: "As duas abas da tela.", papel: "gestor" },
          { n: 3, titulo: "Setor", texto: "Filtra por departamento.", papel: "gestor" },
          { n: 4, titulo: "Busca", texto: "Pelo nome ou usuário.", papel: "gestor" },
          { n: 5, titulo: "Pendente", texto: "Ainda falta o mínimo para pagar: uma chave PIX, ou banco + agência + conta.", papel: "gestor" },
          { n: 6, titulo: "Completo", texto: "Já tem como receber.", papel: "gestor" },
          { n: 7, titulo: "Editar", texto: "Abre os dados financeiros da pessoa.", papel: "gestor" },
          { n: 8, titulo: "Avulso", texto: "Cadastrado à mão, sem usuário no sistema.", papel: "gestor" },
        ],
      },
      {
        titulo: "Os dados de uma pessoa",
        papel: "gestor",
        print: { chave: "func-editar", legenda: "Editando um funcionário avulso.", papel: "gestor" },
        itens: [
          { n: 1, titulo: "Nome completo", texto: "O único campo obrigatório.", papel: "gestor" },
          { n: 2, titulo: "CPF", texto: "Opcional.", papel: "gestor" },
          { n: 3, titulo: "Data de aniversário", texto: "É ela que alimenta a aba Aniversariantes.", papel: "gestor" },
          { n: 4, titulo: "Vincular usuário do sistema", texto: "Só aparece para o avulso: se a pessoa passou a ter usuário no sistema, ligue aqui para não ficar em duas linhas.", papel: "gestor" },
          { n: 5, titulo: "Tipo de chave PIX", texto: "CPF, CNPJ, e-mail, telefone ou aleatória.", papel: "gestor" },
          { n: 6, titulo: "Chave PIX", texto: "Com a chave preenchida o cadastro já fica Completo.", papel: "gestor" },
          { n: 7, titulo: "Dados bancários", texto: "Banco, código, agência, conta e tipo de conta. Banco + agência + conta também deixam o cadastro Completo.", papel: "gestor" },
          { n: 8, titulo: "Contato de emergência", texto: "Nome e telefone de quem avisar.", papel: "gestor" },
          { n: 9, titulo: "Salvar", texto: "Grava na hora. “Cancelar” fecha sem mudar nada.", papel: "gestor" },
        ],
      },
      {
        titulo: "Aniversariantes",
        papel: "gestor",
        print: { chave: "func-aniversarios", legenda: "A aba Aniversariantes.", papel: "gestor" },
        itens: [
          { n: 1, titulo: "Os números", texto: "Quantos funcionários, quantos fazem aniversário no mês, quantos têm a data cadastrada e o próximo aniversário.", papel: "gestor" },
          { n: 2, titulo: "Hoje", texto: "Quem faz aniversário hoje, com a idade.", papel: "gestor" },
          { n: 3, titulo: "Chegando", texto: "Os próximos 30 dias.", papel: "gestor" },
          { n: 4, titulo: "Calendário anual", texto: "O mês atual em destaque e os outros onze, com quem faz aniversário em cada um.", papel: "gestor" },
          { n: 5, titulo: "Sem data de aniversário", texto: "Quem ainda não tem a data. Abra para ver os nomes e complete pelo Editar da aba Equipe.", papel: "gestor" },
        ],
      },
    ],
  },
];
