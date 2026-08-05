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
          '<span class="card-code">' + escHtml(classroom.classroom_code) + '</span>' +
        '</div>' +
        '<div class="card-subject">' + escHtml(classroom.subject || '') + '</div>' +
        '<div class="card-count">' + count + ' siswa terdaftar</div>' +
        noSchBanner +
        '<a href="classroom.html?id=' + escHtml(classroom.id) + '" class="btn-kelola">Kelola</a>';
      return card;
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
    }

    // -- Modal multi-step --

    let createdClassroom = null;  // set setelah step 1 berhasil

    function showStep(n) {
      document.getElementById('modal-step1').style.display = n === 1 ? '' : 'none';
      document.getElementById('modal-step2').style.display = n === 2 ? '' : 'none';
      document.getElementById('step-dot-1').classList.toggle('active', n === 1);
      document.getElementById('step-dot-2').classList.toggle('active', n === 2);
    }

    function openModal() {
      createdClassroom = null;
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
      showStep(1);
      createdClassroom = null;
    }

    function prependNewCard(hasSchedule) {
      const list = document.getElementById('classroom-list');
      const emptyState = list.querySelector('.empty-state');
      if (emptyState) list.innerHTML = '';
      list.prepend(renderCard(createdClassroom, 0, hasSchedule));
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
      tr.querySelector('.btn-hapus-row').addEventListener('click', () => tr.remove());
      document.getElementById('schedule-rows').appendChild(tr);
    }

    document.getElementById('btn-buat-classroom').addEventListener('click', openModal);
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
    });

    document.getElementById('btn-tambah-hari').addEventListener('click', addScheduleRow);

    document.getElementById('btn-lewati').addEventListener('click', function () {
      prependNewCard(false);
      resetModal();
    });

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
        const day   = tr.querySelector('.sch-sel').value;
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
