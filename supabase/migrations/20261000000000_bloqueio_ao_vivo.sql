-- ═══════════════════════════════════════════════════════════════════════════
-- Bloqueio AO VIVO — a pessoa é derrubada na hora, não em até 1 h
--
-- Pedido do dono do processo em 22/09/2026, depois de ler a ressalva da
-- `20260999`: *"existe a possibilidade da pessoa estar logada e ser bloqueada e
-- só desconectar… quero o popup subindo ao vivo, nada de precisar navegar"*.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- ⚠️ O AUTH NÃO AVISA NINGUÉM — e é essa a origem da 1 hora
--
-- `auth.users.banned_until` continua sendo a TRAVA, e ela é sólida: ninguém
-- entra, em nenhum app do ecossistema. O que ela não faz é **falar**. O GoTrue
-- só confere o banimento quando alguém bate na porta (login ou renovação de
-- token), e quem já está com a aba aberta não bate em porta nenhuma até o
-- access token expirar.
--
-- E `auth.users` não é publicada no Realtime, então não há como a tela escutar
-- o banimento direto. O aviso tem de sair de uma tabela NOSSA.
--
-- ⚠️ A tabela já existe: `carbo_usuario_bloqueio_log`, da `20260999`. Ela foi
-- criada como HISTÓRICO e agora vira também o SINAL — e isso é acréscimo, não
-- desvio: a linha `bloqueado` já era escrita no mesmo instante do banimento,
-- pela mesma função. Criar uma segunda tabela só para avisar seria uma segunda
-- verdade sobre o mesmo fato, e as duas divergiriam no dia em que uma falhasse.
--
-- ⚠️ O SINAL NÃO SUBSTITUI A TRAVA. Se o Realtime estiver fora do ar, a aba
-- some na renovação do token como antes — o pior caso volta a ser o de ontem,
-- nunca "continua entrando". Aviso que falha aberto seria pior que aviso
-- nenhum, porque daria a sensação de proteção.
--
-- ⚠️ RODE EM BLOCOS.
-- ═══════════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 0 — a FOTO DO ANTES (leitura pura)                              ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- (a) A tabela já está no Realtime? ESPERADO: VAZIO (ela nasceu fora).
select schemaname, tablename
from pg_publication_tables
where pubname = 'supabase_realtime'
  and tablename = 'carbo_usuario_bloqueio_log';

-- (b) As policies de hoje. ESPERADO: UMA, de SELECT, com carbo_e_time_interno().
select polname, cmd, pg_get_expr(polqual, polrelid) as usando
from pg_policy pol
join pg_class c on c.oid = pol.polrelid
left join lateral (select pol.polcmd::text as cmd) x on true
where c.relname = 'carbo_usuario_bloqueio_log';


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — cada um enxerga as PRÓPRIAS linhas                          ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
--
-- ⚠️ Sem isto o Realtime NÃO entrega o evento, e não entrega calado: ele aplica
-- a RLS do usuário sobre a linha nova, e a policy de hoje exige
-- `carbo_e_time_interno()`. Quem só tem portal não passa — e quem tem interface
-- interna passa, mas então enxergaria o histórico de bloqueio de TODO MUNDO
-- para receber um aviso sobre si mesmo.
--
-- Policies de SELECT combinam com OR, então a de gestão continua intacta: esta
-- só ACRESCENTA a própria linha a quem quer que seja.
--
-- ⚠️ E continua sem INSERT, UPDATE e DELETE. Quem escreve é a edge function com
-- service role. Uma policy de insert deixaria a pessoa forjar a própria linha
-- de auditoria — e, pior, forjar um `desbloqueado` que não existe no Auth.

drop policy if exists "cada um le o proprio bloqueio" on public.carbo_usuario_bloqueio_log;
create policy "cada um le o proprio bloqueio"
  on public.carbo_usuario_bloqueio_log for select
  using (user_id = auth.uid());


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — publicar no Realtime                                        ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
--
-- ⚠️ `add table` falha com `42710` se a tabela já estiver na publicação, e o
-- erro aborta o bloco. Por isso o `if not exists` explícito — a migração
-- precisa poder rodar duas vezes.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'carbo_usuario_bloqueio_log'
  ) then
    alter publication supabase_realtime add table public.carbo_usuario_bloqueio_log;
  end if;
end $$;

-- ⚠️ `replica identity full` NÃO é preciso aqui, e a diferença importa: ela
-- existe para o Realtime poder entregar o registro ANTERIOR num UPDATE. Este
-- sinal é um INSERT, e o INSERT sempre entrega a linha nova inteira. Ligá-la
-- sem necessidade engorda o WAL de toda escrita.
-- (É o mesmo ponto que fez a notificação de venda on-line parar de escutar
--  `ecommerce_orders` e passar a escutar `notifications`.)


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 3 — CONFERÊNCIA                                                 ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- (a) ⭐ A tabela está no Realtime. ESPERADO: UMA linha, `public`.
select schemaname, tablename
from pg_publication_tables
where pubname = 'supabase_realtime'
  and tablename = 'carbo_usuario_bloqueio_log';

-- (b) ⭐ DUAS policies agora, as duas de SELECT (`polcmd = 'r'`), e NENHUMA de
--     insert/update/delete. Policy de escrita aqui deixaria forjar auditoria.
select polname, polcmd, pg_get_expr(polqual, polrelid) as usando
from pg_policy pol
join pg_class c on c.oid = pol.polrelid
where c.relname = 'carbo_usuario_bloqueio_log'
order by polname;

-- (c) ⭐ O TESTE DE VERDADE é na TELA, não aqui:
--     1. entre com a conta a testar noutro navegador (ou aba anônima) e deixe
--        parada numa tela qualquer, SEM navegar;
--     2. bloqueie essa conta pelo Admin, do seu navegador;
--     3. a outra aba tem de mostrar o aviso em POUCOS SEGUNDOS, sozinha.
--
--     ⚠️ Não use a mesma conta nos dois lados: a função recusa auto-bloqueio.
--     ⚠️ Nada acontecendo, o problema é o Realtime, não o bloqueio — a trava do
--        Auth continua valendo e a aba cai na renovação do token. Confira (a).
