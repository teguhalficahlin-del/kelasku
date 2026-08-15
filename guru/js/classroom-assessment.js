(function () {
  'use strict';

  const client = window.supabaseClient;
  const SipApi = window.api;

  // ─── State ──────────────────────────────────────────────────────────────────
  let _cId    = null;
  let _tId    = null;
  let _loaded = false;

  let _tpList   = [];  // rows from tp_kktp
  let _asmts    = [];  // rows from assessments
  let _roster   = [];  // [{id, nama}] active students in classroom
  let _sGroups  = {};  // { studentId: grup }
  let _roleGuru = null; // role_guru dari profiles (WALI_KELAS_SD | MAPEL | null)
  let _selMapel = null; // mapel aktif di Section 1 dropdown (WALI_KELAS_SD only, null = belum diinit)

  // ── Rekap section state ────────────────────────────────────────────────────
  let _rcSemester   = '1';
  let _rcTahun      = null;   // diinit ke DEFAULT_YEAR saat pertama renderRecap
  let _rcMapel      = null;
  let _rcTeknik     = null;
  let _rcInstrumen  = null;
  let _rcPage1      = 0;      // DAFTAR NILAI pagination (5 per halaman)
  let _rcPage2      = 0;      // HASIL NILAI pagination (5 per halaman)
  let _rcMetode     = 'rata'; // 'rata' | 'bobot' | 'terbaik'
  let _rcBobots     = [];
  let _rcHasil      = null;   // null | [{id, nama, nilaiAkhir, predikat}]
  let _rcAllResults = [];     // [[result]] paralel dengan filtered sumatifs

  // ─── Constants ──────────────────────────────────────────────────────────────
  const CY           = new Date().getFullYear();
  const DEFAULT_YEAR = `${CY - 1}/${CY}`;

  const INSTRUMEN_MAP = {
    OBSERVASI:   ['Lembar Observasi', 'Catatan Anekdot', 'Checklist'],
    TES:         ['Pilihan Ganda', 'Uraian', 'Campuran'],
    PENUGASAN:   ['Rubrik', 'Checklist'],
    PROYEK:      ['Rubrik', 'Checklist'],
    PORTOFOLIO:  ['Rubrik', 'Checklist'],
    UNJUK_KERJA: ['Rubrik', 'Checklist'],
    TES_LISAN:   ['Wawancara', 'Monolog', 'Dialog'],
  };

  const STATUS_GRUP  = { PAHAM: 'A', BELUM_PAHAM: 'B', PERLU_PERHATIAN: 'C' };
  const STATUS_LBL   = { PAHAM: 'Paham', BELUM_PAHAM: 'Belum Paham', PERLU_PERHATIAN: 'Perlu Perhatian' };
  const JENIS_LBL    = { DIAGNOSTIK: 'Diagnostik', FORMATIF: 'Formatif', SUMATIF: 'Sumatif' };
  const TIPE_LBL     = { CP: 'CP', TP: 'TP', KKTP: 'KKTP' };
  const TIPE_COLOR   = { CP: '#4a7c59', TP: 'var(--gold)', KKTP: '#7c4a7c' };

  const STATUS_FORMATIF_LBL = { TERCAPAI: 'Tercapai', BERKEMBANG: 'Berkembang', PERLU_DUKUNGAN: 'Perlu Dukungan' };
  const PREDIKAT_RUBRIK = [
    { val: 'SB',  lbl: 'Sangat Berkembang' },
    { val: 'BSH', lbl: 'Berkembang Sesuai Harapan' },
    { val: 'MB',  lbl: 'Mulai Berkembang' },
    { val: 'BB',  lbl: 'Belum Berkembang' },
  ];
  const TINGKAT_OBS = ['Terlihat jelas', 'Terlihat', 'Belum terlihat'];

  const DEFAULT_RENTANG = { BB: [0, 54], MB: [55, 69], BSH: [70, 84], SB: [85, 100] };
  const PREDIKAT_ORDER  = ['BB', 'MB', 'BSH', 'SB'];
  const RC_PAGE_SIZE    = 5;

  const MAPEL_SD = [
    'Bahasa Indonesia', 'Matematika', 'IPAS',
    'Pendidikan Pancasila', 'Seni', 'Bahasa Inggris',
  ];

  function teknikLbl(t) {
    if (!t) return '';
    if (t === 'TES') return 'Tes Tertulis';
    return t.split('_').map(w => w.charAt(0) + w.slice(1).toLowerCase()).join(' ');
  }

  // ─── Micro-helpers ──────────────────────────────────────────────────────────
  function esc(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function el(id) { return document.getElementById(id); }

  function toast(msg, ok = true) {
    const t = document.createElement('div');
    t.style.cssText = `position:fixed;bottom:1.5rem;left:50%;transform:translateX(-50%);
      background:${ok ? 'var(--success,#2d6a4f)' : '#c0392b'};color:#fff;
      padding:.5rem 1.25rem;border-radius:.5rem;font-size:var(--fs-ui);
      z-index:9999;box-shadow:0 2px 8px rgba(0,0,0,.3);pointer-events:none`;
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2800);
  }

  function fieldLbl(text) {
    return `<div style="font-size:var(--fs-caption);color:var(--text-secondary);
      margin-bottom:.3rem">${text}</div>`;
  }

  function inputCss(extra) {
    return `width:100%;box-sizing:border-box;
      background:var(--bg-input,rgba(255,255,255,.06));
      border:1px solid var(--border-subtle,rgba(255,255,255,.18));
      color:var(--text-primary);padding:.5rem .625rem;
      border-radius:.375rem;font-size:var(--fs-ui);${extra ?? ''}`;
  }

  // ─── Chip helpers ────────────────────────────────────────────────────────────
  function chipHtml(val, label, selected) {
    const selStyle = selected
      ? 'background:var(--gold);color:var(--text-on-gold,#000);border-color:var(--gold)'
      : 'color:var(--text-secondary);border-color:var(--border-subtle,rgba(255,255,255,.18))';
    return `<span class="pai-chip${selected ? ' pai-chip--sel' : ''}" data-val="${esc(val)}"
      style="display:inline-flex;align-items:center;padding:.3rem .75rem;border-radius:1rem;
      border:1.5px solid;cursor:pointer;font-size:var(--fs-caption);user-select:none;${selStyle}">
      ${esc(label)}</span>`;
  }

  function wireChips(containerEl, multi, onChange) {
    containerEl.addEventListener('click', e => {
      const chip = e.target.closest('.pai-chip');
      if (!chip || !containerEl.contains(chip)) return;
      if (!multi) {
        containerEl.querySelectorAll('.pai-chip').forEach(c => {
          c.classList.remove('pai-chip--sel');
          c.style.background = '';
          c.style.color = 'var(--text-secondary)';
          c.style.borderColor = 'var(--border-subtle,rgba(255,255,255,.18))';
        });
        chip.classList.add('pai-chip--sel');
        chip.style.background = 'var(--gold)';
        chip.style.color = 'var(--text-on-gold,#000)';
        chip.style.borderColor = 'var(--gold)';
      } else {
        const s = chip.classList.toggle('pai-chip--sel');
        chip.style.background = s ? 'var(--gold)' : '';
        chip.style.color = s ? 'var(--text-on-gold,#000)' : 'var(--text-secondary)';
        chip.style.borderColor = s ? 'var(--gold)' : 'var(--border-subtle,rgba(255,255,255,.18))';
      }
      if (onChange) onChange(chip.dataset.val);
    });
  }

  function chipVal(containerEl) {
    return containerEl?.querySelector('.pai-chip--sel')?.dataset.val ?? null;
  }

  // ─── KKTP rentang helpers ────────────────────────────────────────────────────
  function getRentang(item)    { return item?.rentang ?? DEFAULT_RENTANG; }
  function nilaiTengah(predikat, rentang) {
    const r = rentang?.[predikat];
    if (!r) return null;
    return Math.round((r[0] + r[1]) / 2);
  }
  function rentangSummary(rentang) {
    return PREDIKAT_ORDER.map(p => `${p}: ${rentang[p]?.[0] ?? '?'}–${rentang[p]?.[1] ?? '?'}`).join(' · ');
  }
  function getPredikat(nilai, rentang) {
    const r = rentang ?? DEFAULT_RENTANG;
    for (let i = PREDIKAT_ORDER.length - 1; i >= 0; i--) {
      const p = PREDIKAT_ORDER[i];
      if (nilai >= (r[p]?.[0] ?? 0)) return p;
    }
    return PREDIKAT_ORDER[0];
  }
  function kktpStatText(nilai, rentang) {
    if (nilai == null || isNaN(nilai)) return 'KKTP —';
    const p     = getPredikat(nilai, rentang);
    const range = (rentang ?? DEFAULT_RENTANG)[p];
    return `KKTP: ${p} (${range?.[0] ?? '?'}–${range?.[1] ?? '?'})`;
  }
  function kktpStatColor(nilai, rentang) {
    if (nilai == null || isNaN(nilai)) return 'var(--text-secondary)';
    const p = getPredikat(nilai, rentang ?? DEFAULT_RENTANG);
    return p === 'SB' || p === 'BSH' ? 'var(--success,#2d6a4f)' : '#c0392b';
  }
  function buildRentangRowsHtml(rentang) {
    return PREDIKAT_ORDER.map(p => {
      const [low, high] = rentang[p] ?? [0, 100];
      return `<div style="display:flex;align-items:center;gap:.5rem;margin-bottom:.375rem">
        <span style="min-width:2.75rem;font-size:var(--fs-caption);font-weight:600;color:var(--text-primary)">${p}</span>
        <input class="kktp-rentang-low" data-pred="${p}" type="number" min="0" max="100"
          value="${low}" style="${inputCss('width:4.5rem;text-align:center')}">
        <span style="font-size:var(--fs-caption);color:var(--text-secondary)">–</span>
        <input class="kktp-rentang-high" data-pred="${p}" type="number" min="0" max="100"
          value="${high}" style="${inputCss('width:4.5rem;text-align:center')}">
      </div>`;
    }).join('');
  }
  function collectRentang() {
    const box = el('pai-modal-box');
    const r   = {};
    PREDIKAT_ORDER.forEach(p => {
      const low  = box?.querySelector(`.kktp-rentang-low[data-pred="${p}"]`);
      const high = box?.querySelector(`.kktp-rentang-high[data-pred="${p}"]`);
      r[p] = [parseFloat(low?.value) || 0, parseFloat(high?.value) || 100];
    });
    return r;
  }

  // ─── Data loading ────────────────────────────────────────────────────────────
  async function loadAll() {
    const [tp, asmts, grps, roster] = await Promise.all([
      SipApi.getTpKktp(_cId, _tId).catch(() => []),
      SipApi.getAssessments(_cId).catch(() => []),
      SipApi.getStudentGroups(_cId).catch(() => []),
      loadRoster(),
    ]);
    _tpList  = tp ?? [];
    _asmts   = asmts ?? [];
    _sGroups = Object.fromEntries((grps ?? []).map(g => [g.student_id, g.grup]));
    _roster  = roster;
  }

  async function loadRoster() {
    const { data } = await client
      .from('classroom_roster').select('id, full_name')
      .eq('classroom_id', _cId)
      .order('full_name');
    return (data ?? []).map(r => ({ id: r.id, nama: r.full_name }));
  }

  // ─── Init ───────────────────────────────────────────────────────────────────
  async function initAssessmentTab(cId, tId) {
    _cId = cId;
    _tId = tId;
    const panel = el('panel-penilaian');
    if (!panel) return;
    panel.innerHTML = '<div style="padding:1.5rem;color:var(--text-secondary)">Memuat data penilaian…</div>';
    await loadAll();
    _loaded = true;
    renderMain();
  }

  // ─── Main render ─────────────────────────────────────────────────────────────
  function renderMain() {
    const panel = el('panel-penilaian');
    if (!panel) return;

    panel.innerHTML = `
<div class="panel">
  <h2 class="panel-header" data-panel="pan-tp-body"
    style="font-size:var(--fs-h3);color:var(--gold)">
    TP &amp; KKTP <span class="panel-collapse-arrow">▼</span>
  </h2>
  <div class="panel-body-collapse" id="pan-tp-body">
    <div id="pai-tp-list"></div>
    <button type="button" data-action="add-tp"
      style="margin-top:.75rem;min-height:var(--btn-h);background:var(--gold);
      color:var(--text-on-gold);font-weight:var(--fw-medium);font-size:var(--fs-ui);
      padding:0 var(--btn-px);border-radius:var(--btn-r);border:none;cursor:pointer">
      + Tambah TP/KKTP
    </button>
  </div>
</div>

<div class="panel">
  <h2 class="panel-header" data-panel="pan-asmt-body"
    style="font-size:var(--fs-h3);color:var(--gold)">
    Daftar Penilaian <span class="panel-collapse-arrow">▶</span>
  </h2>
  <div class="panel-body-collapse" id="pan-asmt-body" style="display:none">
    <div id="pai-asmt-list"></div>
    <button type="button" data-action="add-asmt"
      style="margin-top:.75rem;min-height:var(--btn-h);background:var(--gold);
      color:var(--text-on-gold);font-weight:var(--fw-medium);font-size:var(--fs-ui);
      padding:0 var(--btn-px);border-radius:var(--btn-r);border:none;cursor:pointer">
      + Tambah Penilaian
    </button>
  </div>
</div>

<div class="panel">
  <h2 class="panel-header" data-panel="pan-recap-body"
    style="font-size:var(--fs-h3);color:var(--gold)">
    Rekap Semester <span class="panel-collapse-arrow">▶</span>
  </h2>
  <div class="panel-body-collapse" id="pan-recap-body" style="display:none">
    <div id="pai-recap-wrap"></div>
  </div>
</div>

<div id="pai-modal" style="display:none;position:fixed;inset:0;
  background:rgba(0,0,0,.6);z-index:1000;overflow-y:auto;
  padding:1rem .75rem;-webkit-overflow-scrolling:touch">
  <div id="pai-modal-box"
    style="background:var(--bg-card,#1e1e1e);border-radius:.75rem;
    max-width:34rem;margin:2rem auto;padding:1.5rem;
    position:relative;box-shadow:0 8px 32px rgba(0,0,0,.5)">
  </div>
</div>`;

    initCollapsePanel();
    panel.addEventListener('click', handleClick);
    renderTpList();
    renderAsmtList();
  }

  // ─── Collapse — single expand, auto-load recap on open ──────────────────────
  function initCollapsePanel() {
    const headers = Array.from(
      el('panel-penilaian')?.querySelectorAll('.panel-header[data-panel]') ?? []
    );
    headers.forEach(h => {
      h.style.cursor = 'pointer';
      h.addEventListener('click', e => {
        if (e.target.closest('button')) return;
        const body = el(h.dataset.panel);
        if (!body) return;
        const open = body.style.display !== 'none';
        if (!open) {
          // Close all other sections
          headers.forEach(oh => {
            if (oh === h) return;
            const ob = el(oh.dataset.panel);
            if (ob) ob.style.display = 'none';
            const oa = oh.querySelector('.panel-collapse-arrow');
            if (oa) oa.textContent = '▶';
          });
          body.style.display = '';
          const arrow = h.querySelector('.panel-collapse-arrow');
          if (arrow) arrow.textContent = '▼';
          if (h.dataset.panel === 'pan-recap-body') renderRecap();
        } else {
          body.style.display = 'none';
          const arrow = h.querySelector('.panel-collapse-arrow');
          if (arrow) arrow.textContent = '▶';
        }
      });
    });
  }

  // ─── Event delegation ────────────────────────────────────────────────────────
  function handleClick(e) {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    switch (btn.dataset.action) {
      case 'add-tp':       openTpModal(null);            break;
      case 'edit-tp':      openTpModal(btn.dataset.id);  break;
      case 'del-tp':       confirmDeleteTp(btn.dataset.id); break;
      case 'add-asmt':     openAsmtModal(null);           break;
      case 'edit-asmt':    openAsmtModal(btn.dataset.id); break;
      case 'del-asmt':     confirmDeleteAsmt(btn.dataset.id); break;
      case 'close-modal':  closeModal();                 break;
    }
  }

  // ─── Modal helpers ───────────────────────────────────────────────────────────
  function openModal() {
    const m = el('pai-modal');
    if (!m) return;
    m.style.display = '';
    m.scrollTop = 0;
    m.onclick = ev => { if (ev.target === m) closeModal(); };
  }
  function closeModal() {
    const m = el('pai-modal');
    if (m) m.style.display = 'none';
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // SECTION 1 — TP & KKTP
  // ══════════════════════════════════════════════════════════════════════════════

  function renderTpList() {
    const c      = el('pai-tp-list');
    if (!c) return;
    const isWali = _roleGuru === 'WALI_KELAS_SD';
    if (isWali && _selMapel === null) _selMapel = MAPEL_SD[0];

    const dropHtml = isWali ? `
<div style="margin-bottom:.75rem">
  <div style="font-size:var(--fs-caption);color:var(--text-secondary);margin-bottom:.3rem">Mata Pelajaran</div>
  <select id="pai-tp-mapel-sel" style="${inputCss('max-width:18rem')}">
    ${MAPEL_SD.map(m => `<option value="${esc(m)}"${m === _selMapel ? ' selected' : ''}>${esc(m)}</option>`).join('')}
  </select>
</div>` : '';

    const allRoots = _tpList.filter(t => !t.parent_id);
    const roots    = isWali
      ? allRoots.filter(t => !t.mapel || t.mapel === _selMapel)
      : allRoots;

    const listHtml = roots.length
      ? roots.map(tp => tpRowHtml(tp)).join('')
      : `<p style="color:var(--text-secondary);font-size:var(--fs-caption)">
          Belum ada TP/KKTP. Klik "+ Tambah TP/KKTP" untuk mulai.</p>`;

    c.innerHTML = dropHtml + listHtml;

    if (isWali) {
      c.querySelector('#pai-tp-mapel-sel')?.addEventListener('change', function () {
        _selMapel = this.value;
        renderTpList();
      });
    }

    // Single-expand collapse wiring — klik header → tutup semua, buka yang diklik
    const headers = Array.from(c.querySelectorAll('.pai-tp-hdr'));
    headers.forEach(hdr => {
      hdr.addEventListener('click', e => {
        if (e.target.closest('button')) return;
        const bodyId = hdr.dataset.bodyId;
        const body   = bodyId ? document.getElementById(bodyId) : null;
        if (!body) return;
        const isOpen = body.style.display !== 'none';
        headers.forEach(oh => {
          const ob = oh.dataset.bodyId ? document.getElementById(oh.dataset.bodyId) : null;
          if (ob) ob.style.display = 'none';
          const oa = oh.querySelector('.pai-tp-arrow');
          if (oa) oa.textContent = '▶';
        });
        if (!isOpen) {
          body.style.display = '';
          const arrow = hdr.querySelector('.pai-tp-arrow');
          if (arrow) arrow.textContent = '▼';
        }
      });
    });
  }

  function tpRowHtml(tp) {
    const kids     = _tpList.filter(t => t.parent_id === tp.id);
    const color    = TIPE_COLOR[tp.tipe] ?? '#555';
    const txtColor = color === 'var(--gold)' ? 'var(--text-on-gold,#000)' : '#fff';
    const bodyId   = `pai-tp-body-${tp.id}`;

    // Header label: CP shows konten snippet, TP/KKTP shows judul
    const hdTxt = tp.tipe === 'CP'
      ? esc(tp.konten ? tp.konten.slice(0, 60) + (tp.konten.length > 60 ? '…' : '') : '—')
      : esc(tp.judul);

    // Body content
    const descHtml = tp.konten
      ? `<div style="padding:.5rem .75rem .5rem 1.5rem;font-size:var(--fs-caption);
            color:var(--text-secondary);
            border-top:1px solid var(--border-subtle,rgba(255,255,255,.08))">
            ${esc(tp.konten)}</div>`
      : '';
    const kHtml = kids.map(k => kktpChildHtml(k)).join('');

    return `
<div style="border:1px solid var(--border-subtle,rgba(255,255,255,.12));
    border-radius:.5rem;margin-bottom:.5rem;overflow:hidden">
  <div class="pai-tp-hdr" data-body-id="${bodyId}"
      style="display:flex;align-items:center;gap:.5rem;padding:.625rem .75rem;
      background:var(--bg-elevated,rgba(255,255,255,.04));cursor:pointer;user-select:none">
    <span style="flex-shrink:0;font-size:.6875rem;font-weight:700;
        padding:.2rem .45rem;border-radius:.25rem;
        background:${color};color:${txtColor}">
      ${TIPE_LBL[tp.tipe] ?? tp.tipe}
    </span>
    <span style="flex:1;font-size:var(--fs-ui);font-weight:var(--fw-medium,500);
        overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${hdTxt}</span>
    <span class="pai-tp-arrow"
        style="font-size:.75rem;color:var(--text-secondary);flex-shrink:0;margin-right:.15rem">▶</span>
    <button type="button" data-action="edit-tp" data-id="${tp.id}"
      style="background:transparent;border:none;cursor:pointer;font-size:1rem;padding:.2rem .35rem;border-radius:.25rem;line-height:1;opacity:.7;flex-shrink:0" title="Edit">✏️</button>
    <button type="button" data-action="del-tp"  data-id="${tp.id}"
      style="background:rgba(231,76,60,.13);border:none;cursor:pointer;font-size:1rem;padding:.35rem .45rem;border-radius:.25rem;line-height:1;color:#e74c3c;min-width:2.25rem;flex-shrink:0" title="Hapus">🗑</button>
  </div>
  <div id="${bodyId}" style="display:none">${descHtml}${kHtml}</div>
</div>`;
  }

  function kktpChildHtml(k) {
    const r = getRentang(k);
    function cell(p) {
      return `<div style="padding:.25rem .375rem;background:var(--bg-elevated,rgba(255,255,255,.04));border-radius:.25rem;font-size:.7rem"><strong style="color:var(--text-secondary)">${p}</strong> ${r[p]?.[0] ?? '?'}–${r[p]?.[1] ?? '?'}</div>`;
    }
    return `
<div style="margin:.25rem .75rem .375rem 1.25rem;border-left:2px solid #7c4a7c;padding:.375rem .625rem">
  <div style="display:flex;align-items:center;gap:.5rem;margin-bottom:.375rem">
    <span style="font-size:.6875rem;font-weight:700;padding:.15rem .4rem;border-radius:.25rem;
        background:#7c4a7c;color:#fff;flex-shrink:0">KKTP</span>
    <span style="flex:1"></span>
    <button type="button" data-action="edit-tp" data-id="${k.id}"
      style="background:transparent;border:none;cursor:pointer;font-size:1rem;padding:.2rem .35rem;border-radius:.25rem;line-height:1;opacity:.7" title="Edit">✏️</button>
    <button type="button" data-action="del-tp"  data-id="${k.id}"
      style="background:rgba(231,76,60,.13);border:none;cursor:pointer;font-size:1rem;padding:.35rem .45rem;border-radius:.25rem;line-height:1;color:#e74c3c;min-width:2.25rem" title="Hapus">🗑</button>
  </div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:.25rem">
    ${cell('BB')}${cell('MB')}${cell('BSH')}${cell('SB')}
  </div>
</div>`;
  }

  function openTpModal(editId) {
    const item   = editId ? _tpList.find(t => t.id === editId) : null;
    const isEdit = !!item;

    let selTipe  = item?.tipe ?? 'TP';
    let selMapel = item?.mapel ?? _selMapel ?? MAPEL_SD[0]; // default ke mapel aktif Section 1

    const isWali = _roleGuru === 'WALI_KELAS_SD';
    // Filter TP induk by mapel aktif agar guru tidak bisa pilih TP dari mapel yang salah
    const tpOpts = _tpList.filter(t =>
      t.tipe === 'TP' && (!isWali || !t.mapel || t.mapel === selMapel)
    );

    const mapelChipsHtml = isWali
      ? `<div style="margin-bottom:.875rem">
          ${fieldLbl('Mata Pelajaran')}
          <select id="tp-mapel-sel" style="${inputCss()}">
            ${MAPEL_SD.map(m => `<option value="${esc(m)}"${m === selMapel ? ' selected' : ''}>${esc(m)}</option>`).join('')}
          </select>
        </div>`
      : '';

    const tipeOpts = ['CP', 'TP', 'KKTP']
      .map(t => `<option value="${t}"${selTipe === t ? ' selected' : ''}>${TIPE_LBL[t]}</option>`).join('');

    const parentOpts = tpOpts.map(t =>
      `<option value="${t.id}"${item?.parent_id === t.id ? ' selected' : ''}>${esc(t.judul)}</option>`
    ).join('');

    el('pai-modal-box').innerHTML = `
<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem">
  <h3 style="margin:0;color:var(--gold)">${isEdit ? 'Edit' : 'Tambah'} TP/KKTP</h3>
  <button data-action="close-modal" style="background:transparent;border:none;cursor:pointer;font-size:1.25rem;padding:.2rem .35rem;border-radius:.25rem;line-height:1;opacity:.7">×</button>
</div>
<div id="tp-form" style="display:flex;flex-direction:column;gap:.875rem">
  ${mapelChipsHtml}
  <div>
    ${fieldLbl('Tipe')}
    <select id="tp-tipe-sel" style="${inputCss()}">${tipeOpts}</select>
  </div>
  <div id="tp-parent-row" style="${selTipe === 'KKTP' ? '' : 'display:none'}">
    ${fieldLbl('TP induk')}
    <select id="tp-parent-sel" style="${inputCss()}">
      <option value="">— Pilih TP —</option>${parentOpts}
    </select>
  </div>
  <div id="tp-judul-row" style="${selTipe === 'CP' ? 'display:none' : ''}">
    ${fieldLbl(selTipe === 'KKTP' ? 'Deskripsi' : 'Judul')}
    <input id="tp-judul" type="text" value="${esc(item?.judul ?? '')}"
      placeholder="${selTipe === 'KKTP' ? 'Deskripsi KKTP…' : 'Judul TP/KKTP…'}" style="${inputCss()}">
  </div>
  <div id="tp-konten-row" style="${selTipe === 'KKTP' ? 'display:none' : ''}">
    ${fieldLbl(selTipe === 'CP' ? 'Deskripsi / Teks CP' : 'Deskripsi (opsional)')}
    <textarea id="tp-konten" rows="3"
      style="${inputCss('resize:vertical')}"
      placeholder="Teks capaian pembelajaran…">${esc(item?.konten ?? '')}</textarea>
  </div>
  <div id="tp-range-row" style="${selTipe === 'KKTP' ? '' : 'display:none'}">
    ${fieldLbl('Rentang Predikat KKTP')}
    ${buildRentangRowsHtml(item ? getRentang(item) : DEFAULT_RENTANG)}
  </div>
  <div style="display:flex;gap:.75rem">
    <div style="flex:1">
      ${fieldLbl('Tahun Ajaran')}
      <input id="tp-year" type="text" maxlength="9"
        value="${esc(item?.academic_year ?? DEFAULT_YEAR)}"
        placeholder="2025/2026" style="${inputCss()}">
    </div>
    <div id="tp-sem-wrap" style="${selTipe === 'CP' ? 'display:none' : ''}">
      ${fieldLbl('Semester')}
      <select id="tp-sem" style="${inputCss()}">
        <option value="1"${(item?.semester ?? 1) === 1 ? ' selected' : ''}>1</option>
        <option value="2"${item?.semester === 2 ? ' selected' : ''}>2</option>
      </select>
    </div>
  </div>
  <div style="display:flex;gap:.75rem;justify-content:flex-end;margin-top:.25rem">
    <button data-action="close-modal" style="min-height:var(--btn-h);background:transparent;color:var(--gold);border:1.5px solid var(--gold-border);font-size:var(--fs-ui);padding:0 var(--btn-px);border-radius:var(--btn-r);cursor:pointer">Batal</button>
    <button id="btn-tp-save"
      style="padding:.5rem 1.25rem;background:var(--gold);
      color:var(--text-on-gold,#000);border:none;border-radius:.375rem;
      font-weight:600;cursor:pointer">${isEdit ? 'Simpan' : 'Tambah'}</button>
  </div>
  <div id="tp-err" style="color:#e74c3c;font-size:var(--fs-caption);display:none"></div>
</div>`;

    if (isWali) {
      el('tp-mapel-sel')?.addEventListener('change', function () {
        selMapel = this.value;
        const filteredTps = _tpList.filter(t =>
          t.tipe === 'TP' && (!t.mapel || t.mapel === selMapel)
        );
        const parentSel = el('tp-parent-sel');
        if (parentSel) {
          parentSel.innerHTML =
            '<option value="">— Pilih TP —</option>' +
            filteredTps.map(t => `<option value="${t.id}">${esc(t.judul)}</option>`).join('');
        }
      });
    }

    el('tp-tipe-sel').addEventListener('change', function () {
      selTipe = this.value;
      const val = selTipe;
      el('tp-parent-row').style.display = val === 'KKTP' ? '' : 'none';
      el('tp-judul-row').style.display  = val === 'CP'   ? 'none' : '';
      el('tp-konten-row').style.display = val === 'KKTP' ? 'none' : '';
      el('tp-range-row').style.display  = val === 'KKTP' ? '' : 'none';
      el('tp-sem-wrap').style.display   = val === 'CP'   ? 'none' : '';
      const judulLbl = el('pai-modal-box').querySelector('#tp-judul-row > div');
      if (judulLbl) judulLbl.textContent = val === 'KKTP' ? 'Deskripsi' : 'Judul';
      const judulEl = el('tp-judul');
      if (judulEl) judulEl.placeholder = val === 'KKTP' ? 'Deskripsi KKTP…' : 'Judul TP/KKTP…';
      const kontenLbl = el('pai-modal-box').querySelector('#tp-konten-row > div');
      if (kontenLbl) kontenLbl.textContent = val === 'CP' ? 'Deskripsi / Teks CP' : 'Deskripsi (opsional)';
    });

    el('tp-parent-sel').addEventListener('change', function () {
      const tp = _tpList.find(t => t.id === this.value);
      // Auto-fill judul dari konten TP induk jika judul masih kosong
      const judulEl = el('tp-judul');
      if (judulEl && judulEl.value.trim() === '') judulEl.value = tp?.konten ?? '';
      // BUG-1.1: wariskan mapel dari TP induk agar KKTP selalu selaras dengan TP-nya
      if (isWali && tp?.mapel) {
        selMapel = tp.mapel;
        const mapelSel = el('tp-mapel-sel');
        if (mapelSel) mapelSel.value = selMapel;
      }
    });

    el('btn-tp-save').addEventListener('click', async () => {
      const judul = selTipe === 'CP' ? '' : el('tp-judul').value.trim();
      if (selTipe !== 'CP' && !judul) {
        el('tp-err').textContent = 'Judul wajib diisi';
        el('tp-err').style.display = '';
        return;
      }
      const payload = {
        tipe:         selTipe,
        judul,
        konten:       selTipe !== 'KKTP' ? (el('tp-konten').value.trim() || null) : null,
        parent_id:    selTipe === 'KKTP' ? (el('tp-parent-sel').value || null) : null,
        rentang:      selTipe === 'KKTP' ? collectRentang() : null,
        batas_bawah:  null,
        batas_atas:   null,
        academic_year: el('tp-year').value.trim() || DEFAULT_YEAR,
        semester:     selTipe === 'CP' ? null : (parseInt(el('tp-sem').value) || 1),
        ...(isWali ? { mapel: selMapel } : {}),
      };
      el('btn-tp-save').disabled = true;
      try {
        if (isEdit) {
          await SipApi.updateTpKktp(editId, payload);
          _tpList = _tpList.map(t => t.id === editId ? { ...t, ...payload } : t);
        } else {
          const n   = _tpList.filter(t => !t.parent_id).length;
          const row = await SipApi.createTpKktp(_cId, _tId, { ...payload, urutan: n + 1 });
          _tpList.push(row);
        }
        closeModal();
        renderTpList();
        toast(`TP/KKTP berhasil ${isEdit ? 'diperbarui' : 'ditambahkan'}`);
      } catch (err) {
        el('tp-err').textContent = err.message || 'Gagal menyimpan';
        el('tp-err').style.display = '';
        el('btn-tp-save').disabled = false;
      }
    });

    openModal();
  }

  async function confirmDeleteTp(id) {
    const item = _tpList.find(t => t.id === id);
    if (!item) return;
    const msg = item.tipe === 'CP'
      ? 'Menghapus CP ini akan menghapus entri ini secara permanen.'
      : item.tipe === 'TP'
        ? 'Menghapus TP ini akan menghapus KKTP dan semua penilaian terkait secara permanen.'
        : 'Menghapus KKTP ini secara permanen.';
    if (!confirm(msg)) return;
    try {
      await SipApi.deleteTpKktp(id);
      _tpList = _tpList.filter(t => t.id !== id && t.parent_id !== id);
      renderTpList();
      toast('TP/KKTP dihapus');
    } catch (err) {
      toast('Gagal menghapus: ' + (err.message || ''), false);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // SECTION 2 — Daftar Penilaian
  // ══════════════════════════════════════════════════════════════════════════════

  function renderAsmtList() {
    const c      = el('pai-asmt-list');
    if (!c) return;
    const isWali = _roleGuru === 'WALI_KELAS_SD';
    if (isWali && _selMapel === null) _selMapel = MAPEL_SD[0];

    const dropHtml = isWali ? `
<div style="margin-bottom:.75rem">
  <div style="font-size:var(--fs-caption);color:var(--text-secondary);margin-bottom:.3rem">Mata Pelajaran</div>
  <select id="pai-asmt-mapel-sel" style="${inputCss('max-width:18rem')}">
    ${MAPEL_SD.map(m => `<option value="${esc(m)}"${m === _selMapel ? ' selected' : ''}>${esc(m)}</option>`).join('')}
  </select>
</div>` : '';

    // Filter penilaian berdasarkan mapel TP (TP tanpa mapel tetap muncul di semua mapel)
    const visible = isWali
      ? _asmts.filter(a => {
          if (!a.tp_kktp_id) return true;
          const tp = _tpList.find(t => t.id === a.tp_kktp_id);
          return !tp || !tp.mapel || tp.mapel === _selMapel;
        })
      : _asmts;

    if (!visible.length) {
      c.innerHTML = dropHtml + `<p style="color:var(--text-secondary);font-size:var(--fs-caption)">
        Belum ada penilaian. Klik "+ Tambah Penilaian" untuk mulai.</p>`;
    } else {
      const grouped = { DIAGNOSTIK: [], FORMATIF: [], SUMATIF: [] };
      visible.forEach(a => { if (grouped[a.jenis]) grouped[a.jenis].push(a); });
      c.innerHTML = dropHtml + ['DIAGNOSTIK', 'FORMATIF', 'SUMATIF'].map(jenis => {
        const list = grouped[jenis];
        if (!list.length) return '';
        return `
<div style="margin-bottom:.875rem">
  <div style="font-size:var(--fs-caption);font-weight:700;color:var(--gold);
      text-transform:uppercase;letter-spacing:.07em;margin-bottom:.4rem">
    ${JENIS_LBL[jenis]}
  </div>
  ${list.map(a => asmtRowHtml(a)).join('')}
</div>`;
      }).join('');
    }

    if (isWali) {
      c.querySelector('#pai-asmt-mapel-sel')?.addEventListener('change', function () {
        _selMapel = this.value;
        renderAsmtList();
      });
    }
  }

  function asmtRowHtml(a) {
    const tp      = _tpList.find(t => t.id === a.tp_kktp_id);
    const teknik  = teknikLbl(a.teknik);
    const title   = [teknik || JENIS_LBL[a.jenis], a.instrumen].filter(Boolean).join(' — ');
    return `
<div style="border:1px solid var(--border-subtle,rgba(255,255,255,.12));
    border-radius:.5rem;margin-bottom:.375rem">
  <div style="display:flex;align-items:center;gap:.5rem;padding:.5rem .75rem">
    <div style="flex:1;min-width:0">
      <div style="font-size:var(--fs-ui);font-weight:var(--fw-medium,500);
          white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(title)}</div>
      ${tp ? `<div style="font-size:var(--fs-caption);color:var(--text-secondary)">
        ${esc(tp.judul)}</div>` : ''}
    </div>
    <button type="button" data-action="edit-asmt" data-id="${a.id}"
      style="background:transparent;border:none;cursor:pointer;font-size:1rem;padding:.2rem .35rem;border-radius:.25rem;line-height:1;opacity:.7" title="Edit">✏️</button>
    <button type="button" data-action="del-asmt"  data-id="${a.id}"
      style="background:rgba(231,76,60,.13);border:1.5px solid rgba(231,76,60,.3);cursor:pointer;font-size:1rem;padding:.35rem .45rem;border-radius:.25rem;line-height:1;color:#e74c3c;min-width:2.25rem;flex-shrink:0" title="Hapus">🗑</button>
  </div>
</div>`;
  }

  async function openAsmtModal(editId) {
    if (!editId) { openAsmtCreateModal(); return; }

    const item   = _asmts.find(a => a.id === editId);
    const tpOpts = _tpList.filter(t => t.tipe === 'TP');

    let selJenis     = item?.jenis     ?? 'FORMATIF';
    let selTeknik    = item?.teknik    ?? '';
    let selInstrumen = item?.instrumen ?? '';

    const isWali    = _roleGuru === 'WALI_KELAS_SD';
    const _initTp   = _tpList.find(t => t.id === item?.tp_kktp_id);
    let selMapel    = _initTp?.mapel ?? _selMapel ?? MAPEL_SD[0];

    const results = await SipApi.getAssessmentResults(editId).catch(() => []);
    const resMap  = Object.fromEntries(results.map(r => [r.student_id, r]));

    function buildTpOptHtml() {
      const candidates = tpOpts.filter(t => !isWali || !t.mapel || t.mapel === selMapel);
      return [
        `<option value="">— Opsional —</option>`,
        ...candidates.map(t => {
          const hasKktp = _tpList.some(k => k.parent_id === t.id && k.tipe === 'KKTP');
          return `<option value="${t.id}"${item?.tp_kktp_id === t.id ? ' selected' : ''}>${esc(t.judul)} ${hasKktp ? '✓' : '⚠'}</option>`;
        }),
      ].join('');
    }

    const teknikOptHtml = ['', 'OBSERVASI', 'TES', 'PENUGASAN', 'PROYEK', 'PORTOFOLIO', 'UNJUK_KERJA', 'TES_LISAN']
      .map(t => `<option value="${t}"${selTeknik === t ? ' selected' : ''}>${t ? teknikLbl(t) : '— Teknik (opsional) —'}</option>`)
      .join('');

    const instrOpts = selTeknik ? (INSTRUMEN_MAP[selTeknik] || [])
      .map(i => `<option value="${i}"${selInstrumen === i ? ' selected' : ''}>${i}</option>`)
      .join('') : '';

    const mapelChipsHtml = isWali
      ? `<div>
          ${fieldLbl('Mata Pelajaran')}
          <select id="asmt-mapel-sel" style="${inputCss()}">
            ${MAPEL_SD.map(m => `<option value="${esc(m)}"${m === selMapel ? ' selected' : ''}>${esc(m)}</option>`).join('')}
          </select>
        </div>`
      : '';

    el('pai-modal-box').innerHTML = `
<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem">
  <h3 style="margin:0;color:var(--gold)">Edit Penilaian</h3>
  <button data-action="close-modal"
    style="background:transparent;border:none;cursor:pointer;font-size:1.25rem;
    padding:.2rem .35rem;border-radius:.25rem;line-height:1;opacity:.7">×</button>
</div>
<div style="display:flex;flex-direction:column;gap:.875rem">
  ${mapelChipsHtml}
  <div>
    ${fieldLbl('Tujuan penilaian')}
    <textarea id="asmt-tujuan" rows="2"
      style="${inputCss('resize:vertical')}"
      placeholder="Apa yang ingin diketahui/dipantau?">${esc(item?.tujuan ?? '')}</textarea>
  </div>
  <div>
    ${fieldLbl('TP yang dinilai')}
    <select id="asmt-tp-sel" style="${inputCss()}">${buildTpOptHtml()}</select>
  </div>
  <div>
    ${fieldLbl('Jenis penilaian')}
    <select id="asmt-jenis-sel" style="${inputCss()}">
      ${['DIAGNOSTIK', 'FORMATIF', 'SUMATIF'].map(j => `<option value="${j}"${selJenis === j ? ' selected' : ''}>${JENIS_LBL[j]}</option>`).join('')}
    </select>
  </div>
  <div>
    ${fieldLbl('Teknik')}
    <select id="asmt-teknik-sel" style="${inputCss()}">${teknikOptHtml}</select>
  </div>
  <div id="asmt-instr-row" style="${instrOpts ? '' : 'display:none'}">
    ${fieldLbl('Instrumen')}
    <select id="asmt-instr-sel" style="${inputCss()}">
      <option value="">— Pilih —</option>${instrOpts}
    </select>
  </div>
  <div id="asmt-body-instr-wrap" class="pai-body-instr-wrap"></div>
  <div id="asmt-output-wrap" style="${selJenis === 'SUMATIF' ? '' : 'display:none'}">
    <div style="font-size:var(--fs-caption);font-weight:700;color:var(--gold);
      text-transform:uppercase;letter-spacing:.07em;margin-bottom:.5rem">Catat Nilai</div>
    <div id="asmt-sum-names" style="display:flex;flex-wrap:wrap;gap:.4rem;margin-bottom:.375rem"></div>
    <div id="asmt-sum-nav"
      style="display:none;align-items:center;gap:.5rem;margin-bottom:.375rem">
      <button type="button" id="asmt-sum-prev"
        style="background:transparent;border:1px solid var(--border-subtle,rgba(255,255,255,.18));
        color:var(--text-secondary);border-radius:.3rem;padding:.15rem .5rem;cursor:pointer;
        font-size:var(--fs-caption)">←</button>
      <span id="asmt-sum-page-lbl"
        style="font-size:var(--fs-caption);color:var(--text-secondary)"></span>
      <button type="button" id="asmt-sum-next"
        style="background:transparent;border:1px solid var(--border-subtle,rgba(255,255,255,.18));
        color:var(--text-secondary);border-radius:.3rem;padding:.15rem .5rem;cursor:pointer;
        font-size:var(--fs-caption)">→</button>
    </div>
    <div id="asmt-sum-dots"
      style="display:flex;gap:.35rem;margin-bottom:.625rem;min-height:.625rem"></div>
    <div id="asmt-sum-input"
      style="display:none;border:1px solid var(--border-subtle,rgba(255,255,255,.18));
      border-radius:.4rem;padding:.625rem .75rem"></div>
  </div>
  <div>
    ${fieldLbl('Refleksi guru (opsional)')}
    <textarea id="asmt-refleksi" rows="2"
      style="${inputCss('resize:vertical')}"
      placeholder="Catatan refleksi…">${esc(item?.refleksi_guru ?? '')}</textarea>
  </div>
  <div style="display:flex;gap:.75rem;justify-content:flex-end;margin-top:.25rem">
    <button data-action="close-modal"
      style="min-height:var(--btn-h);background:transparent;color:var(--gold);
      border:1.5px solid var(--gold-border);font-size:var(--fs-ui);
      padding:0 var(--btn-px);border-radius:var(--btn-r);cursor:pointer">Batal</button>
    <button id="btn-asmt-save"
      style="padding:.5rem 1.25rem;background:var(--gold);
      color:var(--text-on-gold,#000);border:none;border-radius:.375rem;
      font-weight:600;cursor:pointer">Simpan</button>
  </div>
  <div id="asmt-err"
    style="color:#e74c3c;font-size:var(--fs-caption);display:none"></div>
</div>`;

    const bodyInstrWrap = el('asmt-body-instr-wrap');
    wireBodyInstrumen(bodyInstrWrap);

    // ── Wire Mapel dropdown (WALI_KELAS_SD only) → cascade filter TP dropdown ──
    if (isWali) {
      el('asmt-mapel-sel')?.addEventListener('change', function () {
        selMapel = this.value;
        el('asmt-tp-sel').innerHTML = buildTpOptHtml();
      });
    }

    // Explicitly set instrSel.value + wire onchange for initial instrumen state.
    // Some browsers don't honour the `selected` attribute when innerHTML is set
    // dynamically; setting .value programmatically after DOM creation is robust.
    if (selTeknik) {
      const instrSel = el('asmt-instr-sel');
      if (instrSel) {
        if (selInstrumen) instrSel.value = selInstrumen;
        instrSel.onchange = function () {
          selInstrumen = this.value;
          if (selJenis !== 'SUMATIF')
            renderBodyInstrumen(selTeknik, selInstrumen, bodyInstrWrap);
        };
      }
    }

    // Initial Isi Penilaian render + prefill from saved konten
    // TES tidak punya sub-instrumen sehingga selInstrumen kosong — tetap render
    if (selJenis !== 'SUMATIF' && selTeknik && (selInstrumen || selTeknik === 'TES')) {
      renderBodyInstrumen(selTeknik, selInstrumen, bodyInstrWrap);
      if (item?.konten) prefillBodyInstrumen(bodyInstrWrap, item.konten, selTeknik, selInstrumen);
    }

    // ── Wire Jenis dropdown ──────────────────────────────────────────────────
    el('asmt-jenis-sel').addEventListener('change', function () {
      selJenis = this.value;
      const outputWrap = el('asmt-output-wrap');
      if (selJenis === 'SUMATIF') {
        if (outputWrap) outputWrap.style.display = '';
        bodyInstrWrap.innerHTML = '';
        renderSumPage();
      } else {
        if (outputWrap) outputWrap.style.display = 'none';
        renderBodyInstrumen(selTeknik, selInstrumen, bodyInstrWrap);
      }
    });

    // ── Wire Teknik cascade → instrumen → body instrumen ─────────────────────
    el('asmt-teknik-sel').addEventListener('change', function () {
      selTeknik    = this.value;
      selInstrumen = '';
      const opts     = selTeknik ? (INSTRUMEN_MAP[selTeknik] || []) : [];
      const instrRow = el('asmt-instr-row');
      const instrSel = el('asmt-instr-sel');
      if (opts.length) {
        instrSel.innerHTML = `<option value="">— Pilih —</option>` +
          opts.map(i => `<option value="${i}">${i}</option>`).join('');
        instrRow.style.display = '';
        instrSel.onchange = function () {
          selInstrumen = this.value;
          if (selJenis !== 'SUMATIF')
            renderBodyInstrumen(selTeknik, selInstrumen, bodyInstrWrap);
        };
      } else {
        instrRow.style.display = 'none';
      }
      if (selJenis === 'SUMATIF') {
        bodyInstrWrap.innerHTML = '';
        flushSumActive();
        _sumActiveSid = null;
        renderSumPage();
      } else {
        renderBodyInstrumen(selTeknik, '', bodyInstrWrap);
      }
    });

    // ── SUMATIF pagination state ─────────────────────────────────────────────
    const PAGE_SIZE   = 5;
    let _sumPage      = 0;
    let _sumActiveSid = null;
    const _sumNilai   = {};

    // Initialize _sumNilai from resMap
    {
      const isTesInit = !selTeknik || selTeknik === 'TES';
      const kktpInit  = item?.tp_kktp_id
        ? _tpList.filter(t => t.parent_id === item.tp_kktp_id && t.tipe === 'KKTP')
        : [];
      const kktp0Init = kktpInit[0];
      for (const s of _roster) {
        const r = resMap[s.id];
        if (!r) continue;
        if (isTesInit) {
          _sumNilai[s.id] = { nilai: r.nilai ?? null, tl: r.tindak_lanjut ?? null };
        } else {
          const predikat = (r.nilai != null && kktp0Init)
            ? getPredikat(r.nilai, getRentang(kktp0Init))
            : null;
          _sumNilai[s.id] = { predikat, nilai: r.nilai ?? null, tl: r.tindak_lanjut ?? null };
        }
      }
    }

    function flushSumActive() {
      if (!_sumActiveSid) return;
      const tlEl  = el('asmt-sum-tl');
      const isTes = !selTeknik || selTeknik === 'TES';
      if (isTes) {
        const nilaiEl = el('asmt-sum-nilai');
        const raw     = nilaiEl?.value;
        const n       = raw !== '' && raw != null ? parseFloat(raw) : null;
        _sumNilai[_sumActiveSid] = {
          nilai: isNaN(n) ? null : n,
          tl:    tlEl ? chipVal(tlEl) : null,
        };
      } else {
        const predChipsEl = el('asmt-sum-pred-chips');
        const selPred     = predChipsEl ? chipVal(predChipsEl) : null;
        const kktp        = getKktpItems()[0];
        const rent        = kktp ? getRentang(kktp) : null;
        const autoN       = selPred && rent ? nilaiTengah(selPred, rent) : null;
        _sumNilai[_sumActiveSid] = {
          predikat: selPred,
          nilai:    autoN,
          tl:       tlEl ? chipVal(tlEl) : null,
        };
      }
    }

    function renderSumInput() {
      const inputEl = el('asmt-sum-input');
      if (!_sumActiveSid) { if (inputEl) inputEl.style.display = 'none'; return; }
      const stu   = _roster.find(r => r.id === _sumActiveSid);
      const vals  = _sumNilai[_sumActiveSid] ?? {};
      const kktp  = getKktpItems()[0];
      const rent  = kktp ? getRentang(kktp) : null;
      const isTes = !selTeknik || selTeknik === 'TES';

      const namaHtml = `<div style="font-size:var(--fs-ui);font-weight:600;margin-bottom:.5rem">
        ${esc(stu?.nama ?? '')}</div>`;

      let valorHtml;
      if (isTes) {
        const kktpColor = kktp && vals.nilai != null ? kktpStatColor(vals.nilai, rent) : 'var(--text-secondary)';
        const kktpStr   = kktp && vals.nilai != null ? kktpStatText(vals.nilai, rent) : '';
        valorHtml = `
<div style="display:flex;align-items:center;gap:.5rem;margin-bottom:.375rem">
  <input type="number" id="asmt-sum-nilai" min="0" max="100" step="0.5"
    placeholder="Nilai 0–100"
    value="${vals.nilai != null ? String(vals.nilai) : ''}"
    style="${inputCss('width:7rem;font-size:var(--fs-caption)')}">
  <span id="asmt-sum-kktp"
    style="font-size:var(--fs-caption);color:${kktpColor}">${kktpStr}</span>
</div>`;
      } else {
        const selPred   = vals.predikat ?? null;
        const autoN     = selPred && rent ? nilaiTengah(selPred, rent) : null;
        const kktpColor = autoN != null ? kktpStatColor(autoN, rent) : 'var(--text-secondary)';
        const kktpStr   = kktp
          ? (autoN != null ? kktpStatText(autoN, rent) : 'Pilih predikat')
          : '';
        valorHtml = `
<div style="margin-bottom:.375rem">
  <div style="font-size:var(--fs-caption);color:var(--text-secondary);margin-bottom:.25rem">Predikat:</div>
  <div id="asmt-sum-pred-chips" style="display:flex;flex-wrap:wrap;gap:.35rem">
    ${PREDIKAT_ORDER.map(p => chipHtml(p, p, selPred === p)).join('')}
  </div>
  <div style="margin-top:.375rem;display:flex;align-items:center;gap:.5rem;flex-wrap:wrap">
    <span style="font-size:var(--fs-caption);color:var(--text-secondary)">Nilai:</span>
    <span id="asmt-sum-pred-nilai"
      style="font-size:var(--fs-ui);font-weight:600;min-width:2rem">
      ${autoN != null ? autoN : '—'}</span>
    <span id="asmt-sum-kktp"
      style="font-size:var(--fs-caption);color:${kktpColor}">${kktpStr}</span>
  </div>
</div>`;
      }

      const tlHtml = `
<div>
  <div style="font-size:var(--fs-caption);color:var(--text-secondary);margin-bottom:.25rem">
    Tindak lanjut:</div>
  <div id="asmt-sum-tl" style="display:flex;flex-wrap:wrap;gap:.35rem">
    ${[['PENGAYAAN','Pengayaan'],['PENGUATAN','Penguatan'],['PENDAMPINGAN','Pendampingan']].map(([v,l]) => chipHtml(v, l, vals.tl === v)).join('')}
  </div>
</div>`;

      inputEl.innerHTML = namaHtml + valorHtml + tlHtml;
      inputEl.style.display = '';

      if (isTes) {
        el('asmt-sum-nilai')?.addEventListener('input', function () {
          const kktp2  = getKktpItems()[0];
          const kktpEl = el('asmt-sum-kktp');
          if (!kktpEl) return;
          const n     = this.value === '' ? null : parseFloat(this.value);
          const rent2 = kktp2 ? getRentang(kktp2) : null;
          kktpEl.textContent = kktp2 ? kktpStatText(n, rent2) : '';
          kktpEl.style.color = kktp2 ? kktpStatColor(n, rent2) : 'var(--text-secondary)';
        });
      } else {
        const predChipsEl = el('asmt-sum-pred-chips');
        if (predChipsEl) {
          wireChips(predChipsEl, false, selVal => {
            const kktp2   = getKktpItems()[0];
            const rent2   = kktp2 ? getRentang(kktp2) : null;
            const autoN2  = rent2 ? nilaiTengah(selVal, rent2) : null;
            const nilaiEl = el('asmt-sum-pred-nilai');
            const kktpEl  = el('asmt-sum-kktp');
            if (nilaiEl) nilaiEl.textContent = autoN2 != null ? String(autoN2) : '—';
            if (kktpEl) {
              kktpEl.textContent = autoN2 != null && kktp2 ? kktpStatText(autoN2, rent2) : '';
              kktpEl.style.color = autoN2 != null ? kktpStatColor(autoN2, rent2) : 'var(--text-secondary)';
            }
          });
        }
      }

      wireChips(el('asmt-sum-tl'), false);
    }

    function renderSumPage() {
      const names   = el('asmt-sum-names');
      const nav     = el('asmt-sum-nav');
      const pageLbl = el('asmt-sum-page-lbl');
      const dots    = el('asmt-sum-dots');
      if (!names) return;
      const total = _roster.length;
      const pages = Math.ceil(total / PAGE_SIZE) || 1;
      _sumPage    = Math.max(0, Math.min(_sumPage, pages - 1));
      const slice = _roster.slice(_sumPage * PAGE_SIZE, (_sumPage + 1) * PAGE_SIZE);
      names.innerHTML = slice.map(s => {
        const isAct  = s.id === _sumActiveSid;
        const hasVal = _sumNilai[s.id]?.nilai != null || _sumNilai[s.id]?.predikat != null;
        return `<button type="button" data-sum-sid="${esc(s.id)}"
          style="padding:.3rem .7rem;border-radius:1rem;font-size:var(--fs-caption);cursor:pointer;
          border:1.5px solid ${isAct ? 'var(--gold)' : hasVal ? 'rgba(255,255,255,.4)' : 'var(--border-subtle,rgba(255,255,255,.18))'};
          background:${isAct ? 'var(--gold)' : 'transparent'};
          color:${isAct ? 'var(--text-on-gold,#000)' : hasVal ? 'var(--text-primary)' : 'var(--text-secondary)'}">
          ${esc(s.nama)}${hasVal ? ' ✓' : ''}</button>`;
      }).join('');
      names.querySelectorAll('[data-sum-sid]').forEach(btn => {
        btn.addEventListener('click', () => {
          flushSumActive();
          _sumActiveSid = btn.dataset.sumSid;
          renderSumPage();
        });
      });
      if (pages > 1) {
        nav.style.display = 'flex';
        if (pageLbl) pageLbl.textContent = `halaman ${_sumPage + 1}/${pages}`;
        const prevBtn = el('asmt-sum-prev');
        const nextBtn = el('asmt-sum-next');
        if (prevBtn) prevBtn.disabled = _sumPage === 0;
        if (nextBtn) nextBtn.disabled = _sumPage === pages - 1;
      } else {
        nav.style.display = 'none';
      }
      if (dots) {
        dots.innerHTML = pages > 1
          ? Array.from({length: pages}, (_, i) =>
              `<span style="width:.5rem;height:.5rem;border-radius:50%;display:inline-block;
              background:${i === _sumPage ? 'var(--gold)' : 'var(--border-subtle,rgba(255,255,255,.3))'}"></span>`
            ).join('')
          : '';
      }
      if (_sumActiveSid && !slice.some(s => s.id === _sumActiveSid)) _sumActiveSid = null;
      renderSumInput();
    }

    // ── Helpers ──────────────────────────────────────────────────────────────
    function getKktpItems() {
      const tpId = el('asmt-tp-sel')?.value || null;
      return tpId ? _tpList.filter(t => t.parent_id === tpId && t.tipe === 'KKTP') : [];
    }

    // ── Wire TP change ────────────────────────────────────────────────────────
    el('asmt-tp-sel').addEventListener('change', () => { renderSumInput(); });

    // ── Wire pagination buttons ───────────────────────────────────────────────
    el('asmt-sum-prev')?.addEventListener('click', () => {
      flushSumActive(); _sumPage--; renderSumPage();
    });
    el('asmt-sum-next')?.addEventListener('click', () => {
      flushSumActive(); _sumPage++; renderSumPage();
    });

    // ── Initial render ────────────────────────────────────────────────────────
    if (selJenis === 'SUMATIF') renderSumPage();

    // ── Save ─────────────────────────────────────────────────────────────────
    el('btn-asmt-save').addEventListener('click', async () => {
      const errEl     = el('asmt-err');
      const instrBody = collectBodyInstrumen(bodyInstrWrap, selTeknik, selInstrumen);
      const payload = {
        tp_kktp_id:    el('asmt-tp-sel').value || null,
        jenis:         selJenis,
        teknik:        el('asmt-teknik-sel').value || null,
        instrumen:     el('asmt-instr-sel')?.value || null,
        tujuan:        el('asmt-tujuan').value.trim() || null,
        konten:        instrBody || null,
        refleksi_guru: el('asmt-refleksi').value.trim() || null,
      };
      el('btn-asmt-save').disabled = true;
      errEl.style.display = 'none';
      try {
        await SipApi.updateAssessment(editId, payload);
        _asmts = _asmts.map(a => a.id === editId ? { ...a, ...payload } : a);

        const kktpItems = getKktpItems();
        if (selJenis === 'SUMATIF') {
          flushSumActive();
          for (const [sid, vals] of Object.entries(_sumNilai)) {
            if (vals.nilai == null) continue;
            const kktp       = kktpItems[0];
            const resPayload = { nilai: vals.nilai, tindak_lanjut: vals.tl || null };
            if (kktp) {
              const p = getPredikat(vals.nilai, getRentang(kktp));
              resPayload.kktp_tercapai = p === 'BSH' || p === 'SB';
            }
            try { await SipApi.upsertAssessmentResult(_cId, _tId, editId, sid, resPayload); } catch {}
          }
        } else {
          const srows = el('pai-modal-box').querySelectorAll('.pai-srow');
          for (const srow of srows) {
            const sid        = srow.dataset.sid;
            const resPayload = buildResultPayload(srow, selJenis, kktpItems);
            if (selJenis === 'DIAGNOSTIK' && resPayload.grup_diferensiasi) {
              try {
                await SipApi.upsertStudentGroup(_cId, sid, resPayload.grup_diferensiasi);
                _sGroups[sid] = resPayload.grup_diferensiasi;
              } catch {}
            }
            try { await SipApi.upsertAssessmentResult(_cId, _tId, editId, sid, resPayload); } catch {}
          }
        }

        closeModal();
        renderAsmtList();
        toast('Penilaian berhasil diperbarui');
      } catch (err) {
        errEl.textContent = err.message || 'Gagal menyimpan';
        errEl.style.display = '';
        el('btn-asmt-save').disabled = false;
      }
    });

    openModal();
  }

  async function confirmDeleteAsmt(id) {
    const item = _asmts.find(a => a.id === id);
    if (!item || !confirm('Hapus penilaian ini? Semua hasil siswa akan ikut terhapus.')) return;
    try {
      await SipApi.deleteAssessment(id);
      _asmts = _asmts.filter(a => a.id !== id);
      renderAsmtList();
      toast('Penilaian dihapus');
    } catch (err) {
      toast('Gagal menghapus: ' + (err.message || ''), false);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // ISI PENILAIAN — helpers untuk 42 pola wireframe
  // ══════════════════════════════════════════════════════════════════════════════

  function siswaPickerHtml(pickerId) {
    const opts = _roster.map(s =>
      `<option value="${esc(s.id)}">${esc(s.nama)}</option>`
    ).join('');
    return `<div class="pai-sw-picker" style="margin-top:.35rem">
  <div class="pai-sw-chips" style="display:flex;flex-wrap:wrap;gap:.3rem;
    min-height:1.25rem;margin-bottom:.3rem"></div>
  ${_roster.length
    ? `<select class="pai-sw-sel" style="${inputCss('font-size:var(--fs-caption)')}">
        <option value="">+ Pilih siswa</option>${opts}
      </select>`
    : `<span style="color:var(--text-secondary);font-size:var(--fs-caption)">
        Belum ada siswa</span>`}
</div>`;
  }

  function chipSiswaHtml(sid, nama) {
    return `<span class="pai-sw-chip" data-sid="${esc(sid)}"
      style="display:inline-flex;align-items:center;gap:.25rem;padding:.15rem .5rem;
      border-radius:1rem;background:var(--gold);color:var(--text-on-gold,#000);
      font-size:var(--fs-caption);cursor:pointer" title="Klik untuk hapus">
      ${esc(nama)} ×</span>`;
  }

  function aspekRowHtml(idx) {
    return `<div class="pai-aspek-row" data-aspek="${idx}"
      style="border:1px solid var(--border-subtle,rgba(255,255,255,.12));
      border-radius:.5rem;padding:.625rem .75rem;margin-bottom:.5rem">
  <div style="display:flex;gap:.5rem;align-items:center;margin-bottom:.625rem">
    <label style="font-size:var(--fs-caption);color:var(--text-secondary);
      white-space:nowrap">Aspek ${idx + 1}:</label>
    <input class="aspek-nama" type="text" placeholder="Nama aspek…"
      style="${inputCss('flex:1')}">
    <button type="button" class="btn-del-aspek"
      style="background:transparent;border:none;cursor:pointer;font-size:.875rem;
      color:var(--text-secondary);padding:.2rem .35rem;border-radius:.25rem;
      opacity:.7" title="Hapus aspek">✕</button>
  </div>
  ${PREDIKAT_RUBRIK.map(p => `
  <div class="pai-pred-block" style="padding:.5rem 0;
    border-top:1px solid var(--border-subtle,rgba(255,255,255,.08))">
    <div style="font-size:var(--fs-caption);font-weight:600;margin-bottom:.3rem">
      ${esc(p.lbl)}</div>
    <textarea class="predikat-desk predikat-desk-${esc(p.val)}" rows="2"
      placeholder="Deskripsi deskriptor… (opsional)"
      style="${inputCss('resize:vertical;font-size:var(--fs-caption)')}"></textarea>
    <div style="font-size:var(--fs-caption);color:var(--text-secondary);
      margin:.25rem 0 .1rem">Siswa:</div>
    ${siswaPickerHtml(`aspek-${idx}-${p.val}`)}
  </div>`).join('')}
</div>`;
  }

  function checklistItemHtml(idx) {
    return `<div class="pai-item-row" data-item="${idx}"
      style="border:1px solid var(--border-subtle,rgba(255,255,255,.12));
      border-radius:.5rem;padding:.5rem .75rem;margin-bottom:.375rem">
  <div style="display:flex;gap:.5rem;align-items:center;margin-bottom:.375rem">
    <label style="font-size:var(--fs-caption);color:var(--text-secondary);
      white-space:nowrap">Item ${idx + 1}:</label>
    <input class="item-nama" type="text" placeholder="Deskripsi item…"
      style="${inputCss('flex:1')}">
    <button type="button" class="btn-del-item"
      style="background:transparent;border:none;cursor:pointer;font-size:.875rem;
      color:var(--text-secondary);padding:.2rem .35rem;border-radius:.25rem;
      opacity:.7" title="Hapus item">✕</button>
  </div>
  <div style="font-size:var(--fs-caption);color:var(--text-secondary);
    margin-bottom:.1rem">Siswa yang memenuhi:</div>
  ${siswaPickerHtml(`item-${idx}`)}
</div>`;
  }

  function observasiAspekHtml(idx) {
    return `<div class="pai-obs-aspek" data-aspek="${idx}"
      style="border:1px solid var(--border-subtle,rgba(255,255,255,.12));
      border-radius:.5rem;padding:.625rem .75rem;margin-bottom:.5rem">
  <div style="display:flex;gap:.5rem;align-items:center;margin-bottom:.375rem">
    <label style="font-size:var(--fs-caption);color:var(--text-secondary);
      white-space:nowrap">Aspek ${idx + 1}:</label>
    <input class="obs-aspek-nama" type="text" placeholder="Nama aspek observasi…"
      style="${inputCss('flex:1')}">
    <button type="button" class="btn-del-obs-aspek"
      style="background:transparent;border:none;cursor:pointer;font-size:.875rem;
      color:var(--text-secondary);padding:.2rem .35rem;border-radius:.25rem;
      opacity:.7" title="Hapus aspek">✕</button>
  </div>
  <div style="margin-bottom:.375rem">
    <div style="font-size:var(--fs-caption);color:var(--text-secondary);
      margin-bottom:.2rem">Indikator (opsional):</div>
    <input class="obs-indikator" type="text" placeholder="Tuliskan indikator…"
      style="${inputCss()}">
  </div>
  ${TINGKAT_OBS.map(t => `
  <div style="padding:.375rem 0;
    border-top:1px solid var(--border-subtle,rgba(255,255,255,.08))">
    <div style="font-size:var(--fs-caption);font-weight:600;margin-bottom:.25rem">
      ${esc(t)}:</div>
    ${siswaPickerHtml(`obs-${idx}-${t.replace(/\s/g, '_')}`)}
  </div>`).join('')}
</div>`;
  }

  function anekdotCatatanHtml(idx, modePerSiswa) {
    const siswaOpts = _roster.map(s =>
      `<option value="${esc(s.id)}">${esc(s.nama)}</option>`
    ).join('');
    return `<div class="pai-anekdot-row" data-catatan="${idx}"
      style="border:1px solid var(--border-subtle,rgba(255,255,255,.12));
      border-radius:.5rem;padding:.5rem .75rem;margin-bottom:.375rem">
  <div style="display:flex;justify-content:space-between;align-items:center;
    margin-bottom:.375rem">
    <span style="font-size:var(--fs-caption);font-weight:600">
      Catatan ${idx + 1}</span>
    <button type="button" class="btn-del-catatan"
      style="background:transparent;border:none;cursor:pointer;font-size:.875rem;
      color:var(--text-secondary);padding:.2rem .35rem;border-radius:.25rem;
      opacity:.7" title="Hapus catatan">✕</button>
  </div>
  ${modePerSiswa
    ? `<div style="margin-bottom:.375rem">
        ${fieldLbl('Siswa')}
        <select class="anekdot-siswa-sel"
          style="${inputCss('font-size:var(--fs-caption)')}">
          <option value="">— Pilih siswa —</option>${siswaOpts}
        </select>
      </div>`
    : `<div style="margin-bottom:.375rem">
        <div style="font-size:var(--fs-caption);color:var(--text-secondary);
          margin-bottom:.25rem">Siswa yang terlibat:</div>
        ${siswaPickerHtml(`anekdot-${idx}-siswa`)}
      </div>`}
  <div style="margin-bottom:.375rem">
    ${fieldLbl('Deskripsi kejadian')}
    <textarea class="anekdot-deskripsi" rows="2" placeholder="Tuliskan kejadian…"
      style="${inputCss('resize:vertical;font-size:var(--fs-caption)')}"></textarea>
  </div>
  <div>
    ${fieldLbl('Interpretasi (opsional)')}
    <textarea class="anekdot-interpretasi" rows="2"
      placeholder="Tuliskan interpretasi opsional…"
      style="${inputCss('resize:vertical;font-size:var(--fs-caption)')}"></textarea>
  </div>
</div>`;
  }

  function pgSoalHtml(idx) {
    return `<div class="pai-pg-soal" data-soal="${idx}"
      style="border:1px solid var(--border-subtle,rgba(255,255,255,.12));
      border-radius:.5rem;padding:.5rem .75rem;margin-bottom:.375rem">
  <div style="display:flex;justify-content:space-between;align-items:center;
    margin-bottom:.375rem">
    <span style="font-size:var(--fs-caption);font-weight:600">Soal ${idx + 1}</span>
    <button type="button" class="btn-del-pg-soal"
      style="background:transparent;border:none;cursor:pointer;font-size:.875rem;
      color:var(--text-secondary);padding:.2rem .35rem;border-radius:.25rem;
      opacity:.7" title="Hapus soal">✕</button>
  </div>
  <div style="margin-bottom:.375rem">
    ${fieldLbl('Pertanyaan (opsional)')}
    <textarea class="pg-pertanyaan" rows="2" placeholder="Tuliskan pertanyaan…"
      style="${inputCss('resize:vertical;font-size:var(--fs-caption)')}"></textarea>
  </div>
  <div style="margin-bottom:.375rem">
    ${fieldLbl('Kunci jawaban')}
    <select class="pg-kunci" style="${inputCss('font-size:var(--fs-caption)')}">
      ${['A','B','C','D'].map(k => `<option value="${k}">${k}</option>`).join('')}
    </select>
  </div>
  <div style="margin-bottom:.25rem">
    <div style="font-size:var(--fs-caption);color:var(--text-secondary);
      margin-bottom:.2rem">Siswa menjawab benar:</div>
    ${siswaPickerHtml(`pg-${idx}-benar`)}
  </div>
  <div>
    <div style="font-size:var(--fs-caption);color:var(--text-secondary);
      margin-bottom:.2rem">Siswa menjawab salah:</div>
    ${siswaPickerHtml(`pg-${idx}-salah`)}
  </div>
</div>`;
  }

  function uraianSoalHtml(idx) {
    const skorRows = _roster.map(s => `
<div class="uraian-srow" data-sid="${esc(s.id)}"
  style="display:flex;align-items:center;gap:.5rem;padding:.25rem 0">
  <span style="flex:1;font-size:var(--fs-caption)">${esc(s.nama)}</span>
  <input type="number" class="uraian-skor" min="0" placeholder="Skor"
    style="${inputCss('width:5rem;font-size:var(--fs-caption);text-align:center')}">
</div>`).join('');
    return `<div class="pai-uraian-soal" data-soal="${idx}"
      style="border:1px solid var(--border-subtle,rgba(255,255,255,.12));
      border-radius:.5rem;padding:.5rem .75rem;margin-bottom:.375rem">
  <div style="display:flex;justify-content:space-between;align-items:center;
    margin-bottom:.375rem">
    <span style="font-size:var(--fs-caption);font-weight:600">Soal ${idx + 1}</span>
    <button type="button" class="btn-del-uraian-soal"
      style="background:transparent;border:none;cursor:pointer;font-size:.875rem;
      color:var(--text-secondary);padding:.2rem .35rem;border-radius:.25rem;
      opacity:.7" title="Hapus soal">✕</button>
  </div>
  <div style="margin-bottom:.375rem">
    ${fieldLbl('Pertanyaan (opsional)')}
    <textarea class="uraian-pertanyaan" rows="2" placeholder="Tuliskan pertanyaan…"
      style="${inputCss('resize:vertical;font-size:var(--fs-caption)')}"></textarea>
  </div>
  <div style="display:flex;gap:.5rem;margin-bottom:.375rem">
    <div style="flex:0 0 8rem">
      ${fieldLbl('Skor maksimal')}
      <input type="number" class="uraian-skor-maks" min="0" value="10"
        style="${inputCss('font-size:var(--fs-caption)')}">
    </div>
  </div>
  <div style="margin-bottom:.375rem">
    ${fieldLbl('Rubrik opsional')}
    <textarea class="uraian-rubrik" rows="2"
      placeholder="Tuliskan kriteria penilaian…"
      style="${inputCss('resize:vertical;font-size:var(--fs-caption)')}"></textarea>
  </div>
  <div>
    <div style="font-size:var(--fs-caption);color:var(--text-secondary);
      margin-bottom:.25rem">Input skor per siswa:</div>
    <div class="uraian-skor-rows">${skorRows}</div>
  </div>
</div>`;
  }

  function konteksPrefixHtml(teknik) {
    if (teknik === 'PENUGASAN') return `
<div style="margin-bottom:.5rem">
  ${fieldLbl('Deskripsi tugas (opsional)')}
  <textarea id="pai-konteks-1" rows="2" placeholder="Tuliskan deskripsi tugas…"
    style="${inputCss('resize:vertical;font-size:var(--fs-caption)')}"></textarea>
</div>`;
    if (teknik === 'PROYEK') return `
<div style="margin-bottom:.5rem">
  ${fieldLbl('Nama proyek (opsional)')}
  <input type="text" id="pai-konteks-1" placeholder="Tuliskan nama proyek…"
    style="${inputCss()}">
  <div style="margin-top:.375rem">
    ${fieldLbl('Deskripsi (opsional)')}
    <textarea id="pai-konteks-2" rows="2" placeholder="Tuliskan deskripsi proyek…"
      style="${inputCss('resize:vertical;font-size:var(--fs-caption)')}"></textarea>
  </div>
</div>`;
    if (teknik === 'PORTOFOLIO') return `
<div style="margin-bottom:.5rem">
  ${fieldLbl('Tema portofolio (opsional)')}
  <input type="text" id="pai-konteks-1" placeholder="Tuliskan tema…"
    style="${inputCss()}">
  <div style="margin-top:.375rem">
    ${fieldLbl('Periode (opsional)')}
    <input type="text" id="pai-konteks-2" placeholder="Tuliskan periode…"
      style="${inputCss()}">
  </div>
</div>`;
    if (teknik === 'UNJUK_KERJA') return `
<div style="margin-bottom:.5rem">
  ${fieldLbl('Deskripsi unjuk kerja (opsional)')}
  <textarea id="pai-konteks-1" rows="2" placeholder="Tuliskan deskripsi…"
    style="${inputCss('resize:vertical;font-size:var(--fs-caption)')}"></textarea>
</div>`;
    return '';
  }

  function addBtnHtml(cls, label) {
    return `<button type="button" class="${esc(cls)}"
      style="margin-top:.5rem;font-size:var(--fs-caption);background:transparent;
      border:1.5px dashed var(--border-subtle,rgba(255,255,255,.3));
      color:var(--text-secondary);border-radius:.375rem;cursor:pointer;
      padding:.35rem .75rem;width:100%">${esc(label)}</button>`;
  }

  function renderBodyInstrumen(teknik, instrumen, container) {
    if (!container) return;
    let inner = '';

    if (teknik === 'OBSERVASI') {
      if (instrumen === 'Lembar Observasi') {
        inner = `<div id="pai-obs-aspeks">${observasiAspekHtml(0)}</div>
${addBtnHtml('btn-tambah-obs-aspek', '+ Tambah aspek observasi')}`;
      } else if (instrumen === 'Catatan Anekdot') {
        inner = `<div style="margin-bottom:.5rem">
  ${fieldLbl('Mode')}
  <select id="pai-anekdot-mode" style="${inputCss()}">
    <option value="per_siswa">Per Siswa</option>
    <option value="per_kejadian">Per Kejadian</option>
  </select>
</div>
<div id="pai-anekdot-rows">${anekdotCatatanHtml(0, true)}</div>
${addBtnHtml('btn-tambah-catatan', '+ Tambah catatan')}`;
      } else if (instrumen === 'Checklist') {
        inner = `<div id="pai-cl-items">${checklistItemHtml(0)}</div>
${addBtnHtml('btn-tambah-item', '+ Tambah item')}`;
      }
    } else if (teknik === 'TES') {
      inner = ['Menjawab dengan baik', 'Menjawab sebagian', 'Belum bisa menjawab'].map((dsk, i) => `
<div class="pai-tl-dsk-block" data-dsk="${i}"
  style="padding:.5rem 0;border-top:1px solid var(--border-subtle,rgba(255,255,255,.08))">
  <div style="font-size:var(--fs-caption);font-weight:600;margin-bottom:.25rem">
    ${esc(dsk)}:</div>
  ${siswaPickerHtml(`tes-dsk-${i}`)}
</div>`).join('');
    } else if (teknik === 'TES_LISAN') {
      if (instrumen === 'Wawancara') {
        inner = `<div style="margin-bottom:.5rem">
  ${fieldLbl('Topik wawancara (opsional)')}
  <input type="text" id="pai-tl-topik" placeholder="Tuliskan topik…"
    style="${inputCss()}">
</div>
${['Menjawab dengan baik', 'Menjawab sebagian', 'Belum bisa menjawab'].map((dsk, i) => `
<div class="pai-tl-dsk-block" data-dsk="${i}"
  style="padding:.5rem 0;border-top:1px solid var(--border-subtle,rgba(255,255,255,.08))">
  <div style="font-size:var(--fs-caption);font-weight:600;margin-bottom:.25rem">
    ${esc(dsk)}:</div>
  ${siswaPickerHtml(`tl-waw-${i}`)}
</div>`).join('')}`;
      } else {
        const topikLabel = instrumen === 'Monolog' ? 'Topik monolog (opsional)' : 'Topik dialog (opsional)';
        inner = `<div style="margin-bottom:.5rem">
  ${fieldLbl(topikLabel)}
  <input type="text" id="pai-tl-topik" placeholder="Tuliskan topik…"
    style="${inputCss()}">
</div>
${PREDIKAT_RUBRIK.map((p, i) => `
<div class="pai-tl-pred-block" data-pred="${esc(p.val)}"
  style="padding:.5rem 0;border-top:1px solid var(--border-subtle,rgba(255,255,255,.08))">
  <div style="font-size:var(--fs-caption);font-weight:600;margin-bottom:.3rem">
    ${esc(p.lbl)}</div>
  <textarea class="tl-pred-desk tl-pred-desk-${esc(p.val)}" rows="2"
    placeholder="Deskripsi deskriptor… (opsional)"
    style="${inputCss('resize:vertical;font-size:var(--fs-caption)')}"></textarea>
  <div style="font-size:var(--fs-caption);color:var(--text-secondary);
    margin:.25rem 0 .1rem">Siswa:</div>
  ${siswaPickerHtml(`tl-${i}-${p.val}`)}
</div>`).join('')}`;
      }
    } else if (['PENUGASAN','PROYEK','PORTOFOLIO','UNJUK_KERJA'].includes(teknik)) {
      const prefix = konteksPrefixHtml(teknik);
      if (instrumen === 'Rubrik') {
        inner = `${prefix}
<div id="pai-rubrik-aspeks">${aspekRowHtml(0)}</div>
${addBtnHtml('btn-tambah-aspek', '+ Tambah aspek')}`;
      } else if (instrumen === 'Checklist') {
        inner = `${prefix}
<div id="pai-cl-items">${checklistItemHtml(0)}</div>
${addBtnHtml('btn-tambah-item', '+ Tambah item')}`;
      }
    }

    container.innerHTML = inner
      ? `<div style="background:var(--bg-elevated,rgba(255,255,255,.04));
          border-radius:.5rem;padding:.75rem">
          <div style="font-size:var(--fs-caption);font-weight:700;color:var(--gold);
            text-transform:uppercase;letter-spacing:.07em;margin-bottom:.5rem">
            Isi Penilaian</div>
          ${inner}</div>`
      : '';
  }

  function wireBodyInstrumen(container) {
    if (!container) return;

    container.addEventListener('change', e => {
      // Siswa picker: pilih siswa → tambah chip
      if (e.target.classList.contains('pai-sw-sel')) {
        const sid    = e.target.value;
        if (!sid) return;
        const picker = e.target.closest('.pai-sw-picker');
        if (!picker) return;
        if (picker.querySelector(`.pai-sw-chip[data-sid="${sid}"]`)) {
          e.target.value = '';
          return;
        }
        const stu = _roster.find(r => r.id === sid);
        if (!stu) return;
        picker.querySelector('.pai-sw-chips')
          ?.insertAdjacentHTML('beforeend', chipSiswaHtml(sid, stu.nama));
        const opt = e.target.querySelector(`option[value="${sid}"]`);
        if (opt) opt.style.display = 'none';
        e.target.value = '';
        return;
      }

      // Anekdot mode toggle → re-render catatan rows
      if (e.target.id === 'pai-anekdot-mode') {
        const modePerSiswa = e.target.value === 'per_siswa';
        const rowsDiv = container.querySelector('#pai-anekdot-rows');
        if (!rowsDiv) return;
        const n = rowsDiv.querySelectorAll('.pai-anekdot-row').length || 1;
        rowsDiv.innerHTML = Array.from({ length: n }, (_, i) =>
          anekdotCatatanHtml(i, modePerSiswa)
        ).join('');
      }
    });

    container.addEventListener('click', e => {
      // Chip siswa: klik → hapus
      const chip = e.target.closest('.pai-sw-chip');
      if (chip && container.contains(chip)) {
        const sid    = chip.dataset.sid;
        const picker = chip.closest('.pai-sw-picker');
        if (picker) {
          const opt = picker.querySelector(`.pai-sw-sel option[value="${sid}"]`);
          if (opt) opt.style.display = '';
        }
        chip.remove();
        return;
      }

      const tgt = e.target.closest('button');
      if (!tgt) return;

      if (tgt.classList.contains('btn-tambah-aspek')) {
        const d = container.querySelector('#pai-rubrik-aspeks');
        if (d) d.insertAdjacentHTML('beforeend',
          aspekRowHtml(d.querySelectorAll('.pai-aspek-row').length));
        return;
      }
      if (tgt.classList.contains('btn-del-aspek')) {
        tgt.closest('.pai-aspek-row')?.remove(); return;
      }
      if (tgt.classList.contains('btn-tambah-item')) {
        const d = container.querySelector('#pai-cl-items');
        if (d) d.insertAdjacentHTML('beforeend',
          checklistItemHtml(d.querySelectorAll('.pai-item-row').length));
        return;
      }
      if (tgt.classList.contains('btn-del-item')) {
        tgt.closest('.pai-item-row')?.remove(); return;
      }
      if (tgt.classList.contains('btn-tambah-obs-aspek')) {
        const d = container.querySelector('#pai-obs-aspeks');
        if (d) d.insertAdjacentHTML('beforeend',
          observasiAspekHtml(d.querySelectorAll('.pai-obs-aspek').length));
        return;
      }
      if (tgt.classList.contains('btn-del-obs-aspek')) {
        tgt.closest('.pai-obs-aspek')?.remove(); return;
      }
      if (tgt.classList.contains('btn-tambah-catatan')) {
        const d   = container.querySelector('#pai-anekdot-rows');
        const mode = container.querySelector('#pai-anekdot-mode')?.value;
        if (d) d.insertAdjacentHTML('beforeend',
          anekdotCatatanHtml(d.querySelectorAll('.pai-anekdot-row').length,
            !mode || mode === 'per_siswa'));
        return;
      }
      if (tgt.classList.contains('btn-del-catatan')) {
        tgt.closest('.pai-anekdot-row')?.remove(); return;
      }
      if (tgt.classList.contains('btn-tambah-pg-soal')) {
        const d = container.querySelector('#pai-pg-soals');
        if (d) d.insertAdjacentHTML('beforeend',
          pgSoalHtml(d.querySelectorAll('.pai-pg-soal').length));
        return;
      }
      if (tgt.classList.contains('btn-del-pg-soal')) {
        tgt.closest('.pai-pg-soal')?.remove(); return;
      }
      if (tgt.classList.contains('btn-tambah-uraian-soal')) {
        const d = container.querySelector('#pai-uraian-soals');
        if (d) d.insertAdjacentHTML('beforeend',
          uraianSoalHtml(d.querySelectorAll('.pai-uraian-soal').length));
        return;
      }
      if (tgt.classList.contains('btn-del-uraian-soal')) {
        tgt.closest('.pai-uraian-soal')?.remove(); return;
      }
      if (tgt.classList.contains('btn-tambah-mix-pg')) {
        const d = container.querySelector('#pai-mix-pg-soals');
        if (d) d.insertAdjacentHTML('beforeend',
          pgSoalHtml(d.querySelectorAll('.pai-pg-soal').length));
        return;
      }
      if (tgt.classList.contains('btn-tambah-mix-ur')) {
        const d = container.querySelector('#pai-mix-ur-soals');
        if (d) d.insertAdjacentHTML('beforeend',
          uraianSoalHtml(d.querySelectorAll('.pai-uraian-soal').length));
        return;
      }
    });
  }

  function prefillBodyInstrumen(container, konten, teknik, instrumen) {
    if (!container || !konten || !teknik || !instrumen) return;

    function fillPicker(pickerEl, sids) {
      if (!pickerEl || !Array.isArray(sids)) return;
      const chips = pickerEl.querySelector('.pai-sw-chips');
      const sel   = pickerEl.querySelector('.pai-sw-sel');
      if (!chips) return;
      for (const sid of sids) {
        const stu = _roster.find(r => r.id === sid);
        if (!stu) continue;
        if (chips.querySelector(`.pai-sw-chip[data-sid="${sid}"]`)) continue;
        chips.insertAdjacentHTML('beforeend', chipSiswaHtml(sid, stu.nama));
        if (sel) {
          const opt = sel.querySelector(`option[value="${sid}"]`);
          if (opt) opt.style.display = 'none';
        }
      }
    }

    if (teknik === 'OBSERVASI') {
      if (instrumen === 'Lembar Observasi' && Array.isArray(konten.aspeks)) {
        const aspekEls = container.querySelectorAll('.pai-obs-aspek');
        konten.aspeks.forEach((a, i) => {
          const el = aspekEls[i];
          if (!el) return;
          const nameIn = el.querySelector('.obs-aspek-nama');
          if (nameIn) nameIn.value = a.nama || '';
          const indIn = el.querySelector('.obs-indikator');
          if (indIn) indIn.value = a.indikator || '';
          const pickers = el.querySelectorAll('.pai-sw-picker');
          fillPicker(pickers[0], a.terlihat_jelas);
          fillPicker(pickers[1], a.terlihat);
          fillPicker(pickers[2], a.belum_terlihat);
        });
      } else if (instrumen === 'Catatan Anekdot') {
        const modeEl = container.querySelector('#pai-anekdot-mode');
        if (modeEl && konten.mode) modeEl.value = konten.mode;
        const modePerSiswa = (konten.mode || 'per_siswa') === 'per_siswa';

        if (Array.isArray(konten.catatan) && konten.catatan.length > 0) {
          const rowsDiv = container.querySelector('#pai-anekdot-rows');
          if (rowsDiv) {
            rowsDiv.innerHTML = konten.catatan
              .map((_, i) => anekdotCatatanHtml(i, modePerSiswa)).join('');
            konten.catatan.forEach((c, i) => {
              const row = rowsDiv.querySelectorAll('.pai-anekdot-row')[i];
              if (!row) return;
              const deskEl = row.querySelector('.anekdot-deskripsi');
              if (deskEl) deskEl.value = c.deskripsi || '';
              const interEl = row.querySelector('.anekdot-interpretasi');
              if (interEl) interEl.value = c.interpretasi || '';
              if (modePerSiswa) {
                const siswaEl = row.querySelector('.anekdot-siswa-sel');
                if (siswaEl && c.siswa) siswaEl.value = c.siswa;
              } else {
                fillPicker(row.querySelector('.pai-sw-picker'), c.siswa);
              }
            });
          }
        }
      } else if (instrumen === 'Checklist' && Array.isArray(konten.items)) {
        const itemsDiv = container.querySelector('#pai-cl-items');
        if (itemsDiv) {
          itemsDiv.innerHTML = konten.items
            .map((_, i) => checklistItemHtml(i)).join('');
          konten.items.forEach((it, i) => {
            const row = itemsDiv.querySelectorAll('.pai-item-row')[i];
            if (!row) return;
            const namaEl = row.querySelector('.item-nama');
            if (namaEl) namaEl.value = it.nama || '';
            fillPicker(row.querySelector('.pai-sw-picker'), it.siswa);
          });
        }
      }
    } else if (teknik === 'TES' && Array.isArray(konten.deskriptor)) {
      const blocks = container.querySelectorAll('.pai-tl-dsk-block');
      konten.deskriptor.forEach((d, i) => {
        fillPicker(blocks[i]?.querySelector('.pai-sw-picker'), d.siswa);
      });
    } else if (teknik === 'TES_LISAN') {
      const topikEl = container.querySelector('#pai-tl-topik');
      if (topikEl && konten.topik) topikEl.value = konten.topik;
      if (instrumen === 'Wawancara' && Array.isArray(konten.deskriptor)) {
        const blocks = container.querySelectorAll('.pai-tl-dsk-block');
        konten.deskriptor.forEach((d, i) => {
          fillPicker(blocks[i]?.querySelector('.pai-sw-picker'), d.siswa);
        });
      } else if (Array.isArray(konten.predikat)) {
        const predPickers = Array.from(
          container.querySelectorAll('.pai-tl-pred-block .pai-sw-picker')
        );
        konten.predikat.forEach((p, i) => {
          const deskEl = container.querySelector(`.tl-pred-desk-${p.val}`);
          if (deskEl) deskEl.value = p.deskripsi || '';
          fillPicker(predPickers[i], p.siswa);
        });
      }
    } else if (['PENUGASAN','PROYEK','PORTOFOLIO','UNJUK_KERJA'].includes(teknik)) {
      const k1 = container.querySelector('#pai-konteks-1');
      if (k1 && konten.konteks1) k1.value = konten.konteks1;
      const k2 = container.querySelector('#pai-konteks-2');
      if (k2 && konten.konteks2) k2.value = konten.konteks2;
      if (instrumen === 'Rubrik' && Array.isArray(konten.aspeks)) {
        const aspeksDiv = container.querySelector('#pai-rubrik-aspeks');
        if (aspeksDiv) {
          aspeksDiv.innerHTML = konten.aspeks.map((_, i) => aspekRowHtml(i)).join('');
          konten.aspeks.forEach((a, i) => {
            const row = aspeksDiv.querySelectorAll('.pai-aspek-row')[i];
            if (!row) return;
            const namaEl = row.querySelector('.aspek-nama');
            if (namaEl) namaEl.value = a.nama || '';
            const pickers = row.querySelectorAll('.pai-sw-picker');
            (a.predikat || []).forEach((p, j) => {
              const deskEl = row.querySelector(`.predikat-desk-${p.val}`);
              if (deskEl) deskEl.value = p.deskripsi || '';
              fillPicker(pickers[j], p.siswa);
            });
          });
        }
      } else if (instrumen === 'Checklist' && Array.isArray(konten.items)) {
        const itemsDiv = container.querySelector('#pai-cl-items');
        if (itemsDiv) {
          itemsDiv.innerHTML = konten.items.map((_, i) => checklistItemHtml(i)).join('');
          konten.items.forEach((it, i) => {
            const row = itemsDiv.querySelectorAll('.pai-item-row')[i];
            if (!row) return;
            const namaEl = row.querySelector('.item-nama');
            if (namaEl) namaEl.value = it.nama || '';
            fillPicker(row.querySelector('.pai-sw-picker'), it.siswa);
          });
        }
      }
    }
  }

  function collectBodyInstrumen(container, teknik, instrumen) {
    if (!container || !teknik || !instrumen) return null;
    const data = {};

    function getSiswaOfPicker(pickerEl) {
      return Array.from(pickerEl?.querySelectorAll('.pai-sw-chip') ?? [])
        .map(c => c.dataset.sid).filter(Boolean);
    }

    if (teknik === 'OBSERVASI') {
      if (instrumen === 'Lembar Observasi') {
        data.aspeks = Array.from(container.querySelectorAll('.pai-obs-aspek')).map(a => {
          const pickers = a.querySelectorAll('.pai-sw-picker');
          return {
            nama:          a.querySelector('.obs-aspek-nama')?.value.trim() || '',
            indikator:     a.querySelector('.obs-indikator')?.value.trim()  || null,
            terlihat_jelas: getSiswaOfPicker(pickers[0]),
            terlihat:       getSiswaOfPicker(pickers[1]),
            belum_terlihat: getSiswaOfPicker(pickers[2]),
          };
        });
      } else if (instrumen === 'Catatan Anekdot') {
        const mode = container.querySelector('#pai-anekdot-mode')?.value || 'per_siswa';
        data.mode   = mode;
        data.catatan = Array.from(container.querySelectorAll('.pai-anekdot-row')).map(r => ({
          siswa: mode === 'per_siswa'
            ? (r.querySelector('.anekdot-siswa-sel')?.value || null)
            : getSiswaOfPicker(r.querySelector('.pai-sw-picker')),
          deskripsi:    r.querySelector('.anekdot-deskripsi')?.value.trim()    || '',
          interpretasi: r.querySelector('.anekdot-interpretasi')?.value.trim() || null,
        }));
      } else if (instrumen === 'Checklist') {
        data.items = Array.from(container.querySelectorAll('.pai-item-row')).map(r => ({
          nama:  r.querySelector('.item-nama')?.value.trim() || '',
          siswa: getSiswaOfPicker(r.querySelector('.pai-sw-picker')),
        }));
      }
    } else if (teknik === 'TES') {
      const labels = ['Menjawab dengan baik', 'Menjawab sebagian', 'Belum bisa menjawab'];
      data.deskriptor = Array.from(container.querySelectorAll('.pai-tl-dsk-block')).map((b, i) => ({
        label: labels[i] ?? '',
        siswa: getSiswaOfPicker(b.querySelector('.pai-sw-picker')),
      }));
    } else if (teknik === 'TES_LISAN') {
      data.topik = container.querySelector('#pai-tl-topik')?.value.trim() || null;
      if (instrumen === 'Wawancara') {
        const labels = ['Menjawab dengan baik', 'Menjawab sebagian', 'Belum bisa menjawab'];
        data.deskriptor = Array.from(container.querySelectorAll('.pai-tl-dsk-block')).map((b, i) => ({
          label: labels[i] ?? '',
          siswa: getSiswaOfPicker(b.querySelector('.pai-sw-picker')),
        }));
      } else {
        data.predikat = PREDIKAT_RUBRIK.map((p, i) => ({
          val:      p.val,
          label:    p.lbl,
          deskripsi: container.querySelector(`.tl-pred-desk-${p.val}`)?.value.trim() || null,
          siswa:    getSiswaOfPicker(
            Array.from(container.querySelectorAll('.pai-tl-pred-block .pai-sw-picker'))[i]
          ),
        }));
      }
    } else if (['PENUGASAN','PROYEK','PORTOFOLIO','UNJUK_KERJA'].includes(teknik)) {
      data.konteks1 = container.querySelector('#pai-konteks-1')?.value.trim() || null;
      data.konteks2 = container.querySelector('#pai-konteks-2')?.value.trim() || null;
      if (instrumen === 'Rubrik') {
        data.aspeks = Array.from(container.querySelectorAll('.pai-aspek-row')).map(a => ({
          nama: a.querySelector('.aspek-nama')?.value.trim() || '',
          predikat: PREDIKAT_RUBRIK.map((p, i) => ({
            val:      p.val,
            label:    p.lbl,
            deskripsi: a.querySelector(`.predikat-desk-${p.val}`)?.value.trim() || null,
            siswa:    getSiswaOfPicker(a.querySelectorAll('.pai-sw-picker')[i]),
          })),
        }));
      } else if (instrumen === 'Checklist') {
        data.items = Array.from(container.querySelectorAll('.pai-item-row')).map(r => ({
          nama:  r.querySelector('.item-nama')?.value.trim() || '',
          siswa: getSiswaOfPicker(r.querySelector('.pai-sw-picker')),
        }));
      }
    }

    return Object.keys(data).length ? data : null;
  }

  // ── buildResultPayload — ekstrak payload per-siswa dari DOM row ──────────────
  function buildResultPayload(srow, jenis, kktpItems) {
    const payload = {};
    if (jenis === 'DIAGNOSTIK') {
      const chips = srow.querySelector('.stu-status-chips');
      const st    = chips ? chipVal(chips) : null;
      payload.status  = st;
      payload.catatan = srow.querySelector('.stu-catatan')?.value.trim() || null;
      if (st) payload.grup_diferensiasi = STATUS_GRUP[st];
    } else if (jenis === 'FORMATIF') {
      const chips = srow.querySelector('.stu-status-chips');
      payload.status        = chips ? chipVal(chips) : null;
      payload.umpan_balik   = srow.querySelector('.stu-umpan-balik')?.value.trim()   || null;
      payload.tindak_lanjut = srow.querySelector('.stu-tindak-lanjut')?.value.trim() || null;
    } else {
      const raw = srow.querySelector('.stu-nilai')?.value;
      const val = raw !== '' ? parseFloat(raw) : null;
      payload.nilai         = isNaN(val) ? null : val;
      payload.tindak_lanjut = chipVal(srow.querySelector('.stu-tl-chips')) || null;
      const kktp = kktpItems[0];
      if (kktp && val != null && !isNaN(val)) {
        const p = getPredikat(val, getRentang(kktp));
        payload.kktp_tercapai = p === 'BSH' || p === 'SB';
      }
    }
    return payload;
  }

  // ── openAsmtCreateModal — modal tambah penilaian (42 pola wireframe) ─────────
  function openAsmtCreateModal() {
    const isWali = _roleGuru === 'WALI_KELAS_SD';
    let selJenis  = 'FORMATIF';
    let selTeknik    = '';
    let selInstrumen = '';
    let selMapel     = MAPEL_SD[0]; // hanya dipakai jika isWali

    // helper: bangun opsi TP berdasarkan mapel yang dipilih (jika wali)
    function buildTpOptHtml() {
      const candidates = _tpList.filter(t => {
        if (t.tipe !== 'TP') return false;
        if (!isWali) return true;
        // TP tanpa mapel (data lama) → tetap muncul di semua mapel
        return !t.mapel || t.mapel === selMapel;
      });
      return [
        `<option value="">— Opsional —</option>`,
        ...candidates.map(t => {
          const hasKktp = _tpList.some(k => k.parent_id === t.id && k.tipe === 'KKTP');
          return `<option value="${t.id}">${esc(t.judul)} ${hasKktp ? '✓' : '⚠'}</option>`;
        }),
      ].join('');
    }

    const teknikOptHtml = ['', 'OBSERVASI', 'TES', 'PENUGASAN', 'PROYEK', 'PORTOFOLIO', 'UNJUK_KERJA', 'TES_LISAN']
      .map(t => `<option value="${t}">${t ? teknikLbl(t) : '— Teknik (opsional) —'}</option>`)
      .join('');

    const mapelChipsHtml = isWali
      ? `<div>
          ${fieldLbl('Mata Pelajaran')}
          <select id="asmt-mapel-sel" style="${inputCss()}">
            ${MAPEL_SD.map(m => `<option value="${esc(m)}"${m === selMapel ? ' selected' : ''}>${esc(m)}</option>`).join('')}
          </select>
        </div>`
      : '';

    el('pai-modal-box').innerHTML = `
<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem">
  <h3 style="margin:0;color:var(--gold)">Tambah Penilaian</h3>
  <button data-action="close-modal"
    style="background:transparent;border:none;cursor:pointer;font-size:1.25rem;
    padding:.2rem .35rem;border-radius:.25rem;line-height:1;opacity:.7">×</button>
</div>
<div style="display:flex;flex-direction:column;gap:.875rem">
  ${mapelChipsHtml}
  <div>
    ${fieldLbl('Tujuan penilaian')}
    <textarea id="asmt-tujuan" rows="2"
      style="${inputCss('resize:vertical')}"
      placeholder="Apa yang ingin diketahui/dipantau?"></textarea>
  </div>
  <div>
    ${fieldLbl('TP yang dinilai')}
    <select id="asmt-tp-sel" style="${inputCss()}">${buildTpOptHtml()}</select>
  </div>
  <div>
    ${fieldLbl('Jenis penilaian')}
    <select id="asmt-jenis-sel" style="${inputCss()}">
      ${['DIAGNOSTIK', 'FORMATIF', 'SUMATIF'].map(j => `<option value="${j}"${selJenis === j ? ' selected' : ''}>${JENIS_LBL[j]}</option>`).join('')}
    </select>
  </div>
  <div>
    ${fieldLbl('Teknik')}
    <select id="asmt-teknik-sel" style="${inputCss()}">${teknikOptHtml}</select>
  </div>
  <div id="asmt-instr-row" style="display:none">
    ${fieldLbl('Instrumen')}
    <select id="asmt-instr-sel" style="${inputCss()}">
      <option value="">— Pilih —</option>
    </select>
  </div>
  <div id="asmt-body-instr-wrap" class="pai-body-instr-wrap"></div>
  <div id="asmt-output-wrap" style="${selJenis === 'SUMATIF' ? '' : 'display:none'}">
    <div style="font-size:var(--fs-caption);font-weight:700;color:var(--gold);
      text-transform:uppercase;letter-spacing:.07em;margin-bottom:.5rem">Catat Nilai</div>
    <div id="asmt-sum-names" style="display:flex;flex-wrap:wrap;gap:.4rem;margin-bottom:.375rem"></div>
    <div id="asmt-sum-nav"
      style="display:none;align-items:center;gap:.5rem;margin-bottom:.375rem">
      <button type="button" id="asmt-sum-prev"
        style="background:transparent;border:1px solid var(--border-subtle,rgba(255,255,255,.18));
        color:var(--text-secondary);border-radius:.3rem;padding:.15rem .5rem;cursor:pointer;
        font-size:var(--fs-caption)">←</button>
      <span id="asmt-sum-page-lbl"
        style="font-size:var(--fs-caption);color:var(--text-secondary)"></span>
      <button type="button" id="asmt-sum-next"
        style="background:transparent;border:1px solid var(--border-subtle,rgba(255,255,255,.18));
        color:var(--text-secondary);border-radius:.3rem;padding:.15rem .5rem;cursor:pointer;
        font-size:var(--fs-caption)">→</button>
    </div>
    <div id="asmt-sum-dots"
      style="display:flex;gap:.35rem;margin-bottom:.625rem;min-height:.625rem"></div>
    <div id="asmt-sum-input"
      style="display:none;border:1px solid var(--border-subtle,rgba(255,255,255,.18));
      border-radius:.4rem;padding:.625rem .75rem"></div>
  </div>
  <div>
    ${fieldLbl('Refleksi guru (opsional)')}
    <textarea id="asmt-refleksi" rows="2"
      style="${inputCss('resize:vertical')}"
      placeholder="Catatan refleksi…"></textarea>
  </div>
  <div style="display:flex;gap:.75rem;justify-content:flex-end;margin-top:.25rem">
    <button data-action="close-modal"
      style="min-height:var(--btn-h);background:transparent;color:var(--gold);
      border:1.5px solid var(--gold-border);font-size:var(--fs-ui);
      padding:0 var(--btn-px);border-radius:var(--btn-r);cursor:pointer">Batal</button>
    <button id="btn-asmt-save"
      style="padding:.5rem 1.25rem;background:var(--gold);
      color:var(--text-on-gold,#000);border:none;border-radius:.375rem;
      font-weight:600;cursor:pointer">Simpan Penilaian</button>
  </div>
  <div id="asmt-err"
    style="color:#e74c3c;font-size:var(--fs-caption);display:none"></div>
</div>`;

    const bodyInstrWrap = el('asmt-body-instr-wrap');
    wireBodyInstrumen(bodyInstrWrap);

    // ── Wire Mapel dropdown (WALI_KELAS_SD only) → cascade filter TP dropdown ──
    if (isWali) {
      el('asmt-mapel-sel')?.addEventListener('change', function () {
        selMapel = this.value;
        el('asmt-tp-sel').innerHTML = buildTpOptHtml();
      });
    }

    // ── Wire Jenis dropdown ──────────────────────────────────────────────
    el('asmt-jenis-sel').addEventListener('change', function () {
      selJenis = this.value;
      const outputWrap = el('asmt-output-wrap');
      if (selJenis === 'SUMATIF') {
        if (outputWrap) outputWrap.style.display = '';
        bodyInstrWrap.innerHTML = '';
        renderSumPage();
      } else {
        if (outputWrap) outputWrap.style.display = 'none';
        renderBodyInstrumen(selTeknik, selInstrumen, bodyInstrWrap);
      }
    });

    // ── Wire Teknik cascade → instrumen → body instrumen ─────────────────
    el('asmt-teknik-sel').addEventListener('change', function () {
      selTeknik    = this.value;
      selInstrumen = '';
      const opts     = selTeknik ? (INSTRUMEN_MAP[selTeknik] || []) : [];
      const instrRow = el('asmt-instr-row');
      const instrSel = el('asmt-instr-sel');
      if (opts.length) {
        instrSel.innerHTML = `<option value="">— Pilih —</option>` +
          opts.map(i => `<option value="${i}">${i}</option>`).join('');
        instrRow.style.display = '';
        instrSel.onchange = function () {
          selInstrumen = this.value;
          if (selJenis !== 'SUMATIF')
            renderBodyInstrumen(selTeknik, selInstrumen, bodyInstrWrap);
        };
      } else {
        instrRow.style.display = 'none';
      }
      if (selJenis === 'SUMATIF') {
        bodyInstrWrap.innerHTML = '';
        flushSumActive();
        _sumActiveSid = null;
        renderSumPage();
      } else {
        renderBodyInstrumen(selTeknik, '', bodyInstrWrap);
      }
    });

    // ── SUMATIF pagination state ─────────────────────────────────────────
    const PAGE_SIZE   = 5;
    let _sumPage      = 0;
    let _sumActiveSid = null;
    const _sumNilai   = {};

    function flushSumActive() {
      if (!_sumActiveSid) return;
      const tlEl  = el('asmt-sum-tl');
      const isTes = !selTeknik || selTeknik === 'TES';
      if (isTes) {
        const nilaiEl = el('asmt-sum-nilai');
        const raw     = nilaiEl?.value;
        const n       = raw !== '' && raw != null ? parseFloat(raw) : null;
        _sumNilai[_sumActiveSid] = {
          nilai: isNaN(n) ? null : n,
          tl:    tlEl ? chipVal(tlEl) : null,
        };
      } else {
        const predChipsEl = el('asmt-sum-pred-chips');
        const selPred     = predChipsEl ? chipVal(predChipsEl) : null;
        const kktp        = getKktpItems()[0];
        const rent        = kktp ? getRentang(kktp) : null;
        const autoN       = selPred && rent ? nilaiTengah(selPred, rent) : null;
        _sumNilai[_sumActiveSid] = {
          predikat: selPred,
          nilai:    autoN,
          tl:       tlEl ? chipVal(tlEl) : null,
        };
      }
    }

    function renderSumInput() {
      const inputEl = el('asmt-sum-input');
      if (!_sumActiveSid) { if (inputEl) inputEl.style.display = 'none'; return; }
      const stu   = _roster.find(r => r.id === _sumActiveSid);
      const vals  = _sumNilai[_sumActiveSid] ?? {};
      const kktp  = getKktpItems()[0];
      const rent  = kktp ? getRentang(kktp) : null;
      const isTes = !selTeknik || selTeknik === 'TES';

      const namaHtml = `<div style="font-size:var(--fs-ui);font-weight:600;margin-bottom:.5rem">
        ${esc(stu?.nama ?? '')}</div>`;

      let valorHtml;
      if (isTes) {
        const kktpColor = kktp && vals.nilai != null ? kktpStatColor(vals.nilai, rent) : 'var(--text-secondary)';
        const kktpStr   = kktp && vals.nilai != null ? kktpStatText(vals.nilai, rent) : '';
        valorHtml = `
<div style="display:flex;align-items:center;gap:.5rem;margin-bottom:.375rem">
  <input type="number" id="asmt-sum-nilai" min="0" max="100" step="0.5"
    placeholder="Nilai 0–100"
    value="${vals.nilai != null ? String(vals.nilai) : ''}"
    style="${inputCss('width:7rem;font-size:var(--fs-caption)')}">
  <span id="asmt-sum-kktp"
    style="font-size:var(--fs-caption);color:${kktpColor}">${kktpStr}</span>
</div>`;
      } else {
        const selPred   = vals.predikat ?? null;
        const autoN     = selPred && rent ? nilaiTengah(selPred, rent) : null;
        const kktpColor = autoN != null ? kktpStatColor(autoN, rent) : 'var(--text-secondary)';
        const kktpStr   = kktp
          ? (autoN != null ? kktpStatText(autoN, rent) : 'Pilih predikat')
          : '';
        valorHtml = `
<div style="margin-bottom:.375rem">
  <div style="font-size:var(--fs-caption);color:var(--text-secondary);margin-bottom:.25rem">Predikat:</div>
  <div id="asmt-sum-pred-chips" style="display:flex;flex-wrap:wrap;gap:.35rem">
    ${PREDIKAT_ORDER.map(p => chipHtml(p, p, selPred === p)).join('')}
  </div>
  <div style="margin-top:.375rem;display:flex;align-items:center;gap:.5rem;flex-wrap:wrap">
    <span style="font-size:var(--fs-caption);color:var(--text-secondary)">Nilai:</span>
    <span id="asmt-sum-pred-nilai"
      style="font-size:var(--fs-ui);font-weight:600;min-width:2rem">
      ${autoN != null ? autoN : '—'}</span>
    <span id="asmt-sum-kktp"
      style="font-size:var(--fs-caption);color:${kktpColor}">${kktpStr}</span>
  </div>
</div>`;
      }

      const tlHtml = `
<div>
  <div style="font-size:var(--fs-caption);color:var(--text-secondary);margin-bottom:.25rem">
    Tindak lanjut:</div>
  <div id="asmt-sum-tl" style="display:flex;flex-wrap:wrap;gap:.35rem">
    ${[['PENGAYAAN','Pengayaan'],['PENGUATAN','Penguatan'],['PENDAMPINGAN','Pendampingan']].map(([v,l]) => chipHtml(v, l, vals.tl === v)).join('')}
  </div>
</div>`;

      inputEl.innerHTML = namaHtml + valorHtml + tlHtml;
      inputEl.style.display = '';

      if (isTes) {
        el('asmt-sum-nilai')?.addEventListener('input', function () {
          const kktp2  = getKktpItems()[0];
          const kktpEl = el('asmt-sum-kktp');
          if (!kktpEl) return;
          const n     = this.value === '' ? null : parseFloat(this.value);
          const rent2 = kktp2 ? getRentang(kktp2) : null;
          kktpEl.textContent = kktp2 ? kktpStatText(n, rent2) : '';
          kktpEl.style.color = kktp2 ? kktpStatColor(n, rent2) : 'var(--text-secondary)';
        });
      } else {
        const predChipsEl = el('asmt-sum-pred-chips');
        if (predChipsEl) {
          wireChips(predChipsEl, false, selVal => {
            const kktp2   = getKktpItems()[0];
            const rent2   = kktp2 ? getRentang(kktp2) : null;
            const autoN2  = rent2 ? nilaiTengah(selVal, rent2) : null;
            const nilaiEl = el('asmt-sum-pred-nilai');
            const kktpEl  = el('asmt-sum-kktp');
            if (nilaiEl) nilaiEl.textContent = autoN2 != null ? String(autoN2) : '—';
            if (kktpEl) {
              kktpEl.textContent = autoN2 != null && kktp2 ? kktpStatText(autoN2, rent2) : '';
              kktpEl.style.color = autoN2 != null ? kktpStatColor(autoN2, rent2) : 'var(--text-secondary)';
            }
          });
        }
      }

      wireChips(el('asmt-sum-tl'), false);
    }

    function renderSumPage() {
      const names   = el('asmt-sum-names');
      const nav     = el('asmt-sum-nav');
      const pageLbl = el('asmt-sum-page-lbl');
      const dots    = el('asmt-sum-dots');
      if (!names) return;
      const total = _roster.length;
      const pages = Math.ceil(total / PAGE_SIZE) || 1;
      _sumPage    = Math.max(0, Math.min(_sumPage, pages - 1));
      const slice = _roster.slice(_sumPage * PAGE_SIZE, (_sumPage + 1) * PAGE_SIZE);
      names.innerHTML = slice.map(s => {
        const isAct  = s.id === _sumActiveSid;
        const hasVal = _sumNilai[s.id]?.nilai != null || _sumNilai[s.id]?.predikat != null;
        return `<button type="button" data-sum-sid="${esc(s.id)}"
          style="padding:.3rem .7rem;border-radius:1rem;font-size:var(--fs-caption);cursor:pointer;
          border:1.5px solid ${isAct ? 'var(--gold)' : hasVal ? 'rgba(255,255,255,.4)' : 'var(--border-subtle,rgba(255,255,255,.18))'};
          background:${isAct ? 'var(--gold)' : 'transparent'};
          color:${isAct ? 'var(--text-on-gold,#000)' : hasVal ? 'var(--text-primary)' : 'var(--text-secondary)'}">
          ${esc(s.nama)}${hasVal ? ' ✓' : ''}</button>`;
      }).join('');
      names.querySelectorAll('[data-sum-sid]').forEach(btn => {
        btn.addEventListener('click', () => {
          flushSumActive();
          _sumActiveSid = btn.dataset.sumSid;
          renderSumPage();
        });
      });
      if (pages > 1) {
        nav.style.display = 'flex';
        if (pageLbl) pageLbl.textContent = `halaman ${_sumPage + 1}/${pages}`;
        const prevBtn = el('asmt-sum-prev');
        const nextBtn = el('asmt-sum-next');
        if (prevBtn) prevBtn.disabled = _sumPage === 0;
        if (nextBtn) nextBtn.disabled = _sumPage === pages - 1;
      } else {
        nav.style.display = 'none';
      }
      if (dots) {
        dots.innerHTML = pages > 1
          ? Array.from({length: pages}, (_, i) =>
              `<span style="width:.5rem;height:.5rem;border-radius:50%;display:inline-block;
              background:${i === _sumPage ? 'var(--gold)' : 'var(--border-subtle,rgba(255,255,255,.3))'}"></span>`
            ).join('')
          : '';
      }
      if (_sumActiveSid && !slice.some(s => s.id === _sumActiveSid)) _sumActiveSid = null;
      renderSumInput();
    }

    // ── Helpers ──────────────────────────────────────────────────────────
    function getKktpItems() {
      const tpId = el('asmt-tp-sel')?.value || null;
      return tpId ? _tpList.filter(t => t.parent_id === tpId && t.tipe === 'KKTP') : [];
    }

    // ── Wire TP change ───────────────────────────────────────────────────
    el('asmt-tp-sel').addEventListener('change', () => { renderSumInput(); });

    // ── Wire pagination buttons ──────────────────────────────────────────
    el('asmt-sum-prev')?.addEventListener('click', () => {
      flushSumActive(); _sumPage--; renderSumPage();
    });
    el('asmt-sum-next')?.addEventListener('click', () => {
      flushSumActive(); _sumPage++; renderSumPage();
    });

    // Nilai input + TL chips diwire per-render di renderSumInput()

    // ── Initial render ────────────────────────────────────────────────────
    if (selJenis === 'SUMATIF') renderSumPage();

    // ── Save ─────────────────────────────────────────────────────────────
    el('btn-asmt-save').addEventListener('click', async () => {
      const errEl     = el('asmt-err');
      const instrBody = collectBodyInstrumen(bodyInstrWrap, selTeknik, selInstrumen);
      const payload = {
        tp_kktp_id:    el('asmt-tp-sel').value || null,
        jenis:         selJenis,
        teknik:        selTeknik || null,
        instrumen:     selInstrumen || null,
        tujuan:        el('asmt-tujuan').value.trim() || null,
        konten:        instrBody || null,
        refleksi_guru: el('asmt-refleksi').value.trim() || null,
      };
      el('btn-asmt-save').disabled = true;
      errEl.style.display = 'none';
      try {
        const row       = await SipApi.createAssessment(_cId, _tId, payload);
        const kktpItems = getKktpItems();
        _asmts.push(row);
        if (selJenis === 'SUMATIF') {
          flushSumActive();
          for (const [sid, vals] of Object.entries(_sumNilai)) {
            if (vals.nilai == null) continue;
            const kktp       = kktpItems[0];
            const resPayload = { nilai: vals.nilai, tindak_lanjut: vals.tl || null };
            if (kktp) {
              const p = getPredikat(vals.nilai, getRentang(kktp));
              resPayload.kktp_tercapai = p === 'BSH' || p === 'SB';
            }
            try { await SipApi.upsertAssessmentResult(_cId, _tId, row.id, sid, resPayload); } catch {}
          }
        } else {
          const srows = el('pai-modal-box').querySelectorAll('.pai-srow');
          for (const srow of srows) {
            const sid        = srow.dataset.sid;
            const resPayload = buildResultPayload(srow, selJenis, kktpItems);
            if (selJenis === 'DIAGNOSTIK' && resPayload.grup_diferensiasi) {
              try {
                await SipApi.upsertStudentGroup(_cId, sid, resPayload.grup_diferensiasi);
                _sGroups[sid] = resPayload.grup_diferensiasi;
              } catch {}
            }
            try { await SipApi.upsertAssessmentResult(_cId, _tId, row.id, sid, resPayload); } catch {}
          }
        }
        closeModal();
        renderAsmtList();
        toast('Penilaian berhasil dibuat');
      } catch (err) {
        errEl.textContent = err.message || 'Gagal menyimpan';
        errEl.style.display = '';
        el('btn-asmt-save').disabled = false;
      }
    });

    openModal();
  }

  function studentRowHtml(student, res, jenis, kktpItems) {
    const grup = _sGroups[student.id] ?? res.grup_diferensiasi ?? '';
    const grupBadge = grup
      ? `<span style="font-size:.65rem;padding:.15rem .45rem;border-radius:.25rem;
          background:var(--gold);color:var(--text-on-gold,#000);font-weight:700">
          Grup ${grup}</span>`
      : '';

    let inputs = '';
    if (jenis === 'DIAGNOSTIK') {
      const stChips = ['PAHAM', 'BELUM_PAHAM', 'PERLU_PERHATIAN']
        .map(s => chipHtml(s, STATUS_LBL[s], res.status === s)).join('');
      inputs = `
<div class="stu-status-chips" style="display:flex;flex-wrap:wrap;gap:.35rem;margin-bottom:.4rem">
  ${stChips}
</div>
<input type="text" class="stu-catatan" placeholder="Catatan… (opsional)"
  value="${esc(res.catatan ?? '')}"
  style="${inputCss('font-size:var(--fs-caption);margin-top:.25rem')}">
<div style="font-size:var(--fs-caption);color:var(--text-secondary);margin-top:.25rem">
  ${grup
    ? `Grup: <strong>${grup}</strong>`
    : 'Grup otomatis: A (Paham) / B (Belum Paham) / C (Perlu Perhatian)'}
</div>`;
    } else if (jenis === 'FORMATIF') {
      const stChips = ['TERCAPAI', 'BERKEMBANG', 'PERLU_DUKUNGAN']
        .map(s => chipHtml(s, STATUS_FORMATIF_LBL[s], res.status === s)).join('');
      inputs = `
<div class="stu-status-chips" style="display:flex;flex-wrap:wrap;gap:.35rem;margin-bottom:.4rem">
  ${stChips}
</div>
<input type="text" class="stu-umpan-balik" placeholder="Umpan balik… (opsional)"
  value="${esc(res.umpan_balik ?? '')}"
  style="${inputCss('font-size:var(--fs-caption);margin-top:.25rem')}">
<input type="text" class="stu-tindak-lanjut" placeholder="Tindak lanjut… (opsional)"
  value="${esc(res.tindak_lanjut ?? '')}"
  style="${inputCss('font-size:var(--fs-caption);margin-top:.25rem')}">`;
    } else {
      const kktp      = kktpItems[0];
      const rentang   = kktp ? getRentang(kktp) : null;
      const kktpColor = kktp ? kktpStatColor(res.nilai ?? null, rentang) : 'var(--text-secondary)';
      const kktpStr   = kktp ? kktpStatText(res.nilai ?? null, rentang)  : 'KKTP —';
      inputs = `
<div style="display:flex;align-items:center;gap:.5rem;flex-wrap:wrap;margin-bottom:.4rem">
  <input type="number" class="stu-nilai" min="0" max="100" step="0.5"
    value="${res.nilai ?? ''}" placeholder="Nilai 0–100"
    style="${inputCss('width:7rem;font-size:var(--fs-caption)')}">
  ${kktp ? `<span class="stu-kktp-stat"
      style="font-size:var(--fs-caption);color:${kktpColor}">
      ${kktpStr}
    </span>` : ''}
</div>
<div style="margin-top:.375rem">
  <div style="font-size:var(--fs-caption);color:var(--text-secondary);margin-bottom:.25rem">
    Tindak lanjut:</div>
  <div class="stu-tl-chips" style="display:flex;flex-wrap:wrap;gap:.35rem">
    ${[['PENGAYAAN','Pengayaan'],['PENGUATAN','Penguatan'],['PENDAMPINGAN','Pendampingan']]
      .map(([v,l]) => chipHtml(v, l, res.tindak_lanjut === v)).join('')}
  </div>
</div>`;
    }

    return `
<div class="pai-srow" data-sid="${student.id}"
  style="border:1px solid var(--border-subtle,rgba(255,255,255,.12));
  border-radius:.4rem;padding:.625rem .75rem;margin-bottom:.375rem">
  <div style="display:flex;justify-content:space-between;
      align-items:center;margin-bottom:.375rem">
    <span style="font-size:var(--fs-ui);font-weight:var(--fw-medium,500)">
      ${esc(student.nama)}</span>
    ${grupBadge}
  </div>
  ${inputs}
</div>`;
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // SECTION 4 — Rekap Semester
  // ══════════════════════════════════════════════════════════════════════════════

  async function renderRecap() {
    const c = el('pai-recap-wrap');
    if (!c) return;
    if (!_rcTahun) _rcTahun = DEFAULT_YEAR;
    _rcHasil      = null;
    _rcAllResults = [];
    _rcPage1      = 0;
    _rcPage2      = 0;
    _renderRecapShell(c);
  }

  function _renderRecapShell(c) {
    const isWali = _roleGuru === 'WALI_KELAS_SD';
    if (isWali && !_rcMapel) _rcMapel = MAPEL_SD[0];

    const allSumatifs = _asmts.filter(a => a.jenis === 'SUMATIF');
    const teknikSet   = [...new Set(allSumatifs.map(a => a.teknik).filter(Boolean))];
    const instrSet    = _rcTeknik
      ? [...new Set(allSumatifs.filter(a => a.teknik === _rcTeknik).map(a => a.instrumen).filter(Boolean))]
      : [];

    const sel = (v, cur) => v === cur ? ' selected' : '';
    const capLbl = t => `<div style="font-size:var(--fs-caption);color:var(--text-secondary);margin-bottom:.3rem">${t}</div>`;

    let html = `<div style="display:flex;flex-direction:column;gap:.6rem;margin-bottom:.75rem">`;

    // Semester + tahun ajaran
    html += `<div style="display:flex;gap:.75rem;flex-wrap:wrap;align-items:flex-end">
      <div>${capLbl('Semester')}
        <select id="rc-semester" style="${inputCss('max-width:8rem')}">
          <option value="1"${sel('1',_rcSemester)}>Semester 1</option>
          <option value="2"${sel('2',_rcSemester)}>Semester 2</option>
        </select></div>
      <div>${capLbl('Tahun Ajaran')}
        <input type="text" id="rc-tahun" value="${esc(_rcTahun)}"
          placeholder="${DEFAULT_YEAR}" style="${inputCss('max-width:8rem')}"></div>
    </div>`;

    // Mapel (WALI_KELAS_SD only)
    if (isWali) {
      html += `<div>${capLbl('Mata Pelajaran')}
        <select id="rc-mapel" style="${inputCss('max-width:18rem')}">
          ${MAPEL_SD.map(m => `<option value="${esc(m)}"${sel(m,_rcMapel)}>${esc(m)}</option>`).join('')}
        </select></div>`;
    }

    // Teknik
    html += `<div>${capLbl('Teknik')}
      <select id="rc-teknik" style="${inputCss('max-width:14rem')}">
        <option value="">Semua teknik</option>
        ${teknikSet.map(t => `<option value="${esc(t)}"${sel(t,_rcTeknik)}>${esc(teknikLbl(t))}</option>`).join('')}
      </select></div>`;

    // Instrumen (hanya jika teknik dipilih)
    if (_rcTeknik && instrSet.length) {
      html += `<div>${capLbl('Instrumen')}
        <select id="rc-instrumen" style="${inputCss('max-width:14rem')}">
          <option value="">Semua instrumen</option>
          ${instrSet.map(i => `<option value="${esc(i)}"${sel(i,_rcInstrumen)}>${esc(i)}</option>`).join('')}
        </select></div>`;
    }

    html += `</div><div id="rc-content"><div style="color:var(--text-secondary);font-size:var(--fs-caption);padding:.5rem 0">Memuat…</div></div>`;
    c.innerHTML = html;

    // Wire filter events
    c.querySelector('#rc-semester')?.addEventListener('change', function () {
      _rcSemester = this.value; _rcPage1 = _rcPage2 = 0; _rcHasil = null; _loadRecapContent();
    });
    c.querySelector('#rc-tahun')?.addEventListener('change', function () {
      _rcTahun = this.value.trim() || DEFAULT_YEAR; _rcPage1 = _rcPage2 = 0; _rcHasil = null; _loadRecapContent();
    });
    c.querySelector('#rc-mapel')?.addEventListener('change', function () {
      _rcMapel = this.value; _rcPage1 = _rcPage2 = 0; _rcHasil = null; _loadRecapContent();
    });
    c.querySelector('#rc-teknik')?.addEventListener('change', function () {
      _rcTeknik = this.value || null; _rcInstrumen = null; _rcPage1 = _rcPage2 = 0; _rcHasil = null;
      _renderRecapShell(c); _loadRecapContent();
    });
    c.querySelector('#rc-instrumen')?.addEventListener('change', function () {
      _rcInstrumen = this.value || null; _rcPage1 = _rcPage2 = 0; _rcHasil = null; _loadRecapContent();
    });

    _loadRecapContent();
  }

  async function _loadRecapContent() {
    const cc = el('rc-content');
    if (!cc) return;
    cc.innerHTML = `<div style="color:var(--text-secondary);font-size:var(--fs-caption);padding:.5rem 0">Memuat…</div>`;

    const sumatifs = _getFilteredSumatifs();
    if (!sumatifs.length) {
      cc.innerHTML = `<p style="color:var(--text-secondary);font-size:var(--fs-caption)">
        Belum ada penilaian Sumatif untuk filter yang dipilih.</p>`;
      return;
    }
    if (!_roster.length) {
      cc.innerHTML = `<p style="color:var(--text-secondary);font-size:var(--fs-caption)">
        Tidak ada siswa di kelas ini.</p>`;
      return;
    }

    const allResults = await Promise.all(
      sumatifs.map(a => SipApi.getAssessmentResults(a.id).catch(() => []))
    );
    _rcAllResults = allResults;
    if (_rcBobots.length !== sumatifs.length) _rcBobots = sumatifs.map(() => 0);
    _renderRecapContent(cc, sumatifs, allResults);
  }

  function _getFilteredSumatifs() {
    const isWali = _roleGuru === 'WALI_KELAS_SD';
    return _asmts.filter(a => {
      if (a.jenis !== 'SUMATIF') return false;
      if (_rcTeknik && a.teknik !== _rcTeknik) return false;
      if (_rcInstrumen && a.instrumen !== _rcInstrumen) return false;
      // Filter semester, tahun, dan mapel via TP yang dikaitkan.
      // Sumatif tanpa TP tidak bisa diketahui semesternya — tetap tampil di semua filter.
      if (a.tp_kktp_id) {
        const tp = _tpList.find(t => t.id === a.tp_kktp_id);
        if (tp) {
          if (String(tp.semester) !== String(_rcSemester)) return false;
          if (_rcTahun && tp.academic_year && tp.academic_year !== _rcTahun) return false;
          if (isWali && _rcMapel && tp.mapel && tp.mapel !== _rcMapel) return false;
        }
      }
      return true;
    });
  }

  function _renderRecapContent(cc, sumatifs, allResults) {
    // nilaiGrid[i][studentId] = nilai angka | null
    const nilaiGrid = sumatifs.map((_, i) => {
      const map = {};
      (allResults[i] ?? []).forEach(r => { map[r.student_id] = r.nilai ?? null; });
      return map;
    });

    // Header kolom: S{n}-{short judul TP} atau S{n}-—
    const colHeaders = sumatifs.map((a, i) => {
      const tp = a.tp_kktp_id ? _tpList.find(t => t.id === a.tp_kktp_id) : null;
      const label = tp ? (tp.judul.length > 10 ? tp.judul.slice(0, 10) + '…' : tp.judul) : '—';
      return `S${i + 1}-${label}`;
    });

    // KKTP untuk predikat: ambil dari TP pertama yang punya KKTP child
    let _kktp = null;
    for (const a of sumatifs) {
      if (!a.tp_kktp_id) continue;
      const k = _tpList.find(t => t.parent_id === a.tp_kktp_id && t.tipe === 'KKTP');
      if (k) { _kktp = k; break; }
    }

    const thSt = `padding:.4rem .5rem;border-bottom:2px solid var(--gold);font-size:var(--fs-caption);white-space:nowrap;text-align:left`;
    const tdSt = `padding:.4rem .5rem;font-size:var(--fs-ui);border-bottom:1px solid var(--border-subtle,rgba(255,255,255,.08))`;

    // ── DAFTAR NILAI SUMATIF ────────────────────────────────────────────────
    const totalPages1 = Math.ceil(_roster.length / RC_PAGE_SIZE);
    const pageRoster  = _roster.slice(_rcPage1 * RC_PAGE_SIZE, (_rcPage1 + 1) * RC_PAGE_SIZE);

    const valueRows = pageRoster.map((s, idx) => {
      const no    = _rcPage1 * RC_PAGE_SIZE + idx + 1;
      const cells = sumatifs.map((_, ci) => {
        const n = nilaiGrid[ci][s.id];
        return `<td style="${tdSt};text-align:center">${n != null ? n : 0}</td>`;
      }).join('');
      return `<tr>
        <td style="${tdSt};text-align:center;color:var(--text-secondary)">${no}</td>
        <td style="${tdSt}">${esc(s.nama)}</td>${cells}</tr>`;
    }).join('');

    const colHeaderCells = colHeaders.map(h =>
      `<th style="${thSt};text-align:center" title="${esc(h)}">${esc(h)}</th>`
    ).join('');

    const pag1Html = totalPages1 > 1
      ? `<div style="display:flex;align-items:center;justify-content:center;gap:.75rem;margin-top:.5rem;font-size:var(--fs-caption)">
          <button data-rc-pag="1" data-dir="-1"${_rcPage1 === 0 ? ' disabled' : ''} style="padding:.2rem .6rem;cursor:pointer">←</button>
          <span>Hal. ${_rcPage1 + 1}/${totalPages1}</span>
          <button data-rc-pag="1" data-dir="1"${_rcPage1 === totalPages1 - 1 ? ' disabled' : ''} style="padding:.2rem .6rem;cursor:pointer">→</button>
        </div>` : '';

    // ── TENTUKAN NILAI AKHIR ────────────────────────────────────────────────
    const isBobot    = _rcMetode === 'bobot';
    const totalBobot = _rcBobots.reduce((a, b) => a + (parseFloat(b) || 0), 0);
    const bobotValid = Math.abs(totalBobot - 100) < 0.01;

    const bobotRowsHtml = isBobot
      ? `<div style="display:flex;flex-direction:column;gap:.35rem;margin:-.25rem 0 .25rem 1.25rem">
          ${sumatifs.map((_, i) => `<div style="display:flex;align-items:center;gap:.5rem;font-size:var(--fs-caption)">
            <span style="min-width:3.5rem;white-space:nowrap">${esc(colHeaders[i])}</span>
            <input type="number" id="rc-bobot-${i}" min="0" max="100" step="1"
              value="${_rcBobots[i] ?? 0}" style="${inputCss('width:4.5rem;text-align:center')}"> <span>%</span>
          </div>`).join('')}
          <div style="font-size:var(--fs-caption);color:${bobotValid ? 'var(--success,#2d6a4f)' : '#c0392b'}">
            Total: ${totalBobot}% ${bobotValid ? '✓' : '(harus 100%)'}
          </div></div>` : '';

    const hitungDis = isBobot && !bobotValid;
    const metodeHtml = `
<div style="margin-top:.75rem;background:var(--bg-card,#1e1e1e);border-radius:.5rem;
  padding:.75rem;border:1px solid var(--border-subtle,rgba(255,255,255,.12))">
  <div style="font-size:var(--fs-caption);font-weight:600;color:var(--gold);
    margin-bottom:.5rem;text-transform:uppercase;letter-spacing:.04em">Tentukan Nilai Akhir</div>
  <div style="display:flex;flex-direction:column;gap:.35rem;margin-bottom:.4rem">
    ${[['rata','Rata-rata'],['bobot','Bobot per sumatif'],['terbaik','Nilai terbaik']].map(([v,l]) =>
      `<label style="display:flex;align-items:flex-start;gap:.5rem;cursor:pointer;font-size:var(--fs-ui)">
        <input type="radio" name="rc-metode" value="${v}"${_rcMetode === v ? ' checked' : ''}
          style="margin-top:.15rem;accent-color:var(--gold)"> <span>${l}</span></label>`).join('')}
  </div>
  ${bobotRowsHtml}
  <button id="rc-btn-hitung"${hitungDis ? ' disabled' : ''}
    style="margin-top:.5rem;min-height:var(--btn-h);background:${hitungDis ? 'var(--border-subtle,rgba(255,255,255,.18))' : 'var(--gold)'};
    color:${hitungDis ? 'var(--text-secondary)' : 'var(--text-on-gold)'};font-weight:var(--fw-medium);
    font-size:var(--fs-ui);padding:0 var(--btn-px);border-radius:var(--btn-r);border:none;
    cursor:${hitungDis ? 'default' : 'pointer'};width:100%">Hitung Nilai Akhir</button>
</div>`;

    // ── HASIL NILAI AKHIR ────────────────────────────────────────────────────
    let hasilHtml = '';
    if (_rcHasil) {
      const totalPages2 = Math.ceil(_rcHasil.length / RC_PAGE_SIZE);
      const pageHasil   = _rcHasil.slice(_rcPage2 * RC_PAGE_SIZE, (_rcPage2 + 1) * RC_PAGE_SIZE);
      const hasilRows   = pageHasil.map((row, idx) => {
        const no       = _rcPage2 * RC_PAGE_SIZE + idx + 1;
        const predColor = (row.predikat === 'BSH' || row.predikat === 'SB')
          ? 'var(--success,#2d6a4f)' : row.predikat ? '#c0392b' : 'var(--text-secondary)';
        return `<tr>
          <td style="${tdSt};text-align:center;color:var(--text-secondary)">${no}</td>
          <td style="${tdSt}">${esc(row.nama)}</td>
          <td style="${tdSt};text-align:center;font-weight:600">${row.nilaiAkhir.toFixed(1)}</td>
          <td style="${tdSt};text-align:center;font-weight:600;color:${predColor}">${esc(row.predikat || '—')}</td>
        </tr>`;
      }).join('');

      const pag2Html = totalPages2 > 1
        ? `<div style="display:flex;align-items:center;justify-content:center;gap:.75rem;margin-top:.5rem;font-size:var(--fs-caption)">
            <button data-rc-pag="2" data-dir="-1"${_rcPage2 === 0 ? ' disabled' : ''} style="padding:.2rem .6rem;cursor:pointer">←</button>
            <span>Hal. ${_rcPage2 + 1}/${totalPages2}</span>
            <button data-rc-pag="2" data-dir="1"${_rcPage2 === totalPages2 - 1 ? ' disabled' : ''} style="padding:.2rem .6rem;cursor:pointer">→</button>
          </div>` : '';

      hasilHtml = `
<div style="margin-top:.75rem;background:var(--bg-card,#1e1e1e);border-radius:.5rem;
  padding:.75rem;border:1px solid var(--border-subtle,rgba(255,255,255,.12))">
  <div style="font-size:var(--fs-caption);font-weight:600;color:var(--gold);
    margin-bottom:.5rem;text-transform:uppercase;letter-spacing:.04em">Hasil Nilai Akhir</div>
  <div style="overflow-x:auto">
    <table style="width:100%;border-collapse:collapse;min-width:280px">
      <thead><tr>
        <th style="${thSt};text-align:center">No</th>
        <th style="${thSt}">Nama Siswa</th>
        <th style="${thSt};text-align:center">Nilai Akhir</th>
        <th style="${thSt};text-align:center">Predikat</th>
      </tr></thead>
      <tbody>${hasilRows}</tbody>
    </table>
  </div>
  ${pag2Html}
  <button id="rc-btn-simpan"
    style="margin-top:.75rem;min-height:var(--btn-h);background:var(--gold);
    color:var(--text-on-gold);font-weight:var(--fw-medium);font-size:var(--fs-ui);
    padding:0 var(--btn-px);border-radius:var(--btn-r);border:none;cursor:pointer;width:100%">
    Simpan Rekap</button>
</div>`;
    }

    // Render
    cc.innerHTML = `
<div style="margin-bottom:.25rem">
  <div style="font-size:var(--fs-caption);font-weight:600;color:var(--gold);
    text-transform:uppercase;letter-spacing:.04em;margin-bottom:.4rem">Daftar Nilai Sumatif</div>
  <div style="overflow-x:auto;-webkit-overflow-scrolling:touch">
    <table style="width:100%;border-collapse:collapse;min-width:${130 + sumatifs.length * 80}px">
      <thead><tr>
        <th style="${thSt};text-align:center;width:2.5rem">No</th>
        <th style="${thSt}">Nama Siswa</th>${colHeaderCells}
      </tr></thead>
      <tbody>${valueRows}</tbody>
    </table>
  </div>
  ${pag1Html}
</div>
${metodeHtml}${hasilHtml}`;

    // Wire events
    cc.querySelectorAll('input[name="rc-metode"]').forEach(r => {
      r.addEventListener('change', function () {
        _rcMetode = this.value; _rcHasil = null; _renderRecapContent(cc, sumatifs, allResults);
      });
    });

    if (isBobot) {
      sumatifs.forEach((_, i) => {
        cc.querySelector(`#rc-bobot-${i}`)?.addEventListener('input', function () {
          _rcBobots[i] = parseFloat(this.value) || 0;
          _rcHasil = null;
          _renderRecapContent(cc, sumatifs, allResults);
        });
      });
    }

    cc.querySelector('#rc-btn-hitung')?.addEventListener('click', () => {
      _rcHasil = _hitungNilaiAkhir(sumatifs, nilaiGrid, _kktp);
      _rcPage2 = 0;
      _renderRecapContent(cc, sumatifs, allResults);
    });

    cc.querySelectorAll('[data-rc-pag]').forEach(btn => {
      btn.addEventListener('click', function () {
        if (this.disabled) return;
        const which = this.dataset.rcPag;
        const dir   = parseInt(this.dataset.dir, 10);
        const max1  = totalPages1 - 1;
        const max2  = _rcHasil ? Math.ceil(_rcHasil.length / RC_PAGE_SIZE) - 1 : 0;
        if (which === '1') _rcPage1 = Math.max(0, Math.min(max1, _rcPage1 + dir));
        else               _rcPage2 = Math.max(0, Math.min(max2, _rcPage2 + dir));
        _renderRecapContent(cc, sumatifs, allResults);
      });
    });

    cc.querySelector('#rc-btn-simpan')?.addEventListener('click', () => _simpanRecap(sumatifs, nilaiGrid));
  }

  // Fungsi bersama untuk hitung nilai satu siswa — dipakai tampil DAN simpan agar identik.
  // indices: array indeks sumatifs yang relevan; bobots: array bobot global (_rcBobots).
  function _hitungNilaiSiswa(sid, indices, nilaiGrid, metode, bobots) {
    if (metode === 'rata') {
      const vals = indices.map(i => nilaiGrid[i][sid] ?? 0);
      return vals.reduce((a, b) => a + b, 0) / vals.length;
    } else if (metode === 'bobot') {
      return indices.reduce((sum, i) =>
        sum + (nilaiGrid[i][sid] ?? 0) * (bobots[i] || 0) / 100, 0);
    } else {
      return Math.max(...indices.map(i => nilaiGrid[i][sid] ?? 0));
    }
  }

  function _hitungNilaiAkhir(sumatifs, nilaiGrid, kktp) {
    const indices = sumatifs.map((_, i) => i);
    return _roster.map(s => {
      const nilaiAkhir = _hitungNilaiSiswa(s.id, indices, nilaiGrid, _rcMetode, _rcBobots);
      const predikat   = kktp ? getPredikat(nilaiAkhir, getRentang(kktp)) : null;
      return { id: s.id, nama: s.nama, nilaiAkhir, predikat };
    });
  }

  async function _simpanRecap(sumatifs, nilaiGrid) {
    const btn = el('rc-btn-simpan');
    if (btn) { btn.disabled = true; btn.textContent = 'Menyimpan…'; }
    try {
      // Kelompokkan sumatif by tp_kktp_id
      const tpGroups = {};
      sumatifs.forEach((a, i) => {
        const key = a.tp_kktp_id ?? '__null__';
        if (!tpGroups[key]) tpGroups[key] = [];
        tpGroups[key].push(i);
      });

      let saved = 0; let skipped = 0;
      for (const [tpId, indices] of Object.entries(tpGroups)) {
        if (tpId === '__null__') { skipped += indices.length; continue; }
        const kktp = _tpList.find(t => t.parent_id === tpId && t.tipe === 'KKTP');

        for (const s of _roster) {
          // Gunakan fungsi bersama agar nilai yang disimpan identik dengan yang ditampilkan
          const nilaiAkhir = _hitungNilaiSiswa(s.id, indices, nilaiGrid, _rcMetode, _rcBobots);
          const predikat      = kktp ? getPredikat(nilaiAkhir, getRentang(kktp)) : null;
          const kktp_tercapai = predikat ? (predikat === 'BSH' || predikat === 'SB') : null;
          await SipApi.upsertGradeRecap(
            _cId, s.id, tpId, _rcSemester, _rcTahun,
            { nilai_akhir: parseFloat(nilaiAkhir.toFixed(2)), kktp_tercapai, deskripsi_capaian: null }
          );
          saved++;
        }
      }

      let msg = `Rekap disimpan (${saved} entri).`;
      if (skipped > 0) msg += ` ${skipped} sumatif tanpa TP dilewati.`;
      toast(msg);
    } catch (err) {
      toast('Gagal menyimpan rekap: ' + (err.message || ''), false);
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Simpan Rekap'; }
    }
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // DOMContentLoaded — tab wiring (self-contained, no window export)
  // ══════════════════════════════════════════════════════════════════════════════

  document.addEventListener('DOMContentLoaded', () => {
    const tabPenilaian   = document.getElementById('tab-penilaian');
    const panelPenilaian = document.getElementById('panel-penilaian');
    if (!tabPenilaian || !panelPenilaian) return;

    const otherTabs = ['tab-siswa', 'tab-jadwal', 'tab-catatan', 'tab-rancang']
      .map(id => document.getElementById(id)).filter(Boolean);

    tabPenilaian.addEventListener('click', async () => {
      otherTabs.forEach(t => t.classList.remove('active'));
      tabPenilaian.classList.add('active');
      document.querySelectorAll('[id^="panel-"]').forEach(p => { p.style.display = 'none'; });
      panelPenilaian.style.display = '';
      const _cId = new URLSearchParams(window.location.search).get('id');
      if (_cId) try { localStorage.setItem('sip_tab_' + _cId, 'penilaian'); } catch (_) {}

      if (!_loaded) {
        const { data: { session } } = await client.auth.getSession();
        if (!session) return;
        const cId = new URLSearchParams(window.location.search).get('id');
        if (!cId) return;
        const { data: prof } = await client
          .from('profiles').select('id, role_guru').eq('user_id', session.user.id).single();
        if (!prof) return;
        _roleGuru = prof.role_guru ?? null;
        await initAssessmentTab(cId, prof.id);
      }
    });

    otherTabs.forEach(t => {
      t.addEventListener('click', () => {
        tabPenilaian.classList.remove('active');
        panelPenilaian.style.display = 'none';
      });
    });

    const cId = new URLSearchParams(window.location.search).get('id');
    if (cId) {
      const saved = localStorage.getItem('sip_tab_' + cId);
      if (saved === 'penilaian') tabPenilaian.click();
    }
  });

}());
