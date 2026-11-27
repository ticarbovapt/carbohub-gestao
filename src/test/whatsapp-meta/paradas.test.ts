import { describe, it, expect } from "vitest";
import { conversasParadas } from "../../../apps/atendimento/src/lib/conversas";

const AGORA = new Date("2026-11-27T12:00:00Z").getTime();
const h = (n: number) => new Date(AGORA - n * 3_600_000).toISOString();

describe("conversasParadas — o aviso ao abrir um número", () => {
  it("conta sem resposta só depois de 24 h, e guarda a mais antiga", () => {
    const r = conversasParadas([
      { status: "aberto", aguardando_desde: h(23), ultima_em: h(23) },
      { status: "aberto", aguardando_desde: h(30), ultima_em: h(30) },
      { status: "aberto", aguardando_desde: h(200), ultima_em: h(200) },
    ], AGORA);
    expect(r.semResposta).toBe(2);
    expect(r.maisAntigaSemResposta).toBe(h(200));
  });

  it("conta respondida e não encerrada só depois de 48 h", () => {
    const r = conversasParadas([
      { status: "em_atendimento", aguardando_desde: null, ultima_em: h(47) },
      { status: "em_atendimento", aguardando_desde: null, ultima_em: h(49) },
    ], AGORA);
    expect(r.semEncerrar).toBe(1);
    expect(r.semResposta).toBe(0);
  });

  it("aguardando, resolvida e só-aviso nunca entram", () => {
    const r = conversasParadas([
      { status: "aguardando", aguardando_desde: null, ultima_em: h(500) },
      { status: "resolvido", aguardando_desde: null, ultima_em: h(500) },
      { status: null, aguardando_desde: null, ultima_em: h(500) },
    ], AGORA);
    expect(r).toEqual({ semResposta: 0, semEncerrar: 0, maisAntigaSemResposta: null });
  });
});
