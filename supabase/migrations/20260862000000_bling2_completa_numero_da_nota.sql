-- ═══════════════════════════════════════════════════════════════════════════
-- Bling 2: número e chave da nota nos pedidos que já entraram
--
-- Os 160 pedidos importados vieram da primeira versão da ponte, que não
-- gravava `invoice_number` nem `nf_access_key` — esses campos só passaram a
-- ser preenchidos quando a ponte ganhou o vínculo com a NF. Como nenhum insert
-- novo aconteceu depois, o histórico ficou sem o número da nota: a tela não
-- consegue mostrar, e ninguém consegue conferir contra o Bling.
--
-- O conserto entra na `bling2_bridge_completar_entrega`, que já roda no cron e
-- já existe para exatamente isto: completar o que entrou incompleto. Assim
-- vale para o histórico e para qualquer pedido futuro que chegue antes da nota
-- estar no espelho, sem virar um script avulso que alguém precisa lembrar de
-- rodar.
--
-- Como todo o resto desta função: só preenche o que está VAZIO. Número
-- digitado à mão continua valendo.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.bling2_bridge_completar_entrega()
returns integer language plpgsql security definer set search_path = public as $$
declare v_n integer;
begin
  with fonte as (
    select
      o.id,
      bo.raw_detalhe -> 'transporte'                   as transp,
      bo.raw_detalhe -> 'transporte' -> 'etiqueta'     as etiqueta,
      bo.raw_detalhe -> 'transporte' -> 'volumes' -> 0 as volume1,
      nf.numero                                        as nf_numero,
      nf.chave_acesso                                  as nf_chave
    from public.carboze_orders o
    join public.bling2_orders bo on ('bling2-' || bo.bling_id) = o.external_ref
    left join public.bling2_nfe nf on nf.bling_id = bo.nf_bling_id
    where o.source_file = 'bling2_bridge'
      -- Antes exigia raw_detalhe: os dados de entrega vêm dele. Agora a nota
      -- também é completada aqui, e ela não depende do detalhe — por isso a
      -- condição passou a aceitar qualquer uma das duas fontes.
      and (bo.raw_detalhe is not null or nf.id is not null)
  ), calc as (
    select
      f.id,
      nullif(trim(concat_ws(', ',
        nullif(f.etiqueta ->> 'endereco', ''),
        nullif(f.etiqueta ->> 'numero', ''))), '')                       as endereco,
      nullif(f.etiqueta ->> 'bairro', '')                                as bairro,
      nullif(f.etiqueta ->> 'municipio', '')                             as municipio,
      upper(left(coalesce(f.etiqueta ->> 'uf', ''), 2))                  as uf,
      nullif(regexp_replace(coalesce(f.etiqueta ->> 'cep', ''), '\D', '', 'g'), '') as cep,
      nullif(trim(concat_ws(' · ',
        nullif(f.transp -> 'contato' ->> 'nome', ''),
        nullif(f.volume1 ->> 'servico', ''))), '')                       as transportadora,
      (f.transp ->> 'quantidadeVolumes')::numeric::integer               as volumes,
      (f.transp ->> 'pesoBruto')::numeric                                as peso,
      nullif(f.volume1 ->> 'codigoRastreamento', '')                     as rastreio,
      f.nf_numero,
      f.nf_chave
    from fonte f
  ), atualizados as (
    update public.carboze_orders o
    set
      delivery_address      = case when c.municipio is not null then coalesce(c.endereco, o.delivery_address) else o.delivery_address end,
      delivery_neighborhood = case when c.municipio is not null then coalesce(c.bairro, o.delivery_neighborhood) else o.delivery_neighborhood end,
      delivery_city         = coalesce(c.municipio, o.delivery_city),
      delivery_state        = case when c.municipio is not null and c.uf <> '' then c.uf else o.delivery_state end,
      delivery_zip          = coalesce(c.cep, o.delivery_zip),
      shipment_carrier      = coalesce(o.shipment_carrier, c.transportadora),
      shipment_volumes      = coalesce(o.shipment_volumes, c.volumes),
      shipment_weight_kg    = coalesce(o.shipment_weight_kg, c.peso),
      tracking_code         = coalesce(o.tracking_code, c.rastreio),
      -- Número e chave da nota. ⚠️ `bling_nf_id` continua FORA: é campo lido
      -- contra o espelho do Bling 1 (ver 20260861). Estes dois são texto e não
      -- fazem join com nada.
      invoice_number        = coalesce(o.invoice_number, c.nf_numero),
      nf_access_key         = coalesce(o.nf_access_key, c.nf_chave),
      updated_at            = now()
    from calc c
    where c.id = o.id
      and (
        (c.municipio is not null and (o.delivery_city   is distinct from c.municipio
                                   or o.delivery_address is distinct from c.endereco))
        or (o.shipment_carrier   is null and c.transportadora is not null)
        or (o.shipment_volumes   is null and c.volumes        is not null)
        or (o.shipment_weight_kg is null and c.peso           is not null)
        or (o.tracking_code      is null and c.rastreio       is not null)
        or (o.invoice_number     is null and c.nf_numero      is not null)
        or (o.nf_access_key      is null and c.nf_chave       is not null)
      )
    returning 1
  )
  select count(*) into v_n from atualizados;
  return v_n;
end $$;

comment on function public.bling2_bridge_completar_entrega is
  'Completa pedidos vindos do Bling 2: endereço de entrega (etiqueta), transportadora, volumes, peso, rastreio, número e chave da NF. Só preenche campo vazio. Idempotente.';


-- ═══════════════════════════════════════════════════════════════════════════
-- Conferência
-- ═══════════════════════════════════════════════════════════════════════════

select public.bling2_bridge_completar_entrega() as pedidos_completados;

-- Agora o número da nota tem de aparecer.
select count(*)              as pedidos,
       count(invoice_number) as com_numero_nf,
       count(nf_access_key)  as com_chave_nf
from public.carboze_orders
where source_file = 'bling2_bridge' and status <> 'cancelled';

-- E o faturamento segue intocado.
select count(*) filter (where status <> 'cancelled')   as pedidos_reais,
       sum(total) filter (where status <> 'cancelled') as faturamento_real,
       count(*) filter (where status = 'cancelled')    as cancelados
from public.carboze_orders where source_file = 'bling2_bridge';
