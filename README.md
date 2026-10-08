# NanoDx Competitive Monitor

Automated competitive intelligence for NanoDx, run by GitHub Actions:

- **Sources:** Google News, competitor web pages (new headlines/links), RSS, FDA 510(k)/PMA, ClinicalTrials.gov, PubMed, **SEC EDGAR filings**, **US patents** (PatentsView), **job boards** (Greenhouse/Lever/Ashby) and the **Federal Register** (CMS/FDA rules).
- **Daily digest** (weekdays ~7am ET) of everything new since the last digest, with an optional **AI analyst brief**.
- **Instant alerts** (three extra sweeps each weekday) for FDA decisions, material SEC 8-Ks, launches, deals, recalls, reimbursement news.
- **Weekly review** every Monday: activity vs. prior week, top moves, recommended actions, and refreshed **battlecards** (FDA record, recent moves, strengths/weaknesses, talk track).
- **Dashboard** on GitHub Pages: search, filters, timeline chart, battlecards with print/PDF, CSV export.

## Use it

| I want to… | Do this |
|---|---|
| See / search activity | Open the dashboard (GitHub Pages URL in the repo's About box) |
| Look something up now | **Actions → Competitive monitor → Run workflow**. Pick a mode (digest / alerts / weekly / collect), optionally a competitor in *only*, tick *send email* |
| Update a battlecard's notes | Edit the competitor's `profile` block in `competitors.yaml` |
| Describe NanoDx for the AI | Edit `company_context` in `competitors.yaml` |
| Add or change a competitor | Edit `competitors.yaml` on GitHub and commit; the next run uses it |
| Change who gets the email | Update the `DIGEST_RECIPIENTS` secret |
| Change the schedule | Edit the `cron` line in `.github/workflows/monitor.yml` (times are UTC) |

## One-time setup: email secrets

In **Settings → Secrets and variables → Actions → New repository secret**, add:

| Secret | Value |
|---|---|
| `GMAIL_USER` | The Gmail address that sends the digest |
| `GMAIL_APP_PASSWORD` | A 16-character Gmail **app password** (Google Account → Security → 2-Step Verification → App passwords). Not the normal password. |
| `DIGEST_RECIPIENTS` | Comma-separated list of recipient emails (sent as Bcc) |
| `ALERT_RECIPIENTS` | Optional: who gets instant alerts (defaults to `DIGEST_RECIPIENTS`) |
| `ANTHROPIC_API_KEY` | Optional: turns on AI analyst briefs and battlecard summaries (console.anthropic.com) |
| `PATENTSVIEW_API_KEY` | Optional: turns on US patent tracking (free key from patentsview.org) |
| `SEC_CONTACT` | Optional: a contact email SEC asks automated clients to send |
| `COMPANY_CONTEXT` | Optional but recommended with the AI key: a private description of NanoDx (product, stage, customers, differentiators) so the analysis is relevant |

Recipients live in a secret so the addresses are not visible in this public repo.

## Notes

- **Public repo:** everything in `data/` and the dashboard is publicly readable. Do not add confidential notes, internal strategy, or customer names to this repo.
- With `publish_strategy: false` (the default) the AI briefs and battlecard strategy (threat level, strengths, weaknesses, talk track) are **emailed only** and never written to the repo or site.
- Only headlines, links and short snippets are stored — never full articles.
- Website scraping honors each site's `robots.txt` and uses an identifying user agent.
- First visit to a watched page records a baseline; only links that appear after that are reported.
- A broken source never stops the run; it shows on the dashboard's **Sources** tab and at the foot of the email.

## Run locally

```bash
pip install -r requirements.txt
python monitor.py collect          # fetch all sources
python monitor.py alerts           # alerts (no email unless SEND_EMAIL=true)
python monitor.py digest           # daily digest
python monitor.py weekly           # weekly review + battlecards
python monitor.py build-site       # dashboard into _site/
python -m http.server -d _site     # open http://localhost:8000
```
