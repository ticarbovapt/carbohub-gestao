// Lista dos prints da Documentação do Carbo Admin. Cada área tem o seu
// shots_<área>.mjs; este arquivo junta as listas. O número de cada marcador é
// o MESMO `n` do item em src/docs/secoes/*.ts.
import { SHOTS as BASE } from "./shots_base.mjs";
import { SHOTS as PAINELCOM } from "./shots_painelcom.mjs";
import { SHOTS as PAINEIS } from "./shots_paineis.mjs";
import { SHOTS as ECOMMERCE } from "./shots_ecommerce.mjs";
import { SHOTS as ESTEIRA } from "./shots_esteira.mjs";
import { SHOTS as COMERCIAL } from "./shots_comercial.mjs";
export const SHOTS = [...BASE, ...PAINELCOM, ...PAINEIS, ...ECOMMERCE, ...ESTEIRA, ...COMERCIAL];
