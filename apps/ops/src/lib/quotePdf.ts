import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import logoUrl from "@/assets/logo-grupo-carbo.png";
import { carregarMarcaCarbovapt } from "@carbo/shell";

// Orçamento (ou PEDIDO, depois de convertido — ver `status`) em PDF com a
// identidade do Grupo Carbo.
// ⚠️ DADOS DA EMPRESA: confirme/ajuste em COMPANY abaixo (CNPJ, endereço, contato).
const COMPANY = {
  name: "Carbo Soluções LTDA",
  cnpj: "36.060.692/0001-00",
  endereco: "Rua Almirante Tamandaré, 196",
  cidade: "Lagoa Nova · Natal - RN · CEP 59054-560",
  telefone: "(84) 3207-5055",
  email: "administrativo@carbovapt.com.br",
  site: "carboze.com.br",
};

// Paleta forte (igual ao modelo de referência): verde floresta + acento lima.
const GREEN: [number, number, number] = [15, 64, 45];     // #0F402D — faixa, cabeçalhos, total
const LIME: [number, number, number] = [141, 198, 63];    // #8DC63F — fios/caixa de acento

interface QuoteItem {
  name?: string;
  product_code?: string;
  quantity?: number;
  unit_price?: number;
  /** Modelo ANTIGO de bonificação: quantidade extra na própria linha do produto
   *  pago. Continua sendo lido porque o histórico está gravado assim. */
  bonus_quantity?: number;
  /** ⭐ Desconto DESTA linha, em R$, como o vendedor deu na tela.
   *  ⚠️ Ele existe no dado desde sempre (`discount_type`/`discount_value`/
   *  `discount_amount` no item), e o PDF o IGNORAVA: rateava o desconto do
   *  pedido por todas as linhas. Num pedido com desconto em UM item só, o
   *  papel mostrava desconto nos dois — total certo, realidade errada. */
  discount_amount?: number;
  /** Modelo NOVO: a linha inteira é bonificação — o "gêmeo" do catálogo,
   *  entregue de graça a 100% de desconto.
   *  ⚠️ Ela NÃO entra na base de rateio do desconto do pedido: já é grátis, e
   *  mantê-la na base encolheria o fator de desconto, fazendo todas as outras
   *  linhas receberem desconto a menos e o total deixar de fechar. */
  is_bonificacao?: boolean;
  /** `service` nas linhas do CarboVAPT. Com `modality` (P/M/G) é descarbonização;
   *  sem ela, é um serviço que acompanha (laudo, medição). */
  kind?: string;
  modality?: string | null;
  /** Texto livre da linha ("2 caminhões e 1 colheitadeira"), abaixo do nome. */
  descricao?: string;
}

type Endereco = Record<string, unknown> | null | undefined;

export interface QuotePdfData {
  order_number?: string | null;
  customer_name?: string | null;
  legal_name?: string | null;
  cnpj?: string | null;
  ie?: string | null;
  endereco?: Endereco;               // endereço de entrega
  endereco_faturamento?: Endereco;   // se diferente da entrega; null = mesmo
  vendedor_name?: string | null;
  payment_terms?: string | null;     // forma de pagamento escolhida
  items?: unknown;
  subtotal?: number | null;
  discount?: number | null;          // desconto aplicado (R$)
  discount_percent?: number | null;  // % do desconto (para exibição)
  total?: number | null;
  created_at?: string | null;
  notes?: string | null;
  validityDays?: number;
  /** Status CRU de `carboze_orders`. ⚠️ Decide o TÍTULO do papel: `quote` (ou
   *  ausente — o /vender gera antes de existir venda) é ORÇAMENTO; qualquer
   *  outro é PEDIDO. Depois de convertido, o cliente recebia um "orçamento
   *  válido até…" de uma compra que já tinha fechado. */
  status?: string | null;
}

// Modalidades exibidas como "aceitas" no PDF. NÃO listamos "Boleto faturado" aqui
// de propósito (para não induzir o cliente); ele continua selecionável no Vender e,
// se escolhido, aparece em "Forma escolhida".
const FORMAS_ACEITAS = "PIX · Boleto à vista · Cartão de débito · Cartão de crédito";

const brl = (v: number) => (v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dateBR = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString("pt-BR") : new Date().toLocaleDateString("pt-BR");

// Carrega a imagem preservando as dimensões naturais (para não esticar a logo).
// tintWhite: recolore a logo para BRANCO (silhueta) — para aparecer sobre a faixa
// verde escura sem precisar de fundo/chip branco.
function loadImage(url: string, tintWhite = false): Promise<{ dataUrl: string; w: number; h: number } | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const W = img.naturalWidth, H = img.naturalHeight;
        const canvas = document.createElement("canvas");
        canvas.width = W; canvas.height = H;
        const ctx = canvas.getContext("2d");
        if (!ctx) { resolve(null); return; }
        ctx.drawImage(img, 0, 0);

        // Recorta a margem transparente (bounding box dos pixels visíveis) para a
        // logo preencher a caixa — sem o espaço vazio que a deixava pequena.
        let sx = 0, sy = 0, sw = W, sh = H;
        try {
          const d = ctx.getImageData(0, 0, W, H).data;
          let minX = W, minY = H, maxX = -1, maxY = -1;
          for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
            if (d[(y * W + x) * 4 + 3] > 8) {
              if (x < minX) minX = x; if (x > maxX) maxX = x;
              if (y < minY) minY = y; if (y > maxY) maxY = y;
            }
          }
          if (maxX >= minX && maxY >= minY) { sx = minX; sy = minY; sw = maxX - minX + 1; sh = maxY - minY + 1; }
        } catch { /* getImageData bloqueado → usa a imagem inteira */ }

        const out = document.createElement("canvas");
        out.width = sw; out.height = sh;
        const octx = out.getContext("2d");
        if (!octx) { resolve(null); return; }
        octx.drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh);
        if (tintWhite) {
          octx.globalCompositeOperation = "source-in"; // mantém o alpha, pinta de branco
          octx.fillStyle = "#ffffff";
          octx.fillRect(0, 0, sw, sh);
        }
        resolve({ dataUrl: out.toDataURL("image/png"), w: sw, h: sh });
      } catch { resolve(null); }
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

const s = (e: Endereco, k: string) => (e && e[k] != null ? String(e[k]) : "");
function fmtAddrLines(e: Endereco): string[] {
  if (!e) return [];
  const l1 = [s(e, "logradouro"), s(e, "numero")].filter(Boolean).join(", ");
  const l2 = [s(e, "bairro"), [s(e, "cidade"), s(e, "uf")].filter(Boolean).join("/")].filter(Boolean).join(" · ");
  const l3 = s(e, "cep") ? `CEP ${s(e, "cep")}` : "";
  return [l1, l2, l3].filter(Boolean);
}

const centavos = (n: number) => Math.round(n * 100) / 100;

/** O desconto de cada linha PAGA — por item quando as linhas fecham com o
 *  pedido, senão rateado. A explicação inteira está no comentário de
 *  `generateQuotePdf`, onde isto nasceu; os DOIS layouts (Grupo Carbo e
 *  CarboVAPT) usam esta mesma conta, e é por isso que ela é função. */
function descontosPorLinha(pagos: QuoteItem[], descontoPedido: number) {
  const brutoTotal = pagos.reduce((s, it) => s + (it.quantity ?? 0) * (it.unit_price ?? 0), 0);
  const temDesconto = descontoPedido > 0 && brutoTotal > 0;

  // O desconto que cada linha declara. Soma-se para decidir o modo.
  const porItem = pagos.map((it) => Math.max(0, Number(it.discount_amount ?? 0)));
  const somaPorItem = centavos(porItem.reduce((s, d) => s + d, 0));
  // ⚠️ Tolerância de 2 centavos: o dado vem de `round2` do lado da venda, e
  // exigir igualdade exata jogaria de volta no rateio por um centavo de
  // arredondamento — trocando a verdade por um detalhe invisível.
  const usaPorItem = temDesconto && somaPorItem > 0
    && Math.abs(somaPorItem - descontoPedido) <= 0.02;

  const descUnit: number[] = [];   // desconto de UMA unidade, já em centavos redondos
  const descLinha: number[] = [];  // desconto da linha inteira
  if (temDesconto) {
    pagos.forEach((it, i) => {
      const qty = it.quantity ?? 0;
      const unit = it.unit_price ?? 0;
      // No modo por item o alvo é o desconto da própria linha; no rateio, a
      // fatia proporcional. Daí para baixo o tratamento é o MESMO — inclusive
      // o arredondamento do unitário, que é o que faz unit × qtd fechar exato.
      const alvo = usaPorItem ? porItem[i] : unit * qty * (descontoPedido / brutoTotal);
      const du = qty > 0 ? Math.min(unit, centavos(alvo / qty)) : 0;
      descUnit.push(du);                                   // nunca abaixo de zero
      descLinha.push(centavos(du * qty));
    });

    /* A sobra tem de cair em alguma linha (ver o comentário acima).
     *
     * ⚠️ No modo por item ela só pode cair numa linha que JÁ TEM desconto.
     * Jogá-la na menor quantidade em geral inventaria um desconto de centavos
     * num produto que não recebeu nenhum — que é, em miniatura, exatamente o
     * defeito que esta correção conserta. */
    const candidatos = pagos
      .map((_, i) => i)
      .filter((i) => !usaPorItem || descLinha[i] > 0);
    if (candidatos.length) {
      let absorve = candidatos[0];
      for (const i of candidatos) {
        if ((pagos[i].quantity ?? 0) < (pagos[absorve].quantity ?? 0)) absorve = i;
      }
      const sobra = centavos(descontoPedido - descLinha.reduce((s, d) => s + d, 0));
      const bruto = (pagos[absorve].quantity ?? 0) * (pagos[absorve].unit_price ?? 0);
      descLinha[absorve] = Math.min(bruto, Math.max(0, centavos(descLinha[absorve] + sobra)));
    }
  }
  return { temDesconto, descUnit, descLinha };
}

// ═════════════════════════════════════════════════════════════════════════════
// PROPOSTA COMERCIAL CARBOVAPT
//
// Pedido do dono do processo (21/10/2026): o orçamento de serviço "o mais
// próximo possível" da proposta montada na Canva — logo e marca d'água da
// CarboVAPT, cartão claro com a tabela, valor grande em verde-água, contatos e
// as faixas inclinadas no rodapé. As imagens moram em
// `packages/shell/src/carbovaptMarca.ts` (carregadas sob demanda).
//
// ⚠️ Quem decide é o PEDIDO, não a tela: toda linha é `kind: "service"` e ao
// menos uma é descarbonização (`modality`). Assim a segunda via (Vendas.tsx)
// sai igual à primeira — e por isso `kind`/`modality`/`descricao` atravessam
// aquele map.
// ⚠️ O desconto usa a MESMA conta do layout do Grupo Carbo
// (`descontosPorLinha`): o papel não pode mudar de número por mudar de cara.
// ═════════════════════════════════════════════════════════════════════════════

type RGB = [number, number, number];
const V_NAVY: RGB = [4, 53, 90];        // títulos e texto
const V_ROXO: RGB = [81, 93, 161];      // início do degradê
const V_VERDE: RGB = [103, 168, 163];   // fim do degradê, valor em destaque
const V_CARTAO: RGB = [236, 244, 243];  // fundo do cartão
const V_TEXTO: RGB = [63, 88, 128];     // texto corrido

const UF_NOME: Record<string, string> = {
  AC: "Acre", AL: "Alagoas", AP: "Amapá", AM: "Amazonas", BA: "Bahia", CE: "Ceará",
  DF: "Distrito Federal", ES: "Espírito Santo", GO: "Goiás", MA: "Maranhão",
  MT: "Mato Grosso", MS: "Mato Grosso do Sul", MG: "Minas Gerais", PA: "Pará",
  PB: "Paraíba", PR: "Paraná", PE: "Pernambuco", PI: "Piauí", RJ: "Rio de Janeiro",
  RN: "Rio Grande do Norte", RS: "Rio Grande do Sul", RO: "Rondônia", RR: "Roraima",
  SC: "Santa Catarina", SP: "São Paulo", SE: "Sergipe", TO: "Tocantins",
};

const CONTATO_VAPT = {
  telefone: "(11) 4000-2112",
  email: "carbovapt@carbovapt.com.br",
  site: "carbovapt.com.br",
  instagram: "carbovapt",
};

const itensDoPedido = (order: QuotePdfData) =>
  ((Array.isArray(order.items) ? order.items : []) as QuoteItem[])
    .filter((it) => (it.name || it.product_code) && (it.quantity ?? 0) > 0);

function ehPropostaCarbovapt(order: QuotePdfData): boolean {
  const itens = itensDoPedido(order);
  return itens.length > 0
    && itens.every((it) => it.kind === "service")
    && itens.some((it) => !!it.modality);
}

const mistura = (a: RGB, b: RGB, t: number): RGB =>
  [0, 1, 2].map((i) => Math.round(a[i] + (b[i] - a[i]) * t)) as RGB;

/** Faixa em degradê horizontal (o jsPDF não tem degradê: são fatias finas). */
function degrade(doc: jsPDF, x: number, y: number, w: number, h: number, fatias = 60) {
  const fw = w / fatias;
  for (let i = 0; i < fatias; i++) {
    doc.setFillColor(...mistura(V_ROXO, V_VERDE, i / (fatias - 1)));
    doc.rect(x + i * fw, y, fw + 0.05, h, "F");
  }
}

/** Paralelogramo inclinado para a direita, como as faixas da marca. */
function faixa(doc: jsPDF, xBase: number, y: number, w: number, h: number, incl: number, cor: RGB) {
  doc.setFillColor(...cor);
  doc.lines([[w, 0], [-incl, h], [-w, 0]], xBase + incl, y, [1, 1], "F", true);
}

const lista = (xs: string[]) =>
  xs.length <= 1 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} e ${xs[xs.length - 1]}`;

/** "A proposta contempla…" — montado das LINHAS (vale na segunda via). */
function textoDaProposta(itens: QuoteItem[]): string {
  const descarbs = itens.filter((it) => !!it.modality);
  const acompanham = itens.filter((it) => !it.modality).map((it) => it.name || "").filter(Boolean);
  const textos = descarbs.map((it) => it.descricao?.trim()).filter(Boolean) as string[];
  const n = descarbs.reduce((t, it) => t + (it.quantity ?? 0) + (it.bonus_quantity ?? 0), 0);
  const emQue = textos.length ? lista(textos) : `${n} ${n === 1 ? "veículo" : "veículos"}`;
  return "A proposta contempla a higienização e descarbonização da câmara de combustão"
    + (acompanham.length
      ? `, além de ${lista(acompanham)}, com emissão de laudo por equipamento certificado pelo INMETRO`
      : "")
    + `, em ${emQue}.`;
}

async function gerarPropostaCarbovapt(order: QuotePdfData, opts?: { download?: boolean }) {
  const marca = await carregarMarcaCarbovapt().catch(() => null);
  const doc = new jsPDF();
  const pageW = doc.internal.pageSize.getWidth();   // 210
  const ehPedido = !!order.status && order.status !== "quote";

  const itens = itensDoPedido(order);
  const pagos = itens.filter((it) => !it.is_bonificacao);
  const bonificados = itens.filter((it) => it.is_bonificacao);
  const { temDesconto, descLinha } = descontosPorLinha(pagos, Number(order.discount ?? 0));
  const descarbs = itens.filter((it) => !!it.modality);
  const nVeic = descarbs.reduce((t, it) => t + (it.quantity ?? 0) + (it.bonus_quantity ?? 0), 0);

  // ── Logo e título ──────────────────────────────────────────────────────────
  if (marca) {
    const lw = 38, lh = lw * (marca.LOGO.h / marca.LOGO.w);
    doc.addImage(marca.LOGO.src, "PNG", (pageW - lw) / 2, 17, lw, lh);
  } else {
    doc.setFont("helvetica", "bold"); doc.setFontSize(18); doc.setTextColor(...V_NAVY);
    doc.text("CARBOVAPT", pageW / 2, 26, { align: "center" });
  }
  const titulo = ehPedido ? "PEDIDO" : "PROPOSTA COMERCIAL";
  doc.setFont("helvetica", "bold"); doc.setTextColor(...V_NAVY);
  doc.setFontSize(26);
  const alvo = ehPedido ? 50 : 111;  // largura do título na proposta da Canva
  doc.setFontSize(Math.min(30, 26 * alvo / doc.getTextWidth(titulo)));
  doc.text(titulo, pageW / 2, 47, { align: "center" });
  const barraW = Math.max(alvo, doc.getTextWidth(titulo));
  degrade(doc, (pageW - barraW) / 2, 49.6, barraW, 1.6);

  // Número, datas e consultor — o que o modelo da Canva não tinha e o sistema precisa.
  const created = dateBR(order.created_at);
  const validade = new Date(order.created_at ? new Date(order.created_at) : new Date());
  validade.setDate(validade.getDate() + (order.validityDays ?? 7));
  const meta = [
    order.order_number ? `Nº ${order.order_number}` : "",
    `Emissão ${created}`,
    ehPedido ? "" : `Válida até ${validade.toLocaleDateString("pt-BR")}`,
    order.vendedor_name ? `Consultor: ${order.vendedor_name}` : "",
  ].filter(Boolean).join("   ·   ");
  doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.setTextColor(...V_TEXTO);
  doc.text(meta, pageW / 2, 56, { align: "center" });

  // ── Empresa · Quantidade · Localização ─────────────────────────────────────
  const e = order.endereco;
  const cidade = s(e, "cidade"), uf = s(e, "uf").toUpperCase();
  const local = [cidade, UF_NOME[uf] ?? uf].filter(Boolean).join(" · ") || "—";
  const colunas: [number, string, string[]][] = [
    [27, "Empresa:", [order.customer_name || order.legal_name || "—", order.cnpj ? `CNPJ/CPF ${order.cnpj}` : ""]],
    [92, "Quantidade:", [`${nVeic} ${nVeic === 1 ? "veículo" : "veículos"}`]],
    [150, "Localização:", [local]],
  ];
  let infoFim = 68;
  for (const [x, rot, vals] of colunas) {
    doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(...V_NAVY);
    doc.text(rot, x, 68);
    doc.setFont("helvetica", "normal"); doc.setFontSize(8.5);
    let yy = 72.5;
    for (const v of vals.filter(Boolean)) {
      const ls = doc.splitTextToSize(v, x === 150 ? 44 : 58);
      doc.text(ls, x, yy);
      yy += ls.length * 3.8;
    }
    infoFim = Math.max(infoFim, yy);
  }

  // ── Linhas da tabela ───────────────────────────────────────────────────────
  const corpo: string[][] = [];
  const risco: (string | null)[] = [];   // texto a riscar no começo da célula "Valor Unit."
  const qtdTexto = (it: QuoteItem, q: number) =>
    it.modality
      ? (it.descricao?.trim() || `${q} ${q === 1 ? "veículo" : "veículos"}`)
      : `${q} und`;
  pagos.forEach((it, i) => {
    const q = it.quantity ?? 0, unit = it.unit_price ?? 0;
    const d = temDesconto ? descLinha[i] : 0;
    const nome = it.name || it.product_code || "—";
    if (d > 0) {
      const unitCom = centavos((q * unit - d) / q);
      corpo.push([nome, qtdTexto(it, q), `${brl(unit)}  ${brl(unitCom)}`, brl(centavos(q * unit - d))]);
      risco.push(brl(unit));
    } else {
      corpo.push([nome, qtdTexto(it, q), brl(unit), brl(q * unit)]);
      risco.push(null);
    }
    // Modelo antigo: carros bonificados dentro da própria linha.
    const bonus = it.bonus_quantity ?? 0;
    if (bonus > 0) {
      corpo.push([`${nome} (bonificação)`, `${bonus} ${bonus === 1 ? "veículo" : "veículos"}`, unit > 0 ? `${brl(unit)}  Bonificado` : "Bonificado", brl(0)]);
      risco.push(unit > 0 ? brl(unit) : null);
    }
  });
  bonificados.forEach((it) => {
    const q = it.quantity ?? 0, unit = it.unit_price ?? 0;
    corpo.push([it.name || it.product_code || "—", qtdTexto(it, q), unit > 0 ? `${brl(unit)}  Bonificado` : "Bonificado", brl(0)]);
    risco.push(unit > 0 ? brl(unit) : null);
  });
  const total = Number(order.total ?? order.subtotal ?? 0);
  const desconto = Number(order.discount ?? 0);
  const rodapeTabela: string[][] = [];
  if (desconto > 0) {
    rodapeTabela.push(["Subtotal", "", "", brl(Number(order.subtotal ?? total + desconto))]);
    rodapeTabela.push([`Desconto${order.discount_percent ? ` (${order.discount_percent}%)` : ""}`, "", "", `- ${brl(desconto)}`]);
  }
  rodapeTabela.push(["Total", "", "", brl(total)]);

  // ── O cartão: mede numa folha de rascunho, depois desenha de verdade ───────
  // O fundo do cartão tem de vir ANTES do texto, e a altura dele depende do
  // conteúdo. O autoTable não diz a altura antes de desenhar — então ele
  // desenha uma vez num documento descartável.
  const cartaoX = 14.3, cartaoW = 181.6, cartaoY = Math.max(89.5, infoFim + 8);
  const desenharCorpo = (d: jsPDF, y0: number): number => {
    let y = y0 + 12;
    // faixinhas da marca + título do bloco
    const xs = [24.8, 31.2, 37.6, 44, 50.4];
    xs.forEach((x, i) => faixa(d, x, y, 5.2, 4.3, 1.8, mistura(V_ROXO, V_VERDE, i / 5)));
    faixa(d, 56.8, y, 10.5, 4.3, 1.8, V_VERDE);
    y += 11;
    d.setFont("helvetica", "bold"); d.setFontSize(13); d.setTextColor(...V_NAVY);
    d.text(ehPedido ? "PEDIDO CARBOVAPT" : "ORÇAMENTO CARBOVAPT", 24.8, y);
    y += 6;
    const tracejado = (yy: number) => {
      d.setDrawColor(...mistura(V_VERDE, [255, 255, 255], 0.35)); d.setLineWidth(0.25);
      d.setLineDashPattern([0.8, 0.8], 0); d.line(20.6, yy, 189.5, yy); d.setLineDashPattern([], 0);
    };
    tracejado(y);
    autoTable(d, {
      startY: y + 4,
      head: [["Item", "Qtd.", "Valor Unit.", "Valor Total"]],
      body: corpo,
      foot: rodapeTabela,
      showFoot: "lastPage",
      theme: "plain",
      margin: { left: 24.8, right: 20.5 },
      styles: { font: "helvetica", fontSize: 8.5, textColor: V_NAVY, cellPadding: { top: 2.6, bottom: 2.6, left: 1.6, right: 1.6 }, valign: "top" },
      headStyles: { fontStyle: "bolditalic", fontSize: 8, textColor: V_NAVY },
      footStyles: { fontStyle: "bold", textColor: V_NAVY },
      columnStyles: { 0: { cellWidth: 41 }, 1: { cellWidth: 50 }, 2: { cellWidth: 46 } },
      didDrawCell: (data: any) => {
        if (data.section !== "body" || data.column.index !== 2) return;
        const txt = risco[data.row.index];
        if (!txt) return;
        const larg = d.getTextWidth(txt);
        const x0 = data.cell.x + data.cell.padding("left");
        const altLinha = (data.cell.styles.fontSize * d.getLineHeightFactor()) / d.internal.scaleFactor;
        const ym = data.cell.y + data.cell.padding("top") + altLinha / 2;
        d.setDrawColor(...V_NAVY); d.setLineWidth(0.3);
        d.line(x0, ym, x0 + larg, ym);
      },
    });
    y = (d as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 4;
    tracejado(y);
    y += 10;
    // Texto da proposta à esquerda · valor grande à direita
    d.setFont("helvetica", "normal"); d.setFontSize(8); d.setTextColor(...V_TEXTO);
    const txt = d.splitTextToSize(textoDaProposta(itens), 66);
    d.text(txt, 27.6, y, { align: "justify", maxWidth: 66 });
    const fimTexto = y + txt.length * 3.5;
    d.setFont("helvetica", "bold"); d.setFontSize(25); d.setTextColor(...V_VERDE);
    d.text(brl(total), 178, y + 11, { align: "right" });
    d.setFont("helvetica", "normal"); d.setFontSize(8); d.setTextColor(...V_TEXTO);
    const pag = order.payment_terms ? `Pagamento: ${order.payment_terms}` : "No boleto ou via cartão de crédito";
    const pagL = d.splitTextToSize(pag, 50);
    d.text(pagL, 178, y + 16.5, { align: "right" });
    y = Math.max(fimTexto, y + 16.5 + pagL.length * 3.5);
    if (order.notes) {
      y += 5;
      d.setFont("helvetica", "bold"); d.setFontSize(8); d.setTextColor(...V_NAVY);
      d.text("Observações", 27.6, y);
      d.setFont("helvetica", "normal"); d.setFontSize(7.5); d.setTextColor(...V_TEXTO);
      const nl = d.splitTextToSize(order.notes, 150);
      d.text(nl, 27.6, y + 4);
      y += 4 + nl.length * 3.3;
    }
    return y + 10;
  };
  const rascunho = new jsPDF();
  const cartaoFim = Math.max(250, desenharCorpo(rascunho, cartaoY));
  doc.setFillColor(...V_CARTAO);
  doc.roundedRect(cartaoX, cartaoY, cartaoW, cartaoFim - cartaoY, 4, 4, "F");
  // Marca d'água vertical à direita: no modelo ela passa POR CIMA do cartão
  // (cinza-claro), então vem depois do fundo e antes do texto.
  if (marca) {
    const h = 277, w = h * (marca.MARCA_DAGUA.w / marca.MARCA_DAGUA.h);
    // No modelo ela é bem apagada — cheia, ela competia com a tabela.
    doc.saveGraphicsState();
    doc.setGState(new (doc as unknown as { GState: new (o: { opacity: number }) => unknown }).GState({ opacity: 0.45 }) as never);
    doc.addImage(marca.MARCA_DAGUA.src, "PNG", pageW - w - 3, 10, w, h);
    doc.restoreGraphicsState();
  }
  desenharCorpo(doc, cartaoY);

  // ── Rodapé: contatos e as faixas inclinadas ────────────────────────────────
  // Se o cartão passou do lugar do rodapé (proposta com muitas linhas), o
  // rodapé vai para uma página nova em vez de cair por cima da tabela.
  if (doc.getNumberOfPages() > 1 || cartaoFim > 258) doc.addPage();
  const contatos: [keyof typeof CONTATO_VAPT, string][] = [
    ["telefone", CONTATO_VAPT.telefone], ["email", CONTATO_VAPT.email],
    ["site", CONTATO_VAPT.site], ["instagram", CONTATO_VAPT.instagram],
  ];
  doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(...V_NAVY);
  contatos.forEach(([k, v], i) => {
    const y = 263 + i * 6.9;
    if (marca) doc.addImage(marca.ICONES[k], "PNG", 14.6, y - 2.6, 3.3, 3.3);
    doc.text(v, 19.2, y);
  });
  for (let i = 0; i < 6; i++) {
    faixa(doc, 71.4 + i * 22.2, 261, i === 5 ? 30 : 18, 24, 4.8, mistura(V_ROXO, V_VERDE, i / 5));
  }
  doc.setFontSize(6); doc.setTextColor(150);
  doc.text(
    ehPedido
      ? "Este documento é um pedido e não possui valor fiscal. O documento fiscal é a nota fiscal."
      : "Este documento é um orçamento e não possui valor fiscal. Valores sujeitos a confirmação.",
    14.6, 292,
  );

  const filename = `${ehPedido ? "pedido" : "proposta"}-carbovapt-${order.order_number || "carbo"}.pdf`;
  if (opts?.download !== false) doc.save(filename);
  const base64 = doc.output("datauristring").split(",")[1] ?? "";
  return { filename, base64 };
}

export async function generateQuotePdf(order: QuotePdfData, opts?: { download?: boolean }) {
  // ⭐ Venda de SERVIÇO (CarboVAPT) sai na identidade da CarboVAPT — o modelo da
  // proposta comercial da Canva (21/10/2026). Produto (CarboZé) segue aqui.
  if (ehPropostaCarbovapt(order)) return gerarPropostaCarbovapt(order, opts);

  const doc = new jsPDF();
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const M = 14;

  // ── Cabeçalho: faixa da identidade Grupo Carbo (igual ao modelo de referência) ─
  // Faixa verde floresta full-width, marca BRANCA à esquerda, caixa "ORÇAMENTO"
  // lima à direita e a linha da empresa na base; fios de acento LIMA no topo/base.
  const GREEN_SOFT: [number, number, number] = [205, 224, 214];
  const BAND_H = 30;

  const ehPedido = !!order.status && order.status !== "quote";
  const created = dateBR(order.created_at);
  const validity = order.validityDays ?? 7;
  const validUntilDate = new Date(order.created_at ? new Date(order.created_at) : new Date());
  validUntilDate.setDate(validUntilDate.getDate() + validity);
  const validUntil = validUntilDate.toLocaleDateString("pt-BR");

  doc.setFillColor(...GREEN); doc.rect(0, 0, pageW, BAND_H, "F");
  doc.setFillColor(...LIME);
  doc.rect(0, 0, pageW, 1.8, "F");
  doc.rect(0, BAND_H - 1.5, pageW, 1.5, "F");

  // Marca: logo Grupo Carbo em BRANCO, grande e sem margem (preenche a faixa).
  const logo = await loadImage(logoUrl, true);
  if (logo) {
    let lh = 11.5;
    let lw = lh * (logo.w / logo.h);
    const maxLw = 78;
    if (lw > maxLw) { lh = lh * (maxLw / lw); lw = maxLw; }
    doc.addImage(logo.dataUrl, "PNG", M, 5.5, lw, lh);
  } else {
    doc.setFont("helvetica", "bold"); doc.setFontSize(23); doc.setTextColor(255);
    doc.text("GRUPO CARBO", M, 16);
  }

  // Caixa "ORÇAMENTO" à direita (LIMA, texto verde): Nº + datas DENTRO do balão.
  const boxW = 60, boxH = 20, boxX = pageW - M - boxW, boxY = 4;
  doc.setFillColor(...LIME); doc.roundedRect(boxX, boxY, boxW, boxH, 2, 2, "F");
  doc.setTextColor(...GREEN); doc.setFont("helvetica", "bold"); doc.setFontSize(13);
  doc.text(ehPedido ? "PEDIDO" : "ORÇAMENTO", boxX + boxW / 2, boxY + 6.8, { align: "center" });
  doc.setFont("helvetica", "normal"); doc.setFontSize(7.5);
  if (order.order_number) doc.text(`Nº ${order.order_number}`, boxX + boxW / 2, boxY + 11.4, { align: "center" });
  doc.text(`Emissão: ${created}`, boxX + boxW / 2, boxY + 15.2, { align: "center" });
  // Validade é de PROPOSTA: pedido fechado não "vence".
  if (!ehPedido) doc.text(`Válido até: ${validUntil}`, boxX + boxW / 2, boxY + 18.4, { align: "center" });

  // Linha da empresa (branco suave) na base da faixa.
  doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.setTextColor(...GREEN_SOFT);
  doc.text(`${COMPANY.name}  ·  CNPJ ${COMPANY.cnpj}`, M, BAND_H - 8);
  doc.text(`${COMPANY.endereco} · ${COMPANY.cidade} · ${COMPANY.telefone}`, M, BAND_H - 4);
  doc.setTextColor(0); doc.setLineWidth(0.2);

  // Início do conteúdo abaixo da faixa.
  let y = BAND_H + 9;

  // ── Blocos do comprador (2 colunas) ────────────────────────────────────────
  const colGap = 6;
  const colW = (pageW - M * 2 - colGap) / 2;
  const leftX = M;
  const rightX = M + colW + colGap;

  const blockHeader = (x: number, yy: number, title: string) => {
    doc.setFillColor(...GREEN); doc.rect(x, yy, colW, 6, "F");
    doc.setTextColor(255); doc.setFont("helvetica", "bold"); doc.setFontSize(8);
    doc.text(title, x + 3, yy + 4.1);
    doc.setTextColor(0);
  };

  // Esquerda: dados do cliente
  blockHeader(leftX, y, "DADOS DO CLIENTE");
  let ly = y + 11;
  const clienteFields: [string, string][] = [
    ["Nome / Razão Social", order.customer_name || order.legal_name || "—"],
    ["CNPJ / CPF", order.cnpj || "—"],
    ["Inscrição Estadual", order.ie || "—"],
    ["Vendedor", order.vendedor_name || "—"],
  ];
  clienteFields.forEach(([label, val]) => {
    doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.setTextColor(140);
    doc.text(label, leftX + 3, ly);
    doc.setFont("helvetica", "bold"); doc.setFontSize(9.5); doc.setTextColor(20);
    doc.text(doc.splitTextToSize(String(val), colW - 6), leftX + 3, ly + 4.2);
    ly += 10.5;
  });

  // Direita: endereço de entrega (+ faturamento se diferente)
  blockHeader(rightX, y, "ENDEREÇO DE ENTREGA");
  let ry = y + 11;
  const entrega = fmtAddrLines(order.endereco);
  doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(40);
  (entrega.length ? entrega : ["—"]).forEach((l) => { doc.text(l, rightX + 3, ry); ry += 4.6; });
  ry += 3;

  const fat = fmtAddrLines(order.endereco_faturamento);
  if (order.endereco_faturamento && fat.length) {
    blockHeader(rightX, ry, "ENDEREÇO DE FATURAMENTO");
    ry += 11;
    doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(40);
    fat.forEach((l) => { doc.text(l, rightX + 3, ry); ry += 4.6; });
  } else {
    doc.setFont("helvetica", "italic"); doc.setFontSize(7.5); doc.setTextColor(150);
    doc.text("Faturamento: mesmo endereço da entrega", rightX + 3, ry);
    ry += 4;
  }
  doc.setTextColor(0); doc.setFont("helvetica", "normal");

  // ── Itens ──────────────────────────────────────────────────────────────────
  y = Math.max(ly, ry) + 4;
  const items = (Array.isArray(order.items) ? order.items : []) as QuoteItem[];
  const visiveis = items.filter((it) => (it.name || it.product_code) && (it.quantity ?? 0) > 0);
  // A base do rateio é só o que é cobrado. Ver o comentário em QuoteItem.
  const pagos = visiveis.filter((it) => !it.is_bonificacao);
  const bonificados = visiveis.filter((it) => it.is_bonificacao);

  /* ── O desconto, linha a linha ──────────────────────────────────────────
   *
   * ⭐ DOIS modos, e o primeiro é o certo quando o dado existe:
   *
   *   POR ITEM   o desconto vem de `discount_amount` de cada linha — é
   *              exatamente o que o vendedor digitou e o que a tela mostra.
   *   RATEIO     só quando as linhas NÃO trazem desconto (histórico antigo):
   *              distribui o desconto do pedido na proporção do valor.
   *
   * ⚠️ O rateio era o único modo, e mentia em pedido com desconto em UM item:
   * medido no V2026090056 — R$ 416,00 dados só no CarboZé 100ml apareciam no
   * papel como R$ 230,40 no 1 Litro e R$ 185,60 no 100ml. O total fechava e a
   * realidade não, e o cliente lê o papel, não o total.
   *
   * ⚠️ O rateio NÃO foi removido: pedido antigo tem desconto só no cabeçalho, e
   * sem ele o PDF do histórico mostraria linhas sem desconto e um total com
   * desconto — que é o defeito oposto, e pior.
   *
   * ⚠️ A escolha é por CONFERÊNCIA, não por confiança: só usa o modo por item
   * se a soma dos descontos das linhas fechar com o desconto do pedido. Se
   * discordarem, o rateio volta — linha que não soma com o rodapé é orçamento
   * que volta para o vendedor explicar.
   *
   * ⚠️ O que se arredonda é o UNITÁRIO, não o total da linha. Distribuindo
   * pelo total, o "Unit. c/ desc." vinha de uma divisão e não fechava com a
   * própria linha: R$ 133,68 × 10 dá 1.336,80, mas o total impresso era
   * 1.336,78 — dois centavos que o cliente acha com a calculadora do celular
   * e devolve para o vendedor explicar. Arredondando o unitário primeiro,
   * unitário × qtd fecha EXATO em toda linha.
   *
   * Sobra centavo, e ele TEM de cair em algum lugar: o desconto da linha é
   * sempre um múltiplo da quantidade (em centavos), então nem todo desconto de
   * pedido é alcançável mantendo todas as linhas exatas — com qtds 10, 6 e 4,
   * por exemplo, só se chega a valores pares. Não é arredondamento mal feito,
   * é aritmética.
   *
   * Então a sobra vai para UMA linha, e essa linha é a de MENOR quantidade:
   * o erro máximo é (qtd − 1) centavos, e some de vez quando existe um item de
   * 1 unidade. As demais fecham exato, e a soma dos descontos bate com o do
   * pedido — orçamento cujas linhas não fecham com o total é orçamento que
   * volta para o vendedor explicar.
   */
  const descontoPedido = Number(order.discount ?? 0);
  const { temDesconto, descUnit, descLinha } = descontosPorLinha(pagos, descontoPedido);

  // Quais linhas do corpo levam preço riscado — o índice muda por causa das
  // linhas de bonificação, que entram no meio e não têm desconto.
  const riscar: boolean[] = [];
  const body: string[][] = [];

  pagos.forEach((it, i) => {
    const qty = it.quantity ?? 0;
    const unit = it.unit_price ?? 0;
    const bonus = it.bonus_quantity ?? 0;
    const nomeBase = it.name || it.product_code || "—";
    const nome = it.descricao?.trim() ? `${nomeBase}\n${it.descricao.trim()}` : nomeBase;
    const bruto = qty * unit;

    if (temDesconto) {
      const d = descLinha[i];
      const unitCom = unit - descUnit[i];
      // ⚠️ Linha SEM desconto mostra "—", não "- R$ 0,00": num pedido com
      // desconto em um item só, escrever zero nas outras sugere que houve
      // negociação nelas e ela não pegou.
      body.push([
        nome, String(qty), brl(unit),
        d > 0 ? `- ${brl(d)}` : "—",
        d > 0 ? brl(unitCom) : brl(unit),
        brl(centavos(bruto - d)),
      ]);
      riscar.push(d > 0);
    } else {
      body.push([nome, String(qty), brl(unit), brl(bruto)]);
      riscar.push(false);
    }

    // Linha da bonificação, separada e a R$ 0,00, pra deixar claro que a qtd
    // bonificada é grátis e não faz parte da paga.
    if (bonus > 0) {
      body.push(temDesconto
        ? [`${nomeBase} (bonificação)`, String(bonus), brl(0), "—", brl(0), brl(0)]
        : [`${nomeBase} (bonificação)`, String(bonus), brl(0), brl(0)]);
      riscar.push(false);
    }
  });

  // ── Bonificação (modelo novo) ────────────────────────────────────────────
  // Vai DEPOIS dos itens pagos, e não intercalada: no modelo novo ela é uma
  // linha própria do pedido, sem dono — não existe "a bonificação da linha 2".
  //
  // ⚠️ Mostra o valor unitário CHEIO e o desconto de 100%, em vez de R$ 0,00
  // seco. É o que dá sentido comercial ao brinde: o cliente vê o tamanho do
  // que ganhou. Preço zero apagaria justamente o argumento de quem deu.
  bonificados.forEach((it) => {
    const qty = it.quantity ?? 0;
    const unit = it.unit_price ?? 0;
    const nome = it.name || it.product_code || "—";
    // ⚠️ Sem desconto no pedido (o caso do CarboVAPT com laudo) não existe a
    // coluna "Desconto" para mostrar o −100%: o preço de tabela sai riscado e
    // "Bonificado" logo abaixo, como na proposta comercial. Sem preço de
    // tabela (medição de ruído), só "Bonificado" — nada para riscar.
    // Com desconto, a coluna existe: o gêmeo de produto continua como sempre
    // foi, e o extra sem preço diz "Bonificado" em vez de "- R$ 0,00".
    body.push(temDesconto
      ? [nome, String(qty), brl(unit), unit > 0 ? `- ${brl(qty * unit)}` : "Bonificado", brl(0), brl(0)]
      : [nome, String(qty), unit > 0 ? `${brl(unit)}\nBonificado` : "Bonificado", brl(0)]);
    // ⚠️ Riscar só faz sentido quando HÁ um valor cheio para riscar. O
    // extra do CarboVAPT (laudo, medição) entra a R$ 0,00 de verdade — não
    // tem gêmeo no catálogo, não espelha preço nenhum —, e o traço sobre
    // "R$ 0,00" diria que ele ficou mais barato, que é exatamente o que o
    // comentário do `didDrawCell` abaixo já proibia para a bonificação.
    riscar.push(unit > 0);
  });

  const vazio = temDesconto ? ["Nenhum item", "", "", "", "", ""] : ["Nenhum item", "", "", ""];

  autoTable(doc, {
    startY: y,
    head: [temDesconto
      ? ["Descrição", "Qtd", "Valor Unit.", "Desconto", "Unit. c/ desc.", "Total"]
      : ["Descrição", "Qtd", "Valor Unit.", "Total"]],
    body: body.length ? body : [vazio],
    theme: "striped",
    headStyles: { fillColor: GREEN, halign: "left", fontSize: 9 },
    // ⚠️ As colunas de desconto só existem QUANDO há desconto. Um orçamento
    // sem desconto com duas colunas vazias parece formulário mal preenchido —
    // e a maioria dos orçamentos não tem desconto nenhum.
    // O tipo do autoTable exige um mapa homogêneo; o ternário produzia duas
    // formas diferentes e o TS recusava a união.
    columnStyles: (temDesconto
      ? {
          1: { halign: "center", cellWidth: 12 },
          2: { halign: "right",  cellWidth: 24, textColor: [130, 130, 130] },
          3: { halign: "right",  cellWidth: 24, textColor: GREEN as unknown as number[] },
          4: { halign: "right",  cellWidth: 26 },
          5: { halign: "right",  cellWidth: 28, fontStyle: "bold" },
        }
      : {
          1: { halign: "center", cellWidth: 20 },
          2: { halign: "right",  cellWidth: 34 },
          3: { halign: "right",  cellWidth: 34 },
        }) as Record<string, Partial<Record<string, unknown>>>,
    styles: { fontSize: 9, cellPadding: 3 },
    margin: { left: M, right: M },
    // ⚠️ O jsPDF não tem "riscado": o traço é DESENHADO sobre o texto depois
    // que a célula existe. Fica na coluna do valor cheio, e só nas linhas que
    // de fato têm desconto — riscar a bonificação (que já é R$ 0,00) seria
    // dizer que ela ficou mais barata.
    didDrawCell: (data: any) => {
      if (data.section !== "body" || data.column.index !== 2) return;
      if (!riscar[data.row.index]) return;
      // Risca só a PRIMEIRA linha da célula (o preço): na bonificação sem
      // desconto no pedido a segunda é "Bonificado", que não se risca.
      const txt = String((Array.isArray(data.cell.text) ? data.cell.text[0] : data.cell.raw) ?? "");
      if (!txt) return;
      const larg = doc.getTextWidth(txt);
      const xFim = data.cell.x + data.cell.width - data.cell.padding("right");
      // A célula é alinhada ao TOPO: o meio da primeira linha fica a meia
      // altura de linha abaixo do respiro de cima — e não no meio da célula,
      // que desce quando o nome do item quebra em duas linhas.
      const altLinha = (data.cell.styles.fontSize * doc.getLineHeightFactor()) / doc.internal.scaleFactor;
      const yMeio = data.cell.y + data.cell.padding("top") + altLinha / 2;
      doc.setDrawColor(140);
      doc.setLineWidth(0.35);
      doc.line(xFim - larg, yMeio, xFim, yMeio);
      doc.setDrawColor(0);
    },
  });

  // ── Total (com Subtotal + Desconto, quando houver) ──────────────────────────
  const afterTable = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
  const discount = Number(order.discount ?? 0);
  const subtotal = Number(order.subtotal ?? order.total ?? 0);
  const total = order.total ?? order.subtotal ?? 0;
  let ty = afterTable + 6;
  // Linhas de Subtotal e Desconto só aparecem quando há desconto (evita poluir).
  if (discount > 0) {
    doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(0);
    doc.text(`Subtotal: ${brl(subtotal)}`, pageW - M - 3, ty + 4, { align: "right" });
    ty += 5;
    const pctTxt = order.discount_percent ? ` (${order.discount_percent}%)` : "";
    doc.text(`Desconto${pctTxt}: - ${brl(discount)}`, pageW - M - 3, ty + 4, { align: "right" });
    ty += 6;
  }
  doc.setFillColor(...GREEN);
  doc.rect(pageW - M - 70, ty, 70, 9, "F");
  doc.setTextColor(255); doc.setFont("helvetica", "bold"); doc.setFontSize(11);
  doc.text(`Total: ${brl(total)}`, pageW - M - 3, ty + 6, { align: "right" });
  doc.setTextColor(0); doc.setFont("helvetica", "normal");
  ty += 9;

  // ── Pagamento ────────────────────────────────────────────────────────────────
  ty += 10;
  doc.setFillColor(...GREEN); doc.rect(M, ty, pageW - M * 2, 6, "F");
  doc.setTextColor(255); doc.setFont("helvetica", "bold"); doc.setFontSize(8);
  doc.text("PAGAMENTO", M + 3, ty + 4.1);
  doc.setTextColor(0); ty += 11;
  doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(120);
  doc.text("Formas aceitas:", M, ty);
  doc.setTextColor(40);
  doc.text(doc.splitTextToSize(FORMAS_ACEITAS, pageW - M * 2 - 30), M + 26, ty);
  ty += 6;
  doc.setFont("helvetica", "bold"); doc.setFontSize(9.5); doc.setTextColor(20);
  doc.text(`Forma escolhida: ${order.payment_terms || "—"}`, M, ty);
  doc.setTextColor(0); doc.setFont("helvetica", "normal");
  ty += 2;

  // ── Observações ──────────────────────────────────────────────────────────────
  if (order.notes) {
    ty += 10;
    doc.setFontSize(9); doc.setTextColor(90); doc.setFont("helvetica", "bold");
    doc.text("Observações", M, ty);
    doc.setFont("helvetica", "normal");
    const wrapped = doc.splitTextToSize(order.notes, pageW - M * 2);
    doc.text(wrapped, M, ty + 5);
    doc.setTextColor(0);
  }

  // ── Rodapé ───────────────────────────────────────────────────────────────────
  doc.setFontSize(8); doc.setTextColor(150);
  doc.text(
    ehPedido
      ? "Este documento é um pedido e não possui valor fiscal. O documento fiscal é a nota fiscal."
      : "Este documento é um orçamento e não possui valor fiscal. Valores sujeitos a confirmação.",
    pageW / 2, pageH - 10, { align: "center" },
  );

  const filename = `${ehPedido ? "pedido" : "orcamento"}-${order.order_number || "carbo"}.pdf`;
  if (opts?.download !== false) doc.save(filename);
  // base64 (sem o prefixo data:) — para anexar no envio por e-mail (send-email)
  const base64 = doc.output("datauristring").split(",")[1] ?? "";
  return { filename, base64 };
}
