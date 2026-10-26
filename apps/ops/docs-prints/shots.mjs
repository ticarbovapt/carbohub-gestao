// Lista dos prints da Documentação do Carbo Ops. Cada área tem o seu
// shots_<área>.mjs; este arquivo junta as listas. O número de cada marcador é
// o MESMO `n` do item em src/docs/secoes/*.ts.
import { SHOTS as BASE } from "./shots_base.mjs";
import { SHOTS as PRODUCAO } from "./shots_producao.mjs";
import { SHOTS as SUPRIMENTOS } from "./shots_suprimentos.mjs";
import { SHOTS as LOGISTICA } from "./shots_logistica.mjs";
import { SHOTS as CAMPO } from "./shots_campo.mjs";
import { SHOTS as COMERCIAL } from "./shots_comercial.mjs";
export const SHOTS = [...BASE, ...PRODUCAO, ...SUPRIMENTOS, ...LOGISTICA, ...CAMPO, ...COMERCIAL];
