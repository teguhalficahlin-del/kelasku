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

    function renderCard(classroom, count) {
      const card = document.createElement('div');
      card.className = 'classroom-card';
      card.dataset.id = classroom.id;
      card.innerHTML =
        '<div class="card-header">' +
          '<span class="card-name">' + escHtml(classroom.name) + '</span>' +
          '<span class="card-code">' + escHtml(classroom.classroom_code) + '</span>' +
        '</div>' +
        '<div class="card-subject">' + escHtml(classroom.subject || '') + '</div>' +
        '<div class="card-count">' + count + ' siswa terdaftar</div>' +
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
        const count = await api.getRosterCount(cl.id);
        list.appendChild(renderCard(cl, count));
      }
    }

    // -- Modal --

    function openModal()  { document.getElementById('modal-classroom').style.display = 'flex'; }
    function closeModal() {
      document.getElementById('modal-classroom').style.display = 'none';
      document.getElementById('modal-error').style.display = 'none';
      document.getElementById('modal-error').textContent = '';
      document.getElementById('form-classroom').reset();
    }

    document.getElementById('btn-buat-classroom').addEventListener('click', openModal);
    document.getElementById('btn-batal').addEventListener('click', closeModal);
    document.getElementById('modal-backdrop').addEventListener('click', closeModal);

    document.getElementById('form-classroom').addEventListener('submit', async function (e) {
      e.preventDefault();

      const name        = document.getElementById('inp-name').value.trim();
      const subject     = document.getElementById('inp-subject').value.trim();
      const description = document.getElementById('inp-desc').value.trim();
      const btn         = document.getElementById('btn-simpan');
      const modalError  = document.getElementById('modal-error');

      btn.disabled = true;
      btn.textContent = 'Menyimpan...';

      const { data: classroom, error } = await api.createClassroom(currentTeacherId, name, subject, description);

      if (error || !classroom) {
        modalError.textContent = 'Gagal membuat classroom: ' + (error?.message ?? 'respons tidak dikenali');
        modalError.style.display = 'block';
        btn.disabled = false;
        btn.textContent = 'Simpan';
        return;
      }

      closeModal();

      // Prepend card baru tanpa reload seluruh daftar
      const list = document.getElementById('classroom-list');
      const emptyState = list.querySelector('.empty-state');
      if (emptyState) list.innerHTML = '';
      list.prepend(renderCard(classroom, 0));
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
