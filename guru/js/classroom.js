(function () {
  const client = window.supabaseClient;

  let currentProfile    = null;
  let currentClassroomId = null;

  function escHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // -------------------------------------------------------------------------
  // Roster
  // -------------------------------------------------------------------------

  async function loadRoster() {
    const { data: rows, error } = await client
      .from('classroom_roster')
      .select('id, full_name, nis, profile_id')
      .eq('classroom_id', currentClassroomId)
      .order('full_name', { ascending: true });

    const listEl  = document.getElementById('roster-list');
    const countEl = document.getElementById('roster-count');

    if (error) {
      listEl.innerHTML = '<p class="empty-state">Gagal memuat roster: ' + escHtml(error.message) + '</p>';
      return;
    }

    countEl.textContent = rows ? rows.length : 0;

    if (!rows || rows.length === 0) {
      listEl.innerHTML = '<p class="empty-state">Belum ada siswa. Tambah via form atau upload CSV.</p>';
      return;
    }

    let tbody = '';
    rows.forEach(function (r, i) {
      const statusClass = r.profile_id ? 'status-sudah' : 'status-belum';
      const statusText  = r.profile_id ? 'Sudah Daftar' : 'Belum Daftar';
      tbody +=
        '<tr>' +
          '<td>' + (i + 1) + '</td>' +
          '<td>' + escHtml(r.full_name) + '</td>' +
          '<td>' + escHtml(r.nis) + '</td>' +
          '<td class="' + statusClass + '">' + statusText + '</td>' +
        '</tr>';
    });

    listEl.innerHTML =
      '<table>' +
        '<thead><tr><th>No</th><th>Nama</th><th>NIS</th><th>Status</th></tr></thead>' +
        '<tbody>' + tbody + '</tbody>' +
      '</table>';
  }

  // -------------------------------------------------------------------------
  // Tambah manual
  // -------------------------------------------------------------------------

  document.getElementById('form-tambah').addEventListener('submit', async function (e) {
    e.preventDefault();

    const nama      = document.getElementById('inp-nama').value.trim();
    const nis       = document.getElementById('inp-nis').value.trim();
    const errorEl   = document.getElementById('tambah-error');
    const btn       = document.getElementById('btn-tambah');

    errorEl.style.display = 'none';
    btn.disabled = true;
    btn.textContent = 'Menyimpan...';

    const { error } = await client
      .from('classroom_roster')
      .insert({
        classroom_id: currentClassroomId,
        teacher_id:   currentProfile.id,
        full_name:    nama,
        nis:          nis,
      });

    btn.disabled = false;
    btn.textContent = 'Tambah';

    if (error) {
      const msg = error.code === '23505'
        ? 'NIS sudah terdaftar di classroom ini.'
        : error.message;
      errorEl.textContent = msg;
      errorEl.style.display = 'block';
      return;
    }

    this.reset();
    await loadRoster();
  });

  // -------------------------------------------------------------------------
  // Upload CSV
  // -------------------------------------------------------------------------

  document.getElementById('btn-upload').addEventListener('click', async function () {
    const fileInput  = document.getElementById('inp-csv');
    const resultEl   = document.getElementById('upload-result');

    resultEl.style.display = 'none';
    resultEl.textContent   = '';

    if (!fileInput.files || !fileInput.files[0]) {
      alert('Pilih file CSV dulu.');
      return;
    }

    const file = fileInput.files[0];

    const text = await new Promise(function (resolve, reject) {
      const reader = new FileReader();
      reader.onload  = function (e) { resolve(e.target.result); };
      reader.onerror = function ()  { reject(new Error('Gagal membaca file.')); };
      reader.readAsText(file);
    });

    const rows = text
      .split(/\r?\n/)
      .map(function (line) { return line.split(',').map(function (v) { return v.trim(); }); })
      .filter(function (cols) { return cols[0] && cols[1]; })
      .map(function (cols) {
        return {
          classroom_id: currentClassroomId,
          teacher_id:   currentProfile.id,
          full_name:    cols[0],
          nis:          cols[1],
        };
      });

    if (rows.length === 0) {
      resultEl.textContent   = 'Tidak ada baris valid di file CSV.';
      resultEl.style.display = 'block';
      return;
    }

    const { error } = await client
      .from('classroom_roster')
      .upsert(rows, { onConflict: 'classroom_id,nis', ignoreDuplicates: true });

    if (error) {
      resultEl.textContent   = 'Gagal import: ' + error.message;
      resultEl.style.display = 'block';
      return;
    }

    resultEl.textContent   = 'Import selesai: ' + rows.length + ' siswa diproses.';
    resultEl.style.display = 'block';
    fileInput.value        = '';
    await loadRoster();
  });

  // -------------------------------------------------------------------------
  // Init
  // -------------------------------------------------------------------------

  window.addEventListener('DOMContentLoaded', async function () {
    // 1. Cek session
    const { data: { session } } = await client.auth.getSession();
    if (!session) { window.location.href = 'index.html'; return; }

    // 2. Ambil profile
    const { data: profile, error: profileError } = await client
      .from('profiles')
      .select('id, full_name')
      .eq('user_id', session.user.id)
      .single();
    if (profileError || !profile) { window.location.href = 'index.html'; return; }
    currentProfile = profile;
    document.getElementById('guru-name-cl').textContent = profile.full_name;

    // 3. Ambil classroom_id dari URL
    const classroomId = new URLSearchParams(window.location.search).get('id');
    if (!classroomId) { window.location.href = 'dashboard.html'; return; }
    currentClassroomId = classroomId;

    // 4. Verifikasi ownership classroom
    const { data: classroom, error: clError } = await client
      .from('classrooms')
      .select('id, name, subject, classroom_code, description')
      .eq('id', classroomId)
      .eq('teacher_id', profile.id)
      .single();
    if (clError || !classroom) { window.location.href = 'dashboard.html'; return; }

    // 5. Isi header
    document.getElementById('cl-name').textContent    = classroom.name;
    document.getElementById('cl-code').textContent    = classroom.classroom_code;
    document.getElementById('cl-subject').textContent = classroom.subject || '';
    document.title = 'SIP Mandiri — ' + classroom.name;

    // 6. Load roster
    await loadRoster();
  });

}());
