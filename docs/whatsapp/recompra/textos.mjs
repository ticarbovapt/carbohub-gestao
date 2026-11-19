// ─────────────────────────────────────────────────────────────────────────────
// A régua de recompra de 7 dias — a FONTE ÚNICA dos 14 textos (19/11/2026).
//
// Copiados LETRA A LETRA do PDF "CarboZé · Recompra no WhatsApp" do dono do
// processo. A única troca é o nome das variáveis: o PDF escreve {{1}} e {{2}};
// aqui são {{primeiro_nome}} e {{link_checkout}}, porque o `whatsapp-meta` manda
// parâmetro NOMEADO (`parameter_name`) — é o formato de todos os templates da
// casa. O texto que o cliente lê é o mesmo.
//
// Daqui saem (node docs/whatsapp/recompra/gerar.mjs):
//   templates-meta-recompra.json   o corpo de cada template para a API da Meta
//   PROMPT-CLAUDE-NAVEGADOR.md     o pedido para cadastrar no WhatsApp Manager
//   espelho.sql                    o `texto` de conferência em carbo_msg_templates
//
// ⚠️ Mudou um texto aqui? Ele só vale depois de APROVADO DE NOVO na Meta — e o
// espelho do banco tem de acompanhar (é o que a tela de Conversas mostra).
// ─────────────────────────────────────────────────────────────────────────────

// Sem rodapé: o "Zé, do CarboZé 💚" saiu dos 14 (dono do processo, 19/11/2026).

export const FLUXOS = {
  sache:  { rotulo: "Kit 10 Sachês", publico: "moto e abastecimentos pequenos", dias: 30,
            oferta: "R$47,92 (de R$59,90)" },
  frasco: { rotulo: "Kit 5 Frascos", publico: "carro, caminhonete e diesel",   dias: 45,
            oferta: "R$119,60 (de R$149,50)" },
};

const N = "{{primeiro_nome}}";
const L = "{{link_checkout}}";

/** [fluxo, dia, titulo, corpo] — linhas em branco são parágrafos. */
export const TEXTOS = [
  ["sache", 1, "Antes de acabar", `Ei ${N}, seu último sachê de CarboZé já foi pro tanque? ⛽

É o Zé, do CarboZé 💚 Pelas minhas contas, o seu kit tá no fim: são 10 sachês, 10 abastecimentos da sua moto.

E no primeiro abastecimento sem a dose, a água volta a juntar no fundo do tanque.

Por você já ser cliente, sua reposição sai com *20% OFF, já aplicado* no link:

✅ Kit 10 Sachês por *R$47,92*. É como levar *2 sachês de graça*, com frete grátis.

👉 ${L}

⏳ Vale por 7 dias. Depois disso, volta pro preço cheio.`],

  ["sache", 2, "Não perder o que já fez", `Ô ${N}, tanque de moto é pequeno. Pouca água ali dentro já é muita coisa. 🏍️

E os primeiros abastecimentos sem CarboZé você nem sente… é justamente aí que mora o problema.

Lá dentro a água volta a juntar, a borra volta a se formar e vai, aos pouquinhos, pro filtro e pro bico injetor.

Tudo o que você tratou nos últimos 100 litros começa a se perder.

Você não precisa recomeçar do zero. Só não pode parar agora.

Sua reposição com 20% OFF já tá pronta:
👉 ${L}

Frete grátis, direto na sua casa.`],

  ["sache", 3, "Um clique", `E aí, ${N}, sua reposição já tá pronta. É só confirmar. 🙌

Separei o seu Kit Sachês com os 20% de cliente já aplicados no link.

Você abre, confirma o pagamento e pronto. Leva menos de 1 minuto.

👉 ${L}

✅ Kit 10 Sachês por *R$47,92*, com frete grátis, direto na sua casa.`],

  ["sache", 4, "Hábito", `Fala, ${N}, quer um jeito de nunca mais esquecer a dose antes da bomba? ⛽

Deixa uns sachês no baú da moto.

Parou no posto, abre o sachê, despeja no tanque e abastece. 10 segundos, e o combustível já entra tratado.

Quem faz isso nunca fica um abastecimento sequer sem CarboZé.

Sua reposição com 20% OFF já tá aqui: 👉 ${L}

✅ Kit 10 Sachês por *R$47,92*, com frete grátis.`],

  ["sache", 5, "Sentiu diferença?", `Ei ${N}, você sentiu diferença na sua moto com o CarboZé? 🤔

Se sentiu, você já sabe o que acontece quando continua.

Se ainda não reparou, faz sentido: o CarboZé age desde o primeiro abastecimento, mas a diferença fica mais clara com o uso contínuo. Parar agora é parar justamente quando começa a aparecer.

Pra repor com os seus 20%: 👉 ${L}

✅ Kit 10 Sachês por *R$47,92*, com frete grátis.`],

  ["sache", 6, "Prova + amanhã acaba", `Ô ${N}, sabe quem nunca deixa o tanque sem CarboZé? 🚛

Quem vive de rodar.

Empresas como Grupo Duarte, Riograndense e MB Limpeza Urbana tratam o combustível de todo veículo, todo abastecimento. Sem pausa.

Elas medem cada litro na planilha, e já viram o que você também viu: o resultado vem de não parar.

⏳ Seus 20% de cliente acabam *amanhã à meia-noite*.

👉 ${L}

✅ Kit 10 Sachês por *R$47,92*, com frete grátis.`],

  ["sache", 7, "Último dia", `Atenção, ${N}: hoje é o último dia dos seus 20% OFF. ⏰

À meia-noite o link volta pro preço cheio de R$59,90, e eu não te chamo mais sobre essa reposição.

Com o desconto, cada sachê sai *R$4,79*. Menos que um café na conveniência do posto.

Cada abastecimento sem CarboZé é mais água no fundo do tanque da sua moto.

👉 ${L}

Ou você trata agora, ou paga depois. ⛽`],

  ["frasco", 1, "Antes de acabar", `Ei ${N}, seu último frasco de CarboZé já foi pro tanque? ⛽

É o Zé, do CarboZé 💚 Pelas minhas contas, o seu kit tá no fim: são 5 frascos, 500 litros tratados, uns 10 tanques cheios.

E no primeiro abastecimento sem a dose, a água volta a juntar no fundo do tanque.

Por você já ser cliente, sua reposição sai com *20% OFF, já aplicado* no link:

✅ Kit 5 Frascos por *R$119,60*. É como levar *1 frasco de graça*, com frete grátis.

👉 ${L}

⏳ Vale por 7 dias. Depois disso, volta pro preço cheio.`],

  ["frasco", 2, "Não perder o que já fez", `Ô ${N}, os primeiros tanques sem CarboZé você nem sente… 🚗

E é exatamente aí que mora o problema.

Lá dentro a água volta a juntar no fundo. A borra volta a se formar. E vai, aos pouquinhos, pro filtro e pros bicos injetores.

Tudo o que você tratou nos últimos 500 litros começa a se perder, tanque após tanque.

E quando a borra chega nos bicos, a conta da oficina é bem maior que um kit de CarboZé.

Você não precisa recomeçar do zero. Só não pode parar agora.

Sua reposição com 20% OFF já tá pronta:
👉 ${L}

Frete grátis, direto na sua casa.`],

  ["frasco", 3, "Um clique", `E aí, ${N}, sua reposição já tá pronta. É só confirmar. 🙌

Separei o seu Kit Frascos com os 20% de cliente já aplicados no link.

Você abre, confirma o pagamento e pronto. Leva menos de 1 minuto.

👉 ${L}

✅ Kit 5 Frascos por *R$119,60*, com frete grátis, direto na sua casa.`],

  ["frasco", 4, "Hábito", `Fala, ${N}, quer um jeito de nunca mais esquecer a dose antes da bomba? ⛽

Deixa um frasco no porta-luvas.

Parou no posto, coloca no tanque, depois abastece. 10 segundos, e o combustível já entra tratado.

Quem faz isso nunca fica um tanque sequer sem CarboZé.

Sua reposição com 20% OFF já tá aqui: 👉 ${L}

✅ Kit 5 Frascos por *R$119,60*, com frete grátis.`],

  ["frasco", 5, "Sentiu diferença?", `Ei ${N}, você sentiu diferença no seu carro com o CarboZé? 🤔

Se sentiu, você já sabe o que acontece quando continua.

Se ainda não reparou, faz sentido: o CarboZé age desde o primeiro tanque, mas a diferença fica mais clara com o uso contínuo. Parar agora é parar justamente quando começa a aparecer.

Pra repor com os seus 20%: 👉 ${L}

✅ Kit 5 Frascos por *R$119,60*, com frete grátis.`],

  ["frasco", 6, "Prova + amanhã acaba", `Ô ${N}, sabe quem nunca deixa o tanque sem CarboZé? 🚛

Quem tem frota.

Gestor de frota não compra no achismo. Ele olha planilha de consumo, conta de manutenção, caminhão parado na oficina.

E empresas como Grupo Duarte, Riograndense e MB Limpeza Urbana tratam o combustível de todo veículo, todo abastecimento. Sem pausa.

⏳ Seus 20% de cliente acabam *amanhã à meia-noite*.

👉 ${L}

✅ Kit 5 Frascos por *R$119,60*, com frete grátis.`],

  ["frasco", 7, "Último dia", `Atenção, ${N}: hoje é o último dia dos seus 20% OFF. ⏰

À meia-noite o link volta pro preço cheio de R$149,50, e eu não te chamo mais sobre essa reposição.

Com o desconto, cada litro tratado sai *24 centavos*. Num abastecimento de R$100, o CarboZé custa menos de R$4.

Cada tanque sem CarboZé é mais água acumulando no fundo do seu tanque.

👉 ${L}

Ou você trata agora, ou paga depois. ⛽`],
];

/** O que o banco e a Meta chamam de cada um. */
export const nomeMeta = (fluxo, dia) => `carboze_recompra_${fluxo}_d${dia}`;
export const etapa    = (fluxo, dia) => `recompra_${fluxo}_d${dia}`;
