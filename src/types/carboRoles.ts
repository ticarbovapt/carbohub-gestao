// ============================================================
// CARBO OPS - Tipos de Governança por Pessoas e Roles
// ============================================================

/**
 * Os 6 papéis do Grupo Carbo baseados na realidade da empresa
 */
export type CarboRole = 
  | 'ceo'              // Admin Estratégico (CEO)
  | 'gestor_adm'       // Gestor Administrativo
  | 'gestor_fin'       // Gestor Financeiro
  | 'gestor_compras'   // Gestor Compras & Logística
  | 'operador_fiscal'  // Operador Fiscal
  | 'operador'         // Operadores Operacionais
  | 'licensed_user';   // Usuário Licenciado (Portal)

/**
 * Os 3 macrofluxos da OS
 */
export type MacroFlow = 
  | 'comercial'        // Cria OS, cadastra cliente, define expectativa
  | 'operacional'      // Executa serviço, anexa evidências, valida
  | 'adm_financeiro';  // Formaliza, emite docs, cobra, finaliza OS

/**
 * Departamentos organizacionais do Grupo Carbo
 */
export type OrgDepartment = 
  | 'b2b'
  | 'command'
  | 'expansao'
  | 'finance'
  | 'growth'
  | 'ops';

/**
 * Informações de display para cada departamento organizacional
 */
export const ORG_DEPARTMENT_INFO: Record<OrgDepartment, {
  name: string;
  fullName: string;
  description: string;
  icon: string;
  color: string;
  loginPrefix: string;
}> = {
  b2b: {
    name: 'B2B',
    fullName: 'Carbo B2B',
    description: 'Desenvolvimento de negócios corporativos',
    icon: '🏢',
    color: '#6366F1',
    loginPrefix: 'B2B',
  },
  command: {
    name: 'Command',
    fullName: 'Carbo Command',
    description: 'CEO e direção estratégica',
    icon: '👑',
    color: '#8B5CF6',
    loginPrefix: 'COM',
  },
  expansao: {
    name: 'Expansão',
    fullName: 'Carbo Expansão',
    description: 'Expansão nacional do varejo',
    icon: '🚀',
    color: '#10B981',
    loginPrefix: 'EXP',
  },
  finance: {
    name: 'Finance',
    fullName: 'Carbo Finance',
    description: 'Administrativo, RH e Financeiro',
    icon: '💰',
    color: '#F59E0B',
    loginPrefix: 'FIN',
  },
  growth: {
    name: 'Growth',
    fullName: 'Carbo Growth',
    description: 'Marketing, marca e crescimento',
    icon: '📈',
    color: '#EC4899',
    loginPrefix: 'GRO',
  },
  ops: {
    name: 'OPS',
    fullName: 'Carbo OPS',
    description: 'Operações, logística e produção',
    icon: '⚙️',
    color: '#3B82F6',
    loginPrefix: 'OPS',
  },
};

/**
 * Informações de display para cada role
 */
export const CARBO_ROLE_INFO: Record<CarboRole, {
  name: string;
  shortName: string;
  description: string;
  icon: string;
  color: string;
  level: 'strategic' | 'tactical' | 'operational';
}> = {
  ceo: {
    name: 'Admin Estratégico',
    shortName: 'CEO',
    description: 'Visão global, gargalos e KPIs estratégicos',
    icon: '👑',
    color: '#8B5CF6',
    level: 'strategic',
  },
  gestor_adm: {
    name: 'Gestor Administrativo',
    shortName: 'G. Adm',
    description: 'Gestão comercial e pós-venda',
    icon: '📋',
    color: '#10B981',
    level: 'tactical',
  },
  gestor_fin: {
    name: 'Gestor Financeiro',
    shortName: 'G. Fin',
    description: 'Cobrança, faturamento e controle financeiro',
    icon: '💰',
    color: '#F59E0B',
    level: 'tactical',
  },
  gestor_compras: {
    name: 'Gestor Compras & Logística',
    shortName: 'G. Compras',
    description: 'Preparação, expedição e logística',
    icon: '🚚',
    color: '#3B82F6',
    level: 'tactical',
  },
  operador_fiscal: {
    name: 'Operador Fiscal',
    shortName: 'Op. Fiscal',
    description: 'Documentação fiscal e notas',
    icon: '📄',
    color: '#EC4899',
    level: 'operational',
  },
  operador: {
    name: 'Operador',
    shortName: 'Operador',
    description: 'Execução operacional e checklists',
    icon: '⚙️',
    color: '#6B7280',
    level: 'operational',
  },
  licensed_user: {
    name: 'Licenciado',
    shortName: 'Licenciado',
    description: 'Acesso ao portal do licenciado',
    icon: '🏢',
    color: '#8B5CF6',
    level: 'operational',
  },
};

/**
 * Informações de display para cada macrofluxo
 */
export const MACRO_FLOW_INFO: Record<MacroFlow, {
  name: string;
  description: string;
  icon: string;
  color: string;
  departments: string[];
}> = {
  comercial: {
    name: 'Comercial',
    description: 'Cria OS, cadastra cliente/licenciado, define expectativa',
    icon: '🔵',
    color: '#3B82F6',
    departments: ['venda', 'b2b', 'expansao', 'growth'],
  },
  operacional: {
    name: 'Operacional',
    description: 'Executa serviço, anexa evidências, valida tecnicamente',
    icon: '🟡',
    color: '#F59E0B',
    departments: ['preparacao', 'expedicao', 'operacao', 'ops'],
  },
  adm_financeiro: {
    name: 'Administrativo-Financeiro',
    description: 'Formaliza, emite documentos, cobra, finaliza OS',
    icon: '🟢',
    color: '#10B981',
    departments: ['pos_venda', 'finance'],
  },
};

/**
 * Ordem dos macrofluxos
 */
export const MACRO_FLOW_ORDER: MacroFlow[] = [
  'comercial',
  'operacional',
  'adm_financeiro',
];

/**
 * Helper para verificar se um role é gestor
 */
export function isGestorRole(role: CarboRole): boolean {
  return ['ceo', 'gestor_adm', 'gestor_fin', 'gestor_compras'].includes(role);
}

/**
 * Helper para verificar se um role é operador
 */
export function isOperadorRole(role: CarboRole): boolean {
  return ['operador', 'operador_fiscal'].includes(role);
}

/**
 * Helper para obter o nível hierárquico de um role
 */
export function getRoleLevel(role: CarboRole): 'strategic' | 'tactical' | 'operational' {
  return CARBO_ROLE_INFO[role].level;
}

/**
 * Mapeamento de departamento para macrofluxo
 */
export const DEPARTMENT_TO_MACRO_FLOW: Record<string, MacroFlow> = {
  // Legados
  venda: 'comercial',
  preparacao: 'operacional',
  expedicao: 'operacional',
  operacao: 'operacional',
  pos_venda: 'adm_financeiro',
  // Novos
  b2b: 'comercial',
  command: 'comercial',
  expansao: 'comercial',
  finance: 'adm_financeiro',
  growth: 'comercial',
  ops: 'operacional',
};

/**
 * Interface para acesso a etapa da OS
 */
export interface OsStageAccess {
  role: CarboRole;
  departmentType: string;
  canView: boolean;
  canExecute: boolean;
  canValidate: boolean;
}

/**
 * Interface para role do usuário Carbo
 */
export interface CarboUserRole {
  id: string;
  userId: string;
  role: CarboRole;
  scopeDepartments: string[];
  scopeMacroFlows: MacroFlow[];
  createdAt: string;
  createdBy?: string;
}

/**
 * Tipos de departamento do sistema (legado + novos)
 */
export type DepartmentType = 
  | 'venda'
  | 'preparacao'
  | 'expedicao'
  | 'operacao'
  | 'pos_venda'
  | 'b2b'
  | 'command'
  | 'expansao'
  | 'finance'
  | 'growth'
  | 'ops';

/**
 * Array de todos os roles para uso em selects e iterações
 */
export const CARBO_ROLES: Array<{
  id: CarboRole;
  name: string;
  description: string;
  icon: string;
}> = [
  { id: 'ceo', name: 'Admin Estratégico (CEO)', description: 'Visão global e estratégica', icon: '👑' },
  { id: 'gestor_adm', name: 'Gestor Administrativo', description: 'Gestão comercial e pós-venda', icon: '📋' },
  { id: 'gestor_fin', name: 'Gestor Financeiro', description: 'Cobrança e controle financeiro', icon: '💰' },
  { id: 'gestor_compras', name: 'Gestor Compras & Logística', description: 'Preparação e expedição', icon: '🚚' },
  { id: 'operador_fiscal', name: 'Operador Fiscal', description: 'Documentação fiscal', icon: '📄' },
  { id: 'operador', name: 'Operador', description: 'Execução operacional', icon: '⚙️' },
  { id: 'licensed_user', name: 'Licenciado', description: 'Portal do licenciado', icon: '🏢' },
];

/**
 * Array de todos os macro fluxos para uso em selects e iterações
 */
export const MACRO_FLOWS: Array<{
  id: MacroFlow;
  name: string;
  description: string;
  icon: string;
}> = [
  { id: 'comercial', name: 'Comercial', description: 'Vendas e cadastro de clientes', icon: '🔵' },
  { id: 'operacional', name: 'Operacional', description: 'Execução e produção', icon: '🟡' },
  { id: 'adm_financeiro', name: 'Adm-Financeiro', description: 'Faturamento e cobrança', icon: '🟢' },
];

/**
 * Array de departamentos organizacionais (novos)
 */
export const ORG_DEPARTMENTS: Array<{
  id: OrgDepartment;
  name: string;
  fullName: string;
  loginPrefix: string;
}> = [
  { id: 'b2b', name: 'B2B', fullName: 'Carbo B2B', loginPrefix: 'B2B' },
  { id: 'command', name: 'Command', fullName: 'Carbo Command', loginPrefix: 'COM' },
  { id: 'expansao', name: 'Expansão', fullName: 'Carbo Expansão', loginPrefix: 'EXP' },
  { id: 'finance', name: 'Finance', fullName: 'Carbo Finance', loginPrefix: 'FIN' },
  { id: 'growth', name: 'Growth', fullName: 'Carbo Growth', loginPrefix: 'GRO' },
  { id: 'ops', name: 'OPS', fullName: 'Carbo OPS', loginPrefix: 'OPS' },
];

/**
 * Array de todos os departamentos para uso em selects e iterações (legado + novos)
 */
export const DEPARTMENT_TYPES: Array<{
  id: DepartmentType;
  name: string;
  macroFlow: MacroFlow;
}> = [
  // Novos departamentos organizacionais
  { id: 'b2b', name: 'Carbo B2B', macroFlow: 'comercial' },
  { id: 'command', name: 'Carbo Command', macroFlow: 'comercial' },
  { id: 'expansao', name: 'Carbo Expansão', macroFlow: 'comercial' },
  { id: 'finance', name: 'Carbo Finance', macroFlow: 'adm_financeiro' },
  { id: 'growth', name: 'Carbo Growth', macroFlow: 'comercial' },
  { id: 'ops', name: 'Carbo OPS', macroFlow: 'operacional' },
  // Legados (mantidos para compatibilidade OS workflow)
  { id: 'venda', name: 'Venda', macroFlow: 'comercial' },
  { id: 'preparacao', name: 'Preparação', macroFlow: 'operacional' },
  { id: 'expedicao', name: 'Expedição', macroFlow: 'operacional' },
  { id: 'operacao', name: 'Operação', macroFlow: 'operacional' },
  { id: 'pos_venda', name: 'Pós-Venda', macroFlow: 'adm_financeiro' },
];
