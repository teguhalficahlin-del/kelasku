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

  // Jendela koreksi: guru masih boleh mengisi absensi sampai 1 jam setelah
  // sesi berakhir. Sebelumnya form mati tepat di end_time, sehingga guru yang
  // kehilangan sinyal atau baru sempat mengisi saat istirahat kehilangan data
  // hari itu untuk selamanya.
  const GRACE_MENIT = 60;

  let teacherId   = null;
  let classroomId = null;

  // Selisih antara jam server dan jam perangkat, dalam milidetik.
  // Nol sampai fn_server_now() berhasil dipanggil; artinya perilaku terburuk
  // sama dengan perilaku lama (memakai jam perangkat), bukan lebih buruk.
  let _driftMs = 0;

  // Per-session in-memory state: { siswa: [...], page: 0 }
  const sessionState = {};

  // Auto-status timer
  let _todaySchedules = [];
  let _loadedDate     = null;
  let _sessionTimerId = null;

  // Rekap cache
  let _rekapPerSiswa   = null;
  let _rekapDateRange  = null;
  let _rekapPage       = 0;
  const REKAP_PER_PAGE = 10;
  const REKAP_SESI_MAX = 10;

  // ---- Utility ----
  function esc(s) {
    return String(s ?? '')
      .replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  // Instant dari server, diterjemahkan ke waktu dinding lokal perangkat.
  // Jam perangkat yang salah tidak lagi menggeser jendela sesi; zona waktu
  // perangkat tetap dihormati.
  function sekarang() {
    return new Date(Date.now() + _driftMs);
  }

  async function sinkronWaktuServer() {
    try {
      const { data, error } = await client.rpc('fn_server_now');
      if (error || !data) return;
      const serverMs = new Date(data).getTime();
      if (!Number.isFinite(serverMs)) return;
      _driftMs = serverMs - Date.now();
    } catch (_) {
      // Biarkan _driftMs apa adanya — jatuh kembali ke jam perangkat.
    }
  }

  function todayStr() {
    const d = sekarang();
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
    const d = sekarang();
    return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:00`;
  }

  function todayDayName() { return DAY_NAMES[sekarang().getDay()]; }

  // Tambahkan menit ke string jam 'HH:MM:SS'. Dibatasi 23:59:59 supaya sesi
  // yang berakhir menjelang tengah malam tidak melompat ke hari berikutnya —
  // absensi selalu dicatat pada tanggal sesi itu sendiri.
  function tambahMenit(timeStr, menit) {
    const [h, m, s] = String(timeStr).split(':').map(Number);
    const total = h * 60 + m + menit;
    if (total >= 24 * 60) return '23:59:59';
    return `${String(Math.floor(total / 60)).padStart(2,'0')}:` +
           `${String(total % 60).padStart(2,'0')}:` +
           `${String(s || 0).padStart(2,'0')}`;
  }

  function pct(n, total) { return total ? Math.round(n / total * 100) : 0; }

  // AKTIF   → sesi sedang berlangsung
  // KOREKSI → sesi sudah lewat tetapi masih dalam jendela 1 jam; form tetap
  //           bisa diisi dan disimpan
  // SELESAI → jendela koreksi habis, form terkunci
  function sessionStatus(sch) {
    if (!sch.is_active) return 'NONAKTIF';
    const now = currentTimeStr();
    if (now < sch.start_time) return 'BELUM_MULAI';
    if (now <= sch.end_time)  return 'AKTIF';
    if (now <= tambahMenit(sch.end_time, GRACE_MENIT)) return 'KOREKSI';
    return 'SELESAI';
  }

  function bolehDiisi(status) {
    return status === 'AKTIF' || status === 'KOREKSI';
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
  // Kedua pemuat di bawah melempar saat query gagal, bukan mengembalikan array
  // kosong. Sebelumnya error dibuang diam-diam, sehingga jaringan yang putus
  // tampil persis seperti "belum ada jadwal hari ini" — guru tidak punya cara
  // membedakan keduanya, dan pemanggilnya menganggap render berhasil.
  async function loadTodaySchedules() {
    const day = todayDayName();
    if (day === 'AHAD') return [];
    const { data, error } = await client
      .from('schedules')
      .select('id,day_of_week,start_time,end_time,is_active')
      .eq('classroom_id', classroomId)
      .eq('day_of_week', day)
      .eq('is_active', true)
      .order('start_time');
    if (error) throw error;
    return data || [];
  }

  async function loadRoster() {
    const { data, error } = await client
      .from('classroom_roster')
      .select('profile_id,full_name,nis')
      .eq('classroom_id', classroomId)
      .not('profile_id', 'is', null)
      .order('full_name');
    if (error) throw error;
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
            state.dirty = true;
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
    const done   = !bolehDiisi(status);

    // Build state. Tanda yang sudah dipasang guru tetapi belum disimpan
    // dipertahankan — render ulang tidak boleh menghapus pekerjaan yang belum
    // tersimpan. Status dari server hanya dipakai untuk siswa yang belum
    // disentuh guru pada sesi ini.
    const existing = await loadExistingAttendance(sid, tanggal);
    const sebelum  = sessionState[sid];
    const tersimpanDiLayar = (sebelum && sebelum.dirty)
      ? sebelum.siswa.reduce((acc, s) => { acc[s.profile_id] = s.status; return acc; }, {})
      : {};

    const siswa = roster.map(r => ({
      profile_id: r.profile_id,
      full_name:  r.full_name,
      nis:        r.nis,
      status:     tersimpanDiLayar[r.profile_id] || existing[r.profile_id] || 'HADIR',
    }));
    sessionState[sid] = {
      siswa,
      page:  sebelum ? sebelum.page : 0,
      dirty: !!(sebelum && sebelum.dirty),
    };
    const state = sessionState[sid];
    if (state.page > Math.ceil(siswa.length / PAGE_SIZE) - 1) state.page = 0;

    const totalPages = Math.max(1, Math.ceil(siswa.length / PAGE_SIZE));

    // Empat keadaan, empat warna, terang-redupnya bercerita sendiri:
    // amber KOREKSI paling menuntut (waktunya terbatas), hijau AKTIF sedang
    // berjalan, warm BELUM MULAI hadir tapi belum mendesak, abu-abu SELESAI
    // paling redup karena sudah lewat. Sebelumnya KOREKSI ikut memakai hijau
    // AKTIF dan BELUM MULAI memakai merah NONAKTIF — dua salah baca sekaligus.
    const badgeClass = status === 'AKTIF'   ? 'badge-aktif'
      : status === 'KOREKSI'  ? 'badge-koreksi'
      : status === 'SELESAI'  ? 'badge-selesai'
      : status === 'NONAKTIF' ? 'badge-nonaktif'
      : 'badge-belum-mulai';
    const badgeLabel = status === 'AKTIF'   ? 'AKTIF'
      : status === 'KOREKSI'  ? 'MASA KOREKSI'
      : status === 'SELESAI'  ? 'SELESAI'
      : status === 'NONAKTIF' ? 'NONAKTIF'
      : 'BELUM MULAI';

    const block = document.createElement('div');
    block.className = 'abs-session';
    block.dataset.scheduleId = sid;

    const hasSiswa = siswa.length > 0;

    // Baris ringkas: seluruh baris adalah tombolnya. Detail absensi dibungkus
    // .abs-session-body yang tertutup secara default; membukanya menutup sesi
    // lain (single expand).
    block.innerHTML =
      `<div class="abs-sesi-header">` +
        `<span class="abs-sesi-tanggal">${esc(fmtDisplayDate(tanggal))}</span>` +
        `<span class="abs-sesi-jam">${esc(fmtTime(sch.start_time))} – ${esc(fmtTime(sch.end_time))}</span>` +
        `<span class="${badgeClass}">${badgeLabel}</span>` +
        `<span class="abs-sesi-panah">▾</span>` +
      `</div>` +
      `<div class="abs-session-body" style="display:none">` +
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
                `<span class="abs-save-msg">` +
                  (status === 'KOREKSI'
                    ? `Masa koreksi — bisa diisi sampai ` +
                      esc(fmtTime(tambahMenit(sch.end_time, GRACE_MENIT)))
                    : '') +
                `</span>` +
              `</div>`
            : `<p class="abs-disabled-msg">` +
                (status === 'SELESAI'
                  ? 'Masa koreksi sudah lewat (1 jam setelah sesi berakhir). ' +
                    'Data absensi tidak dapat diubah lagi.'
                  : 'Sesi belum dimulai.') +
              `</p>`)
        : `<p class="empty-state">` +
            'Siswa di kelas ini belum memiliki akun, jadi belum bisa diabsen. ' +
            'Buka tab <strong>Kelola Siswa</strong> → centang siswa → ' +
            '<strong>Generate Terpilih</strong> untuk mengaktifkan mereka.' +
            `<br><button type="button" class="btn-ke-kelola-siswa">Ke Kelola Siswa</button>` +
          `</p>`
      ) +
      `</div>`;

    // Single expand: membuka satu sesi menutup yang lain, supaya di layar HP
    // hanya ada satu daftar siswa yang perlu digulir pada satu waktu.
    const headerEl = block.querySelector('.abs-sesi-header');
    const bodyEl   = block.querySelector('.abs-session-body');
    headerEl.addEventListener('click', () => {
      const sedangTerbuka = bodyEl.style.display !== 'none';
      const container = document.getElementById('absensi-container');
      if (container) {
        container.querySelectorAll('.abs-session').forEach(b => {
          const h = b.querySelector('.abs-sesi-header');
          const d = b.querySelector('.abs-session-body');
          if (h && d) { h.classList.remove('open'); d.style.display = 'none'; }
        });
      }
      if (!sedangTerbuka) {
        headerEl.classList.add('open');
        bodyEl.style.display = '';
      }
    });

    // Pintasan ke tab Kelola Siswa saat roster belum punya akun
    const btnKeSiswa = block.querySelector('.btn-ke-kelola-siswa');
    if (btnKeSiswa) {
      btnKeSiswa.addEventListener('click', () => {
        document.getElementById('tab-siswa')?.click();
      });
    }

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
      let touchStartX = 0, touchStartY = 0;
      listEl.addEventListener('touchstart', e => {
        touchStartX = e.changedTouches[0].clientX;
        touchStartY = e.changedTouches[0].clientY;
      }, { passive: true });
      listEl.addEventListener('touchend', e => {
        const dx = e.changedTouches[0].clientX - touchStartX;
        const dy = e.changedTouches[0].clientY - touchStartY;
        if (Math.abs(dx) < 50 || Math.abs(dx) <= Math.abs(dy)) return;
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
            state.dirty = false;
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

    // Jam server disegarkan setiap render, bukan sekali saat halaman dibuka —
    // guru kerap membiarkan aplikasi terbuka berjam-jam.
    await sinkronWaktuServer();

    const tanggal = todayStr();
    const [schedules, roster] = await Promise.all([loadTodaySchedules(), loadRoster()]);

    _todaySchedules = schedules;
    _loadedDate     = todayStr();

    // Tanggal kini tercetak di setiap baris sesi, jadi judul tanggal terpisah
    // di atas daftar hanya mengulang hal yang sama.
    container.innerHTML = '';

    if (schedules.length === 0) {
      const msg = document.createElement('p');
      msg.className   = 'empty-state';
      msg.textContent = 'Tidak ada sesi mengajar hari ini';
      container.appendChild(msg);
      return;
    }

    for (const sch of schedules) {
      container.appendChild(await renderSession(sch, roster, tanggal));
    }

    // Snapshot status awal setiap sesi untuk deteksi perubahan oleh timer
    _todaySchedules.forEach(s => { s._lastKnownStatus = sessionStatus(s); });
  }

  // ---- In-place: sesi masuk masa koreksi (masih bisa diisi) ----
  function markKoreksiBlock(block, sch) {
    const badge = block.querySelector('.abs-sesi-header .badge-aktif');
    if (badge) { badge.className = 'badge-koreksi'; badge.textContent = 'MASA KOREKSI'; }
    const msgEl = block.querySelector('.abs-save-msg');
    if (msgEl && !msgEl.textContent) {
      msgEl.textContent = 'Masa koreksi — bisa diisi sampai ' +
        fmtTime(tambahMenit(sch.end_time, GRACE_MENIT));
    }
  }

  // ---- In-place disable saat masa koreksi habis ----
  function disableSessionBlock(block) {
    const badge = block.querySelector('.abs-sesi-header .badge-aktif, .abs-sesi-header .badge-koreksi');
    if (badge) { badge.className = 'badge-selesai'; badge.textContent = 'SELESAI'; }
    block.querySelectorAll('.abs-status-btn').forEach(b => { b.disabled = true; });
    const saveRow = block.querySelector('.abs-save-row');
    if (saveRow) {
      const msg = document.createElement('p');
      msg.className   = 'abs-disabled-msg';
      msg.textContent = 'Masa koreksi sudah lewat (1 jam setelah sesi berakhir). ' +
                        'Data absensi tidak dapat diubah lagi.';
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

      const block = container.querySelector(`.abs-session[data-schedule-id="${sch.id}"]`);

      if (sch._lastKnownStatus === 'BELUM_MULAI' && newStatus === 'AKTIF') {
        // Form sedang disabled — re-render aman, tidak ada data guru yang hilang
        needsRerender = true;
      } else if (newStatus === 'KOREKSI') {
        // Sesi berakhir tetapi masih boleh diisi — cukup ganti label, jangan
        // sentuh tombol maupun state.
        if (block) markKoreksiBlock(block, sch);
      } else if (bolehDiisi(sch._lastKnownStatus) && newStatus === 'SELESAI') {
        // Disable in-place agar perubahan status siswa yang belum disimpan tetap terlihat
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
      byId[r.profile_id] = { full_name: r.full_name, nis: r.nis, HADIR: 0, SAKIT: 0, IZIN: 0, ALPHA: 0, sessions: [] };
    });
    rows.forEach(r => {
      if (byId[r.student_id]) {
        if (byId[r.student_id][r.status] !== undefined) byId[r.student_id][r.status]++;
        byId[r.student_id].sessions.push({ tanggal: r.tanggal, status: r.status });
      }
    });
    Object.values(byId).forEach(s => s.sessions.sort((a, b) => b.tanggal.localeCompare(a.tanggal)));
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
    return perSiswa.map(s => {
      const t = s.HADIR + s.SAKIT + s.IZIN + s.ALPHA;
      const pctH = t ? Math.round(s.HADIR / t * 100) : 0;
      const detail = s.sessions.map(ses => {
        const stLow = ses.status.toLowerCase();
        return `<div class="rekap-detail-row">` +
          `<span class="rekap-detail-date">${esc(ses.tanggal)}</span>` +
          `<span class="rekap-detail-status rekap-status-${stLow}">${STATUS_LABELS[ses.status]}</span>` +
        `</div>`;
      }).join('');
      return `<div class="rekap-siswa-row">` +
        `<div class="rekap-siswa-header">` +
          `<span class="rekap-siswa-nama">${esc(s.full_name)}</span>` +
          `<div class="rekap-siswa-stats">` +
            `<span class="rekap-stat-h">${s.HADIR}H</span>` +
            `<span class="rekap-stat-sep">·</span>` +
            `<span class="rekap-stat-s">${s.SAKIT}S</span>` +
            `<span class="rekap-stat-sep">·</span>` +
            `<span class="rekap-stat-i">${s.IZIN}I</span>` +
            `<span class="rekap-stat-sep">·</span>` +
            `<span class="rekap-stat-a">${s.ALPHA}A</span>` +
            `<span class="rekap-stat-pct">${pctH}%</span>` +
            `<span class="rekap-arrow">▾</span>` +
          `</div>` +
        `</div>` +
        `<div class="rekap-siswa-detail" style="display:none">${detail}</div>` +
      `</div>`;
    }).join('');
  }

  function renderRekapPage(perSiswa, bodyEl) {
    if (perSiswa.length === 0) {
      bodyEl.innerHTML = '<p class="empty-state">Belum ada data absensi dalam rentang ini.</p>';
      return;
    }
    const total      = perSiswa.length;
    const totalPages = Math.ceil(total / REKAP_PER_PAGE);
    const start      = _rekapPage * REKAP_PER_PAGE;
    const end        = Math.min(start + REKAP_PER_PAGE, total);
    const slice      = perSiswa.slice(start, end);

    const rowsHtml = slice.map(s => {
      const t = s.HADIR + s.SAKIT + s.IZIN + s.ALPHA;
      const pctH = t ? Math.round(s.HADIR / t * 100) : 0;
      const displaySessions = s.sessions.slice(0, REKAP_SESI_MAX);
      const detail = displaySessions.map(ses => {
        const stLow = ses.status.toLowerCase();
        return `<div class="rekap-detail-row">` +
          `<span class="rekap-detail-date">${esc(ses.tanggal)}</span>` +
          `<span class="rekap-detail-status rekap-status-${stLow}">${STATUS_LABELS[ses.status]}</span>` +
        `</div>`;
      }).join('');
      const moreNotif = s.sessions.length >= REKAP_SESI_MAX
        ? `<div class="rekap-more-notif">Data lebih dari ${REKAP_SESI_MAX} entri. ` +
          `<button class="rekap-btn-export-hint">Download Excel</button> untuk melihat rekap dan detail kehadiran per sesi.</div>`
        : '';
      return `<div class="rekap-siswa-row">` +
        `<div class="rekap-siswa-header">` +
          `<span class="rekap-siswa-nama">${esc(s.full_name)}</span>` +
          `<div class="rekap-siswa-stats">` +
            `<span class="rekap-stat-h">${s.HADIR}H</span>` +
            `<span class="rekap-stat-sep">·</span>` +
            `<span class="rekap-stat-s">${s.SAKIT}S</span>` +
            `<span class="rekap-stat-sep">·</span>` +
            `<span class="rekap-stat-i">${s.IZIN}I</span>` +
            `<span class="rekap-stat-sep">·</span>` +
            `<span class="rekap-stat-a">${s.ALPHA}A</span>` +
            `<span class="rekap-stat-pct">${pctH}%</span>` +
            `<span class="rekap-arrow">▾</span>` +
          `</div>` +
        `</div>` +
        `<div class="rekap-siswa-detail" style="display:none">${detail}${moreNotif}</div>` +
      `</div>`;
    }).join('');

    const pgHtml = totalPages > 1
      ? `<div class="rekap-pagination">` +
          `<button class="rekap-pg-prev"${_rekapPage === 0 ? ' disabled' : ''}>←</button>` +
          `<span class="rekap-pg-label">Siswa ${start + 1}–${end} dari ${total}</span>` +
          `<button class="rekap-pg-next"${_rekapPage >= totalPages - 1 ? ' disabled' : ''}>→</button>` +
        `</div>`
      : '';

    bodyEl.innerHTML = rowsHtml + pgHtml;

    // Collapse listeners
    bodyEl.querySelectorAll('.rekap-siswa-header').forEach(header => {
      header.addEventListener('click', () => {
        const detail = header.nextElementSibling;
        const arrow  = header.querySelector('.rekap-arrow');
        const isOpen = detail.style.display !== 'none';
        detail.style.display = isOpen ? 'none' : 'block';
        arrow.classList.toggle('open', !isOpen);
      });
    });

    // Pagination listeners
    const btnPrev = bodyEl.querySelector('.rekap-pg-prev');
    const btnNext = bodyEl.querySelector('.rekap-pg-next');
    if (btnPrev) btnPrev.addEventListener('click', () => { _rekapPage--; renderRekapPage(perSiswa, bodyEl); });
    if (btnNext) btnNext.addEventListener('click', () => { _rekapPage++; renderRekapPage(perSiswa, bodyEl); });

    // Export hint listeners
    bodyEl.querySelectorAll('.rekap-btn-export-hint').forEach(btn => {
      btn.addEventListener('click', () => {
        const btnExport = document.getElementById('btn-export-excel');
        if (btnExport) btnExport.click();
      });
    });

    // Swipe gesture untuk rekap
    bodyEl.removeEventListener('touchstart', bodyEl._rekapSwipeStart);
    bodyEl.removeEventListener('touchend',   bodyEl._rekapSwipeEnd);
    bodyEl._rekapSwipeStart = function (e) {
      bodyEl._rekapTouchX = e.touches[0].clientX;
      bodyEl._rekapTouchY = e.touches[0].clientY;
    };
    bodyEl._rekapSwipeEnd = function (e) {
      const dx = e.changedTouches[0].clientX - bodyEl._rekapTouchX;
      const dy = e.changedTouches[0].clientY - bodyEl._rekapTouchY;
      if (Math.abs(dx) < 50 || Math.abs(dx) <= Math.abs(dy)) return;
      if (dx < 0 && _rekapPage < totalPages - 1) { _rekapPage++; renderRekapPage(perSiswa, bodyEl); }
      else if (dx > 0 && _rekapPage > 0)         { _rekapPage--; renderRekapPage(perSiswa, bodyEl); }
    };
    bodyEl.addEventListener('touchstart', bodyEl._rekapSwipeStart, { passive: true });
    bodyEl.addEventListener('touchend',   bodyEl._rekapSwipeEnd,   { passive: true });
  }

  async function refreshRekap(fromDate, toDate, bodyEl) {
    bodyEl.innerHTML = '<p class="empty-state">Memuat rekap…</p>';
    const { rows, roster } = await loadRekapData(fromDate, toDate);
    const summary  = buildRekapSummary(rows);
    const perSiswa = buildRekapPerSiswa(rows, roster);

    _rekapPage = 0;
    renderRekapPage(perSiswa, bodyEl);

    // Cache for Excel export + enable tombol
    _rekapPerSiswa  = perSiswa;
    _rekapDateRange = { fromDate, toDate };
    // tombol export tidak pernah disabled — tidak perlu di-enable di sini
  }

  function slugify(s) {
    return String(s || '').toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }

  function exportExcel(perSiswa, fromDate, toDate) {
    const slug     = slugify(window._classroomName || '');
    const today    = new Date().toISOString().slice(0, 10);
    const parts    = ['rekap-absensi'];
    if (slug) parts.push(slug);
    parts.push(fromDate, 'sd', toDate, today);
    const filename = parts.join('-') + '.xlsx';

    function fmtTanggal(s) {
      if (!s) return '';
      const [y, m, d] = s.split('-');
      return `${d}/${m}/${y}`;
    }

    // Sheet 1: Rekap per siswa
    const wsRekap = [
      ['Nama', 'NIS', 'H', 'S', 'I', 'A', '% Hadir'],
      ...perSiswa.map(s => {
        const t = s.HADIR + s.SAKIT + s.IZIN + s.ALPHA;
        return [s.full_name, s.nis || '', s.HADIR, s.SAKIT, s.IZIN, s.ALPHA,
          (t ? Math.round(s.HADIR / t * 100) : 0) + '%'];
      }),
    ];

    // Sheet 2: Detail per sesi (sort: tanggal asc, lalu nama)
    const detailRows = [];
    perSiswa.forEach(s => {
      s.sessions.forEach(ses => {
        detailRows.push({ nama: s.full_name, nis: s.nis || '', tanggal: ses.tanggal, status: ses.status });
      });
    });
    detailRows.sort((a, b) => a.tanggal.localeCompare(b.tanggal) || a.nama.localeCompare(b.nama));
    const wsDetail = [
      ['Nama', 'NIS', 'Tanggal', 'Status'],
      ...detailRows.map(r => [r.nama, r.nis, fmtTanggal(r.tanggal), r.status]),
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(wsRekap),  'Rekap Absensi');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(wsDetail), 'Detail Per Sesi');
    XLSX.writeFile(wb, filename);
  }

  function renderRekap() {
    const container = document.getElementById('rekap-container');
    if (!container || container.dataset.init) return;
    container.dataset.init = '1';

    const [defaultFrom, defaultTo] = getPresetRange('bulan');

    container.innerHTML =
      `<small style="font-size:var(--fs-caption);color:var(--text-muted);font-style:italic;margin-top:0.35rem;display:block;">Atur rentang tanggal sesuai kebutuhan sebelum export. Default menampilkan bulan berjalan.</small>` +
      `<div class="rekap-date-range">` +
        `<div class="rekap-date-group">` +
          `<label class="rekap-date-label" for="rekap-from">Dari</label>` +
          `<input type="date" id="rekap-from" class="rekap-date-input" value="${defaultFrom}">` +
        `</div>` +
        `<div class="rekap-date-group">` +
          `<label class="rekap-date-label" for="rekap-to">Sampai</label>` +
          `<input type="date" id="rekap-to" class="rekap-date-input" value="${defaultTo}">` +
        `</div>` +
      `</div>` +
      `<button id="rekap-toggle" class="rekap-toggle-btn">Tampilkan</button>` +
      `<div id="rekap-body" style="display:none"></div>`;

    // Sisipkan tombol Export Excel ke header h2 setelah initCollapseSections wrap
    const rekapPanel = container.closest('.panel');
    const rekapH2    = rekapPanel ? rekapPanel.querySelector('h2.panel-header') : null;
    if (rekapH2) {
      const exportBtn     = document.createElement('button');
      exportBtn.id        = 'btn-export-excel';
      exportBtn.className = 'btn-export-header';
      exportBtn.disabled  = false;
      exportBtn.textContent = 'Export Excel';
      const arrow = rekapH2.querySelector('.panel-collapse-arrow');
      rekapH2.insertBefore(exportBtn, arrow);
    }

    const bodyEl   = container.querySelector('#rekap-body');
    const toggleBtn = container.querySelector('#rekap-toggle');

    // Toggle tampilkan / sembunyikan
    toggleBtn.addEventListener('click', () => {
      if (toggleBtn.textContent === 'Tampilkan') {
        const f = container.querySelector('#rekap-from').value;
        const t = container.querySelector('#rekap-to').value;
        if (!f || !t || f > t) {
          bodyEl.style.display = 'block';
          bodyEl.innerHTML = '<p class="empty-state">Rentang tanggal tidak valid.</p>';
          return;
        }
        refreshRekap(f, t, bodyEl);
        bodyEl.style.display = 'block';
        toggleBtn.textContent = 'Sembunyikan';
      } else {
        bodyEl.style.display = 'none';
        toggleBtn.textContent = 'Tampilkan';
      }
    });

    // Export
    const exportBtnEl = document.getElementById('btn-export-excel');
    if (exportBtnEl) exportBtnEl.addEventListener('click', function (e) {
      e.stopPropagation();
      if (!_rekapPerSiswa) {
        alert('Tampilkan rekap terlebih dahulu sebelum export.');
        return;
      }
      if (_rekapPerSiswa.length === 0) {
        alert('Tidak ada data absensi dalam rentang tanggal ini.');
        return;
      }
      exportExcel(_rekapPerSiswa, _rekapDateRange.fromDate, _rekapDateRange.toDate);
    });
  }

  // ---- Init ----
  let _absensiRekapInited = false;
  let _absensiSudahDirender = false;

  // Ada tanda absensi yang dipasang guru tetapi belum ditekan Simpan?
  function adaPerubahanBelumTersimpan() {
    return Object.keys(sessionState).some(sid => sessionState[sid] && sessionState[sid].dirty);
  }

  async function initAbsensiRekap() {
    if (!_absensiRekapInited) {
      _absensiRekapInited = true;
      renderRekap();
    }
    // Render hanya sekali. Sebelumnya renderAbsensi() dipanggil pada SETIAP
    // klik tab Jadwal, sehingga state absensi yang belum disimpan dibangun
    // ulang dari database — tanda S/I/A yang sudah dipasang guru diam-diam
    // kembali ke HADIR hanya karena guru mampir ke tab sebelah.
    // Perubahan status sesi (mis. AKTIF → SELESAI) tetap ditangani timer
    // 30 detik di bawah, jadi tampilan tidak menjadi basi.
    if (!_absensiSudahDirender) {
      // Penanda dipasang SETELAH render berhasil, bukan sebelumnya. Kalau
      // dipasang lebih dulu dan renderAbsensi() gagal — jaringan putus, RPC
      // menolak — panel tinggal kosong selamanya: setiap kunjungan berikutnya
      // ke tab ini melihat penandanya sudah true dan melewati render, sehingga
      // satu-satunya jalan keluar bagi guru adalah memuat ulang halaman.
      try {
        await renderAbsensi();
        _absensiSudahDirender = true;
      } catch (err) {
        // Sengaja dibiarkan false: kunjungan berikutnya ke tab ini mencoba
        // lagi. Panelnya juga tidak ditinggal menggantung di "Memuat…" —
        // guru diberi tahu apa yang terjadi dan jalan keluarnya.
        console.error('renderAbsensi', err);
        const wadah = document.getElementById('absensi-container');
        if (wadah) {
          wadah.innerHTML =
            '<p class="empty-state">Gagal memuat absensi. Periksa koneksi, ' +
            'lalu buka kembali tab ini untuk mencoba lagi.</p>';
        }
      }
    }
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

    window.addEventListener('beforeunload', (e) => {
      if (_sessionTimerId) clearInterval(_sessionTimerId);
      // Absensi yang belum disimpan tidak boleh hilang tanpa sepatah kata pun.
      if (adaPerubahanBelumTersimpan()) {
        e.preventDefault();
        e.returnValue = '';
        return '';
      }
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

  window.addEventListener('schedule-changed', function () {
    renderAbsensi();
  });

  // Roster berubah (siswa baru di-generate akunnya, atau dihapus) — daftar
  // absensi ikut disegarkan. Tanda yang belum disimpan tetap dipertahankan
  // oleh renderSession, jadi render ulang di sini aman.
  window.addEventListener('roster-changed', function () {
    if (!_absensiSudahDirender) return;   // panel belum pernah dibuka
    // Penandanya dijatuhkan lebih dulu, lalu dipasang kembali hanya bila render
    // ini berhasil. Tanpa itu, render yang gagal di sini meninggalkan penanda
    // tetap true sementara panelnya sudah terlanjur dikosongkan — kunjungan
    // berikutnya ke tab Jadwal melewati render, dan guru terkurung pada panel
    // kosong sampai halaman dimuat ulang.
    _absensiSudahDirender = false;
    renderAbsensi()
      .then(function () { _absensiSudahDirender = true; })
      .catch(function (err) { console.error('renderAbsensi (roster-changed)', err); });
  });

}());
