-- ═══════════════════════════════════════════════════════════════════════════
-- Autoaprovação de requisição — por lista explícita, nunca por cargo
--
-- ── O que estava travando ────────────────────────────────────────────────
--
-- O `fin_rc_guarda` recusa aprovar quando quem decide é quem PEDIU ou quem
-- REGISTROU a RC. A trava faz sentido, mas pegava quem não devia: o time
-- lança a requisição EM NOME do gestor, ele vira `requested_by` sem ter
-- tocado na tela, e perde o direito de decidir. Medido em 03/11/2026: das 14
-- RCs paradas em `aguardando_aprovacao`, SETE tinham o mesmo gestor como
-- solicitante — e ele não registrou nenhuma delas.
--
-- ── Por que uma LISTA, e não `is_ceo()` ──────────────────────────────────
--
-- A decisão foi "o CEO aprova a própria". O caminho óbvio seria pendurar a
-- exceção em `public.is_ceo()` — e seria errado. Aquela função NÃO quer dizer
-- CEO:
--
--     funcao in ('ceo','head') OR department = 'command' OR is_ti_head()
--
-- Medido no mesmo dia, ela devolve verdadeiro para OITO pessoas: todos os
-- heads de departamento mais o time do `command`. `is_admin()` devolve NOVE.
-- Pendurar autoaprovação ali daria a oito pessoas um poder que foi concedido
-- a uma — e ninguém perceberia, porque o nome da função diz outra coisa.
--
-- ⚠️ É por isso que a permissão mora numa TABELA de uma linha por pessoa, com
-- motivo escrito. Quem pode autoaprovar passa a ser uma pergunta com resposta
-- exata ("select * from fin_compras_autoaprovacao"), em vez de uma dedução a
-- partir de três predicados que mudam por outros motivos. É o mesmo formato
-- da `fin_compras_alcada`, que já mora neste módulo.
--
-- ── O que esta migração NÃO faz ──────────────────────────────────────────
--
-- NÃO cria teto por valor. Seria a coisa natural a adicionar, e hoje seria
-- um controle de mentira: `estimated_value` é ZERO em 10 das 14 RCs abertas
-- (o número que vale aparece depois, nas cotações). Um teto de R$ 500 lido
-- contra um estimado zerado deixa passar a compra de R$ 10.000 parecendo que
-- protegeu. Teto entra quando for lido contra o valor COTADO — aí é outro
-- trabalho, e honesto.
--
-- NÃO afrouxa nada para mais ninguém. Quem não estiver na tabela continua
-- sob a regra inteira, inclusive os outros heads.
--
-- ⚠️ RODE EM BLOCOS.
-- ═══════════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — a tabela                                                    ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

create table if not exists public.fin_compras_autoaprovacao (
  user_id    uuid primary key references public.profiles(id) on delete cascade,
  -- ⚠️ Obrigatório e sem default: a próxima pessoa que abrir esta tabela tem
  -- de encontrar POR QUE cada linha existe. Permissão sem motivo escrito vira
  -- permissão que ninguém ousa remover.
  motivo     text not null,
  ativo      boolean not null default true,
  criado_em  timestamptz not null default now(),
  criado_por uuid references public.profiles(id)
);

comment on table public.fin_compras_autoaprovacao is
  'Quem pode aprovar a PROPRIA requisicao de compra. Lista explicita, uma linha '
  'por pessoa, com motivo. Nao use is_ceo()/is_admin() para isto: as duas valem '
  'para todos os heads. Leitura pelo time interno; escrita so por SQL.';

alter table public.fin_compras_autoaprovacao enable row level security;

-- Mesma política da `fin_compras_alcada`: o time interno LÊ (a tela precisa
-- saber se habilita o botão) e ninguém ESCREVE pelo app. Conceder a si mesmo
-- o direito de autoaprovar não pode ser um clique.
drop policy if exists fin_compras_autoaprovacao_le on public.fin_compras_autoaprovacao;
create policy fin_compras_autoaprovacao_le
  on public.fin_compras_autoaprovacao
  for select to authenticated
  using ((select public.carbo_e_time_interno()));


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — a pergunta, em um lugar só                                  ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
--
-- ⚠️ `security definer`: a tela chama isto para o PRÓPRIO usuário e o trigger
-- chama para quem está decidindo. Uma função só, para que a tela nunca
-- habilite um botão que o banco vai recusar — foi assim que a trava anterior
-- acabou documentada no código como se morasse só na tela.

create or replace function public.fin_pode_autoaprovar(p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $fn$
  select exists (
    select 1 from public.fin_compras_autoaprovacao a
    where a.user_id = p_uid and a.ativo
  );
$fn$;

comment on function public.fin_pode_autoaprovar(uuid) is
  'True quando a pessoa esta na lista de autoaprovacao de compras. '
  'Fonte unica: a tela e o gatilho fin_rc_guarda perguntam a MESMA coisa.';

grant execute on function public.fin_pode_autoaprovar(uuid) to authenticated;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 3 — o gatilho passa a consultar a lista                         ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
--
-- ⚠️ A função vai INTEIRA, não um trecho. O resto do corpo é idêntico ao que
-- está em produção — transições de status, trava de itens depois de aprovada,
-- alçada por valor, carimbo de `approved_by`. Mudou UMA condição, a de
-- autoaprovação.

create or replace function public.fin_rc_guarda()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  de text := old.status::text;
  pa text := new.status::text;
begin
  if v_uid is null then return new; end if;

  if de in ('aprovada','convertida','rejeitada','cancelada')
     and (new.items is distinct from old.items or new.estimated_value is distinct from old.estimated_value) then
    raise exception 'A requisição % já foi %: itens e valor não mudam mais.', old.rc_number, de using errcode = '42501';
  end if;

  if pa is not distinct from de then return new; end if;

  if not (
       (de = 'rascunho'             and pa in ('aguardando_aprovacao','cancelada'))
    or (de = 'aguardando_aprovacao' and pa in ('aprovada','rejeitada','cancelada'))
    or (de = 'rejeitada'            and pa in ('cancelada'))
    or (de = 'aprovada'             and pa in ('convertida','cancelada'))
  ) then
    raise exception 'Requisição %: não dá para ir de "%" para "%".', old.rc_number, de, pa using errcode = '42501';
  end if;

  if pa in ('aprovada','rejeitada') or (de = 'aprovada' and pa = 'cancelada') then
    -- ⭐ A ÚNICA mudança desta migração: quem está na lista de autoaprovação
    --    passa por aqui. Para todos os outros a regra é a de sempre.
    if (v_uid = old.requested_by or v_uid = old.created_by)
       and not public.fin_pode_autoaprovar(v_uid) then
      raise exception 'Quem pediu (ou registrou) a requisição % não pode aprová-la nem rejeitá-la.', old.rc_number using errcode = '42501';
    end if;
    if not public.fin_pode_aprovar_compra(v_uid, old.estimated_value) then
      raise exception 'A alçada da requisição % (R$ %) não permite que você a decida.', old.rc_number, old.estimated_value using errcode = '42501';
    end if;
    if pa in ('aprovada','rejeitada') then
      new.approved_by := v_uid;
      new.approved_at := now();
    end if;
  end if;

  if pa = 'aguardando_aprovacao' then new.submitted_at := coalesce(new.submitted_at, now()); end if;

  if pa = 'convertida' and not public.fin_compras_via_funcao() then
    raise exception 'A requisição % vira "convertida" só ao gerar a(s) OC(s).', old.rc_number using errcode = '42501';
  end if;
  return new;
end $function$;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 4 — quem entra na lista hoje                                    ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
--
-- UMA pessoa: o diretor que acumula Head de Operações, decisão dele mesmo em
-- 03/11/2026. ⚠️ A pessoa de `funcao = 'ceo'` NÃO entra — quem pediu a
-- exceção foi quem estava travado, e permissão não se concede "de brinde" a
-- quem não pediu. Para incluir outra pessoa é um INSERT com motivo escrito.

insert into public.fin_compras_autoaprovacao (user_id, motivo)
select p.id,
       'Diretor e Head de Operacoes: o time lanca RC em nome dele, o que o tornava '
       'solicitante sem ter registrado nada e travava a propria aprovacao. '
       'Concedido em 03/11/2026, por decisao dele.'
from public.profiles p
where p.department::text = 'ops' and p.funcao::text = 'head'
on conflict (user_id) do nothing;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 5 — conferência                                                 ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- Quem pode autoaprovar — tem de ser UMA linha.
select p.full_name, p.department::text as dep, p.funcao::text as fn, a.ativo, a.motivo
from public.fin_compras_autoaprovacao a
join public.profiles p on p.id = a.user_id
order by 1;

-- As RCs que destravam: paradas, do solicitante que agora pode decidir.
select r.rc_number, r.status, r.estimated_value,
       coalesce(r.items->0->>'descricao', '(sem item)') as item
from public.purchase_requests r
join public.fin_compras_autoaprovacao a on a.user_id = r.requested_by and a.ativo
where r.status = 'aguardando_aprovacao'
order by r.rc_number;

-- ⚠️ Ninguém MAIS pode: tem de vir ZERO linhas.
select p.full_name
from public.profiles p
where public.fin_pode_autoaprovar(p.id)
  and p.id not in (select user_id from public.fin_compras_autoaprovacao where ativo);
