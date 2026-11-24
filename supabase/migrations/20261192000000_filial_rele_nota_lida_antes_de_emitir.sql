-- ═══════════════════════════════════════════════════════════════════════════
-- A NOTA da filial também era lida uma vez só — às vezes ANTES de ser emitida
-- (24/11/2026)
--
-- Caso: NF 000005 série 2 (GUTOS'S CAR, V2026110001). No Bling, a nota tem o
-- rodapé "V2026110001 Vendedor: Anderson Aragão" e está "Emitida DANFE". No
-- espelho, `informacoes_adicionais` e `natureza_operacao` estão NULOS.
--
-- Os dois vêm do XML, lido pelo `detalharNfe`. A fila dele é
-- `valor_total is null or raw_detalhe is null` — cada nota é detalhada UMA vez.
-- A nota B2B nasce "Pendente" no Bling e é emitida depois: detalhada antes da
-- emissão, ainda não tinha XML, e ficou sem rodapé e sem natureza PARA SEMPRE.
-- Sem os dois, o passo 2 da `carbo_vincula_nf_filial` (rodapé + natureza
-- conhecida) não a alcança. É o mesmo defeito da 20261190, do lado da nota.
--
-- A correção: a cada 10 min, a nota JÁ VÁLIDA (emitida) dos últimos 60 dias que
-- ainda está sem natureza volta à fila do detalhe (`raw_detalhe = null`) — 30
-- min entre tentativas e no máximo 6 tentativas por nota, para a nota cujo XML
-- não resolve não voltar para sempre. O `nfe_recente` (1 min, janela de 8 dias)
-- e o backfill `nfe_detalhe` (10 min) relêem; a `carbo_vincula_nf_filial` (*/5)
-- casa pelo rodapé.
--
-- ⚠️ Só nota VÁLIDA: a que ainda está Pendente não tem XML para ler.
-- ⚠️ `raw_detalhe = null` em `bling2_nfe` não apaga nada que a tela leia: os
-- campos já gravados (valor, CNPJ, links) continuam; o detalhe os regrava.
-- ⚠️ Volta = desligar o cron.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.carbo_bling2_nfe_releitura (
  bling_id   bigint primary key,
  relido_em  timestamptz not null default now(),
  vezes      int not null default 1
);
alter table public.carbo_bling2_nfe_releitura enable row level security;
comment on table public.carbo_bling2_nfe_releitura is
  'Quando a NF da filial foi devolvida à fila do detalhe por estar emitida e sem natureza (20261192). Só o cron escreve.';

create or replace function public.carbo_bling2_reler_nfe_sem_natureza(p_limite int default 40)
returns int
language plpgsql
set search_path = public
as $$
declare
  v_ids bigint[];
begin
  select array_agg(c.bling_id) into v_ids
  from (
    select nf.bling_id
      from public.bling2_nfe nf
      left join public.carbo_bling2_nfe_releitura r on r.bling_id = nf.bling_id
     where nf.natureza_operacao is null
       and nf.raw_detalhe is not null                 -- nulo já está na fila
       and public.bling2_nf_e_valida(nf.situacao)     -- emitida: tem XML
       and nf.data_emissao > (now() - interval '60 days')::date
       and coalesce(r.vezes, 0) < 6
       and (r.relido_em is null or r.relido_em < now() - interval '30 minutes')
     order by r.relido_em nulls first, nf.data_emissao desc
     limit greatest(1, least(coalesce(p_limite, 40), 200))
  ) c;

  if v_ids is null then
    return 0;
  end if;

  update public.bling2_nfe
     set raw_detalhe = null
   where bling_id = any(v_ids);

  insert into public.carbo_bling2_nfe_releitura as x (bling_id, relido_em, vezes)
  select unnest(v_ids), now(), 1
  on conflict (bling_id) do update
    set relido_em = now(), vezes = x.vezes + 1;

  return cardinality(v_ids);
end $$;

comment on function public.carbo_bling2_reler_nfe_sem_natureza(int) is
  'Devolve à fila do detalhe (raw_detalhe = null) a NF da filial emitida e sem natureza — detalhada antes de existir XML (20261192). Até 6 tentativas.';

revoke execute on function public.carbo_bling2_reler_nfe_sem_natureza(int) from anon, public, authenticated;
grant execute on function public.carbo_bling2_reler_nfe_sem_natureza(int) to service_role;

do $$
declare j bigint;
begin
  for j in select jobid from cron.job where jobname = 'bling2-reler-nfe-sem-natureza-10min' loop
    perform cron.unschedule(j);
  end loop;
  perform cron.schedule('bling2-reler-nfe-sem-natureza-10min', '1-59/10 * * * *',
                        $cmd$select public.carbo_bling2_reler_nfe_sem_natureza()$cmd$);
end $$;
