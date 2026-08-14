(async function () {
  const client = window.supabaseClient;

  const container      = document.querySelector('.container');
  const errorMsg       = document.getElementById('error-msg');
  const step1          = document.getElementById('step-1');
  const stepKonfirmasi = document.getElementById('step-konfirmasi');

  let savedEmail = null;

  function showError(msg) {
    errorMsg.textContent = msg;
    errorMsg.style.display = 'block';
  }

  function hideError() {
    errorMsg.textContent = '';
    errorMsg.style.display = 'none';
  }

  // G1 + G2 — Terjemahan pesan error Supabase ke Bahasa Indonesia
  function translateSupabaseError(msg) {
    if (!msg) return 'Terjadi kesalahan. Coba lagi.';
    const m = msg.toLowerCase();
    if (m.includes('user already registered') || m.includes('email already registered')) {
      return 'Email ini sudah terdaftar. Cek inbox untuk link konfirmasi, atau gunakan fitur login.';
    }
    if (m.includes('password should be at least')) {
      return 'Password minimal 8 karakter.';
    }
    if (m.includes('rate limit')) {
      return 'Terlalu sering mengirim email. Tunggu beberapa menit lalu coba lagi.';
    }
    if (m.includes('invalid login credentials')) {
      return 'Email atau password salah.';
    }
    return msg;
  }

  // B2 — Redirect jika sudah login
  container.style.visibility = 'hidden';
  const { data: { session } } = await client.auth.getSession();
  if (session) {
    window.location.href = '../guru/dashboard.html';
    return;
  }

  // B3 — Pulihkan state jika refresh saat step konfirmasi
  const onboardState = JSON.parse(sessionStorage.getItem('sip_onboard') || 'null');
  if (onboardState && onboardState.step === 'konfirmasi' && onboardState.email) {
    savedEmail = onboardState.email;
    document.getElementById('konfirmasi-email').textContent = savedEmail;
    step1.style.display = 'none';
    stepKonfirmasi.style.display = 'block';
  }

  container.style.visibility = '';

  // G3 — Hapus sessionStorage saat navigasi ke halaman login
  document.querySelector('.btn-dashboard').addEventListener('click', function () {
    sessionStorage.removeItem('sip_onboard');
  });

  // -----------------------------------------------------------------------
  // Step 1 - Daftar akun
  // Profil dibuat otomatis oleh trigger fn_handle_new_user di DB.
  // full_name dikirim lewat options.data agar tersedia di raw_user_meta_data.
  // -----------------------------------------------------------------------
  document.getElementById('form-daftar').addEventListener('submit', async function (e) {
    e.preventDefault();
    hideError();

    const full_name = document.getElementById('full_name').value.trim();
    const email     = document.getElementById('email').value.trim();
    const password  = document.getElementById('password').value;
    const btn       = document.getElementById('btn-daftar');

    // B4 — Validasi password minimal 8 karakter
    if (password.length < 8) {
      showError('Password minimal 8 karakter.');
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Mendaftar...';

    const { data, error: signUpError } = await client.auth.signUp({
      email,
      password,
      options: { data: { full_name } },
    });

    if (signUpError) {
      showError(translateSupabaseError(signUpError.message));
      btn.disabled = false;
      btn.textContent = 'Daftar';
      return;
    }

    // G2 — Deteksi email sudah terdaftar (Supabase kirim sukses palsu saat
    // confirm email ON — user dikembalikan tapi identities array kosong)
    if (!data.user || data.user.identities?.length === 0) {
      showError(translateSupabaseError('User already registered'));
      btn.disabled = false;
      btn.textContent = 'Daftar';
      return;
    }

    savedEmail = email;
    // B3 — Simpan state agar tahan refresh
    sessionStorage.setItem('sip_onboard', JSON.stringify({ step: 'konfirmasi', email: savedEmail }));
    document.getElementById('konfirmasi-email').textContent = email;
    step1.style.display = 'none';
    stepKonfirmasi.style.display = 'block';
  });

  // Kirim ulang email konfirmasi
  document.getElementById('btn-kirim-ulang').addEventListener('click', async function () {
    const btn = this;
    if (!savedEmail) return;
    btn.disabled = true;
    btn.textContent = 'Mengirim...';

    // B1 — Tangkap error resend
    const { error: resendErr } = await client.auth.resend({ type: 'signup', email: savedEmail });
    if (resendErr) {
      showError(translateSupabaseError(resendErr.message));
      btn.disabled = false;
      btn.textContent = 'Kirim ulang';
      return;
    }

    btn.textContent = 'Terkirim!';
    setTimeout(function () {
      btn.disabled = false;
      btn.textContent = 'Kirim ulang';
    }, 30000);
  });
}());
