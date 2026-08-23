/* Admin Portal — MiClass */

const SUPABASE_URL     = 'https://teccdzetrdjowqemnuuc.supabase.co';
const SUPABASE_ANON    = 'sb_publishable_7T4Y9_ty5cN6_NIZ4TalXA_ByYNtSwG';
const EDGE_ADMIN       = SUPABASE_URL + '/functions/v1/admin-action';

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON, {
  auth: {
    storageKey:      'sb-admin-auth',
    storage:         window.localStorage,
    persistSession:  true,
    autoRefreshToken: true,
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

// Nama guru dan email berasal dari pendaftar, bukan dari sistem. Keduanya
// disisipkan ke innerHTML di bawah, jadi wajib di-escape — tanpa ini nama
// berisi markup akan dieksekusi di dalam sesi admin, yang memegang wewenang
// aktivasi dan penghapusan akun. Sama persis dengan escHtml di modul guru.
function escHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function showLoginError(msg) {
  const el = document.getElementById('login-error');
  el.textContent = msg;
  el.style.display = 'block';
}

function hideLoginError() {
  document.getElementById('login-error').style.display = 'none';
}

function showDashboardError(msg) {
  const el = document.getElementById('error-state');
  el.textContent = msg;
  el.style.display = 'block';
}

// Token diambil segar dari klien Supabase setiap kali dipakai. Dulu ada
// variabel modul yang diisi sekali saat login dan tidak pernah diperbarui,
// padahal klien dikonfigurasi autoRefreshToken: setelah access token
// kedaluwarsa (~1 jam), setiap aksi admin gagal dengan pesan generik
// "Permintaan gagal" tanpa petunjuk bahwa yang perlu dilakukan hanyalah login
// ulang. Variabel itu sudah dibuang — klien Supabase yang memegang sesinya,
// dan menyimpan salinannya di sini hanya menciptakan sumber kebenaran kedua
// yang bisa berbeda dari yang sebenarnya berlaku.
async function tokenSegar() {
  const { data: { session } } = await sb.auth.getSession();
  return session?.access_token ?? null;
}

// Argumen pertama dulu adalah token yang sudah dipegang pemanggil. Sejak
// tokenSegar() ditambahkan, nilai itu tidak pernah dibaca lagi — tiap panggilan
// mengambil token barunya sendiri. Parameternya dibuang supaya tidak ada yang
// mengira token yang dikirim pemanggil masih menentukan sesuatu.
async function callAdmin(body) {
  const token = await tokenSegar();
  if (!token) {
    const err = new Error('Sesi Anda telah berakhir, silakan login kembali.');
    err.sesiBerakhir = true;
    throw err;
  }

  const res = await fetch(EDGE_ADMIN, {
    method:  'POST',
    headers: {
      'Authorization': 'Bearer ' + token,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) {
    // HANYA 401 dan 403 yang berarti sesinya memang tidak lagi berlaku:
    // token kedaluwarsa, atau akun ini bukan admin. Selain itu — 5xx, timeout,
    // sinyal putus — sesinya masih sah dan tidak boleh disentuh.
    if (res.status === 401 || res.status === 403) {
      const err = new Error(res.status === 403
        ? 'Akun ini tidak memiliki akses admin.'
        : 'Sesi Anda telah berakhir, silakan login kembali.');
      err.sesiBerakhir = true;
      err.status = res.status;
      throw err;
    }
    const err = new Error(data.error || 'Permintaan gagal');
    err.status = res.status;
    throw err;
  }
  return data;
}

// Sesi mati di tengah pekerjaan: kembalikan ke layar login dengan sebab yang
// jelas, bukan pesan gagal yang membingungkan.
async function tanganiSesiBerakhir(err) {
  try { await sb.auth.signOut(); } catch (_) {}
  showLogin();
  showLoginError((err && err.message) || 'Sesi Anda telah berakhir, silakan login kembali.');
}

// Kegagalan yang BUKAN soal wewenang: tampilkan apa adanya beserta jalan
// keluarnya, dan biarkan sesinya utuh. Pola yang sama dipakai portal guru,
// siswa, dan ortu sejak 5c01cb0.
function tampilkanGagalMuat(err) {
  console.error('[admin] gagal memuat data:', err);
  const el = document.getElementById('error-state');
  el.innerHTML =
    '<p>Gagal memuat data. Periksa koneksi internet Anda.</p>' +
    '<button id="btn-coba-lagi" style="margin-top:.75rem;padding:.5rem 1.25rem;border:none;' +
    'border-radius:.35rem;background:var(--gold);color:var(--text-on-gold,#000);' +
    'font-weight:600;cursor:pointer;font-family:inherit">Coba lagi</button>';
  el.style.display = 'block';
  document.getElementById('btn-coba-lagi')
    ?.addEventListener('click', function () { loadGurus(); });
}

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('id-ID', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

function statusBadge(status) {
  const map = {
    AKTIF:       'badge-aktif',
    TRIAL:       'badge-trial',
    EXPIRED:     'badge-expired',
    belum_trial: 'badge-belum',
  };
  const cls = map[status] ?? 'badge-belum';
  return `<span class="status-badge ${cls}">${escHtml(status)}</span>`;
}

function actionButtons(guru) {
  const id   = escHtml(guru.id);
  const nama = escHtml(guru.full_name);
  const mail = escHtml(guru.username || '');
  const hapusBtn = `<button class="btn-aksi btn-hapus" data-id="${id}" data-nama="${nama}">Hapus</button>`;

  // Reset password hanya masuk akal untuk akun yang masih dipakai — guru
  // EXPIRED atau belum_trial tidak bisa masuk walau passwordnya diganti, jadi
  // tombolnya justru menyesatkan. Tanpa email tersimpan, tidak ada tujuan
  // kirim, jadi tombolnya pun tidak ditampilkan.
  const resetBtn = (guru.status === 'AKTIF' || guru.status === 'TRIAL') && mail
    ? `<button class="btn-aksi btn-reset-pw" data-id="${id}" data-nama="${nama}" data-email="${mail}">Reset Password</button>`
    : '';

  if (guru.status === 'AKTIF') {
    return `
      <button class="btn-aksi btn-perpanjang" data-id="${id}" data-nama="${nama}">Perpanjang</button>
      <button class="btn-aksi btn-nonaktif"   data-id="${id}" data-nama="${nama}">Nonaktifkan</button>
      ${resetBtn}
      ${hapusBtn}
    `;
  }
  return `
    <button class="btn-aksi btn-aktifkan" data-id="${id}" data-nama="${nama}">Aktifkan</button>
    ${resetBtn}
    ${hapusBtn}
  `;
}

// ─────────────────────────────────────────────────────────────────────────────
// Dashboard
// ─────────────────────────────────────────────────────────────────────────────

function showDashboard() {
  document.getElementById('login-view').style.display     = 'none';
  document.getElementById('dashboard-view').style.display = 'block';
  document.body.classList.remove('login-state');
  document.body.classList.add('dashboard-state');
}

function showLogin() {
  document.getElementById('dashboard-view').style.display = 'none';
  document.getElementById('login-view').style.display     = 'block';
  document.body.classList.remove('dashboard-state');
  document.body.classList.add('login-state');
}

async function loadGurus() {
  const loadEl  = document.getElementById('loading-state');
  const errEl   = document.getElementById('error-state');
  const tableEl = document.getElementById('table-wrap');
  const emptyEl = document.getElementById('empty-state');
  const list    = document.getElementById('guru-list');

  loadEl.style.display  = 'block';
  errEl.style.display   = 'none';
  tableEl.style.display = 'none';

  try {
    const { data } = await callAdmin({ action: 'list_gurus' });

    loadEl.style.display  = 'none';
    tableEl.style.display = 'block';

    if (!data || data.length === 0) {
      list.innerHTML = '';
      emptyEl.style.display = 'block';
      return;
    }

    emptyEl.style.display = 'none';
    list.innerHTML = data.map(g => `
      <div class="guru-card" data-id="${escHtml(g.id)}">
        <div class="guru-card-header">
          <span class="guru-nama">${escHtml(g.full_name || '—')}</span>
          ${statusBadge(g.status)}
        </div>
        <div class="guru-meta">
          <span class="guru-email">${escHtml(g.username || '—')}</span>
          <span class="guru-date">Daftar: ${escHtml(formatDate(g.created_at))}</span>
        </div>
        <div class="guru-stats">
          <span>Sisa: ${g.hari_tersisa > 0 ? escHtml(g.hari_tersisa) + ' hari' : '—'}</span>
          <span>${escHtml(g.classroom_count)} classroom</span>
        </div>
        <div class="guru-aksi">
          ${actionButtons(g)}
        </div>
      </div>
    `).join('');

  } catch (err) {
    loadEl.style.display = 'none';
    if (err.sesiBerakhir) { await tanganiSesiBerakhir(err); return; }
    tampilkanGagalMuat(err);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Action handlers (event delegation pada tbody)
// ─────────────────────────────────────────────────────────────────────────────

document.getElementById('guru-list').addEventListener('click', async (e) => {
  const btn = e.target.closest('.btn-aksi');
  if (!btn) return;

  const guruId   = btn.dataset.id;
  const guruNama = btn.dataset.nama;

  if (btn.classList.contains('btn-aktifkan')) {
    btn.disabled = true;
    btn.textContent = 'Memproses…';
    try {
      await callAdmin({ action: 'activate_guru', guru_id: guruId });
      await loadGurus();
    } catch (err) {
      if (err.sesiBerakhir) { await tanganiSesiBerakhir(err); return; }
      alert('Gagal aktifkan: ' + err.message);
      await loadGurus();
    }
  }

  if (btn.classList.contains('btn-nonaktif')) {
    if (!confirm('Nonaktifkan guru ini?\n' + guruNama)) return;
    btn.disabled = true;
    btn.textContent = 'Memproses…';
    try {
      await callAdmin({ action: 'deactivate_guru', guru_id: guruId });
      await loadGurus();
    } catch (err) {
      if (err.sesiBerakhir) { await tanganiSesiBerakhir(err); return; }
      alert('Gagal nonaktifkan: ' + err.message);
      await loadGurus();
    }
  }

  if (btn.classList.contains('btn-perpanjang')) {
    btn.disabled = true;
    btn.textContent = 'Memproses…';
    try {
      await callAdmin({ action: 'extend_guru', guru_id: guruId, days: 365 });
      await loadGurus();
    } catch (err) {
      if (err.sesiBerakhir) { await tanganiSesiBerakhir(err); return; }
      alert('Gagal perpanjang: ' + err.message);
      await loadGurus();
    }
  }

  if (btn.classList.contains('btn-reset-pw')) {
    const email = btn.dataset.email;
    if (!confirm('Kirim link reset password ke ' + guruNama + ' (' + email + ')?')) return;
    const labelAsli = btn.textContent;
    btn.disabled    = true;
    btn.textContent = 'Mengirim…';
    try {
      await callAdmin({ action: 'reset_password_guru', guru_id: guruId });
      alert('Link reset dikirim ke ' + email);
    } catch (err) {
      if (err.sesiBerakhir) { await tanganiSesiBerakhir(err); return; }
      // Di layar admin pesan error ditampilkan apa adanya: yang memakai layar
      // ini hanya pemilik aplikasi, dan menyamarkan sebab kegagalan di sini
      // hanya menyulitkan penelusuran.
      alert('Gagal kirim link reset: ' + err.message);
    } finally {
      btn.disabled    = false;
      btn.textContent = labelAsli;
    }
  }

  if (btn.classList.contains('btn-hapus')) {
    const konfirmasi = prompt('Ketik nama guru untuk konfirmasi hapus:\n' + guruNama);
    if (konfirmasi !== guruNama) { alert('Nama tidak cocok. Hapus dibatalkan.'); return; }
    btn.disabled = true;
    btn.textContent = 'Menghapus…';
    try {
      await callAdmin({ action: 'delete_guru', guru_id: guruId });
      await loadGurus();
    } catch (err) {
      if (err.sesiBerakhir) { await tanganiSesiBerakhir(err); return; }
      alert('Gagal hapus: ' + err.message);
      await loadGurus();
    }
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Login
// ─────────────────────────────────────────────────────────────────────────────

document.getElementById('form-login').addEventListener('submit', async (e) => {
  e.preventDefault();
  hideLoginError();

  const btnMasuk = document.getElementById('btn-masuk');
  btnMasuk.disabled    = true;
  btnMasuk.textContent = 'Masuk…';

  const email    = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;

  try {
    const { data: authData, error: authErr } = await sb.auth.signInWithPassword({ email, password });
    if (authErr || !authData?.session) {
      showLoginError('Email atau password salah.');
      return;
    }

    // Verifikasi akses admin via Edge Function.
    try {
      await callAdmin({ action: 'list_gurus' });
    } catch (err) {
      if (err.sesiBerakhir) {
        // 401/403 — memang tidak berhak. Sesinya dibuang.
        await sb.auth.signOut();
        showLoginError(err.message);
      } else {
        // Jaringan atau server bermasalah. Sebelumnya kasus ini juga dijawab
        // "Akun ini tidak memiliki akses admin" — tuduhan yang keliru kepada
        // admin yang sah, sekaligus membuang sesinya.
        console.error('[admin] verifikasi akses gagal:', err);
        showLoginError('Gagal terhubung ke server. Periksa koneksi internet Anda, lalu coba lagi.');
      }
      return;
    }

    showDashboard();
    await loadGurus();
    await loadOrphans();

  } catch (err) {
    showLoginError('Terjadi kesalahan: ' + err.message);
  } finally {
    btnMasuk.disabled    = false;
    btnMasuk.textContent = 'Masuk';
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Akun Yatim
// ─────────────────────────────────────────────────────────────────────────────
//
// Yatim = profil SISWA/ORTU tanpa satu pun baris di classroom_members. Bentuk itu
// lahir ketika hapus-akun berhenti di langkah 10: classroom_members sudah dihapus
// tetapi akun auth-nya belum. Selama dibiarkan, baris classroom_roster-nya masih
// memegang profile_id, dan fn_activate_roster mensyaratkan profile_id IS NULL --
// jadi slot siswa itu tidak bisa dibuatkan akun lagi. Membersihkan yatimnya juga
// membebaskan slotnya.

async function loadOrphans() {
  const loadEl  = document.getElementById('yatim-loading');
  const errEl   = document.getElementById('yatim-error');
  const wrapEl  = document.getElementById('yatim-wrap');
  const emptyEl = document.getElementById('yatim-empty');
  const list    = document.getElementById('yatim-list');
  if (!list) return;

  loadEl.style.display = 'block';
  errEl.style.display  = 'none';
  wrapEl.style.display = 'none';

  try {
    const { data } = await callAdmin({ action: 'list_orphans' });

    loadEl.style.display = 'none';
    wrapEl.style.display = 'block';

    if (!data || data.length === 0) {
      list.innerHTML = '';
      emptyEl.style.display = 'block';
      return;
    }

    emptyEl.style.display = 'none';
    list.innerHTML = data.map(o => `
      <div class="guru-card" data-id="${escHtml(o.id)}">
        <div class="guru-card-header">
          <span class="guru-nama">${escHtml(o.full_name || '—')}</span>
          <span class="status-badge badge-belum">${escHtml(o.role)}</span>
        </div>
        <div class="guru-meta">
          <span class="guru-date">Dibuat: ${escHtml(formatDate(o.created_at))}</span>
        </div>
        <div class="guru-aksi">
          <button class="btn-aksi btn-hapus btn-bersihkan"
                  data-id="${escHtml(o.id)}"
                  data-nama="${escHtml(o.full_name || '')}">Bersihkan</button>
        </div>
      </div>
    `).join('');

  } catch (err) {
    loadEl.style.display = 'none';
    if (err.sesiBerakhir) { await tanganiSesiBerakhir(err); return; }
    errEl.textContent   = 'Gagal memuat akun yatim: ' + err.message;
    errEl.style.display = 'block';
  }
}

document.getElementById('yatim-list').addEventListener('click', async (e) => {
  const btn = e.target.closest('.btn-bersihkan');
  if (!btn) return;

  const id   = btn.dataset.id;
  const nama = btn.dataset.nama || 'tanpa nama';

  // Tidak perlu mengetik nama seperti pada penghapusan guru: akun yatim sudah
  // kehilangan seluruh datanya, jadi yang hilang di sini hanyalah baris login
  // yang tidak bisa dipakai siapa pun.
  if (!window.confirm('Hapus akun yatim "' + nama + '"?')) return;

  btn.disabled    = true;
  btn.textContent = 'Membersihkan…';

  try {
    const hasil = await callAdmin({ action: 'delete_orphan', orphan_profile_id: id });
    if (hasil && hasil.cleaned_slots > 0) {
      alert('Akun dibersihkan. ' + hasil.cleaned_slots +
            ' slot siswa dibebaskan dan kini bisa dibuatkan akun lagi.');
    }
  } catch (err) {
    if (err.sesiBerakhir) { await tanganiSesiBerakhir(err); return; }
    alert('Gagal membersihkan: ' + err.message);
  }

  await loadOrphans();
});

document.getElementById('btn-refresh-yatim')
  .addEventListener('click', () => loadOrphans());

// ─────────────────────────────────────────────────────────────────────────────
// Logout & Refresh
// ─────────────────────────────────────────────────────────────────────────────

document.getElementById('btn-logout').addEventListener('click', async () => {
  // scope: 'global' — SEC-014
  await sb.auth.signOut({ scope: 'global' });
  showLogin();
  document.getElementById('form-login').reset();
  hideLoginError();
});

document.getElementById('btn-refresh').addEventListener('click', () => loadGurus());

// ─────────────────────────────────────────────────────────────────────────────
// Init — cek session yang sudah ada
// ─────────────────────────────────────────────────────────────────────────────

(async () => {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return;

  // Validasi session masih admin-valid.
  //
  // Sebelumnya blok catch di sini memanggil signOut() untuk SEMUA jenis galat,
  // termasuk kegagalan jaringan sesaat. Admin yang membuka dashboard saat
  // sinyal putus kehilangan sesinya betulan — bukan sekadar gagal memuat — dan
  // harus login ulang padahal sesinya masih sah. Ini pola yang sudah diperbaiki
  // untuk guru, siswa, dan ortu di 5c01cb0; portal admin terlewat.
  try {
    await callAdmin({ action: 'list_gurus' });
    showDashboard();
    await loadGurus();
    await loadOrphans();
  } catch (err) {
    if (err.sesiBerakhir) {
      // 401 sesi kedaluwarsa, atau 403 bukan admin — sesinya memang harus pergi.
      await sb.auth.signOut();
      showLoginError(err.message);
      return;
    }
    // Selain itu sesinya dibiarkan utuh: tampilkan dashboard beserta galat dan
    // tombol "Coba lagi", supaya admin bisa memuat ulang begitu sinyal kembali.
    showDashboard();
    document.getElementById('loading-state').style.display = 'none';
    tampilkanGagalMuat(err);
  }
})();
