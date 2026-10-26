import type { Secao } from "../tipos";

// Usuários, Departamentos e funções e Quem recebe a venda (menu "Usuários e
// acessos"). O `n` de cada item é o marcador do print (docs-prints/shots_usuarios.mjs).
export const SECOES_USUARIOS: Secao[] = [
  // ── Usuários ────────────────────────────────────────────────────────────────
  {
    id: "usuarios",
    titulo: "Usuários",
    rota: "/usuarios",
    resumo:
      "A lista de todas as pessoas do time interno do Grupo Carbo. Aqui o TI cria o usuário, diz de que departamento e função ele é, marca quais sistemas ele pode abrir, redefine a senha e bloqueia o acesso de quem saiu.",
    regras: {
      colaborador: [
        "A tela é a mesma para todo o time do TI: quem tem o Carbo TI liberado vê a lista inteira e pode criar, editar, resetar senha e bloquear.",
        "O que você muda aqui vale para todos os sistemas do Grupo Carbo, não só para o TI.",
      ],
      gestor: [
        "Nada muda para o gestor nesta tela — ela já mostra tudo para todo o time do TI.",
        "Quem é gestor nos OUTROS sistemas é decidido aqui: é a função da pessoa (ver “Departamentos e funções”).",
      ],
    },
    blocos: [
      {
        titulo: "A lista",
        print: { chave: "usuarios", legenda: "Usuários, com os filtros no topo da lista." },
        itens: [
          { n: 1, titulo: "Criar usuário", texto: "Abre o painel para cadastrar uma pessoa nova. Veja “Criar um usuário”, abaixo." },
          { n: 2, titulo: "Ativos / Bloqueados", texto: "Duas listas separadas: quem entra nos sistemas e quem está com o acesso bloqueado. A aba Bloqueados só aparece quando existe alguém bloqueado, sempre com o número ao lado — para ninguém esquecer quem perdeu o acesso." },
          { n: 3, titulo: "Todos os níveis / Gestores", texto: "Mostra só quem é gestor, se quiser conferir quem enxerga tudo nos sistemas." },
          { n: 4, titulo: "Buscar", texto: "Procura pelo nome ou pelo usuário de entrada (ex.: OPS0003)." },
          { n: 5, titulo: "Departamento", texto: "Mostra só um departamento. Quem tem um 2º departamento aparece nos dois." },
          { n: 6, titulo: "Sistema", texto: "Mostra só quem tem aquele sistema liberado. O número em cada pílula já leva em conta os outros filtros." },
          { n: 7, titulo: "Uma pessoa", texto: "Nome, usuário de entrada, departamento e função. Clique em qualquer lugar da linha para abrir o cartão dela." },
          { n: 8, titulo: "Nível", texto: "Gestor (coroa) ou Membro. Quem decide é a função da pessoa; a foto de quem é gestor ganha um anel dourado." },
          { n: 9, titulo: "Sistemas", texto: "Uma bolinha colorida por sistema liberado. Passe o mouse para ver os nomes; o cartão da pessoa mostra a lista completa." },
        ],
      },
      {
        titulo: "Quem está bloqueado",
        print: { chave: "usuarios-bloqueados", legenda: "A aba Bloqueados." },
        itens: [
          { n: 1, titulo: "Aba Bloqueados", texto: "Lista só quem está com o acesso bloqueado. Os filtros de nível, departamento e sistema continuam valendo." },
          { n: 2, titulo: "Selo Bloqueado", texto: "Fica ao lado do nome. Os dados da pessoa continuam no sistema; para devolver o acesso, abra o cartão dela e use “Desbloquear acesso”." },
        ],
      },
      {
        titulo: "Criar um usuário",
        print: { chave: "usuarios-criar", legenda: "O painel Criar usuário, preenchido." },
        itens: [
          { n: 1, titulo: "Nome completo", texto: "Obrigatório. É o nome que aparece em todos os sistemas." },
          { n: 2, titulo: "Departamento e Função", texto: "O departamento é obrigatório. A lista de funções muda conforme o departamento escolhido." },
          { n: 3, titulo: "O que a função dá", texto: "Logo abaixo aparece se a função é de Gestor (vê tudo do sistema) ou de Colaborador (vê só o que é dele)." },
          { n: 4, titulo: "2º departamento e 2ª função", texto: "Opcional, para quem acumula dois papéis. O sistema sempre usa o maior dos dois: se um deles é de gestor, a pessoa é gestor." },
          { n: 5, titulo: "Escopo / Responsabilidades", texto: "Texto livre com as principais atividades da pessoa." },
          { n: 6, titulo: "Superior direto", texto: "O chefe imediato. É ele que monta a árvore de “Minha equipe”." },
          { n: 7, titulo: "Sistemas liberados", texto: "Uma caixinha por sistema. Marcar libera a entrada naquele sistema e o azulejo dele aparece no Hub; desmarcar tira. Pelo menos um é obrigatório — o Carbo Controle já vem marcado. A caixinha Carbo Admin libera de fato a entrada no Admin." },
          { n: 8, titulo: "Criar usuário", texto: "Fica liberado quando nome, departamento e pelo menos um sistema estão preenchidos." },
          { n: 9, titulo: "Usuário e senha", texto: "O usuário de entrada é gerado sozinho com a sigla do departamento (ex.: COM0008) e a senha inicial é Carbo@2026. Ao criar, aparece a janela “Conta criada!” com os dois e botões para copiar — passe para a pessoa. No 1º acesso ela troca a senha e informa o e-mail de verdade." },
        ],
      },
      {
        titulo: "O cartão da pessoa",
        print: { chave: "usuarios-cartao", legenda: "Cartão aberto ao clicar numa linha da lista." },
        itens: [
          { n: 1, titulo: "Cabeçalho", texto: "Foto, nome, usuário de entrada e os selos: Gestor ou Membro, e Vendedor quando a pessoa entra nas Metas do Carbo Sales." },
          { n: 2, titulo: "E-mail, departamento e função", texto: "Enquanto a pessoa não fez o 1º acesso, o e-mail aparece como “Ainda não definido”." },
          { n: 3, titulo: "Superior e escopo", texto: "Só aparecem quando estão preenchidos." },
          { n: 4, titulo: "Sistemas liberados", texto: "A lista completa, com o nome de cada sistema." },
          { n: 5, titulo: "Resetar senha de acesso", texto: "Volta a senha para a padrão. Veja abaixo." },
          { n: 6, titulo: "Editar", texto: "Abre o formulário de edição. “Fechar” sai sem mudar nada." },
        ],
      },
      {
        titulo: "Resetar a senha",
        print: { chave: "usuarios-reset", legenda: "Confirmação do reset de senha." },
        itens: [
          { n: 1, titulo: "O que acontece", texto: "A senha volta para Carbo@2026 e, no próximo acesso, a pessoa refaz o primeiro login e escolhe uma senha nova." },
          { n: 2, titulo: "Resetar", texto: "Confirma. Depois aparecem o usuário e a senha, com o botão para copiar e mandar para a pessoa." },
        ],
      },
      {
        titulo: "Editar um usuário",
        print: { chave: "usuarios-editar", legenda: "Formulário de edição." },
        itens: [
          { n: 1, titulo: "Usuário de entrada", texto: "Não muda nunca, mesmo trocando o departamento." },
          { n: 2, titulo: "Nome completo", texto: "Corrige o nome em todos os sistemas." },
          { n: 3, titulo: "Departamento e Função", texto: "Trocar a função pode transformar a pessoa em gestor (ou tirar isso dela) em todos os sistemas." },
          { n: 4, titulo: "2º departamento e 2ª função", texto: "Para tirar, volte para “— Nenhum —”." },
          { n: 5, titulo: "Escopo", texto: "As responsabilidades da pessoa." },
          { n: 6, titulo: "Superior direto", texto: "Troca o chefe imediato." },
          { n: 7, titulo: "Sistemas liberados", texto: "Marque ou desmarque as caixinhas. Vale a partir da próxima vez que a pessoa abrir o sistema." },
          { n: 8, titulo: "É vendedor?", texto: "Coloca a pessoa no quadro de Metas e nos rankings do Carbo Sales." },
          { n: 9, titulo: "Salvar", texto: "Grava tudo. “Voltar” retorna ao cartão sem salvar." },
          { n: 10, titulo: "Bloquear acesso", texto: "Tira o acesso sem apagar nada. É o caminho certo para quem saiu da empresa. Veja abaixo." },
          { n: 11, titulo: "Apagar usuário e liberar a vaga", texto: "Apaga a pessoa de vez — login, acesso e vínculos — e pede confirmação. Não dá para desfazer: na dúvida, bloqueie." },
        ],
      },
      {
        titulo: "Bloquear o acesso",
        print: { chave: "usuarios-bloquear", legenda: "Confirmação do bloqueio." },
        itens: [
          { n: 1, titulo: "Vale para todos os sistemas", texto: "A pessoa deixa de entrar em todos os sistemas do CarboHub. Nada é apagado — vendas, leads, cadastros e histórico ficam onde estão." },
          { n: 2, titulo: "Quem está com a tela aberta", texto: "Quem já estava usando o sistema recebe um aviso na hora, mas a sessão pode continuar aberta por até 1 hora. Se for urgente, resete a senha também." },
          { n: 3, titulo: "Motivo", texto: "Opcional (ex.: desligamento). Fica no histórico do bloqueio." },
          { n: 4, titulo: "Bloquear acesso", texto: "Confirma. A pessoa sai da lista de Ativos e passa para a aba Bloqueados." },
        ],
      },
      {
        titulo: "Desbloquear",
        print: { chave: "usuarios-desbloquear", legenda: "O mesmo lugar, no cartão de quem está bloqueado." },
        itens: [
          { n: 1, titulo: "Acesso bloqueado", texto: "Avisa que a pessoa está bloqueada e que a senha dela nunca foi alterada." },
          { n: 2, titulo: "Desbloquear acesso", texto: "Devolve o acesso na hora. A pessoa entra com a mesma senha de antes e volta para a lista de Ativos." },
        ],
      },
    ],
  },

  // ── Departamentos e funções ─────────────────────────────────────────────────
  {
    id: "estrutura",
    titulo: "Departamentos e funções",
    rota: "/estrutura",
    resumo:
      "O cadastro dos departamentos da empresa e das funções de cada um. É a função que decide se a pessoa é gestor (vê tudo nos sistemas) ou colaborador (vê só o que é dela).",
    regras: {
      colaborador: [
        "A tela é a mesma para todo o time do TI.",
        "Mudar o nível de uma função muda, de uma vez, o que todas as pessoas com aquela função enxergam em todos os sistemas.",
      ],
      gestor: [
        "Nada muda para o gestor nesta tela.",
      ],
    },
    blocos: [
      {
        print: { chave: "estrutura", legenda: "Departamentos à esquerda; à direita, as funções do departamento escolhido (aqui, Comercial)." },
        itens: [
          { n: 1, titulo: "Um departamento", texto: "Cor, nome e sigla. Clique na linha para ver as funções dele no quadro da direita." },
          { n: 2, titulo: "Editar departamento", texto: "Troca nome, sigla e cor. Usuários que já existem não mudam de usuário de entrada." },
          { n: 3, titulo: "Remover departamento", texto: "Pede confirmação. Quem já está nesse departamento continua com ele no cadastro; ele só sai das listas de escolha." },
          { n: 4, titulo: "Novo departamento", texto: "Nome, sigla (até 4 letras) e cor. A sigla vira o começo do usuário de entrada de quem for criado nele (ex.: MKT0001)." },
          { n: 5, titulo: "Uma função e o nível dela", texto: "“Gestor · vê global”: a pessoa vê tudo do sistema e tem os botões de gestão. “Colaborador · vê próprio”: vê só o que é dela." },
          { n: 6, titulo: "Editar / apagar função", texto: "O lápis troca o nome e o nível; a lixeira tira a função das listas de escolha (quem já tem a função continua com ela)." },
          { n: 7, titulo: "Nova função", texto: "Nome e nível. Ela entra no fim da lista do departamento e já aparece ao criar ou editar um usuário." },
        ],
      },
    ],
  },

  // ── Quem recebe a venda on-line ─────────────────────────────────────────────
  {
    id: "avisos-venda",
    titulo: "Quem recebe a venda on-line",
    rota: "/ecommerce/avisos-de-venda",
    resumo:
      "O aviso de venda do e-commerce (sininho, som, mensagem na tela e celular) vai só para quem estiver ligado aqui. Ninguém é ligado sozinho: nem ser head liga alguém. A venda interna, feita pelo Vender, não passa por aqui — ela continua avisando o time.",
    regras: {
      colaborador: [
        "A tela é a mesma para todo o time do TI: quem tem o Carbo TI (ou o Carbo Admin) liberado liga e desliga qualquer pessoa.",
        "Cada mudança fica registrada com quem fez e quando.",
      ],
      gestor: [
        "Nada muda para o gestor nesta tela.",
      ],
    },
    blocos: [
      {
        print: { chave: "avisos-venda", legenda: "A aba Todo o time, com quem recebe e quem não recebe." },
        itens: [
          { n: 1, titulo: "Recebem / Heads / Todo o time", texto: "Recebem: quem está ligado agora (a tela abre aqui). Heads: os heads e a diretoria, para ajudar a escolher. Todo o time: todo mundo do time interno." },
          { n: 2, titulo: "Buscar", texto: "Procura pelo nome." },
          { n: 3, titulo: "Selo Head", texto: "Só uma ajuda para escolher. Ser head não liga ninguém." },
          { n: 4, titulo: "Ligado por… em…", texto: "Quem ligou a pessoa e em que dia." },
          { n: 5, titulo: "Interruptor", texto: "Liga ou desliga na hora. Se o banco recusar, ele volta sozinho para como estava e aparece o motivo." },
          { n: 6, titulo: "Desligado por… em…", texto: "Para quem já recebeu e foi desligado: quem desligou e quando." },
          { titulo: "Ninguém ligado", texto: "Se ninguém estiver ligado, aparece um aviso amarelo no topo: nesse caso nenhuma venda on-line avisa ninguém." },
        ],
      },
    ],
  },
];
