# Ask Elon – uruchomienie aplikacji na własnym komputerze

Cześć Piotr! 👋 To jest kod Twojej aplikacji **Ask Elon** pobrany z Emergent (stan z 23.10.2026).
Ta instrukcja prowadzi krok po kroku, jak uruchomić aplikację u siebie na komputerze,
z **Windows** albo **macOS**. Nie trzeba być programistą: wystarczy kopiować polecenia.

> Ważne: pliki z hasłami (`.env`) **nie są** w tej paczce. Tworzysz je sam z gotowych wzorów
> (`.env.example`). Plików `.env` nigdy nikomu nie wysyłaj i nie wrzucaj na GitHuba.

---

## 1. Co jest w środku

Aplikacja ma dwie części:

| Część | Folder | Technologia | Adres po uruchomieniu |
|---|---|---|---|
| **Serwer (backend)** | `backend/` | Python + FastAPI, baza MongoDB | http://localhost:8001 (API pod `/api`) |
| **Aplikacja (frontend)** | `frontend/` | Expo (React Native) – działa w przeglądarce i na telefonie | http://localhost:8081 |

Co aplikacja robi (według kodu):
- **Czat z Elonem** – asystent AI (model Gemini) o prawach pracownika w UK, po polsku, angielsku i rumuńsku;
  dyktowanie głosem i odsłuchiwanie odpowiedzi; osobne rozmowy dla każdej sprawy.
- **Sprawy** – lista spraw użytkownika (otwarte/rozwiązane), zapis czatu jako sprawy.
- **Pisma** – 12 wzorów pism (np. skarga formalna, zaległe wynagrodzenie, SSP), wypełniane danymi z profilu; lista wysłanych pism.
- **Forum** – wpisy, komentarze i polubienia pracowników.
- **Profil** – dane pracownika, kreator profilu, **dokumenty** (umowy, odcinki wypłat – analiza przez AI),
  sprawdzanie odcinków wypłat (historia zaległości), skan zdjęcia dokumentu.
- **Logowanie** – e-mail + hasło (działa lokalnie), Google (przez Emergent), przycisk Demo.
- **Subskrypcja** – PayPal (strona www) i RevenueCat (sklepy Apple/Google), plan £9.99/mies.; darmowy limit wiadomości.
- **Panel admina** – statystyki, użytkownicy, kody promocyjne, wiadomości do użytkowników, formularz kontaktowy.

---

## 2. Co zainstalować (jednorazowo)

| Program | Wersja | Skąd |
|---|---|---|
| **VS Code** (edytor, zalecany) | najnowszy | https://code.visualstudio.com |
| **Python** | **3.12** (działa też 3.13 i 3.11) | https://www.python.org/downloads/ |
| **Node.js** | **22 LTS** (lub 24 LTS; minimum 20.19.4) | https://nodejs.org |
| **yarn** | 1.22 (instaluje się sam w `setup`) | `npm install -g yarn` |
| **MongoDB** | Community Server 7 lub 8 **albo** darmowe Atlas | patrz niżej |
| Git (opcjonalnie) | najnowszy | https://git-scm.com |
| Expo Go na telefon (opcjonalnie) | najnowszy | App Store / Google Play |

**Windows – Python:** w instalatorze koniecznie zaznacz **„Add python.exe to PATH”**.
**macOS – Python:** pobierz instalator z python.org (albo `brew install python@3.12`).

### Baza danych MongoDB – wybierz jedną opcję

**A) MongoDB na komputerze (najprościej do testów)**
- **Windows:** pobierz „MongoDB Community Server” (MSI) z https://www.mongodb.com/try/download/community
  i zainstaluj z opcją **„Install MongoD as a Service”** – baza będzie się włączać sama.
- **macOS** (z Homebrew, https://brew.sh):
  ```bash
  brew tap mongodb/brew
  brew install mongodb-community
  brew services start mongodb-community
  ```
- W `backend/.env` zostaw: `MONGO_URL=mongodb://localhost:27017`

**B) MongoDB Atlas (darmowa baza w chmurze)**
1. Załóż konto na https://www.mongodb.com/atlas i utwórz darmowy klaster (M0/Free).
2. Dodaj użytkownika bazy (Database Access) i swój adres IP (Network Access).
3. Kliknij **Connect → Drivers** i skopiuj adres `mongodb+srv://...` do `MONGO_URL` w `backend/.env`.

---

## 3. Uruchomienie krok po kroku

### Krok 1 – Rozpakuj paczkę
Rozpakuj `ask-elon-app-lokalnie.zip`, np. do `Dokumenty/ask-elon-app-lokalnie`.
Otwórz ten folder w VS Code (**File → Open Folder**), a potem terminal: **Terminal → New Terminal**.

### Krok 2 – Instalacja (jednorazowo, 5–10 minut)
- **Windows:** kliknij dwa razy `setup.bat` (albo w terminalu wpisz `.\setup.bat`)
- **macOS:** w terminalu wpisz `bash setup.sh`

Skrypt tworzy środowisko Pythona (`backend/.venv`), instaluje biblioteki serwera i aplikacji
oraz tworzy pliki `backend/.env` i `frontend/.env` z wzorów.

<details><summary>Co robi setup – ręcznie, gdyby skrypt nie zadziałał</summary>

**Backend – Windows:**
```bat
cd backend
py -3.12 -m venv .venv
.venv\Scripts\python -m pip install --upgrade pip
.venv\Scripts\python -m pip install -r requirements.txt --extra-index-url https://d33sy5i8bnduwe.cloudfront.net/simple/
copy .env.example .env
```
**Backend – macOS:**
```bash
cd backend
python3.12 -m venv .venv
.venv/bin/python -m pip install --upgrade pip
.venv/bin/python -m pip install -r requirements.txt --extra-index-url https://d33sy5i8bnduwe.cloudfront.net/simple/
cp .env.example .env
```
(`--extra-index-url ...` jest potrzebne, bo biblioteka `emergentintegrations` jest tylko na serwerze Emergent.)

**Frontend (oba systemy):**
```bash
cd frontend
npm install -g yarn
yarn install
```
Potem skopiuj `frontend/.env.example` jako `frontend/.env`.
</details>

### Krok 3 – Uzupełnij `backend/.env`
Otwórz `backend/.env` w VS Code i wpisz:
- `MONGO_URL` – zostaw `mongodb://localhost:27017` albo wklej adres z Atlas,
- `JWT_SECRET` – własny losowy ciąg (polecenie jest w komentarzu w pliku),
- `EMERGENT_LLM_KEY` – klucz AI (patrz sekcja **„Do podmiany”**). Bez niego aplikacja działa, ale czat z Elonem i analiza dokumentów nie.
- PayPal zostaw na `placeholder`, dopóki nie chcesz testować płatności.

`frontend/.env` na start nie wymaga zmian (`EXPO_PUBLIC_BACKEND_URL=http://localhost:8001`).

### Krok 4 – Start
Upewnij się, że MongoDB działa, i uruchom:
- **Windows:** kliknij dwa razy `start.bat` – otworzy się drugie okno z serwerem.
- **macOS:** `bash start.sh`

Gdy w terminalu pojawi się `Waiting on http://localhost:8081`, naciśnij **`w`** albo otwórz
w przeglądarce **http://localhost:8081**.

### Krok 5 – Zaloguj się
Lokalna baza jest pusta. Kliknij zakładkę **„Utwórz konto”**, załóż konto e-mailem i hasłem (min. 8 znaków).
Konto `jocobisun@gmail.com` automatycznie dostaje uprawnienia admina.

**Zatrzymanie:** `Ctrl+C` w terminalu (na Windows zamknij też okno „Ask Elon – backend”).

### Ręczny start (bez skryptów)
Dwa terminale:
```bash
# terminal 1 – serwer
cd backend
.venv\Scripts\python -m uvicorn server:app --host 0.0.0.0 --port 8001 --reload     # Windows
.venv/bin/python -m uvicorn server:app --host 0.0.0.0 --port 8001 --reload         # macOS

# terminal 2 – aplikacja
cd frontend
npx expo start --web
```
Sprawdzenie serwera: http://localhost:8001/api/templates powinno pokazać listę pism, a http://localhost:8001/docs – listę wszystkich funkcji API.

### Na telefonie (opcjonalnie)
1. Telefon i komputer w tej samej sieci Wi-Fi.
2. W `frontend/.env` wpisz adres IP komputera: `EXPO_PUBLIC_BACKEND_URL=http://192.168.x.x:8001`
   (Windows: `ipconfig` → „IPv4 Address”; macOS: Ustawienia → Wi-Fi → Szczegóły → Adres IP).
3. Uruchom ponownie `start` i zeskanuj kod QR aplikacją **Expo Go**.
   Uwaga: płatności RevenueCat i niektóre funkcje natywne mogą w Expo Go działać ograniczenie.

---

## 4. Do podmiany (rzeczy związane z Emergent)

Te elementy działają tylko na serwerach Emergent albo wymagają Twoich własnych kluczy:

1. **`EMERGENT_LLM_KEY`** (`backend/.env`) – jeden klucz Emergent używany do:
   - czatu z Elonem – `backend/server.py:450-451` (model `gemini-3-flash-preview`),
   - analizy dokumentów – `server.py:637-638`, audytu odcinków wypłat – `server.py:684-685`, sprawdzania skanu – `server.py:796-797`,
   - dyktowania głosem (OpenAI `gpt-4o-mini-transcribe`) – `server.py:495`,
   - czytania odpowiedzi na głos (OpenAI `gpt-4o-mini-tts`) – `server.py:540`,
   - przechowywania plików w Emergent Object Storage – `server.py:563-600`.

   Klucz Emergent działa poza Emergent **tylko na płatnym planie** i **zużywa kredyty Emergent**.

   **Jak się uniezależnić (wymaga zmiany kodu – nic nie zostało zmienione):**
   biblioteka `emergentintegrations` wysyła zapytania przez Emergent **tylko wtedy, gdy klucz zaczyna się od `sk-emergent-`**.
   Z innym kluczem łączy się bezpośrednio z dostawcą. Czyli:
   - **Czat i analiza dokumentów:** wystarczy własny klucz **Google Gemini** (https://aistudio.google.com/apikey).
     Najlepiej dodać nową zmienną `GEMINI_API_KEY` i w 4 miejscach `LlmChat(api_key=EMERGENT_LLM_KEY, ...)`
     (linie 450, 637, 684, 796) wpisać `GEMINI_API_KEY`. Wpisanie klucza Gemini wprost do `EMERGENT_LLM_KEY`
     też uruchomi czat, ale zepsuje głos i pliki (punkt niżej).
   - **Głos (dyktowanie i odsłuch):** potrzebny własny klucz **OpenAI** – nowa zmienna np. `OPENAI_API_KEY`
     zamiast `EMERGENT_LLM_KEY` w liniach 495 i 540.
   - **Pliki (dokumenty, odcinki wypłat):** Emergent Object Storage działa tylko z kluczem Emergent.
     Trzeba przepisać funkcje `init_storage`, `put_object`, `get_object` (`server.py:563-600`) na zapis na dysk
     albo do chmury (np. Cloudflare R2 / Amazon S3). Bez tego dodawanie dokumentów nie zadziała.
   - Model `gemini-3-flash-preview` musi być dostępny dla Twojego klucza Google (sprawdź w AI Studio).

2. **Logowanie przez Google (Emergent Auth)** – `frontend/src/auth.tsx:135` (`auth.emergentagent.com`)
   i `backend/server.py:126` (`demobackend.emergentagent.com`). To usługa Emergent; lokalnie może nie działać
   (nie testowane). **Logowanie e-mailem i hasłem działa w pełni lokalnie.** Na własnym serwerze trzeba
   by podłączyć własne Google Sign-In (Google Cloud Console).

3. **`INTEGRATION_PROXY_URL`** (opcjonalna zmienna) – adres serwera integracji Emergent; domyślnie
   `https://integrations.emergentagent.com` (`server.py:563`). Przez niego idą pliki i zapytania AI z kluczem Emergent.

4. **PayPal** – `PAYPAL_CLIENT_ID`, `PAYPAL_SECRET`, `PAYPAL_API_BASE`. Dotychczas były klucze **Sandbox** (testowe).
   Weź własne z https://developer.paypal.com (Apps & Credentials). Do prawdziwych płatności: klucze **Live**
   i `PAYPAL_API_BASE=https://api-m.paypal.com`. Plan subskrypcji tworzy się w PayPal automatycznie.

5. **`JWT_SECRET`** – wygeneruj własny (nie używaj tego z Emergent).

6. **RevenueCat** (`frontend/.env`: `EXPO_PUBLIC_REVENUECAT_TEST_API_KEY`, `..._IOS_API_KEY`, `..._ANDROID_API_KEY`) –
   projekt RevenueCat został założony przez integrację Emergent. Sprawdź, czy masz do niego dostęp na
   https://app.revenuecat.com; jeśli nie – załóż własny projekt i wklej publiczne klucze. Puste = zakupy w sklepie nie działają.

7. **Identyfikator aplikacji** – `frontend/app.json:12` i `:24` (`com.emergent.startproject.i0bl6a`),
   oraz `slug`/`scheme` = `frontend` (linie 4 i 8). Przed publikacją w sklepach zmień na własny, np. `uk.askelon.app`.

8. **Biblioteki Emergent** – `backend/requirements.txt`: `emergentintegrations==0.2.2` (z indeksu Emergent)
   i `litellm` pobierany z `customer-assets.emergentagent.com` (linia 60). Jeśli Emergent je usunie,
   instalacja przestanie działać – wtedy trzeba przejść na zwykłe biblioteki `google-genai` / `openai`.

9. **Bezpieczeństwo przed publikacją:**
   - przycisk **Demo** i stałe hasło konta demo w kodzie – `backend/server.py:42-43` i endpoint `/api/auth/demo` (`server.py:263`).
     Na GitHubie jest już poprawka „Remove insecure Demo login” w gałęzi `conflict_091026_0759` – w tym kodzie jej jeszcze nie ma.
   - admin wpisany na stałe – `server.py:982` (`jocobisun@gmail.com`, dodatkowi przez `ADMIN_EMAILS`).
   - kody resetu hasła trafiają tylko do logu serwera (`server.py:240`) – brak wysyłki e-mail.
   - CORS otwarty dla wszystkich (`server.py:1521`) – na produkcji ogranicz do własnej domeny.

10. **Testy** – `backend/tests/*.py` domyślnie łączą się z serwerem podglądu Emergent
    (`conftest.py:2`, `test_iter6.py:7`, `test_iter8.py:13`, `test_iter9.py:12`). Lokalnie uruchamiaj z
    `EXPO_PUBLIC_BACKEND_URL=http://localhost:8001`. Część testów zakłada konto testowe z Emergent.

---

## 5. Gdy coś nie działa

| Objaw | Co zrobić |
|---|---|
| `KeyError: 'MONGO_URL'` / `'JWT_SECRET'` | Brak pliku `backend/.env` – skopiuj `backend/.env.example` jako `backend/.env`. |
| `ServerSelectionTimeoutError` / serwer wisi na starcie | MongoDB nie działa. Windows: Usługi → „MongoDB Server” → Start. macOS: `brew services start mongodb-community`. |
| W logu `Object storage init failed ... 401` | Normalne bez ważnego klucza Emergent – reszta działa, tylko dokumenty nie. |
| Czat pokazuje błąd „API key not valid” | Brak/nieważny klucz AI w `EMERGENT_LLM_KEY` (patrz „Do podmiany”). |
| Czat odpowiada 403 | Najpierw uzupełnij profil (wymagane pola) – tak działa aplikacja. |
| `ResolutionImpossible` przy `pip install` | Użyj `requirements.txt` z tej paczki (poprawiona linia `litellm`) i Pythona 3.11–3.13. |
| `'py' / 'python' is not recognized` | Zainstaluj Pythona ponownie z „Add python.exe to PATH”, otwórz nowy terminal. |
| `yarn: command not found` / nie rozpoznano | `npm install -g yarn`, zamknij i otwórz terminal. |
| PowerShell: „running scripts is disabled” | Użyj terminala **Command Prompt** w VS Code albo `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`. |
| `Port 8001/8081 is already in use` | Zamknij poprzednie okna serwera albo uruchom ponownie komputer. |
| Biały ekran / dziwne błędy w aplikacji | `cd frontend` i `npx expo start --web -c` (czyści pamięć podręczną). |
| Aplikacja „nie widzi” serwera | Sprawdź `EXPO_PUBLIC_BACKEND_URL` w `frontend/.env` (bez `/api` na końcu) i zrestartuj `start`. |
| Telefon nie łączy się | Ten sam Wi-Fi, adres IP komputera w `.env`, zezwól Pythonowi/Node w zaporze Windows. |
| Zapomniane hasło (lokalnie) | „Nie pamiętasz hasła? Resetuj” – 6-cyfrowy kod pojawi się w oknie serwera (`PASSWORD RESET CODE`). |
| Node: „Unsupported engine” | Zainstaluj Node.js 22 LTS (Node 20 musi być co najmniej 20.19.4). |

---

## 6. Co zmieniono względem kopii z Emergent
- Usunięto pliki `.env` (hasła), raporty testów Emergent (`test_reports/`, `test_result.md`), notatki agenta (`memory/`),
  folder `.emergent/` i `.gitconfig` agenta.
- Usunięto wewnętrzną „blokadę poleceń” Emergent (`frontend/scripts/cmd-guard*`, `install-guard.sh`, `sync-shims.sh`)
  oraz wpis `preinstall` w `frontend/package.json` – nie działała poza Emergent (i na Windows).
- `backend/requirements.txt`: usunięto końcówkę `#sha256=...` z linii `litellm` – bez tego `pip` zgłaszał konflikt.
- Dodano: `README.md`, `backend/.env.example`, `frontend/.env.example`, `setup.sh/.bat`, `start.sh/.bat`,
  `frontend/yarn.lock` (dokładne wersje bibliotek, sprawdzone 23.10.2026).
- **Kod aplikacji nie był zmieniany.**
