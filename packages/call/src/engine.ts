// Engine de chamada sobre o LiveKit (SFU self-host da Carbo). ÁUDIO só nesta
// rodada — a estrutura já prevê vídeo/tela (métodos marcados como futuro).
//
// Este arquivo é o ÚNICO que importa `livekit-client`. Ele é carregado por
// dynamic import (via index.ts / hooks.ts), então a lib pesada NÃO entra no
// bundle de quem não usa chamada.
import {
  Room, RoomEvent, Track,
  type RemoteTrack, type RemoteTrackPublication, type RemoteParticipant,
} from "livekit-client";
import type { CallEngineEvents, CallParticipant, CallStateValue } from "./types";

export class CallEngine {
  private room: Room | null = null;
  private audioEls = new Map<string, HTMLMediaElement>();
  private events: CallEngineEvents;

  constructor(events: CallEngineEvents = {}) {
    this.events = events;
  }

  private setState(s: CallStateValue) { this.events.onState?.(s); }

  async connect(url: string, token: string): Promise<void> {
    this.setState("connecting");
    try {
      const room = new Room({ adaptiveStream: false, dynacast: false });
      this.room = room;

      room
        .on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => this.attach(track))
        .on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => this.detach(track))
        .on(RoomEvent.ParticipantConnected, () => this.emitParticipants())
        .on(RoomEvent.ParticipantDisconnected, () => this.emitParticipants())
        .on(RoomEvent.ActiveSpeakersChanged, () => this.emitParticipants())
        .on(RoomEvent.LocalTrackPublished, () => this.emitParticipants())
        .on(RoomEvent.Disconnected, () => this.setState("disconnected"));

      await room.connect(url, token);
      // publica o microfone (áudio) já ao entrar
      await room.localParticipant.setMicrophoneEnabled(true);

      this.setState("connected");
      this.emitParticipants();
    } catch (e) {
      this.events.onError?.(e as Error);
      this.setState("error");
      await this.disconnect();
      throw e;
    }
  }

  // Assina áudio remoto → cria um <audio> escondido pra tocar.
  private attach(track: RemoteTrack) {
    if (track.kind !== Track.Kind.Audio) return; // vídeo: futuro
    const el = track.attach();
    el.setAttribute("data-carbo-call", "1");
    (el as HTMLAudioElement).autoplay = true;
    el.style.display = "none";
    document.body.appendChild(el);
    this.audioEls.set(track.sid, el);
  }

  private detach(track: RemoteTrack) {
    track.detach().forEach((el) => el.remove());
    this.audioEls.delete(track.sid);
  }

  async setMuted(muted: boolean): Promise<void> {
    if (!this.room) return;
    const lp = this.room.localParticipant;
    const pubs = Array.from(lp.audioTrackPublications.values());
    if (pubs.length === 0) {
      // Ainda não publicou o microfone → usa a API de habilitar/desabilitar.
      await lp.setMicrophoneEnabled(!muted);
    } else {
      // Muta DIRETO no track publicado — garante que para de enviar áudio
      // (privacidade), independente do estado do setMicrophoneEnabled.
      for (const pub of pubs) {
        const t = pub.track;
        if (!t) continue;
        if (muted) await t.mute(); else await t.unmute();
      }
    }
    this.emitParticipants();
  }

  private emitParticipants() {
    if (!this.room) { this.events.onParticipants?.([]); return; }
    const out: CallParticipant[] = [];
    const lp = this.room.localParticipant;
    out.push({ identity: lp.identity, isLocal: true, isSpeaking: lp.isSpeaking, muted: !lp.isMicrophoneEnabled });
    this.room.remoteParticipants.forEach((p: RemoteParticipant) => {
      const anyAudio = Array.from(p.audioTrackPublications.values()) as RemoteTrackPublication[];
      const muted = anyAudio.length > 0 && anyAudio.every((pub) => pub.isMuted);
      out.push({ identity: p.identity, isLocal: false, isSpeaking: p.isSpeaking, muted });
    });
    this.events.onParticipants?.(out);
  }

  // Sai da chamada: LIBERA o microfone (stop dos tracks → solta o device do SO),
  // remove os <audio> e fecha a conexão.
  async disconnect(): Promise<void> {
    const room = this.room;
    this.room = null;
    try {
      room?.localParticipant.audioTrackPublications.forEach((pub) => pub.track?.stop());
      this.audioEls.forEach((el) => { try { el.pause(); (el as HTMLAudioElement).srcObject = null; } catch { /* noop */ } el.remove(); });
      this.audioEls.clear();
      await room?.disconnect(true); // true = para os tracks locais
    } finally {
      this.setState("idle");
      this.events.onParticipants?.([]);
    }
  }

  // ── FUTURO (não implementado no C0) ────────────────────────────────────────
  // async setCameraEnabled(on: boolean) { await this.room?.localParticipant.setCameraEnabled(on); }
  // async setScreenShareEnabled(on: boolean) { await this.room?.localParticipant.setScreenShareEnabled(on); }
}
