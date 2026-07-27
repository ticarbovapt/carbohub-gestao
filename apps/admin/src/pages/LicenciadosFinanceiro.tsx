import { Wallet, AlertTriangle, Percent, Users } from "lucide-react";
import { CarboPageHeader } from "@/components/ui/carbo-page-header";
import { CarboKPI } from "@/components/ui/carbo-kpi";
import { useAuth } from "@/contexts/AuthContext";
import { fmtBRL } from "@/lib/dash-format";
import { LicenciadosSubNav } from "@/components/licenciados/LicenciadosSubNav";
import { useCommission, useInvestorCommission } from "@/hooks/useDashFranqueados";

function RestrictedNotice() {
  return (
    <div className="rounded-xl border border-dashed border-amber-500/40 bg-amber-500/5 p-6 flex flex-col items-center gap-2 text-center">
      <AlertTriangle className="h-8 w-8 text-amber-500/70" />
      <p className="text-sm font-medium">Área restrita a gestores.</p>
    </div>
  );
}

// Espelho read-only do financeiro da rede licenciada (comissões e investidores).
// Fonte: RPCs admin_get_commission / admin_get_investor_commission (admin-only
// no próprio banco). Janela: últimos 12 meses.
export default function LicenciadosFinanceiro() {
  const { canAdmin } = useAuth();
  const { data: commission = [], isLoading: cLoad } = useCommission();
  const { data: investors = [], isLoading: iLoad } = useInvestorCommission();

  if (!canAdmin) {
    return (
      <main className="mx-auto max-w-6xl px-4 sm:px-6 py-8">
        <RestrictedNotice />
      </main>
    );
  }

  const totalBase = commission.reduce((s, r) => s + r.total, 0);
  const totalCommission = commission.reduce((s, r) => s + r.commission_prod + r.commission_tax, 0);
  const totalInvestor = investors.reduce((s, r) => s + r.commission, 0);

  return (
    <main className="mx-auto max-w-6xl px-4 sm:px-6 py-8 space-y-6">
      <CarboPageHeader
        icon={Wallet}
        iconColor="green"
        title="Licenciados — Financeiro"
        description="Comissões da rede e investidores · últimos 12 meses (somente leitura)"
      />

      <LicenciadosSubNav />

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <CarboKPI title="Base de cálculo" value={fmtBRL(totalBase)} icon={Wallet} iconColor="blue" loading={cLoad} />
        <CarboKPI title="Comissão de lojas" value={fmtBRL(totalCommission)} icon={Percent} iconColor="green" loading={cLoad} />
        <CarboKPI title="Comissão de investidores" value={fmtBRL(totalInvestor)} icon={Users} iconColor="green" loading={iLoad} />
      </div>

      {/* Comissão por loja */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="flex items-center gap-2 border-b border-border px-5 py-3">
          <Percent className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">Comissão por Loja</h2>
        </div>
        <div className="overflow-x-auto">
          {commission.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-muted-foreground">
              {cLoad ? "Carregando…" : "Sem comissões no período."}
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-secondary/30">
                <tr>
                  {["Loja", "Rede", "Base", "% Prod.", "Comissão prod.", "Comissão imp.", "Total"].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {commission.map((r) => (
                  <tr key={r.loja_id} className="hover:bg-secondary/20 transition-colors">
                    <td className="px-4 py-3 font-medium text-foreground whitespace-nowrap">{r.loja_name}</td>
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{r.rede_name || "—"}</td>
                    <td className="px-4 py-3 tabular-nums text-muted-foreground whitespace-nowrap">{fmtBRL(r.total)}</td>
                    <td className="px-4 py-3 tabular-nums text-muted-foreground whitespace-nowrap">{r.commission_pct}%</td>
                    <td className="px-4 py-3 tabular-nums text-muted-foreground whitespace-nowrap">{fmtBRL(r.commission_prod)}</td>
                    <td className="px-4 py-3 tabular-nums text-muted-foreground whitespace-nowrap">{fmtBRL(r.commission_tax)}</td>
                    <td className="px-4 py-3 tabular-nums font-semibold text-foreground whitespace-nowrap">
                      {fmtBRL(r.commission_prod + r.commission_tax)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Investidores */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="flex items-center gap-2 border-b border-border px-5 py-3">
          <Users className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">Investidores</h2>
        </div>
        <div className="overflow-x-auto">
          {investors.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-muted-foreground">
              {iLoad ? "Carregando…" : "Nenhum investidor no período."}
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-secondary/30">
                <tr>
                  {["Investidor", "%", "Máquinas", "Lojas", "Serviços", "Receita", "Comissão"].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {investors.map((r) => (
                  <tr key={r.investidor_id} className="hover:bg-secondary/20 transition-colors">
                    <td className="px-4 py-3 font-medium text-foreground whitespace-nowrap">{r.investidor_name}</td>
                    <td className="px-4 py-3 tabular-nums text-muted-foreground">{r.commission_percent}%</td>
                    <td className="px-4 py-3 tabular-nums text-muted-foreground">{r.machines}</td>
                    <td className="px-4 py-3 tabular-nums text-muted-foreground">{r.lojas}</td>
                    <td className="px-4 py-3 tabular-nums text-muted-foreground">{r.services}</td>
                    <td className="px-4 py-3 tabular-nums text-muted-foreground whitespace-nowrap">{fmtBRL(r.revenue)}</td>
                    <td className="px-4 py-3 tabular-nums font-semibold text-foreground whitespace-nowrap">{fmtBRL(r.commission)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </main>
  );
}
