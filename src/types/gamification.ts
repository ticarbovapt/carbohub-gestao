// ============================================================
// GAMIFICAÇÃO DE LICENCIADOS - Tipos TypeScript
// ============================================================

export type LicenseeLevel = 'bronze' | 'prata' | 'ouro' | 'diamante';

export interface LicenseeGamification {
  id: string;
  licenseeId: string;
  periodYear: number;
  periodMonth: number;
  
  // KPI Scores (0-100 cada, com peso aplicado)
  orderVolumeScore: number;        // 25%
  customerRecurrenceScore: number; // 30%
  growthScore: number;             // 20%
  slaScore: number;                // 15%
  platformUsageScore: number;      // 10%
  
  // Resultado
  totalScore: number;
  level: LicenseeLevel;
  
  // Métricas brutas
  totalOrders: number;
  uniqueCustomers: number;
  returningCustomers: number;
  previousMonthOrders: number;
  avgSlaHours: number;
  reworkCount: number;
  
  // Meta
  calculatedAt: string;
  isVisible: boolean;
  createdAt: string;
}

export const LEVEL_INFO: Record<LicenseeLevel, {
  name: string;
  icon: string;
  color: string;
  badgeClass: string;
  minScore: number;
}> = {
  bronze: {
    name: 'Bronze',
    icon: '🥉',
    color: '#CD7F32',
    badgeClass: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-300 border-amber-300',
    minScore: 0,
  },
  prata: {
    name: 'Prata',
    icon: '🥈',
    color: '#C0C0C0',
    badgeClass: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-400',
    minScore: 50,
  },
  ouro: {
    name: 'Ouro',
    icon: '🥇',
    color: '#FFD700',
    badgeClass: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300 border-yellow-400',
    minScore: 70,
  },
  diamante: {
    name: 'Diamante',
    icon: '💎',
    color: '#B9F2FF',
    badgeClass: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-300 border-cyan-400',
    minScore: 90,
  },
};

export const KPI_WEIGHTS = {
  orderVolume: 0.25,
  customerRecurrence: 0.30,
  growth: 0.20,
  sla: 0.15,
  platformUsage: 0.10,
} as const;
