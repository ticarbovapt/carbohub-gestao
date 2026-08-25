-- ═══════════════════════════════════════════════════════════════════════════
-- Auditoria de expedição (25/08/2026) × o que o NOSSO sistema sabe
--
-- ⚠️ ANÁLISE, não migração. Cria uma tabela de trabalho, responde e some no
-- BLOCO 9. Nada de produção é alterado — nenhum UPDATE, nenhum INSERT fora da
-- tabela de staging.
--
-- ── O que a auditoria externa NÃO conseguiu responder ─────────────────────
--
-- Ela mesma diz, no resumo: "A prova real é o rastreio: se o código existe mas
-- nunca teve movimentação, o volume não saiu de fato." E foi até onde dava —
-- cruzou Bling × LogHouse × Melhor Envio, que são três fotografias de INTENÇÃO.
--
-- O que falta a ela é o quarto lado: o MOVIMENTO. `rastreio_envios` e
-- `rastreio_eventos` guardam o trajeto real de cada código, com data de
-- postagem e de entrega. É isso que separa "a LogHouse deu baixa" de "o cliente
-- recebeu".
--
-- Por isso este arquivo responde a pergunta que a planilha deixou aberta:
-- QUEM RECEBEU e QUEM NÃO RECEBEU.
--
-- ⚠️ Uma NF pode aparecer em DUAS categorias da planilha (a 397, a 459, a 498 e
-- a 501 estão em "parado no CD" e em "sem rastreio" ao mesmo tempo). A chave da
-- staging é (nf, categoria), nunca só a nf — senão o INSERT quebra e some a
-- metade das linhas.
-- ═══════════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — a planilha vira tabela                                      ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

drop table if exists public.aud_expedicao;
drop table if exists public.aud_etiquetas;

create table public.aud_expedicao (
  nf              int not null,
  data_nf         date,
  situacao_nf     text,
  cliente         text,
  valor           numeric(12,2),
  rastreio        text,
  status_loghouse text,
  metodo          text,
  categoria       text not null,
  primary key (nf, categoria)
);

insert into public.aud_expedicao
  (nf, data_nf, situacao_nf, cliente, valor, rastreio, status_loghouse, metodo, categoria) values
  (558, date '2026-08-25', 'Autorizada'   , 'Leonardo Amaral da Silva Bezerra'                 , 77.73  , 'ME262CNEEJ0BR'             , 'Processado'      , 'Jadlog'                , 'parado_no_cd'         ),
  (557, date '2026-08-25', 'Autorizada'   , 'Cleber Godoy'                                     , 74.57  , 'ME262CN7F85BR'             , 'Processado'      , 'Jadlog'                , 'parado_no_cd'         ),
  (554, date '2026-08-25', 'Emitida DANFE', 'Roberval de Carvalho'                             , 66.9   , '888030896670895'           , 'Em Empacotamento', 'Outro'                 , 'parado_no_cd'         ),
  (498, date '2026-08-22', 'Emitida DANFE', 'Carlos Ribeiro'                                   , 284.0  , null                        , 'Em Empacotamento', 'Melhor Envio'          , 'parado_no_cd'         ),
  (545, date '2026-08-24', 'Emitida DANFE', 'Edvaldo Farias'                                   , 76.66  , 'ME262CLKZL0BR'             , 'Empacotado'      , 'Jadlog'                , 'parado_no_cd'         ),
  (544, date '2026-08-24', 'Emitida DANFE', 'Hiro Gushiken'                                    , 68.44  , 'ME262CLIWZ0BR'             , 'Empacotado'      , 'Jadlog'                , 'parado_no_cd'         ),
  (539, date '2026-08-24', 'Emitida DANFE', 'Alexandre soares'                                 , 74.34  , '888030894815465'           , 'Empacotado'      , 'Outro'                 , 'parado_no_cd'         ),
  (535, date '2026-08-23', 'Emitida DANFE', 'Josinaldo Mariano dos Santos'                     , 76.56  , '888030890397315'           , 'Empacotado'      , 'Outro'                 , 'parado_no_cd'         ),
  (528, date '2026-08-23', 'Emitida DANFE', 'Antonio Gabriel C. Batista'                       , 159.5  , '888030894221713'           , 'Empacotado'      , 'Outro'                 , 'parado_no_cd'         ),
  (501, date '2026-08-22', 'Emitida DANFE', 'Jorge Luiz Barreto Coutinho'                      , 119.8  , null                        , 'Empacotado'      , 'Melhor Envio'          , 'parado_no_cd'         ),
  (500, date '2026-08-22', 'Emitida DANFE', 'Antonio Jose De Souza'                            , 167.09 , '888030893912331'           , 'Empacotado'      , 'Outro'                 , 'parado_no_cd'         ),
  (499, date '2026-08-22', 'Emitida DANFE', 'Alberto Kobori'                                   , 153.45 , '888030894842692'           , 'Empacotado'      , 'Outro'                 , 'parado_no_cd'         ),
  (497, date '2026-08-22', 'Emitida DANFE', 'Emerson Sebastiao Magalhaes'                      , 237.52 , 'AP398128280BR'             , 'Empacotado'      , 'Correios'              , 'parado_no_cd'         ),
  (496, date '2026-08-22', 'Emitida DANFE', 'ADRIANO Monteiro Barbosa'                         , 69.14  , 'AD833318093BR'             , 'Empacotado'      , 'Correios'              , 'parado_no_cd'         ),
  (495, date '2026-08-22', 'Emitida DANFE', 'Paulo Mozer'                                      , 134.23 , '888030892455498'           , 'Empacotado'      , 'Outro'                 , 'parado_no_cd'         ),
  (493, date '2026-08-22', 'Emitida DANFE', 'Celso Ritter'                                     , 168.74 , 'ME262CJCYW0BR'             , 'Empacotado'      , 'Jadlog'                , 'parado_no_cd'         ),
  (492, date '2026-08-22', 'Emitida DANFE', 'Aroldo Cezar Oliveira'                            , 72.82  , '888030893900461'           , 'Empacotado'      , 'Outro'                 , 'parado_no_cd'         ),
  (491, date '2026-08-22', 'Emitida DANFE', 'Robson Gama'                                      , 72.17  , 'AD828593455BR'             , 'Empacotado'      , 'Correios'              , 'parado_no_cd'         ),
  (489, date '2026-08-22', 'Emitida DANFE', 'Ezequias Nascimento'                              , 136.52 , 'ME262CJBJX0BR'             , 'Empacotado'      , 'Jadlog'                , 'parado_no_cd'         ),
  (488, date '2026-08-22', 'Emitida DANFE', 'Ezequias Nascimento'                              , 166.77 , 'ME262CJBJ77BR'             , 'Empacotado'      , 'Jadlog'                , 'parado_no_cd'         ),
  (481, date '2026-08-21', 'Emitida DANFE', 'Carlos Alberto de Carvalho Gomes'                 , 81.0   , 'AV090506795BR'             , 'Empacotado'      , 'Correios'              , 'parado_no_cd'         ),
  (480, date '2026-08-21', 'Emitida DANFE', 'Marcio De Azevedo'                                , 66.55  , 'MEL47826557719FMXDF01'     , 'Empacotado'      , 'Mercado Livre Envios'  , 'parado_no_cd'         ),
  (471, date '2026-08-21', 'Emitida DANFE', 'Lucas Padilha Barbosa'                            , 195.71 , 'AP402554391BR'             , 'Empacotado'      , 'Shopee Correios'       , 'parado_no_cd'         ),
  (459, date '2026-08-20', 'Emitida DANFE', 'Kleber Costa Vieira'                              , 284.0  , null                        , 'Empacotado'      , 'Melhor Envio'          , 'parado_no_cd'         ),
  (443, date '2026-08-20', 'Emitida DANFE', 'Fabio Rogerio De Oliveira'                        , 149.5  , 'MEL47814830924FMXDF01'     , 'Empacotado'      , 'Mercado Livre Envios'  , 'parado_no_cd'         ),
  (437, date '2026-08-19', 'Emitida DANFE', 'Nelson Antonio Grangeiro Goncalves'               , 168.35 , 'MEL47812813828FMXDF01'     , 'Empacotado'      , 'Mercado Livre Envios'  , 'parado_no_cd'         ),
  (397, date '2026-08-17', 'Emitida DANFE', 'David Eduardo Camargo'                            , 149.5  , null                        , 'Empacotado'      , 'Mercado Livre Envios'  , 'parado_no_cd'         ),
  (265, date '2026-08-11', 'Emitida DANFE', 'Marco Aurelio Schopf'                             , 59.9   , 'MEL47744284977FMDOF01'     , 'Empacotado'      , 'Mercado Livre Agendado', 'parado_no_cd'         ),
  (251, date '2026-08-10', 'Emitida DANFE', 'Geraldo Magela Da Luz'                            , 149.5  , 'BCJVERNKH5NXHPDEPYTD4WY32U', 'Empacotado'      , 'Mercado Livre Envios'  , 'parado_no_cd'         ),
  (1  , date '2026-06-16', 'Cancelada'    , 'Gilberto Fernandes'                               , 154.49 , 'AD575858122BR'             , 'Expedido'        , 'Mercado Livre Correios', 'expedido_sem_etiqueta'),
  (27 , date '2026-06-20', 'Emitida DANFE', 'Kristel SOUZA'                                    , 76.66  , 'ME262A11C13BR'             , 'Expedido'        , 'Melhor Envio'          , 'expedido_sem_etiqueta'),
  (85 , date '2026-07-21', 'Emitida DANFE', 'Gielerson Mauricio Oliveira Mendes'               , 209.4  , null                        , 'Expedido'        , 'Melhor Envio'          , 'expedido_sem_etiqueta'),
  (95 , date '2026-07-23', 'Emitida DANFE', 'Jaime Schiavon'                                   , 119.8  , 'ME262BMM9Y9BR'             , 'Expedido'        , 'Melhor Envio'          , 'expedido_sem_etiqueta'),
  (104, date '2026-07-25', 'Emitida DANFE', 'Abilio Eduardo'                                   , 59.9   , null                        , 'Expedido'        , 'Melhor Envio'          , 'expedido_sem_etiqueta'),
  (105, date '2026-07-25', 'Emitida DANFE', 'Manoel Nogueira De Souza Filho'                   , 149.5  , null                        , 'Expedido'        , 'Melhor Envio'          , 'expedido_sem_etiqueta'),
  (132, date '2026-07-29', 'Cancelada'    , 'Peterson Oliveira'                                , 80.44  , null                        , 'Expedido'        , 'Correios'              , 'expedido_sem_etiqueta'),
  (133, date '2026-07-29', 'Emitida DANFE', 'Tiago Santos De Jesus'                            , 53.91  , null                        , 'Expedido'        , 'Melhor Envio'          , 'expedido_sem_etiqueta'),
  (135, date '2026-07-29', 'Emitida DANFE', 'Jose De Rosa Filho'                               , 59.9   , null                        , 'Expedido'        , 'Melhor Envio'          , 'expedido_sem_etiqueta'),
  (137, date '2026-07-30', 'Cancelada'    , 'Peterson Oliveira'                                , 76.72  , null                        , 'Expedido'        , 'Outro'                 , 'expedido_sem_etiqueta'),
  (138, date '2026-07-30', 'Cancelada'    , 'Peterson Oliveira'                                , 73.68  , null                        , 'Expedido'        , 'Outro'                 , 'expedido_sem_etiqueta'),
  (139, date '2026-07-30', 'Cancelada'    , 'Peterson Oliveira'                                , 73.68  , null                        , 'Expedido'        , 'Outro'                 , 'expedido_sem_etiqueta'),
  (140, date '2026-07-30', 'Cancelada'    , 'Peterson Oliveira'                                , 76.72  , null                        , 'Expedido'        , 'Outro'                 , 'expedido_sem_etiqueta'),
  (141, date '2026-07-30', 'Cancelada'    , 'Peterson Oliveira'                                , 64.59  , null                        , 'Expedido'        , 'Outro'                 , 'expedido_sem_etiqueta'),
  (160, date '2026-08-02', 'Emitida DANFE', 'Claudiane Jeronimo De Medeiros Silva'             , 139.5  , null                        , 'Expedido'        , 'Mercado Livre Agendado', 'expedido_sem_etiqueta'),
  (560, date '2026-08-25', null           , 'Atila Souto'                                      , 75.11  , null                        , null              , null                    , 'nf_sem_rastreio'      ),
  (548, date '2026-08-24', null           , 'Jaqueline Souza'                                  , 142.0  , null                        , null              , null                    , 'nf_sem_rastreio'      ),
  (543, date '2026-08-24', null           , 'LOGHOUSE SOLUCOES EM TRANSPORTES E LOGISTICA LTDA', 2392.0 , null                        , null              , null                    , 'nf_sem_rastreio'      ),
  (541, date '2026-08-24', null           , 'Claudemir Barbatano'                              , 142.0  , null                        , null              , null                    , 'nf_sem_rastreio'      ),
  (501, date '2026-08-22', null           , 'Jorge Luiz Barreto Coutinho'                      , 119.8  , null                        , null              , null                    , 'nf_sem_rastreio'      ),
  (498, date '2026-08-22', null           , 'Carlos Ribeiro'                                   , 284.0  , null                        , null              , null                    , 'nf_sem_rastreio'      ),
  (459, date '2026-08-20', null           , 'Kleber Costa Vieira'                              , 284.0  , null                        , null              , null                    , 'nf_sem_rastreio'      ),
  (430, date '2026-08-19', null           , 'Guilherme Iop'                                    , 151.67 , null                        , null              , null                    , 'nf_sem_rastreio'      ),
  (429, date '2026-08-19', null           , 'Guilherme Iop'                                    , 181.87 , null                        , null              , null                    , 'nf_sem_rastreio'      ),
  (426, date '2026-08-19', null           , 'Jackson de Sousa silva Sousa'                     , 149.5  , null                        , null              , null                    , 'nf_sem_rastreio'      ),
  (421, date '2026-08-19', null           , 'Jose umberto Oliveira'                            , 149.5  , null                        , null              , null                    , 'nf_sem_rastreio'      ),
  (412, date '2026-08-18', null           , 'MarcioJose Neres'                                 , 149.5  , null                        , null              , null                    , 'nf_sem_rastreio'      ),
  (397, date '2026-08-17', null           , 'David Eduardo Camargo'                            , 149.5  , null                        , null              , null                    , 'nf_sem_rastreio'      ),
  (361, date '2026-08-16', null           , 'Carlos Assis'                                     , 209.4  , null                        , null              , null                    , 'nf_sem_rastreio'      ),
  (319, date '2026-08-14', null           , 'CARBO SOLUCOES LTDA'                              , 2304.0 , null                        , null              , null                    , 'nf_sem_rastreio'      ),
  (304, date '2026-08-13', null           , 'Rodolfo Toledo'                                   , 149.5  , null                        , null              , null                    , 'nf_sem_rastreio'      ),
  (275, date '2026-08-12', null           , 'Marco Antonio de Paula'                           , 59.9   , null                        , null              , null                    , 'nf_sem_rastreio'      ),
  (266, date '2026-08-11', null           , 'CENTRO AUTOMOTIVO ZAP LTDA'                       , 16800.0, null                        , null              , null                    , 'nf_sem_rastreio'      ),
  (246, date '2026-08-10', null           , 'CENTRO AUTOMOTIVO ZAP LTDA'                       , 16800.0, null                        , null              , null                    , 'nf_sem_rastreio'      ),
  (236, date '2026-08-09', null           , 'Sergio Janzini Filho'                             , 142.0  , null                        , null              , null                    , 'nf_sem_rastreio'      ),
  (218, date '2026-08-09', null           , 'Gustavo Pedreira'                                 , 149.5  , null                        , null              , null                    , 'nf_sem_rastreio'      ),
  (214, date '2026-08-08', null           , 'Janilson Padilha'                                 , 142.0  , null                        , null              , null                    , 'nf_sem_rastreio'      ),
  (160, date '2026-08-02', null           , 'Claudiane Jeronimo De Medeiros Silva'             , 139.5  , null                        , null              , null                    , 'nf_sem_rastreio'      ),
  (135, date '2026-07-29', null           , 'Jose De Rosa Filho'                               , 59.9   , null                        , null              , null                    , 'nf_sem_rastreio'      ),
  (133, date '2026-07-29', null           , 'Tiago Santos De Jesus'                            , 53.91  , null                        , null              , null                    , 'nf_sem_rastreio'      ),
  (105, date '2026-07-25', null           , 'Manoel Nogueira De Souza Filho'                   , 149.5  , null                        , null              , null                    , 'nf_sem_rastreio'      ),
  (104, date '2026-07-25', null           , 'Abilio Eduardo'                                   , 59.9   , null                        , null              , null                    , 'nf_sem_rastreio'      ),
  (85 , date '2026-07-21', null           , 'Gielerson Mauricio Oliveira Mendes'               , 209.4  , null                        , null              , null                    , 'nf_sem_rastreio'      ),
  (2  , date '2026-05-27', null           , 'LOGHOUSE SOLUCOES EM TRANSPORTES E LOGISTICA LTDA', 4234.5 , null                        , null              , null                    , 'nf_sem_rastreio'      );

create table public.aud_etiquetas (
  transportadora text,
  destinatario   text,
  rastreio       text,
  expiracao      text,
  expirada       boolean
);

insert into public.aud_etiquetas
  (transportadora, destinatario, rastreio, expiracao, expirada) values
  ('Correios SEDEX', 'Francisco Ruiz Garcia', 'AD838526725BR', '01/09 as 21h', false),
  ('Jadlog .Package Centralizado', 'Leonardo Amaral da Silva Bezerra', '617704202', '14/09 as 21h', false),
  ('Jadlog .Package Centralizado', 'Cleber Godoy', '617703841', '14/09 as 21h', false),
  ('JeT Standard', 'Josias Junior', '888030890426697', '14/09 as 21h', false),
  ('JeT Standard', 'Deocleciano B de B Lima', '888030896454700', '14/09 as 21h', false),
  ('JeT Standard', 'Roberval de Carvalho', '888030896670895', '14/09 as 21h', false),
  ('Jadlog .Package Centralizado', 'Kassio Veras', '617703842', '14/09 as 21h', false),
  ('Jadlog .Package Centralizado', 'Milton Sardi', '617505522', '13/09 as 21h', false),
  ('Jadlog .Package Centralizado', 'Edvaldo Farias', '617505523', '13/09 as 21h', false),
  ('Jadlog .Package Centralizado', 'Hiro Gushiken', '617505622', '13/09 as 21h', false),
  ('JeT Standard', 'Alexandre soares', '888030894815465', '13/09 as 21h', false),
  ('Jadlog .Package Centralizado', 'Rodrigo ANDREOLA', '617505624', '13/09 as 21h', false),
  ('Jadlog .Package Centralizado', 'Rodrigo ANDREOLA', '617505627', '13/09 as 21h', false),
  ('JeT Standard', 'Josinaldo Mariano dos Santos', '888030890397315', '13/09 as 21h', false),
  ('Jadlog .Package Centralizado', 'Vinicius GOULART', '617505628', '13/09 as 21h', false),
  ('Correios PAC', 'Claudio Hartwig', 'AP398823418BR', '31/08 as 21h', false),
  ('Jadlog .Package Centralizado', 'Andre CARDOSO', '617475732', '13/09 as 21h', false),
  ('JeT Standard', 'Antonio Gabriel C. Batista', '888030894221713', '13/09 as 21h', false),
  ('Jadlog .Package Centralizado', 'Milton Sales Santos', '617475483', '13/09 as 21h', false),
  ('Jadlog .Package Centralizado', 'Milton Sales Santos', '617475734', '13/09 as 21h', false),
  ('JeT Standard', 'Renato Crepaldi', '888030892726275', '13/09 as 21h', false),
  ('JeT Standard', 'Allan Andrade dos Santos', '888030884000875', '13/09 as 21h', false),
  ('Correios PAC', 'Geraldo de Medeiros', 'AP398137922BR', '31/08 as 21h', false),
  ('Jadlog .Package Centralizado', 'Ataide Matos', '617475485', '13/09 as 21h', false),
  ('JeT Standard', 'Ademar Prado', '888030891120685', '13/09 as 21h', false),
  ('JeT Standard', 'Matheus Dias', '888030894092489', '13/09 as 21h', false),
  ('JeT Standard', 'Matheus Dias', '888030893818564', '13/09 as 21h', false),
  ('JeT Standard', 'Devanir Rezende', '888030891434382', '13/09 as 21h', false),
  ('JeT Standard', 'Devanir Rezende', '888030893152926', '13/09 as 21h', false),
  ('Jadlog .Package Centralizado', 'Carlos do Prado Saad', '617475286', '13/09 as 21h', false),
  ('Jadlog .Package Centralizado', 'Leonardo AlmeidaFreitas', '617474913', '13/09 as 21h', false),
  ('JeT Standard', 'Antonio Jose De Souza', '888030893912331', '13/09 as 21h', false),
  ('JeT Standard', 'Alberto Kobori', '888030894842692', '13/09 as 21h', false),
  ('JeT Standard', 'Paulo Mozer', '888030892455498', '13/09 as 21h', false),
  ('JeT Standard', 'Aroldo Cezar Oliveira', '888030893900461', '13/09 as 21h', false),
  ('Jadlog .Package Centralizado', 'Jaime Schiavon', null, 'EXPIRADO', true),
  ('JeT Standard', 'Edmilson Silva', null, 'EXPIRADO', true),
  ('Loggi Express', 'Jean maturano', null, 'EXPIRADO', true),
  ('Correios PAC', 'Rodrigo Otoni', null, 'EXPIRADO', true),
  ('Loggi Express', 'Waldemar Junior', null, 'EXPIRADO', true),
  ('Loggi Express', 'Peterson Oliveira', null, 'EXPIRADO', true);

-- Conferência: 73 linhas de NF (63 NFs únicas) e 41 etiquetas.
select
  (select count(*) from public.aud_expedicao)                  as linhas_nf,
  (select count(distinct nf) from public.aud_expedicao)         as nfs_unicas,
  (select count(*) from public.aud_etiquetas)                   as etiquetas,
  (select count(*) from public.aud_etiquetas where expirada)    as expiradas;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — de qual Bling é esta série? (rode antes de confiar no resto)║
-- ╚═══════════════════════════════════════════════════════════════════════╝
--
-- ⚠️ A planilha diz "Bling, série 1". Temos DUAS contas Bling, e as duas
-- numeram do zero — `bling_nfe` (matriz) e `bling2_nfe` (filial SP, onde a
-- operação on-line roda). Cruzar com a conta errada devolveria "não encontrei
-- nada" para tudo, e a conclusão natural seria "nosso sistema não tem esses
-- pedidos" — quando o problema seria a consulta.
--
-- O que casar mais é a conta certa. Espero bling2.
select 'bling2' as conta, count(*) as nfs_da_auditoria_encontradas
from public.aud_expedicao a
where exists (select 1 from public.bling2_nfe n where n.numero::text = a.nf::text)
union all
select 'bling1', count(*)
from public.aud_expedicao a
where exists (select 1 from public.bling_nfe n where n.numero::text = a.nf::text);


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 3 — ⭐ A RESPOSTA: quem recebeu e quem não recebeu               ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
--
-- ⚠️ `entregue` aqui é o rastreio da transportadora dizendo entregue, com data.
-- Não é a LogHouse dizendo "expedido", não é o Bling dizendo "atendido" e não
-- é a etiqueta existir. É o único dos quatro que fala do cliente.
--
-- A coluna `veredito` é o que você vai ler:
--   ENTREGUE          — chegou, e temos a data
--   A CAMINHO         — postado e andando
--   PAROU NO CAMINHO  — teve movimento e parou (o pior caso: parece que saiu)
--   NUNCA POSTADO     — código existe, transportadora nunca recebeu o volume
--   SEM CODIGO        — não há o que rastrear

select
  a.nf, a.data_nf, a.cliente, a.valor, a.categoria,
  a.status_loghouse, a.metodo,
  coalesce(a.rastreio, r.codigo)                       as codigo,
  r.transportadora                                     as transp_real,
  r.status                                             as status_rastreio,
  r.postado_em::date                                   as postado,
  r.entregue_em::date                                  as entregue,
  (now()::date - coalesce(r.ultimo_evento_em, a.data_nf::timestamptz)::date) as dias_parado,
  case
    when r.status = 'entregue'                          then 'ENTREGUE'
    when r.status in ('em_transito','saiu_entrega','postado')
         and r.ultimo_evento_em > now() - interval '7 days' then 'A CAMINHO'
    when r.status in ('em_transito','saiu_entrega','postado') then 'PAROU NO CAMINHO'
    when r.status in ('problema','devolvido','cancelado') then upper(r.status)
    when a.rastreio is null and r.codigo is null        then 'SEM CODIGO'
    else                                                     'NUNCA POSTADO'
  end                                                   as veredito
from public.aud_expedicao a
left join public.rastreio_envios r on r.codigo = a.rastreio
where a.situacao_nf is distinct from 'Cancelada'
order by
  case
    when r.status = 'entregue' then 3
    when r.status is not null  then 2
    else 1
  end,
  a.data_nf;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 4 — o placar, em uma tela                                       ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

with v as (
  select a.*, r.status, r.entregue_em, r.ultimo_evento_em,
    case
      when a.situacao_nf = 'Cancelada'                    then 'NF CANCELADA'
      when r.status = 'entregue'                          then 'ENTREGUE'
      when r.status in ('em_transito','saiu_entrega','postado')
           and r.ultimo_evento_em > now() - interval '7 days' then 'A CAMINHO'
      when r.status in ('em_transito','saiu_entrega','postado') then 'PAROU NO CAMINHO'
      when r.status in ('problema','devolvido','cancelado') then upper(r.status)
      when a.rastreio is null                             then 'SEM CODIGO'
      else                                                     'NUNCA POSTADO'
    end as veredito
  from public.aud_expedicao a
  left join public.rastreio_envios r on r.codigo = a.rastreio
)
select veredito, count(*) as casos, count(distinct nf) as nfs,
       to_char(sum(valor), 'FM999G999D00') as valor_total
from v group by 1 order by 2 desc;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 5 — ⚠️ O QUE A PLANILHA NÃO VIU: entregue e ainda "no CD"       ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
--
-- Se aparecer alguma linha aqui, a LogHouse está com o pedido marcado como
-- parado e a transportadora já ENTREGOU ao cliente. Isso não é erro nosso nem
-- da auditoria: é o status da LogHouse desatualizado. Vale conferir antes de
-- alguém ligar para o cliente pedindo desculpa por um pacote que já chegou.

select a.nf, a.cliente, a.status_loghouse, a.rastreio,
       r.status, r.entregue_em::date as entregue_em
from public.aud_expedicao a
join public.rastreio_envios r on r.codigo = a.rastreio
where a.categoria = 'parado_no_cd' and r.status = 'entregue'
order by r.entregue_em;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 6 — as etiquetas não postadas, contra o nosso espelho do ME      ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
--
-- ⚠️ `melhorenvio_envios` é o nosso espelho do painel do Melhor Envio, e
-- `expirado_em`/`postado_em` são carimbos dele — não interpretação nossa.
-- Se o nosso espelho disser POSTADO para uma etiqueta que a planilha listou
-- como "liberada", uma das duas fotos está velha; a data em `postado_em` diz
-- qual.

select e.destinatario, e.transportadora, e.rastreio, e.expiracao, e.expirada,
       m.me_id,
       m.status_me,
       m.gerado_em::date   as gerado,
       m.postado_em::date  as postado_no_espelho,
       m.expirado_em::date as expirado_no_espelho,
       case
         when m.me_id is null        then 'NAO ESTA NO NOSSO ESPELHO'
         when m.postado_em is not null then '⚠️ NOSSO ESPELHO DIZ POSTADO'
         when m.expirado_em is not null then 'EXPIRADA (confirmado)'
         else                             'gerada, nao postada (confirmado)'
       end as confronto
from public.aud_etiquetas e
left join public.melhorenvio_envios m
  on m.tracking = e.rastreio or m.self_tracking = e.rastreio
  or m.protocol = e.rastreio or m.melhorenvio_tracking = e.rastreio
order by e.expirada desc, e.destinatario;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 7 — as 6 etiquetas EXPIRADAS: o frete que já foi pago            ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
--
-- Jaime Schiavon, Edmilson Silva, Jean Maturano, Rodrigo Otoni, Waldemar
-- Junior e Peterson Oliveira. A planilha não traz o valor do frete; o nosso
-- espelho traz. Esta é a conta do prejuízo.

select m.me_id, e.destinatario, e.transportadora,
       m.valor as valor_frete, m.gerado_em::date, m.expirado_em::date, m.status_me
from public.aud_etiquetas e
left join public.melhorenvio_envios m
  on lower(m.destinatario_nome) like '%' || lower(split_part(e.destinatario, ' ', 1)) || '%'
where e.expirada
order by e.destinatario;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 8 — o buraco do nosso lado: o que a esteira NÃO enxergava        ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
--
-- ⚠️ Vale a pena olhar esta lista com atenção. Se o pedido existe no Bling e
-- NÃO tem linha em `rastreio_envios`, o card da esteira nunca vai passar de
-- "NF emitida" — e o cliente não recebe o aviso de "em trânsito" nem o de
-- "entregue", porque a `carbo_msg_fila` depende do avanço de etapa.
--
-- Ou seja: além do volume parado, há um silêncio de comunicação.

select a.nf, a.cliente, a.valor, a.categoria, a.rastreio,
       (r.codigo is not null)                as temos_rastreio,
       (me.me_id is not null)                as temos_no_melhor_envio,
       n.situacao                            as nf_no_nosso_bling
from public.aud_expedicao a
left join public.rastreio_envios r    on r.codigo = a.rastreio
left join public.melhorenvio_envios me on me.tracking = a.rastreio
left join public.bling2_nfe n          on n.numero::text = a.nf::text
where a.situacao_nf is distinct from 'Cancelada'
  and r.codigo is null
order by a.data_nf;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 9 — descartar a tabela de trabalho (só depois de conferir)      ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

drop table if exists public.aud_expedicao;
drop table if exists public.aud_etiquetas;
