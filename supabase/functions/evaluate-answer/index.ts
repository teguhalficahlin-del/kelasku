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

type QuestionOption = { value: string; label: string };
type QuestionSpec = {
  kind: 'teks_bebas' | 'pilihan' | 'pilihan_jamak';
  helpText?: string;
  prompt: string;
  options?: QuestionOption[];
  constraints?: { maxSelections?: number; exclusive?: string[] };
};

function extractAiJson(rawText: string): Record<string, unknown> {
  const jsonMatch = rawText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('No JSON in response');
  return JSON.parse(jsonMatch[0]);
}

function validateRecommendation(
  rawValue: unknown,
  questionSpec: QuestionSpec,
  validOptions: QuestionOption[],
): { value: string | string[]; labels: string | string[]; usedFallback: boolean } {
  const allowed = new Map(validOptions.map(option => [option.value, option]));
  const fallback = validOptions[0];

  if (questionSpec.kind === 'pilihan') {
    const value = typeof rawValue === 'string' && allowed.has(rawValue)
      ? rawValue : fallback.value;
    return { value, labels: allowed.get(value)!.label, usedFallback: value !== rawValue };
  }

  const proposed = Array.isArray(rawValue) ? rawValue : [];
  const allValid = proposed.length > 0 && proposed.every(value =>
    typeof value === 'string' && allowed.has(value)
  );
  let values = allValid ? [...new Set(proposed as string[])] : [fallback.value];
  const maxSelections = Math.max(1, questionSpec.constraints?.maxSelections ?? values.length);
  values = values.slice(0, maxSelections);

  const exclusive = new Set(questionSpec.constraints?.exclusive ?? []);
  const exclusiveValue = values.find(value => exclusive.has(value));
  if (exclusiveValue && values.length > 1) values = [exclusiveValue];

  return {
    value: values,
    labels: values.map(value => allowed.get(value)!.label),
    usedFallback: !allValid,
  };
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
  // fn_check_rate_limit hanya di-grant ke service_role — gunakan serviceClient
  // khusus di sini; jangan pakai untuk operasi lain.

  try {
    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    const { data: allowed, error: rlErr } = await serviceClient.rpc('fn_check_rate_limit', {
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
    mode?: 'evaluation' | 'recommendation';
    classroom_id?: string;
    question_id?: string;
    raw_answer?: string;
    question_spec?: QuestionSpec;
    context?: { session_phase: string; collected_answers: Record<string, unknown> };
  };

  try {
    body = await req.json();
  } catch {
    return json({ error: 'Request tidak lengkap.' }, 400);
  }

  const { classroom_id, question_id, raw_answer, question_spec, context } = body;
  const mode = body.mode ?? 'evaluation';

  if (!classroom_id || !question_id || !question_spec?.kind ||
      !['evaluation', 'recommendation'].includes(mode)) {
    return json({ error: 'Request tidak lengkap.' }, 400);
  }

  if (mode === 'evaluation' && !raw_answer) {
    return json({ error: 'Request tidak lengkap.' }, 400);
  }

  if (mode === 'recommendation') {
    if (!['pilihan', 'pilihan_jamak'].includes(question_spec.kind)) {
      return json({ error: 'Mode recommendation hanya mendukung pilihan dan pilihan_jamak.' }, 400);
    }

    const validOptions = (question_spec.options ?? []).filter(option =>
      option?.value && option?.label && option.value !== 'rekomendasi'
    );
    if (!validOptions.length) {
      return json({ error: 'Mode recommendation memerlukan options yang valid.' }, 400);
    }

    const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!apiKey) return json({ error: 'Konfigurasi server tidak lengkap.' }, 500);

    const maxSelections = question_spec.kind === 'pilihan_jamak'
      ? Math.max(1, question_spec.constraints?.maxSelections ?? validOptions.length)
      : 1;
    const optionText = validOptions
      .map(option => `- ${option.value}: ${option.label}`)
      .join('\n');
    const valueShape = question_spec.kind === 'pilihan_jamak'
      ? `array value, maksimal ${maxSelections} pilihan`
      : 'satu value string';
    const systemPrompt =
      'Kamu adalah pemberi rekomendasi perancangan pembelajaran untuk guru Indonesia.\n' +
      'Pilih HANYA value dari daftar opsi yang diberikan. Jangan membuat value baru.\n' +
      `Field value wajib berupa ${valueShape}.\n` +
      'Value yang tercantum dalam constraint exclusive tidak boleh digabungkan dengan value lain.\n' +
      'Berikan alasan singkat dan konkret dalam Bahasa Indonesia.\n' +
      'Kembalikan HANYA JSON ketat dengan format: ' +
      '{ "value": string|string[], "reason": string, "message": string }.';
    const userMessage =
      `Pertanyaan: ${question_spec.prompt}\n` +
      `Konteks pertanyaan: ${question_spec.helpText ?? '-'}\n` +
      `Opsi valid:\n${optionText}\n` +
      `Constraint exclusive: ${JSON.stringify(question_spec.constraints?.exclusive ?? [])}\n` +
      `Jawaban funnel sebelumnya: ${JSON.stringify(context?.collected_answers ?? {})}`;

    let aiResult: Record<string, unknown> = {};
    let aiFailed = false;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10_000);
      try {
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
        if (!res.ok) throw new Error(`Anthropic HTTP ${res.status}`);
        const anthropicBody = await res.json();
        aiResult = extractAiJson(anthropicBody?.content?.[0]?.text ?? '');
      } finally {
        clearTimeout(timeout);
      }
    } catch (e) {
      aiFailed = true;
      console.warn('[evaluate-answer] recommendation AI failed; using deterministic fallback:', e);
    }

    const validated = validateRecommendation(aiResult.value, question_spec, validOptions);
    if (validated.usedFallback) {
      console.warn('[evaluate-answer] invalid recommendation value; using first valid option');
    }
    const reason = !aiFailed && !validated.usedFallback &&
        typeof aiResult.reason === 'string' && aiResult.reason.trim()
      ? aiResult.reason.trim()
      : 'Pilihan aman pertama digunakan karena rekomendasi AI tidak dapat divalidasi.';
    const message = !aiFailed && typeof aiResult.message === 'string' && aiResult.message.trim()
      ? aiResult.message.trim()
      : 'Rekomendasi tersedia untuk ditinjau.';

    return json({
      mode: 'recommendation',
      status: 'ACCEPT',
      recommendation: {
        value: validated.value,
        label: validated.labels,
        reason,
      },
      message,
    });
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
    aiResult = extractAiJson(rawText) as unknown as typeof aiResult;

  } catch (e) {
    console.error('[evaluate-answer] AI call failed:', e);
    return json({ error: 'Gagal menghubungi AI. Coba lagi.' }, 502);
  }

  // ── 5. RESPONSE ───────────────────────────────────────────────────────────

  return json({
    mode:            'evaluation',
    status:          aiResult.status          ?? 'ACCEPT',
    normalizedAnswer: aiResult.normalizedAnswer ?? raw_answer,
    message:         aiResult.message          ?? 'Dicatat.',
    suggestions:     aiResult.suggestions      ?? [],
  });
});
