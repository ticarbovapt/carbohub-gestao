-- ═══════════════════════════════════════════════════════════════════════════
-- `carbo_wa_resolver_antigas` aceita corte até o COMEÇO DE HOJE (Brasília)
-- (27/11/2026). A trava da 20261204 era "até 24 h atrás", e o pedido foi
-- "do dia 26/11 para trás, hoje fica como marco" — corte 27/11 00:00, que
-- ficava dentro das 24 h e era recusado.
-- Troca no TEXTO VIVO, com backup; o trecho tem de aparecer UMA vez.
-- ═══════════════════════════════════════════════════════════════════════════
do $do$
declare
  v_def text;
  v_n   int;
begin
  v_def := pg_get_functiondef('public.carbo_wa_resolver_antigas(timestamptz, boolean)'::regprocedure);
  if v_def ~* 'começo de hoje' then
    raise notice 'a limpeza já aceita corte até o começo de hoje';
    return;
  end if;
  select count(*) into v_n from regexp_matches(v_def,
    $p$p_ate\s*>\s*now\(\)\s*-\s*interval\s*'1 day'$p$, 'gi');
  if v_n <> 1 then
    raise exception 'carbo_wa_resolver_antigas: esperava 1 trava de 24 h, achei %', v_n;
  end if;
  insert into public.carbo_backup_funcoes(funcao, definicao)
  values ('carbo_wa_resolver_antigas', v_def);
  v_def := regexp_replace(v_def, $p$p_ate\s*>\s*now\(\)\s*-\s*interval\s*'1 day'$p$,
    $r$p_ate > (date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo')$r$, 'i');
  v_def := replace(v_def, '(tem de ser até ontem)', '(tem de ser até o começo de hoje)');
  execute v_def;
  if pg_get_functiondef('public.carbo_wa_resolver_antigas(timestamptz, boolean)'::regprocedure) !~* 'começo de hoje' then
    raise exception 'a troca na trava da limpeza não pegou';
  end if;
end $do$;

revoke execute on function public.carbo_wa_resolver_antigas(timestamptz, boolean) from anon, public, authenticated;
