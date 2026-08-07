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
    body.innerHTML = `
<div class="penilaian-filter-row" id="penilaian-filter-row">
  <input id="pai-year" type="text" placeholder="2025/2026"
    value="${esc(_year)}" maxlength="9" style="max-width:140px;">
  <select id="pai-semester">
    <option value="1"${_semester === 1 ? ' selected' : ''}>Semester 1</option>
    <option value="2"${_semester === 2 ? ' selected' : ''}>Semester 2</option>
  </select>
</div>
<div id="pai-filter-error"
  style="color:var(--danger);font-size:var(--fs-caption);min-height:1.2rem;margin-top:var(--space-xs);"></div>
<p class="pai-placeholder">Perencanaan akan tersedia di sini.</p>`;
  }

  function renderPelaksanaan() {
    const body = document.getElementById('pai-pelaksanaan-body');
    if (!body) return;
    body.innerHTML =
      '<p class="pai-placeholder">🚧 Segera hadir — Fitur Pelaksanaan Penilaian sedang dalam pengembangan.</p>';
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
    await Promise.all([loadRoster(), loadAll()]);
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
