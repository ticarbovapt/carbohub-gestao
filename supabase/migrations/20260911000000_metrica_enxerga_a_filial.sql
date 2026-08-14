-- ═══════════════════════════════════════════════════════════════════════════
-- A métrica passa a enxergar a nota da FILIAL
--
-- Caso concreto: o pedido V2026070028 (CENTRO AUTOMOTIVO ZAP, R$ 16.800) foi
-- faturado no Bling 2 antes da integração existir. A nota é real, o dinheiro
-- entrou — e a tela mostra "Não conta · Aguardando emissão da NF".
--
-- Não é o pedido que está errado. É a régua:
--
--     left join public.bling_nfe n on n.bling_id = o.bling_nf_id
--
-- `carbo_vendas_metrica` só junta `bling_nfe`, que é o espelho da MATRIZ.
-- Nota emitida na filial vive em `bling2_nfe` e não tem caminho até aqui, então
-- o pedido cai em `motivo_fora = 'aguardando_nf'` para sempre.
--
-- ⚠️ A correção NÃO é gravar o id da conta 2 em `bling_nf_id`. Isso já foi
-- tentado e revertido neste projeto: os dois Blings numeram do zero, e um id da
-- conta 2 pode casar com uma nota REAL da conta 1 — nota cancelada de uma
-- empresa derrubando venda da outra. A migração que reverteu aquilo ainda
-- limpou os valores gravados por engano.
--
-- A correção é a view juntar as DUAS, cada uma pela sua coluna.
--
-- ⚠️ RODE EM BLOCOS.
-- ═══════════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — antes: quanto está fora por causa disso                     ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- Rode ANTES de aplicar, e guarde o número. É com ele que você confere depois
-- se o faturamento subiu exatamente o esperado — e não mais que isso.

select count(*) as pedidos_fora, sum(total) as valor_fora
from public.carbo_vendas_metrica
where not conta_metrica and motivo_fora = 'aguardando_nf';


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — a view enxerga as duas contas                               ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- Mudanças, e SÓ estas três:
--   • join novo em `bling2_nfe` por `o.bling2_nf_id`
--   • `nf_valida` / `nf_invalida` passam a considerar a nota que existir
--   • `conta_metrica` e `motivo_fora` idem
--
-- Todo o resto do corpo é igual. Pedido da matriz não muda de comportamento:
-- `bling2_nf_id` é nulo nele, o join não casa, e a regra fica sendo a de antes.

create or replace view public.carbo_vendas_metrica
with (security_invoker = true) as
select
  o.*,
  -- Número e situação da nota que ESTE pedido tem, seja de qual conta for.
  -- coalesce e não "n2 quando conta=2": pedido antigo faturado manualmente na
  -- filial não tem `bling_conta` preenchido, e é justamente o caso que
  -- motivou esta migração.
  coalesce(n.numero,   n2.numero)   as nf_numero,
  coalesce(n.situacao, n2.situacao) as nf_situacao,

  -- ⚠️ Cada espelho tem a SUA lista branca de situações. A da matriz
  -- (`carbo_nf_valida`) e a da filial (`bling2_nf_e_valida`) hoje coincidem,
  -- mas são cadastros diferentes e podem divergir — usar uma para julgar a
  -- outra seria supor que o Bling escreve igual nas duas contas.
  (public.carbo_nf_valida(n.situacao) or public.bling2_nf_e_valida(n2.situacao))
    as nf_valida,
  (public.carbo_nf_invalida(n.situacao)
   or (n2.bling_id is not null and not public.bling2_nf_e_valida(n2.situacao)))
    as nf_invalida,

  coalesce(o.sale_date, o.created_at::date) as data_efetiva,

  (
    o.status not in ('quote', 'cancelled')
    and (
          public.carbo_nf_valida(n.situacao)
       or public.bling2_nf_e_valida(n2.situacao)
       or o.status in ('invoiced', 'shipped', 'delivered')
    )
  ) as conta_metrica,

  case
    when o.status = 'quote'     then 'orcamento'
    when o.status = 'cancelled' then 'cancelado'
    when public.carbo_nf_invalida(n.situacao) then 'nf_invalida'
    when n2.bling_id is not null and not public.bling2_nf_e_valida(n2.situacao)
      then 'nf_invalida'
    when not public.carbo_nf_valida(n.situacao)
     and not public.bling2_nf_e_valida(n2.situacao)
     and o.status not in ('invoiced','shipped','delivered') then 'aguardando_nf'
    else null
  end as motivo_fora
from public.carboze_orders o
left join public.bling_nfe  n  on n.bling_id  = o.bling_nf_id
left join public.bling2_nfe n2 on n2.bling_id = o.bling2_nf_id;   -- ⬅ novo

comment on view public.carbo_vendas_metrica is
  'Fonte ÚNICA de "esta venda conta". Junta os DOIS espelhos de NF, cada um pela sua coluna (bling_nf_id → bling_nfe, bling2_nf_id → bling2_nfe). Nunca gravar id da conta 2 em bling_nf_id: os dois Blings numeram do zero e o id colidiria com nota real da outra empresa.';

grant select on public.carbo_vendas_metrica to authenticated;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 3 — vincular uma NF da filial a um pedido                       ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- Para o caso legado: nota emitida na filial ANTES da integração, sem
-- `external_ref` nem `bling_conta` — a rotina automática
-- (`carbo_vincula_nf_filial`) não alcança, porque ela parte do id do pedido
-- que nós criamos.
--
-- ⚠️ Vínculo MANUAL, feito por gente. Casar automaticamente por CNPJ + valor +
-- data seria heurística: cliente que compra o mesmo valor duas vezes no mês
-- geraria vínculo errado sem ninguém perceber, e o erro é no faturamento.
-- A tela sugere; a pessoa confirma.
--
-- ⚠️ Recusa se a nota já estiver em OUTRO pedido. Duas vendas apontando para a
-- mesma nota dobram o faturamento do mês — e é o tipo de erro que ninguém
-- procura, porque cada linha isolada parece certa.

create or replace function public.carbo_vincula_nf2_manual(
  p_order_id uuid,
  p_nf_bling_id bigint
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nf   record;
  v_dono text;
begin
  if not public.carbo_pode_mexer_estoque() then
    raise exception 'Você não tem permissão para vincular notas.'
      using errcode = 'insufficient_privilege';
  end if;

  select bling_id, numero, chave_acesso, situacao
    into v_nf
    from public.bling2_nfe where bling_id = p_nf_bling_id;
  if not found then
    raise exception 'NF % não encontrada no espelho da filial.', p_nf_bling_id
      using errcode = 'no_data_found';
  end if;

  if not public.bling2_nf_e_valida(v_nf.situacao) then
    raise exception 'Esta NF está como "%" e não conta como documento válido.', v_nf.situacao
      using errcode = 'check_violation';
  end if;

  select order_number into v_dono
    from public.carboze_orders
   where bling2_nf_id = p_nf_bling_id and id <> p_order_id
   limit 1;
  if v_dono is not null then
    raise exception 'Esta NF já está vinculada ao pedido %.', v_dono
      using errcode = 'unique_violation';
  end if;

  update public.carboze_orders
     set bling2_nf_id    = v_nf.bling_id,
         nf2_access_key  = v_nf.chave_acesso,
         invoice2_number = v_nf.numero,
         -- Marca a conta, que é o que faz o resto do sistema saber onde
         -- consultar ou cancelar essa nota depois.
         bling_conta     = coalesce(bling_conta, 2),
         updated_at      = now()
   where id = p_order_id;

  if not found then
    raise exception 'Pedido % não encontrado.', p_order_id using errcode = 'no_data_found';
  end if;
end;
$$;

revoke all on function public.carbo_vincula_nf2_manual(uuid, bigint) from public, anon;
grant execute on function public.carbo_vincula_nf2_manual(uuid, bigint) to authenticated;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 4 — as notas da filial ainda sem dono                           ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- `bling2_nfe` não tem coluna `order_id` (é espelho puro, por decisão de
-- projeto). Então "órfã" aqui é: nota válida que nenhum pedido referencia.

create or replace view public.bling2_nfe_orfas
with (security_invoker = true) as
select nf.bling_id, nf.numero, nf.serie, nf.chave_acesso, nf.data_emissao,
       nf.contato_nome, nf.contato_cnpj, nf.valor_total, nf.situacao,
       nf.informacoes_adicionais
from public.bling2_nfe nf
where public.bling2_nf_e_valida(nf.situacao)
  and not exists (
    select 1 from public.carboze_orders o where o.bling2_nf_id = nf.bling_id
  );

grant select on public.bling2_nfe_orfas to authenticated;

comment on view public.bling2_nfe_orfas is
  'NFs válidas da FILIAL que nenhum pedido reivindicou. Alimenta a aba Vincular NFs do Finanças. bling2_nfe não tem order_id de propósito — o vínculo mora no pedido.';


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 5 — conferência                                                 ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- (a) DEPOIS da mudança: quanto continua fora. Compare com o BLOCO 1 —
--     a diferença é exatamente o que a filial destravou.
select count(*) as pedidos_fora, sum(total) as valor_fora
from public.carbo_vendas_metrica
where not conta_metrica and motivo_fora = 'aguardando_nf';

-- (b) O pedido do caso concreto. Enquanto a NF não for vinculada, ele
--     continua fora — a view só passou a SABER olhar, o vínculo é o passo
--     seguinte, na tela.
select order_number, customer_name, total, status, nf_numero, nf_situacao,
       conta_metrica, motivo_fora, bling_conta, bling2_nf_id
from public.carbo_vendas_metrica
where order_number = 'V2026070028';

-- (c) Quantas notas da filial estão sem dono, e quanto somam.
select count(*) as notas_orfas, sum(valor_total) as valor
from public.bling2_nfe_orfas;

-- (d) Candidatas para o pedido acima (mesmo CNPJ ou nome parecido).
--     ⚠️ Isto é SUGESTÃO para olho humano, não vínculo automático.
select bling_id, numero, data_emissao, contato_nome, valor_total, situacao
from public.bling2_nfe_orfas
where contato_nome ilike '%ZAP%'
order by data_emissao desc
limit 20;
