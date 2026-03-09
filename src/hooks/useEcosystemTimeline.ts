import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, subMonths, startOfMonth, endOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";

export interface TimelineDataPoint {
  date: string;
  label: string;
  licensees: number;
  machines: number;
  cumulativeLicensees: number;
  cumulativeMachines: number;
}

export function useEcosystemTimeline(months: number = 6) {
  return useQuery({
    queryKey: ["ecosystem-timeline", months],
    queryFn: async () => {
      // Get licensees and machines created_at data
      const [licenseeRes, machineRes] = await Promise.all([
        supabase.from("licensees").select("created_at").order("created_at"),
        supabase.from("machines").select("created_at").order("created_at"),
      ]);

      if (licenseeRes.error) throw licenseeRes.error;
      if (machineRes.error) throw machineRes.error;

      const licensees = licenseeRes.data || [];
      const machines = machineRes.data || [];

      // Generate timeline for the last N months
      const timeline: TimelineDataPoint[] = [];
      const now = new Date();

      for (let i = months - 1; i >= 0; i--) {
        const month = subMonths(now, i);
        const monthStart = startOfMonth(month);
        const monthEnd = endOfMonth(month);
        const monthKey = format(month, "yyyy-MM");
        const label = format(month, "MMM/yy", { locale: ptBR });

        // Count new licensees/machines in this month
        const newLicensees = licensees.filter((l) => {
          const d = new Date(l.created_at);
          return d >= monthStart && d <= monthEnd;
        }).length;

        const newMachines = machines.filter((m) => {
          const d = new Date(m.created_at);
          return d >= monthStart && d <= monthEnd;
        }).length;

        // Count cumulative (created before month end)
        const cumulativeLicensees = licensees.filter((l) => new Date(l.created_at) <= monthEnd).length;
        const cumulativeMachines = machines.filter((m) => new Date(m.created_at) <= monthEnd).length;

        timeline.push({
          date: monthKey,
          label,
          licensees: newLicensees,
          machines: newMachines,
          cumulativeLicensees,
          cumulativeMachines,
        });
      }

      return timeline;
    },
  });
}

export interface GeographicData {
  id: string;
  name: string;
  type: "licensee" | "machine" | "event";
  state: string | null;
  city: string | null;
  lat: number | null;
  lng: number | null;
  status: string;
  details?: string;
}

export function useGeographicDistribution() {
  return useQuery({
    queryKey: ["geographic-distribution"],
    queryFn: async () => {
      const [licenseeRes, machineRes, eventRes] = await Promise.all([
        supabase.from("licensees").select("id, name, address_state, address_city, status"),
        supabase
          .from("machines")
          .select("id, machine_id, model, location_state, location_city, latitude, longitude, status"),
        supabase
          .from("scheduled_events")
          .select(
            "id, title, start_date, status, service_order:service_orders(id, os_number, metadata)"
          ),
      ]);

      if (licenseeRes.error) throw licenseeRes.error;
      if (machineRes.error) throw machineRes.error;
      if (eventRes.error) throw eventRes.error;

      const licensees: GeographicData[] = (licenseeRes.data || []).map((l) => ({
        id: l.id,
        name: l.name,
        type: "licensee" as const,
        state: l.address_state,
        city: l.address_city,
        lat: null,
        lng: null,
        status: l.status,
      }));

      const machines: GeographicData[] = (machineRes.data || []).map((m) => ({
        id: m.id,
        name: `${m.machine_id} - ${m.model}`,
        type: "machine" as const,
        state: m.location_state,
        city: m.location_city,
        lat: m.latitude,
        lng: m.longitude,
        status: m.status,
      }));

      // For events, we need to extract location from service order metadata if available
      const events: GeographicData[] = (eventRes.data || []).map((e) => {
        const metadata = (e.service_order?.metadata as Record<string, unknown>) || {};
        return {
          id: e.id,
          name: e.title,
          type: "event" as const,
          state: (metadata.state as string) || null,
          city: (metadata.city as string) || null,
          lat: (metadata.lat as number) || null,
          lng: (metadata.lng as number) || null,
          status: e.status,
          details: e.service_order?.os_number || undefined,
        };
      });

      return { licensees, machines, events };
    },
  });
}
