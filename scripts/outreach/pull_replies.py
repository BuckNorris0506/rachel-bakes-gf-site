#!/usr/bin/env python3
"""Log Zoho mailbox replies related to sent outreach emails."""

from __future__ import annotations

import argparse
import csv
import datetime as dt
import email
import imaplib
import os
from email.header import decode_header, make_header
from pathlib import Path
from typing import Dict, Set


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Pull and log outreach replies from Zoho IMAP")
    parser.add_argument("--host", default="imap.zoho.com")
    parser.add_argument("--port", type=int, default=993)
    parser.add_argument("--user", default=os.getenv("ZOHO_SMTP_USER", ""))
    parser.add_argument("--password", default=os.getenv("ZOHO_SMTP_PASS", ""))
    parser.add_argument("--mailbox", default="INBOX")
    parser.add_argument("--sent-log", default="logs/outreach_sent_log.csv")
    parser.add_argument("--reply-log", default="logs/outreach_replies_log.csv")
    parser.add_argument("--all", action="store_true", help="Read all mail, not just unseen")
    return parser.parse_args()


def ensure_csv(path: Path, headers: list[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists():
        return
    with path.open("w", newline="", encoding="utf-8") as f:
        csv.writer(f).writerow(headers)


def load_sent_ids(path: Path) -> Set[str]:
    ids: Set[str] = set()
    if not path.exists():
        return ids
    with path.open("r", newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            msg_id = (row.get("message_id") or "").strip()
            if msg_id:
                ids.add(msg_id)
    return ids


def load_logged_reply_ids(path: Path) -> Set[str]:
    ids: Set[str] = set()
    if not path.exists():
        return ids
    with path.open("r", newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            msg_id = (row.get("message_id") or "").strip()
            if msg_id:
                ids.add(msg_id)
    return ids


def decode_header_value(raw: str) -> str:
    if not raw:
        return ""
    return str(make_header(decode_header(raw)))


def append_reply(path: Path, row: Dict[str, str]) -> None:
    headers = [
        "timestamp",
        "message_id",
        "from",
        "subject",
        "date",
        "in_reply_to",
        "references",
    ]
    ensure_csv(path, headers)
    with path.open("a", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=headers)
        writer.writerow(row)


def main() -> int:
    args = parse_args()
    if not args.user or not args.password:
        print("Missing credentials. Set ZOHO_SMTP_USER and ZOHO_SMTP_PASS.")
        return 2

    sent_log = Path(args.sent_log)
    reply_log = Path(args.reply_log)

    sent_ids = load_sent_ids(sent_log)
    logged_ids = load_logged_reply_ids(reply_log)

    query = "ALL" if args.all else "UNSEEN"

    with imaplib.IMAP4_SSL(args.host, args.port) as client:
        client.login(args.user, args.password)
        client.select(args.mailbox)
        status, data = client.search(None, query)
        if status != "OK":
            print("IMAP search failed")
            return 1

        ids = data[0].split()
        added = 0

        for msg_num in ids:
            status, payload = client.fetch(msg_num, "(BODY.PEEK[])")
            if status != "OK" or not payload or not payload[0]:
                continue

            raw = payload[0][1]
            msg = email.message_from_bytes(raw)

            msg_id = (msg.get("Message-ID") or "").strip()
            in_reply_to = (msg.get("In-Reply-To") or "").strip()
            refs = (msg.get("References") or "").strip()

            if msg_id and msg_id in logged_ids:
                continue

            is_related = False
            if not sent_ids:
                is_related = True
            elif in_reply_to and in_reply_to in sent_ids:
                is_related = True
            elif refs:
                for token in refs.split():
                    if token in sent_ids:
                        is_related = True
                        break

            if not is_related:
                continue

            append_reply(
                reply_log,
                {
                    "timestamp": dt.datetime.now(dt.timezone.utc).isoformat(),
                    "message_id": msg_id,
                    "from": decode_header_value(msg.get("From", "")),
                    "subject": decode_header_value(msg.get("Subject", "")),
                    "date": msg.get("Date", ""),
                    "in_reply_to": in_reply_to,
                    "references": refs,
                },
            )
            if msg_id:
                logged_ids.add(msg_id)
            added += 1

    print(f"Replies logged: {added}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
