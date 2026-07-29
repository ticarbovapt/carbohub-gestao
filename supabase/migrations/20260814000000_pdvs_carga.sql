-- ═══════════════════════════════════════════════════════════════════════════
-- PDVs — carga dos 69 pontos de venda + razão social + índice por dígitos
--
-- REUSA public.pdvs, que já existia com cnpj (índice único), status
-- (active/inactive/suspended), endereço e UF. Ela estava órfã de tela: o hook
-- useCreatePDV existe em src/hooks/usePDV.ts e nenhum componente o importa.
--
-- ⚠️ assigned_licensee_id fica NULO de propósito. O trigger
-- trg_update_pdv_stock_on_order_confirm debita a MESMA quantidade de TODOS os
-- PDVs do licenciado quando um pedido vira 'confirmed'. Com o Posto Amigo
-- (5 filiais) um pedido de 10 unidades tiraria 50. Deixando nulo, o trigger
-- não dispara — e estes PDVs são clientes revendedores, não licenciados.
-- ═══════════════════════════════════════════════════════════════════════════

-- Razão social como sai na NOTA FISCAL. O `name` é o nome comercial, que o
-- time usa e que frequentemente não tem nada a ver: "Arco-íris" fatura como
-- "CASSIO R FLORENTINO PNEUS LTDA".
alter table public.pdvs add column if not exists legal_name text;
comment on column public.pdvs.legal_name is
  'Razão social do faturamento. Preenchida a partir de carboze_orders; o `name` é o nome comercial.';

-- O CNPJ é gravado só com dígitos, mas quem já estava na tabela pode ter
-- pontuação. O índice funcional é o que o trigger de classificação usa.
create index if not exists idx_pdvs_cnpj_digits
  on public.pdvs ((regexp_replace(coalesce(cnpj,''), '\D', '', 'g')))
  where cnpj is not null;

-- ── Os 69 ─────────────────────────────────────────────────────────────────
-- Cidade Nova e Cidade das Rosas entram TROCADOS em relação à planilha:
-- o CNPJ 36.885.469 fatura como "CIDADE DAS ROSAS COMBUSTIVEIS LTDA".
-- Confirmado pelo usuário como erro conhecido da planilha.
insert into public.pdvs (name, address_city, address_state, cnpj, status)
select v.nome, v.cidade, v.uf, v.cnpj, 'active'
from (values
  ('Posto RF Afogados', 'Recife', 'PE', '56034248000128'),
  ('Posto RF Angicos', 'Angicos', 'RN', '55756460000136'),
  ('Posto RF Aparecida', 'Aparecida', 'PB', '49695909000109'),
  ('Posto RF Araruna', 'Araruna', 'PB', '46093929000103'),
  ('Posto RF Cidade das Rosas', 'Natal', 'RN', '36885469000100'),
  ('Posto RF Cidade Nova', 'S.G. Amarante', 'RN', '36919772000179'),
  ('Posto RF Estivas', 'Extremoz', 'RN', '63636712000111'),
  ('Posto RF Estrada do Grude', 'Extremoz', 'RN', '41127084000106'),
  ('Posto RF Fagundes', 'Fagundes', 'PB', '05114232000194'),
  ('Posto RF Flores do Campo', 'S.G. Amarante', 'RN', '41346459000129'),
  ('Posto RF Galante', 'Campina Grande', 'PB', '23681584000103'),
  ('Posto RF Inga', 'Inga', 'PB', '55380115000140'),
  ('Posto RF Joao Camara', 'Joao Camara', 'RN', '36010401000170'),
  ('Posto RF Jucurutu', 'Jucurutu', 'RN', '58025861000104'),
  ('Posto RF Macau', 'Macau', 'RN', '46850953000140'),
  ('Posto RF Moinho dos Ventos', 'Extremoz', 'RN', '40797112000130'),
  ('Posto RF Nova Parnamirim', 'Parnamirim', 'RN', '31196786000198'),
  ('Posto RF Tacaruna', 'Recife', 'PE', '56004670000130'),
  ('Posto RF Tacima', 'Tacima', 'PB', '42879738000110'),
  ('Autotech', 'Natal', 'RN', '23099667000199'),
  ('Niel Auto Pecas', 'Natal', 'RN', '27246573000156'),
  ('Oficina Bosch Car Service', 'Natal', 'RN', '09111857000153'),
  ('Oficina Multimarcas', 'Natal', 'RN', '30988332000197'),
  ('Oficina Rede Prime', 'Parnamirim', 'RN', '58170370000157'),
  ('So Pesado Pecas e Servicos', 'Parnamirim', 'RN', '61555340000173'),
  ('Centro Automotivo Zap', 'Caraguatatuba', 'SP', '19886707000175'),
  ('Alem Mar', 'Noronha', 'PE', '48396144000135'),
  ('Coopdiesel', 'Araguari', 'MG', '08562870000328'),
  ('Della Via Santos', 'Santos', 'SP', '60957784002973'),
  ('Proboats', 'Nisia Floresta', 'RN', '58214452000156'),
  ('AMG Garage', 'Barueri', 'SP', '07346019000133'),
  ('B&B Autos', 'Mooca', 'SP', '10820614000173'),
  ('Bravo Caminhoes Salvador', 'Salvador', 'BA', '00251951000133'),
  ('Bruno Diesel', 'Parnamirim', 'RN', '47264537000122'),
  ('Gueths', 'Blumenau', 'SC', '22626556000120'),
  ('Guri Autocenter', 'Paranavai', 'PR', '17462911000133'),
  ('JMG Servicos', 'Teresina', 'PI', '09153852000193'),
  ('Posto Holanda e Rego', 'Pau dos Ferros', 'RN', '34440324000162'),
  ('Posto Interlagos Ale', 'Natal', 'RN', '53425780000188'),
  ('Alan Pneus', 'Pau dos Ferros', 'RN', '23994116000199'),
  ('Arco-iris', 'Sao Paulo', 'SP', '03797507000106'),
  ('Box 21', 'Sao Paulo', 'SP', '42431461000169'),
  ('Casa do Caminhao', 'Parnamirim', 'RN', '04233645000397'),
  ('Gilberto Ferreira da Costa', 'Balsas', 'PI', null),
  ('Jarauto', 'Macaiba', 'RN', '00993944000107'),
  ('Posto Flor Jaguarari', 'Natal', 'RN', '63989994000130'),
  ('Posto Sao Luiz III Jaguarari', 'Natal', 'RN', '52345676000110'),
  ('RC Techcar', 'Parnamirim', 'RN', '46405401000122'),
  ('Posto Amigo Lagoa Salgada', 'Lagoa Salgada', 'RN', '12689295000568'),
  ('Posto Amigo Brejinho', 'Brejinho', 'RN', '12689295000304'),
  ('Posto Amigo Alecrim', 'Natal', 'RN', '35751096000104'),
  ('Posto Amigo Flor Macaiba', 'Macaiba', 'RN', '12689295000134'),
  ('Posto Amigo Flor Natal', 'Natal', 'RN', '12689295000215'),
  ('Posto Amigo Macaiba', 'Macaiba', 'RN', '12689295000720'),
  ('Powerchips', 'Recife', 'PE', '37647991000109'),
  ('Posto Sao Luiz Flor II', 'Natal', 'RN', '08693517000115'),
  ('Posto Sao Luiz Flor IV', 'Natal', 'RN', '24363368000182'),
  ('Distribuidora Patu', 'Parnamirim', 'RN', '11427399000108'),
  ('Garage Nihon', 'Campinas', 'SP', '27112266000182'),
  ('HM Centro Automotivo', 'Parnamirim', 'RN', '26730240000135'),
  ('Prospera Geradores', 'Parnamirim', 'RN', '26728025000108'),
  ('RN Racing', 'Natal', 'RN', '24708130000141'),
  ('Via Diesel Mossoro', 'Mossoro', 'RN', '01937258000262'),
  ('Via Diesel Parnamirim', 'Parnamirim', 'RN', '01937258000181'),
  ('Green Lub', 'Parnamirim', 'RN', '57653140000186'),
  ('Posto Lagoa Nova', 'Pereiro', 'CE', '05620241000157'),
  ('Posto Sao Francisco', 'Sao Miguel do Oeste', 'RN', null),
  ('CarPower (microdistribuidores)', 'Feira de Santana', 'BA', '16607328000100'),
  ('Auto Diesel (microdistribuidores)', 'Garanhuns', 'PE', '08533625000120')
) as v(nome, cidade, uf, cnpj)
-- Idempotente: rodar de novo não duplica nem sobrescreve quem já existe.
where v.cnpj is not null
  and not exists (
    select 1 from public.pdvs p
    where regexp_replace(coalesce(p.cnpj,''), '\D','','g') = v.cnpj
  );

-- Os dois sem CNPJ (marcados "CPF" na planilha) entram para não sumirem do
-- cadastro, mas NÃO classificam venda sozinhos — sem documento não há como
-- casar com o pedido. Assim que o CPF vier, é um UPDATE.
insert into public.pdvs (name, address_city, address_state, status, notes)
select v.nome, v.cidade, v.uf, 'active',
       'Sem CNPJ/CPF cadastrado — não classifica venda automaticamente até o documento ser preenchido.'
from (values
  ('Gilberto Ferreira da Costa', 'Balsas', 'MA'),
  ('Posto Sao Francisco', 'Sao Miguel', 'RN')
) as v(nome, cidade, uf)
where not exists (select 1 from public.pdvs p where p.name = v.nome);

-- ── Razão social a partir do que JÁ está faturado ─────────────────────────
-- Vale o SISTEMA, não a planilha: é o nome que está na nota fiscal.
update public.pdvs p
set legal_name = sub.razao, updated_at = now()
from (
  select regexp_replace(o.cnpj,'\D','','g') as doc,
         (array_agg(o.customer_name order by coalesce(o.sale_date, o.created_at::date) desc))[1] as razao
  from public.carboze_orders o
  where coalesce(o.cnpj,'') <> '' and coalesce(o.customer_name,'') <> ''
  group by 1
) sub
where regexp_replace(coalesce(p.cnpj,''),'\D','','g') = sub.doc
  and p.legal_name is distinct from sub.razao;

-- ── Conferência ───────────────────────────────────────────────────────────
select count(*) filter (where cnpj is not null)  as com_cnpj,
       count(*) filter (where cnpj is null)      as sem_cnpj,
       count(*) filter (where legal_name is not null) as com_razao_social,
       count(*)                                  as total
from public.pdvs;
