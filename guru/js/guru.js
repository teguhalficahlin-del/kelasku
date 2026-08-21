// initCustomSelect dipindahkan ke shared/js/custom-select.js agar dapat
// dipakai juga oleh classroom.html. Muat berkas itu sebelum berkas ini.


(function () {
  const client = window.supabaseClient;

  // =========================================================================
  // Halaman Login (index.html)
  // =========================================================================
  if (document.getElementById('form-login')) {
    const errorMsg = document.getElementById('error-msg');

    function showError(msg) { errorMsg.textContent = msg; errorMsg.style.display = 'block'; }
    function hideError()    { errorMsg.textContent = ''; errorMsg.style.display = 'none'; }

    // Pesan yang dititipkan halaman lain sebelum mengalihkan ke sini — saat ini
    // hanya reset semester. Dipakai sekali lalu dibuang, supaya tidak muncul
    // lagi pada kunjungan berikutnya.
    function tampilkanPesanTitipan() {
      let sebab = null;
      try {
        sebab = sessionStorage.getItem('sip_pesan_login');
        if (sebab) sessionStorage.removeItem('sip_pesan_login');
      } catch (_) { return; }
      if (sebab === 'reset-semester') {
        const el = document.getElementById('login-info');
        if (el) {
          el.textContent = 'Semester berhasil direset. ' +
            'Silakan masuk kembali untuk memulai semester baru.';
          el.style.display = 'block';
        }
      }
    }

    window.addEventListener('DOMContentLoaded', async () => {
      tampilkanPesanTitipan();
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
        const { data: ts } = await client.rpc('fn_guru_trial_status');
        if (ts) sessionStorage.setItem('guru_trial_status', JSON.stringify(ts));
        else sessionStorage.removeItem('guru_trial_status');
      } catch (_) { sessionStorage.removeItem('guru_trial_status'); }

      window.location.href = 'dashboard.html';
    });

    // -----------------------------------------------------------------------
    // Lupa password
    // -----------------------------------------------------------------------
    // Supabase Auth yang mengirim emailnya (SMTP Brevo), jadi tidak ada Edge
    // Function di jalur ini — cukup resetPasswordForEmail dari klien.
    const linkLupa   = document.getElementById('link-lupa');
    const panelReset = document.getElementById('reset-panel');
    const formLogin  = document.getElementById('form-login');
    const formMinta  = document.getElementById('form-reset-minta');

    if (linkLupa && panelReset && formMinta) {
      const okReset  = document.getElementById('reset-ok');
      const btnKirim = document.getElementById('btn-kirim-reset');
      const btnBatal = document.getElementById('btn-batal-reset');
      const linkDaftar = document.querySelector('.link-daftar');
      let sisaCooldown = 0;
      let timerCooldown = null;

      function tampilkanPanelReset(aktif) {
        formLogin.style.display  = aktif ? 'none' : '';
        linkLupa.parentElement.style.display = aktif ? 'none' : '';
        if (linkDaftar) linkDaftar.style.display = aktif ? 'none' : '';
        panelReset.style.display = aktif ? 'block' : 'none';
        hideError();
        if (aktif) document.getElementById('reset-email').focus();
      }

      // Supabase membatasi pengiriman email pemulihan; hitung mundur ini
      // menjelaskan penundaan itu, alih-alih membiarkan guru menekan tombol
      // berkali-kali dan mengira aplikasinya rusak.
      function mulaiCooldown(detik) {
        sisaCooldown = detik;
        btnKirim.disabled = true;
        clearInterval(timerCooldown);
        timerCooldown = setInterval(function () {
          sisaCooldown--;
          if (sisaCooldown <= 0) {
            clearInterval(timerCooldown);
            btnKirim.disabled    = false;
            btnKirim.textContent = 'Kirim Link Reset';
            return;
          }
          btnKirim.textContent = 'Tunggu ' + sisaCooldown + ' detik';
        }, 1000);
        btnKirim.textContent = 'Tunggu ' + sisaCooldown + ' detik';
      }

      linkLupa.addEventListener('click', function (e) {
        e.preventDefault();
        okReset.style.display = 'none';
        tampilkanPanelReset(true);
      });

      btnBatal.addEventListener('click', function () {
        tampilkanPanelReset(false);
      });

      formMinta.addEventListener('submit', async function (e) {
        e.preventDefault();
        hideError();
        okReset.style.display = 'none';

        const email = document.getElementById('reset-email').value.trim();
        if (!email) return;

        btnKirim.disabled    = true;
        btnKirim.textContent = 'Mengirim…';

        // APP_BASE_URL diturunkan dari lokasi berkas, jadi tautan tetap benar
        // di GitHub Pages maupun domain sendiri tanpa mengubah kode.
        const akar = (window.SIP_CONFIG && window.SIP_CONFIG.APP_BASE_URL) ||
                     (window.location.origin + window.location.pathname.replace(/\/guru\/.*$/, ''));
        const redirectTo = akar + '/guru/reset-password.html';

        const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo });

        // Pesan sukses dan gagal sama-sama tidak menyatakan apakah email itu
        // terdaftar — kalau berbeda, halaman login berubah menjadi alat
        // pemeriksa keanggotaan bagi siapa pun yang mencoba.
        okReset.textContent = error
          ? 'Jika email ini terdaftar, link reset akan dikirim dalam beberapa menit.'
          : 'Link reset password sudah dikirim ke ' + email +
            '. Periksa juga folder spam.';
        okReset.style.display = 'block';

        mulaiCooldown(60);
      });
    }
  }

  // =========================================================================
  // Halaman Dashboard (dashboard.html)
  // =========================================================================
  if (document.getElementById('classroom-list')) {
    let currentTeacherId  = null;
    let currentRoleGuru   = null;
    let cachedClassrooms  = [];

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
      if (error) { list.innerHTML = '<p class="empty-state">Gagal memuat kelas: ' + escHtml(error.message) + '</p>'; return; }

      cachedClassrooms = classrooms || [];

      if (!classrooms || classrooms.length === 0) {
        list.innerHTML =
          '<div class="empty-state">' +
            '<p>Belum ada kelas.</p>' +
            '<button class="btn-buat-cl-empty">+ Buat Kelas Pertama</button>' +
          '</div>';
        list.querySelector('.btn-buat-cl-empty').addEventListener('click', function () { openModal(); });
        return;
      }

      // Dimuat paralel. Sebelumnya dua permintaan per kelas dijalankan
      // berurutan di dalam loop — guru dengan 6 kelas menunggu 12 permintaan
      // berantai sebelum kartu terakhir muncul.
      // allSettled, bukan all: satu kelas yang gagal dihitung tidak boleh
      // menghentikan kelas lain.
      const hasil = await Promise.allSettled(classrooms.map(cl =>
        Promise.all([api.getRosterCount(cl.id), api.getScheduleCount(cl.id)])
          .then(([count, schCount]) => ({ cl, count, schCount }))
      ));

      hasil.forEach((r, i) => {
        if (r.status === 'fulfilled') {
          list.appendChild(renderCard(r.value.cl, r.value.count, r.value.schCount > 0));
        } else {
          // Kartu tetap ditampilkan — kelasnya nyata, hanya hitungannya gagal.
          list.appendChild(renderCard(classrooms[i], '—', false));
        }
      });

      // Buka card pertama secara default
      const firstCard = list.querySelector('.classroom-card');
      if (firstCard) openCard(firstCard);

      // Batasi 1 classroom untuk status TRIAL
      const _ts = JSON.parse(sessionStorage.getItem('guru_trial_status') || 'null');
      if (_ts && _ts.status === 'TRIAL' && classrooms.length >= 1) {
        const btnBuat = document.getElementById('btn-buat-classroom');
        btnBuat.disabled = true;
        btnBuat.title    = 'Upgrade ke Guru untuk membuat lebih dari 1 kelas';
      }
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
        h3.textContent  = 'Edit Kelas';
        btn.textContent = 'Simpan';
        document.getElementById('inp-name').value    = classroom.name;
        document.getElementById('inp-subject').value = classroom.subject || '';
        document.getElementById('inp-desc').value    = classroom.description || '';
      } else {
        h3.textContent  = 'Buat Kelas Baru';
        btn.textContent = 'Lanjut →';
      }

      showStep(1);

      // Sembunyikan field Mata Pelajaran untuk Wali Kelas SD
      const subjectLabel = document.querySelector('label[for="inp-subject"]');
      const subjectInput = document.getElementById('inp-subject');
      if (currentRoleGuru === 'WALI_KELAS' || currentRoleGuru === 'WALI_KELAS_SD') {
        subjectLabel.style.display = 'none';
        subjectInput.style.display = 'none';
        if (!classroom) subjectInput.value = 'Semua Mata Pelajaran';
        subjectInput.removeAttribute('required');
      } else {
        subjectLabel.style.display = '';
        subjectInput.style.display = '';
        subjectInput.setAttribute('required', '');
      }

      document.getElementById('modal-classroom').style.display = 'flex';
    }

    function resetModal() {
      document.getElementById('modal-classroom').style.display = 'none';
      document.getElementById('modal-error').style.display = 'none';
      document.getElementById('modal-error').textContent = '';
      document.getElementById('step2-error').style.display = 'none';
      document.getElementById('form-classroom').reset();
      document.getElementById('schedule-rows').innerHTML = '';
      const _sl = document.querySelector('label[for="inp-subject"]');
      const _si = document.getElementById('inp-subject');
      if (_sl) _sl.style.display = '';
      if (_si) { _si.style.display = ''; _si.setAttribute('required', ''); }
      document.querySelector('#modal-step1 h3').textContent = 'Buat Kelas Baru';
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
        window.alert('Gagal memeriksa data kelas: ' + stats.error.message);
        return;
      }

      window.alert(
        '⚠️ PERINGATAN — Tindakan Tidak Bisa Dibatalkan\n\n' +
        'Anda akan menghapus kelas "' + classroomName + '" beserta SELURUH datanya:\n' +
        '• ' + stats.members  + ' siswa terdaftar\n' +
        '• ' + stats.sessions + ' sesi absensi tersimpan\n' +
        '• ' + stats.notes    + ' catatan siswa\n\n' +
        'Semua data ini akan hilang permanen dan tidak bisa dipulihkan.'
      );

      const input = window.prompt('Ketik nama kelas untuk konfirmasi:\n"' + classroomName + '"');
      if (input === null) return;
      if (input.trim().toLowerCase() !== classroomName.trim().toLowerCase()) {
        window.alert('Nama tidak cocok. Hapus dibatalkan.');
        return;
      }

      const { error } = await api.deleteClassroom(classroomId);
      if (error) {
        window.alert('Gagal menghapus kelas: ' + error.message);
        return;
      }

      const card = document.querySelector('.classroom-card[data-id="' + classroomId + '"]');
      if (card) card.remove();

      const list = document.getElementById('classroom-list');
      if (list && !list.querySelector('.classroom-card')) {
        list.innerHTML = '<p class="empty-state">Belum ada kelas. Klik \'+ Buat Kelas\' untuk mulai.</p>';
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
        // ── Validasi batasan classroom per role ──
        if (cachedClassrooms.length >= 1) {
          if (currentRoleGuru === 'WALI_KELAS' || currentRoleGuru === 'WALI_KELAS_SD') {
            modalError.textContent = 'Wali Kelas SD hanya dapat memiliki 1 kelas. Hubungi admin jika perlu bantuan.';
            modalError.style.display = 'block';
            btn.disabled = false;
            btn.textContent = 'Lanjut →';
            return;
          }
          // MAPEL (atau null — default aman): cek konsistensi mapel
          const existingSubject = cachedClassrooms[0]?.subject ?? '';
          if (subject.toLowerCase().trim() !== existingSubject.toLowerCase().trim()) {
            modalError.textContent =
              'Anda sudah mengajar ' + (existingSubject || 'mata pelajaran lain') + '. ' +
              'Akun Guru hanya mendukung 1 mata pelajaran. ' +
              'Buat kelas baru dengan mapel yang sama atau hubungi admin.';
            modalError.style.display = 'block';
            btn.disabled = false;
            btn.textContent = 'Lanjut →';
            return;
          }
        }

        // ── Mode Create ──
        const { data: classroom, error } = await api.createClassroom(currentTeacherId, name, subject, description);
        if (error || !classroom) {
          modalError.textContent = 'Gagal membuat kelas: ' + (error?.message ?? 'respons tidak dikenali');
          modalError.style.display = 'block';
          btn.disabled = false;
          btn.textContent = 'Lanjut →';
          return;
        }
        createdClassroom = classroom;
        cachedClassrooms = [...cachedClassrooms, classroom];
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
          btn.disabled = false; btn.textContent = 'Simpan & Buat Kelas';
          return;
        }

        if (conflicts && conflicts.length > 0) {
          const c = conflicts[0];
          errEl.textContent =
            'Jadwal ' + dayLabel(entry.day) + ' ' + entry.start + '–' + entry.end +
            ' bentrok dengan "' + escHtml(c.conflict_classroom_name) + '"' +
            ' (' + escHtml(c.conflict_day) + ' ' + String(c.conflict_start).slice(0,5) + '–' + String(c.conflict_end).slice(0,5) + ').';
          errEl.style.display = 'block';
          btn.disabled = false; btn.textContent = 'Simpan & Buat Kelas';
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
          btn.disabled = false; btn.textContent = 'Simpan & Buat Kelas';
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

      if (ts.status === 'TRIAL') {
        banner.className   = 'trial-banner trial-info';
        banner.textContent = 'Trial aktif — ' + ts.hari_tersisa + ' hari tersisa.';
        banner.style.display = 'block';
      } else if (ts.status === 'EXPIRED') {
        banner.className   = 'trial-banner trial-expired';
        banner.textContent = 'Trial habis. Hubungi admin untuk aktivasi.';
        banner.style.display = 'block';
        btnBuat.disabled = true;
        btnBuat.title    = 'Trial habis — hubungi admin untuk aktivasi';
      }
      // status 'belum_trial': guru belum buat classroom — tidak tampilkan banner
    }

    // -- Modal Pilih Peran --

    function showModalPeran() {
      return new Promise(function (resolve) {
        const modal  = document.getElementById('modal-peran');
        const btnOk  = document.getElementById('btn-simpan-peran');
        const cards  = modal.querySelectorAll('.peran-card');
        let chosenPeran = null;

        cards.forEach(function (card) {
          card.addEventListener('click', function () {
            cards.forEach(function (c) { c.classList.remove('selected'); });
            card.classList.add('selected');
            chosenPeran = card.dataset.peran;
            btnOk.disabled = false;
          });
        });

        btnOk.addEventListener('click', async function () {
          if (!chosenPeran) return;
          btnOk.disabled = true;
          btnOk.textContent = 'Menyimpan...';

          try {
            await api.declareAndLockRole(chosenPeran);
          } catch (err) {
            btnOk.disabled = false;
            btnOk.textContent = 'Simpan & Lanjut';
            window.alert('Peran tidak dapat dikunci: ' + (err?.message || 'kesalahan server'));
            return;
          }

          modal.style.display = 'none';
          resolve(chosenPeran);
        });

        modal.style.display = 'flex';
      });
    }

    // -- Init --

    window.addEventListener('DOMContentLoaded', async () => {
      const { data: { session } } = await api.getSession();
      if (!session) { window.location.href = 'index.html'; return; }

      const { data: profile, error: profileError } = await api.getProfile(session.user.id);
      if (profileError || !profile) {
        // Sesi masih sah — hanya profilnya gagal dimuat. Melempar ke halaman
        // login di sini menciptakan lingkaran: halaman login melihat sesi masih
        // ada, lalu melempar balik ke dashboard, dan seterusnya. Tampilkan
        // kondisi gagal apa adanya dan biarkan pengguna mencoba lagi.
        console.error('[guru] gagal memuat profil:', profileError);
        document.getElementById('classroom-list').innerHTML =
          '<div class="empty-state">' +
          '<p>Gagal memuat data akun. Periksa koneksi internet Anda.</p>' +
          '<button class="btn-buat-cl-empty" id="btn-coba-lagi">Coba lagi</button>' +
          '</div>';
        document.getElementById('btn-coba-lagi')
          ?.addEventListener('click', function () { window.location.reload(); });
        return;
      }

      currentTeacherId = profile.id;
      currentRoleGuru  = profile.role_guru ?? null;
      document.getElementById('guru-name').textContent = profile.full_name;

      if (!profile.role_locked_at) {
        currentRoleGuru = await showModalPeran();
      }

      // Server selalu authoritative; getTrialStatus menimpa cache browser.
      const trialStatus = await api.getTrialStatus();

      applyTrialUI(trialStatus);
      applySemesterUI(getCurrentSemesterPhase());

      await loadClassrooms(currentTeacherId);
    });
  }

  // -------------------------------------------------------------------------
  // Help Dashboard
  // -------------------------------------------------------------------------

  var HELP_DASHBOARD = {
    title: 'Panduan Dashboard',
    intro: 'Halaman ini adalah pusat kendali semua kelas Anda.',
    items: [
      { text: 'Klik <strong>+ Buat Kelas</strong> untuk membuat ruang kelas baru. Satu kelas mewakili satu kelas dan satu mata pelajaran — jika mengajar 3 kelas berbeda, buat 3 kelas terpisah. Gunakan kolom <strong>Deskripsi</strong> untuk mencatat nama sekolah atau keterangan tambahan, contoh: <em>SMP Negeri 1 Banyuwangi</em>.' },
      { text: 'Saat membuat kelas, Anda bisa langsung menambahkan <strong>jadwal mengajar</strong> di langkah kedua — atau lewati dulu dan atur jadwal belakangan via tombol <strong>Kelola</strong>. Tanpa jadwal, fitur absensi tidak bisa digunakan.' },
      { text: 'Setelah berhasil simpan, setiap kelas akan menampilkan kode unik, jumlah siswa, dan status jadwal. Klik <strong>Kelola</strong> untuk masuk dan mengelola siswa, jadwal, catatan, serta penilaian.' },
      { text: 'Klik <strong>Edit</strong> untuk ubah nama kelas, mata pelajaran, atau deskripsi. Klik <strong>Hapus</strong> untuk hapus kelas beserta seluruh datanya secara permanen.' },
      { text: 'Banner kuning di atas menunjukkan sisa hari trial Anda. Hubungi admin untuk aktivasi akun setelah trial berakhir.' }
    ]
  };

  function renderHelpItemDashboard(item) {
    return '<div class="help-item"><div class="help-item-row"><span class="help-item-arrow">→</span><span class="help-item-text">' + item.text + '</span></div></div>';
  }

  function openHelpDashboard() {
    document.getElementById('help-title').textContent = HELP_DASHBOARD.title;
    document.getElementById('help-intro').textContent = HELP_DASHBOARD.intro;
    document.getElementById('help-body').innerHTML = HELP_DASHBOARD.items.map(renderHelpItemDashboard).join('');
    var overlay = document.getElementById('help-overlay');
    overlay.style.display = 'flex';
    requestAnimationFrame(function () { overlay.classList.add('help-overlay-visible'); });
  }

  function closeHelpDashboard() {
    var overlay = document.getElementById('help-overlay');
    overlay.classList.remove('help-overlay-visible');
    setTimeout(function () { overlay.style.display = 'none'; }, 200);
  }

  var strip = document.getElementById('help-strip');
  if (strip) strip.addEventListener('click', openHelpDashboard);
  var closeBtn = document.getElementById('help-close');
  if (closeBtn) closeBtn.addEventListener('click', closeHelpDashboard);
  var overlay = document.getElementById('help-overlay');
  if (overlay) {
    overlay.addEventListener('click', function (e) {
      if (!e.target.closest('.help-modal')) closeHelpDashboard();
    });
  }

  // -------------------------------------------------------------------------
  // Semester Phase
  // -------------------------------------------------------------------------

  var SEMESTER_PHASES = [
    { sem: 2, fase: 'aktif',     mmdd_start: '01-01', mmdd_end: '06-14' },
    { sem: 2, fase: 'persiapan', mmdd_start: '06-15', mmdd_end: '06-29' },
    { sem: 2, fase: 'terkunci',  mmdd_start: '06-30', mmdd_end: '06-30' },
    { sem: 1, fase: 'aktif',     mmdd_start: '07-01', mmdd_end: '12-14' },
    { sem: 1, fase: 'persiapan', mmdd_start: '12-15', mmdd_end: '12-30' },
    { sem: 1, fase: 'terkunci',  mmdd_start: '12-31', mmdd_end: '12-31' },
  ];

  function getCurrentSemesterPhase() {
    var now   = new Date();
    var month = String(now.getMonth() + 1).padStart(2, '0');
    var day   = String(now.getDate()).padStart(2, '0');
    var mmdd  = month + '-' + day;
    for (var i = 0; i < SEMESTER_PHASES.length; i++) {
      var p = SEMESTER_PHASES[i];
      if (mmdd >= p.mmdd_start && mmdd <= p.mmdd_end) return p;
    }
    return null;
  }

  // Kumpulkan jumlah data yang akan dihapus, supaya angka di modal konfirmasi
  // adalah kondisi nyata akun ini — bukan kalimat umum yang mudah diabaikan.
  // Yang dihitung adalah jumlah SESI MENGAJAR (baris schedules), bukan jumlah
  // baris attendance. Keduanya jauh berbeda: satu sesi menghasilkan satu baris
  // absensi per siswa, sehingga kelas 30 siswa dengan 10 sesi punya 300 baris.
  // Menyebut angka itu "sesi" membuat guru mengira ia kehilangan jauh lebih
  // banyak daripada yang sebenarnya.
  async function ringkasanDataSemester() {
    var ringkas = { kelas: 0, sesi: 0, catatan: 0, gagal: false };
    try {
      var db = window.supabaseClient;
      var kelasRes = await db.from('classrooms')
        .select('id', { count: 'exact' })
        .eq('teacher_id', currentTeacherId);
      if (kelasRes.error) throw kelasRes.error;

      ringkas.kelas = kelasRes.count ?? (kelasRes.data ? kelasRes.data.length : 0);
      var ids = (kelasRes.data || []).map(function (c) { return c.id; });
      if (ids.length === 0) return ringkas;

      var hasil = await Promise.all([
        db.from('schedules').select('*', { count: 'exact', head: true }).in('classroom_id', ids),
        db.from('student_notes').select('*', { count: 'exact', head: true }).in('classroom_id', ids),
      ]);
      if (hasil[0].error || hasil[1].error) throw (hasil[0].error || hasil[1].error);
      ringkas.sesi    = hasil[0].count ?? 0;
      ringkas.catatan = hasil[1].count ?? 0;
    } catch (_) {
      ringkas.gagal = true;
    }
    return ringkas;
  }

  // Konfirmasi berlapis untuk operasi paling destruktif di aplikasi ini.
  // Sebelumnya hanya confirm() biasa — pagar yang lebih rendah daripada
  // menghapus satu kelas, yang justru mewajibkan guru mengetik nama kelasnya.
  function modalResetSemester(ringkas) {
    return new Promise(function (resolve) {
      var FRASA = 'RESET SEMESTER';

      var overlay = document.createElement('div');
      overlay.className = 'share-overlay';
      overlay.id = 'reset-semester-overlay';

      var box = document.createElement('div');
      box.className = 'share-box';

      var title = document.createElement('p');
      title.innerHTML = '<strong>Mulai Semester Baru</strong>';

      var rincian = document.createElement('div');
      rincian.style.cssText = 'font-size:.875rem;line-height:1.7;margin:.25rem 0 .5rem;';
      rincian.innerHTML = ringkas.gagal
        ? 'Jumlah data tidak dapat dihitung (koneksi bermasalah). ' +
          'Seluruh absensi, catatan, jadwal, dan penilaian di semua kelas Anda akan dihapus.'
        : 'Yang akan dihapus permanen dari <strong>' + ringkas.kelas + ' kelas</strong>:' +
          '<br>• ' + ringkas.sesi + ' sesi mengajar beserta absensinya' +
          '<br>• ' + ringkas.catatan + ' catatan siswa' +
          '<br>• seluruh jadwal dan penilaian';

      var peringatan = document.createElement('p');
      peringatan.style.cssText = 'color:#c0392b;font-weight:600;margin:.25rem 0 .5rem;';
      peringatan.textContent =
        'Data tidak dapat dipulihkan. Pastikan Anda sudah meng-export rekap absensi ' +
        'dan catatan sebelum melanjutkan.';

      var label = document.createElement('p');
      label.style.cssText = 'font-size:.875rem;margin:0 0 .25rem;';
      label.innerHTML = 'Ketik <strong>' + FRASA + '</strong> untuk mengaktifkan tombol hapus:';

      var inp = document.createElement('input');
      inp.type        = 'text';
      inp.placeholder = FRASA;
      inp.autocapitalize = 'characters';
      inp.style.cssText = 'width:100%;box-sizing:border-box;padding:.45rem;border:1px solid #ddd;border-radius:.4rem;font-size:1rem;';

      var rowBtn = document.createElement('div');
      rowBtn.style.cssText = 'display:flex;gap:.5rem;justify-content:flex-end;margin-top:.5rem;';

      var btnBatal = document.createElement('button');
      btnBatal.type        = 'button';
      btnBatal.textContent = 'Batal';

      var btnOk = document.createElement('button');
      btnOk.type        = 'button';
      btnOk.textContent = 'Ya, Hapus Semua Data';
      btnOk.disabled    = true;
      btnOk.style.background = '#c0392b';
      btnOk.style.color      = '#fff';

      var btnTutup = document.createElement('button');
      btnTutup.type        = 'button';
      btnTutup.setAttribute('aria-label', 'Tutup');
      btnTutup.innerHTML   = '&times;';
      btnTutup.style.cssText =
        'position:absolute;top:.4rem;right:.6rem;background:transparent;border:none;' +
        'font-size:1.4rem;line-height:1;cursor:pointer;color:#9A9AA5;padding:0;';
      box.style.position = 'relative';

      var invoked = false;
      function done(val) {
        if (invoked) return;
        invoked = true;
        overlay.remove();
        document.removeEventListener('keydown', onEsc);
        resolve(val);
      }
      function onEsc(e) { if (e.key === 'Escape') { done(false); } }
      document.addEventListener('keydown', onEsc);

      inp.addEventListener('input', function () {
        btnOk.disabled = inp.value.trim() !== FRASA;
      });
      btnOk.addEventListener('click',    function () { done(true); });
      btnBatal.addEventListener('click', function () { done(false); });
      btnTutup.addEventListener('click', function () { done(false); });
      overlay.addEventListener('click',  function (e) { if (e.target === overlay) { done(false); } });

      rowBtn.appendChild(btnBatal);
      rowBtn.appendChild(btnOk);
      box.appendChild(btnTutup);
      box.appendChild(title);
      box.appendChild(rincian);
      box.appendChild(peringatan);
      box.appendChild(label);
      box.appendChild(inp);
      box.appendChild(rowBtn);
      overlay.appendChild(box);
      document.body.appendChild(overlay);

      inp.focus();
    });
  }

  async function handleSemesterReset() {
    var ringkas = await ringkasanDataSemester();
    var ok = await modalResetSemester(ringkas);
    if (!ok) return;

    var btn = document.getElementById('btn-mulai-semester-overlay') || document.getElementById('btn-mulai-semester');
    if (btn) { btn.disabled = true; btn.textContent = 'Memproses…'; }

    try {
      var sessionData = await window.supabaseClient.auth.getSession();
      var token = sessionData && sessionData.data && sessionData.data.session && sessionData.data.session.access_token;
      if (!token) throw new Error('Sesi tidak valid');

      var SUPABASE_URL = 'https://teccdzetrdjowqemnuuc.supabase.co';
      var res  = await fetch(SUPABASE_URL + '/functions/v1/semester-reset', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      var data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Reset gagal');

      var overlay = document.querySelector('.locked-overlay');
      if (overlay) overlay.remove();

      var semBanner = document.getElementById('semester-banner');
      if (semBanner) semBanner.style.display = 'none';

      var btnSem = document.getElementById('btn-mulai-semester');
      if (btnSem) btnSem.remove();

      var btnBuat = document.getElementById('btn-buat-classroom');
      if (btnBuat) btnBuat.disabled = false;

      // Seluruh sesi guru sudah dicabut server begitu reset berhasil, jadi
      // dashboard ini sebenarnya sudah tidak berwenang apa-apa lagi — klik
      // berikutnya apa pun akan ditolak. Daripada membiarkan guru menemukan
      // itu sendiri lewat error yang membingungkan, antarkan langsung ke
      // halaman login beserta alasannya.
      alert('Reset semester berhasil. Selamat memulai semester baru!');
      try { sessionStorage.setItem('sip_pesan_login', 'reset-semester'); } catch (_) {}
      try { await window.supabaseClient.auth.signOut(); } catch (_) {}
      window.location.replace('index.html');
      return;

    } catch (err) {
      alert('Gagal reset: ' + err.message);
      if (btn) { btn.disabled = false; btn.textContent = 'Mulai Semester Baru'; }
    }
  }

  function applySemesterUI(phase) {
    if (!phase || phase.fase === 'aktif') return;

    var trialBanner = document.getElementById('trial-banner');
    var isExpired = trialBanner && trialBanner.classList.contains('trial-expired');
    if (isExpired) return;

    var banner = document.getElementById('semester-banner');
    if (!banner) return;

    if (phase.fase === 'persiapan') {
      banner.className   = 'semester-banner semester-persiapan';
      banner.textContent = 'Semester ' + phase.sem + ' segera berakhir — export data Anda sebelum terlambat.';
      banner.style.display = 'block';

      var btnSem = document.createElement('button');
      btnSem.id        = 'btn-mulai-semester';
      btnSem.className = 'btn-semester-baru btn-semester-persiapan';
      btnSem.textContent = 'Mulai Semester Baru';
      btnSem.addEventListener('click', handleSemesterReset);

      var helpStrip = document.getElementById('help-strip');
      if (helpStrip) helpStrip.insertAdjacentElement('afterend', btnSem);
    } else if (phase.fase === 'terkunci') {
      banner.className   = 'semester-banner semester-terkunci';
      banner.textContent = 'Semester ' + phase.sem + ' telah berakhir. Reset diperlukan untuk melanjutkan.';
      banner.style.display = 'block';

      var overlay = document.createElement('div');
      overlay.className = 'locked-overlay';
      // Penguncian keras — disengaja. Overlay ini tidak punya tombol tutup:
      // semester yang sudah berakhir harus diselesaikan sebelum aplikasi bisa
      // dipakai lagi, supaya data semester lama tidak bercampur dengan yang
      // baru. Pagar keamanannya bukan lagi kemampuan menutup overlay,
      // melainkan konfirmasi berlapis di modalResetSemester(): rincian jumlah
      // data yang akan hilang, peringatan tidak dapat dipulihkan, dan
      // keharusan mengetik "RESET SEMESTER". Modal itulah yang bisa dibatalkan
      // — guru yang belum siap kembali ke layar ini, bukan kehilangan data.
      overlay.innerHTML =
        '<div class="locked-modal">' +
          '<h2>Semester Berakhir</h2>' +
          '<p>Semua fitur terkunci hingga Anda memulai semester baru.</p>' +
          '<div class="warning-list">' +
            '<div class="warning-item">Pastikan Anda sudah export data semester ini sebelum melanjutkan.</div>' +
            '<div class="warning-item">Pastikan nama kelas dan daftar siswa diperbarui setelah semester atau kelas baru dimulai.</div>' +
          '</div>' +
          '<button class="btn-semester-baru" id="btn-mulai-semester-overlay">Mulai Semester Baru</button>' +
        '</div>';
      document.body.appendChild(overlay);
      document.getElementById('btn-mulai-semester-overlay').addEventListener('click', handleSemesterReset);
    }
  }

}());
