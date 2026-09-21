-- ═══════════════════════════════════════════════════════════════════════════
-- Bling 1 (matriz) passa a ter canal — e a regra do Bling 2 NÃO serve aqui
--
-- Desde 28/08/2026 a matriz vende no Mercado Livre. Esses pedidos entram em
-- `carboze_orders` pela ponte do `bling-sync`, que NÃO grava `segmento` — não
-- é que grave errado: o campo não existe no insert. Resultado: nascem com
-- canal NULO.
--
-- Canal nulo é invisível para o `FILTRO_VENDA_DO_TIME` do Sales, que só tira
-- da tela o que é `segmento = 'online'` E sem vendedor. Então venda de
-- marketplace aparece no `/vendas` do vendedor como se fosse venda do time —
-- sem cidade, sem vendedor, sem nada que diga de onde veio — e soma no
-- faturamento do time em vez de no do on-line.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- ⚠️ O QUE A MEDIÇÃO MUDOU (21/09/2026)
--
-- Meu plano era copiar a regra do Bling 2: `loja ≠ 0 e não ignorada → online`.
-- O censo de `bling_orders.raw_data->'loja'->>'id'` desmentiu isso:
--
--   loja          pedidos   valor          numero_loja        leitura
--   0                 176   R$ 437.217,80  (nulo)             venda direta
--   206071309         145   R$ 398.081,88  (nulo)             NÃO é marketplace
--   206071288          15   R$  43.078,40  (nulo)             NÃO é marketplace
--   206270703          19   R$   2.916,22  2000014753124269   Mercado Livre
--   206097294           2   R$     308,98  2000016905854286   formato de ML
--   206097284           1   R$      59,90  701-5334182-4091438 formato de Amazon
--   206093728          20   R$   3.059,91  100                não classificada
--
-- `loja ≠ 0` teria marcado como on-line R$ 441 mil de venda da equipe
-- (206071309 + 206071288), com clientes PJ e `numero_loja` nulo. Some do
-- `/vendas` de quem vendeu e do faturamento do time, calado.
--
-- ⚠️ A conta 1 e a conta 2 numeram lojas do zero e têm cadastros diferentes.
-- "A regra que funciona lá funciona aqui" é a mesma suposição que já custou
-- caro neste repo com `bling_id` de produto e de contato.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- A REGRA QUE ENTRA: classificação EXPLÍCITA, três estados
--
-- `e_online` é boolean NULO-VEL de propósito:
--
--   true   loja on-line / marketplace  → a ponte grava segmento = 'online'
--   false  venda nossa (direta, time)  → a ponte não mexe no canal
--   null   AINDA NÃO CLASSIFICADA      → a ponte não mexe no canal
--
-- ⚠️ `null` e `false` fazem a MESMA coisa, e mesmo assim são colunas
-- diferentes — porque respondem perguntas diferentes: `false` é "olhei e não é
-- on-line", `null` é "ninguém olhou". Colapsar os dois num boolean faria loja
-- nova nascer parecendo decidida, e loja nova é exatamente o que precisa
-- aparecer numa lista de trabalho. É a lição do `×1` inventado pelo
-- `Math.round`: ausência disfarçada de resposta some da lista.
--
-- ⚠️ E o lado seguro aqui é NÃO classificar. Loja desconhecida continua
-- exatamente como hoje (canal nulo, aparece no /vendas). Errar para "on-line"
-- faria venda do time sumir da tela de quem a fez; errar para "não sei" faz
-- ruído visível. Ruído se vê; venda sumida, não.
--
-- ⚠️ RODE EM BLOCOS.
-- ═══════════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — o cadastro de lojas da conta 1                              ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- Espelha `bling2_lojas` (20260839) no que faz sentido, e diverge no que a
-- medição exigiu: lá o canal é derivado (`≠ 0`), aqui é DECLARADO.
--
-- Loja é CADASTRO, não código — mesma razão do mapa SKU→produto: marcar o
-- Mercado Livre Full amanhã é um INSERT, sem deploy. Com o id escrito na edge
-- function, seria deploy, e quem sabe o número é quem opera.

create table if not exists public.bling_lojas (
  bling_id          bigint primary key,
  -- NULL de propósito: loja recém-descoberta nasce sem nome, e é isso que a
  -- torna visível na lista de pendentes. Batizar é ação humana.
  nome              text,
  -- true = marketplace/loja on-line · false = venda nossa · null = não olhada
  e_online          boolean,
  -- Loja de teste ou que não deve entrar em número nenhum.
  ignorar           boolean not null default false,
  observacao        text,
  primeiro_visto_em timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on table public.bling_lojas is
  'De-para loja → canal do Bling 1 (matriz). e_online é DECLARADO, nunca derivado de "id <> 0": a conta 1 tem lojas ≠ 0 que são venda da equipe (206071309, R$ 398 mil), e a regra do Bling 2 as marcaria como on-line. Três estados: true on-line, false venda nossa, null ainda não classificada (e null NÃO classifica — a loja segue como está hoje).';

comment on column public.bling_lojas.e_online is
  'true → a ponte grava segmento = ''online''. false e NULL não mexem no canal, mas significam coisas diferentes: false é "olhei, não é"; null é "ninguém olhou" — e é o null que alimenta bling_lojas_pendentes.';

drop trigger if exists update_bling_lojas_updated_at on public.bling_lojas;
create trigger update_bling_lojas_updated_at
  before update on public.bling_lojas
  for each row execute function public.update_updated_at_column();

alter table public.bling_lojas enable row level security;

drop policy if exists "interno le bling_lojas" on public.bling_lojas;
create policy "interno le bling_lojas"
  on public.bling_lojas for select
  using (public.carbo_e_time_interno());

drop policy if exists "gestor escreve bling_lojas" on public.bling_lojas;
create policy "gestor escreve bling_lojas"
  on public.bling_lojas for all
  using (public.is_admin(auth.uid()) or public.is_ceo(auth.uid()))
  with check (public.is_admin(auth.uid()) or public.is_ceo(auth.uid()));


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — a pergunta, num lugar só                                    ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- ⚠️ SECURITY DEFINER pelo mesmo motivo da `carbo_natureza_e_bonificacao`:
-- `bling_lojas` tem RLS, e a resposta não pode depender de quem pergunta. Se
-- dependesse, o mesmo pedido seria on-line para um perfil e venda do time para
-- outro.
--
-- ⚠️ Devolve false para loja desconhecida, e isso é o lado SEGURO aqui (ver o
-- cabeçalho): não classificar mantém o estado atual; classificar errado faz
-- venda do time sumir da tela de quem a fez.

create or replace function public.carbo_bling_loja_e_online(p_loja_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select l.e_online and not l.ignorar
       from public.bling_lojas l
      where p_loja_id is not null
        and p_loja_id ~ '^[0-9]+$'
        and l.bling_id = p_loja_id::bigint),
    false
  );
$$;

comment on function public.carbo_bling_loja_e_online(text) is
  'true quando a loja do Bling 1 está cadastrada como on-line e não ignorada. Loja desconhecida ou não classificada devolve false — mantém o comportamento de hoje em vez de arriscar esconder venda da equipe. O regex guarda contra id não numérico vindo do raw_data.';

grant execute on function public.carbo_bling_loja_e_online(text) to authenticated;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 3 — o que já sabemos, e SÓ o que já sabemos                     ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- ⚠️ Três lojas ficam com `e_online = null` DE PROPÓSITO. Duas têm formato de
-- marketplace e uma não, mas somam 23 pedidos e R$ 3.428,79 — e classificar
-- por parecença é o erro que este arquivo inteiro existe para não repetir.
-- Elas aparecem em `bling_lojas_pendentes` até alguém olhar no painel do Bling.

insert into public.bling_lojas (bling_id, nome, e_online, observacao) values
  (0,         'Venda direta (sem loja)',  false,
   'Balcão/venda direta. Mesmo significado da loja 0 no Bling 2.'),
  (206071309, null,                        false,
   'Medido em 21/09/2026: 145 pedidos, R$ 398.081,88, clientes PJ, numero_loja nulo. NAO e marketplace — foi esta loja que provou que a regra "id <> 0 = online" do Bling 2 nao serve aqui.'),
  (206071288, null,                        false,
   'Medido em 21/09/2026: 15 pedidos, R$ 43.078,40, cliente ANGICOS COMBUSTIVEIS, numero_loja nulo. NAO e marketplace.'),
  (206270703, 'Mercado Livre',             true,
   'Mercado Livre da matriz. Primeiro pedido 28/08/2026. numero_loja no formato de pedido do ML (2000014753124269) e cliente com apelido entre parenteses.'),
  (206097294, null,                        null,
   'NAO CLASSIFICADA. 2 pedidos em jun/2026, R$ 308,98. numero_loja tem formato de ML (2000016905854286) — mas parecenca nao e prova. Confira no painel do Bling.'),
  (206097284, null,                        null,
   'NAO CLASSIFICADA. 1 pedido em jun/2026, R$ 59,90. numero_loja 701-5334182-4091438 tem formato de pedido da Amazon. Confira no painel do Bling.'),
  (206093728, null,                        null,
   'NAO CLASSIFICADA. 20 pedidos em jun/2026, R$ 3.059,91. numero_loja = "100", sequencial simples — NAO e formato de marketplace. Pode ser loja propria. Confira no painel do Bling.')
on conflict (bling_id) do nothing;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 4 — a lista de trabalho                                         ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- ⚠️ Loja nova no Bling entra aqui sozinha, porque a view parte de
-- `bling_orders`, não do cadastro. Sem isto, canal novo repetiria o problema
-- de hoje em silêncio: pedidos nascendo sem canal e ninguém sabendo.
--
-- ⚠️ Ela mostra `nunca_cadastrada` e `cadastrada_sem_classificacao` como
-- motivos SEPARADOS. Juntar os dois num "pendente" faria a loja que alguém
-- cadastrou mas não classificou parecer igual à que ninguém viu.

create or replace view public.bling_lojas_pendentes
with (security_invoker = true) as
select
  (o.raw_data -> 'loja' ->> 'id')              as loja_id,
  l.nome,
  case when l.bling_id is null then 'nunca_cadastrada'
       else 'cadastrada_sem_classificacao' end as motivo,
  count(*)                                     as pedidos,
  min(o.data)                                  as primeiro,
  max(o.data)                                  as ultimo,
  sum(coalesce(o.total, 0))                    as valor,
  min(o.numero_loja)                           as exemplo_numero_loja,
  min(o.contato_nome)                          as exemplo_cliente
from public.bling_orders o
left join public.bling_lojas l
  on (o.raw_data -> 'loja' ->> 'id') ~ '^[0-9]+$'
 and l.bling_id = (o.raw_data -> 'loja' ->> 'id')::bigint
where o.raw_data -> 'loja' ->> 'id' is not null
  and (l.bling_id is null or l.e_online is null)
group by 1, 2, 3
order by pedidos desc;

comment on view public.bling_lojas_pendentes is
  'Lojas do Bling 1 que aparecem em pedidos e ainda não têm canal decidido. Parte de bling_orders (não do cadastro), então loja nova entra aqui sozinha — sem isso, canal novo repete em silêncio o problema que a 20260983 corrigiu. Separa "nunca cadastrada" de "cadastrada sem classificação": são estados diferentes.';

grant select on public.bling_lojas_pendentes to authenticated;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 5 — CONFERÊNCIA                                                 ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- (a) O cadastro. Esperado: 7 linhas, UMA com e_online = true (206270703).
select bling_id, nome, e_online, ignorar, left(coalesce(observacao,''), 60) as nota
from public.bling_lojas
order by e_online desc nulls last, bling_id;

-- (b) A pergunta funciona? Esperado: true só para 206270703.
select id,
       public.carbo_bling_loja_e_online(id::text) as e_online
from (values (0), (206071309), (206071288), (206270703),
             (206097294), (206097284), (206093728), (999999999)) as t(id)
order by 2 desc, 1;

-- (c) A lista de trabalho. Esperado: as TRÊS não classificadas, e nada mais.
--     ⚠️ Se aparecer uma loja que não está no BLOCO 3, é canal novo que
--     ninguém anunciou — e é exatamente para isso que esta view existe.
select * from public.bling_lojas_pendentes;

-- (d) ⚠️ O TAMANHO do passado, antes de decidir mexer nele. Quantos pedidos
--     já em carboze_orders viriam de loja on-line e estão com canal errado.
--     ESTA CONSULTA NÃO ALTERA NADA — é o número para você decidir a Fase 3.
select coalesce(co.segmento, '(sem canal)') as canal_hoje,
       count(*)                             as pedidos,
       sum(coalesce(co.total, 0))           as valor,
       min(coalesce(co.sale_date, co.created_at::date)) as primeiro,
       max(coalesce(co.sale_date, co.created_at::date)) as ultimo
from public.carboze_orders co
join public.bling_orders bo
  on bo.bling_id::text = split_part(co.external_ref, '-', 2)
where co.external_ref like 'bling-%'
  and public.carbo_bling_loja_e_online(bo.raw_data -> 'loja' ->> 'id')
group by 1
order by valor desc;
