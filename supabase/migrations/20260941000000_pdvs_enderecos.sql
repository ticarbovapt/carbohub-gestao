-- ═══════════════════════════════════════════════════════════════════════════
-- PDVs — endereço completo e os pontos que ainda não estavam no cadastro
--
-- A planilha do comercial (75 linhas) passou a trazer o endereço INTEIRO:
-- logradouro, número, bairro, complemento e CEP. Até aqui o banco só tinha
-- cidade e UF — e várias cidades entraram abreviadas ("S.G. Amarante") ou
-- trocadas (Cidade Nova ↔ Cidade das Rosas, erro conhecido da carga de
-- agosto). O endereço vai ser usado para roteirizar visita: endereço errado
-- não dá erro nenhum, dá vendedor dirigindo para o lugar errado.
--
-- ⚠️ A CHAVE É O CNPJ, só-dígitos dos dois lados. Nunca o nome: cada CNPJ é
-- uma filial independente dentro da mesma rede (Posto Amigo tem 6, Via Diesel
-- 2, Postos RCM 19) e casar por nome misturaria endereços de filiais.
-- Só os PDVs SEM documento caem no casamento por nome — e mesmo esses só
-- quando o nome bate com exatamente UMA linha.
--
-- ⚠️ Uma das linhas vem com o CNPJ malformado na planilha
-- (`42.431.461.0001.69`, pontos no lugar de `/` e `-`). Por isso a comparação
-- é sempre `regexp_replace(..., '\D', '', 'g')`, dos DOIS lados. Comparar o
-- texto formatado deixaria o Box 21 de fora sem avisar.
--
-- O QUE ESTA MIGRAÇÃO NÃO FAZ, de propósito:
--
--   • NÃO renomeia PDV. O banco guarda o nome curto que o time usa ("Posto RF
--     Afogados", "Niel Auto Pecas") e a planilha agora escreve outro ("Postos
--     RCM (Afogados)", "Niel Autopeças e Serviços"). Renomear 69 linhas é uma
--     mudança visível que ninguém pediu — a conferência no fim LISTA as
--     divergências para você decidir depois, num passo próprio.
--   • NÃO sobrescreve `legal_name` já preenchida. A regra da carga original
--     vale: a razão social boa é a que está na NOTA FISCAL
--     (`carboze_orders.customer_name`), não a da planilha. Aqui ela só PREENCHE
--     o que está nulo.
--   • NÃO apaga endereço. Linha da planilha sem rua/CEP (Autotech, Gilberto
--     Ferreira da Costa, Posto São Francisco, Posto Ipiranga 405, Posto São
--     Luiz I) não zera o que já existe no banco — `coalesce` em cada campo.
--     Importar "vazio" por cima de dado bom é perda silenciosa.
-- ═══════════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — a planilha vira tabela                                      ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
--
-- Tabela de verdade, não `temp`: no SQL Editor cada bloco é uma sessão nova e
-- uma tabela temporária morreria entre um bloco e o outro. Ela é descartada
-- no BLOCO 7, depois da conferência.

drop table if exists public.pdvs_planilha_2608;

create table public.pdvs_planilha_2608 (
  linha      int primary key,
  cnpj       text,
  nome       text not null,
  razao      text,
  rua        text,
  cidade     text,
  uf         text,
  cep        text,
  pdv_id     uuid,
  casou_por  text,
  -- ⚠️ O "antes" é fotografado no BLOCO 4, ANTES do UPDATE. Sem isso a
  -- conferência compararia a planilha com o que ela mesma acabou de gravar e
  -- daria sempre "nada mudou" — um relatório que só sabe dizer que concorda
  -- consigo mesmo.
  cidade_antes text,
  rua_antes    text
);

-- ⚠️ Comparação de nome SEM ACENTO e em minúsculas. A carga de agosto gravou
-- os nomes em ASCII ('Posto Sao Francisco', 'Alem Mar') e a planilha escreve
-- com acento. `name = 'Posto São Francisco'` não casa nada — e não casar NÃO
-- dá erro: o UPDATE passa calado. Foi exatamente assim que este PDV ficou sem
-- abertura, sem dono e sem mix na migração 20260816.
create or replace function public.carbo_nome_chave(t text)
returns text language sql immutable as $$
  select btrim(regexp_replace(
    translate(lower(coalesce(t, '')),
              'áàâãäéèêëíìîïóòôõöúùûüçñ',
              'aaaaaeeeeiiiiooooouuuucn'),
    '\s+', ' ', 'g'))
$$;

comment on function public.carbo_nome_chave(text) is
  'Nome normalizado (minúsculo, sem acento, espaços colapsados) para casar cadastro vindo de planilha com o que o banco gravou em ASCII.';

insert into public.pdvs_planilha_2608 (linha, cnpj, nome, razao, rua, cidade, uf, cep) values
  (  1, '56034248000128', 'Postos RCM (Afogados)'                                              , 'Afogados Combustíveis LTDA'                                                                           , 'Estrada dos Remédios, 879, Afogados'                                                    , 'Recife'                 , 'PE', '50750-360'),
  (  2, '55756460000136', 'Postos RCM (Angicos)'                                               , 'Angicos Combustíveis LTDA'                                                                            , 'Rod. BR 304, S/N - KM 146, Zona Rural'                                                  , 'Angicos'                , 'RN', '59515-000'),
  (  3, '49695909000109', 'Postos RCM (Aparecida)'                                             , 'Aparecida Combustíveis LTDA'                                                                          , 'Sit. Várzea da Barra, 01, Zona Rual'                                                    , 'Aparecida'              , 'PB', '58823-000'),
  (  4, '46093929000103', 'Postos RCM (Araruna)'                                               , 'Araruna Combustíveis LTDA'                                                                            , 'Rua Luis Targino Pereira, 825, Centro'                                                  , 'Araruna'                , 'PB', '58233-000'),
  (  5, '36885469000100', 'Postos RCM (Cidade das Rosas)'                                      , 'Cidade das Rosas Combustíveis LTDA'                                                                   , 'R. Rosa Barbara, S/N, Jardins — Quadra 30 Lote 01 Lote Cidade das Rosas'                , 'São Gonçalo do Amarante', 'RN', '59293-510'),
  (  6, '36919772000179', 'Postos RCM (Cidade Nova)'                                           , 'Cidade Nova Combustíveis LTDA'                                                                        , 'Av. Solange Nunes do Nascimento, 140, Cidade Nova'                                      , 'Natal'                  , 'RN', '59072-500'),
  (  7, '63636712000111', 'Posto RCM (Estivas)'                                                , 'Estivas Combustíveis LTDA'                                                                            , 'R. Principal, S/N, Centro — Lote Simão'                                                 , 'Extremoz'               , 'RN', '59575-000'),
  (  8, '41127084000106', 'Postos RCM (Estrada do Grude)'                                      , 'Estrada do Grude Combustíveis LTDA'                                                                   , 'Est. RN 160, S/N, Centro'                                                               , 'Extremoz'               , 'RN', '59575-000'),
  (  9, '05114232000194', 'Postos RCM (Fagundes)'                                              , 'Fagundes Combustíveis LTDA'                                                                           , 'R. Venancio Neiva, S/N, Centro — KM O da PB 100'                                        , 'Fagundes'               , 'PB', '58487-000'),
  ( 10, '41346459000129', 'Postos RCM (Flores do Campo)'                                       , 'Flores do Campo Combustíveis LTDA'                                                                    , 'R. Adriana Faria de Oliveira, 111, Jardins — Lote Flores do Campo Quadra 1 - Lote 101-A', 'São Gonçalo do Amarante', 'RN', '59293-852'),
  ( 11, '23681584000103', 'Postos RCM (Galante)'                                               , 'Galante Combustíveis LTDA'                                                                            , 'R. Joacil Menezes de Melo, S/N, Galante'                                                , 'Campina Grande'         , 'PB', '58446-000'),
  ( 12, '55380115000140', 'Postos RCM (Inga)'                                                  , 'Inga Combustíveis LTDA'                                                                               , 'Rod. PB 090 KM 5, S/N, Centro'                                                          , 'Ingá'                   , 'PB', '58380-000'),
  ( 13, '36010401000170', 'Postos RCM (João Câmara)'                                           , 'João Câmara Combustíveis LTDA'                                                                        , 'Av. Antônio Severiano da Câmara, 2933, Centro — KM 105 BR 406'                          , 'João Câmara'            , 'RN', '59550-000'),
  ( 14, '58025861000104', 'Postos RCM (Jucurutu)'                                              , 'Jucurutu Combustíveis LTDA'                                                                           , 'Rod. BR 226, 6942, Pedra do Navio'                                                      , 'Jucurutu'               , 'RN', '59330-000'),
  ( 15, '46850953000140', 'Postos RCM (Macau)'                                                 , 'Macau Combustíveis LTDA'                                                                              , 'R. Presidente Costa e Silva, 276, Porto de São Pedro'                                   , 'Macau'                  , 'RN', '59500-000'),
  ( 16, '40797112000130', 'Postos RCM (Moinho dos Ventos)'                                     , 'Moinho dos Ventos Combustíveis LTDA'                                                                  , 'Av. Alcides Araújo, S/N, Centro'                                                        , 'Extremoz'               , 'RN', '59575-000'),
  ( 17, '31196786000198', 'Postos RCM (Nova Parnamirim)'                                       , 'Nova Parnamirim Combustíveis LTDA'                                                                    , 'Av. Olavo Lacerda Montenegro, 3545, Parque das Nações'                                  , 'Parnamirim'             , 'RN', '59158-400'),
  ( 18, '56004670000130', 'Postos RCM (Tacaruna)'                                              , 'Tacaruna Combustíveis LTDA'                                                                           , 'Av. Cruz Cabuga, 991, Santo Amaro'                                                      , 'Recife'                 , 'PE', '50040-000'),
  ( 19, '42879738000110', 'Postos RCM (Tacima)'                                                , 'Tacima Combustíveis LTDA'                                                                             , 'Rod. PB 073 KM 2, S/N, Zona Urbana'                                                     , 'Tacima'                 , 'PB', '58240-000'),
  ( 20, '23099667000199', 'Autotech'                                                           , 'J & V - Comércio e Serviços Veicular LTDA'                                                            , null                                                                                     , 'Natal'                  , 'RN', null       ),
  ( 21, '27246573000156', 'Niel Autopeças e Serviços'                                          , 'Bruna Rafaela Pereira Segundo Autopeças'                                                              , 'R. Adolfo Gordo, 3812, Cidade da Esperança'                                             , 'Natal'                  , 'RN', '59070-100'),
  ( 22, '09111857000153', 'Sofiat (Oficina Bosch Car Service)'                                 , 'JoséE de Arimatea Bezerra Morais'                                                                     , 'Av. Governador Tarcisio de Vasconcelos Maia, 2172, Cendelária — Lote 103'               , 'Natal'                  , 'RN', '59066-035'),
  ( 23, '30988332000197', 'Multimarcas Serviços'                                               , 'Hilton Carlos da Silva'                                                                               , 'R. Padre Germano, 174, Nova Descoberta'                                                 , 'Natal'                  , 'RN', '59075-390'),
  ( 24, '58170370000157', 'Rede Prime'                                                         , 'Rede Prime Comércio e Serviços LTDA'                                                                  , 'R. Rio Pium, 201, Emaús'                                                                , 'Parnamirim'             , 'RN', '59149-105'),
  ( 25, '61555340000173', 'Só Pesado Diesel'                                                   , 'Só Pesado Peças e Serviços LTDA'                                                                      , 'R. São Miguel, 193, Rosa dos Ventos'                                                    , 'Parnamirim'             , 'RN', '59141-635'),
  ( 26, '19886707000175', 'Centro Automotivo ZAP'                                              , 'Centro Automotivo ZAP LTDA'                                                                           , 'Av. Duque de Caxias, 695, Praia das Palmeiras'                                          , 'Caraguatatuba'          , 'SP', '11666-520'),
  ( 27, '48396144000135', 'Além Mar'                                                           , 'Alem Mar Construções & Cia LTDA'                                                                      , 'Rod. Miguel Arraes de Alencar BR 363, S/N, Floresta Nova — Parte A'                     , 'Fernando de Noronha'    , 'PE', '53991-180'),
  ( 28, '08562870000328', 'Coopdiesel'                                                         , 'Coopdiesel - Cooperativa de Pessoas Físicas e Jurídicas no Segmento de Transportes em Geral'          , 'R. Guanabara, 634, Nossa Senhora da Penha'                                              , 'Araguari'               , 'MG', '38446-388'),
  ( 29, '60957784002973', 'Della Via Pneus'                                                    , 'Della Via Pneus LTDA'                                                                                 , 'Av. Nossa Senhora de Fátima, 272, Chico de Paula'                                       , 'Santos'                 , 'SP', '11085-200'),
  ( 30, '58214452000156', 'Proboats'                                                           , 'Proboats Serviços LTDA'                                                                               , 'R. João Paulo Pimenta, S/N, Balneário Petropolis — Quadra 030 Lote 0018'                , 'Nísia Floresta'         , 'RN', '59164-000'),
  ( 31, '07346019000133', 'AMG Garage'                                                         , 'AMG Personal Garage LTDA'                                                                             , 'V. Anhanguera, 17200, Parque São Domingos — Armz. 45 Box 45 B'                          , 'São Paulo'              , 'SP', '05112-000'),
  ( 32, '10820614000173', 'B&B Serviços Automotivos'                                           , 'Roberto Tartaglioni Júnior'                                                                           , 'R. dos Trilhos, 2148, Mooca'                                                            , 'São Paulo'              , 'SP', '03168-009'),
  ( 33, '00251951000133', 'Bravo Caminhões Salvador'                                           , 'Bravo Caminhões e Empreendimentos LTDA'                                                               , 'Rod. BR 324, 8890, Águas Claras — Todo Imóvel Concessionária'                           , 'Salvador'               , 'BA', '41310-600'),
  ( 34, '47264537000122', 'Bruno Diesel'                                                       , 'B. de L. Costa LTDA'                                                                                  , 'Rod. BR-101 KM 115, S/N, Cajupiranga'                                                   , 'Parnamirim'             , 'RN', '59156-660'),
  ( 35, '22626556000120', 'Auto Mecânica Gueths'                                               , 'Auto Mecânica Gueths LTDA'                                                                            , 'R. dos Caçadores, 1318, Velha — Garege, Garagem'                                        , 'Blumenau'               , 'SC', '89040-001'),
  ( 36, '17462911000133', 'Guri Autocenter'                                                    , 'Carlos Eduardo Vagner'                                                                                , 'Av. Paraná, 1111, Jardim América'                                                       , 'Paranavaí'              , 'PR', '87705-190'),
  ( 37, '09153852000193', 'Full Service'                                                       , 'JMG Serviços LTDA'                                                                                    , 'R. Itamarati, S/N, Rural, Capitão de Campos'                                            , 'Teresina'               , 'PI', '64270-000'),
  ( 38, '34440324000162', 'Auto Posto 405'                                                     , 'Holanda & Rego Comércio de Combustíveis LTDA'                                                         , 'R. Rota do Sol Dr. Nilton Figueiredo, 64, Chico Cajá'                                   , 'Pau dos Ferros'         , 'RN', '59900-000'),
  ( 39, '53425780000188', 'Posto Interlagos Ale'                                               , 'Fenix Combustíveis e Serviços LTDA'                                                                   , 'Av. das Fronteiras, 1000, Potengi — Lote 62'                                            , 'Natal'                  , 'RN', '59129-200'),
  ( 40, '23994116000199', 'Alan Pneus e Serviços'                                              , 'Alan Dirley de Queiroz Pessoa LTDA'                                                                   , 'R. da Independência, 460, Domingos Gameleira'                                           , 'Pau dos Ferros'         , 'RN', '59900-000'),
  ( 41, '03797507000106', 'Centro Automotivo Arco Iris'                                        , 'Cassio R. Florentino Pneus LTDA'                                                                      , 'Av. Raimundo Pereira de Magalhães, 4450, Pirituba'                                      , 'São Paulo'              , 'SP', '05145-200'),
  ( 42, '42431461000169', 'Box 21 - Super Troca de Óleo'                                       , 'W.D.A. Lubrificantes LTDA'                                                                            , 'Av. Doutor José Artur Nova, 1535, Parque Paulistano'                                    , 'São Paulo'              , 'SP', '08090-000'),
  ( 43, '04233645000397', 'Casa do Caminhão'                                                   , 'Casa do Caminhão Comércio LTDA'                                                                       , 'R. Edgar Dantas, 152, Centro — Loja 152/376'                                            , 'Parnamirim'             , 'RN', '59140-290'),
  ( 44, null            , 'Gilberto Ferreira da Costa'                                         , null                                                                                                   , null                                                                                     , 'Balsas'                 , 'PI', null       ),
  ( 45, '00993944000107', 'Embreagens Jarauto'                                                 , 'Jarauto Indústria e Comércio de Peças LTDA'                                                           , 'Rod. BR 304 BR 226, S/N, Zona da Expansão Urbana Sul — KM 300 Lote 17'                  , 'Macaiba'                , 'RN', '59282-137'),
  ( 46, '63989994000130', 'Flor Real Serviços'                                                 , 'Flor Real Serviços LTDA'                                                                              , 'R. Jaguarari, 5000, Candelária — Lote 2 Quadra GL-2 Condomínio Green Field'             , 'Natal'                  , 'RN', '59064-500'),
  ( 47, '52345676000110', 'Posto São Luiz III'                                                 , 'Flor Comércio de Combustíveis LTDA'                                                                   , 'R. Jaguarari, 5000, Candelária — Lote 2 Quadra GL-2 Condomínio Green Field'             , 'Natal'                  , 'RN', '59064-500'),
  ( 48, '46405401000122', 'RC Techcar'                                                         , 'R. R. da S. Lacerda Oficina Automotiva LTDA'                                                          , 'R. Parque dos Viajantes, 214, Parque das Árvores'                                       , 'Parnamirim'             , 'RN', '59154-090'),
  ( 49, '12689295000568', 'Posto Santa Clara'                                                  , 'Flor e Oliveira LTDA'                                                                                 , 'R. Genezio Tomaz, 1220, Centro'                                                         , 'Lagoa Salgada'          , 'RN', '59247-000'),
  ( 50, '12689295000304', 'Posto Amigo Brejinho'                                               , 'Flor e Oliveira LTDA'                                                                                 , 'Av. Antônio Alves Pessoa, 1945, Centro'                                                 , 'Brejinho'               , 'RN', '59219-000'),
  ( 51, '35751096000104', 'Posto Amigo Alecrim'                                                , 'Migra Combustíveis LTDA'                                                                              , 'Av. Almirante Alexandrino de Alencar, 593, Alecrim'                                     , 'Natal'                  , 'RN', '59030-350'),
  ( 52, '12689295000134', 'Posto Amigo Flor Macaíba'                                           , 'Flor e Oliveira LTDA'                                                                                 , 'Av. Eustaquio Alves de Farias, 75, Ferreiro Torto — A'                                  , 'Macaíba'                , 'RN', '59280-000'),
  ( 53, '12689295000215', 'Posto Amigo Flor Natal'                                             , 'Flor e Oliveira LTDA'                                                                                 , 'Av. Gov. Tarcisio de Vasconcelos Maia, 1450, Candelária — A'                            , 'Natal'                  , 'RN', '59065-780'),
  ( 54, '12689295000720', 'Posto São Cristovão'                                                , 'Flor e Oliveira LTDA'                                                                                 , 'R. Dr. Pedro Matos, 646, Auta de Souza'                                                 , 'Macaiba'                , 'RN', '59280-000'),
  ( 55, '37647991000109', 'Power Chips'                                                        , 'D & D Serviços de Instalação, Manutenção e Reparação de Veículos e Comércio de Peças Automotores LTDA', 'R. Coronel Fernando Machado, 701, Curado'                                               , 'Recife'                 , 'PE', '50910-365'),
  ( 56, '08693517000115', 'Posto São Luiz II'                                                  , 'Luiz Flor & Filhos LTDA'                                                                              , 'Av. Prudente de Morais, 4476 - Lagoa Nova'                                              , 'Natal'                  , 'RN', '59063-200'),
  ( 57, '24363368000182', 'Posto São Luiz IV'                                                  , 'Flor & Cia LTDA'                                                                                      , 'Av. Prudente de Morais, 2056, Barro Vermelho'                                           , 'Natal'                  , 'RN', '59022-400'),
  ( 58, '11427399000108', 'Auto Posto João & Maria'                                            , 'Distribuidora Patu LTDA'                                                                              , 'Av. Olavo Lacerda Montenegro, 4273, Parque das Árvores — Quadra K Lote 16'              , 'Parnamirim'             , 'RN', '59154-350'),
  ( 59, '27112266000182', 'Garage Nihon (Nova NB)'                                             , 'Nova NB Comércio de Peças LTDA'                                                                       , 'Av. Brasil, 1923, Jardim Chapadão — Loja A'                                             , 'Campinas'               , 'SP', '13070-178'),
  ( 60, '26730240000135', 'HM Centro Automotivo'                                               , 'Higo Luiz Vieira de Mendonça'                                                                         , 'Av. Bela Parnamirim, 933, Monte Castelo'                                                , 'Parnamirim'             , 'RN', '59146-370'),
  ( 61, '26728025000108', 'Próspera Geradores'                                                 , 'Próspera Geradores e Serviços LTDA'                                                                   , 'Av. Olavo Lacerda Montenegro,4369, Parque da Árvores — Galpão 02 Loja 06'               , 'Parnamirim'             , 'RN', '59154-350'),
  ( 62, '24708130000141', 'RN Racing'                                                          , 'M. G. Dos Santos Pereira'                                                                             , 'R. Manoel Felipe, 26 - Dix-Sept Rosado'                                                 , 'Natal'                  , 'RN', '59054-190'),
  ( 63, '01937258000262', 'Via Diesel Mossoró'                                                 , 'Via Diesel Distribuidora de Veículos Motores e Peças LTDA'                                            , 'Av. Wilson Rosado, S/N, Dix-Sept Rosado'                                                , 'Mossoró'                , 'RN', '59633-400'),
  ( 64, '01937258000181', 'Via Diesel Parnamirim'                                              , 'Via Diesel Distribuidora de Veículos Motores e Peças LTDA'                                            , 'Rod. BR 101, S/N, Distrito Industrial — KM 8'                                           , 'Parnamirim'             , 'RN', '59150-000'),
  ( 65, '57653140000186', 'GreenLub'                                                           , 'Cássio dos Santos Pereira LTDA'                                                                       , 'Av. Olavo Lacerda Montenegro, 5330, Parque da Árvores — Box Complexo B'                 , 'Parnamirim'             , 'RN', '59154-350'),
  ( 66, '05620241000157', 'Posto Lagoa Nova'                                                   , 'Vilamar Comércio de Combustíveis e Lubrificantes LTDA'                                                , 'Av. José Milton de Morais, 517, Centro'                                                 , 'Pereiro'                , 'CE', '63460-000'),
  ( 67, null            , 'Posto São Francisco'                                                , null                                                                                                   , null                                                                                     , 'São Miguel do Oeste'    , 'RN', null       ),
  ( 68, '16607328000100', 'CarPower (microdistribuidores)'                                     , 'CarPower Serviços Automotivos LTDA'                                                                   , 'Av. Eduardo Froes da Mota, 280, Santa Mônica'                                           , 'Feira de Santana'       , 'BA', '44078-015'),
  ( 69, '08533625000120', 'Auto Diesel (microdistribuidores)'                                  , 'J.C. da Silva'                                                                                        , 'R. Antônio Carlos Souto, n° 746 - Francisco Simão dos Santos Figueira'                  , 'Garanhuns'              , 'PE', '55292-605'),
  ( 70, null            , 'Adriano Auto Center'                                                , null                                                                                                   , 'R. Ver. José Severiano da Câmara, 40 A - Centro'                                        , 'João Câmara'            , 'RN', '59550-000'),
  ( 71, null            , 'Posto Ipiranga 405'                                                 , null                                                                                                   , null                                                                                     , 'Pau dos Ferros'         , null, null       ),
  ( 72, null            , 'Posto São Luiz I (Shell)'                                           , null                                                                                                   , null                                                                                     , null                     , null, null       ),
  ( 73, '11796041000152', 'Ed-Link Motos - Conectando sonhos, Acelerando resultados (Ed Motos)', 'Ed-Link Telecomunicações e Locações LTDA'                                                             , 'R. Maristela Alves, 595, Felipe Camarão'                                                , 'Natal'                  , 'RN', '59074-340'),
  ( 74, '62670404000140', 'Zeh Motoca'                                                         , 'RDN Comércio e Serviço LTDA'                                                                          , 'Rua Jaguarari, 1871, Lagoa Nova'                                                        , 'Natal'                  , 'RN', '59064-500'),
  ( 75, '26292126000170', 'Posto Senador'                                                      , 'Revise Combustíveis LTDA'                                                                             , 'Av. Capitão-Mor Gouveia, 2232, Cidade da Esperança'                                     , 'Natal'                  , 'RN', '59070-400');

-- Conferência do bloco: tem de dizer 75.
select count(*) as linhas_carregadas,
       count(cnpj) as com_cnpj,
       count(*) - count(cnpj) as sem_documento
from public.pdvs_planilha_2608;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — casar por CNPJ                                              ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

update public.pdvs_planilha_2608 s
set pdv_id = p.id, casou_por = 'cnpj'
from public.pdvs p
where s.cnpj is not null
  and regexp_replace(coalesce(p.cnpj, ''), '\D', '', 'g') = s.cnpj;

select count(*) filter (where pdv_id is not null) as casadas_por_cnpj,
       count(*) filter (where pdv_id is null)     as ainda_sem_par
from public.pdvs_planilha_2608;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 3 — casar por nome, só o que sobrou                             ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
--
-- O `= 1` é a guarda que importa: se o nome casar com DOIS PDVs, nenhum é
-- escolhido. Escrever o endereço de uma filial na outra é pior do que deixar
-- a linha sem par — a linha sem par aparece na conferência; o endereço
-- trocado, não.

update public.pdvs_planilha_2608 s
set pdv_id = (
      select p.id from public.pdvs p
      where public.carbo_nome_chave(p.name) = public.carbo_nome_chave(s.nome)
      limit 1
    ),
    casou_por = 'nome'
where s.pdv_id is null
  and (select count(*) from public.pdvs p
       where public.carbo_nome_chave(p.name) = public.carbo_nome_chave(s.nome)) = 1;

select casou_por, count(*) from public.pdvs_planilha_2608 group by 1 order by 1;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 4 — o endereço entra                                            ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
--
-- Todo campo é `coalesce(planilha, banco)`: a planilha só ESCREVE onde tem
-- dado. Cinco linhas dela vêm sem endereço nenhum, e importar o vazio por
-- cima apagaria cadastro bom.
--
-- `cnpj` e `legal_name` entram apenas quando o banco está vazio — o CNPJ
-- porque a linha pode ter sido criada à mão pela tela, sem documento; a razão
-- social porque a boa é a da nota fiscal, não a da planilha.

-- A foto do "antes", primeiro.
update public.pdvs_planilha_2608 s
set cidade_antes = p.address_city, rua_antes = p.address_street
from public.pdvs p
where p.id = s.pdv_id;

update public.pdvs p
set address_street = coalesce(s.rua,    p.address_street),
    address_city   = coalesce(s.cidade, p.address_city),
    address_state  = coalesce(s.uf,     p.address_state),
    address_zip    = coalesce(s.cep,    p.address_zip),
    cnpj           = coalesce(nullif(btrim(p.cnpj), ''), s.cnpj),
    legal_name     = coalesce(nullif(btrim(p.legal_name), ''), s.razao),
    updated_at     = now()
from public.pdvs_planilha_2608 s
where p.id = s.pdv_id;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 5 — os que ainda não existiam                                   ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
--
-- Entram como 'registered', nunca 'active': é o status que a 20260816 criou
-- justamente para "existe na planilha e ainda não vende". Marcar de ativo
-- infla a contagem de PDVs ativos, que é o número que a diretoria olha.
-- Quem confirmar a operação muda para 'active' pela tela.
--
-- `pdv_code` vai nulo de propósito — o gatilho `set_pdv_code` gera o
-- PDV-0000 seguinte.

insert into public.pdvs (name, legal_name, cnpj, address_street, address_city,
                         address_state, address_zip, status, notes)
select s.nome, s.razao, s.cnpj, s.rua, s.cidade, s.uf, s.cep, 'registered',
       'Entrou pela planilha do comercial de agosto/2026. Confirmar operação antes de marcar como ativo.'
from public.pdvs_planilha_2608 s
where s.pdv_id is null
  -- ⚠️ E o nome não pode já existir no cadastro. Uma linha chega aqui por dois
  -- caminhos: ou é ponto novo de verdade, ou o BLOCO 3 se RECUSOU a casar
  -- porque o nome bateu com mais de um PDV. No segundo caso, inserir criaria
  -- a terceira cópia do mesmo nome e enterraria a ambiguidade. Ela fica de
  -- fora e aparece na conferência (b), para alguém resolver à mão.
  and not exists (
    select 1 from public.pdvs p
    where public.carbo_nome_chave(p.name) = public.carbo_nome_chave(s.nome)
  );

-- E o vínculo volta para a planilha, para a conferência do BLOCO 6 enxergar
-- as linhas recém-criadas como casadas.
-- O casamento aqui é pelo nome MAIS a marca deixada em `notes` no INSERT
-- acima. Só pelo nome, uma linha que ficou sem par por ambiguidade (duas
-- filiais com o mesmo nome) seria ligada a uma delas ao acaso e a conferência
-- diria "tudo casado" — o relatório mentindo é pior que a linha sem par.
update public.pdvs_planilha_2608 s
set pdv_id = p.id, casou_por = 'inserido'
from public.pdvs p
where s.pdv_id is null
  and p.notes = 'Entrou pela planilha do comercial de agosto/2026. Confirmar operação antes de marcar como ativo.'
  and public.carbo_nome_chave(p.name) = public.carbo_nome_chave(s.nome);


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 6 — conferência                                                 ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- (a) Como cada linha da planilha foi resolvida. Nenhuma pode ficar sem par.
select casou_por, count(*) as linhas
from public.pdvs_planilha_2608
group by 1 order by 1;

-- (b) ⚠️ Linha sem par é linha que NÃO entrou — nem atualizou, nem foi criada.
--     Tem de vir vazia. Se vier alguma, é nome ambíguo: o cadastro já tem dois
--     PDVs com aquele nome e a migração se recusou a escolher. Resolva à mão
--     (apague a duplicata ou preencha o CNPJ) e rode os BLOCOS 2 a 5 de novo.
select s.linha, s.nome, s.cnpj,
       (select count(*) from public.pdvs p
        where public.carbo_nome_chave(p.name) = public.carbo_nome_chave(s.nome))
         as pdvs_com_esse_nome
from public.pdvs_planilha_2608 s
where s.pdv_id is null order by s.linha;

-- (c) O antes/depois de quem mudou de cidade — aqui aparecem as abreviações
--     ("S.G. Amarante" → "São Gonçalo do Amarante") e a troca conhecida entre
--     Cidade Nova e Cidade das Rosas.
select p.pdv_code, p.name, s.cidade_antes as cidade_antes, p.address_city as cidade_agora,
       p.address_state, p.address_zip
from public.pdvs_planilha_2608 s
join public.pdvs p on p.id = s.pdv_id
where s.cidade_antes is distinct from p.address_city
order by p.name;

-- (d) Quantos PDVs passam a ter endereço de rua. Antes desta migração: 0.
select count(*) filter (where coalesce(btrim(address_street), '') <> '') as com_rua,
       count(*) filter (where coalesce(btrim(address_zip), '')    <> '') as com_cep,
       count(*)                                                          as total
from public.pdvs;

-- (e) ⚠️ Os cinco sem endereço na planilha. Não é bug desta migração: a
--     planilha não traz. Ficam listados para alguém completar.
select linha, nome, cidade, uf from public.pdvs_planilha_2608
where rua is null order by linha;

-- (f) ⚠️ Nome do banco ≠ nome da planilha. NADA foi renomeado; esta lista
--     existe para a decisão de renomear ser um passo próprio e consciente.
select p.pdv_code, p.name as nome_no_banco, s.nome as nome_na_planilha
from public.pdvs_planilha_2608 s
join public.pdvs p on p.id = s.pdv_id
where public.carbo_nome_chave(p.name) <> public.carbo_nome_chave(s.nome)
order by p.name;

-- (g) O que foi criado agora.
select p.pdv_code, p.name, p.address_city, p.address_state, p.status
from public.pdvs_planilha_2608 s
join public.pdvs p on p.id = s.pdv_id
where s.casou_por = 'inserido'
order by p.name;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 7 — descartar a planilha (só depois de conferir o BLOCO 6)      ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

drop table if exists public.pdvs_planilha_2608;
