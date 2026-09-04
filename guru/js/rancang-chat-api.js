'use strict';

// Wrapper panggilan ke Edge Function evaluate-answer
// Mendukung evaluasi jawaban bebas dan rekomendasi opsi funnel.

const EVAL_URL = 'https://teccdzetrdjowqemnuuc.supabase.co/functions/v1/evaluate-answer';

// Kurangi ukuran payload collected_answers sebelum dikirim ke EF:
// - Sertakan hanya value + source (buang confirmed_by_teacher)
// - Buang jawaban dengan value string > 200 karakter
function trimCollectedAnswers(collected_answers) {
  const trimmed = {};
  for (const [key, stored] of Object.entries(collected_answers || {})) {
    if (stored == null) continue;
    const isWrapped = typeof stored === 'object' && Object.hasOwn(stored, 'value');
    const v = isWrapped ? stored.value : stored;
    if (typeof v === 'string' && v.length > 200) continue;
    if (Array.isArray(v) && JSON.stringify(v).length > 200) continue;
    trimmed[key] = isWrapped ? { value: v, source: stored.source } : v;
  }
  return trimmed;
}

async function callEvaluateAnswer(questionId, rawAnswer, questionSpec, context, mode = 'evaluation') {
  const { data: { session } } = await window.supabaseClient.auth.getSession();
  const token = session?.access_token ?? '';

  const res = await fetch(EVAL_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      mode,
      classroom_id:   context.classroom_id,
      question_id:    questionId,
      raw_answer:     rawAnswer,
      question_spec: {
        kind:        questionSpec.kind,
        prompt:      questionSpec.prompt,
        helpText:    questionSpec.helpText,
        options:     mode === 'recommendation' ? questionSpec.options : undefined,
        constraints: mode === 'recommendation' ? questionSpec.constraints : undefined,
      },
      context: {
        session_phase:     context.session_phase,
        collected_answers: trimCollectedAnswers(context.collected_answers),
      },
    }),
  });

  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'evaluate-answer error');
  if (mode === 'recommendation') {
    const recommendation = json?.recommendation;
    if (json.mode !== 'recommendation' || json.status !== 'ACCEPT' ||
        !recommendation || recommendation.value === undefined ||
        recommendation.label === undefined || typeof recommendation.reason !== 'string') {
      throw new Error('Response recommendation tidak valid.');
    }
  } else if (json.mode !== undefined && json.mode !== 'evaluation') {
    throw new Error('Response evaluation tidak valid.');
  }
  return json;
}

async function callRecommendation(questionId, questionSpec, context) {
  if (!Array.isArray(questionSpec?.options) ||
      !questionSpec.options.some(option => option.value !== 'rekomendasi')) {
    throw new Error('Pertanyaan rekomendasi tidak memiliki options yang valid.');
  }
  const result = await callEvaluateAnswer(
    questionId, undefined, questionSpec, context, 'recommendation'
  );
  return result.recommendation;
}

async function getCurrentGuruId() {
  const { data, error } = await window.supabaseClient.rpc('fn_current_profile_id');
  if (error) throw error;
  return data;
}

async function createAtpIndukDraft(metadata) {
  const guruId = await getCurrentGuruId();
  const { data, error } = await window.supabaseClient
    .from('atp_induk')
    .insert({
      guru_id: guruId,
      mapel: metadata.mapel,
      fase: metadata.fase,
      jenjang: metadata.jenjang,
      elemen_cp: metadata.elemen_cp || [],
      collected_data: {},
    })
    .select('id, guru_id, collected_data, created_at, updated_at')
    .single();
  if (error) throw error;
  return data;
}

async function saveAtpPhaseOptimistic(atpId, phase, phaseData, expectedUpdatedAt) {
  const { data: current, error: readError } = await window.supabaseClient
    .from('atp_induk')
    .select('id, collected_data, updated_at')
    .eq('id', atpId)
    .single();
  if (readError) throw readError;
  if (expectedUpdatedAt && current.updated_at !== expectedUpdatedAt) {
    const conflict = new Error('ATP berubah di tab lain. Muat ulang sebelum melanjutkan.');
    conflict.code = 'ATP_WRITE_CONFLICT';
    throw conflict;
  }

  const merged = { ...(current.collected_data || {}), [phase]: phaseData };
  let query = window.supabaseClient
    .from('atp_induk')
    .update({ collected_data: merged })
    .eq('id', atpId)
    .eq('updated_at', current.updated_at)
    .select('id, collected_data, updated_at');
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  if (!data) {
    const conflict = new Error('ATP berubah di tab lain. Muat ulang sebelum melanjutkan.');
    conflict.code = 'ATP_WRITE_CONFLICT';
    throw conflict;
  }
  return data;
}

const GENERATE_ATP_URL = 'https://teccdzetrdjowqemnuuc.supabase.co/functions/v1/generate-atp';

async function callGenerateAtp(atpIndukId, expectedUpdatedAt, sumberFlow) {
  const { data: { session } } = await window.supabaseClient.auth.getSession();
  const token = session?.access_token ?? '';

  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), 110_000);
  try {
    const res = await fetch(GENERATE_ATP_URL, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        atp_induk_id:        atpIndukId,
        expected_updated_at: expectedUpdatedAt || undefined,
        sumber_flow:         sumberFlow || undefined,
      }),
      signal: controller.signal,
    });
    const responseJson = await res.json();
    if (!res.ok) {
      const err = new Error(responseJson.error || 'generate-atp error');
      err.code    = responseJson.code    || String(res.status);
      err.missing = responseJson.missing || [];
      throw err;
    }
    return responseJson;
  } finally {
    clearTimeout(tid);
  }
}

const GENERATE_MODUL_URL = 'https://teccdzetrdjowqemnuuc.supabase.co/functions/v1/generate-modul';

async function _callGenerateModulFase(token, modulIndukId, classroomId, expectedUpdatedAt, fase, signal) {
  const res = await fetch(GENERATE_MODUL_URL, {
    method: 'POST',
    signal,
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      modul_induk_id:      modulIndukId,
      classroom_id:        classroomId,
      expected_updated_at: expectedUpdatedAt || undefined,
      fase,
    }),
  });

  let resJson = {};
  try { resJson = await res.json(); } catch { /* ignore */ }

  if (!res.ok) {
    const err = new Error(resJson.error || `generate-modul Fase ${fase} HTTP ${res.status}`);
    err.code      = resJson.code      || String(res.status);
    err.retryable = resJson.retryable ?? false;
    err.missing   = resJson.missing   || [];
    throw err;
  }
  return resJson;
}

async function callGenerateModul(modulIndukId, classroomId, expectedUpdatedAt, onProgress, signal) {
  const { data: { session } } = await window.supabaseClient.auth.getSession();
  const token = session?.access_token ?? '';
  const start = Date.now();

  if (typeof onProgress === 'function') onProgress({ fase: 'A', elapsed: 0 });

  // Fase A — identitas, identifikasi, desain, asesmen
  const resA = await _callGenerateModulFase(token, modulIndukId, classroomId, expectedUpdatedAt, 'A', signal);
  if (typeof onProgress === 'function') onProgress({ fase: 'B', elapsed: Date.now() - start });

  // Fase B — pertemuan[]
  const resB = await _callGenerateModulFase(token, modulIndukId, classroomId, resA.updated_at, 'B', signal);
  if (typeof onProgress === 'function') onProgress({ fase: 'C', elapsed: Date.now() - start });

  // Fase C — instrumen G1-G7
  const resC = await _callGenerateModulFase(token, modulIndukId, classroomId, resB.updated_at, 'C', signal);
  if (typeof onProgress === 'function') onProgress({ fase: 'D', elapsed: Date.now() - start });

  // Fase D — tindak_lanjut + catatan_guru + merge + write final + status='aktif'
  const resD = await _callGenerateModulFase(token, modulIndukId, classroomId, resC.updated_at, 'D', signal);

  return {
    status:         'done',
    modul_induk_id: modulIndukId,
    updated_at:     resD.updated_at,
    konten:         resD.konten,
    summary:        resD.summary,
    validation:     resD.validation,
  };
}

async function acceptAtp(atpIndukId, updatedAt) {
  const { data, error } = await (updatedAt
    ? window.supabaseClient.from('atp_induk').update({ status: 'aktif' })
        .eq('id', atpIndukId).eq('updated_at', updatedAt).select('id, updated_at').maybeSingle()
    : window.supabaseClient.from('atp_induk').update({ status: 'aktif' })
        .eq('id', atpIndukId).select('id, updated_at').maybeSingle());
  if (error) throw error;
  if (!data) {
    const conflict = new Error('ATP berubah. Muat ulang halaman dan coba lagi.');
    conflict.code = 'ATP_WRITE_CONFLICT';
    throw conflict;
  }
  return data;
}

async function saveAtpAdaptasi(atpIndukId, classroomId, patch) {
  const guruId = await getCurrentGuruId();
  const { data, error } = await window.supabaseClient
    .from('atp_adaptasi')
    .upsert({
      atp_induk_id: atpIndukId,
      guru_id: guruId,
      classroom_id: classroomId,
      ...patch,
    }, { onConflict: 'atp_induk_id,classroom_id' })
    .select('id, updated_at')
    .single();
  if (error) throw error;
  return data;
}

// Daftar ATP induk milik guru yang sedang login. RLS pol_atp_induk_select sudah
// memfilter guru_id = fn_current_profile_id(), jadi tidak perlu filter di sini.
async function getAtpIndukList() {
  const { data, error } = await window.supabaseClient
    .from('atp_induk')
    .select('id, mapel, fase, jenjang, status, updated_at, progresi_tp')
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

// Hapus ATP induk milik guru sendiri. RLS pol_atp_induk_delete memastikan
// hanya baris guru_id = fn_current_profile_id() yang bisa dihapus; atp_adaptasi
// terkait ikut terhapus lewat ON DELETE CASCADE (migration 20260827000001).
async function deleteAtpInduk(atpId) {
  const { error } = await window.supabaseClient
    .from('atp_induk')
    .delete()
    .eq('id', atpId);
  if (error) throw error;
}

async function createModulIndukDraft(atpIndukId, nomorTp, tpJudul) {
  const guruId = await getCurrentGuruId();
  const { data, error } = await window.supabaseClient
    .from('modul_induk')
    .upsert({
      guru_id:        guruId,
      atp_induk_id:   atpIndukId,
      nomor_tp:       nomorTp,
      tp_judul:       tpJudul || '',
      collected_data: {},
      status:         'draft',
    }, {
      onConflict:        'guru_id,atp_induk_id,nomor_tp',
      ignoreDuplicates:  false,
    })
    .select('id, guru_id, collected_data, updated_at, status')
    .single();
  if (error) throw error;
  return data;
}

async function saveModulPhaseOptimistic(modulId, phase, phaseData, expectedUpdatedAt) {
  const { data: current, error: readError } = await window.supabaseClient
    .from('modul_induk')
    .select('id, collected_data, updated_at')
    .eq('id', modulId)
    .single();
  if (readError) throw readError;
  if (expectedUpdatedAt && current.updated_at !== expectedUpdatedAt) {
    const conflict = new Error('Modul berubah di tab lain. Muat ulang sebelum melanjutkan.');
    conflict.code = 'MODUL_WRITE_CONFLICT';
    throw conflict;
  }
  const merged = { ...(current.collected_data || {}), [phase]: phaseData };
  const { data, error } = await window.supabaseClient
    .from('modul_induk')
    .update({ collected_data: merged })
    .eq('id', modulId)
    .eq('updated_at', current.updated_at)
    .select('id, collected_data, updated_at')
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    const conflict = new Error('Modul berubah di tab lain. Muat ulang sebelum melanjutkan.');
    conflict.code = 'MODUL_WRITE_CONFLICT';
    throw conflict;
  }
  return data;
}

// Arsipkan draft lama yang ditinggalkan saat guru memulai ATP baru. Cakupannya
// sengaja dipersempit ke kombinasi mapel+fase+jenjang yang sama — draft untuk
// mapel atau fase lain adalah pekerjaan terpisah yang mungkin masih dilanjutkan.
// Tidak pernah menghapus baris: status 'arsip' sudah sah menurut CHECK constraint.
async function cleanupAbandonedDrafts(currentAtpId, scope) {
  if (!currentAtpId || !scope?.mapel || !scope?.fase || !scope?.jenjang) return 0;
  if (!scope?.createdAt) return 0;
  const cutoff = new Date(
    new Date(scope.createdAt).getTime() - 30_000
  ).toISOString();
  const { data, error } = await window.supabaseClient
    .from('atp_induk')
    .update({ status: 'arsip' })
    .eq('status', 'draft')
    .eq('mapel', scope.mapel)
    .eq('fase', scope.fase)
    .eq('jenjang', scope.jenjang)
    .neq('id', currentAtpId)
    .lt('created_at', cutoff)
    .select('id');
  if (error) throw error;
  return (data || []).length;
}

async function fetchAllModulAktifGuru() {
  const { data, error } = await window.supabaseClient
    .from('modul_induk')
    .select('id, atp_induk_id, nomor_tp, tp_judul, updated_at, atp_induk(mapel, fase)')
    .eq('status', 'aktif')
    .order('updated_at', { ascending: false })
    .limit(10);
  if (error) throw error;
  return data || [];
}

async function updateProgramKeahlianRpc(classroomId, programKeahlian, bidangKeahlian = null) {
  const { error } = await window.supabaseClient.rpc('fn_update_program_keahlian', {
    p_classroom_id:     classroomId,
    p_program_keahlian: programKeahlian,
    p_bidang_keahlian:  bidangKeahlian,
  });
  if (error) throw error;
}

async function fetchModulAktifByAtpId(atpIndukId) {
  if (!atpIndukId) return [];
  const { data, error } = await window.supabaseClient
    .from('modul_induk')
    .select('id, atp_induk_id, nomor_tp, tp_judul, konten, status, updated_at')
    .eq('atp_induk_id', atpIndukId)
    .eq('status', 'aktif')
    .order('nomor_tp');
  if (error) throw error;
  return data || [];
}
