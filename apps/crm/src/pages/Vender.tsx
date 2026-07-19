import { useEffect, useMemo, useState } from "react";
import { useNavigate, useLocation, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Mail } from "lucide-react";
import { UserCog, Users } from "lucide-react";
import {
  ShoppingCart, Plus, Trash2, Building2, MapPin, Package, Gift, FileText, Search, Target, ChevronDown,
  Loader2, CheckCircle2, AlertCircle, CreditCard, Percent, Tag, CalendarClock,
} from "lucide-react";
import { CarboCard, CarboCardContent } from "@/components/ui/carbo-card";
import { CarboButton } from "@/components/ui/carbo-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { ptBR } from "date-fns/locale";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { generateQuotePdf } from "@/lib/quotePdf";
import { useCreateVenda, useUpdateVendaFull } from "@/hooks/useVendas";
import { useConvertQuote } from "@/hooks/useCarbozeVendas";
import { useProdutos } from "@/hooks/useProdutos";
import { useDiscountTiersPublic } from "@/hooks/useDiscountTiers";
import { computeLineDiscount, resolveTier } from "@/lib/discount";
import { usePrazoConfigPublic } from "@/hooks/usePrazoConfig";
import { computePrazos } from "@/lib/prazos";
import { validateInscricaoEstadual } from "@/lib/inscricaoEstadual";
import { useGeocode } from "@/hooks/useGeocode";
import { MapContainer, TileLayer, CircleMarker, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";

// Vender — grava a venda de verdade (carboze_orders) e lê o catálogo real (mrp_products).
// Tela ÚNICA e IDÊNTICA em todos os apps (sales/crm, ops, finance, admin): a do
// sales/crm é a referência. Gestor pode lançar por outro vendedor; os Dados
// Estratégicos e Notas Internas são gravados em internal_notes (nada é descartado).

const TIPOS_PONTO = ["Posto", "Oficina", "Frota", "PDV", "Licenciado"];
const CLASSIFICACOES = ["Estratégico", "Potencial", "Regular"];
const UFS = ["AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"];

const brl = (n: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);
// Data local (yyyy-mm-dd) para o <input type="date"> e formatação pt-BR.
const toISO = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const fmtBr = (d: Date) => d.toLocaleDateString("pt-BR");

interface ItemRow {
  id: string; productId: string; qty: number; unitPrice: number; hasBonus: boolean; bonusQty: number;
  // Desconto POR ITEM: toggle % ou R$ e o valor digitado naquela linha.
  discType: "percent" | "value"; discValue: number;
}
const emptyRow = (): ItemRow => ({ id: crypto.randomUUID(), productId: "", qty: 1, unitPrice: 0, hasBonus: false, bonusQty: 0, discType: "percent", discValue: 0 });

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

// Cabeçalho clicável de seção opcional (recolhível).
function CollapsibleCard({
  title, icon: Icon, open, onToggle, children,
}: { title: string; icon: React.ElementType; open: boolean; onToggle: () => void; children: React.ReactNode }) {
  return (
    <CarboCard>
      <CarboCardContent className="p-4">
        <button onClick={onToggle} className="w-full flex items-center justify-between">
          <h3 className="font-semibold flex items-center gap-2">
            <Icon className="h-4 w-4 text-carbo-green" /> {title}
            <span className="text-xs text-muted-foreground font-normal">(opcional)</span>
          </h3>
          <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
        {open && <div className="mt-4 space-y-3">{children}</div>}
      </CarboCardContent>
    </CarboCard>
  );
}

export default function Vender() {
  const navigate = useNavigate();
  const location = useLocation();
  const { profile, gestor } = useAuth();
  const vendedorLogado = profile?.full_name ?? profile?.username ?? "";
  const createVenda = useCreateVenda();
  const updateVenda = useUpdateVendaFull();
  const convertQuote = useConvertQuote();
  const [searchParams] = useSearchParams();
  const editId = searchParams.get("edit");
  const { data: produtos = [] } = useProdutos();

  // Modo edição: carrega o pedido cru (com o snapshot do formulário) para reabrir.
  const { data: editOrder } = useQuery({
    queryKey: ["vender_edit", editId],
    enabled: !!editId,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("carboze_orders").select("*").eq("id", editId).maybeSingle();
      if (error) throw error;
      return data as Record<string, any> | null;
    },
  });
  const [hydrated, setHydrated] = useState(false);
  const editNumero = (editOrder?.order_number as string | null) ?? null;
  // Lista de vendedores (só pra gestor poder lançar por outro).
  const { data: vendedores = [] } = useQuery({
    queryKey: ["all_profiles_vender"],
    enabled: gestor,
    queryFn: async () => {
      const { data } = await (supabase as any).rpc("carbo_all_profiles");
      return (data ?? []) as { id: string; full_name: string | null }[];
    },
  });

  const [mode, setMode] = useState<"venda" | "promo">("venda");
  const [doc, setDoc] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [isLicenciado, setIsLicenciado] = useState(false);
  const [rows, setRows] = useState<ItemRow[]>([emptyRow()]);
  const [obsPublica, setObsPublica] = useState("");
  const [notasInternas, setNotasInternas] = useState("");
  const [tipoPonto, setTipoPonto] = useState("");
  const [classificacao, setClassificacao] = useState("");
  const [volumeMedio, setVolumeMedio] = useState("");
  const [atuaDiesel, setAtuaDiesel] = useState(false);
  const [atuaFrotas, setAtuaFrotas] = useState(false);
  const [vendedorId, setVendedorId] = useState<string>(""); // "" = usuário logado
  // Vendedor efetivo: se o gestor escolheu outro, usa o nome dele; senão o logado.
  // (declarado APÓS o useState de vendedorId — senão daria ReferenceError/TDZ.)
  const vendedor = vendedorId ? (vendedores.find((v) => v.id === vendedorId)?.full_name ?? vendedorLogado) : vendedorLogado;
  const [showEstrategicos, setShowEstrategicos] = useState(false);
  const [showObs, setShowObs] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [emailing, setEmailing] = useState(false);
  const [buscando, setBuscando] = useState(false);
  const [docFeedback, setDocFeedback] = useState<{ kind: "ok" | "err"; msg: string } | null>(null);
  const [endereco, setEndereco] = useState({ logradouro: "", numero: "", bairro: "", cidade: "", uf: "", cep: "" });
  const setEnd = (patch: Partial<typeof endereco>) => setEndereco((e) => ({ ...e, ...patch }));
  // Faturamento (NF): o endereço da empresa (CNPJ) pode diferir do de entrega.
  const [fatMesmo, setFatMesmo] = useState(true);
  const [fatEndereco, setFatEndereco] = useState({ logradouro: "", numero: "", bairro: "", cidade: "", uf: "", cep: "" });
  const setFat = (patch: Partial<typeof fatEndereco>) => setFatEndereco((e) => ({ ...e, ...patch }));
  const [ie, setIe] = useState("");
  const [ieUf, setIeUf] = useState(""); // override da UF p/ validar a IE; vazio = usa a do endereço
  const isIsento = /^isento$/i.test(ie.trim());
  const ieUfEff = ieUf || endereco.uf || "";
  const ieResult = ie && !isIsento ? validateInscricaoEstadual(ie, ieUfEff) : null;
  const { geocodeAddress, isLoading: geoLoading } = useGeocode();
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);

  // ── Forma de pagamento (obrigatória) ──
  const [pagModalidade, setPagModalidade] = useState("");      // pix | boleto_avista | boleto_faturado | debito | credito
  const [pagParcelas, setPagParcelas] = useState("1");          // 1..12 (crédito)
  const [pagFaturamento, setPagFaturamento] = useState("");     // ex.: 30/60/90 (boleto faturado)

  // ── Desconto POR ITEM (cada linha tem o seu) + alçada pela % AGREGADA do pedido ──
  // Motivo único do desconto (só aparece quando há desconto) — alimenta a alçada.
  const [discReason, setDiscReason] = useState("");
  const { data: discountCfg = { enabled: false, tiers: [] } } = useDiscountTiersPublic();

  // ── Prazo de entrega + PPF/PPE (opcional; banco recalcula de forma autoritativa) ──
  const [deliveryDate, setDeliveryDate] = useState("");
  const [dateOpen, setDateOpen] = useState(false);
  const { data: prazoCfg = { enabled: false, minBusinessDays: 3, shipOffsetDays: 1 } } = usePrazoConfigPublic();
  const prazos = useMemo(
    () => (deliveryDate ? computePrazos(new Date(), new Date(deliveryDate + "T00:00:00"), prazoCfg) : null),
    [deliveryDate, prazoCfg],
  );
  const pagamentoLabel = useMemo(() => {
    switch (pagModalidade) {
      case "pix": return "PIX";
      case "boleto_avista": return "Boleto à vista";
      case "boleto_faturado": return pagFaturamento.trim() ? `Boleto faturado (${pagFaturamento.trim()})` : "Boleto faturado";
      case "debito": return "Cartão de débito";
      case "credito": return `Cartão de crédito ${pagParcelas}x`;
      default: return "";
    }
  }, [pagModalidade, pagParcelas, pagFaturamento]);
  const pagamentoValido = pagModalidade !== "" && !(pagModalidade === "boleto_faturado" && !pagFaturamento.trim());

  // Prefill quando vem de um lead (Tunnel do CRM). Não acopla — venda direta segue normal.
  useEffect(() => {
    const fl = (location.state as { fromLead?: { name?: string; cnpj?: string; phone?: string; email?: string; city?: string; state?: string; address?: string; bairro?: string } } | null)?.fromLead;
    if (!fl) return;
    if (fl.name) setCustomerName(fl.name);
    if (fl.cnpj) setDoc(fl.cnpj);
    if (fl.phone) setPhone(fl.phone);
    if (fl.email) setEmail(fl.email);
    setEndereco((e) => ({ ...e, logradouro: fl.address || e.logradouro, bairro: fl.bairro || e.bairro, cidade: fl.city || e.cidade, uf: fl.state || e.uf }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [mapMsg, setMapMsg] = useState<string | null>(null);

  // Localiza a posição aproximada do endereço no mapa (para conferência visual).
  async function localizarNoMapa() {
    setMapMsg(null);
    if (!endereco.cidade || !endereco.uf) {
      setMapMsg("Preencha ao menos Cidade e Estado para localizar no mapa.");
      return;
    }
    const addr = [endereco.logradouro, endereco.numero].filter(Boolean).join(", ");
    const geo = await geocodeAddress(addr, endereco.cidade, endereco.uf);
    if (geo) { setCoords({ lat: geo.lat, lng: geo.lng }); }
    else { setCoords(null); setMapMsg("Não foi possível localizar este endereço. Confira os dados."); }
  }

  // Totais do pedido a partir do desconto POR ITEM:
  // subtotalBruto = Σ brutos · descontoTotal = Σ descontos de linha · total = líquido.
  // percentAgregado = descontoTotal / subtotalBruto × 100 (é o que alimenta a alçada).
  const { subtotalBruto, descontoTotal, total, percentAgregado } = useMemo(() => {
    let bruto = 0, desc = 0;
    for (const r of rows) {
      const g = r.qty * r.unitPrice;
      const line = computeLineDiscount(g, { type: r.discType, value: r.discValue });
      bruto += g;
      desc += line.amount;
    }
    bruto = round2(bruto);
    desc = round2(desc);
    return {
      subtotalBruto: bruto,
      descontoTotal: desc,
      total: round2(Math.max(0, bruto - desc)),
      percentAgregado: bruto > 0 ? round2((desc / bruto) * 100) : 0,
    };
  }, [rows]);
  const discTier = useMemo(() => resolveTier(percentAgregado, discountCfg), [percentAgregado, discountCfg]);

  // Formata CPF (≤11 díg.) ou CNPJ (12+).
  function formatDoc(v: string) {
    const d = v.replace(/\D/g, "").slice(0, 14);
    if (d.length <= 11) {
      if (d.length <= 3) return d;
      if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
      if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
      return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
    }
    return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  }
  // Validação de CPF (dígitos verificadores).
  function isValidCpf(cpf: string) {
    const d = cpf.replace(/\D/g, "");
    if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
    const calc = (len: number) => {
      let sum = 0;
      for (let i = 0; i < len; i++) sum += parseInt(d[i]) * (len + 1 - i);
      const r = (sum * 10) % 11;
      return r === 10 ? 0 : r;
    };
    return calc(9) === parseInt(d[9]) && calc(10) === parseInt(d[10]);
  }
  // CPF → valida (manual); CNPJ → busca na BrasilAPI e auto-preenche cliente + endereço.
  async function handleBuscarDoc() {
    const digits = doc.replace(/\D/g, "");
    setDocFeedback(null);
    if (digits.length === 11) {
      if (!isValidCpf(digits)) { setDocFeedback({ kind: "err", msg: "CPF inválido. Verifique os números." }); return; }
      setDocFeedback({ kind: "ok", msg: "CPF válido — preencha os dados do cliente abaixo." });
      return;
    }
    if (digits.length !== 14) { setDocFeedback({ kind: "err", msg: "Digite um CPF (11 dígitos) ou CNPJ (14 dígitos)." }); return; }
    setBuscando(true);
    try {
      const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${digits}`, { signal: AbortSignal.timeout(10000) });
      if (res.status === 404) { setDocFeedback({ kind: "err", msg: "CNPJ não encontrado na Receita Federal. Verifique o número ou preencha manualmente." }); return; }
      if (!res.ok) throw new Error(`Erro ${res.status}`);
      const raw = await res.json();
      setCustomerName(raw.nome_fantasia || raw.razao_social || "");
      if (raw.email) setEmail(raw.email);
      const tel = raw.ddd_telefone_1 || raw.ddd_telefone_2;
      if (tel) setPhone(String(tel));
      setEndereco({
        logradouro: [raw.logradouro, raw.complemento].filter(Boolean).join(", "),
        numero: raw.numero || "",
        bairro: raw.bairro || "",
        cidade: raw.municipio || "",
        uf: raw.uf || "",
        cep: (raw.cep || "").replace(/\D/g, ""),
      });
      setDocFeedback({ kind: "ok", msg: "Dados do CNPJ carregados com sucesso!" });
      // Localiza no mapa automaticamente após o CNPJ.
      if (raw.municipio && raw.uf) {
        const geo = await geocodeAddress([raw.logradouro, raw.numero].filter(Boolean).join(", "), raw.municipio, raw.uf);
        if (geo) { setCoords({ lat: geo.lat, lng: geo.lng }); setMapMsg(null); }
      }
    } catch (err) {
      const name = (err as { name?: string }).name;
      setDocFeedback({ kind: "err", msg: name === "TimeoutError" || name === "AbortError"
        ? "Tempo esgotado na consulta. Tente de novo ou preencha manualmente."
        : "Serviço de consulta indisponível. Preencha os dados manualmente." });
    } finally { setBuscando(false); }
  }

  function updateRow(id: string, patch: Partial<ItemRow>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }
  function onProduct(id: string, productId: string) {
    // O catálogo (mrp_products) não tem preço de venda; o vendedor informa o preço.
    updateRow(id, { productId });
  }
  const validItems = () =>
    rows.filter((r) => r.productId && r.qty > 0).map((r) => {
      const prod = produtos.find((p) => p.id === r.productId);
      const bruto = r.qty * r.unitPrice;
      const line = computeLineDiscount(bruto, { type: r.discType, value: r.discValue });
      return {
        name: prod?.name ?? "Produto",
        product_id: r.productId,
        product_code: prod?.product_code ?? null,
        quantity: r.qty, unit_price: r.unitPrice, bonus_quantity: r.hasBonus ? r.bonusQty : 0,
        // Desconto da linha: tipo, valor digitado, R$ abatido e total já líquido.
        discount_type: line.amount > 0 ? r.discType : "none",
        discount_value: r.discValue,
        discount_amount: line.amount,
        total: line.net,
      };
    });

  // Junta notas internas + dados estratégicos num bloco (coluna internal_notes),
  // pra nada ser digitado e descartado.
  function buildInternalNotes(): string | undefined {
    const temEstrategico = tipoPonto || classificacao || volumeMedio || atuaDiesel || atuaFrotas;
    const estrategico = temEstrategico
      ? "[Estratégico] " + [
          tipoPonto && `Tipo de ponto: ${tipoPonto}`,
          classificacao && `Classificação: ${classificacao}`,
          volumeMedio && `Volume médio/mês: ${volumeMedio}`,
          `Diesel: ${atuaDiesel ? "sim" : "não"}`,
          `Frotas: ${atuaFrotas ? "sim" : "não"}`,
        ].filter(Boolean).join(" · ")
      : "";
    return [notasInternas.trim(), estrategico].filter(Boolean).join("\n") || undefined;
  }

  // ── Snapshot do formulário: grava tudo (JSON) e reidrata fielmente na edição ──
  type FormSnapshot = {
    mode: "venda" | "promo"; doc: string; customerName: string; email: string; phone: string; isLicenciado: boolean;
    rows: ItemRow[]; obsPublica: string; notasInternas: string; tipoPonto: string; classificacao: string;
    volumeMedio: string; atuaDiesel: boolean; atuaFrotas: boolean; vendedorId: string;
    endereco: typeof endereco; fatMesmo: boolean; fatEndereco: typeof fatEndereco;
    ie: string; ieUf: string; pagModalidade: string; pagParcelas: string; pagFaturamento: string;
    discReason: string; deliveryDate: string;
  };
  function formSnapshot(): FormSnapshot {
    return {
      mode, doc, customerName, email, phone, isLicenciado, rows, obsPublica, notasInternas,
      tipoPonto, classificacao, volumeMedio, atuaDiesel, atuaFrotas, vendedorId, endereco, fatMesmo,
      fatEndereco, ie, ieUf, pagModalidade, pagParcelas, pagFaturamento, discReason, deliveryDate,
    };
  }

  // Reidrata o formulário ao abrir em modo edição (?edit=<id>).
  useEffect(() => {
    if (!editOrder || hydrated) return;
    const snap = editOrder.quote_form_snapshot as FormSnapshot | null;
    if (snap && typeof snap === "object") {
      setMode(snap.mode ?? "venda"); setDoc(snap.doc ?? ""); setCustomerName(snap.customerName ?? "");
      setEmail(snap.email ?? ""); setPhone(snap.phone ?? ""); setIsLicenciado(!!snap.isLicenciado);
      setRows(Array.isArray(snap.rows) && snap.rows.length ? snap.rows : [emptyRow()]);
      setObsPublica(snap.obsPublica ?? ""); setNotasInternas(snap.notasInternas ?? "");
      setTipoPonto(snap.tipoPonto ?? ""); setClassificacao(snap.classificacao ?? ""); setVolumeMedio(snap.volumeMedio ?? "");
      setAtuaDiesel(!!snap.atuaDiesel); setAtuaFrotas(!!snap.atuaFrotas); setVendedorId(snap.vendedorId ?? "");
      if (snap.endereco) setEndereco(snap.endereco);
      setFatMesmo(snap.fatMesmo ?? true); if (snap.fatEndereco) setFatEndereco(snap.fatEndereco);
      setIe(snap.ie ?? ""); setIeUf(snap.ieUf ?? "");
      setPagModalidade(snap.pagModalidade ?? ""); setPagParcelas(snap.pagParcelas ?? "1"); setPagFaturamento(snap.pagFaturamento ?? "");
      setDiscReason(snap.discReason ?? ""); setDeliveryDate(snap.deliveryDate ?? "");
      if (snap.tipoPonto || snap.classificacao || snap.volumeMedio || snap.atuaDiesel || snap.atuaFrotas) setShowEstrategicos(true);
      if (snap.obsPublica || snap.notasInternas) setShowObs(true);
    } else {
      // Best-effort (orçamento antigo, sem snapshot) — restaura o que dá pelas colunas.
      setCustomerName(editOrder.customer_name ?? ""); setDoc(editOrder.cnpj ?? "");
      setEmail(editOrder.customer_email ?? ""); setPhone(editOrder.customer_phone ?? ""); setIe(editOrder.customer_ie ?? "");
      const items = Array.isArray(editOrder.items) ? editOrder.items : [];
      setRows(items.length ? items.map((it: any) => ({
        id: crypto.randomUUID(), productId: it.product_id ?? "", qty: it.quantity ?? 1, unitPrice: it.unit_price ?? 0,
        hasBonus: (it.bonificacao ?? 0) > 0, bonusQty: it.bonificacao ?? 0,
        discType: it.discount_type === "percent" ? "percent" : "value", discValue: it.discount_value ?? 0,
      })) : [emptyRow()]);
      setObsPublica(editOrder.notes ?? ""); setNotasInternas(editOrder.internal_notes ?? "");
      setEndereco((e) => ({ ...e, logradouro: editOrder.delivery_address ?? "", cidade: editOrder.delivery_city ?? "", uf: editOrder.delivery_state ?? "", cep: editOrder.delivery_zip ?? "" }));
      if (editOrder.billing_address) { setFatMesmo(false); setFatEndereco(editOrder.billing_address); }
      setDeliveryDate(editOrder.agreed_delivery_date ? String(editOrder.agreed_delivery_date).slice(0, 10) : "");
      if (editOrder.vendedor_id) setVendedorId(editOrder.vendedor_id);
    }
    setHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editOrder, hydrated]);

  // Monta o payload de gravação (cabeçalho + itens) a partir do estado da tela.
  function buildPayload(status: "orcamento" | "pedido") {
    return {
      form_snapshot: formSnapshot(),
      tipo: mode,
      status,
      vendedor_id: vendedorId || undefined,
      internal_notes: buildInternalNotes(),
      customer_name: customerName || undefined,
      customer_doc: doc || undefined,
      customer_email: email || undefined,
      customer_phone: phone || undefined,
      customer_ie: ie.trim() || undefined,
      is_licenciado: isLicenciado,
      payment_terms: pagamentoLabel || undefined,
      endereco: (endereco.logradouro || endereco.cidade || endereco.cep) ? endereco : null,
      endereco_faturamento: fatMesmo ? null : ((fatEndereco.logradouro || fatEndereco.cidade || fatEndereco.cep) ? fatEndereco : null),
      subtotal_bruto: subtotalBruto,
      // Desconto do pedido = agregado dos itens; tipo 'value' (R$) quando há desconto.
      desconto_tipo: descontoTotal > 0 ? "value" : undefined,
      desconto_valor: descontoTotal,
      desconto_percent: percentAgregado,
      desconto_motivo: descontoTotal > 0 ? (discReason.trim() || undefined) : undefined,
      agreed_delivery_date: deliveryDate || undefined,
      total,
      notes: obsPublica || undefined,
      itens: validItems().map((i) => ({
        produto: i.name,
        product_id: i.product_id,
        product_code: i.product_code,
        quantidade: i.quantity,
        preco_unitario: i.unit_price,
        bonificacao: i.bonus_quantity,
        discount_type: i.discount_type,
        discount_value: i.discount_value,
        discount_amount: i.discount_amount,
      })),
    } as const;
  }

  // Limpa o formulário após salvar.
  function resetForm() {
    setMode("venda"); setDoc(""); setCustomerName(""); setEmail(""); setPhone("");
    setIsLicenciado(false); setRows([emptyRow()]); setObsPublica("");
    setNotasInternas(""); setTipoPonto(""); setClassificacao(""); setVolumeMedio("");
    setAtuaDiesel(false); setAtuaFrotas(false); setVendedorId("");
    setEndereco({ logradouro: "", numero: "", bairro: "", cidade: "", uf: "", cep: "" });
    setIe(""); setIeUf(""); setDocFeedback(null);
    setCoords(null); setMapMsg(null);
    setFatMesmo(true); setFatEndereco({ logradouro: "", numero: "", bairro: "", cidade: "", uf: "", cep: "" });
    setPagModalidade(""); setPagParcelas("1"); setPagFaturamento("");
    setDiscReason("");
    setDeliveryDate("");
  }

  async function handleQuote() {
    const items = validItems();
    if (items.length === 0) { toast.error("Adicione ao menos um item."); return; }
    if (!pagamentoValido) { toast.error("Selecione a forma de pagamento."); return; }
    setGenerating(true);
    try {
      // 1) Salva/atualiza o orçamento — no create o banco atribui o número (atômico);
      //    na edição mantém o mesmo número (nova verdade).
      const payload = buildPayload("orcamento");
      const { numero } = editId
        ? await updateVenda.mutateAsync({ id: editId, input: payload })
        : await createVenda.mutateAsync(payload);
      // 2) Gera o PDF já com o número do pedido (orçamento fica atrelado a ele).
      await generateQuotePdf({
        order_number: numero ?? undefined,
        customer_name: customerName || "Cliente", cnpj: doc || undefined,
        ie: ie || undefined,
        endereco,
        endereco_faturamento: fatMesmo ? null : fatEndereco,
        vendedor_name: vendedor || undefined, items,
        subtotal: subtotalBruto, discount: descontoTotal, discount_percent: percentAgregado, total,
        payment_terms: pagamentoLabel || undefined,
        notes: obsPublica || undefined, created_at: new Date().toISOString(), validityDays: 7,
      });
      toast.success(`Orçamento ${numero ?? ""} ${editId ? "atualizado" : "gerado"} e salvo!`);
      if (editId) navigate("/pedidos"); else resetForm();
    } catch (e) {
      toast.error("Erro ao gerar/salvar orçamento: " + (e instanceof Error ? e.message : "tente de novo"));
    } finally { setGenerating(false); }
  }

  async function handleEmailQuote() {
    const items = validItems();
    if (items.length === 0) { toast.error("Adicione ao menos um item."); return; }
    if (!pagamentoValido) { toast.error("Selecione a forma de pagamento."); return; }
    if (!email || !email.includes("@")) { toast.error("Informe o e-mail do cliente para enviar o orçamento."); return; }
    setEmailing(true);
    try {
      const payload = buildPayload("orcamento");
      const { numero } = editId
        ? await updateVenda.mutateAsync({ id: editId, input: payload })
        : await createVenda.mutateAsync(payload);
      const { base64, filename } = await generateQuotePdf({
        order_number: numero ?? undefined,
        customer_name: customerName || "Cliente", cnpj: doc || undefined,
        ie: ie || undefined,
        endereco,
        endereco_faturamento: fatMesmo ? null : fatEndereco,
        vendedor_name: vendedor || undefined, items,
        subtotal: subtotalBruto, discount: descontoTotal, discount_percent: percentAgregado, total,
        payment_terms: pagamentoLabel || undefined,
        notes: obsPublica || undefined, created_at: new Date().toISOString(), validityDays: 7,
      }, { download: false });
      const { data: out, error } = await supabase.functions.invoke("send-email", {
        body: {
          template: "orcamento",
          to: email,
          data: { order_number: numero ?? null, customer_name: customerName || "Cliente", vendedor_name: vendedor || null },
          attachments: [{ filename, content: base64 }],
          replyTo: "administrativo@carbovapt.com.br",
        },
      });
      if (error) throw error;
      if ((out as { error?: string } | null)?.error) throw new Error((out as { error?: string }).error);
      toast.success(`Orçamento ${numero ?? ""} enviado para ${email}!`);
      if (editId) navigate("/pedidos"); else resetForm();
    } catch (e) {
      toast.error("Erro ao enviar por e-mail: " + (e instanceof Error ? e.message : "tente de novo"));
    } finally { setEmailing(false); }
  }

  async function handleSell() {
    if (validItems().length === 0) { toast.error("Adicione ao menos um item."); return; }
    if (!pagamentoValido) { toast.error("Selecione a forma de pagamento."); return; }
    try {
      if (editId) {
        // Salva as edições mantendo o orçamento e converte pelo caminho oficial.
        await updateVenda.mutateAsync({ id: editId, input: buildPayload("orcamento") });
        await convertQuote.mutateAsync(editId);
        toast.success("Orçamento editado e convertido em venda!");
      } else {
        const { numero } = await createVenda.mutateAsync(buildPayload("pedido"));
        toast.success(`Venda ${numero ?? ""} registrada!`);
      }
      resetForm();
      navigate("/pedidos");
    } catch (e) {
      toast.error("Erro ao registrar venda: " + (e instanceof Error ? e.message : "tente de novo"));
    }
  }

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto w-full space-y-5 pb-24">
      {editId && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-sm">
          <span className="flex items-center gap-2 text-amber-700 dark:text-amber-300">
            <FileText className="h-4 w-4 shrink-0" />
            Editando o orçamento <b>{editNumero ?? "…"}</b> — ao salvar, ele vira a nova versão (mesmo número).
          </span>
          <Button variant="ghost" size="sm" className="shrink-0" onClick={() => navigate("/pedidos")}>Sair</Button>
        </div>
      )}
      {gestor && (
        <div
          className={`mb-1 rounded-xl border px-3 py-2.5 transition-colors sm:px-4 ${
            vendedorId !== ""
              ? "border-amber-500/40 bg-amber-500/10"
              : "border-border bg-card"
          }`}
        >
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
            <div className="flex items-center gap-2">
              <span
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                  vendedorId !== ""
                    ? "bg-amber-500/20 text-amber-700 dark:text-amber-300"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                <UserCog className="h-4 w-4" />
              </span>
              <span
                className={`text-sm font-medium ${
                  vendedorId !== ""
                    ? "text-amber-700 dark:text-amber-300"
                    : "text-foreground"
                }`}
              >
                {vendedorId !== "" ? "Lançar venda em nome de" : "Responsável pela venda"}
              </span>
            </div>

            <div className="flex flex-1 items-center gap-2 sm:justify-end">
              <Select
                value={vendedorId || "__self__"}
                onValueChange={(v) => setVendedorId(v === "__self__" ? "" : v)}
              >
                <SelectTrigger
                  className={`h-9 w-full sm:w-56 ${
                    vendedorId !== ""
                      ? "border-amber-500/40 bg-amber-500/5 text-amber-700 focus:ring-amber-500/30 dark:text-amber-300"
                      : ""
                  }`}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__self__">
                    Eu ({vendedorLogado || "—"}) — para mim
                  </SelectItem>
                  {vendedores
                    .filter((v) => v.id !== profile?.id)
                    .map((v) => (
                      <SelectItem key={v.id} value={v.id}>
                        {v.full_name || "—"}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {vendedorId !== "" && (
            <div className="mt-2 flex items-center gap-1.5 text-sm font-semibold text-amber-700 dark:text-amber-300">
              <Users className="h-3.5 w-3.5" />
              <span>
                Em nome de{" "}
                {vendedores.find((v) => v.id === vendedorId)?.full_name || "—"}
              </span>
            </div>
          )}

          <p className="mt-1.5 text-xs text-muted-foreground">
            A comissão desta venda vai para o vendedor selecionado.
          </p>
        </div>
      )}

      {/* Tipo de Operação */}
      <CarboCard>
        <CarboCardContent className="p-4 space-y-3">
          <h3 className="font-semibold flex items-center gap-2"><Package className="h-4 w-4 text-carbo-green" /> Tipo de Operação</h3>
          <div className="grid grid-cols-2 gap-2 max-w-md">
            {([["venda", "Venda"], ["promo", "Ação Promocional"]] as const).map(([v, label]) => (
              <button key={v} onClick={() => setMode(v)}
                className={`rounded-xl border p-3 text-sm font-medium transition-all ${
                  mode === v ? "border-carbo-green bg-carbo-green/5 text-foreground" : "bg-card text-muted-foreground hover:bg-muted"}`}>
                {label}
              </button>
            ))}
          </div>
        </CarboCardContent>
      </CarboCard>

      {/* Busca por CNPJ ou CPF */}
      <CarboCard>
        <CarboCardContent className="p-4 space-y-3">
          <h3 className="font-semibold flex items-center gap-2"><Search className="h-4 w-4 text-carbo-green" /> Busca por CNPJ ou CPF</h3>
          <p className="text-xs text-muted-foreground">
            CNPJ busca os dados automaticamente. CPF (pessoa física) é validado e segue com preenchimento manual.
          </p>
          <div className="flex flex-col sm:flex-row gap-2">
            <Input
              value={doc}
              onChange={(e) => { setDoc(formatDoc(e.target.value)); setDocFeedback(null); }}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleBuscarDoc(); } }}
              placeholder="CNPJ ou CPF"
              maxLength={18}
              className="font-mono"
            />
            <CarboButton type="button" onClick={handleBuscarDoc} disabled={buscando}>
              {buscando ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Search className="h-4 w-4 mr-1" />}
              {buscando ? "Buscando..." : "Buscar dados"}
            </CarboButton>
          </div>
          {docFeedback && (
            <p className={`flex items-center gap-1.5 text-xs font-medium ${docFeedback.kind === "ok" ? "text-carbo-green" : "text-destructive"}`}>
              {docFeedback.kind === "ok" ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0" /> : <AlertCircle className="h-3.5 w-3.5 shrink-0" />}
              {docFeedback.msg}
            </p>
          )}
        </CarboCardContent>
      </CarboCard>

      {/* Informações do Cliente */}
      <CarboCard>
        <CarboCardContent className="p-4 space-y-3">
          <h3 className="font-semibold flex items-center gap-2"><Building2 className="h-4 w-4 text-carbo-green" /> Informações do Cliente</h3>
          <div className="grid md:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Nome / Razão Social *</Label>
              <Input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Nome do cliente" />
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@exemplo.com" />
            </div>
            <div className="space-y-1.5">
              <Label>Telefone</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(00) 00000-0000" />
            </div>
            <div className="flex items-start justify-between gap-3 rounded-xl border p-3">
              <div>
                <p className="text-sm font-medium">É Licenciado?</p>
                <p className="text-xs text-muted-foreground">Marque se o cliente é um licenciado Carbo</p>
              </div>
              <Switch checked={isLicenciado} onCheckedChange={setIsLicenciado} />
            </div>

            {/* Inscrição Estadual — validação de formato/dígito por UF */}
            <div className="space-y-1.5 md:col-span-2">
              <div className="flex items-center justify-between">
                <Label>Inscrição Estadual</Label>
                <label className="flex items-center gap-2 text-xs font-normal text-muted-foreground cursor-pointer">
                  <Switch checked={isIsento} onCheckedChange={(c) => setIe(c ? "ISENTO" : "")} />
                  Isento (sem IE)
                </label>
              </div>
              {!isIsento && (
                <div className="flex gap-2">
                  <Select value={ieUfEff} onValueChange={setIeUf}>
                    <SelectTrigger className="w-24 shrink-0"><SelectValue placeholder="UF" /></SelectTrigger>
                    <SelectContent>{UFS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
                  </Select>
                  <Input
                    value={ie}
                    onChange={(e) => setIe(e.target.value)}
                    placeholder="Nº da Inscrição Estadual"
                    className={`flex-1 ${ieResult && !ieResult.valid ? "border-destructive focus-visible:ring-destructive" : ""} ${ieResult && ieResult.valid ? "border-green-500 focus-visible:ring-green-500" : ""}`}
                  />
                </div>
              )}
              {isIsento ? (
                <p className="text-xs flex items-center gap-1 mt-1 text-green-600"><CheckCircle2 className="h-3 w-3 shrink-0" /> Cliente isento de Inscrição Estadual.</p>
              ) : ieResult ? (
                <p className={`text-xs flex items-center gap-1 mt-1 ${ieResult.valid ? "text-green-600" : "text-destructive"}`}>
                  {ieResult.valid ? <CheckCircle2 className="h-3 w-3 shrink-0" /> : <AlertCircle className="h-3 w-3 shrink-0" />}
                  {ieResult.message}
                </p>
              ) : (
                <p className="text-[11px] text-muted-foreground">Escolha a UF e digite a IE — valida formato e dígito de qualquer estado do Brasil. Marque “Isento” se não houver.</p>
              )}
            </div>
          </div>
        </CarboCardContent>
      </CarboCard>

      {/* Endereço de Entrega */}
      <CarboCard>
        <CarboCardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold flex items-center gap-2"><MapPin className="h-4 w-4 text-carbo-green" /> Endereço de Entrega</h3>
            <Button variant="outline" size="sm" onClick={localizarNoMapa} disabled={geoLoading}>
              {geoLoading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <MapPin className="h-4 w-4 mr-1" />}
              {geoLoading ? "Localizando..." : "Localizar no mapa"}
            </Button>
          </div>
          <div className="grid md:grid-cols-3 gap-3">
            <div className="space-y-1.5 md:col-span-2"><Label>Logradouro</Label><Input placeholder="Rua, Avenida, etc." value={endereco.logradouro} onChange={(e) => setEnd({ logradouro: e.target.value })} /></div>
            <div className="space-y-1.5">
              <Label>Número</Label>
              <div className="flex gap-2">
                <Input placeholder="Nº" value={endereco.numero} onChange={(e) => setEnd({ numero: e.target.value })} />
                <Button variant="outline" type="button" className="shrink-0" onClick={() => setEnd({ numero: "S/N" })}>S/N</Button>
              </div>
            </div>
            <div className="space-y-1.5"><Label>Bairro</Label><Input placeholder="Bairro" value={endereco.bairro} onChange={(e) => setEnd({ bairro: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Cidade</Label><Input placeholder="Cidade" value={endereco.cidade} onChange={(e) => setEnd({ cidade: e.target.value })} /></div>
            <div className="space-y-1.5">
              <Label>Estado</Label>
              <Select value={endereco.uf} onValueChange={(uf) => setEnd({ uf })}>
                <SelectTrigger><SelectValue placeholder="UF" /></SelectTrigger>
                <SelectContent>{UFS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label>CEP</Label><Input placeholder="00000-000" value={endereco.cep} onChange={(e) => setEnd({ cep: e.target.value })} /></div>
          </div>
          {coords ? (
            <div className="space-y-1.5">
              <div className="rounded-xl overflow-hidden border" style={{ height: 260 }}>
                <MapContainer key={`${coords.lat},${coords.lng}`} center={[coords.lat, coords.lng]} zoom={15} style={{ height: "100%", width: "100%" }} scrollWheelZoom={false}>
                  <TileLayer attribution='&copy; OpenStreetMap' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                  <CircleMarker center={[coords.lat, coords.lng]} radius={11} pathOptions={{ color: "#16A34A", fillColor: "#16A34A", fillOpacity: 0.5, weight: 2 }}>
                    <Popup>{[endereco.logradouro, endereco.numero].filter(Boolean).join(", ") || "Local aproximado"}<br />{[endereco.cidade, endereco.uf].filter(Boolean).join("/")}</Popup>
                  </CircleMarker>
                </MapContainer>
              </div>
              <p className="text-[11px] text-muted-foreground flex items-center gap-1"><MapPin className="h-3 w-3" /> Posição <b>aproximada</b> pelo endereço — confira se bate com o local de entrega.</p>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed flex flex-col items-center justify-center gap-2 py-10 text-center text-muted-foreground">
              <MapPin className="h-6 w-6" />
              <p className="text-sm px-6">{mapMsg ?? <>Preencha o endereço e clique em <b>Localizar no mapa</b> para visualizar o ponto aproximado de entrega.</>}</p>
            </div>
          )}

          {/* Endereço de Faturamento (NF) — pode diferir do de entrega */}
          <div className="border-t pt-3 mt-1 space-y-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <h4 className="font-semibold text-sm flex items-center gap-2"><FileText className="h-4 w-4 text-carbo-green" /> Endereço de Faturamento (NF)</h4>
              <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                <Checkbox checked={fatMesmo} onCheckedChange={(c) => setFatMesmo(!!c)} /> Mesmo endereço da entrega
              </label>
            </div>
            {!fatMesmo && (
              <div className="grid md:grid-cols-3 gap-3">
                <div className="space-y-1.5 md:col-span-2"><Label>Logradouro</Label><Input placeholder="Rua, Avenida, etc." value={fatEndereco.logradouro} onChange={(e) => setFat({ logradouro: e.target.value })} /></div>
                <div className="space-y-1.5"><Label>Número</Label><Input placeholder="Nº" value={fatEndereco.numero} onChange={(e) => setFat({ numero: e.target.value })} /></div>
                <div className="space-y-1.5"><Label>Bairro</Label><Input placeholder="Bairro" value={fatEndereco.bairro} onChange={(e) => setFat({ bairro: e.target.value })} /></div>
                <div className="space-y-1.5"><Label>Cidade</Label><Input placeholder="Cidade" value={fatEndereco.cidade} onChange={(e) => setFat({ cidade: e.target.value })} /></div>
                <div className="space-y-1.5">
                  <Label>Estado</Label>
                  <Select value={fatEndereco.uf} onValueChange={(uf) => setFat({ uf })}>
                    <SelectTrigger><SelectValue placeholder="UF" /></SelectTrigger>
                    <SelectContent>{UFS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5"><Label>CEP</Label><Input placeholder="00000-000" value={fatEndereco.cep} onChange={(e) => setFat({ cep: e.target.value })} /></div>
              </div>
            )}
          </div>
        </CarboCardContent>
      </CarboCard>

      {/* Itens do Pedido — pôr o produto e fechar a venda */}
      <CarboCard>
        <CarboCardContent className="p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold flex items-center gap-2"><ShoppingCart className="h-4 w-4 text-carbo-green" /> Itens do Pedido</h3>
            <Button variant="outline" size="sm" onClick={() => setRows((p) => [...p, emptyRow()])}>
              <Plus className="h-4 w-4 mr-1" /> Adicionar Item
            </Button>
          </div>

          {rows.map((r) => {
            const bruto = r.qty * r.unitPrice;
            const line = computeLineDiscount(bruto, { type: r.discType, value: r.discValue });
            return (
              <div key={r.id} className="rounded-xl border p-3 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-[1fr_90px_120px_auto] gap-3 items-end">
                  <div className="space-y-1.5">
                    <Label>Produto</Label>
                    <Select value={r.productId} onValueChange={(v) => onProduct(r.id, v)}>
                      <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>{produtos.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Quantidade</Label>
                    <Input type="number" min={1} value={r.qty} onChange={(e) => updateRow(r.id, { qty: Number(e.target.value) })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Preço Unit. (R$)</Label>
                    <Input type="number" min={0} step="0.01" value={r.unitPrice} onChange={(e) => updateRow(r.id, { unitPrice: Number(e.target.value) })} placeholder="0,00" />
                  </div>
                  <div className="flex items-center justify-between sm:justify-end gap-3 sm:pb-2">
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">Total</p>
                      <p className="font-semibold">{brl(line.net)}</p>
                      {line.amount > 0 && (
                        <p className="text-[11px] text-destructive tabular-nums">
                          − {brl(line.amount)}{r.discType === "percent" ? ` (${line.percent}%)` : ""}
                        </p>
                      )}
                    </div>
                    {rows.length > 1 && (
                      <button onClick={() => setRows((p) => p.filter((x) => x.id !== r.id))}
                        className="p-1.5 rounded hover:bg-destructive/10 text-destructive"><Trash2 className="h-4 w-4" /></button>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
                  <label className="flex items-center gap-2">
                    <Switch checked={r.hasBonus} onCheckedChange={(v) => updateRow(r.id, { hasBonus: v })} />
                    <span className="text-sm flex items-center gap-1"><Gift className="h-3.5 w-3.5 text-carbo-green" /> Tem bonificação</span>
                  </label>
                  {r.hasBonus && (
                    <div className="flex items-center gap-2">
                      <Label className="text-xs">Qtd bonificada</Label>
                      <Input type="number" min={0} value={r.bonusQty} onChange={(e) => updateRow(r.id, { bonusQty: Number(e.target.value) })} className="w-24" />
                    </div>
                  )}
                  {/* Desconto POR ITEM: toggle % | R$ + valor */}
                  <div className="flex items-center gap-2">
                    <span className="text-sm flex items-center gap-1"><Tag className="h-3.5 w-3.5 text-carbo-green" /> Desconto</span>
                    <div className="grid grid-cols-2 gap-1 w-[92px] shrink-0">
                      {([["percent", "%", Percent], ["value", "R$", Tag]] as const).map(([v, label, Ico]) => (
                        <button key={v} type="button" onClick={() => updateRow(r.id, { discType: v })}
                          className={`rounded-md border px-1.5 py-1 text-xs font-medium flex items-center justify-center gap-0.5 transition-all ${
                            r.discType === v ? "border-carbo-green bg-carbo-green/5 text-foreground" : "bg-card text-muted-foreground hover:bg-muted"}`}>
                          <Ico className="h-3 w-3" /> {label}
                        </button>
                      ))}
                    </div>
                    <Input type="number" min={0} step="0.01" className="w-28"
                      value={r.discValue || ""} onChange={(e) => updateRow(r.id, { discValue: Number(e.target.value) })}
                      placeholder={r.discType === "percent" ? "ex.: 5" : "ex.: 100,00"} />
                  </div>
                </div>
              </div>
            );
          })}

          {/* Motivo do desconto (só quando há desconto) — alimenta a alçada. */}
          {descontoTotal > 0 && (
            <div className="rounded-xl border p-3 space-y-3">
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1"><Tag className="h-3.5 w-3.5 text-carbo-green" /> Motivo do desconto (opcional)</Label>
                <Input value={discReason} onChange={(e) => setDiscReason(e.target.value)} placeholder="Ex.: fidelização, volume…" />
              </div>
              {discTier.hint && (
                <p className={`text-xs flex items-center gap-1 ${discTier.needsApproval ? "text-amber-500" : "text-muted-foreground"}`}>
                  {discTier.needsApproval ? <AlertCircle className="h-3.5 w-3.5 shrink-0" /> : <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />}
                  {discTier.hint}
                </p>
              )}
            </div>
          )}

          {/* Resumo: subtotal · desconto · total */}
          <div className="flex justify-end border-t pt-3">
            <div className="w-full sm:w-64 space-y-1 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span className="tabular-nums">{brl(subtotalBruto)}</span></div>
              {descontoTotal > 0 && (
                <div className="flex justify-between text-destructive"><span>Desconto{percentAgregado > 0 ? ` (${percentAgregado}%)` : ""}</span><span className="tabular-nums">− {brl(descontoTotal)}</span></div>
              )}
              <div className="flex justify-between border-t pt-1 font-bold text-base"><span>Total</span><span className="tabular-nums">{brl(total)}</span></div>
            </div>
          </div>
        </CarboCardContent>
      </CarboCard>

      {/* Prazo de Entrega e Fabricação (opcional) */}
      <CarboCard>
        <CarboCardContent className="p-4 space-y-3">
          <h3 className="font-semibold flex items-center gap-2"><CalendarClock className="h-4 w-4 text-carbo-green" /> Prazo de Entrega</h3>
          <div className="grid md:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Data de entrega combinada</Label>
              <Popover open={dateOpen} onOpenChange={setDateOpen}>
                <PopoverTrigger asChild>
                  <Button type="button" variant="outline" className="w-full justify-start font-normal">
                    <CalendarClock className="h-4 w-4 mr-2 text-muted-foreground" />
                    {deliveryDate ? fmtBr(new Date(deliveryDate + "T00:00:00")) : <span className="text-muted-foreground">Selecionar data</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    locale={ptBR}
                    captionLayout="dropdown-buttons"
                    fromYear={new Date().getFullYear()}
                    toYear={new Date().getFullYear() + 3}
                    selected={deliveryDate ? new Date(deliveryDate + "T00:00:00") : undefined}
                    defaultMonth={deliveryDate ? new Date(deliveryDate + "T00:00:00") : new Date()}
                    disabled={(d) => d < new Date(new Date().setHours(0, 0, 0, 0))}
                    onSelect={(d) => { setDeliveryDate(d ? toISO(d) : ""); setDateOpen(false); }}
                    classNames={{
                      caption: "flex justify-center pt-1 relative items-center gap-1",
                      caption_dropdowns: "flex gap-1",
                      caption_label: "hidden",
                      vhidden: "sr-only",  // esconde o "Month:/Year:" (rótulo de leitor de tela)
                      dropdown: "bg-background border rounded-md text-sm px-2 py-1 outline-none",
                    }}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
              <p className="text-[11px] text-muted-foreground">Combine com o cliente. O prazo de fábrica (PPF/PPE) é calculado em dias úteis.</p>
            </div>
          </div>
          {prazos && (
            <div className="space-y-2">
              <div className="rounded-lg border divide-y text-sm max-w-sm">
                <div className="flex justify-between px-3 py-2"><span className="text-muted-foreground">Fabricar até (PPF)</span><span className="tabular-nums font-medium">{fmtBr(prazos.ppf)}</span></div>
                <div className="flex justify-between px-3 py-2"><span className="text-muted-foreground">Expedir até (PPE)</span><span className="tabular-nums font-medium">{fmtBr(prazos.ppe)}</span></div>
                <div className="flex justify-between px-3 py-2"><span className="text-muted-foreground">Dias úteis para fabricar</span><span className="tabular-nums">{prazos.businessDaysAvailable}</span></div>
              </div>
              {prazos.belowMinimum && (
                <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 space-y-2 max-w-sm">
                  <p className="text-xs flex items-start gap-1 text-amber-600">
                    <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                    Precisa de no mínimo {prazoCfg.minBusinessDays} dias úteis para fabricar e enviar. Esta venda abrirá uma liberação de fabricação para o gestor.
                  </p>
                  <Button type="button" variant="outline" size="sm" onClick={() => setDeliveryDate(toISO(prazos.suggestedDeliveryDate))}>
                    <CalendarClock className="h-3.5 w-3.5 mr-1" /> Usar data sugerida ({fmtBr(prazos.suggestedDeliveryDate)})
                  </Button>
                </div>
              )}
            </div>
          )}
        </CarboCardContent>
      </CarboCard>

      {/* Forma de Pagamento (obrigatória) */}
      <CarboCard>
        <CarboCardContent className="p-4 space-y-4">
          <h3 className="font-semibold flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-carbo-green" /> Forma de Pagamento <span className="text-red-400">*</span>
          </h3>
          <div className="grid md:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Modalidade *</Label>
              <Select value={pagModalidade} onValueChange={setPagModalidade}>
                <SelectTrigger><SelectValue placeholder="Selecione a forma de pagamento" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pix">PIX</SelectItem>
                  <SelectItem value="boleto_avista">Boleto à vista</SelectItem>
                  <SelectItem value="boleto_faturado">Boleto faturado</SelectItem>
                  <SelectItem value="debito">Cartão de débito</SelectItem>
                  <SelectItem value="credito">Cartão de crédito (parcelado)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {pagModalidade === "credito" && (
              <div className="space-y-1.5">
                <Label>Parcelas *</Label>
                <Select value={pagParcelas} onValueChange={setPagParcelas}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 12 }, (_, i) => String(i + 1)).map((n) => (
                      <SelectItem key={n} value={n}>{n}x</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {pagModalidade === "boleto_faturado" && (
              <div className="space-y-1.5">
                <Label>Prazo do faturamento *</Label>
                <Input value={pagFaturamento} onChange={(e) => setPagFaturamento(e.target.value)} placeholder="ex.: 30/60/90" />
              </div>
            )}
          </div>
          {pagamentoLabel && (
            <p className="text-xs text-muted-foreground">Selecionado: <b className="text-foreground">{pagamentoLabel}</b></p>
          )}
        </CarboCardContent>
      </CarboCard>

      {/* Dados Estratégicos (opcional, recolhível) */}
      <CollapsibleCard title="Dados Estratégicos" icon={Target} open={showEstrategicos} onToggle={() => setShowEstrategicos((o) => !o)}>
        <div className="grid md:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Tipo de Ponto</Label>
            <Select value={tipoPonto} onValueChange={setTipoPonto}>
              <SelectTrigger><SelectValue placeholder="Selecione o tipo" /></SelectTrigger>
              <SelectContent>{TIPOS_PONTO.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Classificação Interna</Label>
            <Select value={classificacao} onValueChange={setClassificacao}>
              <SelectTrigger><SelectValue placeholder="Classificar como" /></SelectTrigger>
              <SelectContent>{CLASSIFICACOES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Volume Médio Mensal (veículos)</Label>
          <Input type="number" placeholder="Ex: 500" value={volumeMedio} onChange={(e) => setVolumeMedio(e.target.value)} />
        </div>
        <div className="grid md:grid-cols-2 gap-3">
          <label className="flex items-center justify-between gap-3 rounded-xl border p-3">
            <span className="text-sm font-medium">Atua com Diesel?</span><Switch checked={atuaDiesel} onCheckedChange={setAtuaDiesel} />
          </label>
          <label className="flex items-center justify-between gap-3 rounded-xl border p-3">
            <span className="text-sm font-medium">Atua com Frotas?</span><Switch checked={atuaFrotas} onCheckedChange={setAtuaFrotas} />
          </label>
        </div>
      </CollapsibleCard>

      {/* Observações (opcional, recolhível) */}
      <CollapsibleCard title="Observações" icon={FileText} open={showObs} onToggle={() => setShowObs((o) => !o)}>
        <div className="space-y-1.5">
          <Label>Observações Públicas</Label>
          <Textarea value={obsPublica} onChange={(e) => setObsPublica(e.target.value)} placeholder="Visíveis para o cliente" />
        </div>
        <div className="space-y-1.5">
          <Label>Notas Internas</Label>
          <Textarea value={notasInternas} onChange={(e) => setNotasInternas(e.target.value)} placeholder="Visíveis apenas internamente" />
        </div>
      </CollapsibleCard>

      {/* Rodapé: total + ações */}
      <div className="sticky bottom-0 bg-background/95 backdrop-blur border-t -mx-4 md:-mx-6 px-4 md:px-6 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center justify-between sm:block">
          <p className="text-xs text-muted-foreground">Total</p>
          <p className="text-xl font-bold">{brl(total)}</p>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Button variant="ghost" className="hidden sm:inline-flex" onClick={() => navigate("/pedidos")}>Cancelar</Button>
          <Button variant="outline" className="flex-1 sm:flex-none" onClick={handleQuote} disabled={generating || !pagamentoValido}>
            <FileText className="h-4 w-4 mr-1" /> {generating ? "Gerando..." : (editId ? (<><span className="hidden sm:inline">Salvar e&nbsp;</span>Gerar PDF</>) : (<><span className="hidden sm:inline">Gerar&nbsp;</span>Orçamento</>))}
          </Button>
          <Button variant="outline" className="flex-1 sm:flex-none" onClick={handleEmailQuote} disabled={emailing || !pagamentoValido} title="Salvar, gerar o PDF e enviar ao e-mail do cliente">
            <Mail className="h-4 w-4 mr-1" /> {emailing ? "Enviando..." : (<><span className="hidden sm:inline">Enviar por&nbsp;</span>E-mail</>)}
          </Button>
          <CarboButton onClick={handleSell} className="flex-1 sm:flex-none sm:min-w-[150px]" disabled={!pagamentoValido}>
            <ShoppingCart className="h-4 w-4 mr-1" /> {editId ? "Salvar e Vender" : "Gerar Venda"}
          </CarboButton>
        </div>
      </div>

      <p className="text-xs text-muted-foreground text-center">
        Vendedor: <b>{vendedor || "—"}</b>{vendedorId ? "" : " (usuário logado)"} · Catálogo real, busca de CNPJ, mapa e gravação ativos.
      </p>
    </div>
  );
}
