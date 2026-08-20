// ─────────────────────────────────────────────────────────────────────────────
// Leitura do envio do Melhor Envio → linha de `melhorenvio_envios`.
//
// ⚠️ Módulo PURO, sem `Deno.*` e sem fetch, por um motivo prático: é aqui que
// mora tudo que eu não confirmei contra a API, e é isto que precisa de teste.
// Enquanto a extração vivia dentro do `Deno.serve`, testá-la exigiria subir uma
// edge function inteira — na prática, não seria testada.
//
// Os campos confirmados EM PRODUÇÃO pelo `rastreio-sync`:
//   id · tracking · self_tracking · protocol · melhorenvio_tracking
//   invoice.key · service.name · service.company.name
//   service.company.tracking_link · delivery_max
//   generated_at · posted_at · delivered_at · canceled_at · expired_at
//
// Os que eu DEDUZI e que o `?ensaio=1` existe para confirmar:
//   to.name · to.document · to.postal_code · insurance_value · tags[].tag
// ─────────────────────────────────────────────────────────────────────────────

// deno-lint-ignore-file no-explicit-any

export const txt = (v: unknown): string | null => {
  const s = v == null ? "" : String(v).trim();
  return s === "" ? null : s;
};

/** Data do ME → ISO. Ele manda "2026-08-19 13:21:00", sem T e sem fuso. */
export const data = (v: unknown): string | null => {
  const s = txt(v);
  if (!s) return null;
  const d = new Date(s.replace(" ", "T"));
  return isNaN(d.getTime()) ? null : d.toISOString();
};

export const num = (v: unknown): number | null => {
  const n = Number(v);
  return v === null || v === undefined || v === "" || !Number.isFinite(n) ? null : n;
};

/** Só dígitos. É assim que CPF e CEP viram chave de comparação confiável. */
export const digitos = (v: unknown): string | null => {
  const s = String(v ?? "").replace(/\D/g, "");
  return s === "" ? null : s;
};

/**
 * O número do pedido da loja.
 *
 * ⚠️ No painel aparece como "CarboZé #471" na aba "Aguardando envio": quem gera
 * a etiqueta pelo "Minhas Vendas" leva essa marca, quem gera avulso não. O
 * caminho mais provável é `tags[].tag`, mas não está confirmado — por isso a
 * busca varre candidatos e guarda também o texto CRU.
 *
 * Guardar o cru importa: se o número vier num formato que o regex não pega, o
 * dado não se perde — dá para ver o que chegou e ajustar, em vez de descobrir
 * uma coluna vazia sem saber por quê.
 */
export function pedidoDaLoja(o: any): { numero: string | null; cru: string | null } {
  const candidatos: string[] = [];
  const tags = Array.isArray(o?.tags) ? o.tags : [];
  for (const t of tags) {
    const s = txt(typeof t === "string" ? t : (t?.tag ?? t?.name ?? t?.value));
    if (s) candidatos.push(s);
  }
  for (const chave of ["order_id", "reference", "reference_id", "external_id", "sales_channel_order"]) {
    const s = txt(o?.[chave]);
    if (s) candidatos.push(s);
  }
  if (candidatos.length === 0) return { numero: null, cru: null };

  const cru = candidatos.join(" | ");
  // "CarboZé #471" → "471". O `#` separa o número da loja de qualquer outro
  // número que apareça numa tag (id de etiqueta, peso, valor).
  for (const c of candidatos) {
    const m = c.match(/#\s*(\d+)/);
    if (m) return { numero: m[1], cru };
  }
  // Tag que é só o número, sem `#`.
  for (const c of candidatos) {
    if (/^\d{1,10}$/.test(c)) return { numero: c, cru };
  }
  return { numero: null, cru };
}

/** Destinatário. O caminho conhecido é `to`; os outros são rede de segurança. */
export function destinatario(o: any) {
  const t = o?.to ?? o?.recipient ?? o?.destinatario ?? {};
  return {
    nome: txt(t?.name) ?? txt(t?.full_name) ?? txt(o?.to_name),
    doc:  digitos(t?.document ?? t?.cpf ?? t?.cnpj ?? t?.document_number),
    cep:  digitos(t?.postal_code ?? t?.zip_code ?? t?.cep),
  };
}

export interface LinhaEnvioME {
  me_id: string;
  tracking: string | null;
  self_tracking: string | null;
  protocol: string | null;
  melhorenvio_tracking: string | null;
  status_me: string | null;
  criado_em_me: string | null;
  pago_em: string | null;
  gerado_em: string | null;
  postado_em: string | null;
  entregue_em: string | null;
  cancelado_em: string | null;
  expirado_em: string | null;
  destinatario_nome: string | null;
  destinatario_doc: string | null;
  destinatario_cep: string | null;
  valor: number | null;
  transportadora: string | null;
  servico: string | null;
  prazo_dias: number | null;
  url_rastreio: string | null;
  pedido_loja: string | null;
  pedido_loja_raw: string | null;
  nf_chave: string | null;
  nf_numero: string | null;
  atualizado_em: string;
  raw: unknown;
}

export function paraLinha(o: any, agora = new Date()): LinhaEnvioME {
  const d = destinatario(o);
  const p = pedidoDaLoja(o);
  const chaveNf = txt(o?.invoice?.key);

  return {
    me_id: String(o?.id ?? ""),
    tracking:             txt(o?.tracking)?.toUpperCase() ?? null,
    self_tracking:        txt(o?.self_tracking)?.toUpperCase() ?? null,
    protocol:             txt(o?.protocol),
    melhorenvio_tracking: txt(o?.melhorenvio_tracking)?.toUpperCase() ?? null,

    status_me: txt(o?.status),

    criado_em_me: data(o?.created_at),
    pago_em:      data(o?.paid_at),
    gerado_em:    data(o?.generated_at),
    postado_em:   data(o?.posted_at),
    entregue_em:  data(o?.delivered_at),
    cancelado_em: data(o?.canceled_at),
    expirado_em:  data(o?.expired_at),

    destinatario_nome: d.nome,
    destinatario_doc:  d.doc,
    destinatario_cep:  d.cep,

    // ⚠️ `insurance_value` é o valor DECLARADO do conteúdo — é ele que casa com
    // o total do pedido. `price` é o custo do FRETE, e confundir os dois faria
    // a conciliação por valor errar em 100% dos casos, sem dar erro nenhum.
    valor: num(o?.insurance_value ?? o?.declared_value),

    transportadora: txt(o?.service?.company?.name),
    servico:        txt(o?.service?.name),
    prazo_dias:     num(o?.delivery_max),
    url_rastreio:   txt(o?.service?.company?.tracking_link),

    pedido_loja:     p.numero,
    pedido_loja_raw: p.cru,
    nf_chave:        chaveNf ? chaveNf.toUpperCase() : null,
    nf_numero:       txt(o?.invoice?.number),

    atualizado_em: agora.toISOString(),
    raw: o,
  };
}

/**
 * Traduz os carimbos numa palavra. Espelha `public.melhorenvio_situacao()`.
 *
 * ⚠️ Existe nos dois lugares porque o banco precisa dela em view e a tela
 * precisa dela sem ida ao banco. Mudou aqui, mude lá — é a mesma regra, e duas
 * réguas divergentes sobre "este envio está ativo?" é o tipo de coisa que faz
 * um envio cancelado marcar pedido como enviado.
 */
export function situacaoME(o: {
  cancelado_em?: string | null; expirado_em?: string | null;
  entregue_em?: string | null;  postado_em?: string | null;
  gerado_em?: string | null;    pago_em?: string | null;
}): string {
  if (o.cancelado_em) return "cancelado";
  if (o.entregue_em)  return "entregue";
  if (o.postado_em)   return "postado";
  // Vencida ANTES de "gerada": etiqueta expirada sem uso continua tendo
  // `generated_at`, e chamá-la de gerada faria a esteira prometer um envio que
  // não vai acontecer.
  if (o.expirado_em)  return "vencido";
  if (o.gerado_em)    return "gerado";
  if (o.pago_em)      return "pago";
  return "rascunho";
}
