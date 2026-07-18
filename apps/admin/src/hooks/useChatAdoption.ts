import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// Métricas de adoção do Carbo Chat — só AGREGADOS (nunca conteúdo de mensagem).
// Todas as RPCs são SECURITY DEFINER e guardadas por carbo_admin no banco.
// RPCs novas → cliente sem tipo gerado.
const db = supabase as unknown as { rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }> };

async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await db.rpc(fn, args);
  if (error) throw error;
  return data as T;
}

export interface AdoptionOverview {
  funcionarios: number;
  ativos_hoje: number;
  ativos_7d: number;
  ativos_30d: number;
  msgs_hoje: number;
  msgs_7d: number;
  msgs_30d: number;
  grupos_ativos: number;
  dms_ativas: number;
  com_push: number;
  sem_push: number;
}

export interface SeriesPoint {
  dia: string;
  usuarios_ativos: number;
  mensagens: number;
}

export interface DeptVolume {
  departamento: string;
  mensagens: number;
  usuarios_ativos: number;
}

export interface OnboardingRow {
  user_id: string;
  full_name: string | null;
  departamento: string;
  tem_push: boolean;
  usou_app: boolean;
  ultima_atividade: string | null;
}

export interface InactiveRow {
  user_id: string;
  full_name: string | null;
  departamento: string;
  ultima_msg: string | null;
  ultima_ativid: string | null;
  dias_inativo: number | null;
}

export interface ChannelStats {
  grupos_total: number;
  grupos_ativos_30d: number;
  dms_total: number;
  dms_ativas_30d: number;
  media_membros: number | null;
}

const STALE = 60_000;

export function useAdoptionOverview() {
  return useQuery({
    queryKey: ["chat-adoption", "overview"],
    staleTime: STALE,
    queryFn: async () => (await rpc<AdoptionOverview[]>("chat_adoption_overview"))?.[0] ?? null,
  });
}

export function useAdoptionSeries(days = 30) {
  return useQuery({
    queryKey: ["chat-adoption", "series", days],
    staleTime: STALE,
    queryFn: () => rpc<SeriesPoint[]>("chat_active_users_series", { p_days: days }),
  });
}

export function useVolumeByDepartment(from?: string, to?: string) {
  return useQuery({
    queryKey: ["chat-adoption", "by-dept", from, to],
    staleTime: STALE,
    queryFn: () => rpc<DeptVolume[]>("chat_volume_by_department", { p_from: from, p_to: to }),
  });
}

export function useOnboardingPendencies() {
  return useQuery({
    queryKey: ["chat-adoption", "onboarding"],
    staleTime: STALE,
    queryFn: () => rpc<OnboardingRow[]>("chat_onboarding_pendencies"),
  });
}

export function useInactiveUsers(days = 7) {
  return useQuery({
    queryKey: ["chat-adoption", "inactive", days],
    staleTime: STALE,
    queryFn: () => rpc<InactiveRow[]>("chat_inactive_users", { p_days: days }),
  });
}

export function useChannelStats() {
  return useQuery({
    queryKey: ["chat-adoption", "channels"],
    staleTime: STALE,
    queryFn: async () => (await rpc<ChannelStats[]>("chat_channel_stats"))?.[0] ?? null,
  });
}
