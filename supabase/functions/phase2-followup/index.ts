// Phase 2: Follow-Up generation — pengayaan, penguatan, pendampingan.
// Gate: fn_phase2c_all_meetings_usable must be true before any action.
// Template: phase2-meeting/index.ts structural pattern.

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  // Dibaca dari environment supaya satu `supabase secrets set ALLOWED_ORIGIN=...`
  // berlaku untuk keempat belas Edge Function sekaligus -- tidak perlu menyunting
  // dan men-deploy ulang satu per satu saat MiClass pindah domain. Fallback-nya
  // adalah nilai yang sebelumnya tertanam di sini, jadi env yang belum diset
  // berarti perilaku lama -- bukan CORS yang rusak.
  'Access-Control-Allow-Origin':
    Deno.env.get('ALLOWED_ORIGIN') ?? 'https://teguhalficahlin-del.github.io',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const LOCKED_ROLES = new Set([
  'WALI_KELAS','GURU_MAPEL_SDSMP_SMA','GURU_MAPEL_UMUM_SMK','GURU_MAPEL_PRODUKTIF_SMK',
]);
// Gate Tab Rancang -- dua syarat dan keduanya wajib: peran mengajar
// GURU_MAPEL_UMUM_SMK dan tier GURU_PRO. Set peran di atas sengaja dibiarkan
// utuh; ia disiapkan untuk Rancang V2, dan gate ini syarat tambahan di atasnya,
// bukan penggantinya.
const RANCANG_ROLE = 'GURU_MAPEL_UMUM_SMK';
const RANCANG_TIER = 'GURU_PRO';
// Pesan dipisah supaya guru tahu mana yang harus ia urus -- membeli paket, atau
// membetulkan peran mengajar. Satu pesan gabungan membuat guru GURU_PRO yang
// perannya tidak cocok mengira langganannya yang bermasalah.
type RancangProfile = { role?: string | null; role_guru?: string | null; role_locked_at?: string | null; tier?: string | null } | null;
function rancangDenial(p: RancangProfile): string {
  if (!p || p.role !== 'GURU' || !p.role_locked_at) return 'Locked teacher role diperlukan';
  if (p.tier !== RANCANG_TIER) return 'Fitur ini hanya tersedia untuk tier Guru Pro';
  return 'Fitur ini hanya tersedia untuk guru mapel umum SMK';
}
const PROMPT_VERSION = 'phase2-followup-v1.0';
const MODEL          = 'claude-sonnet-4-6';
// Satu panggilan AI per request. Input Follow-Up besar (seluruh konten Meeting
// Plan + Assessment + Context, ~15k token) sehingga 55s terlalu ketat.
const AI_TIMEOUT_MS  = 120_000;

const reply = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: CORS });

// ── Canonical JSON + SHA-256 ──────────────────────────────────────────────────
function canonicalJson(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(',')}]`;
  const r = v as Record<string, unknown>;
  return `{${Object.keys(r).filter(k => r[k] !== undefined).sort()
    .map(k => `${JSON.stringify(k)}:${canonicalJson(r[k])}`).join(',')}}`;
}
async function sha256(v: unknown): Promise<string> {
  const bytes = await crypto.subtle.digest(
    'SHA-256', new TextEncoder().encode(canonicalJson(v))
  );
  return [...new Uint8Array(bytes)].map(x => x.toString(16).padStart(2,'0')).join('');
}

async function callAI(systemPrompt: string, userPrompt: string): Promise<string> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY tidak tersedia');
  // 1, bukan 3: tiga percobaan x AI_TIMEOUT_MS menembus wall clock Edge
  // Function dan berujung 546/409 tanpa pesan berguna. Retry jadi keputusan
  // guru lewat tombol Coba Lagi, bukan diulang diam-diam di server.
  const MAX_ATTEMPTS = 1;
  let lastErr: Error = new Error('Tidak ada attempt');
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 8192,
          system: systemPrompt,
          messages: [{ role: 'user', content: userPrompt }],
        }),
      });
      if (!res.ok) {
        const t = await res.text().catch(() => '');
        const err = new Error(`AI ${res.status}: ${t}`);
        // 4xx: tidak retry
        if (res.status >= 400 && res.status < 500) throw err;
        lastErr = err;
        if (attempt < MAX_ATTEMPTS) {
          await new Promise(r => setTimeout(r, 400 * attempt));
          continue;
        }
        throw lastErr;
      }
      const d = await res.json();
      return d?.content?.[0]?.text ?? '';
    } catch (err) {
      clearTimeout(timer);
      // AbortError / network: retry kecuali attempt terakhir
      if (attempt < MAX_ATTEMPTS && !(err instanceof Error && err.message.startsWith('AI 4'))) {
        lastErr = err as Error;
        await new Promise(r => setTimeout(r, 400 * attempt));
        continue;
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr;
}

function extractJson(raw: string): unknown {
  let s = raw.trim();

  // Remove markdown fences
  const fenceMatch = s.match(/```(?:json)?\s*([\s\S]*?)```/s);
  if (fenceMatch) s = fenceMatch[1].trim();

  // Try direct parse
  try { return JSON.parse(s); } catch (_) {}

  // Find JSON object: first { to last }
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start !== -1 && end > start) {
    try { return JSON.parse(s.slice(start, end + 1)); } catch (_) {}
  }

  // Find JSON array: first [ to last ]
  const arrStart = s.indexOf('[');
  const arrEnd = s.lastIndexOf(']');
  if (arrStart !== -1 && arrEnd > arrStart) {
    try { return JSON.parse(s.slice(arrStart, arrEnd + 1)); } catch (_) {}
  }

  // Log raw output for debugging
  console.error('[extractJson] FAILED to parse. Raw preview:',
    JSON.stringify(s.slice(0, 200)),
    '...TAIL:',
    JSON.stringify(s.slice(-100))
  );

  throw new Error('Output AI tidak dapat diparsing sebagai JSON');
}

// -----------------------------------------------------------------------------
// Normalisasi konten FOLLOW_UP sebelum validasi.
// Validator mewajibkan pengayaan/penguatan/pendampingan berupa OBJECT berisi
// target, gap_addressed, dan activities[]. AI kerap membalas array activities
// langsung (atau string) untuk ketiga jalur itu, sehingga muncul MISSING_JALUR
// "<jalur> wajib ada dan berupa object". Bentuk yang salah dibungkus di sini.
//
// kktp_refs divalidasi di ROOT, bukan per jalur. Bila AI tidak mengisinya,
// diisi dari ID KKTP nyata milik Assessment Spec - bukan konstanta karangan,
// supaya rujukannya tidak menggantung.
//
// TIDAK dikarang server: activities. Bila kosong, validator tetap menolak
// dengan MISSING_ACTIVITIES - itu konten nyata yang harus datang dari AI.
// -----------------------------------------------------------------------------
function normalizeFollowUpContent(
  raw: unknown,
  assessmentContent: Record<string, unknown>,
): Record<string, unknown> {
  const c: Record<string, unknown> =
    (raw && typeof raw === 'object' && !Array.isArray(raw))
      ? { ...(raw as Record<string, unknown>) }
      : {};

  const wrapJalur = (val: unknown, target: string): Record<string, unknown> => {
    // AI membalas array activities langsung, bukan object jalur
    if (Array.isArray(val)) return { target, gap_addressed: '', activities: val };
    if (val && typeof val === 'object') {
      const o = { ...(val as Record<string, unknown>) };
      if (typeof o.target !== 'string' || !o.target.trim()) o.target = target;
      if (typeof o.gap_addressed !== 'string') o.gap_addressed = '';
      if (!Array.isArray(o.activities)) o.activities = [];
      return o;
    }
    // string / angka / null / undefined
    return { target, gap_addressed: '', activities: [] };
  };

  c.pengayaan    = wrapJalur(c.pengayaan,    'Siswa yang sudah mencapai seluruh KKTP');
  c.penguatan    = wrapJalur(c.penguatan,    'Siswa yang mendekati KKTP');
  c.pendampingan = wrapJalur(c.pendampingan, 'Siswa yang masih jauh dari KKTP');

  if (!Array.isArray(c.kktp_refs) || c.kktp_refs.length === 0) {
    const ids = ((assessmentContent.kktp as Array<Record<string,unknown>>) ?? [])
      .map((k, i) => String(k.id ?? `KKTP-${String(i + 1).padStart(2, '0')}`))
      .filter(s => s.trim() !== '');
    c.kktp_refs = ids.length ? ids : ['KKTP-01'];
  }

  return c;
}


const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function isValidUuidV4(s: string): boolean { return UUID_RE.test(s); }

async function makeIdempotencyKey(prefix: string, ...parts: unknown[]): Promise<string> {
  return prefix + ':' + await sha256(parts);
}

async function makeRegenKey(
  prefix: string, profileId: string, artifactKind: string,
  planningContextId: string, sourceHash: string, depHash: string,
  clientOperationId: string,
): Promise<string> {
  return prefix + ':' + await sha256({ profileId, artifactKind, planningContextId, sourceHash, depHash, clientOperationId });
}

// Verifikasi bahwa version_id berasal dari planningContextId + profileId + expectedKind yang sudah diotorisasi.
async function verifyVersionBinding(
  admin: SupabaseClient<any>,
  versionId: string,
  profileId: string,
  planningContextId: string,
  expectedKind: string,
): Promise<boolean> {
  const { data: versionCheck } = await admin
    .from('rancang_artifact_versions')
    .select('id, artifact_id')
    .eq('id', versionId)
    .eq('profile_id', profileId)
    .eq('planning_context_id', planningContextId)
    .maybeSingle();
  if (!versionCheck) return false;
  const { data: artifactCheck } = await admin
    .from('rancang_artifacts')
    .select('id')
    .eq('id', versionCheck.artifact_id)
    .eq('artifact_kind', expectedKind)
    .maybeSingle();
  return !!artifactCheck;
}

// ── Load selected artifact version ─────────────────────────────────────────
type ArtifactVersion = {
  id: string; content: Record<string,unknown>;
  artifact_id: string; selection_revision: number;
};

async function loadArtifactContent(
  admin: SupabaseClient<any>,
  planningContextId: string,
  profileId: string,
  kind: string,
  scopeKey = 'ROOT',
): Promise<ArtifactVersion | null> {
  const { data: a } = await admin.from('rancang_artifacts')
    .select('id').eq('planning_context_id', planningContextId)
    .eq('artifact_kind', kind).eq('profile_id', profileId)
    .eq('scope_key', scopeKey).maybeSingle();
  if (!a) return null;
  const { data: sel } = await admin.from('rancang_artifact_selections')
    .select('selected_version_id,selection_revision').eq('artifact_id', a.id).maybeSingle();
  if (!sel) return null;
  const { data: ver } = await admin.from('rancang_artifact_versions')
    .select('id,content').eq('id', sel.selected_version_id).maybeSingle();
  if (!ver) return null;
  return { id: ver.id, content: ver.content as Record<string,unknown>,
           artifact_id: a.id, selection_revision: sel.selection_revision };
}

// ── Follow-Up prompt ─────────────────────────────────────────────────────────
function buildFollowUpPrompt(
  authority: Record<string, unknown>,
  assessmentContent: Record<string, unknown>,
  meetingContents: Array<{ meeting_no: number; content: Record<string,unknown> }>,
  contextContent: Record<string, unknown>,
): string {
  const cls         = (authority.class_context as Record<string,unknown>) ?? {};
  const facilities  = (cls.fasilitas_tersedia as string[]) ?? [];
  const forbidden   = (cls.aktivitas_dilarang as string[]) ?? [];
  const kktp        = (assessmentContent.kktp as Array<Record<string,unknown>>) ?? [];
  const constraints = (contextContent.constraints as string[]) ?? [];

  // Summarize differentiation patterns from all meetings
  const diffSummary = meetingContents.map(m => {
    const diff = m.content.differentiation as Record<string, Record<string,string>> ?? {};
    return `Pertemuan ${m.meeting_no}:\n` +
      `  Paham: ${diff.paham?.aktivitas ?? '-'}\n` +
      `  Hampir: ${diff.hampir?.aktivitas ?? '-'}\n` +
      `  Belum: ${diff.belum?.aktivitas ?? '-'}`;
  }).join('\n');

  return `TP: ${authority.tp_judul}
Deskripsi TP: ${authority.tp_deskripsi}
Jenjang: ${authority.jenjang} | Mapel: ${authority.mapel}

KKTP (Kriteria Ketuntasan Tujuan Pembelajaran):
${kktp.map((k, i) =>
  `${i+1}. [${k.id ?? 'KKTP-'+String(i+1).padStart(2,'0')}] ${k.deskripsi}\n   Paham: ${k.paham}\n   Hampir: ${k.hampir}\n   Belum: ${k.belum}`
).join('\n')}

POLA DIFERENSIASI DARI SEMUA PERTEMUAN (gunakan sebagai referensi konsistensi):
${diffSummary || '(tidak tersedia)'}

CONSTRAINTS KELAS:
Fasilitas tersedia: ${facilities.length ? facilities.join(', ') : 'tidak dispesifikasi'}
Aktivitas dihindari: ${forbidden.length ? forbidden.join(', ') : 'tidak ada'}
Constraints tambahan: ${constraints.join(', ') || 'tidak ada'}

INSTRUKSI TINDAK LANJUT:
Rancang tindak lanjut SETELAH seluruh rangkaian pertemuan selesai.
Bagi menjadi 3 jalur berdasarkan posisi siswa terhadap KKTP:
- pengayaan: siswa yang sudah mencapai seluruh KKTP
- penguatan: siswa yang mendekati KKTP (kategori "hampir")
- pendampingan: siswa yang masih jauh dari KKTP (kategori "belum")

Ketiga jalur (pengayaan, penguatan, pendampingan) HARUS berupa OBJECT di root
JSON - BUKAN array, BUKAN string. Masing-masing berisi:
- target: deskripsi singkat target siswa
- gap_addressed: gap konkret yang ditangani (mengacu pada KKTP spesifik)
- activities: array, minimal 1 activity, tiap activity punya:
  - id: format FU-E01/FU-R01/FU-S01 dst (E=pengayaan, R=penguatan, S=pendampingan)
  - deskripsi: aktivitas konkret dan spesifik (MINIMAL 30 karakter, bukan kalimat generik)
  - durasi_estimasi: estimasi waktu (contoh: "2 x pertemuan", "1 jam mandiri")
  - resource_refs: array string referensi resource (boleh kosong array)

kktp_refs berada di ROOT JSON (bukan di dalam tiap jalur), berisi array ID KKTP
yang dirujuk - gunakan ID dari daftar KKTP di atas, minimal 1 item.

BENTUK OUTPUT (isi dengan konten nyata, jangan salin teks contoh):
{
  "pengayaan": {
    "target": "Siswa yang sudah mencapai seluruh KKTP",
    "gap_addressed": "string",
    "activities": [{"id":"FU-E01","deskripsi":"string","durasi_estimasi":"string","resource_refs":[]}]
  },
  "penguatan": {
    "target": "Siswa yang mendekati KKTP",
    "gap_addressed": "string",
    "activities": [{"id":"FU-R01","deskripsi":"string","durasi_estimasi":"string","resource_refs":[]}]
  },
  "pendampingan": {
    "target": "Siswa yang masih jauh dari KKTP",
    "gap_addressed": "string",
    "activities": [{"id":"FU-S01","deskripsi":"string","durasi_estimasi":"string","resource_refs":[]}]
  },
  "kktp_refs": ["KKTP-01"]
}

PENTING: deskripsi activity HARUS konkret dan menunjuk gap spesifik dari KKTP.
Hindari kalimat generik seperti "beri soal lebih sulit" atau "beri bimbingan tambahan".

Output JSON murni — schema wajib sesuai kontrak follow_up. Tanpa markdown fence, tanpa teks tambahan.`;
}

// ── Transition + accept helper ───────────────────────────────────────────────
async function transitionAndAccept(
  admin: SupabaseClient<any>,
  profileId: string,
  vId: string,
  validation: unknown,
  selectionRevision: number,
  autoAccept: boolean,
  transKey: string,
  validateKey: string,
  acceptKey?: string,
) {
  await admin.rpc('fn_phase2b_transition_version', {
    p_profile_id: profileId, p_version_id: vId,
    p_action: 'GENERATED', p_validation_status: 'VALID',
    p_validation_summary: validation,
    p_reason: 'Follow-Up generation succeeded',
    p_idempotency_key: await makeIdempotencyKey(transKey, vId),
  });
  await admin.rpc('fn_phase2b_transition_version', {
    p_profile_id: profileId, p_version_id: vId,
    p_action: 'VALIDATE', p_validation_status: 'VALID',
    p_validation_summary: validation, p_reason: null,
    p_idempotency_key: await makeIdempotencyKey(validateKey, vId),
  });
  if (autoAccept && acceptKey) {
    await admin.rpc('fn_phase2b_decide_candidate', {
      p_profile_id: profileId, p_version_id: vId,
      p_decision: 'ACCEPT',
      p_expected_selection_revision: selectionRevision,
      p_idempotency_key: await makeIdempotencyKey(acceptKey, vId),
    });
  }
}

// ── Main handler ──────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return reply({ error: 'Method tidak diizinkan' }, 405);

  const auth = req.headers.get('Authorization') ?? '';
  if (!auth.startsWith('Bearer ')) return reply({ error: 'Unauthorized' }, 401);
  const token = auth.slice(7);

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  // 1. Verify JWT identity
  const { data: { user } } = await admin.auth.getUser(token);
  if (!user) return reply({ error: 'Unauthorized' }, 401);

  // 2. Verify locked teacher role
  const { data: profile } = await admin.from('profiles')
    .select('id,role,role_guru,role_locked_at,tier').eq('user_id', user.id).single();
  if (!profile || profile.role !== 'GURU' || !profile.role_locked_at
      || !LOCKED_ROLES.has(profile.role_guru)
      || profile.role_guru !== RANCANG_ROLE || profile.tier !== RANCANG_TIER)
    return reply({ error: rancangDenial(profile) }, 403);

  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return reply({ error: 'Payload tidak valid' }, 400); }

  const action            = String(body.action ?? '');
  const classroomId       = String(body.classroom_id ?? '');
  const teachingContextId = String(body.teaching_context_id ?? '');
  const planningContextId = String(body.planning_context_id ?? '');

  try {
    // 3. Verify classroom ownership
    const { data: classroom } = await admin.from('classrooms').select('id,teacher_id')
      .eq('id', classroomId).maybeSingle();
    if (!classroom || classroom.teacher_id !== profile.id)
      return reply({ error: 'Classroom tidak diizinkan' }, 403);

    // 4. Verify teaching context + binding
    const { data: context } = await admin.from('teaching_contexts')
      .select('id,jenjang,subject_key,phase_key')
      .eq('id', teachingContextId).eq('profile_id', profile.id)
      .eq('status', 'ACTIVE').maybeSingle();
    const { data: binding } = context
      ? await admin.from('teaching_context_classrooms')
          .select('id').eq('teaching_context_id', context.id)
          .eq('classroom_id', classroomId).eq('status', 'ACTIVE').maybeSingle()
      : { data: null };
    if (!context || !binding) return reply({ error: 'Teaching Context tidak diizinkan' }, 403);

    // 5. Load planning context
    const { data: pc } = await admin.from('rancang_planning_contexts')
      .select('*').eq('id', planningContextId).eq('profile_id', profile.id)
      .eq('teaching_context_id', context.id).eq('classroom_id', classroomId).maybeSingle();
    if (!pc) return reply({ error: 'Planning Context tidak diizinkan' }, 403);

    // 6. Load TP revision
    const { data: tpRevision } = await admin.from('rancang_tp_revisions')
      .select('id,judul,deskripsi,semester,estimasi_jp,raw_element_value')
      .eq('id', pc.selected_tp_revision_id).maybeSingle();
    if (!tpRevision) return reply({ error: 'TP revision tidak valid' }, 409);

    // 7. Gate: all meetings must be usable
    const { data: allMeetingsOk } = await admin.rpc('fn_phase2c_all_meetings_usable', {
      p_profile_id: profile.id, p_planning_context_id: planningContextId,
    });

    const authority: Record<string, unknown> = {
      jenjang:        context.jenjang,
      mapel:          context.subject_key,
      fase:           context.phase_key,
      tp_judul:       tpRevision.judul,
      tp_deskripsi:   tpRevision.deskripsi,
      tp_id:          pc.tp_id,
      tp_revision_id: tpRevision.id,
      elemen_cp:      Array.isArray(tpRevision.raw_element_value) ? tpRevision.raw_element_value : [],
      class_context:  pc.class_context_snapshot,
      smk_context:    pc.smk_context_snapshot,
    };

    const SYSTEM_PROMPT =
      'Anda adalah perancang pembelajaran.\n' +
      'Hanya keluarkan JSON valid tanpa teks tambahan, tanpa markdown fence.';

    // ── ACTION: generate_follow_up ──────────────────────────────────────────
    if (action === 'generate_follow_up') {
      if (!allMeetingsOk)
        return reply({ error: 'Semua pertemuan harus usable sebelum generate Follow-Up' }, 409);

      const ctxVer = await loadArtifactContent(admin, planningContextId, profile.id, 'CONTEXT_SPEC');
      const asmVer = await loadArtifactContent(admin, planningContextId, profile.id, 'ASSESSMENT_SPEC');
      if (!ctxVer || !asmVer)
        return reply({ error: 'Context Spec / Assessment Spec belum tersedia' }, 409);

      // Load all meeting_plan contents sorted by meeting_no
      const { data: allocItems } = await admin.from('rancang_meeting_allocations')
        .select('id').eq('planning_context_id', planningContextId).is('superseded_at', null)
        .maybeSingle().then(async ({ data: alloc }) => {
          if (!alloc) return { data: [] };
          return admin.from('rancang_meeting_allocation_items')
            .select('id,meeting_no').eq('meeting_allocation_id', alloc.id)
            .order('meeting_no');
        });

      const meetingContents: Array<{ meeting_no: number; content: Record<string,unknown>; version_id: string }> = [];
      const meetingVersionIds: string[] = [];

      for (const item of (allocItems ?? [])) {
        const { data: a } = await admin.from('rancang_artifacts')
          .select('id').eq('planning_context_id', planningContextId)
          .eq('artifact_kind', 'MEETING_PLAN').eq('profile_id', profile.id)
          .eq('scope_key', `MEETING_${item.meeting_no}`).maybeSingle();
        if (!a) continue;
        const { data: sel } = await admin.from('rancang_artifact_selections')
          .select('selected_version_id').eq('artifact_id', a.id).maybeSingle();
        if (!sel) continue;
        const { data: ver } = await admin.from('rancang_artifact_versions')
          .select('id,content').eq('id', sel.selected_version_id).maybeSingle();
        if (!ver) continue;
        meetingContents.push({ meeting_no: item.meeting_no, content: ver.content as Record<string,unknown>, version_id: ver.id });
        meetingVersionIds.push(ver.id);
      }

      // Check for existing FOLLOW_UP artifact — determine if this is initial or regenerate
      const { data: fuArtifact } = await admin.from('rancang_artifacts')
        .select('id').eq('planning_context_id', planningContextId)
        .eq('artifact_kind', 'FOLLOW_UP').eq('profile_id', profile.id)
        .eq('scope_key', 'ROOT').maybeSingle();

      const isRegenerate = !!fuArtifact;

      if (isRegenerate) {
        // Regenerate limit: max 1x
        const { count: regenCount } = await admin.from('rancang_artifact_versions')
          .select('id', { count: 'exact', head: true })
          .eq('artifact_id', fuArtifact.id)
          .not('candidate_of_version_id', 'is', null);
        if ((regenCount ?? 0) >= 1)
          // Status 200: guru/js/api.js menjalankan `if (error) throw error` sebelum
          // membaca `data.error`, sehingga 409 sampai ke UI sebagai 'Edge Function
          // returned a non-2xx status code' dan guru tidak pernah tahu sebabnya.
          return reply({ error: 'Batas regenerate Follow-Up sudah tercapai. Pilih kandidat yang ada atau gunakan Edit manual.' });
      }

      // Regenerate requires client_operation_id to ensure stable idempotency key per intent
      let clientOpId = '';
      if (isRegenerate) {
        clientOpId = String(body.client_operation_id ?? '');
        if (!isValidUuidV4(clientOpId))
          return reply({ error: 'client_operation_id harus UUID v4 yang valid' }, 400);
      }

      const sortedVersionIds = [...meetingVersionIds].sort();
      const sourceHash = await sha256({
        kind: 'FOLLOW_UP',
        planning_context_id: planningContextId,
        tp_revision_id: tpRevision.id,
        assessment_version_id: asmVer.id,
        meeting_plan_version_ids: sortedVersionIds,
      });
      const depHash = await sha256({
        assessment_version_id: asmVer.id,
        meeting_plan_version_ids: sortedVersionIds,
      });
      const idempotencyKey = isRegenerate
        ? await makeRegenKey('fu_regen', profile.id, 'FOLLOW_UP', planningContextId, sourceHash, depHash, clientOpId)
        : await makeIdempotencyKey('fu_gen', planningContextId, sourceHash, 'initial');

      const deps: Record<string,unknown>[] = [
        { kind: 'PLANNING_CONTEXT',  planning_context_id: planningContextId,  hash: await sha256({ id: planningContextId }) },
        { kind: 'TP_REVISION',       tp_revision_id:      tpRevision.id,       hash: await sha256({ id: tpRevision.id }) },
        { kind: 'ARTIFACT_VERSION',  artifact_version_id: asmVer.id,           hash: await sha256({ id: asmVer.id }) },
        ...sortedVersionIds.map(vid => ({
          kind: 'ARTIFACT_VERSION', artifact_version_id: vid, hash: sha256({ id: vid }),
        })),
      ];

      // Resolve hash promises
      for (const d of deps) {
        if (d.hash instanceof Promise) (d as Record<string,unknown>).hash = await d.hash;
      }

      const raw = await callAI(SYSTEM_PROMPT, buildFollowUpPrompt(
        authority, asmVer.content, meetingContents, ctxVer.content
      ));
      let content: unknown;
      try { content = normalizeFollowUpContent(extractJson(raw), asmVer.content); }
      catch (e) {
        const m = e instanceof Error ? e.message : 'Error tidak diketahui';
        return reply({ error: `Output AI Follow-Up tidak dapat diparsing: ${m}` });
      }

      const { data: validation } = await admin.rpc('fn_phase2_validate_follow_up', {
        p_content: content,
      });
      if (validation?.status !== 'valid') {
        const viols = (validation?.violations as Array<Record<string,unknown>>) ?? [];
        const brief = viols.slice(0, 3).map(v => `• ${v.message}`).join('\n');
        const more  = viols.length > 3 ? `\n(+${viols.length - 3} pelanggaran lain)` : '';
        return reply({
          error: `Output AI Follow-Up tidak memenuhi schema:\n${brief}${more}`,
          violations: viols,
        });
      }

      const { data: fuSel } = fuArtifact
        ? await admin.from('rancang_artifact_selections')
            .select('selected_version_id,selection_revision').eq('artifact_id', fuArtifact.id).maybeSingle()
        : { data: null };

      const { data: createResult, error: createError } = await admin.rpc('fn_phase2b_create_version', {
        p_profile_id: profile.id, p_planning_context_id: planningContextId,
        p_artifact_kind: 'FOLLOW_UP',
        p_scope_key: 'ROOT',
        p_meeting_allocation_item_id: null,
        p_parent_version_id: null,
        p_candidate_of_version_id: isRegenerate ? (fuSel?.selected_version_id ?? null) : null,
        p_origin: 'AI', p_teacher_edited: false,
        p_content: content, p_source_snapshot: authority,
        p_source_hash: sourceHash, p_dependency_hash: depHash,
        p_prompt_version: PROMPT_VERSION, p_model_version: MODEL,
        p_dependencies: deps, p_idempotency_key: idempotencyKey,
      });
      if (createError) throw createError;

      if (!createResult.idempotent) {
        const autoAccept = !isRegenerate;
        await transitionAndAccept(
          admin, profile.id, createResult.version_id, validation,
          fuSel?.selection_revision ?? 0,
          autoAccept,
          'fu_gen_transition', 'fu_gen_validate',
          autoAccept ? 'fu_gen_autoselect' : undefined,
        );
      }

      const { data: state } = await admin.rpc('fn_phase2c_get_pipeline_state', {
        p_profile_id: profile.id, p_planning_context_id: planningContextId,
      });
      return reply({ result: state });
    }

    // ── ACTION: save_follow_up_edit ─────────────────────────────────────────
    if (action === 'save_follow_up_edit') {
      const editedContent = body.content;
      if (!editedContent) return reply({ error: 'Content edit tidak boleh kosong' }, 400);

      const { data: validation } = await admin.rpc('fn_phase2_validate_follow_up', {
        p_content: editedContent,
      });
      if (validation?.status !== 'valid')
        return reply({ error: 'Edit tidak memenuhi schema', violations: validation?.violations }, 400);

      const { data: fuArtifact } = await admin.from('rancang_artifacts')
        .select('id').eq('planning_context_id', planningContextId)
        .eq('artifact_kind', 'FOLLOW_UP').eq('profile_id', profile.id)
        .eq('scope_key', 'ROOT').maybeSingle();
      if (!fuArtifact) return reply({ error: 'Follow-Up belum ada — generate dulu' }, 409);

      const { data: sel } = await admin.from('rancang_artifact_selections')
        .select('selected_version_id,selection_revision').eq('artifact_id', fuArtifact.id).maybeSingle();

      const asmVer = await loadArtifactContent(admin, planningContextId, profile.id, 'ASSESSMENT_SPEC');
      if (!asmVer) return reply({ error: 'Assessment Spec belum tersedia' }, 409);

      const sourceHash = await sha256({
        kind: 'FOLLOW_UP_EDIT', content: editedContent,
        planning_context_id: planningContextId,
      });
      const depHash = await sha256({ assessment_version_id: asmVer.id });
      const idempotencyKey = await makeIdempotencyKey('fu_edit', planningContextId, sourceHash);

      const { data: createResult, error: createError } = await admin.rpc('fn_phase2b_create_version', {
        p_profile_id: profile.id, p_planning_context_id: planningContextId,
        p_artifact_kind: 'FOLLOW_UP',
        p_scope_key: 'ROOT',
        p_meeting_allocation_item_id: null,
        p_parent_version_id: sel?.selected_version_id ?? null,
        p_candidate_of_version_id: null,
        p_origin: 'TEACHER', p_teacher_edited: true,
        p_content: editedContent, p_source_snapshot: authority,
        p_source_hash: sourceHash, p_dependency_hash: depHash,
        p_prompt_version: null, p_model_version: null,
        p_dependencies: [], p_idempotency_key: idempotencyKey,
      });
      if (createError) throw createError;

      if (!createResult.idempotent) {
        await transitionAndAccept(
          admin, profile.id, createResult.version_id, validation,
          sel?.selection_revision ?? 0, true,
          'fu_edit_transition', 'fu_edit_validate', 'fu_edit_select',
        );

        // Invalidate VALIDATION_REPORT that depends on old follow_up version
        if (sel?.selected_version_id) {
          await admin.rpc('fn_phase2b_invalidate_dependants', {
            p_profile_id: profile.id,
            p_dependency_kind: 'ARTIFACT_VERSION',
            p_dependency_id:   sel.selected_version_id,
            p_dependency_hash: await sha256({ id: createResult.version_id }),
            p_reason: 'Follow-Up edited — validation report needs update',
            p_idempotency_prefix: `fu_edit_invalidate:${planningContextId}`,
          });
        }
      }

      const { data: state } = await admin.rpc('fn_phase2c_get_pipeline_state', {
        p_profile_id: profile.id, p_planning_context_id: planningContextId,
      });
      return reply({ result: state });
    }

    // ── ACTION: select_follow_up_candidate ──────────────────────────────────
    if (action === 'select_follow_up_candidate') {
      const versionId        = String(body.version_id ?? '');
      const selectionRevision = Number(body.selection_revision ?? 0);
      if (!isValidUuidV4(versionId))
        return reply({ error: 'version_id tidak valid' }, 400);

      if (!await verifyVersionBinding(admin, versionId, profile.id, planningContextId, 'FOLLOW_UP'))
        return reply({ error: 'Version tidak diizinkan' }, 403);

      const { error: decideErr } = await admin.rpc('fn_phase2b_decide_candidate', {
        p_profile_id: profile.id, p_version_id: versionId,
        p_decision: 'ACCEPT',
        p_expected_selection_revision: selectionRevision,
        p_idempotency_key: await makeIdempotencyKey('fu_select', profile.id, versionId),
      });
      if (decideErr) throw decideErr;

      const { data: state } = await admin.rpc('fn_phase2c_get_pipeline_state', {
        p_profile_id: profile.id, p_planning_context_id: planningContextId,
      });
      return reply({ result: state });
    }

    return reply({ error: 'Action tidak dikenal' }, 400);

  } catch (err) {
    console.error('phase2-followup', err);
    if ((err as Record<string,unknown>)?.code === '23505' &&
        String((err as Record<string,unknown>)?.message ?? '').includes('uq_one_active_candidate'))
      return reply({ error: 'Regenerate sedang berjalan atau batas tercapai.' }, 409);
    // Pesan asli DITAMPILKAN, tidak ditelan jadi 'Operasi Follow-Up gagal'.
    // Status 200 disengaja: guru/js/api.js menjalankan `if (error) throw error`
    // sebelum membaca `data.error`, sehingga respons non-2xx sampai ke UI
    // sebagai 'Edge Function returned a non-2xx status code'.
    const m = err instanceof Error ? err.message : String(err);
    return reply({ error: `Operasi Follow-Up gagal: ${m}` });
  }
});
