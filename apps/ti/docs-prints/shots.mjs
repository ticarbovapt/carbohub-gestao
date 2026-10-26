// Lista dos prints da Documentação do Carbo TI. Cada área tem o seu
// shots_<área>.mjs; este arquivo junta as listas. O número de cada marcador é
// o MESMO `n` do item em src/docs/secoes/*.ts.
import { SHOTS as BASE } from "./shots_base.mjs";
import { SHOTS as COMERCIAL } from "./shots_comercial.mjs";
import { SHOTS as DEMANDAS } from "./shots_demandas.mjs";
import { SHOTS as SISTEMA } from "./shots_sistema.mjs";
import { SHOTS as USUARIOS } from "./shots_usuarios.mjs";
import { SHOTS as AUDITORIA } from "./shots_auditoria.mjs";
export const SHOTS = [...BASE, ...DEMANDAS, ...SISTEMA, ...USUARIOS, ...AUDITORIA, ...COMERCIAL];
