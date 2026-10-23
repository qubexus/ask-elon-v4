#!/usr/bin/env bash
# Ask Elon – uruchamia serwer (backend) i aplikację (frontend) razem (macOS / Linux)
# Uruchom:  bash start.sh      Zatrzymanie: Ctrl+C
cd "$(dirname "$0")"
if [ ! -x backend/.venv/bin/python ] || [ ! -d frontend/node_modules ]; then
  echo "Najpierw uruchom instalację:  bash setup.sh"; exit 1
fi
[ -f backend/.env ] || { echo "Brak backend/.env – skopiuj backend/.env.example jako backend/.env"; exit 1; }
[ -f frontend/.env ] || cp frontend/.env.example frontend/.env

echo "Startuję backend na http://localhost:8001 ..."
( cd backend && .venv/bin/python -m uvicorn server:app --host 0.0.0.0 --port 8001 --reload ) &
BACKEND_PID=$!
trap 'echo; echo "Zatrzymuję..."; kill $BACKEND_PID 2>/dev/null; exit 0' INT TERM EXIT
sleep 4

echo "Startuję aplikację (Expo). Naciśnij  w  aby otworzyć w przeglądarce."
cd frontend && npx expo start --web
