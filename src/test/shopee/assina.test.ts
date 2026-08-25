import { describe, it, expect } from "vitest";
import {
  baseString, assinar, hmacHex, expiraEm, urlAssinada, urlDeAutorizacao,
  agoraEmSegundos, SHOPEE_PATHS, SHOPEE_HOST_PROD,
} from "../../../supabase/functions/_shared/shopeeAssina";

/**
 * Testes da assinatura da Shopee.
 *
 * ⚠️ O que estes testes protegem NÃO é a criptografia — é a ORDEM e a UNIDADE.
 * Base string com os pedaços trocados e timestamp em milissegundos produzem os
 * dois o mesmo erro da Shopee (`error_sign`), que se parece com "a chave está
 * errada" e faz a pessoa trocar a chave certa por outra.
 *
 * O HMAC em si é do WebCrypto e não precisa de teste nosso. O que precisa é a
 * frase que entra nele.
 */

const CHAVE = "chave_de_teste";
const PARTNER = "1234567";

describe("baseString", () => {
  it("endpoint público: partner_id + path + timestamp, sem separador", () => {
    expect(baseString(PARTNER, "/api/v2/auth/token/get", 1700000000))
      .toBe("1234567/api/v2/auth/token/get1700000000");
  });

  it("endpoint de loja: acrescenta access_token e shop_id NESSA ordem", () => {
    expect(baseString(PARTNER, "/api/v2/order/get_order_list", 1700000000, "tok", "999"))
      .toBe("1234567/api/v2/order/get_order_list1700000000tok999");
  });

  it("⚠️ token sem shop_id NÃO vira endpoint de loja pela metade", () => {
    // Meia autenticação produziria uma base string que não é nem uma coisa nem
    // outra, e a Shopee responderia error_sign sem dizer o que faltou.
    expect(baseString(PARTNER, "/x", 1, "tok")).toBe("1234567/x1");
    expect(baseString(PARTNER, "/x", 1, undefined, "999")).toBe("1234567/x1");
  });

  it("⚠️ trocar a ordem muda a assinatura — é isso que o teste guarda", () => {
    const certo  = baseString(PARTNER, "/api/v2/x", 1700000000);
    const errado = `${PARTNER}${1700000000}/api/v2/x`;
    expect(certo).not.toBe(errado);
  });
});

describe("assinar", () => {
  it("devolve hex minúsculo de 64 caracteres", async () => {
    const s = await assinar(CHAVE, PARTNER, "/api/v2/auth/token/get", 1700000000);
    expect(s).toMatch(/^[0-9a-f]{64}$/);
  });

  it("é determinística: mesma entrada, mesma saída", async () => {
    const a = await assinar(CHAVE, PARTNER, "/p", 1700000000);
    const b = await assinar(CHAVE, PARTNER, "/p", 1700000000);
    expect(a).toBe(b);
  });

  it("muda quando o path muda — o path ENTRA na assinatura", async () => {
    const a = await assinar(CHAVE, PARTNER, "/api/v2/auth/token/get", 1700000000);
    const b = await assinar(CHAVE, PARTNER, "/api/v2/auth/access_token/get", 1700000000);
    expect(a).not.toBe(b);
  });

  it("bate com o HMAC calculado à parte sobre a mesma base string", async () => {
    const esperado = await hmacHex(CHAVE, "1234567/api/v2/auth/token/get1700000000");
    expect(await assinar(CHAVE, PARTNER, SHOPEE_PATHS.tokenNovo, 1700000000)).toBe(esperado);
  });
});

describe("agoraEmSegundos", () => {
  it("⚠️ SEGUNDOS, não milissegundos", () => {
    const t = agoraEmSegundos();
    // Um timestamp em ms teria 13 dígitos e a Shopee recusaria.
    expect(String(t).length).toBe(10);
    expect(Math.abs(t - Date.now() / 1000)).toBeLessThan(2);
  });
});

describe("urlAssinada", () => {
  it("põe partner_id, timestamp e sign na QUERY — mesmo sendo POST", async () => {
    const u = new URL(await urlAssinada(SHOPEE_HOST_PROD, SHOPEE_PATHS.tokenNovo, PARTNER, CHAVE));
    expect(u.origin + u.pathname).toBe(SHOPEE_HOST_PROD + SHOPEE_PATHS.tokenNovo);
    expect(u.searchParams.get("partner_id")).toBe(PARTNER);
    expect(u.searchParams.get("sign")).toMatch(/^[0-9a-f]{64}$/);
    expect(u.searchParams.get("timestamp")).toMatch(/^\d{10}$/);
  });
});

describe("urlDeAutorizacao", () => {
  it("carrega o redirect, e ele sobrevive à codificação", async () => {
    const redirect = "https://wpkfirmapxevzpxjovjr.supabase.co/functions/v1/shopee-auth";
    const u = new URL(await urlDeAutorizacao(SHOPEE_HOST_PROD, PARTNER, CHAVE, redirect));
    // ⚠️ Tem de voltar IDÊNTICO: a Shopee compara com o que está cadastrado no
    // painel caractere por caractere, e nem diz qual das duas ela esperava.
    expect(u.searchParams.get("redirect")).toBe(redirect);
    expect(u.pathname).toBe(SHOPEE_PATHS.autorizar);
  });
});

describe("expiraEm", () => {
  const agora = new Date("2026-08-25T12:00:00Z");

  it("desconta 5 min de folga do prazo da Shopee", () => {
    // 4 h (14400 s) − 5 min = 3h55 depois de agora.
    expect(expiraEm(14400, agora).toISOString()).toBe("2026-08-25T15:55:00.000Z");
  });

  it("⚠️ prazo menor que a folga não vira passado longínquo", () => {
    // Sem o Math.max, um expire_in de 60 s produziria um vencimento 4 min ANTES
    // de agora — e o refresh entraria em laço tentando renovar para sempre.
    expect(expiraEm(60, agora).getTime()).toBe(agora.getTime());
    expect(expiraEm(0, agora).getTime()).toBe(agora.getTime());
  });
});
