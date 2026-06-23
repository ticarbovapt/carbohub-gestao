import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Link2, Unlink, RefreshCw, Package, Users, ShoppingCart, Loader2, CheckCircle, XCircle, Clock,
} from "lucide-react";
import { toast } from "sonner";

// ─────────────────────────────────────────────────────────────────────────────
// Integração Bling — portada do controle (que será desativado). Consome as
// tabelas bling_* e as edge functions bling-auth/bling-sync do MESMO projeto
// Supabase. NÃO inclui o "bridge → carboze_orders" (comercial), que não é do Ops.
// ─────────────────────────────────────────────────────────────────────────────

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

export default function BlingIntegracao() {
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
      const response: any = await Promise.race([
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
    const { data } = await (supabase as any)
      .from("bling_sync_log")
      .select("*")
      .order("started_at", { ascending: false })
      .limit(10);
    if (data) setSyncLogs(data as SyncLog[]);
  };

  const loadCounts = async () => {
    const [products, contacts, orders] = await Promise.all([
      (supabase as any).from("bling_products").select("id", { count: "exact", head: true }),
      (supabase as any).from("bling_contacts").select("id", { count: "exact", head: true }),
      (supabase as any).from("bling_orders").select("id", { count: "exact", head: true }),
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
      const response: any = await supabase.functions.invoke("bling-auth", { body: { action: "authorize" } });
      if (response.error) {
        toast.error(`Erro: ${response.error.message || JSON.stringify(response.error)}`);
        return;
      }
      if (response.data?.success) {
        window.location.href = response.data.data.authUrl;
      } else {
        toast.error(response.data?.error || "Erro desconhecido ao gerar URL");
      }
    } catch (error: any) {
      toast.error(error.message || "Erro ao conectar");
    }
  };

  const handleDisconnect = async () => {
    try {
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
      const response: any = await supabase.functions.invoke("bling-auth", { body: { action: "refresh" } });
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

  const syncEntity = async (entity: "products" | "contacts" | "orders"): Promise<number> => {
    const response: any = await supabase.functions.invoke("bling-sync", { body: { entity } });
    if (response.data?.success) {
      return (response.data.data[entity]?.synced || 0);
    }
    throw new Error(response.data?.error || `Erro ao sincronizar ${entity}`);
  };

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

  return (
    <div className="p-4 md:p-6">
      <div className="space-y-6 max-w-5xl mx-auto">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-3">
            <Link2 className="h-6 w-6 text-green-500" />
            Integração Bling ERP
          </h1>
          <p className="text-muted-foreground mt-1">Sincronize pedidos, produtos e contatos</p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center min-h-[300px]">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {/* Status da conexão */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center text-white font-bold text-lg">B</div>
                    <div>
                      <CardTitle>Bling ERP</CardTitle>
                      <CardDescription>API v3 · OAuth2</CardDescription>
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

            {!isConnected && (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  <p>Bling não conectado. Clique em <strong>Conectar ao Bling</strong> para autorizar.</p>
                </CardContent>
              </Card>
            )}

            {isConnected && (
              <>
                {/* Cards de sincronização */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {([
                    { key: "products", label: "Produtos", value: counts.products, icon: Package, color: "text-blue-500" },
                    { key: "contacts", label: "Contatos", value: counts.contacts, icon: Users, color: "text-purple-500" },
                    { key: "orders", label: "Pedidos", value: counts.orders, icon: ShoppingCart, color: "text-orange-500" },
                  ] as const).map((c) => (
                    <Card key={c.key}>
                      <CardContent className="pt-6">
                        <div className="flex items-center gap-3 mb-4">
                          <c.icon className={`h-8 w-8 ${c.color}`} />
                          <div>
                            <p className="font-semibold">{c.label}</p>
                            <p className="text-2xl font-bold">{c.value}</p>
                          </div>
                        </div>
                        <Button className="w-full" variant="outline" disabled={!!syncing} onClick={() => handleSync(c.key)}>
                          {syncing === c.key ? (
                            <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Sincronizando...</>
                          ) : (
                            <><RefreshCw className="h-4 w-4 mr-2" /> Sincronizar</>
                          )}
                        </Button>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                {/* Sincronizar tudo */}
                <div className="flex justify-center">
                  <Button size="lg" disabled={!!syncing} onClick={handleSyncAll}
                    className="bg-gradient-to-r from-green-600 to-emerald-600 text-white">
                    {syncing === "all" ? (
                      <><Loader2 className="h-5 w-5 mr-2 animate-spin" /> Sincronizando tudo...</>
                    ) : (
                      <><RefreshCw className="h-5 w-5 mr-2" /> Sincronizar Tudo</>
                    )}
                  </Button>
                </div>

                {/* Histórico */}
                {syncLogs.length > 0 && (
                  <Card>
                    <CardHeader><CardTitle className="text-lg">Histórico de Sincronização</CardTitle></CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {syncLogs.map((log) => (
                          <div key={log.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                            <div className="flex items-center gap-3">
                              {log.status === "completed" && <CheckCircle className="h-4 w-4 text-green-500" />}
                              {log.status === "failed" && <XCircle className="h-4 w-4 text-red-500" />}
                              {log.status === "running" && <Loader2 className="h-4 w-4 animate-spin text-blue-500" />}
                              <div>
                                <span className="font-medium capitalize">{log.entity_type}</span>
                                {log.records_synced > 0 && <span className="text-sm text-muted-foreground ml-2">{log.records_synced} registros</span>}
                                {log.error_message && <p className="text-xs text-red-500">{log.error_message}</p>}
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
          </>
        )}
      </div>
    </div>
  );
}
