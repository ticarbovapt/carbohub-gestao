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

// ── Bridge helpers (client-side, no edge function needed) ──────────────────
const SKU_TO_LINHA: Record<string, string> = {
  "SKU-CZ100": "carboze_100ml", "CZ100": "carboze_100ml",
  "SKU-CZ1L": "carboze_1l",    "CZ1L": "carboze_1l",
  "SKU-CZSC10": "carboze_sache_10ml", "CZSC10": "carboze_sache_10ml",
  "SKU-CP100": "carbopro",     "CP100": "carbopro",
  "SKU-VAPT70": "carbovapt",   "VAPT70": "carbovapt",
};

function detectLinha(name: string): string {
  const n = (name || "").toLowerCase();
  if (n.includes("sach") || (n.includes("10ml") && !n.includes("100ml"))) return "carboze_sache_10ml";
  if (n.includes(" 1l") || n.includes("1 l") || n.includes("1l ")) return "carboze_1l";
  if (n.includes("carbopro") || n.includes("pro ") || n.includes("pro-")) return "carbopro";
  if (n.includes("vapt") || n.includes("servi")) return "carbovapt";
  return "carboze_100ml";
}

function mapBlingStatus(situacaoId: number | null, situacaoValor: string | null): string {
  const v = (situacaoValor || "").toLowerCase();
  if (situacaoId === 9  || v.includes("atendido")) return "delivered";
  if (situacaoId === 12 || v.includes("cancelado")) return "cancelled";
  if (v.includes("enviado") || v.includes("expedido") || v.includes("transporte")) return "shipped";
  if (situacaoId === 17 || v.includes("verificado") || v.includes("faturado")) return "invoiced";
  if (situacaoId === 15 || v.includes("andamento") || v.includes("confirmado")) return "confirmed";
  return "pending";
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
      await Promise.all([loadCounts(), loadSyncLogs(), loadTreatmentSummary(), loadLastCronRun()]);
      toast.success("Pipeline completo! Dados sincronizados, tratados e importados.");
    } catch (error: any) {
      toast.error(error.message || "Erro no pipeline");
      setPipelineStep("idle");
    } finally {
      setSyncing(null);
    }
  }, [loadTreatmentSummary, loadLastCronRun]);

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
    loadTreatmentSummary();
    loadLastCronRun();
  }, []);

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

  const handleBridge = useCallback(async () => {
    setSyncing("bridge");
    try {
      // Log entry
      const { data: logEntry } = await supabase
        .from("bling_sync_log")
        .insert({ entity_type: "bridge", status: "running" })
        .select("id")
        .single();
      const logId = (logEntry as any)?.id || "";

      // Load reference data
      const [{ data: blingOrders }, { data: skus }, { data: licensees }] = await Promise.all([
        (supabase as any).from("bling_orders").select("*").order("data", { ascending: false }),
        (supabase as any).from("sku").select("id, code, name"),
        (supabase as any).from("licensees").select("id, name, trade_name"),
      ]);

      if (!blingOrders?.length) {
        toast.info("Nenhum pedido Bling para importar. Execute a sincronização primeiro.");
        await (supabase as any).from("bling_sync_log").update({ status: "completed", records_synced: 0, finished_at: new Date().toISOString() }).eq("id", logId);
        return;
      }

      const skuMap = new Map((skus || []).map((s: any) => [s.code, s]));
      const normalize = (s: string) => (s || "").toLowerCase().trim();
      let synced = 0, failed = 0;

      for (const bo of blingOrders) {
        try {
          const externalRef = `bling-${bo.bling_id}`;
          const items: any[] = Array.isArray(bo.items) ? bo.items : [];
          let detectedLinha = "carboze_100ml";
          let skuId: string | null = null;

          const carboItems = items.map((item: any) => {
            const codigo: string = item.codigo || item.produto?.codigo || "";
            const nome: string = item.descricao || item.produto?.nome || "";
            const linha = SKU_TO_LINHA[codigo] || detectLinha(nome);
            if (!skuId) {
              const matched = skuMap.get(codigo);
              if (matched) { skuId = matched.id; detectedLinha = linha; }
              else { detectedLinha = linha; }
            }
            const qty = Number(item.quantidade) || 1;
            const price = Number(item.valor) || 0;
            return { product_name: nome, sku_code: codigo, quantity: qty, unit_price: price, total: qty * price };
          });

          const contato = normalize(bo.contato_nome);
          const licenseeId = (licensees || []).find(
            (l: any) => normalize(l.name) === contato || normalize(l.trade_name) === contato
          )?.id || null;

          const status = mapBlingStatus(bo.situacao_id, bo.situacao_valor);

          const { data: existing } = await (supabase as any).from("carboze_orders").select("id, status").eq("external_ref", externalRef).single();

          if (existing) {
            if (existing.status !== status) {
              await (supabase as any).from("carboze_orders").update({ status, updated_at: new Date().toISOString() }).eq("id", existing.id);
            }
          } else {
            const orderDate = bo.data ? new Date(bo.data).toISOString() : new Date().toISOString();
            const { error: insertErr } = await (supabase as any).from("carboze_orders").insert({
              order_number: "",  // auto-generated by DB trigger
              customer_name: bo.contato_nome || "Cliente Bling",
              items: carboItems,
              subtotal: Number(bo.total_produtos) || 0,
              shipping_cost: Number(bo.total_frete) || 0,
              discount: Number(bo.total_desconto) || 0,
              total: Number(bo.total) || 0,
              status,
              licensee_id: licenseeId,
              external_ref: externalRef,
              notes: bo.observacoes || null,
              source_file: "bling_sync",
              created_at: orderDate,
            });
            if (insertErr) throw insertErr;
          }
          synced++;
        } catch (e: any) {
          console.error("Bridge insert failed:", e?.message, e);
          failed++;
        }
      }

      await (supabase as any).from("bling_sync_log").update({ status: "completed", records_synced: synced, records_failed: failed, finished_at: new Date().toISOString() }).eq("id", logId);
      toast.success(`Importação concluída! ${synced} pedidos importados para o CarboHub.`);
      loadSyncLogs();
    } catch (error: any) {
      toast.error(error.message || "Erro na importação de pedidos");
    } finally {
      setSyncing(null);
    }
  }, []);

  // Sync a single entity via edge function (products | contacts | orders)
  const syncEntity = async (entity: "products" | "contacts" | "orders"): Promise<number> => {
    const response = await supabase.functions.invoke("bling-sync", { body: { entity } });
    if (response.data?.success) {
      return (response.data.data[entity]?.synced || 0);
    }
    throw new Error(response.data?.error || `Erro ao sincronizar ${entity}`);
  };

  // "Sincronizar Tudo" — runs 3 entities individually (no "all" → avoids old bridge bug)
  // then runs bridge client-side
  const handleSyncAll = useCallback(async () => {
    setSyncing("all");
    let totalSynced = 0;
    try {
      for (const entity of ["products", "contacts", "orders"] as const) {
        setSyncing(entity);
        totalSynced += await syncEntity(entity);
        loadCounts();
      }
      toast.success(`Sincronização concluída! ${totalSynced} registros atualizados.`);
      loadSyncLogs();
    } catch (error: any) {
      toast.error(error.message || "Erro na sincronização");
    } finally {
      setSyncing(null);
    }
  }, []);

  const handleSync = async (entity: "products" | "contacts" | "orders") => {
    setSyncing(entity);
    try {
      const synced = await syncEntity(entity);
      toast.success(`Sincronização concluída! ${synced} registros atualizados.`);
      loadSyncLogs();
      loadCounts();
    } catch (error: any) {
      toast.error(error.message || "Erro na sincronização");
    } finally {
      setSyncing(null);
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
          {/* Sync Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <Package className="h-8 w-8 text-blue-500" />
                    <div>
                      <p className="font-semibold">Produtos</p>
                      <p className="text-2xl font-bold">{counts.products}</p>
                    </div>
                  </div>
                </div>
                <Button
                  className="w-full"
                  variant="outline"
                  disabled={!!syncing}
                  onClick={() => handleSync("products")}
                >
                  {syncing === "products" ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Sincronizando...</>
                  ) : (
                    <><RefreshCw className="h-4 w-4 mr-2" /> Sincronizar</>
                  )}
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <Users className="h-8 w-8 text-purple-500" />
                    <div>
                      <p className="font-semibold">Contatos</p>
                      <p className="text-2xl font-bold">{counts.contacts}</p>
                    </div>
                  </div>
                </div>
                <Button
                  className="w-full"
                  variant="outline"
                  disabled={!!syncing}
                  onClick={() => handleSync("contacts")}
                >
                  {syncing === "contacts" ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Sincronizando...</>
                  ) : (
                    <><RefreshCw className="h-4 w-4 mr-2" /> Sincronizar</>
                  )}
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <ShoppingCart className="h-8 w-8 text-orange-500" />
                    <div>
                      <p className="font-semibold">Pedidos</p>
                      <p className="text-2xl font-bold">{counts.orders}</p>
                    </div>
                  </div>
                </div>
                <Button
                  className="w-full"
                  variant="outline"
                  disabled={!!syncing}
                  onClick={() => handleSync("orders")}
                >
                  {syncing === "orders" ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Sincronizando...</>
                  ) : (
                    <><RefreshCw className="h-4 w-4 mr-2" /> Sincronizar</>
                  )}
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* NF-e card */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <FileText className="h-8 w-8 text-rose-500" />
                  <div>
                    <p className="font-semibold">Notas Fiscais</p>
                    <p className="text-2xl font-bold">{counts.nfe}</p>
                  </div>
                </div>
              </div>
              <Button
                className="w-full"
                variant="outline"
                disabled={!!syncing}
                onClick={() => handleSync("nfe" as any)}
              >
                {syncing === "nfe" ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Sincronizando...</>
                ) : (
                  <><RefreshCw className="h-4 w-4 mr-2" /> Sincronizar NFs</>
                )}
              </Button>
            </CardContent>
          </Card>

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

              {/* Cron schedule info */}
              <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/40 rounded-lg px-3 py-2">
                <Clock className="h-3 w-3 flex-shrink-0" />
                <span>
                  Agendado automaticamente: <strong>7h e 13h</strong> (Fortaleza)
                  {lastCronRun ? (
                    <> · Último sync automático: {new Date(lastCronRun).toLocaleString("pt-BR")}</>
                  ) : (
                    <> · Nenhum sync automático ainda</>
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
