import { createClient } from "npm:@supabase/supabase-js@2.39.3";
import { Resend } from "https://esm.sh/resend@4.0.0";

// ─────────────────────────────────────────────────────────────────────────────
// send-email — módulo de e-mail transacional COMPARTILHADO do ecossistema Carbo.
//
// Um único ponto de envio (identidade Grupo Carbo) reusado por vários casos:
//   template "orcamento"        → envia o PDF do orçamento ao cliente
//   template "boas_vindas"      → após 1º login (e-mail definitivo da pessoa)
//   template "senha_alterada"   → confirmação de troca de senha
//   template "alerta_seguranca" → aviso genérico de segurança (login novo, etc.)
//
// Acesso: só FUNCIONÁRIO autenticado dispara (valida is_employee). Anexos vêm
// em base64 (o PDF é gerado no front com jsPDF e mandado pra cá).
// ─────────────────────────────────────────────────────────────────────────────

const ALLOWED_ORIGINS = [
  "https://controle.carbohub.com.br",
  "https://carbohub.com.br",
  "https://www.carbohub.com.br",
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

// ── Identidade visual (mesma do e-mail de reset) ────────────────────────────
const LOGO = "https://www.carbohub.com.br/email/grupo-carbo.png";

/** Casca de e-mail à prova de cliente (tabelas, CSS inline, header branco, dark-ok). */
function brandedEmail(opts: { preheader: string; title: string; bodyHtml: string }): string {
  const YEAR = new Date().getUTCFullYear();
  return `<!DOCTYPE html>
<html lang="pt-BR" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${opts.title} — CARBO Hub</title>
<!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
</head>
<body style="margin:0; padding:0; background-color:#F4F6F5;">
<div style="display:none; max-height:0; overflow:hidden; font-size:1px; line-height:1px; color:#F4F6F5; opacity:0;">${opts.preheader}&#8203;&#8203;&#8203;&#8203;&#8203;&#8203;&#8203;&#8203;&#8203;&#8203;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#F4F6F5" style="background-color:#F4F6F5;"><tr><td align="center" style="padding:32px 16px;">
  <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="width:560px; max-width:560px; background-color:#FFFFFF; border-radius:14px; overflow:hidden; box-shadow:0 1px 3px rgba(15,64,45,0.08);">
    <tr><td style="height:5px; line-height:5px; font-size:5px; background:linear-gradient(90deg,#3DC559 0%,#2FA84F 45%,#3B7DD8 100%);">&nbsp;</td></tr>
    <tr><td align="center" bgcolor="#FFFFFF" style="background-color:#FFFFFF; padding:34px 40px 26px 40px;">
      <img src="${LOGO}" alt="Grupo Carbo" width="230" height="63" style="display:block; border:0; width:230px; height:63px; max-width:230px;">
    </td></tr>
    <tr><td style="padding:0 40px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="border-top:1px solid #E5E7EB; font-size:0; line-height:0;">&nbsp;</td></tr></table></td></tr>
    <tr><td style="padding:32px 40px 8px 40px; font-family:Arial,Helvetica,sans-serif;">
      <h1 style="margin:0 0 16px 0; font-size:22px; line-height:28px; font-weight:700; color:#1F2937;">${opts.title}</h1>
      ${opts.bodyHtml}
    </td></tr>
    <tr><td style="padding:24px 40px 36px 40px; text-align:center; font-family:Arial,Helvetica,sans-serif;">
      <p style="margin:24px 0 0 0; font-size:15px; line-height:22px; font-weight:700; color:#0F402D; text-align:center;">Grupo Carbo</p>
      <p style="margin:4px 0 0 0; font-size:13px; line-height:20px; color:#6B7280; text-align:center;">o ecossistema que conecta operações com crescimento</p>
      <p style="margin:16px 0 0 0; font-size:12px; line-height:18px; color:#9CA3AF; text-align:center;">Este é um e-mail automático — por favor, não responda diretamente.</p>
      <p style="margin:8px 0 0 0; font-size:12px; line-height:18px; color:#9CA3AF; text-align:center;">© ${YEAR} Grupo Carbo. Todos os direitos reservados.</p>
    </td></tr>
  </table>
</td></tr></table>
</body></html>`;
}

const p = (html: string) =>
  `<p style="margin:0 0 14px 0; font-family:Arial,Helvetica,sans-serif; font-size:15px; line-height:24px; color:#4B5563;">${html}</p>`;

// ── Registro de templates ────────────────────────────────────────────────────
// Cada template recebe `data` e devolve { subject, html }.
type TemplateFn = (d: Record<string, unknown>) => { subject: string; html: string };

const TEMPLATES: Record<string, TemplateFn> = {
  orcamento: (d) => {
    const cliente = String(d.customer_name || "Cliente");
    const numero = d.order_number ? `Nº ${d.order_number}` : "";
    const vendedor = d.vendedor_name ? String(d.vendedor_name) : "";
    return {
      subject: `Seu orçamento Carbo ${numero}`.trim(),
      html: brandedEmail({
        preheader: `Segue em anexo o seu orçamento ${numero}.`,
        title: "Seu orçamento",
        bodyHtml:
          p(`Olá, <strong style="color:#0F402D;">${cliente}</strong> 👋`) +
          p(`Segue em anexo o seu orçamento ${numero ? `<strong>${numero}</strong> ` : ""}em PDF.`) +
          p(`Qualquer dúvida sobre valores, prazos ou condições, é só responder para o nosso time comercial${vendedor ? ` (${vendedor})` : ""} — teremos prazer em ajudar.`) +
          p(`<span style="color:#6B7280; font-size:13px;">Este orçamento tem validade conforme indicado no documento anexo.</span>`),
      }),
    };
  },

  boas_vindas: (d) => {
    const nome = String(d.full_name || "Seja bem-vindo(a)");
    return {
      subject: `Bem-vindo(a) ao CARBO Hub, ${String(d.first_name || nome).split(" ")[0]}!`,
      html: brandedEmail({
        preheader: "Seu acesso ao ecossistema Carbo está pronto.",
        title: "Bem-vindo(a) ao ecossistema Carbo",
        bodyHtml:
          p(`Olá, <strong style="color:#0F402D;">${nome}</strong> 👋`) +
          p(`Seu acesso ao <strong style="color:#0F402D;">CARBO&nbsp;Hub</strong> está ativo. A partir do Hub você chega a todos os sistemas que fazem parte do seu dia a dia — em um só lugar.`) +
          p(`Acesse por <a href="https://carbohub.com.br" style="color:#2FA84F; font-weight:600;">carbohub.com.br</a> com o seu login.`) +
          p(`<span style="color:#6B7280; font-size:13px;">Dica de segurança: a Carbo <strong>nunca</strong> pede sua senha por e-mail ou WhatsApp.</span>`),
      }),
    };
  },

  senha_alterada: (d) => ({
    subject: "Sua senha do CARBO Hub foi alterada",
    html: brandedEmail({
      preheader: "Confirmação: a senha da sua conta foi alterada.",
      title: "Senha alterada",
      bodyHtml:
        p(`Olá, <strong style="color:#0F402D;">${String(d.full_name || "Usuário")}</strong>.`) +
        p(`A senha da sua conta no <strong style="color:#0F402D;">CARBO&nbsp;Hub</strong> foi alterada com sucesso.`) +
        p(`<strong style="color:#1F2937;">Não foi você?</strong> Avise o TI imediatamente — sua conta pode estar comprometida.`),
    }),
  }),

  alerta_seguranca: (d) => ({
    subject: String(d.subject || "Alerta de segurança — CARBO Hub"),
    html: brandedEmail({
      preheader: String(d.preheader || "Aviso de segurança da sua conta."),
      title: String(d.title || "Alerta de segurança"),
      bodyHtml:
        p(`Olá, <strong style="color:#0F402D;">${String(d.full_name || "Usuário")}</strong>.`) +
        p(String(d.message || "Detectamos uma atividade que merece sua atenção na sua conta.")) +
        p(`<strong style="color:#1F2937;">Não reconhece esta ação?</strong> Avise o TI imediatamente.`),
    }),
  }),
};

interface Attachment { filename: string; content: string } // content = base64 (sem data: prefix)

Deno.serve(async (req: Request): Promise<Response> => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: cors });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...cors } });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) return json({ error: "RESEND_API_KEY ausente" }, 500);

    // Autenticação: exige funcionário logado (evita spam por terceiros).
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    if (!token) return json({ error: "Não autenticado" }, 401);

    const admin = createClient(supabaseUrl, serviceRoleKey);
    const { data: userData, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !userData?.user) return json({ error: "Sessão inválida" }, 401);

    const { data: isEmp } = await admin.rpc("is_employee", { uid: userData.user.id });
    if (!isEmp) return json({ error: "Apenas funcionários podem enviar e-mails" }, 403);

    const { template, to, data, attachments, replyTo } = await req.json() as {
      template: string; to: string | string[]; data?: Record<string, unknown>;
      attachments?: Attachment[]; replyTo?: string;
    };

    const tpl = TEMPLATES[template];
    if (!tpl) return json({ error: `Template desconhecido: ${template}` }, 400);
    const recipients = Array.isArray(to) ? to.filter(Boolean) : [to].filter(Boolean);
    if (recipients.length === 0) return json({ error: "Destinatário (to) ausente" }, 400);

    const { subject, html } = tpl(data ?? {});

    const resend = new Resend(resendApiKey);
    const { data: sent, error: sendErr } = await resend.emails.send({
      from: "Grupo Carbo <noreply@carbohub.com.br>",
      to: recipients,
      subject,
      html,
      ...(replyTo ? { reply_to: replyTo } : {}),
      ...(attachments && attachments.length
        ? { attachments: attachments.map((a) => ({ filename: a.filename, content: a.content })) }
        : {}),
    });

    if (sendErr) {
      console.error("Resend error:", sendErr);
      return json({ error: "Falha no envio", detail: sendErr }, 502);
    }
    return json({ success: true, id: sent?.id ?? null });
  } catch (e) {
    console.error("send-email error:", e);
    return json({ error: e instanceof Error ? e.message : "erro" }, 500);
  }
});
