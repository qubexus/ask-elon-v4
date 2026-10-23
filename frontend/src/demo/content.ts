// Public demo (/demo): every text and all sample data, in PL / EN / RO.
// Kept out of src/i18n.ts on purpose: the demo works without an account, without the backend and
// without the app locale (it picks its own language), so it has its own small dictionary.
// All people, companies, hours and dates below are fictional sample data.
import type { Locale } from "@/src/i18n";

export const DEMO_LOCALES: Locale[] = ["pl", "en", "ro"];
export const DEMO_STEPS = 5;

/** Fictional demo account ID in the real format [initials][YYMM][seq][Damm check][T|E|R].
 *  Sequence 0000 is never issued (the counter starts at 1), so it can never match a real customer. */
export const DEMO_ACCOUNT_ID = "MN260900009T";
export const DEMO_ACCOUNT_ID_SPACED = "MN 2609 0000 9 T";
export const DEMO_NAME = "Marek Nowak";
export const DEMO_EMPLOYER = "Example Foods Ltd";
export const DEMO_MANAGER = "John Smith";

type Tr = { pl: string; en: string; ro: string };

const D = {
  pageTitle: { pl: "ask Elon – Demo", en: "ask Elon – Demo", ro: "ask Elon – Demo" },
  banner: { pl: "Wersja demo – przykładowe dane", en: "Demo version – sample data", ro: "Versiune demo – date de exemplu" },
  demoTag: { pl: "DEMO", en: "DEMO", ro: "DEMO" },
  skip: { pl: "Pomiń", en: "Skip", ro: "Sari peste" },
  back: { pl: "Wstecz", en: "Back", ro: "Înapoi" },
  next: { pl: "Dalej", en: "Next", ro: "Înainte" },
  close: { pl: "Zamknij demo", en: "Close demo", ro: "Închide demo" },
  stepOf: { pl: "Krok {n} z {total}", en: "Step {n} of {total}", ro: "Pasul {n} din {total}" },
  footer: {
    pl: "ask Elon to informacja, nie porada prawna.",
    en: "ask Elon gives information, not legal advice.",
    ro: "ask Elon oferă informații, nu consultanță juridică.",
  },
  langTitle: { pl: "Wybierz język", en: "Choose your language", ro: "Alege limba" },
  lockGeneric: { pl: "Odblokuj w PRO", en: "Unlock with PRO", ro: "Deblochează cu PRO" },

  // 1. Greeting
  s1Title: { pl: "Poznaj Elona", en: "Meet Elon", ro: "Fă cunoștință cu Elon" },
  s1Text: {
    pl: "Cześć, jestem Elon. Pomagam Polakom i Rumunom w UK ogarnąć sprawy w pracy – zwięźle i po Twojej stronie. Zobacz, jak to działa na przykładzie Marka.",
    en: "Hi, I'm Elon. I help Polish and Romanian workers in the UK sort out problems at work – briefly, and on your side. See how it works with Marek's example.",
    ro: "Salut, sunt Elon. Îi ajut pe polonezii și românii din UK să rezolve problemele de la muncă – pe scurt și de partea ta. Vezi cum funcționează pe exemplul lui Marek.",
  },
  s1Cta: { pl: "Pokaż", en: "Show me", ro: "Arată-mi" },
  s1Note: { pl: "Ok. minuty · bez konta · bez opłat", en: "About a minute · no account · free", ro: "Cam un minut · fără cont · gratuit" },

  // 2. Chat
  s2Title: { pl: "Rozmowa z Elonem", en: "Chat with Elon", ro: "Discuție cu Elon" },
  s2Caption: {
    pl: "Empatia, konkret i następny krok – w jednej odpowiedzi.",
    en: "Empathy, specifics and a next step – in one reply.",
    ro: "Empatie, lucruri concrete și pasul următor – într-un singur răspuns.",
  },
  marek1: {
    pl: "Szef nie zapłacił mi za 12 nadgodzin w zeszłym miesiącu. Co mogę zrobić?",
    en: "My boss didn't pay me for 12 hours of overtime last month. What can I do?",
    ro: "Șeful nu mi-a plătit 12 ore suplimentare luna trecută. Ce pot face?",
  },
  elon1: {
    pl: "Rozumiem, to frustrujące – praca wykonana, pieniędzy brak. Najpierw porównajmy payslip z Twoimi godzinami. Jeśli się nie zgadza, napiszemy spokojne, konkretne pismo do HR. Zaczynamy?",
    en: "I get it, that's frustrating – the work is done and the money isn't there. First, let's compare your payslip with your hours. If they don't match, we'll write a calm, clear letter to HR. Shall we start?",
    ro: "Înțeleg, e frustrant – munca e făcută, banii lipsesc. Mai întâi comparăm fluturașul de salariu cu orele tale. Dacă nu se potrivesc, scriem o scrisoare calmă și concretă către HR. Începem?",
  },
  marek2: {
    pl: "Tak. Na payslipie jest 160 godzin, a według mojego grafiku przepracowałem 172.",
    en: "Yes. My payslip shows 160 hours, but my rota says I worked 172.",
    ro: "Da. Pe fluturaș scrie 160 de ore, dar după programul meu am lucrat 172.",
  },
  elon2: {
    pl: "Brakuje dokładnie 12 godzin – tak jak mówisz. Założyłem dla Ciebie sprawę i przygotowałem pismo do HR. Zobacz.",
    en: "That's exactly 12 hours missing – just as you said. I've opened a case for you and drafted a letter to HR. Take a look.",
    ro: "Lipsesc exact 12 ore – cum ai spus. Ți-am deschis un caz și am pregătit o scrisoare către HR. Uită-te.",
  },
  typing: { pl: "Elon pisze…", en: "Elon is typing…", ro: "Elon scrie…" },
  composerLocked: { pl: "Zadaj własne pytanie – w PRO", en: "Ask your own question – with PRO", ro: "Pune propria întrebare – cu PRO" },
  replay: { pl: "Odtwórz ponownie", en: "Replay", ro: "Redă din nou" },

  // 3. Case
  s3Title: { pl: "Sprawa założona automatycznie", en: "Case opened automatically", ro: "Caz deschis automat" },
  s3Caption: {
    pl: "Elon pilnuje terminów, żebyś Ty nie musiał.",
    en: "Elon keeps track of deadlines, so you don't have to.",
    ro: "Elon ține evidența termenelor, ca să nu trebuiască s-o faci tu.",
  },
  caseTitle: { pl: "Niewypłacone nadgodziny – wrzesień", en: "Unpaid overtime – September", ro: "Ore suplimentare neplătite – septembrie" },
  caseStatus: { pl: "Pismo wysłane", en: "Letter sent", ro: "Scrisoare trimisă" },
  caseSector: { pl: "Magazyn", en: "Warehouse", ro: "Depozit" },
  timeline: { pl: "Oś czasu", en: "Timeline", ro: "Cronologie" },
  tl1: { pl: "Zgłoszenie problemu", en: "Problem reported", ro: "Problemă raportată" },
  tl1d: { pl: "21 paź", en: "21 Oct", ro: "21 oct." },
  tl2: { pl: "Analiza payslipa: brakuje 12 h", en: "Payslip checked: 12 h missing", ro: "Fluturaș verificat: lipsesc 12 ore" },
  tl2d: { pl: "22 paź", en: "22 Oct", ro: "22 oct." },
  tl3: { pl: "Pismo do HR wysłane", en: "Letter sent to HR", ro: "Scrisoare trimisă la HR" },
  tl3d: { pl: "23 paź", en: "23 Oct", ro: "23 oct." },
  tl4: { pl: "Czekamy na odpowiedź HR (14 dni)", en: "Waiting for HR's reply (14 days)", ro: "Așteptăm răspunsul HR (14 zile)" },
  tl4d: { pl: "do 6 lis", en: "by 6 Nov", ro: "până pe 6 nov." },
  reminder: {
    pl: "Przypomnienie: odpowiedź HR do 6 listopada",
    en: "Reminder: HR reply due by 6 November",
    ro: "Memento: răspunsul HR până pe 6 noiembrie",
  },
  reminderSub: {
    pl: "Jeśli HR nie odpowie, Elon podpowie kolejny krok.",
    en: "If HR doesn't reply, Elon will suggest the next step.",
    ro: "Dacă HR nu răspunde, Elon îți sugerează pasul următor.",
  },
  lockCase: { pl: "Zapisz własną sprawę – w PRO", en: "Save your own case – with PRO", ro: "Salvează-ți propriul caz – cu PRO" },

  // 4. Letter
  s4Title: { pl: "Pismo do HR", en: "Letter to HR", ro: "Scrisoare către HR" },
  s4Caption: {
    pl: "Pismo po angielsku, napisane za Ciebie – Ty tylko sprawdzasz i wysyłasz.",
    en: "A letter in English, written for you – you just check it and send it.",
    ro: "Scrisoare în engleză, scrisă pentru tine – tu doar o verifici și o trimiți.",
  },
  original: { pl: "Oryginał · EN", en: "Letter · EN", ro: "Original · EN" },
  translation: { pl: "Tłumaczenie · PL", en: "", ro: "Traducere · RO" },
  copy: { pl: "Kopiuj", en: "Copy", ro: "Copiază" },
  lockCopy: {
    pl: "Kopiowanie i wysyłka pism – w PRO",
    en: "Copying and sending letters – with PRO",
    ro: "Copierea și trimiterea scrisorilor – cu PRO",
  },

  // 5. Notes + card + CTA
  s5Title: { pl: "Notatki i karta PRO", en: "Notes and your PRO card", ro: "Notițe și cardul PRO" },
  s5Caption: {
    pl: "Elon pamięta, co ważne – nie musisz powtarzać.",
    en: "Elon remembers what matters – you don't have to repeat yourself.",
    ro: "Elon reține ce e important – nu trebuie să repeți.",
  },
  notes: { pl: "Notatki", en: "Notes", ro: "Notițe" },
  n1t: { pl: "Kierownik", en: "Manager", ro: "Manager" },
  n1b: { pl: "John Smith", en: "John Smith", ro: "John Smith" },
  n2t: { pl: "Zmiana nocna", en: "Night shift", ro: "Tură de noapte" },
  n2b: { pl: "Od 22:00, 4 noce w tygodniu", en: "From 22:00, 4 nights a week", ro: "De la 22:00, 4 nopți pe săptămână" },
  n3t: { pl: "Umowa", en: "Contract", ro: "Contract" },
  n3b: { pl: "Zero-hours, od marca", en: "Zero-hours, since March", ro: "Zero-hours, din martie" },
  noteAdd: { pl: "Dodaj notatkę", en: "Add a note", ro: "Adaugă o notiță" },
  card: { pl: "Karta członkowska ask Elon", en: "ask Elon membership card", ro: "Card de membru ask Elon" },
  cardId: { pl: "ID konta", en: "Account ID", ro: "ID cont" },
  cardSince: { pl: "Członek od 09.2026", en: "Member since 09/2026", ro: "Membru din 09.2026" },
  cardQr: { pl: "Kod QR z ID konta", en: "QR code with the account ID", ro: "Cod QR cu ID-ul contului" },
  ctaTitle: { pl: "Zacznij z PRO – £9,99 miesięcznie", en: "Start with PRO – £9.99 a month", ro: "Începe cu PRO – £9,99 pe lună" },
  ctaHonest: {
    pl: "Bez niespodzianek: to subskrypcja. Pierwszą opłatę pobieramy przy rejestracji, a kolejne co miesiąc, dopóki jej nie anulujesz.",
    en: "No surprises: it's a subscription. The first payment is taken when you sign up, then monthly until you cancel.",
    ro: "Fără surprize: este un abonament. Prima plată se ia la înregistrare, apoi lunar, până îl anulezi.",
  },
  ctaIncludes: {
    pl: "W PRO: rozmowy z Elonem, prowadzenie spraw, pisma do HR i notatki.",
    en: "PRO includes: chats with Elon, case tracking, letters to HR and notes.",
    ro: "PRO include: discuții cu Elon, urmărirea cazurilor, scrisori către HR și notițe.",
  },
  navCta: { pl: "Zacznij z PRO", en: "Start with PRO", ro: "Începe cu PRO" },
  ctaBtn: { pl: "Zacznij z PRO – £9,99/mies.", en: "Start with PRO – £9.99/month", ro: "Începe cu PRO – £9,99/lună" },

  // Link on the login / register screen
  loginLink: { pl: "Zobacz demo", en: "See demo", ro: "Vezi demo" },
  loginLinkSub: { pl: "bez konta, ok. minuty", en: "no account, about a minute", ro: "fără cont, cam un minut" },
} satisfies Record<string, Tr>;

export type DemoKey = keyof typeof D;

export function dt(locale: Locale, key: DemoKey, vars?: Record<string, string | number>): string {
  let s = (D[key] as Tr)[locale] ?? (D[key] as Tr).en;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, String(v));
  return s;
}

/** HR letter: English original + translations shown next to it. Sample data only, no legal figures. */
export const LETTER_EN = `To: HR Department, ${DEMO_EMPLOYER}
Subject: Unpaid overtime – September

Dear HR Team,

I am writing about my September pay. My payslip shows 160 hours, but my rota shows that I worked 172 hours. This means 12 hours of overtime have not been paid.

Please check this and add the missing 12 hours to my next pay, or explain in writing why they were not included. I have attached my payslip and my rota. My line manager is ${DEMO_MANAGER}.

I would appreciate a reply within 14 days, by 6 November.

Kind regards,
${DEMO_NAME}`;

export const LETTER_TR: Partial<Record<Locale, string>> = {
  pl: `Do: Dział HR, ${DEMO_EMPLOYER}
Temat: Niewypłacone nadgodziny – wrzesień

Szanowni Państwo,

piszę w sprawie mojego wynagrodzenia za wrzesień. Na payslipie jest 160 godzin, a według grafiku przepracowałem 172 godziny. Oznacza to, że 12 nadgodzin nie zostało wypłaconych.

Proszę o sprawdzenie i doliczenie brakujących 12 godzin do najbliższej wypłaty albo o pisemne wyjaśnienie, dlaczego ich nie uwzględniono. W załączniku przesyłam payslip i grafik. Mój bezpośredni przełożony to ${DEMO_MANAGER}.

Będę wdzięczny za odpowiedź w ciągu 14 dni, do 6 listopada.

Z poważaniem
${DEMO_NAME}`,
  ro: `Către: Departamentul HR, ${DEMO_EMPLOYER}
Subiect: Ore suplimentare neplătite – septembrie

Stimată echipă HR,

Vă scriu în legătură cu salariul meu pe septembrie. Pe fluturaș apar 160 de ore, dar conform programului meu am lucrat 172 de ore. Asta înseamnă că 12 ore suplimentare nu au fost plătite.

Vă rog să verificați și să adăugați cele 12 ore lipsă la următorul salariu sau să îmi explicați în scris de ce nu au fost incluse. Atașez fluturașul și programul. Managerul meu direct este ${DEMO_MANAGER}.

Aș aprecia un răspuns în 14 zile, până pe 6 noiembrie.

Cu stimă,
${DEMO_NAME}`,
};

/** Demo language: ?lang= in the URL, else the device / browser languages, else English. */
export function detectDemoLocale(param?: string | string[] | null): Locale {
  const pick = (v: string | undefined | null): Locale | null => {
    const p = (v || "").toLowerCase().slice(0, 2);
    return (DEMO_LOCALES as string[]).includes(p) ? (p as Locale) : null;
  };
  const fromParam = pick(Array.isArray(param) ? param[0] : param);
  if (fromParam) return fromParam;
  const langs: string[] = [];
  if (typeof navigator !== "undefined") {
    if (Array.isArray(navigator.languages)) langs.push(...navigator.languages);
    if (navigator.language) langs.push(navigator.language);
  }
  try {
    langs.push(Intl.DateTimeFormat().resolvedOptions().locale);
  } catch {}
  for (const l of langs) {
    const p = pick(l);
    if (p) return p;
  }
  return "en";
}
