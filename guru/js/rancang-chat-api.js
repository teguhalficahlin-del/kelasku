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

async function callGenerateAtp(atpIndukId, expectedUpdatedAt) {
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

async function callGenerateModul(modulIndukId, expectedUpdatedAt) {
  const { data: { session } } = await window.supabaseClient.auth.getSession();
  const token = session?.access_token ?? '';

  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), 110_000);
  try {
    const res = await fetch(GENERATE_MODUL_URL, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        modul_induk_id:      modulIndukId,
        expected_updated_at: expectedUpdatedAt || undefined,
      }),
      signal: controller.signal,
    });
    const responseJson = await res.json();
    if (!res.ok) {
      const err = new Error(responseJson.error || 'generate-modul error');
      err.code      = responseJson.code      || String(res.status);
      err.retryable = responseJson.retryable ?? false;
      throw err;
    }
    return responseJson;
  } finally {
    clearTimeout(tid);
  }
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
