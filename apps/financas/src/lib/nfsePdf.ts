import jsPDF from "jspdf";
import type { NfseRow } from "@/hooks/useNfse";

// ═══════════════════════════════════════════════════════════════════════════
// Documento Auxiliar da NFS-e — gerado do XML que já está guardado
//
// ⚠️ POR QUE NÃO BAIXAMOS O OFICIAL: o DANFSE do sistema nacional não é
// alcançável por chave de acesso. Três rodadas de sonda em 24/09/2026:
//
//   adn/contribuintes/DANFSE/<chave>   404    o serviço respondeu: rota não existe
//   adn/danfse/<chave>                 503    do GATEWAY — nem há backend no prefixo
//   sefin/sefinnacional/<qualquer>     reset  connection reset by peer (mTLS ok)
//   sefin/danfse/<chave>               404    HTML de 1245 bytes…
//   www.nfse.gov.br/danfse/<chave>     404    …o MESMO HTML de 1245 bytes
//
// O tamanho IDÊNTICO nos dois 404 fecha o diagnóstico: a raiz do `sefin` cai no
// mesmo front genérico do `www`. Parar de adivinhar endereço foi a decisão.
//
// ⚠️ ESTE LAYOUT IMITA A DANFSE v2.0 DE PROPÓSITO. O dono do processo mandou a
// oficial ao lado da minha primeira versão, e a comparação matou duas coisas:
//
//   1. A tarja âmbar de aviso — *"ta um lixo mt tosco"*. Ela estava certa no
//      conteúdo e péssima na execução. O aviso continua, numa linha discreta do
//      cabeçalho, como o próprio oficial faz com "DANFSe v2.0".
//   2. O formulário espaçado. O oficial é uma GRADE densa, e é assim que quem
//      confere está acostumado a ler.
//
// ⚠️ E havia um DEFEITO de verdade no meu: o texto longo do item da lista
// nacional transbordava e escrevia POR CIMA da seção de valores. A causa era
// avançar `y` por um valor fixo depois de um texto de altura variável. Aqui
// toda escrita devolve a altura que consumiu, e o `y` anda por ela.
// ═══════════════════════════════════════════════════════════════════════════

const fmtBRL = (v: unknown) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })
    .format(Number(v ?? 0) || 0);
const fmtData = (s: string | null) => (s ? new Date(s).toLocaleDateString("pt-BR") : "—");
const fmtDataHora = (s: string | null) =>
  s ? new Date(s).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "medium" }) : "—";
const vazio = (s: unknown) => {
  const t = (s ?? "").toString().trim();
  return t === "" ? "-" : t;
};

const doc2 = (d: string | null) => {
  const s = (d ?? "").replace(/\D/g, "");
  if (s.length === 14) return s.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  if (s.length === 11) return s.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  return vazio(d);
};
const cep = (c: string | null) => {
  const s = (c ?? "").replace(/\D/g, "");
  return s.length === 8 ? s.replace(/(\d{5})(\d{3})/, "$1-$2") : vazio(c);
};
const endereco = (l: string | null, n: string | null, c: string | null, b: string | null) =>
  vazio([[l, n].filter(Boolean).join(", "), c, b].filter(Boolean).join(" - "));

export function gerarPdfNfse(n: NfseRow) {
  const pdf = new jsPDF({ unit: "mm", format: "a4" });
  const L = 10, R = 200, W = R - L;
  let y = 10;

  const cinza = () => { pdf.setFillColor(232, 232, 232); };
  const borda = () => { pdf.setDrawColor(130); pdf.setLineWidth(0.2); };

  // Faixa de título de seção — o mesmo recurso visual do oficial.
  const secao = (t: string) => {
    borda(); cinza();
    pdf.rect(L, y, W, 5, "FD");
    pdf.setFont("helvetica", "bold"); pdf.setFontSize(7.5); pdf.setTextColor(30);
    pdf.text(t.toUpperCase(), L + 1.5, y + 3.5);
    y += 5;
  };

  // Escreve rótulo pequeno + valor, dentro de uma célula de largura fixa, e
  // DEVOLVE a altura consumida. ⚠️ É esta devolução que impede o
  // transbordamento: quem chama avança `y` pela maior altura da linha, nunca
  // por um número escolhido a olho.
  const celula = (x: number, larg: number, rotulo: string, valor: string, topo: number) => {
    pdf.setFont("helvetica", "normal"); pdf.setFontSize(5.8); pdf.setTextColor(105);
    pdf.text(rotulo.toUpperCase(), x + 1.5, topo + 3);
    pdf.setFontSize(7.5); pdf.setTextColor(20);
    const linhas = pdf.splitTextToSize(valor || "-", larg - 3);
    pdf.text(linhas, x + 1.5, topo + 6.6);
    return 4.2 + linhas.length * 3.2;
  };

  // Uma linha da grade: N células de larguras proporcionais, com moldura.
  const linha = (celulas: Array<[string, string]>, pesos?: number[]) => {
    const p = pesos ?? celulas.map(() => 1);
    const soma = p.reduce((a, b) => a + b, 0);
    let x = L;
    let alt = 0;
    const larguras = p.map((w) => (W * w) / soma);
    celulas.forEach(([rot, val], i) => {
      alt = Math.max(alt, celula(x, larguras[i], rot, val, y));
      x += larguras[i];
    });
    alt = Math.max(alt, 8);
    borda();
    pdf.rect(L, y, W, alt);
    // Divisórias internas: sem elas a grade vira texto solto.
    let dx = L;
    for (let i = 0; i < larguras.length - 1; i++) {
      dx += larguras[i];
      pdf.line(dx, y, dx, y + alt);
    }
    y += alt;
  };

  // ── Cabeçalho ────────────────────────────────────────────────────────────
  borda();
  pdf.rect(L, y, W, 13);
  pdf.setFont("helvetica", "bold"); pdf.setFontSize(15); pdf.setTextColor(20, 70, 130);
  pdf.text("NFS-e", L + 3, y + 8);
  pdf.setFont("helvetica", "normal"); pdf.setFontSize(5.5); pdf.setTextColor(90);
  pdf.text("Nota Fiscal de", L + 20, y + 5.5);
  pdf.text("Serviço eletrônica", L + 20, y + 8);

  pdf.setFont("helvetica", "bold"); pdf.setFontSize(10); pdf.setTextColor(20);
  pdf.text("Documento Auxiliar da NFS-e", L + W / 2, y + 5.5, { align: "center" });
  // ⚠️ O aviso vive AQUI, numa linha discreta — não numa tarja. O oficial usa
  // exatamente este espaço para "DANFSe v2.0", e é onde quem confere olha.
  pdf.setFont("helvetica", "normal"); pdf.setFontSize(6); pdf.setTextColor(120);
  pdf.text("Representação do CarboHub gerada a partir do XML oficial · não substitui a DANFSe do portal",
           L + W / 2, y + 9.5, { align: "center" });

  pdf.setFontSize(6.5); pdf.setTextColor(30);
  pdf.text(`Município: ${vazio(n.municipio_emissao)}`, R - 3, y + 5, { align: "right" });
  pdf.text(`Ambiente Gerador: ${vazio(n.ambiente_gerador)}`, R - 3, y + 8.2, { align: "right" });
  pdf.text(`Situação: ${vazio(n.situacao_codigo)}`, R - 3, y + 11.4, { align: "right" });
  y += 13;

  // ── Chave ────────────────────────────────────────────────────────────────
  borda();
  pdf.rect(L, y, W, 9);
  pdf.setFont("helvetica", "bold"); pdf.setFontSize(6); pdf.setTextColor(30);
  pdf.text("CHAVE DE ACESSO DA NFS-e", L + 1.5, y + 3.2);
  pdf.setFont("courier", "normal"); pdf.setFontSize(9); pdf.setTextColor(20);
  pdf.text(vazio(n.chave_acesso), L + 1.5, y + 7.3);
  y += 9;

  linha([
    ["Número da NFS-e", vazio(n.numero)],
    ["Competência", fmtData(n.competencia)],
    ["Data e hora da emissão", fmtDataHora(n.emitida_em)],
    ["Data e hora do processamento", fmtDataHora(n.processada_em)],
  ]);

  linha([
    ["Número da DPS", vazio(n.dps_numero)],
    ["Série da DPS", vazio(n.dps_serie)],
    ["NSU no ADN", String(n.nsu)],
    ["Versão do aplicativo", vazio(n.versao_aplicativo)],
  ]);

  // ⚠️ Cancelamento/substituição em FAIXA PRÓPRIA, e continua gritando: papel
  // impresso sobrevive à tela, e é ele que alguém anexa a um processo meses
  // depois. O que mudou foi o estilo, não a decisão.
  if (n.cancelada) {
    const sub = (n.cancelamento_tipo ?? "").toUpperCase().includes("SUBSTITU");
    borda();
    pdf.setFillColor(sub ? 253 : 252, sub ? 240 : 226, sub ? 214 : 226);
    pdf.rect(L, y, W, 7, "FD");
    pdf.setFont("helvetica", "bold"); pdf.setFontSize(8);
    pdf.setTextColor(sub ? 150 : 165, sub ? 85 : 30, 30);
    pdf.text(
      sub
        ? `NFS-e SUBSTITUÍDA${n.substituida_por_numero ? ` PELA Nº ${n.substituida_por_numero}` : ""} em ${fmtData(n.cancelada_em)}`
        : `NFS-e CANCELADA em ${fmtData(n.cancelada_em)}${n.cancelamento_motivo ? ` — ${n.cancelamento_motivo}` : ""}`,
      L + 1.5, y + 4.7);
    y += 7; pdf.setTextColor(20);
  }

  // ── Prestador ────────────────────────────────────────────────────────────
  secao("Prestador / Fornecedor");
  linha([
    ["CNPJ / CPF / NIF", doc2(n.emit_cnpj)],
    ["Inscrição municipal", vazio(n.emit_im)],
    ["Telefone", vazio(n.emit_fone)],
  ], [2, 2, 1.5]);
  linha([["Nome / Nome empresarial", vazio(n.emit_nome)], ["E-mail", vazio(n.emit_email)]], [3, 2]);
  linha([
    ["Endereço", endereco(n.emit_logradouro, n.emit_numero, n.emit_complemento, n.emit_bairro)],
    ["Município / UF", `${vazio(n.municipio_emissao)} / ${vazio(n.emit_uf)}`],
    ["Cód. IBGE / CEP", `${vazio(n.emit_municipio_ibge)} / ${cep(n.emit_cep)}`],
  ], [3, 1.5, 1.5]);

  // ── Tomador ──────────────────────────────────────────────────────────────
  secao("Tomador / Adquirente");
  linha([
    ["CNPJ / CPF / NIF", doc2(n.toma_doc)],
    ["Inscrição municipal", vazio(n.toma_im)],
    ["Telefone", vazio(n.toma_fone)],
  ], [2, 2, 1.5]);
  linha([["Nome / Nome empresarial", vazio(n.toma_nome)], ["E-mail", vazio(n.toma_email)]], [3, 2]);
  linha([
    ["Endereço", endereco(n.toma_logradouro, n.toma_numero, n.toma_complemento, n.toma_bairro)],
    ["Cód. IBGE", vazio(n.toma_municipio_ibge)],
    ["CEP", cep(n.toma_cep)],
  ], [3, 1, 1]);

  // ── Serviço ──────────────────────────────────────────────────────────────
  secao("Serviço prestado");
  linha([
    ["Cód. tributação nacional", vazio(n.serv_cod_nacional)],
    ["Cód. tributação municipal", vazio(n.serv_cod_municipal)],
    ["Código NBS", vazio(n.serv_cod_nbs)],
    ["Local da prestação", vazio(n.municipio_prestacao)],
  ]);
  // ⚠️ É AQUI que o texto transbordava: o item da lista nacional é um parágrafo
  // legal inteiro. A `linha()` mede e a moldura acompanha.
  linha([["Item da lista de serviços", vazio(n.servico_nacional)]]);
  linha([["Descrição do serviço", vazio(n.descricao)]]);

  // ── Tributação ───────────────────────────────────────────────────────────
  secao("Tributação municipal (ISSQN)");
  linha([
    ["Tipo de tributação", vazio(n.issqn_tipo)],
    ["Retenção do ISSQN", vazio(n.issqn_retencao)],
    ["Base de cálculo", fmtBRL(n.base_calculo)],
    ["Município de incidência", vazio(n.municipio_incidencia)],
  ]);

  secao("Tributação federal");
  linha([
    ["PIS", fmtBRL(n.vl_pis)],
    ["COFINS", fmtBRL(n.vl_cofins)],
    ["IRRF retido", fmtBRL(n.vl_ret_irrf)],
    ["CSLL retida", fmtBRL(n.vl_ret_csll)],
    ["Contrib. previdenciária", fmtBRL(n.vl_ret_cp)],
  ]);

  // ── Valores ──────────────────────────────────────────────────────────────
  secao("Valor total da NFS-e");
  linha([
    ["Valor do serviço", fmtBRL(n.valor_servico)],
    ["Desconto incondicionado", fmtBRL(n.desconto_incondicionado)],
    ["Desconto condicionado", fmtBRL(n.desconto_condicionado)],
    ["Total das retenções", fmtBRL(n.total_retido)],
  ]);
  borda(); cinza();
  pdf.rect(L, y, W, 10, "FD");
  pdf.setFont("helvetica", "normal"); pdf.setFontSize(5.8); pdf.setTextColor(105);
  pdf.text("VALOR LÍQUIDO DA NFS-e", L + 1.5, y + 3.2);
  pdf.setFont("helvetica", "bold"); pdf.setFontSize(13); pdf.setTextColor(20);
  pdf.text(fmtBRL(n.valor_liquido), L + 1.5, y + 8.3);
  y += 10;

  // ── Complementares ───────────────────────────────────────────────────────
  const compl = [n.info_complementar, n.outras_informacoes,
                 n.substitui_chave ? `NFS-e substituída: ${n.substitui_chave}` : null]
    .filter(Boolean).join("  ·  ");
  if (compl) {
    secao("Informações complementares");
    linha([["", compl]]);
  }

  pdf.setFont("helvetica", "normal"); pdf.setFontSize(6); pdf.setTextColor(140);
  pdf.text(
    `Gerado pelo CarboHub em ${new Date().toLocaleString("pt-BR")} · conteúdo extraído do XML assinado recebido do Portal Nacional da NFS-e · a autenticidade se confere pela chave de acesso no portal`,
    L, 289);

  pdf.save(`NFSe-${n.numero ?? n.nsu}.pdf`);
}
