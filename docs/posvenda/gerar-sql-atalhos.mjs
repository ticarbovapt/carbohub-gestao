#!/usr/bin/env node
// Gera a MIGRAÇÃO que põe as mensagens padrão do pós-venda na barra `/` das
// Conversas (`carbo_wa_respostas`), a partir do MESMO arquivo dos slides:
// `apps/atendimento/src/lib/posvendaAtalhos.ts`.
//
//   node docs/posvenda/gerar-sql-atalhos.mjs 20261180000000
//
// ⚠️ Mudou o texto (as mensagens oficiais)? Rode de novo com um prefixo NOVO
// (14 dígitos, maior que o último) — migração já aplicada não roda outra vez.
// O teste `src/test/posvenda/casos.test.ts` recusa quando a migração mais nova
// deste tipo não bate com o código.
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const prefixo = process.argv[2];
if (!/^\d{14}$/.test(prefixo ?? "")) {
  console.error("Uso: node docs/posvenda/gerar-sql-atalhos.mjs <prefixo de 14 dígitos>");
  process.exit(1);
}

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, "..", "..");
const esbuild = createRequire(join(RAIZ, "apps/atendimento/package.json"))("esbuild");
const tmp = mkdtempSync(join(tmpdir(), "atalhos-sql-"));
const js = join(tmp, "a.mjs");
esbuild.buildSync({
  entryPoints: [join(RAIZ, "apps/atendimento/src/lib/posvendaAtalhos.ts")],
  outfile: js, format: "esm", bundle: true, platform: "node", logLevel: "silent",
});
const { ATALHOS } = await import(pathToFileURL(js).href);
rmSync(tmp, { recursive: true, force: true });

const mapa = Object.fromEntries(Object.keys(ATALHOS).sort().map((k) => [k, ATALHOS[k].texto]));
const json = JSON.stringify(mapa, null, 2);
if (json.includes("$atalhos$")) throw new Error("texto contém o delimitador $atalhos$");
const total = Object.keys(mapa).length;

const sql = `-- ═══════════════════════════════════════════════════════════════════════════
-- As MENSAGENS PADRÃO do pós-venda na barra \`/\` das Conversas.
--
-- GERADO por \`node docs/posvenda/gerar-sql-atalhos.mjs ${prefixo}\` a partir de
-- \`apps/atendimento/src/lib/posvendaAtalhos.ts\` — o mesmo arquivo dos slides
-- dos fluxos. Não edite à mão: mude o código e gere uma migração nova.
--
-- ⚠️ \`fonte = 'posvenda'\` marca a lista OFICIAL. Ela é sincronizada por
-- inteiro: texto mudado é atualizado, atalho que saiu do código é apagado.
-- Resposta que o TIME criou com o mesmo atalho (fonte nula) NUNCA é tocada —
-- fica a dela, e o aviso diz quais.
-- ⚠️ \`criado_por\` nulo: ninguém edita pela tela (a policy exige ser o autor);
-- o texto oficial muda no código. Apagar continua com a chefia.
-- ⚠️ As variáveis ficam como \`{nome}\`: a tela troca pelo primeiro nome do
-- cliente ao colar, e o resto vira \`[pedido]\`… para quem atende completar.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.carbo_wa_respostas add column if not exists fonte text;

comment on column public.carbo_wa_respostas.fonte is
  'Nula = resposta criada pelo time na tela. ''posvenda'' = mensagem padrao do pos-venda, gerada do codigo (posvendaAtalhos.ts) e sincronizada por migracao.';

do $bloco$
declare
  v jsonb := $atalhos$
${json}
$atalhos$::jsonb;
  v_total int;
  v_do_time text[];
  v_oficiais int;
  v_divergem int;
begin
  select count(*) into v_total from jsonb_object_keys(v);
  if v_total <> ${total} then
    raise exception 'esperava ${total} mensagens, vieram %', v_total;
  end if;

  -- O que o time já criou com o mesmo nome fica como está.
  select array_agg(r.atalho order by r.atalho) into v_do_time
    from public.carbo_wa_respostas r
   where r.atalho in (select jsonb_object_keys(v))
     and r.fonte is distinct from 'posvenda';
  if v_do_time is not null then
    raise warning 'atalhos do time mantidos (a mensagem padrao nao entrou): %', v_do_time;
  end if;

  delete from public.carbo_wa_respostas
   where fonte = 'posvenda'
     and atalho not in (select jsonb_object_keys(v));

  update public.carbo_wa_respostas r
     set corpo = v ->> r.atalho
   where r.fonte = 'posvenda'
     and v ? r.atalho
     and r.corpo is distinct from btrim(v ->> r.atalho);

  insert into public.carbo_wa_respostas (atalho, corpo, criado_por, fonte)
  select k, v ->> k, null, 'posvenda'
    from jsonb_object_keys(v) k
  on conflict (atalho) do nothing;

  -- Conferência: cada mensagem está na lista oficial OU foi mantida a do time,
  -- e as oficiais têm EXATAMENTE o texto do código.
  select count(*) into v_oficiais
    from public.carbo_wa_respostas where fonte = 'posvenda';
  if v_oficiais + coalesce(cardinality(v_do_time), 0) <> v_total then
    raise exception 'conferencia: % oficiais + % do time <> %',
      v_oficiais, coalesce(cardinality(v_do_time), 0), v_total;
  end if;

  select count(*) into v_divergem
    from public.carbo_wa_respostas r
   where r.fonte = 'posvenda' and r.corpo is distinct from btrim(v ->> r.atalho);
  if v_divergem > 0 then
    raise exception 'conferencia: % mensagens com texto diferente do codigo', v_divergem;
  end if;
end
$bloco$;
`;

const saida = join(RAIZ, "supabase/migrations", `${prefixo}_atalhos_posvenda_nas_conversas.sql`);
writeFileSync(saida, sql);
console.log(`${total} mensagens → ${saida}`);
