(function () {
  const client = window.supabaseClient;

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

    btn.disabled = true;
    btn.textContent = 'Mendaftar...';

    const { error: signUpError } = await client.auth.signUp({
      email,
      password,
      options: { data: { full_name } },
    });

    if (signUpError) {
      showError('Gagal daftar: ' + signUpError.message);
      btn.disabled = false;
      btn.textContent = 'Daftar';
      return;
    }

    savedEmail = email;
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
    await client.auth.resend({ type: 'signup', email: savedEmail });
    btn.textContent = 'Terkirim!';
    setTimeout(function () {
      btn.disabled = false;
      btn.textContent = 'Kirim ulang';
    }, 30000);
  });
}());
