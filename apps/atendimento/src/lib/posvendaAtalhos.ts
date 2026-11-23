// ─────────────────────────────────────────────────────────────────────────────
// Pós-venda — as MENSAGENS PADRÃO do atendente, pelo atalho de barra (23/11/2026).
//
// Pedido do dono do processo: o fluxo não só mostra o caminho, ele diz QUAL
// mensagem usar em cada passo, pelo nome da barra que o atendente digita
// (`/fotos_produto`, `/fotos_embalagem`…). No slide o atalho aparece dentro
// da caixa do passo; no app, clicar nele abre a mensagem para ler e copiar.
//
// ⚠️ ESTE é o arquivo que muda quando chegarem as mensagens OFICIAIS: troque o
// texto aqui e rode `node docs/posvenda/gerar-pptx.mjs && node
// docs/posvenda/publicar-nos-apps.mjs`. Os textos abaixo são EXEMPLOS.
//
// Variáveis: {nome} {pedido} {entregue} {previsao} {rastreio} {valor} — o que
// não se sabe sai entre colchetes para o atendente completar.
//
// ⚠️ O nome da barra é minúsculo, sem acento, com `_` (é o que se digita).
// Atalho novo: entra em ATALHOS e em ATALHOS_DO_PASSO (o teste recusa atalho
// usado e não cadastrado, e cadastrado e não usado).
// ─────────────────────────────────────────────────────────────────────────────

export interface Atalho {
  /** O que a mensagem faz, em poucas palavras (aparece no topo da caixinha). */
  titulo: string;
  texto: string;
}

export const ATALHOS: Record<string, Atalho> = {
  // ── Pedir fotos e vídeos ──────────────────────────────────────────────────
  fotos_embalagem: {
    titulo: "Fotos da embalagem",
    texto:
      "Olá, {nome}! Sentimos muito pelo transtorno com o pedido {pedido}. Para resolvermos rápido, pode nos enviar fotos da embalagem?\n" +
      "1) a caixa fechada, com a etiqueta visível;\n2) o lacre ou a fita da embalagem;\n3) a caixa aberta, do jeito que chegou.\n" +
      "Assim que recebermos, damos o retorno.",
  },
  fotos_produto: {
    titulo: "Fotos do produto",
    texto:
      "Olá, {nome}! Para entendermos o que aconteceu com o produto do pedido {pedido}, pode nos enviar fotos do produto " +
      "mostrando o problema? Se for vazamento ou dano, uma foto de perto e outra mostrando o produto inteiro ajudam muito.",
  },
  video_produto: {
    titulo: "Vídeo do problema",
    texto:
      "Olá, {nome}! Se puder, grave um vídeo curto (até 30 segundos) mostrando o problema no produto do pedido {pedido}. " +
      "Com ele conseguimos resolver mais rápido.",
  },
  fotos_lote: {
    titulo: "Foto do lote e da validade",
    texto:
      "Olá, {nome}! Pode nos enviar também uma foto do rótulo do produto, onde aparecem o lote e a validade? " +
      "Assim registramos a ocorrência com a fábrica.",
  },
  fotos_produto_errado: {
    titulo: "Foto do produto que chegou",
    texto:
      "Olá, {nome}! Pedimos desculpas pela troca no pedido {pedido}. Pode nos enviar uma foto do produto que chegou e da etiqueta da caixa?",
  },
  fotos_devolucao: {
    titulo: "Fotos para a devolução",
    texto:
      "Olá, {nome}! Recebemos o seu pedido de devolução do pedido {pedido}. Para darmos andamento, pode nos enviar fotos " +
      "da embalagem e do produto, mostrando se o lacre está intacto?",
  },

  // ── Conversar e orientar ─────────────────────────────────────────────────
  entender_problema: {
    titulo: "Entender o problema",
    texto:
      "Olá, {nome}! Sentimos muito que o produto do pedido {pedido} não atendeu o que você esperava. " +
      "Pode nos contar o que aconteceu? Por exemplo: vazou, chegou com o lacre aberto, a cor ou o cheiro estão diferentes, " +
      "ou você não percebeu resultado depois do uso.",
  },
  orientar_uso: {
    titulo: "Como usar o produto",
    texto:
      "Olá, {nome}! Para ter o melhor resultado: [dosagem por litro de combustível], aplicado no momento do abastecimento, " +
      "e o efeito aparece depois de [tempo de uso]. Se depois disso continuar sem resultado, nos avise que analisamos com você.",
  },
  itens_do_pedido: {
    titulo: "O que vem no pedido",
    texto:
      "Olá, {nome}! Conferimos o pedido {pedido}: ele é composto por [itens e quantidades]. " +
      "Pode conferir com o que chegou? Se ainda faltar algo, nos avise que resolvemos.",
  },
  previsao_entrega: {
    titulo: "Previsão de entrega",
    texto:
      "Olá, {nome}! Conferimos o pedido {pedido}: ele está a caminho, com previsão de entrega em {previsao}. " +
      "Seguimos acompanhando e te avisamos se algo mudar.",
  },
  procurar_vizinhos: {
    titulo: "Procurar com portaria e vizinhos",
    texto:
      "Olá, {nome}! O rastreio do pedido {pedido} aparece como entregue em {entregue}. Pode verificar, por favor, com a portaria, " +
      "vizinhos ou alguém da casa? Se não aparecer até amanhã, abrimos a reclamação com a transportadora e resolvemos para você.",
  },
  comprovante_entrega: {
    titulo: "Comprovante de entrega",
    texto:
      "Olá, {nome}! A transportadora nos enviou o comprovante de entrega do pedido {pedido} (segue em anexo), " +
      "com data, hora e quem recebeu. Pode conferir se reconhece? Se não reconhecer, nos avise que seguimos com você.",
  },
  reclamacao_aberta: {
    titulo: "Reclamação aberta na transportadora",
    texto:
      "Olá, {nome}! Abrimos uma reclamação com a transportadora sobre o pedido {pedido} (protocolo [protocolo]). " +
      "O prazo de resposta é de até [prazo] dias úteis, e te avisamos assim que tivermos retorno.",
  },
  confirmar_endereco: {
    titulo: "Confirmar o endereço",
    texto:
      "Olá, {nome}! O pedido {pedido} voltou para nós porque a entrega não foi concluída. Pode confirmar o endereço completo " +
      "(rua, número, complemento, bairro, cidade e CEP) e o melhor horário para receber?",
  },

  // ── Perguntar o que o cliente prefere ────────────────────────────────────
  opcoes_faltante: {
    titulo: "Opções: item faltando",
    texto:
      "Olá, {nome}! Confirmamos que faltou [item] no pedido {pedido}. Você prefere:\n" +
      "1) que a gente envie o que faltou, sem custo;\n2) receber de volta o valor do que faltou; ou\n3) desfazer a compra, com o valor total de volta?",
  },
  opcoes_avaria: {
    titulo: "Opções: produto com problema",
    texto:
      "Olá, {nome}! Sentimos muito pelo problema com o pedido {pedido}. Você prefere:\n" +
      "1) receber outro produto, sem custo;\n2) o valor total de volta; ou\n3) ficar com o produto e receber um abatimento no valor?",
  },
  opcoes_errado: {
    titulo: "Opções: produto errado",
    texto:
      "Olá, {nome}! Confirmamos que o pedido {pedido} foi enviado com o produto errado, pedimos desculpas. Você prefere " +
      "receber o produto certo ou o valor de volta? Nos dois casos, o frete de devolução do produto errado é por nossa conta.",
  },
  opcoes_entrega: {
    titulo: "Opções: entrega não concluída",
    texto:
      "Olá, {nome}! Sentimos muito pelo que aconteceu com a entrega do pedido {pedido}. Você prefere que a gente envie " +
      "o pedido de novo, sem custo, ou receber o valor total de volta?",
  },
  opcoes_arrependimento: {
    titulo: "Opções: devolução",
    texto:
      "Olá, {nome}! O produto do pedido {pedido} chegou aqui e está tudo certo. Você prefere receber o valor de volta " +
      "ou trocar por outro produto?",
  },

  // ── Avisar o que foi feito ───────────────────────────────────────────────
  reenvio_feito: {
    titulo: "Pedido reenviado",
    texto:
      "Olá, {nome}! Enviamos de novo o pedido {pedido}, sem custo para você. O código de rastreio é {rastreio}. " +
      "Qualquer novidade, estamos por aqui.",
  },
  troca_enviada: {
    titulo: "Troca enviada",
    texto:
      "Olá, {nome}! O produto novo do pedido {pedido} já foi enviado, sem custo para você. O código de rastreio é {rastreio}.",
  },
  troca_produto_certo: {
    titulo: "Produto certo a caminho",
    texto:
      "Olá, {nome}! O produto certo do pedido {pedido} já foi enviado (rastreio {rastreio}). Também te enviamos a etiqueta " +
      "para devolver o produto errado: é só embalar e levar a uma agência ou ponto de coleta, o frete é por nossa conta.",
  },
  etiqueta_reversa: {
    titulo: "Etiqueta de devolução",
    texto:
      "Olá, {nome}! Autorizamos a devolução do pedido {pedido}. Segue a etiqueta de postagem, e o frete é por nossa conta. " +
      "É só embalar o produto e levar a uma agência ou ponto de coleta. Assim que ele chegar aqui, damos sequência.",
  },
  recusar_na_entrega: {
    titulo: "Recusar na entrega",
    texto:
      "Olá, {nome}! Como o pedido {pedido} já está a caminho, quando o entregador chegar é só recusar o recebimento. " +
      "A encomenda volta para nós e, assim que ela chegar, devolvemos o valor.",
  },
  pedido_cancelado: {
    titulo: "Pedido cancelado",
    texto:
      "Olá, {nome}! Cancelamos o pedido {pedido} como você pediu. O valor será devolvido em até [prazo], " +
      "pela mesma forma de pagamento.",
  },

  // ── Reembolso ────────────────────────────────────────────────────────────
  reembolso_dados: {
    titulo: "Pedir os dados do reembolso",
    texto:
      "Olá, {nome}! Para fazermos o reembolso do pedido {pedido}, pode nos informar a chave Pix (ou banco, agência e conta) " +
      "e o nome do titular?",
  },
  reembolso_pago: {
    titulo: "Reembolso feito",
    texto:
      "Olá, {nome}! O reembolso de {valor} referente ao pedido {pedido} foi feito. Segue o comprovante. " +
      "Qualquer dúvida, estamos à disposição.",
  },

  // ── Quando não há o que trocar ou devolver ───────────────────────────────
  recusa_sem_defeito: {
    titulo: "Sem defeito encontrado",
    texto:
      "Olá, {nome}. Analisamos o que você nos enviou sobre o pedido {pedido} e não identificamos defeito no produto, porque [motivo]. " +
      "Se quiser, podemos te orientar no uso para ter o melhor resultado.",
  },
  recusa_produto_certo: {
    titulo: "O produto é o do pedido",
    texto:
      "Olá, {nome}. Conferimos as fotos e o produto que chegou é o mesmo do pedido {pedido}: [produto do pedido]. " +
      "Se notar qualquer outro problema, nos avise que analisamos.",
  },
  recusa_fora_prazo: {
    titulo: "Fora do prazo de 7 dias",
    texto:
      "Olá, {nome}. O direito de arrependimento (art. 49 do Código de Defesa do Consumidor) vale por 7 dias a partir do recebimento, " +
      "e o pedido {pedido} foi entregue em {entregue}. Por isso não conseguimos aceitar a devolução por desistência. " +
      "Se houver qualquer problema com o produto, nos conte que analisamos.",
  },
  recusa_produto_aberto: {
    titulo: "Produto aberto",
    texto:
      "Olá, {nome}. Como o produto do pedido {pedido} foi aberto e não apresenta defeito, não conseguimos aceitar a devolução por " +
      "desistência: por ser consumível, depois de aberto ele não pode voltar à venda. Se notar qualquer problema no produto, nos avise que analisamos.",
  },
  recusa_conferencia: {
    titulo: "Chegou diferente do informado",
    texto:
      "Olá, {nome}. O produto do pedido {pedido} chegou aqui [o que chegou diferente], diferente do que foi informado nas fotos. " +
      "Por isso não conseguimos seguir com a devolução. Se quiser conversar sobre isso, estamos à disposição.",
  },
};

/**
 * Quais atalhos cada PASSO usa (tipo do caso → id do passo → atalhos, na ordem
 * em que aparecem). `*` vale para todos os tipos (o reembolso é o mesmo em todos).
 */
export const ATALHOS_DO_PASSO: Record<string, Record<string, string[]>> = {
  "*": {
    reembolso_parcial: ["reembolso_dados"],
    reembolso_integral: ["reembolso_dados"],
    reembolso_parcial_comprovante: ["reembolso_pago"],
    reembolso_integral_comprovante: ["reembolso_pago"],
  },
  faltante: {
    fotos: ["fotos_embalagem", "fotos_produto"],
    transportadora: ["reclamacao_aberta"],
    explicar: ["itens_do_pedido"],
    escolha: ["opcoes_faltante"],
    reenvio: ["reenvio_feito"],
  },
  avaria: {
    fotos: ["fotos_embalagem", "fotos_produto", "video_produto"],
    transportadora: ["reclamacao_aberta"],
    escolha: ["opcoes_avaria"],
    troca: ["troca_enviada"],
  },
  defeito: {
    relato: ["entender_problema"],
    orientar: ["orientar_uso"],
    fotos: ["fotos_produto", "video_produto", "fotos_lote"],
    recolher: ["etiqueta_reversa"],
    escolha: ["opcoes_avaria"],
    troca: ["troca_enviada"],
    recusa: ["recusa_sem_defeito"],
  },
  errado: {
    fotos: ["fotos_produto_errado"],
    escolha: ["opcoes_errado"],
    troca: ["troca_produto_certo"],
    recolher: ["etiqueta_reversa"],
    recusa: ["recusa_produto_certo"],
  },
  arrependimento: {
    cancelar: ["pedido_cancelado"],
    recusar_entrega: ["recusar_na_entrega"],
    recusa_prazo: ["recusa_fora_prazo"],
    fotos: ["fotos_devolucao"],
    recusa_aberto: ["recusa_produto_aberto"],
    reversa: ["etiqueta_reversa"],
    escolha: ["opcoes_arrependimento"],
    troca: ["troca_enviada"],
    recusa_conferencia: ["recusa_conferencia"],
  },
  nao_recebido: {
    vizinhos: ["procurar_vizinhos"],
    chamado: ["reclamacao_aberta"],
    comprovada: ["comprovante_entrega"],
    escolha: ["opcoes_entrega"],
    reenvio: ["reenvio_feito"],
  },
  atraso: {
    informar: ["previsao_entrega"],
    chamado: ["reclamacao_aberta"],
    escolha: ["opcoes_entrega"],
    reenvio: ["reenvio_feito"],
  },
  devolvido: {
    endereco: ["confirmar_endereco"],
    reenvio: ["reenvio_feito"],
  },
};

/** Os atalhos de um passo (os do tipo vencem os de `*`). */
export function atalhosDoPasso(tipo: string, passo: string): string[] {
  return ATALHOS_DO_PASSO[tipo]?.[passo] ?? ATALHOS_DO_PASSO["*"][passo] ?? [];
}
