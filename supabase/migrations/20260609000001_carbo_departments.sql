-- ─────────────────────────────────────────────────────────────────────────────
-- DEPARTAMENTOS no banco (mundo novo) — antes eram hardcoded num constante.
--
-- 'key' é a CHAVE ESTÁVEL (gravada em profiles.department / carbo_functions);
-- NUNCA muda. 'label' é só exibição → renomear o label propaga em todo lugar
-- que lê o nome pela chave, sem quebrar nada.
-- 'sigla' = prefixo do username (ex.: OPS0001).
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.carbo_departments (
  id         uuid primary key default gen_random_uuid(),
  key        text not null unique,
  label      text not null,
  sigla      text not null,
  color      text not null default '#64748b',
  sort_order int  not null default 99,
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.carbo_departments enable row level security;

drop policy if exists "carbo_departments read" on public.carbo_departments;
create policy "carbo_departments read" on public.carbo_departments
  for select to authenticated using (true);

-- is_carbo_command(uid) já foi criada na migration carbo_functions.
drop policy if exists "carbo_departments manage" on public.carbo_departments;
create policy "carbo_departments manage" on public.carbo_departments
  for all to authenticated
  using (public.is_carbo_command(auth.uid()))
  with check (public.is_carbo_command(auth.uid()));

-- Seed: os departamentos atuais (mesmas chaves de hoje).
insert into public.carbo_departments (key, label, sigla, color, sort_order) values
  ('command',    'Command',      'COM', '#6366f1', 1),
  ('finance',    'Finance',      'FIN', '#f59e0b', 2),
  ('growth',     'Growth',       'GRO', '#22c55e', 3),
  ('cgc',        'Comercial GC', 'CGC', '#ec4899', 4),
  ('ops',        'Operações',    'OPS', '#3b82f6', 5),
  ('expansao',   'Expansão',     'EXP', '#8b5cf6', 6),
  ('ti_suporte', 'TI / Suporte', 'TI',  '#64748b', 7)
on conflict (key) do nothing;
