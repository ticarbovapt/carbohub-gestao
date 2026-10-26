// Lista dos prints da Documentação do Carbo Sales. Cada área tem o seu
// shots_<área>.mjs; este arquivo junta as listas. O número de cada marcador é
// o MESMO `n` do item em src/docs/secoes/*.ts.
import { SHOTS as RASTREIO } from "./shots_rastreio.mjs";
import { SHOTS as CAMPO } from "./shots_campo.mjs";
import { SHOTS as COMERCIAL } from "./shots_comercial.mjs";
import { SHOTS as BASE } from "./shots_base.mjs";
export const SHOTS = [...BASE, ...COMERCIAL, ...RASTREIO, ...CAMPO];
