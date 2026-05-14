/**
 * NFSeImportPage — Integração Direta de NFS-e
 * Rota: /admin/nfse
 *
 * Aba 1 — Upload NFS-e: dropzone para XMLs individuais ou ZIP, preview, import para Supabase
 * Aba 2 — Base de Dados: KPIs, gráficos e tabela completa das NFS-e importadas
 */

import React, { useCallback, useState, useMemo, useRef } from "react";
import JSZip from "jszip";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useNFSeData, calcNFSeStats, type NFSeRecord } from "@/hooks/useNFSeData";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import {
  Upload, FileText, CheckCircle2, AlertCircle, Database,
  TrendingUp, Receipt, Search, X, ChevronDown, ChevronUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  Cell,
} from "recharts";

// ─── Namespace ABRASF 2.01 ───────────────────────────────────────────────────

const ABRASF_NS = "http://www.abrasf.org.br/ABRASF/arquivos/nfse.xsd";

// ─── Tipo local para NF parseada (antes de inserir no DB) ────────────────────

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

// ─── Parser XML ──────────────────────────────────────────────────────────────

function getText(parent: Element, tag: string, ns = ABRASF_NS): string {
  const el = parent.getElementsByTagNameNS(ns, tag)[0];
  return el?.textContent?.trim() ?? "";
}

function getTextNoNs(parent: Element, tag: string): string {
  const el = parent.getElementsByTagName(tag)[0];
  return el?.textContent?.trim() ?? "";
}

function parseNum(v: string): number {
  return parseFloat(v || "0") || 0;
}

export function parseNFSeXML(xmlContent: string, filename: string): NFSeParsed | null {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlContent, "text/xml");

    // Detectar erro de parse
    const parseErr = doc.getElementsByTagName("parsererror")[0];
    if (parseErr) return null;

    // Helper: pega primeiro elemento com esse tag no namespace ABRASF ou sem ns
    const get = (tag: string): string => {
      const withNs = doc.getElementsByTagNameNS(ABRASF_NS, tag)[0]?.textContent?.trim();
      if (withNs) return withNs;
      return doc.getElementsByTagName(tag)[0]?.textContent?.trim() ?? "";
    };

    const numero = parseInt(get("Numero") || "0");
    if (!numero) return null;

    // ── Tomador: precisamos pegar apenas os dados do TomadorServico ──────────
    const tomadorEl =
      doc.getElementsByTagNameNS(ABRASF_NS, "TomadorServico")[0] ||
      doc.getElementsByTagName("TomadorServico")[0];

    let tomadorCpf = "";
    let tomadorCnpj = "";
    let tomadorRazao = "";
    let tomadorUf = "";
    let tomadorMunicipio = "";
    let tomadorCep = "";
    let tomadorTelefone = "";

    if (tomadorEl) {
      // CPF/CNPJ
      const cpfCnpjEl =
        tomadorEl.getElementsByTagNameNS(ABRASF_NS, "CpfCnpj")[0] ||
        tomadorEl.getElementsByTagName("CpfCnpj")[0];
      if (cpfCnpjEl) {
        tomadorCnpj = getText(cpfCnpjEl as Element, "Cnpj") || getTextNoNs(cpfCnpjEl as Element, "Cnpj");
        tomadorCpf  = getText(cpfCnpjEl as Element, "Cpf")  || getTextNoNs(cpfCnpjEl as Element, "Cpf");
      }

      tomadorRazao = getText(tomadorEl, "RazaoSocial") || getTextNoNs(tomadorEl, "RazaoSocial");

      const endEl =
        tomadorEl.getElementsByTagNameNS(ABRASF_NS, "Endereco")[0] ||
        tomadorEl.getElementsByTagName("Endereco")[0];
      if (endEl) {
        tomadorUf        = getText(endEl, "Uf")               || getTextNoNs(endEl, "Uf");
        tomadorMunicipio = getText(endEl, "CodigoMunicipio")   || getTextNoNs(endEl, "CodigoMunicipio");
        tomadorCep       = getText(endEl, "Cep")               || getTextNoNs(endEl, "Cep");
      }

      const contatoEl =
        tomadorEl.getElementsByTagNameNS(ABRASF_NS, "Contato")[0] ||
        tomadorEl.getElementsByTagName("Contato")[0];
      if (contatoEl) {
        tomadorTelefone = getText(contatoEl, "Telefone") || getTextNoNs(contatoEl, "Telefone");
      }
    }

    const discriminacao = get("Discriminacao");
    const outras = get("OutrasInformacoes");

    // Extrair refs de pedido: "Pedido 3264" → ["3264"]
    const pedidoRefs = [...outras.matchAll(/[Pp]edidos?\s*[:#]?\s*(\d+)/g)].map(m => m[1]);

    // Extrair veículo: "Veículo: Onix|..." → "Onix"
    const veiculoMatch = discriminacao.match(/[Vv]e[íi]culo[:\s]+([^|#\n,]+)/);
    const veiculoDesc = veiculoMatch?.[1]?.trim() ?? null;

    // Extrair qtd do padrão "descrição|qtd|unit|total#"
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

// ─── Processar ZIP ───────────────────────────────────────────────────────────

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

// ─── Helpers de formato ──────────────────────────────────────────────────────

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

// ─── Componente ──────────────────────────────────────────────────────────────

const CHART_COLORS = ["#1a7a4a", "#2d9d64", "#3bb87a", "#4dce8d", "#68dfa0", "#87ecb8"];

export default function NFSeImportPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // ── Upload state ──────────────────────────────────────────────────────────
  const [parsedRecords, setParsedRecords] = useState<NFSeParsed[]>([]);
  const [importing, setImporting]         = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importResult, setImportResult]   = useState<{ inserted: number; duplicates: number } | null>(null);
  const [isDragging, setIsDragging]       = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Database tab state ────────────────────────────────────────────────────
  const [dbFilters, setDbFilters] = useState({ from: "", to: "", uf: "", search: "" });
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  const { data: dbRecords = [], isLoading: dbLoading } = useNFSeData({
    from:   dbFilters.from   || undefined,
    to:     dbFilters.to     || undefined,
    uf:     dbFilters.uf     || undefined,
    search: dbFilters.search || undefined,
  });

  const stats = useMemo(() => calcNFSeStats(dbRecords), [dbRecords]);

  // ── File processing ───────────────────────────────────────────────────────
  const processFiles = useCallback(async (files: File[]) => {
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
    // Deduplicate by numero
    const seen = new Set<number>();
    const deduped = allParsed.filter(r => {
      if (seen.has(r.numero)) return false;
      seen.add(r.numero);
      return true;
    });
    setParsedRecords(deduped);
    setImportResult(null);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    processFiles(Array.from(e.dataTransfer.files));
  }, [processFiles]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) processFiles(Array.from(e.target.files));
  }, [processFiles]);

  // ── Import to Supabase ────────────────────────────────────────────────────
  const handleImport = async () => {
    if (!parsedRecords.length || !user) return;
    setImporting(true);
    setImportProgress(0);

    const batchId = crypto.randomUUID();
    const CHUNK = 50;
    let inserted = 0;
    let duplicates = 0;

    try {
      for (let i = 0; i < parsedRecords.length; i += CHUNK) {
        const chunk = parsedRecords.slice(i, i + CHUNK).map(r => ({
          ...r,
          batch_id: batchId,
          imported_by: user.id,
        }));

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
      toast.success(`${inserted} NF-e importadas. ${duplicates > 0 ? `${duplicates} duplicatas ignoradas.` : ""}`);
    } catch (err: any) {
      toast.error("Erro ao importar: " + err.message);
    } finally {
      setImporting(false);
      setImportProgress(100);
    }
  };

  // ─── Render ──────────────────────────────────────────────────────────────

  // Chart data
  const monthChartData = useMemo(() =>
    Object.entries(stats.byMonth)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => ({ mes: fmtMonth(k), total: v.total, count: v.count })),
    [stats.byMonth]
  );

  const ufChartData = useMemo(() =>
    Object.entries(stats.byUF)
      .sort(([, a], [, b]) => b.total - a.total)
      .slice(0, 10)
      .map(([uf, v]) => ({ uf, total: v.total, count: v.count })),
    [stats.byUF]
  );

  return (
    <div className="flex flex-col gap-6 p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Integração Direta — NFS-e</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Importe XMLs de Nota Fiscal de Serviço (padrão ABRASF) emitidas pela Carbo e visualize o dashboard CarboVapt.
        </p>
      </div>

      <Tabs defaultValue="upload">
        <TabsList className="w-full sm:w-auto">
          <TabsTrigger value="upload" className="gap-2">
            <Upload className="h-4 w-4" />
            Upload NFS-e
          </TabsTrigger>
          <TabsTrigger value="database" className="gap-2">
            <Database className="h-4 w-4" />
            Base de Dados
            {dbRecords.length > 0 && (
              <Badge variant="secondary" className="ml-1 text-xs px-1.5 py-0">
                {dbRecords.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* ── ABA UPLOAD ─────────────────────────────────────────────────── */}
        <TabsContent value="upload" className="mt-4 space-y-4">
          {/* Dropzone */}
          <div
            onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={cn(
              "border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors",
              isDragging
                ? "border-primary bg-primary/5"
                : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/30"
            )}
          >
            <Upload className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
            <p className="text-sm font-medium">Arraste XMLs ou um arquivo ZIP aqui</p>
            <p className="text-xs text-muted-foreground mt-1">
              Suporta múltiplos XMLs individuais ou um .zip com todos os arquivos
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xml,.zip"
              multiple
              className="hidden"
              onChange={handleFileInput}
            />
          </div>

          {/* Preview */}
          {parsedRecords.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">
                  {parsedRecords.length} NF-e prontas para importar
                  {" "}
                  <span className="text-muted-foreground font-normal">
                    (total: R$ {fmtBRL(parsedRecords.reduce((s, r) => s + r.valor_servicos, 0))})
                  </span>
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => { setParsedRecords([]); setImportResult(null); }}
                  className="text-xs text-muted-foreground"
                >
                  <X className="h-3 w-3 mr-1" /> Limpar
                </Button>
              </div>

              {/* Tabela preview */}
              <div className="border rounded-lg overflow-auto max-h-72">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50 sticky top-0">
                    <tr>
                      <th className="text-left p-2 font-medium">#NF</th>
                      <th className="text-left p-2 font-medium">Data</th>
                      <th className="text-left p-2 font-medium">Cliente</th>
                      <th className="text-left p-2 font-medium">UF</th>
                      <th className="text-right p-2 font-medium">R$ Valor</th>
                      <th className="text-left p-2 font-medium">Arquivo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsedRecords.map((r, i) => (
                      <tr key={r.numero} className={cn("border-t", i % 2 === 0 ? "bg-background" : "bg-muted/20")}>
                        <td className="p-2 font-mono">{r.numero}</td>
                        <td className="p-2">{fmtDate(r.data_emissao)}</td>
                        <td className="p-2 max-w-[180px] truncate">{r.tomador_razao_social ?? r.tomador_cpf_cnpj ?? "—"}</td>
                        <td className="p-2">{r.tomador_uf ?? "—"}</td>
                        <td className="p-2 text-right font-medium">{fmtBRL(r.valor_servicos)}</td>
                        <td className="p-2 text-muted-foreground truncate max-w-[120px]">{r.filename}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Botão import */}
              {!importResult && (
                <Button
                  onClick={handleImport}
                  disabled={importing}
                  className="w-full sm:w-auto gap-2"
                >
                  {importing ? (
                    <>Importando... {importProgress}%</>
                  ) : (
                    <>
                      <CheckCircle2 className="h-4 w-4" />
                      Importar {parsedRecords.length} NF-e
                    </>
                  )}
                </Button>
              )}

              {importing && (
                <Progress value={importProgress} className="h-2" />
              )}

              {importResult && (
                <div className="flex items-center gap-3 p-3 rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800">
                  <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0" />
                  <div className="text-sm">
                    <span className="font-semibold text-green-700 dark:text-green-400">
                      {importResult.inserted} NF-e importadas com sucesso
                    </span>
                    {importResult.duplicates > 0 && (
                      <span className="text-muted-foreground ml-2">
                        · {importResult.duplicates} duplicatas ignoradas
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </TabsContent>

        {/* ── ABA BASE DE DADOS ───────────────────────────────────────────── */}
        <TabsContent value="database" className="mt-4 space-y-5">

          {/* KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Total NFs", value: stats.count.toString(), icon: Receipt },
              { label: "Faturamento", value: `R$ ${fmtBRL(stats.total)}`, icon: TrendingUp },
              { label: "Ticket Médio", value: `R$ ${fmtBRL(stats.ticket)}`, icon: TrendingUp },
              {
                label: "NFs este mês",
                value: (() => {
                  const m = new Date().toISOString().slice(0, 7);
                  return (stats.byMonth[m]?.count ?? 0).toString();
                })(),
                icon: FileText,
              },
            ].map(kpi => (
              <div key={kpi.label} className="border rounded-xl p-4 bg-card flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">{kpi.label}</span>
                <span className="text-xl font-bold tabular-nums">{kpi.value}</span>
              </div>
            ))}
          </div>

          {/* Filtros */}
          <div className="flex flex-wrap gap-2">
            <Input
              type="date"
              className="h-8 w-36 text-xs"
              placeholder="De"
              value={dbFilters.from}
              onChange={e => setDbFilters(f => ({ ...f, from: e.target.value }))}
            />
            <Input
              type="date"
              className="h-8 w-36 text-xs"
              placeholder="Até"
              value={dbFilters.to}
              onChange={e => setDbFilters(f => ({ ...f, to: e.target.value }))}
            />
            <Input
              className="h-8 w-28 text-xs"
              placeholder="UF (ex: BA)"
              maxLength={2}
              value={dbFilters.uf}
              onChange={e => setDbFilters(f => ({ ...f, uf: e.target.value.toUpperCase() }))}
            />
            <div className="relative flex-1 min-w-[180px]">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
              <Input
                className="h-8 pl-7 text-xs"
                placeholder="Buscar cliente..."
                value={dbFilters.search}
                onChange={e => setDbFilters(f => ({ ...f, search: e.target.value }))}
              />
            </div>
            {(dbFilters.from || dbFilters.to || dbFilters.uf || dbFilters.search) && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-xs"
                onClick={() => setDbFilters({ from: "", to: "", uf: "", search: "" })}
              >
                <X className="h-3 w-3 mr-1" /> Limpar
              </Button>
            )}
          </div>

          {/* Gráficos */}
          {!dbLoading && dbRecords.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Faturamento por mês */}
              <div className="border rounded-xl p-4 bg-card">
                <p className="text-sm font-semibold mb-3">Faturamento por Mês</p>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={monthChartData} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                    <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                    <Tooltip
                      formatter={(v: number) => [`R$ ${fmtBRL(v)}`, "Faturamento"]}
                      labelStyle={{ fontSize: 12 }}
                    />
                    <Bar dataKey="total" radius={[4, 4, 0, 0]}>
                      {monthChartData.map((_, i) => (
                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Top UFs */}
              <div className="border rounded-xl p-4 bg-card">
                <p className="text-sm font-semibold mb-3">Top 10 UFs (por faturamento)</p>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart
                    data={ufChartData}
                    layout="vertical"
                    margin={{ top: 0, right: 20, bottom: 0, left: 20 }}
                  >
                    <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                    <YAxis type="category" dataKey="uf" tick={{ fontSize: 11 }} width={28} />
                    <Tooltip
                      formatter={(v: number) => [`R$ ${fmtBRL(v)}`, "Faturamento"]}
                      labelStyle={{ fontSize: 12 }}
                    />
                    <Bar dataKey="total" radius={[0, 4, 4, 0]}>
                      {ufChartData.map((_, i) => (
                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Tabela completa */}
          {dbLoading ? (
            <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
              Carregando...
            </div>
          ) : dbRecords.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 gap-3 text-muted-foreground">
              <AlertCircle className="h-8 w-8" />
              <p className="text-sm">Nenhuma NFS-e encontrada. Importe arquivos na aba "Upload NFS-e".</p>
            </div>
          ) : (
            <div className="border rounded-lg overflow-auto">
              <table className="w-full text-xs">
                <thead className="bg-muted/50 sticky top-0 z-10">
                  <tr>
                    <th className="text-left p-2 font-medium w-6"></th>
                    <th className="text-left p-2 font-medium">#NF</th>
                    <th className="text-left p-2 font-medium">Data</th>
                    <th className="text-left p-2 font-medium">Cliente</th>
                    <th className="text-left p-2 font-medium">UF</th>
                    <th className="text-right p-2 font-medium">R$ Valor</th>
                    <th className="text-left p-2 font-medium">Pedido(s)</th>
                    <th className="text-left p-2 font-medium">Veículo</th>
                  </tr>
                </thead>
                <tbody>
                  {dbRecords.map((r, i) => (
                    <React.Fragment key={r.id}>
                      <tr
                        className={cn(
                          "border-t cursor-pointer hover:bg-muted/30 transition-colors",
                          i % 2 === 0 ? "bg-background" : "bg-muted/10"
                        )}
                        onClick={() => setExpandedRow(expandedRow === r.id ? null : r.id)}
                      >
                        <td className="p-2 text-muted-foreground">
                          {expandedRow === r.id
                            ? <ChevronUp className="h-3 w-3" />
                            : <ChevronDown className="h-3 w-3" />
                          }
                        </td>
                        <td className="p-2 font-mono font-medium">{r.numero}</td>
                        <td className="p-2">{fmtDate(r.data_emissao)}</td>
                        <td className="p-2 max-w-[200px] truncate">{r.tomador_razao_social ?? r.tomador_cpf_cnpj ?? "—"}</td>
                        <td className="p-2">
                          {r.tomador_uf ? (
                            <Badge variant="outline" className="text-xs px-1.5 py-0">{r.tomador_uf}</Badge>
                          ) : "—"}
                        </td>
                        <td className="p-2 text-right font-semibold tabular-nums">
                          {fmtBRL(r.valor_servicos ?? 0)}
                        </td>
                        <td className="p-2 text-muted-foreground">
                          {r.pedido_refs?.length ? r.pedido_refs.join(", ") : "—"}
                        </td>
                        <td className="p-2 max-w-[120px] truncate">{r.veiculo_descricao ?? "—"}</td>
                      </tr>
                      {expandedRow === r.id && (
                        <tr className={i % 2 === 0 ? "bg-background" : "bg-muted/10"}>
                          <td colSpan={8} className="px-4 pb-3 pt-1">
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                              <div>
                                <span className="text-muted-foreground">CPF/CNPJ Tomador:</span>
                                <div className="font-medium">{r.tomador_cpf_cnpj ?? "—"}</div>
                              </div>
                              <div>
                                <span className="text-muted-foreground">CEP:</span>
                                <div className="font-medium">{r.tomador_cep ?? "—"}</div>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Cód. Item Serviço:</span>
                                <div className="font-medium">{r.item_lista_servico ?? "—"}</div>
                              </div>
                              <div>
                                <span className="text-muted-foreground">ISS Retido:</span>
                                <div className="font-medium">{r.iss_retido ? "Sim" : "Não"}</div>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Qtd. Veículos:</span>
                                <div className="font-medium">{r.qtd_veiculos ?? "—"}</div>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Competência:</span>
                                <div className="font-medium">{fmtDate(r.competencia)}</div>
                              </div>
                              {r.discriminacao && (
                                <div className="col-span-2 sm:col-span-3">
                                  <span className="text-muted-foreground">Discriminação:</span>
                                  <div className="font-medium whitespace-pre-wrap">{r.discriminacao}</div>
                                </div>
                              )}
                              {r.outras_informacoes && (
                                <div className="col-span-2 sm:col-span-3">
                                  <span className="text-muted-foreground">Outras Informações:</span>
                                  <div className="font-medium">{r.outras_informacoes}</div>
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
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
