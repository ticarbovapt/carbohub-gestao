// Registro das fixtures por ÁREA da documentação. Cada área mora no seu
// fx_<área>.ts e exporta FX (tabelas) e RPC_FX (funções) — assim duas áreas
// podem ser escritas ao mesmo tempo sem mexer no mesmo arquivo.
import * as campo from "./fx_campo";
import * as comercial from "./fx_comercial";
import * as producao from "./fx_producao";
import * as suprimentos from "./fx_suprimentos";
import * as logistica from "./fx_logistica";

const AREAS = [campo, comercial, producao, suprimentos, logistica] as { FX?: Record<string, unknown>; RPC_FX?: Record<string, unknown> }[];
export const FX_AREAS: Record<string, unknown> = Object.assign({}, ...AREAS.map((a) => a.FX ?? {}));
export const RPC_AREAS: Record<string, unknown> = Object.assign({}, ...AREAS.map((a) => a.RPC_FX ?? {}));
