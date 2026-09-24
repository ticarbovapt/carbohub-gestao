import jsPDF from "jspdf";
import type { NfseRow } from "@/hooks/useNfse";

// ═══════════════════════════════════════════════════════════════════════════
// PDF da NFS-e — gerado do NOSSO dado, não baixado do portal
//
// ⚠️ ESTA NÃO É A DANFSE OFICIAL, e o papel diz isso em cima. O motivo está
// medido: o DANFSE do sistema nacional não é alcançável por chave de acesso.
// Três rodadas de sonda em 24/09/2026:
//
//   adn/contribuintes/DANFSE/<chave>   404   o serviço respondeu: rota não existe
//   adn/danfse/<chave>                 503   veio do GATEWAY — nem há backend
//   sefin/sefinnacional/<qualquer>     reset connection reset by peer (mTLS ok)
//   sefin/danfse/<chave>               404   HTML de 1245 bytes…
//   www.nfse.gov.br/danfse/<chave>     404   …o MESMO HTML de 1245 bytes
//
// O tamanho idêntico nos dois 404 é o que fecha o diagnóstico: a raiz do
// `sefin` cai no mesmo front genérico do `www`. E o reset APENAS no prefixo
// `/sefinnacional/` é recusa na camada de aplicação, não caminho errado.
//
// ⚠️ A decisão foi PARAR de adivinhar endereço. Cada tentativa custava um
// deploy, e nenhuma convergia. Gerar do XML não depende de o gov.br expor
// nada e não quebra no dia em que eles mudarem a rota.
//
// ⚠️ O que se PERDE, e está escrito no papel: o layout oficial. O que NÃO se
// perde: o conteúdo — ele vem do mesmo XML assinado que é o documento fiscal.
// Para o layout oficial existe a consulta pública do portal, e por isso a tela
// também deixa COPIAR A CHAVE.
// ═══════════════════════════════════════════════════════════════════════════

const fmtBRL = (v: number | null) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })
    .format(Number(v ?? 0) || 0);
const fmtData = (s: string | null) => (s ? new Date(s).toLocaleDateString("pt-BR") : "—");

// A chave tem 50 dígitos; em bloco corrido ninguém confere. Grupos de 4 são o
// que permite ler em voz alta e bater com a tela do portal.
const chaveLegivel = (c: string | null) =>
  (c ?? "").replace(/\D/g, "").replace(/(.{4})/g, "$1 ").trim();

const doc2 = (d: string | null) => {
  const s = (d ?? "").replace(/\D/g, "");
  if (s.length === 14) return s.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  if (s.length === 11) return s.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  return d ?? "—";
};

export function gerarPdfNfse(n: NfseRow) {
  const pdf = new jsPDF({ unit: "mm", format: "a4" });
  const L = 15;              // margem esquerda
  const W = 210 - L * 2;     // largura útil
  let y = 16;

  const linha = () => { pdf.setDrawColor(200); pdf.line(L, y, L + W, y); y += 5; };
  const titulo = (t: string) => {
    pdf.setFont("helvetica", "bold"); pdf.setFontSize(9); pdf.setTextColor(90);
    pdf.text(t.toUpperCase(), L, y); y += 5;
    pdf.setTextColor(20);
  };
  const campo = (rotulo: string, valor: string, x = L, largura = W) => {
    pdf.setFont("helvetica", "normal"); pdf.setFontSize(7); pdf.setTextColor(120);
    pdf.text(rotulo, x, y);
    pdf.setFont("helvetica", "normal"); pdf.setFontSize(9); pdf.setTextColor(20);
    pdf.text(pdf.splitTextToSize(valor || "—", largura), x, y + 4);
  };

  // ── Cabeçalho ────────────────────────────────────────────────────────────
  pdf.setFont("helvetica", "bold"); pdf.setFontSize(14);
  pdf.text("NFS-e — Nota Fiscal de Serviço eletrônica", L, y); y += 6;
  pdf.setFont("helvetica", "normal"); pdf.setFontSize(8); pdf.setTextColor(120);
  pdf.text(`Nº ${n.numero ?? "—"}  ·  emitida em ${fmtData(n.emitida_em)}  ·  ${n.municipio_emissao ?? "—"}`, L, y);
  y += 5;

  // ⚠️ O aviso vai no TOPO, não no rodapé. Quem imprime e arquiva precisa
  // saber ANTES de usar como documento que este papel é uma representação
  // nossa — e rodapé é o que ninguém lê.
  pdf.setFillColor(255, 247, 230); pdf.setDrawColor(230, 190, 120);
  pdf.roundedRect(L, y, W, 11, 1.5, 1.5, "FD");
  pdf.setTextColor(120, 80, 10); pdf.setFontSize(7.5);
  pdf.text(
    "Representação gerada pelo CarboHub a partir do XML oficial recebido do Portal Nacional da NFS-e.",
    L + 3, y + 4.5);
  pdf.text(
    "NÃO é a DANFSE oficial. O documento fiscal é o XML; use a chave de acesso na consulta pública do portal.",
    L + 3, y + 8.5);
  y += 16; pdf.setTextColor(20);

  // ── Situação ─────────────────────────────────────────────────────────────
  // ⚠️ Nota cancelada tem de gritar no papel. Um PDF impresso sobrevive à
  // tela, e é justamente ele que alguém anexa a um processo meses depois.
  if (n.cancelada) {
    const sub = (n.cancelamento_tipo ?? "").toUpperCase().includes("SUBSTITU");
    pdf.setFillColor(sub ? 255 : 254, sub ? 243 : 226, sub ? 205 : 226);
    pdf.setDrawColor(sub ? 217 : 220, sub ? 150 : 60, sub ? 40 : 60);
    pdf.roundedRect(L, y, W, 9, 1.5, 1.5, "FD");
    pdf.setFont("helvetica", "bold"); pdf.setFontSize(9);
    pdf.setTextColor(sub ? 150 : 170, sub ? 90 : 30, 30);
    const txt = sub
      ? `NOTA SUBSTITUÍDA${n.substituida_por_numero ? ` PELA Nº ${n.substituida_por_numero}` : ""} em ${fmtData(n.cancelada_em)}`
      : `NOTA CANCELADA em ${fmtData(n.cancelada_em)}${n.cancelamento_motivo ? ` — ${n.cancelamento_motivo}` : ""}`;
    pdf.text(pdf.splitTextToSize(txt, W - 6), L + 3, y + 6);
    y += 14; pdf.setTextColor(20);
  }

  // ── Partes ───────────────────────────────────────────────────────────────
  titulo("Prestador do serviço");
  campo("Razão social", n.emit_nome ?? "—", L, W / 2 - 4);
  campo("CNPJ", doc2(n.emit_cnpj), L + W / 2, W / 2);
  y += 12; linha();

  titulo("Tomador do serviço");
  campo("Razão social / nome", n.toma_nome ?? "—", L, W / 2 - 4);
  campo("CNPJ / CPF", doc2(n.toma_doc), L + W / 2, W / 2);
  y += 12; linha();

  // ── Serviço ──────────────────────────────────────────────────────────────
  titulo("Serviço");
  campo("Descrição", n.descricao ?? n.servico_nacional ?? "—");
  const alturaDesc = pdf.splitTextToSize(n.descricao ?? n.servico_nacional ?? "—", W).length * 4;
  y += 6 + alturaDesc;
  campo("Item da lista nacional", n.servico_nacional ?? "—", L, W / 2 - 4);
  campo("Local da prestação", n.municipio_prestacao ?? "—", L + W / 2, W / 2);
  y += 12; linha();

  // ── Valores ──────────────────────────────────────────────────────────────
  // ⚠️ Os DOIS valores aparecem sempre, mesmo iguais. Eles divergem em 7 das
  // 697 notas (R$ 6.541,77 de retenção); mostrar um só faria a diferença sumir
  // justamente nas notas com imposto retido.
  titulo("Valores");
  campo("Valor do serviço", fmtBRL(n.valor_servico), L, 45);
  campo("Base de cálculo", fmtBRL(n.base_calculo), L + 48, 45);
  campo("Total retido", fmtBRL(n.total_retido), L + 96, 45);
  y += 12;
  pdf.setFont("helvetica", "bold"); pdf.setFontSize(12);
  pdf.text(`Valor líquido: ${fmtBRL(n.valor_liquido)}`, L, y);
  y += 8; linha();

  // ── Identificação ────────────────────────────────────────────────────────
  titulo("Chave de acesso");
  pdf.setFont("courier", "normal"); pdf.setFontSize(9);
  pdf.text(pdf.splitTextToSize(chaveLegivel(n.chave_acesso), W), L, y);
  y += 10;
  pdf.setFont("helvetica", "normal"); pdf.setFontSize(7); pdf.setTextColor(120);
  campo("Competência", fmtData(n.competencia), L, 45);
  campo("Processamento", fmtData(n.processada_em), L + 48, 45);
  campo("NSU no ADN", String(n.nsu), L + 96, 45);

  // ── Rodapé ───────────────────────────────────────────────────────────────
  pdf.setFontSize(7); pdf.setTextColor(140);
  pdf.text(
    `Gerado pelo CarboHub em ${new Date().toLocaleString("pt-BR")} · conteúdo extraído do XML oficial`,
    L, 287);

  pdf.save(`NFSe-${n.numero ?? n.nsu}.pdf`);
}
