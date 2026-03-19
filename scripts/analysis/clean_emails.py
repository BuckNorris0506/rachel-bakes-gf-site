#!/usr/bin/env python3
"""Clean contractor email dataset for outreach."""

from __future__ import annotations

import csv
import re
from urllib.parse import urlparse

INPUT_CSV = "data/contractor_emails.csv"
OUTPUT_CSV = "data/contractor_clean.csv"

EMAIL_RE = re.compile(r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]+$")
DISPOSABLE_DOMAINS = {"gmail.com", "yahoo.com", "hotmail.com", "outlook.com"}
FIELDS = ["company_name", "email", "website", "city", "source"]


def normalize_domain(website: str) -> str:
    website = (website or "").strip()
    if not website:
        return ""
    if not website.startswith("http://") and not website.startswith("https://"):
        website = "https://" + website
    host = urlparse(website).netloc.lower().strip()
    if host.startswith("www."):
        host = host[4:]
    return host


def main() -> None:
    with open(INPUT_CSV, "r", newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))

    original_rows = len(rows)

    seen_emails: set[str] = set()
    seen_domains: set[str] = set()

    duplicates_removed = 0
    invalid_removed = 0

    cleaned: list[dict[str, str]] = []

    for row in rows:
        email = (row.get("email") or "").strip().lower()
        website = (row.get("website") or "").strip()
        domain = normalize_domain(website)

        if not email or not EMAIL_RE.match(email):
            invalid_removed += 1
            continue

        email_domain = email.split("@")[-1]
        if email_domain in DISPOSABLE_DOMAINS:
            invalid_removed += 1
            continue

        if email in seen_emails:
            duplicates_removed += 1
            continue

        if domain and domain in seen_domains:
            duplicates_removed += 1
            continue

        seen_emails.add(email)
        if domain:
            seen_domains.add(domain)

        cleaned.append(
            {
                "company_name": (row.get("company_name") or "").strip(),
                "email": email,
                "website": website,
                "city": (row.get("city") or "").strip(),
                "source": (row.get("source") or "").strip(),
            }
        )

    with open(OUTPUT_CSV, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=FIELDS)
        writer.writeheader()
        writer.writerows(cleaned)

    print(f"Original rows: {original_rows}")
    print(f"Duplicates removed: {duplicates_removed}")
    print(f"Invalid emails removed: {invalid_removed}")
    print(f"Clean emails remaining: {len(cleaned)}")


if __name__ == "__main__":
    main()
