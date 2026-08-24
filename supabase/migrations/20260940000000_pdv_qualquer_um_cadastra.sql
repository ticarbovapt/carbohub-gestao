-- ─────────────────────────────────────────────────────────────────────────────
-- Cadastrar PDV deixa de ser privilégio de gestão
--
-- O botão "Novo PDV" só aparecia para gestor, e a RLS de `public.pdvs` (de
-- fevereiro) só deixava CEO/gestor/admin escrever. Decisão do dono do processo:
-- qualquer pessoa do time interno cadastra.
--
-- O motivo é operacional, não de permissão: quem descobre a loja nova é quem
-- está na rua. O caminho antigo — "manda o CNPJ no grupo e alguém cadastra" —
-- perde o cliente entre a visita e o cadastro, e o vendedor não consegue nem
-- agendar a visita seguinte porque o PDV não existe no sistema.
--
-- ⚠️ Os dois lados mudam JUNTOS. Mostrar o botão sem liberar o banco trocaria um
-- botão invisível por um erro no clique — que é pior, porque a pessoa escreve o
-- cadastro inteiro antes de descobrir.
-- ─────────────────────────────────────────────────────────────────────────────

-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — quem cria                                                   ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
--
-- ⚠️ `carbo_e_time_interno()`, não `using (true)`: `authenticated` inclui o
-- portal de lojas e o de licenciados, que usam a MESMA tabela `profiles`. Com
-- `true`, um lojista criaria PDV no cadastro da Carbo.

drop policy if exists pdvs_insert_time_interno on public.pdvs;
create policy pdvs_insert_time_interno on public.pdvs
  for insert to authenticated
  with check (public.carbo_e_time_interno());

comment on table public.pdvs is
  'Cadastro de pontos de venda. Leitura e criação: time interno (quem visita em campo). Edição e exclusão seguem com CEO/gestor/admin — corrigir cadastro é outra decisão, e a mesma loja com três grafias custa mais que o cadastro que faltou.';

-- ⚠️ A EDIÇÃO continua com a gestão, de propósito e por enquanto: criar um PDV
-- que não existe resolve um problema; reescrever o cadastro de um que existe
-- cria outro — a mesma loja vira três grafias em três visitas, e aí nenhuma
-- métrica por PDV fecha. Se o dono do processo quiser abrir a edição também, é
-- uma linha (`for update ... using (carbo_e_time_interno())`), mas é decisão
-- separada.

-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — conferência                                                 ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- (a) As políticas de `pdvs`: leitura (3), criação (a nova) e a de gestão.
select policyname, cmd, qual, with_check
from pg_policies where tablename = 'pdvs'
order by cmd, policyname;

-- (b) Quem passa a poder cadastrar — tem de bater com o time interno.
select count(*) as podem_cadastrar
from public.profiles p
where public.carbo_interface_e_interna(p.allowed_interfaces);
