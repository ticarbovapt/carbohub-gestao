import { useState, useCallback } from "react";
import { CarboCard } from "@/components/ui/carbo-card";
import { CarboButton } from "@/components/ui/carbo-button";
import { CarboBadge } from "@/components/ui/carbo-badge";
import { Upload, Download, FileSpreadsheet, CheckCircle2, XCircle, AlertTriangle, Loader2, Users } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import * as XLSX from "xlsx";

const TEAM_TEMPLATE_HEADERS = [
  "nome",
  "email",
  "login",
  "senha",
  "departamento",
  "funcao",
  "regra",
  "escopo",
  "responde_a",
  "interfaces_principais",
];

const TEAM_TEMPLATE_EXAMPLE = [
  ["João Silva", "joao@grupocarbo.com.br", "joao.silva", "", "ops", "Gerente de Operações", "gestor", "operacional", "", "producao,expedicao"],
  ["Maria Souza", "maria@grupocarbo.com.br", "maria.souza", "", "venda", "Vendedora B2B", "operacional", "comercial", "joao@grupocarbo.com.br", "comercial"],
  ["Pedro Lima", "pedro@grupocarbo.com.br", "pedro.lima", "", "finance", "Analista Financeiro", "operacional", "adm_financeiro", "", "financeiro"],
];

const ROLES_VALID = ["admin", "gestor", "operacional", "viewer"];
const DEPARTMENTS_VALID = ["venda", "preparacao", "expedicao", "operacao", "pos_venda", "command", "finance", "growth", "ops", "expansao", "b2b"];
const ESCOPOS_VALID = ["comercial", "operacional", "adm_financeiro"];

interface ParsedMember {
  data: Record<string, unknown>;
  errors: string[];
  warnings: string[];
  valid: boolean;
}

export function TeamBulkImport() {
  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<ParsedMember[]>([]);
  const [step, setStep] = useState<"upload" | "preview" | "importing" | "complete">("upload");
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState({ success: 0, errors: 0 });
  const [dragging, setDragging] = useState(false);

  const downloadTemplate = () => {
    const data = [TEAM_TEMPLATE_HEADERS, ...TEAM_TEMPLATE_EXAMPLE];
    const ws = XLSX.utils.aoa_to_sheet(data);
    ws["!cols"] = TEAM_TEMPLATE_HEADERS.map(() => ({ wch: 22 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Time");
    XLSX.writeFile(wb, "template_time_carbo.xlsx");
    toast.success("Template baixado!");
  };

  const parseFile = useCallback(async (f: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const data = new Uint8Array(e.target?.result as ArrayBuffer);
      const wb = XLSX.read(data, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });

      const rows: ParsedMember[] = json.map((row) => {
        const errors: string[] = [];
        const warnings: string[] = [];

        if (!row["nome"]) errors.push("Nome obrigatório");
        if (!row["email"]) errors.push("Email obrigatório");
        else if (!/\S+@\S+\.\S+/.test(String(row["email"]))) errors.push("Email inválido");
        if (!row["regra"]) errors.push("Regra obrigatória");
        else if (!ROLES_VALID.includes(String(row["regra"]))) errors.push(`Regra inválida: ${row["regra"]} (use: ${ROLES_VALID.join(", ")})`);
        if (row["departamento"] && !DEPARTMENTS_VALID.includes(String(row["departamento"]))) warnings.push(`Departamento "${row["departamento"]}" não reconhecido`);
        if (row["escopo"] && !ESCOPOS_VALID.includes(String(row["escopo"]))) warnings.push(`Escopo "${row["escopo"]}" não reconhecido`);
        if (!row["login"]) warnings.push("Login não informado — será gerado automaticamente");

        return { data: row, errors, warnings, valid: errors.length === 0 };
      });

      setParsed(rows);
      setStep("preview");
    };
    reader.readAsArrayBuffer(f);
  }, []);

  const handleFile = (f: File) => {
    setFile(f);
    parseFile(f);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  };

  const handleImport = async () => {
    const valid = parsed.filter((r) => r.valid);
    if (valid.length === 0) return;

    setStep("importing");
    setProgress(0);

    const users = valid.map((r) => r.data);
    const total = users.length;
    let success = 0;
    let errors = 0;

    // Process in batches of 10
    const BATCH = 10;
    for (let i = 0; i < users.length; i += BATCH) {
      const batch = users.slice(i, i + BATCH);
      try {
        const { error } = await supabase.functions.invoke("bulk-create-org-users", {
          body: { users: batch },
        });
        if (error) {
          errors += batch.length;
        } else {
          success += batch.length;
        }
      } catch {
        errors += batch.length;
      }
      setProgress(Math.round(((i + BATCH) / total) * 100));
    }

    setResults({ success, errors });
    setStep("complete");
    if (success > 0) toast.success(`${success} membros importados com sucesso!`);
    if (errors > 0) toast.error(`${errors} membros falharam na importação.`);
  };

  const reset = () => {
    setFile(null);
    setParsed([]);
    setStep("upload");
    setProgress(0);
    setResults({ success: 0, errors: 0 });
  };

  const validCount = parsed.filter((r) => r.valid).length;
  const errorCount = parsed.filter((r) => !r.valid).length;
  const warningCount = parsed.filter((r) => r.valid && r.warnings.length > 0).length;

  if (step === "complete") {
    return (
      <CarboCard>
        <div className="p-8 text-center space-y-4">
          <CheckCircle2 className="h-12 w-12 text-carbo-green mx-auto" />
          <h3 className="text-xl font-bold">Importação Concluída</h3>
          <div className="flex justify-center gap-6">
            <div><p className="text-3xl font-bold text-carbo-green kpi-number">{results.success}</p><p className="text-sm text-muted-foreground">importados</p></div>
            {results.errors > 0 && <div><p className="text-3xl font-bold text-destructive kpi-number">{results.errors}</p><p className="text-sm text-muted-foreground">falhas</p></div>}
          </div>
          <p className="text-sm text-muted-foreground">Os membros receberão um email com instruções para definir sua senha.</p>
          <CarboButton onClick={reset} variant="outline">Nova Importação</CarboButton>
        </div>
      </CarboCard>
    );
  }

  if (step === "importing") {
    return (
      <CarboCard>
        <div className="p-8 text-center space-y-4">
          <Loader2 className="h-10 w-10 animate-spin text-carbo-green mx-auto" />
          <h3 className="text-lg font-semibold">Importando membros...</h3>
          <Progress value={progress} className="max-w-sm mx-auto" />
          <p className="text-sm text-muted-foreground">{progress}% concluído</p>
        </div>
      </CarboCard>
    );
  }

  if (step === "preview") {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex gap-3">
            <CarboBadge variant="success">{validCount} válidos</CarboBadge>
            {errorCount > 0 && <CarboBadge variant="destructive">{errorCount} com erro</CarboBadge>}
            {warningCount > 0 && <CarboBadge variant="warning">{warningCount} com aviso</CarboBadge>}
          </div>
          <div className="flex gap-2">
            <CarboButton variant="outline" size="sm" onClick={reset}>Cancelar</CarboButton>
            <CarboButton onClick={handleImport} disabled={validCount === 0}>
              <Upload className="h-4 w-4 mr-1" />
              Importar {validCount} membros
            </CarboButton>
          </div>
        </div>

        <CarboCard padding="none">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="text-left p-3 font-medium">Status</th>
                  <th className="text-left p-3 font-medium">Nome</th>
                  <th className="text-left p-3 font-medium">Email</th>
                  <th className="text-left p-3 font-medium">Departamento</th>
                  <th className="text-left p-3 font-medium">Regra</th>
                  <th className="text-left p-3 font-medium">Problemas</th>
                </tr>
              </thead>
              <tbody>
                {parsed.map((row, i) => (
                  <tr key={i} className={`border-b ${!row.valid ? "bg-destructive/5" : row.warnings.length ? "bg-warning/5" : ""}`}>
                    <td className="p-3">
                      {row.valid ? <CheckCircle2 className="h-4 w-4 text-carbo-green" /> : <XCircle className="h-4 w-4 text-destructive" />}
                    </td>
                    <td className="p-3 font-medium">{String(row.data["nome"] || "—")}</td>
                    <td className="p-3 text-muted-foreground">{String(row.data["email"] || "—")}</td>
                    <td className="p-3">{String(row.data["departamento"] || "—")}</td>
                    <td className="p-3"><CarboBadge variant="secondary" className="text-[10px]">{String(row.data["regra"] || "—")}</CarboBadge></td>
                    <td className="p-3 text-xs">
                      {row.errors.map((e, j) => <p key={j} className="text-destructive">{e}</p>)}
                      {row.warnings.map((w, j) => <p key={j} className="text-warning">{w}</p>)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CarboCard>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Importe todos os membros de uma vez com uma planilha Excel ou CSV.
        </p>
        <CarboButton variant="outline" size="sm" onClick={downloadTemplate}>
          <Download className="h-4 w-4 mr-1" />
          Baixar Template
        </CarboButton>
      </div>

      {/* Campos válidos */}
      <CarboCard>
        <div className="p-4">
          <p className="text-sm font-medium mb-3">Campos do template:</p>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            {[
              { field: "nome*", desc: "Nome completo" },
              { field: "email*", desc: "Email corporativo" },
              { field: "regra*", desc: "admin | gestor | operacional | viewer" },
              { field: "departamento", desc: "ops | venda | finance | b2b..." },
              { field: "funcao", desc: "Cargo/função" },
              { field: "escopo", desc: "comercial | operacional | adm_financeiro" },
              { field: "responde_a", desc: "Email do gestor direto" },
              { field: "login", desc: "Login único (gerado se vazio)" },
              { field: "senha", desc: "Senha inicial (gerada se vazia)" },
              { field: "interfaces_principais", desc: "Areas separadas por vírgula" },
            ].map((f) => (
              <div key={f.field} className="p-2 rounded-lg bg-muted/30 text-xs">
                <p className="font-mono font-medium">{f.field}</p>
                <p className="text-muted-foreground">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </CarboCard>

      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-xl p-12 text-center transition-all cursor-pointer ${
          dragging ? "border-carbo-green bg-carbo-green/5" : "border-muted-foreground/25 hover:border-carbo-green/50"
        }`}
        onClick={() => document.getElementById("team-file-input")?.click()}
      >
        <input id="team-file-input" type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
        <FileSpreadsheet className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
        <p className="text-lg font-medium">Arraste a planilha aqui</p>
        <p className="text-sm text-muted-foreground mt-1">ou clique para selecionar — .xlsx, .xls, .csv</p>
      </div>
    </div>
  );
}
