-- ═══════════════════════════════════════════════════════════════════════════
-- Encerrar o aviso não apaga a tarja: ela vira VERDE por um tempo
--
-- Pedido do dono do processo em 28/09/2026, ao ver a primeira versão no ar:
-- *"quando fechar o aviso, permanecesse a tarja ali verde, com o aviso
-- informando que voltou ao normal e eu seto o tempo que fica ali no ar"*.
--
-- ⚠️ "Sumiu a tarja" e "nunca houve tarja" são indistinguíveis para quem chega
-- depois — e quem passou a manhã travado precisa LER que normalizou, senão
-- continua desconfiando do sistema e abrindo o chamado que a tarja existia
-- para evitar. O verde é o fim da história, não enfeite.
--
-- ⚠️ E o PRAZO é do TI, não uma constante no código: incidente de cinco
-- minutos e incidente de meio dia não pedem a mesma permanência. Número fixo
-- aqui seria cadastro escrito em código — a doença registrada no CLAUDE.md.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.carbo_status_aviso
  add column if not exists normalizado_minutos integer not null default 30,
  add column if not exists normalizado_texto   text;

comment on column public.carbo_status_aviso.normalizado_minutos is
  'Por quantos minutos, depois de encerrado, a tarja VERDE continua no ar. 0 = some na hora.';
comment on column public.carbo_status_aviso.normalizado_texto is
  'Texto do verde. Vazio usa o padrao ("O problema X foi resolvido...").';


-- ── A leitura precisa alcançar o aviso ENCERRADO, dentro da janela ────────
--
-- ⚠️ A policy antiga era `using (ativo)`: no instante do "Encerrar" a linha
-- saía da vista de todo mundo e o verde NUNCA apareceria. Isso não é detalhe
-- de permissão — é a funcionalidade inteira.
--
-- ⚠️ E a janela é conferida de novo NA TELA (`noVerde`, no StatusTarja). Não é
-- redundância boba: o TI enxerga o histórico inteiro por uma SEGUNDA policy de
-- SELECT (elas somam com OR), então sem a conta no front quem é do TI veria a
-- tarja verde de um incidente de semanas atrás.
drop policy if exists carbo_status_aviso_leitura on public.carbo_status_aviso;
create policy carbo_status_aviso_leitura on public.carbo_status_aviso
  for select to anon, authenticated
  using (
    ativo
    or (
      encerrado_em is not null
      and normalizado_minutos > 0
      and now() < encerrado_em + make_interval(mins => normalizado_minutos)
    )
  );


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ CONFERÊNCIA — rode UMA DE CADA VEZ                                    ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- (a) As duas colunas novas. ESPERADO: 2 linhas, `normalizado_minutos` com
--     default 30 e NOT NULL.
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'carbo_status_aviso'
  and column_name in ('normalizado_minutos', 'normalizado_texto')
order by column_name;

-- (b) A policy de leitura agora alcança o encerrado? ESPERADO: o `using` cita
--     `encerrado_em` e `normalizado_minutos`.
select policyname, qual
from pg_policies
where tablename = 'carbo_status_aviso' and policyname = 'carbo_status_aviso_leitura';

-- (c) O que um visitante deslogado veria AGORA. ESPERADO: os avisos ativos,
--     mais os encerrados ainda dentro da janela do verde — e nada mais.
select titulo, ativo, encerrado_em, normalizado_minutos,
       case
         when ativo then 'tarja da severidade'
         else 'tarja VERDE ate ' || to_char(encerrado_em + make_interval(mins => normalizado_minutos),
                                            'DD/MM HH24:MI')
       end as o_que_aparece
from public.carbo_status_aviso
where ativo
   or (encerrado_em is not null
       and normalizado_minutos > 0
       and now() < encerrado_em + make_interval(mins => normalizado_minutos))
order by inicio_em desc;
