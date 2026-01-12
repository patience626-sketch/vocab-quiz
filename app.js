/* ========= Config ========= */
const WORDS_URL = "./words.json";

// 分類固定清單（要跟 admin/tool 一致）
const FIXED_CATEGORIES = [
  "水果","動物","交通工具","食物","顏色","身體","家庭","學校用品","自然","運動","職業","其他"
];
const FIXED_SET = new Set(FIXED_CATEGORIES);

/* ========= LocalStorage keys ========= */
function lsKidActive(){ return "vocab_kid_active"; }
function lsNewKey(kidId){ return `vocab_new_v1_${kidId}`; }
function lsWrongKey(kidId){ return `vocab_wrong_v1_${kidId}`; }     // Set of ids
function lsSeenKey(kidId){ return `vocab_seen_v1_${kidId}`; }       // [{date, ids:[]}, ...]
function lsCatOverrideKey(){ return "vocab_cat_override_v1"; }       // {id: cat}

/* ========= Utilities ========= */
const $ = (id) => document.getElementById(id);

function norm(s){ return String(s || "").trim(); }
function normLower(s){ return norm(s).toLowerCase(); }

function todayKey(){
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function shuffle(arr){
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--){
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function loadJSON(key, fallback){
  try{
    const v = JSON.parse(localStorage.getItem(key) || "");
    return v ?? fallback;
  }catch{
    return fallback;
  }
}

function saveJSON(key, val){
  localStorage.setItem(key, JSON.stringify(val));
}

function loadIdSet(key){
  const arr = loadJSON(key, []);
  if (!Array.isArray(arr)) return new Set();
  return new Set(arr);
}
function saveIdSet(key, set){
  saveJSON(key, Array.from(set));
}

function normalizeCat(raw){
  const c = norm(raw);
  return FIXED_SET.has(c) ? c : "";
}

function loadCatOverride(){
  return loadJSON(lsCatOverrideKey(), {});
}

function effectiveCatOf(word, catOv){
  return normalizeCat(catOv[word.id] ?? word.cat ?? "");
}

/* ========= Seen history ========= */
function loadSeen(kidId){
  return loadJSON(lsSeenKey(kidId), []);
}
function saveSeen(kidId, daysArr){
  saveJSON(lsSeenKey(kidId), daysArr.slice(0, 30)); // keep last 30 records
}
function collectRecentSeenSet(kidId, avoidDays){
  const set = new Set();
  if (!avoidDays || avoidDays <= 0) return set;

  const days = loadSeen(kidId);
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - avoidDays);

  for (const rec of days){
    const dt = new Date(rec.date + "T00:00:00");
    if (dt >= cutoff){
      for (const id of (rec.ids || [])) set.add(id);
    }
  }
  return set;
}
function markSeenToday(kidId, wordId){
  const days = loadSeen(kidId);
  const t = todayKey();
  let rec = days.find(x => x.date === t);
  if (!rec){
    rec = { date: t, ids: [] };
    days.unshift(rec);
  }
  if (!rec.ids.includes(wordId)) rec.ids.push(wordId);
  saveSeen(kidId, days);
}

/* ========= TTS (Google translate TTS) ========= */
let audio = new Audio();
audio.preload = "none";

function speakEN(text){
  const q = encodeURIComponent(text);
  // Google translate TTS (works as audio src in most browsers)
  const url = `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=en&q=${q}`;
  audio.src = url;
  audio.play().catch(() => {
    // fallback to Web Speech if blocked
    try{
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "en-US";
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
    }catch{}
  });
}

/* ========= App State ========= */
const state = {
  words: [],
  kidId: localStorage.getItem(lsKidActive()) || "xigua",

  // current quiz
  queue: [],
  idx: 0,
  current: null,
  answered: false,
  correctCount: 0,
  wrongCount: 0
};

/* ========= DOM ========= */
const dom = {
  kidSelect: $("kidSelect"),
  poolSelect: $("poolSelect"),
  catSelect: $("catSelect"),
  numQuestions: $("numQuestions"),
  avoidDays: $("avoidDays"),
  btnStart: $("btnStart"),
  btnReset: $("btnReset"),

  progress: $("progress"),
  qImg: $("qImg"),
  qZh: $("qZh"),
  qEn: $("qEn"),
  btnSpeak: $("btnSpeak"),

  answerMode: $("answerMode"),
  mcArea: $("mcArea"),
  typeArea: $("typeArea"),
  typeInput: $("typeInput"),
  btnCheck: $("btnCheck"),

  result: $("result"),
  btnNext: $("btnNext"),
  btnShowEn: $("btnShowEn"),

  statCorrect: $("statCorrect"),
  statWrong: $("statWrong"),
  statWrongBank: $("statWrongBank"),
  statNewBank: $("statNewBank")
};

function updateStats(){
  dom.statCorrect.textContent = String(state.correctCount);
  dom.statWrong.textContent = String(state.wrongCount);

  const wrongSet = loadIdSet(lsWrongKey(state.kidId));
  const newSet = loadIdSet(lsNewKey(state.kidId));
  dom.statWrongBank.textContent = String(wrongSet.size);
  dom.statNewBank.textContent = String(newSet.size);
}

function setResult(text, ok){
  dom.result.textContent = text;
  dom.result.classList.remove("ok","no");
  if (ok === true) dom.result.classList.add("ok");
  if (ok === false) dom.result.classList.add("no");
}

/* ========= Build pools ========= */
function getPoolWords(){
  const pool = dom.poolSelect.value;
  const catFilter = dom.catSelect.value || "";

  const catOv = loadCatOverride();
  let base = state.words.slice();

  // apply category filter (using effective cat)
  if (catFilter){
    base = base.filter(w => effectiveCatOf(w, catOv) === catFilter);
  }

  if (pool === "all") return base;

  if (pool === "new"){
    const newSet = loadIdSet(lsNewKey(state.kidId));
    return base.filter(w => newSet.has(w.id));
  }

  if (pool === "wrong"){
    const wrongSet = loadIdSet(lsWrongKey(state.kidId));
    return base.filter(w => wrongSet.has(w.id));
  }

  return base;
}

function buildTodayQuiz(){
  const poolWords = getPoolWords();
  const numQ = parseInt(dom.numQuestions.value, 10) || 20;
  const avoidDays = parseInt(dom.avoidDays.value, 10) || 0;

  // Avoid seen in last N days (per kid)
  const recentSeen = collectRecentSeenSet(state.kidId, avoidDays);

  // Also avoid duplicates within this run (by selection logic)
  const fresh = poolWords.filter(w => !recentSeen.has(w.id));

  let selected = shuffle(fresh).slice(0, numQ);

  // fallback if not enough: fill from remaining pool
  if (selected.length < Math.min(numQ, poolWords.length)){
    const picked = new Set(selected.map(x => x.id));
    const fallback = shuffle(poolWords.filter(w => !picked.has(w.id)));
    selected = selected.concat(fallback.slice(0, numQ - selected.length));
  }

  // If poolWords smaller than numQ, just use all available
  if (selected.length === 0 && poolWords.length > 0){
    selected = shuffle(poolWords).slice(0, Math.min(numQ, poolWords.length));
  }

  return selected;
}

/* ========= Question rendering ========= */
function updateProgress(){
  if (!state.queue.length){
    dom.progress.textContent = "尚未開始";
    return;
  }
  dom.progress.textContent = `第 ${state.idx + 1} / ${state.queue.length} 題（本輪不重複）`;
}

function setEnglishVisible(visible){
  dom.qEn.classList.toggle("hidden", !visible);
}

function renderChoices(correctWord){
  dom.mcArea.innerHTML = "";

  // pick 3 distractors
  const candidates = state.words.filter(w => w.id !== correctWord.id);
  const distractors = shuffle(candidates).slice(0, 3);

  const options = shuffle([correctWord, ...distractors]).map(w => w.en);

  for (const opt of options){
    const btn = document.createElement("button");
    btn.className = "choiceBtn";
    btn.type = "button";
    btn.textContent = opt;
    btn.onclick = () => checkAnswer(opt);
    dom.mcArea.appendChild(btn);
  }
}

function showQuestion(){
  state.answered = false;
  setResult("", null);
  dom.btnNext.classList.add("hidden");
  dom.btnShowEn.classList.add("hidden");
  setEnglishVisible(false);

  if (!state.queue.length){
    dom.qZh.textContent = "題庫為空（請先匯入 words.json 或在後台標新學/錯題）";
    dom.qImg.src = "";
    dom.qImg.style.display = "none";
    dom.qEn.textContent = "";
    updateProgress();
    return;
  }

  state.current = state.queue[state.idx];
  const w = state.current;

  dom.qZh.textContent = w.zh || "";
  dom.qEn.textContent = w.en || "";
  dom.qImg.style.display = "";
  dom.qImg.src = w.img || "";
  dom.qImg.onerror = () => { dom.qImg.style.display = "none"; };

  // mark seen today (when shown)
  markSeenToday(state.kidId, w.id);

  // answer mode UI
  const mode = dom.answerMode.value;
  dom.typeArea.classList.toggle("hidden", mode !== "type");
  dom.mcArea.classList.toggle("hidden", mode !== "mc");
  dom.typeInput.value = "";

  if (mode === "mc"){
    renderChoices(w);
  }

  updateProgress();
  updateStats();
}

/* ========= Answer checking ========= */
function recordWrong(wordId){
  const wrongSet = loadIdSet(lsWrongKey(state.kidId));
  wrongSet.add(wordId);
  saveIdSet(lsWrongKey(state.kidId), wrongSet);
}

function clearWrongIfCorrect(wordId){
  // optional: if user wants correct to remove from wrong bank; keep it for reinforcement?
  // Here: remove if correct
  const wrongSet = loadIdSet(lsWrongKey(state.kidId));
  if (wrongSet.has(wordId)){
    wrongSet.delete(wordId);
    saveIdSet(lsWrongKey(state.kidId), wrongSet);
  }
}

function checkAnswer(userAns){
  if (!state.current || state.answered) return;

  const correct = normLower(state.current.en);
  const got = normLower(userAns);

  state.answered = true;

  // show "show english" button always after answered
  dom.btnShowEn.classList.remove("hidden");

  if (got === correct){
    state.correctCount += 1;
    clearWrongIfCorrect(state.current.id);

    setResult("✅ 答對！", true);

    // show english after answering (you requested)
    setEnglishVisible(true);

    // auto next (答對自動跳)
    setTimeout(() => nextQuestionAuto(), 450);
  }else{
    state.wrongCount += 1;
    recordWrong(state.current.id);

    setResult(`❌ 答錯（你選：${userAns}）`, false);
    // show English after answered only if they click "顯示英文" (default hidden)
    setEnglishVisible(false);

    // wrong: require manual "Next"
    dom.btnNext.classList.remove("hidden");
  }

  updateStats();
}

function nextQuestionAuto(){
  if (!state.queue.length) return;

  // if already at end, show finish
  if (state.idx >= state.queue.length - 1){
    finishRound();
    return;
  }

  state.idx += 1;
  showQuestion();
}

function finishRound(){
  dom.btnNext.classList.add("hidden");
  dom.btnShowEn.classList.add("hidden");
  setEnglishVisible(true);
  dom.qEn.textContent = "";

  dom.qZh.textContent = `本輪完成！正確 ${state.correctCount} / ${state.queue.length}，錯誤 ${state.wrongCount}`;
  dom.qImg.src = "";
  dom.qImg.style.display = "none";
  dom.progress.textContent = `完成（共 ${state.queue.length} 題）`;
}

/* ========= Event wiring ========= */
async function loadWords(){
  const res = await fetch(WORDS_URL, { cache: "no-store" });
  const data = await res.json();

  // normalize
  const arr = Array.isArray(data) ? data : [];
  const cleaned = arr
    .filter(w => w && w.id && w.zh && w.en)
    .map(w => ({
      id: String(w.id).trim(),
      zh: String(w.zh).trim(),
      en: String(w.en).trim(),
      img: String(w.img || "").trim(),
      cat: normalizeCat(w.cat || "")
    }));

  state.words = cleaned;
}

function renderCategoryOptions(){
  // category list from fixed + data (but since we enforce fixed, just fixed)
  dom.catSelect.innerHTML = `<option value="">全部</option>` + FIXED_CATEGORIES.map(c => `<option value="${c}">${c}</option>`).join("");
}

function startRound(){
  // reset counters
  state.correctCount = 0;
  state.wrongCount = 0;
  state.idx = 0;

  // build queue
  state.queue = buildTodayQuiz();
  showQuestion();
}

function resetUI(){
  state.queue = [];
  state.idx = 0;
  state.current = null;
  state.answered = false;
  state.correctCount = 0;
  state.wrongCount = 0;

  dom.qZh.textContent = "按「開始」出題";
  dom.qEn.textContent = "";
  dom.qImg.src = "";
  dom.qImg.style.display = "none";
  dom.btnNext.classList.add("hidden");
  dom.btnShowEn.classList.add("hidden");
  setEnglishVisible(false);
  setResult("", null);
  updateProgress();
  updateStats();
}

function bindEvents(){
  dom.kidSelect.value = state.kidId;

  dom.kidSelect.addEventListener("change", () => {
    state.kidId = dom.kidSelect.value;
    localStorage.setItem(lsKidActive(), state.kidId);
    resetUI();
  });

  dom.poolSelect.addEventListener("change", resetUI);
  dom.catSelect.addEventListener("change", resetUI);
  dom.numQuestions.addEventListener("change", resetUI);
  dom.avoidDays.addEventListener("change", resetUI);

  dom.answerMode.addEventListener("change", () => {
    // rerender choices for current
    if (state.queue.length) showQuestion();
  });

  dom.btnStart.addEventListener("click", startRound);
  dom.btnReset.addEventListener("click", resetUI);

  dom.btnSpeak.addEventListener("click", () => {
    if (!state.current) return;
    speakEN(state.current.en);
  });

  dom.btnCheck.addEventListener("click", () => {
    if (!state.current) return;
    checkAnswer(dom.typeInput.value);
  });

  dom.typeInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter"){
      e.preventDefault();
      dom.btnCheck.click();
    }
  });

  dom.btnNext.addEventListener("click", () => {
    // manual next
    nextQuestionAuto();
  });

  dom.btnShowEn.addEventListener("click", () => {
    if (!state.current) return;
    setEnglishVisible(true);
  });
}

/* ========= Boot ========= */
(async function boot(){
  try{
    await loadWords();
    renderCategoryOptions();
    bindEvents();
    resetUI();
  }catch(err){
    console.error(err);
    dom.qZh.textContent = "載入失敗：請確認 words.json 存在且是有效 JSON";
  }
})();
