import { describe, it, expect } from "vitest";
import {
  interpretar, chaveDoEvento, assinaturaConfere, statusDeTemplate,
  conteudoDaMensagem,
} from "../../../supabase/functions/_shared/metaWebhook.ts";

// Payloads no formato real da Meta: entry[].changes[].value.{statuses,messages}
const STATUS = (id: string, status: string, ts = "1755902400") => ({
  field: "messages",
  value: {
    messaging_product: "whatsapp",
    metadata: { display_phone_number: "5584887691 87", phone_number_id: "1255756280958635" },
    statuses: [{ id, status, timestamp: ts, recipient_id: "558487346304" }],
  },
});

describe("interpretar — status de entrega", () => {
  it("traduz sent/delivered/read", () => {
    for (const s of ["sent", "delivered", "read"]) {
      const [a] = interpretar(STATUS("wamid.AAA", s));
      expect(a).toMatchObject({ tipo: "status", wamid: "wamid.AAA", status: s });
    }
  });

  it("⚠️ o timestamp vem em SEGUNDOS e como string", () => {
    const [a] = interpretar(STATUS("wamid.AAA", "delivered", "1755902400"));
    // 1755902400 s = 2025-08-22T21:20:00Z. Lido como milissegundos daria 1970.
    expect(a.tipo).toBe("status");
    if (a.tipo === "status") {
      expect(a.quando.startsWith("2025-")).toBe(true);
      expect(a.quando).not.toContain("1970");
    }
  });

  it("timestamp ausente não explode nem inventa data", () => {
    const [a] = interpretar({ field: "messages",
      value: { statuses: [{ id: "wamid.X", status: "sent" }] } });
    expect(a.tipo).toBe("status");
  });

  it("failed traz o código e o detalhe, não o título genérico", () => {
    const [a] = interpretar({
      field: "messages",
      value: { statuses: [{
        id: "wamid.F", status: "failed", timestamp: "1755902400",
        errors: [{ code: 131026, title: "Message undeliverable",
                   error_data: { details: "Receiver is incapable of receiving this message" } }],
      }] },
    });
    expect(a).toMatchObject({ tipo: "status", codigo: 131026 });
    if (a.tipo === "status") expect(a.detalhe).toContain("incapable");
  });

  it("um POST pode trazer vários status de uma vez", () => {
    const acoes = interpretar({
      field: "messages",
      value: { statuses: [
        { id: "wamid.A", status: "delivered", timestamp: "1755902400" },
        { id: "wamid.B", status: "read", timestamp: "1755902401" },
      ] },
    });
    expect(acoes).toHaveLength(2);
  });

  it("status sem id é descartado em vez de virar linha órfã", () => {
    expect(interpretar({ field: "messages",
      value: { statuses: [{ status: "read" }] } })).toEqual([]);
  });
});

describe("interpretar — mensagem do cliente", () => {
  const INBOUND = {
    field: "messages",
    value: {
      contacts: [{ profile: { name: "Washington" }, wa_id: "5519991948368" }],
      messages: [{ from: "5519991948368", id: "wamid.IN1", timestamp: "1755902400",
                   type: "text", text: { body: "chegou hoje, obrigado" } }],
    },
  };

  it("registra quem falou e quando — é o que abre a janela de 24h", () => {
    const [a] = interpretar(INBOUND);
    expect(a).toMatchObject({ tipo: "inbound", waId: "5519991948368", nome: "Washington" });
  });

  // ⚠️ Este teste era o OPOSTO até a Fase 3: ele garantia que o conteúdo NÃO
  // era carregado. A decisão mudou porque a premissa era falsa — a Caixa de
  // Entrada do Business Suite não aceita número da Cloud API, e a Cloud API não
  // tem endpoint de histórico. O que não for gravado existe só no celular do
  // cliente, e três dos seis templates pedem resposta em texto.
  it("carrega o conteúdo — não há outro lugar onde ele exista", () => {
    const [a] = interpretar(INBOUND);
    if (a.tipo === "inbound") {
      expect(a.texto).toBe("chegou hoje, obrigado");
      expect(a.wamid).toBe("wamid.IN1");
      expect(a.formato).toBe("text");
    }
  });

  it("⚠️ `context.id` liga a resposta ao pedido, não a um recado solto", () => {
    const [a] = interpretar({
      field: "messages",
      value: { messages: [{ from: "5519991948368", id: "wamid.IN2",
                            timestamp: "1755902400", type: "text",
                            text: { body: "chegou quebrado" },
                            context: { id: "wamid.NOSSA123" } }] },
    });
    if (a.tipo === "inbound") expect(a.respondeA).toBe("wamid.NOSSA123");
  });

  it("sem context, respondeA é nulo — a view cai no último aviso enviado", () => {
    const [a] = interpretar(INBOUND);
    if (a.tipo === "inbound") expect(a.respondeA).toBeNull();
  });

  it("resposta de botão de template também abre a janela", () => {
    const [a] = interpretar({
      field: "messages",
      value: { messages: [{ from: "5584987346304", id: "wamid.B1",
                            timestamp: "1755902400", type: "button",
                            button: { text: "Acompanhar pedido" } }] },
    });
    expect(a.tipo).toBe("inbound");
  });

  it("sem perfil o nome vem nulo, não 'undefined'", () => {
    const [a] = interpretar({ field: "messages",
      value: { messages: [{ from: "55849", id: "wamid.N", timestamp: "1" }] } });
    if (a.tipo === "inbound") expect(a.nome).toBeNull();
  });
});

describe("interpretar — status de template", () => {
  it("aprovação vira ação de template", () => {
    const [a] = interpretar({
      field: "message_template_status_update",
      value: { message_template_id: "1622625509583766",
               message_template_name: "pedido_a_caminho",
               message_template_language: "pt_BR", event: "APPROVED" },
    });
    expect(a).toMatchObject({ tipo: "template", nome: "pedido_a_caminho", evento: "APPROVED" });
  });

  it("recusa carrega o motivo", () => {
    const [a] = interpretar({
      field: "message_template_status_update",
      value: { message_template_id: "1", message_template_name: "x",
               event: "REJECTED", reason: "INVALID_FORMAT" },
    });
    if (a.tipo === "template") expect(a.motivo).toBe("INVALID_FORMAT");
  });

  it("campo que não conhecemos não gera ação", () => {
    expect(interpretar({ field: "phone_number_quality_update",
                         value: { event: "FLAGGED" } })).toEqual([]);
  });

  it("change vazio ou nulo não explode", () => {
    expect(interpretar(null)).toEqual([]);
    expect(interpretar({})).toEqual([]);
    expect(interpretar({ field: "messages", value: {} })).toEqual([]);
  });
});

describe("chaveDoEvento", () => {
  it("⚠️ status inclui o STATUS: o mesmo wamid manda três eventos legítimos", () => {
    const [s1] = interpretar(STATUS("wamid.A", "sent"));
    const [s2] = interpretar(STATUS("wamid.A", "delivered"));
    const [s3] = interpretar(STATUS("wamid.A", "read"));
    const chaves = new Set([s1.chave, s2.chave, s3.chave]);
    expect(chaves.size).toBe(3);
  });

  it("a reentrega do MESMO status dá a mesma chave", () => {
    const [a] = interpretar(STATUS("wamid.A", "delivered", "1755902400"));
    const [b] = interpretar(STATUS("wamid.A", "delivered", "1755902499"));
    expect(a.chave).toBe(b.chave);
  });

  it("mensagem recebida trava pelo id sozinho", () => {
    expect(chaveDoEvento("inbound", "wamid.IN1")).toBe("inbound:wamid.IN1");
  });

  it("wamids diferentes nunca colidem", () => {
    const [a] = interpretar(STATUS("wamid.A", "read"));
    const [b] = interpretar(STATUS("wamid.B", "read"));
    expect(a.chave).not.toBe(b.chave);
  });
});

describe("assinaturaConfere", () => {
  it("iguais conferem", () => {
    expect(assinaturaConfere("sha256=abc123", "sha256=abc123")).toBe(true);
  });

  it("diferentes não conferem", () => {
    expect(assinaturaConfere("sha256=abc123", "sha256=abc124")).toBe(false);
  });

  it("tamanhos diferentes não conferem", () => {
    expect(assinaturaConfere("sha256=abc", "sha256=abcd")).toBe(false);
  });

  it("⚠️ vazio NUNCA confere — é o header ausente", () => {
    expect(assinaturaConfere("", "")).toBe(false);
    expect(assinaturaConfere("sha256=abc", "")).toBe(false);
  });

  it("olha a string inteira, não para no primeiro byte diferente", () => {
    // Diferença só no último caractere: tem de recusar igual.
    expect(assinaturaConfere("sha256=aaaaaaaa", "sha256=aaaaaaab")).toBe(false);
    // E diferença só no primeiro.
    expect(assinaturaConfere("sha256=baaaaaaa", "sha256=aaaaaaaa")).toBe(false);
  });
});

describe("statusDeTemplate", () => {
  it("mapeia os que o CHECK aceita", () => {
    expect(statusDeTemplate("APPROVED")).toBe("APPROVED");
    expect(statusDeTemplate("REJECTED")).toBe("REJECTED");
    expect(statusDeTemplate("PAUSED")).toBe("PAUSED");
    expect(statusDeTemplate("IN_APPEAL")).toBe("IN_APPEAL");
  });

  it("PENDING_DELETION cai em DISABLED, que existe no CHECK", () => {
    expect(statusDeTemplate("PENDING_DELETION")).toBe("DISABLED");
  });

  it("⚠️ evento novo da Meta devolve null, não um status inventado", () => {
    // Um valor fora do CHECK faria o update falhar e derrubar a rodada inteira.
    expect(statusDeTemplate("FLAGGED_FOR_SOMETHING_NEW")).toBeNull();
    expect(statusDeTemplate("")).toBeNull();
  });
});

describe("conteudoDaMensagem", () => {
  it("texto simples", () => {
    expect(conteudoDaMensagem({ type: "text", text: { body: "oi" } }))
      .toMatchObject({ formato: "text", texto: "oi" });
  });

  it("botão de template devolve o RÓTULO — é o que a pessoa viu e tocou", () => {
    expect(conteudoDaMensagem({ type: "button", button: { text: "Acompanhar pedido" } }))
      .toMatchObject({ texto: "Acompanhar pedido" });
  });

  it("botão interativo, das duas formas", () => {
    expect(conteudoDaMensagem({
      type: "interactive", interactive: { button_reply: { title: "Sim" } },
    })).toMatchObject({ texto: "Sim" });
    expect(conteudoDaMensagem({
      type: "interactive", interactive: { list_reply: { title: "Opção 2" } },
    })).toMatchObject({ texto: "Opção 2" });
  });

  it("imagem guarda o id e o mime, e a legenda vira texto", () => {
    expect(conteudoDaMensagem({
      type: "image", image: { id: "1234", mime_type: "image/jpeg", caption: "chegou assim" },
    })).toEqual({ formato: "image", texto: "chegou assim",
                  midiaId: "1234", midiaMime: "image/jpeg" });
  });

  it("⚠️ a mídia NÃO é baixada: só o id, e ele é o suficiente para buscar depois", () => {
    const r = conteudoDaMensagem({ type: "audio", audio: { id: "a1", mime_type: "audio/ogg" } });
    expect(r.midiaId).toBe("a1");
    expect(r.texto).toBeNull();
  });

  it("documento sem legenda usa o nome do arquivo, que é o que aparece na conversa", () => {
    expect(conteudoDaMensagem({
      type: "document", document: { id: "d1", filename: "comprovante.pdf" },
    })).toMatchObject({ texto: "comprovante.pdf" });
  });

  it("reação vira o emoji", () => {
    expect(conteudoDaMensagem({ type: "reaction", reaction: { emoji: "👍" } }))
      .toMatchObject({ texto: "👍" });
  });

  it("localização prefere o nome ao par de coordenadas", () => {
    expect(conteudoDaMensagem({
      type: "location", location: { latitude: -5.8, longitude: -35.2, name: "Casa" },
    })).toMatchObject({ texto: "Casa" });
    expect(conteudoDaMensagem({
      type: "location", location: { latitude: -5.8, longitude: -35.2 },
    })).toMatchObject({ texto: "-5.8, -35.2" });
  });

  it("⚠️ tipo desconhecido NÃO some: vira linha com o formato e sem texto", () => {
    // A linha é gravada com o payload cru. Mensagem de cliente que desaparece
    // porque o parser não conhecia o formato é a pior falha possível aqui: não
    // deixa rastro, e o cliente acha que foi ignorado.
    const r = conteudoDaMensagem({ type: "order", order: { catalog_id: "x" } });
    expect(r.formato).toBe("order");
    expect(r.texto).toBeNull();
  });

  it("mensagem sem tipo vira 'unknown' em vez de explodir", () => {
    expect(conteudoDaMensagem({}).formato).toBe("unknown");
    expect(conteudoDaMensagem(null).formato).toBe("unknown");
  });

  it("tipo desconhecido continua gerando ação de inbound", () => {
    const [a] = interpretar({
      field: "messages",
      value: { messages: [{ from: "55849", id: "wamid.X", timestamp: "1755902400",
                            type: "order", order: {} }] },
    });
    expect(a?.tipo).toBe("inbound");
  });
});
