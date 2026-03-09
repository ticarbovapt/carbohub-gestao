import { DepartmentId } from "./department";

export interface Station {
  id: string;
  name: string;
  departmentId: DepartmentId;
  qrCode: string;
  checklistId?: string;
  location?: string;
  description?: string;
  sensorIds?: string[];
}

export interface QRScanResult {
  stationId: string;
  stationName: string;
  departmentId: DepartmentId;
  checklistId: string;
  location: string;
}

// Mock stations for demonstration
export const mockStations: Station[] = [
  {
    id: "station-1",
    name: "Sala de Compressores",
    departmentId: "manutencao",
    qrCode: "CARBO-COMP-001",
    checklistId: "pre-operacao",
    location: "Bloco A - Térreo",
  },
  {
    id: "station-2",
    name: "Armazém 2 - Doca Norte",
    departmentId: "logistica",
    qrCode: "CARBO-ARM-002",
    checklistId: "entrega-tecnica",
    location: "Galpão Principal",
  },
  {
    id: "station-3",
    name: "Linha de Produção A",
    departmentId: "qualidade",
    qrCode: "CARBO-PROD-A01",
    checklistId: "aceite-tecnico",
    location: "Pavilhão Industrial",
  },
  {
    id: "station-4",
    name: "Portaria Principal",
    departmentId: "seguranca",
    qrCode: "CARBO-PORT-001",
    checklistId: "entrega-comercial",
    location: "Entrada - Recepção",
  },
];

// Parse QR code data
export function parseQRCode(qrData: string): QRScanResult | null {
  // Try to find station by QR code
  const station = mockStations.find(s => s.qrCode === qrData);
  
  if (station) {
    return {
      stationId: station.id,
      stationName: station.name,
      departmentId: station.departmentId,
      checklistId: station.checklistId || "pre-operacao",
      location: station.location || station.name,
    };
  }

  // Try parsing as JSON (for more complex QR data)
  try {
    const parsed = JSON.parse(qrData);
    if (parsed.stationId && parsed.departmentId) {
      return {
        stationId: parsed.stationId,
        stationName: parsed.stationName || "Estação Desconhecida",
        departmentId: parsed.departmentId,
        checklistId: parsed.checklistId || "pre-operacao",
        location: parsed.location || "",
      };
    }
  } catch {
    // Not JSON, continue
  }

  return null;
}
