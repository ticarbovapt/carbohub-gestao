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
  XCircle,
  Clock,
} from "lucide-react";
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
  const [counts, setCounts] = useState({ products: 0, contacts: 0, orders: 0 });

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
    const [products, contacts, orders] = await Promise.all([
      supabase.from("bling_products").select("id", { count: "exact", head: true }),
      supabase.from("bling_contacts").select("id", { count: "exact", head: true }),
      supabase.from("bling_orders").select("id", { count: "exact", head: true }),
    ]);
    setCounts({
      products: products.count || 0,
      contacts: contacts.count || 0,
      orders: orders.count || 0,
    });
  };

  useEffect(() => {
    checkStatus();
    loadSyncLogs();
    loadCounts();
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

          {/* Sync All + Bridge to CarboHub */}
          <div className="flex flex-col sm:flex-row gap-3 justify-center items-center">
            <Button
              size="lg"
              disabled={!!syncing}
              onClick={handleSyncAll}
              className="bg-gradient-to-r from-green-600 to-emerald-600 text-white"
            >
              {syncing === "all" ? (
                <><Loader2 className="h-5 w-5 mr-2 animate-spin" /> Sincronizando tudo...</>
              ) : (
                <><RefreshCw className="h-5 w-5 mr-2" /> Sincronizar Tudo</>
              )}
            </Button>

            <div className="flex items-center gap-2">
              <div className="h-px w-8 bg-border hidden sm:block" />
              <span className="text-xs text-muted-foreground hidden sm:block">então</span>
              <div className="h-px w-8 bg-border hidden sm:block" />
            </div>

            <Button
              size="lg"
              variant="outline"
              disabled={!!syncing}
              onClick={handleBridge}
              className="border-orange-400 text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-950/20"
            >
              {syncing === "bridge" ? (
                <><Loader2 className="h-5 w-5 mr-2 animate-spin" /> Transferindo para CarboHub...</>
              ) : (
                <><ShoppingCart className="h-5 w-5 mr-2" /> Importar Pedidos Bling → CarboHub</>
              )}
            </Button>
          </div>

          {/* Bridge info */}
          <Card className="border-orange-200 dark:border-orange-900/40 bg-orange-50/50 dark:bg-orange-950/10">
            <CardContent className="p-4">
              <p className="text-sm font-medium text-orange-700 dark:text-orange-400">Como funciona a importação de pedidos</p>
              <ul className="text-xs text-muted-foreground mt-2 space-y-1">
                <li>1. Clique <strong>Sincronizar Tudo</strong> para copiar os dados do Bling para a base intermediária</li>
                <li>2. Clique <strong>Importar Pedidos Bling → CarboHub</strong> para converter e popular a tela de Controle de Pedidos</li>
                <li>• Produtos são mapeados automaticamente por código SKU (SKU-CZ100, SKU-CZ1L, etc.)</li>
                <li>• Licenciados são vinculados por nome/razão social</li>
                <li>• Status Bling (Em Aberto, Atendido, Cancelado…) são convertidos para o fluxo CarboHub</li>
                <li>• Re-executar atualiza apenas pedidos que mudaram de status</li>
              </ul>
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
