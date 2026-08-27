'use strict';

// Wrapper panggilan ke Edge Function evaluate-answer
// EF ini belum ada — file ini akan diaktifkan setelah EF terdeploy

const EVAL_URL = 'https://teccdzetrdjowqemnuuc.supabase.co/functions/v1/evaluate-answer';

async function callEvaluateAnswer(questionId, rawAnswer, questionSpec, context) {
  const { data: { session } } = await window.supabaseClient.auth.getSession();
  const token = session?.access_token ?? '';

  const res = await fetch(EVAL_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      classroom_id:   context.classroom_id,
      question_id:    questionId,
      raw_answer:     rawAnswer,
      question_spec:  questionSpec,
      context: {
        session_phase:     context.session_phase,
        collected_answers: context.collected_answers,
        mode:              context.mode || 'evaluation',
      },
    }),
  });

  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'evaluate-answer error');
  return json; // { status, normalizedAnswer, message, ... }
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
