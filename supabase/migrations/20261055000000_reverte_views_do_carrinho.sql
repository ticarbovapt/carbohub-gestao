-- ═══════════════════════════════════════════════════════════════════════════
-- REVERTE o BLOCO 2 da 20261054 — a fila estourou o timeout (07/10/2026)
--
-- Medido em net._http_response, de 30 em 30 min (UTC):
--   12:30–17:30   0 a 4 timeouts por janela, ~30 ok   ← a fila JÁ estava no limite
--   18:00         23 timeouts, 18 ok                  ← BLOCO 2 rodado ~18:03
--   depois disto  só 200
--
-- A `carbo_carrinho_horas_ate` tem FROM no corpo e não é embutida pelo
-- planejador: chamada por linha dentro da fila, ela empurrou uma consulta que
-- já beirava os 8 s para além deles — e com a fila em timeout NENHUMA mensagem
-- da Meta sai, nem as da esteira.
--
-- As views voltam ao texto guardado em `carbo_backup_viewdef` antes da troca.
-- A configuração (minutos_1 = 15, hora_2/dias_2/hora_3/dias_3) FICA, mas as
-- views voltam a ler `horas_2`/`horas_3` corridas até a cadência ser refeita
-- sem função por linha.
-- ═══════════════════════════════════════════════════════════════════════════
do $$
declare
  r record;
  v_n int := 0;
begin
  for r in
    select distinct on (nome) nome, def, opcoes
      from public.carbo_backup_viewdef
     where motivo like '20261054%'
     order by nome, guardado_em desc
  loop
    v_n := v_n + 1;
  end loop;
  if v_n <> 2 then
    raise exception 'esperava 2 cópias guardadas (pipeline e fila), achei %', v_n;
  end if;

  for r in
    select distinct on (nome) nome, def, opcoes
      from public.carbo_backup_viewdef
     where motivo like '20261054%'
     order by nome, guardado_em desc
  loop
    execute format('create or replace view public.%I %s as %s',
                   r.nome,
                   case when r.opcoes is null then '' else 'with (' || r.opcoes || ')' end,
                   rtrim(r.def, '; '));
  end loop;
end
$$;
