import type { Secao } from "../tipos";

// ─────────────────────────────────────────────────────────────────────────────
// Documentação do Carbo Marketing — Quadros: a lista, o quadro e o cartão.
//
// ⚠️ O `n` de cada item é o MESMO marcador do print (`chave`), medido pelo
// harness (docs-prints/shots_quadros.mjs). Mudou a tela: refaça o print.
// As visões Calendário/Timeline/Tabela/Dashboard/Mapa têm seção própria.
// ─────────────────────────────────────────────────────────────────────────────

export const SECOES_QUADROS: Secao[] = [
  // ── Lista de quadros ────────────────────────────────────────────────────────
  {
    id: "quadros",
    titulo: "Quadros",
    rota: "/quadros",
    resumo:
      "Os quadros do time, no jeito do Trello: cada quadro tem listas, e cada lista tem cartões — uma peça, uma campanha, uma tarefa. Aqui você abre um quadro, cria um novo, traz um quadro do Trello e procura cartões em todos eles de uma vez.",
    regras: {
      colaborador: [
        "Vê e abre todos os quadros do time de Marketing.",
        "Cria quadros e importa quadros do Trello.",
        "Exclui só os quadros que você mesmo criou.",
      ],
      gestor: [
        "Vê e mexe nos mesmos quadros que o colaborador.",
        "Pode excluir qualquer quadro, não só os que criou.",
      ],
    },
    blocos: [
      {
        print: { chave: "quadros", legenda: "A lista de quadros." },
        itens: [
          { n: 1, titulo: "Ver todos os quadros", texto: "Calendário geral e Tabela geral juntam os cartões de TODOS os quadros numa tela só — bom para ver a semana do time inteiro." },
          { n: 2, titulo: "Importar do Trello", texto: "Escolha o arquivo JSON exportado do Trello (no Trello: Menu › Imprimir, exportar e compartilhar › Exportar como JSON). Antes de gravar, a tela mostra um resumo: quantas listas, cartões, comentários e quem é quem. Nada é descartado — o que estava arquivado lá entra arquivado aqui. Arquivos enviados ao Trello entram como link e podem ser trazidos depois pelo botão “Trello” do quadro." },
          { n: 3, titulo: "Um quadro", texto: "Clique para abrir. Com o botão do meio do mouse, abre em outra guia." },
          { n: 4, titulo: "Excluir quadro", texto: "Aparece ao passar o mouse, só em quadro que você criou. É definitivo: apaga cartões, comentários e arquivos. Para confirmar, digite o nome do quadro. Se algum cartão dele estiver espelhado em outro quadro, a exclusão é recusada." },
          { n: 5, titulo: "Criar quadro", texto: "Dê um nome, escolha a cor e clique em Criar. O quadro novo abre vazio, pronto para as listas." },
        ],
      },
      {
        titulo: "Buscar entre quadros",
        print: { chave: "quadros-busca", legenda: "A busca entre quadros, com a palavra “post” e uma busca salva." },
        itens: [
          { n: 1, titulo: "Palavra-chave", texto: "Procura no título dos cartões de todos os quadros." },
          { n: 2, titulo: "Membros", texto: "Só os cartões de quem você marcar — ou os que estão sem ninguém." },
          { n: 3, titulo: "Data de entrega", texto: "Cartões sem data, ou com entrega entre as datas De e Até." },
          { n: 4, titulo: "Combinar as opções", texto: "“Todas”: o cartão precisa bater em tudo o que foi marcado. “Qualquer uma”: basta bater em uma. A palavra-chave e as datas valem sempre." },
          { n: 5, titulo: "Limpar", texto: "Desmarca tudo e esconde os resultados." },
          { n: 6, titulo: "Salvar busca", texto: "Guarda os filtros com um nome, para usar de novo com um clique." },
          { n: 7, titulo: "Buscas salvas", texto: "Clique no nome para aplicar. A lixeira apaga a busca salva (os cartões não mudam)." },
          { n: 8, titulo: "Resultados", texto: "Cada linha diz o quadro e a lista do cartão. Clique para abrir o cartão direto no quadro dele." },
        ],
      },
      {
        papel: "gestor",
        titulo: "Excluir qualquer quadro",
        print: { chave: "quadros-gestor", legenda: "Para o gestor, a lixeira aparece em todos os quadros.", papel: "gestor" },
        itens: [
          { n: 1, papel: "gestor", titulo: "Excluir quadro", texto: "O gestor exclui qualquer quadro, inclusive os criados por outras pessoas. As mesmas travas valem: digitar o nome para confirmar, e recusa se houver cartão espelhado em outro quadro." },
        ],
      },
    ],
  },

  // ── O quadro ────────────────────────────────────────────────────────────────
  {
    id: "quadro",
    titulo: "O quadro",
    rota: "/quadros",
    resumo:
      "Dentro do quadro, cada coluna é uma lista (Ideias, Produção, Em aprovação, Publicado…) e cada cartão é uma peça. Arraste o cartão de uma lista para outra conforme o trabalho anda. Tudo o que você muda aparece na hora para quem estiver com o quadro aberto.",
    regras: {
      colaborador: [
        "Cria, edita, move e arquiva listas e cartões em qualquer quadro do time.",
        "Os filtros, as listas recolhidas e as etiquetas abertas são só seus: não mudam a tela de mais ninguém.",
        "Ser membro do quadro é aparecer como participante — todo o time continua podendo abrir qualquer quadro.",
      ],
      gestor: [
        "Usa o quadro do mesmo jeito que o colaborador: não há botões a mais aqui.",
      ],
    },
    blocos: [
      {
        print: { chave: "quadro", legenda: "O quadro “Conteúdo Outubro”." },
        itens: [
          { n: 1, titulo: "Voltar", texto: "Volta para a lista de quadros." },
          { n: 2, titulo: "Visões", texto: "O mesmo quadro de outros jeitos: Calendário, Timeline, Tabela, Dashboard e Mapa. Cada visão tem a sua seção nesta documentação." },
          { n: 3, titulo: "Membros e Compartilhar", texto: "As fotos de quem participa do quadro. “Compartilhar” adiciona ou tira pessoas — veja abaixo." },
          { n: 4, titulo: "Filtrar", texto: "Mostra só os cartões que batem no filtro. Com filtro ligado o botão fica verde e diz quantas opções estão marcadas. Veja abaixo." },
          { n: 5, titulo: "Trello", texto: "Só aparece em quadro que veio do Trello: sincroniza com o quadro de lá e traz arquivos e comentários. Veja abaixo." },
          { n: 6, titulo: "Arquivados", texto: "Cartões e listas arquivados, para restaurar ou excluir de vez." },
          { n: 7, titulo: "Campos", texto: "Os campos personalizados do quadro (ex.: Canal de Publicação, Formato). Crie o campo aqui e preencha em cada cartão." },
          { n: 8, titulo: "Menu", texto: "O menu do quadro: descrição, atividade, etiquetas, cor, exportar e imprimir." },
          { n: 9, titulo: "Cabeçalho da lista", texto: "Pelos pontinhos você arrasta a lista para outro lugar; a seta recolhe a lista numa barra fina; clique no nome para renomear. O número é a quantidade de cartões." },
          { n: 10, titulo: "Ações da lista (⋯)", texto: "Cor, copiar, mover, ordenar, seguir e arquivar. O olho ao lado indica que você segue a lista. Veja abaixo." },
          { n: 11, titulo: "Capa", texto: "A faixa colorida no topo do cartão. Escolha a cor ou uma imagem no cartão aberto." },
          { n: 12, titulo: "Etiquetas", texto: "As barrinhas coloridas. Clique numa delas para ver o nome de todas (e de novo para voltar às barrinhas)." },
          { n: 13, titulo: "Campos na frente", texto: "Os campos personalizados preenchidos aparecem na frente do cartão, como no Trello." },
          { n: 14, titulo: "Datas", texto: "Início e entrega. O sino indica lembrete e as setas em círculo indicam que o cartão se repete. Fica vermelho quando atrasa e verde quando o cartão é concluído." },
          { n: 15, titulo: "Você segue", texto: "O olho mostra que você segue o cartão e recebe no sininho o que acontece nele." },
          { n: 16, titulo: "Avisos não lidos", texto: "O sino com número: avisos que você ainda não leu sobre este cartão (menção, comentário…). Some quando você abre o cartão." },
          { n: 17, titulo: "Membros do cartão", texto: "As fotos de quem está no cartão." },
          { n: 18, titulo: "Contadores", texto: "Descrição, anexos, itens de checklist feitos/total e comentários. “atrasado” em vermelho = item de checklist com data vencida." },
          { n: 19, titulo: "Cartão espelhado", texto: "O mesmo cartão de outro quadro, mostrado aqui. Mudar o conteúdo dele muda o original — é um cartão só em dois lugares." },
          { n: 20, titulo: "Capa cheia", texto: "O cartão inteiro na cor da capa, só com o título — bom para avisos e legendas do quadro." },
          { n: 21, titulo: "Concluído", texto: "O círculo verde marca o cartão como concluído." },
          { n: 22, titulo: "Adicionar cartão", texto: "Digite o título e tecle Enter. O cartão aparece na hora, no fim da lista." },
          { n: 23, titulo: "Criar de um modelo", texto: "Cria o cartão a partir de um modelo pronto do quadro. Veja abaixo." },
          { n: 24, titulo: "Adicionar lista", texto: "Cria uma lista nova no fim do quadro." },
          { n: 25, titulo: "Lista colorida", texto: "Lista com cor ganha o fundo inteiro na cor, para achar de longe (ex.: Em aprovação em laranja)." },
        ],
      },
      {
        titulo: "Arrastar cartões e listas",
        itens: [
          { titulo: "Mover um cartão", texto: "Clique e arraste o cartão para a posição ou a lista que quiser. Ele fica no lugar assim que você solta." },
          { titulo: "Mover uma lista", texto: "Arraste pelos pontinhos do cabeçalho." },
          { titulo: "Abrir um cartão", texto: "Clique no cartão (sem arrastar). O endereço da página passa a apontar para ele: dá para mandar o link a alguém ou dar F5 sem perder o cartão." },
        ],
      },
      {
        titulo: "Concluir e edição rápida",
        print: { chave: "quadro-concluir", legenda: "O cartão com o mouse em cima." },
        itens: [
          { n: 1, titulo: "Círculo de concluído", texto: "Aparece ao passar o mouse. Um clique marca o cartão como concluído (fica verde); outro desmarca." },
          { n: 2, titulo: "Lápis", texto: "Abre a edição rápida, sem abrir o cartão inteiro. Atalho: passe o mouse sobre o cartão e tecle E." },
          { n: 3, titulo: "Etiqueta", texto: "Clique numa barrinha para mostrar o nome das etiquetas em todo o quadro." },
        ],
      },
      {
        print: { chave: "quadro-rapida", legenda: "A edição rápida, com “Editar etiquetas” aberto." },
        itens: [
          { n: 1, titulo: "Título", texto: "Edite e tecle Enter (ou Salvar). Clicar fora também salva." },
          { n: 2, titulo: "Abrir cartão", texto: "Abre o cartão completo." },
          { n: 3, titulo: "Editar etiquetas", texto: "Marca e desmarca etiquetas com um clique." },
          { n: 4, titulo: "Alterar membros", texto: "Põe ou tira pessoas do cartão." },
          { n: 5, titulo: "Mudar capa", texto: "Cor ou imagem da capa." },
          { n: 6, titulo: "Editar datas", texto: "Início, entrega, repetir e lembrete." },
          { n: 7, titulo: "Mover", texto: "Para outra lista ou outro quadro, na posição escolhida." },
          { n: 8, titulo: "Copiar", texto: "Cria uma cópia do cartão onde você escolher." },
          { n: 9, titulo: "Copiar link", texto: "Copia o endereço do cartão para mandar a alguém." },
          { n: 10, titulo: "Arquivar", texto: "Tira o cartão do quadro. Ele continua em Arquivados." },
        ],
      },
      {
        titulo: "Filtrar o quadro",
        print: { chave: "quadro-filtro", legenda: "O filtro com a busca salva “Instagram desta semana” aplicada." },
        itens: [
          { n: 1, titulo: "Palavra-chave", texto: "Procura no título e na descrição." },
          { n: 2, titulo: "Membros", texto: "Sem membros, atribuídos a mim, ou as pessoas que você marcar." },
          { n: 3, titulo: "Status do cartão", texto: "Só concluídos ou só não concluídos." },
          { n: 4, titulo: "Data de entrega", texto: "Sem datas, atrasados, entrega no próximo dia, semana ou mês — ou entre as datas De e Até." },
          { n: 5, titulo: "Etiquetas", texto: "Só cartões com as etiquetas marcadas, ou sem etiqueta nenhuma." },
          { n: 6, titulo: "Atividade", texto: "Cartões mexidos na última semana, nas últimas 2 ou 4 semanas, ou parados há mais de 4." },
          { n: 7, titulo: "Combinar as opções", texto: "“Todas”: o cartão precisa bater em tudo. “Qualquer uma”: basta uma. Palavra-chave e datas valem sempre." },
          { n: 8, titulo: "Recolher listas vazias", texto: "Recolhe as listas que ficaram sem cartão no filtro, para sobrar espaço." },
          { n: 9, titulo: "Limpar e Salvar busca", texto: "Limpar tira o filtro. Salvar busca guarda o filtro com um nome, só para este quadro." },
          { n: 10, titulo: "Buscas salvas", texto: "Clique para aplicar de novo. A lixeira (ao passar o mouse) apaga." },
          { n: 11, titulo: "Quantos ficaram", texto: "Quantos cartões do quadro batem no filtro." },
          { n: 12, titulo: "Filtro ligado", texto: "O botão fica verde com o número de opções marcadas. O filtro é só na sua tela." },
        ],
      },
      {
        titulo: "Ações da lista",
        print: { chave: "quadro-lista", legenda: "O menu ⋯ da lista “Em aprovação”, com “Ordenar por” aberto." },
        itens: [
          { n: 1, titulo: "Cor da lista", texto: "Pinta a lista inteira. O quadrado claro tira a cor." },
          { n: 2, titulo: "Adicionar cartão", texto: "Abre o campo de cartão novo nesta lista." },
          { n: 3, titulo: "Copiar lista", texto: "Copia a lista com os cartões para este ou outro quadro." },
          { n: 4, titulo: "Mover lista", texto: "Leva a lista (com os cartões, inclusive os arquivados) para outra posição ou outro quadro." },
          { n: 5, titulo: "Mover todos os cartões", texto: "Passa os cartões desta lista para outra, e a lista fica vazia." },
          { n: 6, titulo: "Ordenar por", texto: "Reordena os cartões por data de criação, nome ou data de entrega." },
          { n: 7, titulo: "Seguir", texto: "Você é avisado no sininho quando um cartão entra nesta lista (criado ou movido por outra pessoa)." },
          { n: 8, titulo: "Recolher lista", texto: "Vira uma barra fina. Clique nela para abrir de novo. A escolha fica guardada só para você." },
          { n: 9, titulo: "Arquivar todos os cartões", texto: "Arquiva os cartões da lista de uma vez (pede confirmação). Eles vão para Arquivados." },
          { n: 10, titulo: "Arquivar lista", texto: "Tira a lista e os cartões dela do quadro. Dá para restaurar em Arquivados." },
        ],
      },
      {
        titulo: "Modelos de cartão",
        print: { chave: "quadro-modelo", legenda: "Os modelos do quadro, ao lado de “Adicionar cartão”." },
        itens: [
          { n: 1, titulo: "Um modelo", texto: "Cria o cartão já com checklist, etiquetas, campos e descrição do modelo. Se você digitou um título antes, ele vale; senão vale o do modelo. O cartão abre em seguida para você completar." },
          { n: 2, titulo: "Abrir os modelos", texto: "Para criar um modelo, abra um cartão pronto e use “Salvar como modelo”. O modelo guarda o conteúdo, não o estado: checklist volta desmarcado, e membros, datas e anexos não vão." },
        ],
      },
      {
        titulo: "Menu do quadro",
        print: { chave: "quadro-menu", legenda: "O menu do quadro, aberto pelo botão “Menu”." },
        itens: [
          { n: 1, titulo: "Sobre este quadro", texto: "A descrição do quadro (com formatação) e quem o criou." },
          { n: 2, titulo: "Atividade", texto: "O que aconteceu no quadro: comentários, cartões criados, movidos e arquivados, arquivos trocados." },
          { n: 3, titulo: "Etiquetas", texto: "Cria, renomeia, troca a cor e exclui etiquetas. Ao excluir, a tela diz de quantos cartões ela vai sair." },
          { n: 4, titulo: "Cor do quadro", texto: "A cor de destaque do quadro (bolinha e detalhes)." },
          { n: 5, titulo: "Campos personalizados", texto: "O mesmo do botão “Campos”." },
          { n: 6, titulo: "Itens arquivados", texto: "O mesmo do botão “Arquivados”." },
          { n: 7, titulo: "Recolher todas as listas", texto: "Deixa todas as listas como barras finas." },
          { n: 8, titulo: "Expandir todas as listas", texto: "Abre todas de novo." },
          { n: 9, titulo: "Exportar planilha (CSV)", texto: "Um cartão por linha, abre no Excel." },
          { n: 10, titulo: "Exportar tudo (JSON)", texto: "O quadro inteiro: cartões, comentários, checklists e anexos (como link)." },
          { n: 11, titulo: "Imprimir", texto: "As listas e os cartões ativos, prontos para papel ou PDF." },
        ],
      },
      {
        titulo: "Itens arquivados",
        print: { chave: "quadro-arquivados", legenda: "Itens arquivados do quadro." },
        itens: [
          { n: 1, titulo: "Buscar", texto: "Procura pelo nome do cartão ou da lista." },
          { n: 2, titulo: "Cartões / Listas", texto: "Alterna entre os cartões arquivados e as listas arquivadas." },
          { n: 3, titulo: "Restaurar", texto: "Volta o cartão para o quadro, na lista dele. Se a lista também foi arquivada, ela volta junto (“Restaurar (com a lista)”)." },
          { n: 4, titulo: "Excluir", texto: "Apaga o cartão de vez, com comentários e arquivos. Pede confirmação e não tem volta." },
          { titulo: "Abrir um arquivado", texto: "Clique no nome para abrir o cartão. Ele mostra uma faixa “Este cartão está arquivado” com o botão Restaurar." },
        ],
      },
      {
        titulo: "Compartilhar o quadro",
        print: { chave: "quadro-compartilhar", legenda: "Compartilhar quadro." },
        itens: [
          { n: 1, titulo: "Adicionar pessoa", texto: "Digite o nome de alguém do time e clique. A pessoa é avisada no sininho." },
          { n: 2, titulo: "Papel", texto: "Administrador ou Membro — é só um rótulo de quem cuida do quadro; não muda o que cada um pode fazer." },
          { n: 3, titulo: "Tirar do quadro", texto: "A pessoa deixa de aparecer como membro, mas continua podendo abrir o quadro, como todo o time." },
          { n: 4, titulo: "Sugestões", texto: "Quem já está em cartões deste quadro e ainda não é membro: um clique em Adicionar." },
          { n: 5, titulo: "Copiar link do quadro", texto: "Copia o endereço do quadro para mandar a alguém." },
        ],
      },
      {
        titulo: "Trello",
        print: { chave: "quadro-trello", legenda: "O painel “Trello” de um quadro importado." },
        itens: [
          { n: 1, titulo: "Sincronizar com o Trello", texto: "Enquanto o time ainda usa o Trello, este quadro acompanha o de lá. Clique em Comparar: a tela mostra cartão a cartão o que vai mudar, e só grava quando você clica em Aplicar. O Trello vence no que veio de lá; cartão apagado lá é arquivado aqui (nunca apagado); o que foi criado aqui continua." },
          { n: 2, titulo: "Arquivos", texto: "Os arquivos que estavam guardados no Trello e aqui ainda são só um link. “Copiar para o sistema” traz cada um para os anexos do cartão. Pode parar e continuar depois." },
          { n: 3, titulo: "Comentários", texto: "Traz os comentários antigos que não vieram no arquivo de importação. Rodar de novo não duplica nada." },
        ],
      },
    ],
  },

  // ── O cartão aberto ─────────────────────────────────────────────────────────
  {
    id: "cartao",
    titulo: "O cartão",
    rota: "/quadros",
    resumo:
      "Clicar num cartão abre tudo dele: à esquerda o conteúdo (ações, membros, etiquetas, datas, descrição, campos, anexos e checklist) e à direita os comentários e a atividade, cada lado com a sua rolagem. As mudanças aparecem na hora; se algo falhar ao gravar, a tela volta ao que era e avisa.",
    regras: {
      colaborador: [
        "Edita qualquer cartão dos quadros do time.",
        "Edita e exclui só os próprios comentários; nos dos outros, reage e responde.",
        "Seguir um cartão é escolha sua: só você recebe os avisos dele.",
      ],
      gestor: [
        "O cartão é igual para o gestor: não há botões a mais aqui.",
      ],
    },
    blocos: [
      {
        print: { chave: "cartao", legenda: "O cartão “Post Dia do Motorista”, com “Mostrar detalhes” ligado." },
        itens: [
          { n: 1, titulo: "Capa", texto: "Abre o painel de capa (cor, tamanho, imagem)." },
          { n: 2, titulo: "Lista", texto: "Em que lista o cartão está." },
          { n: 3, titulo: "Título", texto: "Clique para editar; Enter salva." },
          { n: 4, titulo: "Etiquetas", texto: "Marca etiquetas do quadro, renomeia, exclui ou cria uma nova." },
          { n: 5, titulo: "Datas", texto: "Início, entrega, repetir e lembrete. Veja abaixo." },
          { n: 6, titulo: "Checklist", texto: "Cria um checklist novo no cartão." },
          { n: 7, titulo: "Ingressar / Sair", texto: "Põe ou tira você mesmo dos membros do cartão." },
          { n: 8, titulo: "Membros", texto: "Põe ou tira qualquer pessoa do cartão." },
          { n: 9, titulo: "Anexo", texto: "Leva até a parte de anexos do cartão." },
          { n: 10, titulo: "Mover", texto: "Para outra lista ou outro quadro, escolhendo a posição. Entre quadros, as etiquetas vão pelo nome e cor (criadas lá se faltarem)." },
          { n: 11, titulo: "Copiar", texto: "Cria uma cópia, escolhendo o que vai junto. Veja abaixo." },
          { n: 12, titulo: "Espelhar", texto: "Mostra este mesmo cartão em outro quadro. Mexer em qualquer um dos dois muda os dois." },
          { n: 13, titulo: "Seguir", texto: "Você recebe no sininho os comentários, as mudanças de lista e o arquivamento deste cartão. Ser membro não faz seguir sozinho." },
          { n: 14, titulo: "Copiar link", texto: "Copia o endereço do cartão. Ele abre o cartão mesmo que mude de quadro." },
          { n: 15, titulo: "Salvar como modelo", texto: "Guarda etiquetas, checklist, campos e descrição para criar cartões iguais (pelo ícone ao lado de “Adicionar cartão”)." },
          { n: 16, titulo: "Arquivar", texto: "Tira o cartão do quadro. Ele continua em Arquivados, com tudo." },
          { n: 17, titulo: "Membros e etiquetas", texto: "Quem está no cartão e as etiquetas aplicadas. O + adiciona." },
          { n: 18, titulo: "Datas e concluído", texto: "A caixinha marca o cartão como concluído. Clique na data para mudar. Ao lado, o lembrete e a repetição. “Atrasado” aparece quando a entrega passou." },
          { n: 19, titulo: "Descrição", texto: "O texto do cartão, com títulos, listas e links. “Editar” abre o editor. Descrição longa fica recolhida com “Mostrar mais”." },
          { n: 20, titulo: "Escrever um comentário", texto: "Veja “Comentar”, abaixo." },
          { n: 21, titulo: "Mostrar / Ocultar detalhes", texto: "Mistura na conversa o histórico do cartão: quem criou, moveu, arquivou, trocou arquivo." },
          { n: 22, titulo: "Ações do comentário", texto: "Reagir com emoji (o 👍 2 mostra quantos reagiram; passe o mouse para ver quem), Responder (já menciona o autor), Link (copia o endereço deste comentário). No seu comentário também Editar e Excluir." },
          { n: 23, titulo: "Atividade", texto: "Uma linha do histórico, entre os comentários." },
          { titulo: "Link de um comentário", texto: "Quem abre o link cai no cartão, que rola até o comentário e o destaca por alguns segundos." },
        ],
      },
      {
        titulo: "Campos, anexos e checklist",
        print: { chave: "cartao-conteudo", legenda: "A parte de baixo do cartão." },
        itens: [
          { n: 1, titulo: "Campos personalizados", texto: "Preencha os campos do quadro. O que estiver preenchido aparece na frente do cartão." },
          { n: 2, titulo: "Enviar arquivo", texto: "Sobe vídeo, imagem, PDF ou qualquer arquivo direto para o cartão. Também dá para arrastar o arquivo do computador para cima do cartão aberto. Arquivo grande sobe em partes, com a porcentagem na tela." },
          { n: 3, titulo: "Um arquivo", texto: "Clique para abrir no visualizador. “v2” quer dizer que ele já foi substituído uma vez — as versões anteriores ficam guardadas." },
          { n: 4, titulo: "Ações do arquivo (⋯)", texto: "Substituir, copiar link, baixar e excluir. Veja abaixo." },
          { n: 5, titulo: "Anexar link", texto: "Cole um link do Google Drive, Figma, Canva… e clique em Anexar link." },
          { n: 6, titulo: "Link anexado", texto: "O ícone abre o link em outra guia; a lixeira (ao passar o mouse) tira o link do cartão." },
          { n: 7, titulo: "Progresso", texto: "Itens feitos / total, e a barra. A lixeira exclui o checklist." },
          { n: 8, titulo: "Item com data e responsável", texto: "Marque a caixinha quando terminar. Data e responsável do item aparecem quando preenchidos; item com data vencida fica vermelho e o cartão mostra “atrasado” na frente." },
          { n: 9, titulo: "Item vazio", texto: "Passe o mouse para preencher data e responsável, ou para apagar o item (X)." },
          { n: 10, titulo: "Adicionar item", texto: "Digite e tecle Enter; o campo continua aberto para o próximo." },
          { n: 11, titulo: "Localização", texto: "Endereço do cartão, para aparecer na visão Mapa." },
        ],
      },
      {
        titulo: "Ações do arquivo",
        print: { chave: "cartao-anexo-menu", legenda: "O menu ⋯ de um arquivo." },
        itens: [
          { n: 1, titulo: "Substituir (nova versão)", texto: "Troca o arquivo por outro, mantendo o mesmo anexo e o mesmo link. O anterior vira uma versão guardada (v1, v2…) — nada se perde." },
          { n: 2, titulo: "Copiar link", texto: "Um link que abre o cartão já neste arquivo. Continua valendo depois de substituir." },
          { n: 3, titulo: "Baixar", texto: "Baixa o arquivo original, como foi enviado." },
          { n: 4, titulo: "Excluir", texto: "Apaga o arquivo e todas as versões dele. Se ele era a capa do cartão, a capa sai junto." },
        ],
      },
      {
        titulo: "Visualizador e versões",
        print: { chave: "cartao-visualizador", legenda: "O visualizador, vendo a versão anterior (v1) de uma arte." },
        itens: [
          { n: 1, titulo: "Versões", texto: "Escolha uma versão anterior para ver. A lista diz quando e quem enviou cada uma." },
          { n: 2, titulo: "Comparar", texto: "Mostra a versão anterior e a atual lado a lado. Em vídeo, os dois tocam juntos." },
          { n: 3, titulo: "Copiar link", texto: "O link do arquivo." },
          { n: 4, titulo: "Baixar", texto: "Baixa a versão que está na tela." },
          { n: 5, titulo: "Restaurar esta versão", texto: "A versão antiga volta a ser a atual, como versão nova. A que estava atual fica no histórico." },
          { n: 6, titulo: "Voltar para a atual", texto: "Sai da versão antiga. O botão Excluir, ao lado, apaga só aquela versão." },
          { titulo: "Navegar e tocar", texto: "As setas (ou ← →) passam para o arquivo anterior ou seguinte. Vídeo tem controle de velocidade e avanço quadro a quadro. Vídeo de iPhone que o navegador não toca ganha uma cópia para assistir em alguns minutos; o original continua intacto." },
        ],
      },
      {
        titulo: "Datas, lembrete e repetir",
        print: { chave: "cartao-datas", legenda: "O painel de datas." },
        itens: [
          { n: 1, titulo: "Calendário", texto: "Clique no dia para preencher a data marcada abaixo (início ou entrega)." },
          { n: 2, titulo: "Data de início", texto: "Ligue a caixinha para o cartão ter início." },
          { n: 3, titulo: "Data de entrega", texto: "O prazo, com hora. É ele que vira vermelho quando passa." },
          { n: 4, titulo: "Repetir", texto: "Diária, semanal, mensal ou anual. Ao CONCLUIR o cartão, nasce o próximo logo abaixo, com a nova data e o checklist desmarcado." },
          { n: 5, titulo: "Lembrete", texto: "Avisa no sininho os membros do cartão (sem membro, quem criou) o tempo escolhido antes da entrega." },
          { n: 6, titulo: "Salvar", texto: "Só grava ao clicar aqui." },
          { n: 7, titulo: "Remover", texto: "Tira as datas, o lembrete e a repetição." },
          { titulo: "Aviso de prazo", texto: "Além do lembrete, quem é membro recebe no sininho, uma vez, o aviso do cartão que atrasou ontem." },
        ],
      },
      {
        titulo: "Etiquetas",
        print: { chave: "cartao-etiquetas", legenda: "O painel de etiquetas do cartão." },
        itens: [
          { n: 1, titulo: "Aplicar", texto: "Marque para pôr a etiqueta no cartão; desmarque para tirar." },
          { n: 2, titulo: "Renomear", texto: "Clique no nome e digite. Vale para o quadro inteiro." },
          { n: 3, titulo: "Excluir etiqueta", texto: "Apaga a etiqueta do quadro (sai de todos os cartões)." },
          { n: 4, titulo: "Criar etiqueta", texto: "Nome, cor e Criar." },
        ],
      },
      {
        titulo: "Capa",
        print: { chave: "cartao-capa", legenda: "O painel de capa." },
        itens: [
          { n: 1, titulo: "Tamanho", texto: "Faixa no topo, ou o cartão inteiro na capa (só o título aparece)." },
          { n: 2, titulo: "Remover capa", texto: "Tira a capa." },
          { n: 3, titulo: "Cores", texto: "Escolha a cor." },
          { n: 4, titulo: "Imagem dos anexos", texto: "Use uma imagem já anexada ao cartão como capa. Trocar o arquivo troca a capa junto." },
          { n: 5, titulo: "Carregar uma imagem de capa", texto: "Envia uma imagem nova: ela vira capa e também fica nos anexos do cartão." },
        ],
      },
      {
        titulo: "Editar a descrição",
        print: { chave: "cartao-editor", legenda: "O editor da descrição." },
        itens: [
          { n: 1, titulo: "Barra de formatação", texto: "Título, negrito, itálico, tachado, listas, link, citação, código e linha. Também desfazer e refazer." },
          { n: 2, titulo: "Texto", texto: "Escreva como num editor comum: o que você vê é como fica." },
          { n: 3, titulo: "M↓", texto: "Mostra o texto cru (Markdown), para quem prefere. Clique de novo para voltar ao editor visual." },
          { n: 4, titulo: "Salvar", texto: "Grava a descrição." },
          { n: 5, titulo: "Descartar alterações", texto: "Sai sem gravar." },
        ],
      },
      {
        titulo: "Comentar",
        print: { chave: "cartao-comentar", legenda: "Escrevendo um comentário." },
        itens: [
          { n: 1, titulo: "Campo do comentário", texto: "Enter quebra linha. Para enviar, clique em Salvar ou tecle Ctrl+Enter." },
          { n: 2, titulo: "Formatação", texto: "Negrito, itálico, tachado, código, lista e link. Selecione o texto antes para aplicar nele." },
          { n: 3, titulo: "Salvar", texto: "Publica o comentário. Ele aparece na hora; se não gravar, o texto volta para o campo — nada se perde." },
          { n: 4, titulo: "Cancelar", texto: "Limpa o campo." },
        ],
      },
      {
        titulo: "Mencionar alguém",
        print: { chave: "cartao-mencao", legenda: "Digitando @ no comentário." },
        itens: [
          { n: 1, titulo: "Digite @", texto: "Comece a escrever o nome depois do @. Dá para chamar qualquer pessoa do time, mesmo de fora do quadro." },
          { n: 2, titulo: "Escolha a pessoa", texto: "Clique (ou setas + Enter). Ao salvar o comentário, só ela é avisada no sininho. Se você apagar a menção antes de salvar, ninguém é avisado." },
        ],
      },
      {
        titulo: "Copiar ou mover o cartão",
        print: { chave: "cartao-mover", legenda: "Copiar cartão." },
        itens: [
          { n: 1, titulo: "Título", texto: "O nome da cópia (vem com o do original)." },
          { n: 2, titulo: "Manter", texto: "O que vai junto na cópia: checklists, etiquetas, membros, anexos, campos e comentários." },
          { n: 3, titulo: "Quadro", texto: "Este ou outro quadro do time." },
          { n: 4, titulo: "Lista e posição", texto: "Onde o cartão vai ficar." },
          { n: 5, titulo: "Criar cópia", texto: "Cria a cópia. Em “Mover”, a mesma janela leva o próprio cartão, com tudo, sem as opções de Manter." },
        ],
      },
      {
        titulo: "Avisos do cartão no sininho",
        itens: [
          { titulo: "O que avisa", texto: "Menção a você, comentário, mudança de lista e arquivamento (se você segue o cartão), cartão novo numa lista que você segue, lembrete e prazo vencido (se você é membro), e quando alguém adiciona você a um quadro. Você nunca é avisado do que você mesmo fez." },
          { titulo: "Abrir pelo aviso", texto: "Clicar no aviso abre o cartão, de qualquer sistema do Grupo Carbo. Abrir o cartão marca os avisos dele como lidos." },
        ],
      },
    ],
  },
];
