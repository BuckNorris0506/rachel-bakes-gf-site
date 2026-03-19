#!/usr/bin/env python3
"""Enrich contractor dataset by extracting emails from contractor websites.

Input:
  data/contractor_emails.csv

Output:
  data/contractor_emails_enriched.csv
"""

from __future__ import annotations

import csv
import os
import re
import time
from typing import Dict, List, Optional, Set
from urllib.parse import urljoin, urlparse

import requests

INPUT_CSV = "data/contractor_emails.csv"
OUTPUT_CSV = "data/contractor_emails_enriched.csv"

# Requested email pattern.
EMAIL_RE = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")

CONTACT_PATHS = [
    "/contact",
    "/contact-us",
    "/contact-us/",
    "/about",
    "/about-us",
    "/services",
]
USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/123.0.0.0 Safari/537.36"
)
MAX_WEBSITES = int((os.getenv("ENRICH_MAX_WEBSITES") or "0").strip() or "0")
REQUEST_TIMEOUT = float((os.getenv("ENRICH_TIMEOUT_SECONDS") or "20").strip() or "20")


def normalize_website(url: str) -> str:
    value = (url or "").strip()
    if not value:
        return ""
    if not value.startswith("http://") and not value.startswith("https://"):
        value = "https://" + value
    return value


def website_base(url: str) -> str:
    parsed = urlparse(url)
    if not parsed.scheme or not parsed.netloc:
        return url
    return f"{parsed.scheme}://{parsed.netloc}/"


def extract_emails(text: str) -> List[str]:
    found: Set[str] = set()
    for email in EMAIL_RE.findall(text or ""):
        cleaned = email.strip().strip(".,;:()[]{}<>\"'").lower()
        if not cleaned:
            continue
        if any(cleaned.endswith(ext) for ext in (".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp")):
            continue
        found.add(cleaned)
    return sorted(found)


def extract_mailto_emails(html: str) -> List[str]:
    found: Set[str] = set()
    for raw in re.findall(r"mailto:([^\s\"'<>?#]+)", html or "", flags=re.IGNORECASE):
        candidate = raw.strip().strip(".,;:()[]{}<>\"'").lower()
        candidate = candidate.split("?")[0].strip()
        if not candidate:
            continue
        if EMAIL_RE.fullmatch(candidate):
            found.add(candidate)
    return sorted(found)


def fetch_text(session: requests.Session, url: str) -> str:
    try:
        resp = session.get(url, timeout=REQUEST_TIMEOUT, allow_redirects=True)
        return resp.text if resp.status_code < 400 else ""
    except requests.RequestException:
        return ""
    finally:
        time.sleep(2)


def find_email_for_website(session: requests.Session, website: str) -> tuple[Optional[str], int, int, int]:
    base = website_base(normalize_website(website))
    if not base:
        return None, 0, 0, 0

    urls_to_check: List[str] = [base]
    urls_to_check.extend(urljoin(base, path) for path in CONTACT_PATHS)
    # Keep a stable unique list while preserving order.
    urls_to_check = list(dict.fromkeys(urls_to_check))

    discovered: Set[str] = set()
    regex_hits = 0
    mailto_hits = 0
    pages_scanned = 0

    for url in urls_to_check:
        html = fetch_text(session, url)
        if not html:
            continue
        pages_scanned += 1

        regex_emails = extract_emails(html)
        mailto_emails = extract_mailto_emails(html)

        regex_hits += len(regex_emails)
        mailto_hits += len(mailto_emails)

        discovered.update(regex_emails)
        discovered.update(mailto_emails)

    if discovered:
        return sorted(discovered)[0], pages_scanned, regex_hits, mailto_hits
    return None, pages_scanned, regex_hits, mailto_hits


def main() -> None:
    with open(INPUT_CSV, "r", newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))

    session = requests.Session()
    session.headers.update({"User-Agent": USER_AGENT})

    websites_scanned = 0
    total_pages_scanned = 0
    regex_discovered = 0
    mailto_discovered = 0
    emails_found = 0
    rows_updated = 0

    for row in rows:
        email = (row.get("email") or "").strip()
        website = normalize_website(row.get("website") or "")
        if email or not website:
            continue
        if MAX_WEBSITES and websites_scanned >= MAX_WEBSITES:
            break

        websites_scanned += 1
        found_email, pages_scanned, regex_hits, mailto_hits = find_email_for_website(session, website)
        total_pages_scanned += pages_scanned
        regex_discovered += regex_hits
        mailto_discovered += mailto_hits
        if not found_email:
            continue

        row["email"] = found_email
        emails_found += 1
        rows_updated += 1

    fields = ["company_name", "email", "website", "city", "source"]
    with open(OUTPUT_CSV, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)

    print(f"Websites scanned: {websites_scanned}")
    print(f"Total pages scanned: {total_pages_scanned}")
    print(f"Emails discovered via regex: {regex_discovered}")
    print(f"Emails discovered via mailto: {mailto_discovered}")
    print(f"Emails found: {emails_found}")
    print(f"Rows updated: {rows_updated}")
    print(f"Output: {OUTPUT_CSV}")


if __name__ == "__main__":
    main()
