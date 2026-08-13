(function () {
  'use strict';

  // ─── State ──────────────────────────────────────────────────────────────────

  let _cId = null;
  let _loaded = false;

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

  // Step saat ini: 1–6
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

  const STEPS = ['Konteks','SMK','Prefer.','ATP','Kelas','Output'];

  function isStepNavigable(n) {
    switch (n) {
      case 1: return true;
      case 2: return !!_ans.mapel && _ans.jenjang === 'SMK';
      case 3: return !!_ans.mapel;
      case 4: return _atpList.length > 0;
      case 5: return !!_ans.tp_terpilih;
      case 6: return !!_rencana;
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

  function attachLainnya(wrap, placeholder) {
    const multi = wrap.dataset.multi === '1';
    const chip = document.createElement('div');
    chip.className = 'rp-chip';
    chip.textContent = 'Lainnya';
    chip.dataset.value = 'Lainnya';
    chip.dataset.isLainnya = '1';
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'rp-lainnya-input rp-input';
    input.placeholder = placeholder;
    chip.addEventListener('click', () => {
      if (!multi) wrap.querySelectorAll('.rp-chip').forEach(c => c.classList.remove('selected'));
      chip.classList.toggle('selected');
      const show = chip.classList.contains('selected');
      input.style.display = show ? 'block' : 'none';
      if (show) input.focus(); else input.value = '';
    });
    wrap.appendChild(chip);
    wrap.parentElement.appendChild(input);
    return wrap;
  }

  // Pre-select chips dari nilai tersimpan (string atau array).
  // Nilai bebas (bukan value chip standar) → pilih chip Lainnya + isi input.
  function restoreChips(groupEl, savedValues) {
    if (!groupEl) return;
    const vals = Array.isArray(savedValues)
      ? savedValues.filter(Boolean)
      : (savedValues ? [savedValues] : []);
    if (!vals.length) return;

    const standardChips = [...groupEl.querySelectorAll('.rp-chip')].filter(c => c.dataset.isLainnya !== '1');
    const standardValues = new Set(standardChips.map(c => c.dataset.value));
    const lainnyaChip = groupEl.querySelector('.rp-chip[data-is-lainnya="1"]');
    const lainnyaInput = groupEl.parentElement?.querySelector('.rp-lainnya-input');
    const freeTexts = [];

    vals.forEach(v => {
      if (standardValues.has(v)) {
        standardChips.find(c => c.dataset.value === v)?.classList.add('selected');
      } else if (v === 'Lainnya') {
        lainnyaChip?.classList.add('selected');
      } else {
        freeTexts.push(v);
      }
    });

    if (freeTexts.length && lainnyaChip) {
      lainnyaChip.classList.add('selected');
      if (lainnyaInput) {
        lainnyaInput.value = freeTexts[0];
        lainnyaInput.style.display = 'block';
      }
    }
  }

  // ─── Step 1 — Identitas Konteks ─────────────────────────────────────────────

  function renderStep1() {
    _step = 1;
    renderStepBar();
    const body = el('rp-body');
    if (!body) return;

    body.innerHTML = `
<div class="rp-block">
  <div class="rp-block-title">Identitas Konteks Pembelajaran</div>
  <div class="rp-q" id="rp-q-p1">
    <label class="rp-q-label" style="color:var(--gold)" for="rp-jenjang-sel">1. Jenjang sekolah</label>
    <select class="rp-select" id="rp-jenjang-sel">
      <option value="">— Pilih jenjang —</option>
      ${['SD','SMP','SMA','SMK'].map(j =>
        `<option value="${j}"${_ans.jenjang===j?' selected':''}>${j}</option>`
      ).join('')}
    </select>
  </div>
  <div id="rp-step1-error" class="error-msg" style="display:none;"></div>
</div>`;

    el('rp-jenjang-sel').addEventListener('change', e => {
      _ans.jenjang = e.target.value;
      _ans.bidangKeahlian = null;
      _ans.programKeahlian = null;
      _ans.mapelKey = '';
      _ans.mapel = '';
      _ans.fase = '';
      _ans.elemenTerpilih = [];
      ['rp-q-p1b','rp-q-p1c','rp-q-p2','rp-q-p2b','rp-q-p3','rp-step1-btn'].forEach(id => el(id)?.remove());
      if (!_ans.jenjang) return;
      if (_ans.jenjang === 'SMK') renderStep1P1b();
      else renderStep1P2(_ans.jenjang, null);
    });

    // Restore cascade jika state sudah ada
    if (_ans.jenjang) {
      if (_ans.jenjang === 'SMK') renderStep1P1b();
      else renderStep1P2(_ans.jenjang, null, !!_ans.mapelKey);
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

    qDiv.innerHTML = `<label class="rp-q-label" style="color:var(--gold)" for="rp-bidang-sel">2. Bidang keahlian</label>
<select class="rp-select" id="rp-bidang-sel">
  <option value="">— Pilih bidang keahlian —</option>
  ${bidangs.map(b =>
    `<option value="${esc(b)}"${_ans.bidangKeahlian===b?' selected':''}>${esc(b)}</option>`
  ).join('')}
</select>`;

    el('rp-bidang-sel').addEventListener('change', e => {
      _ans.bidangKeahlian = e.target.value || null;
      _ans.programKeahlian = null;
      _ans.mapelKey = '';
      _ans.mapel = '';
      _ans.fase = '';
      _ans.elemenTerpilih = [];
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

    qDiv.innerHTML = `<label class="rp-q-label" style="color:var(--gold)" for="rp-program-sel">3. Program keahlian</label>
<select class="rp-select" id="rp-program-sel">
  <option value="">— Pilih program keahlian —</option>
  ${programs.map(p =>
    `<option value="${esc(p)}"${_ans.programKeahlian===p?' selected':''}>${esc(p)}</option>`
  ).join('')}
</select>`;

    el('rp-program-sel').addEventListener('change', e => {
      _ans.programKeahlian = e.target.value || null;
      _ans.mapelKey = '';
      _ans.mapel = '';
      _ans.fase = '';
      _ans.elemenTerpilih = [];
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

    qDiv.innerHTML = `<label class="rp-q-label" style="color:var(--gold)" for="rp-mapel-sel">${qNum}. Mata pelajaran</label>
<select class="rp-select" id="rp-mapel-sel">
  <option value="">— Pilih mata pelajaran —</option>
  ${opts.map(o =>
    `<option value="${esc(o.value)}"${_ans.mapelKey===o.value?' selected':''}>${esc(o.label)}</option>`
  ).join('')}
</select>`;

    el('rp-mapel-sel').addEventListener('change', e => {
      const selOpt = e.target.selectedOptions[0];
      _ans.mapelKey = e.target.value;
      _ans.mapel = selOpt?.textContent.trim() || '';
      _ans.fase = '';
      _ans.elemenTerpilih = [];
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
  <span>${esc(nama)}</span>
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
            konteks: { mapel: _ans.mapel, jenjang, fase },
            elemen_list: _cpElemen,
            ...(_ans.elemenTerpilih?.length ? { elemen_terpilih: _ans.elemenTerpilih } : {}),
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
    <span class="rp-cp-layer-label rp-cp-layer-label--praktik">Dalam praktik</span>
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

  function appendStep1Next() {
    const wrap = el('rp-body')?.querySelector('.rp-block');
    if (!wrap) return;
    // Update tombol yang sudah ada, atau append action row baru
    const existingBtn = el('rp-btn-cp');
    if (existingBtn) {
      existingBtn.disabled = false;
      existingBtn.innerHTML = _ans.jenjang === 'SMK' ? 'Lanjut ke konteks SMK →' : 'Lanjut ke preferensi →';
      existingBtn.onclick = () => {
        if (_ans.jenjang === 'SMK') { _step = 2; renderStep2(); }
        else { _ans.smk = null; _step = 3; renderStep3A(); }
        saveRpState();
      };
    }
  }

  // ─── Step 2 — SMK ───────────────────────────────────────────────────────────

  function renderStep2() {
    _step = 2;
    renderStepBar();
    const body = el('rp-body');
    if (!body) return;

    const smk = _ans.smk || {};

    // Helper: dropdown + input Lainnya
    function smkSel(id, opts, saved) {
      const isLainnya = !!saved && !opts.includes(saved);
      const optsHtml = opts.map(o =>
        `<option value="${esc(o)}"${saved === o ? ' selected' : ''}>${esc(o)}</option>`
      ).join('');
      return `<select class="rp-select" id="${id}">
  <option value="">— Pilih —</option>
  ${optsHtml}
  <option value="__lainnya__"${isLainnya ? ' selected' : ''}>Lainnya…</option>
</select>
<input type="text" id="${id}-txt" class="rp-input" placeholder="Jelaskan…"
  style="margin-top:var(--space-xs);display:${isLainnya ? 'block' : 'none'};"
  value="${esc(isLainnya ? saved : '')}">`;
    }

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
    <label class="rp-q-label" style="color:var(--gold)" for="rp-smk-rumpun">SMK-2. Rumpun mata pelajaran</label>
    ${smkSel('rp-smk-rumpun', ['Normatif','Adaptif','Produktif'], smk.rumpun||'')}
  </div>

  <div class="rp-q">
    <label class="rp-q-label" style="color:var(--gold)">SMK-3. Tujuan pembelajaran utama (pilih semua yang sesuai) *</label>
    ${smkCheckList('rp-smk-tujuan-list', tujuanOpsi, smk.tujuan, true)}
  </div>

  <div class="rp-q">
    <label class="rp-q-label" style="color:var(--gold)" for="rp-smk-status-pkl">SMK-4. Status PKL siswa</label>
    ${smkSel('rp-smk-status-pkl', ['Belum PKL','Sedang PKL','Sudah selesai PKL','Tidak ada PKL'], smk.status_pkl||'')}
  </div>

  <div class="rp-q">
    <label class="rp-q-label" style="color:var(--gold)" for="rp-smk-target-sertif">SMK-5. Target sertifikasi</label>
    ${smkSel('rp-smk-target-sertif', ['Tidak ada target sertifikasi','Sertifikasi kompetensi (LSP)','Uji Kompetensi Keahlian (UKK)','Sertifikat industri langsung'], smk.target_sertif||'')}
  </div>

  <div class="rp-q">
    <label class="rp-q-label" style="color:var(--gold)" for="rp-smk-pola-jadwal">SMK-6. Pola jadwal mengajar</label>
    ${smkSel('rp-smk-pola-jadwal', ['Sistem blok (semua JP produktif 1 hari)','Tersebar harian','Tetap mingguan (jadwal rutin)','Campuran blok & harian','Tidak menentu'], smk.pola_jadwal||'')}
  </div>

  <div class="rp-q">
    <label class="rp-q-label" style="color:var(--gold)" for="rp-smk-durasi-proyek">SMK-7. Durasi satu unit/proyek pembelajaran</label>
    ${smkSel('rp-smk-durasi-proyek', ['1–2 minggu','3–4 minggu','5–8 minggu','Lebih dari 8 minggu'], smk.durasi_proyek||'')}
  </div>

  <div class="rp-q">
    <label class="rp-q-label" style="color:var(--gold)">SMK-8. Hubungan dengan DUDI (pilih semua yang sesuai) *</label>
    ${smkCheckList('rp-smk-dudi-list', dudiOpsi, smk.hubungan_dudi, true)}
  </div>

  <div class="rp-q">
    <label class="rp-q-label" style="color:var(--gold)" for="rp-smk-industri">SMK-9. Industri dominan di daerah</label>
    <input type="text" id="rp-smk-industri" class="rp-input" placeholder="Contoh: Tekstil, Pariwisata, Pertanian…" value="${esc(smk.industri_dominan||'')}">
  </div>

  <div class="rp-q">
    <label class="rp-q-label" style="color:var(--gold)" for="rp-smk-mitra-dudi">SMK-10. Mitra DUDI aktif</label>
    <select class="rp-select" id="rp-smk-mitra-dudi">
      <option value="">— Pilih —</option>
      <option value="Tidak ada mitra aktif"${smk.mitra_dudi==='Tidak ada mitra aktif'?' selected':''}>Tidak ada mitra aktif</option>
      <option value="Ada mitra aktif"${smk.mitra_dudi==='Ada mitra aktif'?' selected':''}>Ada mitra aktif</option>
    </select>
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

    // Event listener Lainnya untuk dropdown SMK-2,4,5,6,7
    ['rp-smk-rumpun','rp-smk-status-pkl','rp-smk-target-sertif','rp-smk-pola-jadwal','rp-smk-durasi-proyek'].forEach(id => {
      const sel = el(id);
      const txt = el(id + '-txt');
      if (!sel || !txt) return;
      sel.addEventListener('change', () => {
        txt.style.display = sel.value === '__lainnya__' ? 'block' : 'none';
        if (sel.value !== '__lainnya__') txt.value = '';
      });
    });

    // SMK-10 conditional input
    el('rp-smk-mitra-dudi')?.addEventListener('change', () => {
      el('rp-smk-mitra-wrap')?.classList.toggle('visible', el('rp-smk-mitra-dudi').value === 'Ada mitra aktif');
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
    function getSelVal(id) {
      const sel = el(id);
      if (!sel) return '';
      if (sel.value === '__lainnya__') return (el(id + '-txt')?.value || '').trim() || 'Lainnya';
      return sel.value;
    }
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
      rumpun:          getSelVal('rp-smk-rumpun'),
      tujuan:          getCheckboxVals('rp-smk-tujuan-list'),
      status_pkl:      getSelVal('rp-smk-status-pkl'),
      target_sertif:   getSelVal('rp-smk-target-sertif'),
      pola_jadwal:     getSelVal('rp-smk-pola-jadwal'),
      durasi_proyek:   getSelVal('rp-smk-durasi-proyek'),
      hubungan_dudi:   getCheckboxVals('rp-smk-dudi-list'),
      industri_dominan:(el('rp-smk-industri')?.value || '').trim(),
      mitra_dudi:      (el('rp-smk-mitra-dudi')?.value || ''),
      nama_mitra:      (el('rp-smk-mitra')?.value || '').trim(),
    };

    _step = 3;
    saveRpState();
    renderStep3A();
  }

  // ─── Step 3 — Niat Guru + Preferensi ───────────────────────────────────────

  function renderStep3A() {
    _step = 3;
    renderStepBar();
    const body = el('rp-body');
    if (!body) return;

    const ng = _ans.niat_guru || {};

    function makeDropdown(id, opsi, saved) {
      const isLainnya = !!saved && !opsi.includes(saved);
      const rows = opsi.map(o =>
        `<option value="${esc(o)}"${saved === o ? ' selected' : ''}>${esc(o)}</option>`
      ).join('');
      return `<select class="rp-select" id="${id}">
  <option value="">— Pilih —</option>
  ${rows}
  <option value="__lainnya__"${isLainnya ? ' selected' : ''}>Lainnya</option>
</select>
<input type="text" id="${id}-txt" class="rp-select" placeholder="Jelaskan…"
  style="margin-top:var(--space-xs);display:${isLainnya ? 'block' : 'none'};"
  value="${esc(isLainnya ? saved : '')}">`;
    }

    body.innerHTML = `
<div class="rp-block">
  <div class="rp-block-title">Visi Pembelajaran</div>

  <div class="rp-q" id="rp-q-a1">
    <label class="rp-q-label" style="color:var(--gold)" for="rp-a1">A-1. Suasana belajar seperti apa yang ingin Anda ciptakan?</label>
    ${makeDropdown('rp-a1', ['Aktif dan eksploratif','Terstruktur dan terarah','Kolaboratif dan sosial','Mandiri dan reflektif','Campuran sesuai kebutuhan'], ng.suasana_belajar||'')}
  </div>

  <div class="rp-q" id="rp-q-a2">
    <label class="rp-q-label" style="color:var(--gold)" for="rp-a2">A-2. Dari mana Anda ingin memulai perjalanan belajar siswa?</label>
    ${makeDropdown('rp-a2', ['Dari pengalaman/konteks nyata siswa','Dari konsep dasar dulu baru praktik','Dari masalah yang perlu dipecahkan','Dari produk yang ingin dihasilkan'], ng.titik_mulai||'')}
  </div>

  <div class="rp-q" id="rp-q-a3">
    <label class="rp-q-label" style="color:var(--gold)" for="rp-a3">A-3. Perkembangan kemampuan apa yang paling ingin Anda lihat pada siswa?</label>
    ${makeDropdown('rp-a3', ['Keberanian mencoba dan bereksperimen','Kemampuan menghubungkan teori dengan praktik','Kemandirian dan inisiatif belajar','Kemampuan berpikir sistematis','Kerja sama dan komunikasi dalam tim'], ng.perkembangan_diinginkan||'')}
  </div>

  <div class="rp-q" id="rp-q-a4">
    <label class="rp-q-label" style="color:var(--gold)" for="rp-a4">A-4. Pengalaman belajar apa yang ingin mendominasi kelas Anda?</label>
    ${makeDropdown('rp-a4', ['Diskusi dan tanya jawab','Praktik dan eksperimen langsung','Proyek nyata yang bisa dilihat hasilnya','Penjelasan bertahap dari guru','Eksplorasi mandiri dengan panduan'], ng.pengalaman_dominan||'')}
  </div>

  <div id="rp-step3a-error" class="error-msg" style="display:none;"></div>
  <div class="rp-action-row" id="rp-a-action">
    ${btnSecondary('rp-btn-back3','← Kembali')}
    ${btnPrimary('rp-btn-a-next','Lanjut ke preferensi →')}
  </div>
</div>`;

    function getSelVal(id) {
      const sel = el(id);
      if (!sel) return '';
      if (sel.value === '__lainnya__') return (el(id + '-txt')?.value || '').trim() || 'Lainnya';
      return sel.value;
    }

    function wireDropdown(id, onFilled) {
      const sel = el(id);
      const txt = el(id + '-txt');
      if (!sel) return;
      sel.addEventListener('change', () => {
        if (txt) {
          txt.style.display = sel.value === '__lainnya__' ? 'block' : 'none';
          if (sel.value !== '__lainnya__') txt.value = '';
        }
        onFilled(getSelVal(id));
      });
      if (txt) {
        txt.addEventListener('input', () => {
          if (sel.value === '__lainnya__' && txt.value.trim()) onFilled(txt.value.trim());
        });
      }
    }

    wireDropdown('rp-a1', () => {});
    wireDropdown('rp-a2', () => {});
    wireDropdown('rp-a3', () => {});
    wireDropdown('rp-a4', () => {});

    el('rp-btn-back3')?.addEventListener('click', () => {
      if (_ans.jenjang === 'SMK') { _step = 2; renderStep2(); }
      else { _step = 1; renderStep1(); }
    });
    el('rp-btn-a-next')?.addEventListener('click', handleStep3ASubmit);
  }

  function handleStep3ASubmit() {
    function getSelVal(id) {
      const sel = el(id);
      if (!sel) return '';
      if (sel.value === '__lainnya__') return (el(id + '-txt')?.value || '').trim() || 'Lainnya';
      return sel.value;
    }
    _ans.niat_guru = {
      suasana_belajar:          getSelVal('rp-a1'),
      titik_mulai:              getSelVal('rp-a2'),
      perkembangan_diinginkan:  getSelVal('rp-a3'),
      pengalaman_dominan:       getSelVal('rp-a4'),
    };
    saveRpState();
    renderStep3B();
  }

  function renderStep3B() {
    const body = el('rp-body');
    if (!body) return;

    const pref = _ans.preferensi || {};

    function makeDropdown(id, opsi, saved) {
      const isLainnya = !!saved && !opsi.includes(saved);
      const rows = opsi.map(o =>
        `<option value="${esc(o)}"${saved === o ? ' selected' : ''}>${esc(o)}</option>`
      ).join('');
      return `<select class="rp-select" id="${id}">
  <option value="">— Pilih —</option>
  ${rows}
  <option value="__lainnya__"${isLainnya ? ' selected' : ''}>Lainnya</option>
</select>
<input type="text" id="${id}-txt" class="rp-select" placeholder="Jelaskan…"
  style="margin-top:var(--space-xs);display:${isLainnya ? 'block' : 'none'};"
  value="${esc(isLainnya ? saved : '')}">`;
    }

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

  <div class="rp-q">
    <label class="rp-q-label" style="color:var(--gold)" for="rp-b2">B-2. Pendekatan mengajar yang paling cocok</label>
    ${makeDropdown('rp-b2', ['Langsung / Direct Instruction','Linear','Inquiry / Penemuan','Discovery / Penemuan Mandiri','PBL (Problem-Based)','PjBL (Project-Based)','Tematik','Spiral','Genre-Based (BKoF→MoT→JCoT→ICoT)','Task-Based (TBLT)','CLIL (Bahasa + Konten Mapel Lain)','Campuran'], pref.pendekatan||'')}
  </div>

  <div class="rp-q">
    <label class="rp-q-label" style="color:var(--gold)" for="rp-b3">B-3. Cara mengajar yang paling sering Anda gunakan</label>
    ${makeDropdown('rp-b3', ['Fasilitator — siswa lebih aktif','Presenter — guru lebih banyak menjelaskan','Coach — banyak feedback individual'], pref.gaya_mengajar||'')}
  </div>

  <div class="rp-q">
    <label class="rp-q-label" style="color:var(--gold)" for="rp-b4">B-4. Bagaimana Anda ingin menilai pencapaian siswa</label>
    ${makeDropdown('rp-b4', ['Tes tertulis','Presentasi / unjuk kerja','Portofolio','Observasi lapangan','Produk / karya','Jurnal refleksi'], pref.penilaian_utama||'')}
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

    // Wire Lainnya untuk B-2, B-3, B-4
    ['rp-b2','rp-b3','rp-b4'].forEach(id => {
      const sel = el(id);
      const txt = el(id + '-txt');
      if (!sel || !txt) return;
      sel.addEventListener('change', () => {
        txt.style.display = sel.value === '__lainnya__' ? 'block' : 'none';
        if (sel.value !== '__lainnya__') txt.value = '';
      });
    });

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

    function getSelVal(id) {
      const sel = el(id);
      if (!sel) return '';
      if (sel.value === '__lainnya__') return (el(id + '-txt')?.value || '').trim() || 'Lainnya';
      return sel.value;
    }

    const jp = parseInt(el('rp-b1-jp')?.value || '0');
    const dimensiList = [...(el('rp-b5-list')?.querySelectorAll('input[type="checkbox"]:checked') || [])]
      .map(cb => cb.value);

    _ans.preferensi = {
      jp_per_minggu:   jp || null,
      pendekatan:      getSelVal('rp-b2'),
      gaya_mengajar:   getSelVal('rp-b3'),
      penilaian_utama: getSelVal('rp-b4'),
      dimensi_profil:  dimensiList,
    };

    _genAtp = true;
    const btn = el('rp-btn-gen-atp');
    if (btn) { btn.disabled = true; btn.textContent = 'Generating…'; }

    renderStep4Loading();
    try {
      const result = await callAI({
        mode: 'atp',
        konteks: { mapel: _ans.mapel, jenjang: _ans.jenjang, fase: _ans.fase, jp_per_minggu: _ans.preferensi.jp_per_minggu },
        smk: _ans.smk,
        niat_guru: _ans.niat_guru,
        preferensi: _ans.preferensi,
      });
      _atpList = result?.tp_list || [];
      if (!_atpList.length) throw new Error('ATP kosong');
      _step = 4;
      saveRpState();
      renderStep4(_atpList);
    } catch (err) {
      _step = 3;
      renderStepBar();
      showError('rp-atp-error', 'Gagal generate ATP: ' + (err.message || 'Coba lagi.'));
      if (btn) { btn.disabled = false; btn.textContent = 'Hasilkan ATP →'; }
    } finally {
      _genAtp = false;
    }
  }

  // ─── Step 4 — ATP ───────────────────────────────────────────────────────────

  function renderStep4Loading() {
    _step = 4;
    renderStepBar();
    const body = el('rp-body');
    if (!body) return;
    body.innerHTML = `<div class="rp-block">${loading('AI sedang menyusun alur pembelajaran…')}<div id="rp-atp-error" class="error-msg" style="display:none;"></div></div>`;
  }

  function renderStep4(list) {
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

    body.innerHTML = `
<div class="rp-block">
  <div class="rp-block-title">Draft Alur Tujuan Pembelajaran</div>
  <p style="font-size:var(--fs-caption);color:var(--text-secondary);margin-bottom:var(--space-md);">Pilih satu TP yang ingin dirancang detail. Edit judul jika perlu setelah memilih.</p>
  <div class="rp-atp-list">${cards}</div>
  <div id="rp-atp-error" class="error-msg" style="display:none;"></div>
  <div class="rp-action-row">
    ${btnSecondary('rp-btn-back4','← Kembali ke preferensi')}
  </div>
</div>`;

    body.querySelectorAll('.rp-btn-rancang-tp').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const card = btn.closest('.rp-atp-card');
        const idx = parseInt(card.dataset.idx);
        const tp = { ..._atpList[idx] };
        const editedJudul = card.querySelector('.rp-atp-edit-input')?.value.trim();
        if (editedJudul) tp.judul = editedJudul;
        _ans.tp_terpilih = tp;
        showError('rp-atp-error', '');
        _step = 5;
        saveRpState();
        renderStep5();
      });
    });

    el('rp-btn-back4').addEventListener('click', () => { _step = 3; renderStep3B(); });
  }

  function handleStep4Submit() {
    const body = el('rp-body');
    const selectedCard = body?.querySelector('.rp-atp-card.selected');
    if (!selectedCard) { showError('rp-atp-error','Pilih satu TP terlebih dahulu.'); return; }
    const idx = parseInt(selectedCard.dataset.idx);
    const tp = { ..._atpList[idx] };
    const editedJudul = selectedCard.querySelector('.rp-atp-edit-input')?.value.trim();
    if (editedJudul) tp.judul = editedJudul;
    _ans.tp_terpilih = tp;
    showError('rp-atp-error','');
    _step = 5;
    saveRpState();
    renderStep5();
  }

  // ─── Step 5 — Konteks Kelas ─────────────────────────────────────────────────

  function renderStep5() {
    _step = 5;
    renderStepBar();
    const body = el('rp-body');
    if (!body) return;
    const kk = _ans.konteks_kelas || {};

    body.innerHTML = `
<div class="rp-block">
  <div class="rp-block-title">Konteks Realistis Kelas</div>
  <p style="font-size:var(--fs-caption);color:var(--text-secondary);margin-bottom:var(--space-md);">Informasi ini membantu AI menyesuaikan rencana dengan kondisi nyata kelas Anda.</p>

  <div class="rp-block-subtitle">Kondisi Fisik</div>
  <div class="rp-q" id="rp-q-k1">
    <label class="rp-q-label">K-1. Jumlah siswa di kelas *</label>
  </div>
  <div class="rp-q" id="rp-q-k3">
    <label class="rp-q-label">K-3. Fasilitas yang tersedia (bisa lebih dari satu) *</label>
  </div>
  <div class="rp-q" id="rp-q-k4">
    <label class="rp-q-label">K-4. Situasi HP &amp; kebijakan sekolah *</label>
  </div>
  <div class="rp-q" id="rp-q-k5">
    <label class="rp-q-label">K-5. Akses internet di kelas *</label>
  </div>

  <div class="rp-block-subtitle">Kondisi Siswa</div>
  <div class="rp-q" id="rp-q-k2">
    <label class="rp-q-label">K-2. Apakah ada siswa yang membutuhkan perhatian khusus di kelas Anda? *</label>
    <div class="rp-cond-input" id="rp-k2-cond">
      <textarea id="rp-k2-abk-desc" class="rp-textarea" placeholder="Ceritakan singkat — misalnya: ada siswa yang sulit fokus, kesulitan membaca, atau kondisi lain yang perlu dipertimbangkan" style="margin-top:var(--space-xs);">${esc(kk.abk_desc||'')}</textarea>
    </div>
  </div>
  <div class="rp-q" id="rp-q-k8">
    <label class="rp-q-label">K-8. Kendala kelas yang sering muncul (bisa lebih dari satu)</label>
  </div>

  <div class="rp-block-subtitle">Batasan untuk AI</div>
  <div class="rp-q" id="rp-q-k7a">
    <label class="rp-q-label">K-7a. Apa yang tidak bisa dilakukan di kelas Anda karena kondisi atau kebijakan? (bisa lebih dari satu)</label>
  </div>
  <div class="rp-q" id="rp-q-k7b">
    <label class="rp-q-label">K-7b. Aktivitas apa yang ingin Anda hindari? (bisa lebih dari satu)</label>
  </div>

  <div class="rp-block-subtitle">Konteks Tambahan</div>
  <div class="rp-q" id="rp-q-k6">
    <label class="rp-q-label">K-6. Materi cetak yang tersedia (bisa lebih dari satu)</label>
  </div>
  <div class="rp-q">
    <label class="rp-q-label" for="rp-k9-daerah">K-9. Daerah mengajar <span class="opsional">(opsional)</span></label>
    <input type="text" id="rp-k9-daerah" class="rp-input" placeholder="Contoh: Kabupaten Lebak, Banten" value="${esc(kk.daerah||'')}">
  </div>

  <div id="rp-step5-error" class="error-msg" style="display:none;"></div>
  <div class="rp-action-row">
    ${btnSecondary('rp-btn-back5','← Kembali ke ATP')}
    ${btnPrimary('rp-btn-gen-rencana','Generate rencana pertemuan')}
  </div>
</div>`;

    // Blok 1 — Kondisi Fisik
    attachLainnya(renderChips(['< 20 siswa','20–30 siswa','31–40 siswa','> 40 siswa'], 'jumlah_siswa', el('rp-q-k1'), false, false), 'Masukkan jumlah siswa');
    attachLainnya(renderChips(['Proyektor/LCD','Laptop','Speaker','Lab komputer','Koneksi WiFi','Printer','Lembar kerja cetak','Tidak ada fasilitas khusus'], 'fasilitas', el('rp-q-k3'), true, false), 'Contoh: papan tulis digital, TV layar besar');
    attachLainnya(renderChips(['HP dilarang','HP boleh untuk belajar','HP bebas','Tidak ada kebijakan jelas','Sebagian besar tidak punya HP'], 'situasi_hp', el('rp-q-k4'), false, false), 'Jelaskan situasi HP di kelas');
    attachLainnya(renderChips(['Tidak ada internet','Kadang ada, tidak stabil','Ada WiFi sekolah (stabil)'], 'akses_internet', el('rp-q-k5'), false, false), 'Jelaskan kondisi internet di kelas');

    // Blok 2 — Kondisi Siswa
    const k2Chips = renderChips(['Tidak ada','Ada'], 'abk', el('rp-q-k2'), false, false);
    k2Chips.addEventListener('click', () => {
      const val = getChipValues(k2Chips)[0];
      const cond = el('rp-k2-cond');
      if (cond) cond.classList.toggle('visible', val === 'Ada');
    });
    attachLainnya(renderChips(['Siswa sering ngobrol','Perhatian mudah teralih','Perbedaan kemampuan sangat lebar','Banyak siswa datang terlambat','Ketidakhadiran tinggi','Konflik antar siswa','Motivasi sangat rendah','Ruang kelas sempit/panas'], 'kendala', el('rp-q-k8'), true, false), 'Contoh: siswa sering tidak membawa buku');

    // Blok 3 — Batasan untuk AI
    attachLainnya(renderChips(['Ruang kelas tidak memungkinkan siswa bergerak bebas','Siswa tidak bisa keluar kelas','Tidak bisa cetak atau bagikan lembar kerja','Tidak bisa dibagi kelompok (ruang terlalu sempit atau jumlah terlalu banyak)'], 'batasan_kondisi', el('rp-q-k7a'), true, false), 'Jelaskan batasan kondisi lainnya');
    attachLainnya(renderChips(['Ceramah satu arah > 10 menit','Hafalan/drill tanpa konteks','Tugas yang butuh bahan dibeli siswa','Kompetisi antar siswa','Aktivitas yang mempermalukan siswa di depan kelas'], 'aktivitas_dihindari', el('rp-q-k7b'), true, false), 'Jelaskan aktivitas yang ingin dihindari');

    // Blok 4 — Konteks Tambahan
    attachLainnya(renderChips(['Buku teks pemerintah (BSE)','LKS dari sekolah','Modul buatan guru','Bahan dari DUDI','Tidak ada bahan cetak'], 'materi_cetak', el('rp-q-k6'), true, false), 'Contoh: modul khusus dari DUDI');

    // Restore chips dari _ans.konteks_kelas
    restoreChips(body.querySelector('[data-key="jumlah_siswa"]'),        kk.jumlah_siswa);
    restoreChips(body.querySelector('[data-key="fasilitas"]'),           kk.fasilitas);
    restoreChips(body.querySelector('[data-key="situasi_hp"]'),          kk.situasi_hp);
    restoreChips(body.querySelector('[data-key="akses_internet"]'),      kk.akses_internet);
    restoreChips(body.querySelector('[data-key="abk"]'),                 kk.abk);
    if (kk.abk === 'Ada') el('rp-k2-cond')?.classList.add('visible');
    restoreChips(body.querySelector('[data-key="kendala"]'),             kk.kendala);
    restoreChips(body.querySelector('[data-key="batasan_kondisi"]'),     kk.batasan_kondisi);
    restoreChips(body.querySelector('[data-key="aktivitas_dihindari"]'), kk.aktivitas_dihindari);
    restoreChips(body.querySelector('[data-key="materi_cetak"]'),        kk.materi_cetak);

    el('rp-btn-back5').addEventListener('click', () => { _step = 4; renderStep4(_atpList); });
    el('rp-btn-gen-rencana').addEventListener('click', handleStep5Submit);
  }

  async function handleStep5Submit() {
    if (_genRencana) return;
    showError('rp-step5-error','');
    const body = el('rp-body');
    const getGroup = key => {
      const g = body.querySelector(`.rp-chip-group[data-key="${key}"]`);
      return g ? getChipValues(g) : [];
    };

    _ans.konteks_kelas = {
      jumlah_siswa:        getGroup('jumlah_siswa')[0] || '',
      abk:                 getGroup('abk')[0] || '',
      abk_desc:            (el('rp-k2-abk-desc')?.value || '').trim(),
      fasilitas:           getGroup('fasilitas'),
      situasi_hp:          getGroup('situasi_hp')[0] || '',
      akses_internet:      getGroup('akses_internet')[0] || '',
      materi_cetak:        getGroup('materi_cetak'),
      batasan_kondisi:     getGroup('batasan_kondisi'),
      aktivitas_dihindari: getGroup('aktivitas_dihindari'),
      kendala:             getGroup('kendala'),
      daerah:              (el('rp-k9-daerah')?.value || '').trim(),
    };
    saveRpState();

    _genRencana = true;
    const btn = el('rp-btn-gen-rencana');
    if (btn) { btn.disabled = true; btn.textContent = 'Generating…'; }

    renderStep6Loading();
    try {
      const result = await callAI({
        mode: 'rencana',
        konteks: { mapel: _ans.mapel, jenjang: _ans.jenjang, fase: _ans.fase, jp_per_minggu: _ans.preferensi?.jp_per_minggu },
        smk: _ans.smk,
        niat_guru: _ans.niat_guru,
        preferensi: _ans.preferensi,
        tp_terpilih: _ans.tp_terpilih,
        konteks_kelas: _ans.konteks_kelas,
      });
      _step = 6;
      renderStep6(result);
    } catch (err) {
      _step = 5;
      renderStepBar();
      showError('rp-rencana-error', 'Gagal generate rencana: ' + (err.message || 'Coba lagi.'));
      if (btn) { btn.disabled = false; btn.textContent = 'Generate rencana pertemuan'; }
    } finally {
      _genRencana = false;
    }
  }

  // ─── Step 6 — Output ────────────────────────────────────────────────────────

  function renderStep6Loading() {
    _step = 6;
    renderStepBar();
    const body = el('rp-body');
    if (!body) return;
    body.innerHTML = `<div class="rp-block">${loading('AI sedang merancang rencana pertemuan…')}<div id="rp-rencana-error" class="error-msg" style="display:none;"></div></div>`;
  }

  function renderStep6(data) {
    _rencana = data;
    _step = 6;
    renderStepBar();
    const body = el('rp-body');
    if (!body) return;

    const tp = _ans.tp_terpilih;

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
    const kktpRows = (asesmen?.kktp || []).map(k =>
      `<div class="rp-kktp-row"><div class="rp-kktp-level">${esc(k.level)}</div><div class="rp-kktp-desc">${esc(k.deskripsi)}</div></div>`
    ).join('');
    const sec3 = buildOutputSection('rp-out-3', '3. Asesmen & KKTP', `
<div style="margin-bottom:var(--space-sm);">
  <span style="font-size:var(--fs-caption);color:var(--text-muted);">Jenis:</span>
  <span style="font-size:var(--fs-ui);color:var(--text-primary);font-weight:var(--fw-medium);"> ${esc(asesmen?.jenis||'-')}</span>
</div>
<div style="margin-bottom:var(--space-md);font-size:var(--fs-caption);color:var(--text-secondary);line-height:var(--lh-loose);">${esc(asesmen?.instrumen||'-')}</div>
${kktpRows}`);

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
</div>`;

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
    if (_cId) { try { localStorage.removeItem('rp_state_' + _cId); } catch (_) {} }
    Object.assign(_ans, { mapel:'', mapelKey:'', bidangKeahlian:null, programKeahlian:null, jenjang:'', fase:'', elemenTerpilih:[], smk:null, niat_guru:{}, preferensi:{}, tp_terpilih:null, konteks_kelas:{} });
    _cpElemen = []; _cpRingkasan = []; _cpLabel = ''; _cpUmum = ''; _atpList = []; _rencana = null;
    _genCp = false; _genAtp = false; _genRencana = false;
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
    const { step, ans, atpList, cpElemen, cpRingkasan, cpLabel, cpUmum } = saved || {};
    if (!step || !ans) return false;

    Object.assign(_ans, ans);
    _atpList = Array.isArray(atpList) ? atpList : [];
    _cpElemen = Array.isArray(cpElemen) ? cpElemen : [];
    _cpRingkasan = Array.isArray(cpRingkasan) ? cpRingkasan : [];
    _cpLabel = cpLabel || '';
    _cpUmum = cpUmum || '';
    _step = step;

    switch (step) {
      case 2: renderStep2(); break;
      case 3: renderStep3A(); break;
      case 4: if (_atpList.length) { renderStep4(_atpList); } else { renderStep1(); } break;
      case 5: renderStep5(); break;
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

  // ─── Init ───────────────────────────────────────────────────────────────────

  async function initRancangTab(cId) {
    _cId = cId;
    const panel = el('panel-rancang');
    if (!panel) return;
    panel.innerHTML = `
<div class="rp-step-bar" id="rp-step-bar"></div>
<div id="rp-body"></div>`;
    const restored = await restoreRpState();
    if (!restored) renderStep1();
    _loaded = true;
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

      if (!_loaded) {
        if (!cId) return;
        initRancangTab(cId);
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
