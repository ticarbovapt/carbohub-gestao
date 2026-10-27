# docs-prints — os prints da Documentação do Carbo Finanças

A tela `/documentacao` mostra prints das telas com marcadores numerados em cima
dos botões. Esta pasta é o que gera os prints (`public/docs/*.jpg`) e o lugar
onde cada número cai (`src/docs/marcadores.ts`) — medido no elemento de
verdade, nunca à mão.

**Nada daqui vai para o build**: o `vite.config.ts` do app não a enxerga, e o
`tsconfig` só inclui `src/`.

## Como funciona

- `vite.config.ts` sobe o app com o cliente Supabase trocado por `mockClient.ts`
  (porta 8099). Os dados são FICTÍCIOS (`fixtures.ts`, `fx_*.ts`, `pessoas.ts`):
  nenhum print mostra cliente ou pessoa real.
- `localStorage["mock-papel"] = "gestor" | "colaborador"` decide quem está
  logado — é assim que saem os prints das duas versões.
- `shots.mjs` lista cada print: a tela, o papel, o que clicar antes, o recorte
  e os marcadores (`[número, localizador]`). **O número é o mesmo `n` do item
  em `src/docs/conteudo.ts`.**
- `captura.mjs` abre cada tela no Chromium, espera a fonte carregar (sem isso
  os marcadores saem deslocados), mede as caixas em % e salva o JPG.
- `gerar.mjs` transforma `marcadores.json` em `src/docs/marcadores.ts`.

## Refazer os prints

```bash
cd apps/admin
npx vite --config docs-prints/vite.config.ts &         # sobe em :8099
PW=$(npm root -g)/playwright/index.mjs node docs-prints/captura.mjs
SO=vendas,vendas-gestor PW=... node docs-prints/captura.mjs   # só esses
node docs-prints/gerar.mjs
```

Playwright e Chromium: os do ambiente (`/opt/pw-browsers`); `CHROME=` troca o
executável. Saída `SEM CAIXA n` = o localizador não achou o elemento; `FORA n`
= o elemento está fora do recorte. Os dois deixam o item sem marcador — confira
na tela antes de mergear.

## Quando refazer

- Tela mudou de lugar ou de nome um botão documentado ⇒ refaça o print dela.
- Tela nova ⇒ entrada nova em `shots.mjs` **e** seção nova em `conteudo.ts`.
- Tela que lê tabela/RPC nova ⇒ a fixture vai junto, senão o print sai vazio.
