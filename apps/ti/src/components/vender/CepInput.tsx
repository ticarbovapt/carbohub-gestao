import { useEffect, useRef, useState } from "react";
import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// ─────────────────────────────────────────────────────────────────────────────
// CEP com preenchimento automático do endereço.
//
// O CEP vem PRIMEIRO no formulário de propósito: ele é a chave que traz
// logradouro, bairro, cidade e UF de graça. Deixá-lo por último obrigava a
// digitar tudo à mão antes de chegar no campo que teria evitado a digitação.
//
// ViaCEP com BrasilAPI de reserva. Se as duas caírem, o CEP continua sendo
// aceito e os campos seguem editáveis — consulta de endereço não pode ser
// requisito para fechar uma venda.
//
// Nem todo CEP traz rua e bairro: CEP "geral" de cidade pequena só devolve
// município e UF. Isso é normal e o componente preenche o que veio.
// ─────────────────────────────────────────────────────────────────────────────

export interface EnderecoCep {
  logradouro: string;
  bairro: string;
  cidade: string;
  uf: string;
}

interface ViaCepResp {
  erro?: boolean | string;
  logradouro?: string; bairro?: string; localidade?: string; uf?: string;
}
interface BrasilApiResp {
  street?: string; neighborhood?: string; city?: string; state?: string;
}

export function maskCep(v: string) {
  const d = (v || "").replace(/\D/g, "").slice(0, 8);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
}

async function buscarCep(cep: string): Promise<EnderecoCep | null> {
  try {
    const r = await fetch(`https://viacep.com.br/ws/${cep}/json/`, { signal: AbortSignal.timeout(8000) });
    if (r.ok) {
      const d = (await r.json()) as ViaCepResp;
      if (!d.erro && d.uf) {
        return {
          logradouro: d.logradouro || "", bairro: d.bairro || "",
          cidade: d.localidade || "", uf: d.uf || "",
        };
      }
      // `erro: true` = CEP não existe. Não adianta tentar a outra API.
      if (d.erro) return null;
    }
  } catch { /* cai para a reserva */ }

  try {
    const r = await fetch(`https://brasilapi.com.br/api/cep/v1/${cep}`, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) return null;
    const d = (await r.json()) as BrasilApiResp;
    if (!d.state) return null;
    return {
      logradouro: d.street || "", bairro: d.neighborhood || "",
      cidade: d.city || "", uf: d.state || "",
    };
  } catch { return null; }
}

export interface CepInputProps {
  value: string;
  onChange: (cep: string) => void;
  /** Chamado com o que o CEP devolveu. Campos ausentes vêm string vazia. */
  onEndereco: (e: EnderecoCep) => void;
  label?: string;
  id?: string;
}

export function CepInput({ value, onChange, onEndereco, label = "CEP", id }: CepInputProps) {
  const [estado, setEstado] = useState<"idle" | "buscando" | "ok" | "parcial" | "erro" | "off">("idle");
  // Evita rebuscar o mesmo CEP a cada re-render do formulário.
  const ultimo = useRef<string>("");

  const digits = (value || "").replace(/\D/g, "");

  useEffect(() => {
    if (digits.length !== 8) {
      ultimo.current = "";
      setEstado("idle");
      return;
    }
    if (ultimo.current === digits) return;
    ultimo.current = digits;

    let vivo = true;
    setEstado("buscando");
    buscarCep(digits).then((e) => {
      if (!vivo) return;
      if (!e) { setEstado("erro"); return; }
      onEndereco(e);
      // CEP de município inteiro não tem rua nem bairro — é resultado válido,
      // e dizer isso evita o vendedor achar que a busca falhou.
      setEstado(e.logradouro ? "ok" : "parcial");
    }).catch(() => { if (vivo) setEstado("off"); });

    return () => { vivo = false; };
    // onEndereco muda a cada render do pai; incluir na dependência refaria a
    // busca sem parar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [digits]);

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        placeholder="00000-000"
        value={maskCep(value)}
        onChange={(e) => onChange(maskCep(e.target.value))}
        maxLength={9}
        inputMode="numeric"
        className="font-mono"
      />
      {estado === "buscando" && (
        <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin shrink-0" /> Buscando endereço…
        </p>
      )}
      {estado === "ok" && (
        <p className="flex items-center gap-1.5 text-[11px] text-carbo-green">
          <CheckCircle2 className="h-3 w-3 shrink-0" /> Endereço preenchido — confira o número.
        </p>
      )}
      {estado === "parcial" && (
        <p className="flex items-center gap-1.5 text-[11px] text-amber-600 dark:text-amber-400">
          <AlertCircle className="h-3 w-3 shrink-0" /> Este CEP só tem cidade/UF — complete a rua e o bairro.
        </p>
      )}
      {estado === "erro" && (
        <p className="flex items-center gap-1.5 text-[11px] text-destructive">
          <AlertCircle className="h-3 w-3 shrink-0" /> CEP não encontrado — confira o número ou preencha manualmente.
        </p>
      )}
      {estado === "off" && (
        <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <AlertCircle className="h-3 w-3 shrink-0" /> Consulta indisponível — preencha manualmente.
        </p>
      )}
    </div>
  );
}
