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

  // Titipan dari dashboard yang sesinya berakhir mendadak. Nilainya hanya '1' —
  // sebuah saklar, bukan pesan: sessionStorage dapat diisi apa saja oleh siapa
  // pun yang membuka konsol, jadi teksnya ditanam di sini dan yang dibaca dari
  // penyimpanan cuma dipakai untuk memutuskan tampil atau tidak. Penulisan lewat
  // textContent, bukan innerHTML. Dipakai sekali lalu dibuang.
  function tampilkanPesanSesi() {
    var aktif = false;
    try {
      aktif = sessionStorage.getItem('sip_pesan_sesi') === '1';
      sessionStorage.removeItem('sip_pesan_sesi');
    } catch (_) { return; }
    if (!aktif) return;
    var el = document.getElementById('login-info');
    if (!el) return;
    el.textContent = 'Sesi Anda telah berakhir, silakan masuk kembali.';
    el.style.display = '';
  }

  window.addEventListener('DOMContentLoaded', async function () {
    // Dipanggil lebih dulu daripada apa pun. Kalau ditaruh setelah getSession,
    // titipannya tidak akan pernah terbaca pada kasus yang justru menjadi
    // alasannya ada — sesi sudah hilang, dan penantian jaringan di bawah hanya
    // menunda pesan yang seharusnya langsung terlihat.
    tampilkanPesanSesi();

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

    try {
      // ADR-003 K1: login siswa adalah Kode Kelas + Nama + NIS. Sebelumnya nama
      // dikumpulkan lalu dibuang, sehingga faktor ketiga tidak pernah ditegakkan.
      // Portal ortu sudah melakukan validasi ini; keduanya kini memakai fungsi
      // yang sama di server.
      const { data: hasil, error: rpcError } = await client.rpc('fn_validate_roster_login', {
        p_classroom_code: kode,
        p_nis:            nis,
        p_nama:           nama,
      });

      if (rpcError) {
        btn.disabled = false;
        btn.textContent = 'Masuk';
        showError('Gagal terhubung ke server. Periksa koneksi internet.');
        return;
      }

      if (hasil === 'KELAS_TIDAK_DITEMUKAN') {
        btn.disabled = false;
        btn.textContent = 'Masuk';
        showError('Kode kelas tidak ditemukan. Periksa kembali kode dari guru Anda.');
        return;
      }

      if (hasil !== 'OK') {
        btn.disabled = false;
        btn.textContent = 'Masuk';
        showError('Nama atau NIS tidak cocok dengan data kelas ini.');
        return;
      }

      const { error } = await client.auth.signInWithPassword({ email, password });

      btn.disabled = false;
      btn.textContent = 'Masuk';

      if (error) {
        // Data roster sudah terbukti cocok di atas, jadi satu-satunya sebab
        // tersisa adalah akun yang memang belum dibuatkan guru.
        showError('Akun Anda belum dibuat. Minta guru kelas membuatkan akun terlebih dahulu.');
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
