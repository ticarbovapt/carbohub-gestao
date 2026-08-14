-- ═══════════════════════════════════════════════════════════════════════════
-- A reconferência de NF da filial passa a RODAR
--
-- ⚠️ Falha apontada pelo dono do processo, e ele estava certo: "nota cancelada
-- não pode continuar contando".
--
-- ── O buraco, em duas camadas ─────────────────────────────────────────────
--
-- 1. `nfe_recheck` EXISTE na bling2-sync, mas está FORA da lista `ORDEM` (as
--    fases que o sync automático executa) e nenhum cron o chamava. Nunca rodou.
--
-- 2. Isso importa mais no Bling 2 do que pareceria, porque nota cancelada SOME
--    da listagem `/nfe`. O espelho não recebe "cancelada" — ele simplesmente
--    para de ver a nota e congela na última situação conhecida, "Emitida
--    DANFE". Só `/nfe/{id}` responde para nota cancelada, e é exatamente isso
--    que o recheck faz.
--
-- Resultado: no Bling 2, cancelamento de nota nunca chegava ao sistema. E
-- desde que `carbo_vendas_metrica` passou a contar a nota da filial, isso
-- deixou de ser um dado desatualizado e virou faturamento errado.
--
-- ⚠️ O alvo do recheck também foi ampliado (na edge function, commit junto):
-- ele partia só de `bling2_orders`, então nota avulsa — ou vinculada à mão a
-- uma venda antiga — ficava fora. Era o pior recorte possível: a nota que
-- alguém vinculou é a que CONTA no faturamento.
--
-- ⚠️ RODE EM BLOCOS.
-- ═══════════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — agendamento                                                 ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- ⚠️ Fase PRÓPRIA, e não dentro do sync de 1 min. O recheck é uma chamada de
-- API por nota (teto 60, ~70 s por rodada). Enfiado no job de 1 minuto, as
-- rodadas se atropelariam e dobrariam as chamadas ao Bling — o mesmo motivo
-- pelo qual `order_details` tem cron separado.
--
-- 20 minutos: cancelamento de nota não é evento de segundo, e cada rodada
-- reconfere 60. Mais frequente que isso é gastar cota de API para reler o que
-- não mudou.

do $$
declare v_seg text; j bigint;
begin
  select valor into v_seg from private.cron_config where chave = 'rastreio_cron_secret';
  if v_seg is null or v_seg = '' then
    raise exception 'Falta o segredo em private.cron_config (chave rastreio_cron_secret).';
  end if;

  for j in select jobid from cron.job where jobname = 'bling2-nfe-recheck-20min' loop
    perform cron.unschedule(j);
  end loop;

  perform cron.schedule(
    'bling2-nfe-recheck-20min', '7-59/20 * * * *',
    format($cmd$
      select net.http_post(
        url     := 'https://wpkfirmapxevzpxjovjr.supabase.co/functions/v1/bling2-auto-sync',
        headers := jsonb_build_object('Content-Type','application/json','X-Cron-Secret', %L),
        body    := '{"source":"cron-nfe-recheck","fases":["nfe_recheck"]}'::jsonb,
        timeout_milliseconds := 30000
      );
    $cmd$, v_seg)
  );
end $$;

-- Minuto 7 e não 0: a grade já tem coisa no :00 (bling-nfe-sync) e no :03
-- (order_details). Empilhar tudo no mesmo minuto é o que faz uma janela de
-- API estourar e as fases seguintes morrerem no meio.


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — vigia: nota vinculada que virou inválida                     ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- Quando o recheck descobrir um cancelamento, `carbo_vendas_metrica` já reage
-- sozinha: `conta_metrica` vira false e `motivo_fora` vira 'nf_invalida'. O
-- valor SAI do faturamento sem ninguém precisar fazer nada.
--
-- ⚠️ Mas sair em silêncio é meio caminho. O pedido volta a não contar e
-- ninguém é avisado — e quem fecha o mês descobre pelo total, sem saber qual
-- venda mudou. Esta view é o lugar de olhar.

create or replace view public.carbo_vendas_nf_cancelada
with (security_invoker = true) as
select
  o.order_number,
  o.customer_name,
  o.total,
  o.bling_conta,
  coalesce(o.invoice_number, o.invoice2_number) as nf_numero,
  m.nf_situacao,
  o.sale_date,
  o.updated_at
from public.carboze_orders o
join public.carbo_vendas_metrica m on m.id = o.id
where m.motivo_fora = 'nf_invalida'
  and o.status not in ('quote', 'cancelled');

grant select on public.carbo_vendas_nf_cancelada to authenticated;

comment on view public.carbo_vendas_nf_cancelada is
  'Vendas cuja NF deixou de ser documento válido (cancelada/denegada) mas que continuam abertas no sistema. Sair do faturamento é automático; APARECER aqui é o que faz alguém decidir se cancela a venda ou reemite.';


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 3 — conferência                                                 ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- (a) O agendamento existe?
select jobname, schedule, active from cron.job where jobname = 'bling2-nfe-recheck-20min';

-- (b) A grade completa do Bling, para conferir que nada colide no mesmo minuto.
select jobname, schedule, active from cron.job
where jobname like 'bling%' order by jobname;

-- (c) Vendas com NF inválida hoje. Deve vir vazio; se vier linha, é venda
--     faturada com nota cancelada — decisão de cancelar ou reemitir.
select * from public.carbo_vendas_nf_cancelada order by updated_at desc;

-- (d) ⚠️ Disparo MANUAL da reconferência, para não esperar 20 minutos.
--     Rode e depois repita a consulta (c).
--     Substitua <SEGREDO> pelo valor de private.cron_config.
--
-- select net.http_post(
--   url     := 'https://wpkfirmapxevzpxjovjr.supabase.co/functions/v1/bling2-auto-sync',
--   headers := jsonb_build_object('Content-Type','application/json','X-Cron-Secret','<SEGREDO>'),
--   body    := '{"source":"manual","fases":["nfe_recheck"]}'::jsonb,
--   timeout_milliseconds := 60000
-- );
