import { Link } from "react-router-dom";
import { BoardLayout } from "@/components/layouts/BoardLayout";
import { TrendingUp, BarChart3, PieChart, Activity, ArrowLeft, Home } from "lucide-react";

const Analytics = () => {
  return (
    <BoardLayout>
      <div className="space-y-6">
        {/* Back to home */}
        <Link
          to="/dashboard"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors group"
        >
          <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" />
          <Home className="h-4 w-4" />
          <span>Início OPS</span>
        </Link>

        <div>
          <h1 className="text-3xl font-semibold text-foreground">Analytics</h1>
          <p className="mt-1 text-muted-foreground">
            Análise detalhada de performance e métricas
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {[
            { icon: TrendingUp, title: "Tendências", value: "Em breve" },
            { icon: BarChart3, title: "Comparativos", value: "Em breve" },
            { icon: PieChart, title: "Distribuição", value: "Em breve" },
            { icon: Activity, title: "Atividade", value: "Em breve" },
          ].map((item, index) => (
            <div
              key={index}
              className="rounded-xl border border-border bg-card p-6"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <item.icon className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{item.title}</p>
                  <p className="text-lg font-semibold text-foreground">{item.value}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="rounded-xl border border-border bg-card p-12 text-center">
          <TrendingUp className="mx-auto h-12 w-12 text-muted-foreground" />
          <h3 className="mt-4 text-lg font-semibold text-foreground">
            Módulo de Analytics
          </h3>
          <p className="mt-2 text-muted-foreground">
            Gráficos e análises detalhadas serão exibidos aqui.
          </p>
        </div>
      </div>
    </BoardLayout>
  );
};

export default Analytics;
