/* 域外法学文献追踪 - 前端逻辑（零依赖） */
(function () {
  "use strict";

  var PAGE_SIZE = 200;
  var state = {
    q: "",
    cat: "",
    journal: "",
    shown: PAGE_SIZE,
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
  };

  var journals = {}; // id -> journal config
  var articles = [];
  var catNames = {
    competition: "竞争法",
    "law-econ": "法经济学",
    io: "产业组织",
    "law-review": "法律评论",
  };

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

  function matchKeywords(a) {
    if (!state.q.trim()) return true;
    var hay = (a.title + " " + a.journal + " " + a.authors.join(" ")).toLowerCase();
    var terms = state.q.toLowerCase().split(/\s+/).filter(Boolean);
    return terms.every(function (t) { return hay.indexOf(t) !== -1; });
  }

  function filter() {
    return articles.filter(function (a) {
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
    return (
      '<article class="card">' +
      '<div class="card-top">' + badge + '<span class="date">' + esc(a.date) + "</span></div>" +
      '<h3><a href="' + esc(a.url) + '" target="_blank" rel="noopener">' + esc(a.title) + "</a></h3>" +
      '<div class="journal-name">' + esc(a.journal) + "</div>" +
      '<div class="authors">' + authors + "</div>" +
      absBtn + abs +
      "</article>"
    );
  }

  function render() {
    var list = filter();
    el.count.textContent = "共 " + list.length + " 篇";
    el.updatedAt.textContent = dataUpdatedAt ? "数据更新于 " + dataUpdatedAt : "";

    var slice = list.slice(0, state.shown);
    el.list.innerHTML = slice.map(card).join("");
    el.empty.classList.toggle("hidden", list.length !== 0);
    el.loadMore.classList.toggle("hidden", state.shown >= list.length);

    var toggles = el.list.querySelectorAll(".abstract-toggle");
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
  }

  function applyFilters() { state.shown = PAGE_SIZE; saveState(); render(); }

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
    var btns = el.catFilter.querySelectorAll(".cat-btn");
    for (var i = 0; i < btns.length; i++) {
      if (btns[i].dataset.cat === state.cat) {
        el.catFilter.querySelector(".active").classList.remove("active");
        btns[i].classList.add("active");
      }
      btns[i].addEventListener("click", (function (btn) {
        return function () {
          el.catFilter.querySelector(".active").classList.remove("active");
          btn.classList.add("active");
          state.cat = btn.dataset.cat;
          applyFilters();
        };
      })(btns[i]));
    }
  }

  var debounceTimer = null;
  el.search.addEventListener("input", function () {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(function () {
      state.q = el.search.value;
      applyFilters();
    }, 300);
  });

  el.journalFilter.addEventListener("change", function () {
    state.journal = el.journalFilter.value;
    applyFilters();
  });

  el.loadMore.addEventListener("click", function () {
    state.shown += PAGE_SIZE;
    render();
  });

  if (el.heroClose) {
    el.heroClose.addEventListener("click", function () {
      el.hero.classList.add("hidden");
      try { localStorage.setItem("lawecon-hero-closed", "1"); } catch (e) {}
    });
  }

  var dataUpdatedAt = "";
  Promise.all([
    fetch("journals.json").then(function (r) { return r.json(); }),
    fetch("data/articles.json").then(function (r) { return r.json(); }),
  ]).then(function (res) {
    res[0].journals.forEach(function (j) { journals[j.id] = j; });
    articles = res[1].articles || [];
    dataUpdatedAt = res[1].updated_at || "";
    el.loading.classList.add("hidden");
    if (el.journalCount) el.journalCount.textContent = Object.keys(journals).filter(function(k){return journals[k].enabled;}).length;
    try { if (localStorage.getItem("lawecon-hero-closed") === "1" && el.hero) el.hero.classList.add("hidden"); } catch (e) {}
    restoreState();
    initJournalFilter();
    initCatButtons();
    render();
  }).catch(function (err) {
    el.loading.textContent = "数据加载失败：" + err;
  });
})();
