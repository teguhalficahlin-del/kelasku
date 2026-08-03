(function () {
  const client = window.supabaseClient;

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

  window.addEventListener('DOMContentLoaded', async function () {
    const { data: { session } } = await client.auth.getSession();
    if (session) { window.location.href = 'dashboard.html'; return; }

    // Pre-fill dari URL ?kelas= dan ?nis=
    const params = new URLSearchParams(window.location.search);
    if (params.get('kelas')) document.getElementById('inp-kode').value = params.get('kelas');
    if (params.get('nis'))   document.getElementById('inp-nis').value  = params.get('nis');
  });

  document.getElementById('form-login').addEventListener('submit', async function (e) {
    e.preventDefault();
    hideError();

    const kode = document.getElementById('inp-kode').value.trim().toUpperCase();
    const nama = document.getElementById('inp-nama').value.trim();
    const nis  = document.getElementById('inp-nis').value.trim();
    const btn  = document.getElementById('btn-login');

    if (!kode || !nama || !nis) {
      showError('Semua field wajib diisi.');
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Masuk...';

    const email    = nis + '.' + kode + '@sipmandiri.local';
    const password = nis;

    const { error } = await client.auth.signInWithPassword({ email, password });

    btn.disabled = false;
    btn.textContent = 'Masuk';

    if (error) {
      showError('Akun belum dibuat guru, hubungi guru kelas.');
      return;
    }

    window.location.href = 'dashboard.html';
  });

}());
