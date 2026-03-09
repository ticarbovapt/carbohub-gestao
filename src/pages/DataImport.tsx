import { useState, useCallback } from "react";
import { BoardLayout } from "@/components/layouts/BoardLayout";
import { CarboPageHeader } from "@/components/ui/carbo-page-header";
import { CarboCard } from "@/components/ui/carbo-card";
import { CarboButton } from "@/components/ui/carbo-button";
import { CarboBadge } from "@/components/ui/carbo-badge";
import { CarboEmptyState } from "@/components/ui/carbo-empty-state";
import { 
  Upload, 
  FileSpreadsheet, 
  Download, 
  Building2, 
  Cpu, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle,
  ArrowRight,
  Loader2,
  FileWarning
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import * as XLSX from "xlsx";

type ImportType = "licensees" | "machines";

interface ParsedRow {
  data: Record<string, unknown>;
  errors: string[];
  warnings: string[];
  valid: boolean;
}

interface ImportState {
  file: File | null;
  parsed: ParsedRow[];
  step: "upload" | "preview" | "importing" | "complete";
  progress: number;
  successCount: number;
  errorCount: number;
}

const LICENSEE_TEMPLATE_HEADERS = [
  "nome",
  "razao_social",
  "cnpj",
  "email",
  "telefone",
  "endereco",
  "cidade",
  "estado",
  "cep",
  "estados_cobertura",
  "cidades_cobertura",
  "status",
  "notas",
];

const MACHINE_TEMPLATE_HEADERS = [
  "modelo",
  "numero_serie",
  "licenciado_codigo",
  "endereco",
  "cidade",
  "estado",
  "status",
  "capacidade",
  "preco_por_unidade",
  "data_instalacao",
  "notas",
];

export default function DataImport() {
  const [importType, setImportType] = useState<ImportType>("licensees");
  const [state, setState] = useState<ImportState>({
    file: null,
    parsed: [],
    step: "upload",
    progress: 0,
    successCount: 0,
    errorCount: 0,
  });

  const downloadTemplate = (type: ImportType) => {
    const headers = type === "licensees" ? LICENSEE_TEMPLATE_HEADERS : MACHINE_TEMPLATE_HEADERS;
    const ws = XLSX.utils.aoa_to_sheet([headers]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, type === "licensees" ? "Licenciados" : "Máquinas");
    XLSX.writeFile(wb, `template_${type}.xlsx`);
    toast.success("Template baixado com sucesso!");
  };

  const parseFile = useCallback(async (file: File, type: ImportType) => {
    return new Promise<ParsedRow[]>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: "array" });
          const sheetName = workbook.SheetNames[0];
          const sheet = workbook.Sheets[sheetName];
          const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });

          const parsed: ParsedRow[] = json.map((row, index) => {
            const errors: string[] = [];
            const warnings: string[] = [];

            if (type === "licensees") {
              if (!row.nome) errors.push("Nome é obrigatório");
              if (row.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email as string)) {
                warnings.push("Email inválido");
              }
              if (row.status && !["active", "inactive", "pending", "suspended"].includes(row.status as string)) {
                warnings.push("Status inválido, será definido como 'pending'");
              }
            } else {
              if (!row.modelo) errors.push("Modelo é obrigatório");
              if (row.status && !["operational", "maintenance", "offline", "retired"].includes(row.status as string)) {
                warnings.push("Status inválido, será definido como 'operational'");
              }
            }

            return {
              data: row,
              errors,
              warnings,
              valid: errors.length === 0,
            };
          });

          resolve(parsed);
        } catch (err) {
          reject(new Error("Erro ao processar arquivo"));
        }
      };
      reader.onerror = () => reject(new Error("Erro ao ler arquivo"));
      reader.readAsArrayBuffer(file);
    });
  }, []);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validTypes = [
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel",
      "text/csv",
    ];
    if (!validTypes.includes(file.type) && !file.name.endsWith(".csv") && !file.name.endsWith(".xlsx") && !file.name.endsWith(".xls")) {
      toast.error("Formato de arquivo inválido. Use Excel (.xlsx, .xls) ou CSV.");
      return;
    }

    try {
      const parsed = await parseFile(file, importType);
      setState({
        file,
        parsed,
        step: "preview",
        progress: 0,
        successCount: 0,
        errorCount: 0,
      });
    } catch (err) {
      toast.error("Erro ao processar arquivo");
    }
  };

  const handleImport = async () => {
    const validRows = state.parsed.filter((r) => r.valid);
    if (validRows.length === 0) {
      toast.error("Nenhuma linha válida para importar");
      return;
    }

    setState((s) => ({ ...s, step: "importing", progress: 0 }));

    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < validRows.length; i++) {
      const row = validRows[i];
      try {
        if (importType === "licensees") {
          const coverageStates = row.data.estados_cobertura 
            ? String(row.data.estados_cobertura).split(",").map(s => s.trim()).filter(Boolean)
            : [];
          const coverageCities = row.data.cidades_cobertura
            ? String(row.data.cidades_cobertura).split(",").map(s => s.trim()).filter(Boolean)
            : [];

          const { error } = await supabase.from("licensees").insert({
            code: "", // Auto-generated
            name: String(row.data.nome || ""),
            legal_name: String(row.data.razao_social || "") || null,
            document_number: String(row.data.cnpj || "") || null,
            email: String(row.data.email || "") || null,
            phone: String(row.data.telefone || "") || null,
            address_street: String(row.data.endereco || "") || null,
            address_city: String(row.data.cidade || "") || null,
            address_state: String(row.data.estado || "") || null,
            address_zip: String(row.data.cep || "") || null,
            coverage_states: coverageStates,
            coverage_cities: coverageCities,
            status: ["active", "inactive", "pending", "suspended"].includes(String(row.data.status))
              ? (row.data.status as "active" | "inactive" | "pending" | "suspended")
              : "pending",
            notes: String(row.data.notas || "") || null,
          });

          if (error) throw error;
        } else {
          // Find licensee by code if provided
          let licenseeId: string | null = null;
          if (row.data.licenciado_codigo) {
            const { data: licensee } = await supabase
              .from("licensees")
              .select("id")
              .eq("code", String(row.data.licenciado_codigo))
              .single();
            licenseeId = licensee?.id || null;
          }

          const { error } = await supabase.from("machines").insert({
            machine_id: "", // Auto-generated
            model: String(row.data.modelo || ""),
            serial_number: String(row.data.numero_serie || "") || null,
            licensee_id: licenseeId,
            location_address: String(row.data.endereco || "") || null,
            location_city: String(row.data.cidade || "") || null,
            location_state: String(row.data.estado || "") || null,
            status: ["operational", "maintenance", "offline", "retired"].includes(String(row.data.status))
              ? (row.data.status as "operational" | "maintenance" | "offline" | "retired")
              : "operational",
            capacity: row.data.capacidade ? Number(row.data.capacidade) : 100,
            current_price_per_unit: row.data.preco_por_unidade ? Number(row.data.preco_por_unidade) : 0,
            installation_date: row.data.data_instalacao ? String(row.data.data_instalacao) : null,
            notes: String(row.data.notas || "") || null,
          });

          if (error) throw error;
        }
        successCount++;
      } catch (err) {
        console.error("Import error:", err);
        errorCount++;
      }

      setState((s) => ({
        ...s,
        progress: Math.round(((i + 1) / validRows.length) * 100),
        successCount,
        errorCount,
      }));
    }

    setState((s) => ({ ...s, step: "complete" }));
    toast.success(`Importação concluída: ${successCount} registros importados`);
  };

  const resetImport = () => {
    setState({
      file: null,
      parsed: [],
      step: "upload",
      progress: 0,
      successCount: 0,
      errorCount: 0,
    });
  };

  const validCount = state.parsed.filter((r) => r.valid).length;
  const invalidCount = state.parsed.filter((r) => !r.valid).length;
  const warningCount = state.parsed.filter((r) => r.warnings.length > 0).length;

  return (
    <BoardLayout>
      <CarboPageHeader
        title="Importação de Dados"
        description="Importe licenciados e máquinas via planilhas Excel ou CSV"
      />

      <Tabs value={importType} onValueChange={(v) => {
        setImportType(v as ImportType);
        resetImport();
      }}>
        <TabsList className="mb-6">
          <TabsTrigger value="licensees" className="gap-2">
            <Building2 className="h-4 w-4" />
            Licenciados
          </TabsTrigger>
          <TabsTrigger value="machines" className="gap-2">
            <Cpu className="h-4 w-4" />
            Máquinas
          </TabsTrigger>
        </TabsList>

        <TabsContent value={importType}>
          {/* Step 1: Upload */}
          {state.step === "upload" && (
            <div className="grid gap-6 md:grid-cols-2">
              <CarboCard className="p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                    <Upload className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold">Upload de Arquivo</h3>
                    <p className="text-sm text-muted-foreground">Excel (.xlsx, .xls) ou CSV</p>
                  </div>
                </div>

                <label className="flex flex-col items-center justify-center w-full h-48 border-2 border-dashed border-border rounded-xl cursor-pointer bg-secondary/30 hover:bg-secondary/50 transition-colors">
                  <FileSpreadsheet className="h-12 w-12 text-muted-foreground mb-3" />
                  <span className="text-sm font-medium text-foreground">
                    Clique para selecionar ou arraste o arquivo
                  </span>
                  <span className="text-xs text-muted-foreground mt-1">
                    Tamanho máximo: 10MB
                  </span>
                  <input
                    type="file"
                    className="hidden"
                    accept=".xlsx,.xls,.csv"
                    onChange={handleFileChange}
                  />
                </label>
              </CarboCard>

              <CarboCard className="p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10">
                    <Download className="h-5 w-5 text-blue-500" />
                  </div>
                  <div>
                    <h3 className="font-semibold">Template de Importação</h3>
                    <p className="text-sm text-muted-foreground">Baixe o modelo para preenchimento</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Use o template abaixo como referência para organizar seus dados antes de importar.
                    Siga as instruções de cada coluna para evitar erros.
                  </p>

                  <div className="p-4 rounded-lg bg-secondary/30 border border-border">
                    <h4 className="text-sm font-medium mb-2">Campos disponíveis:</h4>
                    <div className="flex flex-wrap gap-2">
                      {(importType === "licensees" ? LICENSEE_TEMPLATE_HEADERS : MACHINE_TEMPLATE_HEADERS).map((h) => (
                        <span key={h} className="px-2 py-1 bg-background rounded text-xs font-mono">
                          {h}
                        </span>
                      ))}
                    </div>
                  </div>

                  <CarboButton
                    variant="secondary"
                    className="w-full"
                    onClick={() => downloadTemplate(importType)}
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Baixar Template Excel
                  </CarboButton>
                </div>
              </CarboCard>
            </div>
          )}

          {/* Step 2: Preview */}
          {state.step === "preview" && (
            <div className="space-y-6">
              <CarboCard className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <FileSpreadsheet className="h-6 w-6 text-primary" />
                    <div>
                      <h3 className="font-semibold">{state.file?.name}</h3>
                      <p className="text-sm text-muted-foreground">
                        {state.parsed.length} linhas encontradas
                      </p>
                    </div>
                  </div>
                  <CarboButton variant="ghost" size="sm" onClick={resetImport}>
                    Trocar arquivo
                  </CarboButton>
                </div>

                <div className="flex gap-4 mb-6">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-5 w-5 text-success" />
                    <span className="text-sm font-medium">{validCount} válidas</span>
                  </div>
                  {invalidCount > 0 && (
                    <div className="flex items-center gap-2">
                      <XCircle className="h-5 w-5 text-destructive" />
                      <span className="text-sm font-medium">{invalidCount} com erros</span>
                    </div>
                  )}
                  {warningCount > 0 && (
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="h-5 w-5 text-warning" />
                      <span className="text-sm font-medium">{warningCount} com avisos</span>
                    </div>
                  )}
                </div>

                <div className="overflow-x-auto max-h-[400px] overflow-y-auto border border-border rounded-lg">
                  <table className="w-full text-sm">
                    <thead className="bg-secondary/50 sticky top-0">
                      <tr>
                        <th className="px-4 py-2 text-left font-medium">#</th>
                        <th className="px-4 py-2 text-left font-medium">Status</th>
                        {(importType === "licensees" ? ["nome", "email", "cidade", "estado"] : ["modelo", "numero_serie", "cidade"]).map((h) => (
                          <th key={h} className="px-4 py-2 text-left font-medium">{h}</th>
                        ))}
                        <th className="px-4 py-2 text-left font-medium">Mensagens</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {state.parsed.map((row, i) => (
                        <tr key={i} className={!row.valid ? "bg-destructive/5" : row.warnings.length > 0 ? "bg-warning/5" : ""}>
                          <td className="px-4 py-2">{i + 1}</td>
                          <td className="px-4 py-2">
                            {row.valid ? (
                              row.warnings.length > 0 ? (
                                <CarboBadge variant="warning">Aviso</CarboBadge>
                              ) : (
                                <CarboBadge variant="success">OK</CarboBadge>
                              )
                            ) : (
                              <CarboBadge variant="destructive">Erro</CarboBadge>
                            )}
                          </td>
                          {(importType === "licensees" ? ["nome", "email", "cidade", "estado"] : ["modelo", "numero_serie", "cidade"]).map((h) => (
                            <td key={h} className="px-4 py-2 max-w-[150px] truncate">
                              {String(row.data[h] || "—")}
                            </td>
                          ))}
                          <td className="px-4 py-2 text-xs">
                            {row.errors.map((e, j) => (
                              <span key={j} className="text-destructive block">{e}</span>
                            ))}
                            {row.warnings.map((w, j) => (
                              <span key={j} className="text-warning block">{w}</span>
                            ))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CarboCard>

              <div className="flex justify-end gap-3">
                <CarboButton variant="secondary" onClick={resetImport}>
                  Cancelar
                </CarboButton>
                <CarboButton onClick={handleImport} disabled={validCount === 0}>
                  <ArrowRight className="h-4 w-4 mr-2" />
                  Importar {validCount} registro(s)
                </CarboButton>
              </div>
            </div>
          )}

          {/* Step 3: Importing */}
          {state.step === "importing" && (
            <CarboCard className="p-8 text-center">
              <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">Importando dados...</h3>
              <p className="text-sm text-muted-foreground mb-6">
                Por favor, aguarde enquanto os dados são processados.
              </p>
              <Progress value={state.progress} className="mb-3" />
              <p className="text-sm text-muted-foreground">
                {state.progress}% concluído • {state.successCount} importados • {state.errorCount} erros
              </p>
            </CarboCard>
          )}

          {/* Step 4: Complete */}
          {state.step === "complete" && (
            <CarboCard className="p-8 text-center">
              {state.errorCount === 0 ? (
                <CheckCircle2 className="h-16 w-16 text-success mx-auto mb-4" />
              ) : (
                <FileWarning className="h-16 w-16 text-warning mx-auto mb-4" />
              )}
              <h3 className="text-xl font-semibold mb-2">Importação Concluída</h3>
              <p className="text-muted-foreground mb-6">
                {state.successCount} registro(s) importado(s) com sucesso
                {state.errorCount > 0 && ` • ${state.errorCount} erro(s)`}
              </p>
              <div className="flex justify-center gap-3">
                <CarboButton variant="secondary" onClick={resetImport}>
                  Nova Importação
                </CarboButton>
                <CarboButton onClick={() => window.location.href = importType === "licensees" ? "/licensees" : "/machines"}>
                  Ver {importType === "licensees" ? "Licenciados" : "Máquinas"}
                </CarboButton>
              </div>
            </CarboCard>
          )}
        </TabsContent>
      </Tabs>
    </BoardLayout>
  );
}
