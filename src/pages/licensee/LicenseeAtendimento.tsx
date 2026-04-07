import { useState } from "react";
import { LicenseeLayout } from "@/components/layouts/LicenseeLayout";
import { useLicenseeStatus } from "@/hooks/useLicenseePortal";
import { useDescarbSales, MODALITY_INFO, PAYMENT_LABELS } from "@/hooks/useDescarbSales";
import { NovoAtendimentoModal } from "@/components/licensee/NovoAtendimentoModal";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { CarboCard } from "@/components/ui/carbo-card";
import {
  Plus, Search, ClipboardList, Car, User,
  CalendarDays, DollarSign, Clock
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";

export default function LicenseeAtendimento() {
  const { data: status } = useLicenseeStatus();
  const licenseeId = status?.licensee_id;

  const { data: sales = [], isLoading } = useDescarbSales(licenseeId);
  const [modalOpen, setModalOpen] = useState(false);
  const [search, setSearch] = useState("");

  const filtered = sales.filter(s => {
    const q = search.toLowerCase();
    return (
      (s.descarb_clients?.name ?? "").toLowerCase().includes(q) ||
      (s.descarb_vehicles?.license_plate ?? "").toLowerCase().includes(q) ||
      s.modality.toLowerCase().includes(q)
    );
  });

  // KPIs
  const today = new Date().toDateString();
  const todaySales = sales.filter(s => new Date(s.created_at).toDateString() === today && !s.is_pre_sale);
  const preSales = sales.filter(s => s.is_pre_sale && s.pre_sale_status === "NOT");
  const monthSales = sales.filter(s => {
    const d = new Date(s.created_at);
    const now = new Date();
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear() && !s.is_pre_sale;
  });
  const todayRevenue = todaySales.reduce((sum, s) => sum + s.total_value, 0);

  return (
    <LicenseeLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Atendimentos</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Registro de descarbonizações realizadas</p>
          </div>
          <Button
            onClick={() => setModalOpen(true)}
            className="gap-2 bg-area-licensee hover:bg-area-licensee/90"
            disabled={!licenseeId}
          >
            <Plus className="h-4 w-4" /> Novo Atendimento
          </Button>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { icon: ClipboardList, label: "Hoje",       value: todaySales.length.toString(),  sub: "atendimentos" },
            { icon: DollarSign,   label: "Receita Hoje", value: `R$ ${todayRevenue.toFixed(0)}`, sub: "realizados hoje" },
            { icon: CalendarDays, label: "No Mês",      value: monthSales.length.toString(),  sub: "atendimentos" },
            { icon: Clock,        label: "Pré-vendas",  value: preSales.length.toString(),    sub: "aguardando execução", highlight: preSales.length > 0 },
          ].map((k, i) => (
            <CarboCard key={i} className="p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-area-licensee/10">
                  <k.icon className="h-5 w-5 text-area-licensee" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">{k.label}</p>
                  <p className={cn("text-lg font-bold", k.highlight && "text-warning")}>{k.value}</p>
                  <p className="text-[10px] text-muted-foreground">{k.sub}</p>
                </div>
              </div>
            </CarboCard>
          ))}
        </div>

        {/* Search */}
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Buscar cliente, placa..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>

        {/* List */}
        {isLoading ? (
          <div className="space-y-3">
            {[1,2,3].map(i => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}
          </div>
        ) : filtered.length === 0 ? (
          <CarboCard className="flex flex-col items-center justify-center py-14 gap-3">
            <ClipboardList className="h-10 w-10 text-muted-foreground/30" />
            <p className="text-muted-foreground font-medium">Nenhum atendimento encontrado</p>
            <Button onClick={() => setModalOpen(true)} variant="outline" size="sm" className="gap-2">
              <Plus className="h-4 w-4" /> Registrar primeiro atendimento
            </Button>
          </CarboCard>
        ) : (
          <div className="space-y-2">
            {filtered.map(s => {
              const mod = MODALITY_INFO[s.modality];
              return (
                <div
                  key={s.id}
                  className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-xl border border-border bg-card px-4 py-3"
                >
                  {/* Modality badge */}
                  <div
                    className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-white font-black text-sm shadow-sm"
                    style={{ backgroundColor: mod.color }}
                  >
                    {s.modality}
                  </div>

                  {/* Main info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm text-foreground flex items-center gap-1">
                        <User className="h-3.5 w-3.5 text-muted-foreground" />
                        {s.descarb_clients?.name || "Cliente avulso"}
                      </span>
                      {s.descarb_vehicles?.license_plate && (
                        <Badge variant="outline" className="font-mono text-[10px]">
                          <Car className="h-3 w-3 mr-1" />
                          {s.descarb_vehicles.license_plate}
                        </Badge>
                      )}
                      {s.is_pre_sale && (
                        <Badge variant="outline" className="text-[10px] border-amber-400 text-amber-600">
                          Pré-venda
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {mod.label} · {s.reagent_type} · {s.reagent_qty_used}L ·{" "}
                      {format(new Date(s.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                    </p>
                  </div>

                  {/* Value + payment */}
                  <div className="text-right flex-shrink-0">
                    {!s.is_pre_sale && (
                      <p className="font-bold text-foreground">R$ {s.total_value.toFixed(2)}</p>
                    )}
                    <p className="text-[11px] text-muted-foreground">
                      {s.is_pre_sale
                        ? (s.preferred_date ? `Agendado ${format(new Date(s.preferred_date), "dd/MM", { locale: ptBR })}` : "Sem data")
                        : PAYMENT_LABELS[s.payment_type as keyof typeof PAYMENT_LABELS] ?? s.payment_type}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {licenseeId && (
        <NovoAtendimentoModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          licenseeId={licenseeId}
        />
      )}
    </LicenseeLayout>
  );
}
