const WORDS_URL = "./words.json";

// ====== 使用者（五個小孩）設定 ======
const KID_OPTIONS = [
  { id: "xigua", name: "西瓜" },
  { id: "youzi", name: "柚子" },
  { id: "xiaole", name: "小樂" },
  { id: "apu", name: "阿噗" },
  { id: "anan", name: "安安" },
];

let kidId = localStorage.getItem("vocab_kid_active") || "xigua";
function LS_WRONG_KEY() { return `vocab_wrong_v1_${kidId}`; }
function LS_STATS_KEY() { return `vocab_stats_v1_${kidId}`; }
function LS_NEW_KEY() { return `vocab_new_v1_${kidId}`; } // ✅ 新學清單（每個小孩各自）

// ====== 題庫/狀態 ======
let words = [];
let current = null;

let mode = "mc";      // "mc" | "type"
let pool = "all";     // "all" | "wrong" | "new" | "category"
let selectedCat = ""; // pool=category 時使用

// 本輪出題佇列（確保一輪內不重複）
let queue = [];
let currentPoolSig = "";

// 答對自動跳題
const AUTO_NEXT_ON_CORRECT = true;
const AUTO_NEXT_DELAY_MS = 700;

// ====== DOM helper ======
const el = (id) => document.getElementById(id);

// ====== localStorage helpers ======
function loadWrongMap() {
  try { return JSON.parse(localStorage.getItem(LS_WRONG_KEY()) || "{}"); }
  catch { return {}; }
}
function saveWrongMap(map) {
  localStorage.setItem(LS_WRONG_KEY(), JSON.stringify(map));
}
function loadStats() {
  try { return JSON.parse(localStorage.getItem(LS_STATS_KEY()) || '{"total":0,"correct":0}'); }
  catch { return { total: 0, correct: 0 }; }
}
function saveStats(s) {
  localStorage.setItem(LS_STATS_KEY(), JSON.stringify(s));
}

// 新學清單：用 Set 存 id
function loadNewSet() {
  try {
    const arr = JSON.parse(localStorage.getItem(LS_NEW_KEY()) || "[]");
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}
function saveNewSet(set) {
  localStorage.setItem(LS_NEW_KEY(), JSON.stringify(Array.from(set)));
}

// ====== utils ======
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, m => ({
    "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"
  }[m]));
}

// ====== 發音 ======
function speak(enText) {
  if (!("speechSynthesis" in window)) {
    alert("這個瀏覽器不支援語音發音（speechSynthesis）。可以改用 Chrome 試試。");
    return;
  }
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(enText);
  const voices = window.speechSynthesis.getVoices?.() || [];
  const enVoice = voices.find(v => /en/i.test(v.lang)) || null;
  if (enVoice) u.voice = enVoice;
  u.lang = "en-US";
  u.rate = 0.95;
  window.speechSynthesis.speak(u);
}

// ====== 分類列表 ======
function getAllCategories() {
  const cats = new Set();
  for (const w of words) {
    if (w.cat && String(w.cat).trim()) cats.add(String(w.cat).trim());
  }
  return Array.from(cats).sort((a,b)=>a.localeCompare(b, "zh-Hant"));
}

function refreshCategorySelectUI() {
  const catPill = el("catPill");
  const catSelect = el("catSelect");
  if (!catPill || !catSelect) return;

  if (pool !== "category") {
    catPill.style.display = "none";
    return;
  }
  catPill.style.display = "flex";

  const cats = getAllCategories();
  catSelect.innerHTML = "";

  // 若沒有分類
  if (cats.length === 0) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "（尚無分類）";
    catSelect.appendChild(opt);
    selectedCat = "";
    return;
  }

  // 若還沒選過分類，預設第一個
  if (!selectedCat || !cats.includes(selectedCat)) selectedCat = cats[0];

  for (const c of cats) {
    const opt = document.createElement("option");
    opt.value = c;
    opt.textContent = c;
    catSelect.appendChild(opt);
  }
  catSelect.value = selectedCat;
}

// ====== 題庫佇列：一輪內不重複 ======
function poolSignature() {
  const wrong = loadWrongMap();
  const newSet = loadNewSet();

  let wrongCount = 0;
  let newCount = 0;
  let catCount = 0;

  if (pool === "wrong") {
    wrongCount = words.reduce((acc, w) => acc + ((wrong[w.id] || 0) > 0 ? 1 : 0), 0);
  }
  if (pool === "new") {
    newCount = words.reduce((acc, w) => acc + (newSet.has(w.id) ? 1 : 0), 0);
  }
  if (pool === "category") {
    catCount = words.reduce((acc, w) => acc + (String(w.cat||"").trim() === String(selectedCat||"").trim() ? 1 : 0), 0);
  }

  return `${kidId}|${pool}|${mode}|${words.length}|${wrongCount}|${newCount}|${selectedCat}|${catCount}`;
}

function buildQueue() {
  const wrong = loadWrongMap();
  const newSet = loadNewSet();
  const cat = String(selectedCat || "").trim();

  let candidates = words;

  if (pool === "wrong") {
    candidates = words.filter(w => (wrong[w.id] || 0) > 0);
  } else if (pool === "new") {
    candidates = words.filter(w => newSet.has(w.id));
  } else if (pool === "category") {
    candidates = words.filter(w => String(w.cat || "").trim() === cat);
  }

  queue = shuffle(candidates);
}

function pickQuestion() {
  const sig = poolSignature();

  if (sig !== currentPoolSig || queue.length === 0) {
    currentPoolSig = sig;
    buildQueue();
  }

  if (queue.length === 0) return null;
  return queue.pop();
}

// ====== 統計顯示 ======
function poolLabel() {
  if (pool === "all") return "全部";
  if (pool === "wrong") return "錯題本";
  if (pool === "new") return "新學";
  if (pool === "category") return `分類：${selectedCat || "（未選）"}`;
  return pool;
}

function renderStats() {
  const s = loadStats();
  const acc = s.total ? Math.round((s.correct / s.total) * 100) : 0;

  const wrong = loadWrongMap();
  const wrongCount = Object.values(wrong).filter(n => n > 0).length;

  const newSet = loadNewSet();
  const newCount = newSet.size;

  const kidName = (KID_OPTIONS.find(k => k.id === kidId)?.name) || kidId;

  el("statsText").textContent =
    `使用者：${kidName}｜範圍：${poolLabel()}｜新學：${newCount}｜已作答 ${s.total} 題｜正確 ${s.correct}｜正確率 ${acc}%｜錯題數 ${wrongCount}`;
}

// ====== 題目呈現 ======
function setNextButtonEnabled(enabled) {
  const btn = el("btnNext");
  if (!btn) return;
  btn.disabled = !enabled;
  btn.style.opacity = enabled ? "1" : "0.6";
  btn.style.cursor = enabled ? "pointer" : "not-allowed";
}

function lockAnswerUI() {
  document.querySelectorAll(".opt").forEach(btn => btn.disabled = true);
  const input = document.querySelector("#typeInput");
  const submit = document.querySelector("#btnSubmit");
  if (input) input.disabled = true;
  if (submit) submit.disabled = true;
}

function updateNewButtonUI() {
  const btn = el("btnToggleNew");
  if (!btn || !current) return;

  const newSet = loadNewSet();
  const isNew = newSet.has(current.id);

  btn.textContent = isNew ? "⭐ 已加入" : "⭐ 新學";
}

function renderQuestion(q) {
  current = q;

  el("zhText").textContent = q.zh;

  const img = el("img");
  img.src = q.img;
  img.onerror = () => {
    img.alt = "圖片載入失敗（請確認 words.json 的 img 路徑）";
  };

  el("resultArea").innerHTML = "";
  const area = el("answerArea");
  area.innerHTML = "";

  if (mode === "mc") renderMultipleChoice(area, q);
  else renderTyping(area, q);

  updateNewButtonUI();
  renderStats();
  setNextButtonEnabled(true);
}

// ====== 錯題紀錄 ======
function markWrong(q) {
  const wrong = loadWrongMap();
  wrong[q.id] = (wrong[q.id] || 0) + 1;
  saveWrongMap(wrong);
}

function markCorrect(q) {
  const wrong = loadWrongMap();
  if (wrong[q.id]) wrong[q.id] = 0;
  saveWrongMap(wrong);
}

// ====== 作答結果 & 跳題規則 ======
function showResult({ isCorrect, correctEn, userAnswer = null }) {
  lockAnswerUI();

  const s = loadStats();
  s.total += 1;
  if (isCorrect) s.correct += 1;
  saveStats(s);

  const badge = isCorrect
    ? `<span class="badge ok">✅ 正確</span>`
    : `<span class="badge no">❌ 錯誤</span>`;

  const ua = userAnswer !== null ? `你的答案：<strong>${escapeHtml(userAnswer)}</strong>　` : "";
  const reveal = `<div class="reveal">${ua}正確英文：<strong>${escapeHtml(correctEn)}</strong></div>`;

  el("resultArea").innerHTML = `${badge}${reveal}`;
  renderStats();

  if (isCorrect && AUTO_NEXT_ON_CORRECT) {
    setNextButtonEnabled(false);
    setTimeout(() => nextQuestion(), AUTO_NEXT_DELAY_MS);
  } else {
    setNextButtonEnabled(true);
  }
}

// ====== 出題：選擇題 ======
function renderMultipleChoice(container, q) {
  const others = words.filter(w => w.id !== q.id).map(w => w.en);
  const distractors = shuffle(others).slice(0, 3);
  const options = shuffle([q.en, ...distractors]);

  const wrap = document.createElement("div");
  wrap.className = "options";

  options.forEach(opt => {
    const btn = document.createElement("button");
    btn.className = "opt";
    btn.type = "button";
    btn.textContent = opt;

    btn.onclick = () => {
      const isCorrect = opt.toLowerCase().trim() === q.en.toLowerCase().trim();
      if (isCorrect) markCorrect(q);
      else markWrong(q);

      showResult({ isCorrect, correctEn: q.en, userAnswer: opt });
    };

    wrap.appendChild(btn);
  });

  container.appendChild(wrap);
}

// ====== 出題：輸入題 ======
function renderTyping(container, q) {
  const box = document.createElement("div");
  box.className = "typebox";

  const input = document.createElement("input");
  input.id = "typeInput";
  input.placeholder = "輸入英文單字";
  input.autocomplete = "off";
  input.spellcheck = false;

  const btn = document.createElement("button");
  btn.id = "btnSubmit";
  btn.className = "btn primary";
  btn.type = "button";
  btn.textContent = "送出";

  const submit = () => {
    const val = (input.value || "").trim();
    if (!val) return;

    const isCorrect = val.toLowerCase() === q.en.toLowerCase();

    if (isCorrect) markCorrect(q);
    else markWrong(q);

    showResult({ isCorrect, correctEn: q.en, userAnswer: val });
  };

  btn.onclick = submit;
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") submit();
  });

  box.appendChild(input);
  box.appendChild(btn);
  container.appendChild(box);
}

// ====== 下一題 ======
function nextQuestion() {
  // 分類 UI 依 pool 顯示/更新
  refreshCategorySelectUI();

  const q = pickQuestion();
  if (!q) {
    el("answerArea").innerHTML = "";
    el("resultArea").innerHTML =
      `<span class="badge no">⚠️ 目前沒有可練習的題目</span>
       <div class="reveal">
         可能原因：<br>
         • 你選了「錯題本」但錯題數是 0<br>
         • 你選了「新學」但尚未加入新學單字<br>
         • 你選了「分類」但該分類目前沒有單字<br>
       </div>`;
    setNextButtonEnabled(true);
    renderStats();
    return;
  }

  renderQuestion(q);
}

// ====== 切換小孩/範圍時重建 ======
function resetQueue() {
  queue = [];
  currentPoolSig = "";
}

// ====== 初始化 ======
async function init() {
  const res = await fetch(WORDS_URL, { cache: "no-store" });
  words = await res.json();

  // 需要 cat 欄位（方案A），但如果有漏也不致命：只是分類會少
  words = (words || []).filter(w => w && w.id && w.zh && w.en && w.img);

  if (words.length < 4) {
    el("resultArea").innerHTML =
      `<span class="badge no">⚠️ 單字至少建議 4 個以上（選擇題需要干擾選項）</span>`;
  }

  if ("speechSynthesis" in window) window.speechSynthesis.getVoices();

  // 1) 使用者選單（你已經有）
  const kidSelect = el("kidSelect");
  if (kidSelect) {
    kidSelect.value = kidId;
    kidSelect.addEventListener("change", (e) => {
      kidId = e.target.value;
      localStorage.setItem("vocab_kid_active", kidId);
      resetQueue();
      renderStats();
      nextQuestion();
    });
  }

  // 2) 模式
  el("modeSelect").addEventListener("change", (e) => {
    mode = e.target.value;
    resetQueue();
    nextQuestion();
  });

  // 3) 出題範圍
  el("poolSelect").addEventListener("change", (e) => {
    pool = e.target.value;
    resetQueue();
    refreshCategorySelectUI();
    nextQuestion();
  });

  // 4) 分類下拉
  const catSelect = el("catSelect");
  if (catSelect) {
    catSelect.addEventListener("change", (e) => {
      selectedCat = e.target.value;
      resetQueue();
      nextQuestion();
    });
  }

  // 5) 下一題
  el("btnNext").addEventListener("click", () => nextQuestion());

  // 6) 發音
  el("btnSpeak").addEventListener("click", () => {
    if (!current) return;
    speak(current.en);
  });

  // 7) ⭐ 新學（加入/移除）
  const btnToggleNew = el("btnToggleNew");
  if (btnToggleNew) {
    btnToggleNew.addEventListener("click", () => {
      if (!current) return;
      const set = loadNewSet();
      if (set.has(current.id)) set.delete(current.id);
      else set.add(current.id);
      saveNewSet(set);

      // 若現在正在「新學」範圍，新增/移除會改變 candidates → 重建 queue
      resetQueue();
      updateNewButtonUI();
      renderStats();
    });
  }

  // 8) 清除錯題（只清目前小孩）
  el("btnResetWrong").addEventListener("click", () => {
    localStorage.removeItem(LS_WRONG_KEY());
    localStorage.removeItem(LS_STATS_KEY());
    resetQueue();
    renderStats();
    nextQuestion();
  });

  // 初始分類 UI
  refreshCategorySelectUI();

  // 初始出題
  renderStats();
  nextQuestion();
}

init().catch(err => {
  console.error(err);
  el("resultArea").innerHTML = `<span class="badge no">⚠️ 載入失敗：請確認 words.json 路徑與格式</span>`;
});
