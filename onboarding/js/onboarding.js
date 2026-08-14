(function () {
  const client = window.supabaseClient;

  const errorMsg    = document.getElementById('error-msg');
  const step1       = document.getElementById('step-1');
  const stepPeran   = document.getElementById('step-peran');
  const step2       = document.getElementById('step-2');
  const step3       = document.getElementById('step-3');
  const codeDisplay = document.getElementById('classroom-code-display');

  let savedUserId   = null;
  let savedRoleGuru = null;

  function showError(msg) {
    errorMsg.textContent = msg;
    errorMsg.style.display = 'block';
  }

  function hideError() {
    errorMsg.textContent = '';
    errorMsg.style.display = 'none';
  }

  // -----------------------------------------------------------------------
  // Step 1 — Daftar akun
  // -----------------------------------------------------------------------
  document.getElementById('form-daftar').addEventListener('submit', async function (e) {
    e.preventDefault();
    hideError();

    const full_name = document.getElementById('full_name').value.trim();
    const email     = document.getElementById('email').value.trim();
    const password  = document.getElementById('password').value;
    const btn       = document.getElementById('btn-daftar');

    btn.disabled = true;
    btn.textContent = 'Mendaftar...';

    const { data: signUpData, error: signUpError } = await client.auth.signUp({ email, password });

    if (signUpError) {
      showError('Gagal daftar: ' + signUpError.message);
      btn.disabled = false;
      btn.textContent = 'Daftar';
      return;
    }

    const userId = signUpData.user?.id;
    if (!userId) {
      showError('Daftar berhasil tetapi akun belum aktif. Cek email konfirmasi Anda.');
      btn.disabled = false;
      btn.textContent = 'Daftar';
      return;
    }

    savedUserId = userId;

    const { error: profileError } = await client
      .from('profiles')
      .insert({ user_id: userId, full_name, role: 'GURU', email });

    if (profileError) {
      showError('Akun dibuat, tetapi gagal menyimpan profil: ' + profileError.message +
        '. Kemungkinan email belum diverifikasi — cek inbox Anda, lalu muat ulang halaman.');
      btn.disabled = false;
      btn.textContent = 'Daftar';
      return;
    }

    step1.style.display = 'none';
    stepPeran.style.display = 'block';
  });

  // -----------------------------------------------------------------------
  // Step Peran — Pilih peran guru
  // -----------------------------------------------------------------------
  stepPeran.querySelectorAll('.peran-card').forEach(function (card) {
    card.addEventListener('click', function () {
      stepPeran.querySelectorAll('.peran-card').forEach(function (c) { c.classList.remove('selected'); });
      card.classList.add('selected');
      savedRoleGuru = card.dataset.peran;
      document.getElementById('btn-peran').disabled = false;
    });
  });

  document.getElementById('btn-peran').addEventListener('click', async function () {
    const btn = document.getElementById('btn-peran');
    btn.disabled = true;
    btn.textContent = 'Menyimpan…';

    if (savedRoleGuru && savedUserId) {
      try {
        await client
          .from('profiles')
          .update({ role_guru: savedRoleGuru })
          .eq('user_id', savedUserId);
      } catch (_) {
        // Gagal update role_guru — tetap lanjut, null dianggap MAPEL
      }
    }

    btn.disabled = false;
    btn.textContent = 'Lanjut →';
    stepPeran.style.display = 'none';
    step2.style.display = 'block';
  });

  // -----------------------------------------------------------------------
  // Step 2 — Buat classroom
  // -----------------------------------------------------------------------
  document.getElementById('form-classroom').addEventListener('submit', async function (e) {
    e.preventDefault();
    hideError();

    const class_name  = document.getElementById('class_name').value.trim();
    const subject     = document.getElementById('subject').value.trim();
    const description = document.getElementById('description').value.trim() || null;
    const btn         = document.getElementById('btn-classroom');

    btn.disabled = true;
    btn.textContent = 'Menyimpan...';

    // Ambil profile_id dari tabel profiles berdasarkan user_id yang disimpan di Step 1
    const { data: profile, error: profileFetchError } = await client
      .from('profiles')
      .select('id')
      .eq('user_id', savedUserId)
      .single();

    if (profileFetchError || !profile) {
      showError('Gagal mengambil data profil: ' +
        (profileFetchError?.message ?? 'profil tidak ditemukan'));
      btn.disabled = false;
      btn.textContent = 'Buat Classroom';
      return;
    }

    // INSERT classroom — classroom_code di-generate otomatis oleh DB
    const { data: classroomData, error: classroomError } = await client
      .from('classrooms')
      .insert({ teacher_id: profile.id, name: class_name, subject, description })
      .select('id, classroom_code')
      .single();

    if (classroomError || !classroomData) {
      showError('Gagal membuat classroom: ' +
        (classroomError?.message ?? 'respons tidak dikenali'));
      btn.disabled = false;
      btn.textContent = 'Buat Classroom';
      return;
    }

    codeDisplay.textContent = classroomData.classroom_code;
    step2.style.display = 'none';
    step3.style.display = 'block';
  });
}());
