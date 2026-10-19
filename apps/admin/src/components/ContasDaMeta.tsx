import { Loader2, KeyRound, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useMetaContasVisiveis, useMetaContaEscolher, useMetaAdsContas } from "@/hooks/useMetaAds";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────────────────
// Escolher a conta de anúncio da Meta — sem ninguém ter de achar o `act_…`.
//
// A função lista as contas que o TOKEN enxerga (`acao: "descobrir"`), e "Usar
// esta conta" cadastra e já lê os últimos 30 dias. ⚠️ O cadastro continua
// sendo uma escolha (o token pode enxergar conta que não é nossa); o que some
// é o SQL. Sem o token, a tela diz COMO gerar — o erro da função vem inteiro.
// ─────────────────────────────────────────────────────────────────────────────

const STATUS: Record<number, string> = {
  1: "ativa", 2: "desativada", 3: "pagamento pendente", 7: "em revisão", 8: "acerto pendente",
  9: "em carência", 100: "fechando", 101: "fechada",
};

export function ContasDaMeta() {
  const visiveis = useMetaContasVisiveis();
  const emUso = useMetaAdsContas();
  const escolher = useMetaContaEscolher();
  const ligadas = new Set((emUso.data ?? []).map((c) => c.act_id));

  if (visiveis.isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Perguntando à Meta quais contas o token enxerga…
      </div>
    );
  }

  if (visiveis.error) {
    const msg = visiveis.error instanceof Error ? visiveis.error.message : String(visiveis.error);
    const semToken = msg.includes("META_ADS_ACCESS_TOKEN");
    return semToken ? (
      <div className="space-y-3 text-sm">
        <p className="flex items-center gap-2 font-medium">
          <KeyRound className="h-4 w-4 text-primary" /> Falta o token da Meta (passo de quem administra o Business Manager)
        </p>
        <ol className="list-decimal space-y-1.5 pl-5 text-muted-foreground">
          <li>Em <span className="text-foreground">business.facebook.com</span> → Configurações do negócio → <span className="text-foreground">Usuários do sistema</span>, crie um usuário do sistema (Admin).</li>
          <li>Em <span className="text-foreground">Atribuir ativos</span>, dê a ele a conta de anúncios da CarboZé (permissão de ver desempenho basta).</li>
          <li>Clique em <span className="text-foreground">Gerar novo token</span>, escolha o app, marque <code className="text-xs">ads_read</code> e validade <span className="text-foreground">Nunca</span>.</li>
          <li>No Supabase → Edge Functions → Secrets, crie <code className="text-xs">META_ADS_ACCESS_TOKEN</code> com esse token.</li>
          <li>Volte aqui e atualize a página: as contas aparecem para escolher.</li>
        </ol>
        <p className="text-xs text-muted-foreground">O token nunca aparece no sistema: ele mora só no secret, e ninguém o lê por SQL.</p>
      </div>
    ) : (
      <div className="flex items-start gap-2 rounded-md border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-sm">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
        <span>A Meta recusou: <span className="text-muted-foreground">{msg}</span></span>
      </div>
    );
  }

  const contas = visiveis.data ?? [];
  if (contas.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        O token funciona, mas não enxerga nenhuma conta de anúncio. No Business Manager, atribua a
        conta de anúncios ao usuário do sistema e atualize a página.
      </p>
    );
  }

  return (
    <div className="divide-y rounded-lg border">
      {contas.map((c) => {
        const ligada = ligadas.has(c.act_id);
        const ocupado = escolher.isPending && escolher.variables?.act_id === c.act_id;
        return (
          <div key={c.act_id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 font-medium">
                <span className="truncate">{c.nome}</span>
                {ligada && <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />}
              </p>
              <p className="text-xs text-muted-foreground">
                {c.act_id}{c.moeda ? ` · ${c.moeda}` : ""}
                {c.status != null && (
                  <span className={cn(c.status !== 1 && "text-amber-600")}> · {STATUS[c.status] ?? `status ${c.status}`}</span>
                )}
              </p>
            </div>
            <Button
              size="sm"
              variant={ligada ? "outline" : "default"}
              disabled={escolher.isPending}
              onClick={() => escolher.mutate({ act_id: c.act_id, usar: !ligada })}
            >
              {ocupado && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              {ligada ? "Parar de ler" : ocupado ? "Lendo 30 dias…" : "Usar esta conta"}
            </Button>
          </div>
        );
      })}
    </div>
  );
}
