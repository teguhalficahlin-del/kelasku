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

  async function updateNote(id, content, visStudent, visParent) {
    const { error } = await client
      .from('student_notes')
      .update({ content, is_visible_to_student: visStudent, is_visible_to_parent: visParent })
      .eq('id', id);
    if (error) throw error;
  }

  async function deleteNote(id) {
    const { error } = await client
      .from('student_notes')
      .delete()
      .eq('id', id);
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

    sel.innerHTML = '<option value="">— Pilih siswa —</option>' + opts;
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

  function renderNotesList() {
    const el = document.getElementById('notes-list');
    if (!el) return;

    let rows = _filterStudentId
      ? _notes.filter(n => n.student_id === _filterStudentId)
      : [..._notes];

    if (_filterVisibilitas === 'siswa')      rows = rows.filter(n => n.is_visible_to_student);
    else if (_filterVisibilitas === 'ortu')  rows = rows.filter(n => n.is_visible_to_parent);
    else if (_filterVisibilitas === 'keduanya') rows = rows.filter(n => n.is_visible_to_student && n.is_visible_to_parent);

    if (_filterFrom) rows = rows.filter(n => n.created_at.slice(0, 10) >= _filterFrom);
    if (_filterTo)   rows = rows.filter(n => n.created_at.slice(0, 10) <= _filterTo);

    if (rows.length === 0) {
      el.innerHTML = '<p class="empty-state">Belum ada catatan.</p>';
      return;
    }

    el.innerHTML = rows.map(n => {
      const nama = esc(rosterName(n.student_id));
      const vs   = n.is_visible_to_student;
      const vp   = n.is_visible_to_parent;
      const vis  = vs && vp ? 'Siswa &amp; Ortu'
                 : vs       ? 'Siswa saja'
                 : vp       ? 'Ortu saja'
                 :            'Hanya guru';
      return `
      <div class="note-card" data-id="${esc(n.id)}">
        <div class="note-card-header">
          <span class="note-student-name">${nama}</span>
          <span class="note-date">${fmtDate(n.created_at)}</span>
        </div>
        <p class="note-content">${esc(n.content)}</p>
        <div class="note-footer">
          <span class="note-vis">👁 ${vis}</span>
          <div class="note-actions">
            <button class="btn-note-edit" data-id="${esc(n.id)}">Edit</button>
            <button class="btn-note-delete" data-id="${esc(n.id)}">Hapus</button>
          </div>
        </div>
      </div>`;
    }).join('');

    el.querySelectorAll('.btn-note-edit').forEach(btn => {
      btn.addEventListener('click', () => openEditModal(btn.dataset.id));
    });
    el.querySelectorAll('.btn-note-delete').forEach(btn => {
      btn.addEventListener('click', () => confirmDelete(btn.dataset.id));
    });
  }

  // ---------------------------------------------------------------------------
  // Form tambah catatan
  // ---------------------------------------------------------------------------

  function initForm() {
    const form    = document.getElementById('notes-form');
    const statusEl = document.getElementById('notes-status');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const studentId = _notesSelInst ? _notesSelInst.getValue() : document.getElementById('notes-student-select').value;
      const content   = document.getElementById('notes-content').value.trim();
      const visS      = document.getElementById('notes-vis-student').checked;
      const visP      = document.getElementById('notes-vis-parent').checked;

      if (!studentId) {
        statusEl.textContent = 'Pilih siswa terlebih dahulu.';
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
        const note = await saveNote(studentId, content, visS, visP);
        _notes.unshift(note);
        renderNotesList();
        form.reset();
        if (_notesSelInst) _notesSelInst.setValue('');
        statusEl.textContent   = '✓ Catatan berhasil disimpan.';
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
      renderNotesList();
    });
  }

  // ---------------------------------------------------------------------------
  // Edit modal
  // ---------------------------------------------------------------------------

  function openEditModal(id) {
    const note = _notes.find(n => n.id === id);
    if (!note) return;

    document.getElementById('notes-edit-overlay')?.remove();

    const overlay = document.createElement('div');
    overlay.id        = 'notes-edit-overlay';
    overlay.className = 'share-overlay';

    const box = document.createElement('div');
    box.className = 'share-box';

    const title = document.createElement('p');
    title.innerHTML = '<strong>Edit Catatan — ' + esc(rosterName(note.student_id)) + '</strong>';

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
        await updateNote(id, newContent, chkS.checked, chkP.checked);
        const idx = _notes.findIndex(n => n.id === id);
        if (idx !== -1) {
          _notes[idx] = { ..._notes[idx], content: newContent, is_visible_to_student: chkS.checked, is_visible_to_parent: chkP.checked };
        }
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

  async function confirmDelete(id) {
    if (!window.confirm('Hapus catatan ini? Tindakan ini tidak bisa dibatalkan.')) return;
    try {
      await deleteNote(id);
      _notes = _notes.filter(n => n.id !== id);
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
    fromInput.style.cssText = 'flex:1;min-width:8rem;max-width:10rem;';

    const toLabel = document.createElement('label');
    toLabel.textContent = 'Sampai';
    toLabel.style.cssText = 'font-size:var(--fs-caption);color:var(--text-secondary);margin-bottom:0;flex-shrink:0;text-transform:none;letter-spacing:normal;font-weight:var(--fw-medium);';

    const toInput = document.createElement('input');
    toInput.type = 'date';
    toInput.id   = 'notes-filter-to';
    toInput.style.cssText = 'flex:1;min-width:8rem;max-width:10rem;';

    wrap.appendChild(visLabel);
    wrap.appendChild(visSel);
    wrap.appendChild(fromLabel);
    wrap.appendChild(fromInput);
    wrap.appendChild(toLabel);
    wrap.appendChild(toInput);

    listEl.insertAdjacentElement('beforebegin', wrap);

    visSel.addEventListener('change', () => { _filterVisibilitas = visSel.value; renderNotesList(); });
    fromInput.addEventListener('change', () => { _filterFrom = fromInput.value; renderNotesList(); });
    toInput.addEventListener('change',   () => { _filterTo   = toInput.value;   renderNotesList(); });
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

    const all      = _notes;
    const keSiswa  = _notes.filter(n => n.is_visible_to_student);
    const keOrtu   = _notes.filter(n => n.is_visible_to_parent);
    const keduanya = _notes.filter(n => n.is_visible_to_student && n.is_visible_to_parent);

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
        }
      });
    });
  }

  // ---------------------------------------------------------------------------
  // Init tab catatan
  // ---------------------------------------------------------------------------

  async function initNotes() {
    await Promise.all([loadRoster(), loadNotes()]);
    initForm();
    initFilter();
    initCollapseSections();
    initExtraFilters();
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
      if (!_notesLoaded && teacherId && classroomId) await initNotes();
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
