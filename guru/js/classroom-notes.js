(function () {
  'use strict';
  const client = window.supabaseClient;

  let teacherId   = null;
  let classroomId = null;
  let _roster     = [];   // { id, full_name, nis }
  let _notes      = [];
  let _filterStudentId   = '';
  let _filterVisibilitas = '';
  let _filterFrom        = '';
  let _filterTo          = '';
  let _notesLoaded = false;
  let _notesPage   = 0;
  const NOTES_PER_HAL = 20;
  let _notesSelInst    = null;
  let _notesFilterInst = null;

  function esc(s) {
    return String(s ?? '')
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function fmtDate(s) {
    if (!s) return '';
    const d = new Date(s);
    return d.toLocaleDateString('id-ID', { day:'2-digit', month:'short', year:'numeric' });
  }

  // ---------------------------------------------------------------------------
  // API
  // ---------------------------------------------------------------------------

  async function loadRoster() {
    const { data, error } = await client
      .from('classroom_roster')
      .select('profile_id, full_name, nis')
      .eq('classroom_id', classroomId)
      .not('profile_id', 'is', null)
      .order('full_name');
    if (error) return;
    _roster = (data || []).map(r => ({ id: r.profile_id, full_name: r.full_name, nis: r.nis }));
    renderRosterSelect();
  }

  async function loadNotes() {
    const el = document.getElementById('notes-list');
    if (el) el.innerHTML = '<p class="empty-state">Memuat catatan…</p>';
    const { data, error } = await client
      .from('student_notes')
      .select('id, student_id, content, is_visible_to_student, is_visible_to_parent, created_at, updated_at')
      .eq('classroom_id', classroomId)
      .order('created_at', { ascending: false });
    if (error) {
      if (el) el.innerHTML = '<p class="empty-state">Gagal memuat: ' + esc(error.message) + '</p>';
      return;
    }
    _notes = data || [];
    _notesLoaded = true;
    renderNotesList();
  }

  async function saveNote(studentId, content, visStudent, visParent) {
    const { data, error } = await client
      .from('student_notes')
      .insert({
        classroom_id:          classroomId,
        teacher_id:            teacherId,
        student_id:            studentId,
        content,
        is_visible_to_student: visStudent,
        is_visible_to_parent:  visParent,
      })
      .select('id, student_id, content, is_visible_to_student, is_visible_to_parent, created_at, updated_at')
      .single();
    if (error) throw error;
    return data;
  }

  // Pengumuman kelas — student_notes.student_id NOT NULL, jadi satu pengumuman
  // menjadi satu baris per siswa (fan-out). Tidak ada perubahan skema maupun
  // RLS: portal siswa dan ortu langsung menampilkannya seperti catatan biasa.
  // Agar Riwayat tidak dibanjiri kartu identik, baris-baris ini dikelompokkan
  // kembali saat dirender — lihat kelompokkanNotes().
  async function savePengumuman(content, visStudent, visParent) {
    if (!_roster.length) throw new Error('Belum ada siswa berakun di kelas ini.');
    const rows = _roster.map(s => ({
      classroom_id:          classroomId,
      teacher_id:            teacherId,
      student_id:            s.id,
      content,
      is_visible_to_student: visStudent,
      is_visible_to_parent:  visParent,
    }));
    const { data, error } = await client
      .from('student_notes')
      .insert(rows)
      .select('id, student_id, content, is_visible_to_student, is_visible_to_parent, created_at, updated_at');
    if (error) throw error;
    return data || [];
  }

  async function updateNote(ids, content, visStudent, visParent) {
    const daftar = Array.isArray(ids) ? ids : [ids];
    const { error } = await client
      .from('student_notes')
      .update({ content, is_visible_to_student: visStudent, is_visible_to_parent: visParent })
      .in('id', daftar);
    if (error) throw error;
  }

  async function deleteNote(ids) {
    const daftar = Array.isArray(ids) ? ids : [ids];
    const { error } = await client
      .from('student_notes')
      .delete()
      .in('id', daftar);
    if (error) throw error;
  }

  // ---------------------------------------------------------------------------
  // Render roster select
  // ---------------------------------------------------------------------------

  function renderRosterSelect() {
    const sel = document.getElementById('notes-student-select');
    const filterSel = document.getElementById('notes-filter-student');
    if (!sel) return;

    const opts = _roster.map(s =>
      `<option value="${esc(s.id)}">${esc(s.full_name)}${s.nis ? ' · ' + esc(s.nis) : ''}</option>`
    ).join('');

    // Dropdown hanya berisi siswa yang akunnya sudah di-generate. Tanpa
    // penjelasan, guru yang rosternya penuh melihat daftar kosong dan mengira
    // ada yang rusak.
    const statusEl = document.getElementById('notes-roster-hint');
    if (statusEl) {
      statusEl.style.display = _roster.length ? 'none' : 'block';
    }

    sel.innerHTML = (_roster.length
      ? '<option value="">— Pilih siswa —</option>'
      : '<option value="">— Belum ada siswa berakun —</option>') + opts;
    if (filterSel) {
      filterSel.innerHTML = '<option value="">Semua siswa</option>' + opts;
    }

    if (window.initCustomSelect) {
      if (_notesSelInst) {
        _notesSelInst.refresh();
      } else {
        _notesSelInst = window.initCustomSelect(sel);
        _notesSelInst.el.style.width = '100%';
      }
      if (filterSel) {
        if (_notesFilterInst) {
          _notesFilterInst.refresh();
        } else {
          _notesFilterInst = window.initCustomSelect(filterSel, function (val) {
            _filterStudentId = val;
            _notesPage = 0;
            renderNotesList();
          });
          _notesFilterInst.el.style.width = '100%';
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Render notes list
  // ---------------------------------------------------------------------------

  function rosterName(studentId) {
    const s = _roster.find(r => r.id === studentId);
    return s ? s.full_name + (s.nis ? ' · ' + s.nis : '') : '—';
  }

  // Satu sumber kebenaran untuk "catatan mana yang sedang ditampilkan".
  // Dipakai renderNotesList DAN exportCatatan, supaya export selalu berisi apa
  // yang guru lihat di layar — sebelumnya export mengabaikan filter dan selalu
  // mengunduh seluruh catatan sekelas.
  function notesTersaring() {
    let rows = _filterStudentId
      ? _notes.filter(n => n.student_id === _filterStudentId)
      : [..._notes];

    if (_filterVisibilitas === 'siswa')      rows = rows.filter(n => n.is_visible_to_student);
    else if (_filterVisibilitas === 'ortu')  rows = rows.filter(n => n.is_visible_to_parent);
    else if (_filterVisibilitas === 'keduanya') rows = rows.filter(n => n.is_visible_to_student && n.is_visible_to_parent);

    if (_filterFrom) rows = rows.filter(n => n.created_at.slice(0, 10) >= _filterFrom);
    if (_filterTo)   rows = rows.filter(n => n.created_at.slice(0, 10) <= _filterTo);

    return rows;
  }

  // Pengumuman kelas tersimpan sebagai satu baris per siswa. Baris yang isinya
  // sama, visibilitasnya sama, dan dibuat pada detik yang sama berasal dari
  // satu tindakan guru — dikembalikan menjadi satu kartu di layar.
  function kelompokkanNotes(rows) {
    const peta = new Map();
    rows.forEach(n => {
      // JSON.stringify, bukan join dengan pemisah: isi catatan adalah teks bebas
      // dari guru, dan pemisah apa pun yang dipilih bisa muncul di dalamnya —
      // dua catatan berbeda akan tergabung keliru.
      const kunci = JSON.stringify([
        n.content,
        n.is_visible_to_student ? 1 : 0,
        n.is_visible_to_parent  ? 1 : 0,
        String(n.created_at).slice(0, 19),
      ]);
      if (!peta.has(kunci)) peta.set(kunci, { contoh: n, ids: [], studentIds: [] });
      const g = peta.get(kunci);
      g.ids.push(n.id);
      g.studentIds.push(n.student_id);
    });
    return [...peta.values()];
  }

  function renderNotesList() {
    const el = document.getElementById('notes-list');
    if (!el) return;

    const grup = kelompokkanNotes(notesTersaring());

    if (grup.length === 0) {
      el.innerHTML = '<p class="empty-state">Belum ada catatan.</p>';
      return;
    }

    const totalHal = Math.max(1, Math.ceil(grup.length / NOTES_PER_HAL));
    if (_notesPage >= totalHal) _notesPage = totalHal - 1;
    if (_notesPage < 0) _notesPage = 0;
    const irisan = grup.slice(_notesPage * NOTES_PER_HAL, (_notesPage + 1) * NOTES_PER_HAL);

    const kartu = irisan.map(g => {
      const n    = g.contoh;
      const isPengumuman = g.ids.length > 1;
      const nama = isPengumuman
        ? `Pengumuman kelas · ${g.ids.length} siswa`
        : esc(rosterName(n.student_id));
      const vs   = n.is_visible_to_student;
      const vp   = n.is_visible_to_parent;
      const vis  = vs && vp ? 'Siswa &amp; Ortu'
                 : vs       ? 'Siswa saja'
                 : vp       ? 'Ortu saja'
                 :            'Hanya guru';
      const idsAttr = esc(g.ids.join(','));
      return `
      <div class="note-card" data-ids="${idsAttr}">
        <div class="note-card-header">
          <span class="note-student-name">${nama}</span>
          <span class="note-date">${fmtDate(n.created_at)}</span>
        </div>
        <p class="note-content">${esc(n.content)}</p>
        <div class="note-footer">
          <span class="note-vis">👁 ${vis}</span>
          <div class="note-actions">
            <button class="btn-note-edit" data-ids="${idsAttr}">Edit</button>
            <button class="btn-note-delete" data-ids="${idsAttr}">Hapus</button>
          </div>
        </div>
      </div>`;
    }).join('');

    const pagHtml = totalHal > 1
      ? `<div class="pagination-bar">` +
          `<button class="btn-notes-prev"${_notesPage === 0 ? ' disabled' : ''}>←</button>` +
          `<span class="page-label">Halaman ${_notesPage + 1} dari ${totalHal} ` +
          `(${grup.length} catatan)</span>` +
          `<button class="btn-notes-next"${_notesPage >= totalHal - 1 ? ' disabled' : ''}>→</button>` +
        `</div>`
      : '';

    el.innerHTML = pagHtml + kartu + pagHtml;

    el.querySelectorAll('.btn-note-edit').forEach(btn => {
      btn.addEventListener('click', () => openEditModal(btn.dataset.ids.split(',')));
    });
    el.querySelectorAll('.btn-note-delete').forEach(btn => {
      btn.addEventListener('click', () => confirmDelete(btn.dataset.ids.split(',')));
    });
    el.querySelectorAll('.btn-notes-prev').forEach(b => {
      b.addEventListener('click', () => { _notesPage--; renderNotesList(); });
    });
    el.querySelectorAll('.btn-notes-next').forEach(b => {
      b.addEventListener('click', () => { _notesPage++; renderNotesList(); });
    });
  }

  // ---------------------------------------------------------------------------
  // Form tambah catatan
  // ---------------------------------------------------------------------------

  // Saat mode pengumuman aktif, dropdown siswa dimatikan — pilihan siswa
  // menjadi tidak bermakna, dan atribut required-nya harus dilepas agar
  // formnya tetap bisa dikirim.
  function terapkanModePengumuman() {
    const chk = document.getElementById('notes-pengumuman');
    const sel = document.getElementById('notes-student-select');
    if (!chk || !sel) return;
    const aktif = chk.checked;
    sel.disabled = aktif;
    if (aktif) sel.removeAttribute('required');
    else       sel.setAttribute('required', '');
    if (_notesSelInst && _notesSelInst.el) {
      _notesSelInst.el.style.opacity       = aktif ? '.45' : '';
      _notesSelInst.el.style.pointerEvents = aktif ? 'none' : '';
    }
  }

  function initForm() {
    const form    = document.getElementById('notes-form');
    const statusEl = document.getElementById('notes-status');
    if (!form) return;

    const chkPengumuman = document.getElementById('notes-pengumuman');
    if (chkPengumuman) {
      chkPengumuman.addEventListener('change', terapkanModePengumuman);
      terapkanModePengumuman();
    }

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const studentId = _notesSelInst ? _notesSelInst.getValue() : document.getElementById('notes-student-select').value;
      const content   = document.getElementById('notes-content').value.trim();
      const visS      = document.getElementById('notes-vis-student').checked;
      const visP      = document.getElementById('notes-vis-parent').checked;
      const pengumuman = !!document.getElementById('notes-pengumuman')?.checked;

      if (!pengumuman && !studentId) {
        statusEl.textContent = 'Pilih siswa terlebih dahulu, atau centang "Kirim sebagai pengumuman kelas".';
        statusEl.className   = 'status-err';
        statusEl.style.display = 'block';
        return;
      }
      if (pengumuman && !_roster.length) {
        statusEl.textContent = 'Belum ada siswa berakun di kelas ini.';
        statusEl.className   = 'status-err';
        statusEl.style.display = 'block';
        return;
      }
      if (!content) {
        statusEl.textContent = 'Catatan tidak boleh kosong.';
        statusEl.className   = 'status-err';
        statusEl.style.display = 'block';
        return;
      }

      const btn = form.querySelector('button[type=submit]');
      btn.disabled    = true;
      btn.textContent = 'Menyimpan…';
      statusEl.style.display = 'none';

      try {
        if (pengumuman) {
          const baris = await savePengumuman(content, visS, visP);
          baris.forEach(b => _notes.unshift(b));
        } else {
          const note = await saveNote(studentId, content, visS, visP);
          _notes.unshift(note);
        }
        _notesPage = 0;
        renderNotesList();
        form.reset();
        terapkanModePengumuman();
        if (_notesSelInst) _notesSelInst.setValue('');
        statusEl.textContent   = pengumuman
          ? '✓ Pengumuman terkirim ke ' + _roster.length + ' siswa.'
          : '✓ Catatan berhasil disimpan.';
        statusEl.className     = 'status-ok';
        statusEl.style.display = 'block';
        setTimeout(() => { statusEl.style.display = 'none'; }, 3000);
      } catch (err) {
        statusEl.textContent   = '✗ ' + (err.message || 'Gagal menyimpan.');
        statusEl.className     = 'status-err';
        statusEl.style.display = 'block';
      } finally {
        btn.disabled    = false;
        btn.textContent = 'Simpan Catatan';
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Filter per siswa
  // ---------------------------------------------------------------------------

  function initFilter() {
    if (_notesFilterInst) return;
    const filterSel = document.getElementById('notes-filter-student');
    if (!filterSel) return;
    filterSel.addEventListener('change', () => {
      _filterStudentId = filterSel.value;
      _notesPage = 0;
      renderNotesList();
    });
  }

  // ---------------------------------------------------------------------------
  // Edit modal
  // ---------------------------------------------------------------------------

  function openEditModal(ids) {
    const daftar = Array.isArray(ids) ? ids : [ids];
    const note = _notes.find(n => n.id === daftar[0]);
    if (!note) return;
    const isPengumuman = daftar.length > 1;

    document.getElementById('notes-edit-overlay')?.remove();

    const overlay = document.createElement('div');
    overlay.id        = 'notes-edit-overlay';
    overlay.className = 'share-overlay';

    const box = document.createElement('div');
    box.className = 'share-box';

    const title = document.createElement('p');
    title.innerHTML = isPengumuman
      ? '<strong>Edit Pengumuman Kelas</strong><br>' +
        '<span style="font-size:.8rem">Perubahan berlaku untuk ' + daftar.length + ' siswa</span>'
      : '<strong>Edit Catatan — ' + esc(rosterName(note.student_id)) + '</strong>';

    const ta = document.createElement('textarea');
    ta.rows  = 5;
    ta.style.cssText = 'width:100%;box-sizing:border-box;padding:.5rem;font-size:.9rem;border:1px solid var(--color-border);border-radius:.4rem;resize:vertical;';
    ta.value = note.content;
    ta.maxLength = 1000;

    const visRow = document.createElement('div');
    visRow.style.cssText = 'display:flex;gap:1rem;margin:.5rem 0;font-size:.875rem;';

    const lblS = document.createElement('label');
    const chkS = document.createElement('input');
    chkS.type    = 'checkbox';
    chkS.checked = note.is_visible_to_student;
    lblS.appendChild(chkS);
    lblS.append(' Tampilkan ke siswa');

    const lblP = document.createElement('label');
    const chkP = document.createElement('input');
    chkP.type    = 'checkbox';
    chkP.checked = note.is_visible_to_parent;
    lblP.appendChild(chkP);
    lblP.append(' Tampilkan ke ortu');

    visRow.appendChild(lblS);
    visRow.appendChild(lblP);

    const errEl = document.createElement('div');
    errEl.style.cssText = 'color:var(--color-danger);font-size:.875rem;min-height:1.2rem;';

    const rowBtn = document.createElement('div');
    rowBtn.style.cssText = 'display:flex;gap:.5rem;justify-content:flex-end;margin-top:.25rem;';

    const btnBatal = document.createElement('button');
    btnBatal.type        = 'button';
    btnBatal.textContent = 'Batal';

    const btnSave = document.createElement('button');
    btnSave.type        = 'button';
    btnSave.textContent = 'Simpan';

    function close() { overlay.remove(); document.removeEventListener('keydown', onEsc); }
    function onEsc(e) { if (e.key === 'Escape') close(); }
    document.addEventListener('keydown', onEsc);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    btnBatal.addEventListener('click', close);

    btnSave.addEventListener('click', async () => {
      const newContent = ta.value.trim();
      if (!newContent) { errEl.textContent = 'Catatan tidak boleh kosong.'; return; }
      btnSave.disabled    = true;
      btnSave.textContent = 'Menyimpan…';
      errEl.textContent   = '';
      try {
        await updateNote(daftar, newContent, chkS.checked, chkP.checked);
        daftar.forEach(satuId => {
          const idx = _notes.findIndex(n => n.id === satuId);
          if (idx !== -1) {
            _notes[idx] = { ..._notes[idx], content: newContent, is_visible_to_student: chkS.checked, is_visible_to_parent: chkP.checked };
          }
        });
        renderNotesList();
        close();
      } catch (err) {
        errEl.textContent   = 'Gagal: ' + (err.message || 'Error tidak diketahui.');
        btnSave.disabled    = false;
        btnSave.textContent = 'Simpan';
      }
    });

    rowBtn.appendChild(btnBatal);
    rowBtn.appendChild(btnSave);
    box.appendChild(title);
    box.appendChild(ta);
    box.appendChild(visRow);
    box.appendChild(errEl);
    box.appendChild(rowBtn);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    ta.focus();
  }

  // ---------------------------------------------------------------------------
  // Hapus
  // ---------------------------------------------------------------------------

  async function confirmDelete(ids) {
    const daftar = Array.isArray(ids) ? ids : [ids];
    const pesan = daftar.length > 1
      ? 'Hapus pengumuman ini untuk seluruh ' + daftar.length +
        ' siswa? Tindakan ini tidak bisa dibatalkan.'
      : 'Hapus catatan ini? Tindakan ini tidak bisa dibatalkan.';
    if (!window.confirm(pesan)) return;
    try {
      await deleteNote(daftar);
      const buang = new Set(daftar);
      _notes = _notes.filter(n => !buang.has(n.id));
      renderNotesList();
    } catch (err) {
      alert('Gagal hapus: ' + (err.message || 'Error tidak diketahui.'));
    }
  }

  // ---------------------------------------------------------------------------
  // Filter tambahan: visibilitas + rentang waktu
  // ---------------------------------------------------------------------------

  function initExtraFilters() {
    const listEl = document.getElementById('notes-list');
    if (!listEl) return;

    const wrap = document.createElement('div');
    wrap.id = 'notes-extra-filters';
    wrap.style.cssText = 'display:flex;flex-wrap:wrap;gap:var(--space-xs);align-items:center;margin-bottom:var(--space-sm);';

    const visLabel = document.createElement('label');
    visLabel.textContent = 'Visibilitas';
    visLabel.style.cssText = 'font-size:var(--fs-caption);color:var(--text-secondary);margin-bottom:0;flex-shrink:0;text-transform:none;letter-spacing:normal;font-weight:var(--fw-medium);';

    const visSel = document.createElement('select');
    visSel.id = 'notes-filter-vis';
    visSel.style.cssText = 'flex:1;min-width:9rem;max-width:12rem;';
    visSel.innerHTML =
      '<option value="">Semua</option>' +
      '<option value="siswa">Ke Siswa saja</option>' +
      '<option value="ortu">Ke Ortu saja</option>' +
      '<option value="keduanya">Siswa &amp; Ortu</option>';

    const fromLabel = document.createElement('label');
    fromLabel.textContent = 'Dari';
    fromLabel.style.cssText = 'font-size:var(--fs-caption);color:var(--text-secondary);margin-bottom:0;flex-shrink:0;text-transform:none;letter-spacing:normal;font-weight:var(--fw-medium);';

    const fromInput = document.createElement('input');
    fromInput.type = 'date';
    fromInput.id   = 'notes-filter-from';
    fromInput.className = 'notes-date-input';
    fromInput.style.cssText = 'flex:1;min-width:8rem;max-width:10rem;';

    const toLabel = document.createElement('label');
    toLabel.textContent = 'Sampai';
    toLabel.style.cssText = 'font-size:var(--fs-caption);color:var(--text-secondary);margin-bottom:0;flex-shrink:0;text-transform:none;letter-spacing:normal;font-weight:var(--fw-medium);';

    const toInput = document.createElement('input');
    toInput.type = 'date';
    toInput.id   = 'notes-filter-to';
    toInput.className = 'notes-date-input';
    toInput.style.cssText = 'flex:1;min-width:8rem;max-width:10rem;';

    wrap.appendChild(visLabel);
    wrap.appendChild(visSel);
    wrap.appendChild(fromLabel);
    wrap.appendChild(fromInput);
    wrap.appendChild(toLabel);
    wrap.appendChild(toInput);

    listEl.insertAdjacentElement('beforebegin', wrap);

    visSel.addEventListener('change', () => { _filterVisibilitas = visSel.value; _notesPage = 0; renderNotesList(); });
    fromInput.addEventListener('change', () => { _filterFrom = fromInput.value; _notesPage = 0; renderNotesList(); });
    toInput.addEventListener('change',   () => { _filterTo   = toInput.value;   _notesPage = 0; renderNotesList(); });
  }

  // ---------------------------------------------------------------------------
  // Export Catatan (4 sheet)
  // ---------------------------------------------------------------------------

  function exportCatatan() {
    function slugify(s) {
      return String(s || '').toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, '')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
    }
    function fmtExportDate(s) {
      if (!s) return '';
      const part = s.slice(0, 10); // 'YYYY-MM-DD' — tidak terpengaruh timezone browser
      const [y, m, d] = part.split('-');
      return `${d}/${m}/${y}`;
    }

    const slug     = slugify(window._classroomName || '');
    const today    = new Date().toISOString().slice(0, 10);
    const parts    = ['catatan'];
    if (slug) parts.push(slug);
    parts.push(today);
    const filename = parts.join('-') + '.xlsx';

    const HEADER = ['Nama Siswa', 'NIS', 'Tanggal', 'Isi Catatan', 'Ke Siswa', 'Ke Ortu'];

    function noteToRow(n) {
      const s = _roster.find(r => r.id === n.student_id);
      return [
        s ? (s.full_name || '—') : '—',
        s ? (s.nis || '') : '',
        fmtExportDate(n.created_at),
        n.content || '',
        n.is_visible_to_student ? 'Ya' : 'Tidak',
        n.is_visible_to_parent  ? 'Ya' : 'Tidak',
      ];
    }

    // Export mengikuti filter yang sedang aktif di layar. Sebelumnya selalu
    // mengekspor _notes penuh, sehingga guru yang menyaring satu siswa tetap
    // mengunduh seluruh catatan sekelas.
    const all      = notesTersaring();
    const keSiswa  = all.filter(n => n.is_visible_to_student);
    const keOrtu   = all.filter(n => n.is_visible_to_parent);
    const keduanya = all.filter(n => n.is_visible_to_student && n.is_visible_to_parent);

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([HEADER, ...all.map(noteToRow)]),      'Semua Catatan');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([HEADER, ...keSiswa.map(noteToRow)]),  'Ke Siswa');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([HEADER, ...keOrtu.map(noteToRow)]),   'Ke Ortu');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([HEADER, ...keduanya.map(noteToRow)]), 'Siswa & Ortu');
    XLSX.writeFile(wb, filename);
  }

  // ---------------------------------------------------------------------------
  // Collapse sections (single-expand, "Tulis Catatan" default open)
  // ---------------------------------------------------------------------------

  function initCollapseSections() {
    const headers = document.querySelectorAll('#panel-catatan h2.panel-header');
    headers.forEach((h2, idx) => {
      const body = document.getElementById(h2.dataset.panel);
      if (!body) return;
      if (idx === 0) {
        h2.classList.add('open');
        body.style.display = '';
      } else {
        h2.classList.remove('open');
        body.style.display = 'none';
      }

      // Tombol Export Excel di header Riwayat Catatan (idx 1)
      if (idx === 1) {
        const exportBtn       = document.createElement('button');
        exportBtn.id          = 'btn-export-catatan';
        exportBtn.className   = 'btn-export-header';
        exportBtn.textContent = 'Export Excel';
        exportBtn.addEventListener('click', e => {
          e.stopPropagation();
          if (!_notes || _notes.length === 0) {
            alert('Belum ada catatan untuk di-export.');
            return;
          }
          exportCatatan();
        });
        const arrow = h2.querySelector('.panel-collapse-arrow');
        if (arrow) h2.insertBefore(exportBtn, arrow);
        else h2.appendChild(exportBtn);

        const hint = document.createElement('small');
        hint.style.cssText = 'font-size:var(--fs-caption);color:var(--text-muted);font-style:italic;margin-top:0.35rem;display:block;';
        hint.textContent   = 'Lakukan export sebelum semester berakhir untuk menyimpan data secara lokal.';
        body.insertAdjacentElement('afterbegin', hint);
      }

      h2.addEventListener('click', () => {
        const isOpen = h2.classList.contains('open');
        headers.forEach(hh => {
          hh.classList.remove('open');
          const b = document.getElementById(hh.dataset.panel);
          if (b) b.style.display = 'none';
        });
        if (!isOpen) {
          h2.classList.add('open');
          body.style.display = '';
          // Membuka section Pesan berarti guru membacanya.
          if (h2.dataset.panel === 'pesan-ortu-body') tandaiSemuaDibaca();
        }
      });
    });
  }

  // ---------------------------------------------------------------------------
  // Pesan dari Ortu — kanal dua arah ortu <-> guru
  // ---------------------------------------------------------------------------

  let _pesan = [];

  async function loadPesanOrtu() {
    const { data, error } = await client
      .from('parent_messages')
      .select('id, student_id, author_role, content, created_at, read_at')
      .eq('classroom_id', classroomId)
      .order('created_at', { ascending: true });
    if (error) { console.error('[pesan-ortu] gagal memuat:', error); _pesan = []; return; }
    _pesan = data || [];
  }

  // Tandai SEMUA pesan ortu yang belum dibaca. Dipanggil saat guru membuka
  // section Pesan — sebelumnya read_at hanya terisi kalau guru membalas,
  // sehingga badge "N baru" terus menyala meski pesannya sudah dibaca.
  async function tandaiSemuaDibaca() {
    const belum = _pesan.filter(m => m.author_role === 'ORTU' && !m.read_at);
    if (!belum.length) return;
    const { error } = await client.from('parent_messages')
      .update({ read_at: new Date().toISOString() })
      .in('id', belum.map(m => m.id));
    if (error) { console.error('[pesan-ortu] gagal menandai dibaca:', error); return; }
    const kini = new Date().toISOString();
    belum.forEach(m => { m.read_at = kini; });
    renderPesanOrtu();
  }

  // Tandai seluruh pesan ortu di satu percakapan sebagai sudah dibaca.
  async function tandaiDibaca(studentId) {
    const belum = _pesan.filter(m =>
      m.student_id === studentId && m.author_role === 'ORTU' && !m.read_at);
    if (!belum.length) return;
    const { error } = await client.from('parent_messages')
      .update({ read_at: new Date().toISOString() })
      .in('id', belum.map(m => m.id));
    if (error) { console.error('[pesan-ortu] gagal menandai dibaca:', error); return; }
    const kini = new Date().toISOString();
    belum.forEach(m => { m.read_at = kini; });
  }

  async function balasPesan(studentId, content) {
    const { data, error } = await client.from('parent_messages')
      .insert({
        classroom_id:      classroomId,
        teacher_id:        teacherId,
        student_id:        studentId,
        author_profile_id: teacherId,
        author_role:       'GURU',
        content,
      })
      .select('id, student_id, author_role, content, created_at, read_at')
      .single();
    if (error) throw error;
    return data;
  }

  function wireKomposerBaru(listEl) {
    const btn = listEl.querySelector('#btn-pesan-baru');
    const sel = listEl.querySelector('#pesan-baru-sid');
    const ta  = listEl.querySelector('#pesan-baru-teks');
    const msg = listEl.querySelector('#pesan-baru-msg');
    if (!btn) return;
    btn.addEventListener('click', async () => {
      const sid  = sel?.value ?? '';
      const teks = (ta?.value ?? '').trim();
      if (!sid)  { if (msg) msg.textContent = 'Pilih siswa terlebih dahulu.'; return; }
      if (!teks) { if (msg) msg.textContent = 'Pesan tidak boleh kosong.'; return; }
      btn.disabled = true;
      if (msg) msg.textContent = 'Mengirim…';
      try {
        const baru = await balasPesan(sid, teks);
        _pesan.push(baru);
        renderPesanOrtu();
      } catch (err) {
        console.error('[pesan-ortu] gagal mengirim:', err);
        if (msg) msg.textContent = 'Gagal mengirim: ' + (err.message || 'coba lagi');
        btn.disabled = false;
      }
    });
  }

  // Pesan tidak menyegarkan diri sendiri (tidak ada polling maupun realtime),
  // jadi guru butuh cara eksplisit untuk mengambil pesan baru tanpa memuat
  // ulang seluruh halaman.
  function komposerRefreshHtml() {
    return `<div style="display:flex;justify-content:flex-end;margin-bottom:.5rem">
      <button type="button" id="btn-refresh-pesan"
        style="padding:.3rem .75rem;border:1px solid var(--border);border-radius:.35rem;
        background:transparent;color:inherit;cursor:pointer;font-family:inherit;
        font-size:var(--fs-caption)">&#x21bb; Refresh Pesan</button>
    </div>`;
  }

  function wireRefreshPesan(listEl) {
    const btn = listEl.querySelector('#btn-refresh-pesan');
    if (!btn) return;
    btn.addEventListener('click', async () => {
      btn.disabled    = true;
      btn.textContent = 'Memuat…';
      await loadPesanOrtu();
      renderPesanOrtu();
    });
  }

  function renderPesanOrtu() {
    const listEl = document.getElementById('pesan-ortu-list');
    if (!listEl) return;

    // Kelompokkan per siswa; satu kartu = satu percakapan
    const perSiswa = {};
    _pesan.forEach(m => {
      (perSiswa[m.student_id] = perSiswa[m.student_id] || []).push(m);
    });
    const idSiswa = Object.keys(perSiswa);

    const belumDibaca = _pesan.filter(m => m.author_role === 'ORTU' && !m.read_at).length;
    const hdr = document.querySelector('#panel-catatan h2[data-panel="pesan-ortu-body"]');
    if (hdr) {
      const dasar = 'Pesan';
      const teks  = belumDibaca ? `${dasar} (${belumDibaca} baru)` : dasar;
      const arrow = hdr.querySelector('.panel-collapse-arrow');
      hdr.textContent = teks + ' ';
      if (arrow) hdr.appendChild(arrow);
    }

    // Guru harus dapat MEMULAI pesan, bukan sekadar membalas — tanpa ini,
    // percakapan hanya bisa lahir dari sisi orang tua.
    const opsiSiswa = _roster
      .map(r => `<option value="${esc(r.id)}">${esc(r.full_name)}</option>`).join('');
    const komposerBaru = `
<div class="note-card" style="margin-bottom:.75rem">
  <div class="note-card-header"><span class="note-student-name">Kirim pesan baru</span></div>
  <select id="pesan-baru-sid" style="width:100%;margin-bottom:.4rem">
    <option value="">— Pilih siswa —</option>${opsiSiswa}
  </select>
  <textarea id="pesan-baru-teks" rows="2" maxlength="1000"
    placeholder="Tulis pesan untuk orang tua…"
    style="width:100%;box-sizing:border-box;padding:.5rem;border-radius:.4rem;
    border:1px solid var(--border);background:transparent;color:inherit;
    font-family:inherit;font-size:.875rem;resize:vertical"></textarea>
  <div style="display:flex;align-items:center;gap:.5rem;margin-top:.35rem">
    <button type="button" id="btn-pesan-baru"
      style="padding:.35rem .9rem;border:none;border-radius:.35rem;background:var(--gold);
      color:var(--text-on-gold,#000);font-weight:600;cursor:pointer">Kirim</button>
    <span id="pesan-baru-msg" style="font-size:var(--fs-caption);color:var(--text-muted)"></span>
  </div>
</div>`;

    if (!idSiswa.length) {
      listEl.innerHTML = komposerRefreshHtml() + komposerBaru +
        '<p class="empty-state">Belum ada percakapan dengan orang tua.</p>';
      wireKomposerBaru(listEl);
      wireRefreshPesan(listEl);
      return;
    }

    listEl.innerHTML = komposerRefreshHtml() + komposerBaru + idSiswa.map(sid => {
      const nama  = rosterName(sid);
      const pesan = perSiswa[sid];
      const baru  = pesan.filter(m => m.author_role === 'ORTU' && !m.read_at).length;
      const isi   = pesan.map(m => {
        const dariGuru = m.author_role === 'GURU';
        const label    = dariGuru ? 'Anda' : 'Ortu';
        const warna    = dariGuru ? 'var(--text-secondary)' : 'var(--gold)';
        const tandaBaru = (!dariGuru && !m.read_at) ? ' <span style="color:var(--gold)">•</span>' : '';
        return `<div style="border-left:2px solid ${warna};padding-left:.6rem;margin:.4rem 0">
          <div style="font-size:var(--fs-caption);color:var(--text-muted)">
            <strong style="color:${warna}">${esc(label)}</strong> · ${fmtDate(m.created_at)}${tandaBaru}
          </div>
          <div style="font-size:var(--fs-caption);color:var(--text-primary)">${esc(m.content)}</div>
        </div>`;
      }).join('');

      return `<div class="note-card" data-sid="${esc(sid)}" style="margin-bottom:.75rem">
        <div class="note-card-header">
          <span class="note-student-name">${esc(nama)}</span>
          ${baru ? `<span style="font-size:var(--fs-caption);color:var(--gold)">${baru} belum dibaca</span>` : ''}
        </div>
        ${isi}
        <textarea class="pesan-balas-input" data-sid="${esc(sid)}" rows="2" maxlength="1000"
          placeholder="Tulis balasan untuk orang tua…"
          style="width:100%;box-sizing:border-box;padding:.5rem;margin-top:.4rem;border-radius:.4rem;
          border:1px solid var(--border);background:transparent;color:inherit;font-family:inherit;
          font-size:.875rem;resize:vertical"></textarea>
        <div style="display:flex;align-items:center;gap:.5rem;margin-top:.35rem">
          <button type="button" class="btn-pesan-balas" data-sid="${esc(sid)}"
            style="padding:.35rem .9rem;border:none;border-radius:.35rem;background:var(--gold);
            color:var(--text-on-gold,#000);font-weight:600;cursor:pointer">Balas</button>
          <span class="pesan-balas-msg" data-sid="${esc(sid)}"
            style="font-size:var(--fs-caption);color:var(--text-muted)"></span>
        </div>
      </div>`;
    }).join('');

    wireKomposerBaru(listEl);
    wireRefreshPesan(listEl);

    listEl.querySelectorAll('.btn-pesan-balas').forEach(btn => {
      btn.addEventListener('click', async () => {
        const sid = btn.dataset.sid;
        const ta  = listEl.querySelector(`.pesan-balas-input[data-sid="${sid}"]`);
        const msg = listEl.querySelector(`.pesan-balas-msg[data-sid="${sid}"]`);
        const teks = (ta?.value ?? '').trim();
        if (!teks) { if (msg) msg.textContent = 'Balasan tidak boleh kosong.'; return; }
        btn.disabled = true;
        if (msg) msg.textContent = 'Mengirim…';
        try {
          const baru = await balasPesan(sid, teks);
          _pesan.push(baru);
          await tandaiDibaca(sid);
          renderPesanOrtu();
        } catch (err) {
          console.error('[pesan-ortu] gagal membalas:', err);
          if (msg) msg.textContent = 'Gagal mengirim: ' + (err.message || 'coba lagi');
          btn.disabled = false;
        }
      });
    });
  }

  // ---------------------------------------------------------------------------
  // Init tab catatan
  // ---------------------------------------------------------------------------

  async function initNotes() {
    await Promise.all([loadRoster(), loadNotes(), loadPesanOrtu()]);
    initForm();
    initFilter();
    initCollapseSections();
    initExtraFilters();
    renderPesanOrtu();
  }

  // Panel sebelumnya ditampilkan lebih dulu, lalu initNotes() hanya dipanggil
  // bila teacherId dan classroomId kebetulan sudah terisi. Keduanya diisi
  // setelah dua await, jadi guru yang mengklik tab pada jaringan lambat
  // mendapat panel kosong permanen: tanpa loading, tanpa error, tanpa cara
  // mencoba lagi selain memuat ulang halaman.
  let _notesSedangMemuat = false;

  function tampilkanStatusCatatan(html) {
    const el = document.getElementById('notes-list');
    if (el) el.innerHTML = html;
  }

  async function bukaTabCatatan() {
    if (_notesLoaded || _notesSedangMemuat) return;

    if (!teacherId || !classroomId) {
      // Auth belum selesai — tunggu, jangan diam.
      tampilkanStatusCatatan('<p class="empty-state">Menyiapkan…</p>');
      const mulai = Date.now();
      while ((!teacherId || !classroomId) && Date.now() - mulai < 15000) {
        await new Promise(r => setTimeout(r, 200));
      }
      if (!teacherId || !classroomId) {
        tampilkanStatusCatatan(
          '<p class="empty-state">Gagal memuat data akun. Periksa koneksi internet Anda.' +
          '<br><button type="button" id="btn-catatan-ulang">Coba lagi</button></p>');
        document.getElementById('btn-catatan-ulang')
          ?.addEventListener('click', () => bukaTabCatatan());
        return;
      }
    }

    _notesSedangMemuat = true;
    tampilkanStatusCatatan('<p class="empty-state">Memuat catatan…</p>');
    try {
      await initNotes();
    } catch (err) {
      console.error('[catatan] gagal init:', err);
      tampilkanStatusCatatan(
        '<p class="empty-state">Gagal memuat catatan.' +
        '<br><button type="button" id="btn-catatan-ulang">Coba lagi</button></p>');
      document.getElementById('btn-catatan-ulang')
        ?.addEventListener('click', () => bukaTabCatatan());
    } finally {
      _notesSedangMemuat = false;
    }
  }

  // ---------------------------------------------------------------------------
  // DOMContentLoaded
  // ---------------------------------------------------------------------------

  window.addEventListener('DOMContentLoaded', async function () {
    const tabSiswa    = document.getElementById('tab-siswa');
    const tabJadwal   = document.getElementById('tab-jadwal');
    const tabCatatan  = document.getElementById('tab-catatan');
    const panelSiswa  = document.getElementById('panel-siswa');
    const panelJadwal = document.getElementById('panel-jadwal');
    const panelCatatan = document.getElementById('panel-catatan');

    if (!tabCatatan || !panelCatatan) return;

    // Tab switching — catatan
    tabCatatan.addEventListener('click', async () => {
      window.currentTab = 'catatan';
      [tabSiswa, tabJadwal].forEach(t => { if (t) t.classList.remove('active'); });
      tabCatatan.classList.add('active');
      if (panelSiswa)  panelSiswa.style.display  = 'none';
      if (panelJadwal) panelJadwal.style.display  = 'none';
      panelCatatan.style.display = '';
      const _cId = new URLSearchParams(window.location.search).get('id');
      if (_cId) try { localStorage.setItem('sip_tab_' + _cId, 'catatan'); } catch (_) {}
      await bukaTabCatatan();
    });

    // Hide catatan saat tab lain diklik
    [tabSiswa, tabJadwal].forEach(t => {
      if (!t) return;
      t.addEventListener('click', () => {
        tabCatatan.classList.remove('active');
        panelCatatan.style.display = 'none';
      });
    });

    // Auth — ambil session + profile (independen)
    const { data: { session } } = await client.auth.getSession();
    if (!session) return;

    const cId = new URLSearchParams(window.location.search).get('id');
    if (!cId) return;
    classroomId = cId;

    const { data: prof } = await client
      .from('profiles').select('id').eq('user_id', session.user.id).single();
    if (!prof) return;
    teacherId = prof.id;

    // Restore tab catatan
    const savedTab = cId ? localStorage.getItem('sip_tab_' + cId) : null;
    if (savedTab === 'catatan' && tabCatatan) tabCatatan.click();
  });

}());
