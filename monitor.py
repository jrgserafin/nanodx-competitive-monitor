#!/usr/bin/env python3
"""NanoDx Competitive Monitor.

Collects competitor activity from Google News, competitor web pages (new
headlines/links), RSS feeds, FDA 510(k)/PMA records, ClinicalTrials.gov and
PubMed. Keeps a de-duplicated history in data/, writes a dated digest, emails
it via Gmail SMTP and builds the static dashboard into _site/.

Usage:
  python monitor.py run [--send] [--only NAME]   collect, write digest, maybe email
  python monitor.py build-site                    assemble _site/ for GitHub Pages
  python monitor.py preview-email                 write data/email-preview.html

Email secrets (set as GitHub repo secrets, never commit them):
  GMAIL_USER, GMAIL_APP_PASSWORD, DIGEST_RECIPIENTS (comma separated)
"""
from __future__ import annotations

import argparse
import datetime as dt
import email.utils
import hashlib
import html
import json
import os
import re
import shutil
import smtplib
import ssl
import sys
import time
import urllib.parse
import urllib.robotparser
import xml.etree.ElementTree as ET
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from pathlib import Path

import requests
import yaml
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parent
DATA = ROOT / "data"
CONFIG = ROOT / "competitors.yaml"
UA = "NanoDx-CompetitiveMonitor/1.0 (+internal market research; contact via repo owner)"
TIMEOUT = 25
MAX_HISTORY = 5000
SNIPPET_LEN = 280  # store short snippets only; never republish full articles

session = requests.Session()
session.headers.update({"User-Agent": UA, "Accept-Language": "en-US,en;q=0.8"})


# ----------------------------------------------------------------- utilities
def now_utc() -> dt.datetime:
    return dt.datetime.now(dt.timezone.utc)


def today_et() -> str:
    # Digest date in US Eastern (approximate with fixed offsets is fine for a label)
    try:
        from zoneinfo import ZoneInfo
        return dt.datetime.now(ZoneInfo("America/New_York")).date().isoformat()
    except Exception:
        return now_utc().date().isoformat()


def make_id(*parts: str) -> str:
    return hashlib.sha1("|".join(p or "" for p in parts).encode()).hexdigest()[:16]


def clean(text: str | None, limit: int = SNIPPET_LEN) -> str:
    if not text:
        return ""
    text = BeautifulSoup(text, "html.parser").get_text(" ")
    text = re.sub(r"\s+", " ", html.unescape(text)).strip()
    return text if len(text) <= limit else text[: limit - 1].rsplit(" ", 1)[0] + "…"


def parse_date(value: str | None) -> str | None:
    """Return ISO date (YYYY-MM-DD) from many formats, or None."""
    if not value:
        return None
    value = value.strip()
    try:
        d = email.utils.parsedate_to_datetime(value)
        return d.date().isoformat()
    except Exception:
        pass
    for fmt in ("%Y-%m-%d", "%Y%m%d", "%Y/%m/%d %H:%M", "%Y %b %d", "%B %d, %Y"):
        try:
            return dt.datetime.strptime(value, fmt).date().isoformat()
        except Exception:
            continue
    m = re.match(r"(\d{4})-(\d{2})-(\d{2})", value)
    if m:
        return "-".join(m.groups())
    m = re.match(r"(\d{4}) (\w{3})(?: (\d{1,2}))?", value)
    if m:
        try:
            return dt.datetime.strptime(f"{m.group(1)} {m.group(2)} {m.group(3) or 1}", "%Y %b %d").date().isoformat()
        except Exception:
            return None
    return None


def get(url: str, **kw) -> requests.Response:
    last = None
    for attempt in range(3):
        try:
            r = session.get(url, timeout=TIMEOUT, **kw)
            if r.status_code in (429, 500, 502, 503, 504):
                raise requests.HTTPError(f"HTTP {r.status_code}")
            r.raise_for_status()
            return r
        except Exception as e:  # noqa: BLE001
            last = e
            time.sleep(2 * (attempt + 1))
    raise RuntimeError(f"{url}: {last}")


def load_json(path: Path, default):
    try:
        return json.loads(path.read_text())
    except Exception:
        return default


def save_json(path: Path, obj) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, indent=1, ensure_ascii=False))


def item(competitor, source, title, url, date=None, snippet="", extra=None, uid=None):
    return {
        "id": uid or make_id(source, url or title),
        "competitor": competitor,
        "source": source,
        "title": clean(title, 300),
        "url": url,
        "date": date,
        "snippet": clean(snippet),
        **(extra or {}),
    }


# ---------------------------------------------------------------- collectors
def collect_google_news(name, query, cfg):
    q = urllib.parse.quote(query)
    url = f"https://news.google.com/rss/search?q={q}+when:{cfg['lookback_days']}d&hl=en-US&gl=US&ceid=US:en"
    return parse_feed(name, "News", get(url).content, cfg, query=query)


def collect_rss(name, feed_url, cfg):
    return parse_feed(name, "RSS", get(feed_url).content, cfg)


def parse_feed(name, source, content, cfg, query=None):
    out = []
    root = ET.fromstring(content)
    ns = {"a": "http://www.w3.org/2005/Atom"}
    entries = root.findall(".//item") or root.findall(".//a:entry", ns)
    for e in entries[: cfg["max_items_per_source"]]:
        def t(tag):
            el = e.find(tag) if not tag.startswith("a:") else e.find(tag, ns)
            return el.text if el is not None and el.text else ""
        title = t("title") or t("a:title")
        link = t("link")
        if not link:
            le = e.find("a:link", ns)
            link = le.get("href") if le is not None else ""
        pub = parse_date(t("pubDate") or t("a:updated") or t("a:published"))
        src_el = e.find("source")
        publisher = src_el.text if src_el is not None and src_el.text else ""
        if publisher and title.endswith(" - " + publisher):
            title = title[: -len(publisher) - 3]
        snippet = t("description") or t("a:summary")
        if clean(snippet).startswith(clean(title)[:40]):
            snippet = ""  # Google News descriptions just repeat the title
        out.append(item(name, source, title, link, pub, snippet,
                        {"publisher": publisher, "query": query} if query else {"publisher": publisher},
                        uid=make_id(source, name, clean(title, 120).lower())))
    return out


_robots: dict[str, urllib.robotparser.RobotFileParser | None] = {}


def allowed_by_robots(url: str) -> bool:
    parts = urllib.parse.urlsplit(url)
    base = f"{parts.scheme}://{parts.netloc}"
    if base not in _robots:
        rp = urllib.robotparser.RobotFileParser()
        try:
            r = session.get(base + "/robots.txt", timeout=TIMEOUT)
            rp.parse(r.text.splitlines() if r.status_code == 200 else [])
            _robots[base] = rp
        except Exception:
            _robots[base] = None
    rp = _robots[base]
    return True if rp is None else rp.can_fetch(UA, url)


def collect_page(name, page_url, cfg):
    """Report links/headlines that newly appear on a watched page."""
    if not allowed_by_robots(page_url):
        raise RuntimeError(f"{page_url}: disallowed by robots.txt — skipped")
    r = get(page_url)
    soup = BeautifulSoup(r.text, "html.parser")
    for tag in soup(["script", "style", "nav", "footer", "header", "noscript"]):
        tag.decompose()
    host = urllib.parse.urlsplit(page_url).netloc.replace("www.", "")
    links = {}
    for a in soup.find_all("a", href=True):
        text = re.sub(r"\s+", " ", a.get_text(" ")).strip()
        href = urllib.parse.urljoin(page_url, a["href"]).split("#")[0]
        if len(text) < 25 or len(text) > 250 or href.startswith(("mailto:", "javascript:")):
            continue
        if host not in urllib.parse.urlsplit(href).netloc:
            continue
        links.setdefault(href, text)
    state_file = DATA / "pages" / f"{make_id(page_url)}.json"
    state = load_json(state_file, None)
    out = []
    if state is not None:  # first visit = baseline, nothing reported
        seen = set(state.get("links", []))
        for href, text in links.items():
            if href not in seen:
                out.append(item(name, "Website", text, href, now_utc().date().isoformat(),
                                f"New on {page_url}", {"page": page_url}))
        seen |= set(links)
        links_to_store = sorted(seen)[-2000:]
    else:
        links_to_store = sorted(links)
    save_json(state_file, {"url": page_url, "checked": now_utc().isoformat(timespec="seconds"),
                           "links": links_to_store})
    return out[: cfg["max_items_per_source"]]


def collect_fda(name, applicant, cfg):
    out = []
    since = (now_utc() - dt.timedelta(days=365)).strftime("%Y%m%d")
    today = now_utc().strftime("%Y%m%d")
    a = urllib.parse.quote(f'"{applicant}"')
    for kind, endpoint, num_key, title_key in (
        ("510(k)", "510k", "k_number", "device_name"),
        ("PMA", "pma", "pma_number", "trade_name"),
    ):
        url = (f"https://api.fda.gov/device/{endpoint}.json?search=applicant:{a}"
               f"+AND+decision_date:[{since}+TO+{today}]&sort=decision_date:desc&limit=10")
        r = session.get(url, timeout=TIMEOUT)
        if r.status_code == 404:  # openFDA returns 404 for "no matches"
            continue
        r.raise_for_status()
        for rec in r.json().get("results", []):
            num = rec.get(num_key, "")
            supp = rec.get("supplement_number", "")
            if kind == "510(k)":
                link = f"https://www.accessdata.fda.gov/scripts/cdrh/cfdocs/cfpmn/pmn.cfm?ID={num}"
            else:
                link = f"https://www.accessdata.fda.gov/scripts/cdrh/cfdocs/cfpma/pma.cfm?id={num}{supp}"
            title = f"FDA {kind} {num}{(' ' + supp) if supp else ''}: {rec.get(title_key) or rec.get('generic_name', '')}"
            snippet = f"Applicant: {rec.get('applicant', '')}. Decision: {rec.get('decision_description') or rec.get('decision_code', '')}."
            out.append(item(name, "FDA", title, link, parse_date(rec.get("decision_date")), snippet,
                            uid=make_id("FDA", num, supp)))
    return out


def collect_trials(name, sponsor, cfg):
    url = ("https://clinicaltrials.gov/api/v2/studies?query.spons=" + urllib.parse.quote(sponsor)
           + "&sort=LastUpdatePostDate:desc&pageSize=10")
    out = []
    for s in get(url).json().get("studies", []):
        p = s.get("protocolSection", {})
        ident, status = p.get("identificationModule", {}), p.get("statusModule", {})
        nct = ident.get("nctId", "")
        updated = status.get("lastUpdatePostDateStruct", {}).get("date")
        title = f"{ident.get('briefTitle', '')} ({status.get('overallStatus', '').replace('_', ' ').title()})"
        sponsor_name = p.get("sponsorCollaboratorsModule", {}).get("leadSponsor", {}).get("name", "")
        out.append(item(name, "Clinical trial", title, f"https://clinicaltrials.gov/study/{nct}",
                        parse_date(updated), f"{nct} · lead sponsor {sponsor_name} · updated {updated}",
                        uid=make_id("CT", nct, updated or "")))
    return out


def collect_pubmed(name, query, cfg):
    base = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/"
    params = {"db": "pubmed", "term": query, "retmode": "json", "sort": "pub_date",
              "retmax": cfg["max_items_per_source"], "datetype": "edat", "reldate": max(cfg["lookback_days"], 30)}
    ids = get(base + "esearch.fcgi", params=params).json()["esearchresult"].get("idlist", [])
    if not ids:
        return []
    time.sleep(0.4)  # NCBI rate limit (3 req/s without key)
    res = get(base + "esummary.fcgi", params={"db": "pubmed", "id": ",".join(ids), "retmode": "json"}).json()["result"]
    out = []
    for pid in ids:
        r = res.get(pid, {})
        authors = ", ".join(a["name"] for a in r.get("authors", [])[:3])
        out.append(item(name, "Publication", r.get("title", ""), f"https://pubmed.ncbi.nlm.nih.gov/{pid}/",
                        parse_date(r.get("sortpubdate") or r.get("pubdate")),
                        f"{r.get('fulljournalname', '')}. {authors}{' et al.' if len(r.get('authors', [])) > 3 else ''}",
                        uid=make_id("PubMed", pid)))
    return out


# ------------------------------------------------------------------ pipeline
def load_config():
    cfg = yaml.safe_load(CONFIG.read_text())
    s = {"digest_title": "Competitive Digest", "lookback_days": 14, "send_when_empty": True,
         "max_items_per_source": 15, "signal_keywords": []}
    s.update(cfg.get("settings") or {})
    cfg["settings"] = s
    cfg.setdefault("competitors", [])
    cfg.setdefault("topics", [])
    return cfg


def jobs_for(entity):
    n = entity["name"]
    for q in entity.get("news_queries") or []:
        yield f"News: {q}", collect_google_news, n, q
    for u in entity.get("rss") or []:
        yield f"RSS: {u}", collect_rss, n, u
    for u in entity.get("watch_pages") or []:
        yield f"Page: {u}", collect_page, n, u
    if entity.get("fda_applicant"):
        yield f"FDA: {entity['fda_applicant']}", collect_fda, n, entity["fda_applicant"]
    if entity.get("trials_sponsor"):
        yield f"Trials: {entity['trials_sponsor']}", collect_trials, n, entity["trials_sponsor"]
    if entity.get("pubmed_query"):
        yield f"PubMed: {entity['pubmed_query']}", collect_pubmed, n, entity["pubmed_query"]


def is_signal(it, keywords):
    hay = f"{it['title']} {it.get('snippet', '')}".lower()
    hits = [k for k in keywords if k.lower() in hay]
    return hits


def run(only: str | None = None):
    cfg = load_config()
    s = cfg["settings"]
    entities = [dict(e, kind="competitor") for e in cfg["competitors"]] + \
               [dict(t, kind="topic") for t in cfg["topics"]]
    if only:
        entities = [e for e in entities if only.lower() in e["name"].lower()]
        if not entities:
            sys.exit(f"No competitor/topic matches '{only}'")

    history = load_json(DATA / "items.json", [])
    known = {h["id"] for h in history}
    first_run = not history
    cutoff = (now_utc() - dt.timedelta(days=s["lookback_days"])).date().isoformat()
    stamp = now_utc().isoformat(timespec="seconds")

    collected, health = [], []
    for e in entities:
        for label, fn, name, arg in jobs_for(e):
            t0 = time.time()
            try:
                got = fn(name, arg, s)
                health.append({"entity": name, "source": label, "ok": True, "count": len(got),
                               "secs": round(time.time() - t0, 1)})
                collected.extend(got)
            except Exception as ex:  # noqa: BLE001 — one broken source must not stop the run
                health.append({"entity": name, "source": label, "ok": False, "error": str(ex)[:300],
                               "secs": round(time.time() - t0, 1)})
                print(f"  ! {name} / {label}: {ex}", file=sys.stderr)
            time.sleep(0.5)

    new = []
    for it in collected:
        if it["id"] in known:
            continue
        known.add(it["id"])
        if it.get("date") and it["date"] < cutoff:
            it["stale"] = True  # remember it so it never shows as new, but keep it out of the digest
        it["first_seen"] = stamp
        it["signal"] = is_signal(it, s["signal_keywords"])
        history.append(it)
        if not it.get("stale"):
            new.append(it)

    history.sort(key=lambda h: (h.get("date") or h["first_seen"][:10], h["first_seen"]), reverse=True)
    save_json(DATA / "items.json", history[:MAX_HISTORY])

    day = today_et()
    digest = {
        "date": day, "generated": stamp, "title": s["digest_title"], "first_run": first_run,
        "only": only, "items": sorted(new, key=lambda i: (not i["signal"], i["competitor"], i.get("date") or ""), reverse=False),
        "health": health,
    }
    ddir = DATA / "digests"
    # Same-day reruns merge so nothing is lost
    prev = load_json(ddir / f"{day}.json", None)
    if prev:
        ids = {i["id"] for i in digest["items"]}
        digest["items"] = digest["items"] + [i for i in prev.get("items", []) if i["id"] not in ids]
    save_json(ddir / f"{day}.json", digest)
    (ddir / f"{day}.html").write_text(render_digest_page(digest, cfg))
    index = sorted({p.stem for p in ddir.glob("*.json") if p.stem != "index"}, reverse=True)
    save_json(ddir / "index.json", [{"date": d, "count": len(load_json(ddir / f"{d}.json", {}).get("items", []))} for d in index])
    save_json(DATA / "health.json", {"checked": stamp, "sources": health})
    save_json(DATA / "competitors.json", [
        {k: e.get(k) for k in ("name", "category", "website", "kind", "watch_pages", "news_queries",
                               "fda_applicant", "trials_sponsor", "pubmed_query", "rss")}
        for e in [dict(c, kind="competitor") for c in cfg["competitors"]] + [dict(t, kind="topic") for t in cfg["topics"]]
    ])
    ok = sum(h["ok"] for h in health)
    print(f"Sources OK {ok}/{len(health)} · new items {len(new)} · history {len(history)}")
    return digest, cfg


# ------------------------------------------------------------------ rendering
SOURCE_ORDER = ["FDA", "News", "Website", "RSS", "Clinical trial", "Publication"]
COLORS = {"FDA": "#b42318", "News": "#175cd3", "Website": "#6941c6", "RSS": "#6941c6",
          "Clinical trial": "#067647", "Publication": "#93370d"}


def dashboard_url():
    repo = os.environ.get("GITHUB_REPOSITORY", "")
    if "/" in repo:
        owner, name = repo.split("/", 1)
        return f"https://{owner.lower()}.github.io/{name}/"
    return ""


def render_email(digest, cfg) -> str:
    """Email-safe HTML (tables + inline styles)."""
    e = html.escape
    items = digest["items"]
    signal = [i for i in items if i.get("signal")]
    by_comp: dict[str, list] = {}
    for i in items:
        by_comp.setdefault(i["competitor"], []).append(i)
    order = [c["name"] for c in cfg["competitors"]] + [t["name"] for t in cfg["topics"]]
    comps = sorted(by_comp, key=lambda c: order.index(c) if c in order else 999)
    failed = [h for h in digest["health"] if not h["ok"]]
    dash = dashboard_url()

    def row(i):
        color = COLORS.get(i["source"], "#475467")
        sig = (" <span style='background:#fef0c7;color:#93370d;border-radius:4px;padding:1px 6px;font-size:11px'>"
               + e(", ".join(i["signal"][:3])) + "</span>") if i.get("signal") else ""
        meta = " · ".join(x for x in [i.get("publisher"), i.get("date")] if x)
        snip = f"<div style='color:#475467;font-size:13px;margin-top:2px'>{e(i['snippet'])}</div>" if i.get("snippet") else ""
        return (f"<tr><td style='padding:8px 0;border-bottom:1px solid #eaecf0'>"
                f"<span style='color:{color};font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.04em'>{e(i['source'])}</span>{sig}<br>"
                f"<a href='{e(i['url'] or '#')}' style='color:#101828;font-weight:600;text-decoration:none;font-size:14px'>{e(i['title'])}</a>"
                f"<div style='color:#667085;font-size:12px'>{e(meta)}</div>{snip}</td></tr>")

    parts = [f"""<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;background:#f2f4f7;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#101828">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="640" cellpadding="0" cellspacing="0" style="max-width:640px;width:100%;background:#fff;border-radius:10px;padding:24px">
<tr><td><div style="font-size:12px;color:#667085;text-transform:uppercase;letter-spacing:.06em">{e(digest['date'])}</div>
<h1 style="margin:4px 0 6px;font-size:22px">{e(digest['title'])}</h1>
<p style="margin:0 0 16px;color:#475467;font-size:14px">{len(items)} new item{'s' if len(items) != 1 else ''} across {len(comps)} competitor{'s' if len(comps) != 1 else ''}/topic{'s' if len(comps) != 1 else ''}; {len(signal)} high-signal.
{'<br><b>First run:</b> this is the baseline, so it includes everything from the lookback window.' if digest.get('first_run') else ''}</p>"""]
    if dash:
        parts.append(f"<p style='margin:0 0 16px'><a href='{dash}' style='background:#101828;color:#fff;padding:8px 14px;border-radius:6px;text-decoration:none;font-size:13px'>Open dashboard</a></p>")
    if not items:
        parts.append("<p style='color:#475467'>No new competitor activity found since the last run.</p>")
    shown = set()
    if signal:
        parts.append("<h2 style='font-size:16px;margin:18px 0 4px'>High signal</h2><table width='100%' cellpadding='0' cellspacing='0'>")
        parts += [row(i) for i in signal[:12]]
        parts.append("</table>")
    shown = {i["id"] for i in signal[:12]}
    for c in comps:
        rest = [i for i in by_comp[c] if i["id"] not in shown]
        if not rest:
            continue
        its = sorted(rest, key=lambda i: (SOURCE_ORDER.index(i["source"]) if i["source"] in SOURCE_ORDER else 9, i.get("date") or ""))
        parts.append(f"<h2 style='font-size:16px;margin:22px 0 4px'>{e(c)}{' — more' if len(rest) < len(by_comp[c]) else ''} <span style='color:#667085;font-weight:400;font-size:13px'>({len(its)})</span></h2>"
                     "<table width='100%' cellpadding='0' cellspacing='0'>")
        parts += [row(i) for i in its[:25]]
        if len(its) > 25:
            parts.append(f"<tr><td style='padding:6px 0;color:#667085;font-size:12px'>+{len(its) - 25} more on the dashboard</td></tr>")
        parts.append("</table>")
    if failed:
        parts.append(f"<p style='margin-top:22px;color:#b42318;font-size:12px'>{len(failed)} source(s) failed this run: "
                     + e("; ".join(f"{h['entity']} – {h['source']}" for h in failed[:8])) + "</p>")
    parts.append("<p style='margin-top:22px;color:#98a2b3;font-size:11px'>Automated digest of public sources (news, company sites, FDA, ClinicalTrials.gov, PubMed). Headlines and short snippets only; follow links for full content.</p>"
                 "</td></tr></table></td></tr></table></body></html>")
    return "".join(parts)


def render_digest_page(digest, cfg) -> str:
    return render_email(digest, cfg).replace("<head>", f"<head><title>{html.escape(digest['title'])} — {digest['date']}</title>", 1)


def render_text(digest) -> str:
    lines = [f"{digest['title']} — {digest['date']}", ""]
    for i in digest["items"]:
        lines.append(f"[{i['competitor']} · {i['source']}] {i['title']}\n  {i['url']}")
    if not digest["items"]:
        lines.append("No new competitor activity found since the last run.")
    if dashboard_url():
        lines += ["", "Dashboard: " + dashboard_url()]
    return "\n".join(lines)


def send_email(digest, cfg):
    user, pw = os.environ.get("GMAIL_USER"), os.environ.get("GMAIL_APP_PASSWORD")
    to = [a.strip() for a in os.environ.get("DIGEST_RECIPIENTS", "").replace(";", ",").split(",") if a.strip()]
    if not (user and pw and to):
        print("Email skipped: set GMAIL_USER, GMAIL_APP_PASSWORD and DIGEST_RECIPIENTS secrets.")
        return False
    if not digest["items"] and not cfg["settings"]["send_when_empty"]:
        print("Email skipped: no new items and send_when_empty is false.")
        return False
    n = len(digest["items"])
    sig = sum(1 for i in digest["items"] if i.get("signal"))
    msg = MIMEMultipart("alternative")
    msg["Subject"] = f"{digest['title']} · {digest['date']} · {n} new" + (f", {sig} high-signal" if sig else "")
    msg["From"] = email.utils.formataddr((digest["title"], user))
    msg["To"] = user
    msg.attach(MIMEText(render_text(digest), "plain", "utf-8"))
    msg.attach(MIMEText(render_email(digest, cfg), "html", "utf-8"))
    for attempt in range(3):
        try:
            with smtplib.SMTP_SSL("smtp.gmail.com", 465, context=ssl.create_default_context(), timeout=60) as smtp:
                smtp.login(user, pw)
                smtp.sendmail(user, [user] + to, msg.as_string())  # recipients go as Bcc
            print(f"Email sent to {len(to)} recipient(s).")
            return True
        except Exception as ex:  # noqa: BLE001
            print(f"Email attempt {attempt + 1} failed: {ex}", file=sys.stderr)
            time.sleep(10)
    sys.exit("Email failed after 3 attempts")


def build_site():
    out = ROOT / "_site"
    shutil.rmtree(out, ignore_errors=True)
    out.mkdir()
    page = (ROOT / "dashboard.html").read_text()
    if not page.lstrip().lower().startswith("<!doctype html>") or 'name="viewport"' not in page:
        sys.exit("dashboard.html must start with <!doctype html> and include a viewport meta tag")
    (out / "index.html").write_text(page)
    if DATA.exists():
        shutil.copytree(DATA, out / "data", ignore=shutil.ignore_patterns("pages", "email-preview.html"))
    (out / ".nojekyll").write_text("")
    print(f"Site built in {out}")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    r = sub.add_parser("run")
    r.add_argument("--send", action="store_true", help="email the digest")
    r.add_argument("--only", help="limit to competitors/topics whose name contains this text")
    sub.add_parser("build-site")
    sub.add_parser("preview-email")
    a = ap.parse_args()
    if a.cmd == "run":
        digest, cfg = run(a.only)
        send = a.send or os.environ.get("SEND_EMAIL", "").lower() == "true"
        if send:
            send_email(digest, cfg)
    elif a.cmd == "build-site":
        build_site()
    elif a.cmd == "preview-email":
        cfg = load_config()
        latest = sorted((DATA / "digests").glob("20*.json"))
        if not latest:
            sys.exit("No digest yet — run first")
        (DATA / "email-preview.html").write_text(render_email(load_json(latest[-1], {}), cfg))
        print("Wrote data/email-preview.html")


if __name__ == "__main__":
    main()
