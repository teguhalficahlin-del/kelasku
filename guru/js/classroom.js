(function () {
  const client = window.supabaseClient;

  let currentProfile     = null;
  let currentClassroomId = null;
  let currentClassroom   = null;

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
      .select('id, full_name, nis, nama_ortu, profile_id')
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
      const statusText  = r.profile_id ? 'Sudah Ada Akun' : 'Belum Ada Akun';
      const genBtn = r.profile_id
        ? '<button disabled class="btn-gen-disabled">Sudah</button>'
        : '<button class="btn-gen-akun" data-idx="' + i + '">Generate Akun</button>';
      const links = generateShareLink(r);
      tbody +=
        '<tr>' +
          '<td>' + (i + 1) + '</td>' +
          '<td>' + escHtml(r.full_name) + '</td>' +
          '<td>' + escHtml(r.nis) + '</td>' +
          '<td>' + escHtml(r.nama_ortu || '—') + '</td>' +
          '<td class="' + statusClass + '">' + statusText + '</td>' +
          '<td>' + genBtn + '</td>' +
          '<td>' +
            '<button class="btn-qr" data-idx="' + i + '">QR</button> ' +
            '<button class="btn-link" data-siswa="' + escHtml(links.siswa) + '" data-ortu="' + escHtml(links.ortu) + '">Link</button>' +
          '</td>' +
        '</tr>';
    });

    listEl.innerHTML =
      '<table>' +
        '<thead><tr>' +
          '<th>No</th><th>Nama</th><th>NIS</th><th>Nama Ortu</th>' +
          '<th>Status Akun</th><th>Generate</th><th>Bagikan</th>' +
        '</tr></thead>' +
        '<tbody>' + tbody + '</tbody>' +
      '</table>';

    listEl.querySelectorAll('.btn-gen-akun').forEach(function (btn) {
      btn.addEventListener('click', async function () {
        const row = rows[parseInt(this.dataset.idx, 10)];
        this.disabled = true;
        this.textContent = 'Generating...';
        const result = await generateSingleAccount(row);
        if (result.error) {
          alert('Gagal: ' + result.error);
          this.disabled = false;
          this.textContent = 'Generate Akun';
        } else {
          await loadRoster();
        }
      });
    });

    listEl.querySelectorAll('.btn-qr').forEach(function (btn) {
      btn.addEventListener('click', async function () {
        const row = rows[parseInt(this.dataset.idx, 10)];
        let dataUrl;
        try {
          dataUrl = await generateQRCode(row);
        } catch (err) {
          alert(err.message || 'Gagal membuat QR code.');
          return;
        }
        const win = window.open('', '_blank', 'width=400,height=500');
        win.document.write(
          '<!DOCTYPE html><html><body style="text-align:center;font-family:sans-serif;">' +
          '<h3>' + escHtml(row.full_name) + ' (' + escHtml(row.nis) + ')</h3>' +
          '<img src="' + dataUrl + '" style="max-width:300px"><br>' +
          '<a href="' + escHtml(generateShareLink(row).siswa) + '">' + escHtml(generateShareLink(row).siswa) + '</a>' +
          '</body></html>'
        );
      });
    });

    listEl.querySelectorAll('.btn-link').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const msg = 'Link Siswa:\n' + this.dataset.siswa + '\n\nLink Ortu:\n' + this.dataset.ortu;
        prompt('Salin link:', msg);
      });
    });
  }

  // -------------------------------------------------------------------------
  // Tambah manual
  // -------------------------------------------------------------------------

  document.getElementById('form-tambah').addEventListener('submit', async function (e) {
    e.preventDefault();

    const nama      = document.getElementById('inp-nama').value.trim();
    const nis       = document.getElementById('inp-nis').value.trim();
    const namaOrtu  = document.getElementById('inp-nama-ortu').value.trim();
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
        nama_ortu:    namaOrtu || null,
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
    const fileInput = document.getElementById('inp-csv');
    const resultEl  = document.getElementById('upload-result');

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
          nama_ortu:    cols[2] || null,
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
  // Generate Semua
  // -------------------------------------------------------------------------

  document.getElementById('btn-generate-semua').addEventListener('click', async function () {
    await generateAllAccounts();
  });

  // -------------------------------------------------------------------------
  // generateSingleAccount
  // -------------------------------------------------------------------------

  async function generateSingleAccount(siswa) {
    const EDGE_URL = 'https://teccdzetrdjowqemnuuc.supabase.co/functions/v1/generate-akun';

    // Kirim JWT session guru — bukan anon key — agar Edge Function bisa verifikasi identitas
    const { data: { session } } = await client.auth.getSession();
    if (!session) return { error: 'Sesi tidak valid. Silakan login ulang.' };

    const res = await fetch(EDGE_URL, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + session.access_token,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        nis:            siswa.nis,
        nama:           siswa.full_name,
        nama_ortu:      siswa.nama_ortu || null,
        classroom_code: currentClassroom.classroom_code,
        classroom_id:   currentClassroomId,
      }),
    });

    const json = await res.json();
    if (!json.success) return { error: json.error || 'Generate akun gagal.' };
    return { siswa_email: json.siswa_email, ortu_email: json.ortu_email, password: json.password };
  }

  // -------------------------------------------------------------------------
  // generateAllAccounts
  // -------------------------------------------------------------------------

  async function generateAllAccounts() {
    const resultEl = document.getElementById('generate-result');
    const btn      = document.getElementById('btn-generate-semua');

    btn.disabled = true;
    resultEl.style.display = 'none';

    const { data: rows, error } = await client
      .from('classroom_roster')
      .select('id, full_name, nis, nama_ortu, profile_id')
      .eq('classroom_id', currentClassroomId)
      .is('profile_id', null);

    if (error || !rows || rows.length === 0) {
      resultEl.textContent   = rows && rows.length === 0
        ? 'Semua siswa sudah punya akun.'
        : 'Gagal memuat roster: ' + (error ? error.message : '');
      resultEl.style.display = 'block';
      btn.disabled = false;
      return;
    }

    // Konfirmasi sebelum eksekusi — jumlah siswa sudah diketahui dari query di atas
    const confirmed = window.confirm(
      'Generate akun untuk ' + rows.length + ' siswa? Tindakan ini tidak bisa dibatalkan.'
    );
    if (!confirmed) {
      btn.disabled = false;
      return;
    }

    let berhasil = 0;
    let gagal    = 0;

    for (const row of rows) {
      const result = await generateSingleAccount(row);
      if (result.error) { gagal++; } else { berhasil++; }
    }

    resultEl.textContent   = 'Selesai: ' + berhasil + ' berhasil, ' + gagal + ' gagal.';
    resultEl.style.display = 'block';
    btn.disabled = false;
    await loadRoster();
  }

  // -------------------------------------------------------------------------
  // generateQRCode
  // -------------------------------------------------------------------------

  async function generateQRCode(siswa) {
    // Guard: library di-load via CDN — bisa gagal jika offline atau CDN down
    if (typeof window.QRCode === 'undefined') {
      return Promise.reject(new Error('Library QR code gagal dimuat. Coba refresh halaman.'));
    }
    const url = generateShareLink(siswa).siswa;
    return new Promise(function (resolve, reject) {
      QRCode.toDataURL(url, { width: 300, margin: 2 }, function (err, dataUrl) {
        if (err) { reject(err); } else { resolve(dataUrl); }
      });
    });
  }

  // -------------------------------------------------------------------------
  // generateShareLink
  // -------------------------------------------------------------------------

  function generateShareLink(siswa) {
    const code = currentClassroom ? currentClassroom.classroom_code : '';
    // Base URL dengan /sip-mandiri/ prefix untuk GitHub Pages
    // window.location.origin = https://teguhalficahlin-del.github.io
    const base = window.location.origin + '/sip-mandiri';
    return {
      siswa: base + '/siswa/?kelas=' + encodeURIComponent(code) + '&nis=' + encodeURIComponent(siswa.nis),
      ortu:  base + '/ortu/?kelas='  + encodeURIComponent(code) + '&nis=' + encodeURIComponent(siswa.nis),
    };
  }

  // -------------------------------------------------------------------------
  // Init
  // -------------------------------------------------------------------------

  window.addEventListener('DOMContentLoaded', async function () {
    const { data: { session } } = await client.auth.getSession();
    if (!session) { window.location.href = 'index.html'; return; }

    const { data: profile, error: profileError } = await client
      .from('profiles')
      .select('id, full_name')
      .eq('user_id', session.user.id)
      .single();
    if (profileError || !profile) { window.location.href = 'index.html'; return; }
    currentProfile = profile;
    document.getElementById('guru-name-cl').textContent = profile.full_name;

    const classroomId = new URLSearchParams(window.location.search).get('id');
    if (!classroomId) { window.location.href = 'dashboard.html'; return; }
    currentClassroomId = classroomId;

    const { data: classroom, error: clError } = await client
      .from('classrooms')
      .select('id, name, subject, classroom_code, description')
      .eq('id', classroomId)
      .eq('teacher_id', profile.id)
      .single();
    if (clError || !classroom) { window.location.href = 'dashboard.html'; return; }
    currentClassroom = classroom;

    document.getElementById('cl-name').textContent    = classroom.name;
    document.getElementById('cl-code').textContent    = classroom.classroom_code;
    document.getElementById('cl-subject').textContent = classroom.subject || '';
    document.title = 'SIP Mandiri — ' + classroom.name;

    await loadRoster();
  });

}());
