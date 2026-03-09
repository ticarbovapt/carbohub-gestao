import { ReactNode } from "react";
import { useDepartment } from "@/contexts/DepartmentContext";
import { OpsLayout } from "@/components/layouts/OpsLayout";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface DepartmentGateProps {
  children: ReactNode;
}

export function DepartmentGate({ children }: DepartmentGateProps) {
  const { currentDepartment, setDepartment, departments } = useDepartment();

  if (!currentDepartment) {
    return (
      <OpsLayout title="Carbo Controle">
        <div className="flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center px-6 py-8">
          <div className="mb-8 text-center ops-bounce-in">
            <div className="mb-6 inline-flex h-24 w-24 items-center justify-center rounded-3xl bg-primary shadow-lg text-5xl">
              🏢
            </div>
            <h1 className="mb-2 text-3xl font-extrabold text-foreground">
              Selecione seu Departamento
            </h1>
            <p className="text-lg text-muted-foreground max-w-md">
              Para começar, escolha a área de operação
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4 w-full max-w-lg ops-slide-up">
            {departments.map((dept, index) => (
              <button
                key={dept.id}
                onClick={() => setDepartment(dept.id)}
                className={cn(
                  "relative flex flex-col items-center gap-3 p-6 rounded-2xl border-2 transition-all duration-200 ops-press",
                  "border-border bg-card hover:border-primary hover:bg-primary/5 hover:shadow-lg hover:scale-[1.02]"
                )}
                style={{
                  animationDelay: `${index * 100}ms`,
                }}
              >
                <span className="text-5xl">{dept.icon}</span>
                <span className="font-bold text-lg text-foreground">{dept.name}</span>
                <span className="text-xs text-muted-foreground text-center leading-tight">
                  {dept.description}
                </span>
              </button>
            ))}
          </div>
        </div>
      </OpsLayout>
    );
  }

  return <>{children}</>;
}
