-- =====================================================================
-- Pré-Vendas: "Quantos postos (rede)" na qualificação.
--
-- Pedido do dono do processo em 09/10/2026. O Pré-Vendas atende POSTO que já é
-- cliente de quem indica, e o tamanho da rede é o POTENCIAL: a RCM (20 postos)
-- começou com compra de R$ 70 mil; uma rede de 4, bem menor.
--
-- As outras perguntas do Pré-Vendas mudaram só de RÓTULO na tela (as colunas
-- qual_* continuam as mesmas). Esta é a única que precisa de coluna: é número.
--
-- ⚠️ O Sales (crm) NÃO muda: ele não lê nem grava a coluna. A RPC de repasse é
-- compartilhada e passa a COPIAR o campo — no Outbound ele vem sempre nulo.
-- ⚠️ A RPC NÃO é reescrita de memória: o bloco 2 troca o texto VIVO
-- (`pg_get_functiondef`) e aborta se não achar exatamente UMA ocorrência de
-- cada trecho — mesmo molde da 20261048.
-- =====================================================================

-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 0 — medir antes de mexer                                    ║
-- ╚═══════════════════════════════════════════════════════════════════╝
-- ESPERADO: lista_colunas = 1 · lista_valores = 1 · ja_copia_postos = false
select
  (length(d) - length(replace(d, 'qual_decisor, qual_prazo,', ''))) / length('qual_decisor, qual_prazo,')               as lista_colunas,
  (length(d) - length(replace(d, 'v_lead.qual_decisor, v_lead.qual_prazo,', ''))) / length('v_lead.qual_decisor, v_lead.qual_prazo,') as lista_valores,
  position('qual_postos' in d) > 0 as ja_copia_postos
from (select pg_get_functiondef('public.crm_sales_lead_repassar(uuid,text)'::regprocedure) as d) x;

-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — a coluna                                                 ║
-- ╚═══════════════════════════════════════════════════════════════════╝
set lock_timeout = '5s';
alter table public.crm_sales_leads
  add column if not exists qual_postos int check (qual_postos is null or qual_postos > 0);
reset lock_timeout;

-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — o repasse leva o número para o closer (f15)             ║
-- ╚═══════════════════════════════════════════════════════════════════╝
do $$
declare
  d  text := pg_get_functiondef('public.crm_sales_lead_repassar(uuid,text)'::regprocedure);
  c1 text := 'qual_decisor, qual_prazo,';
  c2 text := 'v_lead.qual_decisor, v_lead.qual_prazo,';
  n1 int;
  n2 int;
begin
  if position('qual_postos' in d) > 0 then
    raise notice 'A RPC já copia qual_postos — nada a fazer.';
    return;
  end if;
  n1 := (length(d) - length(replace(d, c1, ''))) / length(c1);
  n2 := (length(d) - length(replace(d, c2, ''))) / length(c2);
  if n1 <> 1 or n2 <> 1 then
    raise exception 'Esperava UMA lista de colunas e UMA de valores na RPC de repasse; achei % e %. Nada foi alterado.', n1, n2;
  end if;
  d := replace(d, c2, c2 || ' v_lead.qual_postos,');
  d := replace(d, c1, c1 || ' qual_postos,');
  execute d;
end $$;

-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ CONFERÊNCIA                                                        ║
-- ╚═══════════════════════════════════════════════════════════════════╝
-- ESPERADO: coluna_existe = true · copias_no_repasse = 2 (lista + valor)
select
  exists (select 1 from information_schema.columns
           where table_schema = 'public' and table_name = 'crm_sales_leads' and column_name = 'qual_postos') as coluna_existe,
  (length(d) - length(replace(d, 'qual_postos', ''))) / length('qual_postos') as copias_no_repasse
from (select pg_get_functiondef('public.crm_sales_lead_repassar(uuid,text)'::regprocedure) as d) x;
