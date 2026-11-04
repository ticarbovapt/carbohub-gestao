-- ═══════════════════════════════════════════════════════════════════════════
-- Autoaprovação: a CEO entra na lista
--
-- A 20261146 concedeu a UMA pessoa e deixou escrito por quê a CEO não entrava:
-- "quem pediu a exceção foi quem estava travado, e permissão não se concede
-- 'de brinde' a quem não pediu". Agora foi pedida — por quem concedeu a
-- primeira, em 04/11/2026.
--
-- ⚠️ Linha nova, migração nova, e não um remendo na anterior. Quem for ler
-- esta tabela daqui a um ano precisa de DUAS datas e DOIS motivos, não de um
-- arquivo reescrito que faz parecer que as duas permissões nasceram juntas.
-- O mesmo vale para revogar: `update ... set ativo = false` com data, nunca
-- `delete` — a linha é o registro de que a permissão existiu.
--
-- A regra em si não muda: o `fin_rc_guarda` já consulta
-- `fin_pode_autoaprovar`, que lê esta tabela. Isto aqui é CADASTRO.
-- ═══════════════════════════════════════════════════════════════════════════

insert into public.fin_compras_autoaprovacao (user_id, motivo)
select p.id,
       'CEO: decide a propria requisicao de compra sem segundo aprovador. '
       'Concedido em 04/11/2026, pelo diretor de Operacoes.'
from public.profiles p
where p.department::text = 'command' and p.funcao::text = 'ceo'
on conflict (user_id) do nothing;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ Conferência                                                           ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- A lista inteira — tem de ser DUAS linhas, cada uma com motivo e data.
select p.full_name, p.department::text as dep, p.funcao::text as fn,
       a.ativo, a.criado_em::date as desde, a.motivo
from public.fin_compras_autoaprovacao a
join public.profiles p on p.id = a.user_id
order by a.criado_em;

-- ⚠️ Ninguém além da lista: tem de vir ZERO linhas.
select p.full_name
from public.profiles p
where public.fin_pode_autoaprovar(p.id)
  and p.id not in (select user_id from public.fin_compras_autoaprovacao where ativo);
