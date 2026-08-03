import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Link2, Unlink, RefreshCw, Loader2, CheckCircle, XCircle, Clock, ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";

// ═══════════════════════════════════════════════════════════════════════════
// Bling 2 — segunda conta, espelho isolado
//
// Tela irmã da de /integracoes/bling, com UMA diferença de fundo: aqui não
// existe o botão "Importar Pedidos → CarboHub". Bling 2 não vira venda, não
// entra no faturamento e não casa NF com pedido — é leitura. Se um dia alguma
// coisa daqui tiver de alimentar tela existente, será um passo explícito.
// ═══════════════════════════════════════════════════════════════════════════

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

// Ordem e rótulos das entidades. A ordem espelha a do `bling2-sync`, que é a
// ordem de dependência (variações/estoque precisam de produtos, contas
// resolvem nome em contatos).
const ENTIDADES: { key: string; label: string; tabela: string }[] = [
  { key: "products",       label: "Produtos",           tabela: "bling2_products" },
  { key: "variacoes",      label: "Variações",          tabela: "bling2_product_variations" },
  { key: "contacts",       label: "Contatos",           tabela: "bling2_contacts" },
  { key: "vendedores",     label: "Vendedores",         tabela: "bling2_vendedores" },
  { key: "orders",         label: "Pedidos de venda",   tabela: "bling2_orders" },
  { key: "nfe",            label: "Notas fiscais",      tabela: "bling2_nfe" },
  { key: "contas_pagar",   label: "Contas a pagar",     tabela: "bling2_contas_pagar" },
  { key: "contas_receber", label: "Contas a receber",   tabela: "bling2_contas_receber" },
  { key: "pedidos_compra", label: "Pedidos de compra",  tabela: "bling2_pedidos_compra" },
];

export default function Bling2Integracao() {
  const { gestor } = useAuth();
  const [conectado, setConectado] = useState(false);
  const [expirado, setExpirado] = useState(false);
  const [apelido, setApelido] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [sincronizando, setSincronizando] = useState<string | null>(null);
  const [logs, setLogs] = useState<SyncLog[]>([]);
  const [contagens, setContagens] = useState<Record<string, number>>({});

  const verificarStatus = useCallback(async () => {
    try {
      // Lê a tabela direto (sem token): a página só precisa saber se está
      // ativo e até quando. Token nenhum passa pelo navegador.
      const { data, error } = await (supabase as any)
        .from("bling2_integration")
        .select("apelido, expires_at, is_active")
        .eq("is_active", true)
        .order("connected_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      setConectado(!!data);
      setApelido(data?.apelido ?? null);
      setExpirado(data?.expires_at ? new Date(data.expires_at) < new Date() : false);
    } catch (e) {
      console.error("[bling2] status falhou:", e);
      setConectado(false);
    } finally {
      setCarregando(false);
    }
  }, []);

  const carregarLogs = useCallback(async () => {
    // Uma linha por entidade — a mais recente. Log cru afoga a tela: cada
    // "Sincronizar tudo" grava 11 linhas e o cron roda de hora em hora.
    const { data } = await (supabase as any)
      .from("bling2_sync_log")
      .select("*")
      .order("started_at", { ascending: false })
      .limit(200);
    if (!data) return;
    const ultimoPorTipo = new Map<string, SyncLog>();
    for (const row of data as SyncLog[]) {
      if (!ultimoPorTipo.has(row.entity_type)) ultimoPorTipo.set(row.entity_type, row);
    }
    setLogs(Array.from(ultimoPorTipo.values()));
  }, []);

  const carregarContagens = useCallback(async () => {
    const resultados = await Promise.all(
      ENTIDADES.map((e) =>
        (supabase as any).from(e.tabela).select("id", { count: "exact", head: true })
      )
    );
    const mapa: Record<string, number> = {};
    ENTIDADES.forEach((e, i) => { mapa[e.key] = resultados[i]?.count || 0; });
    setContagens(mapa);
  }, []);

  useEffect(() => {
    verificarStatus();
    carregarLogs();
    carregarContagens();
  }, [verificarStatus, carregarLogs, carregarContagens]);

  const conectar = async () => {
    if (!gestor) { toast.error("Só gestor pode conectar uma integração."); return; }
    try {
      const resp = await supabase.functions.invoke("bling2-auth", { body: { action: "authorize" } });
      if (resp.error) throw new Error(resp.error.message);
      if (!resp.data?.success) throw new Error(resp.data?.error || "Erro ao gerar a URL");
      window.location.href = resp.data.data.authUrl;
    } catch (e: any) {
      toast.error(e.message || "Erro ao conectar");
    }
  };

  const desconectar = async () => {
    if (!gestor) { toast.error("Só gestor pode desconectar."); return; }
    // Diferente do Bling 1, desconectar aqui NÃO afeta o resto do ecossistema
    // — e a mensagem diz isso, para ninguém hesitar achando que vai derrubar
    // a integração que está no ar.
    if (!window.confirm(
      "Desconectar o Bling 2? Isto NÃO afeta a integração Bling principal — só esta segunda conta. Os dados já sincronizados continuam no sistema."
    )) return;
    try {
      const resp = await supabase.functions.invoke("bling2-auth", { body: { action: "disconnect" } });
      if (!resp.data?.success) throw new Error(resp.data?.error || "Erro ao desconectar");
      setConectado(false);
      setExpirado(false);
      toast.success("Bling 2 desconectado.");
    } catch (e: any) {
      toast.error(e.message || "Erro ao desconectar");
    }
  };

  const renovar = async () => {
    try {
      const resp = await supabase.functions.invoke("bling2-auth", { body: { action: "refresh" } });
      if (!resp.data?.success) throw new Error(resp.data?.error || "Erro ao renovar");
      setExpirado(false);
      toast.success("Token do Bling 2 renovado.");
    } catch (e: any) {
      toast.error(e.message || "Erro ao renovar o token");
    }
  };

  const sincronizar = async (entity: string, rotulo: string) => {
    setSincronizando(entity);
    try {
      const resp = await supabase.functions.invoke("bling2-sync", { body: { entity } });
      if (!resp.data?.success) {
        throw new Error(resp.data?.error || resp.error?.message || "Erro na sincronização");
      }
      const r = (resp.data.data || {})[entity] || {};
      if (r.error) throw new Error(r.error);
      toast.success(`${rotulo}: ${r.synced ?? 0} registros${r.failed ? `, ${r.failed} falhas` : ""}.`);
      carregarContagens();
      carregarLogs();
    } catch (e: any) {
      toast.error(e.message || "Erro na sincronização");
    } finally {
      setSincronizando(null);
    }
  };

  const sincronizarTudo = async () => {
    setSincronizando("all");
    try {
      const resp = await supabase.functions.invoke("bling2-sync", { body: { entity: "all" } });
      if (!resp.data?.success) {
        throw new Error(resp.data?.error || resp.error?.message || "Erro na sincronização");
      }
      const data = (resp.data.data || {}) as Record<string, { synced?: number; failed?: number; error?: string }>;
      let total = 0;
      const comFalha: string[] = [];
      for (const [entidade, r] of Object.entries(data)) {
        if (r?.error) comFalha.push(entidade);
        else total += r?.synced || 0;
      }
      carregarContagens();
      carregarLogs();
      if (comFalha.length) {
        toast.error(`${total} registros sincronizados. Falharam: ${comFalha.join(", ")} — veja o histórico.`);
      } else {
        toast.success(`Sincronização completa: ${total} registros.`);
      }
    } catch (e: any) {
      toast.error(e.message || "Erro na sincronização");
    } finally {
      setSincronizando(null);
    }
  };

  if (carregando) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-3">
          <Link2 className="h-6 w-6 text-sky-500" />
          Integração Bling 2
        </h1>
        <p className="text-muted-foreground mt-1">
          Segunda conta Bling, sincronizada por completo e em base própria — produtos,
          variações, estoque, contatos, vendedores, pedidos, notas fiscais, contas a
          pagar e a receber e pedidos de compra.
        </p>
      </div>

      {/* O aviso de isolamento fica no topo, não no rodapé: é a pergunta que
          qualquer um faz ao ver duas integrações Bling lado a lado. */}
      <Card className="border-sky-200 dark:border-sky-900/40 bg-sky-50/50 dark:bg-sky-950/10">
        <CardContent className="p-4 flex gap-3">
          <ShieldCheck className="h-5 w-5 text-sky-600 shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-medium text-sky-700 dark:text-sky-400">
              Esta integração não cruza com a Bling principal
            </p>
            <p className="text-muted-foreground text-xs mt-1">
              Tudo daqui fica em tabelas próprias (<code>bling2_*</code>). Nada vira
              pedido no sistema, nada entra no faturamento e nenhuma nota é vinculada a
              pedido. Conectar, sincronizar ou desconectar aqui não altera em nada a
              integração Bling que já está no ar.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-sky-500 to-blue-600 flex items-center justify-center text-white font-bold text-lg">
                B2
              </div>
              <div>
                <CardTitle>{apelido || "Bling — segunda conta"}</CardTitle>
                <CardDescription>API v3 · OAuth2 · credenciais próprias</CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {conectado ? (
                <>
                  <Badge variant={expirado ? "destructive" : "default"} className={!expirado ? "bg-green-500" : ""}>
                    {expirado ? "Token expirado" : "Conectado"}
                  </Badge>
                  {expirado && (
                    <Button size="sm" variant="outline" onClick={renovar}>
                      <RefreshCw className="h-4 w-4 mr-1" /> Renovar
                    </Button>
                  )}
                  <Button size="sm" variant="destructive" onClick={desconectar}>
                    <Unlink className="h-4 w-4 mr-1" /> Desconectar
                  </Button>
                </>
              ) : (
                <Button onClick={conectar} className="bg-sky-600 hover:bg-sky-700 text-white">
                  <Link2 className="h-4 w-4 mr-2" /> Conectar ao Bling 2
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
      </Card>

      {conectado && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {ENTIDADES.map((e) => (
              <Card key={e.key}>
                <CardContent className="pt-6">
                  <div className="mb-4">
                    <p className="font-semibold text-sm">{e.label}</p>
                    <p className="text-2xl font-bold">{contagens[e.key] ?? 0}</p>
                  </div>
                  <Button
                    className="w-full"
                    variant="outline"
                    size="sm"
                    disabled={!!sincronizando}
                    onClick={() => sincronizar(e.key, e.label)}
                  >
                    {sincronizando === e.key ? (
                      <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Sincronizando...</>
                    ) : (
                      <><RefreshCw className="h-4 w-4 mr-2" /> Sincronizar</>
                    )}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="flex flex-col sm:flex-row gap-3 justify-center items-center">
            <Button
              size="lg"
              disabled={!!sincronizando}
              onClick={sincronizarTudo}
              className="bg-gradient-to-r from-sky-600 to-blue-600 text-white"
            >
              {sincronizando === "all" ? (
                <><Loader2 className="h-5 w-5 mr-2 animate-spin" /> Sincronizando tudo...</>
              ) : (
                <><RefreshCw className="h-5 w-5 mr-2" /> Sincronizar tudo</>
              )}
            </Button>
            <Button
              size="lg"
              variant="outline"
              disabled={!!sincronizando}
              onClick={() => sincronizar("order_details", "Itens dos pedidos")}
            >
              {sincronizando === "order_details" ? (
                <><Loader2 className="h-5 w-5 mr-2 animate-spin" /> Buscando itens...</>
              ) : (
                <>Buscar itens dos pedidos</>
              )}
            </Button>
          </div>
          {/* Explica o botão separado: itens são 1 chamada por pedido e a
              primeira carga não cabe numa execução só. */}
          <p className="text-xs text-muted-foreground text-center -mt-3">
            Os itens de cada pedido são buscados um a um (200 por execução) — repita
            até a contagem parar de subir.
          </p>

          {logs.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Histórico de sincronização</CardTitle>
                <CardDescription>Estado mais recente de cada entidade.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {logs.map((log) => (
                    <div key={log.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50 gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        {log.status === "completed" && <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />}
                        {log.status === "failed" && <XCircle className="h-4 w-4 text-red-500 shrink-0" />}
                        {log.status === "running" && <Loader2 className="h-4 w-4 animate-spin text-blue-500 shrink-0" />}
                        <div className="min-w-0">
                          <span className="font-medium capitalize">{log.entity_type.replace(/_/g, " ")}</span>
                          {log.records_synced > 0 && (
                            <span className="text-sm text-muted-foreground ml-2">
                              {log.records_synced} registros
                            </span>
                          )}
                          {log.records_failed > 0 && (
                            <span className="text-sm text-amber-600 ml-2">
                              {log.records_failed} falhas
                            </span>
                          )}
                          {log.error_message && (
                            <p className="text-xs text-red-500 break-words">{log.error_message}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground shrink-0">
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
  );
}
