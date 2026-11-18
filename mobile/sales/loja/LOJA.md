# Carbo Sales na App Store — a ficha, pronta para colar

Distribuição: **não listada (Unlisted)**. O app passa pela revisão da Apple, fica
na App Store, não aparece na busca e só instala quem recebe o link. Os passos de
conta (Bundle ID, app no App Store Connect, chave de API, segredos do GitHub)
estão no `mobile/README.md`.

## Ordem

1. Enviar um build: GitHub → Actions → **App iPhone** → Run workflow (`enviar`
   marcado). Ele aparece em App Store Connect → o app → **TestFlight** em ~15 min.
2. **Pedir a distribuição não listada**: developer.apple.com/contact/request/unlisted-app
   (informar o Apple ID do app, que aparece em App Store Connect → Informações do app).
   Faça o pedido ANTES de enviar para revisão.
   ⚠️ E na versão marque **"Lançar esta versão manualmente"**: se a revisão aprovar
   antes do pedido de não listado, o app NÃO vai ao ar sozinho como público.
3. Criar a **conta de demonstração** (abaixo).
4. Preencher a ficha (abaixo), escolher o build e **Enviar para revisão**.
5. Aprovado: em Preço e disponibilidade aparece o link do app. É ele que vai para
   a equipe.

## Conta de demonstração (o revisor precisa entrar)

No TI → Usuários, criar:
- Nome: `Revisão Apple` · e-mail próprio para isso (ex.: `revisao.apple@…`)
- Acesso: **só o Carbo Sales**, nível colaborador, sem equipe.
- Entrar uma vez com ela e criar 2 ou 3 **leads fictícios** no funil (ex.: "Posto
  Exemplo Centro"), para o revisor não achar um app vazio.
- ⚠️ **Não registrar venda com ela**: venda entra no faturamento e na comissão.
- ⚠️ Ela vê o que um vendedor vê (a lista de PDVs, o chat interno). Depois da
  aprovação, **bloquear** a conta e desbloquear só quando mandar versão nova para
  revisão (a Apple revisa de novo cada versão).

## Informações do app

| Campo | Valor |
|---|---|
| Nome | `Carbo Sales` (se já existir na loja: `Carbo Sales - Grupo Carbo`) |
| Subtítulo | `Vendas da equipe Grupo Carbo` |
| Categoria principal | Negócios |
| Categoria secundária | Produtividade |
| URL de suporte | `https://carbohub.com.br/suporte` |
| URL da política de privacidade | `https://carbohub.com.br/privacidade` |
| Copyright | `2026 CARBO SOLUÇÕES LTDA` |
| Classificação etária | responder **Não/Nenhum** em tudo → 4+ |
| Preço | Grátis |
| Conformidade de exportação | já respondida no app (`ITSAppUsesNonExemptEncryption = NO`: só HTTPS) |

**Texto promocional** (até 170 caracteres)

```
O dia a dia comercial do Grupo Carbo no celular: funil de leads, orçamentos, vendas, visitas aos pontos de venda e ordens de serviço.
```

**Descrição**

```
Carbo Sales é o aplicativo de vendas da equipe do Grupo Carbo. O acesso é exclusivo para funcionários e parceiros com conta criada pela empresa.

No celular, o vendedor:
• acompanha o funil de leads, etapa por etapa;
• monta orçamentos e vendas de CarboZé e CarboVAPT e compartilha o PDF pelo WhatsApp ou por e-mail;
• consulta as vendas, a situação de cada pedido e a nota fiscal;
• faz o roteiro de visitas aos pontos de venda, com check-in, fotos e checklist;
• acompanha as ordens de serviço de descarbonização;
• conversa com a equipe pelo Carbo Chat.

Gestores acompanham a equipe inteira, com metas e resultados.
```

**Palavras-chave** (até 100 caracteres)

```
vendas,crm,orçamento,pedidos,funil,leads,visitas,pdv,equipe,carbozé,carbovapt
```

## Prints (iPhone 6,9")

`mobile/sales/loja/prints/` — 1320 × 2868, dados FICTÍCIOS, na ordem:
1 funil · 2 nova venda · 3 vendas · 4 visitas · 5 ordens de serviço · 6 funil no tema escuro.
O app é só de iPhone: não precisa de print de iPad.
⚠️ Refeitos com o harness da Documentação (`apps/crm/docs-prints`, viewport
440 × 956 a 3×). Tela mudou muito ⇒ refazer antes da próxima versão.

## Privacidade do app (o questionário da App Store)

Rastreamento: **Não** (o app não rastreia ninguém em outros apps ou sites).

| Tipo de dado | Coletado | Ligado à pessoa | Uso |
|---|---|---|---|
| Informações de contato → Nome, E-mail, Telefone | Sim | Sim | Funcionalidade do app |
| Localização → Precisa | Sim (só no check-in/check-out da visita) | Sim | Funcionalidade do app |
| Conteúdo do usuário → Fotos ou vídeos | Sim | Sim | Funcionalidade do app |
| Conteúdo do usuário → Outro conteúdo (vendas, clientes, mensagens do chat) | Sim | Sim | Funcionalidade do app |
| Identificadores → ID do usuário | Sim | Sim | Funcionalidade do app |
| Dados de uso → Interação com o produto (registro de acesso) | Sim | Sim | Funcionalidade do app |

Não coletados: dados financeiros, saúde, contatos do celular, histórico de
navegação, diagnóstico, áudio (a chamada do chat é ao vivo, não é gravada).
⚠️ Recurso novo que colete dado de pessoa ⇒ esta tabela, a política em
`carbohub.com.br/privacidade` (carbohub-landing `src/pages/Legal.tsx`) e o
`Info.plist`, juntos.

## Notas para a revisão (em inglês: é o que o revisor lê)

```
Carbo Sales is the internal sales app of Grupo Carbo (Brazil). It is used only by our employees; accounts are created by the company and there is no public sign-up. We requested unlisted distribution for this app.

Demo account (salesperson profile, fictitious data only):
E-mail: <the demo account e-mail>
Password: <the demo account password>

What to try: Funis (sales pipeline, tap a lead card), Vender (create a quote and tap "Gerar PDF" — the PDF opens the iOS share sheet), Vendas (orders list), Visitas (store visit route; check-in asks for location permission) and the bottom menu.

Native features: file downloads (quote PDF, CSV exports) handled natively with the iOS share sheet; camera/photo library for store visit photos; location only at visit check-in/check-out; microphone only for in-app voice calls; offline screen.
```

## ⚠️ Se a Apple recusar

- **4.2 (funcionalidade mínima / "é só um site")**: é a recusa mais comum para app
  que abre o próprio site. A resposta é a NOTIFICAÇÃO NATIVA (push com o app
  fechado), que já é a fase 2 — responder a recusa dizendo que ela vem na próxima
  versão raramente basta; o caminho é mandar a versão com push.
- **2.1 (não conseguimos entrar)**: a conta de demonstração estava bloqueada ou
  com a senha errada.
- **5.1.1 (dados)**: o texto de permissão não explica o uso — os textos estão no
  `Info.plist`.
A recusa chega por e-mail e no App Store Connect (Central de resoluções), com a
regra citada. Responder por lá, ou corrigir e mandar build novo.
