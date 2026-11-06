import { useMemo, useState } from "react";
import type { PainelAtendimento, PainelNumero } from "@/hooks/usePainelAtendimento";
import { fmtData, fmtDataHora, fmtFone, fmtMin } from "@/lib/painelAtendimento";
import { AbrirConversa, MostrarMais, NumeroChip, Pilula, RiscoBadge, Secao, TemaBadge, Vazio, useFatia } from "./comum";

const SEM_NOME = "__sem__";

export function Excecoes({ p, numeros, onPessoa }: { p: PainelAtendimento; numeros: Map<string, PainelNumero>; onPessoa: (chave: string) => void }) {
  const [quem, setQuem] = useState<string>("");
  const [soRisco, setSoRisco] = useState(false);

  const porPessoa = useMemo(() => {
    const m = new Map<string, { chave: string; nome: string; n: number }>();
    for (const f of p.fechadas_sem_resposta) {
      const k = f.por ?? SEM_NOME;
      const atual = m.get(k) ?? { chave: k, nome: f.por_nome ?? "Sem registro de quem", n: 0 };
      atual.n++;
      m.set(k, atual);
    }
    return [...m.values()].sort((a, b) => b.n - a.n);
  }, [p.fechadas_sem_resposta]);

  const lista = useMemo(() => p.fechadas_sem_resposta
    .filter((f) => (!quem || (f.por ?? SEM_NOME) === quem) && (!soRisco || f.risco))
    .sort((a, b) => b.fechada_em.localeCompare(a.fechada_em)), [p.fechadas_sem_resposta, quem, soRisco]);
  const fatia = useFatia(lista, 30, `${quem}|${soRisco}`);

  const hist = p.historico_desde ? p.historico_desde.slice(0, 10) : null;
  const desde = hist && hist > p.periodo.de ? ` · desde ${fmtData(hist)}` : "";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-1.5">
        <Pilula ativo={!quem} onClick={() => setQuem("")}>Todos · {p.fechadas_sem_resposta.length}</Pilula>
        {porPessoa.map((x) => (
          <Pilula key={x.chave} ativo={quem === x.chave} onClick={() => setQuem(quem === x.chave ? "" : x.chave)}>
            {x.nome} · {x.n}
          </Pilula>
        ))}
        <span className="mx-1 hidden h-4 w-px bg-border sm:inline-block" />
        <Pilula ativo={soRisco} onClick={() => setSoRisco(!soRisco)}>Só com risco</Pilula>
      </div>

      <Secao titulo={`Fechadas sem resposta · ${lista.length}${desde}`}
        acoes={quem && quem !== SEM_NOME ? (
          <button type="button" onClick={() => onPessoa(quem)} className="text-xs font-medium text-primary hover:underline">Ver a pessoa</button>
        ) : undefined}>
        {lista.length === 0 ? <Vazio>{p.fechadas_sem_resposta.length ? "Nada com esses filtros." : "Nenhuma conversa fechada sem resposta no período."}</Vazio> : (
          <>
            <ul className="space-y-2">
              {fatia.visiveis.map((f) => {
                const espera = (new Date(f.fechada_em).getTime() - new Date(f.desde).getTime()) / 60000;
                return (
                  <li key={`${f.numero_id}:${f.wa_id}:${f.fechada_em}`}
                    className="grid gap-2 rounded-lg border p-3 lg:grid-cols-[minmax(0,14rem)_minmax(0,1fr)_minmax(0,16rem)_auto] lg:items-center lg:gap-4">
                    <div className="flex min-w-0 flex-col gap-1">
                      <p className="truncate text-sm font-semibold">{f.nome || fmtFone(f.wa_id)}</p>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <NumeroChip id={f.numero_id} numero={numeros.get(f.numero_id)} />
                        <TemaBadge tema={f.tema} />
                        {f.risco && <RiscoBadge />}
                      </div>
                    </div>
                    <p className="line-clamp-2 min-w-0 break-words text-sm text-muted-foreground">{f.texto || "—"}</p>
                    <div className="flex min-w-0 flex-col text-xs">
                      <span className="font-semibold text-orange-700 dark:text-orange-400">
                        {f.como === "resolvido" ? "Marcou resolvido" : "Marcou aguardando"} · {f.por_nome ?? "sem registro de quem"}
                      </span>
                      <span className="text-muted-foreground">escreveu {fmtDataHora(f.desde)}</span>
                      <span className="text-muted-foreground">fechou {fmtDataHora(f.fechada_em)} · {fmtMin(espera)} depois</span>
                    </div>
                    <div className="flex lg:justify-end"><AbrirConversa numeroId={f.numero_id} waId={f.wa_id} /></div>
                  </li>
                );
              })}
            </ul>
            <MostrarMais resto={fatia.resto} onClick={fatia.mais} />
          </>
        )}
      </Secao>
    </div>
  );
}
