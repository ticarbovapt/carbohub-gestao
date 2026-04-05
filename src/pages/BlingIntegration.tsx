import { useState, useEffect } from "react";
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
      const response = await supabase.functions.invoke("bling-auth", {
        body: { action: "status" },
      });
      if (response.data?.success) {
        setIsConnected(response.data.data.connected);
        setIsExpired(response.data.data.expired);
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
      await supabase.functions.invoke("bling-auth", {
        body: { action: "disconnect" },
      });
      setIsConnected(false);
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

  const handleSync = async (entity: string) => {
    setSyncing(entity);
    try {
      const response = await supabase.functions.invoke("bling-sync", {
        body: { entity },
      });

      if (response.data?.success) {
        const results = response.data.data;
        const totalSynced = Object.values(results).reduce(
          (sum: number, r: any) => sum + (r.synced || 0),
          0
        );
        toast.success(`Sincronização concluída! ${totalSynced} registros atualizados.`);
        loadSyncLogs();
        loadCounts();
      } else {
        toast.error(response.data?.error || "Erro na sincronização");
      }
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
              onClick={() => handleSync("all")}
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
              onClick={() => handleSync("bridge")}
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
