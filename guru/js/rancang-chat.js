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
    in_flight:            false,
    pending_multi:        {},
  };

  const HISTORY_CAP = 40;
  const LS_KEY = () => 'rc_atp_state_' + (_chat.guru_id || 'unknown') + '_' + (_chat.classroom_id || 'unknown');

  let _loaded = false;
  let _initializing = false;

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

  async function updateAtpTargetFase(atpId, targetText) {
    try {
      const { error } = await window.supabaseClient
        .from('atp_induk')
        .update({ target_fase: targetText })
        .eq('id', atpId);
      if (error) console.warn('[rancang-chat] updateAtpTargetFase gagal:', error.message);
    } catch (err) { console.warn('[rancang-chat] updateAtpTargetFase exception:', err); }
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

  async function initChatShell(cId, panel) {
    _chat.classroom_id = cId;
    _chat.guru_id = await getCurrentGuruId();

    const _namaKelas    = window._classroomName    || '';
    const _mapelKelas   = window._classroomSubject  || '';
    const _programKelas = window._classroomProgram  || '';
    const _infoKelas    = [_namaKelas, _mapelKelas, _programKelas]
      .filter(Boolean).join(' · ');

    panel.innerHTML = `
<div id="rc-container" class="rc-container">
  ${_infoKelas ? `<div class="rc-kelas-header">${_infoKelas}</div>` : ''}
  <div class="rc-stream" id="rc-stream"></div>
  <div id="rc-composer-wrap"></div>
</div>`;

    try {
      _chat.profile = await window.api.getRancangProfil();
    } catch (_) { _chat.profile = null; }

    const restored = loadState();
    rcRenderComposer('rc-composer-wrap', handleGuruInput);

    if (restored && _chat.active_question_id) {
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

  async function initRancangChat(cId) {
    if (_initializing || _loaded) return;
    _initializing = true;
    try {
      _chat.classroom_id = cId;
      const panel = document.getElementById('panel-rancang');
      if (!panel) return;

      const mapelDisplay = window._classroomSubject || window._classroomProgram || '—';
      rcRenderWelcomeScreen(panel, mapelDisplay, async function () {
        _initializing = true;
        try {
          await initChatShell(cId, panel);
        } finally {
          _initializing = false;
        }
      });
    } finally {
      _initializing = false;
    }
  }

  // ─── Flow ──────────────────────────────────────────────────────────────────

  async function startPhase(phase) {
    _chat.session_phase = phase;
    if (phase === 'ATP_GENERATE') {
      await triggerGenerateAtp();
      return; // triggerGenerateAtp memanggil startPhase('ATP_REVIEW') sendiri jika sukses
    }
    if (phase === 'ATP_REVIEW') {
      renderAtpDraftPreview(); // tampilkan draf TP sebelum pertanyaan konfirmasi
    }
    if (phase === 'DONE') {
      _chat.active_question_id = null;
      saveState();
      rcAppendBubble('ai', '✓ ATP telah selesai ditinjau.');
      return;
    }
    const questions = RANCANG_FLOW[phase];
    if (!questions?.length) return;
    const first = questions[0];
    askQuestion(first);
  }

  function askQuestion(q) {
    _chat.active_question_id = q.id;
    saveState();

    rcAppendBubble('ai', renderQuestionPrompt(q.prompt));

    if (q.kind === 'pilihan_jamak') {
      renderMultiSelect(q);
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

  function renderMultiSelect(q) {
    const selected = _chat.pending_multi[q.id] || [];
    const max = q.constraints?.maxSelections || Infinity;
    const available = q.options.filter(o => !selected.includes(o.value));
    const chips = [...available, { value: '__done__', label: `Selesai memilih (${selected.length})` }];
    rcRenderChips(chips, async (value, label) => {
      if (value === '__done__') {
        if (!selected.length) return rcAppendBubble('sistem', 'Pilih minimal satu opsi.');
        const summary = selected.map(v => {
          const opt = q.options.find(o => o.value === v);
          return opt?.label || v;
        }).join(', ');
        delete _chat.pending_multi[q.id];
        rcClearChips();
        rcAppendBubble('guru', summary);
        addToHistory('guru', summary);
        recordAnswer(q.id, selected, 'guru', true);
        await advanceToNext(q);
        return;
      }
      if (value === 'rekomendasi' && q.aiRecommendation) {
        delete _chat.pending_multi[q.id];
        return requestAiRecommendation(q, label);
      }
      const exclusive = q.constraints?.exclusive || [];
      _chat.pending_multi[q.id] = exclusive.includes(value) ? [value]
        : [...selected.filter(v => !exclusive.includes(v)), value].slice(0, max);
      rcAppendBubble('guru', label);
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
    rcAppendBubble('guru', rawText);
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
    rcAppendBubble('guru', label);
    addToHistory('guru', label);
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
          rcAppendBubble('guru', chipLabel);
          addToHistory('guru', chipLabel);
          recordAnswer(q.id, recommendation.value, 'ai_recommendation', true);
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

  async function ensureAtpDraft() {
    if (_chat.atp_induk_id) return;
    const mapel = answerValue('mapel') || 'Belum ditentukan';
    const fase  = answerValue('fase')  || 'E';
    const draft = await createAtpIndukDraft({
      mapel,
      fase,
      jenjang: answerValue('jenjang') || 'SMK',
      elemen_cp: lookupCpElemen(mapel, fase),
    });
    _chat.atp_induk_id = draft.id;
    _chat.atp_updated_at = draft.updated_at;
    saveState();
  }

  async function persistCompletedPhase(phase) {
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
      if ((phaseData.perhitungan?.jp_operasional ?? 1) <= 0) {
        rcAppendBubble('ai',
          'Perhatian: alokasi JP untuk rangkaian TP adalah 0. Kurangi pengurangan atau tambah minggu efektif.');
      }
    } else if (phase === 'TARGET_FASE') {
      await updateAtpTargetFase(_chat.atp_induk_id, resolveTargetFaseText());
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
    if (questionId === 'tindakan_review_atp' && value !== 'terima') return 'ATP_REVIEW';
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
