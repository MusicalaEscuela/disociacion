/* Manos en Movimiento — Musicala 2025
   Versión con “clic” sonoro por beat (Web Audio API)
   Tamaño adaptativo y niveles de dificultad 🥁
*/

// ------- Elementos del DOM -------
const YEAR_EL    = document.getElementById("year");
const SEQ_WRAP   = document.getElementById("sequence");
const COMBO_TXT  = document.getElementById("comboText");

const LEN_SEL    = document.getElementById("lenSel");
const PLAY_BTN   = document.getElementById("playBtn");
const STOP_BTN   = document.getElementById("stopBtn");
const GEN_BTN    = document.getElementById("genBtn");

const SPEED_BTNS = document.querySelectorAll(".speed-btn");

const LEVEL_SEL  = document.getElementById("levelSel");
const PREV_BTN   = document.getElementById("prevBtn");
const NEXT_BTN   = document.getElementById("nextBtn");

// ------- Imágenes -------
const RIGHT_IMG  = encodeURI("Mano derecha.png");
const LEFT_IMG   = encodeURI("Mano Izquierda.png");

// ------- Estado global -------
let baseSequence   = ["R","L","R","L"];
let activeIndex    = -1;
let timerId        = null;
let bpm            = 60;   // por defecto: Lento
let presetIndex    = 0;

// Sonido
let audioCtx = null;
let soundEnabled = true; // si luego quieres un switch, solo lo cambiamos desde UI

// Tamaños sugeridos por longitud
const SIZE_MAP = {
  4:  { beat: 160, img: 120, colMin: 170, gap: 18 },
  8:  { beat: 120, img:  90, colMin: 130, gap: 16 },
  12: { beat:  95, img:  70, colMin: 105, gap: 14 }
};

// ------- Ejercicios predeterminados -------
const PRESETS = {
  basic: {
    4: ["R L R L","L R L R","R R L L","L L R R"],
    8: ["R L R L R L R L","L R L R L R L R","R R L L R R L L","R L L R R L L R"],
    12:["R L R L R L R L R L R L","L R L R L R L R L R L R","R R L L R R L L R R L L"]
  },
  intermediate: {
    4: ["R R L L","R L L R","R R R L","L L R R"],
    8: ["R R L L R R L L","R L L R R L L R","R R R L L L R R","R L R R L L R L"],
    12:["R R L L R R L L R R L L","R L L R R L L R R L L R","R R R L L L R R R L L L"]
  },
  advanced: {
    4: ["R L R R","L R L L","R R L R","L L R L"],
    8: ["R L R R L L R L","L R L L R R L R","R L R R L R L L","R R L R L L R L"],
    12:["R L R R L L R L R R L L","L R L L R R L R L L R R","R L R R L R L L R L R R"]
  }
};

// ------- Utilidades -------
const randBool = () => Math.random() < 0.5;
const msPerBeat = bpm => Math.round(60000 / Math.max(40, Math.min(300, bpm || 60)));
const toArray = str => str.trim().split(/\s+/);
const pretty = arr => arr.join(" ");

function generateRandomSequence(n) {
  const s = Array.from({length: n}, () => randBool() ? "R" : "L");
  const allR = s.every(x => x === "R");
  const allL = s.every(x => x === "L");
  if (allR || allL) s[Math.floor(Math.random()*n)] = allR ? "L" : "R";
  return s;
}

function getPresetList(level, n) {
  return PRESETS[level]?.[n] || [];
}

// ------- Sonido (Web Audio) -------
function ensureAudio() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === "suspended") audioCtx.resume();
}

// “Click” corto; pitches distintos: R (más agudo), L (más grave)
function playClick(hand = "R") {
  if (!soundEnabled) return;
  ensureAudio();

  const osc  = audioCtx.createOscillator();
  const gain = audioCtx.createGain();

  const now = audioCtx.currentTime;
  const freq = hand === "R" ? 1200 : 850;  // Hz
  const dur  = 0.06;                       // 60 ms
  const vol  = 0.22;                       // volumen base

  osc.type = "square";
  osc.frequency.setValueAtTime(freq, now);

  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(vol, now + 0.005);    // ataque rápido
  gain.gain.exponentialRampToValueAtTime(0.0001, now + dur); // decaimiento corto

  osc.connect(gain);
  gain.connect(audioCtx.destination);

  osc.start(now);
  osc.stop(now + dur + 0.01);
}

// ------- Tamaño adaptativo -------
function applyAdaptiveSizing(n) {
  const cfg = SIZE_MAP[n] || SIZE_MAP[8];
  SEQ_WRAP.style.gridAutoColumns = `minmax(${cfg.colMin}px, 1fr)`;
  SEQ_WRAP.style.gap = `${cfg.gap}px`;
  return cfg;
}

// ------- Render -------
function clearSequenceDOM() { SEQ_WRAP.innerHTML = ""; }

function renderSequence() {
  clearSequenceDOM();
  const n   = Number(LEN_SEL.value) || 4;
  const cfg = applyAdaptiveSizing(n);
  const seq = baseSequence.slice();

  seq.forEach((hand, idx) => {
    const beat = document.createElement("div");
    beat.className = "beat";
    beat.dataset.index = idx;
    beat.dataset.hand = hand;
    beat.style.width  = `${cfg.beat}px`;
    beat.style.height = `${cfg.beat}px`;

    const img = document.createElement("img");
    img.className = "hand-img";
    img.alt = hand === "R" ? "Mano derecha" : "Mano izquierda";
    img.src = hand === "R" ? RIGHT_IMG : LEFT_IMG;
    img.style.width  = `${cfg.img}px`;
    img.style.height = `${cfg.img}px`;

    beat.appendChild(img);
    SEQ_WRAP.appendChild(beat);

    beat.addEventListener("click", () => {
      if (timerId) setActive(idx);
      else { activeIndex = idx - 1; startMetronome(); }
    });
  });

  COMBO_TXT.textContent = pretty(seq);
}

// ------- Iluminación -------
function setActive(idx) {
  const beats = [...SEQ_WRAP.querySelectorAll(".beat")];
  beats.forEach(b => b.classList.remove("active"));

  const current = beats[idx];
  if (current) {
    current.classList.add("active");
    activeIndex = idx;

    // Sonido según la mano del beat activo
    const hand = current.dataset.hand || "R";
    playClick(hand);
  }
}

function nextStep() {
  const beats = SEQ_WRAP.querySelectorAll(".beat");
  if (!beats.length) return;
  const next = (activeIndex + 1) % beats.length;
  setActive(next);
}

// ------- Metrónomo -------
function startMetronome() {
  stopMetronome();
  ensureAudio(); // garantizamos que el audio esté listo tras el gesto del usuario

  if (!SEQ_WRAP.children.length) renderSequence();
  if (activeIndex < 0 || activeIndex >= SEQ_WRAP.children.length) activeIndex = -1;

  const interval = msPerBeat(bpm);
  nextStep();
  timerId = setInterval(nextStep, interval);

  toggleControls(true);
}

function stopMetronome() {
  if (timerId) clearInterval(timerId);
  timerId = null;
  toggleControls(false);
  [...SEQ_WRAP.querySelectorAll(".beat")].forEach(b => b.classList.remove("active"));
  activeIndex = -1;
}

function toggleControls(running) {
  PLAY_BTN.disabled = running;
  GEN_BTN.disabled  = running;
  SPEED_BTNS.forEach(b => b.disabled = running);
  LEN_SEL.disabled  = running;
  LEVEL_SEL.disabled = running;
  PREV_BTN.disabled = running;
  NEXT_BTN.disabled = running;
}

// ------- Presets -------
function loadFromLevelOrRandom(resetIndex = true) {
  const n = Number(LEN_SEL.value) || 4;
  const level = LEVEL_SEL.value;

  if (level === "random") {
    if (resetIndex) presetIndex = 0;
    baseSequence = generateRandomSequence(n);
  } else {
    const list = getPresetList(level, n);
    if (!list.length) baseSequence = generateRandomSequence(n);
    else {
      if (resetIndex) presetIndex = 0;
      baseSequence = toArray(list[Math.min(presetIndex, list.length - 1)]);
    }
  }
  renderSequence();
}

function goPrevPreset() {
  const n = Number(LEN_SEL.value) || 4;
  const level = LEVEL_SEL.value;
  const list = getPresetList(level, n);
  if (level === "random" || !list.length) return loadFromLevelOrRandom(false);
  presetIndex = (presetIndex - 1 + list.length) % list.length;
  baseSequence = toArray(list[presetIndex]);
  renderSequence();
}

function goNextPreset() {
  const n = Number(LEN_SEL.value) || 4;
  const level = LEVEL_SEL.value;
  const list = getPresetList(level, n);
  if (level === "random" || !list.length) return loadFromLevelOrRandom(false);
  presetIndex = (presetIndex + 1) % list.length;
  baseSequence = toArray(list[presetIndex]);
  renderSequence();
}

// ------- Eventos -------
GEN_BTN.addEventListener("click", () => {
  loadFromLevelOrRandom(false);
  if (timerId) startMetronome();
});
PLAY_BTN.addEventListener("click", startMetronome);
STOP_BTN.addEventListener("click", stopMetronome);
LEN_SEL.addEventListener("change", () => loadFromLevelOrRandom(true));
LEVEL_SEL.addEventListener("change", () => loadFromLevelOrRandom(true));
PREV_BTN.addEventListener("click", () => !timerId && goPrevPreset());
NEXT_BTN.addEventListener("click", () => !timerId && goNextPreset());

// Velocidades
SPEED_BTNS.forEach(btn => {
  btn.addEventListener("click", () => {
    SPEED_BTNS.forEach(b => {
      b.classList.add("ghost");
      b.setAttribute("aria-pressed", "false");
    });
    btn.classList.remove("ghost");
    btn.setAttribute("aria-pressed", "true");
    bpm = parseInt(btn.dataset.bpm, 10);
    if (timerId) startMetronome();
  });
});

// ------- Inicialización -------
(function init(){
  YEAR_EL.textContent = new Date().getFullYear();

  // Solo Lento activo al inicio
  SPEED_BTNS.forEach(b => {
    if (b.dataset.speed === "lento") {
      b.classList.remove("ghost");
      b.setAttribute("aria-pressed", "true");
    } else {
      b.classList.add("ghost");
      b.setAttribute("aria-pressed", "false");
    }
  });

  loadFromLevelOrRandom(true);
})();
