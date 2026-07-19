-- Dispositivos conhecidos por usuário — base para o alerta de "login novo".
-- Cada navegador guarda um device_id (localStorage). No login, a Edge Function
-- login-notify registra/atualiza aqui; se o dispositivo é novo (e não é o
-- primeiro do usuário), dispara um e-mail de alerta de segurança.

create table if not exists public.user_known_devices (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  device_id   text not null,
  user_agent  text,
  first_seen  timestamptz not null default now(),
  last_seen   timestamptz not null default now(),
  unique (user_id, device_id)
);

create index if not exists idx_user_known_devices_user on public.user_known_devices(user_id);

-- RLS habilitado SEM policies: nenhum cliente lê/escreve direto.
-- Só a Edge Function (service role) acessa — service role ignora RLS.
alter table public.user_known_devices enable row level security;
