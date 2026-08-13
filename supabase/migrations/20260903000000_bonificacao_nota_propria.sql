-- ═══════════════════════════════════════════════════════════════════════════
-- Bonificação com nota própria — FUNDAÇÃO (Fase 2, parte 1 de 2)
--
-- A bonificação precisa de NF própria, com natureza "Remessa em bonificação,
-- doação ou brinde". Motivo fiscal, dado pelo dono do processo: numa nota de
-- natureza normal, desconto de 100% AINDA GERA IMPOSTO. A nota única não é só
-- imprecisa — ela custa dinheiro.
--
-- No Bling a natureza é propriedade do PEDIDO, não da nota. Duas naturezas
-- exigem DOIS pedidos. Um envio só, um frete só, duas notas.
--
-- ⚠️ Esta migração é INERTE: cria colunas, a guarda e a configuração. Quem
-- passa a emitir dois pedidos é a edge function `bling-sync` (parte 2), e ela
-- só funciona depois que a natureza for configurada no BLOCO 4.
--
-- ⚠️ RODE EM BLOCOS.
-- ═══════════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — as colunas da segunda nota                                  ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- ⚠️ Colunas SEPARADAS, e não uma segunda linha em `bling_nfe` apontando para
-- o mesmo pedido. O pedido já desnormaliza a NF (`bling_nf_id`,
-- `nf_access_key`, `invoice_number`) porque meia dúzia de telas leem dali, e
-- essas colunas são de valor ÚNICO: com duas notas casando no mesmo pedido, a
-- segunda a ser processada sobrescreveria a primeira, e qual delas fica
-- registrada dependeria da ordem em que o sync as encontrasse.
--
-- Pior: o Faturamento monta a fila com `bling_nf_id is null`. Assim que
-- QUALQUER uma das duas notas chegasse, o pedido sumiria da fila — mesmo com a
-- outra nunca emitida. Nota de bonificação perdida em silêncio.

set lock_timeout = '5s';

alter table public.carboze_orders
  add column if not exists bling_pedido_bonificacao_id  bigint,
  add column if not exists bling_nf_bonificacao_id      bigint,
  add column if not exists nf_bonificacao_access_key    text,
  add column if not exists invoice_bonificacao_number   text;

reset lock_timeout;

comment on column public.carboze_orders.bling_pedido_bonificacao_id is
  'Id do SEGUNDO pedido no Bling — o de natureza "Remessa em bonificação". Um envio, um frete, dois pedidos.';
comment on column public.carboze_orders.bling_nf_bonificacao_id is
  'NF da bonificação. Separada de bling_nf_id porque as duas casam no mesmo pedido e uma coluna só faria a segunda sobrescrever a primeira.';


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — o pedido de bonificação NÃO volta como pedido               ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- ⚠️ Sem isto, resolver a nota cria um problema pior do que o que resolve.
--
-- As duas pontes (Bling 1 e Bling 2) importam para `carboze_orders` todo
-- pedido faturado que ainda não exista. O segundo pedido — o de bonificação —
-- voltaria como uma LINHA NOVA: R$ 0,00, card próprio na esteira, no Rastreio
-- e na lista de Pedidos. Ninguém entenderia o que é, e ele entraria na
-- contagem de pedidos do mês.
--
-- A guarda fica AQUI, num gatilho sobre a tabela, e não no WHERE de cada
-- ponte: são duas funções (uma delas com 115 linhas), e duas cópias da mesma
-- regra é exatamente o que este repositório já pagou caro várias vezes. Uma
-- regra, os dois caminhos, e qualquer caminho futuro.
--
-- ⚠️ E não descarta em silêncio: registra o que ignorou. Linha que some sem
-- deixar rastro é o tipo de coisa que vira "sumiu um pedido" três meses depois.

create table if not exists public.carbo_remessas_bonificacao_ignoradas (
  id           uuid primary key default gen_random_uuid(),
  order_number text,
  external_ref text,
  total        numeric,
  observacao   text,
  ignorado_em  timestamptz not null default now()
);

alter table public.carbo_remessas_bonificacao_ignoradas enable row level security;

drop policy if exists "interno le remessas ignoradas" on public.carbo_remessas_bonificacao_ignoradas;
create policy "interno le remessas ignoradas"
  on public.carbo_remessas_bonificacao_ignoradas for select
  using (auth.role() = 'authenticated');

comment on table public.carbo_remessas_bonificacao_ignoradas is
  'Pedidos de remessa de bonificação que voltaram do Bling e NÃO foram importados como pedido. Existe para o descarte não ser silencioso.';

-- A marca é o sufixo -BON na observação, que a parte 2 escreve ao criar o
-- pedido. O regex do casamento de NF (V\d{10}|PED-\d{4}-\d{5}) acha o número
-- do pedido DENTRO de "V2026070015-BON" sem alteração nenhuma — por isso o
-- sufixo, e não um campo novo: o vínculo existente continua funcionando.
create or replace function public.carbo_bloqueia_remessa_bonificacao()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(new.notes, '') ~* '(V[0-9]{10}|PED-[0-9]{4}-[0-9]{5})-BON'
     or coalesce(new.order_number, '') ~* '-BON$' then
    insert into public.carbo_remessas_bonificacao_ignoradas
      (order_number, external_ref, total, observacao)
    values (new.order_number, new.external_ref, new.total, left(coalesce(new.notes,''), 500));
    return null;             -- descarta a linha: não vira pedido
  end if;
  return new;
end;
$$;

set lock_timeout = '5s';

drop trigger if exists trg_bloqueia_remessa_bonificacao on public.carboze_orders;
create trigger trg_bloqueia_remessa_bonificacao
  before insert on public.carboze_orders
  for each row execute function public.carbo_bloqueia_remessa_bonificacao();

reset lock_timeout;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 3 — a NF de bonificação vai para as colunas certas              ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- Quem casa NF com pedido é a edge function, mas ela grava por coluna fixa.
-- Esta função dá a ela um lugar único para decidir qual das duas preencher —
-- e mantém a regra no banco, perto das colunas que ela governa.

create or replace function public.carbo_vincula_nf(
  p_order_id uuid,
  p_nf_id bigint,
  p_chave text,
  p_numero text,
  p_eh_bonificacao boolean
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_eh_bonificacao then
    update public.carboze_orders
       set bling_nf_bonificacao_id    = p_nf_id,
           nf_bonificacao_access_key  = p_chave,
           invoice_bonificacao_number = p_numero
     where id = p_order_id;
  else
    update public.carboze_orders
       set bling_nf_id    = p_nf_id,
           nf_access_key  = p_chave,
           invoice_number = p_numero
     where id = p_order_id;
  end if;
end;
$$;

revoke all on function public.carbo_vincula_nf(uuid, bigint, text, text, boolean) from public, anon;
grant execute on function public.carbo_vincula_nf(uuid, bigint, text, text, boolean) to service_role;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 4 — a natureza da operação, configurável                        ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- ⚠️ Em tabela, não no código da função. Natureza de operação é cadastro do
-- Bling: o id é diferente em cada conta, e muda se o contador recadastrar.
-- Escrito na edge function, trocá-lo exigiria deploy — e quem sabe o número é
-- o financeiro, que não faz deploy.
--
-- ⚠️ FECHA quando não existe. Sem natureza configurada, a parte 2 RECUSA criar
-- o pedido de bonificação, com mensagem explícita. É a mesma regra do
-- CRON_SECRET: ausência de configuração fecha, nunca abre. Aqui abrir
-- significaria emitir a remessa com a natureza padrão — de novo com imposto,
-- que é exatamente o que este trabalho todo existe para evitar.

create table if not exists public.carbo_config_fiscal (
  chave      text primary key,
  valor      text,
  descricao  text,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

alter table public.carbo_config_fiscal enable row level security;

drop policy if exists "interno le config fiscal" on public.carbo_config_fiscal;
create policy "interno le config fiscal"
  on public.carbo_config_fiscal for select using (auth.role() = 'authenticated');

drop policy if exists "admin escreve config fiscal" on public.carbo_config_fiscal;
create policy "admin escreve config fiscal"
  on public.carbo_config_fiscal for all
  using (public.is_admin(auth.uid()) or public.is_ceo(auth.uid()))
  with check (public.is_admin(auth.uid()) or public.is_ceo(auth.uid()));

insert into public.carbo_config_fiscal (chave, valor, descricao)
values
  ('bling_natureza_bonificacao_id', null,
   'ID da natureza de operação "Remessa em bonificação, doação ou brinde" no Bling. Sem ele o sistema RECUSA criar o pedido de bonificação — emitir com a natureza padrão geraria imposto sobre o brinde.')
on conflict (chave) do nothing;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 5 — ⚠️ VOCÊ PRECISA PREENCHER ISTO                              ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- Pegue o id no Bling: Cadastros › Naturezas de operação › a de bonificação.
-- Enquanto for nulo, a emissão em dois pedidos fica recusando com mensagem
-- explícita — de propósito.
--
-- update public.carbo_config_fiscal
--    set valor = '<ID_AQUI>', updated_at = now()
--  where chave = 'bling_natureza_bonificacao_id';


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 6 — conferência                                                 ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- (a) As colunas existem?
select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'carboze_orders'
  and column_name in ('bling_pedido_bonificacao_id', 'bling_nf_bonificacao_id',
                      'nf_bonificacao_access_key', 'invoice_bonificacao_number');

-- (b) A natureza está configurada? Enquanto vier NULL, a parte 2 recusa.
select chave, coalesce(valor, '(NÃO CONFIGURADO)') as valor from public.carbo_config_fiscal;

-- (c) A guarda não pegou nada indevido? Tem de vir VAZIO enquanto a parte 2
--     não existir — nenhum pedido de bonificação foi criado ainda.
select * from public.carbo_remessas_bonificacao_ignoradas order by ignorado_em desc;
