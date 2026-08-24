#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
域外法学文献追踪 - 学者发表追踪器（OpenAlex）
对 scholars.json 中的每位学者：
  1. 若未缓存 openalex_id，先搜索作者并校验机构，缓存 ID
  2. 抓取其近 N 天新发文，合并输出 data/scholar_articles.json
本地 --fixture 模式走相同代码路径（不打网络）。
"""
import argparse
import datetime
import json
import os
import sys
import time
import urllib.parse
import urllib.request

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data")
SCHOLARS_PATH = os.path.join(BASE_DIR, "scholars.json")
OUT_PATH = os.path.join(DATA_DIR, "scholar_articles.json")
ERRORS_PATH = os.path.join(DATA_DIR, "scholar_errors.log")
FIXTURE_PATH = os.path.join(BASE_DIR, "tests", "fixture_openalex.json")
UA = "lawecon-hub/1.0 (mailto:user@example.com)"
API = "https://api.openalex.org"


def log_error(msg):
    os.makedirs(DATA_DIR, exist_ok=True)
    stamp = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    with open(ERRORS_PATH, "a", encoding="utf-8") as f:
        f.write("[%s] %s\n" % (stamp, msg))


def http_get(url, timeout=30):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


class Client:
    """真实客户端 + fixture 客户端共用接口。"""

    def __init__(self, fixture_data=None):
        self.fixture = fixture_data

    def get(self, url):
        if self.fixture is not None:
            return self.fixture_lookup(url)
        return http_get(url)

    def fixture_lookup(self, url):
        """fixture 按 URL 前缀/参数匹配。authors?search=X 匹配 search 参数；works?filter=...id:Y 匹配 id。"""
        if "/authors?" in url:
            q = urllib.parse.parse_qs(urllib.parse.urlparse(url).query).get("search", [""])[0]
            entries = self.fixture.get("authors_search", {})
            for name_key, body in entries.items():
                if name_key.lower() == q.lower():
                    return body
            raise LookupError("no fixture for authors search: %s" % q)
        if "/works?" in url:
            # URL 编码后的 filter 里 id 可能是 %3A 形式，解开后匹配
            dec = urllib.parse.unquote(url)
            for id_key, body in self.fixture.get("works", {}).items():
                if "author.id:%s" % id_key in dec:
                    return body
            raise LookupError("no fixture for works query: %s" % url[:120])
        raise LookupError("no fixture for url: %s" % url[:120])


def resolve_author(client, scholar):
    """搜索作者，选 works_count 最高的结果，用机构字符串粗校验。返回 openalex author id 或 None。"""
    url = API + "/authors?" + urllib.parse.urlencode({"search": scholar["name"], "per_page": "5"})
    data = client.get(url)
    results = data.get("results", [])
    if not results:
        return None
    inst = (scholar.get("institution") or "").lower()
    best = None
    # 优先：机构能对上的结果里 works_count 最高
    for r in results:
        aff = " ".join(
            (a.get("institution") or {}).get("display_name", "") or ""
            for a in r.get("affiliations", [])
        ).lower()
        score = _name_close(scholar["name"], r.get("display_name", ""))
        if aff and _inst_match(aff, inst):
            if best is None or (r.get("works_count") or 0) > (best.get("works_count") or 0):
                if score > 0.5:
                    best = r
    if best is None:
        # 兜底：名字高度相似且 works_count 明显领先
        ranked = sorted(results, key=lambda r: (r.get("works_count") or 0), reverse=True)
        top = ranked[0]
        if _name_close(scholar["name"], top.get("display_name", "")) > 0.8:
            best = top
    if best is None:
        return None
    return best.get("id", "").rsplit("/", 1)[-1] or None


def _name_close(a, b):
    a, b = a.lower().strip(), b.lower().strip()
    if a == b:
        return 1.0
    at, bt = set(a.split()), set(b.split())
    if not at or not bt:
        return 0.0
    return len(at & bt) / len(at | bt)


def _inst_match(aff, inst):
    """机构子串粗匹配：取双方第一个词（如 humboldt / toulouse / leeds）。"""
    if not inst:
        return False
    key = inst.split()[0].lower().strip(",.()")
    return key and key in aff


def rebuild_abstract(inverted):
    """OpenAlex abstract_inverted_index → 原文。"""
    if not inverted:
        return ""
    positions = []
    for word, idxs in inverted.items():
        for i in idxs:
            positions.append((i, word))
    positions.sort()
    return " ".join(w for _, w in positions)


def fetch_works(client, author_id, from_date, per_page=25):
    filt = "authorships.author.id:%s,from_publication_date:%s" % (author_id, from_date)
    params = urllib.parse.urlencode({
        "filter": filt,
        "sort": "publication_date:desc",
        "per_page": str(per_page),
    })
    return client.get(API + "/works?" + params)


def work_to_record(w, scholar):
    doi = (w.get("doi") or "").replace("https://doi.org/", "")
    title = w.get("display_name") or ""
    authors = []
    for au in (w.get("authorships") or [])[:8]:
        n = ((au.get("author") or {}).get("display_name") or "").strip()
        if n:
            authors.append(n)
    more = len(w.get("authorships") or []) > 8
    src = ((w.get("primary_location") or {}).get("source") or {}) or {}
    journal = src.get("display_name") or ""
    return {
        "doi": doi,
        "title": title,
        "authors": authors + (["等"] if more else []),
        "journal": journal,
        "journal_id": "",
        "date": w.get("publication_date") or "",
        "abstract": rebuild_abstract(w.get("abstract_inverted_index")),
        "type": w.get("type") or "article",
        "url": ("https://doi.org/" + doi) if doi else ("https://openalex.org/works/" + str(w.get("id", "")).rsplit("/", 1)[-1]),
        "scholar_id": scholar["id"],
        "scholar_name": scholar["name"],
        "scholar_institution": scholar.get("institution") or "",
    }


def crawl(days=365, fixture=False, sleep=0.3):
    fixture_data = None
    if fixture:
        with open(FIXTURE_PATH, encoding="utf-8") as f:
            fixture_data = json.load(f)
    client = Client(fixture_data)

    with open(SCHOLARS_PATH, encoding="utf-8") as f:
        scholars = json.load(f)["scholars"]

    # 已有数据增量合并（按 doi/url 去重）
    existing = {}
    if os.path.exists(OUT_PATH):
        try:
            with open(OUT_PATH, encoding="utf-8") as f:
                old = json.load(f)
            for a in old.get("articles", []):
                existing[a["url"]] = a
        except (ValueError, OSError):
            pass

    cutoff = (datetime.date.today() - datetime.timedelta(days=days)).isoformat()
    resolved, failed = 0, 0
    for s in scholars:
        aid = s.get("openalex_id")
        if not aid:
            try:
                aid = resolve_author(client, s)
            except Exception as e:  # noqa: BLE001
                log_error("resolve error %s: %s" % (s["name"], e))
                aid = None
            if not aid:
                log_error("resolve miss: %s (%s)" % (s["name"], s.get("institution", "")))
                failed += 1
                continue
            s["openalex_id"] = aid  # fixture 模式只改内存，不写回
            resolved += 1
            time.sleep(sleep)
        try:
            data = fetch_works(client, aid, cutoff)
        except Exception as e:  # noqa: BLE001
            log_error("works error %s: %s" % (s["name"], e))
            failed += 1
            continue
        for w in data.get("results", []):
            rec = work_to_record(w, s)
            if rec["title"] and rec["date"]:
                existing[rec["url"]] = rec
        time.sleep(sleep)

    if not fixture and resolved:
        # 写回缓存（真实模式）
        with open(SCHOLARS_PATH, "w", encoding="utf-8") as f:
            json.dump({"scholars": scholars}, f, ensure_ascii=False, indent=2)

    articles = sorted(existing.values(), key=lambda a: a.get("date", ""), reverse=True)
    out = {
        "updated_at": datetime.datetime.now().strftime("%Y-%m-%d %H:%M"),
        "count": len(articles),
        "articles": articles,
    }
    os.makedirs(DATA_DIR, exist_ok=True)
    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    print("scholars resolved=%d new_cache, failed=%d; total articles=%d" % (resolved, failed, len(articles)))
    return 0


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--days", type=int, default=365)
    ap.add_argument("--fixture", action="store_true")
    args = ap.parse_args()
    sys.exit(crawl(days=args.days, fixture=args.fixture))
