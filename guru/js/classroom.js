(function () {
  const client = window.supabaseClient;

  let currentProfile     = null;
  let currentClassroomId = null;
  let currentClassroom   = null;
  let trialStatus        = null;
  let currentRows        = [];

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
    currentRows = rows || [];

    if (!rows || rows.length === 0) {
      listEl.innerHTML = '<p class="empty-state">Belum ada siswa. Tambah via form atau upload CSV.</p>';
      updateSelectionUI();
      return;
    }

    let tbody = '';
    rows.forEach(function (r, i) {
      const statusClass = r.profile_id ? 'status-sudah' : 'status-belum';
      const statusText  = r.profile_id ? 'Sudah Ada Akun' : 'Belum Ada Akun';
      const isExpired = trialStatus && trialStatus.status === 'expired';
      const genBtn = r.profile_id
        ? '<button disabled class="btn-gen-disabled">Sudah</button>'
        : isExpired
          ? '<button disabled class="btn-gen-disabled" title="Aktifkan akun untuk menggunakan fitur ini">Generate Akun</button>'
          : '<button class="btn-gen-akun" data-idx="' + i + '">Generate Akun</button>';
      const links = generateShareLink(r);
      tbody +=
        '<tr>' +
          '<td><input type="checkbox" class="chk-row" data-idx="' + i + '"></td>' +
          '<td>' + (i + 1) + '</td>' +
          '<td>' + escHtml(r.full_name) + '</td>' +
          '<td>' + escHtml(r.nis) + '</td>' +
          '<td>' + escHtml(r.nama_ortu || '—') + '</td>' +
          '<td class="' + statusClass + '">' + statusText + '</td>' +
          '<td>' + genBtn + '</td>' +
          '<td>' +
            '<button class="btn-qr" data-idx="' + i + '">QR</button> ' +
            '<button class="btn-link" data-idx="' + i + '" data-siswa="' + escHtml(links.siswa) + '" data-ortu="' + escHtml(links.ortu) + '">Link</button>' +
          '</td>' +
        '</tr>';
    });

    listEl.innerHTML =
      '<table>' +
        '<thead><tr>' +
          '<th><input type="checkbox" id="chk-all" title="Centang semua"></th>' +
          '<th>No</th><th>Nama</th><th>NIS</th><th>Nama Ortu</th>' +
          '<th>Status Akun</th><th>Generate</th><th>Bagikan</th>' +
        '</tr></thead>' +
        '<tbody>' + tbody + '</tbody>' +
      '</table>';

    // Checkbox utama
    var chkAll = listEl.querySelector('#chk-all');
    chkAll.addEventListener('change', function () {
      listEl.querySelectorAll('.chk-row').forEach(function (c) { c.checked = chkAll.checked; });
      updateSelectionUI();
    });

    // Checkbox per baris
    listEl.querySelectorAll('.chk-row').forEach(function (chk) {
      chk.addEventListener('change', function () {
        var all = listEl.querySelectorAll('.chk-row');
        var checked = listEl.querySelectorAll('.chk-row:checked');
        chkAll.indeterminate = checked.length > 0 && checked.length < all.length;
        chkAll.checked = checked.length === all.length;
        updateSelectionUI();
      });
    });

    updateSelectionUI();

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
          showCredentialsModal(row.full_name, result.siswa_email, result.ortu_email, result.password);
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
      btn.addEventListener('click', async function () {
        const row   = rows[parseInt(this.dataset.idx, 10)];
        const links = { siswa: this.dataset.siswa, ortu: this.dataset.ortu };
        await shareLinks(row, links);
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
  // Upload Daftar Siswa (CSV + Excel)
  // -------------------------------------------------------------------------

  function parseRosterRows(allCols) {
    // Normalisasi header jika ada — cek baris pertama: NIS non-numerik = header
    var data = (allCols.length > 0 && !/^\d+$/.test((allCols[0][1] || '').toString().trim()))
      ? allCols.slice(1)
      : allCols;

    return data
      .filter(function (cols) { return cols[0] && cols[1]; })
      .map(function (cols) {
        return {
          classroom_id: currentClassroomId,
          teacher_id:   currentProfile.id,
          full_name:    String(cols[0]).trim(),
          nis:          String(cols[1]).trim(),
          nama_ortu:    cols[2] ? String(cols[2]).trim() : null,
        };
      })
      .filter(function (r) { return r.full_name && /^\d+$/.test(r.nis); });
  }

  function parseColsFromExcel(wb) {
    var sheet = wb.Sheets[wb.SheetNames[0]];
    var raw   = window.XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
    if (!raw.length) return [];

    // Deteksi header row case-insensitive
    var firstRow = raw[0].map(function (c) { return String(c).trim().toLowerCase(); });
    var namaIdx  = firstRow.indexOf('nama');
    var nisIdx   = firstRow.indexOf('nis');
    var ortuIdx  = firstRow.indexOf('nama_ortu');

    // Jika header ditemukan, gunakan index dari header; jika tidak, pakai posisi 0,1,2
    if (nisIdx !== -1 && namaIdx !== -1) {
      return raw.slice(1).map(function (r) {
        return [r[namaIdx], r[nisIdx], ortuIdx !== -1 ? r[ortuIdx] : ''];
      });
    }
    return raw;
  }

  document.getElementById('btn-upload').addEventListener('click', async function () {
    const fileInput = document.getElementById('inp-csv');
    const resultEl  = document.getElementById('upload-result');

    resultEl.style.display = 'none';
    resultEl.textContent   = '';

    if (!fileInput.files || !fileInput.files[0]) {
      alert('Pilih file dulu (CSV atau Excel).');
      return;
    }

    const file = fileInput.files[0];
    const ext  = file.name.split('.').pop().toLowerCase();
    let rows;

    try {
      if (ext === 'xlsx' || ext === 'xls') {
        const buffer = await new Promise(function (resolve, reject) {
          const reader = new FileReader();
          reader.onload  = function (e) { resolve(e.target.result); };
          reader.onerror = function ()  { reject(new Error('Gagal membaca file.')); };
          reader.readAsArrayBuffer(file);
        });
        const wb   = window.XLSX.read(new Uint8Array(buffer), { type: 'array' });
        const cols = parseColsFromExcel(wb);
        rows = parseRosterRows(cols);
      } else {
        const text = await new Promise(function (resolve, reject) {
          const reader = new FileReader();
          reader.onload  = function (e) { resolve(e.target.result); };
          reader.onerror = function ()  { reject(new Error('Gagal membaca file.')); };
          reader.readAsText(file);
        });

        // Parser CSV minimal — handle quoted fields (misal: "Nama, S.Pd")
        function parseLine(line) {
          var fields = [], field = '', inQ = false;
          for (var i = 0; i < line.length; i++) {
            var ch = line[i];
            if (inQ) {
              if (ch === '"') { if (line[i + 1] === '"') { field += '"'; i++; } else { inQ = false; } }
              else { field += ch; }
            } else {
              if (ch === '"') { inQ = true; }
              else if (ch === ',') { fields.push(field.trim()); field = ''; }
              else { field += ch; }
            }
          }
          fields.push(field.trim());
          return fields;
        }

        var allCols = text.split(/\r?\n/)
          .filter(function (l) { return l.trim(); })
          .map(parseLine);

        rows = parseRosterRows(allCols);
      }
    } catch (err) {
      resultEl.textContent   = 'Gagal membaca file: ' + err.message;
      resultEl.style.display = 'block';
      return;
    }

    if (rows.length === 0) {
      resultEl.textContent   = 'Tidak ada baris valid di file. Pastikan kolom nama dan NIS (angka) ada.';
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

  document.getElementById('btn-gen-terpilih').addEventListener('click', async function () {
    await generateTerpilih();
  });

  document.getElementById('btn-hapus-terpilih').addEventListener('click', async function () {
    await hapusTerpilih();
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
  // hapusAkun
  // -------------------------------------------------------------------------

  async function hapusAkun(profileId) {
    const EDGE_URL = 'https://teccdzetrdjowqemnuuc.supabase.co/functions/v1/hapus-akun';
    const { data: { session } } = await client.auth.getSession();
    if (!session) return { error: 'Sesi tidak valid. Silakan login ulang.' };

    const res = await fetch(EDGE_URL, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + session.access_token,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        profile_id:   profileId,
        classroom_id: currentClassroomId,
      }),
    });

    const json = await res.json();
    if (!json.success) return { error: json.error || 'Hapus akun gagal.' };
    return { deleted: json.deleted };
  }

  // -------------------------------------------------------------------------
  // updateSelectionUI — sinkronkan label + disabled kedua tombol terpilih
  // -------------------------------------------------------------------------

  function updateSelectionUI() {
    var listEl = document.getElementById('roster-list');
    var checked = listEl ? listEl.querySelectorAll('.chk-row:checked') : [];
    var countChecked = checked.length;

    var btnGen   = document.getElementById('btn-gen-terpilih');
    var btnHapus = document.getElementById('btn-hapus-terpilih');
    if (!btnGen || !btnHapus) return;

    btnGen.textContent   = 'Generate Terpilih (' + countChecked + ')';
    btnHapus.textContent = 'Hapus Terpilih (' + countChecked + ')';

    var isExpired = trialStatus && trialStatus.status === 'expired';
    btnGen.disabled   = countChecked === 0 || isExpired;
    btnHapus.disabled = countChecked === 0 || isExpired;
  }

  // -------------------------------------------------------------------------
  // generateTerpilih — proses berurutan siswa yang dicentang + belum punya akun
  // -------------------------------------------------------------------------

  async function generateTerpilih() {
    var listEl  = document.getElementById('roster-list');
    var checked = listEl ? listEl.querySelectorAll('.chk-row:checked') : [];
    var targets = [];
    var sudahPunyaAkun = 0;
    checked.forEach(function (chk) {
      var r = currentRows[parseInt(chk.dataset.idx, 10)];
      if (!r) return;
      if (r.profile_id) { sudahPunyaAkun++; } else { targets.push(r); }
    });

    if (sudahPunyaAkun > 0) {
      alert('Beberapa siswa yang dipilih sudah punya akun. Pilih hanya siswa yang belum punya akun untuk generate.');
      return;
    }
    if (targets.length === 0) return;

    var ok = window.confirm('Generate akun untuk ' + targets.length + ' siswa?');
    if (!ok) return;

    var btnGen   = document.getElementById('btn-gen-terpilih');
    var resultEl = document.getElementById('generate-result');
    var banner   = document.getElementById('processing-banner');

    btnGen.classList.add('btn-processing');
    btnGen.removeAttribute('disabled');
    if (banner) { banner.style.display = 'block'; }
    resultEl.style.display = 'none';

    var berhasil = 0;
    var gagal    = 0;
    for (var i = 0; i < targets.length; i++) {
      var row = targets[i];
      btnGen.textContent = 'Memproses ' + row.full_name + '... (' + (i + 1) + '/' + targets.length + ')';
      var result = await generateSingleAccount(row);
      if (result.error) { gagal++; } else { berhasil++; }
    }

    btnGen.classList.remove('btn-processing');
    if (banner) { banner.style.display = 'none'; }

    resultEl.textContent   = 'Selesai: ' + berhasil + ' berhasil, ' + gagal + ' gagal.';
    resultEl.style.display = 'block';

    // Uncentang semua
    if (listEl) {
      listEl.querySelectorAll('.chk-row').forEach(function (c) { c.checked = false; });
      var chkAll = listEl.querySelector('#chk-all');
      if (chkAll) { chkAll.checked = false; chkAll.indeterminate = false; }
    }
    await loadRoster();
  }

  // -------------------------------------------------------------------------
  // hapusTerpilih — proses berurutan siswa yang dicentang + sudah punya akun
  // -------------------------------------------------------------------------

  async function hapusRosterOnly(row) {
    const { error } = await client
      .from('classroom_roster')
      .delete()
      .eq('classroom_id', currentClassroomId)
      .eq('nis', row.nis);
    if (error) return { error: error.message };
    return { deleted: true };
  }

  async function hapusTerpilih() {
    var listEl  = document.getElementById('roster-list');
    var checked = listEl ? listEl.querySelectorAll('.chk-row:checked') : [];
    var targets = [];
    checked.forEach(function (chk) {
      var r = currentRows[parseInt(chk.dataset.idx, 10)];
      if (r) targets.push(r);
    });
    if (targets.length === 0) return;

    var withAkun   = targets.filter(function (r) { return r.profile_id; }).length;
    var rosterOnly = targets.length - withAkun;

    var msgParts = [];
    if (withAkun   > 0) msgParts.push(withAkun   + ' siswa akan dihapus akunnya');
    if (rosterOnly > 0) msgParts.push(rosterOnly  + ' siswa akan dihapus dari daftar saja');
    var msgDetail = msgParts.join(', ');

    // Konfirmasi: overlay dengan input "HAPUS" untuk > 10, window.confirm untuk ≤ 10
    var confirmed = await (targets.length > 10
      ? konfirmasiKuat(targets.length, withAkun, rosterOnly)
      : Promise.resolve(window.confirm(msgDetail + '.\nTindakan ini tidak bisa dibatalkan.')));
    if (!confirmed) return;

    var btnHapus = document.getElementById('btn-hapus-terpilih');
    var banner   = document.getElementById('processing-banner');

    btnHapus.classList.add('btn-hapus-processing');
    btnHapus.removeAttribute('disabled');
    if (banner) { banner.style.display = 'block'; }

    var berhasil = 0;
    var gagal    = 0;
    for (var i = 0; i < targets.length; i++) {
      var row = targets[i];
      btnHapus.textContent = 'Menghapus ' + row.full_name + '... (' + (i + 1) + '/' + targets.length + ')';
      var result = row.profile_id ? await hapusAkun(row.profile_id) : await hapusRosterOnly(row);
      if (result.error) { gagal++; } else { berhasil++; }
    }

    btnHapus.classList.remove('btn-hapus-processing');
    if (banner) { banner.style.display = 'none'; }

    showShareNotif('Selesai: ' + berhasil + ' berhasil dihapus, ' + gagal + ' gagal.');

    // Reset state tombol secara eksplisit — agar tetap benar jika loadRoster() error
    btnHapus.textContent = 'Hapus Terpilih (0)';
    btnHapus.disabled    = true;

    await loadRoster();
  }

  // Overlay konfirmasi kuat: user harus mengetik "HAPUS" untuk melanjutkan
  function konfirmasiKuat(jumlah, withAkun, rosterOnly) {
    return new Promise(function (resolve) {
      var overlay = document.createElement('div');
      overlay.className = 'share-overlay';

      var box = document.createElement('div');
      box.className = 'share-box';

      var title = document.createElement('p');
      title.innerHTML = '<strong>Konfirmasi Hapus ' + jumlah + ' Siswa</strong>';

      var detailParts = [];
      if (withAkun   > 0) detailParts.push(withAkun   + ' siswa akan dihapus akunnya');
      if (rosterOnly > 0) detailParts.push(rosterOnly  + ' siswa akan dihapus dari daftar saja');

      var pesan = document.createElement('p');
      pesan.style.color  = '#c0392b';
      pesan.style.margin = '4px 0 8px';
      pesan.textContent  = detailParts.join(', ') + '. Tindakan ini tidak bisa dibatalkan. Ketik HAPUS untuk melanjutkan.';

      var inp = document.createElement('input');
      inp.type        = 'text';
      inp.placeholder = 'Ketik HAPUS';
      inp.style.cssText = 'width:100%;box-sizing:border-box;padding:.45rem;border:1px solid #ddd;border-radius:.4rem;font-size:1rem;';

      var rowBtn = document.createElement('div');
      rowBtn.style.cssText = 'display:flex;gap:.5rem;justify-content:flex-end;margin-top:.25rem;';

      var btnBatal = document.createElement('button');
      btnBatal.type        = 'button';
      btnBatal.textContent = 'Batal';

      var btnOk = document.createElement('button');
      btnOk.type        = 'button';
      btnOk.textContent = 'Hapus';
      btnOk.disabled    = true;
      btnOk.style.background = '#c0392b';
      btnOk.style.color      = '#fff';

      function done(val) {
        overlay.remove();
        document.removeEventListener('keydown', onEsc);
        resolve(val);
      }

      inp.addEventListener('input', function () {
        btnOk.disabled = inp.value.trim() !== 'HAPUS';
      });
      btnOk.addEventListener('click', function () { done(true); });
      btnBatal.addEventListener('click', function () { done(false); });
      overlay.addEventListener('click', function (e) { if (e.target === overlay) { done(false); } });

      function onEsc(e) { if (e.key === 'Escape') { done(false); } }
      document.addEventListener('keydown', onEsc);

      rowBtn.appendChild(btnBatal);
      rowBtn.appendChild(btnOk);
      box.appendChild(title);
      box.appendChild(pesan);
      box.appendChild(inp);
      box.appendChild(rowBtn);
      overlay.appendChild(box);
      document.body.appendChild(overlay);

      inp.focus();
    });
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
    // Base URL dengan /kelasku/ prefix untuk GitHub Pages
    // window.location.origin = https://teguhalficahlin-del.github.io
    const base = window.location.origin + '/kelasku';
    return {
      siswa: base + '/siswa/?kelas=' + encodeURIComponent(code) + '&nis=' + encodeURIComponent(siswa.nis),
      ortu:  base + '/ortu/?kelas='  + encodeURIComponent(code) + '&nis=' + encodeURIComponent(siswa.nis),
    };
  }

  // -------------------------------------------------------------------------
  // Trial gate — disable fitur generate/upload saat status expired
  // -------------------------------------------------------------------------

  async function loadTrialStatus() {
    try {
      const stored = sessionStorage.getItem('guru_trial_status');
      if (stored) { trialStatus = JSON.parse(stored); return; }
    } catch (_) {}
    // Fallback: RPC langsung — tidak bergantung window.api agar tetap aman
    // jika guru buka classroom.html langsung tanpa melewati dashboard
    try {
      const { data } = await client.rpc('fn_guru_trial_status');
      if (data) {
        trialStatus = data;
        try { sessionStorage.setItem('guru_trial_status', JSON.stringify(trialStatus)); } catch (_) {}
      }
    } catch (_) {}
  }

  function applyTrialGate() {
    if (!trialStatus || trialStatus.status !== 'expired') return;
    const hint = 'Aktifkan akun untuk menggunakan fitur ini';

    const btnGenTerpilih = document.getElementById('btn-gen-terpilih');
    btnGenTerpilih.disabled = true;
    btnGenTerpilih.title = hint;

    const btnHapusTerpilih = document.getElementById('btn-hapus-terpilih');
    btnHapusTerpilih.disabled = true;
    btnHapusTerpilih.title = hint;

    const terpilihHint = document.createElement('small');
    terpilihHint.className = 'trial-hint';
    terpilihHint.textContent = hint;
    btnGenTerpilih.parentNode.appendChild(terpilihHint);

    const btnUpload = document.getElementById('btn-upload');
    btnUpload.disabled = true;
    btnUpload.title = hint;

    const inpCsv = document.getElementById('inp-csv');
    inpCsv.disabled = true;

    const uploadHint = document.createElement('small');
    uploadHint.className = 'trial-hint';
    uploadHint.textContent = hint;
    btnUpload.parentNode.insertAdjacentElement('afterend', uploadHint);
  }

  // -------------------------------------------------------------------------
  // shareLinks — Web Share API → Clipboard → fallback textarea readonly
  // -------------------------------------------------------------------------

  async function shareLinks(row, links) {
    const msg = 'Link Siswa:\n' + links.siswa + '\n\nLink Ortu:\n' + links.ortu;

    if (navigator.share) {
      try {
        await navigator.share({ title: 'Login SIP Mandiri — ' + row.full_name, text: msg });
      } catch (err) {
        // AbortError = user cancel native sheet — tidak perlu fallback
        if (err.name !== 'AbortError') { showShareFallback(msg); }
      }
    } else if (navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(msg);
        showShareNotif('Link disalin ke clipboard ✓');
      } catch (_) {
        showShareFallback(msg);
      }
    } else {
      showShareFallback(msg);
    }
  }

  function showShareNotif(text) {
    const notif = document.createElement('div');
    notif.className = 'share-notif';
    notif.textContent = text;
    document.body.appendChild(notif);
    setTimeout(function () { if (notif.parentNode) { notif.remove(); } }, 2500);
  }

  function showShareFallback(text) {
    const overlay = document.createElement('div');
    overlay.className = 'share-overlay';

    const box = document.createElement('div');
    box.className = 'share-box';

    const label = document.createElement('p');
    label.textContent = 'Salin link di bawah:';

    const ta = document.createElement('textarea');
    ta.value    = text;
    ta.readOnly = true;
    ta.rows     = 5;

    const closeBtn = document.createElement('button');
    closeBtn.type        = 'button';
    closeBtn.textContent = 'Tutup';
    closeBtn.addEventListener('click', function () { overlay.remove(); });

    // Tutup saat klik di luar box
    overlay.addEventListener('click', function (e) { if (e.target === overlay) { overlay.remove(); } });

    // Tutup dengan Escape
    function onEsc(e) {
      if (e.key === 'Escape') { overlay.remove(); document.removeEventListener('keydown', onEsc); }
    }
    document.addEventListener('keydown', onEsc);

    box.appendChild(label);
    box.appendChild(ta);
    box.appendChild(closeBtn);
    overlay.appendChild(box);
    document.body.appendChild(overlay);

    // Auto-select agar mudah di-copy manual
    ta.focus();
    ta.select();
  }

  // -------------------------------------------------------------------------
  // showCredentialsModal — tampil sekali setelah generate single akun berhasil
  // -------------------------------------------------------------------------

  function showCredentialsModal(namaLengkap, siswaEmail, ortuEmail, password) {
    const overlay = document.createElement('div');
    overlay.className = 'share-overlay';

    const box = document.createElement('div');
    box.className = 'share-box';

    const title = document.createElement('p');
    title.innerHTML = '<strong>Akun berhasil dibuat — ' + escHtml(namaLengkap) + '</strong>';

    const pesan = document.createElement('p');
    pesan.style.color  = '#c0392b';
    pesan.style.margin = '4px 0 10px';
    pesan.textContent  = 'Simpan password ini — tidak akan ditampilkan lagi.';

    const ta = document.createElement('textarea');
    ta.readOnly = true;
    ta.rows     = 5;
    ta.value    =
      'Email Siswa : ' + siswaEmail + '\n' +
      'Email Ortu  : ' + ortuEmail  + '\n' +
      'Password    : ' + password;

    const closeBtn = document.createElement('button');
    closeBtn.type        = 'button';
    closeBtn.textContent = 'Tutup';
    closeBtn.addEventListener('click', function () { overlay.remove(); document.removeEventListener('keydown', onEsc); });

    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) { overlay.remove(); document.removeEventListener('keydown', onEsc); }
    });

    function onEsc(e) {
      if (e.key === 'Escape') { overlay.remove(); document.removeEventListener('keydown', onEsc); }
    }
    document.addEventListener('keydown', onEsc);

    box.appendChild(title);
    box.appendChild(pesan);
    box.appendChild(ta);
    box.appendChild(closeBtn);
    overlay.appendChild(box);
    document.body.appendChild(overlay);

    ta.focus();
    ta.select();
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

    await loadTrialStatus();
    applyTrialGate();

    await loadRoster();
  });

}());
