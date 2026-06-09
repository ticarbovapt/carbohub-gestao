// ─────────────────────────────────────────────────────────────────────────────
// SISTEMAS do ecossistema (Camada 1) — fonte da verdade: profiles.allowed_interfaces.
//
// O Admin grava `allowed_interfaces` ao criar o usuário. O Hub (carbohub.com.br)
// lê essa mesma coluna e mapeia cada interface para o azulejo correspondente:
//   carbo_ops         → Controle
//   carbo_crm         → CRM
//   portal_licenciado → Licenciados
//   portal_pdv        → Loja
// ─────────────────────────────────────────────────────────────────────────────

export interface SystemOption {
  iface: string;   // valor gravado em profiles.allowed_interfaces
  label: string;
  hint: string;
}

export const SYSTEMS: SystemOption[] = [
  { iface: "carbo_ops",         label: "Carbo Controle", hint: "Gestão interna, operação e estratégia" },
  { iface: "carbo_crm",         label: "Carbo CRM",      hint: "Comercial, funis e vendas" },
  { iface: "portal_licenciado", label: "Licenciados",    hint: "Portal do licenciado" },
  { iface: "portal_pdv",        label: "Loja",           hint: "Portal das lojas (PDV)" },
];

export const DEFAULT_INTERFACES = ["carbo_ops"];
