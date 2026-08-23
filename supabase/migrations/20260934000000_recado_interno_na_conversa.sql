-- ─────────────────────────────────────────────────────────────────────────────
-- Recado interno na conversa — o que o cliente NUNCA vê
--
-- "Já teve dois estornos este mês", "combinei com a transportadora, retorna
-- amanhã", "gestor: pode liberar frete grátis nesse caso". Hoje isso vive no
-- grupo do WhatsApp da equipe, e some — a conversa com o cliente fica sem o
-- contexto que explica por que alguém respondeu daquele jeito.
--
-- ⚠️ A garantia que importa não é a tela pintar de amarelo: é o recado morar em
-- OUTRA TABELA. Nenhum caminho de envio lê `carbo_wa_notas` — nem a fila, nem o
-- `whatsapp-responder`, nem a `whatsapp-midia`. Guardar o recado junto das
-- mensagens com uma coluna `interna = true` faria a segurança depender de todo
-- SELECT futuro lembrar do filtro, e um esquecimento manda a observação do
-- gestor para o cliente. Tabela separada não tem como esquecer.
-- ─────────────────────────────────────────────────────────────────────────────

-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — a tabela                                                    ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

create table if not exists public.carbo_wa_notas (
  id          uuid primary key default gen_random_uuid(),
  wa_id       text not null,
  texto       text not null check (length(btrim(texto)) > 0),
  autor       uuid references auth.users(id),
  autor_nome  text,                       -- congelado no momento em que escreveu
  criado_em   timestamptz not null default now(),
  -- ⚠️ Apagar é MARCAR. O recado é registro de quem sabia o quê e quando; um
  -- DELETE some com a intenção junto, e é justamente o que alguém faria depois
  -- de um atendimento dar errado. Some da tela, fica no banco.
  apagada_em  timestamptz,
  apagada_por uuid references auth.users(id)
);

-- ⚠️ O nome do autor é COPIADO, não resolvido por join. Quem escreveu continua
-- sendo quem escreveu depois de sair da empresa, e o perfil pode ser desativado.
comment on table public.carbo_wa_notas is
  'Recado interno numa conversa do WhatsApp. NUNCA vai para o cliente: nenhum caminho de envio lê esta tabela — é isso, e não o filtro na tela, que garante o sigilo.';

create index if not exists carbo_wa_notas_conversa
  on public.carbo_wa_notas (wa_id, criado_em);

-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — quem lê e quem escreve                                      ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
--
-- ⚠️ `carbo_e_time_interno()`, a MESMA função que guarda `carbo_wa_mensagens`.
-- O portal de lojas e o de licenciados usam a mesma tabela `profiles`, e sem
-- esse filtro o lojista leria o recado que o gestor deixou sobre o cliente dele.

alter table public.carbo_wa_notas enable row level security;

drop policy if exists carbo_wa_notas_le on public.carbo_wa_notas;
create policy carbo_wa_notas_le on public.carbo_wa_notas
  for select to authenticated using (public.carbo_e_time_interno());

drop policy if exists carbo_wa_notas_escreve on public.carbo_wa_notas;
create policy carbo_wa_notas_escreve on public.carbo_wa_notas
  for insert to authenticated with check (public.carbo_e_time_interno() and autor = auth.uid());

-- ⚠️ Sem policy de DELETE em lugar nenhum — some a coluna `apagada_em` e a
-- regra do parágrafo acima vira decoração. O UPDATE existe só para marcar.
drop policy if exists carbo_wa_notas_apaga on public.carbo_wa_notas;
create policy carbo_wa_notas_apaga on public.carbo_wa_notas
  for update to authenticated using (public.carbo_e_time_interno())
  with check (public.carbo_e_time_interno());

-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 3 — ao vivo                                                     ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
--
-- Duas pessoas atendendo é o caso normal, e o recado existe justamente para uma
-- avisar a outra. Chegar 30 s depois é chegar depois da resposta.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public'
      and tablename = 'carbo_wa_notas'
  ) then
    alter publication supabase_realtime add table public.carbo_wa_notas;
  end if;
end $$;

alter table public.carbo_wa_notas replica identity full;

-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 4 — conferência                                                 ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- (a) A tabela existe, com RLS ligada e SEM policy de delete.
select
  (select count(*) from pg_policies
    where tablename = 'carbo_wa_notas' and cmd = 'DELETE')            as policies_de_delete,
  (select relrowsecurity from pg_class where relname = 'carbo_wa_notas') as rls_ligada,
  (select count(*) from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'carbo_wa_notas') as no_realtime;

-- (b) ⚠️ A prova que importa: NENHUM caminho de envio menciona a tabela nova.
--     Se esta consulta trouxer alguma linha, um recado interno está a um passo
--     de virar mensagem para o cliente.
select p.proname
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.prosrc ilike '%carbo_wa_notas%'
  and p.proname not ilike '%nota%';
