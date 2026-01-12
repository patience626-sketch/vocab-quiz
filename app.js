(() => {
  const WORDS_URL = "./words.json";
  const SETTINGS_KEY = "vocab_settings_v3";

  const KIDS = [
    { id: "xigua", name: "西瓜" },
    { id: "youzi", name: "柚子" },
    { id: "xiaole", name: "小樂" },
    { id: "apu",   name: "阿噗" },
    { id: "anan",  name: "安安" },
  ];

  // per kid storage
  const WRONG_KEY = (kid) => `vocab_wrong_${kid}`;     // array of word ids
  const SEEN_KEY  = (kid) => `vocab_seen_${kid}`;      // { YYYY-MM-DD: [ids] }
  const STATS_KEY = (kid) => `vocab_stats_${kid}`;     // { YYYY-MM-DD: {correct, wrong, total} }

  const $ = (id) => document.getElementById(id);
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

  async function loadWords() {
    const res = await fetch(WORDS_URL, { cache: "no-store" });
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  }

  // ===== Audio: Oxford-ish mp3 -> Google TTS -> SpeechSynthesis
  function oxfordSoundUrl(en) {
    // Google Dictionary Oxford sounds (常見可用)
    // 例: https://ssl.gstatic.com/dictionary/static/sounds/oxford/apple--_us_1.mp3
    const w = lower(en).replace(/\s+/g, "_");
    return `https://ssl.gstatic.com/dictionary/static/sounds/oxford/${encodeURIComponent(w)}--_us_1.mp3`;
  }
  function googleTtsUrl(en) {
    const q = encodeURIComponent(en);
    return `https://translate.google.com/translate_tts?ie=UTF-8&q=${q}&tl=en&client=tw-ob`;
  }
  async function playAudioWithFallback(en) {
    // 1) try oxford mp3
    const oxUrl = oxfordSoundUrl(en);
    try {
      const a1 = new Audio(oxUrl);
      await a1.play();
      return;
    } catch {}

    // 2) try google tts
    const gUrl = googleTtsUrl(en);
    try {
      const a2 = new Audio(gUrl);
      await a2.play();
      return;
    } catch {}

    // 3) speech synthesis
    try {
      const u = new SpeechSynthesisUtterance(en);
      u.lang = "en-US";
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
    } catch {}
  }
  function oxfordLink(en) {
    // 點開 Oxford Learner's Dictionaries 搜尋頁（穩定不受 CORS 影響）
    return `https://www.oxfordlearnersdictionaries.com/search/english/?q=${encodeURIComponent(en)}`;
  }

  // ===== Seen / Wrong / Stats
  function loadWrongSet(kid) {
    const arr = loadJSON(WRONG_KEY(kid), []);
    return new Set(Array.isArray(arr) ? arr : []);
  }
  function saveWrongSet(kid, set) {
    saveJSON(WRONG_KEY(kid), Array.from(set));
  }
  // ===== NEW (方案B)：新學清單（從 localStorage 讀，依小孩分開）=====
// ⚠️ 如果 admin 用的 key 不同，只要改這一行即可
const NEW_KEY = (kid) => `vocab_new_${kid}`;

function loadNewSet(kid) {
  const raw = loadJSON(NEW_KEY(kid), null);

  // 允許 admin 存成 array 或 object 兩種格式
  if (Array.isArray(raw)) {
    return new Set(raw.map(norm).filter(Boolean));
  }
  if (raw && typeof raw === "object") {
    return new Set(Object.keys(raw).map(norm).filter(Boolean));
  }
  return new Set();
}
  function loadSeenMap(kid) {
    const m = loadJSON(SEEN_KEY(kid), {});
    return (m && typeof m === "object") ? m : {};
  }
  function saveSeenMap(kid, map) {
    saveJSON(SEEN_KEY(kid), map);
  }
  function addSeenToday(kid, ids) {
    const day = todayKey();
    const seen = loadSeenMap(kid);
    const cur = new Set(seen[day] || []);
    for (const id of ids) cur.add(id);
    seen[day] = Array.from(cur);
    saveSeenMap(kid, seen);
  }
  function getAvoidSet(kid, avoidDays) {
    const seen = loadSeenMap(kid);
    const s = new Set();
    for (let i = 1; i <= avoidDays; i++) {
      const d = dateMinusDays(i);
      for (const id of (seen[d] || [])) s.add(id);
    }
    return s;
  }

  function loadStats(kid) {
    const s = loadJSON(STATS_KEY(kid), {});
    return (s && typeof s === "object") ? s : {};
  }
  function saveStats(kid, stats) {
    saveJSON(STATS_KEY(kid), stats);
  }
  function addAttempt(kid, isCorrect) {
    const day = todayKey();
    const stats = loadStats(kid);
    const cur = stats[day] || { correct: 0, wrong: 0, total: 0 };
    cur.total += 1;
    if (isCorrect) cur.correct += 1;
    else cur.wrong += 1;
    stats[day] = cur;
    saveStats(kid, stats);
  }

  // ===== Settings
  function loadSettings() {
    const s = loadJSON(SETTINGS_KEY, {}) || {};
    return {
      kid: s.kid || "xigua",
      pool: s.pool || "all", // all/cat/new/wrong
      cat: s.cat || "",
      numQ: Number(s.numQ ?? 20),
      avoidDays: Number(s.avoidDays ?? 3),
      mode: s.mode || "mc", // mc/type
    };
  }
  function saveSettings(s) {
    saveJSON(SETTINGS_KEY, { ...s, savedAt: todayKey() });
  }

  // ===== Page routers
  const body = document.body;
  const isHome = body.classList.contains("page-home");
  const isQuiz = body.classList.contains("page-quiz");
  const isParent = body.classList.contains("page-parent");

  // ===== HOME
  async function bootHome() {
    const kid = $("kid");
    const pool = $("pool");
    const cat = $("cat");
    const catWrap = $("catWrap");
    const numQ = $("numQ");
    const avoidDays = $("avoidDays");
    const mode = $("mode");
    const btnStart = $("btnStart");

    let settings = loadSettings();

    // load categories from words.json
    let words = [];
    try {
      words = await loadWords();
    } catch {
      words = [];
    }
    const cats = Array.from(new Set(words.map(w => norm(w.cat)).filter(Boolean)))
      .sort((a,b)=>a.localeCompare(b, "zh-Hant"));

    cat.innerHTML = `<option value="">全部分類</option>` + cats.map(c=>`<option value="${c}">${c}</option>`).join("");

    // apply settings to UI
    kid.value = settings.kid;
    pool.value = settings.pool;
    cat.value = settings.cat || "";
    numQ.value = String(settings.numQ);
    avoidDays.value = String(settings.avoidDays);
    mode.value = settings.mode;

    const syncCatVisibility = () => {
      const show = pool.value === "cat";
      catWrap.style.display = show ? "" : "none";
      if (!show) cat.value = ""; // 非分類模式就不帶 cat
    };
    pool.addEventListener("change", syncCatVisibility);
    syncCatVisibility();

    btnStart.addEventListener("click", () => {
      const s = {
        kid: kid.value,
        pool: pool.value,
        cat: pool.value === "cat" ? (cat.value || "") : "",
        numQ: Number(numQ.value),
        avoidDays: Number(avoidDays.value),
        mode: mode.value,
      };
      saveSettings(s);
      location.href = "./quiz.html";
    });
  }

  // ===== QUIZ
  async function bootQuiz() {
    const el = {
      statusPill: $("statusPill"),
      qZh: $("qZh"),
      qImg: $("qImg"),
      btnSpeak: $("btnSpeak"),
      btnOxford: $("btnOxford"),
      mcArea: $("mcArea"),
      typeArea: $("typeArea"),
      typeInput: $("typeInput"),
      btnCheck: $("btnCheck"),
      result: $("result"),
      btnNext: $("btnNext"),
      btnRetry: $("btnRetry"),
    };

    const settings = loadSettings();
    const wrongSet = loadWrongSet(settings.kid);
    const avoidSet = getAvoidSet(settings.kid, settings.avoidDays);

    let words = await loadWords();

    // normalize
    words = words.map(w => ({
      id: norm(w.id),
      zh: norm(w.zh),
      en: norm(w.en),
      img: norm(w.img),
      cat: norm(w.cat),
      isNew: !!w.isNew, // 你若有在 words.json 用 isNew 標記也會吃到（沒有也沒關係）
    })).filter(w => w.id && w.zh && w.en);

    // pool filter
    let pool = words.slice();
    if (settings.pool === "new") {
      // 兩種支援：isNew=true 或 admin 另存 new-set（你目前 admin 若已做可再加）
      if (settings.pool === "new") {
  const newSet = loadNewSet(settings.kid);
  pool = pool.filter(w => newSet.has(w.id));
} else if (settings.pool === "wrong") {
  pool = pool.filter(w => wrongSet.has(w.id));
} else if (settings.pool === "cat" && settings.cat) {
  pool = pool.filter(w => w.cat === settings.cat);
}


    // avoid filter
    let poolAvoided = pool.filter(w => !avoidSet.has(w.id));
    if (poolAvoided.length < Math.min(settings.numQ, 6)) {
      // 太少就放寬避開（不然會出不出題）
      poolAvoided = pool;
    }

    // make queue (no repeats within session)
    const queue = sample(poolAvoided, settings.numQ);
    addSeenToday(settings.kid, queue.map(q => q.id));

    let idx = 0;
    let locked = false;

    function setStatus() {
      el.statusPill.textContent = `${idx+1} / ${queue.length}　${KIDS.find(k=>k.id===settings.kid)?.name || ""}`;
    }

    function setResult(text, ok) {
      el.result.textContent = text || "";
      el.result.className = "resultLine " + (ok ? "resultOk" : "resultNo");
    }

    function show(node, yes) {
      node.classList.toggle("hidden", !yes);
    }

    function renderChoices(cur) {
      el.mcArea.innerHTML = "";

      // distractors: prioritize from current pool, fallback to all words
      const candidates = poolAvoided.filter(w => w.id !== cur.id);
      const fallback = words.filter(w => w.id !== cur.id);
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

    function render() {
      locked = false;
      show(el.btnNext, false);
      show(el.btnRetry, false);
      setResult("", true);

      if (!queue.length) {
        el.qZh.textContent = "目前沒有符合條件的題目，請回首頁調整。";
        el.statusPill.textContent = "0 / 0";
        show(el.mcArea, false);
        show(el.typeArea, false);
        return;
      }

      const cur = queue[idx];
      setStatus();
      el.qZh.textContent = cur.zh;

      // image
      el.qImg.src = cur.img || "";
      el.qImg.onerror = () => el.qImg.removeAttribute("src");

      // audio
      el.btnSpeak.onclick = () => playAudioWithFallback(cur.en);
      el.btnOxford.href = oxfordLink(cur.en);

      // mode
      if (settings.mode === "type") {
        show(el.typeArea, true);
        show(el.mcArea, false);
        el.typeInput.value = "";
        el.typeInput.focus();
      } else {
        show(el.typeArea, false);
        show(el.mcArea, true);
        renderChoices(cur);
      }
    }

    function checkAnswer(inputEn, correctEn) {
      locked = true;
      const ok = lower(inputEn) === lower(correctEn);

      addAttempt(settings.kid, ok);

      if (ok) {
        setResult("✅ 正確！自動下一題", true);
        // 答對：自動下一題
        setTimeout(() => {
          if (idx < queue.length - 1) {
            idx++;
            render();
          } else {
            el.statusPill.textContent = `${queue.length} / ${queue.length}`;
            el.qZh.textContent = "🎉 完成！";
            show(el.mcArea, false);
            show(el.typeArea, false);
            setResult("做得很好～回首頁可以換條件再測一次。", true);
          }
        }, 350);
      } else {
        // 答錯：留在原題、記入錯題本
        wrongSet.add(queue[idx].id);
        saveWrongSet(settings.kid, wrongSet);

        setResult("❌ 錯了～留在本題，再試一次！", false);
        show(el.btnRetry, true);
        show(el.btnNext, true); // 仍提供「下一題」方便你介入
      }
    }

    el.btnRetry.onclick = () => {
      locked = false;
      setResult("", true);
      show(el.btnRetry, false);
      show(el.btnNext, false);
      if (settings.mode === "type") el.typeInput.focus();
    };

    el.btnNext.onclick = () => {
      if (idx < queue.length - 1) {
        idx++;
        render();
      } else {
        el.statusPill.textContent = `${queue.length} / ${queue.length}`;
        el.qZh.textContent = "🎉 完成！";
        show(el.mcArea, false);
        show(el.typeArea, false);
        setResult("回首頁可以換條件再測一次。", true);
      }
    };

    el.btnCheck.onclick = () => {
      if (locked) return;
      const ans = lower(el.typeInput.value);
      if (!ans) return;
      checkAnswer(ans, queue[idx].en);
    };
    el.typeInput.onkeydown = (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        el.btnCheck.click();
      }
    };

    render();
  }

  // ===== PARENT
  async function bootParent() {
    const root = $("kidStats");

    // load words count (for reference)
    let wordsCount = 0;
    try {
      const words = await loadWords();
      wordsCount = (Array.isArray(words) ? words : []).length;
    } catch {}

    const last7 = [];
    for (let i = 0; i < 7; i++) last7.push(dateMinusDays(i));

    root.innerHTML = "";

    for (const k of KIDS) {
      const wrong = loadWrongSet(k.id);
      const seen = loadSeenMap(k.id);
      const stats = loadStats(k.id);

      const today = todayKey();
      const todaySeen = (seen[today] || []).length;

      // last 7 days accuracy
      let c = 0, t = 0;
      for (const d of last7) {
        const s = stats[d];
        if (!s) continue;
        c += (s.correct || 0);
        t += (s.total || 0);
      }
      const acc = t ? Math.round((c / t) * 100) : 0;

      const div = document.createElement("div");
      div.className = "kidCard";
      div.innerHTML = `
        <div class="kidName">🧒 ${k.name}</div>
        <div class="kv"><span>錯題本題數</span><b>${wrong.size}</b></div>
        <div class="kv"><span>今日已測（出題數）</span><b>${todaySeen}</b></div>
        <div class="kv"><span>近7日正確率</span><b>${t ? acc + "%" : "—"}</b></div>
        <div class="kv"><span>全站單字總數</span><b>${wordsCount || "—"}</b></div>
      `;
      root.appendChild(div);
    }
  }

  // ===== Boot by page
  (async () => {
    try {
      if (isHome) await bootHome();
      else if (isQuiz) await bootQuiz();
      else if (isParent) await bootParent();
    } catch (e) {
      // 靜默：避免頁面整個白掉
      console.error(e);
    }
  })();
})();
