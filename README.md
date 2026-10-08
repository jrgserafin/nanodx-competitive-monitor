# NanoDx Competitive Monitor

Automated competitive intelligence for NanoDx. Every weekday morning a GitHub Action:

1. Checks each competitor in [`competitors.yaml`](competitors.yaml) across **Google News**, **their own web pages** (new headlines/links), **RSS feeds**, **FDA 510(k) and PMA decisions**, **ClinicalTrials.gov** and **PubMed**.
2. Keeps only what's new, and flags **high-signal** items (FDA, clearance, launch, acquisition, CLIA, reimbursement…).
3. Emails the digest to the team (Gmail SMTP).
4. Updates the searchable dashboard on GitHub Pages.

## Use it

| I want to… | Do this |
|---|---|
| See / search activity | Open the dashboard (GitHub Pages URL in the repo's About box) |
| Look something up now | **Actions → Competitive monitor → Run workflow**. Optionally type a competitor name in *only*, tick *send email* |
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

Recipients live in a secret so the addresses are not visible in this public repo.

## Notes

- **Public repo:** everything in `data/` and the dashboard is publicly readable. Do not add confidential notes, internal strategy, or customer names to this repo.
- Only headlines, links and short snippets are stored — never full articles.
- Website scraping honors each site's `robots.txt` and uses an identifying user agent.
- First visit to a watched page records a baseline; only links that appear after that are reported.
- A broken source never stops the run; it shows on the dashboard's **Sources** tab and at the foot of the email.

## Run locally

```bash
pip install -r requirements.txt
python monitor.py run              # collect + write digest (no email)
python monitor.py build-site       # dashboard into _site/
python -m http.server -d _site     # open http://localhost:8000
```
