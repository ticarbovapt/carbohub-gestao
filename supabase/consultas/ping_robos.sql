-- Só leitura: o banco responde e os dois robôs da esteira estão vivos?
select current_database() as banco,
       now() as agora,
       (select count(*) from public.carbo_esteira_cards) as cartoes,
       (select now() - ultima_leitura from public.carbo_esteira_estado) as atraso_robo_esteira,
       (select count(*) from public.carbo_esteira_pendentes) as pendentes_esteira;
