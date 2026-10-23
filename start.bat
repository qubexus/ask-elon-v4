@echo off
chcp 65001 >nul
REM Ask Elon - uruchamia backend i frontend (Windows). Kliknij dwa razy start.bat
cd /d "%~dp0"
if not exist backend\.venv\Scripts\python.exe ( echo Najpierw uruchom setup.bat & pause & exit /b 1 )
if not exist frontend\node_modules ( echo Najpierw uruchom setup.bat & pause & exit /b 1 )
if not exist backend\.env ( echo Brak backend\.env - skopiuj backend\.env.example jako backend\.env & pause & exit /b 1 )
if not exist frontend\.env copy frontend\.env.example frontend\.env >nul

echo Startuje backend na http://localhost:8001 (osobne okno "Ask Elon - backend")
start "Ask Elon - backend" cmd /k "cd /d "%~dp0backend" && .venv\Scripts\python -m uvicorn server:app --host 0.0.0.0 --port 8001 --reload"
timeout /t 4 /nobreak >nul

echo Startuje aplikacje (Expo). Nacisnij  w  aby otworzyc w przegladarce.
cd frontend
call npx expo start --web
