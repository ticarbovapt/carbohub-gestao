-- Testa a 20261179 num Postgres LOCAL descartável (o schema public é RECRIADO):
--   psql -h /var/tmp/pgt -p 55432 -U postgres -q -f docs/whatsapp/recompra/teste-local/qualidade.sql
-- Saída esperada: só linhas "ok:".
\set ON_ERROR_STOP 1
drop schema if exists public cascade; create schema public;
do $$ begin create role authenticated; exception when others then null; end $$;
do $$ begin create role anon; exception when others then null; end $$;
do $$ begin create role service_role; exception when others then null; end $$;
create function public.carbo_e_time_interno() returns boolean language sql as $$ select true $$;
create table public.profiles (id uuid primary key, allowed_interfaces text[]);
insert into public.profiles values ('00000000-0000-0000-0000-000000000001','{carbo_ti}'),('00000000-0000-0000-0000-000000000002','{carbo_crm}');
create table public.notifications (user_id uuid, type text, title text, body text, reference_type text, reference_id text, is_read boolean);
create table public.carbo_wa_numeros (phone_number_id text primary key, rotulo text not null, numero_exibicao text, funcao text, ativo boolean default true);
insert into public.carbo_wa_numeros values ('111','CarboZé Clube','(00) 90000-0001','recompra',true);
\i supabase/migrations/20261179000000_qualidade_do_numero_pausa_o_comercial.sql
\i supabase/migrations/20261179000000_qualidade_do_numero_pausa_o_comercial.sql
create or replace function pg_temp.ok(c boolean, m text) returns void language plpgsql as $$ begin if not coalesce(c,false) then raise exception 'FALHOU: %', m; end if; raise notice 'ok: %', m; end $$;
select pg_temp.ok((select pausa_qualidade from carbo_wa_numeros)='YELLOW', 'padrão pausa no amarelo');
select pg_temp.ok((carbo_wa_qualidade_registrar('111','GREEN','TIER_2K',null)->>'avisou') = 'false', '1ª leitura verde não avisa');
select pg_temp.ok((select count(*) from notifications)=0, 'nenhuma notificação');
select pg_temp.ok((carbo_wa_qualidade_registrar('111','GREEN','TIER_2K',null)->>'mudou') = 'false', 'mesma nota não muda');
select pg_temp.ok((carbo_wa_qualidade_registrar('111','YELLOW','TIER_2K',null)->>'pausado') = 'true', 'amarelo pausa');
select pg_temp.ok((select count(*) from notifications where type='esteira_fonte_parada' and body like '%PAUSADAS%')=1, 'TI avisado (só o TI) da pausa');
select pg_temp.ok((select count(*) from notifications where user_id='00000000-0000-0000-0000-000000000002')=0, 'quem não é TI não recebe');
select pg_temp.ok((carbo_wa_qualidade_registrar('111',null,null,'meta 190: token')->>'mudou') = 'false', 'leitura que falhou não muda a nota');
select pg_temp.ok((select qualidade||'/'||qualidade_erro from carbo_wa_numeros)='YELLOW/meta 190: token', 'erro guardado, nota mantida');
select pg_temp.ok((carbo_wa_qualidade_registrar('111','GREEN','TIER_2K',null)->>'pausado') = 'false', 'voltou ao verde libera');
select pg_temp.ok((select count(*) from notifications where type='esteira_fonte_voltou' and body like '%LIBERADAS%')=1, 'TI avisado da liberação');
select pg_temp.ok((select count(*) from carbo_wa_qualidade_hist)=3, 'histórico: verde, amarelo, verde');
update carbo_wa_numeros set pausa_qualidade='RED';
select pg_temp.ok((carbo_wa_qualidade_registrar('111','YELLOW','TIER_1K',null)->>'pausado') = 'false', 'com limiar RED, amarelo não pausa');
select pg_temp.ok((select body from notifications order by ctid desc limit 1) like '%seguem saindo%', 'e o aviso diz que seguem');
do $$ begin perform carbo_wa_qualidade_registrar('999','RED',null,null); end $$;
select pg_temp.ok((carbo_wa_qualidade_registrar('999','RED',null,null)->>'ok')='false', 'número desconhecido recusa sem erro');
