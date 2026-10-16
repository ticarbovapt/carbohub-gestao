-- =====================================================================
-- PRÉ-VENDAS: o card do CLOSER (f15) só o closer e o gestor ALTERAM (16/10/2026).
--
-- O repasse cria o card do f15 com `created_by` = o SDR (é assim que ele
-- acompanha o próprio repasse — 20261082). E `created_by = eu` é exatamente o
-- que as regras de escrita perguntam. Resultado: pela API, o SDR que repassou
-- podia mover a etapa, editar campos, arquivar, apagar e até repassar de novo
-- o card do closer. A tela não oferecia isso; o banco deixava.
--
-- A trava, sem mexer no que existe:
--   • policy RESTRITIVA de UPDATE e DELETE em crm_sales_leads: no f15 só passa
--     o responsável (assigned_to = eu), o gestor antigo (crm_is_gestor) ou o
--     gestor do Pré-Vendas (carbo_prevendas_gestor). Restritiva soma com E às
--     regras de hoje, então ela só TIRA — nenhuma porta abre. Fora do f15 ela
--     devolve true e o Sales não sente nada.
--   • as RPCs SECURITY DEFINER passam por cima da RLS, então as duas que
--     aceitavam `created_by = eu` aprendem o f15: arquivar e repassar.
--     (transferir, desarquivar e pegar já exigem gestor no f15 — 20261093.)
--
-- ⚠️ Comentar NÃO é travado: é conversa no card, não alteração dele, e o
-- gestor/closer pode querer ouvir o SDR ali.
-- ⚠️ O texto das RPCs é trocado a partir do BANCO, com backup e trava que
-- aborta se o trecho não aparecer exatamente UMA vez.
-- =====================================================================

-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 0 (a) — as regras de escrita vivas dos cards (só leitura)    ║
-- ╚═══════════════════════════════════════════════════════════════════╝
-- ESPERADO: UPDATE e DELETE, todas `permissive = PERMISSIVE`, nenhuma com
-- `f15_so_closer` no nome. Se já houver regra RESTRITIVA aqui, me mande antes.
select policyname as regra, cmd as operacao, permissive, roles::text as papeis,
       qual as quem_le, with_check as quem_grava
from pg_policies
where schemaname = 'public' and tablename = 'crm_sales_leads' and cmd in ('UPDATE', 'DELETE', 'ALL')
order by cmd, policyname;

-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 0 (b) — quem PERDE a escrita no f15 (só leitura)             ║
-- ╚═══════════════════════════════════════════════════════════════════╝
-- Uma linha por pessoa que criou ou é responsável por card do f15.
-- `perde_escrita` = cards que ela CRIOU, não é responsável e não é gestora —
-- ESPERADO: só SDRs (o repasse). Se aparecer alguém que TRABALHA como closer
-- com perde_escrita > 0, me mande antes: ele ficaria só olhando.
select p.full_name,
       public.carbo_is_gestor(p.id) or public.has_role(p.id, 'admin'::app_role) as gestor,
       count(*) filter (where l.created_by = p.id)                                as criou,
       count(*) filter (where l.assigned_to = p.id)                               as responsavel,
       count(*) filter (where l.created_by = p.id and l.assigned_to is distinct from p.id
                          and not (public.carbo_is_gestor(p.id)
                                   or public.has_role(p.id, 'admin'::app_role))) as perde_escrita
from public.crm_sales_leads l
join public.profiles p on p.id in (l.created_by, l.assigned_to)
where l.funnel_type = 'f15' and l.deleted_at is null
group by p.id, p.full_name
order by perde_escrita desc, p.full_name;

-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 0 (c) — os trechos das RPCs existem? (só leitura)            ║
-- ╚═══════════════════════════════════════════════════════════════════╝
-- ESPERADO: 2 linhas com ok = true (achados = 1, ou ja_trocada = true se
-- já rodou). Qualquer false: me mande antes — o BLOCO 1 abortaria inteiro.
select t.funcao,
       (length(x.d) - length(replace(x.d, t.de, ''))) / length(t.de) as achados,
       position(t.por in x.d) > 0                                     as ja_trocada,
       (length(x.d) - length(replace(x.d, t.de, ''))) / length(t.de) = 1
         or position(t.por in x.d) > 0                                as ok
from (values
  ('public.crm_sales_lead_arquivar(uuid,text)', 'created_by = auth.uid() or',
     $q$funnel_type is distinct from 'f15'$q$),
  ('public.crm_sales_lead_repassar(uuid,text)', 'created_by = auth.uid() or assigned_to = auth.uid()',
     $q$funnel_type is distinct from 'f15'$q$)
) t(funcao, de, por)
cross join lateral (select pg_get_functiondef(t.funcao::regprocedure) as d) x
order by 1;

-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — a trava                                                  ║
-- ╚═══════════════════════════════════════════════════════════════════╝
-- 1) a tabela: no f15, alterar e apagar só o responsável ou o gestor
drop policy if exists crm_sales_leads_f15_so_closer_altera on public.crm_sales_leads;
create policy crm_sales_leads_f15_so_closer_altera on public.crm_sales_leads
  as restrictive for update to authenticated
  using (
    funnel_type is distinct from 'f15'
    or assigned_to = (select auth.uid())
    or coalesce((select public.crm_is_gestor()), false)
    or coalesce((select public.carbo_prevendas_gestor()), false)
  )
  with check (
    funnel_type is distinct from 'f15'
    or assigned_to = (select auth.uid())
    or coalesce((select public.crm_is_gestor()), false)
    or coalesce((select public.carbo_prevendas_gestor()), false)
  );

drop policy if exists crm_sales_leads_f15_so_closer_apaga on public.crm_sales_leads;
create policy crm_sales_leads_f15_so_closer_apaga on public.crm_sales_leads
  as restrictive for delete to authenticated
  using (
    funnel_type is distinct from 'f15'
    or assigned_to = (select auth.uid())
    or coalesce((select public.crm_is_gestor()), false)
    or coalesce((select public.carbo_prevendas_gestor()), false)
  );

-- 2) as RPCs que passam por cima da RLS: "criei" deixa de valer no f15
do $$
declare
  r record; v_def text; v_n int := 0;
begin
  for r in
    select * from (values
      (1, 'public.crm_sales_lead_arquivar(uuid,text)',
          'created_by = auth.uid() or',
          $q$(created_by = auth.uid() and funnel_type is distinct from 'f15') or$q$),
      (2, 'public.crm_sales_lead_repassar(uuid,text)',
          'created_by = auth.uid() or assigned_to = auth.uid()',
          $q$(created_by = auth.uid() and funnel_type is distinct from 'f15') or assigned_to = auth.uid()$q$)
    ) t(ordem, funcao, de, por)
    order by ordem
  loop
    v_def := pg_get_functiondef(r.funcao::regprocedure);
    if position(r.por in v_def) > 0 then
      continue;  -- já trocada (rodar de novo não duplica)
    end if;
    if (length(v_def) - length(replace(v_def, r.de, ''))) / length(r.de) <> 1 then
      raise exception 'Troca % (%): o trecho esperado não aparece exatamente UMA vez no texto vivo. Me mande o BLOCO 0 (c). Nada foi alterado.', r.ordem, r.funcao;
    end if;
    insert into public.carbo_backup_funcoes(funcao, definicao) values (r.funcao, v_def);
    execute replace(v_def, r.de, r.por);   -- create or replace, MESMA assinatura: os grants ficam
    v_n := v_n + 1;
  end loop;
  raise notice 'funções trocadas: % (esperado 2)', v_n;
end $$;

notify pgrst, 'reload schema';

-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ CONFERÊNCIA                                                        ║
-- ╚═══════════════════════════════════════════════════════════════════╝
-- ESPERADO: regras_restritivas = 2 · arquivar_trava = true · repassar_trava = true.
select
  (select count(*) from pg_policies
    where schemaname = 'public' and tablename = 'crm_sales_leads'
      and permissive = 'RESTRICTIVE' and policyname like 'crm_sales_leads_f15_so_closer_%') as regras_restritivas,
  position($q$funnel_type is distinct from 'f15'$q$
           in pg_get_functiondef('public.crm_sales_lead_arquivar(uuid,text)'::regprocedure)) > 0 as arquivar_trava,
  position($q$funnel_type is distinct from 'f15'$q$
           in pg_get_functiondef('public.crm_sales_lead_repassar(uuid,text)'::regprocedure)) > 0 as repassar_trava;

-- ─── Desfazer ────────────────────────────────────────────────────────
-- drop policy crm_sales_leads_f15_so_closer_altera on public.crm_sales_leads;
-- drop policy crm_sales_leads_f15_so_closer_apaga  on public.crm_sales_leads;
-- e reexecutar as definições de carbo_backup_funcoes (as duas mais recentes).
