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
      },
    }),
  });

  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'evaluate-answer error');
  return json; // { status, normalizedAnswer, message, ... }
}
