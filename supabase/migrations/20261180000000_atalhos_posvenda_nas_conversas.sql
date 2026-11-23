-- ═══════════════════════════════════════════════════════════════════════════
-- As MENSAGENS PADRÃO do pós-venda na barra `/` das Conversas.
--
-- GERADO por `node docs/posvenda/gerar-sql-atalhos.mjs 20261180000000` a partir de
-- `apps/atendimento/src/lib/posvendaAtalhos.ts` — o mesmo arquivo dos slides
-- dos fluxos. Não edite à mão: mude o código e gere uma migração nova.
--
-- ⚠️ `fonte = 'posvenda'` marca a lista OFICIAL. Ela é sincronizada por
-- inteiro: texto mudado é atualizado, atalho que saiu do código é apagado.
-- Resposta que o TIME criou com o mesmo atalho (fonte nula) NUNCA é tocada —
-- fica a dela, e o aviso diz quais.
-- ⚠️ `criado_por` nulo: ninguém edita pela tela (a policy exige ser o autor);
-- o texto oficial muda no código. Apagar continua com a chefia.
-- ⚠️ As variáveis ficam como `{nome}`: a tela troca pelo primeiro nome do
-- cliente ao colar, e o resto vira `[pedido]`… para quem atende completar.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.carbo_wa_respostas add column if not exists fonte text;

comment on column public.carbo_wa_respostas.fonte is
  'Nula = resposta criada pelo time na tela. ''posvenda'' = mensagem padrao do pos-venda, gerada do codigo (posvendaAtalhos.ts) e sincronizada por migracao.';

do $bloco$
declare
  v jsonb := $atalhos$
{
  "comprovante_entrega": "Olá, {nome}! A transportadora nos enviou o comprovante de entrega do pedido {pedido} (segue em anexo), com data, hora e quem recebeu. Pode conferir se reconhece? Se não reconhecer, nos avise que seguimos com você.",
  "confirmar_endereco": "Olá, {nome}! O pedido {pedido} voltou para nós porque a entrega não foi concluída. Pode confirmar o endereço completo (rua, número, complemento, bairro, cidade e CEP) e o melhor horário para receber?",
  "entender_problema": "Olá, {nome}! Sentimos muito que o produto do pedido {pedido} não atendeu o que você esperava. Pode nos contar o que aconteceu? Por exemplo: vazou, chegou com o lacre aberto, a cor ou o cheiro estão diferentes, ou você não percebeu resultado depois do uso.",
  "etiqueta_reversa": "Olá, {nome}! Autorizamos a devolução do pedido {pedido}. Segue a etiqueta de postagem, e o frete é por nossa conta. É só embalar o produto e levar a uma agência ou ponto de coleta. Assim que ele chegar aqui, damos sequência.",
  "fotos_devolucao": "Olá, {nome}! Recebemos o seu pedido de devolução do pedido {pedido}. Para darmos andamento, pode nos enviar fotos da embalagem e do produto, mostrando se o lacre está intacto?",
  "fotos_embalagem": "Olá, {nome}! Sentimos muito pelo transtorno com o pedido {pedido}. Para resolvermos rápido, pode nos enviar fotos da embalagem?\n1) a caixa fechada, com a etiqueta visível;\n2) o lacre ou a fita da embalagem;\n3) a caixa aberta, do jeito que chegou.\nAssim que recebermos, damos o retorno.",
  "fotos_lote": "Olá, {nome}! Pode nos enviar também uma foto do rótulo do produto, onde aparecem o lote e a validade? Assim registramos a ocorrência com a fábrica.",
  "fotos_produto": "Olá, {nome}! Para entendermos o que aconteceu com o produto do pedido {pedido}, pode nos enviar fotos do produto mostrando o problema? Se for vazamento ou dano, uma foto de perto e outra mostrando o produto inteiro ajudam muito.",
  "fotos_produto_errado": "Olá, {nome}! Pedimos desculpas pela troca no pedido {pedido}. Pode nos enviar uma foto do produto que chegou e da etiqueta da caixa?",
  "itens_do_pedido": "Olá, {nome}! Conferimos o pedido {pedido}: ele é composto por [itens e quantidades]. Pode conferir com o que chegou? Se ainda faltar algo, nos avise que resolvemos.",
  "opcoes_arrependimento": "Olá, {nome}! O produto do pedido {pedido} chegou aqui e está tudo certo. Você prefere receber o valor de volta ou trocar por outro produto?",
  "opcoes_avaria": "Olá, {nome}! Sentimos muito pelo problema com o pedido {pedido}. Você prefere:\n1) receber outro produto, sem custo;\n2) o valor total de volta; ou\n3) ficar com o produto e receber um abatimento no valor?",
  "opcoes_entrega": "Olá, {nome}! Sentimos muito pelo que aconteceu com a entrega do pedido {pedido}. Você prefere que a gente envie o pedido de novo, sem custo, ou receber o valor total de volta?",
  "opcoes_errado": "Olá, {nome}! Confirmamos que o pedido {pedido} foi enviado com o produto errado, pedimos desculpas. Você prefere receber o produto certo ou o valor de volta? Nos dois casos, o frete de devolução do produto errado é por nossa conta.",
  "opcoes_faltante": "Olá, {nome}! Confirmamos que faltou [item] no pedido {pedido}. Você prefere:\n1) que a gente envie o que faltou, sem custo;\n2) receber de volta o valor do que faltou; ou\n3) desfazer a compra, com o valor total de volta?",
  "orientar_uso": "Olá, {nome}! Para ter o melhor resultado: [dosagem por litro de combustível], aplicado no momento do abastecimento, e o efeito aparece depois de [tempo de uso]. Se depois disso continuar sem resultado, nos avise que analisamos com você.",
  "pedido_cancelado": "Olá, {nome}! Cancelamos o pedido {pedido} como você pediu. O valor será devolvido em até [prazo], pela mesma forma de pagamento.",
  "previsao_entrega": "Olá, {nome}! Conferimos o pedido {pedido}: ele está a caminho, com previsão de entrega em {previsao}. Seguimos acompanhando e te avisamos se algo mudar.",
  "procurar_vizinhos": "Olá, {nome}! O rastreio do pedido {pedido} aparece como entregue em {entregue}. Pode verificar, por favor, com a portaria, vizinhos ou alguém da casa? Se não aparecer até amanhã, abrimos a reclamação com a transportadora e resolvemos para você.",
  "reclamacao_aberta": "Olá, {nome}! Abrimos uma reclamação com a transportadora sobre o pedido {pedido} (protocolo [protocolo]). O prazo de resposta é de até [prazo] dias úteis, e te avisamos assim que tivermos retorno.",
  "recusa_conferencia": "Olá, {nome}. O produto do pedido {pedido} chegou aqui [o que chegou diferente], diferente do que foi informado nas fotos. Por isso não conseguimos seguir com a devolução. Se quiser conversar sobre isso, estamos à disposição.",
  "recusa_fora_prazo": "Olá, {nome}. O direito de arrependimento (art. 49 do Código de Defesa do Consumidor) vale por 7 dias a partir do recebimento, e o pedido {pedido} foi entregue em {entregue}. Por isso não conseguimos aceitar a devolução por desistência. Se houver qualquer problema com o produto, nos conte que analisamos.",
  "recusa_produto_aberto": "Olá, {nome}. Como o produto do pedido {pedido} foi aberto e não apresenta defeito, não conseguimos aceitar a devolução por desistência: por ser consumível, depois de aberto ele não pode voltar à venda. Se notar qualquer problema no produto, nos avise que analisamos.",
  "recusa_produto_certo": "Olá, {nome}. Conferimos as fotos e o produto que chegou é o mesmo do pedido {pedido}: [produto do pedido]. Se notar qualquer outro problema, nos avise que analisamos.",
  "recusa_sem_defeito": "Olá, {nome}. Analisamos o que você nos enviou sobre o pedido {pedido} e não identificamos defeito no produto, porque [motivo]. Se quiser, podemos te orientar no uso para ter o melhor resultado.",
  "recusar_na_entrega": "Olá, {nome}! Como o pedido {pedido} já está a caminho, quando o entregador chegar é só recusar o recebimento. A encomenda volta para nós e, assim que ela chegar, devolvemos o valor.",
  "reembolso_dados": "Olá, {nome}! Para fazermos o reembolso do pedido {pedido}, pode nos informar a chave Pix (ou banco, agência e conta) e o nome do titular?",
  "reembolso_pago": "Olá, {nome}! O reembolso de {valor} referente ao pedido {pedido} foi feito. Segue o comprovante. Qualquer dúvida, estamos à disposição.",
  "reenvio_feito": "Olá, {nome}! Enviamos de novo o pedido {pedido}, sem custo para você. O código de rastreio é {rastreio}. Qualquer novidade, estamos por aqui.",
  "troca_enviada": "Olá, {nome}! O produto novo do pedido {pedido} já foi enviado, sem custo para você. O código de rastreio é {rastreio}.",
  "troca_produto_certo": "Olá, {nome}! O produto certo do pedido {pedido} já foi enviado (rastreio {rastreio}). Também te enviamos a etiqueta para devolver o produto errado: é só embalar e levar a uma agência ou ponto de coleta, o frete é por nossa conta.",
  "video_produto": "Olá, {nome}! Se puder, grave um vídeo curto (até 30 segundos) mostrando o problema no produto do pedido {pedido}. Com ele conseguimos resolver mais rápido."
}
$atalhos$::jsonb;
  v_total int;
  v_do_time text[];
  v_oficiais int;
  v_divergem int;
begin
  select count(*) into v_total from jsonb_object_keys(v);
  if v_total <> 32 then
    raise exception 'esperava 32 mensagens, vieram %', v_total;
  end if;

  -- O que o time já criou com o mesmo nome fica como está.
  select array_agg(r.atalho order by r.atalho) into v_do_time
    from public.carbo_wa_respostas r
   where r.atalho in (select jsonb_object_keys(v))
     and r.fonte is distinct from 'posvenda';
  if v_do_time is not null then
    raise warning 'atalhos do time mantidos (a mensagem padrao nao entrou): %', v_do_time;
  end if;

  delete from public.carbo_wa_respostas
   where fonte = 'posvenda'
     and atalho not in (select jsonb_object_keys(v));

  update public.carbo_wa_respostas r
     set corpo = v ->> r.atalho
   where r.fonte = 'posvenda'
     and v ? r.atalho
     and r.corpo is distinct from btrim(v ->> r.atalho);

  insert into public.carbo_wa_respostas (atalho, corpo, criado_por, fonte)
  select k, v ->> k, null, 'posvenda'
    from jsonb_object_keys(v) k
  on conflict (atalho) do nothing;

  -- Conferência: cada mensagem está na lista oficial OU foi mantida a do time,
  -- e as oficiais têm EXATAMENTE o texto do código.
  select count(*) into v_oficiais
    from public.carbo_wa_respostas where fonte = 'posvenda';
  if v_oficiais + coalesce(cardinality(v_do_time), 0) <> v_total then
    raise exception 'conferencia: % oficiais + % do time <> %',
      v_oficiais, coalesce(cardinality(v_do_time), 0), v_total;
  end if;

  select count(*) into v_divergem
    from public.carbo_wa_respostas r
   where r.fonte = 'posvenda' and r.corpo is distinct from btrim(v ->> r.atalho);
  if v_divergem > 0 then
    raise exception 'conferencia: % mensagens com texto diferente do codigo', v_divergem;
  end if;
end
$bloco$;
