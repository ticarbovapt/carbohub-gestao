// Registro das fixtures por ÁREA da documentação. Cada área mora no seu
// fx_<área>.ts e exporta FX (tabelas) e RPC_FX (funções) — assim duas áreas
// podem ser escritas ao mesmo tempo sem mexer no mesmo arquivo.
// ⚠️ Tabela lida por mais de uma área responde por ROTA (ver `porRota` no
// fx_logistica do Ops): a área que vem por último aqui atropela as outras.
import * as comercial from "./fx_comercial";
import * as demandas from "./fx_demandas";
import * as sistema from "./fx_sistema";
import * as usuarios from "./fx_usuarios";
import * as auditoria from "./fx_auditoria";

const AREAS = [comercial, demandas, sistema, usuarios, auditoria] as { FX?: Record<string, unknown>; RPC_FX?: Record<string, unknown> }[];
export const FX_AREAS: Record<string, unknown> = Object.assign({}, ...AREAS.map((a) => a.FX ?? {}));
export const RPC_AREAS: Record<string, unknown> = Object.assign({}, ...AREAS.map((a) => a.RPC_FX ?? {}));
