-- ═══════════════════════════════════════════════════════════════════════════
-- Boleto: o endereço vem do CADASTRO do cliente no Bling (06/11/2026)
--
-- 2º teste: a CRF ALIMENTOS não tem NF que case pelo CNPJ no espelho
-- (`fin_boleto_nfs_do_cliente` voltou `[]`), e o diálogo abriu vazio de novo.
-- O título, porém, guarda o CONTATO do Bling: `bling_contas_receber.contato_id`
-- (matriz) e `bling2_contas_receber.cliente_id` (filial). A função
-- `bradesco-cobranca` (ação `endereco_nf`) passa a ler `GET /contatos/{id}` no
-- Bling — endereço de COBRANÇA, senão o geral. Vínculo exato, sem comparar CNPJ.
--
-- ⚠️ O espelho de contatos (`bling_contacts`/`bling2_contacts`) vem da LISTAGEM,
-- que não traz endereço — por isso a leitura é ao vivo, no cadastro.
-- ⚠️ A função só LÊ o token do Bling; nunca renova (quem renova é o bling-sync).
--
-- Aqui: `fin_boleto_titulo` passa a devolver `conta` e `contato_id`. Mesma
-- assinatura; o resto do corpo é o da 20261150.
-- ═══════════════════════════════════════════════════════════════════════════


-- ════════════════════════════════════════════════════════════════════════════
-- BLOCO 1 — a função. Espera: "Success. No rows returned".
-- ════════════════════════════════════════════════════════════════════════════
create or replace function public.fin_boleto_titulo(p_receivable uuid, p_bling2 bigint, p_travar boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_r       jsonb;
  v_b       record;
  v_empresa text;
  v_valor   numeric(14,2);
  v_nome    text;
  v_doc     text;
  v_numero  text;
  v_venc    date;
  v_aberto  boolean;
  v_sit     text;
  v_contato bigint;
  v_conta   int;
begin
  if num_nonnulls(p_receivable, p_bling2) <> 1 then
    raise exception 'Informe UM título: da matriz (receivables) ou da filial (Bling 2).';
  end if;

  if p_receivable is not null then
    -- ⚠️ `to_jsonb(r)`: coluna ausente em produção vira nulo, nunca erro.
    if p_travar then
      select to_jsonb(r) into v_r from public.receivables r where r.id = p_receivable for update;
    else
      select to_jsonb(r) into v_r from public.receivables r where r.id = p_receivable;
    end if;
    if v_r is null then raise exception 'Título não encontrado.'; end if;
    v_sit     := v_r->>'status';
    v_aberto  := coalesce(v_sit,'') in ('programado','atrasado');
    v_empresa := coalesce(nullif(v_r->>'empresa',''), 'matriz');
    v_valor   := (v_r->>'amount')::numeric;
    v_nome    := nullif(btrim(coalesce(v_r->>'customer_name','')), '');
    v_doc     := nullif(regexp_replace(coalesce(v_r->>'documento',''), '\D', '', 'g'), '');
    v_numero  := coalesce(nullif(v_r->>'bling_numero',''), nullif(v_r->>'nf_numero',''));
    v_venc    := (v_r->>'due_date')::date;
    v_conta   := 1;
    -- Título do Bling 1: o saldo (parcial) e o contato estão no espelho.
    if (v_r->>'bling_id') is not null and to_regclass('public.bling_contas_receber') is not null then
      select * into v_b from public.bling_contas_receber where bling_id = (v_r->>'bling_id')::bigint;
      if found then
        if v_b.situacao::text = '3' and coalesce(v_b.saldo, 0) > 0 then v_valor := v_b.saldo; end if;
        v_nome   := coalesce(v_nome, nullif(btrim(coalesce(v_b.contato_nome,'')), ''));
        v_doc    := coalesce(v_doc, nullif(regexp_replace(coalesce(v_b.contato_documento,''), '\D', '', 'g'), ''));
        v_numero := coalesce(v_numero, nullif(v_b.numero, ''));
        v_contato := v_b.contato_id;
      end if;
    end if;
  else
    if p_travar then
      select c.*, nullif(regexp_replace(coalesce(k.cpf_cnpj,''), '\D', '', 'g'), '') as doc_contato
        into v_b
        from public.bling2_contas_receber c
        left join public.bling2_contacts k on k.bling_id = c.cliente_id
       where c.bling_id = p_bling2
       for update of c;
    else
      select c.*, nullif(regexp_replace(coalesce(k.cpf_cnpj,''), '\D', '', 'g'), '') as doc_contato
        into v_b
        from public.bling2_contas_receber c
        left join public.bling2_contacts k on k.bling_id = c.cliente_id
       where c.bling_id = p_bling2;
    end if;
    if not found then raise exception 'Título da filial não encontrado.'; end if;
    v_sit     := v_b.situacao::text;
    v_aberto  := coalesce(v_sit, '') in ('1','3');
    v_empresa := 'filial';
    v_valor   := coalesce(nullif(v_b.saldo, 0), v_b.valor);
    v_nome    := nullif(btrim(coalesce(v_b.cliente,'')), '');
    v_doc     := v_b.doc_contato;
    v_numero  := nullif(v_b.numero, '');
    v_venc    := v_b.vencimento;
    v_conta   := 2;
    v_contato := v_b.cliente_id;
  end if;

  return jsonb_build_object(
    'empresa', v_empresa, 'valor', v_valor, 'nome', v_nome, 'documento', v_doc,
    'numero', v_numero, 'vencimento', v_venc, 'aberto', v_aberto, 'situacao', v_sit,
    'order_id', v_r->>'order_id',
    -- O CONTATO no Bling (conta 1 ou 2): é por ele que a função lê o cadastro
    -- do cliente lá (endereço de cobrança) — vínculo exato, sem casar CNPJ.
    'conta', v_conta, 'contato_id', v_contato);
end;
$$;
revoke execute on function public.fin_boleto_titulo(uuid, bigint, boolean) from public, anon, authenticated;
grant  execute on function public.fin_boleto_titulo(uuid, bigint, boolean) to service_role;


-- ════════════════════════════════════════════════════════════════════════════
-- BLOCO 2 — o título da CRF ALIMENTOS tem contato do Bling? (só leitura)
-- Espera: 1+ linhas com `contato_id` preenchido. `contato_id` vazio = o espelho
-- do contas a receber não trouxe o contato desse título: me mande.
-- ════════════════════════════════════════════════════════════════════════════
select r.id, r.customer_name, r.amount, r.due_date, r.bling_id,
       public.fin_boleto_titulo(r.id, null, false) ->> 'contato_id' as contato_id,
       public.fin_boleto_titulo(r.id, null, false) ->> 'documento'  as documento
  from public.receivables r
 where r.customer_name ilike '%CRF ALIMENTOS%' and r.status in ('programado','atrasado')
 order by r.due_date;
