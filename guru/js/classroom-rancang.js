(function () {
  'use strict';

  // ─── State ──────────────────────────────────────────────────────────────────

  const SipApi = window.api;  // alias ke API global

  let _cId = null;
  let _loaded = false;
  let _settings = null;   // data dari rancang_settings (pre-fill + identitas)
  let _profil   = null;   // data dari rancang_profil (step 0 — per akun guru)
  let _dokumen  = [];     // data dari rancang_dokumen (daftar file tersimpan)

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

  function wireCustomDropdown(id, onLainnyaToggle) {
    const wrap = el(id);
    if (!wrap) return;
    const trigger = wrap.querySelector('.rp-custom-select-trigger');
    const panel = wrap.querySelector('.rp-custom-select-panel');
    const labelEl = wrap.querySelector('.rp-custom-select-label');
    const txt = el(id + '-txt');

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
    });

    wrap.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (wrap.classList.contains('open')) closePanel();
        else openPanel();
      }
      if (e.key === 'Escape') closePanel();
    });

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
      });
    });

    document.addEventListener('click', function handler(e) {
      if (!document.contains(wrap)) return;
      if (!wrap.contains(e.target)) closePanel();
    });

    window.addEventListener('scroll', closePanel, { passive: true });
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

  // SD Guru MAPEL: dropdown single
  const SD_MAPEL_GURU = [
    'Kepercayaan Terhadap Tuhan Yang Maha Esa dan Budi Pekerti',
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
    'Kepercayaan Terhadap Tuhan Yang Maha Esa dan Budi Pekerti',
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
    'Kepercayaan Terhadap Tuhan Yang Maha Esa dan Budi Pekerti',
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
    'Kepercayaan Terhadap Tuhan Yang Maha Esa dan Budi Pekerti',
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
  ${SD_WALI_MAPEL.map(m => `
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

    const roleGuru = (jenjang === 'SD' && peran === 'WALI') ? 'WALI_KELAS_SD' : 'MAPEL';

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
      role_guru: roleGuru,
    };

    try {
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

    function renderNavRowCp() {
      const navWrap = el('rp-nav-row-cp');
      if (!navWrap) return;
      navWrap.innerHTML = `
<div class="rp-nav-row" style="justify-content:space-between;">
  <button type="button" class="rp-btn-next" id="rp-btn-lihat-cp">
    📄 Lihat CP
  </button>
  <button type="button" class="rp-btn-next" id="rp-step1-ro-next">
    ${jenjang === 'SMK' ? 'Lanjut ke konteks SMK →' : 'Lanjut ke preferensi →'}
  </button>
</div>`;
      el('rp-btn-lihat-cp')?.addEventListener('click', () => navigateToStep(7));
      el('rp-step1-ro-next')?.addEventListener('click', () => {
        if (_ans.jenjang === 'SMK') renderStep2();
        else renderStep3A();
      });
    }

    // Generate + simpan CP otomatis, lalu tampilkan
    autoGenerateDanSimpanCp();

    async function autoGenerateDanSimpanCp() {
      const navWrap = el('rp-nav-row-cp');
      const sudahAdaCp = _dokumen.some(d => d.jenis === 'CP');

      if (sudahAdaCp) {
        // CP sudah tersimpan — muat data lokal jika belum ada, lalu tampilkan
        if (!_cpElemen.length && !_cpUmum) {
          const fase = _ans.fase || _settings?.fase || '';
          const key  = _ans.mapelKey || _settings?.mapel_key || '';
          if (key && fase) {
            const cpFase = await fetchCpData(key, fase);
            if (cpFase) { _cpElemen = cpFase.elemen || []; _cpUmum = cpFase.cp_umum || ''; }
          }
        }
        renderCpReadOnly();
        return;
      }

      // CP belum tersimpan — generate + simpan otomatis
      const isWaliSd = _profil?.role_guru === 'WALI_KELAS_SD';
      const fase = _ans.fase || _profil?.fase || _settings?.fase || '';

      if (isWaliSd) {
        const mapelList = (_profil?.mapel_list?.length ? _profil.mapel_list : [_ans.mapel]).filter(Boolean);
        if (navWrap) navWrap.innerHTML = `<div class="rp-nav-row"><span class="rp-identitas-status">Menyiapkan ringkasan CP…</span></div>`;
        let anyFailed = false;
        for (let i = 0; i < mapelList.length; i++) {
          const m = mapelList[i];
          const mk = normalizeMapelKey(m);
          if (navWrap) navWrap.innerHTML = `<div class="rp-nav-row"><span class="rp-identitas-status">Menyiapkan CP ${esc(m)}… (${i + 1}/${mapelList.length})</span></div>`;
          try {
            const cpFase = await fetchCpData(mk, fase);
            const elemen = cpFase?.elemen || [];
            const cpUmum = cpFase?.cp_umum || '';
            let ringkasan = [];
            if (elemen.length) {
              try {
                const result = await callAI({ mode: 'cp_summary', konteks: { mapel: m, jenjang: _ans.jenjang, fase, kelas: _profil?.kelas || '' }, elemen_list: elemen, elemen_difilter: false });
                ringkasan = result?.ringkasan || [];
              } catch { ringkasan = elemen.map(e => ({ elemen: e.nama, konkret: null })); }
            }
            const judulDoc = `CP — ${m}`.trim();
            const konten = { elemen, ringkasan, cp_umum: cpUmum, mapel: m, fase };
            const doc = await SipApi.simpanRancangDokumen(_cId, 'CP', judulDoc, konten, null);
            _dokumen = [doc, ..._dokumen.filter(d => !(d.jenis === 'CP' && d.judul === judulDoc))];
            if (i === mapelList.length - 1) { _cpElemen = elemen; _cpUmum = cpUmum; _cpRingkasan = ringkasan; _ans.mapel = m; }
          } catch (e) {
            console.error(`[rancang][step1] generate CP ${m} gagal:`, e);
            anyFailed = true;
          }
        }
        if (anyFailed) {
          if (navWrap) navWrap.innerHTML = `<div class="rp-nav-row"><span style="color:var(--error,#c0392b)">Sebagian CP gagal di-generate.</span>&ensp;<button type="button" class="rp-btn-simpan" id="rp-step1-retry">Coba lagi</button></div>`;
          el('rp-step1-retry')?.addEventListener('click', autoGenerateDanSimpanCp);
          return;
        }
      } else {
        // Single mapel
        if (navWrap) navWrap.innerHTML = `<div class="rp-nav-row"><span class="rp-identitas-status">Menyiapkan ringkasan CP…</span></div>`;
        const mapelKey = _ans.mapelKey || _settings?.mapel_key || '';
        const mapel    = _ans.mapel   || _settings?.mapel   || '';
        try {
          if (!_cpElemen.length && mapelKey && fase) {
            const cpFase = await fetchCpData(mapelKey, fase);
            _cpElemen = cpFase?.elemen  || [];
            _cpUmum   = cpFase?.cp_umum || '';
          }
          if (!_cpRingkasan.length && _cpElemen.length) {
            try {
              const result = await callAI({
                mode: 'cp_summary',
                konteks: { mapel, jenjang: _ans.jenjang, fase, kelas: _profil?.kelas || '' },
                elemen_list: _ans.elemenTerpilih?.length
                  ? _cpElemen.filter(e => _ans.elemenTerpilih.map(n => n.trim().toLowerCase()).includes(e.nama.trim().toLowerCase()))
                  : _cpElemen,
                elemen_difilter: !!(_ans.elemenTerpilih?.length),
              });
              _cpRingkasan = result?.ringkasan || [];
            } catch { _cpRingkasan = _cpElemen.map(e => ({ elemen: e.nama, konkret: null })); }
          }
          const judulDoc = `CP — ${mapel} ${fase.replace(/_/g, ' ').toUpperCase()}`.trim();
          const konten = { elemen: _cpElemen, ringkasan: _cpRingkasan, cp_umum: _cpUmum, mapel, fase };
          const doc = await SipApi.simpanRancangDokumen(_cId, 'CP', judulDoc, konten, null);
          _dokumen = [doc, ..._dokumen.filter(d => d.jenis !== 'CP')];
          try {
            await SipApi.upsertRancangSettings(_cId, {
              jenjang: _ans.jenjang, mapel_key: _ans.mapelKey, mapel: _ans.mapel, fase: _ans.fase,
              bidang_keahlian: _ans.bidangKeahlian ?? null, program_keahlian: _ans.programKeahlian ?? null,
              elemen_terpilih: _ans.elemenTerpilih ?? [],
            });
          } catch (upsertErr) { console.error('[rancang][step1] upsert settings gagal:', upsertErr); }
          _settings = { ...(_settings || {}), jenjang: _ans.jenjang, mapel_key: _ans.mapelKey, mapel: _ans.mapel, fase: _ans.fase };
        } catch (e) {
          console.error('[rancang][step1] generate+simpan CP gagal:', e);
          if (navWrap) navWrap.innerHTML = `<div class="rp-nav-row"><span style="color:var(--error,#c0392b)">Gagal menyiapkan CP.</span>&ensp;<button type="button" class="rp-btn-simpan" id="rp-step1-retry">Coba lagi</button></div>`;
          el('rp-step1-retry')?.addEventListener('click', autoGenerateDanSimpanCp);
          return;
        }
      }

      renderCpReadOnly();
    }

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
      _atpList = result?.tp_list || [];
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
    ${atpSudahSimpan ? '✓ Tersimpan' : '💾 Simpan ATP'}
  </button>
  <span class="rp-identitas-status" id="rp-atp-simpan-status"></span>
</div>
<div class="rp-nav-row" style="justify-content:space-between;margin-top:var(--space-md);">
  ${btnSecondary('rp-btn-back4','← Kembali')}
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
    ${btnPrimary('rp-btn-gen-rencana','Generate rencana pertemuan')}
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
    if (btn) { btn.disabled = true; btn.textContent = 'AI sedang merancang rencana…'; }

    try {
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
    } catch (err) {
      showError('rp-step5-error', 'Gagal generate rencana: ' + (err.message || 'Coba lagi.'));
      if (btn) { btn.disabled = false; btn.textContent = 'Generate rencana pertemuan'; }
    } finally {
      _genRencana = false;
    }
  }

  // ─── Step 6 — Output ────────────────────────────────────────────────────────

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

  // ── Step 7: Dokumen Tersimpan ──────────────────────────────────
  async function renderStep7() {
    _step = 7;
    renderStepBar();
    const body = el('rp-body');
    if (!body) return;

    // Reload dokumen terbaru dari DB
    try {
      _dokumen = await SipApi.getRancangDokumen(_cId) ?? [];
    } catch (_) {}

    // Reload settings (per classroom) dan profil (per akun)
    try {
      _settings = await SipApi.getRancangSettings(_cId) ?? _settings;
    } catch (_) {}
    if (!_profil) {
      try { _profil = await SipApi.getRancangProfil(); } catch (_) {}
    }

    // Sumber identitas: profil (step 0) diutamakan, fallback ke settings lama
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

    // ── Identitas read-only (data dari profil akun, diubah via admin) ─────────
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

    // ── Render daftar dokumen ──────────────────────────────────
    const grouped = { CP: [], TP: [], RPM: [] };
    _dokumen.forEach(d => { if (grouped[d.jenis]) grouped[d.jenis].push(d); });

    function dokumenKartu(d) {
      const tgl = new Date(d.created_at).toLocaleDateString('id-ID', {
        day: '2-digit', month: 'short', year: 'numeric'
      });
      return `
<div class="rp-dok-kartu" data-id="${esc(d.id)}">
  <div class="rp-dok-info">
    <div class="rp-dok-judul">${esc(d.judul)}</div>
    <div class="rp-dok-meta">${tgl}</div>
  </div>
  <div class="rp-dok-actions">
    <button type="button" class="rp-btn-download" data-id="${esc(d.id)}"
      data-jenis="${esc(d.jenis)}" data-judul="${esc(d.judul)}">
      ⬇ Unduh Word
    </button>
    <button type="button" class="rp-btn-hapus-dok" data-id="${esc(d.id)}">
      🗑
    </button>
  </div>
</div>`;
    }

    // Navigasi ke step relevan saat dokumen belum ada
    function stepNav(jenis) {
      if (jenis === 'TP')  return `<button type="button" class="rp-link-btn" data-goto="4">→ Generate ATP di Step 4</button>`;
      if (jenis === 'RPM') return `<button type="button" class="rp-link-btn" data-goto="4">→ Rancang RPM di Step 4</button>`;
      return `<button type="button" class="rp-link-btn" data-goto="1">← Kembali ke Step 1</button>`;
    }

    function seksiDokumen(jenis, label) {
      const list = grouped[jenis];
      if (!list.length) return `
<div class="rp-dok-seksi">
  <div class="rp-dok-seksi-title">${label}</div>
  <div class="rp-dok-kosong">
    Belum tersimpan. ${stepNav(jenis)}
  </div>
</div>`;
      return `
<div class="rp-dok-seksi">
  <div class="rp-dok-seksi-title">${label}</div>
  ${list.map(dokumenKartu).join('')}
</div>`;
    }

    // RPM dikelompokkan per TP
    const rpmList = grouped['RPM'];

    const dokumenHtml = `
<div class="rp-block">
  <div class="rp-block-title">Dokumen Tersimpan</div>
  ${seksiDokumen('CP','Capaian Pembelajaran')}
  ${seksiDokumen('TP','Alur Tujuan Pembelajaran')}
  <div class="rp-dok-seksi">
    <div class="rp-dok-seksi-title">Rencana Pembelajaran (per TP)</div>
    ${rpmList.length
      ? rpmList.map(dokumenKartu).join('')
      : `<div class="rp-dok-kosong">Belum tersimpan. ${stepNav('RPM')}</div>`}
  </div>
</div>`;

    body.innerHTML = identitasHtml + dokumenHtml;

    // ── Navigasi dari placeholder ──────────────────────────────
    body.querySelectorAll('[data-goto]').forEach(btn => {
      btn.addEventListener('click', () => {
        const n = parseInt(btn.dataset.goto);
        if (n) navigateToStep(n);
      });
    });

    // ── Download Word ──────────────────────────────────────────
    body.querySelectorAll('.rp-btn-download').forEach(btn => {
      btn.addEventListener('click', async () => {
        const docId = btn.dataset.id;
        const jenis = btn.dataset.jenis;
        const judul = btn.dataset.judul;
        btn.disabled = true;
        btn.textContent = 'Memuat…';
        try {
          const konten = await SipApi.getRancangDokumenKonten(docId);
          if (!konten) throw new Error('konten kosong');
          // Identitas: profil (step 0) diutamakan, fallback ke settings lama
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

    // ── Hapus dokumen ──────────────────────────────────────────
    body.querySelectorAll('.rp-btn-hapus-dok').forEach(btn => {
      btn.addEventListener('click', async () => {
        const docId = btn.dataset.id;
        if (!confirm('Hapus dokumen ini?')) return;
        try {
          await SipApi.hapusRancangDokumen(docId);
          _dokumen = _dokumen.filter(d => d.id !== docId);
          btn.closest('.rp-dok-kartu')?.remove();
        } catch (e) {
          console.error('[rancang] hapus gagal:', e);
        }
      });
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
    if (_cId) { try { localStorage.removeItem('rp_state_' + _cId); } catch (_) {} }
    Object.assign(_ans, { mapel:'', mapelKey:'', bidangKeahlian:null, programKeahlian:null, jenjang:'', fase:'', elemenTerpilih:[], smk:null, niat_guru:{}, preferensi:{}, tp_terpilih:null, konteks_kelas:{} });
    _cpElemen = []; _cpRingkasan = []; _cpLabel = ''; _cpUmum = ''; _atpList = []; _rencana = null;
    _genCp = false; _genAtp = false; _genRencana = false;
    _settings = null;
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
    const { step, ans, atpList, cpElemen, cpRingkasan, cpLabel, cpUmum, rencana } = saved || {};
    if (!step || !ans) return false;

    Object.assign(_ans, ans);
    _atpList = Array.isArray(atpList) ? atpList : [];
    _cpElemen = Array.isArray(cpElemen) ? cpElemen : [];
    _cpRingkasan = Array.isArray(cpRingkasan) ? cpRingkasan : [];
    _cpLabel = cpLabel || '';
    _cpUmum = cpUmum || '';
    _rencana = rencana || null;
    _step = step;

    switch (step) {
      case 2: renderStep2(); break;
      case 3: renderStep3A(); break;
      case 4: if (_atpList.length) { renderStep4(_atpList); } else { renderStep1(); } break;
      case 5: renderStep5(); break;
      case 6: if (_rencana) { renderStep6(_rencana); } else if (_atpList.length) { renderStep4(_atpList); } else { renderStep1(); } break;
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

  // ─── Init ───────────────────────────────────────────────────────────────────

  async function initRancangTab(cId) {
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
        _ans.elemenTerpilih  = _profil.mapel_list        || [];
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

    if (!restored || _step === 1) renderStep1();
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

      // Trial gate — fitur hanya untuk AKTIF
      let _ts = null;
      try { _ts = JSON.parse(sessionStorage.getItem('guru_trial_status') || 'null'); } catch (_) {}
      if (!_ts) {
        try {
          const { data } = await window.supabaseClient.rpc('fn_guru_trial_status');
          if (data) { _ts = data; sessionStorage.setItem('guru_trial_status', JSON.stringify(_ts)); }
        } catch (_) {}
      }
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
