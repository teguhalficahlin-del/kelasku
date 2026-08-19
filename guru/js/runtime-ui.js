/**
 * runtime-ui.js — Layar Runtime fullscreen mobile-first.
 * Semua state write ke IndexedDB via RuntimeSession DULU, baru render.
 * ZERO network call selama runtime aktif.
 */
(function () {
  'use strict';

  // ── Module state ─────────────────────────────────────────────────────────────
  let _rtPkg        = null;
  let _rtSession    = null;
  let _rtTimer      = null;
  let _rtSwipeStartX = null;
  let _rtStepStates = {};
  let _navDebounce  = false;
  let _pacingWarnShown = false;
  let _overlay      = null;

  // D4: Connection indicator handlers — stored for removal in endSessionUI
  let _connOnlineHandler  = null;
  let _connOfflineHandler = null;

  // ── CSS injection (once) ─────────────────────────────────────────────────────

  function injectStyles() {
    if (document.getElementById('rt-styles')) return;
    const style = document.createElement('style');
    style.id = 'rt-styles';
    style.textContent = `
/* ── Runtime overlay ── */
#rt-overlay {
  position: fixed; inset: 0; z-index: 9999;
  background: var(--bg-base, #0A0A0F);
  display: flex; flex-direction: column;
  overflow: hidden; touch-action: pan-y;
  font-family: var(--font-sans, system-ui, sans-serif);
  color: var(--text-primary, #F5F0E8);
}
/* Header bar */
.rt-header {
  display: flex; align-items: center; gap: var(--space-sm, 10px);
  padding: var(--space-sm, 10px) var(--space-md, 16px);
  background: var(--bg-surface, #13131A);
  border-bottom: 1px solid var(--border, rgba(212,175,55,0.12));
  flex-shrink: 0;
}
.rt-header-tp {
  font-size: var(--fs-caption, 13px); color: var(--gold, #D4AF37);
  font-weight: var(--fw-semibold, 600); flex: 1;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.rt-header-info {
  font-size: var(--fs-badge, 12px); color: var(--text-secondary, #A89880);
  white-space: nowrap;
}
.rt-header-menu {
  background: transparent; border: none; color: var(--text-secondary, #A89880);
  font-size: 20px; cursor: pointer; padding: 4px 8px;
  min-height: 44px; min-width: 44px; display: flex; align-items: center; justify-content: center;
}
/* Timer bar */
.rt-timer-bar {
  display: flex; align-items: center; gap: var(--space-sm, 10px);
  padding: var(--space-xs, 5px) var(--space-md, 16px);
  background: var(--bg-surface, #13131A);
  border-bottom: 1px solid var(--border, rgba(212,175,55,0.12));
  flex-shrink: 0;
}
.rt-timer-clock {
  font-size: var(--fs-h3, 20px); font-weight: var(--fw-bold, 700);
  color: var(--text-primary, #F5F0E8); font-variant-numeric: tabular-nums;
  min-width: 54px;
}
.rt-timer-remain {
  font-size: var(--fs-caption, 13px); color: var(--text-secondary, #A89880);
}
.rt-timer-warn {
  font-size: var(--fs-badge, 12px); color: var(--warning, #FBBF24);
  background: var(--warning-bg, rgba(251,191,36,0.15));
  padding: 2px 8px; border-radius: 99px;
}
/* Progress bar */
.rt-progress-wrap {
  padding: 0 var(--space-md, 16px) var(--space-xs, 5px);
  background: var(--bg-surface, #13131A);
  border-bottom: 1px solid var(--border, rgba(212,175,55,0.12));
  flex-shrink: 0;
}
.rt-progress-track {
  height: 4px; background: rgba(255,255,255,0.08);
  border-radius: 2px; overflow: hidden;
}
.rt-progress-fill {
  height: 100%; background: var(--gold, #D4AF37);
  border-radius: 2px; transition: width 300ms ease;
}
.rt-progress-label {
  font-size: var(--fs-badge, 12px); color: var(--text-muted, #6B5F50);
  margin-top: 3px;
}
/* Step card */
.rt-card {
  flex: 1; overflow-y: auto; padding: var(--space-md, 16px);
  display: flex; flex-direction: column; gap: var(--space-md, 16px);
}
.rt-phase-badge {
  font-size: var(--fs-badge, 12px); font-weight: var(--fw-medium, 500);
  padding: 3px 10px; border-radius: 99px;
  background: var(--gold-muted, rgba(212,175,55,0.15));
  color: var(--gold, #D4AF37); display: inline-block;
}
.rt-duration-tag {
  font-size: var(--fs-badge, 12px); color: var(--text-muted, #6B5F50);
  display: inline-block; margin-left: 8px;
}
.rt-step-title {
  font-size: var(--fs-h2, 22px); font-weight: var(--fw-bold, 700);
  color: var(--text-primary, #F5F0E8); line-height: var(--lh-tight, 1.2);
  text-transform: uppercase; letter-spacing: 0.02em;
}
.rt-action-block {
  background: var(--bg-surface, #13131A);
  border: 1px solid var(--border, rgba(212,175,55,0.12));
  border-radius: var(--card-r, 12px);
  padding: var(--card-p, 16px);
}
.rt-action-label {
  font-size: var(--fs-badge, 12px); font-weight: var(--fw-semibold, 600);
  color: var(--gold, #D4AF37); text-transform: uppercase; letter-spacing: 0.05em;
  margin-bottom: var(--space-xs, 5px);
}
.rt-action-text {
  font-size: var(--fs-body, 16px); color: var(--text-primary, #F5F0E8);
  line-height: var(--lh-normal, 1.5);
}
.rt-cue-block {
  border-left: 2px solid var(--gold, #D4AF37);
  padding-left: var(--space-md, 16px);
}
.rt-cue-label {
  font-size: var(--fs-badge, 12px); color: var(--text-muted, #6B5F50); margin-bottom: 4px;
}
.rt-cue-text {
  font-size: var(--fs-caption, 13px); color: var(--text-secondary, #A89880);
  line-height: var(--lh-normal, 1.5);
}
/* Quick action chips */
.rt-chips {
  display: flex; flex-wrap: wrap; gap: var(--space-sm, 10px);
}
.rt-chip {
  background: var(--bg-elevated, #1C1C26);
  border: 1px solid var(--border, rgba(212,175,55,0.12));
  border-radius: var(--btn-r, 8px);
  color: var(--text-secondary, #A89880);
  font-size: var(--fs-caption, 13px);
  padding: 0 var(--btn-px-sm, 12px);
  min-height: 44px; cursor: pointer;
  display: flex; align-items: center; gap: 5px;
  transition: background 150ms, border-color 150ms;
}
.rt-chip:hover { background: var(--gold-muted, rgba(212,175,55,0.15)); border-color: var(--gold-border, rgba(212,175,55,0.3)); color: var(--text-primary, #F5F0E8); }
/* Bottom nav */
.rt-bottom {
  flex-shrink: 0;
  padding: var(--space-sm, 10px) var(--space-md, 16px);
  background: var(--bg-surface, #13131A);
  border-top: 1px solid var(--border, rgba(212,175,55,0.12));
  display: flex; flex-direction: column; gap: var(--space-sm, 10px);
}
.rt-btn-next {
  background: var(--gold, #D4AF37); color: var(--text-on-gold, #0A0A0F);
  font-weight: var(--fw-medium, 500); font-size: var(--fs-ui, 16px);
  min-height: var(--btn-h, 52px); border: none; border-radius: var(--btn-r, 8px);
  padding: 0 var(--btn-px, 20px); cursor: pointer; width: 100%;
  transition: background 150ms; display: flex; align-items: center; justify-content: center; gap: 8px;
}
.rt-btn-next:hover { background: var(--gold-hover, #B8960C); }
.rt-btn-next:disabled { opacity: 0.4; cursor: not-allowed; }
.rt-nav-row {
  display: flex; gap: var(--space-sm, 10px); align-items: center;
}
.rt-btn-back, .rt-btn-adjust {
  background: transparent; border: 1.5px solid var(--border-strong, rgba(212,175,55,0.25));
  border-radius: var(--btn-r, 8px); color: var(--text-secondary, #A89880);
  font-size: var(--fs-caption, 13px); min-height: var(--btn-h-sm, 40px);
  padding: 0 var(--btn-px-sm, 12px); cursor: pointer; flex: 1;
  transition: background 150ms; display: flex; align-items: center; justify-content: center; gap: 5px;
}
.rt-btn-back:hover, .rt-btn-adjust:hover { background: rgba(255,255,255,0.05); color: var(--text-primary, #F5F0E8); }
.rt-btn-adjust { color: var(--gold, #D4AF37); border-color: var(--gold-border, rgba(212,175,55,0.3)); }
/* Overlay panel */
.rt-panel {
  position: fixed; inset: 0; z-index: 10000;
  background: var(--bg-overlay, rgba(10,10,15,0.88));
  backdrop-filter: blur(4px);
  display: flex; align-items: flex-end;
}
.rt-panel-inner {
  background: var(--glass, rgba(19,19,26,0.95));
  border: 1px solid var(--glass-border, rgba(212,175,55,0.15));
  border-radius: 16px 16px 0 0;
  box-shadow: var(--shadow-modal, 0 8px 40px rgba(0,0,0,0.7));
  padding: var(--space-lg, 24px) var(--space-md, 16px);
  width: 100%; max-height: 80vh; overflow-y: auto;
  display: flex; flex-direction: column; gap: var(--space-md, 16px);
}
.rt-panel-title {
  font-size: var(--fs-h3, 18px); font-weight: var(--fw-semibold, 600);
  color: var(--gold, #D4AF37); text-transform: uppercase; letter-spacing: 0.05em;
}
.rt-panel-evidence {
  font-size: var(--fs-caption, 13px); color: var(--text-secondary, #A89880);
  line-height: var(--lh-normal, 1.5);
  padding: var(--space-sm, 10px) var(--space-md, 16px);
  background: var(--bg-surface, #13131A);
  border-radius: var(--card-r, 12px);
  border: 1px solid var(--border, rgba(212,175,55,0.12));
}
/* Status buttons in panel */
.rt-status-group {
  display: flex; flex-direction: column; gap: var(--space-sm, 10px);
}
.rt-status-btn {
  background: var(--bg-elevated, #1C1C26);
  border: 1.5px solid var(--border-strong, rgba(212,175,55,0.25));
  border-radius: var(--btn-r, 8px);
  color: var(--text-primary, #F5F0E8);
  font-size: var(--fs-ui, 16px); font-weight: var(--fw-medium, 500);
  min-height: var(--btn-h, 52px); cursor: pointer;
  display: flex; align-items: center; gap: 10px;
  padding: 0 var(--btn-px, 20px);
  transition: background 150ms, border-color 150ms;
}
.rt-status-btn.paham  { border-color: var(--success, #10B981); color: var(--success, #10B981); }
.rt-status-btn.hampir { border-color: var(--warning, #FBBF24); color: var(--warning, #FBBF24); }
.rt-status-btn.belum  { border-color: var(--danger, #F87171);  color: var(--danger, #F87171); }
.rt-status-btn:hover { background: rgba(255,255,255,0.05); }
/* Roster chips */
.rt-roster-grid {
  display: flex; flex-wrap: wrap; gap: var(--space-xs, 5px);
  max-height: 200px; overflow-y: auto;
}
.rt-roster-chip {
  background: var(--bg-elevated, #1C1C26);
  border: 1.5px solid var(--border, rgba(212,175,55,0.12));
  border-radius: var(--btn-r, 8px);
  color: var(--text-secondary, #A89880);
  font-size: var(--fs-caption, 13px);
  padding: 6px 12px; cursor: pointer; min-height: 36px;
  display: flex; align-items: center;
  transition: background 150ms, border-color 150ms;
}
.rt-roster-chip.selected {
  background: var(--gold-muted, rgba(212,175,55,0.15));
  border-color: var(--gold, #D4AF37); color: var(--gold, #D4AF37);
}
/* Snackbar */
.rt-snack {
  position: fixed; bottom: 80px; left: 50%; transform: translateX(-50%);
  z-index: 10001;
  background: var(--bg-elevated, #1C1C26);
  border: 1px solid var(--border-strong, rgba(212,175,55,0.25));
  border-radius: 99px;
  padding: 10px 20px;
  font-size: var(--fs-caption, 13px); color: var(--text-primary, #F5F0E8);
  display: flex; align-items: center; gap: 12px;
  box-shadow: var(--shadow-card, 0 4px 24px rgba(0,0,0,0.5));
  animation: rt-snack-in 150ms ease;
}
@keyframes rt-snack-in { from { opacity:0; transform:translateX(-50%) translateY(8px); } to { opacity:1; transform:translateX(-50%) translateY(0); } }
/* Pre-flight */
.rt-preflight {
  flex: 1; display: flex; flex-direction: column; justify-content: center;
  padding: var(--space-xl, 36px) var(--space-lg, 24px);
  gap: var(--space-lg, 24px);
}
.rt-preflight-label {
  font-size: var(--fs-badge, 12px); color: var(--text-muted, #6B5F50);
  text-transform: uppercase; letter-spacing: 0.08em;
}
.rt-preflight-title {
  font-size: var(--fs-h1, 28px); font-weight: var(--fw-bold, 700);
  color: var(--text-primary, #F5F0E8); line-height: var(--lh-tight, 1.2);
}
.rt-preflight-meta {
  font-size: var(--fs-body, 16px); color: var(--gold, #D4AF37);
}
.rt-preflight-prep {
  background: var(--bg-surface, #13131A);
  border: 1px solid var(--border, rgba(212,175,55,0.12));
  border-radius: var(--card-r, 12px);
  padding: var(--card-p, 16px);
}
.rt-preflight-prep-title {
  font-size: var(--fs-caption, 13px); color: var(--text-muted, #6B5F50);
  text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: var(--space-sm, 10px);
}
/* End session */
.rt-end {
  flex: 1; display: flex; flex-direction: column; justify-content: center; align-items: center;
  padding: var(--space-xl, 36px) var(--space-lg, 24px); text-align: center;
  gap: var(--space-lg, 24px);
}
.rt-end-icon { font-size: 56px; }
.rt-end-title { font-size: var(--fs-h1, 28px); font-weight: var(--fw-bold, 700); color: var(--success, #10B981); }
.rt-end-stats {
  display: flex; flex-direction: column; gap: var(--space-sm, 10px); width: 100%;
  background: var(--bg-surface, #13131A);
  border: 1px solid var(--border, rgba(212,175,55,0.12));
  border-radius: var(--card-r, 12px); padding: var(--card-p, 16px);
}
.rt-end-stat { display: flex; justify-content: space-between; font-size: var(--fs-ui, 16px); }
.rt-end-stat-val { font-weight: var(--fw-semibold, 600); color: var(--gold, #D4AF37); }
.rt-confirm-inline {
  background: var(--warning-bg, rgba(251,191,36,0.15));
  border: 1px solid var(--warning, #FBBF24);
  border-radius: var(--btn-r, 8px);
  padding: var(--space-sm, 10px) var(--space-md, 16px);
  font-size: var(--fs-caption, 13px); color: var(--text-primary, #F5F0E8);
  display: flex; flex-direction: column; gap: var(--space-xs, 5px);
}
.rt-confirm-btns { display: flex; gap: var(--space-sm, 10px); margin-top: var(--space-xs, 5px); }
.rt-diff-block { padding: var(--space-sm, 10px) 0; border-bottom: 1px solid var(--border, rgba(212,175,55,0.12)); }
.rt-diff-jalur {
  font-size: var(--fs-badge, 12px); font-weight: var(--fw-semibold, 600);
  text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px;
}
.rt-diff-jalur.paham  { color: var(--success, #10B981); }
.rt-diff-jalur.hampir { color: var(--warning, #FBBF24); }
.rt-diff-jalur.belum  { color: var(--danger, #F87171);  }
.rt-diff-text { font-size: var(--fs-caption, 13px); color: var(--text-secondary, #A89880); line-height: var(--lh-normal, 1.5); }
.rt-search-input {
  background: var(--input-bg, rgba(255,255,255,0.04));
  border: 1px solid var(--input-border, rgba(212,175,55,0.2));
  border-radius: var(--input-r, 8px);
  color: var(--text-primary, #F5F0E8);
  font-size: var(--fs-ui, 16px);
  padding: var(--input-py, 12px) var(--input-px, 14px);
  width: 100%; box-sizing: border-box;
}
.rt-search-input:focus { border-color: var(--gold, #D4AF37); outline: none; }
.rt-search-input::placeholder { color: var(--text-muted, #6B5F50); }
.rt-step-badge-skippable {
  font-size: var(--fs-badge, 12px); color: var(--text-muted, #6B5F50);
  background: rgba(255,255,255,0.06); border-radius: 99px; padding: 2px 8px; display: inline-block;
}
.rt-recovery-item {
  border: 1.5px solid var(--border, rgba(212,175,55,0.12));
  border-radius: var(--btn-r, 8px);
  padding: var(--space-sm, 10px) var(--space-md, 16px);
  cursor: pointer; transition: background 150ms;
  font-size: var(--fs-ui, 16px); color: var(--text-primary, #F5F0E8);
  display: flex; align-items: flex-start; gap: 10px;
  min-height: 44px;
}
.rt-recovery-item:hover { background: rgba(255,255,255,0.04); }
.rt-btn-close {
  background: transparent; border: 1.5px solid var(--border-strong, rgba(212,175,55,0.25));
  border-radius: var(--btn-r, 8px); color: var(--text-secondary, #A89880);
  font-size: var(--fs-ui, 16px); min-height: var(--btn-h-sm, 40px);
  padding: 0 var(--btn-px, 20px); cursor: pointer; width: 100%;
  display: flex; align-items: center; justify-content: center;
}
`;
    document.head.appendChild(style);
  }

  // ── Phase labels ─────────────────────────────────────────────────────────────
  const PHASE_LABEL = {
    opening: 'Pembukaan', understand: 'Pemahaman',
    apply: 'Penerapan', reflect: 'Refleksi', closing: 'Penutup',
  };

  // ── Helpers ──────────────────────────────────────────────────────────────────

  function esc(s) {
    return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function debounceNav(fn) {
    if (_navDebounce) return;
    _navDebounce = true;
    fn().finally(() => { setTimeout(() => { _navDebounce = false; }, 200); });
  }

  function showSnack(msg, undoFn, duration) {
    const existing = document.getElementById('rt-snack-el');
    if (existing) existing.remove();
    const el = document.createElement('div');
    el.id = 'rt-snack-el';
    el.className = 'rt-snack';
    el.innerHTML = `<span>${esc(msg)}</span>${undoFn ? '<button style="background:none;border:none;color:var(--gold,#D4AF37);font-size:var(--fs-caption,13px);cursor:pointer;padding:0;min-height:auto;">Undo</button>' : ''}`;
    if (undoFn) el.querySelector('button').addEventListener('click', () => { el.remove(); undoFn(); });
    document.body.appendChild(el);
    setTimeout(() => el.remove(), duration ?? (undoFn ? 4000 : 2000));
  }

  function updateSyncStatus(text) {
    const el = _overlay?.querySelector('#rt-sync-status');
    if (el) el.textContent = text;
  }

  function computeProgress(pkg, stepStates) {
    let doneMin = 0;
    let total   = 0;
    for (const step of pkg.steps) {
      total += step.planned_minutes;
      const ss = stepStates[step.id];
      if (ss?.status === 'completed' || ss?.status === 'skipped') doneMin += step.planned_minutes;
    }
    return total > 0 ? Math.round((doneMin / total) * 100) : 0;
  }

  function elapsedMinutes(session) {
    const start = new Date(session.pacing_state?.started_at ?? session.started_at).getTime();
    return Math.round((Date.now() - start) / 60000);
  }

  function formatClock(ms) {
    const totalMin = Math.round(ms / 60000);
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    return h > 0 ? `${h}j ${String(m).padStart(2,'0')}m` : `${m} mnt`;
  }

  function getCheckpointForStep(pkg, stepId) {
    return pkg.checkpoints?.find(c => c.triggered_by_step_id === stepId) ?? null;
  }

  // ── B7. startTimer ───────────────────────────────────────────────────────────

  function startTimer(session, pkg) {
    if (_rtTimer) clearInterval(_rtTimer);

    function tick() {
      const elapsed  = elapsedMinutes(session);
      const total    = pkg.duration.duration_minutes;
      const remaining = total - elapsed;

      const clockEl   = _overlay?.querySelector('#rt-clock');
      const remainEl  = _overlay?.querySelector('#rt-remain');
      const warnEl    = _overlay?.querySelector('#rt-pacing-warn');
      if (clockEl)  clockEl.textContent  = formatClock(elapsed * 60000);
      if (remainEl) remainEl.textContent = remaining >= 0
        ? `Sisa ~${remaining} mnt`
        : `Lewat ${Math.abs(remaining)} mnt`;

      if (remaining < 10 && !_pacingWarnShown) {
        _pacingWarnShown = true;
        if (warnEl) { warnEl.style.display = ''; warnEl.textContent = '⚠ Waktu hampir habis'; }
      }
    }

    tick();
    _rtTimer = setInterval(tick, 30000);
  }

  // ── Overlay scaffold ─────────────────────────────────────────────────────────

  function buildOverlay() {
    const el = document.createElement('div');
    el.id = 'rt-overlay';
    el.innerHTML = `
<div class="rt-header">
  <div class="rt-header-tp" id="rt-tp-name"></div>
  <div class="rt-header-info" id="rt-meet-info"></div>
  <span id="rt-conn-indicator" style="font-size:var(--fs-badge,12px);color:var(--warning,#FBBF24);display:none;white-space:nowrap;">● Offline</span>
  <button class="rt-header-menu" id="rt-btn-menu" title="Menu" aria-label="Menu">⋮</button>
</div>
<div class="rt-timer-bar">
  <div class="rt-timer-clock" id="rt-clock">0 mnt</div>
  <div class="rt-timer-remain" id="rt-remain"></div>
  <div class="rt-timer-warn" id="rt-pacing-warn" style="display:none;"></div>
</div>
<div class="rt-progress-wrap">
  <div class="rt-progress-track"><div class="rt-progress-fill" id="rt-prog-fill" style="width:0%"></div></div>
  <div class="rt-progress-label" id="rt-prog-label"></div>
</div>
<div id="rt-main-content" style="flex:1;overflow:hidden;display:flex;flex-direction:column;"></div>`;
    return el;
  }

  function updateProgress(pkg, stepStates) {
    const pct    = computeProgress(pkg, stepStates);
    const filled = _overlay?.querySelector('#rt-prog-fill');
    const label  = _overlay?.querySelector('#rt-prog-label');
    if (filled) filled.style.width = pct + '%';

    const steps    = pkg.steps;
    const doneCount = steps.filter(s => {
      const ss = stepStates[s.id];
      return ss?.status === 'completed' || ss?.status === 'skipped';
    }).length;
    if (label) label.textContent = `Langkah ${doneCount}/${steps.length}`;
  }

  // ── B2. renderPreFlight ──────────────────────────────────────────────────────

  function renderPreFlight(pkg, session, isResume) {
    const main = _overlay.querySelector('#rt-main-content');
    const tp   = pkg.tp_snapshot;
    const openingStep = pkg.steps.find(s => s.phase === 'opening');
    const prepText = openingStep?.teacher_action ?? '';

    const resumeHtml = isResume ? `
<div style="background:var(--warning-bg,rgba(251,191,36,0.15));border:1px solid var(--warning,#FBBF24);
  border-radius:var(--btn-r,8px);padding:var(--space-sm,10px) var(--space-md,16px);
  font-size:var(--fs-caption,13px);color:var(--text-primary,#F5F0E8);">
  Melanjutkan sesi — dimulai ${session.started_at ? new Date(session.started_at).toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'}) : ''}
</div>` : '';

    main.innerHTML = `
<div class="rt-preflight">
  <div>
    <div class="rt-preflight-label">Tujuan Pembelajaran</div>
    <div class="rt-preflight-title">${esc(tp?.judul ?? 'Pertemuan')}</div>
    <div class="rt-preflight-meta">Pertemuan ${pkg.meeting_no} · ${pkg.duration.jp} JP · ${pkg.duration.duration_minutes} menit</div>
  </div>
  ${prepText ? `
  <div class="rt-preflight-prep">
    <div class="rt-preflight-prep-title">Persiapan Guru</div>
    <div style="font-size:var(--fs-caption,13px);color:var(--text-secondary,#A89880);line-height:var(--lh-normal,1.5);">${esc(prepText)}</div>
  </div>` : ''}
  ${resumeHtml}
  <div style="display:flex;flex-direction:column;gap:var(--space-sm,10px);">
    <button class="rt-btn-next" id="rt-btn-start">${isResume ? '▶ LANJUTKAN' : '▶ MULAI'}</button>
    ${isResume ? `<button class="rt-btn-close" id="rt-btn-new-session">Mulai sesi baru</button>` : ''}
  </div>
</div>`;

    main.querySelector('#rt-btn-start').addEventListener('click', async () => {
      startTimer(_rtSession, _rtPkg);
      const curStep = _rtPkg.steps.find(s => s.id === _rtSession.navigation_position)
        ?? _rtPkg.steps[0];
      await renderStep(_rtPkg, _rtSession, curStep);
    });

    main.querySelector('#rt-btn-new-session')?.addEventListener('click', async () => {
      // Force new session: mark old complete, create fresh
      await window.RuntimeSession.completeSession(_rtSession, _rtPkg);
      _rtSession = await window.RuntimeSession.startSession(_rtPkg);
      _rtStepStates = {};
      renderPreFlight(_rtPkg, _rtSession, false);
    });
  }

  // ── B3. renderStep ───────────────────────────────────────────────────────────

  async function renderStep(pkg, session, step) {
    _rtSession     = session;
    _rtStepStates  = await window.RuntimeDb.stepStates.getAll(session.session_id);
    updateProgress(pkg, _rtStepStates);

    // Update header
    const tpEl   = _overlay.querySelector('#rt-tp-name');
    const metaEl = _overlay.querySelector('#rt-meet-info');
    if (tpEl)   tpEl.textContent   = pkg.tp_snapshot?.judul ?? '';
    if (metaEl) metaEl.textContent = `Pertemuan ${pkg.meeting_no} · ${pkg.duration.jp} JP`;

    const main      = _overlay.querySelector('#rt-main-content');
    const stepIdx   = pkg.steps.findIndex(s => s.id === step.id);
    const checkpoint = getCheckpointForStep(pkg, step.id);
    const diff      = pkg.differentiation ?? {};
    const hasAssessment = !!checkpoint;

    main.innerHTML = `
<div class="rt-card" id="rt-card-scroll">
  <div>
    <span class="rt-phase-badge">${esc(PHASE_LABEL[step.phase] ?? step.phase)}</span>
    <span class="rt-duration-tag">± ${step.planned_minutes} menit</span>
    ${step.skippable ? '<span class="rt-step-badge-skippable" style="margin-left:6px;">opsional</span>' : ''}
  </div>
  <div class="rt-step-title">${esc(step.title)}</div>

  <div class="rt-action-block">
    <div class="rt-action-label">Aksi Guru</div>
    <div class="rt-action-text">${esc(step.teacher_action)}</div>
  </div>

  <div class="rt-cue-block">
    <div class="rt-cue-label">Tanda selesai</div>
    <div class="rt-cue-text">${esc(step.completion_cue)}</div>
  </div>

  <div class="rt-chips">
    <button class="rt-chip" id="rt-chip-focus">⚠ Kelas tidak fokus</button>
    ${Object.keys(diff).length ? '<button class="rt-chip" id="rt-chip-diff">⇄ Diferensiasi</button>' : ''}
    ${hasAssessment ? '<button class="rt-chip rt-chip-assessment" id="rt-chip-asm">+ Catat asesmen</button>' : ''}
  </div>
</div>

<div class="rt-bottom">
  <button class="rt-btn-next" id="rt-btn-next">Sudah · Lanjut →</button>
  <div id="rt-confirm-skip-wrap"></div>
  <div class="rt-nav-row">
    <button class="rt-btn-back" id="rt-btn-back">‹ Kembali</button>
    <button class="rt-btn-adjust" id="rt-btn-adjust">⚡ Sesuaikan</button>
  </div>
</div>`;

    // Wire chips
    main.querySelector('#rt-chip-focus')?.addEventListener('click', () => openRecovery('CLASS_NOT_FOCUS'));
    main.querySelector('#rt-chip-diff')?.addEventListener('click', () => openDifferentiationOverlay(step));
    main.querySelector('#rt-chip-asm')?.addEventListener('click', () => openAssessmentOverlay(step));

    // Wire nav buttons
    main.querySelector('#rt-btn-next').addEventListener('click', () => debounceNav(advanceStepUI));
    main.querySelector('#rt-btn-back').addEventListener('click', () => debounceNav(goBackUI));
    main.querySelector('#rt-btn-adjust').addEventListener('click', () => openAdjustOverlay());

    // Menu
    _overlay.querySelector('#rt-btn-menu').onclick = () => openStepMenu(step);

    // Swipe
    wireSwipe(main.querySelector('#rt-card-scroll') ?? main, step);
  }

  // ── B4. advanceStepUI ────────────────────────────────────────────────────────

  async function advanceStepUI() {
    const btn = _overlay?.querySelector('#rt-btn-next');
    if (btn) btn.disabled = true;
    try {
      const result = await window.RuntimeSession.advanceStep(_rtSession, _rtPkg);
      if (!result) {
        await endSessionUI();
      } else {
        _rtSession = result.session;
        await renderStep(_rtPkg, result.session, result.currentStep);
      }
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  // ── B5. goBackUI ─────────────────────────────────────────────────────────────

  async function goBackUI() {
    const result = await window.RuntimeSession.goBack(_rtSession, _rtPkg);
    _rtSession = result.session;
    await renderStep(_rtPkg, result.session, result.currentStep);
  }

  // ── B6. skipStepUI ───────────────────────────────────────────────────────────

  async function skipStepUI(step) {
    const doSkip = async () => {
      const result = await window.RuntimeSession.skipStep(_rtSession, _rtPkg);
      if (!result) {
        await endSessionUI();
      } else {
        _rtSession = result.session;
        await renderStep(_rtPkg, result.session, result.currentStep);
        showSnack('Langkah dilewati', () => debounceNav(goBackUI));
      }
    };

    if (!step.skippable) {
      // Show inline confirm
      const wrap = _overlay?.querySelector('#rt-confirm-skip-wrap');
      if (wrap) {
        wrap.innerHTML = `
<div class="rt-confirm-inline">
  Langkah ini penting. Tetap lewati?
  <div class="rt-confirm-btns">
    <button class="rt-btn-close" id="rt-skip-cancel" style="flex:1;font-size:var(--fs-caption,13px);">Batal</button>
    <button class="rt-btn-close" id="rt-skip-confirm"
      style="flex:1;font-size:var(--fs-caption,13px);color:var(--danger,#F87171);border-color:rgba(248,113,113,0.3);">
      Tetap lewati
    </button>
  </div>
</div>`;
        wrap.querySelector('#rt-skip-cancel').addEventListener('click', () => { wrap.innerHTML = ''; });
        wrap.querySelector('#rt-skip-confirm').addEventListener('click', () => { wrap.innerHTML = ''; doSkip(); });
      }
      return;
    }

    await doSkip();
  }

  // ── B8. openAssessmentOverlay ────────────────────────────────────────────────

  function openAssessmentOverlay(step) {
    const pkg        = _rtPkg;
    const checkpoint = getCheckpointForStep(pkg, step.id);

    const panel = document.createElement('div');
    panel.className = 'rt-panel';
    panel.innerHTML = `
<div class="rt-panel-inner">
  <div class="rt-panel-title">CEK PEMAHAMAN</div>
  ${checkpoint?.expected_evidence
    ? `<div class="rt-panel-evidence">${esc(checkpoint.expected_evidence)}</div>`
    : ''}
  <div style="font-size:var(--fs-caption,13px);color:var(--text-muted,#6B5F50);">Kondisi kelas?</div>
  <div class="rt-status-group">
    <button class="rt-status-btn paham" data-status="paham">✓ Mayoritas paham</button>
    <button class="rt-status-btn hampir" data-status="hampir">~ Sebagian belum</button>
    <button class="rt-status-btn belum" data-status="belum">! Banyak belum paham</button>
  </div>
  <button class="rt-chip" id="rt-btn-open-obs" style="width:100%;justify-content:center;min-height:44px;">+ Catat siswa / kelompok</button>
  <button class="rt-btn-close" id="rt-asm-close">Tutup</button>
</div>`;

    panel.querySelectorAll('.rt-status-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const status = btn.dataset.status;
        await window.RuntimeSession.recordClassPulse(_rtSession, step.id, status);
        panel.remove();
        if (status === 'belum' || status === 'hampir') {
          const rec = _rtPkg.recovery_actions.find(r => r.trigger === 'CLASS_NOT_UNDERSTAND');
          if (rec) openRecovery('CLASS_NOT_UNDERSTAND');
        }
      });
    });

    panel.querySelector('#rt-btn-open-obs').addEventListener('click', () => {
      panel.remove();
      openStudentObservationOverlay(step, checkpoint);
    });

    panel.querySelector('#rt-asm-close').addEventListener('click', () => panel.remove());
    document.body.appendChild(panel);
  }

  // ── B9. openStudentObservationOverlay ────────────────────────────────────────

  function openStudentObservationOverlay(step, checkpoint) {
    const roster  = _rtPkg.roster_snapshot ?? [];
    let selected  = new Set();
    let filterStr = '';

    function renderRoster() {
      const grid = panel.querySelector('#rt-roster-grid');
      if (!grid) return;
      const filtered = filterStr
        ? roster.filter(r => r.nama.toLowerCase().includes(filterStr.toLowerCase()))
        : roster;
      grid.innerHTML = filtered.map(r => `
<div class="rt-roster-chip ${selected.has(r.id) ? 'selected' : ''}" data-id="${esc(r.id)}" data-nama="${esc(r.nama)}">
  ${esc(r.nama)}
</div>`).join('');
      grid.querySelectorAll('.rt-roster-chip').forEach(chip => {
        chip.addEventListener('click', () => {
          const id = chip.dataset.id;
          if (selected.has(id)) selected.delete(id); else selected.add(id);
          renderRoster();
        });
      });
    }

    const anchorHtml = checkpoint ? `
<div style="font-size:var(--fs-badge,12px);color:var(--text-muted,#6B5F50);margin-top:var(--space-sm,10px);">Anchor singkat:</div>
<div style="font-size:var(--fs-caption,13px);color:var(--text-secondary,#A89880);line-height:var(--lh-normal,1.5);">
  <div><span style="color:var(--success,#10B981);">Paham:</span> ${esc(checkpoint.classification_anchor?.paham ?? '')}</div>
  <div><span style="color:var(--warning,#FBBF24);">Hampir:</span> ${esc(checkpoint.classification_anchor?.hampir ?? '')}</div>
  <div><span style="color:var(--danger,#F87171);">Belum:</span> ${esc(checkpoint.classification_anchor?.belum ?? '')}</div>
</div>` : '';

    const panel = document.createElement('div');
    panel.className = 'rt-panel';
    panel.innerHTML = `
<div class="rt-panel-inner">
  <div class="rt-panel-title">CATAT ASESMEN</div>
  <input class="rt-search-input" id="rt-obs-search" placeholder="Cari nama siswa…" autocomplete="off">
  <div class="rt-roster-grid" id="rt-roster-grid"></div>
  <div id="rt-obs-status" class="rt-status-group" style="display:none;"></div>
  ${anchorHtml}
  <div id="rt-obs-confirm" style="display:none;font-size:var(--fs-caption,13px);color:var(--success,#10B981);"></div>
  <button class="rt-btn-close" id="rt-obs-close">Batal</button>
</div>`;

    panel.querySelector('#rt-obs-search').addEventListener('input', e => {
      filterStr = e.target.value;
      renderRoster();
    });

    renderRoster();

    // Show status buttons when selection non-empty
    function updateStatusVisibility() {
      const statusEl = panel.querySelector('#rt-obs-status');
      if (!statusEl) return;
      if (selected.size > 0) {
        statusEl.style.display = '';
        statusEl.innerHTML = `
<div style="font-size:var(--fs-caption,13px);color:var(--text-muted,#6B5F50);">${selected.size} siswa dipilih. Status:</div>
<button class="rt-status-btn paham"  data-s="paham">✓ Paham</button>
<button class="rt-status-btn hampir" data-s="hampir">~ Hampir</button>
<button class="rt-status-btn belum"  data-s="belum">! Belum</button>`;
        statusEl.querySelectorAll('.rt-status-btn').forEach(btn => {
          btn.addEventListener('click', async () => {
            const targets = roster.filter(r => selected.has(r.id));
            await window.RuntimeSession.recordObservation(_rtSession, step.id, targets, btn.dataset.s);
            const confirmEl = panel.querySelector('#rt-obs-confirm');
            if (confirmEl) { confirmEl.style.display = ''; confirmEl.textContent = `✓ ${targets.length} siswa dicatat`; }
            selected.clear();
            renderRoster();
            statusEl.style.display = 'none';
            setTimeout(() => { if (confirmEl) confirmEl.style.display = 'none'; }, 1500);
          });
        });
      } else {
        statusEl.style.display = 'none';
      }
    }

    // Intercept roster chip clicks to also update status visibility
    const origRenderRoster = renderRoster;
    function renderRosterAndStatus() {
      origRenderRoster();
      // Re-attach with status update
      const grid = panel.querySelector('#rt-roster-grid');
      grid?.querySelectorAll('.rt-roster-chip').forEach(chip => {
        chip.addEventListener('click', updateStatusVisibility);
      });
    }

    panel.querySelector('#rt-obs-search').addEventListener('input', () => renderRosterAndStatus());

    // Initial render with status hook
    renderRosterAndStatus();
    panel.querySelector('#rt-obs-close').addEventListener('click', () => panel.remove());
    document.body.appendChild(panel);
  }

  // ── B10. openDifferentiationOverlay ──────────────────────────────────────────

  function openDifferentiationOverlay(step) {
    // pkg.differentiation dibaca langsung di sini — field ini harus tetap ada di RuntimePackage
    const diff = _rtPkg.differentiation ?? {};
    const jalur = ['paham', 'hampir', 'belum'];
    const label = { paham: 'Sudah paham', hampir: 'Hampir paham', belum: 'Belum paham' };

    const panel = document.createElement('div');
    panel.className = 'rt-panel';
    panel.innerHTML = `
<div class="rt-panel-inner">
  <div class="rt-panel-title">DIFERENSIASI</div>
  ${jalur.map(j => `
  <div class="rt-diff-block">
    <div class="rt-diff-jalur ${j}">${esc(label[j])}</div>
    <div class="rt-diff-text">→ ${esc(diff[j]?.aktivitas ?? diff[j] ?? '—')}</div>
  </div>`).join('')}
  <button class="rt-btn-next" id="rt-diff-use" style="margin-top:var(--space-sm,10px);">Gunakan</button>
  <button class="rt-btn-close" id="rt-diff-close">Tutup</button>
</div>`;

    panel.querySelector('#rt-diff-use').addEventListener('click', async () => {
      await window.RuntimeSession.applyAdaptation(_rtSession, 'DIFFERENTIATION_APPLIED');
      panel.remove();
      showSnack('Diferensiasi diterapkan');
    });
    panel.querySelector('#rt-diff-close').addEventListener('click', () => panel.remove());
    document.body.appendChild(panel);
  }

  // ── B11. openAdjustOverlay ───────────────────────────────────────────────────

  function openAdjustOverlay() {
    const recoveries = _rtPkg.recovery_actions ?? [];
    const triggers = [
      { trigger: 'TIME_SHORT',          label: '⏱ Waktu tinggal sedikit' },
      { trigger: 'CLASS_NOT_UNDERSTAND', label: '🤔 Kelas belum paham' },
      { trigger: 'CLASS_NOT_FOCUS',      label: '📣 Kelas tidak fokus' },
      { trigger: 'FACILITY_FAIL',        label: '📵 Fasilitas bermasalah' },
      { trigger: 'MANY_ABSENT',          label: '👥 Banyak siswa tidak hadir' },
    ];

    const panel = document.createElement('div');
    panel.className = 'rt-panel';
    panel.innerHTML = `
<div class="rt-panel-inner">
  <div class="rt-panel-title">⚡ SESUAIKAN KELAS</div>
  ${triggers.map(t => `<div class="rt-recovery-item" data-trigger="${esc(t.trigger)}">${esc(t.label)}</div>`).join('')}
  <div style="height:1px;background:var(--border,rgba(212,175,55,0.12));margin:0;"></div>
  <div class="rt-recovery-item" id="rt-goto-closing" style="color:var(--warning,#FBBF24);border-color:rgba(251,191,36,0.3);">
    ⏭ Langsung ke penutup
  </div>
  <button class="rt-btn-close" id="rt-adj-close">Batal</button>
</div>`;

    panel.querySelectorAll('.rt-recovery-item[data-trigger]').forEach(item => {
      item.addEventListener('click', () => {
        panel.remove();
        openRecovery(item.dataset.trigger);
      });
    });

    panel.querySelector('#rt-goto-closing').addEventListener('click', () => {
      const curStep = _rtPkg.steps.find(s => s.id === _rtSession.navigation_position);
      const remaining = _rtPkg.steps.filter(s => {
        if (s.phase === 'closing') return false;
        const ss = _rtStepStates[s.id];
        return !ss || (ss.status !== 'completed' && ss.status !== 'skipped');
      });
      panel.remove();

      const confirmDiv = document.createElement('div');
      confirmDiv.className = 'rt-panel';
      confirmDiv.innerHTML = `
<div class="rt-panel-inner">
  <div class="rt-panel-title">Langsung ke penutup?</div>
  <div style="font-size:var(--fs-caption,13px);color:var(--text-secondary,#A89880);line-height:var(--lh-normal,1.5);">
    ${remaining.length} langkah tersisa. Langkah yang belum selesai akan dicatat sebagai dilewati.
  </div>
  <button class="rt-btn-next" id="rt-close-confirm">Ke Penutup</button>
  <button class="rt-btn-close" id="rt-close-cancel">Batal</button>
</div>`;
      confirmDiv.querySelector('#rt-close-cancel').addEventListener('click', () => confirmDiv.remove());
      confirmDiv.querySelector('#rt-close-confirm').addEventListener('click', async () => {
        confirmDiv.remove();
        const result = await window.RuntimeSession.jumpToClosing(_rtSession, _rtPkg);
        if (result) {
          _rtSession = result.session;
          await renderStep(_rtPkg, result.session, result.step);
        }
      });
      document.body.appendChild(confirmDiv);
    });

    panel.querySelector('#rt-adj-close').addEventListener('click', () => panel.remove());
    document.body.appendChild(panel);
  }

  function openRecovery(trigger) {
    const rec = _rtPkg.recovery_actions?.find(r => r.trigger === trigger);
    if (!rec) return;

    const panel = document.createElement('div');
    panel.className = 'rt-panel';
    const skipList = rec.steps_to_skip?.length
      ? `<div style="font-size:var(--fs-caption,13px);color:var(--text-muted,#6B5F50);">
          Langkah yang akan dilewati: ${rec.steps_to_skip.map(id => `<code>${esc(id)}</code>`).join(', ')}
        </div>`
      : '';
    panel.innerHTML = `
<div class="rt-panel-inner">
  <div class="rt-panel-title">SARAN PENYESUAIAN</div>
  <div style="font-size:var(--fs-body,16px);color:var(--text-primary,#F5F0E8);line-height:var(--lh-normal,1.5);">${esc(rec.description)}</div>
  ${skipList}
  <button class="rt-btn-next" id="rt-rec-use">Gunakan</button>
  <button class="rt-btn-close" id="rt-rec-cancel">Batal</button>
</div>`;
    panel.querySelector('#rt-rec-use').addEventListener('click', async () => {
      await window.RuntimeSession.applyAdaptation(_rtSession, rec.id);
      panel.remove();
      showSnack('Penyesuaian diterapkan');
    });
    panel.querySelector('#rt-rec-cancel').addEventListener('click', () => panel.remove());
    document.body.appendChild(panel);
  }

  // ── Menu ─────────────────────────────────────────────────────────────────────

  function openStepMenu(step) {
    const panel = document.createElement('div');
    panel.className = 'rt-panel';
    panel.innerHTML = `
<div class="rt-panel-inner">
  <div class="rt-panel-title">OPSI LANGKAH</div>
  <div class="rt-recovery-item" id="rt-menu-skip">Lewati langkah ini</div>
  <div class="rt-recovery-item" id="rt-menu-pause" style="color:var(--text-secondary,#A89880);">Jeda sesi</div>
  <button class="rt-btn-close" id="rt-menu-close">Tutup</button>
</div>`;
    panel.querySelector('#rt-menu-skip').addEventListener('click', () => { panel.remove(); skipStepUI(step); });
    panel.querySelector('#rt-menu-pause').addEventListener('click', async () => {
      await window.RuntimeSession.pauseSession(_rtSession);
      panel.remove();
      showSnack('Sesi dijeda');
    });
    panel.querySelector('#rt-menu-close').addEventListener('click', () => panel.remove());
    document.body.appendChild(panel);
  }

  // ── B13. Swipe ───────────────────────────────────────────────────────────────

  function wireSwipe(el, step) {
    el.addEventListener('touchstart', e => {
      _rtSwipeStartX = e.changedTouches[0].clientX;
    }, { passive: true });

    el.addEventListener('touchend', e => {
      if (_rtSwipeStartX === null) return;
      const dx = e.changedTouches[0].clientX - _rtSwipeStartX;
      _rtSwipeStartX = null;
      if (Math.abs(dx) < 60) return;
      if (dx > 0) {
        // Swipe right → go back
        debounceNav(goBackUI);
      } else {
        // Swipe left → skip
        if (step.skippable) {
          debounceNav(() => skipStepUI(step));
        } else {
          showSnack('Langkah ini tidak bisa dilewati');
        }
      }
    }, { passive: true });
  }

  // ── B12. endSessionUI ────────────────────────────────────────────────────────

  async function endSessionUI() {
    const rdb        = window.RuntimeDb;
    const stepStates = await rdb.stepStates.getAll(_rtSession.session_id);
    const completed  = Object.values(stepStates).filter(s => s.status === 'completed').length;
    const skipped    = Object.values(stepStates).filter(s => s.status === 'skipped').length;
    const events     = await rdb.events.getPending();
    const obsCount   = events.filter(e => e.type === 'student_observation_recorded').length;

    await window.RuntimeSession.completeSession(_rtSession, _rtPkg);
    if (_rtTimer) { clearInterval(_rtTimer); _rtTimer = null; }

    // D4: remove connection listeners now that overlay is being replaced with end screen
    if (_connOnlineHandler)  { window.removeEventListener('online',  _connOnlineHandler);  _connOnlineHandler  = null; }
    if (_connOfflineHandler) { window.removeEventListener('offline', _connOfflineHandler); _connOfflineHandler = null; }

    const main = _overlay.querySelector('#rt-main-content');
    main.innerHTML = `
<div class="rt-end">
  <div class="rt-end-icon">✓</div>
  <div class="rt-end-title">Kelas Selesai</div>
  <div style="font-size:var(--fs-caption,13px);color:var(--text-secondary,#A89880);">
    Pertemuan ${_rtPkg.meeting_no} · ${esc(_rtPkg.tp_snapshot?.judul ?? '')}
  </div>
  <div class="rt-end-stats">
    <div class="rt-end-stat"><span>Langkah selesai</span><span class="rt-end-stat-val">${completed}</span></div>
    <div class="rt-end-stat"><span>Langkah dilewati</span><span class="rt-end-stat-val">${skipped}</span></div>
    <div class="rt-end-stat"><span>Observasi tercatat</span><span class="rt-end-stat-val">${obsCount}</span></div>
  </div>
  <div id="rt-sync-status" style="font-size:var(--fs-caption,13px);color:var(--text-muted,#6B5F50);">
    Tersimpan di perangkat
  </div>
  <button class="rt-btn-next" id="rt-btn-close-runtime">Tutup Runtime</button>
</div>`;

    // D2: background sync — do NOT await; session complete is not blocked by sync
    const _sessionForSync = _rtSession;
    window.RuntimeSync?.syncPending(_sessionForSync).then(result => {
      if ((result?.synced ?? 0) > 0) {
        updateSyncStatus('✓ Tersinkron ke server');
      }
    }).catch(() => {
      updateSyncStatus('Sync tertunda — akan otomatis sync saat online');
    });

    main.querySelector('#rt-btn-close-runtime').addEventListener('click', () => {
      if (_rtTimer) { clearInterval(_rtTimer); _rtTimer = null; }
      _overlay?.remove();
      _overlay      = null;
      _rtPkg        = null;
      _rtSession    = null;
      _rtStepStates = {};
      _pacingWarnShown = false;
    });
  }

  // ── B1. launchRuntime ────────────────────────────────────────────────────────

  async function launchRuntime(pkg) {
    if (!pkg?.steps?.length) throw new Error('[runtime-ui] pkg.steps kosong — package tidak valid');

    injectStyles();

    _rtPkg           = pkg;
    _pacingWarnShown = false;

    // Get or create session (needed to detect resume before any checks)
    const prevSession = await window.RuntimeDb.sessions.getActive(pkg.planning_context_id);
    const isResume    = !!prevSession;

    // E1: Stale package check — only if NOT resuming an active session
    if (!isResume) {
      const currentHash = pkg.source?.meeting_plan_source_hash ?? null;
      const stateHash   = (window._phase2cState?.meeting_plans ?? [])
        .find(m => m.meeting_no === pkg.meeting_no)
        ?.content_hash ?? null;

      if (stateHash !== null && currentHash !== null && currentHash !== stateHash) {
        // Offer to recompile — wrap in confirm so UI has a chance to mount first
        const recompile = window.confirm(
          'Rencana pertemuan ini sudah diperbarui.\n' +
          'Package offline menggunakan versi lama.\n\n' +
          'Perbarui package sebelum mulai?'
        );
        if (recompile) {
          if (typeof window.prepareRuntimePackage === 'function') {
            pkg = await window.prepareRuntimePackage(pkg.meeting_no);
            _rtPkg = pkg;
          }
        }
        // else: proceed with old package
      }
    }
    // E2: hot-swap during resume is disallowed — use the session's existing package as-is

    // D1: Check for session conflict on server (best-effort — do not block on network error)
    try {
      if (window.RuntimeSync) {
        const conflictResult = await window.RuntimeSync.checkConflict(
          pkg.planning_context_id, pkg.meeting_no
        );
        if (conflictResult?.conflict) {
          const proceed = window.confirm(
            'Ada sesi aktif di perangkat lain untuk pertemuan ini.\n' +
            'Lanjutkan di sini?'
          );
          if (!proceed) return;
        }
      }
    } catch (_) {
      // Network unavailable or EF not yet deployed — skip conflict check silently
    }

    try {
      _rtSession = await window.RuntimeSession.startSession(pkg);
    } catch (err) {
      if (err.name === 'QuotaExceededError' || err.name === 'NS_ERROR_DOM_QUOTA_REACHED') {
        if (_overlay) { _overlay.remove(); _overlay = null; }
        alert(
          'Penyimpanan perangkat penuh.\n' +
          'Hapus beberapa file atau aplikasi lain, lalu coba lagi.'
        );
        return;
      }
      throw err;
    }
    _rtStepStates = await window.RuntimeDb.stepStates.getAll(_rtSession.session_id);

    const sessionIsResume = !!prevSession && prevSession.session_id === _rtSession.session_id;

    // Build and mount overlay
    if (_overlay) _overlay.remove();
    _overlay = buildOverlay();
    document.body.appendChild(_overlay);

    // D4: Wire connection indicator (reference stored for removal in endSessionUI)
    _connOnlineHandler = () => {
      const dot = _overlay?.querySelector('#rt-conn-indicator');
      if (dot) dot.style.display = 'none';
    };
    _connOfflineHandler = () => {
      const dot = _overlay?.querySelector('#rt-conn-indicator');
      if (dot) dot.style.display = '';
    };
    window.addEventListener('online',  _connOnlineHandler);
    window.addEventListener('offline', _connOfflineHandler);
    // Set initial state
    if (!navigator.onLine) {
      const dot = _overlay.querySelector('#rt-conn-indicator');
      if (dot) dot.style.display = '';
    }

    // D1: Init sync manager
    window.RuntimeSync?.init();

    renderPreFlight(pkg, _rtSession, sessionIsResume);
  }

  // ── Orphaned events handler (called by runtime-sync when events can't be resolved) ──
  window._onOrphanedEvents = (sessionId, count) => {
    showSnack(
      `${count} catatan dari sesi sebelumnya tidak dapat tersinkron dan telah diabaikan.`,
      null,
      6000
    );
  };

  // ── Export ───────────────────────────────────────────────────────────────────

  window.RuntimeUI = { launchRuntime };

})();
