"""Outgoing e-mail (password reset codes) over SMTP."""
import os
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
MAIL_FROM_NAME = os.environ.get("MAIL_FROM_NAME", "Ask Elon").strip()


def smtp_configured() -> bool:
    return bool(SMTP_HOST and MAIL_FROM)


RESET_TEXT = {
    "pl": ("Ask Elon – kod do zmiany hasła",
           "Cześć,\n\nTwój kod do ustawienia nowego hasła w Ask Elon: {code}\n\n"
           "Kod jest ważny {minutes} minut i działa tylko raz.\n"
           "Jeśli to nie Ty prosiłeś o zmianę hasła, zignoruj tę wiadomość.\n\nAsk Elon"),
    "en": ("Ask Elon – password reset code",
           "Hi,\n\nYour Ask Elon password reset code: {code}\n\n"
           "The code is valid for {minutes} minutes and can be used once.\n"
           "If you didn't ask to reset your password, you can ignore this e-mail.\n\nAsk Elon"),
    "ro": ("Ask Elon – cod pentru resetarea parolei",
           "Salut,\n\nCodul tău pentru resetarea parolei Ask Elon: {code}\n\n"
           "Codul este valabil {minutes} minute și poate fi folosit o singură dată.\n"
           "Dacă nu ai cerut resetarea parolei, ignoră acest e-mail.\n\nAsk Elon"),
}


def send_mail(to: str, subject: str, body: str):
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


def send_reset_code(to: str, code: str, locale: str, minutes: int):
    subject, body = RESET_TEXT.get(locale, RESET_TEXT["en"])
    send_mail(to, subject, body.format(code=code, minutes=minutes))
