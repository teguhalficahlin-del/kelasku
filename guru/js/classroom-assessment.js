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

  const YEAR_RE = /^\d{4}\/\d{4}$/;

  // ─── Helpers ────────────────────────────────────────────────────────────────

  function esc(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ─── API — assessment_items ─────────────────────────────────────────────────

  async function loadItems() {
    const { data, error } = await client
      .from('assessment_items')
      .select('id, judul, tipe, konten, urutan, parent_id, batas_bawah, batas_atas, is_visible_siswa, is_visible_ortu, is_active')
      .eq('classroom_id', classroomId)
      .eq('academic_year', _year)
      .eq('semester', _semester)
      .order('urutan').order('judul');
    _items = error ? [] : (data || []);
  }

  async function saveItem(payload) {
    const { data, error } = await client
      .from('assessment_items')
      .insert({ ...payload, classroom_id: classroomId, teacher_id: teacherId,
                academic_year: _year, semester: _semester })
      .select('id')
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

  // ─── API — student_grades ───────────────────────────────────────────────────

  async function loadGrades() {
    const { data, error } = await client
      .from('student_grades')
      .select('id, student_id, judul, nilai_angka, deskripsi, is_published, assessment_item_id, tanggal_penilaian, tipe_penilaian, bobot')
      .eq('classroom_id', classroomId)
      .eq('academic_year', _year)
      .eq('semester', _semester)
      .order('judul').order('student_id');
    _grades = error ? [] : (data || []);
  }

  async function saveGrade(payload) {
    const { data, error } = await client
      .from('student_grades')
      .insert({ ...payload, classroom_id: classroomId, teacher_id: teacherId,
                academic_year: _year, semester: _semester })
      .select('id')
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

  // ─── API — roster ───────────────────────────────────────────────────────────

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

  // ─── Render ─────────────────────────────────────────────────────────────────

  function renderAll() {
    renderPerencanaan();
    renderPelaksanaan();
  }

  function renderPerencanaan() {
    const body = document.getElementById('pai-perencanaan-body');
    if (!body) return;

    const cp    = _items.find(i => i.tipe === 'CP' && !i.parent_id) || null;
    const tps   = _items
      .filter(i => i.tipe === 'TP' && !i.parent_id)
      .sort((a, b) => (a.urutan ?? 999) - (b.urutan ?? 999));
    const kktps = _items.filter(i => i.tipe === 'KKTP' && i.parent_id);

    body.innerHTML =
      `<div class="penilaian-filter-row" id="penilaian-filter-row">
  <input id="pai-year" type="text" placeholder="2025/2026"
    value="${esc(_year)}" maxlength="9" style="max-width:140px;">
  <select id="pai-semester">
    <option value="1"${_semester === 1 ? ' selected' : ''}>Semester 1</option>
    <option value="2"${_semester === 2 ? ' selected' : ''}>Semester 2</option>
  </select>
</div>
<div id="pai-filter-error"
  style="color:var(--danger);font-size:var(--fs-caption);min-height:1.2rem;margin-top:var(--space-xs);"></div>
${renderCpSubsection(cp)}
${renderTpSubsection(tps, kktps)}`;
  }

  function renderCpSubsection(cp) {
    let bodyHtml;
    if (!cp) {
      bodyHtml = `
<p class="pai-placeholder" style="padding:var(--space-md) 0;text-align:left;">Belum ada Capaian Pembelajaran.</p>
<button class="btn-sm" data-action="cp-add">+ Tambah Capaian Pembelajaran</button>`;
    } else {
      const visBadges = [
        cp.is_visible_siswa ? '<span class="badge-tipe badge-tp">Siswa ✓</span>' : '',
        cp.is_visible_ortu  ? '<span class="badge-tipe badge-kktp">Ortu ✓</span>'  : ''
      ].filter(Boolean).join(' ');
      bodyHtml = `
<div class="pai-cp-preview">
  <p class="pai-cp-text pai-cp-clamped" id="pai-cp-text">${esc(cp.konten || '—')}</p>
  ${cp.konten && cp.konten.length > 100 ? `<button class="pai-cp-toggle" id="pai-cp-toggle">Selengkapnya</button>` : ''}
</div>
${visBadges ? `<div style="margin:var(--space-xs) 0;">${visBadges}</div>` : ''}
<div class="pai-item-actions">
  <button class="btn-sm" data-action="cp-edit" data-id="${esc(cp.id)}">Edit</button>
  <button class="btn-sm btn-sm-danger" data-action="cp-del" data-id="${esc(cp.id)}">Hapus</button>
</div>`;
    }
    return `
<div class="pai-subsec">
  <div class="pai-subsec-header">
    <span class="pai-subsec-title">Capaian Pembelajaran</span>
    <span class="pai-chevron">▼</span>
  </div>
  <div class="pai-subsec-body" id="pai-cp-subsec-body">${bodyHtml}</div>
</div>`;
  }

  function renderTpSubsection(tps, kktps) {
    const count   = tps.length;
    const tpItems = tps.map(tp => {
      const tpKktps = kktps
        .filter(k => k.parent_id === tp.id)
        .sort((a, b) => (a.urutan ?? 999) - (b.urutan ?? 999));
      return renderTpItem(tp, tpKktps);
    }).join('');

    return `
<div class="pai-subsec">
  <div class="pai-subsec-header">
    <span class="pai-subsec-title">Tujuan Pembelajaran${count > 0 ? ' (' + count + ')' : ''}</span>
    <span class="pai-chevron">▼</span>
  </div>
  <div class="pai-subsec-body">
    ${count === 0
      ? '<p class="pai-placeholder" style="padding:var(--space-md) 0;text-align:left;">Belum ada Tujuan Pembelajaran.</p>'
      : tpItems}
    <button class="btn-sm" data-action="tp-add"
      style="margin-top:var(--space-sm);">+ Tambah Tujuan Pembelajaran</button>
  </div>
</div>`;
  }

  function renderTpItem(tp, kktpList) {
    const kktpRows = kktpList.map(k => {
      const rangeParts = [];
      if (k.batas_bawah != null) rangeParts.push(k.batas_bawah);
      if (k.batas_atas  != null) rangeParts.push(k.batas_atas);
      const range = rangeParts.length === 2
        ? `<span class="pai-kktp-range">${rangeParts[0]}–${rangeParts[1]}</span>`
        : '';
      return `
<div class="pai-kktp-row">
  <span class="pai-kktp-bullet">•</span>
  <span style="flex:1;min-width:0;word-break:break-word;">${esc(k.judul)}</span>
  ${range}
  <button class="btn-sm btn-sm-danger" data-action="kktp-del" data-id="${esc(k.id)}"
    style="font-size:var(--fs-badge);min-height:var(--btn-h-xs);padding:0 var(--btn-px-sm);flex-shrink:0;">Hapus</button>
</div>`;
    }).join('');

    const visText = [
      tp.is_visible_siswa ? 'Siswa' : '',
      tp.is_visible_ortu  ? 'Ortu'  : ''
    ].filter(Boolean).join(', ');

    return `
<div class="pai-tp-row">
  <div class="pai-tp-left">
    <div class="pai-tp-headline">
      <button class="pai-tp-toggle" data-action="tp-toggle"
        data-tp-id="${esc(tp.id)}" data-count="${kktpList.length}"
        title="Lihat/tutup KKTP">▶</button>
      <span class="pai-tp-title">${esc(tp.judul)}</span>
      ${visText ? `<span class="pai-tp-vis">👁 ${esc(visText)}</span>` : ''}
      <span class="pai-tp-count">${kktpList.length} KKTP</span>
    </div>
    <div class="pai-kktp-list" id="pai-kktp-list-${esc(tp.id)}" style="display:none">
      ${kktpRows || '<p style="font-size:var(--fs-caption);color:var(--text-muted);margin:var(--space-xs) 0;">Belum ada KKTP.</p>'}
      <button class="btn-sm" data-action="kktp-add" data-tp-id="${esc(tp.id)}"
        style="font-size:var(--fs-caption);min-height:var(--btn-h-xs);padding:0 var(--btn-px-sm);margin-top:var(--space-xs);">+ Tambah KKTP</button>
    </div>
  </div>
  <div class="pai-item-actions" style="flex-shrink:0;align-self:flex-start;">
    <button class="btn-sm" data-action="tp-edit" data-id="${esc(tp.id)}">Edit</button>
    <button class="btn-sm btn-sm-danger" data-action="tp-del" data-id="${esc(tp.id)}">Hapus</button>
  </div>
</div>`;
  }

  function renderPelaksanaan() {
    const body = document.getElementById('pai-pelaksanaan-body');
    if (!body) return;
    body.innerHTML =
      '<p class="pai-placeholder">🚧 Segera hadir — Fitur Pelaksanaan Penilaian sedang dalam pengembangan.</p>';
  }

  // ─── Modal helper ───────────────────────────────────────────────────────────

  function openModal({ title, bodyHtml, onSave }) {
    document.getElementById('assessment-modal')?.remove();

    const overlay = document.createElement('div');
    overlay.id        = 'assessment-modal';
    overlay.className = 'share-overlay';
    overlay.style.cssText = 'align-items:flex-end;padding:0;';
    overlay.innerHTML = `
<div class="modal-box" style="width:100%;max-width:100%;max-height:92vh;overflow-y:auto;border-radius:var(--card-r) var(--card-r) 0 0;padding:var(--card-p);background:var(--bg-surface);border:1px solid var(--border);border-bottom:none;">
  <h3>${esc(title)}</h3>
  <div class="modal-body">${bodyHtml}</div>
  <div id="pai-modal-err"
    style="color:var(--danger);font-size:var(--fs-caption);min-height:1.2rem;margin:.375rem 0;"></div>
  <div class="modal-actions">
    <button type="button" class="modal-cancel">Batal</button>
    <button type="button" class="modal-save">Simpan</button>
  </div>
</div>`;

    function close() {
      overlay.remove();
      document.removeEventListener('keydown', onEsc);
    }
    function onEsc(e) { if (e.key === 'Escape') close(); }

    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
    overlay.querySelector('.modal-cancel').addEventListener('click', close);
    document.addEventListener('keydown', onEsc);

    const saveBtn = overlay.querySelector('.modal-save');
    saveBtn.addEventListener('click', async () => {
      const errEl = overlay.querySelector('#pai-modal-err');
      errEl.textContent = '';
      saveBtn.disabled    = true;
      saveBtn.textContent = 'Menyimpan…';
      try {
        await onSave(overlay, close);
      } catch (err) {
        errEl.textContent   = 'Gagal: ' + (err.message || 'Error tidak diketahui.');
        saveBtn.disabled    = false;
        saveBtn.textContent = 'Simpan';
      }
    });

    document.body.appendChild(overlay);
    overlay.querySelector('textarea, input')?.focus();
  }

  // ─── Modal CP ───────────────────────────────────────────────────────────────

  function openCpModal(cp) {
    openModal({
      title: cp ? 'Edit Capaian Pembelajaran' : 'Tambah Capaian Pembelajaran',
      bodyHtml: `
<label>Konten <span style="color:var(--danger);">*</span></label>
<textarea id="pai-modal-konten" rows="4" maxlength="2000"
  placeholder="Deskripsi capaian pembelajaran…">${esc(cp?.konten || '')}</textarea>
<label class="checkbox-label">
  <input type="checkbox" id="pai-modal-vis-siswa"${cp?.is_visible_siswa ? ' checked' : ''}>
  Tampilkan ke Siswa
</label>
<label class="checkbox-label">
  <input type="checkbox" id="pai-modal-vis-ortu"${cp?.is_visible_ortu ? ' checked' : ''}>
  Tampilkan ke Ortu
</label>`,
      onSave: async (overlay, close) => {
        const konten = overlay.querySelector('#pai-modal-konten').value.trim();
        if (!konten) throw new Error('Konten CP tidak boleh kosong.');
        const vis_siswa = overlay.querySelector('#pai-modal-vis-siswa').checked;
        const vis_ortu  = overlay.querySelector('#pai-modal-vis-ortu').checked;
        if (cp) {
          await updateItem(cp.id, { konten, is_visible_siswa: vis_siswa, is_visible_ortu: vis_ortu });
        } else {
          await saveItem({ judul: 'CP', tipe: 'CP', konten, urutan: 1,
                           parent_id: null, is_visible_siswa: vis_siswa, is_visible_ortu: vis_ortu });
        }
        await loadAll();
        renderPerencanaan();
        close();
      }
    });
  }

  // ─── Modal TP ───────────────────────────────────────────────────────────────

  function openTpModal(tp) {
    const nextUrutan = tp
      ? (tp.urutan ?? 1)
      : (_items.filter(i => i.tipe === 'TP' && !i.parent_id)
               .reduce((m, i) => Math.max(m, i.urutan ?? 0), 0) + 1);

    openModal({
      title: tp ? 'Edit Tujuan Pembelajaran' : 'Tambah Tujuan Pembelajaran',
      bodyHtml: `
<label>Judul <span style="color:var(--danger);">*</span></label>
<input type="text" id="pai-modal-judul"
  value="${esc(tp?.judul || '')}" maxlength="200"
  placeholder="Judul tujuan pembelajaran…">
<label>Konten / Deskripsi
  <span style="font-weight:var(--fw-regular);color:var(--text-muted);">(opsional)</span>
</label>
<textarea id="pai-modal-konten" rows="3" maxlength="2000"
  placeholder="Deskripsi tambahan…">${esc(tp?.konten || '')}</textarea>
<label class="checkbox-label">
  <input type="checkbox" id="pai-modal-vis-siswa"${tp?.is_visible_siswa ? ' checked' : ''}>
  Tampilkan ke Siswa
</label>
<label class="checkbox-label">
  <input type="checkbox" id="pai-modal-vis-ortu"${tp?.is_visible_ortu ? ' checked' : ''}>
  Tampilkan ke Ortu
</label>`,
      onSave: async (overlay, close) => {
        const judul = overlay.querySelector('#pai-modal-judul').value.trim();
        if (!judul) throw new Error('Judul TP tidak boleh kosong.');
        const konten    = overlay.querySelector('#pai-modal-konten').value.trim() || null;
        const vis_siswa = overlay.querySelector('#pai-modal-vis-siswa').checked;
        const vis_ortu  = overlay.querySelector('#pai-modal-vis-ortu').checked;
        if (tp) {
          await updateItem(tp.id, { judul, konten, is_visible_siswa: vis_siswa, is_visible_ortu: vis_ortu });
        } else {
          await saveItem({ judul, tipe: 'TP', konten, urutan: nextUrutan,
                           parent_id: null, is_visible_siswa: vis_siswa, is_visible_ortu: vis_ortu });
        }
        await loadAll();
        renderPerencanaan();
        close();
      }
    });
  }

  // ─── Modal KKTP ─────────────────────────────────────────────────────────────

  function openKktpModal(kktp, parentTpId) {
    const tpItem     = _items.find(i => i.id === parentTpId);
    const nextUrutan = kktp
      ? (kktp.urutan ?? 1)
      : (_items.filter(i => i.tipe === 'KKTP' && i.parent_id === parentTpId)
               .reduce((m, i) => Math.max(m, i.urutan ?? 0), 0) + 1);

    openModal({
      title: kktp
        ? 'Edit KKTP'
        : ('Tambah KKTP' + (tpItem ? ' — ' + tpItem.judul : '')),
      bodyHtml: `
<label>Predikat / Deskripsi <span style="color:var(--danger);">*</span></label>
<input type="text" id="pai-modal-judul"
  value="${esc(kktp?.judul || '')}" maxlength="200"
  placeholder="Contoh: Sangat Baik">
<label>Batas Bawah
  <span style="font-weight:var(--fw-regular);color:var(--text-muted);">(0–100, opsional)</span>
</label>
<input type="number" id="pai-modal-bawah"
  value="${kktp?.batas_bawah != null ? esc(String(kktp.batas_bawah)) : ''}"
  min="0" max="100" step="0.01" placeholder="0">
<label>Batas Atas
  <span style="font-weight:var(--fw-regular);color:var(--text-muted);">(0–100, opsional)</span>
</label>
<input type="number" id="pai-modal-atas"
  value="${kktp?.batas_atas != null ? esc(String(kktp.batas_atas)) : ''}"
  min="0" max="100" step="0.01" placeholder="100">`,
      onSave: async (overlay, close) => {
        const judul    = overlay.querySelector('#pai-modal-judul').value.trim();
        if (!judul) throw new Error('Predikat/deskripsi tidak boleh kosong.');
        const bawahRaw    = overlay.querySelector('#pai-modal-bawah').value.trim();
        const atasRaw     = overlay.querySelector('#pai-modal-atas').value.trim();
        const batas_bawah = bawahRaw !== '' ? parseFloat(bawahRaw) : null;
        const batas_atas  = atasRaw  !== '' ? parseFloat(atasRaw)  : null;
        if (batas_bawah != null && batas_atas != null && batas_atas <= batas_bawah) {
          throw new Error('Batas atas harus lebih besar dari batas bawah.');
        }
        if (kktp) {
          await updateItem(kktp.id, { judul, batas_bawah, batas_atas });
        } else {
          await saveItem({ judul, tipe: 'KKTP', konten: null, urutan: nextUrutan,
                           parent_id: parentTpId, batas_bawah, batas_atas,
                           is_visible_siswa: false, is_visible_ortu: false });
        }
        await loadAll();
        renderPerencanaan();
        close();
      }
    });
  }

  // ─── Inline delete confirm ───────────────────────────────────────────────────

  function confirmItemDelete(origBtn, id, label) {
    const clone = origBtn.cloneNode(true);

    const wrap = document.createElement('span');
    wrap.style.cssText = 'display:inline-flex;align-items:center;gap:var(--space-xs);flex-wrap:wrap;';
    wrap.innerHTML = `<span style="font-size:var(--fs-caption);color:var(--text-secondary);white-space:nowrap;">Hapus ${esc(label)}?</span>`;

    const yesBtn = document.createElement('button');
    yesBtn.className  = 'btn-sm btn-sm-danger';
    yesBtn.style.cssText = 'font-size:var(--fs-badge);min-height:var(--btn-h-xs);padding:0 var(--btn-px-sm);';
    yesBtn.textContent = 'Ya';

    const noBtn = document.createElement('button');
    noBtn.className   = 'btn-sm';
    noBtn.style.cssText = 'font-size:var(--fs-badge);min-height:var(--btn-h-xs);padding:0 var(--btn-px-sm);';
    noBtn.textContent = 'Tidak';

    wrap.appendChild(yesBtn);
    wrap.appendChild(noBtn);
    origBtn.replaceWith(wrap);

    yesBtn.addEventListener('click', async () => {
      yesBtn.disabled = true;
      try {
        await deleteItem(id);
        await loadAll();
        renderPerencanaan();
      } catch (err) {
        wrap.replaceWith(clone);
        alert('Gagal hapus: ' + (err.message || 'Error tidak diketahui.'));
      }
    });
    noBtn.addEventListener('click', () => { wrap.replaceWith(clone); });
  }

  // ─── Event delegation ───────────────────────────────────────────────────────

  function initDelegation() {
    const body = document.getElementById('pai-perencanaan-body');
    if (!body) return;

    body.addEventListener('click', e => {
      // Toggle Selengkapnya / Sembunyikan
      if (e.target.id === 'pai-cp-toggle') {
        const txt = document.getElementById('pai-cp-text');
        const tog = e.target;
        if (!txt) return;
        const clamped = txt.classList.toggle('pai-cp-clamped');
        tog.textContent = clamped ? 'Selengkapnya' : 'Sembunyikan';
        return;
      }

      // Subsec header collapse — but not if a button inside was clicked
      const subsecHdr = e.target.closest('.pai-subsec-header');
      if (subsecHdr && !e.target.closest('[data-action]')) {
        const subsecBody = subsecHdr.nextElementSibling;
        const chevron    = subsecHdr.querySelector('.pai-chevron');
        if (subsecBody) {
          const isOpen = subsecBody.style.display !== 'none';
          subsecBody.style.display = isOpen ? 'none' : '';
          if (chevron) chevron.style.transform = isOpen ? '' : 'rotate(180deg)';
        }
        return;
      }

      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const action = btn.dataset.action;

      switch (action) {
        case 'cp-add':
          openCpModal(null);
          break;
        case 'cp-edit': {
          const cp = _items.find(i => i.id === btn.dataset.id) || null;
          openCpModal(cp);
          break;
        }
        case 'cp-del':
          confirmItemDelete(btn, btn.dataset.id, 'CP');
          break;
        case 'tp-add':
          openTpModal(null);
          break;
        case 'tp-edit': {
          const tp = _items.find(i => i.id === btn.dataset.id) || null;
          openTpModal(tp);
          break;
        }
        case 'tp-del':
          confirmItemDelete(btn, btn.dataset.id, 'TP ini beserta KKTP-nya');
          break;
        case 'kktp-add':
          openKktpModal(null, btn.dataset.tpId);
          break;
        case 'kktp-del':
          confirmItemDelete(btn, btn.dataset.id, 'KKTP ini');
          break;
        case 'tp-toggle': {
          const tpId = btn.dataset.tpId;
          const list = document.getElementById('pai-kktp-list-' + tpId);
          if (!list) break;
          const isOpen = list.style.display !== 'none';
          list.style.display = isOpen ? 'none' : '';
          btn.textContent    = isOpen ? '▶' : '▼';
          break;
        }
      }
    });
  }

  // ─── Collapse ───────────────────────────────────────────────────────────────

  function initCollapse() {
    [
      { headerId: 'pai-perencanaan-header', bodyId: 'pai-perencanaan-body' },
      { headerId: 'pai-pelaksanaan-header', bodyId: 'pai-pelaksanaan-body' }
    ].forEach(({ headerId, bodyId }) => {
      const header  = document.getElementById(headerId);
      const body    = document.getElementById(bodyId);
      if (!header || !body) return;
      const chevron = header.querySelector('.pai-section-chevron');
      header.addEventListener('click', () => {
        const isOpen = body.style.display !== 'none';
        body.style.display = isOpen ? 'none' : '';
        if (chevron) chevron.style.transform = isOpen ? '' : 'rotate(180deg)';
      });
    });
  }

  // ─── Filter ─────────────────────────────────────────────────────────────────

  function initFilter() {
    const now = new Date();
    const y   = now.getFullYear();
    _year     = now.getMonth() >= 6 ? `${y}/${y + 1}` : `${y - 1}/${y}`;
    _semester = now.getMonth() >= 6 ? 1 : 2;

    renderPerencanaan();

    const body = document.getElementById('pai-perencanaan-body');
    if (!body) return;

    async function applyFilter() {
      const yearInp = document.getElementById('pai-year');
      const semSel  = document.getElementById('pai-semester');
      const errEl   = document.getElementById('pai-filter-error');
      const yv = yearInp ? yearInp.value.trim() : '';
      const sv = semSel  ? parseInt(semSel.value, 10) : 1;
      if (!YEAR_RE.test(yv)) {
        if (errEl) errEl.textContent = 'Format tidak valid. Contoh: 2025/2026';
        return;
      }
      if (errEl) errEl.textContent = '';
      _year     = yv;
      _semester = sv;
      await loadAll();
      renderAll();
    }

    body.addEventListener('change', async e => {
      if (e.target.id === 'pai-year' || e.target.id === 'pai-semester') await applyFilter();
    });
    body.addEventListener('blur', async e => {
      if (e.target.id === 'pai-year') await applyFilter();
    }, true);
  }

  // ─── Init ───────────────────────────────────────────────────────────────────

  async function initAssessmentTab(cId, tId) {
    classroomId = cId;
    teacherId   = tId;

    const panel = document.getElementById('panel-penilaian');
    if (panel) {
      panel.innerHTML = `
<div class="pai-section">
  <div class="pai-section-header" id="pai-perencanaan-header">
    <span class="pai-section-title">Perencanaan</span>
    <span class="pai-section-chevron">▼</span>
  </div>
  <div class="pai-section-body" id="pai-perencanaan-body" style="display:none"></div>
</div>
<div class="pai-section">
  <div class="pai-section-header" id="pai-pelaksanaan-header">
    <span class="pai-section-title">Pelaksanaan Penilaian</span>
    <span class="pai-section-chevron">▼</span>
  </div>
  <div class="pai-section-body" id="pai-pelaksanaan-body" style="display:none"></div>
</div>`;
    }

    initCollapse();
    renderPelaksanaan();
    initFilter();
    initDelegation();
    await Promise.all([loadRoster(), loadAll()]);
    renderPerencanaan();
    _loaded = true;
  }

  // ─── DOMContentLoaded ───────────────────────────────────────────────────────

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
