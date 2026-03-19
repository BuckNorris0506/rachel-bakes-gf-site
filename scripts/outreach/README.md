# BuckSites Residential Concrete Pilot Outreach

Pipeline:

`approved batch CSV` -> first-touch templates -> Zoho SMTP -> `logs/outreach_sent_log.csv` + `logs/outreach_replies_log.csv`

## 1) Prepare approved batch dataset

CSV headers expected:

- `company_name`
- `email`
- `website`
- `city`
- `source`

## 2) Set credentials

```bash
export ZOHO_SMTP_USER="your@zoho-email.com"
export ZOHO_SMTP_PASS="your_zoho_app_password"
export ZOHO_FROM="jared@bucksites.com"
export ZOHO_REPLY_TO="jared@bucksites.com"
```

## 3) Dry-run (no send)

```bash
python3 scripts/outreach/send_outreach.py --input data/approved_batch_01a.csv --daily-limit 5
```

## 4) Send for real

```bash
python3 scripts/outreach/send_outreach.py --input data/approved_batch_01a.csv --daily-limit 5 --send
```

Use small approved batches while the sending domain is warming up.

## 5) Pull and log replies

```bash
python3 scripts/outreach/pull_replies.py
```

This logs related replies in `logs/outreach_replies_log.csv`.

Notes:

- Default sender identity is `Jared <jared@bucksites.com>`.
- Current outbound focus is a small residential concrete pilot.
- First touch is plain-text, no-link, and deliberately low-pressure.
