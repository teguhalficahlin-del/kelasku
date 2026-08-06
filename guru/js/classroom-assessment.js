(function () {
  'use strict';
  const client = window.supabaseClient;

  let classroomId = null;
  let teacherId   = null;
  let _roster     = [];
  let _items      = [];
  let _grades     = [];
  let _loaded     = false;
  let _year       = '';
  let _semester   = 1;

  const _gradePage     = {};   // { [tpId | 'free']: number }
  const _openItems     = new Set(); // IDs accordion yang sedang terbuka
  const PAGE_SIZE      = 5;
  const YEAR_RE        = /^\d{4}\/\d{4}$/;

  // ─── Helpers ───────────────────────────────────────────────────────────────

  function esc(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function fmtDate(s) {
    if (!s) return '—';
    return new Date(s + 'T00:00:00').toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  function rosterName(id) {
    const s = _roster.find(r => r.id === id);
    return s ? s.full_name + (s.nis ? ' · ' + s.nis : '') : '—';
  }

  function rosterSelectOpts(selectedId) {
    return _roster.map(s =>
      `<option value="${esc(s.id)}"${s.id === selectedId ? ' selected' : ''}>` +
      `${esc(s.full_name)}${s.nis ? ' · ' + esc(s.nis) : ''}</option>`
    ).join('');
  }

  function btnOutline(extraCls, style) {
    return `background:transparent;color:var(--gold);border:1.5px solid var(--gold-border);` +
      `font-size:var(--fs-ui);font-weight:var(--fw-medium);font-family:inherit;` +
      `min-height:var(--btn-h-sm);padding:0 var(--btn-px);border-radius:var(--btn-r);` +
      `cursor:pointer;transition:background 150ms,border-color 150ms;` + (style || '');
  }

  function btnOutlineXs(style) {
    return `background:transparent;color:var(--gold);border:1.5px solid var(--gold-border);` +
      `font-size:var(--fs-caption);font-weight:var(--fw-medium);font-family:inherit;` +
      `min-height:var(--btn-h-xs);padding:0 var(--btn-px-sm);border-radius:6px;` +
      `cursor:pointer;transition:background 150ms,border-color 150ms;` + (style || '');
  }

  // ─── API — assessment_items ────────────────────────────────────────────────

  async function loadItems() {
    const { data, error } = await client
      .from('assessment_items')
      .select('id, judul, tipe, konten, urutan, parent_id, batas_bawah, batas_atas, is_visible_siswa, is_visible_ortu, is_active')
      .eq('classroom_id', classroomId)
      .eq('academic_year', _year)
      .eq('semester', _semester)
      .order('urutan').order('judul');
    if (error) {
      const el = document.getElementById('penilaian-items-list');
      if (el) el.innerHTML = '<p class="empty-state">Gagal memuat item: ' + esc(error.message) + '</p>';
      _items = [];
      return;
    }
    _items = data || [];
  }

  async function saveItem(payload) {
    const { data, error } = await client
      .from('assessment_items')
      .insert({ ...payload, classroom_id: classroomId, teacher_id: teacherId,
                academic_year: _year, semester: _semester })
      .select('id, judul, tipe, konten, urutan, parent_id, batas_bawah, batas_atas, is_visible_siswa, is_visible_ortu, is_active')
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

  // ─── API — student_grades ──────────────────────────────────────────────────

  async function loadGrades() {
    const { data, error } = await client
      .from('student_grades')
      .select('id, student_id, judul, nilai_angka, deskripsi, is_published, assessment_item_id, tanggal_penilaian, tipe_penilaian, bobot')
      .eq('classroom_id', classroomId)
      .eq('academic_year', _year)
      .eq('semester', _semester)
      .order('judul').order('student_id');
    if (error) { _grades = []; return; }
    _grades = data || [];
  }

  async function saveGrade(payload) {
    const { data, error } = await client
      .from('student_grades')
      .insert({ ...payload, classroom_id: classroomId, teacher_id: teacherId,
                academic_year: _year, semester: _semester })
      .select('id, student_id, judul, nilai_angka, deskripsi, is_published, assessment_item_id, tanggal_penilaian, tipe_penilaian, bobot')
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

  // ─── API — roster ──────────────────────────────────────────────────────────

  async function loadRoster() {
    const { data } = await client
      .from('classroom_roster')
      .select('profile_id, full_name, nis')
      .eq('classroom_id', classroomId)
      .not('profile_id', 'is', null)
      .order('full_name');
    _roster = (data || []).map(r => ({ id: r.profile_id, full_name: r.full_name, nis: r.nis }));
  }

  async function loadAll() {
    await Promise.all([loadItems(), loadGrades()]);
  }

  // ─── Render — top-level ───────────────────────────────────────────────────

  function renderAll() {
    captureOpenItems();
    renderItemsSection();
    renderFreeGrades();
    restoreOpenItems();
    attachAllSwipe();
  }

  function captureOpenItems() {
    _openItems.clear();
    document.querySelectorAll('.pai-accordion-item[data-id]').forEach(el => {
      const body = el.querySelector(':scope > .pai-accordion-body');
      if (body && body.style.display === 'block') _openItems.add(el.dataset.id);
    });
  }

  function restoreOpenItems() {
    document.querySelectorAll('.pai-accordion-item[data-id]').forEach(el => {
      if (!_openItems.has(el.dataset.id)) return;
      const body = el.querySelector(':scope > .pai-accordion-body');
      const chev = el.querySelector(':scope > .pai-accordion-header .pai-chevron');
      if (body) body.style.display = 'block';
      if (chev) chev.style.transform = 'rotate(180deg)';
    });
  }

  // ─── Render — Dokumen Penilaian ───────────────────────────────────────────

  function renderItemsSection() {
    const listEl = document.getElementById('penilaian-items-list');
    const addBtn = document.getElementById('btn-pai-add');
    if (!listEl) return;
    if (addBtn) addBtn.style.display = 'none'; // tombol Tambah dirender di dalam listEl

    const cp  = _items.find(i => i.tipe === 'CP' && !i.parent_id);
    const tps = _items.filter(i => i.tipe === 'TP' && !i.parent_id);

    let html = '';

    // CP section
    if (cp) {
      html += renderCpItem(cp);
    } else {
      html += `<button type="button" class="btn-cp-add"
        style="${btnOutline()}margin-bottom:var(--space-sm);">+ Tambah CP</button>`;
    }

    // TP list
    if (tps.length > 0) {
      html += tps.map(tp => {
        const kktpList = _items.filter(i => i.tipe === 'KKTP' && i.parent_id === tp.id);
        const grades   = _grades.filter(g => g.assessment_item_id === tp.id);
        return renderTpItem(tp, kktpList, grades);
      }).join('');
    } else {
      html += '<p class="empty-state" style="font-size:var(--fs-caption);padding:var(--space-sm) 0;">Belum ada TP untuk filter ini.</p>';
    }

    // Tambah TP
    html += `<button type="button" class="btn-tp-add"
      style="${btnOutline()}margin-top:var(--space-sm);display:block;">+ Tambah TP</button>`;

    listEl.innerHTML = html;
  }

  // ─── Render — CP accordion ────────────────────────────────────────────────

  function renderCpItem(cp) {
    const visBadges = buildVisBadges(cp);
    const preview   = cp.konten
      ? esc(cp.konten.slice(0, 80)) + (cp.konten.length > 80 ? '…' : '')
      : '<em style="color:var(--text-muted);">(belum ada deskripsi)</em>';
    const hasBody   = !!cp.konten;

    return `
    <div class="pai-accordion-item" data-id="${esc(cp.id)}">
      <div class="pai-accordion-header">
        <div class="pai-accordion-summary">
          <span class="badge-tipe badge-cp">CP</span>
          <span class="pai-accordion-title">${preview}</span>
          ${visBadges}
        </div>
        <div class="pai-accordion-actions">
          <button class="btn-sm btn-cp-edit" data-id="${esc(cp.id)}">Edit</button>
          <button class="btn-sm btn-danger btn-cp-delete" data-id="${esc(cp.id)}">Hapus</button>
          ${hasBody ? '<span class="pai-chevron" aria-hidden="true">▼</span>' : ''}
        </div>
      </div>
      ${hasBody ? `
      <div class="pai-accordion-body" style="display:none;">
        <p class="pai-konten-body">${esc(cp.konten)}</p>
      </div>` : ''}
    </div>`;
  }

  // ─── Render — TP accordion ────────────────────────────────────────────────

  function renderTpItem(tp, kktpList, grades) {
    const visBadges = buildVisBadges(tp);
    const kontenHtml = tp.konten
      ? `<p class="pai-konten-body">${esc(tp.konten)}</p>`
      : '';

    const kktpHtml = `
      <div class="pai-grades-sub">
        <div class="pai-grades-sub-title">── KKTP ──</div>
        <div class="pai-children">${renderKktpList(kktpList)}</div>
        <button type="button" class="btn-kktp-add btn-sm"
          data-tp-id="${esc(tp.id)}"
          style="margin-top:var(--space-xs);font-size:var(--fs-caption);min-height:var(--btn-h-xs);padding:0 var(--btn-px-sm);border-radius:6px;">
          + Tambah KKTP</button>
      </div>`;

    const gradeHtml = `
      <div class="pai-grades-sub">
        <div class="pai-grades-sub-title">── Nilai Siswa ──</div>
        ${renderGradeTable(grades, tp.id)}
        <button type="button" class="btn-grade-add btn-sm"
          data-tp-id="${esc(tp.id)}"
          style="margin-top:var(--space-xs);font-size:var(--fs-caption);min-height:var(--btn-h-xs);padding:0 var(--btn-px-sm);border-radius:6px;">
          + Tambah Nilai</button>
      </div>`;

    return `
    <div class="pai-accordion-item" data-id="${esc(tp.id)}">
      <div class="pai-accordion-header">
        <div class="pai-accordion-summary">
          <span class="badge-tipe badge-tp">TP</span>
          <span class="pai-accordion-title">${esc(tp.judul)}</span>
          ${visBadges}
        </div>
        <div class="pai-accordion-actions">
          <button class="btn-sm btn-tp-edit" data-id="${esc(tp.id)}">Edit</button>
          <button class="btn-sm btn-danger btn-tp-delete" data-id="${esc(tp.id)}">Hapus</button>
          <span class="pai-chevron" aria-hidden="true">▼</span>
        </div>
      </div>
      <div class="pai-accordion-body" style="display:none;">
        ${kontenHtml}
        ${kktpHtml}
        ${gradeHtml}
      </div>
    </div>`;
  }

  // ─── Render — KKTP list ───────────────────────────────────────────────────

  function renderKktpList(kktpList) {
    if (kktpList.length === 0) {
      return '<p class="empty-state" style="font-size:var(--fs-caption);padding:var(--space-xs) 0;">Belum ada KKTP.</p>';
    }
    return kktpList.map(k => {
      const range = (k.batas_bawah != null && k.batas_atas != null)
        ? `<span style="font-size:var(--fs-badge);color:var(--text-muted);margin-left:var(--space-xs);">${k.batas_bawah}–${k.batas_atas}</span>`
        : '';
      return `
      <div class="pai-accordion-child" data-id="${esc(k.id)}"
        style="display:flex;align-items:center;justify-content:space-between;gap:var(--space-sm);
               padding:var(--space-xs) var(--space-sm);border-radius:var(--card-r);">
        <div style="display:flex;align-items:center;gap:var(--space-xs);flex:1;min-width:0;flex-wrap:wrap;">
          <span class="badge-tipe badge-kktp" style="flex-shrink:0;">KKTP</span>
          <span style="font-size:var(--fs-caption);color:var(--text-primary);">${esc(k.judul)}</span>
          ${range}
        </div>
        <div style="display:flex;gap:var(--space-xs);flex-shrink:0;">
          <button class="btn-sm btn-kktp-edit" data-id="${esc(k.id)}"
            style="font-size:var(--fs-caption);min-height:var(--btn-h-xs);padding:0 var(--btn-px-sm);">Edit</button>
          <button class="btn-sm btn-danger btn-kktp-delete" data-id="${esc(k.id)}"
            style="font-size:var(--fs-caption);min-height:var(--btn-h-xs);padding:0 var(--btn-px-sm);">Hapus</button>
        </div>
      </div>`;
    }).join('');
  }

  // ─── Render — Grade table + pagination ────────────────────────────────────

  function renderGradeTable(grades, tpId) {
    const key        = tpId || 'free';
    const total      = grades.length;
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const page       = Math.min(_gradePage[key] || 0, totalPages - 1);
    _gradePage[key]  = page;
    const slice      = grades.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

    if (total === 0) {
      return `<p class="empty-state" style="font-size:var(--fs-caption);padding:var(--space-xs) 0;">Belum ada nilai.</p>`;
    }

    const rows = slice.map(g => `
      <tr>
        <td>${esc(rosterName(g.student_id))}</td>
        <td>${g.nilai_angka != null ? esc(String(g.nilai_angka)) : '—'}</td>
        <td>${g.tipe_penilaian ? esc(g.tipe_penilaian) : '—'}</td>
        <td>${g.tanggal_penilaian ? fmtDate(g.tanggal_penilaian) : '—'}</td>
        <td class="sg-actions">
          <button class="btn-sm btn-grade-edit" data-id="${esc(g.id)}"
            style="font-size:var(--fs-caption);min-height:var(--btn-h-xs);padding:0 var(--btn-px-sm);">Edit</button>
          <button class="btn-sm btn-danger btn-grade-delete" data-id="${esc(g.id)}"
            style="font-size:var(--fs-caption);min-height:var(--btn-h-xs);padding:0 var(--btn-px-sm);">Hapus</button>
        </td>
      </tr>`).join('');

    const pagination = totalPages > 1 ? `
      <div style="display:flex;align-items:center;justify-content:space-between;
                  margin-top:var(--space-xs);font-size:var(--fs-caption);color:var(--text-secondary);">
        <button class="btn-sm btn-grade-prev" data-tp-id="${esc(key)}"
          style="font-size:var(--fs-caption);min-height:var(--btn-h-xs);padding:0 var(--btn-px-sm);"
          ${page === 0 ? 'disabled' : ''}>‹ Prev</button>
        <span>${page + 1} / ${totalPages}</span>
        <button class="btn-sm btn-grade-next" data-tp-id="${esc(key)}"
          style="font-size:var(--fs-caption);min-height:var(--btn-h-xs);padding:0 var(--btn-px-sm);"
          ${page >= totalPages - 1 ? 'disabled' : ''}>Next ›</button>
      </div>` : '';

    return `
      <div class="sg-table-wrap sg-grade-wrap" data-tp-id="${esc(key)}">
        <table class="sg-table">
          <thead><tr>
            <th>Nama Siswa</th><th>Nilai</th><th>Tipe</th><th>Tanggal</th><th>Aksi</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      ${pagination}`;
  }

  // ─── Render — Nilai Bebas ─────────────────────────────────────────────────

  function renderFreeGrades() {
    const listEl = document.getElementById('penilaian-grades-list');
    const addBtn = document.getElementById('btn-sg-add');
    if (!listEl) return;

    // Update heading "Nilai Siswa" → "Nilai Bebas" sekali
    const h2El = document.querySelector('#panel-penilaian .panel-header[data-panel="penilaian-grades-body"]');
    if (h2El && !h2El._relabeled) {
      const arrow = h2El.querySelector('.panel-collapse-arrow');
      h2El.textContent = 'Nilai Bebas ';
      if (arrow) h2El.appendChild(arrow);
      h2El._relabeled = true;
    }

    if (addBtn) {
      addBtn.textContent = '+ Tambah Nilai Bebas';
      addBtn.style.display = '';
    }

    const freeGrades = _grades.filter(g => !g.assessment_item_id);
    listEl.innerHTML = renderGradeTable(freeGrades, null);
  }

  // ─── Swipe ────────────────────────────────────────────────────────────────

  function attachAllSwipe() {
    document.querySelectorAll('.sg-grade-wrap[data-tp-id]').forEach(el => {
      attachSwipe(el, el.dataset.tpId);
    });
  }

  function attachSwipe(el, key) {
    if (!el || el._swipeAttached) return;
    el._swipeAttached = true;
    let sx = 0, sy = 0;
    el.addEventListener('touchstart', e => {
      sx = e.changedTouches[0].clientX;
      sy = e.changedTouches[0].clientY;
    }, { passive: true });
    el.addEventListener('touchend', e => {
      const dx = e.changedTouches[0].clientX - sx;
      const dy = e.changedTouches[0].clientY - sy;
      if (Math.abs(dx) <= Math.abs(dy)) return;
      if (Math.abs(dx) < 50) return;
      const grades = key === 'free'
        ? _grades.filter(g => !g.assessment_item_id)
        : _grades.filter(g => g.assessment_item_id === key);
      const totalPages = Math.max(1, Math.ceil(grades.length / PAGE_SIZE));
      const cur = _gradePage[key] || 0;
      if (dx < 0 && cur < totalPages - 1) { _gradePage[key] = cur + 1; renderAll(); }
      if (dx > 0 && cur > 0)              { _gradePage[key] = cur - 1; renderAll(); }
    }, { passive: true });
  }

  // ─── Helpers — form ───────────────────────────────────────────────────────

  function buildVisBadges(item) {
    return [
      item.is_visible_siswa ? '<span class="badge-vis">Siswa ✓</span>' : '',
      item.is_visible_ortu  ? '<span class="badge-vis">Ortu ✓</span>'  : '',
    ].filter(Boolean).join(' ');
  }

  function fRow(labelText, inputHtml, isOptional) {
    return `<label style="font-size:var(--fs-caption);color:var(--text-secondary);display:flex;flex-direction:column;gap:4px;">` +
      `${labelText}${isOptional ? ' <span class="opsional">(opsional)</span>' : ''}` +
      inputHtml + `</label>`;
  }

  function inp(id, type, attrs, val) {
    return `<input type="${type}" id="${id}" ${attrs}
      value="${val !== undefined ? esc(String(val)) : ''}"
      style="display:block;width:100%;box-sizing:border-box;">`;
  }

  function ta(id, rows, placeholder, val) {
    return `<textarea id="${id}" rows="${rows}" maxlength="2000"
      placeholder="${placeholder}"
      style="display:block;width:100%;box-sizing:border-box;resize:vertical;">${esc(val || '')}</textarea>`;
  }

  function visRow(idS, idO, checkedS, checkedO) {
    return `<div style="display:flex;gap:var(--space-lg);font-size:var(--fs-ui);flex-wrap:wrap;">
      <label><input type="checkbox" id="${idS}"${checkedS ? ' checked' : ''}> Tampilkan ke Siswa</label>
      <label><input type="checkbox" id="${idO}"${checkedO ? ' checked' : ''}> Tampilkan ke Ortu</label>
    </div>`;
  }

  // ─── Modal ────────────────────────────────────────────────────────────────

  function openModal(title, bodyHtml, onSave) {
    document.getElementById('assessment-modal')?.remove();

    const overlay = document.createElement('div');
    overlay.id        = 'assessment-modal';
    overlay.className = 'share-overlay';

    const box = document.createElement('div');
    box.className     = 'share-box';
    box.style.cssText = 'max-width:480px;width:100%;';

    box.innerHTML =
      `<p style="font-weight:var(--fw-semibold);font-size:var(--fs-h3);margin-bottom:var(--space-md);">${title}</p>` +
      `<div style="display:flex;flex-direction:column;gap:var(--space-sm);">${bodyHtml}</div>` +
      `<div class="modal-err" style="color:var(--danger);font-size:var(--fs-caption);min-height:1.4rem;margin-top:var(--space-xs);"></div>` +
      `<div style="display:flex;gap:var(--space-sm);justify-content:flex-end;margin-top:var(--space-md);">` +
        `<button type="button" class="modal-cancel">Batal</button>` +
        `<button type="button" class="modal-save">Simpan</button>` +
      `</div>`;

    overlay.appendChild(box);
    document.body.appendChild(overlay);

    const errEl     = box.querySelector('.modal-err');
    const saveBtn   = box.querySelector('.modal-save');
    const cancelBtn = box.querySelector('.modal-cancel');

    function close() { overlay.remove(); document.removeEventListener('keydown', onEsc); }
    function onEsc(e) { if (e.key === 'Escape') close(); }
    document.addEventListener('keydown', onEsc);
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
    cancelBtn.addEventListener('click', close);

    saveBtn.addEventListener('click', async () => {
      errEl.textContent   = '';
      saveBtn.disabled    = true;
      saveBtn.textContent = 'Menyimpan…';
      try {
        await onSave(box, errEl);
        close();
      } catch (err) {
        if (err.message) errEl.textContent = '✗ ' + err.message;
        saveBtn.disabled    = false;
        saveBtn.textContent = 'Simpan';
      }
    });

    return box;
  }

  // ─── Form CP ─────────────────────────────────────────────────────────────

  function openCpForm(cp) {
    const isEdit = !!cp;
    openModal(
      isEdit ? 'Edit CP' : 'Tambah CP',
      fRow('Deskripsi Capaian Pembelajaran', ta('cp-f-konten', 4, 'Deskripsi Capaian Pembelajaran…', isEdit ? cp.konten : ''), true) +
      visRow('cp-f-vis-siswa', 'cp-f-vis-ortu', isEdit && cp.is_visible_siswa, isEdit && cp.is_visible_ortu),
      async (b, errEl) => {
        const konten = b.querySelector('#cp-f-konten').value.trim() || null;
        const visS   = b.querySelector('#cp-f-vis-siswa').checked;
        const visO   = b.querySelector('#cp-f-vis-ortu').checked;
        const payload = { judul: 'CP', tipe: 'CP', konten, urutan: 1,
                          is_visible_siswa: visS, is_visible_ortu: visO, parent_id: null };
        if (isEdit) { await updateItem(cp.id, payload); }
        else        { await saveItem(payload); }
        await loadAll(); renderAll();
      }
    );
    setTimeout(() => document.getElementById('cp-f-konten')?.focus(), 50);
  }

  // ─── Form TP ─────────────────────────────────────────────────────────────

  function openTpForm(tp) {
    const isEdit    = !!tp;
    const nextUrutan = _items.filter(i => i.tipe === 'TP' && !i.parent_id).length + 1;
    openModal(
      isEdit ? 'Edit TP' : 'Tambah TP',
      fRow('Judul *', inp('tp-f-judul', 'text', 'placeholder="Judul Tujuan Pembelajaran" maxlength="200"', isEdit ? tp.judul : ''), false) +
      fRow('Konten', ta('tp-f-konten', 3, 'Isi teks bebas…', isEdit ? tp.konten : ''), true) +
      visRow('tp-f-vis-siswa', 'tp-f-vis-ortu', isEdit && tp.is_visible_siswa, isEdit && tp.is_visible_ortu),
      async (b, errEl) => {
        const judul  = b.querySelector('#tp-f-judul').value.trim();
        const konten = b.querySelector('#tp-f-konten').value.trim() || null;
        const visS   = b.querySelector('#tp-f-vis-siswa').checked;
        const visO   = b.querySelector('#tp-f-vis-ortu').checked;
        if (!judul) { errEl.textContent = 'Judul tidak boleh kosong.'; throw new Error(''); }
        const payload = { judul, tipe: 'TP', konten, urutan: isEdit ? tp.urutan : nextUrutan,
                          is_visible_siswa: visS, is_visible_ortu: visO, parent_id: null };
        if (isEdit) { await updateItem(tp.id, payload); }
        else        { await saveItem(payload); }
        await loadAll(); renderAll();
      }
    );
    setTimeout(() => document.getElementById('tp-f-judul')?.focus(), 50);
  }

  // ─── Form KKTP ────────────────────────────────────────────────────────────

  function openKktpForm(kktp, parentTpId) {
    const isEdit = !!kktp;
    openModal(
      isEdit ? 'Edit KKTP' : 'Tambah KKTP',
      fRow('Deskripsi / Predikat *',
        inp('kktp-f-judul', 'text', 'placeholder="cth: Sangat Baik, Baik, Cukup" maxlength="200"',
            isEdit ? kktp.judul : ''), false) +
      `<div style="display:flex;gap:var(--space-sm);">` +
        fRow('Batas Bawah',
          inp('kktp-f-bawah', 'number', 'min="0" max="100" step="0.01" placeholder="0–100"',
              isEdit && kktp.batas_bawah != null ? kktp.batas_bawah : ''), true) +
        fRow('Batas Atas',
          inp('kktp-f-atas', 'number', 'min="0" max="100" step="0.01" placeholder="0–100"',
              isEdit && kktp.batas_atas != null ? kktp.batas_atas : ''), true) +
      `</div>`,
      async (b, errEl) => {
        const judul    = b.querySelector('#kktp-f-judul').value.trim();
        const bawahRaw = b.querySelector('#kktp-f-bawah').value.trim();
        const atasRaw  = b.querySelector('#kktp-f-atas').value.trim();
        if (!judul) { errEl.textContent = 'Deskripsi tidak boleh kosong.'; throw new Error(''); }

        let batas_bawah = null, batas_atas = null;
        if (bawahRaw !== '') batas_bawah = parseFloat(bawahRaw);
        if (atasRaw  !== '') batas_atas  = parseFloat(atasRaw);
        if (batas_bawah != null && batas_atas != null && batas_atas <= batas_bawah) {
          errEl.textContent = 'Batas atas harus lebih besar dari batas bawah.'; throw new Error('');
        }

        const nextUrutan = _items.filter(i => i.parent_id === parentTpId).length + 1;
        const payload = { judul, tipe: 'KKTP', konten: null, urutan: isEdit ? kktp.urutan : nextUrutan,
                          parent_id: parentTpId, batas_bawah, batas_atas,
                          is_visible_siswa: false, is_visible_ortu: false };
        if (isEdit) { await updateItem(kktp.id, payload); }
        else        { await saveItem(payload); }
        await loadAll(); renderAll();
      }
    );
    setTimeout(() => document.getElementById('kktp-f-judul')?.focus(), 50);
  }

  // ─── Form Nilai ───────────────────────────────────────────────────────────

  function gradeFormHtml(grade) {
    const today = new Date().toISOString().split('T')[0];
    return fRow('Siswa *',
      `<select id="sg-f-student" style="display:block;width:100%;box-sizing:border-box;"${grade ? ' disabled' : ''}>
        <option value="">— Pilih siswa —</option>
        ${rosterSelectOpts(grade ? grade.student_id : '')}
      </select>`, false) +
      fRow('Judul Penilaian *', inp('sg-f-judul', 'text',
        'placeholder="cth: UTS, TP1, Proyek" maxlength="200"', grade ? grade.judul : ''), false) +
      fRow('Nilai (0–100)', inp('sg-f-nilai', 'number', 'min="0" max="100" step="0.01" placeholder="Opsional"',
        grade && grade.nilai_angka != null ? grade.nilai_angka : ''), true) +
      fRow('Tipe Penilaian', inp('sg-f-tipe', 'text',
        'placeholder="cth: Formatif, Sumatif" maxlength="100"',
        grade && grade.tipe_penilaian ? grade.tipe_penilaian : ''), true) +
      fRow('Bobot (%)', inp('sg-f-bobot', 'number',
        'min="0" max="100" step="0.01" placeholder="0–100"',
        grade && grade.bobot != null ? grade.bobot : ''), true) +
      fRow('Tanggal', inp('sg-f-tanggal', 'date', '',
        grade && grade.tanggal_penilaian ? grade.tanggal_penilaian : today), true) +
      fRow('Deskripsi', ta('sg-f-deskripsi', 2, 'Catatan naratif…',
        grade && grade.deskripsi ? grade.deskripsi : ''), true) +
      `<label style="font-size:var(--fs-ui);">
        <input type="checkbox" id="sg-f-published"${grade && grade.is_published ? ' checked' : ''}>
        Publikasikan ke siswa &amp; ortu
      </label>`;
  }

  function collectGrade(b, errEl, existingGrade) {
    const studentId = existingGrade
      ? existingGrade.student_id
      : b.querySelector('#sg-f-student').value;
    const judul         = b.querySelector('#sg-f-judul').value.trim();
    const nilaiRaw      = b.querySelector('#sg-f-nilai').value.trim();
    const tipePenilaian = b.querySelector('#sg-f-tipe').value.trim() || null;
    const tanggalRaw    = b.querySelector('#sg-f-tanggal').value.trim();
    const deskripsi     = b.querySelector('#sg-f-deskripsi').value.trim() || null;
    const published     = b.querySelector('#sg-f-published').checked;

    if (!studentId) { errEl.textContent = 'Pilih siswa terlebih dahulu.'; throw new Error(''); }
    if (!judul)     { errEl.textContent = 'Judul penilaian tidak boleh kosong.'; throw new Error(''); }

    let nilai_angka = null;
    if (nilaiRaw !== '') {
      nilai_angka = parseFloat(nilaiRaw);
      if (isNaN(nilai_angka) || nilai_angka < 0 || nilai_angka > 100) {
        errEl.textContent = 'Nilai harus antara 0 dan 100.'; throw new Error('');
      }
    }

    const bobotRaw = b.querySelector('#sg-f-bobot').value.trim();
    const bobot    = bobotRaw !== '' ? parseFloat(bobotRaw) : null;

    return { student_id: studentId, judul, nilai_angka,
             tipe_penilaian: tipePenilaian, bobot,
             tanggal_penilaian: tanggalRaw || null,
             deskripsi, is_published: published };
  }

  function openGradeForm(grade, tpId) {
    const isEdit = !!grade;
    openModal(
      isEdit ? 'Edit Nilai Siswa' : 'Tambah Nilai Siswa',
      gradeFormHtml(grade),
      async (b, errEl) => {
        const base    = collectGrade(b, errEl, grade);
        const payload = { ...base, assessment_item_id: tpId };
        if (isEdit) { await updateGrade(grade.id, payload); }
        else        { await saveGrade(payload); }
        await loadAll(); renderAll();
      }
    );
    setTimeout(() => (grade ? document.getElementById('sg-f-judul') : document.getElementById('sg-f-student'))?.focus(), 50);
  }

  function openFreeGradeForm(grade) {
    const isEdit = !!grade;
    openModal(
      isEdit ? 'Edit Nilai Bebas' : 'Tambah Nilai Bebas',
      gradeFormHtml(grade),
      async (b, errEl) => {
        const base    = collectGrade(b, errEl, grade);
        const payload = { ...base, assessment_item_id: null };
        if (isEdit) { await updateGrade(grade.id, payload); }
        else        { await saveGrade(payload); }
        await loadAll(); renderAll();
      }
    );
    setTimeout(() => (grade ? document.getElementById('sg-f-judul') : document.getElementById('sg-f-student'))?.focus(), 50);
  }

  // ─── Delete ───────────────────────────────────────────────────────────────

  async function confirmDeleteItem(id) {
    const item = _items.find(i => i.id === id);
    const msg  = (item && item.tipe === 'TP')
      ? 'Hapus TP ini? KKTP di bawahnya akan ikut terhapus.'
      : 'Hapus item ini? Tindakan ini tidak bisa dibatalkan.';
    if (!window.confirm(msg)) return;
    try {
      await deleteItem(id);
      await loadAll(); renderAll();
    } catch (err) {
      alert('Gagal hapus: ' + (err.message || 'Error tidak diketahui.'));
    }
  }

  async function confirmDeleteGrade(id) {
    if (!window.confirm('Hapus data nilai ini? Tindakan ini tidak bisa dibatalkan.')) return;
    try {
      await deleteGrade(id);
      await loadAll(); renderAll();
    } catch (err) {
      alert('Gagal hapus: ' + (err.message || 'Error tidak diketahui.'));
    }
  }

  // ─── Collapse panel-level ─────────────────────────────────────────────────

  function initCollapse() {
    const headers = document.querySelectorAll('#panel-penilaian h2.panel-header');
    headers.forEach((h2, idx) => {
      const body = document.getElementById(h2.dataset.panel);
      if (!body) return;
      if (idx === 0) { h2.classList.add('open'); body.style.display = ''; }
      else           { h2.classList.remove('open'); body.style.display = 'none'; }
      h2.addEventListener('click', () => {
        const isOpen = h2.classList.contains('open');
        headers.forEach(hh => {
          hh.classList.remove('open');
          const b = document.getElementById(hh.dataset.panel);
          if (b) b.style.display = 'none';
        });
        if (!isOpen) { h2.classList.add('open'); body.style.display = ''; }
      });
    });
  }

  // ─── Filter ───────────────────────────────────────────────────────────────

  function initFilter() {
    const yearInp   = document.getElementById('pai-year');
    const semSel    = document.getElementById('pai-semester');
    const filterBtn = document.getElementById('btn-pai-filter');
    if (filterBtn) filterBtn.remove();

    const filterRow = document.getElementById('penilaian-filter-row');
    let errEl = document.getElementById('pai-filter-error');
    if (!errEl && filterRow) {
      errEl = document.createElement('div');
      errEl.id = 'pai-filter-error';
      errEl.style.cssText = 'color:var(--danger);font-size:var(--fs-caption);min-height:1.2rem;margin-top:var(--space-xs);';
      filterRow.insertAdjacentElement('afterend', errEl);
    }

    const now          = new Date();
    const y            = now.getFullYear();
    const defaultYear  = now.getMonth() >= 6 ? `${y}/${y + 1}` : `${y - 1}/${y}`;
    _year     = defaultYear;
    _semester = now.getMonth() >= 6 ? 1 : 2;
    if (yearInp) yearInp.value = defaultYear;
    if (semSel)  semSel.value  = String(_semester);

    async function applyFilter() {
      const yv = yearInp ? yearInp.value.trim() : '';
      const sv = semSel  ? parseInt(semSel.value, 10) : 1;
      if (!YEAR_RE.test(yv)) {
        if (errEl) errEl.textContent = 'Format tidak valid. Contoh: 2025/2026';
        return;
      }
      if (errEl) errEl.textContent = '';
      _year     = yv;
      _semester = sv;
      await loadAll(); renderAll();
    }

    if (yearInp) { yearInp.addEventListener('change', applyFilter); yearInp.addEventListener('blur', applyFilter); }
    if (semSel)  semSel.addEventListener('change', applyFilter);
  }

  // ─── Event delegation ─────────────────────────────────────────────────────

  function initDelegation() {
    const itemsList  = document.getElementById('penilaian-items-list');
    const gradesList = document.getElementById('penilaian-grades-list');
    const freeAddBtn = document.getElementById('btn-sg-add');

    if (freeAddBtn) freeAddBtn.addEventListener('click', () => openFreeGradeForm(null));

    if (itemsList) {
      itemsList.addEventListener('click', e => {
        // Accordion header toggle
        const header = e.target.closest('.pai-accordion-header');
        if (header && !e.target.closest('button')) {
          const accItem = header.closest('.pai-accordion-item');
          const body    = accItem?.querySelector(':scope > .pai-accordion-body');
          const chev    = header.querySelector('.pai-chevron');
          if (body) {
            const open = body.style.display === 'block';
            body.style.display = open ? 'none' : 'block';
            if (chev) chev.style.transform = open ? '' : 'rotate(180deg)';
          }
          return;
        }

        // CP
        const cpAdd = e.target.closest('.btn-cp-add');
        if (cpAdd) { openCpForm(null); return; }
        const cpEdit = e.target.closest('.btn-cp-edit');
        if (cpEdit) { openCpForm(_items.find(i => i.id === cpEdit.dataset.id)); return; }
        const cpDel = e.target.closest('.btn-cp-delete');
        if (cpDel)  { confirmDeleteItem(cpDel.dataset.id); return; }

        // TP
        const tpAdd = e.target.closest('.btn-tp-add');
        if (tpAdd) { openTpForm(null); return; }
        const tpEdit = e.target.closest('.btn-tp-edit');
        if (tpEdit) { openTpForm(_items.find(i => i.id === tpEdit.dataset.id)); return; }
        const tpDel = e.target.closest('.btn-tp-delete');
        if (tpDel)  { confirmDeleteItem(tpDel.dataset.id); return; }

        // KKTP
        const kktpAdd = e.target.closest('.btn-kktp-add');
        if (kktpAdd) { openKktpForm(null, kktpAdd.dataset.tpId); return; }
        const kktpEdit = e.target.closest('.btn-kktp-edit');
        if (kktpEdit) { openKktpForm(_items.find(i => i.id === kktpEdit.dataset.id),
                                     _items.find(i => i.id === kktpEdit.dataset.id)?.parent_id); return; }
        const kktpDel = e.target.closest('.btn-kktp-delete');
        if (kktpDel) { confirmDeleteItem(kktpDel.dataset.id); return; }

        // Grade dalam TP
        const gradeAdd = e.target.closest('.btn-grade-add');
        if (gradeAdd) { openGradeForm(null, gradeAdd.dataset.tpId); return; }
        const gradeEdit = e.target.closest('.btn-grade-edit');
        if (gradeEdit) {
          const g = _grades.find(gr => gr.id === gradeEdit.dataset.id);
          if (g) openGradeForm(g, g.assessment_item_id); return;
        }
        const gradeDel = e.target.closest('.btn-grade-delete');
        if (gradeDel) { confirmDeleteGrade(gradeDel.dataset.id); return; }

        // Pagination dalam TP
        const prevBtn = e.target.closest('.btn-grade-prev');
        if (prevBtn) {
          const k = prevBtn.dataset.tpId;
          if ((_gradePage[k] || 0) > 0) { _gradePage[k] = (_gradePage[k] || 0) - 1; renderAll(); }
          return;
        }
        const nextBtn = e.target.closest('.btn-grade-next');
        if (nextBtn) {
          const k      = nextBtn.dataset.tpId;
          const grades = k === 'free'
            ? _grades.filter(g => !g.assessment_item_id)
            : _grades.filter(g => g.assessment_item_id === k);
          const tp = Math.ceil(grades.length / PAGE_SIZE);
          if ((_gradePage[k] || 0) < tp - 1) { _gradePage[k] = (_gradePage[k] || 0) + 1; renderAll(); }
          return;
        }
      });
    }

    if (gradesList) {
      gradesList.addEventListener('click', e => {
        const gradeEdit = e.target.closest('.btn-grade-edit');
        if (gradeEdit) { openFreeGradeForm(_grades.find(gr => gr.id === gradeEdit.dataset.id)); return; }
        const gradeDel  = e.target.closest('.btn-grade-delete');
        if (gradeDel)  { confirmDeleteGrade(gradeDel.dataset.id); return; }
        const prevBtn = e.target.closest('.btn-grade-prev');
        if (prevBtn) {
          if ((_gradePage['free'] || 0) > 0) { _gradePage['free'] = (_gradePage['free'] || 0) - 1; renderAll(); }
          return;
        }
        const nextBtn = e.target.closest('.btn-grade-next');
        if (nextBtn) {
          const total = _grades.filter(g => !g.assessment_item_id).length;
          const tp    = Math.ceil(total / PAGE_SIZE);
          if ((_gradePage['free'] || 0) < tp - 1) { _gradePage['free'] = (_gradePage['free'] || 0) + 1; renderAll(); }
          return;
        }
      });
    }
  }

  // ─── Init ─────────────────────────────────────────────────────────────────

  async function initAssessmentTab(cId, tId) {
    classroomId = cId;
    teacherId   = tId;
    initFilter();
    await Promise.all([loadRoster(), loadAll()]);
    renderAll();
    initCollapse();
    initDelegation();
    _loaded = true;
  }

  // ─── DOMContentLoaded ─────────────────────────────────────────────────────

  window.addEventListener('DOMContentLoaded', async function () {
    const tabSiswa      = document.getElementById('tab-siswa');
    const tabJadwal     = document.getElementById('tab-jadwal');
    const tabCatatan    = document.getElementById('tab-catatan');
    const tabPenilaian  = document.getElementById('tab-penilaian');
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

    [tabSiswa, tabJadwal, tabCatatan].forEach(t => {
      if (!t) return;
      t.addEventListener('click', () => {
        tabPenilaian.classList.remove('active');
        panelPenilaian.style.display = 'none';
      });
    });

    const cId = new URLSearchParams(window.location.search).get('id');
    if (cId) {
      const savedTab = localStorage.getItem('sip_tab_' + cId);
      if (savedTab === 'penilaian') tabPenilaian.click();
    }
  });

}());
