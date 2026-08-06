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
  let _isSaving   = false;

  const YEAR_RE = /^\d{4}\/\d{4}$/;

  // ─── Helpers ────────────────────────────────────────────────────────────────

  function esc(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function rosterName(id) {
    const s = _roster.find(r => r.id === id);
    return s ? s.full_name + (s.nis ? ' · ' + s.nis : '') : '—';
  }

  function visIcon(item) {
    const s = item.is_visible_siswa, o = item.is_visible_ortu;
    if (s && o)  return '👁👁';
    if (s)       return '👁S';
    if (o)       return '👁O';
    return '👁✗';
  }

  function nextVis(item) {
    const s = item.is_visible_siswa, o = item.is_visible_ortu;
    if (!s && !o) return { is_visible_siswa: true,  is_visible_ortu: false };
    if (s  && !o) return { is_visible_siswa: true,  is_visible_ortu: true  };
    if (s  && o)  return { is_visible_siswa: false, is_visible_ortu: true  };
    return            { is_visible_siswa: false, is_visible_ortu: false };
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
    if (error) {
      const el = document.getElementById('penilaian-items-list');
      if (el) el.innerHTML = '<p class="empty-state">Gagal memuat: ' + esc(error.message) + '</p>';
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
    if (error) { _grades = []; return; }
    _grades = data || [];
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
    renderItemsSection();
    renderFreeGrades();
  }

  function renderItemsSection() {
    const el     = document.getElementById('penilaian-items-list');
    const addBtn = document.getElementById('btn-pai-add');
    if (!el) return;
    if (addBtn) addBtn.style.display = 'none';

    const cp  = _items.find(i => i.tipe === 'CP' && !i.parent_id);
    const tps = _items
      .filter(i => i.tipe === 'TP' && !i.parent_id)
      .sort((a, b) => (a.urutan ?? 999) - (b.urutan ?? 999) || String(a.judul).localeCompare(String(b.judul)));

    let html = '';

    // CP
    if (cp) {
      html += `
<div class="pai-inline-row pai-level-0" data-id="${esc(cp.id)}" data-tipe="CP">
  <span class="pai-inline-arrow">→</span>
  <span class="badge-tipe badge-cp">CP</span>
  <input class="pai-inline-input" type="text"
    value="${esc(cp.konten || '')}" data-orig="${esc(cp.konten || '')}"
    data-field="konten" placeholder="Capaian Pembelajaran..." maxlength="2000">
  <button class="pai-vis-btn" data-action="toggle-vis" data-id="${esc(cp.id)}"
    title="Toggle visibilitas">${visIcon(cp)}</button>
  <span class="pai-inline-actions">
    <button class="pai-inline-btn" data-action="delete-item" data-id="${esc(cp.id)}" title="Hapus">🗑</button>
  </span>
</div>`;
    } else {
      html += `<div class="pai-inline-add pai-level-0" data-action="add-cp">→ + Tambah CP</div>`;
    }

    // TPs
    tps.forEach(tp => {
      html += `
<div class="pai-inline-row pai-level-1" data-id="${esc(tp.id)}" data-tipe="TP">
  <span class="pai-inline-arrow">↳</span>
  <span class="badge-tipe badge-tp">TP</span>
  <input class="pai-inline-input" type="text"
    value="${esc(tp.judul)}" data-orig="${esc(tp.judul)}"
    data-field="judul" placeholder="Judul TP..." maxlength="200">
  <button class="pai-vis-btn" data-action="toggle-vis" data-id="${esc(tp.id)}"
    title="Toggle visibilitas">${visIcon(tp)}</button>
  <span class="pai-inline-actions">
    <button class="pai-inline-btn" data-action="delete-item" data-id="${esc(tp.id)}" title="Hapus">🗑</button>
  </span>
</div>`;

      // KKTP children
      const kktps = _items
        .filter(i => i.tipe === 'KKTP' && i.parent_id === tp.id)
        .sort((a, b) => (a.urutan ?? 999) - (b.urutan ?? 999));
      kktps.forEach(k => {
        html += `
<div class="pai-inline-row pai-level-2" data-id="${esc(k.id)}" data-tipe="KKTP" data-parent-id="${esc(tp.id)}">
  <span class="pai-inline-arrow">↳</span>
  <span class="badge-tipe badge-kktp">KKTP</span>
  <input class="pai-inline-input pai-input-predikat" type="text"
    value="${esc(k.judul)}" data-orig="${esc(k.judul)}"
    data-field="judul" placeholder="Predikat..." maxlength="200">
  <span class="pai-inline-sep">|</span>
  <input class="pai-inline-input pai-input-range" type="number"
    value="${k.batas_bawah != null ? esc(String(k.batas_bawah)) : ''}"
    data-orig="${k.batas_bawah != null ? esc(String(k.batas_bawah)) : ''}"
    data-field="batas_bawah" placeholder="0" min="0" max="100" step="0.01">
  <span class="pai-inline-sep">–</span>
  <input class="pai-inline-input pai-input-range" type="number"
    value="${k.batas_atas != null ? esc(String(k.batas_atas)) : ''}"
    data-orig="${k.batas_atas != null ? esc(String(k.batas_atas)) : ''}"
    data-field="batas_atas" placeholder="100" min="0" max="100" step="0.01">
  <span class="pai-inline-actions">
    <button class="pai-inline-btn" data-action="delete-item" data-id="${esc(k.id)}" title="Hapus">🗑</button>
  </span>
</div>`;
      });
      html += `<div class="pai-inline-add pai-level-2" data-action="add-kktp" data-tp-id="${esc(tp.id)}">↳ + Tambah KKTP</div>`;

      // Nilai siswa (student_grades linked to this TP)
      const grades = _grades.filter(g => g.assessment_item_id === tp.id);
      grades.forEach(g => { html += gradeRowHtml(g, 3); });
      html += `<div class="pai-inline-add pai-level-3" data-action="add-grade" data-tp-id="${esc(tp.id)}">↳ + Tambah Nilai</div>`;
    });

    html += `<div class="pai-inline-add pai-level-1" data-action="add-tp" style="margin-top:var(--space-sm);">+ Tambah TP</div>`;

    el.innerHTML = html;
    attachInputHandlers(el);
  }

  function gradeRowHtml(g, level) {
    const lvl      = level != null ? level : 0;
    const pubIcon  = g.is_published ? '👁' : '🚫';
    const pubTitle = g.is_published ? 'Dipublikasi' : 'Belum dipublikasi';
    const opts = _roster.map(s =>
      `<option value="${esc(s.id)}"${s.id === g.student_id ? ' selected' : ''}>${esc(s.full_name)}${s.nis ? ' · ' + esc(s.nis) : ''}</option>`
    ).join('');
    const arrow = lvl > 0 ? `<span class="pai-inline-arrow">↳</span>` : '';
    const tpAttr = g.assessment_item_id ? ` data-tp-id="${esc(g.assessment_item_id)}"` : '';
    return `
<div class="pai-inline-row pai-level-${lvl}" data-id="${esc(g.id)}" data-tipe="GRADE"${tpAttr}>
  ${arrow}
  <select class="pai-inline-input pai-input-student"
    data-field="student_id" data-orig="${esc(g.student_id || '')}">
    <option value="">— Siswa —</option>
    ${opts}
  </select>
  <span class="pai-inline-sep">|</span>
  <input class="pai-inline-input pai-input-nilai" type="number"
    value="${g.nilai_angka != null ? esc(String(g.nilai_angka)) : ''}"
    data-orig="${g.nilai_angka != null ? esc(String(g.nilai_angka)) : ''}"
    data-field="nilai_angka" placeholder="0–100" min="0" max="100" step="0.01">
  <span class="pai-inline-sep">|</span>
  <input class="pai-inline-input" type="text"
    value="${esc(g.judul || '')}" data-orig="${esc(g.judul || '')}"
    data-field="judul" placeholder="Judul penilaian..." maxlength="200">
  <span class="pai-inline-actions">
    <button class="pai-inline-btn" data-action="toggle-pub" data-id="${esc(g.id)}"
      title="${pubTitle}">${pubIcon}</button>
    <button class="pai-inline-btn" data-action="delete-grade" data-id="${esc(g.id)}" title="Hapus">🗑</button>
  </span>
</div>`;
  }

  function renderFreeGrades() {
    const el     = document.getElementById('penilaian-grades-list');
    const addBtn = document.getElementById('btn-sg-add');
    if (!el) return;

    // Relabel heading once
    const h2El = document.querySelector('#panel-penilaian .panel-header[data-panel="penilaian-grades-body"]');
    if (h2El && !h2El._relabeled) {
      const arrow = h2El.querySelector('.panel-collapse-arrow');
      h2El.textContent = 'Nilai Bebas ';
      if (arrow) h2El.appendChild(arrow);
      h2El._relabeled = true;
    }

    if (addBtn) { addBtn.textContent = '+ Tambah Nilai Bebas'; addBtn.style.display = ''; }

    const free = _grades.filter(g => !g.assessment_item_id);
    if (free.length === 0) {
      el.innerHTML = '<p class="empty-state" style="font-size:var(--fs-caption);">Belum ada nilai bebas.</p>';
    } else {
      el.innerHTML = free.map(g => gradeRowHtml(g, 0)).join('');
      attachInputHandlers(el);
    }
  }

  // ─── Handlers: auto-save pada blur (existing rows) ──────────────────────────

  function attachInputHandlers(container) {
    container.querySelectorAll('.pai-inline-row[data-id] .pai-inline-input').forEach(inp => {
      inp.addEventListener('blur', onInlineBlur);
      if (inp.tagName === 'INPUT' && inp.type !== 'number') {
        inp.addEventListener('keydown', e => {
          if (e.key === 'Enter') { e.preventDefault(); inp.blur(); }
        });
      }
    });
  }

  async function onInlineBlur(e) {
    if (_isSaving) return;
    const inp  = e.target;
    const row  = inp.closest('.pai-inline-row[data-id]');
    if (!row) return;
    const orig = inp.dataset.orig ?? '';
    const cur  = inp.value;
    if (cur === orig) return;

    const id   = row.dataset.id;
    const tipe = row.dataset.tipe;
    _isSaving  = true;
    try {
      if (tipe === 'CP') {
        const konten = row.querySelector('[data-field="konten"]')?.value.trim() || null;
        await updateItem(id, { konten });
      } else if (tipe === 'TP') {
        const judul = row.querySelector('[data-field="judul"]')?.value.trim();
        if (!judul) { inp.classList.add('pai-input-error'); _isSaving = false; return; }
        inp.classList.remove('pai-input-error');
        await updateItem(id, { judul });
      } else if (tipe === 'KKTP') {
        const judul = row.querySelector('[data-field="judul"]')?.value.trim();
        if (!judul) { inp.classList.add('pai-input-error'); _isSaving = false; return; }
        inp.classList.remove('pai-input-error');
        const bawahRaw = row.querySelector('[data-field="batas_bawah"]')?.value.trim();
        const atasRaw  = row.querySelector('[data-field="batas_atas"]')?.value.trim();
        const batas_bawah = bawahRaw !== '' ? parseFloat(bawahRaw) : null;
        const batas_atas  = atasRaw  !== '' ? parseFloat(atasRaw)  : null;
        if (batas_bawah != null && batas_atas != null && batas_atas <= batas_bawah) {
          row.querySelector('[data-field="batas_atas"]')?.classList.add('pai-input-error');
          _isSaving = false; return;
        }
        await updateItem(id, { judul, batas_bawah, batas_atas });
      } else if (tipe === 'GRADE') {
        const studentId = row.querySelector('[data-field="student_id"]')?.value;
        const judul     = row.querySelector('[data-field="judul"]')?.value.trim();
        if (!studentId || !judul) {
          if (!studentId) row.querySelector('[data-field="student_id"]')?.classList.add('pai-input-error');
          if (!judul)     row.querySelector('[data-field="judul"]')?.classList.add('pai-input-error');
          _isSaving = false; return;
        }
        const nilaiRaw    = row.querySelector('[data-field="nilai_angka"]')?.value.trim();
        const nilai_angka = nilaiRaw !== '' ? parseFloat(nilaiRaw) : null;
        await updateGrade(id, { student_id: studentId, judul, nilai_angka });
      }
      await loadAll(); renderAll();
    } catch (err) {
      console.error('Auto-save error:', err);
    } finally {
      _isSaving = false;
    }
  }

  // ─── Pending rows ───────────────────────────────────────────────────────────

  function attachPendingHandlers(div, onSave) {
    div.querySelector('[data-action="remove-pending"]')
      ?.addEventListener('click', () => div.remove());

    div.addEventListener('focusout', async e => {
      if (div.contains(e.relatedTarget)) return;
      if (div._cancelled) return;
      const inputs = Array.from(div.querySelectorAll('input, select'));
      const hasContent = inputs.some(f => (f.tagName === 'SELECT' ? !!f.value : !!f.value.trim()));
      if (!hasContent) { div.remove(); return; }
      await onSave().catch(err => console.error('Pending save error:', err));
    });

    const focusables = Array.from(div.querySelectorAll('input, select'));
    focusables.forEach((inp, idx) => {
      if (inp.tagName !== 'INPUT') return;
      inp.addEventListener('keydown', async e => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        if (idx < focusables.length - 1) { focusables[idx + 1].focus(); }
        else { await onSave().catch(err => console.error(err)); }
      });
    });
  }

  function insertPendingCp(container) {
    if (container.querySelector('[data-pending][data-tipe="CP"]')) return;
    const div = document.createElement('div');
    div.className = 'pai-inline-row pai-level-0';
    div.dataset.pending = 'true';
    div.dataset.tipe = 'CP';
    div.innerHTML = `
      <span class="pai-inline-arrow">→</span>
      <span class="badge-tipe badge-cp">CP</span>
      <input class="pai-inline-input" type="text" placeholder="Capaian Pembelajaran..." maxlength="2000">
      <span class="pai-inline-actions" style="opacity:1;">
        <button class="pai-inline-btn" data-action="remove-pending" title="Batal">✕</button>
      </span>`;
    const addEl = container.querySelector('[data-action="add-cp"]');
    if (addEl) addEl.replaceWith(div); else container.prepend(div);
    const input = div.querySelector('input');
    attachPendingHandlers(div, async () => {
      const konten = input.value.trim() || null;
      await saveItem({ judul: 'CP', tipe: 'CP', konten, urutan: 1,
                       parent_id: null, is_visible_siswa: false, is_visible_ortu: false });
      await loadAll(); renderAll();
    });
    input.focus();
  }

  function insertPendingTp(container) {
    if (container.querySelector('[data-pending][data-tipe="TP"]')) return;
    const div = document.createElement('div');
    div.className = 'pai-inline-row pai-level-1';
    div.dataset.pending = 'true';
    div.dataset.tipe = 'TP';
    const nextUrutan = _items.filter(i => i.tipe === 'TP' && !i.parent_id).length + 1;
    div.innerHTML = `
      <span class="pai-inline-arrow">↳</span>
      <span class="badge-tipe badge-tp">TP</span>
      <input class="pai-inline-input" type="text" placeholder="Judul TP..." maxlength="200">
      <span class="pai-inline-actions" style="opacity:1;">
        <button class="pai-inline-btn" data-action="remove-pending" title="Batal">✕</button>
      </span>`;
    const addEl = container.querySelector('[data-action="add-tp"]');
    if (addEl) addEl.before(div); else container.appendChild(div);
    const input = div.querySelector('input');
    attachPendingHandlers(div, async () => {
      const judul = input.value.trim();
      if (!judul) { input.classList.add('pai-input-error'); return; }
      input.classList.remove('pai-input-error');
      await saveItem({ judul, tipe: 'TP', konten: null, urutan: nextUrutan,
                       parent_id: null, is_visible_siswa: false, is_visible_ortu: false });
      await loadAll(); renderAll();
    });
    input.focus();
  }

  function insertPendingKktp(container, tpId) {
    if (container.querySelector(`[data-pending][data-tipe="KKTP"][data-tp-id="${tpId}"]`)) return;
    const div = document.createElement('div');
    div.className = 'pai-inline-row pai-level-2';
    div.dataset.pending = 'true';
    div.dataset.tipe = 'KKTP';
    div.dataset.tpId = tpId;
    const nextUrutan = _items.filter(i => i.parent_id === tpId).length + 1;
    div.innerHTML = `
      <span class="pai-inline-arrow">↳</span>
      <span class="badge-tipe badge-kktp">KKTP</span>
      <input class="pai-inline-input pai-input-predikat" type="text" placeholder="Predikat..." maxlength="200">
      <span class="pai-inline-sep">|</span>
      <input class="pai-inline-input pai-input-range" type="number" placeholder="0" min="0" max="100" step="0.01">
      <span class="pai-inline-sep">–</span>
      <input class="pai-inline-input pai-input-range" type="number" placeholder="100" min="0" max="100" step="0.01">
      <span class="pai-inline-actions" style="opacity:1;">
        <button class="pai-inline-btn" data-action="remove-pending" title="Batal">✕</button>
      </span>`;
    const addEl = container.querySelector(`[data-action="add-kktp"][data-tp-id="${tpId}"]`);
    if (addEl) addEl.before(div);
    const [inpJudul, inpBawah, inpAtas] = div.querySelectorAll('input');
    attachPendingHandlers(div, async () => {
      const judul = inpJudul.value.trim();
      if (!judul) { inpJudul.classList.add('pai-input-error'); return; }
      inpJudul.classList.remove('pai-input-error');
      const bawahRaw = inpBawah.value.trim();
      const atasRaw  = inpAtas.value.trim();
      const batas_bawah = bawahRaw !== '' ? parseFloat(bawahRaw) : null;
      const batas_atas  = atasRaw  !== '' ? parseFloat(atasRaw)  : null;
      if (batas_bawah != null && batas_atas != null && batas_atas <= batas_bawah) {
        inpAtas.classList.add('pai-input-error'); return;
      }
      await saveItem({ judul, tipe: 'KKTP', konten: null, urutan: nextUrutan,
                       parent_id: tpId, batas_bawah, batas_atas,
                       is_visible_siswa: false, is_visible_ortu: false });
      await loadAll(); renderAll();
    });
    inpJudul.focus();
  }

  function insertPendingGrade(container, tpId) {
    const key = tpId || 'free';
    if (container.querySelector(`[data-pending][data-tipe="GRADE"][data-key="${key}"]`)) return;
    const div = document.createElement('div');
    const lvl = tpId ? 3 : 0;
    div.className = `pai-inline-row pai-level-${lvl}`;
    div.dataset.pending = 'true';
    div.dataset.tipe    = 'GRADE';
    div.dataset.key     = key;
    if (tpId) div.dataset.tpId = tpId;
    const opts = _roster.map(s =>
      `<option value="${esc(s.id)}">${esc(s.full_name)}${s.nis ? ' · ' + esc(s.nis) : ''}</option>`
    ).join('');
    const arrow = tpId ? `<span class="pai-inline-arrow">↳</span>` : '';
    div.innerHTML = `
      ${arrow}
      <select class="pai-inline-input pai-input-student">
        <option value="">— Siswa —</option>
        ${opts}
      </select>
      <span class="pai-inline-sep">|</span>
      <input class="pai-inline-input pai-input-nilai" type="number" placeholder="0–100" min="0" max="100" step="0.01">
      <span class="pai-inline-sep">|</span>
      <input class="pai-inline-input" type="text" placeholder="Judul penilaian..." maxlength="200">
      <span class="pai-inline-actions" style="opacity:1;">
        <button class="pai-inline-btn" data-action="remove-pending" title="Batal">✕</button>
      </span>`;
    const addSel = tpId
      ? container.querySelector(`[data-action="add-grade"][data-tp-id="${tpId}"]`)
      : document.getElementById('btn-sg-add');
    if (addSel) addSel.before(div); else container.appendChild(div);
    const sel    = div.querySelector('select');
    const inpVal = div.querySelector('[type="number"]');
    const inpJdl = div.querySelector('[type="text"]');
    attachPendingHandlers(div, async () => {
      const studentId = sel.value;
      const judul     = inpJdl.value.trim();
      let valid = true;
      if (!studentId) { sel.classList.add('pai-input-error'); valid = false; }
      if (!judul)     { inpJdl.classList.add('pai-input-error'); valid = false; }
      if (!valid) return;
      sel.classList.remove('pai-input-error');
      inpJdl.classList.remove('pai-input-error');
      const nilaiRaw    = inpVal.value.trim();
      const nilai_angka = nilaiRaw !== '' ? parseFloat(nilaiRaw) : null;
      await saveGrade({ student_id: studentId, judul, nilai_angka,
                        assessment_item_id: tpId || null, is_published: false });
      await loadAll(); renderAll();
    });
    sel.focus();
  }

  // ─── Delete inline confirm ──────────────────────────────────────────────────

  function showInlineDeleteConfirm(btn, onConfirm) {
    const row     = btn.closest('.pai-inline-row');
    const actions = row?.querySelector('.pai-inline-actions');
    if (!actions) return;
    const orig = actions.innerHTML;
    actions.style.opacity = '1';
    actions.innerHTML = `
      <span class="pai-inline-confirm-text">Hapus?</span>
      <button class="pai-inline-btn pai-confirm-yes">Ya</button>
      <button class="pai-inline-btn pai-confirm-no">Tidak</button>`;
    actions.querySelector('.pai-confirm-yes').addEventListener('click', async () => {
      try {
        await onConfirm();
        await loadAll(); renderAll();
      } catch (err) {
        actions.innerHTML = orig;
        alert('Gagal hapus: ' + (err.message || 'Error tidak diketahui.'));
      }
    });
    actions.querySelector('.pai-confirm-no').addEventListener('click', () => {
      actions.innerHTML = orig;
    });
  }

  // ─── Collapse panel-level ───────────────────────────────────────────────────

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

  // ─── Filter ─────────────────────────────────────────────────────────────────

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

    const now         = new Date();
    const y           = now.getFullYear();
    const defaultYear = now.getMonth() >= 6 ? `${y}/${y + 1}` : `${y - 1}/${y}`;
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

  // ─── Event delegation ───────────────────────────────────────────────────────

  function initDelegation() {
    const itemsList  = document.getElementById('penilaian-items-list');
    const gradesList = document.getElementById('penilaian-grades-list');
    const freeAddBtn = document.getElementById('btn-sg-add');

    if (freeAddBtn) freeAddBtn.addEventListener('click', () => {
      insertPendingGrade(gradesList || document.body, null);
    });

    function handleClick(e) {
      const tgt    = e.target.closest('[data-action]');
      if (!tgt) return;
      const action = tgt.dataset.action;
      e.stopPropagation();

      switch (action) {
        case 'add-cp':
          insertPendingCp(itemsList); break;
        case 'add-tp':
          insertPendingTp(itemsList); break;
        case 'add-kktp':
          insertPendingKktp(itemsList, tgt.dataset.tpId); break;
        case 'add-grade':
          insertPendingGrade(itemsList, tgt.dataset.tpId); break;
        case 'toggle-vis': {
          const id   = tgt.dataset.id;
          const item = _items.find(i => i.id === id);
          if (!item) break;
          updateItem(id, nextVis(item))
            .then(() => loadAll()).then(renderAll)
            .catch(err => console.error(err));
          break;
        }
        case 'toggle-pub': {
          const id    = tgt.dataset.id;
          const grade = _grades.find(g => g.id === id);
          if (!grade) break;
          updateGrade(id, { is_published: !grade.is_published })
            .then(() => loadAll()).then(renderAll)
            .catch(err => console.error(err));
          break;
        }
        case 'delete-item': {
          const id = tgt.dataset.id;
          showInlineDeleteConfirm(tgt, () => deleteItem(id));
          break;
        }
        case 'delete-grade': {
          const id = tgt.dataset.id;
          showInlineDeleteConfirm(tgt, () => deleteGrade(id));
          break;
        }
        case 'remove-pending': {
          const pending = tgt.closest('[data-pending]');
          if (pending) { pending._cancelled = true; pending.remove(); }
          break;
        }
      }
    }

    if (itemsList)  itemsList.addEventListener('click',  handleClick);
    if (gradesList) gradesList.addEventListener('click', handleClick);
  }

  // ─── Init ───────────────────────────────────────────────────────────────────

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
