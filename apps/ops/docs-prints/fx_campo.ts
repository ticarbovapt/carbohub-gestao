// Fixtures da área "campo" (ver areas.ts): Ordens de Serviço e Agenda de
// visitas (RTM). Tudo FICTÍCIO — nenhum cliente, PDV ou placa é real.
import { PAPEL, U, EU } from "./pessoas";

// ── Datas relativas a hoje, no dia LOCAL ────────────────────────────────────
const pad = (n: number) => String(n).padStart(2, "0");
const chave = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const dia = (off: number) => { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() + off); return chave(d); };
const ts = (off: number, hh: number, mm: number) => {
  const d = new Date(); d.setDate(d.getDate() + off); d.setHours(hh, mm, 0, 0); return d.toISOString();
};
const noon = (off: number) => `${dia(off)}T12:00:00-03:00`;

// ═══ Ordens de Serviço (schema licenciados) ═════════════════════════════════
type Vaga = { porte: string; plate?: string; model?: string; exec?: boolean };
const vagas = (lista: Vaga[]) => lista.map((v, i) => ({
  position: i + 1, plate: v.plate ?? null, model: v.model ?? null, porte: v.porte,
  executed_at: v.exec ? ts(-1, 10, 0) : null, cancelled_at: null,
}));
const rep = (n: number, v: Vaga): Vaga[] => Array.from({ length: n }, () => ({ ...v }));

const os = (
  id: string, num: string, tipo: string, stage: string, cliente: string, quando: string | null,
  vs: Vaga[], venda?: [string, number], fone = "(84) 98800-1100", doc: string | null = null,
) => ({
  id, os_number: num, service_type: tipo, os_stage: stage, customer_name: cliente,
  scheduled_at: quando, priority: 3, title: null, description: null,
  vehicle_plate: null, vehicle_model: null,
  created_at: ts(-12, 9, 0), updated_at: ts(-1, 9, 0),
  sale_order_id: venda ? `ord-${id}` : null, sale_order_number: venda?.[0] ?? null, sale_total: venda?.[1] ?? null,
  customer: { name: cliente, phone: fone, federal_code: doc },
  vehicles: vagas(vs),
});

const serviceOrders = [
  os("os1", "OS-2026-00412", "frota", "em_execucao", "Transportadora Rio Potengi", noon(0),
    [...rep(3, { porte: "M", plate: "RNP-4A12", exec: true }), ...rep(5, { porte: "M" }), { porte: "G" }],
    ["V2026100031", 7000], "(84) 3222-1100", "11.222.333/0001-44"),
  os("os2", "OS-2026-00415", "b2b", "nova", "Construtora Dunas Ltda", noon(3),
    rep(3, { porte: "M" }), ["V2026100044", 2100], "(84) 3333-2200", "22.333.444/0001-55"),
  os("os3", "OS-2026-00416", "b2c", "nova", "Carlos Menezes", noon(1),
    [{ porte: "M", plate: "QWE-1A23", model: "Fiat Strada" }], ["V2026100047", 700]),
  os("os4", "OS-2026-00409", "frota", "nova", "Logística Seridó", noon(-2),
    [...rep(4, { porte: "G" }), ...rep(2, { porte: "M" })], ["V2026100022", 7000], "(84) 3444-3300", "33.444.555/0001-66"),
  os("os5", "OS-2026-00418", "b2c", "nova", "Juliana Freitas", null,
    [{ porte: "M", plate: "JFR-2B34", model: "Honda HR-V" }]),
  os("os6", "OS-2026-00401", "b2b", "concluida", "Auto Peças Parnamirim", noon(-10),
    rep(2, { porte: "M", plate: "APP-0C11", exec: true }), ["V2026100009", 1400], "(84) 3555-4400", "44.555.666/0001-77"),
  os("os7", "OS-2026-00398", "b2c", "concluida", "Fernanda Lopes", noon(-6),
    [{ porte: "M", plate: "FLO-7D89", model: "VW Saveiro", exec: true }], ["V2026100005", 700]),
  os("os8", "OS-2026-00405", "frota", "em_execucao", "Frigorífico Agreste", noon(-1),
    [...rep(2, { porte: "G", plate: "FAG-5E66", exec: true }), ...rep(3, { porte: "G" })], ["V2026100018", 7000], "(84) 3666-5500", "55.666.777/0001-88"),
  os("os9", "OS-2026-00402", "b2c", "cancelada", "Marcos Tavares", noon(5),
    [{ porte: "M", plate: "MTV-3F21", model: "Chevrolet Onix" }], ["V2026100011", 700]),
];

// ═══ RTM — Agenda de visitas ═══════════════════════════════════════════════
const pdv = (id: string, nome: string, rua: string, cidade: string, contato: string, fone: string) =>
  ({ id, nome, rua, cidade, contato, fone });
const P = {
  lagoa: pdv("pdv1", "Posto Lagoa Nova", "Av. Salgado Filho, 1200", "Natal", "Sr. Antônio (gerente)", "(84) 98111-2201"),
  verde: pdv("pdv2", "Auto Posto Cidade Verde", "Av. Ayrton Senna, 455", "Parnamirim", "Dona Célia (proprietária)", "(84) 98111-2202"),
  sol: pdv("pdv3", "Posto Rota do Sol", "Rod. RN-063, km 4", "Nísia Floresta", "Jorge (gerente)", "(84) 98111-2203"),
  rita: pdv("pdv4", "Posto Santa Rita", "Rua Santa Rita, 88", "Extremoz", "Paulo (frentista líder)", "(84) 98111-2204"),
  serra: pdv("pdv5", "Posto Serra do Mel", "BR-304, km 12", "Macaíba", "Luciana (gerente)", "(84) 98111-2205"),
  bela: pdv("pdv6", "Posto Bela Vista", "Av. Maria Lacerda, 900", "Parnamirim", "Ricardo (dono)", "(84) 98111-2206"),
  trevo: pdv("pdv7", "Posto Trevo de Macaíba", "Av. Mons. Honório, 30", "Macaíba", "Sônia (gerente)", "(84) 98111-2207"),
  prudente: pdv("pdv8", "Posto Avenida Prudente", "Av. Prudente de Morais, 3100", "Natal", "Wagner (gerente)", "(84) 98111-2208"),
};

let k = 0;
const ag = (p: typeof P.lagoa, vend: typeof U.colab, off: number, situacao: string, extra: Record<string, unknown> = {}) => ({
  planejada_id: `pl${++k}`, data_prevista: dia(off), ordem: k, status_plano: situacao === "cancelada" ? "cancelada" : "planejada",
  origem: "manual", observacao: null, cancelamento_motivo: null,
  vendedor_id: vend.id, vendedor_nome: vend.full_name,
  pdv_id: p.id, pdv_nome: p.nome, pdv_code: `PDV-${p.id.slice(3).padStart(4, "0")}`,
  endereco: p.rua, cidade: p.cidade, uf: "RN", contact_name: p.contato, contact_phone: p.fone,
  pdv_lat: null, pdv_lng: null,
  visita_id: null, ts_checkin: null, ts_checkout: null, resultado: null,
  situacao, criado_por: vend.id, criado_por_nome: vend.full_name, agendado_em: ts(off - 3, 17, 0),
  ...extra,
});

const agenda = [
  // ── Rafael (colaborador) ──
  ag(P.serra, U.colab, -2, "nao_cumprida"),
  ag(P.prudente, U.colab, -1, "concluida", { visita_id: "vis0", ts_checkin: ts(-1, 9, 10), ts_checkout: ts(-1, 9, 40), resultado: "pedido" }),
  ag(P.lagoa, U.colab, 0, "concluida", { visita_id: "vis1", ts_checkin: ts(0, 8, 40), ts_checkout: ts(0, 9, 5), resultado: "pedido" }),
  ag(P.verde, U.colab, 0, "pendente", { observacao: "Levar o wobbler novo e falar com a proprietária sobre o kit de 5.", criado_por: U.gestor.id, criado_por_nome: U.gestor.full_name }),
  ag(P.sol, U.colab, 0, "pendente"),
  ag(P.rita, U.colab, 0, "cancelada", { cancelamento_motivo: "Gerente pediu para remarcar para quinta." }),
  ag(P.bela, U.colab, 1, "pendente"),
  ag(P.trevo, U.colab, 1, "pendente"),
  ag(P.serra, U.colab, 2, "pendente", { observacao: "Retorno da visita perdida." }),
  // ── Ana Souza (outra vendedora — só o gestor vê) ──
  ag(P.prudente, U.vend2, 0, "concluida", { visita_id: "vis2", ts_checkin: ts(0, 8, 15), ts_checkout: ts(0, 8, 50), resultado: "sem_pedido" }),
  ag(P.trevo, U.vend2, 0, "pendente"),
  ag(P.bela, U.vend2, -3, "nao_cumprida"),
  ag(P.lagoa, U.vend2, 2, "pendente"),
];

// A carga do calendário: uma linha por (dia, vendedor), na grade do mês.
const agendaDia = (() => {
  const out: Record<string, unknown>[] = [];
  for (let off = -40; off <= 40; off++) {
    const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() + off);
    if (d.getDay() === 0) continue;                         // domingo sem roteiro
    for (const [vi, v] of [U.colab, U.vend2].entries()) {
      const plan = 2 + ((d.getDate() + vi * 2) % 3);
      const r = { planejadas: plan, pendentes: 0, em_andamento: 0, concluidas: 0, nao_cumpridas: 0, canceladas: 0 };
      if (off < 0) {
        r.nao_cumpridas = (d.getDate() + vi) % 4 === 0 ? 1 : 0;
        r.canceladas = (d.getDate() + vi) % 7 === 0 ? 1 : 0;
        r.concluidas = plan - r.nao_cumpridas - r.canceladas;
      } else if (off === 0) {
        Object.assign(r, vi === 0 ? { planejadas: 4, concluidas: 1, pendentes: 2, canceladas: 1 } : { planejadas: 2, concluidas: 1, pendentes: 1 });
      } else r.pendentes = plan;
      out.push({ data_prevista: chave(d), vendedor_id: v.id, ...r });
    }
  }
  return out;
})();

const checklist = [
  { id: "ck1", codigo: "expositor", label: "Expositor do CarboZé à vista do cliente?", ajuda: "Na pista ou no caixa, onde o motorista vê.", tipo: "sim_nao", obrigatorio: true, nao_e_problema: false, ordem: 1, ativo: true },
  { id: "ck2", codigo: "preco", label: "Preço exposto no produto?", ajuda: null, tipo: "sim_nao", obrigatorio: true, nao_e_problema: false, ordem: 2, ativo: true },
  { id: "ck3", codigo: "material", label: "Material de PDV (wobbler, cartaz) no lugar?", ajuda: null, tipo: "sim_nao_na", obrigatorio: false, nao_e_problema: false, ordem: 3, ativo: true },
  { id: "ck4", codigo: "frentista", label: "O frentista sabe oferecer o CarboZé?", ajuda: "Pergunte a um frentista como ele apresenta o produto.", tipo: "sim_nao", obrigatorio: true, nao_e_problema: false, ordem: 4, ativo: true },
  { id: "ck5", codigo: "estoque", label: "Unidades no estoque do posto", ajuda: "Conte o que está no depósito, fora da gôndola.", tipo: "numero", obrigatorio: false, nao_e_problema: false, ordem: 5, ativo: true },
];
const motivos = [
  { id: "mo1", label: "Ainda tem estoque", ordem: 1, exige_texto: false, ativo: true },
  { id: "mo2", label: "Decisor ausente", ordem: 2, exige_texto: false, ativo: true },
  { id: "mo3", label: "Achou o preço alto", ordem: 3, exige_texto: false, ativo: true },
  { id: "mo4", label: "Produto sem giro no posto", ordem: 4, exige_texto: false, ativo: true },
  { id: "mo5", label: "Outro", ordem: 5, exige_texto: true, ativo: true },
];



export const FX: Record<string, unknown> = {
  service_orders: serviceOrders,
  rtm_agenda: agenda,
  rtm_agenda_dia: agendaDia,
  rtm_checklist_itens: checklist,
  rtm_motivos: motivos,
  rtm_visita_card: [],
  rtm_visita_fotos: [],
  // ⚠️ carbo_pdvs_painel vem do fx_comercial (Pontos de Venda): o "Agendar"
  // usa a MESMA lista.
};

export const RPC_FX: Record<string, unknown> = {
  crm_descarb_vendas_sem_os: [
    { order_id: "ord-semos", order_number: "V2026100052", customer_name: "Locadora Cabo Branco", vendedor_name: U.colab.full_name,
      valor_descarb: 2800, sale_date: dia(-1), execution_date: dia(4) },
  ],
  os_find_customer: null,
  rtm_abrir_visita: (a: Record<string, unknown>) => ({ id: `vis-${String(a.p_client_uuid ?? "x").slice(0, 8)}`, ts_checkout: null }),
  rtm_fechar_visita: null,
  carbo_team_members: () => (PAPEL === "gestor" ? [U.colab, U.vend2, U.closer] : [EU]),
};
