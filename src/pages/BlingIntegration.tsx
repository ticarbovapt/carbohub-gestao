import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Link2,
  Unlink,
  RefreshCw,
  Package,
  Users,
  ShoppingCart,
  Loader2,
  CheckCircle,
  CheckCircle2,
  XCircle,
  Clock,
  Download,
  FileSpreadsheet,
  FileText,
  Play,
} from "lucide-react";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { BoardLayout } from "@/components/layouts/BoardLayout";

interface SyncResult {
  synced: number;
  failed: number;
  error?: string;
}

interface SyncLog {
  id: string;
  entity_type: string;
  status: string;
  records_synced: number;
  records_failed: number;
  error_message: string | null;
  started_at: string;
  finished_at: string | null;
}

export default function BlingIntegration() {
  const navigate = useNavigate();
  const [isConnected, setIsConnected] = useState(false);
  const [isExpired, setIsExpired] = useState(false);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [syncLogs, setSyncLogs] = useState<SyncLog[]>([]);
  const [counts, setCounts] = useState({ products: 0, contacts: 0, orders: 0, nfe: 0 });
  const [exporting, setExporting] = useState<string | null>(null);
  const [pipelineStep, setPipelineStep] = useState<"idle" | "syncing" | "done">("idle");
  const [treatmentSummary, setTreatmentSummary] = useState<{ ok: number; warnings: number; errors: number; runId: string } | null>(null);
  const [lastCronRun, setLastCronRun] = useState<string | null>(null);
  const [nfStatus, setNfStatus] = useState<{
    total: number; vinculadas: number; pending: number; no_code: number; invalid_code: number;
  } | null>(null);

  const checkStatus = async () => {
    try {
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), 8000)
      );
      const response = await Promise.race([
        supabase.functions.invoke("bling-auth", { body: { action: "status" } }),
        timeout,
      ]);
      if (response.data?.success) {
        setIsConnected(response.data.data.connected);
        setIsExpired(response.data.data.expired);
      } else {
        setIsConnected(false);
      }
    } catch (error) {
      console.error("Bling status check failed:", error);
      setIsConnected(false);
    } finally {
      setLoading(false);
    }
  };

  const loadSyncLogs = async () => {
    const { data } = await supabase
      .from("bling_sync_log")
      .select("*")
      .order("started_at", { ascending: false })
      .limit(10);
    if (data) setSyncLogs(data as SyncLog[]);
  };

  const loadCounts = async () => {
    const [products, contacts, orders, nfe] = await Promise.all([
      supabase.from("bling_products").select("id", { count: "exact", head: true }),
      supabase.from("bling_contacts").select("id", { count: "exact", head: true }),
      supabase.from("bling_orders").select("id", { count: "exact", head: true }),
      (supabase as any).from("bling_nfe").select("id", { count: "exact", head: true }),
    ]);
    setCounts({
      products: products.count || 0,
      contacts: contacts.count || 0,
      orders: orders.count || 0,
      nfe: nfe.count || 0,
    });
  };

  const loadNFStatus = useCallback(async () => {
    try {
      const { data } = await (supabase as any).from("bling_nfe").select("match_status");
      if (!data) return;
      const acc = { total: data.length, vinculadas: 0, pending: 0, no_code: 0, invalid_code: 0 };
      for (const r of data) {
        if (r.match_status === "matched" || r.match_status === "manual") acc.vinculadas++;
        else if (r.match_status === "pending") acc.pending++;
        else if (r.match_status === "no_code") acc.no_code++;
        else if (r.match_status === "invalid_code") acc.invalid_code++;
      }
      setNfStatus(acc);
    } catch {
      // bling_nfe pode não existir em ambientes antigos
    }
  }, []);

  const loadTreatmentSummary = useCallback(async () => {
    try {
      const { data: latestLog } = await (supabase as any)
        .from("bling_treatment_log")
        .select("run_id, created_at")
        .order("created_at", { ascending: false })
        .limit(1)
        .single();
      if (!latestLog) return;

      const runId = latestLog.run_id;
      const { data: rows } = await (supabase as any)
        .from("bling_treatment_log")
        .select("status")
        .eq("run_id", runId);

      if (!rows) return;
      setTreatmentSummary({
        ok: rows.filter((r: any) => r.status === "ok").length,
        warnings: rows.filter((r: any) => r.status === "warning").length,
        errors: rows.filter((r: any) => r.status === "error").length,
        runId,
      });
    } catch {
      // treatment log may not exist yet
    }
  }, []);

  const loadLastCronRun = useCallback(async () => {
    try {
      const { data } = await (supabase as any)
        .from("bling_sync_log")
        .select("started_at")
        .is("triggered_by", null)
        .eq("entity_type", "bridge")
        .order("started_at", { ascending: false })
        .limit(1)
        .single();
      if (data) setLastCronRun(data.started_at);
    } catch {
      // no cron run yet
    }
  }, []);

  const handleRunPipeline = useCallback(async () => {
    setSyncing("pipeline");
    setPipelineStep("syncing");
    try {
      const response = await supabase.functions.invoke("bling-sync", {
        body: { entity: "all" },
      });
      if (!response.data?.success) {
        throw new Error(response.data?.error || "Pipeline falhou");
      }
      setPipelineStep("done");
      await Promise.all([loadCounts(), loadNFStatus(), loadSyncLogs(), loadTreatmentSummary(), loadLastCronRun()]);
      toast.success("Pipeline completo! Dados sincronizados, tratados e importados.");
    } catch (error: any) {
      toast.error(error.message || "Erro no pipeline");
      setPipelineStep("idle");
    } finally {
      setSyncing(null);
    }
  }, [loadNFStatus, loadTreatmentSummary, loadLastCronRun]);

  // ── Export helpers ─────────────────────────────────────────────────────────
  const exportToXlsx = (rows: Record<string, any>[], filename: string, sheetName: string) => {
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    XLSX.writeFile(wb, filename);
  };

  const handleExportFornecedores = async () => {
    setExporting("fornecedores");
    try {
      const { data } = await (supabase as any)
        .from("bling_contacts")
        .select("nome, fantasia, cpf_cnpj, ie, email, telefone, celular, tipo_pessoa, situacao")
        .eq("is_supplier", true)
        .order("nome");
      if (!data?.length) { toast.info("Nenhum fornecedor encontrado."); return; }
      const rows = data.map((c: any) => ({
        Nome: c.nome,
        "Nome Fantasia": c.fantasia || "",
        "CPF/CNPJ": c.cpf_cnpj || "",
        IE: c.ie || "",
        Email: c.email || "",
        Telefone: c.telefone || "",
        Celular: c.celular || "",
        Tipo: c.tipo_pessoa || "",
        Situação: c.situacao || "",
      }));
      exportToXlsx(rows, `fornecedores_bling_${new Date().toISOString().slice(0,10)}.xlsx`, "Fornecedores");
      toast.success(`${rows.length} fornecedores exportados!`);
    } catch (e: any) {
      toast.error("Erro ao exportar fornecedores: " + e.message);
    } finally { setExporting(null); }
  };

  const handleExportPedidos = async () => {
    setExporting("pedidos");
    try {
      const { data } = await (supabase as any)
        .from("bling_orders")
        .select("numero, data, contato_nome, total_produtos, total_frete, total_desconto, total, situacao_valor, observacoes")
        .order("data", { ascending: false });
      if (!data?.length) { toast.info("Nenhum pedido encontrado."); return; }
      const rows = data.map((o: any) => ({
        "Nº Pedido": o.numero,
        Data: o.data || "",
        Cliente: o.contato_nome || "",
        "Total Produtos": Number(o.total_produtos) || 0,
        Frete: Number(o.total_frete) || 0,
        Desconto: Number(o.total_desconto) || 0,
        "Total (R$)": Number(o.total) || 0,
        Situação: o.situacao_valor || "",
        Observações: o.observacoes || "",
      }));
      exportToXlsx(rows, `pedidos_bling_${new Date().toISOString().slice(0,10)}.xlsx`, "Pedidos");
      toast.success(`${rows.length} pedidos exportados!`);
    } catch (e: any) {
      toast.error("Erro ao exportar pedidos: " + e.message);
    } finally { setExporting(null); }
  };

  const handleExportNFe = async () => {
    setExporting("nfe");
    try {
      const { data } = await (supabase as any)
        .from("bling_nfe")
        .select("numero, serie, chave_acesso, data_emissao, contato_nome, contato_cnpj, valor_total, situacao")
        .order("data_emissao", { ascending: false });
      if (!data?.length) { toast.info("Nenhuma NF encontrada. Execute 'Sincronizar Tudo' primeiro."); return; }
      const rows = data.map((nf: any) => ({
        "Nº NF": nf.numero || "",
        Série: nf.serie || "",
        "Chave de Acesso": nf.chave_acesso || "",
        "Data Emissão": nf.data_emissao || "",
        Destinatário: nf.contato_nome || "",
        "CNPJ/CPF": nf.contato_cnpj || "",
        "Valor Total (R$)": Number(nf.valor_total) || 0,
        Situação: nf.situacao || "",
      }));
      exportToXlsx(rows, `nfe_bling_${new Date().toISOString().slice(0,10)}.xlsx`, "NF-e");
      toast.success(`${rows.length} NFs exportadas!`);
    } catch (e: any) {
      toast.error("Erro ao exportar NFs: " + e.message);
    } finally { setExporting(null); }
  };

  useEffect(() => {
    checkStatus();
    loadSyncLogs();
    loadCounts();
    loadNFStatus();
    loadTreatmentSummary();
    loadLastCronRun();
  }, [loadNFStatus, loadTreatmentSummary, loadLastCronRun]);

  const handleConnect = async () => {
    try {
      const response = await supabase.functions.invoke("bling-auth", {
        body: { action: "authorize" },
      });

      if (response.error) {
        console.error("Bling auth invoke error:", response.error);
        toast.error(`Erro: ${response.error.message || JSON.stringify(response.error)}`);
        return;
      }

      if (response.data?.success) {
        window.location.href = response.data.data.authUrl;
      } else {
        const errorMsg = response.data?.error || "Erro desconhecido ao gerar URL";
        console.error("Bling auth response error:", response.data);
        toast.error(errorMsg);
      }
    } catch (error: any) {
      console.error("Bling auth exception:", error);
      toast.error(error.message || "Erro ao conectar");
    }
  };

  const handleDisconnect = async () => {
    try {
      // Delete tokens directly — edge function deployed version may not handle "disconnect"
      await (supabase as any).from("bling_integration").delete().gte("created_at", "2000-01-01");
      setIsConnected(false);
      setIsExpired(false);
      toast.success("Bling desconectado");
    } catch {
      toast.error("Erro ao desconectar");
    }
  };

  const handleRefresh = async () => {
    try {
      const response = await supabase.functions.invoke("bling-auth", {
        body: { action: "refresh" },
      });
      if (response.data?.success) {
        setIsExpired(false);
        toast.success("Token atualizado!");
      } else {
        toast.error(response.data?.error || "Erro ao atualizar token");
      }
    } catch {
      toast.error("Erro ao atualizar token");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <BoardLayout>
    <div className="space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-3">
          <Link2 className="h-6 w-6 text-green-500" />
          Integração Bling ERP
        </h1>
        <p className="text-muted-foreground mt-1">
          Sincronize pedidos, produtos, clientes e fornecedores
        </p>
      </div>

      {/* Connection Status */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center text-white font-bold text-lg">
                B
              </div>
              <div>
                <CardTitle>Bling ERP</CardTitle>
                <CardDescription>API v3 - OAuth2</CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {isConnected ? (
                <>
                  <Badge variant={isExpired ? "destructive" : "default"} className={!isExpired ? "bg-green-500" : ""}>
                    {isExpired ? "Token Expirado" : "Conectado"}
                  </Badge>
                  {isExpired && (
                    <Button size="sm" variant="outline" onClick={handleRefresh}>
                      <RefreshCw className="h-4 w-4 mr-1" /> Renovar
                    </Button>
                  )}
                  <Button size="sm" variant="destructive" onClick={handleDisconnect}>
                    <Unlink className="h-4 w-4 mr-1" /> Desconectar
                  </Button>
                </>
              ) : (
                <Button onClick={handleConnect} className="bg-green-600 hover:bg-green-700 text-white">
                  <Link2 className="h-4 w-4 mr-2" /> Conectar ao Bling
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
      </Card>

      {isConnected && (
        <>
          {/* Compact Stats Row — 4 entities em uma linha (só leitura).
              A sincronização é feita pelo botão único "Sincronizar tudo" abaixo. */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {([
              { label: "Produtos",      count: counts.products, Icon: Package,      color: "text-blue-500",   entity: "products", hint: "Catálogo do Bling (nome, código, preço)" },
              { label: "Contatos",      count: counts.contacts, Icon: Users,        color: "text-purple-500", entity: "contacts", hint: "Clientes e fornecedores" },
              { label: "Pedidos",       count: counts.orders,   Icon: ShoppingCart, color: "text-orange-500", entity: "orders",   hint: "Pedidos de venda do Bling" },
              { label: "Notas Fiscais", count: counts.nfe,      Icon: FileText,     color: "text-rose-500",   entity: "nfe",      hint: "NFs emitidas no Bling" },
            ] as const).map(({ label, count, Icon, color, entity, hint }) => (
              <Card key={entity} className="relative overflow-hidden">
                <CardContent className="p-4">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <Icon className={`h-3.5 w-3.5 ${color}`} />
                    <span className="text-xs text-muted-foreground font-medium">{label}</span>
                  </div>
                  <p className="text-2xl font-bold tracking-tight">{count}</p>
                  <p className="text-[10px] text-muted-foreground leading-snug mt-0.5">{hint}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Status do cruzamento das Notas Fiscais */}
          {nfStatus && nfStatus.total > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <FileText className="h-5 w-5 text-rose-500" />
                    Status das Notas Fiscais
                  </CardTitle>
                  <Button size="sm" variant="outline" onClick={() => navigate("/integrations/bling/nfs")}>
                    Ver Notas Fiscais
                  </Button>
                </div>
                <CardDescription>
                  Cruzamento das NFs com os pedidos. A vinculação automática usa o número do pedido na observação da NF.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  <div className="rounded-lg border border-border bg-muted/30 p-3 text-center">
                    <p className="text-2xl font-bold tabular-nums">{nfStatus.total}</p>
                    <p className="text-xs text-muted-foreground">Total</p>
                  </div>
                  <div className="rounded-lg border border-green-500/20 bg-green-500/5 p-3 text-center">
                    <p className="text-2xl font-bold tabular-nums text-green-500">{nfStatus.vinculadas}</p>
                    <p className="text-xs text-muted-foreground">Vinculadas</p>
                  </div>
                  <div className="rounded-lg border border-border bg-muted/30 p-3 text-center">
                    <p className="text-2xl font-bold tabular-nums text-muted-foreground">{nfStatus.pending}</p>
                    <p className="text-xs text-muted-foreground">Processando</p>
                  </div>
                  <div className="rounded-lg border border-border bg-muted/30 p-3 text-center">
                    <p className="text-2xl font-bold tabular-nums text-muted-foreground">{nfStatus.no_code}</p>
                    <p className="text-xs text-muted-foreground">Sem pedido</p>
                  </div>
                  <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-center">
                    <p className="text-2xl font-bold tabular-nums text-amber-400">{nfStatus.invalid_code}</p>
                    <p className="text-xs text-muted-foreground">Código inválido</p>
                  </div>
                </div>
                {nfStatus.pending === nfStatus.total && nfStatus.total > 0 && (
                  <p className="text-xs text-amber-500 mt-3">
                    ⚠ Todas as NFs estão "processando" — o cruzamento ainda não rodou. Clique em "Sincronizar" no card Notas Fiscais para buscar a observação e cruzar.
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          {/* Export Section */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Download className="h-5 w-5 text-blue-500" />
                Exportar Dados
              </CardTitle>
              <CardDescription>
                Baixe os dados sincronizados do Bling em formato Excel (.xlsx)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Button
                  variant="outline"
                  className="gap-2 h-auto py-4 flex flex-col"
                  disabled={!!exporting}
                  onClick={handleExportFornecedores}
                >
                  {exporting === "fornecedores" ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <FileSpreadsheet className="h-5 w-5 text-blue-500" />
                  )}
                  <span className="font-medium">Fornecedores</span>
                  <span className="text-xs text-muted-foreground">Contatos is_supplier</span>
                </Button>

                <Button
                  variant="outline"
                  className="gap-2 h-auto py-4 flex flex-col"
                  disabled={!!exporting}
                  onClick={handleExportPedidos}
                >
                  {exporting === "pedidos" ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <FileSpreadsheet className="h-5 w-5 text-orange-500" />
                  )}
                  <span className="font-medium">Pedidos Bling</span>
                  <span className="text-xs text-muted-foreground">{counts.orders} registros</span>
                </Button>

                <Button
                  variant="outline"
                  className="gap-2 h-auto py-4 flex flex-col"
                  disabled={!!exporting}
                  onClick={handleExportNFe}
                >
                  {exporting === "nfe" ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <FileSpreadsheet className="h-5 w-5 text-rose-500" />
                  )}
                  <span className="font-medium">Notas Fiscais</span>
                  <span className="text-xs text-muted-foreground">{counts.nfe} registros</span>
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Pipeline de Sincronização */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Play className="h-5 w-5 text-green-500" />
                Pipeline de Sincronização
              </CardTitle>
              <CardDescription>
                Sincroniza, valida e importa dados do Bling em uma única execução
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* 3-step visual */}
              <div className="grid grid-cols-3 gap-3">
                {/* Step 1 — Sync */}
                <div className={`rounded-lg border p-3 text-center transition-colors ${
                  syncing === "pipeline" && pipelineStep === "syncing"
                    ? "border-blue-400 bg-blue-50 dark:bg-blue-950/20"
                    : pipelineStep === "done"
                    ? "border-green-400 bg-green-50 dark:bg-green-950/20"
                    : "border-border bg-muted/30"
                }`}>
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">1. Sincronizar</div>
                  <div className="text-sm font-medium">Busca do Bling</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {counts.products}p · {counts.contacts}c · {counts.orders}o
                  </div>
                  {syncing === "pipeline" && pipelineStep === "syncing" && (
                    <Loader2 className="h-4 w-4 mx-auto mt-2 animate-spin text-blue-500" />
                  )}
                  {pipelineStep === "done" && <CheckCircle2 className="h-4 w-4 mx-auto mt-2 text-green-500" />}
                </div>

                {/* Step 2 — Treatment */}
                <div className={`rounded-lg border p-3 text-center transition-colors ${
                  treatmentSummary
                    ? treatmentSummary.errors > 0
                      ? "border-red-300 bg-red-50 dark:bg-red-950/20"
                      : treatmentSummary.warnings > 0
                      ? "border-yellow-300 bg-yellow-50 dark:bg-yellow-950/20"
                      : "border-green-400 bg-green-50 dark:bg-green-950/20"
                    : "border-border bg-muted/30"
                }`}>
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">2. Tratamento</div>
                  <div className="text-sm font-medium">Validação</div>
                  {treatmentSummary ? (
                    <div className="text-xs mt-1 space-y-0.5">
                      <div className="text-green-600">✅ {treatmentSummary.ok} OK</div>
                      {treatmentSummary.warnings > 0 && (
                        <div className="text-yellow-600">⚠ {treatmentSummary.warnings} avisos</div>
                      )}
                      {treatmentSummary.errors > 0 && (
                        <div className="text-red-600">❌ {treatmentSummary.errors} erros</div>
                      )}
                    </div>
                  ) : (
                    <div className="text-xs text-muted-foreground mt-1">Aguardando sync</div>
                  )}
                </div>

                {/* Step 3 — Import */}
                <div className={`rounded-lg border p-3 text-center transition-colors ${
                  pipelineStep === "done"
                    ? "border-green-400 bg-green-50 dark:bg-green-950/20"
                    : "border-border bg-muted/30"
                }`}>
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">3. Importar</div>
                  <div className="text-sm font-medium">Bridge → CarboHub</div>
                  <div className="text-xs text-muted-foreground mt-1">Pedidos convertidos</div>
                  {pipelineStep === "done" && <CheckCircle2 className="h-4 w-4 mx-auto mt-2 text-green-500" />}
                </div>
              </div>

              {/* Cron schedule info — agendamento confirmado via pg_cron (jobs diários) */}
              <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/40 rounded-lg px-3 py-2">
                <Clock className="h-3 w-3 flex-shrink-0" />
                <span>
                  Sincronização automática: <strong>7h e 13h</strong> (Fortaleza), todos os dias
                  {lastCronRun && (
                    <> · Último run automático: <strong>{new Date(lastCronRun).toLocaleString("pt-BR")}</strong></>
                  )}
                </span>
              </div>

              {/* Run button */}
              <Button
                size="lg"
                disabled={!!syncing}
                onClick={handleRunPipeline}
                className="w-full bg-gradient-to-r from-green-600 to-emerald-600 text-white"
              >
                {syncing === "pipeline" ? (
                  <><Loader2 className="h-5 w-5 mr-2 animate-spin" /> Executando pipeline...</>
                ) : (
                  <><Play className="h-5 w-5 mr-2" /> Executar Pipeline Completo</>
                )}
              </Button>
            </CardContent>
          </Card>

          {/* Sync History */}
          {syncLogs.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Histórico de Sincronização</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {syncLogs.map((log) => (
                    <div
                      key={log.id}
                      className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                    >
                      <div className="flex items-center gap-3">
                        {log.status === "completed" && (
                          <CheckCircle className="h-4 w-4 text-green-500" />
                        )}
                        {log.status === "failed" && (
                          <XCircle className="h-4 w-4 text-red-500" />
                        )}
                        {log.status === "running" && (
                          <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
                        )}
                        <div>
                          <span className="font-medium capitalize">{log.entity_type}</span>
                          {log.records_synced > 0 && (
                            <span className="text-sm text-muted-foreground ml-2">
                              {log.records_synced} registros
                            </span>
                          )}
                          {log.error_message && (
                            <p className="text-xs text-red-500">{log.error_message}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {new Date(log.started_at).toLocaleString("pt-BR")}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
    </BoardLayout>
  );
}
