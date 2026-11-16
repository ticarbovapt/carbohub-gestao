-- Fila dos detalhes do pedido (bling2-sync · order_details) a 100×.
-- A consulta é `where items is null or raw_detalhe is null order by data desc
-- limit N`, a cada 10 min. Sem índice, cada rodada ordena a tabela inteira de
-- pedidos para devolver as poucas centenas pendentes. O índice é PARCIAL: só
-- contém quem falta detalhar — pequeno, e esvazia sozinho conforme drena.
create index if not exists bling2_orders_detalhe_pendente_idx
  on public.bling2_orders (data desc)
  where items is null or raw_detalhe is null;

do $$
begin
  if to_regclass('public.bling2_orders_detalhe_pendente_idx') is null then
    raise exception 'índice da fila de detalhes não foi criado';
  end if;
end $$;
