#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""校验 journals.json 中每个 ISSN 在 Crossref 是否能解析出对应期刊。在 GitHub Actions 或本地跑。"""
import json
import os
import sys
import urllib.parse
import urllib.request

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
UA = "lawecon-hub/1.0 (mailto:user@example.com)"


def main():
    with open(os.path.join(BASE_DIR, "journals.json"), encoding="utf-8") as f:
        config = json.load(f)
    bad = 0
    for j in config["journals"]:
        issn = j["issn"]
        url = "https://api.crossref.org/journals/" + urllib.parse.quote(issn)
        req = urllib.request.Request(url, headers={"User-Agent": UA})
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                title = json.loads(resp.read().decode("utf-8"))["message"]["title"]
            print("OK   %-12s %-55s -> %s" % (issn, j["name"], title))
        except Exception as e:  # noqa: BLE001
            bad += 1
            print("FAIL %-12s %-55s -> %s" % (issn, j["name"], e))
    if bad:
        print("\n%d 个 ISSN 校验失败，请到 https://www.crossref.org 逐个检索正确 ISSN 后更新 journals.json" % bad)
    return 0


if __name__ == "__main__":
    sys.exit(main())
