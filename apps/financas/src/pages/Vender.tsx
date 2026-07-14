import { useEffect, useMemo, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { toast } from "sonner";
import {
  ShoppingCart, Plus, Trash2, Building2, MapPin, Package, Gift, FileText, Search, Target, ChevronDown,
  Loader2, CheckCircle2, AlertCircle, CreditCard,
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
import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { generateQuotePdf } from "@/lib/quotePdf";
import { useCreateVenda } from "@/hooks/useVendas";
import { useProdutos } from "@/hooks/useProdutos";
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

interface ItemRow {
  id: string; productId: string; qty: number; unitPrice: number; hasBonus: boolean; bonusQty: number;
}
const emptyRow = (): ItemRow => ({ id: crypto.randomUUID(), productId: "", qty: 1, unitPrice: 0, hasBonus: false, bonusQty: 0 });

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
  const { data: produtos = [] } = useProdutos();
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

  const subtotal = useMemo(() => rows.reduce((s, r) => s + r.qty * r.unitPrice, 0), [rows]);

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
      return {
        name: prod?.name ?? "Produto",
        product_id: r.productId,
        product_code: prod?.product_code ?? null,
        quantity: r.qty, unit_price: r.unitPrice, bonus_quantity: r.hasBonus ? r.bonusQty : 0,
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

  // Monta o payload de gravação (cabeçalho + itens) a partir do estado da tela.
  function buildPayload(status: "orcamento" | "pedido") {
    return {
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
      total: subtotal,
      notes: obsPublica || undefined,
      itens: validItems().map((i) => ({
        produto: i.name,
        product_id: i.product_id,
        product_code: i.product_code,
        quantidade: i.quantity,
        preco_unitario: i.unit_price,
        bonificacao: i.bonus_quantity,
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
  }

  async function handleQuote() {
    const items = validItems();
    if (items.length === 0) { toast.error("Adicione ao menos um item."); return; }
    if (!pagamentoValido) { toast.error("Selecione a forma de pagamento."); return; }
    setGenerating(true);
    try {
      // 1) Salva o orçamento primeiro — o banco atribui o número (atômico).
      const { numero } = await createVenda.mutateAsync(buildPayload("orcamento"));
      // 2) Gera o PDF já com o número do pedido (orçamento fica atrelado a ele).
      await generateQuotePdf({
        order_number: numero ?? undefined,
        customer_name: customerName || "Cliente", cnpj: doc || undefined,
        ie: ie || undefined,
        endereco,
        endereco_faturamento: fatMesmo ? null : fatEndereco,
        vendedor_name: vendedor || undefined, items, total: subtotal,
        payment_terms: pagamentoLabel || undefined,
        notes: obsPublica || undefined, created_at: new Date().toISOString(), validityDays: 7,
      });
      toast.success(`Orçamento ${numero ?? ""} gerado e salvo!`);
      resetForm();
    } catch (e) {
      toast.error("Erro ao gerar/salvar orçamento: " + (e instanceof Error ? e.message : "tente de novo"));
    } finally { setGenerating(false); }
  }

  async function handleSell() {
    if (validItems().length === 0) { toast.error("Adicione ao menos um item."); return; }
    if (!pagamentoValido) { toast.error("Selecione a forma de pagamento."); return; }
    try {
      const { numero } = await createVenda.mutateAsync(buildPayload("pedido"));
      toast.success(`Venda ${numero ?? ""} registrada!`);
      resetForm();
      navigate("/pedidos");
    } catch (e) {
      toast.error("Erro ao registrar venda: " + (e instanceof Error ? e.message : "tente de novo"));
    }
  }

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto w-full space-y-5 pb-24">
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
            const lineTotal = r.qty * r.unitPrice;
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
                      <p className="font-semibold">{brl(lineTotal)}</p>
                    </div>
                    {rows.length > 1 && (
                      <button onClick={() => setRows((p) => p.filter((x) => x.id !== r.id))}
                        className="p-1.5 rounded hover:bg-destructive/10 text-destructive"><Trash2 className="h-4 w-4" /></button>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-3">
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
                </div>
              </div>
            );
          })}

          <div className="flex justify-end border-t pt-3">
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Subtotal</p>
              <p className="text-lg font-bold">{brl(subtotal)}</p>
            </div>
          </div>
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

      {gestor && (
        <div className="rounded-xl border p-3 space-y-1.5">
          <Label>Vendedor responsável</Label>
          <Select value={vendedorId || "__self__"} onValueChange={(v) => setVendedorId(v === "__self__" ? "" : v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__self__">Eu ({vendedorLogado || "—"})</SelectItem>
              {vendedores.filter((v) => v.id !== profile?.id).map((v) => (
                <SelectItem key={v.id} value={v.id}>{v.full_name || "—"}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-[11px] text-muted-foreground">A comissão desta venda vai pro vendedor selecionado.</p>
        </div>
      )}

      {/* Rodapé: total + ações */}
      <div className="sticky bottom-0 bg-background/95 backdrop-blur border-t -mx-4 md:-mx-6 px-4 md:px-6 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center justify-between sm:block">
          <p className="text-xs text-muted-foreground">Total</p>
          <p className="text-xl font-bold">{brl(subtotal)}</p>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Button variant="ghost" className="hidden sm:inline-flex" onClick={() => navigate("/pedidos")}>Cancelar</Button>
          <Button variant="outline" className="flex-1 sm:flex-none" onClick={handleQuote} disabled={generating || !pagamentoValido}>
            <FileText className="h-4 w-4 mr-1" /> {generating ? "Gerando..." : (<><span className="hidden sm:inline">Gerar&nbsp;</span>Orçamento</>)}
          </Button>
          <CarboButton onClick={handleSell} className="flex-1 sm:flex-none sm:min-w-[150px]" disabled={!pagamentoValido}>
            <ShoppingCart className="h-4 w-4 mr-1" /> Gerar Venda
          </CarboButton>
        </div>
      </div>

      <p className="text-xs text-muted-foreground text-center">
        Vendedor: <b>{vendedor || "—"}</b>{vendedorId ? "" : " (usuário logado)"} · Catálogo real, busca de CNPJ, mapa e gravação ativos.
      </p>
    </div>
  );
}
