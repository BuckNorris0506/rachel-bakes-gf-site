#!/usr/bin/env python3
"""Generate a simple contractor website video audit checklist.

Usage:
  python3 scripts/analysis/video_audit_checklist.py https://example.com
"""

from __future__ import annotations

import argparse
import re
import sys
from urllib.parse import urlparse


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate a Loom-ready contractor website review checklist")
    parser.add_argument("website", help="Website URL to review (e.g. https://example.com)")
    return parser.parse_args()


def normalize_url(raw: str) -> str:
    value = raw.strip()
    if not value:
        return ""
    if not value.startswith("http://") and not value.startswith("https://"):
        value = "https://" + value
    return value


def is_valid_url(value: str) -> bool:
    parsed = urlparse(value)
    return parsed.scheme in {"http", "https"} and bool(parsed.netloc)


def main() -> int:
    args = parse_args()
    website = normalize_url(args.website)

    if not is_valid_url(website):
        print("Invalid URL. Example usage: python3 scripts/analysis/video_audit_checklist.py https://example.com", file=sys.stderr)
        return 2

    print("Website Review Checklist")
    print()
    print(f"Website: {website}")
    print()

    print("CHECK 1 — Phone number visibility on mobile")
    print("Look for a visible phone number at the top of the mobile view and a one-tap call action.")
    print("Why this matters: Contractor leads are high-intent; if calling is not immediate, many users leave.")
    print()

    print("CHECK 2 — Page loading speed")
    print("Check how quickly the homepage and service pages appear on a mobile connection.")
    print("Why this matters: Slow pages increase bounce rate and reduce inbound calls before visitors see your offer.")
    print()

    print("CHECK 3 — Service clarity")
    print("Confirm services are clearly listed above the fold (e.g., tree removal, roofing, plumbing).")
    print("Why this matters: Homeowners should understand in seconds that this company does the exact job they need.")
    print()

    print("CHECK 4 — Call-to-action")
    print("Look for a clear next step such as 'Call Now' or 'Request a Quote' on every key section.")
    print("Why this matters: Strong CTAs guide users into action and increase lead conversion from site traffic.")
    print()

    print("CHECK 5 — Trust signals")
    print("Check for reviews, photos of completed work, and licenses/certifications.")
    print("Why this matters: Trust proof reduces hesitation and helps visitors choose this contractor over competitors.")
    print()

    print("Closing Message Suggestion")
    print("Based on this review, the site would benefit from a cleaner, faster, mobile-first redesign focused on")
    print("clear services, stronger trust proof, and call-focused conversion sections.")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
