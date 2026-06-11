// ⚠️ PORT VISUAL FIEL ao Controle (/admin/nfse → NFSeImportPage) — dados MOCK.
// Sem supabase, sem @tanstack/react-query, sem JSZip, sem hooks reais.
// Importação e parsing de NFSe entram na fase de lógica (botões → toast).

import React, { useMemo, useState } from "react";
import { CarboPageHeader } from "@/components/ui/carbo-page-header";
import { CarboCard, CarboCardContent } from "@/components/ui/carbo-card";
import { CarboBadge } from "@/components/ui/carbo-badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  Upload, FileText, CheckCircle2, Database, TrendingUp, Receipt,
  Search, X, ChevronDown, ChevronUp, FileArchive, BarChart3,
  Hash, CalendarDays, MapPin,
} from "lucide-react";

// ─── Shape MOCK equivalente a NFSeRecord (sem importar o real) ──────────────────
interface NFSeMock {
  id: string;
  numero: number;
  data_emissao: string;        // ISO yyyy-mm-dd
  competencia: string;
  item_lista_servico: string;
  discriminacao: string;
  outras_informacoes: string;
  valor_servicos: number;
  iss_retido: boolean;
  tomador_cpf_cnpj: string;
  tomador_razao_social: string;
  tomador_uf: string;
  tomador_cep: string;
  pedido_refs: string[];
  veiculo_descricao: string | null;
  qtd_veiculos: number | null;
}

const MOCK_NFSE: NFSeMock[] = [
  { id: "1", numero: 2048, data_emissao: "2026-06-09", competencia: "2026-06-01", item_lista_servico: "14.01", discriminacao: "Descarbonização de motor — caminhão Scania | 1 # Pedido 8841", outras_informacoes: "Pedido: 8841", valor_servicos: 1850, iss_retido: false, tomador_cpf_cnpj: "12.345.678/0001-90", tomador_razao_social: "Transportes Bandeirante Ltda", tomador_uf: "SP", tomador_cep: "01310-100", pedido_refs: ["8841"], veiculo_descricao: "Scania R450", qtd_veiculos: 1 },
  { id: "2", numero: 2047, data_emissao: "2026-06-07", competencia: "2026-06-01", item_lista_servico: "14.01", discriminacao: "Limpeza de bicos injetores — frota | 3 # Pedido 8832", outras_informacoes: "Pedido: 8832", valor_servicos: 4320, iss_retido: true, tomador_cpf_cnpj: "98.765.432/0001-10", tomador_razao_social: "Rede ABC Combustíveis S.A.", tomador_uf: "RJ", tomador_cep: "20040-020", pedido_refs: ["8832"], veiculo_descricao: "Volvo FH540", qtd_veiculos: 3 },
  { id: "3", numero: 2046, data_emissao: "2026-06-05", competencia: "2026-06-01", item_lista_servico: "14.01", discriminacao: "Descarbonização preventiva | 1 # Pedido 8820", outras_informacoes: "Pedido: 8820", valor_servicos: 1290, iss_retido: false, tomador_cpf_cnpj: "45.678.912/0001-33", tomador_razao_social: "Auto Posto Central de Natal", tomador_uf: "RN", tomador_cep: "59020-000", pedido_refs: ["8820"], veiculo_descricao: "Mercedes Actros", qtd_veiculos: 1 },
  { id: "4", numero: 2045, data_emissao: "2026-05-29", competencia: "2026-05-01", item_lista_servico: "14.01", discriminacao: "Pacote manutenção descarbonização | 5 # Pedido 8801", outras_informacoes: "Pedido: 8801", valor_servicos: 7800, iss_retido: true, tomador_cpf_cnpj: "33.111.222/0001-55", tomador_razao_social: "Logística Sul Cargas Ltda", tomador_uf: "RS", tomador_cep: "90010-150", pedido_refs: ["8801"], veiculo_descricao: "DAF XF", qtd_veiculos: 5 },
  { id: "5", numero: 2044, data_emissao: "2026-05-22", competencia: "2026-05-01", item_lista_servico: "14.01", discriminacao: "Descarbonização de motor diesel | 2 # Pedido 8790", outras_informacoes: "Pedido: 8790", valor_servicos: 3100, iss_retido: false, tomador_cpf_cnpj: "77.888.999/0001-22", tomador_razao_social: "Frota Minas Transportes", tomador_uf: "MG", tomador_cep: "30140-071", pedido_refs: ["8790"], veiculo_descricao: "Iveco Stralis", qtd_veiculos: 2 },
  { id: "6", numero: 2043, data_emissao: "2026-05-15", competencia: "2026-05-01", item_lista_servico: "14.01", discriminacao: "Serviço avulso de descarbonização | 1", outras_informacoes: "", valor_servicos: 980, iss_retido: false, tomador_cpf_cnpj: "123.456.789-00", tomador_razao_social: "Carlos Eduardo Souza", tomador_uf: "SP", tomador_cep: "04567-000", pedido_refs: [], veiculo_descricao: null, qtd_veiculos: null },
];

// ─── Stats MOCK equivalente a calcNFSeStats ─────────────────────────────────────
function calcStats(records: NFSeMock[]) {
  const total = records.reduce((s, r) => s + r.valor_servicos, 0);
  const count = records.length;
  const ticket = count > 0 ? total / count : 0;
  const retidoCount = records.filter((r) => r.iss_retido).length;
  const byMonth: Record<string, { count: number; total: number }> = {};
  for (const r of records) {
    const key = r.data_emissao.slice(0, 7);
    if (!byMonth[key]) byMonth[key] = { count: 0, total: 0 };
    byMonth[key].count++;
    byMonth[key].total += r.valor_servicos;
  }
  const byUF: Record<string, { count: number; total: number }> = {};
  for (const r of records) {
    const key = r.tomador_uf || "N/A";
    if (!byUF[key]) byUF[key] = { count: 0, total: 0 };
    byUF[key].count++;
    byUF[key].total += r.valor_servicos;
  }
  return { total, count, ticket, retidoCount, byMonth, byUF };
}

const fmtBRL = (v: number) =>
  v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
function fmtDate(iso: string | null) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return d && m && y ? `${d}/${m}/${y}` : iso;
}

const soon = () => toast.info("Disponível na fase de lógica");

function Kpi({ icon: Icon, label, value, color, bg }: {
  icon: typeof Hash; label: string; value: string; color: string; bg: string;
}) {
  return (
    <CarboCard variant="kpi" padding="sm"><CarboCardContent>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-lg font-bold tabular-nums mt-0.5 leading-none">{value}</p>
        </div>
        <div className={`flex h-8 w-8 items-center justify-center rounded-lg flex-shrink-0 ${bg}`}>
          <Icon className={`h-4 w-4 ${color}`} />
        </div>
      </div>
    </CarboCardContent></CarboCard>
  );
}

export default function NFSe() {
  const [filters, setFilters] = useState({ from: "", to: "", uf: "", search: "" });
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const records = useMemo(() => MOCK_NFSE.filter((r) => {
    if (filters.from && r.data_emissao < filters.from) return false;
    if (filters.to && r.data_emissao > filters.to) return false;
    if (filters.uf && r.tomador_uf !== filters.uf) return false;
    if (filters.search) {
      const q = filters.search.toLowerCase();
      if (!r.tomador_razao_social.toLowerCase().includes(q) && !r.tomador_cpf_cnpj.includes(q)) return false;
    }
    return true;
  }), [filters]);

  const stats = useMemo(() => calcStats(records), [records]);
  const hasFilter = filters.from || filters.to || filters.uf || filters.search;

  return (
    <div className="p-4 md:p-6">
      <div className="space-y-5 max-w-[1500px] mx-auto">
        <CarboPageHeader
          title="Notas Fiscais de Serviço (NFSe)"
          description="Importe XMLs ABRASF 2.01 emitidos pela Carbo e analise o dashboard CarboVapt"
          icon={FileText}
        />

        <Tabs defaultValue="upload">
          <TabsList>
            <TabsTrigger value="upload" className="gap-2">
              <Upload className="h-4 w-4" /> Upload NFS-e
            </TabsTrigger>
            <TabsTrigger value="database" className="gap-2">
              <BarChart3 className="h-4 w-4" /> Base de Dados
              <CarboBadge variant="secondary" size="sm">{MOCK_NFSE.length}</CarboBadge>
            </TabsTrigger>
          </TabsList>

          {/* ── ABA UPLOAD ──────────────────────────────────────────────── */}
          <TabsContent value="upload" className="mt-5 space-y-5">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              {/* Dropzone (visual apenas) */}
              <div className="lg:col-span-2 space-y-4">
                <div
                  onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={(e) => { e.preventDefault(); setIsDragging(false); soon(); }}
                  onClick={soon}
                  className={`relative flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-8 py-14 text-center cursor-pointer transition-all ${
                    isDragging ? "border-primary bg-primary/5 scale-[1.01]" : "border-muted-foreground/20 hover:border-primary/40 hover:bg-muted/30"
                  }`}
                >
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
                    <Upload className="h-7 w-7 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">Arraste XMLs ou um arquivo ZIP aqui</p>
                    <p className="text-xs text-muted-foreground mt-1">ou clique para selecionar do computador</p>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <CarboBadge variant="outline" size="sm"><FileText className="h-3 w-3 mr-1" /> .xml</CarboBadge>
                    <CarboBadge variant="outline" size="sm"><FileArchive className="h-3 w-3 mr-1" /> .zip</CarboBadge>
                  </div>
                </div>

                <Button onClick={soon} className="gap-2 w-full sm:w-auto">
                  <CheckCircle2 className="h-4 w-4" /> Importar NFS-e
                </Button>
              </div>

              {/* Sidebar de instruções */}
              <div className="space-y-4">
                <CarboCard className="bg-muted/30"><CarboCardContent>
                  <p className="text-sm font-semibold flex items-center gap-2 mb-3">
                    <FileText className="h-4 w-4 text-primary" /> Formatos suportados
                  </p>
                  <div className="text-xs text-muted-foreground space-y-2">
                    <div className="flex items-start gap-2">
                      <FileArchive className="h-3.5 w-3.5 flex-shrink-0 mt-0.5 text-warning" />
                      <span><strong className="text-foreground">ZIP</strong> — com todos os XMLs dentro (recomendado)</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <FileText className="h-3.5 w-3.5 flex-shrink-0 mt-0.5 text-info" />
                      <span><strong className="text-foreground">XML</strong> — múltiplos arquivos individuais</span>
                    </div>
                    <Separator className="my-2" />
                    <p>Padrão: <strong className="text-foreground">ABRASF 2.01</strong></p>
                    <p>Emitente: <strong className="text-foreground">Carbo Soluções Ltda</strong></p>
                    <p>Duplicatas são ignoradas automaticamente pelo número da NF.</p>
                  </div>
                </CarboCardContent></CarboCard>

                <CarboCard className="bg-muted/30"><CarboCardContent>
                  <p className="text-sm font-semibold flex items-center gap-2 mb-3">
                    <Database className="h-4 w-4 text-primary" /> Dados extraídos
                  </p>
                  <div className="text-xs text-muted-foreground space-y-1.5">
                    {[
                      "Número e data de emissão",
                      "Tomador (CNPJ/CPF, nome, UF)",
                      "Valor dos serviços e tributos",
                      "Veículo e qtd (da Discriminação)",
                      "Referência de pedidos internos",
                    ].map((item) => (
                      <div key={item} className="flex items-center gap-2">
                        <CheckCircle2 className="h-3 w-3 text-primary flex-shrink-0" />
                        <span>{item}</span>
                      </div>
                    ))}
                  </div>
                </CarboCardContent></CarboCard>
              </div>
            </div>
          </TabsContent>

          {/* ── ABA BASE DE DADOS ───────────────────────────────────────── */}
          <TabsContent value="database" className="mt-5 space-y-5">
            {/* KPIs */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Kpi icon={Hash} label="Total NFs" value={stats.count.toLocaleString("pt-BR")} color="text-info" bg="bg-info/10" />
              <Kpi icon={TrendingUp} label="Faturamento Total" value={`R$ ${fmtBRL(stats.total)}`} color="text-success" bg="bg-success/10" />
              <Kpi icon={Receipt} label="Ticket Médio" value={`R$ ${fmtBRL(stats.ticket)}`} color="text-warning" bg="bg-warning/10" />
              <Kpi icon={CalendarDays} label="Com ISS Retido" value={stats.retidoCount.toLocaleString("pt-BR")} color="text-carbo-green" bg="bg-carbo-green/10" />
            </div>

            {/* Filtros */}
            <CarboCard><CarboCardContent>
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1 text-xs text-muted-foreground font-medium">
                  <Search className="h-3.5 w-3.5" /> Filtros:
                </div>
                <Input type="date" className="h-8 w-36 text-xs" value={filters.from}
                  onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value }))} />
                <span className="text-xs text-muted-foreground">até</span>
                <Input type="date" className="h-8 w-36 text-xs" value={filters.to}
                  onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value }))} />
                <Input className="h-8 w-24 text-xs" placeholder="UF" maxLength={2} value={filters.uf}
                  onChange={(e) => setFilters((f) => ({ ...f, uf: e.target.value.toUpperCase() }))} />
                <div className="relative flex-1 min-w-[160px]">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                  <Input className="h-8 pl-7 text-xs" placeholder="Buscar cliente..." value={filters.search}
                    onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))} />
                </div>
                {hasFilter && (
                  <Button variant="ghost" size="sm" className="h-8 text-xs"
                    onClick={() => setFilters({ from: "", to: "", uf: "", search: "" })}>
                    <X className="h-3 w-3 mr-1" /> Limpar
                  </Button>
                )}
              </div>
            </CarboCardContent></CarboCard>

            {/* Tabela */}
            <div className="rounded-lg border bg-card overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="w-6 px-2 py-2.5"></th>
                    {["#NF", "Data", "Cliente", "UF", "Descrição do Serviço"].map((h) => (
                      <th key={h} className="text-left px-3 py-2.5 font-medium text-muted-foreground whitespace-nowrap">{h}</th>
                    ))}
                    <th className="text-right px-3 py-2.5 font-medium text-muted-foreground">R$ Valor</th>
                    <th className="text-left px-3 py-2.5 font-medium text-muted-foreground">Pedido(s)</th>
                    <th className="text-left px-3 py-2.5 font-medium text-muted-foreground">ISS Retido</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {records.map((r) => (
                    <React.Fragment key={r.id}>
                      <tr className="cursor-pointer hover:bg-muted/30 transition-colors"
                        onClick={() => setExpandedRow(expandedRow === r.id ? null : r.id)}>
                        <td className="px-2 py-2.5 text-muted-foreground">
                          {expandedRow === r.id ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                        </td>
                        <td className="px-3 py-2.5 font-mono font-semibold">{r.numero}</td>
                        <td className="px-3 py-2.5 tabular-nums whitespace-nowrap">{fmtDate(r.data_emissao)}</td>
                        <td className="px-3 py-2.5 max-w-[200px] truncate">{r.tomador_razao_social}</td>
                        <td className="px-3 py-2.5">
                          <CarboBadge variant="secondary" size="sm">{r.tomador_uf}</CarboBadge>
                        </td>
                        <td className="px-3 py-2.5 max-w-[200px]">
                          <span className="truncate block" title={r.discriminacao.split("|")[0]}>
                            {r.discriminacao.split("|")[0].replace(/[#\n]/g, "").trim().slice(0, 60) || "—"}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-success">{fmtBRL(r.valor_servicos)}</td>
                        <td className="px-3 py-2.5 text-muted-foreground">{r.pedido_refs.length ? r.pedido_refs.join(", ") : "—"}</td>
                        <td className="px-3 py-2.5">
                          <CarboBadge variant={r.iss_retido ? "warning" : "secondary"} size="sm">{r.iss_retido ? "Sim" : "Não"}</CarboBadge>
                        </td>
                      </tr>
                      {expandedRow === r.id && (
                        <tr className="bg-muted/10">
                          <td colSpan={9} className="px-5 pb-4 pt-2">
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                              <div><p className="text-muted-foreground mb-0.5">CPF/CNPJ Tomador</p><p className="font-medium">{r.tomador_cpf_cnpj}</p></div>
                              <div><p className="text-muted-foreground mb-0.5">CEP</p><p className="font-medium">{r.tomador_cep}</p></div>
                              <div><p className="text-muted-foreground mb-0.5">Cód. Item Serviço</p><p className="font-medium">{r.item_lista_servico}</p></div>
                              <div><p className="text-muted-foreground mb-0.5">ISS Retido</p><p className="font-medium">{r.iss_retido ? "Sim" : "Não"}</p></div>
                              <div><p className="text-muted-foreground mb-0.5">Qtd. Veículos</p><p className="font-medium">{r.qtd_veiculos ?? "—"}</p></div>
                              <div><p className="text-muted-foreground mb-0.5">Competência</p><p className="font-medium">{fmtDate(r.competencia)}</p></div>
                              <div className="col-span-2 sm:col-span-4">
                                <p className="text-muted-foreground mb-0.5">Discriminação</p>
                                <p className="font-medium whitespace-pre-wrap leading-relaxed">{r.discriminacao}</p>
                              </div>
                              {r.outras_informacoes && (
                                <div className="col-span-2 sm:col-span-4">
                                  <p className="text-muted-foreground mb-0.5">Outras Informações</p>
                                  <p className="font-medium">{r.outras_informacoes}</p>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Resumo por UF */}
            <CarboCard><CarboCardContent>
              <p className="text-sm font-semibold flex items-center gap-2 mb-3">
                <MapPin className="h-4 w-4 text-primary" /> Faturamento por UF
              </p>
              <div className="flex flex-wrap gap-2">
                {Object.entries(stats.byUF).sort(([, a], [, b]) => b.total - a.total).map(([uf, v]) => (
                  <div key={uf} className="flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs">
                    <CarboBadge variant="secondary" size="sm">{uf}</CarboBadge>
                    <span className="font-semibold tabular-nums">R$ {fmtBRL(v.total)}</span>
                    <span className="text-muted-foreground">({v.count})</span>
                  </div>
                ))}
              </div>
            </CarboCardContent></CarboCard>
          </TabsContent>
        </Tabs>

        <p className="text-xs text-muted-foreground text-center">
          Tela em port visual — dados de exemplo. Importação e parsing de NFSe entram na fase de lógica.
        </p>
      </div>
    </div>
  );
}
