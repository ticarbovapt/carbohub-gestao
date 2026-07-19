import { createClient } from "npm:@supabase/supabase-js@2.39.3";
import { Resend } from "https://esm.sh/resend@4.0.0";

// ─────────────────────────────────────────────────────────────────────────────
// login-notify — chamada no login (usuário autenticado). Registra o dispositivo
// (device_id do localStorage) e, se for um dispositivo NOVO e o usuário já tinha
// outros, envia um e-mail de alerta "novo acesso" (antifraude). Best-effort.
// ─────────────────────────────────────────────────────────────────────────────

const ALLOWED_ORIGINS = [
  "https://carbohub.com.br",
  "https://www.carbohub.com.br",
  "https://controle.carbohub.com.br",
  "https://admin.carbohub.com.br",
  "https://sales.carbohub.com.br",
  "https://ops.carbohub.com.br",
  "https://finance.carbohub.com.br",
  "https://lojas.carbohub.com.br",
  "https://licenciados.carbohub.com.br",
  "http://localhost:8080",
  "http://localhost:8081",
  "http://localhost:8082",
  "http://localhost:5173",
  "http://localhost:3000",
];

function getCorsHeaders(req: Request) {
  const origin = req.headers.get("origin") || "";
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

// Descrição amigável do dispositivo a partir do user-agent (aproximada).
function describeDevice(ua: string): string {
  if (!ua) return "dispositivo desconhecido";
  let browser = "Navegador";
  if (/edg/i.test(ua)) browser = "Edge";
  else if (/opr|opera/i.test(ua)) browser = "Opera";
  else if (/chrome|crios/i.test(ua)) browser = "Chrome";
  else if (/firefox|fxios/i.test(ua)) browser = "Firefox";
  else if (/safari/i.test(ua)) browser = "Safari";
  let os = "";
  if (/windows/i.test(ua)) os = "Windows";
  else if (/iphone|ipad|ipod/i.test(ua)) os = "iOS";
  else if (/android/i.test(ua)) os = "Android";
  else if (/mac os x|macintosh/i.test(ua)) os = "macOS";
  else if (/linux/i.test(ua)) os = "Linux";
  return os ? `${browser} em ${os}` : browser;
}

function alertaLoginEmail(fullName: string, device: string, quando: string): string {
  const YEAR = new Date().getUTCFullYear();
  const P = (h: string) => `<p style="margin:0 0 14px 0; font-family:Arial,Helvetica,sans-serif; font-size:15px; line-height:24px; color:#4B5563;">${h}</p>`;
  return `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark"><title>Novo acesso — CARBO Hub</title>
<!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]--></head>
<body style="margin:0; padding:0; background-color:#F4F6F5;">
<div style="display:none; max-height:0; overflow:hidden; font-size:1px; color:#F4F6F5;">Detectamos um novo acesso à sua conta.&#8203;&#8203;&#8203;&#8203;&#8203;&#8203;&#8203;&#8203;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#F4F6F5" style="background-color:#F4F6F5;"><tr><td align="center" style="padding:32px 16px;">
  <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="width:560px; max-width:560px; background-color:#FFFFFF; border-radius:14px; overflow:hidden; box-shadow:0 1px 3px rgba(15,64,45,0.08);">
    <tr><td style="height:5px; line-height:5px; font-size:5px; background:linear-gradient(90deg,#3DC559 0%,#2FA84F 45%,#3B7DD8 100%);">&nbsp;</td></tr>
    <tr><td align="center" bgcolor="#FFFFFF" style="background-color:#FFFFFF; padding:34px 40px 26px 40px;">
      <img src="https://www.carbohub.com.br/email/grupo-carbo.png" alt="Grupo Carbo" width="230" height="63" style="display:block; border:0; width:230px; height:63px; max-width:230px;">
    </td></tr>
    <tr><td style="padding:0 40px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="border-top:1px solid #E5E7EB; font-size:0; line-height:0;">&nbsp;</td></tr></table></td></tr>
    <tr><td style="padding:32px 40px 8px 40px; font-family:Arial,Helvetica,sans-serif;">
      <h1 style="margin:0 0 16px 0; font-size:22px; line-height:28px; font-weight:700; color:#1F2937;">Novo acesso à sua conta</h1>
      ${P(`Olá, <strong style="color:#0F402D;">${fullName}</strong>.`)}
      ${P(`Detectamos um <strong>novo acesso</strong> à sua conta do <strong style="color:#0F402D;">CARBO&nbsp;Hub</strong>:`)}
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:2px 0 14px 0; background-color:#F4F6F5; border-radius:10px;"><tr><td style="padding:14px 18px; font-family:Arial,Helvetica,sans-serif; font-size:14px; line-height:22px; color:#1F2937;">
        <strong>Dispositivo:</strong> ${device}<br><strong>Quando:</strong> ${quando}
      </td></tr></table>
      ${P(`<strong style="color:#1F2937;">Foi você?</strong> Pode ignorar este e-mail com segurança.`)}
      ${P(`<strong style="color:#1F2937;">Não reconhece este acesso?</strong> Troque sua senha e avise o TI imediatamente.`)}
    </td></tr>
    <tr><td style="padding:24px 40px 36px 40px; text-align:center; font-family:Arial,Helvetica,sans-serif;">
      <p style="margin:24px 0 0 0; font-size:15px; line-height:22px; font-weight:700; color:#0F402D; text-align:center;">Grupo Carbo</p>
      <p style="margin:4px 0 0 0; font-size:13px; line-height:20px; color:#6B7280; text-align:center;">o ecossistema que conecta operações com crescimento</p>
      <p style="margin:16px 0 0 0; font-size:12px; line-height:18px; color:#9CA3AF; text-align:center;">Este é um e-mail automático de segurança — por favor, não responda.</p>
      <p style="margin:8px 0 0 0; font-size:12px; line-height:18px; color:#9CA3AF; text-align:center;">© ${YEAR} Grupo Carbo. Todos os direitos reservados.</p>
    </td></tr>
  </table>
</td></tr></table></body></html>`;
}

Deno.serve(async (req: Request): Promise<Response> => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

  const json = (b: unknown, s = 200) =>
    new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json", ...cors } });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceRoleKey);

    const token = (req.headers.get("Authorization") || "").replace("Bearer ", "");
    if (!token) return json({ ok: false }, 401);
    const { data: userData, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !userData?.user) return json({ ok: false }, 401);
    const user = userData.user;

    const { device_id, user_agent } = await req.json() as { device_id?: string; user_agent?: string };
    if (!device_id) return json({ ok: false, error: "device_id ausente" }, 400);

    // Já conhece este dispositivo? → só atualiza o last_seen.
    const { data: existing } = await admin
      .from("user_known_devices")
      .select("id")
      .eq("user_id", user.id)
      .eq("device_id", device_id)
      .maybeSingle();

    if (existing) {
      await admin.from("user_known_devices").update({ last_seen: new Date().toISOString() }).eq("id", existing.id);
      return json({ ok: true, known: true });
    }

    // Dispositivo novo — quantos o usuário já tinha antes deste?
    const { count } = await admin
      .from("user_known_devices")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id);
    const priorDevices = count ?? 0;

    await admin.from("user_known_devices").insert({
      user_id: user.id,
      device_id,
      user_agent: user_agent ?? null,
    });

    // Só alerta se NÃO é o primeiro dispositivo (evita e-mail no onboarding).
    if (priorDevices > 0) {
      try {
        const resendApiKey = Deno.env.get("RESEND_API_KEY");
        const email = user.email;
        if (resendApiKey && email && !email.endsWith("@carbo.internal")) {
          const { data: prof } = await admin.from("profiles").select("full_name").eq("id", user.id).single();
          const quando = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "long", timeStyle: "short" });
          const resend = new Resend(resendApiKey);
          await resend.emails.send({
            from: "Grupo Carbo <noreply@carbohub.com.br>",
            to: [email],
            subject: "Novo acesso à sua conta CARBO Hub",
            html: alertaLoginEmail(prof?.full_name || "Usuário", describeDevice(user_agent ?? ""), quando),
          });
        }
      } catch (mailErr) {
        console.error("login-notify email error:", mailErr);
      }
    }

    return json({ ok: true, known: false, alerted: priorDevices > 0 });
  } catch (e) {
    console.error("login-notify error:", e);
    return json({ ok: false }, 200); // best-effort: nunca atrapalha o login
  }
});
