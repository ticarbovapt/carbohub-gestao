-- ═══════════════════════════════════════════════════════════════════════════
-- Meta do e-commerce: o ML Full entra na lista da RPC
--
-- Sintoma (07/10/2026): "Salvar distribuição" em /metas/configurar devolvia
--   Plataforma desconhecida no payload. Aceitas: mercadolivre, nuvemshop,
--   amazon, shopee, payt.
--
-- A `carbo_distribuir_meta` (20260974) tem uma lista que ESPELHA o
-- `ALL_PLATFORMS` do `apps/admin/src/hooks/useMetaEcommerce.ts` — o próprio
-- comentário dela diz "plataforma nova entra NOS DOIS lugares". O
-- `mercadolivre_full` (21/09) entrou só na tela. A tela manda sempre as seis
-- linhas, então a RECUSA vale para o mês inteiro, não só para o Full: nenhuma
-- meta de e-commerce salvava desde então.
--
-- A recusa é a guarda funcionando (a alternativa era a meta ir parar numa
-- plataforma que a tela não soma, o caso `vindi`). O conserto é a lista.
--
-- ⚠️ Trocado no texto VIVO (`pg_get_functiondef`), nunca no da migração que a
-- criou, e o bloco ABORTA se o trecho não estiver lá exatamente uma vez.
-- `create or replace` mantém os grants.
-- ═══════════════════════════════════════════════════════════════════════════

do $$
declare
  v_def  text;
  v_novo text;
  v_de   text := $t$array['mercadolivre','nuvemshop','amazon','shopee','payt']$t$;
  v_para text := $t$array['mercadolivre','mercadolivre_full','nuvemshop','amazon','shopee','payt']$t$;
begin
  select pg_get_functiondef('public.carbo_distribuir_meta(text, date, numeric, jsonb)'::regprocedure)
    into v_def;

  if (length(v_def) - length(replace(v_def, v_de, ''))) / length(v_de) <> 1 then
    raise exception 'A lista de plataformas da carbo_distribuir_meta nao e a esperada — nada foi alterado. Mande o pg_get_functiondef para revisao.';
  end if;

  v_novo := replace(v_def, v_de, v_para);
  execute v_novo;
end $$;

-- Conferência: tem de voltar TRUE.
select pg_get_functiondef('public.carbo_distribuir_meta(text, date, numeric, jsonb)'::regprocedure)
       like '%''mercadolivre_full''%' as ml_full_aceito;
