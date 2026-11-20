/* =====================================================================
   Vernier Calipers Virtual Laboratory — script.js
   Sections:
     1. MATH CORE (integer-exact vernier engine — unit tested)
     2. Utilities, i18n, storage, navigation, global UI
     3. SVG renderers (instrument + magnifier lens) and CaliperSim class
     4. Module logic (1–10)
   Internal unit: "tenths" = 0.1 mm = 0.01 cm = 1 least count.
   ===================================================================== */
'use strict';

/* ===================== 1. MATH CORE START ===================== */
/** Floor division that also works for negative numbers. */
function floorDiv(a, b) { return Math.floor(a / b); }
/** Modulo that is always in [0, b). */
function floorMod(a, b) { return ((a % b) + b) % b; }
/** Round to d decimals, avoiding binary floating-point artefacts. */
function roundTo(x, d) {
  const f = Math.pow(10, d);
  return Math.round((x + (x >= 0 ? 1 : -1) * 1e-12) * f) / f;
}
/**
 * Reads a standard 10-division vernier (10 VSD = 9 MSD, 1 MSD = 1 mm, LC = 0.01 cm)
 * from the position of the vernier zero, given in tenths of a millimetre.
 */
function readVernier(posTenths) {
  const pos = Math.round(posTenths);
  const msrMm = floorDiv(pos, 10);           // last main-scale mark left of vernier zero
  const n = floorMod(pos, 10);               // coinciding vernier division
  const lcCm = 0.01;
  return {
    posTenths: pos,
    msrMm: msrMm,
    msrCm: msrMm / 10,
    coincidence: n,
    lcCm: lcCm,
    vsrCm: n / 100,
    observedCm: (msrMm * 10 + n) / 100       // = MSR + n x LC, exact via integers
  };
}
/**
 * Independent geometric check: line n of the vernier sits at pos + 9n tenths
 * (each VSD = 0.9 mm = 9 tenths). It coincides with a main-scale mark when that
 * value is a multiple of 10 tenths (= whole mm).
 */
function findCoincidenceByGeometry(posTenths) {
  const pos = Math.round(posTenths);
  for (let n = 0; n <= 10; n++) {
    if (floorMod(pos + 9 * n, 10) === 0) return n;
  }
  return -1;
}
/** LC = 1 MSD - 1 VSD, where N VSD = M MSD.  (mm in, mm out) */
function leastCount(msdMm, N, M) { return roundTo(msdMm * (N - M) / N, 10); }
function validateLCInputs(msd, N, M) {
  if (!isFinite(msd) || msd <= 0) return { ok: false, en: 'Length of 1 main-scale division must be a positive number.', bn: '১ প্রধান স্কেল ভাগের দৈর্ঘ্য অবশ্যই ধনাত্মক সংখ্যা হতে হবে।' };
  if (!Number.isInteger(N) || N < 2 || N > 60) return { ok: false, en: 'Number of vernier divisions N must be a whole number from 2 to 60.', bn: 'ভার্নিয়ার ভাগ সংখ্যা N অবশ্যই ২ থেকে ৬০-এর মধ্যে পূর্ণসংখ্যা হতে হবে।' };
  if (!Number.isInteger(M) || M < 1) return { ok: false, en: 'M must be a positive whole number.', bn: 'M অবশ্যই ধনাত্মক পূর্ণসংখ্যা হতে হবে।' };
  if (M >= N) return { ok: false, en: 'M must be smaller than N (the vernier scale must be shorter than the matching main-scale length), otherwise the least count is zero or negative.', bn: 'M অবশ্যই N-এর চেয়ে ছোট হতে হবে (ভার্নিয়ার স্কেল প্রধান স্কেলের চেয়ে ছোট হতে হবে), নইলে লঘিষ্ঠ গণন শূন্য বা ঋণাত্মক হয়ে যায়।' };
  return { ok: true };
}
/** Observed reading = MSR + n x LC  (cm). */
function computeObserved(msrCm, n, lcCm) { return roundTo(msrCm + n * lcCm, 6); }
/** Correct reading = Observed - Zero error  (cm). */
function computeCorrect(observedCm, zeroErrorCm) { return roundTo(observedCm - zeroErrorCm, 6); }
/** Zero error from the coinciding line n when jaws are closed. */
function zeroErrorFromCoincidence(type, n, N, lcCm) {
  if (type === 'positive') return roundTo(n * lcCm, 6);
  if (type === 'negative') return roundTo(-(N - n) * lcCm, 6);
  return 0;
}
function classifyZero(closedPosTenths) {
  if (closedPosTenths === 0) return 'none';
  return closedPosTenths > 0 ? 'positive' : 'negative';
}
/** Accuracy in % (100 = perfect), based on relative error. */
function percentAccuracy(measured, actual) {
  if (!isFinite(measured) || !isFinite(actual) || actual === 0) return 0;
  return Math.max(0, roundTo(100 - Math.abs(measured - actual) / Math.abs(actual) * 100, 2));
}
/** Nearest vernier line to a main-scale mark (general, any N / M). */
function nearestCoincidence(posMm, msdMm, N, pitchMm) {
  let best = 0, bestDist = Infinity;
  for (let n = 0; n <= N; n++) {
    const d = (posMm + n * pitchMm) / msdMm;
    const dist = Math.abs(d - Math.round(d));
    if (dist < bestDist - 1e-9) { bestDist = dist; best = n; }
  }
  return { n: best, dist: bestDist };
}
/* ===================== MATH CORE END ===================== */

/* ===================== 2. UTILITIES / GLOBAL UI ===================== */
const $ = (sel, root) => (root || document).querySelector(sel);
const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const randInt = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const MODULE_IDS = ['m1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7', 'm8', 'm9', 'm10'];

let LANG = 'both';
/** Bilingual HTML snippet (CSS decides what is visible). */
function bi(en, bn) { return '<span class="en">' + en + '</span><span class="bn">' + bn + '</span>'; }
/** Plain-text bilingual string for SVG text / tooltips. */
function lt(en, bn) { return LANG === 'en' ? en : LANG === 'bn' ? bn : en + ' · ' + bn; }
function fmt(x, d) {
  if (d === undefined) d = 2;
  let s = Number(x).toFixed(d);
  if (/^-0(\.0*)?$/.test(s)) s = s.slice(1);
  return s;
}
function fmtSigned(x, d) {
  if (d === undefined) d = 2;
  const s = fmt(Math.abs(x), d);
  if (Math.abs(x) < 1e-12) return s;
  return (x > 0 ? '+' : '−') + s;
}
function fmtTrim(x) { return String(Number(Number(x).toFixed(3))); }
function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

let toastTimer = null;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}

/* ---------- storage ---------- */
const STORE_KEY = 'vcvl_progress_v1';
function defaultState() {
  return { completed: {}, quizzes: [], totals: { correct: 0, incorrect: 0 }, practice: [], lang: 'both' };
}
function loadState() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const base = defaultState();
      return {
        completed: parsed.completed && typeof parsed.completed === 'object' ? parsed.completed : base.completed,
        quizzes: Array.isArray(parsed.quizzes) ? parsed.quizzes : base.quizzes,
        totals: parsed.totals && typeof parsed.totals === 'object' ? { correct: +parsed.totals.correct || 0, incorrect: +parsed.totals.incorrect || 0 } : base.totals,
        practice: Array.isArray(parsed.practice) ? parsed.practice : base.practice,
        lang: ['en', 'bn', 'both'].includes(parsed.lang) ? parsed.lang : 'both'
      };
    }
  } catch (e) { /* storage unavailable or corrupted: fall back to defaults */ }
  return defaultState();
}
let appState = loadState();
function saveState() { try { localStorage.setItem(STORE_KEY, JSON.stringify(appState)); } catch (e) { /* ignore */ } }

/* ---------- language ---------- */
const langListeners = [];
function setLang(l) {
  LANG = l;
  document.body.classList.remove('lang-en', 'lang-bn', 'lang-both');
  document.body.classList.add('lang-' + l);
  document.documentElement.lang = l === 'bn' ? 'bn' : 'en';
  $$('[data-lang]').forEach(b => b.classList.toggle('active', b.dataset.lang === l));
  appState.lang = l;
  saveState();
  langListeners.forEach(fn => { try { fn(); } catch (e) { console.error(e); } });
}

/* ---------- progress UI ---------- */
function markDone(id) {
  if (!appState.completed[id]) {
    appState.completed[id] = true;
    saveState();
    refreshChrome();
    return true;
  }
  return false;
}
function refreshChrome() {
  const done = MODULE_IDS.filter(id => appState.completed[id]).length;
  const pct = Math.round(done / MODULE_IDS.length * 100);
  const ring = $('#topProgress');
  ring.style.setProperty('--p', pct);
  ring.textContent = pct + '%';
  ring.title = done + '/' + MODULE_IDS.length + ' modules completed';
  $$('#nav a[data-nav]').forEach(a => a.classList.toggle('done', !!appState.completed[a.dataset.nav]));
  $$('[data-complete]').forEach(b => b.classList.toggle('on', !!appState.completed[b.dataset.complete]));
}

/* ---------- navigation ---------- */
const initializedModules = {};
const moduleEnterHooks = {};
function showModule(id) {
  if (!document.getElementById(id) || !(id === 'home' || MODULE_IDS.includes(id))) id = 'home';
  $$('main .module').forEach(sec => sec.classList.toggle('active', sec.id === id));
  $$('#nav a').forEach(a => a.classList.toggle('active', a.dataset.nav === id));
  document.body.classList.remove('menu-open');
  window.scrollTo({ top: 0, behavior: 'auto' });
  if (moduleEnterHooks[id]) moduleEnterHooks[id]();
}
function routeFromHash() { showModule((location.hash || '#home').slice(1)); }

/* ---------- presentation / fullscreen ---------- */
function togglePresentation(force) {
  const on = force !== undefined ? force : !document.body.classList.contains('presentation');
  document.body.classList.toggle('presentation', on);
  $('#presentBtn').classList.toggle('on', on);
  toast(on ? lt('Presentation mode ON', 'উপস্থাপনা মোড চালু') : lt('Presentation mode OFF', 'উপস্থাপনা মোড বন্ধ'));
}
function toggleFullscreen() {
  try {
    if (document.fullscreenElement) { document.exitFullscreen(); }
    else if (document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen().catch(() => toast(lt('Fullscreen is blocked by the browser', 'ব্রাউজার ফুলস্ক্রিন অনুমতি দিচ্ছে না')));
    } else { toast(lt('Fullscreen is not supported here', 'এখানে ফুলস্ক্রিন সমর্থিত নয়')); }
  } catch (e) { toast(lt('Fullscreen is not supported here', 'এখানে ফুলস্ক্রিন সমর্থিত নয়')); }
}

/* ---------- clipboard ---------- */
function copyText(text, btn) {
  const done = () => {
    if (btn) { const old = btn.textContent; btn.textContent = '✔ Copied'; btn.classList.add('done'); setTimeout(() => { btn.textContent = old; btn.classList.remove('done'); }, 1400); }
    toast(lt('Copied: ', 'কপি হয়েছে: ') + text);
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(done).catch(() => fallbackCopy(text, done));
  } else { fallbackCopy(text, done); }
}
function fallbackCopy(text, cb) {
  const ta = document.createElement('textarea');
  ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
  document.body.appendChild(ta); ta.select();
  try { document.execCommand('copy'); cb(); } catch (e) { toast('Copy failed'); }
  document.body.removeChild(ta);
}

function initChrome() {
  $$('[data-lang]').forEach(b => b.addEventListener('click', () => setLang(b.dataset.lang)));
  $('#presentBtn').addEventListener('click', () => togglePresentation());
  $('#fsBtn').addEventListener('click', toggleFullscreen);
  $('#menuBtn').addEventListener('click', () => {
    if (document.body.classList.contains('presentation')) { document.body.classList.toggle('menu-open'); document.body.classList.toggle('presentation', false); $('#presentBtn').classList.remove('on'); return; }
    document.body.classList.toggle('menu-open');
  });
  $('#scrim').addEventListener('click', () => document.body.classList.remove('menu-open'));
  $$('[data-complete]').forEach(b => b.addEventListener('click', () => {
    if (markDone(b.dataset.complete)) toast(lt('Module completed! 🎉', 'মডিউল সম্পন্ন! 🎉'));
    else toast(lt('Already completed', 'আগেই সম্পন্ন করা হয়েছে'));
    if (b.dataset.complete) refreshProgressPage();
  }));
  $$('.copy').forEach(b => b.addEventListener('click', () => copyText(b.dataset.copy, b)));
  $$('#homeCards a').forEach(a => a.addEventListener('click', () => { /* hash handles routing */ }));
  window.addEventListener('hashchange', routeFromHash);
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { document.body.classList.remove('menu-open'); }
  });
  setLang(appState.lang);
  refreshChrome();
}

/* ===================== 3. SVG RENDERERS ===================== */
const GEO = { S: 6, X0: 120, LEN_MM: 110, VIEW_W: 1280, VIEW_H: 470, MAX_GAP: 800 };
GEO.X_E = GEO.X0 + GEO.LEN_MM * GEO.S; // x of the beam end (depth-rod origin)

/**
 * Draws a magnified view of a main scale + vernier scale into an <svg viewBox="0 0 800 230">.
 * Generic: works for any main-scale division (msdMm), vernier divisions (N) and vernier span (spanMsd MSD).
 * The window follows the vernier, so the main scale slides past it (like zooming on the slider).
 * Returns { n, msrIndex } where n is the coinciding vernier line found geometrically.
 */
function renderLens(svg, o) {
  const W = 800, H = 230;
  const px = o.pxPerMm || 40;
  const msd = o.msdMm || 1;
  const N = o.N || 10;
  const span = o.spanMsd !== undefined ? o.spanMsd : N - 1;
  const pitch = span * msd / N;
  const pos = o.posMm;
  const leftPad = o.leftPadMm !== undefined ? o.leftPadMm : 4;
  const left = pos - leftPad;
  const rightMm = left + W / px;
  const X = mm => (mm - left) * px;
  const top = 24, mid = 112, bottom = 205;
  const hl = o.hl || {};
  let s = '';

  s += '<rect x="0" y="0" width="' + W + '" height="' + H + '" fill="#f8fafc"/>';
  s += '<rect x="0" y="' + top + '" width="' + W + '" height="' + (mid - top) + '" fill="#e8eef5"/>';
  const x0 = X(0);
  if (x0 > 0) {
    s += '<rect x="0" y="' + top + '" width="' + Math.min(x0, W) + '" height="' + (mid - top) + '" fill="#94a3b8"/>';
    if (x0 > 60) s += '<text x="' + Math.min(x0, W) / 2 + '" y="' + (top + 46) + '" text-anchor="middle" font-size="13" fill="#fff">' + esc(lt('(jaw)', '(চোয়াল)')) + '</text>';
  }
  s += '<line x1="0" y1="' + mid + '" x2="' + W + '" y2="' + mid + '" stroke="#0f172a" stroke-width="1.6"/>';

  // main-scale ticks
  const kStart = Math.max(0, Math.ceil(left / msd - 1e-9));
  const kEnd = Math.floor(rightMm / msd + 1e-9);
  for (let k = kStart; k <= kEnd; k++) {
    const x = X(k * msd);
    const len = k % 10 === 0 ? 40 : (k % 5 === 0 ? 30 : 22);
    s += '<line x1="' + x + '" y1="' + mid + '" x2="' + x + '" y2="' + (mid - len) + '" stroke="#0f172a" stroke-width="' + (k % 10 === 0 ? 2.2 : 1.4) + '"/>';
    if (k % 10 === 0) s += '<text x="' + x + '" y="' + (mid - len - 5) + '" text-anchor="middle" font-size="17" font-weight="700" fill="#0f172a">' + fmtTrim(k * msd / 10) + '</text>';
  }

  // vernier strip
  const vx0 = X(pos) - 16, vx1 = X(pos + N * pitch) + 16;
  s += '<rect x="' + vx0 + '" y="' + mid + '" width="' + (vx1 - vx0) + '" height="' + (bottom - mid) + '" rx="4" fill="#dbeafe" stroke="#1e3a8a" stroke-width="1.5"/>';
  const major = N <= 25 ? 5 : 10;
  const labelEvery = N <= 12 ? 1 : (N <= 30 ? 5 : 10);
  for (let n = 0; n <= N; n++) {
    const x = X(pos + n * pitch);
    const len = n % major === 0 ? 38 : 24;
    s += '<line x1="' + x + '" y1="' + mid + '" x2="' + x + '" y2="' + (mid + len) + '" stroke="' + (n === 0 ? '#dc2626' : '#1e3a8a') + '" stroke-width="' + (n === 0 ? 3 : 1.5) + '"/>';
    if (n % labelEvery === 0 || n === N) s += '<text x="' + x + '" y="' + (mid + 60) + '" text-anchor="middle" font-size="16" font-weight="700" fill="' + (n === 0 ? '#dc2626' : '#1e3a8a') + '">' + n + '</text>';
  }

  // helpers: MSR marker and coincidence marker
  const co = nearestCoincidence(pos, msd, N, pitch);
  const idx = Math.floor(pos / msd + 1e-9);
  if (o.showMsr && idx >= 0) {
    const mx = X(idx * msd);
    s += '<rect x="' + (mx - 3) + '" y="' + top + '" width="6" height="' + (mid - top) + '" fill="#f97316" opacity=".55"/>';
    s += '<polygon points="' + (mx - 8) + ',' + (top - 2) + ' ' + (mx + 8) + ',' + (top - 2) + ' ' + mx + ',' + (top + 10) + '" fill="#ea580c"/>';
    const lblX = clamp(mx, 70, W - 70);
    s += '<text x="' + lblX + '" y="14" text-anchor="middle" font-size="14" font-weight="800" fill="#c2410c">MSR = ' + fmtTrim(idx * msd / 10) + ' cm</text>';
  }
  if (o.showCoin) {
    const cx = X(pos + co.n * pitch);
    s += '<rect x="' + (cx - 5) + '" y="' + (top + 4) + '" width="10" height="' + (bottom - top - 4) + '" fill="#10b981" opacity=".4" rx="4"/>';
    s += '<line x1="' + cx + '" y1="' + (top + 4) + '" x2="' + cx + '" y2="' + bottom + '" stroke="#059669" stroke-width="2.5" stroke-dasharray="6 4"/>';
    s += '<text x="' + clamp(cx, 60, W - 60) + '" y="' + (H - 8) + '" text-anchor="middle" font-size="16" font-weight="800" fill="#047857">' + esc(lt('line', 'দাগ')) + ' n = ' + co.n + ' ✔</text>';
  }
  if (hl.main) s += '<rect x="2" y="' + (top - 2) + '" width="' + (W - 4) + '" height="' + (mid - top + 4) + '" fill="rgba(245,158,11,.18)" stroke="#f59e0b" stroke-width="4" rx="6"/>';
  if (hl.vernier) s += '<rect x="' + (vx0 - 3) + '" y="' + (mid - 2) + '" width="' + (vx1 - vx0 + 6) + '" height="' + (bottom - mid + 4) + '" fill="rgba(245,158,11,.18)" stroke="#f59e0b" stroke-width="4" rx="6"/>';
  s += '<text x="8" y="' + (top + 13) + '" font-size="11" font-weight="700" fill="#475569">' + esc(lt('MAIN SCALE (cm)', 'প্রধান স্কেল (সে.মি.)')) + '</text>';
  s += '<text x="' + (W - 8) + '" y="' + (bottom - 8) + '" text-anchor="end" font-size="11" font-weight="700" fill="#1e3a8a">' + esc(lt('VERNIER SCALE', 'ভার্নিয়ার স্কেল')) + '</text>';
  svg.innerHTML = s;
  return { n: co.n, msrIndex: idx };
}

/* ---------- part descriptions (Module 1) ---------- */
const PARTS = {
  mainScale: {
    icon: '📏',
    en: { name: 'Main Scale', func: 'A fixed ruler-like scale on the long beam. Each small division is 1 mm; each numbered division is 1 cm. It gives the whole-millimetre part of the reading (MSR).', simple: 'Think of it as the ordinary ruler part. It never moves — the vernier scale slides along it.' },
    bn: { name: 'প্রধান স্কেল', func: 'লম্বা বাহুর উপর স্থির স্কেল। প্রতিটি ছোট ঘর ১ মি.মি., সংখ্যা দেওয়া ঘর ১ সে.মি.। এটি পাঠের পূর্ণ মিলিমিটার অংশ (MSR) দেয়।', simple: 'এটাকে সাধারণ স্কেলের মতো ভাবো। এটি নড়ে না — ভার্নিয়ার স্কেল এর গা ঘেঁষে সরে।' }
  },
  vernierScale: {
    icon: '🔹',
    en: { name: 'Vernier Scale', func: 'A short sliding scale with 10 divisions that fits exactly 9 mm. It measures the fraction of a millimetre between two main-scale marks (VSR = n × LC).', simple: 'It is like a magnifier for the gaps: whichever line matches a main-scale line tells the extra tenth of a millimetre.' },
    bn: { name: 'ভার্নিয়ার স্কেল', func: 'ছোট চলমান স্কেল, যার ১০টি ভাগ ঠিক ৯ মি.মি.-এর সমান। এটি প্রধান স্কেলের দুই দাগের মাঝের ভগ্নাংশ মাপে (VSR = n × LC)।', simple: 'এটি দুই দাগের ফাঁকের জন্য বিবর্ধকের মতো: যে দাগটি প্রধান স্কেলের দাগের সাথে মিলে, সেটি বলে দেয় অতিরিক্ত কত দশমাংশ মি.মি.।' }
  },
  outsideJaws: {
    icon: '🪙',
    en: { name: 'Outside Measuring Jaws', func: 'The big lower pair of jaws. The object is gripped between their flat faces to measure external diameter, thickness or length.', simple: 'Use them like tongs — for a coin, a marble, a wire or a cylinder.' },
    bn: { name: 'বাইরের মাপার চোয়াল', func: 'নিচের বড় চোয়াল জোড়া। এদের সমতল পৃষ্ঠের মাঝে বস্তু ধরে বাইরের ব্যাস, পুরুত্ব বা দৈর্ঘ্য মাপা হয়।', simple: 'চিমটার মতো ব্যবহার করো — মুদ্রা, মার্বেল, তার বা বেলনের জন্য।' }
  },
  insideJaws: {
    icon: '🕳️',
    en: { name: 'Inside Measuring Jaws', func: 'The small pointed jaws at the top. They go inside a hollow object and are opened until they touch the inner walls to measure internal diameter.', simple: 'Use them for the inside of a pipe, a ring, a bangle or a bottle neck.' },
    bn: { name: 'ভিতরের মাপার চোয়াল', func: 'উপরের ছোট সূচালো চোয়াল। ফাঁপা বস্তুর ভিতরে ঢুকিয়ে দেয়াল ছোঁয়া পর্যন্ত খুলে ভিতরের ব্যাস মাপা হয়।', simple: 'পাইপ, আংটি, চুড়ি বা বোতলের মুখের ভিতরের মাপ নিতে ব্যবহার করো।' }
  },
  depthRod: {
    icon: '📍',
    en: { name: 'Depth Rod', func: 'A thin strip attached to the slider that slides out of the end of the beam. Its length outside the beam equals the reading, so it measures depth of holes and containers.', simple: 'Rest the beam end on the rim of a cup and push the rod down until it touches the bottom.' },
    bn: { name: 'গভীরতা দণ্ড', func: 'চলমান অংশের সাথে লাগানো সরু পাত, যা বাহুর শেষ প্রান্ত দিয়ে বেরিয়ে আসে। বাইরে বেরোনো অংশের দৈর্ঘ্যই পাঠ, তাই এটি গর্ত বা পাত্রের গভীরতা মাপে।', simple: 'বাহুর প্রান্ত কাপের কিনারায় রেখে দণ্ডটি নিচে নামাও যতক্ষণ না তলায় ঠেকে।' }
  },
  lockScrew: {
    icon: '🔩',
    en: { name: 'Locking Screw', func: 'A small screw on the slider. Tightening it fixes the movable jaw in place so the reading does not change while you take it off the object.', simple: 'Like a brake: tighten it, then read the scale in comfort.' },
    bn: { name: 'আটকানো স্ক্রু (লকিং স্ক্রু)', func: 'চলমান অংশের ছোট স্ক্রু। এটি টাইট দিলে চলমান চোয়াল জায়গায় আটকে যায়, ফলে বস্তু সরিয়ে নিলেও পাঠ বদলায় না।', simple: 'ব্রেকের মতো: টাইট দাও, তারপর আরাম করে পাঠ নাও।' }
  },
  fixedJaw: {
    icon: '⬅️',
    en: { name: 'Fixed Jaw', func: 'The jaw joined permanently to the main scale. Its inner face sits at the zero of the main scale and never moves.', simple: 'This is your "wall": press the object against it, then bring the movable jaw to touch the other side.' },
    bn: { name: 'স্থির চোয়াল', func: 'প্রধান স্কেলের সাথে স্থায়ীভাবে যুক্ত চোয়াল। এর ভিতরের পৃষ্ঠ প্রধান স্কেলের শূন্যে থাকে এবং কখনো নড়ে না।', simple: 'এটি তোমার "দেয়াল": বস্তুটি এর গায়ে ঠেকাও, তারপর চলমান চোয়াল অন্য পাশে ছোঁয়াও।' }
  },
  movableJaw: {
    icon: '➡️',
    en: { name: 'Movable Jaw (Slider)', func: 'The jaw that slides along the beam together with the vernier scale. The distance it moves from the fixed jaw is the length being measured.', simple: 'Drag it! The more you open it, the bigger the reading.' },
    bn: { name: 'চলমান চোয়াল (স্লাইডার)', func: 'ভার্নিয়ার স্কেলসহ বাহুর উপর দিয়ে সরে যাওয়া চোয়াল। স্থির চোয়াল থেকে এটি যত দূরে সরে, মাপা দৈর্ঘ্য তত বেশি।', simple: 'টেনে দেখো! যত বেশি খুলবে, পাঠ তত বড় হবে।' }
  }
};
const PART_ORDER = ['mainScale', 'vernierScale', 'outsideJaws', 'insideJaws', 'depthRod', 'lockScrew', 'fixedJaw', 'movableJaw'];

/* ===================== CaliperSim class ===================== */
const SIMS = [];
let simUid = 0;
const LENS_LEVELS = [24, 32, 40, 52];

class CaliperSim {
  /**
   * opts: controls ('full' | 'basic' | false), panel (bool), labels (bool), helpDefault (bool),
   *       initialGap (tenths mm), fixedClosed (bool), hideGap (bool), onChange(fn), onPartSelect(fn), onPartHover(fn)
   */
  constructor(host, opts) {
    this.host = host;
    this.o = Object.assign({ controls: 'full', panel: true, labels: false, helpDefault: true, initialGap: 236, fixedClosed: false, hideGap: false, onChange: null, onPartSelect: null, onPartHover: null }, opts || {});
    this.uid = ++simUid;
    this.ze = 0;
    this.scenario = { type: 'free', size: 0, kind: '' };
    this.pos = this.o.initialGap;
    this.zoom = 1;
    this.lensIdx = 2;
    this.locked = false;
    this.showHelp = this.o.helpDefault;
    this.hl = { main: false, vernier: false, msr: false, coin: false };
    this.selected = null;
    this.drag = null;
    this.anim = null;
    this.tickCache = this.buildTicks();
    this.build();
    this.bind();
    SIMS.push(this);
    this.update();
  }

  /* ----- geometry & limits ----- */
  limits() {
    const sc = this.scenario;
    let minGap = 0, maxGap = GEO.MAX_GAP;
    if (this.o.fixedClosed) { minGap = 0; maxGap = 0; }
    else if (sc.type === 'external') minGap = sc.size;
    else if (sc.type === 'internal' || sc.type === 'depth') maxGap = sc.size;
    return { min: minGap + this.ze, max: maxGap + this.ze };
  }
  initialPos() {
    const sc = this.scenario;
    if (this.o.fixedClosed) return this.ze;
    if (sc.type === 'external') return Math.min(sc.size + 150, GEO.MAX_GAP) + this.ze;
    if (sc.type === 'internal' || sc.type === 'depth') return this.ze;
    return this.o.initialGap + this.ze;
  }
  openTarget() {
    const sc = this.scenario;
    if (sc.type === 'external') return Math.min(sc.size + 200, GEO.MAX_GAP) + this.ze;
    if (sc.type === 'internal' || sc.type === 'depth') return sc.size + this.ze;
    return 400 + this.ze;
  }

  /* ----- public API ----- */
  setScenario(sc) {
    this.scenario = Object.assign({ type: 'free', size: 0, kind: '' }, sc || {});
    this.pos = this.initialPos();
    this.locked = false;
    this.update();
  }
  setZeroError(zeTenths) {
    const gap = this.pos - this.ze;
    this.ze = Math.round(zeTenths);
    this.pos = (this.o.fixedClosed ? 0 : gap) + this.ze;
    this.update();
  }
  setPos(p, force) {
    if (this.locked && !force) { toast(lt('Locking screw is tight — unlock first.', 'লকিং স্ক্রু টাইট আছে — আগে খোলো।')); return; }
    const lim = this.limits();
    this.pos = clamp(Math.round(p), lim.min, lim.max);
    this.update();
  }
  nudge(d) { this.setPos(this.pos + d); }
  setLocked(v) { this.locked = v; this.update(); }
  setZoom(z) { this.zoom = clamp(z, 1, 4); this.update(); }
  setHighlight(h) { Object.assign(this.hl, h); this.update(); }
  setPanelVisible(v) { if (this.panelEl) this.panelEl.hidden = !v; }
  selectPart(key) {
    this.selected = key;
    this.update();
    if (this.o.onPartSelect) this.o.onPartSelect(key);
  }
  reset() {
    cancelAnimationFrame(this.anim);
    this.locked = false; this.zoom = 1; this.lensIdx = 2; this.selected = null;
    this.hl = { main: false, vernier: false, msr: false, coin: false };
    this.showHelp = this.o.helpDefault;
    this.pos = this.initialPos();
    this.update();
  }
  animateTo(target, ms) {
    if (this.locked) { toast(lt('Locking screw is tight — unlock first.', 'লকিং স্ক্রু টাইট আছে — আগে খোলো।')); return; }
    cancelAnimationFrame(this.anim);
    const from = this.pos, lim = this.limits(), to = clamp(Math.round(target), lim.min, lim.max);
    const dur = ms || 450, t0 = performance.now();
    const step = now => {
      const k = clamp((now - t0) / dur, 0, 1);
      const e = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      this.pos = Math.round(from + (to - from) * e);
      this.update();
      if (k < 1) this.anim = requestAnimationFrame(step);
    };
    this.anim = requestAnimationFrame(step);
  }
  snapshot() {
    const r = readVernier(this.pos);
    const gap = this.pos - this.ze;
    return Object.assign({}, r, { zeTenths: this.ze, zeCm: this.ze / 100, gapTenths: gap, trueCm: gap / 100, correctCm: (this.pos - this.ze) / 100 });
  }

  /* ----- DOM construction ----- */
  build() {
    const full = this.o.controls === 'full', basic = this.o.controls === 'basic';
    let controls = '';
    if (full || basic) {
      controls += '<div class="sim-controls"><div class="grow"><input type="range" data-r="slider" aria-label="Jaw position"><output data-r="gap"></output></div></div>';
      controls += '<div class="sim-controls">';
      if (full) controls += '<button class="btn" data-a="m10">⏪ −1 mm</button>';
      controls += '<button class="btn" data-a="m1">◀ −0.1 mm</button><button class="btn" data-a="p1">+0.1 mm ▶</button>';
      if (full) controls += '<button class="btn" data-a="p10">+1 mm ⏩</button>';
      controls += '<button class="btn" data-a="open">↔ ' + bi('Open', 'খোলো') + '</button><button class="btn" data-a="close">⇥ ' + bi('Close', 'বন্ধ করো') + '</button>';
      if (full) controls += '<button class="btn" data-a="lock" data-r="lockbtn">🔓 ' + bi('Lock screw', 'স্ক্রু আটকাও') + '</button><button class="btn" data-a="help" data-r="helpbtn">💡 ' + bi('Helper', 'সাহায্য') + '</button>';
      controls += '<button class="btn ghost" data-a="reset">↺ ' + bi('Reset', 'রিসেট') + '</button></div>';
    }
    let panel = '';
    if (this.o.panel) {
      panel = '<div class="panel" data-r="panel"><div class="readout-grid">' +
        '<div class="readout msr"><small>' + bi('Main Scale Reading (MSR)', 'প্রধান স্কেল পাঠ (MSR)') + '</small><strong data-r="msr"></strong></div>' +
        '<div class="readout vc"><small>' + bi('Vernier Coincidence (n)', 'ভার্নিয়ার সমাপতন (n)') + '</small><strong data-r="vc"></strong></div>' +
        '<div class="readout lc"><small>' + bi('Least Count (LC)', 'লঘিষ্ঠ গণন (LC)') + '</small><strong data-r="lc">0.01 cm</strong></div>' +
        '<div class="readout vsr"><small>' + bi('Vernier Scale Reading (VSR)', 'ভার্নিয়ার স্কেল পাঠ (VSR)') + '</small><strong data-r="vsr"></strong></div>' +
        '<div class="readout"><small>' + bi('Observed = MSR + VSR', 'পর্যবেক্ষিত = MSR + VSR') + '</small><strong data-r="obs"></strong></div>' +
        '<div class="readout"><small>' + bi('Zero error', 'শূন্য ত্রুটি') + '</small><strong data-r="ze"></strong></div>' +
        '<div class="readout final"><small>' + bi('Final Reading', 'চূড়ান্ত পাঠ') + '</small><strong data-r="final"></strong></div>' +
        '</div><div class="calc-line" data-r="calc"></div></div>';
    }
    this.host.innerHTML =
      '<div class="sim">' +
      '<div class="sim-stage"><svg class="sim-svg" viewBox="0 0 ' + GEO.VIEW_W + ' ' + GEO.VIEW_H + '" tabindex="0" role="img" aria-label="Vernier calipers simulator"></svg>' +
      '<div class="sim-tools"><button class="btn" data-a="zin" title="Zoom in">🔍＋</button><button class="btn" data-a="zout" title="Zoom out">🔍－</button></div></div>' +
      '<div class="lens-box"><div class="lens-head"><span>🔍 ' + bi('Magnifier — drag left/right to slide the vernier', 'বিবর্ধক — ডানে/বামে টেনে ভার্নিয়ার সরাও') + '</span><span><button class="btn" data-a="lens-out">−</button> <button class="btn" data-a="lens-in">＋</button></span></div>' +
      '<svg class="lens-svg draggable" viewBox="0 0 800 230" role="img" aria-label="Magnified scales"></svg></div>' +
      controls + panel + '</div>';
    this.svg = $('.sim-svg', this.host);
    this.lensSvg = $('.lens-svg', this.host);
    this.slider = $('[data-r="slider"]', this.host);
    this.panelEl = $('[data-r="panel"]', this.host);
  }
  r(name) { return $('[data-r="' + name + '"]', this.host); }

  bind() {
    this.host.addEventListener('click', e => {
      const b = e.target.closest('[data-a]');
      if (!b || !this.host.contains(b)) return;
      this.action(b.dataset.a);
    });
    if (this.slider) this.slider.addEventListener('input', () => this.setPos(parseInt(this.slider.value, 10)));
    // main svg: select parts + drag the movable assembly
    this.svg.addEventListener('pointerdown', e => {
      const partEl = e.target.closest('[data-part]');
      if (partEl) this.selectPart(partEl.dataset.part);
      if (e.target.closest('[data-drag]')) {
        if (this.locked) { toast(lt('Locking screw is tight — unlock first.', 'লকিং স্ক্রু টাইট আছে — আগে খোলো।')); return; }
        const lim = this.limits();
        if (lim.min === lim.max) return;
        this.drag = { x: e.clientX, pos: this.pos, kind: 'main' };
        try { this.svg.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
        e.preventDefault();
      }
    });
    this.svg.addEventListener('pointermove', e => {
      if (!this.drag || this.drag.kind !== 'main') return;
      const ctm = this.svg.getScreenCTM();
      const unitsMoved = (e.clientX - this.drag.x) / (ctm ? ctm.a : 1);
      this.setPos(this.drag.pos + Math.round(unitsMoved * 10 / GEO.S));
    });
    const endDrag = () => { this.drag = null; };
    this.svg.addEventListener('pointerup', endDrag);
    this.svg.addEventListener('pointercancel', endDrag);
    this.svg.addEventListener('mouseover', e => {
      const p = e.target.closest('[data-part]');
      if (p && this.o.onPartHover) this.o.onPartHover(p.dataset.part);
    });
    this.svg.addEventListener('keydown', e => {
      const step = e.shiftKey ? 10 : 1;
      if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { this.nudge(step); e.preventDefault(); }
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { this.nudge(-step); e.preventDefault(); }
      else if (e.key === 'Home') { this.setPos(this.limits().min); e.preventDefault(); }
      else if (e.key === 'End') { this.setPos(this.limits().max); e.preventDefault(); }
    });
    // lens: dragging slides the vernier with 0.1 mm precision
    this.lensSvg.addEventListener('pointerdown', e => {
      if (this.locked) { toast(lt('Locking screw is tight — unlock first.', 'লকিং স্ক্রু টাইট আছে — আগে খোলো।')); return; }
      const lim = this.limits();
      if (lim.min === lim.max) return;
      this.drag = { x: e.clientX, pos: this.pos, kind: 'lens' };
      try { this.lensSvg.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      e.preventDefault();
    });
    this.lensSvg.addEventListener('pointermove', e => {
      if (!this.drag || this.drag.kind !== 'lens') return;
      const ctm = this.lensSvg.getScreenCTM();
      const unitsMoved = (e.clientX - this.drag.x) / (ctm ? ctm.a : 1);
      this.setPos(this.drag.pos + Math.round(unitsMoved / this.lensPx() * 10));
    });
    this.lensSvg.addEventListener('pointerup', endDrag);
    this.lensSvg.addEventListener('pointercancel', endDrag);
  }
  lensPx() { return LENS_LEVELS[this.lensIdx]; }

  action(a) {
    switch (a) {
      case 'm10': this.nudge(-10); break;
      case 'm1': this.nudge(-1); break;
      case 'p1': this.nudge(1); break;
      case 'p10': this.nudge(10); break;
      case 'open': this.animateTo(this.openTarget()); break;
      case 'close': this.animateTo(this.limits().min); break;
      case 'lock': this.setLocked(!this.locked); toast(this.locked ? lt('Screw locked 🔒', 'স্ক্রু আটকানো হলো 🔒') : lt('Screw released 🔓', 'স্ক্রু খোলা হলো 🔓')); break;
      case 'help': this.showHelp = !this.showHelp; this.update(); break;
      case 'reset': this.reset(); break;
      case 'zin': this.setZoom(this.zoom + 1); break;
      case 'zout': this.setZoom(this.zoom - 1); break;
      case 'lens-in': this.lensIdx = clamp(this.lensIdx + 1, 0, LENS_LEVELS.length - 1); this.update(); break;
      case 'lens-out': this.lensIdx = clamp(this.lensIdx - 1, 0, LENS_LEVELS.length - 1); this.update(); break;
      default: break;
    }
  }

  /* ----- rendering ----- */
  update() {
    const lim = this.limits();
    this.pos = clamp(Math.round(this.pos), lim.min, lim.max);
    this.renderMain();
    this.renderLensView();
    this.renderPanel();
    this.syncControls(lim);
    if (this.o.onChange) this.o.onChange(this.snapshot());
  }
  defs() {
    const u = this.uid;
    return '<defs>' +
      '<linearGradient id="st' + u + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f8fafc"/><stop offset=".5" stop-color="#d3dce8"/><stop offset="1" stop-color="#97a6b9"/></linearGradient>' +
      '<linearGradient id="sd' + u + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#cbd5e1"/><stop offset="1" stop-color="#64748b"/></linearGradient>' +
      '<linearGradient id="cy' + u + '" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#64748b"/><stop offset=".35" stop-color="#f1f5f9"/><stop offset="1" stop-color="#64748b"/></linearGradient>' +
      '<linearGradient id="cu' + u + '" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#7c2d12"/><stop offset=".35" stop-color="#fdba74"/><stop offset="1" stop-color="#7c2d12"/></linearGradient>' +
      '<linearGradient id="wd' + u + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fcd9a0"/><stop offset="1" stop-color="#d49a4f"/></linearGradient>' +
      '<linearGradient id="go' + u + '" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fde68a"/><stop offset="1" stop-color="#b45309"/></linearGradient>' +
      '<radialGradient id="ba' + u + '" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#ffffff"/><stop offset=".6" stop-color="#94a3b8"/><stop offset="1" stop-color="#334155"/></radialGradient>' +
      '<linearGradient id="pl' + u + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#eff6ff"/><stop offset="1" stop-color="#bfdbfe"/></linearGradient>' +
      '<pattern id="ha' + u + '" width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="9" height="9" fill="#fef3c7"/><line x1="0" y1="0" x2="0" y2="9" stroke="#b45309" stroke-width="2"/></pattern>' +
      '</defs>';
  }
  buildTicks() {
    const G = GEO;
    let t = '';
    for (let k = 0; k <= G.LEN_MM; k++) {
      const x = G.X0 + k * G.S;
      const len = k % 10 === 0 ? 24 : (k % 5 === 0 ? 16 : 10);
      t += '<line x1="' + x + '" y1="200" x2="' + x + '" y2="' + (200 - len) + '" stroke="#0f172a" stroke-width="' + (k % 10 === 0 ? 1.7 : 1) + '"/>';
      if (k % 10 === 0) t += '<text x="' + x + '" y="' + (200 - len - 5) + '" text-anchor="middle" font-size="14" font-weight="700" fill="#0f172a">' + (k / 10) + '</text>';
    }
    return t;
  }
  objectMarkup(u) {
    const G = GEO, S = G.S, sc = this.scenario, sizeMm = sc.size / 10, w = sizeMm * S;
    if (sc.type === 'external') {
      const cx = G.X0 + w / 2, cy = 345;
      switch (sc.kind) {
        case 'coin': return '<circle cx="' + cx + '" cy="' + cy + '" r="' + w / 2 + '" fill="url(#go' + u + ')" stroke="#92400e" stroke-width="2"/><circle cx="' + cx + '" cy="' + cy + '" r="' + w * .41 + '" fill="none" stroke="#92400e" stroke-width="1.5" opacity=".7"/>';
        case 'pencil': return '<circle cx="' + cx + '" cy="' + cy + '" r="' + w / 2 + '" fill="#facc15" stroke="#a16207" stroke-width="2"/><circle cx="' + cx + '" cy="' + cy + '" r="' + w * .17 + '" fill="#334155"/>';
        case 'ball': return '<circle cx="' + cx + '" cy="' + cy + '" r="' + w / 2 + '" fill="url(#ba' + u + ')" stroke="#334155"/>';
        case 'box': return '<rect x="' + G.X0 + '" y="295" width="' + w + '" height="105" rx="3" fill="url(#wd' + u + ')" stroke="#92400e" stroke-width="2"/><line x1="' + G.X0 + '" y1="325" x2="' + (G.X0 + w) + '" y2="325" stroke="#92400e" opacity=".6"/>';
        case 'pipe': return '<rect x="' + G.X0 + '" y="285" width="' + w + '" height="120" fill="url(#cu' + u + ')" stroke="#7c2d12" stroke-width="1.5"/>';
        default: return '<rect x="' + G.X0 + '" y="285" width="' + w + '" height="120" fill="url(#cy' + u + ')" stroke="#475569" stroke-width="1.5"/>';
      }
    }
    if (sc.type === 'internal') {
      const xr = G.X0 + w;
      return '<rect x="' + (G.X0 - 70) + '" y="22" width="70" height="106" fill="url(#ha' + u + ')" stroke="#92400e" stroke-width="2"/>' +
        '<rect x="' + xr + '" y="22" width="70" height="106" fill="url(#ha' + u + ')" stroke="#92400e" stroke-width="2"/>' +
        '<text x="' + (G.X0 - 35) + '" y="16" text-anchor="middle" font-size="11" fill="#92400e">' + esc(lt('pipe wall', 'পাইপের দেয়াল')) + '</text>';
    }
    if (sc.type === 'depth') {
      const xe = G.X_E, len = w;
      return '<rect x="' + xe + '" y="78" width="' + (len + 40) + '" height="38" fill="url(#ha' + u + ')" stroke="#92400e" stroke-width="2"/>' +
        '<rect x="' + xe + '" y="186" width="' + (len + 40) + '" height="38" fill="url(#ha' + u + ')" stroke="#92400e" stroke-width="2"/>' +
        '<rect x="' + (xe + len) + '" y="78" width="40" height="146" fill="url(#ha' + u + ')" stroke="#92400e" stroke-width="2"/>' +
        '<text x="' + (xe + len / 2) + '" y="248" text-anchor="middle" font-size="12" fill="#92400e">' + esc(lt('container (cross-section, turned 90° for clarity)', 'পাত্র (প্রস্থচ্ছেদ, বোঝার সুবিধার্থে ৯০° ঘোরানো)')) + '</text>';
    }
    return '';
  }
  calloutMarkup(jx, gap) {
    const G = GEO;
    const two = LANG === 'both';
    const txt = (x, y, anchor, en, bn) => {
      if (LANG === 'en') return '<text class="callout" x="' + x + '" y="' + y + '" text-anchor="' + anchor + '">' + esc(en) + '</text>';
      if (LANG === 'bn') return '<text class="callout" x="' + x + '" y="' + y + '" text-anchor="' + anchor + '">' + esc(bn) + '</text>';
      return '<text class="callout" x="' + x + '" y="' + y + '" text-anchor="' + anchor + '"><tspan x="' + x + '">' + esc(en) + '</tspan><tspan x="' + x + '" dy="17">' + esc(bn) + '</tspan></text>';
    };
    const defs = [
      { k: 'insideJaws', x: 10, y: 22, a: 'start', t: [G.X0 + 8, 62], lx: 70, ly: two ? 46 : 30, en: 'Inside jaws', bn: 'ভিতরের চোয়াল' },
      { k: 'mainScale', x: 560, y: 34, a: 'middle', t: [560, 160], lx: 560, ly: two ? 56 : 40, en: 'Main scale', bn: 'প্রধান স্কেল' },
      { k: 'lockScrew', x: jx + 110, y: 30, a: 'start', t: [jx + 58, 82], lx: jx + 106, ly: two ? 40 : 34, en: 'Locking screw', bn: 'লকিং স্ক্রু' },
      { k: 'vernierScale', x: jx + 112, y: 300, a: 'start', t: [jx + 44, 238], lx: jx + 108, ly: 296, en: 'Vernier scale', bn: 'ভার্নিয়ার স্কেল' },
      { k: 'movableJaw', x: jx + 60, y: 446, a: 'start', t: [jx + 14, 410], lx: jx + 56, ly: 436, en: 'Movable jaw', bn: 'চলমান চোয়াল' },
      { k: 'fixedJaw', x: 8, y: 446, a: 'start', t: [G.X0 - 14, 410], lx: 40, ly: 436, en: 'Fixed jaw', bn: 'স্থির চোয়াল' }
    ];
    if (gap >= 14) defs.push({ k: 'outsideJaws', x: (G.X0 + jx) / 2, y: 446, a: 'middle', t: [(G.X0 + jx) / 2, 400], lx: (G.X0 + jx) / 2, ly: 432, en: 'Outside jaws', bn: 'বাইরের চোয়াল' });
    if (gap >= 8) defs.push({ k: 'depthRod', x: G.X_E + 14, y: 258, a: 'start', t: [G.X_E + Math.min(gap * G.S, 160) * .5, 150], lx: G.X_E + 40, ly: 244, en: 'Depth rod', bn: 'গভীরতা দণ্ড' });
    return defs.map(d => '<g class="callout-group' + (this.selected === d.k ? ' sel' : '') + '" pointer-events="none">' +
      '<line class="callout-line" x1="' + d.lx + '" y1="' + d.ly + '" x2="' + d.t[0] + '" y2="' + d.t[1] + '"/>' +
      '<circle class="callout-dot" cx="' + d.t[0] + '" cy="' + d.t[1] + '" r="4.5"/>' + txt(d.x, d.y, d.a, d.en, d.bn) + '</g>').join('');
  }
  renderMain() {
    const G = GEO, S = G.S, u = this.uid;
    const sel = k => (this.selected === k ? ' sel' : '');
    const gap = (this.pos - this.ze) / 10;           // true jaw opening in mm
    const zeMm = this.ze / 10;
    const jx = G.X0 + gap * S;                        // x of movable-jaw face
    let s = this.defs();
    s += this.objectMarkup(u);
    // beam + main scale
    s += '<rect class="shape-beam" x="' + (G.X0 - 30) + '" y="130" width="' + (G.X_E - G.X0 + 30) + '" height="70" fill="url(#st' + u + ')" stroke="#334155" stroke-width="2"/>';
    s += this.tickCache;
    s += '<text x="' + (G.X0 + 12) + '" y="150" font-size="12" font-weight="700" fill="#64748b">' + esc(lt('MAIN SCALE (cm)', 'প্রধান স্কেল (সে.মি.)')) + '</text>';
    s += '<rect class="hit' + sel('mainScale') + '" data-part="mainScale" x="' + G.X0 + '" y="150" width="' + (G.X_E - G.X0) + '" height="50"/>';
    if (this.hl.main) s += '<rect x="' + (G.X0 - 6) + '" y="160" width="' + (G.X_E - G.X0 + 12) + '" height="44" rx="6" fill="rgba(245,158,11,.22)" stroke="#f59e0b" stroke-width="3" pointer-events="none"/>';
    // fixed jaws
    s += '<g data-part="insideJaws" class="' + sel('insideJaws') + '"><polygon class="shape" points="' + G.X0 + ',128 ' + G.X0 + ',50 ' + (G.X0 + 14) + ',50 ' + (G.X0 + 22) + ',62 ' + (G.X0 + 22) + ',128" fill="url(#sd' + u + ')" stroke="#334155" stroke-width="1.5"/></g>';
    s += '<g data-part="fixedJaw" class="' + sel('fixedJaw') + '"><polygon class="shape" points="' + (G.X0 - 30) + ',130 ' + G.X0 + ',130 ' + G.X0 + ',432 ' + (G.X0 - 14) + ',432 ' + (G.X0 - 30) + ',400" fill="url(#st' + u + ')" stroke="#334155" stroke-width="2"/></g>';
    // outside-jaw gap hit area
    if (gap * S > 4) s += '<rect class="hit' + sel('outsideJaws') + '" data-part="outsideJaws" x="' + G.X0 + '" y="262" width="' + (gap * S) + '" height="170"/>';
    // depth rod
    if (gap > 0) {
      s += '<g data-part="depthRod" class="' + sel('depthRod') + '"><rect class="shape" x="' + G.X_E + '" y="139" width="' + (gap * S) + '" height="9" fill="url(#sd' + u + ')" stroke="#334155" stroke-width="1.5"/>' +
        '<rect class="hit" x="' + G.X_E + '" y="128" width="' + (gap * S) + '" height="32"/></g>';
    }
    // movable assembly (local x = 0 at the jaw face)
    let vt = '';
    for (let n = 0; n <= 10; n++) {
      const x = zeMm * S + n * 0.9 * S;
      const len = n % 5 === 0 ? 20 : 12;
      vt += '<line x1="' + x + '" y1="200" x2="' + x + '" y2="' + (200 + len) + '" stroke="' + (n === 0 ? '#dc2626' : '#1e3a8a') + '" stroke-width="' + (n === 0 ? 2 : 1.2) + '"/>';
      if (n % 5 === 0) vt += '<text x="' + x + '" y="' + (200 + len + 13) + '" text-anchor="middle" font-size="11" font-weight="700" fill="#1e3a8a">' + n + '</text>';
    }
    const lockFill = this.locked ? '#b45309' : '#475569';
    s += '<g transform="translate(' + jx + ',0)">' +
      '<g data-part="insideJaws" data-drag="1" class="' + sel('insideJaws') + '"><polygon class="shape" points="-22,128 -22,62 -14,50 0,50 0,128" fill="url(#sd' + u + ')" stroke="#334155" stroke-width="1.5"/></g>' +
      '<g data-part="movableJaw" data-drag="1" class="' + sel('movableJaw') + '">' +
      '<rect class="shape" x="-22" y="96" width="112" height="34" rx="5" fill="url(#st' + u + ')" stroke="#334155" stroke-width="2"/>' +
      '<rect class="shape" x="64" y="130" width="26" height="72" fill="url(#st' + u + ')" stroke="#334155" stroke-width="2"/>' +
      '<polygon class="shape" points="0,200 30,200 30,400 14,432 0,432" fill="url(#st' + u + ')" stroke="#334155" stroke-width="2"/></g>' +
      '<g data-part="lockScrew" data-drag="1" class="' + sel('lockScrew') + '"><rect class="shape" x="40" y="76" width="30" height="22" rx="5" fill="' + lockFill + '" stroke="#1e293b" stroke-width="1.5"/>' +
      '<g stroke="#e2e8f0" stroke-width="1.5" opacity=".8"><line x1="47" y1="80" x2="47" y2="94"/><line x1="55" y1="80" x2="55" y2="94"/><line x1="63" y1="80" x2="63" y2="94"/></g>' +
      '<rect x="51" y="96" width="8" height="3" fill="#1e293b"/></g>' +
      '<g data-part="vernierScale" data-drag="1" class="' + sel('vernierScale') + '"><rect class="shape" x="-8" y="200" width="98" height="62" rx="4" fill="url(#pl' + u + ')" stroke="#1e3a8a" stroke-width="2"/>' + vt + '</g>' +
      '</g>';
    if (this.hl.vernier) s += '<rect x="' + (jx - 14) + '" y="196" width="112" height="70" rx="6" fill="rgba(245,158,11,.22)" stroke="#f59e0b" stroke-width="3" pointer-events="none"/>';
    if (this.o.labels) s += this.calloutMarkup(jx, gap);
    this.svg.innerHTML = s;
    // zoom: crop the viewBox around the vernier area
    const z = this.zoom, w = G.VIEW_W / z, h = G.VIEW_H / z;
    const cx = jx + 40, cy = 230;
    const vx = clamp(cx - w / 2, 0, G.VIEW_W - w), vy = clamp(cy - h / 2, 0, G.VIEW_H - h);
    this.svg.setAttribute('viewBox', vx.toFixed(1) + ' ' + vy.toFixed(1) + ' ' + w.toFixed(1) + ' ' + h.toFixed(1));
  }
  renderLensView() {
    renderLens(this.lensSvg, {
      posMm: this.pos / 10, pxPerMm: this.lensPx(), msdMm: 1, N: 10, spanMsd: 9,
      showMsr: this.showHelp || this.hl.msr, showCoin: this.showHelp || this.hl.coin, hl: this.hl
    });
  }
  renderPanel() {
    if (!this.o.panel) return;
    const r = this.snapshot();
    const set = (n, v) => { const e = this.r(n); if (e) e.textContent = v; };
    set('msr', fmt(r.msrCm, 1) + ' cm');
    set('vc', String(r.coincidence));
    set('vsr', fmt(r.vsrCm, 2) + ' cm');
    set('obs', fmt(r.observedCm, 2) + ' cm');
    set('ze', fmtSigned(r.zeCm, 2) + ' cm');
    set('final', fmt(r.correctCm, 2) + ' cm');
    const calc = this.r('calc');
    const msr = fmt(r.msrCm, 1), n = r.coincidence, vsr = fmt(r.vsrCm, 2), obs = fmt(r.observedCm, 2), fin = fmt(r.correctCm, 2);
    let html = '<span class="c-res">Final Reading</span> = <span class="c-msr">MSR</span> + (<span class="c-n">n</span> × <span class="c-lc">LC</span>)<br>' +
      '= <span class="c-msr">' + msr + '</span> + (<span class="c-n">' + n + '</span> × <span class="c-lc">0.01</span>) = <span class="c-msr">' + msr + '</span> + ' + vsr + ' = <span class="c-res">' + obs + ' cm</span>';
    if (this.ze !== 0) {
      html += '<br><span class="c-ze">Zero error = ' + fmtSigned(r.zeCm, 2) + ' cm</span> ⇒ Correct = ' + obs + ' − (' + fmtSigned(r.zeCm, 2) + ') = <span class="c-res">' + fin + ' cm</span>';
    }
    calc.innerHTML = html;
  }
  syncControls(lim) {
    if (this.slider) {
      this.slider.min = lim.min; this.slider.max = lim.max; this.slider.step = 1;
      this.slider.value = this.pos;
      this.slider.disabled = this.locked || lim.min === lim.max;
      const out = this.r('gap');
      if (out) out.textContent = this.o.hideGap ? '' : fmt((this.pos - this.ze) / 10, 1) + ' mm';
    }
    const lock = this.r('lockbtn');
    if (lock) { lock.innerHTML = (this.locked ? '🔒 ' : '🔓 ') + bi(this.locked ? 'Unlock screw' : 'Lock screw', this.locked ? 'স্ক্রু খোলো' : 'স্ক্রু আটকাও'); lock.classList.toggle('on', this.locked); }
    const help = this.r('helpbtn');
    if (help) help.classList.toggle('on', this.showHelp);
    $$('[data-a="m10"],[data-a="m1"],[data-a="p1"],[data-a="p10"],[data-a="open"],[data-a="close"]', this.host).forEach(b => { b.disabled = this.locked; });
  }
}
langListeners.push(() => SIMS.forEach(sim => sim.update()));

/* ===================== 4. MODULE LOGIC ===================== */
function nice(x) { return String(Number(Number(x).toPrecision(6))); }
function decimalsFor(lcCm) { return clamp(Math.ceil(-Math.log10(lcCm) - 1e-9), 2, 6); }
function stepCard(num, title, eq, text, cls, delay) {
  return '<div class="step-card ' + (cls || '') + '" style="animation-delay:' + (delay || 0) + 'ms"><div class="num">' + num + '</div><div>' +
    '<div class="step-title">' + title + '</div>' + (eq ? '<div class="eq">' + eq + '</div>' : '') + (text ? '<div class="step-copy">' + text + '</div>' : '') + '</div></div>';
}

/* ---------------- Module 1: labelled diagram ---------------- */
function initModule1() {
  const info = $('#m1-info');
  let current = null;
  function render() {
    const p = PARTS[current];
    if (!p) {
      info.innerHTML = '<h3>👆 ' + bi('Pick a part', 'একটি অংশ বেছে নাও') + '</h3><p>' + bi('Hover over or click any part of the instrument — or use the buttons below — to learn its name, job and a simple explanation.', 'যন্ত্রের যেকোনো অংশের উপর মাউস নিয়ে যাও বা ক্লিক করো — অথবা নিচের বাটন ব্যবহার করো — নাম, কাজ ও সহজ ব্যাখ্যা জানতে।') + '</p>';
      return;
    }
    info.innerHTML = '<h3>' + p.icon + ' ' + bi(p.en.name, p.bn.name) + '</h3>' +
      '<h4>' + bi('What does it do?', 'কাজ কী?') + '</h4><p>' + bi(p.en.func, p.bn.func) + '</p>' +
      '<h4>' + bi('Simple explanation', 'সহজ ব্যাখ্যা') + '</h4><p>' + bi(p.en.simple, p.bn.simple) + '</p>';
  }
  const sim = new CaliperSim($('#m1-sim'), {
    controls: 'basic', panel: false, labels: true, helpDefault: true, initialGap: 246,
    onPartSelect: k => { current = k; render(); markChips(); },
    onPartHover: k => { if (k !== current) { current = k; render(); markChips(); } }
  });
  const chips = $('#m1-chips');
  chips.innerHTML = PART_ORDER.map(k => '<button class="chip" data-part="' + k + '">' + PARTS[k].icon + ' ' + bi(PARTS[k].en.name, PARTS[k].bn.name) + '</button>').join('');
  function markChips() { $$('.chip', chips).forEach(c => c.classList.toggle('active', c.dataset.part === current)); }
  chips.addEventListener('click', e => {
    const c = e.target.closest('.chip');
    if (c) { sim.selectPart(c.dataset.part); }
  });
  render();
  langListeners.push(render);
}

/* ---------------- Module 2: main simulator ---------------- */
function initModule2() {
  const sel = $('#m2-scenario'), truth = $('#m2-truth');
  const objects = {};
  const sim = new CaliperSim($('#m2-sim'), { controls: 'full', panel: true, helpDefault: true, initialGap: 236 });
  function makeObject(type) {
    if (type === 'external') return { type: 'external', kind: 'cylinder', size: randInt(120, 320) };
    if (type === 'internal') return { type: 'internal', kind: 'pipe', size: randInt(100, 300) };
    return { type: 'depth', kind: 'cup', size: randInt(150, 450) };
  }
  function apply(fresh) {
    const type = sel.value;
    truth.textContent = '';
    if (type === 'free') { sim.setScenario({ type: 'free' }); sim.setPos(236, true); return; }
    if (fresh || !objects[type]) objects[type] = makeObject(type);
    sim.setScenario(objects[type]);
  }
  sel.addEventListener('change', () => apply(false));
  $('#m2-newobj').addEventListener('click', () => { if (sel.value === 'free') { toast(lt('Choose an experiment with an object first.', 'আগে বস্তুসহ একটি পরীক্ষা বেছে নাও।')); return; } apply(true); });
  $('#m2-reveal').addEventListener('click', () => {
    const sc = sim.scenario;
    if (sc.type === 'free') { truth.textContent = lt('No object — read any value you like!', 'কোনো বস্তু নেই — যেকোনো মান পড়ে দেখো!'); return; }
    truth.textContent = lt('True size: ', 'আসল মাপ: ') + fmt(sc.size / 100, 2) + ' cm (' + fmt(sc.size / 10, 1) + ' mm)';
  });
  $('#m2-examples').addEventListener('click', e => {
    const b = e.target.closest('[data-pos]');
    if (!b) return;
    sel.value = 'free'; apply(false);
    sim.animateTo(parseInt(b.dataset.pos, 10), 700);
  });
  moduleEnterHooks.m2 = () => sim.update();
}

/* ---------------- Module 3: least count lab ---------------- */
function initModule3() {
  const inMsd = $('#lc-msd'), inN = $('#lc-n'), inM = $('#lc-m'), err = $('#lc-error'), steps = $('#lc-steps');
  const svg = $('#lc-lens'), shift = $('#lc-shift'), out = $('#lc-shift-out'), table = $('#lc-table');
  let model = null;
  function compute() {
    const msd = parseFloat(inMsd.value), N = Number(inN.value), M = Number(inM.value);
    const v = validateLCInputs(msd, N, M);
    if (!v.ok) {
      err.hidden = false; err.innerHTML = bi(v.en, v.bn);
      steps.innerHTML = ''; table.innerHTML = ''; svg.innerHTML = ''; model = null;
      return;
    }
    err.hidden = true;
    const lcMm = leastCount(msd, N, M), vsd = roundTo(M * msd / N, 8), lcCm = lcMm / 10;
    model = { msd, N, M, lcMm, vsd };
    const dec = decimalsFor(lcCm);
    let h = '';
    h += stepCard(1, bi('Write the relation', 'সম্পর্কটি লেখো'), N + ' VSD = ' + M + ' MSD', bi('The vernier scale is slightly shorter than the main-scale length it matches.', 'ভার্নিয়ার স্কেল, মিলে যাওয়া প্রধান স্কেলের দৈর্ঘ্যের চেয়ে সামান্য ছোট।'), '', 0);
    h += stepCard(2, bi('Value of 1 VSD', '১ VSD-এর মান'), '1 VSD = ' + M + '/' + N + ' MSD = ' + nice(M / N) + ' MSD = ' + nice(vsd) + ' mm', bi('Divide both sides by N.', 'দুই পাশকে N দিয়ে ভাগ করো।'), '', 120);
    h += stepCard(3, bi('Least count = 1 MSD − 1 VSD', 'লঘিষ্ঠ গণন = ১ MSD − ১ VSD'), 'LC = ' + nice(msd) + ' − ' + nice(vsd) + ' = ' + nice(lcMm) + ' mm = ' + nice(lcCm) + ' cm', bi('The tiny difference between one main division and one vernier division is the least count.', 'একটি প্রধান ভাগ ও একটি ভার্নিয়ার ভাগের ক্ষুদ্র পার্থক্যই লঘিষ্ঠ গণন।'), 'final', 240);
    if (M === N - 1) {
      h += stepCard(4, bi('Shortcut check', 'শর্টকাট যাচাই'), 'LC = 1 MSD ÷ N = ' + nice(msd) + ' mm ÷ ' + N + ' = ' + nice(msd / N) + ' mm ✔', bi('When N VSD = (N − 1) MSD, LC is simply 1 MSD divided by N — the formula you will use in exams.', 'যখন N VSD = (N − 1) MSD, তখন LC = ১ MSD ÷ N — পরীক্ষায় এই সূত্রই ব্যবহার করবে।'), '', 360);
    } else {
      h += stepCard(4, bi('Note', 'লক্ষ করো'), 'LC = 1 MSD × (N − M) ÷ N', bi('The shortcut "1 MSD ÷ N" works only when M = N − 1. This is a non-standard vernier.', '"১ MSD ÷ N" শর্টকাটটি শুধু M = N − 1 হলে কাজ করে। এটি অস্বাভাবিক ভার্নিয়ার।'), 'warn', 360);
    }
    h += stepCard(5, bi('Decimal places', 'দশমিক ঘর'), bi('Readings are written to ' + dec + ' decimal places in cm', 'পাঠ সে.মি.-এ ' + dec + ' ঘর দশমিক পর্যন্ত লিখতে হবে'), '', '', 480);
    steps.innerHTML = h;
    shift.max = N;
    if (Number(shift.value) > N) shift.value = N;
    draw();
    let t = '<thead><tr><th>n</th><th>' + bi('n VSD in MSD', 'n VSD (MSD-এ)') + '</th><th>' + bi('Gap: n MSD − n VSD', 'ব্যবধান: n MSD − n VSD') + '</th></tr></thead><tbody>';
    const rows = Math.min(N, 12);
    for (let n = 1; n <= rows; n++) {
      t += '<tr data-row="' + n + '"><td>' + n + '</td><td>' + nice(n * M / N) + ' MSD</td><td>' + nice(n * lcMm) + ' mm (= ' + n + ' × LC)</td></tr>';
    }
    table.innerHTML = t + '</tbody>';
    markRow();
  }
  function draw() {
    if (!model) return;
    const k = Number(shift.value);
    const px = clamp(760 / ((model.M + 4) * model.msd), 8, 40);
    const posMm = 2 * model.msd + k * model.lcMm;
    renderLens(svg, { posMm, pxPerMm: px, msdMm: model.msd, N: model.N, spanMsd: model.M, leftPadMm: 2 * model.msd, showMsr: true, showCoin: true });
    out.textContent = k + ' × LC = ' + nice(k * model.lcMm) + ' mm';
    markRow();
  }
  function markRow() { $$('#lc-table tr[data-row]').forEach(r => r.classList.toggle('hl', Number(r.dataset.row) === Number(shift.value))); }
  [inMsd, inN, inM].forEach(i => i.addEventListener('input', compute));
  shift.addEventListener('input', draw);
  $('#lc-presets').addEventListener('click', e => {
    const b = e.target.closest('[data-n]');
    if (!b) return;
    inMsd.value = b.dataset.msd; inN.value = b.dataset.n; inM.value = b.dataset.m; compute();
  });
  langListeners.push(() => { if (model) draw(); });
  compute();
}

/* ---------------- Module 4: zero error ---------------- */
function initModule4() {
  const sim = new CaliperSim($('#ze-sim'), { controls: false, panel: false, fixedClosed: true, helpDefault: true });
  const slider = $('#ze-slider'), out = $('#ze-slider-out'), info = $('#ze-info'), obsIn = $('#ze-obs'), calc = $('#ze-calc');
  let timer = null, ze = 3;
  sim.setZeroError(3);
  sim.setZoom(3);
  function describe() {
    const r = readVernier(ze), type = classifyZero(ze), n = r.coincidence;
    const zeCm = zeroErrorFromCoincidence(type, n, 10, 0.01);
    out.textContent = fmtSigned(ze / 100, 2) + ' cm';
    let h = '';
    if (type === 'none') {
      h += stepCard(1, bi('Look at the two zeros', 'দুটি শূন্য দেখো'), '', bi('The vernier zero sits exactly on the main-scale zero.', 'ভার্নিয়ারের শূন্য ঠিক প্রধান স্কেলের শূন্যের উপর আছে।'), '', 0);
      h += stepCard(2, bi('Result', 'ফলাফল'), 'ZE = 0.00 cm, ZC = 0.00 cm', bi('The instrument has no zero error — readings need no correction.', 'যন্ত্রে শূন্য ত্রুটি নেই — পাঠ সংশোধনের দরকার নেই।'), 'final', 120);
    } else if (type === 'positive') {
      h += stepCard(1, bi('Vernier zero is to the RIGHT of main zero', 'ভার্নিয়ারের শূন্য প্রধান শূন্যের ডানে'), '', bi('Jaws are closed but the instrument reads more than zero ⇒ <b>positive</b> zero error.', 'চোয়াল বন্ধ, তবুও যন্ত্র শূন্যের চেয়ে বেশি দেখাচ্ছে ⇒ <b>ধনাত্মক</b> শূন্য ত্রুটি।'), '', 0);
      h += stepCard(2, bi('Find the coinciding vernier line', 'মিলে যাওয়া ভার্নিয়ার দাগ খোঁজো'), 'n = ' + n, '', '', 120);
      h += stepCard(3, bi('Zero error', 'শূন্য ত্রুটি'), 'ZE = + n × LC = + ' + n + ' × 0.01 = ' + fmtSigned(zeCm, 2) + ' cm', '', 'warn', 240);
      h += stepCard(4, bi('Zero correction (opposite sign)', 'শূন্য সংশোধন (উল্টো চিহ্ন)'), 'ZC = − ZE = ' + fmtSigned(-zeCm, 2) + ' cm', bi('Every reading will be too big by ' + fmt(zeCm, 2) + ' cm, so we subtract it.', 'প্রতিটি পাঠ ' + fmt(zeCm, 2) + ' সে.মি. বেশি আসবে, তাই বিয়োগ করি।'), 'final', 360);
    } else {
      h += stepCard(1, bi('Vernier zero is to the LEFT of main zero', 'ভার্নিয়ারের শূন্য প্রধান শূন্যের বামে'), '', bi('Jaws are closed but the instrument reads less than zero ⇒ <b>negative</b> zero error.', 'চোয়াল বন্ধ, তবুও যন্ত্র শূন্যের চেয়ে কম দেখাচ্ছে ⇒ <b>ঋণাত্মক</b> শূন্য ত্রুটি।'), '', 0);
      h += stepCard(2, bi('Find the coinciding vernier line', 'মিলে যাওয়া ভার্নিয়ার দাগ খোঁজো'), 'n = ' + n, '', '', 120);
      h += stepCard(3, bi('Zero error', 'শূন্য ত্রুটি'), 'ZE = − (N − n) × LC = − (10 − ' + n + ') × 0.01 = ' + fmtSigned(zeCm, 2) + ' cm', bi('For negative error we count how far the coinciding line is from the <u>end</u> (10) of the vernier.', 'ঋণাত্মক ত্রুটিতে মিলে যাওয়া দাগ ভার্নিয়ারের <u>শেষ</u> দাগ (১০) থেকে কত দূরে তা গুনি।'), 'warn', 240);
      h += stepCard(4, bi('Zero correction (opposite sign)', 'শূন্য সংশোধন (উল্টো চিহ্ন)'), 'ZC = − ZE = ' + fmtSigned(-zeCm, 2) + ' cm', bi('Every reading will be too small by ' + fmt(-zeCm, 2) + ' cm, so we add it.', 'প্রতিটি পাঠ ' + fmt(-zeCm, 2) + ' সে.মি. কম আসবে, তাই যোগ করি।'), 'final', 360);
    }
    info.innerHTML = h;
    const obs = parseFloat(obsIn.value);
    if (!isFinite(obs)) { calc.innerHTML = '<div class="msg error">' + bi('Enter a valid number for the observed reading.', 'পর্যবেক্ষিত পাঠের জন্য সঠিক সংখ্যা দাও।') + '</div>'; return; }
    const correct = computeCorrect(obs, zeCm);
    calc.innerHTML = stepCard('✔', bi('Correct the observed reading', 'পর্যবেক্ষিত পাঠ সংশোধন'), 'Correct = Observed − ZE = ' + fmt(obs, 2) + ' − (' + fmtSigned(zeCm, 2) + ') = ' + fmt(correct, 2) + ' cm',
      bi('Same as Observed + ZC = ' + fmt(obs, 2) + ' + (' + fmtSigned(-zeCm, 2) + ') = ' + fmt(correct, 2) + ' cm.', 'অর্থাৎ Observed + ZC = ' + fmt(obs, 2) + ' + (' + fmtSigned(-zeCm, 2) + ') = ' + fmt(correct, 2) + ' সে.মি.।'), 'final', 0);
  }
  function apply(v) {
    ze = clamp(Math.round(v), -9, 9);
    slider.value = ze;
    sim.setZeroError(ze);
    describe();
  }
  slider.addEventListener('input', () => { stopAnim(); apply(parseInt(slider.value, 10)); });
  obsIn.addEventListener('input', describe);
  $('#ze-presets').addEventListener('click', e => {
    const b = e.target.closest('[data-ze]');
    if (b) { stopAnim(); apply(parseInt(b.dataset.ze, 10)); }
  });
  function stopAnim() { if (timer) { clearInterval(timer); timer = null; } }
  $('#ze-anim').addEventListener('click', () => {
    if (timer) { stopAnim(); return; }
    let v = -9;
    apply(v);
    timer = setInterval(() => { v++; if (v > 9) { stopAnim(); return; } apply(v); }, 320);
  });
  moduleEnterHooks.m4 = () => sim.update();
  apply(3);
}

/* ---------------- Module 7: solver ---------------- */
function initModule7() {
  const f = { msr: $('#sv-msr'), n: $('#sv-n'), lc: $('#sv-lc'), ze: $('#sv-ze'), msd: $('#sv-msd') };
  const err = $('#sv-error'), out = $('#sv-steps'), lensBox = $('#sv-lens-box'), lens = $('#sv-lens');
  function fail(en, bn) { err.hidden = false; err.innerHTML = bi(en, bn); out.innerHTML = ''; lensBox.hidden = true; }
  function solve() {
    err.hidden = true;
    const raw = { msr: f.msr.value.trim(), n: f.n.value.trim(), lc: f.lc.value.trim(), ze: f.ze.value.trim(), msd: f.msd.value.trim() };
    if (raw.msr === '' || raw.n === '' || raw.lc === '') return fail('Please fill in MSR, n and LC.', 'অনুগ্রহ করে MSR, n ও LC পূরণ করো।');
    const msr = Number(raw.msr), n = Number(raw.n), lc = Number(raw.lc);
    const ze = raw.ze === '' ? 0 : Number(raw.ze);
    const msd = raw.msd === '' ? 0.1 : Number(raw.msd);
    if (![msr, n, lc, ze, msd].every(isFinite)) return fail('All inputs must be valid numbers.', 'সব ঘরে সঠিক সংখ্যা দিতে হবে।');
    if (msr < 0) return fail('MSR cannot be negative.', 'MSR ঋণাত্মক হতে পারে না।');
    if (!Number.isInteger(n) || n < 0) return fail('n must be a whole number (0, 1, 2, …).', 'n অবশ্যই পূর্ণসংখ্যা (০, ১, ২, …) হতে হবে।');
    if (lc <= 0) return fail('Least count must be greater than zero.', 'লঘিষ্ঠ গণন শূন্যের চেয়ে বড় হতে হবে।');
    if (msd <= 0) return fail('1 MSD must be greater than zero.', '১ MSD শূন্যের চেয়ে বড় হতে হবে।');
    const N = Math.round(msd / lc);
    if (N >= 1 && n > N) return fail('n cannot be larger than N = ' + N + ' (the vernier scale only has ' + N + ' divisions for LC = ' + nice(lc) + ' cm).', 'n, N = ' + N + '-এর চেয়ে বড় হতে পারে না (LC = ' + nice(lc) + ' সে.মি. হলে ভার্নিয়ারে মাত্র ' + N + 'টি ভাগ)।');
    const dec = decimalsFor(lc);
    const vsr = roundTo(n * lc, 8), obs = computeObserved(msr, n, lc), cor = computeCorrect(obs, ze);
    let warn = '';
    if (Math.abs(msr / msd - Math.round(msr / msd)) > 1e-6) warn += '<div class="msg error">' + bi('Check: MSR should be a multiple of 1 MSD (' + nice(msd) + ' cm). Real readings never fall between two main-scale marks.', 'লক্ষ করো: MSR অবশ্যই ১ MSD (' + nice(msd) + ' সে.মি.)-এর গুণিতক হবে। বাস্তবে MSR দুই দাগের মাঝে হয় না।') + '</div>';
    if (Math.abs(N * lc - msd) > 1e-6) warn += '<div class="msg error">' + bi('Check: LC × N should equal 1 MSD. Your LC does not divide ' + nice(msd) + ' cm exactly.', 'লক্ষ করো: LC × N = ১ MSD হওয়া উচিত। তোমার LC, ' + nice(msd) + ' সে.মি.-কে ভাগ করে না।') + '</div>';
    const zeType = ze > 0 ? ['positive', 'ধনাত্মক'] : ze < 0 ? ['negative', 'ঋণাত্মক'] : ['no', 'নেই'];
    let h = warn;
    h += stepCard(1, bi('Given values', 'প্রদত্ত মান'), 'MSR = ' + fmt(msr, dec) + ' cm, n = ' + n + ', LC = ' + nice(lc) + ' cm, ZE = ' + fmtSigned(ze, dec) + ' cm', bi('Write down everything the problem gives you first.', 'আগে সমস্যায় যা দেওয়া আছে সব লিখে নাও।'), '', 0);
    h += stepCard(2, bi('Vernier Scale Reading (VSR)', 'ভার্নিয়ার স্কেল পাঠ (VSR)'), 'VSR = n × LC = ' + n + ' × ' + nice(lc) + ' = ' + fmt(vsr, dec) + ' cm', bi('The coinciding line tells how many least-counts to add.', 'মিলে যাওয়া দাগ বলে দেয় কয়টি লঘিষ্ঠ গণন যোগ হবে।'), '', 150);
    h += stepCard(3, bi('Observed Reading', 'পর্যবেক্ষিত পাঠ'), 'Observed = MSR + VSR = ' + fmt(msr, dec) + ' + ' + fmt(vsr, dec) + ' = ' + fmt(obs, dec) + ' cm', bi('Equivalent to MSR + (n × LC).', 'অর্থাৎ MSR + (n × LC)।'), '', 300);
    h += stepCard(4, bi('Zero error and zero correction', 'শূন্য ত্রুটি ও শূন্য সংশোধন'), 'ZE = ' + fmtSigned(ze, dec) + ' cm → ZC = ' + fmtSigned(-ze, dec) + ' cm',
      ze === 0 ? bi('No zero error, so no correction is needed.', 'শূন্য ত্রুটি নেই, তাই সংশোধন দরকার নেই।') : bi('This is a ' + zeType[0] + ' zero error. Zero correction has the opposite sign.', 'এটি ' + zeType[1] + ' শূন্য ত্রুটি। শূন্য সংশোধনের চিহ্ন উল্টো।'), 'warn', 450);
    h += stepCard(5, bi('Correct Reading', 'সঠিক পাঠ'), 'Correct = Observed − ZE = ' + fmt(obs, dec) + ' − (' + fmtSigned(ze, dec) + ') = ' + fmt(cor, dec) + ' cm', '', '', 600);
    h += stepCard('★', bi('Final answer', 'চূড়ান্ত উত্তর'), fmt(cor, dec) + ' cm  =  ' + fmt(cor * 10, Math.max(1, dec - 1)) + ' mm', bi('Always write the unit and the right number of decimal places.', 'সবসময় একক ও সঠিক দশমিক ঘর লেখো।'), 'final', 750);
    out.innerHTML = h;
    const lensOk = Math.abs(lc - 0.01) < 1e-9 && Math.abs(msd - 0.1) < 1e-9 && n <= 9 && Math.abs(msr * 10 - Math.round(msr * 10)) < 1e-6 && obs * 10 <= 100;
    lensBox.hidden = !lensOk;
    if (lensOk) renderLens(lens, { posMm: obs * 10, pxPerMm: 40, msdMm: 1, N: 10, spanMsd: 9, showMsr: true, showCoin: true });
  }
  function setVals(msr, n, lc, ze) { f.msr.value = msr; f.n.value = n; f.lc.value = lc; f.ze.value = ze; f.msd.value = '0.1'; solve(); }
  $('#sv-go').addEventListener('click', solve);
  $('#sv-random').addEventListener('click', () => setVals((randInt(5, 80) / 10).toFixed(1), randInt(0, 9), '0.01', (randInt(-5, 5) / 100).toFixed(2)));
  $('#sv-ex1').addEventListener('click', () => setVals('3.4', 7, '0.01', '0.03'));
  $('#sv-ex2').addEventListener('click', () => setVals('1.2', 8, '0.01', '-0.02'));
  $('#sv-clear').addEventListener('click', () => { setVals('2.3', 6, '0.01', '0'); toast(lt('Reset to the textbook example', 'পাঠ্যবইয়ের উদাহরণে ফেরানো হলো')); });
  Object.values(f).forEach(i => i.addEventListener('keydown', e => { if (e.key === 'Enter') solve(); }));
  langListeners.push(() => { if (!lensBox.hidden) solve(); });
  solve();
}

/* ---------------- Module 5: measurement practice ---------------- */
const PRACTICE_OBJECTS = {
  coin: { icon: '🪙', en: 'Coin', bn: 'মুদ্রা', measures: [
    { id: 'd', type: 'external', kind: 'coin', range: [210, 280], en: 'Diameter of the coin', bn: 'মুদ্রার ব্যাস' }] },
  pencil: { icon: '✏️', en: 'Pencil', bn: 'পেন্সিল', measures: [
    { id: 'd', type: 'external', kind: 'pencil', range: [65, 89], en: 'Diameter of the pencil', bn: 'পেন্সিলের ব্যাস' }] },
  cylinder: { icon: '🔩', en: 'Metal cylinder', bn: 'ধাতব বেলন', measures: [
    { id: 'd', type: 'external', kind: 'cylinder', range: [120, 320], en: 'External diameter of the cylinder', bn: 'বেলনের বাইরের ব্যাস' },
    { id: 'h', type: 'external', kind: 'cylinder', range: [200, 450], en: 'Length of the cylinder (lying down)', bn: 'বেলনের দৈর্ঘ্য (শোয়ানো অবস্থায়)' }] },
  pipe: { icon: '🛠️', en: 'Hollow pipe', bn: 'ফাঁপা পাইপ', measures: [
    { id: 'od', type: 'external', kind: 'pipe', range: [150, 320], en: 'Outer diameter of the pipe', bn: 'পাইপের বাইরের ব্যাস' },
    { id: 'id', type: 'internal', kind: 'pipe', range: [100, 260], en: 'Inner diameter of the pipe', bn: 'পাইপের ভিতরের ব্যাস' }] },
  box: { icon: '📦', en: 'Small box', bn: 'ছোট বাক্স', measures: [
    { id: 'l', type: 'external', kind: 'box', range: [250, 450], en: 'Length of the box', bn: 'বাক্সের দৈর্ঘ্য' },
    { id: 'w', type: 'external', kind: 'box', range: [150, 300], en: 'Width of the box', bn: 'বাক্সের প্রস্থ' },
    { id: 'dep', type: 'depth', kind: 'cup', range: [150, 400], en: 'Inside depth of the open box', bn: 'খোলা বাক্সের ভিতরের গভীরতা' }] },
  ball: { icon: '⚪', en: 'Circular object (ball)', bn: 'বৃত্তাকার বস্তু (বল)', measures: [
    { id: 'd', type: 'external', kind: 'ball', range: [100, 199], en: 'Diameter of the ball', bn: 'বলের ব্যাস' }] }
};
const JAW_HELP = {
  external: { en: 'Use the <b>outside (lower) jaws</b>: press <i>Close</i> to grip the object.', bn: '<b>বাইরের (নিচের) চোয়াল</b> ব্যবহার করো: বস্তু আঁটকাতে <i>বন্ধ করো</i> চাপো।' },
  internal: { en: 'Use the <b>inside (upper) jaws</b>: press <i>Open</i> until they touch the inner wall.', bn: '<b>ভিতরের (উপরের) চোয়াল</b> ব্যবহার করো: ভিতরের দেয়াল ছোঁয়া পর্যন্ত <i>খোলো</i> চাপো।' },
  depth: { en: 'Use the <b>depth rod</b>: press <i>Open</i> until the rod touches the bottom.', bn: '<b>গভীরতা দণ্ড</b> ব্যবহার করো: তলায় না ঠেকা পর্যন্ত <i>খোলো</i> চাপো।' }
};

function initModule5() {
  const objSel = $('#pr-object'), meaSel = $('#pr-measure'), zeToggle = $('#pr-ze-toggle'), taskBox = $('#pr-task');
  const fMsr = $('#pr-msr'), fN = $('#pr-n'), fLc = $('#pr-lc'), fZe = $('#pr-ze'), result = $('#pr-result');
  const zeroBox = $('#pr-zero-box'), zeroLens = $('#pr-zero-lens'), hintBox = $('#pr-hint'), submitBtn = $('#pr-submit');
  const sim = new CaliperSim($('#pr-sim'), { controls: 'full', panel: true, helpDefault: false, hideGap: true });
  sim.setPanelVisible(false);
  let task = null, hintUsed = false;

  objSel.innerHTML = Object.keys(PRACTICE_OBJECTS).map(k => '<option value="' + k + '">' + PRACTICE_OBJECTS[k].icon + ' ' + PRACTICE_OBJECTS[k].en + ' / ' + PRACTICE_OBJECTS[k].bn + '</option>').join('');
  function fillMeasures() {
    const o = PRACTICE_OBJECTS[objSel.value];
    meaSel.innerHTML = o.measures.map(m => '<option value="' + m.id + '">' + m.en + ' / ' + m.bn + '</option>').join('');
  }
  function renderTask() {
    if (!task) return;
    const o = PRACTICE_OBJECTS[task.obj], m = o.measures.find(x => x.id === task.measure);
    taskBox.innerHTML = '<div style="font-size:1.5rem">' + o.icon + ' <b>' + bi(m.en, m.bn) + '</b></div><div>' + bi(JAW_HELP[m.type].en, JAW_HELP[m.type].bn) + '</div>' +
      '<div class="hint">' + bi('Read the magnifier, fill the answer sheet below, then submit. The true value stays hidden until you submit.', 'বিবর্ধক দেখে পাঠ নাও, নিচের উত্তরপত্র পূরণ করে জমা দাও। জমা না দেওয়া পর্যন্ত আসল মান লুকানো থাকবে।') + '</div>' +
      (task.ze !== 0 ? '<div class="note">' + bi('⚠ This instrument may have a zero error. Use “Check zero reading” first!', '⚠ এই যন্ত্রে শূন্য ত্রুটি থাকতে পারে। আগে “শূন্য পাঠ পরীক্ষা” করো!') + '</div>' : '');
  }
  function startTask(objKey, measureId) {
    const o = PRACTICE_OBJECTS[objKey], m = o.measures.find(x => x.id === measureId) || o.measures[0];
    const size = randInt(m.range[0], m.range[1]);
    const ze = zeToggle.checked ? randInt(1, 6) * (Math.random() < 0.5 ? -1 : 1) : 0;
    task = { obj: objKey, measure: m.id, size, ze, submitted: false };
    hintUsed = false; hintBox.checked = false;
    sim.reset();
    sim.setZeroError(ze);
    sim.setScenario({ type: m.type, kind: m.kind, size });
    sim.setPanelVisible(false);
    [fMsr, fN].forEach(i => { i.value = ''; }); fLc.value = '0.01'; fZe.value = '0';
    result.innerHTML = ''; zeroBox.hidden = true;
    submitBtn.disabled = false;
    renderTask();
  }
  function randomChallenge() {
    const keys = Object.keys(PRACTICE_OBJECTS);
    const k = keys[randInt(0, keys.length - 1)];
    objSel.value = k; fillMeasures();
    const ms = PRACTICE_OBJECTS[k].measures;
    meaSel.value = ms[randInt(0, ms.length - 1)].id;
    startTask(k, meaSel.value);
  }
  function drawZeroLens() { renderLens(zeroLens, { posMm: task.ze / 10, pxPerMm: 40, msdMm: 1, N: 10, spanMsd: 9, showMsr: false, showCoin: false }); }
  function submit() {
    if (!task || task.submitted) { toast(lt('Start a new challenge first.', 'আগে নতুন চ্যালেঞ্জ শুরু করো।')); return; }
    const msr = Number(fMsr.value), n = Number(fN.value), lc = Number(fLc.value), zeS = Number(fZe.value === '' ? 0 : fZe.value);
    if (fMsr.value.trim() === '' || fN.value.trim() === '' || !isFinite(msr) || !isFinite(n) || !isFinite(lc) || !isFinite(zeS)) { result.innerHTML = '<div class="msg error">' + bi('Please fill MSR, n, LC and zero error with valid numbers.', 'MSR, n, LC ও শূন্য ত্রুটি সঠিক সংখ্যায় পূরণ করো।') + '</div>'; return; }
    if (!Number.isInteger(n) || n < 0 || n > 10) { result.innerHTML = '<div class="msg error">' + bi('n must be a whole number between 0 and 10.', 'n অবশ্যই ০ থেকে ১০-এর মধ্যে পূর্ণসংখ্যা হতে হবে।') + '</div>'; return; }
    if (lc <= 0) { result.innerHTML = '<div class="msg error">' + bi('Least count must be positive.', 'লঘিষ্ঠ গণন ধনাত্মক হতে হবে।') + '</div>'; return; }
    task.submitted = true; submitBtn.disabled = true;
    const snap = sim.snapshot();
    const actual = task.size / 100;
    const yourObs = computeObserved(msr, n, lc), yourFinal = computeCorrect(yourObs, zeS);
    const diff = roundTo(yourFinal - actual, 6);
    const acc = percentAccuracy(yourFinal, actual);
    const exact = Math.abs(diff) <= 0.0051;
    const close = Math.abs(diff) <= 0.0201;
    const fb = [];
    if (snap.gapTenths !== task.size) fb.push(bi('The jaws were not touching the object (gap ' + fmt(snap.gapTenths / 10, 1) + ' mm vs object ' + fmt(task.size / 10, 1) + ' mm). Close/open them until they just touch.', 'চোয়াল বস্তুকে ছোঁয়নি (ফাঁক ' + fmt(snap.gapTenths / 10, 1) + ' মি.মি., বস্তু ' + fmt(task.size / 10, 1) + ' মি.মি.)। ঠিক ছোঁয়া পর্যন্ত বন্ধ/খোলো করো।'));
    if (Math.abs(msr - snap.msrCm) > 1e-6) fb.push(bi('MSR: the instrument shows ' + fmt(snap.msrCm, 1) + ' cm (you wrote ' + nice(msr) + '). Take the mark just LEFT of the vernier zero.', 'MSR: যন্ত্রে ' + fmt(snap.msrCm, 1) + ' সে.মি. (তুমি লিখেছ ' + nice(msr) + ')। ভার্নিয়ার শূন্যের ঠিক বামের দাগ নাও।'));
    if (n !== snap.coincidence) fb.push(bi('Coinciding line: it is ' + snap.coincidence + ' (you wrote ' + n + '). Look for the line that is perfectly straight with a main-scale line.', 'সমাপতিত দাগ: সঠিক মান ' + snap.coincidence + ' (তুমি লিখেছ ' + n + ')। যে দাগটি প্রধান স্কেলের দাগের সাথে একদম সোজা মেলে সেটি খোঁজো।'));
    if (Math.abs(lc - 0.01) > 1e-9) fb.push(bi('Least count of this instrument is 0.01 cm (1 MSD ÷ 10 = 1 mm ÷ 10 = 0.1 mm).', 'এই যন্ত্রের লঘিষ্ঠ গণন ০.০১ সে.মি. (১ MSD ÷ ১০ = ১ মি.মি. ÷ ১০ = ০.১ মি.মি.)।'));
    if (Math.abs(zeS - task.ze / 100) > 1e-9) fb.push(bi('Zero error: the true zero error is ' + fmtSigned(task.ze / 100, 2) + ' cm (you used ' + fmtSigned(zeS, 2) + '). Close the jaws and read the vernier zero position.', 'শূন্য ত্রুটি: সঠিক মান ' + fmtSigned(task.ze / 100, 2) + ' সে.মি. (তুমি নিয়েছ ' + fmtSigned(zeS, 2) + ')। চোয়াল বন্ধ করে ভার্নিয়ার শূন্যের অবস্থান দেখো।'));
    let verdictEn, verdictBn, cls;
    if (exact) { verdictEn = '🏆 Excellent! Your result matches the true value.'; verdictBn = '🏆 চমৎকার! তোমার ফলাফল আসল মানের সাথে মিলেছে।'; cls = 'msg ok'; }
    else if (close) { verdictEn = '👍 Very close — within 0.02 cm. Re-check one reading step.'; verdictBn = '👍 খুব কাছাকাছি — ০.০২ সে.মি.-এর মধ্যে। একটি ধাপ আবার যাচাই করো।'; cls = 'msg ok'; }
    else { verdictEn = '🔁 Not quite. Study the feedback below and try again.'; verdictBn = '🔁 ঠিক হয়নি। নিচের ফিডব্যাক দেখে আবার চেষ্টা করো।'; cls = 'msg error'; }
    let h = '<div class="' + cls + '">' + bi(verdictEn, verdictBn) + '</div>';
    h += '<div class="readout-grid">' +
      '<div class="readout"><small>' + bi('Actual measurement', 'আসল মাপ') + '</small><strong>' + fmt(actual, 2) + ' cm</strong></div>' +
      '<div class="readout vc"><small>' + bi("Student's calculated", 'তোমার হিসাব') + '</small><strong>' + fmt(yourFinal, 2) + ' cm</strong></div>' +
      '<div class="readout"><small>' + bi('Difference', 'পার্থক্য') + '</small><strong>' + fmtSigned(diff, 2) + ' cm</strong></div>' +
      '<div class="readout final"><small>' + bi('Accuracy', 'নির্ভুলতা') + '</small><strong>' + fmt(acc, 1) + ' %</strong></div></div>';
    h += stepCard(1, bi('Your working', 'তোমার হিসাব'), 'Observed = ' + nice(msr) + ' + (' + n + ' × ' + nice(lc) + ') = ' + fmt(yourObs, 2) + ' cm;  Correct = ' + fmt(yourObs, 2) + ' − (' + fmtSigned(zeS, 2) + ') = ' + fmt(yourFinal, 2) + ' cm', '', '', 0);
    h += stepCard(2, bi('Instrument truth', 'যন্ত্রের আসল পাঠ'), 'MSR = ' + fmt(snap.msrCm, 1) + ', n = ' + snap.coincidence + ', observed = ' + fmt(snap.observedCm, 2) + ' cm, ZE = ' + fmtSigned(task.ze / 100, 2) + ' cm → correct = ' + fmt(actual, 2) + ' cm', '', 'final', 120);
    if (fb.length) h += '<div class="note"><b>' + bi('Feedback', 'ফিডব্যাক') + '</b><ul>' + fb.map(x => '<li>' + x + '</li>').join('') + '</ul></div>';
    else h += '<div class="note">' + bi('All steps correct — well done!', 'সব ধাপ সঠিক — চমৎকার!') + '</div>';
    h += '<p class="hint">' + bi('Press “Random challenge” for the next object.', 'পরের বস্তুর জন্য “এলোমেলো চ্যালেঞ্জ” চাপো।') + '</p>';
    result.innerHTML = h;
    appState.practice.push({ t: Date.now(), obj: task.obj, measure: task.measure, accuracy: acc, exact: exact, hint: hintUsed, zeroError: task.ze !== 0 });
    if (appState.practice.length > 300) appState.practice.splice(0, appState.practice.length - 300);
    saveState();
    if (appState.practice.length >= 3) markDone('m5');
    renderStats(); refreshProgressPage();
  }
  function renderStats() {
    const p = appState.practice, n = p.length;
    const avg = n ? p.reduce((s, x) => s + x.accuracy, 0) / n : 0;
    const ex = n ? p.filter(x => x.exact).length : 0;
    const nh = n ? p.filter(x => !x.hint).length : 0;
    $('#pr-stats').innerHTML =
      '<div class="stat"><small>' + bi('Attempts', 'চেষ্টা') + '</small><strong>' + n + '</strong></div>' +
      '<div class="stat green"><small>' + bi('Average accuracy', 'গড় নির্ভুলতা') + '</small><strong>' + fmt(avg, 1) + '%</strong></div>' +
      '<div class="stat amber"><small>' + bi('Exact matches', 'সঠিক মিল') + '</small><strong>' + ex + '</strong></div>' +
      '<div class="stat violet"><small>' + bi('Without hints', 'সাহায্য ছাড়া') + '</small><strong>' + nh + '</strong></div>';
  }
  objSel.addEventListener('change', () => { fillMeasures(); startTask(objSel.value, meaSel.value); });
  meaSel.addEventListener('change', () => startTask(objSel.value, meaSel.value));
  zeToggle.addEventListener('change', () => startTask(objSel.value, meaSel.value));
  $('#pr-new').addEventListener('click', randomChallenge);
  submitBtn.addEventListener('click', submit);
  $('#pr-zerocheck').addEventListener('click', () => {
    if (!task) return;
    zeroBox.hidden = !zeroBox.hidden;
    if (!zeroBox.hidden) drawZeroLens();
  });
  hintBox.addEventListener('change', () => {
    if (hintBox.checked) { hintUsed = true; toast(lt('Hint used — it is recorded in your stats.', 'সাহায্য নেওয়া হয়েছে — পরিসংখ্যানে লেখা থাকবে।')); }
    sim.showHelp = hintBox.checked;
    sim.setPanelVisible(hintBox.checked);
    sim.update();
  });
  langListeners.push(() => { renderTask(); if (!zeroBox.hidden && task) drawZeroLens(); renderStats(); });
  fillMeasures();
  renderStats();
  randomChallenge();
  moduleEnterHooks.m5 = () => { sim.update(); renderStats(); };
}

/* ---------------- Module 10: progress ---------------- */
const MODULE_NAMES = {
  m1: ['Introduction', 'পরিচিতি'], m2: ['Simulator', 'সিমুলেটর'], m3: ['Least Count', 'লঘিষ্ঠ গণন'], m4: ['Zero Error', 'শূন্য ত্রুটি'],
  m5: ['Measurement Practice', 'পরিমাপ অনুশীলন'], m6: ['SSC Preparation', 'এসএসসি প্রস্তুতি'], m7: ['Solver', 'সমাধানকারী'],
  m8: ['Teacher Mode', 'শিক্ষক মোড'], m9: ['Cheat Sheet', 'সূত্র তালিকা'], m10: ['Progress', 'অগ্রগতি']
};
function barItem(label, pct, cls) {
  const p = clamp(pct, 0, 100);
  return '<div class="bar-item"><span>' + label + '</span><div class="bar ' + (cls || '') + '"><i style="width:' + p + '%"></i></div><b>' + fmt(p, 0) + '%</b></div>';
}
function refreshProgressPage() {
  if (!$('#pg-summary')) return;
  const done = MODULE_IDS.filter(id => appState.completed[id]).length;
  const q = appState.quizzes, p = appState.practice, t = appState.totals;
  const bestQ = q.length ? Math.max.apply(null, q.map(x => x.pct)) : 0;
  const avgQ = q.length ? q.reduce((s, x) => s + x.pct, 0) / q.length : 0;
  const avgP = p.length ? p.reduce((s, x) => s + x.accuracy, 0) / p.length : 0;
  $('#pg-summary').innerHTML =
    '<div class="stat"><small>' + bi('Modules completed', 'সম্পন্ন মডিউল') + '</small><strong>' + done + ' / ' + MODULE_IDS.length + '</strong></div>' +
    '<div class="stat amber"><small>' + bi('Quizzes taken', 'কুইজ দিয়েছ') + '</small><strong>' + q.length + '</strong></div>' +
    '<div class="stat green"><small>' + bi('Best quiz score', 'সেরা কুইজ স্কোর') + '</small><strong>' + fmt(bestQ, 0) + '%</strong></div>' +
    '<div class="stat violet"><small>' + bi('Practice accuracy', 'অনুশীলনের নির্ভুলতা') + '</small><strong>' + fmt(avgP, 1) + '%</strong></div>';
  $('#pg-modules').innerHTML = '<div class="progress-bar"><i style="width:' + (done / MODULE_IDS.length * 100) + '%"></i></div>' +
    MODULE_IDS.map(id => '<div class="mod-row"><span>' + id.replace('m', '') + '. ' + bi(MODULE_NAMES[id][0], MODULE_NAMES[id][1]) + '</span><span class="badge ' + (appState.completed[id] ? 'ok' : 'no') + '">' + (appState.completed[id] ? '✔ done' : 'pending') + '</span></div>').join('');
  const last = q.slice(-10);
  $('#pg-quiz').innerHTML = last.length ? '<div class="bar-list">' + last.map(x => barItem(new Date(x.date).toLocaleDateString() + ' (' + x.score + '/' + x.total + ')', x.pct, x.pct >= 60 ? 'green' : 'rose')).join('') + '</div><p class="hint">' + bi('Average: ', 'গড়: ') + fmt(avgQ, 1) + '%</p>' : '<p class="hint">' + bi('No quiz attempts yet. Try Module 6!', 'এখনো কুইজ দেওয়া হয়নি। মডিউল ৬ চেষ্টা করো!') + '</p>';
  const tot = t.correct + t.incorrect;
  $('#pg-ci').innerHTML = '<div class="bar-list">' + barItem(bi('Correct', 'সঠিক') + ' (' + t.correct + ')', tot ? t.correct / tot * 100 : 0, 'green') + barItem(bi('Incorrect', 'ভুল') + ' (' + t.incorrect + ')', tot ? t.incorrect / tot * 100 : 0, 'rose') + '</div><p class="hint">' + bi('Total answered: ', 'মোট উত্তর: ') + tot + '</p>';
  if (!p.length) { $('#pg-practice').innerHTML = '<p class="hint">' + bi('No practice yet. Try Module 5!', 'এখনো অনুশীলন করা হয়নি। মডিউল ৫ চেষ্টা করো!') + '</p>'; return; }
  const byObj = {};
  p.forEach(x => { (byObj[x.obj] = byObj[x.obj] || []).push(x.accuracy); });
  const exactPct = p.filter(x => x.exact).length / p.length * 100;
  $('#pg-practice').innerHTML = '<div class="bar-list">' + barItem(bi('Overall accuracy', 'সার্বিক নির্ভুলতা'), avgP) + barItem(bi('Exact matches', 'সঠিক মিল'), exactPct, 'green') +
    Object.keys(byObj).map(k => barItem(PRACTICE_OBJECTS[k] ? PRACTICE_OBJECTS[k].icon + ' ' + PRACTICE_OBJECTS[k].en : k, byObj[k].reduce((a, b) => a + b, 0) / byObj[k].length)).join('') + '</div>';
}
function initModule10() {
  $('#pg-reset').addEventListener('click', () => {
    if (!confirm(lt('Reset ALL progress on this device?', 'এই ডিভাইসের সব অগ্রগতি মুছে ফেলবে?'))) return;
    const keepLang = appState.lang;
    appState = defaultState(); appState.lang = keepLang;
    saveState(); refreshChrome(); refreshProgressPage();
    toast(lt('Progress reset', 'অগ্রগতি মুছে ফেলা হয়েছে'));
  });
  moduleEnterHooks.m10 = () => { markDone('m10'); refreshProgressPage(); };
  langListeners.push(refreshProgressPage);
  refreshProgressPage();
}

/* ---------------- Module 6: question bank + quiz ---------------- */
const TOPICS = {
  parts: ['Parts', 'অংশসমূহ'], reading: ['MSR / VSR reading', 'MSR / VSR পাঠ'], lc: ['Least count', 'লঘিষ্ঠ গণন'],
  zero: ['Zero error / correction', 'শূন্য ত্রুটি / সংশোধন'], final: ['Final measurement', 'চূড়ান্ত পরিমাপ'],
  accuracy: ['Accuracy', 'নির্ভুলতা'], practical: ['Practical', 'ব্যবহারিক']
};
const TYPE_NAMES = { mcq: ['MCQ', 'বহুনির্বাচনি'], numerical: ['Numerical', 'গাণিতিক'], conceptual: ['Conceptual', 'ধারণাভিত্তিক'], short: ['Short question', 'সংক্ষিপ্ত প্রশ্ন'], board: ['Board-style', 'বোর্ড প্রশ্ন'], practical: ['Practical-based', 'ব্যবহারিকভিত্তিক'] };
const QB = [];
function mcq(type, topic, qEn, qBn, opts, ans, expEn, expBn) { QB.push({ id: QB.length + 1, type, topic, qEn, qBn, opts, ans, expEn, expBn }); }
function written(type, topic, qEn, qBn, aEn, aBn) { QB.push({ id: QB.length + 1, type, topic, qEn, qBn, aEn, aBn }); }

/* --- MCQ --- */
mcq('mcq', 'parts', 'Which part of the Vernier Calipers is used to measure the internal diameter of a hollow pipe?', 'ফাঁপা পাইপের ভিতরের ব্যাস মাপতে ভার্নিয়ার ক্যালিপার্সের কোন অংশ ব্যবহার করা হয়?',
  ['Outside (lower) jaws', 'Inside (upper) jaws', 'Depth rod', 'Locking screw'], 1,
  'The small upper jaws are put inside the pipe and opened until they touch the inner wall.', 'ছোট উপরের চোয়াল পাইপের ভিতরে ঢুকিয়ে ভিতরের দেয়াল ছোঁয়া পর্যন্ত খোলা হয়।');
mcq('mcq', 'parts', 'The depth rod of a Vernier Calipers is used to measure:', 'ভার্নিয়ার ক্যালিপার্সের গভীরতা দণ্ড দিয়ে কী মাপা হয়?',
  ['Diameter of a wire', 'Depth of a hole or container', 'Mass of an object', 'Temperature'], 1,
  'The rod slides out of the beam end; its protruding length equals the depth.', 'দণ্ডটি বাহুর প্রান্ত দিয়ে বেরিয়ে আসে; বেরোনো অংশের দৈর্ঘ্যই গভীরতা।');
mcq('mcq', 'parts', 'What is the function of the locking screw?', 'লকিং স্ক্রুর কাজ কী?',
  ['It moves the main scale', 'It fixes the movable jaw so the reading does not change', 'It measures depth', 'It adjusts the zero error automatically'], 1,
  'Tightening the screw holds the slider in place so you can read the scale safely.', 'স্ক্রু টাইট দিলে স্লাইডার আটকে থাকে, ফলে নিরাপদে পাঠ নেওয়া যায়।');
mcq('mcq', 'lc', 'The least count of an instrument is:', 'কোনো যন্ত্রের লঘিষ্ঠ গণন হলো:',
  ['The smallest length it can measure accurately', 'The largest length it can measure', 'The total length of its main scale', 'The number of vernier divisions'], 0,
  'Least count is the smallest value that can be read accurately with the instrument.', 'যন্ত্র দিয়ে নির্ভুলভাবে পড়া যায় এমন ক্ষুদ্রতম মানই লঘিষ্ঠ গণন।');
mcq('mcq', 'lc', 'In a Vernier Calipers 10 VSD = 9 MSD and 1 MSD = 1 mm. Its least count is:', 'একটি ভার্নিয়ার ক্যালিপার্সে ১০ VSD = ৯ MSD এবং ১ MSD = ১ মি.মি.। এর লঘিষ্ঠ গণন:',
  ['0.1 mm', '0.9 mm', '1 mm', '0.01 mm'], 0,
  '1 VSD = 0.9 mm, so LC = 1 MSD − 1 VSD = 1 − 0.9 = 0.1 mm = 0.01 cm.', '১ VSD = ০.৯ মি.মি., তাই LC = ১ MSD − ১ VSD = ১ − ০.৯ = ০.১ মি.মি. = ০.০১ সে.মি.।');
mcq('mcq', 'reading', 'The main scale reading (MSR) is the main-scale division:', 'প্রধান স্কেল পাঠ (MSR) হলো প্রধান স্কেলের সেই দাগ যা:',
  ['just to the left of the vernier zero', 'just to the right of the vernier zero', 'that coincides with a vernier line', 'at the end of the main scale'], 0,
  'We always take the last main-scale mark that the vernier zero has passed — the one on its left.', 'ভার্নিয়ার শূন্য যে দাগটি পার হয়ে এসেছে — অর্থাৎ ঠিক বামের দাগটি — সেটিই MSR।');
mcq('mcq', 'reading', 'The vernier scale reading (VSR) is calculated as:', 'ভার্নিয়ার স্কেল পাঠ (VSR) নির্ণয়ের সূত্র:',
  ['n × LC', 'n + LC', 'n ÷ LC', 'LC − n'], 0,
  'n is the coinciding vernier division, each worth one least count.', 'n হলো সমাপতিত ভার্নিয়ার ভাগ, প্রতিটি ভাগের মান একটি লঘিষ্ঠ গণন।');
mcq('mcq', 'zero', 'With the jaws closed, the vernier zero lies to the right of the main-scale zero. The instrument has:', 'চোয়াল বন্ধ অবস্থায় ভার্নিয়ারের শূন্য প্রধান স্কেলের শূন্যের ডানে থাকলে যন্ত্রে আছে:',
  ['positive zero error', 'negative zero error', 'no zero error', 'parallax error'], 0,
  'The instrument reads more than zero when closed — a positive zero error.', 'বন্ধ অবস্থায় যন্ত্র শূন্যের চেয়ে বেশি দেখায় — এটি ধনাত্মক শূন্য ত্রুটি।');
mcq('mcq', 'zero', 'Zero correction is:', 'শূন্য সংশোধন হলো:',
  ['equal to the zero error', 'equal in magnitude but opposite in sign to the zero error', 'always positive', 'always zero'], 1,
  'ZC = −ZE. It is the amount to add to the reading to correct it.', 'ZC = −ZE। পাঠ ঠিক করতে এই মান যোগ করতে হয়।');
mcq('mcq', 'final', 'The correct reading is obtained from the observed reading by:', 'পর্যবেক্ষিত পাঠ থেকে সঠিক পাঠ পাওয়া যায়:',
  ['adding the zero error', 'subtracting the zero error', 'multiplying by the zero error', 'dividing by the zero error'], 1,
  'Correct reading = Observed reading − Zero error.', 'সঠিক পাঠ = পর্যবেক্ষিত পাঠ − শূন্য ত্রুটি।');
mcq('mcq', 'accuracy', 'A Vernier Calipers is more accurate than a metre rule because:', 'মিটার স্কেলের চেয়ে ভার্নিয়ার ক্যালিপার্স বেশি নির্ভুল কারণ:',
  ['its least count (0.01 cm) is smaller than that of a rule (0.1 cm)', 'it is made of steel', 'it is longer', 'it has more numbers printed'], 0,
  'A smaller least count means smaller lengths can be read exactly.', 'লঘিষ্ঠ গণন ছোট হলে আরও ক্ষুদ্র দৈর্ঘ্য নির্ভুলভাবে পড়া যায়।');
mcq('mcq', 'parts', 'The scale engraved on the fixed beam of the instrument is the:', 'যন্ত্রের স্থির বাহুতে খোদাই করা স্কেলটি হলো:',
  ['main scale', 'vernier scale', 'depth scale', 'zero scale'], 0,
  'The main scale is fixed on the beam; the vernier scale slides.', 'প্রধান স্কেল বাহুতে স্থির; ভার্নিয়ার স্কেল সরে।');
mcq('mcq', 'parts', 'The scale that slides together with the movable jaw is the:', 'চলমান চোয়ালের সাথে যে স্কেলটি সরে সেটি হলো:',
  ['main scale', 'depth scale', 'vernier scale', 'fixed jaw'], 2,
  'The vernier scale is attached to the movable jaw.', 'ভার্নিয়ার স্কেল চলমান চোয়ালের সাথে যুক্ত।');
mcq('mcq', 'lc', 'Another name for the least count of a Vernier Calipers is the:', 'ভার্নিয়ার ক্যালিপার্সের লঘিষ্ঠ গণনের আরেক নাম:',
  ['zero error', 'vernier constant', 'main scale reading', 'zero correction'], 1,
  'Least count is also called the vernier constant.', 'লঘিষ্ঠ গণনকে ভার্নিয়ার ধ্রুবকও বলা হয়।');

/* --- Numerical (options) --- */
mcq('numerical', 'final', 'MSR = 2.4 cm and the 7th vernier line coincides. If LC = 0.01 cm, the reading is:', 'MSR = ২.৪ সে.মি. এবং ৭ম ভার্নিয়ার দাগ মিলেছে। LC = ০.০১ সে.মি. হলে পাঠ:',
  ['2.74 cm', '2.47 cm', '2.40 cm', '2.71 cm'], 1,
  'Reading = 2.4 + 7 × 0.01 = 2.4 + 0.07 = 2.47 cm.', 'পাঠ = ২.৪ + ৭ × ০.০১ = ২.৪ + ০.০৭ = ২.৪৭ সে.মি.।');
mcq('numerical', 'final', 'MSR = 3.1 cm, coinciding division = 4, LC = 0.01 cm, zero error = +0.02 cm. The correct reading is:', 'MSR = ৩.১ সে.মি., সমাপতিত ভাগ = ৪, LC = ০.০১ সে.মি., শূন্য ত্রুটি = +০.০২ সে.মি.। সঠিক পাঠ:',
  ['3.16 cm', '3.14 cm', '3.12 cm', '3.10 cm'], 2,
  'Observed = 3.1 + 4 × 0.01 = 3.14 cm. Correct = 3.14 − 0.02 = 3.12 cm.', 'পর্যবেক্ষিত = ৩.১ + ৪ × ০.০১ = ৩.১৪ সে.মি.। সঠিক = ৩.১৪ − ০.০২ = ৩.১২ সে.মি.।');
mcq('numerical', 'final', 'MSR = 1.6 cm, coinciding division = 9, LC = 0.01 cm, zero error = −0.03 cm. The correct reading is:', 'MSR = ১.৬ সে.মি., সমাপতিত ভাগ = ৯, LC = ০.০১ সে.মি., শূন্য ত্রুটি = −০.০৩ সে.মি.। সঠিক পাঠ:',
  ['1.66 cm', '1.69 cm', '1.78 cm', '1.72 cm'], 3,
  'Observed = 1.6 + 0.09 = 1.69 cm. Correct = 1.69 − (−0.03) = 1.72 cm.', 'পর্যবেক্ষিত = ১.৬ + ০.০৯ = ১.৬৯ সে.মি.। সঠিক = ১.৬৯ − (−০.০৩) = ১.৭২ সে.মি.।');
mcq('numerical', 'zero', 'With jaws closed the vernier zero is to the LEFT of the main zero and the 7th vernier line coincides (N = 10, LC = 0.01 cm). The zero error is:', 'চোয়াল বন্ধ, ভার্নিয়ার শূন্য প্রধান শূন্যের বামে এবং ৭ম দাগ মিলেছে (N = ১০, LC = ০.০১ সে.মি.)। শূন্য ত্রুটি:',
  ['+0.07 cm', '−0.07 cm', '+0.03 cm', '−0.03 cm'], 3,
  'Negative error: ZE = −(N − n) × LC = −(10 − 7) × 0.01 = −0.03 cm.', 'ঋণাত্মক ত্রুটি: ZE = −(N − n) × LC = −(১০ − ৭) × ০.০১ = −০.০৩ সে.মি.।');
mcq('numerical', 'zero', 'A Vernier Calipers has a positive zero error with the 4th line coinciding (LC = 0.01 cm). Its zero correction is:', 'একটি ভার্নিয়ার ক্যালিপার্সে ধনাত্মক শূন্য ত্রুটি আছে এবং ৪র্থ দাগ মিলেছে (LC = ০.০১ সে.মি.)। শূন্য সংশোধন:',
  ['+0.04 cm', '−0.04 cm', '+0.06 cm', '−0.06 cm'], 1,
  'ZE = +4 × 0.01 = +0.04 cm, so ZC = −ZE = −0.04 cm.', 'ZE = +৪ × ০.০১ = +০.০৪ সে.মি., তাই ZC = −ZE = −০.০৪ সে.মি.।');
mcq('numerical', 'lc', 'In a Vernier Calipers 1 MSD = 0.5 mm and 25 VSD = 24 MSD. The least count is:', 'একটি ভার্নিয়ার ক্যালিপার্সে ১ MSD = ০.৫ মি.মি. এবং ২৫ VSD = ২৪ MSD। লঘিষ্ঠ গণন:',
  ['0.5 mm', '0.2 mm', '0.02 mm', '0.05 mm'], 2,
  'LC = 1 MSD ÷ N = 0.5 mm ÷ 25 = 0.02 mm.', 'LC = ১ MSD ÷ N = ০.৫ মি.মি. ÷ ২৫ = ০.০২ মি.মি.।');
mcq('numerical', 'final', 'The observed reading is 4.58 cm and the zero error is −0.02 cm. The correct reading is:', 'পর্যবেক্ষিত পাঠ ৪.৫৮ সে.মি. এবং শূন্য ত্রুটি −০.০২ সে.মি.। সঠিক পাঠ:',
  ['4.56 cm', '4.60 cm', '4.58 cm', '4.62 cm'], 1,
  'Correct = 4.58 − (−0.02) = 4.60 cm.', 'সঠিক = ৪.৫৮ − (−০.০২) = ৪.৬০ সে.মি.।');
mcq('numerical', 'final', 'The diameter of a sphere measured with a Vernier Calipers (no zero error): MSR = 1.8 cm, 5th line coincides, LC = 0.01 cm. Its radius is:', 'ভার্নিয়ার ক্যালিপার্স দিয়ে একটি গোলকের ব্যাস মাপা হলো (শূন্য ত্রুটি নেই): MSR = ১.৮ সে.মি., ৫ম দাগ মিলেছে, LC = ০.০১ সে.মি.। ব্যাসার্ধ:',
  ['1.85 cm', '0.85 cm', '0.925 cm', '3.70 cm'], 2,
  'Diameter = 1.8 + 0.05 = 1.85 cm, so radius = 1.85 ÷ 2 = 0.925 cm.', 'ব্যাস = ১.৮ + ০.০৫ = ১.৮৫ সে.মি., তাই ব্যাসার্ধ = ১.৮৫ ÷ ২ = ০.৯২৫ সে.মি.।');

/* --- Conceptual (options) --- */
mcq('conceptual', 'accuracy', 'Why do we take several readings and then find their mean?', 'কেন কয়েকটি পাঠ নিয়ে তাদের গড় করা হয়?',
  ['To reduce the effect of random errors', 'To increase the least count', 'To remove zero error completely', 'To make the instrument heavier'], 0,
  'Random errors push readings up or down; averaging cancels much of that scatter.', 'এলোমেলো ত্রুটি পাঠকে কখনো বাড়ায় কখনো কমায়; গড় করলে অনেকটাই কেটে যায়।');
mcq('conceptual', 'lc', 'Which instrument can measure more precisely?', 'কোন যন্ত্র আরও সূক্ষ্মভাবে মাপতে পারে?',
  ['Vernier Calipers, LC 0.01 cm', 'Vernier Calipers, LC 0.005 cm', 'Ruler, LC 0.1 cm', 'All are the same'], 1,
  'The smaller the least count, the more precise the instrument.', 'লঘিষ্ঠ গণন যত ছোট, যন্ত্র তত সূক্ষ্ম।');
mcq('conceptual', 'zero', 'A student ignores a positive zero error of 0.03 cm. All his readings will be:', 'একজন শিক্ষার্থী ০.০৩ সে.মি. ধনাত্মক শূন্য ত্রুটি উপেক্ষা করল। তার সব পাঠ হবে:',
  ['0.03 cm too large', '0.03 cm too small', 'exactly correct', 'randomly wrong'], 0,
  'A zero error is a systematic error: every reading is shifted by the same amount (here upwards).', 'শূন্য ত্রুটি একটি নিয়মিত ত্রুটি: প্রতিটি পাঠ একই পরিমাণ সরে যায় (এখানে বেশি আসে)।');
mcq('conceptual', 'parts', 'Which of the following can NOT be measured with a Vernier Calipers?', 'নিচের কোনটি ভার্নিয়ার ক্যালিপার্স দিয়ে মাপা যায় না?',
  ['Depth of a cup', 'Thickness of a coin', 'Mass of a coin', 'Inner diameter of a ring'], 2,
  'It measures length-type quantities only: diameter, thickness, depth.', 'এটি শুধু দৈর্ঘ্যজাতীয় রাশি মাপে: ব্যাস, পুরুত্ব, গভীরতা।');

/* --- Practical (options) --- */
mcq('practical', 'practical', 'What should you do before taking any measurement?', 'কোনো পরিমাপ নেওয়ার আগে কী করা উচিত?',
  ['Close the jaws and check the zero error', 'Tighten the locking screw', 'Measure the object immediately', 'Cool the instrument'], 0,
  'Always find the zero error first so you can correct every reading.', 'আগে শূন্য ত্রুটি বের করে নাও, যাতে প্রতিটি পাঠ সংশোধন করা যায়।');
mcq('practical', 'practical', 'To measure the inner diameter of the mouth of a test tube you use:', 'পরীক্ষানলের মুখের ভিতরের ব্যাস মাপতে ব্যবহার করবে:',
  ['the inside jaws', 'the outside jaws', 'the depth rod', 'only the main scale'], 0,
  'Inside (upper) jaws are designed for internal diameters.', 'ভিতরের ব্যাসের জন্য ভিতরের (উপরের) চোয়াল তৈরি।');
mcq('practical', 'practical', 'How is the depth of a beaker measured?', 'বিকারের গভীরতা কীভাবে মাপা হয়?',
  ['Beam end on the rim, depth rod pushed down to touch the bottom', 'Rod on the rim, beam pushed to the bottom', 'Jaws on the rim, rod pointing up', 'Any way — depth does not matter'], 0,
  'The reading equals the length of rod that slid out of the beam end.', 'বাহুর প্রান্ত থেকে বেরোনো দণ্ডের দৈর্ঘ্যই পাঠ।');
mcq('practical', 'practical', 'Why is the diameter of a cylinder measured at several places and in different directions?', 'বেলনের ব্যাস কেন বিভিন্ন জায়গায় ও বিভিন্ন দিকে মাপা হয়?',
  ['The cylinder may not be perfectly uniform or circular', 'To change the least count', 'To avoid zero error', 'To tighten the screw'], 0,
  'Real objects vary slightly; the mean diameter is more reliable.', 'বাস্তব বস্তু সামান্য অসমান হতে পারে; গড় ব্যাস বেশি নির্ভরযোগ্য।');

/* --- Written questions (model answers) --- */
written('short', 'lc', 'Define least count.', 'লঘিষ্ঠ গণনের সংজ্ঞা দাও।',
  'The least count is the smallest length that can be measured accurately with an instrument. For a Vernier Calipers, LC = 1 MSD − 1 VSD = (value of 1 MSD) ÷ (number of vernier divisions).',
  'কোনো যন্ত্র দিয়ে নির্ভুলভাবে যে ক্ষুদ্রতম দৈর্ঘ্য মাপা যায় তাকে লঘিষ্ঠ গণন বলে। ভার্নিয়ার ক্যালিপার্সে LC = ১ MSD − ১ VSD = (১ MSD-এর মান) ÷ (ভার্নিয়ার ভাগ সংখ্যা)।');
written('short', 'zero', 'What is zero error?', 'শূন্য ত্রুটি কী?',
  'When the jaws are fully closed, a perfect instrument reads zero. If it shows some other reading instead, that reading is the zero error. It is positive if the vernier zero is to the right of the main zero and negative if it is to the left.',
  'চোয়াল সম্পূর্ণ বন্ধ করলে নিখুঁত যন্ত্রে পাঠ শূন্য হওয়ার কথা। তা না হয়ে অন্য পাঠ এলে সেই পাঠই শূন্য ত্রুটি। ভার্নিয়ার শূন্য প্রধান শূন্যের ডানে থাকলে ধনাত্মক, বামে থাকলে ঋণাত্মক।');
written('short', 'zero', 'Distinguish between zero error and zero correction.', 'শূন্য ত্রুটি ও শূন্য সংশোধনের পার্থক্য লেখো।',
  'Zero error is the wrong reading shown by the instrument when the jaws are closed. Zero correction is the amount added to a reading to correct it; it has the same magnitude but the opposite sign: ZC = −ZE.',
  'চোয়াল বন্ধ অবস্থায় যন্ত্র যে ভুল পাঠ দেখায় তা শূন্য ত্রুটি। পাঠ ঠিক করতে যে মান যোগ করা হয় তা শূন্য সংশোধন; এর মান একই কিন্তু চিহ্ন বিপরীত: ZC = −ZE।');
written('short', 'parts', 'Name four parts of a Vernier Calipers and state one use of each.', 'ভার্নিয়ার ক্যালিপার্সের চারটি অংশের নাম ও একটি করে কাজ লেখো।',
  '1) Main scale – gives the whole-millimetre reading. 2) Vernier scale – gives the fraction of a millimetre. 3) Outside jaws – measure external diameter or thickness. 4) Depth rod – measures the depth of a hole. (Also: inside jaws, locking screw.)',
  '১) প্রধান স্কেল – পূর্ণ মিলিমিটার পাঠ দেয়। ২) ভার্নিয়ার স্কেল – মিলিমিটারের ভগ্নাংশ দেয়। ৩) বাইরের চোয়াল – বাইরের ব্যাস বা পুরুত্ব মাপে। ৪) গভীরতা দণ্ড – গর্তের গভীরতা মাপে। (এছাড়া: ভিতরের চোয়াল, লকিং স্ক্রু।)');
written('short', 'accuracy', 'Why is a Vernier Calipers more accurate than an ordinary ruler?', 'সাধারণ স্কেলের চেয়ে ভার্নিয়ার ক্যালিপার্স বেশি নির্ভুল কেন?',
  'Its least count is 0.01 cm, ten times smaller than the 0.1 cm of a ruler, so it can read the fraction between two marks without guessing.',
  'এর লঘিষ্ঠ গণন ০.০১ সে.মি., যা স্কেলের ০.১ সে.মি.-এর দশ ভাগের এক ভাগ। তাই দুই দাগের মাঝের ভগ্নাংশ অনুমান ছাড়াই পড়া যায়।');
written('short', 'lc', 'If 10 VSD = 9 MSD and 1 MSD = 1 mm, what is the length of 1 VSD?', '১০ VSD = ৯ MSD এবং ১ MSD = ১ মি.মি. হলে ১ VSD-এর দৈর্ঘ্য কত?',
  '1 VSD = 9/10 MSD = 0.9 × 1 mm = 0.9 mm (= 0.09 cm).', '১ VSD = ৯/১০ MSD = ০.৯ × ১ মি.মি. = ০.৯ মি.মি. (= ০.০৯ সে.মি.)।');
written('board', 'final', 'A Vernier Calipers has 10 vernier divisions equal to 9 main-scale divisions (1 MSD = 1 mm). While measuring the diameter of a cylinder, the MSR is 2.4 cm, the 6th vernier line coincides and the zero error is +0.02 cm. (a) Find the least count. (b) Find the correct diameter. (c) If the length of the cylinder is 5.00 cm, find its volume.',
  'একটি ভার্নিয়ার ক্যালিপার্সের ১০টি ভার্নিয়ার ভাগ ৯টি প্রধান স্কেল ভাগের সমান (১ MSD = ১ মি.মি.)। একটি বেলনের ব্যাস মাপার সময় MSR = ২.৪ সে.মি., ৬ষ্ঠ ভার্নিয়ার দাগ মিলল এবং শূন্য ত্রুটি +০.০২ সে.মি.। (ক) লঘিষ্ঠ গণন নির্ণয় করো। (খ) সঠিক ব্যাস কত? (গ) বেলনের দৈর্ঘ্য ৫.০০ সে.মি. হলে আয়তন কত?',
  '(a) 1 VSD = 0.9 mm, so LC = 1 − 0.9 = 0.1 mm = 0.01 cm.<br>(b) Observed = 2.4 + 6 × 0.01 = 2.46 cm. Correct = 2.46 − (+0.02) = <b>2.44 cm</b>.<br>(c) r = 2.44 ÷ 2 = 1.22 cm; V = πr²h = 3.1416 × (1.22)² × 5.00 ≈ <b>23.38 cm³</b>.',
  '(ক) ১ VSD = ০.৯ মি.মি., তাই LC = ১ − ০.৯ = ০.১ মি.মি. = ০.০১ সে.মি.।<br>(খ) পর্যবেক্ষিত = ২.৪ + ৬ × ০.০১ = ২.৪৬ সে.মি.। সঠিক = ২.৪৬ − (+০.০২) = <b>২.৪৪ সে.মি.</b>।<br>(গ) r = ২.৪৪ ÷ ২ = ১.২২ সে.মি.; V = πr²h = ৩.১৪১৬ × (১.২২)² × ৫.০০ ≈ <b>২৩.৩৮ সে.মি.³</b>।');
written('board', 'lc', 'Describe the construction of a Vernier Calipers and explain how its least count is obtained.', 'ভার্নিয়ার ক্যালিপার্সের গঠন বর্ণনা করো এবং এর লঘিষ্ঠ গণন কীভাবে পাওয়া যায় ব্যাখ্যা করো।',
  'It has a fixed main scale (cm and mm) on a beam with a fixed jaw, and a sliding vernier scale attached to a movable jaw, with a depth rod and a locking screw. The vernier scale has 10 divisions that together equal 9 main-scale divisions, so 1 VSD = 0.9 MSD. LC = 1 MSD − 1 VSD = 0.1 MSD = 0.1 mm = 0.01 cm.',
  'এতে একটি বাহুর উপর স্থির প্রধান স্কেল (সে.মি. ও মি.মি.) ও স্থির চোয়াল, এবং চলমান চোয়ালসহ চলমান ভার্নিয়ার স্কেল, গভীরতা দণ্ড ও লকিং স্ক্রু আছে। ভার্নিয়ার স্কেলের ১০টি ভাগ প্রধান স্কেলের ৯টি ভাগের সমান, তাই ১ VSD = ০.৯ MSD। LC = ১ MSD − ১ VSD = ০.১ MSD = ০.১ মি.মি. = ০.০১ সে.মি.।');
written('board', 'zero', 'In a Vernier Calipers 20 VSD = 19 MSD and 1 MSD = 1 mm. With the jaws closed the vernier zero is to the left of the main zero and the 16th line coincides. The diameter of a wire is measured with MSR = 1.2 cm and the 8th line coinciding. Find the correct diameter.',
  'একটি ভার্নিয়ার ক্যালিপার্সে ২০ VSD = ১৯ MSD এবং ১ MSD = ১ মি.মি.। চোয়াল বন্ধ করলে ভার্নিয়ার শূন্য প্রধান শূন্যের বামে থাকে এবং ১৬তম দাগ মিলে। একটি তারের ব্যাস মাপায় MSR = ১.২ সে.মি. এবং ৮ম দাগ মিলল। সঠিক ব্যাস নির্ণয় করো।',
  'LC = 1 mm ÷ 20 = 0.05 mm = 0.005 cm.<br>ZE = −(N − n) × LC = −(20 − 16) × 0.005 = <b>−0.02 cm</b>.<br>Observed = 1.2 + 8 × 0.005 = 1.24 cm.<br>Correct = 1.24 − (−0.02) = <b>1.26 cm</b>.',
  'LC = ১ মি.মি. ÷ ২০ = ০.০৫ মি.মি. = ০.০০৫ সে.মি.।<br>ZE = −(N − n) × LC = −(২০ − ১৬) × ০.০০৫ = <b>−০.০২ সে.মি.</b>।<br>পর্যবেক্ষিত = ১.২ + ৮ × ০.০০৫ = ১.২৪ সে.মি.।<br>সঠিক = ১.২৪ − (−০.০২) = <b>১.২৬ সে.মি.</b>।');
written('board', 'accuracy', 'Four readings of the diameter of a wire are 2.44 cm, 2.46 cm, 2.45 cm and 2.45 cm. The zero error is −0.01 cm. Find the mean correct diameter and explain why several readings are taken.',
  'একটি তারের ব্যাসের চারটি পাঠ ২.৪৪ সে.মি., ২.৪৬ সে.মি., ২.৪৫ সে.মি. ও ২.৪৫ সে.মি.। শূন্য ত্রুটি −০.০১ সে.মি.। গড় সঠিক ব্যাস নির্ণয় করো এবং কয়েকটি পাঠ নেওয়ার কারণ লেখো।',
  'Mean observed = (2.44 + 2.46 + 2.45 + 2.45) ÷ 4 = 9.80 ÷ 4 = 2.45 cm.<br>Correct = 2.45 − (−0.01) = <b>2.46 cm</b>.<br>Several readings are taken to reduce random errors, because the wire may not be perfectly uniform and our reading may vary slightly.',
  'গড় পর্যবেক্ষিত = (২.৪৪ + ২.৪৬ + ২.৪৫ + ২.৪৫) ÷ ৪ = ৯.৮০ ÷ ৪ = ২.৪৫ সে.মি.।<br>সঠিক = ২.৪৫ − (−০.০১) = <b>২.৪৬ সে.মি.</b>।<br>এলোমেলো ত্রুটি কমানোর জন্য একাধিক পাঠ নেওয়া হয়, কারণ তার সমান নাও হতে পারে এবং পাঠে সামান্য তারতম্য ঘটতে পারে।');
written('practical', 'practical', 'Describe the steps to measure the internal diameter of a ring with a Vernier Calipers.', 'ভার্নিয়ার ক্যালিপার্স দিয়ে একটি আংটির ভিতরের ব্যাস মাপার ধাপগুলো বর্ণনা করো।',
  '1) Close the jaws and find the zero error. 2) Loosen the locking screw. 3) Put the inside (upper) jaws into the ring. 4) Open the jaws until they gently touch the inner wall at the widest point. 5) Tighten the screw. 6) Read MSR and the coinciding vernier line; Observed = MSR + n × LC. 7) Repeat at different positions, take the mean and subtract the zero error.',
  '১) চোয়াল বন্ধ করে শূন্য ত্রুটি বের করো। ২) লকিং স্ক্রু ঢিলা করো। ৩) ভিতরের (উপরের) চোয়াল আংটির ভিতরে ঢোকাও। ৪) সবচেয়ে চওড়া জায়গায় ভিতরের দেয়াল আলতো ছোঁয়া পর্যন্ত চোয়াল খোলো। ৫) স্ক্রু টাইট করো। ৬) MSR ও সমাপতিত দাগ পড়ো; পর্যবেক্ষিত = MSR + n × LC। ৭) ভিন্ন ভিন্ন জায়গায় পুনরাবৃত্তি করে গড় নাও এবং শূন্য ত্রুটি বিয়োগ করো।');
written('practical', 'practical', 'Describe how to measure the depth of a small container.', 'একটি ছোট পাত্রের গভীরতা মাপার পদ্ধতি লেখো।',
  '1) Check the zero error. 2) Rest the end of the beam on the rim of the container. 3) Push the depth rod slowly down until it touches the bottom. 4) Tighten the locking screw. 5) Read MSR and the coinciding line; the reading is the depth. 6) Repeat and take the mean, then correct for zero error.',
  '১) শূন্য ত্রুটি দেখে নাও। ২) বাহুর প্রান্ত পাত্রের কিনারায় রাখো। ৩) গভীরতা দণ্ড আস্তে আস্তে নামাও যতক্ষণ না তলায় ঠেকে। ৪) লকিং স্ক্রু টাইট করো। ৫) MSR ও সমাপতিত দাগ পড়ো; পাঠটিই গভীরতা। ৬) কয়েকবার করে গড় নাও এবং শূন্য ত্রুটি সংশোধন করো।');
written('practical', 'practical', 'With the jaws closed a student sees the vernier zero to the right of the main zero with the 3rd line coinciding. He then measures a pencil and gets 0.68 cm. Find the correct diameter.', 'চোয়াল বন্ধ করে একজন শিক্ষার্থী দেখল ভার্নিয়ার শূন্য প্রধান শূন্যের ডানে এবং ৩য় দাগ মিলেছে। পরে একটি পেন্সিল মেপে সে ০.৬৮ সে.মি. পেল। সঠিক ব্যাস কত?',
  'Positive error: ZE = +3 × 0.01 = +0.03 cm.<br>Correct = 0.68 − 0.03 = <b>0.65 cm</b>.',
  'ধনাত্মক ত্রুটি: ZE = +৩ × ০.০১ = +০.০৩ সে.মি.।<br>সঠিক = ০.৬৮ − ০.০৩ = <b>০.৬৫ সে.মি.</b>।');

/* ---- quiz engine ---- */
const LETTERS = ['A', 'B', 'C', 'D'];
const quiz = { list: [], idx: 0, answers: [], instant: true, submitted: false, active: false };

function optionPool(topic) { return QB.filter(q => q.opts && (topic === 'all' || q.topic === topic)); }
function renderQuizSetup() {
  const best = appState.quizzes.length ? Math.max.apply(null, appState.quizzes.map(x => x.pct)) : null;
  $('#quiz-setup').innerHTML = '<h3>' + bi('Start a quiz', 'কুইজ শুরু করো') + '</h3>' +
    '<p class="hint">' + bi('Auto-scored questions: MCQ, numerical, conceptual and practical (' + QB.filter(q => q.opts).length + ' available). Written questions are in the Question bank.', 'স্বয়ংক্রিয় মূল্যায়নের প্রশ্ন: বহুনির্বাচনি, গাণিতিক, ধারণাভিত্তিক ও ব্যবহারিক (' + QB.filter(q => q.opts).length + 'টি)। লিখিত প্রশ্ন প্রশ্নব্যাংকে আছে।') + '</p>' +
    '<div class="form-grid"><label>' + bi('Number of questions', 'প্রশ্ন সংখ্যা') + '<select id="qz-count"><option value="10">10</option><option value="20">20</option><option value="all">' + bi('All', 'সব') + '</option></select></label>' +
    '<label>' + bi('Topic', 'বিষয়') + '<select id="qz-topic"><option value="all">All / সব</option>' + Object.keys(TOPICS).map(k => '<option value="' + k + '">' + TOPICS[k][0] + ' / ' + TOPICS[k][1] + '</option>').join('') + '</select></label></div>' +
    '<div class="btn-row"><label class="check"><input type="checkbox" id="qz-instant" checked> ' + bi('Show feedback after each answer', 'প্রতিটি উত্তরের পর ফিডব্যাক দেখাও') + '</label>' +
    '<label class="check"><input type="checkbox" id="qz-shuffle" checked> ' + bi('Shuffle questions', 'প্রশ্ন এলোমেলো করো') + '</label>' +
    '<button class="btn primary" id="qz-start">▶ ' + bi('Start quiz', 'কুইজ শুরু') + '</button></div>' +
    (best !== null ? '<p class="hint">' + bi('Your best score so far: ', 'এ পর্যন্ত সেরা স্কোর: ') + fmt(best, 0) + '%</p>' : '');
  $('#qz-start').addEventListener('click', startQuiz);
}
function shuffle(arr) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = randInt(0, i); const t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
function startQuiz() {
  const topic = $('#qz-topic').value, countSel = $('#qz-count').value;
  let pool = optionPool(topic);
  if (!pool.length) { toast(lt('No questions for this topic.', 'এই বিষয়ে প্রশ্ন নেই।')); return; }
  if ($('#qz-shuffle').checked) pool = shuffle(pool);
  if (countSel !== 'all') pool = pool.slice(0, parseInt(countSel, 10));
  quiz.list = pool; quiz.idx = 0; quiz.answers = new Array(pool.length).fill(null);
  quiz.instant = $('#qz-instant').checked; quiz.submitted = false; quiz.active = true;
  $('#quiz-setup').hidden = true;
  renderQuiz();
}
function qCardHtml(q, i, mode) {
  // mode: 'play' | 'review'
  const picked = quiz.answers[i];
  const reveal = mode === 'review' || (quiz.instant && picked !== null);
  let h = '<div class="q-card"><div class="q-meta"><span class="tag">Q' + (i + 1) + '</span><span class="tag type">' + bi(TYPE_NAMES[q.type][0], TYPE_NAMES[q.type][1]) + '</span><span class="tag">' + bi(TOPICS[q.topic][0], TOPICS[q.topic][1]) + '</span></div>' +
    '<div class="q-text">' + bi(esc(q.qEn), esc(q.qBn)) + '</div><div class="opts">';
  q.opts.forEach((o, k) => {
    let cls = 'opt';
    if (reveal) { if (k === q.ans) cls += ' correct'; else if (k === picked) cls += ' wrong'; }
    else if (k === picked) cls += ' selected';
    h += '<button class="' + cls + '" data-opt="' + k + '"' + (reveal ? ' disabled' : '') + '><span class="letter">' + LETTERS[k] + '</span><span>' + esc(o) + '</span></button>';
  });
  h += '</div>';
  if (reveal) {
    const ok = picked === q.ans;
    h += '<div class="explain ' + (picked === null ? '' : ok ? 'good' : 'bad') + '"><b>' + (picked === null ? bi('Not answered', 'উত্তর দেওয়া হয়নি') : ok ? bi('✔ Correct!', '✔ সঠিক!') : bi('✘ Incorrect', '✘ ভুল')) + '</b> ' + bi('Correct answer: ', 'সঠিক উত্তর: ') + '<b>' + LETTERS[q.ans] + '. ' + esc(q.opts[q.ans]) + '</b><br>' + bi(esc(q.expEn), esc(q.expBn)) + '</div>';
  }
  return h + '</div>';
}
function renderQuiz() {
  const box = $('#quiz-box');
  const q = quiz.list[quiz.idx];
  const answered = quiz.answers.filter(a => a !== null).length;
  let dots = '<div class="dots">' + quiz.list.map((_, i) => '<button data-go="' + i + '" class="' + (quiz.answers[i] !== null ? 'answered ' : '') + (i === quiz.idx ? 'current' : '') + '">' + (i + 1) + '</button>').join('') + '</div>';
  box.innerHTML = '<div class="progress-bar"><i style="width:' + (answered / quiz.list.length * 100) + '%"></i></div><p class="hint">' + bi('Answered ', 'উত্তর দেওয়া হয়েছে ') + answered + ' / ' + quiz.list.length + '</p>' + dots +
    qCardHtml(q, quiz.idx, 'play') +
    '<div class="quiz-nav"><button class="btn" id="qz-prev"' + (quiz.idx === 0 ? ' disabled' : '') + '>◀ ' + bi('Previous', 'আগের') + '</button>' +
    '<button class="btn ghost" id="qz-quit">✖ ' + bi('Quit', 'বের হও') + '</button>' +
    (quiz.idx < quiz.list.length - 1 ? '<button class="btn" id="qz-next">' + bi('Next', 'পরের') + ' ▶</button>' : '') +
    '<button class="btn success" id="qz-submit">✔ ' + bi('Submit', 'জমা দাও') + '</button></div>';
  $$('.opt', box).forEach(b => b.addEventListener('click', () => {
    if (quiz.instant && quiz.answers[quiz.idx] !== null) return;
    quiz.answers[quiz.idx] = parseInt(b.dataset.opt, 10);
    renderQuiz();
  }));
  $$('.dots button', box).forEach(b => b.addEventListener('click', () => { quiz.idx = parseInt(b.dataset.go, 10); renderQuiz(); }));
  const prev = $('#qz-prev'), next = $('#qz-next');
  prev.addEventListener('click', () => { quiz.idx = Math.max(0, quiz.idx - 1); renderQuiz(); });
  if (next) next.addEventListener('click', () => { quiz.idx = Math.min(quiz.list.length - 1, quiz.idx + 1); renderQuiz(); });
  $('#qz-quit').addEventListener('click', () => { if (confirm(lt('Quit this quiz? Progress will be lost.', 'কুইজ ছেড়ে দেবে? অগ্রগতি হারিয়ে যাবে।'))) resetQuiz(); });
  $('#qz-submit').addEventListener('click', () => {
    const left = quiz.answers.filter(a => a === null).length;
    if (left && !confirm(lt(left + ' question(s) unanswered. Submit anyway?', left + 'টি প্রশ্নের উত্তর দেওয়া হয়নি। তবুও জমা দেবে?'))) return;
    submitQuiz();
  });
}
function resetQuiz() { quiz.active = false; quiz.submitted = false; $('#quiz-box').innerHTML = ''; $('#quiz-setup').hidden = false; renderQuizSetup(); }
function submitQuiz() {
  quiz.submitted = true;
  let score = 0, wrong = 0;
  quiz.list.forEach((q, i) => { if (quiz.answers[i] === q.ans) score++; else wrong++; });
  const total = quiz.list.length, pct = score / total * 100;
  appState.quizzes.push({ date: Date.now(), score, total, pct });
  if (appState.quizzes.length > 100) appState.quizzes.shift();
  appState.totals.correct += score; appState.totals.incorrect += wrong;
  saveState(); markDone('m6'); refreshProgressPage();
  const msg = pct >= 80 ? bi('🏆 Excellent! You are exam-ready.', '🏆 চমৎকার! তুমি পরীক্ষার জন্য প্রস্তুত।') : pct >= 60 ? bi('👍 Good job — review the mistakes below.', '👍 ভালো করেছ — নিচের ভুলগুলো দেখে নাও।') : bi('📚 Keep practising — read the explanations carefully.', '📚 অনুশীলন চালিয়ে যাও — ব্যাখ্যাগুলো মনোযোগ দিয়ে পড়ো।');
  $('#quiz-box').innerHTML = '<div class="result-hero"><div>' + bi('Your score', 'তোমার স্কোর') + '</div><div class="big">' + score + ' / ' + total + '</div><div>' + fmt(pct, 0) + '% · ' + bi('Correct ', 'সঠিক ') + score + ' · ' + bi('Incorrect ', 'ভুল ') + wrong + '</div><p>' + msg + '</p>' +
    '<button class="btn primary" id="qz-restart">↺ ' + bi('Restart quiz', 'আবার শুরু করো') + '</button></div>' +
    '<h3 class="section-title">' + bi('Review with explanations', 'ব্যাখ্যাসহ পর্যালোচনা') + '</h3>' + quiz.list.map((q, i) => qCardHtml(q, i, 'review')).join('');
  $('#qz-restart').addEventListener('click', resetQuiz);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ---- question bank ---- */
let bankShowAll = false;
const bankOpen = {};
function renderBank() {
  const type = $('#bank-type').value, topic = $('#bank-topic').value;
  const list = QB.filter(q => (type === 'all' || q.type === type) && (topic === 'all' || q.topic === topic));
  $('#bank-count').textContent = list.length + ' / ' + QB.length;
  $('#bank-list').innerHTML = list.map(q => {
    const open = bankShowAll || bankOpen[q.id];
    let h = '<div class="q-card"><div class="q-meta"><span class="tag">#' + q.id + '</span><span class="tag type">' + bi(TYPE_NAMES[q.type][0], TYPE_NAMES[q.type][1]) + '</span><span class="tag">' + bi(TOPICS[q.topic][0], TOPICS[q.topic][1]) + '</span></div><div class="q-text">' + bi(esc(q.qEn), esc(q.qBn)) + '</div>';
    if (q.opts) h += '<div class="opts">' + q.opts.map((o, k) => '<div class="opt' + (open && k === q.ans ? ' correct' : '') + '"><span class="letter">' + LETTERS[k] + '</span><span>' + esc(o) + '</span></div>').join('') + '</div>';
    h += '<div class="btn-row"><button class="btn" data-toggle="' + q.id + '">' + (open ? '🙈 ' + bi('Hide answer', 'উত্তর লুকাও') : '👁 ' + bi('Show answer', 'উত্তর দেখাও')) + '</button></div>';
    if (open) {
      if (q.opts) h += '<div class="answer-box"><b>' + bi('Answer: ', 'উত্তর: ') + LETTERS[q.ans] + '. ' + esc(q.opts[q.ans]) + '</b><br>' + bi(esc(q.expEn), esc(q.expBn)) + '</div>';
      else h += '<div class="answer-box"><b>' + bi('Model answer', 'আদর্শ উত্তর') + '</b><p>' + bi(q.aEn, q.aBn) + '</p></div>';
    }
    return h + '</div>';
  }).join('') || '<p class="hint">' + bi('No questions match this filter.', 'এই ফিল্টারে কোনো প্রশ্ন নেই।') + '</p>';
}
function initModule6() {
  $('#bank-topic').innerHTML = '<option value="all">All / সব</option>' + Object.keys(TOPICS).map(k => '<option value="' + k + '">' + TOPICS[k][0] + ' / ' + TOPICS[k][1] + '</option>').join('');
  $('#bank-type').addEventListener('change', renderBank);
  $('#bank-topic').addEventListener('change', renderBank);
  $('#bank-toggle').addEventListener('click', () => { bankShowAll = !bankShowAll; Object.keys(bankOpen).forEach(k => delete bankOpen[k]); renderBank(); });
  $('#bank-list').addEventListener('click', e => {
    const b = e.target.closest('[data-toggle]');
    if (!b) return;
    const id = b.dataset.toggle;
    if (bankShowAll) { bankShowAll = false; QB.forEach(q => { bankOpen[q.id] = true; }); }
    bankOpen[id] = !bankOpen[id];
    renderBank();
  });
  $$('#m6-tabs .tab').forEach(t => t.addEventListener('click', () => {
    $$('#m6-tabs .tab').forEach(x => x.classList.toggle('active', x === t));
    $('#tab-quiz').hidden = t.dataset.tab !== 'quiz';
    $('#tab-bank').hidden = t.dataset.tab !== 'bank';
    if (t.dataset.tab === 'bank') renderBank();
  }));
  renderQuizSetup();
  renderBank();
  langListeners.push(() => { if (!$('#tab-bank').hidden) renderBank(); if (quiz.active && !quiz.submitted) renderQuiz(); });
}

/* ---------------- Module 8: teacher mode ---------------- */
function initModule8() {
  const board = $('#tm-board'), formula = $('#tm-formula'), banner = $('#tm-problem');
  const chkMain = $('#tm-hl-main'), chkVer = $('#tm-hl-ver'), chkAuto = $('#tm-auto'), chkZe = $('#tm-ze');
  const sim = new CaliperSim($('#tm-sim'), { controls: 'basic', panel: false, helpDefault: false, hideGap: true, initialGap: 236 });
  let problem = null, revealed = 0, steps = [];

  function buildSteps(p) {
    const dec = 2;
    const zeTxt = fmtSigned(p.zeCm, dec);
    return [
      { en: 'Main Scale Reading (MSR)', bn: 'প্রধান স্কেল পাঠ (MSR)', eq: 'MSR = ' + fmt(p.msrCm, 1) + ' cm', ex: ['Take the last main-scale mark just to the LEFT of the vernier zero.', 'ভার্নিয়ার শূন্যের ঠিক বামের শেষ প্রধান স্কেল দাগটি নাও।'], hl: { msr: true } },
      { en: 'Vernier coincidence (n)', bn: 'ভার্নিয়ার সমাপতন (n)', eq: 'n = ' + p.n, ex: ['Find the vernier line that is perfectly straight with a main-scale line.', 'যে ভার্নিয়ার দাগটি প্রধান স্কেলের কোনো দাগের সাথে সোজা মিলেছে সেটি খোঁজো।'], hl: { coin: true, vernier: true } },
      { en: 'Least count (LC)', bn: 'লঘিষ্ঠ গণন (LC)', eq: 'LC = 1 MSD ÷ N = 0.1 cm ÷ 10 = 0.01 cm', ex: ['10 VSD = 9 MSD, so each vernier division is 0.1 MSD shorter.', '১০ VSD = ৯ MSD, তাই প্রতিটি ভার্নিয়ার ভাগ ০.১ MSD ছোট।'], hl: { vernier: true } },
      { en: 'Vernier Scale Reading (VSR)', bn: 'ভার্নিয়ার স্কেল পাঠ (VSR)', eq: 'VSR = n × LC = ' + p.n + ' × 0.01 = ' + fmt(p.vsrCm, dec) + ' cm', ex: ['Multiply the coinciding line number by the least count.', 'সমাপতিত দাগের সংখ্যাকে লঘিষ্ঠ গণন দিয়ে গুণ করো।'], hl: { coin: true } },
      { en: 'Observed reading', bn: 'পর্যবেক্ষিত পাঠ', eq: 'Observed = MSR + VSR = ' + fmt(p.msrCm, 1) + ' + ' + fmt(p.vsrCm, dec) + ' = ' + fmt(p.obsCm, dec) + ' cm', ex: ['Add the main-scale and vernier parts.', 'প্রধান স্কেল ও ভার্নিয়ার অংশ যোগ করো।'], hl: { msr: true, coin: true } },
      { en: 'Zero error & zero correction', bn: 'শূন্য ত্রুটি ও শূন্য সংশোধন', eq: p.zeCm === 0 ? 'ZE = 0.00 cm → no correction needed' : 'ZE = ' + zeTxt + ' cm → ZC = ' + fmtSigned(-p.zeCm, dec) + ' cm', ex: [p.zeCm === 0 ? 'The instrument has no zero error.' : 'Zero correction has the same size but the opposite sign.', p.zeCm === 0 ? 'যন্ত্রে শূন্য ত্রুটি নেই।' : 'শূন্য সংশোধনের মান একই, চিহ্ন উল্টো।'], hl: {} },
      { en: 'Correct reading', bn: 'সঠিক পাঠ', eq: 'Correct = Observed − ZE = ' + fmt(p.obsCm, dec) + ' − (' + zeTxt + ') = ' + fmt(p.correctCm, dec) + ' cm', ex: ['This is the final answer — always write the unit.', 'এটিই চূড়ান্ত উত্তর — সবসময় একক লেখো।'], hl: {} }
    ];
  }
  function applyHighlight() {
    const cur = revealed > 0 && chkAuto.checked && steps[revealed - 1] ? steps[revealed - 1].hl : {};
    sim.setHighlight({ main: chkMain.checked, vernier: chkVer.checked || !!cur.vernier, msr: !!cur.msr, coin: !!cur.coin });
  }
  function render() {
    if (!problem) {
      banner.innerHTML = bi('Press “New random problem” to generate a reading task for your students.', '“নতুন সমস্যা” চেপে শিক্ষার্থীদের জন্য একটি পাঠ নেওয়ার সমস্যা তৈরি করো।');
      board.innerHTML = ''; formula.innerHTML = ''; return;
    }
    const p = problem;
    banner.innerHTML = '<b>' + bi('Problem: ', 'সমস্যা: ') + '</b>' + bi('Read the Vernier Calipers shown below. ' + (p.zeCm === 0 ? 'The instrument has no zero error.' : 'The instrument has a zero error of <b>' + fmtSigned(p.zeCm, 2) + ' cm</b>.') + ' Find the correct reading.',
      'নিচের ভার্নিয়ার ক্যালিপার্সের পাঠ নাও। ' + (p.zeCm === 0 ? 'যন্ত্রে শূন্য ত্রুটি নেই।' : 'যন্ত্রের শূন্য ত্রুটি <b>' + fmtSigned(p.zeCm, 2) + ' সে.মি.</b>।') + ' সঠিক পাঠ নির্ণয় করো।');
    board.innerHTML = steps.map((s, i) => {
      const locked = i >= revealed;
      return '<div class="tm-step ' + (locked ? 'locked' : '') + (i === revealed - 1 ? ' current' : '') + '"><div class="num">' + (i + 1) + '</div><div><div class="title">' + bi(s.en, s.bn) + '</div>' +
        '<div class="big-eq">' + (locked ? '? ? ? ? ?' : s.eq) + '</div><div class="tm-explain">' + (locked ? '— — — — — —' : bi(s.ex[0], s.ex[1])) + '</div></div></div>';
    }).join('');
    let f = 'Final Reading = MSR + (n × LC)';
    if (revealed >= 5) f += '<br><small>= ' + fmt(p.msrCm, 1) + ' + (' + p.n + ' × 0.01) = ' + fmt(p.obsCm, 2) + ' cm</small>';
    if (revealed >= 7) f += '<br><small>Correct = ' + fmt(p.obsCm, 2) + ' − (' + fmtSigned(p.zeCm, 2) + ') = <span style="color:#fde68a">' + fmt(p.correctCm, 2) + ' cm</span></small>';
    formula.innerHTML = f;
  }
  function generate() {
    const ze = chkZe.checked ? randInt(1, 6) * (Math.random() < 0.5 ? -1 : 1) : 0;
    sim.setZeroError(ze);
    sim.setPos(randInt(40 + Math.max(0, ze), 700), true);
    const s = sim.snapshot();
    problem = { msrCm: s.msrCm, n: s.coincidence, vsrCm: s.vsrCm, obsCm: s.observedCm, zeCm: s.zeCm, correctCm: s.correctCm };
    steps = buildSteps(problem);
    revealed = 0;
    applyHighlight();
    render();
  }
  function reveal(k) { if (!problem) { generate(); } revealed = clamp(k, 0, steps.length); applyHighlight(); render(); }
  $('#tm-gen').addEventListener('click', generate);
  $('#tm-next').addEventListener('click', () => reveal(revealed + 1));
  $('#tm-all').addEventListener('click', () => reveal(steps.length || 7));
  $('#tm-hide').addEventListener('click', () => reveal(0));
  [chkMain, chkVer, chkAuto].forEach(c => c.addEventListener('change', applyHighlight));
  chkZe.addEventListener('change', generate);
  $('#tm-fs').addEventListener('click', () => {
    if (!document.fullscreenElement) { togglePresentation(true); toggleFullscreen(); }
    else { document.exitFullscreen(); togglePresentation(false); }
  });
  $('#tm-reset').addEventListener('click', () => {
    chkMain.checked = false; chkVer.checked = false; chkAuto.checked = true; chkZe.checked = false;
    sim.reset(); problem = null; steps = []; revealed = 0;
    setLang('both'); togglePresentation(false);
    if (document.fullscreenElement) { try { document.exitFullscreen(); } catch (e) { /* ignore */ } }
    render(); generate(); revealed = 0; render();
    toast(lt('Teacher settings reset', 'শিক্ষক মোডের সেটিংস রিসেট হয়েছে'));
  });
  document.addEventListener('keydown', e => {
    if (!$('#m8').classList.contains('active')) return;
    const tag = (document.activeElement && document.activeElement.tagName) || '';
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || (document.activeElement && document.activeElement.closest && document.activeElement.closest('svg'))) return;
    if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); reveal(revealed + 1); }
    else if (e.key.toLowerCase() === 'n') generate();
  });
  langListeners.push(render);
  moduleEnterHooks.m8 = () => sim.update();
  generate();
}

/* ===================== BOOT ===================== */
function bootApp() {
  initChrome();
  initModule1(); initModule2(); initModule3(); initModule4();
  initModule5(); initModule6(); initModule7(); initModule8(); initModule10();
  routeFromHash();
  refreshChrome();
  refreshProgressPage();
}
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootApp);
  else bootApp();
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { floorDiv, floorMod, roundTo, readVernier, findCoincidenceByGeometry, leastCount, validateLCInputs, computeObserved, computeCorrect, zeroErrorFromCoincidence, classifyZero, percentAccuracy, nearestCoincidence, QB };
}
