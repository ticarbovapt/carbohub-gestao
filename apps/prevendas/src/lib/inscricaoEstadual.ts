// Validação de Inscrição Estadual (IE) por UF — algoritmos do SINTEGRA.
//
// O que ISTO faz (Nível A): valida o FORMATO e o DÍGITO VERIFICADOR da IE
// conforme o estado escolhido. Pega erro de digitação e número estruturalmente
// inválido. Aceita "ISENTO".
//
// O que ISTO **não** faz (Nível B): confirmar que a IE pertence à empresa do
// CNPJ ou que está ativa — isso exige consulta ao SINTEGRA/SEFAZ (API paga).
// Quando houver uma API contratada, plugar em validateIeOwnership() (stub no fim).

export interface IeValidationResult {
  valid: boolean;
  isento: boolean;
  message: string;
}

const onlyDigits = (s: string) => (s || "").replace(/\D/g, "");

// Soma ponderada + módulo 11 (helper usado pela maioria das UFs)
function mod11(digits: number[], weights: number[]): number {
  const sum = digits.reduce((acc, d, i) => acc + d * weights[i], 0);
  const r = sum % 11;
  return r < 2 ? 0 : 11 - r;
}

// Cada UF: comprimento esperado e função de validação do(s) dígito(s).
// Implementação baseada na especificação pública do SINTEGRA.
const VALIDATORS: Record<string, (ie: string) => boolean> = {
  AC: (ie) => {
    if (ie.length !== 13 || !ie.startsWith("01")) return false;
    const n = ie.split("").map(Number);
    const w1 = [4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const d1 = mod11(n.slice(0, 11), w1);
    if (d1 !== n[11]) return false;
    const w2 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    return mod11(n.slice(0, 12), w2) === n[12];
  },
  AL: (ie) => {
    if (ie.length !== 9 || !ie.startsWith("24")) return false;
    const n = ie.split("").map(Number);
    const sum = n.slice(0, 8).reduce((a, d, i) => a + d * (9 - i), 0);
    let d = (sum * 10) % 11;
    if (d === 10) d = 0;
    return d === n[8];
  },
  AP: (ie) => {
    if (ie.length !== 9 || !ie.startsWith("03")) return false;
    const n = ie.split("").map(Number);
    const num = Number(ie.slice(0, 8));
    let p = 0, d = 0;
    if (num >= 3000001 && num <= 3017000) { p = 5; d = 0; }
    else if (num >= 3017001 && num <= 3019022) { p = 9; d = 1; }
    const w = [9, 8, 7, 6, 5, 4, 3, 2];
    const sum = p + n.slice(0, 8).reduce((a, x, i) => a + x * w[i], 0);
    let r = 11 - (sum % 11);
    if (r === 11) r = 0; else if (r === 10) r = d;
    return r === n[8];
  },
  AM: (ie) => {
    if (ie.length !== 9) return false;
    const n = ie.split("").map(Number);
    const w = [9, 8, 7, 6, 5, 4, 3, 2];
    const sum = n.slice(0, 8).reduce((a, d, i) => a + d * w[i], 0);
    const d = sum < 11 ? 11 - sum : 11 - (sum % 11) === 11 ? 0 : (11 - (sum % 11)) === 10 ? 0 : 11 - (sum % 11);
    return d === n[8];
  },
  BA: (ie) => {
    if (ie.length !== 8 && ie.length !== 9) return false;
    const n = ie.split("").map(Number);
    const base = ie.length === 8 ? n.slice(0, 6) : n.slice(0, 7);
    const firstDigit = ie.length === 8 ? n[0] : n[1];
    const modBase = /[0123458]/.test(String(firstDigit)) ? 10 : 11;
    const calc = (arr: number[], w: number[]) => {
      const sum = arr.reduce((a, d, i) => a + d * w[i], 0);
      const r = sum % modBase;
      return r === 0 ? 0 : modBase - r;
    };
    if (ie.length === 8) {
      const d2 = calc(base, [7, 6, 5, 4, 3, 2]);
      const d1 = calc([...base, d2], [8, 7, 6, 5, 4, 3, 2]);
      return d2 === n[6] && d1 === n[7];
    }
    const d2 = calc(base, [8, 7, 6, 5, 4, 3, 2]);
    const d1 = calc([...base, d2], [9, 8, 7, 6, 5, 4, 3, 2]);
    return d2 === n[7] && d1 === n[8];
  },
  CE: (ie) => genericMod11(ie, 9, [9, 8, 7, 6, 5, 4, 3, 2]),
  DF: (ie) => {
    if (ie.length !== 13) return false;
    const n = ie.split("").map(Number);
    const d1 = mod11(n.slice(0, 11), [4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
    if (d1 !== n[11]) return false;
    return mod11(n.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]) === n[12];
  },
  ES: (ie) => genericMod11(ie, 9, [9, 8, 7, 6, 5, 4, 3, 2]),
  GO: (ie) => genericMod11(ie, 9, [9, 8, 7, 6, 5, 4, 3, 2]),
  MA: (ie) => ie.length === 9 && ie.startsWith("12") && genericMod11(ie, 9, [9, 8, 7, 6, 5, 4, 3, 2]),
  MT: (ie) => genericMod11(ie, 11, [3, 2, 9, 8, 7, 6, 5, 4, 3, 2]),
  MS: (ie) => ie.length === 9 && ie.startsWith("28") && genericMod11(ie, 9, [9, 8, 7, 6, 5, 4, 3, 2]),
  MG: (ie) => validateMG(ie),
  PA: (ie) => ie.length === 9 && ie.startsWith("15") && genericMod11(ie, 9, [9, 8, 7, 6, 5, 4, 3, 2]),
  PB: (ie) => genericMod11(ie, 9, [9, 8, 7, 6, 5, 4, 3, 2]),
  PR: (ie) => {
    if (ie.length !== 10) return false;
    const n = ie.split("").map(Number);
    const d1 = mod11(n.slice(0, 8), [3, 2, 7, 6, 5, 4, 3, 2]);
    if (d1 !== n[8]) return false;
    return mod11(n.slice(0, 9), [4, 3, 2, 7, 6, 5, 4, 3, 2]) === n[9];
  },
  PE: (ie) => {
    if (ie.length !== 9) return false;
    const n = ie.split("").map(Number);
    const d1 = mod11(n.slice(0, 7), [8, 7, 6, 5, 4, 3, 2]);
    if (d1 !== n[7]) return false;
    return mod11(n.slice(0, 8), [9, 8, 7, 6, 5, 4, 3, 2]) === n[8];
  },
  PI: (ie) => genericMod11(ie, 9, [9, 8, 7, 6, 5, 4, 3, 2]),
  RJ: (ie) => ie.length === 8 && genericMod11(ie, 8, [2, 7, 6, 5, 4, 3, 2]),
  RN: (ie) => {
    if (ie.length !== 9 && ie.length !== 10) return false;
    if (!ie.startsWith("20")) return false;
    const n = ie.split("").map(Number);
    if (ie.length === 9) {
      const sum = n.slice(0, 8).reduce((a, d, i) => a + d * (9 - i), 0);
      let d = (sum * 10) % 11; if (d === 10) d = 0;
      return d === n[8];
    }
    const sum = n.slice(0, 9).reduce((a, d, i) => a + d * (10 - i), 0);
    let d = (sum * 10) % 11; if (d === 10) d = 0;
    return d === n[9];
  },
  RS: (ie) => {
    if (ie.length !== 10) return false;
    const n = ie.split("").map(Number);
    const w = [2, 9, 8, 7, 6, 5, 4, 3, 2];
    const sum = n.slice(0, 9).reduce((a, d, i) => a + d * w[i], 0);
    let d = 11 - (sum % 11); if (d >= 10) d = 0;
    return d === n[9];
  },
  RO: (ie) => {
    if (ie.length !== 14) return false;
    const n = ie.split("").map(Number);
    const w = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const sum = n.slice(0, 13).reduce((a, d, i) => a + d * w[i], 0);
    let d = 11 - (sum % 11); if (d >= 10) d -= 10;
    return d === n[13];
  },
  RR: (ie) => {
    if (ie.length !== 9 || !ie.startsWith("24")) return false;
    const n = ie.split("").map(Number);
    const sum = n.slice(0, 8).reduce((a, d, i) => a + d * (i + 1), 0);
    return sum % 9 === n[8];
  },
  SC: (ie) => genericMod11(ie, 9, [9, 8, 7, 6, 5, 4, 3, 2]),
  SP: (ie) => validateSP(ie),
  SE: (ie) => genericMod11(ie, 9, [9, 8, 7, 6, 5, 4, 3, 2]),
  TO: (ie) => {
    const clean = ie.length === 11 ? ie.slice(0, 2) + ie.slice(4) : ie; // remove código de segmento legado
    if (clean.length !== 9) return false;
    return genericMod11(clean, 9, [9, 8, 7, 6, 5, 4, 3, 2]);
  },
};

// Mod 11 genérico de 1 dígito (último dígito é o verificador).
function genericMod11(ie: string, len: number, weights: number[]): boolean {
  if (ie.length !== len) return false;
  const n = ie.split("").map(Number);
  const d = mod11(n.slice(0, len - 1), weights);
  return d === n[len - 1];
}

function validateMG(ie: string): boolean {
  if (ie.length !== 13) return false;
  const n = ie.split("");
  // 1º dígito: insere "0" após os 3 primeiros (município) e soma alternando 1,2
  const base = n.slice(0, 3).join("") + "0" + n.slice(3, 11).join("");
  let sum = 0;
  for (let i = 0; i < base.length; i++) {
    const prod = Number(base[i]) * (i % 2 === 0 ? 1 : 2);
    sum += prod > 9 ? prod - 9 : prod;
  }
  const d1 = (Math.ceil(sum / 10) * 10) - sum;
  if (d1 !== Number(n[11])) return false;
  // 2º dígito: mod 11 sobre os 12 primeiros
  const w = [3, 2, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2];
  const sum2 = n.slice(0, 12).reduce((a, d, i) => a + Number(d) * w[i], 0);
  let d2 = 11 - (sum2 % 11); if (d2 >= 10) d2 = 0;
  return d2 === Number(n[12]);
}

function validateSP(raw: string): boolean {
  const ie = raw.toUpperCase();
  // Produtor rural começa com "P" (12 caracteres)
  if (ie.startsWith("P")) {
    const digits = onlyDigits(ie);
    if (digits.length < 9) return false;
    const n = digits.split("").map(Number);
    const w = [1, 3, 4, 5, 6, 7, 8, 10];
    const sum = n.slice(0, 8).reduce((a, d, i) => a + d * w[i], 0);
    return (sum % 11) % 10 === n[8];
  }
  const d = onlyDigits(ie);
  if (d.length !== 12) return false;
  const n = d.split("").map(Number);
  const w1 = [1, 3, 4, 5, 6, 7, 8, 10];
  const s1 = n.slice(0, 8).reduce((a, x, i) => a + x * w1[i], 0);
  if ((s1 % 11) % 10 !== n[8]) return false;
  const w2 = [3, 2, 10, 9, 8, 7, 6, 5, 4, 3, 2];
  const s2 = n.slice(0, 11).reduce((a, x, i) => a + x * w2[i], 0);
  return (s2 % 11) % 10 === n[11];
}

const UF_LIST = Object.keys(VALIDATORS);

export function validateInscricaoEstadual(value: string, uf: string): IeValidationResult {
  const raw = (value || "").trim();
  if (!raw) return { valid: false, isento: false, message: "Informe a Inscrição Estadual ou marque ISENTO." };

  if (/^isento$/i.test(raw)) {
    return { valid: true, isento: true, message: "ISENTO — sem Inscrição Estadual." };
  }

  const ufUp = (uf || "").trim().toUpperCase();
  if (!ufUp) return { valid: false, isento: false, message: "Selecione o estado (UF) para validar a IE." };
  if (!UF_LIST.includes(ufUp)) {
    return { valid: false, isento: false, message: `UF "${ufUp}" não reconhecida.` };
  }

  // SP pode ter letra (produtor rural); demais são só dígitos
  const cleaned = ufUp === "SP" ? raw.toUpperCase().replace(/[^0-9P]/g, "") : onlyDigits(raw);

  try {
    const ok = VALIDATORS[ufUp](cleaned);
    return ok
      ? { valid: true, isento: false, message: `IE válida para ${ufUp} (formato e dígito conferem).` }
      : { valid: false, isento: false, message: `IE inválida para ${ufUp} — confira o número e o estado.` };
  } catch {
    return { valid: false, isento: false, message: "Não foi possível validar a IE." };
  }
}

// Nível B (ownership/ativa): stub para futura API SINTEGRA paga.
// Quando contratarem, implementar a chamada aqui e usar no formulário.
export async function validateIeOwnership(_ie: string, _cnpj: string, _uf: string): Promise<{ ok: boolean; razaoSocial?: string; situacao?: string; message: string }> {
  return { ok: false, message: "Verificação de titularidade requer API SINTEGRA (não configurada)." };
}
