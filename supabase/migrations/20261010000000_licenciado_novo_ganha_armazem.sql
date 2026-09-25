-- ═══════════════════════════════════════════════════════════════════════════
-- Licenciado NOVO ganha armazém sozinho
--
-- A 20261009 criou os 22 armazéns de hoje por backfill. Sem isto, licenciado
-- cadastrado amanhã simplesmente NÃO APARECE no seletor de destino do Ops —
-- e o sintoma é mudo: quem vai enviar não acha a loja e conclui que digitou
-- errado o nome. É a doença conhecida do "cadastro que precisa de um segundo
-- passo que ninguém sabe que existe".
--
-- ⚠️ O gatilho também SINCRONIZA nome e situação. Loja renomeada continuaria
-- no seletor com o nome antigo, e quem envia escolheria pelo nome errado sem
-- erro nenhum — foi por isso que o backfill da 20261009 já fazia esse update.
-- Um lugar só para a regra, em vez de um update manual toda vez.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function licenciados.carbo_sincroniza_armazem()
returns trigger language plpgsql security definer set search_path = licenciados as $$
begin
  -- ⚠️ Só para loja ATIVA no INSERT. Loja nasce inativa em alguns fluxos de
  -- cadastro, e criar armazém para ela encheria o seletor de destino de lojas
  -- que ninguém abastece. Quando ela for ativada, o ramo de UPDATE cria.
  if tg_op = 'INSERT' then
    if coalesce(new.active, true) then
      perform public.carbo_licenciado_armazem(new.id);
    end if;
    return new;
  end if;

  if coalesce(new.active, true) and not exists (
    select 1 from public.warehouses w where w.licenciado_loja_id = new.id
  ) then
    perform public.carbo_licenciado_armazem(new.id);
  end if;

  update public.warehouses w
     set name = new.name, is_active = coalesce(new.active, true)
   where w.licenciado_loja_id = new.id
     and (w.name is distinct from new.name
          or w.is_active is distinct from coalesce(new.active, true));

  return new;
end $$;

comment on function licenciados.carbo_sincroniza_armazem() is
  'Mantém o armazém de public.warehouses em dia com a loja: cria na ativação e acompanha nome/situação. Ver 20261010000000.';

drop trigger if exists trg_carbo_sincroniza_armazem on licenciados.lojas;
create trigger trg_carbo_sincroniza_armazem
  after insert or update of name, active on licenciados.lojas
  for each row execute function licenciados.carbo_sincroniza_armazem();

-- ⚠️ CONFERÊNCIA — rode SOZINHA. Loja ativa sem armazém. ESPERADO: zero linhas.
-- (Uma linha aqui significa que o gatilho não pegou aquele cadastro, e aquele
-- licenciado não aparece no seletor de destino do Ops.)
select l.id, l.name, l.active
from licenciados.lojas l
where l.active
  and not exists (select 1 from public.warehouses w where w.licenciado_loja_id = l.id);
