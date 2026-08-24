-- ─────────────────────────────────────────────────────────────────────────────
-- A esteira travada no "Pago" — e por que ela travou justamente agora
--
-- Sintoma: em qualquer perfil que não fosse admin/CEO/gestor, a Esteira do
-- On-line mostrava TODOS os cards na primeira coluna e as outras vazias.
--
-- Não era a tela. As quatro tabelas que a `bling2_esteira` lê nasceram com
-- leitura restrita:
--
--   create policy "bling2_orders_read" ... using (is_admin or is_ceo or is_gestor)
--
-- ⚠️ E isso NÃO aparecia antes porque a view rodava sem `security_invoker`: ela
-- executava com os privilégios do dono e ignorava a RLS de todo mundo. Era o
-- vazamento corrigido na 20260919 — lojista e licenciado liam a esteira inteira
-- da Carbo pelo PostgREST, porque o portal usa a MESMA tabela `profiles`.
--
-- Com `security_invoker = true` cada um passou a ler como ele mesmo, e quem não
-- é gestor voltou VAZIO. A única coluna que sobrou com card foi a "Pago" — que
-- não vem da esteira, e sim de `ecommerce_aguardando_bling`, lendo
-- `ecommerce_orders`, aberta a qualquer autenticado. Daí "travado no Pago".
--
-- ⚠️ O conserto NÃO é voltar para `using (true)`: isso reabriria o vazamento
-- inteiro. É liberar leitura para o TIME INTERNO, a mesma regra que já guarda
-- as conversas do WhatsApp.
-- ─────────────────────────────────────────────────────────────────────────────

-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — quem opera passa a ver                                      ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
--
-- Política NOVA, somada à antiga: policies de SELECT se combinam com OR, então
-- gestor não perde nada e o time interno ganha. Trocar a antiga em vez de somar
-- exigiria conferir todos os usos de `is_gestor` num único passo — mais risco,
-- zero ganho.
--
-- A ESCRITA continua sendo de admin/CEO. Quem opera precisa VER o pedido, não
-- editar o espelho do Bling: o espelho é reescrito pelo sync a cada minuto, e
-- edição humana ali dura até a próxima rodada — some sem deixar rastro.

do $$
declare t text;
begin
  foreach t in array array['bling2_orders','bling2_nfe','bling2_contacts','bling2_lojas'] loop
    execute format('drop policy if exists "%s_read_time" on public.%I', t, t);
    execute format($f$
      create policy "%s_read_time" on public.%I
        for select to authenticated
        using (public.carbo_e_time_interno())
    $f$, t, t);
  end loop;
end $$;

-- ⚠️ `bling2_contacts` tem dado pessoal do cliente (documento, endereço). A
-- esteira precisa dele para mostrar nome e cidade no card, então a porta foi
-- aberta CONSCIENTEMENTE — e só para interface interna. Se um dia a tela
-- deixar de mostrar o cliente, esta política sai junto.

-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — conferência                                                 ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- (a) As quatro têm as DUAS políticas de leitura (a antiga e a nova).
select tablename, policyname, cmd, qual
from pg_policies
where tablename in ('bling2_orders','bling2_nfe','bling2_contacts','bling2_lojas')
order by tablename, cmd;

-- (b) Quantos perfis passam a enxergar. Tem de bater com a lista de atendentes
--     (`carbo_wa_atendentes`) — as duas saem da MESMA função, e divergir aqui
--     significaria duas definições de "time interno" vivendo ao mesmo tempo.
select
  (select count(*) from public.profiles p
    where public.carbo_interface_e_interna(p.allowed_interfaces))  as time_interno,
  (select count(*) from public.carbo_wa_atendentes)                as atendentes;

-- (c) ⚠️ A view continua com security_invoker. Se esta consulta vier sem
--     `{security_invoker=true}`, a RLS acima virou decoração e a esteira está
--     aberta de novo para o portal.
select relname, reloptions from pg_class
where relname in ('bling2_esteira','carbo_msg_fila');


-- ═══════════════════════════════════════════════════════════════════════════
-- ⚠️ FICA REGISTRADO, e NÃO foi mexido aqui
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Três tabelas que a esteira também toca continuam com leitura aberta a
-- QUALQUER autenticado — o que inclui lojista e licenciado:
--
--   melhorenvio_envios     for select to authenticated using (true)
--   rastreio_envios        for select to authenticated using (true)
--   carbo_pedido_codigo    for select to authenticated using (true)
--
-- É a mesma família de furo. Não foram fechadas nesta migração por um motivo
-- concreto: a página pública de rastreio (rastreio.carboze.com.br) pode ler
-- daí, e fechar às cegas derrubaria o rastreio DO CLIENTE — trocar um vazamento
-- de dado interno por um cliente sem rastreio é piorar o problema.
--
-- Antes de fechar, medir de onde vêm as leituras dessas três.
