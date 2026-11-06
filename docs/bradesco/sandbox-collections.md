# Bradesco – collections Postman de SANDBOX (Cobrança e Cobrança com QR Code)

Extraído em 06/11/2026 de duas collections no portal:
- "Collection - API Cobrança", nome interno "Cobrança - Cliente", na aba Documentação do produto Cobrança.
- "Collection - API Cobrança com QR code", nome interno "Cobrança com QR Code Cliente atualizada", na aba Documentação do produto Cobrança com QR Code.

Ao todo são 80 requisições, 60 delas na pasta SANDBOX. Todo client_id, client_secret, token e header Authorization foi trocado por `<omitido>`: foram 84 substituições.

Em todas as chamadas de API, a collection manda o header `Authorization: {{access_token_sandbox}}`, que aqui aparece como `<omitido>`. O valor sai do script de teste do Token: `postman.setGlobalVariable("access_token_sandbox", jsonData.access_token);`. A collection não mostra se o prefixo "Bearer " vai junto.

## 1. Token (igual nas duas collections)

```
POST https://openapisandbox.prebanco.com.br/auth/server-mtls/v2/token
Body (x-www-form-urlencoded):
grant_type=client_credentials
client_id=<omitido>
client_secret=<omitido>
```
O mTLS vai com o certificado e a chave configurados no Postman (Settings > Certificates, host `openapisandbox.prebanco.com.br`).

## 2. Registrar boleto COMUM – "Boleto de Cobrança Convencional - Sucesso"

```
POST https://openapisandbox.prebanco.com.br/boleto/cobranca-registro/v1/cobranca
Authorization: <omitido>
```
```json
{
"nuCPFCNPJ": 31759489,
"filialCPFCNPJ": 1,
"ctrlCPFCNPJ": 55,
"idProduto": 9,
"nuNegociacao": 285600000000222652,
"nuCliente": "1",
"dtEmissaoTitulo": "27.05.2025",
"dtVencimentoTitulo": "27.08.2025",
"vlNominalTitulo": "500.00",
"cdEspecieTitulo": 2,
"cindcdAceitSacdo": "2",
"percentualJuros": 0,
"vlJuros": "5.00",
"qtdeDiasJuros": 1,
"percentualMulta": "20.00",
"vlMulta": 0,
"qtdeDiasMulta": 1,
"percentualDesconto1": 0,
"vlDesconto1": "50.00",
"dataLimiteDesconto1": "29.05.2025",
"nomePagador": "CLIENTE",
"logradouroPagador": "AVENIDA COPACABANA",
"nuLogradouroPagador": "237",
"cepPagador": 0,
"complementoCepPagador": 0,
"bairroPagador": "ALPHAVILLE",
"municipioPagador": "BARUERI",
"ufPagador": "SP",
"cdIndCpfcnpjPagador": 1,
"nuCpfcnpjPagador": 98765432111,
"nomeSacadorAvalista": "PARCEIRO",
"logradouroSacadorAvalista": "AV SAO PAULO",
"nuLogradouroSacadorAvalista": "4",
"complementoLogradouroSacadorAvalista": "",
"cepSacadorAvalista": 0,
"complementoCepSacadorAvalista": 0,
"bairroSacadorAvalista": "VILA 237",
"municipioSacadorAvalista": "OSASCO",
"ufSacadorAvalista": "SP",
"cdIndCpfcnpjSacadorAvalista": 1,
"nuCpfcnpjSacadorAvalista": 12345678999,
"enderecoSacadorAvalista": "RUA BRA",
"dddFoneSacadorAvalista": 0,
"foneSacadorAvalista": 0,
"listaMsgs": [
{ "mensagem": "$$.*$$" },
{ "mensagem": "$$.*$$" }
]
}
```
Cenário "Erro Código espécie": é o mesmo corpo, com `nuCPFCNPJ: 31759488`, `filialCPFCNPJ: 0`, `cdEspecieTitulo: 77` e mensagens "MSG 1"/"MSG 2".

## 3. Registrar boleto HÍBRIDO – "Gerar Boleto de Cobrança - Sucesso"

```
POST https://openapisandbox.prebanco.com.br/boleto-hibrido/cobranca-registro/v1/gerarBoleto
Authorization: <omitido>
```
```json
{
"ctitloCobrCdent": 0,
"registrarTitulo": 1,
"nroCpfCnpjBenef": 68542653,
"codUsuario": "APISERVIC",
"filCpfCnpjBenef": "1018",
"tipoAcesso": 2,
"digCpfCnpjBenef": 38,
"cpssoaJuridContr": "",
"ctpoContrNegoc": "",
"cidtfdProdCobr": 9,
"nseqContrNegoc": "",
"cnegocCobr": 111111111111111111,
"filler": "",
"eNseqContrNegoc": "",
"tipoRegistro": 1,
"codigoBanco": 237,
"cprodtServcOper": "",
"demisTitloCobr": "17.12.2024",
"ctitloCliCdent": "TESTEBIA",
"dvctoTitloCobr": "20.02.2025",
"cidtfdTpoVcto": "",
"vnmnalTitloCobr": 6000,
"cindcdEconmMoeda": 9,
"cespceTitloCobr": 2,
"qmoedaNegocTitlo": 0,
"ctpoProteTitlo": 0,
"cindcdAceitSacdo": "N",
"ctpoPrzProte": 0,
"ctpoPrzDecurs": 0,
"ctpoProteDecurs": 0,
"cctrlPartcTitlo": 0,
"cindcdPgtoParcial": "N",
"cformaEmisPplta": "02",
"qtdePgtoParcial": 0,
"qtdDecurPrz": "0",
"codNegativacao": "0",
"diasNegativacao": "0",
"ptxJuroVcto": 0,
"filler1": "",
"vdiaJuroMora": 0,
"pmultaAplicVcto": 0,
"qdiaInicJuro": 0,
"vmultaAtrsoPgto": 0,
"pdescBonifPgto01": 0,
"qdiaInicMulta": 0,
"vdescBonifPgto01": 0,
"pdescBonifPgto02": 0,
"dlimDescBonif1": "",
"vdescBonifPgto02": 0,
"pdescBonifPgto03": 0,
"dlimDescBonif2": "",
"vdescBonifPgto03": 0,
"ctpoPrzCobr": 0,
"dlimDescBonif3": "",
"pdescBonifPgto": 0,
"dlimBonifPgto": "",
"vdescBonifPgto": 0,
"vabtmtTitloCobr": 0,
"filler2": "",
"viofPgtoTitlo": 0,
"isacdoTitloCobr": "TESTE EMPRESA PGIT",
"enroLogdrSacdo": "TESTE",
"elogdrSacdoTitlo": "TESTE",
"ecomplLogdrSacdo": "TESTE",
"ccepSacdoTitlo": 6332,
"ebairoLogdrSacdo": "TESTE",
"ccomplCepSacdo": 130,
"imunSacdoTitlo": "TESTE",
"indCpfCnpjSacdo": 1,
"csglUfSacdo": "SP",
"renderEletrSacdo": "",
"cdddFoneSacdo": 0,
"nroCpfCnpjSacdo": 38453450803,
"bancoDeb": 0,
"cfoneSacdoTitlo": 0,
"agenciaDebDv": 0,
"agenciaDeb": 0,
"bancoCentProt": 0,
"contaDeb": 0,
"isacdrAvalsTitlo": "",
"agenciaDvCentPr": 0,
"enroLogdrSacdr": "0",
"elogdrSacdrAvals": "",
"ecomplLogdrSacdr": "",
"ccomplCepSacdr": 0,
"ebairoLogdrSacdr": "",
"csglUfSacdr": "",
"ccepSacdrTitlo": 0,
"imunSacdrAvals": "",
"indCpfCnpjSacdr": 0,
"renderEletrSacdr": "",
"nroCpfCnpjSacdr": 0,
"cdddFoneSacdr": 0,
"filler3": "0",
"cfoneSacdrTitlo": 0,
"iconcPgtoSpi": "",
"fase": "1",
"cindcdCobrMisto": "S",
"ialiasAdsaoCta": "",
"ilinkGeracQrcd": "",
"caliasAdsaoCta": "",
"wqrcdPdraoMercd": "",
"validadeAposVencimento": "",
"filler4": "",
"idLoc": ""
}
```
Os outros cenários do híbrido usam o mesmo leiaute e mudam alguns valores. **O cenário parece ser escolhido pelo valor de `cnegocCobr`**, que é diferente em cada um:

| Cenário | `cnegocCobr` | O que muda |
|---|---|---|
| Sucesso | 111111111111111111 | (o corpo acima) |
| Boleto já cadastrado | 111111111111111113 | `ctitloCobrCdent: 999999999` |
| Acesso a negociação não autorizada | 111111111111111114 | `nroCpfCnpjBenef: 68542659` e outros dados de sacado (CNPJ 41641937000123, BA) |
| Dados inconsistentes | 111111111111111115 | `codUsuario: "APISERV"` |
| Data de vencimento inferior a emissão do titulo | 111111111111111116 | emissão 13.12.2024 e vencimento 20.11.2024 |
| Preenchimento de campo excedido | 111111111111111118 | `ctitloCobrCdent: 375970011613` (12 dígitos) |

[Obs.] A collection usa `cindcdEconmMoeda: 9` e o campo `bancoDeb`/`agenciaDeb`/`contaDeb`, que o manual atual não traz. O manual pede `cindcdEconmMoeda` "Fixo = 00006" e o exemplo do manual usa "6".

## 4. Consultar

**Comum – "Consulta dados de Título Específico - Sucesso"**
```
POST https://openapisandbox.prebanco.com.br/boleto/cobranca-consulta/v1/consultar
```
```json
{ "cpfCnpj": { "cpfCnpj": 1234567, "filial": 1, "controle": 99 },
  "produto": 9, "negociacao": 28560222654, "nossoNumero": 53199900041, "sequencia": 0, "status": 0 }
```
Outros cenários:
- "Usuário não autorizado": `cpfCnpj 31759488/0/55`, `negociacao 2856022652`, `nossoNumero 50130000041`.
- "Identificador do produto inválido": `produto 0`, `negociacao 28560222652`.

**Híbrido – "Cobrança com QRCode - Consultar - Sucesso"**
```
POST https://openapisandbox.prebanco.com.br/boleto-hibrido/cobranca-consulta-titulo/v1/consultar
```
```json
{ "contaProduto": 38610041000, "controleCpfCnpjUsuario": 38, "cpfCnpjUsuario": 68542653, "filialCnpjUsuario": 1018,
  "idProduto": 9, "nomePersonalizado": "", "nossoNumero": 970039324, "seqTitulo": 0, "status": 0 }
```
Outros cenários:
- "Erro negociação": `contaProduto 38610041050`.
- "CPF/CNPJ inválido": `cpfCnpjUsuario 685426`, `nossoNumero 974439345`.
- "Titulo Inexistente": `cpfCnpjUsuario 685426`, `nossoNumero 38610041050`.

## 5. Baixar – "Solicitação Baixa de Título - Sucesso" (igual nas duas collections)

```
POST https://openapisandbox.prebanco.com.br/boleto/cobranca-baixa/v1/baixar
```
```json
{ "cpfCnpj": { "cpfCnpj": "1234567", "filial": "1", "controle": "99" },
  "produto": 9, "negociacao": 28560222654, "nossoNumero": "50150001462", "sequencia": 0, "codigoBaixa": 57 }
```
Outros cenários:
- "Código de baixa inválido": `nossoNumero 100`, `codigoBaixa 10`.
- "CPF/CNPJ inválido": `cpfCnpj "134567"`, `nossoNumero 100`.
- "Titulo inexistente": `nossoNumero 100`, `codigoBaixa 57`.

## 6. Lista de liquidados

**Comum – "Lista de Títulos Liquidados - Sucesso"**
```
POST https://openapisandbox.prebanco.com.br/boleto/cobranca-lista/v1/listar
```
```json
{ "cpfCnpj": { "cpfCnpj": 114383908, "filial": 0, "controle": 7 },
  "produto": 9, "negociacao": 28560230114,
  "dataMovimentoDe": "01012018", "dataMovimentoAte": "02012019",
  "dataPagamentoDe": 0, "dataPagamentoAte": 0, "origemPagamento": 0,
  "valorTituloDe": 0, "valorTituloAte": 0, "paginaAnterior": 0 }
```
Outros cenários:
- "Identificador do produto inválido": `cpfCnpj 1234567/0/99`, `produto 0`, `negociacao 28560222654`, `valorTituloDe 95` / `valorTituloAte 100`.
- "Usuário não autorizado": `produto 9`, `negociacao 2856022654`.

**Híbrido – "Cobrança com Qr Code - Listar boletos liquidados - Sucesso"**
```
POST https://openapisandbox.prebanco.com.br/boleto-hibrido/cobranca-lista/v1/listar
```
```json
{ "cpfCnpj": { "cpfCnpj": 114383908, "filial": 0, "controle": 7 },
  "produto": 9, "negociacao": 28560230114,
  "dataMovimentoDe": 0, "dataMovimentoAte": 0,
  "dataPagamentoDe": 14092017, "dataPagamentoAte": 15092025,
  "origemPagamento": 0, "valorTituloDe": 0, "valorTituloAte": 0, "paginaAnterior": 0 }
```
Cenário "Erro CPF/CNPJ vázio": `cpfCnpj ""`, `filial 1018`, `controle 38`, `negociacao 38610041000`. Essa requisição manda também um header `x-client-cert` com um certificado público de exemplo de 2020 ("ParceiroX"), que não reproduzi aqui.

## 7. O que o sandbox aceita

O portal **não tem texto** descrevendo os valores aceitos no sandbox (CNPJ, negociação ou carteira de teste). As collections e os manuais não trazem descrições, e não há nada parecido com "massa de teste" nos manuais de Cobrança. O único texto do tipo está no webhook Pix: "O teste de cadastro do webhook utiliza uma massa de teste fixa previamente configurada na collection… não gera estímulo de notificação, sendo apenas um teste de contrato da API".

Na prática, o sandbox funciona com respostas fixas por cenário, e os valores de cada requisição "Sucesso" acima são a massa de teste. O que se vê nos exemplos:
- Carteira 9 em tudo.
- Beneficiários de teste: 31759489/0001-55, 68542653/1018-38, 114383908/0000-07 e 1234567/0001-99.
- Negociações de teste: 285600000000222652 (18 dígitos), 28560222654, 28560230114, 38610041000 e a série 1111111111111111xx (híbrido).

Requisições de SANDBOX que existem nas collections e não estão detalhadas aqui: Alteração (4 cenários), Cadastro de Webhook (3, que usam `/v1/cadastrar` com CNPJ 1234567/1/99 e tipoCadastro I ou C), Lista de Títulos Baixados (2), Pendentes de liquidação (3), Split (consulta e manutenção), Protesto/Negativação, Alteração e Reserva de Location do híbrido.
