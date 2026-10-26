// Prints da área "comercial" (ver shots.mjs): Minha Equipe e Carbo Chat.
// O número de cada marcador é o MESMO `n` do item em src/docs/secoes/comercial.ts.
const btn = (t) => (p) => p.getByRole("button", { name: t });
const sel = (s) => (p) => p.locator(s);
const dlg = (p) => p.locator('[role="dialog"]').last();
const card = (t) => (p) => p.locator("main div.rounded-xl, main div.rounded-2xl").filter({ hasText: t }).last();
const linhaMeta = (nome) => (p) => p.locator("main div.border-l-2").filter({ hasText: nome }).first();
const linhaPdv = (nome) => (p) => p.locator("tbody tr").filter({ hasText: nome }).first();
const ALTO = { width: 1440, height: 1500 };
const LARGO = { width: 1920, height: 1000 };

export const SHOTS = [
  // ── Carbo Chat ──
  { chave: "chat", papel: "colaborador", url: "/chat?c=ch-dm", marcas: [
    [1, sel('aside a[href="/chat"]')],
    [2, sel('button[title="Definir meu status"]')],
    [3, sel('button[aria-label="Início"]')],
    [4, sel('button[aria-label="Explorar canais públicos"]')],
    [5, sel('button[aria-label="Mensagens agendadas"]')],
    [6, sel('button[aria-label="Nova conversa ou grupo"]')],
    [7, sel('input[aria-label="Buscar conversas e mensagens"]')],
    [8, (p) => p.getByRole("button", { name: "Tudo", exact: true }).locator("..")],
    [9, (p) => p.getByText("Comercial NE").first().locator("xpath=ancestor::*[self::button or self::div[@role='button'] or self::a][1]")],
    [10, sel('button[aria-label="Ligar (voz)"]')],
    [11, sel('button[aria-label="Buscar na conversa"]')],
    [12, (p) => p.getByText("👍").first()],
    [13, sel('button[aria-label="Adicionar anexo ou enquete"]')],
    [14, sel('[aria-label="Escrever mensagem"]')],
  ] },
];
