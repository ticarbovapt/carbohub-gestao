// ─────────────────────────────────────────────────────────────────────────────
// Carbo Call — Edge Function que emite o access token do LiveKit.
//
// Recebe { room } de um usuário AUTENTICADO e INTERNO (is_employee) e devolve
// { url, token } com permissões MÍNIMAS: entrar naquela sala e publicar/assinar
// ÁUDIO. Expiração curta. O segredo do LiveKit fica só aqui (Supabase secrets),
// nunca no front. A identidade é sempre o user.id do JWT (não confia no body).
// ─────────────────────────────────────────────────────────────────────────────
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.39.3";
import { AccessToken } from "npm:livekit-server-sdk@2.9.7";

const ALLOWED_ORIGINS = [
  "https://controle.carbohub.com.br",
  "https://carbohub.com.br",
  "https://www.carbohub.com.br",
  "https://admin.carbohub.com.br",
  "https://sales.carbohub.com.br",
  "https://ops.carbohub.com.br",
  "https://financas.carbohub.com.br",
  "http://localhost:8080",
  "http://localhost:8082",
  "http://localhost:5173",
  "http://localhost:3000",
];

function getCorsHeaders(req: Request) {
  const origin = req.headers.get("origin") || "";
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Vary": "Origin",
  };
}

function json(cors: Record<string, string>, status: number, obj: unknown) {
  return new Response(JSON.stringify(obj), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

serve(async (req) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json(cors, 405, { error: "method not allowed" });

  const LIVEKIT_URL = Deno.env.get("LIVEKIT_URL") ?? "";
  const API_KEY = Deno.env.get("LIVEKIT_API_KEY") ?? "";
  const API_SECRET = Deno.env.get("LIVEKIT_API_SECRET") ?? "";
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  if (!LIVEKIT_URL || !API_KEY || !API_SECRET) return json(cors, 500, { error: "LiveKit não configurado" });

  // 1) Sessão do usuário (JWT do Supabase no header).
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return json(cors, 401, { error: "sem sessão" });
  const supa = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
  const { data: userData, error: userErr } = await supa.auth.getUser();
  const user = userData?.user;
  if (userErr || !user) return json(cors, 401, { error: "não autenticado" });

  // 2) É interno? (mesma regra do resto do sistema)
  const { data: isEmp, error: empErr } = await supa.rpc("is_employee", { uid: user.id });
  if (empErr) return json(cors, 500, { error: "falha ao validar usuário" });
  if (!isEmp) return json(cors, 403, { error: "acesso restrito a colaboradores" });

  // 3) Sala pedida.
  const body = await req.json().catch(() => ({}));
  const room = String((body as { room?: unknown }).room ?? "").trim();
  if (!room) return json(cors, 400, { error: "sala obrigatória" });

  // 4) Token com permissões mínimas (só esta sala, áudio) e TTL curto.
  const at = new AccessToken(API_KEY, API_SECRET, { identity: user.id, ttl: "2m" });
  at.addGrant({
    roomJoin: true,
    room,
    canPublish: true,
    canSubscribe: true,
    canPublishData: false,
  });
  const token = await at.toJwt();

  return json(cors, 200, { url: LIVEKIT_URL, token, identity: user.id });
});
