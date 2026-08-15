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

  const MAPEL_SD = [
    'Bahasa Indonesia', 'Matematika', 'IPAS',
    'Pendidikan Pancasila', 'Seni', 'Bahasa Inggris',
  ];

  function teknikLbl(t) {
    return t ? t.split('_').map(w => w.charAt(0) + w.slice(1).toLowerCase()).join(' ') : '';
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
      case 'open-asmt':    openAsmtDetail(btn.dataset.id); break;
      case 'close-modal':  closeModal();                 break;
      case 'filter-grup':  onFilterGrup(btn);            break;
      case 'save-results': saveResults(btn);             break;
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
    const tpOpts = _tpList.filter(t => t.tipe === 'TP');

    let selTipe  = item?.tipe ?? 'TP';
    let selMapel = item?.mapel ?? _selMapel ?? MAPEL_SD[0]; // default ke mapel aktif Section 1

    const isWali = _roleGuru === 'WALI_KELAS_SD';

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
      el('tp-mapel-sel')?.addEventListener('change', function () { selMapel = this.value; });
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
      const judulEl = el('tp-judul');
      if (!judulEl || judulEl.value.trim() !== '') return;
      const tp = tpOpts.find(t => t.id === this.value);
      judulEl.value = tp?.konten ?? '';
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
    const c = el('pai-asmt-list');
    if (!c) return;
    if (!_asmts.length) {
      c.innerHTML = `<p style="color:var(--text-secondary);font-size:var(--fs-caption)">
        Belum ada penilaian. Klik "+ Tambah Penilaian" untuk mulai.</p>`;
      return;
    }
    const grouped = { DIAGNOSTIK: [], FORMATIF: [], SUMATIF: [] };
    _asmts.forEach(a => { if (grouped[a.jenis]) grouped[a.jenis].push(a); });

    c.innerHTML = ['DIAGNOSTIK', 'FORMATIF', 'SUMATIF'].map(jenis => {
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
    <button type="button" data-action="open-asmt" data-id="${a.id}"
      style="flex-shrink:0;padding:.35rem .75rem;background:transparent;
      border:1.5px solid var(--gold);color:var(--gold);border-radius:.375rem;
      font-size:var(--fs-caption);cursor:pointer;white-space:nowrap">
      Isi Nilai →
    </button>
    <button type="button" data-action="edit-asmt" data-id="${a.id}"
      style="background:transparent;border:none;cursor:pointer;font-size:1rem;padding:.2rem .35rem;border-radius:.25rem;line-height:1;opacity:.7" title="Edit">✏️</button>
    <button type="button" data-action="del-asmt"  data-id="${a.id}"
      style="background:transparent;border:none;cursor:pointer;font-size:1rem;padding:.2rem .35rem;border-radius:.25rem;line-height:1;opacity:.7" title="Hapus">🗑</button>
  </div>
</div>`;
  }

  function openAsmtModal(editId) {
    if (!editId) { openAsmtCreateModal(); return; }

    const item    = _asmts.find(a => a.id === editId);
    const tpOpts  = _tpList.filter(t => t.tipe === 'TP');

    let selJenis  = item?.jenis ?? 'FORMATIF';
    let selTeknik = item?.teknik ?? '';

    const jenisChips = ['DIAGNOSTIK', 'FORMATIF', 'SUMATIF']
      .map(j => chipHtml(j, JENIS_LBL[j], selJenis === j)).join('');

    const tpOptHtml = [
      `<option value="">— Opsional —</option>`,
      ...tpOpts.map(t =>
        `<option value="${t.id}"${item?.tp_kktp_id === t.id ? ' selected' : ''}>${esc(t.judul)}</option>`)
    ].join('');

    const teknikOptHtml = ['', 'OBSERVASI', 'TES', 'PENUGASAN', 'PROYEK', 'PORTOFOLIO', 'UNJUK_KERJA']
      .map(t => `<option value="${t}"${selTeknik === t ? ' selected' : ''}>
        ${t ? teknikLbl(t) : '— Teknik (opsional) —'}</option>`)
      .join('');

    const instrOpts = selTeknik ? (INSTRUMEN_MAP[selTeknik] || [])
      .map(i => `<option value="${i}"${item?.instrumen === i ? ' selected' : ''}>${i}</option>`)
      .join('') : '';

    el('pai-modal-box').innerHTML = `
<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem">
  <h3 style="margin:0;color:var(--gold)">Edit Penilaian</h3>
  <button data-action="close-modal" style="background:transparent;border:none;cursor:pointer;font-size:1.25rem;padding:.2rem .35rem;border-radius:.25rem;line-height:1;opacity:.7">×</button>
</div>
<div style="display:flex;flex-direction:column;gap:.875rem">
  <div>
    ${fieldLbl('TP yang dinilai')}
    <select id="asmt-tp-sel" style="${inputCss()}">${tpOptHtml}</select>
  </div>
  <div>
    ${fieldLbl('Jenis penilaian')}
    <div id="asmt-jenis-chips" style="display:flex;flex-wrap:wrap;gap:.5rem">${jenisChips}</div>
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
  <div>
    ${fieldLbl('Refleksi guru (opsional)')}
    <textarea id="asmt-refleksi" rows="2"
      style="${inputCss('resize:vertical')}"
      placeholder="Catatan refleksi…">${esc(item?.refleksi_guru ?? '')}</textarea>
  </div>
  <div style="display:flex;gap:.75rem;justify-content:flex-end;margin-top:.25rem">
    <button data-action="close-modal" style="min-height:var(--btn-h);background:transparent;color:var(--gold);border:1.5px solid var(--gold-border);font-size:var(--fs-ui);padding:0 var(--btn-px);border-radius:var(--btn-r);cursor:pointer">Batal</button>
    <button id="btn-asmt-save"
      style="padding:.5rem 1.25rem;background:var(--gold);
      color:var(--text-on-gold,#000);border:none;border-radius:.375rem;
      font-weight:600;cursor:pointer">Simpan</button>
  </div>
  <div id="asmt-err" style="color:#e74c3c;font-size:var(--fs-caption);display:none"></div>
</div>`;

    const jenisEl = el('pai-modal-box').querySelector('#asmt-jenis-chips');
    wireChips(jenisEl, false, val => { selJenis = val; });

    el('asmt-teknik-sel').addEventListener('change', function () {
      selTeknik = this.value;
      const opts     = selTeknik ? (INSTRUMEN_MAP[selTeknik] || []) : [];
      const instrRow = el('asmt-instr-row');
      const instrSel = el('asmt-instr-sel');
      if (opts.length) {
        instrSel.innerHTML = `<option value="">— Pilih —</option>` +
          opts.map(i => `<option value="${i}">${i}</option>`).join('');
        instrRow.style.display = '';
      } else {
        instrRow.style.display = 'none';
      }
    });

    el('btn-asmt-save').addEventListener('click', async () => {
      const payload = {
        tp_kktp_id:    el('asmt-tp-sel').value || null,
        jenis:         selJenis,
        teknik:        el('asmt-teknik-sel').value || null,
        instrumen:     el('asmt-instr-sel')?.value || null,
        refleksi_guru: el('asmt-refleksi').value.trim() || null,
      };
      el('btn-asmt-save').disabled = true;
      try {
        await SipApi.updateAssessment(editId, payload);
        _asmts = _asmts.map(a => a.id === editId ? { ...a, ...payload } : a);
        closeModal();
        renderAsmtList();
        toast('Penilaian berhasil diperbarui');
      } catch (err) {
        el('asmt-err').textContent = err.message || 'Gagal menyimpan';
        el('asmt-err').style.display = '';
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
  // BODY INSTRUMEN — helpers untuk 42 pola wireframe
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
      if (instrumen === 'Pilihan Ganda') {
        inner = `<div style="display:flex;gap:.75rem;margin-bottom:.5rem">
  <div style="flex:1">
    ${fieldLbl('Jumlah soal')}
    <input type="number" id="pai-pg-jml" min="1" value="1" style="${inputCss()}">
  </div>
  <div style="flex:1">
    ${fieldLbl('Bobot per soal')}
    <select id="pai-pg-bobot" style="${inputCss()}">
      <option value="sama_rata">Sama rata</option>
      <option value="custom">Custom</option>
    </select>
  </div>
</div>
<div id="pai-pg-soals">${pgSoalHtml(0)}</div>
${addBtnHtml('btn-tambah-pg-soal', '+ Tambah soal')}
<div style="font-size:var(--fs-caption);color:var(--text-secondary);
  margin-top:.375rem">Rekap skor dihitung otomatis</div>`;
      } else if (instrumen === 'Uraian') {
        inner = `<div id="pai-uraian-soals">${uraianSoalHtml(0)}</div>
${addBtnHtml('btn-tambah-uraian-soal', '+ Tambah soal')}
<div style="font-size:var(--fs-caption);color:var(--text-secondary);
  margin-top:.375rem">Total skor dihitung otomatis</div>`;
      } else if (instrumen === 'Campuran') {
        inner = `<div style="font-size:var(--fs-ui);font-weight:600;
  margin-bottom:.5rem">Bagian A — Pilihan Ganda</div>
<div style="display:flex;gap:.75rem;margin-bottom:.5rem">
  <div style="flex:1">
    ${fieldLbl('Jumlah soal PG')}
    <input type="number" id="pai-mix-pg-jml" min="1" value="1" style="${inputCss()}">
  </div>
  <div style="flex:1">
    ${fieldLbl('Bobot bagian (%)')}
    <input type="number" id="pai-mix-pg-bobot" min="0" max="100" value="60"
      style="${inputCss()}">
  </div>
</div>
<div id="pai-mix-pg-soals">${pgSoalHtml(0)}</div>
${addBtnHtml('btn-tambah-mix-pg', '+ Tambah soal PG')}
<div style="font-size:var(--fs-ui);font-weight:600;margin:.75rem 0 .5rem">
  Bagian B — Uraian</div>
<div style="display:flex;gap:.75rem;margin-bottom:.5rem">
  <div style="flex:1">
    ${fieldLbl('Jumlah soal Uraian')}
    <input type="number" id="pai-mix-ur-jml" min="1" value="1" style="${inputCss()}">
  </div>
  <div style="flex:1">
    ${fieldLbl('Bobot bagian (%)')}
    <input type="number" id="pai-mix-ur-bobot" min="0" max="100" value="40"
      style="${inputCss()}">
  </div>
</div>
<div id="pai-mix-ur-soals">${uraianSoalHtml(0)}</div>
${addBtnHtml('btn-tambah-mix-ur', '+ Tambah soal uraian')}
<div style="font-size:var(--fs-caption);color:var(--text-secondary);margin-top:.5rem">
  Total bobot: 100%. Skor akhir dihitung otomatis.</div>`;
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
            Body Instrumen</div>
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
      if (instrumen === 'Pilihan Ganda') {
        data.bobot = container.querySelector('#pai-pg-bobot')?.value || 'sama_rata';
        data.soals = Array.from(container.querySelectorAll('#pai-pg-soals .pai-pg-soal'))
          .map(s => {
            const pickers = s.querySelectorAll('.pai-sw-picker');
            return {
              pertanyaan: s.querySelector('.pg-pertanyaan')?.value.trim() || null,
              kunci:      s.querySelector('.pg-kunci')?.value || 'A',
              benar:      getSiswaOfPicker(pickers[0]),
              salah:      getSiswaOfPicker(pickers[1]),
            };
          });
      } else if (instrumen === 'Uraian') {
        data.soals = Array.from(container.querySelectorAll('#pai-uraian-soals .pai-uraian-soal'))
          .map(s => ({
            pertanyaan: s.querySelector('.uraian-pertanyaan')?.value.trim() || null,
            skor_maks:  parseFloat(s.querySelector('.uraian-skor-maks')?.value) || 0,
            rubrik:     s.querySelector('.uraian-rubrik')?.value.trim() || null,
            skor_siswa: Array.from(s.querySelectorAll('.uraian-srow'))
              .map(r => ({ sid: r.dataset.sid, skor: parseFloat(r.querySelector('.uraian-skor')?.value) || null }))
              .filter(x => x.skor !== null),
          }));
      } else if (instrumen === 'Campuran') {
        data.pg_bobot = parseInt(container.querySelector('#pai-mix-pg-bobot')?.value) || 60;
        data.ur_bobot = parseInt(container.querySelector('#pai-mix-ur-bobot')?.value) || 40;
        data.pg_soals = Array.from(container.querySelectorAll('#pai-mix-pg-soals .pai-pg-soal'))
          .map(s => {
            const pickers = s.querySelectorAll('.pai-sw-picker');
            return {
              pertanyaan: s.querySelector('.pg-pertanyaan')?.value.trim() || null,
              kunci:      s.querySelector('.pg-kunci')?.value || 'A',
              benar:      getSiswaOfPicker(pickers[0]),
              salah:      getSiswaOfPicker(pickers[1]),
            };
          });
        data.ur_soals = Array.from(container.querySelectorAll('#pai-mix-ur-soals .pai-uraian-soal'))
          .map(s => ({
            pertanyaan: s.querySelector('.uraian-pertanyaan')?.value.trim() || null,
            skor_maks:  parseFloat(s.querySelector('.uraian-skor-maks')?.value) || 0,
            skor_siswa: Array.from(s.querySelectorAll('.uraian-srow'))
              .map(r => ({ sid: r.dataset.sid, skor: parseFloat(r.querySelector('.uraian-skor')?.value) || null }))
              .filter(x => x.skor !== null),
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
      payload.tindak_lanjut = srow.querySelector('.stu-tl')?.value.trim() || null;
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
    const isWali    = _roleGuru === 'WALI_KELAS_SD';
    const hasGroups = Object.keys(_sGroups).length > 0;
    let selJenis     = 'FORMATIF';
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
        ...candidates.map(t => `<option value="${t.id}">${esc(t.judul)}</option>`),
      ].join('');
    }

    const jenisChips = ['DIAGNOSTIK', 'FORMATIF', 'SUMATIF']
      .map(j => chipHtml(j, JENIS_LBL[j], selJenis === j)).join('');

    const teknikOptHtml = ['', 'OBSERVASI', 'TES', 'PENUGASAN', 'PROYEK', 'PORTOFOLIO', 'UNJUK_KERJA']
      .map(t => `<option value="${t}">${t ? teknikLbl(t) : '— Teknik (opsional) —'}</option>`)
      .join('');

    const grupBtns = hasGroups
      ? ['A', 'B', 'C'].map(g =>
          `<button type="button" data-filter-grup="${g}"
            style="padding:.25rem .65rem;border-radius:1rem;font-size:var(--fs-caption);cursor:pointer;
            border:1.5px solid var(--border-subtle,rgba(255,255,255,.18));
            color:var(--text-secondary);background:transparent">Grup ${g}</button>`
        ).join('')
      : '';

    const studentListHtml = _roster.length
      ? _roster.map(s => {
          const g     = _sGroups[s.id] ?? '';
          const badge = g
            ? `<span style="font-size:.65rem;padding:.1rem .4rem;border-radius:.25rem;
                background:var(--gold);color:var(--text-on-gold,#000);font-weight:700">${g}</span>`
            : '';
          return `
<label style="display:flex;align-items:center;gap:.5rem;padding:.3rem 0;cursor:pointer"
  data-grup="${g}">
  <input type="checkbox" class="asmt-stu-chk" data-sid="${s.id}"
    style="width:1rem;height:1rem;cursor:pointer">
  <span style="font-size:var(--fs-ui)">${esc(s.nama)}</span>
  ${badge}
</label>`;
        }).join('')
      : `<p style="color:var(--text-secondary);font-size:var(--fs-caption);margin:.25rem 0">
          Belum ada siswa di kelas ini.</p>`;

    const mapelChipsHtml = isWali
      ? `<div>
          ${fieldLbl('Mata Pelajaran')}
          <div id="asmt-mapel-chips" style="display:flex;flex-wrap:wrap;gap:.5rem">
            ${MAPEL_SD.map(m => chipHtml(m, m, selMapel === m)).join('')}
          </div>
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
    <div id="asmt-jenis-chips" style="display:flex;flex-wrap:wrap;gap:.5rem">${jenisChips}</div>
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
  <div>
    <div style="font-size:var(--fs-caption);font-weight:700;color:var(--gold);
      text-transform:uppercase;letter-spacing:.07em;margin-bottom:.375rem">
      Output per Siswa</div>
    <div style="display:flex;gap:.4rem;flex-wrap:wrap;margin-bottom:.5rem">
      <button type="button" id="asmt-pilih-semua"
        style="padding:.25rem .65rem;border-radius:1rem;font-size:var(--fs-caption);cursor:pointer;
        border:1.5px solid var(--gold);background:var(--gold);color:var(--text-on-gold,#000)">
        Pilih Semua
      </button>
      ${grupBtns}
    </div>
    <div id="asmt-student-list"
      style="max-height:10rem;overflow-y:auto;
      border:1px solid var(--border-subtle,rgba(255,255,255,.18));
      border-radius:.375rem;padding:.375rem .625rem">
      ${studentListHtml}
    </div>
  </div>
  <div id="asmt-per-siswa-wrap" style="display:none">
    <div style="font-size:var(--fs-caption);color:var(--text-secondary);
      margin-bottom:.5rem">Input nilai/status per siswa:</div>
    <div id="asmt-per-siswa-rows"></div>
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

    // ── Wire Mapel chips (WALI_KELAS_SD only) → cascade filter TP dropdown ──
    if (isWali) {
      const mapelChipsEl = el('pai-modal-box').querySelector('#asmt-mapel-chips');
      wireChips(mapelChipsEl, false, val => {
        selMapel = val;
        el('asmt-tp-sel').innerHTML = buildTpOptHtml();
      });
    }

    // ── Wire Jenis chips ─────────────────────────────────────────────────
    const jenisEl = el('pai-modal-box').querySelector('#asmt-jenis-chips');
    wireChips(jenisEl, false, val => {
      selJenis = val;
      refreshPerSiswa(getSelSids());
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
          renderBodyInstrumen(selTeknik, selInstrumen, bodyInstrWrap);
        };
      } else {
        instrRow.style.display = 'none';
      }
      renderBodyInstrumen(selTeknik, '', bodyInstrWrap);
    });

    // ── Wire TP change ───────────────────────────────────────────────────
    el('asmt-tp-sel').addEventListener('change', () => {
      const sids = getSelSids();
      if (sids.length) refreshPerSiswa(sids);
    });

    // ── Wire Pilih Semua ─────────────────────────────────────────────────
    el('asmt-pilih-semua').addEventListener('click', () => {
      el('asmt-student-list').querySelectorAll('.asmt-stu-chk')
        .forEach(chk => { chk.checked = true; });
      refreshPerSiswa(getSelSids());
    });

    // ── Wire Grup filter ─────────────────────────────────────────────────
    el('pai-modal-box').querySelectorAll('[data-filter-grup]').forEach(btn => {
      btn.addEventListener('click', () => {
        const g = btn.dataset.filterGrup;
        el('asmt-student-list').querySelectorAll('.asmt-stu-chk').forEach(chk => {
          chk.checked = chk.closest('label')?.dataset.grup === g;
        });
        refreshPerSiswa(getSelSids());
      });
    });

    // ── Wire checklist ───────────────────────────────────────────────────
    el('asmt-student-list').addEventListener('change', e => {
      if (e.target.classList.contains('asmt-stu-chk')) refreshPerSiswa(getSelSids());
    });

    // ── KKTP live update di tambah penilaian ────────────────────────────
    el('asmt-per-siswa-wrap').addEventListener('input', e => {
      if (!e.target.classList.contains('stu-nilai')) return;
      const kktp = getKktpItems()[0];
      if (!kktp) return;
      const val     = parseFloat(e.target.value);
      const stat    = e.target.closest('.pai-srow')?.querySelector('.stu-kktp-stat');
      if (!stat) return;
      const rentang = getRentang(kktp);
      const n       = isNaN(val) || e.target.value === '' ? null : val;
      stat.textContent = kktpStatText(n, rentang);
      stat.style.color  = kktpStatColor(n, rentang);
    });

    // ── Helpers ──────────────────────────────────────────────────────────
    function getSelSids() {
      return Array.from(
        el('asmt-student-list').querySelectorAll('.asmt-stu-chk:checked')
      ).map(chk => chk.dataset.sid);
    }

    function getKktpItems() {
      const tpId = el('asmt-tp-sel')?.value || null;
      return tpId ? _tpList.filter(t => t.parent_id === tpId && t.tipe === 'KKTP') : [];
    }

    function refreshPerSiswa(sids) {
      const wrap = el('asmt-per-siswa-wrap');
      const rows = el('asmt-per-siswa-rows');
      if (!wrap || !rows) return;
      if (!sids.length) { wrap.style.display = 'none'; return; }
      wrap.style.display = '';
      const kktpItems = getKktpItems();
      rows.innerHTML = sids
        .map(sid => {
          const stu = _roster.find(r => r.id === sid);
          return stu ? studentRowHtml(stu, {}, selJenis, kktpItems) : '';
        })
        .join('');
      rows.querySelectorAll('.stu-status-chips').forEach(c => wireChips(c, false));
    }

    // ── Save ─────────────────────────────────────────────────────────────
    el('btn-asmt-save').addEventListener('click', async () => {
      const sids  = getSelSids();
      const errEl = el('asmt-err');
      if (!sids.length) {
        errEl.textContent = 'Pilih minimal satu siswa';
        errEl.style.display = '';
        return;
      }
      const instrBody  = collectBodyInstrumen(bodyInstrWrap, selTeknik, selInstrumen);
      const payload = {
        tp_kktp_id:    el('asmt-tp-sel').value || null,
        jenis:         selJenis,
        teknik:        selTeknik || null,
        instrumen:     selInstrumen || null,
        tujuan:        el('asmt-tujuan').value.trim() || null,
        konten:        instrBody ? JSON.stringify(instrBody) : null,
        refleksi_guru: el('asmt-refleksi').value.trim() || null,
      };
      el('btn-asmt-save').disabled = true;
      errEl.style.display = 'none';
      try {
        const row       = await SipApi.createAssessment(_cId, _tId, payload);
        const kktpItems = getKktpItems();
        _asmts.push(row);
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
          try {
            await SipApi.upsertAssessmentResult(_cId, _tId, row.id, sid, resPayload);
          } catch {}
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

  // ══════════════════════════════════════════════════════════════════════════════
  // SECTION 3 — Grade entry modal (Isi Nilai)
  // ══════════════════════════════════════════════════════════════════════════════

  async function openAsmtDetail(asmtId) {
    const asmt = _asmts.find(a => a.id === asmtId);
    if (!asmt) return;

    el('pai-modal-box').innerHTML =
      '<div style="padding:1rem;text-align:center;color:var(--text-secondary)">Memuat hasil siswa…</div>';
    openModal();

    const tp        = _tpList.find(t => t.id === asmt.tp_kktp_id);
    const kktpItems = tp ? _tpList.filter(t => t.parent_id === tp.id && t.tipe === 'KKTP') : [];
    const results   = await SipApi.getAssessmentResults(asmtId).catch(() => []);
    const resMap    = Object.fromEntries(results.map(r => [r.student_id, r]));

    const teknik   = asmt.teknik ? asmt.teknik.replace(/_/g, ' ') : '';
    const titleStr = [teknik || JENIS_LBL[asmt.jenis], asmt.instrumen].filter(Boolean).join(' — ');

    const hasGroups = Object.keys(_sGroups).length > 0;
    const filterHtml = hasGroups ? `
<div id="pai-filter-bar" style="display:flex;gap:.4rem;flex-wrap:wrap;margin-bottom:.75rem">
  ${['all', 'A', 'B', 'C'].map((g, i) => `
  <button type="button" data-action="filter-grup" data-filter="${g}"
    style="padding:.25rem .7rem;border-radius:1rem;font-size:var(--fs-caption);cursor:pointer;
    border:1.5px solid ${i === 0 ? 'var(--gold)' : 'var(--border-subtle)'};
    ${i === 0 ? 'background:var(--gold);color:var(--text-on-gold,#000)' : 'color:var(--text-secondary)'}">
    ${g === 'all' ? 'Semua' : `Grup ${g}`}
  </button>`).join('')}
</div>` : '';

    el('pai-modal-box').innerHTML = `
<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:.75rem">
  <div>
    <div style="font-size:var(--fs-h3);font-weight:var(--fw-medium,500);color:var(--gold)">
      ${esc(titleStr)}</div>
    ${tp ? `<div style="font-size:var(--fs-caption);color:var(--text-secondary)">
      ${esc(tp.judul)}</div>` : ''}
  </div>
  <button data-action="close-modal" style="background:transparent;border:none;cursor:pointer;font-size:1.25rem;padding:.2rem .35rem;border-radius:.25rem;line-height:1;opacity:.7;flex-shrink:0">×</button>
</div>
${filterHtml}
${!_roster.length
  ? `<p style="color:var(--text-secondary);font-size:var(--fs-caption)">
      Belum ada siswa aktif di kelas ini.</p>`
  : `<div id="pai-srows"
      data-asmt-id="${asmtId}"
      data-jenis="${asmt.jenis}"
      data-kktp="${kktpItems.length ? encodeURIComponent(JSON.stringify(kktpItems)) : ''}">
    </div>
    <div style="text-align:right;margin-top:1rem">
      <button type="button" data-action="save-results" data-asmt-id="${asmtId}"
        style="padding:.5rem 1.5rem;background:var(--gold);
        color:var(--text-on-gold,#000);border:none;border-radius:.375rem;
        font-weight:600;cursor:pointer">💾 Simpan Semua</button>
      <div id="pai-save-status"
        style="font-size:var(--fs-caption);margin-top:.375rem;min-height:1.25rem"></div>
    </div>`
}`;

    el('pai-modal-box')._resMap = resMap;
    buildStudentRows('all', asmt.jenis, kktpItems, resMap);

    if (asmt.jenis === 'SUMATIF' && kktpItems.length) {
      const kktp = kktpItems[0];
      el('pai-srows')?.addEventListener('input', e => {
        if (!e.target.classList.contains('stu-nilai')) return;
        const val     = parseFloat(e.target.value);
        const stat    = e.target.closest('.pai-srow')?.querySelector('.stu-kktp-stat');
        if (!stat) return;
        const rentang = getRentang(kktp);
        const n       = isNaN(val) || e.target.value === '' ? null : val;
        stat.textContent = kktpStatText(n, rentang);
        stat.style.color  = kktpStatColor(n, rentang);
      });
    }
  }

  function buildStudentRows(filterGrup, jenis, kktpItems, resMap) {
    const c = el('pai-srows');
    if (!c) return;
    const students = filterGrup !== 'all'
      ? _roster.filter(s => (_sGroups[s.id] ?? resMap[s.id]?.grup_diferensiasi ?? '') === filterGrup)
      : _roster;
    c.innerHTML = students.map(s => studentRowHtml(s, resMap[s.id] ?? {}, jenis, kktpItems)).join('');
    c.querySelectorAll('.stu-status-chips').forEach(ch => wireChips(ch, false));
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
<input type="text" class="stu-tl" placeholder="Tindak lanjut… (opsional)"
  value="${esc(res.tindak_lanjut ?? '')}"
  style="${inputCss('font-size:var(--fs-caption);margin-top:.25rem')}">`;
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

  function onFilterGrup(btn) {
    el('pai-filter-bar')?.querySelectorAll('[data-action="filter-grup"]').forEach(b => {
      const s = b === btn;
      b.style.background  = s ? 'var(--gold)' : '';
      b.style.color       = s ? 'var(--text-on-gold,#000)' : 'var(--text-secondary)';
      b.style.borderColor = s ? 'var(--gold)' : 'var(--border-subtle)';
    });
    const rowsEl = el('pai-srows');
    if (!rowsEl) return;
    const jenis     = rowsEl.dataset.jenis;
    const kktpItems = rowsEl.dataset.kktp
      ? JSON.parse(decodeURIComponent(rowsEl.dataset.kktp)) : [];
    const resMap = el('pai-modal-box')._resMap ?? {};
    buildStudentRows(btn.dataset.filter, jenis, kktpItems, resMap);
  }

  async function saveResults(btn) {
    const rowsEl = el('pai-srows');
    const statEl = el('pai-save-status');
    if (!rowsEl) return;

    const asmtId    = btn.dataset.asmtId;
    const jenis     = rowsEl.dataset.jenis;
    const kktpItems = rowsEl.dataset.kktp
      ? JSON.parse(decodeURIComponent(rowsEl.dataset.kktp)) : [];

    btn.disabled    = true;
    btn.textContent = '⏳ Menyimpan…';

    const rows   = el('pai-modal-box').querySelectorAll('.pai-srow');
    let   saved  = 0;
    const failed = [];

    for (const row of rows) {
      const sid     = row.dataset.sid;
      const payload = buildResultPayload(row, jenis, kktpItems);

      if (jenis === 'DIAGNOSTIK' && payload.grup_diferensiasi) {
        try {
          await SipApi.upsertStudentGroup(_cId, sid, payload.grup_diferensiasi);
          _sGroups[sid] = payload.grup_diferensiasi;
        } catch {}
      }

      try {
        await SipApi.upsertAssessmentResult(_cId, _tId, asmtId, sid, payload);
        const box = el('pai-modal-box');
        if (box._resMap) {
          box._resMap[sid] = { ...(box._resMap[sid] ?? {}), ...payload };
        }
        saved++;
      } catch {
        const s = _roster.find(r => r.id === sid);
        if (s) failed.push(s.nama);
      }
    }

    btn.disabled    = false;
    btn.textContent = '💾 Simpan Semua';

    if (statEl) {
      statEl.textContent = failed.length
        ? `Disimpan ${saved}, gagal: ${failed.slice(0, 3).join(', ')}${failed.length > 3 ? '…' : ''}`
        : `✓ ${saved} siswa disimpan`;
      statEl.style.color = failed.length ? '#e74c3c' : 'var(--success,#2d6a4f)';
    }
    if (!failed.length) toast(`${saved} hasil siswa disimpan`);
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // SECTION 4 — Rekap Semester
  // ══════════════════════════════════════════════════════════════════════════════

  async function renderRecap() {
    const c = el('pai-recap-wrap');
    if (!c) return;

    c.innerHTML = '<div style="color:var(--text-secondary);padding:.5rem 0">Memuat rekap…</div>';

    const sumatifs = _asmts.filter(a => a.jenis === 'SUMATIF');
    if (!sumatifs.length) {
      c.innerHTML = `<p style="color:var(--text-secondary);font-size:var(--fs-caption)">
        Belum ada penilaian Sumatif. Rekap dihitung otomatis dari rata-rata nilai sumatif.</p>`;
      return;
    }

    const allResults = await Promise.all(
      sumatifs.map(a => SipApi.getAssessmentResults(a.id).catch(() => []))
    );

    // tpId -> studentId -> [nilai]
    const tpMap = {};
    sumatifs.forEach((a, i) => {
      const tpId = a.tp_kktp_id ?? '__no_tp__';
      if (!tpMap[tpId]) tpMap[tpId] = {};
      (allResults[i] ?? []).forEach(r => {
        if (r.nilai == null) return;
        if (!tpMap[tpId][r.student_id]) tpMap[tpId][r.student_id] = [];
        tpMap[tpId][r.student_id].push(r.nilai);
      });
    });

    const tpIds = Object.keys(tpMap);
    if (!tpIds.length || !_roster.length) {
      c.innerHTML = `<p style="color:var(--text-secondary);font-size:var(--fs-caption)">
        Belum ada data nilai sumatif.</p>`;
      return;
    }

    const thStyle = `padding:.5rem .625rem;border-bottom:2px solid var(--gold);
      font-size:var(--fs-caption);white-space:nowrap;text-align:left`;
    const tpHeaders = tpIds.map(tid => {
      const tp = _tpList.find(t => t.id === tid);
      return `<th style="${thStyle}">${tp ? esc(tp.judul) : 'Tanpa TP'}</th>`;
    }).join('');

    const tdBorder = 'border-bottom:1px solid var(--border-subtle,rgba(255,255,255,.08))';
    const rows = _roster.map(s => {
      const cells = tpIds.map(tid => {
        const vals = tpMap[tid][s.id] ?? [];
        const avg  = vals.length
          ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
        const tp   = _tpList.find(t => t.id === tid);
        const kktp = tp
          ? _tpList.find(t => t.parent_id === tp.id && t.tipe === 'KKTP')
          : null;
        const tercapai = kktp && avg != null
          ? (() => { const p = getPredikat(avg, getRentang(kktp)); return p === 'BSH' || p === 'SB'; })()
          : null;
        const badge    = tercapai === true ? ' ✓' : tercapai === false ? ' ✗' : '';
        const color    = tercapai === true  ? 'var(--success,#2d6a4f)'
                       : tercapai === false ? '#c0392b' : 'var(--text-secondary)';
        return `<td style="padding:.5rem .625rem;text-align:center;${tdBorder};
            font-size:var(--fs-ui);color:${color}">
            ${avg != null ? avg.toFixed(1) + badge : '—'}
          </td>`;
      }).join('');
      return `<tr>
        <td style="padding:.5rem .625rem;${tdBorder};font-size:var(--fs-ui)">
          ${esc(s.nama)}</td>
        ${cells}
      </tr>`;
    }).join('');

    c.innerHTML = `
<div style="overflow-x:auto;-webkit-overflow-scrolling:touch">
  <table style="width:100%;border-collapse:collapse;
    min-width:${160 + tpIds.length * 110}px">
    <thead>
      <tr>
        <th style="${thStyle}">Nama Siswa</th>
        ${tpHeaders}
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
</div>
<p style="font-size:var(--fs-caption);color:var(--text-secondary);margin-top:.5rem">
  Nilai = rata-rata semua Sumatif per TP.
  ✓/✗ = status KKTP (jika ada batas KKTP).</p>`;
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
