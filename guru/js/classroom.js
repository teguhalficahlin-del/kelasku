(function () {
  const client = window.supabaseClient;

  let currentProfile     = null;
  let currentClassroomId = null;
  let currentClassroom   = null;
  let trialStatus        = null;
  let currentRows        = [];
  let currentPage        = 0;
  let isGenerating       = false;

  const PAGE_SIZE = 10;

  function escHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function fallbackCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;opacity:0;';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }

  // -------------------------------------------------------------------------
  // renderPage — render slice currentRows ke tabel + pagination + event
  // -------------------------------------------------------------------------

  function renderPage(page) {
    currentPage = page;
    if (currentClassroomId) {
      try { localStorage.setItem('sip_roster_page_' + currentClassroomId, page); } catch (_) {}
    }
    var listEl = document.getElementById('roster-list');
    if (!listEl || currentRows.length === 0) return;

    var totalPages = Math.ceil(currentRows.length / PAGE_SIZE);
    var startIdx   = page * PAGE_SIZE;
    var pageRows   = currentRows.slice(startIdx, startIdx + PAGE_SIZE);

    function makePaginationBar() {
      var bar = document.createElement('div');
      bar.className = 'pagination-bar';

      var btnPrev = document.createElement('button');
      btnPrev.type        = 'button';
      btnPrev.textContent = '←';
      btnPrev.disabled    = page === 0;
      btnPrev.addEventListener('click', function () { renderPage(currentPage - 1); });

      var lbl = document.createElement('span');
      lbl.className   = 'page-label';
      lbl.textContent = 'Halaman ' + (page + 1) + ' dari ' + totalPages + ' (' + currentRows.length + ' siswa)';

      var btnNext = document.createElement('button');
      btnNext.type        = 'button';
      btnNext.textContent = '→';
      btnNext.disabled    = startIdx + PAGE_SIZE >= currentRows.length;
      btnNext.addEventListener('click', function () { renderPage(currentPage + 1); });

      bar.appendChild(btnPrev);
      bar.appendChild(lbl);
      bar.appendChild(btnNext);
      return bar;
    }

    var isExpired = trialStatus && trialStatus.status === 'EXPIRED';
    var cardsHtml = '';
    pageRows.forEach(function (r, i) {
      var globalIdx  = startIdx + i;
      var badge = r.profile_id ? '<span class="card-badge card-badge-sudah">Sudah Terdaftar</span>' : '';
      var genBtn = r.profile_id
        ? '<button disabled class="btn-gen-disabled">Sudah</button>'
        : isExpired
          ? '<button disabled class="btn-gen-disabled" title="Aktifkan akun untuk menggunakan fitur ini">Generate</button>'
          : '<button class="btn-gen-akun" data-idx="' + globalIdx + '">Generate</button>';

      var shareButtons =
        '<button class="btn-share btn-share-siswa" data-idx="' + globalIdx + '">Siswa</button>';
      if (r.nama_ortu) {
        shareButtons += '<button class="btn-share btn-share-ortu" data-idx="' + globalIdx + '">Ortu</button>';
      }

      var meta = 'NIS: ' + escHtml(r.nis);
      if (r.nama_ortu) { meta += ' · ' + escHtml(r.nama_ortu); }

      cardsHtml +=
        '<div class="roster-card">' +
          '<input type="checkbox" class="chk-row" data-idx="' + globalIdx + '">' +
          '<div class="card-body">' +
            '<div class="card-top">' +
              '<span class="card-name">' + escHtml(r.full_name) + '</span>' +
              badge +
            '</div>' +
            '<div class="card-meta">' + meta + '</div>' +
            '<div class="card-actions">' +
              '<button class="btn-qr" data-idx="' + globalIdx + '">QR</button>' +
              shareButtons +
              genBtn +
            '</div>' +
          '</div>' +
        '</div>';
    });

    var tableDiv = document.createElement('div');
    tableDiv.innerHTML =
      '<div class="card-select-all">' +
        '<input type="checkbox" id="chk-all" title="Centang semua di halaman ini">' +
        '<label for="chk-all">Pilih semua di halaman ini</label>' +
      '</div>' +
      '<div class="roster-cards">' + cardsHtml + '</div>';

    listEl.innerHTML = '';
    listEl.appendChild(makePaginationBar());
    listEl.appendChild(tableDiv);
    if (totalPages > 1) { listEl.appendChild(makePaginationBar()); }

    // --- Checkbox ---
    var chkAll = listEl.querySelector('#chk-all');
    chkAll.addEventListener('change', function () {
      listEl.querySelectorAll('.chk-row').forEach(function (c) { c.checked = chkAll.checked; });
      updateSelectionUI();
    });
    listEl.querySelectorAll('.chk-row').forEach(function (chk) {
      chk.addEventListener('change', function () {
        var all     = listEl.querySelectorAll('.chk-row');
        var checked = listEl.querySelectorAll('.chk-row:checked');
        chkAll.indeterminate = checked.length > 0 && checked.length < all.length;
        chkAll.checked       = checked.length === all.length;
        updateSelectionUI();
      });
    });

    // --- Generate akun per baris ---
    listEl.querySelectorAll('.btn-gen-akun').forEach(function (btn) {
      btn.addEventListener('click', async function () {
        var row = currentRows[parseInt(this.dataset.idx, 10)];
        this.disabled    = true;
        this.textContent = 'Generating...';
        var result = await generateSingleAccount(row);
        if (result.error) {
          alert('Gagal: ' + result.error);
          this.disabled    = false;
          this.textContent = 'Generate Akun';
        } else {
          showCredentialsModal(row.full_name, result.siswa_email, result.ortu_email, result.nis || row.nis);
          await loadRoster();
        }
      });
    });

    // --- QR ---
    listEl.querySelectorAll('.btn-qr').forEach(function (btn) {
      btn.addEventListener('click', async function () {
        var row = currentRows[parseInt(this.dataset.idx, 10)];
        let dataUrl;
        try {
          dataUrl = await generateQRCode(row);
        } catch (err) {
          alert(err.message || 'Gagal membuat QR code.');
          return;
        }
        var win = window.open('', '_blank', 'width=400,height=500');
        win.document.write(
          '<!DOCTYPE html><html><body style="text-align:center;font-family:sans-serif;">' +
          '<h3>' + escHtml(row.full_name) + ' (' + escHtml(row.nis) + ')</h3>' +
          '<img src="' + dataUrl + '" style="max-width:300px"><br>' +
          '<a href="' + escHtml(generateShareLink(row).siswa) + '">' + escHtml(generateShareLink(row).siswa) + '</a>' +
          '</body></html>'
        );
      });
    });

    // --- Share Siswa ---
    listEl.querySelectorAll('.btn-share-siswa').forEach(function (btn) {
      btn.addEventListener('click', async function () {
        var row = currentRows[parseInt(this.dataset.idx, 10)];
        var url = generateShareLink(row).siswa;
        try { await navigator.clipboard.writeText(url); } catch (_) { fallbackCopy(url); }
        showShareNotif('Disalin!');
      });
    });

    // --- Share Ortu ---
    listEl.querySelectorAll('.btn-share-ortu').forEach(function (btn) {
      btn.addEventListener('click', async function () {
        var row = currentRows[parseInt(this.dataset.idx, 10)];
        var url = generateShareLink(row).ortu;
        try { await navigator.clipboard.writeText(url); } catch (_) { fallbackCopy(url); }
        showShareNotif('Disalin!');
      });
    });

    // --- Swipe gesture (horizontal dominant) ---
    var touchStartX = 0;
    var touchStartY = 0;
    tableDiv.addEventListener('touchstart', function (e) {
      touchStartX = e.changedTouches[0].clientX;
      touchStartY = e.changedTouches[0].clientY;
    }, { passive: true });
    tableDiv.addEventListener('touchend', function (e) {
      var dx = e.changedTouches[0].clientX - touchStartX;
      var dy = e.changedTouches[0].clientY - touchStartY;
      if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 50) {
        if (dx < 0 && currentPage < totalPages - 1) { renderPage(currentPage + 1); }
        else if (dx > 0 && currentPage > 0)          { renderPage(currentPage - 1); }
      }
    }, { passive: true });

    updateSelectionUI();
  }

  // -------------------------------------------------------------------------
  // loadRoster — query DB, populate currentRows, lalu renderPage(0)
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

    countEl.textContent = (rows ? rows.length : 0) + ' siswa terdaftar';
    currentRows = rows || [];

    if (!rows || rows.length === 0) {
      listEl.innerHTML = '<p class="empty-state">Belum ada siswa. Tambah via form atau upload CSV.</p>';
      updateSelectionUI();
      return;
    }

    var savedPage = parseInt(localStorage.getItem('sip_roster_page_' + currentClassroomId)) || 0;
    var maxPage   = Math.max(0, Math.ceil(currentRows.length / PAGE_SIZE) - 1);
    renderPage(Math.min(savedPage, maxPage));

    // Panel absensi kini hanya dirender sekali (agar tanda yang belum disimpan
    // tidak hilang), jadi ia perlu diberi tahu saat roster berubah — misalnya
    // setelah Generate Akun menambah siswa yang bisa diabsen.
    window.dispatchEvent(new CustomEvent('roster-changed'));
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

    var firstRow = raw[0].map(function (c) { return String(c).trim().toLowerCase(); });
    var namaIdx  = firstRow.indexOf('nama');
    var nisIdx   = firstRow.indexOf('nis');
    var ortuIdx  = firstRow.indexOf('nama_ortu');

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

    // NIS yang sudah ada akan DITIMPA oleh upsert di bawah. Sebelumnya
    // peringatan ini hanya ditulis ke resultEl lalu langsung tertimpa pesan
    // "Import selesai" beberapa milidetik kemudian — guru tidak pernah sempat
    // membacanya, apalagi membatalkan. Sekarang proses berhenti dan menunggu.
    const nisExisting = new Set(currentRows.map(function(r) { return r.nis; }));
    const duplikat    = rows.filter(function(r) { return nisExisting.has(r.nis); });
    if (duplikat.length > 0) {
      var lanjut = await konfirmasiImportDuplikat(duplikat, rows.length);
      if (!lanjut) {
        resultEl.textContent   = 'Import dibatalkan. Tidak ada data yang diubah.';
        resultEl.style.display = 'block';
        return;
      }
    }

    const { error } = await client
      .from('classroom_roster')
      .upsert(rows, { onConflict: 'classroom_id,nis' });

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
  // Generate / Hapus terpilih
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
        nama_ortu:      (siswa.nama_ortu || '').trim() || null,
        classroom_code: currentClassroom.classroom_code,
        classroom_id:   currentClassroomId,
      }),
    });

    const json = await res.json();
    if (!json.success) return { error: json.error || 'Generate akun gagal.' };
    return { siswa_email: json.siswa_email, ortu_email: json.ortu_email, nis: json.nis };
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
  // updateSelectionUI
  // -------------------------------------------------------------------------

  function updateSelectionUI() {
    var listEl      = document.getElementById('roster-list');
    var checked     = listEl ? listEl.querySelectorAll('.chk-row:checked') : [];
    var countChecked = checked.length;

    var btnGen   = document.getElementById('btn-gen-terpilih');
    var btnHapus = document.getElementById('btn-hapus-terpilih');
    if (!btnGen || !btnHapus) return;

    btnGen.textContent   = 'Generate Terpilih (' + countChecked + ')';
    btnHapus.textContent = 'Hapus Terpilih (' + countChecked + ')';

    var isExpired = trialStatus && trialStatus.status === 'EXPIRED';
    btnGen.disabled   = countChecked === 0 || isExpired;
    btnHapus.disabled = countChecked === 0 || isExpired;
  }

  // -------------------------------------------------------------------------
  // generateTerpilih
  // -------------------------------------------------------------------------

  async function generateTerpilih() {
    if (isGenerating) return;

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

    isGenerating = true;
    var btnGen   = document.getElementById('btn-gen-terpilih');
    var resultEl = document.getElementById('generate-result');
    var banner   = document.getElementById('processing-banner');

    btnGen.classList.add('btn-processing');
    btnGen.removeAttribute('disabled');
    if (banner) { banner.style.display = 'block'; }
    resultEl.style.display = 'none';

    try {
      var berhasil  = 0;
      var gagal     = 0;
      var gagalNama = [];
      for (var i = 0; i < targets.length; i++) {
        var row = targets[i];
        btnGen.textContent = 'Memproses ' + row.full_name + '... (' + (i + 1) + '/' + targets.length + ')';
        var result = await generateSingleAccount(row);
        if (result.error) { gagal++; gagalNama.push(row.full_name); } else { berhasil++; }
      }

      btnGen.classList.remove('btn-processing');
      if (banner) { banner.style.display = 'none'; }

      var msg = 'Selesai: ' + berhasil + '/' + targets.length + ' berhasil.';
      if (gagalNama.length > 0) msg += ' Gagal (' + gagal + '): ' + gagalNama.join(', ') + '.';
      resultEl.textContent   = msg;
      resultEl.style.display = 'block';

      if (listEl) {
        listEl.querySelectorAll('.chk-row').forEach(function (c) { c.checked = false; });
        var chkAll = listEl.querySelector('#chk-all');
        if (chkAll) { chkAll.checked = false; chkAll.indeterminate = false; }
      }
      await loadRoster();
    } finally {
      isGenerating = false;
    }
  }

  // -------------------------------------------------------------------------
  // hapusTerpilih
  // -------------------------------------------------------------------------

  async function hapusRosterOnly(row) {
    const { data, error } = await client
      .from('classroom_roster')
      .delete()
      .eq('classroom_id', currentClassroomId)
      .eq('nis', row.nis)
      .select('id');
    if (error) return { error: error.message };
    if (!data || data.length === 0) return { error: 'Siswa tidak ditemukan di daftar classroom ini.' };
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

    btnHapus.textContent = 'Hapus Terpilih (0)';
    btnHapus.disabled    = true;

    await loadRoster();
  }

  // -------------------------------------------------------------------------
  // konfirmasiImportDuplikat — hentikan import saat ada NIS yang sudah ada
  // -------------------------------------------------------------------------

  function konfirmasiImportDuplikat(duplikat, totalBaris) {
    return new Promise(function (resolve) {
      var overlay = document.createElement('div');
      overlay.className = 'share-overlay';

      var box = document.createElement('div');
      box.className = 'share-box';

      var title = document.createElement('p');
      title.innerHTML = '<strong>' + duplikat.length + ' NIS sudah ada di roster</strong>';

      var pesan = document.createElement('p');
      pesan.style.margin = '4px 0 8px';
      pesan.textContent =
        'Dari ' + totalBaris + ' baris di file, ' + duplikat.length +
        ' NIS sudah terdaftar di kelas ini. Jika dilanjutkan, data lama siswa ' +
        'tersebut (nama dan nama ortu) akan ditimpa oleh isi file. Akun yang ' +
        'sudah dibuat tidak terhapus.';

      var daftar = document.createElement('textarea');
      daftar.readOnly = true;
      daftar.rows     = 4;
      daftar.value    = duplikat.map(function (r) {
        return r.nis + ' — ' + r.full_name;
      }).join('\n');

      var rowBtn = document.createElement('div');
      rowBtn.style.cssText = 'display:flex;gap:.5rem;justify-content:flex-end;margin-top:.25rem;';

      var btnBatal = document.createElement('button');
      btnBatal.type        = 'button';
      btnBatal.textContent = 'Batal';

      var btnOk = document.createElement('button');
      btnOk.type        = 'button';
      btnOk.textContent = 'Lanjutkan Import';

      var invoked = false;
      function done(val) {
        if (invoked) return;
        invoked = true;
        overlay.remove();
        document.removeEventListener('keydown', onEsc);
        resolve(val);
      }
      function onEsc(e) { if (e.key === 'Escape') { done(false); } }
      document.addEventListener('keydown', onEsc);

      btnOk.addEventListener('click',    function () { done(true); });
      btnBatal.addEventListener('click', function () { done(false); });
      overlay.addEventListener('click',  function (e) { if (e.target === overlay) { done(false); } });

      rowBtn.appendChild(btnBatal);
      rowBtn.appendChild(btnOk);
      box.appendChild(title);
      box.appendChild(pesan);
      box.appendChild(daftar);
      box.appendChild(rowBtn);
      overlay.appendChild(box);
      document.body.appendChild(overlay);

      btnBatal.focus();
    });
  }

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

      var invoked = false;
      function done(val) {
        if (invoked) return;
        invoked = true;
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
    const base = window.location.origin + '/kelasku';
    return {
      siswa: base + '/siswa/?kelas=' + encodeURIComponent(code) + '&nis=' + encodeURIComponent(siswa.nis),
      ortu:  base + '/ortu/?kelas='  + encodeURIComponent(code) + '&nis=' + encodeURIComponent(siswa.nis),
    };
  }

  // -------------------------------------------------------------------------
  // Trial gate
  // -------------------------------------------------------------------------

  async function loadTrialStatus() {
    try {
      trialStatus = await window.api.getTrialStatus();
    } catch (_) { trialStatus = null; }
  }

  function applyTrialGate() {
    if (!trialStatus || trialStatus.status !== 'EXPIRED') return;
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
  // shareLinks (Web Share API — dipakai di tempat lain jika perlu)
  // -------------------------------------------------------------------------

  async function shareLinks(row, links) {
    const msg = 'Link Siswa:\n' + links.siswa + '\n\nLink Ortu:\n' + links.ortu;

    if (navigator.share) {
      try {
        await navigator.share({ title: 'Login MiClass — ' + row.full_name, text: msg });
      } catch (err) {
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

    overlay.addEventListener('click', function (e) { if (e.target === overlay) { overlay.remove(); } });

    function onEsc(e) {
      if (e.key === 'Escape') { overlay.remove(); document.removeEventListener('keydown', onEsc); }
    }
    document.addEventListener('keydown', onEsc);

    box.appendChild(label);
    box.appendChild(ta);
    box.appendChild(closeBtn);
    overlay.appendChild(box);
    document.body.appendChild(overlay);

    ta.focus();
    ta.select();
  }

  // -------------------------------------------------------------------------
  // showCredentialsModal
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
  // Collapse sections
  // -------------------------------------------------------------------------

  function initCollapseSections(containerEl) {
    var panels = containerEl.querySelectorAll('.panel');
    panels.forEach(function (panel, idx) {
      var h2 = panel.querySelector('h2');
      if (!h2 || h2.dataset.collapseInit) return;
      h2.dataset.collapseInit = '1';
      h2.classList.add('panel-header');

      var titleSpan = document.createElement('span');
      titleSpan.className = 'panel-title';
      Array.from(h2.childNodes).forEach(function (node) { titleSpan.appendChild(node); });
      h2.appendChild(titleSpan);

      var arrow = document.createElement('span');
      arrow.className = 'panel-collapse-arrow';
      arrow.textContent = '▾';
      h2.appendChild(arrow);

      var body = document.createElement('div');
      body.className = 'panel-body-collapse';
      Array.from(panel.childNodes).forEach(function (child) {
        if (child !== h2) body.appendChild(child);
      });
      panel.appendChild(body);

      if (idx === 0) {
        h2.classList.add('open');
        body.style.display = '';
      } else {
        body.style.display = 'none';
      }

      h2.addEventListener('click', function () {
        var isOpen = h2.classList.contains('open');
        panels.forEach(function (p) {
          var ph = p.querySelector('h2.panel-header');
          var pb = p.querySelector('.panel-body-collapse');
          if (ph && pb) { ph.classList.remove('open'); pb.style.display = 'none'; }
        });
        if (!isOpen) { h2.classList.add('open'); body.style.display = ''; }
        var cId = new URLSearchParams(window.location.search).get('id');
        if (cId && containerEl.id) {
          try { localStorage.setItem('sip_collapse_' + cId + '_' + containerEl.id, isOpen ? '-1' : String(idx)); } catch (_) {}
        }
      });
    });

    // Restore collapse state dari localStorage
    var cIdRestore = new URLSearchParams(window.location.search).get('id');
    if (cIdRestore && containerEl.id) {
      var savedCollapse = localStorage.getItem('sip_collapse_' + cIdRestore + '_' + containerEl.id);
      if (savedCollapse !== null) {
        var savedIdx = parseInt(savedCollapse);
        panels.forEach(function (p, i) {
          var ph = p.querySelector('h2.panel-header');
          var pb = p.querySelector('.panel-body-collapse');
          if (ph && pb) {
            if (i === savedIdx) { ph.classList.add('open'); pb.style.display = ''; }
            else { ph.classList.remove('open'); pb.style.display = 'none'; }
          }
        });
      }
    }
  }

  // -------------------------------------------------------------------------
  // Init
  // -------------------------------------------------------------------------

  window.addEventListener('DOMContentLoaded', async function () {
    // Collapse sections — init per tab
    var panelSiswaEl = document.getElementById('panel-siswa');
    if (panelSiswaEl) initCollapseSections(panelSiswaEl);

    var panelJadwalEl = document.getElementById('panel-jadwal');
    var jadwalInitialized = false;
    var tabJadwalBtn = document.getElementById('tab-jadwal');
    if (tabJadwalBtn && panelJadwalEl) {
      tabJadwalBtn.addEventListener('click', function () {
        if (!jadwalInitialized) { initCollapseSections(panelJadwalEl); jadwalInitialized = true; }
      });
    }

    const { data: { session } } = await client.auth.getSession();
    if (!session) { window.location.href = 'index.html'; return; }

    const { data: profile, error: profileError } = await client
      .from('profiles')
      .select('id, full_name')
      .eq('user_id', session.user.id)
      .single();
    if (profileError || !profile) {
      // Sama seperti di dashboard: jangan lempar ke halaman login saat sesi
      // masih sah, karena halaman login akan melempar balik ke sini.
      console.error('[classroom] gagal memuat profil:', profileError);
      document.body.insertAdjacentHTML('afterbegin',
        '<div style="padding:1rem;margin:1rem;border:1px solid var(--border);' +
        'border-radius:.5rem;text-align:center">' +
        '<p>Gagal memuat data akun. Periksa koneksi internet Anda.</p>' +
        '<button id="btn-coba-lagi" style="margin-top:.75rem;padding:.5rem 1.25rem;' +
        'border:none;border-radius:.35rem;background:var(--gold);' +
        'color:var(--text-on-gold,#000);font-weight:600;cursor:pointer">Coba lagi</button>' +
        '</div>');
      document.getElementById('btn-coba-lagi')
        ?.addEventListener('click', function () { window.location.reload(); });
      return;
    }
    currentProfile = profile;
    document.getElementById('guru-name-cl').textContent = profile.full_name;

    const classroomId = new URLSearchParams(window.location.search).get('id');
    if (!classroomId) { window.location.href = 'dashboard.html'; return; }
    currentClassroomId = classroomId;

    const { data: classroom, error: clError } = await client
      .from('classrooms')
      .select('id, name, subject, classroom_code, description, jenjang, bidang_keahlian, program_keahlian, mapel_key, elemen_terpilih')
      .eq('id', classroomId)
      .eq('teacher_id', profile.id)
      .single();
    if (clError || !classroom) { window.location.href = 'dashboard.html'; return; }
    currentClassroom = classroom;
    window._classroomName     = classroom.name;
    window._classroomSubject  = classroom.subject || '';
    window._classroomMapelKey = classroom.mapel_key || '';
    window._classroomJenjang  = classroom.jenjang || '';
    window._classroomBidang   = classroom.bidang_keahlian || '';
    window._classroomProgram  = classroom.program_keahlian || '';

    document.getElementById('cl-name').textContent    = classroom.name;
    document.getElementById('cl-code').textContent    = classroom.classroom_code;
    document.getElementById('cl-subject').textContent = classroom.subject || '';
    document.title = 'MiClass — ' + classroom.name;

    await loadTrialStatus();
    applyTrialGate();

    await loadRoster();
  });

  // -------------------------------------------------------------------------
  // Help Overlay
  // -------------------------------------------------------------------------

  window.currentTab = 'siswa';

  var HELP_CONTENT = {
    siswa: {
      title: 'Kelola Siswa',
      intro: 'Tab ini adalah titik awal sebelum siswa bisa menggunakan MiClass. Daftarkan seluruh siswa terlebih dahulu, generate akun, lalu bagikan kredensial. Siswa yang belum punya akun tidak bisa login ke portal siswa maupun orang tuanya.',
      items: [
        { text: 'Tambah Siswa — isi <strong>Nama Lengkap</strong>, <strong>NIS</strong>, dan <strong>Nama Ortu</strong> (opsional), lalu klik Tambah. NIS harus unik per kelas.' },
        { text: 'Upload Daftar Siswa — klik <strong>Download Template Excel</strong> untuk unduh format yang benar. Kolom yang dikenali: <code>nama, nis, nama_ortu</code>. Upload file CSV, XLSX, atau XLS lalu klik Import. Header row di-skip otomatis jika NIS bukan angka. Jika NIS sudah ada, data diperbarui (upsert).' },
        { text: 'Generate Terpilih — centang siswa yang belum punya akun → klik <strong>Generate Terpilih</strong>. Sistem membuat akun siswa sekaligus akun orang tua. Jangan refresh selama proses berlangsung — lihat banner kuning sebagai tanda proses aktif.' },
        { text: 'Setelah generate, salin kredensial dari modal yang muncul — kredensial tidak bisa dilihat ulang setelah modal ditutup.' },
        { text: 'Bagikan ke siswa: klik <strong>Salin Link Siswa</strong> atau tampilkan QR Code. Bagikan ke orang tua: klik <strong>Salin Link Ortu</strong>.' },
        { text: 'Hapus Terpilih — centang siswa → klik <strong>Hapus Terpilih</strong>. Akun siswa dan orang tua dihapus permanen beserta seluruh datanya.' }
      ]
    },
    jadwal: {
      title: 'Jadwal & Absensi',
      intro: 'Tab ini menghubungkan waktu mengajar dengan pencatatan kehadiran. Jadwal yang diatur di sini menjadi dasar form absensi — tanpa jadwal, absensi tidak bisa dilakukan. Rekap kehadiran bisa diunduh kapan saja sebagai laporan.',
      items: [
        { text: 'Tambah Jadwal — klik <strong>+ Tambah Jadwal</strong> di section Jadwal Mengajar → pilih hari, jam mulai, jam selesai. Sistem otomatis menolak jika jadwal bentrok dengan kelas lain.' },
        { text: 'Untuk ubah jadwal: klik <strong>Edit</strong>. Untuk hentikan sementara: klik <strong>Nonaktifkan</strong> dan isi keterangan wajib. Hapus jadwal hanya jika tidak ada data absensi — sistem memberi peringatan sebelum hapus.' },
        { text: 'Absensi Hari Ini — form absensi hanya aktif saat jam mengajar sedang berlangsung. Status default semua siswa: <strong>H (Hadir)</strong>. Klik tombol <strong>S / I / A</strong> untuk ubah. Klik <strong>Simpan Absensi</strong> sebelum jam sesi berakhir — setelah berakhir form terkunci otomatis.' },
        { text: 'Rekap Absensi — atur rentang tanggal dari/sampai → lihat ringkasan H/S/I/A per siswa beserta persentase kehadiran. Klik <strong>Export Excel</strong> untuk unduh file <code>rekap-absensi-{dari}-sd-{sampai}.xlsx</code>.' }
      ]
    },
    catatan: {
      title: 'Catatan',
      intro: 'Tab ini menggantikan fungsi buku catatan guru. Gunakan untuk mendokumentasikan perkembangan, perilaku, atau prestasi siswa secara individual — atau untuk menyampaikan pengumuman ke seluruh kelas. Catatan bisa dikontrol visibilitasnya: hanya untuk arsip guru, atau dibagikan ke siswa dan orang tua.',
      items: [
        { text: 'Buka section <strong>Tulis Catatan</strong> → pilih siswa dari dropdown. Jika tidak pilih siswa, catatan berlaku sebagai pengumuman seluruh kelas.' },
        { text: 'Tulis catatan di kolom teks (maks. 1000 karakter). Centang <strong>Tampilkan ke Siswa</strong> dan/atau <strong>Tampilkan ke Ortu</strong> untuk atur siapa yang bisa melihat. Klik <strong>Simpan Catatan</strong>.' },
        { text: 'Catatan yang dicentang langsung muncul di dashboard siswa atau orang tua yang bersangkutan.' },
        { text: 'Buka section <strong>Riwayat Catatan</strong> untuk lihat semua catatan. Gunakan dropdown filter untuk tampilkan catatan satu siswa saja. Klik <strong>Edit</strong> untuk ubah isi atau visibilitas, klik <strong>Hapus</strong> untuk hapus permanen.' }
      ]
    },
    penilaian: {
      title: 'Penilaian',
      intro: 'Tab ini mencakup seluruh siklus penilaian Kurikulum Merdeka — dari perencanaan (CP, TP, KKTP) hingga pelaksanaan dan publikasi hasil. Mulai dari Perencanaan sebelum mengisi nilai. Nilai yang belum dipublikasikan tidak terlihat oleh siswa maupun orang tua.',
      items: [
        { text: 'Perencanaan — isi <strong>Tahun Ajaran</strong> (contoh: <code>2025/2026</code>) dan pilih <strong>Semester</strong> → klik <strong>Tampilkan</strong>. Tambah CP (Capaian Pembelajaran) — hanya satu per semester. Tambah TP (Tujuan Pembelajaran) sebanyak yang dibutuhkan. Tambah KKTP di bawah setiap TP sebagai kriteria ketercapaian — isi nama, batas bawah, dan batas atas nilai.' },
        {
          text: 'Pelaksanaan — klik <strong>+ Tambah Item</strong> → isi judul, pilih jenis, pilih teknik, isi tanggal, dan kaitkan dengan TP jika ada.',
          sub: [
            { name: 'D-NK (Diagnostik Non-Kognitif)', desc: 'Gunakan di awal semester atau sebelum unit baru untuk mengetahui kondisi emosional, minat, dan latar belakang siswa. Hasilnya membantu guru menyesuaikan pendekatan pembelajaran.' },
            { name: 'D-K (Diagnostik Kognitif)', desc: 'Gunakan sebelum memulai materi baru untuk mengukur pengetahuan awal siswa. Hasilnya menentukan apakah perlu remediasi atau bisa langsung lanjut.' },
            { name: 'Formatif', desc: 'Gunakan selama proses pembelajaran berlangsung untuk memantau perkembangan siswa secara berkelanjutan. Tidak harus berupa angka — bisa catatan observasi, unjuk kerja, atau kuis singkat.' },
            { name: 'Sumatif', desc: 'Gunakan di akhir unit atau semester untuk mengukur ketercapaian TP secara keseluruhan. Bisa berupa Skor (angka 0–100) atau Rubrik (penilaian per kriteria dengan bobot).' }
          ]
        },
        { text: 'Untuk Sumatif tipe Rubrik: tambah kriteria dengan nama, bobot (%), dan deskripsi per level — total bobot harus tepat 100%.' },
        { text: 'Klik <strong>Isi Nilai</strong> pada setiap entri → isi nilai per siswa: D-NK (deskripsi teks), D-K (Paham Utuh/Sebagian/Tidak Paham), Formatif (teks, gunakan <strong>Salin ke semua yang kosong</strong>), Sumatif Skor (angka 0–100, label muncul otomatis), Sumatif Rubrik (pilih level per kriteria, skor dihitung otomatis).' },
        { text: 'Setelah isi nilai, tentukan <strong>Tindak Lanjut</strong> per siswa: Pengayaan / Penguatan / Pendampingan.' },
        { text: 'Klik <strong>Publikasikan</strong> agar nilai muncul di portal siswa dan orang tua. Status berubah menjadi <strong>Dipublikasi</strong>. Klik <strong>Batalkan Publikasi</strong> untuk tarik kembali kapan saja.' }
      ]
    }
  };

  function renderHelpItem(item) {
    var subHtml = '';
    if (item.sub && item.sub.length) {
      subHtml = item.sub.map(function (s) {
        return '<div class="help-subitem"><strong>' + s.name + '</strong> — <span class="help-subitem-desc">' + s.desc + '</span></div>';
      }).join('');
    }
    return '<div class="help-item"><div class="help-item-row"><span class="help-item-arrow">→</span><span class="help-item-text">' + item.text + '</span></div>' + subHtml + '</div>';
  }

  function openHelp(tabKey) {
    var content = HELP_CONTENT[tabKey];
    if (!content) return;
    document.getElementById('help-title').textContent = content.title;
    document.getElementById('help-intro').textContent = content.intro;
    document.getElementById('help-body').innerHTML = content.items.map(renderHelpItem).join('');
    var overlay = document.getElementById('help-overlay');
    overlay.style.display = 'flex';
    requestAnimationFrame(function () { overlay.classList.add('help-overlay-visible'); });
  }

  function closeHelp() {
    var overlay = document.getElementById('help-overlay');
    overlay.classList.remove('help-overlay-visible');
    setTimeout(function () { overlay.style.display = 'none'; }, 200);
  }

  document.addEventListener('DOMContentLoaded', function () {
    var strip = document.getElementById('help-strip');
    if (strip) strip.addEventListener('click', function () { openHelp(window.currentTab); });
    var closeBtn = document.getElementById('help-close');
    if (closeBtn) closeBtn.addEventListener('click', closeHelp);
    var overlay = document.getElementById('help-overlay');
    if (overlay) {
      overlay.addEventListener('click', function (e) {
        if (!e.target.closest('.help-modal')) closeHelp();
      });
    }
  });

}());
