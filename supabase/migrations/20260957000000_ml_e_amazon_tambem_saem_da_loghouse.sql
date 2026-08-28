-- ═══════════════════════════════════════════════════════════════════════════
-- ML e Amazon também saem da LogHouse — respondido pelo dono do processo
--
-- ── Por que isto não saiu do banco ───────────────────────────────────────
--
-- A `20260956` deixou os dois desligados por AUSÊNCIA DE MEDIÇÃO, não por
-- suspeita de Full/FBA. O teste que eu tinha — "existe etiqueta comprada por
-- nós no Melhor Envio?" — deu 0 de 102 no ML e 0 de 12 na Amazon, e eu
-- registrei ali mesmo que aquilo NÃO provava Full: prova que esses canais não
-- passam pelo Melhor Envio (Mercado Envios, logística própria da Amazon).
--
-- O `raw_detalhe` do Bling reforçou, sem fechar: os pedidos do ML trazem
-- endereço completo do comprador, complemento, ponto de referência e
-- `pesoBruto` de 0,53 kg — dados que só existem porque alguém embala. Mas
-- `MEL…FMXDF01` é código do Mercado Envios, que serve a Full e a envio do
-- vendedor igualmente. O campo que separaria os dois (`logistic_type`) não
-- está no Bling nem no nosso `ecommerce-sync`.
--
-- Confirmado por quem opera, em 28/08/2026: **não é Full nem FBA**. Nós
-- embalamos e despachamos os dois. Logo a mercadoria sai do HUB-SP, e a
-- premissa que o canal precisava está satisfeita — por resposta humana, que é
-- uma fonte legítima quando o dado não existe no sistema, desde que fique
-- escrito de onde veio.
--
-- ⚠️ Se um dia o ML Full for adotado, este canal tem de ser DESLIGADO no mesmo
-- dia: em Full a venda não tira nada daqui, quem tira é a remessa de reposição
-- para o galpão do ML. Deduzir os dois contaria a mesma saída duas vezes.
--
-- ── A Shopee continua fora, e por outro motivo ───────────────────────────
--
-- Não é premissa: é falta de dado. As 3 linhas da Shopee chegam com
-- `product_sku` NULO, então nenhum mapa por SKU as alcança e a dedução não
-- teria o que resolver. Ligar o canal produziria zero — e um canal "ativo" que
-- nunca deduz é pior que um desligado, porque parece resolvido.
--
-- ⚠️ RODE EM BLOCOS.
-- ═══════════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — ensaio ANTES de ligar                                       ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
--
-- Com o marco zero em `now()` nos dois, o histórico não entra. Este ensaio
-- serve para confirmar que a chamada funciona e que ela devolve só Nuvemshop.

select * from public.carbo_ecommerce_deduzir_estoque();


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — liga os dois, com marco zero próprio                        ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
--
-- ⚠️ `deduz_a_partir_de = now()`, como a Nuvemshop. O histórico de 90 dias
-- (390 unidades do ML + 45 da Amazon) NÃO é deduzido: conciliar o passado é
-- tarefa separada, e só vale se a contagem física do galpão não bater.

update public.carbo_canal_estoque
set ativo = true,
    deduz_a_partir_de = now(),
    observacao = 'Ligado em 28/08/2026. NÃO é Full — confirmado pelo dono do '
                 || 'processo; nós embalamos e despachamos. ⚠️ O 0% de etiqueta '
                 || 'no Melhor Envio é só transporte diferente (Mercado Envios), '
                 || 'não galpão diferente. Se adotar Full, DESLIGUE no mesmo dia.',
    atualizado_em = now()
where platform = 'mercadolivre';

update public.carbo_canal_estoque
set ativo = true,
    deduz_a_partir_de = now(),
    observacao = 'Ligado em 28/08/2026. NÃO é FBA — confirmado pelo dono do '
                 || 'processo; despacho nosso (FBM). ⚠️ Se migrar para FBA, '
                 || 'DESLIGUE: em FBA a venda não tira nada do HUB-SP.',
    atualizado_em = now()
where platform = 'amazon';

update public.carbo_canal_estoque
set observacao = '⚠️ DESLIGADA por falta de DADO, não de premissa: as linhas da '
                 || 'Shopee chegam com product_sku NULO, então nenhum mapa por '
                 || 'SKU as resolve e a dedução não teria o que baixar. Ligar '
                 || 'produziria zero — e canal ativo que nunca deduz parece '
                 || 'resolvido. Resolver exige outra chave (o item do Bling).',
    atualizado_em = now()
where platform = 'shopee';


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 3 — conferência                                                 ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- (a) O retrato dos quatro canais, com o motivo de cada um.
select platform, warehouse_code, ativo, deduz_a_partir_de, observacao
from public.carbo_canal_estoque order by ativo desc, platform;

-- (b) O ensaio agora enxerga os três. Deve vir VAZIO logo após rodar — o marco
--     é `now()`, então nada anterior entra. Ele enche com o tempo.
select * from public.carbo_ecommerce_deduzir_estoque();

-- (c) ⭐ O que o espelho vai passar a ver por trimestre, pelos 90 dias
--     anteriores. Isto é PROJEÇÃO, não dedução: nada aqui foi baixado.
select platform, produto_alvo, sum(unidades_a_deduzir) as unidades_por_trimestre
from public.carbo_estoque_ensaio
where ordered_at > now() - interval '90 days' and produto_alvo is not null
group by 1,2 order by 3 desc;
