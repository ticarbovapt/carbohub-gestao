#!/usr/bin/env bash
# Testa a 20261177 num Postgres 16 LOCAL e descartável (nunca no de produção).
#   PG="psql -h /var/tmp/pgt -p 55432 -U postgres" bash docs/whatsapp/recompra/teste-local/rodar.sh
# Monta o mínimo (schema.sql), a fila como ela é desde a 20261044 + 20261056, a
# pipeline da 20261160, aplica a migração DUAS vezes (tem de ser idempotente) e
# roda os cenários. Saída esperada: só linhas "ok:", nenhuma "FALHOU".
set -euo pipefail
cd "$(dirname "$0")/../../../.."
PG=${PG:-"psql -h /var/tmp/pgt -p 55432 -U postgres"}
P="$PG -v ON_ERROR_STOP=1 -q"
T=$(mktemp -d)
awk '/^create or replace view public.carbo_msg_fila/,/^grant select on public.carbo_msg_fila/' \
  supabase/migrations/20261044000000_a_oferta_tem_hora_para_sair.sql > "$T/fila44.sql"
python3 - "$T" <<'PY'
import re, sys
t = sys.argv[1]
s = open('supabase/migrations/20261056000000_fila_montada_uma_vez_e_cadencia_sem_funcao.sql', encoding='utf-8').read()
b = '\n'.join(re.findall(r'\ndo \$\$.*?\n\$\$;', s, re.S)).replace("('carbo_carrinho_pipeline', ''),", "")
open(f'{t}/fila56.sql', 'w').write(b + '\n')
s = open('supabase/migrations/20261160000000_recompra_em_tabela.sql', encoding='utf-8').read()
i = s.index("  create or replace view public.carbo_recompra_pipeline with (security_invoker = true) as")
j = s.index("FROM public.carbo_recompra_base r;", i) + len("FROM public.carbo_recompra_base r;")
open(f'{t}/pipe60.sql', 'w').write(s[i:j] + '\n')
PY
D=docs/whatsapp/recompra/teste-local
$P -f $D/schema.sql 2>/dev/null; $P -f "$T/pipe60.sql"; $P -f "$T/fila44.sql"; $P -f "$T/fila56.sql"
M=supabase/migrations/20261177000000_recompra_regua_de_7_dias.sql
$P -1 -f $M > /dev/null 2>&1 || $P -1 -f $M
$P -1 -f $M > /dev/null 2>&1 || { echo "a 2ª aplicação falhou (não é idempotente)"; exit 1; }
$P -f $D/cenarios.sql 2>&1 | grep -E "ok:|FALHOU|ERROR"
