// reset-password.js — layar "buat password baru", tujuan dari tautan pemulihan
// yang dikirim Supabase Auth lewat email.
//
// Tautan itu mendarat di sini dengan token pemulihan. supabase-js membaca token
// dari URL sendiri (detectSessionInUrl aktif secara bawaan) dan menukarnya
// menjadi sesi sementara; sesudah itu updateUser({ password }) sah dipanggil.
//
// Tiga bentuk kedatangan yang harus ditangani:
//   1. #access_token=…&type=recovery   — alur implicit, yang dipakai sekarang
//   2. ?code=…                          — alur PKCE, kalau setelan project berubah
//   3. #error=…&error_description=…     — tautan kedaluwarsa atau sudah terpakai
//
// Tanpa salah satu token di URL, halaman ini menolak — termasuk saat ada sesi
// tersimpan. Sesi biasa milik guru yang sedang login bukan bukti bahwa
// pemiliknya datang dari tautan pemulihan.

(function () {
  'use strict';

  const client = window.supabaseClient;

  const elMemuat  = document.getElementById('state-memuat');
  const elForm    = document.getElementById('state-form');
  const elGagal   = document.getElementById('state-gagal');
  const elGagalMsg = document.getElementById('gagal-msg');
  const form      = document.getElementById('form-reset');
  const errorMsg  = document.getElementById('error-msg');
  const okMsg     = document.getElementById('ok-msg');

  function tampil(el) {
    [elMemuat, elForm, elGagal].forEach(x => { if (x) x.style.display = 'none'; });
    if (el) el.style.display = 'block';
  }

  function showError(msg) {
    errorMsg.textContent = msg;
    errorMsg.style.display = 'block';
  }
  function hideError() {
    errorMsg.textContent = '';
    errorMsg.style.display = 'none';
  }

  function tampilGagal(msg) {
    elGagalMsg.textContent = msg ||
      'Link reset sudah tidak berlaku. Silakan minta link baru di halaman login.';
    tampil(elGagal);
  }

  // Parameter bisa datang di hash (implicit) maupun query (PKCE).
  function paramHash() {
    const h = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : '';
    return new URLSearchParams(h);
  }

  async function siapkanSesi() {
    const hash  = paramHash();
    const query = new URLSearchParams(window.location.search);

    // Supabase menaruh sebab penolakan di URL — pakai apa adanya, jangan
    // menebak sendiri kenapa tautannya ditolak.
    const err = hash.get('error_description') || hash.get('error') ||
                query.get('error_description') || query.get('error');
    if (err) {
      const kadaluarsa = /expired|invalid/i.test(err);
      tampilGagal(kadaluarsa
        ? 'Link reset sudah tidak berlaku. Silakan minta link baru di halaman login.'
        : 'Link reset tidak dapat digunakan: ' + err);
      return;
    }

    // Keberadaan token pemulihan di URL diperiksa LEBIH DULU, sebelum sesi
    // tersimpan disentuh sama sekali. Sebelumnya urutannya terbalik: guru yang
    // masih login lalu membuka halaman ini tanpa tautan apa pun langsung
    // mendapat form ganti password, karena getSession() mengembalikan sesi
    // biasa miliknya. Halaman ini hanya boleh dimasuki lewat tautan dari email
    // — sesi biasa bukan bukti bahwa pemiliknya sedang memulihkan password.
    const code  = query.get('code');
    const punyaTokenPemulihan = !!hash.get('access_token') || !!code;

    if (!punyaTokenPemulihan) {
      tampilGagal();
      return;
    }

    // Alur PKCE: token belum ditukar, dan supabase-js tidak menukarnya sendiri
    // kalau flowType-nya implicit. Tukar manual — kalau memang bukan PKCE,
    // panggilan ini gagal dan pemeriksaan sesi di bawah yang menentukan.
    if (code) {
      try { await client.auth.exchangeCodeForSession(code); } catch (_) { /* ditangani di bawah */ }
    }

    // Alur implicit: supabase-js memproses hash saat klien dibuat, tapi itu
    // asinkron. Beri beberapa kesempatan sebelum menyimpulkan tautannya mati —
    // tanpa ini, koneksi lambat terlihat seperti token kedaluwarsa.
    for (let i = 0; i < 20; i++) {
      const { data: { session } } = await client.auth.getSession();
      if (session) { tampil(elForm); return; }
      await new Promise(r => setTimeout(r, 150));
    }

    tampilGagal();
  }

  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    hideError();

    const pw1 = document.getElementById('password-baru').value;
    const pw2 = document.getElementById('password-ulang').value;

    if (pw1.length < 8) { showError('Password baru minimal 8 karakter.'); return; }
    if (pw1 !== pw2)    { showError('Konfirmasi password tidak sama dengan password baru.'); return; }

    const btn = document.getElementById('btn-ganti');
    btn.disabled    = true;
    btn.textContent = 'Menyimpan…';

    // finally memulihkan tombol pada SEMUA jalan keluar. updateUser() tidak
    // hanya mengembalikan error — ia melempar kalau jaringan putus di
    // tengah kirim, dan lemparan itu dulu melewati seluruh pemulihan tombol:
    // form tinggal diam di "Menyimpan…" selamanya, dan satu-satunya jalan
    // keluar adalah memuat ulang halaman.
    try {
      const { error } = await client.auth.updateUser({ password: pw1 });

      if (error) {
        // Sesi pemulihan berumur pendek. Kalau habis saat form masih terbuka,
        // arahkan ke jalan keluarnya, bukan sekadar menampilkan pesan mentah.
        if (/session|jwt|token|expired/i.test(error.message || '')) {
          tampilGagal('Sesi reset sudah berakhir. Silakan minta link baru di halaman login.');
          return;
        }
        showError(error.message || 'Gagal mengganti password.');
        return;
      }

      form.style.display = 'none';
      okMsg.textContent  = 'Password berhasil diganti. Mengalihkan ke halaman login…';
      okMsg.style.display = 'block';

      // Sesi pemulihan tidak dibawa ke halaman login: guru harus masuk dengan
      // password barunya, supaya jelas password itu benar-benar berlaku.
      try { await client.auth.signOut(); } catch (_) {}
      setTimeout(function () { window.location.replace('index.html'); }, 3000);

    } catch (err) {
      console.error('updateUser', err);
      showError('Koneksi terputus. Silakan coba lagi.');
    } finally {
      // Aman juga di jalur berhasil: formnya sudah disembunyikan, jadi tombol
      // yang pulih tidak terlihat lagi oleh siapa pun.
      btn.disabled    = false;
      btn.textContent = 'Ganti Password';
    }
  });

  siapkanSesi();
}());
