import { Link } from "react-router-dom";
import { useAIRecommendations, type AIRecommendation } from "@/hooks/useAIRecommendations";
import { CarboCard, CarboCardContent, CarboCardHeader, CarboCardTitle } from "@/components/ui/carbo-card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Sparkles,
  Zap,
  Truck,
  Coins,
  Lightbulb,
  ArrowRight,
  AlertTriangle,
  TrendingUp,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface AIRecommendationsCardProps {
  licenseeId: string | undefined;
}

const RECOMMENDATION_ICONS: Record<AIRecommendation["type"], React.ReactNode> = {
  vapt: <Zap className="h-5 w-5 text-amber-500" />,
  ze: <Truck className="h-5 w-5 text-blue-500" />,
  credits: <Coins className="h-5 w-5 text-green-500" />,
  general: <Lightbulb className="h-5 w-5 text-purple-500" />,
};

const PRIORITY_STYLES: Record<AIRecommendation["priority"], { bg: string; border: string; badge: string }> = {
  high: {
    bg: "bg-destructive/5",
    border: "border-l-4 border-l-destructive",
    badge: "bg-destructive/10 text-destructive",
  },
  medium: {
    bg: "bg-amber-500/5",
    border: "border-l-4 border-l-amber-500",
    badge: "bg-amber-500/10 text-amber-600",
  },
  low: {
    bg: "bg-muted/50",
    border: "border-l-4 border-l-muted-foreground/30",
    badge: "bg-muted text-muted-foreground",
  },
};

const ACTION_ROUTES: Record<string, string> = {
  "Solicitar CarboVAPT": "/portal/vapt",
  "Conhecer CarboVAPT": "/portal/vapt",
  "Pedir insumos": "/portal/ze",
  "Pedir CarboZé": "/portal/ze",
  "Comprar créditos": "/portal/creditos",
  "Ver planos": "/portal",
};

export function AIRecommendationsCard({ licenseeId }: AIRecommendationsCardProps) {
  const { data, isLoading, refetch, isFetching } = useAIRecommendations(licenseeId);

  if (isLoading) {
    return (
      <CarboCard>
        <CarboCardHeader>
          <CarboCardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-purple-500" />
            Recomendações
          </CarboCardTitle>
        </CarboCardHeader>
        <CarboCardContent className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex gap-3">
              <Skeleton className="h-10 w-10 rounded-lg" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-full" />
              </div>
            </div>
          ))}
        </CarboCardContent>
      </CarboCard>
    );
  }

  const recommendations = data?.recommendations || [];
  const isAIPowered = data?.source === "ai";

  if (recommendations.length === 0) {
    return (
      <CarboCard>
        <CarboCardHeader>
          <CarboCardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-purple-500" />
            Recomendações
          </CarboCardTitle>
        </CarboCardHeader>
        <CarboCardContent>
          <div className="text-center py-6">
            <TrendingUp className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">Tudo em ordem!</p>
            <p className="text-sm text-muted-foreground mt-1">
              Continue usando a plataforma para receber sugestões personalizadas.
            </p>
          </div>
        </CarboCardContent>
      </CarboCard>
    );
  }

  return (
    <CarboCard>
      <CarboCardHeader className="flex flex-row items-center justify-between">
        <CarboCardTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-purple-500" />
          Recomendações
          {isAIPowered && (
            <Badge variant="secondary" className="text-xs font-normal">
              <Sparkles className="h-3 w-3 mr-1" />
              IA
            </Badge>
          )}
        </CarboCardTitle>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => refetch()}
          disabled={isFetching}
          className="h-8 w-8"
        >
          <RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin")} />
        </Button>
      </CarboCardHeader>
      <CarboCardContent className="space-y-3">
        {recommendations.map((rec, index) => {
          const styles = PRIORITY_STYLES[rec.priority];
          const route = rec.actionLabel ? ACTION_ROUTES[rec.actionLabel] : undefined;

          return (
            <div
              key={index}
              className={cn(
                "p-4 rounded-lg transition-colors",
                styles.bg,
                styles.border
              )}
            >
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-lg bg-background flex items-center justify-center shrink-0">
                  {RECOMMENDATION_ICONS[rec.type]}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="font-medium text-sm">{rec.title}</h4>
                    {rec.priority === "high" && (
                      <AlertTriangle className="h-4 w-4 text-destructive" />
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">{rec.description}</p>
                  {rec.actionLabel && (
                    <div className="mt-3">
                      {route ? (
                        <Button size="sm" variant="outline" asChild>
                          <Link to={route}>
                            {rec.actionLabel}
                            <ArrowRight className="h-3 w-3 ml-1" />
                          </Link>
                        </Button>
                      ) : (
                        <Button size="sm" variant="outline">
                          {rec.actionLabel}
                          <ArrowRight className="h-3 w-3 ml-1" />
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </CarboCardContent>
    </CarboCard>
  );
}
