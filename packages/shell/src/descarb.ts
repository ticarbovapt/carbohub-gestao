// ─────────────────────────────────────────────────────────────────────────────
// Descarbonização — tabela única de modalidades (portes).
//
// Antes isto vivia hardcoded dentro de cada Vender.tsx, nos 5 apps. Cinco
// cópias do preço é cinco chances de divergir em silêncio.
//
// ⚠️ ESPELHO FORA DESTE REPO: carbohub-licenciados tem a MESMA tabela em
//    src/pages/Sales/NewSalePage.tsx (PRECOS_FALLBACK / PORTES_BY_FUEL /
//    FRASCOS) e no banco (`get_price_table`). Mudou o preço aqui, mude lá —
//    não há como um repo importar do outro.
//
// ⭐ DUAS CATEGORIAS desde o comunicado de 09/10/2026: leves e caminhonetes
// R$ 700, pesados R$ 1.400. O Licenciados mudou em 13/10 (#179); o Sales
// seguiu em 21/10/2026.
//
// ⚠️ As LETRAS continuam (P/M/G), e não é resto: são o `porte` da vaga na OS
// (`licenciados.os_create_from_sale`, enum `vehicle_porte`), e é por elas que
// o Licenciados decide frascos de reagente e estoque. Por isso:
//   - leve é vendido como **M**: o Sales não sabe o combustível, e M é o
//     porte que existe no flex E no diesel — quem executa escolhe na OS.
//   - **P** saiu da lista, mas continua sendo LIDO (pedido/orçamento antigo)
//     como leve, a R$ 700 — o mesmo que o Licenciados faz. `porteVendavel`
//     troca P por M ao reabrir um orçamento.
// ─────────────────────────────────────────────────────────────────────────────

export type DescarbPorte = "P" | "M" | "G";
export type DescarbFuel = "flex" | "diesel";

export interface DescarbModalidade {
  key: DescarbPorte;
  /** O que aparece na escolha ("Veículos leves e caminhonetes"). */
  label: string;
  /** O nome da LINHA do pedido e do orçamento. */
  itemName: string;
  price: number;
  /** Combustíveis em que este porte existe (regra do Licenciados). */
  fuels: DescarbFuel[];
}

/** As categorias que se VENDEM hoje. */
export const DESCARB_MODALIDADES: DescarbModalidade[] = [
  { key: "M", label: "Veículos leves e caminhonetes", itemName: "Descarbonização CarboVAPT - Leves e caminhonetes", price: 700,  fuels: ["flex", "diesel"] },
  { key: "G", label: "Veículos pesados",              itemName: "Descarbonização CarboVAPT - Pesados",              price: 1400, fuels: ["diesel"] },
];

/** O porte antigo P é leve, como no Licenciados. */
export const porteVendavel = (m: string): string => (m === "P" ? "M" : m);

const byKey = (m: string) => DESCARB_MODALIDADES.find((x) => x.key === porteVendavel(m));

/** Preço fixo da categoria (0 se ainda não escolheu). */
export const modalidadePrice = (m: string): number => byKey(m)?.price ?? 0;

/** Nome da linha do pedido ("Descarbonização CarboVAPT - Pesados"). */
export const modalidadeLabel = (m: string): string => byKey(m)?.itemName ?? "Serviço";

/** Categoria por extenso ("Veículos pesados"), para dica e telas. */
export const categoriaLabel = (m: string): string => byKey(m)?.label ?? "";

/** @deprecated sem faixa de motor desde as duas categorias; devolve a categoria. */
export function modalidadeHint(m: string): string {
  return categoriaLabel(m);
}

// ── Serviços que ACOMPANHAM a descarbonização ────────────────────────────────
// Pedido do dono do processo em 29/09/2026: itens que podem ou não ir junto,
// que NÃO alteram o valor e existem para ficar DESCRITOS no orçamento — o
// cliente precisa ler no papel o que está ganhando.
//
// ⚠️ Eles são BONIFICAÇÃO a R$ 0,00, nunca item de catálogo: não têm gêmeo em
// `mrp_products`, não movem estoque e não viram vaga de veículo na OS. São
// serviço prestado junto, e é só isso.
//
// ⚠️ Mora AQUI, ao lado de `DESCARB_MODALIDADES`, e não numa tabela do banco —
// de propósito. A tabela de preços dos portes já é código; pôr um dos dois em
// cadastro e o outro em código criaria o par que diverge, e esta lista é a
// mesma nos sete apps pelo mesmo motivo que aquela. Preço é o que muda sozinho;
// isto não. O custo assumido: item novo aqui pede deploy.
//
// ⚠️ SEMPRE bonificados (dono do processo, 21/10/2026). `price` é o preço de
// TABELA, que o orçamento mostra RISCADO ao lado de "Bonificado" — é o que
// mostra ao cliente o tamanho do que ele ganha, igual ao gêmeo de bonificação
// dos produtos. Ele NUNCA entra no total, no subtotal nem no desconto do
// pedido. Zero = sem preço de tabela: sai só "Bonificado", sem nada riscado.
// A quantidade nasce = número de veículos (um laudo por veículo).
export interface DescarbExtra {
  key: string;
  label: string;
  price: number;
}

export const DESCARB_EXTRAS: DescarbExtra[] = [
  { key: "opacidade", label: "Laudo de Opacidade (Opacímetro)",  price: 200 },
  { key: "ruido",     label: "Medição de Ruído (Decibelímetro)", price: 0 },
];

/** Preço de tabela do extra (0 se não tem, ou se a chave saiu da lista). */
export const extraPrice = (k: string): number =>
  DESCARB_EXTRAS.find((x) => x.key === k)?.price ?? 0;

/** Rótulo do extra. ⚠️ Chave desconhecida devolve `null`, NUNCA a própria
 *  chave: orçamento antigo com um extra que saiu da lista mostraria
 *  `"opacidade"` cru no papel do cliente. Ausência tem de aparecer como
 *  ausência — quem chama decide o que fazer com ela. */
export const extraLabel = (k: string): string | null =>
  DESCARB_EXTRAS.find((x) => x.key === k)?.label ?? null;

// ── Tipo de serviço da OS ────────────────────────────────────────────────────
// Espelha licenciados.os_service_type. Frota EXIGE agendamento (a RPC recusa
// sem scheduled_at), por isso o formulário precisa saber disto.
export type DescarbServiceType = "b2c" | "b2b" | "frota";

export const DESCARB_SERVICE_TYPES: {
  key: DescarbServiceType; label: string; hint: string;
}[] = [
  { key: "b2c",   label: "B2C",   hint: "Pessoa física" },
  { key: "b2b",   label: "B2B",   hint: "Empresa" },
  { key: "frota", label: "Frota", hint: "Empresa, vários veículos · exige data" },
];

/** Palpite inicial pelo documento: CNPJ → empresa, CPF → pessoa física. */
export const servicoPadraoPorDoc = (doc: string): DescarbServiceType =>
  doc.replace(/\D/g, "").length > 11 ? "b2b" : "b2c";

// ── Itens enviados à RPC licenciados.os_create_from_sale ─────────────────────
/** Uma linha vendida: gera `qty + bonus` vagas de veículo na OS. */
export interface DescarbItemRpc {
  porte: DescarbPorte | string;
  qty: number;
  bonus: number;
}

/** Quantos veículos a venda vai gerar (pagos + bonificados). */
export const totalVagas = (itens: DescarbItemRpc[]): number =>
  itens.reduce((s, i) => s + Math.max(0, i.qty) + Math.max(0, i.bonus), 0);
