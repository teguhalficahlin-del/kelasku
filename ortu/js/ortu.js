(function () {
  const db = window.supabaseClient;

  function showError(msg) {
    const el = document.getElementById('login-error');
    el.textContent = msg;
    el.style.display = 'block';
  }

  function hideError() {
    const el = document.getElementById('login-error');
    el.textContent = '';
    el.style.display = 'none';
  }

  document.addEventListener('DOMContentLoaded', async function () {
    const { data: { session } } = await db.auth.getSession();
    if (session) { window.location.href = 'dashboard.html'; return; }

    // Pre-fill dari URL ?kelas= dan ?nis=
    const params = new URLSearchParams(window.location.search);
    if (params.get('kelas')) document.getElementById('inp-kode').value     = params.get('kelas');
    if (params.get('nis'))   document.getElementById('inp-nis-anak').value = params.get('nis');
  });

  document.getElementById('form-login').addEventListener('submit', async function (e) {
    e.preventDefault();
    hideError();

    const kode    = document.getElementById('inp-kode').value.trim().toUpperCase();
    const namaAnak = document.getElementById('inp-nama-anak').value.trim();
    const nisAnak  = document.getElementById('inp-nis-anak').value.trim();
    const btn      = document.getElementById('btn-login');

    if (!kode || !namaAnak || !nisAnak) {
      showError('Semua field wajib diisi.');
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Masuk...';

    // Validasi nama anak ke classroom_roster sebelum mencoba login
    const { data: valid, error: rpcError } = await db.rpc('fn_validate_ortu_login', {
      p_classroom_code: kode,
      p_nis:            nisAnak,
      p_nama_anak:      namaAnak,
    });

    if (rpcError) {
      btn.disabled = false;
      btn.textContent = 'Masuk';
      showError('Gagal terhubung ke server. Periksa koneksi internet.');
      return;
    }

    if (!valid) {
      btn.disabled = false;
      btn.textContent = 'Masuk';
      showError('Nama anak tidak sesuai dengan data kelas.');
      return;
    }

    const email    = 'ortu.' + nisAnak + '.' + kode + '@sipmandiri.local';
    const password = nisAnak;

    try {
      const { error } = await db.auth.signInWithPassword({ email, password });

      btn.disabled = false;
      btn.textContent = 'Masuk';

      if (error) {
        showError('Akun belum dibuat guru, hubungi guru kelas.');
        return;
      }

      window.location.href = 'dashboard.html';
    } catch (_) {
      btn.disabled = false;
      btn.textContent = 'Masuk';
      showError('Gagal terhubung ke server. Periksa koneksi internet.');
    }
  });

}());
