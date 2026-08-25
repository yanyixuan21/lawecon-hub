/* 域外研究动态追踪 - 前端逻辑（零依赖） */
(function () {
  "use strict";

  var PAGE_SIZE = 200;
  var state = {
    tab: "policy",       // policy | journals | scholars | pubs | heat | events | interviews
    q: "",
    cat: "",
    journal: "",
    shown: PAGE_SIZE,
    scholarShown: PAGE_SIZE,
    scholarMode: "all",    // all | scholar
    scholarFilter: "",     // scholar id
    favOnly: false,
  };

  var el = {
    search: document.getElementById("search"),
    journalFilter: document.getElementById("journal-filter"),
    catFilter: document.getElementById("cat-filter"),
    list: document.getElementById("list"),
    loading: document.getElementById("loading"),
    empty: document.getElementById("empty"),
    count: document.getElementById("result-count"),
    updatedAt: document.getElementById("updated-at"),
    loadMore: document.getElementById("load-more"),
    hero: document.getElementById("hero"),
    heroClose: document.getElementById("hero-close"),
    journalCount: document.getElementById("journal-count"),
    scholarCount: document.getElementById("scholar-count"),
    tabJournals: document.getElementById("tab-journals"),
    tabScholars: document.getElementById("tab-scholars"),
    tabPubs: document.getElementById("tab-pubs"),
    tabHeat: document.getElementById("tab-heat"),
    viewHeat: document.getElementById("view-heat"),
    heatCloud: document.getElementById("heat-cloud"),
    heatCount: document.getElementById("heat-count"),
    heatProfiles: document.getElementById("heat-profiles"),
    tabEvents: document.getElementById("tab-events"),
    tabInterviews: document.getElementById("tab-interviews"),
    tabDigest: document.getElementById("tab-digest"),
    tabPolicy: document.getElementById("tab-policy"),
    viewDigest: document.getElementById("view-digest"),
    digestCount: document.getElementById("digest-count"),
    digestList: document.getElementById("digest-list"),
    digestEmpty: document.getElementById("digest-empty"),
    viewInterviews: document.getElementById("view-interviews"),
    interviewCount: document.getElementById("interview-count"),
    interviewList: document.getElementById("interview-list"),
    interviewEmpty: document.getElementById("interview-empty"),
    viewPolicy: document.getElementById("view-policy"),
    policyCount: document.getElementById("policy-count"),
    policyCats: document.getElementById("policy-cats"),
    policyList: document.getElementById("policy-list"),
    policyEmpty: document.getElementById("policy-empty"),
    viewJournals: document.getElementById("view-journals"),
    viewScholars: document.getElementById("view-scholars"),
    viewPubs: document.getElementById("view-pubs"),
    viewEvents: document.getElementById("view-events"),
    pubCount: document.getElementById("pub-count"),
    pubUpdatedAt: document.getElementById("pub-updated-at"),
    pubList: document.getElementById("pub-list"),
    pubEmpty: document.getElementById("pub-empty"),
    eventCount: document.getElementById("event-count"),
    eventList: document.getElementById("event-list"),
    eventEmpty: document.getElementById("event-empty"),
    scholarGrid: document.getElementById("scholar-grid"),
    scholarList: document.getElementById("scholar-list"),
    scholarEmpty: document.getElementById("scholar-empty"),
    scholarCountText: document.getElementById("scholar-count-text"),
    scholarUpdatedAt: document.getElementById("scholar-updated-at"),
    scholarLoadMore: document.getElementById("scholar-load-more"),
    scholarMode: document.getElementById("scholar-mode"),
    favToggle: document.getElementById("fav-toggle"),
    searchBtn: document.getElementById("search-btn"),
    searchClear: document.getElementById("search-clear"),
    viewSearch: document.getElementById("view-search"),
    searchCount: document.getElementById("search-count"),
    searchEmpty: document.getElementById("search-empty"),
    searchGroups: document.getElementById("search-groups"),
  };

  var journals = {}; // id -> journal config
  var scholars = []; // scholar configs
  var scholarMap = {};
  var articles = [];
  var scholarArticles = [];
  var events = [];
  var interviews = [];
  var digests = [];
  var topicsData = null;
  var policyItems = [];
  var policyCats = [];
  var policyCat = "";
  var typeNames = {
    interview: "访谈",
    conversation: "对话",
    dialogue: "对谈",
    lecture: "演讲/讲座",
    memorial: "纪念文章",
    classic: "经典对谈",
    podcast: "播客",
  };
  var catNames = {
    competition: "竞争法",
    "law-econ": "法经济学",
    io: "产业组织",
    "law-review": "法律评论",
  };

  /* ---------- 收藏（localStorage） ---------- */

  function getFavs() {
    try {
      return JSON.parse(localStorage.getItem("lawecon_favorites") || "[]");
    } catch (e) { return []; }
  }
  function isFav(a) {
    var key = a.doi || a.url;
    return getFavs().indexOf(key) !== -1;
  }
  function toggleFav(a) {
    var favs = getFavs();
    var key = a.doi || a.url;
    var i = favs.indexOf(key);
    if (i === -1) { favs.push(key); } else { favs.splice(i, 1); }
    try { localStorage.setItem("lawecon_favorites", JSON.stringify(favs)); } catch (e) {}
  }

  /* ---------- 工具 ---------- */

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function restoreState() {
    try {
      var saved = JSON.parse(localStorage.getItem("lawecon-filter") || "{}");
      if (typeof saved.q === "string") { state.q = saved.q; el.search.value = saved.q; }
      if (saved.cat) { state.cat = saved.cat; }
      if (saved.journal) { state.journal = saved.journal; }
    } catch (e) { /* ignore */ }
  }

  function saveState() {
    try {
      localStorage.setItem("lawecon-filter", JSON.stringify({
        q: state.q, cat: state.cat, journal: state.journal,
      }));
    } catch (e) { /* ignore */ }
  }

  function matchKeywords(a, extra) {
    if (!state.q.trim()) return true;
    var hay = (a.title + " " + a.journal + " " + a.authors.join(" ") + " " + (extra || "")).toLowerCase();
    var terms = state.q.toLowerCase().split(/\s+/).filter(Boolean);
    return terms.every(function (t) { return hay.indexOf(t) !== -1; });
  }

  /* ---------- 学术外链（Connected Papers / Semantic Scholar） ---------- */

  function extLinks(a) {
    if (!a.doi) return "";
    var d = encodeURIComponent(a.doi);
    return (
      '<span class="ext-links">' +
      '<a href="https://www.connectedpapers.com/search?q=' + d + '" target="_blank" rel="noopener" title="在 Connected Papers 查看引用图谱" aria-label="Connected Papers">CP</a>' +
      '<a href="https://www.semanticscholar.org/search?q=' + d + '" target="_blank" rel="noopener" title="在 Semantic Scholar 查看引用与相关文献" aria-label="Semantic Scholar">S2</a>' +
      "</span>"
    );
  }

  /* ---------- 期刊板块 ---------- */

  function filter() {
    return articles.filter(function (a) {
      if (state.favOnly && !isFav(a)) return false;
      if (state.cat && journals[a.journal_id] && journals[a.journal_id].category !== state.cat) return false;
      if (state.journal && a.journal_id !== state.journal) return false;
      return matchKeywords(a);
    });
  }

  function card(a) {
    var j = journals[a.journal_id] || {};
    var cat = j.category || "";
    var badge = cat ? '<span class="badge ' + cat + '">' + catNames[cat] + "</span>" : "";
    var authors = a.authors.length ? esc(a.authors.join(", ")) : "—";
    var absBtn = a.abstract ? '<button class="abstract-toggle" type="button">摘要 ▾</button>' : "";
    var abs = a.abstract ? '<p class="abstract hidden">' + esc(a.abstract) + "</p>" : "";
    var star = isFav(a) ? "★" : "☆";
    return (
      '<article class="card" data-key="' + esc(a.doi || a.url) + '">' +
      '<button class="fav-star' + (isFav(a) ? " on" : "") + '" type="button" aria-label="收藏">' + star + "</button>" +
      '<div class="card-top">' + badge + '<span class="date">' + esc(a.date) + "</span>" + extLinks(a) + "</div>" +
      '<h3><a href="' + esc(a.url) + '" target="_blank" rel="noopener">' + esc(a.title) + "</a></h3>" +
      '<div class="journal-name">' + esc(a.journal) + "</div>" +
      '<div class="authors">' + authors + "</div>" +
      absBtn + abs +
      "</article>"
    );
  }

  function bindCardEvents(root) {
    // 摘要展开
    var toggles = root.querySelectorAll(".abstract-toggle");
    for (var i = 0; i < toggles.length; i++) {
      toggles[i].addEventListener("click", (function (btn) {
        return function () {
          var abs = btn.nextElementSibling;
          var open = !abs.classList.contains("hidden");
          abs.classList.toggle("hidden", open);
          btn.textContent = open ? "摘要 ▾" : "摘要 ▴";
        };
      })(toggles[i]));
    }
    // 收藏星标
    var stars = root.querySelectorAll(".fav-star");
    for (var k = 0; k < stars.length; k++) {
      stars[k].addEventListener("click", (function (btn) {
        return function () {
          var key = btn.closest(".card").dataset.key;
          var a = findByKey(key);
          if (a) {
            toggleFav(a);
            btn.classList.toggle("on", isFav(a));
            btn.textContent = isFav(a) ? "★" : "☆";
            if (state.favOnly) renderJournals();
          }
        };
      })(stars[k]));
    }
  }

  function findByKey(key) {
    for (var i = 0; i < articles.length; i++) {
      if ((articles[i].doi || articles[i].url) === key) return articles[i];
    }
    for (var j = 0; j < scholarArticles.length; j++) {
      if ((scholarArticles[j].doi || scholarArticles[j].url) === key) return scholarArticles[j];
    }
    return null;
  }

  function renderJournals() {
    var list = filter();
    el.count.textContent = state.favOnly
      ? "收藏中 " + list.length + " 篇"
      : "共 " + list.length + " 篇";
    el.updatedAt.textContent = dataUpdatedAt ? "数据更新于 " + dataUpdatedAt : "";

    var slice = list.slice(0, state.shown);
    el.list.innerHTML = slice.map(card).join("");
    el.empty.classList.toggle("hidden", list.length !== 0);
    el.loadMore.classList.toggle("hidden", state.shown >= list.length);
    bindCardEvents(el.list);
  }

  function applyFilters() { state.shown = PAGE_SIZE; saveState(); renderJournals(); }

  function initJournalFilter() {
    var seen = {};
    var ids = [];
    articles.forEach(function (a) {
      if (journals[a.journal_id] && !seen[a.journal_id]) {
        seen[a.journal_id] = true; ids.push(a.journal_id);
      }
    });
    ids.sort(function (x, y) {
      return (journals[x].name_cn || journals[x].name).localeCompare(journals[y].name_cn || journals[y].name, "zh");
    });
    ids.forEach(function (id) {
      var opt = document.createElement("option");
      opt.value = id;
      opt.textContent = journals[id].name_cn || journals[id].name;
      el.journalFilter.appendChild(opt);
    });
    el.journalFilter.value = state.journal;
  }

  function initCatButtons() {
    var btns = el.catFilter.querySelectorAll(".cat-btn:not(.fav-toggle)");
    for (var i = 0; i < btns.length; i++) {
      if (btns[i].dataset.cat === state.cat) {
        var act = el.catFilter.querySelector(".cat-btn.active");
        if (act && act !== btns[i]) act.classList.remove("active");
        btns[i].classList.add("active");
      }
      btns[i].addEventListener("click", (function (btn) {
        return function () {
          var act = el.catFilter.querySelector(".cat-btn.active");
          if (act) act.classList.remove("active");
          btn.classList.add("active");
          state.cat = btn.dataset.cat;
          applyFilters();
        };
      })(btns[i]));
    }
  }

  /* ---------- 学者板块 ---------- */

  var scholarDataUpdatedAt = "";

  function scholarCardHTML(s, n) {
    var tierNames = { A: "核心", B: "重要", D: "数据合规" };
    var tierClass = { A: "tier-a", B: "tier-b", D: "tier-d" };
    return (
      '<button class="scholar-card' + (state.scholarFilter === s.id ? " selected" : "") + '" data-id="' + esc(s.id) + '" type="button">' +
      '<div class="scholar-head">' +
      '<span class="scholar-name">' + esc(s.name) + "</span>" +
      '<span class="tier ' + (tierClass[s.tier] || "") + '">' + (tierNames[s.tier] || "") + "</span>" +
      "</div>" +
      '<div class="scholar-inst">' + esc(s.institution) + "</div>" +
      '<div class="scholar-focus">' + esc(s.focus) + "</div>" +
      (n > 0 ? '<span class="scholar-works">' + n + " 篇近期发文</span>" : "") +
      "</button>"
    );
  }

  function worksCountByScholar() {
    var m = {};
    scholarArticles.forEach(function (a) {
      if (a.scholar_id) m[a.scholar_id] = (m[a.scholar_id] || 0) + 1;
    });
    return m;
  }

  function renderScholarGrid() {
    var counts = worksCountByScholar();
    var qs = state.q.trim().toLowerCase();
    var list = scholars.filter(function (s) {
      if (qs) {
        var hay = (s.name + " " + s.institution + " " + s.focus).toLowerCase();
        if (hay.indexOf(qs) === -1) return false;
      }
      return true;
    });
    el.scholarGrid.innerHTML = list.map(function (s) {
      return scholarCardHTML(s, counts[s.id] || 0);
    }).join("");
    var cards = el.scholarGrid.querySelectorAll(".scholar-card");
    for (var i = 0; i < cards.length; i++) {
      cards[i].addEventListener("click", (function (c) {
        return function () {
          if (state.scholarFilter === c.dataset.id) {
            state.scholarFilter = ""; // 再点一次取消
          } else {
            state.scholarFilter = c.dataset.id;
            state.scholarMode = "all";
            updateModeButtons();
          }
          state.scholarShown = PAGE_SIZE;
          renderScholars();
        };
      })(cards[i]));
    }
  }

  function filterScholarArticles() {
    return scholarArticles.filter(function (a) {
      if (state.favOnly && !isFav(a)) return false;
      if (state.scholarFilter && a.scholar_id !== state.scholarFilter) return false;
      return matchKeywords(a, a.scholar_name);
    });
  }

  function scholarArticleCard(a) {
    var cat = "law-econ"; // 学者文章统一用学者徽章
    var authors = a.authors.length ? esc(a.authors.join(", ")) : "—";
    var absBtn = a.abstract ? '<button class="abstract-toggle" type="button">摘要 ▾</button>' : "";
    var abs = a.abstract ? '<p class="abstract hidden">' + esc(a.abstract) + "</p>" : "";
    var star = isFav(a) ? "★" : "☆";
    return (
      '<article class="card" data-key="' + esc(a.doi || a.url) + '">' +
      '<button class="fav-star' + (isFav(a) ? " on" : "") + '" type="button" aria-label="收藏">' + star + "</button>" +
      '<div class="card-top">' +
      '<span class="badge ' + cat + '">' + esc(a.scholar_name) + "</span>" +
      '<span class="date">' + esc(a.date) + "</span>" + extLinks(a) + "</div>" +
      '<h3><a href="' + esc(a.url) + '" target="_blank" rel="noopener">' + esc(a.title) + "</a></h3>" +
      '<div class="journal-name">' + esc(a.journal || "—") + "</div>" +
      '<div class="authors">' + authors + "</div>" +
      absBtn + abs +
      "</article>"
    );
  }

  function renderScholars() {
    el.scholarGrid.classList.toggle("hidden", state.scholarMode !== "scholar");
    var list = filterScholarArticles();
    el.scholarCountText.textContent = state.favOnly
      ? "收藏中 " + list.length + " 篇"
      : (state.scholarFilter
        ? "「" + (scholarMap[state.scholarFilter] ? scholarMap[state.scholarFilter].name : "") + "」近期 " + list.length + " 篇"
        : "共 " + list.length + " 篇");
    el.scholarUpdatedAt.textContent = scholarDataUpdatedAt ? "数据更新于 " + scholarDataUpdatedAt : "";

    var slice = list.slice(0, state.scholarShown);
    el.scholarList.innerHTML = slice.map(scholarArticleCard).join("");
    el.scholarEmpty.classList.toggle("hidden", list.length !== 0);
    el.scholarLoadMore.classList.toggle("hidden", state.scholarShown >= list.length);
    bindCardEvents(el.scholarList);
    renderScholarGrid();
  }

  function updateModeButtons() {
    var btns = el.scholarMode.querySelectorAll(".mode-btn");
    for (var i = 0; i < btns.length; i++) {
      btns[i].classList.toggle("active", btns[i].dataset.mode === state.scholarMode);
    }
  }

  function initScholarMode() {
    var btns = el.scholarMode.querySelectorAll(".mode-btn");
    for (var i = 0; i < btns.length; i++) {
      btns[i].addEventListener("click", (function (btn) {
        return function () {
          state.scholarMode = btn.dataset.mode;
          if (btn.dataset.mode === "all") { state.scholarFilter = ""; }
          updateModeButtons();
          state.scholarShown = PAGE_SIZE;
          renderScholars();
        };
      })(btns[i]));
    }
  }

  /* ---------- 期刊动态板块 ---------- */

  function pubRowHTML(a) {
    var fav = isFav(a);
    return (
      '<a class="pub-row" href="' + esc(a.url) + '" target="_blank" rel="noopener">' +
      (fav ? '<span class="pub-fav">★</span>' : '') +
      '<span class="pub-title">' + esc(a.title) + "</span>" +
      '<span class="pub-date">' + esc(a.date) + "</span>" +
      "</a>"
    );
  }

  function renderPubs() {
    var qs = state.q.trim().toLowerCase();
    var rows = [];
    var ids = [];
    var seen = {};
    articles.forEach(function (a) {
      if (journals[a.journal_id] && !seen[a.journal_id]) {
        seen[a.journal_id] = true; ids.push(a.journal_id);
      }
    });
    ids.sort(function (x, y) {
      var ax = articles.filter(function (a) { return a.journal_id === x; }).length;
      var ay = articles.filter(function (a) { return a.journal_id === y; }).length;
      return ay - ax;
    });
    ids.forEach(function (id) {
      var j = journals[id];
      var jArts = articles.filter(function (a) {
        if (a.journal_id !== id) return false;
        if (state.favOnly && !isFav(a)) return false;
        if (state.cat && j.category !== state.cat) return false;
        if (!matchKeywords(a)) return false;
        return true;
      });
      if (!jArts.length) return;
      if (qs) {
        var hay = (j.name + " " + (j.name_cn || "") + " " + (j.category || "")).toLowerCase();
        var jMatch = hay.indexOf(qs) !== -1;
        if (!jMatch) {
          // 期刊名不匹配时仅当有匹配文章才显示
        }
      }
      var cat = j.category || "";
      var html =
        '<div class="pub-group" data-id="' + esc(id) + '">' +
        '<div class="pub-group-head">' +
        '<span class="pub-group-name">' + esc(j.name_cn || j.name) + "</span>" +
        '<span class="pub-group-sub">' + esc(j.name) + "</span>" +
        (cat ? '<span class="badge ' + cat + '">' + catNames[cat] + "</span>" : "") +
        '<span class="pub-group-count">' + jArts.length + " 篇</span>" +
        "</div>" +
        jArts.slice(0, 5).map(pubRowHTML).join("") +
        (jArts.length > 5 ? '<div class="pub-more">仅显示最近 5 篇，可在「文献动态」中查看全部</div>' : "") +
        "</div>";
      rows.push(html);
    });
    el.pubCount.textContent = rows.length ? "共 " + rows.length + " 本期刊有新文章" : "";
    el.pubUpdatedAt.textContent = dataUpdatedAt ? "数据更新于 " + dataUpdatedAt : "";
    el.pubList.innerHTML = rows.join("");
    el.pubEmpty.classList.toggle("hidden", rows.length !== 0);
  }

  /* ---------- 会议与征稿板块 ---------- */

  function eventStatus(e) {
    if (e.deadline) {
      var d = new Date(e.deadline + "T23:59:59");
      if (!isNaN(d) && d < new Date()) return "closed";
    }
    return e.status === "closed" ? "closed" : "open";
  }

  function daysLeft(e) {
    var d = new Date(e.start + "T00:00:00");
    if (isNaN(d)) return null;
    return Math.ceil((d - new Date()) / 86400000);
  }

  function eventCardHTML(e) {
    var st = eventStatus(e);
    var stLabel = st === "open" ? "征稿中" : "已截止/已举办";
    var stClass = st === "open" ? "ev-open" : "ev-closed";
    var dl = st === "open" && e.deadline ? esc(e.deadline) + " 截稿" : "";
    if (st === "open" && !e.deadline && e.deadline_note) dl = "截稿：待公布";
    if (st === "closed" && e.deadline_note) dl = esc(e.deadline_note);
    var fields = (e.fields || []).map(function (f) {
      return '<span class="ev-field">' + esc(f) + "</span>";
    }).join("");
    return (
      '<article class="ev-card ' + stClass + '">' +
      '<div class="ev-top">' +
      '<span class="ev-type">' + esc(e.type === "forum" ? "论坛" : "学术会议") + "</span>" +
      '<span class="ev-status">' + stLabel + "</span>" +
      '<span class="ev-region">' + esc(e.region || "") + "</span>" +
      "</div>" +
      '<h3 class="ev-name">' + esc(e.name_cn || e.name_en) + "</h3>" +
      '<div class="ev-name-en">' + esc(e.name_en) + "</div>" +
      '<div class="ev-meta"><span>主办</span>' + esc(e.organizer || "—") + "</div>" +
      '<div class="ev-meta"><span>地点</span>' + esc(e.location || "—") + "</div>" +
      '<div class="ev-meta"><span>时间</span>' + esc(e.dates) + "</div>" +
      (dl ? '<div class="ev-deadline">' + dl + "</div>" : "") +
      '<div class="ev-fields">' + fields + "</div>" +
      '<p class="ev-note">' + esc(e.note || "") + "</p>" +
      '<a class="ev-link" href="' + esc(e.url) + '" target="_blank" rel="noopener">查看官方公告 →</a>' +
      "</article>"
    );
  }

  function renderEvents() {
    var qs = state.q.trim().toLowerCase();
    var list = events.filter(function (e) {
      if (qs) {
        var hay = (e.name_cn + " " + e.name_en + " " + e.organizer + " " + e.location + " " + (e.fields || []).join(" ")).toLowerCase();
        if (hay.indexOf(qs) === -1) return false;
      }
      return true;
    });
    // 征稿中在前，按会议开始日期升序；已截止在后，倒序
    list.sort(function (x, y) {
      var sx = eventStatus(x) === "open" ? 0 : 1;
      var sy = eventStatus(y) === "open" ? 0 : 1;
      if (sx !== sy) return sx - sy;
      return sx === 0
        ? new Date(x.start) - new Date(y.start)
        : new Date(y.start) - new Date(x.start);
    });
    var open = list.filter(function (e) { return eventStatus(e) === "open"; }).length;
    el.eventCount.textContent = open ? "开放征稿中的会议（" + open + "）" : (list.length ? "共 " + list.length + " 个会议" : "");
    el.eventList.innerHTML = list.map(eventCardHTML).join("");
    el.eventEmpty.classList.toggle("hidden", list.length !== 0);
  }

  /* ---------- 访谈与对话板块 ---------- */

  function interviewCardHTML(it) {
    var t = it.type || "interview";
    var topics = (it.topics || []).map(function (t2) {
      return '<span class="ev-field">' + esc(t2) + "</span>";
    }).join("");
    var scholarLink = "";
    if (it.scholar) {
      scholarLink = '<div class="ev-meta"><span>学者</span>' + esc(it.scholar) +
        (it.scholar_id && scholarMap[it.scholar_id] ? '（已收录于学者名录）' : '') + "</div>";
    }
    return (
      '<article class="ev-card ev-open">' +
      '<div class="ev-top">' +
      '<span class="ev-type">' + esc(typeNames[t] || t) + "</span>" +
      '<span class="ev-status">' + esc(it.lang === "zh" ? "中文" : it.lang === "en" ? "英文" : (it.lang || "")) + "</span>" +
      '<span class="ev-region">' + esc(it.date || "") + "</span>" +
      "</div>" +
      '<h3 class="ev-name">' + esc(it.title) + "</h3>" +
      (it.scholar ? '<div class="ev-meta"><span>人物</span>' + esc(it.scholar) + (it.institution ? ' · ' + esc(it.institution) : "") + "</div>" : "") +
      '<div class="ev-meta"><span>来源</span>' + esc(it.source || "—") + "</div>" +
      (topics ? '<div class="ev-fields">' + topics + "</div>" : "") +
      (it.note ? '<p class="ev-note">' + esc(it.note) + "</p>" : "") +
      '<a class="ev-link" href="' + esc(it.url) + '" target="_blank" rel="noopener">阅读全文 →</a>' +
      "</article>"
    );
  }

  function renderInterviews() {
    var qs = state.q.trim().toLowerCase();
    var list = interviews.filter(function (it) {
      if (qs) {
        var hay = (it.title + " " + (it.scholar || "") + " " + (it.institution || "") + " " + (it.source || "") + " " + (it.topics || []).join(" ") + " " + (it.note || "")).toLowerCase();
        if (hay.indexOf(qs) === -1) return false;
      }
      return true;
    });
    list.sort(function (x, y) { return (y.date || "").localeCompare(x.date || ""); });
    el.interviewCount.textContent = list.length ? "共 " + list.length + " 篇" : "";
    el.interviewList.innerHTML = list.map(interviewCardHTML).join("");
    el.interviewEmpty.classList.toggle("hidden", list.length !== 0);
  }

  /* ---------- 平台治理板块 ---------- */

  var policyCatMap = {};

  function policyCardHTML(it) {
    var cat = policyCatMap[it.category] || { name: it.category };
    var tags = (it.tags || []).map(function (t) {
      return '<span class="ev-field">' + esc(t) + "</span>";
    }).join("");
    return (
      '<article class="ev-card ev-open">' +
      '<div class="ev-top">' +
      '<span class="ev-type">' + esc(cat.name) + "</span>" +
      '<span class="ev-region">' + esc(it.region || "") + "</span>" +
      '<span class="ev-status">' + esc(it.date || "") + "</span>" +
      "</div>" +
      '<h3 class="ev-name">' + esc(it.title) + "</h3>" +
      '<div class="ev-meta"><span>机构</span>' + esc(it.authority || "—") + "</div>" +
      (tags ? '<div class="ev-fields">' + tags + "</div>" : "") +
      (it.note ? '<p class="ev-note">' + esc(it.note) + "</p>" : "") +
      '<a class="ev-link" href="' + esc(it.url) + '" target="_blank" rel="noopener">查看官方来源 →</a>' +
      "</article>"
    );
  }

  function initPolicyCats() {
    policyCatMap = {};
    policyCats.forEach(function (c) { policyCatMap[c.id] = c; });
    var btns = ['<button class="cat-btn' + (policyCat === "" ? " active" : "") + '" data-pcat="">全部</button>'];
    policyCats.forEach(function (c) {
      btns.push('<button class="cat-btn' + (policyCat === c.id ? " active" : "") + '" data-pcat="' + esc(c.id) + '">' + esc(c.name) + "</button>");
    });
    el.policyCats.innerHTML = btns.join("");
    el.policyCats.querySelectorAll(".cat-btn").forEach(function (b) {
      b.addEventListener("click", function () {
        policyCat = b.getAttribute("data-pcat") || "";
        el.policyCats.querySelectorAll(".cat-btn").forEach(function (x) { x.classList.remove("active"); });
        b.classList.add("active");
        renderPolicy();
      });
    });
  }

  function renderPolicy() {
    var qs = state.q.trim().toLowerCase();
    var list = policyItems.filter(function (it) {
      if (policyCat && it.category !== policyCat) return false;
      if (qs) {
        var hay = (it.title + " " + (it.region || "") + " " + (it.authority || "") + " " + (it.tags || []).join(" ") + " " + (it.note || "")).toLowerCase();
        if (hay.indexOf(qs) === -1) return false;
      }
      return true;
    });
    list.sort(function (x, y) { return (y.date || "").localeCompare(x.date || ""); });
    el.policyCount.textContent = list.length ? "共 " + list.length + " 条监管动态" : "";
    el.policyList.innerHTML = list.map(policyCardHTML).join("");
    el.policyEmpty.classList.toggle("hidden", list.length !== 0);
  }


  /* ---------- 本周精读板块 ---------- */

  function renderDigest() {
    var qs = state.q.trim().toLowerCase();
    var list = digests.filter(function (it) {
      if (!qs) return true;
      var hay = (it.title + " " + (it.title_cn || "") + " " + (it.authors || []).join(" ") + " " + (it.journal || "") + " " + (it.core || "") + " " + (it.framework || "") + " " + (it.tags || []).join(" ")).toLowerCase();
      return hay.indexOf(qs) !== -1;
    });
    list.sort(function (x, y) { return (y.date || "").localeCompare(x.date || ""); });
    el.digestCount.textContent = list.length ? "共 " + list.length + " 篇精选精读" : "";
    el.digestList.innerHTML = list.map(digestCardHTML).join("");
    el.digestEmpty.classList.toggle("hidden", list.length !== 0);
  }

  function digestCardHTML(it) {
    var authors = (it.authors || []).join(", ");
    var tags = (it.tags || []).map(function (t) {
      return '<span class="event-tag">' + esc(t) + "</span>";
    }).join("");
    var doiLink = it.doi ? ' <a class="card-link" href="https://doi.org/' + esc(it.doi) + '" target="_blank" rel="noopener">原文 ↗</a>' : "";
    return (
      '<article class="digest-card">' +
      '<div class="digest-head">' +
      '<h3 class="digest-title">' + esc(it.title) + "</h3>" +
      '<p class="digest-title-cn">' + esc(it.title_cn || "") + "</p>" +
      '<p class="digest-meta">' + esc(authors) + " · " + esc(it.journal || "") + " · " + esc((it.date || "").slice(0, 10)) + doiLink + "</p>" +
      "</div>" +
      '<div class="digest-body">' +
      '<p class="digest-core"><span class="digest-label">核心观点</span>' + esc(it.core || "") + "</p>" +
      '<p class="digest-framework"><span class="digest-label">论证框架</span>' + esc(it.framework || "") + "</p>" +
      "</div>" +
      (tags ? '<div class="digest-tags">' + tags + "</div>" : "") +
      "</article>"
    );
  }

  /* ---------- 议题热力板块 ---------- */


  function heatTier(c, maxC) {
    // 8 级 tier，1=最低频 8=最高频
    if (maxC <= 1) return 4;
    var r = c / maxC;
    if (r > 0.85) return 8;
    if (r > 0.65) return 7;
    if (r > 0.50) return 6;
    if (r > 0.38) return 5;
    if (r > 0.28) return 4;
    if (r > 0.18) return 3;
    if (r > 0.10) return 2;
    return 1;
  }

  function renderHeat() {
    if (!topicsData || !topicsData.heat || !topicsData.heat.length) {
      el.heatCloud.innerHTML = '<p class="muted">议题数据生成中，请稍后再来。</p>';
      el.heatProfiles.innerHTML = "";
      return;
    }
    var qs = state.q.trim().toLowerCase();
    var heat = topicsData.heat.filter(function (h) {
      return !qs || h.term.toLowerCase().indexOf(qs) !== -1;
    });
    var maxC = heat.length ? heat[0].count : 1;
    el.heatCount.textContent = "近12个月 " + (topicsData.doc_count || 0) + " 篇文献的 " + heat.length + " 个高频议题";
    // 错落布局：高频词水平保证可读，中低频词带旋转增加云感；最多展示 45 个避免拥挤
    var display = heat.slice(0, 45);
    el.heatCloud.innerHTML = display.map(function (h, idx) {
      var tier = heatTier(h.count, maxC);
      var cls = "heat-term t" + tier;
      // t7/t8 水平；t4-t6 轻微旋转；t1-t3 明显倾斜
      if (tier <= 6) {
        cls += " a" + (idx % 7);
      }
      return '<span class="' + cls + '" data-term="' + esc(h.term) + '" title="' + h.count + ' 篇提及">' + esc(h.term) + "</span>";
    }).join("");
    // 点击词条 → 填入搜索框检索文献
    var terms = el.heatCloud.querySelectorAll(".heat-term");
    for (var i = 0; i < terms.length; i++) {
      terms[i].addEventListener("click", (function (t) {
        return function () {
          el.search.value = t.getAttribute("data-term");
          doSearch(); // 全站检索，用户可再点「期刊文献」分组深入
        };
      })(terms[i]));
    }
    renderProfiles(qs);
  }

  function renderProfiles(qs) {
    var ids = Object.keys(topicsData.profiles || {});
    ids.sort(function (x, y) {
      return topicsData.profiles[y].count - topicsData.profiles[x].count;
    });
    var html = ids.map(function (jid) {
      var j = journals[jid] || {};
      var p = topicsData.profiles[jid];
      if (qs) {
        var hay = (j.name + " " + (j.name_cn || "") + " " + p.terms.map(function (t) { return t.term; }).join(" ")).toLowerCase();
        if (hay.indexOf(qs) === -1) return "";
      }
      var terms = p.terms.map(function (t) {
        return '<span class="ev-field">' + esc(t.term) + "</span>";
      }).join("");
      return (
        '<article class="profile-card">' +
        '<h3 class="profile-name">' + esc(j.name_cn || j.name) + "</h3>" +
        '<div class="profile-sub">' + esc(j.name) + "</div>" +
        '<div class="profile-stats">' +
        '<span><strong>' + p.count + "</strong> 篇/12个月</span>" +
        '<span>平均 <strong>' + p.avg_authors + '</strong> 位作者</span>' +
        "</div>" +
        '<div class="ev-fields">' + terms + "</div>" +
        "</article>"
      );
    }).join("");
    el.heatProfiles.innerHTML = html || '<p class="muted">没有匹配的期刊画像</p>';
  }

  /* ---------- 页签切换 ---------- */

  function switchTab(tab) {
    state.tab = tab;
    // 类目筛选已移入文献板块内部，只影响文献/期刊动态，切页签不重置
    el.tabJournals.classList.toggle("active", tab === "journals");
    el.tabScholars.classList.toggle("active", tab === "scholars");
    el.tabPubs.classList.toggle("active", tab === "pubs");
    el.tabHeat.classList.toggle("active", tab === "heat");
    el.tabEvents.classList.toggle("active", tab === "events");
    el.tabInterviews.classList.toggle("active", tab === "interviews");
    el.tabDigest.classList.toggle("active", tab === "digest");
    el.tabPolicy.classList.toggle("active", tab === "policy");
    el.viewEvents.classList.toggle("hidden", tab !== "events");
    el.viewInterviews.classList.toggle("hidden", tab !== "interviews");
    el.viewDigest.classList.toggle("hidden", tab !== "digest");
    el.viewPolicy.classList.toggle("hidden", tab !== "policy");
    el.viewJournals.classList.toggle("hidden", tab !== "journals");
    el.viewScholars.classList.toggle("hidden", tab !== "scholars");
    el.viewPubs.classList.toggle("hidden", tab !== "pubs");
    el.viewHeat.classList.toggle("hidden", tab !== "heat");
    el.viewSearch.classList.toggle("hidden", tab !== "search");
    // 搜索词跨板块保留（重放当前值）
    applySearch();
  }

  function applySearch() {
    state.shown = PAGE_SIZE;
    state.scholarShown = PAGE_SIZE;
    saveState();
    if (state.tab === "search") renderGlobalSearch();
    else if (state.tab === "journals") renderJournals();
    else if (state.tab === "scholars") renderScholars();
    else if (state.tab === "pubs") renderPubs();
    else if (state.tab === "heat") renderHeat();
    else if (state.tab === "interviews") renderInterviews();
    else if (state.tab === "policy") renderPolicy();
    else if (state.tab === "digest") renderDigest();
    else renderEvents();
  }

  /* ---------- 全站关联检索 ---------- */

  function hayOf() {
    // 拼接任意对象的字符串字段用于全文匹配
    return Array.prototype.slice.call(arguments).filter(Boolean).join(" ").toLowerCase();
  }

  function termsMatch(hay) {
    if (!state.q.trim()) return false;
    var terms = state.q.toLowerCase().split(/\s+/).filter(Boolean);
    return terms.every(function (t) { return hay.indexOf(t) !== -1; });
  }

  function searchAllGroups() {
    var qs = state.q.trim().toLowerCase();
    if (!qs) return [];
    var groups = [];

    // 文献（含学者动态）
    var arts = articles.filter(function (a) {
      var j = journals[a.journal_id] || {};
      return termsMatch(hayOf(a.title, a.journal, a.authors.join(", "), j.name, j.name_cn, a.abstract));
    });
    var sArts = scholarArticles.filter(function (a) {
      return termsMatch(hayOf(a.title, a.journal, a.authors.join(", "), a.scholar_name, a.abstract));
    });
    groups.push({ tab: "journals", name: "期刊文献", total: arts.length + sArts.length });

    // 学者
    var sch = scholars.filter(function (s) {
      return termsMatch(hayOf(s.name, s.institution, s.focus));
    });
    groups.push({ tab: "scholars", name: "学者", total: sch.length });

    // 平台治理
    var pol = policyItems.filter(function (it) {
      return termsMatch(hayOf(it.title, it.region, it.authority, (it.tags || []).join(" "), it.note));
    });
    groups.push({ tab: "policy", name: "平台治理", total: pol.length });

    // 访谈与对话
    var ivs = interviews.filter(function (it) {
      return termsMatch(hayOf(it.title, it.scholar, it.institution, it.source, (it.topics || []).join(" "), it.note));
    });
    groups.push({ tab: "interviews", name: "访谈与对话", total: ivs.length });

    // 本周精读
    var dgs = digests.filter(function (it) {
      return termsMatch(hayOf(it.title, it.title_cn, (it.authors || []).join(", "), it.journal, (it.tags || []).join(" "), it.core, it.framework));
    });
    if (dgs.length) {
      groups.push({ tab: "digest", name: "本周精读", total: dgs.length });
    }

    // 会议与征稿
    var evs = events.filter(function (e) {
      return termsMatch(hayOf(e.name_cn, e.name_en, e.organizer, e.location, (e.fields || []).join(" "), e.note));
    });
    groups.push({ tab: "events", name: "会议与征稿", total: evs.length });

    // 热词也参与命中提示
    var heatHits = (topicsData && topicsData.heat || []).filter(function (h) {
      return termsMatch(hayOf(h.term));
    });
    if (heatHits.length) {
      groups.push({ tab: "heat", name: "议题热词", total: heatHits.length });
    }

    return groups.filter(function (g) { return g.total > 0; });
  }

  function renderGlobalSearch() {
    var qs = state.q.trim();
    if (!qs) {
      el.searchCount.textContent = "请输入关键词";
      el.searchGroups.innerHTML = "";
      el.searchEmpty.classList.add("hidden");
      return;
    }
    var groups = searchAllGroups();
    var total = groups.reduce(function (n, g) { return n + g.total; }, 0);
    el.searchCount.textContent = "“" + qs + "” 全站命中 " + total + " 条，分布于 " + groups.length + " 个板块";
    el.searchEmpty.classList.toggle("hidden", total > 0);
    el.searchGroups.innerHTML = groups.map(function (g) {
      return (
        '<button class="search-group" type="button" data-tab="' + g.tab + '">' +
        '<span class="search-group-name">' + esc(g.name) + "</span>" +
        '<span class="search-group-count">' + g.total + " 条</span>" +
        '<span class="search-group-arrow">→</span>' +
        "</button>"
      );
    }).join("");
    var btns = el.searchGroups.querySelectorAll(".search-group");
    for (var i = 0; i < btns.length; i++) {
      btns[i].addEventListener("click", (function (b) {
        return function () { switchTab(b.getAttribute("data-tab")); };
      })(btns[i]));
    }
  }

  /* ---------- 事件 ---------- */

  function doSearch() {
    state.q = el.search.value;
    updateSearchClear();
    // 有搜索词时进入全站检索视图；清空时回到默认板块
    if (state.q.trim()) {
      if (state.tab !== "search") switchTab("search");
      else applySearch();
    } else {
      if (state.tab === "search") switchTab("policy");
      else applySearch();
    }
  }

  function updateSearchClear() {
    el.searchClear.classList.toggle("hidden", !el.search.value);
  }

  var debounceTimer = null;
  el.search.addEventListener("input", function () {
    updateSearchClear();
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(function () {
      doSearch();
    }, 400);
  });
  el.search.addEventListener("keydown", function (ev) {
    if (ev.key === "Enter") {
      clearTimeout(debounceTimer);
      doSearch();
    }
  });
  el.searchBtn.addEventListener("click", doSearch);
  el.searchClear.addEventListener("click", function () {
    el.search.value = "";
    doSearch();
  });

  el.journalFilter.addEventListener("change", function () {
    state.journal = el.journalFilter.value;
    applyFilters();
  });

  el.loadMore.addEventListener("click", function () {
    state.shown += PAGE_SIZE;
    renderJournals();
  });

  el.scholarLoadMore.addEventListener("click", function () {
    state.scholarShown += PAGE_SIZE;
    renderScholars();
  });

  el.tabJournals.addEventListener("click", function () { switchTab("journals"); });
  el.tabScholars.addEventListener("click", function () { switchTab("scholars"); });
  el.tabPubs.addEventListener("click", function () { switchTab("pubs"); });
  el.tabHeat.addEventListener("click", function () { switchTab("heat"); });
  el.tabEvents.addEventListener("click", function () { switchTab("events"); });
  el.tabInterviews.addEventListener("click", function () { switchTab("interviews"); });
  el.tabDigest.addEventListener("click", function () { switchTab("digest"); });
  el.tabPolicy.addEventListener("click", function () { switchTab("policy"); });

  el.favToggle.addEventListener("click", function () {
    state.favOnly = !state.favOnly;
    el.favToggle.classList.toggle("active", state.favOnly);
    state.shown = PAGE_SIZE;
    state.scholarShown = PAGE_SIZE;
    if (state.tab === "journals") renderJournals();
    else if (state.tab === "scholars") renderScholars();
    else if (state.tab === "pubs") renderPubs();
    else applySearch();
  });

  if (el.heroClose) {
    el.heroClose.addEventListener("click", function () {
      el.hero.classList.add("hidden");
      try { localStorage.setItem("lawecon-hero-closed", "1"); } catch (e) {}
    });
  }

  /* ---------- 数据加载 ---------- */

  var dataUpdatedAt = "";
  Promise.all([
    fetch("journals.json").then(function (r) { return r.json(); }),
    fetch("data/articles.json").then(function (r) { return r.json(); }),
    fetch("scholars.json").then(function (r) { return r.json(); }),
    fetch("data/scholar_articles.json").then(function (r) { return r.json(); }).catch(function () { return null; }),
    fetch("events.json").then(function (r) { return r.json(); }).catch(function () { return null; }),
    fetch("interviews.json").then(function (r) { return r.json(); }).catch(function () { return null; }),
    fetch("data/topics.json").then(function (r) { return r.json(); }).catch(function () { return null; }),
    fetch("policy_items.json").then(function (r) { return r.json(); }).catch(function () { return null; }),
    fetch("digests.json").then(function (r) { return r.json(); }).catch(function () { return null; }),
  ]).then(function (res) {
    res[0].journals.forEach(function (j) { journals[j.id] = j; });
    articles = res[1].articles || [];
    dataUpdatedAt = res[1].updated_at || "";
    scholars = (res[2] && res[2].scholars) || [];
    scholars.forEach(function (s) { scholarMap[s.id] = s; });
    if (res[3]) {
      scholarArticles = res[3].articles || [];
      scholarDataUpdatedAt = res[3].updated_at || "";
    } else {
      scholarArticles = [];
    }
    events = (res[4] && res[4].events) || [];
    interviews = (res[5] && res[5].items) || [];
    topicsData = res[6];
    policyCats = (res[7] && res[7].categories) || [];
    policyItems = (res[7] && res[7].items) || [];
    digests = (res[8] && res[8].items) || [];
    initPolicyCats();
    el.loading.classList.add("hidden");
    if (el.journalCount) el.journalCount.textContent = Object.keys(journals).filter(function (k) { return journals[k].enabled; }).length;
    if (el.scholarCount) el.scholarCount.textContent = scholars.length;
    try { if (localStorage.getItem("lawecon-hero-closed") === "1" && el.hero) el.hero.classList.add("hidden"); } catch (e) {}
    restoreState();
    initJournalFilter();
    initCatButtons();
    initScholarMode();
    renderJournals();
    renderScholars();
    renderPubs();
    renderEvents();
    renderHeat();
    renderInterviews();
    renderPolicy();
    renderDigest();
    if (!scholarArticles.length) {
      el.scholarEmpty.textContent = "学者数据生成中，请稍后再来。";
      el.scholarEmpty.classList.remove("hidden");
      el.scholarList.innerHTML = "";
    }
  }).catch(function (err) {
    el.loading.textContent = "数据加载失败：" + err;
  });
})();
