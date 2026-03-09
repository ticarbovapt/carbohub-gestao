import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ClipboardCheck, Clock, CheckCircle2, ChevronRight, Sparkles, Trophy, Target } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Skeleton } from "@/components/ui/skeleton";
import { MicroInteraction } from "@/components/animations/MicroInteraction";

export function LegacyOperatorDashboard() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();

  // Fetch operator's assigned/department OS
  const { data: myOS, isLoading: osLoading } = useQuery({
    queryKey: ["my-os", user?.id, profile?.department],
    queryFn: async () => {
      if (!user || !profile?.department) return [];
      
      const { data, error } = await supabase
        .from("service_orders")
        .select(`
          *,
          customer:customers(name, company)
        `)
        .or(`assigned_to.eq.${user.id},current_department.eq.${profile.department}`)
        .in("status", ["active", "paused"])
        .order("priority", { ascending: false })
        .limit(5);

      if (error) throw error;
      return data;
    },
    enabled: !!user && !!profile?.department,
  });

  // Fetch recent checklists by this operator
  const { data: myChecklists, isLoading: checklistsLoading } = useQuery({
    queryKey: ["my-checklists", user?.id],
    queryFn: async () => {
      if (!user) return { completed: 0, pending: 0, recent: [] };
      
      const { data, error } = await supabase
        .from("os_checklists")
        .select("*")
        .eq("completed_by", user.id)
        .order("completed_at", { ascending: false })
        .limit(5);

      if (error) throw error;

      const completed = data?.filter((c) => c.is_completed).length || 0;
      const pending = data?.filter((c) => !c.is_completed).length || 0;

      return { completed, pending, recent: data || [] };
    },
    enabled: !!user,
  });

  const engagementScore = myChecklists ? 
    Math.round((myChecklists.completed / Math.max(myChecklists.completed + myChecklists.pending, 1)) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Welcome Header */}
      <MicroInteraction type="slide-up">
        <div className="carbo-gradient-soft rounded-2xl p-6 border border-carbo-green/20">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold text-foreground mb-1 font-plex">
                Olá, {profile?.full_name?.split(" ")[0] || "Operador"} 👋
              </h1>
              <p className="text-muted-foreground">
                Aqui está o resumo das suas atividades
              </p>
            </div>
            {engagementScore >= 80 && (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-success/10 text-success">
                <Trophy className="h-4 w-4" />
                <span className="text-sm font-medium">Excelente!</span>
              </div>
            )}
          </div>
          
          {/* Motivational message */}
          <div className="mt-4 text-sm text-muted-foreground italic">
            "Você faz parte de algo maior. Seu trabalho movimenta tudo." 💪
          </div>
        </div>
      </MicroInteraction>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MicroInteraction type="pop" delay={50}>
          <Card className="border-l-4 border-l-success kpi-glow">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-success/10 flex items-center justify-center">
                  <CheckCircle2 className="h-5 w-5 text-success" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground kpi-number">
                    {checklistsLoading ? <Skeleton className="h-8 w-12" /> : myChecklists?.completed || 0}
                  </p>
                  <p className="text-xs text-muted-foreground">Concluídos</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </MicroInteraction>

        <MicroInteraction type="pop" delay={100}>
          <Card className="border-l-4 border-l-warning kpi-glow">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-warning/10 flex items-center justify-center">
                  <Clock className="h-5 w-5 text-warning" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground kpi-number">
                    {checklistsLoading ? <Skeleton className="h-8 w-12" /> : myChecklists?.pending || 0}
                  </p>
                  <p className="text-xs text-muted-foreground">Pendentes</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </MicroInteraction>

        <MicroInteraction type="pop" delay={150}>
          <Card className="border-l-4 border-l-carbo-blue kpi-glow">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-carbo-blue/10 flex items-center justify-center">
                  <ClipboardCheck className="h-5 w-5 text-carbo-blue" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground kpi-number">
                    {osLoading ? <Skeleton className="h-8 w-12" /> : myOS?.length || 0}
                  </p>
                  <p className="text-xs text-muted-foreground">Minhas OP</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </MicroInteraction>

        <MicroInteraction type="pop" delay={200}>
          <Card className="border-l-4 border-l-carbo-green kpi-glow">
            <CardContent className="p-4">
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Target className="h-4 w-4 text-carbo-green" />
                    <span className="text-xs text-muted-foreground">Engajamento</span>
                  </div>
                  <span className="text-lg font-bold text-foreground kpi-number">{engagementScore}%</span>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div 
                    className="h-full progress-gradient transition-all duration-500"
                    style={{ width: `${engagementScore}%` }}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </MicroInteraction>
      </div>

      {/* My OS List */}
      <Card className="shadow-board-lg">
        <CardHeader className="flex flex-row items-center justify-between pb-4">
          <CardTitle className="text-lg font-plex">Minhas Ordens de Produção</CardTitle>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => navigate("/os")}
            className="hover:text-carbo-green"
          >
            Ver todas <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </CardHeader>
        <CardContent>
          {osLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 w-full rounded-xl" />
              ))}
            </div>
          ) : myOS && myOS.length > 0 ? (
            <div className="space-y-3">
              {myOS.map((os) => (
                <div
                  key={os.id}
                  onClick={() => navigate(`/os/${os.id}`)}
                  className="flex items-center justify-between p-4 rounded-xl border bg-card hover:bg-secondary/50 cursor-pointer transition-all hover:border-carbo-green/30 hover:shadow-sm group"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="outline" className="text-xs font-mono">
                        {os.os_number}
                      </Badge>
                      {os.priority >= 4 && (
                        <Badge variant="destructive" className="text-xs">
                          Urgente
                        </Badge>
                      )}
                    </div>
                    <p className="font-medium text-sm truncate group-hover:text-carbo-green transition-colors">{os.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {os.customer?.name || "Sem cliente"}
                    </p>
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground flex-shrink-0 group-hover:text-carbo-green group-hover:translate-x-1 transition-all" />
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <ClipboardCheck className="h-12 w-12 text-muted-foreground mx-auto mb-3 opacity-50" />
              <p className="text-sm text-muted-foreground">Nenhuma OP atribuída</p>
              <p className="text-xs text-muted-foreground mt-1">
                Novos trabalhos aparecerão aqui 🎯
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quick Action - Big CTA */}
      <MicroInteraction type="slide-up" delay={300}>
        <Button
          size="lg"
          className="w-full h-16 text-lg font-semibold carbo-gradient text-white shadow-carbo hover:opacity-90 ops-press animate-glow"
          onClick={() => navigate("/checklist")}
        >
          <Sparkles className="h-6 w-6 mr-3" />
          Começar Checklist
        </Button>
      </MicroInteraction>
    </div>
  );
}
