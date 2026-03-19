#!/usr/bin/env python3
"""Scan contractor websites and score rebuild likelihood."""

from __future__ import annotations

import csv
import time
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup

INPUT_CSV = "data/contractor_emails.csv"
SCORED_CSV = "data/contractor_scored.csv"
TARGETS_CSV = "data/outreach_targets.csv"

TIMEOUT = 12
USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/123.0.0.0 Safari/537.36"
)


def normalize_website(url: str) -> str:
    url = (url or "").strip()
    if not url:
        return ""
    if not url.startswith("http://") and not url.startswith("https://"):
        url = "https://" + url
    return url


def bool_str(value: bool) -> str:
    return "true" if value else "false"


def classify(score: int) -> str:
    if score >= 80:
        return "excellent"
    if score >= 60:
        return "average"
    if score >= 40:
        return "bad"
    return "terrible"


def get_internal_links_count(soup: BeautifulSoup, base_url: str) -> int:
    base_host = urlparse(base_url).netloc.lower().replace("www.", "")
    links = set()

    for a in soup.select("a[href]"):
        href = (a.get("href") or "").strip()
        if not href or href.startswith("#") or href.startswith("mailto:") or href.startswith("tel:"):
            continue
        absolute = urljoin(base_url, href)
        parsed = urlparse(absolute)
        host = parsed.netloc.lower().replace("www.", "")
        if parsed.scheme in {"http", "https"} and host == base_host:
            links.add(parsed.path or "/")

    return len(links)


def has_contact_page(soup: BeautifulSoup, base_url: str, session: requests.Session) -> bool:
    # Check visible links first.
    for a in soup.select("a[href]"):
        href = (a.get("href") or "").lower()
        text = a.get_text(" ").strip().lower()
        if "contact" in href or "contact" in text:
            return True

    # Probe common contact URLs.
    probes = ["/contact", "/contact-us", "/contactus"]
    for path in probes:
        try:
            resp = session.get(urljoin(base_url, path), timeout=TIMEOUT, allow_redirects=True)
            if resp.status_code < 400 and "contact" in resp.text.lower():
                return True
        except requests.RequestException:
            continue

    return False


def scan_website(url: str, session: requests.Session) -> dict:
    start = time.perf_counter()
    load_time = 999.0
    has_ssl = False
    has_viewport = False
    contact_page = False
    internal_links = 0

    try:
        response = session.get(url, timeout=TIMEOUT, allow_redirects=True)
        load_time = time.perf_counter() - start
        final_url = response.url or url
        has_ssl = final_url.startswith("https://")

        if response.status_code < 400:
            soup = BeautifulSoup(response.text, "html.parser")
            has_viewport = bool(soup.find("meta", attrs={"name": lambda x: x and x.lower() == "viewport"}))
            internal_links = get_internal_links_count(soup, final_url)
            contact_page = has_contact_page(soup, final_url, session)
    except requests.RequestException:
        pass

    score = 0
    if has_ssl:
        score += 20
    if has_viewport:
        score += 20
    if load_time < 3:
        score += 20
    if contact_page:
        score += 20
    if internal_links >= 5:
        score += 20

    return {
        "website_score": score,
        "website_category": classify(score),
        "load_time": round(load_time, 2) if load_time < 900 else "",
        "has_ssl": has_ssl,
        "has_mobile_viewport": has_viewport,
        "has_contact_page": contact_page,
    }


def read_input(path: str) -> list[dict]:
    rows = []
    with open(path, "r", newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            rows.append(row)
    return rows


def write_csv(path: str, rows: list[dict], fieldnames: list[str]) -> None:
    with open(path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def main() -> None:
    input_rows = read_input(INPUT_CSV)
    session = requests.Session()
    session.headers.update({"User-Agent": USER_AGENT})

    scored_rows = []
    targets = []

    total_score = 0
    scanned = 0
    bad_count = 0

    for row in input_rows:
        website = normalize_website(row.get("website", ""))
        if not website:
            continue

        result = scan_website(website, session)
        scanned += 1
        total_score += int(result["website_score"])

        out = {
            "company_name": (row.get("company_name") or "").strip(),
            "email": (row.get("email") or "").strip(),
            "website": website,
            "city": (row.get("city") or "").strip(),
            "source": (row.get("source") or "").strip(),
            "website_score": result["website_score"],
            "website_category": result["website_category"],
            "load_time": result["load_time"],
            "has_ssl": bool_str(result["has_ssl"]),
            "has_mobile_viewport": bool_str(result["has_mobile_viewport"]),
            "has_contact_page": bool_str(result["has_contact_page"]),
        }

        scored_rows.append(out)

        if out["website_category"] in {"bad", "terrible"}:
            bad_count += 1
            targets.append(out)

        time.sleep(1)

    fields = [
        "company_name",
        "email",
        "website",
        "city",
        "source",
        "website_score",
        "website_category",
        "load_time",
        "has_ssl",
        "has_mobile_viewport",
        "has_contact_page",
    ]
    write_csv(SCORED_CSV, scored_rows, fields)
    write_csv(TARGETS_CSV, targets, fields)

    avg = round((total_score / scanned), 2) if scanned else 0.0
    print(f"Total scanned: {scanned}")
    print(f"Average score: {avg}")
    print(f"Bad sites: {bad_count}")
    print(f"Outreach targets: {len(targets)}")


if __name__ == "__main__":
    main()
