// Registro das fixtures por ÁREA da documentação. Cada área mora no seu
// fx_<área>.ts e exporta FX (tabelas) e RPC_FX (funções) — assim duas áreas
// podem ser escritas ao mesmo tempo sem mexer no mesmo arquivo.
// ⚠️ Tabela lida por mais de uma área responde por ROTA (ver `porRota` no
// fx_logistica do Ops): a área que vem por último aqui atropela as outras.
import * as comercial from "./fx_comercial";
import * as quadros from "./fx_quadros";
import * as visoes from "./fx_visoes";
import * as ecommerce from "./fx_ecommerce";
import * as esteira from "./fx_esteira";

const AREAS = [comercial, quadros, visoes, ecommerce, esteira] as { FX?: Record<string, unknown>; RPC_FX?: Record<string, unknown> }[];
export const FX_AREAS: Record<string, unknown> = Object.assign({}, ...AREAS.map((a) => a.FX ?? {}));
export const RPC_AREAS: Record<string, unknown> = Object.assign({}, ...AREAS.map((a) => a.RPC_FX ?? {}));
