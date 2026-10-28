#!/usr/bin/env bash
# Публикует приложение по HTTPS-ссылке (Cloudflare quick tunnel),
# которую можно скинуть в мессенджер — откроется в Яндекс/Chrome/Edge на Android.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PORT="${PORT:-4521}"
LOG_DIR="${TMPDIR:-/tmp}/fc-imperiya-share"
mkdir -p "$LOG_DIR"
TUNNEL_LOG="$LOG_DIR/cloudflared.log"
URL_FILE="$LOG_DIR/public-url.txt"

if ! command -v cloudflared >/dev/null 2>&1; then
  echo "cloudflared не найден. Установите: https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation/" >&2
  exit 1
fi

# Поднимаем production-preview, если порт свободен / свой процесс
if ! curl -sf "http://127.0.0.1:${PORT}/" >/dev/null 2>&1; then
  echo "Сборка…"
  npm run build
  echo "Старт preview на :${PORT}…"
  npx --yes vite preview --host 0.0.0.0 --port "$PORT" >"$LOG_DIR/preview.log" 2>&1 &
  echo $! >"$LOG_DIR/preview.pid"
  for i in $(seq 1 30); do
    curl -sf "http://127.0.0.1:${PORT}/" >/dev/null 2>&1 && break
    sleep 0.5
  done
fi

pkill -f "cloudflared tunnel --url http://127.0.0.1:${PORT}" 2>/dev/null || true
sleep 0.5

: >"$TUNNEL_LOG"
cloudflared tunnel --url "http://127.0.0.1:${PORT}" >"$TUNNEL_LOG" 2>&1 &
echo $! >"$LOG_DIR/cloudflared.pid"

URL=""
for i in $(seq 1 40); do
  URL=$(grep -oE 'https://[a-zA-Z0-9.-]+\.trycloudflare\.com' "$TUNNEL_LOG" | head -1 || true)
  if [[ -n "$URL" ]]; then
    break
  fi
  sleep 0.5
done

if [[ -z "$URL" ]]; then
  echo "Не удалось получить публичный URL. Лог:" >&2
  tail -n 40 "$TUNNEL_LOG" >&2 || true
  exit 1
fi

echo "$URL" >"$URL_FILE"
# Отдаём ссылку самому приложению (кнопка «Копировать»)
mkdir -p "$ROOT/public"
echo "$URL" >"$ROOT/public/share-url.txt"
if [[ -d "$ROOT/dist" ]]; then
  echo "$URL" >"$ROOT/dist/share-url.txt"
fi

echo ""
echo "════════════════════════════════════════"
echo "  Публичная ссылка (HTTPS, для Android):"
echo "  $URL"
echo "════════════════════════════════════════"
echo "Скопируйте и отправьте коллегам. Работает в Chrome / Яндекс / Edge."
echo "Файл со ссылкой: $URL_FILE"
echo ""

# Держим процесс туннеля на переднем плане, если скрипт запущен интерактивно
wait "$(cat "$LOG_DIR/cloudflared.pid")"
