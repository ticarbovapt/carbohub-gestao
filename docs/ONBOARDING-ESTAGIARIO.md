# Manual de Onboarding — Sistemas Carbo

> **Para quem está chegando agora no time de tecnologia.**
> Leia este documento **inteiro** antes de mexer em qualquer código.
> Ele explica o que existe hoje, por que está sendo reorganizado, e as
> regras que evitam quebrar o sistema que está no ar.
>
> _Última atualização: junho/2026._

---

## 0. Como usar este manual

- **Parte I** — entenda o sistema que existe hoje (o "controle").
- **Parte II** — entenda o plano de separar tudo em CRM, ERP e Portais.
- **Parte III** — as regras de ouro (o que pode e o que não pode mexer).
- **Parte IV** — glossário e primeiros passos práticos.

Se em algum momento você pensar _"acho que é aqui que mexo"_ e não tiver
certeza absoluta — **pare e pergunte.** Esse é o reflexo mais importante do
manual inteiro.

---

# PARTE I — O sistema que existe hoje

## 1. O que é o "controle"

O **controle** é o sistema que a Carbo usa no dia a dia, **vivo, no ar agora**.
Ele não é um sistema pequeno: é um **mega-monólito** — vários produtos
diferentes morando dentro de um app só, no mesmo banco de dados, com o mesmo
deploy.

| Métrica | Quantidade |
|---|---|
| Rotas / telas | **~112** |
| Tabelas no banco (Postgres) | **~116** |
| Hooks (funções de dados) | **~381** em 93 arquivos |
| Edge functions (back-end serverless) | **~41** |
| Integrações externas | Bling, Nuvemshop, Mercado Livre, Amazon, Vindi, Meta, Chatwoot, Melhor Envio, CNPJ, entre outras |

Por isso a gente chama, com carinho, de **"frankenstein"**: são **8 domínios de
negócio** convivendo no mesmo lugar. Mexer numa parte pode, sem querer, afetar
outra. É justamente por isso que existe um plano de separação (Parte II).

## 2. A stack (as ferramentas)

Tudo que você precisa conhecer pra começar:

| Camada | Ferramenta | Pra que serve |
|---|---|---|
| Front-end | **React + TypeScript** | A interface (as telas) |
| Build/dev | **Vite** | Roda e empacota o front |
| Banco + Auth + tempo real | **Supabase** (Postgres) | Onde os dados vivem, login, e regras de segurança (RLS) |
| Busca de dados | **TanStack Query** | Carrega dados do banco e faz cache |
| Visual | **shadcn/ui + Tailwind CSS** | Componentes prontos e estilo |
| Gráficos | **Recharts** | Dashboards |
| Kanban (arrastar cards) | **dnd-kit** | Funis de venda |
| Deploy | **Vercel** | Sobe o site automaticamente a cada `git push` |

**Importante:** o deploy é **automático**. Você dá `git push` na branch certa e a
Vercel publica sozinha. Você nunca precisa de senha ou token da Vercel pra isso.

## 3. Como funciona o acesso às telas (Role Matrix)

Esse é o conceito mais importante do sistema atual. Preste atenção aqui.

No controle, **quem vê qual tela** é controlado por uma "matriz de acesso"
(a **Role Matrix**). Funciona assim:

1. Cada pessoa tem um **departamento** e uma **função** no perfil
   (ex.: `cgc` + `vendedor_b2b`, ou `ti_suporte` + `colaborador`).
2. A tela `/role-matrix` é onde o admin **libera telas** por departamento/função.
3. Toda tela "protegida" tem um `screenId`. Se a combinação depto+função da
   pessoa não estiver liberada pra aquele `screenId`, ela **não vê** a tela.

```
Pessoa (depto + função) ──▶ Role Matrix ──▶ telas liberadas
```

### Regra obrigatória ao criar tela nova no controle
Toda vez que se cria uma página nova **com controle de acesso**, três arquivos
mudam **juntos** (sem exceção):

1. `src/App.tsx` — registra a rota com o `screenId`.
2. `src/constants/functionAccessConfig.ts` — registra a tela na lista da Role
   Matrix. **Se esquecer este passo, a tela não aparece pro admin liberar — e
   ninguém consegue acessar.**
3. Avisar que a tela nova já aparece em `/role-matrix` pro admin liberar.

### O superusuário: TI
Quem é do departamento **`ti_suporte`** (qualquer função) é **superusuário**:
enxerga **todas** as telas sem precisar de configuração na Role Matrix,
inclusive telas futuras. No banco, isso também vale pra ações de admin (como
criar usuários). É por isso que você, do TI, vê tudo.

> ⚠️ Esse poder é grande. Superusuário enxerga e mexe em tudo. Use com cuidado
> e na dúvida, pergunte antes de executar ações que criam/apagam dados.

## 4. Os armazéns (warehouses)

O estoque é organizado por "hub". Você vai ver esses códigos bastante:

| Código | O que é |
|---|---|
| `HUB-RN` | Hub Natal — produção, estoque de insumos |
| `HUB-SP` | CD São Paulo (LogHouse) |
| `HUB-SP-VENDAS` | CD São Paulo (Vendas) |

A tabela **`warehouse_stock`** é a **fonte de verdade** do estoque por hub.
Nunca use outro campo como atalho pra mostrar estoque.

## 5. Migrações de banco (mudanças no Postgres)

Quando se precisa mudar a estrutura do banco (criar coluna, função, etc.):

1. Cria-se um arquivo em `supabase/migrations/` com um carimbo de data/hora
   sequencial (ex.: `20260608000002_descricao.sql`).
2. **O arquivo no repositório NÃO altera o banco de produção sozinho.** Alguém
   com acesso precisa **rodar o SQL** no painel do Supabase (SQL Editor).

Decorar isto evita muita confusão: _"mas eu criei a migração, por que não
funcionou?"_ — porque ela ainda não foi **executada** no banco.

---

# PARTE II — O plano de separação (CRM + ERP + Portais)

## 6. Por que separar

O monólito cresceu demais. Separar resolve três dores:

- **Acesso** — cada sistema pequeno só conhece as próprias telas. Sem matriz
  gigante.
- **Deploy** — mexer no CRM não arrisca derrubar a produção.
- **Código limpo** — cada domínio no seu lugar, fácil de entender.

## 7. A arquitetura-alvo: 4 sistemas + 1 núcleo

```
                 ┌─────────────────────────┐
                 │   CORE (compartilhado)  │
                 │  auth, perfis, equipe,  │
                 │  acesso, auditoria      │
                 └────────────┬────────────┘
          ┌───────────┬───────┴───────┬───────────┐
          ▼           ▼               ▼           ▼
      ┌───────┐   ┌───────┐     ┌──────────┐ ┌──────────┐
      │  CRM  │   │  ERP  │     │ Portal   │ │ Portal   │
      │vendas │   │produç.│     │Licenciad.│ │ Lojas    │
      │       │   │financ.│     │          │ │ (PDV)    │
      └───────┘   └───────┘     └──────────┘ └──────────┘
```

- **CRM** — vendas, funis de lead, e-commerce, comercial, metas, comissões.
- **ERP** — produção, MRP, estoque, suprimentos, OS, financeiro, faturamento.
- **Portal Licenciados** — tudo dos licenciados CarboVapt (já é quase isolado).
- **Portal Lojas / PDV** — pontos de venda (já é quase isolado).
- **CORE** — o que todos compartilham: login, perfis, equipe, acesso.

## 8. O nó da questão: tabelas de fronteira

Separar **telas** é fácil. Separar o **banco** é o difícil, porque existem
~15 tabelas que vivem em **mais de um domínio ao mesmo tempo**, algumas com
"gatilhos" (triggers) que disparam efeitos entre domínios. Exemplos:

| Tabela | Quem usa | Por que é delicada |
|---|---|---|
| `warehouse_stock` | CRM + ERP + PDV | Venda no e-commerce **dá baixa** no estoque automaticamente |
| `service_orders` | CRM + ERP + Ops + Financeiro | Centro de tudo: venda gera OS, OS gera compra, OS alimenta faturamento |
| `carboze_orders` | CRM + Financeiro + Licenciado | Pedido B2C/frota/licenciado |
| `sku` / `mrp_products` | ERP + CRM + E-commerce | Produto/insumo único pra todo mundo |
| `profiles` / `function_screen_access` | **TODOS** | Base do login e da segurança |

São esses pontos que tornam "dividir o banco" um trabalho cirúrgico.

## 9. A estratégia escolhida (faseada)

Foram avaliadas três opções. A decisão foi:

> **Começar com um banco só, separando os apps; migrar pra bancos separados
> depois, parte por parte.** Assim ganha-se a organização sem parar a operação
> nem reescrever os gatilhos de uma vez.

Em ordem:
1. **Fase 0 — Fundação** _(em andamento)_: criar a base do CRM novo, login e
   modelo de acesso.
2. **Fase 1 — CRM**: migrar vendas/CRM/e-commerce.
3. **Fase 2 — ERP**: produção/financeiro/suprimentos/OS.
4. **Fase 3 — Portais**: licenciados e lojas (mais limpos).
5. **Fase 4 — Desligar** o monólito, depois que tudo rodar em paralelo e
   validado.

**O controle (atual) NÃO morre durante a migração.** A regra é: **copiar,
nunca cortar.** O sistema novo copia o que precisa; o antigo segue intacto.

## 10. O modelo de acesso NOVO (sem Role Matrix)

Esta é a maior diferença pra você entender. Nos sistemas novos **não existe
matriz tela-a-tela.** Em vez disso, três camadas:

```
CAMADA 1 — Quais SISTEMAS a pessoa entra (decidido no Hub/login).
CAMADA 2 — Nível dentro do sistema:
             • gestor → vê tudo + botões de gestão (filtrar, reatribuir)
             • membro → só o operacional do próprio escopo
CAMADA 3 — Escopo de dado (quais linhas a pessoa vê):
             proprio | equipe | departamento | global
```

O nível (gestor/membro) é **derivado** do departamento + função que a pessoa já
tem no perfil — não precisa configurar tela por tela.

### Crescimento por "capabilities", não por telas
Quando o sistema precisar de uma permissão nova, adiciona-se uma **capability**
(permissão nomeada) num arquivo de código — nunca uma linha numa matriz:

```ts
capabilities: {
  ver_todos_leads:      ["gestor"],
  reatribuir_lead:      ["gestor"],
  filtrar_por_vendedor: ["gestor"],
  editar_metas:         ["gestor"],
  exportar_relatorio:   ["gestor"],
}
```

> **Por que a matriz sumiu?** Ela era um *sintoma do monólito* (112 telas num app
> só). Com cada sistema pequeno e de um domínio só, ela não é mais necessária.

### Login único (Hub)
A ideia final é **1 pessoa = 1 conta**. A pessoa loga uma vez no Hub
(`carbohub.com.br`), vê os "azulejos" dos sistemas que pode acessar, e entra em
cada um sem logar de novo.

---

# PARTE III — Regras de ouro (decore estas)

Estas regras existem pra ninguém "desmontar o frankenstein e ficar sem saber se
o que tirou era um parafuso ou parte do corpo".

1. **Todo pedido nomeia o alvo.** "no CRM" → pasta `apps/crm`. "no controle" ou
   "no atual" → raiz do projeto (`src/`). Se não estiver dito, **pergunte**.

2. **Na dúvida, PERGUNTE — nunca adivinhe.** Se a mesma tela existe em mais de um
   app, liste os candidatos antes de mexer.

3. **O `controle` está congelado.** A raiz só recebe **correção crítica**.
   Funcionalidade nova vai pros apps novos (`apps/crm`, etc.).

4. **Mudança em código compartilhado (`packages/`) afeta vários apps.** Avise
   antes de aplicar.

5. **Cada app é autossuficiente.** O `apps/crm` tem o próprio build e
   dependências. **Não mexa no `package.json` da raiz** (a base de dependências
   do controle é frágil — risco de quebrar o deploy do que está no ar).

6. **Migração só vale quando é executada no Supabase.** Criar o arquivo `.sql`
   não basta.

7. **Copiar, nunca cortar.** Ao migrar algo pro sistema novo, o original no
   controle permanece até tudo estar validado.

---

# PARTE IV — Glossário e primeiros passos

## 11. Glossário rápido

| Termo | Significado |
|---|---|
| **Controle** | O sistema monolítico atual, no ar |
| **Monólito** | Um app só com tudo dentro |
| **CRM / ERP** | Os sistemas novos (vendas / operação-financeiro) |
| **Hub** | Tela única de login que leva aos sistemas |
| **RLS** | _Row Level Security_ — regras no banco que decidem quais linhas cada um vê |
| **Edge function** | Código de back-end que roda sob demanda no Supabase |
| **Migração** | Arquivo SQL que muda a estrutura do banco |
| **Role Matrix** | A matriz tela-a-tela do controle (só no sistema atual) |
| **Capability** | Permissão nomeada do modelo novo (substitui a matriz) |
| **screenId** | Identificador de uma tela protegida no controle |
| **Trigger** | Gatilho no banco que dispara uma ação automática |
| **Warehouse / Hub de estoque** | Local físico de estoque (`HUB-RN`, etc.) |
| **gestor / membro** | Níveis de acesso do modelo novo |
| **escopo de dado** | proprio / equipe / departamento / global |

## 12. Seus primeiros passos (sugestão)

1. **Leia este manual até o fim** (você está quase lá).
2. **Explore sem mexer:** abra o sistema, navegue pelas telas, veja o que existe.
3. **Leia o `CLAUDE.md`** na raiz do projeto — é o resumo de regras que o time
   segue.
4. **Leia `docs/ARQUITETURA-SEPARACAO.md`** — a versão técnica completa do plano.
5. **Faça sua primeira tarefa pequena e supervisionada** — de preferência no
   `apps/crm` (sistema novo), não no controle.
6. **Pergunte sempre que a dúvida for "onde mexo?".** É o reflexo certo.

## 13. O que você NÃO deve fazer no começo

- ❌ Mexer no `controle` (raiz `src/`) sem combinar — ele está no ar.
- ❌ Tocar no `package.json` ou nos lockfiles da raiz.
- ❌ Rodar migração em produção sem revisão.
- ❌ Apagar/sobrescrever dados sem ter certeza e autorização.
- ❌ Adivinhar em qual app mexer quando o pedido não disser.

---

> **Resumo em uma frase:** o sistema atual (controle) está vivo e sendo separado,
> com calma e em fases, em CRM + ERP + Portais — e a regra que protege tudo é
> **na dúvida, pergunte antes de mexer.**

Bem-vindo ao time. 🚀
