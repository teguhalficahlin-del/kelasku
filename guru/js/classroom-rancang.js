(function () {
  'use strict';

  // ─── State ──────────────────────────────────────────────────────────────────

  let _cId = null;
  let _loaded = false;

  // Jawaban per blok
  const _ans = {
    mapel: '',
    jenjang: '',
    fase: '',
    jp_per_minggu: '',
    smk: null,       // null jika bukan SMK
    dnk_dk: {},
    preferensi: {},
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

  // URL Edge Function
  const EF_URL = 'https://teccdzetrdjowqemnuuc.supabase.co/functions/v1/generate-rancang';

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
        else { _step = 3; renderStep3DNK(); }
        break;
      case 3:
        if (!_ans.mapel) return;
        _step = 3; renderStep3DNK();
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

  // ─── CP fetch ───────────────────────────────────────────────────────────────

  async function fetchCpData(mapelKey, faseKey) {
    try {
      const res = await fetch('../../shared/data/cp-data.json');
      if (!res.ok) throw new Error('fetch failed');
      const data = await res.json();
      const mapelData = data[mapelKey];
      if (!mapelData || !mapelData[faseKey]) return null;
      return mapelData[faseKey];
    } catch {
      return null;
    }
  }

  function normalizeMapelKey(mapel) {
    return mapel.toLowerCase()
      .replace(/\s+/g, '_')
      .replace(/[^a-z0-9_]/g, '')
      .replace(/bahasa_inggris|english/, 'bahasa_inggris')
      .replace(/bahasa_indonesia|b\.ind/, 'bahasa_indonesia')
      .replace(/matematika|math/, 'matematika')
      .replace(/ipa|ilmu_pengetahuan_alam/, 'ipa')
      .replace(/informatika/, 'informatika');
  }

  // ─── AI call ────────────────────────────────────────────────────────────────

  async function callAI(payload) {
    const { data: { session } } = await window.supabaseClient.auth.getSession();
    const token = session?.access_token ?? '';
    const res = await fetch(EF_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    if (!res.ok || json.error) throw new Error(json.error || 'AI error');
    return json.result;
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

  <div class="rp-q">
    <label class="rp-q-label" for="rp-mapel">1. Mata pelajaran yang akan dirancang *</label>
    <input type="text" id="rp-mapel" class="rp-input" placeholder="Contoh: Bahasa Inggris, Matematika, DPIB…" value="${esc(_ans.mapel)}">
  </div>

  <div class="rp-q">
    <label class="rp-q-label">2. Jenjang sekolah *</label>
    <div id="rp-jenjang-chips" class="rp-chip-group">
      ${['SD','SMP','SMA','SMK'].map(j =>
        `<div class="rp-chip${_ans.jenjang===j?' selected':''}" data-value="${j}">${j}</div>`
      ).join('')}
    </div>
  </div>

  <div class="rp-q">
    <label class="rp-q-label">3. Fase capaian pembelajaran *</label>
    <div id="rp-fase-chips" class="rp-chip-group"></div>
  </div>

  <div id="rp-step1-error" class="error-msg" style="display:none;"></div>

  <div class="rp-action-row">
    ${btnPrimary('rp-btn-cp', 'Lihat CP &amp; lanjutkan →')}
  </div>
</div>`;

    const FASE_MAP = {
      SD:  ['fase_a','fase_b','fase_c'],
      SMP: ['fase_d'],
      SMA: ['fase_e','fase_f'],
      SMK: ['fase_e','fase_f'],
    };

    function filterFase(jenjang) {
      const wrap = el('rp-fase-chips');
      if (!wrap) return;
      const opts = jenjang ? (FASE_MAP[jenjang] || []) : [];
      if (!opts.length) {
        wrap.innerHTML = `<span class="rp-fase-placeholder">Pilih jenjang terlebih dahulu</span>`;
        return;
      }
      const prevFase = _ans.fase && opts.includes(_ans.fase) ? _ans.fase : null;
      const autoFase = opts.length === 1 ? opts[0] : prevFase;
      wrap.innerHTML = opts.map(v => {
        const f = FASE_OPTS.find(o => o.value === v);
        const sel = (autoFase === v) ? ' selected' : '';
        return `<div class="rp-chip${sel}" data-value="${v}">${f ? f.label : v}</div>`;
      }).join('');
      wrap.querySelectorAll('.rp-chip').forEach(chip => {
        chip.addEventListener('click', () => {
          wrap.querySelectorAll('.rp-chip').forEach(c => c.classList.remove('selected'));
          chip.classList.add('selected');
        });
      });
    }

    // Chip jenjang — single select
    body.querySelectorAll('#rp-jenjang-chips .rp-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        body.querySelectorAll('#rp-jenjang-chips .rp-chip').forEach(c => c.classList.remove('selected'));
        chip.classList.add('selected');
        filterFase(chip.dataset.value);
      });
    });

    filterFase(_ans.jenjang);

    el('rp-btn-cp').addEventListener('click', handleStep1Submit);
  }

  async function handleStep1Submit() {
    if (_genCp) return;

    const mapel = (el('rp-mapel')?.value || '').trim();
    const jenjang = el('rp-body')?.querySelector('#rp-jenjang-chips .rp-chip.selected')?.dataset.value || '';
    const fase = el('rp-fase-chips')?.querySelector('.rp-chip.selected')?.dataset.value || '';

    if (!mapel) { showError('rp-step1-error', 'Isi nama mata pelajaran.'); return; }
    if (!jenjang) { showError('rp-step1-error', 'Pilih jenjang sekolah.'); return; }
    if (!fase) { showError('rp-step1-error', 'Pilih fase capaian pembelajaran.'); return; }

    showError('rp-step1-error', '');
    _ans.mapel = mapel;
    _ans.jenjang = jenjang;
    _ans.fase = fase;

    // Cari CP di JSON
    const mapelKey = normalizeMapelKey(mapel);
    const faseKey = fase;

    _genCp = true;
    const btn = el('rp-btn-cp');
    if (btn) { btn.disabled = true; btn.textContent = 'Memuat CP…'; }

    try {
      const cpFase = await fetchCpData(mapelKey, faseKey);

      if (cpFase) {
        _cpElemen = cpFase.elemen || [];
        _cpLabel = cpFase.label || '';
        _cpUmum = cpFase.cp_umum || '';
        // Generate ringkasan AI
        renderCpLoading(cpFase.label);
        try {
          const result = await callAI({
            mode: 'cp_summary',
            konteks: { mapel, jenjang, fase },
            elemen_list: _cpElemen,
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
        renderCpNotice(mapel);
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
    const rows = _cpElemen.map((e, i) => {
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
    div.innerHTML = `<div class="rp-cp-card-label">CP ${esc(label)}</div>${umum}${rows}`;
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
        else { _ans.smk = null; _step = 3; renderStep3DNK(); }
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

    body.innerHTML = `
<div class="rp-block">
  <div class="rp-block-title">Konteks SMK</div>

  <div class="rp-q">
    <label class="rp-q-label" for="rp-smk-jurusan">SMK-1. Jurusan siswa *</label>
    <input type="text" id="rp-smk-jurusan" class="rp-input" placeholder="Contoh: Teknik Pemesinan, Akuntansi, DPIB…" value="${esc(smk.jurusan||'')}">
  </div>

  <div class="rp-q" id="rp-q-smk2">
    <label class="rp-q-label">SMK-2. Rumpun mata pelajaran *</label>
  </div>

  <div class="rp-q" id="rp-q-smk3">
    <label class="rp-q-label">SMK-3. Tujuan pembelajaran utama (bisa lebih dari satu)</label>
  </div>

  <div class="rp-q" id="rp-q-smk4">
    <label class="rp-q-label">SMK-4. Status PKL siswa *</label>
  </div>

  <div class="rp-q" id="rp-q-smk5">
    <label class="rp-q-label">SMK-5. Target sertifikasi *</label>
  </div>

  <div class="rp-q" id="rp-q-smk6">
    <label class="rp-q-label">SMK-6. Pola jadwal produktif *</label>
  </div>

  <div class="rp-q" id="rp-q-smk7">
    <label class="rp-q-label">SMK-7. Durasi proyek/unit per blok *</label>
  </div>

  <div class="rp-q" id="rp-q-smk8">
    <label class="rp-q-label">SMK-8. Hubungan dengan DUDI (bisa lebih dari satu)</label>
  </div>

  <div class="rp-q">
    <label class="rp-q-label" for="rp-smk-industri">SMK-9. Industri dominan di daerah</label>
    <input type="text" id="rp-smk-industri" class="rp-input" placeholder="Contoh: Tekstil, Pariwisata, Pertanian…" value="${esc(smk.industri_dominan||'')}">
  </div>

  <div class="rp-q" id="rp-q-smk10">
    <label class="rp-q-label">SMK-10. Mitra DUDI aktif *</label>
    <div id="rp-smk10-chips" class="rp-chip-group"></div>
    <div class="rp-cond-input" id="rp-smk-mitra-wrap">
      <input type="text" id="rp-smk-mitra" class="rp-input" placeholder="Nama mitra DUDI…" style="margin-top:var(--space-xs);" value="${esc(smk.nama_mitra||'')}">
    </div>
  </div>

  <div id="rp-step2-error" class="error-msg" style="display:none;"></div>
  <div class="rp-action-row">
    ${btnSecondary('rp-btn-back2','← Kembali')}
    ${btnPrimary('rp-btn-smk-next', 'Lanjut ke profil kelas →')}
  </div>
</div>`;

    // Build chips setelah HTML ada
    attachLainnya(renderChips(['Normatif','Adaptif','Produktif'], 'rumpun', el('rp-q-smk2'), false, false), 'Contoh: Bisnis & Manajemen');
    attachLainnya(renderChips(['PKL / Magang','Dunia Kerja Nyata','Sertifikasi Kompetensi','LKS','Konsep Dasar','Kewirausahaan','UMKM Lokal','Literasi / Numerasi'], 'tujuan', el('rp-q-smk3'), true, false), 'Contoh: keterampilan wirausaha digital');
    attachLainnya(renderChips(['Belum PKL','Sedang PKL','Sudah selesai PKL','Tidak ada PKL'], 'status_pkl', el('rp-q-smk4'), false, false), 'Jelaskan status PKL siswa');
    attachLainnya(renderChips(['Tidak ada target sertifikasi','Sertifikasi kompetensi (LSP)','Uji Kompetensi Keahlian (UKK)','Sertifikat industri langsung'], 'target_sertif', el('rp-q-smk5'), false, false), 'Contoh: sertifikat pelatihan industri');
    attachLainnya(renderChips(['Sistem blok (semua JP produktif 1 hari)','Tersebar harian','Campuran blok & harian','Tidak menentu'], 'pola_jadwal', el('rp-q-smk6'), false, false), 'Jelaskan pola jadwal produktif');
    attachLainnya(renderChips(['1–2 minggu','3–4 minggu','5–8 minggu','Lebih dari 8 minggu'], 'durasi_proyek', el('rp-q-smk7'), false, false), 'Contoh: 2 minggu intensif');
    attachLainnya(renderChips(['Kunjungan industri','Prakerin / PKL','Guest teacher','Sponsorship alat','Tidak ada hubungan'], 'hubungan_dudi', el('rp-q-smk8'), true, false), 'Contoh: kerjasama startup lokal');

    // SMK-10 mitra
    const mitra10Wrap = el('rp-q-smk10');
    const mitra10Chips = renderChips(['Tidak ada mitra aktif','Ada mitra, nama di bawah'], 'mitra_dudi', mitra10Wrap, false, false);
    mitra10Chips.addEventListener('click', () => {
      const val = getChipValues(mitra10Chips)[0];
      const wrap = el('rp-smk-mitra-wrap');
      if (wrap) wrap.classList.toggle('visible', val === 'Ada mitra, nama di bawah');
    });

    // Restore chips dari _ans.smk
    if (_ans.smk) {
      restoreChips(body.querySelector('[data-key="rumpun"]'),        _ans.smk.rumpun);
      restoreChips(body.querySelector('[data-key="tujuan"]'),        _ans.smk.tujuan);
      restoreChips(body.querySelector('[data-key="status_pkl"]'),    _ans.smk.status_pkl);
      restoreChips(body.querySelector('[data-key="target_sertif"]'), _ans.smk.target_sertif);
      restoreChips(body.querySelector('[data-key="pola_jadwal"]'),   _ans.smk.pola_jadwal);
      restoreChips(body.querySelector('[data-key="durasi_proyek"]'), _ans.smk.durasi_proyek);
      restoreChips(body.querySelector('[data-key="hubungan_dudi"]'), _ans.smk.hubungan_dudi);
      restoreChips(body.querySelector('[data-key="mitra_dudi"]'),    _ans.smk.mitra_dudi);
      if (_ans.smk.mitra_dudi === 'Ada mitra, nama di bawah') el('rp-smk-mitra-wrap')?.classList.add('visible');
    }

    el('rp-btn-back2').addEventListener('click', () => { _step = 1; renderStep1(); });
    el('rp-btn-smk-next').addEventListener('click', handleStep2Submit);
  }

  function handleStep2Submit() {
    showError('rp-step2-error', '');
    const body = el('rp-body');
    const getGroup = key => {
      const g = body.querySelector(`.rp-chip-group[data-key="${key}"]`);
      return g ? getChipValues(g) : [];
    };

    const jurusan = (el('rp-smk-jurusan')?.value || '').trim();
    _ans.smk = {
      jurusan,
      rumpun:          getGroup('rumpun')[0] || '',
      tujuan:          getGroup('tujuan'),
      status_pkl:      getGroup('status_pkl')[0] || '',
      target_sertif:   getGroup('target_sertif')[0] || '',
      pola_jadwal:     getGroup('pola_jadwal')[0] || '',
      durasi_proyek:   getGroup('durasi_proyek')[0] || '',
      hubungan_dudi:   getGroup('hubungan_dudi'),
      industri_dominan:(el('rp-smk-industri')?.value || '').trim(),
      mitra_dudi:      getGroup('mitra_dudi')[0] || '',
      nama_mitra:      (el('rp-smk-mitra')?.value || '').trim(),
    };

    _step = 3;
    saveRpState();
    renderStep3DNK();
  }

  // ─── Step 3 — DNK/DK + Preferensi ──────────────────────────────────────────

  function renderStep3DNK() {
    _step = 3;
    renderStepBar();
    const body = el('rp-body');
    if (!body) return;

    body.innerHTML = `
<div class="rp-block">
  <div class="rp-block-title">Profil Kelas (Diagnostik Awal)</div>
  <p style="font-size:var(--fs-caption);color:var(--text-secondary);margin-bottom:var(--space-md);">Jawab sesuai kondisi nyata kelas Anda. Data ini membantu AI merancang pembelajaran yang realistis.</p>

  <div class="rp-section-label">Non-Kognitif (DNK)</div>

  <div class="rp-q" id="rp-q-dnk1">
    <label class="rp-q-label">DNK-1. Kondisi emosi/psikologis dominan siswa *</label>
  </div>
  <div class="rp-q" id="rp-q-dnk2">
    <label class="rp-q-label">DNK-2. Motivasi belajar dominan *</label>
  </div>
  <div class="rp-q" id="rp-q-dnk3">
    <label class="rp-q-label">DNK-3. Gaya belajar dominan *</label>
  </div>

  <div class="rp-section-label">Kognitif (DK)</div>

  <div class="rp-q" id="rp-q-dk1">
    <label class="rp-q-label">DK-1. Pengetahuan awal tentang topik ini *</label>
  </div>
  <div class="rp-q" id="rp-q-dk2">
    <label class="rp-q-label">DK-2. Hambatan kognitif yang sering muncul *</label>
  </div>
  <div class="rp-q" id="rp-q-dk3">
    <label class="rp-q-label">DK-3. Kesiapan belajar mandiri *</label>
  </div>

  <div id="rp-step3a-error" class="error-msg" style="display:none;"></div>
  <div class="rp-action-row">
    ${btnSecondary('rp-btn-back3','← Kembali')}
    ${btnPrimary('rp-btn-dnk-next','Lanjut ke preferensi →')}
  </div>
</div>`;

    attachLainnya(renderChips(['Semangat & positif','Biasa saja / netral','Mudah bosan','Cemas / tertekan','Banyak konflik sosial'], 'kondisi_emosi', el('rp-q-dnk1'), false, false), 'Jelaskan kondisi emosi siswa');
    attachLainnya(renderChips(['Ingin nilai bagus','Ingin bisa praktik nyata','Dorongan dari orang tua','Belum jelas motivasinya','Motivasi sangat rendah'], 'motivasi', el('rp-q-dnk2'), false, false), 'Jelaskan motivasi dominan siswa');
    attachLainnya(renderChips(['Visual (gambar, diagram)','Auditori (diskusi, penjelasan)','Kinestetik (praktik, gerak)','Campuran'], 'gaya_belajar', el('rp-q-dnk3'), false, false), 'Jelaskan gaya belajar siswa');
    attachLainnya(renderChips(['Hampir tidak ada pengetahuan awal','Ada sedikit, tidak terstruktur','Cukup memadai','Sudah cukup kuat'], 'pengetahuan_awal', el('rp-q-dk1'), false, false), 'Jelaskan pengetahuan awal siswa');
    attachLainnya(renderChips(['Sulit abstraksi','Sulit membaca instruksi panjang','Mudah lupa','Tidak percaya diri mencoba','Tidak ada hambatan berarti'], 'hambatan_kognitif', el('rp-q-dk2'), false, false), 'Jelaskan hambatan yang sering muncul');
    attachLainnya(renderChips(['Perlu banyak panduan guru','Bisa mandiri dengan panduan tulis','Bisa mandiri sepenuhnya','Bervariasi antarindividu'], 'kesiapan_mandiri', el('rp-q-dk3'), false, false), 'Jelaskan kesiapan mandiri siswa');

    // Restore chips dari _ans.dnk_dk
    const dnk = _ans.dnk_dk || {};
    restoreChips(body.querySelector('[data-key="kondisi_emosi"]'),    dnk.kondisi_emosi);
    restoreChips(body.querySelector('[data-key="motivasi"]'),         dnk.motivasi);
    restoreChips(body.querySelector('[data-key="gaya_belajar"]'),     dnk.gaya_belajar);
    restoreChips(body.querySelector('[data-key="pengetahuan_awal"]'), dnk.pengetahuan_awal);
    restoreChips(body.querySelector('[data-key="hambatan_kognitif"]'),dnk.hambatan_kognitif);
    restoreChips(body.querySelector('[data-key="kesiapan_mandiri"]'), dnk.kesiapan_mandiri);

    el('rp-btn-back3').addEventListener('click', () => {
      if (_ans.jenjang === 'SMK') { _step = 2; renderStep2(); }
      else { _step = 1; renderStep1(); }
    });
    el('rp-btn-dnk-next').addEventListener('click', handleStep3DNKSubmit);
  }

  function handleStep3DNKSubmit() {
    showError('rp-step3a-error','');
    const body = el('rp-body');
    const getGroup = key => {
      const g = body.querySelector(`.rp-chip-group[data-key="${key}"]`);
      return g ? getChipValues(g) : [];
    };
    _ans.dnk_dk = {
      kondisi_emosi:    getGroup('kondisi_emosi')[0] || '',
      motivasi:         getGroup('motivasi')[0] || '',
      gaya_belajar:     getGroup('gaya_belajar')[0] || '',
      pengetahuan_awal: getGroup('pengetahuan_awal')[0] || '',
      hambatan_kognitif:getGroup('hambatan_kognitif')[0] || '',
      kesiapan_mandiri: getGroup('kesiapan_mandiri')[0] || '',
    };
    saveRpState();
    renderStep3Pref();
  }

  function renderStep3Pref() {
    const body = el('rp-body');
    if (!body) return;

    // Elemen CP untuk opsi prioritas
    const elemenOpts = _cpElemen.length > 0
      ? _cpElemen.map(e => e.nama)
      : ['(CP belum tersedia — isi sesuai elemen mapel Anda)'];

    body.innerHTML = `
<div class="rp-block">
  <div class="rp-block-title">Preferensi Pembelajaran</div>

  <div class="rp-q" id="rp-q-p2">
    <label class="rp-q-label">P-2. Karakter kelas ini (bisa lebih dari satu) *</label>
  </div>
  <div class="rp-q" id="rp-q-p3">
    <label class="rp-q-label">P-3. Tingkat kemandirian siswa *</label>
  </div>
  <div class="rp-q" id="rp-q-p4">
    <label class="rp-q-label">P-4. Prioritas elemen CP semester ini *</label>
  </div>
  <div class="rp-q" id="rp-q-p5">
    <label class="rp-q-label">P-5. Pendekatan pembelajaran yang Anda rasa paling cocok *</label>
    <div id="rp-p5-chips" class="rp-chip-group"></div>
    <div class="rp-cond-input" id="rp-p5-cond">
      <div class="rp-section-label" style="margin-top:var(--space-sm);">Pilih kombinasi pendekatan</div>
      <div id="rp-p5-kombi-chips" class="rp-chip-group"></div>
    </div>
  </div>
  <div class="rp-q" id="rp-q-p6">
    <label class="rp-q-label">P-6. Gaya mengajar Anda *</label>
  </div>
  <div class="rp-q" id="rp-q-p7">
    <label class="rp-q-label">P-7. Cara penilaian utama yang ingin Anda gunakan *</label>
  </div>

  <div id="rp-step3b-error" class="error-msg" style="display:none;"></div>
  <div class="rp-action-row">
    ${btnSecondary('rp-btn-back3b','← Kembali ke profil kelas')}
    ${btnPrimary('rp-btn-gen-atp','Generate draft ATP')}
  </div>
</div>`;

    attachLainnya(renderChips(['Aktif bertanya','Pasif mendengarkan','Suka kerja kelompok','Suka kerja mandiri','Mudah terdistraksi','Kompetitif'], 'karakter', el('rp-q-p2'), true, false), 'Contoh: mudah terprovokasi, suka kompetisi');
    attachLainnya(renderChips(['Perlu panduan langkah demi langkah','Bisa mengikuti panduan tertulis','Bisa eksplorasi mandiri'], 'kemandirian', el('rp-q-p3'), false, false), 'Jelaskan tingkat kemandirian siswa');
    renderChips(elemenOpts, 'prioritas_elemen', el('rp-q-p4'), true, false);

    // P5 pendekatan — single, dengan conditional multi
    const p5Wrap = el('rp-q-p5');
    const p5Chips = renderChips(['Langsung / Direct Instruction','Inquiry / Penemuan','PBL (Problem-Based)','PjBL (Project-Based)','Campuran'], 'pendekatan', p5Wrap, false, false);
    p5Chips.id = 'rp-p5-chips';
    p5Chips.addEventListener('click', () => {
      const val = getChipValues(p5Chips)[0];
      const cond = el('rp-p5-cond');
      if (cond) cond.classList.toggle('visible', val === 'Campuran');
    });
    renderChips(['Langsung','Inquiry','PBL','PjBL'], 'pendekatan_kombi', el('rp-p5-kombi-chips')?.parentElement || p5Wrap, true, false);

    attachLainnya(renderChips(['Fasilitator — siswa lebih aktif','Presenter — guru lebih banyak menjelaskan','Koach — banyak feedback individual'], 'gaya_mengajar', el('rp-q-p6'), false, false), 'Jelaskan gaya mengajar Anda');
    attachLainnya(renderChips(['Tes tertulis','Presentasi / unjuk kerja','Portofolio','Observasi lapangan','Produk / karya','Jurnal refleksi'], 'penilaian_utama', el('rp-q-p7'), false, false), 'Contoh: penilaian diri (self-assessment)');

    // Restore chips dari _ans.preferensi
    const pref = _ans.preferensi || {};
    restoreChips(body.querySelector('[data-key="karakter"]'),        pref.karakter);
    restoreChips(body.querySelector('[data-key="kemandirian"]'),     pref.kemandirian);
    restoreChips(body.querySelector('[data-key="prioritas_elemen"]'),pref.prioritas_elemen);
    const pend = pref.pendekatan || '';
    if (pend.startsWith('Campuran')) {
      restoreChips(body.querySelector('[data-key="pendekatan"]'), 'Campuran');
      el('rp-p5-cond')?.classList.add('visible');
      const kombiVals = pend.replace(/^Campuran:\s*/, '').split(' + ').map(s => s.trim()).filter(Boolean);
      restoreChips(body.querySelector('[data-key="pendekatan_kombi"]'), kombiVals);
    } else {
      restoreChips(body.querySelector('[data-key="pendekatan"]'), pend);
    }
    restoreChips(body.querySelector('[data-key="gaya_mengajar"]'),   pref.gaya_mengajar);
    restoreChips(body.querySelector('[data-key="penilaian_utama"]'), pref.penilaian_utama);

    el('rp-btn-back3b').addEventListener('click', renderStep3DNK);
    el('rp-btn-gen-atp').addEventListener('click', handleStep3PrefSubmit);
  }

  async function handleStep3PrefSubmit() {
    if (_genAtp) return;
    showError('rp-step3b-error','');
    const body = el('rp-body');
    const getGroup = key => {
      const g = body.querySelector(`.rp-chip-group[data-key="${key}"]`);
      return g ? getChipValues(g) : [];
    };

    const pendekatan = getGroup('pendekatan')[0] || '';
    _ans.preferensi = {
      karakter:         getGroup('karakter'),
      kemandirian:      getGroup('kemandirian')[0] || '',
      prioritas_elemen: getGroup('prioritas_elemen'),
      pendekatan:       pendekatan === 'Campuran'
                          ? 'Campuran: ' + getGroup('pendekatan_kombi').join(' + ')
                          : pendekatan,
      gaya_mengajar:    getGroup('gaya_mengajar')[0] || '',
      penilaian_utama:  getGroup('penilaian_utama')[0] || '',
    };

    // Generate ATP
    _genAtp = true;
    const btn = el('rp-btn-gen-atp');
    if (btn) { btn.disabled = true; btn.textContent = 'Generating…'; }

    renderStep4Loading();
    try {
      const result = await callAI({
        mode: 'atp',
        konteks: { mapel: _ans.mapel, jenjang: _ans.jenjang, fase: _ans.fase, jp_per_minggu: _ans.jp_per_minggu },
        smk: _ans.smk,
        dnk_dk: _ans.dnk_dk,
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
      if (btn) { btn.disabled = false; btn.textContent = 'Generate draft ATP'; }
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
</div>`).join('');

    body.innerHTML = `
<div class="rp-block">
  <div class="rp-block-title">Draft Alur Tujuan Pembelajaran</div>
  <p style="font-size:var(--fs-caption);color:var(--text-secondary);margin-bottom:var(--space-md);">Pilih satu TP yang ingin dirancang detail. Edit judul jika perlu setelah memilih.</p>
  <div class="rp-atp-list">${cards}</div>
  <div id="rp-atp-error" class="error-msg" style="display:none;"></div>
  <div class="rp-action-row">
    ${btnSecondary('rp-btn-back4','← Kembali ke preferensi')}
    ${btnPrimary('rp-btn-rancang','Rancang TP terpilih →')}
  </div>
</div>`;

    // Klik card — single select
    body.querySelectorAll('.rp-atp-card').forEach(card => {
      card.addEventListener('click', e => {
        if (e.target.closest('.rp-atp-edit-input')) return;
        body.querySelectorAll('.rp-atp-card').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
      });
    });

    el('rp-btn-back4').addEventListener('click', () => { _step = 3; renderStep3Pref(); });
    el('rp-btn-rancang').addEventListener('click', handleStep4Submit);
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

  <div class="rp-q" id="rp-q-k1">
    <label class="rp-q-label">K-1. Jumlah siswa di kelas *</label>
  </div>
  <div class="rp-q" id="rp-q-k2">
    <label class="rp-q-label">K-2. Siswa berkebutuhan khusus (ABK) *</label>
    <div id="rp-k2-chips" class="rp-chip-group"></div>
    <div class="rp-cond-input" id="rp-k2-cond">
      <textarea id="rp-k2-abk-desc" class="rp-textarea" placeholder="Deskripsikan kebutuhan khusus yang ada…" style="margin-top:var(--space-xs);">${esc(kk.abk_desc||'')}</textarea>
    </div>
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
  <div class="rp-q" id="rp-q-k6">
    <label class="rp-q-label">K-6. Materi cetak yang tersedia (bisa lebih dari satu)</label>
  </div>
  <div class="rp-q" id="rp-q-k7">
    <label class="rp-q-label">K-7. Aktivitas yang ingin dihindari (bisa lebih dari satu)</label>
  </div>
  <div class="rp-q" id="rp-q-k8">
    <label class="rp-q-label">K-8. Kendala kelas yang sering muncul (bisa lebih dari satu)</label>
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

    attachLainnya(renderChips(['< 20 siswa','20–30 siswa','31–36 siswa','> 36 siswa'], 'jumlah_siswa', el('rp-q-k1'), false, false), 'Masukkan jumlah siswa');

    const k2Chips = renderChips(['Tidak ada ABK','Ada ABK'], 'abk', el('rp-q-k2'), false, false);
    k2Chips.id = 'rp-k2-chips';
    k2Chips.addEventListener('click', () => {
      const val = getChipValues(k2Chips)[0];
      const cond = el('rp-k2-cond');
      if (cond) cond.classList.toggle('visible', val === 'Ada ABK');
    });

    attachLainnya(renderChips(['Proyektor / LCD','Lab komputer','Koneksi WiFi','Printer','Lembar kerja cetak','Tidak ada fasilitas khusus'], 'fasilitas', el('rp-q-k3'), true, false), 'Contoh: papan tulis digital, TV layar besar');
    attachLainnya(renderChips(['HP dilarang','HP boleh untuk belajar','HP bebas','Tidak ada kebijakan jelas','Sebagian besar tidak punya HP'], 'situasi_hp', el('rp-q-k4'), false, false), 'Jelaskan situasi HP di kelas');
    attachLainnya(renderChips(['Tidak ada internet','Kadang ada, tidak stabil','Ada WiFi sekolah (stabil)'], 'akses_internet', el('rp-q-k5'), false, false), 'Jelaskan kondisi internet di kelas');
    attachLainnya(renderChips(['Buku teks pemerintah (BSE)','LKS dari sekolah','Modul buatan guru','Bahan dari DUDI','Tidak ada bahan cetak'], 'materi_cetak', el('rp-q-k6'), true, false), 'Contoh: modul khusus dari DUDI');
    attachLainnya(renderChips(['Ceramah panjang tanpa aktivitas','Hafalan teks','Kerja kelompok besar (> 5 orang)','Presentasi individual di depan kelas','Menulis panjang tangan','Aktivitas outdoor','Tugas membeli bahan'], 'aktivitas_dihindari', el('rp-q-k7'), true, false), 'Contoh: permainan kompetitif, aktivitas fisik intens');
    attachLainnya(renderChips(['Siswa sering ngobrol','Perhatian mudah teralih','Perbedaan kemampuan sangat lebar','Banyak siswa datang terlambat','Ketidakhadiran tinggi','Konflik antar siswa','Motivasi sangat rendah','Ruang kelas sempit / panas'], 'kendala', el('rp-q-k8'), true, false), 'Contoh: siswa sering tidak membawa buku');

    // Restore chips dari _ans.konteks_kelas
    restoreChips(body.querySelector('[data-key="jumlah_siswa"]'),        kk.jumlah_siswa);
    restoreChips(body.querySelector('[data-key="abk"]'),                 kk.abk);
    if (kk.abk === 'Ada ABK') el('rp-k2-cond')?.classList.add('visible');
    restoreChips(body.querySelector('[data-key="fasilitas"]'),           kk.fasilitas);
    restoreChips(body.querySelector('[data-key="situasi_hp"]'),          kk.situasi_hp);
    restoreChips(body.querySelector('[data-key="akses_internet"]'),      kk.akses_internet);
    restoreChips(body.querySelector('[data-key="materi_cetak"]'),        kk.materi_cetak);
    restoreChips(body.querySelector('[data-key="aktivitas_dihindari"]'), kk.aktivitas_dihindari);
    restoreChips(body.querySelector('[data-key="kendala"]'),             kk.kendala);

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
        konteks: { mapel: _ans.mapel, jenjang: _ans.jenjang, fase: _ans.fase, jp_per_minggu: _ans.jp_per_minggu },
        smk: _ans.smk,
        dnk_dk: _ans.dnk_dk,
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
    Object.assign(_ans, { mapel:'', jenjang:'', fase:'', jp_per_minggu:'', smk:null, dnk_dk:{}, preferensi:{}, tp_terpilih:null, konteks_kelas:{} });
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
      case 3: renderStep3DNK(); break;
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
