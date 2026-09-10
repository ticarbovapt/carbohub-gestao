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
//   portal_micro      → Portal de Microdistribuidores (md.carbohub.com.br)
//   carbo_admin       → Carbo Admin
//   carbo_atendimento → Carbo Atendimento (atendimento.carbohub.com.br)
//
// IMPORTANTE: esta lista espelha 1:1 os azulejos do Hub — assim dá pra liberar
// qualquer sistema, antecipando (mesmo os "em breve").
//
// ⚠️ Carbo Admin: a flag `carbo_admin` É O ACESSO, e não só o atalho.
// Este comentário dizia o contrário — que a entrada vinha do perfil
// (command/head/TI) — e descrevia uma versão antiga do `ProtectedRoute`. Hoje o
// gate é uma linha só:
//
//     hasAdminInterface: (profile?.allowed_interfaces ?? []).includes("carbo_admin")
//
// Marcar aqui CONCEDE entrada; desmarcar REVOGA. Comentário que descreve a
// versão anterior é pior que nenhum: quem foi liberar acesso leu que marcar não
// adiantava.
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
  { iface: "portal_pdv",        label: "Portal de Vendas",  hint: "Portal de Vendas — lojas e PDVs do Grupo Carbo (lojas.carbohub.com.br)" },
  // ⚠️ O md ganhou chave PRÓPRIA em 10/09/2026. Até então ele não tinha
  // nenhuma: quem é interno entrava lá por `produtos.is_carbo_admin()`,
  // que lê `portal_pdv` — ou seja, liberar o Portal de Vendas para alguém
  // liberava TAMBÉM o Portal de Microdistribuidores, e o azulejo aparecia
  // no Hub sem ninguém ter decidido isso. Agora são duas caixinhas.
  //
  // Do lado do banco quem responde é `produtos.is_carbo_md()`
  // (`20260930120000` do carbohub-produtos), e ela AINDA aceita
  // `portal_pdv` por legado, para ninguém perder acesso no dia do deploy.
  // Ou seja: o azulejo (que segue só esta caixinha) mostra MENOS gente do
  // que a porta aceita — a assimetria segura. O contrário é que é ruim:
  // azulejo que aparece e não abre.
  //
  // ⚠️ NÃO entra em `carbo_interface_e_interna()`. Ela é a lista do TIME
  // INTERNO (sininho e RLS), e o md é portal EXTERNO — a mesma razão pela
  // qual `portal_pdv` e `portal_licenciado` ficam de fora.
  { iface: "portal_micro",      label: "Portal de Microdistribuidores", hint: "Funil, clientes, depósito e vendas do microdistribuidor (md.carbohub.com.br)" },
  { iface: "carbo_financas",    label: "Carbo Finanças",    hint: "Financeiro — contas a pagar, NF, faturamento" },
  { iface: "carbo_mkt",         label: "Carbo Marketing",   hint: "Marketing — campanhas e ações" },
  { iface: "carbo_ti",          label: "Carbo TI",          hint: "Central de demandas do TI — bugs, sugestões e execução (ti.carbohub.com.br)" },
  { iface: "carbo_atendimento", label: "Carbo Atendimento", hint: "Atendimento ao cliente — conversas do WhatsApp e pós-venda (atendimento.carbohub.com.br)" },
  { iface: "carbo_admin",       label: "Carbo Admin",       hint: "Identidades e acessos — marcar aqui LIBERA a entrada no Admin" },
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
  // ⚠️ A cor é a MESMA do azulejo do Hub e do switcher (#C2410C, terracota).
  // Laranja de marca foi descartado: ao lado do âmbar do Ops, a um metro,
  // são a mesma cor — a medida já registrada no `atendimento`.
  portal_micro:      { short: "Micro",       chip: "bg-orange-700/10 text-orange-700 ring-1 ring-inset ring-orange-700/20", dot: "bg-orange-700" },
  carbo_financas:    { short: "Finanças",    chip: "bg-teal-500/10 text-teal-600 ring-1 ring-inset ring-teal-500/20",       dot: "bg-teal-500" },
  carbo_mkt:         { short: "Marketing",   chip: "bg-pink-500/10 text-pink-600 ring-1 ring-inset ring-pink-500/20",       dot: "bg-pink-500" },
  carbo_ti:          { short: "TI",          chip: "bg-sky-500/10 text-sky-600 ring-1 ring-inset ring-sky-500/20",         dot: "bg-sky-500" },
  carbo_atendimento: { short: "Atendimento", chip: "bg-purple-500/10 text-purple-600 ring-1 ring-inset ring-purple-500/20", dot: "bg-purple-500" },
  carbo_admin:       { short: "Admin",       chip: "bg-slate-500/10 text-slate-600 ring-1 ring-inset ring-slate-500/20",   dot: "bg-slate-500" },
};
export const brandOf = (iface: string): SystemBrand =>
  SYSTEM_BRAND[iface] ?? { short: iface, chip: "bg-muted text-muted-foreground ring-1 ring-inset ring-border", dot: "bg-muted-foreground" };
