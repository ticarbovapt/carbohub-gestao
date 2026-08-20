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
 * As tags do Melhor Envio viram um mapa `tag → url`.
 *
 * ⚠️ O VALOR está no campo `url`, não no `tag`. Medido em produção:
 *
 *   [{"tag":"mi:reference_code",   "url":"423"},
 *    {"tag":"mi:reference_link",   "url":"https://www.bling.com.br/vendas.php#edit/26653104669"},
 *    {"tag":"mi:marketplace_code", "url":"486"},
 *    {"tag":"mi:client_id",        "url":"489"}]
 *
 * A primeira versão lia `tag` e devolvia "mi:reference_code" como se fosse o
 * número do pedido — ou seja, lia a CHAVE e jogava fora o valor. O nome do
 * campo (`url`) é o que enganou: só uma das quatro entradas contém uma URL de
 * verdade.
 */
export function tagsME(o: any): Map<string, string> {
  const m = new Map<string, string>();
  const tags = Array.isArray(o?.tags) ? o.tags : [];
  for (const t of tags) {
    const chave = txt(t?.tag);
    const valor = txt(t?.url ?? t?.value);
    if (chave && valor) m.set(chave, valor);
  }
  return m;
}

/**
 * Os textos de tag que NÃO são pares chave/valor da integração.
 *
 * ⚠️ Existe porque as duas origens de tag têm formatos diferentes, e a primeira
 * reescrita quebrou uma ao consertar a outra:
 *
 *   integração    { tag: "mi:marketplace_code", url: "486" }   ← par
 *   Minhas Vendas { tag: "CarboZé #471",        url: null  }   ← texto solto
 *
 * Exigir `url` preenchido (que é o certo para o par) descartava o texto solto
 * inteiro. Os onze envios que o parser antigo acertava passariam a devolver
 * null — trocar um acerto por outro, e chamar isso de conserto.
 */
function textosSoltos(o: any): string[] {
  const out: string[] = [];
  const tags = Array.isArray(o?.tags) ? o.tags : [];
  for (const t of tags) {
    if (typeof t === "string") { const s = txt(t); if (s) out.push(s); continue; }
    const chave = txt(t?.tag ?? t?.name);
    const valor = txt(t?.url ?? t?.value);
    // Par da integração: já está no mapa, e o valor dele NÃO pode alimentar a
    // heurística — `mi:reference_code` = "423" é um número solto, e passaria
    // por número de pedido da loja sem ser.
    if (chave && valor && chave.startsWith("mi:")) continue;
    if (chave) out.push(chave);
    if (valor && valor !== chave) out.push(valor);
  }
  return out;
}

/**
 * O id INTERNO do pedido no Bling, tirado do link da tag.
 *
 * `https://www.bling.com.br/vendas.php#edit/26653104669` → 26653104669
 *
 * ⚠️ É a melhor porta de conciliação que existe aqui: exata, direta, e não
 * depende de casar número nenhum — é o mesmo id de `bling2_orders.bling_id`.
 * Quando ela vem preenchida, não há heurística nem ambiguidade possível.
 */
export function blingIdDoLink(link: string | null): string | null {
  if (!link) return null;
  const m = link.match(/edit\/(\d{4,})/);
  return m ? m[1] : null;
}

/**
 * O número do pedido da loja.
 *
 * Duas origens, e a ordem importa. `mi:marketplace_code` é o caminho de quem
 * gera a etiqueta pela integração; o "#471" no texto é o de quem gera pelo
 * "Minhas Vendas" — onze dos 320 envios.
 */
export function pedidoDaLoja(o: any): { numero: string | null; cru: string | null } {
  const mapa = tagsME(o);
  const soltos = textosSoltos(o);

  const partes: string[] = [];
  for (const [k, v] of mapa) partes.push(`${k}=${v}`);
  partes.push(...soltos);
  for (const chave of ["order_id", "reference", "reference_id", "external_id"]) {
    const s = txt(o?.[chave]);
    if (s) partes.push(`${chave}=${s}`);
  }
  const cru = partes.length ? partes.join(" | ") : null;

  const marketplace = mapa.get("mi:marketplace_code");
  if (marketplace && /^\d{1,10}$/.test(marketplace)) return { numero: marketplace, cru };

  // "CarboZé #471" → "471". Só sobre texto solto: o link da integração contém
  // "#edit/26653104669", e varrer o mapa arriscaria capturá-lo.
  for (const v of soltos) {
    const m = v.match(/#\s*(\d+)/);
    if (m) return { numero: m[1], cru };
  }
  for (const v of soltos) {
    if (/^\d{1,10}$/.test(v)) return { numero: v, cru };
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

/** Junta o link base da transportadora com o código. Um dos dois faltando,
 *  devolve null — meio link é pior que link nenhum. */
export function urlRastreio(base: string | null, codigo: string | null): string | null {
  if (!base) return null;
  if (!codigo) return null;
  return base.endsWith("/") ? base + codigo : `${base}/${codigo}`;
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
  /** `mi:reference_code` — o número do pedido no Bling, segundo a tag. */
  bling_numero: string | null;
  /** Id interno do Bling, extraído de `mi:reference_link`. A porta exata. */
  bling_id_ref: string | null;
  nf_chave: string | null;
  nf_numero: string | null;
  atualizado_em: string;
  raw: unknown;
}

export function paraLinha(o: any, quando?: Date): LinhaEnvioME {
  // ⚠️ Cinto de segurança contra `.map(paraLinha)`: o `map` passa o índice no
  // segundo argumento, e um `Date` com valor numérico não tem `toISOString`.
  // Já derrubou a função uma vez, com 500 sem corpo. O chamador certo é
  // `(o) => paraLinha(o)`, mas depender só de disciplina aqui é caro demais.
  const agora = quando instanceof Date ? quando : new Date();
  const d = destinatario(o);
  const p = pedidoDaLoja(o);
  const tags = tagsME(o);
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
    // ⚠️ `tracking_link` vem como URL BASE, sem o código no fim
    // (medido: "https://www.melhorrastreio.com.br/rastreio/"). Guardar como
    // veio daria um link para uma página vazia na mão do cliente.
    url_rastreio:   urlRastreio(txt(o?.service?.company?.tracking_link),
                                txt(o?.tracking) ?? txt(o?.self_tracking)),

    pedido_loja:     p.numero,
    pedido_loja_raw: p.cru,
    bling_numero:    tags.get("mi:reference_code") ?? null,
    bling_id_ref:    blingIdDoLink(tags.get("mi:reference_link") ?? null),
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
