// ─────────────────────────────────────────────────────────────────────────────
// Descarbonização — tabela única de modalidades (portes).
//
// Antes isto vivia hardcoded dentro de cada Vender.tsx, nos 5 apps. Cinco
// cópias do preço é cinco chances de divergir em silêncio.
//
// ⚠️ ESPELHO FORA DESTE REPO: carbohub-licenciados tem a MESMA tabela em
//    src/pages/Sales/NewSalePage.tsx (PRECOS / PORTES_BY_FUEL / FRASCOS).
//    Mudou o preço aqui, mude lá — não há como um repo importar do outro.
// ─────────────────────────────────────────────────────────────────────────────

export type DescarbPorte = "P" | "M" | "G";
export type DescarbFuel = "flex" | "diesel";

export interface DescarbModalidade {
  key: DescarbPorte;
  label: string;
  price: number;
  /** Faixa de cilindrada — a referência que o operador usa no Carbox. */
  motor: string;
  /** Combustíveis em que este porte existe (regra do Licenciados). */
  fuels: DescarbFuel[];
}

export const DESCARB_MODALIDADES: DescarbModalidade[] = [
  { key: "P", label: "Descarbonização P", price: 400,  motor: "até 2.5L",     fuels: ["flex"] },
  { key: "M", label: "Descarbonização M", price: 700,  motor: "2.6L a 3.9L",  fuels: ["flex", "diesel"] },
  { key: "G", label: "Descarbonização G", price: 1400, motor: "acima de 4.0L", fuels: ["diesel"] },
];

const byKey = (m: string) => DESCARB_MODALIDADES.find((x) => x.key === m);

/** Preço fixo do porte (0 se ainda não escolheu). */
export const modalidadePrice = (m: string): number => byKey(m)?.price ?? 0;

/** Rótulo do porte ("Descarbonização G"). */
export const modalidadeLabel = (m: string): string => byKey(m)?.label ?? "Serviço";

/**
 * Dica de motor/combustível do porte — o vendedor não vê o veículo, então
 * mostrar isso ao lado da opção é o que evita vender P para um caminhão.
 * Ex.: "acima de 4.0L · diesel".
 */
export function modalidadeHint(m: string): string {
  const mod = byKey(m);
  if (!mod) return "";
  const fuel = mod.fuels.length === 2 ? "flex ou diesel" : mod.fuels[0];
  return `${mod.motor} · ${fuel}`;
}

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
