#!/usr/bin/env python3
"""Minimal contractor email scraper.

Flow:
1) Query Google for Kansas City tree-service terms.
2) Extract contractor websites from search results.
3) Visit homepage + contact page (if present).
4) Extract emails via regex.
5) Save unique company records to data/contractor_emails.csv.
"""

from __future__ import annotations

import csv
import re
import time
from urllib.parse import parse_qs, urljoin, urlparse

import requests
from bs4 import BeautifulSoup

GOOGLE_QUERIES = [
    "tree service kansas city",
    "tree removal kansas city",
    "stump grinding kansas city",
    "arborist kansas city",
]

EMAIL_REGEX = re.compile(r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]+")
OUTPUT_CSV = "data/contractor_emails.csv"
CITY = "Kansas City"
SOURCE = "auto_scrape"

USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/123.0.0.0 Safari/537.36"
)

SOCIAL_DOMAINS = {
    "facebook.com",
    "instagram.com",
    "twitter.com",
    "x.com",
    "linkedin.com",
    "youtube.com",
    "tiktok.com",
    "pinterest.com",
    "yelp.com",
    "angi.com",
    "homeadvisor.com",
}

BLOCKED_DOMAINS = {
    "google.com",
    "googleusercontent.com",
    "gstatic.com",
    "maps.google.com",
    "webcache.googleusercontent.com",
}


def throttled_get(url: str, session: requests.Session, timeout: int = 15) -> requests.Response | None:
    try:
        response = session.get(url, timeout=timeout)
    except requests.RequestException:
        time.sleep(1)
        return None
    time.sleep(1)
    if response.status_code >= 400:
        return None
    return response


def normalize_domain(url: str) -> str:
    parsed = urlparse(url)
    host = parsed.netloc.lower().strip()
    if host.startswith("www."):
        host = host[4:]
    return host


def is_social_or_blocked(host: str) -> bool:
    for d in SOCIAL_DOMAINS | BLOCKED_DOMAINS:
        if host == d or host.endswith("." + d):
            return True
    return False


def clean_email(email: str) -> str:
    email = email.strip().lower().strip(".,;:()[]{}<>")
    return email


def looks_real_website(url: str) -> bool:
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"}:
        return False
    host = normalize_domain(url)
    if not host or is_social_or_blocked(host):
        return False
    return True


def extract_candidate_urls_from_google(html: str) -> list[str]:
    soup = BeautifulSoup(html, "html.parser")
    found: list[str] = []

    for a in soup.select("a[href]"):
        href = a.get("href", "")
        if not href:
            continue

        # Common Google result link format: /url?q=<target>&sa=...
        if href.startswith("/url?"):
            query = parse_qs(urlparse(href).query)
            target = query.get("q", [""])[0]
            if target and looks_real_website(target):
                found.append(target)
            continue

        if href.startswith("http") and looks_real_website(href):
            found.append(href)

    # Preserve order while deduping
    out: list[str] = []
    seen: set[str] = set()
    for url in found:
        if url in seen:
            continue
        seen.add(url)
        out.append(url)
    return out


def find_contact_page_url(base_url: str, homepage_html: str) -> str | None:
    soup = BeautifulSoup(homepage_html, "html.parser")
    for a in soup.select("a[href]"):
        href = (a.get("href") or "").strip()
        text = (a.get_text(" ") or "").strip().lower()
        if not href:
            continue

        candidate = href.lower()
        if "contact" not in candidate and "contact" not in text:
            continue

        absolute = urljoin(base_url, href)
        if not looks_real_website(absolute):
            continue

        # Keep same domain for contact page fetch
        if normalize_domain(absolute) != normalize_domain(base_url):
            continue
        return absolute
    return None


def extract_emails(html: str) -> set[str]:
    emails = set(clean_email(e) for e in EMAIL_REGEX.findall(html))
    return {e for e in emails if "@" in e and not e.endswith(".png") and not e.endswith(".jpg")}


def guess_company_name(url: str, html: str) -> str:
    soup = BeautifulSoup(html, "html.parser")
    title = (soup.title.string.strip() if soup.title and soup.title.string else "")
    if title:
        for sep in ["|", "-", "–", "—"]:
            if sep in title:
                title = title.split(sep)[0].strip()
                break
        if title:
            return title[:120]

    host = normalize_domain(url)
    base = host.split(".")[0] if host else "contractor"
    return base.replace("-", " ").replace("_", " ").title()


def write_dataset(rows: list[dict[str, str]], path: str) -> None:
    fieldnames = ["company_name", "email", "website", "city", "source"]
    with open(path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def main() -> None:
    session = requests.Session()
    session.headers.update({"User-Agent": USER_AGENT})

    discovered_sites: list[str] = []
    seen_domains: set[str] = set()

    for query in GOOGLE_QUERIES:
        search_url = f"https://www.google.com/search?q={requests.utils.quote(query)}"
        resp = throttled_get(search_url, session)
        if resp is None:
            continue

        urls = extract_candidate_urls_from_google(resp.text)
        for url in urls:
            domain = normalize_domain(url)
            if not domain or domain in seen_domains:
                continue
            if is_social_or_blocked(domain):
                continue
            seen_domains.add(domain)
            discovered_sites.append(url)

    companies: list[dict[str, str]] = []
    used_emails: set[str] = set()
    websites_scanned = 0
    emails_found_total = 0

    for site in discovered_sites:
        resp = throttled_get(site, session)
        if resp is None:
            continue
        websites_scanned += 1

        homepage_html = resp.text or ""
        all_emails = set()
        all_emails.update(extract_emails(homepage_html))

        contact_url = find_contact_page_url(site, homepage_html)
        if contact_url:
            contact_resp = throttled_get(contact_url, session)
            if contact_resp is not None:
                all_emails.update(extract_emails(contact_resp.text or ""))

        if not all_emails:
            continue

        domain = normalize_domain(site)
        company = guess_company_name(site, homepage_html)

        # One row per unique domain, one selected email.
        selected = ""
        for email in sorted(all_emails):
            if email in used_emails:
                continue
            email_domain = email.split("@")[-1].lower()
            if domain and (email_domain == domain or email_domain.endswith("." + domain)):
                selected = email
                break

        if not selected:
            for email in sorted(all_emails):
                if email not in used_emails:
                    selected = email
                    break

        if not selected:
            continue

        used_emails.add(selected)
        emails_found_total += len(all_emails)
        companies.append(
            {
                "company_name": company,
                "email": selected,
                "website": site,
                "city": CITY,
                "source": SOURCE,
            }
        )

    write_dataset(companies, OUTPUT_CSV)

    print(f"Total websites scanned: {websites_scanned}")
    print(f"Total emails found: {emails_found_total}")
    print(f"Total unique companies stored: {len(companies)}")


if __name__ == "__main__":
    main()
