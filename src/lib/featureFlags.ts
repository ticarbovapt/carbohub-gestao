/**
 * Carbo Feature Flags
 * 
 * Controls visibility of platform areas.
 * Set to false to hide from navigation/routes without removing code.
 * Future: move to DB/remote config for runtime toggling.
 */

export const FEATURE_FLAGS = {
  // Core areas — always on
  dashboard: true,
  team: true,
  orders: true,
  os_board: true,
  scheduling: true,

  // Operational areas
  logistics: true,
  machines: true,
  suprimentos: true,
  purchasing: true,
  financeiro: true,
  checklist: true,

  // Intelligence & AI
  ai_assistant: true,
  intelligence: false, // freeze until v2

  // Maps
  territorial_map: true,

  // Licensee portal
  licensee_portal: true,
  licensee_commissions: true,
  licensee_credits: true,
  carbovapt: true,

  // PDV portal
  pdv_portal: true,

  // Admin areas
  admin_panel: true,
  governance: true,
  cockpit: true,
  data_import: true,

  // Analytics
  analytics: true,

  // Onboarding
  onboarding: true,
} as const;

export type FeatureFlag = keyof typeof FEATURE_FLAGS;

export function isFeatureEnabled(flag: FeatureFlag): boolean {
  return FEATURE_FLAGS[flag] ?? false;
}
