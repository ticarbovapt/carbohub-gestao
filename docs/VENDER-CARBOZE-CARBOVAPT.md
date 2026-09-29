# `/vender` — separar CarboZé de CarboVAPT

**Mapa de implementação.** Levantado em 29/09/2026 lendo o código, não a
memória. Nada aqui foi aplicado ainda.

Pedido do dono do processo: o seletor "Tipo de Operação" passa de
**Venda / Ação Promocional** para **CARBOZÉ / CARBOVAPT**; o que é comum aos
dois fica no topo, o que diverge desce para seções que trocam com a escolha; e
**uma venda não pode mais misturar os dois** — porque a NF de CarboZé sai pelo
Bling e a de CarboVAPT pelo Portal Nacional.

---

## 0. ⚠️ A descoberta que muda o escopo: "Ação Promocional" não existe no banco

O seletor de hoje é `mode: "venda" | "promo"` (`Vender.tsx:203`). Ele viaja no
payload como `tipo` (`:725`) — e **`buildOrderFields` nunca lê `input.tipo`**.
Conferido: `grep "input.tipo"` em `useVendas.ts` não devolve nada. Não há
coluna, não há CHECK, não há regra.

O único lugar onde `mode` sobrevive é dentro do `quote_form_snapshot`, e o
único leitor desse snapshot é `Vendas.tsx:359`, que reidrata o formulário para
edição.

**Consequências, e as duas primeiras são boas notícias:**

1. **Trocar os rótulos não quebra relatório nenhum**, porque nenhum relatório
   lê isso. Não há histórico de "ação promocional" para preservar em coluna.
2. **O seletor novo é o primeiro que de fato governa a tela.** Hoje ele é
   decorativo; depois ele decide seções, validação e caminho de NF. Isso é
   funcionalidade nova, não renomeação.
3. ⚠️ **Mas o snapshot de pedidos antigos tem `mode: "promo"`.** Reabrir um
   orçamento antigo para editar vai reidratar um valor que não é mais opção.
   Sem tratamento, o `setMode(snap.mode)` põe a tela num estado impossível.
   **Decisão necessária:** o que "Ação Promocional" vira ao reabrir? O mais
   seguro é mapear `promo → carboze` na reidratação e registrar no comentário
   por quê — ausência de tratamento aqui falha calada, que é o pior modo.

⚠️ **E uma pergunta que é do dono do processo, não minha:** "Ação Promocional"
**deixa de existir** ou vira outra coisa (uma marcação dentro do CarboZé)? Se
o time usa isso para alguma coisa fora do sistema, sumir o botão tira uma
informação que hoje fica no snapshot. Não dá para inferir do código, porque o
código não faz nada com ela.

---

## 1. O mapa das seções, como estão hoje

Ordem real da tela (`apps/crm/src/pages/Vender.tsx`, 1.904 linhas):

| # | Seção | Linha | Vale para | Situação hoje |
|---|---|---|---|---|
| 1 | Responsável pela venda | ~1040 | **ambos** | comum |
| 2 | **Tipo de Operação** | 1056 | — | é o seletor a trocar |
| 3 | Busca por CNPJ ou CPF | 1072 | **ambos** | comum |
| 4 | Informações do Cliente | 1102 | **ambos** | comum |
| 5 | Endereço de Entrega | 1170 | **CarboZé** | ⚠️ sempre visível, sem condição |
| 6 | Itens do Pedido (produtos) | 1275 | **CarboZé** | sempre visível |
| 7 | Itens de Serviço (P/M/G) | 1408 | **CarboVAPT** | sempre visível, "(opcional)" |
| 8 | Como o produto sai | 1560 | **CarboZé** | `entrega_modalidade` |
| 9 | Prazo de Entrega | 1618 | **ambos, dividido** | ver abaixo |
| 10 | Recorrência | 1717 | **CarboZé** | já travada por `!hasValidProduct` |
| 11 | Forma de Pagamento | 1792 | **ambos** | comum |

### A seção 9 já é meio-a-meio, e isso é precedente

"Prazo de Entrega" tem **dois** seletores de data:

- `:1624` — data de entrega acordada, `disabled={!hasValidProduct}`
- `:1659` — **data de execução** do serviço, `disabled={!hasValidService}`

Ou seja: **a tela já distingue produto de serviço em vários pontos**
(`hasValidProduct` em `:1624` e `:1727`, `hasValidService` em `:601` e `:1659`).
A reorganização não inventa o conceito — ela promove um gating que já existe de
campo para seção.

---

## 2. As três categorias de trabalho

Separar isso é o que impede tratar tudo com o mesmo cuidado (e o mesmo risco).

### (a) Só visualização — não toca lógica

Mostrar/esconder seção conforme o seletor. As seções 5, 6, 8 e 10 aparecem só
no CarboZé; a 7 só no CarboVAPT. Os estados continuam existindo; o que muda é
o que renderiza.

⚠️ **Esconder não pode ser o único mecanismo.** Se o vendedor preencher
produtos, trocar para CarboVAPT e salvar, os itens de produto **continuam no
state** e vão junto no payload. Limpar ao trocar, ou ignorar no submit — e o
comportamento tem de ser DITO na tela, senão ele apaga trabalho em silêncio.
Recomendo **confirmar antes de limpar** quando há item preenchido do outro lado.

### (b) Lógica existente, re-aplicada

- **Uma venda por tipo.** O guarda mora em `:908`
  (`validItems().length === 0 && validServiceItems().length === 0`). Vira:
  no CarboZé exige produto e recusa serviço; no CarboVAPT, o inverso.
- **A OS só nasce no CarboVAPT.** `createOSFromSale` (`:867`) já só dispara
  quando há item de serviço — passa a ser explícito pelo tipo.
- **Recorrência** já é `!hasValidProduct`; vira "só CarboZé".
- ⚠️ **`entrega_modalidade` (pronta entrega)** não se aplica a serviço. Hoje é
  `null` por padrão e o gatilho do banco trata nulo como produção — então não
  quebra nada deixar de aparecer, mas **precisa continuar indo nulo**.

### (c) ⚠️ DADO NOVO — não é reorganização

**"Local da execução pode ser em 1 ou mais lugares, diferente do faturamento."**

Isso **não existe no sistema**. Medido:

- `crm_os` tem `placa`, `modelo`, `qtd_veiculos`, `recorrencia`, `data_prevista`
  — e **nenhum campo de endereço/local**;
- `useDescarbOS` envia `p_scheduled_at` e `p_items`, sem local;
- `carboze_orders` tem `delivery_address/city/state/zip` (um só) e
  `billing_address` (jsonb).

Então isto pede modelagem nova: **N locais de execução por venda**, cada um com
endereço e (provavelmente) quais veículos/quantos vão em cada um. É o pedaço
mais caro do trabalho e o único que mexe em esquema.

⚠️ **E ele tem uma pergunta de negócio embutida:** o local de execução é do
PEDIDO ou da OS? Se a OS é a ordem de execução, o local é dela — e aí a venda
só precisa coletar para a OS carregar. Colocar em `carboze_orders` criaria a
segunda verdade sobre onde o serviço acontece.

⚠️ **Sugestão de faseamento:** entregar (a) e (b) primeiro, com **um** local de
execução (que já é o comportamento de hoje), e tratar "vários locais" como fase
2. Misturar a reorganização visual com modelagem nova é o modo de não conseguir
dizer qual das duas quebrou.

---

## 3. O que acontece com o endereço no CarboVAPT

Hoje a seção 5 se chama "Endereço de Entrega" e grava em
`delivery_address/city/state/zip`. Há também `fatMesmo` + `fatEndereco`
(`:232-233`), que viram `billing_address`.

No CarboVAPT **não há entrega** — o endereço serve para faturar.

⚠️ **Não mude a coluna de destino.** O caminho mais seguro é a seção mudar de
RÓTULO ("Endereço de faturamento") e continuar gravando onde grava, porque
`delivery_*` já é lido por outras telas. Redirecionar o serviço para
`billing_address` e deixar `delivery_*` nulo muda o que essas telas mostram
para pedidos de serviço — e isso precisa ser medido antes, não suposto.

**A medir antes de decidir:** quem lê `delivery_address` e o que faz quando é
nulo. Pedido só de serviço (`so_servico`) já existe hoje e, pelo comentário em
`useVendas.ts:105`, "nunca vai ser faturado nem expedido" — então pode ser que
já esteja resolvido. **Conferir, não presumir.**

---

## 4. As armadilhas registradas que valem aqui

1. ⚠️ **São SETE cópias byte a byte.** Conferido em 29/09: os sete
   `Vender.tsx` têm o mesmo md5 (`76565d90…`). Fonte da verdade = `apps/crm`;
   editar lá e copiar para `admin`, `ops`, `ti`, `financas`, `mkt`,
   `atendimento` **na mesma tarefa**. Divergir aqui não dá erro — dá telas
   diferentes para times diferentes.
2. ⚠️ **TDZ no `useMemo`.** O callback roda durante o render, então todo
   `const` que ele usa precisa estar declarado ACIMA. Já derrubou o `/vender`
   nos seis apps em produção, e nem `tsc` nem `npm run build` pegam. Ao mover
   bloco de lugar — que é exatamente o que esta tarefa faz — **reconferir cada
   `useMemo`/`useCallback`**.
3. ⚠️ **`useOS` significa duas coisas.** No `crm` é `licenciados.service_orders`
   via RPC; no `ops` é `crm_os`. Por isso o Vender importa
   `useCreateOSFromSale` de `@/hooks/useDescarbOS` — nome neutro, idêntico nos
   sete. **Não trocar esse import.**
4. ⚠️ **O snapshot precisa continuar reidratando.** `FormSnapshot` (`:630`)
   lista os campos; `Vendas.tsx:359` os lê de volta. Campo novo entra nos dois,
   e valor antigo (`mode: "promo"`) precisa de tratamento explícito.
5. ⚠️ **Bonificação do serviço continua sendo switch.** O CarboZé usa produto
   gêmeo (`bonificacao_de`); o serviço não é produto de catálogo e manteve
   `hasBonus`/`bonusQty` na `ServiceRow` (`:79`). São dois mecanismos por
   motivo, não por descuido — não unificar.
6. ⚠️ **Frota exige data** (`frotaSemData`, `:601`): a RPC recusa sem
   `scheduled_at`. Essa validação tem de sobreviver à reorganização.

---

## 5. Como verificar

```
cd apps/crm && npx tsc -b --force     # `tsc --noEmit -p` NÃO checa nada aqui
cd apps/crm && npm run build          # esbuild não checa tipos — não substitui o tsc
md5sum apps/*/src/pages/Vender.tsx    # os sete têm de voltar iguais
```

E, porque o `tsc` não pega TDZ, **abrir a tela** nos dois modos antes de
mergear.

---

## 6. Decisões que são do dono do processo

1. **"Ação Promocional" morre ou vira o quê?** Hoje não faz nada; se o time usa
   o rótulo para alguma coisa, sumir apaga isso.
2. **Locais de execução: fase 1 (um local) ou já vários?** Vários exigem
   esquema novo.
3. **O local de execução mora na VENDA ou na OS?** Nos dois seria a segunda
   verdade sobre o mesmo fato.
4. **Venda antiga que misturou produto e serviço** — existe? Se existir, ela
   reabre em qual modo? (Medir antes: pedido com item `kind='service'` **e**
   item de produto.)
