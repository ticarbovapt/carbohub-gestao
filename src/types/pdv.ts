// ============================================================
// PDVs CARBOZÉ - Tipos TypeScript
// ============================================================

export interface PDV {
  id: string;
  pdvCode: string;
  name: string;
  cnpj: string | null;
  contactName: string | null;
  contactPhone: string | null;
  email: string | null;
  
  // Address
  addressStreet: string | null;
  addressCity: string | null;
  addressState: string | null;
  addressZip: string | null;
  latitude: number | null;
  longitude: number | null;
  
  // Stock
  currentStock: number;
  minStockThreshold: number;
  avgDailyConsumption: number;
  lastReplenishmentAt: string | null;
  lastReplenishmentQty: number;
  
  // Status
  status: 'active' | 'inactive' | 'suspended';
  hasStockAlert: boolean;
  lastAlertAt: string | null;
  
  // Relationships
  assignedLicenseeId: string | null;
  
  // Metadata
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PDVReplenishmentHistory {
  id: string;
  pdvId: string;
  quantity: number;
  previousStock: number;
  newStock: number;
  serviceOrderId: string | null;
  notes: string | null;
  replenishedBy: string | null;
  createdAt: string;
}

export interface PDVUser {
  id: string;
  pdvId: string;
  userId: string;
  isPrimary: boolean;
  canRequestReplenishment: boolean;
  createdAt: string;
}

export const PDV_STATUS_INFO: Record<PDV['status'], {
  label: string;
  color: string;
  icon: string;
}> = {
  active: { label: 'Ativo', color: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300', icon: '✅' },
  inactive: { label: 'Inativo', color: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300', icon: '⏸️' },
  suspended: { label: 'Suspenso', color: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300', icon: '🚫' },
};
