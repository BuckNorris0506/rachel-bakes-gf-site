#!/usr/bin/env python3
"""Minimal Zoho SMTP sender for BuckSites outbound.

Pipeline:
approved batch CSV -> first-touch templates -> Zoho SMTP -> outreach_sent_log.csv
"""

from __future__ import annotations

import argparse
import csv
import datetime as dt
import json
import os
import random
import re
import smtplib
import ssl
import sys
import time
from dataclasses import dataclass
from email.message import EmailMessage
from pathlib import Path
from typing import Dict, Iterable, List, Set

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
SAFE_RAMP_THRESHOLD = 25
SEND_DELAY_MIN_SECONDS = 90
SEND_DELAY_MAX_SECONDS = 180
MICRO_OBSERVATIONS = [
    "the trust proof near the top feels lighter than it should for a homeowner making a concrete hire decision",
    "the gallery flow makes it harder than it should be to quickly trust the quality of the work",
    "the estimate path feels weaker than it should for someone ready to request a quote",
    "it looks like missed calls could be turning into lost estimate opportunities",
    "the response path feels slower and less direct than it should for residential concrete leads",
]


@dataclass
class Contact:
    company_name: str
    email: str
    website: str
    city: str
    source: str
    extras: Dict[str, str]


def _norm_key(key: str) -> str:
    return re.sub(r"[^a-z0-9]", "", key.lower())


ALIASES = {
    "company_name": ["company_name", "company", "business_name", "name", "contractor"],
    "email": ["email", "email_address", "contact_email", "mail"],
    "website": ["website", "site", "url", "domain", "web"],
    "city": ["city", "locality", "town"],
    "source": ["source", "platform", "origin", "directory"],
}


class SafeDict(dict):
    def __missing__(self, key: str) -> str:
        return ""


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Send BuckSites residential concrete pilot outreach via Zoho SMTP")
    parser.add_argument("--input", default="data/contractor_emails.csv", help="CSV or JSON contact dataset")
    parser.add_argument("--subject-template", default="templates/outreach_subject.txt")
    parser.add_argument("--body-template", default="templates/outreach_body.txt")
    parser.add_argument(
        "--campaign-type",
        choices=["first_touch", "followup"],
        default="first_touch",
        help="Controls historical dedupe behavior. first_touch blocks any prior sent recipient; followup blocks only recipients already sent the same follow-up subject.",
    )
    parser.add_argument("--log", default="logs/outreach_sent_log.csv")
    parser.add_argument("--daily-limit", type=int, default=20, help="Daily send cap (recommended 20-40)")
    parser.add_argument("--min-delay", type=float, default=5.0, help="Min delay between sends (seconds)")
    parser.add_argument("--max-delay", type=float, default=12.0, help="Max delay between sends (seconds)")
    parser.add_argument("--smtp-host", default="smtp.zoho.com")
    parser.add_argument("--smtp-port", type=int, default=465)
    parser.add_argument("--smtp-user", default=os.getenv("ZOHO_SMTP_USER", ""))
    parser.add_argument("--smtp-pass", default=os.getenv("ZOHO_SMTP_PASS", ""))
    parser.add_argument("--from-email", default=os.getenv("ZOHO_FROM", "jared@bucksites.com"))
    parser.add_argument("--from-name", default="Jared")
    parser.add_argument("--reply-to", default=os.getenv("ZOHO_REPLY_TO", "jared@bucksites.com"))
    parser.add_argument("--send", action="store_true", help="Actually send emails. Default is dry-run")
    return parser.parse_args()


def _choose(row: Dict[str, str], keys: Iterable[str]) -> str:
    norm = {_norm_key(k): (v or "").strip() for k, v in row.items()}
    for key in keys:
        value = norm.get(_norm_key(key), "")
        if value:
            return value
    return ""


def load_contacts(path: Path) -> List[Contact]:
    if not path.exists():
        raise FileNotFoundError(f"Input dataset not found: {path}")

    rows: List[Dict[str, str]] = []
    if path.suffix.lower() == ".csv":
        with path.open("r", newline="", encoding="utf-8") as f:
            rows = list(csv.DictReader(f))
    elif path.suffix.lower() == ".json":
        with path.open("r", encoding="utf-8") as f:
            data = json.load(f)
        if not isinstance(data, list):
            raise ValueError("JSON input must be a list of objects")
        rows = [dict(item) for item in data if isinstance(item, dict)]
    else:
        raise ValueError("Input must be .csv or .json")

    contacts: List[Contact] = []
    seen: Set[str] = set()
    for row in rows:
        company = _choose(row, ALIASES["company_name"])
        email = _choose(row, ALIASES["email"]).lower()
        website = _choose(row, ALIASES["website"])
        city = _choose(row, ALIASES["city"])
        source = _choose(row, ALIASES["source"])

        if not email or not EMAIL_RE.match(email):
            continue
        if email in seen:
            continue
        seen.add(email)

        contacts.append(
            Contact(
                company_name=company or "Contractor",
                email=email,
                website=website,
                city=city,
                source=source,
                extras={k: (v or "").strip() for k, v in row.items()},
            )
        )
    return contacts


def ensure_csv(path: Path, headers: List[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists():
        return
    with path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(headers)


def load_send_history(path: Path) -> tuple[Set[str], Dict[str, Set[str]], int]:
    sent_emails: Set[str] = set()
    sent_subjects: Dict[str, Set[str]] = {}
    sent_today = 0
    if not path.exists():
        return sent_emails, sent_subjects, sent_today

    today = dt.date.today().isoformat()
    with path.open("r", newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            status = (row.get("status") or "").strip().lower()
            email = (row.get("email") or "").strip().lower()
            subject = (row.get("subject") or "").strip()
            ts = (row.get("timestamp") or "")[:10]
            if status == "sent" and email:
                sent_emails.add(email)
                sent_subjects.setdefault(email, set()).add(subject)
                if ts == today:
                    sent_today += 1
    return sent_emails, sent_subjects, sent_today


def append_log(path: Path, row: Dict[str, str]) -> None:
    headers = [
        "timestamp",
        "status",
        "company_name",
        "email",
        "website",
        "city",
        "source",
        "subject",
        "message_id",
        "error",
    ]
    ensure_csv(path, headers)
    with path.open("a", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=headers)
        writer.writerow(row)


def render(template: str, contact: Contact, extra: Dict[str, str] | None = None) -> str:
    payload = {
        "company_name": contact.company_name,
        "email": contact.email,
        "website": contact.website,
        "city": contact.city,
        "source": contact.source,
    }
    payload.update(contact.extras)
    if extra:
        payload.update(extra)
    rendered = template.format_map(
        SafeDict(payload)
    )
    return rendered.strip()


def first_subject_line(template_text: str) -> str:
    for line in template_text.splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        return line
    return ""


def strip_comment_lines(template_text: str) -> str:
    cleaned_lines = []
    for line in template_text.splitlines():
        if line.lstrip().startswith("#"):
            continue
        cleaned_lines.append(line)
    return "\n".join(cleaned_lines).strip()


def send_message(
    smtp_host: str,
    smtp_port: int,
    smtp_user: str,
    smtp_pass: str,
    message: EmailMessage,
) -> None:
    context = ssl.create_default_context()
    with smtplib.SMTP_SSL(smtp_host, smtp_port, context=context, timeout=30) as server:
        server.login(smtp_user, smtp_pass)
        server.send_message(message)


def main() -> int:
    args = parse_args()
    started_at = time.time()

    if args.daily_limit < 1:
        print("--daily-limit must be >= 1", file=sys.stderr)
        return 2
    if args.max_delay < args.min_delay:
        print("--max-delay must be >= --min-delay", file=sys.stderr)
        return 2
    input_path = Path(args.input)
    subject_path = Path(args.subject_template)
    body_path = Path(args.body_template)
    log_path = Path(args.log)

    contacts = load_contacts(input_path)
    subject_text = subject_path.read_text(encoding="utf-8")
    subject_tpl = first_subject_line(subject_text)
    body_tpl = strip_comment_lines(body_path.read_text(encoding="utf-8"))

    if not subject_tpl:
        print("No valid subject line found in subject template.", file=sys.stderr)
        return 2

    sent_before, sent_subject_history, sent_today = load_send_history(log_path)
    remaining = max(args.daily_limit - sent_today, 0)
    queue: List[Contact] = []
    for contact in contacts:
        if args.campaign_type == "first_touch":
            if contact.email in sent_before:
                continue
        else:
            prior_subjects = sent_subject_history.get(contact.email, set())
            if subject_tpl in prior_subjects:
                continue
        queue.append(contact)
    queue = queue[:remaining]

    print(f"Loaded contacts: {len(contacts)}")
    print(f"Already sent historically: {len(sent_before)}")
    print(f"Sent today: {sent_today}")
    print(f"Will process now: {len(queue)}")
    print(f"Send Mode: {'SEND' if args.send else 'DRY RUN'}")
    print(f"Campaign Type: {args.campaign_type}")
    print(f"Daily Limit: {args.daily_limit}")
    print(f"Random Delay Range: {SEND_DELAY_MIN_SECONDS}-{SEND_DELAY_MAX_SECONDS} seconds")
    if args.daily_limit > SAFE_RAMP_THRESHOLD:
        print("WARNING: daily-limit above safe ramp threshold for new domain.")
    if not args.send:
        print("Mode: DRY RUN (no emails will be sent). Use --send to send for real.")
        if queue:
            sample_micro_observation = queue[0].extras.get("personalized_observation") or random.choice(MICRO_OBSERVATIONS)
            sample_extra = {
                "micro_observation": sample_micro_observation,
                "personalized_observation": sample_micro_observation,
            }
            sample_subject = render(subject_tpl, queue[0], sample_extra)
            sample_body = render(body_tpl, queue[0], sample_extra)
            print("\n-- Dry Run Preview (First Email) --")
            print(f"Subject: {sample_subject}")
            print("Body:")
            print(sample_body)
            print("-- End Preview --\n")

    if args.send and (not args.smtp_user or not args.smtp_pass or not args.from_email):
        print("Missing SMTP credentials. Set ZOHO_SMTP_USER, ZOHO_SMTP_PASS, ZOHO_FROM.", file=sys.stderr)
        return 2

    emails_attempted = 0
    emails_sent = 0

    for idx, contact in enumerate(queue, start=1):
        emails_attempted += 1
        micro_observation = contact.extras.get("personalized_observation") or random.choice(MICRO_OBSERVATIONS)
        render_extra = {
            "micro_observation": micro_observation,
            "personalized_observation": micro_observation,
        }
        subject = render(subject_tpl, contact, render_extra).replace("\r", " ").replace("\n", " ").strip()
        body = render(body_tpl, contact, render_extra)

        msg = EmailMessage()
        msg["Subject"] = subject
        msg["From"] = f"{args.from_name} <{args.from_email or args.smtp_user}>"
        msg["To"] = contact.email
        if args.reply_to:
            msg["Reply-To"] = args.reply_to
        msg.set_content(body)
        message_id = msg.get("Message-ID", "")

        status = "dry_run"
        error = ""

        try:
            if args.send:
                send_message(args.smtp_host, args.smtp_port, args.smtp_user, args.smtp_pass, msg)
                status = "sent"
                emails_sent += 1
            print(f"[{idx}/{len(queue)}] {status}: {contact.email} ({contact.company_name})")
        except Exception as exc:  # pragma: no cover
            status = "failed"
            error = str(exc)
            print(f"[{idx}/{len(queue)}] failed: {contact.email} -> {error}", file=sys.stderr)

        append_log(
            log_path,
            {
                "timestamp": dt.datetime.now(dt.timezone.utc).isoformat(),
                "status": status,
                "company_name": contact.company_name,
                "email": contact.email,
                "website": contact.website,
                "city": contact.city,
                "source": contact.source,
                "subject": subject,
                "message_id": message_id,
                "error": error,
            },
        )

        if args.send and status == "sent" and idx < len(queue):
            delay = random.randint(SEND_DELAY_MIN_SECONDS, SEND_DELAY_MAX_SECONDS)
            print(f"Sleeping {delay}s before next send")
            time.sleep(delay)

    runtime_minutes = (time.time() - started_at) / 60
    print(f"Emails Attempted: {emails_attempted}")
    print(f"Emails Sent: {emails_sent}")
    print(f"Total Runtime Minutes: {runtime_minutes:.2f}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
