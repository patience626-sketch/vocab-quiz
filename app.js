const WORDS_URL = "./words.json";

// ====== 使用者（五個小孩）設定 ======
const KID_OPTIONS = [
  { id: "xigua", name: "西瓜" },
  { id: "youzi", name: "柚子" },
  { id: "xiaole", name: "小樂" },
  { id: "apu", name: "阿噗" },
  { id: "anan", name: "安安" },
];

// 目前使用者（預設西瓜，可記住上次選擇）
let kidId = localStorage.getItem("vocab_kid_active") || "xigua";

function LS_WRONG_KEY() { return `vocab_wrong_v1_${kidId}`; }
function LS_STATS_KEY() { return `vocab_stats_v1_${kidId}`; }

// ====== 題庫/狀態 ======
let words = [];
let current = null;

let mode = "mc";      // "mc" | "type"
let pool = "all";     // "all" | "wrong"

// 本輪出題佇列：確保「一輪內不重複」
let queue = [];
let currentPoolSig = "";

// 答對自動跳題設定
const AUTO_NEXT_ON_CORRECT = true;

// ====== DOM helper ======
const el = (id) => document.getElementById(id);

// ====== localStorage helpers（依 kid 分開） ======
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

// ====== 題庫佇列：一輪內不重複 ======
function poolSignature() {
  // pool + kid + words.length + (若錯題本則錯題數) 形成簽名
  const wrong = loadWrongMap();
  let wrongCount = 0;

  if (pool === "wrong") {
    wrongCount = words.reduce((acc, w) => acc + ((wrong[w.id] || 0) > 0 ? 1 : 0), 0);
  }

  return `${kidId}|${pool}|${mode}|${words.length}|${wrongCount}`;
}

function buildQueue() {
  const wrong = loadWrongMap();
  const candidates = pool === "wrong"
    ? words.filter(w => (wrong[w.id] || 0) > 0)
    : words;

  queue = shuffle(candidates);
}

function pickQuestion() {
  const sig = poolSignature();

  // 1) 使用者切換 2) 模式/出題範圍切換 3) 題庫變動 4) 錯題數變動 → 重建 queue
  if (sig !== currentPoolSig || queue.length === 0) {
    currentPoolSig = sig;
    buildQueue();
  }

  if (queue.length === 0) return null;
  return queue.pop();
}

// ====== 統計顯示 ======
function renderStats() {
  const s = loadStats();
  const acc = s.total ? Math.round((s.correct / s.total) * 100) : 0;

  const wrong = loadWrongMap();
  const wrongCount = Object.values(wrong).filter(n => n > 0).length;

  const kidName = (KID_OPTIONS.find(k => k.id === kidId)?.name) || kidId;

  el("statsText").textContent =
    `使用者：${kidName}｜已作答 ${s.total} 題｜正確 ${s.correct}｜正確率 ${acc}%｜錯題數 ${wrongCount}`;
}

// ====== 題目呈現 ======
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

  renderStats();

  // 下一題按鈕預設：可按
  setNextButtonEnabled(true);
}

// 下一題按鈕：答對自動跳題，所以答對時把它暫時鎖一下（避免連點跳兩題）
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

// ====== 錯題紀錄規則 ======
function markWrong(q) {
  const wrong = loadWrongMap();
  wrong[q.id] = (wrong[q.id] || 0) + 1;
  saveWrongMap(wrong);
}

function markCorrect(q) {
  const wrong = loadWrongMap();
  // 你原本是「答對就清零」：保留此行為
  if (wrong[q.id]) wrong[q.id] = 0;
  saveWrongMap(wrong);
}

// ====== 作答結果 & 跳題規則 ======
function showResult({ isCorrect, correctEn, userAnswer = null }) {
  lockAnswerUI();

  // 統計
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

  // ✅ 你要的跳題邏輯：
  // - 答對：自動下一題
  // - 答錯：不自動，等你按「下一題」
  if (isCorrect && AUTO_NEXT_ON_CORRECT) {
    // 避免雙擊造成跳兩題：先暫時鎖下一題按鈕
    setNextButtonEnabled(false);

    // 給小孩一點時間看到「正確」與答案，再跳題（可自行調整 500~1200ms）
    setTimeout(() => {
      nextQuestion();
    }, 700);
  } else {
    // 答錯：維持按鈕可按，讓你手動下一題
    setNextButtonEnabled(true);
  }
}

// ====== 出題模式：選擇題 ======
function renderMultipleChoice(container, q) {
  // 干擾選項：至少需要 3 個其它單字
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

// ====== 出題模式：輸入題 ======
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

// ====== 下一題（核心流程） ======
function nextQuestion() {
  const q = pickQuestion();

  if (!q) {
    el("answerArea").innerHTML = "";
    el("resultArea").innerHTML =
      `<span class="badge no">⚠️ 目前沒有可練習的題目</span>
       <div class="reveal">如果你選了「錯題本」，但目前錯題數是 0，就會出現這個提示。</div>`;
    setNextButtonEnabled(true);
    return;
  }

  renderQuestion(q);
}

// ====== 初始化 ======
async function init() {
  // 讀取 words
  const res = await fetch(WORDS_URL, { cache: "no-store" });
  words = await res.json();
  words = (words || []).filter(w => w && w.id && w.zh && w.en && w.img);

  // 基本檢查：選擇題至少需要 4 筆
  if (words.length < 4) {
    el("resultArea").innerHTML =
      `<span class="badge no">⚠️ 單字至少建議 4 個以上（選擇題需要干擾選項）</span>`;
  }

  // 讓 voice list 在部分瀏覽器先初始化
  if ("speechSynthesis" in window) window.speechSynthesis.getVoices();

  // 1) 使用者選單
  const kidSelect = el("kidSelect");
  if (kidSelect) {
    kidSelect.value = kidId;
    kidSelect.addEventListener("change", (e) => {
      kidId = e.target.value;
      localStorage.setItem("vocab_kid_active", kidId);

      // 切換小孩：重建 queue，避免混題
      queue = [];
      currentPoolSig = "";

      renderStats();
      nextQuestion();
    });
  }

  // 2) 模式切換
  el("modeSelect").addEventListener("change", (e) => {
    mode = e.target.value;

    // 模式變：重建 queue
    queue = [];
    currentPoolSig = "";

    nextQuestion();
  });

  // 3) 出題範圍切換
  el("poolSelect").addEventListener("change", (e) => {
    pool = e.target.value;

    // 範圍變：重建 queue
    queue = [];
    currentPoolSig = "";

    nextQuestion();
  });

  // 4) 下一題
  el("btnNext").addEventListener("click", () => nextQuestion());

  // 5) 發音
  el("btnSpeak").addEventListener("click", () => {
    if (!current) return;
    speak(current.en);
  });

  // 6) 清除錯題：只清「目前選擇的那個小孩」
  el("btnResetWrong").addEventListener("click", () => {
    localStorage.removeItem(LS_WRONG_KEY());
    localStorage.removeItem(LS_STATS_KEY());

    // 清除後可能影響錯題本的題目數：重建 queue
    queue = [];
    currentPoolSig = "";

    renderStats();
    nextQuestion();
  });

  // 先出第一題
  renderStats();
  nextQuestion();
}

init().catch(err => {
  console.error(err);
  el("resultArea").innerHTML = `<span class="badge no">⚠️ 載入失敗：請確認 words.json 路徑與格式</span>`;
});
