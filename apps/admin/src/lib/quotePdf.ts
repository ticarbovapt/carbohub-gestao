import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import logoUrl from "@/assets/logo-grupo-carbo.png";

// Orçamento em PDF com a identidade do Grupo Carbo.
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
  /** Modelo NOVO: a linha inteira é bonificação — o "gêmeo" do catálogo,
   *  entregue de graça a 100% de desconto.
   *  ⚠️ Ela NÃO entra na base de rateio do desconto do pedido: já é grátis, e
   *  mantê-la na base encolheria o fator de desconto, fazendo todas as outras
   *  linhas receberem desconto a menos e o total deixar de fechar. */
  is_bonificacao?: boolean;
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

export async function generateQuotePdf(order: QuotePdfData, opts?: { download?: boolean }) {
  const doc = new jsPDF();
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const M = 14;

  // ── Cabeçalho: faixa da identidade Grupo Carbo (igual ao modelo de referência) ─
  // Faixa verde floresta full-width, marca BRANCA à esquerda, caixa "ORÇAMENTO"
  // lima à direita e a linha da empresa na base; fios de acento LIMA no topo/base.
  const GREEN_SOFT: [number, number, number] = [205, 224, 214];
  const BAND_H = 30;

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
  doc.text("ORÇAMENTO", boxX + boxW / 2, boxY + 6.8, { align: "center" });
  doc.setFont("helvetica", "normal"); doc.setFontSize(7.5);
  if (order.order_number) doc.text(`Nº ${order.order_number}`, boxX + boxW / 2, boxY + 11.4, { align: "center" });
  doc.text(`Emissão: ${created}`, boxX + boxW / 2, boxY + 15.2, { align: "center" });
  doc.text(`Válido até: ${validUntil}`, boxX + boxW / 2, boxY + 18.4, { align: "center" });

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
   * O desconto é do PEDIDO, não do item — `QuoteItem` não tem campo de
   * desconto. Para mostrá-lo por produto ele é distribuído na proporção do
   * valor de cada linha, que é a única divisão defensável: quem pesa mais no
   * pedido absorve mais desconto.
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
  const brutoTotal = pagos.reduce((s, it) => s + (it.quantity ?? 0) * (it.unit_price ?? 0), 0);
  const temDesconto = descontoPedido > 0 && brutoTotal > 0;

  const centavos = (n: number) => Math.round(n * 100) / 100;
  const descUnit: number[] = [];   // desconto de UMA unidade, já em centavos redondos
  const descLinha: number[] = [];  // desconto da linha inteira
  if (temDesconto) {
    const fator = descontoPedido / brutoTotal;
    pagos.forEach((it) => {
      const du = Math.min(it.unit_price ?? 0, centavos((it.unit_price ?? 0) * fator));
      descUnit.push(du);                                   // nunca abaixo de zero
      descLinha.push(centavos(du * (it.quantity ?? 0)));
    });
    // A linha que absorve a sobra: a de menor quantidade.
    let absorve = 0;
    pagos.forEach((it, i) => {
      if ((it.quantity ?? 0) < (pagos[absorve].quantity ?? 0)) absorve = i;
    });
    const sobra = centavos(descontoPedido - descLinha.reduce((s, d) => s + d, 0));
    const bruto = (pagos[absorve].quantity ?? 0) * (pagos[absorve].unit_price ?? 0);
    descLinha[absorve] = Math.min(bruto, Math.max(0, centavos(descLinha[absorve] + sobra)));
  }

  // Quais linhas do corpo levam preço riscado — o índice muda por causa das
  // linhas de bonificação, que entram no meio e não têm desconto.
  const riscar: boolean[] = [];
  const body: string[][] = [];

  pagos.forEach((it, i) => {
    const qty = it.quantity ?? 0;
    const unit = it.unit_price ?? 0;
    const bonus = it.bonus_quantity ?? 0;
    const nome = it.name || it.product_code || "—";
    const bruto = qty * unit;

    if (temDesconto) {
      const d = descLinha[i];
      const unitCom = unit - descUnit[i];
      body.push([nome, String(qty), brl(unit), `- ${brl(d)}`, brl(unitCom), brl(centavos(bruto - d))]);
      riscar.push(d > 0);
    } else {
      body.push([nome, String(qty), brl(unit), brl(bruto)]);
      riscar.push(false);
    }

    // Linha da bonificação, separada e a R$ 0,00, pra deixar claro que a qtd
    // bonificada é grátis e não faz parte da paga.
    if (bonus > 0) {
      body.push(temDesconto
        ? [`${nome} (bonificação)`, String(bonus), brl(0), "—", brl(0), brl(0)]
        : [`${nome} (bonificação)`, String(bonus), brl(0), brl(0)]);
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
    body.push(temDesconto
      ? [nome, String(qty), brl(unit), `- ${brl(qty * unit)}`, brl(0), brl(0)]
      : [nome, String(qty), brl(unit), brl(0)]);
    riscar.push(true);
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
      if (!temDesconto) return;
      if (data.section !== "body" || data.column.index !== 2) return;
      if (!riscar[data.row.index]) return;
      const txt = String(data.cell.raw ?? "");
      if (!txt) return;
      const larg = doc.getTextWidth(txt);
      const xFim = data.cell.x + data.cell.width - data.cell.padding("right");
      const yMeio = data.cell.y + data.cell.height / 2;
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
    "Este documento é um orçamento e não possui valor fiscal. Valores sujeitos a confirmação.",
    pageW / 2, pageH - 10, { align: "center" },
  );

  const filename = `orcamento-${order.order_number || "carbo"}.pdf`;
  if (opts?.download !== false) doc.save(filename);
  // base64 (sem o prefixo data:) — para anexar no envio por e-mail (send-email)
  const base64 = doc.output("datauristring").split(",")[1] ?? "";
  return { filename, base64 };
}
