# Esteira do On-line — mapa, riscos e plano de reforma (14/11/2026)

Pedido do dono do processo: *"verificar essa esteira toda e organizar os pontos
de melhoria, aproveitando o que ela tem, gravar isso e ter um rollback caso
nossa tentativa quebre o que funciona hoje, mesmo funcionando meio capenga"*.

Regra da reforma: **nada é mexido antes da FOTO** (`20261155`), e **cada passo
tem a sua volta escrita antes de ir ao ar**.

---

## 0. A foto de partida (14/11/2026)

`carbo_foto_esteira_tirar('antes-reforma-2026-11-14')` guardou **11 views,
16 funções, 48 crons e 5 tabelas de config**; o ensaio do restaurar logo depois
voltou vazio (a volta está provada).

```
cards por etapa no instante da foto      13/11 (antes da reconferência)
entregue     3.605                        3.036
etiqueta       602                          677
em_transito    385                          703
confirmado      71
nf_emitida      42
cancelado      105
```

A reconferência do Melhor Envio (13/11) já tinha levado ~570 cards a
"entregue" e tirado ~320 de "em trânsito" antes da foto. É deste retrato que
cada fase mede o "antes".

---

## 0b. O raio-x (15/11/2026) — e o que ele mudou na ordem

```
(a) esteira        4.823 cards; 724 entregues com > 60 dias, 38 com > 120   peso morto pequeno
(b) carbo_msg_fila 14.303 ms   (limite do whatsapp-meta: 8 s)               ⚠️ URGENTE
(c) timeouts 24 h  360 de 1.998 respostas                                    ⚠️ URGENTE
(d) vínculo ME     766 de 766 confirmados                                    P3 não existe hoje
(e) ML             as duas contas ativas, sem erro                           P4 quieto
(f) reconferência  0 sem conferir há 2 h, de 789 abertos                     a de 13/11 gira
(g) rastreio       bling 709 · plataforma 178 · melhorenvio 108             P7 = 108 cards
```

O tempo da fila NÃO era a esteira (568 ms) nem a recompra (641 ms): eram os
três ramos de carrinho, ~4,3 s cada, todos no mesmo passo — o
`tem_mais_novo` ("existe carrinho mais novo da mesma pessoa"), que varria
todo carrinho aberto mais novo com `regexp_replace` por linha (custo ao
quadrado). Corrigido na `20261156` (dois índices por expressão + o `exists`
em duas metades), medido local: 8,7 s → 31 ms, as mesmas colunas.
Isso passou na frente da Fase 1: com a fila em timeout, nenhum aviso sai.

✅ **Aplicada em 15/11/2026 às 17h29: a fila foi de 14.303 ms para 1.477 ms**
em produção. Cada ramo de carrinho caiu de ~4.340 ms para ~30 ms, e os dois
índices novos aparecem no plano. O que sobra é a esteira (~600 ms) e a
recompra (~720 ms), que relê a esteira inteira para achar os entregues — é o
próximo candidato, sem pressa: 1,5 s está longe dos 8 s.

---

## 1. As peças (o que existe hoje e NÃO se joga fora)

```
FONTES (cron)                                         O QUE GRAVAM
bling2-sync-incremental     1 min   pedidos e NF da filial      bling2_orders, bling2_nfe
bling2-order-details-10min  10 min  detalhe do pedido (→ NF)    bling2_orders.raw_detalhe
ecommerce-sync-5min         5 min   status nas plataformas      ecommerce_orders
melhor-envio-envios-15min   15 min  etiquetas + RECONFERÊNCIA   melhorenvio_envios
melhorenvio-conciliar-5min  5 min   liga etiqueta ↔ pedido      melhorenvio_envios.bling_id
rastreio-sync-5min          5 min   trajeto (ME)                rastreio_envios
bling-sync (2×/dia)                 matriz: ML Full             bling_orders

REGRA (views no banco — a tela não calcula nada)
bling2_esteira              a etapa de cada pedido (Bling 2 + on-line do Bling 1)
ecommerce_aguardando_bling  a coluna "Pago" (complemento da esteira)
melhorenvio_envio_vigente   a etiqueta que vale por pedido
carbo_recompra_pipeline · carbo_carrinho_pipeline   as outras duas réguas
carbo_msg_fila              o que o WhatsApp manda AGORA (lê as três)
carbo_esteira_parados       parado além do limite (carbo_esteira_limite)
carbo_entrega_pendencias()  a tela de Pendências (20261154)

SAÍDA
whatsapp-meta  1 min, lê 150 da fila      →  carbo_msg_envios (o ledger: 1 aviso por etapa por pedido)
telas          Admin · Atendimento · Marketing (EsteiraOnline/MensagensCliente, cópias idênticas)
               Atendimento: Conversas, Pendências de entrega
```

O que **funciona e fica**: a etapa decidida no banco; o ledger
`carbo_msg_envios` como freio (linha `ignorado` = não manda); a janela de
horário e o teto por etapa; o marco zero da fila; a reconferência do ME
(13/11); o "Pago" como complemento exato da esteira.

---

## 2. Riscos e melhorias, por prioridade

Cada item: **o que acontece · evidência · proposta (reaproveitando) · risco ·
como medir · como volta**. As consultas são `supabase/consultas/esteira_raio_x.sql`.

### P1 — A esteira recalcula o histórico INTEIRO a cada leitura ⚠️ o maior risco
- **O que acontece:** a view não tem fim — todo pedido desde 12/06 (3.036
  entregues em 13/11) é recalculado a cada leitura. Quem lê: a fila (1×/min),
  cada aba aberta da Esteira (a cada 10 s, ver P2), Pendências, parados,
  recompra. A fila estourou o timeout em 10/09 (18 dias sem WhatsApp) e em
  07/10. Cada semana de venda a deixa mais pesada; Black Friday (27/11) é o
  pico.
- **Proposta:** a view passa a calcular só o que ainda pode mudar —
  não-entregues + entregues dos últimos N dias (a recompra precisa de ~75:
  45 para ofertar + 30 para desistir; N medido no raio-x (a)). O histórico
  continua consultável por uma view irmã, só para leitura.
- **Risco:** é a view que alimenta o WhatsApp. Mexer nela = freio
  (`ignorado`) ANTES + foto + medir a fila antes e depois (b).
- **Volta:** `carbo_foto_esteira_restaurar(...)`.

### P2 — A tela relê a esteira a cada 10 s, por aba, em três apps
- **O que acontece:** `RECARGA_MS = 10_000` no `useEsteiraOnline` (admin,
  atendimento, mkt) relê `bling2_esteira` (paginado: cada página recalcula a
  view) e o "Pago". Cinco abas abertas = 30 leituras da view por minuto, mais
  a fila. As fontes andam a cada 1–15 min: 10 s não traz dado mais novo.
- **Proposta:** 60 s + reler ao voltar o foco da aba. Só tela, cópia
  idêntica nos três.
- **Risco:** baixo (nenhuma regra muda). **Volta:** reverter o PR.

### P3 — Etiqueta do ME sem vínculo fica parada para sempre, e não há tela
- **O que acontece:** o card só anda se a conciliação ligar a etiqueta ao
  pedido. `sem_match`/`ambiguo` ficam invisíveis; só aparecem por SQL.
- **Proposta:** aba "Sem vínculo" na tela de Pendências, com vincular à mão
  (RPC com as MESMAS travas da conciliação: unicidade dos dois lados).
- **Medir:** raio-x (d). **Volta:** reverter o PR; a RPC só grava vínculo.

### P4 — ML Full pode perder pedido, calado
- **O que acontece:** `/orders/search` sem paginação (o ML devolve 50) e as
  duas contas batem juntas (429). Pedido fora da janela nunca entra.
- **Proposta:** paginar (`offset`) e espaçar as duas contas no mesmo cron.
- **Medir:** raio-x (e). **Volta:** reverter o PR (o checkpoint por conta
  não muda).

### P5 — Fôlego para a Black Friday
- **O que acontece:** reconferência do ME 300/15 min, rastreio 60/5 min,
  WhatsApp 150/min. Hoje sobra; no pico o card demora mais a andar (não
  trava).
- **Proposta:** números em CADASTRO (tabela de config), não em código —
  aumentar no dia sem deploy.
- **Medir:** raio-x (f). **Volta:** voltar o número.

### P6 — Ninguém é AVISADO quando a esteira para
- **O que acontece:** timeout da fila, espelho parado, conexão do Bling
  desligada: tudo isso aparece só se alguém abrir a tela ou rodar SQL
  (`pg_cron` marca `succeeded` mesmo quando a função falhou).
- **Proposta:** um cron de saúde que lê `net._http_response`, os logs dos
  espelhos e `bling2_integration`, e manda UM aviso no sininho do TI quando
  algo para — molde do resumo diário de parados (`carbo_alertar_parados`).
- **Volta:** desligar o cron.

### P7 — Rastreio só pelo código do BLING
- **O que acontece:** a view junta `rastreio_envios` pelo código que o Bling
  conhece. Card cujo código veio só do ME anda pelo espelho, mas a view não
  enxerga previsão, devolução nem "problema" — e a Pendências não os classifica
  como "Problema na transportadora".
- **Proposta:** juntar por `coalesce(código do Bling, código do ME)`.
- **Risco:** é a view (freio + foto). **Medir:** raio-x (g).

### P8 — Pedido resolvido na Pendências continua na Esteira
- **Proposta:** quem foi marcado Resolvido/Reembolsado/Sem solução sai do
  quadro (só tela, como as colunas recolhidas), continua na Pendências
  ("Tratados"). **Volta:** reverter o PR.

### P9 — Bling 1 sincroniza 2×/dia
- Afeta a NF do ML Full na matriz (até 6 h). O card do Full anda pelo status
  da plataforma, então pesa pouco. Fica por último.

---

## 3. Ordem proposta

```
Fase 0  foto + raio-x                                 (nada muda)
Fase 1  P2 · P8                                       só tela — sem risco de WhatsApp
Fase 2  P5 · P4 · P6                                  funções — volta pelo git
Fase 3  P1 · P7                                       a VIEW — freio + foto + medir a fila
Fase 4  P3                                            tela + RPC de vínculo manual
```

Cada fase: medir antes → prévia (tela) → mergear → medir depois → registrar
aqui o número de antes e de depois.

---

## 4. Rollback

**Banco** (views, funções, crons, config de mensagens) —
`supabase/migrations/20261155000000_esteira_foto_para_rollback.sql`:

```sql
-- 1º ensaio: mostra o que vai voltar, não muda nada
select public.carbo_foto_esteira_restaurar('antes-reforma-2026-11-14');
-- 2º de verdade (tudo ou nada)
select public.carbo_foto_esteira_restaurar('antes-reforma-2026-11-14', false);
```

- Testado num Postgres local: reforma que mudou função, view (coluna nova e
  sem `security_invoker`), grants, cron (agenda, comando, desligado), cron
  novo e template → a volta restaurou tudo, o cron novo ficou DESLIGADO, e um
  segundo ensaio voltou vazio.
- ⚠️ View NOVA criada pela reforma em cima das da foto bloqueia a volta (o
  erro diz qual): apague-a primeiro. É de propósito — sem CASCADE.
- Não volta: linha de config apagada, dado (pedido, envio, mensagem).

**Código** (edge functions e telas) — o `main` antes da reforma é
`84cbe4d9` (14/11/2026). Cada fase é um PR; voltar = `git revert` do PR e
push em `main` (o push deploya as funções de novo).
