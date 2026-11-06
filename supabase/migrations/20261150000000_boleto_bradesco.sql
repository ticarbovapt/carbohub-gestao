-- ═══════════════════════════════════════════════════════════════════════════
-- Boleto Bradesco (híbrido: boleto + Pix) a partir do CONTAS A RECEBER
--
-- O boleto PENDURA no título que já existe — nunca cria título:
--   matriz → public.receivables (espelho do Bling 1 + os nascidos aqui)
--   filial → public.bling2_contas_receber (espelho do Bling 2), pelo bling_id
-- Criar título junto duplicaria o contas a receber que o Bling já tem.
--
--   fin_cobranca_carteiras   CADASTRO: CNPJ, carteira, negociação, multa/juros,
--                            o contador do nosso número. Uma ATIVA por empresa.
--   fin_boletos              uma linha por TENTATIVA de registro no banco
--   fin_boleto_reservar      (service_role) trava o título, valida, reserva o nº
--   fin_boleto_concluir      (service_role) grava o desfecho do registro
--   fin_boleto_atualizar     (service_role) consulta/baixa: transições fechadas
--
-- ⚠️ SANDBOX PRIMEIRO. As carteiras nascem só em `sandbox` (BLOCO 3) e a edge
-- function `bradesco-cobranca` manda ao sandbox o corpo FIXO do cenário
-- "Sucesso" (é o único que ele aceita), guardando ao lado o corpo que montamos
-- com o título real — é ele que se confere. Produção = cadastrar a carteira de
-- verdade + os secrets de produção, decisão do dono do processo.
--
-- RODE EM BLOCOS, NA ORDEM.
-- ═══════════════════════════════════════════════════════════════════════════


-- ════════════════════════════════════════════════════════════════════════════
-- BLOCO 0 — MEDIR (só leitura). A produção não é o repositório.
-- Espera: 1 linha. `receivables_colunas` deve listar amount, due_date, status,
-- customer_name, documento, bling_id, empresa. `tem_bling_contas_receber`
-- e `tem_bling2_contas_receber` = true. `tem_fin_boletos` = false na 1ª vez.
-- ════════════════════════════════════════════════════════════════════════════
select
  (select string_agg(column_name, ', ' order by column_name)
     from information_schema.columns
    where table_schema = 'public' and table_name = 'receivables'
      and column_name in ('amount','due_date','status','customer_name','documento','bling_id','empresa','bling_numero')) as receivables_colunas,
  to_regclass('public.bling_contas_receber')  is not null as tem_bling_contas_receber,
  to_regclass('public.bling2_contas_receber') is not null as tem_bling2_contas_receber,
  to_regclass('public.bling2_contacts')       is not null as tem_bling2_contacts,
  to_regclass('public.fin_boletos')           is not null as tem_fin_boletos;


-- ════════════════════════════════════════════════════════════════════════════
-- BLOCO 1 — tabelas, índices e leitura. Espera: "Success. No rows returned".
-- ════════════════════════════════════════════════════════════════════════════
create table if not exists public.fin_cobranca_carteiras (
  id                  uuid primary key default gen_random_uuid(),
  empresa             text not null check (empresa in ('matriz','filial')),
  ambiente            text not null check (ambiente in ('sandbox','producao')),
  banco               text not null default '237',
  cnpj                text not null check (cnpj ~ '^\d{14}$'),
  carteira            int  not null default 9,
  negociacao          text not null check (negociacao ~ '^\d{18}$'),   -- agência 4 + zeros 7 + conta 7
  especie             int  not null default 2,                         -- 2 = DM
  multa_pct           numeric(6,3) not null default 2,
  juros_mes_pct       numeric(6,3) not null default 1,
  -- ⚠️ O nosso número é NOSSO no híbrido (o banco não gera) e tem de ser único
  -- por carteira + negociação, INCLUSIVE contra o que o Net Empresa já emitiu.
  -- Em produção, comece acima do maior já usado; colisão volta como erro 69
  -- ("Título já cadastrado") e o próximo clique usa o número seguinte.
  nosso_numero_ultimo bigint not null default 0 check (nosso_numero_ultimo < 99999999999),
  conta_bancaria_id   uuid references public.fin_contas_bancarias(id),
  ativo               boolean not null default false,
  observacao          text,
  criado_em           timestamptz not null default now()
);
-- Uma carteira ATIVA por empresa: é ela que a tela usa, sem perguntar.
create unique index if not exists fin_cobranca_carteiras_uma_ativa
  on public.fin_cobranca_carteiras (empresa) where ativo;
-- Em produção, a mesma negociação não pode ter dois contadores.
create unique index if not exists fin_cobranca_carteiras_negociacao_uq
  on public.fin_cobranca_carteiras (negociacao, carteira) where ambiente = 'producao';

create table if not exists public.fin_boletos (
  id                 uuid primary key default gen_random_uuid(),
  carteira_id        uuid not null references public.fin_cobranca_carteiras(id),
  ambiente           text not null check (ambiente in ('sandbox','producao')),
  empresa            text not null check (empresa in ('matriz','filial')),
  receivable_id      uuid references public.receivables(id),
  bling2_conta_id    bigint,                         -- bling2_contas_receber.bling_id
  nosso_numero       bigint not null,                -- o que reservamos
  nosso_numero_banco text,                           -- o que o banco devolveu
  seu_numero         text not null,
  valor              numeric(14,2) not null check (valor > 0),
  emissao            date not null,
  vencimento         date not null,
  multa_cent         int,
  juros_dia_cent     int,
  pagador            jsonb not null,
  status             text not null default 'enviando'
                     check (status in ('enviando','registrado','rejeitado','falha','indeterminado','pago','cancelado')),
  status_banco       text,
  linha_digitavel    text,
  codigo_barras      text,
  txid               text,
  pix_copia_cola     text,
  pix_location       text,
  http_status        int,
  resposta           jsonb,
  erro               text,
  corpo_montado      jsonb,     -- o que NÓS montamos com o título real
  corpo_enviado      jsonb,     -- o que foi ao banco (no sandbox, o cenário fixo)
  pago_em            date,
  valor_pago         numeric(14,2),
  cancelado_em       timestamptz,
  cancelado_por      uuid,
  criado_por         uuid,
  criado_em          timestamptz not null default now(),
  enviado_em         timestamptz not null default now(),
  concluido_em       timestamptz,
  atualizado_em      timestamptz not null default now(),
  check (num_nonnulls(receivable_id, bling2_conta_id) = 1),
  unique (carteira_id, nosso_numero)
);
create index if not exists fin_boletos_receivable_idx on public.fin_boletos (receivable_id);
create index if not exists fin_boletos_bling2_idx     on public.fin_boletos (bling2_conta_id);
create index if not exists fin_boletos_status_idx     on public.fin_boletos (status, vencimento);

-- ⚠️ UM boleto vivo por título — a trava contra o boleto em dobro mora no
-- BANCO, não no botão (duas abas passam pelo botão). `indeterminado` conta como
-- vivo: o banco PODE ter registrado. `pago` também: título pago não ganha outro.
create unique index if not exists fin_boletos_um_vivo_receivable
  on public.fin_boletos (receivable_id)
  where receivable_id is not null and status in ('enviando','registrado','indeterminado','pago');
create unique index if not exists fin_boletos_um_vivo_bling2
  on public.fin_boletos (bling2_conta_id)
  where bling2_conta_id is not null and status in ('enviando','registrado','indeterminado','pago');

-- ⚠️ Identidade do boleto é ÚNICA em produção — é ela que a baixa automática
-- (fase 4) vai usar. No sandbox o banco devolve SEMPRE a mesma linha e o mesmo
-- txid, então lá não há índice.
create unique index if not exists fin_boletos_linha_uq
  on public.fin_boletos (linha_digitavel)
  where ambiente = 'producao' and linha_digitavel is not null and status not in ('rejeitado','falha');
create unique index if not exists fin_boletos_txid_uq
  on public.fin_boletos (txid)
  where ambiente = 'producao' and txid is not null and status not in ('rejeitado','falha');

alter table public.fin_cobranca_carteiras enable row level security;
alter table public.fin_boletos enable row level security;

-- Leitura: quem tem o Finanças. ⚠️ SEM policy de escrita: quem grava é a edge
-- function, pelas funções abaixo (service role).
drop policy if exists fin_cobranca_carteiras_le on public.fin_cobranca_carteiras;
create policy fin_cobranca_carteiras_le on public.fin_cobranca_carteiras
  for select to authenticated using ((select public.carbo_tem_app(array['carbo_financas'])));
drop policy if exists fin_boletos_le on public.fin_boletos;
create policy fin_boletos_le on public.fin_boletos
  for select to authenticated using ((select public.carbo_tem_app(array['carbo_financas'])));

revoke all on public.fin_cobranca_carteiras, public.fin_boletos from anon, authenticated;
grant select on public.fin_cobranca_carteiras, public.fin_boletos to authenticated;


-- ════════════════════════════════════════════════════════════════════════════
-- BLOCO 2 — as funções (SÓ service_role). Espera: "Success. No rows returned".
-- ════════════════════════════════════════════════════════════════════════════

-- ── Reserva: trava o título, confere, numera ─────────────────────────────────
-- ⚠️ VALOR, NOME e o título vêm do BANCO, nunca do corpo da requisição. A tela
-- manda o endereço do pagador (o Bling não guarda), o vencimento e — só quando
-- o título não tem — o CPF/CNPJ.
create or replace function public.fin_boleto_reservar(
  p_user        uuid,
  p_receivable  uuid,
  p_bling2      bigint,
  p_vencimento  date,
  p_pagador     jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hoje     date := (now() at time zone 'America/Sao_Paulo')::date;
  v_empresa  text;
  v_valor    numeric(14,2);
  v_nome     text;
  v_doc      text;
  v_numero   text;
  v_r        jsonb;
  v_b        record;
  v_c        record;
  v_n        bigint;
  v_id       uuid;
  v_pag      jsonb;
begin
  if num_nonnulls(p_receivable, p_bling2) <> 1 then
    raise exception 'Informe UM título: da matriz (receivables) ou da filial (Bling 2).';
  end if;
  if p_vencimento is null or p_vencimento < v_hoje then
    raise exception 'Vencimento não pode ser anterior a hoje (o Pix do boleto exige).';
  end if;

  if p_receivable is not null then
    -- ⚠️ `to_jsonb(r)`: coluna ausente em produção vira nulo, nunca erro.
    select to_jsonb(r) into v_r from public.receivables r where r.id = p_receivable for update;
    if v_r is null then raise exception 'Título não encontrado.'; end if;
    if coalesce(v_r->>'status','') not in ('programado','atrasado') then
      raise exception 'Título não está em aberto (situação: %).', v_r->>'status';
    end if;
    v_empresa := coalesce(nullif(v_r->>'empresa',''), 'matriz');
    v_valor   := (v_r->>'amount')::numeric;
    v_nome    := nullif(btrim(coalesce(v_r->>'customer_name','')), '');
    v_doc     := nullif(regexp_replace(coalesce(v_r->>'documento',''), '\D', '', 'g'), '');
    v_numero  := coalesce(nullif(v_r->>'bling_numero',''), nullif(v_r->>'nf_numero',''));
    -- Título do Bling 1: o saldo e o contato estão no espelho.
    if (v_r->>'bling_id') is not null and to_regclass('public.bling_contas_receber') is not null then
      select * into v_b from public.bling_contas_receber where bling_id = (v_r->>'bling_id')::bigint;
      if found then
        if v_b.situacao::text = '3' and coalesce(v_b.saldo, 0) > 0 then v_valor := v_b.saldo; end if;
        v_nome   := coalesce(v_nome, nullif(btrim(coalesce(v_b.contato_nome,'')), ''));
        v_doc    := coalesce(v_doc, nullif(regexp_replace(coalesce(v_b.contato_documento,''), '\D', '', 'g'), ''));
        v_numero := coalesce(v_numero, nullif(v_b.numero, ''));
      end if;
    end if;
  else
    select c.*, nullif(regexp_replace(coalesce(k.cpf_cnpj,''), '\D', '', 'g'), '') as doc_contato
      into v_b
      from public.bling2_contas_receber c
      left join public.bling2_contacts k on k.bling_id = c.cliente_id
     where c.bling_id = p_bling2
     for update of c;
    if not found then raise exception 'Título da filial não encontrado.'; end if;
    if coalesce(v_b.situacao::text, '') not in ('1','3') then
      raise exception 'Título da filial não está em aberto no Bling (situação %).', v_b.situacao;
    end if;
    v_empresa := 'filial';
    v_valor   := coalesce(nullif(v_b.saldo, 0), v_b.valor);
    v_nome    := nullif(btrim(coalesce(v_b.cliente,'')), '');
    v_doc     := v_b.doc_contato;
    v_numero  := nullif(v_b.numero, '');
  end if;

  if coalesce(v_valor, 0) <= 0 then raise exception 'Título sem valor em aberto.'; end if;
  if v_nome is null then raise exception 'O título não tem o nome do cliente.'; end if;
  -- Documento: o do título; só sem ele vale o que a tela digitou.
  v_doc := coalesce(v_doc, nullif(regexp_replace(coalesce(p_pagador->>'documento',''), '\D', '', 'g'), ''));
  if v_doc is null or length(v_doc) not in (11, 14) then
    raise exception 'O título não tem CPF/CNPJ do cliente: informe na tela.';
  end if;

  select * into v_c from public.fin_cobranca_carteiras where empresa = v_empresa and ativo for update;
  if not found then
    raise exception 'Não há carteira de cobrança ativa para a %.', v_empresa;
  end if;

  if exists (select 1 from public.fin_boletos
              where (receivable_id = p_receivable or bling2_conta_id = p_bling2)
                and status in ('enviando','registrado','indeterminado','pago')) then
    raise exception 'Este título já tem boleto (registrado, em envio ou sem resposta). Consulte ou cancele antes de emitir outro.';
  end if;

  update public.fin_cobranca_carteiras
     set nosso_numero_ultimo = nosso_numero_ultimo + 1
   where id = v_c.id
  returning nosso_numero_ultimo into v_n;

  v_pag := coalesce(p_pagador, '{}'::jsonb) || jsonb_build_object('nome', v_nome, 'documento', v_doc);

  insert into public.fin_boletos
    (carteira_id, ambiente, empresa, receivable_id, bling2_conta_id, nosso_numero, seu_numero,
     valor, emissao, vencimento, pagador, criado_por)
  values
    (v_c.id, v_c.ambiente, v_empresa, p_receivable, p_bling2, v_n,
     left(coalesce(v_numero, 'CH' || v_n::text), 25),
     v_valor, v_hoje, p_vencimento, v_pag, p_user)
  returning id into v_id;

  return jsonb_build_object(
    'id', v_id, 'ambiente', v_c.ambiente, 'empresa', v_empresa,
    'nosso_numero', v_n, 'seu_numero', left(coalesce(v_numero, 'CH' || v_n::text), 25),
    'valor', v_valor, 'emissao', v_hoje, 'vencimento', p_vencimento, 'pagador', v_pag,
    'carteira', jsonb_build_object(
      'cnpj', v_c.cnpj, 'carteira', v_c.carteira, 'negociacao', v_c.negociacao,
      'especie', v_c.especie, 'multa_pct', v_c.multa_pct, 'juros_mes_pct', v_c.juros_mes_pct));
end;
$$;
revoke execute on function public.fin_boleto_reservar(uuid, uuid, bigint, date, jsonb) from public, anon, authenticated;
grant  execute on function public.fin_boleto_reservar(uuid, uuid, bigint, date, jsonb) to service_role;

-- ── Desfecho do REGISTRO ─────────────────────────────────────────────────────
-- Os corpos chegam como TEXTO e viram jsonb aqui: o jsonb do Postgres guarda a
-- negociação de 18 dígitos inteira; o JavaScript, não.
create or replace function public.fin_boleto_concluir(
  p_id            uuid,
  p_status        text,
  p_http          int,
  p_resposta      text,
  p_corpo_montado text,
  p_corpo_enviado text,
  p_registro      jsonb,
  p_erro          text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_resp jsonb;
begin
  if p_status not in ('registrado','rejeitado','falha','indeterminado') then
    raise exception 'Status inválido: %', p_status;
  end if;
  begin v_resp := p_resposta::jsonb;
  exception when others then v_resp := to_jsonb(left(coalesce(p_resposta,''), 20000)); end;

  update public.fin_boletos
     set status = p_status, http_status = p_http, resposta = v_resp,
         corpo_montado = case when p_corpo_montado is null then corpo_montado else p_corpo_montado::jsonb end,
         corpo_enviado = case when p_corpo_enviado is null then corpo_enviado else p_corpo_enviado::jsonb end,
         nosso_numero_banco = coalesce(p_registro->>'nosso_numero', nosso_numero_banco),
         linha_digitavel    = coalesce(p_registro->>'linha_digitavel', linha_digitavel),
         codigo_barras      = coalesce(p_registro->>'codigo_barras', codigo_barras),
         txid               = coalesce(p_registro->>'txid', txid),
         pix_copia_cola     = coalesce(p_registro->>'pix_copia_cola', pix_copia_cola),
         pix_location       = coalesce(p_registro->>'pix_location', pix_location),
         status_banco       = coalesce(p_registro->>'status_banco', status_banco),
         multa_cent         = coalesce((p_registro->>'multa_cent')::int, multa_cent),
         juros_dia_cent     = coalesce((p_registro->>'juros_dia_cent')::int, juros_dia_cent),
         erro = p_erro, concluido_em = now(), atualizado_em = now()
   where id = p_id and status = 'enviando';
  if not found then raise exception 'Boleto % não está em envio.', p_id; end if;
end;
$$;
revoke execute on function public.fin_boleto_concluir(uuid, text, int, text, text, text, jsonb, text) from public, anon, authenticated;
grant  execute on function public.fin_boleto_concluir(uuid, text, int, text, text, text, jsonb, text) to service_role;

-- ── Consulta e baixa: transições FECHADAS ────────────────────────────────────
--   registrado/indeterminado → registrado | pago | cancelado
--   indeterminado            → falha  (o banco diz que o título NÃO existe)
--   pago e cancelado são finais.
-- ⚠️ `enviando` há mais de 5 min = a função caiu entre o envio e o registro: o
-- banco PODE ter registrado, então ele vale como `indeterminado` aqui (é a
-- consulta que decide). A conversão mora AQUI e não na reserva: lá a recusa
-- de "já tem boleto" desfaria a mudança junto (medido no teste local).
create or replace function public.fin_boleto_atualizar(
  p_id        uuid,
  p_status    text,
  p_resposta  text,
  p_campos    jsonb,
  p_user      uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_b    record;
  v_resp jsonb;
begin
  select * into v_b from public.fin_boletos where id = p_id for update;
  if not found then raise exception 'Boleto não encontrado.'; end if;
  if v_b.status = 'enviando' then
    if v_b.enviado_em > now() - interval '5 minutes' then
      raise exception 'Boleto em envio agora: aguarde a resposta do banco.';
    end if;
    v_b.status := 'indeterminado';
  end if;
  if v_b.status in ('pago','cancelado','rejeitado','falha') then
    raise exception 'Boleto já está %: não muda mais.', v_b.status;
  end if;
  if not (p_status in ('registrado','pago','cancelado')
          or (p_status = 'falha' and v_b.status = 'indeterminado')) then
    raise exception 'Transição % → % não é permitida.', v_b.status, p_status;
  end if;
  begin v_resp := p_resposta::jsonb;
  exception when others then v_resp := to_jsonb(left(coalesce(p_resposta,''), 20000)); end;

  update public.fin_boletos
     set status = p_status, resposta = coalesce(v_resp, resposta),
         status_banco    = coalesce(p_campos->>'status_banco', status_banco),
         linha_digitavel = coalesce(p_campos->>'linha_digitavel', linha_digitavel),
         codigo_barras   = coalesce(p_campos->>'codigo_barras', codigo_barras),
         txid            = coalesce(p_campos->>'txid', txid),
         pix_copia_cola  = coalesce(p_campos->>'pix_copia_cola', pix_copia_cola),
         pago_em         = coalesce((p_campos->>'pago_em')::date, pago_em),
         valor_pago      = coalesce((p_campos->>'valor_pago')::numeric, valor_pago),
         cancelado_em    = case when p_status = 'cancelado' then now() else cancelado_em end,
         cancelado_por   = case when p_status = 'cancelado' then p_user else cancelado_por end,
         erro            = p_campos->>'erro',
         atualizado_em   = now()
   where id = p_id;
  return jsonb_build_object('id', p_id, 'de', v_b.status, 'para', p_status);
end;
$$;
revoke execute on function public.fin_boleto_atualizar(uuid, text, text, jsonb, uuid) from public, anon, authenticated;
grant  execute on function public.fin_boleto_atualizar(uuid, text, text, jsonb, uuid) to service_role;

notify pgrst, 'reload schema';


-- ════════════════════════════════════════════════════════════════════════════
-- BLOCO 3 — carteiras de SANDBOX (matriz e filial), ATIVAS.
-- O sandbox só aceita o beneficiário e a negociação DE TESTE do Bradesco
-- (68.542.653/1018-38, negociação 1111…), e por isso as duas empresas apontam
-- para eles. Espera: 2 linhas, ambiente sandbox, ativo true.
-- ════════════════════════════════════════════════════════════════════════════
insert into public.fin_cobranca_carteiras (empresa, ambiente, cnpj, carteira, negociacao, especie, ativo, observacao)
select e, 'sandbox', '68542653101838', 9, '111111111111111111', 2, true, 'Sandbox do Bradesco (beneficiário e negociação de teste)'
  from unnest(array['matriz','filial']) e
 where not exists (select 1 from public.fin_cobranca_carteiras where empresa = e and ambiente = 'sandbox');

select empresa, ambiente, cnpj, carteira, negociacao, multa_pct, juros_mes_pct, nosso_numero_ultimo, ativo
  from public.fin_cobranca_carteiras order by empresa;


-- ════════════════════════════════════════════════════════════════════════════
-- BLOCO 4 — CONFERÊNCIA. Espera: tabelas 2 · funcoes 3 · os três `auth_*`
-- FALSE (authenticated não executa) · policies 2 · carteiras_ativas 2.
-- ════════════════════════════════════════════════════════════════════════════
select
  (select count(*) from pg_class where relnamespace = 'public'::regnamespace
     and relname in ('fin_cobranca_carteiras','fin_boletos'))                         as tabelas,
  (select count(*) from pg_proc where pronamespace = 'public'::regnamespace
     and proname in ('fin_boleto_reservar','fin_boleto_concluir','fin_boleto_atualizar')) as funcoes,
  has_function_privilege('authenticated', 'public.fin_boleto_reservar(uuid, uuid, bigint, date, jsonb)', 'execute') as auth_reservar,
  has_function_privilege('authenticated', 'public.fin_boleto_concluir(uuid, text, int, text, text, text, jsonb, text)', 'execute') as auth_concluir,
  has_function_privilege('authenticated', 'public.fin_boleto_atualizar(uuid, text, text, jsonb, uuid)', 'execute') as auth_atualizar,
  (select count(*) from pg_policies where tablename in ('fin_boletos','fin_cobranca_carteiras')) as policies,
  (select count(*) from public.fin_cobranca_carteiras where ativo)                     as carteiras_ativas;
