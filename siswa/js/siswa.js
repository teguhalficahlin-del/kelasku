(function () {
  const client = window.supabaseClient;

  let currentClassroom = null; // { id, name, classroom_code }
  let currentRoster    = null; // { id, full_name, nis, profile_id }

  function escHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function showStepError(stepId, msg) {
    const el = document.getElementById(stepId);
    el.textContent = msg;
    el.style.display = 'block';
  }

  function hideStepError(stepId) {
    const el = document.getElementById(stepId);
    el.textContent = '';
    el.style.display = 'none';
  }

  // -------------------------------------------------------------------------
  // Cek session — redirect jika sudah login
  // -------------------------------------------------------------------------
  window.addEventListener('DOMContentLoaded', async function () {
    const { data: { session } } = await client.auth.getSession();
    if (session) { window.location.href = 'dashboard.html'; return; }
  });

  // -------------------------------------------------------------------------
  // Step 1 — Cek kode classroom
  // -------------------------------------------------------------------------
  document.getElementById('btn-cek-kode').addEventListener('click', async function () {
    hideStepError('step-1-error');

    const kode = (document.getElementById('inp-kode').value.trim()).toUpperCase();
    if (!kode) { showStepError('step-1-error', 'Masukkan kode classroom terlebih dahulu.'); return; }

    this.disabled = true;
    this.textContent = 'Mengecek...';

    const { data: classroom, error } = await client
      .from('classrooms')
      .select('id, name, classroom_code')
      .eq('classroom_code', kode)
      .eq('is_archived', false)
      .single();

    this.disabled = false;
    this.textContent = 'Cek Kode';

    if (error || !classroom) {
      showStepError('step-1-error', 'Kode classroom tidak ditemukan.');
      return;
    }

    currentClassroom = classroom;
    document.getElementById('cl-name-display').textContent =
      'Classroom: ' + classroom.name + ' (' + classroom.classroom_code + ')';
    document.getElementById('step-1').style.display = 'none';
    document.getElementById('step-2').style.display = 'block';
  });

  // -------------------------------------------------------------------------
  // Step 2 — Verifikasi NIS
  // -------------------------------------------------------------------------
  document.getElementById('btn-verifikasi-nis').addEventListener('click', async function () {
    hideStepError('step-2-error');
    document.getElementById('step-2-msg').style.display = 'none';

    const nis = document.getElementById('inp-nis').value.trim();
    if (!nis) { showStepError('step-2-error', 'Masukkan NIS terlebih dahulu.'); return; }

    this.disabled = true;
    this.textContent = 'Memverifikasi...';

    const { data: roster, error } = await client
      .from('classroom_roster')
      .select('id, full_name, nis, profile_id')
      .eq('classroom_id', currentClassroom.id)
      .eq('nis', nis)
      .single();

    this.disabled = false;
    this.textContent = 'Verifikasi NIS';

    if (error || !roster) {
      showStepError('step-2-error', 'NIS tidak terdaftar di classroom ini.');
      return;
    }

    if (roster.profile_id !== null) {
      const msgEl = document.getElementById('step-2-msg');
      msgEl.innerHTML = 'Akun sudah dibuat. Silakan <a href="index.html">login</a>.';
      msgEl.style.display = 'block';
      return;
    }

    currentRoster = roster;
    document.getElementById('konfirmasi-nama').textContent =
      'Halo, ' + roster.full_name + '! Lanjutkan pendaftaran akun Anda.';
    document.getElementById('step-2').style.display = 'none';
    document.getElementById('step-3').style.display = 'block';
  });

  // -------------------------------------------------------------------------
  // Step 3 — Buat akun
  // -------------------------------------------------------------------------
  document.getElementById('form-buat-akun').addEventListener('submit', async function (e) {
    e.preventDefault();
    hideStepError('step-3-error');

    const email    = document.getElementById('inp-email').value.trim();
    const password = document.getElementById('inp-password').value;
    const btn      = document.getElementById('btn-buat-akun');

    btn.disabled = true;
    btn.textContent = 'Membuat akun...';

    // 1. signUp
    const { data: signUpData, error: signUpError } = await client.auth.signUp({ email, password });
    if (signUpError) {
      showStepError('step-3-error', signUpError.message);
      btn.disabled = false;
      btn.textContent = 'Buat Akun';
      return;
    }

    const userId = signUpData.user?.id;
    if (!userId) {
      showStepError('step-3-error', 'Pendaftaran berhasil tetapi akun belum aktif. Cek email konfirmasi Anda.');
      btn.disabled = false;
      btn.textContent = 'Buat Akun';
      return;
    }

    // 2. INSERT profiles
    const { data: profile, error: profileError } = await client
      .from('profiles')
      .insert({
        user_id:   userId,
        full_name: currentRoster.full_name,
        role:      'SISWA',
        email:     email,
        nis:       currentRoster.nis,
      })
      .select('id')
      .single();

    if (profileError || !profile) {
      showStepError('step-3-error',
        'Akun dibuat tetapi gagal menyimpan profil: ' +
        (profileError?.message ?? 'respons tidak dikenali'));
      btn.disabled = false;
      btn.textContent = 'Buat Akun';
      return;
    }

    // 3. Aktivasi roster via SECURITY DEFINER
    const { error: rpcError } = await client.rpc('fn_activate_roster', {
      p_roster_id:  currentRoster.id,
      p_profile_id: profile.id,
    });

    if (rpcError) {
      showStepError('step-3-error', 'Profil dibuat tetapi gagal menghubungkan ke classroom: ' + rpcError.message);
      btn.disabled = false;
      btn.textContent = 'Buat Akun';
      return;
    }

    window.location.href = 'dashboard.html';
  });

}());
