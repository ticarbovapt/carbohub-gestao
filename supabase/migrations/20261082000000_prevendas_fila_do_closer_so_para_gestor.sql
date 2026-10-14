-- =====================================================================
-- PRÉ-VENDAS: o SDR vê no f15 SÓ o que ELE repassou (14/10/2026).
--
-- Desenho do dono do processo: quem opera as pipelines (departamento novo) é
-- sempre COLABORADOR; o closer (f15) é GESTOR. O SDR enxerga os cards que ele
-- repassou ao closer — e não os dos outros SDRs.
--
-- O que já garantia isso: o repasse cria o card do f15 com `created_by` = o
-- SDR que repassou (`crm_sales_lead_repassar`), e a regra de leitura deixa
-- passar `created_by = eu`. O closer, gestor, vê tudo pela `20261081`.
--
-- O furo: a regra tem um terceiro termo, a FILA aberta do repasse
-- (`origin_lead_id is not null and assigned_to is null`), que vale para
-- QUALQUER logado. No Sales ela é necessária — closer do Inbound pode ser
-- colaborador e precisa ver a fila para pegar o card. No f15 ela mostrava a
-- todo SDR os repasses dos colegas que o closer ainda não pegou. A tela já
-- os escondia (o quadro filtra `created_by`/`assigned_to` = eu), mas o banco
-- os entregava a quem pedisse pela API.
--
-- A troca: a fila deixa de valer para o f15. Quem pega card do f15 é o
-- closer, gestor, que já vê tudo. Sales intocado.
-- =====================================================================

-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 0 — o card do closer leva o SDR em created_by? (só leitura)  ║
-- ╚═══════════════════════════════════════════════════════════════════╝
-- ESPERADO: com_sdr = total (todo card do f15 nasce com o SDR que repassou
-- em created_by). `sem_sdr` > 0 = o SDR NÃO veria esses cards — me mande
-- ANTES do BLOCO 1. Zero cards no f15 também serve: só não prova nada ainda.
select count(*)                                                     as total_f15,
       count(*) filter (where n.created_by = o.created_by)          as com_sdr,
       count(*) filter (where n.created_by is distinct from o.created_by) as sem_sdr
from public.crm_sales_leads n
join public.crm_sales_leads o on o.id = n.origin_lead_id
where n.funnel_type = 'f15';

-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — a fila do f15 sai do "qualquer logado"                   ║
-- ╚═══════════════════════════════════════════════════════════════════╝
do $$
declare
  r record; v_n int := 0;
  v_de  constant text := '((origin_lead_id IS NOT NULL) AND (assigned_to IS NULL))';
  v_por constant text := '((origin_lead_id IS NOT NULL) AND (assigned_to IS NULL) AND (funnel_type <> ''f15''::text))';
begin
  for r in
    select * from pg_policies
     where schemaname = 'public' and tablename = 'crm_sales_leads'
       and cmd in ('SELECT', 'UPDATE')
       and coalesce(qual, '') not like '%''f15''::text))%'
  loop
    if (length(r.qual) - length(replace(r.qual, v_de, ''))) / length(v_de) <> 1 then
      raise exception 'A regra % não tem exatamente UMA fila de repasse no texto vivo. Me mande o BLOCO 0 (b) da 20261081 de novo. Nada foi alterado.', r.policyname;
    end if;
    insert into public.carbo_backup_policies(tabela, regra, operacao, papeis, quem_le, quem_grava)
    values (r.tablename, r.policyname, r.cmd, r.roles::text, r.qual, r.with_check);
    execute format('alter policy %I on public.crm_sales_leads using (%s)',
                   r.policyname, replace(r.qual, v_de, v_por));
    v_n := v_n + 1;
  end loop;
  raise notice 'regras trocadas: % (esperado 2)', v_n;
end $$;

-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ CONFERÊNCIA                                                        ║
-- ╚═══════════════════════════════════════════════════════════════════╝
-- ESPERADO: fila_sem_f15 = 2 · gestor_prevendas = 2 (a 20261081 continua lá).
select
  count(*) filter (where qual like '%(funnel_type <> ''f15''::text)%')   as fila_sem_f15,
  count(*) filter (where qual like '%carbo_prevendas_gestor()%')        as gestor_prevendas
from pg_policies
where schemaname = 'public' and tablename = 'crm_sales_leads' and cmd in ('SELECT', 'UPDATE');
