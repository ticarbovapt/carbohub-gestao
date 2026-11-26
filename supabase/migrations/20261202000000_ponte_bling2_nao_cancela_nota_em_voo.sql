-- ═══════════════════════════════════════════════════════════════════════════
-- A ponte do Bling 2 cancelava venda com nota EM AUTORIZAÇÃO
--
-- Medido em 26/11/2026 no V2026110025 (R$ 26.000): cancelado às 11:24:00, sem
-- usuário, pela `bling2_bridge_pedidos_faturados` (cron de 2 em 2 min). Depois
-- disso o pedido no Bling 2 estava Atendido (9) e a NF 000011 "Emitida DANFE"
-- — válida. O que a ponte viu às 11:24 foi a nota ainda Pendente.
--
-- A causa é o ramo de cancelamento da ponte:
--
--     bo.situacao_id = 12
--     or (nf.situacao is not null and not bling2_nf_e_valida(nf.situacao))
--
-- `bling2_nf_e_valida` é a lista BRANCA do que conta como FATURAMENTO
-- (Autorizada, Emitida DANFE, Registrada). "Não é faturamento ainda" não é
-- "foi cancelada": Pendente é nota sendo emitida agora. É a lição da 20261034
-- ("nota em voo não é nota cancelada") que nunca chegou à ponte, e ela ficou
-- exposta quando a filial passou a reler pedido e nota a cada minuto
-- (20261190–20261193): a ponte passou a enxergar a nota no instante em que ela
-- ainda está em autorização.
--
-- A correção: cancelar só com nota sabidamente MORTA — `carbo_nf_invalida`
-- (Cancelada, Denegada, Rejeitada, Bloqueada), a mesma lista que a 20261034
-- conferiu valer para as duas contas. O resto da ponte não muda.
--
-- ⚠️ Reabrir o V2026110025 NÃO é feito aqui: `trg_carbo_cancelamento_nao_ressuscita`
-- recusa reabertura sem usuário, de propósito. Reabre-se arrastando o card de
-- volta no Rastreio do Ops (a consulta da etapa anterior está em
-- `supabase/consultas/ponte_bling2_cancelou_nota_em_voo.sql`).
-- ═══════════════════════════════════════════════════════════════════════════

do $ponte$
declare
  v_def  text := pg_get_functiondef('public.bling2_bridge_pedidos_faturados()'::regprocedure);
  v_pad  text := 'not\s+(public\.)?bling2_nf_e_valida\(\s*nf\.situacao\s*\)';
  v_n    int;
begin
  if to_regprocedure('public.carbo_nf_invalida(text)') is null then
    raise exception 'carbo_nf_invalida(text) não existe — nada foi alterado.';
  end if;

  select count(*) into v_n from regexp_matches(v_def, v_pad, 'gi');

  if v_n = 0 and v_def ~* '(public\.)?carbo_nf_invalida\(\s*nf\.situacao\s*\)' then
    raise notice 'A ponte já cancela só por nota inválida — nada a trocar.';
    return;
  end if;
  if v_n <> 1 then
    raise exception 'Esperava 1 ocorrência de "not bling2_nf_e_valida(nf.situacao)" na ponte, achei %. Nada foi alterado.', v_n;
  end if;

  insert into public.carbo_backup_funcoes(funcao, definicao)
  values ('bling2_bridge_pedidos_faturados', v_def);

  execute regexp_replace(v_def, v_pad, 'public.carbo_nf_invalida(nf.situacao)', 'i');

  -- Conferência: a troca tem de estar no texto vivo.
  if pg_get_functiondef('public.bling2_bridge_pedidos_faturados()'::regprocedure)
     !~* 'carbo_nf_invalida\(\s*nf\.situacao\s*\)' then
    raise exception 'A ponte foi recriada mas a troca não aparece no texto vivo — abortando.';
  end if;
end $ponte$;
