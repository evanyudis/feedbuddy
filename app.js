/* FeedBuddy v2.0 — Feeding, Pumping, Popok tracker
   BumpBuddy design system (Geist, OKLCH tokens, rose accent)
*/

'use strict';

// ============================================================
// Storage
// ============================================================
const K = {
  settings: 'feedbuddy_settings',
  bfSessions: 'feedbuddy_bf_sessions',
  pumpingLog: 'feedbuddy_pumping_log',
  diaperLog: 'feedbuddy_diaper_log',
};

function load(key, fallback = null) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
  catch { return fallback; }
}
function save(key, val) { localStorage.setItem(key, JSON.stringify(val)); }

let settings = load(K.settings, {});
let bfSessions = load(K.bfSessions, []);
let pumpingLog = load(K.pumpingLog, []);
let diaperLog = load(K.diaperLog, []);

// ============================================================
// ID generator
// ============================================================
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// ============================================================
// Theme
// ============================================================
function applyTheme(val) {
  let effective = val === 'system' || !val
    ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    : val;
  document.documentElement.setAttribute('data-theme', effective);
}
function initTheme() {
  applyTheme(settings.theme);
}

// ============================================================
// Toast
// ============================================================
function toast(msg, dur = 3500) {
  const c = document.getElementById('toast-container');
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  c.appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => {
    t.classList.remove('show');
    t.addEventListener('transitionend', () => t.remove(), { once: true });
  }, dur);
}

// ============================================================
// Tabs
// ============================================================
function initTabs() {
  document.getElementById('tab-nav').addEventListener('click', e => {
    const btn = e.target.closest('.tab-btn');
    if (!btn) return;
    const tab = btn.dataset.tab;
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('panel-' + tab)?.classList.add('active');
    if (tab === 'feeding') renderFeedingSchedule();
    checkFloatingPlayerVisibility();
    document.dispatchEvent(new CustomEvent('tabswitch', { detail: { tab } }));
  });
}

// ============================================================
// Date helpers
// ============================================================
function isToday(d) { return new Date(d).toDateString() === new Date().toDateString(); }
function isYesterday(d) {
  const y = new Date(); y.setDate(y.getDate() - 1);
  return new Date(d).toDateString() === y.toDateString();
}
function formatTime(iso) {
  return new Date(iso).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
}
function formatDur(ms) {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
  return `${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
}
function formatMin(ms) {
  const m = Math.round(ms / 60000);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m/60)}h ${m%60}m`;
}
function diffMin(t1, t2) { return (new Date(t1) - new Date(t2)) / 60000; }

// ============================================================
// ML Estimation by age
// ============================================================
function estimateBFML() {
  const bd = settings.birthDate ? new Date(settings.birthDate + 'T00:00:00') : new Date('2026-04-14T00:00:00');
  const ageDays = Math.max(0, Math.floor((Date.now() - bd) / 86400000));
  const weeks = ageDays / 7;
  if (weeks < 4) return 75;       // 0-1mo: 60-90ml, default 75
  if (weeks < 8) return 105;      // 1-2mo: 90-120ml, default 105
  if (weeks < 13) return 135;     // 2-3mo: 120-150ml, default 135
  return 165;                      // 3-6mo: 150-180ml, default 165
}

function feedingIntervalHours() {
  const bd = settings.birthDate ? new Date(settings.birthDate + 'T00:00:00') : new Date('2026-04-14T00:00:00');
  const ageDays = Math.max(0, Math.floor((Date.now() - bd) / 86400000));
  const weeks = ageDays / 7;
  if (weeks < 4) return 2;
  if (weeks < 8) return 2.5;
  if (weeks < 13) return 3;
  return 4;
}

// ============================================================
// FEEDING TAB
// ============================================================
let feedingState = { running: false, startTime: null, side: 'left', elapsed: 0, paused: false, pausedAt: null };
let feedingInterval = null;
let pendingCombine = null; // { newSide, resolve }

function getTodayBF() { return bfSessions.filter(s => isToday(s.start)); }
function getLastBF() { return bfSessions.length > 0 ? bfSessions[bfSessions.length - 1] : null; }

function totalBFDuration(sessions) {
  return sessions.reduce((sum, s) => sum + (s.duration || 0), 0);
}

function totalEstML(sessions) {
  const perMl = estimateBFML();
  // For combined sessions, count once per combined session
  const uniqueSessions = [];
  const seen = new Set();
  for (const s of [...sessions].reverse()) {
    if (s.side === 'combined' && s.combinedWith) {
      // Already included via its parts
    } else if (!seen.has(s.id)) {
      seen.add(s.id);
      uniqueSessions.push(s);
    }
  }
  // Simpler: count all sessions including combined as 1 entry
  let count = 0;
  const counted = new Set();
  for (const s of [...sessions].reverse()) {
    if (s.side === 'combined' && s.combinedWith) {
      for (const cid of s.combinedWith) counted.add(cid);
      counted.add(s.id);
      count++;
    } else if (!counted.has(s.id)) {
      counted.add(s.id);
      count++;
    }
  }
  return count * perMl;
}

function renderBFStats() {
  const today = getTodayBF();
  const totalDur = totalBFDuration(today);
  const totalMl = totalEstML(today);
  const last = getLastBF();

  document.getElementById('stat-bf-sessions').textContent = today.length;
  document.getElementById('stat-bf-duration').textContent = formatMin(totalDur);
  document.getElementById('stat-bf-est-ml').textContent = `~${totalMl}ml`;
}

function renderBFSessions() {
  const el = document.getElementById('feeding-log');
  const today = getTodayBF();

  if (today.length === 0) {
    el.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 2c0 0-5 6-5 10a5 5 0 1010 0c0-4-5-10-5-10z"/></svg></div>
        <div class="empty-state-title">Belum ada sesi</div>
        <div class="empty-state-desc">Tekan MULAI saat mulai menyusui.</div>
      </div>`;
    return;
  }

  const mlPer = estimateBFML();
  const sideLabels = { left: 'Kiri', right: 'Kanan', combined: 'Kiri+Kanan' };

  el.innerHTML = today.slice().reverse().map(s => {
    const time = formatTime(s.start);
    const isCombined = s.side === 'combined';
    const label = isCombined ? 'Kiri+Kanan' : sideLabels[s.side];
    const duration = formatDur(s.duration);
    const estMl = isCombined ? `~${mlPer * 2}ml` : `~${mlPer}ml`;
    return `
      <div class="log-item">
        <div class="log-item-left">
          <span class="log-item-title">${label}</span>
          <span class="log-item-time">${time}</span>
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:2px;">
          <span class="log-item-value teal">${duration}</span>
          <span style="font-size:0.7rem;color:var(--text-3);">${estMl}</span>
        </div>
      </div>`;
  }).join('');
}

function updateFeedingDisplay() {
  if (!feedingState.running) return;
  if (feedingState.paused) {
    feedingState.elapsed = feedingState.pausedAt - feedingState.startTime;
  } else {
    feedingState.elapsed = Date.now() - feedingState.startTime;
  }
  document.getElementById('feeding-display').textContent = formatDur(feedingState.elapsed);
}

function startFeedingTimer(sideOverride) {
  const side = sideOverride || feedingState.side;
  feedingState.running = true;
  feedingState.startTime = Date.now();
  feedingState.side = side;
  feedingState.elapsed = 0;
  feedingState.paused = false;
  feedingState.pausedAt = null;
  document.getElementById('feeding-display').textContent = '00:00';
  document.getElementById('btn-feeding-text').textContent = 'JEDA';
  document.getElementById('btn-feeding-reset').style.display = '';
  document.getElementById('feeding-subtitle').textContent = `Menyusui ${side === 'left' ? 'KIRI' : 'KANAN'}`;
  if (feedingInterval) clearInterval(feedingInterval);
  feedingInterval = setInterval(updateFeedingDisplay, 1000);
}

function pauseFeedingTimer() {
  if (!feedingState.running || feedingState.paused) return;
  clearInterval(feedingInterval);
  feedingInterval = null;
  feedingState.paused = true;
  feedingState.pausedAt = Date.now();
  document.getElementById('btn-feeding-text').textContent = 'LANJUT';
  document.getElementById('feeding-subtitle').textContent = `Jeda — ${formatDur(feedingState.elapsed)}`;
}

function resumeFeedingTimer() {
  if (!feedingState.running || !feedingState.paused) return;
  // Adjust startTime to account for the paused duration
  const pausedDur = Date.now() - feedingState.pausedAt;
  feedingState.startTime += pausedDur;
  feedingState.paused = false;
  feedingState.pausedAt = null;
  document.getElementById('btn-feeding-text').textContent = 'JEDA';
  const side = feedingState.side === 'left' ? 'KIRI' : 'KANAN';
  document.getElementById('feeding-subtitle').textContent = `Menyusui ${side}`;
  if (feedingInterval) clearInterval(feedingInterval);
  feedingInterval = setInterval(updateFeedingDisplay, 1000);
}

function stopFeedingTimer() {
  if (!feedingState.running) return;
  clearInterval(feedingInterval);
  feedingInterval = null;
  const end = Date.now();
  // If paused, use pausedAt as the end time
  const endTime = feedingState.paused ? feedingState.pausedAt : end;
  const duration = endTime - feedingState.startTime;
  feedingState.running = false;

  bfSessions.push({
    id: uid(),
    start: new Date(feedingState.startTime).toISOString(),
    end: new Date(endTime).toISOString(),
    duration,
    side: feedingState.side,
    combinedWith: null,
  });
  save(K.bfSessions, bfSessions);

  document.getElementById('btn-feeding-text').textContent = 'MULAI';
  document.getElementById('feeding-subtitle').textContent = 'Sesi selesai — ' + formatMin(duration);
  feedingState.elapsed = 0;
  feedingState.paused = false;
  feedingState.pausedAt = null;
  renderBFStats();
  renderBFSessions();
  renderFeedingSchedule();
}

function resetFeedingTimer() {
  clearInterval(feedingInterval);
  feedingInterval = null;
  feedingState.running = false;
  feedingState.elapsed = 0;
  feedingState.paused = false;
  feedingState.pausedAt = null;
  document.getElementById('btn-feeding-text').textContent = 'MULAI';
  document.getElementById('feeding-display').textContent = '00:00';
  document.getElementById('btn-feeding-reset').style.display = 'none';
  document.getElementById('feeding-subtitle').textContent = 'Pilih sisi dan mulai';
}

function askCombine(prevSession, newSide, callback) {
  const modal = document.getElementById('combine-modal');
  const desc = document.getElementById('combine-modal-desc');
  const prevSide = prevSession.side === 'combined' ? 'Kiri+Kanan' : (prevSession.side === 'left' ? 'Kiri' : 'Kanan');
  desc.textContent = `Sesi sebelumnya (${prevSide}, ${formatDur(prevSession.duration)}) belum 10 menit. Gabungkan?`;
  modal.classList.remove('hidden');
  document.getElementById('combine-dontask').checked = false;

  function cleanup() {
    modal.classList.add('hidden');
    document.getElementById('combine-gabung').removeEventListener('click', onGabung);
    document.getElementById('combine-pisah').removeEventListener('click', onPisah);
  }
  function onGabung() { cleanup(); callback(true); }
  function onPisah() { cleanup(); callback(false); }
  document.getElementById('combine-gabung').addEventListener('click', onGabung);
  document.getElementById('combine-pisah').addEventListener('click', onPisah);
}

function combineSessions(prevId, newId) {
  const prev = bfSessions.find(s => s.id === prevId);
  const curr = bfSessions.find(s => s.id === newId);
  if (!prev || !curr) return;

  // Merge: new session becomes the combined one
  curr.side = 'combined';
  curr.combinedWith = [prevId, newId];
  curr.duration = (prev.duration || 0) + (curr.duration || 0);
  // Mark prev as combined reference
  prev.side = 'combined_old';
  prev.combinedWithRef = newId;
  save(K.bfSessions, bfSessions);
}

function handleFeedingToggle() {
  if (feedingState.running) {
    if (feedingState.paused) {
      resumeFeedingTimer();
    } else {
      pauseFeedingTimer();
    }
    return;
  }

  const newSide = feedingState.side;
  const last = getLastBF();
  const autoGabung = settings.autoGabung !== false; // default true
  const dontAsk = settings.dontAskGabung;

  // Check 10-min window
  if (last && diffMin(Date.now(), last.end) < 10 && last.side !== newSide && last.side !== 'combined' && last.side !== 'combined_old') {
    if (!autoGabung) {
      startFeedingTimer(newSide);
      return;
    }
    if (dontAsk) {
      // Auto-combine: store the last session id to merge on stop
      pendingCombine = { prevId: last.id, newSide };
      startFeedingTimer(newSide);
    } else {
      askCombine(last, newSide, (doCombine) => {
        if (doCombine) {
          const dontAskAgain = document.getElementById('combine-dontask').checked;
          if (dontAskAgain) {
            settings.dontAskGabung = true;
            save(K.settings, settings);
          }
          pendingCombine = { prevId: last.id, newSide };
        }
        startFeedingTimer(newSide);
      });
    }
  } else {
    startFeedingTimer(newSide);
  }
}

function handleFeedingStop() {
  if (!feedingState.running) return;
  clearInterval(feedingInterval);
  feedingInterval = null;
  const end = Date.now();
  const duration = end - feedingState.startTime;
  feedingState.running = false;

  const newId = uid();
  let newSession = {
    id: newId,
    start: new Date(feedingState.startTime).toISOString(),
    end: new Date(end).toISOString(),
    duration,
    side: feedingState.side,
    combinedWith: null,
  };

  // Handle combine
  if (pendingCombine && pendingCombine.newSide === feedingState.side) {
    const prev = bfSessions.find(s => s.id === pendingCombine.prevId);
    if (prev && prev.side !== 'combined' && prev.side !== 'combined_old') {
      // Merge into new session
      newSession.side = 'combined';
      newSession.combinedWith = [pendingCombine.id, newId].filter(Boolean);
      newSession.duration = (prev.duration || 0) + duration;
      prev.side = 'combined_old';
      prev.combinedWithRef = newId;
    }
    pendingCombine = null;
  }

  bfSessions.push(newSession);
  save(K.bfSessions, bfSessions);

  document.getElementById('btn-feeding-text').textContent = 'MULAI';
  document.getElementById('feeding-subtitle').textContent = 'Sesi selesai — ' + formatMin(duration);
  document.getElementById('feeding-display').textContent = formatDur(duration);
  feedingState.elapsed = 0;
  document.getElementById('btn-feeding-reset').style.display = 'none';
  renderBFStats();
  renderBFSessions();
  renderFeedingSchedule();
}

function updateSegmentBtnActive(groupId) {
  const group = document.getElementById(groupId);
  if (!group) return;
  group.querySelectorAll('.segment-btn').forEach(b => {
    const isActive = b.classList.contains('active');
    b.style.background = isActive ? 'var(--accent)' : 'transparent';
    b.style.color = isActive ? 'var(--text-inv)' : 'var(--text-2)';
    b.style.fontWeight = isActive ? '600' : '400';
  });
}

function initFeeding() {
  // Side picker — ensure active state renders correctly on init
  updateSegmentBtnActive('side-picker');

  document.getElementById('side-picker').addEventListener('click', e => {
    const btn = e.target.closest('.segment-btn');
    if (!btn) return;
    document.querySelectorAll('#side-picker .segment-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    feedingState.side = btn.dataset.side;
    updateSegmentBtnActive('side-picker');
    if (!feedingState.running) {
      document.getElementById('feeding-subtitle').textContent = `Sisi ${feedingState.side === 'left' ? 'KIRI' : 'KANAN'} — siap mulai`;
    }
  });

  document.getElementById('btn-feeding-toggle').addEventListener('click', handleFeedingToggle);
  document.getElementById('btn-feeding-reset').addEventListener('click', resetFeedingTimer);
  document.getElementById('btn-clear-feeding').addEventListener('click', () => {
    if (confirm('Hapus semua riwayat menyusui?')) {
      bfSessions = [];
      save(K.bfSessions, bfSessions);
      renderBFStats();
      renderBFSessions();
      renderFeedingSchedule();
      toast('Riwayat dihapus');
    }
  });

  renderBFStats();
  renderBFSessions();
}

// ============================================================
// Feeding schedule (next feeding countdown)
// ============================================================
let scheduleInterval = null;

function feedingIntervalHours() {
  const bd = settings.birthDate ? new Date(settings.birthDate + 'T00:00:00') : new Date('2026-04-14T00:00:00');
  const ageDays = Math.max(0, Math.floor((Date.now() - bd) / 86400000));
  const weeks = ageDays / 7;
  if (weeks < 4) return 2;
  if (weeks < 8) return 2.5;
  if (weeks < 13) return 3;
  return 4;
}

function renderFeedingSchedule() {
  const last = getLastBF();
  const intervalH = feedingIntervalHours();
  const intervalMs = intervalH * 3600000;
  const bd = settings.birthDate ? new Date(settings.birthDate + 'T00:00:00') : new Date('2026-04-14T00:00:00');
  const ageDays = Math.max(0, Math.floor((Date.now() - bd) / 86400000));
  const weeks = Math.floor(ageDays / 7);
  const days = ageDays % 7;

  const nextEl = document.getElementById('next-feeding-display');
  const lastEl = document.getElementById('last-feed-display');
  const ageEl = document.getElementById('baby-age-display');
  const intEl = document.getElementById('interval-hint-value');

  // Update age + interval context
  if (weeks > 0) {
    ageEl.textContent = `${weeks} minggu ${days} hari`;
  } else {
    ageEl.textContent = `${ageDays} hari`;
  }
  intEl.textContent = intervalH >= 4 ? 'on demand' : `${intervalH} jam`;

  if (!last) {
    nextEl.textContent = '--';
    lastEl.textContent = '--';
    return;
  }

  lastEl.textContent = formatTime(last.start);
  const nextTime = new Date(new Date(last.start).getTime() + intervalMs).getTime();
  const diff = nextTime - Date.now();

  if (diff <= 0) {
    const overdueMin = Math.floor(Math.abs(diff) / 60000);
    nextEl.textContent = `Lewat ${overdueMin}m`;
    nextEl.style.color = 'var(--danger)';
  } else {
    const remainingMin = Math.floor(diff / 60000);
    const h = Math.floor(remainingMin / 60);
    const m = remainingMin % 60;
    nextEl.textContent = h > 0 ? `${h}h ${m}m` : `${m}m`;
    nextEl.style.color = 'var(--text-1)';
  }
}

function initSchedule() {
  renderFeedingSchedule();
  if (scheduleInterval) clearInterval(scheduleInterval);
  scheduleInterval = setInterval(renderFeedingSchedule, 60000);
}

// ============================================================
// PUMPING TAB
// ============================================================
let pumpingState = { running: false, startTime: null, side: 'left', elapsed: 0, mlUserEdited: false, paused: false, pausedAt: null };
let pumpingInterval = null;

function getTodayPumping() { return pumpingLog.filter(p => isToday(p.timestamp)); }
function getLastPumping() { return pumpingLog.length > 0 ? pumpingLog[pumpingLog.length - 1] : null; }

function renderPumpingStats() {
  const today = getTodayPumping();
  const totalMl = today.reduce((sum, p) => sum + (p.ml || 0), 0);
  const last = getLastPumping();

  document.getElementById('stat-pump-ml').textContent = totalMl;
  document.getElementById('stat-pump-sessions').textContent = today.length;
  document.getElementById('stat-pump-last').textContent = last ? `${last.ml}ml` : '--';
}

function renderPumpingSessions() {
  const el = document.getElementById('pumping-log');
  const today = getTodayPumping();

  if (today.length === 0) {
    el.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 2v6M12 18v4M8 6l4-4 4 4M8 18l4 4 4-4"/></svg></div>
        <div class="empty-state-title">Belum ada data</div>
        <div class="empty-state-desc">Catat hasil pumping dengan ML.</div>
      </div>`;
    return;
  }

  const sideLabels = { left: 'Kiri', right: 'Kanan', both: 'Kedua' };
  el.innerHTML = today.slice().reverse().map(p => {
    const time = formatTime(p.timestamp);
    return `
      <div class="log-item" data-pump-id="${p.id}" style="cursor:pointer;">
        <div class="log-item-left">
          <span class="log-item-title">${sideLabels[p.side] || p.side}</span>
          <span class="log-item-time">${time}</span>
        </div>
        <span class="log-item-value teal">${p.ml}ml</span>
      </div>`;
  }).join('');

  // Attach click-to-edit handlers
  el.querySelectorAll('.log-item[data-pump-id]').forEach(item => {
    item.addEventListener('click', () => {
      const id = item.dataset.pumpId;
      openEditPumpingModal(id);
    });
  });
}

const PUMPING_ML_PER_MINUTE = 30; // avg pumping rate ml/min

function updatePumpingDisplay() {
  if (!pumpingState.running) return;
  if (pumpingState.paused) {
    pumpingState.elapsed = pumpingState.pausedAt - pumpingState.startTime;
  } else {
    pumpingState.elapsed = Date.now() - pumpingState.startTime;
  }
  document.getElementById('pumping-display').textContent = formatDur(pumpingState.elapsed);

  // Auto-estimate ML while timer runs — only if user hasn't manually edited
  if (!pumpingState.mlUserEdited) {
    const estMl = Math.round(pumpingState.elapsed / 60000 * PUMPING_ML_PER_MINUTE);
    const mlInput = document.getElementById('pump-ml-input');
    const mlUnit = document.getElementById('pump-ml-unit');
    mlInput.value = estMl;
    mlInput.classList.add('auto-est');
    mlUnit.classList.add('auto-est');
  }
}

function startPumpingTimer() {
  pumpingState.running = true;
  pumpingState.startTime = Date.now();
  pumpingState.elapsed = 0;
  pumpingState.mlUserEdited = false;
  pumpingState.paused = false;
  pumpingState.pausedAt = null;
  document.getElementById('pumping-display').textContent = '00:00';
  document.getElementById('pump-ml-input').value = '';
  document.getElementById('pump-ml-input').classList.remove('user-edited');
  document.getElementById('pump-ml-unit').classList.remove('user-edited');
  document.getElementById('btn-pumping-text').textContent = 'JEDA';
  document.getElementById('btn-pumping-save').style.display = 'none';
  document.getElementById('pumping-subtitle').textContent = 'Pumping berjalan...';
  if (pumpingInterval) clearInterval(pumpingInterval);
  pumpingInterval = setInterval(updatePumpingDisplay, 1000);
}

function stopPumpingTimer() {
  if (!pumpingState.running) return;
  clearInterval(pumpingInterval);
  pumpingInterval = null;
  pumpingState.running = false;
  pumpingState.paused = false;
  pumpingState.pausedAt = null;
  document.getElementById('btn-pumping-text').textContent = 'MULAI';
  document.getElementById('pumping-subtitle').textContent = 'Sesi selesai';
  document.getElementById('btn-pumping-save').style.display = '';
}

function pausePumpingTimer() {
  if (!pumpingState.running || pumpingState.paused) return;
  clearInterval(pumpingInterval);
  pumpingInterval = null;
  pumpingState.paused = true;
  pumpingState.pausedAt = Date.now();
  document.getElementById('btn-pumping-text').textContent = 'LANJUT';
  document.getElementById('pumping-subtitle').textContent = `Jeda — ${formatDur(pumpingState.elapsed)}`;
}

function resumePumpingTimer() {
  if (!pumpingState.running || !pumpingState.paused) return;
  const pausedDur = Date.now() - pumpingState.pausedAt;
  pumpingState.startTime += pausedDur;
  pumpingState.paused = false;
  pumpingState.pausedAt = null;
  document.getElementById('btn-pumping-text').textContent = 'JEDA';
  document.getElementById('pumping-subtitle').textContent = 'Pumping berjalan...';
  if (pumpingInterval) clearInterval(pumpingInterval);
  pumpingInterval = setInterval(updatePumpingDisplay, 1000);
}

function savePumpingSession() {
  const mlInput = document.getElementById('pump-ml-input');
  const mlUnit = document.getElementById('pump-ml-unit');
  const ml = parseFloat(mlInput.value) || 0;
  if (ml <= 0) { toast('Masukkan jumlah ML'); return; }

  pumpingLog.push({
    id: uid(),
    timestamp: new Date(pumpingState.startTime).toISOString(),
    ml,
    duration: pumpingState.elapsed,
    side: pumpingState.side,
  });
  save(K.pumpingLog, pumpingLog);

  mlInput.value = '';
  pumpingState.mlUserEdited = false;
  mlInput.classList.remove('user-edited');
  mlUnit.classList.remove('user-edited');
  document.getElementById('pumping-display').textContent = '00:00';
  document.getElementById('btn-pumping-save').style.display = 'none';
  document.getElementById('pumping-subtitle').textContent = 'Catat hasil pumping';
  toast(`${ml}ml disimpan`);

  renderPumpingStats();
  renderPumpingSessions();
}

function openEditPumpingModal(id) {
  const session = pumpingLog.find(p => p.id === id);
  if (!session) return;

  const modal = document.getElementById('edit-pump-modal');
  const desc = document.getElementById('edit-pump-desc');
  const mlInput = document.getElementById('edit-pump-ml');
  const sideLabels = { left: 'Kiri', right: 'Kanan', both: 'Kedua' };

  desc.textContent = `${sideLabels[session.side] || session.side} · ${formatTime(session.timestamp)}`;
  mlInput.value = session.ml;
  modal.classList.remove('hidden');
  mlInput.focus();
  mlInput.select();

  function cleanup() {
    modal.classList.add('hidden');
    document.getElementById('edit-pump-save').removeEventListener('click', onSave);
    document.getElementById('edit-pump-cancel').removeEventListener('click', onCancel);
  }

  function onSave() {
    const newMl = parseFloat(mlInput.value) || 0;
    if (newMl <= 0) { toast('Masukkan jumlah ML'); return; }
    session.ml = newMl;
    save(K.pumpingLog, pumpingLog);
    cleanup();
    toast(`${newMl}ml disimpan`);
    renderPumpingStats();
    renderPumpingSessions();
  }

  function onCancel() {
    cleanup();
  }

  document.getElementById('edit-pump-save').addEventListener('click', onSave);
  document.getElementById('edit-pump-cancel').addEventListener('click', onCancel);
}

function initPumping() {
  updateSegmentBtnActive('pump-side-picker');

  document.getElementById('pump-side-picker').addEventListener('click', e => {
    const btn = e.target.closest('.segment-btn');
    if (!btn) return;
    document.querySelectorAll('#pump-side-picker .segment-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    pumpingState.side = btn.dataset.pumpSide;
    updateSegmentBtnActive('pump-side-picker');
  });

  document.getElementById('btn-pumping-toggle').addEventListener('click', () => {
    if (pumpingState.running) {
      if (pumpingState.paused) {
        resumePumpingTimer();
      } else {
        pausePumpingTimer();
      }
    } else {
      startPumpingTimer();
    }
  });

  document.getElementById('btn-pumping-save').addEventListener('click', savePumpingSession);

  document.getElementById('btn-clear-pumping').addEventListener('click', () => {
    if (confirm('Hapus semua riwayat pumping?')) {
      pumpingLog = [];
      save(K.pumpingLog, pumpingLog);
      renderPumpingStats();
      renderPumpingSessions();
      toast('Riwayat pumping dihapus');
    }
  });

  // Detect user manual edit → bright accent color
  const mlInput = document.getElementById('pump-ml-input');
  const mlUnit = document.getElementById('pump-ml-unit');
  mlInput.addEventListener('input', () => {
    if (mlInput.value && mlInput.value !== '') {
      pumpingState.mlUserEdited = true;
      mlInput.classList.add('user-edited');
      mlInput.classList.remove('auto-est');
      mlUnit.classList.add('user-edited');
      mlUnit.classList.remove('auto-est');
    } else {
      pumpingState.mlUserEdited = false;
      mlInput.classList.remove('user-edited');
      mlUnit.classList.remove('user-edited');
    }
  });

  renderPumpingStats();
  renderPumpingSessions();
}

// ============================================================
// POPOK TAB
// ============================================================
function getTodayDiaper() { return diaperLog.filter(d => isToday(d.timestamp)); }
function getLastDiaper() { return diaperLog.length > 0 ? diaperLog[diaperLog.length - 1] : null; }

function formatSince(ts) {
  const diff = Date.now() - new Date(ts).getTime();
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function renderDiaperStats() {
  const today = getTodayDiaper();
  const last = getLastDiaper();
  const basahCount = today.filter(d => d.type === 'basah').length;

  document.getElementById('stat-popok-today').textContent = today.length;
  document.getElementById('stat-popok-basah').textContent = basahCount;

  if (last) {
    const time = new Date(last.timestamp);
    document.getElementById('last-popok-time').textContent = time.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
    const labels = { basah: 'Basah', kotor: 'Kotor', campuran: 'Campuran' };
    document.getElementById('last-popok-type').textContent = labels[last.type] || last.type;
    document.getElementById('stat-popok-since').textContent = formatSince(last.timestamp);

    const hoursSince = (Date.now() - new Date(last.timestamp).getTime()) / 3600000;
    if (hoursSince >= 4) toast('Ganti popok sudah 4+ jam!', 5000);
  } else {
    document.getElementById('last-popok-time').textContent = '--';
    document.getElementById('last-popok-type').textContent = '--';
    document.getElementById('stat-popok-since').textContent = '--';
  }
}

function renderDiaperSessions() {
  const el = document.getElementById('popok-log');
  const today = getTodayDiaper();
  const typeColors = { basah: 'var(--teal)', kotor: 'var(--warning)', campuran: 'var(--accent)' };
  const typeLabels = { basah: 'Basah', kotor: 'Kotor', campuran: 'Campuran' };

  if (today.length === 0) {
    el.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="4"/><path d="M8 12h8"/></svg></div>
        <div class="empty-state-title">Belum ada catatan</div>
        <div class="empty-state-desc">Tekan Basah, Kotor, atau Campuran.</div>
      </div>`;
    return;
  }

  el.innerHTML = today.slice().reverse().map(d => `
    <div class="log-item">
      <div class="log-item-left">
        <span class="log-item-title">${typeLabels[d.type] || d.type}</span>
        <span class="log-item-time">${formatTime(d.timestamp)}</span>
      </div>
      <span style="font-size:1rem;" class="log-item-value">●</span>
    </div>`).join('');
}

function logDiaper(type) {
  diaperLog.push({ id: uid(), timestamp: new Date().toISOString(), type });
  save(K.diaperLog, diaperLog);
  const labels = { basah: 'Basah', kotor: 'Kotor', campuran: 'Campuran' };
  toast('Popok dicatat: ' + labels[type]);
  renderDiaperStats();
  renderDiaperSessions();
}

function initDiaper() {
  document.getElementById('popok-type-grid').addEventListener('click', e => {
    const btn = e.target.closest('.symptom-btn');
    if (!btn) return;
    logDiaper(btn.dataset.type);
  });

  document.getElementById('btn-clear-popok').addEventListener('click', () => {
    if (confirm('Hapus semua riwayat popok?')) {
      diaperLog = [];
      save(K.diaperLog, diaperLog);
      renderDiaperStats();
      renderDiaperSessions();
      toast('Riwayat popok dihapus');
    }
  });

  renderDiaperStats();
  renderDiaperSessions();
}

// ============================================================
// ACCENT STYLES REFRESHER (global for reuse)
// ============================================================
function refreshAccentStyles() {
  document.querySelectorAll('.segment-btn').forEach(b => {
    if (b.classList.contains('active')) {
      b.style.background = 'var(--accent)';
      b.style.color = 'var(--text-inv)';
    } else {
      b.style.background = 'transparent';
      b.style.color = 'var(--text-2)';
    }
  });
  const logoIcon = document.querySelector('.logo-icon');
  if (logoIcon) logoIcon.style.color = 'var(--accent)';
  const logoText = document.querySelector('.logo-text span');
  if (logoText) logoText.style.color = 'var(--accent)';
}

// ============================================================
// SETTINGS
// ============================================================
function initSettings() {
  document.getElementById('setting-birth-date').value = settings.birthDate || '2026-04-14';
  document.getElementById('setting-baby-name').value = settings.babyName || '';
  document.getElementById('ui-baby-name').textContent = settings.babyName || 'Baby';

  // Gender — sync select + apply data-gender on documentElement
  const genderEl = document.getElementById('setting-gender');
  if (genderEl) {
    genderEl.value = settings.gender || 'girl';
    document.documentElement.setAttribute('data-gender', settings.gender || 'girl');
    refreshAccentStyles();
    genderEl.addEventListener('change', e => {
      settings.gender = e.target.value;
      document.documentElement.setAttribute('data-gender', e.target.value);
      save(K.settings, settings);
      refreshAccentStyles();
      toast(e.target.value === 'girl' ? 'Tema pink aktif' : 'Tema biru aktif');
    });
  }

  // Birth date
  document.getElementById('setting-birth-date').addEventListener('change', e => {
    settings.birthDate = e.target.value;
    save(K.settings, settings);
    renderFeedingSchedule();
    toast('Tanggal disimpan');
  });

  // Baby name
  document.getElementById('setting-baby-name').addEventListener('change', e => {
    settings.babyName = e.target.value;
    save(K.settings, settings);
    document.getElementById('ui-baby-name').textContent = settings.babyName || 'Baby';
    toast('Nama disimpan');
  });

  // Theme
  const ts = document.getElementById('theme-switcher');
  let systemThemeQuery = null;
  let systemThemeListener = null;

  function setTheme(theme) {
    // Clean up previous system theme listener if exists
    if (systemThemeQuery) {
      systemThemeQuery.removeEventListener('change', systemThemeListener);
      systemThemeQuery = null;
      systemThemeListener = null;
    }

    settings.theme = theme;
    save(K.settings, settings);
    applyTheme(theme);

    // Set up listener for system theme changes
    if (theme === 'system') {
      systemThemeQuery = window.matchMedia('(prefers-color-scheme: dark)');
      systemThemeListener = () => applyTheme('system');
      systemThemeQuery.addEventListener('change', systemThemeListener);
    }

    refreshAccentStyles();
  }

  // Sync active state on theme segment buttons
  ts.querySelectorAll('.segment-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.themeVal === settings.theme);
  });
  ts.addEventListener('click', e => {
    const btn = e.target.closest('.segment-btn');
    if (!btn) return;
    ts.querySelectorAll('.segment-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    setTheme(btn.dataset.themeVal);
  });
  setTheme(settings.theme || 'system');

  // Auto-gabung
  const ags = document.getElementById('auto-gabung-switcher');
  function setAutoGabung(val) {
    settings.autoGabung = val === 'on';
    save(K.settings, settings);
    ags.querySelectorAll('.segment-btn').forEach(b => {
      b.classList.toggle('active', (val === 'on' && b.dataset.gabungVal === 'on') || (val === 'off' && b.dataset.gabungVal === 'off'));
      b.style.background = b.classList.contains('active') ? 'var(--accent)' : 'transparent';
      b.style.color = b.classList.contains('active') ? 'var(--text-inv)' : 'var(--text-2)';
    });
  }
  ags.addEventListener('click', e => {
    const btn = e.target.closest('.segment-btn');
    if (!btn) return;
    setAutoGabung(btn.dataset.gabungVal);
  });
  setAutoGabung(settings.autoGabung !== false ? 'on' : 'off');

  // Export
  document.getElementById('btn-export-data').addEventListener('click', () => {
    const data = { settings, bfSessions, pumpingLog, diaperLog, exportedAt: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'feedbuddy-export-' + new Date().toISOString().slice(0, 10) + '.json';
    a.click();
    URL.revokeObjectURL(a.href);
    toast('Data diekspor');
  });

  // Clear all
  document.getElementById('btn-clear-all-data').addEventListener('click', () => {
    if (confirm('Hapus SEMUA data? Tidak bisa dibatalkan.')) {
      bfSessions = []; pumpingLog = []; diaperLog = [];
      save(K.bfSessions, []);
      save(K.pumpingLog, []);
      save(K.diaperLog, []);
      localStorage.removeItem(K.settings);
      toast('Semua data dihapus');
      setTimeout(() => location.reload(), 1000);
    }
  });
}

// ============================================================
// ONBOARDING
// ============================================================
function initOnboarding() {
  const overlay = document.getElementById('onboarding-overlay');
  if (!settings.birthDate) {
    overlay.classList.remove('hidden');
    document.getElementById('tab-panels').style.display = 'none';
  }

  // Gender onboarding — set data-gender immediately on selection
  let selectedGender = settings.gender || 'girl';
  const genderOpts = document.querySelectorAll('.gender-option');
  genderOpts.forEach(btn => {
    btn.addEventListener('click', () => {
      genderOpts.forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      selectedGender = btn.dataset.obGender;
      // Immediately apply so accent colors update right away
      document.documentElement.setAttribute('data-gender', selectedGender);
    });
  });

  document.getElementById('btn-finish-onboarding').addEventListener('click', () => {
    const bd = document.getElementById('onboard-birth-date').value;
    const bn = document.getElementById('onboard-baby-name').value.trim();
    if (!bd) { toast('Mohon isi tanggal lahir'); return; }
    settings.birthDate = bd;
    settings.babyName = bn;
    settings.gender = selectedGender;
    document.documentElement.setAttribute('data-gender', selectedGender);
    save(K.settings, settings);
    overlay.classList.add('hidden');
    document.getElementById('tab-panels').style.display = '';
    document.getElementById('setting-birth-date').value = bd;
    document.getElementById('setting-baby-name').value = bn;
    document.getElementById('setting-gender').value = selectedGender;
    document.getElementById('ui-baby-name').textContent = bn || 'Baby';
    renderFeedingSchedule();
    // Re-apply accent styles after onboarding gender is set
    refreshAccentStyles();
  });
}

// ============================================================
// Dynamic CSS injection (toast, log-item, pulse, combine modal)
// ============================================================
function injectStyles() {
  const s = document.createElement('style');
  s.textContent = `
#toast-container{position:fixed;bottom:calc(72px + env(safe-area-inset-bottom,0px) + var(--sp-4));left:50%;transform:translateX(-50%);z-index:9999;display:flex;flex-direction:column;gap:8px;align-items:center;pointer-events:none;width:calc(100% - 32px);max-width:380px}
.toast{background:var(--text-1);color:var(--text-inv);padding:10px 18px;border-radius:var(--r-full);font-size:0.875rem;font-weight:500;box-shadow:var(--shadow-md);opacity:0;transform:translateY(-8px);transition:opacity 200ms,transform 200ms;pointer-events:auto;text-align:center;width:100%}
.toast.show{opacity:1;transform:translateY(0)}
.log-item{display:flex;align-items:center;justify-content:space-between;padding:var(--sp-3) var(--sp-4);border-bottom:1px solid var(--border-subtle)}
.log-item:last-child{border-bottom:none}
.log-item-left{display:flex;flex-direction:column;gap:2px}
.log-item-title{font-size:0.9rem;font-weight:500;color:var(--text-1)}
.log-item-time{font-size:0.75rem;color:var(--text-3)}
.log-item-value{font-size:0.875rem;font-weight:600}
.pulse-anim{animation:pulse-ring 2s ease-out infinite}
@keyframes pulse-ring{0%{box-shadow:0 0 0 0 var(--accent-shadow)}70%{box-shadow:0 0 0 8px transparent}100%{box-shadow:0 0 0 0 transparent}}
.symptom-btn{background:var(--surface)!important;color:var(--text-1)!important;border:1px solid var(--border)!important}
.segment-btn{transition:background 150ms,color 150ms}
`;
  document.head.appendChild(s);
}

// ============================================================
// FLOATING PLAYER BAR — Spotify-style Now Playing
// ============================================================
let fpInterval = null;
let fpHideTimeout = null; // Track pending hide timeout to prevent race conditions

function showFloatingPlayer() {
  const el = document.getElementById('floating-player');
  if (!el) return;

  // Cancel any pending hide timeout to prevent race condition
  // where setTimeout from hideFloatingPlayer fires after show
  if (fpHideTimeout) {
    clearTimeout(fpHideTimeout);
    fpHideTimeout = null;
  }

  // Always ensure display is restored (handles .hidden class)
  el.style.display = 'flex';

  if (el.classList.contains('hiding')) {
    el.classList.remove('hidden', 'hiding');
    el.style.animation = 'none';
    el.offsetHeight; // reflow
    el.style.animation = '';
  } else {
    // No hiding class — just remove hidden if present
    el.classList.remove('hidden');
  }
}

function hideFloatingPlayer(animate = true) {
  const el = document.getElementById('floating-player');
  if (!el) return;

  // Cancel any pending hide timeout
  if (fpHideTimeout) {
    clearTimeout(fpHideTimeout);
    fpHideTimeout = null;
  }

  if (animate) {
    el.classList.add('hiding');
    fpHideTimeout = setTimeout(() => {
      el.classList.add('hidden');
      el.classList.remove('hiding');
      fpHideTimeout = null;
    }, 250);
  } else {
    el.classList.add('hidden');
  }
  if (fpInterval) { clearInterval(fpInterval); fpInterval = null; }
}

function updateFloatingPlayer() {
  const labelEl = document.getElementById('fp-label');
  const timerEl = document.getElementById('fp-timer');
  const pauseBtn = document.getElementById('fp-pause');
  const stopBtn = document.getElementById('fp-stop');
  const iconSvg = document.getElementById('fp-icon-svg');

  // Detect which timer is running
  if (feedingState.running) {
    const isPaused = feedingState.paused;
    const elapsed = isPaused ? (feedingState.pausedAt - feedingState.startTime) : (Date.now() - feedingState.startTime);
    const side = feedingState.side === 'left' ? 'Kiri' : 'Kanan';
    labelEl.textContent = isPaused ? `Jeda ${side}` : `Menyusu ${side}`;
    timerEl.textContent = formatDur(elapsed);
    // Icon: heart
    iconSvg.innerHTML = '<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>';
    // Pause button → toggle pause/resume
    pauseBtn.onclick = () => {
      if (feedingState.paused) {
        resumeFeedingTimer();
        updateFloatingPlayer();
      } else {
        pauseFeedingTimer();
        updateFloatingPlayer();
      }
    };
    // Pause icon: show ▶ if paused, ⏸ if running
    pauseBtn.innerHTML = isPaused
      ? '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none" width="14" height="14"><polygon points="5,3 19,12 5,21"/></svg>'
      : '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none" width="14" height="14"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>';
    // Stop button: show square icon when running, "SELESAI" text when paused
    if (isPaused) {
      stopBtn.innerHTML = '<span style="font-size:0.7rem;font-weight:700;letter-spacing:0.5px">SELESAI</span>';
    } else {
      stopBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none" width="14" height="14"><rect x="5" y="5" width="14" height="14" rx="2"/></svg>';
    }
    // Stop → stop feeding
    stopBtn.onclick = () => { stopFeedingTimer(); hideFloatingPlayer(); };
    return;
  }

  if (pumpingState.running) {
    const isPaused = pumpingState.paused;
    const elapsed = isPaused ? (pumpingState.pausedAt - pumpingState.startTime) : (Date.now() - pumpingState.startTime);
    const sideLabels = { left: 'Kiri', right: 'Kanan', both: 'Kedua' };
    labelEl.textContent = isPaused ? `Jeda ${sideLabels[pumpingState.side] || ''}` : `Pumping ${sideLabels[pumpingState.side] || ''}`;
    timerEl.textContent = formatDur(elapsed);
    // Icon: cube
    iconSvg.innerHTML = '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>';
    // Pause button → toggle pause/resume
    pauseBtn.onclick = () => {
      if (pumpingState.paused) {
        resumePumpingTimer();
        updateFloatingPlayer();
      } else {
        pausePumpingTimer();
        updateFloatingPlayer();
      }
    };
    // Pause icon: show ▶ if paused, ⏸ if running
    pauseBtn.innerHTML = isPaused
      ? '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none" width="14" height="14"><polygon points="5,3 19,12 5,21"/></svg>'
      : '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none" width="14" height="14"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>';
    // Stop button: show square icon when running, "SELESAI" text when paused
    if (isPaused) {
      stopBtn.innerHTML = '<span style="font-size:0.7rem;font-weight:700;letter-spacing:0.5px">SELESAI</span>';
    } else {
      stopBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none" width="14" height="14"><rect x="5" y="5" width="14" height="14" rx="2"/></svg>';
    }
    // Stop → stop pumping
    stopBtn.onclick = () => { stopPumpingTimer(); hideFloatingPlayer(); };
    return;
  }

  // No timer running
  hideFloatingPlayer();
}

function switchTab(tab) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  document.querySelector(`.tab-btn[data-tab="${tab}"]`)?.classList.add('active');
  document.getElementById('panel-' + tab)?.classList.add('active');
  document.dispatchEvent(new CustomEvent('tabswitch', { detail: { tab } }));
}

function checkFloatingPlayerVisibility() {
  const activeTab = document.querySelector('.tab-btn.active')?.dataset.tab;
  const isTimerTab = activeTab === 'feeding' || activeTab === 'pumping';

  if (feedingState.running || pumpingState.running) {
    if (!isTimerTab) {
      // Timer running but user NOT on timer tab → show bar
      if (!fpInterval) fpInterval = setInterval(updateFloatingPlayer, 1000);
      updateFloatingPlayer();
      showFloatingPlayer();
    } else {
      // On the timer tab → hide bar
      hideFloatingPlayer();
    }
  } else {
    hideFloatingPlayer(false);
  }
}

function initFloatingPlayer() {
  // Click trigger → jump to the right tab
  document.getElementById('fp-trigger').addEventListener('click', () => {
    if (feedingState.running) {
      switchTab('feeding');
    } else if (pumpingState.running) {
      switchTab('pumping');
    }
    hideFloatingPlayer();
  });

  // Visibility change (tab switch / page hide)
  document.addEventListener('visibilitychange', checkFloatingPlayerVisibility);

  // Also listen to tab switches
  document.addEventListener('tabswitch', checkFloatingPlayerVisibility);
}

// ============================================================
// INIT
// ============================================================
function init() {
  injectStyles();
  initTheme();
  initTabs();
  initFloatingPlayer();
  initFeeding();
  initSchedule();
  initPumping();
  initDiaper();
  initOnboarding();
  initSettings();
}

document.addEventListener('DOMContentLoaded', init);
