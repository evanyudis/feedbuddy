'use strict';

// =============================================
// FEEDBUDDY — app.js v2
// Emil Kowalski Edition
// =============================================

const STORAGE = {
  SETTINGS: 'feedbuddy_settings',
  BF_SESSIONS: 'feedbuddy_bf_sessions',
  DIAPER_LOG: 'feedbuddy_diaper_log',
};

const state = {
  settings: { babyName: 'Baby', birthDate: '2026-04-14', theme: 'system' },
  bf: { active: false, startTime: null, elapsed: 0, side: 'right', timerInterval: null },
  diaper: { lastChange: null, reminderTimeout: null },
};

// =============================================
// UTILITIES
// =============================================

const getStorage = k => { try { return JSON.parse(localStorage.getItem(k)) || null; } catch { return null; } };
const setStorage = (k, v) => localStorage.setItem(k, JSON.stringify(v));

const formatDuration = s => {
  if (s < 60) return `${s}d`;
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
};

const formatTime = date => new Intl.DateTimeFormat('id-ID', {
  hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short'
}).format(new Date(date));

const formatTimeSince = date => {
  const diff = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (diff < 60) return `${diff}d`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}j`;
  return `${Math.floor(diff / 86400)}h`;
};

const generateId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

// =============================================
// THEME
// =============================================

const applyTheme = theme => {
  const root = document.documentElement;
  root.setAttribute('data-theme', theme === 'system'
    ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    : theme);
};

const initTheme = () => {
  applyTheme(state.settings.theme);
  document.querySelectorAll('[data-theme-val]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.themeVal === state.settings.theme);
  });
};

// =============================================
// SETTINGS
// =============================================

const loadSettings = () => {
  const saved = getStorage(STORAGE.SETTINGS);
  if (saved) state.settings = { ...state.settings, ...saved };
};

const saveSettings = () => {
  setStorage(STORAGE.SETTINGS, state.settings);
  document.getElementById('ui-baby-name').textContent = state.settings.babyName;
};

const updateBabyNameUI = () => {
  document.getElementById('ui-baby-name').textContent = state.settings.babyName;
  document.getElementById('setting-baby-name').value = state.settings.babyName;
  document.getElementById('setting-birth-date').value = state.settings.birthDate;
};

// =============================================
// TABS
// =============================================

const initTabs = () => {
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
};

// =============================================
// BREASTFEEDING
// =============================================

const initBF = () => {
  const sessions = getStorage(STORAGE.BF_SESSIONS) || [];
  renderBFLog(sessions);
  updateBFStats(sessions);

  document.querySelectorAll('.side-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.side-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      state.bf.side = btn.dataset.side;
      document.getElementById('bf-side-label').textContent =
        `Sisi ${btn.dataset.side === 'right' ? 'kanan' : 'kiri'}`;
    });
  });

  document.getElementById('btn-bf-toggle').addEventListener('click', toggleBFTimer);
  document.getElementById('btn-bf-reset').addEventListener('click', resetBFTimer);
  document.getElementById('btn-clear-bf').addEventListener('click', () => {
    if (confirm('Hapus semua riwayat menyusui?')) {
      setStorage(STORAGE.BF_SESSIONS, []);
      renderBFLog([]);
      updateBFStats([]);
    }
  });
};

const toggleBFTimer = () => state.bf.active ? stopBFSession() : startBFSession();

const startBFSession = () => {
  state.bf.active = true;
  state.bf.startTime = Date.now();
  state.bf.elapsed = 0;

  const btn = document.getElementById('btn-bf-toggle');
  btn.classList.add('active');
  btn.textContent = 'Berhenti';
  document.getElementById('btn-bf-reset').classList.remove('hidden');
  document.getElementById('side-picker').classList.add('hidden');
  document.getElementById('bf-timer-label').textContent = `Menyusui ${state.bf.side === 'right' ? 'kanan' : 'kiri'}...`;
  document.getElementById('bf-timer-display').classList.add('active');

  state.bf.timerInterval = setInterval(() => {
    state.bf.elapsed = Math.floor((Date.now() - state.bf.startTime) / 1000);
    document.getElementById('bf-timer-display').textContent = formatDuration(state.bf.elapsed);
  }, 1000);
};

const stopBFSession = () => {
  clearInterval(state.bf.timerInterval);
  const session = {
    id: generateId(),
    start: state.bf.startTime,
    end: Date.now(),
    duration: state.bf.elapsed,
    side: state.bf.side,
  };

  const sessions = getStorage(STORAGE.BF_SESSIONS) || [];
  sessions.unshift(session);
  setStorage(STORAGE.BF_SESSIONS, sessions);

  state.bf.active = false;
  state.bf.elapsed = 0;
  state.bf.startTime = null;

  const btn = document.getElementById('btn-bf-toggle');
  btn.classList.remove('active');
  btn.textContent = 'Mulai';
  document.getElementById('btn-bf-reset').classList.add('hidden');
  document.getElementById('side-picker').classList.remove('hidden');
  document.getElementById('bf-timer-label').textContent = 'Selesai';
  document.getElementById('bf-timer-display').textContent = '00:00';
  document.getElementById('bf-timer-display').classList.remove('active');
  document.getElementById('bf-side-label').textContent = 'Sisi kanan';

  renderBFLog(sessions);
  updateBFStats(sessions);
};

const resetBFTimer = () => {
  clearInterval(state.bf.timerInterval);
  state.bf.active = false;
  state.bf.elapsed = 0;
  state.bf.startTime = null;

  const btn = document.getElementById('btn-bf-toggle');
  btn.classList.remove('active');
  btn.textContent = 'Mulai';
  document.getElementById('btn-bf-reset').classList.add('hidden');
  document.getElementById('side-picker').classList.remove('hidden');
  document.getElementById('bf-timer-label').textContent = 'Siap dimulai';
  document.getElementById('bf-timer-display').textContent = '00:00';
  document.getElementById('bf-timer-display').classList.remove('active');
};

const updateBFStats = sessions => {
  const today = new Date().toDateString();
  const todaySessions = sessions.filter(s => new Date(s.start).toDateString() === today);
  const totalSeconds = todaySessions.reduce((sum, s) => sum + (s.duration || 0), 0);
  const m = Math.floor(totalSeconds / 60);

  document.getElementById('stat-bf-today').textContent = todaySessions.length;
  document.getElementById('stat-bf-total').textContent = m < 60 ? `${m}m` : `${Math.floor(m/60)}j ${m%60}m`;
};

const renderBFLog = sessions => {
  const container = document.getElementById('bf-log');
  if (sessions.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2h8l2 6H6L8 2z"/><path d="M6 8v14c0 1 1 2 2 2h8c1 0 2-1 2-2V8"/></svg></div>
        <div class="empty-state-title">Belum ada sesi</div>
        <div class="empty-state-desc">Tekan Mulai untuk mulai mencatat.</div>
      </div>`;
    return;
  }

  container.innerHTML = sessions.slice(0, 20).map(s => `
    <div class="log-entry">
      <div class="log-entry-icon bf">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2h8l2 6H6L8 2z"/><path d="M6 8v14c0 1 1 2 2 2h8c1 0 2-1 2-2V8"/></svg>
      </div>
      <div class="log-entry-body">
        <div class="log-entry-title">Menyusui ${s.side === 'right' ? 'Kanan' : 'Kiri'}</div>
        <div class="log-entry-meta">${formatDuration(s.duration)}</div>
      </div>
      <div class="log-entry-time">${formatTime(s.start)}</div>
    </div>`).join('');
};

// =============================================
// DIAPER
// =============================================

const initDiaper = () => {
  const last = getStorage('feedbuddy_last_diaper');
  if (last) {
    state.diaper.lastChange = new Date(last);
    updateLastDiaperDisplay();
  }
  setupDiaperReminder();
  renderDiaperLog();

  document.querySelectorAll('.diaper-btn').forEach(btn => {
    btn.addEventListener('click', () => logDiaper(btn.dataset.type));
  });

  document.getElementById('btn-clear-diaper').addEventListener('click', () => {
    if (confirm('Hapus semua riwayat popok?')) {
      setStorage(STORAGE.DIAPER_LOG, []);
      setStorage('feedbuddy_last_diaper', null);
      state.diaper.lastChange = null;
      document.getElementById('last-diaper-time').textContent = '—';
      document.getElementById('diaper-reminder').classList.add('hidden');
      renderDiaperLog();
    }
  });
};

const logDiaper = type => {
  const entry = { id: generateId(), time: Date.now(), type };
  const log = getStorage(STORAGE.DIAPER_LOG) || [];
  log.unshift(entry);
  setStorage(STORAGE.DIAPER_LOG, log);
  setStorage('feedbuddy_last_diaper', entry.time);

  state.diaper.lastChange = new Date(entry.time);
  updateLastDiaperDisplay();
  setupDiaperReminder();
  renderDiaperLog();
};

const updateLastDiaperDisplay = () => {
  const el = document.getElementById('last-diaper-time');
  el.textContent = state.diaper.lastChange ? formatTimeSince(state.diaper.lastChange) : '—';
};

const setupDiaperReminder = () => {
  if (state.diaper.reminderTimeout) clearTimeout(state.diaper.reminderTimeout);
  checkDiaperReminder();
};

const checkDiaperReminder = () => {
  const reminder = document.getElementById('diaper-reminder');
  if (!state.diaper.lastChange) { reminder.classList.add('hidden'); return; }

  const check = () => {
    const elapsed = (Date.now() - state.diaper.lastChange.getTime()) / 1000 / 60;
    updateLastDiaperDisplay();
    if (elapsed >= 240) {
      reminder.classList.remove('hidden');
      document.getElementById('reminder-text').textContent =
        elapsed >= 480 ? `Sudah ${Math.floor(elapsed/60)} jam` : 'Sudah lebih dari 4 jam';
    } else {
      reminder.classList.add('hidden');
    }
    state.diaper.reminderTimeout = setTimeout(check, 5 * 60 * 1000);
  };
  check();
};

const renderDiaperLog = () => {
  const container = document.getElementById('diaper-log');
  const log = getStorage(STORAGE.DIAPER_LOG) || [];
  const labels = { wet: 'Basah', poop: 'Kotor', mixed: 'Campur' };
  const icons = {
    wet: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2c0 0-5 6-5 10a5 5 0 1010 0c0-4-5-10-5-10z"/></svg>',
    poop: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 12h8"/></svg>',
    mixed: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2c0 0-5 6-5 10a5 5 0 1010 0c0-4-5-10-5-10z"/><circle cx="12" cy="12" r="4"/></svg>',
  };

  if (log.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="6" width="18" height="12" rx="4"/><path d="M7 6V4c0-1 1-2 2-2h6c1 0 2 1 2 2v2"/></svg></div>
        <div class="empty-state-title">Belum ada catatan</div>
        <div class="empty-state-desc">Ketuk tombol di atas untuk mencatat.</div>
      </div>`;
    return;
  }

  container.innerHTML = log.slice(0, 20).map(e => `
    <div class="log-entry">
      <div class="log-entry-icon ${e.type}">${icons[e.type]}</div>
      <div class="log-entry-body">
        <div class="log-entry-title">Popok ${labels[e.type]}</div>
      </div>
      <div class="log-entry-time">${formatTime(e.time)}</div>
    </div>`).join('');
};

// =============================================
// HISTORY
// =============================================

const renderHistory = () => {
  const container = document.getElementById('history-list');
  const bfSessions = getStorage(STORAGE.BF_SESSIONS) || [];
  const diaperLog = getStorage(STORAGE.DIAPER_LOG) || [];

  const combined = [
    ...bfSessions.map(s => ({ id: s.id, type: 'bf', time: s.start, sortTime: s.start, data: s })),
    ...diaperLog.map(e => ({ id: e.id, type: 'diaper', time: e.time, sortTime: e.time, data: e })),
  ].sort((a, b) => b.sortTime - a.sortTime);

  document.getElementById('history-count').textContent = `${combined.length} entri`;

  if (combined.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg></div>
        <div class="empty-state-title">Belum ada aktivitas</div>
        <div class="empty-state-desc">Riwayat akan muncul setelah mencatat.</div>
      </div>`;
    return;
  }

  const labels = { wet: 'Basah', poop: 'Kotor', mixed: 'Campur' };
  const bfIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2h8l2 6H6L8 2z"/><path d="M6 8v14c0 1 1 2 2 2h8c1 0 2-1 2-2V8"/></svg>';
  const typeIcons = {
    wet: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2c0 0-5 6-5 10a5 5 0 1010 0c0-4-5-10-5-10z"/></svg>',
    poop: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 12h8"/></svg>',
    mixed: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2c0 0-5 6-5 10a5 5 0 1010 0c0-4-5-10-5-10z"/><circle cx="12" cy="12" r="4"/></svg>',
  };

  container.innerHTML = combined.slice(0, 20).map(entry => {
    if (entry.type === 'bf') {
      const s = entry.data;
      return `<div class="log-entry">
        <div class="log-entry-icon bf">${bfIcon}</div>
        <div class="log-entry-body">
          <div class="log-entry-title">Menyusui ${s.side === 'right' ? 'Kanan' : 'Kiri'}</div>
          <div class="log-entry-meta">${formatDuration(s.duration)}</div>
        </div>
        <div class="log-entry-time">${formatTime(s.start)}</div>
      </div>`;
    }
    const e = entry.data;
    return `<div class="log-entry">
      <div class="log-entry-icon ${e.type}">${typeIcons[e.type]}</div>
      <div class="log-entry-body">
        <div class="log-entry-title">Popok ${labels[e.type]}</div>
      </div>
      <div class="log-entry-time">${formatTime(e.time)}</div>
    </div>`;
  }).join('');
};

// =============================================
// SETTINGS
// =============================================

const initSettings = () => {
  updateBabyNameUI();

  document.getElementById('setting-baby-name').addEventListener('input', e => {
    state.settings.babyName = e.target.value || 'Baby';
    saveSettings();
  });

  document.getElementById('setting-birth-date').addEventListener('change', e => {
    state.settings.birthDate = e.target.value;
    saveSettings();
  });

  document.querySelectorAll('[data-theme-val]').forEach(btn => {
    btn.addEventListener('click', () => {
      state.settings.theme = btn.dataset.themeVal;
      saveSettings();
      applyTheme(state.settings.theme);
      document.querySelectorAll('[data-theme-val]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  document.getElementById('btn-export-data').addEventListener('click', () => {
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
  });

  document.getElementById('btn-clear-all-data').addEventListener('click', () => {
    if (confirm('Hapus SEMUA data? Tidak bisa dibatalkan.')) {
      localStorage.removeItem(STORAGE.SETTINGS);
      localStorage.removeItem(STORAGE.BF_SESSIONS);
      localStorage.removeItem(STORAGE.DIAPER_LOG);
      localStorage.removeItem('feedbuddy_last_diaper');
      location.reload();
    }
  });
};

// =============================================
// SERVICE WORKER
// =============================================

const registerSW = () => {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
};

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
