# Landing da Máquina de Vendas → pipeline do Carbo Atendimento

O formulário da landing grava o lead direto em `/maquina-de-vendas`
(app Atendimento), na etapa **Primeiro contato**, com a etiqueta **Landing**,
e avisa o responsável padrão no sininho e no celular.

## O que a landing precisa fazer

Um `POST` a partir do navegador do visitante, com a chave **pública** do
Supabase (a mesma `anon key` que os apps usam; ela não dá acesso a nada além
desta função):

```js
const URL = "https://<projeto>.supabase.co/rest/v1/rpc/mv_lead_receber";
const ANON = "<anon key>";
const qs = new URLSearchParams(location.search);

async function enviarLead(form) {
  const r = await fetch(URL, {
    method: "POST",
    headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, "Content-Type": "application/json" },
    body: JSON.stringify({ p: {
      nome: form.nome.value,
      whatsapp: form.whatsapp.value,          // obrigatório, com DDD
      cidade: form.cidade?.value, uf: form.uf?.value,
      veiculo: form.veiculo?.value, veiculos: form.veiculos?.value,
      email: form.email?.value, mensagem: form.mensagem?.value,
      site: form.site?.value,                 // campo ESCONDIDO (armadilha de robô) — deixe vazio
      utm_source: qs.get("utm_source"), utm_medium: qs.get("utm_medium"),
      utm_campaign: qs.get("utm_campaign"), utm_content: qs.get("utm_content"),
      pagina: location.href, referrer: document.referrer,
    } }),
  });
  return r.json();   // { ok: true, id } | { ok: false, erro }
}
```

Campo escondido no HTML (robô preenche, gente não vê):

```html
<input name="site" tabindex="-1" autocomplete="off" style="position:absolute;left:-9999px">
```

Nomes aceitos (cada construtor de página chama de um jeito):
`nome|name`, `whatsapp|telefone|celular|phone|fone`, `cidade|city`,
`uf|estado`, `veiculo|modelo|carro`, `veiculos|qtd_veiculos|quantidade`,
`email`, `mensagem|message|observacao`, `pagina|url`.

## Respostas

| `erro`              | o que mostrar ao visitante                          |
|---------------------|-----------------------------------------------------|
| —  (`ok: true`)     | "Recebido! Um consultor vai te chamar no WhatsApp." |
| `nome`              | "Preencha seu nome."                                |
| `telefone`          | "Confira o WhatsApp com DDD."                       |
| `muitas_tentativas` | "Tente de novo em alguns minutos."                  |
| `desligado`         | (recebimento ainda não ligado — ver abaixo)         |

## Regras do lado do banco (`20261154`)

- Mesmo WhatsApp com lead **aberto** não cria outro: a mensagem entra nas
  anotações do existente e o responsável recebe "Lead voltou pela landing".
- Limite: 5 envios por IP a cada 10 min e `mv_config.teto_por_minuto` no total.
- Nasce **desligado** (`mv_config.aceitar_landing = false`). Ligar = BLOCO 2
  da migração, com o e-mail de quem recebe os leads.

## Testar sem a landing

```bash
curl -s "$URL" -H "apikey: $ANON" -H "Authorization: Bearer $ANON" \
  -H "Content-Type: application/json" \
  -d '{"p":{"nome":"Teste Landing","whatsapp":"84900000000","cidade":"Natal","uf":"RN","utm_source":"teste"}}'
```

Deve voltar `{"ok": true, "id": "..."}` e o card aparecer no quadro. Depois,
arquive o lead de teste pelo painel.
