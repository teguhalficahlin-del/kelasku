import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: CORS_HEADERS });
  }

  // ── 1. AUTH ───────────────────────────────────────────────────────────────

  const authHeader = req.headers.get('Authorization') ?? '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  if (!token) return json({ error: 'Unauthorized.' }, 401);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: `Bearer ${token}` } } },
  );

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return json({ error: 'Unauthorized.' }, 401);

  // ── 2. RATE LIMIT ─────────────────────────────────────────────────────────

  try {
    const { data: allowed, error: rlErr } = await supabase.rpc('fn_check_rate_limit', {
      p_user_id: user.id,
      p_action: 'evaluate_answer',
      p_limit: 20,
      p_window_seconds: 60,
    });
    if (!rlErr && allowed === false) {
      return json({ error: 'Terlalu banyak permintaan. Coba lagi nanti.' }, 429);
    }
    if (rlErr) console.warn('[evaluate-answer] rate limit RPC error (ignored):', rlErr.message);
  } catch (e) {
    console.warn('[evaluate-answer] rate limit exception (ignored):', e);
  }

  // ── 3. REQUEST BODY ───────────────────────────────────────────────────────

  let body: {
    classroom_id?: string;
    question_id?: string;
    raw_answer?: string;
    question_spec?: { kind: string; helpText?: string; prompt: string };
    context?: { session_phase: string; collected_answers: Record<string, unknown> };
  };

  try {
    body = await req.json();
  } catch {
    return json({ error: 'Request tidak lengkap.' }, 400);
  }

  const { classroom_id, question_id, raw_answer, question_spec, context } = body;

  if (!classroom_id || !question_id || !raw_answer || !question_spec?.kind) {
    return json({ error: 'Request tidak lengkap.' }, 400);
  }

  // ── 4. EVALUASI (hanya teks_bebas) ────────────────────────────────────────

  if (question_spec.kind !== 'teks_bebas') {
    // Kind lain (pilihan, angka) dievaluasi di klien secara deterministik
    return json({ error: 'Kind ini tidak memerlukan evaluasi AI.' }, 400);
  }

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) return json({ error: 'Konfigurasi server tidak lengkap.' }, 500);

  const systemPrompt =
    'Kamu adalah evaluator jawaban guru Indonesia untuk perancangan pembelajaran.\n' +
    'Evaluasi jawaban berdasarkan pertanyaan yang diberikan.\n' +
    'Kembalikan HANYA JSON dengan format:\n' +
    '{ "status": "ACCEPT"|"CLARIFY"|"REJECT"|"HELP", "normalizedAnswer": string, "message": string, "suggestions": string[] }\n' +
    '- ACCEPT: jawaban valid dan cukup jelas\n' +
    '- CLARIFY: jawaban ada tapi perlu klarifikasi — sertakan suggestions\n' +
    '- REJECT: jawaban tidak relevan sama sekali\n' +
    '- HELP: guru meminta penjelasan (deteksi kata: apa itu, maksudnya, contoh, jelaskan, help, bantuan)\n' +
    '- normalizedAnswer: jawaban yang sudah dinormalisasi (untuk ACCEPT), kosong untuk lainnya\n' +
    '- message: respons singkat dalam Bahasa Indonesia, hangat, tidak menggurui\n' +
    '- suggestions: array string untuk opsi klarifikasi (kosong jika tidak ada)';

  const userMessage =
    `Pertanyaan: ${question_spec.prompt}\n` +
    `Konteks pertanyaan: ${question_spec.helpText ?? '-'}\n` +
    `Jawaban guru: ${raw_answer}`;

  let aiResult: { status: string; normalizedAnswer: string; message: string; suggestions: string[] };

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 256,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!res.ok) {
      console.error('[evaluate-answer] Anthropic error:', res.status, await res.text());
      return json({ error: 'Gagal menghubungi AI. Coba lagi.' }, 502);
    }

    const anthropicBody = await res.json();
    const rawText: string = anthropicBody?.content?.[0]?.text ?? '';

    // Ekstrak JSON dari respons (model kadang membungkus dengan markdown)
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in response');
    aiResult = JSON.parse(jsonMatch[0]);

  } catch (e) {
    console.error('[evaluate-answer] AI call failed:', e);
    return json({ error: 'Gagal menghubungi AI. Coba lagi.' }, 502);
  }

  // ── 5. RESPONSE ───────────────────────────────────────────────────────────

  return json({
    status:          aiResult.status          ?? 'ACCEPT',
    normalizedAnswer: aiResult.normalizedAnswer ?? raw_answer,
    message:         aiResult.message          ?? 'Dicatat.',
    suggestions:     aiResult.suggestions      ?? [],
  });
});
