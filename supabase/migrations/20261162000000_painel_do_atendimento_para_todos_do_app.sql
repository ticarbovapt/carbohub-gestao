-- 20261162 — o painel do atendimento passa a valer para QUEM TEM O APP (16/11/2026)
--
-- Decisão do dono do processo: o Painel do atendimento (e a aba Assuntos) era só do gestor
-- (`carbo_atendimento_gestor()` = `carbo_is_gestor` E o app). Agora é de todos os que têm o
-- Carbo Atendimento. ⚠️ Isto inclui os números POR PESSOA (a aba Atendentes e o detalhe
-- de cada um): quem atende passa a ver os números dos colegas.
--
-- O que NÃO muda: ALTERAR horário e metas (`carbo_atendimento_config_definir`) continua só
-- do gestor — meta do time não é para qualquer um mexer.
--
-- Trocado no texto VIVO das quatro consultas de leitura (nunca reescrito à mão); aborta,
-- sem mudar nada, se alguma não tiver exatamente UMA guarda do gestor para trocar.

create or replace function public.carbo_atendimento_painel_pode()
returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null
     and public.carbo_tem_app(array['carbo_atendimento']);
$$;
grant execute on function public.carbo_atendimento_painel_pode() to authenticated, service_role;
revoke execute on function public.carbo_atendimento_painel_pode() from anon, public;

do $$
declare
  v_nome text;
  v_oids oid[];
  v_def  text;
  v_n    int;
begin
  foreach v_nome in array array['carbo_atendimento_painel', 'carbo_atendimento_pessoa',
                                'carbo_atendimento_assuntos', 'carbo_atendimento_assunto_clientes']
  loop
    select array_agg(p.oid) into v_oids
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = v_nome;
    if v_oids is null or cardinality(v_oids) <> 1 then
      raise exception 'esperava exatamente 1 função %, achei %', v_nome, coalesce(cardinality(v_oids), 0);
    end if;

    v_def := pg_get_functiondef(v_oids[1]);
    select count(*) into v_n from regexp_matches(v_def, '(public\.)?carbo_atendimento_gestor\(\)', 'g');
    if v_n <> 1 then
      raise exception 'esperava 1 guarda do gestor em %, achei %', v_nome, v_n;
    end if;

    v_def := regexp_replace(v_def, '(public\.)?carbo_atendimento_gestor\(\)', 'public.carbo_atendimento_painel_pode()');
    v_def := replace(v_def, 'Somente gestores do Carbo Atendimento veem o painel.',
                            'Só quem tem o Carbo Atendimento vê o painel.');
    execute v_def;
  end loop;
end $$;

-- Conferência (aparece no resultado): as quatro leem o novo critério, e a de alterar
-- horário e metas continua no do gestor.
select p.proname,
       (pg_get_functiondef(p.oid) like '%carbo_atendimento_painel_pode()%') as usa_o_app,
       (pg_get_functiondef(p.oid) like '%carbo_atendimento_gestor()%')      as usa_o_gestor
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname in ('carbo_atendimento_painel', 'carbo_atendimento_pessoa', 'carbo_atendimento_assuntos',
                     'carbo_atendimento_assunto_clientes', 'carbo_atendimento_config_definir')
 order by 1;
