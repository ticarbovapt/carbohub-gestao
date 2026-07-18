import { useState } from "react";
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, XAxis, YAxis,
  Tooltip, CartesianGrid, Legend,
} from "recharts";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  MessagesSquare, Users, TrendingUp, Bell, BellOff, Hash, UserCheck, Clock, Download,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  useAdoptionOverview, useAdoptionSeries, useVolumeByDepartment,
  useOnboardingPendencies, useInactiveUsers, useChannelStats,
} from "@/hooks/useChatAdoption";

// ─────────────────────────────────────────────────────────────────────────────
// Adoção do Carbo Chat — mede a migração WhatsApp → sistema.
// SÓ agregados (contagens por setor/período + pendências de onboarding).
// Nunca lê conteúdo de mensagem — as RPCs no banco só devolvem números/datas.
// Gate: as RPCs exigem carbo_admin; o app inteiro já é gateado por carbo_admin.
// ─────────────────────────────────────────────────────────────────────────────

const GREEN = "#0f402d";
const LIME = "#8dc63f";

function fmtDate(s: string | null, withTime = false) {
  if (!s) return "—";
  try { return format(parseISO(s), withTime ? "dd/MM/yy HH:mm" : "dd/MM/yy", { locale: ptBR }); }
  catch { return "—"; }
}
function dayLabel(s: string) {
  try { return format(parseISO(s), "dd/MM", { locale: ptBR }); } catch { return s; }
}

function Kpi({ icon: Icon, label, value, sub, tone = "default" }: {
  icon: React.ElementType; label: string; value: React.ReactNode; sub?: string;
  tone?: "default" | "warn" | "good";
}) {
  const toneCls = tone === "warn" ? "text-amber-600" : tone === "good" ? "text-emerald-600" : "text-foreground";
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium">
          <Icon className="h-4 w-4" /> {label}
        </div>
        <div className={`mt-1 text-2xl font-bold tabular-nums ${toneCls}`}>{value}</div>
        {sub && <div className="mt-0.5 text-[11px] text-muted-foreground">{sub}</div>}
      </CardContent>
    </Card>
  );
}

export default function ChatAdocao() {
  const [inactiveDays, setInactiveDays] = useState(7);
  const ov = useAdoptionOverview();
  const series = useAdoptionSeries(30);
  const byDept = useVolumeByDepartment();
  const onboarding = useOnboardingPendencies();
  const inactive = useInactiveUsers(inactiveDays);
  const channels = useChannelStats();

  const o = ov.data;
  const pctPush = o && o.funcionarios > 0 ? Math.round((o.com_push / o.funcionarios) * 100) : 0;
  const pctAtivo30 = o && o.funcionarios > 0 ? Math.round((o.ativos_30d / o.funcionarios) * 100) : 0;

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2">
          <MessagesSquare className="h-5 w-5" /> Adoção do Carbo Chat
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Migração do WhatsApp para o sistema — números por setor e período. Sem conteúdo de mensagem, só agregados.
        </p>
      </div>

      {/* Cartões */}
      {ov.isLoading || !o ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Kpi icon={Users} label="Ativos hoje" value={o.ativos_hoje} sub={`${o.msgs_hoje} mensagens hoje`} />
          <Kpi icon={UserCheck} label="Ativos 7 dias" value={o.ativos_7d} sub={`${o.msgs_7d} mensagens`} />
          <Kpi icon={TrendingUp} label="Ativos 30 dias" value={o.ativos_30d}
            sub={`${pctAtivo30}% dos ${o.funcionarios} internos`} tone={pctAtivo30 >= 60 ? "good" : "warn"} />
          <Kpi icon={MessagesSquare} label="Mensagens 30 dias" value={o.msgs_30d} />
          <Kpi icon={Hash} label="Grupos ativos" value={o.grupos_ativos} sub="com atividade em 30d" />
          <Kpi icon={MessagesSquare} label="Conversas diretas" value={o.dms_ativas} sub="DMs ativas em 30d" />
          <Kpi icon={Bell} label="Com push" value={o.com_push} sub={`${pctPush}% dos internos`}
            tone={pctPush >= 70 ? "good" : "warn"} />
          <Kpi icon={BellOff} label="Sem push" value={o.sem_push} sub="correr atrás" tone={o.sem_push > 0 ? "warn" : "good"} />
        </div>
      )}

      {/* Tendência */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2">
          <TrendingUp className="h-4 w-4" /> Tendência (30 dias)
        </CardTitle></CardHeader>
        <CardContent>
          {series.isLoading ? <Skeleton className="h-64 w-full" /> : (
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={series.data ?? []} margin={{ left: -18, right: 8, top: 8 }}>
                <defs>
                  <linearGradient id="gAtivos" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={GREEN} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={GREEN} stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gMsgs" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={LIME} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={LIME} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                <XAxis dataKey="dia" tickFormatter={dayLabel} fontSize={11} minTickGap={24} />
                <YAxis fontSize={11} allowDecimals={false} />
                <Tooltip labelFormatter={(v) => fmtDate(String(v))} />
                <Legend />
                <Area type="monotone" dataKey="usuarios_ativos" name="Usuários ativos" stroke={GREEN} fill="url(#gAtivos)" strokeWidth={2} />
                <Area type="monotone" dataKey="mensagens" name="Mensagens" stroke={LIME} fill="url(#gMsgs)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Volume por setor + estatísticas de canais */}
      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Mensagens por setor (30 dias)</CardTitle></CardHeader>
          <CardContent>
            {byDept.isLoading ? <Skeleton className="h-64 w-full" /> : (byDept.data?.length ?? 0) === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">Sem mensagens no período.</p>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={byDept.data ?? []} layout="vertical" margin={{ left: 8, right: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.15} horizontal={false} />
                  <XAxis type="number" fontSize={11} allowDecimals={false} />
                  <YAxis type="category" dataKey="departamento" fontSize={11} width={110} />
                  <Tooltip />
                  <Bar dataKey="mensagens" name="Mensagens" fill={GREEN} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2">
            <Hash className="h-4 w-4" /> Canais e conversas
          </CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {channels.isLoading || !channels.data ? <Skeleton className="h-40 w-full" /> : (
              <div className="grid grid-cols-2 gap-3">
                <Stat label="Grupos ativos" value={`${channels.data.grupos_ativos_30d} / ${channels.data.grupos_total}`} hint="ativos 30d / total" />
                <Stat label="DMs ativas" value={`${channels.data.dms_ativas_30d} / ${channels.data.dms_total}`} hint="ativas 30d / total" />
                <Stat label="Média por grupo" value={channels.data.media_membros ?? "—"} hint="membros" />
                <Stat label="Grupos × DMs" value={`${channels.data.grupos_total} × ${channels.data.dms_total}`} hint="total" />
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Pendências de onboarding + inativos */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Pendências de onboarding</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Tabs defaultValue="pendencias">
            <TabsList className="mx-4 mt-2">
              <TabsTrigger value="pendencias">Instalação & push</TabsTrigger>
              <TabsTrigger value="inativos">Inativos</TabsTrigger>
            </TabsList>

            <TabsContent value="pendencias" className="mt-2">
              {onboarding.isLoading ? <div className="p-4"><Skeleton className="h-40 w-full" /></div> : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-left text-xs text-muted-foreground border-y">
                      <tr>
                        <th className="px-4 py-2 font-medium">Pessoa</th>
                        <th className="px-4 py-2 font-medium">Setor</th>
                        <th className="px-4 py-2 font-medium">Push</th>
                        <th className="px-4 py-2 font-medium">App</th>
                        <th className="px-4 py-2 font-medium">Última atividade</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(onboarding.data ?? []).map((r) => (
                        <tr key={r.user_id} className="border-b last:border-0 hover:bg-muted/40">
                          <td className="px-4 py-2 font-medium">{r.full_name ?? "—"}</td>
                          <td className="px-4 py-2 text-muted-foreground">{r.departamento}</td>
                          <td className="px-4 py-2">
                            {r.tem_push
                              ? <Badge variant="outline" className="border-emerald-500/40 text-emerald-600"><Bell className="h-3 w-3 mr-1" />ok</Badge>
                              : <Badge variant="outline" className="border-amber-500/40 text-amber-600"><BellOff className="h-3 w-3 mr-1" />sem push</Badge>}
                          </td>
                          <td className="px-4 py-2">
                            {r.usou_app
                              ? <span className="text-emerald-600 inline-flex items-center gap-1"><Download className="h-3.5 w-3.5" />usou</span>
                              : <span className="text-amber-600">nunca</span>}
                          </td>
                          <td className="px-4 py-2 text-muted-foreground">{fmtDate(r.ultima_atividade, true)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </TabsContent>

            <TabsContent value="inativos" className="mt-2">
              <div className="flex items-center gap-2 px-4 pb-2 text-sm">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">Sem atividade há mais de</span>
                <Select value={String(inactiveDays)} onValueChange={(v) => setInactiveDays(Number(v))}>
                  <SelectTrigger className="w-28 h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="3">3 dias</SelectItem>
                    <SelectItem value="7">7 dias</SelectItem>
                    <SelectItem value="14">14 dias</SelectItem>
                    <SelectItem value="30">30 dias</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {inactive.isLoading ? <div className="p-4"><Skeleton className="h-40 w-full" /></div> : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-left text-xs text-muted-foreground border-y">
                      <tr>
                        <th className="px-4 py-2 font-medium">Pessoa</th>
                        <th className="px-4 py-2 font-medium">Setor</th>
                        <th className="px-4 py-2 font-medium">Última atividade</th>
                        <th className="px-4 py-2 font-medium">Dias parado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(inactive.data ?? []).length === 0 ? (
                        <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">Ninguém parado nesse período. 🎉</td></tr>
                      ) : (inactive.data ?? []).map((r) => (
                        <tr key={r.user_id} className="border-b last:border-0 hover:bg-muted/40">
                          <td className="px-4 py-2 font-medium">{r.full_name ?? "—"}</td>
                          <td className="px-4 py-2 text-muted-foreground">{r.departamento}</td>
                          <td className="px-4 py-2 text-muted-foreground">{fmtDate(r.ultima_ativid, true)}</td>
                          <td className="px-4 py-2">
                            {r.dias_inativo == null
                              ? <Badge variant="outline" className="border-red-500/40 text-red-600">nunca entrou</Badge>
                              : <span className="tabular-nums">{r.dias_inativo}d</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-xl font-bold tabular-nums mt-0.5">{value}</div>
      {hint && <div className="text-[10px] text-muted-foreground mt-0.5">{hint}</div>}
    </div>
  );
}
