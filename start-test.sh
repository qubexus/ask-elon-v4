#!/bin/bash
# Ask Elon – WERSJA TESTOWA NA ŻYWO jednym poleceniem (Linux, ten komputer).
#   ./start-test.sh           start (buduje aplikację webową, jeśli trzeba)
#   ./start-test.sh --build   start z wymuszonym przebudowaniem aplikacji (po zmianach we frontend/)
# Zatrzymanie: ./stop-test.sh
# Ustawienia i sekrety (klucz Gemini, JWT_SECRET, baza) są TYLKO w backend/.env – ten skrypt ich nie zawiera.
set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"
T="$ROOT/test-na-zywo"
BACKEND_PORT="${BACKEND_PORT:-8001}"
APP_PORT="${APP_PORT:-8090}"
mkdir -p "$T/run" "$T/logi" "$T/dane/uploads"

# Python: backend/.venv (po setup.sh) albo wspólne środowisko na tym komputerze
if [ -n "$VENV" ]; then PY="$VENV/bin/python"
elif [ -x "$ROOT/backend/.venv/bin/python" ]; then PY="$ROOT/backend/.venv/bin/python"
else PY="/workspace/ae-venv/bin/python"; fi
[ -x "$PY" ] || { echo "Brak Pythona z pakietami backendu ($PY). Uruchom: bash setup.sh"; exit 1; }
[ -f "$ROOT/backend/.env" ] || { echo "Brak backend/.env (skopiuj backend/.env.example i uzupełnij)"; exit 1; }
grep -q '^GEMINI_API_KEY=..' "$ROOT/backend/.env" || echo "UWAGA: brak GEMINI_API_KEY w backend/.env – czat i dokumenty nie odpowiedzą."

# MongoDB musi działać na localhost:27017
if ! (exec 3<>/dev/tcp/127.0.0.1/27017) 2>/dev/null; then
  MONGOD="${MONGOD:-/tmp/mongodb-linux-x86_64-debian12-8.0.4/bin/mongod}"
  MONGO_DATA="${MONGO_DATA:-/tmp/mongodata}"
  [ -x "$MONGOD" ] || { echo "MongoDB nie działa, a nie znaleziono mongod ($MONGOD)"; exit 1; }
  echo "Startuję MongoDB ($MONGO_DATA)..."
  mkdir -p "$MONGO_DATA"
  nohup "$MONGOD" --dbpath "$MONGO_DATA" --bind_ip 127.0.0.1 --port 27017 > "$T/logi/mongod.log" 2>&1 < /dev/null &
  sleep 3
fi

# Zależności
[ -d "$ROOT/frontend/node_modules" ] || (cd "$ROOT/frontend" && npx --yes yarn install)
[ -x "$T/node_modules/.bin/pinggy" ] || (cd "$T" && npm install --no-audit --no-fund)

# Zatrzymaj poprzednie uruchomienie z tego folderu
"$ROOT/stop-test.sh" >/dev/null 2>&1 || true

# Aplikacja webowa (adres /api względny, więc działa pod każdym adresem tunelu)
if [ "$1" = "--build" ] || [ ! -f "$T/dist/index.html" ]; then
  echo "Buduję aplikację webową (ok. 30 s)..."
  rm -rf "$T/dist"
  (cd "$ROOT/frontend" && EXPO_PUBLIC_BACKEND_URL=__API_ORIGIN__ CI=1 npx expo export --platform web --clear --output-dir "$T/dist") > "$T/logi/build.log" 2>&1 \
    || { echo "Budowanie nie powiodło się – zobacz $T/logi/build.log"; exit 1; }
  sed -i 's#__API_ORIGIN__/api#/api#g' "$T"/dist/_expo/static/js/web/*.js
fi

echo "Startuję backend (port $BACKEND_PORT)..."
cd "$ROOT/backend"; nohup "$PY" -m uvicorn server:app --host 127.0.0.1 --port "$BACKEND_PORT" > "$T/logi/backend.log" 2>&1 < /dev/null &
echo $! > "$T/run/backend.pid"
echo "Startuję serwer aplikacji (port $APP_PORT)..."
cd "$T"; nohup python3 "$T/serve.py" "$T/dist" "$APP_PORT" "$BACKEND_PORT" > "$T/logi/serve.log" 2>&1 < /dev/null &
echo $! > "$T/run/serve.pid"
echo "Startuję tunel pinggy..."
rm -f "$T/run/adres.txt" "$T/run/.a" "$T/run/.b"
APP_PORT="$APP_PORT" setsid nohup "$T/tunnel-keeper.sh" > /dev/null 2>&1 < /dev/null &
echo $! > "$T/run/tunel.pid"
cd "$ROOT"

for i in $(seq 1 40); do [ -s "$T/run/adres.txt" ] && break; sleep 1; done
sleep 1
curl -s -m 5 "http://127.0.0.1:$BACKEND_PORT/api/auth/config" >/dev/null && echo "Backend: OK" || echo "Backend: jeszcze startuje – zobacz $T/logi/backend.log"
if [ -s "$T/run/adres.txt" ]; then
  echo; echo "Aplikacja jest dostępna pod adresem (wygasa po ok. 60 min, potem nowy adres w $T/run/adres.txt):"
  cat "$T/run/adres.txt"
else
  echo "Tunel jeszcze się łączy – adres pojawi się w $T/run/adres.txt"
fi
