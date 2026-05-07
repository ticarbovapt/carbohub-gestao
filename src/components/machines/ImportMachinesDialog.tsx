import React, { useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { CarboButton } from "@/components/ui/carbo-button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useCreateMachine } from "@/hooks/useMachines";
import { toast } from "sonner";
import { Upload, FileText, Download, AlertCircle, CheckCircle2, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface ImportMachinesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface CsvRow {
  model: string;
  serial_number?: string;
  location_address?: string;
  location_city?: string;
  location_state?: string;
  status?: string;
  capacity?: string;
  notes?: string;
  _error?: string;
}

const EXPECTED_HEADERS = [
  "model",
  "serial_number",
  "location_city",
  "location_state",
  "capacity",
  "notes",
];

const SAMPLE_CSV = [
  "model,serial_number,location_city,location_state,capacity,notes",
  "CarboZé Pro,SN-001,São Paulo,SP,100,Unidade Centro",
  "CarboZé Lite,SN-002,Rio de Janeiro,RJ,60,Shopping ABC",
  "CarboZé Max,SN-003,Belo Horizonte,MG,150,Aeroporto",
].join("\n");

function parseCsv(text: string): { headers: string[]; rows: CsvRow[]; errors: string[] } {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length < 2) {
    return { headers: [], rows: [], errors: ["Arquivo CSV deve ter pelo menos um cabeçalho e uma linha de dados."] };
  }

  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const errors: string[] = [];

  if (!headers.includes("model")) {
    errors.push('Coluna obrigatória "model" não encontrada no CSV.');
    return { headers, rows: [], errors };
  }

  const rows: CsvRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(",").map((v) => v.trim());
    const row: CsvRow = { model: "" };

    headers.forEach((header, idx) => {
      const value = values[idx] ?? "";
      switch (header) {
        case "model":
          row.model = value;
          break;
        case "serial_number":
          row.serial_number = value || undefined;
          break;
        case "location_address":
          row.location_address = value || undefined;
          break;
        case "location_city":
          row.location_city = value || undefined;
          break;
        case "location_state":
          row.location_state = value || undefined;
          break;
        case "status":
          row.status = value || undefined;
          break;
        case "capacity":
          row.capacity = value || undefined;
          break;
        case "notes":
          row.notes = value || undefined;
          break;
      }
    });

    if (!row.model) {
      row._error = `Linha ${i + 1}: campo "model" obrigatório está vazio.`;
    }

    rows.push(row);
  }

  return { headers, rows, errors };
}

function downloadSampleCsv() {
  const blob = new Blob([SAMPLE_CSV], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "modelo-importacao-maquinas.csv";
  link.click();
  URL.revokeObjectURL(url);
}

export function ImportMachinesDialog({ open, onOpenChange }: ImportMachinesDialogProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [rows, setRows] = useState<CsvRow[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);

  // Import progress state
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importTotal, setImportTotal] = useState(0);
  const [importDone, setImportDone] = useState(false);
  const [importErrors, setImportErrors] = useState<string[]>([]);

  const createMachine = useCreateMachine();

  function resetState() {
    setFileName(null);
    setParseErrors([]);
    setRows([]);
    setHeaders([]);
    setIsImporting(false);
    setImportProgress(0);
    setImportTotal(0);
    setImportDone(false);
    setImportErrors([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleClose(open: boolean) {
    if (!isImporting) {
      resetState();
      onOpenChange(open);
    }
  }

  function handleFile(file: File) {
    if (!file.name.endsWith(".csv")) {
      setParseErrors(["Apenas arquivos .csv são aceitos."]);
      return;
    }

    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const result = parseCsv(text);
      setHeaders(result.headers);
      setRows(result.rows);
      setParseErrors(result.errors);
    };
    reader.readAsText(file, "UTF-8");
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }

  const validRows = rows.filter((r) => !r._error);
  const invalidRows = rows.filter((r) => !!r._error);

  async function handleImport() {
    if (validRows.length === 0) return;

    setIsImporting(true);
    setImportTotal(validRows.length);
    setImportProgress(0);
    setImportDone(false);
    setImportErrors([]);

    const errors: string[] = [];

    for (let i = 0; i < validRows.length; i++) {
      const row = validRows[i];
      try {
        await createMachine.mutateAsync({
          model: row.model,
          serial_number: row.serial_number,
          location_city: row.location_city,
          location_state: row.location_state,
          location_address: row.location_address,
          capacity: row.capacity ? parseInt(row.capacity, 10) : undefined,
          notes: row.notes,
          status:
            row.status === "operational" ||
            row.status === "maintenance" ||
            row.status === "offline" ||
            row.status === "retired"
              ? row.status
              : "operational",
        });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        errors.push(`${row.model} (${row.serial_number ?? "sem S/N"}): ${message}`);
      }
      setImportProgress(i + 1);
    }

    setImportErrors(errors);
    setIsImporting(false);
    setImportDone(true);

    const successCount = validRows.length - errors.length;
    if (successCount > 0) {
      toast.success(
        errors.length === 0
          ? `${successCount} máquina(s) importadas com sucesso!`
          : `${successCount} importadas, ${errors.length} com erro.`
      );
    }

    if (errors.length === 0) {
      // Auto-close on full success after brief delay
      setTimeout(() => {
        resetState();
        onOpenChange(false);
      }, 1500);
    }
  }

  const progressPercent = importTotal > 0 ? Math.round((importProgress / importTotal) * 100) : 0;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-plex flex items-center gap-2">
            <Upload className="h-5 w-5 text-carbo-green" aria-hidden="true" />
            Importar Máquinas
          </DialogTitle>
          <DialogDescription>
            Importe múltiplas máquinas de uma vez usando um arquivo CSV.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Upload area */}
          {!fileName && !importDone && (
            <div
              role="button"
              tabIndex={0}
              aria-label="Área de upload de arquivo CSV"
              className={cn(
                "border-2 border-dashed rounded-xl p-8 flex flex-col items-center gap-3 cursor-pointer transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                isDragging
                  ? "border-carbo-green bg-carbo-green/5"
                  : "border-border hover:border-carbo-green/50 hover:bg-muted/40"
              )}
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") fileInputRef.current?.click(); }}
            >
              <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-carbo-green/10 to-carbo-blue/10 flex items-center justify-center">
                <FileText className="h-7 w-7 text-muted-foreground" aria-hidden="true" />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-foreground">
                  Arraste um arquivo CSV aqui ou{" "}
                  <span className="text-carbo-green underline underline-offset-2">clique para selecionar</span>
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Formato: .csv — colunas: model, serial_number, location_city, location_state, capacity, notes
                </p>
              </div>
              <CarboButton
                variant="outline"
                size="sm"
                onClick={(e) => { e.stopPropagation(); downloadSampleCsv(); }}
                aria-label="Baixar modelo CSV de exemplo"
              >
                <Download className="h-4 w-4 mr-1" aria-hidden="true" />
                Baixar modelo CSV
              </CarboButton>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                className="sr-only"
                aria-label="Selecionar arquivo CSV"
                onChange={handleFileInput}
              />
            </div>
          )}

          {/* Parse errors */}
          {parseErrors.length > 0 && (
            <div
              role="alert"
              className="flex items-start gap-3 p-4 rounded-xl border border-destructive/30 bg-destructive/5"
            >
              <AlertCircle className="h-5 w-5 text-destructive mt-0.5 shrink-0" aria-hidden="true" />
              <div className="space-y-1">
                {parseErrors.map((err, i) => (
                  <p key={i} className="text-sm text-destructive">{err}</p>
                ))}
              </div>
            </div>
          )}

          {/* File selected — show preview */}
          {fileName && !importDone && rows.length > 0 && parseErrors.length === 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-carbo-green" aria-hidden="true" />
                  <span className="text-sm font-medium">{fileName}</span>
                  <Badge variant="secondary" className="text-xs">
                    {rows.length} linha{rows.length !== 1 ? "s" : ""}
                  </Badge>
                  {invalidRows.length > 0 && (
                    <Badge variant="destructive" className="text-xs">
                      {invalidRows.length} com erro
                    </Badge>
                  )}
                </div>
                <button
                  onClick={resetState}
                  aria-label="Remover arquivo selecionado"
                  className="rounded-full p-1 hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <X className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                </button>
              </div>

              {/* Preview table */}
              <div className="rounded-xl border overflow-hidden">
                <div className="overflow-x-auto max-h-72">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-6">#</TableHead>
                        {EXPECTED_HEADERS.map((h) => (
                          <TableHead key={h} className="whitespace-nowrap capitalize text-xs">
                            {h.replace(/_/g, " ")}
                          </TableHead>
                        ))}
                        <TableHead className="w-16 text-xs">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map((row, idx) => (
                        <TableRow
                          key={idx}
                          className={cn(row._error && "bg-destructive/5")}
                        >
                          <TableCell className="text-xs text-muted-foreground">{idx + 1}</TableCell>
                          <TableCell className="text-xs font-medium">{row.model || <span className="text-destructive">—</span>}</TableCell>
                          <TableCell className="text-xs">{row.serial_number || "—"}</TableCell>
                          <TableCell className="text-xs">{row.location_city || "—"}</TableCell>
                          <TableCell className="text-xs">{row.location_state || "—"}</TableCell>
                          <TableCell className="text-xs">{row.capacity || "—"}</TableCell>
                          <TableCell className="text-xs text-muted-foreground max-w-[120px] truncate">{row.notes || "—"}</TableCell>
                          <TableCell>
                            {row._error ? (
                              <Badge variant="destructive" className="text-xs whitespace-nowrap">
                                Erro
                              </Badge>
                            ) : (
                              <Badge variant="secondary" className="text-xs whitespace-nowrap">
                                OK
                              </Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>

              {/* Validation errors per row */}
              {invalidRows.length > 0 && (
                <div
                  role="alert"
                  className="flex items-start gap-3 p-3 rounded-xl border border-warning/30 bg-warning/5"
                >
                  <AlertCircle className="h-4 w-4 text-warning mt-0.5 shrink-0" aria-hidden="true" />
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-warning">
                      {invalidRows.length} linha(s) com erro serão ignoradas na importação:
                    </p>
                    {invalidRows.map((row, i) => (
                      <p key={i} className="text-xs text-muted-foreground">{row._error}</p>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Import progress */}
          {isImporting && (
            <div
              role="status"
              aria-live="polite"
              aria-label={`Importando máquina ${importProgress} de ${importTotal}`}
              className="space-y-3 p-4 rounded-xl border bg-muted/30"
            >
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">Importando...</span>
                <span className="text-muted-foreground">
                  {importProgress} de {importTotal}
                </span>
              </div>
              <Progress value={progressPercent} className="h-2" />
              <p className="text-xs text-muted-foreground text-center">{progressPercent}% concluído</p>
            </div>
          )}

          {/* Import done */}
          {importDone && (
            <div className="space-y-3">
              <div
                role="status"
                aria-live="polite"
                className={cn(
                  "flex items-start gap-3 p-4 rounded-xl border",
                  importErrors.length === 0
                    ? "border-success/30 bg-success/5"
                    : "border-warning/30 bg-warning/5"
                )}
              >
                <CheckCircle2
                  className={cn(
                    "h-5 w-5 mt-0.5 shrink-0",
                    importErrors.length === 0 ? "text-success" : "text-warning"
                  )}
                  aria-hidden="true"
                />
                <div className="space-y-1">
                  <p className="text-sm font-medium">
                    {validRows.length - importErrors.length} máquina(s) importadas com sucesso
                    {importErrors.length > 0 && `, ${importErrors.length} com falha`}
                  </p>
                  {importErrors.length > 0 && importErrors.map((err, i) => (
                    <p key={i} className="text-xs text-muted-foreground">{err}</p>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 flex-col sm:flex-row">
          <CarboButton
            variant="outline"
            onClick={() => handleClose(false)}
            disabled={isImporting}
          >
            {importDone ? "Fechar" : "Cancelar"}
          </CarboButton>

          {!importDone && (
            <CarboButton
              onClick={handleImport}
              disabled={validRows.length === 0 || isImporting || parseErrors.length > 0}
              loading={isImporting}
              aria-label={`Importar ${validRows.length} máquina(s)`}
            >
              {isImporting
                ? `Importando ${importProgress} de ${importTotal}...`
                : `Importar ${validRows.length > 0 ? `${validRows.length} máquina(s)` : ""}`}
            </CarboButton>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
