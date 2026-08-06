(function () {
  'use strict';
  const client = window.supabaseClient;

  let classroomId = null;
  let teacherId   = null;
  let _roster     = [];
  let _items      = [];   // assessment_items
  let _grades     = [];   // student_grades
  let _loaded     = false;
  let _year       = '';
  let _semester   = 1;

  const YEAR_RE = /^\d{4}\/\d{4}$/;
  const TIPE_LIST = ['CP','TP','KKTP','NILAI','LAINNYA'];

  function esc(s) {
    return String(s ?? '')
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function tipeBadgeClass(tipe) {
    const map = { CP:'badge-cp', TP:'badge-tp', KKTP:'badge-kktp', NILAI:'badge-nilai', LAINNYA:'badge-lainnya' };
    return map[tipe] || 'badge-lainnya';
  }

  // -----------------------------------------------------------------------
  // API — assessment_items
  // -----------------------------------------------------------------------

  async function loadItems() {
    const listEl = document.getElementById('penilaian-items-list');
    if (listEl) listEl.innerHTML = '<p class="empty-state">Memuat…</p>';
    const { data, error } = await client
      .from('assessment_items')
      .select('id, judul, tipe, konten, urutan, is_visible_siswa, is_visible_ortu')
      .eq('classroom_id', classroomId)
      .eq('academic_year', _year)
      .eq('semester', _semester)
      .order('urutan').order('judul');
    if (error) {
      if (listEl) listEl.innerHTML = '<p class="empty-state">Gagal memuat: ' + esc(error.message) + '</p>';
      return;
    }
    _items = data || [];
    renderItems();
  }

  async function saveItem(payload) {
    const { data, error } = await client
      .from('assessment_items')
      .insert({ ...payload, classroom_id: classroomId, teacher_id: teacherId,
                academic_year: _year, semester: _semester })
      .select('id, judul, tipe, konten, urutan, is_visible_siswa, is_visible_ortu')
      .single();
    if (error) throw error;
    return data;
  }

  async function updateItem(id, payload) {
    const { error } = await client.from('assessment_items').update(payload).eq('id', id);
    if (error) throw error;
  }

  async function deleteItem(id) {
    const { error } = await client.from('assessment_items').delete().eq('id', id);
    if (error) throw error;
  }

  // -----------------------------------------------------------------------
  // API — student_grades
  // -----------------------------------------------------------------------

  async function loadGrades() {
    const listEl = document.getElementById('penilaian-grades-list');
    if (listEl) listEl.innerHTML = '<p class="empty-state">Memuat…</p>';
    const { data, error } = await client
      .from('student_grades')
      .select('id, student_id, judul, nilai_angka, deskripsi, is_published')
      .eq('classroom_id', classroomId)
      .eq('academic_year', _year)
      .eq('semester', _semester)
      .order('judul').order('student_id');
    if (error) {
      if (listEl) listEl.innerHTML = '<p class="empty-state">Gagal memuat: ' + esc(error.message) + '</p>';
      return;
    }
    _grades = data || [];
    renderGrades();
  }

  async function saveGrade(payload) {
    const { data, error } = await client
      .from('student_grades')
      .insert({ ...payload, classroom_id: classroomId, teacher_id: teacherId,
                academic_year: _year, semester: _semester })
      .select('id, student_id, judul, nilai_angka, deskripsi, is_published')
      .single();
    if (error) throw error;
    return data;
  }

  async function updateGrade(id, payload) {
    const { error } = await client.from('student_grades').update(payload).eq('id', id);
    if (error) throw error;
  }

  async function deleteGrade(id) {
    const { error } = await client.from('student_grades').delete().eq('id', id);
    if (error) throw error;
  }

  // -----------------------------------------------------------------------
  // Roster
  // -----------------------------------------------------------------------

  async function loadRoster() {
    const { data } = await client
      .from('classroom_roster')
      .select('profile_id, full_name, nis')
      .eq('classroom_id', classroomId)
      .not('profile_id', 'is', null)
      .order('full_name');
    _roster = (data || []).map(r => ({ id: r.profile_id, full_name: r.full_name, nis: r.nis }));
  }

  function rosterName(studentId) {
    const s = _roster.find(r => r.id === studentId);
    return s ? s.full_name + (s.nis ? ' · ' + s.nis : '') : studentId;
  }

  function rosterSelectOpts(selectedId) {
    return _roster.map(s =>
      `<option value="${esc(s.id)}"${s.id === selectedId ? ' selected' : ''}>` +
      `${esc(s.full_name)}${s.nis ? ' · ' + esc(s.nis) : ''}</option>`
    ).join('');
  }

  // -----------------------------------------------------------------------
  // Render — assessment_items
  // -----------------------------------------------------------------------

  function renderItems() {
    const listEl = document.getElementById('penilaian-items-list');
    const addBtn = document.getElementById('btn-pai-add');
    if (!listEl) return;
    if (addBtn) addBtn.style.display = '';

    if (_items.length === 0) {
      listEl.innerHTML = '<p class="empty-state">Belum ada item penilaian untuk filter ini.</p>';
      return;
    }

    listEl.innerHTML = _items.map(item => {
      const visBadges = [
        item.is_visible_siswa ? '<span class="badge-vis">Siswa ✓</span>' : '',
        item.is_visible_ortu  ? '<span class="badge-vis">Ortu ✓</span>'  : '',
      ].filter(Boolean).join(' ');
      return `
      <div class="pai-card card-row" data-id="${esc(item.id)}">
        <div class="card-row-info">
          <span class="card-name">${esc(item.judul)}</span>
          <span class="badge-tipe ${tipeBadgeClass(item.tipe)}">${esc(item.tipe)}</span>
          ${visBadges}
          ${item.urutan != null ? `<span class="cl-label">Urutan ${esc(item.urutan)}</span>` : ''}
        </div>
        ${item.konten ? `<p class="pai-konten">${esc(item.konten)}</p>` : ''}
        <div class="card-row-actions">
          <button class="btn-sm btn-pai-edit" data-id="${esc(item.id)}">Edit</button>
          <button class="btn-sm btn-danger btn-pai-delete" data-id="${esc(item.id)}">Hapus</button>
        </div>
      </div>`;
    }).join('');
  }

  // -----------------------------------------------------------------------
  // Render — student_grades
  // -----------------------------------------------------------------------

  function renderGrades() {
    const listEl = document.getElementById('penilaian-grades-list');
    const addBtn = document.getElementById('btn-sg-add');
    if (!listEl) return;
    if (addBtn) addBtn.style.display = '';

    if (_grades.length === 0) {
      listEl.innerHTML = '<p class="empty-state">Belum ada data nilai untuk filter ini.</p>';
      return;
    }

    listEl.innerHTML =
      `<div class="sg-table-wrap"><table class="sg-table">
        <thead><tr>
          <th>Nama Siswa</th><th>Judul Penilaian</th>
          <th>Nilai</th><th>Deskripsi</th><th>Published</th><th>Aksi</th>
        </tr></thead>
        <tbody>` +
      _grades.map(g => `
        <tr data-id="${esc(g.id)}">
          <td>${esc(rosterName(g.student_id))}</td>
          <td>${esc(g.judul)}</td>
          <td>${g.nilai_angka != null ? esc(g.nilai_angka) : '—'}</td>
          <td class="sg-desc">${g.deskripsi ? esc(g.deskripsi) : '—'}</td>
          <td><span class="${g.is_published ? 'badge-aktif' : 'badge-nonaktif'}">${g.is_published ? 'Ya' : 'Tidak'}</span></td>
          <td class="sg-actions">
            <button class="btn-sm btn-sg-edit" data-id="${esc(g.id)}">Edit</button>
            <button class="btn-sm btn-danger btn-sg-delete" data-id="${esc(g.id)}">Hapus</button>
          </td>
        </tr>`
      ).join('') +
      `</tbody></table></div>`;
  }

  // -----------------------------------------------------------------------
  // Modal helper
  // -----------------------------------------------------------------------

  function openModal(title, bodyHtml, onSave) {
    document.getElementById('assessment-modal')?.remove();

    const overlay = document.createElement('div');
    overlay.id        = 'assessment-modal';
    overlay.className = 'share-overlay';

    const box = document.createElement('div');
    box.className = 'share-box';
    box.style.cssText = 'max-width:480px;width:100%;';

    box.innerHTML =
      `<p style="font-weight:var(--fw-semibold);font-size:var(--fs-h3);margin-bottom:var(--space-md);">${title}</p>` +
      `<div class="modal-body">${bodyHtml}</div>` +
      `<div class="modal-err" style="color:var(--danger);font-size:var(--fs-caption);min-height:1.4rem;margin-top:var(--space-xs);"></div>` +
      `<div style="display:flex;gap:var(--space-sm);justify-content:flex-end;margin-top:var(--space-md);">` +
        `<button type="button" class="modal-cancel">Batal</button>` +
        `<button type="button" class="modal-save">Simpan</button>` +
      `</div>`;

    overlay.appendChild(box);
    document.body.appendChild(overlay);

    const errEl    = box.querySelector('.modal-err');
    const saveBtn  = box.querySelector('.modal-save');
    const cancelBtn = box.querySelector('.modal-cancel');

    function close() {
      overlay.remove();
      document.removeEventListener('keydown', onEsc);
    }
    function onEsc(e) { if (e.key === 'Escape') close(); }
    document.addEventListener('keydown', onEsc);
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
    cancelBtn.addEventListener('click', close);

    saveBtn.addEventListener('click', async () => {
      errEl.textContent = '';
      saveBtn.disabled    = true;
      saveBtn.textContent = 'Menyimpan…';
      try {
        await onSave(box, errEl);
        close();
      } catch (err) {
        errEl.textContent   = '✗ ' + (err.message || 'Gagal menyimpan.');
        saveBtn.disabled    = false;
        saveBtn.textContent = 'Simpan';
      }
    });

    return box;
  }

  // -----------------------------------------------------------------------
  // Form — assessment_items
  // -----------------------------------------------------------------------

  function itemFormHtml(item) {
    const tipeOpts = TIPE_LIST.map(t =>
      `<option value="${t}"${item && item.tipe === t ? ' selected' : ''}>${t}</option>`
    ).join('');
    return `
      <div style="display:flex;flex-direction:column;gap:var(--space-sm);">
        <label style="font-size:var(--fs-caption);color:var(--text-secondary);">Judul *
          <input type="text" id="pai-f-judul" value="${item ? esc(item.judul) : ''}"
            placeholder="Judul item penilaian" maxlength="200"
            style="display:block;width:100%;margin-top:4px;">
        </label>
        <label style="font-size:var(--fs-caption);color:var(--text-secondary);">Tipe
          <select id="pai-f-tipe" style="display:block;width:100%;margin-top:4px;">${tipeOpts}</select>
        </label>
        <label style="font-size:var(--fs-caption);color:var(--text-secondary);">Konten (opsional)
          <textarea id="pai-f-konten" rows="3" maxlength="2000"
            placeholder="Isi teks bebas…"
            style="display:block;width:100%;margin-top:4px;resize:vertical;">${item ? esc(item.konten || '') : ''}</textarea>
        </label>
        <label style="font-size:var(--fs-caption);color:var(--text-secondary);">Urutan
          <input type="number" id="pai-f-urutan" min="1" max="999"
            value="${item ? esc(item.urutan ?? 1) : 1}"
            style="display:block;width:100%;margin-top:4px;">
        </label>
        <div style="display:flex;gap:var(--space-lg);font-size:var(--fs-ui);">
          <label><input type="checkbox" id="pai-f-vis-siswa"${item && item.is_visible_siswa ? ' checked' : ''}> Tampilkan ke Siswa</label>
          <label><input type="checkbox" id="pai-f-vis-ortu"${item && item.is_visible_ortu ? ' checked' : ''}> Tampilkan ke Ortu</label>
        </div>
      </div>`;
  }

  function openItemForm(item) {
    const isEdit = !!item;
    const box = openModal(
      isEdit ? 'Edit Item Penilaian' : 'Tambah Item Penilaian',
      itemFormHtml(item),
      async (b, errEl) => {
        const judul   = b.querySelector('#pai-f-judul').value.trim();
        const tipe    = b.querySelector('#pai-f-tipe').value;
        const konten  = b.querySelector('#pai-f-konten').value.trim() || null;
        const urutan  = parseInt(b.querySelector('#pai-f-urutan').value, 10) || 1;
        const visS    = b.querySelector('#pai-f-vis-siswa').checked;
        const visO    = b.querySelector('#pai-f-vis-ortu').checked;
        if (!judul) { errEl.textContent = 'Judul tidak boleh kosong.'; throw new Error(''); }
        const payload = { judul, tipe, konten, urutan, is_visible_siswa: visS, is_visible_ortu: visO };
        if (isEdit) {
          await updateItem(item.id, payload);
          const idx = _items.findIndex(i => i.id === item.id);
          if (idx !== -1) _items[idx] = { ..._items[idx], ...payload };
        } else {
          const newItem = await saveItem(payload);
          _items.push(newItem);
        }
        renderItems();
      }
    );
    setTimeout(() => box.querySelector('#pai-f-judul')?.focus(), 50);
  }

  // -----------------------------------------------------------------------
  // Form — student_grades
  // -----------------------------------------------------------------------

  function gradeFormHtml(grade) {
    return `
      <div style="display:flex;flex-direction:column;gap:var(--space-sm);">
        <label style="font-size:var(--fs-caption);color:var(--text-secondary);">Siswa *
          <select id="sg-f-student" style="display:block;width:100%;margin-top:4px;"
            ${grade ? 'disabled' : ''}>
            <option value="">— Pilih siswa —</option>
            ${rosterSelectOpts(grade ? grade.student_id : '')}
          </select>
        </label>
        <label style="font-size:var(--fs-caption);color:var(--text-secondary);">Judul Penilaian *
          <input type="text" id="sg-f-judul" value="${grade ? esc(grade.judul) : ''}"
            placeholder="cth: UTS, TP1, Proyek" maxlength="200"
            style="display:block;width:100%;margin-top:4px;">
        </label>
        <label style="font-size:var(--fs-caption);color:var(--text-secondary);">Nilai (0–100)
          <input type="number" id="sg-f-nilai" min="0" max="100" step="0.01"
            value="${grade && grade.nilai_angka != null ? esc(grade.nilai_angka) : ''}"
            placeholder="Opsional"
            style="display:block;width:100%;margin-top:4px;">
        </label>
        <label style="font-size:var(--fs-caption);color:var(--text-secondary);">Deskripsi (opsional)
          <textarea id="sg-f-deskripsi" rows="3" maxlength="1000"
            placeholder="Catatan naratif…"
            style="display:block;width:100%;margin-top:4px;resize:vertical;">${grade && grade.deskripsi ? esc(grade.deskripsi) : ''}</textarea>
        </label>
        <label style="font-size:var(--fs-ui);">
          <input type="checkbox" id="sg-f-published"${grade && grade.is_published ? ' checked' : ''}>
          Publikasikan ke siswa &amp; ortu
        </label>
      </div>`;
  }

  function openGradeForm(grade) {
    const isEdit = !!grade;
    openModal(
      isEdit ? 'Edit Nilai Siswa' : 'Tambah Nilai Siswa',
      gradeFormHtml(grade),
      async (b, errEl) => {
        const studentId  = isEdit ? grade.student_id : b.querySelector('#sg-f-student').value;
        const judul      = b.querySelector('#sg-f-judul').value.trim();
        const nilaiRaw   = b.querySelector('#sg-f-nilai').value.trim();
        const deskripsi  = b.querySelector('#sg-f-deskripsi').value.trim() || null;
        const published  = b.querySelector('#sg-f-published').checked;

        if (!studentId) { errEl.textContent = 'Pilih siswa terlebih dahulu.'; throw new Error(''); }
        if (!judul)     { errEl.textContent = 'Judul penilaian tidak boleh kosong.'; throw new Error(''); }

        let nilai_angka = null;
        if (nilaiRaw !== '') {
          nilai_angka = parseFloat(nilaiRaw);
          if (isNaN(nilai_angka) || nilai_angka < 0 || nilai_angka > 100) {
            errEl.textContent = 'Nilai harus antara 0 dan 100.';
            throw new Error('');
          }
        }

        const payload = { student_id: studentId, judul, nilai_angka, deskripsi, is_published: published };
        if (isEdit) {
          await updateGrade(grade.id, { judul, nilai_angka, deskripsi, is_published: published });
          const idx = _grades.findIndex(g => g.id === grade.id);
          if (idx !== -1) _grades[idx] = { ..._grades[idx], judul, nilai_angka, deskripsi, is_published: published };
        } else {
          const newGrade = await saveGrade(payload);
          _grades.push(newGrade);
        }
        renderGrades();
      }
    );
  }

  // -----------------------------------------------------------------------
  // Delete
  // -----------------------------------------------------------------------

  async function confirmDeleteItem(id) {
    if (!window.confirm('Hapus item penilaian ini? Tindakan ini tidak bisa dibatalkan.')) return;
    try {
      await deleteItem(id);
      _items = _items.filter(i => i.id !== id);
      renderItems();
    } catch (err) {
      alert('Gagal hapus: ' + (err.message || 'Error tidak diketahui.'));
    }
  }

  async function confirmDeleteGrade(id) {
    if (!window.confirm('Hapus data nilai ini? Tindakan ini tidak bisa dibatalkan.')) return;
    try {
      await deleteGrade(id);
      _grades = _grades.filter(g => g.id !== id);
      renderGrades();
    } catch (err) {
      alert('Gagal hapus: ' + (err.message || 'Error tidak diketahui.'));
    }
  }

  // -----------------------------------------------------------------------
  // Collapse (pola identik dengan classroom-notes.js)
  // -----------------------------------------------------------------------

  function initCollapse() {
    const headers = document.querySelectorAll('#panel-penilaian h2.panel-header');
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

  // -----------------------------------------------------------------------
  // Filter row
  // -----------------------------------------------------------------------

  function initFilter() {
    const yearInp = document.getElementById('pai-year');
    const semSel  = document.getElementById('pai-semester');
    const btn     = document.getElementById('btn-pai-filter');
    if (!btn) return;

    const now = new Date();
    const y   = now.getFullYear();
    const defaultYear = (now.getMonth() >= 6)
      ? `${y}/${y+1}`
      : `${y-1}/${y}`;
    if (yearInp) yearInp.value = defaultYear;
    _year     = defaultYear;
    _semester = now.getMonth() >= 6 ? 1 : 2;
    if (semSel) semSel.value = String(_semester);

    btn.addEventListener('click', async () => {
      const yv = yearInp ? yearInp.value.trim() : '';
      const sv = semSel  ? parseInt(semSel.value, 10) : 1;
      if (!YEAR_RE.test(yv)) {
        alert('Format tahun ajaran tidak valid. Contoh: 2025/2026');
        return;
      }
      _year     = yv;
      _semester = sv;
      await Promise.all([loadItems(), loadGrades()]);
    });
  }

  // -----------------------------------------------------------------------
  // Event delegation
  // -----------------------------------------------------------------------

  function initDelegation() {
    const itemsList  = document.getElementById('penilaian-items-list');
    const gradesList = document.getElementById('penilaian-grades-list');
    const addItemBtn = document.getElementById('btn-pai-add');
    const addGradeBtn = document.getElementById('btn-sg-add');

    if (addItemBtn) {
      addItemBtn.addEventListener('click', () => openItemForm(null));
    }
    if (addGradeBtn) {
      addGradeBtn.addEventListener('click', () => openGradeForm(null));
    }

    if (itemsList) {
      itemsList.addEventListener('click', e => {
        const editBtn   = e.target.closest('.btn-pai-edit');
        const deleteBtn = e.target.closest('.btn-pai-delete');
        if (editBtn) {
          const id = editBtn.dataset.id;
          const item = _items.find(i => i.id === id);
          if (item) openItemForm(item);
        }
        if (deleteBtn) confirmDeleteItem(deleteBtn.dataset.id);
      });
    }

    if (gradesList) {
      gradesList.addEventListener('click', e => {
        const editBtn   = e.target.closest('.btn-sg-edit');
        const deleteBtn = e.target.closest('.btn-sg-delete');
        if (editBtn) {
          const id = editBtn.dataset.id;
          const grade = _grades.find(g => g.id === id);
          if (grade) openGradeForm(grade);
        }
        if (deleteBtn) confirmDeleteGrade(deleteBtn.dataset.id);
      });
    }
  }

  // -----------------------------------------------------------------------
  // Init tab penilaian (lazy)
  // -----------------------------------------------------------------------

  async function initAssessmentTab(cId, tId) {
    classroomId = cId;
    teacherId   = tId;
    await Promise.all([loadRoster(), loadItems(), loadGrades()]);
    initCollapse();
    initFilter();
    initDelegation();
    _loaded = true;
  }

  // -----------------------------------------------------------------------
  // DOMContentLoaded — kait ke tab switching
  // -----------------------------------------------------------------------

  window.addEventListener('DOMContentLoaded', async function () {
    const tabSiswa    = document.getElementById('tab-siswa');
    const tabJadwal   = document.getElementById('tab-jadwal');
    const tabCatatan  = document.getElementById('tab-catatan');
    const tabPenilaian = document.getElementById('tab-penilaian');

    const panelSiswa    = document.getElementById('panel-siswa');
    const panelJadwal   = document.getElementById('panel-jadwal');
    const panelCatatan  = document.getElementById('panel-catatan');
    const panelPenilaian = document.getElementById('panel-penilaian');

    if (!tabPenilaian || !panelPenilaian) return;

    const allTabs   = [tabSiswa, tabJadwal, tabCatatan, tabPenilaian].filter(Boolean);
    const allPanels = [panelSiswa, panelJadwal, panelCatatan, panelPenilaian].filter(Boolean);

    tabPenilaian.addEventListener('click', async () => {
      allTabs.forEach(t => t.classList.remove('active'));
      tabPenilaian.classList.add('active');
      allPanels.forEach(p => { p.style.display = 'none'; });
      panelPenilaian.style.display = '';

      const cId = new URLSearchParams(window.location.search).get('id');
      if (cId) try { localStorage.setItem('sip_tab_' + cId, 'penilaian'); } catch (_) {}

      if (!_loaded) {
        // Ambil teacherId dari sesi (classroom-notes.js sudah set, tapi kita mandiri)
        const { data: { session } } = await window.supabaseClient.auth.getSession();
        if (!session) return;
        const _cId = new URLSearchParams(window.location.search).get('id');
        if (!_cId) return;
        const { data: prof } = await window.supabaseClient
          .from('profiles').select('id').eq('user_id', session.user.id).single();
        if (!prof) return;
        await initAssessmentTab(_cId, prof.id);
      }
    });

    // Sembunyikan panel penilaian saat tab lain diklik
    [tabSiswa, tabJadwal, tabCatatan].forEach(t => {
      if (!t) return;
      t.addEventListener('click', () => {
        tabPenilaian.classList.remove('active');
        panelPenilaian.style.display = 'none';
      });
    });

    // Restore tab penilaian dari localStorage
    const cId = new URLSearchParams(window.location.search).get('id');
    if (cId) {
      const savedTab = localStorage.getItem('sip_tab_' + cId);
      if (savedTab === 'penilaian') tabPenilaian.click();
    }
  });

}());
