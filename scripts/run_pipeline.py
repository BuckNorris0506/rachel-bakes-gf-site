#!/usr/bin/env python3
"""Run end-to-end contractor outreach pipeline.

Steps:
1) scrape contractors
2) clean emails
3) scan websites (generates outreach_targets.csv)
4) send outreach
"""

from __future__ import annotations

import argparse
import csv
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

SCRAPER = ROOT / "scripts" / "scrapers" / "maps_email_scraper.py"
CLEANER = ROOT / "scripts" / "analysis" / "clean_emails.py"
SCANNER = ROOT / "scripts" / "analysis" / "scan_websites.py"
SENDER = ROOT / "scripts" / "outreach" / "send_outreach.py"

CONTRACTORS_CSV = ROOT / "data" / "contractor_emails.csv"
CLEAN_CSV = ROOT / "data" / "contractor_clean.csv"
TARGETS_CSV = ROOT / "data" / "outreach_targets.csv"
SENT_LOG = ROOT / "logs" / "outreach_sent_log.csv"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run contractor outreach pipeline")
    parser.add_argument("--dry-run", action="store_true", help="Do not actually send emails")
    parser.add_argument("--daily-limit", type=int, default=20, help="Max outreach emails per run/day")
    return parser.parse_args()


def run_step(name: str, cmd: list[str]) -> str:
    print(f"\n== {name} ==")
    proc = subprocess.run(
        cmd,
        cwd=str(ROOT),
        text=True,
        capture_output=True,
    )
    if proc.stdout:
        print(proc.stdout.strip())
    if proc.returncode != 0:
        if proc.stderr:
            print(proc.stderr.strip(), file=sys.stderr)
        raise SystemExit(f"Step failed: {name}")
    return proc.stdout or ""


def count_rows(path: Path) -> int:
    if not path.exists():
        return 0
    with path.open("r", newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        return sum(1 for _ in reader)


def count_log_status(path: Path, status: str) -> int:
    if not path.exists():
        return 0
    n = 0
    with path.open("r", newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            if (row.get("status") or "").strip().lower() == status.lower():
                n += 1
    return n


def extract_metric(output: str, label: str) -> int | None:
    m = re.search(rf"{re.escape(label)}:\s*(\d+)", output)
    if not m:
        return None
    return int(m.group(1))


def main() -> None:
    args = parse_args()

    scraper_out = run_step("Scrape contractors", [sys.executable, str(SCRAPER)])
    run_step("Clean emails", [sys.executable, str(CLEANER)])
    run_step("Scan websites", [sys.executable, str(SCANNER)])

    sent_before = count_log_status(SENT_LOG, "sent")
    dry_before = count_log_status(SENT_LOG, "dry_run")

    send_cmd = [
        sys.executable,
        str(SENDER),
        "--input",
        str(TARGETS_CSV),
        "--daily-limit",
        str(args.daily_limit),
    ]
    if not args.dry_run:
        send_cmd.append("--send")

    run_step("Send outreach", send_cmd)

    sent_after = count_log_status(SENT_LOG, "sent")
    dry_after = count_log_status(SENT_LOG, "dry_run")

    contractors_discovered = extract_metric(scraper_out, "Total unique companies stored")
    emails_extracted = extract_metric(scraper_out, "Total emails found")

    if contractors_discovered is None:
        contractors_discovered = count_rows(CONTRACTORS_CSV)
    if emails_extracted is None:
        # Best-effort fallback: use cleaned rows as extracted email count
        emails_extracted = count_rows(CLEAN_CSV)

    targets_generated = count_rows(TARGETS_CSV)
    emails_sent = (sent_after - sent_before) if not args.dry_run else 0
    emails_dry_run = (dry_after - dry_before) if args.dry_run else 0

    print("\n== Pipeline Summary ==")
    print(f"contractors discovered: {contractors_discovered}")
    print(f"emails extracted: {emails_extracted}")
    print(f"targets generated: {targets_generated}")
    print(f"emails sent: {emails_sent}")
    if args.dry_run:
        print(f"dry-run emails processed: {emails_dry_run}")


if __name__ == "__main__":
    main()
