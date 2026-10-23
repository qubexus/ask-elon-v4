#!/bin/bash
# Ask Elon – utrzymuje tunel pinggy do aplikacji (domyślnie port 8090).
# Darmowy tunel pinggy wygasa po ok. 60 min – pinggy łączy się wtedy ponownie z NOWYM adresem.
# Aktualne adresy: test-na-zywo/run/adres.txt, historia: test-na-zywo/logi/adresy-historia.txt
HERE="$(cd "$(dirname "$0")" && pwd)"
PORT="${APP_PORT:-8090}"
PINGGY="$HERE/node_modules/.bin/pinggy"
mkdir -p "$HERE/run" "$HERE/logi"
while true; do
  echo "=== start $(date '+%F %T %Z')" >> "$HERE/logi/tunel.log"
  "$PINGGY" -p 443 -R0:localhost:$PORT --notui x:xff x:https 2>&1 < /dev/null | stdbuf -oL tr '\r' '\n' | while IFS= read -r line; do
    case "$line" in *Connections:*) continue;; esac
    echo "$line" >> "$HERE/logi/tunel.log"
    urls=$(echo "$line" | grep -oE 'https://[a-z0-9-]+\.(run\.pinggy-free\.link|free\.pinggy\.net)')
    if [ -n "$urls" ]; then
      for u in $urls; do
        case "$u" in *run.pinggy-free.link) echo "$u" > "$HERE/run/.a";; *free.pinggy.net) echo "$u" > "$HERE/run/.b";; esac
      done
      { cat "$HERE/run/.a" "$HERE/run/.b" 2>/dev/null; } > "$HERE/run/adres.txt"
      echo "$(date '+%F %T %Z') $(tr '\n' ' ' < "$HERE/run/adres.txt")" >> "$HERE/logi/adresy-historia.txt"
    fi
  done
  sleep 3
done
