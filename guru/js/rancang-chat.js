(function () {
  'use strict';

  // ─── State tunggal ───────────────────────────────────────────────────────

  const _chat = {
    classroom_id:         null,
    profile:              null,   // rancang_profil
    teaching_context_id:  null,
    planning_context_id:  null,
    active_question_id:   null,
    collected_answers:    {},
    conversation_history: [],     // hanya untuk display, cap 40
    session_phase:        'BLOK1',
    atp_draft:            [],
    selected_tp:          null,
    in_flight:            false,
  };

  const HISTORY_CAP = 40;
  const LS_KEY = () => 'rc_state_' + _chat.classroom_id;

  let _loaded = false;
  let _initializing = false;

  // ─── Persist ─────────────────────────────────────────────────────────────

  function saveState() {
    if (!_chat.classroom_id) return;
    const payload = {
      active_question_id:  _chat.active_question_id,
      collected_answers:   _chat.collected_answers,
      conversation_history: _chat.conversation_history.slice(-HISTORY_CAP),
      session_phase:       _chat.session_phase,
      atp_draft:           _chat.atp_draft,
      selected_tp:         _chat.selected_tp,
      teaching_context_id: _chat.teaching_context_id,
      planning_context_id: _chat.planning_context_id,
    };
    try {
      localStorage.setItem(LS_KEY(), JSON.stringify(payload));
    } catch (e) {
      console.warn('[rancang-chat] saveState gagal:', e);
      // Coba ulang tanpa history
      try {
        localStorage.setItem(LS_KEY(), JSON.stringify({ ...payload, conversation_history: [] }));
      } catch (e2) {
        console.error('[rancang-chat] saveState gagal total:', e2);
      }
    }
  }

  function loadState() {
    if (!_chat.classroom_id) return false;
    // Bersihkan state wizard lama
    try { localStorage.removeItem('rp_state_' + _chat.classroom_id); } catch (_) {}
    try {
      const raw = localStorage.getItem(LS_KEY());
      if (!raw) return false;
      const saved = JSON.parse(raw);
      if (!saved?.session_phase) return false;
      Object.assign(_chat, {
        active_question_id:  saved.active_question_id  ?? null,
        collected_answers:   saved.collected_answers   ?? {},
        conversation_history: saved.conversation_history ?? [],
        session_phase:       saved.session_phase       ?? 'BLOK1',
        atp_draft:           saved.atp_draft           ?? [],
        selected_tp:         saved.selected_tp         ?? null,
        teaching_context_id: saved.teaching_context_id ?? null,
        planning_context_id: saved.planning_context_id ?? null,
      });
      return true;
    } catch (_) {
      try { localStorage.removeItem(LS_KEY()); } catch (_) {}
      return false;
    }
  }

  // ─── Init ─────────────────────────────────────────────────────────────────

  async function initRancangChat(cId) {
    if (_initializing || _loaded) return;
    _initializing = true;
    try {
      _chat.classroom_id = cId;
      const panel = document.getElementById('panel-rancang');
      if (!panel) return;

      // Render shell chat
      panel.innerHTML = `
<div id="rc-container" class="rc-container">
  <div class="rc-stream" id="rc-stream"></div>
  <div id="rc-composer-wrap"></div>
</div>`;

      // Muat profil guru (rancang_profil, per akun)
      try {
        _chat.profile = await window.api.getRancangProfil();
      } catch (_) { _chat.profile = null; }

      // Restore state dari localStorage
      const restored = loadState();

      // Render composer
      rcRenderComposer('rc-composer-wrap', handleGuruInput);

      if (restored && _chat.active_question_id) {
        // Tampilkan ringkasan sesi sebelumnya
        rcAppendBubble('sistem',
          'Melanjutkan sesi sebelumnya…');
        // Tampilkan pertanyaan aktif terakhir
        renderActiveQuestion();
      } else {
        // Mulai dari awal
        _chat.session_phase = 'BLOK1';
        _chat.collected_answers = {};
        _chat.atp_draft = [];
        _chat.selected_tp = null;
        startPhase('BLOK1');
      }

      _loaded = true;
    } finally {
      _initializing = false;
    }
  }

  // ─── Flow ──────────────────────────────────────────────────────────────────

  function startPhase(phase) {
    _chat.session_phase = phase;
    const questions = RANCANG_FLOW[phase];
    if (!questions?.length) return;
    const first = questions[0];
    askQuestion(first);
  }

  function askQuestion(q) {
    _chat.active_question_id = q.id;
    saveState();

    rcAppendBubble('ai', q.prompt);

    if (q.kind === 'pilihan' || q.kind === 'pilihan_jamak') {
      rcRenderChips(q.options, (value, label) => {
        handleChipSelect(value, label, q);
      });
    }
  }

  function renderActiveQuestion() {
    // Temukan pertanyaan aktif dari flow
    for (const phase of Object.keys(RANCANG_FLOW)) {
      const q = RANCANG_FLOW[phase]?.find(q => q.id === _chat.active_question_id);
      if (q) { askQuestion(q); return; }
    }
  }

  async function handleGuruInput(rawText) {
    if (_chat.in_flight) return;
    const qId = _chat.active_question_id;
    if (!qId) return;

    const phase = _chat.session_phase;
    const q = RANCANG_FLOW[phase]?.find(q => q.id === qId);
    if (!q) return;

    // Tampilkan bubble guru
    rcAppendBubble('guru', rawText);
    addToHistory('guru', rawText);
    rcClearChips();
    rcSetComposerDisabled(true);
    rcShowTyping();
    _chat.in_flight = true;

    try {
      // Validasi deterministik dulu untuk pilihan dan angka
      const evalResult = await evaluateAnswer(q, rawText);
      rcHideTyping();

      if (evalResult.status === 'ACCEPT') {
        _chat.collected_answers[qId] = evalResult.normalizedAnswer;
        rcAppendBubble('ai', evalResult.message);
        addToHistory('ai', evalResult.message);
        saveState();
        advanceToNext(q);

      } else if (evalResult.status === 'CLARIFY') {
        rcAppendBubble('ai', evalResult.message);
        addToHistory('ai', evalResult.message);
        if (evalResult.suggestions?.length) {
          rcRenderChips(evalResult.suggestions, (val, label) => {
            handleChipSelect(val, label, q);
          });
        }

      } else if (evalResult.status === 'REJECT') {
        rcAppendBubble('ai', evalResult.message);
        addToHistory('ai', evalResult.message);
        // Ulangi pertanyaan aktif
        if (q.kind === 'pilihan' || q.kind === 'pilihan_jamak') {
          rcRenderChips(q.options, (val, label) => handleChipSelect(val, label, q));
        }

      } else if (evalResult.status === 'HELP') {
        rcAppendBubble('ai', evalResult.message);
        addToHistory('ai', evalResult.message);
        // Ulangi pertanyaan aktif
        rcAppendBubble('ai', q.prompt);
        if (q.kind === 'pilihan' || q.kind === 'pilihan_jamak') {
          rcRenderChips(q.options, (val, label) => handleChipSelect(val, label, q));
        }
      }

    } catch (err) {
      rcHideTyping();
      rcAppendBubble('sistem',
        '❌ Gagal memproses jawaban. Coba lagi.');
      const btn = document.createElement('button');
      btn.className = 'rp-chip';
      btn.textContent = '↺ Coba lagi';
      btn.addEventListener('click', () => {
        btn.closest('.rc-bubble')?.remove();
        handleGuruInput(rawText);
      });
      rcAppendBubble('sistem', btn);
    } finally {
      _chat.in_flight = false;
      rcSetComposerDisabled(false);
    }
  }

  function handleChipSelect(value, label, q) {
    rcClearChips();
    rcAppendBubble('guru', label);
    addToHistory('guru', label);
    // Treat chip selection as immediate ACCEPT
    _chat.collected_answers[q.id] = value;
    const confirmMsg = `Dicatat: ${label}.`;
    rcAppendBubble('ai', confirmMsg);
    addToHistory('ai', confirmMsg);
    saveState();
    advanceToNext(q);
  }

  function advanceToNext(currentQ) {
    const next = getNextQuestion(
      _chat.session_phase,
      currentQ.id,
      _chat.collected_answers
    );
    if (next) {
      askQuestion(next);
    } else {
      // Fase selesai — pindah ke fase berikutnya
      const nextPhase = getNextPhase(_chat.session_phase);
      if (nextPhase === 'ATP_REVIEW') {
        triggerGenerateAtp();
      } else if (nextPhase === 'DONE') {
        rcAppendBubble('ai',
          '✓ Semua informasi terkumpul. ATP dan Modul Ajar siap disusun.');
      } else if (nextPhase) {
        startPhase(nextPhase);
      }
    }
  }

  // ─── Validasi ─────────────────────────────────────────────────────────────

  async function evaluateAnswer(q, rawText) {
    // Validasi deterministik untuk pilihan dan angka — tanpa memanggil AI
    if (q.kind === 'pilihan') {
      const matched = q.options?.find(o =>
        o.value === rawText || o.label?.toLowerCase() === rawText.toLowerCase()
      );
      if (matched) {
        return { status: 'ACCEPT', normalizedAnswer: matched.value,
          message: `Dicatat: ${matched.label}.` };
      }
      return {
        status: 'CLARIFY',
        message: 'Pilih salah satu opsi yang tersedia.',
        suggestions: q.options?.map(o => o.label) ?? [],
      };
    }

    if (q.kind === 'angka') {
      const n = parseFloat(rawText.replace(/[^0-9.,]/g, '').replace(',', '.'));
      if (isNaN(n)) {
        return { status: 'CLARIFY',
          message: `Tuliskan angka, misalnya: 2 atau 4.` };
      }
      const { min = 0, max = 999 } = q.constraints ?? {};
      if (n < min || n > max) {
        return { status: 'CLARIFY',
          message: `Angka harus antara ${min} dan ${max}.` };
      }
      return { status: 'ACCEPT', normalizedAnswer: n,
        message: `Dicatat: ${n}.` };
    }

    if (q.kind === 'teks_bebas') {
      if (rawText.length < 3) {
        return { status: 'CLARIFY',
          message: 'Jawaban terlalu singkat. Bisa lebih spesifik?' };
      }
      // Panggil Edge Function untuk teks bebas
      // EF belum ada — fallback ACCEPT sementara
      return { status: 'ACCEPT', normalizedAnswer: rawText,
        message: `Dicatat.` };
    }

    // Fallback
    return { status: 'ACCEPT', normalizedAnswer: rawText, message: 'Dicatat.' };
  }

  // ─── Generate ATP (placeholder) ───────────────────────────────────────────

  async function triggerGenerateAtp() {
    rcAppendBubble('ai', '⏳ Membaca CP yang relevan…');
    rcAppendBubble('ai', '⏳ Menyusun urutan Tujuan Pembelajaran…');
    // TODO: panggil EF phase2a atau evaluate-answer mode ATP
    // Untuk sementara tampilkan placeholder
    rcAppendBubble('ai',
      'ATP akan disusun setelah Edge Function evaluate-answer terdeploy.');
  }

  // ─── History helper ───────────────────────────────────────────────────────

  function addToHistory(role, text) {
    _chat.conversation_history.push({ role, text, ts: Date.now() });
    if (_chat.conversation_history.length > HISTORY_CAP) {
      _chat.conversation_history = _chat.conversation_history.slice(-HISTORY_CAP);
    }
  }

  // ─── Gate 3-lapis (diangkut verbatim dari classroom-rancang.js) ──────────

  window.addEventListener('DOMContentLoaded', async function () {
    const tabRancang   = document.getElementById('tab-rancang');
    const panelRancang = document.getElementById('panel-rancang');

    const otherPanels = ['panel-siswa','panel-jadwal','panel-catatan','panel-penilaian']
      .map(id => document.getElementById(id)).filter(Boolean);
    const otherTabs = ['tab-siswa','tab-jadwal','tab-catatan','tab-penilaian']
      .map(id => document.getElementById(id)).filter(Boolean);

    if (!tabRancang || !panelRancang) return;

    var GURU_PRO_DIJUAL = false;
    var WA_UPGRADE_URL =
      'https://wa.me/6281276979602?text=Halo+Romo,+saya+ingin+upgrade+MiClass';
    var RANCANG_ROLE = 'GURU_MAPEL_UMUM_SMK';
    var _roleGuru = null;

    async function muatRoleGuru() {
      if (_roleGuru !== null) return _roleGuru;
      try {
        const sesi = await window.api.getSession();
        const uid  = sesi?.data?.session?.user?.id ?? null;
        if (!uid) return null;
        const { data: prof } = await window.api.getProfile(uid);
        _roleGuru = prof?.role_guru ?? '';
      } catch (_) { _roleGuru = null; }
      return _roleGuru;
    }

    function bersihkanTabTersimpan(id) {
      if (!id) return;
      try {
        if (localStorage.getItem('sip_tab_' + id) === 'rancang')
          localStorage.removeItem('sip_tab_' + id);
      } catch (_) {}
    }

    async function sinkronkanTampilanTabRancang(id) {
      let _ts = null;
      try { _ts = await window.api.getTrialStatus(); } catch (_) {}
      var _role      = await muatRoleGuru();
      var _tierSalah = !!_ts && _ts.tier !== 'GURU_PRO';
      var _roleSalah = _role !== RANCANG_ROLE;
      var _berhak    = !(_tierSalah || _roleSalah);
      tabRancang.style.display = _berhak ? '' : 'none';
      if (!_berhak) bersihkanTabTersimpan(id);
      return _berhak;
    }

    tabRancang.addEventListener('click', async () => {
      window.currentTab = 'rancang';
      otherTabs.forEach(t => t.classList.remove('active'));
      tabRancang.classList.add('active');
      otherPanels.forEach(p => { p.style.display = 'none'; });
      panelRancang.style.display = '';

      const cId = new URLSearchParams(window.location.search).get('id');
      if (cId) try { localStorage.setItem('sip_tab_' + cId, 'rancang'); } catch (_) {}

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

      var _role      = await muatRoleGuru();
      var _tierSalah = !!_ts && _ts.tier !== 'GURU_PRO';
      var _roleSalah = _role !== RANCANG_ROLE;
      if (_tierSalah || _roleSalah) {
        bersihkanTabTersimpan(cId);
        panelRancang.innerHTML = _tierSalah
          ? '<div class="upgrade-tier-banner">' +
            '<strong>Fitur Guru Pro</strong>' +
            '<p>Tab Rancang Pembelajaran tersedia untuk Guru Pro.</p>' +
            (GURU_PRO_DIJUAL
              ? '<button type="button" class="btn-upgrade" onclick="window.open(\'' +
                WA_UPGRADE_URL + '\',\'_blank\')">Lihat paket</button>'
              : '') +
            '</div>'
          : '<div class="upgrade-tier-banner">' +
            '<strong>Khusus Guru Mapel Umum SMK</strong>' +
            '<p>Tab Rancang saat ini hanya untuk guru mapel umum SMK.</p>' +
            '</div>';
        return;
      }

      if (!_loaded) {
        if (!cId) return;
        await initRancangChat(cId);
      }
    });

    otherTabs.forEach(t => {
      t.addEventListener('click', () => {
        tabRancang.classList.remove('active');
        panelRancang.style.display = 'none';
      });
    });

    const cId = new URLSearchParams(window.location.search).get('id');
    await sinkronkanTampilanTabRancang(cId);

    if (cId) {
      const savedTab = localStorage.getItem('sip_tab_' + cId);
      if (savedTab === 'rancang') tabRancang.click();
    }
  });

}());
