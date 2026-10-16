-- =====================================================================
-- PRÉ-VENDAS: o gestor que VÊ o card também AGE nele (16/10/2026).
--
-- A `20261081` deu ao gestor do Pré-Vendas (`carbo_prevendas_gestor()` = a
-- flag "gestor" da função no Admin + o app) a LEITURA de todos os cards f14 e
-- f15. As AÇÕES sobre o card ficaram para trás: cada uma pergunta só a regra
-- antiga, `crm_is_gestor()` (head/command/ti). Um gerente marcado gestor no
-- Admin abria o card de um SDR e:
--   • a timeline vinha VAZIA (policy de crm_sales_lead_activities)
--   • fixar comentário não gravava (policy de UPDATE da mesma tabela)
--   • o histórico de responsáveis vinha vazio (crm_sales_lead_owner_log)
--   • transferir, arquivar, desarquivar, repassar, comentar pelo Admin e abrir
--     o card por LINK davam "sem permissão" (as RPCs)
--
-- E três furos do lado oposto, achados na mesma revisão:
--   • `crm_lead_detalhe` (abrir por link) ainda tinha a FILA aberta do repasse
--     para QUALQUER logado — a `20261082` a fechou nas policies e não aqui: o
--     SDR abria pelo link o repasse de um colega ainda sem closer;
--   • `crm_sales_lead_pegar` não olhava papel: o SDR pegava o PRÓPRIO repasse
--     no f15 e virava o closer dele. No desenho do dono do processo quem pega
--     o card do closer é o GESTOR;
--   • a busca de /vendas prometia "cidade, IE, telefone, CEP, e-mail" e o
--     banco só procurava número do pedido, nome e CNPJ.
--
-- ⚠️ E um quarto, que o teste local expôs e que vale para o Sales também:
-- `crm_lead_detalhe` e `crm_lead_comentar` guardam com
--   if not ( crm_is_gestor() or created_by = eu or assigned_to = eu … ) then
-- Card SEM responsável tem `assigned_to` nulo, a comparação dá NULL, e
-- `not (false or NULL)` é NULL — o `if` não dispara e a função LIBERA. Ou seja,
-- qualquer interno com o link abria (e comentava) card sem dono de qualquer
-- pessoa. A guarda vira `if not coalesce((…), false)`: ausência FECHA.
--
-- A regra nova, num lugar só: `carbo_prevendas_gestor_do_lead(p_lead)` =
-- gestor do Pré-Vendas E o card é f14/f15. É SOMADA (OR) ao `crm_is_gestor()`
-- de cada ação — ninguém perde nada, e no Sales nada muda (o card de lá não é
-- f14/f15).
--
-- ⚠️ O texto das funções é trocado a partir do BANCO (pg_get_functiondef),
-- nunca da migração que as criou, e cada troca ABORTA se o trecho esperado não
-- aparecer exatamente UMA vez. O antes vai para carbo_backup_funcoes /
-- carbo_backup_policies. Rodar de novo não duplica nada.
-- =====================================================================

-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 0 (a) — as regras vivas da timeline e do histórico (leitura) ║
-- ╚═══════════════════════════════════════════════════════════════════╝
-- ESPERADO: crm_sales_lead_activities com SELECT e UPDATE lendo
-- `crm_is_gestor()` dentro de um EXISTS em crm_sales_leads, e um INSERT
-- (created_by = eu); crm_sales_lead_owner_log com um SELECT `crm_is_gestor() or
-- exists(...)`. Se aparecer regra de SELECT aberta (true, carbo_e_time_interno())
-- nessas tabelas, me mande ANTES do BLOCO 1: aí a timeline já abriria para todos.
select tablename as tabela, policyname as regra, cmd as operacao, qual as quem_le, with_check as quem_grava
from pg_policies
where schemaname = 'public'
  and tablename in ('crm_sales_lead_activities', 'crm_sales_lead_owner_log')
order by 1, 3, 2;

-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 0 (b) — os trechos que vão ser trocados existem? (leitura)   ║
-- ╚═══════════════════════════════════════════════════════════════════╝
-- ESPERADO: 14 linhas, todas com ok = true. Linha com achados = 0 e
-- ja_trocada = true também serve (já rodou antes). Qualquer outra coisa:
-- me mande a saída ANTES do BLOCO 1 — o BLOCO 1 abortaria inteiro.
select t.funcao, t.troca,
       (length(x.d) - length(replace(x.d, t.de, ''))) / length(t.de) as achados,
       position(t.por in x.d) > 0                                     as ja_trocada,
       (length(x.d) - length(replace(x.d, t.de, ''))) / length(t.de) = 1
         or position(t.por in x.d) > 0                                as ok
from (values
  ('public.crm_sales_lead_transfer(uuid,uuid)',  'gestor',    'public.crm_is_gestor()', 'carbo_prevendas_gestor_do_lead'),
  ('public.crm_sales_lead_arquivar(uuid,text)',  'gestor',    'public.crm_is_gestor()', 'carbo_prevendas_gestor_do_lead'),
  ('public.crm_sales_lead_desarquivar(uuid)',    'gestor',    'public.crm_is_gestor()', 'carbo_prevendas_gestor_do_lead'),
  ('public.crm_sales_lead_repassar(uuid,text)',  'gestor',    'public.crm_is_gestor()', 'carbo_prevendas_gestor_do_lead'),
  ('public.crm_lead_detalhe(uuid)',              'gestor',    'public.crm_is_gestor()', 'carbo_prevendas_gestor_do_lead'),
  ('public.crm_lead_comentar(uuid,text)',        'gestor',    'public.crm_is_gestor()', 'carbo_prevendas_gestor_do_lead'),
  ('public.crm_lead_detalhe(uuid)',              'fila f15',
     $q$(v_lead.origin_lead_id is not null and v_lead.assigned_to is null)$q$, $q$v_lead.funnel_type <> 'f15'$q$),
  ('public.crm_lead_detalhe(uuid)',              'nulo fecha (1)',   'if not (', 'if not coalesce(('),
  ('public.crm_lead_detalhe(uuid)',              'nulo fecha (2)',   '  ) then', '), false) then'),
  ('public.crm_lead_comentar(uuid,text)',        'nulo fecha (1)',   'if not (', 'if not coalesce(('),
  ('public.crm_lead_comentar(uuid,text)',        'nulo fecha (2)',   '  ) then', '), false) then'),
  ('public.crm_sales_lead_pegar(uuid)',          'só gestor no f15', 'if v_dono is not null then', 'quem pega o card do closer'),
  ('public.carbo_prevendas_vendas(date,date,text)', 'busca: texto',
     $q$or v.customer_name ilike '%' || v_busca || '%'$q$, 'v.delivery_city ilike'),
  ('public.carbo_prevendas_vendas(date,date,text)', 'busca: números',
     $q$'\D', '', 'g') like '%' || v_digitos || '%')$q$, 'v.delivery_zip')
) t(funcao, troca, de, por)
cross join lateral (select pg_get_functiondef(t.funcao::regprocedure) as d) x
order by 1, 2;

-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — a regra e as trocas                                      ║
-- ╚═══════════════════════════════════════════════════════════════════╝
create or replace function public.carbo_prevendas_gestor_do_lead(p_lead uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  -- SECURITY DEFINER para enxergar o card ARQUIVADO (a policy de SELECT o
  -- esconde de todos) — desarquivar e abrir arquivado por link dependem disso.
  -- coalesce: NULL aqui viraria `not (false or NULL)` nas guardas, e NULL
  -- num `if` LIBERA. Ausência fecha.
  select coalesce(public.carbo_prevendas_gestor()
     and exists (select 1 from public.crm_sales_leads
                  where id = p_lead and funnel_type in ('f14', 'f15')), false);
$$;
grant execute on function public.carbo_prevendas_gestor_do_lead(uuid) to authenticated, service_role;
revoke execute on function public.carbo_prevendas_gestor_do_lead(uuid) from anon, public;

do $$
declare
  r record; v_def text; v_buf text; v_atual text; v_n int := 0;
  v_g  constant text := 'public.crm_is_gestor()';
  v_gp constant text := '(public.crm_is_gestor() or public.carbo_prevendas_gestor_do_lead(p_lead))';
begin
  -- 1) as funções. Todas as trocas de UMA função são aplicadas no texto e ela é
  --    executada UMA vez: executar a cada troca deixaria o `if not coalesce((`
  --    sem o `), false)` que o fecha, e o create falharia no meio.
  for r in
    select * from (values
      (1,  'public.crm_sales_lead_transfer(uuid,uuid)', v_g, v_gp),
      (2,  'public.crm_sales_lead_arquivar(uuid,text)', v_g, v_gp),
      (3,  'public.crm_sales_lead_desarquivar(uuid)',   v_g, v_gp),
      (4,  'public.crm_sales_lead_repassar(uuid,text)', v_g, v_gp),
      (5,  'public.crm_lead_detalhe(uuid)',             v_g, v_gp),
      (6,  'public.crm_lead_comentar(uuid,text)',       v_g, v_gp),
      -- a fila aberta do repasse deixa de valer para o f15 (como na 20261082)
      (7,  'public.crm_lead_detalhe(uuid)',
           $q$(v_lead.origin_lead_id is not null and v_lead.assigned_to is null)$q$,
           $q$(v_lead.origin_lead_id is not null and v_lead.assigned_to is null and v_lead.funnel_type <> 'f15')$q$),
      -- comparação com NULL não pode liberar (card sem responsável)
      (11, 'public.crm_lead_detalhe(uuid)',       'if not (', 'if not coalesce(('),
      (12, 'public.crm_lead_detalhe(uuid)',       '  ) then', '  ), false) then'),
      (13, 'public.crm_lead_comentar(uuid,text)', 'if not (', 'if not coalesce(('),
      (14, 'public.crm_lead_comentar(uuid,text)', '  ) then', '  ), false) then'),
      -- no f15 só o gestor pega
      (8,  'public.crm_sales_lead_pegar(uuid)',
           'if v_dono is not null then',
           $q$-- No Pré-Vendas quem pega o card do closer (f15) é o GESTOR; o SDR
  -- que repassou acompanha, mas não assume (20261093).
  if (select funnel_type from public.crm_sales_leads where id = p_lead) = 'f15'
     and not coalesce(public.crm_is_gestor() or public.carbo_prevendas_gestor(), false) then
    raise exception 'No Pré-Vendas, quem pega o card do closer é o gestor.';
  end if;
  if v_dono is not null then$q$),
      -- a busca de /vendas: cidade, e-mail, IE (texto)…
      (9,  'public.carbo_prevendas_vendas(date,date,text)',
           $q$or v.customer_name ilike '%' || v_busca || '%'$q$,
           $q$or v.customer_name ilike '%' || v_busca || '%'
           or v.delivery_city ilike '%' || v_busca || '%'
           or v.customer_email ilike '%' || v_busca || '%'
           or v.customer_ie ilike '%' || v_busca || '%'$q$),
      -- …e telefone, CEP e IE (números, 3+ dígitos, como a busca do Sales)
      (10, 'public.carbo_prevendas_vendas(date,date,text)',
           $q$'\D', '', 'g') like '%' || v_digitos || '%')$q$,
           $q$'\D', '', 'g') like '%' || v_digitos || '%'
           or (length(v_digitos) >= 3 and (
                regexp_replace(coalesce(v.customer_phone, ''), '\D', '', 'g') like '%' || v_digitos || '%'
             or regexp_replace(coalesce(v.delivery_zip, ''),   '\D', '', 'g') like '%' || v_digitos || '%'
             or regexp_replace(coalesce(v.customer_ie, ''),    '\D', '', 'g') like '%' || v_digitos || '%')))$q$)
    ) t(ordem, funcao, de, por)
    union all select 99, null, null, null   -- sentinela: fecha a última função
    order by 2 nulls last, 1
  loop
    if v_atual is distinct from r.funcao then
      -- terminou a função anterior: grava o antes e executa o texto novo
      if v_atual is not null and v_buf <> v_def then
        insert into public.carbo_backup_funcoes(funcao, definicao) values (v_atual, v_def);
        execute v_buf;   -- create or replace, MESMA assinatura: os grants ficam
      end if;
      exit when r.funcao is null;
      v_atual := r.funcao;
      v_def   := pg_get_functiondef(r.funcao::regprocedure);
      v_buf   := v_def;
    end if;
    if position(r.por in v_buf) > 0 then
      continue;  -- já trocada (rodar de novo não duplica)
    end if;
    if (length(v_buf) - length(replace(v_buf, r.de, ''))) / length(r.de) <> 1 then
      raise exception 'Troca % (%): o trecho esperado não aparece exatamente UMA vez no texto vivo. Me mande o BLOCO 0 (b). Nada foi alterado.', r.ordem, r.funcao;
    end if;
    v_buf := replace(v_buf, r.de, r.por);
    v_n := v_n + 1;
  end loop;

  -- 2) timeline (ler e fixar) e histórico de responsáveis — só f14/f15
  for r in
    select * from pg_policies
     where schemaname = 'public'
       and ((tablename = 'crm_sales_lead_activities' and cmd in ('SELECT', 'UPDATE'))
         or (tablename = 'crm_sales_lead_owner_log'  and cmd = 'SELECT'))
       and coalesce(qual, '') like '%crm_is_gestor()%'
       and coalesce(qual, '') not like '%carbo_prevendas_gestor%'
  loop
    insert into public.carbo_backup_policies(tabela, regra, operacao, papeis, quem_le, quem_grava)
    values (r.tablename, r.policyname, r.cmd, r.roles::text, r.qual, r.with_check);
    execute format(
      'alter policy %I on public.%I using ((%s) or ((select public.carbo_prevendas_gestor()) and exists ('
      || 'select 1 from public.crm_sales_leads l where l.id = %I.lead_id and l.funnel_type in (''f14'', ''f15''))))',
      r.policyname, r.tablename, r.qual, r.tablename);
    v_n := v_n + 1;
  end loop;

  raise notice 'trocas feitas: % (esperado 17 = 14 nas funções + 3 regras)', v_n;
end $$;

notify pgrst, 'reload schema';

-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ CONFERÊNCIA                                                        ║
-- ╚═══════════════════════════════════════════════════════════════════╝
-- ESPERADO: acoes = 6 · detalhe_sem_fila_f15 = true · nulo_fecha = 2 · pegar_so_gestor = true ·
-- busca_nova = true · regras = 3 · anon_executa = false.
-- ⚠️ Chamar as funções no SQL Editor recusa por permissão — ele roda sem
-- usuário (auth.uid() nulo). Isso está certo; o teste de verdade é pela tela.
select
  (select count(*) from pg_proc
    where pronamespace = 'public'::regnamespace
      and proname in ('crm_sales_lead_transfer', 'crm_sales_lead_arquivar', 'crm_sales_lead_desarquivar',
                      'crm_sales_lead_repassar', 'crm_lead_detalhe', 'crm_lead_comentar')
      and pg_get_functiondef(oid) like '%carbo_prevendas_gestor_do_lead(p_lead)%')               as acoes,
  position($q$v_lead.funnel_type <> 'f15'$q$
           in pg_get_functiondef('public.crm_lead_detalhe(uuid)'::regprocedure)) > 0              as detalhe_sem_fila_f15,
  (select count(*) from pg_proc
    where pronamespace = 'public'::regnamespace
      and proname in ('crm_lead_detalhe', 'crm_lead_comentar')
      and pg_get_functiondef(oid) like '%if not coalesce((%), false) then%')                     as nulo_fecha,
  position('quem pega o card do closer'
           in pg_get_functiondef('public.crm_sales_lead_pegar(uuid)'::regprocedure)) > 0          as pegar_so_gestor,
  position('v.delivery_zip'
           in pg_get_functiondef('public.carbo_prevendas_vendas(date,date,text)'::regprocedure)) > 0 as busca_nova,
  (select count(*) from pg_policies
    where schemaname = 'public'
      and tablename in ('crm_sales_lead_activities', 'crm_sales_lead_owner_log')
      and qual like '%carbo_prevendas_gestor()%')                                               as regras,
  has_function_privilege('anon', 'public.carbo_prevendas_gestor_do_lead(uuid)', 'execute')     as anon_executa;
