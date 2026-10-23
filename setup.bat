@echo off
chcp 65001 >nul
REM Ask Elon - jednorazowa instalacja (Windows). Kliknij dwa razy albo uruchom: setup.bat
cd /d "%~dp0"
set EMERGENT_INDEX=https://d33sy5i8bnduwe.cloudfront.net/simple/

echo == 1/4 Szukam Pythona (3.11-3.13) ==
set PY=
py -3.12 --version >nul 2>&1 && set PY=py -3.12
if not defined PY py -3.13 --version >nul 2>&1 && set PY=py -3.13
if not defined PY py -3.11 --version >nul 2>&1 && set PY=py -3.11
if not defined PY python --version >nul 2>&1 && set PY=python
if not defined PY (
  echo Brak Pythona. Zainstaluj Python 3.12 z python.org ^(zaznacz "Add python.exe to PATH"^).
  pause & exit /b 1
)
%PY% --version

echo == 2/4 Backend: srodowisko i biblioteki (kilka minut) ==
cd backend
if not exist .venv %PY% -m venv .venv
.venv\Scripts\python -m pip install --upgrade pip
.venv\Scripts\python -m pip install -r requirements.txt --extra-index-url %EMERGENT_INDEX%
if errorlevel 1 ( echo Blad instalacji bibliotek backendu. & pause & exit /b 1 )
if not exist .env ( copy .env.example .env >nul & echo Utworzono backend\.env - uzupelnij go! )
cd ..

echo == 3/4 Szukam Node.js i yarn ==
where node >nul 2>&1 || ( echo Brak Node.js. Zainstaluj Node.js 22 LTS z nodejs.org. & pause & exit /b 1 )
node -v
where yarn >nul 2>&1 || call npm install -g yarn

echo == 4/4 Frontend: biblioteki ==
cd frontend
call yarn install
if errorlevel 1 ( echo Blad instalacji bibliotek frontendu. & pause & exit /b 1 )
if not exist .env ( copy .env.example .env >nul & echo Utworzono frontend\.env )
cd ..

echo.
echo Gotowe! Uzupelnij backend\.env, wlacz MongoDB i uruchom start.bat
pause
