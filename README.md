# Ask Elon – uruchomienie aplikacji na własnym komputerze (bez Emergent)

Cześć Piotr! 👋 To jest kod Twojej aplikacji **Ask Elon** (stan z Emergent z 23.10.2026),
**przerobiony tak, żeby działał bez Emergent i bez kredytów Emergent**: na Twoich własnych kluczach.
Instrukcja prowadzi krok po kroku, na **Windows** albo **macOS**. Nie trzeba być programistą: wystarczy kopiować polecenia.

> Ważne: pliki z hasłami i kluczami (`.env`) **nie są** w tej paczce. Tworzą się same z wzorów
> (`.env.example`) podczas instalacji, a Ty wpisujesz do nich swoje klucze.
> Plików `.env` nigdy nikomu nie wysyłaj i nie wrzucaj na GitHuba.

---

## 1. Co jest w środku

| Część | Folder | Technologia | Adres po uruchomieniu |
|---|---|---|---|
| **Serwer (backend)** | `backend/` | Python + FastAPI, baza MongoDB | http://localhost:8001 (API pod `/api`) |
| **Aplikacja (frontend)** | `frontend/` | Expo (React Native): przeglądarka i telefon | http://localhost:8081 |

Co aplikacja robi:
- **Czat z Elonem**: asystent AI o prawach pracownika w UK, po polsku, angielsku i rumuńsku;
  dyktowanie głosem i odsłuchiwanie odpowiedzi; osobne rozmowy dla każdej sprawy.
- **Sprawy**: lista spraw (otwarte/rozwiązane), zapis czatu jako sprawy.
- **Pisma**: wzory pism (np. skarga formalna, zaległe wynagrodzenie, SSP) wypełniane danymi z profilu; lista wysłanych pism.
- **Forum**: wpisy, komentarze i polubienia.
- **Profil**: dane pracownika, **dokumenty** (umowy, odcinki wypłat, analiza przez AI), sprawdzanie odcinków wypłat, skan zdjęcia dokumentu.
- **Logowanie**: e-mail + hasło (z resetem hasła mailem) oraz **Google** (jeśli je skonfigurujesz).
- **Subskrypcja**: PayPal (strona www) i RevenueCat (sklepy Apple/Google), £9.99/mies.
- **Panel admina**: statystyki, użytkownicy, kody promocyjne, wiadomości do użytkowników, formularz kontaktowy.

Z czego korzysta (wszystko Twoje, bez Emergent):

| Do czego | Usługa | Zmienna w `backend/.env` |
|---|---|---|
| Czat, dokumenty, odcinki wypłat, skan zdjęć, dyktowanie, czytanie na głos | **Google Gemini** (jeden klucz) | `GEMINI_API_KEY` |
| Logowanie przez Google (opcjonalne) | Google Sign-In | `GOOGLE_CLIENT_IDS` (+ 3 zmienne w `frontend/.env`) |
| Kody do resetu hasła | Twoja poczta (SMTP), np. contact@askelon.uk | `SMTP_*`, `MAIL_FROM` |
| Pliki użytkowników | dysk komputera/serwera **albo** Cloudflare R2 / S3 | `STORAGE_BACKEND`, `S3_*` |
| Baza danych | MongoDB (na komputerze albo Atlas) | `MONGO_URL` |

---

## 2. Co zainstalować (jednorazowo)

| Program | Wersja | Skąd |
|---|---|---|
| **VS Code** (edytor, zalecany) | najnowszy | https://code.visualstudio.com |
| **Python** | **3.12** (działa też 3.13 i 3.11) | https://www.python.org/downloads/ |
| **Node.js** | **22 LTS** (minimum 20.19.4) | https://nodejs.org |
| **yarn** | 1.22 (instaluje się sam w `setup`) | `npm install -g yarn` |
| **MongoDB** | Community Server 7 lub 8 **albo** darmowe Atlas | patrz niżej |

**Windows – Python:** w instalatorze koniecznie zaznacz **„Add python.exe to PATH”**.
**macOS – Python:** instalator z python.org (albo `brew install python@3.12`).

### Baza danych MongoDB: wybierz jedną opcję

**A) MongoDB na komputerze (najprościej do testów)**
- **Windows:** „MongoDB Community Server” (MSI) z https://www.mongodb.com/try/download/community,
  zainstaluj z opcją **„Install MongoD as a Service”**.
- **macOS** (Homebrew, https://brew.sh):
  ```bash
  brew tap mongodb/brew
  brew install mongodb-community
  brew services start mongodb-community
  ```
- W `backend/.env` zostaw `MONGO_URL=mongodb://localhost:27017`.

**B) MongoDB Atlas (darmowa baza w chmurze)**
1. Konto na https://www.mongodb.com/atlas → darmowy klaster (M0/Free).
2. Dodaj użytkownika bazy (Database Access) i swój adres IP (Network Access).
3. **Connect → Drivers** → skopiuj adres `mongodb+srv://...` do `MONGO_URL`.

---

## 3. Uruchomienie krok po kroku

### Krok 1 – Otwórz folder
Rozpakuj paczkę, np. do `Dokumenty/ask-elon-app-lokalnie`, otwórz folder w VS Code
(**File → Open Folder**), potem terminal: **Terminal → New Terminal**.

### Krok 2 – Instalacja (jednorazowo, 5–10 minut)
- **Windows:** kliknij dwa razy `setup.bat` (albo w terminalu `.\setup.bat`)
- **macOS:** `bash setup.sh`

Skrypt instaluje biblioteki serwera (tylko ze zwykłego PyPI) i aplikacji, tworzy `backend/.env` i `frontend/.env`
z wzorów i **sam wpisuje losowy `JWT_SECRET`**.

<details><summary>To samo ręcznie, gdyby skrypt nie zadziałał</summary>

```bash
cd backend
python3.12 -m venv .venv                       # Windows: py -3.12 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt   # Windows: .venv\Scripts\python -m pip install -r requirements.txt
cp .env.example .env                           # Windows: copy .env.example .env
python -c "import secrets; print(secrets.token_hex(32))"   # wynik wklej do JWT_SECRET w backend/.env
cd ../frontend
npm install -g yarn
yarn install
cp .env.example .env                           # Windows: copy .env.example .env
```
</details>

### Krok 3 – Wpisz klucz AI
Otwórz `backend/.env` i wpisz **`GEMINI_API_KEY`** (jak go zdobyć: sekcja 4.1).
Reszta może na początek zostać tak, jak jest. Bez klucza aplikacja działa, ale czat, dokumenty i głos
pokażą komunikat, że AI nie jest skonfigurowane.

### Krok 4 – Start
Upewnij się, że MongoDB działa, i uruchom:
- **Windows:** dwa razy `start.bat` (otworzy się drugie okno z serwerem),
- **macOS:** `bash start.sh`.

Gdy pojawi się `Waiting on http://localhost:8081`, naciśnij **`w`** albo otwórz **http://localhost:8081**.

### Krok 5 – Załóż konto
Lokalna baza jest pusta: **„Utwórz konto”** → e-mail i hasło (min. 8 znaków).
Adresy z `ADMIN_EMAILS` (domyślnie `jocobisun@gmail.com`) dostają panel admina.

**Zatrzymanie:** `Ctrl+C` w terminalu (na Windows zamknij też okno „Ask Elon – backend”).

### Ręczny start (bez skryptów)
```bash
# terminal 1 – serwer
cd backend
.venv\Scripts\python -m uvicorn server:app --host 0.0.0.0 --port 8001 --reload     # Windows
.venv/bin/python -m uvicorn server:app --host 0.0.0.0 --port 8001 --reload         # macOS

# terminal 2 – aplikacja
cd frontend
npx expo start --web
```
Sprawdzenie serwera: http://localhost:8001/api/templates pokazuje listę pism,
a http://localhost:8001/api/docs (tylko w trybie `development`) listę funkcji API.

> Po każdej zmianie `frontend/.env` uruchom aplikację z czyszczeniem pamięci: `npx expo start --web --clear`.

### Na telefonie (opcjonalnie)
1. Telefon i komputer w tej samej sieci Wi-Fi.
2. W `frontend/.env`: `EXPO_PUBLIC_BACKEND_URL=http://192.168.x.x:8001` (adres IP komputera:
   Windows `ipconfig` → „IPv4 Address”; macOS Ustawienia → Wi-Fi → Szczegóły).
3. Uruchom ponownie `start` i zeskanuj kod QR aplikacją **Expo Go**.
   Logowanie Google i zakupy w sklepie działają dopiero w zbudowanej aplikacji (development build / EAS), nie w Expo Go.

---

## 4. Klucze i ustawienia (co założyć i gdzie wpisać)

Pełna lista z opisami jest w `backend/.env.example` i `frontend/.env.example`.

### 4.1 Google Gemini (AI): **potrzebne**
1. Wejdź na https://aistudio.google.com/apikey i zaloguj się kontem Google.
2. **Create API key** → wybierz/utwórz projekt → skopiuj klucz (zaczyna się zwykle od `AIza`).
3. Wklej do `backend/.env`: `GEMINI_API_KEY=...` i zrestartuj serwer.
4. Darmowy poziom Google ma limity zapytań. Dla prawdziwych użytkowników włącz płatności w Google AI Studio
   (Billing), wtedy płacisz Google za użycie, a nie Emergent.

Modele (domyślne zwykle wystarczą):
- `GEMINI_MODEL=gemini-2.5-flash`: czat (i domyślnie dokumenty oraz dyktowanie),
- `GEMINI_TTS_MODEL=gemini-2.5-flash-preview-tts`: czytanie odpowiedzi na głos, głos `GEMINI_TTS_VOICE=Charon`,
- opcjonalnie `GEMINI_DOC_MODEL`, `GEMINI_STT_MODEL`.
- Opcjonalnie głos przez OpenAI: `OPENAI_API_KEY` + `STT_PROVIDER=openai` / `TTS_PROVIDER=openai`. Domyślnie wszystko idzie przez Gemini.

### 4.2 Logowanie Google: opcjonalne
Bez tego przycisk Google jest **ukryty**, a logowanie e-mailem działa normalnie.
1. https://console.cloud.google.com → nowy projekt „Ask Elon”.
2. **APIs & Services → OAuth consent screen**: typ *External*, nazwa „Ask Elon”, e-mail kontaktowy, domena `askelon.uk`.
3. **Credentials → Create credentials → OAuth client ID**, trzy razy:
   - **Web application**: *Authorized JavaScript origins* i *Authorized redirect URIs*: `http://localhost:8081`
     (oraz później adres wersji www, np. `https://app.askelon.uk`).
   - **iOS**: Bundle ID `uk.askelon.app`.
   - **Android**: package `uk.askelon.app` + odcisk SHA-1 klucza podpisu (z EAS: `eas credentials`).
4. Wpisz identyfikatory (kończą się na `.apps.googleusercontent.com`):
   - `frontend/.env`: `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`, `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`, `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID`,
   - `backend/.env`: `GOOGLE_CLIENT_IDS=` wszystkie trzy po przecinku (serwer sprawdza nimi token Google).

### 4.3 E-mail z kodem do resetu hasła (SMTP): potrzebne przed publikacją
Wpisz dane serwera poczty wychodzącej od dostawcy skrzynki (np. tej, na której działa `contact@askelon.uk`):
`SMTP_HOST`, `SMTP_PORT` (587 albo 465), `SMTP_USER`, `SMTP_PASSWORD`, `MAIL_FROM=contact@askelon.uk`.
Kod ma 6 cyfr, jest ważny 15 minut, działa raz i po 5 błędnych próbach przestaje działać.
Bez SMTP w trybie `development` kod pokazuje się w oknie serwera (`[DEV ONLY] PASSWORD RESET CODE`);
w trybie `production` kod **nigdy** nie trafia do logów.

### 4.4 Pliki użytkowników
- `STORAGE_BACKEND=local` (domyślnie): pliki w `backend/uploads/`. Dobre na komputer i serwer z trwałym dyskiem. Rób kopie zapasowe tego folderu.
- `STORAGE_BACKEND=s3`: chmura, np. **Cloudflare R2** (masz już konto Cloudflare dla askelon.uk):
  R2 → Create bucket (np. `ask-elon-docs`, **bez** publicznego dostępu) → *Manage R2 API Tokens* → token z prawem Object Read & Write. Wpisz:
  `S3_ENDPOINT_URL=https://<ACCOUNT_ID>.r2.cloudflarestorage.com`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`.
Pliki nigdy nie są publiczne: aplikacja pobiera je przez serwer po sprawdzeniu, czyje są.

### 4.5 Pozostałe
- `ADMIN_EMAILS`: kto ma panel admina (po przecinku).
- **PayPal**: `PAYPAL_CLIENT_ID`, `PAYPAL_SECRET`, `PAYPAL_API_BASE` z https://developer.paypal.com (najpierw Sandbox).
  Na produkcji ustaw też `PUBLIC_BACKEND_URL` (adres serwera), bo na niego PayPal odsyła po płatności.
- **RevenueCat** (`frontend/.env`): publiczne klucze z https://app.revenuecat.com. Projekt zakładała integracja Emergent;
  jeśli nie masz do niego dostępu, załóż własny. Puste = zakup w sklepie nie działa, reszta tak.

### 4.6 Identyfikator aplikacji (sklepy)
W `frontend/app.json` jest już `uk.askelon.app` (iOS `bundleIdentifier` i Android `package`) i schemat linków `askelon`.
**Ten sam identyfikator musi być w App Store Connect, Google Play Console, Google Cloud (klienci OAuth) i RevenueCat.**
Jeśli w sklepach jest już inny, wpisz go tutaj zamiast `uk.askelon.app`.

---

## 5. Bezpieczeństwo

Co jest zrobione w kodzie:
- **Usunięte logowanie Demo** (wspólne konto z PRO bez hasła i hasło w kodzie) w serwerze i w aplikacji.
- **Admini tylko z `ADMIN_EMAILS`**: żadnego adresu na stałe w kodzie.
- **`JWT_SECRET` obowiązkowy**: serwer nie wystartuje bez niego (na produkcji min. 32 znaki). Logowanie wygasa po `SESSION_DAYS` (7 dni).
- **Reset hasła mailem**: kod 15 min, jednorazowy, maks. 5 prób; nigdy nie wraca w odpowiedzi serwera; w logu tylko w trybie development.
- **Limity zapytań** (ochrona przed zgadywaniem haseł i nadużyciami): logowanie, rejestracja, reset hasła, czat, głos, wysyłanie plików, forum.
  Przekroczenie = błąd 429 „Too many requests”.
- **CORS**: tylko adresy z `ALLOWED_ORIGINS` (bez „*”).
- **Pliki**: maks. 20 MB na dokument (25 MB na zapytanie), sprawdzany prawdziwy typ pliku (PDF/PNG/JPG), dostęp tylko dla właściciela.
- **Błędy**: użytkownik widzi krótki komunikat, bez szczegółów technicznych; szczegóły są tylko w logu serwera.
- Nagłówki bezpieczeństwa (nosniff, ochrona przed ramkami, HSTS na produkcji), lista API (`/api/docs`) wyłączona na produkcji.
- Powrót z PayPal tylko do Twojej aplikacji (adresy z `ALLOWED_ORIGINS` lub schemat `askelon://`).

Przed publikacją (lista kontrolna):
1. `APP_ENV=production` w `backend/.env` na serwerze.
2. Własny, długi `JWT_SECRET` (setup wpisuje go sam; na serwerze wygeneruj nowy).
3. Ustawione SMTP (inaczej użytkownicy nie zresetują hasła).
4. `ALLOWED_ORIGINS` = adres Twojej aplikacji www (np. `https://app.askelon.uk`), `PUBLIC_BACKEND_URL` = adres serwera.
5. Serwer za HTTPS. Jeśli za proxy (Cloudflare, Render, Nginx): `TRUST_PROXY=true`.
6. `STORAGE_BACKEND=s3` (R2) albo kopie zapasowe `backend/uploads/`, oraz kopie zapasowe bazy.
7. Klucze PayPal **Live** dopiero po testach w Sandbox.
8. Limity zapytań działają w pamięci jednego procesu serwera. Przy kilku serwerach warto dodać wspólny limit (np. Redis lub Cloudflare).

---

## 6. Testy (dla ciekawych)
Przy uruchomionym serwerze (`APP_ENV=development`):
```bash
cd backend
.venv/bin/python -m pytest -n 0 tests/test_ai_unit.py               # AI na „udawanym” Gemini, bez internetu
TEST_ADMIN_EMAIL=twoj@admin.pl TEST_BACKEND_LOG=<plik z logiem serwera> \
  .venv/bin/python -m pytest -n 0 tests/test_local_security.py       # logowanie, reset, CORS, pliki, admin
```
Domyślny adres testów to `http://localhost:8001` (zmiana: `TEST_BASE_URL`). Do testów wielu kont naraz można uruchomić
serwer z `DISABLE_RATE_LIMIT=1` (działa tylko w trybie development). Starsze testy z Emergent (`test_iter*.py`)
częściowo wymagają kont testowych i kluczy (`TEST_PRO_EMAIL`, `GEMINI_API_KEY`, PayPal), bez nich część się nie powiedzie.

---

## 7. Gdy coś nie działa

| Objaw | Co zrobić |
|---|---|
| `RuntimeError: JWT_SECRET is missing or too weak` | W `backend/.env` wpisz losowy `JWT_SECRET` (polecenie w komentarzu w pliku) albo uruchom ponownie `setup`. |
| `ServerSelectionTimeoutError` / serwer wisi na starcie | MongoDB nie działa. Windows: Usługi → „MongoDB Server” → Start. macOS: `brew services start mongodb-community`. |
| Czat: „AI assistant is not configured…” (503) | Brak `GEMINI_API_KEY` w `backend/.env`; wpisz i zrestartuj serwer. |
| Czat: „Elon is temporarily unavailable” | Zły klucz Gemini, limit darmowego poziomu albo brak internetu; szczegóły w oknie serwera. |
| Czat odpowiada 403 | Najpierw uzupełnij profil (wymagane pola). Tak działa aplikacja. |
| Brak przycisku Google | Nie ma `EXPO_PUBLIC_GOOGLE_..._CLIENT_ID` dla tej platformy. Po wpisaniu: `npx expo start --web --clear`. |
| Google: „redirect_uri_mismatch” | W Google Cloud (klient *Web*) dodaj dokładny adres aplikacji, np. `http://localhost:8081`. |
| Nie przychodzi mail z kodem | Sprawdź `SMTP_*` i `MAIL_FROM`; błąd wysyłki widać w oknie serwera. |
| 429 „Too many requests” | Za dużo prób w krótkim czasie; odczekaj kilka–kilkanaście minut. |
| `'py' / 'python' is not recognized` | Zainstaluj Pythona ponownie z „Add python.exe to PATH”, otwórz nowy terminal. |
| `yarn: command not found` | `npm install -g yarn`, zamknij i otwórz terminal. |
| Node: „The engine node is incompatible” | Zainstaluj Node.js 22 LTS. |
| PowerShell: „running scripts is disabled” | Użyj **Command Prompt** w VS Code albo `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`. |
| `Port 8001/8081 is already in use` | Zamknij poprzednie okna serwera albo uruchom ponownie komputer. |
| Aplikacja „nie widzi” serwera / błąd CORS | `EXPO_PUBLIC_BACKEND_URL` w `frontend/.env` (bez `/api`), a adres aplikacji musi być w `ALLOWED_ORIGINS`. |
| Stare dokumenty z Emergent się nie otwierają | Pliki z Emergent zostały na ich serwerze. Wgraj dokumenty ponownie. |

---

## 8. Co zmieniono względem kopii z Emergent
- **Bez Emergent:** usunięto bibliotekę `emergentintegrations`, `litellm` z serwera Emergent i dodatkowy indeks pakietów.
  AI przez oficjalną bibliotekę Google `google-genai` (`backend/ai.py`), pliki przez `backend/storage.py` (dysk albo S3/R2),
  maile przez `backend/mailer.py`. W kodzie nie ma już adresów `emergentagent.com` ani `INTEGRATION_PROXY_URL`.
- **Logowanie Google:** zamiast Emergent Auth standardowe Google Sign-In (`expo-auth-session` w aplikacji, weryfikacja tokenu `google-auth` na serwerze,
  nowy endpoint `POST /api/auth/google`, `GET /api/auth/config`). Stary `POST /api/auth/session` usunięty.
  Sesje ze starego logowania Emergent są nieważne, trzeba zalogować się ponownie.
- **Głos:** odsłuch zwraca teraz plik WAV (`/api/tts/audio/<id>.wav`), dyktowanie przez Gemini. Adresy i format odpowiedzi API bez zmian.
- **Bezpieczeństwo:** jak w sekcji 5.
- **Ton Elona** (`backend/elon_prompt.txt` i opisy ról w `server.py`): „asystent AI Ask Elon”, mówi „Ty”, bez motta i „14 lat doświadczenia”,
  przypomina o ACAS, Citizens Advice, związku zawodowym i solicitorze. Merytoryka i przepisy bez zmian.
- `frontend/app.json`: identyfikator `uk.askelon.app`, schemat linków `askelon`.
- Testy łączą się z `http://localhost:8001` zamiast podglądu Emergent; doszły `test_local_security.py` i `test_ai_unit.py`.
- Wcześniej (przygotowanie paczki): usunięte pliki `.env`, raporty i notatki agenta Emergent, blokada poleceń Emergent w `frontend/`.
