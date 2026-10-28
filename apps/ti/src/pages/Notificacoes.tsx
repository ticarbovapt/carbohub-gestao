import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Bell, Search, Loader2, AlertTriangle, RotateCcw, Info } from "lucide-react";
import { useParamUrl } from "@carbo/shell";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { ProfileAvatar } from "@/components/ui/profile-avatar";
import { useOrgLabels } from "@/hooks/useTeamMembers";
import { SYSTEMS } from "@/lib/interfaces";
import AvisoVendaOnline from "./AvisoVendaOnline";

// ─────────────────────────────────────────────────────────────────────────────
// Notificações — quem recebe o quê (28/10/2026, pedido do dono do processo).
// Antes era "Quem recebe a venda"; a venda on-line virou UMA das abas.
//
// Quem decide é o BANCO (`20261136`): o gatilho `trg_notificacao_filtro`
// impede a notificação de nascer para quem não deve recebê-la, então sininho,
// som, toast e celular mudam juntos. Esta tela só lê o painel e grava a escolha.
//   modo app      padrão = tem o app da aba; o interruptor muda por pessoa
//   modo lista    o próprio gerador escolhe (venda online, mensagem de cliente)
//   modo pessoal  aviso dirigido à pessoa: padrão recebe
// ⚠️ O filtro tem interruptor geral (`carbo_notif_config`) e nasce desligado:
// a tela avisa, e as escolhas ficam salvas até ele ser ligado.
// ─────────────────────────────────────────────────────────────────────────────

interface Aba { aba: string; rotulo: string; descricao: string; modo: "app" | "lista" | "pessoal"; apps: string[]; ordem: number }
interface Tipo { tipo: string; referencia: string; aba: string; rotulo: string; descricao: string; linhas_30d: number; pessoas_30d: number }
interface SemAba { tipo: string; referencia: string; linhas_30d: number; pessoas_30d: number }
interface Pessoa {
  id: string; nome: string | null; avatar_url: string | null;
  departamento: string | null; funcao: string | null; departamento_2: string | null; funcao_2: string | null;
  apps: string[];
}
interface Escolha { user_id: string; aba: string; recebe: boolean; definido_em: string; definido_por_nome: string | null }
interface Painel { filtro_ativo: boolean; abas: Aba[]; tipos: Tipo[]; sem_aba: SemAba[]; pessoas: Pessoa[]; escolhas: Escolha[] }

const CHAVE = ["notif_painel"] as const;
const SEM_ABA = "sem_aba";
type Ver = "recebem" | "nao" | "todos";

const nomeDoApp = (f: string) => SYSTEMS.find((s) => s.iface === f)?.label ?? f;
const listaDeApps = (apps: string[]) => {
  const n = apps.map(nomeDoApp);
  return n.length <= 1 ? n.join("") : `${n.slice(0, -1).join(", ")} ou ${n[n.length - 1]}`;
};
const num = (n: number) => n.toLocaleString("pt-BR");
const dataCurta = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });

export default function Notificacoes() {
  const qc = useQueryClient();
  const { data: labels } = useOrgLabels();
  const [abaUrl, setAba] = useParamUrl("aba", "");
  const [busca, setBusca] = useParamUrl("busca", "", { replace: true });
  const [verUrl, setVer] = useParamUrl("ver", "todos");
  const ver: Ver = verUrl === "recebem" || verUrl === "nao" ? verUrl : "todos";

  const { data, isLoading, error } = useQuery({
    queryKey: CHAVE,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("carbo_notif_painel" as never);
      if (error) throw error;
      return data as unknown as Painel;
    },
  });

  // Muda NO CLIQUE; errou no banco, desfaz e diz.
  const definir = useMutation({
    mutationFn: async ({ id, aba, recebe }: { id: string; aba: string; recebe: boolean | null }) => {
      const { error } = await supabase.rpc("carbo_notif_definir" as never,
        { p_user: id, p_aba: aba, p_recebe: recebe } as never);
      if (error) throw error;
    },
    onMutate: async ({ id, aba, recebe }) => {
      await qc.cancelQueries({ queryKey: CHAVE });
      const antes = qc.getQueryData<Painel>(CHAVE);
      qc.setQueryData<Painel>(CHAVE, (p) => {
        if (!p) return p;
        const outras = p.escolhas.filter((e) => !(e.user_id === id && e.aba === aba));
        return {
          ...p,
          escolhas: recebe === null ? outras
            : [...outras, { user_id: id, aba, recebe, definido_em: new Date().toISOString(), definido_por_nome: null }],
        };
      });
      return { antes };
    },
    onError: (e, _v, ctx) => {
      if (ctx?.antes) qc.setQueryData(CHAVE, ctx.antes);
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar.");
    },
    onSettled: () => qc.invalidateQueries({ queryKey: CHAVE }),
  });

  const abas = data?.abas ?? [];
  const semAba = data?.sem_aba ?? [];
  const abaId = abas.some((a) => a.aba === abaUrl) || (abaUrl === SEM_ABA && semAba.length) ? abaUrl : abas[0]?.aba ?? "";
  const aba = abas.find((a) => a.aba === abaId) ?? null;
  const tiposDaAba = (data?.tipos ?? []).filter((t) => t.aba === abaId);

  const deptName = (k?: string | null) => (k ? labels?.deptLabel[k] ?? k : null);
  const fnName = (d?: string | null, f?: string | null) => (f ? labels?.fnLabel[`${d}:${f}`] ?? f : null);
  const cargo = (p: Pessoa) =>
    [
      [fnName(p.departamento, p.funcao), deptName(p.departamento)].filter(Boolean).join(" · "),
      p.funcao_2 ? [fnName(p.departamento_2, p.funcao_2), deptName(p.departamento_2)].filter(Boolean).join(" · ") : null,
    ].filter(Boolean).join("  +  ");

  // Estado de cada pessoa NESTA aba: a escolha manual vence o padrão.
  const linhas = useMemo(() => {
    if (!data || !aba || aba.modo === "lista") return [];
    const esc = new Map(data.escolhas.filter((e) => e.aba === aba.aba).map((e) => [e.user_id, e]));
    return data.pessoas.map((p) => {
      const padrao = aba.modo === "pessoal" || p.apps.some((f) => aba.apps.includes(f));
      const e = esc.get(p.id) ?? null;
      return { p, padrao, escolha: e, recebe: e ? e.recebe : padrao };
    });
  }, [data, aba]);

  const contagem = useMemo(() => ({
    recebem: linhas.filter((l) => l.recebe).length,
    nao: linhas.filter((l) => !l.recebe).length,
    todos: linhas.length,
  }), [linhas]);

  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return linhas.filter((l) => {
      if (ver === "recebem" && !l.recebe) return false;
      if (ver === "nao" && l.recebe) return false;
      return !q || (l.p.nome ?? "").toLowerCase().includes(q);
    });
  }, [linhas, busca, ver]);

  const linhas30 = (aId: string) => (data?.tipos ?? []).filter((t) => t.aba === aId).reduce((s, t) => s + Number(t.linhas_30d), 0);

  return (
    <main className="mx-auto max-w-5xl px-4 sm:px-6 py-8 space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Bell className="h-6 w-6 text-primary" /> Notificações
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Quem recebe cada tipo de aviso no sininho, no som e no celular. Por padrão recebe quem tem o app
          que gera o aviso; o interruptor liga ou desliga cada pessoa.
        </p>
      </div>

      {data && !data.filtro_ativo && (
        <div className="flex gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-amber-600" />
          <span>
            O filtro ainda não está valendo: hoje os avisos chegam como antes. As escolhas feitas aqui ficam
            salvas e passam a valer quando o TI ligar o filtro.
          </span>
        </div>
      )}

      {isLoading ? (
        <div className="p-10 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : error ? (
        // ⚠️ Falha de consulta não vira "ninguém recebe": diz o erro do banco.
        <div className="rounded-2xl border px-6 py-10 text-center text-sm text-destructive">
          Não foi possível carregar: {error instanceof Error ? error.message : String(error)}
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-1 rounded-lg border bg-muted/40 p-1 text-sm">
            {abas.map((a) => (
              <button
                key={a.aba}
                type="button"
                onClick={() => setAba(a.aba)}
                className={`shrink-0 rounded-md px-3 py-1.5 transition-colors ${
                  abaId === a.aba ? "bg-background font-medium shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {a.rotulo}
              </button>
            ))}
            {semAba.length > 0 && (
              <button
                type="button"
                onClick={() => setAba(SEM_ABA)}
                className={`shrink-0 rounded-md px-3 py-1.5 transition-colors ${
                  abaId === SEM_ABA ? "bg-background font-medium shadow-sm" : "text-amber-700 dark:text-amber-400 hover:text-foreground"
                }`}
              >
                Sem aba <span className="tabular-nums">{semAba.length}</span>
              </button>
            )}
          </div>

          {abaId === SEM_ABA ? (
            <section className="rounded-2xl border bg-card overflow-hidden">
              <div className="px-5 py-4 border-b">
                <p className="font-medium">Avisos que ainda não têm aba</p>
                <p className="text-sm text-muted-foreground">
                  Chegam para todos como antes, porque ninguém os classificou. Peça ao TI para colocá-los numa aba.
                </p>
              </div>
              <div className="divide-y">
                {semAba.map((t) => (
                  <div key={`${t.tipo}:${t.referencia}`} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                    <span className="font-mono text-xs">{t.tipo}{t.referencia ? ` · ${t.referencia}` : ""}</span>
                    <span className="text-muted-foreground tabular-nums">
                      {num(t.linhas_30d)} em 30 dias · {num(t.pessoas_30d)} pessoas
                    </span>
                  </div>
                ))}
              </div>
            </section>
          ) : aba && (
            <>
              <section className="rounded-2xl border bg-card px-5 py-4 space-y-3">
                <div>
                  <p className="font-medium">{aba.rotulo}</p>
                  <p className="text-sm text-muted-foreground">{aba.descricao}</p>
                </div>
                <p className="flex items-start gap-2 text-xs text-muted-foreground">
                  <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  {aba.modo === "app"
                    ? <span>Padrão: recebe quem tem o <b className="font-medium text-foreground">{listaDeApps(aba.apps)}</b>.</span>
                    : aba.modo === "pessoal"
                      ? <span>Padrão: todo mundo recebe o que é dirigido a si. Desligar aqui corta esses avisos da pessoa.</span>
                      : <span>Quem recebe é escolhido à mão, na lista abaixo.</span>}
                </p>
                {tiposDaAba.length > 0 && (
                  <ul className="grid gap-x-6 gap-y-1.5 text-sm lg:grid-cols-2">
                    {tiposDaAba.map((t) => (
                      <li key={`${t.tipo}:${t.referencia}`} className="flex items-baseline justify-between gap-3">
                        <span title={t.descricao}>{t.rotulo}</span>
                        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                          {num(t.linhas_30d)} em 30 dias
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="text-xs text-muted-foreground tabular-nums">
                  {num(linhas30(aba.aba))} notificações desta aba nos últimos 30 dias.
                </p>
              </section>

              {aba.aba === "venda_online" ? (
                <AvisoVendaOnline embutido />
              ) : aba.modo === "lista" ? (
                <section className="rounded-2xl border bg-card px-5 py-6 text-sm">
                  {aba.aba === "atendimento" ? (
                    <p>
                      Quem recebe o aviso de mensagem de cliente é escolhido na tela{" "}
                      <a className="font-medium text-primary hover:underline" href="https://atendimento.carbohub.com.br/conversas">
                        Conversas, no Carbo Atendimento
                      </a>.
                    </p>
                  ) : (
                    <p>Esta aba tem lista própria, fora desta tela.</p>
                  )}
                </section>
              ) : (
                <>
                  <div className="flex flex-col lg:flex-row gap-3 lg:items-center">
                    <div className="inline-flex rounded-lg border bg-muted/40 p-1 text-sm">
                      {([["todos", "Todo o time"], ["recebem", "Recebem"], ["nao", "Não recebem"]] as [Ver, string][]).map(([id, rot]) => (
                        <button
                          key={id}
                          type="button"
                          onClick={() => setVer(id)}
                          className={`rounded-md px-3 py-1.5 transition-colors ${
                            ver === id ? "bg-background font-medium shadow-sm" : "text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          {rot} <span className="tabular-nums text-muted-foreground">{contagem[id]}</span>
                        </button>
                      ))}
                    </div>
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input className="pl-9" placeholder="Buscar por nome..." value={busca} onChange={(e) => setBusca(e.target.value)} />
                    </div>
                  </div>

                  <section className="rounded-2xl border bg-card overflow-hidden">
                    {lista.length === 0 ? (
                      <div className="px-6 py-14 text-center text-sm text-muted-foreground">Ninguém encontrado. Ajuste a busca ou o filtro.</div>
                    ) : (
                      <div className="divide-y">
                        {lista.map(({ p, padrao, escolha, recebe }) => (
                          <div key={p.id} className="flex items-center gap-3 px-4 sm:px-5 py-3 hover:bg-muted/30">
                            <ProfileAvatar userId={p.id} avatarUrl={p.avatar_url} fullName={p.nome} size={40} className="ring-1 ring-border" />
                            <div className="min-w-0 flex-1">
                              <p className="font-medium break-words">{p.nome ?? "—"}</p>
                              <p className="text-xs text-muted-foreground truncate">{cargo(p) || "—"}</p>
                              <p className="text-[11px] text-muted-foreground/80 truncate">
                                {escolha
                                  ? `${escolha.recebe ? "Ligado" : "Desligado"} à mão${escolha.definido_por_nome ? ` por ${escolha.definido_por_nome}` : ""} em ${dataCurta(escolha.definido_em)}`
                                  : aba.modo === "pessoal"
                                    ? "Padrão"
                                    : padrao ? "Padrão: tem o app" : "Padrão: não tem o app"}
                              </p>
                            </div>
                            {escolha && (
                              <button
                                type="button"
                                onClick={() => definir.mutate({ id: p.id, aba: aba.aba, recebe: null })}
                                className="hidden sm:inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                                title={`Volta ao padrão (${padrao ? "recebe" : "não recebe"})`}
                              >
                                <RotateCcw className="h-3 w-3" /> Padrão
                              </button>
                            )}
                            <Switch
                              checked={recebe}
                              disabled={definir.isPending && definir.variables?.id === p.id}
                              // Voltar ao valor do padrão apaga a escolha: a pessoa volta a seguir o app.
                              onCheckedChange={(v) => definir.mutate({ id: p.id, aba: aba.aba, recebe: v === padrao ? null : v })}
                              aria-label={`${p.nome ?? "Pessoa"} recebe ${aba.rotulo}`}
                            />
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                </>
              )}
            </>
          )}
        </>
      )}
      <p className="text-xs text-muted-foreground">
        A pessoa só aparece aqui se tiver acesso a algum sistema interno. Cadastro e acesso de cada um ficam em{" "}
        <Link to="/usuarios" className="text-primary hover:underline">Usuários</Link>.
      </p>
    </main>
  );
}
