# Relatório – Portal Bradesco Developers (leitura em 06/11/2026)

Conta logada: CARBO SOLUÇÕES LTDA. Foi só leitura: não criei, assinei, solicitei nem alterei nada. Para ler as páginas longas, escondi trechos da página **só na minha aba** (isso não muda nada no portal; recarregar a página desfaz).

Convenções: o que está entre aspas ou em bloco de código foi copiado da documentação. As minhas observações aparecem como **[Obs.]**.

---

## PARTE 1 – Visão geral do portal

### 1.1 APIs (produtos) do catálogo – 17 itens

| # | Nome exato | Versão | Categoria | Última versão (data) | Situação para a sua conta |
|---|---|---|---|---|---|
| 1 | Extrato para Grandes Volumes | 0.1.5 | Conciliação | 2026-10-28 | Não assinada – botão "Inscrever-se" ativo |
| 2 | Ágora Investimentos | 1.4.0 | Ágora Investimentos | 2026-09-28 | Não assinada – "Inscrever-se" |
| 3 | Pagamento de contas de consumo e tributos | 1.2.3 | Pagamentos | 2026-09-17 | Não assinada – "Inscrever-se" |
| 4 | TED | 1.1.6 | Pagamentos | 2026-08-27 | Não assinada – "Inscrever-se" |
| 5 | Open Cash Hub | 2.0.1 | (a categoria não carregou) | ~4 meses atrás | Não assinada – "Inscrever-se" |
| 6 | Débito automático | 1.0.6 | (a API não devolve categoria) | 2026-04-20 | Não assinada |
| 7 | Pagamento de boletos de cobrança | 3.2.7 | Pagamentos | 2026-04-20 | Não assinada |
| 8 | Débito Veicular MG | 1.0.3 | Débitos Veiculares | 2026-04-20 | Não assinada |
| 9 | Débito Veicular PR | 1.0.2 | Débitos Veiculares | 2026-04-20 | Não assinada |
| 10 | Débito Veicular BA | 1.0.3 | Débitos Veiculares | 2026-04-20 | Não assinada |
| 11 | Cobrança | 1.7.2 | Recebimentos | 2026-04-20 | Não assinada – "Inscrever-se" |
| 12 | Cobrança com QR Code | 1.8.3 | Recebimentos | 2026-04-20 | Não assinada – "Inscrever-se" |
| 13 | Débito Veicular SP | 2.0.8 | Débitos Veiculares | 2026-04-20 | Não assinada |
| 14 | Pix - geração de QR Code | 1.2.3 | PIX / Recebimentos | 2026-04-20 | Não assinada – "Inscrever-se" |
| 15 | Saldo e extrato | 5.3.7 | Conciliação | 2026-04-20 | Não assinada |
| 16 | Pix - transferências | 2.3.2 | PIX / Pagamentos | 2026-03-19 | Não assinada |
| 17 | Hub de Pagamentos | 1.0.2 | (nenhuma exibida) | ~8 meses atrás | **Sem botão "Inscrever-se" e sem aba Planos** → parece restrita (liberada só por convite/solicitação ao banco) |

Categorias do filtro: Ágora Investimentos, Conciliação, Débitos Veiculares, Pagamentos, PIX, Recebimentos. Estágios: Desenvolvimento, Homologação, Produção, Sandbox.

**Liberadas para a sua conta: nenhuma.** Você tem 0 assinaturas, 0 aplicações, 0 credenciais e 0 registros de aplicação. Toda API precisa de "Inscrever-se" (assinatura). Na página do produto, "Registrar Aplicação" e "Solicitar Credencial" aparecem desabilitados até existir uma assinatura.

[Obs.] Os itens 1, 2, 5 e 17 devolvem 403 na API interna do portal para a sua conta. Mesmo assim, as páginas deles abrem normalmente na tela.

Planos (exemplo: Cobrança): "Sandbox - Cobrança" (Grátis) e "Produção - Cobrança". O detalhe do Sandbox diz: "Quota 0 – Unidade de consumo: Transactions – Preço: ILIMITADO – 11 Recursos".

Pré-requisitos de produção mostrados nos produtos:
- **Cobrança:** "Ser cliente pessoa jurídica Bradesco. Ter contrato de cobrança ativo com indicador 175 habilitado. Ter acessado o Bradesco Net Empresa pelo menos uma vez."
- **Cobrança com QR Code:** "… Ter contrato de cobrança ativo com indicador 175 e 182 habilitado. Ter acessado o Bradesco Net Empresa pelo menos uma vez."
- **Pix - geração de QR Code:** "Ser cliente pessoa jurídica Bradesco. Ter o contrato do produto assinado. Ter chave Pix cadastrada no Bradesco."

### 1.2 Novidades dos últimos 30 dias (desde 07/10/2026)

Os produtos não têm uma página de changelog geral. Montei a lista abaixo a partir de três fontes: o "Histórico do Produto", as "Notas de versão" de cada API e as datas de modificação dos documentos.

| Data | Há quantos dias | API | O que mudou |
|---|---|---|---|
| **04/11/2026** | **2 dias ⚠️ (<8 dias)** | Pix - geração de QR Code | O documento "API_Pix QR Code Generation" (PDF "Como Gerar sua Credencial") foi atualizado. A descrição da mudança não aparece. |
| 28/10/2026 | 9 dias (o card mostra "8 dias atrás") | Extrato para Grandes Volumes | Produto publicado na versão 0.1.5, a única no histórico (2026-10-28, ATIVO). |
| 28/10/2026 | 9 dias | Débito Veicular MG | Manual atualizado (descrição: "Inclusão do ALFANUMÉRICO") e Notas de versão atualizadas. |
| 28/10/2026 | 9 dias | Débito Veicular BA | Manual atualizado (descrição: "Alphanumeric") e Manual do desenvolvedor atualizado. |
| 28/10/2026 | 9 dias | Pagamento de contas de consumo e tributos | Atualizados o "Como gerar credencial", o Manual do produto e o Manual do desenvolvedor. |
| 23/10/2026 | 14 dias | Cobrança com QR Code | Manual do produto atualizado (descrição: "Adding specific query API"). |
| 13/10/2026 | 24 dias | Cobrança | Manual API Cobrança atualizado (descrição: "Adicionado Consulta de títulos pendentes e lista de baixados, split, protesto e negativação e Webhook"). |
| 09/10/2026 | 28 dias | Cobrança com QR Code | Nota de versão 1.0.5: "Ajustado a informação de que a APi não registra boleto em moeda indexada." |
| 07/10/2026 | 30 dias | Cobrança | Nota de versão 1.6.4: "Ajustada a informação sobre Moeda Indexada, não disponível para a API." |
| (06/10/2026) | 31 dias, logo fora da janela | Cobrança | 1.6.3: "Inclusão das novas funcionalidades: Cobrança - Consulta Split Payment; Cobrança - Manutenção Split Payment; Cobrança - Protesto e Negativação de Boletos" |

Nenhuma **versão de API** (o número de versão do produto) mudou nos últimos 30 dias, exceto o produto novo Extrato para Grandes Volumes. As outras mudanças são só de documentação.

### 1.3 "Minhas aplicações" / Credenciais

Essas áreas existem no menu lateral e no menu do usuário: Console de Atividades (`/activity`), Aplicações (`/applications`), Assinaturas (`/subscriptions`), Credenciais (`/credentials`) e Registro de Aplicações (`/registrations`).
- **Aplicações:** "Sua busca não retornou resultados. Mostrando 0-0 de 0 itens". Filtros de estado: Ativo, Arquivado, Arquivando, Excluindo.
- **Assinaturas:** 0 itens. As colunas são Assinatura, Produto, Estado da Aprovação (Aprovado/Pendente/Recusado), Estado, Equipe Proprietária, Plano, Aplicações e Criado.
- **Credenciais:** 0 itens. As colunas são Nome da Credencial, Estado (Pendente/Ativo/Inativo), Tipo, Recursos, Aplicação, Equipe Proprietária e Expira. Há filtros por expiração (≤45, ≤15 e ≤3 dias).
- **Registro de Aplicações:** 0 itens.
- Resultado: **nenhum app, nenhum ambiente e nenhuma credencial cadastrados.** Por isso não há valores secretos na sua conta.

### 1.4 Sandbox / homologação – como pedir

Fonte: página "Primeiros passos".
1. Na página do produto, clique em "Inscrever-se". Escolha o plano (Sandbox ou Produção), o time ("Default Team" ou um novo) e um nome. "Diferentemente do ambiente sandbox, cuja aprovação é automática, a assinatura no ambiente de produção é passada para validação do Gestor de APIs, o que leva em torno de 2 dias úteis."
2. Clique em "Registrar Aplicação": crie ou selecione a aplicação, escolha a assinatura e depois os recursos.
3. Clique em "Solicitar Credencial". No campo Tipo, escolha "Modelo de autenticação MTLS". Marque a operação "Nova credencial", informe CNPJ e nome da empresa e anexe o certificado público.
   - **Sandbox:** "faça o upload do seu certificado autoassinado". O comando da documentação é: `openssl req -new -x509 -sha256 -newkey rsa:2048 -nodes -keyout parceiro.homologacao.key.pem -days 365 -out parceiro.homologacao.cert.pem -subj "/CN=RAZÃOSOCIAL:CNPJ/C=BR/ST=SP/0=RAZÃOSOCIAL"`
   - **Produção:** "certificado público A1, emitido por uma entidade certificadora confiável, com validade mínima de 2 meses" (formatos .pem, .cer, .crt; "importado apenas o corpo").
   - A credencial leva "em torno de 10 minutos para que ela seja habilitada". "Por questões de segurança, o Client Secret só estará visível por 3 dias, caso o perca, será necessário gerar uma nova credencial."
4. Para testar, use a collection Postman: na aba Documentação, clique em "copy" e depois em Import no Postman. Em Settings > Certificates, configure o host e anexe o certificado e a chave.

Ambientes e certificados do Bradesco, copiados da seção "10. Certificados" (cada linha tem um arquivo para baixar em "CLIQUE AQUI"):

| URL | Ambiente | Expiração |
|---|---|---|
| https://proxy.api.prebanco.com.br | HOMOLOGAÇÃO (Open APIs) | 15/03/2027 |
| https://openapisandbox.prebanco.com.br | SANDBOX (Open APIs) | 29/04/2027 |
| https://openapi.bradesco.com.br | PRODUÇÃO (Open APIs) | 04/04/2027 |
| https://qrpix-h.bradesco.com.br | HOMOLOGAÇÃO (APIs Pix) | 16/01/2027 |
| https://qrpix.bradesco.com.br | PRODUÇÃO (APIs Pix) | 16/01/2027 |
| bspi.webhook.prebanco.com.br | HOMOLOGAÇÃO (Webhook Pix) | 16/01/2027 |
| qrpix.webhook.bradesco.com.br | PRODUÇÃO (Webhook Pix) | 16/01/2027 |
| boletosliquidados.bradesco.com.br | PRODUÇÃO (Webhook Cobrança) | 07/10/2027 |

"Open APIs (Arrecadação, Cobrança, Cobrança Híbrida, Débito de Veículos, Débito Automático, Saldo Extrato, Pagamentos e TED)". Aviso da página: "Esses certificados não devem ser utilizados para a geração de credenciais no Portal."

Renovação de certificado do webhook: e-mail para governancaapis@bradesco.com.br com o assunto "RNV-WHK-PRD | NOME DA API | RAZÃO SOCIAL | CNPJ | URL" (validade mínima de 4 meses e máxima de 3 anos). Suporte: aba Suporte ("Registrar novo chamado", informando o ID da Organização) e suporte.api@bradesco.com.br.

---

## PARTE 2 – API de COBRANÇA (boleto convencional) – produto "Cobrança" v1.7.2

- Versão do produto: **1.7.2** (Histórico do Produto: 2026-04-20, ATIVO).
- Manual: **"Versões 1.6.4 – 07/10/2026 – 👉 Manual API COBRANÇA"**. Há um PDF para baixar em assets.bradesco, com o nome do arquivo em inglês "API_Cobrança_DOWNLOAD_INGLES_V1.6.4.pdf". O conteúdo da página foi modificado em 13/10/2026.
- Manual do desenvolvedor (token): "1.0.0 – 06/07/2026 – Manual Desenvolvedor "mTLS"".
- Notas de versão: 1.6.0 (04/05/2026) revisão; 1.6.1 (29/05/2026) "Não são aceitos os caracteres ".", "-" e "/": logradouroPagador, bairroPagador, municipioPagador"; 1.6.2 (20/08/2026) "Inclusão dos campos "cdBarras" e "linhaDigitavel" no layout de retorno do registro do boleto"; 1.6.3 (06/10/2026); 1.6.4 (07/10/2026).

### 2.1 Autenticação (copiado de "🔐 Autenticação – Gerar Bearer Token")

O fluxo é **OAuth2 client_credentials com mTLS**: o certificado do cliente é apresentado na conexão TLS. **Não existe JWT assinado nem assinatura de requisição.** Procurei "X-Brad" no manual inteiro e na collection e não encontrei nenhuma ocorrência. Os headers X-Brad-Signature/Nonce/Timestamp/Algorithm eram do modelo antigo e **não aparecem** na documentação atual.

- Produção: `POST https://openapi.bradesco.com.br/auth/server-mtls/v2/token`
- Sandbox: `POST https://openapisandbox.prebanco.com.br/auth/server-mtls/v2/token`

"📜 Tipo de Certificado aceito – Produção: ✅ A1 emitido por uma autoridade certificadora. ✅ Prazo de validade no minimo de 2 meses e no máximo 3 anos. ✅ Ter a razão social + CNPJ no CN do certificado. Homologação: ✅ A1 auto assinado. ✅ Prazo de validade no minimo de 2 meses e no máximo 3 anos. ✅ Ter a razão social + CNPJ no CN do certificado."

"🔑 Certificados necessários: Certificado Público (.crt ou .pem) – Utilizado para autenticação do cliente. Chave Privada (.key) – Necessária para estabelecer uma conexão segura."

Headers:

| Chave | Valor | Observação |
|---|---|---|
| Content-Type | application/json | 'Define o tipo de conteúdo' |

Body (x-www-form-unlencoded):

| Chave | Valor |
|---|---|
| grant_type | client_credentials |
| client_id | {{ClientID}} |
| client_secret | {{ClientSecret}} |

```
curl -X POST 'https://openapi.bradesco.com.br/auth/server-mtls/v2/token' \
--header 'Content-Type: application/x-www-form-urlencoded' \
--header 'Authorization: ••••••' \
--data-urlencode 'grant_type=client_credentials' \
--data-urlencode 'client_id={{ClientID}}' \
--data-urlencode 'client_secret={{ClientSecret}}'
```

"⏱️ O Bearer Token tem um tempo de vida de 1 hora. Utilize o mesmo token em todas as requisições dentro desse período para evitar a geração de novos tokens a cada requisição. Evite bloqueios: A criação excessiva de tokens pode levar a restrições no sistema de segurança do Bradesco."

Erros de token: 401 "SSL with client authentication is required" (o certificado é diferente do usado na credencial ou o mTLS não foi configurado) e 401 "The given client credentials were not valid".

[Obs.] Os exemplos de requisição e resposta do token são **imagens** na página e não dá para ler como texto. A tabela de headers diz `application/json`, mas o body e o cURL usam `application/x-www-form-urlencoded`. Use form-urlencoded, que é o que a collection faz (`"mode": "urlencoded"`). Nas chamadas, a collection envia o header `Authorization` com o valor `{{access_token_sandbox}}`, sem o prefixo "Bearer" aparente.

### 2.2 URLs base e endpoints

Base: Sandbox `https://openapisandbox.prebanco.com.br`; Produção `https://openapi.bradesco.com.br`.

| Função | Método | Sandbox | Produção |
|---|---|---|---|
| Registrar boleto | POST | /boleto/cobranca-registro/v1/cobranca | /boleto/cobranca-registro/v1/cobranca |
| Baixar (cancelar) | POST | /boleto/cobranca-baixa/v1/baixar | /boleto/cobranca-baixa/v1/baixar |
| Alterar título (vencimento, desconto, juros etc.) | PUT | /boleto/cobranca-altera/v1/alterar | /boleto/cobranca-altera/v1/alterar |
| Consultar título / 2ª via | POST | /boleto/cobranca-consulta/v1/consultar | /boleto/cobranca-consulta/v1/consultar |
| Listar títulos liquidados (pagos) | POST | /boleto/cobranca-lista/v1/listar | /boleto/cobranca-lista/v1/listar |
| Listar títulos pendentes | POST | /boleto/cobranca-pendente/v1/listar | /boleto/cobranca-pendente/v1/listar |
| Listar títulos baixados | POST | /boleto/cobranca-baixado-consulta/v1/listar | /boleto/cobranca-baixado-consulta/v1/listar (na página aparece "**https://…") |
| Protesto / negativação | POST | /boleto/cobranca-protesto-negativacao/v1/executar | idem |
| Manutenção Split | POST | /boleto/cobranca-manutencao-split/v1/manutencao-rateio-credito | /boleto/cobranca-manutencao-split/v1/manutencao-rateio-creditor (com "r" no fim na página; a collection usa "…-credito") |
| Consulta Split | POST | /boleto/cobranca-consulta-split/v1/executar | idem |
| Webhook – cadastro (I/A/E/C) | POST | /boleto/cobranca-webhook/v1/**cadastrar** | /boleto/cobranca-webhook/v1/**executar** |

"⚠️ No período da 00h00 às 03h00 pode haver indisponibilidade de acesso à API face às atualizações de tabelas e processamento batch."

### 2.3 REGISTRAR – Layout de comunicação – Entrada (copiado)

Regras de preenchimento: "Campos numéricos: preencher com zero (0); Campos alfanuméricos: preencher com espaços ou deixar em branco… Permitidos: letras de A–Z/a–z, números 0–9, espaço. Não permitido: ., -, /,á, é, í, ó, ú, ã, â, ç, ! @ # % & * etc." "Nos campos relacionados a multa, juros, bonificação ou desconto, deve ser informado apenas valor ou percentual, nunca ambos simultaneamente." "A formatação de campos percentuais na API deve conter 2 dígitos inteiros e 3 casas decimais" (exemplos: 0.5 → 0.50; 10 → 10 ou 10.00; 12,12 → 12.12). "Para utilização do campo Decurso de Prazo – tipoPrazoDecursoTres na requisição, é necessário que o indicador correspondente no Contrato de Cobrança esteja cadastrado com o valor ZERO."

Regras de encargos: "Valor do título × % de juros mensal / 30 = Juros diário (em R$)". Desconto = "Valor fixo… até a data de vencimento". Abatimento = "durante toda a vida do título". Bonificação = "redução diária… até o vencimento". "A multa é cobrada apenas uma vez, após o vencimento, e sempre em percentual sobre o valor do título."

| Nome do Campo | Tipo | Descrição | Mín | Máx | Obrigatório |
|---|---|---|---|---|---|
| debitoAutomatico | Alfanumérico | Informe 'S' (Sim) para automático ou 'N' (Não) caso não deseje ativá-lo. OBS: Instituições autorizadas BACEN não devem utilizar. | 0 | 1 | Não |
| nuCPFCNPJ | Alfanumérico | Raiz CPF/CNPJ Beneficiário | 0 | 9 | Sim |
| FilialCPFCNPJ | Alfanumérico | filial CPFCNPJ do Beneficiário. OBS: Se CPF, filial = 0 | 1 | 4 | Sim |
| ctrlCPFCNPJ | Alfanumérico | Dígito de Controle do CPF/CNPJ Beneficiário | 1 | 2 | Sim |
| idProduto | Numérico | Carteira de Cobrança | 1 | 2 | Sim |
| nuNegociacao | Numérico | Número da Negociação. Formato: Agência (4 posições), Zeros (7 posições), Conta (7 posições). Ex.: AAAA0000000CCCCCCC | 18 | 18 | Sim |
| **nuTitulo** | Numérico | Número do Título. **É o Nosso Número, sem o dígito.** É a identificação do título para o banco, **pode ser informado pelo cliente ou gerado pelo banco**, esse número deverá ser único, de acordo com a carteira e negociação utilizadas. | 1 | 11 | **Não** |
| nuCliente | Alfanumérico | Número do Cliente. Seu Número. É a identificação do título para o cliente. | 1 | 25 | Sim |
| dtEmissaoTitulo | Alfanumérico | Data de Emissão do Título | 10 | 10 | Sim |
| dtVencimentoTitulo | Alfanumérico | Data de Vencimento do Título. Deve ser maior ou igual a data de emissão do título. | 10 | 10 | Sim |
| vlNominalTitulo | Numérico | Valor Nominal do Título… Permite "0" ou apenas valores com duas casas decimais. Exemplos válidos: "0", "0.00", "0.25", "9.99", "10.50" | 10 | 10 | Sim |
| cdEspecieTítulo | Numérico | Código da Espécie do Título. Verificar na TABELA DE ESPÉCIES DE TÍTULOS. | 1 | 2 | Sim |
| tpProtestoAutomaticoNegativacao | Numérico | Tipo de ação e unidade do prazo para protesto/negativação: Informar 1 - Protesto em dias corridos ou 2 - Protesto em dias úteis ou 3 - Negativação em dias corridos ou 4 - Negativação em dias úteis | 1 | 1 | Não |
| prazoProtestoAutomaticoNegativacao | Numérico | Quantidade de dias conforme o tipo escolhido. Para negativação: mínimo 1 dia útil ou 3 dias corridos (a depender do contrato). Para protesto: mínimo 3 dias úteis ou 5 dias corridos. | 1 | 2 | Não. Obrigatório se preencher tpProtestoAutomáticoNegativação. |
| controleParticipante | Alfanumérico | Controle Participante. Campo de responsabilidade do cliente, caso desejado. Não consistido pelo banco. | 0 | 25 | Não |
| cdPagamentoParcial | Alfanumérico | Informe 'S' (Sim) para permitir pagamento parcial ou 'N' (Não) para não permitir. | 0 | 1 | Não |
| qtdePagamentoParcial | Numérico | Quantidade de Pagamentos Parciais. | 1 | 3 | Não. Obrigatório se preencher cdPagamentoParcial. |
| tipoPrazoDecursoTres | Numérico | Quantidade de dias de decurso. Para o comando ser acatado via API, no Cadastro de Cobrança do cliente, o parâmetro deverá estar zerado. | 1 | 3 | Não |
| percentualJuros | Numérico | Percentual de Juros. Formato suportado: Inteiros de 0 a 999 com no máximo 2 casas decimais. Valores enviados com mais de duas casas decimais serão automaticamente truncados, e não arredondados… Exemplo: Enviado: 1.33333 - Registrado: 1.33… | 1 | 5 | Não. Este campo não deve ser preenchido caso escolha cobrar Juros por Valor (campo vlJuros). |
| vlJuros | Numérico | Valor absoluto dos juros a ser cobrado no título… máximo de duas casas decimais… truncamento automático (não arredondamento). Exemplo: Enviado: 12.7891 / Registrado: 12.78… | 1 | 10 | Não. Este campo não deve ser preenchido caso escolha cobrar juros por percentual (campo percentualJuros). |
| qtdeDiasJuros | Numérico | Quantidade de dias inteiros adicionados à data de vencimento para início da cobrança de juros. Importante: O cálculo atual da API equivale a subtrair 1 dia em relação ao texto anterior da documentação. Na prática, para iniciar a cobrança 2 dias após o vencimento, é necessário enviar qtdeDiasJuros = 3 (e não 2). | | | Sim, apenas se informado vlJuros e percentualJuros |
| percentualMulta | Numérico | Percentual de multa a ser aplicado. O campo aceita valores inteiros de 0 a 999, com no máximo 2 casas decimais… truncamento… Exemplo: Enviado: 2.56789 / Registrado: 2.56… Este campo não deve ser preenchido caso o cliente opte por informar a multa em valor absoluto (campo vlMulta) | 1 | 5 | Não |
| vlMulta | Numérico | Valor absoluto da multa… inteiros ou números com até 2 casas decimais… truncamento… Este campo não deve ser preenchido se o integrador optar por aplicar multa por percentual (campo percentualMulta). | 1 | 10 | Não |
| qtdeDiasMulta | Numérico | Quantidade de dias inteiros adicionados à data de vencimento para início da cobrança de juros. Importante: … para iniciar a cobrança 2 dias após o vencimento, é necessário enviar qtdeDiasJuros = 3 (e não 2). | | | (vazio na tabela) |
| percentualDesconto1 | Numérico | Percentual do Primeiro Desconto… inteiros de 0 a 999, com ou sem duas casas decimais… | 1 | 5 | Não |
| vlDesconto1 | Numérico | Valor absoluto de desconto a ser aplicado até a data definida em dataDesconto1… truncamento… Este campo não deve ser preenchido caso seja utilizado o desconto por percentual (campo percentualDesconto1). | 1 | 10 | Não |
| dataLimiteDesconto1 | Alfanumérico | Data Limite para Primeiro Desconto. Formato: DD.MM.AAAA | 0 | 11 | Não. Obrigarório se percentualDesconto1 ou vlDesconto1 informados. |
| percentualDesconto2 | Numérico | Percentual do Segundo Desconto… | 1 | 5 | Não |
| vlDesconto2 | Numérico | Valor do Segundo Desconto… | 0 | 10 | Não |
| dataLimiteDesconto2 | Alfanumérico | Data Limite para Segundo Desconto. Formato: DD.MM.AAAA | 0 | 11 | Não. Obrigarório se percentualDesconto2 ou vlDesconto2 informados. |
| percentualDesconto3 | Numérico | Percentual do Terceiro Desconto… | 1 | 5 | Não |
| vlDesconto3 | Numérico | Valor do Terceiro Desconto… | 0 | 10 | Não |
| dataLimiteDesconto3 | Alfanumérico | Data Limite para Desconto 3. Formato: DD.MM.AAAA | 0 | 11 | Não. Obrigarório se percentualDesconto3 ou vlDesconto3 informados. |
| percentualBonificacao | Numérico | Percentual de bonificação… | - | - | Não |
| vlBonificacao | Numérico | Valor de bonificação… Permite "0" ou apenas valores com duas casas decimais. | 1 | 100 | Não |
| dtLimiteBonificacao | Alfanumérico | Data Limite Bonificação (Formato: DD.MM.AAAA) | 1 | 100 | Não |
| vlAbatimento | Numérico | Valor do abatimento… | 1 | 10 | Não |
| vlIOF | Numérico | Valor do IOF… | 1 | 30 | Não |
| nomePagador | Alfanumérico | Nome do Sacado | 1 | 70 | Sim |
| logradouroPagador | Alfanumérico (sem acentos e sem caracteres especiais) | Endereço do Sacado… Não permitido: ., -, /, acentos, ç… | 1 | 100 | Sim |
| nuLogradouroPagador | Alfanumérico | Número do endereço do Sacado | 1 | 10 | Sim |
| complementoLogradouroPagador | Alfanumérico | Complemento do endereço do Sacado | 0 | 30 | Não |
| tpVencimento | Numérico | Tipo de Vencimento – Fixo "0" | 1 | 1 | Sim |
| cepPagador | Alfanumérico | CEP do Sacado. Se o cliente for usar Protesto. O indicador 140 - CONSISTE SUFIXO CEP no contrato de cobrança, precisa estar habilitado como "S". | 5 | 8 | Não |
| complementoCepPagador | Alfanumérico | Complemento do CEP do Sacado. (mesma observação do indicador 140) | 1 | 3 | Não |
| bairroPagador | Alfanumérico | Bairro do Sacado. Alfanumérico sem acentos. | 1 | 50 | Sim |
| municipioPagador | Alfanumérico | Município Sacado. Alfanumérico sem acentos. | 1 | 50 | Sim |
| ufPagador | Alfanumérico | Estado Sacado | 2 | 2 | Sim |
| cdIndCpfcnpjPagador | Numérico | Indicador do tipo de documento: 1 - PF - CPF / 2 – CNPJ | 1 | 1 | Não |
| nuCpfcnpjPagador | Alfanumérico | Para CPF, o número deve conter 11 dígitos, incluindo o dígito verificador. Para CNPJ, o número deve conter 14 dígitos, incluindo o número da filial e o dígito verificador. | 11 | 14 | Não |
| endEletronicoPagador | Alfanumérico | E-mail do Pagador. | 0 | 100 | Não |
| bancoDoDebAutomatico | Numérico | Banco Débito | 2 | 3 | Não. Obrigatório se o campo debitoAutomatico estiver com "S" |
| agenciaDoDebAutomatico | Numérico | Agência Débito | 1 | 5 | idem |
| digitoAgenciaDoDebAutomat | Numérico | Dígito Agência de Débito | 1 | 3 | idem |
| contaDoDebAutomatico | Numérico | Conta Débito | 1 | 13 | Informar o número completo da conta, incluindo o dígito verificador. Exemplo: Conta Corrente '123-4', deve ser informado '1234'. Caso o dígito seja 'P', substitua por '0'… Obrigatório se debitoAutomatico = "S" |
| razaoDoDebAutomatico | Numérico | Razão Conta de Débito | 1 | 6 | Não. Obrigatório se debitoAutomatico = "S" |
| nomeSacadorAvalista | Alfanumérico | Nome Sacador Avalista | 1 | 40 | Não |
| logradouroSacadorAvalista | Alfanumérico | Endereço Sacador Avalista | 1 | 40 | Não |
| nuLogradouroSacadorAvalista | Alfanumérico | Número do endereço do Sacador Avalista | 1 | 10 | Não |
| complementoLogradouroSacadorAvalista | Alfanumérico | Complemento endereço Sacador Avalista | 1 | 15 | Não |
| cepSacadorAvalista | Numérico | CEP Sacador Avalista | 1 | 5 | Não |
| complementoCepSacadorAvalista | Numérico | Complemento do CEP Sacador Avalista | 1 | 3 | Não |
| bairroSacadorAvalista | Alfanumérico | Bairro Sacador Avalista | 1 | 40 | Não |
| municipioSacadorAvalista | Alfanumérico | Município Sacador Avalista | 1 | 40 | Não |
| ufSacadorAvalista | Numérico | Estado Sacador Avalista | 2 | 2 | Não |
| cdIndCpfcnpjSacadorAvalista | Numérico | 1 - PF - CPF / 2 – CNPJ | 1 | 1 | Não |
| nuCpfcnpjSacadorAvalista | Alfanumérico | CPF 11 dígitos / CNPJ 14 dígitos (com filial e DV) | 11 | 14 | Não |
| enderecoSacadorAvalista | Alfanumérico | Endereço Sacador Avalista | 1 | 70 | Não |
| mensagem | Alfanumérico | Mensagem a ser exibida no Boleto | 1 | 80 | Não |

Destaques:
- **Nosso número:** `nuTitulo`, com 11 posições e sem o dígito. "pode ser informado pelo cliente ou gerado pelo banco". No exemplo vai `0` e o banco devolve `nuTituloGerado`. O FAQ diz: "Essa informação é a Identificação do título para o banco (NOSSO NÚMERO), pode ser informado pelo cliente ou gerado pelo banco, esse número deve ser único de acordo com a carteira e negociação utilizada."
- **Carteira:** `idProduto` (ex.: 9). **Negociação:** `nuNegociacao` com 18 posições, no formato AAAA0000000CCCCCCC (agência + 7 zeros + conta).
- **CNPJ do beneficiário:** raiz `nuCPFCNPJ` (9), filial `FilialCPFCNPJ`/`filialCPFCNPJ` (4) e controle `ctrlCPFCNPJ` (2).
- **Datas:** formato DD.MM.AAAA (ex.: "18.08.2025").
- **Espécie:** `cdEspecieTitulo` (tabela abaixo; ex.: 2 = DM).
- **Mensagens:** a tabela mostra o campo `mensagem`, mas o JSON usa `"listaMsgs": [{"mensagem": "…"}]`.
- **Juros e multa via FAQ:** "Não, para os registros de títulos de forma online, só é acatado as informações de Juros e Multa informados no registro do boleto através da API, ele não carrega a informação do convênio." O FAQ também traz: ""percentualJuros" –Para 10% informe "10000,"; "vlJuros" –Para R$1,00 informe "100,"; "qtdeDiasJuros" –Para 1 dia informe "1,"; "percentualMulta" -Para 10% informe "10000"." [Obs.] Isso **contradiz** a tabela, que diz "10.00 / truncado em 2 casas". Vale testar no sandbox.

Exemplo de JSON – Entrada (copiado):

```json
{
"debitoAutomatico": "S",
"nuCPFCNPJ": 417554892,
"filialCPFCNPJ": 1,
"ctrlCPFCNPJ": 55,
"idProduto": 9,
"nuNegociacao": 285600000000222652,
"nuTitulo": 0,
"nuCliente": ".",
"dtEmissaoTitulo": "18.08.2025",
"dtVencimentoTitulo": "21.09.2025",
"indicadorMoeda": 1,
"vlNominalTitulo": 1255.99,
"cdEspecieTitulo": 1,
"tpProtestoAutomaticoNegativacao": 0,
"prazoProtestoAutomaticoNegativacao": 0,
"controleParticipante": "",
"cdPagamentoParcial": "",
"qtdePagamentoParcial": 0,
"tipoPrazoDecursoTres": 1,
"percentualJuros": 5.35,
"vlJuros": 0,
"qtdeDiasJuros": 1,
"percentualMulta": 0,
"vlMulta": 0.99,
"qtdeDiasMulta": 1,
"percentualDesconto1": 5.15,
"vlDesconto1": 0,
"dataLimiteDesconto1": "19.09.2025",
"percentualDesconto2": 0,
"vlDesconto2": 0.25,
"dataLimiteDesconto2": "20.09.2025",
"percentualDesconto3": 0,
"vlDesconto3": 0,
"dataLimiteDesconto3": "",
"prazoBonificacao": 0,
"percentualBonificacao": 1.00,
"vlBonificacao": 0,
"dtLimiteBonificacao": "21.09.2025",
"vlAbatimento": 20.00,
"vlIOF": 0,
"nomePagador": "JOÃO JOSÉ DA SILVA",
"logradouroPagador": "AVENIDA COPACABANA",
"nuLogradouroPagador": "237",
"complementoLogradouroPagador": "3 ANDAR",
"cepPagador": 6050,
"complementoCepPagador": 40,
"bairroPagador": "ALPHAVILLE",
"municipioPagador": "BARUERI",
"ufPagador": "SP",
"cdIndCpfcnpjPagador": 1,
"nuCpfcnpjPagador": 11438390807,
"endEletronicoPagador": "",
"dddFoneSacado": 0,
"foneSacado": 0,
"bancoDoDebAutomatico": 237,
"agenciaDoDebAutomatico": 2,
"digitoAgenciaDoDebAutomat": 7,
"contaDoDebAutomatico": 5223,
"razaoDoDebAutomatico": 705,
"codBancoDoProtesto": 0,
"agenciaDoProtesto": 0,
"listaMsgs": [
{
"mensagem": "CONFERIR DESCONTOS, JUROS, MULTA E ABATIMENTO"
}
]
}
```

### 2.4 REGISTRAR – Layout de comunicação – Retorno (copiado)

| Campo | Tipo | Tam. | Descrição |
|---|---|---|---|
| idProduto | numérico | 2 | Identificador do produto |
| negociacao | numérico | 18 | Número da negociação |
| cpssoaJuridContr | numérico | 7 | Código da pessoa jurídica contratante |
| ctpoContrNegoc | numérico | 2 | Tipo de contrato da negociação |
| nseqContrNegoc | numérico | 10 | Número sequencial do contrato da negociação |
| cprodtServcOper | numérico | 8 | Código do produto ou serviço da operação |
| **nuTituloGerado** | numérico | 11 | **Número do título gerado (nosso número)** |
| tp08Reg1 | numérico | 1 | Tipo de registro 1 |
| agencCred10 | numérico | 5 | Agência de crédito |
| ctaCred10 | numérico | 13 | Conta de crédito |
| digCred10 | numérico | 2 | Dígito da conta de crédito |
| cip10 | numérico | 3 | Código CIP |
| codStatus10 | numérico | 2 | Código do status do título |
| status10 | alfanumérico | 40 | Descrição do status do título |
| nomeBeneficiario | alfanumérico | 40 | Nome do beneficiário |
| logradouroBeneficiario | alfanumérico | 40 | Logradouro do beneficiário |
| nuLogradouroBeneficiario | alfanumérico | 7 | Número do logradouro do beneficiário |
| complementoLogradouroBeneficiario | alfanumérico | 20 | Complemento do logradouro |
| bairroBeneficiario | alfanumérico | 20 | Bairro do beneficiário |
| cepBeneficiario | numérico | 5 | CEP do beneficiário |
| cepComplementoBeneficiario | numérico | 3 | Complemento do CEP |
| municipioBeneficiario | alfanumérico | 50 | Município do beneficiário |
| ufBeneficiario | alfanumérico | 2 | UF do beneficiário |
| razCredt10 | numérico | 6 | Razão do crédito |
| nomePagador | alfanumérico | 40 | Nome do pagador |
| cpfcnpjPagador | Alfanumérico | 15 | CPF ou CNPJ do pagador |
| enderecoPagador | alfanumérico | 40 | Endereço do pagador |
| bairroPagador | alfanumérico | 20 | Bairro do pagador |
| municipioPagador | alfanumérico | 40 | Município do pagador |
| ufPagador | alfanumérico | 2 | UF do pagador |
| cepPagador | numérico | 5 | CEP do pagador |
| cepComplementoPagador | numérico | 3 | Complemento do CEP do pagador |
| cepb10 | alfanumérico | 0 | CEP adicional |
| debitoAuto10 | alfanumérico | 1 | Indicação de débito automático |
| aceite10 | alfanumérico | 1 | Indicação de aceite |
| endEletronicoPagador | alfanumérico | 40 | Endereço eletrônico do pagador |
| nomeSacadorAvalista | alfanumérico | 40 | Nome do sacador/avalista |
| cnpjCpfSacadorAvalista | Alfanumérico | 1 | CNPJ ou CPF do sacador/avalista |
| enderecoSacadorAvalista / municipioSacadorAvalista / ufSacadorAvalista | alfanumérico | 0 | dados do sacador/avalista |
| cepSacadorAvalista / cepComplementoSacadorAvalista | numérico | 1 | CEP do sacador/avalista |
| tp08Reg2 | numérico | 1 | Tipo de registro 2 |
| cense10 / agenOper10 / bcoDepos10 / agenDepos10 | numérico | 1 | Censo / agência operação / banco e agência de depósito |
| seuNumeroTitulo | alfanumérico | 1 | Número do título do cliente |
| dtRegistro | numérico | 8 | Data de registro |
| especieDocumentoTitulo | alfanumérico | 2 | Espécie do documento do título |
| descEspecie | alfanumérico | 0 | Descrição da espécie |
| vlIOF | numérico | 1 | Valor do IOF |
| dtEmissao | numérico | 8 | Data de emissão |
| codigoMoedaTitulo | alfanumérico | 2 | Código da moeda |
| quantidadeMoeda / quantidadeCasas | numérico | 1 | Quantidade de moeda / casas decimais |
| dtVencimento | alfanumérico | 10 | Data de vencimento |
| descricacaoMoeda | alfanumérico | 2 | Descrição da moeda |
| vlTitulo | numérico | 6 | Valor do título |
| vlAbatimento | numérico | 1 | Valor de abatimento |
| **cdBarras** | Alfanumérico | 112 | **Código de Barras (Padrão EBCDIC – Ver Tabela EBCDIC)** |
| **linhaDigitavel** | Alfanumérico | 54 | **Linha Digitável** |

Exemplo de resposta (copiado; o bloco termina cortado na página e completei com o markdown de origem do próprio portal):

```json
{
"idProduto": 9, "negociacao": 285600000000222652, "cpssoaJuridContr": 2269651, "ctpoContrNegoc": 48,
"nseqContrNegoc": 236334, "cprodtServcOper": 1730, "nuTituloGerado": 52280000492, "tp08Reg1": 1,
"agencCred10": 0, "ctaCred10": 0, "digCred10": "00", "cip10": 0, "codStatus10": 1, "status10": "A VENCER/VENCIDO",
"nomeBeneficiario": "LOXJYMI LUJOYMUO", "logradouroBeneficiario": "OC YFLAPFI OLOXOM 686", "nuLogradouroBeneficiario": "",
"complementoLogradouroBeneficiario": "", "bairroBeneficiario": "PIRATININGA", "cepBeneficiario": 6230,
"cepComplementoBeneficiario": 150, "municipioBeneficiario": "IRORJI", "ufBeneficiario": "SP", "razCredt10": 0,
"nomePagador": "JOÃO JOSÉ DA SILVA", "cpfcnpjPagador": 414383908000008, "enderecoPagador": "AVENIDA COPACABANA",
"bairroPagador": "ALPHAVILLE", "municipioPagador": "BARUERI", "ufPagador": "SP", "cepPagador": 6050,
"cepComplementoPagador": "040", "cebp10": "", "debitoAuto10": "", "aceite10": "N", "endEletronicoPagador": "",
"nomeSacadorAvalista": "", "cnpjCpfSacadorAvalista": 0, "enderecoSacadorAvalista": "", "municipioSacadorAvalista": "",
"ufSacadorAvalista": "", "cepSacadorAvalista": 0, "cepComplementoSacadorAvalista": 0, "tp08Reg2": 2, "cense10": 0,
"agenOper10": 0, "bcoDepos10": 0, "agenDepos10": 0, "seuNumeroTitulo": ".", "dtRegistro": "18082025",
"especieDocumentoTitulo": "DM", "descEspecie": "", "vlIOF": 0, "dtEmissao": "18082025", "codigoMoedaTitulo": "R$",
"quantidadeMoeda": 0, "quantidadeCasas": 2, "dtVencimento": "21.09.2025", "descricacaoMoeda": "R$", "vlTitulo": 125599,
"vlAbatimento": 0, "dtInstrucaoProtestoNegativação": "", "diasInstrucaoProtestoNegativação": 5, "dataEnvioCartorio": "",
"numeroCartorio": "", "numeroProtocoloCartorio": "", "dataPedidoSustacao": "", "dataSustacao": "", "dtMulta": "0",
"vlMulta": 0, "qtdeCasasDecimaisMulta": 0, "cdValorMulta": 0, "descCdMulta": "", "dtJuros": "21092025", "vlJurosAoDia": 10,
"dtDesconto1Bonificacao": "19092025", "vlDesconto1Bonificacao": 9900, "qtdeCasasDecimaisDesconto1Bonificacao": 5,
"cdValorDesconto1Bonificacao": 2, "descCdDesconto1Bonificacao": "", "dtDesconto2": "", "vlDesconto2": 0,
"qtdeCasasDecimaisDesconto2": 0, "cdValorDesconto2": 0, "descCdDesconto2": "", "dtDesconto3": "", "vlDesconto3": 0,
"qtdeCasasDecimaisDesconto3": 0, "cdValorDesconto3": 0, "descCdDesconto3": "", "diasDispensaMulta": 0, "diasDispensaJuros": 1,
"cdBarras": "<NWnnwnNnWwNwnnWNwnnWwnNNwnnWWnNnwwNNwNnwwNwNnnWnwNWnNwnnwWNnNwNwnnWnnWwnNWnnnWWnnnWwNnWnwNnNwwNnWnnWNwWnnnwNNw>",
"linhaDigitavel": "23792.85600 95228.000048 92022.265208 2 12110000125599",
"despCart10": 0, "bcoCentr10": 0, "ageCentr10": 0, "acessEsc10": 0, "tipoEndosso": "",
"codigoOrigemProtesto": 0, "codigoOrigemTitulo": "", "tpVencimento": 0, "indInstrucaoProtesto": 1, "indicadorDecurso": 0,
"quantidadeDiasDecurso": 0, "ctpoAbat10": 0, "cdValorJuros": 1, "tpDesconto1": 2, "tpDesconto2": 0, "tpDesconto3": 0,
"nuControleParticipante": "", "diasJuros": 1, "cdJuros": 1, "vlJuros": 10, "cpfcnpjBeneficiário": "031759488000055",
"vlTituloEmitidoBoleto": 0, "dtVencimentoBoleto": "21/09/2025", "indTitParceld10": "", "indParcelaPrin10": "",
"indBoletoDda10": "", "dtLimitePagamentoBoleto": "21/09/2025", "dataImpressao10": 18082025, "horaImpressao10": 0,
"identTitDda10": 0, "exibeLinDig10": "N", "permPgtoParcial": "", "qtdePgtoParcial": 0, "bancoDeb": 237, "agenciaDeb": 2,
"agenciaDebDv": 7, "contaDeb": 5223, "razaoContaDebito": 705
}
```

[Obs.] Os valores vêm em centavos (`vlTitulo: 125599` = R$ 1.255,99). O `cdBarras` **não** é o código de 44 dígitos: é a codificação EBCDIC das barras ("n/N/w/W"), usada para desenhar o código de barras, e a página traz a tabela de conversão. A página também traz a montagem do código de barras de 44 posições. O campo livre do Bradesco é: agência (4) + carteira (2) + nosso número sem DV (11) + conta sem DV (7) + "0".

### 2.5 A API devolve PDF?

**Não.** Nenhum endpoint de cobrança devolve PDF. O registro devolve `linhaDigitavel`, `cdBarras` (EBCDIC) e os dados do título. A "2ª via" é feita **por você** a partir da consulta: "a partir do resultado dessa consulta, é possível gerar a 2ª via do boleto". O manual traz o leiaute que o boleto impresso precisa seguir ("Modelo para boleto de cobrança": ficha de compensação de 95–104 mm × 170–216 mm, papel com mínimo de 50 g/m², fundo branco com impressão azul ou preta etc.). Os únicos PDFs do portal são os manuais.

### 2.6 Códigos de retorno do REGISTRO (copiado – "Descrição das mensagens de retorno")

| Status-Header | Descrição |
|---|---|
| -99 | Serviço indisponível no momento. Tente novamente mais tarde. |
| -4 | Tamanho do campo inválido |
| -3 | Tipo do campo inválido |
| -2 | Contrato não encontrado |
| -1 | Contrato não aprovado |
| 0 | Solicitação atendida |
| 1 | Solicitação não encontrada |
| 2 | Erro Genérico – sistema indisponível |
| 5 | Inclusão efetuada |
| 6 | Dados inconsistentes |
| 10 | Erro Acesso Subrotina |
| 12 | Cliente/Negociação Bloqueado |
| 13 | Usuário não Autorizado |
| 14 | Espécie Título Inválida |
| 15 | Tipo/Número Inscrição Inválido |
| 16 | Informe todos os campos para decurso de Prazo |
| 17 | Nome do Pagador Especial Não Informado |
| 18 | Endereço Inválido |
| 19 | CEP Inválido |
| 20 | Agência Depositária Inválida |
| 21 | Informe todos os campos para Instrução de Protesto |
| 22 | Banco Inválido |
| 23 | Seu Número Inválido |
| 24 | Informe todos os campos para Abatimento |
| 25 | Valor dos Juros maior que o Valor do Título |
| 26 | Data de Emissão maior que a Data de Vencimento |
| 27 | Documento do Sacador Avalista Inválido |
| 28 | Informe todos os campos para Desconto |
| 29 | Informe todos os campos para Sacador Avalista |
| 30 | Data Vencimento Menor ou igual Data Emissão |
| 31 | Data Desconto menor ou igual Data Emissão |
| 32 | Data Desconto maior que Data Vencimento |
| 33 | Valor Desconto/Bonificação maior ou igual Valor Título |
| 34 | Tipo informado deve ser 1, 2 ou 3 |
| 35 | Valor Abatimento maior que o Valor do Título |
| 36 | CEP Inválido |
| 37 | Data Emissão Inválida |
| 38 | Data Vencimento Inválida |
| 39 | Percentual informado maior ou igual 100,00 |
| 40 | Número CGC/CPF inválido |
| 41 | Protesto Automático x Decurso de Prazo Incompatível |
| 42 | Banco/Agência Depositária Inválido |
| 43 | Espécie de Documento inválido |
| 44 | Informe 1-contra apresentação ou 2-a vista |
| 45 | Código da instrução de protesto inválido |
| 46 | Dias para instrução de protesto inválido |
| 47 | Código para desconto inválido |
| 48 | Código para multa inválido |
| 49 | Código para comissão permanência dia inválido |
| 50 | Espécie Documento exige CGC para Sacador Avalista |
| 51 | CEP e/ou Banco/Agência Depositária Inválido |
| 52 | Data Emissão maior ou igual Data Vencimento |
| 53 | Data Desconto Inválida |
| 54 | Data emissão maior Data Registro |
| 55 | Percentual multa informado maior que o permitido |
| 56 | Percentual comissão permanência informado maior que o permitido |
| 57 | Percentual Bonificação informado maior que o permitido |
| 58 | Prazo para Protesto inválido |
| 59 | Informe a data ou tipo do vencimento |
| 60 | Valor do IOF não permitido para produtos 05,15,43 ou 44 |
| 61 | Abatimento já cadastrado para o título |
| 62 | Abatimento não cadastrado para o título |
| 63 | Não é permitida mais de uma bonificação para o título |
| 64 | Não é permitido datas de desconto/bonificação iguais |
| 65 | Negociação inexistente |
| 66 | Cliente inexistente |
| 67 | CNPJ/CPF inválido |
| 68 | N.Número não pode ser informado quando status 4 |
| **69** | **Título já cadastrado** |
| 70 | Data e tipo de vencimento incompatíveis |
| 71 | Data de vencimento não pode ser posterior a 10 anos |
| 72 | Dias para instrução inferior ao padrão |
| 73 | Dias para instrução antecipa data de protesto |
| 74 | Valor IOF obrigatório |
| 75 | Valor IOF incompatível com id produto |
| 76 | Tipo de abatimento inválido |
| 77 | Status Inválido |
| 78 | Registro online não permite banco diferente de 237 |
| 79 | Carta para protesto não recebida |
| 80 | Tipo de vencimento inválido |
| 81 | Valor acumulado desconto/bonificação maior ou igual valor título |
| 82 | Datas desconto/bonificação fora de sequência |
| 83 | Informe todos os campos para multa |
| 84 | Código comissão permanência inválido |
| 85 | Informe todos os campos para comissão permanência |
| 86 | Registro duplicado na tabela de ocorrências |
| 87 | Solicitação de protesto já existente |
| 88 | Registro duplicado na base de atualização sequencial |
| 89 | Sacador avalista já cadastrado |
| 90 | Indicador CIP inexistente |
| 91 | Moeda negociada inexistente |
| 92 | Banco/agência operadora inexistente |
| 93 | Acessório escritural negociado inexistente |
| 94 | Pólo de serviço inexistente para banco/agência |
| 95 | Banco/agência centralizadora não cadastrada para banco/agência depositária |
| 96 | Título não encontrado pelo módulo CBON8230 |
| 97 | Valor IOF maior ou igual valor título |
| 98 | Data Inválida |
| 99 | Id Prod/Cta não cadastrados |

**Tabela de espécie de títulos** (código – sigla – descrição): 1 CH CHEQUE; 2 DM DUPLICATA DE VENDA MERCANTIL; 3 DMI DUPLICATA MERCANTIL POR INDICAÇÃO; 4 DS DUPLICATA DE PRESTAÇÃO DE SERVIÇOS; 5 DSI DUPLICATA PREST. SERVIÇOS POR INDICAÇÃO; 6 DR DUPLICATA RURAL; 7 LC LETRA DE CÂMBIO; 8 NCC NOTA DE CRÉDITO COMERCIAL; 9 NCE NOTA DE CRÉDITO EXPORTAÇÃO; 10 NCI NOTA DE CRÉDITO INDUSTRIAL; 11 NCR NOTA DE CRÉDITO RURAL; 12 NP NOTA PROMISSÓRIA; 13 NPR NOTA PROMISSÓRIA RURAL; 14 TM TRIPLICATA DE VENDA MERCANTIL; 15 TS TRIPLICATA DE PRESTAÇÃO DE SERVIÇOS; 16 NS NOTA DE SERVIÇO; 17 RC RECIBO; 18 FAT FATURA; 19 ND NOTA DE DÉBITO; 20 AP APÓLICE DE SEGURO; 21 ME MENSALIDADE ESCOLAR; 22 PC PARCELA DE CONSÓRCIO; 23 DD DOCUMENTO DE DÍVIDA; 24 CCB CÉDULA DE CRÉDITO BANCÁRIO; 25 FI FINANCIAMENTO; 26 RD RATEIO DE DESPESAS; 27 DRI DUPLICATA RURAL INDICAÇÃO; 28 EC ENCARGOS CONDOMINIAIS; 29 ECI ENCARGOS CONDOMINIAIS POR INDICAÇÃO; 31 CC CARTÃO DE CRÉDITO; 32 BDP BOLETO DE PROPOSTA; 99 OUT OUTROS.

**Limites e idempotência:** a documentação de Cobrança **não define** limite de requisições (TPS ou quota) nem regra ou header de idempotência. O que existe:
- O plano Sandbox mostra "Preço: ILIMITADO".
- O token vale 1 h e o manual avisa que "a criação excessiva de tokens pode levar a restrições".
- Há a janela de indisponibilidade de 00h00 às 03h00.
- O registro duplicado é barrado pelos códigos 69 "Título já cadastrado", 86 e 88. O nosso número precisa ser único por carteira e negociação.
- O FAQ diz: "O registro ocorre na CIP em 1 segundo". A contingência é "Através do NET EMPRESA".

### 2.7 Demais endpoints de Cobrança (entrada e principais regras, copiados)

**Baixa** – `POST …/boleto/cobranca-baixa/v1/baixar`. "A baixa é processada de forma on-line, impedindo o pagamento no Bradesco e em outros Bancos."
Campos: cpfCnpj{cpfCnpj (9), filial (4), controle (2)}; produto (2); negociacao (11 = Agência 4 + Conta 7, sem dígito); nossoNumero (11, sem o dígito); sequencia (1, Fixo "0"); codigoBaixa (2). Na tabela de códigos de baixa existe só "57 CONFORME SEU PEDIDO".
```json
{"cpfCnpj":{"cpfCnpj":31759488,"filial":0,"controle":55},"produto":9,"negociacao":28560222652,"nossoNumero":42360000024,"sequencia":0,"codigoBaixa":57}
```
Retorno: `{"status":200,"transacao":"CBTTIAGQ","mensagem":"CBTT0532 - SOLICITACAO DE BAIXA EFETUADA","dados":{"dataHoraSolicitacao":"2024-08-23-14.58.13.290548","status":57,"statusAnterior":1}}`
HTTP: 200 Operação realizada com sucesso; 400 Parâmetros informados inválidos; 412 Falha ao atender a requisição; 500 Erro inesperado na solicitação.
Erros: CBTT0107 CPF/CNPJ INVÁLIDO; CBTT0411 IDENTIFICADOR DO PRODUTO INVÁLIDO; CBTT0412 CONTA PRODUTO INVÁLIDA; CBTT0108 NOSSO NÚMERO INVÁLIDO; CBTT0928 TIPO DE CARTEIRA DE COBRANÇA NÃO PERMITIDA PARA ESSE PRODUTO; CBTT0930 TIMESTAMP DA SOLICITAÇÃO INVÁLIDO; CBTT0931 STATUS DO TÍTULO INVÁLIDO; CBTT0932 STATUS ANTERIOR DO TÍTULO INVÁLIDO; CBTT0403 USUÁRIO NÃO AUTORIZADO; CBTT0575 ESTORNO DE SOLICITAÇÃO NÃO IDENTIFICADA NA BASE DE SOLICITAÇÕES; CBTT0573 ESTORNO DE SOLICITAÇÃO DIFERENTE DE BAIXA OU REATIVAÇÃO; CBTT0552 TÍTULO INEXISTENTE PARA O CONTRATO INFORMADO; CBTT0710 SOLICITAÇÃO DE ESTORNO EFETUADA COM SUCESSO; CBTT9100 ERRO DE ACESSO AO DB2. Sucesso: CBTT0532 SOLICITAÇÃO DE BAIXA EFETUADA.

**Alteração (vencimento e outras instruções)** – `PUT …/boleto/cobranca-altera/v1/alterar`. "o usuário deve enviar a requisição contendo todos os dados do boleto, informando apenas os campos que deseja modificar". "Os campos-chave do título não podem ser alterados: Carteira, Negociação, Nosso número, CPF/CNPJ do pagador (sacado), Data de emissão do título, Valor do título."
Campos: cpfCnpj{cpfCnpj 9, filial 4, controle 2}, produto 2, negociacao 11, nossoNumero 11. dadosPagador{sacado 40, cpfCnpjSacado{cpfcnpj 9, filial 4, controle 2}, endereco 40, cep 5, sufixo 3, nomeSacador 40, Aceite (Fixo "N"), cpfCnpjSacador{…}, emailSacado 50}. dadosTitulo{seuNumero 15, dataEmissao DDMMAAAA, especie 3, vencimento{dataVencimento DDMMAAAA 8, tipoVencimento Fixo "0"}, protesto{codInstrucaoProtesto (1 = Dias corridos / 2 = Dias úteis) Sim, qtdeDiasProtesto 3}, decurso{codDecursoPrazo Sim, diasDecursoPrazo 3}, abatimento{tipoAbatimento Fixo "1" Sim, valorAbatimento 15}, dataDesc1..3 (DDMMAAAA), valDesc1..3 (15), codValDe1..3 (1-Valor / 2-Percentual), tipoDesc1..3, codigoControleParticipante 25, indicadorAvisoSacado (Fixo "0"), comissaoPermanencia{diasComissaoPermanencia 3, valorComissaoPermanencia 15, codigoComissaoPermanencia 1-Valor/2-Percentual}, codigoMulta (1-Valor/2-Percentual) Sim, diasMulta 3, valorMulta 15, codigoNegativacao (Fixo "1") Sim, diasNegativacao 3, pagamentoParcial ('S'/'N'), qtdePagamentoParcial 3}.
Retorno de sucesso: `{"status":200,"transacao":"CBTTIAGP","mensagem":"CBTT0445 - ALTERACAO EFETUADA"}`. Retorno de erro: `{"status":412,"transacao":"CBTTIAGP","mensagem":"Parâmetros informados inválidos.","causa":"CBTT0942 - CPF/CNPJ DO SACADOR AVALISTA INVALIDO"}`.
A lista de erros CBTT da alteração tem ~80 códigos (CBTT0139 a CBTT0946, mais CBTT9100). Ela é idêntica à da alteração do híbrido, copiada na seção 3.5.

**Consulta de título / 2ª via** – `POST …/boleto/cobranca-consulta/v1/consultar`. Entrada: `{"cpfCnpj":{"cpfCnpj":31759488,"filial":0,"controle":55},"produto":9,"negociacao":28560222652,"nossoNumero":60800000065,"sequencia":0,"status":0}`. Retorno (transação CBTTIAGS): o objeto `titulo` traz cedente, sacado, sacador, datas, valores, juros/multa/descontos, protesto, `codBarras` (112), `linhaDig` (54), `dtPagto` (DDMMAAAA; "Caso não tenha sido pago retornará zerado"), `vlrPagto`, `bcoProc`, `ageProc` e `Baixa{codigo, descrição, data}`. A "Tabela 1 – Status do título" vai de 01 a 99. Exemplos: 01 A VENCER / VENCIDO; 13 PAGO NO DIA; 57 CONFORME SEU PEDIDO; 61 PAGO; 62 PAGO EM CARTORIO.
Erros: CBTT0107, CBTT0411, CBTT0412, CBTT0108, CBTT0928, CBTT0931, CBTT0552, CBTT9100. Sucesso: CBTT0000 OPERAÇÃO REALIZADA COM SUCESSO.

**Lista de títulos LIQUIDADOS (pagos)** – `POST …/boleto/cobranca-lista/v1/listar`. "O período máximo de consulta é de 60 dias a partir da data de pagamento, e as informações disponibilizadas seguem o conceito D -1 (dados do dia anterior)." "A nomenclatura dos campos é case sensitivo". A paginação é de **50 registros por chamada**, controlada por `paginaAnterior` (entrada) e `pagina` / `indMaisPagina` "S"/"N" (retorno).
Entrada: cpfCnpj{cpfCnpj, filial, controle}, produto, negociacao, dataMovimentoDe/Ate (DDMMAAAA), dataPagamentoDe/Ate (DDMMAAAA), origemPagamento (0 TODOS, 1 COM REGISTRO, 2 SEM REGISTRO, 3 POR CONTABILIDADE), valorTituloDe/Ate (9(15)V99), paginaAnterior.
Retorno (CBTTIAGW): vtotTitulos, vtotPag, vtotOscila(S), vtotCheque, vtotDinheiro, difMaior, difMenor(S), pagina, indMaisPagina, qtdeTitulos, qtdeOcorr e `titulos[]` = {bancoRecebedor, agenciaRecebedora, nossoNumero, digitoNossoNumero, tipoRegistro, seuNumero, dataVencimento, dataPagamento, dataMovimento, nomePagador, descricaoOrigemPagamento, valorTitulo, valorPagamento, valorOscilacao, sinalValorOscilacao, numeroSequenciaTitulo, numeroSequenciaPagamento, codigoFormaCredito, descricaoFormaCredito, indicadorPagoCartorio}.
Erros: CBTT0107, CBTT0157 SOLICITACAO INEXISTENTE, CBTT0403, CBTT0411, CBTT0412, CBTT0558 DATA INICIAL MAIOR QUE DATA FINAL, CBTT0563, CBTT0564, CBTT0593/0594/0595 (valores), CBTT1007 NUMERO DA PAGINA ANTERIOR INVALIDA, CBTT1008 ORIGEM DE PAGAMENTO INVALIDA, CBTT9002, CBTT9100. Sucesso: CBTT0005 FIM DE CONSULTA; CBTT0018 CONSULTA EFETUADA. EXISTEM MAIS INFORMAÇÕES A SEREM DEMONSTRADAS.

**Lista de títulos BAIXADOS** – `POST …/boleto/cobranca-baixado-consulta/v1/listar`. Entrada: versao (fixo 001), cpfCnpj{…}, produto, negociacao, dataVencimentoDe/Ate (**AAAAMMDD**), valorTituloInicio, codigoBaixa (sem código, retorna todos), paginaAnterior. Retorno CBTTIAGZ com até 50 títulos por chamada.

### 2.8 Webhook de Cobrança (aviso de pagamento)

Cadastro: `POST https://openapisandbox.prebanco.com.br/boleto/cobranca-webhook/v1/cadastrar` (sandbox) e `POST https://openapi.bradesco.com.br/boleto/cobranca-webhook/v1/executar` (produção).

| Campo | Tipo | Descrição | Tam. | Obrigatório |
|---|---|---|---|---|
| cpfCnpj | Numérico | Raiz CPF/CNPJ Beneficiário | 9 | Sim |
| filial | Numérico | Filial (CPF = 0) | 4 | Sim |
| controle | Numérico | Dígito de Controle | 2 | Sim |
| versaoLayout | Numérico | Versão do Layout | 1 | Sim. Fixo "1". |
| tipoCadastro | Alfanumérico | I = Inclusão; A = Alteração; E = Exclusão; C = Consulta. | 1 | Sim |
| utilizaWebhook | Alfanumérico | Informa se o cliente utiliza webhook | 1 | Sim. "S"/"N"* |
| urlEnvio | Alfanumérico | Endereço URL para envio das informações | 100 | Sim* |
| tipoAviso | Numérico | Aviso de Pagamento | 1 | Sim. Fixo "1" |

```json
{"documento":{"cpfCnpj":"999999999","filial":"9999","controle":"99"},"versaoLayout":"1","tipoCadastro":"I","utilizaWebhook":"N","urlEnvio":"http://ABC.com.br","tipoAviso":"1"}
```
Resposta 200: `{"utilizaWebhook":"S","urlEnvio":"exemplo.com.bbr","datahoraAtualizacao":"2024-10-17T17:00:25-00:00"}`. Resposta 400: `{"listaErros":[{"descricaoErro":"CAMPO VERSAOLAYOUT OBRIGATORIO"}]}`. Resposta 422: `{"listaErros":[{"codigoErro":"CBCA0222","descricaoErro":"CLIENTE NAO TEM COBRANCA BRADESCO"}]}`.
Erros: CBCA0045 CÓDIGO DA VERSÃO INVÁLIDO; CBCA0107 CPF/CNPJ BENEFICIÁRIO INVÁLIDO; CBCA0224 TIPO DE MANUTENÇÃO DO CADASTRO INVÁLIDO; CBCA0225 INDICADOR DE USO DO WEBHOOK INVÁLIDO; CBCA0231 URL DE ENVIO INVÁLIDA; CBCA0232 URL DE TOKEN INVÁLIDA; CBCA0233 CLIENT SECRET INVÁLIDA; CBCA0222 CLIENTE NÃO TEM COBRANÇA BRADESCO; CBCA0223 CLIENTE COM CADASTRO DE COBRANÇA BLOQUEADO; CBCA0226 CLIENTE JÁ CADASTRADO NO WEBHOOK; CBCA0227 CLIENTE NÃO CADASTRADO NO WEBHOOK; CBCA0228 CADASTRO BLOQUEADO, NÃO É POSSÍVEL ALTERAR; CBCA0229 NÃO HÁ DADOS PARA ATUALIZAÇÃO; CBCA0230 NÃO É POSSÍVEL EFETUAR A OPERAÇÃO NO MOMENTO…; CBCA0080 SERVIÇO INDISPONÍVEL; CBCA0116 ERRO DE ACESSO AO BANCO DE DADOS; CBCA0201 ERRO DE ACESSO AO MÓDULO.

Certificado do seu lado: "deverá ser emitido por AC amplamente conhecida… ter no conteúdo CN (Certificate Name) a URL do ambiente ao qual ele será hospedado e ter validade de no mínimo um ano" (na página de visão geral: "no mínimo um 4 meses e no máximo 3 anos"). "O certificado deverá ser do tipo SSL, modelo EV ou OV. O modelo DV não é aceito". "Cliente precisa enviar o seu certificado público zipado… para o e-mail governancaapis@bradesco.com.br". "configurar o certificado do Bradesco como confiavel em sua aplicação". "(SLA: até 5 dias úteis)". "caso seja configurado o método em sua aplicação é necessário que seja "POST"". "Versão do TLS 1.2 ou superior." O certificado do Bradesco para o webhook de cobrança é o de boletosliquidados.bradesco.com.br.

Notificação (payload enviado ao seu endpoint): "Para os pagamentos de boletos convencionais, pagos via código de barras, o envio das informações será on-line*. Para os pagamentos do boleto híbrido, pagos via QR Code, o envio das informações será em até 20 minutos. Caso o pagamento não seja efetivado por alguma razão, o cliente não receberá nenhuma notificação."

| Campo | Tipo | Tam. | Descrição |
|---|---|---|---|
| Tipo Evento | A | 1 | Tipo do evento: P - Pagamento |
| Produto | A | 2 | Carteira (Ex.: 9, 26) |
| Negociação | A | 11 | Negociação |
| Nosso número | A | 11 | Nosso número |
| Data do Registro | A | 8 | (AAAA-MM-DD) |
| Data do Vencimento | A | 8 | (AAAA-MM-DD) |
| Valor Boleto | A | 15 | pattern \d{1,13}.\d{2} |
| Banco Recebedor | A | 3 | Em caso de "Canal de Pagamento: 4 - Pix", retornará sempre 237. |
| Canal de Pagamento | A | 1 | 1 Agência; 2 Terminal de Autoatendimento; 3 Internet; 4 Pix; 5 Correspondente Bancário; 6 Central de Atendimento; 7 Arquivo Eletrônico; 8 DDA; 9 Correspondente bancário Digital |
| Data de pagamento | A | 8 | (AAAA-MM-DD) |
| Hora de pagamento | A | 6 | (HHMMSS) |
| Valor do pagamento / valorAbatimento / valorMulta / valorJuros / valorDesc | A | 15 | pattern \d{1,13}.\d{2} |

```json
{"tipoEvento":"P","produto":"09","negociacao":"01234567891","nossoNumero":"00000123456","dataRegistro":"2026-03-10","dataVencimento":"2026-04-07","valorBoleto":"0000000000476.68","bancoRecebedor":"077","canalPagamento":"3","dataPagamento":"2026-04-07","horaPagamento":"001508","valorPagamento":"0000000000476.68","valorAbatimento":"0000000000000.00","valorMulta":"0000000000000.00","valorJuros":"0000000000000.00","valorDesc":"0000000000000.00"}
```
[Obs.] A documentação **não** fala de novas tentativas (retry), de lista de IPs de origem nem de autenticação do aviso por header. A única exigência é o seu certificado SSL EV/OV junto com a confiança no certificado do Bradesco, o que indica mTLS.

---

## PARTE 3 – BOLETO HÍBRIDO – produto "Cobrança com QR Code" v1.8.3

- Versão do produto: **1.8.3** (2026-04-20, ATIVO). Manual: "1.0.5 – 09/10/2026 – 👉 Manual API COBRANÇA COM QR CODE". Há PDF para baixar em assets.bradesco ("API_CobrançacomQRCODE_DOWNLOAD_Ingles_V1.0.5.pdf"). O conteúdo da página foi modificado em 23/10/2026.
- Notas: 1.0.1 (28/04/2025) "Api Reserva de Location"; 1.0.2 (08/08/2025) "Api Consulta específica e 2 vias de boleto de cobrança"; 1.0.3 (04/05/2026) revisão; 1.0.4 (01/09/2026) "Removido os campos relativos a Débito Automático…"; 1.0.5 (09/10/2026) moeda indexada.
- Pré-requisitos (copiados): "Possuir Contrato de Cobrança Bradesco ativo; Definir a Chave Pix que será usada na geração dos boletos com QR Code; Solicitar ao gerente do banco a habilitação da funcionalidade "175 – Registro via Webservice". Ter acesso habilitado ao Bradesco Net Empresa. Para uso da carteira 02 Garantida na cobrança com qr code é necessário que o gerente da conta realize o cadastro através do formulário 5017". O produto exige os indicadores 175 e 182.
- Autenticação: **é a mesma da Cobrança** (o Manual do desenvolvedor aponta para o mesmo artigo "Authentication – Generate Token – mTLS", `…/auth/server-mtls/v2/token`).

### 3.1 Endpoints do híbrido

| Função | Método | Sandbox | Produção |
|---|---|---|---|
| Registrar boleto com QR Code | POST | https://openapisandbox.prebanco.com.br/boleto-hibrido/cobranca-registro/v1/gerarBoleto | https://openapi.bradesco.com.br/boleto-hibrido/cobranca-registro/v1/gerarBoleto |
| Alterar boleto com QR Code | POST | https://openapisandbox.prebanco.com.br/boleto/cobranca-altera/v1/alterar | https://openapi.bradesco.com.br/boleto-hibrido/cobranca-alteracao/v1/alteraBoletoConsulta |
| Consulta específica / 2ª via | POST | …/boleto-hibrido/cobranca-consulta-titulo/v1/consultar | …/boleto-hibrido/cobranca-consulta-titulo/v1/consultar |
| Baixa (cancelamento) | POST | …/boleto/cobranca-baixa/v1/baixar | …/boleto/cobranca-baixa/v1/baixar |
| Reserva de Location | POST | …/boleto-hibrido/cobranca-reserva-location/v1/reservarLoc | …/boleto-hibrido/cobranca-reserva-location/v1/reservarLoc |
| Lista de liquidados (simples e com QR) | POST | …/boleto-hibrido/cobranca-lista/v1/listar | …/boleto-hibrido/cobranca-lista/v1/listar |
| Webhook (mesmo da Cobrança) | POST | …/boleto/cobranca-webhook/v1/cadastrar | …/boleto/cobranca-webhook/v1/executar |

[Obs.] Na alteração, a URL de sandbox é a da cobrança convencional e a de produção é outra (`/boleto-hibrido/cobranca-alteracao/v1/alteraBoletoConsulta`). Além disso, "No Header da requisição, é obrigatória a informação do txId referente ao título que se deseja alterar." A documentação não diz o nome exato do header.

### 3.2 REGISTRAR HÍBRIDO – Parâmetros de Entrada (copiado)

Formatação: "A formatação de campos percentuais na API deve conter 1 a 2 dígitos inteiros e 5 casas decimais" (0,05 → 0.05000; 2 → 2.00000; 10 → 10.00000). "A formatação de campos em Real na API deve ser preenchido com 2 casas decimais" (0,05 → 5; 0,50 → 50; 5,00 → 500). Valores são em centavos, sem separador.

| Nome do Campo | Tipo | Descrição | Qtde. | Obrigatório |
|---|---|---|---|---|
| registrarTitulo | Numérico | Registrar título 1 = Registrar o título | 1 | Sim |
| codUsuario | Alfanumérico | Código do Usuário responsável | 9 | Sim Fixo = APISERVIC |
| nroCpfCnpjBenef | Numérico | Número de Inscrição do CNPJ ou CPF do Beneficiário (Cedente) | 9 | Sim |
| filCpfCnpjBenef | Numérico | Número da Filial do CNPJ do Beneficiário (Cedente) | 4 | Sim |
| qtdDecurPrz | Numérico | Quantidade de dias para decurso de prazo. Obs.: limite máximo de até 365 dias para o qr code e boleto de cobrança 999. | 999 | Não |
| digCpfCnpjBenef | Numérico | Dígitos verificadores do CNPJ ou CPF do Beneficiário (Cedente) | 2 | Sim |
| tipoAcesso | Numérico | Tipo de acesso desejado | 1 | Sim Fixo = 2 |
| cpssoaJuridContr | Numérico | Código da pessoa jurídica do contrato | 10 | Não null ou fixo = 0 |
| ctpoContrNegoc | Numérico | Tipo do Contrato | 3 | Não null ou fixo = 0 |
| nseqContrNegoc | Numérico | Número do Contrato | 10 | Não null ou fixo = 0 |
| cidtfdProdCobr | Numérico | Identificador do Produto Cobrança (**Carteira**) | 2 | Sim |
| cnegocCobr | Numérico | Número da **Negociação**. Formato: Agência (4 posições), Zeros (7 posições), Conta (7 posições) | 18 | Sim. Ex.: AAAA0000000CCCCCCC |
| codigoBanco | Numérico | Código do Banco | 3 | Sim Fixo = 237 |
| filler | Alfanumérico | Implementações futuras | | Manter em branco |
| eNseqContrNegoc | Numérico | Número do Contrato | 10 | Não null ou fixo = 0 |
| tipoRegistro | Numérico | 001 = Título. 002 = Título com Instrução de Protesto. 003 = Título com Instrução de Protesto Falimentar | 3 | Não - Se não informado, assume 001 |
| cprodtServcOper | Numérico | Código do Produto Cobrança | 8 | Não null ou fixo = 0 |
| **ctitloCobrCdent** | Numérico | **Nosso Número** | 11 | **Sim** |
| ctitloCliCdent | Alfanumérico | Identificador do título pelo beneficiário (Seu Número) | 25 | Sim |
| demisTitloCobr | Alfanumérico | Data de emissão do título. Deve ser informada como o exemplo 01.01.2001 | 10 | Sim |
| dvctoTitloCobr | Alfanumérico | Data de vencimento do título. Deve ser informada como o exemplo 01.01.2001 | 10 | Sim Obs.: Para gerar QR Code, deve ser igual ou maior que a data corrente |
| cidtfdTpoVcto | Numérico | Identificador do tipo de vencimento. Fixo = 0 | 1 | Sim |
| cindcdEconmMoeda | Numérico | Identificador da moeda do título (BACEN) | 5 | Sim Fixo = 00006 |
| vnmnalTitloCobr | Numérico | Valor nominal do título em centavos, sem separador decimal. (Exemplo: R$ 2,00 = 200 - R$ 0,05 = 005) - R$1.234,56 = 123456 | 17 | Sim |
| qmoedaNegocTitlo | Numérico | Quantidade de moeda do título | 17 | Sim Fixo = 0 |
| cespceTitloCobr | Numérico | Código da **espécie** do título Ex.: 02 = DM | 2 | Sim |
| cindcdAceitSacdo | Alfanumérico | Identificador de aceite do devedor (Sacado) | 1 | Sim Fixo = N |
| ctpoProteTitlo | Numérico | Tipo de protesto automático do título. 1 = Dias corridos. 2 = Dias úteis | 2 | Não |
| ctpoPrzProte | Numérico | Quantidade de dias após o vencimento, para protesto automático | 2 | Sim, caso informado ctpoProteTitlo |
| ctpoProteDecurs | Numérico | Tipo decurso de protesto. 1 = Dias corridos. 2 = Dias úteis | 2 | Sim, caso informado ctpoProteTitlo |
| ctpoPrzDecurs | Numérico | Quantidade de dias para decurso de protesto | 2 | Sim. Fixo = 0 |
| cctrlPartcTitlo | Numérico | Controle do participante | 25 | Não |
| cformaEmisPplta | Numérico | Forma de emissão do boleto (Papeleta) 02 = Cliente emite | 2 | Sim Fixo = 2 |
| cindcdPgtoParcial | Alfanumérico | Indicador de pagamento parcial. Fixo = Não N = Não | 1 | S = Sim |
| codNegativacao | Numérico | Informar "3" para dias úteis ou "4" para dias corridos… requer o preenchimento de diasNegativacao… | 1 | Não |
| diasNegativacao | Numérico | Quantidade de dias para início da negativação após o vencimento. Valor mínimo aceito: 5 dias. Negativação não pode coexistir com protesto automático. | 2 | Não |
| qtdePgtoParcial | Numérico | Quantidade de pagamento parcial de 001 a 099 | 3 | Sim Fixo = 000 |
| filler1 | Alfanumérico | Implementações futuras | 18 | Manter em branco |
| **ptxJuroVcto** | Numérico | Percentual de **juros** após vencimento. Deve ser informado com 5 decimais (Exemplo: 2% = 2.00000 - 0,05% = 0.05000)… O banco utiliza truncamento nos valores calculados, e não arredondamento. | 6 | Não |
| **vdiaJuroMora** | Numérico | Valor diário de juros após vencimento, deve ser informado com 2 decimais (Exemplo: R$ 2,00 = 200 - R$ 0,05 = 005) | 17 | Não |
| qdiaInicJuro | Numérico | Quantidade de dias após o vencimento, para incidência de juros. O banco não aceita 0 → valor mínimo permitido: 1… | 2 | Sim, caso informado valor ou percentual de juros |
| **pmultaAplicVcto** | Numérico | Percentual de **multa** após vencimento deve ser informado com 5 decimais… | 6 | Não |
| **vmultaAtrsoPgto** | Numérico | Valor da multa após vencimento deve ser informado com 2 decimais (R$ 2,00 = 200) | 17 | Não |
| qdiaInicMulta | Numérico | Quantidade de dias após o vencimento, para incidência de multa. Mínimo 1… | 3 | Sim, caso informado valor ou percentual de Multa |
| **pdescBonifPgto01** | Numérico | 1° - Percentual de **desconto**, 5 decimais… | 6 | Não |
| **vdescBonifPgto01** | Numérico | 1° - Valor de desconto em centavos, sem separador decimal | 17 | Não |
| dlimDescBonif1 | Alfanumérico | 1° - Data-limite de desconto | 10 | Sim, caso informado valor ou percentual do 1° desconto/bonificação. Formato 01.01.2001 |
| pdescBonifPgto02 / vdescBonifPgto02 / dlimDescBonif2 | Num/Num/Alfa | 2° desconto (percentual 5 decimais / valor em centavos / data-limite 01.01.2001) | 6/17/10 | Não / Não / Sim, caso informado o 2° desconto |
| pdescBonifPgto03 / vdescBonifPgto03 / dlimDescBonif3 | Num/Num/Alfa | 3° desconto (idem) | 6/17/10 | Não / Não / Sim, caso informado o 3° desconto |
| ctpoPrzCobr | Numérico | Tipo de prazo 1 = Dias corridos. 2 = Dias úteis | 2 | Sim, caso informado valor desconto/bonificação ou percentual de desconto |
| pdescBonifPgto | Numérico | Percentual de bonificação. 5 decimais | 6 | Não |
| vdescBonifPgto | Numérico | Valor de bonificação. 2 decimais | 17 | Não |
| dlimBonifPgto | Alfanumérico | Data-limite de bonificação (01.01.2001) | 10 | Sim, caso informado valor ou percentual de bonificação |
| vabtmtTitloCobr | Numérico | Valor de abatimento do título em centavos | 17 | Não |
| viofPgtoTitlo | Numérico | Valor de IOF do título | 17 | Não, usar apenas para seguradoras |
| filler2 | Alfanumérico | Implementações futuras | 0 | Manter em branco |
| isacdoTitloCobr | Alfanumérico | Nome do devedor (**Pagador**/Sacado) | 70 | Sim |
| elogdrSacdoTitlo | Alfanumérico | Logradouro do devedor | 40 | Sim |
| enroLogdrSacdo | Numérico | Número do logradouro do devedor | 10 | Sim |
| ecomplLogdrSacdo | Alfanumérico | Complemento do logradouro | 15 | Não |
| ccepSacdoTitlo | Numérico | CEP do devedor | 5 | Sim |
| ccomplCepSacdo | Numérico | Complemento do CEP | 3 | Sim |
| ebairoLogdrSacdo | Alfanumérico | Bairro | 40 | Sim |
| imunSacdoTitlo | Alfanumérico | Município | 30 | Sim |
| csglUfSacdo | Alfanumérico | UF | 2 | Sim |
| indCpfCnpjSacdo | Numérico | 1 = CPF. 2 = CNPJ | 1 | Sim |
| nroCpfCnpjSacdo | Numérico | Número do CPF ou CNPJ do devedor | 14 | Sim |
| renderEletrSacdo | Alfanumérico | e-mail do devedor | 70 | Não |
| cdddFoneSacdo | Numérico | DDD | 3 | Não |
| cfoneSacdoTitlo | Numérico | Telefone | 11 | Não |
| bancoCentProt | Numérico | Código do Banco de protesto | 3 | Sim, Fixo = 0 |
| agenciaDvCentPr | Numérico | Agência de protesto | 5 | Sim, FIXO = 0 |
| isacdrAvalsTitlo, elogdrSacdrAvals, enroLogdrSacdr, ecomplLogdrSacdr, ccepSacdrTitlo, ccomplCepSacdr, ebairoLogdrSacdr, imunSacdrAvals, csglUfSacdr, indCpfCnpjSacdr, nroCpfCnpjSacdr, renderEletrSacdr, cdddFoneSacdr, cfoneSacdrTitlo | | Dados do sacador avalista (Beneficiário final) | 40/40/10/15/5/3/40/40/2/1/14/70/3/11 | "Sim, caso informados dados do sacador avalista (Beneficiário final)" (nome, complemento, e-mail e telefone: Não) |
| filler3 | Alfanumérico | Implementações futuras | 0 | Sim Fixo = 0 |
| fase | Numérico | Fase de atualização do QR Code: 1 = Registro do título e geração do QR Code. 2 = Vinculação do título com QR code | 1 | Sim, Fixo = 1 |
| cindcdCobrMisto | Alfanumérico | Indicador do registro de título com QR Code S = Sim / N = Não | 1 | Sim Fixo = S |
| ialiasAdsaoCta | Alfanumérico | Chave Pix do beneficiário | 100 | Manter em branco |
| iconcPgtoSpi | Alfanumérico | TXID do título | 35 | Manter em branco |
| caliasAdsaoCta | Alfanumérico | Códigos de erro na geração do QR Code pelo Pix | 15 | Manter em branco |
| ilinkGeracQrcd | Alfanumérico | Identificação do location do QR Code gerado pelo Pix | 77 | Manter em branco |
| wqrcdPdraoMercd | Alfanumérico | Código EMV do QR Code gerado pelo Pix | 500 | Manter em branco |
| validadeAposVencimento | Alfanumérico | Quantidade de dias após vencimento, que o título é válido para pagamento via Pix | 4 | Manter em branco |
| filler4 | Alfanumérico | Implementações futuras | 0 | Manter em branco |
| idLoc | Alfanumérico | Identificação do Location (reservado antes em "Reserva de Location") | 19 | Não |

Destaques:
- **Nosso número:** no híbrido, `ctitloCobrCdent` (11) é **obrigatório**, ou seja, quem gera é o cliente. É diferente da cobrança convencional, onde o banco pode gerar.
- **Chave Pix:** não vai na requisição ("Manter em branco"). Ela vem da negociação de cobrança. FAQ: "pode ser usado qualquer uma das opções de chave Pix abaixo, desde que esteja previamente cadastrada na negociação de cobrança: CNPJ, Telefone, e-mail, aleatória (EVP)."
- **Mensagens:** o leiaute do híbrido **não tem** campo de mensagem/instruções.

Exemplo de Entrada (JSON) – copiado:

```json
{
"ctitloCobrCdent": "46576895814", "registrarTitulo": "1", "qtdDecurPrz": "99", "codUsuario": "APISERVIC",
"nroCpfCnpjBenef": "68542653", "filCpfCnpjBenef": "1018", "digCpfCnpjBenef": "38", "tipoAcesso": "2",
"cpssoaJuridContr": "2337627", "ctpoContrNegoc": "000", "nseqContrNegoc": "2337627", "cidtfdProdCobr": "09",
"cnegocCobr": "386100000000041000", "filler": "", "codigoBanco": "237", "eNseqContrNegoc": "2337627",
"tipoRegistro": "001", "cprodtServcOper": "00000000", "ctitloCliCdent": "019690-1-1", "demisTitloCobr": "04.09.2023",
"dvctoTitloCobr": "11.12.2024", "cidtfdTpoVcto": "0", "cindcdEconmMoeda": "6", "vnmnalTitloCobr": "5000",
"qmoedaNegocTitlo": "0", "cespceTitloCobr": "25", "cindcdAceitSacdo": "N", "ctpoProteTitlo": "00", "ctpoPrzProte": "00",
"ctpoProteDecurs": "00", "ctpoPrzDecurs": "00", "cctrlPartcTitlo": "00811927240196900001", "cformaEmisPplta": "02",
"cindcdPgtoParcial": "N", "qtdePgtoParcial": "000", "filler1": "", "ptxJuroVcto": "0", "vdiaJuroMora": "00000000000000012",
"qdiaInicJuro": "01", "pmultaAplicVcto": "000000", "vmultaAtrsoPgto": "100", "qdiaInicMulta": "01",
"pdescBonifPgto01": "0", "vdescBonifPgto01": "0", "dlimDescBonif1": "", "pdescBonifPgto02": "0", "vdescBonifPgto02": "0",
"dlimDescBonif2": "", "pdescBonifPgto03": "0", "vdescBonifPgto03": "0", "dlimDescBonif3": "", "ctpoPrzCobr": "00",
"pdescBonifPgto": "0", "vdescBonifPgto": "0000", "dlimBonifPgto": "", "vabtmtTitloCobr": "00000000000000000",
"viofPgtoTitlo": "0", "filler2": "", "isacdoTitloCobr": "DOUGLASJOSEBRUNO", "elogdrSacdoTitlo": "RUASILVA330",
"enroLogdrSacdo": "11", "ecomplLogdrSacdo": "", "ccepSacdoTitlo": "13560", "ccomplCepSacdo": "49",
"ebairoLogdrSacdo": "CENTRO", "imunSacdoTitlo": "ARAPONGAS", "csglUfSacdo": "PR", "indCpfCnpjSacdo": "1",
"nroCpfCnpjSacdo": "00045886591893", "renderEletrSacdo": "ENDERECOSACADO", "cdddFoneSacdo": "043",
"cfoneSacdoTitlo": "12345678", "bancoCentProt": "000", "agenciaDvCentPr": "00000", "isacdrAvalsTitlo": "",
"elogdrSacdrAvals": "", "enroLogdrSacdr": "", "ecomplLogdrSacdr": "", "ccepSacdrTitlo": "00000", "ccomplCepSacdr": "000",
"ebairoLogdrSacdr": "", "imunSacdrAvals": "", "csglUfSacdr": "", "indCpfCnpjSacdr": "", "nroCpfCnpjSacdr": "00000000000000",
"renderEletrSacdr": "", "cdddFoneSacdr": "", "cfoneSacdrTitlo": "", "filler3": "", "fase": "1", "cindcdCobrMisto": "S",
"ialiasAdsaoCta": "", "iconcPgtoSpi": "", "caliasAdsaoCta": "", "ilinkGeracQrcd": "", "wqrcdPdraoMercd": "",
"validadeAposVencimento": "0", "filler4": ""
}
```

### 3.3 REGISTRAR HÍBRIDO – Resposta

Exemplo de Retorno (JSON), copiado. O final, que a página corta, foi completado com o markdown de origem do portal:

```json
{
"statusHttp": 200, "cidtfdProdCobr": 9, "cnegocCobr": 386100000000041000, "cpssoaJuridContr": 2269651,
"ctpoContrNegoc": 48, "nseqContrNegoc": 2337686, "cprodtServcOper": 1730, "ctitloCobrCdent": 46576895814,
"tp08Reg1": 1, "agencCred10": 0, "ctaCred10": 0, "digCred10": "00", "cip10": 0, "codStatus10": 1,
"status10": "A VENCER/VENCIDO", "cedente10": "EMPRESA PGIT NET EMPRESA", "endCedente10": "R JOSE LODO NETO 52",
"baiCedente10": "VELOSO", "cepEndCed10": 6154, "cepcCedente10": 10, "cidCedente10": "OSASCO", "ufCedente10": "SP",
"razCredt10": 0, "nomeSacado10": "DOUGLASJOSEBRUNO", "cnpjSacado10": 458865918000093, "endSacado10": "RUASILVA330",
"baiSacado10": "CENTRO", "cidSacado10": "ARAPONGAS", "ufSacado10": "PR", "cepSacado10": 13560, "cepcSacado10": "049",
"aceite10": "N", "enderecoEma10": "ENDERECOSACADO", "cnpjSacador10": 0, "cepSacador10": 0, "cepcSacador10": 0,
"tp08Reg2": 2, "cense10": 0, "agenOper10": 0, "bcoDepos10": 0, "agenDepos10": 0, "snumero10": "019690-1-1",
"dataReg10": "02092024", "especDocto10": "FI", "valorIof10": 0, "dataEmis10": "04092023", "especMoeda10": "R$",
"qtdeMoeda10": 0, "qtdeCas10": 2, "dataVencto10": "11.12.2024", "descrMoeda10": "R$", "valMoeda10": 5000,
"valAbat10": 0, "diasProt10": 0, "dataMulta10": "11122024", "valMulta10": 1.00, "qtdeCasMul10": 2, "codValMul10": 1,
"descrMulta10": "VALOR FIXO", "dataPerm10": "11122024", "valPerm10": 12, "qtdeCasDe110": 0, "qtdeCasDe210": 0,
"qtdeCasDe310": 0, "diasMulta10": 1, "diasJuros10": 1,
"codBarras10": "<NWnnwnNnWwwNnNwnWnwNnnNWwnnWWnnnWWnNnWwnnnWWnNNwwnwNNwnwnNNwnwNwNNwWnnnNNwwwNnWnWnwNnwnNnWnnWWnNnwnWnnWWnnnWWn>",
"linhaDig10": "23793.86101 94657.689587 14004.100005 1 99270000005000",
"despCart10": 0, "bcoCentr10": 0, "ageCentr10": 0, "acessEsc10": 0, "oriProt10": 0, "ctpoVencto10": 0,
"codInscrProt10": 0, "codDecurPrz10": 0, "qtdDDecurPrz10": 99, "ctpoAbat10": 0, "codComisPerm10": 1,
"ctpoDesc110": 0, "ctpoDesc210": 0, "ctpoDesc310": 0, "ctrlPartic10": "00811927240196900001", "diasComisPerm10": 1,
"codComisPerm101": 1, "qmoedaComisPerm": 0.12, "cnpjCpfCedente10": "068542653101838", "valorMoedaBol10": 0,
"dataVenctoBol10": "11/12/2024", "dataLimitePgt10": "11/12/2024", "dataImpressao10": 4092023, "horaImpressao10": 0,
"identTitDda10": 0, "exibeLinDig10": "N", "permPgtoParcial": "N", "qtdePgtoParcial": 0, "cindcdCobrMisto": "S",
"ialiasAdsaoCta": "9fb698d6-b191-4cec-99a5-ae7b86818039",
"iconcPgtoSpi": "20240902237093861004100046576895814",
"ilinkGeracQrcd": "qrpix-h.bradesco.com.br/qr/v2/cobv/4de4b076-c2c9-42f9-9a81-a86ae66541a2",
"wqrcdPdraoMercd": "00020101021226930014BR.GOV.BCB.PIX2571qrpix-h.bradesco.com.br/qr/v2/cobv/4de4b076-c2c9-42f9-9a81-a86ae66541a2520400005303986540550.005802BR5924EMPRESA PGIT NET EMPRESA6006OSASCO62070503***63049C6A",
"validadeAposVencimento": 0,
"sfase": 1
}
```

Campos-chave da resposta, segundo a tabela "Parâmetros de Saída":
- `ctitloCobrCdent` = **Nosso Número** (11)
- `linhaDig10` = **Linha digitável** (54)
- `codBarras10` = **Código de barras** (112, EBCDIC)
- `ialiasAdsaoCta` = **Chave Pix do beneficiário** (100)
- `iconcPgtoSpi` = **TXID do título** (35)
- `ilinkGeracQrcd` = **location** do QR Code (77), do tipo **cobv**
- `wqrcdPdraoMercd` = **"Código EMV do QR Code"** (500), ou seja, o **Pix copia-e-cola**
- `caliasAdsaoCta` = "Códigos de erro na geração do QR Code pelo BSPI" (15)
- `validadeAposVencimento` (4)
- `sFase`: 1 = Registro do título e envio ao BSPI; 2 = Vinculação do título com QR Code

Os demais campos de saída seguem o padrão da consulta: cedente10, sacado10, sacador10, datas, valores, multa, juros, descontos, protesto, DDA e pagamento parcial.

FAQ: "Quando constar o EMV (copia e cola) no campo "wqrcdPdraoMercd" na resposta da requisição significa que o boleto foi gerado com QR Code."

**PDF?** Não. O registro devolve linha digitável, código de barras EBCDIC e o EMV. A consulta específica do híbrido (3.4) devolve também `base64` = "Imagem do QR Code em Base64", e não um PDF do boleto.

**Erros do registro híbrido:** a tabela "Mensagens de Retorno" é **idêntica** à da cobrança (códigos -99 a 99, inclusive **69 "Título já cadastrado"**). As únicas diferenças de texto são: "Erro Acesso Sub-rotina", "Informe 1-Contra-apresentação ou 2-À vista", "Não são permitidas datas de desconto/bonificação iguais", "Registro on-line não permite Banco diferente de 237" e "Polo de serviço…". Na tabela de espécies, o código 31 CC aparece como "Cartão de Crédito. Obs.: não disponível no momento para QR Code".

FAQ do híbrido (resumo fiel):
- O registro na CIP leva "1 segundo".
- "O boleto com qr code pode ter uma data de vencimento máxima de até 3 anos".
- Com protesto, "quando o boleto entrar em situação de protesto, o QR Code será baixado automaticamente".
- "Somente QR Code dinâmico".
- Não aceita valor divergente: "deve ser pago exatamente o valor calculado no momento do pagamento".
- "o QR Code ficará em aberto, no máximo, por 60 (sessenta) dias após o vencimento".
- "os pagamentos realizados via QR Code ficam registrados como "pago no dia", em até 20 minutos após o pagamento e no período noturno realizamos a baixa do boleto".
- "Quando o pagamento ocorrer pelo boleto, o QR Code será baixado no processamento noturno e retornado ao cliente no arquivo de retorno com o código de ocorrência 06".

### 3.4 Consulta específica / 2ª via (híbrido)

Entrada: cpfCnpjUsuario (9), filialCnpjUsuario (4), controleCpfCnpjUsuario (2), idProduto (2), contaProduto (11), nomePersonalizado (8; "Se não fornecido, será utilizado o nome padrão "bradesco""), nossoNumero (11), seqTitulo (3, opcional), status (2, opcional).
```json
{"contaProduto":38610041000,"controleCpfCnpjUsuario":38,"cpfCnpjUsuario":68542653,"filialCnpjUsuario":1018,"idProduto":9,"nomePersonalizado":"","nossoNumero":974439324,"seqTitulo":0,"status":0}
```
O retorno traz, entre outros:
- `base64` ("Imagem do QR Code em Base64")
- `codBarras` e `linhaDig` (ex.: "23793.86101 90097.003934 24004.100004 3 11180000006000")
- `codStatus` / `status`
- `dtPagto`, `vlrPagto` e `qtdPagto`
- `schavePix` (chave) e `semvQrcode` (EMV copia-e-cola)
- `informacoesChavePix`
- `codMensagem` "CBTT0000" e `mensagem` "OPERAÇÃO REALIZADA COM SUCESSO"

Status 51 = "Por acerto (quando pagamento ocorre via QR Code)". Erros: CBTT0107, 0411, 0412, 0108, 0928, 0931, 0552, 9100.

### 3.5 Alteração do híbrido

Entrada copiada: codUsuario (Fixo = OPENAPI); vnmnalTitloCobr ("Campo não habilitado"); chave{cpfCnpj/cnpjCpf, filial, controle, idprod, ctaprod (11), nossoNumero}; dadosTitulo{…}.
Campos de dadosTitulo:
- seuNumero, dataEmissao (DDMMAAAA), especie (sigla), dataVencimento (DDMMAAAA, "Sim, informar data original ou a que deseja alterar"), codVencimento ("0")
- codInstrucaoProtesto (1 = Dias corridos, 2 = Dias úteis, 9 = Remover) e diasProtesto
- codDecurso (1 = Incluir, 2 = Remover) e diasDecurso ("No QR Code o decurso máximo é de 60 dias")
- codAbatimento (1 = incluir, 2 = Remover, 3 = Alterar) e valorAbatimentoTitulo
- dataPrimeiroDesc, valorPrimeiroDesc, codPrimeiroDesc (1 = Valor, 2 = Percentual, 3–6 = bonificação) e acaoPrimeiroDesc (1/2/3); o mesmo para o Segundo e o Terceiro
- controleParticipante e idAvisoSacado ("S")
- diasAposVencidoJuros, valorJuros e codJuros (1 = Valor, 2 = Percentual, 9 = Cancelar)
- codMulta (1/2/9), diasAposVencimentoMulta e valorMulta
- codigoNegativacao (1 = Dias Corridos, 2 = Cancela) e diasNegativacao
- codPagamentoParcial e qtdePagamentosParciais ("Campo não habilitado")
- sacado, endereco, cep, CepSuf, emailSacado, nomeSacador e CGC/CPF Avalista

"Não é permitida a alteração dos campos-chave… Carteira; Negociação; Nosso número; Dados do pagador/sacado…; Data de emissão do título; Valor do título." "⚠️ Encontra-se em desenvolvimento a funcionalidade que permitirá a alteração dos dados do sacado."
Sucesso: `{"codigo":"CBTT0445","mensagem":"ALTERACAO EFETUADA"}`. Erro: `{"status":412,"transacao":"CBTTIAGP","mensagem":"Parâmetros informados inválidos.","causa":"CBTT0942 - CPF/CNPJ DO SACADOR AVALISTA INVALIDO"}`.

Tabela de erros da alteração (igual à da cobrança convencional), copiada:
CBTT0139 TIPO DE VENCIMENTO INVALIDO; CBTT0144 DIAS DE PROTESTO INVALIDO; CBTT0147 A SOMATORIA DOS CAMPOS ABATIMENTO, DESCONTO E BONIFICACAO, EXCEDEU O VALOR DO TITULO; CBTT0150 VALOR DO JUROS/MORA INFORMADO EXCEDEU O PARAMETRO; CBTT0162 DATA DE VENCIMENTO INVALIDA; CBTT0189 CAMPO NOSSO NUMERO INVALIDO; CBTT0197 DIAS PARA COBRANCA DE MULTA INVALIDO; CBTT0246 UTILIZAR 3 DESCONTOS OU 2 DESCONTOS E BONIFICACAO; CBTT0251 CEP SACADO INVALIDO; CBTT0401 SITUACAO TITULO INVALIDO PARA ALTERACAO; CBTT0403 USUARIO NAO AUTORIZADO; CBTT0406 DATA VENCIMENTO MENOR OU IGUAL DATA EMISSAO; CBTT0407 DATA DESCONTO MENOR OU IGUAL DATA EMISSAO; CBTT0408 DATA DESCONTO MAIOR QUE DATA VENCIMENTO; CBTT0409 VALOR DESCONTO/BONIFICACAO MAIOR OU IGUAL VALOR TITULO; CBTT0411 IDENTIFICADOR DO PRODUTO INVALIDO; CBTT0412 CONTA PRODUTO INVALIDA; CBTT0413 VALOR ABATIMENTO MAIOR OU IGUAL VALOR TITULO; CBTT0428 ESPECIE DE DOCUMENTO INVALIDO; CBTT0430 CODIGO DA INSTRUCAO DE PROTESTO INVALIDO; CBTT0431 DIAS PARA INSTRUCAO DE PROTESTO INVALIDO; CBTT0432 CODIGO PARA DECURSO DE PRAZO INVALIDO; CBTT0433 DIAS PARA DECURSO DE PRAZO INVALIDO; CBTT0434 CODIGO PARA DESCONTO INVALIDO; CBTT0435 CODIGO PARA MULTA INVALIDO; CBTT0436 CODIGO PARA COMISSAO PERMANENCIA DIA INVALIDO; CBTT0437 DIAS DE PROTESTO AUTOMATICO ULTRAPASSA DECURSO DE PRAZO; CBTT0438 ESPECIE DOCUMENTO EXIGE CGC PARA SACADOR AVALISTA; CBTT0443 DATA DESCONTO INVALIDA; CBTT0449 VALOR DA BONIFICACAO INFORMADO MAIOR QUE O PERMITIDO; CBTT0455 DATA DE VENCIMENTO INCOMPATIVEL COM O TIPO DE VENCIMENTO; CBTT0458 VALOR INCOMPATIVEL COM O TIPO DE ABATIMENTO 1; CBTT0466 DATAS DE DESCONTOS IGUAIS; CBTT0478 ALTERACAO DE CONTROLE PARTICIPANTE NAO AUTORIZADA; CBTT0492 DATA VENCIMENTO POSTERIOR A 10 ANOS; CBTT0495 INFORME TODOS OS CAMPOS P/ ABATIMENTO; CBTT0498 INFORME TODOS OS DADOS DO SACADOR AVALISTA; CBTT0502 INFORME TODOS OS DADOS PARA DESCONTO/BONIFICACAO; CBTT0505 INFORME TODOS OS CAMPOS PARA MULTA; CBTT0506 INFORME TODOS OS CAMPOS PARA COMISSAO DE PERMANENCIA; CBTT0530 TITULO PENDENTE EM MORA - BAIXA BLOQUEADA; CBTT0552 TITULO INEXISTENTE PARA O CONTRATO INFORMADO; CBTT0738 PERCENTUAL DE JUROS EXCEDE O PERCENTUAL PARAMETRIZADO; CBTT0741 VALOR DA MULTA INFORMADO EXCEDEU O PARAMETRO; CBTT0797 INFORME TODOS OS CAMPOS PARA INTRUCAO DE PROTESTO/NEGATIVACAO; CBTT0813 NEGOCIACAO NAO PERMITE ESPECIE CARTAO DE CREDITO; CBTT0814 ESPECIE DE TITULO CC EXIGE CONTRACAO DE PAGAMENTO PARCIAL; CBTT0815 NEGOCIACAO NAO PERMITE PAGAMENTO PARCIAL 0819; CBTT0822 INFORME APENAS PROTESTO AUTOMATICO OU NEGATIVACAO AUTOMATICA; CBTT0823 ABATIMENTO MAIOR QUE ZEROS PARA ESPECIE CARTAO DE CREDITO; CBTT0824 DESCONTO NAO PERMITIDO PARA TITULO CARTAO DE CREDITO; CBTT0825 MULTA NAO PERMITIDA PARA TITULO CARTAO DE CREDITO; CBTT0827 JUROS NAO PERMITIDA PARA TITULO CARTAO DE CREDITO; CBTT0835 CODIGO DA INSTRUCAO DE PROTESTO / NEGATIVACAO INVALIDO; CBTT0851 TÍTULO DE PROPOSTA NAO PERMITE PROTESTO; CBTT0884 TÍTULO DE DEPOSITO E APORTE NAO PERMITE NEGATIVACAO; CBTT0885 PAGAMENTO PARCIAL NAO PERMITIDO TITULO TÍTULO DE DEPOSITO E APORTE; CBTT0888 ABATIMENTO NAO PERMITIDO PARA TITULO TÍTULO DE DEPOSITO E APORTE; CBTT0889 DESCONTO NAO PERMITIDO PARA TITULO TÍTULO DE DEPOSITO E APORTE; CBTT0891 BENEFICIARIO FINAL OBRIGATORIO PARA TÍTULO DE DEPOSITO E APORTE; CBTT0904 TÍTULO DE PROPOSTA NÃO PERMITE ALTERACAO PARA VENCIDO; CBTT0905 TÍTULO DE PROPOSTA NÃO PERMITE ALTERACAO DE DECURSO DE PRAZO; CBTT0907 TIPO DE ABATIMENTO INVALIDO; CBTT0909 AVISO SACADO INVALIDO; CBTT0910 PAGAMENTO PARCIAL INVALIDO; CBTT0912 NÃO É PERMITIDO REMOVER PAGAMENTO PARCIAL; CBTT0913 NÃO É PERMITIDO REDUZIR QUANTIDADE DE PAGAMENTO PARCIAL; CBTT0914 DESCONTO INSENTO NÃO PODE SER ALTERADO PARA CONCEDIDO; CBTT0916 TIPO DE DESCONTO INVALIDO; CBTT0918 ALTERACAO REPRESADA; CBTT0922 NÃO INFORMAR O VALOR OU PERCENTUAL DO JUROS; CBTT0936 TÍTULO DE PROPOSTA NÃO PERMITE NEGATIVACAO; CBTT0937 DIAS DE NEGATIVACAO MENOR QUE O PARAMETRIZADO; CBTT0938 CLIENTE NÃO POSSUI NEGATIVACAO NEGOCIADA; CBTT0939 CPF/CNPJ DO PAGADOR NÃO PODE SER ALTERADO; CBTT0940 PRODUTO DE DESCONTO E TRANSFERENCIA DE RECEBIVEIS NÃO PERMITEM ALTERACAO; CBTT0941 ACEITE INVALIDO; CBTT0943 DATA DE EMISSAO NÃO PODE SER ALTERADA; CBTT0944 CARTAO DE CREDITO PRECISA ACEITAR QUALQUER VALOR DE PAGAMENTO; CBTT0945 PAGAMENTO PARCIAL MAIOR QUE 1 PARA TÍTULO DE PROPOSTA; CBTT0946 ESPECIE NÃO PODE SER ALTERADA; CBTT9100 ERRO DE ACESSO AO DB2. Sucesso: CBTT0445 ALTERACAO EFETUADA.

### 3.6 Reserva de Location

`POST …/boleto-hibrido/cobranca-reserva-location/v1/reservarLoc`. Entrada: `{"codUsuario":"APISERVIC","cnpjCpfBnf":68542653,"cflialCnpjCpfBnf":1018,"cctrlCnpjCpfBnf":38,"cidtfdProdCobr":9,"agenciaCobr":3861,"contaCobr":41000}`. Retorno: `{"criacao":"2025-04-30T19:44:32.687Z","id":"95791122","location":"qrpix-h.bradesco.com.br/qr/v2/cobv/99ccee3f-93ae-49cb-9068-64151816e181","tipoCob":"cobv"}`. Status: 200 "Location criado com sucesso", 400 "Location não criado". O `id` reservado vai no campo `idLoc` do registro.

### 3.7 Lista de liquidados (simples e com QR Code)

`POST …/boleto-hibrido/cobranca-lista/v1/listar`. A entrada é a mesma da lista de liquidados da cobrança (seção 2.7). O retorno, em cada item de `titulos[]`, tem **dois campos a mais**:
- `indicadorPagoQrCode` (Alfanumérico 1): "Indicador de pago via QR Code ("S" ou "N")"
- `txId` (Alfanumérico 35): "Informação do TXID liquidado"

Exemplo de item: `"nossoNumero": 17124005843, … "indicadorPagoQrCode": "S", "txId": "20250624237093861004100000000027896"`. Período de 60 dias, D-1 e 50 registros por página.

### 3.8 Como o Pix pago de um boleto híbrido é avisado e ligado ao boleto

1. **Webhook de Cobrança** (o mesmo cadastro da seção 2.8): o aviso chega em até 20 minutos ("Para os pagamentos do boleto híbrido, pagos via QR Code, o envio das informações será em até 20 minutos") com `canalPagamento = "4"` (Pix) e `bancoRecebedor = "237"` ("Em caso de 'Canal de Pagamento: 4 - Pix', retornará sempre 237"). A ligação com o boleto é feita por **produto + negociação + nossoNumero**. O payload do webhook de cobrança **não traz o txid**.
2. **Lista de liquidados do híbrido:** traz `nossoNumero` junto com `txId` e `indicadorPagoQrCode = "S"`.
3. **Registro:** o próprio registro devolve o `iconcPgtoSpi` (TXID). Guarde o par nossoNumero ↔ txid na hora do registro.
4. **Consulta específica:** depois do pagamento, o título vai para status 13 "Pago no dia" e depois 51 "Por acerto (quando pagamento ocorre via QR Code)".

[Obs.] Nos dois exemplos da documentação, o txid de 35 posições segue o padrão **AAAAMMDD + 237 + carteira (2) + agência (4) + conta (7) + nosso número (11)**. Por exemplo, "20240902 237 09 3861 0041000 46576895814". Isso é inferência minha a partir dos exemplos, não regra escrita. A documentação também **não diz** se o webhook Pix (PUT /v2/webhook/{chave}) dispara para o QR Code do boleto híbrido.

---

## PARTE 4 – API PIX (recebimento) – produto "Pix - geração de QR Code" v1.2.3

- Versão do produto: **1.2.3** (2026-04-20). Manual: "1.1.1 – 14/05/2026 – 👉 Manual Api Pix - geração de QR Code". Notas de versão: só "14/05/2026 1.1.1 Documentação Realizada revisão ortográfica e estrutural do Manual." O PDF "Como gerar credencial" foi atualizado em **04/11/2026**.
- Pré-requisitos: "Ser correntista pessoa jurídica; Possuir contrato do Pix formalizado com o banco; Dispor de credenciais válidas para autenticação e consumo das APIs; Para funcionalidades que utilizam webhook, possuir certificado digital configurado para autenticação mTLS (Mutual TLS)".

### 4.1 Autenticação Pix (copiado de "Autenticação - Gerar Token - PIX", manual 2.0.0 de 06/07/2026)

- Produção: `POST https://qrpix.bradesco.com.br/auth/server/oauth/token`
- Sandbox: `POST https://openapisandbox.prebanco.com.br/auth/server/oauth/token`

[Obs.] O endpoint de token é **diferente** do da Cobrança (`/auth/server-mtls/v2/token`).

Certificado: "Produção: ✅ A1 emitido por uma autoridade certificadora. ✅ Prazo de validade no minimo de 2 meses e no máximo 3 anos. ✅ Ter a razão social + CNPJ no CN do certificado. Sandbox: ✅ A1 auto assinado. …". O canal é **mTLS**, com certificado público e chave privada configurados no cliente HTTP.

Headers: `Content-Type: application/x-www-form-urlencoded`. Body: `grant_type=client_credentials`, `client_id={{ClientID_PRD}}`, `client_secret={{ClientSecret_PRD}}`, `scope=` (vazio).
```
curl -X POST 'https://openapisandbox.prebanco.com.br/auth/server/oauth/token' \
--header 'Content-Type: application/x-www-form-urlencoded' \
--data-urlencode 'grant_type=client_credentials' \
--data-urlencode 'client_id={{ClientID_PRD}}' \
--data-urlencode 'client_secret={{ClientSecret_PRD}}' \
--data-urlencode 'scope='
```
O token vale 1 hora, com a mesma recomendação de não gerar tokens em excesso. Os erros 401 são os mesmos da Cobrança.

**Escopos (cob.write, cobv.write, pix.read, webhook.write…): a documentação não lista nenhum.** O campo `scope` vai **vazio** tanto no manual quanto na collection. [Obs.] Isso sugere que as permissões estão ligadas à credencial e aos recursos registrados no portal, e não a escopos pedidos no token.

### 4.2 URLs base e endpoints

Base: Sandbox **`https://openapisandbox.prebanco.com.br`** e Produção **`https://qrpix.bradesco.com.br`**. O location devolvido em sandbox/homologação usa `qrpix-h.bradesco.com.br`.

| Função | Método | Caminho (igual em sandbox e produção) |
|---|---|---|
| Criar cobrança imediata (txid gerado pelo banco) | POST | /v2/cob |
| Criar cobrança imediata com txid | PUT | /v2/cob/{txid} |
| Revisar cobrança imediata | PATCH | /v2/cob/{txid} |
| Consultar cobrança imediata | GET | /v2/cob/{txid} |
| Listar cobranças imediatas | GET | /v2/cob?inicio=…&fim=… |
| Listar cobranças imediatas por chave | GET | **/v1/cob/chavepix**?… (extensão Bradesco, em v1) |
| Criar cobrança com vencimento | PUT | /v2/cobv/{txid} |
| **Criar cobv com EMV e imagem do QR** | PUT | **/v2/cobv-emv/{txid}** (extensão Bradesco) |
| Revisar cobv | PATCH (escrito "PATH" na página) | /v2/cobv/{txid} |
| Consultar cobv | GET | /v2/cobv/{txid} |
| Listar cobv | GET | /v2/cobv?… |
| Cobrança estática | POST | **/v1/cobe** (extensão Bradesco) |
| Criar location | POST | /v2/loc |
| Listar locations | GET | /v2/loc?… |
| Recuperar location | GET | /v2/loc/{id_location} |
| Desvincular cobrança da location | DELETE | /v2/loc/{id_location}/txid |
| Consultar Pix recebido | GET | /v2/pix/{e2eid} |
| Listar Pix recebidos | GET | /v2/pix?inicio=…&fim=… |
| Solicitar devolução | PUT | /v2/pix/{e2eid}/devolucao/{id_devolução} |
| Consultar devolução | GET | /v2/pix/{e2eid}/devolucao/{id_devolução} |
| Configurar webhook | PUT | /v2/webhook/{chave_pix} |
| Consultar webhook | GET | /v2/webhook/{chave_pix} |
| Excluir webhook | DELETE | /v2/webhook/{chave_pix} |

Diferenças em relação ao padrão do Banco Central:
- Usa o prefixo `/v2`.
- Tem três extensões próprias: `/v1/cob/chavepix`, `/v2/cobv-emv/{txid}` e `/v1/cobe`.
- **Devolve `location` e `pixCopiaECola`** em cob e cobv.
- O `cobv-emv` devolve também `emv` e `base64` (imagem do QR Code, JPEG) e aceita `nomePersonalizacaoQr` ("Até 15 caracteres. Padrão: "Bradesco"").
- Não encontrei `PUT /webhook` com sufixo `/pix`, nem os endpoints `/lotecobv`.

### 4.3 PUT /v2/cob/{txid} (copiado)

Entrada:
```json
{"calendario":{"expiracao":"3600"},"valor":{"original":"5.00","modalidadeAlteracao":0},"chave":"97f97304-c70e-448f-ae4d-eefc737850d4","solicitacaoPagador":"Teste do Revisar"}
```

| Parâmetro | Tipo | Presença | Descrição / Observação |
|---|---|---|---|
| txid | String [a-zA-Z0-9]{26,35} | Obrigatório (path) | Único por CPF/CNPJ do recebedor… Criado pelo recebedor. Máx. 35 caracteres |
| calendario.expiracao | Integer <int32> | Opcional | Tempo de expiração do QR Code em segundos. Default: 86400 segundos (24h) |
| loc.id | Integer <int64> | Obrigatório (se loc) | Id da location |
| devedor.cpf / devedor.cnpj | String ^\d{11}$ / ^\d{14}$ | Opcional | mutuamente exclusivos |
| devedor.nome | String | Opcional | Obrigatório CPF ou CNPJ quando informado. Máx. 200 |
| valor.original | String \d{1,10}\.\d{2} | Obrigatório | Valor > 0. Separador decimal ponto |
| valor.modalidadeAlteracao | Integer | Opcional | 0 = não permite (default), 1 = permite |
| valor.retirada.saque / troco {valor, modalidadeAlteracao, modalidadeAgente (AGTEC, AGTOT, AGPSS / AGTEC), prestadorDoServicoDeSaque (ISPB \d{8})} | Objeto | Opcional | Pix Saque/Troco – apenas um |
| chave | String | Obrigatório | Chave Pix do recebedor (telefone, e-mail, CPF/CNPJ ou EVP) |
| solicitacaoPagador | String | Opcional | Máx. 140 caracteres |
| infoAdicionais[].nome / .valor | String | Obrigatório (se lista) | Máx. 50 / 200 |

Saída:
```json
{"txid":"TESTESANDBOXPORTAL00000000000000002","location":"qrpix-h.bradesco.com.br/qr/v2/8687c5f6-3dcc-426d-b4d1-603289eb651c","revisao":0,"calendario":{"criacao":"2024-12-11T20:46:01.987Z","expiracao":3600},"status":"ATIVA","valor":{"original":"5.00","modalidadeAlteracao":0},"chave":"97f97304-c70e-448f-ae4d-eefc737850d4","solicitacaoPagador":"Teste do Revisar","loc":{"id":90592607,"location":"qrpix-h.bradesco.com.br/qr/v2/8687c5f6-3dcc-426d-b4d1-603289eb651c","tipoCob":"cob","criacao":"2024-12-11T20:46:01.983Z"},"pixCopiaECola":"00020101021226880014BR.GOV.BCB.PIX2566qrpix-h.bradesco.com.br/qr/v2/8687c5f6-3dcc-426d-b4d1-603289eb651c52040000530398654045.005802BR5914NAOMEXERNABASE6008SAOPAULO62070503***630416BE"}
```
Status: ATIVA, CONCLUIDA, REMOVIDA_PELO_USUARIO_RECEBEDOR, REMOVIDA_PELO_PSP. "pixCopiaECola… Máx. 512 caracteres". "loc.location… limitada a 77 caracteres".

Códigos (copiados):

| HTTP | Código Bradesco | Descrição |
|---|---|---|
| 201 | — | Cobrança imediata criada |
| 400 | — | Requisição com formato inválido |
| 400 | AP002 | O campo {0} apresenta o valor zero |
| 400 | AP004 | O campo {0} é igual ou menor que zero |
| 400 | AP006 | O objeto {0} não respeita o schema |
| 400 | AP012 | O location referenciado por {0} apresenta tipo "cobv" (deveria ser "cob") |
| 400 | AP014 | O location referenciado por {0} inexiste |
| 400 | AP015 | O location referenciado por {0} já está sendo utilizado por outra cobrança |
| 400 | AP017 | O campo {0} corresponde a uma conta que não pertence a este usuário recebedor |
| 400 | AP018 | A cobrança já existe, não está ATIVA, e a requisição busca alterá-la |
| 400 | AP022 | Ambos os parâmetros cpf e cnpj estão preenchidos |
| 403 | — | Requisição de participante autenticado que viola alguma regra de autorização |
| 404 | — | Recurso solicitado não foi encontrado |
| **412** | **4001** | **Identificador da transação já está em uso** |
| 412 | 4002 | Chave do DICT inválida |
| 412 | 4004 / 4005 | Não foi encontrado dados ao consultar a chave DICT no CWS |
| 412 | 4006 | Data de expiração inferior à data de processamento |
| 412 | 4010 | A chave informada não faz parte do CPF/CNPJ |
| 412 | 4011 | O parceiro informado não está autorizado a cadastrar ou editar cobrança para a chave Pix |
| 500 | 4005, 5001, 5010, 5030 | Erro inesperado, entre em contato com o suporte Bradesco |
| 500 | 5002 | Ocorreu um erro na comunicação com o CWS |
| 500 | 5008 | Não foi possível cadastrar a cobrança devido a problemas internos |
| 500 | 5020 | Erro de comunicação com o Bacen |
| 503 | — | Serviço não está disponível |

### 4.4 PUT /v2/cobv/{txid} (copiado)

Entrada:
```json
{"calendario":{"dataDeVencimento":"2024-12-30","validadeAposVencimento":30},"devedor":{"logradouro":"Alameda Souza, Numero 80, Bairro Braz","cidade":"Recife","uf":"PE","cep":"54310750","cnpj":"68542653101838","nome":"João Souza"},"valor":{"original":"5555.00"},"chave":"b3bdd4e4-7cdc-41c1-bd70-7842d987d79f","solicitacaoPagador":"Informar matrícula"}
```

| Parâmetro | Tipo | Presença | Observação |
|---|---|---|---|
| txid | String [a-zA-Z0-9]{26,35} | Obrigatório (path) | Máx. 35 |
| chave | String | Obrigatório | Limitada a 77 caracteres |
| calendario.dataDeVencimento | String <date> | Obrigatório | YYYY-MM-DD |
| calendario.validadeAposVencimento | Integer | Opcional | Dias corridos após o vencimento |
| loc.id | Integer <int64> | Obrigatório (se loc) | — |
| devedor (email, logradouro, cidade, uf, cep, cpf*/cnpj*, nome) | Objeto | Obrigatório | nome obrigatório; cpf ou cnpj obrigatório; demais opcionais (máx. 200/200/2/8) |
| valor.original | String \d{1,10}\.\d{2} | Obrigatório | > 0 |
| valor.multa {modalidade 1 = Valor fixo, 2 = Percentual; valorPerc} | Objeto | Opcional | — |
| valor.juros {modalidade 1 a 8; valorPerc} | Objeto | Opcional | "Valores de 1 a 8 conforme tabela" |
| valor.abatimento {modalidade 1 / 2; valorPerc} | Objeto | Opcional | — |
| valor.desconto {modalidade 1 a 6; descontoDataFixa[] (até 3) {data, valorPerc}} | Objeto | Opcional | data menor que o vencimento |
| solicitacaoPagador | String | Opcional | Máx. 140 |
| infoAdicionais[] {nome, valor} | Array | Opcional | 50 / 200 |

Saída (inclui `recebedor` com nome, CNPJ, endereço e nomeFantasia):
```json
{"txid":"TESTEAPIGESTAOBRADESCO00000020","revisao":0,"calendario":{"criacao":"2024-10-18T11:13:52.543Z","dataDeVencimento":"2024-12-30","validadeAposVencimento":"30"},"status":"ATIVA","devedor":{"cnpj":"68542653101838","nome":"João Souza","logradouro":"Alameda Souza, Numero 80, Bairro Braz","cidade":"Recife","uf":"PE","cep":"54310750"},"recebedor":{"cnpj":"68542653101838","nome":"EMPRESA PGIT NET EMPRESA","logradouro":"R JOSE LODO NETO","cidade":"OSASCO","uf":"SP","cep":"06154000","nomeFantasia":"MULTIPAG"},"valor":{"original":"5555.00"},"chave":"b3bdd4e4-7cdc-41c1-bd70-7842d987d79f","solicitacaoPagador":"Informar matrícula","loc":{"id":30422387,"location":"qrpix-h.bradesco.com.br/qr/v2/cobv/51fc6b95-58e4-426e-8974-44145ac7c98c","tipoCob":"cobv","criacao":"2024-10-18T11:13:52.543Z"},"pixCopiaECola":"00020101021226930014BR.GOV.BCB.PIX2571qrpix-h.bradesco.com.br/qr/v2/cobv/975675b4-d7be-4a45-9031-6f2da542fa2d5204000053039865406123.455802BR5924EMPRESA PGIT NET EMPRESA6006OSASCO62070503***6304E4D7"}
```
Códigos da cobv: 201 Cobrança com vencimento criada; 400; 403; 404; 503. A página da cobv **não lista** os códigos AP/4xxx; eles aparecem só na seção de cob.
`PUT /v2/cobv-emv/{txid}` devolve `{"cobv":{…mesma estrutura…},"emv":"000201…","base64":"/9j/4AAQSkZJRg…"}`.
`PATCH /v2/cobv/{txid}` (revisão): exemplo `{"valor":{"original":"15000.00"}}`, que devolve `revisao: 1`. "Após a liquidação do pagamento, a cobrança não pode mais ser alterada". O status aceito na revisão é "apenas REMOVIDA_PELO_USUARIO_RECEBEDOR".

### 4.5 Pix recebidos

`GET /v2/pix/{e2eid}`. Exemplo de retorno: `{"chave":"…","endToEndId":"E60746948202411081228L3861IdXHL8","txid":"…","valor":"1.23","horario":"2023-07-17T17:40:14.663Z","infoPagador":"…","pagador":{"nome":"…","cpf":"…"},"devolucoes":[{"id":"0000055","rtrId":"","valor":"1.23","natureza":"RETIRADA","horario":{"solicitacao":"…"},"status":"NAO_REALIZADO","motivo":"BSPI0222 - …"}]}`.
`GET /v2/pix?inicio=&fim=`, com filtros `txid`, `txIdPresente`, `devolucaoPresente`, `cpf`/`cnpj`, `paginacao.paginaAtual` (padrão 0) e `paginacao.itensPorPagina` (padrão 100). O retorno traz `parametros{inicio, fim, paginacao{paginaAtual, itensPorPagina, quantidadeDePaginas, quantidadeTotalDeItens}}` e `pix[]`.
Códigos: 200; 400 4000 / AP006 / AP007 / AP008 / AP021 (fim anterior a início) / AP022; 403; 404 "Pix não encontrada para o e2eid informado."; 500 5001 / 5002 / 5010 / 5020 / 5030; 503.

### 4.6 Webhook Pix

Cadastro: `PUT /v2/webhook/{chave_pix}`, body `{"webhookUrl": "https://pix.parceiro.com/bradesco/webhook/"}` ("Deve ser uma URL válida e acessível via HTTPS"). Consulta: `GET`, que devolve `{"webhookUrl":"…","chave":"…","criacao":"2021-11-10T10:15:00.358Z"}`. Exclusão: `DELETE`, que devolve 204.
Códigos do cadastro: 200; 400 "A chave informada não corresponde a uma chave DICT válida", "A chave informada não pertence ao usuário recebedor", "O campo webhookUrl não respeita o schema esperado", 4000; 403; 404; 500 5001 / 5002 / 5010 / 5020 / 5030; 503.

**Como o Bradesco chama o seu endereço:**
- **Certificado do seu lado: sim.** "deverá ser emitido por AC amplamente conhecida… ter no conteúdo CN (Certificate Name) a URL do ambiente ao qual ele será hospedado e ter validade de no mínimo um 4 meses e no máximo 3 anos. O certificado deverá ser do tipo SSL, modelo EV ou OV. O modelo DV não é aceito". "1 passo – O cliente precisa enviar o certificado público do tipo SSL em anexo para o e-mail "governancaapis@bradesco.com.br"… 2 passo – O cliente precisa configurar o certificado e cadeia certificadora do Bradesco como confiavel em sua aplicação". O certificado de cliente do Bradesco é o de **qrpix.webhook.bradesco.com.br** em produção e **bspi.webhook.prebanco.com.br** em homologação, ambos na página Certificados. O pré-requisito fala em "certificado digital configurado para autenticação mTLS (Mutual TLS)".
- **Sandbox:** "O teste de cadastro do webhook utiliza uma massa de teste fixa… Este teste não gera estímulo de notificação, sendo apenas um teste de contrato da API."
- **Método e TLS:** "a aplicação deve disponibilizar um endpoint configurado para o método POST". "TLS versão 1.2 ou superior".
- **Lista de IPs:** **não informada.**
- **Acrescenta /pix na URL?** **A documentação não diz.** O exemplo de URL termina em "/webhook/". [Obs.] O padrão do Banco Central acrescenta "/pix". Teste aceitando os dois caminhos.
- **Novas tentativas (retry):** **não documentadas.**

Formato do aviso (copiado):
```json
{"pix":[{"endToEndId":"EXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX","txid":"XXXXXXXXXXad486bb4052867b70d2fc0","valor":"20.00","componentesValor":{"original":{"valor":"20.00"}},"horario":"2023-09-13T11:27:37.293Z","pagador":{"cpf":"051XXXXXX60","nome":"João José"}}]}
```
Campos: pix[] (obrigatório); endToEndId; txid; valor; horario; infoPagador; devolucoes[] {id, rtrId, valor, horario{solicitacao, liquidacao}, status EM_PROCESSAMENTO / DEVOLVIDO / NAO_REALIZADO, motivo}; nome, cpf e cnpj do pagador.

### 4.7 Erros gerais, limites e datas (Pix)

"O campo type… segue o padrão: https://pix.bcb.gov.br/api/v2/error/".

| Código | Mensagem | Significado |
|---|---|---|
| 400 | RequisicaoInvalida | Requisição inválida |
| 403 | AcessoNegado | Violação de regra de autorização |
| 404 | NaoEncontrado | Entidade não encontrada |
| 410 | PermanentementeRemovido | Entidade existia, mas foi removida permanentemente |
| **429** | Excesso de requisições | "Quantidade de requisições por segundo ultrapassa o limite estipulado para o serviço acionado" |
| 500 | ErroInternoDoServidor | Erro inesperado no servidor |
| 503 | ServicoIndisponivel | Serviço indisponível no momento |
| 504 | IndisponibilidadePorTempoEsgotado | Tempo de resposta excedido |

Limites: existe o 429, mas **o valor do limite não é publicado**. Idempotência: não há header próprio. O `PUT` com txid escolhido pelo cliente faz esse papel, e um txid repetido volta como **412/4001 "Identificador da transação já está em uso"**. FAQ: devolução "total ou parcial dentro dos 90 dias".

---

## PARTE 5 – Coleções Postman / OpenAPI

- **Collection Postman – Cobrança** ("Cobrança - Cliente", schema v2.1.0), em Cobrança > Documentação > Manual do produto > "Collection - API Cobrança". É um JSON exibido na página com botão "Copy", não é um arquivo para baixar. Tem 44 requisições, divididas em SANDBOX e PRODUÇÃO (token, registro, alteração, baixa, consulta, lista de liquidados, pendentes, baixados, protesto/negativação, split e webhook).
  ⚠️ **A collection contém um client_id e um client_secret de exemplo preenchidos na requisição de Token do SANDBOX.** Não copiei esses valores.
- **Collection – Cobrança com QR Code** em Cobrança com QR Code > Documentação > "Collection - API Cobrança com QR code" (mesmo formato).
- **Collection – Pix** em Pix - geração de QR Code > Documentação > "Collection – API Pix – geração de QR Code" (o `scope` vai vazio).
- **OpenAPI 3.0:** cada recurso do produto (aba "Recursos") é um spec **OAS3**, aberto em visualizador Swagger dentro do portal. Exemplo: "Cobrança - Alteração de boleto - Sandbox 1.0.1", servidor `https://openapisandbox.prebanco.com.br:443/boleto/cobranca-altera/v1`, método `PUT /alterar`, com os schemas RequestDTO, ResponseDTO, TituloVO etc. A Cobrança tem 10 recursos OAS3 (Sandbox e Produção). **Não achei botão de download do spec.**
- **PDFs para baixar** (você pode baixar):
  - Manual API COBRANÇA v1.6.4
  - Manual API COBRANÇA COM QR CODE v1.0.5
  - Manual Api Pix v1.1.1
  - Manual Desenvolvedor "mTLS" (links "👉" em cada página)
  - PDF "Como Gerar sua Credencial" (API_COBRANÇA, API_BILLING_with_QR_code, API_Pix QR Code Generation)
  - Certificados públicos do Bradesco (página Primeiros passos/Certificados, links "CLIQUE AQUI")

---

## PARTE 6 – Inconsistências da documentação que vale testar no sandbox

1. Token da Cobrança: a tabela de headers diz `application/json`, mas o body e o cURL usam `x-www-form-urlencoded`.
2. Tokens diferentes: Cobrança e Híbrido usam `/auth/server-mtls/v2/token` no openapi; Pix usa `/auth/server/oauth/token` no qrpix (produção).
3. Registro convencional: o JSON usa `listaMsgs[].mensagem`, mas a tabela mostra `mensagem`. A tabela escreve `FilialCPFCNPJ` e `cdEspecieTítulo`; o JSON escreve `filialCPFCNPJ` e `cdEspecieTitulo`.
4. Formato de percentual: a tabela diz até 2 casas (truncadas); o texto diz "2 dígitos inteiros e 3 casas decimais"; o FAQ diz "10% informe 10000".
5. `qtdeDiasJuros` / `qtdeDiasMulta`: o manual avisa do deslocamento de 1 dia (enviar 3 para começar em D+2).
6. O webhook de Cobrança usa `/cadastrar` no sandbox e `/executar` em produção.
7. Alteração do híbrido: a URL de sandbox é diferente da de produção, e o header `txId` é obrigatório sem nome exato documentado.
8. Split em produção: a página escreve `…manutencao-rateio-creditor`, mas a collection usa `…-credito`.
9. Revisão de cobv: a página escreve "PATH" em vez de PATCH.

---

## PARTE 7 – Páginas abertas, falhas e erros

**Páginas abertas (título – URL):**
- Aplicações | Portal Bradesco Developers – https://developers.bradesco.com.br/applications
- Produtos | Portal Bradesco Developers – https://developers.bradesco.com.br/browseProducts
- Extrato para Grandes Volumes – https://developers.bradesco.com.br/productDetails/bc09b8b2c1e840bb90e7f408143d6c36/overview
- Ágora Investimentos – https://developers.bradesco.com.br/productDetails/8a2e961498a3d1d90198ad9ec29c292d
- Open Cash Hub – https://developers.bradesco.com.br/productDetails/8a2e898f98c43a330198f5fc8b035d50
- Hub de Pagamentos – https://developers.bradesco.com.br/productDetails/8a2e85dc9a368384019a4b36243556a8
- Assinaturas – https://developers.bradesco.com.br/subscriptions
- Credenciais – https://developers.bradesco.com.br/credentials
- Registro de Aplicações – https://developers.bradesco.com.br/registrations
- Console de Atividades – https://developers.bradesco.com.br/activity (a página não mostrou conteúdo)
- Primeiros passos – https://developers.bradesco.com.br/documents/8a2e82cd96a2f2fe0196cb3013f65539
- Cobrança – Documentação – …/productDetails/8a2e869e9549334601954cca1ee604c3/version/e4b734f4e7c340fba72c983ba26cee90/docs
- Cobrança – Manual API Cobrança – …/docs/viewer/a8b5d4638ad841d8ad2ddb641a70700c/0/8a2e85119621daed0196343220fe6e11
- Cobrança – Autenticação - Gerar Token - MTLs – …/docs/viewer/9409a13083454331ae8bc04ce286428c/0/8a2e85209542f4f501954356353d127f
- Cobrança – Collection - API Cobrança – …/docs/viewer/a8b5d4638ad841d8ad2ddb641a70700c/0/8a2e95d49562f18001956762bdd6013f
- Cobrança – Visão Geral do Webhook Cobrança – …/docs/viewer/a8b5d4638ad841d8ad2ddb641a70700c/0/8a2e837798c43b4a0198c8e9f6671d6e
- Cobrança – Notas de versão – …/docs/viewer/73c414446bfa43adad1bebd915a705b3/0/9439131f51854b7bbd62654312d04061
- Cobrança – Planos – …/version/e4b734f4e7c340fba72c983ba26cee90/plans (detalhe "Sandbox - Cobrança")
- Cobrança – Recursos – …/resources e o recurso "Cobrança - Alteração de boleto - Sandbox" (…/resources/0c116f0ddf4d4433acdc911bcebd5825)
- Cobrança com QR Code – Manual – …/productDetails/8a2e869e9549334601954cc57bc0043e/version/abfae684f6d644bbb9d26701a73c9ea1/docs/viewer/bf84792b7b564bbeb3a2c9568641eeb6/0/8a2e91349818c87d0198993623c1019f
- Cobrança com QR Code – Notas de versão – …/docs/viewer/f9ff487bea874d56b916e18111bac6cb/0/5ae4911e0f6c4069a1907b081107206e
- Pix - geração de QR Code – Manual – …/productDetails/8a2e88539549335b01954e36ab14699b/version/87757755b0f34076add6c7b9e72f9399/docs/viewer/cb231e789a8b4a8fa6ffc4aa850d7eb4/0/8a2e8342956d96a401958177d4de5917
- Pix – Autenticação - Gerar Token - PIX – …/docs/viewer/924ed78b1a89498f8e66dff36eb05462/0/8a2e89119542f6250195439e6dbf2301
- Pix – Visão Geral do Webhook Pix – …/docs/viewer/cb231e789a8b4a8fa6ffc4aa850d7eb4/0/8a2e837798c43b4a0198c8c8b7490d79
- Pix – Notas de versão – …/docs/viewer/b8457b5acff946ea98e1094cd39e260a/0/55653b53913e4c3dabfcc260ae83c550

Também li, em modo só leitura, o conteúdo bruto de alguns desses documentos pelos endpoints internos que o próprio portal usa (`/api/v1/...`). Foi assim que completei os exemplos JSON que a página corta e que contei as requisições das collections.

**O que não consegui abrir ou ler:**
- Os exemplos de requisição e resposta do **token**, que são imagens.
- A imagem "Exemplo de certificado" e o caminho do certificado nas páginas de webhook, também imagens.
- Os PDFs (não baixei).
- A categoria do Open Cash Hub e o conteúdo da Visão Geral do Hub de Pagamentos, que estava vazia.
- O Console de Atividades, que não carregou conteúdo.
- As seções do Pix que só passei por cima, sem copiar campo a campo: revisão de cob, consultas e listas de cob/cobv, cobrança estática, locations, devolução e o FAQ inteiro.
- O detalhe de Protesto/Negativação, Split e Pendentes da Cobrança (só registrei os endpoints).
- Os nomes completos dos recursos OAS3, que aparecem truncados na tabela.

**Erros que apareceram:**
- A API interna do portal devolveu **403** para Extrato Grandes Volumes, Ágora, Open Cash Hub e Hub de Pagamentos. As páginas desses produtos abriram normalmente.
- **404** ao buscar o conteúdo bruto das notas de versão (que são de outro tipo) e num endpoint `/content` que testei.
- Falhas pontuais da extensão do navegador ("failed in the extension") em get_page_text, browser_batch, find e javascript_tool. Todas foram resolvidas ao repetir.
- A ferramenta de leitura bloqueou algumas saídas que continham URLs com query string. Repeti tirando a query.

