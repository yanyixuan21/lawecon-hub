#!/usr/bin/env python3
"""从 data/articles.json 生成研究议题热力图与期刊选稿画像。

输出 data/topics.json：
- heat: 全库高频研究主题词（unigram+bigram，去停用词），供前端渲染热力图
- profiles: 每本期刊的选稿画像（近12月发文量、平均作者数、高频主题词）
"""

import json
import math
import os
import re
import sys
from collections import Counter
from datetime import datetime, timedelta

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data")
ARTICLES_PATH = os.path.join(DATA_DIR, "articles.json")
OUT_PATH = os.path.join(DATA_DIR, "topics.json")

STOPWORDS = set("""
a an the and or of for in on to with without under over between within
is are was were be been being this that these those it its their his her
our your their we you they he she i as at by from into about than then
can could may might must should would will shall do does did not no nor
but if so such than there here when where which who whom whose what how
why all any both each few more most other some own same s t don now
new study paper article research analysis case law review journal issue
volume number part press university cambridge oxford oxfordrutledge
using based approach we also however thus therefore moreover furthermore
whether while since because although though yet rather either neither
first second third two three four five one examine explores discusses
find show shows found evidence effect effects impact results result
argue argues argued suggest suggests provides provide examines
has have had also using used use toward however whether
model models legal policy court courts case cases study studies
front frontmatter matter editorial board mastcard table contents
article paper research empirical analysis
""".split())


def tokenize(text):
    words = re.findall(r"[a-zA-Z][a-zA-Z\-]{2,}", text.lower())
    return [w for w in words if w not in STOPWORDS and len(w) > 2]


def bigrams(tokens):
    return [tokens[i] + " " + tokens[i + 1] for i in range(len(tokens) - 1)]


def meaningful_bigrams(bigrams_counter, unigrams_counter, total_docs):
    """只保留两个成分都不是烂词、且频次达标的 bigram。"""
    keep = []
    for bg, c in bigrams_counter.most_common(400):
        if c < 3:
            break
        w1, w2 = bg.split()
        if unigrams_counter.get(w1, 0) > total_docs * 0.6 or unigrams_counter.get(w2, 0) > total_docs * 0.6:
            continue  # 成分词过泛（几乎每篇都出现），bigram 无信息量
        keep.append((bg, c))
    return keep


def main():
    with open(ARTICLES_PATH, encoding="utf-8") as f:
        data = json.load(f)
    articles = data.get("articles", [])

    with open(os.path.join(BASE_DIR, "journals.json"), encoding="utf-8") as f:
        journals = {j["id"]: j for j in json.load(f)["journals"]}

    # 近12个月子集
    cutoff = (datetime.now() - timedelta(days=365)).strftime("%Y-%m-%d")
    recent = [a for a in articles if a.get("date", "") >= cutoff]

    # ---- 全库热力图 ----
    uni = Counter()
    bi = Counter()
    for a in recent:
        text = a.get("title", "") or ""
        if a.get("abstract"):
            # 摘要权重低一点：标题算全文，摘要只取前300字符避免淹没标题词
            text += " " + a["abstract"][:300]
        toks = tokenize(text)
        uni.update(toks)
        bi.update(bigrams(toks))

    total = max(len(recent), 1)
    top_uni = [(w, c) for w, c in uni.most_common(300) if c >= 4][:150]
    top_bi = meaningful_bigrams(bi, uni, total)[:80]

    # bigram 与包含它的泛 unigram 去重：若 unigram 只是 bigram 成分的常见壳则降权
    bi_words = set()
    for bg, _ in top_bi:
        bi_words.update(bg.split())

    heat = [{"term": t, "count": c} for t, c in top_bi]
    heat += [{"term": t, "count": c} for t, c in top_uni if t not in bi_words]
    heat.sort(key=lambda x: -x["count"])
    heat = heat[:70]

    # ---- 期刊画像 ----
    profiles = {}
    by_journal = {}
    for a in recent:
        by_journal.setdefault(a.get("journal_id", ""), []).append(a)

    for jid, arts in by_journal.items():
        ju = Counter()
        jb = Counter()
        author_counts = []
        for a in arts:
            toks = tokenize(a.get("title", "") or "")
            ju.update(toks)
            jb.update(bigrams(toks))
            if a.get("authors"):
                author_counts.append(len(a["authors"]))
        terms = [(t, c) for t, c in jb.most_common(30) if c >= 2][:8]
        seen_w = set()
        for t, c in ju.most_common(60):
            if len(terms) >= 10:
                break
            if t in seen_w or c < 3:
                continue
            terms.append((t, c))
        profiles[jid] = {
            "count": len(arts),
            "avg_authors": round(sum(author_counts) / len(author_counts), 1) if author_counts else 0,
            "terms": [{"term": t, "count": c} for t, c in terms[:10]],
        }

    out = {
        "updated_at": datetime.now().strftime("%Y-%m-%d %H:%M"),
        "doc_count": total,
        "heat": heat,
        "profiles": profiles,
    }
    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    print("topics.json: %d heat terms, %d journal profiles" % (len(heat), len(profiles)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
