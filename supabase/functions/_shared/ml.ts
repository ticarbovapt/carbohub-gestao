// ─────────────────────────────────────────────────────────────────────────────
// Mercado Livre — token e chamadas, num lugar só
//
// Existe porque o refresh estava DUPLICADO em `ml-auth` e `ecommerce-sync`, sem
// coordenação, e o `refresh_token` do ML é de USO ÚNICO: cada renovação devolve
// um novo e invalida o anterior. Duas renovações simultâneas = uma recebe
// `invalid_grant`.
//
// ⚠️ E o desfecho era pior que a falha: o `ml-auth` reagia APAGANDO a linha
// ("Refresh failed — mark as disconnected"). Uma corrida de segundos
// desconectava a integração, e só voltava com OAuth manual. Isso já acontecia
// com UMA conta.
//
// Aqui a renovação é uma troca CONDICIONAL (`ml_token_trocar`): quem perde a
// corrida não tenta de novo — relê a linha e usa o token que o vencedor
// gravou. E falha passa a MARCAR (`ml_conta_marcar_erro`), nunca apagar: o
// `refresh_token` é a única coisa capaz de recuperar a conexão sozinha.
// ─────────────────────────────────────────────────────────────────────────────

export type PlatformKeyML = "mercadolivre" | "mercadolivre_full";

export interface ContaML {
  seller_id: number;
  platform_key: PlatformKeyML;
  access_token: string | null;
  refresh_token: string | null;
  expires_at: string | null;
  status: string;
  last_synced_at: string | null;
  label: string | null;
}

const ML_API = "https://api.mercadolibre.com";
const ML_TOKEN_URL = `${ML_API}/oauth/token`;

// Renova quando falta MENOS que isto. 10 min (o briefing pediu) em vez dos 5
// de antes: com duas contas e um cron a cada 5 min, 5 minutos de folga não
// cobrem uma rodada lenta.
const FOLGA_MS = 10 * 60 * 1000;

type Db = {
  from: (t: string) => any;
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: any; error: any }>;
};

const COLS =
  "seller_id, platform_key, access_token, refresh_token, expires_at, status, last_synced_at, label";

/** Todas as contas que devem sincronizar. */
export async function contasAtivas(db: Db): Promise<ContaML[]> {
  const { data, error } = await db
    .from("ml_accounts")
    .select(COLS)
    .eq("status", "active")
    .order("platform_key", { ascending: true });

  if (error) {
    // ⚠️ Tabela ausente (migração ainda não rodada) NÃO é erro fatal: devolve
    // vazio e o chamador cai no fallback de `system_tokens`. Explodir aqui
    // derrubaria o sync inteiro por causa de uma ordem de deploy.
    console.warn("[ml] ml_accounts indisponivel:", error.message);
    return [];
  }
  return (data ?? []) as ContaML[];
}

async function relerConta(db: Db, sellerId: number): Promise<ContaML | null> {
  const { data } = await db.from("ml_accounts").select(COLS).eq("seller_id", sellerId).maybeSingle();
  return (data as ContaML) ?? null;
}

/**
 * Token válido para a conta, renovando se estiver perto de expirar.
 *
 * Devolve `null` quando a conta precisa de OAuth manual — e nesse caso ela já
 * está marcada como `reauth_required`, então o chamador só precisa pular.
 */
export async function getMlToken(db: Db, conta: ContaML): Promise<string | null> {
  const venceEm = conta.expires_at ? new Date(conta.expires_at).getTime() : 0;
  if (conta.access_token && Date.now() < venceEm - FOLGA_MS) return conta.access_token;

  if (!conta.refresh_token) {
    await db.rpc("ml_conta_marcar_erro", {
      p_seller_id: conta.seller_id,
      p_erro: "sem refresh_token gravado",
      p_fatal: true,
    });
    return null;
  }

  const clientId = Deno.env.get("ML_CLIENT_ID");
  const clientSecret = Deno.env.get("ML_CLIENT_SECRET");
  if (!clientId || !clientSecret) {
    // ⚠️ Segredo AUSENTE é problema NOSSO, e não pode ser confundido com
    // credencial inválida da conta: marcar `reauth_required` aqui mandaria
    // alguém refazer um OAuth que não ia resolver nada.
    console.error("[ml] ML_CLIENT_ID/SECRET ausentes no ambiente da função");
    await db.rpc("ml_conta_marcar_erro", {
      p_seller_id: conta.seller_id,
      p_erro: "ML_CLIENT_ID/SECRET ausentes no servidor",
      p_fatal: false,
    });
    return null;
  }

  let res: Response;
  try {
    res = await fetch(ML_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: conta.refresh_token,
      }),
    });
  } catch (e) {
    // Rede caiu: NÃO é fatal. Marcar reauth aqui tiraria do ar uma conta
    // perfeitamente boa por causa de um blip.
    await db.rpc("ml_conta_marcar_erro", {
      p_seller_id: conta.seller_id,
      p_erro: `rede: ${(e as Error).message}`,
      p_fatal: false,
    });
    return null;
  }

  if (!res.ok) {
    const corpo = await res.text();
    // ⚠️ `invalid_grant` é o ÚNICO caso fatal, e mesmo ele pode ser a corrida:
    // o outro worker renovou entre a nossa leitura e o nosso POST. Por isso
    // relemos ANTES de desistir — se a linha já tem um token novo e válido,
    // não houve problema nenhum.
    const pareceDefinitivo = res.status === 400 && corpo.includes("invalid_grant");

    if (pareceDefinitivo) {
      const agora = await relerConta(db, conta.seller_id);
      const novoVenceEm = agora?.expires_at ? new Date(agora.expires_at).getTime() : 0;
      if (agora?.access_token && agora.refresh_token !== conta.refresh_token
          && Date.now() < novoVenceEm - FOLGA_MS) {
        console.log(`[ml] ${conta.platform_key}: outro worker renovou; usando o token novo`);
        return agora.access_token;
      }
    }

    await db.rpc("ml_conta_marcar_erro", {
      p_seller_id: conta.seller_id,
      p_erro: `refresh ${res.status}: ${corpo.slice(0, 300)}`,
      p_fatal: pareceDefinitivo,
    });
    return null;
  }

  const t = (await res.json()) as {
    access_token: string; refresh_token: string; expires_in: number; scope?: string;
  };
  const expiraEm = new Date(Date.now() + t.expires_in * 1000).toISOString();

  const { data: venceu } = await db.rpc("ml_token_trocar", {
    p_seller_id: conta.seller_id,
    p_refresh_token_lido: conta.refresh_token,
    p_access_token: t.access_token,
    p_refresh_token_novo: t.refresh_token,
    p_expires_at: expiraEm,
    p_scopes: t.scope ?? null,
  });

  if (venceu === false) {
    // ⚠️ Perdemos a corrida na GRAVAÇÃO. O token que acabamos de obter é
    // válido, mas o do vencedor é o que está na linha — e é ele que a próxima
    // rodada vai ler. Devolver o nosso deixaria dois tokens vivos e o
    // `refresh_token` do vencedor seria o único aproveitável. Releia e use o
    // dele.
    console.log(`[ml] ${conta.platform_key}: perdemos a corrida da gravacao; relendo`);
    const agora = await relerConta(db, conta.seller_id);
    return agora?.access_token ?? t.access_token;
  }

  return t.access_token;
}

/**
 * Chamada à API do ML com Bearer, retry de 401 (uma vez) e backoff em 429/5xx.
 *
 * ⚠️ O backoff tem jitter: sem ele, duas contas que caem no mesmo 429 voltam
 * EXATAMENTE juntas e tomam 429 de novo, em sincronia, para sempre.
 */
export async function mlFetch(
  db: Db,
  conta: ContaML,
  caminho: string,
  init: RequestInit = {},
  tentativas = 3,
): Promise<Response | null> {
  let token = await getMlToken(db, conta);
  if (!token) return null;

  const url = caminho.startsWith("http") ? caminho : `${ML_API}${caminho}`;

  for (let i = 0; i < tentativas; i++) {
    const res = await fetch(url, {
      ...init,
      headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}` },
    });

    if (res.status === 401 && i === 0) {
      // Token recusado apesar de "não expirado": força a renovação relendo a
      // linha com `expires_at` zerado do ponto de vista do getMlToken.
      const novo = await getMlToken(db, { ...conta, expires_at: new Date(0).toISOString() });
      if (!novo) return null;
      token = novo;
      continue;
    }

    if (res.status === 429 || res.status >= 500) {
      if (i === tentativas - 1) return res;
      const espera = 2 ** i * 1000 + Math.random() * 500;
      console.warn(`[ml] ${conta.platform_key} ${res.status} em ${caminho} — ${Math.round(espera)}ms`);
      await new Promise((r) => setTimeout(r, espera));
      continue;
    }

    return res;
  }
  return null;
}

/** Marca o checkpoint de sincronização da conta. */
export async function marcarSync(db: Db, sellerId: number): Promise<void> {
  await db.from("ml_accounts")
    .update({ last_synced_at: new Date().toISOString() })
    .eq("seller_id", sellerId);
}
