-- ═══════════════════════════════════════════════════════════════════════════
-- Respostas rápidas do atendimento — a barra `/atalho`
--
-- As frases que o time repete todo dia (prazo de entrega, como calcular frete,
-- dados de PIX) hoje são redigitadas a cada conversa. Duas consequências, e a
-- segunda é a que importa: leva tempo, e cada redigitação sai um pouco
-- diferente — o cliente recebe a política de troca com prazo de 7 dias numa
-- conversa e 30 na outra, e ninguém percebe porque as duas parecem certas.
--
-- ⚠️ O texto é COLADO no campo, NUNCA enviado. Quase toda resposta precisa do
-- nome do cliente ou de um ajuste antes de sair, e enviar direto transformaria
-- o atalho numa armadilha: um Enter a mais e o cliente recebeu a frase errada.
-- Isso é regra da TELA, e está escrita aqui porque é ela que explica por que
-- esta tabela não tem nada parecido com "enviar".
--
-- ⚠️ A lista é DO TIME, não de cada um. Lista pessoal faria a mesma frase ser
-- escrita cinco vezes, com cinco redações — que é exatamente o problema que
-- isto existe para resolver. Quem APAGA é que é restrito (ver BLOCO 2).
-- ═══════════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — a tabela                                                    ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

create table if not exists public.carbo_wa_respostas (
  id          uuid primary key default gen_random_uuid(),

  -- O que se digita depois da barra. Guardado JÁ NORMALIZADO (minúsculo, sem
  -- espaço, sem a barra) — ver o gatilho no BLOCO 3.
  atalho      text not null,

  corpo       text not null,

  -- ⚠️ NULLABLE e `on delete set null`, de propósito. A frase é do TIME: quem
  -- a escreveu pode sair da empresa, e a resposta continua servindo. `not null`
  -- com cascade apagaria a lista inteira de quem saiu, calado, no dia do
  -- desligamento — e o atalho que todo mundo usa some sem ninguém ter mexido
  -- nele. O campo serve para saber QUEM PODE APAGAR, não para ser dono.
  criado_por  uuid references auth.users(id) on delete set null,

  criado_em   timestamptz not null default now(),

  -- ⚠️ CHECK no formato, e não só confiança na tela: é ele que garante que o
  -- que está gravado é chamável. `/frete 2` nunca casaria com a barra (ela só
  -- reconhece o que vem SEM espaço logo depois da `/`), e uma resposta
  -- impossível de chamar é pior que resposta nenhuma — ela aparece na lista
  -- prometendo um atalho que não funciona.
  constraint carbo_wa_respostas_atalho_formato
    check (atalho ~ '^[a-z0-9_-]{1,24}$'),

  constraint carbo_wa_respostas_corpo_nao_vazio
    check (length(btrim(corpo)) between 1 and 4096)
);

comment on table public.carbo_wa_respostas is
  'Respostas rapidas do atendimento — a barra /atalho no campo de resposta. A lista e DO TIME (lista pessoal faria a mesma frase ser escrita cinco vezes, com cinco redacoes). O texto e COLADO no campo, nunca enviado: quase toda resposta precisa de ajuste antes de sair.';

comment on column public.carbo_wa_respostas.criado_por is
  'Quem escreveu. NULLABLE e on delete set null: a frase e do time e sobrevive a quem saiu. Serve para saber quem pode APAGAR, nao para ser dono.';

-- ⚠️ ÚNICO, e esta é a decisão que evita o defeito mais difícil de enxergar:
-- dois `/frete` fazem a barra mostrar duas linhas iguais, e qual delas sai é
-- sorte — a mesma doença do mapa de SKU indexado só por SKU, em que o desempate
-- era a ordem que o PostgREST devolvesse. Aqui o sintoma seria o cliente
-- recebendo a frase VELHA, e ninguém ligaria uma coisa à outra.
create unique index if not exists idx_carbo_wa_respostas_atalho
  on public.carbo_wa_respostas (atalho);


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — quem lê, quem escreve, quem apaga                           ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

alter table public.carbo_wa_respostas enable row level security;

-- ⚠️ `carbo_e_time_interno()` e não `using (true)`. O portal de lojas e o de
-- licenciados usam a MESMA tabela `profiles`: sem esta guarda, o lojista lê as
-- respostas internas da Carbo pelo PostgREST — e elas carregam dados de PIX,
-- política de troca e o que mais o time escrever ali.
drop policy if exists carbo_wa_respostas_ler on public.carbo_wa_respostas;
create policy carbo_wa_respostas_ler on public.carbo_wa_respostas
  for select to authenticated
  using (public.carbo_e_time_interno());

-- `criado_por = auth.uid()` no WITH CHECK: sem isso dá para gravar uma resposta
-- no nome de outra pessoa, e o campo que decide quem apaga passa a ser
-- escolhido por quem insere.
drop policy if exists carbo_wa_respostas_criar on public.carbo_wa_respostas;
create policy carbo_wa_respostas_criar on public.carbo_wa_respostas
  for insert to authenticated
  with check (public.carbo_e_time_interno() and criado_por = auth.uid());

-- Editar: só quem escreveu. E o WITH CHECK repete a condição porque USING
-- sozinho deixaria a linha ser editada PARA outra autoria — sair do próprio
-- alcance é a forma silenciosa de furar a regra.
drop policy if exists carbo_wa_respostas_editar on public.carbo_wa_respostas;
create policy carbo_wa_respostas_editar on public.carbo_wa_respostas
  for update to authenticated
  using (public.carbo_e_time_interno() and criado_por = auth.uid())
  with check (public.carbo_e_time_interno() and criado_por = auth.uid());

-- ⚠️ Apagar: quem escreveu OU a chefia. Só o autor não serve: a resposta de
-- quem saiu da empresa ficaria impossível de remover para sempre (e `criado_por`
-- vira NULL nesse dia, então nem o próprio alcance existe mais). A régua da
-- chefia é a MESMA do `carbo_bug_notify_gestores` — copiada aqui, num lugar só,
-- em vez de virar uma função pública nova que se descole daquela com o tempo.
drop policy if exists carbo_wa_respostas_apagar on public.carbo_wa_respostas;
create policy carbo_wa_respostas_apagar on public.carbo_wa_respostas
  for delete to authenticated
  using (
    public.carbo_e_time_interno()
    and (
      criado_por = auth.uid()
      or exists (
        select 1 from public.profiles p
         where p.id = auth.uid()
           and (p.department in ('command','ti_suporte')
             or p.secondary_department in ('command','ti_suporte')
             or p.funcao in ('head','ceo','command')
             or p.secondary_funcao in ('head','ceo','command'))
      )
    )
  );

grant select, insert, update, delete on public.carbo_wa_respostas to authenticated;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 3 — a normalização mora no BANCO                                ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- ⚠️ Aqui, e não na tela, pela mesma razão da dedução de estoque morar na RPC:
-- a tela é um lugar por onde se passa, o banco é o único por onde TODO mundo
-- passa. Sem isto, `/Frete` e `/frete` seriam duas linhas — o índice único não
-- as veria como iguais, e a barra mostraria as duas.
--
-- Ele também tira a `/` que a pessoa digita por reflexo no campo "Atalho": sem
-- isso o CHECK recusaria com uma mensagem de banco na cara de quem só repetiu
-- o que vê na tela.

create or replace function public.carbo_wa_resposta_normaliza()
returns trigger
language plpgsql
as $$
begin
  new.atalho := lower(btrim(btrim(new.atalho), '/'));
  new.corpo  := btrim(new.corpo);
  return new;
end;
$$;

comment on function public.carbo_wa_resposta_normaliza is
  'Normaliza o atalho (minusculo, sem espaco, sem a barra) ANTES do CHECK e do indice unico. No banco e nao na tela: /Frete e /frete seriam duas linhas que o indice unico nao ve como iguais.';

drop trigger if exists trg_carbo_wa_resposta_normaliza on public.carbo_wa_respostas;
create trigger trg_carbo_wa_resposta_normaliza
  before insert or update on public.carbo_wa_respostas
  for each row execute function public.carbo_wa_resposta_normaliza();


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 4 — CONFERÊNCIA. Rode UMA DE CADA VEZ.                          ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- ⚠️ Uma consulta de medição acompanhada de outras no mesmo bloco é consulta
-- que ninguém lê: o SQL Editor mostra só o resultado da ÚLTIMA.

-- (a) A tabela nasceu com RLS ligada e as QUATRO policies?
--     ESPERADO: rls = true, policies = 4.
-- select c.relrowsecurity as rls, count(p.*) as policies
-- from pg_class c
-- left join pg_policy p on p.polrelid = c.oid
-- where c.relname = 'carbo_wa_respostas'
-- group by 1;

-- (b) A normalização funciona? Grave uma e veja o que ficou.
--     ESPERADO: atalho = 'frete' (sem barra, minúsculo).
-- insert into public.carbo_wa_respostas (atalho, corpo, criado_por)
-- values ('/Frete ', '  Me manda o CEP que eu calculo o frete pra você.  ', auth.uid());
-- select atalho, corpo from public.carbo_wa_respostas;

-- ⚠️ (b) só funciona a partir do APP (auth.uid() é nulo no SQL Editor, e a
-- policy de INSERT exige `criado_por = auth.uid()`). Pelo editor, use a tela.

-- (c) O índice único está de pé? ESPERADO: erro 23505 na segunda linha.
-- select indexdef from pg_indexes where tablename = 'carbo_wa_respostas';
