// API pública do Carbo Call. Entry LEVE: nada aqui importa livekit-client de
// forma estática. O hook useCall só puxa a engine (com o livekit) no connect(),
// e loadCall() permite pré-carregar a engine sob demanda.
export { useCall } from "./hooks";
export const loadCall = () => import("./engine");
export type { CallStateValue, CallParticipant, CallEngineEvents } from "./types";
