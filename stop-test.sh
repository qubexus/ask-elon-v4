#!/bin/bash
# Ask Elon – zatrzymuje wersję testową na żywo uruchomioną z tego folderu (MongoDB zostaje włączone).
ROOT="$(cd "$(dirname "$0")" && pwd)"
T="$ROOT/test-na-zywo"
for f in tunel serve backend; do
  [ -f "$T/run/$f.pid" ] && kill "$(cat "$T/run/$f.pid")" 2>/dev/null
  rm -f "$T/run/$f.pid"
done
pkill -f "$T/tunnel-keeper.sh" 2>/dev/null
pkill -f "$T/node_modules/.bin/pinggy" 2>/dev/null
pkill -f "$T/serve.py" 2>/dev/null
pkill -f "uvicorn server:app --host 127.0.0.1 --port ${BACKEND_PORT:-8001}" 2>/dev/null
rm -f "$T/run/adres.txt"
echo "Zatrzymano wersję testową."
