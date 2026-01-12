// app.js (v2) - minimal quiz UI + settings from home.html
(() => {
  const WORDS_URL = "./words.json";
  const SETTINGS_KEY = "vocab_settings_v2";
  const CAT_OVERRIDE_KEY = "vocab_cat_override_v1";

  // per kid banks
  const WRONG_KEY = (kid) => `vocab_wrong_v2_${kid}`; // array of ids
  const NEW_KEY = (kid) => `vocab_new_v1_${kid}`;     // existing from your admin (if any)
  const SEEN_KEY = (kid) => `vocab_seen_v2_${kid}`;   // { "YYYY-MM-DD": [ids] }

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
    const s = loadJSON(SETTINGS_KEY, null) || {};
    return {
      kid: s.kid || "xigua",
      pool: s.pool || "all",          // all/new/wrong
      cat: s.cat || "",
      avoidDays: Number(s.avoidDays ?? 3),
      numQ: Number(s.numQ ?? 20),
      mode: s.mode || "mc",           // mc/type
    };
  }

  function loadCatOverride() {
    return loadJSON(CAT_OVERRIDE_KEY, {});
  }

  function effectiveCatOf(w, ov) {
    return norm(ov[w.id] ?? w.cat ?? "");
  }

  function loadWrongSet(kid) {
    const arr = loadJSON(WRONG_KEY(kid), []);
    return new Set(Array.isArray(arr) ? arr : []);
  }

  function saveWrongSet(kid, set) {
    saveJSON(WRONG_KEY(kid), Array.from(set));
  }

  function loadNewSet(kid) {
    const arr = loadJSON(NEW_KEY(kid), []);
    return new Set(Array.isArray(arr) ? arr : []);
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
    // include today-1 .. today-avoidDays
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

  function show(elm, yes) {
    if (!elm) return;
    elm.classList.toggle("hidden", !yes);
  }

  // --- quiz state ---
  let words = [];
  let settings = loadSettings();
  let avoidIds = new Set();
  let wrongSet = new Set();
  let newSet = new Set();

  let queue = []; // list of word objects
  let idx = 0;
  let locked = false;

  function speakEn(en) {
    // use Google TTS (tap to play)
    // simple approach: audio from translate_tts (works in most cases)
    const text = encodeURIComponent(en);
    const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${text}&tl=en&client=tw-ob`;
    const audio = new Audio(url);
    audio.play().catch(() => {});
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

    // filter by pool
    if (settings.pool === "new") {
      base = base.filter(w => newSet.has(w.id));
    } else if (settings.pool === "wrong") {
      base = base.filter(w => wrongSet.has(w.id));
    }

    // filter by category (only meaningful when pool=all)
    if (settings.cat) {
      base = base.filter(w => w.cat === settings.cat);
    }

    // avoid recently seen
    base = base.filter(w => !avoidIds.has(w.id));

    return base;
  }

  function makeQueue() {
    const pool = buildPool();
    // if pool too small (because avoidDays), we relax avoid
    let finalPool = pool;
    if (finalPool.length < Math.max(5, settings.numQ)) {
      // relax: ignore avoidDays but still respect pool/cat filters
      const ov = loadCatOverride();
      let base = words.map(w => ({
        id: norm(w.id),
        zh: norm(w.zh),
        en: norm(w.en),
        img: norm(w.img),
        cat: effectiveCatOf(w, ov),
      })).filter(w => w.id && w.zh && w.en);

      if (settings.pool === "new") base = base.filter(w => newSet.has(w.id));
      else if (settings.pool === "wrong") base = base.filter(w => wrongSet.has(w.id));
      if (settings.cat) base = base.filter(w => w.cat === settings.cat);

      finalPool = base;
    }

    queue = sample(finalPool, settings.numQ);
    idx = 0;

    if (queue.length === 0) {
      if (el.qZh) el.qZh.textContent = "目前題庫沒有符合條件的單字";
      if (el.progress) el.progress.textContent = "0 / 0";
      show(el.btnNext, false);
      return;
    }

    // mark seen today (avoid repeats in next days)
    markSeenToday(settings.kid, queue.map(w => w.id));

    renderQuestion();
  }

  function renderQuestion() {
    locked = false;
    setResult("", true);
    show(el.btnNext, false);

    const total = queue.length;
    const cur = queue[idx];

    if (el.progress) el.progress.textContent = `${Math.min(idx + 1, total)} / ${total}`;
    if (el.qZh) el.qZh.textContent = cur.zh;

    // image
    if (el.qImg) {
      el.qImg.src = cur.img || "";
      el.qImg.onerror = () => {
        // keep frame but clear broken icon
        el.qImg.removeAttribute("src");
      };
    }

    // speak
    if (el.btnSpeak) {
      el.btnSpeak.onclick = () => speakEn(cur.en);
    }

    // mode
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

  function renderChoices(cur) {
    if (!el.mcArea) return;
    el.mcArea.innerHTML = "";

    // choices: correct + 3 random from same pool (fallback to all)
    const pool = buildPool();
    const candidates = pool.filter(w => w.id !== cur.id);
    const distractors = sample(candidates.length ? candidates : words.filter(w => w.id !== cur.id), 3)
      .map(w => w.en);

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

  function checkAnswer(inputEn, correctEn) {
    locked = true;
    const ok = lower(inputEn) === lower(correctEn);

    if (ok) {
      setResult("✅ 正確！", true);
      // correct => auto next
      setTimeout(() => nextQuestion(), 350);
    } else {
      setResult(`❌ 錯誤`, false);
      // wrong => add to wrong bank, show next button
      wrongSet.add(queue[idx].id);
      saveWrongSet(settings.kid, wrongSet);
      show(el.btnNext, true);
    }
  }

  function nextQuestion() {
    if (queue.length === 0) return;
    if (idx < queue.length - 1) {
      idx++;
      renderQuestion();
    } else {
      // finished
      if (el.qZh) el.qZh.textContent = "🎉 完成！回入口可改條件再測一次";
      if (el.progress) el.progress.textContent = `${queue.length} / ${queue.length}`;
      show(el.mcArea, false);
      show(el.typeArea, false);
      show(el.btnNext, false);
    }
  }

  async function boot() {
    // wiring next
    if (el.btnNext) el.btnNext.onclick = () => nextQuestion();

    settings = loadSettings();
    wrongSet = loadWrongSet(settings.kid);
    newSet = loadNewSet(settings.kid);
    avoidIds = getAvoidIds(settings.kid, settings.avoidDays);

    try {
      const res = await fetch(WORDS_URL, { cache: "no-store" });
      const data = await res.json();
      words = Array.isArray(data) ? data : [];
      makeQueue();
    } catch (e) {
      if (el.qZh) el.qZh.textContent = "載入 words.json 失敗，請確認檔案在 repo 根目錄";
      if (el.progress) el.progress.textContent = "錯誤";
    }
  }

  boot();
})();
