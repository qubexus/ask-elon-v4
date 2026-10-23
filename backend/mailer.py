"""Outgoing e-mail (password reset and e-mail verification codes).

MAIL_BACKEND picks the sender:
- smtp (default): real e-mail over SMTP (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, MAIL_FROM).
- outbox: development/tests only – each e-mail is written as a JSON file to MAIL_OUTBOX_DIR.
  Refused when APP_ENV is not development, so codes can never end up on disk in production.
Codes are never written to logs here; the server's own dev-only fallback lives in server.py.
"""
import json
import os
import time
import uuid
from pathlib import Path
import smtplib
import ssl
import logging
from email.message import EmailMessage
from email.utils import formataddr, make_msgid

logger = logging.getLogger(__name__)

SMTP_HOST = os.environ.get("SMTP_HOST", "").strip()
SMTP_PORT = int(os.environ.get("SMTP_PORT") or 587)
SMTP_USER = os.environ.get("SMTP_USER", "").strip()
SMTP_PASSWORD = os.environ.get("SMTP_PASSWORD", "")
MAIL_FROM = os.environ.get("MAIL_FROM", "").strip() or SMTP_USER
MAIL_FROM_NAME = os.environ.get("MAIL_FROM_NAME", "ask Elon").strip()


_APP_ENV = (os.environ.get("APP_ENV") or "development").strip().lower()
_IS_DEV = _APP_ENV in ("development", "dev", "local")
MAIL_BACKEND = (os.environ.get("MAIL_BACKEND") or "smtp").strip().lower()
if MAIL_BACKEND == "outbox" and not _IS_DEV:
    logger.error("MAIL_BACKEND=outbox is only allowed in development – ignored")
    MAIL_BACKEND = "smtp"
OUTBOX_DIR = Path(os.environ.get("MAIL_OUTBOX_DIR") or Path(__file__).parent / "mail_outbox")


def smtp_configured() -> bool:
    return bool(SMTP_HOST and MAIL_FROM)


def configured() -> bool:
    """True when e-mails can actually be delivered (SMTP set up, or the dev outbox)."""
    return MAIL_BACKEND == "outbox" or smtp_configured()


RESET_TEXT = {
    "pl": ("ask Elon – kod do zmiany hasła",
           "Cześć,\n\nTwój kod do ustawienia nowego hasła w ask Elon: {code}\n\n"
           "Kod jest ważny {minutes} minut i działa tylko raz.\n"
           "Jeśli to nie Ty prosiłeś o zmianę hasła, zignoruj tę wiadomość.\n\nask Elon"),
    "en": ("ask Elon – password reset code",
           "Hi,\n\nYour ask Elon password reset code: {code}\n\n"
           "The code is valid for {minutes} minutes and can be used once.\n"
           "If you didn't ask to reset your password, you can ignore this e-mail.\n\nask Elon"),
    "ro": ("ask Elon – cod pentru resetarea parolei",
           "Salut,\n\nCodul tău pentru resetarea parolei ask Elon: {code}\n\n"
           "Codul este valabil {minutes} minute și poate fi folosit o singură dată.\n"
           "Dacă nu ai cerut resetarea parolei, ignoră acest e-mail.\n\nask Elon"),
}


def _write_outbox(to: str, subject: str, body: str, meta: dict):
    OUTBOX_DIR.mkdir(parents=True, exist_ok=True)
    f = OUTBOX_DIR / f"{time.time_ns()}_{uuid.uuid4().hex[:6]}.json"
    tmp = f.with_suffix(".tmp")
    tmp.write_text(json.dumps({"to": to, "subject": subject, "body": body, **meta}, ensure_ascii=False))
    os.chmod(tmp, 0o600)
    tmp.replace(f)  # atomic: readers never see half a file


def send_mail(to: str, subject: str, body: str, meta: dict | None = None):
    if MAIL_BACKEND == "outbox":
        return _write_outbox(to, subject, body, meta or {})
    msg = EmailMessage()
    msg["From"] = formataddr((MAIL_FROM_NAME, MAIL_FROM))
    msg["To"] = to
    msg["Subject"] = subject
    msg["Message-ID"] = make_msgid(domain=MAIL_FROM.split("@")[-1])
    msg.set_content(body)
    ctx = ssl.create_default_context()
    if SMTP_PORT == 465:
        with smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORT, context=ctx, timeout=30) as s:
            if SMTP_USER:
                s.login(SMTP_USER, SMTP_PASSWORD)
            s.send_message(msg)
    else:
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=30) as s:
            s.ehlo()
            if s.has_extn("starttls"):
                s.starttls(context=ctx)
                s.ehlo()
            if SMTP_USER:
                s.login(SMTP_USER, SMTP_PASSWORD)
            s.send_message(msg)


VERIFY_TEXT = {
    "pl": ("ask Elon – potwierdź adres e-mail",
           "Cześć,\n\nTwój kod do potwierdzenia adresu e-mail w ask Elon: {code}\n\n"
           "Wpisz go w aplikacji. Kod jest ważny {minutes} minut i działa tylko raz.\n"
           "Jeśli to nie Ty zakładałeś konto, zignoruj tę wiadomość – bez kodu konto pozostanie nieaktywne.\n\nask Elon"),
    "en": ("ask Elon – confirm your e-mail address",
           "Hi,\n\nYour ask Elon e-mail confirmation code: {code}\n\n"
           "Enter it in the app. The code is valid for {minutes} minutes and can be used once.\n"
           "If you didn't create an account, ignore this e-mail – without the code the account stays inactive.\n\nask Elon"),
    "ro": ("ask Elon – confirmă adresa de e-mail",
           "Salut,\n\nCodul tău de confirmare a adresei de e-mail ask Elon: {code}\n\n"
           "Introdu-l în aplicație. Codul este valabil {minutes} minute și poate fi folosit o singură dată.\n"
           "Dacă nu tu ai creat contul, ignoră acest e-mail – fără cod contul rămâne inactiv.\n\nask Elon"),
}


def send_reset_code(to: str, code: str, locale: str, minutes: int):
    subject, body = RESET_TEXT.get(locale, RESET_TEXT["en"])
    send_mail(to, subject, body.format(code=code, minutes=minutes), {"kind": "reset", "code": code})


def send_verification_code(to: str, code: str, locale: str, minutes: int):
    subject, body = VERIFY_TEXT.get(locale, VERIFY_TEXT["en"])
    send_mail(to, subject, body.format(code=code, minutes=minutes), {"kind": "verify", "code": code})
