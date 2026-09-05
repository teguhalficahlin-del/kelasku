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
    modul_generating:     false,  // guard double-trigger generate-modul
    atp_generating:       false,  // guard double-trigger generate-atp
    sumber_flow:          null,   // 'sesuaikan' | 'susun' | 'modul'
    state_saved_at:       null,   // timestamp ms — staleness check >24 jam
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
  // Data katalog modul aktif — diset saat fetch berhasil agar MODUL_REVIEW
  // bisa merender ulang picker tanpa fetch ulang.
  let _katalogModuls = null;
  let _katalogBukaModul = null;

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
      sumber_flow:         _chat.sumber_flow,
      state_saved_at:      Date.now(),
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
    // Hint ringan (tanpa guru_id) agar initRancangChat bisa auto-resume tanpa RPC dulu.
    if (_chat.active_question_id && _chat.atp_induk_id) {
      try {
        localStorage.setItem('rc_sesi_' + _chat.classroom_id, JSON.stringify({
          ls_key: LS_KEY(), atp_induk_id: _chat.atp_induk_id, ts: Date.now(),
        }));
      } catch (_) {}
    } else {
      try { localStorage.removeItem('rc_sesi_' + _chat.classroom_id); } catch (_) {}
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
      const stale = saved.state_saved_at &&
        (Date.now() - saved.state_saved_at) > 24 * 60 * 60 * 1000;
      Object.assign(_chat, {
        active_question_id:  saved.active_question_id  ?? null,
        collected_answers:   stale ? {} : (saved.collected_answers ?? {}),
        conversation_history: saved.conversation_history ?? [],
        session_phase:       stale ? 'KONTEKS_CP' : (saved.session_phase ?? 'KONTEKS_CP'),
        atp_induk_id:        saved.atp_induk_id        ?? null,
        atp_updated_at:      saved.atp_updated_at      ?? null,
        atp_draft:           saved.atp_draft           ?? [],
        selected_tp:         saved.selected_tp         ?? null,
        modul_induk_id:      saved.modul_induk_id      ?? null,
        modul_updated_at:    saved.modul_updated_at    ?? null,
        teaching_context_id: saved.teaching_context_id ?? null,
        planning_context_id: saved.planning_context_id ?? null,
        sumber_flow:         saved.sumber_flow         ?? null,
        state_saved_at:      saved.state_saved_at      ?? null,
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
      if (!mapelKey) return [];
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
    if (mode === 'target_guru' || mode === 'rekomendasi') return answerValue('target_akhir_teks') || '';
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
    try { localStorage.removeItem('rc_sesi_' + (_chat.classroom_id || '')); } catch (_) {}
    try { localStorage.removeItem(LS_KEY()); } catch (_) {}
    Object.assign(_chat, {
      atp_induk_id:         null,
      atp_updated_at:       null,
      atp_status:           null,
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
    _chat.atp_status     = atp.status || null;
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
      if (_chat.atp_status === 'aktif') {
        startPhase('DONE');
      } else {
        rcAppendBubble('sistem', 'Membuka ATP tersimpan — meninjau draf yang sudah ada.');
        startPhase('ATP_REVIEW');
      }
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
    // PILIH_ATP: ATP sudah dipilih dari picker (id ada di _chat.atp_induk_id).
    // Fase ini bisa terlewat di flow 'susun' sehingga tidak masuk collected_data,
    // tapi startPhase('PILIH_ATP') hanya menampilkan ATP aktif — draf tidak
    // terlihat dan guru mendapat pesan error. Lewati ke fase berikutnya.
    if (phase === 'PILIH_ATP') phase = getNextPhase('PILIH_ATP');
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
  <div id="rc-modul-progress" style="display:none;flex-shrink:0;padding:6px 14px 4px;font-size:0.82rem;color:var(--gold,#f2c14e);border-bottom:1px solid rgba(242,193,78,0.18);background:rgba(242,193,78,0.05);">Modul Ajar · Langkah <span id="rc-prog-step">1</span> dari 4 · <span id="rc-prog-name"></span></div>
  <div class="rc-stream" id="rc-stream" style="flex:1;overflow-y:auto;min-height:0;"></div>
  <div id="rc-chips" style="flex-shrink:0;"></div>
  <div id="rc-composer-wrap" style="flex-shrink:0;display:none;"></div>
</div>`;

    attachRcBackBtnListener();
    _confirmingKembali = false;

    try {
      _chat.profile = await window.api.getRancangProfil();
    } catch (_) { _chat.profile = null; }

    // Simpan sumber_flow yang baru diset dari welcome handler — loadState()
    // bisa menimpa dengan nilai lama dari localStorage.
    // Mode susun: state sudah bersih dari resetSessionState(), skip loadState.
    const _pendingSumberFlow = _chat.sumber_flow;
    const restored = mode === 'susun' ? false : loadState();
    // Kembalikan sumber_flow baru jika memang baru diset (bukan null).
    if (_pendingSumberFlow) _chat.sumber_flow = _pendingSumberFlow;
    rcRenderComposer('rc-composer-wrap', handleGuruInput);
    if (notice) rcAppendBubble('sistem', notice);

    if (mode === 'modul' && _chat.atp_induk_id) {
      if (_chat.viewing_existing_modul && _chat.modul_induk_id) {
        startPhase('MODUL_REVIEW');
        return;
      }
      if (_chat.atp_draft?.length) {
        rcAppendBubble('sistem', 'ATP dimuat — pilih TP yang ingin dirancang.');
        startPhase('DONE');
      } else {
        resumeAtpFromDb();
      }
      return;
    }
    if (mode === 'adaptasi' && _chat.atp_induk_id) {
      if (restored && _chat.active_question_id) {
        // Sesi aktif tersimpan di localStorage untuk ATP ini — replay langsung.
        (_chat.conversation_history || []).forEach(function (entry) {
          rcAppendBubble(entry.role, entry.text);
        });
        rcAppendBubble('sistem', 'Melanjutkan sesi sebelumnya…');
        renderActiveQuestion();
      } else {
        resumeAtpFromDb();
      }
    } else if (restored && _chat.active_question_id) {
      (_chat.conversation_history || []).forEach(function (entry) {
        rcAppendBubble(entry.role, entry.text);
      });
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
      // Jika program_keahlian belum tercatat, auto-jawab konfirmasi='tidak'
      // sehingga pertanyaan pilih_program_keahlian langsung muncul.
      if (!window._classroomProgram) {
        _chat.collected_answers.konfirmasi_program_keahlian = answer('tidak', 'otomatis', true);
      }
      startPhase('KONTEKS_CP');
    }

    _loaded = true;
  }

  // Buka ATP yang dipilih guru dari picker. collected_data tidak ikut di
  // getAtpIndukList() (daftar sengaja ramping), jadi diambil di sini. Query
  // langsung ke supabaseClient mengikuti preseden persistCompletedPhase —
  // idealnya pindah ke rancang-chat-api.js saat file itu boleh disentuh lagi.
  async function openAtpAdaptasi(cId, panel, picked, skipToModul) {
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

    // Simpan history + posisi dari localStorage sebelum hydrateFromAtp menghapusnya.
    // Dipakai untuk restore sesi jika guru membuka ulang ATP yang sama dari picker.
    let _savedHistory = [], _savedActiveQ = null, _savedPhase = null;
    try {
      const raw = localStorage.getItem(LS_KEY());
      if (raw) {
        const saved = JSON.parse(raw);
        if (saved?.atp_induk_id === picked.id && saved?.active_question_id) {
          _savedHistory = saved.conversation_history || [];
          _savedActiveQ = saved.active_question_id;
          _savedPhase   = saved.session_phase;
        }
      }
    } catch (_) {}

    hydrateFromAtp(full);

    // Pulihkan sesi tersimpan setelah hydrate (hydrate sudah set collected_answers dari DB).
    if (_savedActiveQ) {
      _chat.conversation_history = _savedHistory;
      _chat.active_question_id   = _savedActiveQ;
      _chat.session_phase        = _savedPhase;
      saveState();
    }

    await initChatShell(cId, panel, skipToModul ? 'modul' : 'adaptasi');
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
  function renderAtpPickerScreen(panel, cId, list, mapelDisplay, skipToModul) {
    rcRenderAtpPicker(panel, list, async function (picked) {
      _initializing = true;
      try {
        await openAtpAdaptasi(cId, panel, picked, skipToModul);
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
    }, kembaliKeLayarUtama);
  }

  // atpList: array (jumlah diketahui) atau null (query gagal, jumlah tidak diketahui).
  function makeWelcomeContinueHandler(panel, cId, mapelDisplay, atpList) {
    const atpCount = atpList ? atpList.length : null;
    return async function (mode) {
      _initializing = true;
      try {
        _chat.sumber_flow = mode;

        // Card "ATP Aktif": langsung tampilkan picker tanpa masuk flow chat
        if (mode === 'sesuaikan') {
          renderAtpPickerScreen(panel, cId, atpList || [], mapelDisplay);
          return;
        }

        let notice = null;
        if (mode === 'modul') {
          const atpAktif = (atpList || []).filter(function (a) { return a.status === 'aktif'; });
          if (!atpAktif.length) {
            // Belum ada ATP aktif — jangan masuk flow, tampilkan pesan + tombol kembali
            panel.innerHTML = `
<div class="rc-welcome" id="rc-modul-gate">
  <div class="rc-welcome-header">
    <h2 class="rc-welcome-title">Buat Modul Ajar</h2>
    <p class="rc-welcome-lead">Modul Ajar dibuat dari ATP yang sudah aktif. Belum ada ATP aktif untuk kelas ini — susun ATP terlebih dahulu, baru kembali ke sini.</p>
  </div>
  <div class="rc-welcome-footer" style="display:flex;gap:12px;flex-wrap:wrap;">
    <button type="button" class="rc-welcome-btn" id="rc-modul-gate-kembali"
      style="background:transparent;border:1px solid var(--border,rgba(255,255,255,0.12));color:var(--text-muted,#888);">
      ← Menu Rancang
    </button>
  </div>
</div>`;
            panel.querySelector('#rc-modul-gate-kembali')?.addEventListener('click', kembaliKeLayarUtama);
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

      // Guard FIX 5: jika data kelas belum ada, tampilkan notifikasi ringan
      // (program_keahlian ditangani otomatis di KONTEKS_CP — bukan onboarding penuh)
      if (!window._classroomSubject && !window._classroomProgram) {
        panel.innerHTML =
          '<div style="padding:32px 24px;max-width:480px;margin:0 auto;">' +
          '<p style="color:var(--text-muted,#888);font-size:0.92rem;line-height:1.6;">' +
          'Data mata pelajaran kelas ini belum tersedia. Buka halaman kelas dan pastikan mata pelajaran sudah terisi, lalu buka kembali tab Rancang.</p>' +
          '</div>';
        return;
      }

      // Auto-resume: cek hint sesi aktif (tanpa RPC — pakai classroom_id saja).
      // Jika ada, lewati welcome screen dan buka langsung ATP yang sedang dikerjakan.
      const _resumeHint = (() => {
        try {
          const raw = localStorage.getItem('rc_sesi_' + cId);
          if (!raw) return null;
          const h = JSON.parse(raw);
          if (!h?.ls_key || !h?.atp_induk_id) return null;
          if (h.ts && (Date.now() - h.ts) > 24 * 60 * 60 * 1000) return null;
          // Verifikasi sesi penuh ada di localStorage
          const full = JSON.parse(localStorage.getItem(h.ls_key) || 'null');
          if (!full?.active_question_id) return null;
          return h;
        } catch (_) { return null; }
      })();

      if (_resumeHint) {
        panel.innerHTML =
          '<div style="display:flex;align-items:center;justify-content:center;padding:48px 24px;' +
          'color:var(--text-muted,#888);font-size:0.92rem;">⏳ Melanjutkan sesi…</div>';
        try {
          await openAtpAdaptasi(cId, panel, { id: _resumeHint.atp_induk_id }, false);
        } catch (_) {
          // Gagal auto-resume — lanjut ke welcome screen normal
          try { localStorage.removeItem('rc_sesi_' + cId); } catch (_) {}
        }
        if (_loaded) return; // openAtpAdaptasi set _loaded via initChatShell
      }

      // Tampilkan loading state sementara fetch ATP berlangsung
      panel.innerHTML =
        '<div style="display:flex;align-items:center;justify-content:center;padding:48px 24px;' +
        'color:var(--text-muted,#888);font-size:0.92rem;">⏳ Memuat data kelas…</div>';

      // Fetch ATP — gagal = jumlah tidak diketahui (null), bukan nol.
      // atpCount null: badge '— ATP', kartu sesuaikan tetap tersembunyi.
      let atpList = null;
      try {
        atpList = (await getAtpIndukList()).filter(atp => atp.status !== 'arsip');
      } catch (e) {
        console.warn('[rancang-chat] getAtpIndukList gagal; jumlah ATP tidak ditampilkan:', e);
      }
      const atpCount = atpList ? atpList.length : null;

      const _atpAktifFirst = (atpList || []).find(function (a) { return a.status === 'aktif'; });
      const _atpSummary = _atpAktifFirst ? (function () {
        const tps = Array.isArray(_atpAktifFirst.progresi_tp) ? _atpAktifFirst.progresi_tp : [];
        return {
          jumlah_tp: tps.length,
          total_jp: tps.reduce(function (s, tp) { return s + (tp.jp_alokasi || 0); }, 0),
          total_pertemuan: tps.reduce(function (s, tp) {
            return s + (Array.isArray(tp.jp_pertemuan) ? tp.jp_pertemuan.length : 1);
          }, 0),
        };
      })() : null;

      rcRenderWelcomeScreen(panel, mapelDisplay,
        makeWelcomeContinueHandler(panel, cId, mapelDisplay, atpList), atpCount, _atpSummary);

      // ITEM 10: katalog modul aktif — query tanpa menahan render
      const katalogEl = document.getElementById('rc-modul-katalog');
      if (katalogEl) {
        fetchAllModulAktifGuru().then(function (moduls) {
          async function bukaModul(modul) {
            _initializing = true;
            try {
              const { data: atpFull, error: atpErr } = await window.supabaseClient
                .from('atp_induk')
                .select('id, mapel, fase, jenjang, status, updated_at, progresi_tp, collected_data')
                .eq('id', modul.atp_induk_id)
                .single();
              if (atpErr) throw atpErr;
              hydrateFromAtp(atpFull);
              const tp = (atpFull.progresi_tp || []).find(function (t) { return t.nomor === modul.nomor_tp; });
              _chat.selected_tp = tp || { nomor: modul.nomor_tp, judul: modul.tp_judul };
              _chat.modul_induk_id = modul.id;
              _chat.viewing_existing_modul = true;
              _chat.modul_source = 'katalog';
              const { data: mFull, error: mErr } = await window.supabaseClient
                .from('modul_induk')
                .select('id, konten, updated_at')
                .eq('id', modul.id)
                .single();
              if (!mErr && mFull) {
                _chat.modul_konten = mFull.konten;
                _chat.modul_updated_at = mFull.updated_at;
              }
              saveState();
              await initChatShell(cId, panel, 'modul');
            } catch (e) {
              console.error('[rancang-chat] gagal membuka modul dari katalog:', e);
              kembaliKeLayarUtama();
            } finally {
              _initializing = false;
            }
          }
          _katalogModuls = moduls;
          _katalogBukaModul = bukaModul;
          rcRenderModulKatalog(katalogEl, moduls, function () {
            rcRenderModulPicker(panel, moduls, bukaModul, kembaliKeLayarUtama);
          });
        }).catch(function (e) {
          console.warn('[rancang-chat] fetchAllModulAktifGuru gagal:', e);
        });
      }
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
    try { localStorage.removeItem('rc_sesi_' + cId); } catch (_) {}
    try { localStorage.removeItem(LS_KEY()); } catch (_) {}
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
      updateContextualBackBtn(_chat.session_phase);
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

  // ITEM 6: label + handler tombol rc-back-btn disesuaikan per fase
  function updateContextualBackBtn(phase) {
    const btn = document.getElementById('rc-back-btn');
    if (!btn) return;
    const BACK = {
      KONTEKS_MODUL:   { label: '← Pilih TP',          fn: function () { startPhase('DONE'); } },
      SUMBER_STRATEGI: { label: '← Konteks Modul',      fn: function () { goBackToPhase('KONTEKS_MODUL'); } },
      ASESMEN_MODUL:   { label: '← Sumber & Strategi',  fn: function () { goBackToPhase('SUMBER_STRATEGI'); } },
      MODUL_SUMMARY:   { label: '← Asesmen',            fn: function () { goBackToPhase('ASESMEN_MODUL'); } },
      MODUL_REVIEW:    _chat.modul_source === 'katalog'
        ? { label: '← Modul Ajar Aktif', fn: function () {
              rcClearChips();
              _chat.viewing_existing_modul = false;
              _chat.modul_source = 'flow';
              const panel = document.getElementById('panel-rancang');
              if (panel && _katalogModuls && _katalogBukaModul) {
                rcRenderModulPicker(panel, _katalogModuls, _katalogBukaModul, kembaliKeLayarUtama);
              } else {
                kembaliKeLayarUtama();
              }
            } }
        : { label: '← Daftar TP',        fn: function () { rcClearChips(); startPhase('DONE'); } },
      MODUL_GENERATE:  null, // tombol disembunyikan
    };
    const entry = BACK[phase];
    if (entry === null) {
      btn.style.display = 'none';
      return;
    }
    btn.style.display = '';
    if (entry === undefined) {
      btn.textContent = '← Rancang';
      const fresh = btn.cloneNode(true);
      btn.replaceWith(fresh);
      fresh.addEventListener('click', handleKembaliRancangClick);
      return;
    }
    btn.textContent = entry.label;
    const fresh = btn.cloneNode(true);
    btn.replaceWith(fresh);
    fresh.addEventListener('click', entry.fn);
  }

  // Kembali ke fase sebelumnya: bersihkan jawaban fase target lalu restart.
  // Jawaban fase-fase yang lebih maju (sesudah target) tetap tersimpan —
  // kalau guru tidak mengubah apa-apa, processPhase akan melewatinya otomatis.
  function goBackToPhase(targetPhase) {
    const questions = RANCANG_FLOW[targetPhase] || [];
    questions.forEach(function (q) {
      delete _chat.collected_answers[q.id];
      delete _chat.pending_multi[q.id];
    });
    _chat.session_phase = targetPhase;
    saveState();
    rcClearStream();
    rcClearChips();
    startPhase(targetPhase);
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
    if (typeof rcUpdateModulProgress === 'function') rcUpdateModulProgress(phase);
    updateContextualBackBtn(phase);
    if (phase === 'PILIH_ATP') {
      rcSetComposerVisible(false);
      rcClearChips();
      if (_chat.sumber_flow === 'susun') {
        // Mode susun baru — langsung ke PRIORITAS, tidak perlu pilih ATP
        await startPhase('PRIORITAS');
        return;
      }
      // Mode sesuaikan atau modul — fetch daftar ATP dan tampilkan picker
      const loadBubble = rcAppendBubble('ai', '⏳ Memuat daftar ATP yang tersedia…');
      let atpList = [];
      try {
        const semua = await getAtpIndukList();
        atpList = semua.filter(function (a) { return a.status === 'aktif'; });
      } catch (e) {
        if (loadBubble) loadBubble.remove();
        rcAppendBubble('sistem', 'Gagal memuat daftar ATP. Periksa koneksi lalu coba lagi.');
        rcRenderChips([{ value: '__coba_lagi__', label: '↺ Coba lagi' }], function () {
          rcClearChips();
          startPhase('PILIH_ATP');
        });
        return;
      }
      if (loadBubble) loadBubble.remove();
      if (!atpList.length) {
        rcAppendBubble('sistem',
          'Belum ada ATP aktif untuk kelas ini. Susun ATP baru terlebih dahulu.');
        rcRenderChips([{ value: '__susun_baru__', label: 'Susun ATP Baru' }], function () {
          rcClearChips();
          _chat.sumber_flow = 'susun';
          saveState();
          startPhase('PRIORITAS');
        });
        return;
      }
      // Render picker ATP langsung di panel (menggantikan shell flow sementara)
      const panel = document.getElementById('panel-rancang');
      if (!panel) return;
      const skipToModul = _chat.sumber_flow === 'modul';
      renderAtpPickerScreen(panel, _chat.classroom_id, atpList,
        answerValue('mapel') || window._classroomSubject || '—', skipToModul);
      return;
    }
    if (phase === 'ATP_GENERATE') {
      rcSetComposerVisible(false);
      await triggerGenerateAtp();
      return; // triggerGenerateAtp memanggil startPhase('ATP_REVIEW') sendiri jika sukses
    }
    if (phase === 'MODUL_GENERATE') {
      _chat.active_question_id = null;
      saveState();
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
        const fromKatalog = _chat.modul_source === 'katalog';
        rcRenderChips([
          { value: '__kembali_daftar__', label: fromKatalog ? '← Modul Ajar Aktif' : '← Kembali ke daftar TP' },
        ], function () {
          rcClearChips();
          _chat.viewing_existing_modul = false;
          const wasKatalog = _chat.modul_source === 'katalog';
          _chat.modul_source = 'flow';
          saveState();
          if (wasKatalog && _katalogModuls && _katalogBukaModul) {
            const panel = document.getElementById('panel-rancang');
            if (panel) rcRenderModulPicker(panel, _katalogModuls, _katalogBukaModul, kembaliKeLayarUtama);
            else kembaliKeLayarUtama();
          } else {
            startPhase('DONE');
          }
        });
        return;
      }
      rcRenderChips([
        { value: '__buka_modul__',       label: '📄 Buka Modul Ajar' },
        { value: '__ulang_generate__',   label: '↺ Buat Ulang' },
        { value: '__kembali_daftar_tp__', label: '← Kembali ke daftar TP' },
      ], function (value) {
        rcClearChips();
        if (value === '__buka_modul__') {
          _chat.viewing_existing_modul = true;
          _chat.modul_source = 'flow';
          renderModulPreview();
          rcRenderChips([
            { value: '__kembali_daftar__', label: '← Kembali ke daftar TP' },
          ], function () {
            rcClearChips();
            _chat.viewing_existing_modul = false;
            startPhase('DONE');
          });
          return;
        }
        if (value === '__ulang_generate__') {
          startPhase('MODUL_GENERATE');
          return;
        }
        if (value === '__kembali_daftar_tp__') {
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
      rcClearStream();
      rcClearChips();
      if (_chat._modul_just_active) {
        rcAppendBubble('ai', '✓ Modul Ajar sudah aktif dan siap digunakan.');
        _chat._modul_just_active = false;
        saveState();
      }
      const tpList = _chat.atp_draft || [];
      if (!tpList.length) {
        rcRenderChips([{ value: '__kembali_utama__', label: '← Kembali ke layar utama' }], function () {
          kembaliKeLayarUtama();
        });
        return;
      }
      function renderTpChips(modulByNomor) {
        const stream = document.getElementById('rc-stream');
        if (!stream) return;

        const list = document.createElement('div');
        list.className = 'rc-tp-list';

        tpList.forEach(function (tp) {
          const item = document.createElement('button');
          item.type = 'button';
          item.className = 'rc-tp-item';
          item.dataset.value = 'tp_' + tp.nomor;

          const jp         = tp.jp_alokasi || 0;
          const pertemuan  = Array.isArray(tp.jp_pertemuan) ? tp.jp_pertemuan : [];
          const nPertemuan = pertemuan.length || 1;
          const distribusi = pertemuan.length > 1
            ? ` (${pertemuan.join('+')} JP)` : '';

          const label = document.createElement('span');
          label.className = 'rc-tp-item__label';
          label.textContent = `TP ${tp.nomor}. ${tp.judul}`;

          const meta = document.createElement('span');
          meta.className = 'rc-tp-item__meta';
          meta.textContent = `${jp} JP · ${nPertemuan} pertemuan${distribusi}`;

          item.appendChild(label);
          item.appendChild(meta);
          item.addEventListener('click', async function () {
            list.remove();
            rcClearChips();
            _chat.selected_tp      = tp;
            _chat.modul_induk_id   = null;
            _chat.modul_updated_at = null;

            const pertemuan  = Array.isArray(tp.jp_pertemuan) ? tp.jp_pertemuan : [];
            const nPertemuan = pertemuan.length || 1;
            const distribusi = pertemuan.length > 1
              ? ` (${pertemuan.join('+')} JP)` : '';
            const jp = tp.jp_alokasi || 0;

            const jumlahAnswer = {
              value: String(nPertemuan), source: 'otomatis', confirmed: true };
            if (!_chat.collected_answers) _chat.collected_answers = {};
            _chat.collected_answers.jumlah_pertemuan = jumlahAnswer;
            saveState();

            await persistModulPhase('PILIH_TP');
            await startPhase('KONTEKS_MODUL');
          });
          list.appendChild(item);

          if (modulByNomor && modulByNomor[tp.nomor]) {
            const m = modulByNomor[tp.nomor];
            const modulBtn = document.createElement('button');
            modulBtn.type = 'button';
            modulBtn.className = 'rc-tp-item--modul';
            modulBtn.textContent = '📄 Lihat Modul TP ' + tp.nomor;
            modulBtn.addEventListener('click', function (e) {
              e.stopPropagation();
              list.remove();
              rcClearChips();
              const matchTp = tpList.find(function (t) { return t.nomor === tp.nomor; });
              _chat.selected_tp            = matchTp || { nomor: tp.nomor, judul: tp.judul };
              _chat.modul_induk_id         = m.id;
              _chat.modul_updated_at       = m.updated_at;
              _chat.modul_konten           = m.konten;
              _chat.viewing_existing_modul = true;
              saveState();
              startPhase('MODUL_REVIEW');
            });
            list.appendChild(modulBtn);
          }
        });

        stream.appendChild(list);
        list.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      function renderTpChipsThenScroll(modulByNomor) {
        renderTpChips(modulByNomor);
      }
      fetchModulAktifByAtpId(_chat.atp_induk_id).then(function (modulAktif) {
        const modulByNomor = {};
        (modulAktif || []).forEach(function (m) { modulByNomor[m.nomor_tp] = m; });
        renderTpChipsThenScroll(modulByNomor);
      }).catch(function (err) {
        console.error('[rancang] fetchModulAktifByAtpId error:', err);
        renderTpChipsThenScroll(null);
      });
      return;
    }
    if (FASE_V2.has(phase)) {
      rcClearChips();
    }
    if (phase === 'KONTEKS_MODUL' && _chat.selected_tp) {
      const tp       = _chat.selected_tp;
      const jp       = tp.jp_alokasi || 0;
      const perm     = Array.isArray(tp.jp_pertemuan) ? tp.jp_pertemuan : [];
      const nPerm    = perm.length || 1;
      const dist     = perm.length > 1 ? ` (${perm.join('+')} JP)` : '';
      const msg      = `TP ${tp.nomor}. ${tp.judul}\n${jp} JP · ${nPerm} pertemuan${dist}`;
      rcAppendBubble('ai', msg);
      addToHistory('ai', msg);
    }
    if (phase === 'MODUL_SUMMARY') {
      renderModulSummaryInfo();
    }
    const questions = RANCANG_FLOW[phase];
    if (!questions?.length) return;
    // Jika phase KONTEKS_CP dan program_keahlian kosong, konfirmasi_program_keahlian
    // sudah di-auto-jawab 'tidak' — mulai dari pertanyaan kedua langsung.
    let firstToAsk = questions[0];
    if (phase === 'KONTEKS_CP' &&
        answerValue('konfirmasi_program_keahlian') === 'tidak' &&
        !window._classroomProgram) {
      const skip = getNextQuestion('KONTEKS_CP', 'konfirmasi_program_keahlian', _chat.collected_answers);
      if (skip) firstToAsk = skip;
    }
    if (phase === 'KONTEKS_MODUL') {
      const pk = String(answerValue('program_keahlian') || '').trim();
      if (pk && pk !== '__lainnya__') {
        _chat.collected_answers['konfirmasi_program_keahlian_modul'] = answer('ya', 'otomatis', true);
        const skip = getNextQuestion('KONTEKS_MODUL', 'konfirmasi_program_keahlian_modul', _chat.collected_answers);
        if (skip) firstToAsk = skip;
      }
    }
    askQuestion(firstToAsk);
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
    // Buang jawaban lama yang opsinya sudah tidak ada (cegah kontaminasi AI)
    if ((q.kind === 'pilihan' || q.kind === 'konfirmasi') && Array.isArray(q.options)) {
      const cur = answerValue(q.id);
      if (cur && !q.options.some(o => o.value === cur)) {
        delete _chat.collected_answers[q.id];
      }
    }
    _chat.active_question_id = q.id;
    saveState();

    rcAppendBubble('ai', renderQuestionPrompt(q.prompt));
    if (q.helpText) rcAppendBubble('sistem', '💡 ' + q.helpText);

    const needsInput = q.kind === 'teks_bebas' || q.kind === 'angka';
    rcSetComposerVisible(needsInput);

    const DROPDOWN_SEARCH_IDS = new Set(['pilih_program_keahlian', 'pilih_program_keahlian_modul']);
    if (q.kind === 'pilihan_jamak') {
      renderMultiSelect(q, true);
    } else if (DROPDOWN_SEARCH_IDS.has(q.id)) {
      rcRenderDropdownSearch(q.options, (value, label) => {
        handleChipSelect(value, label, q);
      });
    } else if (q.kind === 'pilihan' || q.kind === 'konfirmasi') {
      rcRenderChips(q.options, (value, label) => {
        handleChipSelect(value, label, q);
      });
    }
  }

  function renderQuestionPrompt(prompt) {
    const context = [answerValue('mapel'), answerValue('nama_kelas'),
      `Fase ${answerValue('fase')}`, answerValue('program_keahlian')].filter(Boolean).join(' · ');
    const programKeahlian = answerValue('program_keahlian') || '(belum tercatat)';
    return prompt
      .replace('{{konteks_kelas}}', context)
      .replace(/\{\{program_keahlian\}\}/g, programKeahlian)
      .replace('{{nama_kelas}}', answerValue('nama_kelas') || '—')
      .replace('{{mapel}}', answerValue('mapel') || '—')
      .replace('{{fase}}', answerValue('fase') || '—')
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

  function resolveAnswerLabel(phase, questionId, rawValue) {
    const questions = RANCANG_FLOW[phase] || [];
    const q = questions.find(function (item) { return item.id === questionId; });
    if (!q || !q.options) return String(rawValue ?? '');
    if (Array.isArray(rawValue)) {
      return rawValue.map(function (v) {
        const opt = q.options.find(function (o) { return o.value === v; });
        return opt ? opt.label : v;
      }).join(', ');
    }
    const opt = q.options.find(function (o) { return o.value === rawValue; });
    return opt ? opt.label : String(rawValue ?? '');
  }

  const LABEL_PERTANYAAN = {
    target_akhir_mode:    'Target akhir fase',
    target_akhir_teks:    'Target (ditulis guru)',
    penguatan_elemen:     'Penguatan elemen',
    target_kemandirian:   'Tingkat kemandirian target',
    target_prioritas:     'Prioritas siswa',
    timeline_tka:         'Target waktu TKA',
    timeline_tka_lain:    'Target waktu TKA (kustom)',
    target_sekolah_detail:'Target khusus sekolah',
    jp_per_minggu:        'JP per minggu',
    durasi_jp:            'Durasi JP',
    tahun_pelajaran:      'Tahun pelajaran',
    tahun_pelajaran_lain: 'Tahun pelajaran (kustom)',
    minggu_efektif_mode:  'Penetapan minggu efektif',
    minggu_sem1:          'Minggu efektif semester 1',
    minggu_sem2:          'Minggu efektif semester 2',
    kegiatan_sudah_dikurangi: 'Kegiatan khusus',
    kegiatan_khusus:      'Jenis kegiatan pengurangan',
    jp_kegiatan_khusus:   'JP kegiatan khusus',
    cadangan_minggu:      'Cadangan gangguan',
    cadangan_minggu_lain: 'Cadangan (kustom, minggu)',
    pola_jadwal:          'Pola jadwal',
    jp_per_sesi:          'JP per pertemuan/sesi',
    status_data_awal:     'Data kemampuan awal',
    tindakan_tanpa_data:       'Cara menentukan titik awal',
    perkiraan_kemampuan_awal:  'Gambaran kemampuan awal siswa',
    cara_pemetaan:        'Cara pemetaan',
    jp_pemetaan:          'JP pemetaan',
    tindakan_instrumen:   'Instrumen pemetaan',
    kesulitan_mode:       'Antisipasi kesulitan',
    kesulitan_teks_guru:  'Kesulitan (perkiraan guru)',
    strategi_prasyarat:   'Pengulangan kemampuan dasar',
    jp_prasyarat:         'JP pengulangan awal',
    kekuatan_konteks:     'Kekuatan konteks kejuruan',
    ranah_dunia_kerja:    'Keterampilan dunia kerja',
    kebutuhan_bidang:     'Hal yang perlu masuk ke pelajaran',
    batas_konteks:        'Batas penggunaan konteks',
  };

  function formatPhaseAnswers(phase) {
    return Object.entries(phaseAnswerObject(phase))
      .filter(function (_ref) { return _ref[0] !== 'perhitungan'; })
      .map(function (_ref) {
        const key    = _ref[0];
        const stored = _ref[1];
        const raw    = unwrapStored(stored);
        const label  = LABEL_PERTANYAAN[key] || key;
        const value  = resolveAnswerLabel(phase, key, raw);
        return label + ': ' + value;
      }).join('\n') || 'Belum lengkap.';
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
    const cadanganVal = answerValue('cadangan_minggu');
    const cadanganMinggu = cadanganVal === 'lain'
      ? Number(answerValue('cadangan_minggu_lain') || 0)
      : Number(cadanganVal || 0);
    const cadangan = cadanganMinggu * jpPerMinggu;
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

  const PHASE_DISPLAY = {
    KONTEKS_CP:          'Konteks CP',
    PILIH_ATP:           'Pilih ATP',
    PRIORITAS:           'Prioritas',
    WAKTU:               'Waktu',
    PROFIL_SISWA:        'Profil Siswa',
    TARGET_FASE:         'Target Fase',
    KONTEKS_DUDI:        'Konteks Kejuruan',
    PENGUATAN_PRASYARAT: 'Penguatan Kemampuan Dasar',
  };

  function formatAtpSummary() {
    const skipPhases = new Set(['PILIH_ATP']);
    return FASE_URUTAN_V1.slice(0, FASE_URUTAN_V1.indexOf('ATP_SUMMARY'))
      .filter(phase => !skipPhases.has(phase))
      .map(phase => `${PHASE_DISPLAY[phase] || phase}\n${formatPhaseAnswers(phase)}`).join('\n\n');
  }

  function renderMultiSelect(q, isFirstRender) {
    const selected = _chat.pending_multi[q.id] || [];
    const max = q.constraints?.maxSelections || Infinity;
    if (isFirstRender) {
      const info = isFinite(max)
        ? `Boleh pilih lebih dari satu. Maksimal ${max} pilihan.`
        : 'Boleh pilih lebih dari satu pilihan.';
      rcAppendBubble('sistem', info);
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
    // Tidak ketemu — cek apakah phase ini memang tidak punya pertanyaan
    if (!questions.length) {
      // MODUL_GENERATE dan ATP_GENERATE adalah phase eksekusi tanpa pertanyaan.
      // Saat reload di phase ini, kembalikan ke summary supaya guru bisa retry.
      const fallback = phase === 'MODUL_GENERATE' ? 'MODUL_SUMMARY'
                     : phase === 'ATP_GENERATE'   ? 'ATP_REVIEW'
                     : null;
      if (fallback) {
        console.warn('[rancang-chat] phase', phase, 'tidak punya pertanyaan — resume ke', fallback);
        _chat.active_question_id = null;
        saveState();
        startPhase(fallback);
        return;
      }
    }
    // State tidak konsisten — mulai dari awal
    console.warn('[rancang-chat] active_question_id tidak ditemukan di phase', phase, '— reset ke KONTEKS_CP');
    _chat.session_phase = 'KONTEKS_CP';
    _chat.active_question_id = null;
    _chat.collected_answers = {};
    _chat.conversation_history = [];
    try { localStorage.removeItem(LS_KEY()); } catch (_) {}
    startPhase('KONTEKS_CP');
  }

  function lookupBidangFromProgram(programKeahlian) {
    try {
      const data = window._cpData;
      if (!data) return null;
      for (const entry of Object.values(data)) {
        if (entry.program_keahlian === programKeahlian && entry.bidang) return entry.bidang;
      }
    } catch (_) {}
    return null;
  }

  // Simpan program_keahlian baru ke state dan DB via SECURITY DEFINER RPC.
  // Lempar error jika RPC gagal — pemanggil harus handle (tidak advance funnel).
  async function updateProgramKeahlian(newValue) {
    const bidang = lookupBidangFromProgram(newValue);
    await updateProgramKeahlianRpc(_chat.classroom_id, newValue, bidang);
    _chat.collected_answers.program_keahlian = answer(newValue, 'guru', true);
    if (bidang) _chat.collected_answers.bidang_keahlian = answer(bidang, 'otomatis', true);
    window._classroomProgram = newValue;
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

      const PROGRAM_UPDATE_IDS = new Set([
        'program_keahlian_teks_bebas', 'program_keahlian_teks_bebas_modul',
      ]);
      if (evalResult.status === 'ACCEPT') {
        recordAnswer(qId, evalResult.normalizedAnswer, 'guru', true);
        if (PROGRAM_UPDATE_IDS.has(qId)) {
          try {
            await updateProgramKeahlian(evalResult.normalizedAnswer);
            rcAppendBubble('sistem', '✓ Program keahlian diperbarui: ' + evalResult.normalizedAnswer);
          } catch (saveErr) {
            console.error('[rancang-chat] updateProgramKeahlian gagal:', saveErr);
            rcAppendBubble('sistem', '⚠ Gagal menyimpan program keahlian. Coba lagi.');
            rcSetComposerDisabled(false);
            return;
          }
        }
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
    // CP tidak sesuai: beri penjelasan lalu kembali ke pertanyaan yang sama.
    // CP ditentukan otomatis dari mapel + fase; guru tidak bisa menggantinya
    // lewat funnel ini — solusinya adalah melanjutkan dan menyesuaikan TP/KKTP.
    if (q.id === 'konfirmasi_konteks' && value === 'cp_tidak_sesuai') {
      const program = answerValue('program_keahlian') || '';
      const pesanCp = 'Capaian Pembelajaran ditentukan oleh mata pelajaran dan fase yang tercatat di kelas ini'
        + (program ? ` (${program})` : '') + '.'
        + ' Isi CP tidak bisa diganti lewat Tab Rancang.'
        + '\n\nJika CP yang muncul terasa tidak relevan, Anda bisa tetap melanjutkan'
        + ' — TP dan KKTP yang dihasilkan akan disesuaikan dengan konteks program keahlian Anda.';
      rcAppendBubble('ai', pesanCp);
      addToHistory('ai', pesanCp);
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
    // Terima ATP: update status='aktif' sebelum advance
    if (q.id === 'tindakan_review_atp' && value === 'terima') {
      rcSetComposerDisabled(true);
      try {
        const saved = await acceptAtp(_chat.atp_induk_id, _chat.atp_updated_at);
        _chat.atp_updated_at = saved.updated_at;
        saveState();
        recordAnswer(q.id, value, 'guru', true);
        kembaliKeLayarUtama();
      } catch (err) {
        // T68: conflict = data stale (muat ulang), error lain = retryable
        if (err.code === 'ATP_WRITE_CONFLICT') {
          rcAppendBubble('sistem', err.message);
        } else {
          rcAppendBubble('sistem', '❌ Gagal menyimpan ATP. Coba lagi.');
          const retryBtn = document.createElement('button');
          retryBtn.className = 'rp-chip';
          retryBtn.textContent = '↺ Coba lagi';
          retryBtn.addEventListener('click', async () => {
            retryBtn.closest('.rc-bubble')?.remove();
            rcSetComposerDisabled(true);
            try {
              const saved2 = await acceptAtp(_chat.atp_induk_id, _chat.atp_updated_at);
              _chat.atp_updated_at = saved2.updated_at;
              saveState();
              const msg = 'ATP telah diterima. Anda dapat mulai merancang pembelajaran.';
              rcAppendBubble('ai', msg); addToHistory('ai', msg);
              recordAnswer(q.id, value, 'guru', true);
              rcMakeBubbleEditable(guruBubble, q.id, phaseAtAsk, handleEditAnswer);
              await startPhase('DONE');
            } catch (err2) {
              rcAppendBubble('sistem', err2.code === 'ATP_WRITE_CONFLICT'
                ? err2.message : '❌ Gagal menyimpan ATP. Muat ulang halaman lalu coba lagi.');
            } finally {
              rcSetComposerDisabled(false);
            }
          });
          rcAppendBubble('sistem', retryBtn);
        }
      } finally {
        rcSetComposerDisabled(false);
      }
      return;
    }
    // tindakan_instrumen 'ubah' → navigasi balik ke cara_pemetaan
    if (q.id === 'tindakan_instrumen' && value === 'ubah') {
      handleEditAnswer('cara_pemetaan', 'PROFIL_SISWA');
      return;
    }
    // target_akhir_mode 'rekomendasi' → generate teks target, bukan rekomendasikan mode
    if (q.id === 'target_akhir_mode' && value === 'rekomendasi') {
      if (_chat.in_flight) return;
      _chat.in_flight = true;
      rcSetComposerDisabled(true);
      rcShowTyping();
      recordAnswer(q.id, 'rekomendasi', 'guru', true);
      try {
        const { data: { session } } = await window.supabaseClient.auth.getSession();
        const token = session?.access_token ?? '';
        const res = await fetch(EVAL_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
          body: JSON.stringify({
            mode: 'recommendation',
            classroom_id: _chat.classroom_id,
            question_id: 'target_akhir_teks',
            question_spec: {
              kind: 'teks_bebas',
              prompt: 'Tuliskan target akhir fase yang ingin digunakan.',
              options: [{ value: '__teks__', label: 'Teks target' }],
            },
            context: {
              session_phase: _chat.session_phase,
              collected_answers: (typeof trimCollectedAnswers === 'function'
                ? trimCollectedAnswers(_chat.collected_answers)
                : _chat.collected_answers),
            },
          }),
        });
        const json = await res.json();
        rcHideTyping();
        if (!res.ok) throw new Error(json.error || 'EF error');
        const teks = json?.recommendation?.label || json?.recommendation?.value || '';
        if (!teks) throw new Error('Teks rekomendasi kosong.');
        const rekMsg = 'Rekomendasi target akhir fase:\n\n' + teks + '\n\n' + (json.recommendation.reason || '');
        rcAppendBubble('ai', rekMsg);
        addToHistory('ai', rekMsg);
        rcRenderChips([
          { value: '__pakai__', label: 'Gunakan rekomendasi ini' },
          { value: '__tulis__', label: 'Tulis sendiri' },
        ], async function (v, chipLabel) {
          rcClearChips();
          rcAppendBubble('guru', chipLabel);
          addToHistory('guru', chipLabel);
          if (v === '__pakai__') {
            recordAnswer('target_akhir_teks', teks, 'ai_recommendation', true);
            await advanceToNext(q);
          } else {
            // Tampilkan input teks untuk guru isi sendiri
            const teksQ = (RANCANG_FLOW['TARGET_FASE'] || []).find(x => x.id === 'target_akhir_teks');
            if (teksQ) askQuestion(teksQ); else await advanceToNext(q);
          }
        });
      } catch (err) {
        rcHideTyping();
        rcAppendBubble('sistem', 'Rekomendasi target belum dapat dimuat. Silakan tulis sendiri.');
        addToHistory('sistem', 'Gagal ambil rekomendasi target.');
        const teksQ = (RANCANG_FLOW['TARGET_FASE'] || []).find(x => x.id === 'target_akhir_teks');
        if (teksQ) askQuestion(teksQ); else await advanceToNext(q);
      } finally {
        _chat.in_flight = false;
        rcSetComposerDisabled(false);
      }
      return;
    }
    recordAnswer(q.id, value, 'guru', true);
    rcMakeBubbleEditable(guruBubble, q.id, phaseAtAsk, handleEditAnswer);
    // konfirmasi_program_keahlian 'ya' → tandai program_keahlian sebagai confirmed
    if ((q.id === 'konfirmasi_program_keahlian' || q.id === 'konfirmasi_program_keahlian_modul') && value === 'ya') {
      if (_chat.collected_answers.program_keahlian) {
        _chat.collected_answers.program_keahlian.confirmed_by_teacher = true;
      }
    }
    if (q.id === 'konfirmasi_konteks' && value === 'sesuai') {
      ['mapel', 'nama_kelas', 'fase', 'jenjang', 'program_keahlian'].forEach(id => {
        if (_chat.collected_answers[id]) _chat.collected_answers[id].confirmed_by_teacher = true;
      });
    }
    // Pilih program dari dropdown (bukan __lainnya__) → simpan ke DB langsung
    const PILIH_PROGRAM_IDS = new Set(['pilih_program_keahlian', 'pilih_program_keahlian_modul']);
    if (PILIH_PROGRAM_IDS.has(q.id) && value !== '__lainnya__') {
      try {
        await updateProgramKeahlian(value);
        rcAppendBubble('sistem', '✓ Program keahlian diperbarui: ' + value);
      } catch (saveErr) {
        console.error('[rancang-chat] updateProgramKeahlian gagal:', saveErr);
        rcAppendBubble('sistem', '⚠ Gagal menyimpan program keahlian. Coba lagi.');
        return;
      }
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
      // Buang jawaban pertanyaan ini sendiri agar AI tidak meng-echo jawaban lama
      const answersForRec = Object.fromEntries(
        Object.entries(_chat.collected_answers).filter(([k]) => k !== q.id)
      );
      const recommendation = await callRecommendation(q.id, q, {
        classroom_id: _chat.classroom_id,
        session_phase: _chat.session_phase,
        collected_answers: answersForRec,
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
          // T14/T51: validasi nilai AI terhadap opsi yang tersedia sebelum direkam
          const validOptions = Array.isArray(q.options) ? q.options.map(o => o.value) : [];
          if (validOptions.length > 0) {
            const recValues = Array.isArray(recommendation.value)
              ? recommendation.value : [recommendation.value];
            const allValid = recValues.every(v => validOptions.includes(v));
            if (!allValid) {
              rcAppendBubble('sistem', 'Rekomendasi tidak sesuai pilihan yang tersedia. Silakan pilih sendiri.');
              askQuestion(q);
              return;
            }
          }
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
          'JP yang tersisa untuk mengajar menjadi 0 — biasanya karena jumlah minggu efektif belum diisi atau terlalu banyak dikurangi kegiatan. Silakan isi ulang minggu efektif.');
        const modeQ = (RANCANG_FLOW['WAKTU'] || []).find(q => q.id === 'minggu_efektif_mode');
        if (modeQ) askQuestion(modeQ);
        return;
      }
      // T50: jp_prasyarat bisa over-allocate — cek setelah PENGUATAN_PRASYARAT selesai
      if (_chat.session_phase === 'PENGUATAN_PRASYARAT' && currentQ.id === 'jp_prasyarat'
          && calculateAllocation().jp_operasional <= 0) {
        const jp = answerValue('jp_prasyarat') || 0;
        rcAppendBubble('sistem',
          `JP pengulangan awal (${jp} JP) melebihi sisa JP yang tersedia. Kurangi jumlahnya.`);
        const prasyaratQ = (RANCANG_FLOW['PENGUATAN_PRASYARAT'] || []).find(q => q.id === 'jp_prasyarat');
        if (prasyaratQ) askQuestion(prasyaratQ);
        return;
      }
      const revisionPhase = revisionDestination(currentQ.id, answerValue(currentQ.id));
      if (revisionPhase) {
        await startPhase(revisionPhase);
        return;
      }
      const nextPhase = getNextPhase(_chat.session_phase);
      // T55: blokir generate jika jp_operasional = 0 (bisa terjadi setelah ubah prasyarat)
      if (nextPhase === 'ATP_GENERATE' && calculateAllocation().jp_operasional <= 0) {
        rcAppendBubble('sistem',
          '❌ JP untuk mengajar tersisa 0. Perbaiki alokasi waktu atau kurangi JP pengulangan awal sebelum generate.');
        rcRenderChips([
          { value: '__ubah_waktu__',     label: 'Ubah alokasi waktu' },
          { value: '__ubah_prasyarat__', label: 'Ubah pengulangan kemampuan dasar' },
        ], function (v) {
          rcClearChips();
          startPhase(v === '__ubah_waktu__' ? 'WAKTU' : 'PENGUATAN_PRASYARAT');
        });
        return;
      }
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

  function renderAtpDonePreview() {
    if (!_chat.atp_draft?.length) return '';
    const mapel  = answerValue('mapel') || '';
    const fase   = answerValue('fase')  || 'E';
    const total  = _chat.atp_draft.reduce(
      function (s, tp) { return s + (tp.jp_alokasi || 0); }, 0);

    let text = mapel && fase
      ? `${mapel} · Fase ${fase} · ${_chat.atp_draft.length} TP · ${total} JP`
      : `${_chat.atp_draft.length} TP · ${total} JP`;
    text += '\n';

    for (const tp of _chat.atp_draft) {
      const jp         = tp.jp_alokasi || 0;
      const pertemuan  = Array.isArray(tp.jp_pertemuan) ? tp.jp_pertemuan : [];
      const nPertemuan = pertemuan.length || 1;
      const distribusi = pertemuan.length > 1
        ? ` (${pertemuan.join('+')} JP)`
        : '';
      text += `\nTP ${tp.nomor}. ${tp.judul}`;
      text += `\n      ${jp} JP · ${nPertemuan} pertemuan${distribusi}`;
    }
    return text.trim();
  }

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
      rcAppendBubble('sistem', '⚠ Konten modul tidak ditemukan. Coba generate ulang.');
      return;
    }
    try {
      if (konten.schema_version === '4.0.0') {
        _renderModulPreviewV400(konten);
      } else if (konten.schema_version === '3.2.0') {
        _renderModulPreviewV320(konten);
      } else {
        _renderModulPreviewLama(konten);
      }
    } catch (err) {
      console.error('[renderModulPreview] error saat render:', err);
      rcAppendBubble('sistem',
        '⚠ Modul berhasil dibuat tapi terjadi error saat menampilkannya. ' +
        'Data sudah tersimpan — klik "Lihat Modul" untuk mengecek konten.');
    }
  }

  // ── Render schema V4.0.0 — dua tab: Modul Resmi + Naskah Fasilitasi ─────
  function _renderModulPreviewV400(konten) {
    const id   = konten.identitas           ?? {};
    const kktp = Array.isArray(konten.kktp) ? konten.kktp : [];
    const km   = konten.konteks_murid       ?? {};
    const ra   = konten.rencana_asesmen     ?? {};
    const pt   = Array.isArray(konten.pertemuan) ? konten.pertemuan : [];
    const nf   = Array.isArray(konten.naskah_fasilitasi) ? konten.naskah_fasilitasi : [];
    const ipArr = Array.isArray(konten.instrumen_pembelajaran) ? konten.instrumen_pembelajaran : [];
    const iaArr = Array.isArray(konten.instrumen_asesmen) ? konten.instrumen_asesmen : [];
    const tl    = konten.tindak_lanjut ?? {};
    const cg    = Array.isArray(konten.catatan_guru) ? konten.catatan_guru : [];
    const rc    = konten.rancangan          ?? {};
    const mp    = konten.metadata_pedagogis ?? {};

    // ── helper ──────────────────────────────────────────────────────────────
    const esc = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    const h   = (tag, cls, html) => `<${tag} class="${cls}">${html}</${tag}>`;
    const sec = (judul, html) => html
      ? `<div class="mv4-section"><div class="mv4-section-title">${esc(judul)}</div>${html}</div>` : '';

    const me = konten.materi_esensial ?? {};

    // ── helper instrumen ────────────────────────────────────────────────────
    const list = (arr) => Array.isArray(arr) && arr.length
      ? `<ul class="mv4-list">${arr.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : '';

    // Nama field JSON menjadi judul yang enak dibaca:
    // daftar_pertanyaan_lisan -> "Daftar Pertanyaan Lisan"
    const SINGKATAN = { kktp: 'KKTP', cp: 'CP', tp: 'TP', jp: 'JP', k3: 'K3',
                        atp: 'ATP', pbl: 'PBL', asm: 'ASM' };
    const humanKey = (k) => String(k).split('_')
      .map(w => SINGKATAN[w] || (w ? w[0].toUpperCase() + w.slice(1) : w)).join(' ');

    // Batas antara nilai yang berperilaku seperti penanda (kode, nama, istilah)
    // dan yang berperilaku seperti prosa. Dipakai untuk DUA hal sekaligus —
    // urutan tampil dan bentuk tata letaknya — supaya penanda selalu tampil
    // lebih dulu sebaris dengan labelnya, dan prosa selalu mendapat barisnya
    // sendiri. Dua ambang berbeda untuk pemisahan yang sama menghasilkan butir
    // sejenis yang tampil tidak seragam.
    const PENDEK = 25;

    // Penampil umum untuk bentuk yang tidak dikenali cabang khusus per jenis
    // instrumen. AI kerap mengarang nama field sendiri dan berbeda tiap kali —
    // tanpa ini kotaknya tampil berlabel tapi kosong, dan isi yang sudah dibuat
    // tidak pernah sampai ke guru.
    function renderGenerik(val, depth = 0) {
      if (val === null || val === undefined || val === '' || depth > 4) return '';
      if (typeof val !== 'object') return `<div class="mv4-sub">${esc(val)}</div>`;
      if (Array.isArray(val)) {
        if (!val.length) return '';
        if (val.every(x => x === null || typeof x !== 'object'))
          return `<ul class="mv4-list">${val.map(x => `<li>${esc(x)}</li>`).join('')}</ul>`;
        // Tiap butir diberi blok sendiri. Tanpa ini giliran dialog dan daftar
        // kategori menyatu jadi satu gumpalan yang batasnya harus ditebak.
        return val.map(x => {
          const isiButir = renderGenerik(x, depth + 1);
          return isiButir ? `<div class="mv4-asesmen-blok">${isiButir}</div>` : '';
        }).join('');
      }
      // Field pendek (atribut, misalnya "pembicara") ditampilkan sebelum yang
      // panjang (prosa, misalnya "ucapan"), supaya pembaca tahu konteksnya dulu.
      // Urutan asli JSON kerap menaruh prosanya lebih dahulu, dan dialog jadi
      // terbaca sebagai kalimat-dulu-baru-siapa-yang-mengucapkan.
      // Hanya nilai yang JELAS pendek (kode, nama, istilah — di bawah 25
      // karakter) yang dinaikkan ke atas sebagai penanda. Sisanya tetap pada
      // urutan aslinya, karena membandingkan panjang antar-prosa membuat dua
      // butir sejenis tampil dengan urutan berbeda hanya karena selisih
      // beberapa karakter. Objek dan array selalu paling bawah.
      const bobot = (v) => (v !== null && typeof v === 'object') ? 2
                         : (String(v).length <= PENDEK ? 0 : 1);
      return Object.keys(val).sort((a, b) => bobot(val[a]) - bobot(val[b])).map(k => {
        const isi = val[k];
        if (isi === null || isi === undefined || isi === '') return '';
        const judul = esc(humanKey(k));
        if (typeof isi !== 'object') {
          // Prosa diberi baris sendiri; penanda cukup sebaris label-nilai.
          return String(isi).length > PENDEK
            ? `<div class="mv4-sub"><strong>${judul}</strong></div><div class="mv4-sub">${esc(isi)}</div>`
            : `<div class="mv4-row"><span class="mv4-label">${judul}</span><span>${esc(isi)}</span></div>`;
        }
        const dalam = renderGenerik(isi, depth + 1);
        return dalam ? `<div class="mv4-sub"><strong>${judul}</strong></div>${dalam}` : '';
      }).join('');
    }

    // Field yang sudah dibaca cabang khusus di bawah, per jenis instrumen.
    // Apa pun di luar daftar ini ditampilkan penampil umum — AI kerap mengarang
    // nama field sendiri dan berbeda tiap generate, dan tanpa jaring ini isinya
    // hilang diam-diam tanpa ada yang mengeluh.
    const KUNCI_MURID = {
      dialog_baseline:   ['petunjuk', 'giliran'],
      dialog_model:      ['petunjuk', 'giliran'],
      teks_autentik:     ['isi_teks', 'pertanyaan_panduan'],
      kartu_peran:       ['set'],
      pemetaan_awal:     ['petunjuk', 'item_soal', 'pertanyaan_menyimak', 'situasi_respons'],
      matriks_observasi: ['petunjuk', 'kolom_indikator'],
      lembar_refleksi:   ['pertanyaan'],
      soal_latihan:      ['petunjuk', 'soal'],
      lembar_praktikum:  ['tujuan', 'alat_bahan', 'langkah_kerja', 'pertanyaan_analisis'],
      panduan_proyek:    ['deskripsi_proyek', 'tahapan', 'kriteria_produk', 'pertanyaan_refleksi'],
    };
    const KUNCI_GURU = {
      dialog_baseline:   ['catatan_fasilitasi'],
      dialog_model:      ['catatan_fasilitasi'],
      teks_autentik:     ['nama_entitas', 'catatan_konteks'],
      kartu_peran:       ['fokus_pengamatan', 'catatan_fasilitasi'],
      pemetaan_awal:     ['tujuan_diagnostik', 'panduan_interpretasi'],
      matriks_observasi: ['kode_legend', 'kolom_indikator', 'catatan_kritis'],
      lembar_refleksi:   ['panduan_interpretasi'],
      soal_latihan:      ['kunci_jawaban', 'panduan_penskoran'],
      lembar_praktikum:  ['rubrik_penilaian', 'catatan_k3'],
      panduan_proyek:    ['rubrik_penilaian', 'contoh_produk'],
    };

    // Tampilkan field yang tidak dibaca cabang khusus. Menangkap dua kasus
    // sekaligus: bentuk yang sama sekali asing (semua field tersisa) dan bentuk
    // yang hanya sebagian dikenali (sisanya saja).
    function renderSisa(obj, dikenal) {
      if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) return '';
      const tahu  = dikenal || [];
      const sisa  = {};
      Object.keys(obj).forEach(k => { if (!tahu.includes(k)) sisa[k] = obj[k]; });
      return Object.keys(sisa).length ? renderGenerik(sisa) : '';
    }

    function renderKontenInstrumen(ins) {
      const km2  = ins.konten_murid  ?? null;
      const pg   = ins.panduan_guru  ?? null;
      const star = ins.untuk_murid ? `<span class="mv4-ins-star">★ Untuk Murid</span>` : '';
      let out = `<div class="mv4-ins-block">`+
        `<div class="mv4-ins-header">`+
        `<span class="mv4-ins-id">${esc(ins.id ?? '?')}</span> `+
        `<span class="mv4-ins-jenis">[${esc(ins.jenis ?? '-')}]</span> `+
        `<strong>${esc(ins.judul ?? '')}</strong> ${star}</div>`;

      if (km2 !== null) {
        out += `<div class="mv4-ins-murid"><div class="mv4-ins-zone-label">★ Bagian Murid</div>`;
        const j = ins.jenis ?? '';
        if (j === 'dialog_baseline' || j === 'dialog_model') {
          if (km2.petunjuk) out += `<div class="mv4-sub">${esc(km2.petunjuk)}</div>`;
          if (Array.isArray(km2.giliran)) km2.giliran.forEach(g =>
            out += `<div class="mv4-dialog-turn"><span class="mv4-dialog-speaker">${esc(g.pembicara ?? '?')}:</span> ${esc(g.ucapan ?? '')}</div>`);
        } else if (j === 'teks_autentik') {
          if (km2.isi_teks) out += `<div class="mv4-teks">${esc(km2.isi_teks)}</div>`;
          if (Array.isArray(km2.pertanyaan_panduan) && km2.pertanyaan_panduan.length)
            out += `<div class="mv4-sub"><strong>Pertanyaan Panduan:</strong></div>${list(km2.pertanyaan_panduan)}`;
        } else if (j === 'kartu_peran') {
          if (Array.isArray(km2.set)) km2.set.forEach(s => {
            out += `<div class="mv4-asesmen-blok"><div class="mv4-asesmen-label">${esc(s.nama_set ?? s.nama_entitas ?? '?')}</div>`;
            if (s.peran_a) out += `<div class="mv4-sub"><strong>Peran A${s.peran_a.jabatan ? ' — '+s.peran_a.jabatan : ''}:</strong> ${esc(s.peran_a.instruksi_peran ?? '')}</div>`;
            if (s.peran_b) out += `<div class="mv4-sub"><strong>Peran B${s.peran_b.jabatan ? ' — '+s.peran_b.jabatan : ''}:</strong> ${esc(s.peran_b.instruksi_peran ?? '')}</div>`;
            out += `</div>`;
          });
        } else if (j === 'pemetaan_awal') {
          if (km2.petunjuk) out += `<div class="mv4-sub">${esc(km2.petunjuk)}</div>`;
          if (Array.isArray(km2.item_soal) && km2.item_soal.length)
            out += `<div class="mv4-sub"><strong>Item Soal:</strong></div>`+
              `<ul class="mv4-list">${km2.item_soal.map(s => `<li>${esc(s.kalimat_konteks ?? '')} <em>[${esc(s.kata_target ?? '')}]</em></li>`).join('')}</ul>`;
          if (Array.isArray(km2.pertanyaan_menyimak) && km2.pertanyaan_menyimak.length)
            out += `<div class="mv4-sub"><strong>Pertanyaan Menyimak:</strong></div>${list(km2.pertanyaan_menyimak)}`;
          if (Array.isArray(km2.situasi_respons) && km2.situasi_respons.length)
            out += `<div class="mv4-sub"><strong>Situasi Respons:</strong></div>${list(km2.situasi_respons)}`;
        } else if (j === 'matriks_observasi') {
          if (km2.petunjuk) out += `<div class="mv4-sub">${esc(km2.petunjuk)}</div>`;
          if (Array.isArray(km2.kolom_indikator) && km2.kolom_indikator.length)
            out += `<div class="mv4-sub"><strong>Indikator:</strong></div>`+
              `<ul class="mv4-list">${km2.kolom_indikator.map(k => `<li><strong>${esc(k.id ?? '')}</strong> — ${esc(k.label ?? '')}</li>`).join('')}</ul>`;
        } else if (j === 'lembar_refleksi') {
          if (Array.isArray(km2.pertanyaan) && km2.pertanyaan.length)
            out += `<ol class="mv4-list">${km2.pertanyaan.map(p2 => `<li>${esc(p2.prompt ?? '')}</li>`).join('')}</ol>`;
        } else if (j === 'soal_latihan') {
          if (km2.petunjuk) out += `<div class="mv4-sub">${esc(km2.petunjuk)}</div>`;
          if (Array.isArray(km2.soal) && km2.soal.length)
            out += `<ol class="mv4-list">${km2.soal.map(s => `<li>${esc(s.pertanyaan ?? '')} <em>[${esc(s.tipe ?? '')}]</em></li>`).join('')}</ol>`;
        } else if (j === 'lembar_praktikum') {
          if (km2.tujuan) out += `<div class="mv4-sub"><strong>Tujuan:</strong> ${esc(km2.tujuan)}</div>`;
          if (Array.isArray(km2.alat_bahan) && km2.alat_bahan.length)
            out += `<div class="mv4-sub"><strong>Alat & Bahan:</strong></div>${list(km2.alat_bahan)}`;
          if (Array.isArray(km2.langkah_kerja) && km2.langkah_kerja.length)
            out += `<div class="mv4-sub"><strong>Langkah Kerja:</strong></div><ol class="mv4-list">${km2.langkah_kerja.map(x => `<li>${esc(x)}</li>`).join('')}</ol>`;
          if (Array.isArray(km2.pertanyaan_analisis) && km2.pertanyaan_analisis.length)
            out += `<div class="mv4-sub"><strong>Pertanyaan Analisis:</strong></div>${list(km2.pertanyaan_analisis)}`;
        } else if (j === 'panduan_proyek') {
          if (km2.deskripsi_proyek) out += `<div class="mv4-sub">${esc(km2.deskripsi_proyek)}</div>`;
          if (Array.isArray(km2.tahapan) && km2.tahapan.length)
            out += `<div class="mv4-sub"><strong>Tahapan:</strong></div><ol class="mv4-list">${km2.tahapan.map(t => `<li><strong>${esc(t.judul ?? '')}</strong> — ${esc(t.instruksi ?? '')}</li>`).join('')}</ol>`;
          if (Array.isArray(km2.kriteria_produk) && km2.kriteria_produk.length)
            out += `<div class="mv4-sub"><strong>Kriteria Produk:</strong></div>${list(km2.kriteria_produk)}`;
          if (Array.isArray(km2.pertanyaan_refleksi) && km2.pertanyaan_refleksi.length)
            out += `<div class="mv4-sub"><strong>Refleksi:</strong></div>${list(km2.pertanyaan_refleksi)}`;
        }
        out += renderSisa(km2, KUNCI_MURID[j]);
        out += `</div>`;
      }

      if (pg !== null) {
        out += `<div class="mv4-ins-guru"><div class="mv4-ins-zone-label">Panduan Guru</div>`;
        const j = ins.jenis ?? '';
        if (j === 'dialog_baseline' || j === 'dialog_model') {
          if (pg.catatan_fasilitasi) out += `<div class="mv4-sub">${esc(pg.catatan_fasilitasi)}</div>`;
        } else if (j === 'teks_autentik') {
          if (pg.nama_entitas) out += `<div class="mv4-row"><span class="mv4-label">Entitas</span><span>${esc(pg.nama_entitas)}</span></div>`;
          if (pg.catatan_konteks) out += `<div class="mv4-sub">${esc(pg.catatan_konteks)}</div>`;
        } else if (j === 'kartu_peran') {
          if (pg.fokus_pengamatan) out += `<div class="mv4-row"><span class="mv4-label">Fokus Amati</span><span>${esc(pg.fokus_pengamatan)}</span></div>`;
          if (pg.catatan_fasilitasi) out += `<div class="mv4-sub">${esc(pg.catatan_fasilitasi)}</div>`;
        } else if (j === 'pemetaan_awal') {
          if (pg.tujuan_diagnostik) out += `<div class="mv4-sub"><strong>Tujuan:</strong> ${esc(pg.tujuan_diagnostik)}</div>`;
          if (pg.panduan_interpretasi) out += `<div class="mv4-sub">${esc(pg.panduan_interpretasi)}</div>`;
        } else if (j === 'matriks_observasi') {
          if (pg.kode_legend) out += `<div class="mv4-sub"><strong>Kode:</strong> ${esc(pg.kode_legend)}</div>`;
          if (Array.isArray(pg.kolom_indikator) && pg.kolom_indikator.length)
            out += `<ul class="mv4-list">${pg.kolom_indikator.map(k => `<li><strong>${esc(k.id ?? '')}</strong> — ${esc(k.label ?? '')}</li>`).join('')}</ul>`;
          if (pg.catatan_kritis) out += `<div class="mv4-sub"><em>${esc(pg.catatan_kritis)}</em></div>`;
        } else if (j === 'lembar_refleksi') {
          if (pg.panduan_interpretasi) out += `<div class="mv4-sub">${esc(pg.panduan_interpretasi)}</div>`;
        } else if (j === 'soal_latihan') {
          if (Array.isArray(pg.kunci_jawaban) && pg.kunci_jawaban.length)
            out += `<div class="mv4-sub"><strong>Kunci Jawaban:</strong></div>${list(pg.kunci_jawaban)}`;
          if (pg.panduan_penskoran) out += `<div class="mv4-sub">${esc(pg.panduan_penskoran)}</div>`;
        } else if (j === 'lembar_praktikum') {
          if (pg.rubrik_penilaian) out += `<div class="mv4-sub"><strong>Rubrik:</strong> ${esc(pg.rubrik_penilaian)}</div>`;
          if (pg.catatan_k3) out += `<div class="mv4-sub"><em>K3: ${esc(pg.catatan_k3)}</em></div>`;
        } else if (j === 'panduan_proyek') {
          if (pg.rubrik_penilaian) out += `<div class="mv4-sub"><strong>Rubrik:</strong> ${esc(pg.rubrik_penilaian)}</div>`;
          if (pg.contoh_produk) out += `<div class="mv4-sub">${esc(pg.contoh_produk)}</div>`;
        }
        out += renderSisa(pg, KUNCI_GURU[j]);
        out += `</div>`;
      }

      out += `</div>`;
      return out;
    }

    // ── bangun HTML tab Modul Resmi ─────────────────────────────────────────
    let resmi = '';

    // [A] Identitas
    const idLines = [
      ['Mata Pelajaran', id.mata_pelajaran],
      ['Jenjang / Fase', `${id.jenjang ?? '-'} / Fase ${id.fase ?? '-'}`],
      ['Nomor TP',       id.nomor_tp],
      ['Pertemuan',      id.jumlah_pertemuan ? `${id.jumlah_pertemuan} × ${id.jp_per_pertemuan ?? '?'} JP` : null],
      ['Total Alokasi',  id.alokasi_waktu_total_menit ? `${id.alokasi_waktu_total_menit} menit` : null],
      ['Elemen CP',      Array.isArray(id.elemen_cp) ? id.elemen_cp.join(', ') : id.elemen_cp],
    ].filter(([,v]) => v != null)
     .map(([k,v]) => `<div class="mv4-row"><span class="mv4-label">${esc(k)}</span><span>${esc(v)}</span></div>`)
     .join('');
    resmi += sec('A. Identitas Modul', idLines);

    // [B] Capaian & Tujuan Pembelajaran
    const capTujHtml = [
      id.dasar_cp          ? `<div class="mv4-row"><span class="mv4-label">Dasar CP</span><span>${esc(id.dasar_cp)}</span></div>` : '',
      id.tujuan_pembelajaran ? `<div class="mv4-row"><span class="mv4-label">Tujuan Pembelajaran</span><span>${esc(id.tujuan_pembelajaran)}</span></div>` : '',
    ].join('');
    if (capTujHtml) resmi += sec('B. Capaian & Tujuan Pembelajaran', capTujHtml);

    // [C] KKTP
    if (kktp.length) {
      const kktpHtml = kktp.map(k =>
        `<div class="mv4-kktp-item"><strong>${esc(k.id_kktp ?? '?')}</strong> — ${esc(k.kriteria ?? '-')}`+
        (k.ambang_batas != null ? ` <em>(${esc(String(k.ambang_batas))})</em>` : '') +
        (Array.isArray(k.instrumen_bukti) && k.instrumen_bukti.length ? `<div class="mv4-sub">Instrumen Bukti: ${k.instrumen_bukti.map(esc).join(', ')}</div>` : '') +
        `</div>`
      ).join('');
      resmi += sec('C. Kriteria Ketercapaian Tujuan Pembelajaran (KKTP)', kktpHtml);
    }

    // [D] Konteks Murid
    const ig = km.input_guru ?? {};
    const kmHtml = [
      // Fakta dari guru
      (ig.kondisi_kelas || ig.jumlah_murid != null)
        ? `<div class="mv4-ins-zone-label" style="margin-bottom:4px">Yang Guru Sampaikan</div>`+
          (ig.kondisi_kelas ? `<div class="mv4-row"><span class="mv4-label">Kondisi Kelas</span><span>${esc(ig.kondisi_kelas)}</span></div>` : '')+
          (ig.jumlah_murid != null ? `<div class="mv4-row"><span class="mv4-label">Jumlah Murid</span><span>${esc(String(ig.jumlah_murid))} orang</span></div>` : '')
        : '',
      // Inferensi AI
      (km.kesiapan_awal?.length || km.variasi_kemampuan || km.kebutuhan_dukungan?.length)
        ? `<div class="mv4-ins-zone-label" style="margin:6px 0 4px">Analisis MiClass</div>`+
          (km.variasi_kemampuan ? `<div class="mv4-row"><span class="mv4-label">Variasi Kemampuan</span><span>${esc(km.variasi_kemampuan)}</span></div>` : '')+
          (km.kesiapan_awal?.length ? `<div class="mv4-sub"><strong>Kesiapan Awal:</strong></div>${list(km.kesiapan_awal)}` : '')+
          (km.kebutuhan_dukungan?.length ? `<div class="mv4-sub"><strong>Kebutuhan Dukungan:</strong></div>${list(km.kebutuhan_dukungan)}` : '')
        : '',
    ].join('');
    if (kmHtml) resmi += sec('D. Konteks Murid', kmHtml);

    // [E] Materi Esensial
    const meHtml = [
      Array.isArray(me.lingkup_materi)  && me.lingkup_materi.length  ? `<div class="mv4-sub"><strong>Lingkup Materi:</strong></div>${list(me.lingkup_materi)}`  : '',
      Array.isArray(me.kosakata_kunci)  && me.kosakata_kunci.length  ? `<div class="mv4-sub"><strong>Kosakata Kunci:</strong></div>${list(me.kosakata_kunci)}`  : '',
      Array.isArray(me.konsep_utama)    && me.konsep_utama.length    ? `<div class="mv4-sub"><strong>Konsep Utama:</strong></div>${list(me.konsep_utama)}`    : '',
    ].join('');
    if (meHtml) resmi += sec('E. Materi Esensial', meHtml);

    // [F] Rencana Asesmen
    const raHtml = (() => {
      let out = '';
      if (ra.asesmen_diagnostik) {
        const d = ra.asesmen_diagnostik;
        out += `<div class="mv4-asesmen-blok"><div class="mv4-asesmen-label">F1 — Diagnostik</div>`+
          (d.tujuan ? `<div class="mv4-row"><span class="mv4-label">Tujuan</span><span>${esc(d.tujuan)}</span></div>` : '')+
          `<div class="mv4-row"><span class="mv4-label">Teknik</span><span>${esc(d.teknik ?? '-')}</span></div>`+
          (d.waktu ? `<div class="mv4-row"><span class="mv4-label">Waktu</span><span>${esc(d.waktu)}</span></div>` : '')+
          (d.penggunaan_hasil ? `<div class="mv4-row"><span class="mv4-label">Penggunaan</span><span>${esc(d.penggunaan_hasil)}</span></div>` : '')+
          (Array.isArray(d.instrumen_ref) && d.instrumen_ref.length ? `<div class="mv4-sub">Instrumen: ${d.instrumen_ref.map(esc).join(', ')}</div>` : '')+
          `</div>`;
      }
      if (Array.isArray(ra.asesmen_formatif) && ra.asesmen_formatif.length) {
        ra.asesmen_formatif.forEach(f => {
          out += `<div class="mv4-asesmen-blok"><div class="mv4-asesmen-label">${esc(f.id ?? 'Formatif')} — Formatif (P${f.waktu_pertemuan ?? '?'} · ${esc(f.fase_langkah ?? '-')})</div>`+
            `<div class="mv4-row"><span class="mv4-label">Teknik</span><span>${esc(f.teknik ?? '-')}</span></div>`+
            (f.fungsi ? `<div class="mv4-row"><span class="mv4-label">Fungsi</span><span>${esc(f.fungsi)}</span></div>` : '')+
            (f.umpan_balik ? `<div class="mv4-row"><span class="mv4-label">Umpan Balik</span><span>${esc(f.umpan_balik)}</span></div>` : '')+
            (Array.isArray(f.referensi_kktp) && f.referensi_kktp.length ? `<div class="mv4-sub">KKTP: ${f.referensi_kktp.map(esc).join(', ')}</div>` : '')+
            (Array.isArray(f.instrumen_ref) && f.instrumen_ref.length ? `<div class="mv4-sub">Instrumen: ${f.instrumen_ref.map(esc).join(', ')}</div>` : '')+
            `</div>`;
        });
      }
      if (ra.asesmen_sumatif) {
        const s = ra.asesmen_sumatif;
        const plc = s.placement ? `P${s.placement.pertemuan} · ${esc(s.placement.fase ?? '-')}` : '-';
        out += `<div class="mv4-asesmen-blok"><div class="mv4-asesmen-label">Sumatif</div>`+
          (s.deskripsi ? `<div class="mv4-row"><span class="mv4-label">Deskripsi</span><span>${esc(s.deskripsi)}</span></div>` : '')+
          `<div class="mv4-row"><span class="mv4-label">Teknik</span><span>${esc(s.teknik ?? '-')}</span></div>`+
          `<div class="mv4-row"><span class="mv4-label">Durasi</span><span>${s.durasi_menit != null ? s.durasi_menit+' menit' : '-'}</span></div>`+
          `<div class="mv4-row"><span class="mv4-label">Placement</span><span>${plc}</span></div>`+
          (Array.isArray(s.instrumen_ref) && s.instrumen_ref.length ? `<div class="mv4-sub">Instrumen: ${s.instrumen_ref.map(esc).join(', ')}</div>` : '')+
          `</div>`;
      }
      return out;
    })();
    if (raHtml) resmi += sec('F. Rencana Asesmen', raHtml);

    // [G] Rancangan Pembelajaran
    const rcHtml = (() => {
      let out = '';
      if (rc.strategi_pedagogis) out += `<div class="mv4-row"><span class="mv4-label">Strategi</span><span>${esc(rc.strategi_pedagogis)}</span></div>`;
      if (rc.lingkungan_pembelajaran) out += `<div class="mv4-row"><span class="mv4-label">Lingkungan</span><span>${esc(rc.lingkungan_pembelajaran)}</span></div>`;
      if (rc.pemanfaatan_digital) out += `<div class="mv4-row"><span class="mv4-label">Digital</span><span>${esc(rc.pemanfaatan_digital)}</span></div>`;
      if (Array.isArray(rc.sumber_belajar) && rc.sumber_belajar.length)
        out += `<div class="mv4-sub"><strong>Sumber Belajar:</strong></div>`+
          `<ul class="mv4-list">${rc.sumber_belajar.map(s => `<li>${esc(s.sumber ?? s)}${s.fungsi ? ` — ${esc(s.fungsi)}` : ''}</li>`).join('')}</ul>`;
      if (rc.kemitraan_pembelajaran) out += `<div class="mv4-row"><span class="mv4-label">Kemitraan</span><span>${esc(rc.kemitraan_pembelajaran)}</span></div>`;
      if (rc.keselamatan_k3) out += `<div class="mv4-row"><span class="mv4-label">K3</span><span>${esc(rc.keselamatan_k3)}</span></div>`;
      return out;
    })();
    if (rcHtml) resmi += sec('G. Rancangan Pembelajaran', rcHtml);

    // [H] Pertemuan
    pt.forEach(p => {
      const lkHtml = (Array.isArray(p.langkah) ? p.langkah : []).map(lk => {
        const slHtml = (Array.isArray(lk.sub_langkah) ? lk.sub_langkah : []).map(sl =>
          `<div class="mv4-sl">${sl.nomor ?? '?'}. ${esc(sl.deskripsi ?? '-')} `+
          `<em>(${sl.durasi_menit ?? '?'} mnt)</em>`+
          (sl.instrumen_ref?.length ? ` [${sl.instrumen_ref.map(esc).join(', ')}]` : '')+
          `</div>`
        ).join('');
        return `<div class="mv4-langkah"><div class="mv4-langkah-nama">${esc(lk.nama ?? '?')} `+
          `<em>(${lk.durasi_menit ?? '?'} mnt)</em></div>${slHtml}</div>`;
      }).join('');
      const mediaStr = Array.isArray(p.media_dan_alat) ? p.media_dan_alat.map(esc).join(', ') : '-';
      resmi += `<div class="mv4-section">`+
        `<div class="mv4-section-title">H. Pertemuan ${p.nomor ?? '?'}</div>`+
        `<div class="mv4-row"><span class="mv4-label">Tujuan</span><span>${esc(p.tujuan_pertemuan ?? '-')}</span></div>`+
        `<div class="mv4-row"><span class="mv4-label">Media</span><span>${mediaStr}</span></div>`+
        lkHtml + `</div>`;
    });

    // [I] Tindak Lanjut
    const tlHtml = (() => {
      let out = '';
      if (Array.isArray(tl.pilihan_dukungan) && tl.pilihan_dukungan.length)
        out += `<div class="mv4-sub"><strong>Pilihan Dukungan:</strong></div>${list(tl.pilihan_dukungan)}`;
      if (Array.isArray(tl.dukungan_terstruktur) && tl.dukungan_terstruktur.length)
        out += `<div class="mv4-sub"><strong>Dukungan Terstruktur:</strong></div>${list(tl.dukungan_terstruktur)}`;
      if (Array.isArray(tl.tantangan_lanjutan) && tl.tantangan_lanjutan.length)
        out += `<div class="mv4-sub"><strong>Tantangan Lanjutan:</strong></div>${list(tl.tantangan_lanjutan)}`;
      return out;
    })();
    if (tlHtml) resmi += sec('I. Tindak Lanjut', tlHtml);

    // [J] Catatan Guru
    if (cg.length)
      resmi += sec('J. Catatan Guru', cg.map((c,i) => `<div class="mv4-cg">${i+1}. ${esc(c)}</div>`).join(''));

    // [K] Lampiran A — Instrumen Pembelajaran
    if (ipArr.length)
      resmi += sec('K. Lampiran A — Instrumen Pembelajaran', ipArr.map(renderKontenInstrumen).join(''));

    // [L] Lampiran B — Instrumen Asesmen
    if (iaArr.length)
      resmi += sec('L. Lampiran B — Instrumen Asesmen', iaArr.map(renderKontenInstrumen).join(''));

    // ── bangun HTML tab Naskah Fasilitasi ──────────────────────────────────
    let naskah = '';
    if (nf.length === 0) {
      naskah = '<div class="mv4-empty">Naskah fasilitasi belum tersedia.</div>';
    } else {
      nf.forEach(np => {
        const lkArr = Array.isArray(np.langkah) ? np.langkah : [];
        const subHtml = lkArr.map(lk => {
          const slArr = Array.isArray(lk.sub_langkah) ? lk.sub_langkah : [];
          const slHtml = slArr.map(sl => {
            const ucapan = Array.isArray(sl.ucapan_guru) ? sl.ucapan_guru : [];
            const aksi   = Array.isArray(sl.aksi_guru)   ? sl.aksi_guru   : [];
            const tanya  = Array.isArray(sl.pertanyaan_kunci) ? sl.pertanyaan_kunci : [];
            const kesulitan = Array.isArray(sl.jika_kesulitan) ? sl.jika_kesulitan : [];
            return `<div class="mv4-ns-sl">`+
              `<div class="mv4-ns-ref">${esc(sl.ref ?? '?')}</div>`+
              (ucapan.length ? `<div class="mv4-ns-group"><div class="mv4-ns-group-label">Ucapan Guru</div>`+
                ucapan.map(u => `<div class="mv4-ns-item">"${esc(u)}"</div>`).join('')+`</div>` : '')+
              (aksi.length ? `<div class="mv4-ns-group"><div class="mv4-ns-group-label">Aksi Guru</div>`+
                aksi.map(a => `<div class="mv4-ns-item">→ ${esc(a)}</div>`).join('')+`</div>` : '')+
              (tanya.length ? `<div class="mv4-ns-group"><div class="mv4-ns-group-label">Pertanyaan Kunci</div>`+
                tanya.map(t => `<div class="mv4-ns-item">? ${esc(t)}</div>`).join('')+`</div>` : '')+
              (kesulitan.length ? `<div class="mv4-ns-group mv4-ns-tip"><div class="mv4-ns-group-label">Jika Kesulitan</div>`+
                kesulitan.map(k => `<div class="mv4-ns-item">⚠ ${esc(k)}</div>`).join('')+`</div>` : '')+
              `</div>`;
          }).join('');
          return `<div class="mv4-ns-langkah"><div class="mv4-langkah-nama">${esc(lk.nama ?? '?')}</div>${slHtml}</div>`;
        }).join('');
        naskah += `<div class="mv4-section">`+
          `<div class="mv4-section-title">Pertemuan ${np.nomor ?? '?'} — Naskah</div>`+
          subHtml+`</div>`;
      });
    }

    // ── render widget dua tab ke chat ───────────────────────────────────────
    const wrap = document.createElement('div');
    wrap.className = 'mv4-wrap';
    wrap.innerHTML = `
<style>
.mv4-wrap{font-size:.87rem;line-height:1.5;max-width:100%}
.mv4-tabs{display:flex;gap:4px;margin-bottom:8px}
.mv4-tab{padding:4px 12px;border-radius:4px;border:1px solid var(--border,#ccc);
  background:transparent;cursor:pointer;font-size:.82rem;color:var(--text-muted,#888)}
.mv4-tab.active{background:var(--gold,#c8a84b);color:#000;border-color:var(--gold,#c8a84b);font-weight:600}
.mv4-panel{display:none}.mv4-panel.active{display:block}
.mv4-section{margin:8px 0;padding:8px;border-radius:6px;background:var(--surface2,rgba(255,255,255,.04))}
.mv4-section-title{font-weight:700;margin-bottom:6px;color:var(--gold,#c8a84b);font-size:.82rem;text-transform:uppercase;letter-spacing:.04em}
.mv4-row{display:flex;gap:8px;margin:2px 0;font-size:.84rem}
.mv4-label{min-width:7rem;color:var(--text-muted,#888);flex-shrink:0}
.mv4-kktp-item{margin:4px 0;font-size:.84rem}.mv4-sub{color:var(--text-muted,#888);font-size:.8rem;margin-left:8px}
.mv4-asesmen-blok{margin:4px 0;padding:4px 8px;border-left:2px solid var(--gold,#c8a84b)}
.mv4-asesmen-label{font-weight:600;font-size:.8rem;color:var(--gold,#c8a84b);margin-bottom:2px}
.mv4-langkah{margin:6px 0}.mv4-langkah-nama{font-weight:600;font-size:.83rem;margin-bottom:2px}
.mv4-sl{margin-left:12px;font-size:.82rem;color:var(--text-muted,#888)}
.mv4-ins-block{margin:8px 0;border:1px solid var(--border,rgba(255,255,255,.1));border-radius:6px;overflow:hidden}
.mv4-ins-header{padding:6px 8px;font-size:.83rem;background:var(--surface2,rgba(255,255,255,.04))}
.mv4-ins-id{font-weight:700}.mv4-ins-jenis{color:var(--text-muted,#888)}
.mv4-ins-star{color:var(--gold,#c8a84b);font-weight:600;margin-left:4px}
.mv4-ins-murid{padding:6px 8px;border-top:1px solid var(--border,rgba(255,255,255,.1));background:rgba(200,168,75,.05)}
.mv4-ins-guru{padding:6px 8px;border-top:1px solid var(--border,rgba(255,255,255,.1))}
.mv4-ins-zone-label{font-size:.73rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--gold,#c8a84b);margin-bottom:4px}
.mv4-list{margin:2px 0 4px 16px;padding:0;font-size:.82rem}
.mv4-list li{margin:1px 0}
.mv4-dialog-turn{font-size:.82rem;margin:2px 0 2px 8px}
.mv4-dialog-speaker{font-weight:600;color:var(--gold,#c8a84b)}
.mv4-teks{font-size:.82rem;margin:4px 0;padding:6px 8px;border-left:2px solid var(--border,rgba(255,255,255,.2));white-space:pre-wrap}
.mv4-cg{font-size:.83rem;margin:2px 0}
.mv4-ns-sl{margin:6px 0;padding:6px 8px;border-radius:4px;background:var(--surface2,rgba(255,255,255,.04))}
.mv4-ns-ref{font-weight:700;font-size:.8rem;color:var(--gold,#c8a84b);margin-bottom:4px}
.mv4-ns-group{margin:4px 0}.mv4-ns-group-label{font-size:.75rem;font-weight:600;color:var(--text-muted,#888);text-transform:uppercase}
.mv4-ns-item{font-size:.83rem;margin:2px 0 2px 8px}
.mv4-ns-tip .mv4-ns-item{color:#e08c4f}
.mv4-empty{color:var(--text-muted,#888);font-style:italic;padding:8px}
</style>
<div class="mv4-tabs">
  <button class="mv4-tab active" data-tab="resmi">Modul Ajar Resmi</button>
  <button class="mv4-tab" data-tab="naskah">Naskah Fasilitasi</button>
</div>
<div class="mv4-panel active" data-panel="resmi">${resmi}</div>
<div class="mv4-panel" data-panel="naskah">${naskah}</div>`;

    wrap.querySelectorAll('.mv4-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        const t = btn.dataset.tab;
        wrap.querySelectorAll('.mv4-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === t));
        wrap.querySelectorAll('.mv4-panel').forEach(p => p.classList.toggle('active', p.dataset.panel === t));
      });
    });

    rcAppendBubble('ai', wrap);
    addToHistory('ai', `Modul Ajar V4.0 — ${id.mata_pelajaran ?? ''} TP ${id.nomor_tp ?? '?'} (${pt.length} pertemuan)`);
  }

  // ── Render schema lama (sebelum V3.2.0) ──────────────────────────────────
  function _renderModulPreviewLama(konten) {
    const header =
      `Modul Ajar — TP ${konten.tp_nomor ?? '?'}: ${konten.tp_judul ?? '-'}\n` +
      `${konten.jumlah_pertemuan ?? '?'} pertemuan · ${konten.jp_per_pertemuan ?? '?'} JP per pertemuan`;
    rcAppendBubble('ai', header);
    addToHistory('ai', header);
    const pertemuanArr = Array.isArray(konten.pertemuan) ? konten.pertemuan : [];
    for (const p of pertemuanArr) {
      const aktivitasLines = Array.isArray(p.aktivitas)
        ? p.aktivitas.map(a => `  [${a.tahap} ${a.durasi_menit}′] ${a.deskripsi}`).join('\n')
        : '';
      const bubble =
        `Pertemuan ${p.nomor ?? '?'}\n` +
        `Tujuan: ${p.tujuan_pertemuan ?? '-'}\n` +
        `Media: ${(p.media_dan_alat || []).join(', ')}\n\n` +
        `${aktivitasLines}\n\n` +
        (p.asesmen_formatif ? `Asesmen formatif: ${p.asesmen_formatif}` : '') +
        (p.catatan_guru ? `\nCatatan: ${p.catatan_guru}` : '');
      rcAppendBubble('ai', bubble);
    }
    if (konten.asesmen_sumatif) {
      rcAppendBubble('ai', `Asesmen sumatif: ${konten.asesmen_sumatif}`);
    }
  }

  // ── Render schema V3.2.0 ─────────────────────────────────────────────────
  function _renderModulPreviewV320(konten) {
    const id  = konten.identitas           ?? {};
    const ident = konten.identifikasi      ?? {};
    const dp  = konten.desain_pembelajaran ?? {};
    const ra  = konten.rencana_asesmen     ?? {};
    const ins = konten.instrumen           ?? {};

    // ── 1. HEADER IDENTITAS ─────────────────────────────────────────────────
    const elemenCp = Array.isArray(id.elemen_cp) ? id.elemen_cp.join(', ') : '-';
    const headerLines = [
      `📋 Modul Ajar V3.2.0`,
      `Mata Pelajaran   : ${id.mata_pelajaran   ?? '-'}`,
      `Jenjang / Fase   : ${id.jenjang ?? '-'} / Fase ${id.fase ?? '-'}`,
      `Nomor TP         : ${id.nomor_tp ?? '-'}`,
      `Pertemuan        : ${id.jumlah_pertemuan ?? '-'} × ${id.jp_per_pertemuan ?? '-'} JP (${id.durasi_jp_menit ?? '-'} mnt/JP)`,
      `Total alokasi    : ${id.alokasi_waktu_total_menit ?? '-'} menit`,
      `Elemen CP        : ${elemenCp}`,
      `Jenis Dokumen    : ${id.jenis_dokumen ?? '-'}`,
    ];
    rcAppendBubble('ai', headerLines.join('\n'));
    addToHistory('ai', headerLines[0]);

    // ── 2. TUJUAN PEMBELAJARAN ──────────────────────────────────────────────
    if (id.tujuan_pembelajaran || id.dasar_cp) {
      const tpLines = ['🎯 Tujuan Pembelajaran'];
      if (id.tujuan_pembelajaran) tpLines.push(id.tujuan_pembelajaran);
      if (id.dasar_cp) tpLines.push(`\nDasar CP:\n${id.dasar_cp}`);
      rcAppendBubble('ai', tpLines.join('\n'));
    }
    const lingkupArr = Array.isArray(id.lingkup_materi) ? id.lingkup_materi : [];
    if (lingkupArr.length) {
      rcAppendBubble('ai',
        `Lingkup Materi\n${lingkupArr.map((m, i) => `${i + 1}. ${m}`).join('\n')}`);
    }
    const kosakataArr = Array.isArray(id.kosakata_inti) ? id.kosakata_inti : [];
    if (kosakataArr.length) {
      rcAppendBubble('ai',
        `Kosakata Inti (${kosakataArr.length})\n${kosakataArr.map((k, i) => `${i + 1}. ${k}`).join('\n')}`);
    }

    // ── 3. IDENTIFIKASI ─────────────────────────────────────────────────────
    const dplArr = Array.isArray(ident.dimensi_profil_lulusan) ? ident.dimensi_profil_lulusan : [];
    if (dplArr.length) {
      const dplLines = dplArr.map((d, i) =>
        `${i + 1}. ${d.dimensi ?? '-'}\n   Alasan: ${d.alasan ?? '-'}\n   Indikator: ${d.indikator ?? '-'}`
      );
      rcAppendBubble('ai', `🧑‍🎓 Identifikasi — Dimensi Profil Lulusan\n\n${dplLines.join('\n\n')}`);
    }
    const km = ident.karakteristik_materi ?? {};
    if (km.faktual || km.konseptual || km.prosedural) {
      rcAppendBubble('ai',
        `Karakteristik Materi\n` +
        `Faktual    : ${km.faktual ?? '-'}\n` +
        `Konseptual : ${km.konseptual ?? '-'}\n` +
        `Prosedural : ${km.prosedural ?? '-'}`);
    }
    if (ident.kesiapan_murid || ident.lingkungan_pembelajaran || ident.kemitraan_dan_keamanan) {
      rcAppendBubble('ai',
        `Kesiapan Murid        : ${ident.kesiapan_murid ?? '-'}\n` +
        `Lingkungan Pembelajaran: ${ident.lingkungan_pembelajaran ?? '-'}\n` +
        `Kemitraan & Keamanan  : ${ident.kemitraan_dan_keamanan ?? '-'}`);
    }

    // ── 4. DESAIN PEMBELAJARAN ──────────────────────────────────────────────
    const kktpArr = Array.isArray(dp.kktp) ? dp.kktp : [];
    if (kktpArr.length) {
      const kktpLines = kktpArr.map(k =>
        `${k.id_kktp ?? '?'}: ${k.kriteria ?? '-'}\n  Bukti: ${k.bukti ?? '-'}`
      );
      rcAppendBubble('ai', `📐 KKTP\n\n${kktpLines.join('\n\n')}`);
    }
    const sbArr = Array.isArray(dp.sumber_belajar) ? dp.sumber_belajar : [];
    const sbLines = sbArr.map(s => `• ${s.sumber ?? '-'} [${s.kategori ?? '-'}] — ${s.fungsi ?? '-'}`).join('\n');
    if (dp.strategi_pedagogis || sbLines) {
      rcAppendBubble('ai',
        `🗂 Desain Pembelajaran\n` +
        `Strategi  : ${dp.strategi_pedagogis ?? '-'}\n` +
        `Digital   : ${dp.pemanfaatan_digital ?? '-'}` +
        (sbLines ? `\n\nSumber Belajar:\n${sbLines}` : ''));
    }
    const bkaArr = Array.isArray(dp.bukti_kesiapan_awal) ? dp.bukti_kesiapan_awal : [];
    const bkArr  = Array.isArray(dp.bukti_ketercapaian) ? dp.bukti_ketercapaian : [];
    if (bkaArr.length || bkArr.length) {
      rcAppendBubble('ai',
        (bkaArr.length ? `Bukti Kesiapan Awal:\n${bkaArr.map(b => `• ${b}`).join('\n')}` : '') +
        (bkArr.length  ? `\n\nBukti Ketercapaian:\n${bkArr.map(b => `• ${b}`).join('\n')}` : ''));
    }

    // ── 5. RENCANA ASESMEN ──────────────────────────────────────────────────
    const aa     = ra.asesmen_awal     ?? {};
    const afArr  = Array.isArray(ra.asesmen_formatif) ? ra.asesmen_formatif : [];
    const asLines = [
      `📊 Rencana Asesmen`,
      ``,
      `ASESMEN AWAL`,
      `Tujuan    : ${aa.tujuan ?? '-'}`,
      `Teknik    : ${aa.teknik ?? '-'}`,
      `Instrumen : ${aa.instrumen ?? '-'}`,
      `Waktu     : ${aa.waktu ?? '-'}`,
      `Penggunaan: ${aa.penggunaan_hasil ?? '-'}`,
      `Status    : ${aa.status ?? '-'}`,
    ];
    afArr.forEach(f => {
      asLines.push('');
      asLines.push(`${f.id ?? '?'} — FORMATIF`);
      asLines.push(`Waktu   : ${f.waktu ?? '-'}  |  Teknik: ${f.teknik_instrumen ?? '-'}`);
      asLines.push(`Fungsi  : ${f.fungsi ?? '-'}  |  Kriteria: ${f.kriteria ?? '-'}`);
      asLines.push(`Umpan balik: ${f.umpan_balik ?? '-'}`);
    });
    if (ra.asesmen_sumatif) {
      asLines.push('');
      asLines.push(`SUMATIF: ${ra.asesmen_sumatif}`);
    }
    rcAppendBubble('ai', asLines.join('\n'));

    // ── 6. PERTEMUAN ────────────────────────────────────────────────────────
    const pertemuanArr = Array.isArray(konten.pertemuan) ? konten.pertemuan : [];
    for (const p of pertemuanArr) {
      const langkahArr = Array.isArray(p.langkah) ? p.langkah : [];
      const LABEL_LANGKAH = {
        PEMBUKA:      'Pembuka',
        ASESMEN_AWAL: 'Asesmen Awal',
        MEMAHAMI:     'Memahami',
        MENGAPLIKASI: 'Mengaplikasi',
        MEREFLEKSI:   'Merefleksi',
        PENUTUP:      'Penutup',
      };
      const langkahLines = langkahArr.map(lk => {
        const namaLabel = LABEL_LANGKAH[lk.nama] ?? lk.nama ?? '?';
        const prinsip = Array.isArray(lk.prinsip) ? lk.prinsip.join(', ') : '-';
        const slLines = Array.isArray(lk.sub_langkah)
          ? lk.sub_langkah.map(sl => `      ${sl.nomor ?? '?'}. ${sl.deskripsi ?? '-'}`).join('\n')
          : '';
        return `  ▸ ${namaLabel} (${lk.durasi_menit ?? '?'} mnt) [${prinsip}]` +
          (slLines ? `\n${slLines}` : '');
      });
      const mediaStr = Array.isArray(p.media_dan_alat) ? p.media_dan_alat.join(', ') : '-';
      const bubble =
        `📅 Pertemuan ${p.nomor ?? '?'}\n` +
        `Tujuan: ${p.tujuan_pertemuan ?? '-'}\n` +
        `Media : ${mediaStr}\n\n` +
        langkahLines.join('\n\n') +
        (p.catatan_guru ? `\n\nCatatan Guru: ${p.catatan_guru}` : '');
      rcAppendBubble('ai', bubble);
    }

    // ── 7. INSTRUMEN G1-G7 ──────────────────────────────────────────────────

    // G1 — Lembar Pemetaan Awal
    const g1 = ins.g1_lembar_pemetaan ?? {};
    if (g1.petunjuk || Array.isArray(g1.bagian_a)) {
      const baLines = Array.isArray(g1.bagian_a)
        ? g1.bagian_a.map((s, i) => `  ${i + 1}. "${s.kalimat_konteks ?? '-'}" — kata: ${s.kata_target ?? '-'}`).join('\n')
        : '';
      const bbLines = Array.isArray(g1.bagian_b)
        ? g1.bagian_b.map((q, i) => `  ${i + 1}. ${q}`).join('\n') : '';
      const bcLines = Array.isArray(g1.bagian_c)
        ? g1.bagian_c.map((s, i) => `  ${i + 1}. ${s}`).join('\n') : '';
      rcAppendBubble('ai',
        `📝 G1 — Lembar Pemetaan Awal\n${g1.petunjuk ?? ''}` +
        (baLines ? `\n\nBagian A — Membaca (${(g1.bagian_a ?? []).length} soal):\n${baLines}` : '') +
        (bbLines ? `\n\nBagian B — Menyimak:\n${bbLines}` : '') +
        (bcLines ? `\n\nBagian C — Respons:\n${bcLines}` : ''));
    }

    // G2 — Dialog Baseline
    const g2 = ins.g2_dialog_baseline ?? {};
    if (g2.petunjuk || Array.isArray(g2.giliran)) {
      const gLines = Array.isArray(g2.giliran)
        ? g2.giliran.map(g => `  ${g.pembicara ?? '?'}: ${g.ucapan ?? '-'}`).join('\n') : '';
      rcAppendBubble('ai',
        `💬 G2 — Dialog Baseline (dibacakan guru)\n${g2.petunjuk ?? ''}\n\n${gLines}`);
    }

    // G3 — Dialog Model
    const g3 = ins.g3_dialog_model ?? {};
    if (g3.petunjuk || Array.isArray(g3.giliran)) {
      const gLines = Array.isArray(g3.giliran)
        ? g3.giliran.map(g => `  ${g.pembicara ?? '?'}: ${g.ucapan ?? '-'}`).join('\n') : '';
      rcAppendBubble('ai',
        `💬 G3 — Dialog Model Pembelajaran\n${g3.petunjuk ?? ''}\n\n${gLines}`);
    }

    // G4 — Teks Orientasi
    const g4 = ins.g4_teks_orientasi ?? {};
    if (g4.konten || g4.nama_perusahaan) {
      const cpLines = Array.isArray(g4.contoh_pertanyaan_diterima)
        ? g4.contoh_pertanyaan_diterima.map((q, i) => `  ${i + 1}. ${q}`).join('\n') : '';
      rcAppendBubble('ai',
        `📄 G4 — Teks Orientasi Kerja (${g4.nama_perusahaan ?? '-'})\n\n` +
        `${g4.konten ?? ''}\n\n` +
        `Panduan guru: ${g4.panduan_guru ?? '-'}` +
        (cpLines ? `\n\nContoh pertanyaan yang dapat diterima:\n${cpLines}` : ''));
    }

    // G5 — Kartu Identitas
    const g5Arr = Array.isArray(ins.g5_kartu_identitas) ? ins.g5_kartu_identitas : [];
    if (g5Arr.length) {
      const fmtG5Kartu = (k, label) => {
        const parts = [k.nama, k.jabatan, k.bagian].filter(v => v && v !== '-');
        const shift = k.shift && k.shift !== '-' ? `Shift ${k.shift}` : null;
        if (shift) parts.push(shift);
        const detail = parts.length ? ` (${parts.join(', ')})` : '';
        return `  ${label}${detail}\n  Peran: ${k.peran ?? '-'}`;
      };
      const setLines = g5Arr.map(s => {
        const ka = s.kartu_a ?? {};
        const kb = s.kartu_b ?? {};
        return `${s.nama_set ?? '-'} — ${s.nama_perusahaan ?? '-'}\n` +
          fmtG5Kartu(ka, 'Kartu A') + '\n' +
          fmtG5Kartu(kb, 'Kartu B');
      });
      rcAppendBubble('ai', `🪪 G5 — Kartu Identitas Kerja Fiktif\n\n${setLines.join('\n\n')}`);
    }

    // G6 — Matriks Observasi
    const g6 = ins.g6_matriks_observasi ?? {};
    if (g6.kode_legend || Array.isArray(g6.kolom_indikator)) {
      const colLines = Array.isArray(g6.kolom_indikator)
        ? g6.kolom_indikator.map(c => `  ${c.id ?? '?'}: ${c.label ?? '-'}`).join('\n') : '';
      rcAppendBubble('ai',
        `📊 G6 — Matriks Observasi Kelas\n` +
        `Legend : ${g6.kode_legend ?? '-'}\n` +
        (colLines ? `Kolom  :\n${colLines}\n` : '') +
        `Catatan: ${g6.catatan_kritis ?? '-'}`);
    }

    // G7 — Lembar Refleksi
    const g7 = ins.g7_lembar_refleksi ?? {};
    const g7Arr = Array.isArray(g7.pertanyaan) ? g7.pertanyaan : [];
    if (g7Arr.length) {
      const pLines = g7Arr.map(p =>
        `  ${p.nomor ?? '?'}. ${p.prompt ?? '-'} (${p.jumlah_jawaban ?? 1} isian)`
      ).join('\n');
      rcAppendBubble('ai', `🪞 G7 — Lembar Refleksi Murid\n${pLines}`);
    }

    // ── 8. TINDAK LANJUT ────────────────────────────────────────────────────
    const tl = konten.tindak_lanjut ?? {};
    const tlSections = [];
    const pdArr = Array.isArray(tl.pilihan_dukungan)   ? tl.pilihan_dukungan   : [];
    const sfArr = Array.isArray(tl.sentence_frame)      ? tl.sentence_frame      : [];
    const tlArr = Array.isArray(tl.tantangan_lanjutan)  ? tl.tantangan_lanjutan  : [];
    if (pdArr.length) tlSections.push(`Pilihan Dukungan:\n${pdArr.map(d => `• ${d}`).join('\n')}`);
    if (sfArr.length) tlSections.push(`Sentence Frames:\n${sfArr.map(f => `• ${f}`).join('\n')}`);
    if (tlArr.length) tlSections.push(`Tantangan Lanjutan:\n${tlArr.map(t => `• ${t}`).join('\n')}`);
    if (tlSections.length) {
      rcAppendBubble('ai', `🔄 Tindak Lanjut\n\n${tlSections.join('\n\n')}`);
    }

    // ── 9. CATATAN GURU ─────────────────────────────────────────────────────
    const cgArr = Array.isArray(konten.catatan_guru) ? konten.catatan_guru : [];
    if (cgArr.length) {
      rcAppendBubble('ai',
        `📌 Catatan Guru\n${cgArr.map((c, i) => `${i + 1}. ${c}`).join('\n')}`);
    }
  }

  // ─── Generate ATP ─────────────────────────────────────────────────────────

  async function triggerGenerateAtp() {
    // T59: guard double-trigger — satu pipeline dalam satu waktu
    if (_chat.atp_generating) return;
    _chat.atp_generating = true;
    // T62: refresh updated_at dari DB sebelum setiap generate/retry (same pattern as triggerGenerateModul)
    if (_chat.atp_induk_id) {
      try {
        const { data: freshAtp } = await window.supabaseClient
          .from('atp_induk').select('updated_at').eq('id', _chat.atp_induk_id).maybeSingle();
        if (freshAtp?.updated_at) {
          _chat.atp_updated_at = freshAtp.updated_at;
          saveState();
        }
      } catch (_) { /* biarkan generate lanjut dengan updated_at lama */ }
    }
    rcAppendBubble('ai', '⏳ Menyusun Alur Tujuan Pembelajaran…');
    addToHistory('ai', 'Menyusun Alur Tujuan Pembelajaran…');
    rcShowTyping();
    try {
      const result = await callGenerateAtp(_chat.atp_induk_id, _chat.atp_updated_at, _chat.sumber_flow);
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
        const FIELD_LABELS = {
          jp_per_minggu: 'JP per minggu', durasi_jp: 'durasi JP', minggu_sem1: 'minggu semester 1',
          minggu_sem2: 'minggu semester 2', cadangan_minggu: 'cadangan minggu',
          pola_jadwal: 'pola jadwal', target_prioritas: 'prioritas', timeline_tka: 'target waktu TKA',
          status_data_awal: 'data kemampuan awal', kesulitan_mode: 'kesulitan siswa',
          target_akhir_mode: 'target akhir fase', penguatan_elemen: 'elemen penguatan',
          target_kemandirian: 'target kemandirian', kekuatan_konteks: 'kekuatan konteks kejuruan',
          ranah_dunia_kerja: 'ranah dunia kerja', kebutuhan_bidang: 'kebutuhan bidang',
          batas_konteks: 'batas konteks', strategi_prasyarat: 'pengulangan kemampuan dasar',
        };
        const missing = (err.missing || []).map(f => FIELD_LABELS[f] || f);
        const list = missing.join(', ');
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
        msg = '❌ Batas generate ATP harian (3×) untuk ATP ini tercapai. Coba lagi besok.';
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
    } finally {
      _chat.atp_generating = false;
    }
  }

  async function triggerGenerateModul() {
    // Guard double-trigger — satu pipeline dalam satu waktu
    if (_chat.modul_generating) return;
    _chat.modul_generating = true;

    // Refresh updated_at dari DB sebelum setiap generate/retry.
    // Fase A dan B menulis ke DB dan mengubah updated_at; tanpa refresh ini,
    // retry setelah kegagalan Fase C akan selalu conflict karena _chat.modul_updated_at stale.
    if (_chat.modul_induk_id) {
      try {
        const { data: freshModul } = await window.supabaseClient
          .from('modul_induk')
          .select('updated_at')
          .eq('id', _chat.modul_induk_id)
          .maybeSingle();
        if (freshModul?.updated_at) {
          _chat.modul_updated_at = freshModul.updated_at;
          saveState();
        }
      } catch (_) { /* biarkan generate lanjut dengan updated_at lama */ }
    }

    const FASE_LABELS = {
      A: '⏳ Menyusun identitas dan rencana asesmen…',
      B: '⏳ Merancang langkah pembelajaran…',
      C: '⏳ Membuat instrumen asesmen…',
      D: '⏳ Menyusun tindak lanjut dan finalisasi…',
    };

    // Disable chip "Ulangi Generate" jika ada di DOM
    document.querySelectorAll('.rp-chip').forEach(el => {
      if (el.textContent.includes('Generate') || el.textContent.includes('Ulangi')) {
        el.disabled = true;
      }
    });

    const _abort = new AbortController();
    _chat._abortGenerate = _abort;

    let progressBubble = rcAppendBubble('ai', FASE_LABELS.A);
    addToHistory('ai', 'Menyusun Modul Ajar…');

    // Tombol "Batalkan" — muncul selama generate berlangsung
    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'rp-chip';
    cancelBtn.textContent = '✕ Batalkan';
    cancelBtn.style.cssText = 'background:rgba(220,53,69,0.15);color:#ff6b6b;border-color:rgba(220,53,69,0.4);';
    cancelBtn.addEventListener('click', () => {
      _abort.abort();
      cancelBtn.disabled = true;
      cancelBtn.textContent = 'Membatalkan…';
    });
    const cancelBubble = rcAppendBubble('sistem', cancelBtn);

    rcShowTyping();

    const generateStart = Date.now();

    function onProgress({ fase }) {
      if (!progressBubble || !FASE_LABELS[fase]) return;
      progressBubble.textContent = FASE_LABELS[fase];
    }

    try {
      const result = await callGenerateModul(
        _chat.modul_induk_id,
        _chat.classroom_id,
        _chat.modul_updated_at,
        onProgress,
        _abort.signal,
      );
      rcHideTyping();
      if (cancelBubble) cancelBubble.remove();
      if (progressBubble) progressBubble.remove();
      _chat.modul_konten     = result.konten;
      _chat.modul_updated_at = result.updated_at;
      saveState();
      const s = result.summary;
      const durasi = Math.round((Date.now() - generateStart) / 1000);
      const rlInfo = result.rate_limit_info;
      const rlNote = rlInfo ? ` Sisa ${rlInfo.remaining}× generate hari ini.` : '';
      const msg =
        `✅ Modul Ajar selesai! ${s.jumlah_pertemuan} pertemuan, ` +
        `${s.jp_per_pertemuan} JP per pertemuan. (${durasi}s)${rlNote}`;
      rcAppendBubble('ai', msg);
      addToHistory('ai', msg);
      await startPhase('MODUL_REVIEW');
    } catch (err) {
      rcHideTyping();
      if (cancelBubble) cancelBubble.remove();
      if (progressBubble) { progressBubble.remove(); progressBubble = null; }
      if (err.name === 'AbortError') {
        rcAppendBubble('sistem', '⚠ Generate dibatalkan. Progres parsial dihapus — Anda bisa mulai ulang kapan saja.');
        try {
          await window.supabaseClient
            .from('modul_induk')
            .update({ konten: {}, status: 'draft' })
            .eq('id', _chat.modul_induk_id);
        } catch (_) { /* biarkan — status sudah draft sebelum Fase D */ }
        return;
      }
      const code = err.code || '';
      let msg;
      let retryable = false;
      let needsReload = false;
      let needsBack = false;
      if (code === 'MODUL_INPUT_INCOMPLETE') {
        const missingList = (err.missing || []).join(', ');
        msg = 'Beberapa data belum lengkap' + (missingList ? ': ' + missingList : '') + '. Kembali ke ringkasan untuk melengkapinya.';
        needsBack = true;
      } else if (code === 'MODUL_WRITE_CONFLICT' || code === 'MODUL_GENERATION_CONFLICT') {
        msg = 'Modul ini sedang dibuka di halaman lain. Muat ulang halaman lalu coba lagi.';
        needsReload = true;
      } else if (code === 'MODUL_NOT_FOUND') {
        msg = 'Modul tidak ditemukan. Muat ulang halaman.';
        needsReload = true;
      } else if (['MODUL_GENERATION_INVALID_JSON', 'MODUL_GENERATION_INVALID_SCHEMA', 'MODUL_GENERATION_FAILED'].includes(code)) {
        msg = 'MiClass belum berhasil menyusun modul. Jawaban Anda tersimpan. Silakan coba lagi.';
        retryable = true;
      } else if (['MODUL_GENERATION_TIMEOUT', 'MODUL_STREAM_INCOMPLETE', 'MODUL_POLL_TIMEOUT', 'AI_ERROR'].includes(code)) {
        msg = 'Terjadi gangguan sementara. Silakan coba lagi dalam beberapa menit.';
        retryable = true;
      } else if (code === 'RATE_LIMIT') {
        msg = 'Batas generate Modul hari ini (5×) sudah tercapai. Coba lagi besok ya.';
      } else {
        msg = 'Terjadi gangguan sementara. Silakan coba lagi dalam beberapa menit.';
        retryable = true;
      }
      rcAppendBubble('sistem', '⚠ ' + msg);
      const actionWrap = document.createElement('div');
      actionWrap.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;margin-top:4px;';
      if (retryable) {
        const btnRetry = document.createElement('button');
        btnRetry.className = 'rp-chip';
        btnRetry.textContent = '↺ Coba Lagi';
        btnRetry.addEventListener('click', function () {
          actionWrap.closest('.rc-bubble')?.remove();
          triggerGenerateModul();
        });
        actionWrap.appendChild(btnRetry);
      }
      if (needsReload) {
        const btnReload = document.createElement('button');
        btnReload.className = 'rp-chip';
        btnReload.textContent = '🔄 Muat Ulang';
        btnReload.addEventListener('click', function () { window.location.reload(); });
        actionWrap.appendChild(btnReload);
      }
      if (needsBack) {
        const btnBack = document.createElement('button');
        btnBack.className = 'rp-chip';
        btnBack.textContent = '← Kembali ke Ringkasan';
        btnBack.addEventListener('click', function () {
          actionWrap.closest('.rc-bubble')?.remove();
          startPhase('MODUL_SUMMARY');
        });
        actionWrap.appendChild(btnBack);
      }
      if (actionWrap.children.length > 0) rcAppendBubble('sistem', actionWrap);
    } finally {
      _chat.modul_generating = false;
      // Re-enable chip jika ada
      document.querySelectorAll('.rp-chip').forEach(el => {
        if (el.textContent.includes('Generate') || el.textContent.includes('Ulangi')) {
          el.disabled = false;
        }
      });
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
      const urlTab   = new URLSearchParams(window.location.search).get('tab');
      if (savedTab === 'rancang' || urlTab === 'rancang') tabRancang.click();
    }
  });

}());
