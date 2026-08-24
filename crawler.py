#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
域外法学文献追踪 - Crossref 抓取器
仅用 Python 标准库。在 GitHub Actions 上运行真实抓取；
本地可用 --fixture 模式验证管道逻辑。
"""
import argparse
import datetime
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data")
ARTICLES_PATH = os.path.join(DATA_DIR, "articles.json")
ERRORS_PATH = os.path.join(DATA_DIR, "errors.log")
FIXTURE_PATH = os.path.join(BASE_DIR, "tests", "fixture_crossref.json")
UA = "lawecon-hub/1.0 (mailto:user@example.com)"


def log_error(msg):
    os.makedirs(DATA_DIR, exist_ok=True)
    stamp = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    with open(ERRORS_PATH, "a", encoding="utf-8") as f:
        f.write("[%s] %s\n" % (stamp, msg))


def clean_abstract(text):
    """去掉 JATS XML 标签与多余空白。"""
    if not text:
        return ""
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def parse_date(pub):
    """Crossref published/published-online: {'date-parts': [[Y, M, D]]}"""
    if not pub:
        return None
    parts = pub.get("date-parts") or [[None]]
    try:
        p = parts[0]
        y, m, d = p[0], (p[1] if len(p) > 1 else 1), (p[2] if len(p) > 2 else 1)
        if not y:
            return None
        return datetime.date(int(y), int(m or 1), int(d or 1))
    except (TypeError, ValueError, IndexError):
        return None


def fmt_authors(authors):
    """['Hovenkamp H', 'Wright J D'] 之类：姓氏 + 名缩写。"""
    out = []
    for a in authors or []:
        fam = a.get("family") or ""
        given = a.get("given") or ""
        initials = " ".join(p[0] for p in given.split() if p)
        out.append((fam + " " + initials).strip())
    return out


def fetch_journal(issn, cutoff_str, timeout=30):
    params = urllib.parse.urlencode({
        "rows": "100",
        "sort": "published",
        "order": "desc",
        "filter": "from-pub-date:%s,type:journal-article" % cutoff_str,
        "select": "DOI,title,author,container-title,published,published-online,abstract,type",
    })
    url = "https://api.crossref.org/journals/%s/works?%s" % (urllib.parse.quote(issn), params)
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def fixture_response(issn, fixture):
    """fixture: {issn: {"status": 200, "body": {...}} | {"status": 404} | {"status": "timeout"}}"""
    f = fixture.get(issn)
    if f is None:
        return None  # 视为 404
    if f.get("status") == 200:
        return f["body"]
    if f.get("status") == "timeout":
        raise TimeoutError("simulated timeout for %s" % issn)
    raise urllib.error.HTTPError("fixture", 404, "simulated 404", None, None)


def crawl(days=365, fixture=False):
    fixture_data = None
    if fixture:
        with open(FIXTURE_PATH, encoding="utf-8") as f:
            fixture_data = json.load(f)

    with open(os.path.join(BASE_DIR, "journals.json"), encoding="utf-8") as f:
        config = json.load(f)
    journals = [j for j in config["journals"] if j.get("enabled")]

    # 读取已有数据（增量合并）
    existing = {}
    if os.path.exists(ARTICLES_PATH):
        try:
            with open(ARTICLES_PATH, encoding="utf-8") as f:
                old = json.load(f)
            for a in old.get("articles", []):
                existing[a["doi"]] = a
        except (ValueError, OSError):
            pass

    cutoff = datetime.date.today() - datetime.timedelta(days=days)
    cutoff_str = cutoff.isoformat()
    ok, fail = 0, 0
    for j in journals:
        issn = j["issn"]
        try:
            if fixture:
                data = fixture_response(issn, fixture_data)
                if data is None:
                    raise urllib.error.HTTPError("fixture", 404, "no fixture", None, None)
            else:
                data = fetch_journal(issn, cutoff_str)
            items = data.get("message", {}).get("items", [])
        except TimeoutError:
            log_error("timeout: %s (%s)" % (j["name"], issn))
            fail += 1
            continue
        except urllib.error.HTTPError as e:
            log_error("HTTP %s: %s (%s)" % (e.code, j["name"], issn))
            fail += 1
            continue
        except Exception as e:  # noqa: BLE001
            log_error("error %s: %s (%s)" % (e, j["name"], issn))
            fail += 1
            continue

        for item in items:
            doi = (item.get("DOI") or "").lower()
            title = (item.get("title") or [""])[0]
            if not doi or not title:
                continue
            d = parse_date(item.get("published")) or parse_date(item.get("published-online"))
            if d is None or d < cutoff:
                continue
            existing[doi] = {
                "doi": item["DOI"],
                "title": title,
                "authors": fmt_authors(item.get("author")),
                "journal": (item.get("container-title") or [j["name"]])[0],
                "journal_id": j["id"],
                "date": d.isoformat(),
                "abstract": clean_abstract(item.get("abstract")),
                "type": item.get("type") or "journal-article",
                "url": "https://doi.org/" + item["DOI"],
            }
        ok += 1

    articles = sorted(existing.values(), key=lambda a: a["date"], reverse=True)
    # 清理过期文章与非期刊文章（法律评论的 Editorial、书评等）
    articles = [a for a in articles if a["date"] >= cutoff_str and a.get("type") == "journal-article"]
    out = {
        "updated_at": datetime.datetime.now().strftime("%Y-%m-%d %H:%M"),
        "count": len(articles),
        "articles": articles,
    }
    os.makedirs(DATA_DIR, exist_ok=True)
    with open(ARTICLES_PATH, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    print("journals ok=%d fail=%d; total articles=%d" % (ok, fail, len(articles)))
    return 0


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--days", type=int, default=365)
    ap.add_argument("--fixture", action="store_true")
    args = ap.parse_args()
    sys.exit(crawl(days=args.days, fixture=args.fixture))
