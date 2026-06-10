// ─────────────────────────────────────────────────────────────────────────────
// SISTEMAS do ecossistema (Camada 1) — fonte da verdade: profiles.allowed_interfaces.
//
// O Admin grava `allowed_interfaces` ao criar/editar o usuário. O Hub
// (carbohub.com.br) lê essa MESMA coluna e mapeia cada interface para o azulejo:
//   carbo_ops         → Carbo Controle
//   carbo_crm         → Carbo Sales
//   carbo_ops_app     → Carbo Ops (em breve)
//   portal_licenciado → Carbo Licenciados
//   portal_pdv        → Carbo Loja
//
// IMPORTANTE: esta lista espelha 1:1 os apps do Hub — assim dá pra liberar
// qualquer sistema, antecipando (mesmo os "em breve"). Carbo Admin NÃO entra
// aqui: o acesso ao Admin é derivado do perfil (command / head / TI).
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
  { iface: "carbo_ops_app",     label: "Carbo Ops",         hint: "Operação, logística e estoque", comingSoon: true },
  { iface: "portal_licenciado", label: "Carbo Licenciados", hint: "Portal do licenciado" },
  { iface: "portal_pdv",        label: "Carbo Loja",        hint: "Portal das lojas (PDV)" },
];

export const DEFAULT_INTERFACES = ["carbo_ops"];
