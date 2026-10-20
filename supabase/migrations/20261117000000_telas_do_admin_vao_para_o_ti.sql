-- ═══════════════════════════════════════════════════════════════════════════
-- 20261117 — Usuários, Departamentos e funções, Quem recebe a venda e a
--            Auditoria saem do Carbo Admin e vão para o Carbo TI
--
-- Pedido do dono do processo em 20/10/2026: *"mesma tela, mesma lógica,
-- idêntico, nada novo, nada se perde"*. As telas foram COPIADAS byte a byte
-- para `apps/ti`; o Admin redireciona os endereços antigos para lá.
--
-- Quase todas as portas do banco olham o PERFIL (gestor, CEO, admin) e valem
-- em qualquer app. DUAS olhavam a flag do APP Admin, e no TI recusariam quem
-- só tem `carbo_ti`:
--
--   carbo_aviso_venda_online_lista / _definir   carbo_tem_app(array['carbo_admin'])
--   chat_adoption_can_view                      allowed_interfaces @> ARRAY['carbo_admin']
--
-- A troca SOMA `carbo_ti` e mantém `carbo_admin`: ninguém que passava deixa
-- de passar. Feita no texto VIVO (pg_get_functiondef), com o antes em
-- `carbo_backup_funcoes`, e aborta se o trecho não aparecer EXATAMENTE uma vez.
--
-- Cada letra é UM bloco (o SQL Editor mostra só o último resultado).
-- ═══════════════════════════════════════════════════════════════════════════


-- (A) MEDIR: quem tem o Admin hoje, e se tem o TI. ESPERADO: uma linha por
--     pessoa. `tem_ti = false` = essa pessoa usava estas telas no Admin e NÃO
--     entra no TI — para ela, as telas somem. Libere o "Carbo TI" a quem
--     precisar (em ti.carbohub.com.br/usuarios, ou peça aqui).
select p.full_name,
       p.department::text                                         as departamento,
       p.funcao,
       'carbo_ti' = any(coalesce(p.allowed_interfaces, '{}'))     as tem_ti
  from public.profiles p
 where 'carbo_admin' = any(coalesce(p.allowed_interfaces, '{}'))
   and coalesce(p.status, '') not in ('deleted', 'rejected')
 order by tem_ti, p.full_name;


-- (B) As duas portas passam a aceitar o TI também. ESPERADO: "Success. No
--     rows returned" (e um NOTICE por função). Se abortar dizendo que achou
--     0 ou 2 ocorrências, a função em produção não é a que eu esperava —
--     NADA foi alterado; me mande a mensagem.
do $portas$
declare
  r record; v_def text; v_n int;
begin
  for r in
    select * from (values
      ('public.carbo_aviso_venda_online_lista()',             'carbo_tem_app(array[''carbo_admin''])', 'carbo_tem_app(array[''carbo_admin'',''carbo_ti''])'),
      ('public.carbo_aviso_venda_online_definir(uuid,boolean)', 'carbo_tem_app(array[''carbo_admin''])', 'carbo_tem_app(array[''carbo_admin'',''carbo_ti''])'),
      -- ⚠️ `@>` é "contém TODAS" — com duas flags exigiria as duas. `&&` é
      -- "tem ALGUMA", que é a pergunta certa.
      ('public.chat_adoption_can_view(uuid)',                 '@> ARRAY[''carbo_admin'']',              '&& ARRAY[''carbo_admin'',''carbo_ti'']')
    ) as t(assinatura, de, por)
  loop
    if to_regprocedure(r.assinatura) is null then
      raise exception 'Função % não existe — nada foi alterado.', r.assinatura;
    end if;
    v_def := pg_get_functiondef(to_regprocedure(r.assinatura));
    if position(r.por in v_def) > 0 then
      raise notice '% já aceita carbo_ti — nada a fazer.', r.assinatura;
      continue;
    end if;
    v_n := (length(v_def) - length(replace(v_def, r.de, ''))) / length(r.de);
    if v_n <> 1 then
      raise exception 'Em %, achei % ocorrência(s) de % (esperava 1) — nada foi alterado.', r.assinatura, v_n, r.de;
    end if;
    insert into public.carbo_backup_funcoes(funcao, definicao) values (r.assinatura, v_def);
    v_def := replace(v_def, r.de, r.por);
    -- A mensagem de recusa dizia "só quem tem o Admin": passaria a mentir.
    v_def := replace(v_def, 'só quem tem o Admin define', 'só quem tem o TI ou o Admin define');
    execute v_def;   -- create or replace com a MESMA assinatura: os grants ficam
    raise notice '% agora aceita carbo_ti.', r.assinatura;
  end loop;
end $portas$;


-- (C) CONFERÊNCIA. ESPERADO: as três linhas com `aceita_ti = true`.
select f.assinatura,
       position('carbo_ti' in pg_get_functiondef(to_regprocedure(f.assinatura))) > 0 as aceita_ti
  from (values ('public.carbo_aviso_venda_online_lista()'),
               ('public.carbo_aviso_venda_online_definir(uuid,boolean)'),
               ('public.chat_adoption_can_view(uuid)')) f(assinatura);
