-- ─────────────────────────────────────────────────────────────────────────────
-- "Nenhum PDV encontrado" — quem visita não conseguia ler o cadastro
--
-- Sintoma: em `/rtm/agenda`, no Sales, o campo "Ponto de venda" do agendamento
-- respondia "Nenhum PDV encontrado" para qualquer perfil que não fosse
-- CEO/gestor/admin. Sem erro, sem aviso: uma lista vazia.
--
-- A causa é a RLS original de `public.pdvs`, de fevereiro:
--
--   "Admins can manage PDVs"   FOR ALL    is_ceo or is_gestor or is_admin
--   "PDV users can view own PDV" FOR SELECT  id in (select ... from pdv_users)
--
-- Ou seja: ou você é gestor, ou você é o LOJISTA daquele PDV. O vendedor em
-- campo — a pessoa para quem a tela de visita foi feita — não é nenhum dos dois.
--
-- ⚠️ É a MESMA classe do "esteira travada no Pago" (migração 20260936): view com
-- `security_invoker = true` sobre tabela cuja política nunca previu quem opera.
-- A view `carbo_pdvs_painel` está correta; faltava a política embaixo dela.
-- ─────────────────────────────────────────────────────────────────────────────

-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — quem visita passa a ver o PDV                               ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
--
-- Política SOMADA, não substituída: policies de SELECT se combinam com OR, então
-- gestor continua com o que tinha e o lojista continua vendo o próprio PDV.
--
-- ⚠️ `carbo_e_time_interno()` e NÃO `using (true)`: `authenticated` inclui o
-- portal de lojas e o de licenciados, que usam a MESMA tabela `profiles`. Com
-- `true`, um lojista passaria a ler o cadastro inteiro de PDVs da Carbo —
-- incluindo os concorrentes dele na mesma cidade.

drop policy if exists pdvs_read_time_interno on public.pdvs;
create policy pdvs_read_time_interno on public.pdvs
  for select to authenticated
  using (public.carbo_e_time_interno());

comment on table public.pdvs is
  'Cadastro de pontos de venda. Leitura: gestão (política antiga), lojista do próprio PDV, e TIME INTERNO (quem visita em campo). Escrita continua com CEO/gestor/admin.';

-- ⚠️ A ESCRITA continua sendo de gestão. O vendedor agenda visita e registra o
-- que viu; ele não edita o cadastro do cliente pela tela de campo — correção de
-- endereço passa por quem mantém o cadastro, senão a mesma loja vira três
-- grafias em três visitas.

-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — conferência                                                 ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- (a) As três políticas de leitura convivendo (gestão · lojista · time interno).
select policyname, cmd, qual
from pg_policies where tablename = 'pdvs'
order by cmd, policyname;

-- (b) O que a tela vai ver: PDV ativo é o que aparece na busca de agendamento.
select count(*) filter (where status <> 'inactive') as pdvs_ativos,
       count(*)                                     as pdvs_total
from public.pdvs;

-- (c) ⚠️ A view continua com security_invoker — se vier nula, a política acima
--     virou decoração e o cadastro está aberto a qualquer autenticado.
select relname, reloptions from pg_class where relname = 'carbo_pdvs_painel';
