// ─────────────────────────────────────────────────────────────────────────────
// Pós-venda — os ROTEIROS de cada tipo de caso (17/11/2026).
//
// Pedido do dono do processo: todo problema de pós-venda tem um TIPO (faltante,
// avaria, defeito, arrependimento, não recebido…) e cada tipo segue um passo a
// passo, pelo Código de Defesa do Consumidor, até o desfecho (reenvio, troca,
// reembolso parcial ou integral, recusa justificada).
//
// Este arquivo é PURO (sem React, sem banco) e é testado em
// `src/test/posvenda/casos.test.ts`: todo `proximo` aponta um passo que existe,
// todo passo é alcançável e todo caminho termina num desfecho.
//
// O banco guarda o caso e o histórico (`carbo_posvenda_casos`, 20261173) e NÃO
// conhece a árvore: ele só registra o passo respondido, a opção, o próximo
// passo e o desfecho. Por isso:
//   ⚠️ NUNCA renomeie o `id` de um passo ou de um tipo que já foi usado — caso
//      aberto parado nele deixaria de achar o passo. Passo novo ganha id novo;
//      o antigo pode ficar sem ninguém apontando para ele (`legado`).
//   ⚠️ Desfecho novo precisa entrar no CHECK de `carbo_posvenda_casos.desfecho`
//      E no de-para da tratativa (`carbo_posvenda_caso_trato`), na mesma tarefa.
// ─────────────────────────────────────────────────────────────────────────────

export type TipoCaso =
  | "faltante" | "avaria" | "defeito" | "errado" | "arrependimento"
  | "nao_recebido" | "atraso" | "devolvido" | "outro";

export type Desfecho =
  | "troca" | "reenvio" | "reembolso_integral" | "reembolso_parcial"
  | "resolvido" | "recusado" | "sem_retorno" | "sem_solucao" | "cancelado";

export const DESFECHOS: Record<Desfecho, { rotulo: string; cor: string }> = {
  troca:              { rotulo: "Troca enviada",         cor: "#059669" },
  reenvio:            { rotulo: "Reenviado",             cor: "#059669" },
  reembolso_integral: { rotulo: "Reembolso integral",    cor: "#0d9488" },
  reembolso_parcial:  { rotulo: "Reembolso parcial",     cor: "#0d9488" },
  resolvido:          { rotulo: "Resolvido",             cor: "#059669" },
  recusado:           { rotulo: "Recusado com justificativa", cor: "#b45309" },
  sem_retorno:        { rotulo: "Cliente não respondeu", cor: "#64748b" },
  sem_solucao:        { rotulo: "Sem solução",           cor: "#64748b" },
  cancelado:          { rotulo: "Aberto por engano",     cor: "#94a3b8" },
};

export interface Campo {
  id: string;
  rotulo: string;
  tipo: "texto" | "longo" | "valor";
  obrigatorio?: boolean;
}

export interface Opcao {
  id: string;
  rotulo: string;
  /** Vai para este passo do MESMO roteiro. */
  proximo?: string;
  /** Encerra o caso. */
  desfecho?: Desfecho;
  /** Troca o tipo do caso e começa o outro roteiro (ex.: arrependimento → defeito). */
  mudaPara?: TipoCaso;
  /** Só a cor do botão. */
  tom?: "sim" | "nao";
}

export interface Passo {
  id: string;
  titulo: string;
  texto?: string;
  cdc?: string;
  /** Mensagem pronta para o cliente: {nome} {pedido} {entregue} {previsao} {rastreio}. */
  mensagem?: string;
  campos?: Campo[];
  opcoes: Opcao[];
}

export interface Fluxo {
  tipo: TipoCaso;
  rotulo: string;
  resumo: string;
  cdc: string;
  cor: string;
  /** Prazo para resolver, contado da abertura do caso. */
  prazoDias?: number;
  prazoRotulo?: string;
  inicio: string;
  passos: Passo[];
}

// ── Mensagens ────────────────────────────────────────────────────────────────
const MSG = {
  fotosFaltante:
    "Olá, {nome}! Sentimos muito pelo transtorno com o pedido {pedido}. Para resolvermos rápido, pode nos enviar fotos de:\n" +
    "1) a caixa fechada, com a etiqueta visível;\n2) o lacre ou a fita da embalagem;\n3) tudo o que veio dentro, do jeito que chegou?\n" +
    "Assim que recebermos, damos o retorno.",
  fotosAvaria:
    "Olá, {nome}! Sentimos muito pelo que aconteceu com o pedido {pedido}. Pode nos enviar fotos de:\n" +
    "1) a caixa por fora, com a etiqueta visível;\n2) o produto danificado;\n3) se possível, um vídeo curto mostrando o dano?\n" +
    "Com isso já conseguimos resolver.",
  fotosDefeito:
    "Olá, {nome}! Queremos entender o que aconteceu com o produto do pedido {pedido}. Pode nos enviar fotos ou um vídeo curto " +
    "mostrando o problema, e uma foto do rótulo com o lote e a validade?",
  fotosErrado:
    "Olá, {nome}! Pedimos desculpas pela troca no pedido {pedido}. Pode nos enviar uma foto do produto que chegou e da etiqueta da caixa?",
  vizinhos:
    "Olá, {nome}! O rastreio do pedido {pedido} aparece como entregue em {entregue}. Pode verificar, por favor, com a portaria, " +
    "vizinhos ou alguém da casa? Se não aparecer até amanhã, abrimos a reclamação com a transportadora e resolvemos para você.",
  previsao:
    "Olá, {nome}! Conferimos o pedido {pedido}: ele está a caminho, com previsão de entrega em {previsao}. " +
    "Seguimos acompanhando e te avisamos se algo mudar.",
  reversa:
    "Olá, {nome}! Autorizamos a devolução do pedido {pedido}. Vamos te enviar a etiqueta de postagem, e o frete é por nossa conta. " +
    "É só embalar o produto e levar a uma agência ou ponto de coleta. Assim que ele chegar aqui, fazemos o reembolso.",
  foraDoPrazo:
    "Olá, {nome}. O direito de arrependimento (art. 49 do Código de Defesa do Consumidor) vale por 7 dias a partir do recebimento, " +
    "e o pedido {pedido} foi entregue em {entregue}. Por isso não conseguimos aceitar a devolução por desistência. " +
    "Se houver qualquer problema com o produto, nos conte que analisamos.",
  aberto:
    "Olá, {nome}. Como o produto do pedido {pedido} foi aberto e não apresenta defeito, não conseguimos aceitar a devolução por " +
    "desistência: por ser consumível, depois de aberto ele não pode voltar à venda. Se notar qualquer problema no produto, nos avise que analisamos.",
  semDefeito:
    "Olá, {nome}. Analisamos o que você nos enviou sobre o pedido {pedido} e não identificamos defeito no produto, porque [motivo]. " +
    "Se quiser, podemos te orientar no uso para ter o melhor resultado.",
};

// ── Passos que se repetem ────────────────────────────────────────────────────
const enviar = (id: string, titulo: string, desfecho: "troca" | "reenvio", texto?: string): Passo => ({
  id, titulo, texto,
  campos: [{ id: "envio", rotulo: "Pedido ou rastreio do envio", tipo: "texto", obrigatorio: true }],
  opcoes: [{ id: "enviado", rotulo: "Enviado", desfecho, tom: "sim" }],
});

const reembolsoParcial = (cdc?: string): Passo => ({
  id: "reembolso_parcial", titulo: "Fazer o reembolso parcial", cdc,
  texto: "Devolver o valor do que faltou ou o abatimento combinado.",
  campos: [{ id: "valor", rotulo: "Valor devolvido (R$)", tipo: "valor", obrigatorio: true }],
  opcoes: [{ id: "feito", rotulo: "Reembolso feito", desfecho: "reembolso_parcial", tom: "sim" }],
});

const reembolsoIntegral = (cdc?: string, texto = "Devolver tudo o que foi pago, frete incluído."): Passo => ({
  id: "reembolso_integral", titulo: "Fazer o reembolso integral", cdc, texto,
  campos: [{ id: "valor", rotulo: "Valor devolvido (R$)", tipo: "valor", obrigatorio: true }],
  opcoes: [{ id: "feito", rotulo: "Reembolso feito", desfecho: "reembolso_integral", tom: "sim" }],
});

const recusa = (id: string, mensagem?: string): Passo => ({
  id, titulo: "Responder ao cliente, por escrito, com a justificativa", mensagem,
  campos: [{ id: "justificativa", rotulo: "Justificativa enviada", tipo: "longo", obrigatorio: true }],
  opcoes: [{ id: "respondido", rotulo: "Respondido", desfecho: "recusado", tom: "nao" }],
});

const reclamacao = (id: string, proximo: string, texto?: string): Passo => ({
  id, titulo: "Abrir reclamação na transportadora / Melhor Envio", cdc: "Art. 34", texto,
  campos: [{ id: "protocolo", rotulo: "Protocolo da reclamação", tipo: "texto", obrigatorio: true }],
  opcoes: [{ id: "aberta", rotulo: "Reclamação aberta", proximo }],
});

// ── Os roteiros ──────────────────────────────────────────────────────────────
export const FLUXOS: Fluxo[] = [
  {
    tipo: "faltante", rotulo: "Produto faltante", resumo: "Chegou incompleto", cdc: "Art. 19", cor: "#ea580c",
    prazoDias: 30, prazoRotulo: "Art. 18, § 1º",
    inicio: "fotos",
    passos: [
      { id: "fotos", titulo: "Pedir fotos ao cliente", mensagem: MSG.fotosFaltante,
        opcoes: [{ id: "recebidas", rotulo: "Fotos recebidas", proximo: "lacre" }] },
      { id: "lacre", titulo: "A embalagem chegou lacrada, sem sinal de violação?",
        opcoes: [
          { id: "sim", rotulo: "Sim, lacrada", proximo: "conferir", tom: "sim" },
          { id: "nao", rotulo: "Não, violada ou aberta", proximo: "transportadora", tom: "nao" },
        ] },
      reclamacao("transportadora", "conferir", "Embalagem violada no transporte: quem resolve com o cliente somos nós; a transportadora responde para nós."),
      { id: "conferir", titulo: "Comparando com o pedido, falta algum item?",
        campos: [{ id: "faltou", rotulo: "O que faltou", tipo: "texto" }],
        opcoes: [
          { id: "sim", rotulo: "Falta, confirmado", proximo: "escolha", tom: "sim" },
          { id: "nao", rotulo: "Está tudo lá", proximo: "explicar", tom: "nao" },
        ] },
      { id: "explicar", titulo: "Mostrar ao cliente o que compõe o pedido",
        opcoes: [
          { id: "entendeu", rotulo: "Cliente entendeu", desfecho: "resolvido", tom: "sim" },
          { id: "insiste", rotulo: "Cliente insiste que falta", proximo: "escolha" },
        ] },
      { id: "escolha", titulo: "O que o cliente prefere?", cdc: "Art. 19",
        texto: "A escolha é do cliente: completar o que faltou, abater do preço ou desfazer a compra.",
        opcoes: [
          { id: "completar", rotulo: "Enviar o que faltou", proximo: "reenvio" },
          { id: "parcial", rotulo: "Reembolso do que faltou", proximo: "reembolso_parcial" },
          { id: "integral", rotulo: "Desfazer a compra", proximo: "reembolso_integral" },
        ] },
      enviar("reenvio", "Enviar o que faltou, sem custo para o cliente", "reenvio"),
      reembolsoParcial("Art. 19, III"),
      reembolsoIntegral("Art. 19, IV"),
    ],
  },
  {
    tipo: "avaria", rotulo: "Avaria / vazamento", resumo: "Chegou danificado", cdc: "Art. 18", cor: "#dc2626",
    prazoDias: 30, prazoRotulo: "Art. 18, § 1º",
    inicio: "fotos",
    passos: [
      { id: "fotos", titulo: "Pedir fotos ao cliente", mensagem: MSG.fotosAvaria,
        opcoes: [{ id: "recebidas", rotulo: "Fotos recebidas", proximo: "origem" }] },
      { id: "origem", titulo: "De onde veio o dano?",
        opcoes: [
          { id: "transporte", rotulo: "Transporte (caixa amassada, molhada, vazou na viagem)", proximo: "transportadora" },
          { id: "fabricacao", rotulo: "Do próprio produto (fabricação)", mudaPara: "defeito" },
        ] },
      reclamacao("transportadora", "escolha"),
      { id: "escolha", titulo: "O que o cliente prefere?", cdc: "Art. 18, § 1º",
        texto: "A escolha é do cliente: outro produto, o dinheiro de volta ou um abatimento.",
        opcoes: [
          { id: "troca", rotulo: "Enviar outro", proximo: "troca" },
          { id: "integral", rotulo: "Reembolso integral", proximo: "reembolso_integral" },
          { id: "parcial", rotulo: "Abatimento (fica com o produto)", proximo: "reembolso_parcial" },
        ] },
      enviar("troca", "Enviar o produto novo, sem custo para o cliente", "troca", "O produto danificado não precisa voltar."),
      reembolsoParcial("Art. 18, § 1º, III"),
      reembolsoIntegral("Art. 18, § 1º, II"),
    ],
  },
  {
    tipo: "defeito", rotulo: "Defeito / não funcionou", resumo: "Problema no produto", cdc: "Art. 18", cor: "#9333ea",
    prazoDias: 30, prazoRotulo: "Art. 18, § 1º",
    inicio: "relato",
    passos: [
      { id: "relato", titulo: "O que o cliente relata?",
        opcoes: [
          { id: "defeito", rotulo: "Defeito no produto (vazamento, lacre, cor, cheiro, validade)", proximo: "fotos" },
          { id: "uso", rotulo: "Não viu resultado / dúvida de uso", proximo: "orientar" },
        ] },
      { id: "orientar", titulo: "Orientar o uso correto", texto: "Dosagem, abastecimento e tempo de uso.",
        opcoes: [
          { id: "resolveu", rotulo: "Resolveu", desfecho: "resolvido", tom: "sim" },
          { id: "defeito", rotulo: "Cliente diz que está com defeito", proximo: "fotos" },
          { id: "devolver", rotulo: "Cliente quer devolver", mudaPara: "arrependimento" },
        ] },
      { id: "fotos", titulo: "Pedir fotos ou vídeo, com lote e validade", mensagem: MSG.fotosDefeito,
        opcoes: [{ id: "recebidas", rotulo: "Fotos recebidas", proximo: "analise" }] },
      { id: "analise", titulo: "As fotos mostram o defeito?", cdc: "Art. 18",
        campos: [{ id: "lote", rotulo: "Lote e validade", tipo: "texto" }],
        opcoes: [
          { id: "sim", rotulo: "Sim, defeito confirmado", proximo: "escolha", tom: "sim" },
          { id: "ver", rotulo: "Precisa ver o produto", proximo: "recolher" },
          { id: "nao", rotulo: "Não há defeito", proximo: "recusa", tom: "nao" },
        ] },
      { id: "recolher", titulo: "Gerar etiqueta reversa (frete nosso) e enviar ao cliente",
        campos: [{ id: "reversa", rotulo: "Rastreio da reversa", tipo: "texto", obrigatorio: true }],
        opcoes: [{ id: "enviada", rotulo: "Etiqueta enviada", proximo: "chegou" }] },
      { id: "chegou", titulo: "O produto voltou à LogHouse?",
        opcoes: [{ id: "recebido", rotulo: "Recebido", proximo: "conferir" }] },
      { id: "conferir", titulo: "O produto recebido confirma o defeito?",
        opcoes: [
          { id: "sim", rotulo: "Sim", proximo: "escolha", tom: "sim" },
          { id: "nao", rotulo: "Não", proximo: "recusa", tom: "nao" },
        ] },
      { id: "escolha", titulo: "O que o cliente prefere?", cdc: "Art. 18, § 1º",
        texto: "A escolha é do cliente: outro produto, o dinheiro de volta ou um abatimento.",
        opcoes: [
          { id: "troca", rotulo: "Enviar outro", proximo: "troca" },
          { id: "integral", rotulo: "Reembolso integral", proximo: "reembolso_integral" },
          { id: "parcial", rotulo: "Abatimento", proximo: "reembolso_parcial" },
        ] },
      enviar("troca", "Enviar o produto novo, sem custo para o cliente", "troca"),
      reembolsoParcial("Art. 18, § 1º, III"),
      reembolsoIntegral("Art. 18, § 1º, II"),
      recusa("recusa", MSG.semDefeito),
    ],
  },
  {
    tipo: "errado", rotulo: "Produto errado", resumo: "Veio outro produto", cdc: "Art. 18", cor: "#db2777",
    prazoDias: 30, prazoRotulo: "Art. 18, § 1º",
    inicio: "fotos",
    passos: [
      { id: "fotos", titulo: "Pedir foto do que chegou e da etiqueta", mensagem: MSG.fotosErrado,
        opcoes: [{ id: "recebidas", rotulo: "Fotos recebidas", proximo: "confere" }] },
      { id: "confere", titulo: "Chegou um produto diferente do pedido?",
        opcoes: [
          { id: "sim", rotulo: "Sim", proximo: "escolha", tom: "sim" },
          { id: "nao", rotulo: "Não, é o produto do pedido", proximo: "recusa", tom: "nao" },
        ] },
      { id: "escolha", titulo: "O que o cliente prefere?",
        opcoes: [
          { id: "certo", rotulo: "Receber o produto certo", proximo: "troca" },
          { id: "integral", rotulo: "Reembolso integral", proximo: "recolher" },
        ] },
      { id: "troca", titulo: "Enviar o produto certo e a etiqueta reversa do errado",
        texto: "Os dois fretes são nossos. O certo não precisa esperar o errado voltar.",
        campos: [
          { id: "envio", rotulo: "Pedido ou rastreio do envio", tipo: "texto", obrigatorio: true },
          { id: "reversa", rotulo: "Rastreio da reversa", tipo: "texto" },
        ],
        opcoes: [{ id: "enviado", rotulo: "Enviado", desfecho: "troca", tom: "sim" }] },
      { id: "recolher", titulo: "Gerar etiqueta reversa do produto errado (frete nosso)",
        campos: [{ id: "reversa", rotulo: "Rastreio da reversa", tipo: "texto" }],
        opcoes: [{ id: "enviada", rotulo: "Etiqueta enviada", proximo: "reembolso_integral" }] },
      reembolsoIntegral("Art. 18, § 1º, II"),
      recusa("recusa"),
    ],
  },
  {
    tipo: "arrependimento", rotulo: "Arrependimento", resumo: "Desistiu da compra", cdc: "Art. 49", cor: "#2563eb",
    inicio: "entregue",
    passos: [
      { id: "entregue", titulo: "O pedido já foi entregue?",
        opcoes: [
          { id: "sim", rotulo: "Sim, já recebeu", proximo: "prazo", tom: "sim" },
          { id: "caminho", rotulo: "Está a caminho", proximo: "recusar_entrega" },
          { id: "nao_saiu", rotulo: "Ainda não saiu", proximo: "cancelar" },
        ] },
      { id: "cancelar", titulo: "Cancelar o pedido (Bling e loja) e estornar o pagamento",
        campos: [{ id: "valor", rotulo: "Valor estornado (R$)", tipo: "valor", obrigatorio: true }],
        opcoes: [{ id: "feito", rotulo: "Cancelado e estornado", desfecho: "reembolso_integral", tom: "sim" }] },
      { id: "recusar_entrega", titulo: "Orientar o cliente a recusar na entrega",
        texto: "A encomenda volta para nós e o reembolso sai quando ela chegar.",
        opcoes: [{ id: "orientado", rotulo: "Cliente orientado", proximo: "chegou" }] },
      { id: "prazo", titulo: "Pediu até 7 dias depois de receber?", cdc: "Art. 49",
        opcoes: [
          { id: "sim", rotulo: "Sim, dentro do prazo", proximo: "estado", tom: "sim" },
          { id: "nao", rotulo: "Não, depois de 7 dias", proximo: "fora_prazo", tom: "nao" },
        ] },
      { id: "fora_prazo", titulo: "O cliente relata algum defeito?", cdc: "Art. 18",
        opcoes: [
          { id: "sim", rotulo: "Sim", mudaPara: "defeito", tom: "sim" },
          { id: "nao", rotulo: "Não", proximo: "recusa_prazo", tom: "nao" },
        ] },
      recusa("recusa_prazo", MSG.foraDoPrazo),
      { id: "estado", titulo: "O produto está lacrado, sem uso?",
        opcoes: [
          { id: "sim", rotulo: "Sim, lacrado", proximo: "reversa", tom: "sim" },
          { id: "nao", rotulo: "Não, foi aberto", proximo: "aberto", tom: "nao" },
        ] },
      { id: "aberto", titulo: "Aberto: há defeito?", cdc: "Art. 18",
        opcoes: [
          { id: "sim", rotulo: "Sim", mudaPara: "defeito", tom: "sim" },
          { id: "nao", rotulo: "Não", proximo: "recusa_aberto", tom: "nao" },
        ] },
      recusa("recusa_aberto", MSG.aberto),
      { id: "reversa", titulo: "Gerar etiqueta reversa (frete nosso) e enviar as instruções", mensagem: MSG.reversa,
        campos: [{ id: "reversa", rotulo: "Rastreio da reversa", tipo: "texto", obrigatorio: true }],
        opcoes: [{ id: "enviada", rotulo: "Etiqueta enviada", proximo: "chegou" }] },
      { id: "chegou", titulo: "O produto voltou à LogHouse?",
        opcoes: [{ id: "recebido", rotulo: "Recebido", proximo: "conferir" }] },
      { id: "conferir", titulo: "Chegou como o cliente informou?",
        opcoes: [
          { id: "sim", rotulo: "Sim", proximo: "reembolso_integral", tom: "sim" },
          { id: "nao", rotulo: "Não", proximo: "reavaliar", tom: "nao" },
        ] },
      { id: "reavaliar", titulo: "Reavaliar o caso",
        campos: [{ id: "diferenca", rotulo: "O que chegou diferente", tipo: "longo", obrigatorio: true }],
        opcoes: [
          { id: "integral", rotulo: "Reembolsar tudo mesmo assim", proximo: "reembolso_integral" },
          { id: "parcial", rotulo: "Reembolso parcial", proximo: "reembolso_parcial" },
          { id: "recusar", rotulo: "Recusar", proximo: "recusa_conferencia", tom: "nao" },
        ] },
      recusa("recusa_conferencia"),
      reembolsoParcial(),
      reembolsoIntegral("Art. 49, parágrafo único", "Devolver tudo o que foi pago, frete incluído, sem demora."),
    ],
  },
  {
    tipo: "nao_recebido", rotulo: "Entregue e não recebido", resumo: "Rastreio diz entregue", cdc: "Art. 35", cor: "#7c3aed",
    inicio: "comprovante",
    passos: [
      { id: "comprovante", titulo: "Conferir o comprovante de entrega", texto: "Data, hora, endereço e quem recebeu.",
        campos: [{ id: "comprovante", rotulo: "O que o comprovante mostra", tipo: "texto" }],
        opcoes: [{ id: "conferido", rotulo: "Conferido", proximo: "vizinhos" }] },
      { id: "vizinhos", titulo: "Pedir ao cliente para procurar com portaria, vizinhos e familiares", mensagem: MSG.vizinhos,
        opcoes: [{ id: "pedido", rotulo: "Mensagem enviada", proximo: "achou" }] },
      { id: "achou", titulo: "O cliente encontrou a encomenda?",
        opcoes: [
          { id: "sim", rotulo: "Sim, encontrou", desfecho: "resolvido", tom: "sim" },
          { id: "nao", rotulo: "Não", proximo: "chamado", tom: "nao" },
        ] },
      reclamacao("chamado", "resultado"),
      { id: "resultado", titulo: "O que a transportadora respondeu?",
        opcoes: [
          { id: "comprovou", rotulo: "Comprovou a entrega (assinatura ou foto)", proximo: "comprovada" },
          { id: "extravio", rotulo: "Extravio ou sem comprovação", proximo: "escolha" },
        ] },
      { id: "comprovada", titulo: "Enviar o comprovante ao cliente",
        opcoes: [
          { id: "reconheceu", rotulo: "Cliente reconheceu", desfecho: "resolvido", tom: "sim" },
          { id: "contesta", rotulo: "Cliente contesta", proximo: "escolha", tom: "nao" },
        ] },
      { id: "escolha", titulo: "O que o cliente prefere?", cdc: "Art. 35",
        opcoes: [
          { id: "reenviar", rotulo: "Reenviar", proximo: "reenvio" },
          { id: "integral", rotulo: "Reembolso integral", proximo: "reembolso_integral" },
        ] },
      enviar("reenvio", "Reenviar o pedido, sem custo para o cliente", "reenvio"),
      reembolsoIntegral("Art. 35, III"),
    ],
  },
  {
    tipo: "atraso", rotulo: "Atraso / extravio", resumo: "Ainda não chegou", cdc: "Art. 35", cor: "#0284c7",
    inicio: "rastreio",
    passos: [
      { id: "rastreio", titulo: "O que o rastreio mostra?",
        opcoes: [
          { id: "prazo", rotulo: "A caminho, dentro do prazo", proximo: "informar" },
          { id: "parado", rotulo: "Parado ou atrasado", proximo: "chamado" },
          { id: "voltando", rotulo: "Voltando ao remetente", mudaPara: "devolvido" },
        ] },
      { id: "informar", titulo: "Informar a previsão ao cliente", mensagem: MSG.previsao,
        opcoes: [{ id: "informado", rotulo: "Cliente informado", proximo: "acompanhar" }] },
      { id: "acompanhar", titulo: "A encomenda chegou?",
        opcoes: [
          { id: "sim", rotulo: "Chegou", desfecho: "resolvido", tom: "sim" },
          { id: "nao", rotulo: "Atrasou de novo", proximo: "chamado", tom: "nao" },
        ] },
      reclamacao("chamado", "resultado"),
      { id: "resultado", titulo: "O que a transportadora respondeu?",
        opcoes: [
          { id: "localizada", rotulo: "Localizada, segue para entrega", proximo: "acompanhar" },
          { id: "extravio", rotulo: "Extravio confirmado", proximo: "escolha" },
        ] },
      { id: "escolha", titulo: "O que o cliente prefere?", cdc: "Art. 35",
        opcoes: [
          { id: "reenviar", rotulo: "Reenviar", proximo: "reenvio" },
          { id: "integral", rotulo: "Reembolso integral", proximo: "reembolso_integral" },
        ] },
      enviar("reenvio", "Reenviar o pedido, sem custo para o cliente", "reenvio"),
      reembolsoIntegral("Art. 35, III"),
    ],
  },
  {
    tipo: "devolvido", rotulo: "Devolvido ao remetente", resumo: "Voltou para nós", cdc: "Art. 35", cor: "#0891b2",
    inicio: "motivo",
    passos: [
      { id: "motivo", titulo: "Por que voltou?",
        opcoes: [
          { id: "endereco", rotulo: "Endereço incorreto ou incompleto", proximo: "endereco" },
          { id: "ausente", rotulo: "Ninguém para receber", proximo: "endereco" },
          { id: "recusou", rotulo: "O cliente recusou", mudaPara: "arrependimento" },
        ] },
      { id: "endereco", titulo: "Confirmar endereço e melhor horário com o cliente",
        texto: "Se o erro foi no endereço informado pelo cliente, o novo frete pode ser combinado com ele.",
        campos: [{ id: "endereco", rotulo: "Endereço confirmado", tipo: "longo", obrigatorio: true }],
        opcoes: [{ id: "confirmado", rotulo: "Confirmado", proximo: "quer" }] },
      { id: "quer", titulo: "O cliente ainda quer receber?",
        opcoes: [
          { id: "sim", rotulo: "Sim", proximo: "reenvio", tom: "sim" },
          { id: "nao", rotulo: "Não", proximo: "reembolso_integral", tom: "nao" },
        ] },
      enviar("reenvio", "Reenviar para o endereço confirmado", "reenvio"),
      reembolsoIntegral(),
    ],
  },
  {
    tipo: "outro", rotulo: "Outro assunto", resumo: "Dúvida, NF, cadastro…", cdc: "", cor: "#64748b",
    inicio: "registro",
    passos: [
      { id: "registro", titulo: "Registrar o atendimento",
        campos: [{ id: "assunto", rotulo: "O que foi tratado", tipo: "longo", obrigatorio: true }],
        opcoes: [
          { id: "resolvido", rotulo: "Resolvido", desfecho: "resolvido", tom: "sim" },
          { id: "sem_solucao", rotulo: "Sem solução", desfecho: "sem_solucao", tom: "nao" },
        ] },
    ],
  },
];

export const FLUXO: Record<TipoCaso, Fluxo> = Object.fromEntries(FLUXOS.map((f) => [f.tipo, f])) as Record<TipoCaso, Fluxo>;

/**
 * O tipo de caso que cada assunto de RECLAMAÇÃO do painel do atendimento
 * sugere (`carbo_wa_assuntos`, 20261149). Só sugere: quem atende escolhe.
 * Assunto sem tipo claro (pagamento, cobra resposta, ameaça) não sugere nada.
 */
export const TIPO_DO_ASSUNTO: Record<string, TipoCaso> = {
  faltou_item: "faltante",
  produto_diferente: "errado",
  avaria: "avaria",
  embalagem: "avaria",
  entrega_falhou: "nao_recebido",
  nao_funcionou: "defeito",
  atraso: "atraso",
  rastreio: "atraso",
  cancelamento: "arrependimento",
};

export function tiposSugeridos(codigos: string[]): TipoCaso[] {
  return [...new Set(codigos.map((c) => TIPO_DO_ASSUNTO[c]).filter(Boolean))] as TipoCaso[];
}

/** O passo de um caso; nulo quando o roteiro mudou e o id sumiu. */
export function passoDe(tipo: string, passo: string): Passo | null {
  const f = FLUXO[tipo as TipoCaso];
  return f?.passos.find((p) => p.id === passo) ?? null;
}

export const rotuloTipo = (tipo: string) => FLUXO[tipo as TipoCaso]?.rotulo ?? tipo;
export const rotuloDesfecho = (d: string | null | undefined) => (d && DESFECHOS[d as Desfecho]?.rotulo) || d || "";

/** Campos obrigatórios que faltam para responder o passo. */
export function faltando(p: Passo, valores: Record<string, string>): string[] {
  return (p.campos ?? []).filter((c) => c.obrigatorio && !(valores[c.id] ?? "").trim()).map((c) => c.rotulo);
}

/** "13,50" / "1.234,56" / "13.50" → 13.5. Inválido → null. */
export function lerValor(s: string): number | null {
  const t = s.trim().replace(/^R\$\s*/i, "");
  if (!t) return null;
  const norm = t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t;
  const n = Number(norm);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
}

export interface VarsMensagem { nome?: string | null; pedido?: string | null; entregue?: string | null; previsao?: string | null; rastreio?: string | null }

/** Preenche a mensagem; o que não se sabe fica entre colchetes para quem envia completar. */
export function preencherMensagem(m: string, v: VarsMensagem): string {
  const primeiro = (v.nome ?? "").trim().split(/\s+/)[0] ?? "";
  const nome = primeiro ? primeiro.charAt(0).toUpperCase() + primeiro.slice(1).toLowerCase() : "";
  const mapa: Record<string, string> = {
    nome,
    pedido: v.pedido || "[pedido]",
    entregue: v.entregue || "[data da entrega]",
    previsao: v.previsao || "[previsão]",
    rastreio: v.rastreio || "[rastreio]",
  };
  // Sem nome, "Olá, {nome}!" vira "Olá!" — nunca "Olá, !".
  const base = nome ? m : m.replace(/Olá, \{nome\}/g, "Olá");
  return base.replace(/\{(\w+)\}/g, (_, k: string) => mapa[k] ?? `{${k}}`);
}

/** Prazo do caso (data limite) e se venceu. */
export function prazoDoCaso(tipo: string, abertoEm: string, agora = Date.now()) {
  const f = FLUXO[tipo as TipoCaso];
  if (!f?.prazoDias) return null;
  const limite = new Date(new Date(abertoEm).getTime() + f.prazoDias * 86_400_000);
  const restam = Math.ceil((limite.getTime() - agora) / 86_400_000);
  return { limite, restam, vencido: restam < 0, rotulo: f.prazoRotulo ?? "" };
}
