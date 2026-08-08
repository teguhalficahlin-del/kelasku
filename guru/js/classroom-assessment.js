(function () {
  'use strict';
  const client = window.supabaseClient;

  let classroomId = null;
  let teacherId   = null;
  let _roster      = [];
  let _items       = [];
  let _grades      = [];
  let _assessments = [];
  let _pelTab      = 'DIAGNOSTIK';
  let _loaded      = false;
  let _year       = '';
  let _semester   = 1;
  let _sdAC            = null;
  let _origCriteriaIds = [];

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
      .select('id, student_id, judul, nilai_angka, deskripsi, is_published, assessment_item_id, tanggal_penilaian, tipe_penilaian, bobot, assessment_id')
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
    await Promise.all([loadItems(), loadGrades(), loadAssessments()]);
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
  <div class="custom-select" id="pai-semester-wrap">
    <div class="custom-select-trigger" id="pai-semester-trigger"
         role="button" aria-haspopup="listbox" tabindex="0">
      <span id="pai-semester-label">Semester ${_semester}</span>
      <span class="custom-select-arrow">▾</span>
    </div>
    <ul class="custom-select-list" id="pai-semester-list"
        role="listbox" style="display:none">
      <li class="custom-select-option${_semester === 1 ? ' selected' : ''}" data-value="1" role="option">Semester 1</li>
      <li class="custom-select-option${_semester === 2 ? ' selected' : ''}" data-value="2" role="option">Semester 2</li>
    </ul>
  </div>
</div>
<div id="pai-filter-error"
  style="color:var(--danger);font-size:var(--fs-caption);min-height:1.2rem;margin-top:var(--space-xs);"></div>
${renderCpSubsection(cp)}
${renderTpSubsection(tps, kktps)}`;
    initSemesterDropdown();
  }

  function renderCpSubsection(cp) {
    let bodyHtml;
    if (!cp) {
      bodyHtml = `
<p class="pai-placeholder" style="padding:var(--space-md) 0;text-align:left;">Belum ada Capaian Pembelajaran.</p>
<button class="btn-sm" data-action="cp-add">+ Tambah Capaian Pembelajaran</button>`;
    } else {
      bodyHtml = `
<div class="pai-cp-preview">
  <p class="pai-cp-text pai-cp-clamped" id="pai-cp-text">${esc(cp.konten || '—')}</p>
  ${cp.konten && cp.konten.length > 100 ? `<button class="pai-cp-toggle" id="pai-cp-toggle">Selengkapnya</button>` : ''}
</div>
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
  <div class="pai-subsec-body" id="pai-cp-subsec-body" style="display:none">${bodyHtml}</div>
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
  <div class="pai-subsec-body" style="display:none">
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
  <span style="flex:1;min-width:90px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(k.judul)}</span>
  ${range}
  <div class="pai-kktp-actions">
    <button class="btn-sm" data-action="kktp-edit" data-id="${esc(k.id)}">Edit</button>
    <button class="btn-sm btn-sm-danger" data-action="kktp-del" data-id="${esc(k.id)}">Hapus</button>
  </div>
</div>`;
    }).join('');

    return `
<div class="pai-tp-row">
  <div class="pai-tp-left">
    <div class="pai-tp-headline">
      <button class="pai-tp-toggle" data-action="tp-toggle"
        data-tp-id="${esc(tp.id)}" data-count="${kktpList.length}"
        title="Lihat/tutup KKTP">▶</button>
      <span class="pai-tp-title">${esc(tp.judul)}</span>
      <span class="pai-tp-count">${kktpList.length} KKTP</span>
    </div>
    <div id="pai-tp-body-${esc(tp.id)}" style="display:none">
    ${tp.konten ? `
      <p class="pai-cp-text pai-cp-clamped" id="pai-tp-text-${esc(tp.id)}">${esc(tp.konten)}</p>
      ${tp.konten.length > 100 ? `<button class="pai-cp-toggle" id="pai-tp-toggle-${esc(tp.id)}">Selengkapnya</button>` : ''}
    ` : ''}
      <div class="pai-kktp-list" id="pai-kktp-list-${esc(tp.id)}">
        ${kktpRows || '<p style="font-size:var(--fs-caption);color:var(--text-muted);margin:var(--space-xs) 0;">Belum ada KKTP.</p>'}
        <button class="btn-sm" data-action="kktp-add" data-tp-id="${esc(tp.id)}"
          style="font-size:var(--fs-caption);min-height:var(--btn-h-xs);padding:0 var(--btn-px-sm);margin-top:var(--space-xs);">+ Tambah KKTP</button>
      </div>
    </div>
  </div>
  <div class="pai-item-actions" style="flex-shrink:0;align-self:flex-start;">
    <button class="btn-sm" data-action="tp-edit" data-id="${esc(tp.id)}">Edit</button>
    <button class="btn-sm btn-sm-danger" data-action="tp-del" data-id="${esc(tp.id)}">Hapus</button>
  </div>
</div>`;
  }

  // ─── API — assessments ──────────────────────────────────────────────────────

  async function loadAssessments() {
    const { data, error } = await client
      .from('assessments')
      .select('id, judul, teknik, tanggal, jenis, tp_id, tindak_lanjut, catatan_tl, format_penilaian')
      .eq('classroom_id', classroomId)
      .eq('academic_year', _year)
      .eq('semester', _semester)
      .order('tanggal', { ascending: false }).order('judul');
    _assessments = error ? [] : (data || []);
  }

  async function saveAssessment(payload) {
    const { data, error } = await client
      .from('assessments')
      .insert({ ...payload, classroom_id: classroomId, teacher_id: teacherId,
                academic_year: _year, semester: _semester })
      .select('id').single();
    if (error) throw error;
    return data;
  }

  async function updateAssessment(id, payload) {
    const { error } = await client.from('assessments').update(payload).eq('id', id);
    if (error) throw error;
  }

  async function deleteAssessmentById(id) {
    const { error } = await client.from('assessments').delete().eq('id', id);
    if (error) throw error;
  }

  async function loadAssessmentGrades(assessmentId) {
    const { data, error } = await client
      .from('student_grades')
      .select('id, student_id, nilai_angka, deskripsi')
      .eq('assessment_id', assessmentId);
    return error ? [] : (data || []);
  }

  async function upsertAssessmentGrade(assessmentId, studentId, judulAsmt, payload) {
    const { error } = await client.from('student_grades').upsert({
      classroom_id: classroomId, teacher_id: teacherId,
      academic_year: _year,      semester: _semester,
      student_id: studentId,     assessment_id: assessmentId,
      judul: judulAsmt,          is_published: false,
      ...payload
    }, { onConflict: 'classroom_id,student_id,assessment_id' });
    if (error) throw error;
  }

  async function loadKktpResults(assessmentId) {
    const { data, error } = await client
      .from('assessment_kktp_results')
      .select('id, student_id, kktp_id, tercapai')
      .eq('assessment_id', assessmentId);
    return error ? [] : (data || []);
  }

  async function upsertKktpResult(assessmentId, studentId, kktpId, tercapai) {
    const { error } = await client.from('assessment_kktp_results').upsert({
      assessment_id: assessmentId, student_id: studentId,
      kktp_id: kktpId,            classroom_id: classroomId,
      teacher_id: teacherId,      tercapai
    }, { onConflict: 'assessment_id,student_id,kktp_id' });
    if (error) throw error;
  }

  // ─── API — assessment_rubric_criteria ───────────────────────────────────────

  async function loadRubrikCriteria(assessmentId) {
    const { data, error } = await client
      .from('assessment_rubric_criteria')
      .select('id, urutan, judul, bobot, deskripsi_baru_berkembang, deskripsi_layak, deskripsi_cakap, deskripsi_mahir')
      .eq('assessment_id', assessmentId)
      .order('urutan');
    return error ? [] : (data || []);
  }

  async function saveRubrikCriteria(payload) {
    const { data, error } = await client
      .from('assessment_rubric_criteria')
      .insert({ ...payload, classroom_id: classroomId, teacher_id: teacherId })
      .select('id').single();
    if (error) throw error;
    return data;
  }

  async function updateRubrikCriteria(id, payload) {
    const { error } = await client.from('assessment_rubric_criteria').update(payload).eq('id', id);
    if (error) throw error;
  }

  async function deleteRubrikCriteria(id) {
    const { error } = await client.from('assessment_rubric_criteria').delete().eq('id', id);
    if (error) throw error;
  }

  // ─── API — assessment_rubric_results ────────────────────────────────────────

  async function loadRubrikResults(assessmentId) {
    const { data, error } = await client
      .from('assessment_rubric_results')
      .select('id, student_id, criteria_id, level')
      .eq('assessment_id', assessmentId);
    return error ? [] : (data || []);
  }

  async function upsertRubrikResult(assessmentId, criteriaId, studentId, level) {
    const { error } = await client.from('assessment_rubric_results').upsert({
      assessment_id: assessmentId, criteria_id: criteriaId,
      student_id: studentId,       classroom_id: classroomId,
      teacher_id: teacherId,       level
    }, { onConflict: 'assessment_id,criteria_id,student_id' });
    if (error) throw error;
  }

  // ─── Render — Pelaksanaan ────────────────────────────────────────────────────

  function renderPelaksanaan() {
    const body = document.getElementById('pai-pelaksanaan-body');
    if (!body) return;

    const diagn = _assessments.filter(a => a.jenis === 'DIAGNOSTIK_NK' || a.jenis === 'DIAGNOSTIK_K');
    const form  = _assessments.filter(a => a.jenis === 'FORMATIF');
    const sum   = _assessments.filter(a => a.jenis === 'SUMATIF');

    const counterParts = [];
    if (diagn.length) counterParts.push(`${diagn.length} Diagnostik`);
    if (form.length)  counterParts.push(`${form.length} Formatif`);
    if (sum.length)   counterParts.push(`${sum.length} Sumatif`);
    const counter = counterParts.length
      ? `<p style="font-size:var(--fs-caption);color:var(--text-secondary);margin:0 0 var(--space-sm) 0;">${counterParts.join(' · ')}</p>`
      : '';

    const tabStyle = (t) => t === _pelTab
      ? `background:var(--gold);color:var(--text-on-gold);border:none;border-radius:var(--btn-r);padding:var(--space-xs) var(--space-sm);font-size:var(--fs-caption);font-weight:var(--fw-medium);cursor:pointer;min-height:var(--btn-h-xs);`
      : `background:var(--bg-elevated);color:var(--text-secondary);border:1px solid var(--border);border-radius:var(--btn-r);padding:var(--space-xs) var(--space-sm);font-size:var(--fs-caption);font-weight:var(--fw-medium);cursor:pointer;min-height:var(--btn-h-xs);`;

    const tabs = ['DIAGNOSTIK', 'FORMATIF', 'SUMATIF'].map(t =>
      `<button style="${tabStyle(t)}" data-action="pel-tab" data-tab="${t}">${t.charAt(0) + t.slice(1).toLowerCase()}</button>`
    ).join('');

    body.innerHTML = `${counter}
<div style="display:flex;gap:var(--space-xs);margin-bottom:var(--space-md);flex-wrap:wrap;">${tabs}</div>
<div id="pel-tab-content"></div>`;

    renderPelTabContent();
  }

  function renderPelTabContent() {
    const content = document.getElementById('pel-tab-content');
    if (!content) return;

    let asmts;
    if (_pelTab === 'DIAGNOSTIK') {
      asmts = _assessments.filter(a => a.jenis === 'DIAGNOSTIK_NK' || a.jenis === 'DIAGNOSTIK_K');
    } else if (_pelTab === 'FORMATIF') {
      asmts = _assessments.filter(a => a.jenis === 'FORMATIF');
    } else {
      asmts = _assessments.filter(a => a.jenis === 'SUMATIF');
    }

    const label = _pelTab === 'DIAGNOSTIK' ? 'Diagnostik' : _pelTab === 'FORMATIF' ? 'Formatif' : 'Sumatif';
    const cards = asmts.map(a => renderAsmtCard(a)).join('');

    content.innerHTML = `${cards || `<p class="pai-placeholder" style="padding:var(--space-md) 0;text-align:left;">Belum ada entri ${label}.</p>`}
<button class="btn-sm" data-action="pel-add" style="margin-top:var(--space-sm);">+ Tambah Penilaian</button>`;
  }

  function renderAsmtCard(a) {
    const gradeCount = _grades.filter(g => g.assessment_id === a.id).length;
    const isComplete = _roster.length > 0 && gradeCount >= _roster.length;
    const statusColor = isComplete
      ? 'var(--success)'
      : (_roster.length > 0 ? 'var(--warning)' : 'var(--text-muted)');
    const statusLabel = _roster.length > 0
      ? (isComplete ? '✓ Lengkap' : `${gradeCount}/${_roster.length}`)
      : '—';

    const tp       = a.tp_id ? _items.find(i => i.id === a.tp_id) : null;
    const jenisMap = { DIAGNOSTIK_NK: 'D-NK', DIAGNOSTIK_K: 'D-K', FORMATIF: 'F', SUMATIF: 'S' };
    const jenisLabel = jenisMap[a.jenis] || a.jenis;

    const tlRow = a.tindak_lanjut
      ? `<div style="font-size:var(--fs-caption);padding:var(--space-xs) 0 0 0;border-top:1px solid var(--border);color:var(--text-secondary);margin-top:var(--space-xs);">TL: ${esc(a.tindak_lanjut)}${a.catatan_tl ? ' — ' + esc(a.catatan_tl) : ''}</div>`
      : '';

    return `
<div class="pai-tp-row" style="flex-direction:column;gap:var(--space-xs);margin-bottom:var(--space-sm);">
  <div style="display:flex;align-items:flex-start;gap:var(--space-sm);">
    <div style="flex:1;min-width:0;">
      <div style="display:flex;align-items:center;gap:var(--space-xs);flex-wrap:wrap;margin-bottom:var(--space-xs);">
        <span style="font-size:var(--fs-badge);font-weight:var(--fw-medium);background:var(--gold-muted);color:var(--gold);border-radius:99px;padding:2px 8px;">${jenisLabel}</span>
        ${a.format_penilaian === 'RUBRIK' ? `<span style="font-size:var(--fs-badge);font-weight:var(--fw-medium);background:var(--warning-bg);color:var(--warning);border-radius:99px;padding:2px 8px;">Rubrik</span>` : ''}
        <span style="font-weight:var(--fw-semibold);font-size:var(--fs-body);">${esc(a.judul)}</span>
      </div>
      ${a.teknik ? `<div style="font-size:var(--fs-caption);color:var(--text-secondary);">Teknik: ${esc(a.teknik)}</div>` : ''}
      ${tp ? `<div style="font-size:var(--fs-caption);color:var(--text-secondary);">TP: ${esc(tp.judul)}</div>` : ''}
      ${a.tanggal ? `<div style="font-size:var(--fs-caption);color:var(--text-muted);">${esc(a.tanggal)}</div>` : ''}
    </div>
    <div style="display:flex;flex-direction:column;align-items:flex-end;gap:var(--space-xs);flex-shrink:0;">
      <span style="font-size:var(--fs-badge);color:${statusColor};font-weight:var(--fw-medium);white-space:nowrap;">${statusLabel}</span>
      <div class="pai-item-actions">
        <button class="btn-sm" data-action="pel-nilai" data-id="${esc(a.id)}">Isi Nilai</button>
        <button class="btn-sm" data-action="pel-edit" data-id="${esc(a.id)}">Edit</button>
        <button class="btn-sm btn-sm-danger" data-action="pel-del" data-id="${esc(a.id)}">Hapus</button>
      </div>
    </div>
  </div>
  ${tlRow}
</div>`;
  }

  // ─── Teknik per jenis penilaian (Panduan PPA Kemendikdasmen 2025) ─────────────

  const TEKNIK_MAP = {
    DIAGNOSTIK_NK: ['Observasi', 'Wawancara', 'Kuesioner'],
    DIAGNOSTIK_K:  ['Tes Lisan', 'Tes Tertulis', 'Pertanyaan Terbuka'],
    FORMATIF:      ['Observasi', 'Jurnal Reflektif', 'Penilaian Diri',
                    'Penilaian Antarteman', 'Penugasan', 'Diskusi', 'Presentasi',
                    'Exit Ticket', 'Peta Konsep'],
    SUMATIF:       ['Tes Tertulis', 'Tes Lisan', 'Penugasan', 'Projek',
                    'Portofolio', 'Praktik/Unjuk Kerja'],
  };

  // ─── Modal Pelaksanaan — Step 1 (header entri) ───────────────────────────────

  async function openAsmtHeaderModal(asmt) {
    const tps = _items
      .filter(i => i.tipe === 'TP' && !i.parent_id)
      .sort((a, b) => (a.urutan ?? 999) - (b.urutan ?? 999));

    const jenisOpts = [
      { val: 'DIAGNOSTIK_NK', label: 'Diagnostik Non-Kognitif' },
      { val: 'DIAGNOSTIK_K',  label: 'Diagnostik Kognitif' },
      { val: 'FORMATIF',      label: 'Formatif' },
      { val: 'SUMATIF',       label: 'Sumatif' },
    ];
    const currJenis = asmt?.jenis || 'FORMATIF';

    const jenisSelect = jenisOpts.map(o =>
      `<option value="${o.val}"${currJenis === o.val ? ' selected' : ''}>${o.label}</option>`
    ).join('');

    const tpOpts = tps.map(t =>
      `<option value="${esc(t.id)}"${asmt?.tp_id === t.id ? ' selected' : ''}>${esc(t.judul)}</option>`
    ).join('');

    const tpSection = tps.length
      ? `<label id="pai-modal-tp-label">Tujuan Pembelajaran</label>
         <select id="pai-modal-tp">
           <option value="">— Tidak ada / opsional —</option>
           ${tpOpts}
         </select>
         <div id="pai-kktp-preview" style="margin-top:var(--space-xs);font-size:var(--fs-caption);color:var(--text-muted);"></div>`
      : `<p style="font-size:var(--fs-caption);color:var(--text-muted);margin:var(--space-xs) 0;">Belum ada TP di semester ini.</p>`;

    openModal({
      title: asmt ? 'Edit Entri Penilaian' : 'Tambah Entri Penilaian',
      bodyHtml: `
<label>Judul <span style="color:var(--danger);">*</span></label>
<input type="text" id="pai-modal-judul" value="${esc(asmt?.judul || '')}" maxlength="200"
  placeholder="Contoh: Ulangan Harian 1">
<label>Jenis Penilaian <span style="color:var(--danger);">*</span></label>
<select id="pai-modal-jenis">${jenisSelect}</select>
<label>Teknik <span style="font-weight:var(--fw-regular);color:var(--text-muted);">(opsional)</span></label>
<select id="pai-modal-teknik-select"></select>
<input type="text" id="pai-modal-teknik-custom" maxlength="200"
  placeholder="Tuliskan teknik lainnya…"
  style="display:none;margin-top:var(--space-xs);">
<label>Tanggal <span style="font-weight:var(--fw-regular);color:var(--text-muted);">(opsional)</span></label>
<input type="date" id="pai-modal-tanggal" value="${esc(asmt?.tanggal || '')}">
${tpSection}
<div id="pai-format-wrap" style="display:none;">
  <label>Format Penilaian</label>
  <select id="pai-modal-format">
    <option value="SKOR"${(asmt?.format_penilaian || 'SKOR') !== 'RUBRIK' ? ' selected' : ''}>Skor (0–100)</option>
    <option value="RUBRIK"${asmt?.format_penilaian === 'RUBRIK' ? ' selected' : ''}>Rubrik</option>
  </select>
</div>
<div id="pai-criteria-wrap" style="display:none;">
  <div style="display:flex;align-items:center;justify-content:space-between;margin-top:var(--space-sm);margin-bottom:var(--space-xs);">
    <span style="font-size:var(--fs-caption);font-weight:var(--fw-medium);color:var(--text-secondary);">Kriteria Rubrik</span>
    <span id="pai-sisa-bobot" style="font-size:var(--fs-caption);color:var(--text-muted);">Total: 0 / 100</span>
  </div>
  <div id="pai-criteria-list"></div>
  <button type="button" id="pai-add-kriteria" class="btn-sm" style="margin-top:var(--space-xs);">+ Tambah Kriteria</button>
</div>`,
      onSave: async (overlay, close) => {
        const judul   = overlay.querySelector('#pai-modal-judul').value.trim();
        const jenis   = overlay.querySelector('#pai-modal-jenis').value;
        const _teknikSel    = overlay.querySelector('#pai-modal-teknik-select');
        const _teknikCustom = overlay.querySelector('#pai-modal-teknik-custom');
        const teknik        = _teknikSel.value === 'LAINNYA'
          ? (_teknikCustom.value.trim() || null)
          : (_teknikSel.value || null);
        const tanggal = overlay.querySelector('#pai-modal-tanggal').value || null;
        const tp_id   = overlay.querySelector('#pai-modal-tp')?.value || null;
        if (!judul) throw new Error('Judul tidak boleh kosong.');
        if ((jenis === 'FORMATIF' || jenis === 'SUMATIF') && !tp_id && tps.length > 0) {
          throw new Error('Pilih Tujuan Pembelajaran untuk penilaian ' +
            (jenis === 'FORMATIF' ? 'Formatif' : 'Sumatif') + '.');
        }

        const format = overlay.querySelector('#pai-modal-format')?.value || 'SKOR';

        // Validasi kriteria rubrik
        let criteriaRows = [];
        if (jenis === 'SUMATIF' && format === 'RUBRIK') {
          criteriaRows = [...overlay.querySelectorAll('.pai-kriteria-row')];
          if (!criteriaRows.length) throw new Error('Tambahkan minimal 1 kriteria rubrik.');
          let totalBobot = 0;
          for (const row of criteriaRows) {
            const kJudul = row.querySelector('.pai-kr-judul').value.trim();
            const kBobot = parseFloat(row.querySelector('.pai-kr-bobot').value);
            if (!kJudul) throw new Error('Setiap kriteria harus memiliki judul.');
            if (isNaN(kBobot) || kBobot <= 0) throw new Error('Bobot setiap kriteria harus lebih dari 0.');
            totalBobot += kBobot;
          }
          if (Math.abs(totalBobot - 100) > 0.01)
            throw new Error(`Total bobot harus 100 (saat ini: ${Math.round(totalBobot * 100) / 100}).`);
        }

        const payload = { judul, jenis, teknik, tanggal, tp_id: tp_id || null, format_penilaian: format };
        let asmtId;
        if (asmt) {
          await updateAssessment(asmt.id, payload);
          asmtId = asmt.id;
        } else {
          const res = await saveAssessment(payload);
          asmtId = res.id;
        }

        // Simpan kriteria rubrik
        if (jenis === 'SUMATIF' && format === 'RUBRIK') {
          const currentDbIds = new Set(criteriaRows
            .filter(r => r.dataset.dbid).map(r => r.dataset.dbid));
          if (asmt) {
            for (const oldId of _origCriteriaIds) {
              if (!currentDbIds.has(oldId)) await deleteRubrikCriteria(oldId);
            }
          }
          for (let i = 0; i < criteriaRows.length; i++) {
            const row = criteriaRows[i];
            const kp = {
              assessment_id: asmtId, urutan: i + 1,
              judul: row.querySelector('.pai-kr-judul').value.trim(),
              bobot: parseFloat(row.querySelector('.pai-kr-bobot').value),
              deskripsi_baru_berkembang: row.querySelector('.pai-kr-bb').value.trim() || null,
              deskripsi_layak:  row.querySelector('.pai-kr-layak').value.trim() || null,
              deskripsi_cakap:  row.querySelector('.pai-kr-cakap').value.trim() || null,
              deskripsi_mahir:  row.querySelector('.pai-kr-mahir').value.trim() || null,
            };
            if (row.dataset.dbid) {
              const { assessment_id, ...upd } = kp;
              await updateRubrikCriteria(row.dataset.dbid, upd);
            } else {
              await saveRubrikCriteria(kp);
            }
          }
        }

        await loadAssessments();
        renderPelaksanaan();
        close();
        if (!asmt) {
          const newAsmt = _assessments.find(a => a.id === asmtId);
          if (newAsmt) openAsmtNilaiModal(newAsmt);
        }
      }
    });

    const overlay  = document.getElementById('assessment-modal');
    if (!overlay) return;
    const jenisEl       = overlay.querySelector('#pai-modal-jenis');
    const teknikSelEl   = overlay.querySelector('#pai-modal-teknik-select');
    const teknikCustomEl = overlay.querySelector('#pai-modal-teknik-custom');
    const formatWrap    = overlay.querySelector('#pai-format-wrap');
    const formatEl      = overlay.querySelector('#pai-modal-format');
    const criteriaWrap  = overlay.querySelector('#pai-criteria-wrap');

    function updateTeknikOpts(jenis, currentTeknik) {
      const opts   = TEKNIK_MAP[jenis] || [];
      const inList = currentTeknik && opts.includes(currentTeknik);
      teknikSelEl.innerHTML =
        '<option value="">— Pilih teknik —</option>' +
        opts.map(t => `<option value="${esc(t)}"${currentTeknik === t ? ' selected' : ''}>${esc(t)}</option>`).join('') +
        `<option value="LAINNYA"${(!inList && currentTeknik) ? ' selected' : ''}>Lainnya…</option>`;
      const showCustom = teknikSelEl.value === 'LAINNYA';
      teknikCustomEl.style.display = showCustom ? '' : 'none';
      if (showCustom && currentTeknik && !inList) teknikCustomEl.value = currentTeknik;
    }

    function updateCriteriaVisibility() {
      criteriaWrap.style.display =
        (jenisEl.value === 'SUMATIF' && formatEl.value === 'RUBRIK') ? '' : 'none';
    }

    function updateFormatVisibility() {
      const isSumatif = jenisEl.value === 'SUMATIF';
      formatWrap.style.display = isSumatif ? '' : 'none';
      if (!isSumatif) formatEl.value = 'SKOR';
      updateCriteriaVisibility();
    }

    function updateSisaBobot() {
      const total = [...overlay.querySelectorAll('.pai-kr-bobot')]
        .reduce((s, el) => s + (parseFloat(el.value) || 0), 0);
      const el = overlay.querySelector('#pai-sisa-bobot');
      if (!el) return;
      el.textContent = `Total: ${Math.round(total * 100) / 100} / 100`;
      el.style.color = Math.abs(total - 100) < 0.01 ? 'var(--success)' : 'var(--text-muted)';
    }

    function appendCriteriaRow(criterion) {
      const list = overlay.querySelector('#pai-criteria-list');
      const div  = document.createElement('div');
      div.className = 'pai-kriteria-row';
      if (criterion?.id) div.dataset.dbid = criterion.id;
      div.style.cssText = 'background:var(--bg-elevated);border:1px solid var(--border);border-radius:var(--r-md);padding:var(--space-sm);margin-bottom:var(--space-xs);';
      div.innerHTML = `
<div style="display:flex;gap:var(--space-xs);align-items:flex-start;">
  <input type="text" class="pai-kr-judul" placeholder="Nama kriteria…" style="flex:1;" value="${esc(criterion?.judul || '')}">
  <input type="number" class="pai-kr-bobot" placeholder="Bobot %" min="0.5" max="100" step="0.5" value="${esc(String(criterion?.bobot ?? ''))}" style="width:5.5rem;flex-shrink:0;">
  <button type="button" class="btn-sm btn-sm-danger pai-kr-del" style="flex-shrink:0;min-height:var(--btn-h-xs);">✕</button>
</div>
<details style="margin-top:var(--space-xs);">
  <summary style="font-size:var(--fs-caption);color:var(--text-muted);cursor:pointer;">Deskripsi per level (opsional)</summary>
  <div style="display:grid;gap:var(--space-xs);margin-top:var(--space-xs);">
    <textarea class="pai-kr-bb" rows="1" placeholder="Baru Berkembang…">${esc(criterion?.deskripsi_baru_berkembang || '')}</textarea>
    <textarea class="pai-kr-layak" rows="1" placeholder="Layak…">${esc(criterion?.deskripsi_layak || '')}</textarea>
    <textarea class="pai-kr-cakap" rows="1" placeholder="Cakap…">${esc(criterion?.deskripsi_cakap || '')}</textarea>
    <textarea class="pai-kr-mahir" rows="1" placeholder="Mahir…">${esc(criterion?.deskripsi_mahir || '')}</textarea>
  </div>
</details>`;
      div.querySelector('.pai-kr-del').addEventListener('click', () => { div.remove(); updateSisaBobot(); });
      div.querySelector('.pai-kr-bobot').addEventListener('input', updateSisaBobot);
      list.appendChild(div);
      updateSisaBobot();
    }

    // Load kriteria existing jika edit mode RUBRIK
    if (asmt?.format_penilaian === 'RUBRIK') {
      try {
        const existing = await loadRubrikCriteria(asmt.id);
        _origCriteriaIds = existing.map(k => k.id);
        existing.forEach(k => appendCriteriaRow(k));
      } catch (e) { _origCriteriaIds = []; }
    } else {
      _origCriteriaIds = [];
    }

    updateTeknikOpts(jenisEl.value, asmt?.teknik || null);
    updateFormatVisibility();

    jenisEl.addEventListener('change', () => {
      updateTeknikOpts(jenisEl.value, null);
      updateFormatVisibility();
    });
    teknikSelEl.addEventListener('change', () => {
      const isLainnya = teknikSelEl.value === 'LAINNYA';
      teknikCustomEl.style.display = isLainnya ? '' : 'none';
      if (!isLainnya) teknikCustomEl.value = '';
    });
    formatEl.addEventListener('change', updateCriteriaVisibility);
    overlay.querySelector('#pai-add-kriteria')?.addEventListener('click', () => appendCriteriaRow(null));

    if (!tps.length) return;
    const tpLabel  = overlay.querySelector('#pai-modal-tp-label');
    const tpSelect = overlay.querySelector('#pai-modal-tp');
    const kktpPrev = overlay.querySelector('#pai-kktp-preview');

    function updateKktpPreview(tpId) {
      if (jenisEl.value !== 'SUMATIF' || !tpId) { kktpPrev.innerHTML = ''; return; }
      const kktps = _items.filter(i => i.tipe === 'KKTP' && i.parent_id === tpId);
      if (!kktps.length) { kktpPrev.innerHTML = 'Belum ada KKTP untuk TP ini.'; return; }
      kktpPrev.innerHTML = 'KKTP: ' + kktps.map(k => esc(k.judul)).join(' · ');
    }

    function updateTpVisibility() {
      const jenis = jenisEl.value;
      const hide  = jenis === 'DIAGNOSTIK_NK';
      tpLabel.style.display  = hide ? 'none' : '';
      tpSelect.style.display = hide ? 'none' : '';
      if (hide) { tpSelect.value = ''; kktpPrev.innerHTML = ''; return; }
      updateKktpPreview(tpSelect.value);
    }

    jenisEl.addEventListener('change', updateTpVisibility);
    tpSelect.addEventListener('change', () => updateKktpPreview(tpSelect.value));
    updateTpVisibility();
  }

  // ─── Modal Pelaksanaan — Step 2 (input nilai per siswa) ─────────────────────

  async function openAsmtNilaiModal(asmt) {
    const grades      = await loadAssessmentGrades(asmt.id);
    const kktpResults = (asmt.jenis === 'SUMATIF') ? await loadKktpResults(asmt.id) : [];
    const sumFormat   = (asmt.jenis === 'SUMATIF') ? (asmt.format_penilaian || 'SKOR') : null;
    const rubrikCriteria = (sumFormat === 'RUBRIK') ? await loadRubrikCriteria(asmt.id) : [];
    const rubrikResults  = (sumFormat === 'RUBRIK') ? await loadRubrikResults(asmt.id) : [];
    const rubrikResultsMap = new Map(rubrikResults.map(r => [r.student_id + '|' + r.criteria_id, r.level]));

    const DK_OPTS = [
      ['Paham Utuh',    'Paham Utuh'],
      ['Paham Sebagian','Paham Sebagian'],
      ['Tidak Paham',   'Tidak Paham'],
    ];

    function getDnkPlaceholder(teknik) {
      const t = (teknik || '').toLowerCase();
      if (t.includes('observasi'))  return 'Contoh: Siswa terlihat antusias dan aktif berinteraksi dengan teman, gaya belajar cenderung visual…';
      if (t.includes('wawancara'))  return 'Contoh: Siswa menyampaikan bahwa merasa nyaman belajar dalam kelompok kecil, lebih mudah memahami materi dengan gambar…';
      if (t.includes('kuesioner'))  return 'Contoh: Berdasarkan kuesioner, siswa menunjukkan minat tinggi pada praktik langsung dan cenderung belajar mandiri…';
      return 'Contoh: Catatan kondisi sosial-emosional dan kesiapan belajar siswa…';
    }

    function getFormPlaceholder(teknik) {
      const t = (teknik || '').toLowerCase();
      if (t.includes('observasi'))         return 'Contoh: Siswa mampu menjelaskan konsep dengan kalimat sendiri, aktif dalam diskusi kelompok…';
      if (t.includes('jurnal'))            return 'Contoh: Hari ini saya belajar tentang… Yang belum saya pahami adalah…';
      if (t.includes('penilaian diri'))    return 'Contoh: Saya merasa sudah memahami materi namun masih kesulitan pada bagian…';
      if (t.includes('antarteman'))        return 'Contoh: Teman saya menunjukkan kemampuan yang baik dalam… dan perlu meningkatkan…';
      if (t.includes('penugasan'))         return 'Contoh: Siswa menyelesaikan tugas dengan…';
      return 'Contoh: Catatan perkembangan belajar siswa…';
    }

    const kktps = asmt.tp_id
      ? _items.filter(i => i.tipe === 'KKTP' && i.parent_id === asmt.tp_id)
              .sort((a, b) => (a.urutan ?? 999) - (b.urutan ?? 999))
      : [];

    const isDiagNk = asmt.jenis === 'DIAGNOSTIK_NK';
    const isDiagK  = asmt.jenis === 'DIAGNOSTIK_K';
    const isDiag   = isDiagNk || isDiagK;
    const isForm   = asmt.jenis === 'FORMATIF';
    const isSum    = asmt.jenis === 'SUMATIF';

    const gradeMap  = new Map(grades.map(g => [g.student_id, g]));
    const kktpMap   = new Map();
    kktpResults.forEach(r => { kktpMap.set(r.student_id + '|' + r.kktp_id, r.tercapai); });

    let headerRow = '';
    if (isForm && _roster.length > 1) {
      headerRow = `<div style="margin-bottom:var(--space-sm);">
  <button type="button" id="pel-copy-all" class="btn-sm"
    style="font-size:var(--fs-caption);">Salin ke semua yang kosong</button>
  <span style="font-size:var(--fs-caption);color:var(--text-muted);margin-left:var(--space-xs);">salin baris pertama ke siswa lain yang belum diisi</span>
</div>`;
    }

    const rows = !_roster.length
      ? '<p class="pai-placeholder">Belum ada siswa di classroom ini.</p>'
      : _roster.map(s => {
          const existing = gradeMap.get(s.id);

          if (isDiagNk) {
            const currVal = existing?.deskripsi || '';
            return `
<div style="padding:var(--space-sm) 0;border-bottom:1px solid var(--border);">
  <div style="font-size:var(--fs-ui);color:var(--text-primary);margin-bottom:var(--space-xs);">${esc(s.full_name)}</div>
  <textarea class="pel-diag-nk-textarea" data-student-id="${esc(s.id)}" rows="2"
    placeholder="${esc(getDnkPlaceholder(asmt.teknik))}">${esc(currVal)}</textarea>
</div>`;
          }

          if (isDiagK) {
            const currVal = existing?.deskripsi || '';
            const opts = DK_OPTS.map(([v, l]) =>
              `<option value="${v}"${currVal === v ? ' selected' : ''}>${l}</option>`
            ).join('');
            return `
<div style="display:flex;align-items:center;gap:var(--space-sm);padding:var(--space-sm) 0;border-bottom:1px solid var(--border);">
  <span style="flex:1;min-width:0;font-size:var(--fs-ui);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(s.full_name)}</span>
  <select class="pel-diag-k-select" data-student-id="${esc(s.id)}" style="flex-shrink:0;max-width:10rem;">
    <option value="">— Pilih —</option>${opts}
  </select>
</div>`;
          }

          if (isForm) {
            const currVal = existing?.deskripsi || '';
            return `
<div style="padding:var(--space-sm) 0;border-bottom:1px solid var(--border);">
  <div style="font-size:var(--fs-ui);color:var(--text-primary);margin-bottom:var(--space-xs);">${esc(s.full_name)}</div>
  <textarea class="pel-form-textarea" data-student-id="${esc(s.id)}" rows="2"
    placeholder="${esc(getFormPlaceholder(asmt.teknik))}">${esc(currVal)}</textarea>
</div>`;
          }

          if (isSum) {
            const kktpRows = kktps.map(k => {
              const tercapai = kktpMap.get(s.id + '|' + k.id) || false;
              return `<label style="display:flex;align-items:center;gap:var(--space-xs);font-size:var(--fs-caption);padding:2px 0;cursor:pointer;">
  <input type="checkbox" class="pel-kktp-cb"
    data-student-id="${esc(s.id)}" data-kktp-id="${esc(k.id)}"${tercapai ? ' checked' : ''}>
  <span>${esc(k.judul)}</span>
</label>`;
            }).join('');

            if (sumFormat === 'RUBRIK') {
              const LEVEL_LABELS = ['Baru Berkembang', 'Layak', 'Cakap', 'Mahir'];
              const criteriaHtml = rubrikCriteria.map(k => {
                const currLevel = rubrikResultsMap.get(s.id + '|' + k.id) || 0;
                const descs = [k.deskripsi_baru_berkembang, k.deskripsi_layak, k.deskripsi_cakap, k.deskripsi_mahir];
                const radios = [1,2,3,4].map(lv => {
                  const desc = descs[lv - 1];
                  return `<label style="display:flex;align-items:flex-start;gap:var(--space-xs);font-size:var(--fs-caption);padding:2px 0;cursor:pointer;"><input type="radio" class="pel-rubrik-radio" name="rubrik-${esc(s.id)}-${esc(k.id)}" data-student-id="${esc(s.id)}" data-criteria-id="${esc(k.id)}" data-bobot="${esc(String(k.bobot))}" value="${lv}"${currLevel === lv ? ' checked' : ''}><span style="flex:1;">${esc(LEVEL_LABELS[lv - 1])}${desc ? `<span style="display:block;font-size:var(--fs-badge);color:var(--text-muted);margin-top:2px;">${esc(desc)}</span>` : ''}</span></label>`;
                }).join('');
                return `<div style="padding:var(--space-xs) 0;border-bottom:1px solid var(--border);"><div style="font-size:var(--fs-caption);font-weight:var(--fw-medium);color:var(--text-secondary);margin-bottom:var(--space-xs);">${esc(k.judul)} <span style="color:var(--text-muted);">(bobot ${k.bobot}%)</span></div><div>${radios}</div></div>`;
              }).join('');
              return `
<div class="pel-rubrik-student" data-student-id="${esc(s.id)}" style="padding:var(--space-sm) 0;border-bottom:1px solid var(--border);">
  <div style="display:flex;align-items:center;gap:var(--space-sm);margin-bottom:var(--space-xs);">
    <span style="flex:1;min-width:0;font-size:var(--fs-ui);font-weight:var(--fw-medium);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(s.full_name)}</span>
    <span class="pel-rubrik-skor-val" data-student-id="${esc(s.id)}" style="font-size:var(--fs-caption);color:var(--text-muted);"></span>
    <span class="pel-sum-pred" data-student-id="${esc(s.id)}" style="flex-shrink:0;font-size:var(--fs-caption);min-width:7rem;text-align:right;"></span>
  </div>
  <div>${criteriaHtml || '<p style="font-size:var(--fs-caption);color:var(--text-muted);">Belum ada kriteria rubrik.</p>'}</div>
  ${kktpRows ? `<div style="margin-top:var(--space-xs);padding-left:var(--space-md);">${kktpRows}</div>` : ''}
</div>`;
            }

            // SKOR path
            const currNilai = existing?.nilai_angka != null ? existing.nilai_angka : '';
            return `
<div style="padding:var(--space-sm) 0;border-bottom:1px solid var(--border);">
  <div style="display:flex;align-items:center;gap:var(--space-sm);">
    <span style="flex:1;min-width:0;font-size:var(--fs-ui);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(s.full_name)}</span>
    <input type="number" class="pel-sum-nilai" data-student-id="${esc(s.id)}"
      min="0" max="100" step="0.5" value="${esc(String(currNilai))}"
      style="flex-shrink:0;max-width:80px;" placeholder="0–100">
    <span class="pel-sum-pred" style="flex-shrink:0;font-size:var(--fs-caption);min-width:7rem;"></span>
  </div>
  ${kktpRows ? `<div style="margin-top:var(--space-xs);padding-left:var(--space-md);">${kktpRows}</div>` : ''}
</div>`;
          }

          return '';
        }).join('');

    const needsTl = isForm || isSum;
    openModal({
      title:     `Isi Nilai — ${esc(asmt.judul)}`,
      bodyHtml:  headerRow + `<div style="max-height:55vh;overflow-y:auto;">${rows}</div>`,
      saveLabel: needsTl ? 'Selesai & Tindak Lanjut' : 'Selesai',
      onSave: async (overlay, close) => {
        if (isDiagNk) {
          const areas = overlay.querySelectorAll('.pel-diag-nk-textarea');
          await Promise.all([...areas].map(ta => {
            const val = ta.value.trim();
            if (!val) {
              if (!gradeMap.has(ta.dataset.studentId)) return Promise.resolve();
              return client.from('student_grades').delete()
                .eq('classroom_id', classroomId).eq('assessment_id', asmt.id)
                .eq('student_id', ta.dataset.studentId)
                .then(({ error }) => { if (error) throw error; });
            }
            return upsertAssessmentGrade(asmt.id, ta.dataset.studentId, asmt.judul,
              { deskripsi: val, nilai_angka: null });
          }));
        } else if (isDiagK) {
          const selects = overlay.querySelectorAll('.pel-diag-k-select');
          await Promise.all([...selects].map(sel => {
            if (!sel.value) {
              if (!gradeMap.has(sel.dataset.studentId)) return Promise.resolve();
              return client.from('student_grades').delete()
                .eq('classroom_id', classroomId).eq('assessment_id', asmt.id)
                .eq('student_id', sel.dataset.studentId)
                .then(({ error }) => { if (error) throw error; });
            }
            return upsertAssessmentGrade(asmt.id, sel.dataset.studentId, asmt.judul,
              { deskripsi: sel.value, nilai_angka: null });
          }));
        } else if (isForm) {
          const areas = overlay.querySelectorAll('.pel-form-textarea');
          await Promise.all([...areas].map(ta => {
            const val = ta.value.trim();
            if (!val) {
              if (!gradeMap.has(ta.dataset.studentId)) return Promise.resolve();
              return client.from('student_grades').delete()
                .eq('classroom_id', classroomId).eq('assessment_id', asmt.id)
                .eq('student_id', ta.dataset.studentId)
                .then(({ error }) => { if (error) throw error; });
            }
            return upsertAssessmentGrade(asmt.id, ta.dataset.studentId, asmt.judul,
              { deskripsi: val, nilai_angka: null });
          }));
        } else if (isSum) {
          if (sumFormat === 'RUBRIK') {
            const checkedRadios = [...overlay.querySelectorAll('.pel-rubrik-radio:checked')];
            const cbs = overlay.querySelectorAll('.pel-kktp-cb');
            await Promise.all(checkedRadios.map(r =>
              upsertRubrikResult(asmt.id, r.dataset.criteriaId, r.dataset.studentId, parseInt(r.value))
            ));
            const studentScores = new Map();
            checkedRadios.forEach(r => {
              const sid = r.dataset.studentId;
              studentScores.set(sid, (studentScores.get(sid) || 0) + (parseInt(r.value) / 4) * parseFloat(r.dataset.bobot));
            });
            await Promise.all([...studentScores.entries()].map(([sid, total]) =>
              upsertAssessmentGrade(asmt.id, sid, asmt.judul,
                { nilai_angka: Math.round(total * 100) / 100, deskripsi: null })
            ));
            await Promise.all([...cbs].map(cb =>
              upsertKktpResult(asmt.id, cb.dataset.studentId, cb.dataset.kktpId, cb.checked)
            ));
          } else {
            const inputs = overlay.querySelectorAll('.pel-sum-nilai');
            const cbs    = overlay.querySelectorAll('.pel-kktp-cb');
            await Promise.all([...inputs].map(inp => {
              const val = inp.value.trim();
              if (val === '') return Promise.resolve();
              const nilai = parseFloat(val);
              if (isNaN(nilai) || nilai < 0 || nilai > 100) return Promise.resolve();
              return upsertAssessmentGrade(asmt.id, inp.dataset.studentId, asmt.judul,
                { nilai_angka: nilai, deskripsi: null });
            }));
            await Promise.all([...cbs].map(cb =>
              upsertKktpResult(asmt.id, cb.dataset.studentId, cb.dataset.kktpId, cb.checked)
            ));
          }
        }
        await loadAll();
        renderPelaksanaan();
        close();
        if (needsTl) {
          const updatedAsmt = _assessments.find(a => a.id === asmt.id);
          if (updatedAsmt) openAsmtTlModal(updatedAsmt);
        }
      }
    });

    if (isForm && _roster.length > 1) {
      const overlay = document.getElementById('assessment-modal');
      overlay?.querySelector('#pel-copy-all')?.addEventListener('click', () => {
        const areas = overlay.querySelectorAll('.pel-form-textarea');
        const src   = areas[0]?.value;
        if (!src) return;
        areas.forEach((a, i) => { if (i > 0 && !a.value) a.value = src; });
      });
    }

    if (isSum) {
      const overlay = document.getElementById('assessment-modal');
      if (sumFormat === 'RUBRIK') {
        function updateRubrikStudentSkor(studentId) {
          let total = 0, allFilled = rubrikCriteria.length > 0;
          rubrikCriteria.forEach(k => {
            const r = overlay?.querySelector(`input[name="rubrik-${studentId}-${k.id}"]:checked`);
            if (r) total += (parseInt(r.value) / 4) * k.bobot;
            else allFilled = false;
          });
          total = Math.round(total * 100) / 100;
          const skorEl = overlay?.querySelector(`.pel-rubrik-skor-val[data-student-id="${studentId}"]`);
          const predEl = overlay?.querySelector(`.pel-sum-pred[data-student-id="${studentId}"]`);
          if (skorEl) skorEl.textContent = allFilled ? String(total) : `${total} (belum lengkap)`;
          if (predEl) {
            if (!allFilled || !rubrikCriteria.length) { predEl.textContent = ''; predEl.style.color = ''; return; }
            let label, color;
            if (total >= 81)      { label = 'Sangat Baik';     color = 'var(--success)'; }
            else if (total >= 61) { label = 'Baik';            color = 'var(--success)'; }
            else if (total >= 41) { label = 'Cukup';           color = 'var(--warning)'; }
            else                  { label = 'Perlu Bimbingan'; color = 'var(--danger)'; }
            predEl.textContent = label;
            predEl.style.color = color;
          }
        }
        overlay?.querySelectorAll('.pel-rubrik-radio').forEach(r => {
          updateRubrikStudentSkor(r.dataset.studentId);
          r.addEventListener('change', () => updateRubrikStudentSkor(r.dataset.studentId));
        });
      } else {
        function updateSumPred(inp) {
          const span = inp.parentElement.querySelector('.pel-sum-pred');
          if (!span) return;
          const v = parseFloat(inp.value);
          if (inp.value.trim() === '' || isNaN(v)) { span.textContent = ''; span.style.color = ''; return; }
          let label, color;
          if (v >= 81)      { label = 'Sangat Baik';     color = 'var(--success)'; }
          else if (v >= 61) { label = 'Baik';            color = 'var(--success)'; }
          else if (v >= 41) { label = 'Cukup';           color = 'var(--warning)'; }
          else              { label = 'Perlu Bimbingan'; color = 'var(--danger)'; }
          span.textContent = label;
          span.style.color = color;
        }
        overlay?.querySelectorAll('.pel-sum-nilai').forEach(inp => {
          updateSumPred(inp);
          inp.addEventListener('input', () => updateSumPred(inp));
        });
      }
    }
  }

  // ─── Modal Pelaksanaan — Step 3 (tindak lanjut) ──────────────────────────────

  function openAsmtTlModal(asmt) {
    const tlOpts = [
      { val: 'PENGAYAAN',    label: 'Pengayaan' },
      { val: 'PENGUATAN',    label: 'Penguatan' },
      { val: 'PENDAMPINGAN', label: 'Pendampingan' },
    ];
    const tlSelect = tlOpts.map(o =>
      `<option value="${o.val}"${asmt.tindak_lanjut === o.val ? ' selected' : ''}>${o.label}</option>`
    ).join('');

    openModal({
      title:     `Tindak Lanjut — ${esc(asmt.judul)}`,
      bodyHtml: `
<label>Tindak Lanjut <span style="color:var(--danger);">*</span></label>
<select id="pai-modal-tl">
  <option value="">— Pilih —</option>
  ${tlSelect}
</select>
<label>Catatan <span style="font-weight:var(--fw-regular);color:var(--text-muted);">(opsional)</span></label>
<textarea id="pai-modal-catatan-tl" rows="3" maxlength="1000"
  placeholder="Catatan tindak lanjut…">${esc(asmt.catatan_tl || '')}</textarea>`,
      saveLabel: 'Simpan Tindak Lanjut',
      onSave: async (overlay, close) => {
        const tl     = overlay.querySelector('#pai-modal-tl').value;
        const catatan = overlay.querySelector('#pai-modal-catatan-tl').value.trim() || null;
        if (!tl) throw new Error('Pilih tindak lanjut terlebih dahulu.');
        await updateAssessment(asmt.id, { tindak_lanjut: tl, catatan_tl: catatan });
        await loadAssessments();
        renderPelaksanaan();
        close();
      }
    });
  }

  // ─── Inline delete confirm (pelaksanaan) ─────────────────────────────────────

  function confirmAsmtDelete(origBtn, id, label) {
    const card = origBtn.closest('.pai-tp-row');
    origBtn.style.display = 'none';

    const bar = document.createElement('div');
    bar.style.cssText = 'display:flex;align-items:center;gap:var(--space-xs);flex-wrap:wrap;padding:var(--space-xs) 0 0 0;border-top:1px solid var(--border);margin-top:var(--space-xs);';
    bar.innerHTML = `<span style="flex:1;min-width:0;font-size:var(--fs-caption);color:var(--text-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">Hapus "${esc(label)}"?</span>`;

    const yesBtn = document.createElement('button');
    yesBtn.className   = 'btn-sm btn-sm-danger';
    yesBtn.style.cssText = 'font-size:var(--fs-caption);min-height:var(--btn-h-xs);padding:0 var(--btn-px-sm);flex-shrink:0;';
    yesBtn.textContent = 'Ya';

    const noBtn = document.createElement('button');
    noBtn.className    = 'btn-sm';
    noBtn.style.cssText = 'font-size:var(--fs-caption);min-height:var(--btn-h-xs);padding:0 var(--btn-px-sm);flex-shrink:0;';
    noBtn.textContent  = 'Tidak';

    bar.appendChild(yesBtn);
    bar.appendChild(noBtn);
    card.appendChild(bar);

    yesBtn.addEventListener('click', async () => {
      yesBtn.disabled = true;
      try {
        await deleteAssessmentById(id);
        await loadAll();
        renderPelaksanaan();
      } catch (err) {
        bar.remove();
        origBtn.style.display = '';
        alert('Gagal hapus: ' + (err.message || 'Error tidak diketahui.'));
      }
    });
    noBtn.addEventListener('click', () => { bar.remove(); origBtn.style.display = ''; });
  }

  // ─── Event delegation — Pelaksanaan ─────────────────────────────────────────

  function initPelDelegation() {
    const body = document.getElementById('pai-pelaksanaan-body');
    if (!body) return;

    body.addEventListener('click', e => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const action = btn.dataset.action;

      switch (action) {
        case 'pel-tab':
          if (btn.dataset.tab && btn.dataset.tab !== _pelTab) {
            _pelTab = btn.dataset.tab;
            renderPelaksanaan();
          }
          break;
        case 'pel-add':
          openAsmtHeaderModal(null);
          break;
        case 'pel-edit': {
          const asmt = _assessments.find(a => a.id === btn.dataset.id);
          if (asmt) openAsmtHeaderModal(asmt);
          break;
        }
        case 'pel-nilai': {
          const asmt = _assessments.find(a => a.id === btn.dataset.id);
          if (asmt) openAsmtNilaiModal(asmt);
          break;
        }
        case 'pel-del': {
          const asmt = _assessments.find(a => a.id === btn.dataset.id);
          if (asmt) confirmAsmtDelete(btn, asmt.id, asmt.judul);
          break;
        }
      }
    });
  }

  // ─── Modal helper ───────────────────────────────────────────────────────────

  function openModal({ title, bodyHtml, onSave, saveLabel = 'Simpan' }) {
    document.getElementById('assessment-modal')?.remove();

    const overlay = document.createElement('div');
    overlay.id        = 'assessment-modal';
    overlay.className = 'share-overlay';
    overlay.innerHTML = `
<div class="modal-box" style="position:fixed;inset:0;width:100%;height:100%;display:flex;flex-direction:column;border-radius:0;padding:0;background:var(--bg-surface);border:none;z-index:1000;">
  <h3 style="padding:var(--card-p) var(--card-p) 0;">${esc(title)}</h3>
  <div class="modal-body" style="flex:1;overflow-y:auto;padding:var(--card-p);">${bodyHtml}</div>
  <div id="pai-modal-err"
    style="color:var(--danger);font-size:var(--fs-caption);min-height:1.2rem;margin:.375rem 0;padding:0 var(--card-p);"></div>
  <div class="modal-actions" style="padding:var(--space-sm) var(--card-p) var(--card-p);">
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
    saveBtn.textContent = saveLabel;
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
        saveBtn.textContent = saveLabel;
      }
    });

    const _ms = document.createElement('style');
    _ms.textContent = `
#assessment-modal .modal-body label{display:block;font-size:var(--fs-caption);font-weight:var(--fw-medium);color:var(--text-primary);margin-top:var(--space-sm);margin-bottom:var(--space-xs);}
#assessment-modal .modal-body input:not([type=checkbox]):not(.pel-sum-nilai),
#assessment-modal .modal-body select:not(.pel-diag-select),
#assessment-modal .modal-body textarea:not(.pel-form-textarea){width:100%;box-sizing:border-box;display:block;background:var(--input-bg);border:1px solid var(--input-border);border-radius:var(--input-r);color:var(--text-primary);font-size:var(--fs-ui);padding:var(--input-py) var(--input-px);font-family:inherit;}
#assessment-modal .modal-body input::placeholder,
#assessment-modal .modal-body textarea::placeholder{color:var(--text-muted);opacity:1;}
#assessment-modal .modal-body input[type=date]{color-scheme:dark;}
#assessment-modal .modal-body input[type=date][value=""]::-webkit-datetime-edit-month-field,
#assessment-modal .modal-body input[type=date][value=""]::-webkit-datetime-edit-day-field,
#assessment-modal .modal-body input[type=date][value=""]::-webkit-datetime-edit-year-field,
#assessment-modal .modal-body input[type=date][value=""]::-webkit-datetime-edit-text{color:var(--text-muted);}
#assessment-modal .modal-body select option{background:var(--bg-elevated);color:var(--text-primary);}`;
    overlay.querySelector('.modal-box').appendChild(_ms);

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
  placeholder="Deskripsi capaian pembelajaran…">${esc(cp?.konten || '')}</textarea>`,
      onSave: async (overlay, close) => {
        const konten = overlay.querySelector('#pai-modal-konten').value.trim();
        if (!konten) throw new Error('Konten CP tidak boleh kosong.');
        if (cp) {
          await updateItem(cp.id, { konten });
        } else {
          await saveItem({ judul: 'CP', tipe: 'CP', konten, urutan: 1, parent_id: null });
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
  placeholder="Deskripsi tambahan…">${esc(tp?.konten || '')}</textarea>`,
      onSave: async (overlay, close) => {
        const judul = overlay.querySelector('#pai-modal-judul').value.trim();
        if (!judul) throw new Error('Judul TP tidak boleh kosong.');
        const konten    = overlay.querySelector('#pai-modal-konten').value.trim() || null;
        if (tp) {
          await updateItem(tp.id, { judul, konten });
        } else {
          await saveItem({ judul, tipe: 'TP', konten, urutan: nextUrutan, parent_id: null });
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
                           parent_id: parentTpId, batas_bawah, batas_atas });
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
    yesBtn.style.cssText = 'font-size:var(--fs-caption);min-height:var(--btn-h-xs);padding:0 var(--btn-px-sm);';
    yesBtn.textContent = 'Ya';

    const noBtn = document.createElement('button');
    noBtn.className   = 'btn-sm';
    noBtn.style.cssText = 'font-size:var(--fs-caption);min-height:var(--btn-h-xs);padding:0 var(--btn-px-sm);';
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
      if (e.target.classList.contains('pai-cp-toggle')) {
        const tog = e.target;
        const txtId = tog.id === 'pai-cp-toggle'
          ? 'pai-cp-text'
          : 'pai-tp-text-' + tog.id.replace('pai-tp-toggle-', '');
        const txt = document.getElementById(txtId);
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
        case 'kktp-edit': {
          const kktp = _items.find(i => i.id === btn.dataset.id);
          if (kktp) openKktpModal(kktp, kktp.parent_id);
          break;
        }
        case 'kktp-del':
          confirmItemDelete(btn, btn.dataset.id, 'KKTP ini');
          break;
        case 'tp-toggle': {
          const tpId = btn.dataset.tpId;
          const body = document.getElementById('pai-tp-body-' + tpId);
          if (!body) break;
          const isOpen = body.style.display === 'block';
          body.style.display = isOpen ? 'none' : 'block';
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

    // Perencanaan default terbuka
    const perBody = document.getElementById('pai-perencanaan-body');
    const perChev = document.querySelector('#pai-perencanaan-header .pai-section-chevron');
    if (perBody) perBody.style.display = '';
    if (perChev) perChev.style.transform = 'rotate(180deg)';
  }

  // ─── Filter ─────────────────────────────────────────────────────────────────

  function initSemesterDropdown() {
    if (_sdAC) { _sdAC.abort(); }
    _sdAC = new AbortController();

    const trigger = document.getElementById('pai-semester-trigger');
    const list    = document.getElementById('pai-semester-list');
    const label   = document.getElementById('pai-semester-label');
    if (!trigger || !list || !label) return;

    function openList() {
      list.style.display = '';
      trigger.classList.add('open');
      trigger.setAttribute('aria-expanded', 'true');
    }
    function closeList() {
      list.style.display = 'none';
      trigger.classList.remove('open');
      trigger.setAttribute('aria-expanded', 'false');
    }
    function isOpen() { return list.style.display !== 'none'; }

    trigger.addEventListener('click', e => {
      e.stopPropagation();
      isOpen() ? closeList() : openList();
    });

    trigger.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); isOpen() ? closeList() : openList(); }
      if (e.key === 'Escape') closeList();
      if (e.key === 'ArrowDown') { e.preventDefault(); openList(); list.querySelector('.custom-select-option')?.focus(); }
    });

    list.querySelectorAll('.custom-select-option').forEach((opt, idx, opts) => {
      opt.setAttribute('tabindex', '-1');
      opt.addEventListener('keydown', e => {
        if (e.key === 'ArrowDown') { e.preventDefault(); opts[idx + 1]?.focus(); }
        if (e.key === 'ArrowUp')   { e.preventDefault(); idx === 0 ? trigger.focus() : opts[idx - 1]?.focus(); }
        if (e.key === 'Escape')    { closeList(); trigger.focus(); }
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); opt.click(); }
      });
      opt.addEventListener('click', async () => {
        const val = parseInt(opt.dataset.value, 10);
        _semester = val;
        label.textContent = opt.textContent;
        list.querySelectorAll('.custom-select-option').forEach(o => o.classList.remove('selected'));
        opt.classList.add('selected');
        closeList();
        trigger.focus();
        await loadAll();
        renderAll();
      });
    });

    document.addEventListener('click', e => {
      if (!document.getElementById('pai-semester-wrap')?.contains(e.target)) closeList();
    }, { signal: _sdAC.signal });
  }

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
      const errEl   = document.getElementById('pai-filter-error');
      const yv = yearInp ? yearInp.value.trim() : '';
      if (!YEAR_RE.test(yv)) {
        if (errEl) errEl.textContent = 'Format tidak valid. Contoh: 2025/2026';
        return;
      }
      if (errEl) errEl.textContent = '';
      _year = yv;
      await loadAll();
      renderAll();
    }

    body.addEventListener('change', async e => {
      if (e.target.id === 'pai-year') await applyFilter();
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
    initFilter();
    initDelegation();
    initPelDelegation();
    await Promise.all([loadRoster(), loadAll()]);
    renderPerencanaan();
    renderPelaksanaan();
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
