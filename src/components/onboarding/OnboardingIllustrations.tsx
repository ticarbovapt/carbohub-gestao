import React from "react";

export function ChecklistIllustration() {
  return (
    <div className="relative w-full h-48 bg-gradient-to-br from-ops-yellow/20 to-ops-green/20 rounded-2xl p-4 overflow-hidden">
      {/* Checklist items */}
      <div className="space-y-3">
        <div className="flex items-center gap-3 bg-white rounded-xl p-3 shadow-sm ops-slide-up" style={{ animationDelay: "0.1s" }}>
          <div className="w-6 h-6 rounded-full bg-ops-green flex items-center justify-center">
            <span className="text-white text-sm">✓</span>
          </div>
          <div className="flex-1 h-3 bg-gray-100 rounded-full" />
        </div>
        <div className="flex items-center gap-3 bg-white rounded-xl p-3 shadow-sm ops-slide-up" style={{ animationDelay: "0.2s" }}>
          <div className="w-6 h-6 rounded-full bg-ops-green flex items-center justify-center">
            <span className="text-white text-sm">✓</span>
          </div>
          <div className="flex-1 h-3 bg-gray-100 rounded-full" />
        </div>
        <div className="flex items-center gap-3 bg-white rounded-xl p-3 shadow-sm ops-slide-up" style={{ animationDelay: "0.3s" }}>
          <div className="w-6 h-6 rounded-full border-2 border-ops-yellow flex items-center justify-center animate-pulse">
            <span className="text-ops-yellow text-sm">○</span>
          </div>
          <div className="flex-1 h-3 bg-gray-100 rounded-full" />
        </div>
      </div>
      
      {/* Decorative elements */}
      <div className="absolute -right-4 -bottom-4 w-24 h-24 bg-ops-yellow/20 rounded-full" />
      <div className="absolute -right-8 -top-8 w-16 h-16 bg-ops-green/20 rounded-full" />
    </div>
  );
}

export function StepsIllustration() {
  return (
    <div className="relative w-full h-48 bg-gradient-to-br from-ops-yellow/10 to-ops-green/10 rounded-2xl p-4 overflow-hidden">
      {/* Steps flow */}
      <div className="flex items-center justify-between h-full">
        <div className="flex flex-col items-center ops-bounce-in" style={{ animationDelay: "0.1s" }}>
          <div className="w-14 h-14 rounded-2xl bg-white shadow-md flex items-center justify-center text-2xl mb-2">
            📱
          </div>
          <span className="text-xs font-medium text-muted-foreground">Escanear</span>
        </div>
        
        <div className="h-0.5 flex-1 mx-2 bg-gradient-to-r from-ops-yellow to-ops-green" />
        
        <div className="flex flex-col items-center ops-bounce-in" style={{ animationDelay: "0.2s" }}>
          <div className="w-14 h-14 rounded-2xl bg-white shadow-md flex items-center justify-center text-2xl mb-2">
            ✏️
          </div>
          <span className="text-xs font-medium text-muted-foreground">Preencher</span>
        </div>
        
        <div className="h-0.5 flex-1 mx-2 bg-gradient-to-r from-ops-green to-ops-green" />
        
        <div className="flex flex-col items-center ops-bounce-in" style={{ animationDelay: "0.3s" }}>
          <div className="w-14 h-14 rounded-2xl bg-ops-green shadow-md flex items-center justify-center text-2xl mb-2">
            ✅
          </div>
          <span className="text-xs font-medium text-muted-foreground">Concluir</span>
        </div>
      </div>
    </div>
  );
}

export function DashboardIllustration() {
  return (
    <div className="relative w-full h-48 bg-gradient-to-br from-board-navy/10 to-board-blue/10 rounded-2xl p-4 overflow-hidden">
      {/* Mini dashboard */}
      <div className="grid grid-cols-2 gap-2 h-full">
        <div className="bg-white rounded-xl p-3 shadow-sm ops-slide-up" style={{ animationDelay: "0.1s" }}>
          <div className="h-2 w-12 bg-board-navy/20 rounded mb-2" />
          <div className="text-lg font-bold text-board-navy">87%</div>
          <div className="h-1.5 w-full bg-gray-100 rounded-full mt-2">
            <div className="h-full w-4/5 bg-board-blue rounded-full" />
          </div>
        </div>
        <div className="bg-white rounded-xl p-3 shadow-sm ops-slide-up" style={{ animationDelay: "0.15s" }}>
          <div className="h-2 w-10 bg-board-navy/20 rounded mb-2" />
          <div className="text-lg font-bold text-board-navy">12</div>
          <div className="text-xs text-muted-foreground">equipe</div>
        </div>
        <div className="bg-white rounded-xl p-3 shadow-sm ops-slide-up col-span-2" style={{ animationDelay: "0.2s" }}>
          <div className="flex items-center gap-2">
            {["🟢", "🟢", "🟢", "🟡", "⚪"].map((dot, i) => (
              <span key={i} className="text-sm">{dot}</span>
            ))}
            <span className="text-xs text-muted-foreground ml-auto">Status da equipe</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function FilterIllustration() {
  return (
    <div className="relative w-full h-48 bg-gradient-to-br from-board-navy/5 to-board-blue/10 rounded-2xl p-4 overflow-hidden">
      {/* Filter demo */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 ops-slide-up" style={{ animationDelay: "0.1s" }}>
          <div className="px-3 py-1.5 bg-board-navy text-white text-xs rounded-full font-medium">
            Expedição
          </div>
          <div className="px-3 py-1.5 bg-white border text-xs rounded-full">
            Preparação
          </div>
          <div className="px-3 py-1.5 bg-white border text-xs rounded-full">
            Operação
          </div>
        </div>
        
        <div className="bg-white rounded-xl p-3 shadow-sm ops-slide-up" style={{ animationDelay: "0.2s" }}>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-board-blue/20 flex items-center justify-center text-sm">
              👤
            </div>
            <div className="flex-1">
              <div className="h-2 w-20 bg-gray-200 rounded mb-1" />
              <div className="h-1.5 w-16 bg-gray-100 rounded" />
            </div>
            <div className="text-xs font-medium text-board-navy">98%</div>
          </div>
        </div>
        
        <div className="bg-white rounded-xl p-3 shadow-sm ops-slide-up" style={{ animationDelay: "0.3s" }}>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-board-blue/20 flex items-center justify-center text-sm">
              👤
            </div>
            <div className="flex-1">
              <div className="h-2 w-24 bg-gray-200 rounded mb-1" />
              <div className="h-1.5 w-12 bg-gray-100 rounded" />
            </div>
            <div className="text-xs font-medium text-board-navy">94%</div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function AdminPanelIllustration() {
  return (
    <div className="relative w-full h-48 bg-gradient-to-br from-purple-50 to-purple-100/50 rounded-2xl p-4 overflow-hidden">
      {/* Admin tools */}
      <div className="grid grid-cols-2 gap-3 h-full">
        <div className="bg-white rounded-xl p-3 shadow-sm flex flex-col items-center justify-center ops-bounce-in" style={{ animationDelay: "0.1s" }}>
          <span className="text-2xl mb-1">📊</span>
          <span className="text-xs font-medium text-center">Painel Global</span>
        </div>
        <div className="bg-white rounded-xl p-3 shadow-sm flex flex-col items-center justify-center ops-bounce-in" style={{ animationDelay: "0.15s" }}>
          <span className="text-2xl mb-1">📝</span>
          <span className="text-xs font-medium text-center">Checklists</span>
        </div>
        <div className="bg-white rounded-xl p-3 shadow-sm flex flex-col items-center justify-center ops-bounce-in" style={{ animationDelay: "0.2s" }}>
          <span className="text-2xl mb-1">📈</span>
          <span className="text-xs font-medium text-center">Relatórios</span>
        </div>
        <div className="bg-white rounded-xl p-3 shadow-sm flex flex-col items-center justify-center ops-bounce-in" style={{ animationDelay: "0.25s" }}>
          <span className="text-2xl mb-1">🏢</span>
          <span className="text-xs font-medium text-center">Licenciados</span>
        </div>
      </div>
    </div>
  );
}

export function GrowthIllustration() {
  return (
    <div className="relative w-full h-48 bg-gradient-to-br from-ops-green/20 to-ops-yellow/10 rounded-2xl p-4 overflow-hidden">
      {/* Growth visualization */}
      <div className="flex items-end justify-center h-full gap-3 pb-4">
        <div className="w-8 h-16 bg-ops-green/50 rounded-t-lg ops-slide-up" style={{ animationDelay: "0.1s" }} />
        <div className="w-8 h-24 bg-ops-green/60 rounded-t-lg ops-slide-up" style={{ animationDelay: "0.15s" }} />
        <div className="w-8 h-20 bg-ops-green/70 rounded-t-lg ops-slide-up" style={{ animationDelay: "0.2s" }} />
        <div className="w-8 h-32 bg-ops-green/80 rounded-t-lg ops-slide-up" style={{ animationDelay: "0.25s" }} />
        <div className="w-8 h-36 bg-ops-green rounded-t-lg ops-slide-up" style={{ animationDelay: "0.3s" }}>
          <div className="w-full h-full flex items-start justify-center pt-2">
            <span className="text-white text-lg">📈</span>
          </div>
        </div>
      </div>
      
      {/* Decorative elements */}
      <div className="absolute top-4 right-4 text-2xl animate-bounce" style={{ animationDuration: "2s" }}>
        🚀
      </div>
    </div>
  );
}
