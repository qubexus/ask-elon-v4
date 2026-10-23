# RevenueCat dla ask Elon – instrukcja krok po kroku (dla Piotra)

Ten dokument opisuje, co trzeba założyć w RevenueCat, App Store Connect, Google Play Console i (opcjonalnie) Stripe,
żeby subskrypcja **ask Elon PRO (£9.99 / miesiąc)** działała w aplikacji na telefonie i na stronie app.askelon.uk.
Kod aplikacji jest już gotowy – brakuje tylko kluczy i ustawień w panelach sklepów.

> ask Elon to asystent AI. Nie jest związkiem zawodowym i nie udziela porady prawnej – to samo zdanie jest na ekranie subskrypcji.

**Nigdy nie wysyłaj kluczy tajnych mailem ani na czacie.** Klucz tajny (`sk_…`), plik `.p8`, plik JSON konta serwisowego
i sekret webhooka wpisuje się tylko w panelu RevenueCat albo w `backend/.env` na serwerze. Nie trafiają do repozytorium.

---

## 0. Jak to działa w skrócie

```
Telefon (react-native-purchases) / strona www (Web Billing)  ──zakup──►  RevenueCat  ◄──REST API──  nasz serwer (FastAPI)
           app_user_id = user_id z naszej bazy                              │                         │
                                                                            └──webhook──────────────► │  zapisuje users.pro_status w MongoDB
```

* Po zalogowaniu aplikacja wywołuje `Purchases.logIn(user_id)`, więc w RevenueCat klient ma ten sam identyfikator co w naszej bazie.
* Serwer **sam** pyta RevenueCat o status (nie ufa telefonowi) i zapisuje go przy koncie (`pro_status`), z ważnością 10 minut.
* Po zakupie aplikacja woła `POST /api/billing/revenuecat/sync`, a RevenueCat dodatkowo wysyła webhook – PRO włącza się od razu.
* PRO = admin **lub** PayPal / PRO nadane przez admina (`is_member`) **lub** aktywne uprawnienie `pro` w RevenueCat.
* Funkcje PRO: czat bez limitu, pisma, skan i audyt dokumentów, forum, **notatki** (serwer zwraca 402 dla planu darmowego).

---

## 1. Projekt „Ask Elon” w RevenueCat

1. Zaloguj się na https://app.revenuecat.com i utwórz projekt **Ask Elon** (Projects → *Create new project*).
   Przy nowym projekcie RevenueCat sam zakłada **Test Store** z przykładowymi produktami – przyda się do testów (punkt 7).
2. **Uprawnienie (entitlement):** *Product catalog → Entitlements → New* → identyfikator **`pro`**, nazwa „ask Elon PRO”.
   Identyfikator musi brzmieć dokładnie `pro` (tak jest w kodzie: `REVENUECAT_ENTITLEMENT_ID=pro`).
3. **Produkty** (po podłączeniu sklepów, punkty 2–4) – jeden miesięczny produkt w każdym sklepie, cena **£9.99**:
   * App Store: `askelon_pro_monthly` (auto-odnawialna subskrypcja, 1 miesiąc)
   * Google Play: subskrypcja `askelon_pro_monthly` z planem bazowym `monthly` (w RevenueCat widoczna jako `askelon_pro_monthly:monthly`)
   * Web Billing: produkt „ask Elon PRO – monthly”, £9.99, okres 1 miesiąc
   * Test Store: produkt miesięczny £9.99 (do testów)
   Każdy produkt podłącz do uprawnienia `pro` (*Entitlements → pro → Attach*).
4. **Oferta (offering):** *Product catalog → Offerings → New* → identyfikator `default`, ustaw jako **Current**,
   dodaj pakiet **Monthly** (`$rc_monthly`) i podepnij do niego produkty ze wszystkich sklepów.
   Aplikacja pokazuje cenę z tej oferty (cena ze sklepu, w walucie klienta); £9.99 z serwera to tylko zapas, gdy oferty nie ma.

Dokumentacja: [Entitlements](https://www.revenuecat.com/docs/getting-started/entitlements),
[Offerings](https://www.revenuecat.com/docs/offerings/overview), [Test Store](https://www.revenuecat.com/docs/test-and-launch/sandbox/test-store).

---

## 2. Google Play (Android) – co musisz wygenerować

Identyfikator aplikacji: **`uk.askelon.app`** (taki jest w `frontend/app.json`).

1. **Google Cloud Console** (ten sam projekt, co aplikacja):
   * włącz **Google Play Android Developer API** i **Google Play Developer Reporting API**,
   * *IAM & Admin → Service Accounts → Create Service Account* → role **Pub/Sub Editor** i **Monitoring Viewer**,
   * przy koncie: *Manage keys → Add key → Create new key → JSON* → pobierz plik **JSON** (to jest „klucz serwisowy”).
2. **Google Play Console → Users and permissions → Invite user**: wpisz adres `client_email` z pliku JSON,
   dodaj aplikację ask Elon i nadaj uprawnienia:
   * *View app information and download bulk reports (read-only)*
   * *View financial data, orders, and cancellation survey responses*
   * *Manage orders and subscriptions*
   * *Manage store presence*
3. **RevenueCat → Apps & providers → + Google Play**: nazwa pakietu `uk.askelon.app`, wgraj plik JSON
   (*Service Account Credentials JSON*). Nowe dane potrafią działać dopiero po **do 36 godzinach**.
4. **Powiadomienia w czasie rzeczywistym (RTDN):** w ustawieniach aplikacji Google Play w RevenueCat kliknij
   *Connect to Google* przy *Google developer notifications* – RevenueCat sam utworzy temat Pub/Sub; skopiuj nazwę tematu do
   Play Console → *Monetization setup → Real-time developer notifications* i wyślij powiadomienie testowe.
5. W Play Console utwórz subskrypcję `askelon_pro_monthly` (plan bazowy `monthly`, £9.99, odnawiany co miesiąc).
   Aby kupować produkty, aplikacja musi być wgrana przynajmniej na ścieżkę testów wewnętrznych.
6. Skopiuj **publiczny klucz SDK** Google (`goog_…`) z *Project settings → API keys* do `EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY`.

Dokumentacja: [Google Play Service Credentials](https://www.revenuecat.com/docs/service-credentials/creating-play-service-credentials),
[Google Play Product Setup](https://www.revenuecat.com/docs/getting-started/entitlements/android-products),
[Google server notifications](https://www.revenuecat.com/docs/platform-resources/server-notifications/google-server-notifications).

---

## 3. App Store (iOS) – co musisz wygenerować

Bundle ID: **`uk.askelon.app`**.

1. **App Store Connect → Users and Access → Integrations → In-App Purchase** → *Generate In-App Purchase Key* →
   pobierz plik **`.p8`** (można pobrać tylko raz). Zanotuj **Key ID** i **Issuer ID** (u góry tej strony; jeśli go nie ma,
   utwórz dowolny klucz App Store Connect API – wtedy Issuer ID się pojawi).
2. **RevenueCat → Apps & providers → + App Store**: Bundle ID `uk.askelon.app`, w zakładce
   *In-app purchase key configuration* wgraj `.p8`, wpisz Issuer ID → *Save changes*. Bez tego klucza zakupy z SDK
   React Native 8+ (u nas 10.15.1) **nie zostaną zapisane**.
3. **App-Specific Shared Secret** (dla starszych paragonów): App Store Connect → aplikacja → *General → App Information →
   App-Specific Shared Secret → Manage → Generate* → wklej w RevenueCat w ustawieniach aplikacji App Store.
4. Opcjonalnie (zalecane): **App Store Connect API key** (*Users and Access → Integrations → App Store Connect API*,
   rola *App Manager*) – RevenueCat może wtedy importować produkty i ceny. Wgraj `.p8`, Key ID, Issuer ID, Vendor number.
5. **Apple server notifications:** w RevenueCat (ustawienia aplikacji App Store) skopiuj *Apple Server Notification URL* i wklej go
   w App Store Connect → aplikacja → *App Information → App Store Server Notifications* (Production i Sandbox, wersja 2).
6. W App Store Connect utwórz grupę subskrypcji „ask Elon PRO” i produkt `askelon_pro_monthly` (1 miesiąc, £9.99),
   uzupełnij opis i zrzut ekranu do recenzji. Podpisz *Paid Apps Agreement* (Business).
7. Skopiuj **publiczny klucz SDK** Apple (`appl_…`) do `EXPO_PUBLIC_REVENUECAT_IOS_API_KEY`.

Dokumentacja: [In-App Purchase Key](https://www.revenuecat.com/docs/service-credentials/itunesconnect-app-specific-shared-secret/in-app-purchase-key-configuration),
[App-Specific Shared Secret](https://www.revenuecat.com/docs/service-credentials/itunesconnect-app-specific-shared-secret),
[App Store Connect API key](https://www.revenuecat.com/docs/service-credentials/itunesconnect-app-specific-shared-secret/app-store-connect-api-key-configuration),
[iOS Product Setup](https://www.revenuecat.com/docs/getting-started/entitlements/ios-products).

---

## 4. Strona www (app.askelon.uk) – Web Billing (opcjonalnie)

Na stronie można sprzedawać PRO przez **RevenueCat Web Billing**, który obsługuje płatność przez konto **Stripe**.
Bez tego na stronie zostaje PayPal (jak dziś).

1. RevenueCat → *Apps & providers → Web → RevenueCat Billing* → połącz konto **Stripe** (albo utwórz testowe konto „sandbox”).
2. Dodaj produkt miesięczny £9.99, podepnij do uprawnienia `pro` i do oferty `default` (pakiet Monthly).
3. Skopiuj **publiczny klucz Web Billing** (`rcb_…`) do `EXPO_PUBLIC_REVENUECAT_WEB_KEY`
   (do testów jest osobny klucz sandbox `rcb_sb_…`). Po zmianie trzeba przebudować stronę.
4. Decyzja: czy zostawić PayPal obok Web Billing? Teraz: gdy jest klucz Web Billing, strona pokazuje zakup przez RevenueCat;
   gdy go nie ma – przycisk PayPal (jeśli PayPal jest skonfigurowany).

Dokumentacja: [Web SDK](https://www.revenuecat.com/docs/web/web-billing/web-sdk),
[Connect Stripe](https://www.revenuecat.com/docs/web/connect-stripe-account).

---

## 5. Klucze API – gdzie je znaleźć i gdzie wpisać

RevenueCat → projekt **Ask Elon** → *Project settings → API keys*:

| Klucz | Wygląd | Gdzie wpisać | Tajny? |
|---|---|---|---|
| Apple (publiczny SDK) | `appl_…` | `frontend/.env` → `EXPO_PUBLIC_REVENUECAT_IOS_API_KEY` | nie |
| Google (publiczny SDK) | `goog_…` | `frontend/.env` → `EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY` | nie |
| Web Billing (publiczny) | `rcb_…` | `frontend/.env` → `EXPO_PUBLIC_REVENUECAT_WEB_KEY` | nie |
| Test Store (publiczny) | `test_…` | `frontend/.env` → `EXPO_PUBLIC_REVENUECAT_TEST_API_KEY` (tylko tryb deweloperski) | nie |
| **Klucz tajny** | `sk_…` | **`backend/.env` na serwerze** → `REVENUECAT_SECRET_KEY` | **TAK** |
| ID projektu | `proj…` | `backend/.env` → `REVENUECAT_PROJECT_ID` (tylko przy kluczu v2) | nie |

Klucz tajny: *+ New secret API key*.
* **Zalecane: wersja V2**, uprawnienie *Customer information → Customers: Read only*. Wtedy ustaw też `REVENUECAT_PROJECT_ID`.
* Albo wersja V1 – wtedy `REVENUECAT_PROJECT_ID` zostaw puste.

Klucza testowego `test_…` **nigdy** nie używaj w wersji wysyłanej do sklepów – aplikacja w trybie release go nie bierze.

---

## 6. Webhook (serwer dowiaduje się o zakupie / anulowaniu od razu)

> Webhooki są w planie RevenueCat **Pro**. Bez nich wszystko też działa: serwer sprawdza status przy zakupie (sync)
> i co 10 minut przy korzystaniu z aplikacji – tylko anulowanie dociera z opóźnieniem do 10 minut.

1. Wygeneruj długi losowy ciąg (np. `openssl rand -hex 32`) – to będzie sekret nagłówka.
2. RevenueCat → *Integrations → Webhooks → Add new configuration*:
   * URL: **`https://app.askelon.uk/api/billing/revenuecat/webhook`**
   * Authorization header: wklej ten sekret (sam ciąg albo `Bearer <ciąg>` – oba działają)
   * Environment: *Both production and sandbox* (sandbox liczy się jako PRO tylko, gdy `REVENUECAT_ALLOW_SANDBOX=1`)
   * Apps: wszystkie
3. Ten sam sekret wpisz na serwerze w `backend/.env` → `REVENUECAT_WEBHOOK_AUTH=…`.
4. Opcjonalnie włącz *HMAC webhook signing* i sekret podpisu wpisz w `REVENUECAT_WEBHOOK_HMAC_SECRET`.
5. Wyślij *Send test event* – serwer odpowie 200 (zdarzenie testowe nie zmienia żadnego konta).

Dokumentacja: [Webhooks](https://www.revenuecat.com/docs/integrations/webhooks).

---

## 7. Test w trybie sandbox

**A. Najszybciej – Test Store (bez sklepów, bez karty):**
1. W `frontend/.env` wpisz `EXPO_PUBLIC_REVENUECAT_TEST_API_KEY=test_…`, uruchom aplikację w trybie deweloperskim
   (`npx expo start --web --clear`), zaloguj się na **konto testowe**.
2. Profil → *Zobacz PRO* → *Subskrybuj* → w oknie Test Store wybierz *Successful purchase*.
3. Na serwerze (`backend/.env`: klucz tajny + `REVENUECAT_ALLOW_SANDBOX=1`) sprawdź:
   ```bash
   cd backend
   ../venv/bin/python scripts/revenuecat_sandbox_test.py <user_id konta testowego>
   ```
   Skrypt wypisze `active / product_id / store / environment / expires_at` i „PRO aktywne” (klucza nie wypisuje).
4. W aplikacji: ikona notatek bez kłódki, notatki się otwierają; RevenueCat → *Customers* pokazuje klienta z tym `user_id`
   (włącz *View sandbox data*).

**B. Prawdziwe piaskownice sklepów:** Apple – konto *Sandbox Tester* (App Store Connect → Users and Access → Sandbox)
i TestFlight; Google – *License testing* w Play Console i ścieżka testów wewnętrznych. Dokumentacja:
[Sandbox Testing](https://www.revenuecat.com/docs/test-and-launch/sandbox),
[Apple](https://www.revenuecat.com/docs/test-and-launch/sandbox/apple-app-store),
[Google Play](https://www.revenuecat.com/docs/test-and-launch/sandbox/google-play-store).

**C. Webhook z zewnątrz:** `../venv/bin/python scripts/revenuecat_sandbox_test.py --webhook https://app.askelon.uk`
(sprawdza, że zły nagłówek dostaje 401, a poprawny – gdy `REVENUECAT_WEBHOOK_AUTH` jest ustawiony lokalnie – 200).

Na produkcji ustaw `REVENUECAT_ALLOW_SANDBOX=0` (domyślne przy `APP_ENV=production`), żeby testowe zakupy nie dawały PRO
prawdziwym kontom. Do testów na produkcji można tymczasowo dać `1`.

---

## 8. Lista kontrolna – co Piotr ma przekazać / ustawić

- [ ] Projekt **Ask Elon** w RevenueCat, entitlement **`pro`**, oferta `default` z pakietem Monthly
- [ ] Google: plik JSON konta serwisowego wgrany w RevenueCat, uprawnienia w Play Console, RTDN, subskrypcja `askelon_pro_monthly`
- [ ] Apple: klucz In-App Purchase `.p8` + Issuer ID wgrane w RevenueCat, App-Specific Shared Secret, produkt `askelon_pro_monthly`
- [ ] (opcjonalnie) Stripe podłączony do Web Billing + produkt webowy
- [ ] Klucz tajny `sk_…` (v2, Customers: Read) – wpisany **bezpośrednio** w `backend/.env` na serwerze (nie mailem)
- [ ] Publiczne klucze `appl_…`, `goog_…`, `rcb_…`, `test_…`
- [ ] Webhook z nagłówkiem Authorization (plan Pro w RevenueCat)
