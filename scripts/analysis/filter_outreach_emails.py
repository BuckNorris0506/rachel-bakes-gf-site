#!/usr/bin/env python3
"""Filter enriched contractor emails into outreach-ready list."""

from __future__ import annotations

import csv

INPUT_CSV = "data/contractor_emails_enriched.csv"
OUTPUT_CSV = "data/outreach_ready.csv"
FIELDS = ["company_name", "email", "website", "city", "source"]
BLOCKED_PREFIXES = ("info@", "support@", "admin@", "contact@", "noreply@")


def is_filtered_email(email: str) -> bool:
    value = (email or "").strip().lower()
    if not value:
        return True
    return any(value.startswith(prefix) for prefix in BLOCKED_PREFIXES)


def main() -> None:
    with open(INPUT_CSV, "r", newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))

    scanned = len(rows)
    removed = 0
    kept = []

    for row in rows:
        email = (row.get("email") or "").strip()
        if is_filtered_email(email):
            removed += 1
            continue
        kept.append(
            {
                "company_name": (row.get("company_name") or "").strip(),
                "email": email,
                "website": (row.get("website") or "").strip(),
                "city": (row.get("city") or "").strip(),
                "source": (row.get("source") or "").strip(),
            }
        )

    with open(OUTPUT_CSV, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=FIELDS)
        writer.writeheader()
        writer.writerows(kept)

    print(f"Total contractors scanned: {scanned}")
    print(f"Emails removed: {removed}")
    print(f"Final outreach list size: {len(kept)}")
    print(f"Output: {OUTPUT_CSV}")


if __name__ == "__main__":
    main()
