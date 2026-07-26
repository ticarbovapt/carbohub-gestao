# CRM — Outbound e Inbound: diagnóstico e plano

Mapeamento de 5 frentes paralelas sobre `apps/crm`, as edge functions e o banco.
Todo achado abaixo foi verificado direto no código antes de entrar aqui.

> **Este arquivo é a fonte de verdade do andamento.** Toda entrega marca o passo,
> no mesmo commit em que o código vai.

---

## 0. Placar

⬜ não começou · 🟡 em andamento · ✅ entregue · ⏸️ adiado

> **Reordenado em 26/07 a pedido do usuário.** O Chatwoot **não está conectado** —
> é coisa de futuro. Logo o Inbound automático não existe ainda: no começo os
> leads entram **manualmente, pelo SDR**. O Outbound passa a ser o caminho
> crítico e a fase de canais desce para o fim.

| # | Fase | O que resolve | Estado |
|---|---|---|---|
| **0** | Diagnóstico | este documento | ✅ |
| **1** | Bugs do Outbound | `repassado` como ganho + motivo de descarte errado | ⬜ |
| **2** | Unificar as listas de etapa terminal | dívida que morde na fase 4 | ⬜ |
| **3** | O cadastro do SDR | origem limpa + campos de qualificação | ⬜ |
| **4** | Colunas do Outbound (`nutricao`) | a rotina diária do SDR | ⬜ |
| **5** | Duplicação Outbound → Inbound | o handoff do SDR | ⬜ |
| **6** | Colunas do Inbound (`orcamento`, `formalizacao`) | o funil do closer | ⬜ |
| **7** | Flag `waiting_on` — o "parado" | a dor da negociação | ⬜ |
| **8** | Elo card ↔ orçamento (`/vender`) | "o sistema todo se conversar" | ⬜ |
| **9** | Canais automáticos (webhooks, formulário, Chatwoot) | ⏸️ **adiado** — Chatwoot não existe ainda | ⏸️ |

**Os bugs do Inbound (B3, B5, B6) não sumiram** — foram redistribuídos: B3 entra
na fase 6, B5 e B6 na fase 8, junto com o código que eles destravam.

---

## 1. O que está quebrado hoje

Seis defeitos ativos, todos verificados. Nenhum deles dá erro na tela — eles
**mentem em silêncio**, que é pior, porque ninguém abre chamado.

### B1 — Lead de anúncio e de WhatsApp cai num buraco ⏸️ (fase 9)

> Adiado com o resto da fase 9. O Chatwoot não está conectado, então essa metade
> do defeito é teórica. **A metade do Meta Ads não é** — se aquele webhook estiver
> recebendo, tem lead entrando no buraco agora. Conferir com a query no fim desta
> seção antes de decidir se adianta ou não.


`supabase/functions/crm-webhook-meta/index.ts:92` e
`crm-webhook-chatwoot/index.ts:67` gravam em **`crm_leads`** (tabela do Controle
legado) com `funnel_type: "f1"` e `stage: "a_contatar"`.

O CRM lê `crm_sales_leads`, e `f1` **saiu de `FUNIS_VISIVEIS`** na consolidação.
**Todo lead de Meta Ads e de Chatwoot está indo para uma tabela e uma pipeline
que ninguém abre.** É metade do Inbound que já existe, entregando no lugar errado.

### B2 — `repassado` conta como venda ganha 🔴

Em três lugares: `useCRMLeads.ts:244` (`GANHO`), `StageProgressBar.tsx:6`
(`WIN_IDS`) e `Pipelines.tsx:44` (bucket `ganho`).

Um card em "Passado ao Closer" entra em `ganhos` **e soma `estimated_revenue`**
(`useCRMLeads.ts:255`). Repassar não é vender. Isso infla o card "Ganhos" da home
e a taxa de conversão — e **inviabiliza a duplicação** da fase 6: o mesmo negócio
contaria duas vezes.

### B3 — Lead ganho no Inbound nunca recebe `won_at`

`useCRMLeads.ts:340` carimba `won_at` só para `convertido`, `parceiro` e
`fechamento`. O id do Ganho no f11 é **`ganho`** — fora da lista. Todo negócio
fechado no Inbound fica sem data de fechamento.

### B4 — Motivo de perda vem pré-selecionado como "Preço"

`Pipelines.tsx:165,417,424` e `DealDetail.tsx:82` inicializam com
`LOSS_REASONS[0]`, que é `"Preço"`. Estamos **fabricando uma base onde "Preço" é
o motivo dominante por inércia de clique**, não por realidade.

### B5 — O botão "Gerar venda deste lead" está morto

`DealDetail.tsx:263` exige `stage === "ganho"`, mas o id do Ganho no f13 é
`convertido` (`types/crm.ts:130`). **O botão nunca aparece no funil ativo.**
Mesmo problema em `LeadDrawer.tsx:152`.

### B6 — O `/vender` recebe o `lead.id` e joga fora

`DealDetail.tsx:191` e `LeadDrawer.tsx:44` já mandam `id: lead.id` no
`state.fromLead`. O tipo inline em `Vender.tsx:223` **não declara `id`** e o
efeito nunca o lê. Metade do elo já existe e é descartada em silêncio.

### B7 — O motivo de descarte não serve para prospecção 🆕

`LOSS_REASONS` (`types/crm.ts:263`) foi escrita para **perda de negociação**:
Preço, Concorrente, Já usa produto similar, Timing.

O SDR descarta por outra coisa inteira: *não é ICP*, *não tem frota*, *não achei
o decisor*, *não existe canal de contato*, *é cliente da base*, *é concorrente*.
**Nada disso está na lista.** Somado ao B4 (vem pré-marcado como "Preço"), o
resultado é previsível: **todo descarte do Outbound vira "Preço" ou "Outro"**, e
o SDR nunca consegue responder a única pergunta que importa pra ele — *estou
prospectando a lista errada?*

Como o descarte do SDR é a métrica que corrige a prospecção, isso entra na
fase 1 junto com o B4, e não depois.

### B8 — O `source` já nasce sujo no cadastro manual 🆕

`LeadForm.tsx:42` inicializa `source: "Prospecção ativa"` (com acento e espaço),
enquanto o **default do banco é `prospeccao_ativa`**. As duas convenções gravam
na mesma coluna. Todo lead criado pelo formulário e todo lead criado por qualquer
outro caminho **já caem em categorias diferentes num `group by source`** — antes
mesmo de existir integração de anúncio.

É barato consertar agora e caro depois: cada dia de prospecção manual são mais
linhas para normalizar.

### Bônus de segurança

Os dois webhooks rodam com `verify_jwt = false` e o secret é **opcional no
código**. Se `CHATWOOT_WEBHOOK_SECRET` não estiver setado no Supabase, qualquer
um na internet cria lead no banco. Fica com a fase 9, **exceto** se a query
abaixo mostrar que o Meta já está recebendo.

### Query para decidir se o B1 pode mesmo esperar

```sql
select funnel_type, stage, source, count(*), max(created_at) as ultimo
  from public.crm_leads
 where created_at > now() - interval '90 days'
 group by 1,2,3 order by ultimo desc;
```

Vazio → o B1 é teórico e espera. Com linhas → tem lead real preso lá, e a
correção sobe para a fase 1.

---

## 2. O terreno

**`stage` é TEXTO LIVRE, sem CHECK** — confirmado em
`20260406_crm_universal_leads.sql:11` e no comentário explícito de
`20260715170000:4`. Ids novos entram **sem nenhum DDL**.

O risco não é o banco rejeitar. É o front **classificar errado sem avisar**:
`normalizeStage` (`Pipelines.tsx:48`) tem fallback silencioso para `"andamento"`,
e um lead com stage fora do funil **some do kanban** (`KanbanBoard.tsx:39`) — sem
coluna "outros", sem erro. O vendedor conclui que o card foi apagado.

**Só um objeto de banco lê stage por literal:** o trigger
`crm_sales_lead_auto_task_trg` (`20260611000019:22-26`), codificado exatamente
nos ids do f11 (`novo`, `contato`, `qualificado`, `proposta`, `negociacao`).
Renomear qualquer um deles **para as tarefas automáticas do Inbound em silêncio**.
O Outbound nunca teve automação — só `qualificado` dispara, por coincidência de
nome.

**`crm_metas_board` não toca em stage** — roda sobre `carboze_orders`. Metas e
comissão estão imunes.

**O histórico está protegido.** `stageLabelAnywhere` (`types/crm.ts:254`) tenta o
funil atual e cai no `LEGACY_STAGE_LABELS` — foi o que salvou a consolidação
f1..f9→f13. Basta **não remover entradas do dicionário**.

---

## 3. As colunas propostas

Princípio: **reaproveitar id sempre que a pergunta for a mesma.** Cada id
preservado é uma linha que não entra em UPDATE. É o que a fase 3 da consolidação
fez e deu certo.

### Outbound (f12) — dono: SDR

| id | label | Pergunta que responde | Sai quando |
|---|---|---|---|
| `prospeccao` | Prospecção | *esse alvo merece cadência?* | tem canal de contato válido + segmento |
| `cadencia` | Em Cadência | *consigo alcançar essa pessoa?* | houve resposta humana |
| `conectado` | Conectado | *falei com quem decide ou influencia?* | decisor/influenciador identificado, com nome |
| `qualificado` | Qualificado (SQL) | *vale o tempo do closer?* | volume, dor, decisor e prazo preenchidos |
| `reuniao` | Reunião Agendada | *está na agenda do closer?* | reunião aconteceu — no-show volta para `cadencia` |
| **`nutricao`** 🆕 | Nutrição | *quando eu volto a falar?* | chega a data → volta para `cadencia` |
| `repassado` | Passado ao Closer | terminal — dispara a duplicação | — |
| `descartado` | Descartado | terminal | — |

**Nenhum UPDATE necessário.** `nutricao` nasce vazia.

### Inbound (f11) — dono: Closer

| id | label | Pergunta que responde | Sai quando |
|---|---|---|---|
| `novo` | Lead Recebido | *de onde veio e é pra mim?* | 1ª tentativa. **Duplicata do SDR entra direto em `qualificado`** |
| `contato` | Em Contato | *consigo falar com a pessoa?* | conversa real, não "mandei mensagem" |
| `qualificado` | Diagnóstico (SQL) | *sei volume, dor, decisor e prazo?* | os 4 campos preenchidos |
| **`orcamento`** 🆕 | Orçamento | *o preço está montado?* | orçamento salvo e vinculado ao card |
| `proposta` | Proposta Enviada | *o cliente recebeu e entendeu?* | o cliente respondeu |
| `negociacao` | Negociação | *qual é a objeção?* | acordo verbal ou perda |
| **`formalizacao`** 🆕 | Formalização | *o que falta pra virar pedido?* | pedido emitido |
| `ganho` | Ganho | terminal — **exige pedido emitido** | — |
| `perdido` | Perdido | terminal — motivo obrigatório | — |

**Nenhum UPDATE necessário.** As duas colunas novas nascem vazias.

### Por que essas duas colunas, e não outras

**`orcamento` separado de `proposta`** responde metade da sua dor sozinho, sem
campo novo: card parado em Orçamento = **o closer não montou o preço**. Card
parado em Proposta = **o cliente não respondeu**. Culpados diferentes, colunas
diferentes.

**`formalizacao` extraído de `negociacao`**: "estamos negociando" e "já fechamos,
falta papel" têm probabilidade, ação e previsão de receita completamente
diferentes. Hoje moram juntos e o forecast é ficção.

⚠️ **Não usar o id `fechamento`** para essa coluna — ele já está em `WIN_IDS`,
`GANHO` e `isTerminalStage`, e carimba `won_at`. Um card lá contaria como venda.
Daí `formalizacao`.

### A coluna Negociação hoje responde a cinco perguntas ao mesmo tempo

1. o cliente pediu desconto e estou remontando → **minha vez**
2. a proposta está com o decisor → **vez do cliente**
3. falta cadastro/IE/limite de crédito → **vez do backoffice**
4. o closer não deu follow-up → **ninguém está tocando**
5. o cliente sumiu e o closer não marca como perdido → **card zumbi**

Com critério de entrada duro (*o cliente respondeu com uma objeção*), ela deixa
de ser depósito e vira a lista de brigas ativas.

---

## 3-A. O cadastro do SDR — onde o Outbound realmente começa

Com o Chatwoot fora, **`LeadForm.tsx` é a única porta de entrada de lead do
sistema.** Ele foi escrito para um vendedor anotando um contato, não para um SDR
prospectando em volume. Três coisas faltam.

### O critério de saída de `qualificado` não tem onde ser gravado

A tabela definiu que o lead sai de Qualificado quando *volume, dor, decisor e
prazo* estão preenchidos. **Nenhum desses quatro existe como campo.** O que
existe é `notes` (texto livre), `fleet_size` (número) e `custom_fields jsonb`
(vazio, nada lê).

Isso não é detalhe de tela — é o que decide se a fase 5 funciona. Se a
qualificação mora num parágrafo de `notes`, o closer recebe **um card com um
texto corrido** e vai ter que ligar de novo para perguntar o que o SDR já
perguntou. O handoff perde o sentido.

**Recomendado:** quatro colunas de verdade, não `custom_fields`.

```sql
qual_volume    text   -- frota / consumo declarado
qual_dor       text   -- o problema que ele contou
qual_decisor   text   -- nome e cargo de quem assina
qual_prazo     text   -- quando pretende resolver
```

Colunas, e não `jsonb`, porque **isso vai virar relatório** ("quantos SQL sem
decisor identificado?") e porque a duplicação da fase 5 precisa copiar campo a
campo. `custom_fields` é bom para o que varia por cliente; esses quatro são fixos.

Na tela: um bloco *Qualificação* que **só aparece quando o funil é o Outbound** —
o vendedor do f13 não deve ver isso.

### A origem precisa virar valor fechado

O B8 acima. `source` passa a gravar em snake_case, com o rótulo bonito só na
tela, e as linhas antigas são normalizadas na mesma migração.

### O cadastro é lento demais para prospecção em volume

Hoje são 11 campos, e o SDR abre esse modal dezenas de vezes por dia. Para um
lead recém-prospectado, **nome + telefone + segmento já bastam** — cidade, UF,
receita estimada e temperatura são coisa de depois da conversa.

**Recomendado:** no Outbound, o formulário abre curto (nome, contato, segmento,
origem) com o resto atrás de *"mais detalhes"*. Nada é removido — só sai da
frente. E a temperatura sai de vez do cadastro: **um lead que acabou de ser
prospectado é frio por definição**, e deixar o campo lá só convida a mentir para
o próprio funil.

---

## 4. O "parado" — flag, não coluna

Três caminhos avaliados. **Coluna dedicada foi rejeitada**: "aguardando" é
ortogonal à etapa — dá para estar aguardando em Proposta, Negociação e
Formalização, e são coisas diferentes. Uma coluna só apaga a posição real do
negócio; uma por etapa dá 12 colunas. E vira o novo buraco negro.

**Recomendado: flag + relógio.**

```
waiting_on    null | 'cliente' | 'decisor' | 'interno' | 'credito_doc'
waiting_until date   -- OBRIGATÓRIO quando waiting_on ≠ null (CHECK no banco)
waiting_note  text   -- "Marcos leva pro sócio na terça"
```

O que faz funcionar:

1. **Card em `proposta`/`negociacao`/`formalizacao` precisa de uma de duas
   coisas**: `next_follow_up_at` com data, ou `waiting_on` com prazo. Sem
   nenhuma → **card vermelho "sem próximo passo"**. Esse é exatamente o sinal
   "o closer não foi atrás", capturado sem coluna nenhuma.
2. **Quando `waiting_until` vence, a flag cai sozinha.** Ninguém se esconde atrás
   de um "aguardando" eterno.
3. **4 chips de filtro no board** — Comigo · Aguardando cliente · Sem próximo
   passo · Prazo vencido. Mesma UI dos chips de Segmento que já existem.
4. **Matar o `temperature = "quente"` automático** (`useCRMLeads.ts:335`).
   Enquanto o sistema pintar de quente todo card que entra em proposta, qualquer
   indicador de "parado" será contradito pela cor.

**Critério da decisão:** coluna quando muda a **fila de trabalho**; flag quando
muda só o **motivo**. Card aguardando decisor continua sendo trabalho do mesmo
closer, na mesma etapa. Card em nutrição sai da rotina diária do SDR — por isso
`nutricao` É coluna.

---

## 5. Elo card ↔ orçamento

**90% já existe.** `/vender?edit=<id>` reidrata o formulário inteiro do
`quote_form_snapshot` (`Vender.tsx:471-511`), `useUpdateVendaFull` reescreve
mantendo o mesmo número, e `useConvertQuote` converte de forma idempotente.

**Falta:** tabela de ligação, o `/vender` ler o `lead` e o `back`, e o bloco no
card.

### Onde guardar — tabela de ligação, não coluna

Um lead tem **vários** orçamentos ao longo do tempo (v1, v2, revisão), o que mata
`quote_id` em `crm_sales_leads`. E coluna em `carboze_orders` acoplaria o ERP ao
CRM — a tabela é compartilhada por ops/financas/admin/ti, Bling, shipments e
receivables.

```sql
create table public.crm_lead_orders (
  id         uuid primary key default gen_random_uuid(),
  lead_id    uuid not null references public.crm_sales_leads(id) on delete cascade,
  order_id   uuid not null references public.carboze_orders(id)  on delete cascade,
  version    int  not null default 1,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (order_id)
);
```

É o padrão que o repo já usa em `ops_shipments` e `bling_nfe`. E tem uma
vantagem decisiva: **zero superfície de contato com os outros 4 apps.**

### O gatilho — não navegar dentro do drop

O kanban faz update otimista e `fire-and-forget` (`Pipelines.tsx:282`). Navegar
de dentro do `handleDragMove` desmonta a árvore **enquanto a mutation está em
voo** — se ela falhar depois do unmount, o estágio no banco fica diferente do que
o usuário viu, e o toast de erro fica órfão.

**Recomendado:** no drop em `orcamento`, `await mutateAsync` e então abrir o
`DealDetail` (estado que já existe, `Pipelines.tsx:166`) com o bloco de orçamento
em destaque. O `navigate("/vender")` acontece num clique deliberado. Isso também
resolve o "abriu e desistiu": mover para Orçamento passa a significar
**"precisa de orçamento"**, e a coluna vira fila de trabalho legítima.

### Mover para Ganho

Busca o orçamento `quote` mais recente do lead → se achou, oferece reabrir
`?edit=<id>`; o closer confirma e o `handleSell` já faz update + convert + cria a
OS de descarbonização. Se nada mudou, atalho "Converter direto" chamando
`useConvertQuote` sem abrir o formulário.

⚠️ **`?edit=` não valida status hoje** (`Vender.tsx:121-129`). Reabrir um pedido
já `pending` e salvar **rebaixa para `quote`**. O caller novo precisa filtrar por
`status === 'quote'`, como o `Vendas.tsx:417` já faz.

### Só no CRM

As 5 cópias do `/vender` **já divergiram**: só o CRM importa `useSearchParams`,
`useUpdateVendaFull` e `useConvertQuote`. **Os outros 4 apps não têm modo `?edit=`
nenhum.** O comentário em `Vender.tsx:44-47` ("tela ÚNICA e IDÊNTICA em todos os
apps") está desatualizado — não confiar nele.

---

## 6. Duplicação Outbound → Inbound

**Não existe nada hoje** — `repassado` só move a coluna.

**Modelo: duplicar de verdade (2 linhas)**, que é o pedido. A alternativa de
"mover" foi rejeitada porque faria **o board do SDR mentir sobre o trabalho
dele** — mesmo argumento que a consolidação f13 já usou.

Mas duplicar exige três coisas **junto**, senão a métrica quebra no primeiro mês:

1. **Vínculo com FK real:** `origin_lead_id uuid references crm_sales_leads(id)`
   + `origin_funnel_type`. É o que permite a qualquer relatório contar o negócio
   **uma vez** (`where origin_lead_id is null`).
2. **Regra de contagem única:** o negócio conta na linha **filha** (onde a
   receita se realiza); a do SDR conta como **SQL entregue**, nunca como receita.
   Na prática: o B2 acima.
3. **Idempotência:** `unique index on (origin_lead_id) where not null`. Hoje
   **não existe nenhuma unique key na tabela** — dois cliques geram dois cards.

### O que a RPC copia e o que não copia

`crm_sales_lead_activities` é **a timeline, os comentários E as tarefas ao mesmo
tempo** (discriminador `activity_type`). Copiar "os comentários" é copiar essa
tabela — e aí:

- **`SECURITY DEFINER` é obrigatório.** A policy de INSERT força
  `created_by = auth.uid()`; copiar pelo cliente **falsificaria a autoria de todo
  comentário do SDR**.
- **Não clonar tarefa pendente** — duas pessoas cobradas pelo mesmo trabalho.
  Copiar como `done`, marcada em `meta` como herdada.
- **Marcar tudo** com `meta.copiado_de` — sem isso a timeline do Inbound vira
  ficção, sem distinguir herdado de novo.
- **Não copiar** `won_at`, `lost_at`, `legacy_funnel_type`, `legacy_stage` (esses
  dois são o rollback da fase 3 — reutilizá-los corrompe aquele mecanismo).

### A cópia nasce invisível para o closer

A RLS só deixa ler quem é `created_by` ou `assigned_to`
(`20260611000014:37-52`). Como o INSERT força `created_by` = quem executa (o
SDR), **o closer só enxerga pelo `assigned_to`**. E **não existe conceito de
"time de closers" no banco** — atribuir a quem é decisão de produto sem dado onde
se apoiar. **Precisa ser respondida antes da fase 6.**

---

## 7. Origem e canais

| Item | Situação |
|---|---|
| Webhook Meta Ads | existe — grava no lugar errado (B1) |
| Webhook Chatwoot | existe, só `conversation_created` — lugar errado (B1) |
| **CRM → Chatwoot** | **não existe** — zero código, zero credencial |
| Formulário público | **não existe**; `carbohub-landing` é o portal de login, não o site de marketing |
| Google / TikTok / LinkedIn Ads | **são rótulos no dropdown**, não integrações |
| `utm_*` | **nenhuma coluna existe** |
| Dedupe de lead | **não existe** |
| `source` | existe, `TEXT` sem CHECK |
| `tags TEXT[]` | existe no banco e no tipo — **nenhum componente lê ou escreve** |

**O `source` já está sujo:** três convenções gravando ao mesmo tempo —
`prospeccao_ativa` (default do banco), `"Prospecção ativa"` (formulário) e
`"Meta Ads"` (webhook). Um `group by source` hoje já devolve categoria duplicada.

**Modelo recomendado:** `source` como enum fechado em snake_case (relatório),
`created_via` para como a linha entrou (debug), `utm jsonb` para o detalhe da
campanha. **Não usar `tags[]` para origem** — origem é mutuamente exclusiva;
array vira relatório impossível.

**Tamanho honesto:** corrigir os webhooks e acrescentar as colunas é barato.
Formulário público e o sentido CRM→Chatwoot são **integração do zero**, e o
segundo está bloqueado por credenciais e por uma instância de Chatwoot que
**ninguém confirmou que existe**.

---

## 8. Decisões que dependem de você

1. **A cópia é atribuída a quem?** Não existe "time de closers" no banco. Um
   closer fixo? Rodízio? O SDR escolhe na hora de repassar?
2. **O card do SDR conta o quê?** A proposta é "SQL entregue", nunca receita.
   Confirma?
3. **9 colunas no Inbound é demais?** Se quiser 8, o corte é `contato` (funde em
   `novo` com contador de tentativas). **Não cortar `orcamento` nem
   `formalizacao`** — são os dois que resolvem a dor.
4. ~~**Existe instância de Chatwoot rodando?**~~ **Respondido em 26/07: não.** É
   coisa de futuro. A fase 9 fica adiada até existir instância.

---

## 9. Ordem de execução

A régua: **primeiro o Outbound funcionar de ponta a ponta** (cadastrar →
qualificar → repassar), porque é por ali que todo lead entra enquanto não há
canal automático. Só depois o funil do closer.

| Fase | Por que nessa ordem |
|---|---|
| 1 — bugs do Outbound (B2, B4, B7) | `repassado` como ganho **inviabiliza a fase 5**; e o motivo de descarte é a métrica que corrige a prospecção — cada dia sem ele é dado perdido que não volta |
| 2 — unificar `WIN_IDS`/`GANHO`/`isTerminalStage` | **três listas duplicadas do mesmo conceito**; mexer em coluna sem unificar é errar em três lugares. Sai de graça junto com a 1 |
| 3 — cadastro do SDR (B8 + qualificação) | é a única porta de entrada do sistema hoje. Precisa vir **antes** da 5: sem campo estruturado, o handoff entrega texto corrido |
| 4 — coluna `nutricao` | zero SQL, zero migração. Fecha a rotina diária do SDR |
| 5 — duplicação → Inbound | fecha o ciclo do Outbound. Depende da 1, da 3 e de **uma decisão sua** (a quem atribuir) |
| 6 — colunas do Inbound + B3 | a partir daqui é o funil do closer |
| 7 — `waiting_on` | a dor da negociação, que é etapa de closer |
| 8 — orçamento + B5 + B6 | 90% já existe; é o acabamento |
| 9 — canais ⏸️ | **adiado** — Chatwoot não conectado. Reabrir quando a instância existir |

**As fases 1 e 2 não dependem de nenhuma decisão sua.** A 3 e a 4 dependem de
concordância com o desenho acima, não de informação que só você tem. A 5 é a
primeira que trava numa pergunta em aberto.
