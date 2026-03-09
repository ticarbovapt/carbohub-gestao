import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface TerritorialLicensee {
  id: string;
  name: string;
  code: string;
  status: string;
  state: string | null;
  city: string | null;
  lat: number | null;
  lng: number | null;
  totalMachines: number;
  coverageStates: string[];
}

export interface TerritorialPDV {
  id: string;
  pdvCode: string;
  name: string;
  status: string;
  state: string | null;
  city: string | null;
  lat: number | null;
  lng: number | null;
  currentStock: number;
  minStockThreshold: number;
  hasStockAlert: boolean;
  assignedLicenseeId: string | null;
}

export interface TerritorialOS {
  id: string;
  osNumber: string;
  title: string;
  status: string;
  currentDepartment: string;
  state: string | null;
  city: string | null;
  lat: number | null;
  lng: number | null;
  priority: number;
  dueDate: string | null;
  slaBreach: boolean;
  operationType: string | null;
}

export interface TerritorialMachine {
  id: string;
  machineId: string;
  model: string;
  status: string;
  state: string | null;
  city: string | null;
  lat: number | null;
  lng: number | null;
  hasActiveAlert: boolean;
  licenseeId: string | null;
}

export interface TerritorialStats {
  totalStates: number;
  totalCities: number;
  activeOS: number;
  slaBreaches: number;
  activeLicensees: number;
  activePDVs: number;
  stockAlerts: number;
}

export interface TerritorialFilters {
  states: string[];
  cities: string[];
  status: string[];
  operationType: string[];
}

export function useTerritorialData(filters?: TerritorialFilters) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["territorial-data", filters, user?.id],
    queryFn: async () => {
      // Fetch all data in parallel
      const [licenseeRes, pdvRes, osRes, machineRes] = await Promise.all([
        supabase
          .from("licensees")
          .select("id, name, code, status, address_state, address_city, total_machines, coverage_states")
          .order("name"),
        supabase
          .from("pdvs")
          .select("id, pdv_code, name, status, address_state, address_city, latitude, longitude, current_stock, min_stock_threshold, has_stock_alert, assigned_licensee_id")
          .order("name"),
        supabase
          .from("service_orders")
          .select(`
            id, 
            os_number, 
            title, 
            status, 
            current_department, 
            priority, 
            due_date, 
            stage_sla_deadline,
            metadata
          `)
          .neq("status", "completed")
          .neq("status", "cancelled")
          .order("created_at", { ascending: false }),
        supabase
          .from("machines")
          .select("id, machine_id, model, status, location_state, location_city, latitude, longitude, has_active_alert, licensee_id")
          .order("machine_id"),
      ]);

      if (licenseeRes.error) throw licenseeRes.error;
      if (pdvRes.error) throw pdvRes.error;
      if (osRes.error) throw osRes.error;
      if (machineRes.error) throw machineRes.error;

      // Transform licensees
      const licensees: TerritorialLicensee[] = (licenseeRes.data || []).map((l) => ({
        id: l.id,
        name: l.name,
        code: l.code,
        status: l.status,
        state: l.address_state,
        city: l.address_city,
        lat: null,
        lng: null,
        totalMachines: l.total_machines || 0,
        coverageStates: l.coverage_states || [],
      }));

      // Transform PDVs
      const pdvs: TerritorialPDV[] = (pdvRes.data || []).map((p) => ({
        id: p.id,
        pdvCode: p.pdv_code,
        name: p.name,
        status: p.status,
        state: p.address_state,
        city: p.address_city,
        lat: p.latitude ? Number(p.latitude) : null,
        lng: p.longitude ? Number(p.longitude) : null,
        currentStock: p.current_stock,
        minStockThreshold: p.min_stock_threshold,
        hasStockAlert: p.has_stock_alert || false,
        assignedLicenseeId: p.assigned_licensee_id,
      }));

      // Transform OS - extract location from metadata
      const serviceOrders: TerritorialOS[] = (osRes.data || []).map((os) => {
        const metadata = (os.metadata as Record<string, unknown>) || {};
        const now = new Date();
        const slaDeadline = os.stage_sla_deadline ? new Date(os.stage_sla_deadline) : null;
        const slaBreach = slaDeadline ? slaDeadline < now : false;

        return {
          id: os.id,
          osNumber: os.os_number,
          title: os.title,
          status: os.status,
          currentDepartment: os.current_department,
          state: (metadata.state as string) || null,
          city: (metadata.city as string) || null,
          lat: (metadata.lat as number) || null,
          lng: (metadata.lng as number) || null,
          priority: os.priority || 0,
          dueDate: os.due_date,
          slaBreach,
          operationType: (metadata.operation_type as string) || null,
        };
      });

      // Transform machines
      const machines: TerritorialMachine[] = (machineRes.data || []).map((m) => ({
        id: m.id,
        machineId: m.machine_id,
        model: m.model,
        status: m.status,
        state: m.location_state,
        city: m.location_city,
        lat: m.latitude ? Number(m.latitude) : null,
        lng: m.longitude ? Number(m.longitude) : null,
        hasActiveAlert: m.has_active_alert || false,
        licenseeId: m.licensee_id,
      }));

      // Apply filters if provided
      let filteredLicensees = licensees;
      let filteredPDVs = pdvs;
      let filteredOS = serviceOrders;
      let filteredMachines = machines;

      if (filters) {
        if (filters.states.length > 0) {
          filteredLicensees = licensees.filter((l) => l.state && filters.states.includes(l.state));
          filteredPDVs = pdvs.filter((p) => p.state && filters.states.includes(p.state));
          filteredOS = serviceOrders.filter((os) => os.state && filters.states.includes(os.state));
          filteredMachines = machines.filter((m) => m.state && filters.states.includes(m.state));
        }
        if (filters.cities.length > 0) {
          filteredLicensees = filteredLicensees.filter((l) => l.city && filters.cities.includes(l.city));
          filteredPDVs = filteredPDVs.filter((p) => p.city && filters.cities.includes(p.city));
          filteredOS = filteredOS.filter((os) => os.city && filters.cities.includes(os.city));
          filteredMachines = filteredMachines.filter((m) => m.city && filters.cities.includes(m.city));
        }
        if (filters.status.length > 0) {
          filteredLicensees = filteredLicensees.filter((l) => filters.status.includes(l.status));
          filteredPDVs = filteredPDVs.filter((p) => filters.status.includes(p.status));
          filteredOS = filteredOS.filter((os) => filters.status.includes(os.status));
          filteredMachines = filteredMachines.filter((m) => filters.status.includes(m.status));
        }
      }

      // Calculate stats
      const allStates = new Set<string>();
      const allCities = new Set<string>();
      
      [...filteredLicensees, ...filteredPDVs, ...filteredMachines].forEach((item) => {
        if (item.state) allStates.add(item.state);
        if (item.city) allCities.add(item.city);
      });
      filteredOS.forEach((os) => {
        if (os.state) allStates.add(os.state);
        if (os.city) allCities.add(os.city);
      });

      const stats: TerritorialStats = {
        totalStates: allStates.size,
        totalCities: allCities.size,
        activeOS: filteredOS.length,
        slaBreaches: filteredOS.filter((os) => os.slaBreach).length,
        activeLicensees: filteredLicensees.filter((l) => l.status === "active").length,
        activePDVs: filteredPDVs.filter((p) => p.status === "active").length,
        stockAlerts: filteredPDVs.filter((p) => p.hasStockAlert).length + filteredMachines.filter((m) => m.hasActiveAlert).length,
      };

      // Extract available filters
      const availableFilters = {
        states: Array.from(allStates).sort(),
        cities: Array.from(allCities).sort(),
        operationTypes: [...new Set(serviceOrders.map((os) => os.operationType).filter(Boolean))] as string[],
      };

      return {
        licensees: filteredLicensees,
        pdvs: filteredPDVs,
        serviceOrders: filteredOS,
        machines: filteredMachines,
        stats,
        availableFilters,
      };
    },
    refetchInterval: 30000, // Refresh every 30 seconds
  });
}
