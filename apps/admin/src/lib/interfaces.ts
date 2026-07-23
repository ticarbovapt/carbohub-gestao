// ─────────────────────────────────────────────────────────────────────────────
// SISTEMAS do ecossistema (Camada 1) — fonte da verdade: profiles.allowed_interfaces.
//
// O Admin grava `allowed_interfaces` ao criar/editar o usuário. O Hub
// (carbohub.com.br) lê essa MESMA coluna e mapeia cada interface para o azulejo:
//   carbo_ops         → Carbo Controle
//   carbo_crm         → Carbo Sales
//   carbo_ops_app     → Carbo Ops
//   portal_licenciado → Carbo Licenciados
//   portal_pdv        → Portal de Vendas (ex-"Carbo Loja")
//   carbo_admin       → Carbo Admin
//
// IMPORTANTE: esta lista espelha 1:1 os azulejos do Hub — assim dá pra liberar
// qualquer sistema, antecipando (mesmo os "em breve").
//
// Carbo Admin: a flag `carbo_admin` controla APENAS a exibição do card de Admin
// na tela inicial (carbohub.com.br). O ACESSO ao app Admin continua derivado do
// perfil (command / head / TI) no ProtectedRoute — marcar/desmarcar aqui não
// concede nem revoga entrada no Admin, só mostra/esconde o atalho no Hub.
// ─────────────────────────────────────────────────────────────────────────────

export interface SystemOption {
  iface: string;   // valor gravado em profiles.allowed_interfaces
  label: string;
  hint: string;
  comingSoon?: boolean;
}

export const SYSTEMS: SystemOption[] = [
  { iface: "carbo_ops",         label: "Carbo Controle",    hint: "Gestão interna, operação e estratégia" },
  { iface: "carbo_crm",         label: "Carbo Sales",       hint: "Comercial · funis, leads e vendas" },
  { iface: "carbo_ops_app",     label: "Carbo Ops",         hint: "Operação, logística e estoque" },
  { iface: "portal_licenciado", label: "Carbo Licenciados", hint: "Portal do licenciado" },
  { iface: "portal_pdv",        label: "Portal de Vendas",  hint: "Portal de Vendas (lojas/PDV)" },
  { iface: "carbo_financas",    label: "Carbo Finanças",    hint: "Financeiro — contas a pagar, NF, faturamento" },
  { iface: "carbo_mkt",         label: "Carbo Marketing",   hint: "Marketing — campanhas e ações" },
  { iface: "carbo_admin",       label: "Carbo Admin",       hint: "Identidades e acessos — só mostra o card no Hub (entrada é por perfil)" },
];

export const DEFAULT_INTERFACES = ["carbo_ops"];

// Identidade visual de cada app — usada nos "chips" da lista de usuários.
// short = rótulo curto; chip = classes do pill; dot = bolinha de cor.
export interface SystemBrand { short: string; chip: string; dot: string }
export const SYSTEM_BRAND: Record<string, SystemBrand> = {
  carbo_ops:         { short: "Controle",    chip: "bg-zinc-500/10 text-zinc-600 ring-1 ring-inset ring-zinc-500/20",       dot: "bg-zinc-400" },
  carbo_crm:         { short: "Sales",       chip: "bg-emerald-500/10 text-emerald-600 ring-1 ring-inset ring-emerald-500/20", dot: "bg-emerald-500" },
  carbo_ops_app:     { short: "Ops",         chip: "bg-blue-500/10 text-blue-600 ring-1 ring-inset ring-blue-500/20", dot: "bg-blue-500" },
  portal_licenciado: { short: "Licenciados", chip: "bg-violet-500/10 text-violet-600 ring-1 ring-inset ring-violet-500/20", dot: "bg-violet-500" },
  portal_pdv:        { short: "Vendas",      chip: "bg-amber-500/10 text-amber-600 ring-1 ring-inset ring-amber-500/20",     dot: "bg-amber-500" },
  carbo_financas:    { short: "Finanças",    chip: "bg-teal-500/10 text-teal-600 ring-1 ring-inset ring-teal-500/20",       dot: "bg-teal-500" },
  carbo_mkt:         { short: "Marketing",   chip: "bg-pink-500/10 text-pink-600 ring-1 ring-inset ring-pink-500/20",       dot: "bg-pink-500" },
  carbo_admin:       { short: "Admin",       chip: "bg-slate-500/10 text-slate-600 ring-1 ring-inset ring-slate-500/20",   dot: "bg-slate-500" },
};
export const brandOf = (iface: string): SystemBrand =>
  SYSTEM_BRAND[iface] ?? { short: iface, chip: "bg-muted text-muted-foreground ring-1 ring-inset ring-border", dot: "bg-muted-foreground" };
