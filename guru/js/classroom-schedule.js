(function () {
  'use strict';
  const client = window.supabaseClient;
  const DAYS   = ['SENIN','SELASA','RABU','KAMIS','JUMAT','SABTU'];

  let teacherId   = null;
  let classroomId = null;
  let schedules   = [];

  function esc(s) {
    return String(s ?? '')
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function fmt(t) { return t ? String(t).slice(0, 5) : ''; }
  function dayLabel(d) { return d[0] + d.slice(1).toLowerCase(); }

  // ---------------------------------------------------------------------------
  // Load
  // ---------------------------------------------------------------------------

  async function load() {
    const el = document.getElementById('jadwal-list');
    if (!el) return;
    el.innerHTML = '<p class="empty-state">Memuat jadwal…</p>';

    const { data, error } = await client
      .from('schedules')
      .select('id,day_of_week,start_time,end_time,is_active,inactive_reason')
      .eq('classroom_id', classroomId)
      .order('day_of_week').order('start_time');

    if (error) {
      el.innerHTML = '<p class="empty-state">Gagal memuat jadwal: ' + esc(error.message) + '</p>';
      return;
    }
    schedules = data || [];
    render();
  }

  // ---------------------------------------------------------------------------
  // Render table
  // ---------------------------------------------------------------------------

  function render() {
    const el = document.getElementById('jadwal-list');
    if (!el) return;

    const byDay = {};
    DAYS.forEach(d => { byDay[d] = []; });
    schedules.forEach(s => { if (byDay[s.day_of_week]) byDay[s.day_of_week].push(s); });

    const daysWithSchedule = DAYS.filter(d => byDay[d].length > 0);
    const emptyDays        = DAYS.filter(d => byDay[d].length === 0);

    el.innerHTML = '';

    // ── Empty state ──
    if (daysWithSchedule.length === 0) {
      const msg = document.createElement('p');
      msg.className   = 'empty-state';
      msg.textContent = 'Belum ada jadwal untuk classroom ini.';
      el.appendChild(msg);

      const btn = document.createElement('button');
      btn.className   = 'btn-add-first-sch';
      btn.textContent = '+ Tambah Jadwal Pertama';
      btn.addEventListener('click', () => openModal(null, 'SENIN'));
      el.appendChild(btn);
      return;
    }

    // ── Daftar flex: hanya hari yang punya jadwal ──
    const list = document.createElement('div');
    list.className = 'sch-list';

    daysWithSchedule.forEach(day => {
      byDay[day].forEach(s => {
        const badge = s.is_active
          ? '<span class="badge-aktif">Aktif</span>'
          : '<span class="badge-nonaktif">Nonaktif</span>' +
            (s.inactive_reason ? '<div class="sch-reason">' + esc(s.inactive_reason) + '</div>' : '');

        const row = document.createElement('div');
        row.className = 'sch-row';
        row.innerHTML =
          '<div class="sch-row-info">' +
            '<span class="sch-day">' + dayLabel(day) + '</span>' +
            '<span class="sch-time">' + esc(fmt(s.start_time)) + ' – ' + esc(fmt(s.end_time)) + '</span>' +
            badge +
          '</div>' +
          '<div class="sch-actions">' +
            '<button class="btn-sm btn-edit-sch" data-id="' + s.id + '">Edit</button>' +
            (s.is_active
              ? '<button class="btn-sm btn-sm-danger btn-toggle-sch" data-id="' + s.id + '" data-active="1">Nonaktifkan</button>'
              : '<button class="btn-sm btn-toggle-sch" data-id="' + s.id + '" data-active="0">Aktifkan</button>') +
            '<button class="btn-sm btn-sm-danger btn-del-sch" data-id="' + s.id + '">Hapus</button>' +
          '</div>';
        list.appendChild(row);
      });
    });

    el.appendChild(list);

    el.querySelectorAll('.btn-edit-sch').forEach(b =>
      b.addEventListener('click', () => {
        const s = schedules.find(x => x.id === b.dataset.id);
        if (s) openModal(s);
      }));

    el.querySelectorAll('.btn-toggle-sch').forEach(b =>
      b.addEventListener('click', () => toggleActive(b.dataset.id, b.dataset.active === '1')));

    el.querySelectorAll('.btn-del-sch').forEach(b =>
      b.addEventListener('click', () => delSchedule(b.dataset.id)));

    // ── Bar "+ Tambah Hari" (selalu tampil jika ada jadwal) ──
    const bar = document.createElement('div');
    bar.className = 'add-day-bar';

    const dayOptions = DAYS.map(d =>
      '<option value="' + d + '">' + dayLabel(d) + '</option>'
    ).join('');

    bar.innerHTML =
      '<select class="add-day-sel">' +
        '<option value="">Pilih hari…</option>' +
        dayOptions +
      '</select>' +
      '<button class="btn-add-day-confirm">+ Tambah Hari</button>';

    const dayBarInst = window.initCustomSelect
      ? window.initCustomSelect(bar.querySelector('.add-day-sel'))
      : null;
    if (dayBarInst) dayBarInst.el.style.flex = '1';

    bar.querySelector('.btn-add-day-confirm').addEventListener('click', function () {
      const val = dayBarInst ? dayBarInst.getValue() : bar.querySelector('.add-day-sel').value;
      if (!val) return;
      openModal(null, val);
    });

    el.appendChild(bar);
  }

  // ---------------------------------------------------------------------------
  // Modal tambah / edit
  // ---------------------------------------------------------------------------

  function openModal(sch, defaultDay) {
    document.getElementById('sch-overlay')?.remove();

    const isEdit  = !!sch;
    const overlay = document.createElement('div');
    overlay.id        = 'sch-overlay';
    overlay.className = 'share-overlay';

    const box = document.createElement('div');
    box.className  = 'share-box';
    box.style.gap  = '.625rem';

    const dayOptions = DAYS.map(d =>
      '<option value="' + d + '"' +
      ((isEdit ? sch.day_of_week === d : defaultDay === d) ? ' selected' : '') +
      '>' + dayLabel(d) + '</option>'
    ).join('');

    box.innerHTML =
      '<p><strong>' + (isEdit ? 'Edit Jadwal' : 'Tambah Jadwal') + '</strong></p>' +
      '<label class="sch-label">Hari' +
        '<select id="sch-day" class="sch-input">' + dayOptions + '</select>' +
      '</label>' +
      '<label class="sch-label">Jam Mulai' +
        '<input id="sch-start" type="time" class="sch-input"' +
        (isEdit ? ' value="' + esc(fmt(sch.start_time)) + '"' : '') + '>' +
      '</label>' +
      '<label class="sch-label">Jam Selesai' +
        '<input id="sch-end" type="time" class="sch-input"' +
        (isEdit ? ' value="' + esc(fmt(sch.end_time)) + '"' : '') + '>' +
      '</label>' +
      '<div id="sch-err" class="error-msg" style="display:none"></div>' +
      '<div style="display:flex;gap:.5rem;justify-content:flex-end;margin-top:.25rem">' +
        '<button type="button" id="sch-batal" class="btn-sm">Batal</button>' +
        '<button type="button" id="sch-simpan" class="btn-sm sch-btn-primary">Simpan</button>' +
      '</div>';

    overlay.appendChild(box);
    document.body.appendChild(overlay);

    const errEl   = box.querySelector('#sch-err');
    const btnSave = box.querySelector('#sch-simpan');

    const dayInst = window.initCustomSelect
      ? window.initCustomSelect(box.querySelector('#sch-day'))
      : null;
    if (dayInst) dayInst.el.style.width = '100%';

    function close() { overlay.remove(); document.removeEventListener('keydown', onEsc); }
    function onEsc(e) { if (e.key === 'Escape') close(); }
    document.addEventListener('keydown', onEsc);
    box.querySelector('#sch-batal').addEventListener('click', close);
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

    btnSave.addEventListener('click', async () => {
      const day   = dayInst ? dayInst.getValue() : box.querySelector('#sch-day').value;
      const start = box.querySelector('#sch-start').value;
      const end   = box.querySelector('#sch-end').value;

      errEl.style.display = 'none';

      if (!start || !end) {
        errEl.textContent = 'Jam mulai dan jam selesai wajib diisi.';
        errEl.style.display = 'block';
        return;
      }
      if (end <= start) {
        errEl.textContent = 'Jam selesai harus setelah jam mulai.';
        errEl.style.display = 'block';
        return;
      }

      btnSave.disabled    = true;
      btnSave.textContent = 'Memeriksa…';

      // p_teacher_id sengaja tidak dikirim: fungsi ini menentukan gurunya sendiri
      // lewat fn_current_profile_id(). Lihat migrasi 20260823000007/000008 (SEC-001).
      const { data: conflicts, error: cErr } = await client.rpc('fn_check_schedule_conflict', {
        p_day_of_week:  day,
        p_start_time:   start,
        p_end_time:     end,
        p_exclude_id:   isEdit ? sch.id : null,
      });

      if (cErr) {
        errEl.textContent = 'Gagal memeriksa konflik: ' + esc(cErr.message);
        errEl.style.display = 'block';
        btnSave.disabled = false; btnSave.textContent = 'Simpan';
        return;
      }

      if (conflicts && conflicts.length > 0) {
        const c = conflicts[0];
        errEl.textContent =
          'Bentrok dengan ' + esc(c.conflict_classroom_name) +
          ' (' + esc(c.conflict_day) + ' ' + esc(fmt(c.conflict_start)) + '–' + esc(fmt(c.conflict_end)) + ')';
        errEl.style.display = 'block';
        btnSave.disabled = false; btnSave.textContent = 'Simpan';
        return;
      }

      btnSave.textContent = 'Menyimpan…';

      const payload = { day_of_week: day, start_time: start, end_time: end };
      const { error: saveErr } = isEdit
        ? await client.from('schedules').update(payload).eq('id', sch.id)
        : await client.from('schedules').insert({
            ...payload,
            classroom_id: classroomId,
            teacher_id:   teacherId,
          });

      if (saveErr) {
        errEl.textContent = 'Gagal menyimpan: ' + esc(saveErr.message);
        errEl.style.display = 'block';
        btnSave.disabled = false; btnSave.textContent = 'Simpan';
        return;
      }

      close();
      await load();
      window.dispatchEvent(new CustomEvent('schedule-changed'));
    });

    box.querySelector('#sch-start').focus();
  }

  // ---------------------------------------------------------------------------
  // Modal alasan nonaktif
  // ---------------------------------------------------------------------------

  function showReasonModal(id) {
    document.getElementById('sch-reason-overlay')?.remove();

    const overlay = document.createElement('div');
    overlay.id        = 'sch-reason-overlay';
    overlay.className = 'share-overlay';

    const box = document.createElement('div');
    box.className = 'share-box';
    box.style.gap = '.625rem';
    box.innerHTML =
      '<p><strong>Nonaktifkan Jadwal</strong></p>' +
      '<label class="sch-label">Alasan nonaktif (wajib)' +
        '<input id="sch-reason-inp" type="text" class="sch-input"' +
        ' placeholder="misal: libur nasional, ujian…">' +
      '</label>' +
      '<div id="sch-reason-err" class="error-msg" style="display:none">Keterangan wajib diisi.</div>' +
      '<div style="display:flex;gap:.5rem;justify-content:flex-end;">' +
        '<button type="button" id="sch-reason-batal" class="btn-sm">Batal</button>' +
        '<button type="button" id="sch-reason-ok" class="btn-sm btn-sm-danger sch-btn-danger">Nonaktifkan</button>' +
      '</div>';

    overlay.appendChild(box);
    document.body.appendChild(overlay);

    const inp = box.querySelector('#sch-reason-inp');
    const err = box.querySelector('#sch-reason-err');

    function close() { overlay.remove(); document.removeEventListener('keydown', onEsc); }
    function onEsc(e) { if (e.key === 'Escape') close(); }
    document.addEventListener('keydown', onEsc);
    box.querySelector('#sch-reason-batal').addEventListener('click', close);
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

    box.querySelector('#sch-reason-ok').addEventListener('click', async () => {
      const reason = inp.value.trim();
      if (!reason) { err.style.display = 'block'; return; }

      const { error } = await client.from('schedules')
        .update({ is_active: false, inactive_reason: reason }).eq('id', id);
      if (error) {
        err.textContent = 'Gagal: ' + esc(error.message);
        err.style.display = 'block';
        return;
      }
      close();
      await load();
      window.dispatchEvent(new CustomEvent('schedule-changed'));
    });

    inp.focus();
  }

  // ---------------------------------------------------------------------------
  // Toggle aktif / nonaktif
  // ---------------------------------------------------------------------------

  async function toggleActive(id, isCurrentlyActive) {
    if (isCurrentlyActive) {
      showReasonModal(id);
    } else {
      const { error } = await client.from('schedules')
        .update({ is_active: true, inactive_reason: null }).eq('id', id);
      if (error) { alert('Gagal: ' + error.message); return; }
      await load();
      window.dispatchEvent(new CustomEvent('schedule-changed'));
    }
  }

  // ---------------------------------------------------------------------------
  // Hapus
  // ---------------------------------------------------------------------------

  async function delSchedule(id) {
    const { count, error: cntErr } = await client
      .from('attendance')
      .select('*', { count: 'exact', head: true })
      .eq('schedule_id', id);

    if (cntErr) { alert('Gagal memeriksa data absensi: ' + cntErr.message); return; }

    if (count > 0) {
      window.alert(
        `Jadwal ini memiliki ${count} sesi absensi yang tersimpan.\n\n` +
        `Menghapus jadwal akan MENGHAPUS PERMANEN seluruh data absensi tersebut dan tidak bisa dibatalkan.\n\n` +
        `Sebaiknya download rekap absensi terlebih dahulu (tab Absensi → Rekap → Export Excel) sebelum melanjutkan.`
      );
      if (!window.confirm(`Anda yakin ingin menghapus jadwal beserta ${count} sesi absensi ini?`)) return;
    } else {
      if (!window.confirm('Hapus jadwal ini? Tindakan ini tidak bisa dibatalkan.')) return;
    }

    const { error } = await client.from('schedules').delete().eq('id', id);
    if (error) { alert('Gagal hapus: ' + error.message); return; }
    await load();
    window.dispatchEvent(new CustomEvent('schedule-changed'));
  }

  // ---------------------------------------------------------------------------
  // Init — DOMContentLoaded
  // ---------------------------------------------------------------------------

  window.addEventListener('DOMContentLoaded', async function () {
    // Tab switching
    const tabSiswa    = document.getElementById('tab-siswa');
    const tabJadwal   = document.getElementById('tab-jadwal');
    const panelSiswa  = document.getElementById('panel-siswa');
    const panelJadwal = document.getElementById('panel-jadwal');

    if (tabSiswa && tabJadwal && panelSiswa && panelJadwal) {
      tabSiswa.addEventListener('click', () => {
        window.currentTab = 'siswa';
        tabSiswa.classList.add('active');
        tabJadwal.classList.remove('active');
        panelSiswa.style.display  = '';
        panelJadwal.style.display = 'none';
        const _cId = new URLSearchParams(window.location.search).get('id');
        if (_cId) try { localStorage.setItem('sip_tab_' + _cId, 'siswa'); } catch (_) {}
      });
      tabJadwal.addEventListener('click', () => {
        window.currentTab = 'jadwal';
        tabJadwal.classList.add('active');
        tabSiswa.classList.remove('active');
        panelSiswa.style.display  = 'none';
        panelJadwal.style.display = '';
        const _cId = new URLSearchParams(window.location.search).get('id');
        if (_cId) try { localStorage.setItem('sip_tab_' + _cId, 'jadwal'); } catch (_) {}
      });
    }

    // Auth — ambil session + profile sendiri (independen dari classroom.js)
    const { data: { session } } = await client.auth.getSession();
    if (!session) return;

    const cId = new URLSearchParams(window.location.search).get('id');
    if (!cId) return;
    classroomId = cId;

    const { data: prof } = await client
      .from('profiles').select('id').eq('user_id', session.user.id).single();
    if (!prof) return;
    teacherId = prof.id;

    await load();

    // Restore tab terakhir — setelah semua listener terpasang
    const savedTab = cId ? localStorage.getItem('sip_tab_' + cId) : null;
    if (savedTab === 'jadwal' && tabJadwal) tabJadwal.click();
  });

}());
