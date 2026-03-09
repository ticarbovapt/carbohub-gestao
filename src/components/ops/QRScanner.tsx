import { useState, useEffect } from "react";
import { Camera, QrCode, Loader2, CheckCircle, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDepartment } from "@/contexts/DepartmentContext";
import { parseQRCode, QRScanResult, mockStations } from "@/types/station";
import { getDepartmentById } from "@/types/department";

interface QRScannerProps {
  onScan: (data: QRScanResult) => void;
}

export function QRScanner({ onScan }: QRScannerProps) {
  const [isScanning, setIsScanning] = useState(false);
  const [scanResult, setScanResult] = useState<QRScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { setDepartment } = useDepartment();

  // Simulate different scan results for demo
  const simulateScan = () => {
    setIsScanning(true);
    setError(null);
    
    // Simulate QR scanning delay
    setTimeout(() => {
      // Randomly pick a station for demo
      const randomStation = mockStations[Math.floor(Math.random() * mockStations.length)];
      const result = parseQRCode(randomStation.qrCode);
      
      if (result) {
        setScanResult(result);
        // Auto-set department based on scanned station
        setDepartment(result.departmentId);
        
        // Trigger callback after showing success
        setTimeout(() => {
          onScan(result);
        }, 2000);
      } else {
        setError("QR Code inválido ou não reconhecido");
      }
      
      setIsScanning(false);
    }, 2000);
  };

  // Success screen
  if (scanResult) {
    const dept = getDepartmentById(scanResult.departmentId);
    
    return (
      <div className="flex flex-col items-center justify-center py-12 px-6 ops-bounce-in">
        <div className="mb-6 flex h-24 w-24 items-center justify-center rounded-3xl bg-ops-green text-5xl shadow-lg">
          <CheckCircle className="h-12 w-12 text-white" />
        </div>
        
        <h2 className="mb-2 text-center text-2xl font-bold text-ops-text">
          👋 Bem-vindo à
        </h2>
        <h1 className="mb-4 text-center text-3xl font-extrabold text-ops-text">
          {scanResult.stationName}
        </h1>
        
        {dept && (
          <div className="mb-4 flex items-center gap-2 rounded-xl bg-primary/10 px-4 py-2">
            <span className="text-2xl">{dept.icon}</span>
            <span className="font-semibold text-primary">{dept.name}</span>
          </div>
        )}
        
        {scanResult.location && (
          <p className="mb-4 text-center text-ops-muted">
            📍 {scanResult.location}
          </p>
        )}
        
        <div className="flex items-center gap-2 rounded-2xl bg-ops-green/10 px-5 py-3 text-ops-green">
          <span className="text-lg">✓</span>
          <span className="font-semibold">Checklist carregado com sucesso 🎉</span>
        </div>
      </div>
    );
  }

  // Error screen
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12 px-6">
        <div className="mb-6 flex h-24 w-24 items-center justify-center rounded-3xl bg-destructive/10 text-5xl">
          <AlertCircle className="h-12 w-12 text-destructive" />
        </div>
        
        <h2 className="mb-2 text-center text-xl font-bold text-ops-text">
          Ops! Algo deu errado
        </h2>
        <p className="mb-6 text-center text-ops-muted max-w-xs">
          {error}
        </p>
        
        <Button variant="ops" size="ops-xl" onClick={() => setError(null)}>
          Tentar Novamente
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center py-12 px-6">
      {/* Scanner frame */}
      <div className="relative mb-8 flex h-72 w-72 items-center justify-center rounded-3xl border-4 border-dashed border-ops-yellow bg-ops-surface shadow-lg">
        {isScanning ? (
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="h-16 w-16 animate-spin text-ops-yellow" />
            <p className="text-lg font-semibold text-ops-muted">Escaneando...</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4">
            <QrCode className="h-20 w-20 text-ops-muted/50" />
            <p className="text-center text-lg text-ops-muted">
              Posicione o QR Code<br />dentro da área
            </p>
          </div>
        )}
        
        {/* Corner decorations */}
        <div className="absolute left-3 top-3 h-8 w-8 border-l-4 border-t-4 border-ops-yellow rounded-tl-xl" />
        <div className="absolute right-3 top-3 h-8 w-8 border-r-4 border-t-4 border-ops-yellow rounded-tr-xl" />
        <div className="absolute bottom-3 left-3 h-8 w-8 border-b-4 border-l-4 border-ops-yellow rounded-bl-xl" />
        <div className="absolute bottom-3 right-3 h-8 w-8 border-b-4 border-r-4 border-ops-yellow rounded-br-xl" />
        
        {/* Scan line animation */}
        {isScanning && (
          <div className="absolute left-4 right-4 h-0.5 bg-ops-yellow animate-pulse-soft" 
               style={{ top: '50%', boxShadow: '0 0 10px hsl(var(--ops-yellow))' }} />
        )}
      </div>

      {/* Instructions */}
      <div className="mb-6 text-center max-w-xs">
        <p className="text-lg text-ops-muted mb-2">
          Escaneie o QR Code da estação
        </p>
        <p className="text-sm text-ops-muted/70">
          O departamento e checklist serão detectados automaticamente
        </p>
      </div>

      {/* Scan button */}
      <Button 
        variant="ops" 
        size="ops-xl" 
        onClick={simulateScan}
        disabled={isScanning}
      >
        <Camera className="h-6 w-6" />
        {isScanning ? "Escaneando..." : "Iniciar Câmera"}
      </Button>

      {/* Demo hint */}
      <p className="mt-6 text-xs text-center text-ops-muted/60 max-w-xs">
        💡 Demo: O scanner simulará a leitura de um QR code aleatório das estações cadastradas
      </p>
    </div>
  );
}
