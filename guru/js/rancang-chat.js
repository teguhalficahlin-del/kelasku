(function () {
  'use strict';

  // ─── State tunggal ───────────────────────────────────────────────────────

  const _chat = {
    guru_id:              null,
    classroom_id:         null,
    atp_induk_id:         null,
    atp_updated_at:       null,
    profile:              null,   // rancang_profil
    teaching_context_id:  null,
    planning_context_id:  null,
    active_question_id:   null,
    collected_answers:    {},
    conversation_history: [],     // hanya untuk display, cap 40
    session_phase:        'KONTEKS_CP',
    atp_draft:            [],
    selected_tp:          null,
    modul_induk_id:       null,
    modul_updated_at:     null,
    in_flight:            false,
    pending_multi:        {},
  };

  const HISTORY_CAP = 40;
  const LS_KEY = () => 'rc_atp_state_' + (_chat.guru_id || 'unknown') + '_' + (_chat.classroom_id || 'unknown');

  let _loaded = false;
  let _initializing = false;
  // collected_data ATP yang sedang dibuka lewat picker — dipakai sekali untuk
  // menentukan fase lanjut, lalu tidak diperlukan lagi.
  let _resumeFromPhases = null;
  // Reentrancy guard konfirmasi "← Rancang" — mencegah bubble/chip konfirmasi
  // dirender berulang jika tombolnya somehow terpicu lebih dari sekali per klik.
  let _confirmingKembali = false;

  // ─── Persist ─────────────────────────────────────────────────────────────

  function saveState() {
    if (!_chat.classroom_id) return;
    const payload = {
      active_question_id:  _chat.active_question_id,
      atp_induk_id:        _chat.atp_induk_id,
      atp_updated_at:      _chat.atp_updated_at,
      collected_answers:   _chat.collected_answers,
      conversation_history: _chat.conversation_history.slice(-HISTORY_CAP),
      session_phase:       _chat.session_phase,
      atp_draft:           _chat.atp_draft,
      selected_tp:         _chat.selected_tp,
      modul_induk_id:      _chat.modul_induk_id,
      modul_updated_at:    _chat.modul_updated_at,
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
        session_phase:       saved.session_phase       ?? 'KONTEKS_CP',
        atp_induk_id:        saved.atp_induk_id        ?? null,
        atp_updated_at:      saved.atp_updated_at      ?? null,
        atp_draft:           saved.atp_draft           ?? [],
        selected_tp:         saved.selected_tp         ?? null,
        modul_induk_id:      saved.modul_induk_id      ?? null,
        modul_updated_at:    saved.modul_updated_at    ?? null,
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

  function inferFaseFromClassroom() {
    const name = String(window._classroomName || '').toUpperCase();
    if (/\bXII?\b/.test(name) && !/\bX\b/.test(name)) return 'F';
    if (/\bXI\b|\bXII\b/.test(name)) return 'F';
    return 'E';
  }

  function answer(value, source = 'guru', confirmed = true) {
    return { value, source, confirmed_by_teacher: confirmed };
  }

  function answerValue(id) {
    const stored = _chat.collected_answers[id];
    return stored && typeof stored === 'object' && Object.hasOwn(stored, 'value')
      ? stored.value : stored;
  }

  // ─── CP data helpers ──────────────────────────────────────────────────────

  function makeCpElemenId(nama) {
    return nama.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').trim().replace(/\s+/g, '_');
  }

  function lookupCpElemen(mapel, fase) {
    try {
      const data = window._cpData;
      if (!data) { console.warn('[rancang-chat] window._cpData tidak tersedia'); return []; }
      const mapelKey = mapel.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
      const faseKey  = 'fase_' + (fase || 'e').toLowerCase();
      const elemen   = data[mapelKey]?.[faseKey]?.elemen;
      if (!Array.isArray(elemen) || !elemen.length) {
        console.warn('[rancang-chat] CP tidak ditemukan untuk', mapel, fase); return [];
      }
      return elemen.map(e => ({ id: makeCpElemenId(e.nama), label: e.nama, cp_text: e.cp_normatif || '' }));
    } catch (err) { console.warn('[rancang-chat] lookupCpElemen gagal:', err); return []; }
  }

  function getCpUmum() {
    try {
      const data = window._cpData;
      if (!data) return '';
      const mapel    = answerValue('mapel') || '';
      const fase     = answerValue('fase')  || 'E';
      const mapelKey = mapel.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
      const faseKey  = 'fase_' + fase.toLowerCase();
      return data[mapelKey]?.[faseKey]?.cp_umum || '';
    } catch (_) { return ''; }
  }

  // ─── Target fase helpers ──────────────────────────────────────────────────

  function resolveTargetFaseText() {
    const mode = answerValue('target_akhir_mode');
    if (mode === 'target_guru') return answerValue('target_akhir_teks') || '';
    return getCpUmum();
  }

  // ─── Kesulitan helpers ────────────────────────────────────────────────────

  function generateAsumsiKesulitan(mapel, fase) {
    const ASUMSI = {
      'Bahasa Inggris': {
        E: ['Keterbatasan kosakata akademik dan kontekstual',
            'Kesulitan menyimak dan memahami teks lisan autentik',
            'Penulisan teks dengan struktur yang sesuai konteks'],
        F: ['Pemahaman teks argumentatif dan diskusi yang kompleks',
            'Penggunaan strategi koreksi diri dalam komunikasi',
            'Penulisan teks mandiri dengan kesadaran tujuan komunikatif'],
      },
    };
    return ASUMSI[mapel]?.[fase] || ['Kemampuan awal berbeda-beda antar siswa', 'Perlu adaptasi dari fase sebelumnya'];
  }

  function resolveKesulitanDiantisipasi() {
    const stored = _chat.collected_answers['kesulitan_mode'];
    const mode   = stored?.value ?? stored ?? '';
    const src    = stored?.source ?? 'guru';
    if (mode === 'belum_diketahui') return { value: [], source: 'belum_diketahui' };
    if (mode === 'perkiraan_guru') {
      const raw = answerValue('kesulitan_teks_guru') || '';
      return { value: raw ? [raw] : [], source: 'guru' };
    }
    if (mode === 'asumsi_umum') {
      const list = generateAsumsiKesulitan(answerValue('mapel') || '', answerValue('fase') || 'E');
      return { value: list, source: src === 'ai_recommendation' ? 'ai_recommendation' : 'otomatis' };
    }
    return { value: [], source: 'otomatis' };
  }

  // Buang sesi ATP yang tersimpan supaya funnel mulai dari nol. Wajib dipanggil
  // setelah guru_id terisi — LS_KEY() bergantung padanya, dan tanpa itu reset
  // menulis ke kunci 'unknown' sementara sesi lama tetap utuh di kunci aslinya.
  function resetSessionState() {
    Object.assign(_chat, {
      atp_induk_id:         null,
      atp_updated_at:       null,
      atp_draft:            [],
      selected_tp:          null,
      modul_induk_id:       null,
      modul_updated_at:     null,
      active_question_id:      null,
      collected_answers:       {},
      conversation_history:    [],
      pending_multi:           {},
      session_phase:           'KONTEKS_CP',
      planning_context_id:     null,
      viewing_existing_modul:  false,
    });
    saveState();
  }

  // Muat satu ATP tersimpan ke dalam state, menimpa sesi lokal apa pun yang ada.
  // collected_data di atp_induk adalah sumber kebenaran: setiap fase menulis ke
  // sana lewat saveAtpPhaseOptimistic, sedangkan atp_adaptasi hanya cermin
  // per-classroom untuk WAKTU/PROFIL_SISWA/KONTEKS_DUDI.
  function hydrateFromAtp(atp) {
    resetSessionState();
    _chat.atp_induk_id   = atp.id;
    _chat.atp_updated_at = atp.updated_at;
    _chat.atp_draft      = Array.isArray(atp.progresi_tp) ? atp.progresi_tp : [];
    const collected = atp.collected_data || {};
    for (const phaseData of Object.values(collected)) {
      if (phaseData && typeof phaseData === 'object') {
        Object.assign(_chat.collected_answers, phaseData);
      }
    }
    _resumeFromPhases = collected;
    saveState();
  }

  // Fase lanjut ditentukan ulang dari isi collected_data — session_phase dan
  // active_question_id tidak pernah disimpan ke DB, jadi tidak ada yang bisa
  // dipulihkan begitu saja. Penelusuran memakai getNextPhase() supaya urutan
  // fase tetap satu sumber, bukan disalin ulang di sini.
  function resumeAtpFromDb() {
    if (_chat.atp_draft.length) {
      rcAppendBubble('sistem', 'Membuka ATP tersimpan — meninjau draf yang sudah ada.');
      startPhase('ATP_REVIEW');
      return;
    }
    // Kunci fase di collected_data adalah penanda "fase selesai" yang sahih —
    // ia ditulis oleh persistCompletedPhase. Memeriksa satu per satu pertanyaan
    // tidak bisa: pertanyaan bersyarat yang dilewati membuat fase yang sudah
    // tuntas terlihat belum lengkap.
    const tersimpan = _resumeFromPhases || {};
    let phase = 'KONTEKS_CP';
    for (let i = 0; i < 20 && phase && tersimpan[phase]; i++) {
      phase = getNextPhase(phase);
    }
    // Semua fase terjawab tapi belum ada TP: penelusuran habis (null) atau
    // mendarat di ATP_GENERATE. Keduanya diarahkan ke ATP_SUMMARY — mengulang
    // dari KONTEKS_CP membuang seluruh jawaban guru, sedangkan langsung
    // menembak ATP_GENERATE memanggil AI tanpa guru memintanya.
    if (!phase || phase === 'ATP_GENERATE') phase = 'ATP_SUMMARY';
    rcAppendBubble('sistem', 'Membuka ATP tersimpan — jawaban sebelumnya dimuat kembali.');
    startPhase(phase);
  }

  async function initChatShell(cId, panel, mode, notice) {
    _chat.classroom_id = cId;
    _chat.guru_id = await getCurrentGuruId();
    if (mode === 'susun') resetSessionState();

    const _namaKelas    = window._classroomName    || '';
    const _mapelKelas   = window._classroomSubject  || '';
    const _programKelas = window._classroomProgram  || '';
    const _infoKelas    = [_namaKelas, _mapelKelas, _programKelas]
      .filter(Boolean).join(' · ');

    // Height #rc-container ditangani oleh .rc-container di guru.css
    // (calc(100vh - 160px)) — jangan set height inline di sini, itu akan
    // menimpa calc() tersebut dengan spesifisitas inline style.
    panel.innerHTML = `
<div id="rc-container" class="rc-container">
  <div class="rc-topbar" style="display:flex;align-items:center;padding:4px 8px;flex-shrink:0;">
    <button type="button" id="rc-back-btn" class="rp-chip" style="padding:2px 10px;font-size:0.78rem;">← Rancang</button>
  </div>
  ${_infoKelas ? `<div class="rc-kelas-header" style="flex-shrink:0;">${_infoKelas}</div>` : ''}
  <div class="rc-stream" id="rc-stream" style="flex:1;overflow-y:auto;min-height:0;"></div>
  <div id="rc-chips" style="flex-shrink:0;"></div>
  <div id="rc-composer-wrap" style="flex-shrink:0;display:none;"></div>
</div>`;

    attachRcBackBtnListener();
    _confirmingKembali = false;

    try {
      _chat.profile = await window.api.getRancangProfil();
    } catch (_) { _chat.profile = null; }

    const restored = loadState();
    rcRenderComposer('rc-composer-wrap', handleGuruInput);
    if (notice) rcAppendBubble('sistem', notice);

    if (mode === 'adaptasi' && _chat.atp_induk_id) {
      resumeAtpFromDb();
    } else if (restored && _chat.active_question_id) {
      rcAppendBubble('sistem', 'Melanjutkan sesi sebelumnya…');
      renderActiveQuestion();
    } else {
      _chat.session_phase = 'KONTEKS_CP';
      _chat.collected_answers = {};
      _chat.atp_draft = [];
      _chat.selected_tp = null;

      _chat.atp_induk_id = null;
      _chat.atp_updated_at = null;
      _chat.collected_answers.mapel = answer(window._classroomSubject || '', 'otomatis', false);
      _chat.collected_answers.nama_kelas = answer(window._classroomName || '', 'otomatis', false);
      _chat.collected_answers.fase = answer(inferFaseFromClassroom(), 'otomatis', false);
      _chat.collected_answers.jenjang = answer(window._classroomJenjang || 'SMK', 'otomatis', false);
      _chat.collected_answers.program_keahlian = answer(window._classroomProgram || '', 'otomatis', false);
      startPhase('KONTEKS_CP');
    }

    _loaded = true;
  }

  // Buka ATP yang dipilih guru dari picker. collected_data tidak ikut di
  // getAtpIndukList() (daftar sengaja ramping), jadi diambil di sini. Query
  // langsung ke supabaseClient mengikuti preseden persistCompletedPhase —
  // idealnya pindah ke rancang-chat-api.js saat file itu boleh disentuh lagi.
  async function openAtpAdaptasi(cId, panel, picked) {
    _chat.classroom_id = cId;
    _chat.guru_id = await getCurrentGuruId();

    let full = picked;
    try {
      const { data, error } = await window.supabaseClient
        .from('atp_induk')
        .select('id, mapel, fase, jenjang, status, updated_at, progresi_tp, collected_data')
        .eq('id', picked.id)
        .single();
      if (error) throw error;
      full = data;
    } catch (e) {
      // Picker sengaja dibiarkan di layar supaya guru bisa mencoba lagi tanpa
      // kehilangan daftarnya. Memuat sebagian isi ATP lebih berbahaya daripada
      // tidak memuat sama sekali: jawaban yang hilang akan ditimpa diam-diam.
      console.warn('[rancang-chat] gagal memuat isi ATP terpilih:', e);
      const pesan = document.getElementById('rc-atp-picker-pesan');
      if (pesan) pesan.textContent = 'ATP gagal dimuat. Periksa koneksi lalu pilih lagi.';
      return;
    }

    hydrateFromAtp(full);
    await initChatShell(cId, panel, 'adaptasi');
  }

  // classroom.js mengisi window._classroom* sekaligus dalam satu blok, tapi baru
  // setelah fetch classroom-nya selesai. Tab Rancang bisa terbuka lebih dulu —
  // auto-restore sip_tab_<id> memicu handler tab sebelum fetch itu tuntas — dan
  // layar pembuka lalu merender mapel kosong. Tunggu sebentar alih-alih menebak.
  function waitForClassroomMeta(timeoutMs = 3000) {
    if (window._classroomName) return Promise.resolve();
    return new Promise(resolve => {
      const mulai = Date.now();
      const timer = setInterval(() => {
        if (window._classroomName || Date.now() - mulai >= timeoutMs) {
          clearInterval(timer);
          resolve();
        }
      }, 50);
    });
  }

  // Picker 'sesuaikan' dengan hapus ATP + refresh daftar. Ditarik keluar dari
  // initRancangChat karena hapus butuh render ulang picker (atau layar pembuka
  // bila daftar habis) tanpa mengulang query classroom meta.
  function renderAtpPickerScreen(panel, cId, list, mapelDisplay) {
    rcRenderAtpPicker(panel, list, async function (picked) {
      _initializing = true;
      try {
        await openAtpAdaptasi(cId, panel, picked);
      } finally {
        _initializing = false;
      }
    }, async function (atpToDelete) {
      try {
        await deleteAtpInduk(atpToDelete.id);
      } catch (e) {
        console.warn('[rancang-chat] gagal menghapus ATP:', e);
        const pesan = document.getElementById('rc-atp-picker-pesan');
        if (pesan) pesan.textContent = 'Gagal menghapus ATP. Coba lagi.';
        return;
      }
      let refreshed = [];
      try {
        refreshed = (await getAtpIndukList()).filter(atp => atp.status !== 'arsip');
      } catch (e) {
        console.warn('[rancang-chat] gagal memuat ulang daftar ATP setelah hapus:', e);
      }
      if (!refreshed.length) {
        rcRenderWelcomeScreen(panel, mapelDisplay,
          makeWelcomeContinueHandler(panel, cId, mapelDisplay, []), 0);
        return;
      }
      renderAtpPickerScreen(panel, cId, refreshed, mapelDisplay);
    });
  }

  // atpList: array (jumlah diketahui) atau null (query gagal, jumlah tidak diketahui).
  function makeWelcomeContinueHandler(panel, cId, mapelDisplay, atpList) {
    const atpCount = atpList ? atpList.length : null;
    return async function (mode) {
      _initializing = true;
      try {
        // 'sesuaikan' tanpa satu pun ATP tersimpan tidak punya yang bisa
        // disesuaikan — alihkan ke ATP baru sambil menjelaskan alasannya.
        let notice = null;
        if (mode === 'sesuaikan' && atpCount === 0) {
          mode = 'susun';
          notice = 'Belum ada ATP tersimpan untuk disesuaikan — memulai ATP baru.';
        }
        if (mode === 'sesuaikan' && atpCount > 0) {
          renderAtpPickerScreen(panel, cId, atpList, mapelDisplay);
          return;
        }
        if (mode === 'modul') {
          const atpAktif = (atpList || []).filter(function (a) { return a.status === 'aktif'; });
          if (!atpAktif.length) {
            mode = 'susun';
            notice = 'Belum ada ATP aktif — susun ATP dulu sebelum membuat Modul Ajar.';
          } else {
            renderAtpPickerScreen(panel, cId, atpAktif, mapelDisplay);
            return;
          }
        }
        await initChatShell(cId, panel, mode, notice);
      } finally {
        _initializing = false;
      }
    };
  }

  async function initRancangChat(cId) {
    if (_initializing || _loaded) return;
    _initializing = true;
    try {
      _chat.classroom_id = cId;
      const panel = document.getElementById('panel-rancang');
      if (!panel) return;

      await waitForClassroomMeta();
      const mapelDisplay = window._classroomSubject || window._classroomProgram || '—';

      // Query daftar ATP tidak boleh menahan layar pembuka. Gagal = jumlah tidak
      // diketahui (null), bukan nol — badge menampilkan '— ATP' dan mode
      // 'sesuaikan' tetap memakai perilaku lama.
      let atpList = null;
      try {
        atpList = (await getAtpIndukList()).filter(atp => atp.status !== 'arsip');
      } catch (e) {
        console.warn('[rancang-chat] getAtpIndukList gagal; jumlah ATP tidak ditampilkan:', e);
      }
      const atpCount = atpList ? atpList.length : null;

      rcRenderWelcomeScreen(panel, mapelDisplay,
        makeWelcomeContinueHandler(panel, cId, mapelDisplay, atpList), atpCount);
    } finally {
      _initializing = false;
    }
  }

  // ─── Navigasi ke layar utama ────────────────────────────────────────────

  // Sesi saat ini tersimpan otomatis di DB (setiap fase yang tuntas sudah
  // dipersist lewat persistCompletedPhase) — reset _loaded lalu render ulang
  // layar pembuka cukup aman, tidak ada progress yang hilang.
  function kembaliKeLayarUtama() {
    rcClearChips();
    const cId = _chat.classroom_id;
    _loaded = false;
    initRancangChat(cId);
  }

  // Klik langsung pada elemen tombol lama (sebelum di-clone-replace) atau klik
  // ganda yang sempat lolos tetap tidak boleh menumpuk bubble/chip konfirmasi —
  // selama konfirmasi masih terbuka, panggilan susulan diabaikan.
  function handleKembaliRancangClick() {
    if (_chat.in_flight || _confirmingKembali) return;
    _confirmingKembali = true;
    // Chip konfirmasi harus selalu bisa diklik — composer disabled (mis.
    // sisa dari handleGuruInput/requestAiRecommendation yang sedang in-flight)
    // membawa #rc-chips ikut nonaktif karena keduanya sama-sama child dari
    // #rc-composer. Simpan state lalu bebaskan sementara; kembalikan kalau
    // guru memilih "Tidak, lanjutkan".
    const wasComposerDisabled = rcIsComposerDisabled();
    rcClearChips();
    rcSetComposerDisabled(false);
    rcAppendBubble('sistem',
      'Kembali ke layar utama? Sesi saat ini tersimpan otomatis di DB — Anda tidak kehilangan progres.');
    rcRenderChips([
      { value: 'ya', label: 'Ya, kembali ke layar utama' },
      { value: 'tidak', label: 'Tidak, lanjutkan' },
    ], function (value) {
      _confirmingKembali = false;
      rcClearChips();
      if (value === 'ya') {
        kembaliKeLayarUtama();
        return;
      }
      rcSetComposerDisabled(wasComposerDisabled);
      const phase = _chat.session_phase;
      const q = (RANCANG_FLOW[phase] || []).find(function (item) {
        return item.id === _chat.active_question_id;
      });
      if (!q) return;
      const needsInput = q.kind === 'teks_bebas' || q.kind === 'angka';
      rcSetComposerVisible(needsInput);
      if (q.kind === 'pilihan_jamak') {
        renderMultiSelect(q);
      } else if (q.kind === 'pilihan' || q.kind === 'konfirmasi') {
        rcRenderChips(q.options, function (val, label) { handleChipSelect(val, label, q); });
      }
      attachRcBackBtnListener();
    });
  }

  // Klon-ganti elemen tombol sebelum memasang listener: menjamin tepat satu
  // listener terpasang di simpul yang benar-benar hidup di DOM, apa pun yang
  // mungkin sudah menempel padanya sebelumnya.
  function attachRcBackBtnListener() {
    const btn = document.getElementById('rc-back-btn');
    if (!btn) return;
    const freshBtn = btn.cloneNode(true);
    btn.replaceWith(freshBtn);
    freshBtn.addEventListener('click', handleKembaliRancangClick);
  }

  // Guru menekan ✏ pada jawaban lama (pertanyaan M) di fase yang masih aktif.
  // Membuang jawaban pertanyaan SESUDAH M (bukan M sendiri — akan tertimpa
  // begitu M dijawab ulang) supaya funnel tidak menyimpan kombinasi jawaban
  // yang tidak pernah benar-benar ditanyakan bersama-sama.
  function handleEditAnswer(questionId, phase) {
    if (_chat.in_flight) return;
    const questions = RANCANG_FLOW[phase] || [];
    const idx = questions.findIndex(function (q) { return q.id === questionId; });
    if (idx === -1) return;

    for (let i = idx + 1; i < questions.length; i++) {
      delete _chat.collected_answers[questions[i].id];
      delete _chat.pending_multi[questions[i].id];
    }
    _chat.session_phase = phase;
    saveState();

    // Bubble jawaban yang diedit ditandai data-question-id oleh
    // rcMakeBubbleEditable. Ambil kemunculan TERAKHIR (bisa lebih dari satu
    // kalau pertanyaan yang sama sudah pernah diedit sebelumnya), lalu buang
    // semua elemen sesudahnya di stream — riwayat percakapan tidak boleh
    // menampilkan jawaban yang baru saja dibuang dari collected_answers.
    const stream = document.getElementById('rc-stream');
    if (stream) {
      const matches = stream.querySelectorAll('[data-question-id="' + questionId + '"]');
      const editedBubble = matches[matches.length - 1];
      if (editedBubble) {
        while (editedBubble.nextSibling) {
          stream.removeChild(editedBubble.nextSibling);
        }
      }
    }

    rcClearChips();
    rcAppendBubble('sistem', 'Mengubah jawaban sebelumnya — pertanyaan sesudahnya akan diulang.');
    askQuestion(questions[idx]);
  }

  // ─── Flow ──────────────────────────────────────────────────────────────────

  async function startPhase(phase) {
    _chat.session_phase = phase;
    if (phase === 'ATP_GENERATE') {
      rcSetComposerVisible(false);
      await triggerGenerateAtp();
      return; // triggerGenerateAtp memanggil startPhase('ATP_REVIEW') sendiri jika sukses
    }
    if (phase === 'MODUL_GENERATE') {
      rcSetComposerVisible(false);
      await triggerGenerateModul();
      return;
    }
    if (phase === 'ATP_REVIEW') {
      renderAtpDraftPreview(); // tampilkan draf TP sebelum pertanyaan konfirmasi
    }
    if (phase === 'MODUL_REVIEW') {
      _chat.active_question_id = null;
      saveState();
      rcSetComposerVisible(false);
      renderModulPreview();
      if (_chat.viewing_existing_modul) {
        rcRenderChips([
          { value: '__kembali_daftar__', label: '← Kembali ke daftar TP' },
        ], function () {
          rcClearChips();
          _chat.viewing_existing_modul = false;
          saveState();
          startPhase('DONE');
        });
        return;
      }
      rcRenderChips([
        { value: '__terima_modul__',    label: '✓ Terima Modul' },
        { value: '__ulang_generate__',  label: '↺ Ulangi Generate' },
        { value: '__kembali_rancang__', label: '← Rancang' },
      ], function (value) {
        rcClearChips();
        if (value === '__terima_modul__') {
          acceptModulInduk();
          return;
        }
        if (value === '__ulang_generate__') {
          startPhase('MODUL_GENERATE');
          return;
        }
        if (value === '__kembali_rancang__') {
          startPhase('DONE');
          return;
        }
      });
      return;
    }
    if (phase === 'DONE') {
      _chat.active_question_id = null;
      saveState();
      rcSetComposerVisible(false);
      rcAppendBubble('ai', '✓ ATP telah selesai ditinjau.');
      const tpList = _chat.atp_draft || [];
      if (!tpList.length) {
        rcRenderChips([{ value: '__kembali_utama__', label: '← Kembali ke layar utama' }], function () {
          kembaliKeLayarUtama();
        });
        return;
      }
      rcAppendBubble('ai', 'TP mana yang ingin Anda rancang dulu?');
      function renderTpChips(modulByNomor) {
        const tpChips = [
          ...tpList.flatMap(function (tp) {
            const chips = [{ value: 'tp_' + tp.nomor, label: 'TP ' + tp.nomor + ': ' + tp.judul }];
            if (modulByNomor && modulByNomor[tp.nomor]) {
              chips.push({ value: 'lihat_modul_' + tp.nomor, label: '📄 Lihat Modul TP ' + tp.nomor });
            }
            return chips;
          }),
          { value: '__nanti_saja__', label: 'Nanti saja' },
        ];
        rcRenderChips(tpChips, function (value) {
          rcClearChips();
          if (value === '__nanti_saja__') {
            rcRenderChips([{ value: '__kembali_utama__', label: '← Kembali ke layar utama' }], function () {
              kembaliKeLayarUtama();
            });
            return;
          }
          if (value.startsWith('lihat_modul_')) {
            const nomorTp = Number(value.replace('lihat_modul_', ''));
            const m = modulByNomor[nomorTp];
            _chat.modul_induk_id         = m.id;
            _chat.modul_updated_at       = m.updated_at;
            _chat.viewing_existing_modul = true;
            saveState();
            startPhase('MODUL_REVIEW');
            return;
          }
          const nomorTp = Number(value.replace('tp_', ''));
          const tp = tpList.find(function (t) { return t.nomor === nomorTp; });
          _chat.selected_tp      = tp || { nomor: nomorTp, judul: '' };
          _chat.modul_induk_id   = null;
          _chat.modul_updated_at = null;
          saveState();
          startPhase('PILIH_TP');
        });
      }
      fetchModulAktifByAtpId(_chat.atp_induk_id).then(function (modulAktif) {
        const modulByNomor = {};
        (modulAktif || []).forEach(function (m) { modulByNomor[m.nomor_tp] = m; });
        renderTpChips(modulByNomor);
      }).catch(function (err) {
        console.error('[rancang] fetchModulAktifByAtpId error:', err);
        renderTpChips(null);
      });
      return;
    }
    if (phase === 'MODUL_SUMMARY') {
      renderModulSummaryInfo();
    }
    const questions = RANCANG_FLOW[phase];
    if (!questions?.length) return;
    const first = questions[0];
    askQuestion(first);
  }

  function renderModulSummaryInfo() {
    const tp = _chat.selected_tp;
    if (!tp) return;
    const jpAlokasi = tp.jp_alokasi;
    if (!jpAlokasi) return;
    const jumlah = Number(answerValue('jumlah_pertemuan')) || 0;
    if (!jumlah) return;
    const jpPerPertemuan = Math.round(jpAlokasi / jumlah);
    const jpAktual = jpAlokasi / jumlah;
    let baris = `TP ${tp.nomor}: ${tp.judul}\n${jumlah} pertemuan · ${jpPerPertemuan} JP per pertemuan\nTotal: ${jpAlokasi} JP`;
    if (jpAktual !== jpPerPertemuan) {
      baris += `\n(dibulatkan dari ${jpAktual} JP)`;
    }
    rcAppendBubble('ai', baris);
  }

  function askQuestion(q) {
    _chat.active_question_id = q.id;
    saveState();

    rcAppendBubble('ai', renderQuestionPrompt(q.prompt));

    const needsInput = q.kind === 'teks_bebas' || q.kind === 'angka';
    rcSetComposerVisible(needsInput);

    if (q.kind === 'pilihan_jamak') {
      renderMultiSelect(q, true);
    } else if (q.kind === 'pilihan' || q.kind === 'konfirmasi') {
      rcRenderChips(q.options, (value, label) => {
        handleChipSelect(value, label, q);
      });
    }
  }

  function renderQuestionPrompt(prompt) {
    const context = [answerValue('mapel'), answerValue('nama_kelas'),
      `Fase ${answerValue('fase')}`, answerValue('program_keahlian')].filter(Boolean).join(' · ');
    return prompt
      .replace('{{konteks_kelas}}', context)
      .replace('{{ringkasan_waktu}}', formatAllocationSummary())
      .replace('{{ringkasan_target}}', formatPhaseAnswers('TARGET_FASE'))
      .replace('{{ringkasan_dudi}}', formatPhaseAnswers('KONTEKS_DUDI'))
      .replace('{{atp_summary}}', formatAtpSummary());
  }

  function phaseAnswerObject(phase) {
    const result = {};
    for (const q of RANCANG_FLOW[phase] || []) {
      if (_chat.collected_answers[q.id] !== undefined) result[q.id] = _chat.collected_answers[q.id];
    }
    if (phase === 'WAKTU') result.perhitungan = calculateAllocation();
    return result;
  }

  function formatPhaseAnswers(phase) {
    return Object.entries(phaseAnswerObject(phase))
      .map(([key, stored]) => `${key}: ${JSON.stringify(unwrapStored(stored))}`).join('\n') || 'Belum lengkap.';
  }

  function unwrapStored(stored) {
    return stored && typeof stored === 'object' && Object.hasOwn(stored, 'value')
      ? stored.value : stored;
  }

  function calculateAllocation() {
    const jpPerMinggu = Number(answerValue('jp_per_minggu') || 0);
    const mode = answerValue('minggu_efektif_mode');
    const minggu = mode === 'standar_36' ? 36
      : Number(answerValue('minggu_sem1') || 0) + Number(answerValue('minggu_sem2') || 0);
    const kalender = jpPerMinggu * minggu;
    const kegiatan = Number(answerValue('jp_kegiatan_khusus') || 0);
    const cadangan = Number(answerValue('cadangan_minggu') || 0) * jpPerMinggu;
    const pemetaan = Number(answerValue('jp_pemetaan') || 0);
    const prasyarat = Number(answerValue('jp_prasyarat') || 0);
    return { jp_per_minggu: jpPerMinggu, minggu_efektif: minggu, jp_kalender: kalender,
      jp_kegiatan_khusus: kegiatan, jp_cadangan: cadangan, jp_pemetaan: pemetaan,
      jp_prasyarat: prasyarat, jp_operasional: Math.max(0, kalender - kegiatan - cadangan - pemetaan - prasyarat) };
  }

  function formatAllocationSummary() {
    const a = calculateAllocation();
    return `Alokasi kalender: ${a.jp_kalender} JP\nKegiatan khusus: ${a.jp_kegiatan_khusus} JP` +
      `\nCadangan: ${a.jp_cadangan} JP\nSisa sementara: ${a.jp_operasional} JP`;
  }

  function formatAtpSummary() {
    return FASE_URUTAN_V1.slice(0, FASE_URUTAN_V1.indexOf('ATP_SUMMARY'))
      .map(phase => `${phase}\n${formatPhaseAnswers(phase)}`).join('\n\n');
  }

  function renderMultiSelect(q, isFirstRender) {
    const selected = _chat.pending_multi[q.id] || [];
    const max = q.constraints?.maxSelections || Infinity;
    if (isFirstRender && isFinite(max)) {
      rcAppendBubble('sistem', `Pilih maksimal ${max} opsi.`);
    }
    // Semua opsi tetap tampil; yang sudah dipilih ditandai '✓' dan bisa diklik
    // ulang untuk dibatalkan.
    const chips = [
      ...q.options.map(o => selected.includes(o.value) ? { ...o, label: `✓ ${o.label}` } : o),
      { value: '__done__', label: `Selesai memilih (${selected.length})` }
    ];
    rcRenderChips(chips, async (value, label) => {
      if (value === '__done__') {
        if (!selected.length) {
          rcAppendBubble('sistem', 'Pilih minimal satu opsi.');
          return renderMultiSelect(q);
        }
        const summary = selected.map(v => {
          const opt = q.options.find(o => o.value === v);
          return opt?.label || v;
        }).join(', ');
        delete _chat.pending_multi[q.id];
        rcClearChips();
        const guruBubble = rcAppendBubble('guru', summary);
        addToHistory('guru', summary);
        recordAnswer(q.id, selected, 'guru', true);
        rcMakeBubbleEditable(guruBubble, q.id, _chat.session_phase, handleEditAnswer);
        await advanceToNext(q);
        return;
      }
      if (value === 'rekomendasi' && q.aiRecommendation) {
        delete _chat.pending_multi[q.id];
        return requestAiRecommendation(q, label);
      }
      if (selected.includes(value)) {          // klik ulang = batalkan pilihan
        _chat.pending_multi[q.id] = selected.filter(v => v !== value);
        return renderMultiSelect(q);
      }
      const exclusive = q.constraints?.exclusive || [];
      if (exclusive.includes(value)) {
        _chat.pending_multi[q.id] = [value];
      } else {
        const kept = selected.filter(v => !exclusive.includes(v));
        if (kept.length >= max) {
          rcAppendBubble('sistem', `Maksimal ${max} pilihan. Batalkan salah satu dulu.`);
          return renderMultiSelect(q);
        }
        _chat.pending_multi[q.id] = [...kept, value];
      }
      renderMultiSelect(q);
    });
  }

  function renderActiveQuestion() {
    // Cari pertanyaan aktif HANYA di session_phase yang tersimpan
    const phase = _chat.session_phase;
    const questions = RANCANG_FLOW[phase] ?? [];
    const q = questions.find(q => q.id === _chat.active_question_id);
    if (q) {
      askQuestion(q);
      return;
    }
    // Tidak ketemu — state tidak konsisten, mulai dari awal
    console.warn('[rancang-chat] active_question_id tidak ditemukan di phase', phase, '— reset ke KONTEKS_CP');
    _chat.session_phase = 'KONTEKS_CP';
    _chat.active_question_id = null;
    _chat.collected_answers = {};
    _chat.conversation_history = [];
    try { localStorage.removeItem(LS_KEY()); } catch (_) {}
    startPhase('KONTEKS_CP');
  }

  async function handleGuruInput(rawText) {
    if (_chat.in_flight) return;
    const qId = _chat.active_question_id;
    if (!qId) return;

    const phase = _chat.session_phase;
    const q = RANCANG_FLOW[phase]?.find(q => q.id === qId);
    if (!q) return;

    // Tampilkan bubble guru
    const guruBubble = rcAppendBubble('guru', rawText);
    addToHistory('guru', rawText);
    rcClearChips();
    rcSetComposerDisabled(true);
    rcShowTyping();
    _chat.in_flight = true;

    try {
      const recommendationOption = q.aiRecommendation && q.options?.find(option =>
        option.value === 'rekomendasi' &&
        (rawText === option.value || rawText.toLowerCase() === option.label.toLowerCase())
      );
      if (recommendationOption) {
        rcHideTyping();
        _chat.in_flight = false; // lepas lock — requestAiRecommendation kelola sendiri
        await requestAiRecommendation(q, recommendationOption.label);
        return;
      }
      // Validasi deterministik dulu untuk pilihan dan angka
      const evalResult = await evaluateAnswer(q, rawText);
      rcHideTyping();

      if (evalResult.status === 'ACCEPT') {
        recordAnswer(qId, evalResult.normalizedAnswer, 'guru', true);
        rcMakeBubbleEditable(guruBubble, qId, phase, handleEditAnswer);
        rcAppendBubble('ai', evalResult.message);
        addToHistory('ai', evalResult.message);
        saveState();
        await advanceToNext(q);

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
        if (q.kind === 'pilihan' || q.kind === 'pilihan_jamak' || q.kind === 'konfirmasi') {
          rcRenderChips(q.options, (val, label) => handleChipSelect(val, label, q));
        }

      } else if (evalResult.status === 'HELP') {
        rcAppendBubble('ai', evalResult.message);
        addToHistory('ai', evalResult.message);
        // Ulangi pertanyaan aktif
        rcAppendBubble('ai', q.prompt);
        if (q.kind === 'pilihan' || q.kind === 'pilihan_jamak' || q.kind === 'konfirmasi') {
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

  function buildCpRingkasan() {
    const mapel   = answerValue('mapel')            || '—';
    const fase    = answerValue('fase')             || '—';
    const program = answerValue('program_keahlian') || '';
    let text = `Mata Pelajaran: ${mapel}\nFase: ${fase}`;
    if (program) text += `\nProgram Keahlian: ${program}`;
    const elemen = lookupCpElemen(mapel, fase);
    if (elemen.length) {
      text += `\n\nElemen CP:\n${elemen.map(e => `• ${e.label}`).join('\n')}`;
      const cpUmum = getCpUmum();
      if (cpUmum) text += `\n\nCapaian Pembelajaran:\n${cpUmum}`;
    } else {
      text += '\n\nElemen CP akan dimuat saat ATP mulai disusun.';
    }
    return text;
  }

  async function handleChipSelect(value, label, q) {
    rcClearChips();
    const guruBubble = rcAppendBubble('guru', label);
    addToHistory('guru', label);
    const phaseAtAsk = _chat.session_phase;
    if (value === 'rekomendasi' && q.aiRecommendation) {
      await requestAiRecommendation(q, label);
      return;
    }
    // Tampilkan ringkasan CP tanpa merekam pilihan ini sebagai jawaban final
    if (q.id === 'konfirmasi_konteks' && value === 'lihat_cp') {
      const ringkasan = buildCpRingkasan();
      rcAppendBubble('ai', ringkasan);
      addToHistory('ai', ringkasan);
      askQuestion(q);
      return;
    }
    // Buat ulang ATP: panggil generate langsung, jangan rekam jawaban
    if (q.id === 'tindakan_review_atp' && value === 'ulang') {
      rcSetComposerDisabled(true);
      try {
        await triggerGenerateAtp();
      } finally {
        rcSetComposerDisabled(false);
      }
      return;
    }
    // Placeholder V1: revisi rumusan TP
    if (q.id === 'tindakan_review_atp' && value === 'rumusan') {
      rcAppendBubble('ai', 'Fitur revisi rumusan TP per item akan tersedia di versi berikutnya. Saat ini Anda dapat menerima ATP ini atau membuatnya ulang.');
      addToHistory('ai', 'Fitur revisi rumusan TP belum tersedia.');
      askQuestion(q);
      return;
    }
    // Placeholder V1: pengurutan TP manual
    if (q.id === 'tindakan_review_atp' && value === 'urutan') {
      rcAppendBubble('ai', 'Fitur pengurutan TP manual akan tersedia di versi berikutnya. Saat ini Anda dapat menerima ATP ini atau membuatnya ulang.');
      addToHistory('ai', 'Fitur pengurutan TP belum tersedia.');
      askQuestion(q);
      return;
    }
    // Terima ATP: update status='aktif' sebelum advance
    if (q.id === 'tindakan_review_atp' && value === 'terima') {
      rcSetComposerDisabled(true);
      try {
        const saved = await acceptAtp(_chat.atp_induk_id, _chat.atp_updated_at);
        _chat.atp_updated_at = saved.updated_at;
        saveState();
        const confirmMsg = 'ATP telah diterima. Anda dapat mulai merancang pembelajaran.';
        rcAppendBubble('ai', confirmMsg);
        addToHistory('ai', confirmMsg);
        recordAnswer(q.id, value, 'guru', true);
        rcMakeBubbleEditable(guruBubble, q.id, phaseAtAsk, handleEditAnswer);
        await startPhase('DONE');
      } catch (err) {
        const errMsg = err.code === 'ATP_WRITE_CONFLICT'
          ? err.message : '❌ Gagal menyimpan ATP. Coba lagi.';
        rcAppendBubble('sistem', errMsg);
      } finally {
        rcSetComposerDisabled(false);
      }
      return;
    }
    recordAnswer(q.id, value, 'guru', true);
    rcMakeBubbleEditable(guruBubble, q.id, phaseAtAsk, handleEditAnswer);
    if (q.id === 'konfirmasi_konteks' && value === 'sesuai') {
      ['mapel', 'nama_kelas', 'fase', 'jenjang', 'program_keahlian'].forEach(id => {
        if (_chat.collected_answers[id]) _chat.collected_answers[id].confirmed_by_teacher = true;
      });
    }
    const confirmMsg = `Dicatat: ${label}.`;
    rcAppendBubble('ai', confirmMsg);
    addToHistory('ai', confirmMsg);
    saveState();
    await advanceToNext(q);
  }

  function recordAnswer(questionId, value, source, confirmed) {
    _chat.collected_answers[questionId] = answer(value, source, confirmed);
    saveState();
  }

  async function requestAiRecommendation(q, label) {
    if (_chat.in_flight) return;
    _chat.in_flight = true;
    rcSetComposerDisabled(true);
    rcShowTyping();
    try {
      const recommendation = await callRecommendation(q.id, q, {
        classroom_id: _chat.classroom_id,
        session_phase: _chat.session_phase,
        collected_answers: _chat.collected_answers,
      });
      rcHideTyping();
      const displayLabel = Array.isArray(recommendation.label)
        ? recommendation.label.join(', ') : recommendation.label;
      const recommendationMessage = `MiClass merekomendasikan: ${displayLabel}.\n\n${recommendation.reason}`;
      rcAppendBubble('ai', recommendationMessage);
      addToHistory('ai', recommendationMessage);
      rcRenderChips([
        { value: '__accept_ai__', label: 'Gunakan rekomendasi' },
        { value: '__choose_self__', label: 'Pilih sendiri' },
      ], async (value, chipLabel) => {
        rcClearChips();
        if (value === '__accept_ai__') {
          const guruBubble = rcAppendBubble('guru', chipLabel);
          addToHistory('guru', chipLabel);
          recordAnswer(q.id, recommendation.value, 'ai_recommendation', true);
          rcMakeBubbleEditable(guruBubble, q.id, _chat.session_phase, handleEditAnswer);
          await advanceToNext(q);
        } else {
          rcAppendBubble('guru', chipLabel);
          addToHistory('guru', chipLabel);
          askQuestion(q);
        }
      });
    } catch (_) {
      rcHideTyping();
      rcAppendBubble('sistem', 'Rekomendasi belum dapat dimuat. Silakan pilih sendiri.');
      askQuestion(q);
    } finally {
      _chat.in_flight = false;
      rcSetComposerDisabled(false);
    }
  }

  const FASE_V2 = new Set(['PILIH_TP', 'KONTEKS_MODUL', 'SUMBER_STRATEGI', 'ASESMEN_MODUL', 'MODUL_SUMMARY']);

  async function ensureModulDraft() {
    if (_chat.modul_induk_id) return;
    if (!_chat.atp_induk_id) {
      const e = new Error('ATP belum dipilih. Kembali dan pilih ATP terlebih dahulu.');
      e.code = 'ATP_REQUIRED';
      throw e;
    }
    const tp = _chat.selected_tp || {};
    let draft;
    try {
      draft = await createModulIndukDraft(
        _chat.atp_induk_id, tp.nomor || 1, tp.judul || '');
    } catch (_e) {
      await new Promise(r => setTimeout(r, 2000));
      draft = await createModulIndukDraft(
        _chat.atp_induk_id, tp.nomor || 1, tp.judul || '');
    }
    _chat.modul_induk_id  = draft.id;
    _chat.modul_updated_at = draft.updated_at;
    saveState();
  }

  async function persistModulPhase(phase) {
    await ensureModulDraft();
    const phaseData = phaseAnswerObject(phase);
    if (phase === 'PILIH_TP') {
      phaseData.selected_tp = _chat.selected_tp;
    }
    const saved = await saveModulPhaseOptimistic(
      _chat.modul_induk_id, phase, phaseData, _chat.modul_updated_at
    );
    _chat.modul_updated_at = saved.updated_at;
    saveState();
  }

  async function ensureAtpDraft() {
    if (_chat.atp_induk_id) return;
    const mapel = answerValue('mapel') || 'Belum ditentukan';
    const fase  = answerValue('fase')  || 'E';
    const jenjang = answerValue('jenjang') || 'SMK';
    const draft = await createAtpIndukDraft({
      mapel,
      fase,
      jenjang,
      elemen_cp: lookupCpElemen(mapel, fase),
    });
    _chat.atp_induk_id = draft.id;
    _chat.atp_updated_at = draft.updated_at;
    saveState();

    // Draft sebelumnya untuk mapel+fase+jenjang yang sama sudah ditinggalkan —
    // arsipkan supaya tidak menumpuk. Sengaja tanpa await: kegagalan cleanup
    // tidak boleh menghentikan funnel yang sedang berjalan.
    cleanupAbandonedDrafts(draft.id, { mapel, fase, jenjang, createdAt: draft.created_at })
      .then(n => { if (n) console.info(`[rancang-chat] ${n} draft ATP lama diarsipkan.`); })
      .catch(e => console.warn('[rancang-chat] cleanupAbandonedDrafts gagal:', e));
  }

  async function persistCompletedPhase(phase) {
    if (FASE_V2.has(phase)) {
      await persistModulPhase(phase);
      return;
    }
    await ensureAtpDraft();
    const phaseData = phaseAnswerObject(phase);

    if (phase === 'KONTEKS_CP') {
      ['mapel', 'nama_kelas', 'fase', 'jenjang', 'program_keahlian'].forEach(id => {
        if (_chat.collected_answers[id]) phaseData[id] = _chat.collected_answers[id];
      });
    } else if (phase === 'TARGET_FASE') {
      const targetText = resolveTargetFaseText();
      const targetAns  = answer(targetText, 'otomatis', true);
      phaseData.target_fase_resolved          = targetAns;
      _chat.collected_answers.target_fase_resolved = targetAns;
    } else if (phase === 'PROFIL_SISWA') {
      const kesulitan    = resolveKesulitanDiantisipasi();
      const kesulitanAns = answer(kesulitan.value, kesulitan.source, true);
      phaseData.kesulitan_diantisipasi                 = kesulitanAns;
      _chat.collected_answers.kesulitan_diantisipasi   = kesulitanAns;
    }

    const saved = await saveAtpPhaseOptimistic(
      _chat.atp_induk_id, phase, phaseData, _chat.atp_updated_at
    );
    _chat.atp_updated_at = saved.updated_at;

    if (phase === 'WAKTU') {
      await saveAtpAdaptasi(_chat.atp_induk_id, _chat.classroom_id, { alokasi_waktu: phaseData });
    } else if (phase === 'TARGET_FASE') {
      // Gabung update target_fase dengan optimistic lock menggunakan updated_at terbaru dari saved,
      // agar _chat.atp_updated_at selalu sinkron dan tidak memicu false conflict di fase berikutnya.
      const targetText = resolveTargetFaseText();
      const { data: writtenTarget } = await window.supabaseClient
        .from('atp_induk')
        .update({ target_fase: targetText })
        .eq('id', _chat.atp_induk_id)
        .eq('updated_at', saved.updated_at)
        .select('id, updated_at')
        .maybeSingle();
      if (writtenTarget) _chat.atp_updated_at = writtenTarget.updated_at;
    } else if (phase === 'PROFIL_SISWA') {
      await saveAtpAdaptasi(_chat.atp_induk_id, _chat.classroom_id, { profil_siswa: phaseData });
    } else if (phase === 'KONTEKS_DUDI') {
      await saveAtpAdaptasi(_chat.atp_induk_id, _chat.classroom_id, { konteks_dudi: phaseData });
    }
    saveState();
  }

  async function advanceToNext(currentQ) {
    const next = getNextQuestion(
      _chat.session_phase,
      currentQ.id,
      _chat.collected_answers
    );
    if (next) {
      askQuestion(next);
    } else {
      try {
        await persistCompletedPhase(_chat.session_phase);
      } catch (error) {
        const message = error.code === 'ATP_WRITE_CONFLICT'
          ? error.message
          : 'Fase belum tersimpan ke database. Coba lagi sebelum melanjutkan.';
        rcAppendBubble('sistem', message);
        const btn = document.createElement('button');
        btn.className = 'rp-chip';
        btn.textContent = '↺ Coba lagi';
        btn.addEventListener('click', function () {
          btn.closest('.rc-bubble')?.remove();
          advanceToNext(currentQ);
        });
        rcAppendBubble('sistem', btn);
        return;
      }
      if (_chat.session_phase === 'WAKTU' && calculateAllocation().jp_operasional <= 0) {
        rcAppendBubble('sistem',
          'Alokasi JP tidak valid (0 JP). Pilih cara lain untuk menentukan minggu efektif.');
        const modeQ = (RANCANG_FLOW['WAKTU'] || []).find(q => q.id === 'minggu_efektif_mode');
        if (modeQ) askQuestion(modeQ);
        return;
      }
      const revisionPhase = revisionDestination(currentQ.id, answerValue(currentQ.id));
      if (revisionPhase) {
        await startPhase(revisionPhase);
        return;
      }
      const nextPhase = getNextPhase(_chat.session_phase);
      if (nextPhase) await startPhase(nextPhase);
    }
  }

  function revisionDestination(questionId, value) {
    if (questionId === 'konfirmasi_konteks' && value !== 'sesuai') return 'KONTEKS_CP';
    if (questionId === 'konfirmasi_waktu' && value === 'ubah') return 'WAKTU';
    if (questionId === 'konfirmasi_target' && value === 'ubah') return 'TARGET_FASE';
    if (questionId === 'konfirmasi_dudi' && value === 'ubah') return 'KONTEKS_DUDI';
    if (questionId === 'persetujuan_atp_summary' && value !== 'generate') {
      return ({
        ubah_prioritas: 'PRIORITAS', ubah_waktu: 'WAKTU', ubah_profil: 'PROFIL_SISWA',
        ubah_target: 'TARGET_FASE', ubah_konteks: 'KONTEKS_DUDI',
        ubah_prasyarat: 'PENGUATAN_PRASYARAT',
      })[value] || 'ATP_SUMMARY';
    }
    if (questionId === 'tindakan_review_atp') {
      return ({
        waktu:          'WAKTU',
        ubah_prioritas: 'PRIORITAS',
        ubah_target:    'TARGET_FASE',
      })[value] || null; // terima/ulang/rumusan/urutan ditangani di handleChipSelect
    }
    if (questionId === 'persetujuan_modul_summary' && value !== 'generate') {
      return ({
        ubah_pertemuan: 'PILIH_TP',
        ubah_konteks:   'KONTEKS_MODUL',
        ubah_strategi:  'SUMBER_STRATEGI',
        ubah_asesmen:   'ASESMEN_MODUL',
      })[value] || 'MODUL_SUMMARY';
    }
    return null;
  }

  // ─── Validasi ─────────────────────────────────────────────────────────────

  async function evaluateAnswer(q, rawText) {
    // Validasi deterministik untuk pilihan dan angka — tanpa memanggil AI
    if (q.kind === 'pilihan' || q.kind === 'konfirmasi') {
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
        suggestions: q.options ?? [],
      };
    }

    if (q.kind === 'pilihan_jamak') {
      const parts = rawText.split(',').map(value => value.trim().toLowerCase()).filter(Boolean);
      const matched = q.options.filter(option => parts.some(part =>
        part === option.value.toLowerCase() || part === option.label.toLowerCase()
      ));
      const max = q.constraints?.maxSelections || Infinity;
      if (!matched.length || matched.length > max) {
        return { status: 'CLARIFY', message: `Pilih 1 sampai ${max === Infinity ? 'beberapa' : max} opsi.` };
      }
      const values = matched.map(option => option.value);
      const exclusive = q.constraints?.exclusive || [];
      if (values.some(value => exclusive.includes(value)) && values.length > 1) {
        return { status: 'CLARIFY', message: 'Pilihan eksklusif tidak dapat digabungkan dengan pilihan lain.' };
      }
      return { status: 'ACCEPT', normalizedAnswer: values,
        message: `Dicatat: ${matched.map(option => option.label).join(', ')}.` };
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
      return await callEvaluateAnswer(q.id, rawText, q, {
        classroom_id:      _chat.classroom_id,
        session_phase:     _chat.session_phase,
        collected_answers: _chat.collected_answers,
      });
    }

    // Fallback
    return { status: 'ACCEPT', normalizedAnswer: rawText, message: 'Dicatat.' };
  }

  // ─── Render draf ATP ──────────────────────────────────────────────────────

  function renderAtpDraftPreview() {
    if (!_chat.atp_draft?.length) return;
    const mapel      = answerValue('mapel') || '';
    const fase       = answerValue('fase')  || 'E';
    const elemenList = lookupCpElemen(mapel, fase);
    const elemenMap  = Object.fromEntries(elemenList.map(e => [e.id, e.label]));
    const total      = _chat.atp_draft.reduce((s, tp) => s + (tp.jp_alokasi || 0), 0);
    const allElemen  = [...new Set(_chat.atp_draft.flatMap(tp => tp.elemen || []))];
    const elemenLabels = allElemen.map(id => elemenMap[id] || id);

    let text = `Draf ATP — ${_chat.atp_draft.length} TP, total ${total} JP`;
    if (elemenLabels.length) text += `\nElemen tercakup: ${elemenLabels.join(', ')}`;
    text += '\n';
    for (const tp of _chat.atp_draft) {
      const el = (tp.elemen || []).map(id => elemenMap[id] || id).join(', ');
      text += `\nTP ${tp.nomor}. ${tp.judul} (${tp.jp_alokasi} JP)`;
      if (el) text += `\n   Elemen: ${el}`;
    }
    rcAppendBubble('ai', text.trim());
    addToHistory('ai', `Draf ATP — ${_chat.atp_draft.length} TP, total ${total} JP`);
  }

  function renderModulPreview() {
    const konten = _chat.modul_konten;
    if (!konten) {
      rcAppendBubble('sistem', '⚠ Konten modul tidak ditemukan.');
      return;
    }
    const header =
      `Modul Ajar — TP ${konten.tp_nomor}: ${konten.tp_judul}\n` +
      `${konten.jumlah_pertemuan} pertemuan · ${konten.jp_per_pertemuan} JP per pertemuan`;
    rcAppendBubble('ai', header);
    addToHistory('ai', header);

    for (const p of konten.pertemuan) {
      const aktivitasLines = p.aktivitas
        .map(a => `  [${a.tahap} ${a.durasi_menit}′] ${a.deskripsi}`)
        .join('\n');
      const bubble =
        `Pertemuan ${p.nomor}\n` +
        `Tujuan: ${p.tujuan_pertemuan}\n` +
        `Media: ${(p.media_dan_alat || []).join(', ')}\n\n` +
        `${aktivitasLines}\n\n` +
        `Asesmen formatif: ${p.asesmen_formatif}` +
        (p.catatan_guru ? `\nCatatan: ${p.catatan_guru}` : '');
      rcAppendBubble('ai', bubble);
    }

    const footer = `Asesmen sumatif: ${konten.asesmen_sumatif}`;
    rcAppendBubble('ai', footer);
  }

  // ─── Generate ATP ─────────────────────────────────────────────────────────

  async function triggerGenerateAtp() {
    rcAppendBubble('ai', '⏳ Menyusun Alur Tujuan Pembelajaran…');
    addToHistory('ai', 'Menyusun Alur Tujuan Pembelajaran…');
    rcShowTyping();
    try {
      const result = await callGenerateAtp(_chat.atp_induk_id, _chat.atp_updated_at);
      rcHideTyping();
      _chat.atp_draft      = result.progresi_tp;
      _chat.atp_updated_at = result.updated_at;
      saveState();
      const s = result.summary;
      const elemenInfo = s.elemen_tercakup?.length ? `\nElemen: ${s.elemen_tercakup.join(', ')}.` : '';
      const msg = `ATP selesai disusun: ${s.jumlah_tp} TP, total ${s.total_jp} JP.${elemenInfo}`;
      rcAppendBubble('ai', msg);
      addToHistory('ai', msg);
      await startPhase('ATP_REVIEW');
    } catch (err) {
      rcHideTyping();
      const code = err.code || '';
      let msg;
      let retryable = false;
      if (code === 'ATP_INPUT_INCOMPLETE') {
        const list = err.missing?.join(', ') || '';
        msg = `❌ Data funnel belum lengkap${list ? ': ' + list : ''}.`;
      } else if (code === 'ATP_GENERATION_CONFLICT') {
        msg = '❌ Jawaban funnel berubah sejak disimpan. Muat ulang halaman lalu coba lagi.';
      } else if (['ATP_GENERATION_JP_MISMATCH', 'ATP_GENERATION_INVALID_ELEMENT',
                  'ATP_GENERATION_INVALID_JSON'].includes(code)) {
        msg = '❌ AI gagal menghasilkan ATP yang valid. Silakan coba lagi.';
        retryable = true;
      } else if (code === 'ATP_GENERATION_TIMEOUT') {
        msg = '❌ Waktu habis saat menyusun ATP. Silakan coba lagi.';
        retryable = true;
      } else if (code === 'RATE_LIMIT') {
        msg = '❌ Batas generate ATP harian (3×) tercapai. Coba lagi besok.';
      } else {
        msg = '❌ Gagal menyusun ATP. Coba lagi.';
        retryable = true;
      }
      rcAppendBubble('sistem', msg);
      if (retryable) {
        const btn = document.createElement('button');
        btn.className = 'rp-chip';
        btn.textContent = '↺ Coba lagi';
        btn.addEventListener('click', () => {
          btn.closest('.rc-bubble')?.remove();
          triggerGenerateAtp();
        });
        rcAppendBubble('sistem', btn);
      }
    }
  }

  async function triggerGenerateModul() {
    rcAppendBubble('ai', '⏳ Menyusun Modul Ajar…');
    addToHistory('ai', 'Menyusun Modul Ajar…');
    rcShowTyping();
    try {
      const result = await callGenerateModul(
        _chat.modul_induk_id,
        _chat.modul_updated_at,
      );
      rcHideTyping();
      _chat.modul_konten     = result.konten;
      _chat.modul_updated_at = result.updated_at;
      saveState();
      const s = result.summary;
      const msg =
        `Modul Ajar selesai disusun: ${s.jumlah_pertemuan} pertemuan, ` +
        `${s.jp_per_pertemuan} JP per pertemuan.`;
      rcAppendBubble('ai', msg);
      addToHistory('ai', msg);
      await startPhase('MODUL_REVIEW');
    } catch (err) {
      rcHideTyping();
      const code = err.code || '';
      let msg;
      let retryable = false;
      if (code === 'MODUL_INPUT_INCOMPLETE') {
        msg = '❌ Data modul belum lengkap. Kembali ke ringkasan dan periksa jawaban.';
      } else if (code === 'MODUL_WRITE_CONFLICT') {
        msg = '❌ Data modul berubah di tab lain. Muat ulang halaman lalu coba lagi.';
      } else if (code === 'MODUL_NOT_FOUND') {
        msg = '❌ Modul tidak ditemukan. Muat ulang halaman.';
      } else if (['MODUL_GENERATION_INVALID_JSON', 'MODUL_GENERATION_INVALID_SCHEMA'].includes(code)) {
        msg = '❌ AI gagal menghasilkan Modul yang valid. Silakan coba lagi.';
        retryable = true;
      } else if (code === 'MODUL_GENERATION_TIMEOUT') {
        msg = '❌ Waktu habis saat menyusun Modul. Silakan coba lagi.';
        retryable = true;
      } else if (code === 'RATE_LIMIT') {
        msg = '❌ Batas generate Modul harian (5×) tercapai. Coba lagi besok.';
      } else {
        msg = '❌ Gagal menyusun Modul. Coba lagi.';
        retryable = true;
      }
      rcAppendBubble('sistem', msg);
      if (retryable) {
        const btn = document.createElement('button');
        btn.className = 'rp-chip';
        btn.textContent = '↺ Coba lagi';
        btn.addEventListener('click', () => {
          btn.closest('.rc-bubble')?.remove();
          triggerGenerateModul();
        });
        rcAppendBubble('sistem', btn);
      }
    }
  }

  async function acceptModulInduk() {
    try {
      const { data, error } = await window.supabaseClient
        .from('modul_induk')
        .update({ status: 'aktif' })
        .eq('id', _chat.modul_induk_id)
        .eq('updated_at', _chat.modul_updated_at)
        .select('id, updated_at')
        .maybeSingle();
      if (error) throw error;
      if (!data) {
        rcAppendBubble('sistem',
          '❌ Modul berubah di tab lain. Muat ulang halaman lalu coba lagi.');
        return;
      }
      _chat.modul_updated_at = data.updated_at;
      saveState();
      rcAppendBubble('ai', '✓ Modul Ajar diterima dan disimpan.');
      rcRenderChips([
        { value: '__kembali_utama__', label: '← Kembali ke layar utama' },
      ], function () {
        kembaliKeLayarUtama();
      });
    } catch (err) {
      rcAppendBubble('sistem', '❌ Gagal menerima modul. Coba lagi.');
      console.error('[acceptModulInduk]', err);
    }
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
