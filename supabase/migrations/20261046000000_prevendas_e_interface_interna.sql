-- ═══════════════════════════════════════════════════════════════════════════
-- Carbo Pré-Vendas entra no TIME INTERNO
-- ═══════════════════════════════════════════════════════════════════════════
--
-- App novo em 06/10/2026: `prevendas.carbohub.com.br`, flag `carbo_prevendas`,
-- para os SDRs qualificarem o lead e repassarem ao closer.
--
-- É o QUARTO dos quatro lugares que fazem um app existir (ver "App novo no hub"
-- no CLAUDE.md). Os outros três foram no mesmo dia: `interfaces.ts` do admin e
-- do ti (a caixinha), `packages/shell/src/apps.ts` (o seletor) e
-- `carbohub-landing/src/lib/apps.ts` (o azulejo do Hub).
--
-- ⚠️ Sem esta linha, quem tem SÓ o Pré-Vendas:
--   - não recebe notificação nenhuma (`notify_time_interno` filtra por aqui);
--   - é barrado pela RLS de tudo que é guardado por `carbo_e_time_interno()` —
--     a tela abre e volta VAZIA, sem erro. Mesmo sintoma da `bling2_esteira`.
--
-- ⚠️ E ela é INTERNA, ao contrário de `portal_pdv`, `portal_licenciado` e
-- `portal_micro`: os SDRs são funcionários da Carbo. Os portais de parceiro
-- continuam DE FORA, porque compartilham a mesma tabela `profiles`.
--
-- ⚠️ Função com a MESMA assinatura e o mesmo `language sql immutable`:
-- `create or replace` mantém dono e grants. Mudar a assinatura criaria uma
-- sobrecarga, e as policies passariam a chamar a errada.


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 0 — a definição VIVA (pergunte ao banco, não ao repositório)     ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- ESPERADO: a lista com 'carbo_admin' … 'carbo_atendimento', igual à da
-- `20260961`. Se vier diferente (chave a mais ou a menos), NÃO rode o bloco 1:
-- ele reescreveria a lista e apagaria a diferença.

select pg_get_functiondef('public.carbo_interface_e_interna(text[])'::regprocedure);


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — a lista ganha `carbo_prevendas`                              ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

create or replace function public.carbo_interface_e_interna(p_interfaces text[])
returns boolean language sql immutable as $$
  select exists (
    select 1 from unnest(coalesce(p_interfaces, '{}')) x
    -- ⚠️ Conferida contra os perfis REAIS, não contra o nome dos apps. O Ops
    -- aparece como `carbo_ops_app` em quase todo mundo e como `carbo_ops` num
    -- perfil — os dois valem. `carbo_sales` NÃO existe: o Sales é `carbo_crm`.
    -- `portal_pdv`, `portal_licenciado` e `portal_micro` ficam DE FORA de
    -- propósito: são os portais externos, que compartilham a tabela `profiles`.
    -- `carbo_atendimento` (20260961) é o app de atendimento ao cliente —
    -- interno: quem atende lê as conversas do WhatsApp e recebe o sininho.
    -- `carbo_prevendas` (20261046) é o app dos SDRs — interno.
    where lower(x) in ('carbo_admin','carbo_crm','carbo_ops','carbo_ops_app',
                       'carbo_financas','carbo_mkt','carbo_ti','carbo_atendimento',
                       'carbo_prevendas')
  );
$$;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ CONFERÊNCIA — as duas respostas que importam                           ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- ESPERADO: prevendas = true · portal_pdv = false · portal_micro = false.
-- `true` em qualquer portal é VAZAMENTO: lojista vendo dado interno.

select
  public.carbo_interface_e_interna(array['carbo_prevendas'])   as prevendas,
  public.carbo_interface_e_interna(array['portal_pdv'])        as portal_pdv,
  public.carbo_interface_e_interna(array['portal_micro'])      as portal_micro;
