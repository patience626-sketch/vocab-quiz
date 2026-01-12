// app.js - Quiz engine (big image + big choices + tap-to-speak TTS)
(() => {
  const WORDS_URL = "./words.json";
  const SETTINGS_KEY = "vocab_settings_v2";
  const CAT_OVERRIDE_KEY = "vocab_cat_override_v1";

  const WRONG_KEY = (kid) => `vocab_wrong_v2_${kid}`; // ids
  const NEW_KEY   = (kid) => `vocab_new_v1_${kid}`;   // ids (from admin if you have)
  const SEEN_KEY  = (kid) => `vocab_seen_v2_${kid}`;  // {date:[ids]}

  const $ = (id) => document.getElementById(id);
  const el = {
    progress: $("progress"),
    qImg: $("qImg"),
    qZh: $("qZh"),
    btnSpeak: $("btnSpeak"),
    mcArea: $("mcArea"),
    typeArea: $("typeArea"),
    typeInput: $("typeInput"),
    btnCheck: $("btnCheck"),
    result: $("result"),
    btnNext: $("btnNext"),
  };

  const norm = (s) => String(s || "").trim();
  const lower = (s) => norm(s).toLowerCase();

  function todayKey() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }
  function dateMinusDays(days) {
    const d = new Date();
    d.setDate(d.getDate() - days);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  function loadJSON(key, fallback) {
    try {
      const v = localStorage.getItem(key);
      if (!v) return fallback;
      return JSON.parse(v);
    } catch {
      return fallback;
    }
  }
  function saveJSON(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function loadSettings() {
    const s = loadJSON(SETTINGS_KEY, {}) || {};
    return {
      kid: s.kid || "xigua",
      pool: s.pool || "all",      // all/new/wrong
      cat: s.cat || "",
      avoidDays: Number(s.avoidDays ?? 3),
      numQ: Number(s.numQ ?? 20),
      mode: s.mode || "mc",       // mc/type
    };
  }

  function loadCatOverride() {
    return loadJSON(CAT_OVERRIDE_KEY, {});
  }

  function loadSet(key) {
    const arr = loadJSON(key, []);
    return new Set(Array.isArray(arr) ? arr : []);
  }
  function saveSet(key, set) {
    saveJSON(key, Array.from(set));
  }

  function loadSeenMap(kid) {
    const m = loadJSON(SEEN_KEY(kid), {});
    return (m && typeof m === "object") ? m : {};
  }
  function saveSeenMap(kid, map) {
    saveJSON(SEEN_KEY(kid), map);
  }

  function getAvoidIds(kid, avoidDays) {
    if (!avoidDays || avoidDays <= 0) return new Set();
    const seen = loadSeenMap(kid);
    const ids = new Set();
    for (let i = 1; i <= avoidDays; i++) {
      const k = dateMinusDays(i);
      const arr = seen[k] || [];
      for (const id of arr) ids.add(id);
    }
    return ids;
  }

  function markSeenToday(kid, idsThisSession) {
    const k = todayKey();
    const seen = loadSeenMap(kid);
    const prev = new Set(seen[k] || []);
    for (const id of idsThisSession) prev.add(id);
    seen[k] = Array.from(prev);
    saveSeenMap(kid, seen);
  }

  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  function sample(arr, n) {
    const copy = arr.slice();
    shuffle(copy);
    return copy.slice(0, Math.min(n, copy.length));
  }

  function setResult(text, ok) {
    if (!el.result) return;
    el.result.textContent = text || "";
    el.result.className = "result " + (ok ? "ok" : "no");
  }
  function show(node, yes) {
    if (!node) return;
    node.classList.toggle("hidden", !yes);
  }

  // ✅ tap-to-speak (Google translate TTS)
  function speakEn(en) {
    const text = encodeURIComponent(en);
    const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${text}&tl=en&client=tw-ob`;
    const audio = new Audio(url);
    audio.play().catch(() => {});
  }

  // --- state ---
  let words = [];
  let settings = loadSettings();
  let wrongSet = loadSet(WRONG_KEY(settings.kid));
  let newSet = loadSet(NEW_KEY(settings.kid));
  let avoidIds = getAvoidIds(settings.kid, settings.avoidDays);

  let queue = [];
  let idx = 0;
  let locked = false;

  function effectiveCatOf(w, ov) {
    return norm(ov[w.id] ?? w.cat ?? "");
  }

  function buildPool() {
    const ov = loadCatOverride();

    let base = words.map(w => ({
      id: norm(w.id),
      zh: norm(w.zh),
      en: norm(w.en),
      img: norm(w.img),
      cat: effectiveCatOf(w, ov),
    })).filter(w => w.id && w.zh && w.en);

    if (settings.pool === "new") base = base.filter(w => newSet.has(w.id));
    if (settings.pool === "wrong") base = base.filter(w => wrongSet.has(w.id));

    if (settings.cat) base = base.filter(w => w.cat === settings.cat);

    base = base.filter(w => !avoidIds.has(w.id));
    return base;
  }

  function makeQueue() {
    const pool = buildPool();

    // pool 太少就放寬「避開」，但仍保留 pool/cat
    let finalPool = pool;
    if (finalPool.length < Math.max(4, settings.numQ)) {
      const ov = loadCatOverride();
      let base = words.map(w => ({
        id: norm(w.id),
        zh: norm(w.zh),
        en: norm(w.en),
        img: norm(w.img),
        cat: effectiveCatOf(w, ov),
      })).filter(w => w.id && w.zh && w.en);

      if (settings.pool === "new") base = base.filter(w => newSet.has(w.id));
      if (settings.pool === "wrong") base = base.filter(w => wrongSet.has(w.id));
      if (settings.cat) base = base.filter(w => w.cat === settings.cat);

      finalPool = base;
    }

    queue = sample(finalPool, settings.numQ);
    idx = 0;

    if (!queue.length) {
      if (el.qZh) el.qZh.textContent = "目前沒有符合條件的題目（請回入口調整）";
      if (el.progress) el.progress.textContent = "0 / 0";
      show(el.btnNext, false);
      show(el.mcArea, false);
      show(el.typeArea, false);
      return;
    }

    markSeenToday(settings.kid, queue.map(w => w.id));
    renderQuestion();
  }

  function renderChoices(cur) {
    if (!el.mcArea) return;
    el.mcArea.innerHTML = "";

    const pool = buildPool();
    const candidates = pool.filter(w => w.id !== cur.id);
    const fallback = words.filter(w => norm(w.id) !== cur.id).map(w => ({ en: norm(w.en) })).filter(x => x.en);

    const distractors = sample((candidates.length ? candidates : fallback), 3).map(w => w.en);
    const options = shuffle([cur.en, ...distractors]);

    for (const opt of options) {
      const b = document.createElement("button");
      b.className = "choiceBtn";
      b.type = "button";
      b.textContent = opt;
      b.onclick = () => {
        if (locked) return;
        checkAnswer(opt, cur.en);
      };
      el.mcArea.appendChild(b);
    }
  }

  function renderQuestion() {
    locked = false;
    setResult("", true);
    show(el.btnNext, false);

    const total = queue.length;
    const cur = queue[idx];

    if (el.progress) el.progress.textContent = `${idx + 1} / ${total}`;
    if (el.qZh) el.qZh.textContent = cur.zh;

    if (el.qImg) {
      el.qImg.src = cur.img || "";
      el.qImg.onerror = () => { el.qImg.removeAttribute("src"); };
    }

    if (el.btnSpeak) {
      el.btnSpeak.onclick = () => speakEn(cur.en);
      show(el.btnSpeak, true);
    }

    if (settings.mode === "type") {
      show(el.typeArea, true);
      show(el.mcArea, false);
      if (el.typeInput) el.typeInput.value = "";
      if (el.typeInput) el.typeInput.focus();

      if (el.btnCheck) {
        el.btnCheck.onclick = () => {
          if (locked) return;
          const ans = lower(el.typeInput ? el.typeInput.value : "");
          if (!ans) return;
          checkAnswer(ans, cur.en);
        };
      }
      if (el.typeInput) {
        el.typeInput.onkeydown = (e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            if (el.btnCheck) el.btnCheck.click();
          }
        };
      }
    } else {
      show(el.typeArea, false);
      show(el.mcArea, true);
      renderChoices(cur);
    }
  }

  function checkAnswer(inputEn, correctEn) {
    locked = true;
    const ok = lower(inputEn) === lower(correctEn);

    if (ok) {
      setResult("✅ 正確！", true);
      setTimeout(nextQuestion, 350); // 答對自動跳下一題
    } else {
      setResult("❌ 錯誤", false);
      wrongSet.add(queue[idx].id);
      saveSet(WRONG_KEY(settings.kid), wrongSet);
      show(el.btnNext, true); // 答錯才顯示下一題
    }
  }

  function nextQuestion() {
    if (!queue.length) return;
    if (idx < queue.length - 1) {
      idx++;
      renderQuestion();
    } else {
      if (el.qZh) el.qZh.textContent = "🎉 完成！";
      if (el.progress) el.progress.textContent = `${queue.length} / ${queue.length}`;
      show(el.mcArea, false);
      show(el.typeArea, false);
      show(el.btnNext, false);
      if (el.btnSpeak) show(el.btnSpeak, false);
    }
  }

  async function boot() {
    if (el.btnNext) el.btnNext.onclick = () => nextQuestion();

    settings = loadSettings();
    wrongSet = loadSet(WRONG_KEY(settings.kid));
    newSet = loadSet(NEW_KEY(settings.kid));
    avoidIds = getAvoidIds(settings.kid, settings.avoidDays);

    try {
      const res = await fetch(WORDS_URL, { cache: "no-store" });
      const data = await res.json();
      words = Array.isArray(data) ? data : [];
      makeQueue();
    } catch {
      if (el.qZh) el.qZh.textContent = "載入 words.json 失敗（請確認檔案在 repo 根目錄）";
      if (el.progress) el.progress.textContent = "錯誤";
    }
  }

  boot();
})();
