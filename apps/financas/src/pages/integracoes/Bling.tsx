import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
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
import { confirmar } from "@carbo/shell";

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
  triggered_by: string | null;
}

export default function BlingIntegration() {
  const { gestor } = useAuth();
  const [isConnected, setIsConnected] = useState(false);
  const [isExpired, setIsExpired] = useState(false);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [syncLogs, setSyncLogs] = useState<SyncLog[]>([]);
  const [counts, setCounts] = useState({ products: 0, contacts: 0, orders: 0 });

  // Status vem DIRETO da tabela compartilhada bling_integration (mesma do
  // Controle). Assim a conexão que o Controle já fez aparece aqui sem depender
  // da edge function autenticada. Não lemos tokens — só is_active/expires_at.
  const checkStatus = async () => {
    try {
      const { data, error } = await (supabase as any)
        .from("bling_integration")
        .select("expires_at, is_active")
        .eq("is_active", true)
        .maybeSingle();
      if (error) throw error;
      if (data) {
        setIsConnected(true);
        setIsExpired(data.expires_at ? new Date(data.expires_at) < new Date() : false);
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
    // Tela de STATUS, não de log cru: mostra UMA linha por tipo de sincronização,
    // com o estado mais recente de cada uma. Assim nada some (todas as entidades
    // aparecem) e não há repetição (cada "Sincronizar Tudo"/cron gravava uma
    // linha por entidade + o NF-e roda de hora em hora, o que afogava a lista).
    // Buscamos um lote recente e reduzimos para a última execução de cada tipo.
    const { data } = await supabase
      .from("bling_sync_log")
      .select("*")
      .order("started_at", { ascending: false })
      .limit(200);
    if (!data) return;
    const latestByType = new Map<string, SyncLog>();
    for (const row of data as SyncLog[]) {
      if (!latestByType.has(row.entity_type)) latestByType.set(row.entity_type, row);
    }
    // Já vem em ordem decrescente de started_at (primeiro visto = mais recente).
    setSyncLogs(Array.from(latestByType.values()));
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
    if (!gestor) { toast.error("Só gestor pode desconectar o Bling."); return; }
    // A integração Bling é COMPARTILHADA com o Controle e demais apps —
    // desconectar aqui afeta TODOS. Confirma e desativa (reversível), sem apagar.
    if (!(await confirmar({
      titulo: "Desconectar o Bling?",
      mensagem: "Isto desconecta o Bling de TODO o ecossistema (Controle, Ops, etc.), não só do Finanças.",
      confirmar: "Desconectar", perigo: true,
    }))) return;
    try {
      const { error } = await (supabase as any)
        .from("bling_integration")
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq("is_active", true);
      if (error) throw error;
      setIsConnected(false);
      setIsExpired(false);
      toast.success("Bling desativado (reconecte quando quiser).");
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

  // ⚠️ A importação dos pedidos para o CarboHub roda no SERVIDOR (`bling-sync`,
  // entidade `bridge`) — a mesma que o cron usa. Esta tela fazia uma segunda
  // cópia dela no navegador, que lia `bling_orders` sem paginar (cortava em
  // 1.000, calado) e regravava o status dos pedidos sem saber das lojas que
  // faturam na plataforma (ML Full): uma volta a `confirmed` dispara OP e
  // estoque de PDV. Duas pontes divergiam; agora há uma.
  const handleBridge = useCallback(async () => {
    setSyncing("bridge");
    try {
      const response = await supabase.functions.invoke("bling-sync", { body: { entity: "bridge" } });
      if (!response.data?.success) {
        throw new Error(response.data?.error || response.error?.message || "Erro na importação de pedidos");
      }
      const r = response.data.data?.bridge ?? {};
      toast.success(`Importação concluída: ${r.synced ?? 0} pedido(s) processado(s)${r.failed ? `, ${r.failed} com falha` : ""}.`);
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

  // "Sincronizar Tudo" — puxa TODAS as entidades possíveis do Bling de uma vez
  // (produtos, variações, estoque, contatos, pedidos, detalhes, vendedores,
  // NFe, contas a pagar e pedidos de compra). Cada uma vira tabela bling_* no
  // banco; a visualização fica a cargo das telas do app.
  const handleSyncAll = useCallback(async () => {
    setSyncing("all");
    try {
      const response = await supabase.functions.invoke("bling-sync", { body: { entity: "all" } });
      if (!response.data?.success) {
        throw new Error(response.data?.error || response.error?.message || "Erro na sincronização");
      }
      const data = (response.data.data || {}) as Record<string, { synced?: number; failed?: number; error?: string }>;
      let totalSynced = 0;
      const failed: string[] = [];
      for (const [entity, res] of Object.entries(data)) {
        if (res?.error) failed.push(entity);
        else totalSynced += res?.synced || 0;
      }
      loadCounts();
      loadSyncLogs();
      if (failed.length) {
        toast.error(`Sincronizado ${totalSynced} registros. Entidades com falha: ${failed.join(", ")} (veja o histórico).`);
      } else {
        toast.success(`Sincronização completa! ${totalSynced} registros de todas as entidades do Bling.`);
      }
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
    <div>
    <div className="space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-3">
          <Link2 className="h-6 w-6 text-green-500" />
          Integração Bling ERP
        </h1>
        <p className="text-muted-foreground mt-1">
          Sincronize tudo do Bling: pedidos, produtos, variações, estoque, clientes,
          fornecedores, vendedores, notas fiscais, contas a pagar e pedidos de compra
        </p>
      </div>

      {/* Connection Status */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 shrink-0 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center text-white font-bold text-lg">
                B
              </div>
              <div>
                <CardTitle>Bling ERP</CardTitle>
                <CardDescription>API v3 - OAuth2</CardDescription>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
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
          <div className="flex flex-col sm:flex-row sm:flex-wrap gap-3 justify-center items-center">
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
                <p className="text-xs text-muted-foreground mb-3">
                  Estado mais recente de cada sincronização com o Bling.
                </p>
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
    </div>
  );
}
