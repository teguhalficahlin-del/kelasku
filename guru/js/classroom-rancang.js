(function () {
  'use strict';

  // ─── State ──────────────────────────────────────────────────────────────────

  const SipApi = window.api;  // alias ke API global

  let _cId = null;
  let _loaded = false;
  let _initializing = false;  // guard: mencegah initRancangTab paralel
  let _settings = null;   // data dari rancang_settings (pre-fill + identitas)
  let _profil   = null;   // data dari rancang_profil (step 0 — per akun guru)
  let _dokumen  = [];     // data dari rancang_dokumen (daftar file tersimpan)
  let _teachingContext = null; // Phase 1 authority resolved for active subject/classroom
  let _durableAtp = null;      // { atp_id, atp_revision_id }
  let _planningContext = null; // durable Phase 2A planning context
  let _jpPolicy = null;

  // async guard flags — mencegah double-submit pada fungsi kritis
  let _confirmingAllocation = false;
  let _enteringPipeline     = false;
  let _confirmingCtx        = false;
  let _confirmingAsm        = false;
  let _enteringMaterial     = false;
  let _enteringMeeting      = false;
  let _enteringFollowup     = false;
  let _enteringValidation   = false;

  // wireCustomDropdown AbortController registry
  const _dropdownControllers = new Map();

  // Jawaban per blok
  const _ans = {
    mapel: '',           // label human-readable untuk AI payload
    mapelKey: '',        // key JSON cp-data.json
    bidangKeahlian: null, // bidang keahlian SMK, null jika bukan SMK
    programKeahlian: null, // program keahlian SMK, null jika bukan SMK
    jenjang: '',
    fase: '',
    elemenTerpilih: [],  // elemen CP yang diampu guru (produktif SMK)
    smk: null,       // null jika bukan SMK
    niat_guru: {},   // diisi oleh handleStep3ASubmit
    preferensi: {},  // diisi oleh handleStep3BSubmit
    tp_terpilih: null,
    konteks_kelas: {},
  };

  // Elemen CP yang sudah di-fetch
  let _cpElemen = [];    // array { nama, cp_normatif }
  let _cpRingkasan = []; // array { elemen, konkret } dari AI
  let _cpLabel = '';
  let _cpUmum = '';

  // ATP hasil generate
  let _atpList = [];

  // Hasil generate rencana terakhir (untuk navigasi balik ke step 6)
  let _rencana = null;

  // Phase 2C pipeline state — loaded from server, not from localStorage as authority
  let _phase2cState = null;

  // Stable client operation IDs for regenerate — generated once per intent, cleared on success.
  // A retry of the SAME intent reuses the same ID; a NEW click generates a fresh one.
  let _ctxRegenOpId = null;
  let _asmRegenOpId = null;
  let _matRegenOpId = null;
  // Per-meeting regenerate op IDs: Map<meeting_no, client_operation_id>
  const _meetRegenOpIds = new Map();

  // Step saat ini: 0 = profil (onboarding), 1–7 = wizard
  let _step = 1;

  // Guard flag per generate
  let _genCp     = false;
  let _genAtp    = false;
  let _genRencana = false;

  // Fase options
  const FASE_OPTS = [
    { value: 'fase_a', label: 'Fase A — Kelas 1–2 SD' },
    { value: 'fase_b', label: 'Fase B — Kelas 3–4 SD' },
    { value: 'fase_c', label: 'Fase C — Kelas 5–6 SD' },
    { value: 'fase_d', label: 'Fase D — Kelas 7–9 SMP' },
    { value: 'fase_e', label: 'Fase E — Kelas 10 SMA/SMK' },
    { value: 'fase_f', label: 'Fase F — Kelas 11–12 SMA/SMK' },
  ];

  // ─── Helpers ────────────────────────────────────────────────────────────────

  function esc(s) {
    return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  // Pastikan nilai bertipe array — handle array, JSON string, comma-string, null
  function normalizeArray(val) {
    if (Array.isArray(val)) return val;
    if (!val) return [];
    if (typeof val === 'string') {
      try { const p = JSON.parse(val); if (Array.isArray(p)) return p; } catch (_) {}
      return val.split(',').map(s => s.trim()).filter(Boolean);
    }
    return [];
  }

  function el(id) { return document.getElementById(id); }

  function showError(containerId, msg) {
    const c = el(containerId);
    if (!c) return;
    c.textContent = msg;
    c.style.display = msg ? '' : 'none';
  }

  function loading(html) {
    return `<div class="rp-loading"><div class="rp-loading-dot"></div>${esc(html)}</div>`;
  }

  function btnPrimary(id, label, extra) {
    return `<button type="button" id="${id}" class="btn-primary" style="min-height:var(--btn-h);background:var(--gold);color:var(--text-on-gold);font-weight:var(--fw-medium);font-size:var(--fs-ui);padding:0 var(--btn-px);border-radius:var(--btn-r);border:none;cursor:pointer;transition:background 150ms,box-shadow 150ms;" ${extra||''}>${label}</button>`;
  }

  function btnSecondary(id, label) {
    return `<button type="button" id="${id}" style="min-height:var(--btn-h);background:transparent;color:var(--gold);border:1.5px solid var(--gold-border);font-size:var(--fs-ui);padding:0 var(--btn-px);border-radius:var(--btn-r);cursor:pointer;transition:background 150ms;">${label}</button>`;
  }

  // ─── Step bar ───────────────────────────────────────────────────────────────

  const STEPS = ['Konteks','SMK','Prefer.','ATP','Kelas','Output','Dokumen'];

  function isStepNavigable(n) {
    switch (n) {
      case 1: return true;
      case 2: return !!_ans.mapel && _ans.jenjang === 'SMK';
      case 3: return !!_ans.mapel;
      case 4: return _atpList.length > 0;
      case 5: return !!_ans.tp_terpilih;
      case 6: return !!_rencana;
      case 7: return true;
      default: return false;
    }
  }

  function navigateToStep(n) {
    switch (n) {
      case 1: _step = 1; renderStep1(); break;
      case 2:
        if (_ans.jenjang === 'SMK') { _step = 2; renderStep2(); }
        else { _step = 3; renderStep3A(); }
        break;
      case 3:
        if (!_ans.mapel) return;
        _step = 3; renderStep3A();
        break;
      case 4:
        if (!_atpList.length) return;
        _step = 4; renderStep4(_atpList);
        break;
      case 5:
        if (!_ans.tp_terpilih) return;
        _step = 5; renderStep5();
        break;
      case 6:
        if (!_rencana) { if (_ans.tp_terpilih) { _step = 5; renderStep5(); } return; }
        _step = 6; renderStep6(_rencana);
        break;
      case 7:
        _step = 7; renderStep7();
        break;
    }
  }

  function renderStepBar() {
    const wrap = el('rp-step-bar');
    if (!wrap) return;
    wrap.innerHTML = STEPS.map((lbl, i) => {
      const n = i + 1;
      const cls = n < _step ? 'done' : n === _step ? 'active' : '';
      const lineClass = n < _step ? 'done' : '';
      const line = n < STEPS.length
        ? `<div class="rp-step-line ${lineClass}"></div>`
        : '';
      const nav = isStepNavigable(n) ? ' rp-step-dot--nav' : '';
      const disabled = (n === 2 && !isStepNavigable(2)) ? ' rp-step-dot--disabled' : '';
      return `<div class="rp-step ${cls}">
  <div class="rp-step-dot${nav}${disabled}" data-step="${n}">${n < _step ? '✓' : n}</div>
  <div class="rp-step-lbl">${esc(lbl)}</div>
</div>${line}`;
    }).join('');

    wrap.onclick = e => {
      const dot = e.target.closest('.rp-step-dot--nav');
      if (!dot) return;
      const n = parseInt(dot.dataset.step);
      if (n) navigateToStep(n);
    };
  }

  // ─── Chip builder ───────────────────────────────────────────────────────────

  function renderChips(opts, key, container, multi, required) {
    const wrap = document.createElement('div');
    wrap.className = 'rp-chip-group';
    wrap.dataset.key = key;
    wrap.dataset.multi = multi ? '1' : '0';
    wrap.dataset.required = required ? '1' : '0';
    opts.forEach(o => {
      const value = typeof o === 'object' ? o.value : o;
      const label = typeof o === 'object' ? o.label : o;
      const chip = document.createElement('div');
      chip.className = 'rp-chip';
      chip.textContent = label;
      chip.dataset.value = value;
      chip.addEventListener('click', () => {
        if (!multi) {
          wrap.querySelectorAll('.rp-chip').forEach(c => c.classList.remove('selected'));
        }
        chip.classList.toggle('selected');
      });
      wrap.appendChild(chip);
    });
    container.appendChild(wrap);
    return wrap;
  }

  function getChipValues(groupEl) {
    return [...groupEl.querySelectorAll('.rp-chip.selected')].map(c => {
      if (c.dataset.isLainnya === '1') {
        const input = groupEl.parentElement?.querySelector('.rp-lainnya-input');
        const val = input?.value.trim();
        return val || 'Lainnya';
      }
      return c.dataset.value;
    });
  }

  function validateChips(groupEl) {
    if (groupEl.dataset.required !== '1') return true;
    return getChipValues(groupEl).length > 0;
  }

  // ─── Custom dropdown helpers ─────────────────────────────────────────────────

  function makeCustomDropdown(id, opsi, saved, hideLainnya) {
    // Support array of string atau array of {value, label}
    const normalizedOpsi = opsi.map(o =>
      typeof o === 'string' ? { value: o, label: o } : o
    );
    const isLainnya = !hideLainnya && !!saved && !normalizedOpsi.some(o => o.value === saved);
    const currentVal = isLainnya ? '__lainnya__' : (saved || '');
    const savedLabel = normalizedOpsi.find(o => o.value === saved)?.label || saved || '';
    const currentLabel = isLainnya ? 'Lainnya'
      : saved ? esc(savedLabel) : '— Pilih —';

    const optionHtml = [
      `<div class="rp-custom-select-option placeholder" data-value="">— Pilih —</div>`,
      ...normalizedOpsi.map(o =>
        `<div class="rp-custom-select-option${saved === o.value ? ' selected' : ''}" data-value="${esc(o.value)}">${esc(o.label)}</div>`
      ),
      ...(hideLainnya ? [] : [`<div class="rp-custom-select-option${isLainnya ? ' selected' : ''}" data-value="__lainnya__">Lainnya</div>`]),
    ].join('');

    return `<div class="rp-custom-select" id="${id}" data-value="${esc(currentVal)}" tabindex="0">
  <div class="rp-custom-select-trigger">
    <span class="rp-custom-select-label">${currentLabel}</span>
    <span class="rp-custom-select-arrow">▼</span>
  </div>
  <div class="rp-custom-select-panel">
    ${optionHtml}
  </div>
</div>
<input type="text" id="${id}-txt" class="rp-select" placeholder="Jelaskan…"
  style="margin-top:var(--space-xs);display:${isLainnya ? 'block' : 'none'};"
  value="${esc(isLainnya ? saved : '')}">`;
  }

  function cleanupAllDropdowns() {
    _dropdownControllers.forEach(c => c.abort());
    _dropdownControllers.clear();
  }

  function wireCustomDropdown(id, onLainnyaToggle) {
    // Cleanup controller lama jika ada
    if (_dropdownControllers.has(id)) {
      _dropdownControllers.get(id).abort();
      _dropdownControllers.delete(id);
    }

    const wrap = el(id);
    if (!wrap) return;
    const trigger = wrap.querySelector('.rp-custom-select-trigger');
    const panel = wrap.querySelector('.rp-custom-select-panel');
    const labelEl = wrap.querySelector('.rp-custom-select-label');
    const txt = el(id + '-txt');

    const controller = new AbortController();
    const { signal } = controller;
    _dropdownControllers.set(id, controller);

    function openPanel() {
      const rect = wrap.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      panel.classList.remove('panel-up', 'panel-down');
      if (spaceBelow < 260 && spaceAbove > spaceBelow) {
        panel.classList.add('panel-up');
      } else {
        panel.classList.add('panel-down');
      }
      wrap.classList.add('open');
    }

    function closePanel() {
      wrap.classList.remove('open');
    }

    trigger?.addEventListener('click', e => {
      e.stopPropagation();
      if (wrap.classList.contains('open')) closePanel();
      else openPanel();
    }, { signal });

    wrap.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (wrap.classList.contains('open')) closePanel();
        else openPanel();
      }
      if (e.key === 'Escape') closePanel();
    }, { signal });

    panel?.querySelectorAll('.rp-custom-select-option').forEach(opt => {
      opt.addEventListener('click', e => {
        e.stopPropagation();
        const val = opt.dataset.value;
        panel.querySelectorAll('.rp-custom-select-option').forEach(o =>
          o.classList.remove('selected')
        );
        opt.classList.add('selected');
        if (labelEl) {
          labelEl.textContent = val === '' ? '— Pilih —'
            : val === '__lainnya__' ? 'Lainnya'
            : opt.textContent;
        }
        wrap.dataset.value = val;
        if (txt) {
          txt.style.display = val === '__lainnya__' ? 'block' : 'none';
          if (val !== '__lainnya__') txt.value = '';
        }
        closePanel();
        if (onLainnyaToggle) onLainnyaToggle(val);
      }, { signal });
    });

    document.addEventListener('click', e => {
      if (!document.contains(wrap)) return;
      if (!wrap.contains(e.target)) closePanel();
    }, { signal });

    window.addEventListener('scroll', closePanel, { signal, passive: true });
  }

  function getCustomSelVal(id) {
    const wrap = el(id);
    if (!wrap) return '';
    const val = wrap.dataset?.value ?? wrap.value ?? '';
    if (val === '__lainnya__') return (el(id + '-txt')?.value || '').trim() || 'Lainnya';
    return val;
  }

  // ─── Helpers Step 0 ────────────────────────────────────────────────────────

  const TITLE_CASE_EXCEPTIONS = new Set([
    'CAD','CAM','CASR','CNC','DCS','FCAW','GMAW','GTAW','IMO','IPA',
    'JIG','MICE','OAW','PPKS','RI','SAR','SAW','SMAW','VSAT',
  ]);

  function toTitleCase(str) {
    return str.replace(/\S+/g, w =>
      TITLE_CASE_EXCEPTIONS.has(w.toUpperCase())
        ? w.toUpperCase()
        : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
    );
  }

  // ─── Step 0 accordion + multiselect helpers ────────────────────────────────

  const _S0_PANEL_IDS = [
    'rp-s0-jenjang-acc','rp-s0-mapel-acc','rp-s0-kelas-acc',
    'rp-s0-semester-acc','rp-s0-identitas-acc',
  ];

  function s0AccOpen(panelId) {
    _S0_PANEL_IDS.forEach(id => { if (id !== panelId) el(id)?.classList.remove('open'); });
    el(panelId)?.classList.add('open');
  }

  function s0AccShow(panelId) {
    const p = el(panelId);
    if (!p) return;
    p.style.display = '';
    s0AccOpen(panelId);
  }

  function s0AccReveal(panelId) {
    const p = el(panelId);
    if (p) p.style.display = '';
  }

  function s0AccHide(panelId) {
    const p = el(panelId);
    if (!p) return;
    p.style.display = 'none';
    p.classList.remove('open');
  }

  function s0AccSummary(panelId, text) {
    const sp = el(panelId)?.querySelector('.rp-s0-acc-summary');
    if (sp) sp.textContent = text;
  }

  function s0AccIsVisible(panelId) {
    const p = el(panelId);
    return p ? p.style.display !== 'none' : false;
  }

  function wireS0Multiselect(msWrapId, cbClass, placeholder, onChangeCb) {
    const wrap = el(msWrapId);
    if (!wrap) return;
    const trigger   = wrap.querySelector('.rp-s0-ms-trigger');
    const labelSpan = trigger?.querySelector('.rp-s0-ms-label');
    const panel     = wrap.querySelector('.rp-s0-ms-panel');
    const tagsDiv   = wrap.querySelector('.rp-s0-ms-tags');
    if (!trigger || !panel || !tagsDiv) return;

    function update() {
      const checked = [...panel.querySelectorAll(`.${cbClass}:checked`)];
      if (labelSpan) labelSpan.textContent = checked.length ? `${checked.length} dipilih` : placeholder;
      tagsDiv.innerHTML = checked.map(cb => {
        const txt = cb.closest('label')?.querySelector('span')?.textContent || cb.value;
        return `<span class="rp-s0-ms-tag">${esc(txt)}</span>`;
      }).join('');
      onChangeCb?.(checked.map(cb => cb.value));
    }

    trigger.addEventListener('click', e => {
      e.stopPropagation();
      panel.classList.toggle('rp-s0-ms-open');
    });
    document.addEventListener('click', e => {
      if (!wrap.contains(e.target)) panel.classList.remove('rp-s0-ms-open');
    });
    panel.querySelectorAll(`.${cbClass}`).forEach(cb => cb.addEventListener('change', update));
    update();
  }

  function computeSemesterOptions(expiresAt) {
    const now = new Date();
    const end = expiresAt ? new Date(expiresAt) : new Date(now.getTime() + 365 * 86400 * 1000);

    function semIdx(d) {
      const m = d.getMonth(), y = d.getFullYear();
      return m >= 6 ? { y, s: 1 } : { y: y - 1, s: 2 };
    }
    function semLabel(sem) {
      return sem.s === 1 ? `Ganjil ${sem.y}/${sem.y + 1}` : `Genap ${sem.y}/${sem.y + 1}`;
    }

    const startSem = semIdx(now);
    const endSem   = semIdx(end);
    const result   = [];
    let cur = { ...startSem };

    while (result.length < 4) {
      result.push(semLabel(cur));
      if (cur.y === endSem.y && cur.s === endSem.s) break;
      cur = cur.s === 1 ? { y: cur.y, s: 2 } : { y: cur.y + 1, s: 1 };
    }

    // Minimal 2 semester agar guru trial (30 hari) tetap punya pilihan Ganjil + Genap
    while (result.length < 2) {
      cur = cur.s === 1 ? { y: cur.y, s: 2 } : { y: cur.y + 1, s: 1 };
      result.push(semLabel(cur));
    }

    return result;
  }

  function autoTahunAjaran() {
    const now = new Date();
    const y = now.getFullYear();
    return now.getMonth() >= 6 ? `${y}/${y + 1}` : `${y - 1}/${y}`;
  }

  function kelasUntukJenjang(jenjang) {
    if (jenjang === 'SD')  return ['1','2','3','4','5','6'];
    if (jenjang === 'SMP') return ['7','8','9'];
    return ['10','11','12']; // SMA/SMK
  }

  function faseFromKelas(kelas) {
    const k = parseInt(kelas);
    if (k <= 2) return 'fase_a';
    if (k <= 4) return 'fase_b';
    if (k <= 6) return 'fase_c';
    if (k <= 9) return 'fase_d';
    if (k === 10) return 'fase_e';
    return 'fase_f';
  }

  function faseLabel(faseKey) {
    const map = {
      fase_a: 'Fase A (Kelas 1–2 SD)',
      fase_b: 'Fase B (Kelas 3–4 SD)',
      fase_c: 'Fase C (Kelas 5–6 SD)',
      fase_d: 'Fase D (Kelas 7–9 SMP)',
      fase_e: 'Fase E (Kelas 10 SMA/SMK)',
      fase_f: 'Fase F (Kelas 11–12 SMA/SMK)',
    };
    return map[faseKey] || faseKey;
  }

  // SD Wali Kelas: daftar mapel multi-select
  const SD_WALI_MAPEL = [
    'Bahasa Indonesia','Bahasa Inggris','IPAS','Matematika',
    'Pendidikan Pancasila','Seni Musik','Seni Rupa','Seni Tari','Seni Teater',
  ];

  // Fase A tidak punya CP Bahasa Inggris dan IPAS
  function sdWaliMapelUntukFase(fase) {
    if (fase === 'fase_a') {
      return ['Bahasa Indonesia','Matematika','Pendidikan Pancasila',
              'Seni Musik','Seni Rupa','Seni Tari','Seni Teater'];
    }
    return SD_WALI_MAPEL;
  }

  // SD Guru MAPEL: dropdown single
  const SD_MAPEL_GURU = [
    'Koding dan Kecerdasan Artifisial',
    'Pendidikan Agama Buddha dan Budi Pekerti',
    'Pendidikan Agama Hindu dan Budi Pekerti',
    'Pendidikan Agama Islam dan Budi Pekerti',
    'Pendidikan Agama Katolik dan Budi Pekerti',
    'Pendidikan Agama Khonghucu dan Budi Pekerti',
    'Pendidikan Agama Kristen dan Budi Pekerti',
    'PJOK',
    'Program Kebutuhan Khusus Pengembangan Diri dan Gerak',
    'Program Kebutuhan Khusus POMSK',
  ];

  // SMP: 26 mapel resmi (Kepka BSKAP)
  const SMP_MAPEL = [
    'Bahasa Indonesia',
    'Bahasa Inggris',
    'Informatika',
    'IPA',
    'IPS',
    'Koding dan Kecerdasan Artifisial',
    'Matematika',
    'Pendidikan Agama Buddha dan Budi Pekerti',
    'Pendidikan Agama Hindu dan Budi Pekerti',
    'Pendidikan Agama Islam dan Budi Pekerti',
    'Pendidikan Agama Katolik dan Budi Pekerti',
    'Pendidikan Agama Khonghucu dan Budi Pekerti',
    'Pendidikan Agama Kristen dan Budi Pekerti',
    'Pendidikan Pancasila',
    'PJOK',
    'Prakarya Budidaya',
    'Prakarya Kerajinan',
    'Prakarya Pengolahan',
    'Prakarya Rekayasa',
    'Program Kebutuhan Khusus Pengembangan Diri dan Gerak untuk Peserta Didik Berkebutuhan Khusus Dengan Hambatan Fisik/Tunadaksa',
    'Program Kebutuhan Khusus Pengembangan Orientasi, Mobilitas, Sosial, dan Komunikasi (POMSK) untuk Peserta Didik Dengan Hambatan Penglihatan/Tunanetra',
    'Seni Musik',
    'Seni Rupa',
    'Seni Tari',
    'Seni Teater',
  ];

  // SMA: 40 mapel resmi (Kepka BSKAP)
  const SMA_MAPEL = [
    'Antropologi',
    'Bahasa Arab',
    'Bahasa Indonesia',
    'Bahasa Inggris',
    'Bahasa Jepang',
    'Bahasa Jerman',
    'Bahasa Korea',
    'Bahasa Mandarin',
    'Bahasa Prancis',
    'Biologi',
    'Ekonomi',
    'Fisika',
    'Geografi',
    'Informatika',
    'IPA',
    'IPS',
    'Kimia',
    'Koding dan Kecerdasan Artifisial',
    'Matematika',
    'Pendidikan Agama Buddha dan Budi Pekerti',
    'Pendidikan Agama Hindu dan Budi Pekerti',
    'Pendidikan Agama Islam dan Budi Pekerti',
    'Pendidikan Agama Katolik dan Budi Pekerti',
    'Pendidikan Agama Khonghucu dan Budi Pekerti',
    'Pendidikan Agama Kristen dan Budi Pekerti',
    'Pendidikan Pancasila',
    'PJOK',
    'Prakarya Budidaya',
    'Prakarya Kerajinan',
    'Prakarya Pengolahan',
    'Prakarya Rekayasa',
    'Program Kebutuhan Khusus Pengembangan Diri dan Gerak untuk Peserta Didik Berkebutuhan Khusus Dengan Hambatan Fisik/Tunadaksa',
    'Program Kebutuhan Khusus Pengembangan Orientasi, Mobilitas, Sosial, dan Komunikasi (POMSK) untuk Peserta Didik Dengan Hambatan Penglihatan/Tunanetra',
    'Sejarah',
    'Seni Musik',
    'Seni Rupa',
    'Seni Tari',
    'Seni Teater',
    'Sosiologi',
  ];

  // SMK mapel umum: 21 mapel (Kepka BSKAP)
  const SMK_UMUM_MAPEL = [
    'Bahasa Indonesia',
    'Bahasa Inggris',
    'Informatika',
    'Koding dan Kecerdasan Artifisial',
    'Kreativitas, Inovasi, dan Kewirausahaan',
    'Matematika',
    'Pendidikan Agama Buddha dan Budi Pekerti',
    'Pendidikan Agama Hindu dan Budi Pekerti',
    'Pendidikan Agama Islam dan Budi Pekerti',
    'Pendidikan Agama Katolik dan Budi Pekerti',
    'Pendidikan Agama Khonghucu dan Budi Pekerti',
    'Pendidikan Agama Kristen dan Budi Pekerti',
    'Pendidikan Pancasila',
    'PJOK',
    'Projek IPAS',
    'Sejarah',
    'Seni Musik',
    'Seni Rupa',
    'Seni Tari',
    'Seni Teater',
  ];

  // ─── Step 0 — Profil Guru (onboarding, dikunci per akun) ───────────────────

  async function renderStep0() {
    cleanupAllDropdowns();
    _step = 0;
    const panel = el('rp-step-bar');
    if (panel) panel.style.display = 'none'; // sembunyikan step bar saat step 0

    const body = el('rp-body');
    if (!body) return;

    // Ambil expires_at dari session storage (sudah dimuat saat tab click)
    let expiresAt = null;
    try {
      const ts = JSON.parse(sessionStorage.getItem('guru_trial_status') || 'null');
      if (ts?.expires_at) expiresAt = ts.expires_at;
    } catch (_) {}

    const semesterOpts = computeSemesterOptions(expiresAt);
    const tahunAjaranAuto = autoTahunAjaran();

    body.innerHTML = `
<div class="rp-step0-header">
  <div class="rp-step0-badge">Profil Mengajar</div>
  <h2 class="rp-step0-title">Selamat datang! Isi profil mengajar Anda.</h2>
  <p class="rp-step0-desc">
    Data ini digunakan di semua classroom Anda dan hanya perlu diisi sekali.
    Admin dapat membantu jika ada perubahan.
  </p>
</div>

<div class="rp-s0-acc-panel open" id="rp-s0-jenjang-acc">
  <div class="rp-s0-acc-header">
    <span class="rp-s0-acc-title">1. Jenjang Sekolah</span>
    <span class="rp-s0-acc-summary"></span>
    <span class="rp-s0-acc-chevron">▾</span>
  </div>
  <div class="rp-s0-acc-body">
    <div class="rp-chip-group rp-s0-chips" data-key="jenjang" data-multi="0" data-required="1" id="rp-s0-jenjang">
      ${['SD','SMP','SMA','SMK'].map(j =>
        `<div class="rp-chip" data-value="${j}">${j}</div>`
      ).join('')}
    </div>
  </div>
</div>

<div class="rp-s0-acc-panel" id="rp-s0-mapel-acc" style="display:none;">
  <div class="rp-s0-acc-header">
    <span class="rp-s0-acc-title" id="rp-s0-mapel-acc-title">2. Mata Pelajaran</span>
    <span class="rp-s0-acc-summary"></span>
    <span class="rp-s0-acc-chevron">▾</span>
  </div>
  <div class="rp-s0-acc-body" id="rp-s0-mapel-body"></div>
</div>

<div class="rp-s0-acc-panel" id="rp-s0-kelas-acc" style="display:none;">
  <div class="rp-s0-acc-header">
    <span class="rp-s0-acc-title">3. Kelas</span>
    <span class="rp-s0-acc-summary"></span>
    <span class="rp-s0-acc-chevron">▾</span>
  </div>
  <div class="rp-s0-acc-body" id="rp-s0-kelas-body"></div>
</div>

<div class="rp-s0-acc-panel" id="rp-s0-semester-acc" style="display:none;">
  <div class="rp-s0-acc-header">
    <span class="rp-s0-acc-title">4. Semester Aktif</span>
    <span class="rp-s0-acc-summary"></span>
    <span class="rp-s0-acc-chevron">▾</span>
  </div>
  <div class="rp-s0-acc-body">
    <p class="rp-block-subtitle">Pilih semester yang tercakup dalam lisensi Anda.</p>
    <div class="rp-s0-ms" id="rp-s0-semester-ms">
      <button type="button" class="rp-s0-ms-trigger"><span class="rp-s0-ms-label">Pilih semester…</span></button>
      <div class="rp-s0-ms-tags"></div>
      <div class="rp-s0-ms-panel" id="rp-s0-semester-list">
        ${semesterOpts.map(s => `
        <label class="rp-s0-checkbox-row">
          <input type="checkbox" value="${esc(s)}" class="rp-s0-semester-cb">
          <span>${esc(s)}</span>
        </label>`).join('')}
      </div>
    </div>
  </div>
</div>

<div class="rp-s0-acc-panel" id="rp-s0-identitas-acc" style="display:none;">
  <div class="rp-s0-acc-header">
    <span class="rp-s0-acc-title">5. Identitas Dokumen</span>
    <span class="rp-s0-acc-summary"></span>
    <span class="rp-s0-acc-chevron">▾</span>
  </div>
  <div class="rp-s0-acc-body">
    <p class="rp-block-subtitle">Digunakan untuk header dan tanda tangan pada file yang diunduh.</p>
    <div class="rp-identitas-grid">
      <div class="rp-q">
        <label class="rp-q-label" style="color:var(--gold)">Nama guru</label>
        <input type="text" class="rp-input" id="rp-s0-nama-guru"
          placeholder="Contoh: Roni Satria, S.Ag">
      </div>
      <div class="rp-q">
        <label class="rp-q-label" style="color:var(--gold)">NIP guru <span style="color:var(--text-muted)">(opsional)</span></label>
        <input type="text" class="rp-input" id="rp-s0-nip-guru"
          placeholder="Contoh: 197001012000011001">
      </div>
      <div class="rp-q">
        <label class="rp-q-label" style="color:var(--gold)">Nama kepala sekolah</label>
        <input type="text" class="rp-input" id="rp-s0-nama-kepsek"
          placeholder="Contoh: Dr. Ahmad Fauzi, M.Pd">
      </div>
      <div class="rp-q">
        <label class="rp-q-label" style="color:var(--gold)">NIP kepala sekolah <span style="color:var(--text-muted)">(opsional)</span></label>
        <input type="text" class="rp-input" id="rp-s0-nip-kepsek"
          placeholder="Contoh: 196805121990031005">
      </div>
      <div class="rp-q">
        <label class="rp-q-label" style="color:var(--gold)">Tahun ajaran</label>
        <input type="text" class="rp-input" id="rp-s0-tahun-ajaran"
          placeholder="Contoh: 2026/2027" value="${esc(tahunAjaranAuto)}">
      </div>
      <div class="rp-q">
        <label class="rp-q-label" style="color:var(--gold)">Kota / Kabupaten</label>
        <input type="text" class="rp-input" id="rp-s0-kota"
          placeholder="Contoh: Ujungbatu">
      </div>
    </div>
  </div>
</div>

<div class="rp-step0-footer" style="display:none;" id="rp-s0-footer">
  <div id="rp-step0-error" class="error-msg" style="display:none;"></div>
  <button type="button" class="rp-step0-submit" id="rp-s0-submit">
    Simpan &amp; Mulai Rancang
  </button>
</div>`;

    // Accordion single-expand via event delegation
    body.addEventListener('click', e => {
      const header = e.target.closest('.rp-s0-acc-header');
      if (!header) return;
      const panel = header.closest('.rp-s0-acc-panel');
      if (!panel) return;
      const wasOpen = panel.classList.contains('open');
      body.querySelectorAll('.rp-s0-acc-panel').forEach(p => p.classList.remove('open'));
      if (!wasOpen) panel.classList.add('open');
    });

    // Wire jenjang chip click
    const jenjangGroup = el('rp-s0-jenjang');
    jenjangGroup?.querySelectorAll('.rp-chip').forEach(chip => {
      chip.addEventListener('click', async () => {
        jenjangGroup.querySelectorAll('.rp-chip').forEach(c => c.classList.remove('selected'));
        chip.classList.add('selected');
        s0AccSummary('rp-s0-jenjang-acc', chip.dataset.value);
        await renderStep0MapelSection(chip.dataset.value);
      });
    });

    // Wire semester multiselect
    wireS0Multiselect('rp-s0-semester-ms', 'rp-s0-semester-cb', 'Pilih semester…', vals => {
      s0AccSummary('rp-s0-semester-acc', vals.length ? `${vals.length} semester dipilih` : '');
    });

    // Submit handler
    el('rp-s0-submit')?.addEventListener('click', handleStep0Submit);
  }

  async function renderStep0MapelSection(jenjang) {
    const mapelBody = el('rp-s0-mapel-body');
    const footer    = el('rp-s0-footer');
    if (!mapelBody) return;

    // Reset semua section di bawah jenjang
    ['rp-s0-mapel-acc','rp-s0-kelas-acc','rp-s0-semester-acc','rp-s0-identitas-acc'].forEach(s0AccHide);
    if (footer) footer.style.display = 'none';

    if (jenjang === 'SD') {
      const titleEl = el('rp-s0-mapel-acc-title');
      if (titleEl) titleEl.textContent = '2. Peran di SD';
      mapelBody.innerHTML = `
  <div class="rp-chip-group rp-s0-chips" data-key="peran" data-multi="0" data-required="1" id="rp-s0-peran">
    <div class="rp-chip" data-value="WALI">Wali Kelas</div>
    <div class="rp-chip" data-value="MAPEL">Guru MAPEL</div>
  </div>
  <div id="rp-s0-sd-mapel-wrap" style="margin-top:var(--space-sm);display:none;"></div>`;
      s0AccShow('rp-s0-mapel-acc');

      el('rp-s0-peran')?.querySelectorAll('.rp-chip').forEach(chip => {
        chip.addEventListener('click', () => {
          el('rp-s0-peran').querySelectorAll('.rp-chip').forEach(c => c.classList.remove('selected'));
          chip.classList.add('selected');
          renderStep0SdMapel(chip.dataset.value);
        });
      });

    } else if (jenjang === 'SMP' || jenjang === 'SMA') {
      const titleEl = el('rp-s0-mapel-acc-title');
      if (titleEl) titleEl.textContent = '2. Mata Pelajaran';
      const mapelArr = jenjang === 'SMP' ? SMP_MAPEL : SMA_MAPEL;
      mapelBody.innerHTML = makeCustomDropdown('rp-s0-mapel-dd', mapelArr.map(m => ({ value: m, label: m })), '', true);
      s0AccShow('rp-s0-mapel-acc');
      wireCustomDropdown('rp-s0-mapel-dd', val => {
        if (!val) return;
        if (s0AccIsVisible('rp-s0-kelas-acc')) return;
        s0AccSummary('rp-s0-mapel-acc', val);
        renderStep0KelasSection(jenjang);
        s0AccReveal('rp-s0-semester-acc');
        s0AccReveal('rp-s0-identitas-acc');
        if (footer) footer.style.display = '';
      });

    } else if (jenjang === 'SMK') {
      const titleEl = el('rp-s0-mapel-acc-title');
      if (titleEl) titleEl.textContent = '2. Tipe Mengajar';
      mapelBody.innerHTML = `
  <div class="rp-chip-group rp-s0-chips" data-key="smk-tipe" data-multi="0" data-required="1" id="rp-s0-smk-tipe">
    <div class="rp-chip" data-value="UMUM">Mapel umum</div>
    <div class="rp-chip" data-value="PRODUKTIF">Mapel produktif</div>
  </div>
  <div id="rp-s0-smk-detail" style="margin-top:var(--space-sm);"></div>`;
      s0AccShow('rp-s0-mapel-acc');

      el('rp-s0-smk-tipe')?.querySelectorAll('.rp-chip').forEach(chip => {
        chip.addEventListener('click', () => {
          el('rp-s0-smk-tipe').querySelectorAll('.rp-chip').forEach(c => c.classList.remove('selected'));
          chip.classList.add('selected');
          const detail = el('rp-s0-smk-detail');
          if (!detail) return;
          ['rp-s0-kelas-acc','rp-s0-semester-acc','rp-s0-identitas-acc'].forEach(s0AccHide);
          if (footer) footer.style.display = 'none';

          if (chip.dataset.value === 'UMUM') {
            detail.innerHTML = `<label class="rp-q-label" style="color:var(--gold)">Mata pelajaran</label>
${makeCustomDropdown('rp-s0-smk-umum-dd', SMK_UMUM_MAPEL.map(m => ({ value: m, label: m })), '', true)}`;
            wireCustomDropdown('rp-s0-smk-umum-dd', val => {
              if (!val) return;
              if (s0AccIsVisible('rp-s0-kelas-acc')) return;
              s0AccSummary('rp-s0-mapel-acc', `Umum | ${val}`);
              renderStep0KelasSection(jenjang);
              s0AccReveal('rp-s0-semester-acc');
              s0AccReveal('rp-s0-identitas-acc');
              if (footer) footer.style.display = '';
            });

          } else {
            detail.innerHTML = `<div class="rp-loading"><div class="rp-loading-dot"></div>Memuat bidang keahlian…</div>`;
            (async () => {
              const bidangs = await getMapelListByJenjang('SMK', {});
              if (!el('rp-s0-smk-detail')) return;
              detail.innerHTML = `<label class="rp-q-label" style="color:var(--gold)">Bidang keahlian</label>
${makeCustomDropdown('rp-s0-bidang-dd', bidangs.map(b => ({ value: b.key, label: b.label })), '', true)}
<div id="rp-s0-program-wrap" style="margin-top:var(--space-sm);display:none;"></div>
<div id="rp-s0-elemen-wrap" style="margin-top:var(--space-sm);display:none;"></div>`;
              wireCustomDropdown('rp-s0-bidang-dd', async () => {
                const bidang = getCustomSelVal('rp-s0-bidang-dd');
                if (!bidang || bidang === '__lainnya__') return;
                const programs = await getMapelListByJenjang('SMK', { bidang });
                const pw = el('rp-s0-program-wrap');
                if (!pw) return;
                pw.style.display = '';
                pw.innerHTML = `<label class="rp-q-label" style="color:var(--gold)">Program keahlian</label>
${makeCustomDropdown('rp-s0-program-dd', programs.map(p => ({ value: p.key, label: p.label })), '', true)}`;
                wireCustomDropdown('rp-s0-program-dd', async () => {
                  const prog = getCustomSelVal('rp-s0-program-dd');
                  if (!prog || prog === '__lainnya__') return;
                  const elems = await getMapelListByJenjang('SMK', { bidang, program: prog });
                  const ew = el('rp-s0-elemen-wrap');
                  if (!ew) return;
                  ew.style.display = '';
                  ew.innerHTML = `<label class="rp-q-label" style="color:var(--gold)">Elemen / Mata pelajaran</label>
${makeCustomDropdown('rp-s0-elemen-dd', elems.map(e => ({ value: e.key, label: e.label })), '', true)}`;
                  wireCustomDropdown('rp-s0-elemen-dd', async val => {
                    if (!val || val === '') return;
                    el('rp-s0-cp-elemen-wrap')?.remove();
                    ['rp-s0-kelas-acc','rp-s0-semester-acc','rp-s0-identitas-acc'].forEach(s0AccHide);
                    if (footer) footer.style.display = 'none';
                    const cpData = await loadCpData();
                    const allElemen = [];
                    const seen = new Set();
                    ['fase_e', 'fase_f'].forEach(fk => {
                      (cpData?.[val]?.[fk]?.elemen || []).forEach(e => {
                        if (!seen.has(e.nama)) { seen.add(e.nama); allElemen.push(e.nama); }
                      });
                    });
                    const cpWrap = document.createElement('div');
                    cpWrap.id = 'rp-s0-cp-elemen-wrap';
                    cpWrap.style.marginTop = 'var(--space-sm)';
                    cpWrap.innerHTML = allElemen.length
                      ? `<label class="rp-q-label" style="color:var(--gold)">Elemen yang diajarkan</label>
<p class="rp-block-subtitle">Pilih elemen CP yang Anda ampu. Boleh lebih dari satu.</p>
<div class="rp-s0-ms" id="rp-s0-elemen-ms">
  <button type="button" class="rp-s0-ms-trigger"><span class="rp-s0-ms-label">Pilih elemen…</span></button>
  <div class="rp-s0-ms-tags"></div>
  <div class="rp-s0-ms-panel" id="rp-s0-cp-elemen-list">
    ${allElemen.map(nama => `<label class="rp-s0-checkbox-row">
  <input type="checkbox" value="${esc(nama)}" class="rp-s0-cp-elemen-cb">
  <span>${esc(toTitleCase(nama))}</span>
</label>`).join('')}
  </div>
</div>`
                      : `<p class="rp-block-subtitle" style="color:var(--text-muted);">Elemen belum tersedia untuk mata pelajaran ini.</p>`;
                    el('rp-s0-elemen-wrap')?.appendChild(cpWrap);
                    if (allElemen.length) {
                      wireS0Multiselect('rp-s0-elemen-ms', 'rp-s0-cp-elemen-cb', 'Pilih elemen…', () => {});
                    }
                    s0AccSummary('rp-s0-mapel-acc', `Produktif | ${mapelKeyToLabel(val)}`);
                    renderStep0KelasSection(jenjang);
                    s0AccReveal('rp-s0-semester-acc');
                    s0AccReveal('rp-s0-identitas-acc');
                    if (footer) footer.style.display = '';
                  });
                });
              });
            })();
          }
        });
      });
    }
  }

  function renderStep0SdMapel(peran) {
    const wrap   = el('rp-s0-sd-mapel-wrap');
    const footer = el('rp-s0-footer');
    if (!wrap) return;

    if (peran === 'WALI') {
      wrap.style.display = '';
      wrap.innerHTML = `<div class="rp-block-title" style="margin-top:var(--space-sm);">Mata pelajaran yang diampu</div>
<p class="rp-block-subtitle">Pilih satu atau lebih.</p>
<div class="rp-s0-checkbox-grid" id="rp-s0-wali-mapel">
  ${sdWaliMapelUntukFase('fase_a').map(m => `
  <label class="rp-s0-checkbox-row">
    <input type="checkbox" value="${esc(m)}" class="rp-s0-wali-cb">
    <span>${esc(m)}</span>
  </label>`).join('')}
</div>`;
    } else {
      wrap.style.display = '';
      wrap.innerHTML = `<div class="rp-block-title" style="margin-top:var(--space-sm);">Mata pelajaran</div>
${makeCustomDropdown('rp-s0-sdmapel-dd', SD_MAPEL_GURU.map(m => ({ value: m, label: m })), '', true)}`;
      wireCustomDropdown('rp-s0-sdmapel-dd', () => {});
    }

    renderStep0KelasSection('SD');
    s0AccReveal('rp-s0-semester-acc');
    s0AccReveal('rp-s0-identitas-acc');
    if (footer) footer.style.display = '';
  }

  function renderStep0KelasSection(jenjang) {
    const kelasBody = el('rp-s0-kelas-body');
    if (!kelasBody) return;
    const kelasList = kelasUntukJenjang(jenjang);
    kelasBody.innerHTML = `
<div class="rp-chip-group rp-s0-chips" data-key="kelas" data-multi="0" data-required="1" id="rp-s0-kelas">
  ${kelasList.map(k => `<div class="rp-chip" data-value="${k}">${k}</div>`).join('')}
</div>
<div id="rp-s0-fase-display" class="rp-s0-fase-hint" style="margin-top:var(--space-xs);display:none;"></div>`;
    s0AccShow('rp-s0-kelas-acc');

    el('rp-s0-kelas')?.querySelectorAll('.rp-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        el('rp-s0-kelas').querySelectorAll('.rp-chip').forEach(c => c.classList.remove('selected'));
        chip.classList.add('selected');
        const fase = faseFromKelas(chip.dataset.value);
        const faseD = el('rp-s0-fase-display');
        if (faseD) { faseD.style.display = ''; faseD.textContent = `Fase: ${faseLabel(fase)}`; }
        s0AccSummary('rp-s0-kelas-acc', `Kelas ${chip.dataset.value} | ${faseLabel(fase)}`);
        s0AccShow('rp-s0-semester-acc');
        // SD Wali: update daftar mapel sesuai fase (Fase A tidak ada IPAS & Bahasa Inggris)
        const waliGrid = el('rp-s0-wali-mapel');
        if (waliGrid) {
          waliGrid.innerHTML = sdWaliMapelUntukFase(fase).map(m => `
  <label class="rp-s0-checkbox-row">
    <input type="checkbox" value="${esc(m)}" class="rp-s0-wali-cb">
    <span>${esc(m)}</span>
  </label>`).join('');
        }
      });
    });
  }

  async function handleStep0Submit() {
    const btn = el('rp-s0-submit');
    const errEl = el('rp-step0-error');
    if (btn) { btn.disabled = true; btn.textContent = 'Menyimpan…'; }
    const showErr = msg => {
      if (errEl) { errEl.textContent = msg; errEl.style.display = ''; }
      if (btn) { btn.disabled = false; btn.textContent = 'Simpan & Mulai Rancang'; }
    };

    // Kumpulkan data
    const jenjangChip = el('rp-s0-jenjang')?.querySelector('.rp-chip.selected');
    const jenjang = jenjangChip?.dataset.value || '';
    if (!jenjang) return showErr('Pilih jenjang sekolah.');

    let peran = null, mapelList = [], mapel = '', mapelKey = '';
    let bidangKeahlian = null, programKeahlian = null, elemenTerpilih = [];

    if (jenjang === 'SD') {
      const peranChip = el('rp-s0-peran')?.querySelector('.rp-chip.selected');
      peran = peranChip?.dataset.value || '';
      if (!peran) return showErr('Pilih peran Anda di SD.');
      if (peran === 'WALI') {
        mapelList = [...(el('rp-s0-wali-mapel')?.querySelectorAll('.rp-s0-wali-cb:checked') || [])]
          .map(cb => cb.value);
        if (!mapelList.length) return showErr('Pilih minimal satu mata pelajaran.');
        mapel = mapelList.join(', ');
        mapelKey = normalizeMapelKey(mapelList[0]);
      } else {
        const v = getCustomSelVal('rp-s0-sdmapel-dd');
        if (!v) return showErr('Pilih mata pelajaran.');
        mapel = v; mapelKey = normalizeMapelKey(v); mapelList = [v];
      }
    } else if (jenjang === 'SMP' || jenjang === 'SMA') {
      const v = getCustomSelVal('rp-s0-mapel-dd');
      if (!v) return showErr('Pilih mata pelajaran.');
      mapel = v; mapelKey = normalizeMapelKey(v); mapelList = [v];
    } else if (jenjang === 'SMK') {
      const smkTipeChip = el('rp-s0-smk-tipe')?.querySelector('.rp-chip.selected');
      const smkTipe = smkTipeChip?.dataset.value || '';
      if (!smkTipe) return showErr('Pilih tipe mengajar (Mapel umum atau Mapel produktif).');
      if (smkTipe === 'UMUM') {
        const v = getCustomSelVal('rp-s0-smk-umum-dd');
        if (!v) return showErr('Pilih mata pelajaran.');
        mapel = v; mapelKey = normalizeMapelKey(v); mapelList = [v];
        bidangKeahlian = null; programKeahlian = null;
      } else {
        bidangKeahlian  = getCustomSelVal('rp-s0-bidang-dd')  || null;
        programKeahlian = getCustomSelVal('rp-s0-program-dd') || null;
        const elemenVal = getCustomSelVal('rp-s0-elemen-dd');
        if (!bidangKeahlian) return showErr('Pilih bidang keahlian.');
        if (!programKeahlian) return showErr('Pilih program keahlian.');
        if (!elemenVal) return showErr('Pilih mata pelajaran produktif.');
        mapelKey = elemenVal;
        mapel = mapelKeyToLabel(elemenVal);
        mapelList = [mapel];
        elemenTerpilih = [...(el('rp-s0-cp-elemen-list')?.querySelectorAll('.rp-s0-cp-elemen-cb:checked') || [])]
          .map(cb => cb.value);
      }
    }

    const kelasChip = el('rp-s0-kelas')?.querySelector('.rp-chip.selected');
    const kelas = kelasChip?.dataset.value || '';
    if (!kelas) return showErr('Pilih kelas yang Anda ajar.');

    const fase = faseFromKelas(kelas);

    const semesterList = [...(el('rp-s0-semester-list')?.querySelectorAll('.rp-s0-semester-cb:checked') || [])]
      .map(cb => cb.value);

    const namaGuru   = el('rp-s0-nama-guru')?.value.trim()   || '';
    const nipGuru    = el('rp-s0-nip-guru')?.value.trim()    || '';
    const namaKepsek = el('rp-s0-nama-kepsek')?.value.trim() || '';
    const nipKepsek  = el('rp-s0-nip-kepsek')?.value.trim()  || '';
    const tahunAjaran = el('rp-s0-tahun-ajaran')?.value.trim() || autoTahunAjaran();
    const kota       = el('rp-s0-kota')?.value.trim()        || '';

    if (!namaGuru) return showErr('Isi nama guru.');
    if (!namaKepsek) return showErr('Isi nama kepala sekolah.');

    const payload = {
      jenjang, peran, mapel_list: mapelList, mapel, mapel_key: mapelKey,
      bidang_keahlian: bidangKeahlian, program_keahlian: programKeahlian,
      elemen_terpilih: elemenTerpilih,
      kelas, fase,
      semester_list: semesterList,
      nama_guru: namaGuru, nip_guru: nipGuru,
      nama_kepsek: namaKepsek, nip_kepsek: nipKepsek,
      tahun_ajaran: tahunAjaran, kota,
      is_locked: true,
    };

    try {
      const subjectKeys = (jenjang === 'SD' && peran === 'WALI')
        ? mapelList.map(normalizeMapelKey).filter(Boolean)
        : [mapelKey];
      const cpMetaRes = await fetch('../shared/data/cp-data.meta.json');
      if (!cpMetaRes.ok) throw new Error('Metadata revision CP tidak tersedia');
      const cpMeta = await cpMetaRes.json();
      const elementRefs = elemenTerpilih.map(elementName => ({
        subject_key: mapelKey,
        phase_key: fase,
        element_name: elementName,
        cp_dataset_revision: cpMeta.revision,
      }));
      const foundation = await SipApi.applyTeachingFoundation({
        jenjang,
        phase_key: fase,
        subject_keys: subjectKeys,
        selected_subject_key: mapelKey,
        bidang: bidangKeahlian,
        program_keahlian: programKeahlian,
        element_refs: elementRefs,
        classroom_id: _cId,
      });
      _teachingContext = {
        id: foundation.teaching_context_id,
        cp_dataset_revision: foundation.cp_dataset_revision,
        subject_key: mapelKey,
        phase_key: fase,
        jenjang,
      };
      const result = await SipApi.upsertRancangProfil(payload);
      if (!result?.is_locked) throw new Error('lock not confirmed');
      _profil = result;
      // Populate _ans dari profil baru
      _ans.jenjang          = _profil.jenjang || '';
      _ans.mapelKey         = _profil.mapel_key || '';
      _ans.mapel            = _profil.mapel || '';
      _ans.fase             = _profil.fase || '';
      _ans.bidangKeahlian   = _profil.bidang_keahlian || null;
      _ans.programKeahlian  = _profil.program_keahlian || null;
      _ans.elemenTerpilih   = _profil.elemen_terpilih || [];
      // Tampilkan step bar dan pindah ke step 1
      const stepBar = el('rp-step-bar');
      if (stepBar) stepBar.style.display = '';
      _step = 1;
      renderStep1();
    } catch (e) {
      console.error('[rancang][step0] upsert gagal:', e);
      showErr('Gagal menyimpan profil. Coba lagi.');
    }
  }

  // ─── Step 1 — Identitas Konteks ─────────────────────────────────────────────

  function renderStep1() {
    cleanupAllDropdowns();
    _step = 1;
    renderStepBar();
    const body = el('rp-body');
    if (!body) return;
    renderStep1ReadOnly();
  }

  // ── Step 1 Read-only (pre-filled dari profil atau settings) ───────────────
  function renderStep1ReadOnly() {
    const body = el('rp-body');
    if (!body) return;

    // Preferensikan data dari _profil (step 0), fallback ke _settings (lama)
    const src = (_profil?.is_locked) ? _profil : (_settings || {});
    const jenjang  = src.jenjang  || '—';
    const mapelArr = src.mapel_list;
    const mapel    = (Array.isArray(mapelArr) && mapelArr.length)
      ? mapelArr.join(', ')
      : (src.mapel || '—');
    const kelas    = src.kelas    || null;
    const faseRaw  = src.fase || '';
    const faseLabel = faseRaw
      ? faseRaw.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
      : '—';
    const fase = faseLabel;
    const bidang   = src.bidang_keahlian  || null;
    const program  = src.program_keahlian || null;

    const smkRows = (jenjang === 'SMK' && bidang) ? `
      <div class="rp-readonly-row">
        <span class="rp-readonly-label">Bidang keahlian</span>
        <span class="rp-readonly-val">${esc(bidang)}</span>
      </div>
      ${program ? `
      <div class="rp-readonly-row">
        <span class="rp-readonly-label">Program keahlian</span>
        <span class="rp-readonly-val">${esc(program)}</span>
      </div>` : ''}` : '';

    body.innerHTML = `
<div class="rp-block">
  <div class="rp-block-title">Identitas Konteks Pembelajaran</div>
  <div class="rp-readonly-card">
    <div class="rp-readonly-row">
      <span class="rp-readonly-label">Jenjang</span>
      <span class="rp-readonly-val">${esc(jenjang)}</span>
    </div>
    ${smkRows}
    <div class="rp-readonly-row">
      <span class="rp-readonly-label">Mata pelajaran</span>
      <span class="rp-readonly-val">${esc(mapel)}</span>
    </div>
    ${kelas ? `<div class="rp-readonly-row">
      <span class="rp-readonly-label">Kelas</span>
      <span class="rp-readonly-val">${esc(kelas)}</span>
    </div>` : ''}
    <div class="rp-readonly-row">
      <span class="rp-readonly-label">Fase</span>
      <span class="rp-readonly-val">${esc(fase)}</span>
    </div>
  </div>
  <p class="rp-readonly-hint">
    Data diambil dari profil akun Anda.
  </p>
</div>
<div id="rp-nav-row-cp"></div>`;

    const faseApi = _ans.fase || _profil?.fase || _settings?.fase || '';
    const isWaliSd = _profil?.role_guru === 'WALI_KELAS_SD';
    const _waliMapelArr = normalizeArray(_profil?.mapel_list).filter(Boolean);
    const fullMapelList = isWaliSd
      ? (_waliMapelArr.length ? _waliMapelArr : [_ans.mapel].filter(Boolean))
      : [_ans.mapel || _settings?.mapel || ''].filter(Boolean);

    function renderCpSection() {
      const navWrap = el('rp-nav-row-cp');
      if (!navWrap) return;

      if (isWaliSd) {
        const rows = fullMapelList.map(m => {
          const saved = _dokumen.some(d => d.jenis === 'CP' && d.judul === `CP — ${m}`);
          return `<div style="display:flex;justify-content:space-between;align-items:center;padding:var(--space-xs) 0;border-bottom:1px solid var(--border-subtle,rgba(255,255,255,.08))">
  <span class="rp-readonly-label">${esc(m)}</span>
  <span style="display:flex;align-items:center;gap:var(--space-sm)">
    ${saved
      ? `<button type="button" class="rp-btn-tersimpan" disabled style="font-size:var(--fs-sm);padding:2px var(--space-sm);background:transparent;border:1px solid var(--success,#4caf50);color:var(--success,#4caf50);border-radius:var(--btn-r);cursor:default;white-space:nowrap">✓ Tersimpan</button>
         <a href="#" class="rp-link-dokumen" data-mapel="${esc(m)}" style="color:var(--gold);font-size:var(--fs-sm);white-space:nowrap">Lihat di tab Dokumen →</a>`
      : `<button type="button" class="rp-btn-simpan rp-btn-generate-cp" data-mapel="${esc(m)}" style="background:var(--gold);color:var(--text-on-gold,#1a1a1a);border:none;font-weight:var(--fw-medium)">Generate CP</button>`
    }
  </span>
</div>`;
        }).join('');

        navWrap.innerHTML = `
<div class="rp-block">
  <div class="rp-block-title">Capaian Pembelajaran</div>
  <div class="rp-readonly-card">${rows}</div>
</div>
<div class="rp-nav-row" style="justify-content:flex-end;margin-top:var(--space-md)">
  <button type="button" class="rp-btn-next" id="rp-step1-ro-next">Lanjut ke preferensi →</button>
</div>`;
      } else {
        const mapelNama = _ans.mapel || _settings?.mapel || '';
        const saved = _dokumen.some(d => d.jenis === 'CP' && d.judul.includes(mapelNama));
        navWrap.innerHTML = `
<div class="rp-nav-row" style="justify-content:space-between;align-items:center;">
  ${saved
    ? `<span style="display:flex;align-items:center;gap:var(--space-sm)">
         <button type="button" class="rp-btn-tersimpan" disabled style="font-size:var(--fs-sm);padding:2px var(--space-sm);background:transparent;border:1px solid var(--success,#4caf50);color:var(--success,#4caf50);border-radius:var(--btn-r);cursor:default;white-space:nowrap">✓ Tersimpan</button>
         <a href="#" class="rp-link-dokumen" style="color:var(--gold);font-size:var(--fs-sm)">Lihat di tab Dokumen →</a>
       </span>`
    : `<button type="button" class="rp-btn-simpan rp-btn-generate-cp" data-mapel="${esc(mapelNama)}" style="background:var(--gold);color:var(--text-on-gold,#1a1a1a);border:none;font-weight:var(--fw-medium)">Generate CP</button>`
  }
  <button type="button" class="rp-btn-next" id="rp-step1-ro-next">
    ${jenjang === 'SMK' ? 'Lanjut ke konteks SMK →' : 'Lanjut ke preferensi →'}
  </button>
</div>`;
      }

      navWrap.querySelectorAll('.rp-btn-generate-cp').forEach(btn => {
        btn.addEventListener('click', () => generateCpMapel(btn.dataset.mapel, btn));
      });
      navWrap.querySelectorAll('.rp-link-dokumen').forEach(a => {
        a.addEventListener('click', e => { e.preventDefault(); navigateToStep(7); });
      });
      el('rp-step1-ro-next')?.addEventListener('click', () => {
        if (_ans.jenjang === 'SMK') renderStep2();
        else renderStep3A();
      });
    }

    async function generateCpMapel(mapelNama, btn) {
      if (!mapelNama) return;
      const mk = isWaliSd ? normalizeMapelKey(mapelNama) : (_ans.mapelKey || _settings?.mapel_key || '');
      btn.disabled = true;
      btn.textContent = 'Menyiapkan…';
      try {
        const cpFase = await fetchCpData(mk, faseApi);
        const elemen = cpFase?.elemen || [];
        const cpUmum = cpFase?.cp_umum || '';
        if (!elemen.length) { btn.textContent = 'Data CP belum tersedia'; btn.style.background = 'transparent'; btn.style.border = '1px solid var(--text-muted)'; btn.style.color = 'var(--text-muted)'; btn.style.cursor = 'default'; return; }
        let ringkasan = [];
        try {
          const result = await callAI({
            mode: 'cp_summary',
            konteks: { mapel: mapelNama, jenjang: _ans.jenjang, fase: faseApi, kelas: _profil?.kelas || '' },
            elemen_list: elemen,
            elemen_difilter: false,
          });
          ringkasan = result?.ringkasan || [];
        } catch { ringkasan = elemen.map(e => ({ elemen: e.nama, konkret: null })); }
        const judulDoc = isWaliSd
          ? `CP — ${mapelNama}`.trim()
          : `CP — ${mapelNama} ${faseApi.replace(/_/g, ' ').toUpperCase()}`.trim();
        const konten = { elemen, ringkasan, cp_umum: cpUmum, mapel: mapelNama, fase: faseApi };
        const doc = await SipApi.simpanRancangDokumen(_cId, 'CP', judulDoc, konten, null);
        _dokumen = [doc, ..._dokumen.filter(d => !(d.jenis === 'CP' && d.judul === judulDoc))];
        if (!isWaliSd) {
          _cpElemen = elemen; _cpUmum = cpUmum; _cpRingkasan = ringkasan;
          try {
            await SipApi.upsertRancangSettings(_cId, {
              jenjang: _ans.jenjang, mapel_key: _ans.mapelKey, mapel: _ans.mapel, fase: _ans.fase,
              bidang_keahlian: _ans.bidangKeahlian ?? null, program_keahlian: _ans.programKeahlian ?? null,
              elemen_terpilih: _ans.elemenTerpilih ?? [],
            });
          } catch (upsertErr) { console.error('[rancang][step1] upsert settings gagal:', upsertErr); }
          _settings = { ...(_settings || {}), jenjang: _ans.jenjang, mapel_key: _ans.mapelKey, mapel: _ans.mapel, fase: _ans.fase };
        }
        renderCpSection();
      } catch (e) {
        console.error(`[rancang][step1] generate CP ${mapelNama} gagal:`, e);
        btn.disabled = false;
        btn.textContent = 'Gagal — coba lagi';
      }
    }

    renderCpSection();

    async function renderCpReadOnly() {
      const body = el('rp-body');
      if (!body) return;
      if (el('rp-cp-block')) return;

      // Auto-generate _cpRingkasan jika kosong
      if (!_cpRingkasan.length && _cpElemen.length) {
        try {
          const result = await callAI({
            mode: 'cp_summary',
            konteks: { mapel: _ans.mapel, jenjang: _ans.jenjang, fase: _settings?.fase, kelas: _profil?.kelas || '' },
            elemen_list: _ans.elemenTerpilih?.length
              ? _cpElemen.filter(e => _ans.elemenTerpilih.map(n => n.trim().toLowerCase()).includes(e.nama.trim().toLowerCase()))
              : _cpElemen,
            elemen_difilter: !!(_ans.elemenTerpilih?.length),
          });
          _cpRingkasan = result?.ringkasan || [];
        } catch {
          _cpRingkasan = _cpElemen.map(e => ({ elemen: e.nama, konkret: null }));
        }
      }

      // Render elemen CP dengan "Gambaran Pencapaian"
      const elemenHtml = _cpElemen.map(e => {
        const r = _cpRingkasan.find(x => x.elemen === e.nama);
        const konkret = r?.konkret || null;
        return `<div class="rp-cp-elemen">
  <div class="rp-cp-elemen-nama">${esc(e.nama)}</div>
  <div class="rp-cp-elemen-layer">
    <span class="rp-cp-layer-label rp-cp-layer-label--normatif">CP Normatif</span>
    <div class="rp-cp-normatif">${esc(e.cp_normatif)}</div>
  </div>
  ${konkret ? `<div class="rp-cp-elemen-layer">
    <span class="rp-cp-layer-label rp-cp-layer-label--praktik">Gambaran Pencapaian</span>
    <div class="rp-cp-elemen-konkret">${esc(konkret)}</div>
  </div>` : ''}
</div>`;
      }).join('');

      const cpBlock = document.createElement('div');
      cpBlock.className = 'rp-block';
      cpBlock.id = 'rp-cp-block';
      cpBlock.innerHTML = `
<div class="rp-block-title">Capaian Pembelajaran</div>
${_cpUmum ? `<p class="rp-cp-umum">${esc(_cpUmum)}</p>` : ''}
${elemenHtml}`;

      body.insertBefore(cpBlock, el('rp-nav-row-cp'));

      // Render nav-row di bawah CP block
      renderNavRowCp();
    }
  }

  async function renderStep1P1b() {
    const block = el('rp-body')?.querySelector('.rp-block');
    if (!block) return;
    ['rp-q-p1b','rp-q-p1c','rp-q-p2','rp-q-p2b','rp-q-p3','rp-step1-btn'].forEach(id => el(id)?.remove());

    const div = document.createElement('div');
    div.id = 'rp-q-p1b';
    div.className = 'rp-q';
    div.innerHTML = `<label class="rp-q-label" style="color:var(--gold)">2. Bidang keahlian</label>${loading('Memuat bidang…')}`;
    block.insertBefore(div, el('rp-step1-error'));

    const data = await loadCpData();
    const qDiv = el('rp-q-p1b');
    if (!qDiv || !data) return;

    const bidangs = [...new Set(
      Object.values(data)
        .filter(v => v.jenjang?.includes('SMK') && v.bidang && v.bidang !== 'Umum')
        .map(v => v.bidang)
    )].sort((a, b) => a.localeCompare(b, 'id'));

    qDiv.innerHTML = `<label class="rp-q-label" style="color:var(--gold)">2. Bidang keahlian</label>
${makeCustomDropdown('rp-bidang-sel', bidangs, _ans.bidangKeahlian || '')}`;

    wireCustomDropdown('rp-bidang-sel', val => {
      _ans.bidangKeahlian = (val && val !== '__lainnya__') ? val
        : getCustomSelVal('rp-bidang-sel') || null;
      _ans.programKeahlian = null;
      _ans.mapelKey = ''; _ans.mapel = ''; _ans.fase = ''; _ans.elemenTerpilih = [];
      ['rp-q-p1c','rp-q-p2','rp-q-p2b','rp-q-p3','rp-step1-btn'].forEach(id => el(id)?.remove());
      if (_ans.bidangKeahlian) renderStep1P1c();
    });

    if (_ans.bidangKeahlian) renderStep1P1c();
  }

  async function renderStep1P1c() {
    const block = el('rp-body')?.querySelector('.rp-block');
    if (!block) return;
    ['rp-q-p1c','rp-q-p2','rp-q-p2b','rp-q-p3','rp-step1-btn'].forEach(id => el(id)?.remove());

    const div = document.createElement('div');
    div.id = 'rp-q-p1c';
    div.className = 'rp-q';
    div.innerHTML = `<label class="rp-q-label" style="color:var(--gold)">3. Program keahlian</label>${loading('Memuat program keahlian…')}`;
    block.insertBefore(div, el('rp-step1-error'));

    const data = await loadCpData();
    const qDiv = el('rp-q-p1c');
    if (!qDiv || !data) return;

    const programs = [...new Set(
      Object.values(data)
        .filter(v => v.bidang === _ans.bidangKeahlian && v.program_keahlian)
        .map(v => v.program_keahlian)
    )].sort((a, b) => a.localeCompare(b, 'id'));

    qDiv.innerHTML = `<label class="rp-q-label" style="color:var(--gold)">3. Program keahlian</label>
${makeCustomDropdown('rp-program-sel', programs, _ans.programKeahlian || '')}`;

    wireCustomDropdown('rp-program-sel', val => {
      _ans.programKeahlian = (val && val !== '__lainnya__') ? val
        : getCustomSelVal('rp-program-sel') || null;
      _ans.mapelKey = ''; _ans.mapel = ''; _ans.fase = ''; _ans.elemenTerpilih = [];
      ['rp-q-p2','rp-q-p2b','rp-q-p3','rp-step1-btn'].forEach(id => el(id)?.remove());
      if (_ans.programKeahlian) renderStep1P2('SMK', _ans.bidangKeahlian);
    });

    if (_ans.programKeahlian) {
      renderStep1P2('SMK', _ans.bidangKeahlian, !!_ans.mapelKey);
    }
  }

  // Sumber: Lampiran II & III Kepka BSKAP No. 046/H/KR/2025
  const WHITELIST_MAPEL_UMUM_SMK = [
    'pendidikan_pancasila',
    'bahasa_indonesia',
    'matematika',
    'pjok',
    'bahasa_inggris',
    'informatika',
    'seni_musik',
    'seni_rupa',
    'seni_tari',
    'seni_teater',
    'sejarah',
    'projek_ipas',
    'projek_kreatif_kewirausahaan',
  ];

  async function renderStep1P2(jenjang, bidang, restore) {
    const block = el('rp-body')?.querySelector('.rp-block');
    if (!block) return;
    ['rp-q-p2','rp-q-p2b','rp-q-p3','rp-step1-btn'].forEach(id => el(id)?.remove());

    const qNum = _ans.programKeahlian ? '4' : bidang ? '3' : '2';
    const div = document.createElement('div');
    div.id = 'rp-q-p2';
    div.className = 'rp-q';
    div.innerHTML = `<label class="rp-q-label" style="color:var(--gold)">${qNum}. Mata pelajaran</label>${loading('Memuat mapel…')}`;
    block.insertBefore(div, el('rp-step1-error'));

    const data = await loadCpData();
    const qDiv = el('rp-q-p2');
    if (!qDiv || !data) return;

    const entries = Object.entries(data).filter(([key, v]) =>
      bidang
        ? (v.program_keahlian === _ans.programKeahlian) || (v.bidang === 'Umum' && WHITELIST_MAPEL_UMUM_SMK.includes(key))
        : v.jenjang?.includes(jenjang)
    );

    const opts = entries.map(([key]) => {
      const label = key.replace(/_smk$/, '').replace(/_/g, ' ')
        .replace(/\b\w/g, c => c.toUpperCase());
      return { value: key, label };
    }).sort((a, b) => a.label.localeCompare(b.label, 'id'));

    qDiv.innerHTML = `<label class="rp-q-label" style="color:var(--gold)">${qNum}. Mata pelajaran</label>
${makeCustomDropdown('rp-mapel-sel', opts, _ans.mapelKey || '')}`;

    wireCustomDropdown('rp-mapel-sel', val => {
      _ans.mapelKey = (val && val !== '__lainnya__') ? val : getCustomSelVal('rp-mapel-sel');
      const selOpt = el('rp-mapel-sel')?.querySelector(`.rp-custom-select-option[data-value="${CSS.escape(_ans.mapelKey)}"]`);
      _ans.mapel = selOpt?.textContent.trim() || _ans.mapelKey;
      _ans.fase = ''; _ans.elemenTerpilih = [];
      ['rp-q-p2b','rp-q-p3','rp-step1-btn'].forEach(id => el(id)?.remove());
      if (_ans.mapelKey && data[_ans.mapelKey]) {
        const entry = data[_ans.mapelKey];
        if (entry.bidang !== 'Umum') renderStep1P2b(_ans.mapelKey, entry);
        else renderStep1P3(_ans.mapelKey, entry);
      }
    });

    if (restore && _ans.mapelKey && data[_ans.mapelKey]) {
      const entry = data[_ans.mapelKey];
      if (entry.bidang !== 'Umum') renderStep1P2b(_ans.mapelKey, entry, true);
      else renderStep1P3(_ans.mapelKey, entry, true);
    }
  }

  function renderStep1P2b(mapelKey, entryData, restore) {
    const block = el('rp-body')?.querySelector('.rp-block');
    if (!block) return;
    ['rp-q-p2b','rp-q-p3','rp-step1-btn'].forEach(id => el(id)?.remove());

    // Kumpulkan semua elemen unik dari semua fase yang tersedia di entry
    const allElemen = [];
    const seen = new Set();
    ['fase_e','fase_f'].forEach(fk => {
      (entryData[fk]?.elemen || []).forEach(elItem => {
        if (!seen.has(elItem.nama)) {
          seen.add(elItem.nama);
          allElemen.push(elItem.nama);
        }
      });
    });

    const div = document.createElement('div');
    div.id = 'rp-q-p2b';
    div.className = 'rp-q';
    div.innerHTML = `<label class="rp-q-label" style="color:var(--gold)">5. Elemen yang Anda ampu *</label>
<div class="rp-elemen-list" id="rp-elemen-list">
  ${allElemen.map(nama => {
    const checked = (_ans.elemenTerpilih || []).includes(nama);
    return `<label class="rp-elemen-check${checked ? ' checked' : ''}">
  <input type="checkbox" value="${esc(nama)}"${checked ? ' checked' : ''}>
  <span>${esc(toTitleCase(nama))}</span>
</label>`;
  }).join('')}
</div>`;
    block.insertBefore(div, el('rp-step1-error'));

    const listEl = el('rp-elemen-list');
    function syncElemen() {
      _ans.elemenTerpilih = [...listEl.querySelectorAll('input[type="checkbox"]:checked')]
        .map(cb => cb.value);
      listEl.querySelectorAll('.rp-elemen-check').forEach(lbl => {
        lbl.classList.toggle('checked', lbl.querySelector('input').checked);
      });
      el('rp-q-p3')?.remove();
      el('rp-step1-btn')?.remove();
      if (_ans.elemenTerpilih.length > 0) {
        renderStep1P3(mapelKey, entryData, !!_ans.fase);
      }
    }
    listEl.addEventListener('change', syncElemen);

    if (restore && _ans.elemenTerpilih?.length > 0) syncElemen();
  }

  function renderStep1P3(mapelKey, entryData, restore) {
    const block = el('rp-body')?.querySelector('.rp-block');
    if (!block) return;
    ['rp-q-p3','rp-step1-btn'].forEach(id => el(id)?.remove());

    const FASE_PER_JENJANG = {
      'SD':  ['fase_a','fase_b','fase_c'],
      'SMP': ['fase_d'],
      'SMA': ['fase_e','fase_f'],
      'SMK': ['fase_e','fase_f'],
    };
    const jenjangFases = FASE_PER_JENJANG[_ans.jenjang] || [];
    const availFases = jenjangFases.filter(fk => entryData[fk]);
    const isProduktif = _ans.jenjang === 'SMK' && entryData.bidang !== 'Umum';
    const pNum = _ans.jenjang !== 'SMK' ? '3' : isProduktif ? '6' : '5';

    const div = document.createElement('div');
    div.id = 'rp-q-p3';
    div.className = 'rp-q';

    if (availFases.length === 0) {
      div.innerHTML = `<label class="rp-q-label" style="color:var(--gold)">${pNum}. Fase capaian pembelajaran</label>
<p class="rp-notice">Fase tidak tersedia untuk jenjang ini.</p>`;
      block.insertBefore(div, el('rp-step1-error'));
      return;
    }

    div.innerHTML = `<label class="rp-q-label" style="color:var(--gold)">${pNum}. Fase capaian pembelajaran</label>
<div class="rp-chip-group" id="rp-fase-chips">
  ${availFases.map(fk => {
    const f = FASE_OPTS.find(o => o.value === fk);
    const sel = _ans.fase === fk ? ' selected' : '';
    return `<div class="rp-chip${sel}" data-value="${fk}">${f ? esc(f.label) : fk}</div>`;
  }).join('')}
</div>`;
    block.insertBefore(div, el('rp-step1-error'));

    // Auto-select jika hanya satu fase tersedia
    if (availFases.length === 1 && !_ans.fase) {
      _ans.fase = availFases[0];
      div.querySelector('.rp-chip')?.classList.add('selected');
    }

    div.querySelectorAll('#rp-fase-chips .rp-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        div.querySelectorAll('#rp-fase-chips .rp-chip').forEach(c => c.classList.remove('selected'));
        chip.classList.add('selected');
        _ans.fase = chip.dataset.value;
        el('rp-step1-btn')?.remove();
        renderStep1Button();
      });
    });

    if (_ans.fase) renderStep1Button();
  }

  function renderStep1Button() {
    const block = el('rp-body')?.querySelector('.rp-block');
    if (!block) return;
    el('rp-step1-btn')?.remove();
    const div = document.createElement('div');
    div.id = 'rp-step1-btn';
    div.className = 'rp-action-row';
    div.innerHTML = btnPrimary('rp-btn-cp', 'Lihat CP &amp; lanjutkan →');
    block.insertBefore(div, el('rp-step1-error'));
    el('rp-btn-cp').addEventListener('click', handleStep1Submit);
  }

  async function handleStep1Submit() {
    if (_genCp) return;

    const mapelKey = _ans.mapelKey;
    const jenjang  = _ans.jenjang;
    const fase     = _ans.fase;

    showError('rp-step1-error', '');
    if (!mapelKey || !fase) { appendStep1Next(); return; }

    _genCp = true;
    const btn = el('rp-btn-cp');
    if (btn) { btn.disabled = true; btn.textContent = 'Memuat CP…'; }

    // Simpan settings ke DB sebelum AI generate — tersimpan meski AI gagal
    try {
      await SipApi.upsertRancangSettings(_cId, {
        jenjang:          _ans.jenjang,
        mapel_key:        _ans.mapelKey,
        mapel:            _ans.mapel,
        fase:             _ans.fase,
        bidang_keahlian:  _ans.bidangKeahlian  ?? null,
        program_keahlian: _ans.programKeahlian ?? null,
        elemen_terpilih:  _ans.elemenTerpilih  ?? [],
      });
      _settings = {
        ...(_settings || {}),
        jenjang:          _ans.jenjang,
        mapel_key:        _ans.mapelKey,
        mapel:            _ans.mapel,
        fase:             _ans.fase,
        bidang_keahlian:  _ans.bidangKeahlian  ?? null,
        program_keahlian: _ans.programKeahlian ?? null,
        elemen_terpilih:  _ans.elemenTerpilih  ?? [],
      };
      try {
        await SipApi.updateClassroomRancang(_cId, {
          jenjang:          _ans.jenjang,
          mapel_key:        _ans.mapelKey,
          bidang_keahlian:  _ans.bidangKeahlian  ?? null,
          program_keahlian: _ans.programKeahlian ?? null,
          elemen_terpilih:  _ans.elemenTerpilih?.length ? _ans.elemenTerpilih : null,
        });
      } catch (clErr) { console.error('[rancang] updateClassroomRancang gagal:', clErr); }
    } catch (settingsErr) { console.error('[rancang] upsertRancangSettings gagal:', settingsErr); }

    try {
      const cpFase = await fetchCpData(mapelKey, fase);

      if (cpFase) {
        _cpElemen = cpFase.elemen || [];
        _cpLabel = cpFase.label || '';
        _cpUmum = cpFase.cp_umum || '';
        renderCpLoading(cpFase.label);
        try {
          const result = await callAI({
            mode: 'cp_summary',
            konteks: { mapel: _ans.mapel, jenjang, fase, kelas: _profil?.kelas || '' },
            elemen_list: _ans.elemenTerpilih?.length
              ? _cpElemen.filter(e => _ans.elemenTerpilih.map(n => n.trim().toLowerCase()).includes(e.nama.trim().toLowerCase()))
              : _cpElemen,
            elemen_difilter: !!(_ans.elemenTerpilih?.length),
          });
          _cpRingkasan = result?.ringkasan || [];
        } catch {
          _cpRingkasan = _cpElemen.map(e => ({ elemen: e.nama, konkret: null }));
        }
        renderCpPreview(cpFase.label, cpFase.cp_umum);
      } else {
        _cpElemen = [];
        _cpRingkasan = [];
        _cpLabel = '';
        _cpUmum = '';
        renderCpNotice(_ans.mapel);
      }
    } finally {
      _genCp = false;
    }
  }

  function renderCpLoading(label) {
    const body = el('rp-body');
    if (!body) return;
    const wrap = body.querySelector('.rp-block');
    if (!wrap) return;
    const prev = wrap.querySelector('#rp-cp-preview');
    if (prev) prev.remove();
    const div = document.createElement('div');
    div.id = 'rp-cp-preview';
    div.className = 'rp-cp-card';
    div.innerHTML = `<div class="rp-cp-card-label">${esc(label)}</div>${loading('AI sedang merangkum CP…')}`;
    wrap.appendChild(div);
  }

  function renderCpPreview(label, cpUmum) {
    const div = el('rp-cp-preview');
    if (!div) return;
    const umum = cpUmum?.trim() ? `<div style="font-size:var(--fs-caption);color:var(--text-secondary);margin-bottom:var(--space-md)">${esc(cpUmum.trim())}</div>` : '';

    const filterAktif = _ans.elemenTerpilih && _ans.elemenTerpilih.length > 0;
    const normalizedPilihan = filterAktif
      ? _ans.elemenTerpilih.map(s => s.trim().toLowerCase())
      : null;
    const elemenTampil = filterAktif
      ? _cpElemen.filter(e => normalizedPilihan.includes(e.nama.trim().toLowerCase()))
      : _cpElemen;
    const labelFilter = filterAktif
      ? `<div style="font-size:var(--fs-caption);color:var(--gold);margin-bottom:var(--space-sm);">Menampilkan ${elemenTampil.length} elemen sesuai pilihan Anda</div>`
      : '';

    const rows = elemenTampil.map((e) => {
      const r = _cpRingkasan.find(x => x.elemen === e.nama);
      const konkret = r?.konkret || null;
      return `<div class="rp-cp-elemen">
  <div class="rp-cp-elemen-nama">${esc(e.nama)}</div>
  <div class="rp-cp-elemen-layer">
    <span class="rp-cp-layer-label rp-cp-layer-label--normatif">CP Normatif</span>
    <div class="rp-cp-normatif">${esc(e.cp_normatif)}</div>
  </div>
  ${konkret ? `<div class="rp-cp-elemen-layer">
    <span class="rp-cp-layer-label rp-cp-layer-label--praktik">Gambaran Pencapaian</span>
    <div class="rp-cp-elemen-konkret">${esc(konkret)}</div>
  </div>` : ''}
</div>`;
    }).join('');
    div.innerHTML = `<div class="rp-cp-card-label">CP ${esc(label)}</div>${umum}${labelFilter}${rows}`;
    appendStep1Next();
  }

  function renderCpNotice(mapel) {
    const body = el('rp-body');
    if (!body) return;
    const wrap = body.querySelector('.rp-block');
    if (!wrap) return;
    const prev = wrap.querySelector('#rp-cp-preview');
    if (prev) prev.remove();
    const div = document.createElement('div');
    div.id = 'rp-cp-preview';
    div.className = 'rp-cp-notice';
    div.innerHTML = `CP untuk <strong>${esc(mapel)}</strong> belum tersedia di sistem — AI akan generate berdasarkan nama mapel saja. Tetap bisa lanjut.`;
    wrap.appendChild(div);
    appendStep1Next();
  }

  // ── Helper: tambah save-row Simpan CP di bawah konten ───────────────────
  // Dipanggil dari appendStep1Next() (flow fresh) dan renderCpReadOnly() (flow restore).
  // container: elemen parent untuk appendChild / insertBefore
  // beforeEl:  jika diisi, save-row disisipkan sebelum elemen ini
  function attachSimpanCpRow(container, beforeEl) {
    if (!container || !_cpElemen.length) return;
    // Hapus save-row lama agar tidak duplikat jika mapel diganti dalam sesi yang sama
    el('rp-btn-simpan-cp')?.closest('.rp-save-row')?.remove();
    const alreadySaved = _dokumen.some(d => d.jenis === 'CP');
    const saveRow = document.createElement('div');
    saveRow.className = 'rp-save-row';
    saveRow.innerHTML = `<button type="button" class="rp-btn-simpan" id="rp-btn-simpan-cp"
      ${alreadySaved ? 'disabled style="background:var(--success,#2d6a4f);cursor:default;"' : ''}>
      ${alreadySaved ? '✓ Tersimpan' : '💾 Simpan CP'}
    </button>
    <span class="rp-identitas-status" id="rp-cp-simpan-status"></span>`;
    if (beforeEl) container.insertBefore(saveRow, beforeEl);
    else container.appendChild(saveRow);

    if (alreadySaved) return;

    el('rp-btn-simpan-cp')?.addEventListener('click', async () => {
      const btn    = el('rp-btn-simpan-cp');
      const status = el('rp-cp-simpan-status');
      if (btn) { btn.disabled = true; btn.textContent = 'Menyimpan…'; }
      try {
        const fase  = _ans.fase || _settings?.fase || '';
        const judul = `CP — ${_ans.mapel} ${fase.replace(/_/g,' ').toUpperCase()}`.trim();
        const konten = {
          elemen:    _cpElemen,
          ringkasan: _cpRingkasan,
          cp_umum:   _cpUmum,
          mapel:     _ans.mapel,
          fase,
        };
        const doc = await SipApi.simpanRancangDokumen(_cId, 'CP', judul, konten, null);
        _dokumen = [doc, ..._dokumen.filter(d => d.jenis !== 'CP')];
        // Simpan settings ke DB agar hasSettings = true saat refresh
        try {
          await SipApi.upsertRancangSettings(_cId, {
            jenjang:          _ans.jenjang,
            mapel_key:        _ans.mapelKey,
            mapel:            _ans.mapel,
            fase:             _ans.fase,
            bidang_keahlian:  _ans.bidangKeahlian  ?? null,
            program_keahlian: _ans.programKeahlian ?? null,
            elemen_terpilih:  _ans.elemenTerpilih  ?? [],
          });
        } catch (upsertErr) { console.error('[rancang][nav-row] upsert settings gagal:', upsertErr); }
        _settings = {
          ...(_settings || {}),
          jenjang: _ans.jenjang, mapel_key: _ans.mapelKey,
          mapel: _ans.mapel, fase: _ans.fase,
        };
        if (btn) {
          btn.textContent = '✓ Tersimpan';
          btn.style.background = 'var(--success,#2d6a4f)';
          btn.style.cursor = 'default';
          btn.disabled = true;
        }
        // Sync nav-row button jika ada (flow read-only)
        const navBtn = el('rp-btn-simpan-cp-nav');
        if (navBtn) {
          navBtn.textContent = '✓ Tersimpan';
          navBtn.style.background = 'var(--success,#2d6a4f)';
          navBtn.style.cursor = 'default';
          navBtn.disabled = true;
        }
      } catch (e) {
        console.error('[rancang] simpan CP gagal:', e);
        if (btn) { btn.disabled = false; btn.textContent = '💾 Simpan CP'; }
        if (status) status.textContent = '✗ Gagal';
      }
    });
  }

  function appendStep1Next() {
    const wrap = el('rp-body')?.querySelector('.rp-block');
    if (!wrap) return;
    // Update tombol yang sudah ada, atau append action row baru
    const existingBtn = el('rp-btn-cp');
    if (existingBtn) {
      existingBtn.disabled = false;
      existingBtn.innerHTML = _ans.jenjang === 'SMK' ? 'Lanjut ke konteks SMK →' : 'Lanjut ke preferensi →';

      // Tambah save-row Simpan CP sebelum tombol Lanjut
      attachSimpanCpRow(wrap, el('rp-step1-btn') || null);

      existingBtn.onclick = async () => {
        // Simpan settings ke DB agar pre-fill aktif di sesi berikutnya
        try {
          await SipApi.upsertRancangSettings(_cId, {
            jenjang:          _ans.jenjang,
            mapel_key:        _ans.mapelKey,
            mapel:            _ans.mapel,
            fase:             _ans.fase,
            bidang_keahlian:  _ans.bidangKeahlian  ?? null,
            program_keahlian: _ans.programKeahlian ?? null,
            elemen_terpilih:  _ans.elemenTerpilih  ?? [],
          });
          // Update _settings lokal agar read-only aktif jika kembali ke Step 1
          _settings = {
            ...(_settings || {}),
            jenjang:          _ans.jenjang,
            mapel_key:        _ans.mapelKey,
            mapel:            _ans.mapel,
            fase:             _ans.fase,
            bidang_keahlian:  _ans.bidangKeahlian  ?? null,
            program_keahlian: _ans.programKeahlian ?? null,
            elemen_terpilih:  _ans.elemenTerpilih  ?? [],
          };
        } catch (e) {
          console.warn('[rancang] upsert settings gagal:', e);
          // Lanjut tetap — upsert gagal tidak boleh blokir alur guru
        }
        if (_ans.jenjang === 'SMK') { _step = 2; renderStep2(); }
        else { _ans.smk = null; _step = 3; renderStep3A(); }
        saveRpState();
      };
    }
  }

  // ─── Step 2 — SMK ───────────────────────────────────────────────────────────

  function renderStep2() {
    cleanupAllDropdowns();
    _step = 2;
    renderStepBar();
    const body = el('rp-body');
    if (!body) return;

    const smk = _ans.smk || {};

    // Helper: checkbox list bergaya P2b
    function smkCheckList(listId, opsi, saved, withLainnya) {
      const savedArr = Array.isArray(saved) ? saved : (saved ? [saved] : []);
      const rows = opsi.map(nama => {
        const checked = savedArr.includes(nama) ? ' checked' : '';
        return `<label class="rp-elemen-check${checked ? ' checked' : ''}">
  <input type="checkbox" value="${esc(nama)}"${checked}>
  <span>${esc(nama)}</span>
</label>`;
      }).join('');
      const isLainnya = withLainnya && savedArr.some(v => !opsi.includes(v));
      const lainnyaVal = isLainnya ? savedArr.find(v => !opsi.includes(v)) : '';
      const lainnyaRow = withLainnya ? `<label class="rp-elemen-check${isLainnya ? ' checked' : ''}">
  <input type="checkbox" value="__lainnya__"${isLainnya ? ' checked' : ''}>
  <span>Lainnya</span>
</label>
<input type="text" id="${listId}-txt" class="rp-input" placeholder="Jelaskan…"
  style="margin-top:var(--space-xs);display:${isLainnya ? 'block' : 'none'};"
  value="${esc(lainnyaVal)}">` : '';
      return `<div class="rp-elemen-list" id="${listId}">${rows}${lainnyaRow}</div>`;
    }

    const tujuanOpsi = ['PKL / Magang','Teaching Factory','Sertifikasi Kompetensi (BNSP/LSP)','LKS / Kompetisi','Penguatan Konsep Dasar','Penguatan Literasi','Penguatan Numerasi','Kontekstualisasi ke Dunia Kerja','Kewirausahaan / UMKM'];
    const dudiOpsi   = ['Kunjungan industri','Guest teacher','Sponsorship alat','Tidak ada hubungan DUDI'];

    body.innerHTML = `
<div class="rp-block">
  <div class="rp-block-title">Konteks SMK</div>

  <div class="rp-q">
    <label class="rp-q-label" style="color:var(--gold)">SMK-2. Tujuan pembelajaran utama (pilih semua yang sesuai) *</label>
    ${smkCheckList('rp-smk-tujuan-list', tujuanOpsi, smk.tujuan, true)}
  </div>

  <div class="rp-q">
    <label class="rp-q-label" style="color:var(--gold)">SMK-3. Status PKL siswa</label>
    ${makeCustomDropdown('rp-smk-status-pkl', ['Belum PKL','Sedang PKL','Sudah selesai PKL','Tidak ada PKL'], smk.status_pkl || '')}
  </div>

  <div class="rp-q">
    <label class="rp-q-label" style="color:var(--gold)">SMK-4. Target sertifikasi</label>
    ${makeCustomDropdown('rp-smk-target-sertif', ['Tidak ada target sertifikasi','Sertifikasi kompetensi (LSP)','Uji Kompetensi Keahlian (UKK)','Sertifikat industri langsung'], smk.target_sertif || '')}
  </div>

  <div class="rp-q">
    <label class="rp-q-label" style="color:var(--gold)">SMK-5. Durasi satu unit/proyek pembelajaran</label>
    ${makeCustomDropdown('rp-smk-durasi-proyek', ['1–2 minggu','3–4 minggu','5–8 minggu','Lebih dari 8 minggu'], smk.durasi_proyek || '')}
  </div>

  <div class="rp-q">
    <label class="rp-q-label" style="color:var(--gold)">SMK-6. Hubungan dengan DUDI (pilih semua yang sesuai) *</label>
    ${smkCheckList('rp-smk-dudi-list', dudiOpsi, smk.hubungan_dudi, true)}
  </div>

  <div class="rp-q">
    <label class="rp-q-label" style="color:var(--gold)" for="rp-smk-industri">SMK-7. Industri dominan di daerah</label>
    <input type="text" id="rp-smk-industri" class="rp-input" placeholder="Contoh: Tekstil, Pariwisata, Pertanian…" value="${esc(smk.industri_dominan||'')}">
  </div>

  <div class="rp-q">
    <label class="rp-q-label" style="color:var(--gold)">SMK-8. Mitra DUDI aktif</label>
    ${makeCustomDropdown('rp-smk-mitra-dudi', ['Tidak ada mitra aktif','Ada mitra aktif'], smk.mitra_dudi || '')}
    <div class="rp-cond-input${smk.mitra_dudi==='Ada mitra aktif'?' visible':''}" id="rp-smk-mitra-wrap">
      <input type="text" id="rp-smk-mitra" class="rp-input" placeholder="Nama mitra DUDI…" style="margin-top:var(--space-xs);" value="${esc(smk.nama_mitra||'')}">
    </div>
  </div>

  <div id="rp-step2-error" class="error-msg" style="display:none;"></div>
  <div class="rp-action-row">
    ${btnSecondary('rp-btn-back2','← Kembali')}
    ${btnPrimary('rp-btn-smk-next', 'Lanjut ke profil kelas →')}
  </div>
</div>`;

    // Wire custom dropdowns SMK-3,4,5
    ['rp-smk-status-pkl','rp-smk-target-sertif',
     'rp-smk-durasi-proyek'].forEach(id => {
      wireCustomDropdown(id);
    });

    // SMK-10 conditional input — wire dengan callback
    wireCustomDropdown('rp-smk-mitra-dudi', val => {
      const aktif = (val && val !== '__lainnya__') ? val : getCustomSelVal('rp-smk-mitra-dudi');
      el('rp-smk-mitra-wrap')?.classList.toggle('visible', aktif === 'Ada mitra aktif');
    });

    // Checkbox .checked class sync + Lainnya toggle untuk SMK-3 dan SMK-8
    [{ listId: 'rp-smk-tujuan-list' }, { listId: 'rp-smk-dudi-list' }].forEach(({ listId }) => {
      const listEl = el(listId);
      if (!listEl) return;
      listEl.addEventListener('change', e => {
        const cb = e.target;
        if (!cb || cb.type !== 'checkbox') return;
        cb.closest('.rp-elemen-check')?.classList.toggle('checked', cb.checked);
        if (cb.value === '__lainnya__') {
          const txt = el(listId + '-txt');
          if (txt) { txt.style.display = cb.checked ? 'block' : 'none'; if (!cb.checked) txt.value = ''; }
        }
      });
    });

    el('rp-btn-back2').addEventListener('click', () => { _step = 1; renderStep1(); });
    el('rp-btn-smk-next').addEventListener('click', handleStep2Submit);
  }

  function handleStep2Submit() {
    showError('rp-step2-error', '');
    function getCheckboxVals(listId) {
      const listEl = el(listId);
      if (!listEl) return [];
      const vals = [];
      listEl.querySelectorAll('input[type="checkbox"]:checked').forEach(cb => {
        if (cb.value === '__lainnya__') {
          const txt = (el(listId + '-txt')?.value || '').trim();
          if (txt) vals.push(txt);
        } else {
          vals.push(cb.value);
        }
      });
      return vals;
    }

    _ans.smk = {
      tujuan:          getCheckboxVals('rp-smk-tujuan-list'),
      status_pkl:      getCustomSelVal('rp-smk-status-pkl'),
      target_sertif:   getCustomSelVal('rp-smk-target-sertif'),
      durasi_proyek:   getCustomSelVal('rp-smk-durasi-proyek'),
      hubungan_dudi:   getCheckboxVals('rp-smk-dudi-list'),
      industri_dominan:(el('rp-smk-industri')?.value || '').trim(),
      mitra_dudi:      getCustomSelVal('rp-smk-mitra-dudi'),
      nama_mitra:      (el('rp-smk-mitra')?.value || '').trim(),
    };

    _step = 3;
    saveRpState();
    renderStep3A();
  }

  // ─── Step 3 — Niat Guru + Preferensi ───────────────────────────────────────

  function renderStep3A() {
    cleanupAllDropdowns();
    _step = 3;
    renderStepBar();
    const body = el('rp-body');
    if (!body) return;

    const ng = _ans.niat_guru || {};

    body.innerHTML = `
<div class="rp-block">
  <div class="rp-block-title">Visi Pembelajaran</div>

  <div class="rp-q" id="rp-q-a1">
    <label class="rp-q-label" style="color:var(--gold)" for="rp-a1">A-1. Suasana belajar seperti apa yang ingin Anda ciptakan?</label>
    ${makeCustomDropdown('rp-a1', ['Aktif dan eksploratif','Terstruktur dan terarah','Kolaboratif dan sosial','Mandiri dan reflektif','Campuran sesuai kebutuhan'], ng.suasana_belajar||'')}
  </div>

  <div class="rp-q" id="rp-q-a2">
    <label class="rp-q-label" style="color:var(--gold)" for="rp-a2">A-2. Dari mana Anda ingin memulai perjalanan belajar siswa?</label>
    ${makeCustomDropdown('rp-a2', ['Dari pengalaman/konteks nyata siswa','Dari konsep dasar dulu baru praktik','Dari masalah yang perlu dipecahkan','Dari produk yang ingin dihasilkan'], ng.titik_mulai||'')}
  </div>

  <div class="rp-q" id="rp-q-a3">
    <label class="rp-q-label" style="color:var(--gold)" for="rp-a3">A-3. Perkembangan kemampuan apa yang paling ingin Anda lihat pada siswa?</label>
    ${makeCustomDropdown('rp-a3', ['Keberanian mencoba dan bereksperimen','Kemampuan menghubungkan teori dengan praktik','Kemandirian dan inisiatif belajar','Kemampuan berpikir sistematis','Kerja sama dan komunikasi dalam tim'], ng.perkembangan_diinginkan||'')}
  </div>

  <div class="rp-q" id="rp-q-a4">
    <label class="rp-q-label" style="color:var(--gold)" for="rp-a4">A-4. Pengalaman belajar apa yang ingin mendominasi kelas Anda?</label>
    ${makeCustomDropdown('rp-a4', ['Diskusi dan tanya jawab','Praktik dan eksperimen langsung','Proyek nyata yang bisa dilihat hasilnya','Penjelasan bertahap dari guru','Eksplorasi mandiri dengan panduan'], ng.pengalaman_dominan||'')}
  </div>

  <div id="rp-step3a-error" class="error-msg" style="display:none;"></div>
  <div class="rp-action-row" id="rp-a-action">
    ${btnSecondary('rp-btn-back3','← Kembali')}
    ${btnPrimary('rp-btn-a-next','Lanjut ke preferensi →')}
  </div>
</div>`;

    ['rp-a1','rp-a2','rp-a3','rp-a4'].forEach(id => wireCustomDropdown(id));

    el('rp-btn-back3')?.addEventListener('click', () => {
      if (_ans.jenjang === 'SMK') { _step = 2; renderStep2(); }
      else { _step = 1; renderStep1(); }
    });
    el('rp-btn-a-next')?.addEventListener('click', handleStep3ASubmit);
  }

  function handleStep3ASubmit() {
    _ans.niat_guru = {
      suasana_belajar:          getCustomSelVal('rp-a1'),
      titik_mulai:              getCustomSelVal('rp-a2'),
      perkembangan_diinginkan:  getCustomSelVal('rp-a3'),
      pengalaman_dominan:       getCustomSelVal('rp-a4'),
    };
    saveRpState();
    renderStep3B();
  }

  function renderStep3B() {
    cleanupAllDropdowns();
    const body = el('rp-body');
    if (!body) return;

    const pref = _ans.preferensi || {};

    const dimensiOpsi = ['Semua dimensi terintegrasi','Keimanan & Ketakwaan','Kewargaan','Penalaran Kritis','Kreativitas','Kolaborasi','Kemandirian','Kesehatan','Komunikasi'];
    const savedDimensi = Array.isArray(pref.dimensi_profil) ? pref.dimensi_profil : [];

    body.innerHTML = `
<div class="rp-block">
  <div class="rp-block-title">Preferensi Pendekatan</div>

  <div class="rp-q">
    <label class="rp-q-label" style="color:var(--gold)" for="rp-b1-jp">B-1. Berapa JP mapel ini per minggu?</label>
    <input type="number" id="rp-b1-jp" class="rp-select" min="1" placeholder="Contoh: 2"
      style="max-width:120px;" value="${esc(String(pref.jp_per_minggu||''))}">
  </div>

  ${_ans.jenjang === 'SMK' ? `
  <div class="rp-q">
    <label class="rp-q-label" style="color:var(--gold)" for="rp-b1-pola">B-1b. Pola jadwal mengajar</label>
    ${makeCustomDropdown('rp-b1-pola', ['JP terpisah','Blok','Teori dulu lalu praktik','Praktik penuh'], _ans.smk?.pola_jadwal || '')}
  </div>` : ''}

  <div class="rp-q">
    <label class="rp-q-label" style="color:var(--gold)" for="rp-b2">B-2. Pendekatan mengajar yang paling cocok</label>
    ${makeCustomDropdown('rp-b2', ['Langsung / Direct Instruction','Linear','Inquiry / Penemuan','Discovery / Penemuan Mandiri','PBL (Problem-Based)','PjBL (Project-Based)','Tematik','Spiral','Genre-Based (BKoF→MoT→JCoT→ICoT)','Task-Based (TBLT)','CLIL (Bahasa + Konten Mapel Lain)','Campuran'], pref.pendekatan||'')}
  </div>

  <div class="rp-q">
    <label class="rp-q-label" style="color:var(--gold)" for="rp-b3">B-3. Cara mengajar yang paling sering Anda gunakan</label>
    ${makeCustomDropdown('rp-b3', ['Fasilitator — siswa lebih aktif','Presenter — guru lebih banyak menjelaskan','Coach — banyak feedback individual'], pref.gaya_mengajar||'')}
  </div>

  <div class="rp-q">
    <label class="rp-q-label" style="color:var(--gold)" for="rp-b4">B-4. Bagaimana Anda ingin menilai pencapaian siswa</label>
    ${makeCustomDropdown('rp-b4', ['Tes tertulis','Presentasi / unjuk kerja','Portofolio','Observasi lapangan','Produk / karya','Jurnal refleksi'], pref.penilaian_utama||'')}
  </div>

  <div class="rp-q">
    <label class="rp-q-label" style="color:var(--gold)">B-5. Dimensi Profil Lulusan yang ingin difokuskan *</label>
    <div class="rp-elemen-list" id="rp-b5-list">
      ${dimensiOpsi.map(nama => {
        const checked = savedDimensi.includes(nama);
        return `<label class="rp-elemen-check${checked ? ' checked' : ''}">
  <input type="checkbox" value="${esc(nama)}"${checked ? ' checked' : ''}>
  <span>${esc(nama)}</span>
</label>`;
      }).join('')}
    </div>
    <div style="font-size:var(--fs-caption);color:var(--text-muted);margin-top:var(--space-xs);">*Berdasarkan Permendikdasmen No. 10 Tahun 2025</div>
  </div>

  <div id="rp-step3b-error" class="error-msg" style="display:none;"></div>
  <div class="rp-action-row">
    ${btnSecondary('rp-btn-back3b','← Kembali')}
    ${btnPrimary('rp-btn-gen-atp','Hasilkan ATP →')}
  </div>
</div>`;

    ['rp-b2','rp-b3','rp-b4'].forEach(id => wireCustomDropdown(id));
    if (_ans.jenjang === 'SMK') wireCustomDropdown('rp-b1-pola');

    // Checkbox .checked class sync untuk B-5
    el('rp-b5-list')?.addEventListener('change', e => {
      const cb = e.target;
      if (!cb || cb.type !== 'checkbox') return;
      cb.closest('.rp-elemen-check')?.classList.toggle('checked', cb.checked);
    });

    el('rp-btn-back3b')?.addEventListener('click', renderStep3A);
    el('rp-btn-gen-atp')?.addEventListener('click', handleStep3BSubmit);
  }

  async function handleStep3BSubmit() {
    if (_genAtp) return;
    showError('rp-step3b-error','');

    const jp = parseInt(el('rp-b1-jp')?.value || '0');
    const dimensiList = [...(el('rp-b5-list')?.querySelectorAll('input[type="checkbox"]:checked') || [])]
      .map(cb => cb.value);

    if (_ans.jenjang === 'SMK' && _ans.smk) {
      _ans.smk.pola_jadwal = getCustomSelVal('rp-b1-pola');
    }

    _ans.preferensi = {
      jp_per_minggu:   jp || null,
      pendekatan:      getCustomSelVal('rp-b2'),
      gaya_mengajar:   getCustomSelVal('rp-b3'),
      penilaian_utama: getCustomSelVal('rp-b4'),
      dimensi_profil:  dimensiList,
    };
    saveRpState();

    _genAtp = true;
    const btn = el('rp-btn-gen-atp');
    if (btn) { btn.disabled = true; btn.textContent = 'AI sedang menyusun ATP…'; }

    try {
      const result = await callAI({
        mode: 'atp',
        konteks: { mapel: _ans.mapel, jenjang: _ans.jenjang, fase: _ans.fase, jp_per_minggu: _ans.preferensi.jp_per_minggu, kelas: _profil?.kelas || '' },
        smk: _ans.smk ? { ..._ans.smk, bidang_keahlian: _ans.bidangKeahlian || null, program_keahlian: _ans.programKeahlian || null } : null,
        niat_guru: _ans.niat_guru,
        preferensi: _ans.preferensi,
        semester_list: _profil?.semester_list || [],
      });
      const generatedList = result?.tp_list || [];
      if (!generatedList.length) throw new Error('ATP kosong');
      if (!_teachingContext) {
        _teachingContext = await SipApi.getTeachingContextForClassroom(_cId, _ans.mapelKey);
      }
      if (!_teachingContext?.id) throw new Error('Teaching Context belum tersedia. Konfirmasi ulang profil mengajar.');
      const durable = await SipApi.phase2aPlanning({
        action: 'persist_generated_atp',
        classroom_id: _cId,
        teaching_context_id: _teachingContext.id,
        atp_id: _durableAtp?.atp_id || null,
        tp_list: generatedList,
      });
      _durableAtp = { atp_id: durable.atp_id, atp_revision_id: durable.atp_revision_id };
      _atpList = durable.tp_list || [];
      if (!_atpList.length) throw new Error('ATP kosong');
      _step = 4;
      saveRpState();
      renderStep4(_atpList);
    } catch (err) {
      showError('rp-step3b-error', 'Gagal generate ATP: ' + (err.message || 'Coba lagi.'));
      if (btn) { btn.disabled = false; btn.textContent = 'Hasilkan ATP →'; }
    } finally {
      _genAtp = false;
    }
  }

  // ─── Step 4 — ATP ───────────────────────────────────────────────────────────

  function showKktpModal(tp, onConfirm) {
    const overlay = document.createElement('div');
    overlay.id = 'rp-kktp-modal-overlay';
    overlay.className = 'rp-kktp-overlay';

    const judul = esc(tp.judul || '');
    const elemen = esc(tp.elemen_cp || 'elemen CP');

    const opsi = [
      {
        value: 'deskripsi_kriteria',
        title: 'Deskripsi Kriteria',
        desc: 'Daftar pernyataan konkret yang dicentang guru — Tercapai atau Belum Tercapai.',
        example: `✓ Siswa dapat menjelaskan ${elemen} secara lisan<br>
✓ Siswa dapat mengidentifikasi komponen utama dalam ${judul}<br>
✗ Siswa belum mampu menghubungkan konsep dengan konteks nyata`,
      },
      {
        value: 'rubrik',
        title: 'Rubrik',
        desc: 'Tabel 4 level pencapaian per aspek — dari Baru Berkembang hingga Mahir.',
        example: `Aspek: ${elemen}<br>Baru Berkembang → Layak → Cakap → Mahir`,
      },
      {
        value: 'interval_nilai',
        title: 'Interval Nilai',
        desc: 'Skala 1–5 per kriteria dengan batas ketercapaian (misal ≥ 61 dari 100).',
        example: `Kriteria: Ketepatan ${judul} (skala 1–5)<br>Tercapai jika total skor ≥ 61 dari 100`,
      },
      {
        value: 'persentase',
        title: 'Persentase',
        desc: 'Daftar indikator — siswa tercapai jika ≥ 75% indikator terpenuhi.',
        example: `8 indikator untuk ${judul}<br>Tercapai jika ≥ 6 dari 8 indikator terpenuhi (75%)`,
      },
    ];

    overlay.innerHTML = `
<div class="rp-kktp-modal">
  <div class="rp-kktp-modal-header">
    <div class="rp-kktp-modal-title">Pilih Pendekatan KKTP</div>
    <div class="rp-kktp-modal-tp">TP: ${judul}</div>
  </div>
  <div class="rp-kktp-grid">
    ${opsi.map(o => `
    <div class="rp-kktp-option" data-value="${o.value}">
      <div class="rp-kktp-option-title">${o.title}</div>
      <div class="rp-kktp-option-desc">${o.desc}</div>
      <div class="rp-kktp-option-example">${o.example}</div>
    </div>`).join('')}
  </div>
  <div class="rp-kktp-modal-footer">
    ${btnSecondary('rp-kktp-batal','Batal')}
    ${btnPrimary('rp-kktp-lanjut','Lanjut →')}
  </div>
</div>`;

    document.body.appendChild(overlay);

    const btnLanjut = document.getElementById('rp-kktp-lanjut');
    if (btnLanjut) btnLanjut.disabled = true;

    overlay.querySelectorAll('.rp-kktp-option').forEach(opt => {
      opt.addEventListener('click', () => {
        overlay.querySelectorAll('.rp-kktp-option').forEach(o => {
          o.classList.remove('rp-kktp-selected');
        });
        opt.classList.add('rp-kktp-selected');
        if (btnLanjut) btnLanjut.disabled = false;
      });
    });

    document.getElementById('rp-kktp-batal')?.addEventListener('click', () => {
      overlay.remove();
    });

    btnLanjut?.addEventListener('click', () => {
      const selected = overlay.querySelector('.rp-kktp-option.rp-kktp-selected');
      if (!selected) return;
      const nilai = selected.dataset.value;
      overlay.remove();
      onConfirm(nilai);
    });

    overlay.addEventListener('click', e => {
      if (e.target === overlay) overlay.remove();
    });
  }

  function renderStep4(list) {
    cleanupAllDropdowns();
    _step = 4;
    renderStepBar();
    const body = el('rp-body');
    if (!body) return;

    const cards = list.map((tp, i) => `
<div class="rp-atp-card" data-idx="${i}">
  <div class="rp-atp-card-header">
    <div class="rp-atp-card-num">${tp.urutan || i+1}</div>
    <div class="rp-atp-card-judul">${esc(tp.judul)}</div>
  </div>
  <div class="rp-atp-card-desc">${esc(tp.deskripsi)}</div>
  <div class="rp-atp-card-meta">Elemen: ${esc(tp.elemen_cp||'-')} · Estimasi: ${esc(String(tp.estimasi_jp||'-'))} JP${tp.catatan ? ' · ' + esc(tp.catatan) : ''}</div>
  <div class="rp-atp-edit-wrap">
    <label class="rp-q-label" style="font-size:var(--fs-caption);margin-bottom:var(--space-xs);">Edit judul TP (opsional):</label>
    <input type="text" class="rp-atp-edit-input" value="${esc(tp.judul)}">
  </div>
  <div class="rp-atp-card-action">
    <button type="button" class="rp-btn-rancang-tp" style="min-height:var(--btn-h);background:transparent;color:var(--gold);border:1.5px solid var(--gold-border);font-size:var(--fs-ui);padding:0 var(--btn-px);border-radius:var(--btn-r);cursor:pointer;transition:background 150ms;">Rancang RPM →</button>
  </div>
</div>`).join('');

    const atpSudahSimpan = _dokumen.some(d => d.jenis === 'TP');

    body.innerHTML = `
<div class="rp-block">
  <div class="rp-block-title">Draft Alur Tujuan Pembelajaran</div>
  <p style="font-size:var(--fs-caption);color:var(--text-secondary);margin-bottom:var(--space-md);">Pilih satu TP yang ingin dirancang detail. Edit judul jika perlu setelah memilih.</p>
  <div class="rp-atp-list">${cards}</div>
  <div id="rp-atp-error" class="error-msg" style="display:none;"></div>
<div class="rp-save-row" style="margin-top:var(--space-md);">
  <button type="button" class="rp-btn-simpan" id="rp-btn-simpan-atp"
    ${atpSudahSimpan ? 'disabled style="background:var(--success,#2d6a4f);cursor:default;"' : ''}>
    ${atpSudahSimpan ? '✓ Snapshot tersimpan' : (_durableAtp ? '💾 Simpan snapshot ATP' : '💾 Simpan ATP')}
  </button>
  <span class="rp-identitas-status" id="rp-atp-simpan-status"></span>
</div>
<div class="rp-nav-row" style="justify-content:space-between;margin-top:var(--space-md);">
  ${btnSecondary('rp-btn-back4','← Kembali')}
</div>
</div>`;

    body.querySelectorAll('.rp-btn-rancang-tp').forEach(btn => {
      btn.addEventListener('click', async e => {
        e.stopPropagation();
        const card = btn.closest('.rp-atp-card');
        const idx = parseInt(card.dataset.idx);
        let tp = { ..._atpList[idx] };
        const editedJudul = card.querySelector('.rp-atp-edit-input')?.value.trim();
        if (editedJudul && editedJudul !== tp.judul) {
          try {
            const revised = await SipApi.phase2aPlanning({ action:'revise_tp', classroom_id:_cId,
              teaching_context_id:_teachingContext?.id, tp, judul:editedJudul });
            _durableAtp = { atp_id: revised.atp_id, atp_revision_id: revised.atp_revision_id };
            _atpList = revised.tp_list || _atpList;
            tp = { ...(_atpList.find(x => x.id === tp.id) || tp) };
          } catch (err) { return showError('rp-atp-error','Gagal menyimpan revisi TP: '+(err.message||'Coba lagi.')); }
        }
        showKktpModal(tp, (pendekatan_kktp) => {
          tp.pendekatan_kktp = pendekatan_kktp;
          _ans.tp_terpilih = tp;
          showError('rp-atp-error', '');
          _step = 5;
          saveRpState();
          renderStep5();
        });
      });
    });

    el('rp-btn-back4').addEventListener('click', () => { _step = 3; renderStep3B(); });

    // Simpan ATP
    el('rp-btn-simpan-atp')?.addEventListener('click', async () => {
      const btn    = el('rp-btn-simpan-atp');
      const status = el('rp-atp-simpan-status');
      if (!_atpList.length || btn?.disabled) return;
      btn.disabled = true;
      btn.textContent = 'Menyimpan…';
      try {
        const judul  = `ATP — ${_ans.mapel} ${(_ans.fase || '').replace(/_/g,' ').toUpperCase()}`.trim();
        const konten = { atp: _atpList, mapel: _ans.mapel, fase: _ans.fase, jenjang: _ans.jenjang };
        const doc = await SipApi.simpanRancangDokumen(_cId, 'TP', judul, konten, null);
        _dokumen = [doc, ..._dokumen.filter(d => d.jenis !== 'TP')];
        btn.textContent = '✓ Tersimpan';
        btn.style.background = 'var(--success,#2d6a4f)';
        btn.style.cursor = 'default';
        btn.disabled = true;
        if (status) status.textContent = '';
      } catch (e) {
        console.error('[rancang] simpan ATP gagal:', e);
        btn.disabled = false;
        btn.textContent = '💾 Simpan ATP';
        if (status) status.textContent = '✗ Gagal';
      }
    });
  }

  // ─── Step 5 — Konteks Kelas ─────────────────────────────────────────────────

  function renderStep5() {
    cleanupAllDropdowns();
    _step = 5;
    renderStepBar();
    const body = el('rp-body');
    if (!body) return;
    const kk = _ans.konteks_kelas || {};
    const savedFasilitas  = Array.isArray(kk.fasilitas)           ? kk.fasilitas           : [];
    const savedKendala    = Array.isArray(kk.kendala)             ? kk.kendala             : [];
    const savedBatasan    = Array.isArray(kk.batasan_kondisi)     ? kk.batasan_kondisi     : [];
    const savedDihindari  = Array.isArray(kk.aktivitas_dihindari) ? kk.aktivitas_dihindari : [];
    const savedMateri     = Array.isArray(kk.materi_cetak)        ? kk.materi_cetak        : [];

    function makeCheckList(prefix, opsiArray, savedArr, placeholder) {
      const items = opsiArray.map(nama => {
        const checked = savedArr.includes(nama);
        return `<label class="rp-elemen-check${checked ? ' checked' : ''}">
  <input type="checkbox" value="${esc(nama)}"${checked ? ' checked' : ''}>
  <span>${esc(nama)}</span>
</label>`;
      }).join('');
      return `<div class="rp-elemen-list" id="${prefix}-list">
  ${items}
  <label class="rp-elemen-check" id="${prefix}-lainnya-wrap" style="display:none;">
    <input type="checkbox" id="${prefix}-lainnya-cb" value="__lainnya__">
    <span>Lainnya</span>
  </label>
</div>
<input type="text" id="${prefix}-lainnya-txt" class="rp-select"
  placeholder="${placeholder}"
  style="margin-top:var(--space-xs);display:none;">`;
    }

    body.innerHTML = `
<div class="rp-block">
  <div class="rp-block-title">Konteks Realistis Kelas</div>
  <p style="font-size:var(--fs-caption);color:var(--text-secondary);margin-bottom:var(--space-md);">Informasi ini membantu AI menyesuaikan rencana dengan kondisi nyata kelas Anda.</p>

  <div class="rp-block-subtitle">Kondisi Fisik</div>
  <div class="rp-q">
    <label class="rp-q-label" style="color:var(--gold)">K-1. Jumlah siswa di kelas *</label>
    ${makeCustomDropdown('rp-k1', ['< 20 siswa','20–30 siswa','31–40 siswa','> 40 siswa'], kk.jumlah_siswa||'')}
  </div>
  <div class="rp-q">
    <label class="rp-q-label" style="color:var(--gold)">K-3. Fasilitas yang tersedia (bisa lebih dari satu) *</label>
    ${makeCheckList('rp-k3', ['Proyektor/LCD','Laptop','Speaker','Lab komputer','Koneksi WiFi','Printer','Lembar kerja cetak','Tidak ada fasilitas khusus'], savedFasilitas, 'Contoh: papan tulis digital, TV layar besar')}
  </div>
  <div class="rp-q">
    <label class="rp-q-label" style="color:var(--gold)">K-4. Situasi HP &amp; kebijakan sekolah *</label>
    ${makeCustomDropdown('rp-k4', ['HP dilarang','HP boleh untuk belajar','HP bebas','Tidak ada kebijakan jelas','Sebagian besar tidak punya HP'], kk.situasi_hp||'')}
  </div>
  <div class="rp-q">
    <label class="rp-q-label" style="color:var(--gold)">K-5. Akses internet di kelas *</label>
    ${makeCustomDropdown('rp-k5', ['Tidak ada internet','Kadang ada, tidak stabil','Ada WiFi sekolah (stabil)'], kk.akses_internet||'')}
  </div>

  <div class="rp-block-subtitle">Kondisi Siswa</div>
  <div class="rp-q">
    <label class="rp-q-label" style="color:var(--gold)">K-2. Apakah ada siswa yang membutuhkan perhatian khusus di kelas Anda? *</label>
    ${makeCustomDropdown('rp-k2', ['Tidak ada','Ada'], kk.abk||'')}
    <div class="rp-cond-input" id="rp-k2-cond">
      <textarea id="rp-k2-abk-desc" class="rp-textarea" placeholder="Ceritakan singkat — misalnya: ada siswa yang sulit fokus, kesulitan membaca, atau kondisi lain yang perlu dipertimbangkan" style="margin-top:var(--space-xs);">${esc(kk.abk_desc||'')}</textarea>
    </div>
  </div>
  <div class="rp-q">
    <label class="rp-q-label" style="color:var(--gold)">K-8. Kendala kelas yang sering muncul (bisa lebih dari satu)</label>
    ${makeCheckList('rp-k8', ['Siswa sering ngobrol','Perhatian mudah teralih','Perbedaan kemampuan sangat lebar','Banyak siswa datang terlambat','Ketidakhadiran tinggi','Konflik antar siswa','Motivasi sangat rendah','Ruang kelas sempit/panas'], savedKendala, 'Contoh: siswa sering tidak membawa buku')}
  </div>

  <div class="rp-block-subtitle">Batasan untuk AI</div>
  <div class="rp-q">
    <label class="rp-q-label" style="color:var(--gold)">K-7a. Apa yang tidak bisa dilakukan di kelas Anda karena kondisi atau kebijakan? (bisa lebih dari satu)</label>
    ${makeCheckList('rp-k7a', ['Ruang kelas tidak memungkinkan siswa bergerak bebas','Siswa tidak bisa keluar kelas','Tidak bisa cetak atau bagikan lembar kerja','Tidak bisa dibagi kelompok (ruang terlalu sempit atau jumlah terlalu banyak)'], savedBatasan, 'Jelaskan batasan kondisi lainnya')}
  </div>
  <div class="rp-q">
    <label class="rp-q-label" style="color:var(--gold)">K-7b. Aktivitas apa yang ingin Anda hindari? (bisa lebih dari satu)</label>
    ${makeCheckList('rp-k7b', ['Ceramah satu arah > 10 menit','Hafalan/drill tanpa konteks','Tugas yang butuh bahan dibeli siswa','Kompetisi antar siswa','Aktivitas yang mempermalukan siswa di depan kelas'], savedDihindari, 'Jelaskan aktivitas yang ingin dihindari')}
  </div>

  <div class="rp-block-subtitle">Konteks Tambahan</div>
  <div class="rp-q">
    <label class="rp-q-label" style="color:var(--gold)">K-6. Materi cetak yang tersedia (bisa lebih dari satu)</label>
    ${makeCheckList('rp-k6', ['Buku teks pemerintah (BSE)','LKS dari sekolah','Modul buatan guru','Bahan dari DUDI','Tidak ada bahan cetak'], savedMateri, 'Contoh: modul khusus dari DUDI')}
  </div>
  <div class="rp-q">
    <label class="rp-q-label" style="color:var(--gold)" for="rp-k9-daerah">K-9. Daerah mengajar <span class="opsional">(opsional)</span></label>
    <input type="text" id="rp-k9-daerah" class="rp-input" placeholder="Contoh: Ujungbatu, Riau, Indonesia" value="${esc(kk.daerah || _profil?.kota || '')}">
  </div>

  <div id="rp-step5-error" class="error-msg" style="display:none;"></div>
  <div class="rp-action-row">
    ${btnSecondary('rp-btn-back5','← Kembali ke ATP')}
    ${btnPrimary('rp-btn-gen-rencana','Simpan konteks & atur pertemuan')}
  </div>
</div>`;

    ['rp-k1','rp-k4','rp-k5'].forEach(id => wireCustomDropdown(id));

    wireCustomDropdown('rp-k2', val => {
      const cond = el('rp-k2-cond');
      if (cond) cond.classList.toggle('visible', val === 'Ada');
    });
    if (kk.abk === 'Ada') el('rp-k2-cond')?.classList.add('visible');

    // Wire checkbox Lainnya untuk semua multi (K-3, K-8, K-7a, K-7b, K-6)
    ['rp-k3','rp-k8','rp-k7a','rp-k7b','rp-k6'].forEach(prefix => {
      const list        = el(prefix + '-list');
      const lainnyaCb   = el(prefix + '-lainnya-cb');
      const lainnyaTxt  = el(prefix + '-lainnya-txt');
      const lainnyaWrap = el(prefix + '-lainnya-wrap');
      if (!list) return;
      if (lainnyaWrap) lainnyaWrap.style.display = 'flex';
      list.addEventListener('change', e => {
        const cb = e.target;
        if (!cb || cb.type !== 'checkbox') return;
        cb.closest('.rp-elemen-check')?.classList.toggle('checked', cb.checked);
        if (cb === lainnyaCb && lainnyaTxt) {
          lainnyaTxt.style.display = cb.checked ? 'block' : 'none';
          if (!cb.checked) lainnyaTxt.value = '';
        }
      });
    });

    el('rp-btn-back5').addEventListener('click', () => { _step = 4; renderStep4(_atpList); });
    el('rp-btn-gen-rencana').addEventListener('click', handleStep5Submit);
  }

  async function handleStep5Submit() {
    if (_genRencana) return;
    showError('rp-step5-error','');
    function getCheckList(prefix) {
      return [...(el(prefix + '-list')?.querySelectorAll('input[type="checkbox"]:checked') || [])]
        .map(cb => cb.value === '__lainnya__'
          ? (el(prefix + '-lainnya-txt')?.value || '').trim() || 'Lainnya'
          : cb.value)
        .filter(Boolean);
    }

    _ans.konteks_kelas = {
      jumlah_siswa:        getCustomSelVal('rp-k1'),
      fasilitas:           getCheckList('rp-k3'),
      situasi_hp:          getCustomSelVal('rp-k4'),
      akses_internet:      getCustomSelVal('rp-k5'),
      abk:                 getCustomSelVal('rp-k2'),
      abk_desc:            (el('rp-k2-abk-desc')?.value || '').trim(),
      kendala:             getCheckList('rp-k8'),
      batasan_kondisi:     getCheckList('rp-k7a'),
      aktivitas_dihindari: getCheckList('rp-k7b'),
      materi_cetak:        getCheckList('rp-k6'),
      daerah:              (el('rp-k9-daerah')?.value || '').trim(),
    };
    saveRpState();

    _genRencana = true;
    const btn = el('rp-btn-gen-rencana');
    if (btn) { btn.disabled = true; btn.textContent = 'Menyimpan konteks…'; }

    try {
      if (!_teachingContext) {
        _teachingContext = await SipApi.getTeachingContextForClassroom(_cId, _ans.mapelKey);
      }
      if (!_teachingContext?.id || !_ans.tp_terpilih?.id || !_ans.tp_terpilih?.revision_id) {
        throw new Error('Stable TP atau Teaching Context belum tersedia. Generate ATP kembali.');
      }
      const semester = Number(_ans.tp_terpilih.semester);
      const saved = await SipApi.phase2aPlanning({
        action: 'save_planning_context',
        classroom_id: _cId,
        teaching_context_id: _teachingContext.id,
        tp_id: _ans.tp_terpilih.id,
        tp_revision_id: _ans.tp_terpilih.revision_id,
        academic_year: _profil?.tahun_ajaran,
        semester,
        teacher_intent: _ans.niat_guru,
        preferences: _ans.preferensi,
        class_context: _ans.konteks_kelas,
        smk_context: _ans.smk,
      });
      _planningContext = saved.planning_context;
      _jpPolicy = saved.jp_policy;
      saveRpState();
      renderMeetingAllocation();
    } catch (err) {
      showError('rp-step5-error', 'Gagal menyimpan konteks perencanaan: ' + (err.message || 'Coba lagi.'));
      if (btn) { btn.disabled = false; btn.textContent = 'Simpan konteks & atur pertemuan'; }
    } finally {
      _genRencana = false;
    }
  }

  function proposedMeetingJp(total, weekly) {
    const chunk = Math.max(1, Math.min(Number(weekly) || 2, total));
    const rows = [];
    let remaining = total;
    while (remaining > 0) { rows.push(Math.min(chunk, remaining)); remaining -= chunk; }
    return rows;
  }

  function renderMeetingAllocation() {
    const body = el('rp-body');
    if (!body || !_planningContext) return;
    const total = Number(_ans.tp_terpilih?.estimasi_jp) || 2;
    const proposed = proposedMeetingJp(total, _ans.preferensi?.jp_per_minggu);
    const effective = Number(_jpPolicy?.effective_jp_minutes) || 45;
    body.innerHTML = `<div class="rp-block">
      <div class="rp-block-title">Konfirmasi Alokasi Pertemuan</div>
      <p class="rp-block-subtitle">Estimasi TP: ${total} JP · Usulan ${proposed.length} pertemuan · ${effective} menit/JP</p>
      <div class="rp-q"><label class="rp-q-label">Durasi efektif per JP</label>
        <input id="rp-effective-jp" class="rp-input" type="number" min="1" max="180" value="${effective}" style="max-width:8rem"> menit
        <input id="rp-jp-override-reason" class="rp-input" type="text" placeholder="Alasan kebijakan sekolah (wajib jika berbeda dari standar)" style="margin-top:var(--space-xs)">
      </div>
      <div id="rp-allocation-list">${proposed.map((jp,i)=>`<div class="rp-q" style="display:flex;align-items:center;gap:var(--space-sm)">
        <label class="rp-q-label" style="min-width:8rem">Pertemuan ${i+1}</label>
        <input class="rp-input rp-allocation-jp" type="number" min="1" max="20" value="${jp}" style="max-width:7rem"> <span>JP (${jp*effective} menit)</span>
      </div>`).join('')}</div>
      <div id="rp-allocation-error" class="error-msg" style="display:none"></div>
      <div class="rp-action-row">${btnSecondary('rp-btn-back-allocation','← Ubah konteks')}${btnPrimary('rp-btn-confirm-allocation','Konfirmasi alokasi')}</div>
    </div>`;
    el('rp-btn-back-allocation')?.addEventListener('click', renderStep5);
    el('rp-btn-confirm-allocation')?.addEventListener('click', confirmMeetingAllocation);
    body.querySelectorAll('.rp-allocation-jp').forEach(input => input.addEventListener('input', () => {
      const jp = Number(input.value) || 0;
      const label = input.nextElementSibling;
      const currentMinutes = Number(el('rp-effective-jp')?.value) || effective;
      if (label) label.textContent = `JP (${jp * currentMinutes} menit)`;
    }));
    el('rp-effective-jp')?.addEventListener('input', () => body.querySelectorAll('.rp-allocation-jp').forEach(input => {
      const label=input.nextElementSibling, minutes=Number(el('rp-effective-jp')?.value)||0;
      if(label) label.textContent=`JP (${(Number(input.value)||0)*minutes} menit)`;
    }));
  }

  async function confirmMeetingAllocation() {
    if (_confirmingAllocation) return;
    _confirmingAllocation = true;
    try {
      const btn = el('rp-btn-confirm-allocation');
      const jpValues = [...document.querySelectorAll('.rp-allocation-jp')].map(x => Number(x.value));
      const effective = Number(el('rp-effective-jp')?.value);
      const standard = Number(_jpPolicy?.standard_jp_minutes) || effective;
      const overrideReason = (el('rp-jp-override-reason')?.value || '').trim();
      if (!jpValues.length || jpValues.some(x => !Number.isInteger(x) || x <= 0)) {
        return showError('rp-allocation-error','Setiap pertemuan harus memiliki JP positif.');
      }
      if (!Number.isInteger(effective) || effective <= 0 || (effective !== standard && !overrideReason)) {
        return showError('rp-allocation-error','Isi durasi JP yang valid dan alasan jika berbeda dari standar.');
      }
      btn.disabled = true; btn.textContent = 'Mengonfirmasi…';
      try {
        if (effective !== Number(_jpPolicy?.effective_jp_minutes)) {
          _jpPolicy = await SipApi.phase2aPlanning({ action:'set_jp_policy', classroom_id:_cId,
            teaching_context_id:_teachingContext.id, effective_jp_minutes:effective, override_reason:overrideReason });
        }
        await SipApi.phase2aPlanning({
          action: 'confirm_allocation', classroom_id: _cId, teaching_context_id: _teachingContext.id,
          planning_context_id: _planningContext.id, proposal_source: 'ATP_ESTIMATE',
          meetings: jpValues.map((jp,i)=>({meeting_no:i+1,jp})),
        });
        await enterPhase2CPipeline();
      } catch (err) {
        showError('rp-allocation-error','Gagal mengonfirmasi alokasi: '+(err.message||'Coba lagi.'));
        btn.disabled=false; btn.textContent='Konfirmasi alokasi';
      }
    } finally {
      _confirmingAllocation = false;
    }
  }

  async function generateLegacyRencanaAfterAllocation() {
    const result = await callAI({
        mode: 'rencana',
        konteks: { mapel: _ans.mapel, jenjang: _ans.jenjang, fase: _ans.fase, jp_per_minggu: _ans.preferensi?.jp_per_minggu, kelas: _profil?.kelas || '' },
        smk: _ans.smk ? { ..._ans.smk, bidang_keahlian: _ans.bidangKeahlian || null, program_keahlian: _ans.programKeahlian || null } : null,
        niat_guru: _ans.niat_guru,
        preferensi: _ans.preferensi,
        tp_terpilih: _ans.tp_terpilih,
        konteks_kelas: _ans.konteks_kelas,
        semester_list: _profil?.semester_list || [],
      });
    _step = 6;
    renderStep6(result);
  }

  // ─── Phase 2C Pipeline ──────────────────────────────────────────────────────

  function phase2cPayload(extra) {
    return {
      classroom_id: _cId,
      teaching_context_id: _teachingContext?.id || '',
      planning_context_id: _planningContext?.id || '',
      ...extra,
    };
  }

  // Entry point after allocation confirmed OR from resume
  async function enterPhase2CPipeline() {
    if (_enteringPipeline) return;
    _enteringPipeline = true;
    try {
      _step = 6;
      renderStepBar();
      const body = el('rp-body');
      if (!body) return;
      body.innerHTML = `<div class="rp-block"><div class="rp-block-title">Memuat status pipeline…</div></div>`;
      try {
        _phase2cState = await SipApi.phase2cGenerate(phase2cPayload({ action: 'get_pipeline_state' }));
        saveRpState();
        renderStep6Phase2C();
      } catch (err) {
        body.innerHTML = `<div class="rp-block">
          <div class="rp-block-title" style="color:var(--error);">Gagal memuat pipeline</div>
          <p style="font-size:var(--fs-caption);color:var(--text-secondary);">${esc(err.message || 'Coba lagi.')}</p>
          <button class="btn btn-primary" id="rp2c-retry-load">Coba lagi</button>
        </div>`;
        el('rp2c-retry-load')?.addEventListener('click', enterPhase2CPipeline);
      }
    } finally {
      _enteringPipeline = false;
    }
  }

  function renderStep6Phase2C() {
    const s = _phase2cState;
    // State dari localStorage ditandai stale — refresh dari server dulu
    if (!s || s._stale) { enterPhase2CPipeline(); return; }
    const ctxConfirmed = s.context_spec?.confirmed;
    const asmConfirmed = s.assessment_spec?.lifecycle_status === 'CONFIRMED';
    const matUsable    = s.material_spec?.usable === true;
    // Any meeting has been generated (has artifact_id) → resume meeting pipeline view
    const anyMeetingGenerated = (s.meeting_plans ?? []).some(m => !!m.artifact_id);
    if (!ctxConfirmed) {
      renderContextCheckpoint();
    } else if (!asmConfirmed) {
      renderAssessmentCheckpoint();
    } else if (!matUsable) {
      enterMaterialPipeline();
    } else if (anyMeetingGenerated) {
      renderMeetingPipeline();
    } else {
      renderMaterialSpec();
    }
  }

  // ── Checkpoint 1: Context Specification ────────────────────────────────────
  function renderContextCheckpoint() {
    cleanupAllDropdowns();
    const body = el('rp-body');
    if (!body) return;
    const s = _phase2cState;
    const ctx = s?.context_spec;
    const alloc = s?.meeting_allocation;
    const tp = _ans.tp_terpilih;

    const allocHtml = alloc?.items?.length
      ? alloc.items.map(item =>
          `<div style="display:flex;gap:var(--space-sm);align-items:center;padding:var(--space-xs) 0;
            border-bottom:1px solid var(--border);font-size:var(--fs-caption);">
            <span style="color:var(--text-muted);min-width:7rem;">Pertemuan ${item.meeting_no}</span>
            <span style="color:var(--text-primary);font-weight:var(--fw-medium);">${item.jp} JP</span>
            <span style="color:var(--text-muted);">${item.duration_minutes} menit</span>
          </div>`).join('')
      : '<p style="color:var(--text-muted);font-size:var(--fs-caption);">Alokasi belum tersedia.</p>';

    const hasCtx = !!ctx?.artifact_id;
    const ctxUsable = ctx?.usable === true;
    const ctxContent = ctx?.content;

    // Candidates for selection
    const candidates = ctx?.candidates?.filter(c => c.version_id !== ctx?.selected_version_id) ?? [];

    let ctxBodyHtml = '';
    if (!hasCtx) {
      ctxBodyHtml = `<div style="color:var(--text-muted);font-size:var(--fs-caption);padding:var(--space-md) 0;">
        Context Specification belum dibuat. Klik "Generate Context" untuk memulai.
      </div>`;
    } else if (!ctxUsable) {
      ctxBodyHtml = `<div style="color:var(--warning,#f59e0b);font-size:var(--fs-caption);padding:var(--space-md) 0;">
        Context Specification perlu diperbarui.
      </div>`;
    } else {
      ctxBodyHtml = renderContextDecisions(ctxContent);
    }

    const candidatesHtml = candidates.length ? `
<div style="margin-top:var(--space-md);padding:var(--space-sm);background:var(--surface-1);border-radius:var(--radius-md);">
  <div style="font-size:var(--fs-caption);font-weight:var(--fw-semibold);color:var(--text-muted);margin-bottom:var(--space-xs);">
    Kandidat baru tersedia — pilih untuk menggantikan versi aktif:
  </div>
  ${candidates.map(c => `
    <div style="display:flex;align-items:center;gap:var(--space-sm);padding:var(--space-xs) 0;border-bottom:1px solid var(--border);">
      <span style="font-size:var(--fs-caption);color:var(--text-secondary);">v${c.version_no} (${c.origin === 'TEACHER' ? 'Edit guru' : 'AI'})</span>
      <button class="btn btn-sm rp2c-select-ctx-candidate" data-vid="${esc(c.version_id)}" style="font-size:var(--fs-badge);">
        Gunakan kandidat ini
      </button>
    </div>`).join('')}
</div>` : '';

    body.innerHTML = `
<div class="rp-block">
  <div class="rp-block-title">Step 6 — Generate RPM (Checkpoint 1/2)</div>
  <div style="font-size:var(--fs-caption);color:var(--text-muted);">TP: ${esc(tp?.judul || '-')}</div>
</div>

<div class="rp-block" style="margin-bottom:var(--space-sm);">
  <div style="font-weight:var(--fw-semibold);font-size:var(--fs-ui);color:var(--text-primary);margin-bottom:var(--space-sm);">
    Alokasi Pertemuan yang Dikonfirmasi
  </div>
  ${allocHtml}
</div>

<div class="rp-block">
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:var(--space-sm);">
    <div style="font-weight:var(--fw-semibold);font-size:var(--fs-ui);color:var(--text-primary);">
      Checkpoint 1 — Context Specification
      ${ctx?.lifecycle_status === 'CONFIRMED'
        ? '<span style="color:var(--success,#4caf50);font-size:var(--fs-badge);margin-left:var(--space-xs);">✓ Dikonfirmasi</span>'
        : ctxUsable
          ? '<span style="color:var(--gold);font-size:var(--fs-badge);margin-left:var(--space-xs);">Siap dikonfirmasi</span>'
          : '<span style="color:var(--text-muted);font-size:var(--fs-badge);margin-left:var(--space-xs);">Belum dibuat</span>'}
    </div>
    ${ctx?.origin === 'TEACHER' ? '<span style="font-size:var(--fs-badge);color:var(--gold);">✏ Diedit guru</span>' : ''}
  </div>

  <div id="rp2c-ctx-body">${ctxBodyHtml}</div>
  ${candidatesHtml}

  <div id="rp2c-ctx-edit-area" style="display:none;"></div>
  <div id="rp2c-ctx-error" class="error-msg" style="display:none;"></div>

  <div class="rp-action-row" style="flex-wrap:wrap;gap:var(--space-sm);">
    ${!hasCtx
      ? `${btnPrimary('rp2c-btn-gen-ctx', 'Generate Context')}`
      : `${btnSecondary('rp2c-btn-regen-ctx', '⟳ Regenerate')}
         ${ctxUsable && !el('rp2c-ctx-edit-area')?.style?.display !== 'none'
           ? `${btnSecondary('rp2c-btn-edit-ctx', '✏ Edit')}` : ''}
         ${ctxUsable && ctx?.lifecycle_status !== 'CONFIRMED'
           ? `${btnPrimary('rp2c-btn-confirm-ctx', 'Konfirmasi & Lanjut →')}` : ''}
         ${ctx?.lifecycle_status === 'CONFIRMED'
           ? `${btnPrimary('rp2c-btn-to-asm', 'Lanjut ke Asesmen →')}` : ''}`
    }
  </div>
</div>`;

    // Bind events
    el('rp2c-btn-gen-ctx')?.addEventListener('click', () => runGenerateContext(false));
    el('rp2c-btn-regen-ctx')?.addEventListener('click', () => runGenerateContext(true));
    el('rp2c-btn-edit-ctx')?.addEventListener('click', () => showContextEditor(ctx?.content));
    el('rp2c-btn-confirm-ctx')?.addEventListener('click', () => runConfirmContext());
    el('rp2c-btn-to-asm')?.addEventListener('click', () => renderAssessmentCheckpoint());

    body.querySelectorAll('.rp2c-select-ctx-candidate').forEach(btn => {
      btn.addEventListener('click', async () => {
        const vid = btn.dataset.vid;
        if (!vid) return;
        btn.disabled = true; btn.textContent = 'Memilih…';
        try {
          _phase2cState = await SipApi.phase2cGenerate(phase2cPayload({
            action: 'select_context_candidate', version_id: vid,
            selection_revision: _phase2cState?.context_spec?.selection_revision ?? 0,
          }));
          saveRpState(); renderContextCheckpoint();
        } catch (e) {
          btn.disabled = false; btn.textContent = 'Gunakan kandidat ini';
          showError('rp2c-ctx-error', e.message || 'Gagal memilih kandidat.');
        }
      });
    });
  }

  function renderContextDecisions(content) {
    if (!content?.context_decisions?.length) return '<p style="color:var(--text-muted);font-size:var(--fs-caption);">Belum ada data.</p>';
    return content.context_decisions.map(d => `
<div style="border:1px solid var(--border);border-radius:var(--radius-md);padding:var(--space-sm);margin-bottom:var(--space-sm);">
  <div style="font-size:var(--fs-badge);color:var(--text-muted);margin-bottom:var(--space-xs);">${esc(d.id || '')} · ${esc(d.source || '')}</div>
  <div style="font-size:var(--fs-caption);color:var(--text-secondary);margin-bottom:2px;"><strong>Raw:</strong> ${esc(d.raw || '')}</div>
  <div style="font-size:var(--fs-caption);color:var(--text-secondary);margin-bottom:2px;"><strong>Interpretasi:</strong> ${esc(d.interpretation || '')}</div>
  <div style="font-size:var(--fs-caption);color:var(--text-secondary);margin-bottom:var(--space-xs);"><strong>Implikasi:</strong> ${esc(d.implication || '')}</div>
  ${(d.prefer?.length || d.avoid?.length) ? `
  <div style="display:flex;gap:var(--space-sm);flex-wrap:wrap;">
    ${d.prefer?.length ? `<div style="font-size:var(--fs-badge);color:var(--success,#4caf50);">✓ ${d.prefer.map(esc).join('; ')}</div>` : ''}
    ${d.avoid?.length ? `<div style="font-size:var(--fs-badge);color:var(--error,#ef4444);">✗ ${d.avoid.map(esc).join('; ')}</div>` : ''}
  </div>` : ''}
</div>`).join('') +
    (content.constraints?.length ? `<div style="margin-top:var(--space-sm);padding:var(--space-sm);background:var(--surface-1);border-radius:var(--radius-sm);">
      <div style="font-size:var(--fs-badge);font-weight:var(--fw-semibold);color:var(--text-muted);">Kendala:</div>
      ${content.constraints.map(c => `<div style="font-size:var(--fs-caption);color:var(--text-secondary);">• ${esc(c)}</div>`).join('')}
    </div>` : '');
  }

  function showContextEditor(content) {
    const editArea = el('rp2c-ctx-edit-area');
    if (!editArea) return;
    const json = JSON.stringify(content ?? {}, null, 2);
    editArea.style.display = 'block';
    editArea.innerHTML = `
<div style="margin-top:var(--space-md);">
  <div style="font-size:var(--fs-caption);color:var(--text-muted);margin-bottom:var(--space-xs);">
    Edit JSON Context Specification. Harus tetap mengikuti schema.
  </div>
  <textarea id="rp2c-ctx-editor" rows="18"
    style="width:100%;font-family:monospace;font-size:11px;padding:var(--space-sm);
    border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--surface-1);
    color:var(--text-primary);resize:vertical;">${esc(json)}</textarea>
  <div class="rp-action-row" style="margin-top:var(--space-sm);">
    ${btnSecondary('rp2c-btn-cancel-edit-ctx', 'Batal')}
    ${btnPrimary('rp2c-btn-save-edit-ctx', 'Simpan Edit')}
  </div>
</div>`;
    el('rp2c-btn-cancel-edit-ctx')?.addEventListener('click', () => {
      editArea.style.display = 'none'; editArea.innerHTML = '';
    });
    el('rp2c-btn-save-edit-ctx')?.addEventListener('click', () => runSaveContextEdit());
  }

  async function runGenerateContext(isRegenerate) {
    const body = el('rp-body');
    if (!body) return;
    const action = isRegenerate ? 'regenerate_context_spec' : 'generate_context_spec';
    const btnId = isRegenerate ? 'rp2c-btn-regen-ctx' : 'rp2c-btn-gen-ctx';
    const btn = el(btnId);
    if (btn) { btn.disabled = true; btn.textContent = 'Generating…'; }
    showError('rp2c-ctx-error', '');
    // Stable operation ID: generate once per intent, reuse on retry, clear on success.
    if (isRegenerate && !_ctxRegenOpId) _ctxRegenOpId = crypto.randomUUID();
    const extra = isRegenerate ? { action, client_operation_id: _ctxRegenOpId } : { action };
    try {
      _phase2cState = await SipApi.phase2cGenerate(phase2cPayload(extra));
      _ctxRegenOpId = null; // success — next click starts a new intent
      saveRpState(); renderContextCheckpoint();
    } catch (e) {
      // keep _ctxRegenOpId so a network retry sends the same operation ID
      if (btn) { btn.disabled = false; btn.textContent = isRegenerate ? '⟳ Regenerate' : 'Generate Context'; }
      showError('rp2c-ctx-error', e.message || 'Generate gagal. Coba lagi.');
    }
  }

  async function runSaveContextEdit() {
    const textarea = el('rp2c-ctx-editor');
    if (!textarea) return;
    let parsed;
    try { parsed = JSON.parse(textarea.value); }
    catch { showError('rp2c-ctx-error', 'JSON tidak valid. Perbaiki syntax dulu.'); return; }
    const btn = el('rp2c-btn-save-edit-ctx');
    if (btn) { btn.disabled = true; btn.textContent = 'Menyimpan…'; }
    try {
      _phase2cState = await SipApi.phase2cGenerate(phase2cPayload({
        action: 'save_context_spec_edit', content: parsed,
      }));
      saveRpState(); renderContextCheckpoint();
    } catch (e) {
      if (btn) { btn.disabled = false; btn.textContent = 'Simpan Edit'; }
      showError('rp2c-ctx-error', e.message || 'Simpan gagal.');
    }
  }

  async function runConfirmContext() {
    if (_confirmingCtx) return;
    _confirmingCtx = true;
    try {
      const ctx = _phase2cState?.context_spec;
      if (!ctx?.selected_version_id) return;
      const btn = el('rp2c-btn-confirm-ctx');
      if (btn) { btn.disabled = true; btn.textContent = 'Mengonfirmasi…'; }
      showError('rp2c-ctx-error', '');
      try {
        _phase2cState = await SipApi.phase2cGenerate(phase2cPayload({
          action: 'confirm_context_spec', version_id: ctx.selected_version_id,
        }));
        saveRpState(); renderAssessmentCheckpoint();
      } catch (e) {
        if (btn) { btn.disabled = false; btn.textContent = 'Konfirmasi & Lanjut →'; }
        showError('rp2c-ctx-error', e.message || 'Konfirmasi gagal.');
      }
    } finally {
      _confirmingCtx = false;
    }
  }

  // ── Checkpoint 2: Assessment Specification ─────────────────────────────────
  function renderAssessmentCheckpoint() {
    cleanupAllDropdowns();
    const body = el('rp-body');
    if (!body) return;
    const s = _phase2cState;
    const ctx = s?.context_spec;
    const asm = s?.assessment_spec;
    const tp = _ans.tp_terpilih;

    if (!ctx?.confirmed) {
      renderContextCheckpoint(); return;
    }

    const hasAsm = !!asm?.artifact_id;
    const asmUsable = asm?.usable === true;
    const asmConfirmed = asm?.lifecycle_status === 'CONFIRMED';

    const candidates = asm?.candidates?.filter(c => c.version_id !== asm?.selected_version_id) ?? [];

    let asmBodyHtml = '';
    if (!hasAsm) {
      asmBodyHtml = `<div style="color:var(--text-muted);font-size:var(--fs-caption);padding:var(--space-md) 0;">
        Assessment Specification belum dibuat. Klik "Generate Asesmen + KKTP".
      </div>`;
    } else if (!asmUsable) {
      asmBodyHtml = `<div style="color:var(--warning,#f59e0b);font-size:var(--fs-caption);padding:var(--space-md) 0;">
        Assessment Specification perlu diperbarui.
      </div>`;
    } else {
      asmBodyHtml = renderAssessmentContent(asm?.content);
    }

    const candidatesHtml = candidates.length ? `
<div style="margin-top:var(--space-md);padding:var(--space-sm);background:var(--surface-1);border-radius:var(--radius-md);">
  <div style="font-size:var(--fs-caption);font-weight:var(--fw-semibold);color:var(--text-muted);margin-bottom:var(--space-xs);">
    Kandidat baru tersedia:
  </div>
  ${candidates.map(c => `
    <div style="display:flex;align-items:center;gap:var(--space-sm);padding:var(--space-xs) 0;border-bottom:1px solid var(--border);">
      <span style="font-size:var(--fs-caption);color:var(--text-secondary);">v${c.version_no}</span>
      <button class="btn btn-sm rp2c-select-asm-candidate" data-vid="${esc(c.version_id)}" style="font-size:var(--fs-badge);">
        Gunakan kandidat ini
      </button>
    </div>`).join('')}
</div>` : '';

    body.innerHTML = `
<div class="rp-block">
  <div class="rp-block-title">Step 6 — Generate RPM (Checkpoint 2/2)</div>
  <div style="font-size:var(--fs-caption);color:var(--text-muted);">TP: ${esc(tp?.judul || '-')}</div>
</div>

<div class="rp-block" style="margin-bottom:var(--space-sm);">
  <div style="display:flex;align-items:center;justify-content:space-between;">
    <div style="font-weight:var(--fw-semibold);font-size:var(--fs-ui);color:var(--text-primary);">
      Checkpoint 1 — Context Specification
    </div>
    <span style="color:var(--success,#4caf50);font-size:var(--fs-badge);">✓ Dikonfirmasi</span>
  </div>
  <div style="font-size:var(--fs-caption);color:var(--text-muted);margin-top:2px;">v${ctx?.selected_version_no ?? 1} · ${ctx?.origin === 'TEACHER' ? 'Edit guru' : 'AI'}</div>
  <button class="btn btn-sm" id="rp2c-btn-back-to-ctx" style="margin-top:var(--space-xs);font-size:var(--fs-badge);">← Lihat Context</button>
</div>

<div class="rp-block">
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:var(--space-sm);">
    <div style="font-weight:var(--fw-semibold);font-size:var(--fs-ui);color:var(--text-primary);">
      Checkpoint 2 — Asesmen + KKTP
      ${asmConfirmed
        ? '<span style="color:var(--success,#4caf50);font-size:var(--fs-badge);margin-left:var(--space-xs);">✓ Dikonfirmasi</span>'
        : asmUsable
          ? '<span style="color:var(--gold);font-size:var(--fs-badge);margin-left:var(--space-xs);">Siap dikonfirmasi</span>'
          : '<span style="color:var(--text-muted);font-size:var(--fs-badge);margin-left:var(--space-xs);">Belum dibuat</span>'}
    </div>
    ${asm?.teacher_edited ? '<span style="font-size:var(--fs-badge);color:var(--gold);">✏ Diedit guru</span>' : ''}
  </div>

  <div id="rp2c-asm-body">${asmBodyHtml}</div>
  ${candidatesHtml}

  <div id="rp2c-asm-edit-area" style="display:none;"></div>
  <div id="rp2c-asm-error" class="error-msg" style="display:none;"></div>

  <div class="rp-action-row" style="flex-wrap:wrap;gap:var(--space-sm);">
    ${!hasAsm
      ? `${btnPrimary('rp2c-btn-gen-asm', 'Generate Asesmen + KKTP')}`
      : `${btnSecondary('rp2c-btn-regen-asm', '⟳ Regenerate')}
         ${asmUsable ? `${btnSecondary('rp2c-btn-edit-asm', '✏ Edit')}` : ''}
         ${asmUsable && !asmConfirmed ? `${btnPrimary('rp2c-btn-confirm-asm', 'Konfirmasi Checkpoint 2 ✓')}` : ''}
         ${asmConfirmed ? `<div style="padding:var(--space-sm);font-size:var(--fs-caption);color:var(--success,#4caf50);">Checkpoint 2 selesai. Tahap berikutnya (Material, Pertemuan, LKS) akan segera tersedia.</div>` : ''}`
    }
  </div>
</div>`;

    el('rp2c-btn-back-to-ctx')?.addEventListener('click', () => renderContextCheckpoint());
    el('rp2c-btn-gen-asm')?.addEventListener('click', () => runGenerateAssessment(false));
    el('rp2c-btn-regen-asm')?.addEventListener('click', () => runGenerateAssessment(true));
    el('rp2c-btn-edit-asm')?.addEventListener('click', () => showAssessmentEditor(asm?.content));
    el('rp2c-btn-confirm-asm')?.addEventListener('click', () => runConfirmAssessment());

    body.querySelectorAll('.rp2c-select-asm-candidate').forEach(btn => {
      btn.addEventListener('click', async () => {
        const vid = btn.dataset.vid;
        if (!vid) return;
        btn.disabled = true; btn.textContent = 'Memilih…';
        try {
          _phase2cState = await SipApi.phase2cGenerate(phase2cPayload({
            action: 'select_assessment_candidate', version_id: vid,
            selection_revision: _phase2cState?.assessment_spec?.selection_revision ?? 0,
          }));
          saveRpState(); renderAssessmentCheckpoint();
        } catch (e) {
          btn.disabled = false; btn.textContent = 'Gunakan kandidat ini';
          showError('rp2c-asm-error', e.message || 'Gagal memilih kandidat.');
        }
      });
    });
  }

  function renderAssessmentContent(content) {
    if (!content) return '<p style="color:var(--text-muted);font-size:var(--fs-caption);">Tidak ada data.</p>';

    const evidenceHtml = content.success_evidence?.length
      ? `<div style="margin-bottom:var(--space-md);">
          <div style="font-size:var(--fs-caption);font-weight:var(--fw-semibold);color:var(--text-muted);margin-bottom:var(--space-xs);">Bukti Ketercapaian</div>
          ${content.success_evidence.map(e => `<div style="font-size:var(--fs-caption);color:var(--text-secondary);padding:2px 0;">• ${esc(e)}</div>`).join('')}
        </div>` : '';

    const kktpHtml = content.kktp?.length
      ? `<div style="margin-bottom:var(--space-md);">
          <div style="font-size:var(--fs-caption);font-weight:var(--fw-semibold);color:var(--text-muted);margin-bottom:var(--space-xs);">KKTP</div>
          ${content.kktp.map(k => `
            <div style="border:1px solid var(--border);border-radius:var(--radius-sm);padding:var(--space-sm);margin-bottom:var(--space-xs);">
              <div style="font-size:var(--fs-caption);color:var(--text-primary);font-weight:var(--fw-medium);margin-bottom:4px;">${esc(k.id||'')} ${esc(k.deskripsi||'')}</div>
              <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:var(--space-xs);font-size:11px;">
                <div style="color:var(--success,#4caf50);"><strong>Paham:</strong> ${esc(k.paham||'-')}</div>
                <div style="color:var(--gold);"><strong>Hampir:</strong> ${esc(k.hampir||'-')}</div>
                <div style="color:var(--error,#ef4444);"><strong>Belum:</strong> ${esc(k.belum||'-')}</div>
              </div>
            </div>`).join('')}
        </div>` : '';

    const formativeHtml = content.formative?.length
      ? `<div style="margin-bottom:var(--space-md);">
          <div style="font-size:var(--fs-caption);font-weight:var(--fw-semibold);color:var(--text-muted);margin-bottom:var(--space-xs);">Formative Checkpoint</div>
          ${content.formative.map(f => `
            <div style="border:1px solid var(--border);border-radius:var(--radius-sm);padding:var(--space-sm);margin-bottom:var(--space-xs);">
              <div style="font-size:var(--fs-caption);color:var(--text-muted);margin-bottom:4px;">Pertemuan ${f.meeting_no}</div>
              <div style="font-size:var(--fs-caption);color:var(--text-secondary);">Bukti: ${esc(f.expected_evidence||'-')}</div>
              ${f.classification_anchor ? `
              <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:var(--space-xs);font-size:11px;margin-top:4px;">
                <div style="color:var(--success,#4caf50);">Paham: ${esc(f.classification_anchor.paham||'-')}</div>
                <div style="color:var(--gold);">Hampir: ${esc(f.classification_anchor.hampir||'-')}</div>
                <div style="color:var(--error,#ef4444);">Belum: ${esc(f.classification_anchor.belum||'-')}</div>
              </div>` : ''}
            </div>`).join('')}
        </div>` : '';

    const summativeHtml = content.summative
      ? `<div style="margin-bottom:var(--space-md);">
          <div style="font-size:var(--fs-caption);font-weight:var(--fw-semibold);color:var(--text-muted);margin-bottom:var(--space-xs);">Asesmen Sumatif</div>
          <div style="font-size:var(--fs-caption);color:var(--text-secondary);">${esc(content.summative.jenis||'-')}: ${esc(content.summative.instrumen||'-')}</div>
        </div>` : '';

    return evidenceHtml + kktpHtml + formativeHtml + summativeHtml;
  }

  function showAssessmentEditor(content) {
    const editArea = el('rp2c-asm-edit-area');
    if (!editArea) return;
    const json = JSON.stringify(content ?? {}, null, 2);
    editArea.style.display = 'block';
    editArea.innerHTML = `
<div style="margin-top:var(--space-md);">
  <div style="font-size:var(--fs-caption);color:var(--text-muted);margin-bottom:var(--space-xs);">
    Edit JSON Assessment Specification. Schema harus dipertahankan.
  </div>
  <textarea id="rp2c-asm-editor" rows="20"
    style="width:100%;font-family:monospace;font-size:11px;padding:var(--space-sm);
    border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--surface-1);
    color:var(--text-primary);resize:vertical;">${esc(json)}</textarea>
  <div class="rp-action-row" style="margin-top:var(--space-sm);">
    ${btnSecondary('rp2c-btn-cancel-edit-asm', 'Batal')}
    ${btnPrimary('rp2c-btn-save-edit-asm', 'Simpan Edit')}
  </div>
</div>`;
    el('rp2c-btn-cancel-edit-asm')?.addEventListener('click', () => {
      editArea.style.display = 'none'; editArea.innerHTML = '';
    });
    el('rp2c-btn-save-edit-asm')?.addEventListener('click', () => runSaveAssessmentEdit());
  }

  async function runGenerateAssessment(isRegenerate) {
    const action = isRegenerate ? 'regenerate_assessment_spec' : 'generate_assessment_spec';
    const btnId = isRegenerate ? 'rp2c-btn-regen-asm' : 'rp2c-btn-gen-asm';
    const btn = el(btnId);
    if (btn) { btn.disabled = true; btn.textContent = 'Generating…'; }
    showError('rp2c-asm-error', '');
    // Stable operation ID: generate once per intent, reuse on retry, clear on success.
    if (isRegenerate && !_asmRegenOpId) _asmRegenOpId = crypto.randomUUID();
    const extra = isRegenerate ? { action, client_operation_id: _asmRegenOpId } : { action };
    try {
      _phase2cState = await SipApi.phase2cGenerate(phase2cPayload(extra));
      _asmRegenOpId = null; // success — next click starts a new intent
      saveRpState(); renderAssessmentCheckpoint();
    } catch (e) {
      // keep _asmRegenOpId so a network retry sends the same operation ID
      if (btn) { btn.disabled = false; btn.textContent = isRegenerate ? '⟳ Regenerate' : 'Generate Asesmen + KKTP'; }
      showError('rp2c-asm-error', e.message || 'Generate gagal. Coba lagi.');
    }
  }

  async function runSaveAssessmentEdit() {
    const textarea = el('rp2c-asm-editor');
    if (!textarea) return;
    let parsed;
    try { parsed = JSON.parse(textarea.value); }
    catch { showError('rp2c-asm-error', 'JSON tidak valid.'); return; }
    const btn = el('rp2c-btn-save-edit-asm');
    if (btn) { btn.disabled = true; btn.textContent = 'Menyimpan…'; }
    try {
      _phase2cState = await SipApi.phase2cGenerate(phase2cPayload({
        action: 'save_assessment_spec_edit', content: parsed,
      }));
      saveRpState(); renderAssessmentCheckpoint();
    } catch (e) {
      if (btn) { btn.disabled = false; btn.textContent = 'Simpan Edit'; }
      showError('rp2c-asm-error', e.message || 'Simpan gagal.');
    }
  }

  async function runConfirmAssessment() {
    if (_confirmingAsm) return;
    _confirmingAsm = true;
    try {
      const asm = _phase2cState?.assessment_spec;
      if (!asm?.selected_version_id) return;
      const btn = el('rp2c-btn-confirm-asm');
      if (btn) { btn.disabled = true; btn.textContent = 'Mengonfirmasi…'; }
      showError('rp2c-asm-error', '');
      try {
        _phase2cState = await SipApi.phase2cGenerate(phase2cPayload({
          action: 'confirm_assessment_spec', version_id: asm.selected_version_id,
        }));
        saveRpState(); enterMaterialPipeline();
      } catch (e) {
        if (btn) { btn.disabled = false; btn.textContent = 'Konfirmasi Checkpoint 2 ✓'; }
        showError('rp2c-asm-error', e.message || 'Konfirmasi gagal.');
      }
    } finally {
      _confirmingAsm = false;
    }
  }

  // ── Checkpoint 3: Material Specification ──────────────────────────────────────
  function phase2cPayloadMat(extra) {
    return {
      classroom_id: _cId,
      teaching_context_id: _teachingContext?.id,
      planning_context_id: _planningContext?.id,
      ...extra,
    };
  }

  async function enterMaterialPipeline() {
    if (_enteringMaterial) return;
    _enteringMaterial = true;
    try {
      const body = el('rp-body');
      if (!body) return;
      body.innerHTML = `<div class="rp-block">
        <div class="rp-block-title">Menyusun materi pembelajaran…</div>
        <div style="font-size:var(--fs-caption);color:var(--text-muted);margin-top:var(--space-sm);">
          AI sedang menyusun konsep inti, konteks nyata, dan media yang feasible.
        </div>
      </div>`;
      try {
        _phase2cState = await SipApi.phase2Material(phase2cPayloadMat({ action: 'generate_material_spec' }));
        saveRpState(); renderMaterialSpec();
      } catch (e) {
        body.innerHTML = `<div class="rp-block">
          <div class="rp-block-title" style="color:var(--error);">Generate Material gagal</div>
          <p style="font-size:var(--fs-caption);color:var(--text-secondary);">${esc(e.message || 'Coba lagi.')}</p>
          <button class="btn btn-primary" id="rp2-mat-retry">Coba Lagi</button>
        </div>`;
        el('rp2-mat-retry')?.addEventListener('click', enterMaterialPipeline);
      }
    } finally {
      _enteringMaterial = false;
    }
  }

  function renderMaterialSpec() {
    cleanupAllDropdowns();
    const body = el('rp-body');
    if (!body) return;
    const s   = _phase2cState;
    const mat = s?.material_spec;
    const asm = s?.assessment_spec;
    const tp  = _ans.tp_terpilih;

    if (!asm?.confirmed) { renderAssessmentCheckpoint(); return; }

    const matUsable   = mat?.usable === true;
    const needsUpdate = mat?.needs_update === true;

    let matBodyHtml = '';
    if (!mat?.artifact_id) {
      matBodyHtml = `<div style="color:var(--text-muted);font-size:var(--fs-caption);padding:var(--space-md) 0;">
        Material Specification belum tersedia.
      </div>`;
    } else if (needsUpdate) {
      matBodyHtml = `<div style="color:var(--warning,#f59e0b);font-size:var(--fs-caption);padding:var(--space-md) 0;">
        Material Specification perlu diperbarui (dependensi berubah).
      </div>`;
    } else {
      matBodyHtml = renderMaterialContent(mat?.content);
    }

    body.innerHTML = `
<div class="rp-block">
  <div class="rp-block-title">Step 6 — Generate RPM (Material)</div>
  <div style="font-size:var(--fs-caption);color:var(--text-muted);">TP: ${esc(tp?.judul || '-')}</div>
</div>

<div class="rp-block" style="margin-bottom:var(--space-sm);">
  <div style="display:flex;align-items:center;justify-content:space-between;">
    <div style="font-weight:var(--fw-semibold);font-size:var(--fs-ui);color:var(--text-primary);">
      Checkpoint 1 &amp; 2
    </div>
    <span style="color:var(--success,#4caf50);font-size:var(--fs-badge);">✓ Selesai</span>
  </div>
  <button class="btn btn-sm" id="rp2c-mat-back-asm" style="margin-top:var(--space-xs);font-size:var(--fs-badge);">← Lihat Asesmen</button>
</div>

<div class="rp-block">
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:var(--space-sm);">
    <div style="font-weight:var(--fw-semibold);font-size:var(--fs-ui);color:var(--text-primary);">
      Material Specification
      ${matUsable
        ? '<span style="color:var(--success,#4caf50);font-size:var(--fs-badge);margin-left:var(--space-xs);">✓ Siap</span>'
        : '<span style="color:var(--text-muted);font-size:var(--fs-badge);margin-left:var(--space-xs);">Belum tersedia</span>'}
    </div>
    ${mat?.teacher_edited ? '<span style="font-size:var(--fs-badge);color:var(--gold);">✏ Diedit guru</span>' : ''}
  </div>

  <div id="rp2c-mat-body">${matBodyHtml}</div>
  <div id="rp2c-mat-edit-area" style="display:none;"></div>
  <div id="rp2c-mat-error" class="error-msg" style="display:none;"></div>

  <div class="rp-action-row" style="flex-wrap:wrap;gap:var(--space-sm);">
    ${matUsable
      ? `${btnSecondary('rp2c-btn-edit-mat', '✏ Edit')}
         ${btnPrimary('rp2c-btn-mat-next', 'Lanjut ke Pertemuan →')}`
      : ''
    }
  </div>
</div>`;

    el('rp2c-mat-back-asm')?.addEventListener('click', () => renderAssessmentCheckpoint());
    el('rp2c-btn-edit-mat')?.addEventListener('click', () => showMaterialEditor(mat?.content));
    el('rp2c-btn-mat-next')?.addEventListener('click', () => enterMeetingPipeline());
  }

  function renderMaterialContent(content) {
    if (!content) return '<p style="color:var(--text-muted);font-size:var(--fs-caption);">Tidak ada data.</p>';

    const konsepHtml = content.konsep_inti?.length
      ? `<div style="margin-bottom:var(--space-md);">
          <div style="font-size:var(--fs-caption);font-weight:var(--fw-semibold);color:var(--text-muted);margin-bottom:var(--space-xs);">Konsep Inti</div>
          ${content.konsep_inti.map(k => `
            <details style="border:1px solid var(--border);border-radius:var(--radius-sm);margin-bottom:var(--space-xs);">
              <summary style="padding:var(--space-sm);cursor:pointer;font-size:var(--fs-caption);color:var(--text-primary);font-weight:var(--fw-medium);">
                ${esc(k.id || '')} ${esc(k.judul || '')}
              </summary>
              <div style="padding:var(--space-sm);padding-top:0;font-size:var(--fs-caption);color:var(--text-secondary);">
                <p style="margin:0 0 var(--space-xs);">${esc(k.penjelasan || '')}</p>
                ${k.prasyarat?.length ? `<div style="color:var(--text-muted);">Prasyarat: ${k.prasyarat.map(p => esc(p)).join(', ')}</div>` : ''}
              </div>
            </details>`).join('')}
        </div>` : '';

    const miskonsepsiHtml = content.miskonsepsi?.length
      ? `<div style="margin-bottom:var(--space-md);">
          <div style="font-size:var(--fs-caption);font-weight:var(--fw-semibold);color:var(--text-muted);margin-bottom:var(--space-xs);">Miskonsepsi</div>
          ${content.miskonsepsi.map(m => `
            <div style="border:1px solid var(--border);border-radius:var(--radius-sm);padding:var(--space-sm);margin-bottom:var(--space-xs);">
              <div style="font-size:var(--fs-caption);color:var(--error,#ef4444);margin-bottom:4px;">✗ ${esc(m.miskonsepsi || '')}</div>
              <div style="font-size:var(--fs-caption);color:var(--success,#4caf50);">✓ ${esc(m.klarifikasi || '')}</div>
            </div>`).join('')}
        </div>` : '';

    const konteksHtml = content.konteks_nyata?.length
      ? `<div style="margin-bottom:var(--space-md);">
          <div style="font-size:var(--fs-caption);font-weight:var(--fw-semibold);color:var(--text-muted);margin-bottom:var(--space-xs);">Konteks Nyata</div>
          ${content.konteks_nyata.map(k => `
            <div style="font-size:var(--fs-caption);color:var(--text-secondary);padding:2px 0;">
              • <span style="color:var(--gold);">[${esc(k.sumber || '')}]</span> ${esc(k.deskripsi || '')}
            </div>`).join('')}
        </div>` : '';

    const mediaHtml = content.media_feasible?.length
      ? `<div style="margin-bottom:var(--space-md);">
          <div style="font-size:var(--fs-caption);font-weight:var(--fw-semibold);color:var(--text-muted);margin-bottom:var(--space-xs);">Media Feasible</div>
          ${content.media_feasible.map(m => `
            <div style="font-size:var(--fs-caption);color:var(--text-secondary);padding:2px 0;">
              • <strong>${esc(m.jenis || '')}</strong> — ${esc(m.deskripsi || '')}
              ${m.requires_facility ? `<span style="color:var(--text-muted);"> (perlu: ${esc(m.requires_facility)})</span>` : ''}
            </div>`).join('')}
        </div>` : '';

    return konsepHtml + miskonsepsiHtml + konteksHtml + mediaHtml;
  }

  function showMaterialEditor(content) {
    const editArea = el('rp2c-mat-edit-area');
    if (!editArea) return;
    const json = JSON.stringify(content ?? {}, null, 2);
    editArea.style.display = 'block';
    editArea.innerHTML = `
<div style="margin-top:var(--space-md);">
  <div style="font-size:var(--fs-caption);color:var(--text-muted);margin-bottom:var(--space-xs);">
    Edit JSON Material Specification. Schema harus dipertahankan.
  </div>
  <textarea id="rp2c-mat-editor" rows="20"
    style="width:100%;font-family:monospace;font-size:11px;padding:var(--space-sm);
    border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--surface-1);
    color:var(--text-primary);resize:vertical;">${esc(json)}</textarea>
  <div class="rp-action-row" style="margin-top:var(--space-sm);">
    ${btnSecondary('rp2c-btn-cancel-edit-mat', 'Batal')}
    ${btnPrimary('rp2c-btn-save-edit-mat', 'Simpan Edit')}
  </div>
</div>`;
    el('rp2c-btn-cancel-edit-mat')?.addEventListener('click', () => {
      editArea.style.display = 'none'; editArea.innerHTML = '';
    });
    el('rp2c-btn-save-edit-mat')?.addEventListener('click', () => runSaveMaterialEdit());
  }

  async function runSaveMaterialEdit() {
    const textarea = el('rp2c-mat-editor');
    if (!textarea) return;
    let parsed;
    try { parsed = JSON.parse(textarea.value); }
    catch { showError('rp2c-mat-error', 'JSON tidak valid. Perbaiki syntax dulu.'); return; }
    const btn = el('rp2c-btn-save-edit-mat');
    if (btn) { btn.disabled = true; btn.textContent = 'Menyimpan…'; }
    try {
      _phase2cState = await SipApi.phase2Material(phase2cPayloadMat({
        action: 'save_material_spec_edit', content: parsed,
      }));
      saveRpState(); renderMaterialSpec();
    } catch (e) {
      if (btn) { btn.disabled = false; btn.textContent = 'Simpan Edit'; }
      showError('rp2c-mat-error', e.message || 'Simpan gagal.');
    }
  }

  // ─── Step 6 — Meeting Plan Pipeline ────────────────────────────────────────────────

  function phase2cPayloadMeet(extra) {
    return {
      classroom_id:        _cId,
      teaching_context_id: _teachingContext?.id,
      planning_context_id: _planningContext?.id,
      ...extra,
    };
  }

  async function enterMeetingPipeline() {
    if (_enteringMeeting) return;
    _enteringMeeting = true;
    try {
      const body = el('rp-body');
      if (!body) return;
      const totalMeetings = _phase2cState?.meeting_plans?.length ?? 0;

      body.innerHTML = `<div class="rp-block">
        <div class="rp-block-title">Menyusun Rencana Pertemuan…</div>
        <div id="rp2-meet-progress" style="margin-top:var(--space-sm);">
          ${totalMeetings > 0
            ? _phase2cState.meeting_plans.map(m =>
                `<div id="rp2-meet-prog-${m.meeting_no}" style="font-size:var(--fs-caption);
                 color:var(--text-muted);padding:2px 0;">
                  Pertemuan ${m.meeting_no}/${totalMeetings} — ${
                    m.usable && !m.needs_update ? '✓ sudah siap, dilewati' : 'menunggu…'
                  }
                </div>`).join('')
            : `<div style="font-size:var(--fs-caption);color:var(--text-muted);">
                 AI sedang menyusun rencana pertemuan satu per satu…
               </div>`}
        </div>
      </div>`;

      try {
        const resp = await SipApi.phase2Meeting(phase2cPayloadMeet({ action: 'generate_all_meetings' }));
        _phase2cState = resp.result;
        saveRpState();

        // Update progress labels from meeting_results
        const results = resp.meeting_results ?? [];
        results.forEach(r => {
          const progEl = el(`rp2-meet-prog-${r.meeting_no}`);
          if (progEl) {
            progEl.style.color = r.status === 'failed'
              ? 'var(--error,#ef4444)' : 'var(--success,#4caf50)';
            progEl.textContent = `Pertemuan ${r.meeting_no} — ${
              r.status === 'generated' ? '✓ berhasil' :
              r.status === 'skipped'   ? '→ dilewati (sudah siap)' :
              `✗ gagal: ${r.error ?? ''}`}`;
          }
        });

        await new Promise(r => setTimeout(r, 600)); // brief pause so user sees result
        renderMeetingPipeline();
      } catch (e) {
        body.innerHTML = `<div class="rp-block">
          <div class="rp-block-title" style="color:var(--error);">Generate Pertemuan gagal</div>
          <p style="font-size:var(--fs-caption);color:var(--text-secondary);">${esc(e.message || 'Coba lagi.')}</p>
          <div class="rp-action-row">
            <button class="btn btn-sm" id="rp2-meet-back-mat">← Kembali ke Materi</button>
            <button class="btn btn-primary" id="rp2-meet-retry">Coba Lagi</button>
          </div>
        </div>`;
        el('rp2-meet-back-mat')?.addEventListener('click', renderMaterialSpec);
        el('rp2-meet-retry')?.addEventListener('click', enterMeetingPipeline);
      }
    } finally {
      _enteringMeeting = false;
    }
  }

  function renderMeetingPipeline() {
    cleanupAllDropdowns();
    const body = el('rp-body');
    if (!body) return;
    const s = _phase2cState;
    const plans = s?.meeting_plans ?? [];
    const tp    = _ans.tp_terpilih;

    const allUsable = plans.length > 0 && plans.every(m => m.usable === true && m.needs_update === false);

    const plansHtml = plans.map(m => {
      const usable      = m.usable === true;
      const needsUpdate = m.needs_update === true;
      const hasContent  = !!m.content;
      const hasArtifact = !!m.artifact_id;

      const badge = !hasArtifact
        ? '<span style="color:var(--text-muted);font-size:var(--fs-badge);">○ Belum</span>'
        : needsUpdate
        ? '<span style="color:var(--warning,#f59e0b);font-size:var(--fs-badge);">⚠ Perlu diperbarui</span>'
        : usable
        ? '<span style="color:var(--success,#4caf50);font-size:var(--fs-badge);">✓ Siap</span>'
        : '<span style="color:var(--error,#ef4444);font-size:var(--fs-badge);">✗ Gagal</span>';

      const candidatesHtml = (() => {
        const cands = (m.candidates ?? []).filter(c => c.version_id !== m.selected_version_id);
        if (!cands.length) return '';
        return `<div style="margin-top:var(--space-sm);padding:var(--space-sm);background:var(--surface-1);border-radius:var(--radius-sm);">
          <div style="font-size:var(--fs-badge);color:var(--text-muted);margin-bottom:4px;">Kandidat tersedia:</div>
          ${cands.map(c => `
            <div style="display:flex;align-items:center;gap:var(--space-sm);padding:2px 0;">
              <span style="font-size:var(--fs-badge);color:var(--text-secondary);">v${c.version_no} (${c.origin === 'TEACHER' ? 'Edit guru' : 'AI'})</span>
              <button class="btn btn-sm rp2-meet-select-candidate"
                data-meeting-no="${m.meeting_no}" data-vid="${esc(c.version_id)}"
                data-sel-rev="${m.selection_revision ?? 0}"
                style="font-size:var(--fs-badge);">Gunakan ini</button>
            </div>`).join('')}
        </div>`;
      })();

      const contentHtml = hasContent ? renderMeetingContent(m.meeting_no, m.content) : '';

      const editedBadge = m.teacher_edited
        ? '<span style="font-size:var(--fs-badge);color:var(--gold);">✏ Diedit guru</span>' : '';

      // Regenerate button: show only if artifact exists and regen limit not yet reached
      // (we check via candidates count — if already has candidate, limit reached)
      const hasCandidate = (m.candidates ?? []).length > 0;
      const regenBtn = hasArtifact && !hasCandidate
        ? `<button class="btn btn-sm rp2-meet-regen" data-meeting-no="${m.meeting_no}"
             style="font-size:var(--fs-badge);">⟳ Regenerate</button>`
        : hasCandidate
        ? `<span style="font-size:var(--fs-badge);color:var(--text-muted);">(batas regen tercapai)</span>`
        : '';

      const retryBtn = !hasArtifact
        ? `<button class="btn btn-primary rp2-meet-retry-single" data-meeting-no="${m.meeting_no}"
             style="font-size:var(--fs-badge);">↺ Generate Pertemuan ${m.meeting_no}</button>`
        : '';

      return `
<details id="rp2-meet-detail-${m.meeting_no}" class="rp-block"
  style="padding:var(--space-sm) var(--space-md);margin-bottom:var(--space-xs);">
  <summary style="cursor:pointer;display:flex;align-items:center;justify-content:space-between;
    list-style:none;padding:var(--space-xs) 0;">
    <span style="font-weight:var(--fw-semibold);font-size:var(--fs-ui);color:var(--text-primary);">
      Pertemuan ${m.meeting_no} — ${m.jp} JP (${m.duration_minutes} menit)
    </span>
    <span style="display:flex;align-items:center;gap:var(--space-sm);">
      ${editedBadge} ${badge}
    </span>
  </summary>

  <div style="margin-top:var(--space-sm);padding-top:var(--space-sm);border-top:1px solid var(--border);">
    ${contentHtml || '<p style="font-size:var(--fs-caption);color:var(--text-muted);">Konten belum tersedia.</p>'}
    ${candidatesHtml}
    <div id="rp2-meet-edit-area-${m.meeting_no}" style="display:none;"></div>
    <div id="rp2-meet-error-${m.meeting_no}" class="error-msg" style="display:none;"></div>
    <div class="rp-action-row" style="flex-wrap:wrap;gap:var(--space-sm);margin-top:var(--space-sm);">
      ${hasContent
        ? `<button class="btn btn-sm rp2-meet-edit" data-meeting-no="${m.meeting_no}"
             style="font-size:var(--fs-badge);">✏ Edit</button>`
        : ''}
      ${regenBtn}
      ${retryBtn}
    </div>
  </div>
</details>`;
    }).join('');

    body.innerHTML = `
<div class="rp-block">
  <div class="rp-block-title">Step 6 — Rencana Pertemuan</div>
  <div style="font-size:var(--fs-caption);color:var(--text-muted);">TP: ${esc(tp?.judul || '-')}</div>
</div>

<div class="rp-block" style="margin-bottom:var(--space-sm);">
  <div style="display:flex;align-items:center;justify-content:space-between;">
    <span style="font-size:var(--fs-ui);font-weight:var(--fw-semibold);color:var(--text-primary);">
      Checkpoint 1 &amp; 2 + Material
    </span>
    <span style="color:var(--success,#4caf50);font-size:var(--fs-badge);">✓ Selesai</span>
  </div>
  <button class="btn btn-sm" id="rp2-meet-back-mat" style="margin-top:var(--space-xs);font-size:var(--fs-badge);">
    ← Lihat Materi
  </button>
</div>

${plansHtml}

<div class="rp-block" style="margin-top:var(--space-sm);">
  <div id="rp2-meet-pipeline-error" class="error-msg" style="display:none;"></div>
  ${allUsable
    ? `<div class="rp-action-row">
         ${btnPrimary('rp2-meet-btn-next', 'Lanjut ke Tindak Lanjut →')}
       </div>`
    : `<p style="font-size:var(--fs-caption);color:var(--text-muted);">
         Selesaikan semua pertemuan untuk melanjutkan.
       </p>`}
</div>`;

    // Event: back to material
    el('rp2-meet-back-mat')?.addEventListener('click', renderMaterialSpec);

    // Event: next step → Follow-Up pipeline
    el('rp2-meet-btn-next')?.addEventListener('click', enterFollowUpPipeline);

    // Event: edit per meeting
    body.querySelectorAll('.rp2-meet-edit').forEach(btn => {
      const mNo = Number(btn.dataset.meetingNo);
      btn.addEventListener('click', () => {
        const mp = plans.find(m => m.meeting_no === mNo);
        showMeetingEditor(mNo, mp?.content ?? {});
      });
    });

    // Event: regenerate per meeting
    body.querySelectorAll('.rp2-meet-regen').forEach(btn => {
      const mNo = Number(btn.dataset.meetingNo);
      btn.addEventListener('click', () => runRegenerateMeeting(mNo));
    });

    // Event: retry single failed meeting
    body.querySelectorAll('.rp2-meet-retry-single').forEach(btn => {
      const mNo = Number(btn.dataset.meetingNo);
      btn.addEventListener('click', () => runRetryMeeting(mNo));
    });

    // Event: select candidate
    body.querySelectorAll('.rp2-meet-select-candidate').forEach(btn => {
      const mNo  = Number(btn.dataset.meetingNo);
      const vid  = btn.dataset.vid;
      const selRev = Number(btn.dataset.selRev ?? 0);
      btn.addEventListener('click', () => runSelectMeetingCandidate(mNo, vid, selRev));
    });
  }

  // ─── Follow-Up Pipeline ────────────────────────────────────────────────────

  async function enterFollowUpPipeline() {
    if (_enteringFollowup) return;
    _enteringFollowup = true;
    try {
      const body = el('rp-body');
      if (!body) return;
      body.innerHTML = `
<div class="rp-block">
  <div class="rp-block-title">Step 6 — Tindak Lanjut</div>
  <p style="font-size:var(--fs-caption);color:var(--text-muted);">Menyusun tindak lanjut…</p>
</div>`;
      try {
        const resp = await SipApi.phase2Followup(phase2cPayloadFu({ action: 'generate_follow_up' }));
        _phase2cState = resp.result;
        renderFollowUpPipeline();
      } catch (e) {
        body.innerHTML = `
<div class="rp-block">
  <div class="rp-block-title">Step 6 — Tindak Lanjut</div>
  <div class="error-msg" style="display:block;">${esc(e?.message ?? 'Gagal generate tindak lanjut')}</div>
  <div class="rp-action-row" style="margin-top:var(--space-sm);">
    <button class="btn btn-sm" id="rp2-fu-back-meet">← Kembali ke Pertemuan</button>
    <button class="btn btn-primary" id="rp2-fu-retry">Coba Lagi</button>
  </div>
</div>`;
        el('rp2-fu-back-meet')?.addEventListener('click', renderMeetingPipeline);
        el('rp2-fu-retry')?.addEventListener('click', enterFollowUpPipeline);
      }
    } finally {
      _enteringFollowup = false;
    }
  }

  function phase2cPayloadFu(extra) {
    const base = {
      classroom_id:        _cId,
      teaching_context_id: _teachingContext?.id,
      planning_context_id: _planningContext?.id,
    };
    return { ...base, ...extra };
  }

  function renderFollowUpPipeline() {
    cleanupAllDropdowns();
    const body = el('rp-body');
    if (!body) return;
    const fu = _phase2cState?.follow_up;
    const content = fu?.content ?? null;
    const usable  = fu?.usable === true;
    const hasArtifact = !!fu?.artifact_id;
    const hasCandidate = (fu?.candidates ?? []).length > 0;

    const JALUR = [
      { key: 'pengayaan',    label: 'Pengayaan',    desc: 'Siswa yang sudah mencapai seluruh KKTP' },
      { key: 'penguatan',    label: 'Penguatan',    desc: 'Siswa yang mendekati KKTP' },
      { key: 'pendampingan', label: 'Pendampingan', desc: 'Siswa yang masih jauh dari KKTP' },
    ];

    const jalurHtml = content
      ? JALUR.map(j => {
          const jd = content[j.key] ?? {};
          const acts = jd.activities ?? [];
          return `
<details class="rp-block" style="padding:var(--space-sm) var(--space-md);margin-bottom:var(--space-xs);">
  <summary style="cursor:pointer;display:flex;align-items:center;justify-content:space-between;
    list-style:none;padding:var(--space-xs) 0;">
    <span style="font-weight:var(--fw-semibold);font-size:var(--fs-ui);color:var(--text-primary);">
      ${esc(j.label)}
    </span>
    <span style="font-size:var(--fs-badge);color:var(--text-muted);">${esc(j.desc)}</span>
  </summary>
  <div style="margin-top:var(--space-sm);padding-top:var(--space-sm);border-top:1px solid var(--border);">
    ${jd.gap_addressed ? `<p style="font-size:var(--fs-caption);color:var(--text-secondary);margin-bottom:var(--space-xs);">Gap: ${esc(jd.gap_addressed)}</p>` : ''}
    ${acts.map(a => `
      <div style="padding:var(--space-xs) 0;border-bottom:1px solid var(--border);">
        <div style="font-size:var(--fs-ui);color:var(--text-primary);">${esc(a.id ?? '')} — ${esc(a.deskripsi ?? '')}</div>
        <div style="font-size:var(--fs-caption);color:var(--text-muted);">Durasi: ${esc(a.durasi_estimasi ?? '-')}</div>
      </div>`).join('')}
  </div>
</details>`;
        }).join('')
      : '<p style="font-size:var(--fs-caption);color:var(--text-muted);">Konten belum tersedia.</p>';

    const regenBtn = hasArtifact && !hasCandidate
      ? `<button class="btn btn-sm" id="rp2-fu-regen" style="font-size:var(--fs-badge);">⟳ Regenerate</button>`
      : hasCandidate
      ? `<span style="font-size:var(--fs-badge);color:var(--text-muted);">(batas regen tercapai)</span>`
      : '';

    body.innerHTML = `
<div class="rp-block">
  <div class="rp-block-title">Step 6 — Tindak Lanjut</div>
</div>

<div class="rp-block" style="margin-bottom:var(--space-sm);">
  <div style="display:flex;align-items:center;justify-content:space-between;">
    <span style="font-size:var(--fs-ui);font-weight:var(--fw-semibold);color:var(--text-primary);">Rencana Pertemuan</span>
    <span style="color:var(--success,#4caf50);font-size:var(--fs-badge);">✓ Selesai</span>
  </div>
  <button class="btn btn-sm" id="rp2-fu-back-meet" style="margin-top:var(--space-xs);font-size:var(--fs-badge);">
    ← Lihat Pertemuan
  </button>
</div>

${jalurHtml}

<div class="rp-block" style="margin-top:var(--space-sm);">
  <div id="rp2-fu-error" class="error-msg" style="display:none;"></div>
  <div class="rp-action-row" style="flex-wrap:wrap;gap:var(--space-sm);">
    ${content ? `<button class="btn btn-sm" id="rp2-fu-edit" style="font-size:var(--fs-badge);">✏ Edit Tindak Lanjut</button>` : ''}
    ${regenBtn}
    ${usable
      ? `${btnPrimary('rp2-fu-btn-validate', 'Validasi &amp; Selesaikan RPM →')}`
      : `<p style="font-size:var(--fs-caption);color:var(--text-muted);">Selesaikan tindak lanjut untuk melanjutkan.</p>`}
  </div>
</div>`;

    el('rp2-fu-back-meet')?.addEventListener('click', renderMeetingPipeline);
    el('rp2-fu-edit')?.addEventListener('click', () => showFollowUpEditor(content ?? {}));
    el('rp2-fu-regen')?.addEventListener('click', async () => {
      try {
        const resp = await SipApi.phase2Followup(phase2cPayloadFu({ action: 'generate_follow_up' }));
        _phase2cState = resp.result;
        renderFollowUpPipeline();
      } catch (e) {
        showError('rp2-fu-error', e?.message ?? 'Gagal regenerate');
      }
    });
    el('rp2-fu-btn-validate')?.addEventListener('click', enterValidationPipeline);
  }

  function showFollowUpEditor(currentContent) {
    const area = el('rp-body');
    if (!area) return;

    const jsonStr = JSON.stringify(currentContent, null, 2);
    area.innerHTML = `
<div class="rp-block">
  <div class="rp-block-title">Edit Tindak Lanjut</div>
  <p style="font-size:var(--fs-caption);color:var(--text-muted);">
    Edit JSON tindak lanjut. Pastikan struktur pengayaan / penguatan / pendampingan tetap ada.
  </p>
  <textarea id="rp2-fu-edit-json" style="width:100%;height:320px;font-family:monospace;
    font-size:var(--fs-caption);padding:var(--space-sm);background:var(--surface-1);
    color:var(--text-primary);border:1px solid var(--border);border-radius:var(--radius-sm);
    box-sizing:border-box;">${esc(jsonStr)}</textarea>
  <div id="rp2-fu-edit-error" class="error-msg" style="display:none;margin-top:var(--space-xs);"></div>
  <div class="rp-action-row" style="margin-top:var(--space-sm);">
    <button class="btn btn-sm" id="rp2-fu-edit-cancel">Batal</button>
    ${btnPrimary('rp2-fu-edit-save', 'Simpan')}
  </div>
</div>`;

    el('rp2-fu-edit-cancel')?.addEventListener('click', renderFollowUpPipeline);
    el('rp2-fu-edit-save')?.addEventListener('click', async () => {
      const raw = el('rp2-fu-edit-json')?.value ?? '';
      let parsed;
      try { parsed = JSON.parse(raw); }
      catch { showError('rp2-fu-edit-error', 'JSON tidak valid'); return; }
      try {
        const resp = await SipApi.phase2Followup(phase2cPayloadFu({
          action: 'save_follow_up_edit', content: parsed,
        }));
        _phase2cState = resp.result;
        renderFollowUpPipeline();
      } catch (e) {
        showError('rp2-fu-edit-error', e?.message ?? 'Gagal simpan');
      }
    });
  }

  // ─── Validation Pipeline ───────────────────────────────────────────────────

  async function enterValidationPipeline() {
    if (_enteringValidation) return;
    _enteringValidation = true;
    try {
      const body = el('rp-body');
      if (!body) return;
      body.innerHTML = `
<div class="rp-block">
  <div class="rp-block-title">Validasi RPM</div>
  <p style="font-size:var(--fs-caption);color:var(--text-muted);">Memvalidasi RPM…</p>
</div>`;
      try {
        const resp = await SipApi.phase2Validator(phase2cPayloadFu({ action: 'run_validation' }));
        _phase2cState = resp.result;
        renderValidationResult(resp.validation);
      } catch (e) {
        body.innerHTML = `
<div class="rp-block">
  <div class="rp-block-title">Validasi RPM</div>
  <div class="error-msg" style="display:block;">${esc(e?.message ?? 'Gagal validasi')}</div>
  <div class="rp-action-row" style="margin-top:var(--space-sm);">
    <button class="btn btn-sm" id="rp2-val-back-fu">← Kembali ke Tindak Lanjut</button>
    <button class="btn btn-primary" id="rp2-val-retry">Coba Lagi</button>
  </div>
</div>`;
        el('rp2-val-back-fu')?.addEventListener('click', renderFollowUpPipeline);
        el('rp2-val-retry')?.addEventListener('click', enterValidationPipeline);
      }
    } finally {
      _enteringValidation = false;
    }
  }

  function renderValidationResult(validation) {
    const body = el('rp-body');
    if (!body) return;
    const { status, violations = [], warnings = [], rpm_ready_for_class } = validation ?? {};

    const isPass = status === 'pass' || status === 'pass_with_warnings';

    // Violations grouped by scope
    const scopeMap = {};
    for (const v of violations) {
      const s = v.scope ?? 'unknown';
      if (!scopeMap[s]) scopeMap[s] = [];
      scopeMap[s].push(v);
    }

    const repairTarget = (repairScope) => {
      if (!repairScope) return null;
      if (repairScope === 'material')    return renderMaterialSpec;
      if (repairScope === 'follow_up')   return () => showFollowUpEditor(_phase2cState?.follow_up?.content ?? {});
      const meetMatch = repairScope.match(/^meeting_(\d+)$/);
      if (meetMatch) {
        const mNo = Number(meetMatch[1]);
        return () => {
          const mp = (_phase2cState?.meeting_plans ?? []).find(m => m.meeting_no === mNo);
          showMeetingEditor(mNo, mp?.content ?? {});
        };
      }
      return null;
    };

    const violationsHtml = Object.entries(scopeMap).map(([scope, viols]) => `
<div style="margin-bottom:var(--space-sm);">
  <div style="font-size:var(--fs-badge);font-weight:var(--fw-semibold);color:var(--error,#ef4444);
    text-transform:uppercase;margin-bottom:4px;">${esc(scope)}</div>
  ${viols.map(v => {
    const target = repairTarget(v.repair_scope);
    return `
<div style="padding:var(--space-xs) var(--space-sm);background:var(--surface-1);
  border-left:3px solid var(--error,#ef4444);border-radius:var(--radius-sm);margin-bottom:4px;">
  <div style="font-size:var(--fs-caption);color:var(--text-primary);">
    <strong>[${esc(v.rule)}]</strong> ${esc(v.message)}
  </div>
  ${v.repair_scope ? `<div style="font-size:var(--fs-caption);color:var(--text-muted);">Perbaiki: ${esc(v.repair_scope)}</div>` : ''}
  ${target ? `<button class="btn btn-sm rp2-val-repair" data-scope="${esc(v.repair_scope)}"
    style="font-size:var(--fs-badge);margin-top:4px;">✏ Perbaiki</button>` : ''}
</div>`;
  }).join('')}
</div>`).join('');

    const warningsHtml = warnings.length ? `
<details style="margin-top:var(--space-sm);">
  <summary style="cursor:pointer;font-size:var(--fs-caption);color:var(--warning,#f59e0b);">
    ⚠ ${warnings.length} peringatan (klik untuk lihat)
  </summary>
  <div style="margin-top:var(--space-xs);">
    ${warnings.map(w => `
<div style="padding:var(--space-xs) var(--space-sm);background:var(--surface-1);
  border-left:3px solid var(--warning,#f59e0b);border-radius:var(--radius-sm);margin-bottom:4px;">
  <div style="font-size:var(--fs-caption);color:var(--text-primary);">[${esc(w.rule)}] ${esc(w.message)}</div>
</div>`).join('')}
  </div>
</details>` : '';

    body.innerHTML = `
<div class="rp-block">
  <div class="rp-block-title">Hasil Validasi RPM</div>
  ${isPass
    ? `<div style="display:flex;align-items:center;gap:var(--space-sm);padding:var(--space-sm);
         background:rgba(76,175,80,0.1);border-radius:var(--radius-sm);border:1px solid var(--success,#4caf50);">
         <span style="font-size:1.2em;">✓</span>
         <div>
           <div style="font-weight:var(--fw-semibold);color:var(--success,#4caf50);">RPM Siap</div>
           <div style="font-size:var(--fs-caption);color:var(--text-muted);">
             ${status === 'pass_with_warnings' ? 'Lulus dengan peringatan — tindak lanjut opsional' : 'Semua pemeriksaan lulus'}
           </div>
         </div>
       </div>
       ${warningsHtml}
       <div style="margin-top:var(--space-sm);padding:var(--space-sm);
         background:rgba(76,175,80,0.08);border-radius:var(--radius-sm);">
         <span style="font-size:var(--fs-caption);color:var(--success,#4caf50);font-weight:var(--fw-semibold);">
           ✓ rpm_ready_for_class = true
         </span>
       </div>`
    : `<div style="display:flex;align-items:center;gap:var(--space-sm);padding:var(--space-sm);
         background:rgba(239,68,68,0.1);border-radius:var(--radius-sm);border:1px solid var(--error,#ef4444);">
         <span style="font-size:1.2em;">✗</span>
         <div>
           <div style="font-weight:var(--fw-semibold);color:var(--error,#ef4444);">Perlu Perbaikan</div>
           <div style="font-size:var(--fs-caption);color:var(--text-muted);">${violations.length} pelanggaran harus diperbaiki</div>
         </div>
       </div>
       <div style="margin-top:var(--space-sm);">${violationsHtml}</div>
       ${warningsHtml}`}
</div>

<div class="rp-block" style="margin-top:var(--space-sm);">
  <div id="rp2-val-error" class="error-msg" style="display:none;"></div>
  <div class="rp-action-row" style="flex-wrap:wrap;gap:var(--space-sm);">
    <button class="btn btn-sm" id="rp2-val-back-fu">← Tindak Lanjut</button>
    ${isPass
      ? `<button class="btn btn-primary" id="rp2-val-btn-doc">Lihat Dokumen RPM →</button>`
      : `<button class="btn btn-sm" id="rp2-val-revalidate">↺ Validasi Ulang</button>`}
  </div>
</div>`;

    el('rp2-val-back-fu')?.addEventListener('click', renderFollowUpPipeline);
    el('rp2-val-btn-doc')?.addEventListener('click', () => {
      // Navigate to Step 7 (dokumen RPM) — placeholder navigasi
      showError('rp2-val-error', 'Dokumen RPM akan tersedia di Step 7.');
    });
    el('rp2-val-revalidate')?.addEventListener('click', enterValidationPipeline);

    // Repair buttons
    body.querySelectorAll('.rp2-val-repair').forEach(btn => {
      const scope = btn.dataset.scope;
      btn.addEventListener('click', () => {
        const target = repairTarget(scope);
        if (target) target();
      });
    });
  }

  function renderMeetingContent(meetingNo, content) {
    if (!content) return '';
    const c = content;

    const phases = ['opening','understand','apply','reflect','closing'];
    const phaseLabel = {
      opening:'Pembuka', understand:'Memahami', apply:'Menerapkan',
      reflect:'Refleksi', closing:'Penutup',
    };

    const activitiesByPhase = {};
    phases.forEach(p => { activitiesByPhase[p] = []; });
    (c.activities ?? []).forEach(a => {
      if (activitiesByPhase[a.phase]) activitiesByPhase[a.phase].push(a);
    });

    const activitiesHtml = phases.map(phase => {
      const acts = activitiesByPhase[phase];
      if (!acts.length) return '';
      return `<details style="border:1px solid var(--border);border-radius:var(--radius-sm);margin-bottom:4px;">
        <summary style="padding:var(--space-xs) var(--space-sm);cursor:pointer;font-size:var(--fs-caption);
          font-weight:var(--fw-semibold);color:var(--text-muted);">
          ${phaseLabel[phase]} (${acts.reduce((sum,a) => sum+(a.planned_minutes||0),0)} mnt)
        </summary>
        <div style="padding:var(--space-xs) var(--space-sm);">
          ${acts.map(a => `
            <div style="padding:4px 0;border-bottom:1px solid var(--border);font-size:var(--fs-caption);">
              <div style="color:var(--text-primary);font-weight:var(--fw-medium);">
                [${esc(a.step_id)}] ${esc(a.title)} — ${a.planned_minutes} mnt
                ${a.priority === 'optional'
                  ? '<span style="color:var(--text-muted);font-size:10px;">(opsional)</span>' : ''}
              </div>
              <div style="color:var(--text-secondary);margin-top:2px;">
                <span style="color:var(--text-muted);">Guru:</span> ${esc(a.teacher_action)}
              </div>
              <div style="color:var(--text-secondary);">
                <span style="color:var(--text-muted);">Siswa:</span> ${esc(a.student_action)}
              </div>
              <div style="color:var(--gold);font-size:11px;">✓ ${esc(a.completion_cue)}</div>
            </div>`).join('')}
        </div>
      </details>`;
    }).join('');

    const fc = c.formative_checkpoint;
    const formativeHtml = fc ? `
      <div style="margin-top:var(--space-sm);padding:var(--space-sm);
        background:var(--surface-1);border-radius:var(--radius-sm);">
        <div style="font-size:var(--fs-caption);font-weight:var(--fw-semibold);
          color:var(--text-muted);margin-bottom:var(--space-xs);">Cek Formatif</div>
        <div style="font-size:var(--fs-caption);color:var(--text-secondary);">
          ${esc(fc.expected_evidence ?? '')}
        </div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:4px;margin-top:var(--space-xs);">
          ${['paham','hampir','belum'].map(k => `
            <div style="padding:4px;background:var(--surface-2);border-radius:4px;font-size:11px;">
              <div style="font-weight:var(--fw-semibold);color:var(--${k==='paham'?'success,#4caf50':k==='hampir'?'gold':'error,#ef4444'});">
                ${k.charAt(0).toUpperCase()+k.slice(1)}
              </div>
              <div style="color:var(--text-secondary);">${esc(fc.classification_anchor?.[k] ?? '')}</div>
            </div>`).join('')}
        </div>
      </div>` : '';

    const diff = c.differentiation;
    const diffHtml = diff ? `
      <div style="margin-top:var(--space-sm);padding:var(--space-sm);
        background:var(--surface-1);border-radius:var(--radius-sm);">
        <div style="font-size:var(--fs-caption);font-weight:var(--fw-semibold);
          color:var(--text-muted);margin-bottom:var(--space-xs);">Diferensiasi</div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:4px;">
          ${['paham','hampir','belum'].map(k => {
            const d = diff[k] ?? {};
            return `<div style="padding:var(--space-xs);background:var(--surface-2);
              border-radius:4px;font-size:11px;">
              <div style="font-weight:var(--fw-semibold);color:var(--${k==='paham'?'success,#4caf50':k==='hampir'?'gold':'error,#ef4444'});">
                ${k.charAt(0).toUpperCase()+k.slice(1)}
              </div>
              <div style="color:var(--text-secondary);margin-top:2px;">${esc(d.aktivitas ?? '')}</div>
              <div style="color:var(--text-muted);margin-top:2px;font-style:italic;">
                Bukti: ${esc(d.bukti_belajar ?? '')}
              </div>
            </div>`;
          }).join('')}
        </div>
      </div>` : '';

    const ws = c.worksheet;
    const worksheetHtml = ws?.required ? `
      <details style="border:1px solid var(--border);border-radius:var(--radius-sm);margin-top:var(--space-sm);">
        <summary style="padding:var(--space-xs) var(--space-sm);cursor:pointer;font-size:var(--fs-caption);
          font-weight:var(--fw-semibold);color:var(--text-muted);">
          LKS — ${esc(ws.title ?? '')}
        </summary>
        <div style="padding:var(--space-sm);font-size:var(--fs-caption);">
          <div style="color:var(--text-secondary);margin-bottom:var(--space-xs);">${esc(ws.instruksi ?? '')}</div>
          ${(ws.tasks ?? []).map((t, i) => `
            <div style="padding:var(--space-xs);background:var(--surface-1);
              border-radius:4px;margin-bottom:4px;">
              <div style="font-weight:var(--fw-medium);color:var(--text-primary);">
                ${esc(t.id)} — ${esc(t.deskripsi)}
              </div>
              ${t.stimulus ? `<div style="color:var(--text-muted);font-style:italic;">${esc(t.stimulus)}</div>` : ''}
              <div style="color:var(--gold);">Format: ${esc(t.format_jawaban ?? '')}</div>
            </div>`).join('')}
        </div>
      </details>` : '';

    const objLine = c.meeting_objective
      ? `<div style="font-size:var(--fs-caption);color:var(--text-secondary);margin-bottom:2px;">
           <span style="color:var(--text-muted);">Tujuan:</span> ${esc(c.meeting_objective)}
         </div>` : '';
    const triggerLine = c.trigger_question
      ? `<div style="font-size:var(--fs-caption);color:var(--gold);margin-bottom:var(--space-sm);">
           💡 ${esc(c.trigger_question)}
         </div>` : '';

    return objLine + triggerLine + activitiesHtml + formativeHtml + diffHtml + worksheetHtml;
  }

  function showMeetingEditor(meetingNo, content) {
    const editArea = el(`rp2-meet-edit-area-${meetingNo}`);
    if (!editArea) return;
    const json = JSON.stringify(content ?? {}, null, 2);
    editArea.style.display = 'block';
    editArea.innerHTML = `
<div style="margin-top:var(--space-md);">
  <div style="font-size:var(--fs-caption);color:var(--text-muted);margin-bottom:var(--space-xs);">
    Edit JSON Meeting Plan Pertemuan ${meetingNo}. Schema harus dipertahankan.
    Total planned_minutes HARUS persis = durasi alokasi pertemuan ini.
  </div>
  <textarea id="rp2-meet-editor-${meetingNo}" rows="30"
    style="width:100%;font-family:monospace;font-size:11px;padding:var(--space-sm);
    border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--surface-1);
    color:var(--text-primary);resize:vertical;">${esc(json)}</textarea>
  <div class="rp-action-row" style="margin-top:var(--space-sm);">
    ${btnSecondary(`rp2-meet-cancel-edit-${meetingNo}`, 'Batal')}
    ${btnPrimary(`rp2-meet-save-edit-${meetingNo}`, 'Simpan Edit')}
  </div>
</div>`;
    el(`rp2-meet-cancel-edit-${meetingNo}`)?.addEventListener('click', () => {
      editArea.style.display = 'none'; editArea.innerHTML = '';
    });
    el(`rp2-meet-save-edit-${meetingNo}`)?.addEventListener('click', () =>
      runSaveMeetingEdit(meetingNo));
  }

  async function runSaveMeetingEdit(meetingNo) {
    const textarea = el(`rp2-meet-editor-${meetingNo}`);
    if (!textarea) return;
    let parsed;
    try { parsed = JSON.parse(textarea.value); }
    catch { showError(`rp2-meet-error-${meetingNo}`, 'JSON tidak valid. Perbaiki syntax dulu.'); return; }
    const btn = el(`rp2-meet-save-edit-${meetingNo}`);
    if (btn) { btn.disabled = true; btn.textContent = 'Menyimpan…'; }
    try {
      const resp = await SipApi.phase2Meeting(phase2cPayloadMeet({
        action: 'save_meeting_edit', meeting_no: meetingNo, content: parsed,
      }));
      _phase2cState = resp.result;
      saveRpState();
      renderMeetingPipeline();
    } catch (e) {
      if (btn) { btn.disabled = false; btn.textContent = 'Simpan Edit'; }
      showError(`rp2-meet-error-${meetingNo}`, e.message || 'Simpan gagal.');
    }
  }

  async function runRegenerateMeeting(meetingNo) {
    // Get or generate a stable op ID for this regenerate intent
    if (!_meetRegenOpIds.has(meetingNo)) {
      _meetRegenOpIds.set(meetingNo, crypto.randomUUID());
    }
    const clientOpId = _meetRegenOpIds.get(meetingNo);

    const errId = `rp2-meet-error-${meetingNo}`;
    const btn = document.querySelector(`.rp2-meet-regen[data-meeting-no="${meetingNo}"]`);
    if (btn) { btn.disabled = true; btn.textContent = 'Generating…'; }
    try {
      const resp = await SipApi.phase2Meeting(phase2cPayloadMeet({
        action: 'regenerate_meeting',
        meeting_no: meetingNo,
        client_operation_id: clientOpId,
      }));
      _phase2cState = resp.result;
      _meetRegenOpIds.delete(meetingNo); // clear on success
      saveRpState();
      renderMeetingPipeline();
      // Auto-open the accordion so teacher sees the candidate
      const detail = el(`rp2-meet-detail-${meetingNo}`);
      if (detail) detail.open = true;
    } catch (e) {
      if (btn) { btn.disabled = false; btn.textContent = '⟳ Regenerate'; }
      showError(errId, e.message || 'Regenerate gagal.');
    }
  }

  async function runRetryMeeting(meetingNo) {
    const btn = document.querySelector(`.rp2-meet-retry-single[data-meeting-no="${meetingNo}"]`);
    if (btn) { btn.disabled = true; btn.textContent = 'Generating…'; }
    try {
      const resp = await SipApi.phase2Meeting(phase2cPayloadMeet({ action: 'generate_all_meetings' }));
      _phase2cState = resp.result;
      saveRpState();
      renderMeetingPipeline();
    } catch (e) {
      if (btn) { btn.disabled = false; btn.textContent = `↺ Generate Pertemuan ${meetingNo}`; }
      showError(`rp2-meet-error-${meetingNo}`, e.message || 'Generate gagal.');
    }
  }

  async function runSelectMeetingCandidate(meetingNo, versionId, selectionRevision) {
    const btn = document.querySelector(
      `.rp2-meet-select-candidate[data-meeting-no="${meetingNo}"][data-vid="${versionId}"]`
    );
    if (btn) { btn.disabled = true; btn.textContent = 'Memilih…'; }
    try {
      const resp = await SipApi.phase2Meeting(phase2cPayloadMeet({
        action: 'select_meeting_candidate',
        meeting_no: meetingNo, version_id: versionId, selection_revision: selectionRevision,
      }));
      _phase2cState = resp.result;
      saveRpState();
      renderMeetingPipeline();
    } catch (e) {
      if (btn) { btn.disabled = false; btn.textContent = 'Gunakan ini'; }
      showError(`rp2-meet-error-${meetingNo}`, e.message || 'Pilih kandidat gagal.');
    }
  }

  // ─── Step 6 — Output (legacy) ────────────────────────────────────────────────────────

  function renderKktp(kktp, pendekatan) {
    if (!kktp) return '<div style="color:var(--text-muted);font-size:var(--fs-caption);">KKTP tidak tersedia.</div>';

    if (pendekatan === 'deskripsi_kriteria') {
      if (!Array.isArray(kktp)) return '';
      return kktp.map(k => `
<div class="rp-kktp-row">
  <div class="rp-kktp-level">${esc(k.kriteria||'-')}</div>
  <div class="rp-kktp-desc">
    <div style="color:var(--success,#4caf50);margin-bottom:2px;">
      ✓ ${esc(k.tercapai||'')}
    </div>
    <div style="color:var(--text-muted);">
      ✗ ${esc(k.belum_tercapai||'')}
    </div>
  </div>
</div>`).join('');
    }

    if (pendekatan === 'rubrik') {
      if (!Array.isArray(kktp)) return '';
      return kktp.map(k => `
<div style="margin-bottom:var(--space-sm);padding:var(--space-sm);
  background:var(--surface-1);border-radius:var(--radius-md);">
  <div style="font-weight:var(--fw-semibold);color:var(--text-primary);
    margin-bottom:var(--space-xs);font-size:var(--fs-caption);">
    ${esc(k.aspek||'-')}
  </div>
  <div style="display:grid;grid-template-columns:repeat(4,1fr);
    gap:var(--space-xs);font-size:var(--fs-caption);overflow:hidden;">
    <div>
      <div style="color:var(--text-muted);margin-bottom:2px;">Baru Berkembang</div>
      <div style="color:var(--text-secondary);">${esc(k.baru_berkembang||'-')}</div>
    </div>
    <div>
      <div style="color:var(--text-muted);margin-bottom:2px;">Layak</div>
      <div style="color:var(--text-secondary);">${esc(k.layak||'-')}</div>
    </div>
    <div>
      <div style="color:var(--text-muted);margin-bottom:2px;">Cakap</div>
      <div style="color:var(--text-secondary);">${esc(k.cakap||'-')}</div>
    </div>
    <div>
      <div style="color:var(--gold);margin-bottom:2px;">Mahir</div>
      <div style="color:var(--text-secondary);">${esc(k.mahir||'-')}</div>
    </div>
  </div>
</div>`).join('');
    }

    if (pendekatan === 'interval_nilai') {
      if (!kktp.kriteria) return '';
      const batas = kktp.batas_tercapai ?? 61;
      const kriteriaRows = (kktp.kriteria || []).map(k => `
<div class="rp-kktp-row">
  <div class="rp-kktp-level">${esc(k.nama||'-')}
    <div style="font-weight:normal;color:var(--text-muted);">
      Bobot: ${esc(String(k.bobot||'-'))}
    </div>
  </div>
  <div class="rp-kktp-desc">
    ${Object.entries(k.deskripsi_skala||{}).map(([skala, desk]) =>
      `<div><span style="color:var(--gold);">Skala ${esc(skala)}:</span>
       ${esc(String(desk))}</div>`
    ).join('')}
  </div>
</div>`).join('');
      return `${kriteriaRows}
<div style="margin-top:var(--space-sm);padding:var(--space-xs) var(--space-sm);
  background:var(--surface-1);border-radius:var(--radius-sm);
  font-size:var(--fs-caption);color:var(--text-primary);">
  Batas ketercapaian: <strong>≥ ${batas} dari 100</strong>
</div>`;
    }

    if (pendekatan === 'persentase') {
      if (!kktp.indikator) return '';
      const pct = kktp.persentase_minimal ?? 75;
      const total = kktp.indikator.length;
      const minimal = Math.ceil(total * pct / 100);
      const indikatorRows = (kktp.indikator || []).map((ind, i) => `
<div style="display:flex;align-items:flex-start;gap:var(--space-xs);
  padding:var(--space-xs) 0;border-bottom:1px solid var(--border);
  font-size:var(--fs-caption);color:var(--text-secondary);">
  <span style="color:var(--gold);min-width:20px;">${i+1}.</span>
  <span>${esc(String(ind))}</span>
</div>`).join('');
      return `${indikatorRows}
<div style="margin-top:var(--space-sm);padding:var(--space-xs) var(--space-sm);
  background:var(--surface-1);border-radius:var(--radius-sm);
  font-size:var(--fs-caption);color:var(--text-primary);">
  Tercapai jika ≥ <strong>${minimal} dari ${total} indikator</strong>
  terpenuhi (${pct}%)
</div>`;
    }

    if (Array.isArray(kktp)) {
      return kktp.map(k => `
<div class="rp-kktp-row">
  <div class="rp-kktp-level">${esc(k.level||k.aspek||k.kriteria||'-')}</div>
  <div class="rp-kktp-desc">${esc(k.deskripsi||k.mahir||k.tercapai||'-')}</div>
</div>`).join('');
    }
    return '<div style="color:var(--text-muted);font-size:var(--fs-caption);">Format KKTP tidak dikenal.</div>';
  }

  function renderStep6(data) {
    _rencana = data;
    _step = 6;
    saveRpState();
    renderStepBar();
    const body = el('rp-body');
    if (!body) return;

    const tp = _ans.tp_terpilih;
    const rpmSudahSimpan = _dokumen.some(d => d.jenis === 'RPM' && d.tp_id === (tp?.id || tp?.judul));

    // ── 1. Tujuan praktis
    const sec1 = buildOutputSection('rp-out-1', '1. Tujuan Pembelajaran', `
<p style="font-size:var(--fs-ui);color:var(--text-primary);line-height:var(--lh-loose);">${esc(data?.tujuan_praktis || '-')}</p>
<div style="margin-top:var(--space-sm);font-size:var(--fs-caption);color:var(--text-muted);">TP Dasar: ${esc(tp?.deskripsi || '-')}</div>`);

    // ── 2. Pertemuan
    const pertemuan = (data?.pertemuan || []).map(p => `
<div class="rp-pertemuan-item">
  <div class="rp-pertemuan-title">Pertemuan ${p.no} — ${esc(p.judul)} (${p.durasi_jp} JP)</div>
  <div class="rp-pertemuan-text">${esc(p.aktivitas)}</div>
  ${p.sumber ? `<div style="margin-top:var(--space-xs);font-size:var(--fs-badge);color:var(--text-muted);">Sumber: ${esc(p.sumber)}</div>` : ''}
  ${p.catatan_guru ? `<div style="margin-top:var(--space-xs);font-size:var(--fs-badge);color:var(--gold);">💡 ${esc(p.catatan_guru)}</div>` : ''}
</div>`).join('');
    const sec2 = buildOutputSection('rp-out-2', '2. Pengalaman Belajar per Pertemuan', pertemuan || '<p class="empty-state">Tidak ada data.</p>');

    // ── 3. Asesmen & KKTP
    const asesmen = data?.asesmen;
    const pendekatan_kktp = _ans.tp_terpilih?.pendekatan_kktp || 'rubrik';
    const kktpHtml = renderKktp(asesmen?.kktp, pendekatan_kktp);
    const sec3 = buildOutputSection('rp-out-3', '3. Asesmen & KKTP', `
<div style="margin-bottom:var(--space-sm);">
  <span style="font-size:var(--fs-caption);color:var(--text-muted);">Jenis:</span>
  <span style="font-size:var(--fs-ui);color:var(--text-primary);font-weight:var(--fw-medium);"> ${esc(asesmen?.jenis||'-')}</span>
</div>
<div style="margin-bottom:var(--space-md);font-size:var(--fs-caption);color:var(--text-secondary);line-height:var(--lh-loose);">${esc(asesmen?.instrumen||'-')}</div>
${kktpHtml}`);

    // ── 4. LKS
    const lks = data?.lks;
    const lksQ = (lks?.pertanyaan || []).map((q, i) =>
      `<div class="rp-lks-q"><div class="rp-lks-qnum">${i+1}.</div><div>${esc(q)}</div></div>`
    ).join('');
    const sec4 = buildOutputSection('rp-out-4', '4. Lembar Kerja Siswa', `
<div style="font-size:var(--fs-ui);font-weight:var(--fw-semibold);color:var(--text-primary);margin-bottom:var(--space-sm);">${esc(lks?.judul||'-')}</div>
<div style="font-size:var(--fs-caption);color:var(--text-secondary);margin-bottom:var(--space-md);line-height:var(--lh-loose);">${esc(lks?.instruksi||'')}</div>
${lksQ}`);

    // ── 5. Tindak lanjut
    const tl = data?.tindak_lanjut;
    const sec5 = buildOutputSection('rp-out-5', '5. Tindak Lanjut', `
<div class="rp-tl-row"><div class="rp-tl-label">Pengayaan</div><div class="rp-tl-desc">${esc(tl?.pengayaan||'-')}</div></div>
<div class="rp-tl-row"><div class="rp-tl-label">Penguatan</div><div class="rp-tl-desc">${esc(tl?.penguatan||'-')}</div></div>
<div class="rp-tl-row"><div class="rp-tl-label">Pendampingan</div><div class="rp-tl-desc">${esc(tl?.pendampingan||'-')}</div></div>`);

    body.innerHTML = `
<div class="rp-block">
  <div class="rp-block-title">Rencana Pembelajaran — ${esc(tp?.judul || '')}</div>
  <div style="font-size:var(--fs-caption);color:var(--text-muted);margin-bottom:var(--space-md);">${esc(_ans.mapel)} · ${esc(_ans.jenjang)} · ${esc(_ans.fase?.replace('_',' ')?.toUpperCase())}</div>
</div>
${sec1}${sec2}${sec3}${sec4}${sec5}
<div class="rp-action-row">
  ${btnSecondary('rp-btn-tp-lain','↩ Rancang TP lain')}
  ${btnSecondary('rp-btn-reset','⟳ Mulai dari awal')}
</div>
<div class="rp-save-row">
  <button type="button" class="rp-btn-simpan" id="rp-btn-simpan-rpm"
    ${rpmSudahSimpan ? 'disabled style="background:var(--success,#2d6a4f);cursor:default;"' : ''}>
    ${rpmSudahSimpan ? '✓ Tersimpan' : '💾 Simpan RPM ini'}
  </button>
  <button type="button" class="rp-btn-dokumen" id="rp-btn-lihat-dokumen">
    📄 Lihat semua dokumen →
  </button>
</div>
<div id="rp-step6-error" class="error-msg" style="display:none;"></div>`;

    // Buka accordion pertama
    body.querySelector('.rp-output-section')?.classList.add('open');

    // Accordion toggle
    body.querySelectorAll('.rp-output-header').forEach(hdr => {
      hdr.addEventListener('click', () => {
        hdr.closest('.rp-output-section').classList.toggle('open');
      });
    });

    el('rp-btn-tp-lain').addEventListener('click', () => { _step = 4; renderStep4(_atpList); });
    el('rp-btn-reset').addEventListener('click', resetAll);

    // Simpan RPM
    el('rp-btn-simpan-rpm')?.addEventListener('click', async () => {
      const btn = el('rp-btn-simpan-rpm');
      const tp  = _ans.tp_terpilih;
      if (!tp || !_rencana || btn?.disabled) return;
      btn.disabled = true;
      btn.textContent = 'Menyimpan…';
      try {
        const judul = `RPM — ${tp.judul || 'Tanpa judul'}`;
        const konten = {
          tp,
          rencana:  _rencana,
          mapel:    _ans.mapel,
          jenjang:  _ans.jenjang,
          fase:     _ans.fase,
          disimpan: new Date().toISOString(),
        };
        const doc = await SipApi.simpanRancangDokumen(
          _cId, 'RPM', judul, konten, tp.id || tp.judul
        );
        _dokumen = [doc, ..._dokumen.filter(d => d.tp_id !== (tp.id || tp.judul))];
        btn.textContent = '✓ Tersimpan';
        btn.style.background = 'var(--success,#2d6a4f)';
        btn.style.cursor = 'default';
        btn.disabled = true;
      } catch (e) {
        console.error('[rancang] simpan RPM gagal:', e);
        btn.disabled = false;
        btn.textContent = '💾 Simpan RPM ini';
        showError('rp-step6-error', 'Gagal menyimpan. Coba lagi.');
      }
    });

    // Lihat semua dokumen → Step 7
    el('rp-btn-lihat-dokumen')?.addEventListener('click', () => {
      _step = 7;
      renderStepBar();
      renderStep7();
    });
  }

  // ── Step 7: Document Hub ──────────────────────────────────────
  async function renderStep7() {
    cleanupAllDropdowns();
    _step = 7;
    renderStepBar();

    // Jika ada planning context yang aktif dan pipeline state, gunakan structured view
    if (_planningContext?.id && _phase2cState) {
      await renderStep7Structured();
    } else {
      await renderStep7Legacy();
    }
  }

  // ── Step 7 Structured: render dari _phase2cState ───────────────────────────
  async function renderStep7Structured() {
    const body = el('rp-body');
    if (!body) return;

    // Reload state dari server jika stale atau kosong
    let s = _phase2cState;
    if (!s && _planningContext?.id && _teachingContext?.id) {
      try {
        s = await SipApi.getPipelineStateForContext(_cId, _teachingContext.id, _planningContext.id);
        _phase2cState = s;
        saveRpState();
      } catch (_) {}
    }
    if (!s) { await renderStep7Legacy(); return; }

    try { _profil = await SipApi.getRancangProfil(); } catch (_) {}

    const idSrc = _profil?.is_locked
      ? { nama_guru: _profil.nama_guru || '', nip_guru: _profil.nip_guru || '',
          nama_kepsek: _profil.nama_kepsek || '', nip_kepsek: _profil.nip_kepsek || '',
          tahun_ajaran: _profil.tahun_ajaran || '',
          semester: (_profil.semester_list || []).join(', '), kota: _profil.kota || '' }
      : (_settings || {});

    const tp       = _ans.tp_terpilih;
    const ctx      = s.context_spec;
    const asm      = s.assessment_spec;
    const mat      = s.material_spec;
    const meetings = s.meeting_plans ?? [];
    const fu       = s.follow_up;

    const rpmReady = s.rpm_ready_for_class === true;
    const hasLks   = meetings.some(m => m.content?.worksheet?.required === true);

    // ── Helper: render satu accordion section ─────────────────────────────
    function acc(id, title, bodyHtml, editLabel, editFn) {
      const editBtn = editFn
        ? `<button type="button" class="btn btn-sm rp-s7-edit-btn" data-fn="${id}"
             style="font-size:var(--fs-badge);margin-left:auto;">${editLabel || '✏ Edit'}</button>`
        : '';
      return `
<details class="rp-block rp-s7-acc" id="rp-s7-${id}" style="padding:0;overflow:hidden;margin-bottom:var(--space-xs);">
  <summary style="display:flex;align-items:center;gap:var(--space-xs);padding:var(--space-sm) var(--space-md);
    cursor:pointer;list-style:none;background:var(--surface-2);user-select:none;">
    <span style="font-weight:var(--fw-semibold);font-size:var(--fs-ui);flex:1;">${esc(title)}</span>
    ${editBtn}
  </summary>
  <div style="padding:var(--space-sm) var(--space-md);">${bodyHtml}</div>
</details>`;
    }

    // ── Identitas ─────────────────────────────────────────────────────────
    const identitasHtml = `
<div class="rp-block" id="rp-s7-identitas">
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:var(--space-sm);">
    <div class="rp-block-title" style="margin:0;">Identitas Dokumen</div>
    <button type="button" class="btn btn-sm" id="rp-s7-edit-identitas"
      style="font-size:var(--fs-badge);">✏ Edit</button>
  </div>
  <div class="rp-readonly-card">
    ${[
      ['Nama guru',            idSrc.nama_guru    || '—'],
      ['NIP guru',             idSrc.nip_guru     || '—'],
      ['Nama kepala sekolah',  idSrc.nama_kepsek  || '—'],
      ['NIP kepala sekolah',   idSrc.nip_kepsek   || '—'],
      ['Tahun ajaran',         idSrc.tahun_ajaran || '—'],
      ['Semester',             idSrc.semester     || '—'],
      ['Kota / Kabupaten',     idSrc.kota         || '—'],
    ].map(([lbl, val]) => `
    <div class="rp-readonly-row">
      <span class="rp-readonly-label">${esc(lbl)}</span>
      <span class="rp-readonly-val">${esc(val)}</span>
    </div>`).join('')}
  </div>
</div>`;

    // ── Status RPM ────────────────────────────────────────────────────────
    const statusHtml = `
<div class="rp-block" id="rp-s7-status" style="border-left:3px solid ${rpmReady ? 'var(--success,#4caf50)' : 'var(--warning,#f59e0b)'};">
  <div style="display:flex;align-items:center;gap:var(--space-sm);">
    <span style="font-size:1.3em;">${rpmReady ? '✓' : '⚠'}</span>
    <div>
      <div style="font-weight:var(--fw-semibold);color:${rpmReady ? 'var(--success,#4caf50)' : 'var(--warning,#f59e0b)'};">
        ${rpmReady ? 'RPM siap digunakan' : 'RPM belum siap — ada bagian yang perlu dilengkapi'}
      </div>
      ${!rpmReady ? `<div style="font-size:var(--fs-caption);color:var(--text-muted);margin-top:2px;">
        Lengkapi semua section di Step 6 sebelum mengunduh dokumen.</div>` : ''}
    </div>
  </div>
</div>`;

    // ── CP (read-only) ────────────────────────────────────────────────────
    const cpBodyHtml = _cpElemen.length
      ? _cpElemen.map(e => `
<div style="margin-bottom:var(--space-sm);">
  <div style="font-weight:var(--fw-semibold);font-size:var(--fs-caption);color:var(--gold);margin-bottom:2px;">${esc(e.nama)}</div>
  <div style="font-size:var(--fs-caption);color:var(--text-secondary);">${esc(e.cp_normatif || '-')}</div>
</div>`).join('')
      : `<div style="color:var(--text-muted);font-size:var(--fs-caption);">CP belum di-generate.</div>`;

    // ── ATP & TP Terpilih ─────────────────────────────────────────────────
    const atpBodyHtml = (() => {
      if (!_atpList.length) return `<div style="color:var(--text-muted);font-size:var(--fs-caption);">ATP belum tersedia.</div>`;
      return `<div style="font-size:var(--fs-caption);">
${_atpList.map((t, i) => {
  const isSel = t.id && t.id === tp?.id;
  return `<div style="padding:var(--space-xs) var(--space-sm);margin-bottom:2px;border-radius:var(--radius-sm);
    background:${isSel ? 'color-mix(in srgb,var(--gold) 12%,transparent)' : 'transparent'};
    border:1px solid ${isSel ? 'var(--gold)' : 'transparent'};">
    <span style="color:var(--text-muted);margin-right:4px;">TP ${i + 1}</span>
    <span style="${isSel ? 'font-weight:var(--fw-semibold);color:var(--gold);' : ''}">${esc(t.judul || '-')}</span>
    ${isSel ? '<span style="font-size:var(--fs-badge);color:var(--gold);margin-left:4px;">← terpilih</span>' : ''}
  </div>`;
}).join('')}
</div>`;
    })();

    // ── Context Spec ──────────────────────────────────────────────────────
    const ctxBodyHtml = (() => {
      const decisions = ctx?.content?.context_decisions ?? [];
      if (!decisions.length) return `<div style="color:var(--text-muted);font-size:var(--fs-caption);">Context Spec belum tersedia.</div>`;
      return decisions.map(d => `
<div style="margin-bottom:var(--space-sm);padding:var(--space-xs) var(--space-sm);
  background:var(--surface-1);border-radius:var(--radius-sm);">
  <div style="font-weight:var(--fw-semibold);font-size:var(--fs-caption);color:var(--text-primary);">${esc(d.aspect || d.key || '')}</div>
  <div style="font-size:var(--fs-caption);color:var(--text-secondary);margin-top:2px;">${esc(d.decision || d.value || '-')}</div>
  ${d.rationale ? `<div style="font-size:var(--fs-badge);color:var(--text-muted);margin-top:1px;font-style:italic;">${esc(d.rationale)}</div>` : ''}
</div>`).join('');
    })();

    // ── Assessment + KKTP ─────────────────────────────────────────────────
    const asmBodyHtml = (() => {
      const content = asm?.content ?? {};
      const kktpList = content.kktp ?? [];
      const formative = content.formative_checkpoints ?? [];
      if (!kktpList.length && !formative.length) {
        return `<div style="color:var(--text-muted);font-size:var(--fs-caption);">Assessment Spec belum tersedia.</div>`;
      }
      const kktpHtml = kktpList.length
        ? `<div style="font-weight:var(--fw-semibold);font-size:var(--fs-caption);margin-bottom:var(--space-xs);">KKTP</div>
<div style="overflow-x:auto;margin-bottom:var(--space-sm);">
<table style="width:100%;border-collapse:collapse;font-size:var(--fs-caption);">
  <thead>
    <tr style="background:var(--surface-2);">
      <th style="padding:4px 8px;text-align:left;border:1px solid var(--border);">Kriteria</th>
      <th style="padding:4px 8px;text-align:left;border:1px solid var(--border);">Paham</th>
      <th style="padding:4px 8px;text-align:left;border:1px solid var(--border);">Hampir</th>
      <th style="padding:4px 8px;text-align:left;border:1px solid var(--border);">Belum</th>
    </tr>
  </thead>
  <tbody>
    ${kktpList.map(k => `
    <tr>
      <td style="padding:4px 8px;border:1px solid var(--border);">${esc(k.kriteria || k.criterion || '-')}</td>
      <td style="padding:4px 8px;border:1px solid var(--border);color:var(--success,#4caf50);">${esc(k.paham || k.sudah_paham || '-')}</td>
      <td style="padding:4px 8px;border:1px solid var(--border);color:var(--warning,#f59e0b);">${esc(k.hampir || k.hampir_paham || '-')}</td>
      <td style="padding:4px 8px;border:1px solid var(--border);color:var(--error,#ef4444);">${esc(k.belum || k.belum_paham || '-')}</td>
    </tr>`).join('')}
  </tbody>
</table>
</div>`
        : '';
      const formativeHtml = formative.length
        ? `<div style="font-weight:var(--fw-semibold);font-size:var(--fs-caption);margin-bottom:var(--space-xs);">Formative Checkpoints</div>
${formative.map(f => `<div style="font-size:var(--fs-caption);color:var(--text-secondary);margin-bottom:2px;">• ${esc(f.deskripsi || f.description || f)}</div>`).join('')}`
        : '';
      return kktpHtml + formativeHtml;
    })();

    // ── Materi Pembelajaran ───────────────────────────────────────────────
    const matBodyHtml = (() => {
      const content = mat?.content ?? {};
      const konsep  = content.konsep_inti ?? [];
      const mis     = content.miskonsepsi ?? [];
      const konteks = content.konteks_nyata ?? [];
      if (!konsep.length && !mis.length && !konteks.length) {
        return `<div style="color:var(--text-muted);font-size:var(--fs-caption);">Material Spec belum tersedia.</div>`;
      }
      return `
${konsep.length ? `<div style="font-weight:var(--fw-semibold);font-size:var(--fs-caption);margin-bottom:var(--space-xs);">Konsep Inti</div>
${konsep.map(k => `<div style="font-size:var(--fs-caption);margin-bottom:var(--space-xs);padding:var(--space-xs) var(--space-sm);
  background:var(--surface-1);border-radius:var(--radius-sm);">
  <span style="font-weight:var(--fw-semibold);">${esc(k.judul || k.nama || '-')}</span>
  ${k.penjelasan ? `<br><span style="color:var(--text-secondary);">${esc(k.penjelasan)}</span>` : ''}
  ${k.prasyarat ? `<br><span style="color:var(--text-muted);font-size:var(--fs-badge);">Prasyarat: ${esc(k.prasyarat)}</span>` : ''}
</div>`).join('')}` : ''}
${mis.length ? `<div style="font-weight:var(--fw-semibold);font-size:var(--fs-caption);margin:var(--space-sm) 0 var(--space-xs);">Miskonsepsi Umum</div>
${mis.map(m => `<div style="font-size:var(--fs-caption);color:var(--text-secondary);margin-bottom:2px;">• ${esc(m.deskripsi || m)}</div>`).join('')}` : ''}
${konteks.length ? `<div style="font-weight:var(--fw-semibold);font-size:var(--fs-caption);margin:var(--space-sm) 0 var(--space-xs);">Konteks Nyata</div>
${konteks.map(k => `<div style="font-size:var(--fs-caption);color:var(--text-secondary);margin-bottom:2px;">• ${esc(k.deskripsi || k)}</div>`).join('')}` : ''}`;
    })();

    // ── Per Pertemuan ─────────────────────────────────────────────────────
    function renderMeetingReadOnly(m) {
      const c = m.content ?? {};
      const aktivitas = c.aktivitas ?? c.activities ?? [];
      const formative = c.formative_checkpoint ?? c.formative ?? null;
      const dif = c.diferensiasi ?? c.differentiation ?? {};
      const ws  = c.worksheet ?? null;

      const aktHtml = aktivitas.length
        ? `<div style="overflow-x:auto;margin-bottom:var(--space-sm);">
<table style="width:100%;border-collapse:collapse;font-size:var(--fs-caption);">
  <thead>
    <tr style="background:var(--surface-2);">
      <th style="padding:4px 8px;text-align:left;border:1px solid var(--border);width:20%;">Fase</th>
      <th style="padding:4px 8px;text-align:left;border:1px solid var(--border);width:10%;">Durasi</th>
      <th style="padding:4px 8px;text-align:left;border:1px solid var(--border);">Aktivitas Guru</th>
      <th style="padding:4px 8px;text-align:left;border:1px solid var(--border);">Aktivitas Siswa</th>
    </tr>
  </thead>
  <tbody>
    ${aktivitas.map(a => `
    <tr>
      <td style="padding:4px 8px;border:1px solid var(--border);">${esc(a.fase || a.phase || '-')}</td>
      <td style="padding:4px 8px;border:1px solid var(--border);">${esc(a.durasi_menit ? a.durasi_menit + ' mnt' : a.duration_minutes ? a.duration_minutes + ' mnt' : '-')}</td>
      <td style="padding:4px 8px;border:1px solid var(--border);">${esc(a.guru || a.teacher || '-')}</td>
      <td style="padding:4px 8px;border:1px solid var(--border);">${esc(a.siswa || a.student || '-')}</td>
    </tr>`).join('')}
  </tbody>
</table>
</div>`
        : '';

      const formHtml = formative
        ? `<div style="font-size:var(--fs-caption);color:var(--text-secondary);margin-bottom:var(--space-xs);">
            <span style="font-weight:var(--fw-semibold);">Formative:</span> ${esc(formative.deskripsi || formative.description || String(formative))}</div>`
        : '';

      const difKeys = ['pengayaan','penguatan','pendampingan'];
      const difHtml = difKeys.some(k => dif[k])
        ? `<div style="overflow-x:auto;margin-bottom:var(--space-xs);">
<table style="width:100%;border-collapse:collapse;font-size:var(--fs-caption);">
  <thead>
    <tr style="background:var(--surface-2);">
      ${difKeys.map(k => `<th style="padding:4px 8px;text-align:left;border:1px solid var(--border);">${k.charAt(0).toUpperCase()+k.slice(1)}</th>`).join('')}
    </tr>
  </thead>
  <tbody>
    <tr>
      ${difKeys.map(k => `<td style="padding:4px 8px;border:1px solid var(--border);">${esc(dif[k] || '-')}</td>`).join('')}
    </tr>
  </tbody>
</table>
</div>`
        : '';

      const wsHtml = ws?.required
        ? `<div style="font-size:var(--fs-caption);margin-top:var(--space-xs);">
            <span style="color:var(--gold);font-weight:var(--fw-semibold);">LKS:</span> ${esc(ws.judul || ws.title || 'Ada')}
          </div>`
        : '';

      return aktHtml + formHtml + difHtml + wsHtml
        || `<div style="color:var(--text-muted);font-size:var(--fs-caption);">Konten belum tersedia.</div>`;
    }

    const meetingsHtml = meetings.length
      ? meetings.map(m => acc(
          `meet-${m.meeting_no}`,
          `Pertemuan ${m.meeting_no} — ${m.jp} JP (${m.duration_minutes} menit)`,
          m.content ? renderMeetingReadOnly(m) : `<div style="color:var(--text-muted);font-size:var(--fs-caption);">Belum di-generate.</div>`,
          '✏ Edit Pertemuan',
          m.content ? `goto-meeting-${m.meeting_no}` : null
        )).join('')
      : `<div class="rp-block" style="color:var(--text-muted);font-size:var(--fs-caption);">Rencana pertemuan belum di-generate.</div>`;

    // ── Tindak Lanjut ────────────────────────────────────────────────────
    const fuBodyHtml = (() => {
      const content = fu?.content ?? {};
      const jalur = ['pengayaan','penguatan','pendampingan'];
      if (!jalur.some(k => content[k])) {
        return `<div style="color:var(--text-muted);font-size:var(--fs-caption);">Tindak lanjut belum di-generate.</div>`;
      }
      return `<div style="overflow-x:auto;">
<table style="width:100%;border-collapse:collapse;font-size:var(--fs-caption);">
  <thead>
    <tr style="background:var(--surface-2);">
      ${jalur.map(k => `<th style="padding:4px 8px;text-align:left;border:1px solid var(--border);">${k.charAt(0).toUpperCase()+k.slice(1)}</th>`).join('')}
    </tr>
  </thead>
  <tbody>
    <tr>
      ${jalur.map(k => `<td style="padding:4px 8px;border:1px solid var(--border);vertical-align:top;">${esc(content[k] || '-')}</td>`).join('')}
    </tr>
  </tbody>
</table>
</div>`;
    })();

    // ── Validation status ─────────────────────────────────────────────────
    const valStatus = s.validation ?? {};
    const violations = valStatus.violations ?? [];
    const warnings   = valStatus.warnings ?? [];
    const valHtml = (violations.length || warnings.length)
      ? `<div class="rp-block" id="rp-s7-val">
  <div class="rp-block-title" style="color:var(--error,#ef4444);">Catatan Validasi</div>
  ${violations.map(v => `<div style="font-size:var(--fs-caption);color:var(--error,#ef4444);margin-bottom:2px;">✗ ${esc(v.message || v)}</div>`).join('')}
  ${warnings.map(w => `<div style="font-size:var(--fs-caption);color:var(--warning,#f59e0b);margin-bottom:2px;">⚠ ${esc(w.message || w)}</div>`).join('')}
</div>`
      : '';

    // ── Download + action row ─────────────────────────────────────────────
    const actionHtml = `
<div class="rp-block" id="rp-s7-actions">
  <div id="rp-s7-error" class="error-msg" style="display:none;margin-bottom:var(--space-sm);"></div>
  <div style="display:flex;flex-wrap:wrap;gap:var(--space-sm);">
    <button type="button" class="btn btn-primary" id="rp-btn-download-rpm">↓ Unduh RPM Word</button>
    ${hasLks ? `<button type="button" class="btn btn-secondary" id="rp-btn-download-lks">↓ Unduh LKS Word</button>` : ''}
    <button type="button" class="btn btn-sm" id="rp-s7-btn-reset"
      style="margin-left:auto;color:var(--text-muted);">↺ Mulai dari awal</button>
  </div>
</div>`;

    body.innerHTML =
      identitasHtml +
      statusHtml +
      acc('cp',  'Capaian Pembelajaran (CP)', cpBodyHtml, null, null) +
      acc('atp', 'ATP & TP Terpilih', atpBodyHtml, '✏ Edit ATP', 'goto-step4') +
      acc('ctx', 'Context Specification', ctxBodyHtml, '✏ Edit', ctx?.confirmed ? 'goto-ctx' : null) +
      acc('asm', 'Asesmen + KKTP', asmBodyHtml, '✏ Edit', asm?.confirmed ? 'goto-asm' : null) +
      acc('mat', 'Materi Pembelajaran', matBodyHtml, '✏ Edit', mat?.usable ? 'goto-mat' : null) +
      meetingsHtml +
      acc('fu', 'Tindak Lanjut', fuBodyHtml, '✏ Edit', fu?.content ? 'goto-fu' : null) +
      valHtml +
      actionHtml +
      '<div id="rp-s7-runtime-wrap"></div>';

    // Inject runtime readiness section after action row (only if rpm_ready)
    if (rpmReady) {
      renderRuntimeReadinessSection(el('rp-s7-runtime-wrap'));
    }

    // ── Wire edit buttons ──────────────────────────────────────────────────
    el('rp-s7-edit-identitas')?.addEventListener('click', () => renderStep0());

    body.addEventListener('click', e => {
      const btn = e.target.closest('.rp-s7-edit-btn');
      if (!btn) return;
      const fn = btn.dataset.fn;
      if (fn === 'goto-step4')     { navigateToStep(4); return; }
      if (fn === 'goto-ctx')       { renderContextCheckpoint(); return; }
      if (fn === 'goto-asm')       { renderAssessmentCheckpoint(); return; }
      if (fn === 'goto-mat')       { renderMaterialSpec(); return; }
      if (fn === 'goto-fu')        { renderFollowUpPipeline(); return; }
      if (fn?.startsWith('goto-meeting-')) {
        const no = parseInt(fn.replace('goto-meeting-', ''), 10);
        renderMeetingPipeline();
        // Buka detail meeting yang dituju setelah render
        requestAnimationFrame(() => {
          const det = el(`rp2-meet-detail-${no}`);
          if (det) det.open = true;
        });
      }
    });

    // ── Wire download ─────────────────────────────────────────────────────
    async function triggerDownload(jenis) {
      const btnId = jenis === 'RPM' ? 'rp-btn-download-rpm' : 'rp-btn-download-lks';
      const btn = el(btnId);
      if (!btn) return;
      btn.disabled = true;
      btn.textContent = 'Menyiapkan…';
      try {
        await generateDocxFromPipelineState(_phase2cState, _profil || {}, jenis);
      } catch (err) {
        console.error('[step7] download gagal:', err);
        showError('rp-s7-error', 'Gagal generate dokumen: ' + (err?.message ?? ''));
      } finally {
        btn.disabled = false;
        btn.textContent = jenis === 'RPM' ? '↓ Unduh RPM Word' : '↓ Unduh LKS Word';
      }
    }

    el('rp-btn-download-rpm')?.addEventListener('click', () => triggerDownload('RPM'));
    el('rp-btn-download-lks')?.addEventListener('click', () => triggerDownload('LKS'));

    el('rp-s7-btn-reset')?.addEventListener('click', () => {
      if (confirm('Mulai ulang dari awal? Semua jawaban wizard akan dihapus.')) resetAll();
    });
  }

  // ── Step 7 Legacy: berbasis rancang_dokumen (sistem lama) ─────────────────
  async function renderStep7Legacy() {
    const body = el('rp-body');
    if (!body) return;

    try { _dokumen = await SipApi.getRancangDokumen(_cId) ?? []; } catch (_) {}
    try { _settings = await SipApi.getRancangSettings(_cId) ?? _settings; } catch (_) {}
    try { _profil = await SipApi.getRancangProfil(); } catch (_) {}

    const idSrc = _profil?.is_locked
      ? {
          nama_guru:    _profil.nama_guru    || '',
          nip_guru:     _profil.nip_guru     || '',
          nama_kepsek:  _profil.nama_kepsek  || '',
          nip_kepsek:   _profil.nip_kepsek   || '',
          tahun_ajaran: _profil.tahun_ajaran || '',
          semester:     (_profil.semester_list || []).join(', '),
          kota:         _profil.kota         || '',
        }
      : (_settings || {});

    const identitasHtml = `
<div class="rp-block" id="rp-identitas-block">
  <div class="rp-block-title">Identitas Dokumen</div>
  <p class="rp-block-subtitle">Data diambil dari profil akun Anda.</p>
  <div class="rp-readonly-card">
    ${[
      ['Nama guru',          idSrc.nama_guru    || '—'],
      ['NIP guru',           idSrc.nip_guru     || '—'],
      ['Nama kepala sekolah',idSrc.nama_kepsek  || '—'],
      ['NIP kepala sekolah', idSrc.nip_kepsek   || '—'],
      ['Tahun ajaran',       idSrc.tahun_ajaran || '—'],
      ['Semester',           idSrc.semester     || '—'],
      ['Kota / Kabupaten',   idSrc.kota         || '—'],
    ].map(([lbl, val]) => `
    <div class="rp-readonly-row">
      <span class="rp-readonly-label">${esc(lbl)}</span>
      <span class="rp-readonly-val">${esc(val)}</span>
    </div>`).join('')}
  </div>
</div>`;

    const mapelList = (() => {
      const arr = normalizeArray(_profil?.mapel_list).filter(Boolean);
      return arr.length ? arr : [_ans.mapel || _settings?.mapel || ''].filter(Boolean);
    })();

    function matchesMapel(d, mapel) {
      const judul = d.judul.toLowerCase();
      const m = mapel.toLowerCase();
      // Gunakan startsWith pada bagian setelah " — " agar dokumen lama
      // multi-mapel (judulnya mengandung semua nama mapel) tidak cocok
      // untuk mapel yang bukan bagian pertamanya
      const sepIdx = judul.indexOf(' — ');
      if (sepIdx !== -1) return judul.slice(sepIdx + 3).startsWith(m);
      return judul.includes(m);
    }

    function dokumenKartu(d) {
      const tgl = new Date(d.created_at).toLocaleDateString('id-ID', {
        day: '2-digit', month: 'short', year: 'numeric',
      });
      return `
<div class="rp-dok-kartu" data-id="${esc(d.id)}">
  <div class="rp-dok-info">
    <div class="rp-dok-judul">${esc(d.judul)}</div>
    <div class="rp-dok-meta">${tgl}</div>
  </div>
  <div class="rp-dok-actions">
    <button type="button" class="rp-btn-download" data-id="${esc(d.id)}"
      data-jenis="${esc(d.jenis)}" data-judul="${esc(d.judul)}">⬇ Unduh Word</button>
    <button type="button" class="rp-btn-hapus-dok" data-id="${esc(d.id)}">🗑</button>
  </div>
</div>`;
    }

    // Dropdown mapel (hanya tampil jika lebih dari 1 mapel)
    const mapelDropdown = mapelList.length > 1
      ? `<div style="margin-bottom:var(--space-md)">
           <select id="rp-s7-mapel-sel" class="rp-select" style="width:100%;max-width:320px">
             ${mapelList.map(m => `<option value="${esc(m)}">${esc(m)}</option>`).join('')}
           </select>
         </div>`
      : mapelList.length === 1
        ? `<div style="font-weight:600;color:var(--gold);margin-bottom:var(--space-md)">${esc(mapelList[0])}</div>`
        : '';

    const dokumenHtml = `
<div class="rp-block" id="rp-dok-block">
  <div class="rp-block-title">Dokumen Tersimpan</div>
  ${mapelDropdown}
  <div id="rp-s7-konten"></div>
</div>`;

    body.innerHTML = identitasHtml + dokumenHtml;

    // ── Accordion toggle helper (single-expand dalam container) ───────────────
    function attachAccordionToggle(container, panelSel, headerSel, bodySubSel, chevronSubSel) {
      container.addEventListener('click', e => {
        const header = e.target.closest(headerSel);
        if (!header) return;
        const panel = header.closest(panelSel);
        if (!panel) return;
        const wasOpen = panel.classList.contains('open');
        container.querySelectorAll(panelSel).forEach(p => {
          p.classList.remove('open');
          const b = p.querySelector(bodySubSel);
          if (b) b.style.display = 'none';
          const c = p.querySelector(chevronSubSel);
          if (c) c.textContent = '▶';
        });
        if (!wasOpen) {
          panel.classList.add('open');
          const b = panel.querySelector(bodySubSel);
          if (b) b.style.display = 'block';
          const c = panel.querySelector(chevronSubSel);
          if (c) c.textContent = '▼';
        }
      });
    }

    // ── Render konten per mapel terpilih ──────────────────────────────────────
    async function renderKontenMapel(mapel, isFirst) {
      const kontenEl = document.getElementById('rp-s7-konten');
      if (!kontenEl) return;
      kontenEl.innerHTML = '<div class="rp-dok-kosong">Memuat…</div>';

      const cpDocs  = _dokumen.filter(d => d.jenis === 'CP'  && matchesMapel(d, mapel));
      const atpDocs = _dokumen.filter(d => d.jenis === 'TP'  && matchesMapel(d, mapel));
      const atpDoc  = atpDocs[0] || null;

      // RPM unmatched (tidak cocok ke mapel mana pun) → masuk mapel pertama
      const rpmUnmatched = isFirst
        ? _dokumen.filter(d => d.jenis === 'RPM' && !mapelList.some(m => matchesMapel(d, m)))
        : [];

      // Ambil daftar TP dari konten dokumen ATP
      let tpList = [];
      if (atpDoc) {
        try {
          const konten = await SipApi.getRancangDokumenKonten(atpDoc.id);
          tpList = Array.isArray(konten?.atp) ? konten.atp : [];
        } catch (_) {}
      }

      // Sub-accordion TP di dalam body ATP
      function tpSubAccordions() {
        const rpmAll = [
          ..._dokumen.filter(d => d.jenis === 'RPM' && matchesMapel(d, mapel)),
          ...rpmUnmatched,
        ];

        if (!tpList.length) {
          // Fallback: tampilkan RPM langsung tanpa sub-accordion TP
          return rpmAll.length
            ? rpmAll.map(dokumenKartu).join('')
            : `<div class="rp-dok-kosong">Belum tersedia. <button type="button" class="rp-link-btn" data-goto="4">→ Rancang RPM</button></div>`;
        }

        return `<div class="rp-s7-tp-group" style="margin-top:var(--space-sm)">
${tpList.map((tp, i) => {
  const rpmDocs = _dokumen.filter(d =>
    d.jenis === 'RPM' && (d.tp_id === tp.id || d.tp_id === tp.judul)
  );
  const rpmHtml = rpmDocs.length
    ? rpmDocs.map(dokumenKartu).join('')
    : `<div class="rp-dok-kosong">Belum tersedia. <button type="button" class="rp-link-btn" data-goto="4">→ Rancang RPM</button></div>`;
  return `<div class="rp-s7-tp-panel" style="border-left:2px solid var(--border);margin-bottom:var(--space-xs)">
  <div class="rp-s7-tp-header" style="display:flex;align-items:center;gap:var(--space-xs);padding:var(--space-xs) var(--space-sm);cursor:pointer;user-select:none">
    <span class="rp-s7-tp-chevron" style="font-size:0.7em;color:var(--text-secondary)">▶</span>
    <span style="font-size:var(--fs-caption);color:var(--text-secondary)">TP ${i + 1} — ${esc(tp.judul || '')}</span>
  </div>
  <div class="rp-s7-tp-body" style="display:none;padding:0 var(--space-sm) var(--space-sm)">${rpmHtml}</div>
</div>`;
}).join('')}
</div>`;
      }

      // Body accordion ATP
      const atpBodyHtml = atpDoc
        ? `<div style="display:flex;gap:var(--space-xs);margin-bottom:var(--space-sm)">
             <button type="button" class="rp-btn-download" data-id="${esc(atpDoc.id)}"
               data-jenis="${esc(atpDoc.jenis)}" data-judul="${esc(atpDoc.judul)}">⬇ Unduh Word</button>
             <button type="button" class="rp-btn-hapus-dok" data-id="${esc(atpDoc.id)}">🗑</button>
           </div>
           ${tpSubAccordions()}`
        : `<div class="rp-dok-kosong">Belum tersedia. <button type="button" class="rp-link-btn" data-goto="4">→ Generate ATP</button></div>`;

      const cpTitle  = 'Capaian Pembelajaran';
      const atpTitle = 'Alur Tujuan Pembelajaran';

      kontenEl.innerHTML = `
<div class="rp-s7-acc-group">
  <div class="rp-s7-acc-panel" style="border:1px solid var(--border);border-radius:var(--radius-sm);margin-bottom:var(--space-xs);overflow:hidden">
    <div class="rp-s7-acc-header" style="display:flex;align-items:center;gap:var(--space-xs);padding:var(--space-sm) var(--space-md);cursor:pointer;user-select:none;background:var(--surface-2)">
      <span class="rp-s7-acc-chevron" style="font-size:0.75em;color:var(--text-secondary)">▶</span>
      <span style="font-weight:600;font-size:var(--fs-body)">${cpTitle}</span>
    </div>
    <div class="rp-s7-acc-body" style="display:none;padding:var(--space-sm) var(--space-md)">
      ${cpDocs.length ? cpDocs.map(dokumenKartu).join('') : `<div class="rp-dok-kosong">Belum tersedia</div>`}
    </div>
  </div>
  <div class="rp-s7-acc-panel" style="border:1px solid var(--border);border-radius:var(--radius-sm);margin-bottom:var(--space-xs);overflow:hidden">
    <div class="rp-s7-acc-header" style="display:flex;align-items:center;gap:var(--space-xs);padding:var(--space-sm) var(--space-md);cursor:pointer;user-select:none;background:var(--surface-2)">
      <span class="rp-s7-acc-chevron" style="font-size:0.75em;color:var(--text-secondary)">▶</span>
      <span style="font-weight:600;font-size:var(--fs-body)">${atpTitle}</span>
    </div>
    <div class="rp-s7-acc-body" style="display:none;padding:var(--space-sm) var(--space-md)">
      ${atpBodyHtml}
    </div>
  </div>
</div>`;

      // Level 1: CP / ATP single-expand
      attachAccordionToggle(kontenEl, '.rp-s7-acc-panel', '.rp-s7-acc-header', '.rp-s7-acc-body', '.rp-s7-acc-chevron');

      // Level 2: TP single-expand (dalam masing-masing ATP body)
      kontenEl.querySelectorAll('.rp-s7-tp-group').forEach(group => {
        attachAccordionToggle(group, '.rp-s7-tp-panel', '.rp-s7-tp-header', '.rp-s7-tp-body', '.rp-s7-tp-chevron');
      });

      // data-goto
      kontenEl.querySelectorAll('[data-goto]').forEach(btn => {
        btn.addEventListener('click', () => {
          const n = parseInt(btn.dataset.goto);
          if (n) navigateToStep(n);
        });
      });

      // Download Word
      kontenEl.querySelectorAll('.rp-btn-download').forEach(btn => {
        btn.addEventListener('click', async () => {
          const docId = btn.dataset.id;
          const jenis = btn.dataset.jenis;
          const judul = btn.dataset.judul;
          btn.disabled = true;
          btn.textContent = 'Memuat…';
          try {
            const konten = await SipApi.getRancangDokumenKonten(docId);
            if (!konten) throw new Error('konten kosong');
            const identitasDoc = _profil?.is_locked
              ? {
                  ...(_settings || {}),
                  nama_guru:    _profil.nama_guru    || '',
                  nip_guru:     _profil.nip_guru     || '',
                  nama_kepsek:  _profil.nama_kepsek  || '',
                  nip_kepsek:   _profil.nip_kepsek   || '',
                  tahun_ajaran: _profil.tahun_ajaran || '',
                  semester:     (_profil.semester_list || []).join(', '),
                  kota:         _profil.kota         || '',
                }
              : (_settings || {});
            await generateDocxRancang(konten, jenis, judul, identitasDoc);
            btn.disabled = false;
            btn.textContent = '⬇ Unduh Word';
          } catch (e) {
            console.error('[rancang] download gagal:', e);
            btn.disabled = false;
            btn.textContent = '⬇ Unduh Word';
          }
        });
      });

      // Hapus dokumen
      kontenEl.querySelectorAll('.rp-btn-hapus-dok').forEach(btn => {
        btn.addEventListener('click', async () => {
          const docId = btn.dataset.id;
          if (!confirm('Hapus dokumen ini?')) return;
          try {
            await SipApi.hapusRancangDokumen(docId);
            _dokumen = _dokumen.filter(d => d.id !== docId);
            const kartu = btn.closest('.rp-dok-kartu');
            if (kartu) {
              kartu.remove();
            } else {
              // tombol ATP di luar kartu — re-render
              await renderKontenMapel(mapel, isFirst);
            }
          } catch (e) {
            console.error('[rancang] hapus gagal:', e);
          }
        });
      });
    }

    if (mapelList.length) {
      await renderKontenMapel(mapelList[0], true);
    }

    document.getElementById('rp-s7-mapel-sel')?.addEventListener('change', e => {
      const mapel = e.target.value;
      renderKontenMapel(mapel, mapelList.indexOf(mapel) === 0);
    });
  }

  function buildOutputSection(id, title, bodyHtml) {
    return `<div class="rp-output-section" id="${id}">
  <div class="rp-output-header">
    <div class="rp-output-title">${title}</div>
    <div class="rp-output-chevron">▼</div>
  </div>
  <div class="rp-output-body">${bodyHtml}</div>
</div>`;
  }

  // ─── Reset ──────────────────────────────────────────────────────────────────

  function resetAll() {
    cleanupAllDropdowns();
    if (_cId) { try { localStorage.removeItem('rp_state_' + _cId); } catch (_) {} }
    Object.assign(_ans, { mapel:'', mapelKey:'', bidangKeahlian:null, programKeahlian:null, jenjang:'', fase:'', elemenTerpilih:[], smk:null, niat_guru:{}, preferensi:{}, tp_terpilih:null, konteks_kelas:{} });
    _cpElemen = []; _cpRingkasan = []; _cpLabel = ''; _cpUmum = ''; _atpList = []; _rencana = null;
    _genCp = false; _genAtp = false; _genRencana = false;
    _settings = null;
    _teachingContext = null; _durableAtp = null; _planningContext = null; _jpPolicy = null;
    _step = 1;
    renderStep1();
  }

  // ─── Persist & Restore ──────────────────────────────────────────────────────

  function saveRpState() {
    if (!_cId) return;
    try {
      localStorage.setItem('rp_state_' + _cId, JSON.stringify({
        step: _step, ans: _ans, atpList: _atpList,
        cpElemen: _cpElemen, cpRingkasan: _cpRingkasan,
        cpLabel: _cpLabel, cpUmum: _cpUmum,
        rencana: _rencana,
        durableAtp: _durableAtp,
        teachingContext: _teachingContext,
        planningContext: _planningContext,
        jpPolicy: _jpPolicy,
        phase2cState: _phase2cState,
      }));
    } catch (_) {}
  }

  async function restoreRpState() {
    if (!_cId) return false;
    let saved;
    try {
      const raw = localStorage.getItem('rp_state_' + _cId);
      if (!raw) return false;
      saved = JSON.parse(raw);
    } catch (_) {
      try { localStorage.removeItem('rp_state_' + _cId); } catch (_) {}
      return false;
    }
    const { step, ans, atpList, cpElemen, cpRingkasan, cpLabel, cpUmum, rencana, durableAtp, teachingContext, planningContext, jpPolicy, phase2cState } = saved || {};
    if (!step || !ans) return false;

    const serverDurableAtp = _durableAtp;
    const serverAtpList = _atpList;
    const serverTeachingContext = _teachingContext;
    const serverPlanningContext = _planningContext;
    const serverJpPolicy = _jpPolicy;
    const serverSelectedTp = _ans.tp_terpilih;
    Object.assign(_ans, ans);
    if (serverPlanningContext && serverSelectedTp) _ans.tp_terpilih = serverSelectedTp;
    _atpList = serverDurableAtp ? serverAtpList : (Array.isArray(atpList) ? atpList : []);
    if (serverDurableAtp && !_ans.tp_terpilih?.id) _ans.tp_terpilih = null;
    _cpElemen = Array.isArray(cpElemen) ? cpElemen : [];
    _cpRingkasan = Array.isArray(cpRingkasan) ? cpRingkasan : [];
    _cpLabel = cpLabel || '';
    _cpUmum = cpUmum || '';
    _rencana = rencana || null;
    _durableAtp = serverDurableAtp || durableAtp || null;
    _teachingContext = serverTeachingContext || teachingContext || null;
    _planningContext = serverPlanningContext || planningContext || null;
    _jpPolicy = serverJpPolicy || jpPolicy || null;
    // Cache only — tandai stale jika step >= 6 agar tidak dirender langsung;
    // server state akan di-refresh saat enterPhase2CPipeline dipanggil.
    if (phase2cState && step >= 6) {
      _phase2cState = { ...phase2cState, _stale: true };
    } else {
      _phase2cState = phase2cState || null;
    }
    _step = (serverDurableAtp && step > 4 && !_ans.tp_terpilih) ? 4 : step;

    switch (_step) {
      case 2: renderStep2(); break;
      case 3: renderStep3A(); break;
      case 4: if (_atpList.length) { renderStep4(_atpList); } else { renderStep1(); } break;
      case 5: renderStep5(); break;
      case 6: if (_planningContext?.id) { enterPhase2CPipeline(); } else if (_rencana) { renderStep6(_rencana); } else if (_atpList.length) { renderStep4(_atpList); } else { renderStep1(); } break;
      case 7: renderStep7(); break;
      default: renderStep1(); break;
    }

    if (_cpElemen.length && _cpLabel) {
      const wrap = el('rp-body')?.querySelector('.rp-block');
      if (wrap && !el('rp-cp-preview')) {
        const div = document.createElement('div');
        div.id = 'rp-cp-preview';
        div.className = 'rp-cp-card';
        wrap.appendChild(div);
      }
      renderCpPreview(_cpLabel, _cpUmum);
    }

    return true;
  }

  // ── C1. prepareRuntimePackage ───────────────────────────────────────────────
  // Compile (or return cached) RuntimePackage for a given meeting_no.
  // Skips compile if source hash still matches the stored package.

  async function prepareRuntimePackage(meetingNo) {
    if (!window.RuntimeCompiler || !window.RuntimeDb) {
      throw new Error('runtime-compiler.js / runtime-db.js belum dimuat');
    }

    const planCtxId = _planningContext?.id;
    if (!planCtxId) throw new Error('Planning context belum tersedia');

    const s       = _phase2cState;
    const meetPlan = (s?.meeting_plans ?? []).find(m => m.meeting_no === meetingNo);
    if (!meetPlan?.artifact_id) {
      throw new Error(`Rencana pertemuan ${meetingNo} belum di-generate`);
    }

    // Compute a simple hash of the meeting plan content for staleness check
    const contentStr   = JSON.stringify(meetPlan.content ?? {});
    const sourceHash   = await _simpleHash(contentStr);

    // Check existing package in IndexedDB
    const existing = await window.RuntimeDb.packages.getForMeeting(planCtxId, meetingNo);
    if (existing && existing.source?.meeting_plan_source_hash === sourceHash) {
      return existing;
    }

    // Load artifact versions
    const [mpContent, asmContent, ctxContent] = await Promise.all([
      meetPlan.content
        ? Promise.resolve(meetPlan.content)
        : SipApi.getArtifactContent(meetPlan.version_id).catch(() => null),
      s?.assessment_spec?.version_id
        ? SipApi.getArtifactContent(s.assessment_spec.version_id).catch(() => null)
        : Promise.resolve(s?.assessment_spec?.content ?? null),
      s?.context_spec?.version_id
        ? SipApi.getArtifactContent(s.context_spec.version_id).catch(() => null)
        : Promise.resolve(s?.context_spec?.content ?? null),
    ]);

    if (!mpContent) throw new Error(`Konten rencana pertemuan ${meetingNo} tidak tersedia`);

    // Load roster snapshot (id + nama only)
    let rosterSnapshot = [];
    try {
      rosterSnapshot = await SipApi.getRosterForRuntime(_cId);
    } catch (_) {}

    // Find meeting allocation
    const alloc = (s?.meeting_allocation?.items ?? []).find(a => a.meeting_no === meetingNo)
      ?? { jp: meetPlan.jp ?? 1, duration_minutes: meetPlan.duration_minutes ?? 45,
           meeting_allocation_item_id: meetPlan.meeting_allocation_item_id ?? null };

    // TP snapshot
    const tp = _ans.tp_terpilih;
    const tpSnapshot = tp
      ? { judul: tp.judul, deskripsi: tp.deskripsi, elemen_cp: tp.elemen_cp }
      : {};

    const pkg = await window.RuntimeCompiler.compileRuntimePackage({
      meetingPlanArtifact: {
        version_id:  meetPlan.version_id ?? meetPlan.artifact_id,
        content:     mpContent,
        source_hash: sourceHash,
        meeting_no:  meetingNo,
      },
      meetingAllocationItem: {
        jp:                        alloc.jp,
        duration_minutes:          alloc.duration_minutes,
        meeting_allocation_item_id: alloc.meeting_allocation_item_id,
      },
      assessmentSpecVersion: {
        version_id:           s?.assessment_spec?.version_id ?? null,
        content:              asmContent,
        planning_context_id:  planCtxId,
      },
      contextSpecVersion: {
        version_id:           s?.context_spec?.version_id ?? null,
        content:              ctxContent,
        planning_context_id:  planCtxId,
      },
      tpSnapshot,
      rosterSnapshot,
    });

    // Patch source hash into package before storing
    pkg.source.meeting_plan_source_hash = sourceHash;
    pkg.planning_context_id             = planCtxId;

    await window.RuntimeDb.packages.save(pkg);
    return pkg;
  }

  async function _simpleHash(str) {
    try {
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
      return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
    } catch (_) {
      // Fallback: lightweight djb2-style hash if SubtleCrypto unavailable
      let h = 5381;
      for (let i = 0; i < str.length; i++) h = ((h << 5) + h) ^ str.charCodeAt(i);
      return (h >>> 0).toString(16);
    }
  }

  // ── C2. getRuntimeReadiness ─────────────────────────────────────────────────

  async function getRuntimeReadiness() {
    const s        = _phase2cState;
    const planCtxId = _planningContext?.id;
    const meetings  = s?.meeting_plans ?? [];
    const rpmReady  = s?.rpm_ready_for_class === true;

    const packages_ready = {};
    for (const m of meetings) {
      let compiled = false;
      let stale    = false;
      let pkgId    = null;
      if (planCtxId && window.RuntimeDb) {
        try {
          const pkg = await window.RuntimeDb.packages.getForMeeting(planCtxId, m.meeting_no);
          if (pkg) {
            pkgId    = pkg.package_id;
            compiled = true;
            // Stale check: content hash mismatch
            const currentHash = await _simpleHash(JSON.stringify(m.content ?? {}));
            stale = pkg.source?.meeting_plan_source_hash !== currentHash;
          }
        } catch (_) {}
      }
      packages_ready[m.meeting_no] = { compiled, stale, package_id: pkgId };
    }

    const all_compiled = meetings.length > 0
      && meetings.every(m => packages_ready[m.meeting_no]?.compiled && !packages_ready[m.meeting_no]?.stale);

    return { rpm_ready: rpmReady, packages_ready, all_compiled };
  }

  // ── C3. Runtime readiness section (injected into Step 7 after download row) ─

  async function renderRuntimeReadinessSection(containerEl) {
    if (!containerEl) return;

    const rdb = window.RuntimeDb;
    if (!rdb) {
      containerEl.innerHTML = `<div class="rp-block" style="color:var(--text-muted);font-size:var(--fs-caption);">
        Runtime offline tidak tersedia di browser ini.</div>`;
      return;
    }

    const readiness = await getRuntimeReadiness();
    const meetings  = _phase2cState?.meeting_plans ?? [];

    const meetingRows = meetings.map(m => {
      const r       = readiness.packages_ready[m.meeting_no] ?? {};
      const ready   = r.compiled && !r.stale;
      const stale   = r.compiled && r.stale;
      const status  = ready
        ? `<span style="color:var(--success,#4caf50);">✓ Siap offline</span>`
        : stale
        ? `<span style="color:var(--warning,#f59e0b);">⟳ Perlu diperbarui</span>`
        : `<span style="color:var(--text-muted);">— Belum disiapkan</span>`;
      const mulaiBtn = ready || stale
        ? `<button type="button" class="btn btn-sm btn-primary btn-runtime-launch"
             data-meeting="${m.meeting_no}"
             style="font-size:var(--fs-badge);">▶ Mulai Kelas</button>`
        : '';
      return `
<div style="display:flex;align-items:center;justify-content:space-between;
  padding:var(--space-xs) 0;border-bottom:1px solid var(--border);">
  <span style="font-size:var(--fs-caption);">Pertemuan ${m.meeting_no}
    (${m.jp} JP / ${m.duration_minutes} mnt)</span>
  <div style="display:flex;align-items:center;gap:var(--space-sm);flex-wrap:wrap;">
    <span style="font-size:var(--fs-caption);">${status}</span>
    <button type="button" class="btn btn-sm btn-runtime-prepare"
      data-meeting="${m.meeting_no}"
      style="font-size:var(--fs-badge);">${ready ? '↺ Perbarui' : 'Siapkan'}</button>
    ${mulaiBtn}
  </div>
</div>`;
    }).join('');

    containerEl.innerHTML = `
<div class="rp-block" id="rp-s7-runtime" style="margin-top:var(--space-md);">
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:var(--space-sm);">
    <div class="rp-block-title" style="margin:0;">Siapkan untuk Kelas (Offline)</div>
    <button type="button" class="btn btn-sm btn-primary" id="rp-btn-prepare-all">
      Siapkan semua pertemuan
    </button>
  </div>
  <div id="rp-runtime-msg" style="display:none;font-size:var(--fs-caption);margin-bottom:var(--space-xs);"></div>
  <div id="rp-runtime-rows">${meetingRows || '<div style="color:var(--text-muted);font-size:var(--fs-caption);">Belum ada rencana pertemuan.</div>'}</div>
</div>`;

    // Wire: prepare single meeting
    containerEl.querySelectorAll('.btn-runtime-prepare').forEach(btn => {
      btn.addEventListener('click', async () => {
        const no = parseInt(btn.dataset.meeting, 10);
        btn.disabled = true;
        btn.textContent = '…';
        const msgEl = containerEl.querySelector('#rp-runtime-msg');
        try {
          await prepareRuntimePackage(no);
          if (msgEl) { msgEl.style.display = ''; msgEl.textContent = `✓ Pertemuan ${no} siap offline.`; }
          await renderRuntimeReadinessSection(containerEl);
        } catch (err) {
          if (msgEl) { msgEl.style.display = ''; msgEl.textContent = `✗ Gagal: ${err?.message ?? err}`; }
          btn.disabled = false;
          btn.textContent = 'Siapkan';
        }
      });
    });

    // Wire: launch runtime
    containerEl.querySelectorAll('.btn-runtime-launch').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!window.RuntimeUI) {
          alert('runtime-ui.js belum dimuat. Reload halaman.');
          return;
        }
        const no = parseInt(btn.dataset.meeting, 10);
        btn.disabled = true;
        const msgEl = containerEl.querySelector('#rp-runtime-msg');
        try {
          let pkg = await window.RuntimeDb.packages.getForMeeting(_planningContext?.id, no);
          if (!pkg) {
            if (msgEl) { msgEl.style.display = ''; msgEl.textContent = `Menyiapkan pertemuan ${no}…`; }
            pkg = await prepareRuntimePackage(no);
          }
          await window.RuntimeUI.launchRuntime(pkg);
        } catch (err) {
          if (msgEl) { msgEl.style.display = ''; msgEl.textContent = `✗ Gagal: ${err?.message ?? err}`; }
          console.error('[runtime] launch gagal:', err);
        } finally {
          btn.disabled = false;
        }
      });
    });

    // Wire: prepare all
    containerEl.querySelector('#rp-btn-prepare-all')?.addEventListener('click', async () => {
      const allBtn = containerEl.querySelector('#rp-btn-prepare-all');
      const msgEl  = containerEl.querySelector('#rp-runtime-msg');
      if (allBtn) allBtn.disabled = true;
      let ok = 0; let fail = 0;
      for (const m of meetings) {
        try {
          if (msgEl) { msgEl.style.display = ''; msgEl.textContent = `Menyiapkan pertemuan ${m.meeting_no}…`; }
          await prepareRuntimePackage(m.meeting_no);
          ok++;
        } catch (err) {
          fail++;
          console.warn(`[runtime] prepare meeting ${m.meeting_no} gagal:`, err);
        }
      }
      if (msgEl) {
        msgEl.style.display = '';
        msgEl.textContent = fail === 0
          ? `✓ Semua ${ok} pertemuan siap offline.`
          : `${ok} siap, ${fail} gagal. Cek konsol untuk detail.`;
      }
      await renderRuntimeReadinessSection(containerEl);
    });
  }

  // ─── Init ───────────────────────────────────────────────────────────────────

  async function initRancangTab(cId) {
    if (_initializing || _loaded) return;
    _initializing = true;
    try {
      _cId = cId;
      const panel = el('panel-rancang');
      if (!panel) return;
      panel.innerHTML = `
<div class="rp-step-bar" id="rp-step-bar"></div>
<div id="rp-body"></div>`;

      // Fetch profil (per akun), settings & dokumen paralel
      try {
        const [profil, settings, dokumen] = await Promise.all([
          SipApi.getRancangProfil(),
          SipApi.getRancangSettings(_cId),
          SipApi.getRancangDokumen(_cId),
        ]);
        _profil   = profil;
        _settings = settings;
        _dokumen  = dokumen ?? [];

        // Pre-fill _ans: profil (step 0) diutamakan, fallback ke settings
        if (_profil?.is_locked) {
          _ans.jenjang         = _profil.jenjang          || '';
          _ans.mapelKey        = _profil.mapel_key         || '';
          _ans.mapel           = _profil.mapel             || '';
          _ans.fase            = _profil.fase              || '';
          _ans.bidangKeahlian  = _profil.bidang_keahlian   || null;
          _ans.programKeahlian = _profil.program_keahlian  || null;
          _ans.elemenTerpilih  = normalizeArray(_profil.elemen_terpilih);
          try {
            _teachingContext = await SipApi.getTeachingContextForClassroom(_cId, _ans.mapelKey);
            if (_teachingContext?.id) {
              const latest = await SipApi.phase2aPlanning({ action:'get_latest_atp', classroom_id:_cId,
                teaching_context_id:_teachingContext.id });
              if (latest?.tp_list?.length) {
                _durableAtp = { atp_id:latest.atp_id, atp_revision_id:latest.atp_revision_id };
                _atpList = latest.tp_list;
              }
              const latestPlanning = await SipApi.phase2aPlanning({ action:'get_latest_planning_context', classroom_id:_cId,
                teaching_context_id:_teachingContext.id });
              if (latestPlanning?.planning_context) {
                if (latestPlanning.durable_atp?.tp_list?.length) {
                  _durableAtp = { atp_id:latestPlanning.durable_atp.atp_id, atp_revision_id:latestPlanning.durable_atp.atp_revision_id };
                  _atpList = latestPlanning.durable_atp.tp_list;
                }
                _planningContext = latestPlanning.planning_context;
                _jpPolicy = latestPlanning.jp_policy;
                const pc = _planningContext;
                _ans.tp_terpilih = latestPlanning.selected_tp ||
                  _atpList.find(tp => tp.id === pc.tp_id && tp.revision_id === pc.selected_tp_revision_id) || null;
                _ans.niat_guru = pc.teacher_intent_snapshot || {};
                _ans.preferensi = pc.preferences_snapshot || {};
                _ans.konteks_kelas = pc.class_context_snapshot || {};
                _ans.smk = pc.smk_context_snapshot || null;
              }
            }
          } catch (e) { console.warn('[rancang] durable ATP belum dapat dimuat:', e); }
        } else if (_settings) {
          if (_settings.jenjang)          _ans.jenjang          = _settings.jenjang;
          if (_settings.mapel_key)        _ans.mapelKey         = _settings.mapel_key;
          if (_settings.mapel)            _ans.mapel            = _settings.mapel;
          if (_settings.fase)             _ans.fase             = _settings.fase;
          if (_settings.bidang_keahlian)  _ans.bidangKeahlian   = _settings.bidang_keahlian;
          if (_settings.program_keahlian) _ans.programKeahlian  = _settings.program_keahlian;
          if (Array.isArray(_settings.elemen_terpilih) && _settings.elemen_terpilih.length)
            _ans.elemenTerpilih = _settings.elemen_terpilih;
        }
      } catch (_) {
        _profil   = null;
        _settings = null;
        _dokumen  = [];
      }

      // Jika step 0 belum diisi → tampilkan step 0, skip restore & auto-fill
      if (!_profil?.is_locked) {
        renderStep0();
        _loaded = true;
        return;
      }

      const restored = await restoreRpState();

      // Auto-fill dari identitas kelas — SETELAH restore (hanya jika profil tidak ada)
      if (!_ans.mapel) {
        if (window._classroomMapelKey) {
          _ans.mapelKey = window._classroomMapelKey;
          _ans.mapel    = window._classroomSubject || window._classroomMapelKey;
          if (!_ans.jenjang         && window._classroomJenjang)  _ans.jenjang         = window._classroomJenjang;
          if (!_ans.bidangKeahlian  && window._classroomBidang)   _ans.bidangKeahlian  = window._classroomBidang;
          if (!_ans.programKeahlian && window._classroomProgram)  _ans.programKeahlian = window._classroomProgram;
        } else if (window._classroomSubject) {
          const guessedKey = normalizeMapelKey(window._classroomSubject);
          if (guessedKey) {
            _ans.mapelKey = guessedKey;
            _ans.mapel    = window._classroomSubject;
            const nm = (window._classroomName || '').toLowerCase();
            if (!_ans.jenjang) {
              if (nm.includes('smk'))      _ans.jenjang = 'SMK';
              else if (nm.includes('sma')) _ans.jenjang = 'SMA';
              else if (nm.includes('smp') || /kelas [789]/.test(nm)) _ans.jenjang = 'SMP';
              else if (nm.includes('sd')  || /kelas [123456]/.test(nm)) _ans.jenjang = 'SD';
            }
          }
        }
      }

      if (!restored || _step === 1) {
        if (_planningContext && _ans.tp_terpilih) { _step = 5; renderStep5(); }
        else renderStep1();
      }
      _loaded = true;
    } finally {
      _initializing = false;
    }
  }

  // ─── DOMContentLoaded ───────────────────────────────────────────────────────

  window.addEventListener('DOMContentLoaded', async function () {
    const tabRancang   = document.getElementById('tab-rancang');
    const panelRancang = document.getElementById('panel-rancang');

    // Daftar semua panel lain agar bisa hide saat tab ini aktif
    const otherPanels = ['panel-siswa','panel-jadwal','panel-catatan','panel-penilaian']
      .map(id => document.getElementById(id)).filter(Boolean);
    const otherTabs = ['tab-siswa','tab-jadwal','tab-catatan','tab-penilaian']
      .map(id => document.getElementById(id)).filter(Boolean);

    if (!tabRancang || !panelRancang) return;

    // Saat tab Rancang diklik — sembunyikan semua panel lain
    tabRancang.addEventListener('click', async () => {
      window.currentTab = 'rancang';
      otherTabs.forEach(t => t.classList.remove('active'));
      tabRancang.classList.add('active');
      otherPanels.forEach(p => { p.style.display = 'none'; });
      panelRancang.style.display = '';

      const cId = new URLSearchParams(window.location.search).get('id');
      if (cId) try { localStorage.setItem('sip_tab_' + cId, 'rancang'); } catch (_) {}

      // Trial gate — server authoritative; cache hanya diisi ulang oleh RPC.
      let _ts = null;
      try { _ts = await window.api.getTrialStatus(); } catch (_) {}
      if (_ts && _ts.status === 'EXPIRED') {
        panelRancang.innerHTML =
          '<div class="upgrade-tier-banner">' +
          '<strong>Akun Tidak Aktif</strong>' +
          '<p>Akun Anda tidak aktif. Hubungi admin untuk mengaktifkan kembali.</p>' +
          '</div>';
        return;
      }
      if (_ts && _ts.tier === 'TRIAL') {
        panelRancang.innerHTML =
          '<div class="upgrade-tier-banner">' +
          '<strong>Fitur Premium</strong>' +
          '<p>Tab ini tersedia untuk Guru Go dan Guru Pro. Upgrade untuk mengakses fitur lengkap.</p>' +
          '<button class="btn-upgrade" onclick="alert(\'Hubungi admin untuk upgrade: teguhalficahlin@gmail.com\')">Lihat paket</button>' +
          '</div>';
        return;
      }

      if (!_loaded) {
        if (!cId) return;
        await initRancangTab(cId);
      }
    });

    // Saat tab LAIN diklik — sembunyikan panel Rancang
    otherTabs.forEach(t => {
      t.addEventListener('click', () => {
        tabRancang.classList.remove('active');
        panelRancang.style.display = 'none';
      });
    });

    // Restore dari localStorage
    const cId = new URLSearchParams(window.location.search).get('id');
    if (cId) {
      const savedTab = localStorage.getItem('sip_tab_' + cId);
      if (savedTab === 'rancang') tabRancang.click();
    }
  });

}());
