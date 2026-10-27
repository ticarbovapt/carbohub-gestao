import type { Secao } from "../tipos";

// ─────────────────────────────────────────────────────────────────────────────
// Documentação do Carbo Finanças — seção Vendas do menu: Faturamento (e os
// dois passo a passo que moram nele: criar o pedido/NF no Bling e emitir a
// NFS-e do CarboVAPT), Comissionamento e Pedidos de Venda.
//
// ⚠️ O `n` de cada item é o MESMO marcador do print (`chave`), medido pelo
// harness (docs-prints/shots_vendasfin.mjs). Mudou a tela: refaça o print.
// ⚠️ Tom neutro nos passo a passo: o checklist diz o que conferir, nunca que
// alguém costuma errar.
// ─────────────────────────────────────────────────────────────────────────────

export const SECOES_VENDAS: Secao[] = [
  // ── Faturamento ─────────────────────────────────────────────────────────────
  {
    id: "faturamento",
    titulo: "Faturamento",
    rota: "/faturamento",
    resumo:
      "A fila das vendas que precisam de nota fiscal. Daqui sai o pedido para o Bling (CarboZé e CarboPRO, nota de produto) ou a NFS-e pelo Portal Nacional (CarboVAPT, nota de serviço). As outras abas mostram o que foi criado direto no Bling, as notas do marketplace e as notas que ainda não estão ligadas a um pedido.",
    regras: {
      colaborador: [
        "Vê a fila inteira, cria o pedido no Bling, emite a NFS-e e vincula notas.",
        "Escolhe a natureza da bonificação (é uma configuração feita uma vez por conta Bling).",
      ],
      gestor: ["O mesmo que o colaborador: esta tela não muda para o gestor."],
    },
    blocos: [
      {
        titulo: "A fila do mês",
        print: { chave: "fat-lista", legenda: "Vendas do sistema do mês, cada uma com a situação da nota e a ação possível." },
        itens: [
          { n: 1, titulo: "Natureza da bonificação", texto: "Escolhe qual natureza de operação do Bling a nota de remessa de brinde usa. Veja “Criar o pedido e a NF no Bling”." },
          { n: 2, titulo: "Totais", texto: "Quantas vendas do sistema e quanto somam no mês; ao lado, o mesmo para os pedidos que vieram do Bling." },
          { n: 3, titulo: "Mês", texto: "As setas trocam o mês. A lista mostra os pedidos CRIADOS naquele mês. O mês fica no endereço da página: F5 e link mandado a alguém abrem no mesmo mês." },
          { n: 4, titulo: "Busca", texto: "Procura por cliente, CNPJ/CPF (só os números também servem), nº do pedido ou da NF, cidade, telefone, e-mail, pedido de compra e vendedor. Com busca, o mês deixa de valer e a procura é em todo o histórico (o mês aparece riscado)." },
          { n: 5, titulo: "Mostrar já faturados", texto: "Ligado (padrão): mostra tudo do mês. Desligado: só o que ainda falta nota — inclusive pedido com bonificação que já tem a nota de venda e ainda espera a de remessa." },
          { n: 6, titulo: "Abas", texto: "Vendas do sistema · Do Bling · NF Online · Vincular NFs · Vincular NFs (filial) · Todas as NFs. Cada uma está explicada abaixo." },
          { n: 7, titulo: "Criar no Bling", texto: "Aparece quando o pedido chegou à etapa “Gerar NF” no Rastreio (Carbo Ops). Abre a conferência antes de enviar. Veja “Criar o pedido e a NF no Bling”." },
          { n: 8, titulo: "Criar no Bling (2 notas)", texto: "O pedido tem item de bonificação: saem DOIS pedidos no Bling, o pago e a remessa de brinde, cada um com a sua natureza." },
          { n: 9, titulo: "Travado (cadeado)", texto: "O pedido ainda não chegou em “Gerar NF” no Rastreio. O texto diz em que etapa ele está (ex.: Em Separação). O botão libera sozinho quando a logística avança o card." },
          { n: 10, titulo: "Emitir NFS-e", texto: "Venda só de serviço (CarboVAPT). A nota é de serviço, pelo Portal Nacional, e não passa pelo Bling. Veja “Emitir a NFS-e do CarboVAPT”." },
          { n: 11, titulo: "NFS-e sem resposta", texto: "Houve uma tentativa e o portal não respondeu. O botão continua lá, mas ao abrir só deixa reenviar com o MESMO número. Veja “Quando o portal não responde”." },
          { n: 12, titulo: "Nota emitida", texto: "Verde = nota válida (NF ou NFS-e com o número). Vermelho = a nota existe mas não vale (cancelada, denegada), e o pedido volta a precisar de nota. Pedido com NF ganha o botão Baixar (o DANFE em PDF)." },
        ],
      },
      {
        titulo: "Conferir o pedido antes de faturar",
        texto: "Clique em qualquer linha para abrir o detalhe; clique de novo para fechar. É o que se confere contra a nota.",
        print: { chave: "fat-detalhe", legenda: "O detalhe de um pedido aberto na fila." },
        itens: [
          { n: 1, titulo: "Cliente", texto: "Nome, CNPJ/CPF, inscrição estadual e contato, como foram digitados na venda." },
          { n: 2, titulo: "Endereços", texto: "Entrega e faturamento. “Mesmo da entrega” quando a venda não informou um endereço de faturamento separado." },
          { n: 3, titulo: "Produtos", texto: "Cada item com quantidade × preço, o desconto da linha e o total. Bonificação aparece marcada." },
          { n: 4, titulo: "Resumo", texto: "Subtotal, desconto do pedido e total." },
          { n: 5, titulo: "Pagamento e frete", texto: "A forma/condição escolhida na venda (ex.: Boleto 28 dias) e o frete (CIF/FOB e valor)." },
          { n: 6, titulo: "Expedição", texto: "Volumes, peso bruto, transportadora e cotação do frete, preenchidos pela logística no Rastreio. São os números que vão no corpo da NF-e; “não informado” quer dizer que a logística ainda não preencheu." },
          { n: 7, titulo: "Vendedor e pedido de compra", texto: "O pedido de compra do cliente (quando houver) vai num campo próprio da nota." },
          { n: 8, titulo: "Observações", texto: "Observação da venda e do comprador." },
        ],
      },
      {
        titulo: "Do Bling e NF Online",
        print: { chave: "fat-bling", legenda: "A aba Do Bling, com os pedidos que já foram para o Bling." },
        itens: [
          { n: 1, titulo: "Do Bling", texto: "Pedidos criados direto no Bling e vendas do sistema que já foram enviadas ao Bling. É rastreabilidade: daqui não se cria nada." },
          { n: 2, titulo: "Com NF", texto: "A nota casou com o pedido pelo número V… da observação. Baixar abre o DANFE." },
          { n: 3, titulo: "NF cancelada", texto: "Em vermelho, com a situação. A nota não conta como faturamento." },
          { n: 4, titulo: "Sem NF", texto: "O pedido existe no Bling e a nota ainda não foi emitida lá." },
          { n: 5, titulo: "NF Online", texto: "Vendas de marketplace e loja própria (Mercado Livre, Amazon, Nuvemshop…). A nota delas é emitida pela plataforma ou em lote, não uma a uma por aqui." },
        ],
      },
      {
        titulo: "Vincular NFs (matriz)",
        texto: "Nota emitida no Bling que não casou sozinha com um pedido (sem o V… na observação, nota avulsa). O vínculo só acontece quando você clica.",
        print: { chave: "fat-vincular", legenda: "Sugestões de vínculo e a lista de notas sem pedido." },
        itens: [
          { n: 1, titulo: "Sugestões de vínculo", texto: "Clique para abrir. O sistema propõe pares pedido ↔ nota por cliente, valor e data." },
          { n: 2, titulo: "Confiança e motivos", texto: "Alta, média ou baixa, com os motivos ao lado (mesmo valor, mesmo cliente, datas próximas)." },
          { n: 3, titulo: "Confirmar vínculo", texto: "Liga a nota ao pedido. O pedido passa a aparecer como faturado." },
          { n: 4, titulo: "Ignorar", texto: "Esconde a sugestão nesta visita (ela pode voltar depois)." },
          { n: 5, titulo: "Buscar NF", texto: "Por número ou cliente." },
          { n: 6, titulo: "Baixar", texto: "Abre o DANFE da nota." },
          { n: 7, titulo: "Vincular", texto: "Abre a escolha do pedido, para o caso que as sugestões não cobriram." },
        ],
      },
      {
        titulo: "Escolher o pedido da nota",
        print: { chave: "fat-vincular-dialogo", legenda: "O diálogo de vínculo manual." },
        itens: [
          { n: 1, titulo: "A nota", texto: "Número, cliente, valor e data de emissão da nota que está sendo vinculada." },
          { n: 2, titulo: "Buscar pedido", texto: "Por número ou cliente. Só aparecem pedidos que ainda não têm NF." },
          { n: 3, titulo: "Sinais", texto: "“valor bate” (verde) ou “valor difere” (âmbar, com o valor da nota). Em vermelho, quando a nota foi emitida mais de 45 dias antes ou depois do pedido — confira se é mesmo a nota daquele pedido." },
          { n: 4, titulo: "Vincular", texto: "Liga esta nota ao pedido da linha." },
        ],
      },
      {
        titulo: "Vincular NFs (filial SP)",
        texto: "A filial é outra conta Bling, com numeração própria, por isso tem aba separada. A nota da filial casa sozinha pelo pedido criado no Bling ou pelo V… do rodapé; aqui fica o resto.",
        print: { chave: "fat-filial", legenda: "As notas da filial sem pedido." },
        itens: [
          { n: 1, titulo: "Vai casar sozinha", texto: "Notas que já trazem o número do pedido no rodapé: o casamento automático (a cada 5 min) as pega. Não precisa vincular à mão." },
          { n: 2, titulo: "Falta a natureza", texto: "Notas com o número do pedido, mas sem a natureza no espelho: sem ela não dá para saber se é a nota da venda ou a remessa de bonificação. Vincule à mão dizendo qual é, ou espere." },
          { n: 3, titulo: "Rodapé", texto: "O V… que a nota anuncia. Nota de bonificação aparece em violeta, com o ícone de presente." },
          { n: 4, titulo: "Vincular", texto: "Abre a escolha do pedido." },
        ],
      },
      {
        titulo: "Vincular uma nota da filial",
        print: { chave: "fat-filial-dialogo", legenda: "Vínculo manual de uma nota da filial." },
        itens: [
          { n: 1, titulo: "Rodapé da nota", texto: "O texto de informações complementares da nota, como veio do Bling. É onde se confere o pedido e o vendedor." },
          { n: 2, titulo: "Nota da venda", texto: "Escolha quando a nota é a da venda: conta no faturamento." },
          { n: 3, titulo: "Remessa de bonificação", texto: "Escolha quando a nota é a do brinde: não conta no faturamento. Um mesmo pedido pode ter as duas." },
          { n: 4, titulo: "Buscar pedido", texto: "Já vem com o V… do rodapé." },
          { n: 5, titulo: "O pedido", texto: "Clique no pedido para vincular. Fica desabilitado enquanto a escolha acima não foi feita (quando o sistema não sabe a natureza)." },
        ],
      },
      {
        titulo: "Todas as NFs",
        print: { chave: "fat-todas", legenda: "Todas as notas da matriz." },
        itens: [
          { n: 1, titulo: "Buscar", texto: "Por número da NF, cliente ou pedido." },
          { n: 2, titulo: "Situação", texto: "Como está no Bling. Nota cancelada fica riscada, com o valor riscado." },
          { n: 3, titulo: "Vinculada", texto: "O pedido a que a nota está ligada." },
          { n: 4, titulo: "Sem vínculo", texto: "Nota que nenhum pedido reivindicou. Vincule pela aba Vincular NFs." },
          { n: 5, titulo: "Baixar", texto: "Abre o DANFE (PDF) de qualquer nota." },
        ],
      },
    ],
  },

  // ── Criar o pedido e a NF no Bling ─────────────────────────────────────────
  {
    id: "criar-no-bling",
    titulo: "Criar o pedido e a NF no Bling",
    rota: "/faturamento",
    resumo:
      "Passo a passo de uma venda de produto (CarboZé, CarboPRO) até a nota fiscal: conferir os dados, criar o pedido no Bling pelo Finanças e emitir a NF-e lá no Bling. Nada é enviado antes do clique em “Confirmar e criar no Bling”.",
    blocos: [
      {
        titulo: "O caminho, do começo ao fim",
        itens: [
          { titulo: "1. Espere o pedido liberar", texto: "O botão “Criar no Bling” aparece quando a logística move o card para “Gerar NF” no Rastreio de venda (Carbo Ops). Antes disso a linha mostra o cadeado e a etapa." },
          { titulo: "2. Abra a conferência", texto: "Clique em “Criar no Bling”. O sistema monta o que vai para o Bling e mostra tudo no diálogo — leva alguns segundos." },
          { titulo: "3. Escolha a empresa", texto: "Matriz ou Filial SP. É o CNPJ que emite a nota." },
          { titulo: "4. Confira (e complete) o cliente", texto: "Cliente já cadastrado no Bling aparece em verde. Cliente novo vem num formulário para conferir: os campos com * são exigidos pelo Bling." },
          { titulo: "5. Confira itens, pagamento, observação e avisos", texto: "Veja os itens abaixo." },
          { titulo: "6. Confirme", texto: "“Confirmar e criar no Bling” cria o pedido de venda no Bling e abre o Bling numa nova guia, na lista de pedidos de venda." },
          { titulo: "7. Emita a NF-e no Bling", texto: "No Bling, o pedido recém-criado está no topo da lista. Abra, confira e gere/emita a nota fiscal por lá, mantendo o número V… na observação: é ele que liga a nota ao pedido." },
          { titulo: "8. A nota volta sozinha", texto: "A sincronização traz a nota e a liga ao pedido pelo V… da observação. O pedido passa para a aba “Do Bling” com o número da NF e o botão Baixar, e o card do Rastreio avança para “NF Finalizada”. Se a nota não casar, ela aparece em Vincular NFs." },
        ],
      },
      {
        titulo: "A conferência, campo a campo (cliente novo)",
        print: { chave: "blingcriar-novo", legenda: "Diálogo “Criar pedido no Bling” de um cliente que ainda não existe no Bling." },
        itens: [
          { n: 1, titulo: "Emitir por", texto: "Matriz (padrão) ou Filial SP. Trocar recarrega a conferência, porque cada conta Bling tem o seu catálogo de produtos e o seu cadastro de clientes." },
          { n: 2, titulo: "O pedido", texto: "Número da venda (V…) e cliente." },
          { n: 3, titulo: "Nome / Razão social *", texto: "Como deve sair na nota. Para empresa, a razão social do CNPJ." },
          { n: 4, titulo: "CNPJ / CPF", texto: "Vem da venda e não se edita aqui. O Bling identifica o cliente pelo documento: se estiver errado, corrija na venda antes de criar." },
          { n: 5, titulo: "Inscrição Estadual", texto: "O número da IE, ou ISENTO." },
          { n: 6, titulo: "Contribuinte (ICMS)", texto: "1 - Contribuinte ICMS (tem IE), 2 - Contribuinte isento (IE “ISENTO”) ou 9 - Não contribuinte (pessoa física, ou empresa sem IE). Precisa combinar com a inscrição estadual ao lado." },
          { n: 7, titulo: "E-mail", texto: "Para onde o Bling manda a nota. Se o e-mail já pertence a outro cliente no Bling, ele vai em branco e o aviso explica (veja o item 18)." },
          { n: 8, titulo: "Telefone", texto: "Com DDD." },
          { n: 9, titulo: "Endereço", texto: "Rua / logradouro, sem o número." },
          { n: 10, titulo: "Número *", texto: "O número do endereço. Sem número, escreva S/N." },
          { n: 11, titulo: "Bairro *", texto: "Obrigatório para o Bling aceitar o cadastro." },
          { n: 12, titulo: "Cidade *", texto: "O município do cliente." },
          { n: 13, titulo: "UF * e CEP", texto: "A sigla do estado (2 letras) e o CEP." },
          { n: 14, titulo: "O que falta", texto: "Enquanto algum campo obrigatório estiver vazio, a linha âmbar diz qual e o botão de confirmar fica desligado." },
          { n: 15, titulo: "Itens", texto: "“catálogo” (verde) = o produto casou com o cadastro do Bling pelo código. “descrição livre” (âmbar) = não casou e vai só com o nome: confira o código do produto antes de seguir." },
          { n: 16, titulo: "Pagamento", texto: "A forma escolhida na venda e a forma correspondente no Bling, com o número de parcelas. As parcelas vão com vencimento calculado a partir da data da venda. “sem forma no Bling” = o pedido vai sem parcelas definidas." },
          { n: 17, titulo: "Observação da NF", texto: "Número da venda (V…), vendedor e observações do comprador. Vai no pedido do Bling e é por ela que a nota volta ao pedido. O nº do pedido de compra do cliente, quando houver, vai em campo próprio." },
          { n: 18, titulo: "Avisos", texto: "Tudo o que merece atenção antes do clique: cliente que será cadastrado, documento que já está no Bling com outro nome (seguir renomeia aquele cadastro), e-mail de outro cliente, produto fora do catálogo, forma de pagamento não encontrada, total diferente do sistema." },
          { n: 19, titulo: "Confirmar e criar no Bling", texto: "Cria o cadastro do cliente (se novo) e o pedido no Bling, e abre o Bling numa nova guia. Se o navegador bloquear a guia, use o botão “Abrir Bling →” do aviso verde." },
        ],
      },
      {
        titulo: "Matriz ou filial",
        print: { chave: "blingcriar-filial", legenda: "Com Filial SP escolhida, o aviso em âmbar." },
        itens: [
          { n: 1, titulo: "Matriz", texto: "O padrão. A nota sai no CNPJ da matriz (Natal)." },
          { n: 2, titulo: "Filial SP", texto: "A nota sai no CNPJ da filial de São Paulo." },
          { n: 3, titulo: "Aviso", texto: "Lembra que a nota sairá no CNPJ da filial. Nota emitida na empresa errada só se corrige cancelando." },
        ],
      },
      {
        titulo: "Venda com bonificação: duas notas",
        texto:
          "Quando a venda tem item de bonificação (o gêmeo “- bonificação” do produto), o Bling recebe DOIS pedidos: o pago, com a natureza normal, e a remessa de brinde, com a natureza de bonificação, que não gera imposto sobre o que foi dado. São duas notas a emitir no Bling, e o pedido só sai da fila quando as duas estiverem ligadas.",
        print: { chave: "blingcriar-bonif", legenda: "Conferência de um pedido com bonificação, de cliente já cadastrado." },
        itens: [
          { n: 1, titulo: "Cliente já cadastrado", texto: "O cliente foi encontrado no Bling (pelo documento ou pelo nome). Não há formulário: vale o cadastro de lá." },
          { n: 2, titulo: "Itens", texto: "O item de bonificação vai na remessa separada, não no pedido pago." },
          { n: 3, titulo: "Pagamento", texto: "As parcelas somam só o pedido pago (a remessa é de graça)." },
          { n: 4, titulo: "Aviso das duas notas", texto: "Confirma que saem os dois pedidos." },
        ],
      },
      {
        titulo: "Natureza da bonificação (uma vez por conta)",
        texto: "Sem a natureza configurada, o pedido com bonificação não é enviado: o sistema recusa e diz o motivo. Configure uma vez para a matriz e uma vez para a filial.",
        print: { chave: "blingcriar-natureza", legenda: "O botão “Natureza da bonificação”, no topo do Faturamento." },
        itens: [
          { n: 1, titulo: "Conta", texto: "Matriz ou Filial SP: cada conta Bling tem a sua lista de naturezas." },
          { n: 2, titulo: "A natureza", texto: "Normalmente “Remessa em bonificação, doação ou brinde”. Clique para salvar; a escolhida fica com ✓." },
          { n: 3, titulo: "Situação", texto: "Mostra o ID configurado, ou “Ainda não configurada”. Se a lista não carregar, a conexão com o Bling pode ter caído: veja a seção da Integração Bling." },
        ],
      },
      {
        titulo: "Antes de confirmar, confira",
        itens: [
          { titulo: "Empresa", texto: "Matriz ou Filial SP — o CNPJ que vai emitir." },
          { titulo: "Documento", texto: "CNPJ/CPF certo e do mesmo cliente do nome. O Bling casa o cliente pelo documento." },
          { titulo: "Inscrição estadual e contribuinte", texto: "IE preenchida (ou ISENTO) e o indicador de contribuinte combinando com ela." },
          { titulo: "Endereço completo", texto: "Endereço, número (ou S/N), bairro, cidade, UF e CEP." },
          { titulo: "Itens", texto: "Todos como “catálogo”. Item em “descrição livre” é produto que não casou com o Bling." },
          { titulo: "Pagamento", texto: "A forma no Bling encontrada e o número de parcelas igual ao da venda." },
          { titulo: "Observação", texto: "Com o número V… da venda. No Bling, ao emitir a nota, mantenha esse número na observação." },
          { titulo: "Avisos", texto: "Lidos um a um. Em especial: documento já cadastrado com outro nome e total diferente do sistema sem bonificação no pedido." },
          { titulo: "Bonificação", texto: "Natureza configurada para a conta escolhida, e as duas notas emitidas no Bling." },
          { titulo: "Expedição", texto: "Volumes, peso e transportadora no detalhe do pedido (vão na nota). Se estiverem “não informado”, peça à logística antes de emitir." },
        ],
      },
    ],
  },

  // ── NFS-e do CarboVAPT ─────────────────────────────────────────────────────
  {
    id: "nfse-emitir",
    titulo: "Emitir a NFS-e do CarboVAPT",
    rota: "/faturamento",
    resumo:
      "A venda de descarbonização (CarboVAPT) tem nota de SERVIÇO, emitida no Portal Nacional da NFS-e (gov.br), e não NF-e pelo Bling. O Finanças emite direto: tudo o que o sistema já sabe vem preenchido; você confere, completa e emite. A nota sai de verdade no CNPJ da Carbo, na sequência do portal, e só se desfaz com cancelamento.",
    blocos: [
      {
        titulo: "O caminho",
        itens: [
          { titulo: "1. Encontre a venda", texto: "Na fila do Faturamento, a venda só de serviço mostra “Sem NFS-e” e o botão “Emitir NFS-e”. Não depende da etapa do Rastreio." },
          { titulo: "2. Abra e confira", texto: "O diálogo carrega o pedido e preenche os campos." },
          { titulo: "3. Complete o que falta", texto: "O indicador da operação sempre; o código IBGE quando a busca pelo CEP não achar. O rodapé do diálogo diz o que ainda falta." },
          { titulo: "4. Emita", texto: "“Emitir NFS-e” manda a nota. Autorizada, a linha passa a mostrar “NFS-e” com o número, e a nota volta ao pedido pelo rodapé (pedido e vendedor)." },
        ],
      },
      {
        titulo: "Os campos",
        print: { chave: "nfse-emitir-form", legenda: "Diálogo “Emitir NFS-e” de uma venda CarboVAPT, preenchido." },
        itens: [
          { n: 1, titulo: "Tomador: nome e CPF/CNPJ", texto: "Vêm do pedido e não se editam aqui. Trocar o tomador ou o valor é corrigir a venda, não a nota." },
          { n: 2, titulo: "CEP", texto: "Só números. A lupa ao lado busca o município pelo CEP e preenche o código IBGE." },
          { n: 3, titulo: "Código IBGE do município", texto: "7 dígitos, exigido pelo portal. Embaixo aparece a cidade encontrada. Se ficar vazio, a busca não achou: consulte o código do município no site do IBGE e digite." },
          { n: 4, titulo: "Logradouro", texto: "Rua, avenida, sem o número." },
          { n: 5, titulo: "Número e complemento", texto: "Número (ou S/N) e complemento, quando houver." },
          { n: 6, titulo: "Bairro", texto: "Obrigatório." },
          { n: 7, titulo: "Telefone e e-mail", texto: "Contato do tomador na nota." },
          { n: 8, titulo: "Indicador da operação *", texto: "Começa VAZIO e precisa ser escolhido a cada nota: diz onde o serviço foi feito. 050101 = no estabelecimento da Carbo/licenciado; 050102 = em local diferente do estabelecimento do fornecedor; 050103 = no endereço do cliente (destinatário); 050104 = em endereço diferente do fornecedor e do cliente. Depois de escolher, o texto completo aparece embaixo, igual ao do emissor do portal." },
          { n: 9, titulo: "Competência", texto: "Data do serviço. Começa com hoje e não pode ser futura." },
          { n: 10, titulo: "Descrição do serviço", texto: "Montada a partir da OS: “SERVIÇO DE DESCARBONIZAÇÃO. CARBOVAPT. VEICULOS: modelo, ano, placa; …”. Sem placa registrada na OS (o Carbox registra na execução), sai “N VEÍCULOS.” e o aviso embaixo explica. Pode ser editada." },
          { n: 11, titulo: "Informações complementares", texto: "Automático: “PEDIDO: V…. Vendedor: …” e o pedido de compra do cliente, quando houver. É por este rodapé que a nota volta ao pedido." },
          { n: 12, titulo: "Valores", texto: "O valor do serviço é o total do pedido. Local da prestação, código de tributação nacional e NBS são fixos; IBS e CBS são calculados pelo portal; ISSQN não retido." },
          { n: 13, titulo: "Emitir NFS-e", texto: "Envia ao portal. Fica desligado enquanto faltar algum dado (a lista aparece ao lado)." },
        ],
      },
      {
        titulo: "Quando o portal não responde",
        texto:
          "Às vezes o portal recebe a nota e não devolve resposta a tempo. Nesse caso não dá para saber se a nota saiu, e o Finanças não deixa emitir outra: só reenviar a MESMA (mesmo número de DPS). Se a primeira já tinha sido emitida, o portal recusa a segunda em vez de duplicar, e a tela diz isso.",
        print: { chave: "nfse-emitir-reenviar", legenda: "Uma tentativa sem resposta do portal." },
        itens: [
          { n: 1, titulo: "O aviso", texto: "Data e hora da tentativa e a mensagem do portal." },
          { n: 2, titulo: "Mesmo número", texto: "Série e número da DPS usados na tentativa. O reenvio sai com eles." },
          { n: 3, titulo: "Reenviar com o mesmo número", texto: "Reenvia exatamente o que foi enviado na primeira vez (os campos reabrem com o que já tinha sido preenchido)." },
        ],
      },
      {
        titulo: "Histórico de tentativas",
        print: { chave: "nfse-emitir-tentativas", legenda: "O fim do diálogo: as tentativas da venda." },
        itens: [
          { n: 1, titulo: "Tentativas", texto: "Cada envio, com a situação (Autorizada, Rejeitada, Não enviada, Sem resposta), a data, o número da DPS e o número da NFS-e quando autorizada. Recusada pelo portal: o motivo aparece em vermelho no topo do diálogo; corrija o campo e emita de novo." },
          { n: 2, titulo: "Emitir travado", texto: "Com uma tentativa sem resposta, uma em andamento ou uma nota já autorizada, o botão fica desligado." },
        ],
      },
      {
        titulo: "Antes de emitir, confira",
        itens: [
          { titulo: "Tomador", texto: "Nome e CPF/CNPJ certos no pedido." },
          { titulo: "Endereço", texto: "CEP, código IBGE (com a cidade certa embaixo), logradouro, número e bairro." },
          { titulo: "Indicador da operação", texto: "Escolhido conforme onde o serviço foi feito." },
          { titulo: "Competência", texto: "A data do serviço." },
          { titulo: "Descrição", texto: "Com os veículos (modelo, ano, placa) ou a quantidade." },
          { titulo: "Valor", texto: "O total do pedido. Se estiver diferente do combinado, corrija a venda antes." },
        ],
      },
    ],
  },

  // ── Comissionamento ─────────────────────────────────────────────────────────
  {
    id: "comissionamento",
    titulo: "Comissionamento",
    rota: "/comissionamento",
    papel: "gestor",
    resumo:
      "Calcula a comissão de cada vendedor no período e controla os pagamentos. Duas bases, cada uma com o seu percentual: produto entra quando a NF é emitida; descarbonização (CarboVAPT) entra no momento da venda.",
    regras: {
      colaborador: ["A tela não abre: aparece “Acesso restrito”."],
      gestor: ["Calcula, gera as comissões, define os percentuais e registra os pagamentos."],
    },
    blocos: [
      {
        titulo: "Calcular",
        print: { chave: "comissao-calcular", legenda: "A aba Calcular, com a base de cada vendedor no período." },
        itens: [
          { n: 1, titulo: "Calcular / Pagamentos", texto: "Calcular gera as comissões do período; Pagamentos acompanha o que foi gerado." },
          { n: 2, titulo: "De", texto: "Início do período (padrão: dia 1 do mês)." },
          { n: 3, titulo: "Até", texto: "Fim do período (padrão: último dia do mês). Período e vendedor ficam no endereço da página." },
          { n: 4, titulo: "Vendedor", texto: "Mostra um vendedor só." },
          { n: 5, titulo: "Base total", texto: "Soma das bases visíveis, com a parte de descarbonização ao lado." },
          { n: 6, titulo: "Regras de %", texto: "Os percentuais padrão e por vendedor. Veja abaixo." },
          { n: 7, titulo: "N NF(s)", texto: "As notas que formam a base de produto do vendedor, com DANFE e XML de cada uma." },
          { n: 8, titulo: "Vendas faturadas", texto: "Base de produto: vendas com NF emitida no período." },
          { n: 9, titulo: "Descarbonização", texto: "Base de serviço: vendas CarboVAPT do período, com a quantidade de serviços." },
          { n: 10, titulo: "% NF e % descarb.", texto: "Vêm das regras e podem ser ajustados na linha antes de gerar." },
          { n: 11, titulo: "Comissão", texto: "Base × percentual, com a conta aberta embaixo quando há as duas bases." },
          { n: 12, titulo: "Gerar comissão", texto: "Grava a comissão do vendedor naquele período, com a lista das notas (memória de cálculo). Ela vai para a aba Pagamentos." },
        ],
      },
      {
        titulo: "Regras de %",
        print: { chave: "comissao-regras", legenda: "Percentuais padrão e por vendedor." },
        itens: [
          { n: 1, titulo: "% padrão", texto: "Produto (NF) e descarbonização para quem não tem regra própria." },
          { n: 2, titulo: "Salvar", texto: "Cada linha salva separada. A regra do vendedor sobrepõe o padrão." },
        ],
      },
      {
        titulo: "As notas da base",
        print: { chave: "comissao-nfs", legenda: "As notas que formam a base de um vendedor." },
        itens: [
          { n: 1, titulo: "DANFE", texto: "Abre o PDF da nota." },
          { n: 2, titulo: "XML", texto: "Abre o XML da nota." },
        ],
      },
      {
        titulo: "Pagamentos",
        print: { chave: "comissao-pagamentos", legenda: "A aba Pagamentos." },
        itens: [
          { n: 1, titulo: "Totais", texto: "Comissões geradas, total devido e total pago. Com filtro ligado, os cartões somam só o que está filtrado e dizem isso no título." },
          { n: 2, titulo: "Vendedor", texto: "Filtra por vendedor." },
          { n: 3, titulo: "Status", texto: "Aberto, Parcial ou Pago." },
          { n: 4, titulo: "Ordenar por", texto: "Período, vendedor, maior devido ou maior saldo." },
          { n: 5, titulo: "Status da comissão", texto: "Aberto = nada pago; Parcial = parte paga; Pago = quitada." },
          { n: 6, titulo: "Memória", texto: "A composição da comissão e as notas que entraram, congeladas no dia em que foi gerada." },
          { n: 7, titulo: "Registrar pagamento", texto: "Lança um pagamento (pode ser parcial). Comissão quitada mostra “Quitado”." },
        ],
      },
      {
        titulo: "Registrar um pagamento",
        print: { chave: "comissao-pagar", legenda: "O diálogo de pagamento." },
        itens: [
          { n: 1, titulo: "Valor pago agora", texto: "Começa com o saldo. Não pode passar do saldo." },
          { n: 2, titulo: "Data do pagamento", texto: "Não pode ser futura." },
          { n: 3, titulo: "Forma", texto: "PIX, transferência, dinheiro, boleto, cartão, cheque, desconto em folha ou outra (escreva qual)." },
          { n: 4, titulo: "Observação", texto: "Opcional." },
          { n: 5, titulo: "Registrar pagamento", texto: "Grava o pagamento e atualiza o saldo e o status." },
        ],
      },
      {
        titulo: "Memória de cálculo",
        print: { chave: "comissao-memoria", legenda: "A memória de uma comissão gerada." },
        itens: [
          { n: 1, titulo: "Composição", texto: "Cada base com o seu percentual e o valor da comissão." },
          { n: 2, titulo: "Pedidos e notas", texto: "Os pedidos faturados que entraram, com o número da NF." },
          { n: 3, titulo: "Total", texto: "Quantidade de notas e a soma. A descarbonização não gera NF e aparece só na composição." },
        ],
      },
      {
        titulo: "Quem não é gestor",
        print: { chave: "comissao-colab", legenda: "O que o colaborador vê." },
        itens: [{ n: 1, titulo: "Acesso restrito", texto: "Só gestores geram e pagam comissões." }],
      },
    ],
  },

  // ── Pedidos de Venda ────────────────────────────────────────────────────────
  {
    id: "pedidos",
    titulo: "Pedidos de Venda",
    rota: "/pedidos",
    resumo: "A lista de todos os pedidos, com filtros, exportação e a aba de relatórios. O gestor também edita o pedido e cria um novo.",
    regras: {
      colaborador: ["Consulta, filtra, exporta e vê os relatórios."],
      gestor: ["Edita qualquer pedido (clique na linha ou no lápis) e tem o botão “Novo Pedido”."],
    },
    blocos: [
      {
        print: { chave: "pedidos-lista", legenda: "A lista de pedidos." },
        itens: [
          { n: 1, titulo: "Atualizar", texto: "Relê os pedidos." },
          { n: 2, titulo: "Exportar", texto: "Excel (.xlsx), CSV ou Imprimir/PDF, com o que está filtrado." },
          { n: 3, titulo: "Relatórios", texto: "Gráficos: faturamento por semana, por linha de produto, por status e por vendedor." },
          { n: 4, titulo: "Totais", texto: "Total de pedidos, pendentes, enviados, entregues e faturamento." },
          { n: 5, titulo: "Busca", texto: "Por número, cliente ou licenciado." },
          { n: 6, titulo: "Filtros", texto: "Status, tipo (spot ou recorrente), período, produto, vendedor e cliente." },
          { n: 7, titulo: "Colunas", texto: "Pedido, NF, produto, tipo, vendedor, cliente, data, quantidade, total e status." },
        ],
      },
      {
        papel: "gestor",
        titulo: "O gestor nesta tela",
        print: { chave: "pedidos-gestor", legenda: "A lista vista pelo gestor.", papel: "gestor" },
        itens: [
          { n: 1, titulo: "Novo Pedido", texto: "Abre a tela de venda (Vender).", papel: "gestor" },
          { n: 2, titulo: "Editar", texto: "O lápis (ou a linha) abre a edição do pedido.", papel: "gestor" },
        ],
      },
      {
        papel: "gestor",
        titulo: "Editar um pedido",
        print: { chave: "pedidos-editar", legenda: "O diálogo de edição.", papel: "gestor" },
        itens: [
          { n: 1, titulo: "Status", texto: "Pendente, confirmado, faturado, enviado, entregue ou cancelado.", papel: "gestor" },
          { n: 2, titulo: "Rastreio", texto: "Código e link de rastreio da entrega.", papel: "gestor" },
          { n: 3, titulo: "Tipo e recorrência", texto: "Spot ou recorrente; no recorrente, o intervalo em dias e a próxima entrega.", papel: "gestor" },
          { n: 4, titulo: "Salvar Alterações", texto: "Grava. Cliente, contato, licenciado e endereço também se editam aqui.", papel: "gestor" },
        ],
      },
      {
        titulo: "Relatórios",
        print: { chave: "pedidos-relatorios", legenda: "A aba Relatórios." },
      },
    ],
  },
];
