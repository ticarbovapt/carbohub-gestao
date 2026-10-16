-- =====================================================================
-- CONFERÊNCIA (só leitura): os SDRs do departamento Posto Seguro (16/10/2026).
--
-- Funcionários novos, cadastrados em DOIS lugares, que só entram no Carbo
-- Pré-Vendas mas são time interno como qualquer outro:
--   perfil   profiles (criado pelo create-team-member) + auth.users + user_roles
--   ficha    employee_finance (Finanças → Funcionários), ligada por user_id
--
-- Nenhum logou ainda: o e-mail de login é o provisório
-- `<usuario>@carbo.internal` e o real entra no primeiro acesso
-- (`set_initial_email`) — e-mail provisório aqui é o CERTO, não falta.
--
-- ⚠️ A ficha do Finanças pode existir SEM estar ligada ao usuário (cadastro
-- "avulso", user_id nulo) — acontece quando ela é criada antes do usuário.
-- Ligada por nome ela NÃO é: a tela mostra o perfil "Pendente" e a ficha
-- solta como outra pessoa. O BLOCO C separa os dois casos.
-- =====================================================================

-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ A — o departamento e as funções dele                               ║
-- ╚═══════════════════════════════════════════════════════════════════╝
select d.key, d.label, d.sigla, d.is_active,
       f.function_key, f.label as funcao, f.access_level, f.is_active as funcao_ativa
  from public.carbo_departments d
  left join public.carbo_functions f on f.department = d.key
 where d.key ilike '%posto%' or d.label ilike '%posto%'
 order by d.key, f.hierarchy_order nulls last;

-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ B — o PERFIL de cada um: acesso, função, gestor, login             ║
-- ╚═══════════════════════════════════════════════════════════════════╝
with d as (
  select key from public.carbo_departments
   where key ilike '%posto%' or label ilike '%posto%'
)
select p.full_name,
       p.username,
       p.department::text                                              as departamento,
       p.secondary_department::text                                    as dep_secundario,
       p.funcao,
       f.access_level                                                  as nivel,
       p.escopo,
       g.full_name                                                     as gestor,
       p.status::text                                                  as status,
       p.allowed_interfaces,
       p.allowed_interfaces::text[] = array['carbo_prevendas']         as so_prevendas,
       public.carbo_interface_e_interna(p.allowed_interfaces::text[])  as time_interno,
       to_jsonb(p) ->> 'password_must_change'                          as troca_senha_no_1o_acesso,
       u.email                                                         as email_login,
       u.last_sign_in_at                                               as ultimo_login,
       u.banned_until                                                  as bloqueado_ate,
       exists (select 1 from public.org_chart_nodes o where o.user_id = p.id) as no_organograma
  from public.profiles p
  left join auth.users u             on u.id = p.id
  left join public.profiles g        on g.id = p.manager_user_id
  left join public.carbo_functions f on f.department = p.department::text and f.function_key = p.funcao
 where p.department::text in (select key from d)
    or p.secondary_department::text in (select key from d)
 order by p.full_name;

-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ C — a FICHA do Finanças de cada um (ligada, avulsa ou nenhuma)     ║
-- ╚═══════════════════════════════════════════════════════════════════╝
with d as (
  select key from public.carbo_departments
   where key ilike '%posto%' or label ilike '%posto%'
), pessoas as (
  select p.id, p.full_name, p.username
    from public.profiles p
   where p.department::text in (select key from d)
      or p.secondary_department::text in (select key from d)
)
select p.full_name                                   as perfil,
       p.username,
       case when el.id is not null then 'ligada'
            when ea.id is not null then 'AVULSA — sem usuário ligado'
            else 'SEM FICHA' end                     as ficha,
       e.full_name                                   as nome_na_ficha,
       e.cpf,
       cpf.ok                                        as cpf_valido,
       e.birth_date                                  as nascimento,
       e.phone                                       as telefone,
       e.pix_type, e.pix_key,
       e.bank_name, e.bank_code, e.bank_agency, e.bank_account, e.account_type,
       e.emergency_name, e.emergency_phone,
       e.notes
  from pessoas p
  left join public.employee_finance el
         on el.user_id = p.id and el.active
  left join lateral (
         select x.id from public.employee_finance x
          where x.user_id is null and x.active
            and public.carbo_nome_chave(x.full_name) = public.carbo_nome_chave(p.full_name)
          limit 1) ea on el.id is null
  left join public.employee_finance e on e.id = coalesce(el.id, ea.id)
  left join lateral (
         select case when length(c) <> 11 or c = repeat(left(c, 1), 11) then false
                     else ((sum(nullif(substr(c, i, 1), '')::int * (11 - i)) filter (where i <= 9)) * 10 % 11 % 10)
                            = nullif(substr(c, 10, 1), '')::int
                      and ((sum(nullif(substr(c, i, 1), '')::int * (12 - i)) filter (where i <= 10)) * 10 % 11 % 10)
                            = nullif(substr(c, 11, 1), '')::int
                end as ok
           from (select regexp_replace(coalesce(e.cpf, ''), '\D', '', 'g') as c) x
          cross join generate_series(1, 11) i
          group by c) cpf on e.id is not null
 order by p.full_name;
