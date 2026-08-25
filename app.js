/* 域外研究动态追踪 - 前端逻辑（零依赖） */
(function () {
  "use strict";

  var PAGE_SIZE = 200;
  var state = {
    tab: "journals",       // journals | scholars | pubs | events | interviews
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
    tabEvents: document.getElementById("tab-events"),
    tabInterviews: document.getElementById("tab-interviews"),
    viewInterviews: document.getElementById("view-interviews"),
    interviewCount: document.getElementById("interview-count"),
    interviewList: document.getElementById("interview-list"),
    interviewEmpty: document.getElementById("interview-empty"),
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
  };

  var journals = {}; // id -> journal config
  var scholars = []; // scholar configs
  var scholarMap = {};
  var articles = [];
  var scholarArticles = [];
  var events = [];
  var interviews = [];
  var typeNames = {
    interview: "访谈",
    conversation: "对话",
    lecture: "演讲/讲座",
    memorial: "纪念文章",
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
      '<div class="card-top">' + badge + '<span class="date">' + esc(a.date) + "</span></div>" +
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
      '<span class="date">' + esc(a.date) + "</span></div>" +
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
    return (
      '<a class="pub-row" href="' + esc(a.url) + '" target="_blank" rel="noopener">' +
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

  /* ---------- 页签切换 ---------- */

  function switchTab(tab) {
    var prevTab = state.tab;
    state.tab = tab;
    // 切换板块时重置类目筛选，避免类目与板块内容不匹配
    if (state.cat) {
      state.cat = "";
      var act = el.catFilter.querySelector(".cat-btn.active");
      if (act) act.classList.remove("active");
      var allBtn = el.catFilter.querySelector('.cat-btn[data-cat=""]');
      if (allBtn) allBtn.classList.add("active");
    }
    el.tabJournals.classList.toggle("active", tab === "journals");
    el.tabScholars.classList.toggle("active", tab === "scholars");
    el.tabPubs.classList.toggle("active", tab === "pubs");
    el.tabEvents.classList.toggle("active", tab === "events");
    el.tabInterviews.classList.toggle("active", tab === "interviews");
    el.viewEvents.classList.toggle("hidden", tab !== "events");
    el.viewInterviews.classList.toggle("hidden", tab !== "interviews");
    el.viewJournals.classList.toggle("hidden", tab !== "journals");
    el.viewScholars.classList.toggle("hidden", tab !== "scholars");
    el.viewPubs.classList.toggle("hidden", tab !== "pubs");
    el.viewEvents.classList.toggle("hidden", tab !== "events");
    // 搜索词跨板块保留（重放当前值）
    applySearch();
  }

  function applySearch() {
    state.shown = PAGE_SIZE;
    state.scholarShown = PAGE_SIZE;
    saveState();
    if (state.tab === "journals") renderJournals();
    else if (state.tab === "scholars") renderScholars();
    else if (state.tab === "pubs") renderPubs();
    else if (state.tab === "interviews") renderInterviews();
    else renderEvents();
  }

  /* ---------- 事件 ---------- */

  function doSearch() {
    state.q = el.search.value;
    updateSearchClear();
    applySearch();
  }

  function updateSearchClear() {
    el.searchClear.classList.toggle("hidden", !el.search.value);
  }

  var debounceTimer = null;
  el.search.addEventListener("input", function () {
    updateSearchClear();
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(function () {
      state.q = el.search.value;
      applySearch();
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
  el.tabEvents.addEventListener("click", function () { switchTab("events"); });
  el.tabInterviews.addEventListener("click", function () { switchTab("interviews"); });

  el.favToggle.addEventListener("click", function () {
    state.favOnly = !state.favOnly;
    el.favToggle.classList.toggle("active", state.favOnly);
    state.shown = PAGE_SIZE;
    state.scholarShown = PAGE_SIZE;
    if (state.tab === "journals") renderJournals();
    else if (state.tab === "scholars") renderScholars();
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
    renderInterviews();
    if (!scholarArticles.length) {
      el.scholarEmpty.textContent = "学者数据生成中，请稍后再来。";
      el.scholarEmpty.classList.remove("hidden");
      el.scholarList.innerHTML = "";
    }
  }).catch(function (err) {
    el.loading.textContent = "数据加载失败：" + err;
  });
})();
