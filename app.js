'use strict';

// =============================================
// FEEDBUDDY — app.js
// Breastfeeding & Diaper tracking PWA
// =============================================

// --- STORAGE KEYS ---
const STORAGE = {
  SETTINGS: 'feedbuddy_settings',
  BF_SESSIONS: 'feedbuddy_bf_sessions',
  DIAPER_LOG: 'feedbuddy_diaper_log',
};

// --- STATE ---
const state = {
  settings: {
    babyName: 'Baby',
    birthDate: '',
    theme: 'system',
  },
  bf: {
    active: false,
    startTime: null,
    elapsed: 0,
    side: 'right',
    timerInterval: null,
  },
  diaper: {
    lastChange: null,
    reminderTimeout: null,
  },
};

// =============================================
// UTILITIES
// =============================================

function getStorage(key) {
  try {
    return JSON.parse(localStorage.getItem(key)) || null;
  } catch {
    return null;
  }
}

function setStorage(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function formatDuration(seconds) {
  if (seconds < 60) return `${seconds}d`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function formatTime(date) {
  return new Intl.DateTimeFormat('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: 'short',
  }).format(new Date(date));
}

function formatTimeSince(date) {
  const now = Date.now();
  const diff = Math.floor((now - new Date(date).getTime()) / 1000);
  if (diff < 60) return `${diff}d lalu`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m lalu`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}j lalu`;
  return `${Math.floor(diff / 86400)}h lalu`;
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// =============================================
// THEME
// =============================================

function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === 'system') {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    root.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
  } else {
    root.setAttribute('data-theme', theme);
  }
}

function initTheme() {
  applyTheme(state.settings.theme);
  document.querySelectorAll('[data-theme-val]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.themeVal === state.settings.theme);
  });
}

// =============================================
// SETTINGS
// =============================================

function loadSettings() {
  const saved = getStorage(STORAGE.SETTINGS);
  if (saved) {
    state.settings = { ...state.settings, ...saved };
  }
  // If no birth date, default to Giyara's birthday
  if (!state.settings.birthDate) {
    state.settings.birthDate = '2026-04-14';
  }
}

function saveSettings() {
  setStorage(STORAGE.SETTINGS, state.settings);
  updateBabyNameUI();
}

function updateBabyNameUI() {
  document.getElementById('ui-baby-name').textContent = state.settings.babyName;
  document.getElementById('setting-baby-name').value = state.settings.babyName;
  document.getElementById('setting-birth-date').value = state.settings.birthDate;
}

// =============================================
// TAB NAVIGATION
// =============================================

function initTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(`panel-${tab}`).classList.add('active');
      if (tab === 'history') renderHistory();
    });
  });
}

// =============================================
// BREASTFEEDING
// =============================================

function initBF() {
  // Load saved sessions
  const sessions = getStorage(STORAGE.BF_SESSIONS) || [];
  renderBFLog(sessions);
  updateBFStats(sessions);

  // Side picker
  document.querySelectorAll('.side-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.side-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      state.bf.side = btn.dataset.side;
    });
  });

  // Toggle button
  document.getElementById('btn-bf-toggle').addEventListener('click', toggleBFTimer);
  document.getElementById('btn-bf-reset').addEventListener('click', resetBFTimer);
  document.getElementById('btn-clear-bf').addEventListener('click', clearBFSessions);
}

function toggleBFTimer() {
  if (state.bf.active) {
    stopBFSession();
  } else {
    startBFSession();
  }
}

function startBFSession() {
  state.bf.active = true;
  state.bf.startTime = Date.now();
  state.bf.elapsed = 0;

  const btn = document.getElementById('btn-bf-toggle');
  const btnText = document.getElementById('btn-bf-text');
  const resetBtn = document.getElementById('btn-bf-reset');
  const subtitle = document.getElementById('bf-timer-subtitle');

  btn.classList.add('active');
  btnText.textContent = 'BERHENTI';
  resetBtn.style.display = 'inline-flex';
  subtitle.textContent = `Menyusui sisi ${state.bf.side === 'right' ? 'kanan' : 'kiri'}...`;

  document.getElementById('side-picker').classList.add('hidden');

  state.bf.timerInterval = setInterval(() => {
    state.bf.elapsed = Math.floor((Date.now() - state.bf.startTime) / 1000);
    document.getElementById('bf-timer-display').textContent = formatDuration(state.bf.elapsed);
  }, 1000);
}

function stopBFSession() {
  clearInterval(state.bf.timerInterval);
  const duration = state.bf.elapsed;
  const session = {
    id: generateId(),
    start: state.bf.startTime,
    end: Date.now(),
    duration,
    side: state.bf.side,
  };

  const sessions = getStorage(STORAGE.BF_SESSIONS) || [];
  sessions.unshift(session);
  setStorage(STORAGE.BF_SESSIONS, sessions);

  state.bf.active = false;
  state.bf.elapsed = 0;
  state.bf.startTime = null;

  const btn = document.getElementById('btn-bf-toggle');
  const btnText = document.getElementById('btn-bf-text');
  const resetBtn = document.getElementById('btn-bf-reset');
  const subtitle = document.getElementById('bf-timer-subtitle');

  btn.classList.remove('active');
  btnText.textContent = 'MULAI';
  resetBtn.style.display = 'none';
  subtitle.textContent = 'Tekan mulai saat bayi mulai menyusu';
  document.getElementById('bf-timer-display').textContent = '00:00';
  document.getElementById('side-picker').classList.remove('hidden');

  renderBFLog(sessions);
  updateBFStats(sessions);
}

function resetBFTimer() {
  clearInterval(state.bf.timerInterval);
  state.bf.active = false;
  state.bf.elapsed = 0;
  state.bf.startTime = null;

  const btn = document.getElementById('btn-bf-toggle');
  const btnText = document.getElementById('btn-bf-text');
  const resetBtn = document.getElementById('btn-bf-reset');
  const subtitle = document.getElementById('bf-timer-subtitle');

  btn.classList.remove('active');
  btnText.textContent = 'MULAI';
  resetBtn.style.display = 'none';
  subtitle.textContent = 'Tekan mulai saat bayi mulai menyusu';
  document.getElementById('bf-timer-display').textContent = '00:00';
  document.getElementById('side-picker').classList.remove('hidden');
}

function clearBFSessions() {
  if (!confirm('Hapus semua riwayat menyusui?')) return;
  setStorage(STORAGE.BF_SESSIONS, []);
  renderBFLog([]);
  updateBFStats([]);
}

function updateBFStats(sessions) {
  const today = new Date().toDateString();
  const todaySessions = sessions.filter(s => new Date(s.start).toDateString() === today);
  const totalSeconds = todaySessions.reduce((sum, s) => sum + (s.duration || 0), 0);

  const el = document.getElementById('bf-stats');
  if (sessions.length === 0) {
    el.classList.add('hidden');
    return;
  }
  el.classList.remove('hidden');

  document.getElementById('stat-bf-today').textContent = todaySessions.length;
  const m = Math.floor(totalSeconds / 60);
  document.getElementById('stat-bf-total').textContent = m < 60 ? `${m}m` : `${Math.floor(m/60)}j ${m%60}m`;
}

function renderBFLog(sessions) {
  const container = document.getElementById('bf-log');
  if (sessions.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2h8l2 6H6L8 2z"/><path d="M6 8v14c0 1 1 2 2 2h8c1 0 2-1 2-2V8"/></svg></div>
        <div class="empty-state-title">Belum ada sesi</div>
        <div class="empty-state-desc">Tekan MULAI saat bayi mulai menyusu.</div>
      </div>`;
    return;
  }

  const html = sessions.slice(0, 20).map(s => `
    <div class="log-entry">
      <div class="log-entry-icon bf">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2h8l2 6H6L8 2z"/><path d="M6 8v14c0 1 1 2 2 2h8c1 0 2-1 2-2V8"/></svg>
      </div>
      <div class="log-entry-body">
        <div class="log-entry-title">Menyusui ${s.side === 'right' ? 'Kanan' : 'Kiri'}</div>
        <div class="log-entry-meta">${formatDuration(s.duration)} menit</div>
      </div>
      <div class="log-entry-time">${formatTime(s.start)}</div>
    </div>`).join('');
  container.innerHTML = html;
}

// =============================================
// DIAPER
// =============================================

function initDiaper() {
  loadDiaperState();
  setupDiaperReminder();
  renderDiaperLog();

  document.querySelectorAll('.diaper-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const type = btn.dataset.type;
      logDiaper(type);
    });
  });

  document.getElementById('btn-clear-diaper').addEventListener('click', clearDiaperLog);
}

function loadDiaperState() {
  const last = getStorage('feedbuddy_last_diaper');
  if (last) {
    state.diaper.lastChange = new Date(last);
    updateLastDiaperDisplay();
    checkDiaperReminder();
  }
}

function logDiaper(type) {
  const entry = {
    id: generateId(),
    time: Date.now(),
    type,
  };

  const log = getStorage(STORAGE.DIAPER_LOG) || [];
  log.unshift(entry);
  setStorage(STORAGE.DIAPER_LOG, log);
  setStorage('feedbuddy_last_diaper', entry.time);

  state.diaper.lastChange = new Date(entry.time);
  updateLastDiaperDisplay();
  setupDiaperReminder();
  renderDiaperLog();

  // Visual feedback
  const btn = document.querySelector(`.diaper-btn[data-type="${type}"]`);
  btn.classList.add('selected');
  setTimeout(() => btn.classList.remove('selected'), 800);
}

function updateLastDiaperDisplay() {
  const el = document.getElementById('last-diaper-time');
  if (!state.diaper.lastChange) {
    el.textContent = '--';
    return;
  }
  el.textContent = formatTimeSince(state.diaper.lastChange);
}

function setupDiaperReminder() {
  if (state.diaper.reminderTimeout) {
    clearTimeout(state.diaper.reminderTimeout);
  }
  checkDiaperReminder();
}

function checkDiaperReminder() {
  const reminder = document.getElementById('diaper-reminder');
  if (!state.diaper.lastChange) {
    reminder.classList.add('hidden');
    return;
  }

  const check = () => {
    const elapsed = (Date.now() - state.diaper.lastChange.getTime()) / 1000 / 60; // minutes
    updateLastDiaperDisplay();

    if (elapsed >= 240) { // 4 hours
      reminder.classList.remove('hidden');
      document.getElementById('reminder-text').textContent =
        elapsed >= 480 ? `Sudah ${Math.floor(elapsed/60)} jam` : 'Sudah lebih dari 4 jam';
    } else {
      reminder.classList.add('hidden');
    }

    // Check again in 5 minutes
    state.diaper.reminderTimeout = setTimeout(check, 5 * 60 * 1000);
  };

  check();
}

function clearDiaperLog() {
  if (!confirm('Hapus semua riwayat popok?')) return;
  setStorage(STORAGE.DIAPER_LOG, []);
  setStorage('feedbuddy_last_diaper', null);
  state.diaper.lastChange = null;
  document.getElementById('last-diaper-time').textContent = '--';
  document.getElementById('diaper-reminder').classList.add('hidden');
  renderDiaperLog();
}

function renderDiaperLog() {
  const container = document.getElementById('diaper-log');
  const log = getStorage(STORAGE.DIAPER_LOG) || [];

  if (log.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="6" width="18" height="12" rx="4"/><path d="M7 6V4c0-1 1-2 2-2h6c1 0 2 1 2 2v2"/></svg></div>
        <div class="empty-state-title">Belum ada catatan</div>
        <div class="empty-state-desc">Ketuk tombol di atas untuk mencatat.</div>
      </div>`;
    return;
  }

  const typeLabels = { wet: 'Basah', poop: 'Kotor', mixed: 'Campuran' };
  const typeIcons = {
    wet: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2c0 0-5 6-5 10a5 5 0 1010 0c0-4-5-10-5-10z"/></svg>',
    poop: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 12h8"/></svg>',
    mixed: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2c0 0-5 6-5 10a5 5 0 1010 0c0-4-5-10-5-10z"/><circle cx="12" cy="12" r="4"/></svg>',
  };

  const html = log.slice(0, 20).map(e => `
    <div class="log-entry">
      <div class="log-entry-icon ${e.type}">
        ${typeIcons[e.type]}
      </div>
      <div class="log-entry-body">
        <div class="log-entry-title">Popok ${typeLabels[e.type]}</div>
      </div>
      <div class="log-entry-time">${formatTime(e.time)}</div>
    </div>`).join('');
  container.innerHTML = html;
}

// =============================================
// HISTORY
// =============================================

function renderHistory() {
  const container = document.getElementById('history-list');
  const bfSessions = getStorage(STORAGE.BF_SESSIONS) || [];
  const diaperLog = getStorage(STORAGE.DIAPER_LOG) || [];

  // Combine and sort by time
  const combined = [
    ...bfSessions.map(s => ({ id: s.id, type: 'bf', time: s.start, data: s, sortTime: s.start })),
    ...diaperLog.map(e => ({ id: e.id, type: 'diaper', time: e.time, data: e, sortTime: e.time })),
  ].sort((a, b) => b.sortTime - a.sortTime);

  document.getElementById('history-count').textContent = `${combined.length} entri`;

  if (combined.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg></div>
        <div class="empty-state-title">Belum ada aktivitas</div>
        <div class="empty-state-desc">Riwayat akan muncul setelah mencatat.</div>
      </div>`;
    return;
  }

  const typeLabels = { wet: 'Basah', poop: 'Kotor', mixed: 'Campuran' };
  const typeIcons = {
    wet: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2c0 0-5 6-5 10a5 5 0 1010 0c0-4-5-10-5-10z"/></svg>',
    poop: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 12h8"/></svg>',
    mixed: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2c0 0-5 6-5 10a5 5 0 1010 0c0-4-5-10-5-10z"/><circle cx="12" cy="12" r="4"/></svg>',
  };

  const html = combined.slice(0, 20).map(entry => {
    if (entry.type === 'bf') {
      const s = entry.data;
      return `
      <div class="log-entry">
        <div class="log-entry-icon bf">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2h8l2 6H6L8 2z"/><path d="M6 8v14c0 1 1 2 2 2h8c1 0 2-1 2-2V8"/></svg>
        </div>
        <div class="log-entry-body">
          <div class="log-entry-title">Menyusui ${s.side === 'right' ? 'Kanan' : 'Kiri'}</div>
          <div class="log-entry-meta">${formatDuration(s.duration)}</div>
        </div>
        <div class="log-entry-time">${formatTime(s.start)}</div>
      </div>`;
    } else {
      const e = entry.data;
      return `
      <div class="log-entry">
        <div class="log-entry-icon ${e.type}">
          ${typeIcons[e.type]}
        </div>
        <div class="log-entry-body">
          <div class="log-entry-title">Popok ${typeLabels[e.type]}</div>
        </div>
        <div class="log-entry-time">${formatTime(e.time)}</div>
      </div>`;
    }
  }).join('');

  container.innerHTML = html;
}

// =============================================
// SETTINGS PANEL
// =============================================

function initSettings() {
  updateBabyNameUI();

  document.getElementById('setting-baby-name').addEventListener('input', e => {
    state.settings.babyName = e.target.value || 'Baby';
    saveSettings();
  });

  document.getElementById('setting-birth-date').addEventListener('change', e => {
    state.settings.birthDate = e.target.value;
    saveSettings();
  });

  // Theme switcher
  document.querySelectorAll('[data-theme-val]').forEach(btn => {
    btn.addEventListener('click', () => {
      state.settings.theme = btn.dataset.themeVal;
      saveSettings();
      applyTheme(state.settings.theme);
      document.querySelectorAll('[data-theme-val]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  // Export data
  document.getElementById('btn-export-data').addEventListener('click', exportData);

  // Clear all data
  document.getElementById('btn-clear-all-data').addEventListener('click', () => {
    if (!confirm('Hapus SEMUA data? Ini tidak bisa dibatalkan.')) return;
    localStorage.removeItem(STORAGE.SETTINGS);
    localStorage.removeItem(STORAGE.BF_SESSIONS);
    localStorage.removeItem(STORAGE.DIAPER_LOG);
    localStorage.removeItem('feedbuddy_last_diaper');
    location.reload();
  });
}

function exportData() {
  const data = {
    settings: getStorage(STORAGE.SETTINGS),
    bfSessions: getStorage(STORAGE.BF_SESSIONS),
    diaperLog: getStorage(STORAGE.DIAPER_LOG),
    exportedAt: new Date().toISOString(),
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `feedbuddy-export-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// =============================================
// SERVICE WORKER
// =============================================

function registerSW() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

// =============================================
// INIT
// =============================================

document.addEventListener('DOMContentLoaded', () => {
  loadSettings();
  initTheme();
  initTabs();
  initBF();
  initDiaper();
  initSettings();
  registerSW();
});
