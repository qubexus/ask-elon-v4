#!/usr/bin/env bash
# Ask Elon – jednorazowa instalacja (macOS / Linux)
# Uruchom w Terminalu z folderu projektu:  bash setup.sh
set -e
cd "$(dirname "$0")"

echo "== 1/4 Szukam Pythona (3.11-3.13) =="
PY=""
for c in python3.12 python3.13 python3.11 python3; do
  if command -v "$c" >/dev/null 2>&1; then PY="$c"; break; fi
done
if [ -z "$PY" ]; then echo "Brak Pythona. Zainstaluj Python 3.12 z python.org i uruchom ponownie."; exit 1; fi
echo "Używam: $($PY --version)"

echo "== 2/4 Backend: środowisko i biblioteki (kilka minut) =="
cd backend
[ -d .venv ] || "$PY" -m venv .venv
.venv/bin/python -m pip install --upgrade pip
.venv/bin/python -m pip install -r requirements.txt
[ -f .env ] || { cp .env.example .env; echo "Utworzono backend/.env – uzupełnij go!"; }
# Własny, losowy JWT_SECRET (wpisywany tylko raz, gdy w .env jest jeszcze napis zastępczy)
.venv/bin/python -c "import secrets,pathlib; p=pathlib.Path('.env'); t=p.read_text(encoding='utf-8'); p.write_text(t.replace('WYGENERUJ_WLASNY_DLUGI_LOSOWY_CIAG', secrets.token_hex(32)), encoding='utf-8')"
cd ..

echo "== 3/4 Szukam Node.js i yarn =="
if ! command -v node >/dev/null 2>&1; then echo "Brak Node.js. Zainstaluj Node.js 22 LTS z nodejs.org i uruchom ponownie."; exit 1; fi
echo "Node: $(node -v)"
if ! command -v yarn >/dev/null 2>&1; then
  echo "Instaluję yarn..."; npm install -g yarn || sudo npm install -g yarn
fi

echo "== 4/4 Frontend: biblioteki =="
cd frontend
yarn install
[ -f .env ] || { cp .env.example .env; echo "Utworzono frontend/.env"; }
cd ..

echo ""
echo "Gotowe! W backend/.env wpisz GEMINI_API_KEY (i ewentualnie resztę), włącz MongoDB i uruchom:  bash start.sh"
