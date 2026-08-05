(function () {
  'use strict';
  const client = window.supabaseClient;

  const PAGE_SIZE     = 10;
  const STATUSES      = ['HADIR', 'SAKIT', 'IZIN', 'ALPHA'];
  const STATUS_LABELS = { HADIR: 'H', SAKIT: 'S', IZIN: 'I', ALPHA: 'A' };
  const DAY_NAMES     = ['AHAD','SENIN','SELASA','RABU','KAMIS','JUMAT','SABTU'];
  const DAY_ID        = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];
  const MONTH_ID      = ['Januari','Februari','Maret','April','Mei','Juni',
                         'Juli','Agustus','September','Oktober','November','Desember'];

  let teacherId   = null;
  let classroomId = null;

  // Per-session in-memory state: { siswa: [...], page: 0 }
  const sessionState = {};

  // Auto-status timer
  let _todaySchedules = [];
  let _loadedDate     = null;
  let _sessionTimerId = null;

  // Rekap cache
  let _rekapPerSiswa   = null;
  let _rekapDateRange  = null;

  // ---- Utility ----
  function esc(s) {
    return String(s ?? '')
      .replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function todayStr() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }

  function dateToStr(d) {
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }

  function fmtDisplayDate(iso) {
    const [y, m, dd] = iso.split('-').map(Number);
    const d = new Date(y, m - 1, dd);
    return `${DAY_ID[d.getDay()]}, ${dd} ${MONTH_ID[m - 1]} ${y}`;
  }

  function fmtTime(t) { return t ? String(t).slice(0, 5) : ''; }

  function currentTimeStr() {
    const d = new Date();
    return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:00`;
  }

  function todayDayName() { return DAY_NAMES[new Date().getDay()]; }

  function pct(n, total) { return total ? Math.round(n / total * 100) : 0; }

  function sessionStatus(sch) {
    if (!sch.is_active) return 'NONAKTIF';
    const now = currentTimeStr();
    if (now < sch.start_time) return 'BELUM_MULAI';
    if (now > sch.end_time)   return 'SELESAI';
    return 'AKTIF';
  }

  function getPresetRange(preset) {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    const d = now.getDate();
    if (preset === 'minggu') {
      const day = now.getDay();
      const diffMon = day === 0 ? -6 : 1 - day;
      const mon = new Date(y, m, d + diffMon);
      const sun = new Date(y, m, d + diffMon + 6);
      return [dateToStr(mon), dateToStr(sun)];
    }
    if (preset === 'bulan') {
      return [`${y}-${String(m+1).padStart(2,'0')}-01`, dateToStr(new Date(y, m + 1, 0))];
    }
    if (preset === 'semester') {
      return m >= 6
        ? [`${y}-07-01`, `${y}-12-31`]
        : [`${y}-01-01`, `${y}-06-30`];
    }
    return [todayStr(), todayStr()];
  }

  // ---- DB helpers ----
  async function loadTodaySchedules() {
    const day = todayDayName();
    if (day === 'AHAD') return [];
    const { data } = await client
      .from('schedules')
      .select('id,day_of_week,start_time,end_time,is_active')
      .eq('classroom_id', classroomId)
      .eq('day_of_week', day)
      .eq('is_active', true)
      .order('start_time');
    return data || [];
  }

  async function loadRoster() {
    const { data } = await client
      .from('classroom_roster')
      .select('profile_id,full_name,nis')
      .eq('classroom_id', classroomId)
      .not('profile_id', 'is', null)
      .order('full_name');
    return data || [];
  }

  async function loadExistingAttendance(scheduleId, tanggal) {
    const { data } = await client
      .from('attendance')
      .select('student_id,status')
      .eq('classroom_id', classroomId)
      .eq('schedule_id', scheduleId)
      .eq('tanggal', tanggal);
    const map = {};
    (data || []).forEach(r => { map[r.student_id] = r.status; });
    return map;
  }

  async function saveAttendance(scheduleId, tanggal, siswa) {
    const rows = siswa.map(s => ({
      classroom_id: classroomId,
      schedule_id:  scheduleId,
      student_id:   s.profile_id,
      teacher_id:   teacherId,
      tanggal,
      status:       s.status,
      updated_at:   new Date().toISOString(),
    }));
    const { error } = await client
      .from('attendance')
      .upsert(rows, { onConflict: 'classroom_id,student_id,tanggal,schedule_id' });
    return error;
  }

  // ---- Summary ----
  function countStatuses(siswa) {
    const c = { HADIR: 0, SAKIT: 0, IZIN: 0, ALPHA: 0 };
    siswa.forEach(s => { if (c[s.status] !== undefined) c[s.status]++; });
    return c;
  }

  function renderSummaryInner(siswa) {
    const c = countStatuses(siswa);
    return `<div class="abs-summary-grid">` +
      `<div class="abs-sum-card abs-sum-h"><div class="abs-sum-label">H</div><div class="abs-sum-num">${c.HADIR}</div></div>` +
      `<div class="abs-sum-card abs-sum-s"><div class="abs-sum-label">S</div><div class="abs-sum-num">${c.SAKIT}</div></div>` +
      `<div class="abs-sum-card abs-sum-i"><div class="abs-sum-label">I</div><div class="abs-sum-num">${c.IZIN}</div></div>` +
      `<div class="abs-sum-card abs-sum-a"><div class="abs-sum-label">A</div><div class="abs-sum-num">${c.ALPHA}</div></div>` +
    `</div>`;
  }

  // ---- Siswa page renderer ----
  function renderSiswaPage(block, state, disabled) {
    const { siswa, page } = state;
    const totalPages = Math.max(1, Math.ceil(siswa.length / PAGE_SIZE));
    const pageSiswa  = siswa.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

    // Update summary
    const sw = block.querySelector('.abs-summary-wrap');
    if (sw) sw.innerHTML = renderSummaryInner(siswa);

    // Update pagination controls
    block.querySelectorAll('.page-label').forEach(el => {
      el.textContent = `Halaman ${page + 1} dari ${totalPages} (${siswa.length} siswa)`;
    });
    block.querySelectorAll('.btn-pg-prev').forEach(b => { b.disabled = page === 0; });
    block.querySelectorAll('.btn-pg-next').forEach(b => { b.disabled = page >= totalPages - 1; });

    // Render cards
    const listEl = block.querySelector('.abs-siswa-list');
    if (!listEl) return;
    listEl.innerHTML = '';

    pageSiswa.forEach(s => {
      const card = document.createElement('div');
      card.className = 'abs-card';
      card.innerHTML =
        `<div class="abs-card-info">` +
          `<span class="abs-nama">${esc(s.full_name)}</span>` +
          `<span class="abs-nis">${esc(s.nis)}</span>` +
        `</div>` +
        `<div class="abs-toggle" data-pid="${esc(s.profile_id)}">` +
          STATUSES.map(st =>
            `<button class="abs-status-btn abs-btn-${st.toLowerCase()}${s.status === st ? ' active' : ''}" ` +
            `data-status="${st}"${disabled ? ' disabled' : ''}>${STATUS_LABELS[st]}</button>`
          ).join('') +
        `</div>`;
      listEl.appendChild(card);

      if (!disabled) {
        const toggleEl = card.querySelector('.abs-toggle');
        toggleEl.querySelectorAll('.abs-status-btn').forEach(btn => {
          btn.addEventListener('click', () => {
            const idx = siswa.findIndex(x => x.profile_id === s.profile_id);
            if (idx >= 0) siswa[idx].status = btn.dataset.status;
            toggleEl.querySelectorAll('.abs-status-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const sw2 = block.querySelector('.abs-summary-wrap');
            if (sw2) sw2.innerHTML = renderSummaryInner(siswa);
          });
        });
      }
    });
  }

  // ---- Session block ----
  async function renderSession(sch, roster, tanggal) {
    const sid    = sch.id;
    const status = sessionStatus(sch);
    const done   = status !== 'AKTIF';

    // Build state
    const existing = await loadExistingAttendance(sid, tanggal);
    const siswa = roster.map(r => ({
      profile_id: r.profile_id,
      full_name:  r.full_name,
      nis:        r.nis,
      status:     existing[r.profile_id] || 'HADIR',
    }));
    sessionState[sid] = { siswa, page: 0 };
    const state = sessionState[sid];

    const totalPages = Math.max(1, Math.ceil(siswa.length / PAGE_SIZE));

    const badgeClass = status === 'AKTIF'      ? 'badge-aktif'
      : status === 'SELESAI'     ? 'badge-nonaktif'
      : 'badge-nonaktif';
    const badgeLabel = status === 'AKTIF'      ? 'AKTIF'
      : status === 'SELESAI'     ? 'SELESAI'
      : status === 'NONAKTIF'    ? 'NONAKTIF'
      : 'BELUM MULAI';

    const block = document.createElement('div');
    block.className = 'abs-session';
    block.dataset.scheduleId = sid;

    const hasSiswa = siswa.length > 0;

    block.innerHTML =
      `<div class="abs-session-header">` +
        `<span class="abs-session-time">${esc(fmtTime(sch.start_time))} – ${esc(fmtTime(sch.end_time))}</span>` +
        `<span class="${badgeClass}">${badgeLabel}</span>` +
      `</div>` +
      `<div class="abs-summary"><div class="abs-summary-wrap"></div></div>` +
      (hasSiswa
        ? `<div class="pagination-bar">` +
            `<button class="btn-pg-prev">←</button>` +
            `<span class="page-label"></span>` +
            `<button class="btn-pg-next">→</button>` +
          `</div>` +
          `<div class="abs-siswa-list"></div>` +
          (!done
            ? `<div class="abs-save-row">` +
                `<button class="btn-simpan-absensi">Simpan Absensi</button>` +
                `<span class="abs-save-msg"></span>` +
              `</div>`
            : `<p class="abs-disabled-msg">` +
                (status === 'SELESAI'
                  ? 'Sesi telah selesai. Data absensi tidak dapat diubah.'
                  : 'Sesi belum dimulai.') +
              `</p>`)
        : `<p class="empty-state">Belum ada siswa aktif di classroom ini.</p>`
      );

    // Initial render of page
    if (hasSiswa) {
      renderSiswaPage(block, state, done);

      // Pagination events
      block.querySelectorAll('.btn-pg-prev').forEach(b => {
        b.addEventListener('click', () => {
          if (state.page > 0) { state.page--; renderSiswaPage(block, state, done); }
        });
      });
      block.querySelectorAll('.btn-pg-next').forEach(b => {
        b.addEventListener('click', () => {
          if (state.page < Math.ceil(state.siswa.length / PAGE_SIZE) - 1) {
            state.page++;
            renderSiswaPage(block, state, done);
          }
        });
      });

      // Swipe gesture
      const listEl = block.querySelector('.abs-siswa-list');
      let touchStartX = 0;
      listEl.addEventListener('touchstart', e => {
        touchStartX = e.changedTouches[0].clientX;
      }, { passive: true });
      listEl.addEventListener('touchend', e => {
        const dx = e.changedTouches[0].clientX - touchStartX;
        if (Math.abs(dx) < 50) return;
        const maxPage = Math.ceil(state.siswa.length / PAGE_SIZE) - 1;
        if (dx < 0 && state.page < maxPage) { state.page++; renderSiswaPage(block, state, done); }
        if (dx > 0 && state.page > 0)       { state.page--; renderSiswaPage(block, state, done); }
      }, { passive: true });

      // Simpan button
      if (!done) {
        const btnSimpan = block.querySelector('.btn-simpan-absensi');
        const msgEl     = block.querySelector('.abs-save-msg');
        btnSimpan.addEventListener('click', async () => {
          btnSimpan.disabled    = true;
          btnSimpan.textContent = 'Menyimpan…';
          if (msgEl) { msgEl.textContent = ''; msgEl.className = 'abs-save-msg'; }

          const err = await saveAttendance(sid, tanggal, state.siswa);
          if (err) {
            if (msgEl) { msgEl.textContent = 'Gagal: ' + err.message; msgEl.className = 'abs-save-msg abs-save-err'; }
          } else {
            if (msgEl) { msgEl.textContent = `Tersimpan (${state.siswa.length} siswa)`; msgEl.className = 'abs-save-msg abs-save-ok'; }
          }
          btnSimpan.disabled    = false;
          btnSimpan.textContent = 'Simpan Absensi';
        });
      }
    }

    return block;
  }

  // ---- Render absensi section ----
  async function renderAbsensi() {
    const container = document.getElementById('absensi-container');
    if (!container) return;

    container.innerHTML = '<p class="empty-state">Memuat jadwal hari ini…</p>';

    const tanggal = todayStr();
    const [schedules, roster] = await Promise.all([loadTodaySchedules(), loadRoster()]);

    _todaySchedules = schedules;
    _loadedDate     = todayStr();

    container.innerHTML = '';
    const dayEl = document.createElement('p');
    dayEl.className   = 'abs-day-header';
    dayEl.textContent = fmtDisplayDate(tanggal);
    container.appendChild(dayEl);

    if (schedules.length === 0) {
      const msg = document.createElement('p');
      msg.className   = 'empty-state';
      msg.textContent = 'Tidak ada jadwal hari ini.';
      container.appendChild(msg);
      return;
    }

    for (const sch of schedules) {
      container.appendChild(await renderSession(sch, roster, tanggal));
    }

    // Snapshot status awal setiap sesi untuk deteksi perubahan oleh timer
    _todaySchedules.forEach(s => { s._lastKnownStatus = sessionStatus(s); });
  }

  // ---- In-place disable saat sesi AKTIF → SELESAI ----
  function disableSessionBlock(block) {
    const badge = block.querySelector('.badge-aktif');
    if (badge) { badge.className = 'badge-nonaktif'; badge.textContent = 'SELESAI'; }
    block.querySelectorAll('.abs-status-btn').forEach(b => { b.disabled = true; });
    const saveRow = block.querySelector('.abs-save-row');
    if (saveRow) {
      const msg = document.createElement('p');
      msg.className   = 'abs-disabled-msg';
      msg.textContent = 'Sesi telah selesai. Data absensi tidak dapat diubah.';
      saveRow.replaceWith(msg);
    }
  }

  // ---- Timer: cek perubahan status setiap 30 detik ----
  function syncSessionStatuses() {
    const container = document.getElementById('absensi-container');
    if (!container) return;

    // Guard midnight: jika hari berganti, reload jadwal dari awal
    if (_loadedDate && todayStr() !== _loadedDate) {
      renderAbsensi();
      return;
    }

    if (_todaySchedules.length === 0) return;

    let needsRerender = false;
    _todaySchedules.forEach(sch => {
      const newStatus = sessionStatus(sch);
      if (newStatus === sch._lastKnownStatus) return;

      if (sch._lastKnownStatus === 'BELUM_MULAI' && newStatus === 'AKTIF') {
        // Form sedang disabled — re-render aman, tidak ada data guru yang hilang
        needsRerender = true;
      } else if (sch._lastKnownStatus === 'AKTIF' && newStatus === 'SELESAI') {
        // Disable in-place agar perubahan status siswa yang belum disimpan tetap terlihat
        const block = container.querySelector(`.abs-session[data-schedule-id="${sch.id}"]`);
        if (block) disableSessionBlock(block);
      }
      sch._lastKnownStatus = newStatus;
    });

    if (needsRerender) renderAbsensi();
  }

  // ---- Rekap ----
  async function loadRekapData(fromDate, toDate) {
    const [attRes, roster] = await Promise.all([
      client.from('attendance')
        .select('student_id,tanggal,schedule_id,status')
        .eq('classroom_id', classroomId)
        .gte('tanggal', fromDate)
        .lte('tanggal', toDate),
      loadRoster(),
    ]);
    return { rows: attRes.data || [], roster };
  }

  function buildRekapSummary(rows) {
    const sessiSet = new Set(rows.map(r => `${r.tanggal}__${r.schedule_id}`));
    const totals   = { HADIR: 0, SAKIT: 0, IZIN: 0, ALPHA: 0 };
    rows.forEach(r => { if (totals[r.status] !== undefined) totals[r.status]++; });
    return { totalSesi: sessiSet.size, totals, total: rows.length };
  }

  function buildRekapPerSiswa(rows, roster) {
    const byId = {};
    roster.forEach(r => {
      byId[r.profile_id] = { full_name: r.full_name, nis: r.nis, HADIR: 0, SAKIT: 0, IZIN: 0, ALPHA: 0 };
    });
    rows.forEach(r => {
      if (byId[r.student_id] && byId[r.student_id][r.status] !== undefined)
        byId[r.student_id][r.status]++;
    });
    return Object.values(byId);
  }

  function renderRekapSummaryHtml(summary) {
    const { totalSesi, totals, total } = summary;
    return `<div class="abs-summary abs-rekap-summary">` +
      `<span class="abs-sum-item">Total sesi: <strong>${totalSesi}</strong></span>` +
      STATUSES.map(s =>
        `<span class="abs-sum-item abs-sum-${s.toLowerCase()}">${STATUS_LABELS[s]}: <strong>${totals[s]}</strong> <em>(${pct(totals[s], total)}%)</em></span>`
      ).join('') +
    `</div>`;
  }

  function renderRekapTableHtml(perSiswa) {
    if (perSiswa.length === 0)
      return '<p class="empty-state">Belum ada data absensi dalam rentang ini.</p>';
    return `<div style="overflow-x:auto"><table class="rekap-table"><thead><tr>` +
      `<th>Nama</th><th>H</th><th>S</th><th>I</th><th>A</th><th>% Hadir</th>` +
    `</tr></thead><tbody>` +
    perSiswa.map(s => {
      const t = s.HADIR + s.SAKIT + s.IZIN + s.ALPHA;
      return `<tr>` +
        `<td>${esc(s.full_name)}</td>` +
        `<td>${s.HADIR}</td><td>${s.SAKIT}</td><td>${s.IZIN}</td><td>${s.ALPHA}</td>` +
        `<td>${t ? Math.round(s.HADIR / t * 100) : 0}%</td>` +
      `</tr>`;
    }).join('') +
    `</tbody></table></div>`;
  }

  async function refreshRekap(fromDate, toDate, bodyEl) {
    bodyEl.innerHTML = '<p class="empty-state">Memuat rekap…</p>';
    const { rows, roster } = await loadRekapData(fromDate, toDate);
    const summary  = buildRekapSummary(rows);
    const perSiswa = buildRekapPerSiswa(rows, roster);

    bodyEl.innerHTML = renderRekapSummaryHtml(summary) + renderRekapTableHtml(perSiswa);

    // Cache for Excel export + enable tombol
    _rekapPerSiswa  = perSiswa;
    _rekapDateRange = { fromDate, toDate };
    const btnExport = document.getElementById('btn-export-excel');
    if (btnExport) { btnExport.disabled = false; btnExport.removeAttribute('title'); }
  }

  function exportExcel(perSiswa, fromDate, toDate) {
    const wsData = [
      ['Nama', 'H', 'S', 'I', 'A', '% Hadir'],
      ...perSiswa.map(s => {
        const t = s.HADIR + s.SAKIT + s.IZIN + s.ALPHA;
        return [s.full_name, s.HADIR, s.SAKIT, s.IZIN, s.ALPHA,
          (t ? Math.round(s.HADIR / t * 100) : 0) + '%'];
      }),
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(wsData), 'Rekap Absensi');
    XLSX.writeFile(wb, `rekap-absensi-${fromDate}-sd-${toDate}.xlsx`);
  }

  function renderRekap() {
    const container = document.getElementById('rekap-container');
    if (!container || container.dataset.init) return;
    container.dataset.init = '1';

    let currentPreset = 'bulan';

    container.innerHTML =
      `<div class="rekap-filters">` +
        ['minggu','bulan','semester','custom'].map(p =>
          `<button class="rekap-preset${p === currentPreset ? ' active' : ''}" data-preset="${p}">` +
            (p === 'minggu' ? 'Minggu ini' : p === 'bulan' ? 'Bulan ini' : p === 'semester' ? 'Semester ini' : 'Custom') +
          `</button>`
        ).join('') +
      `</div>` +
      `<div class="rekap-custom-range" style="display:none">` +
        `<label class="sch-label" style="flex-direction:row;align-items:center;gap:.4rem">Dari <input type="date" id="rekap-from" class="sch-input" style="width:auto"></label>` +
        `<label class="sch-label" style="flex-direction:row;align-items:center;gap:.4rem">Sampai <input type="date" id="rekap-to" class="sch-input" style="width:auto"></label>` +
        `<button class="btn-sm" id="rekap-apply">Terapkan</button>` +
      `</div>` +
      `<div id="rekap-body"></div>` +
      `<div style="margin-top:.75rem"><button id="btn-export-excel" disabled title="Muat rekap dulu sebelum export">Export Excel</button></div>`;

    const bodyEl      = container.querySelector('#rekap-body');
    const customRange = container.querySelector('.rekap-custom-range');

    // Initial load
    const [initFrom, initTo] = getPresetRange(currentPreset);
    refreshRekap(initFrom, initTo, bodyEl);

    // Preset button events
    container.querySelectorAll('.rekap-preset').forEach(btn => {
      btn.addEventListener('click', () => {
        container.querySelectorAll('.rekap-preset').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentPreset = btn.dataset.preset;
        if (currentPreset === 'custom') {
          customRange.style.display = '';
        } else {
          customRange.style.display = 'none';
          const [f, t] = getPresetRange(currentPreset);
          refreshRekap(f, t, bodyEl);
        }
      });
    });

    // Custom apply
    container.querySelector('#rekap-apply').addEventListener('click', () => {
      const f = container.querySelector('#rekap-from').value;
      const t = container.querySelector('#rekap-to').value;
      if (!f || !t || f > t) return;
      refreshRekap(f, t, bodyEl);
    });

    // Export
    container.querySelector('#btn-export-excel').addEventListener('click', () => {
      if (_rekapPerSiswa && _rekapDateRange)
        exportExcel(_rekapPerSiswa, _rekapDateRange.fromDate, _rekapDateRange.toDate);
    });
  }

  // ---- Init ----
  let _absensiRekapInited = false;

  async function initAbsensiRekap() {
    if (!_absensiRekapInited) {
      _absensiRekapInited = true;
      renderRekap();
    }
    await renderAbsensi();
    // Restart timer — clear dulu agar tidak ada interval ganda (leak prevention)
    if (_sessionTimerId) clearInterval(_sessionTimerId);
    _sessionTimerId = setInterval(syncSessionStatuses, 30_000);
  }

  window.addEventListener('DOMContentLoaded', async function () {
    const { data: { session } } = await client.auth.getSession();
    if (!session) return;

    const cId = new URLSearchParams(window.location.search).get('id');
    if (!cId) return;
    classroomId = cId;

    const { data: prof } = await client
      .from('profiles').select('id').eq('user_id', session.user.id).single();
    if (!prof) return;
    teacherId = prof.id;

    window.addEventListener('beforeunload', () => {
      if (_sessionTimerId) clearInterval(_sessionTimerId);
    });

    const tabJadwal = document.getElementById('tab-jadwal');
    if (tabJadwal) {
      tabJadwal.addEventListener('click', () => { initAbsensiRekap(); });
    }

    // Jadwal panel active by default (jika state tertentu)
    if (tabJadwal && tabJadwal.classList.contains('active')) {
      initAbsensiRekap();
    }
  });

}());
