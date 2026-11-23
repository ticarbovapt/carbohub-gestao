// GERADO por docs/posvenda/publicar-nos-apps.mjs — não editar.
// Os slides de docs/posvenda/fluxos-pos-venda.pptx: título e conectores
// clicáveis (em polegadas, slide de 13.333 × 7.5).
export interface Caixa { x: number; y: number; w: number; h: number }
export interface LinkDoSlide extends Caixa { slide: number }
export interface VaiAoPasso extends Caixa { passo: number }
export interface SlideDoFluxo {
  n: number; titulo: string; sub?: string; links: LinkDoSlide[]; passos?: Record<string, Caixa>;
  /** A caixa de cada passo NUMERADO do slide (o número que aparece no desenho). */
  caixas?: Record<string, Caixa>;
  /** Os avisos "→ vá ao passo N": clicar acende a caixa do passo N. */
  vai?: VaiAoPasso[];
  /** Os atalhos de mensagem ("/fotos_produto") desenhados nas caixas: clicar abre a mensagem. */
  atalhos?: AtalhoNoSlide[];
}
export interface AtalhoNoSlide extends Caixa { barra: string }
export interface MensagemPadrao { titulo: string; texto: string }

export const FLUXOS_SLIDES = {
 "largura": 13.333,
 "altura": 7.5,
 "reembolso": 14,
 "mensagens": {
  "fotos_embalagem": {
   "titulo": "Fotos da embalagem",
   "texto": "Olá, {nome}! Sentimos muito pelo transtorno com o pedido {pedido}. Para resolvermos rápido, pode nos enviar fotos da embalagem?\n1) a caixa fechada, com a etiqueta visível;\n2) o lacre ou a fita da embalagem;\n3) a caixa aberta, do jeito que chegou.\nAssim que recebermos, damos o retorno."
  },
  "fotos_produto": {
   "titulo": "Fotos do produto",
   "texto": "Olá, {nome}! Para entendermos o que aconteceu com o produto do pedido {pedido}, pode nos enviar fotos do produto mostrando o problema? Se for vazamento ou dano, uma foto de perto e outra mostrando o produto inteiro ajudam muito."
  },
  "video_produto": {
   "titulo": "Vídeo do problema",
   "texto": "Olá, {nome}! Se puder, grave um vídeo curto (até 30 segundos) mostrando o problema no produto do pedido {pedido}. Com ele conseguimos resolver mais rápido."
  },
  "fotos_lote": {
   "titulo": "Foto do lote e da validade",
   "texto": "Olá, {nome}! Pode nos enviar também uma foto do rótulo do produto, onde aparecem o lote e a validade? Assim registramos a ocorrência com a fábrica."
  },
  "fotos_produto_errado": {
   "titulo": "Foto do produto que chegou",
   "texto": "Olá, {nome}! Pedimos desculpas pela troca no pedido {pedido}. Pode nos enviar uma foto do produto que chegou e da etiqueta da caixa?"
  },
  "fotos_devolucao": {
   "titulo": "Fotos para a devolução",
   "texto": "Olá, {nome}! Recebemos o seu pedido de devolução do pedido {pedido}. Para darmos andamento, pode nos enviar fotos da embalagem e do produto, mostrando se o lacre está intacto?"
  },
  "entender_problema": {
   "titulo": "Entender o problema",
   "texto": "Olá, {nome}! Sentimos muito que o produto do pedido {pedido} não atendeu o que você esperava. Pode nos contar o que aconteceu? Por exemplo: vazou, chegou com o lacre aberto, a cor ou o cheiro estão diferentes, ou você não percebeu resultado depois do uso."
  },
  "orientar_uso": {
   "titulo": "Como usar o produto",
   "texto": "Olá, {nome}! Para ter o melhor resultado: [dosagem por litro de combustível], aplicado no momento do abastecimento, e o efeito aparece depois de [tempo de uso]. Se depois disso continuar sem resultado, nos avise que analisamos com você."
  },
  "itens_do_pedido": {
   "titulo": "O que vem no pedido",
   "texto": "Olá, {nome}! Conferimos o pedido {pedido}: ele é composto por [itens e quantidades]. Pode conferir com o que chegou? Se ainda faltar algo, nos avise que resolvemos."
  },
  "previsao_entrega": {
   "titulo": "Previsão de entrega",
   "texto": "Olá, {nome}! Conferimos o pedido {pedido}: ele está a caminho, com previsão de entrega em {previsao}. Seguimos acompanhando e te avisamos se algo mudar."
  },
  "procurar_vizinhos": {
   "titulo": "Procurar com portaria e vizinhos",
   "texto": "Olá, {nome}! O rastreio do pedido {pedido} aparece como entregue em {entregue}. Pode verificar, por favor, com a portaria, vizinhos ou alguém da casa? Se não aparecer até amanhã, abrimos a reclamação com a transportadora e resolvemos para você."
  },
  "comprovante_entrega": {
   "titulo": "Comprovante de entrega",
   "texto": "Olá, {nome}! A transportadora nos enviou o comprovante de entrega do pedido {pedido} (segue em anexo), com data, hora e quem recebeu. Pode conferir se reconhece? Se não reconhecer, nos avise que seguimos com você."
  },
  "reclamacao_aberta": {
   "titulo": "Reclamação aberta na transportadora",
   "texto": "Olá, {nome}! Abrimos uma reclamação com a transportadora sobre o pedido {pedido} (protocolo [protocolo]). O prazo de resposta é de até [prazo] dias úteis, e te avisamos assim que tivermos retorno."
  },
  "confirmar_endereco": {
   "titulo": "Confirmar o endereço",
   "texto": "Olá, {nome}! O pedido {pedido} voltou para nós porque a entrega não foi concluída. Pode confirmar o endereço completo (rua, número, complemento, bairro, cidade e CEP) e o melhor horário para receber?"
  },
  "opcoes_faltante": {
   "titulo": "Opções: item faltando",
   "texto": "Olá, {nome}! Confirmamos que faltou [item] no pedido {pedido}. Você prefere:\n1) que a gente envie o que faltou, sem custo;\n2) receber de volta o valor do que faltou; ou\n3) desfazer a compra, com o valor total de volta?"
  },
  "opcoes_avaria": {
   "titulo": "Opções: produto com problema",
   "texto": "Olá, {nome}! Sentimos muito pelo problema com o pedido {pedido}. Você prefere:\n1) receber outro produto, sem custo;\n2) o valor total de volta; ou\n3) ficar com o produto e receber um abatimento no valor?"
  },
  "opcoes_errado": {
   "titulo": "Opções: produto errado",
   "texto": "Olá, {nome}! Confirmamos que o pedido {pedido} foi enviado com o produto errado, pedimos desculpas. Você prefere receber o produto certo ou o valor de volta? Nos dois casos, o frete de devolução do produto errado é por nossa conta."
  },
  "opcoes_entrega": {
   "titulo": "Opções: entrega não concluída",
   "texto": "Olá, {nome}! Sentimos muito pelo que aconteceu com a entrega do pedido {pedido}. Você prefere que a gente envie o pedido de novo, sem custo, ou receber o valor total de volta?"
  },
  "opcoes_arrependimento": {
   "titulo": "Opções: devolução",
   "texto": "Olá, {nome}! O produto do pedido {pedido} chegou aqui e está tudo certo. Você prefere receber o valor de volta ou trocar por outro produto?"
  },
  "reenvio_feito": {
   "titulo": "Pedido reenviado",
   "texto": "Olá, {nome}! Enviamos de novo o pedido {pedido}, sem custo para você. O código de rastreio é {rastreio}. Qualquer novidade, estamos por aqui."
  },
  "troca_enviada": {
   "titulo": "Troca enviada",
   "texto": "Olá, {nome}! O produto novo do pedido {pedido} já foi enviado, sem custo para você. O código de rastreio é {rastreio}."
  },
  "troca_produto_certo": {
   "titulo": "Produto certo a caminho",
   "texto": "Olá, {nome}! O produto certo do pedido {pedido} já foi enviado (rastreio {rastreio}). Também te enviamos a etiqueta para devolver o produto errado: é só embalar e levar a uma agência ou ponto de coleta, o frete é por nossa conta."
  },
  "etiqueta_reversa": {
   "titulo": "Etiqueta de devolução",
   "texto": "Olá, {nome}! Autorizamos a devolução do pedido {pedido}. Segue a etiqueta de postagem, e o frete é por nossa conta. É só embalar o produto e levar a uma agência ou ponto de coleta. Assim que ele chegar aqui, damos sequência."
  },
  "recusar_na_entrega": {
   "titulo": "Recusar na entrega",
   "texto": "Olá, {nome}! Como o pedido {pedido} já está a caminho, quando o entregador chegar é só recusar o recebimento. A encomenda volta para nós e, assim que ela chegar, devolvemos o valor."
  },
  "pedido_cancelado": {
   "titulo": "Pedido cancelado",
   "texto": "Olá, {nome}! Cancelamos o pedido {pedido} como você pediu. O valor será devolvido em até [prazo], pela mesma forma de pagamento."
  },
  "reembolso_dados": {
   "titulo": "Pedir os dados do reembolso",
   "texto": "Olá, {nome}! Para fazermos o reembolso do pedido {pedido}, pode nos informar a chave Pix (ou banco, agência e conta) e o nome do titular?"
  },
  "reembolso_pago": {
   "titulo": "Reembolso feito",
   "texto": "Olá, {nome}! O reembolso de {valor} referente ao pedido {pedido} foi feito. Segue o comprovante. Qualquer dúvida, estamos à disposição."
  },
  "recusa_sem_defeito": {
   "titulo": "Sem defeito encontrado",
   "texto": "Olá, {nome}. Analisamos o que você nos enviou sobre o pedido {pedido} e não identificamos defeito no produto, porque [motivo]. Se quiser, podemos te orientar no uso para ter o melhor resultado."
  },
  "recusa_produto_certo": {
   "titulo": "O produto é o do pedido",
   "texto": "Olá, {nome}. Conferimos as fotos e o produto que chegou é o mesmo do pedido {pedido}: [produto do pedido]. Se notar qualquer outro problema, nos avise que analisamos."
  },
  "recusa_fora_prazo": {
   "titulo": "Fora do prazo de 7 dias",
   "texto": "Olá, {nome}. O direito de arrependimento (art. 49 do Código de Defesa do Consumidor) vale por 7 dias a partir do recebimento, e o pedido {pedido} foi entregue em {entregue}. Por isso não conseguimos aceitar a devolução por desistência. Se houver qualquer problema com o produto, nos conte que analisamos."
  },
  "recusa_produto_aberto": {
   "titulo": "Produto aberto",
   "texto": "Olá, {nome}. Como o produto do pedido {pedido} foi aberto e não apresenta defeito, não conseguimos aceitar a devolução por desistência: por ser consumível, depois de aberto ele não pode voltar à venda. Se notar qualquer problema no produto, nos avise que analisamos."
  },
  "recusa_conferencia": {
   "titulo": "Chegou diferente do informado",
   "texto": "Olá, {nome}. O produto do pedido {pedido} chegou aqui [o que chegou diferente], diferente do que foi informado nas fotos. Por isso não conseguimos seguir com a devolução. Se quiser conversar sobre isso, estamos à disposição."
  }
 },
 "tipos": {
  "faltante": 3,
  "avaria": 4,
  "defeito": 5,
  "errado": 7,
  "arrependimento": 8,
  "nao_recebido": 11,
  "atraso": 12,
  "devolvido": 13
 },
 "passos": {
  "faltante": {
   "fotos": 3,
   "lacre": 3,
   "transportadora": 3,
   "conferir": 3,
   "explicar": 3,
   "escolha": 3,
   "reenvio": 3,
   "reembolso_parcial": 14,
   "reembolso_parcial_financeiro": 14,
   "reembolso_parcial_comprovante": 14,
   "reembolso_integral": 14,
   "reembolso_integral_financeiro": 14,
   "reembolso_integral_comprovante": 14
  },
  "avaria": {
   "fotos": 4,
   "origem": 4,
   "transportadora": 4,
   "escolha": 4,
   "troca": 4,
   "reembolso_parcial": 14,
   "reembolso_parcial_financeiro": 14,
   "reembolso_parcial_comprovante": 14,
   "reembolso_integral": 14,
   "reembolso_integral_financeiro": 14,
   "reembolso_integral_comprovante": 14
  },
  "defeito": {
   "relato": 5,
   "orientar": 5,
   "fotos": 5,
   "analise": 5,
   "recolher": 6,
   "chegou": 6,
   "conferir": 6,
   "escolha": 5,
   "troca": 5,
   "reembolso_parcial": 14,
   "reembolso_parcial_financeiro": 14,
   "reembolso_parcial_comprovante": 14,
   "reembolso_integral": 14,
   "reembolso_integral_financeiro": 14,
   "reembolso_integral_comprovante": 14,
   "recusa": 5
  },
  "errado": {
   "fotos": 7,
   "confere": 7,
   "escolha": 7,
   "troca": 7,
   "recolher": 7,
   "reembolso_integral": 14,
   "reembolso_integral_financeiro": 14,
   "reembolso_integral_comprovante": 14,
   "recusa": 7
  },
  "arrependimento": {
   "entregue": 8,
   "cancelar": 8,
   "recusar_entrega": 8,
   "prazo": 8,
   "fora_prazo": 8,
   "recusa_prazo": 8,
   "fotos": 9,
   "estado": 9,
   "aberto": 9,
   "recusa_aberto": 9,
   "reversa": 9,
   "chegou": 10,
   "conferir": 10,
   "reavaliar": 10,
   "escolha": 10,
   "troca": 10,
   "recusa_conferencia": 10,
   "reembolso_parcial": 14,
   "reembolso_parcial_financeiro": 14,
   "reembolso_parcial_comprovante": 14,
   "reembolso_integral": 14,
   "reembolso_integral_financeiro": 14,
   "reembolso_integral_comprovante": 14
  },
  "nao_recebido": {
   "comprovante": 11,
   "vizinhos": 11,
   "achou": 11,
   "chamado": 11,
   "resultado": 11,
   "comprovada": 11,
   "escolha": 11,
   "reenvio": 11,
   "reembolso_integral": 14,
   "reembolso_integral_financeiro": 14,
   "reembolso_integral_comprovante": 14
  },
  "atraso": {
   "rastreio": 12,
   "informar": 12,
   "acompanhar": 12,
   "chamado": 12,
   "resultado": 12,
   "escolha": 12,
   "reenvio": 12,
   "reembolso_integral": 14,
   "reembolso_integral_financeiro": 14,
   "reembolso_integral_comprovante": 14
  },
  "devolvido": {
   "motivo": 13,
   "endereco": 13,
   "quer": 13,
   "reenvio": 13,
   "reembolso_integral": 14,
   "reembolso_integral_financeiro": 14,
   "reembolso_integral_comprovante": 14
  },
  "outro": {
   "registro": 2
  }
 },
 "slides": [
  {
   "n": 1,
   "titulo": "Pós-venda · fluxos de atendimento",
   "links": [
    {
     "x": 0.45,
     "y": 1.45,
     "w": 4.05,
     "h": 0.64,
     "slide": 2
    },
    {
     "x": 0.45,
     "y": 2.21,
     "w": 4.05,
     "h": 0.64,
     "slide": 3
    },
    {
     "x": 0.45,
     "y": 2.97,
     "w": 4.05,
     "h": 0.64,
     "slide": 4
    },
    {
     "x": 0.45,
     "y": 3.73,
     "w": 4.05,
     "h": 0.64,
     "slide": 5
    },
    {
     "x": 0.45,
     "y": 4.49,
     "w": 4.05,
     "h": 0.64,
     "slide": 6
    },
    {
     "x": 0.45,
     "y": 5.25,
     "w": 4.05,
     "h": 0.64,
     "slide": 7
    },
    {
     "x": 0.45,
     "y": 6.01,
     "w": 4.05,
     "h": 0.64,
     "slide": 8
    },
    {
     "x": 4.8,
     "y": 1.45,
     "w": 4.05,
     "h": 0.64,
     "slide": 9
    },
    {
     "x": 4.8,
     "y": 2.21,
     "w": 4.05,
     "h": 0.64,
     "slide": 10
    },
    {
     "x": 4.8,
     "y": 2.97,
     "w": 4.05,
     "h": 0.64,
     "slide": 11
    },
    {
     "x": 4.8,
     "y": 3.73,
     "w": 4.05,
     "h": 0.64,
     "slide": 12
    },
    {
     "x": 4.8,
     "y": 4.49,
     "w": 4.05,
     "h": 0.64,
     "slide": 13
    },
    {
     "x": 4.8,
     "y": 5.25,
     "w": 4.05,
     "h": 0.64,
     "slide": 14
    }
   ],
   "sub": "Um slide por tipo de caso. Clique no nome para ir à página; nos fluxos, o conector “→ pág. N” leva ao trecho seguinte."
  },
  {
   "n": 2,
   "titulo": "Qual fluxo seguir",
   "links": [
    {
     "x": 0.512,
     "y": 4.639,
     "w": 1.266,
     "h": 0.352,
     "slide": 3
    },
    {
     "x": 1.928,
     "y": 4.639,
     "w": 1.266,
     "h": 0.352,
     "slide": 4
    },
    {
     "x": 3.343,
     "y": 4.639,
     "w": 1.266,
     "h": 0.352,
     "slide": 5
    },
    {
     "x": 4.759,
     "y": 4.639,
     "w": 1.266,
     "h": 0.352,
     "slide": 7
    },
    {
     "x": 6.174,
     "y": 4.639,
     "w": 1.266,
     "h": 0.352,
     "slide": 8
    },
    {
     "x": 7.59,
     "y": 4.639,
     "w": 1.266,
     "h": 0.352,
     "slide": 11
    },
    {
     "x": 9.005,
     "y": 4.639,
     "w": 1.266,
     "h": 0.352,
     "slide": 12
    },
    {
     "x": 10.421,
     "y": 4.639,
     "w": 1.266,
     "h": 0.352,
     "slide": 13
    }
   ],
   "sub": "O sistema lê a reclamação no WhatsApp e sugere o tipo; quem atende confirma ao abrir o caso.",
   "caixas": {
    "1": {
     "x": 6.138,
     "y": 3.65,
     "w": 1.343,
     "h": 0.276
    },
    "2": {
     "x": 6.174,
     "y": 4.081,
     "w": 1.266,
     "h": 0.258
    }
   },
   "passos": {
    "abrir": {
     "x": 6.138,
     "y": 3.65,
     "w": 1.343,
     "h": 0.276
    },
    "qual": {
     "x": 6.174,
     "y": 4.081,
     "w": 1.266,
     "h": 0.258
    }
   }
  },
  {
   "n": 3,
   "titulo": "1. Produto faltante",
   "links": [
    {
     "x": 8.462,
     "y": 4.529,
     "w": 2.004,
     "h": 0.589,
     "slide": 14
    },
    {
     "x": 10.703,
     "y": 4.529,
     "w": 2.004,
     "h": 0.589,
     "slide": 14
    }
   ],
   "sub": "Chegou incompleto · CDC Art. 19 · resolver em até 30 dias (Art. 18, § 1º)",
   "atalhos": [
    {
     "x": 1.788,
     "y": 2.329,
     "w": 1.073,
     "h": 0.188,
     "barra": "fotos_embalagem"
    },
    {
     "x": 1.847,
     "y": 2.566,
     "w": 0.955,
     "h": 0.188,
     "barra": "fotos_produto"
    },
    {
     "x": 2.056,
     "y": 4.991,
     "w": 1.191,
     "h": 0.188,
     "barra": "reclamacao_aberta"
    },
    {
     "x": 5.46,
     "y": 1.821,
     "w": 1.073,
     "h": 0.188,
     "barra": "itens_do_pedido"
    },
    {
     "x": 7.137,
     "y": 3.394,
     "w": 1.073,
     "h": 0.188,
     "barra": "opcoes_faltante"
    },
    {
     "x": 6.693,
     "y": 5.151,
     "w": 0.955,
     "h": 0.188,
     "barra": "reenvio_feito"
    }
   ],
   "caixas": {
    "1": {
     "x": 1.261,
     "y": 1.98,
     "w": 2.126,
     "h": 0.856
    },
    "2": {
     "x": 1.318,
     "y": 3.081,
     "w": 2.004,
     "h": 0.49
    },
    "3": {
     "x": 1.588,
     "y": 4.249,
     "w": 2.126,
     "h": 1.012
    },
    "4": {
     "x": 1.318,
     "y": 5.506,
     "w": 2.004,
     "h": 0.49
    },
    "5": {
     "x": 4.995,
     "y": 1.298,
     "w": 2.004,
     "h": 0.792
    },
    "6": {
     "x": 6.672,
     "y": 2.89,
     "w": 2.004,
     "h": 0.774
    },
    "7": {
     "x": 6.107,
     "y": 4.529,
     "w": 2.126,
     "h": 0.892
    }
   },
   "passos": {
    "fotos": {
     "x": 1.261,
     "y": 1.98,
     "w": 2.126,
     "h": 0.856
    },
    "lacre": {
     "x": 1.318,
     "y": 3.081,
     "w": 2.004,
     "h": 0.49
    },
    "transportadora": {
     "x": 1.588,
     "y": 4.249,
     "w": 2.126,
     "h": 1.012
    },
    "conferir": {
     "x": 1.318,
     "y": 5.506,
     "w": 2.004,
     "h": 0.49
    },
    "explicar": {
     "x": 4.995,
     "y": 1.298,
     "w": 2.004,
     "h": 0.792
    },
    "escolha": {
     "x": 6.672,
     "y": 2.89,
     "w": 2.004,
     "h": 0.774
    },
    "reenvio": {
     "x": 6.107,
     "y": 4.529,
     "w": 2.126,
     "h": 0.892
    }
   },
   "vai": [
    {
     "x": 1.392,
     "y": 6.674,
     "w": 1.186,
     "h": 0.278,
     "passo": 6
    },
    {
     "x": 2.807,
     "y": 6.674,
     "w": 1.186,
     "h": 0.278,
     "passo": 5
    }
   ]
  },
  {
   "n": 4,
   "titulo": "2. Avaria / vazamento",
   "links": [
    {
     "x": 2.726,
     "y": 5.068,
     "w": 2.196,
     "h": 0.646,
     "slide": 5
    },
    {
     "x": 8.121,
     "y": 4.664,
     "w": 2.196,
     "h": 0.646,
     "slide": 14
    },
    {
     "x": 10.577,
     "y": 4.664,
     "w": 2.196,
     "h": 0.646,
     "slide": 14
    }
   ],
   "sub": "Chegou danificado · CDC Art. 18 · resolver em até 30 dias (Art. 18, § 1º)",
   "atalhos": [
    {
     "x": 1.61,
     "y": 2.786,
     "w": 1.176,
     "h": 0.206,
     "barra": "fotos_embalagem"
    },
    {
     "x": 1.124,
     "y": 3.046,
     "w": 1.047,
     "h": 0.206,
     "barra": "fotos_produto"
    },
    {
     "x": 2.224,
     "y": 3.046,
     "w": 1.047,
     "h": 0.206,
     "barra": "video_produto"
    },
    {
     "x": 6.609,
     "y": 2.303,
     "w": 1.305,
     "h": 0.206,
     "barra": "reclamacao_aberta"
    },
    {
     "x": 6.733,
     "y": 3.421,
     "w": 1.047,
     "h": 0.206,
     "barra": "opcoes_avaria"
    },
    {
     "x": 6.182,
     "y": 5.346,
     "w": 1.047,
     "h": 0.206,
     "barra": "troca_enviada"
    }
   ],
   "caixas": {
    "1": {
     "x": 1.033,
     "y": 2.404,
     "w": 2.33,
     "h": 0.938
    },
    "2": {
     "x": 1.095,
     "y": 3.611,
     "w": 2.196,
     "h": 0.448
    },
    "3": {
     "x": 6.096,
     "y": 1.49,
     "w": 2.33,
     "h": 1.109
    },
    "4": {
     "x": 6.159,
     "y": 2.868,
     "w": 2.196,
     "h": 0.849
    },
    "5": {
     "x": 5.54,
     "y": 4.664,
     "w": 2.33,
     "h": 0.977
    }
   },
   "passos": {
    "fotos": {
     "x": 1.033,
     "y": 2.404,
     "w": 2.33,
     "h": 0.938
    },
    "origem": {
     "x": 1.095,
     "y": 3.611,
     "w": 2.196,
     "h": 0.448
    },
    "transportadora": {
     "x": 6.096,
     "y": 1.49,
     "w": 2.33,
     "h": 1.109
    },
    "escolha": {
     "x": 6.159,
     "y": 2.868,
     "w": 2.196,
     "h": 0.849
    },
    "troca": {
     "x": 5.54,
     "y": 4.664,
     "w": 2.33,
     "h": 0.977
    }
   },
   "vai": [
    {
     "x": 1.176,
     "y": 5.068,
     "w": 1.299,
     "h": 0.305,
     "passo": 3
    }
   ]
  },
  {
   "n": 5,
   "titulo": "3. Defeito / não funcionou (1/2)",
   "links": [
    {
     "x": 2.772,
     "y": 4.968,
     "w": 1.486,
     "h": 0.324,
     "slide": 8
    },
    {
     "x": 6.247,
     "y": 3.184,
     "w": 1.486,
     "h": 0.55,
     "slide": 6
    },
    {
     "x": 7.908,
     "y": 4.347,
     "w": 1.486,
     "h": 0.437,
     "slide": 14
    },
    {
     "x": 9.569,
     "y": 4.347,
     "w": 1.486,
     "h": 0.437,
     "slide": 14
    },
    {
     "x": 8.781,
     "y": 2.678,
     "w": 1.486,
     "h": 0.324,
     "slide": 6
    },
    {
     "x": 11.322,
     "y": 2.678,
     "w": 1.486,
     "h": 0.324,
     "slide": 6
    }
   ],
   "sub": "Relato, fotos e decisão · Problema no produto · CDC Art. 18 · resolver em até 30 dias (Art. 18, § 1º)",
   "atalhos": [
    {
     "x": 1.358,
     "y": 3.05,
     "w": 0.883,
     "h": 0.139,
     "barra": "entender_problema"
    },
    {
     "x": 2.637,
     "y": 4.127,
     "w": 0.665,
     "h": 0.139,
     "barra": "orientar_uso"
    },
    {
     "x": 1.088,
     "y": 5.34,
     "w": 0.708,
     "h": 0.139,
     "barra": "fotos_produto"
    },
    {
     "x": 1.832,
     "y": 5.34,
     "w": 0.708,
     "h": 0.139,
     "barra": "video_produto"
    },
    {
     "x": 1.526,
     "y": 5.516,
     "w": 0.577,
     "h": 0.139,
     "barra": "fotos_lote"
    },
    {
     "x": 8.297,
     "y": 3.61,
     "w": 0.708,
     "h": 0.139,
     "barra": "opcoes_avaria"
    },
    {
     "x": 6.596,
     "y": 4.808,
     "w": 0.708,
     "h": 0.139,
     "barra": "troca_enviada"
    },
    {
     "x": 11.344,
     "y": 3.645,
     "w": 0.926,
     "h": 0.139,
     "barra": "recusa_sem_defeito"
    }
   ],
   "caixas": {
    "1": {
     "x": 1.056,
     "y": 2.765,
     "w": 1.486,
     "h": 0.485
    },
    "2": {
     "x": 2.227,
     "y": 3.842,
     "w": 1.486,
     "h": 0.485
    },
    "3": {
     "x": 1.026,
     "y": 4.968,
     "w": 1.576,
     "h": 0.747
    },
    "4": {
     "x": 7.241,
     "y": 2.146,
     "w": 1.486,
     "h": 0.35
    },
    "5": {
     "x": 11.019,
     "y": 3.184,
     "w": 1.576,
     "h": 0.661
    },
    "6": {
     "x": 7.908,
     "y": 3.236,
     "w": 1.486,
     "h": 0.574
    },
    "7": {
     "x": 6.162,
     "y": 4.347,
     "w": 1.576,
     "h": 0.661
    }
   },
   "passos": {
    "relato": {
     "x": 1.056,
     "y": 2.765,
     "w": 1.486,
     "h": 0.485
    },
    "orientar": {
     "x": 2.227,
     "y": 3.842,
     "w": 1.486,
     "h": 0.485
    },
    "fotos": {
     "x": 1.026,
     "y": 4.968,
     "w": 1.576,
     "h": 0.747
    },
    "analise": {
     "x": 7.241,
     "y": 2.146,
     "w": 1.486,
     "h": 0.35
    },
    "escolha": {
     "x": 7.908,
     "y": 3.236,
     "w": 1.486,
     "h": 0.574
    },
    "troca": {
     "x": 6.162,
     "y": 4.347,
     "w": 1.576,
     "h": 0.661
    },
    "recusa": {
     "x": 11.019,
     "y": 3.184,
     "w": 1.576,
     "h": 0.661
    }
   },
   "vai": [
    {
     "x": 1.372,
     "y": 5.898,
     "w": 0.879,
     "h": 0.206,
     "passo": 4
    }
   ]
  },
  {
   "n": 6,
   "titulo": "3. Defeito / não funcionou (2/2)",
   "links": [
    {
     "x": 3.954,
     "y": 5.977,
     "w": 2.56,
     "h": 0.753,
     "slide": 5
    },
    {
     "x": 6.817,
     "y": 5.977,
     "w": 2.56,
     "h": 0.947,
     "slide": 5
    },
    {
     "x": 4.382,
     "y": 1.325,
     "w": 2.56,
     "h": 0.558,
     "slide": 5
    }
   ],
   "sub": "O produto volta para análise · Problema no produto · CDC Art. 18 · resolver em até 30 dias (Art. 18, § 1º)",
   "atalhos": [
    {
     "x": 4.944,
     "y": 2.991,
     "w": 1.446,
     "h": 0.24,
     "barra": "etiqueta_reversa"
    }
   ],
   "caixas": {
    "1": {
     "x": 4.309,
     "y": 2.197,
     "w": 2.717,
     "h": 1.139
    },
    "2": {
     "x": 4.309,
     "y": 3.65,
     "w": 2.717,
     "h": 0.522
    },
    "3": {
     "x": 4.382,
     "y": 4.485,
     "w": 2.56,
     "h": 0.626
    }
   },
   "passos": {
    "recolher": {
     "x": 4.309,
     "y": 2.197,
     "w": 2.717,
     "h": 1.139
    },
    "chegou": {
     "x": 4.309,
     "y": 3.65,
     "w": 2.717,
     "h": 0.522
    },
    "conferir": {
     "x": 4.382,
     "y": 4.485,
     "w": 2.56,
     "h": 0.626
    }
   }
  },
  {
   "n": 7,
   "titulo": "4. Produto errado",
   "links": [
    {
     "x": 9.216,
     "y": 4.212,
     "w": 2.245,
     "h": 0.66,
     "slide": 14
    }
   ],
   "sub": "Veio outro produto · CDC Art. 18 · resolver em até 30 dias (Art. 18, § 1º)",
   "atalhos": [
    {
     "x": 3.317,
     "y": 2.635,
     "w": 1.532,
     "h": 0.211,
     "barra": "fotos_produto_errado"
    },
    {
     "x": 9.437,
     "y": 1.74,
     "w": 1.07,
     "h": 0.211,
     "barra": "opcoes_errado"
    },
    {
     "x": 6.971,
     "y": 3.635,
     "w": 1.466,
     "h": 0.211,
     "barra": "troca_produto_certo"
    },
    {
     "x": 9.709,
     "y": 3.567,
     "w": 1.268,
     "h": 0.211,
     "barra": "etiqueta_reversa"
    },
    {
     "x": 3.684,
     "y": 5.354,
     "w": 1.532,
     "h": 0.211,
     "barra": "recusa_produto_certo"
    }
   ],
   "caixas": {
    "1": {
     "x": 2.892,
     "y": 2.074,
     "w": 2.382,
     "h": 0.864
    },
    "2": {
     "x": 2.956,
     "y": 3.213,
     "w": 2.245,
     "h": 0.549
    },
    "3": {
     "x": 3.259,
     "y": 4.657,
     "w": 2.382,
     "h": 0.999
    },
    "4": {
     "x": 8.849,
     "y": 1.31,
     "w": 2.245,
     "h": 0.732
    },
    "5": {
     "x": 6.513,
     "y": 2.938,
     "w": 2.382,
     "h": 0.999
    },
    "6": {
     "x": 9.152,
     "y": 3.006,
     "w": 2.382,
     "h": 0.864
    }
   },
   "passos": {
    "fotos": {
     "x": 2.892,
     "y": 2.074,
     "w": 2.382,
     "h": 0.864
    },
    "confere": {
     "x": 2.956,
     "y": 3.213,
     "w": 2.245,
     "h": 0.549
    },
    "escolha": {
     "x": 8.849,
     "y": 1.31,
     "w": 2.245,
     "h": 0.732
    },
    "troca": {
     "x": 6.513,
     "y": 2.938,
     "w": 2.382,
     "h": 0.999
    },
    "recolher": {
     "x": 9.152,
     "y": 3.006,
     "w": 2.382,
     "h": 0.864
    },
    "recusa": {
     "x": 3.259,
     "y": 4.657,
     "w": 2.382,
     "h": 0.999
    }
   },
   "vai": [
    {
     "x": 1.673,
     "y": 4.657,
     "w": 1.329,
     "h": 0.312,
     "passo": 4
    }
   ]
  },
  {
   "n": 8,
   "titulo": "5. Arrependimento (1/3)",
   "links": [
    {
     "x": 4.945,
     "y": 4.747,
     "w": 2.082,
     "h": 0.612,
     "slide": 14
    },
    {
     "x": 2.498,
     "y": 4.747,
     "w": 2.082,
     "h": 0.612,
     "slide": 10
    },
    {
     "x": 7.961,
     "y": 3.066,
     "w": 2.082,
     "h": 0.612,
     "slide": 9
    },
    {
     "x": 8.241,
     "y": 4.405,
     "w": 2.082,
     "h": 0.612,
     "slide": 5
    }
   ],
   "sub": "Entrega e prazo de 7 dias · Desistiu da compra · CDC Art. 49",
   "caixas": {
    "1": {
     "x": 2.498,
     "y": 2.562,
     "w": 2.082,
     "h": 0.425
    },
    "2": {
     "x": 2.438,
     "y": 3.691,
     "w": 2.209,
     "h": 0.801
    },
    "3": {
     "x": 4.885,
     "y": 3.691,
     "w": 2.209,
     "h": 0.801
    },
    "4": {
     "x": 8.309,
     "y": 1.728,
     "w": 2.082,
     "h": 0.634
    },
    "5": {
     "x": 10.289,
     "y": 3.066,
     "w": 2.082,
     "h": 0.634
    },
    "6": {
     "x": 10.569,
     "y": 4.405,
     "w": 2.209,
     "h": 0.926
    }
   },
   "passos": {
    "entregue": {
     "x": 2.498,
     "y": 2.562,
     "w": 2.082,
     "h": 0.425
    },
    "cancelar": {
     "x": 4.885,
     "y": 3.691,
     "w": 2.209,
     "h": 0.801
    },
    "recusar_entrega": {
     "x": 2.438,
     "y": 3.691,
     "w": 2.209,
     "h": 0.801
    },
    "prazo": {
     "x": 8.309,
     "y": 1.728,
     "w": 2.082,
     "h": 0.634
    },
    "fora_prazo": {
     "x": 10.289,
     "y": 3.066,
     "w": 2.082,
     "h": 0.634
    },
    "recusa_prazo": {
     "x": 10.569,
     "y": 4.405,
     "w": 2.209,
     "h": 0.926
    }
   },
   "atalhos": [
    {
     "x": 5.402,
     "y": 4.212,
     "w": 1.176,
     "h": 0.195,
     "barra": "pedido_cancelado"
    },
    {
     "x": 2.894,
     "y": 4.212,
     "w": 1.298,
     "h": 0.195,
     "barra": "recusar_na_entrega"
    },
    {
     "x": 11.055,
     "y": 5.051,
     "w": 1.237,
     "h": 0.195,
     "barra": "recusa_fora_prazo"
    }
   ],
   "vai": [
    {
     "x": 0.968,
     "y": 3.691,
     "w": 1.232,
     "h": 0.289,
     "passo": 4
    }
   ]
  },
  {
   "n": 9,
   "titulo": "5. Arrependimento (2/3)",
   "links": [
    {
     "x": 6.505,
     "y": 2.724,
     "w": 2.448,
     "h": 0.72,
     "slide": 5
    },
    {
     "x": 1.559,
     "y": 6.21,
     "w": 2.448,
     "h": 0.72,
     "slide": 10
    },
    {
     "x": 1.969,
     "y": 1.32,
     "w": 2.448,
     "h": 0.533,
     "slide": 8
    }
   ],
   "sub": "Fotos e etiqueta reversa · Desistiu da compra · CDC Art. 49",
   "atalhos": [
    {
     "x": 2.543,
     "y": 2.765,
     "w": 1.311,
     "h": 0.23,
     "barra": "fotos_devolucao"
    },
    {
     "x": 9.67,
     "y": 3.484,
     "w": 1.742,
     "h": 0.23,
     "barra": "recusa_produto_aberto"
    },
    {
     "x": 2.097,
     "y": 5.581,
     "w": 1.383,
     "h": 0.23,
     "barra": "etiqueta_reversa"
    }
   ],
   "caixas": {
    "1": {
     "x": 1.899,
     "y": 2.153,
     "w": 2.598,
     "h": 0.942
    },
    "2": {
     "x": 1.969,
     "y": 3.395,
     "w": 2.448,
     "h": 0.598
    },
    "3": {
     "x": 1.489,
     "y": 4.821,
     "w": 2.598,
     "h": 1.089
    },
    "4": {
     "x": 8.913,
     "y": 1.32,
     "w": 2.448,
     "h": 0.577
    },
    "5": {
     "x": 9.243,
     "y": 2.724,
     "w": 2.598,
     "h": 1.089
    }
   },
   "passos": {
    "fotos": {
     "x": 1.899,
     "y": 2.153,
     "w": 2.598,
     "h": 0.942
    },
    "estado": {
     "x": 1.969,
     "y": 3.395,
     "w": 2.448,
     "h": 0.598
    },
    "aberto": {
     "x": 8.913,
     "y": 1.32,
     "w": 2.448,
     "h": 0.577
    },
    "recusa_aberto": {
     "x": 9.243,
     "y": 2.724,
     "w": 2.598,
     "h": 1.089
    },
    "reversa": {
     "x": 1.489,
     "y": 4.821,
     "w": 2.598,
     "h": 1.089
    }
   },
   "vai": [
    {
     "x": 4.367,
     "y": 4.821,
     "w": 1.449,
     "h": 0.34,
     "passo": 4
    }
   ]
  },
  {
   "n": 10,
   "titulo": "5. Arrependimento (3/3)",
   "links": [
    {
     "x": 8.238,
     "y": 4.491,
     "w": 2.083,
     "h": 0.612,
     "slide": 14
    },
    {
     "x": 3.46,
     "y": 4.491,
     "w": 2.083,
     "h": 0.612,
     "slide": 14
    },
    {
     "x": 0.612,
     "y": 1.641,
     "w": 2.083,
     "h": 0.454,
     "slide": 8
    }
   ],
   "sub": "O produto volta à LogHouse · Desistiu da compra · CDC Art. 49",
   "caixas": {
    "1": {
     "x": 0.552,
     "y": 2.35,
     "w": 2.211,
     "h": 0.425
    },
    "2": {
     "x": 6.197,
     "y": 1.641,
     "w": 2.083,
     "h": 0.509
    },
    "3": {
     "x": 8.978,
     "y": 2.854,
     "w": 2.083,
     "h": 0.805
    },
    "4": {
     "x": 5.849,
     "y": 3.14,
     "w": 2.083,
     "h": 0.425
    },
    "5": {
     "x": 5.789,
     "y": 4.491,
     "w": 2.211,
     "h": 0.927
    },
    "6": {
     "x": 10.567,
     "y": 4.57,
     "w": 2.211,
     "h": 0.769
    }
   },
   "passos": {
    "chegou": {
     "x": 0.552,
     "y": 2.35,
     "w": 2.211,
     "h": 0.425
    },
    "conferir": {
     "x": 6.197,
     "y": 1.641,
     "w": 2.083,
     "h": 0.509
    },
    "reavaliar": {
     "x": 5.849,
     "y": 3.14,
     "w": 2.083,
     "h": 0.425
    },
    "escolha": {
     "x": 8.978,
     "y": 2.854,
     "w": 2.083,
     "h": 0.805
    },
    "troca": {
     "x": 10.567,
     "y": 4.57,
     "w": 2.211,
     "h": 0.769
    },
    "recusa_conferencia": {
     "x": 5.789,
     "y": 4.491,
     "w": 2.211,
     "h": 0.927
    }
   },
   "atalhos": [
    {
     "x": 9.278,
     "y": 3.379,
     "w": 1.483,
     "h": 0.196,
     "barra": "opcoes_arrependimento"
    },
    {
     "x": 11.176,
     "y": 5.058,
     "w": 0.993,
     "h": 0.196,
     "barra": "troca_enviada"
    },
    {
     "x": 6.245,
     "y": 5.137,
     "w": 1.299,
     "h": 0.196,
     "barra": "recusa_conferencia"
    }
   ],
   "vai": [
    {
     "x": 1.037,
     "y": 3.03,
     "w": 1.233,
     "h": 0.289,
     "passo": 2
    }
   ]
  },
  {
   "n": 11,
   "titulo": "6. Entregue e não recebido",
   "links": [
    {
     "x": 9.708,
     "y": 5.189,
     "w": 1.854,
     "h": 0.545,
     "slide": 14
    }
   ],
   "sub": "Rastreio diz entregue · CDC Art. 35",
   "caixas": {
    "1": {
     "x": 3.267,
     "y": 2.063,
     "w": 1.968,
     "h": 0.434
    },
    "2": {
     "x": 3.267,
     "y": 2.724,
     "w": 1.968,
     "h": 0.855
    },
    "3": {
     "x": 3.319,
     "y": 3.805,
     "w": 1.854,
     "h": 0.453
    },
    "4": {
     "x": 3.569,
     "y": 4.886,
     "w": 1.968,
     "h": 0.937
    },
    "5": {
     "x": 7.891,
     "y": 1.291,
     "w": 1.854,
     "h": 0.453
    },
    "6": {
     "x": 7.051,
     "y": 2.484,
     "w": 1.854,
     "h": 0.733
    },
    "7": {
     "x": 7.891,
     "y": 3.845,
     "w": 1.854,
     "h": 0.717
    },
    "8": {
     "x": 7.528,
     "y": 5.189,
     "w": 1.968,
     "h": 0.825
    }
   },
   "passos": {
    "comprovante": {
     "x": 3.267,
     "y": 2.063,
     "w": 1.968,
     "h": 0.434
    },
    "vizinhos": {
     "x": 3.267,
     "y": 2.724,
     "w": 1.968,
     "h": 0.855
    },
    "achou": {
     "x": 3.319,
     "y": 3.805,
     "w": 1.854,
     "h": 0.453
    },
    "chamado": {
     "x": 3.569,
     "y": 4.886,
     "w": 1.968,
     "h": 0.937
    },
    "resultado": {
     "x": 7.891,
     "y": 1.291,
     "w": 1.854,
     "h": 0.453
    },
    "comprovada": {
     "x": 7.051,
     "y": 2.484,
     "w": 1.854,
     "h": 0.733
    },
    "escolha": {
     "x": 7.891,
     "y": 3.845,
     "w": 1.854,
     "h": 0.717
    },
    "reenvio": {
     "x": 7.528,
     "y": 5.189,
     "w": 1.968,
     "h": 0.825
    }
   },
   "atalhos": [
    {
     "x": 3.699,
     "y": 3.329,
     "w": 1.102,
     "h": 0.174,
     "barra": "procurar_vizinhos"
    },
    {
     "x": 4.002,
     "y": 5.573,
     "w": 1.102,
     "h": 0.174,
     "barra": "reclamacao_aberta"
    },
    {
     "x": 7.373,
     "y": 2.968,
     "w": 1.211,
     "h": 0.174,
     "barra": "comprovante_entrega"
    },
    {
     "x": 8.349,
     "y": 4.312,
     "w": 0.939,
     "h": 0.174,
     "barra": "opcoes_entrega"
    },
    {
     "x": 8.07,
     "y": 5.764,
     "w": 0.884,
     "h": 0.174,
     "barra": "reenvio_feito"
    }
   ],
   "vai": [
    {
     "x": 4.001,
     "y": 6.05,
     "w": 1.098,
     "h": 0.257,
     "passo": 5
    }
   ]
  },
  {
   "n": 12,
   "titulo": "7. Atraso / extravio",
   "links": [
    {
     "x": 4.508,
     "y": 3.369,
     "w": 1.897,
     "h": 0.558,
     "slide": 13
    },
    {
     "x": 10.89,
     "y": 4.175,
     "w": 1.897,
     "h": 0.558,
     "slide": 14
    }
   ],
   "sub": "Ainda não chegou · CDC Art. 35",
   "caixas": {
    "1": {
     "x": 3.122,
     "y": 2.225,
     "w": 1.897,
     "h": 0.387
    },
    "2": {
     "x": 0.744,
     "y": 3.369,
     "w": 2.014,
     "h": 0.586
    },
    "3": {
     "x": 0.799,
     "y": 4.187,
     "w": 1.897,
     "h": 0.387
    },
    "4": {
     "x": 2.735,
     "y": 5.216,
     "w": 2.014,
     "h": 0.959
    },
    "5": {
     "x": 7.621,
     "y": 1.579,
     "w": 1.897,
     "h": 0.464
    },
    "6": {
     "x": 9.031,
     "y": 2.8,
     "w": 1.897,
     "h": 0.733
    },
    "7": {
     "x": 8.659,
     "y": 4.175,
     "w": 2.014,
     "h": 0.844
    }
   },
   "passos": {
    "rastreio": {
     "x": 3.122,
     "y": 2.225,
     "w": 1.897,
     "h": 0.387
    },
    "informar": {
     "x": 0.744,
     "y": 3.369,
     "w": 2.014,
     "h": 0.586
    },
    "acompanhar": {
     "x": 0.799,
     "y": 4.187,
     "w": 1.897,
     "h": 0.387
    },
    "chamado": {
     "x": 2.735,
     "y": 5.216,
     "w": 2.014,
     "h": 0.959
    },
    "resultado": {
     "x": 7.621,
     "y": 1.579,
     "w": 1.897,
     "h": 0.464
    },
    "escolha": {
     "x": 9.031,
     "y": 2.8,
     "w": 1.897,
     "h": 0.733
    },
    "reenvio": {
     "x": 8.659,
     "y": 4.175,
     "w": 2.014,
     "h": 0.844
    }
   },
   "atalhos": [
    {
     "x": 1.215,
     "y": 3.7,
     "w": 1.072,
     "h": 0.178,
     "barra": "previsao_entrega"
    },
    {
     "x": 3.178,
     "y": 5.92,
     "w": 1.128,
     "h": 0.178,
     "barra": "reclamacao_aberta"
    },
    {
     "x": 9.5,
     "y": 3.278,
     "w": 0.96,
     "h": 0.178,
     "barra": "opcoes_entrega"
    },
    {
     "x": 9.214,
     "y": 4.764,
     "w": 0.905,
     "h": 0.178,
     "barra": "reenvio_feito"
    }
   ],
   "vai": [
    {
     "x": 3.176,
     "y": 6.408,
     "w": 1.123,
     "h": 0.263,
     "passo": 5
    },
    {
     "x": 7.691,
     "y": 2.8,
     "w": 1.123,
     "h": 0.263,
     "passo": 3
    }
   ]
  },
  {
   "n": 13,
   "titulo": "8. Devolvido ao remetente",
   "links": [
    {
     "x": 4.512,
     "y": 4.499,
     "w": 2.387,
     "h": 0.52,
     "slide": 8
    },
    {
     "x": 10.376,
     "y": 3.456,
     "w": 2.387,
     "h": 0.702,
     "slide": 14
    }
   ],
   "sub": "Voltou para nós · CDC Art. 35",
   "caixas": {
    "1": {
     "x": 1.561,
     "y": 3.06,
     "w": 2.387,
     "h": 0.487
    },
    "2": {
     "x": 1.307,
     "y": 4.499,
     "w": 2.533,
     "h": 1.062
    },
    "3": {
     "x": 8.039,
     "y": 2.066,
     "w": 2.387,
     "h": 0.583
    },
    "4": {
     "x": 7.571,
     "y": 3.456,
     "w": 2.533,
     "h": 1.062
    }
   },
   "passos": {
    "motivo": {
     "x": 1.561,
     "y": 3.06,
     "w": 2.387,
     "h": 0.487
    },
    "endereco": {
     "x": 1.307,
     "y": 4.499,
     "w": 2.533,
     "h": 1.062
    },
    "quer": {
     "x": 8.039,
     "y": 2.066,
     "w": 2.387,
     "h": 0.583
    },
    "reenvio": {
     "x": 7.571,
     "y": 3.456,
     "w": 2.533,
     "h": 1.062
    }
   },
   "atalhos": [
    {
     "x": 1.829,
     "y": 5.24,
     "w": 1.488,
     "h": 0.224,
     "barra": "confirmar_endereco"
    },
    {
     "x": 8.268,
     "y": 4.197,
     "w": 1.138,
     "h": 0.224,
     "barra": "reenvio_feito"
    }
   ],
   "vai": [
    {
     "x": 1.862,
     "y": 5.853,
     "w": 1.412,
     "h": 0.331,
     "passo": 3
    }
   ]
  },
  {
   "n": 14,
   "titulo": "Reembolso pelo Financeiro",
   "links": [],
   "sub": "Quem atende não faz reembolso: pede ao Financeiro, que paga com comprovante; o caso volta para avisar o cliente.",
   "atalhos": [
    {
     "x": 3.297,
     "y": 3.432,
     "w": 1.418,
     "h": 0.249,
     "barra": "reembolso_dados"
    },
    {
     "x": 7.562,
     "y": 4.868,
     "w": 1.34,
     "h": 0.249,
     "barra": "reembolso_pago"
    }
   ],
   "caixas": {
    "1": {
     "x": 2.601,
     "y": 2.291,
     "w": 2.81,
     "h": 1.498
    },
    "2": {
     "x": 0.58,
     "y": 4.113,
     "w": 2.81,
     "h": 0.577
    },
    "3": {
     "x": 3.066,
     "y": 5.014,
     "w": 2.81,
     "h": 0.577
    },
    "4": {
     "x": 9.583,
     "y": 1.39,
     "w": 2.648,
     "h": 0.54
    },
    "5": {
     "x": 6.827,
     "y": 2.826,
     "w": 2.81,
     "h": 0.737
    },
    "6": {
     "x": 9.94,
     "y": 2.906,
     "w": 2.81,
     "h": 0.577
    },
    "7": {
     "x": 6.827,
     "y": 3.887,
     "w": 2.81,
     "h": 1.338
    },
    "8": {
     "x": 9.94,
     "y": 4.267,
     "w": 2.81,
     "h": 0.577
    }
   },
   "passos": {
    "pedir": {
     "x": 2.601,
     "y": 2.291,
     "w": 2.81,
     "h": 1.498
    },
    "aviso": {
     "x": 0.58,
     "y": 4.113,
     "w": 2.81,
     "h": 0.577
    },
    "ok": {
     "x": 9.583,
     "y": 1.39,
     "w": 2.648,
     "h": 0.54
    },
    "pagar": {
     "x": 6.827,
     "y": 2.826,
     "w": 2.81,
     "h": 0.737
    },
    "devolver": {
     "x": 9.94,
     "y": 2.906,
     "w": 2.81,
     "h": 0.577
    },
    "corrigir": {
     "x": 9.94,
     "y": 4.267,
     "w": 2.81,
     "h": 0.577
    },
    "comprovante": {
     "x": 6.827,
     "y": 3.887,
     "w": 2.81,
     "h": 1.338
    },
    "voltar": {
     "x": 3.066,
     "y": 5.014,
     "w": 2.81,
     "h": 0.577
    },
    "reembolso_parcial": {
     "x": 2.601,
     "y": 2.291,
     "w": 2.81,
     "h": 1.498
    },
    "reembolso_parcial_financeiro": {
     "x": 0.58,
     "y": 4.113,
     "w": 2.81,
     "h": 0.577
    },
    "reembolso_parcial_comprovante": {
     "x": 6.827,
     "y": 3.887,
     "w": 2.81,
     "h": 1.338
    },
    "reembolso_integral": {
     "x": 2.601,
     "y": 2.291,
     "w": 2.81,
     "h": 1.498
    },
    "reembolso_integral_financeiro": {
     "x": 0.58,
     "y": 4.113,
     "w": 2.81,
     "h": 0.577
    },
    "reembolso_integral_comprovante": {
     "x": 6.827,
     "y": 3.887,
     "w": 2.81,
     "h": 1.338
    }
   },
   "vai": [
    {
     "x": 1.196,
     "y": 5.014,
     "w": 1.567,
     "h": 0.367,
     "passo": 4
    },
    {
     "x": 10.556,
     "y": 5.549,
     "w": 1.567,
     "h": 0.367,
     "passo": 1
    }
   ]
  }
 ]
} as {
  largura: number; altura: number; reembolso: number;
  /** A mensagem padrão de cada atalho (`/fotos_produto` → título e texto). */
  mensagens: Record<string, MensagemPadrao>;
  tipos: Record<string, number>;
  /** tipo → passo → slide em que ele está desenhado. */
  passos: Record<string, Record<string, number>>;
  slides: SlideDoFluxo[];
};
