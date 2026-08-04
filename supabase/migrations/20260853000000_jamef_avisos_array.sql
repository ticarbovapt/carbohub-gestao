-- Jamef: aviso deixa de derrubar a cotação
--
-- `v_avisos` é text[] e recebia `v_avisos || 'frase solta'`. Literal de string
-- sem tipo faz o Postgres escolher a sobrecarga array || array e tentar ler a
-- frase como literal de array — daí o 400 com
--   malformed array literal: "Sem valor de NF: Ad Valorem zerado e GRIS..."
--
-- Ou seja: a cotação morria justamente ao AVISAR que faltava o valor da NF. O
-- aviso, que existia para ajudar, virava o erro.
--
-- A linha do ICMS não quebrava porque usa format(), que devolve text tipado —
-- por isso o bug só aparecia em dois dos três avisos.
--
-- array_append deixa a intenção explícita e não depende de inferência de tipo.

create or replace function public.jamef_cotar(
  p_cep            text,
  p_peso_kg        numeric,
  p_altura_cm      numeric default 0,
  p_largura_cm     numeric default 0,
  p_comprimento_cm numeric default 0,
  p_qtd_volumes    integer default 1,
  p_valor_nf       numeric default 0,
  p_origem_uf      text    default 'RN'
) returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_cep        text;
  v_par        public.jamef_parametros%rowtype;
  v_faixa      public.jamef_cep_faixas%rowtype;
  v_tar        public.jamef_tarifas%rowtype;
  v_cubado     numeric;
  v_taxavel    numeric;
  v_faixa_id   text;
  v_frete_peso numeric;
  v_ad_valorem numeric;
  v_gris       numeric;
  v_pedagio    numeric;
  v_tas        numeric;
  v_ctrc       numeric;
  v_subtotal   numeric;
  v_aliq       numeric;
  v_total      numeric;
  v_icms       numeric;
  v_avisos     text[] := '{}';
begin
  select * into v_par from public.jamef_parametros where id;
  if not found then
    return jsonb_build_object('ok', false, 'motivo',
      'Parâmetros da tabela Jamef não carregados no banco.');
  end if;

  -- A tabela contratada é de saída de Natal. Cotar outra origem com estes
  -- valores daria um número errado com cara de certo.
  if coalesce(p_origem_uf, 'RN') <> v_par.origem_uf then
    return jsonb_build_object(
      'ok', false,
      'motivo', format('Tabela Jamef vale só para origem %s. Para outra origem, cotar com a transportadora.',
                       v_par.origem_label));
  end if;

  v_cep := regexp_replace(coalesce(p_cep, ''), '\D', '', 'g');
  if length(v_cep) <> 8 then
    return jsonb_build_object('ok', false, 'motivo', 'CEP de destino inválido (precisa de 8 dígitos).');
  end if;

  if coalesce(p_peso_kg, 0) <= 0 then
    return jsonb_build_object('ok', false, 'motivo', 'Informe o peso da carga.');
  end if;

  -- 1) CEP → faixa. Empate (linhas duplicadas idênticas) resolve pela mais
  --    específica, que é a de menor amplitude.
  select * into v_faixa
  from public.jamef_cep_faixas
  where v_cep between cep_ini and cep_fim
  order by (cep_fim::bigint - cep_ini::bigint) asc
  limit 1;

  if not found then
    return jsonb_build_object('ok', false, 'motivo',
      'CEP fora da malha da Jamef nesta tabela (AC, AM, RO e RR não são atendidos).');
  end if;

  if v_faixa.sigla is null then
    return jsonb_build_object('ok', false, 'motivo',
      format('%s/%s está na malha mas sem tarifário definido no contrato — consultar a Jamef.',
             initcap(lower(v_faixa.municipio)), v_faixa.uf));
  end if;

  select * into v_tar from public.jamef_tarifas where sigla = v_faixa.sigla;
  if not found then
    return jsonb_build_object('ok', false, 'motivo',
      format('Tarifário %s não encontrado na tabela.', v_faixa.sigla));
  end if;

  if v_faixa.atendimento = 'R' then
    v_avisos := array_append(v_avisos, 'Atendimento por REDESPACHO — confirmar prazo e condição com a Jamef.');
  end if;

  -- 2) Peso taxável = maior entre real e cubado (m³ × fator).
  v_cubado := (coalesce(p_altura_cm,0)/100.0)
            * (coalesce(p_largura_cm,0)/100.0)
            * (coalesce(p_comprimento_cm,0)/100.0)
            * greatest(coalesce(p_qtd_volumes,1), 1)
            * v_par.cubagem_fator;
  v_taxavel := greatest(p_peso_kg, v_cubado);

  -- 3) Frete peso: valor fixo por faixa até 100 kg; acima disso, por kg.
  if    v_taxavel <=  10 then v_faixa_id := 'ate_10kg';    v_frete_peso := v_tar.ate_10kg;
  elsif v_taxavel <=  20 then v_faixa_id := 'de_10_20kg';  v_frete_peso := v_tar.de_10_20kg;
  elsif v_taxavel <=  30 then v_faixa_id := 'de_20_30kg';  v_frete_peso := v_tar.de_20_30kg;
  elsif v_taxavel <=  50 then v_faixa_id := 'de_30_50kg';  v_frete_peso := v_tar.de_30_50kg;
  elsif v_taxavel <=  75 then v_faixa_id := 'de_50_75kg';  v_frete_peso := v_tar.de_50_75kg;
  elsif v_taxavel <= 100 then v_faixa_id := 'de_75_100kg'; v_frete_peso := v_tar.de_75_100kg;
  else  v_faixa_id := 'acima_100kg_por_kg';
        v_frete_peso := round(v_taxavel * v_tar.acima_100kg_por_kg, 2);
  end if;

  -- 4) Demais componentes.
  v_ad_valorem := round(coalesce(p_valor_nf,0) * v_tar.ad_valorem, 2);
  v_gris       := greatest(round(coalesce(p_valor_nf,0) * v_par.gris_percentual, 2), v_par.gris_minimo);
  -- Pedágio: por 100 kg OU FRAÇÃO — sempre arredonda para cima.
  v_pedagio    := round(ceil(v_taxavel / 100.0) * v_par.pedagio_por_100kg, 2);
  v_tas        := case when v_faixa.uf <> v_par.origem_uf then v_par.tas_valor else 0 end;
  v_ctrc       := v_par.taxa_ctrc;

  v_subtotal := v_frete_peso + v_ad_valorem + v_gris + v_pedagio + v_tas + v_ctrc;

  -- 5) ICMS "por dentro": total = base / (1 - alíquota).
  select aliquota into v_aliq from public.jamef_icms_uf where uf = v_faixa.uf;
  if v_aliq is null or v_aliq <= 0 or v_aliq >= 1 then
    v_total  := round(v_subtotal, 2);
    v_icms   := null;
    v_avisos := array_append(v_avisos, format('Sem alíquota de ICMS cadastrada para %s — total exibido SEM ICMS.', v_faixa.uf));
  else
    v_total := round(v_subtotal / (1 - v_aliq), 2);
    v_icms  := round(v_total - v_subtotal, 2);
  end if;

  if coalesce(p_valor_nf, 0) <= 0 then
    v_avisos := array_append(v_avisos, 'Sem valor de NF: Ad Valorem zerado e GRIS no mínimo. Informe o valor da mercadoria para o preço fechar.');
  end if;

  return jsonb_build_object(
    'ok', true,
    'transportadora', 'Jamef',
    'servico', 'Rodoviário (contrato)',
    'tabela', v_par.tabela,
    'vigencia', v_par.vigencia,
    'origem', v_par.origem_label,
    'destino', jsonb_build_object(
      'municipio', initcap(lower(v_faixa.municipio)),
      'uf', v_faixa.uf,
      'ibge', v_faixa.ibge,
      'sigla', v_tar.sigla,
      'tarifario', v_tar.nome,
      'tipo', v_tar.tipo,
      'atendimento', v_faixa.atendimento
    ),
    'peso', jsonb_build_object(
      'real', round(p_peso_kg, 3),
      'cubado', round(v_cubado, 3),
      'taxavel', round(v_taxavel, 3),
      'faixa', v_faixa_id
    ),
    'componentes', jsonb_build_object(
      'frete_peso', v_frete_peso,
      'ad_valorem', v_ad_valorem,
      'gris', v_gris,
      'pedagio', v_pedagio,
      'tas', v_tas,
      'taxa_ctrc', v_ctrc,
      'icms', v_icms
    ),
    'subtotal', round(v_subtotal, 2),
    'icms_aliquota', v_aliq,
    'total', v_total,
    -- A tabela não traz prazo. Inventar dia de entrega seria o pior tipo de
    -- chute: some no meio de números certos.
    'prazo_dias', null,
    'avisos', to_jsonb(v_avisos)
  );
end $$;

comment on function public.jamef_cotar is
  'Cotação Jamef pela tabela de contrato (origem Natal/RN). Retorna jsonb com quebra por componente. Não tem prazo: a tabela não fornece.';

grant execute on function public.jamef_cotar(text, numeric, numeric, numeric, numeric, integer, numeric, text) to authenticated;
