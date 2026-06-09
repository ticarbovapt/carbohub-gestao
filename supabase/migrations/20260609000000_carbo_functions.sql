-- ─────────────────────────────────────────────────────────────────────────────
-- FUNDAÇÃO DE ACESSO DO NOVO ECOSSISTEMA (Admin / Sales / Ops / ...)
--
-- Tabela PRÓPRIA, desacoplada do Carbo Controle (não tocamos department_functions
-- nem a matriz tela-a-tela do legado). Lógica NOVA e binária:
--   • access_level = 'gestor'      → vê o GLOBAL do app (manda)
--   • access_level = 'colaborador' → vê só o PRÓPRIO
-- O NOME da função é livre (ex.: "Estagiário de Ops"); o nível é explícito.
--
-- Regra de quem "manda" (apps): manda se QUALQUER papel (primário OU secundário)
-- for gestor, OU se o departamento for command/ti_suporte. Pega sempre o maior,
-- nunca trava (ex.: estagiário Ops + TI → manda por TI).
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.carbo_functions (
  id              uuid primary key default gen_random_uuid(),
  department      text not null,
  function_key    text not null,
  label           text not null,
  access_level    text not null default 'colaborador'
                    check (access_level in ('gestor', 'colaborador')),
  hierarchy_order int  not null default 99,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  constraint carbo_functions_unique unique (department, function_key)
);

alter table public.carbo_functions enable row level security;

-- Quem "manda" no novo modelo — gate de escrita (e reutilizável noutras policies).
create or replace function public.is_carbo_command(_uid uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    where p.id = _uid
      and (
        p.department in ('command', 'ti_suporte')
        or p.secondary_department::text in ('command', 'ti_suporte')
        or p.funcao in ('head', 'ceo')
        or p.secondary_funcao in ('head', 'ceo')
      )
  );
$$;

drop policy if exists "carbo_functions read" on public.carbo_functions;
create policy "carbo_functions read" on public.carbo_functions
  for select to authenticated using (true);

drop policy if exists "carbo_functions manage" on public.carbo_functions;
create policy "carbo_functions manage" on public.carbo_functions
  for all to authenticated
  using (public.is_carbo_command(auth.uid()))
  with check (public.is_carbo_command(auth.uid()));

-- Seed inicial: departamentos/funções atuais, já com o nível.
-- head/ceo = gestor; o resto = colaborador (command/ti_suporte mandam por departamento).
insert into public.carbo_functions (department, function_key, label, access_level, hierarchy_order) values
  ('command',    'ceo',                  'CEO',                  'gestor',      1),
  ('command',    'assistente_executiva', 'Assistente Executiva', 'colaborador', 2),
  ('ops',        'head',                 'Head',                 'gestor',      1),
  ('ops',        'gerente',              'Gerente',              'colaborador', 2),
  ('ops',        'coordenador',          'Coordenador(a)',       'colaborador', 3),
  ('ops',        'supervisor',           'Supervisor(a)',        'colaborador', 4),
  ('ops',        'staff',                'Colaborador',          'colaborador', 5),
  ('cgc',        'head',                 'Head',                 'gestor',      1),
  ('cgc',        'supervisor',           'Supervisor(a)',        'colaborador', 2),
  ('cgc',        'vendedor_b2b',         'Vendedor B2B',         'colaborador', 3),
  ('cgc',        'vendedor_b2c',         'Vendedor B2C',         'colaborador', 3),
  ('finance',    'head',                 'Head',                 'gestor',      1),
  ('finance',    'gerente',              'Gerente',              'colaborador', 2),
  ('finance',    'coordenador',          'Coordenador(a)',       'colaborador', 3),
  ('finance',    'analista',             'Analista',             'colaborador', 4),
  ('ti_suporte', 'head',                 'Head',                 'gestor',      1),
  ('ti_suporte', 'staff',                'Colaborador',          'colaborador', 2),
  ('growth',     'head',                 'Head',                 'gestor',      1),
  ('growth',     'staff',                'Colaborador',          'colaborador', 2),
  ('expansao',   'head',                 'Head',                 'gestor',      1),
  ('expansao',   'staff',                'Colaborador',          'colaborador', 2)
on conflict (department, function_key) do nothing;
