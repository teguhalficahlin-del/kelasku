const db = window.supabaseClient;

let currentClassroom = null;
let currentRoster    = null;

function showError(id, msg) {
  const el = document.getElementById(id);
  el.textContent = msg;
  el.style.display = 'block';
}

function hideError(id) {
  const el = document.getElementById(id);
  el.textContent = '';
  el.style.display = 'none';
}

function showSection(id) {
  ['step-1', 'step-2', 'step-3'].forEach(s => {
    document.getElementById(s).style.display = s === id ? '' : 'none';
  });
}

async function cekKode() {
  hideError('step-1-error');
  const kode = document.getElementById('inp-kode').value.trim().toUpperCase();
  if (!kode) { showError('step-1-error', 'Masukkan kode classroom.'); return; }

  const btn = document.getElementById('btn-cek-kode');
  btn.disabled = true;

  const { data: rows, error } = await db
    .rpc('fn_lookup_classroom_code', { p_code: kode });
  const data = rows && rows.length > 0 ? rows[0] : null;

  btn.disabled = false;

  if (error || !data) {
    showError('step-1-error', 'Kode classroom tidak ditemukan.');
    return;
  }

  currentClassroom = data;
  document.getElementById('cl-name-display').textContent = `Classroom: ${data.name}`;
  showSection('step-2');
}

async function verifikasiSiswa() {
  hideError('step-2-error');
  const nama = document.getElementById('inp-nama-siswa').value.trim();
  const nis  = document.getElementById('inp-nis-siswa').value.trim();

  if (!nama || !nis) {
    showError('step-2-error', 'Nama siswa dan NIS wajib diisi.');
    return;
  }

  const btn = document.getElementById('btn-verifikasi-siswa');
  btn.disabled = true;

  const { data: rows, error } = await db
    .rpc('fn_lookup_roster_by_name_nis', {
      p_classroom_id: currentClassroom.id,
      p_full_name: nama,
      p_nis: nis,
    });
  const data = rows && rows.length > 0 ? rows[0] : null;

  btn.disabled = false;

  if (error || !data) {
    showError('step-2-error', 'Data siswa tidak ditemukan di classroom ini.');
    return;
  }

  if (!data.profile_id) {
    showError('step-2-error', 'Siswa belum membuat akun. Minta siswa daftar dulu.');
    return;
  }

  currentRoster = data;
  document.getElementById('konfirmasi-siswa').textContent =
    `Siswa ditemukan: ${data.full_name} (NIS: ${data.nis})`;
  showSection('step-3');
}

async function buatAkun(e) {
  e.preventDefault();
  hideError('step-3-error');

  const email    = document.getElementById('inp-email').value.trim();
  const password = document.getElementById('inp-password').value;
  const btn      = document.getElementById('btn-buat-akun');
  btn.disabled   = true;

  // 1. Buat akun auth
  const { data: authData, error: authError } = await db.auth.signUp({ email, password });
  if (authError) {
    showError('step-3-error', authError.message);
    btn.disabled = false;
    return;
  }

  const userId = authData.user.id;

  // 2. Insert profiles
  const { data: profile, error: profileError } = await db
    .from('profiles')
    .insert({
      user_id:   userId,
      full_name: `Ortu - ${currentRoster.full_name}`,
      role:      'ORTU',
      email,
    })
    .select('id')
    .single();

  if (profileError) {
    showError('step-3-error', 'Gagal membuat profil: ' + profileError.message);
    btn.disabled = false;
    return;
  }

  // 3. Insert classroom_members
  const { error: memberError } = await db
    .from('classroom_members')
    .insert({
      classroom_id:       currentClassroom.id,
      teacher_id:         currentClassroom.teacher_id,
      profile_id:         profile.id,
      member_role:        'ORTU',
      linked_student_id:  currentRoster.profile_id,
    });

  if (memberError) {
    if (memberError.code === '23505') {
      showError('step-3-error', 'Anda sudah terdaftar di classroom ini.');
    } else {
      showError('step-3-error', 'Gagal bergabung classroom: ' + memberError.message);
    }
    btn.disabled = false;
    return;
  }

  window.location.href = 'dashboard.html';
}

document.addEventListener('DOMContentLoaded', async () => {
  const { data: { session } } = await db.auth.getSession();
  if (session) { window.location.href = 'dashboard.html'; return; }

  document.getElementById('btn-cek-kode').addEventListener('click', cekKode);
  document.getElementById('btn-verifikasi-siswa').addEventListener('click', verifikasiSiswa);
  document.getElementById('form-buat-akun').addEventListener('submit', buatAkun);
});
