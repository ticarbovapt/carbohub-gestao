#!/usr/bin/env bash
# Converte para a web os vídeos dos Quadros do Marketing que o navegador não
# toca (o .MOV do iPhone é HEVC, e o Chrome não reproduz HEVC).
#
# Quem chama: .github/workflows/mkt-transcodificar.yml.
# Quem guarda o estado: public.mkt_card_attachments.web_* (migração 20261062).
# A porta: a edge function `mkt-video-web`, com o CRON_SECRET.
#
# Para cada vídeo pendente:
#   1. ffprobe olha codec, pixel e container;
#   2. já toca no navegador (H.264/VP9/AV1, 8 bits 4:2:0, em mp4/webm)?
#        → marca "nativo" e não sobe nada;
#      H.264 8 bits em .mov?  → só troca o envelope (rápido, sem perder nada);
#      senão                  → converte para H.264 + AAC, até 1080p;
#   3. vídeo sem capa (os vindos do Trello) ganha uma do próprio quadro.
#
# ⚠️ O ORIGINAL não é tocado: "Baixar" continua entregando o que subiu.
# ⚠️ Falha de UM vídeo não para a fila: ele conta uma tentativa (três e para de
#    tentar, com o erro gravado) e o laço segue para o próximo.
set -uo pipefail

: "${CRON_SECRET:?CRON_SECRET ausente}"
: "${SUPABASE_URL:?SUPABASE_URL ausente}"
LIMITE="${LIMITE:-6}"
FN="${SUPABASE_URL}/functions/v1/mkt-video-web"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

chamar() { # chamar '<json>'  → corpo da resposta; falha alto em HTTP ≠ 2xx
  local resp codigo
  resp=$(curl -sS -m 60 -w '\n%{http_code}' -X POST "$FN" \
    -H "Content-Type: application/json" -H "x-cron-secret: ${CRON_SECRET}" --data "$1") || return 1
  codigo="${resp##*$'\n'}"
  resp="${resp%$'\n'*}"
  if [ "${codigo:0:1}" != "2" ]; then echo "HTTP ${codigo}: ${resp}" >&2; return 1; fi
  printf '%s' "$resp"
}

subir() { # subir <id> <web|capa> <arquivo> <content-type> → caminho no bucket
  local r url caminho
  r=$(chamar "$(jq -nc --arg id "$1" --arg t "$2" '{acao:"enviar", id:$id, tipo:$t}')") || return 1
  url=$(jq -r '.url' <<<"$r"); caminho=$(jq -r '.caminho' <<<"$r")
  curl -sS -f -m 1800 -X PUT -H "Content-Type: $4" -H "x-upsert: false" --data-binary @"$3" "$url" >/dev/null || return 1
  printf '%s' "$caminho"
}

PEND=$(chamar "$(jq -nc --argjson l "$LIMITE" '{acao:"pendentes", limite:$l}')") || {
  echo "::error::a fila não respondeu — confira o secret CRON_SECRET e se a função mkt-video-web foi publicada"
  exit 1
}
N=$(jq '.itens | length' <<<"$PEND")
echo "vídeos na fila desta rodada: $N"

for i in $(seq 0 $((N - 1))); do
  item=$(jq -c ".itens[$i]" <<<"$PEND")
  id=$(jq -r .id <<<"$item"); nome=$(jq -r .nome <<<"$item")
  sp=$(jq -r .storage_path <<<"$item"); sem_capa=$(jq -r .sem_capa <<<"$item")
  url=$(jq -r .url <<<"$item")
  ext=$(tr '[:upper:]' '[:lower:]' <<<"${nome##*.}")
  echo "── $nome ($id)"

  falhar() {
    echo "::warning::$nome: $1"
    chamar "$(jq -nc --arg id "$id" --arg sp "$sp" --arg e "$1" '{acao:"falhou", id:$id, storage_path:$sp, erro:$e}')" >/dev/null || true
  }

  rm -f "$TMP"/*
  if ! curl -sS -f -m 1800 -o "$TMP/in" "$url"; then falhar "não consegui baixar o original"; continue; fi

  info=$(ffprobe -v error -select_streams v:0 \
    -show_entries stream=codec_name,pix_fmt -of json "$TMP/in" 2>"$TMP/probe.err")
  codec=$(jq -r '.streams[0].codec_name // empty' <<<"$info")
  pix=$(jq -r '.streams[0].pix_fmt // empty' <<<"$info")
  if [ -z "$codec" ]; then falhar "o arquivo não tem vídeo legível: $(head -c 300 "$TMP/probe.err")"; continue; fi
  echo "   codec=$codec pix=$pix ext=$ext"

  web=""
  ok8bit=false; [ "$pix" = "yuv420p" ] || [ "$pix" = "yuvj420p" ] && ok8bit=true
  if $ok8bit && { [ "$codec" = "h264" ] || [ "$codec" = "vp9" ] || [ "$codec" = "av1" ] || [ "$codec" = "vp8" ]; } \
     && { [ "$ext" = "mp4" ] || [ "$ext" = "m4v" ] || [ "$ext" = "webm" ]; }; then
    echo "   já toca no navegador"
  elif $ok8bit && [ "$codec" = "h264" ]; then
    echo "   H.264 em envelope $ext → troca só o envelope"
    if ! ffmpeg -nostdin -v error -i "$TMP/in" -map 0:v:0 -map '0:a:0?' -c:v copy -c:a aac -b:a 160k \
         -movflags +faststart "$TMP/web.mp4" 2>"$TMP/ff.err"; then
      falhar "remux: $(tail -c 400 "$TMP/ff.err")"; continue
    fi
    web="$TMP/web.mp4"
  else
    echo "   convertendo para H.264…"
    # ⚠️ Até 1080p no MAIOR lado — vertical (Reels) continua vertical. O
    # ffmpeg já aplica a rotação gravada pelo celular.
    if ! ffmpeg -nostdin -v error -i "$TMP/in" -map 0:v:0 -map '0:a:0?' \
         -vf "scale='if(gte(iw,ih),min(1920,iw),-2)':'if(gte(iw,ih),-2,min(1920,ih))'" \
         -c:v libx264 -preset veryfast -crf 21 -pix_fmt yuv420p -c:a aac -b:a 160k \
         -movflags +faststart "$TMP/web.mp4" 2>"$TMP/ff.err"; then
      falhar "conversão: $(tail -c 400 "$TMP/ff.err")"; continue
    fi
    web="$TMP/web.mp4"
  fi

  capa_caminho=""
  if [ "$sem_capa" = "true" ]; then
    fonte="${web:-$TMP/in}"
    if ffmpeg -nostdin -v error -ss 1 -i "$fonte" -frames:v 1 \
         -vf "scale='if(gte(iw,ih),480,-2)':'if(gte(iw,ih),-2,480)'" -q:v 4 "$TMP/capa.jpg" 2>/dev/null \
       || ffmpeg -nostdin -v error -i "$fonte" -frames:v 1 \
         -vf "scale='if(gte(iw,ih),480,-2)':'if(gte(iw,ih),-2,480)'" -q:v 4 "$TMP/capa.jpg" 2>/dev/null; then
      capa_caminho=$(subir "$id" capa "$TMP/capa.jpg" image/jpeg) || capa_caminho=""
    fi
  fi

  if [ -n "$web" ]; then
    echo "   web: $(du -h "$web" | cut -f1) (original $(du -h "$TMP/in" | cut -f1))"
    web_caminho=$(subir "$id" web "$web" video/mp4) || { falhar "não consegui subir a cópia web"; continue; }
    corpo=$(jq -nc --arg id "$id" --arg sp "$sp" --arg w "$web_caminho" --arg c "$capa_caminho" \
      '{acao:"concluir", id:$id, storage_path:$sp, web_path:$w} + (if $c == "" then {} else {poster_path:$c} end)')
  else
    corpo=$(jq -nc --arg id "$id" --arg sp "$sp" --arg c "$capa_caminho" \
      '{acao:"concluir", id:$id, storage_path:$sp, nativo:true} + (if $c == "" then {} else {poster_path:$c} end)')
  fi
  r=$(chamar "$corpo") || { falhar "a conclusão foi recusada"; continue; }
  echo "   $r"
done
