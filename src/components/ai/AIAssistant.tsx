import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { 
  Sparkles, 
  AlertTriangle, 
  Clock, 
  TrendingUp, 
  ChevronRight,
  X 
} from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

interface AIInsight {
  id: string;
  type: "delay" | "pattern" | "suggestion" | "alert";
  title: string;
  message: string;
  severity: "info" | "warning" | "error";
  actionUrl?: string;
  actionLabel?: string;
  metadata?: Record<string, unknown>;
}

export function AIAssistant() {
  const [dismissedInsights, setDismissedInsights] = useState<string[]>([]);
  const navigate = useNavigate();

  const { data: insights, isLoading } = useQuery({
    queryKey: ["ai-insights"],
    queryFn: async () => {
      const insights: AIInsight[] = [];

      // Check for overdue OS
      const { data: overdueOS } = await supabase
        .from("service_orders")
        .select("id, os_number, title, due_date, current_department, started_at")
        .eq("status", "active")
        .lt("due_date", new Date().toISOString());

      if (overdueOS && overdueOS.length > 0) {
        overdueOS.forEach((os) => {
          insights.push({
            id: `overdue-${os.id}`,
            type: "delay",
            title: `OP ${os.os_number} atrasada`,
            message: `A ordem "${os.title}" está atrasada desde ${formatDistanceToNow(new Date(os.due_date!), { addSuffix: true, locale: ptBR })}.`,
            severity: "error",
            actionUrl: `/os/${os.id}`,
            actionLabel: "Ver OP",
            metadata: { osId: os.id, department: os.current_department },
          });
        });
      }

      // Check for long-running active OS (more than 24h in same stage)
      const oneDayAgo = new Date();
      oneDayAgo.setHours(oneDayAgo.getHours() - 24);

      const { data: stuckOS } = await supabase
        .from("service_orders")
        .select("id, os_number, title, current_department, updated_at")
        .eq("status", "active")
        .lt("updated_at", oneDayAgo.toISOString());

      if (stuckOS && stuckOS.length > 0) {
        insights.push({
          id: `stuck-pattern`,
          type: "pattern",
           title: `${stuckOS.length} OP parada(s) há mais de 24h`,
           message: `Existem ordens de produção que não foram atualizadas nas últimas 24 horas. Isso pode indicar um gargalo operacional.`,
          severity: "warning",
          actionUrl: "/os",
          actionLabel: "Ver todas",
        });
      }

      // Check for pending user approvals
      const { data: pendingUsers } = await supabase
        .from("profiles")
        .select("id")
        .eq("status", "pending");

      if (pendingUsers && pendingUsers.length > 0) {
        insights.push({
          id: "pending-approvals",
          type: "alert",
          title: `${pendingUsers.length} usuário(s) aguardando aprovação`,
          message: "Novos colaboradores estão esperando para acessar o sistema.",
          severity: "warning",
          actionUrl: "/admin/approval",
          actionLabel: "Aprovar",
        });
      }

      // Check for incomplete checklists
      const { data: incompleteChecklists } = await supabase
        .from("os_checklists")
        .select("id, department, created_at")
        .eq("is_completed", false)
        .lt("created_at", oneDayAgo.toISOString());

      if (incompleteChecklists && incompleteChecklists.length > 0) {
        insights.push({
          id: "old-checklists",
          type: "suggestion",
          title: `${incompleteChecklists.length} checklist(s) incompleto(s)`,
          message: "Alguns checklists foram iniciados há mais de 24h e ainda não foram finalizados.",
          severity: "info",
          actionUrl: "/checklist",
          actionLabel: "Ver checklists",
        });
      }

      // Suggest growth opportunity
      const { data: recentOS } = await supabase
        .from("service_orders")
        .select("id")
        .gte("created_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());

      if (recentOS && recentOS.length >= 5) {
        insights.push({
          id: "growth-opportunity",
          type: "suggestion",
          title: "Boa semana! 🚀",
          message: `${recentOS.length} novas OP criadas esta semana. Continue expandindo com novos licenciados!`,
          severity: "info",
          actionUrl: "/licensee/new",
          actionLabel: "Novo Licenciado",
        });
      }

      return insights;
    },
    refetchInterval: 60000, // Refresh every minute
  });

  const visibleInsights = insights?.filter(
    (insight) => !dismissedInsights.includes(insight.id)
  );

  const dismissInsight = (id: string) => {
    setDismissedInsights((prev) => [...prev, id]);
  };

  const getIcon = (type: AIInsight["type"]) => {
    switch (type) {
      case "delay":
        return <Clock className="h-5 w-5" />;
      case "pattern":
        return <TrendingUp className="h-5 w-5" />;
      case "alert":
        return <AlertTriangle className="h-5 w-5" />;
      case "suggestion":
        return <Sparkles className="h-5 w-5" />;
    }
  };

  const getSeverityStyles = (severity: AIInsight["severity"]) => {
    switch (severity) {
      case "error":
        return {
          bg: "bg-destructive/10",
          border: "border-destructive/30",
          icon: "text-destructive",
        };
      case "warning":
        return {
          bg: "bg-warning/10",
          border: "border-warning/30",
          icon: "text-warning",
        };
      case "info":
        return {
          bg: "bg-carbo-blue/10",
          border: "border-carbo-blue/30",
          icon: "text-carbo-blue",
        };
    }
  };

  if (isLoading || !visibleInsights || visibleInsights.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 mb-4">
        <div className="h-8 w-8 rounded-lg carbo-gradient flex items-center justify-center">
          <Sparkles className="h-4 w-4 text-white" />
        </div>
        <div>
          <h3 className="font-semibold text-foreground font-plex">Assistente IA</h3>
          <p className="text-xs text-muted-foreground">
            {visibleInsights.length} insight(s) para você
          </p>
        </div>
      </div>

      {visibleInsights.slice(0, 3).map((insight) => {
        const styles = getSeverityStyles(insight.severity);
        return (
          <Card
            key={insight.id}
            className={`${styles.bg} ${styles.border} border transition-all hover:shadow-md`}
          >
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <div className={`mt-0.5 ${styles.icon}`}>
                  {getIcon(insight.type)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <h4 className="font-medium text-sm text-foreground">
                      {insight.title}
                    </h4>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 -mt-1 -mr-2 hover:text-destructive"
                      onClick={() => dismissInsight(insight.id)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {insight.message}
                  </p>
                  {insight.actionUrl && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="mt-2 h-7 px-2 text-xs hover:text-carbo-green"
                      onClick={() => navigate(insight.actionUrl!)}
                    >
                      {insight.actionLabel || "Ver mais"}
                      <ChevronRight className="h-3 w-3 ml-1" />
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}

      {visibleInsights.length > 3 && (
        <Button variant="ghost" size="sm" className="w-full text-xs hover:text-carbo-green">
          Ver mais {visibleInsights.length - 3} insight(s)
        </Button>
      )}
    </div>
  );
}
