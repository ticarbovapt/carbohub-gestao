import React, { useState } from "react";
import { BoardLayout } from "@/components/layouts/BoardLayout";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Zap, Copy, Check, MessageSquare, Megaphone, Clock } from "lucide-react";
import { toast } from "sonner";

const SUPABASE_PROJECT_ID = "wpkfirmapxevzpxjovjr";
const BASE_URL = `https://${SUPABASE_PROJECT_ID}.supabase.co/functions/v1`;

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    toast.success("URL copiada!");
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <Button variant="outline" size="sm" onClick={handleCopy} className="h-9 px-3 flex-shrink-0">
      {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
    </Button>
  );
}

function useRecentWebhookLeads(source: string) {
  return useQuery({
    queryKey: ["webhook-leads", source],
    queryFn: async () => {
      const { data } = await supabase
        .from("crm_leads")
        .select("id, contact_name, contact_phone, city, state, created_at, source_meta")
        .eq("source", source)
        .order("created_at", { ascending: false })
        .limit(10);
      return data || [];
    },
  });
}

export default function WebhookConfig() {
  const chatwootUrl = `${BASE_URL}/crm-webhook-chatwoot`;
  const metaUrl = `${BASE_URL}/crm-webhook-meta`;

  const { data: chatwootLeads = [] } = useRecentWebhookLeads("ChatWoot / WhatsApp");
  const { data: metaLeads = [] } = useRecentWebhookLeads("Meta Ads");

  return (
    <BoardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <Zap className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">Webhooks — Entrada de Leads</h1>
            <p className="text-sm text-muted-foreground">
              Configure integrações para receber leads automaticamente no CRM
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {/* ChatWoot Card */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5 text-blue-500" />
                <CardTitle className="text-base">ChatWoot / WhatsApp</CardTitle>
                <Badge variant="secondary" className="text-xs">Funil F1 — B2C</Badge>
              </div>
              <CardDescription>
                Leads criados automaticamente quando uma nova conversa inicia no ChatWoot
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-1.5">URL do Webhook</p>
                <div className="flex gap-2">
                  <Input value={chatwootUrl} readOnly className="font-mono text-xs bg-muted" />
                  <CopyButton value={chatwootUrl} />
                </div>
              </div>

              <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-1.5">
                <p className="text-xs font-semibold text-foreground">Configuração no ChatWoot:</p>
                <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
                  <li>Acesse Settings → Integrations → Webhooks no ChatWoot</li>
                  <li>Adicione a URL acima como novo webhook</li>
                  <li>Selecione o evento: <code className="bg-muted rounded px-1">conversation_created</code></li>
                  <li>No Supabase Dashboard → Edge Functions → Secrets, defina <code className="bg-muted rounded px-1">CHATWOOT_WEBHOOK_SECRET</code></li>
                  <li>Use o mesmo valor no campo "Secret Token" do ChatWoot</li>
                </ol>
              </div>

              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" />
                  Últimos leads recebidos ({chatwootLeads.length})
                </p>
                {chatwootLeads.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">Nenhum lead via ChatWoot ainda.</p>
                ) : (
                  <div className="space-y-1.5">
                    {chatwootLeads.map((lead) => (
                      <div key={lead.id} className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2">
                        <div>
                          <p className="text-xs font-medium text-foreground">{lead.contact_name || "Sem nome"}</p>
                          <p className="text-[10px] text-muted-foreground">{lead.contact_phone} · {lead.city}, {lead.state}</p>
                        </div>
                        <p className="text-[10px] text-muted-foreground">
                          {new Date(lead.created_at).toLocaleDateString("pt-BR")}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Meta Ads Card */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Megaphone className="h-5 w-5 text-blue-700" />
                <CardTitle className="text-base">Meta Lead Ads</CardTitle>
                <Badge variant="secondary" className="text-xs">Funil F1 — B2C</Badge>
              </div>
              <CardDescription>
                Leads enviados automaticamente pelo Meta quando um formulário de anúncio é preenchido
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-1.5">URL do Webhook</p>
                <div className="flex gap-2">
                  <Input value={metaUrl} readOnly className="font-mono text-xs bg-muted" />
                  <CopyButton value={metaUrl} />
                </div>
              </div>

              <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-1.5">
                <p className="text-xs font-semibold text-foreground">Configuração no Meta Business:</p>
                <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
                  <li>No Meta Business Suite → Webhooks → Novo webhook</li>
                  <li>Endpoint URL: a URL acima</li>
                  <li>No Supabase Dashboard → Edge Functions → Secrets, defina <code className="bg-muted rounded px-1">META_VERIFY_TOKEN</code> com um token secreto</li>
                  <li>Use o mesmo valor no campo "Verify Token" do Meta</li>
                  <li>Assine o evento: <code className="bg-muted rounded px-1">leadgen</code></li>
                </ol>
              </div>

              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" />
                  Últimos leads recebidos ({metaLeads.length})
                </p>
                {metaLeads.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">Nenhum lead via Meta Ads ainda.</p>
                ) : (
                  <div className="space-y-1.5">
                    {metaLeads.map((lead) => (
                      <div key={lead.id} className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2">
                        <div>
                          <p className="text-xs font-medium text-foreground">{lead.contact_name || "Sem nome"}</p>
                          <p className="text-[10px] text-muted-foreground">{lead.contact_phone} · {lead.city}, {lead.state}</p>
                        </div>
                        <p className="text-[10px] text-muted-foreground">
                          {new Date(lead.created_at).toLocaleDateString("pt-BR")}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </BoardLayout>
  );
}
