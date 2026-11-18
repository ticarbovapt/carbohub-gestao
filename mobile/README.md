# Apps de iPhone do CarboHub

Cada pasta aqui é um app da App Store: uma casca nativa (Capacitor 7, Swift
Package Manager) que abre o site do app — `mobile/sales` abre
`https://sales.carbohub.com.br`. **O app web não muda**: o que vai ao ar no
Vercel aparece no iPhone na hora, sem build novo. Build novo só quando muda
a parte nativa (ícone, permissões, nome, plugin).

```
mobile/sales/capacitor.config.json   endereço, domínios que abrem dentro do app, cor de fundo
mobile/sales/www/offline.html        a tela "Sem conexão"
mobile/sales/ios/App/App/            Info.plist (permissões), ícone, abertura,
                                     CarboViewController.swift (download de arquivo)
.github/workflows/ios-app.yml        compila (todo PR) e envia ao TestFlight (à mão)
```

## O que a casca faz além de abrir o site

1. **Download**: o Capacitor não trata `<a download>`. O "Baixar PDF" do
   orçamento e o CSV não fariam nada; o `CarboViewController` baixa o arquivo e
   abre a folha de compartilhar (Salvar em Arquivos, WhatsApp, e-mail).
2. **Permissões** com o texto que o iPhone mostra: câmera e fotos (RTM e
   anexos), localização (check-in da visita), microfone (chamada do Carbo
   Chat). ⚠️ Sem o texto no `Info.plist`, o app FECHA na hora em que o site pede.
3. **Domínios**: `carbohub.com.br` e `*.carbohub.com.br` abrem dentro do app
   (o login do Hub vale, é o mesmo cookie do SSO). Qualquer outro endereço
   (WhatsApp, Bling, Maps) abre fora, no Safari ou no app dele.
4. User-Agent com `CarboHubApp/1 (sales)`: o site sabe que está no app.

## ⚠️ O que NÃO funciona na casca (ainda)

- **Notificação no celular.** Dentro do app não existe Web Push; o sininho e o
  toast funcionam com o app aberto, mas o aviso com o app fechado precisa de
  push NATIVO (APNs + o `carbo-push` mandar para a Apple). É a fase 2, e é
  também o melhor argumento para a revisão da Apple.
- **Link que abre "em nova guia"** (`target=_blank`) vai para o Safari, onde a
  pessoa não está logada.

## Enviar um build ao TestFlight

Uma vez, no Apple Developer / App Store Connect:

1. developer.apple.com → Identifiers → **+** → App IDs → App →
   Bundle ID explícito **`br.com.carbohub.sales`**.
2. App Store Connect → Apps → **+** → Novo app → iOS, nome, idioma Português
   (Brasil), o Bundle ID acima, SKU livre (ex.: `carbo-sales`).
3. App Store Connect → Usuários e acesso → Integrações → **Chaves de API da App
   Store Connect** → gerar chave com acesso **Admin** (é o que deixa o robô
   criar o certificado de distribuição sozinho). Baixar o `.p8` (só baixa uma
   vez) e anotar o **Key ID** e o **Issuer ID**.
4. GitHub → Settings → Secrets and variables → Actions → New secret:
   `APPLE_TEAM_ID` (Membership → Team ID), `ASC_KEY_ID`, `ASC_ISSUER_ID` e
   `ASC_KEY_P8` (o CONTEÚDO do `.p8`, com as linhas BEGIN/END).

Depois, a cada versão: GitHub → Actions → **App iPhone** → Run workflow →
app `sales`, versão `1.0.0`, **enviar** marcado. Em ~15 min o build aparece no
TestFlight (aba TestFlight do app), e quem estiver em "Testes internos" instala
pelo app TestFlight.

⚠️ O número do build é o `run_number` do workflow: sobe sozinho a cada rodada.
⚠️ Versão nova na loja = mudar o campo "versão" (1.0.1, 1.1.0…).

## App novo (os outros do Hub)

Copiar `mobile/sales` para `mobile/<app>`, trocar em `capacitor.config.json`
(`appId`, `appName`, `server.url`, `appendUserAgent`), no `www/` o endereço,
`CFBundleDisplayName` no `Info.plist`, `PRODUCT_BUNDLE_IDENTIFIER` no
`project.pbxproj`, o ícone, e acrescentar o nome em `options` do workflow.
Cada app novo também precisa do passo 1 e 2 acima.
