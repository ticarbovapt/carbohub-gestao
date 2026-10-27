// Lista dos prints da Documentação do Carbo Finanças. Cada área tem o seu
// shots_<área>.mjs; este arquivo junta as listas. O número de cada marcador é
// o MESMO `n` do item em src/docs/secoes/*.ts.
import { SHOTS as BASE } from "./shots_base.mjs";
import { SHOTS as COMERCIAL } from "./shots_comercial.mjs";
import { SHOTS as CONTAS } from "./shots_contas.mjs";
import { SHOTS as VENDAS } from "./shots_vendasfin.mjs";
import { SHOTS as COMPRAS } from "./shots_compras.mjs";
import { SHOTS as CONFIG } from "./shots_config.mjs";
export const SHOTS = [...BASE, ...COMERCIAL, ...CONTAS, ...VENDAS, ...COMPRAS, ...CONFIG];
