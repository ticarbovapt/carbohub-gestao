// Tipos do Carbo Call (sem dependência do livekit-client — mantém a lib pesada
// só dentro de engine.ts, que é carregado sob demanda).

export type CallStateValue = "idle" | "connecting" | "connected" | "disconnected" | "error";

export interface CallParticipant {
  identity: string;
  isLocal: boolean;
  isSpeaking: boolean;
  muted: boolean;
}

// Callbacks que a engine emite pra camada React.
export interface CallEngineEvents {
  onState?: (s: CallStateValue) => void;
  onParticipants?: (p: CallParticipant[]) => void;
  onError?: (e: Error) => void;
}
