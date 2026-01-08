const WORDS_URL = "./words.json";
const LS_WRONG_KEY = "vocab_wrong_v1";
const LS_STATS_KEY = "vocab_stats_v1";

let words = [];
let current = null;

let mode = "mc";      // "mc" | "type"
let pool = "all";     // "all" | "wrong"

const el = (id) => document.getElementById(id);

function loadWrongMap() {
  try { return JSON.parse(localStorage.getItem(LS_WRONG_KEY) || "{}"); }
  catch { return {}; }
}
function saveWrongMap(map) {
  localStorage.setItem(LS_WRONG_KEY, JSON.stringify(map));
}
function loadStats() {
  try { return JSON.parse(localStorage.getItem(LS_STATS_KEY) || '{"total":0,"correct":0}'); }
  catch { return { total: 0, correct: 0 }; }
}
function saveStats(s) {
  localStorage.setItem(LS_STATS_KEY, JSON.stringify(s));
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pickQuestion() {
  const wrong = loadWrongMap();
  const candidates = pool === "wrong"
    ? words.filter(w => (wrong[w.id] || 0) > 0)
    : words;

  if (candidates.length === 0) return null;
  const idx = Math.floor(Math.random() * candidates.length);
  return candidates[idx];
}

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

function renderStats() {
  const s = loadStats();
  const acc = s.total ? Math.round((s.correct / s.total) * 100) : 0;
  const wrong = loadWrongMap();
  const wrongCount = Object.values(wrong).filter(n => n > 0).length;
  el("statsText").textContent = `已作答 ${s.total} 題｜正確 ${s.correct}｜正確率 ${acc}%｜錯題數 ${wrongCount}`;
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

  renderStats();
}

function lockAnswerUI() {
  document.querySelectorAll(".opt").forEach(btn => btn.disabled = true);
  const input = document.querySelector("#typeInput");
  const submit = document.querySelector("#btnSubmit");
  if (input) input.disabled = true;
  if (submit) submit.disabled = true;
}

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

function showResult(isCorrect, correctEn, userAnswer = null) {
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
}

function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, m => ({
    "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"
  }[m]));
}

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
      showResult(isCorrect, q.en, opt);
    };

    wrap.appendChild(btn);
  });

  container.appendChild(wrap);
}

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
    showResult(isCorrect, q.en, val);
  };

  btn.onclick = submit;
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") submit();
  });

  box.appendChild(input);
  box.appendChild(btn);
  container.appendChild(box);
}

function nextQuestion() {
  const q = pickQuestion();
  if (!q) {
    el("answerArea").innerHTML = "";
    el("resultArea").innerHTML =
      `<span class="badge no">⚠️ 目前沒有可練習的題目</span>
       <div class="reveal">如果你選了「錯題本」，但目前錯題數是 0，就會出現這個提示。</div>`;
    return;
  }
  renderQuestion(q);
}

async function init() {
  el("modeSelect").addEventListener("change", (e) => {
    mode = e.target.value;
    nextQuestion();
  });

  el("poolSelect").addEventListener("change", (e) => {
    pool = e.target.value;
    nextQuestion();
  });

  el("btnNext").addEventListener("click", () => nextQuestion());

  el("btnSpeak").addEventListener("click", () => {
    if (!current) return;
    speak(current.en);
  });

  el("btnResetWrong").addEventListener("click", () => {
    localStorage.removeItem(LS_WRONG_KEY);
    localStorage.removeItem(LS_STATS_KEY);
    renderStats();
    nextQuestion();
  });

  const res = await fetch(WORDS_URL, { cache: "no-store" });
  words = await res.json();

  words = (words || []).filter(w => w && w.id && w.zh && w.en && w.img);
  if (words.length < 4) {
    el("resultArea").innerHTML =
      `<span class="badge no">⚠️ 單字至少建議 4 個以上（選擇題需要干擾選項）</span>`;
  }

  if ("speechSynthesis" in window) window.speechSynthesis.getVoices();

  nextQuestion();
}

init().catch(err => {
  console.error(err);
  el("resultArea").innerHTML = `<span class="badge no">⚠️ 載入失敗：請確認 words.json 路徑與格式</span>`;
});
