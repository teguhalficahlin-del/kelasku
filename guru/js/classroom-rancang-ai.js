// classroom-rancang-ai.js
// Tanggung jawab: call Edge Function AI generate-rancang
// Dipanggil dari IIFE di classroom-rancang.js via global scope

'use strict';

const EF_URL = 'https://teccdzetrdjowqemnuuc.supabase.co/functions/v1/generate-rancang';

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
