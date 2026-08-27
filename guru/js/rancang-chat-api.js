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
    .select('id, guru_id, collected_data, updated_at')
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
