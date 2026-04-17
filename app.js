/* FeedBuddy — Breastfeeding & Diaper Tracker
   Built on BumpBuddy design system (Geist, OKLCH tokens)
   Storage: localStorage keys — feedbuddy_settings, feedbuddy_bf_sessions, feedbuddy_diaper_log
*/

'use strict';

// ============================================================
// Storage helpers
// ============================================================
const STORAGE_KEYS = {
  settings: 'feedbuddy_settings',
  bfSessions: 'feedbuddy_bf_sessions',
  diaperLog: 'feedbuddy_diaper_log',
};

function loadSettings() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEYS.settings)) || {}; }
  catch { return {}; }
}

function saveSettings(s) {
  localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(s));
}

function loadBFSessions() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEYS.bfSessions)) || []; }
  catch { return []; }
}

function saveBFSessions(sessions) {
  localStorage.setItem(STORAGE_KEYS.bfSessions, JSON.stringify(sessions));
}

function loadDiaperLog() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEYS.diaperLog)) || []; }
  catch { return []; }
}

function saveDiaperLog(log) {
  localStorage.setItem(STORAGE_KEYS.diaperLog, JSON.stringify(log));
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// ============================================================
// State
// ============================================================
let settings = loadSettings();
let bfSessions = loadBFSessions();
let diaperLog = loadDiaperLog();

let aktif = {
  bf: { running: false, startTime: null, side: 'left', elapsed: 0 },
  diaper: { running: false, startTime: null },
};
let bfInterval = null;
let diaperInterval = null;

// ============================================================
// Theme
// ============================================================
function applyTheme(theme) {
  let effective = theme || 'system';
  if (effective === 'system') {
    effective = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  document.body.setAttribute('data-theme', effective);
  settings.theme = theme || 'system';
  saveSettings(settings);
}

function initTheme() {
  applyTheme(settings.theme || 'system');
}

// ============================================================
// Toast
// ============================================================
function showToast(message, duration = 3500) {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  container.appendChild(toast);
  requestAnimationFrame(() => {
    toast.classList.add('show');
  });
  setTimeout(() => {
    toast.classList.remove('show');
    toast.addEventListener('transitionend', () => toast.remove(), { once: true });
  }, duration);
}

// ============================================================
// Tab Navigation
// ============================================================
function initTabs() {
  const nav = document.getElementById('tab-nav');
  if (!nav) return;
  nav.addEventListener('click', (e) => {
    const btn = e.target.closest('.tab-btn');
    if (!btn) return;
    const tab = btn.dataset.tab;
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    const panel = document.getElementById('panel-' + tab);
    if (panel) panel.classList.add('active');
    if (tab === 'riwayat') renderRiwayat();
  });
}

// ============================================================
// Breastfeeding Timer
// ============================================================
function formatDuration(ms) {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function formatMinutes(ms) {
  const totalMin = Math.round(ms / 60000);
  if (totalMin < 60) return `${totalMin}m`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function getTodayBFSessions() {
  const today = new Date().toDateString();
  return bfSessions.filter(s => new Date(s.start).toDateString() === today);
}

function renderBFSessions() {
  const log = document.getElementById('menyusui-log');
  const todaySessions = getTodayBFSessions();

  if (todaySessions.length === 0) {
    log.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 2c0 0-5 6-5 10a5 5 0 1010 0c0-4-5-10-5-10z"/></svg></div>
        <div class="empty-state-title">Belum ada sesi</div>
        <div class="empty-state-desc">Tekan MULAI saat mulai menyusui.</div>
      </div>`;
    return;
  }

  log.innerHTML = todaySessions
    .slice()
    .reverse()
    .map(s => {
      const time = new Date(s.start).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
      const sideLabel = s.side === 'left' ? 'Kiri' : 'Kanan';
      return `
        <div class="log-item">
          <div class="log-item-left">
            <span class="log-item-title">${sideLabel}</span>
            <span class="log-item-time">${time}</span>
          </div>
          <span class="log-item-value teal">${formatDuration(s.duration)}</span>
        </div>`;
    }).join('');
}

function renderBFStats() {
  const todaySessions = getTodayBFSessions();
  const totalDuration = todaySessions.reduce((sum, s) => sum + (s.duration || 0), 0);
  const lastSession = todaySessions[todaySessions.length - 1];

  document.getElementById('stat-bf-sessions').textContent = todaySessions.length;
  document.getElementById('stat-bf-duration').textContent = formatMinutes(totalDuration);
  document.getElementById('stat-bf-last-side').textContent = lastSession
    ? (lastSession.side === 'left' ? 'Kiri' : 'Kanan')
    : '--';
}

function updateBFDisplay() {
  if (!aktif.bf.running) return;
  const elapsed = Date.now() - aktif.bf.startTime;
  aktif.bf.elapsed = elapsed;
  document.getElementById('menyusui-display').textContent = formatDuration(elapsed);
}

function startBFTimer() {
  aktif.bf.running = true;
  aktif.bf.startTime = Date.now();
  aktif.bf.side = aktif.bf.side || 'left';
  aktif.bf.elapsed = 0;
  document.getElementById('menyusui-display').textContent = '00:00';
  document.getElementById('btn-menyusui-text').textContent = 'BERHENTI';
  document.getElementById('btn-menyusui-reset').style.display = '';
  document.getElementById('menyusui-subtitle').textContent = 'Menyusui sisi ' + (aktif.bf.side === 'left' ? 'KIRI' : 'KANAN');
  if (bfInterval) clearInterval(bfInterval);
  bfInterval = setInterval(updateBFDisplay, 1000);
}

function stopBFTimer() {
  if (!aktif.bf.running) return;
  clearInterval(bfInterval);
  bfInterval = null;
  const end = Date.now();
  const duration = end - aktif.bf.startTime;
  aktif.bf.running = false;

  // Save session
  bfSessions.push({
    id: generateId(),
    start: new Date(aktif.bf.startTime).toISOString(),
    end: new Date(end).toISOString(),
    duration,
    side: aktif.bf.side,
  });
  saveBFSessions(bfSessions);

  document.getElementById('btn-menyusui-text').textContent = 'MULAI';
  document.getElementById('menyusui-display').textContent = formatDuration(duration);
  document.getElementById('menyusui-subtitle').textContent = 'Sesi selesai — ' + formatMinutes(duration);
  aktif.bf.elapsed = 0;
  renderBFStats();
  renderBFSessions();
}

function resetBFTimer() {
  clearInterval(bfInterval);
  bfInterval = null;
  aktif.bf.running = false;
  aktif.bf.elapsed = 0;
  document.getElementById('btn-menyusui-text').textContent = 'MULAI';
  document.getElementById('menyusui-display').textContent = '00:00';
  document.getElementById('btn-menyusui-reset').style.display = 'none';
  document.getElementById('menyusui-subtitle').textContent = 'Pilih sisi dan mulai';
}

function initBF() {
  const toggleBtn = document.getElementById('btn-menyusui-toggle');
  const resetBtn = document.getElementById('btn-menyusui-reset');
  const sidePicker = document.getElementById('side-picker');

  toggleBtn.addEventListener('click', () => {
    if (aktif.bf.running) {
      stopBFTimer();
    } else {
      startBFTimer();
    }
  });

  resetBtn.addEventListener('click', () => {
    if (aktif.bf.running || aktif.bf.elapsed > 0) {
      aktif.bf.running = false;
      clearInterval(bfInterval);
      aktif.bf.elapsed = 0;
      document.getElementById('btn-menyusui-text').textContent = 'MULAI';
      document.getElementById('menyusui-display').textContent = '00:00';
      document.getElementById('btn-menyusui-reset').style.display = 'none';
      document.getElementById('menyusui-subtitle').textContent = 'Pilih sisi dan mulai';
    }
  });

  sidePicker.addEventListener('click', (e) => {
    const btn = e.target.closest('.segment-btn');
    if (!btn) return;
    sidePicker.querySelectorAll('.segment-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    aktif.bf.side = btn.dataset.side;
    if (!aktif.bf.running) {
      document.getElementById('menyusui-subtitle').textContent = 'Sisi ' + (aktif.bf.side === 'left' ? 'KIRI' : 'KANAN') + ' — siap mulai';
    }
  });

  document.getElementById('btn-clear-menyusui').addEventListener('click', () => {
    if (confirm('Hapus semua riwayat menyusui?')) {
      bfSessions = [];
      saveBFSessions(bfSessions);
      renderBFStats();
      renderBFSessions();
      showToast('Riwayat menyusui dihapus');
    }
  });

  renderBFStats();
  renderBFSessions();
}

// ============================================================
// Diaper Tracker
// ============================================================
function getTodayDiaperLog() {
  const today = new Date().toDateString();
  return diaperLog.filter(d => new Date(d.timestamp).toDateString() === today);
}

function getLastDiaper() {
  if (diaperLog.length === 0) return null;
  return diaperLog[diaperLog.length - 1];
}

function formatTimeSince(timestamp) {
  const diff = Date.now() - new Date(timestamp).getTime();
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function renderDiaperStats() {
  const todayLog = getTodayDiaperLog();
  const last = getLastDiaper();
  const basahCount = todayLog.filter(d => d.type === 'basah').length;

  document.getElementById('stat-popok-today').textContent = todayLog.length;
  document.getElementById('stat-popok-basah').textContent = basahCount;

  if (last) {
    const time = new Date(last.timestamp);
    document.getElementById('last-popok-time').textContent = time.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
    const typeLabels = { basah: 'Basah', kotor: 'Kotor', campuran: 'Campuran' };
    document.getElementById('last-popok-type').textContent = typeLabels[last.type] || last.type;
    document.getElementById('stat-popok-since').textContent = formatTimeSince(last.timestamp);

    // 4-hour reminder
    const hoursSince = (Date.now() - new Date(last.timestamp).getTime()) / 3600000;
    if (hoursSince >= 4) {
      showToast('Ganti popok sudah 4+ jam!', 5000);
    }
  } else {
    document.getElementById('last-popok-time').textContent = '--';
    document.getElementById('last-popok-type').textContent = '--';
    document.getElementById('stat-popok-since').textContent = '--';
  }
}

function renderDiaperLog() {
  const log = document.getElementById('popok-log');
  const todayLog = getTodayDiaperLog();

  if (todayLog.length === 0) {
    log.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="4"/><path d="M8 12h8"/></svg></div>
        <div class="empty-state-title">Belum ada catatan</div>
        <div class="empty-state-desc">Tekan Basah, Kotor, atau Campuran untuk mencatat.</div>
      </div>`;
    return;
  }

  const typeColors = { basah: 'var(--teal)', kotor: 'var(--warning)', campuran: 'var(--accent)' };
  const typeLabels = { basah: 'Basah', kotor: 'Kotor', campuran: 'Campuran' };

  log.innerHTML = todayLog
    .slice()
    .reverse()
    .map(d => {
      const time = new Date(d.timestamp).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
      return `
        <div class="log-item">
          <div class="log-item-left">
            <span class="log-item-title">${typeLabels[d.type] || d.type}</span>
            <span class="log-item-time">${time}</span>
          </div>
          <span class="log-item-value" style="color:${typeColors[d.type] || 'var(--accent)'}">●</span>
        </div>`;
    }).join('');
}

function logDiaper(type) {
  diaperLog.push({
    id: generateId(),
    timestamp: new Date().toISOString(),
    type,
  });
  saveDiaperLog(diaperLog);
  showToast('Popok dicatat: ' + { basah: 'Basah', kotor: 'Kotor', campuran: 'Campuran' }[type]);
  renderDiaperStats();
  renderDiaperLog();
}

function initDiaper() {
  const grid = document.getElementById('popok-type-grid');
  grid.addEventListener('click', (e) => {
    const btn = e.target.closest('.symptom-btn');
    if (!btn) return;
    logDiaper(btn.dataset.type);
  });

  document.getElementById('btn-clear-popok').addEventListener('click', () => {
    if (confirm('Hapus semua riwayat popok?')) {
      diaperLog = [];
      saveDiaperLog(diaperLog);
      renderDiaperStats();
      renderDiaperLog();
      showToast('Riwayat popok dihapus');
    }
  });

  renderDiaperStats();
  renderDiaperLog();
}

// ============================================================
// Riwayat (Combined History)
// ============================================================
function renderRiwayat() {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const todaySessions = bfSessions.filter(s => new Date(s.start).toDateString() === today.toDateString());
  const yesterdaySessions = bfSessions.filter(s => new Date(s.start).toDateString() === yesterday.toDateString());

  const todayDiaper = diaperLog.filter(d => new Date(d.timestamp).toDateString() === today.toDateString());
  const yesterdayDiaper = diaperLog.filter(d => new Date(d.timestamp).toDateString() === yesterday.toDateString());

  function renderDayLog(sessions, diapers) {
    const items = [
      ...sessions.map(s => ({
        time: new Date(s.start),
        label: 'Menyusui ' + (s.side === 'left' ? 'Kiri' : 'Kanan'),
        value: formatDuration(s.duration),
        type: 'bf',
      })),
      ...diapers.map(d => ({
        time: new Date(d.timestamp),
        label: 'Popok ' + { basah: 'Basah', kotor: 'Kotor', campuran: 'Campuran' }[d.type],
        value: '',
        type: 'diaper',
      })),
    ].sort((a, b) => b.time - a.time);

    if (items.length === 0) return '<div class="empty-state"><div class="empty-state-title" style="font-size:0.85rem;">Tidak ada data</div></div>';

    return items.map(item => {
      const timeStr = item.time.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
      return `
        <div class="log-item">
          <div class="log-item-left">
            <span class="log-item-title">${item.label}</span>
            <span class="log-item-time">${timeStr}</span>
          </div>
          ${item.value ? `<span class="log-item-value teal">${item.value}</span>` : ''}
        </div>`;
    }).join('');
  }

  document.getElementById('riwayat-today-log').innerHTML = renderDayLog(todaySessions, todayDiaper);
  document.getElementById('riwayat-yesterday-log').innerHTML = renderDayLog(yesterdaySessions, yesterdayDiaper);
}

// ============================================================
// Hero — Baby Age
// ============================================================
function renderHero() {
  const birthDateStr = settings.birthDate || '2026-04-14';
  const birthDate = new Date(birthDateStr + 'T00:00:00');
  const now = new Date();
  const diffMs = now - birthDate;
  const totalDays = Math.floor(diffMs / 86400000);
  const weeks = Math.floor(totalDays / 7);
  const days = totalDays % 7;

  document.getElementById('hero-date-display').textContent = totalDays + ' hari';
  document.getElementById('hero-subtitle').textContent = weeks + ' minggu ' + days + ' hari';
  document.getElementById('ui-baby-name').textContent = settings.babyName || 'Baby';
}

// ============================================================
// Settings
// ============================================================
function initSettings() {
  const birthDateInput = document.getElementById('setting-birth-date');
  const babyNameInput = document.getElementById('setting-baby-name');
  const themeSwitcher = document.getElementById('theme-switcher');

  birthDateInput.value = settings.birthDate || '2026-04-14';
  babyNameInput.value = settings.babyName || '';

  birthDateInput.addEventListener('change', () => {
    settings.birthDate = birthDateInput.value;
    saveSettings(settings);
    renderHero();
    showToast('Tanggal lahir disimpan');
  });

  babyNameInput.addEventListener('change', () => {
    settings.babyName = babyNameInput.value;
    saveSettings(settings);
    document.getElementById('ui-baby-name').textContent = settings.babyName || 'Baby';
    showToast('Nama bayi disimpan');
  });

  themeSwitcher.addEventListener('click', (e) => {
    const btn = e.target.closest('.segment-btn');
    if (!btn) return;
    themeSwitcher.querySelectorAll('.segment-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    applyTheme(btn.dataset.themeVal);
  });

  // Set active theme button
  const currentTheme = settings.theme || 'system';
  themeSwitcher.querySelectorAll('.segment-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.themeVal === currentTheme);
  });

  // Export
  document.getElementById('btn-export-data').addEventListener('click', () => {
    const data = {
      settings,
      bfSessions,
      diaperLog,
      exportedAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'feedbuddy-export-' + new Date().toISOString().slice(0, 10) + '.json';
    a.click();
    URL.revokeObjectURL(url);
    showToast('Data diekspor');
  });

  // Clear all
  document.getElementById('btn-clear-all-data').addEventListener('click', () => {
    if (confirm('Hapus SEMUA data? Ini tidak bisa dibatalkan.')) {
      bfSessions = [];
      diaperLog = [];
      saveBFSessions([]);
      saveDiaperLog([]);
      localStorage.removeItem(STORAGE_KEYS.settings);
      settings = {};
      showToast('Semua data dihapus');
      setTimeout(() => location.reload(), 1000);
    }
  });
}

// ============================================================
// Onboarding
// ============================================================
function initOnboarding() {
  const overlay = document.getElementById('onboarding-overlay');
  const birthDateInput = document.getElementById('onboard-birth-date');
  const babyNameInput = document.getElementById('onboard-baby-name');
  const finishBtn = document.getElementById('btn-finish-onboarding');

  if (!settings.birthDate) {
    overlay.classList.remove('hidden');
    document.getElementById('tab-panels').style.display = 'none';
  }

  finishBtn.addEventListener('click', () => {
    const birthDate = birthDateInput.value;
    const babyName = babyNameInput.value.trim();
    if (!birthDate) {
      showToast('Mohon isi tanggal lahir');
      return;
    }
    settings.birthDate = birthDate;
    settings.babyName = babyName;
    saveSettings(settings);
    overlay.classList.add('hidden');
    document.getElementById('tab-panels').style.display = '';
    renderHero();
    document.getElementById('setting-birth-date').value = birthDate;
    document.getElementById('setting-baby-name').value = babyName;
    document.getElementById('ui-baby-name').textContent = babyName || 'Baby';
  });
}

// ============================================================
// CSS: add toast + log-item styles (injected, BumpBuddy CSS doesn't have these)
// ============================================================
function injectDynamicStyles() {
  const style = document.createElement('style');
  style.textContent = `
/* Toast */
#toast-container { position: fixed; top: calc(60px + env(safe-area-inset-top, 0px)); left: 50%; transform: translateX(-50%); z-index: 9999; display: flex; flex-direction: column; gap: 8px; align-items: center; pointer-events: none; width: calc(100% - 32px); max-width: 380px; }
.toast {
  background: var(--text-1);
  color: var(--text-inv);
  padding: 10px 18px;
  border-radius: var(--r-full);
  font-size: 0.875rem;
  font-weight: 500;
  box-shadow: var(--shadow-md);
  opacity: 0;
  transform: translateY(-8px);
  transition: opacity 200ms var(--ease-out), transform 200ms var(--ease-out);
  pointer-events: auto;
  text-align: center;
  width: 100%;
}
.toast.show { opacity: 1; transform: translateY(0); }

/* Log items */
.log-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--sp-3) var(--sp-4);
  border-bottom: 1px solid var(--border-subtle);
}
.log-item:last-child { border-bottom: none; }
.log-item-left { display: flex; flex-direction: column; gap: 2px; }
.log-item-title { font-size: 0.9rem; font-weight: 500; color: var(--text-1); }
.log-item-time { font-size: 0.75rem; color: var(--text-3); }
.log-item-value { font-size: 0.875rem; font-weight: 600; }

/* Pulse anim on btn-primary */
.pulse-anim { animation: pulse-ring 2s ease-out infinite; }
@keyframes pulse-ring {
  0% { box-shadow: 0 0 0 0 var(--accent-shadow); }
  70% { box-shadow: 0 0 0 8px transparent; }
  100% { box-shadow: 0 0 0 0 transparent; }
}

/* BumpBuddy doesn't have --info var, override symptom-btn */
.symptom-btn { background: var(--surface) !important; color: var(--text-1) !important; }

/* Side picker full width */
#side-picker { display: flex; gap: 0; border: 1px solid var(--border); border-radius: var(--r-full); overflow: hidden; background: var(--bg-grouped); }
#side-picker .segment-btn { border-radius: 0 !important; border: none !important; background: transparent !important; color: var(--text-2) !important; font-size: 0.875rem; padding: var(--sp-3) var(--sp-4); }
#side-picker .segment-btn.active { background: var(--accent) !important; color: var(--text-inv) !important; font-weight: 600; }
`;
  document.head.appendChild(style);
}

// ============================================================
// Init
// ============================================================
function init() {
  injectDynamicStyles();
  initTheme();
  initTabs();
  initBF();
  initDiaper();
  initSettings();
  initOnboarding();
  renderHero();
}

document.addEventListener('DOMContentLoaded', init);
