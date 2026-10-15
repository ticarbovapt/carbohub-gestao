-- =====================================================================
-- A REGRA DO TIME é avaliada UMA VEZ por consulta, não uma vez por LINHA
-- (15/10/2026).
--
-- Sintoma: a Esteira do On-line (`admin…/ecommerce/esteira`) parou de abrir —
-- "canceling statement due to statement timeout".
--
-- Causa: a `20261078` trocou ~258 regras `using (true)` por
-- `using (carbo_e_time_interno())` (e a `20261079`, as do Finanças, por
-- `carbo_tem_app(array[...])`). A REGRA está certa; o CUSTO mudou. As duas
-- funções são SECURITY DEFINER, e função assim o Postgres não embute: numa
-- regra de linha ela é chamada UMA VEZ POR LINHA LIDA — cada chamada uma busca
-- em `profiles`. `true` não custava nada. A `bling2_esteira` é
-- `security_invoker` e cruza `bling2_orders`, `bling2_nfe`, `ecommerce_orders`,
-- `melhorenvio_envios`… com laços aninhados de centenas de milhares de voltas:
-- milhões de chamadas, e o teto de 8 s do PostgREST estoura.
--
-- Medido num Postgres local, 300 mil linhas × 2 tabelas com a mesma regra:
--   regra crua        6.887 ms
--   regra embrulhada    303 ms
--
-- A troca: `carbo_e_time_interno()` → `(select carbo_e_time_interno())`.
-- Com o SELECT o Postgres calcula UMA vez (InitPlan) e reusa — é a
-- recomendação do próprio Supabase para regras com função. O RESULTADO é o
-- mesmo: o valor depende só de quem está logado, que não muda dentro da
-- consulta. Ninguém ganha nem perde acesso.
--
-- ⚠️ A fila do WhatsApp NÃO estava sendo afetada: as edge functions usam a
-- service role, que passa por cima da RLS. Era só a TELA (usuário logado).
--
-- ⚠️ Regra NOVA com função: escreva já embrulhada — `(select f())`, nunca
-- `f()` solto. Vale para qualquer função que só dependa de quem está logado.
-- =====================================================================

-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 0 — quantas regras chamam a função por linha (só leitura)    ║
-- ╚═══════════════════════════════════════════════════════════════════╝
-- ESPERADO: regras_time na casa de 250+ e regras_app em torno de 15–20.
-- Zero nas duas = alguém já embrulhou; me mande antes do BLOCO 1.
select count(*) filter (where txt ~ '(?<!SELECT )carbo_e_time_interno\(\)')  as regras_time,
       count(*) filter (where txt ~ '(?<!SELECT )carbo_tem_app\(ARRAY')      as regras_app,
       count(distinct tablename)                                             as tabelas
from (select tablename, coalesce(qual, '') || ' ' || coalesce(with_check, '') as txt
        from pg_policies where schemaname = 'public') x
where txt ~ '(?<!SELECT )(carbo_e_time_interno\(\)|carbo_tem_app\(ARRAY)';

-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — embrulha (com backup de cada regra)                      ║
-- ╚═══════════════════════════════════════════════════════════════════╝
-- Rodar de novo não duplica: o padrão pula o que já está dentro de SELECT.
do $$
declare
  r record; v_qual text; v_check text; v_n int := 0;
begin
  for r in
    select * from pg_policies
     where schemaname = 'public'
       and (coalesce(qual, '') || ' ' || coalesce(with_check, ''))
           ~ '(?<!SELECT )(carbo_e_time_interno\(\)|carbo_tem_app\(ARRAY)'
  loop
    insert into public.carbo_backup_policies(tabela, regra, operacao, papeis, quem_le, quem_grava)
    values (r.tablename, r.policyname, r.cmd, r.roles::text, r.qual, r.with_check);

    v_qual := regexp_replace(regexp_replace(r.qual,
                '(?<!SELECT )(public\.)?carbo_e_time_interno\(\)',
                '(SELECT public.carbo_e_time_interno())', 'g'),
                '(?<!SELECT )(public\.)?carbo_tem_app\((ARRAY\[[^\]]*\])\)',
                '(SELECT public.carbo_tem_app(\2))', 'g');
    v_check := regexp_replace(regexp_replace(r.with_check,
                '(?<!SELECT )(public\.)?carbo_e_time_interno\(\)',
                '(SELECT public.carbo_e_time_interno())', 'g'),
                '(?<!SELECT )(public\.)?carbo_tem_app\((ARRAY\[[^\]]*\])\)',
                '(SELECT public.carbo_tem_app(\2))', 'g');

    if v_qual is not null and v_check is not null then
      execute format('alter policy %I on public.%I using (%s) with check (%s)', r.policyname, r.tablename, v_qual, v_check);
    elsif v_qual is not null then
      execute format('alter policy %I on public.%I using (%s)', r.policyname, r.tablename, v_qual);
    else
      execute format('alter policy %I on public.%I with check (%s)', r.policyname, r.tablename, v_check);
    end if;
    v_n := v_n + 1;
  end loop;
  raise notice 'regras embrulhadas: %', v_n;
end $$;

-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ CONFERÊNCIA                                                        ║
-- ╚═══════════════════════════════════════════════════════════════════╝
-- ESPERADO: sem_embrulho = 0 · embrulhadas = o total do BLOCO 0 (ou mais,
-- se alguma já estava embrulhada antes).
select
  (select count(*) from pg_policies where schemaname = 'public'
     and (coalesce(qual, '') || ' ' || coalesce(with_check, ''))
         ~ '(?<!SELECT )(carbo_e_time_interno\(\)|carbo_tem_app\(ARRAY)')          as sem_embrulho,
  (select count(*) from pg_policies where schemaname = 'public'
     and (coalesce(qual, '') || ' ' || coalesce(with_check, ''))
         ~ 'SELECT (carbo_e_time_interno|carbo_tem_app)\(')                          as embrulhadas;
