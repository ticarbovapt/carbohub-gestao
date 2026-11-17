-- ═══════════════════════════════════════════════════════════════════════════
-- 20261175 — Pós-venda: o REEMBOLSO passa pelo Financeiro
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Pedido do dono do processo em 17/11/2026: quem atende NÃO faz reembolso. O
-- atendente pede (parcial ou total, com o valor e para onde vai o dinheiro), o
-- Financeiro paga e confirma COM O COMPROVANTE, e o caso volta ao atendente
-- para ele mandar o comprovante ao cliente no chat.
--
--   carbo_posvenda_reembolsos                  um pedido de reembolso por envio
--   carbo_posvenda_reembolso_solicitar(...)    o atendente pede (Atendimento)
--   carbo_posvenda_reembolso_pagar(...)        o Financeiro paga, com comprovante
--   carbo_posvenda_reembolso_devolver(...)     o Financeiro devolve (dado errado)
--   carbo_posvenda_reembolsos_lista(...)       a fila do Financeiro (/reembolsos)
--   bucket `posvenda-comprovantes`             PRIVADO; sobe quem tem o Finanças
--
-- O roteiro continua no CÓDIGO (`posvendaCasos.ts`): o passo de pedir o
-- reembolso diz em qual passo o caso ESPERA o Financeiro e para qual passo ele
-- vai quando o pagamento é confirmado. O banco guarda os dois no pedido de
-- reembolso e só os cumpre — não conhece a árvore.
--
-- ⚠️ Enquanto o pedido espera o Financeiro, o caso NÃO anda pelo atendimento
-- (responder e encerrar recusam). "Voltar passo" CANCELA o pedido ainda não
-- pago. Depois de pago, o pagamento não se desfaz pelo Atendimento.
-- ⚠️ Nada aqui move card da esteira nem manda mensagem ao cliente.
-- ═══════════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — a tabela                                                    ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
create table if not exists public.carbo_posvenda_reembolsos (
  id               uuid primary key default gen_random_uuid(),
  caso_id          uuid not null references public.carbo_posvenda_casos (id) on delete cascade,
  bling_id         bigint not null,
  tipo             text not null check (tipo in ('parcial', 'integral')),
  valor            numeric(12,2) not null check (valor > 0),
  forma            text not null check (forma in ('pix', 'estorno', 'transferencia')),
  dados            text check (dados is null or length(dados) <= 2000),
  nota             text check (nota is null or length(nota) <= 4000),
  status           text not null default 'solicitado'
                   check (status in ('solicitado', 'pago', 'devolvido', 'cancelado')),
  -- O roteiro (código) diz onde o caso espera e para onde vai: o banco cumpre.
  passo_volta      text not null,     -- o passo de pedir (volta para lá se devolvido)
  passo_aguarda    text not null,     -- onde o caso espera o Financeiro
  passo_depois     text not null,     -- para onde vai quando pago
  solicitado_por   uuid,
  solicitado_em    timestamptz not null default now(),
  pago_por         uuid,
  pago_em          date,
  pago_registrado_em timestamptz,
  valor_pago       numeric(12,2) check (valor_pago is null or valor_pago > 0),
  comprovante_path text,
  nota_financeiro  text check (nota_financeiro is null or length(nota_financeiro) <= 4000),
  devolvido_por    uuid,
  devolvido_em     timestamptz,
  motivo_devolucao text check (motivo_devolucao is null or length(motivo_devolucao) <= 2000),
  cancelado_em     timestamptz,
  constraint carbo_posvenda_reembolsos_pago_coerente check (
    (status = 'pago') = (pago_em is not null and valor_pago is not null and comprovante_path is not null))
);

comment on table public.carbo_posvenda_reembolsos is
  'Pós-venda: pedido de reembolso do atendente ao Financeiro (parcial/integral, valor, forma e dados). O Financeiro paga com comprovante e o caso volta ao atendente. Escrita só pelas funções carbo_posvenda_reembolso_*. Ver 20261175.';

-- UM pedido esperando por caso: dois pedindo dinheiro para o mesmo problema
-- seriam dois pagamentos.
create unique index if not exists carbo_posvenda_reembolsos_um_pendente
  on public.carbo_posvenda_reembolsos (caso_id) where status = 'solicitado';
create index if not exists carbo_posvenda_reembolsos_status
  on public.carbo_posvenda_reembolsos (status, solicitado_em desc);
create index if not exists carbo_posvenda_reembolsos_caso
  on public.carbo_posvenda_reembolsos (caso_id, solicitado_em desc);

alter table public.carbo_posvenda_reembolsos enable row level security;
drop policy if exists carbo_posvenda_reembolsos_ler on public.carbo_posvenda_reembolsos;
create policy carbo_posvenda_reembolsos_ler on public.carbo_posvenda_reembolsos
  for select to authenticated using ((select public.carbo_e_time_interno()));
grant select on public.carbo_posvenda_reembolsos to authenticated;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — o comprovante: bucket PRIVADO                               ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('posvenda-comprovantes', 'posvenda-comprovantes', false, 10485760,
        array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Ler: time interno (o atendente manda ao cliente). Subir: quem tem o Finanças.
-- Sem UPDATE nem DELETE: comprovante não se troca nem some.
drop policy if exists posvenda_comprovantes_ler on storage.objects;
create policy posvenda_comprovantes_ler on storage.objects
  for select to authenticated
  using (bucket_id = 'posvenda-comprovantes' and (select public.carbo_e_time_interno()));
drop policy if exists posvenda_comprovantes_subir on storage.objects;
create policy posvenda_comprovantes_subir on storage.objects
  for insert to authenticated
  with check (bucket_id = 'posvenda-comprovantes'
              and (select public.carbo_tem_app(array['carbo_financas'])));


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 3 — os avisos: cadastro no porteiro (20261136)                  ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
insert into public.carbo_notif_tipos (tipo, referencia, aba, rotulo, descricao) values
  ('posvenda_reembolso', '', 'financas', 'Reembolso a pagar',
   'O atendimento pediu um reembolso de pós-venda ao Financeiro.'),
  ('posvenda_reembolso_pago', '', 'pessoal', 'Seu reembolso foi pago',
   'O Financeiro pagou o reembolso que a pessoa pediu: falta mandar o comprovante ao cliente.'),
  ('posvenda_reembolso_devolvido', '', 'pessoal', 'Seu reembolso voltou',
   'O Financeiro devolveu o pedido de reembolso para corrigir.')
on conflict (tipo, referencia) do nothing;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 4 — o atendente pede                                            ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
create or replace function public.carbo_posvenda_reembolso_solicitar(
  p_caso    uuid,
  p_passo   text,
  p_opcao   text,
  p_tipo    text,
  p_valor   numeric,
  p_forma   text,
  p_dados   text,
  p_nota    text,
  p_aguarda text,
  p_depois  text
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  c      public.carbo_posvenda_casos;
  v_id   uuid;
  v_ped  text;
begin
  if not coalesce((select public.carbo_e_time_interno()), false) then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  if p_tipo not in ('parcial', 'integral') then
    raise exception 'Tipo de reembolso inválido' using errcode = '22023';
  end if;
  if p_valor is null or p_valor <= 0 then
    raise exception 'Informe o valor do reembolso' using errcode = '22023';
  end if;
  if p_forma not in ('pix', 'estorno', 'transferencia') then
    raise exception 'Forma de reembolso inválida' using errcode = '22023';
  end if;
  if p_forma <> 'estorno' and nullif(btrim(p_dados), '') is null then
    raise exception 'Informe a chave Pix ou os dados bancários' using errcode = '22023';
  end if;
  if coalesce(p_aguarda, '') !~ '^[a-z0-9_]{1,60}$' or coalesce(p_depois, '') !~ '^[a-z0-9_]{1,60}$' then
    raise exception 'Passos do roteiro inválidos' using errcode = '22023';
  end if;

  select * into c from public.carbo_posvenda_casos where id = p_caso for update;
  if not found then
    raise exception 'Caso não encontrado' using errcode = 'P0002';
  end if;
  if c.status <> 'aberto' then
    raise exception 'Este caso já foi encerrado' using errcode = '55000';
  end if;
  if c.passo <> p_passo then
    raise exception 'Outra pessoa já respondeu este passo. Atualize a tela.' using errcode = '40001';
  end if;

  begin
    insert into public.carbo_posvenda_reembolsos
      (caso_id, bling_id, tipo, valor, forma, dados, nota, passo_volta, passo_aguarda, passo_depois, solicitado_por)
    values (c.id, c.bling_id, p_tipo, round(p_valor, 2), p_forma, nullif(btrim(p_dados), ''),
            nullif(btrim(p_nota), ''), c.passo, p_aguarda, p_depois, auth.uid())
    returning id into v_id;
  exception when unique_violation then
    raise exception 'Este caso já tem um reembolso esperando o Financeiro' using errcode = '23505';
  end;

  insert into public.carbo_posvenda_caso_hist
    (caso_id, acao, tipo, passo, opcao, proximo, valor, nota, campos, por)
  values (c.id, 'respondeu', c.tipo, c.passo, p_opcao, p_aguarda, round(p_valor, 2), nullif(btrim(p_nota), ''),
          jsonb_strip_nulls(jsonb_build_object(
            'forma', case p_forma when 'pix' then 'Pix' when 'estorno' then 'Estorno na plataforma'
                                  else 'Transferência bancária' end,
            'dados', nullif(btrim(p_dados), ''))),
          auth.uid());

  update public.carbo_posvenda_casos set
    passo = p_aguarda, valor = round(p_valor, 2),
    atualizado_por = auth.uid(), atualizado_em = now()
  where id = c.id;

  -- Aviso a quem tem o Finanças (o porteiro filtra pela aba "financas").
  select coalesce(e.pedido_codigo, e.pedido_numero, e.pedido_loja, c.bling_id::text) into v_ped
    from public.bling2_esteira e where e.bling_id = c.bling_id;
  begin
    insert into public.notifications (user_id, type, title, body, reference_type, reference_id, is_read)
    select p.id, 'posvenda_reembolso',
           '💸 Reembolso a pagar · ' || coalesce(v_ped, c.bling_id::text),
           'Reembolso ' || p_tipo || ' de ' || public.carbo_brl(round(p_valor, 2)),
           'posvenda_reembolso', v_id::text, false
      from public.profiles p
     where 'carbo_financas' = any (coalesce(p.allowed_interfaces, '{}'))
       and public.carbo_interface_e_interna(p.allowed_interfaces);
  exception when others then
    raise warning 'carbo_posvenda_reembolso_solicitar (aviso): %', sqlerrm;
  end;

  return v_id;
end $$;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 5 — o Financeiro paga (com comprovante) ou devolve              ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
create or replace function public.carbo_posvenda_reembolso_pagar(
  p_id          uuid,
  p_valor       numeric,
  p_pago_em     date,
  p_comprovante text,
  p_nota        text default null
)
returns void
language plpgsql security definer set search_path = public as $$
declare
  r     public.carbo_posvenda_reembolsos;
  c     public.carbo_posvenda_casos;
  v_ped text;
begin
  if not coalesce((select public.carbo_tem_app(array['carbo_financas'])), false) then
    raise exception 'Só o Financeiro confirma o pagamento' using errcode = '42501';
  end if;
  if p_valor is null or p_valor <= 0 then
    raise exception 'Informe o valor pago' using errcode = '22023';
  end if;
  if p_pago_em is null or p_pago_em > (now() at time zone 'America/Sao_Paulo')::date then
    raise exception 'Data do pagamento inválida' using errcode = '22023';
  end if;

  -- Caso primeiro, depois o pedido: a MESMA ordem do "voltar passo" (sem deadlock).
  select caso_id into r.caso_id from public.carbo_posvenda_reembolsos where id = p_id;
  if r.caso_id is null then
    raise exception 'Reembolso não encontrado' using errcode = 'P0002';
  end if;
  select * into c from public.carbo_posvenda_casos where id = r.caso_id for update;
  select * into r from public.carbo_posvenda_reembolsos where id = p_id for update;
  if r.status <> 'solicitado' then
    raise exception 'Este reembolso não está mais esperando pagamento (%)', r.status using errcode = '55000';
  end if;
  -- O comprovante tem de ter SUBIDO, e na pasta deste reembolso.
  if coalesce(p_comprovante, '') not like p_id::text || '/%'
     or not exists (select 1 from storage.objects o
                     where o.bucket_id = 'posvenda-comprovantes' and o.name = p_comprovante) then
    raise exception 'Anexe o comprovante do pagamento' using errcode = '22023';
  end if;
  if c.status <> 'aberto' or c.passo <> r.passo_aguarda then
    raise exception 'O caso deste reembolso mudou. Atualize a tela.' using errcode = '40001';
  end if;

  update public.carbo_posvenda_reembolsos set
    status = 'pago', pago_por = auth.uid(), pago_em = p_pago_em, pago_registrado_em = now(),
    valor_pago = round(p_valor, 2), comprovante_path = p_comprovante,
    nota_financeiro = nullif(btrim(p_nota), '')
  where id = r.id;

  insert into public.carbo_posvenda_caso_hist
    (caso_id, acao, tipo, passo, opcao, proximo, valor, nota, campos, por)
  values (c.id, 'respondeu', c.tipo, c.passo, 'pago_financeiro', r.passo_depois, round(p_valor, 2),
          nullif(btrim(p_nota), ''), jsonb_build_object('pago_em', to_char(p_pago_em, 'DD/MM/YYYY')), auth.uid());

  update public.carbo_posvenda_casos set
    passo = r.passo_depois, valor = round(p_valor, 2),
    atualizado_por = auth.uid(), atualizado_em = now()
  where id = c.id;

  select coalesce(e.pedido_codigo, e.pedido_numero, e.pedido_loja, c.bling_id::text) into v_ped
    from public.bling2_esteira e where e.bling_id = c.bling_id;
  begin
    insert into public.notifications (user_id, type, title, body, reference_type, reference_id, is_read)
    select r.solicitado_por, 'posvenda_reembolso_pago',
           '✅ Reembolso pago · ' || coalesce(v_ped, c.bling_id::text),
           public.carbo_brl(round(p_valor, 2)) || ' · envie o comprovante ao cliente',
           'posvenda_pedido', c.bling_id::text, false
     where r.solicitado_por is not null;
  exception when others then
    raise warning 'carbo_posvenda_reembolso_pagar (aviso): %', sqlerrm;
  end;
end $$;

-- Devolver: dado errado (chave Pix inválida, valor que não fecha). O passo de
-- pedir é DESFEITO (linha 'voltou') e o motivo fica anotado: o atendente corrige
-- e pede de novo.
create or replace function public.carbo_posvenda_reembolso_devolver(p_id uuid, p_motivo text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  r     public.carbo_posvenda_reembolsos;
  c     public.carbo_posvenda_casos;
  h     public.carbo_posvenda_caso_hist;
  v_ped text;
begin
  if not coalesce((select public.carbo_tem_app(array['carbo_financas'])), false) then
    raise exception 'Só o Financeiro devolve o pedido' using errcode = '42501';
  end if;
  if nullif(btrim(p_motivo), '') is null then
    raise exception 'Diga o motivo da devolução' using errcode = '22023';
  end if;

  select caso_id into r.caso_id from public.carbo_posvenda_reembolsos where id = p_id;
  if r.caso_id is null then
    raise exception 'Reembolso não encontrado' using errcode = 'P0002';
  end if;
  select * into c from public.carbo_posvenda_casos where id = r.caso_id for update;
  select * into r from public.carbo_posvenda_reembolsos where id = p_id for update;
  if r.status <> 'solicitado' then
    raise exception 'Este reembolso não está mais esperando pagamento (%)', r.status using errcode = '55000';
  end if;

  update public.carbo_posvenda_reembolsos set
    status = 'devolvido', devolvido_por = auth.uid(), devolvido_em = now(),
    motivo_devolucao = btrim(p_motivo)
  where id = r.id;

  if c.status = 'aberto' and c.passo = r.passo_aguarda then
    -- A resposta que pediu o reembolso (a última ainda valendo que levou ao aguarda).
    select * into h from public.carbo_posvenda_caso_hist x
     where x.caso_id = c.id and x.acao = 'respondeu' and x.proximo = r.passo_aguarda
       and not exists (select 1 from public.carbo_posvenda_caso_hist v
                        where v.caso_id = c.id and v.acao = 'voltou' and v.desfaz = x.id)
     order by x.id desc limit 1;
    if found then
      insert into public.carbo_posvenda_caso_hist (caso_id, acao, tipo, passo, desfaz, por)
      values (c.id, 'voltou', h.tipo, h.passo, h.id, auth.uid());
    end if;
    insert into public.carbo_posvenda_caso_hist (caso_id, acao, tipo, passo, nota, por)
    values (c.id, 'nota', c.tipo, r.passo_volta, 'Financeiro devolveu o reembolso: ' || btrim(p_motivo), auth.uid());
    update public.carbo_posvenda_casos set
      passo = r.passo_volta, valor = null,
      atualizado_por = auth.uid(), atualizado_em = now()
    where id = c.id;
  end if;

  select coalesce(e.pedido_codigo, e.pedido_numero, e.pedido_loja, c.bling_id::text) into v_ped
    from public.bling2_esteira e where e.bling_id = c.bling_id;
  begin
    insert into public.notifications (user_id, type, title, body, reference_type, reference_id, is_read)
    select r.solicitado_por, 'posvenda_reembolso_devolvido',
           '↩️ Reembolso devolvido · ' || coalesce(v_ped, c.bling_id::text),
           left(btrim(p_motivo), 200),
           'posvenda_pedido', c.bling_id::text, false
     where r.solicitado_por is not null;
  exception when others then
    raise warning 'carbo_posvenda_reembolso_devolver (aviso): %', sqlerrm;
  end;
end $$;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 6 — o caso respeita o reembolso em andamento                    ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- As três funções são as da 20261173, com UMA guarda a mais cada.

create or replace function public.carbo_posvenda_caso_responder(
  p_caso     uuid,
  p_passo    text,
  p_opcao    text,
  p_proximo  text    default null,
  p_desfecho text    default null,
  p_tipo     text    default null,
  p_nota     text    default null,
  p_campos   jsonb   default null,
  p_valor    numeric default null
)
returns void
language plpgsql security definer set search_path = public as $$
declare
  c public.carbo_posvenda_casos;
begin
  if not coalesce((select public.carbo_e_time_interno()), false) then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  if (p_proximo is null) = (p_desfecho is null) then
    raise exception 'Informe o próximo passo OU o desfecho' using errcode = '22023';
  end if;
  if p_tipo is not null and p_proximo is null then
    raise exception 'Trocar o tipo exige o primeiro passo do novo roteiro' using errcode = '22023';
  end if;

  select * into c from public.carbo_posvenda_casos where id = p_caso for update;
  if not found then
    raise exception 'Caso não encontrado' using errcode = 'P0002';
  end if;
  if c.status <> 'aberto' then
    raise exception 'Este caso já foi encerrado' using errcode = '55000';
  end if;
  if c.passo <> p_passo then
    raise exception 'Outra pessoa já respondeu este passo. Atualize a tela.' using errcode = '40001';
  end if;
  -- 20261175: com reembolso esperando o Financeiro, quem anda é o Financeiro.
  if exists (select 1 from public.carbo_posvenda_reembolsos r where r.caso_id = c.id and r.status = 'solicitado') then
    raise exception 'O reembolso deste caso está com o Financeiro' using errcode = '55000';
  end if;

  insert into public.carbo_posvenda_caso_hist
    (caso_id, acao, tipo, passo, opcao, proximo, desfecho, valor, nota, campos, por)
  values (c.id, case when p_tipo is not null then 'mudou_tipo' else 'respondeu' end,
          c.tipo, c.passo, p_opcao, p_proximo, p_desfecho, p_valor,
          nullif(btrim(p_nota), ''), nullif(p_campos, '{}'::jsonb), auth.uid());

  update public.carbo_posvenda_casos set
    tipo           = coalesce(p_tipo, tipo),
    passo          = coalesce(p_proximo, passo),
    status         = case when p_desfecho is not null then 'encerrado' else 'aberto' end,
    desfecho       = p_desfecho,
    valor          = coalesce(p_valor, valor),
    encerrado_em   = case when p_desfecho is not null then now() end,
    atualizado_por = auth.uid(),
    atualizado_em  = now()
  where id = c.id;
end $$;

create or replace function public.carbo_posvenda_caso_encerrar(p_caso uuid, p_desfecho text, p_nota text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  c public.carbo_posvenda_casos;
begin
  if not coalesce((select public.carbo_e_time_interno()), false) then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  if p_desfecho not in ('sem_retorno', 'cancelado', 'sem_solucao') then
    raise exception 'Desfecho inválido para encerrar fora do roteiro' using errcode = '22023';
  end if;
  select * into c from public.carbo_posvenda_casos where id = p_caso for update;
  if not found then
    raise exception 'Caso não encontrado' using errcode = 'P0002';
  end if;
  if c.status <> 'aberto' then
    raise exception 'Este caso já foi encerrado' using errcode = '55000';
  end if;
  -- 20261175: dinheiro pedido ou já pago não some num "cliente não respondeu".
  if exists (select 1 from public.carbo_posvenda_reembolsos r where r.caso_id = c.id and r.status = 'solicitado') then
    raise exception 'Há um reembolso esperando o Financeiro: volte o passo para cancelar o pedido' using errcode = '55000';
  end if;
  if exists (select 1 from public.carbo_posvenda_reembolsos r where r.caso_id = c.id and r.status = 'pago')
     and c.passo in (select r.passo_depois from public.carbo_posvenda_reembolsos r where r.caso_id = c.id and r.status = 'pago') then
    raise exception 'O Financeiro já pagou: encerre enviando o comprovante ao cliente' using errcode = '55000';
  end if;
  insert into public.carbo_posvenda_caso_hist (caso_id, acao, tipo, passo, desfecho, nota, por)
  values (c.id, 'encerrou', c.tipo, c.passo, p_desfecho, nullif(btrim(p_nota), ''), auth.uid());
  update public.carbo_posvenda_casos set
    status = 'encerrado', desfecho = p_desfecho, encerrado_em = now(),
    atualizado_por = auth.uid(), atualizado_em = now()
  where id = c.id;
end $$;

create or replace function public.carbo_posvenda_caso_voltar(p_caso uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  c public.carbo_posvenda_casos;
  h public.carbo_posvenda_caso_hist;
begin
  if not coalesce((select public.carbo_e_time_interno()), false) then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  select * into c from public.carbo_posvenda_casos where id = p_caso for update;
  if not found then
    raise exception 'Caso não encontrado' using errcode = 'P0002';
  end if;
  select * into h from public.carbo_posvenda_caso_hist x
   where x.caso_id = c.id and x.acao in ('respondeu', 'mudou_tipo', 'encerrou')
     and not exists (select 1 from public.carbo_posvenda_caso_hist v
                      where v.caso_id = c.id and v.acao = 'voltou' and v.desfaz = x.id)
   order by x.id desc limit 1;
  if not found then
    raise exception 'Não há passo para voltar' using errcode = '55000';
  end if;
  -- 20261175: o pagamento confirmado pelo Financeiro não se desfaz daqui.
  if h.opcao = 'pago_financeiro' then
    raise exception 'O Financeiro já pagou este reembolso: não dá para voltar antes do pagamento' using errcode = '55000';
  end if;
  begin
    update public.carbo_posvenda_casos set
      tipo = h.tipo, passo = h.passo, status = 'aberto', desfecho = null,
      valor = case when h.valor is not null then null else valor end,
      encerrado_em = null, atualizado_por = auth.uid(), atualizado_em = now()
    where id = c.id;
  exception when unique_violation then
    raise exception 'Este pedido já tem outro caso aberto' using errcode = '23505';
  end;
  insert into public.carbo_posvenda_caso_hist (caso_id, acao, tipo, passo, desfaz, por)
  values (c.id, 'voltou', h.tipo, h.passo, h.id, auth.uid());
  -- Voltou de "esperando o Financeiro": o pedido ainda não pago é CANCELADO.
  update public.carbo_posvenda_reembolsos set status = 'cancelado', cancelado_em = now()
   where caso_id = c.id and status = 'solicitado' and passo_aguarda <> h.passo;
end $$;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 7 — a fila do Financeiro                                        ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- jsonb, paginada (nunca `setof`: o teto de 1.000 do PostgREST vale para RPC).
create or replace function public.carbo_posvenda_reembolsos_lista(
  p_status text default 'solicitado',
  p_limite int  default 50,
  p_offset int  default 0
)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_itens jsonb;
  v_cont  jsonb;
  v_total int;
begin
  if not coalesce((select public.carbo_tem_app(array['carbo_financas'])), false) then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  if p_status is not null and p_status not in ('solicitado', 'pago', 'devolvido', 'cancelado') then
    raise exception 'Situação inválida' using errcode = '22023';
  end if;

  select coalesce(jsonb_object_agg(status, n), '{}'::jsonb) into v_cont
    from (select status, count(*) as n from public.carbo_posvenda_reembolsos group by 1) s;

  select count(*) into v_total from public.carbo_posvenda_reembolsos r
   where p_status is null or r.status = p_status;

  select coalesce(jsonb_agg(x.j order by x.ord_a, x.ord_b desc, x.id), '[]'::jsonb) into v_itens
    from (
      select r.id,
             -- Pendente: o mais antigo primeiro (fila). O resto: o mais novo primeiro.
             case when r.status = 'solicitado' then extract(epoch from r.solicitado_em) else 0 end as ord_a,
             greatest(r.solicitado_em, r.pago_registrado_em, r.devolvido_em, r.cancelado_em) as ord_b,
             jsonb_build_object(
               'id', r.id, 'caso_id', r.caso_id, 'bling_id', r.bling_id,
               'tipo', r.tipo, 'valor', r.valor, 'forma', r.forma, 'dados', r.dados, 'nota', r.nota,
               'status', r.status,
               'solicitado_em', r.solicitado_em, 'solicitado_por', nullif(btrim(ps.full_name), ''),
               'pago_em', r.pago_em, 'valor_pago', r.valor_pago, 'comprovante_path', r.comprovante_path,
               'nota_financeiro', r.nota_financeiro, 'pago_por', nullif(btrim(pp.full_name), ''),
               'pago_registrado_em', r.pago_registrado_em,
               'devolvido_em', r.devolvido_em, 'motivo_devolucao', r.motivo_devolucao,
               'devolvido_por', nullif(btrim(pd.full_name), ''),
               'cancelado_em', r.cancelado_em,
               'caso_tipo', k.tipo, 'caso_status', k.status, 'caso_desfecho', k.desfecho,
               'caso_encerrado_em', k.encerrado_em,
               'pedido_codigo', e.pedido_codigo, 'pedido_numero', e.pedido_numero,
               'pedido_loja', e.pedido_loja, 'canal', e.canal, 'data_pedido', e.data_pedido,
               'total', e.total, 'cliente', e.cliente, 'cliente_fone', e.cliente_fone,
               'nf_numero', e.nf_numero
             ) as j
        from public.carbo_posvenda_reembolsos r
        join public.carbo_posvenda_casos k on k.id = r.caso_id
        left join public.bling2_esteira e on e.bling_id = r.bling_id
        left join public.profiles ps on ps.id = r.solicitado_por
        left join public.profiles pp on pp.id = r.pago_por
        left join public.profiles pd on pd.id = r.devolvido_por
       where p_status is null or r.status = p_status
       order by case when r.status = 'solicitado' then r.solicitado_em end asc nulls last,
                greatest(r.solicitado_em, r.pago_registrado_em, r.devolvido_em, r.cancelado_em) desc, r.id
       limit greatest(1, least(coalesce(p_limite, 50), 200)) offset greatest(coalesce(p_offset, 0), 0)
    ) x;

  return jsonb_build_object('itens', v_itens, 'total', v_total, 'contagem', v_cont);
end $$;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 8 — permissões                                                  ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
revoke execute on function public.carbo_posvenda_reembolso_solicitar(uuid, text, text, text, numeric, text, text, text, text, text) from public, anon;
revoke execute on function public.carbo_posvenda_reembolso_pagar(uuid, numeric, date, text, text) from public, anon;
revoke execute on function public.carbo_posvenda_reembolso_devolver(uuid, text) from public, anon;
revoke execute on function public.carbo_posvenda_reembolsos_lista(text, int, int) from public, anon;
grant execute on function public.carbo_posvenda_reembolso_solicitar(uuid, text, text, text, numeric, text, text, text, text, text) to authenticated;
grant execute on function public.carbo_posvenda_reembolso_pagar(uuid, numeric, date, text, text) to authenticated;
grant execute on function public.carbo_posvenda_reembolso_devolver(uuid, text) to authenticated;
grant execute on function public.carbo_posvenda_reembolsos_lista(text, int, int) to authenticated;
revoke execute on function public.carbo_posvenda_caso_responder(uuid, text, text, text, text, text, text, jsonb, numeric) from public, anon;
revoke execute on function public.carbo_posvenda_caso_encerrar(uuid, text, text) from public, anon;
revoke execute on function public.carbo_posvenda_caso_voltar(uuid) from public, anon;
grant execute on function public.carbo_posvenda_caso_responder(uuid, text, text, text, text, text, text, jsonb, numeric) to authenticated;
grant execute on function public.carbo_posvenda_caso_encerrar(uuid, text, text) to authenticated;
grant execute on function public.carbo_posvenda_caso_voltar(uuid) to authenticated;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ Conferência que ABORTA                                                ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
do $$
declare
  f text;
begin
  foreach f in array array[
    'public.carbo_posvenda_reembolso_solicitar(uuid, text, text, text, numeric, text, text, text, text, text)',
    'public.carbo_posvenda_reembolso_pagar(uuid, numeric, date, text, text)',
    'public.carbo_posvenda_reembolso_devolver(uuid, text)',
    'public.carbo_posvenda_reembolsos_lista(text, int, int)',
    'public.carbo_posvenda_caso_responder(uuid, text, text, text, text, text, text, jsonb, numeric)',
    'public.carbo_posvenda_caso_encerrar(uuid, text, text)',
    'public.carbo_posvenda_caso_voltar(uuid)'
  ] loop
    if to_regprocedure(f) is null then
      raise exception 'ABORTADO: % não foi criada', f;
    end if;
    if has_function_privilege('anon', f, 'execute') then
      raise exception 'ABORTADO: anon executa %', f;
    end if;
  end loop;
  foreach f in array array['carbo_posvenda_caso_responder', 'carbo_posvenda_caso_encerrar', 'carbo_posvenda_caso_voltar',
                           'carbo_posvenda_reembolso_solicitar', 'carbo_posvenda_reembolso_pagar'] loop
    if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = f) <> 1 then
      raise exception 'ABORTADO: % ficou com mais de uma assinatura', f;
    end if;
  end loop;
  if not exists (select 1 from storage.buckets where id = 'posvenda-comprovantes' and not public) then
    raise exception 'ABORTADO: bucket posvenda-comprovantes não ficou privado';
  end if;
end $$;
