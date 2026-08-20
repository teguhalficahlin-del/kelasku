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

async function callAdmin(token, body) {
  const res = await fetch(EDGE_ADMIN, {
    method:  'POST',
    headers: {
      'Authorization': 'Bearer ' + token,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Permintaan gagal');
  return data;
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
  return `<span class="status-badge ${cls}">${status}</span>`;
}

function actionButtons(guru) {
  const hapusBtn = `<button class="btn-aksi btn-hapus" data-id="${guru.id}" data-nama="${guru.full_name}">Hapus</button>`;
  if (guru.status === 'AKTIF') {
    return `
      <button class="btn-aksi btn-perpanjang" data-id="${guru.id}" data-nama="${guru.full_name}">Perpanjang</button>
      <button class="btn-aksi btn-nonaktif"   data-id="${guru.id}" data-nama="${guru.full_name}">Nonaktifkan</button>
      ${hapusBtn}
    `;
  }
  return `
    <button class="btn-aksi btn-aktifkan" data-id="${guru.id}" data-nama="${guru.full_name}">Aktifkan</button>
    ${hapusBtn}
  `;
}

// ─────────────────────────────────────────────────────────────────────────────
// Dashboard
// ─────────────────────────────────────────────────────────────────────────────

let _token = null;

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
    const { data } = await callAdmin(_token, { action: 'list_gurus' });

    loadEl.style.display  = 'none';
    tableEl.style.display = 'block';

    if (!data || data.length === 0) {
      list.innerHTML = '';
      emptyEl.style.display = 'block';
      return;
    }

    emptyEl.style.display = 'none';
    list.innerHTML = data.map(g => `
      <div class="guru-card" data-id="${g.id}">
        <div class="guru-card-header">
          <span class="guru-nama">${g.full_name || '—'}</span>
          ${statusBadge(g.status)}
        </div>
        <div class="guru-meta">
          <span class="guru-email">${g.username || '—'}</span>
          <span class="guru-date">Daftar: ${formatDate(g.created_at)}</span>
        </div>
        <div class="guru-stats">
          <span>Sisa: ${g.hari_tersisa > 0 ? g.hari_tersisa + ' hari' : '—'}</span>
          <span>${g.classroom_count} classroom</span>
        </div>
        <div class="guru-aksi">
          ${actionButtons(g)}
        </div>
      </div>
    `).join('');

  } catch (err) {
    loadEl.style.display = 'none';
    showDashboardError('Gagal memuat data: ' + err.message);
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
      await callAdmin(_token, { action: 'activate_guru', guru_id: guruId });
      await loadGurus();
    } catch (err) {
      alert('Gagal aktifkan: ' + err.message);
      await loadGurus();
    }
  }

  if (btn.classList.contains('btn-nonaktif')) {
    if (!confirm('Nonaktifkan guru ini?\n' + guruNama)) return;
    btn.disabled = true;
    btn.textContent = 'Memproses…';
    try {
      await callAdmin(_token, { action: 'deactivate_guru', guru_id: guruId });
      await loadGurus();
    } catch (err) {
      alert('Gagal nonaktifkan: ' + err.message);
      await loadGurus();
    }
  }

  if (btn.classList.contains('btn-perpanjang')) {
    btn.disabled = true;
    btn.textContent = 'Memproses…';
    try {
      await callAdmin(_token, { action: 'extend_guru', guru_id: guruId, days: 365 });
      await loadGurus();
    } catch (err) {
      alert('Gagal perpanjang: ' + err.message);
      await loadGurus();
    }
  }

  if (btn.classList.contains('btn-hapus')) {
    const konfirmasi = prompt('Ketik nama guru untuk konfirmasi hapus:\n' + guruNama);
    if (konfirmasi !== guruNama) { alert('Nama tidak cocok. Hapus dibatalkan.'); return; }
    btn.disabled = true;
    btn.textContent = 'Menghapus…';
    try {
      await callAdmin(_token, { action: 'delete_guru', guru_id: guruId });
      await loadGurus();
    } catch (err) {
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

    _token = authData.session.access_token;

    // Verifikasi akses admin via Edge Function — jika 403 berarti bukan admin
    try {
      await callAdmin(_token, { action: 'list_gurus' });
    } catch (err) {
      await sb.auth.signOut();
      _token = null;
      showLoginError('Akun ini tidak memiliki akses admin.');
      return;
    }

    showDashboard();
    await loadGurus();

  } catch (err) {
    showLoginError('Terjadi kesalahan: ' + err.message);
  } finally {
    btnMasuk.disabled    = false;
    btnMasuk.textContent = 'Masuk';
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Logout & Refresh
// ─────────────────────────────────────────────────────────────────────────────

document.getElementById('btn-logout').addEventListener('click', async () => {
  await sb.auth.signOut();
  _token = null;
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

  // Validasi session masih admin-valid
  try {
    _token = session.access_token;
    await callAdmin(_token, { action: 'list_gurus' });
    showDashboard();
    await loadGurus();
  } catch {
    await sb.auth.signOut();
    _token = null;
  }
})();
