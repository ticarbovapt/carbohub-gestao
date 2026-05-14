/**
 * NFSeImportPage — Integração Direta de NFS-e
 * Rota: /admin/nfse
 */

import React, { useCallback, useState, useMemo, useRef } from "react";
import JSZip from "jszip";
import { BoardLayout } from "@/components/layouts/BoardLayout";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useNFSeData, calcNFSeStats } from "@/hooks/useNFSeData";
import type { NFSeRecord } from "@/hooks/useNFSeData";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  Upload, FileText, CheckCircle2, AlertCircle, Database,
  TrendingUp, Receipt, Search, X, ChevronDown, ChevronUp,
  FileInput, FileArchive, Loader2, BarChart3, MapPin,
  CalendarDays, Hash,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from "recharts";

// ─── Namespace ABRASF 2.01 ────────────────────────────────────────────────────
const ABRASF_NS = "http://www.abrasf.org.br/ABRASF/arquivos/nfse.xsd";

export interface NFSeParsed {
  numero: number;
  codigo_verificacao: string | null;
  data_emissao: string | null;
  competencia: string | null;
  item_lista_servico: string | null;
  discriminacao: string | null;
  outras_informacoes: string | null;
  valor_servicos: number;
  valor_pis: number;
  valor_cofins: number;
  valor_inss: number;
  valor_ir: number;
  valor_csll: number;
  outras_retencoes: number;
  base_calculo: number;
  iss_retido: boolean;
  tomador_cpf_cnpj: string | null;
  tomador_tipo: "cpf" | "cnpj" | null;
  tomador_razao_social: string | null;
  tomador_uf: string | null;
  tomador_municipio: string | null;
  tomador_cep: string | null;
  tomador_telefone: string | null;
  pedido_refs: string[];
  veiculo_descricao: string | null;
  qtd_veiculos: number | null;
  filename: string;
}

// ─── Parser XML ───────────────────────────────────────────────────────────────
function getTextNoNs(parent: Element, tag: string): string {
  return parent.getElementsByTagName(tag)[0]?.textContent?.trim() ?? "";
}

function parseNum(v: string): number {
  return parseFloat(v || "0") || 0;
}

export function parseNFSeXML(xmlContent: string, filename: string): NFSeParsed | null {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlContent, "text/xml");
    if (doc.getElementsByTagName("parsererror")[0]) return null;

    const get = (tag: string): string => {
      const withNs = doc.getElementsByTagNameNS(ABRASF_NS, tag)[0]?.textContent?.trim();
      if (withNs) return withNs;
      return doc.getElementsByTagName(tag)[0]?.textContent?.trim() ?? "";
    };

    const numero = parseInt(get("Numero") || "0");
    if (!numero) return null;

    const tomadorEl =
      doc.getElementsByTagNameNS(ABRASF_NS, "TomadorServico")[0] ||
      doc.getElementsByTagName("TomadorServico")[0];

    let tomadorCpf = "", tomadorCnpj = "", tomadorRazao = "";
    let tomadorUf = "", tomadorMunicipio = "", tomadorCep = "", tomadorTelefone = "";

    if (tomadorEl) {
      const cpfCnpjEl =
        tomadorEl.getElementsByTagNameNS(ABRASF_NS, "CpfCnpj")[0] ||
        tomadorEl.getElementsByTagName("CpfCnpj")[0];
      if (cpfCnpjEl) {
        tomadorCnpj = getTextNoNs(cpfCnpjEl as Element, "Cnpj");
        tomadorCpf  = getTextNoNs(cpfCnpjEl as Element, "Cpf");
      }
      tomadorRazao = getTextNoNs(tomadorEl, "RazaoSocial");
      const endEl =
        tomadorEl.getElementsByTagNameNS(ABRASF_NS, "Endereco")[0] ||
        tomadorEl.getElementsByTagName("Endereco")[0];
      if (endEl) {
        tomadorUf        = getTextNoNs(endEl, "Uf");
        tomadorMunicipio = getTextNoNs(endEl, "CodigoMunicipio");
        tomadorCep       = getTextNoNs(endEl, "Cep");
      }
      const contatoEl =
        tomadorEl.getElementsByTagNameNS(ABRASF_NS, "Contato")[0] ||
        tomadorEl.getElementsByTagName("Contato")[0];
      if (contatoEl) tomadorTelefone = getTextNoNs(contatoEl, "Telefone");
    }

    const discriminacao = get("Discriminacao");
    const outras = get("OutrasInformacoes");
    const pedidoRefs = [...outras.matchAll(/[Pp]edidos?\s*[:#]?\s*(\d+)/g)].map(m => m[1]);
    const veiculoMatch = discriminacao.match(/[Vv]e[íi]culo[:\s]+([^|#\n,]+)/);
    const veiculoDesc = veiculoMatch?.[1]?.trim() ?? null;
    const discParts = discriminacao.split("|");
    const qtd = discParts.length > 1 ? Math.round(parseFloat(discParts[1]) || 0) : null;

    return {
      numero,
      codigo_verificacao: get("CodigoVerificacao") || null,
      data_emissao: get("DataEmissao") || null,
      competencia: get("Competencia") || null,
      item_lista_servico: get("ItemListaServico") || null,
      discriminacao: discriminacao || null,
      outras_informacoes: outras || null,
      valor_servicos: parseNum(get("ValorServicos")),
      valor_pis:      parseNum(get("ValorPis")),
      valor_cofins:   parseNum(get("ValorCofins")),
      valor_inss:     parseNum(get("ValorInss")),
      valor_ir:       parseNum(get("ValorIr")),
      valor_csll:     parseNum(get("ValorCsll")),
      outras_retencoes: parseNum(get("OutrasRetencoes")),
      base_calculo:   parseNum(get("BaseCalculo")),
      iss_retido:     get("IssRetido") === "1",
      tomador_cpf_cnpj: tomadorCnpj || tomadorCpf || null,
      tomador_tipo:   tomadorCnpj ? "cnpj" : tomadorCpf ? "cpf" : null,
      tomador_razao_social: tomadorRazao || null,
      tomador_uf:     tomadorUf.toUpperCase() || null,
      tomador_municipio: tomadorMunicipio || null,
      tomador_cep:    tomadorCep || null,
      tomador_telefone: tomadorTelefone || null,
      pedido_refs:    pedidoRefs,
      veiculo_descricao: veiculoDesc,
      qtd_veiculos:   qtd && qtd > 0 ? qtd : null,
      filename,
    };
  } catch {
    return null;
  }
}

async function processZip(file: File): Promise<NFSeParsed[]> {
  const zip = await JSZip.loadAsync(file);
  const results: NFSeParsed[] = [];
  for (const [name, entry] of Object.entries(zip.files)) {
    if (!entry.dir && name.toLowerCase().endsWith(".xml")) {
      const content = await entry.async("string");
      const rec = parseNFSeXML(content, name.split("/").pop() ?? name);
      if (rec) results.push(rec);
    }
  }
  return results;
}

// ─── Format helpers ───────────────────────────────────────────────────────────
function fmtBRL(v: number) {
  return v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  try { return format(new Date(iso), "dd/MM/yyyy", { locale: ptBR }); }
  catch { return iso; }
}
function fmtMonth(yyyymm: string) {
  try {
    const [y, m] = yyyymm.split("-");
    return format(new Date(parseInt(y), parseInt(m) - 1, 1), "MMM/yy", { locale: ptBR });
  } catch { return yyyymm; }
}

const CHART_COLORS = ["#1a7a4a","#2d9d64","#3bb87a","#4dce8d","#68dfa0","#87ecb8","#a8f0cb","#c5f7de","#1a7a4a","#2d9d64"];

// ─── Component ────────────────────────────────────────────────────────────────
export default function NFSeImportPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [parsedRecords, setParsedRecords]     = useState<NFSeParsed[]>([]);
  const [importing, setImporting]             = useState(false);
  const [importProgress, setImportProgress]   = useState(0);
  const [importResult, setImportResult]       = useState<{ inserted: number; duplicates: number } | null>(null);
  const [isDragging, setIsDragging]           = useState(false);
  const [processing, setProcessing]           = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [dbFilters, setDbFilters] = useState({ from: "", to: "", uf: "", search: "" });
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  const { data: dbRecords = [], isLoading: dbLoading } = useNFSeData({
    from:   dbFilters.from   || undefined,
    to:     dbFilters.to     || undefined,
    uf:     dbFilters.uf     || undefined,
    search: dbFilters.search || undefined,
  });

  const stats = useMemo(() => calcNFSeStats(dbRecords), [dbRecords]);

  const processFiles = useCallback(async (files: File[]) => {
    setProcessing(true);
    const allParsed: NFSeParsed[] = [];
    for (const file of files) {
      if (file.name.toLowerCase().endsWith(".zip")) {
        const recs = await processZip(file);
        allParsed.push(...recs);
      } else if (file.name.toLowerCase().endsWith(".xml")) {
        const text = await file.text();
        const rec = parseNFSeXML(text, file.name);
        if (rec) allParsed.push(rec);
      }
    }
    const seen = new Set<number>();
    const deduped = allParsed.filter(r => { if (seen.has(r.numero)) return false; seen.add(r.numero); return true; });
    setParsedRecords(deduped);
    setImportResult(null);
    setProcessing(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    processFiles(Array.from(e.dataTransfer.files));
  }, [processFiles]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) processFiles(Array.from(e.target.files));
  }, [processFiles]);

  const handleImport = async () => {
    if (!parsedRecords.length || !user) return;
    setImporting(true);
    setImportProgress(0);
    const batchId = crypto.randomUUID();
    const CHUNK = 50;
    let inserted = 0, duplicates = 0;
    try {
      for (let i = 0; i < parsedRecords.length; i += CHUNK) {
        const chunk = parsedRecords.slice(i, i + CHUNK).map(r => ({ ...r, batch_id: batchId, imported_by: user.id }));
        const { error, data } = await (supabase as any)
          .from("nfse_imports")
          .upsert(chunk, { onConflict: "numero", ignoreDuplicates: true })
          .select("id");
        if (error) throw error;
        inserted += (data?.length ?? 0);
        duplicates += chunk.length - (data?.length ?? 0);
        setImportProgress(Math.round(((i + chunk.length) / parsedRecords.length) * 100));
      }
      setImportResult({ inserted, duplicates });
      queryClient.invalidateQueries({ queryKey: ["nfse-data"] });
      toast.success(`${inserted} NF-e importadas com sucesso!`);
    } catch (err: any) {
      toast.error("Erro ao importar: " + err.message);
    } finally {
      setImporting(false);
    }
  };

  const monthChartData = useMemo(() =>
    Object.entries(stats.byMonth)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => ({ mes: fmtMonth(k), total: v.total, count: v.count })),
    [stats.byMonth]);

  const ufChartData = useMemo(() =>
    Object.entries(stats.byUF)
      .sort(([, a], [, b]) => b.total - a.total)
      .slice(0, 10)
      .map(([uf, v]) => ({ uf, total: v.total, count: v.count })),
    [stats.byUF]);

  const previewTotal = parsedRecords.reduce((s, r) => s + r.valor_servicos, 0);

  return (
    <BoardLayout>
    <div className="space-y-6 p-6 max-w-6xl mx-auto">

      {/* ── Page header ─────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <FileInput className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">Integração Direta — NFS-e</h1>
            <p className="text-sm text-muted-foreground">
              Importe XMLs ABRASF 2.01 emitidos pela Carbo e analise o dashboard CarboVapt
            </p>
          </div>
        </div>
        {dbRecords.length > 0 && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Database className="h-4 w-4" />
            <span className="font-semibold text-foreground">{dbRecords.length}</span> NF-e na base
          </div>
        )}
      </div>

      <Separator />

      <Tabs defaultValue="upload">
        <TabsList>
          <TabsTrigger value="upload" className="gap-2">
            <Upload className="h-4 w-4" />
            Upload NFS-e
          </TabsTrigger>
          <TabsTrigger value="database" className="gap-2">
            <BarChart3 className="h-4 w-4" />
            Base de Dados
            {dbRecords.length > 0 && (
              <Badge variant="secondary" className="ml-0.5 h-5 px-1.5 text-[11px]">
                {dbRecords.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* ── ABA UPLOAD ────────────────────────────────────────────────── */}
        <TabsContent value="upload" className="mt-5 space-y-5">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

            {/* Dropzone */}
            <div className="lg:col-span-2 space-y-4">
              <div
                onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                onClick={() => !processing && fileInputRef.current?.click()}
                className={cn(
                  "relative flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-8 py-14 text-center cursor-pointer transition-all",
                  isDragging
                    ? "border-primary bg-primary/5 scale-[1.01]"
                    : "border-muted-foreground/20 hover:border-primary/40 hover:bg-muted/30",
                  processing && "pointer-events-none opacity-70"
                )}
              >
                {processing ? (
                  <>
                    <Loader2 className="h-10 w-10 animate-spin text-primary" />
                    <p className="text-sm font-medium text-muted-foreground">Lendo arquivos...</p>
                  </>
                ) : (
                  <>
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
                      <Upload className="h-7 w-7 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground">
                        Arraste XMLs ou um arquivo ZIP aqui
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        ou clique para selecionar do computador
                      </p>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="outline" className="gap-1 text-xs font-normal">
                        <FileText className="h-3 w-3" /> .xml
                      </Badge>
                      <Badge variant="outline" className="gap-1 text-xs font-normal">
                        <FileArchive className="h-3 w-3" /> .zip
                      </Badge>
                    </div>
                  </>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xml,.zip"
                  multiple
                  className="hidden"
                  onChange={handleFileInput}
                />
              </div>

              {/* Preview table */}
              {parsedRecords.length > 0 && (
                <Card>
                  <CardHeader className="pb-3 flex-row items-center justify-between space-y-0">
                    <div>
                      <CardTitle className="text-sm">
                        {parsedRecords.length} NF-e prontas para importar
                      </CardTitle>
                      <CardDescription className="text-xs mt-0.5">
                        Total: <span className="font-semibold text-foreground">R$ {fmtBRL(previewTotal)}</span>
                      </CardDescription>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => { setParsedRecords([]); setImportResult(null); }}
                      className="h-7 text-xs text-muted-foreground"
                    >
                      <X className="h-3 w-3 mr-1" /> Limpar
                    </Button>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="overflow-auto max-h-64 rounded-b-lg">
                      <table className="w-full text-xs">
                        <thead className="bg-muted/50 sticky top-0">
                          <tr>
                            <th className="text-left px-3 py-2 font-medium text-muted-foreground">#NF</th>
                            <th className="text-left px-3 py-2 font-medium text-muted-foreground">Data</th>
                            <th className="text-left px-3 py-2 font-medium text-muted-foreground">Cliente</th>
                            <th className="text-left px-3 py-2 font-medium text-muted-foreground">UF</th>
                            <th className="text-right px-3 py-2 font-medium text-muted-foreground">R$ Valor</th>
                          </tr>
                        </thead>
                        <tbody>
                          {parsedRecords.map((r, i) => (
                            <tr key={r.numero} className={cn("border-t", i % 2 === 0 ? "" : "bg-muted/20")}>
                              <td className="px-3 py-2 font-mono font-medium">{r.numero}</td>
                              <td className="px-3 py-2">{fmtDate(r.data_emissao)}</td>
                              <td className="px-3 py-2 max-w-[160px] truncate">{r.tomador_razao_social ?? r.tomador_cpf_cnpj ?? "—"}</td>
                              <td className="px-3 py-2">{r.tomador_uf ?? "—"}</td>
                              <td className="px-3 py-2 text-right font-semibold tabular-nums">{fmtBRL(r.valor_servicos)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Ações de import */}
              {parsedRecords.length > 0 && !importResult && (
                <div className="space-y-2">
                  <Button onClick={handleImport} disabled={importing} className="gap-2 w-full sm:w-auto">
                    {importing ? (
                      <><Loader2 className="h-4 w-4 animate-spin" /> Importando... {importProgress}%</>
                    ) : (
                      <><CheckCircle2 className="h-4 w-4" /> Importar {parsedRecords.length} NF-e</>
                    )}
                  </Button>
                  {importing && <Progress value={importProgress} className="h-1.5" />}
                </div>
              )}

              {importResult && (
                <div className="flex items-start gap-3 p-4 rounded-xl border border-green-200 bg-green-50 dark:bg-green-950/30 dark:border-green-800">
                  <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-green-700 dark:text-green-400">
                      {importResult.inserted} NF-e importadas com sucesso
                    </p>
                    {importResult.duplicates > 0 && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {importResult.duplicates} registros já existiam e foram ignorados
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Sidebar de instruções */}
            <div className="space-y-4">
              <Card className="bg-muted/30">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <FileText className="h-4 w-4 text-primary" />
                    Formatos suportados
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-xs text-muted-foreground space-y-2">
                  <div className="flex items-start gap-2">
                    <FileArchive className="h-3.5 w-3.5 flex-shrink-0 mt-0.5 text-amber-500" />
                    <span><strong className="text-foreground">ZIP</strong> — com todos os XMLs dentro (recomendado)</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <FileText className="h-3.5 w-3.5 flex-shrink-0 mt-0.5 text-blue-500" />
                    <span><strong className="text-foreground">XML</strong> — múltiplos arquivos individuais</span>
                  </div>
                  <Separator className="my-2" />
                  <p>Padrão: <strong className="text-foreground">ABRASF 2.01</strong></p>
                  <p>Emitente: <strong className="text-foreground">Carbo Soluções Ltda</strong></p>
                  <p>Duplicatas são ignoradas automaticamente pelo número da NF.</p>
                </CardContent>
              </Card>

              <Card className="bg-muted/30">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Database className="h-4 w-4 text-primary" />
                    Dados extraídos
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-xs text-muted-foreground space-y-1.5">
                  {[
                    "Número e data de emissão",
                    "Tomador (CNPJ/CPF, nome, UF)",
                    "Valor dos serviços e tributos",
                    "Veículo e qtd (da Discriminação)",
                    "Referência de pedidos internos",
                  ].map(item => (
                    <div key={item} className="flex items-center gap-2">
                      <CheckCircle2 className="h-3 w-3 text-primary flex-shrink-0" />
                      <span>{item}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* ── ABA BASE DE DADOS ──────────────────────────────────────────── */}
        <TabsContent value="database" className="mt-5 space-y-5">

          {/* KPI cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { label: "Total NFs", value: stats.count.toLocaleString("pt-BR"), icon: Hash, color: "text-blue-500", bg: "bg-blue-500/10" },
              { label: "Faturamento Total", value: `R$ ${fmtBRL(stats.total)}`, icon: TrendingUp, color: "text-green-600", bg: "bg-green-500/10" },
              { label: "Ticket Médio", value: `R$ ${fmtBRL(stats.ticket)}`, icon: Receipt, color: "text-amber-500", bg: "bg-amber-500/10" },
              {
                label: "NFs este mês",
                value: (() => { const m = new Date().toISOString().slice(0,7); return (stats.byMonth[m]?.count ?? 0).toLocaleString("pt-BR"); })(),
                icon: CalendarDays, color: "text-purple-500", bg: "bg-purple-500/10",
              },
            ].map(kpi => (
              <Card key={kpi.label}>
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-xs text-muted-foreground">{kpi.label}</p>
                      <p className="text-lg font-bold tabular-nums mt-0.5 leading-none">{kpi.value}</p>
                    </div>
                    <div className={cn("flex h-8 w-8 items-center justify-center rounded-lg flex-shrink-0", kpi.bg)}>
                      <kpi.icon className={cn("h-4 w-4", kpi.color)} />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Filtros */}
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1 text-xs text-muted-foreground font-medium">
                  <Search className="h-3.5 w-3.5" /> Filtros:
                </div>
                <Input type="date" className="h-8 w-36 text-xs" value={dbFilters.from}
                  onChange={e => setDbFilters(f => ({ ...f, from: e.target.value }))} />
                <span className="text-xs text-muted-foreground">até</span>
                <Input type="date" className="h-8 w-36 text-xs" value={dbFilters.to}
                  onChange={e => setDbFilters(f => ({ ...f, to: e.target.value }))} />
                <Input className="h-8 w-24 text-xs" placeholder="UF" maxLength={2}
                  value={dbFilters.uf}
                  onChange={e => setDbFilters(f => ({ ...f, uf: e.target.value.toUpperCase() }))} />
                <div className="relative flex-1 min-w-[160px]">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                  <Input className="h-8 pl-7 text-xs" placeholder="Buscar cliente..."
                    value={dbFilters.search}
                    onChange={e => setDbFilters(f => ({ ...f, search: e.target.value }))} />
                </div>
                {(dbFilters.from || dbFilters.to || dbFilters.uf || dbFilters.search) && (
                  <Button variant="ghost" size="sm" className="h-8 text-xs"
                    onClick={() => setDbFilters({ from: "", to: "", uf: "", search: "" })}>
                    <X className="h-3 w-3 mr-1" /> Limpar
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Gráficos */}
          {!dbLoading && dbRecords.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <BarChart3 className="h-4 w-4 text-primary" /> Faturamento por Mês
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={monthChartData} margin={{ top: 0, right: 0, bottom: 0, left: -10 }}>
                      <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
                      <Tooltip
                        formatter={(v: number) => [`R$ ${fmtBRL(v)}`, "Faturamento"]}
                        labelStyle={{ fontSize: 12 }}
                        contentStyle={{ fontSize: 12 }}
                      />
                      <Bar dataKey="total" radius={[4, 4, 0, 0]}>
                        {monthChartData.map((_, i) => (
                          <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-primary" /> Top 10 UFs
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={ufChartData} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 0 }}>
                      <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
                      <YAxis type="category" dataKey="uf" tick={{ fontSize: 11 }} width={26} />
                      <Tooltip
                        formatter={(v: number) => [`R$ ${fmtBRL(v)}`, "Faturamento"]}
                        labelStyle={{ fontSize: 12 }}
                        contentStyle={{ fontSize: 12 }}
                      />
                      <Bar dataKey="total" radius={[0, 4, 4, 0]}>
                        {ufChartData.map((_, i) => (
                          <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Tabela */}
          {dbLoading ? (
            <div className="flex items-center justify-center gap-2 h-32 text-muted-foreground text-sm">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
            </div>
          ) : dbRecords.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center gap-3 py-14">
                <AlertCircle className="h-10 w-10 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground text-center">
                  Nenhuma NFS-e na base ainda.<br />
                  Use a aba <strong>Upload NFS-e</strong> para importar os arquivos.
                </p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                <div className="overflow-auto rounded-lg">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/50 sticky top-0 z-10">
                      <tr>
                        <th className="w-6 px-2 py-2.5"></th>
                        <th className="text-left px-3 py-2.5 font-medium text-muted-foreground">#NF</th>
                        <th className="text-left px-3 py-2.5 font-medium text-muted-foreground">Data</th>
                        <th className="text-left px-3 py-2.5 font-medium text-muted-foreground">Cliente</th>
                        <th className="text-left px-3 py-2.5 font-medium text-muted-foreground">UF</th>
                        <th className="text-left px-3 py-2.5 font-medium text-muted-foreground">Descrição do Serviço</th>
                        <th className="text-right px-3 py-2.5 font-medium text-muted-foreground">R$ Valor</th>
                        <th className="text-left px-3 py-2.5 font-medium text-muted-foreground">Pedido(s)</th>
                        <th className="text-left px-3 py-2.5 font-medium text-muted-foreground">Veículo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dbRecords.map((r, i) => (
                        <React.Fragment key={r.id}>
                          <tr
                            className={cn(
                              "border-t cursor-pointer hover:bg-muted/30 transition-colors",
                              i % 2 !== 0 && "bg-muted/10"
                            )}
                            onClick={() => setExpandedRow(expandedRow === r.id ? null : r.id)}
                          >
                            <td className="px-2 py-2.5 text-muted-foreground">
                              {expandedRow === r.id
                                ? <ChevronUp className="h-3 w-3" />
                                : <ChevronDown className="h-3 w-3" />}
                            </td>
                            <td className="px-3 py-2.5 font-mono font-semibold">{r.numero}</td>
                            <td className="px-3 py-2.5 tabular-nums">{fmtDate(r.data_emissao)}</td>
                            <td className="px-3 py-2.5 max-w-[200px] truncate">{r.tomador_razao_social ?? r.tomador_cpf_cnpj ?? "—"}</td>
                            <td className="px-3 py-2.5">
                              {r.tomador_uf
                                ? <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">{r.tomador_uf}</Badge>
                                : "—"}
                            </td>
                            <td className="px-3 py-2.5 max-w-[200px]">
                              <span className="truncate block" title={r.discriminacao?.split("|")[0] ?? ""}>
                                {r.discriminacao
                                  ? r.discriminacao.split("|")[0].replace(/[#\n]/g, "").trim().slice(0, 60) || "—"
                                  : "—"}
                              </span>
                            </td>
                            <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-green-700 dark:text-green-400">
                              {fmtBRL(r.valor_servicos ?? 0)}
                            </td>
                            <td className="px-3 py-2.5 text-muted-foreground">
                              {r.pedido_refs?.length ? r.pedido_refs.join(", ") : "—"}
                            </td>
                            <td className="px-3 py-2.5 max-w-[120px] truncate">{r.veiculo_descricao ?? "—"}</td>
                          </tr>
                          {expandedRow === r.id && (
                            <tr className={i % 2 !== 0 ? "bg-muted/10" : "bg-background"}>
                              <td colSpan={9} className="px-5 pb-4 pt-2">
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                                  <div>
                                    <p className="text-muted-foreground mb-0.5">CPF/CNPJ Tomador</p>
                                    <p className="font-medium">{r.tomador_cpf_cnpj ?? "—"}</p>
                                  </div>
                                  <div>
                                    <p className="text-muted-foreground mb-0.5">CEP</p>
                                    <p className="font-medium">{r.tomador_cep ?? "—"}</p>
                                  </div>
                                  <div>
                                    <p className="text-muted-foreground mb-0.5">Cód. Item Serviço</p>
                                    <p className="font-medium">{r.item_lista_servico ?? "—"}</p>
                                  </div>
                                  <div>
                                    <p className="text-muted-foreground mb-0.5">ISS Retido</p>
                                    <p className="font-medium">{r.iss_retido ? "Sim" : "Não"}</p>
                                  </div>
                                  <div>
                                    <p className="text-muted-foreground mb-0.5">Qtd. Veículos</p>
                                    <p className="font-medium">{r.qtd_veiculos ?? "—"}</p>
                                  </div>
                                  <div>
                                    <p className="text-muted-foreground mb-0.5">Competência</p>
                                    <p className="font-medium">{fmtDate(r.competencia)}</p>
                                  </div>
                                  {r.discriminacao && (
                                    <div className="col-span-2 sm:col-span-4">
                                      <p className="text-muted-foreground mb-0.5">Discriminação</p>
                                      <p className="font-medium whitespace-pre-wrap leading-relaxed">{r.discriminacao}</p>
                                    </div>
                                  )}
                                  {r.outras_informacoes && (
                                    <div className="col-span-2 sm:col-span-4">
                                      <p className="text-muted-foreground mb-0.5">Outras Informações</p>
                                      <p className="font-medium">{r.outras_informacoes}</p>
                                    </div>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
    </BoardLayout>
  );
}
