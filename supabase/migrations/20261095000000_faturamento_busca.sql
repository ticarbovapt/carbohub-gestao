-- =====================================================================
-- FINANÇAS → Faturamento: a busca procura por TUDO o que identifica o pedido
-- (16/10/2026).
--
-- Antes ela só olhava `customer_name` e `order_number` com ilike — e CNPJ não
-- dava: o documento está gravado FORMATADO (12.345.678/0001-90) e quem procura
-- digita os números. Agora:
--
--   texto (sem acento, minúsculo, "contém"):
--     cliente, nº do pedido, cidade/UF, endereço, e-mail, IE, vendedor,
--     nº do pedido de compra do cliente, NF (venda, filial, bonificação),
--     contato e cidade de faturamento, referência externa (BLING-…)
--   números (3+ dígitos, em qualquer posição, ignorando pontuação):
--     CNPJ/CPF, telefone, CEP, IE, nº das NFs, chave de acesso, pedido de compra
--
-- Cada PALAVRA digitada tem de aparecer (E entre palavras): "joao camara"
-- acha "JOÃO CÂMARA COMBUSTIVEIS". Busca ignora o mês, como já ignorava.
--
-- ⚠️ SECURITY INVOKER: enxerga EXATAMENTE o que a tela já enxergava lendo a
-- view direto — a RLS de quem chama decide. Nada abre.
-- ⚠️ plpgsql devolvendo `jsonb`, de propósito: NÃO vira dependente da
-- `carbo_vendas_metrica` (republicá-la já derrubou tela por causa das
-- dependentes — são três e não podem virar quatro).
-- ⚠️ As colunas são lidas por `to_jsonb(v) ->> '…'`: coluna que não existir
-- na view vira vazio em vez de derrubar a busca inteira.
-- ⚠️ O filtro de status é PARÂMETRO (a lista mora no front, lib/statusPedido),
-- e vai ANTES do limite — senão o teto seria gasto com pedido que a tela
-- descarta depois.
-- =====================================================================

-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 0 — as colunas existem na view? (só leitura)                 ║
-- ╚═══════════════════════════════════════════════════════════════════╝
-- ESPERADO: 22 linhas, todas `existe = true`. Coluna com false não quebra a
-- busca (ela só não ajuda) — mas me mande, para eu tirar ou trocar.
select c.col, exists (
         select 1 from information_schema.columns i
          where i.table_schema = 'public' and i.table_name = 'carbo_vendas_metrica'
            and i.column_name = c.col) as existe
from unnest(array[
  'customer_name','order_number','delivery_city','delivery_state','delivery_address',
  'customer_email','customer_ie','vendedor_name','po_number','invoice_number',
  'invoice2_number','invoice_bonificacao_number','billing_contact_name','billing_city',
  'external_ref','cnpj','customer_phone','delivery_zip','nf_access_key',
  'status','created_at','id'
]) as c(col)
order by 2, 1;

-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — a função                                                 ║
-- ╚═══════════════════════════════════════════════════════════════════╝
create or replace function public.carbo_faturamento_busca(
  p_termo  text,
  p_status text[] default null,
  p_limit  integer default 500
)
returns setof jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  c_de   constant text := 'áàâãäéèêëíìîïóòôõöúùûüçñ';
  c_para constant text := 'aaaaaeeeeiiiiooooouuuucn';
  v_tokens text[];
begin
  if btrim(coalesce(p_termo, '')) = '' then
    return;
  end if;
  v_tokens := regexp_split_to_array(translate(lower(btrim(p_termo)), c_de, c_para), '\s+');

  return query
  select b.j
  from public.carbo_vendas_metrica v
  cross join lateral (select to_jsonb(v) as j) jj
  cross join lateral (
    select jj.j,
      translate(lower(concat_ws(' ',
        jj.j->>'customer_name', jj.j->>'order_number', jj.j->>'delivery_city',
        jj.j->>'delivery_state', jj.j->>'delivery_address', jj.j->>'customer_email',
        jj.j->>'customer_ie', jj.j->>'vendedor_name', jj.j->>'po_number',
        jj.j->>'invoice_number', jj.j->>'invoice2_number', jj.j->>'invoice_bonificacao_number',
        jj.j->>'billing_contact_name', jj.j->>'billing_city', jj.j->>'external_ref'
      )), c_de, c_para) as txt,
      -- um campo por "palavra": tirar os não-dígitos de tudo junto colaria o
      -- fim de um número no começo do outro e acharia o que não existe
      concat_ws(' ',
        regexp_replace(coalesce(jj.j->>'cnpj', ''),                       '\D', '', 'g'),
        regexp_replace(coalesce(jj.j->>'customer_phone', ''),             '\D', '', 'g'),
        regexp_replace(coalesce(jj.j->>'delivery_zip', ''),               '\D', '', 'g'),
        regexp_replace(coalesce(jj.j->>'customer_ie', ''),                '\D', '', 'g'),
        regexp_replace(coalesce(jj.j->>'invoice_number', ''),             '\D', '', 'g'),
        regexp_replace(coalesce(jj.j->>'invoice2_number', ''),            '\D', '', 'g'),
        regexp_replace(coalesce(jj.j->>'invoice_bonificacao_number', ''), '\D', '', 'g'),
        regexp_replace(coalesce(jj.j->>'nf_access_key', ''),              '\D', '', 'g'),
        regexp_replace(coalesce(jj.j->>'po_number', ''),                  '\D', '', 'g')
      ) as dig
  ) b
  -- ⚠️ `::text`: `status` é o enum `order_status` em produção, e enum = text
  -- não tem operador (42883) — o banco local de teste tinha text e não pegou.
  where (p_status is null or v.status::text = any(p_status))
    and not exists (
      select 1 from unnest(v_tokens) as t(tok)
      where t.tok <> ''
        and not (
          position(t.tok in b.txt) > 0
          or (length(regexp_replace(t.tok, '\D', '', 'g')) >= 3
              and b.dig like '%' || regexp_replace(t.tok, '\D', '', 'g') || '%')
        )
    )
  order by v.created_at desc
  limit greatest(coalesce(p_limit, 500), 1);
end;
$$;

revoke execute on function public.carbo_faturamento_busca(text, text[], integer) from anon, public;
grant  execute on function public.carbo_faturamento_busca(text, text[], integer) to authenticated, service_role;

notify pgrst, 'reload schema';

-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ CONFERÊNCIA                                                        ║
-- ╚═══════════════════════════════════════════════════════════════════╝
-- Pelo SQL Editor (roda como dono, vê tudo): os 5 pedidos mais recentes que
-- casam com o CNPJ do pedido mais recente — digitado SÓ com números.
-- ESPERADO: pelo menos 1 linha, e o `cnpj` dela igual ao `procurado`
-- (formatado ou não). Zero linhas = a busca por documento não está casando.
with alvo as (
  select regexp_replace(cnpj, '\D', '', 'g') as procurado
  from public.carbo_vendas_metrica
  where coalesce(cnpj, '') <> ''
  order by created_at desc limit 1
)
select alvo.procurado, r->>'order_number' as pedido, r->>'customer_name' as cliente, r->>'cnpj' as cnpj
from alvo, public.carbo_faturamento_busca(alvo.procurado, null, 5) r;
