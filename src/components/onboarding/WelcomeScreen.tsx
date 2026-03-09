import React from "react";
import { ClipboardCheck, Users, Shield } from "lucide-react";
import logoAvatar from "@/assets/logo-avatar.png";
import logoAvatarLight from "@/assets/logo-avatar-light.png";

export type RoleSelection = "operator" | "manager" | "admin" | null;

interface WelcomeScreenProps {
  onSelectRole: (role: RoleSelection) => void;
}

const roles = [
  {
    id: "operator" as const,
    icon: <ClipboardCheck className="h-7 w-7" />,
    title: "Sou Operador",
    description: "Executo checklists e tarefas no campo",
    gradient: "from-carbo-green to-carbo-blue",
    borderColor: "border-carbo-green/30",
    hoverBg: "hover:bg-carbo-green/5",
  },
  {
    id: "manager" as const,
    icon: <Users className="h-7 w-7" />,
    title: "Sou Gestor",
    description: "Gerencio equipes e acompanho resultados",
    gradient: "from-carbo-blue to-carbo-green",
    borderColor: "border-carbo-blue/30",
    hoverBg: "hover:bg-carbo-blue/5",
  },
  {
    id: "admin" as const,
    icon: <Shield className="h-7 w-7" />,
    title: "Sou Admin",
    description: "Controlo o sistema e defino estratégias",
    gradient: "from-board-navy to-carbo-blue",
    borderColor: "border-board-navy/30",
    hoverBg: "hover:bg-board-navy/5",
  },
];

export function WelcomeScreen({ onSelectRole }: WelcomeScreenProps) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-carbo-green/5 via-background to-carbo-blue/5 flex flex-col">
      {/* Header */}
      <header className="p-6">
        <div className="flex items-center gap-3">
          <img 
            src={logoAvatar} 
            alt="Grupo Carbo" 
            className="h-10 w-auto dark:hidden"
          />
          <img 
            src={logoAvatarLight} 
            alt="Grupo Carbo" 
            className="h-10 w-auto hidden dark:block"
          />
        </div>
      </header>

      {/* Main content */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-8">
        {/* Welcome message */}
        <div className="text-center mb-10 max-w-md">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-carbo-green/10 text-carbo-green text-sm font-medium mb-6 board-fade-in">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-carbo-green opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-carbo-green"></span>
            </span>
            CARBO Hub
          </div>
          
          <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-4 board-fade-in font-plex">
            Bem-vindo ao{" "}
            <span className="carbo-gradient-text">Carbo Controle</span>
          </h1>
          <p className="text-lg text-muted-foreground board-fade-in" style={{ animationDelay: "0.1s" }}>
            Onde cada ação movimenta o crescimento
          </p>
        </div>

        {/* Role selection */}
        <div className="w-full max-w-md space-y-4">
          <p className="text-center text-sm font-medium text-muted-foreground mb-6 board-fade-in" style={{ animationDelay: "0.2s" }}>
            Escolha seu perfil para continuar:
          </p>

          {roles.map((role, index) => (
            <button
              key={role.id}
              onClick={() => onSelectRole(role.id)}
              className={`w-full group relative overflow-hidden rounded-2xl border-2 ${role.borderColor} bg-card p-5 transition-all duration-300 hover:shadow-carbo hover:translate-y-[-2px] ${role.hoverBg} board-fade-in`}
              style={{ animationDelay: `${0.2 + index * 0.1}s` }}
            >
              <div className="flex items-center gap-4">
                {/* Icon with gradient background */}
                <div className={`w-14 h-14 rounded-xl bg-gradient-to-br ${role.gradient} text-white flex items-center justify-center shadow-lg group-hover:scale-105 transition-transform`}>
                  {role.icon}
                </div>

                {/* Text */}
                <div className="flex-1 text-left">
                  <h3 className="font-bold text-lg text-foreground group-hover:text-carbo-green transition-colors">
                    {role.title}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {role.description}
                  </p>
                </div>

                {/* Arrow */}
                <div className="text-muted-foreground group-hover:text-carbo-green group-hover:translate-x-1 transition-all text-xl">
                  →
                </div>
              </div>
            </button>
          ))}
        </div>

        {/* Quote */}
        <div className="mt-12 text-center max-w-md board-fade-in" style={{ animationDelay: "0.5s" }}>
          <div className="relative">
            <div className="absolute -top-2 -left-2 text-4xl text-carbo-green/20">"</div>
            <p className="text-sm text-muted-foreground italic px-6">
              Você não está só operando um sistema. Você está construindo o futuro da Carbo, um clique de cada vez.
            </p>
            <div className="absolute -bottom-4 -right-2 text-4xl text-carbo-blue/20">"</div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="p-6 text-center">
        <p className="text-xs text-muted-foreground">
          © 2026 Grupo Carbo · <span className="text-carbo-green">Simplicidade</span> · <span className="text-warning">Felicidade</span> · <span className="text-carbo-blue">Verdade</span>
        </p>
      </footer>
    </div>
  );
}
