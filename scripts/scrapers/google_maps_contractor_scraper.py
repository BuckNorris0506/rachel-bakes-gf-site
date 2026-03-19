#!/usr/bin/env python3
"""Google Maps contractor discovery + website email extraction.

Usage:
  export GOOGLE_MAPS_API_KEY="your_key"
  python3 scripts/scrapers/google_maps_contractor_scraper.py

Output:
  data/contractor_emails.csv
  columns: company_name,email,website,city,source
"""

from __future__ import annotations

import csv
import os
import re
import time
from typing import Dict, Iterable, List, Optional, Set, Tuple
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup

# Multi-trade categories to scrape.
TRADES = [
    "tree service",
    "roofing contractor",
    "landscaping service",
    "plumbing contractor",
    "HVAC contractor",
    "general contractor",
    "concrete contractor",
    "fence contractor",
    "deck builder",
]

TARGET_CITIES = ["Kansas City"]

# Required email regex.
EMAIL_RE = re.compile(r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]+")

IGNORE_DOMAINS = {
    "facebook.com",
    "yelp.com",
    "angi.com",
    "homeadvisor.com",
}

OUTPUT_CSV = "data/contractor_emails.csv"
SOURCE_NAME = "google_maps_auto_scrape"
EMAIL_PLACEHOLDER = ""

USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/123.0.0.0 Safari/537.36"
)

TEXT_SEARCH_URL = "https://maps.googleapis.com/maps/api/place/textsearch/json"
DETAILS_URL = "https://maps.googleapis.com/maps/api/place/details/json"


def sleep_throttle() -> None:
    # Required request throttling.
    time.sleep(2)


def normalize_host(url: str) -> str:
    parsed = urlparse(url)
    host = parsed.netloc.lower().strip()
    if host.startswith("www."):
        host = host[4:]
    return host


def normalize_website(url: str) -> str:
    if not url:
        return ""
    u = url.strip()
    if not u.startswith("http://") and not u.startswith("https://"):
        u = "https://" + u
    return u


def is_ignored_website(url: str) -> bool:
    host = normalize_host(url)
    if not host:
        return True
    for bad in IGNORE_DOMAINS:
        if host == bad or host.endswith("." + bad):
            return True
    return False


def request_json(session: requests.Session, url: str, params: Dict[str, str]) -> Optional[Dict]:
    try:
        resp = session.get(url, params=params, timeout=20)
        sleep_throttle()
        if resp.status_code >= 400:
            return None
        return resp.json()
    except requests.RequestException:
        sleep_throttle()
        return None


def text_search_places(session: requests.Session, api_key: str, query: str, city: str) -> List[Dict]:
    full_query = f"{query} in {city}"
    params = {"query": full_query, "key": api_key}

    all_results: List[Dict] = []
    page = request_json(session, TEXT_SEARCH_URL, params)
    if not page:
        return all_results

    all_results.extend(page.get("results", []))

    # Google allows up to 2 next pages for text search (up to ~60 results).
    while page.get("next_page_token"):
        token = page["next_page_token"]
        # next_page_token often needs warm-up; retry if Google returns INVALID_REQUEST.
        next_page: Optional[Dict] = None
        for _ in range(3):
            candidate = request_json(session, TEXT_SEARCH_URL, {"pagetoken": token, "key": api_key})
            if not candidate:
                continue
            if candidate.get("status") == "INVALID_REQUEST":
                continue
            next_page = candidate
            break
        page = next_page
        if not page:
            break
        all_results.extend(page.get("results", []))

    return all_results


def place_details(session: requests.Session, api_key: str, place_id: str) -> Optional[Dict]:
    fields = "name,website,formatted_phone_number,formatted_address"
    params = {
        "place_id": place_id,
        "fields": fields,
        "key": api_key,
    }
    payload = request_json(session, DETAILS_URL, params)
    if not payload:
        return None
    result = payload.get("result")
    if not isinstance(result, dict):
        return None
    return result


def extract_emails_from_html(html: str) -> Set[str]:
    found = {e.strip().lower().strip(".,;:()[]{}<>") for e in EMAIL_RE.findall(html or "")}
    cleaned = set()
    for email in found:
        if "@" not in email:
            continue
        if any(email.endswith(ext) for ext in (".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp")):
            continue
        cleaned.add(email)
    return cleaned


def candidate_contact_links(soup: BeautifulSoup, base_url: str) -> List[str]:
    links: List[str] = []
    base_host = normalize_host(base_url)

    for a in soup.select("a[href]"):
        href = (a.get("href") or "").strip()
        text = (a.get_text(" ") or "").strip().lower()
        if not href:
            continue

        href_l = href.lower()
        if "contact" not in href_l and "contact" not in text:
            continue

        absolute = urljoin(base_url, href)
        parsed = urlparse(absolute)
        if parsed.scheme not in {"http", "https"}:
            continue
        if normalize_host(absolute) != base_host:
            continue
        if absolute not in links:
            links.append(absolute)

    return links[:3]


def fetch_website_emails(session: requests.Session, website: str) -> Set[str]:
    emails: Set[str] = set()

    try:
        home_resp = session.get(website, timeout=20)
        sleep_throttle()
    except requests.RequestException:
        sleep_throttle()
        return emails

    if home_resp.status_code >= 400:
        return emails

    html = home_resp.text or ""
    emails.update(extract_emails_from_html(html))

    soup = BeautifulSoup(html, "html.parser")

    # mailto links on homepage.
    for a in soup.select("a[href^='mailto:']"):
        href = (a.get("href") or "").strip()
        email = href.replace("mailto:", "", 1).split("?")[0].strip().lower()
        if email:
            emails.add(email)

    # Follow contact page(s) for additional emails.
    for link in candidate_contact_links(soup, website):
        try:
            contact_resp = session.get(link, timeout=20)
            sleep_throttle()
        except requests.RequestException:
            sleep_throttle()
            continue

        if contact_resp.status_code >= 400:
            continue

        contact_html = contact_resp.text or ""
        emails.update(extract_emails_from_html(contact_html))

        contact_soup = BeautifulSoup(contact_html, "html.parser")
        for a in contact_soup.select("a[href^='mailto:']"):
            href = (a.get("href") or "").strip()
            email = href.replace("mailto:", "", 1).split("?")[0].strip().lower()
            if email:
                emails.add(email)

    return emails


def pick_primary_email(emails: Iterable[str], site_host: str) -> Optional[str]:
    sorted_emails = sorted(set(emails))
    for email in sorted_emails:
        domain = email.split("@")[-1].lower()
        if domain == site_host or domain.endswith("." + site_host):
            return email
    return sorted_emails[0] if sorted_emails else None


def write_csv(path: str, rows: List[Dict[str, str]]) -> None:
    fields = ["company_name", "email", "website", "city", "source"]
    with open(path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)


def normalize_company_name(name: str) -> str:
    return re.sub(r"\s+", " ", (name or "").strip().lower())


def normalize_website_key(url: str) -> str:
    return normalize_website(url).strip().lower().rstrip("/")


def contractor_key(company_name: str, website: str) -> Tuple[str, str]:
    return normalize_company_name(company_name), normalize_website_key(website)


def load_existing_rows(path: str) -> List[Dict[str, str]]:
    if not os.path.exists(path):
        return []
    rows: List[Dict[str, str]] = []
    with open(path, "r", newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            rows.append(
                {
                    "company_name": (row.get("company_name") or "").strip(),
                    "email": (row.get("email") or "").strip(),
                    "website": (row.get("website") or "").strip(),
                    "city": (row.get("city") or "").strip(),
                    "source": (row.get("source") or "").strip() or SOURCE_NAME,
                }
            )
    return rows


def append_rows(path: str, rows: List[Dict[str, str]]) -> None:
    if not rows:
        return
    fields = ["company_name", "email", "website", "city", "source"]
    exists = os.path.exists(path)
    with open(path, "a", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fields)
        if not exists:
            writer.writeheader()
        writer.writerows(rows)


def main() -> None:
    api_key = os.getenv("GOOGLE_MAPS_API_KEY", "").strip()
    if not api_key:
        raise SystemExit("Missing GOOGLE_MAPS_API_KEY environment variable.")

    session = requests.Session()
    session.headers.update({"User-Agent": USER_AGENT})

    override_trade = os.getenv("SCRAPER_TRADE", "").strip()
    override_city = os.getenv("SCRAPER_CITY", "").strip()
    trades_to_run = [override_trade] if override_trade else TRADES
    cities_to_run = [override_city] if override_city else TARGET_CITIES

    seen_place_ids: Set[str] = set()
    seen_company_website: Set[Tuple[str, str]] = set()

    existing_rows = load_existing_rows(OUTPUT_CSV)
    for row in existing_rows:
        key = contractor_key(row.get("company_name", ""), row.get("website", ""))
        if key[0] and key[1]:
            seen_company_website.add(key)
    new_rows: List[Dict[str, str]] = []

    total_contractors_found = 0

    for city in cities_to_run:
        for trade in trades_to_run:
            print(f"Searching trade: {trade}")
            print(f"City: {city}")
            places = text_search_places(session, api_key, trade, city)
            print(f"Results returned: {len(places)}")

            for place in places:
                place_id = (place.get("place_id") or "").strip()
                if not place_id or place_id in seen_place_ids:
                    continue
                seen_place_ids.add(place_id)
                total_contractors_found += 1

                details = place_details(session, api_key, place_id)
                if not details:
                    continue

                company_name = (details.get("name") or place.get("name") or "").strip()
                website = normalize_website((details.get("website") or "").strip())
                phone = (details.get("formatted_phone_number") or "").strip()  # collected per requirement
                address = (details.get("formatted_address") or place.get("formatted_address") or "").strip()  # collected per requirement

                # Keep city association from loop (deterministic per query batch).
                company_city = city

                if not website:
                    continue
                if is_ignored_website(website):
                    continue

                website_host = normalize_host(website)
                if not website_host:
                    continue

                emails = fetch_website_emails(session, website)
                # Save contractor rows even when no email is found; enrichment can fill later.
                primary_email = pick_primary_email(emails, website_host) if emails else EMAIL_PLACEHOLDER
                dedupe_key = contractor_key(company_name or website_host, website)
                if dedupe_key in seen_company_website:
                    continue

                seen_company_website.add(dedupe_key)

                new_rows.append(
                    {
                        "company_name": company_name or website_host,
                        "email": primary_email,
                        "website": website,
                        "city": company_city,
                        "source": SOURCE_NAME,
                    }
                )

                # Optional debug line to show extracted listing context.
                _ = phone, address

    append_rows(OUTPUT_CSV, new_rows)

    print(f"Total contractors found: {total_contractors_found}")
    print(f"Total unique contractors saved: {len(new_rows)}")
    print(f"Output: {OUTPUT_CSV}")


if __name__ == "__main__":
    main()
