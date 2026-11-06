-- ═══════════════════════════════════════════════════════════════════════════
-- Boleto: o endereço do pagador vem da NF do Bling (06/11/2026)
--
-- Queixa do dono do processo no 1º teste: o diálogo abriu VAZIO para um
-- cliente que já tem NF no Bling — "não faz sentido eu precisar preencher, no
-- máximo verificar e emitir". A 20261150 só procurava em boletos anteriores e
-- em `carboze_orders`; cliente que só existe no Bling ficava sem nada.
--
-- Ordem da sugestão (a primeira que tiver CEP):
--   1. o último boleto do mesmo CPF/CNPJ  (alguém já conferiu)
--   2. a NF do Bling — JSON do detalhe (`contato.endereco`), conta 1 e conta 2
--   3. a NF do Bling — XML (`<enderDest>`), lido pela edge function
--      `bradesco-cobranca` (acao "endereco_nf"); a tela pede quando 1 e 2 falham
--   4. o pedido do sistema (endereço de ENTREGA — o menos fiscal dos quatro)
--
-- ⚠️ O documento casa por DÍGITOS nos dois lados: o Bling grava `numeroDocumento`
-- formatado em umas notas e cru em outras (a lição do CNPJ dos PDVs).
-- RODE EM BLOCOS.
-- ═══════════════════════════════════════════════════════════════════════════


-- ════════════════════════════════════════════════════════════════════════════
-- BLOCO 1 — as funções. Espera: "Success. No rows returned".
-- ════════════════════════════════════════════════════════════════════════════

-- As NFs do cliente nas DUAS contas, mais recentes primeiro, com o endereço do
-- JSON quando o detalhe o trouxe. ⚠️ `to_jsonb(n)`: `raw_detalhe` só existe no
-- Bling 2; no Bling 1 o detalhe fica em `raw_data` (que a listagem às vezes
-- regrava magro — por isso o XML é a rede).
create or replace function public.fin_boleto_nfs_do_cliente(p_doc text, p_limite int default 5)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_doc text := regexp_replace(coalesce(p_doc,''), '\D', '', 'g');
  v_out jsonb := '[]'::jsonb;
begin
  if length(v_doc) not in (11, 14) then return v_out; end if;

  with nfs as (
    select 1 as conta, j
      from (select to_jsonb(n) j from public.bling_nfe n
             where regexp_replace(coalesce(n.contato_cnpj,''), '\D', '', 'g') = v_doc) a
    union all
    select 2, j
      from (select to_jsonb(n) j from public.bling2_nfe n
             where regexp_replace(coalesce(n.contato_cnpj,''), '\D', '', 'g') = v_doc) b
  ), lidas as (
    select conta, j->>'numero' as numero, (j->>'data_emissao')::date as data_emissao, j->>'xml_url' as xml_url,
           coalesce(j->'raw_detalhe'->'contato', j->'raw_data'->'contato') as contato
      from nfs
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'conta', conta, 'numero', numero, 'data_emissao', data_emissao, 'xml_url', xml_url,
           'endereco', case when length(regexp_replace(coalesce(contato->'endereco'->>'cep',''), '\D', '', 'g')) = 8 then
             jsonb_build_object(
               'cep',         regexp_replace(contato->'endereco'->>'cep', '\D', '', 'g'),
               'logradouro',  contato->'endereco'->>'endereco',
               'numero',      contato->'endereco'->>'numero',
               'complemento', contato->'endereco'->>'complemento',
               'bairro',      contato->'endereco'->>'bairro',
               'cidade',      contato->'endereco'->>'municipio',
               'uf',          upper(contato->'endereco'->>'uf'),
               'email',       contato->>'email',
               'fone',        regexp_replace(coalesce(contato->>'telefone',''), '\D', '', 'g'))
           end)
         order by data_emissao desc nulls last), '[]'::jsonb)
    into v_out
    from (select * from lidas order by data_emissao desc nulls last limit greatest(1, least(p_limite, 20))) x;

  return v_out;
end;
$$;
revoke execute on function public.fin_boleto_nfs_do_cliente(text, int) from public, anon, authenticated;
grant  execute on function public.fin_boleto_nfs_do_cliente(text, int) to service_role;

-- O pré-preenchimento, agora com a NF. Mesmo nome e assinatura da 20261150.
create or replace function public.fin_boleto_preparar(p_receivable uuid, p_bling2 bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_t      jsonb;
  v_c      record;
  v_sug    jsonb;
  v_ped    jsonb;
  v_o      jsonb;
  v_nfs    jsonb := '[]'::jsonb;
  v_nf     jsonb;
begin
  if not coalesce(public.carbo_tem_app(array['carbo_financas']), false) then
    raise exception 'Sem permissão: boleto é do Finanças.';
  end if;
  v_t := public.fin_boleto_titulo(p_receivable, p_bling2, false);

  -- 1. último boleto do mesmo documento
  select pagador || jsonb_build_object('origem', 'boleto') into v_sug from public.fin_boletos
   where v_t->>'documento' is not null and pagador->>'documento' = v_t->>'documento'
     and status not in ('falha') and pagador ? 'cep'
   order by criado_em desc limit 1;

  -- 2. a NF do Bling (JSON)
  if v_t->>'documento' is not null then
    v_nfs := public.fin_boleto_nfs_do_cliente(v_t->>'documento', 5);
    if v_sug is null then
      select n->'endereco' || jsonb_build_object('origem', 'nf', 'nf', n->>'numero') into v_nf
        from jsonb_array_elements(v_nfs) n
       where n->'endereco' is not null and jsonb_typeof(n->'endereco') = 'object'
       limit 1;
      v_sug := v_nf;
    end if;
  end if;

  -- 4. o pedido do sistema (devolvido À PARTE: a tela só o usa se o XML da NF também falhar)
  select to_jsonb(o) into v_o from public.carboze_orders o
   where (v_t->>'order_id' is not null and o.id::text = v_t->>'order_id')
      or (v_t->>'documento' is not null and regexp_replace(coalesce(o.cnpj,''), '\D', '', 'g') = v_t->>'documento')
   order by (o.id::text = coalesce(v_t->>'order_id','')) desc, o.created_at desc
   limit 1;
  if v_o is not null then
    v_ped := jsonb_build_object(
      'origem', 'pedido', 'pedido', v_o->>'order_number',
      'endereco', v_o->>'delivery_address', 'bairro', v_o->>'delivery_neighborhood',
      'cidade', v_o->>'delivery_city', 'uf', v_o->>'delivery_state', 'cep', v_o->>'delivery_zip',
      'email', v_o->>'customer_email', 'fone', v_o->>'customer_phone');
  end if;

  select ambiente, multa_pct, juros_mes_pct into v_c
    from public.fin_cobranca_carteiras where empresa = v_t->>'empresa' and ativo;

  return jsonb_build_object(
    'titulo', v_t,
    'carteira', case when v_c.ambiente is null then null else
      jsonb_build_object('ambiente', v_c.ambiente, 'multa_pct', v_c.multa_pct, 'juros_mes_pct', v_c.juros_mes_pct) end,
    'sugestao', v_sug,
    'pedido', v_ped,
    -- 3. há NF com XML para a função ler (a tela pede só se 1 e 2 falharam)
    'nf_xml', exists (select 1 from jsonb_array_elements(v_nfs) n where coalesce(n->>'xml_url','') <> ''));
end;
$$;
revoke execute on function public.fin_boleto_preparar(uuid, bigint) from public, anon;
grant  execute on function public.fin_boleto_preparar(uuid, bigint) to authenticated, service_role;

notify pgrst, 'reload schema';


-- ════════════════════════════════════════════════════════════════════════════
-- BLOCO 2 — o cliente do 1º teste (CRF ALIMENTOS). Só leitura.
-- Espera: uma lista de NFs. Se o `endereco` vier preenchido em alguma, a tela
-- já abre preenchida. Se vier null em todas mas com `xml_url`, a tela busca no
-- XML (pela função) — aparece "buscando endereço da NF…" por um instante.
-- Lista VAZIA = o CNPJ não casa com nenhuma NF das duas contas: me mande.
-- ════════════════════════════════════════════════════════════════════════════
select jsonb_pretty(public.fin_boleto_nfs_do_cliente('48828205000196', 5));
