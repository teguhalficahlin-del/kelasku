// ─── Custom dropdown reusable (dark theme) ────────────────────────────────
window.initCustomSelect = function (nativeEl, onChange) {
  nativeEl.style.display = 'none';

  const wrap = document.createElement('div');
  wrap.className = 'custom-select';
  nativeEl.parentNode.insertBefore(wrap, nativeEl);
  wrap.appendChild(nativeEl);

  const trigger = document.createElement('div');
  trigger.className = 'custom-select-trigger';
  trigger.setAttribute('role', 'button');
  trigger.setAttribute('tabindex', '0');
  trigger.setAttribute('aria-haspopup', 'listbox');
  trigger.setAttribute('aria-expanded', 'false');

  const labelSpan = document.createElement('span');
  const arrowSpan = document.createElement('span');
  arrowSpan.className = 'custom-select-arrow';
  arrowSpan.textContent = '▾';
  trigger.appendChild(labelSpan);
  trigger.appendChild(arrowSpan);

  const list = document.createElement('ul');
  list.className = 'custom-select-list';
  list.setAttribute('role', 'listbox');
  list.style.display = 'none';

  wrap.appendChild(trigger);
  wrap.appendChild(list);

  var _value = nativeEl.value;
  var _ac    = null;

  function syncLabel() {
    var opt = Array.from(nativeEl.options).find(function (o) { return o.value === _value; });
    labelSpan.textContent = opt ? opt.text : (nativeEl.options[0] ? nativeEl.options[0].text : '');
  }

  function buildList() {
    list.innerHTML = '';
    Array.from(nativeEl.options).forEach(function (opt) {
      if (!opt.value) return;
      var li = document.createElement('li');
      li.className = 'custom-select-option' + (_value === opt.value ? ' selected' : '');
      li.setAttribute('role', 'option');
      li.setAttribute('tabindex', '-1');
      li.dataset.value = opt.value;
      li.textContent = opt.text;
      li.addEventListener('click', function () {
        _value = opt.value;
        nativeEl.value = opt.value;
        labelSpan.textContent = opt.text;
        list.querySelectorAll('.custom-select-option').forEach(function (o) { o.classList.remove('selected'); });
        li.classList.add('selected');
        closeList();
        trigger.focus();
        if (onChange) onChange(opt.value);
      });
      li.addEventListener('keydown', function (e) {
        var opts = Array.from(list.querySelectorAll('.custom-select-option'));
        var i    = opts.indexOf(li);
        if (e.key === 'ArrowDown') { e.preventDefault(); if (opts[i + 1]) opts[i + 1].focus(); }
        if (e.key === 'ArrowUp')   { e.preventDefault(); i === 0 ? trigger.focus() : opts[i - 1].focus(); }
        if (e.key === 'Escape')    { closeList(); trigger.focus(); }
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); li.click(); }
      });
      list.appendChild(li);
    });
    syncLabel();
  }

  function openList() {
    list.style.display = '';
    trigger.classList.add('open');
    trigger.setAttribute('aria-expanded', 'true');
    if (_ac) _ac.abort();
    _ac = new AbortController();
    document.addEventListener('click', function (e) {
      if (!wrap.contains(e.target)) closeList();
    }, { signal: _ac.signal });
  }

  function closeList() {
    list.style.display = 'none';
    trigger.classList.remove('open');
    trigger.setAttribute('aria-expanded', 'false');
    if (_ac) { _ac.abort(); _ac = null; }
  }

  trigger.addEventListener('click', function (e) {
    e.stopPropagation();
    list.style.display !== 'none' ? closeList() : openList();
  });
  trigger.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); list.style.display !== 'none' ? closeList() : openList(); }
    if (e.key === 'Escape') closeList();
    if (e.key === 'ArrowDown') { e.preventDefault(); openList(); var f = list.querySelector('.custom-select-option'); if (f) f.focus(); }
  });

  buildList();

  return {
    el: wrap,
    getValue: function () { return _value; },
    setValue: function (v) {
      _value = v;
      nativeEl.value = v;
      syncLabel();
      list.querySelectorAll('.custom-select-option').forEach(function (o) {
        o.classList.toggle('selected', o.dataset.value === v);
      });
    },
    refresh: function () {
      _value = nativeEl.value;
      buildList();
    },
    destroy: function () {
      closeList();
      if (wrap.parentNode) { wrap.parentNode.insertBefore(nativeEl, wrap); wrap.remove(); }
      nativeEl.style.display = '';
    },
  };
};

(function () {
  const client = window.supabaseClient;

  // =========================================================================
  // Halaman Login (index.html)
  // =========================================================================
  if (document.getElementById('form-login')) {
    const errorMsg = document.getElementById('error-msg');

    function showError(msg) { errorMsg.textContent = msg; errorMsg.style.display = 'block'; }
    function hideError()    { errorMsg.textContent = ''; errorMsg.style.display = 'none'; }

    window.addEventListener('DOMContentLoaded', async () => {
      const { data: { session } } = await client.auth.getSession();
      if (session) window.location.href = 'dashboard.html';
    });

    document.getElementById('form-login').addEventListener('submit', async function (e) {
      e.preventDefault();
      hideError();

      const email    = document.getElementById('email').value.trim();
      const password = document.getElementById('password').value;
      const btn      = document.getElementById('btn-masuk');

      btn.disabled = true;
      btn.textContent = 'Masuk...';

      const { error } = await client.auth.signInWithPassword({ email, password });

      if (error) {
        showError(error.message);
        btn.disabled = false;
        btn.textContent = 'Masuk';
        return;
      }

      // Ambil status trial sebelum redirect — disimpan agar dashboard tidak perlu RPC ulang
      try {
        const ts = await api.getTrialStatus();
        if (ts) sessionStorage.setItem('guru_trial_status', JSON.stringify(ts));
      } catch (_) { /* dashboard akan fallback ke RPC jika sessionStorage kosong */ }

      window.location.href = 'dashboard.html';
    });
  }

  // =========================================================================
  // Halaman Dashboard (dashboard.html)
  // =========================================================================
  if (document.getElementById('classroom-list')) {
    let currentTeacherId = null;

    // -- Render --

    const DAYS = ['SENIN','SELASA','RABU','KAMIS','JUMAT','SABTU'];
    function dayLabel(d) { return d[0] + d.slice(1).toLowerCase(); }

    function renderCard(classroom, count, hasSchedule) {
      const card = document.createElement('div');
      card.className = 'classroom-card';
      card.dataset.id = classroom.id;
      const noSchBanner = hasSchedule ? '' :
        '<div class="card-no-schedule">' +
          '<span>Jadwal belum diatur</span> — ' +
          '<a href="classroom.html?id=' + escHtml(classroom.id) + '" class="link-atur-jadwal">Atur sekarang</a>' +
        '</div>';
      card.innerHTML =
        '<div class="card-header">' +
          '<span class="card-name">' + escHtml(classroom.name) + '</span>' +
          '<span class="card-header-right">' +
            '<span class="card-code">' + escHtml(classroom.classroom_code) + '</span>' +
            '<span class="card-collapse-arrow">▾</span>' +
          '</span>' +
        '</div>' +
        '<div class="card-body-collapse">' +
          '<div class="card-subject">' + escHtml(classroom.subject || '') + '</div>' +
          (classroom.description ? '<div class="card-desc">' + escHtml(classroom.description) + '</div>' : '') +
          '<div class="card-count">' + count + ' siswa terdaftar</div>' +
          noSchBanner +
          '<div class="card-actions">' +
            '<button class="btn-edit-cl">Edit</button>' +
            '<button class="btn-hapus-cl btn-sm-danger">Hapus</button>' +
            '<a href="classroom.html?id=' + escHtml(classroom.id) + '" class="btn-kelola">Kelola</a>' +
          '</div>' +
        '</div>';

      // Default: body collapse tertutup — caller yang buka card pertama
      card.querySelector('.card-body-collapse').style.display = 'none';

      card.querySelector('.btn-edit-cl').addEventListener('click', () => openModal(classroom));
      card.querySelector('.btn-hapus-cl').addEventListener('click', () => handleDeleteClassroom(classroom.id, classroom.name));

      card.querySelector('.card-header').addEventListener('click', function () {
        const isOpen = card.querySelector('.card-body-collapse').style.display !== 'none';
        // Tutup semua card lain
        document.querySelectorAll('.classroom-card').forEach(function (other) {
          if (other !== card) {
            other.querySelector('.card-body-collapse').style.display = 'none';
            other.querySelector('.card-header').classList.remove('open');
          }
        });
        // Toggle card ini
        const body = card.querySelector('.card-body-collapse');
        const header = card.querySelector('.card-header');
        if (isOpen) {
          body.style.display = 'none';
          header.classList.remove('open');
        } else {
          body.style.display = '';
          header.classList.add('open');
        }
      });

      return card;
    }

    function openCard(card) {
      card.querySelector('.card-body-collapse').style.display = '';
      card.querySelector('.card-header').classList.add('open');
    }

    function closeAllCards() {
      document.querySelectorAll('.classroom-card').forEach(function (c) {
        c.querySelector('.card-body-collapse').style.display = 'none';
        c.querySelector('.card-header').classList.remove('open');
      });
    }

    function escHtml(str) {
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }

    async function loadClassrooms(teacherId) {
      const list = document.getElementById('classroom-list');
      list.innerHTML = '';

      const { data: classrooms, error } = await api.getClassrooms(teacherId);
      if (error) { list.innerHTML = '<p class="empty-state">Gagal memuat classroom: ' + escHtml(error.message) + '</p>'; return; }

      if (!classrooms || classrooms.length === 0) {
        list.innerHTML = '<p class="empty-state">Belum ada classroom. Klik \'+ Buat Classroom\' untuk mulai.</p>';
        return;
      }

      for (const cl of classrooms) {
        const count    = await api.getRosterCount(cl.id);
        const schCount = await api.getScheduleCount(cl.id);
        list.appendChild(renderCard(cl, count, schCount > 0));
      }

      // Buka card pertama secara default
      const firstCard = list.querySelector('.classroom-card');
      if (firstCard) openCard(firstCard);
    }

    // -- Modal multi-step --

    let createdClassroom  = null;  // set setelah step 1 berhasil
    let editClassroomId   = null;  // non-null saat mode edit
    const _schSelMap      = new WeakMap();

    function showStep(n) {
      document.getElementById('modal-step1').style.display = n === 1 ? '' : 'none';
      document.getElementById('modal-step2').style.display = n === 2 ? '' : 'none';
      document.getElementById('step-dot-1').classList.toggle('active', n === 1);
      document.getElementById('step-dot-2').classList.toggle('active', n === 2);
    }

    function openModal(classroom) {
      createdClassroom = null;
      editClassroomId  = classroom ? classroom.id : null;

      const h3  = document.querySelector('#modal-step1 h3');
      const btn = document.getElementById('btn-lanjut');

      if (classroom) {
        h3.textContent  = 'Edit Classroom';
        btn.textContent = 'Simpan';
        document.getElementById('inp-name').value    = classroom.name;
        document.getElementById('inp-subject').value = classroom.subject || '';
        document.getElementById('inp-desc').value    = classroom.description || '';
      } else {
        h3.textContent  = 'Buat Classroom Baru';
        btn.textContent = 'Lanjut →';
      }

      showStep(1);
      document.getElementById('modal-classroom').style.display = 'flex';
    }

    function resetModal() {
      document.getElementById('modal-classroom').style.display = 'none';
      document.getElementById('modal-error').style.display = 'none';
      document.getElementById('modal-error').textContent = '';
      document.getElementById('step2-error').style.display = 'none';
      document.getElementById('form-classroom').reset();
      document.getElementById('schedule-rows').innerHTML = '';
      document.querySelector('#modal-step1 h3').textContent = 'Buat Classroom Baru';
      document.getElementById('btn-lanjut').textContent = 'Lanjut →';
      showStep(1);
      createdClassroom = null;
      editClassroomId  = null;
    }

    function prependNewCard(hasSchedule) {
      const list = document.getElementById('classroom-list');
      const emptyState = list.querySelector('.empty-state');
      if (emptyState) list.innerHTML = '';
      closeAllCards();
      const card = renderCard(createdClassroom, 0, hasSchedule);
      list.prepend(card);
      openCard(card);
    }

    async function handleDeleteClassroom(classroomId, classroomName) {
      const stats = await api.getClassroomStats(classroomId);
      if (stats.error) {
        window.alert('Gagal memeriksa data classroom: ' + stats.error.message);
        return;
      }

      window.alert(
        '⚠️ PERINGATAN — Tindakan Tidak Bisa Dibatalkan\n\n' +
        'Anda akan menghapus classroom "' + classroomName + '" beserta SELURUH datanya:\n' +
        '• ' + stats.members  + ' siswa terdaftar\n' +
        '• ' + stats.sessions + ' sesi absensi tersimpan\n\n' +
        'Semua data ini akan hilang permanen dan tidak bisa dipulihkan.'
      );

      const input = window.prompt('Ketik nama classroom untuk konfirmasi:\n"' + classroomName + '"');
      if (input === null) return;
      if (input.trim().toLowerCase() !== classroomName.trim().toLowerCase()) {
        window.alert('Nama tidak cocok. Hapus dibatalkan.');
        return;
      }

      const { error } = await api.deleteClassroom(classroomId);
      if (error) {
        window.alert('Gagal menghapus classroom: ' + error.message);
        return;
      }

      const card = document.querySelector('.classroom-card[data-id="' + classroomId + '"]');
      if (card) card.remove();

      const list = document.getElementById('classroom-list');
      if (list && !list.querySelector('.classroom-card')) {
        list.innerHTML = '<p class="empty-state">Belum ada classroom. Klik \'+ Buat Classroom\' untuk mulai.</p>';
      }
    }

    function addScheduleRow() {
      const dayOptions = DAYS.map(d =>
        '<option value="' + d + '">' + dayLabel(d) + '</option>'
      ).join('');
      const tr = document.createElement('tr');
      tr.innerHTML =
        '<td><select class="sch-sel">' + dayOptions + '</select></td>' +
        '<td><input type="time" class="sch-t"></td>' +
        '<td><input type="time" class="sch-t"></td>' +
        '<td><button type="button" class="btn-hapus-row" title="Hapus baris">✕</button></td>';
      const selInst = window.initCustomSelect(tr.querySelector('.sch-sel'));
      selInst.el.style.width = '100%';
      _schSelMap.set(tr, selInst);
      tr.querySelector('.btn-hapus-row').addEventListener('click', () => {
        _schSelMap.get(tr)?.destroy();
        tr.remove();
      });
      document.getElementById('schedule-rows').appendChild(tr);
    }

    document.getElementById('btn-buat-classroom').addEventListener('click', () => openModal());
    document.getElementById('btn-batal').addEventListener('click', resetModal);

    document.getElementById('modal-backdrop').addEventListener('click', function () {
      if (createdClassroom) {
        prependNewCard(false);
      }
      resetModal();
    });

    document.getElementById('form-classroom').addEventListener('submit', async function (e) {
      e.preventDefault();

      const name        = document.getElementById('inp-name').value.trim();
      const subject     = document.getElementById('inp-subject').value.trim();
      const description = document.getElementById('inp-desc').value.trim();
      const btn         = document.getElementById('btn-lanjut');
      const modalError  = document.getElementById('modal-error');

      btn.disabled = true;
      btn.textContent = 'Menyimpan...';

      if (editClassroomId) {
        // ── Mode Edit ──
        const { data: updated, error } = await api.updateClassroom(editClassroomId, name, subject, description);
        if (error || !updated) {
          modalError.textContent = 'Gagal menyimpan: ' + (error?.message ?? 'respons tidak dikenali');
          modalError.style.display = 'block';
          btn.disabled = false;
          btn.textContent = 'Simpan';
          return;
        }
        const card = document.querySelector('.classroom-card[data-id="' + editClassroomId + '"]');
        if (card) {
          card.querySelector('.card-name').textContent    = updated.name;
          card.querySelector('.card-subject').textContent = updated.subject || '';
        }
        resetModal();
      } else {
        // ── Mode Create (tidak berubah) ──
        const { data: classroom, error } = await api.createClassroom(currentTeacherId, name, subject, description);
        if (error || !classroom) {
          modalError.textContent = 'Gagal membuat classroom: ' + (error?.message ?? 'respons tidak dikenali');
          modalError.style.display = 'block';
          btn.disabled = false;
          btn.textContent = 'Lanjut →';
          return;
        }
        createdClassroom = classroom;
        btn.disabled = false;
        btn.textContent = 'Lanjut →';
        modalError.style.display = 'none';
        showStep(2);
      }
    });

    document.getElementById('btn-tambah-hari').addEventListener('click', addScheduleRow);

    document.getElementById('btn-lewati')?.remove();

    document.getElementById('btn-simpan-jadwal').addEventListener('click', async function () {
      const rows  = [...document.querySelectorAll('#schedule-rows tr')];
      const errEl = document.getElementById('step2-error');
      const btn   = document.getElementById('btn-simpan-jadwal');

      if (rows.length === 0) {
        prependNewCard(false);
        resetModal();
        return;
      }

      // Validasi semua baris
      const entries = [];
      for (const tr of rows) {
        const day   = _schSelMap.get(tr)?.getValue() ?? '';
        const times = tr.querySelectorAll('.sch-t');
        const start = times[0].value;
        const end   = times[1].value;

        if (!start || !end) {
          errEl.textContent = 'Semua baris jadwal harus diisi jam mulai dan jam selesai.';
          errEl.style.display = 'block';
          return;
        }
        if (end <= start) {
          errEl.textContent = 'Jam selesai harus setelah jam mulai (' + dayLabel(day) + ' ' + start + '–' + end + ').';
          errEl.style.display = 'block';
          return;
        }
        entries.push({ day, start, end });
      }

      errEl.style.display = 'none';
      btn.disabled = true;
      btn.textContent = 'Menyimpan…';

      const supabase = window.supabaseClient;

      for (const entry of entries) {
        const { data: conflicts, error: cErr } = await supabase.rpc('fn_check_schedule_conflict', {
          p_teacher_id:   currentTeacherId,
          p_classroom_id: createdClassroom.id,
          p_day_of_week:  entry.day,
          p_start_time:   entry.start,
          p_end_time:     entry.end,
          p_exclude_id:   null,
        });

        if (cErr) {
          errEl.textContent = 'Gagal memeriksa konflik: ' + escHtml(cErr.message);
          errEl.style.display = 'block';
          btn.disabled = false; btn.textContent = 'Simpan & Buat Classroom';
          return;
        }

        if (conflicts && conflicts.length > 0) {
          const c = conflicts[0];
          errEl.textContent =
            'Jadwal ' + dayLabel(entry.day) + ' ' + entry.start + '–' + entry.end +
            ' bentrok dengan "' + escHtml(c.conflict_classroom_name) + '"' +
            ' (' + escHtml(c.conflict_day) + ' ' + String(c.conflict_start).slice(0,5) + '–' + String(c.conflict_end).slice(0,5) + ').';
          errEl.style.display = 'block';
          btn.disabled = false; btn.textContent = 'Simpan & Buat Classroom';
          return;
        }

        const { error: saveErr } = await supabase.from('schedules').insert({
          classroom_id: createdClassroom.id,
          teacher_id:   currentTeacherId,
          day_of_week:  entry.day,
          start_time:   entry.start,
          end_time:     entry.end,
        });

        if (saveErr) {
          errEl.textContent = 'Gagal menyimpan jadwal: ' + escHtml(saveErr.message);
          errEl.style.display = 'block';
          btn.disabled = false; btn.textContent = 'Simpan & Buat Classroom';
          return;
        }
      }

      prependNewCard(true);
      resetModal();
    });

    // -- Logout --

    document.getElementById('btn-logout').addEventListener('click', async () => {
      await api.signOut();
      window.location.href = 'index.html';
    });

    // -- Trial UI --

    function applyTrialUI(ts) {
      if (!ts) return;
      const banner  = document.getElementById('trial-banner');
      const btnBuat = document.getElementById('btn-buat-classroom');

      if (ts.status === 'trial') {
        banner.className   = 'trial-banner trial-info';
        banner.textContent = 'Trial aktif — ' + ts.hari_tersisa + ' hari tersisa.';
        banner.style.display = 'block';
      } else if (ts.status === 'expired') {
        banner.className   = 'trial-banner trial-expired';
        banner.textContent = 'Trial habis. Hubungi admin untuk aktivasi.';
        banner.style.display = 'block';
        btnBuat.disabled = true;
        btnBuat.title    = 'Trial habis — hubungi admin untuk aktivasi';
      }
      // status 'belum_trial': guru belum buat classroom — tidak tampilkan banner
    }

    // -- Init --

    window.addEventListener('DOMContentLoaded', async () => {
      const { data: { session } } = await api.getSession();
      if (!session) { window.location.href = 'index.html'; return; }

      const { data: profile, error: profileError } = await api.getProfile(session.user.id);
      if (profileError || !profile) { window.location.href = 'index.html'; return; }

      currentTeacherId = profile.id;
      document.getElementById('guru-name').textContent = profile.full_name;

      // Baca status trial dari sessionStorage (diisi saat login)
      // Fallback ke RPC jika navigasi langsung atau sessionStorage kosong
      let trialStatus = null;
      try {
        const stored = sessionStorage.getItem('guru_trial_status');
        if (stored) { trialStatus = JSON.parse(stored); }
      } catch (_) {}

      if (!trialStatus) {
        trialStatus = await api.getTrialStatus();
        if (trialStatus) {
          try { sessionStorage.setItem('guru_trial_status', JSON.stringify(trialStatus)); } catch (_) {}
        }
      }

      applyTrialUI(trialStatus);

      await loadClassrooms(currentTeacherId);
    });
  }

}());
