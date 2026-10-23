"""One-off: appends 15 new UK workplace letter templates to legal_templates.json (idempotent)."""
import json
from pathlib import Path

P = Path(__file__).parent / "legal_templates.json"


def F(key, en, pl, ro, default, ph=None):
    return {"key": key, "labelEn": en, "labelPl": pl, "labelRo": ro, "placeholder": ph or f"e.g. {default}", "defaultValue": default}


NAME = F("employee_name", "Your Full Name", "Twoje Imię i Nazwisko", "Numele Tău", "Artur Kowalski")
EMP = F("employer_name", "Employer / Agency Name", "Nazwa Pracodawcy / Agencji", "Numele Angajatorului", "Logistics Staffing UK Ltd")
JOB = F("job_title", "Job Title", "Stanowisko", "Funcția", "Warehouse Operative")


def T(id, cat, ref, titles, descs, fields, letter):
    f = [NAME, EMP] + fields
    return {"id": id, "titleEn": titles[0], "titlePl": titles[1], "titleRo": titles[2], "statutoryReference": ref,
            "category": cat, "descriptionEn": descs[0], "descriptionPl": descs[1], "descriptionRo": descs[2],
            "fields": f, "defaults": {x["key"]: f"[{x['labelEn']}]" for x in f}, "letter": letter.strip() + "\n"}


SIGN = "\n\nYours faithfully,\n\n{{employee_name}}\n"

NEW = [
    T("holiday_pay", "Leave & Holiday", "Working Time Regulations 1998, regs 13, 13A, 14 & 16",
      ["Holiday Pay & Annual Leave Entitlement Claim", "Wezwanie: Zaległe Holiday Pay i Urlop", "Cerere Plată Concediu de Odihnă (Holiday Pay)"],
      ["Claim unpaid holiday pay or refused statutory leave (5.6 weeks), including regular overtime in the holiday rate.",
       "Żądanie wypłaty zaległego holiday pay lub udzielenia ustawowego urlopu (5,6 tyg.) – z uwzględnieniem regularnych nadgodzin w stawce.",
       "Cerere pentru plata concediului restant sau acordarea celor 5,6 săptămâni legale."],
      [F("leave_period", "Holiday Year / Period", "Rok / Okres Urlopowy", "Perioada", "1 Jan 2026 – 31 Dec 2026"),
       F("days_owed", "Days Unpaid or Refused", "Dni Niewypłacone / Odmówione", "Zile Datorate", "8 days"),
       F("amount_owed", "Holiday Pay Owed (£)", "Kwota Holiday Pay (£)", "Suma Datorată (£)", "780.00")],
      """
FORMAL CLAIM FOR HOLIDAY PAY AND ANNUAL LEAVE
WORKING TIME REGULATIONS 1998

Date: {{date}}
TO: HR / Payroll, {{employer_name}}
FROM: {{employee_name}}
SUBJECT: UNPAID HOLIDAY PAY – £{{amount_owed}}

Dear Sir or Madam,

I am entitled to 5.6 weeks' paid annual leave per year under regulations 13 and 13A of the Working Time Regulations 1998. For the holiday period {{leave_period}} I have not been paid, or have been refused, {{days_owed}} of leave.

Under regulation 16 holiday must be paid at my normal week's pay. For at least the first 4 weeks this must include regular overtime, commission and shift premiums (Bear Scotland v Fulton; Harpur Trust v Brazel). Rolled-up holiday pay is only lawful where it is itemised on the payslip.

I request that within 7 days you:
1. Pay the outstanding holiday pay of £{{amount_owed}} in the next pay run;
2. Provide a written breakdown of my accrued, taken and remaining leave;
3. Confirm the rate used to calculate my holiday pay.

If this is not resolved, I will contact ACAS for Early Conciliation and may bring a claim to the Employment Tribunal for unlawful deduction from wages (s.23 ERA 1996) and breach of reg. 30 WTR 1998.""" + SIGN),

    T("resignation_notice", "Dismissal & Discipline", "Employment Rights Act 1996, s.86",
      ["Resignation Letter with Notice Period", "Wypowiedzenie Umowy przez Pracownika (Resignation)", "Demisie cu Preaviz"],
      ["Professional resignation giving contractual/statutory notice and requesting final pay, accrued holiday and P45.",
       "Rezygnacja z pracy z zachowaniem okresu wypowiedzenia oraz żądaniem ostatniej wypłaty, ekwiwalentu za urlop i P45.",
       "Demisie cu preaviz și cerere pentru ultimul salariu, concediu neefectuat și P45."],
      [JOB, F("notice_length", "Notice Period", "Okres Wypowiedzenia", "Preaviz", "1 week"),
       F("last_day", "Last Working Day", "Ostatni Dzień Pracy", "Ultima Zi", "14 November 2026")],
      """
LETTER OF RESIGNATION

Date: {{date}}
TO: HR Department, {{employer_name}}
FROM: {{employee_name}}, {{job_title}}
SUBJECT: RESIGNATION – NOTICE OF {{notice_length}}

Dear Sir or Madam,

Please accept this letter as formal notice of my resignation from my position as {{job_title}}. In accordance with my contract and section 86 of the Employment Rights Act 1996, I am giving {{notice_length}} notice. My last working day will be {{last_day}}.

Please ensure that my final pay includes:
1. All wages due up to and including my last working day;
2. Payment in lieu of any accrued but untaken annual leave (reg. 14 Working Time Regulations 1998);
3. Any outstanding overtime, bonuses or expenses.

Please also send me my P45 promptly after my final payment, and confirm in writing the date and amount of my final pay.

Thank you for the opportunity to work with {{employer_name}}.""" + SIGN),

    T("disciplinary_appeal", "Dismissal & Discipline", "ACAS Code of Practice on Disciplinary & Grievance Procedures, paras 26-29; ERA 1996 s.98",
      ["Appeal Against Dismissal or Disciplinary Sanction", "Odwołanie od Zwolnienia Dyscyplinarnego / Kary", "Contestație Împotriva Concedierii Disciplinare"],
      ["Appeal a dismissal or warning: unfair procedure, insufficient evidence or disproportionate sanction.",
       "Odwołanie od zwolnienia lub ostrzeżenia: wadliwa procedura, brak dowodów lub nieproporcjonalna kara.",
       "Contestație: procedură incorectă, lipsă de dovezi sau sancțiune disproporționată."],
      [F("decision_date", "Date of Decision", "Data Decyzji", "Data Deciziei", "3 November 2026"),
       F("sanction", "Sanction Given", "Nałożona Kara", "Sancțiunea", "Summary dismissal for gross misconduct"),
       F("grounds", "Grounds of Appeal", "Podstawy Odwołania", "Motivele Contestației", "No investigation meeting, CCTV not shown to me, no right to be accompanied")],
      """
APPEAL AGAINST DISCIPLINARY DECISION

Date: {{date}}
TO: Appeals Manager / HR, {{employer_name}}
FROM: {{employee_name}}
SUBJECT: APPEAL AGAINST DECISION OF {{decision_date}}

Dear Sir or Madam,

I wish to appeal against the decision made on {{decision_date}} to impose the following sanction: {{sanction}}.

GROUNDS OF APPEAL:
{{grounds}}

The ACAS Code of Practice requires a fair investigation, disclosure of the evidence in advance, a hearing with the right to be accompanied (s.10 Employment Relations Act 1999) and a sanction proportionate to the conduct. I believe these requirements were not met and that the decision falls outside the band of reasonable responses (s.98(4) ERA 1996).

I request:
1. An appeal hearing chaired by a manager not previously involved;
2. Copies of all evidence relied upon, including statements and CCTV, at least 48 hours before the hearing;
3. To be accompanied by my trade union representative.

Please note that an employer's unreasonable failure to follow the ACAS Code may increase any Tribunal award by up to 25% (s.207A TULRCA 1992).""" + SIGN),

    T("bullying_grievance", "Workplace Conduct", "Equality Act 2010 ss.26-27; Protection from Harassment Act 1997; Health and Safety at Work Act 1974",
      ["Grievance: Bullying and Harassment at Work", "Skarga: Mobbing i Nękanie w Pracy", "Plângere: Hărțuire la Locul de Muncă"],
      ["Formal grievance about bullying, harassment or discriminatory treatment by a manager or colleague.",
       "Oficjalna skarga na mobbing, nękanie lub dyskryminację ze strony przełożonego lub współpracownika.",
       "Plângere oficială privind hărțuirea sau tratamentul discriminatoriu."],
      [F("perpetrator", "Person(s) Responsible", "Osoba Odpowiedzialna", "Persoana Responsabilă", "Shift Manager J. Smith"),
       F("incidents", "Incidents (dates & what happened)", "Zdarzenia (daty i opis)", "Incidente", "2 Oct – shouted at me in front of the team; 9 Oct – mocked my accent"),
       F("witnesses", "Witnesses", "Świadkowie", "Martori", "M. Nowak, R. Popescu")],
      """
FORMAL GRIEVANCE – BULLYING AND HARASSMENT

Date: {{date}}
TO: HR Department, {{employer_name}}
FROM: {{employee_name}}
SUBJECT: FORMAL GRIEVANCE REGARDING {{perpetrator}}

Dear Sir or Madam,

I am raising a formal grievance under your grievance procedure and the ACAS Code of Practice regarding bullying and harassment by {{perpetrator}}.

DETAILS OF INCIDENTS:
{{incidents}}

WITNESSES: {{witnesses}}

This conduct has violated my dignity and created an intimidating, hostile and offensive working environment. Where it relates to a protected characteristic (including race or nationality), it constitutes harassment under section 26 of the Equality Act 2010. You also have a duty of care for my health and safety at work.

I request:
1. A grievance meeting without unreasonable delay, with the right to be accompanied;
2. An impartial investigation, including interviews with the witnesses named above;
3. Interim measures to prevent further contact with {{perpetrator}} while the matter is investigated;
4. Assurance that I will not be victimised for raising this complaint (s.27 Equality Act 2010).""" + SIGN),

    T("flexible_working", "Leave & Family", "Employment Rights Act 1996 s.80F; Flexible Working Regulations 2014 (as amended 2024)",
      ["Statutory Flexible Working Request", "Wniosek o Elastyczny Czas Pracy (Flexible Working)", "Cerere de Program Flexibil"],
      ["Day-one right to request a change to hours, times or place of work; employer must respond within 2 months.",
       "Prawo od pierwszego dnia pracy do wniosku o zmianę godzin lub miejsca pracy; pracodawca odpowiada w ciągu 2 miesięcy.",
       "Drept din prima zi de a cere schimbarea programului; răspuns în 2 luni."],
      [F("current_pattern", "Current Working Pattern", "Obecny Grafik", "Programul Actual", "Mon–Fri 06:00–16:30, rotating nights"),
       F("requested_pattern", "Requested Working Pattern", "Wnioskowany Grafik", "Programul Solicitat", "Mon–Thu 08:00–18:00, no nights"),
       F("start_from", "Requested Start Date", "Od Kiedy", "Data de Început", "1 December 2026"),
       F("impact", "How the Business Can Cope", "Jak Firma Sobie Poradzi", "Impact asupra Firmei", "A colleague has offered to swap night shifts with me")],
      """
STATUTORY FLEXIBLE WORKING REQUEST
SECTION 80F EMPLOYMENT RIGHTS ACT 1996

Date: {{date}}
TO: HR Department, {{employer_name}}
FROM: {{employee_name}}
SUBJECT: FLEXIBLE WORKING APPLICATION

Dear Sir or Madam,

I am making a statutory request for flexible working under section 80F of the Employment Rights Act 1996.

CURRENT PATTERN: {{current_pattern}}
REQUESTED PATTERN: {{requested_pattern}}
REQUESTED START DATE: {{start_from}}

HOW ANY IMPACT CAN BE MANAGED:
{{impact}}

Please note that you must deal with this request in a reasonable manner, consult with me before any refusal, and give your decision (including any appeal) within two months. A request may only be refused for one of the eight business reasons listed in s.80G(1)(b) ERA 1996.

I confirm I have made no more than one other statutory request in the last 12 months.""" + SIGN),

    T("maternity_paternity", "Leave & Family", "Maternity & Parental Leave etc. Regulations 1999; Paternity and Adoption Leave Regulations 2002; SSCBA 1992",
      ["Notice of Maternity / Paternity Leave and Statutory Pay", "Zawiadomienie o Urlopie Macierzyńskim / Ojcowskim", "Notificare Concediu de Maternitate / Paternitate"],
      ["Formal notice of maternity or paternity leave with request for SMP/SPP and confirmation of return date.",
       "Formalne zgłoszenie urlopu macierzyńskiego lub ojcowskiego z żądaniem SMP/SPP i potwierdzenia daty powrotu.",
       "Notificare oficială și cerere pentru SMP/SPP."],
      [F("leave_type", "Leave Type", "Rodzaj Urlopu", "Tipul Concediului", "Maternity leave"),
       F("due_date", "Expected Week of Childbirth", "Przewidywany Termin Porodu", "Data Estimată a Nașterii", "week beginning 12 January 2027"),
       F("leave_start", "Leave Start Date", "Początek Urlopu", "Început Concediu", "29 December 2026"),
       F("evidence", "Evidence Enclosed", "Załączony Dowód", "Dovezi Atașate", "MATB1 certificate")],
      """
NOTICE OF {{leave_type}} AND CLAIM FOR STATUTORY PAY

Date: {{date}}
TO: HR / Payroll, {{employer_name}}
FROM: {{employee_name}}
SUBJECT: NOTICE OF {{leave_type}}

Dear Sir or Madam,

I hereby give notice that I intend to take {{leave_type}}. The expected week of childbirth is {{due_date}} and I wish my leave to start on {{leave_start}}. Enclosed: {{evidence}}.

Please confirm in writing within 28 days:
1. My leave start date and the date my leave will end if I take my full entitlement;
2. My entitlement to Statutory Maternity Pay or Statutory Paternity Pay, or provide form SMP1 / SPP1 with reasons if you consider I am not eligible;
3. That my contractual terms (other than pay) and holiday accrual continue during my leave.

I remind you that I am protected from detriment and dismissal related to pregnancy, maternity or paternity leave (s.47C and s.99 ERA 1996; s.18 Equality Act 2010).""" + SIGN),

    T("redundancy_challenge", "Redundancy", "Employment Rights Act 1996 ss.135-165; TULRCA 1992 s.188",
      ["Challenge to Redundancy Selection and Pay", "Odwołanie od Zwolnienia Grupowego / Redundancy", "Contestație Concediere pentru Reducere de Personal"],
      ["Challenge unfair redundancy selection, lack of consultation or miscalculated statutory redundancy pay.",
       "Kwestionowanie niesprawiedliwej selekcji, braku konsultacji lub błędnie wyliczonej odprawy redundancy.",
       "Contestarea selecției, lipsei consultării sau calculului indemnizației."],
      [F("notice_date", "Date You Were Told", "Data Powiadomienia", "Data Notificării", "20 October 2026"),
       F("years_service", "Full Years of Service", "Pełne Lata Pracy", "Ani de Vechime", "4"),
       F("concerns", "Your Concerns", "Twoje Zastrzeżenia", "Obiecțiile Tale", "Selection criteria not shared; agency staff kept on; no alternative roles offered")],
      """
CHALLENGE TO PROPOSED REDUNDANCY

Date: {{date}}
TO: HR Department, {{employer_name}}
FROM: {{employee_name}}
SUBJECT: REDUNDANCY – REQUEST FOR INFORMATION AND APPEAL

Dear Sir or Madam,

On {{notice_date}} I was informed that my role is at risk of / selected for redundancy. I have {{years_service}} full years of continuous service.

MY CONCERNS:
{{concerns}}

A fair redundancy requires genuine redundancy, meaningful individual (and where 20+ employees are affected, collective — s.188 TULRCA 1992) consultation, fair and objective selection criteria, and consideration of suitable alternative employment.

I request within 7 days:
1. The selection criteria, my individual scores and the scoring evidence;
2. A list of current vacancies and alternative roles;
3. A written calculation of my statutory redundancy pay (s.162 ERA 1996), notice pay and accrued holiday;
4. The right to appeal, accompanied by my trade union representative.""" + SIGN),

    T("p45_p60_request", "Wages & Hours", "Income Tax (PAYE) Regulations 2003, regs 36 & 67",
      ["Request for P45 / P60 / Payslips", "Wezwanie do Wydania P45 / P60 / Payslipów", "Cerere Eliberare P45 / P60"],
      ["Demand the P45 after leaving, the annual P60 by 31 May, or missing itemised payslips.",
       "Żądanie wydania P45 po odejściu z pracy, P60 do 31 maja lub brakujących payslipów.",
       "Cerere pentru P45, P60 sau fluturași lipsă."],
      [F("document_needed", "Document(s) Needed", "Wymagane Dokumenty", "Documente Necesare", "P45 and P60 for tax year 2025/26"),
       F("ni_number", "National Insurance Number", "Numer National Insurance", "Număr NI", "QQ 12 34 56 C"),
       F("end_date", "Employment End Date (if left)", "Data Zakończenia Pracy", "Data Încetării", "30 September 2026")],
      """
REQUEST FOR STATUTORY TAX DOCUMENTS

Date: {{date}}
TO: Payroll Department, {{employer_name}}
FROM: {{employee_name}} (NI No. {{ni_number}})
SUBJECT: REQUEST FOR {{document_needed}}

Dear Payroll Manager,

I request that you provide me with: {{document_needed}}.

My employment ended / relevant date: {{end_date}}.

Under the Income Tax (PAYE) Regulations 2003 you must issue a P45 on the day employment ends or without unreasonable delay thereafter (reg. 36), and a P60 to every employee employed on 5 April by 31 May (reg. 67). I am also entitled to an itemised pay statement for every payment of wages (s.8 Employment Rights Act 1996).

Please send the documents to me by email or post within 7 days. If they are not provided, I will report the matter to HMRC and, regarding missing payslips, may seek a declaration from the Employment Tribunal (s.11-12 ERA 1996).""" + SIGN),

    T("night_work", "Wages & Hours", "Working Time Regulations 1998, regs 6, 7, 10, 11 & 12",
      ["Night Work Limits and Free Health Assessment", "Praca Nocna: Limity i Bezpłatne Badanie Lekarskie", "Muncă de Noapte: Limite și Evaluare Medicală"],
      ["Assert the 8-hour average night work limit, rest breaks and the right to a free health assessment.",
       "Egzekwowanie limitu średnio 8 godzin pracy nocnej, przerw i prawa do bezpłatnego badania zdrowia.",
       "Limita de 8 ore de noapte, pauze și evaluare medicală gratuită."],
      [F("night_hours", "Your Night Shift Pattern", "Twój Grafik Nocny", "Programul de Noapte", "4 x 12-hour nights (19:00–07:00) per week"),
       F("issues", "Problems Experienced", "Problemy", "Probleme", "No 20-minute break, less than 11 hours rest between shifts, no health assessment offered")],
      """
NIGHT WORK – WORKING TIME REGULATIONS 1998

Date: {{date}}
TO: HR / Site Management, {{employer_name}}
FROM: {{employee_name}}
SUBJECT: NIGHT WORK LIMITS, REST BREAKS AND HEALTH ASSESSMENT

Dear Sir or Madam,

I work as a night worker on the following pattern: {{night_hours}}.

ISSUES:
{{issues}}

Under the Working Time Regulations 1998:
1. A night worker's normal hours must not exceed an average of 8 hours in each 24 hours (reg. 6);
2. I am entitled to a free health assessment before starting night work and at regular intervals (reg. 7);
3. I am entitled to 11 consecutive hours' rest in each 24-hour period (reg. 10) and a 20-minute break when working more than 6 hours (reg. 12).

I request within 7 days a written confirmation that my rota will comply with these limits, the arrangement of a free health assessment, and the reference period used for averaging. Failure to provide rest may be enforced through the Employment Tribunal (reg. 30) and the HSE / local authority.""" + SIGN),

    T("whistleblowing", "Workplace Conduct", "Public Interest Disclosure Act 1998; Employment Rights Act 1996 ss.43A-43L, 47B & 103A",
      ["Protected Disclosure (Whistleblowing) Report", "Zgłoszenie Sygnalisty (Whistleblowing)", "Raportare Avertizor de Integritate"],
      ["Report wrongdoing (safety risks, illegal practices, fraud) as a protected disclosure to secure legal protection.",
       "Zgłoszenie nieprawidłowości (zagrożenia BHP, nielegalne praktyki, oszustwa) jako ujawnienie chronione prawem.",
       "Raportarea neregulilor ca dezvăluire protejată."],
      [F("concern", "What You Are Reporting", "Co Zgłaszasz", "Ce Raportezi", "Fire exits blocked with pallets in Zone B; forklift checks falsified"),
       F("when_where", "When and Where", "Kiedy i Gdzie", "Când și Unde", "Daily since 1 October 2026, Zone B loading bay"),
       F("evidence", "Evidence Available", "Dostępne Dowody", "Dovezi", "Photos dated 3 and 10 October 2026")],
      """
PROTECTED DISCLOSURE – PUBLIC INTEREST DISCLOSURE ACT 1998

Date: {{date}}
TO: Whistleblowing Officer / Senior Management, {{employer_name}}
FROM: {{employee_name}}
SUBJECT: PROTECTED DISCLOSURE – CONFIDENTIAL

Dear Sir or Madam,

I am making a protected disclosure under Part IVA of the Employment Rights Act 1996. I reasonably believe the information below tends to show that the health and safety of individuals is being endangered and/or a legal obligation is not being complied with, and that this disclosure is in the public interest.

CONCERN:
{{concern}}

WHEN AND WHERE: {{when_where}}
EVIDENCE: {{evidence}}

Please confirm receipt, keep my identity confidential, and inform me of the steps taken to investigate and remedy the matter.

I remind you that I have the right not to be subjected to any detriment (s.47B ERA 1996) and that dismissal for making a protected disclosure is automatically unfair, with no qualifying service and uncapped compensation (s.103A ERA 1996). If the matter is not addressed I may report it to a prescribed person such as the Health and Safety Executive.""" + SIGN),

    T("acas_early_conciliation", "Union & Disciplinary", "Employment Tribunals Act 1996 s.18A; ACAS Early Conciliation",
      ["Letter Before Claim – ACAS Early Conciliation", "Ostateczne Wezwanie przed ACAS / Tribunal", "Notificare Înainte de ACAS / Tribunal"],
      ["Final letter before action informing the employer you are starting ACAS Early Conciliation (mandatory before a Tribunal claim).",
       "Ostateczne wezwanie informujące pracodawcę o rozpoczęciu ACAS Early Conciliation (obowiązkowe przed pozwem do Tribunal).",
       "Ultima notificare înainte de conciliere ACAS (obligatorie înainte de Tribunal)."],
      [F("issue", "Issue in Dispute", "Przedmiot Sporu", "Problema", "Unpaid wages and holiday pay"),
       F("previous_letter", "Previous Letter Sent", "Wcześniejsze Pismo", "Scrisoare Anterioară", "Formal demand of 1 November 2026 (no reply)"),
       F("amount_claimed", "Amount Claimed (£)", "Dochodzona Kwota (£)", "Suma Cerută (£)", "1,004.22")],
      """
LETTER BEFORE CLAIM – NOTICE OF ACAS EARLY CONCILIATION

Date: {{date}}
TO: Managing Director / HR, {{employer_name}}
FROM: {{employee_name}}
SUBJECT: {{issue}} – FINAL NOTICE BEFORE TRIBUNAL PROCEEDINGS

Dear Sir or Madam,

I refer to {{previous_letter}}. Despite that letter, the matter of {{issue}} remains unresolved and the sum of £{{amount_claimed}} is still outstanding.

Please treat this as my final letter before action. Unless this matter is resolved in full within 7 days of the date of this letter, I will notify ACAS to begin Early Conciliation under section 18A of the Employment Tribunals Act 1996 without further notice. If conciliation fails, I will present a claim to the Employment Tribunal.

ACAS will contact you to discuss settlement. I would prefer to resolve this directly and invite you to make payment or propose a meeting within the next 7 days.

I reserve the right to refer to this letter on the question of costs and on any uplift of up to 25% for unreasonable failure to comply with the ACAS Code of Practice.""" + SIGN),

    T("unlawful_deductions", "Wages & Hours", "Employment Rights Act 1996 ss.13-27",
      ["Challenge to Unlawful Deductions from Wages", "Sprzeciw: Nielegalne Potrącenia z Wypłaty", "Contestare Rețineri Ilegale din Salariu"],
      ["Challenge deductions for uniforms, PPE, transport, accommodation, breakages or 'admin fees' not agreed in writing.",
       "Sprzeciw wobec potrąceń za odzież, PPE, transport, zakwaterowanie, szkody lub 'opłaty administracyjne' bez pisemnej zgody.",
       "Contestare rețineri pentru uniformă, transport, cazare sau taxe neaprobate."],
      [F("deduction", "Deduction Description", "Opis Potrącenia", "Descrierea Reținerii", "£35/week 'transport fee' and £20 hi-vis charge"),
       F("pay_dates", "Affected Pay Dates", "Daty Wypłat", "Datele Plăților", "2, 9, 16 and 23 October 2026"),
       F("amount_owed", "Total Deducted (£)", "Łącznie Potrącono (£)", "Total Reținut (£)", "160.00")],
      """
UNLAWFUL DEDUCTION FROM WAGES – PART II EMPLOYMENT RIGHTS ACT 1996

Date: {{date}}
TO: Payroll Department, {{employer_name}}
FROM: {{employee_name}}
SUBJECT: REFUND OF UNAUTHORISED DEDUCTIONS – £{{amount_owed}}

Dear Payroll Manager,

The following deductions were made from my wages: {{deduction}}, on the pay dates {{pay_dates}}, totalling £{{amount_owed}}.

Under section 13 of the Employment Rights Act 1996 you may not make a deduction from my wages unless it is required by statute, authorised by a relevant provision of my contract notified to me in writing beforehand, or I have given prior written consent. I have not given such consent. In addition, deductions for items connected with my job must not reduce my pay below the National Minimum Wage, and charges for PPE required by law are prohibited (s.9 HSWA 1974).

I request repayment of £{{amount_owed}} in the next pay run and confirmation that these deductions will stop. Otherwise I will commence ACAS Early Conciliation and bring a claim under section 23 ERA 1996 (time limit: 3 months less one day from the last deduction).""" + SIGN),

    T("written_statement_request", "Employment Contracts", "Employment Rights Act 1996 ss.1-12 (as amended 2020)",
      ["Request for Written Statement of Employment Particulars", "Żądanie Pisemnych Warunków Zatrudnienia", "Cerere Declarație Scrisă a Condițiilor de Muncă"],
      ["Day-one right to a written statement of terms (pay, hours, holiday, notice); for workers without a proper contract.",
       "Prawo od pierwszego dnia do pisemnych warunków zatrudnienia (stawka, godziny, urlop, wypowiedzenie) – gdy brak umowy.",
       "Drept din prima zi la condițiile de muncă în scris."],
      [JOB, F("start_date", "Start Date", "Data Rozpoczęcia", "Data Începerii", "12 January 2026")],
      """
REQUEST FOR WRITTEN STATEMENT OF EMPLOYMENT PARTICULARS

Date: {{date}}
TO: HR Department, {{employer_name}}
FROM: {{employee_name}}, {{job_title}}
SUBJECT: WRITTEN STATEMENT UNDER SECTION 1 ERA 1996

Dear Sir or Madam,

I started working for {{employer_name}} on {{start_date}} as {{job_title}}. I have not received a written statement of my main terms and conditions.

Since 6 April 2020, all employees and workers are entitled to a written statement on or before their first day of work (s.1 Employment Rights Act 1996). It must include, among other things: the employer's name, start date, rate of pay and pay intervals, normal hours and days of work, holiday entitlement and pay, sick pay, notice periods, job title, place of work, probation, and training requirements.

Please provide the written statement within 7 days. If it is not provided, the Employment Tribunal may award 2 to 4 weeks' pay when I bring any other claim (s.38 Employment Act 2002) and may determine the particulars itself (s.11 ERA 1996).""" + SIGN),

    T("return_to_work_adjustments", "Sick Pay & Health", "Equality Act 2010 ss.6, 20-21; Health and Safety at Work Act 1974",
      ["Request for Reasonable Adjustments / Return to Work", "Wniosek o Rozsądne Dostosowania po Chorobie", "Cerere Adaptări Rezonabile la Revenire"],
      ["Ask for reasonable adjustments (lighter duties, phased return, equipment) after illness, injury or for a disability.",
       "Wniosek o dostosowania (lżejsze obowiązki, stopniowy powrót, sprzęt) po chorobie, urazie lub z powodu niepełnosprawności.",
       "Cerere pentru sarcini ușoare sau revenire treptată după boală."],
      [F("condition", "Condition / Injury", "Schorzenie / Uraz", "Afecțiune", "Lower back injury (herniated disc)"),
       F("adjustments", "Adjustments Requested", "Wnioskowane Dostosowania", "Adaptări Solicitate", "No lifting over 10 kg for 8 weeks; phased return 4h/day for 2 weeks"),
       F("fit_note", "Fit Note / Medical Advice", "Fit Note / Zalecenia", "Recomandare Medicală", "GP fit note 'may be fit for work' dated 20 October 2026")],
      """
REQUEST FOR REASONABLE ADJUSTMENTS AND PHASED RETURN

Date: {{date}}
TO: HR / Line Manager, {{employer_name}}
FROM: {{employee_name}}
SUBJECT: RETURN TO WORK – ADJUSTMENTS REQUEST

Dear Sir or Madam,

I am returning to work following: {{condition}}. Medical advice: {{fit_note}}.

I request the following adjustments: {{adjustments}}.

Where my condition has a substantial and long-term adverse effect on my day-to-day activities, it is a disability under section 6 of the Equality Act 2010, and you are under a duty to make reasonable adjustments (ss.20-21). Regardless, you must assess the risks to my health under the Management of Health and Safety at Work Regulations 1999 and follow the recommendations in my fit note where reasonably practicable.

Please arrange a return-to-work meeting, consider an Occupational Health referral, and confirm the agreed adjustments in writing before my return.""" + SIGN),

    T("agency_fees_notice", "Agency Workers", "Conduct of Employment Agencies and Employment Businesses Regulations 2003, regs 13-15; Employment Agencies Act 1973 s.6",
      ["Demand Refund of Unlawful Agency Fees", "Zwrot Nielegalnych Opłat Pobranych przez Agencję", "Restituirea Taxelor Ilegale ale Agenției"],
      ["Agencies cannot charge for finding you work (registration, CV, training 'deposits'). Demand a refund.",
       "Agencje nie mogą pobierać opłat za znalezienie pracy (rejestracja, CV, 'depozyty' szkoleniowe). Żądanie zwrotu.",
       "Agențiile nu pot taxa găsirea unui loc de muncă. Cerere de restituire."],
      [F("fee_details", "Fees Charged", "Pobrane Opłaty", "Taxe Percepute", "£150 'registration fee' and £60 induction charge"),
       F("amount_owed", "Total to Refund (£)", "Kwota do Zwrotu (£)", "Suma de Returnat (£)", "210.00")],
      """
DEMAND FOR REFUND OF PROHIBITED AGENCY FEES

Date: {{date}}
TO: Branch Manager / Compliance, {{employer_name}}
FROM: {{employee_name}}
SUBJECT: REFUND OF £{{amount_owed}} – PROHIBITED FEES

Dear Sir or Madam,

I was charged the following by your agency: {{fee_details}}, totalling £{{amount_owed}}.

Under section 6 of the Employment Agencies Act 1973 and regulation 13 of the Conduct of Employment Agencies and Employment Businesses Regulations 2003, an agency or employment business must not charge a work-seeker any fee for finding or seeking to find them work. You may also not make the use of other paid services (such as training, transport or accommodation) a condition of finding me work (reg. 5).

Please refund £{{amount_owed}} within 7 days. If not, I will report the matter to the Employment Agency Standards Inspectorate (EAS) and the Gangmasters and Labour Abuse Authority (GLAA), and seek recovery through ACAS and the courts.""" + SIGN),
]

if __name__ == "__main__":
    data = json.loads(P.read_text())
    have = {t["id"] for t in data}
    added = [t for t in NEW if t["id"] not in have]
    data.extend(added)
    P.write_text(json.dumps(data, ensure_ascii=False, indent=2))
    print(f"added {len(added)}, total {len(data)}")
