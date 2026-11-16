#!/usr/bin/env bash
# Roda UM arquivo .sql no banco de produção pela API de gerenciamento do Supabase.
# O arquivo inteiro vai numa chamada só = UMA transação (falhou, nada muda).
# Uso: rodar-sql.sh <arquivo>   (env: SUPABASE_ACCESS_TOKEN, SUPABASE_PROJECT_ID)
# Um arquivo de supabase/aplicar pode ser só um PONTEIRO: a primeira linha
#   -- @executar supabase/migrations/XXXX.sql
# manda rodar aquele arquivo (sem duplicar centenas de linhas).
set -euo pipefail
PERMITIDO='^supabase/(aplicar|migrations|consultas)/[A-Za-z0-9_.-]+\.sql$'
arquivo="$1"
[[ "$arquivo" =~ $PERMITIDO ]] || { echo "caminho recusado: $arquivo"; exit 1; }
[ -f "$arquivo" ] || { echo "arquivo não existe: $arquivo"; exit 1; }

alvo="$arquivo"
primeira=$(grep -v '^[[:space:]]*$' "$arquivo" | head -1 || true)
if [[ "$primeira" =~ ^--[[:space:]]*@executar[[:space:]]+([^[:space:]]+) ]]; then
  alvo="${BASH_REMATCH[1]}"
  [[ "$alvo" =~ $PERMITIDO ]] || { echo "ponteiro recusado: $alvo"; exit 1; }
  [ -f "$alvo" ] || { echo "ponteiro aponta para arquivo que não existe: $alvo"; exit 1; }
fi

echo "::group::$arquivo -> $alvo"
md5sum "$alvo"; wc -c < "$alvo"
jq -Rs '{query: .}' "$alvo" > /tmp/corpo.json
code=$(curl -sS -o /tmp/resposta.json -w '%{http_code}' --max-time 1000 -X POST \
  "https://api.supabase.com/v1/projects/${SUPABASE_PROJECT_ID}/database/query" \
  -H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}" \
  -H "Content-Type: application/json" --data @/tmp/corpo.json)
echo "HTTP $code"
(head -c 200000 /tmp/resposta.json | jq .) 2>/dev/null || head -c 200000 /tmp/resposta.json
echo "::endgroup::"
[ "$code" -lt 300 ]
