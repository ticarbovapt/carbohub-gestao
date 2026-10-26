import type { Secao } from "../tipos";

// ─────────────────────────────────────────────────────────────────────────────
// Documentação do Carbo Ops — Minha Equipe e Carbo Chat (as MESMAS telas do Sales). Antes: Metas de Vendedores, Pontos de
// Venda, Minha Equipe e Carbo Chat.
//
// ⚠️ O `n` de cada item é o MESMO marcador do print (`chave`), medido pelo
// harness (docs-prints/shots_comercial.mjs). Mudou a tela: refaça o print.
// ─────────────────────────────────────────────────────────────────────────────

export const SECOES_COMERCIAL: Secao[] = [
  // ── Minha Equipe ────────────────────────────────────────────────────────────
  {
    id: "equipe",
    titulo: "Minha Equipe",
    rota: "/equipe",
    resumo:
      "A lista dos colegas do seu departamento, para achar contato rápido. É só para consultar: ninguém edita nada por aqui.",
    regras: {
      colaborador: [
        "Vê os colegas do(s) departamento(s) em que você está cadastrado, com função e e-mail.",
      ],
      gestor: [
        "Vê a mesma lista que o colaborador — esta tela não tem nada a mais para o gestor.",
        "Cadastro de pessoas, funções e acessos é feito pelo TI.",
      ],
    },
    blocos: [
      {
        print: { chave: "equipe", legenda: "Minha Equipe, aberta pelo menu da sua conta." },
        itens: [
          { n: 1, titulo: "Como chegar", texto: "Clique no seu nome, no canto de cima, e escolha “Minha equipe”." },
          { n: 2, titulo: "Buscar", texto: "Procura por nome, usuário ou e-mail." },
          { n: 3, titulo: "Colega", texto: "Foto, nome, função e departamento. Quem tem duas funções aparece com as duas." },
          { n: 4, titulo: "E-mail", texto: "Clique para escrever um e-mail para a pessoa." },
          { n: 5, titulo: "Sem e-mail", texto: "A pessoa não tem e-mail cadastrado. Fale com ela pelo Carbo Chat." },
        ],
      },
    ],
  },

  // ── Carbo Chat ──────────────────────────────────────────────────────────────
  {
    id: "chat",
    titulo: "Carbo Chat",
    rota: "/chat",
    resumo:
      "O chat interno do Grupo Carbo: conversas diretas com colegas, grupos e os avisos da empresa. É o mesmo chat em todos os sistemas — a conversa começada aqui continua no Ops, no Finanças e nos outros.",
    blocos: [
      {
        print: { chave: "chat", legenda: "O Carbo Chat com uma conversa aberta." },
        itens: [
          { n: 1, titulo: "Carbo Chat no menu", texto: "O número verde é quantas mensagens você ainda não leu, somando todas as conversas." },
          { n: 2, titulo: "Seu status", texto: "Clique para avisar se está Disponível, Em campo, Em reunião, De férias ou Ausente, e por quanto tempo. Os colegas veem ao lado do seu nome." },
          { n: 3, titulo: "Início / Mural", texto: "Abre o mural da empresa: avisos, recados e aniversariantes." },
          { n: 4, titulo: "Explorar canais", texto: "Lista os grupos abertos em que você pode entrar." },
          { n: 5, titulo: "Mensagens agendadas", texto: "As mensagens que você programou para enviar depois. Dá para editar ou cancelar antes do envio." },
          { n: 6, titulo: "Nova conversa", texto: "Começa uma conversa com um colega ou cria um grupo." },
          { n: 7, titulo: "Buscar", texto: "Procura conversas e mensagens. Atalho: Ctrl+K." },
          { n: 8, titulo: "Tudo / Grupos", texto: "Mostra todas as conversas ou só os grupos. Quando há conversa arquivada, aparece também “Arquivadas”." },
          { n: 9, titulo: "Uma conversa", texto: "Nome, última mensagem e o horário. A bolinha verde é o número de não lidas; o alfinete marca conversa fixada no topo e o sino cortado, conversa silenciada. Passe o mouse e clique em ⋯ para fixar, silenciar, arquivar ou marcar como não lida." },
          { n: 10, titulo: "Ligar", texto: "Faz uma chamada de voz com a pessoa (no grupo, abre a chamada do grupo)." },
          { n: 11, titulo: "Buscar na conversa", texto: "Procura uma mensagem antiga só nesta conversa." },
          { n: 12, titulo: "Reações", texto: "Passe o mouse numa mensagem para reagir com emoji, responder, editar ou apagar a sua." },
          { n: 13, titulo: "Anexar", texto: "Envia foto, vídeo, arquivo ou cria uma enquete. O botão ao lado insere emoji." },
          { n: 14, titulo: "Escrever", texto: "Enter envia; Shift+Enter pula linha. Com o campo vazio, o microfone à direita grava um áudio. Com texto, a seta ao lado do enviar deixa agendar o envio." },
          { titulo: "Avisos no celular", texto: "Para receber as mensagens com o sistema fechado, use o botão “Ativar notificações” que aparece embaixo da lista de conversas (só aparece quando o aparelho ainda não está ativado). No celular, ative pelo Hub (carbohub.com.br)." },
        ],
      },
    ],
  },
];
