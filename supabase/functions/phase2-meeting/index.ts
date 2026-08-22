// Phase 2: Meeting Plan generation — one AI call per pertemuan.
// Structural template: phase2-material/index.ts.
// Per-meeting: independent generate, validate, persist. Failed meetings do not block others.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': 'https://teguhalficahlin-del.github.io',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const LOCKED_ROLES = new Set([
  'WALI_KELAS','GURU_MAPEL_SDSMP_SMA','GURU_MAPEL_UMUM_SMK','GURU_MAPEL_PRODUKTIF_SMK',
]);
const PROMPT_VERSION = 'phase2-meeting-v1.0';
const MODEL          = 'claude-sonnet-4-6';
const AI_TIMEOUT_MS  = 150_000;
// Split generate (generate_single_meeting): dua panggilan AI dalam satu request.
// Output per call dibatasi setengah, timeout dipangkas agar 2 call + overhead RPC
// tetap di bawah wall clock Edge Function (~150s).
const SPLIT_MAX_TOKENS = 4096;
const SPLIT_TIMEOUT_MS = 60_000;

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

// ── AI call with per-call timeout ─────────────────────────────────────────────
async function callAI(
  systemPrompt: string,
  userPrompt: string,
  maxTokens = 8192,
  timeoutMs = AI_TIMEOUT_MS,
): Promise<string> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY tidak tersedia');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
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
        max_tokens: maxTokens,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      throw new Error(`AI ${res.status}: ${t}`);
    }
    const d = await res.json();
    return d?.content?.[0]?.text ?? '';
  } finally {
    clearTimeout(timer);
  }
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

// ── Normalisasi konten MEETING_PLAN sebelum validasi ──────────────────────────
// Tujuan: mengecilkan output yang harus ditulis AI. Field yang server sudah tahu
// atau bisa hitung sendiri tidak lagi diminta di prompt, lalu di-inject di sini
// sebelum fn_phase2_validate_meeting_plan dipanggil.
//
// OTORITATIF — selalu ditimpa dari rancang_meeting_allocation_items:
//   meeting_no, jp, duration_minutes
// DETERMINISTIK — dihitung/diturunkan server:
//   step_id (urutan activity), duration_check (jumlah planned_minutes)
// DEFAULT — hanya diisi bila AI tidak mengisi (?? / ||), tidak pernah menimpa:
//   resource_refs, recovery_refs, assessment_checkpoint_id, differentiation_ref,
//   teacher_notes, applied_context_decision_ids
//
// TIDAK PERNAH dikarang server: title, teacher_action, student_action,
// completion_cue, phase, planned_minutes, differentiation, formative_checkpoint.
// Itu konten nyata; validator tetap menolak bila AI menghilangkannya.
function normalizeMeetingContent(
  raw: unknown,
  allocationItem: Record<string, unknown>,
  meetingNo: number,
): Record<string, unknown> {
  const c: Record<string, unknown> =
    (raw && typeof raw === 'object' && !Array.isArray(raw))
      ? { ...(raw as Record<string, unknown>) }
      : {};

  const allocDuration = Number(allocationItem.duration_minutes);

  // Root — otoritatif server
  c.meeting_no       = allocationItem.meeting_no;
  c.jp               = allocationItem.jp;
  c.duration_minutes = allocationItem.duration_minutes;

  // Activities — step_id deterministik + default field opsional
  if (Array.isArray(c.activities)) {
    c.activities = (c.activities as unknown[]).map((a, i) => {
      const act: Record<string, unknown> =
        (a && typeof a === 'object' && !Array.isArray(a))
          ? { ...(a as Record<string, unknown>) }
          : {};
      const sid = typeof act.step_id === 'string' ? act.step_id.trim() : '';
      if (!sid) act.step_id = `m${meetingNo}-s${String(i + 1).padStart(2, '0')}`;
      act.resource_refs            = Array.isArray(act.resource_refs) ? act.resource_refs : [];
      act.recovery_refs            = Array.isArray(act.recovery_refs) ? act.recovery_refs : [];
      act.assessment_checkpoint_id = act.assessment_checkpoint_id ?? null;
      act.differentiation_ref      = act.differentiation_ref ?? null;
      return act;
    });
  }

  // duration_check — dihitung server; dibaca phase2-validator CHECK 3 (TIME_OVERFLOW)
  const totalPlanned = (Array.isArray(c.activities) ? c.activities as Record<string,unknown>[] : [])
    .reduce((sum, a) => sum + (Number(a.planned_minutes) || 0), 0);
  c.duration_check = {
    total_planned_minutes: totalPlanned,
    matches_allocation:    totalPlanned === allocDuration,
  };

  // Default array — tidak menimpa isi dari AI
  if (!Array.isArray(c.teacher_notes)) c.teacher_notes = [];
  if (!Array.isArray(c.applied_context_decision_ids)) c.applied_context_decision_ids = [];

  return c;
}


const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function isValidUuidV4(s: string): boolean { return UUID_RE.test(s); }

async function makeIdempotencyKey(prefix: string, ...parts: unknown[]): Promise<string> {
  return prefix + ':' + await sha256(parts);
}

// Verifikasi bahwa version_id berasal dari planningContextId + profileId + expectedKind yang sudah diotorisasi.
async function verifyVersionBinding(
  admin: ReturnType<typeof createClient>,
  versionId: string,
  profileId: string,
  planningContextId: string,
  expectedKind: string,
  expectedScopeKey?: string,
): Promise<boolean> {
  const { data: versionCheck } = await admin
    .from('rancang_artifact_versions')
    .select('id, artifact_id')
    .eq('id', versionId)
    .eq('profile_id', profileId)
    .eq('planning_context_id', planningContextId)
    .maybeSingle();
  if (!versionCheck) return false;
  const q = admin.from('rancang_artifacts').select('id')
    .eq('id', versionCheck.artifact_id).eq('artifact_kind', expectedKind);
  if (expectedScopeKey) q.eq('scope_key', expectedScopeKey);
  const { data: artifactCheck } = await q.maybeSingle();
  return !!artifactCheck;
}

// ── Meeting Plan prompt ───────────────────────────────────────────────────────
function buildMeetingPrompt(
  meetingNo: number,
  jp: number,
  durationMinutes: number,
  authority: Record<string, unknown>,
  contextContent: Record<string, unknown>,
  assessmentContent: Record<string, unknown>,
  materialContent: Record<string, unknown>,
  violationHint?: string,
): string {
  const cls      = (authority.class_context as Record<string,unknown>) ?? {};
  const facilities = (cls.fasilitas_tersedia  as string[]) ?? [];
  const forbidden  = (cls.aktivitas_dilarang  as string[]) ?? [];

  const kktp       = (assessmentContent.kktp     as Array<Record<string,unknown>>) ?? [];
  const formativeAll = (assessmentContent.formative as Array<Record<string,unknown>>) ?? [];
  const formativeThis = formativeAll.find(f => Number(f.meeting_no) === meetingNo);

  const decisions   = (contextContent.context_decisions as Array<Record<string,unknown>>) ?? [];
  const constraints = (contextContent.constraints as string[]) ?? [];

  const konsepInti  = (materialContent.konsep_inti   as Array<Record<string,unknown>>) ?? [];
  const konteksNyata = (materialContent.konteks_nyata as Array<Record<string,unknown>>) ?? [];

  const decisionIds = decisions.map((_, i) => `CTX-${String(i+1).padStart(2,'0')}`);
  const decisionText = decisions.map((d, i) =>
    `${decisionIds[i]}: ${d.interpretation}\n` +
    `  Prefer: ${(d.prefer as string[])?.join(', ') || '-'}\n` +
    `  Avoid:  ${(d.avoid  as string[])?.join(', ') || '-'}`
  ).join('\n');

  const violationBlock = violationHint
    ? `\nKOREKSI WAJIB dari percobaan sebelumnya:\n${violationHint}\n`
    : '';

  return `IDENTITAS PERTEMUAN (KONTEKS INPUT — jangan tulis ulang di output JSON):
meeting_no: ${meetingNo}
jp: ${jp}
duration_minutes: ${durationMinutes}

TP: ${authority.tp_judul}
Deskripsi TP: ${authority.tp_deskripsi}
Jenjang: ${authority.jenjang} | Mapel: ${authority.mapel}

KKTP (Kriteria Ketuntasan Tujuan Pembelajaran):
${kktp.map((k,i) =>
  `${i+1}. ${k.deskripsi}\n   Paham: ${k.paham} | Hampir: ${k.hampir} | Belum: ${k.belum}`
).join('\n')}

FORMATIVE CHECKPOINT PERTEMUAN ${meetingNo}:
${formativeThis
  ? `Expected evidence: ${formativeThis.expected_evidence}\nClassification anchor: ${JSON.stringify(formativeThis.classification_anchor)}`
  : '(Tidak ada formative spesifik — rancang sendiri berdasarkan KKTP di atas)'}

CONTEXT DECISIONS (constraints dan preferensi guru):
${decisionText || '(tidak ada)'}
Constraints tambahan: ${constraints.join(', ') || 'tidak ada'}

MATERI INTI yang tersedia:
${konsepInti.map(k => `• [${k.id}] ${k.judul}: ${k.penjelasan}`).join('\n')}

KONTEKS NYATA yang tersedia:
${konteksNyata.map(k => `• [${k.id}] ${k.deskripsi} (${k.sumber})`).join('\n')}

FASILITAS KELAS yang tersedia:
${facilities.length ? facilities.map(f => `• ${f}`).join('\n') : '• (tidak dispesifikasi)'}

AKTIVITAS YANG DIHINDARI:
${forbidden.length ? forbidden.map(f => `• ${f}`).join('\n') : '• (tidak ada)'}
${violationBlock}
INSTRUKSI DURASI (KRITIS):
SUM(activities[].planned_minutes) HARUS PERSIS = ${durationMinutes} menit. Tidak kurang, tidak lebih.
Panduan distribusi: opening ~10%, understand ~25%, apply ~30%, reflect ~15%, closing ~10%.
Sesuaikan angka agar totalnya persis ${durationMinutes}.

INSTRUKSI PHASE (WAJIB):
Lima phase berikut HARUS masing-masing ada minimal 1 activity:
opening, understand, apply, reflect, closing

INSTRUKSI DIFERENSIASI (WAJIB):
Jalur paham, hampir, belum — tiap jalur HARUS punya:
- aktivitas: deskripsi konkret dan spesifik (BUKAN kalimat generik seperti "beri perhatian lebih")
- bukti_belajar: output yang dapat diamati guru secara langsung

INSTRUKSI LKS:
Jika worksheet.required=true, gunakan HANYA stimulus/resource dari fasilitas kelas yang tersedia.

INSTRUKSI applied_context_decision_ids:
Pilih minimal 1 ID dari: ${decisionIds.join(', ') || 'CTX-01'}

PENTING: Output harus selesai dalam satu respons. Jika perlu memilih antara detail
dan kelengkapan, pilih kelengkapan. Potong deskripsi jika perlu, tapi jangan potong
struktur JSON.

JANGAN tulis field berikut — server yang mengisinya, menulisnya hanya membuang tempat:
meeting_no, jp, duration_minutes, step_id, duration_check, resource_refs,
recovery_refs, assessment_checkpoint_id, differentiation_ref, teacher_notes.

FIELD WAJIB di root JSON:
- activities: array, minimal 1 item; tiap phase minimal 1 activity
- formative_checkpoint: object, wajib punya classification_anchor berisi paham, hampir, belum
- differentiation: object, wajib punya paham, hampir, belum — masing-masing berisi
  aktivitas dan bukti_belajar yang tidak boleh kosong
- applied_context_decision_ids: array, minimal 1 ID
- worksheet: opsional; bila required=true maka tasks tidak boleh kosong

SETIAP activity WAJIB punya SEMUA field berikut — tidak boleh ada yang hilang:
- title           : string
- teacher_action  : string — apa yang guru lakukan
- student_action  : string — apa yang siswa lakukan
- completion_cue  : string — tanda aktivitas selesai
- phase           : salah satu dari opening | understand | apply | reflect | closing
- planned_minutes : integer > 0
Urutan activities menentukan urutan pelaksanaan. Lebih baik teks pendek di semua
field daripada ada field yang hilang.

BENTUK OUTPUT (isi dengan konten nyata, jangan salin teks contoh):
{"activities":[{"title":"...","phase":"opening","planned_minutes":15,
   "teacher_action":"...","student_action":"...","completion_cue":"..."}],
 "formative_checkpoint":{"expected_evidence":"...",
   "classification_anchor":{"paham":"...","hampir":"...","belum":"..."}},
 "differentiation":{"paham":{"aktivitas":"...","bukti_belajar":"..."},
   "hampir":{"aktivitas":"...","bukti_belajar":"..."},
   "belum":{"aktivitas":"...","bukti_belajar":"..."}},
 "applied_context_decision_ids":["CTX-01"],
 "worksheet":{"required":false,"tasks":[]}}

Output JSON murni — schema wajib sesuai kontrak meeting_plan. Tanpa markdown fence, tanpa teks tambahan.`;
}

// -----------------------------------------------------------------------------
// SPLIT GENERATE - dua panggilan AI untuk satu Meeting Plan.
// Output gabungan Meeting Plan melebihi 8192 token sehingga JSON terpotong di
// tengah. Beban dipecah dua: Call 1 menulis alur pembelajaran, Call 2 menulis
// diferensiasi + LKS berdasarkan alur itu. Server menggabungkan keduanya.
// -----------------------------------------------------------------------------

// CALL 1 - activities + formative_checkpoint (+ objective & trigger question)
function buildActivitiesPrompt(
  meetingNo: number,
  jp: number,
  durationMinutes: number,
  authority: Record<string, unknown>,
  contextContent: Record<string, unknown>,
  assessmentContent: Record<string, unknown>,
  materialContent: Record<string, unknown>,
): string {
  const cls        = (authority.class_context as Record<string,unknown>) ?? {};
  const facilities = (cls.fasilitas_tersedia as string[]) ?? [];
  const forbidden  = (cls.aktivitas_dilarang as string[]) ?? [];

  const kktp          = (assessmentContent.kktp as Array<Record<string,unknown>>) ?? [];
  const formativeAll  = (assessmentContent.formative as Array<Record<string,unknown>>) ?? [];
  const formativeThis = formativeAll.find(f => Number(f.meeting_no) === meetingNo);

  const decisions    = (contextContent.context_decisions as Array<Record<string,unknown>>) ?? [];
  const constraints  = (contextContent.constraints as string[]) ?? [];
  const konsepInti   = (materialContent.konsep_inti as Array<Record<string,unknown>>) ?? [];
  const konteksNyata = (materialContent.konteks_nyata as Array<Record<string,unknown>>) ?? [];

  const decisionIds  = decisions.map((_, i) => `CTX-${String(i+1).padStart(2,'0')}`);
  const decisionText = decisions.map((d, i) =>
    `${decisionIds[i]}: ${d.interpretation}\n` +
    `  Prefer: ${(d.prefer as string[])?.join(', ') || '-'}\n` +
    `  Avoid:  ${(d.avoid  as string[])?.join(', ') || '-'}`
  ).join('\n');

  return `BAGIAN 1 DARI 2 - ALUR PEMBELAJARAN.
Diferensiasi dan LKS akan diminta terpisah. JANGAN tulis keduanya di sini.

IDENTITAS PERTEMUAN (KONTEKS INPUT - jangan tulis ulang di output JSON):
meeting_no: ${meetingNo} | jp: ${jp} | duration_minutes: ${durationMinutes}

TP: ${authority.tp_judul}
Deskripsi TP: ${authority.tp_deskripsi}
Jenjang: ${authority.jenjang} | Mapel: ${authority.mapel}

KKTP:
${kktp.map((k,i) => `${i+1}. ${k.deskripsi}`).join('\n') || '(tidak ada)'}

FORMATIVE CHECKPOINT PERTEMUAN ${meetingNo}:
${formativeThis
  ? `Expected evidence: ${formativeThis.expected_evidence}\nClassification anchor: ${JSON.stringify(formativeThis.classification_anchor)}`
  : '(Tidak ada formative spesifik - rancang sendiri berdasarkan KKTP di atas)'}

CONTEXT DECISIONS:
${decisionText || '(tidak ada)'}
Constraints tambahan: ${constraints.join(', ') || 'tidak ada'}

MATERI INTI:
${konsepInti.map(k => `- [${k.id}] ${k.judul}: ${k.penjelasan}`).join('\n') || '(tidak ada)'}

KONTEKS NYATA:
${konteksNyata.map(k => `- [${k.id}] ${k.deskripsi} (${k.sumber})`).join('\n') || '(tidak ada)'}

FASILITAS KELAS:
${facilities.length ? facilities.map(f => `- ${f}`).join('\n') : '- (tidak dispesifikasi)'}

AKTIVITAS YANG DIHINDARI:
${forbidden.length ? forbidden.map(f => `- ${f}`).join('\n') : '- (tidak ada)'}

INSTRUKSI DURASI (KRITIS):
Total planned_minutes semua activities HARUS persis = ${durationMinutes} menit.
Tidak kurang, tidak lebih. Panduan: opening ~10%, understand ~25%, apply ~30%,
reflect ~15%, closing ~10%. Sesuaikan angka agar totalnya persis ${durationMinutes}.

INSTRUKSI PHASE (WAJIB):
Lima phase HARUS masing-masing ada minimal 1 activity:
opening, understand, apply, reflect, closing

INSTRUKSI applied_context_decision_ids:
Pilih minimal 1 ID dari: ${decisionIds.join(', ') || 'CTX-01'}

JANGAN tulis field berikut - server yang mengisinya:
meeting_no, jp, duration_minutes, step_id, duration_check, resource_refs,
recovery_refs, assessment_checkpoint_id, differentiation_ref, teacher_notes.
JANGAN tulis differentiation maupun worksheet di bagian ini.

SETIAP activity WAJIB punya SEMUA field berikut:
- title           : string
- teacher_action  : string - apa yang guru lakukan
- student_action  : string - apa yang siswa lakukan
- completion_cue  : string - tanda aktivitas selesai
- phase           : opening | understand | apply | reflect | closing
- planned_minutes : integer > 0
Tulis ringkas, 1-2 kalimat per field. Lebih baik teks pendek di semua field
daripada ada field yang hilang.

BENTUK OUTPUT (isi dengan konten nyata, jangan salin teks contoh):
{"meeting_objective":"...","trigger_question":"...",
 "activities":[{"title":"...","phase":"opening","planned_minutes":15,
   "teacher_action":"...","student_action":"...","completion_cue":"..."}],
 "formative_checkpoint":{"expected_evidence":"...",
   "classification_anchor":{"paham":"...","hampir":"...","belum":"..."}},
 "applied_context_decision_ids":["CTX-01"]}

Output JSON murni. Tanpa markdown fence, tanpa teks tambahan.`;
}

// CALL 2 - differentiation + worksheet, berdasarkan hasil Call 1
function buildDifferentiationPrompt(
  meetingNo: number,
  durationMinutes: number,
  authority: Record<string, unknown>,
  assessmentContent: Record<string, unknown>,
  part1: Record<string, unknown>,
): string {
  const cls        = (authority.class_context as Record<string,unknown>) ?? {};
  const facilities = (cls.fasilitas_tersedia as string[]) ?? [];
  const forbidden  = (cls.aktivitas_dilarang as string[]) ?? [];
  const kktp       = (assessmentContent.kktp as Array<Record<string,unknown>>) ?? [];

  const acts = Array.isArray(part1.activities)
    ? part1.activities as Array<Record<string,unknown>> : [];
  const actSummary = acts.map((a, i) =>
    `${i+1}. [${a.phase}] ${a.title} (${a.planned_minutes} menit) - siswa: ${a.student_action}`
  ).join('\n');

  const fc = (part1.formative_checkpoint as Record<string,unknown>) ?? {};

  return `BAGIAN 2 DARI 2 - DIFERENSIASI DAN LKS.
Alur pembelajaran sudah dirancang di bagian 1. Sekarang rancang diferensiasi
yang RELEVAN dengan alur itu, plus lembar kerja bila perlu.

TP: ${authority.tp_judul}
Pertemuan ${meetingNo} - ${durationMinutes} menit

ALUR YANG SUDAH DIRANCANG:
${actSummary || '(tidak ada activity)'}

FORMATIVE CHECKPOINT:
Expected evidence: ${fc.expected_evidence ?? '-'}
Classification anchor: ${JSON.stringify(fc.classification_anchor ?? {})}

KKTP (acuan tingkat penguasaan):
${kktp.map((k,i) =>
  `${i+1}. ${k.deskripsi}\n   Paham: ${k.paham} | Hampir: ${k.hampir} | Belum: ${k.belum}`
).join('\n') || '(tidak ada)'}

FASILITAS KELAS:
${facilities.length ? facilities.map(f => `- ${f}`).join('\n') : '- (tidak dispesifikasi)'}

AKTIVITAS YANG DIHINDARI:
${forbidden.length ? forbidden.map(f => `- ${f}`).join('\n') : '- (tidak ada)'}

INSTRUKSI DIFERENSIASI (WAJIB):
Tiga jalur - paham, hampir, belum. Tiap jalur WAJIB punya:
- aktivitas     : deskripsi konkret dan spesifik, merujuk pada alur di atas.
                  BUKAN kalimat generik seperti "beri perhatian lebih".
- bukti_belajar : output yang dapat diamati guru secara langsung.
Tidak boleh kosong. Tulis ringkas, 1-2 kalimat per field.

INSTRUKSI LKS:
Bila worksheet.required=true, tasks tidak boleh kosong dan hanya boleh memakai
stimulus/resource dari fasilitas kelas di atas. Bila tidak perlu LKS, tulis
required=false dan tasks array kosong.

JANGAN tulis activities, formative_checkpoint, meeting_no, jp, atau
duration_minutes di bagian ini - semuanya sudah ada.

BENTUK OUTPUT (isi dengan konten nyata, jangan salin teks contoh):
{"differentiation":{"paham":{"aktivitas":"...","bukti_belajar":"..."},
   "hampir":{"aktivitas":"...","bukti_belajar":"..."},
   "belum":{"aktivitas":"...","bukti_belajar":"..."}},
 "worksheet":{"required":false,"tasks":[]}}

Output JSON murni. Tanpa markdown fence, tanpa teks tambahan.`;
}

// Fallback differentiation bila Call 2 gagal - DITURUNKAN dari KKTP yang sudah
// dikonfirmasi guru di Assessment Spec, bukan dikarang server. Validator
// mewajibkan aktivitas + bukti_belajar tidak kosong untuk ketiga jalur, jadi
// default kosong akan selalu ditolak; turunan KKTP inilah yang membuat jalur
// "jangan abort" benar-benar bisa lolos validasi.
function fallbackDifferentiation(
  assessmentContent: Record<string, unknown>,
): Record<string, unknown> {
  const kktp  = (assessmentContent.kktp as Array<Record<string,unknown>>) ?? [];
  const first = kktp[0] ?? {};
  const desc  = String(first.deskripsi ?? 'kriteria ketuntasan TP ini');
  const mk = (jalur: 'paham'|'hampir'|'belum', label: string) => {
    const anchor = String(first[jalur] ?? '').trim();
    return {
      aktivitas: anchor
        ? `${label} sesuai KKTP: ${anchor}`
        : `${label} pada ${desc} dengan pendampingan guru sesuai kebutuhan.`,
      bukti_belajar: anchor
        ? `Guru mengamati bukti: ${anchor}`
        : `Guru mengamati capaian siswa pada ${desc}.`,
    };
  };
  return {
    paham:  mk('paham',  'Pengayaan'),
    hampir: mk('hampir', 'Penguatan'),
    belum:  mk('belum',  'Pendampingan intensif'),
  };
}


// ── Load selected artifact version (content + metadata) ───────────────────────
type ArtifactVersion = {
  id: string; content: Record<string,unknown>;
  artifact_id: string; selection_revision: number;
};

async function loadArtifactContent(
  admin: ReturnType<typeof createClient>,
  planningContextId: string,
  profileId: string,
  kind: string,
): Promise<ArtifactVersion | null> {
  const { data: a } = await admin.from('rancang_artifacts')
    .select('id').eq('planning_context_id', planningContextId)
    .eq('artifact_kind', kind).eq('profile_id', profileId).maybeSingle();
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
    .select('id,role,role_guru,role_locked_at').eq('user_id', user.id).single();
  if (!profile || profile.role !== 'GURU' || !profile.role_locked_at
      || !LOCKED_ROLES.has(profile.role_guru))
    return reply({ error: 'Locked teacher role diperlukan' }, 403);

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

    // 5. Load durable planning context
    const { data: pc } = await admin.from('rancang_planning_contexts')
      .select('*').eq('id', planningContextId).eq('profile_id', profile.id)
      .eq('teaching_context_id', context.id).eq('classroom_id', classroomId).maybeSingle();
    if (!pc) return reply({ error: 'Planning Context tidak diizinkan' }, 403);

    // 6. Load TP revision
    const { data: tpRevision } = await admin.from('rancang_tp_revisions')
      .select('id,judul,deskripsi,semester,estimasi_jp,raw_element_value')
      .eq('id', pc.selected_tp_revision_id).maybeSingle();
    if (!tpRevision) return reply({ error: 'TP revision tidak valid' }, 409);

    // 7. Load confirmed meeting allocation
    const { data: alloc } = await admin.from('rancang_meeting_allocations')
      .select('id,total_jp_tp,effective_jp_minutes,revision_no')
      .eq('planning_context_id', planningContextId).is('superseded_at', null).maybeSingle();
    if (!alloc) return reply({ error: 'Meeting Allocation belum dikonfirmasi' }, 409);

    const { data: allocItems } = await admin.from('rancang_meeting_allocation_items')
      .select('id,meeting_no,jp,duration_minutes')
      .eq('meeting_allocation_id', alloc.id).order('meeting_no');
    if (!allocItems?.length) return reply({ error: 'Meeting Allocation tidak punya item' }, 409);

    // Compose durable server authority
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

    // Gate: MATERIAL_SPEC must be usable for all actions
    const { data: matUsable } = await admin.rpc('fn_phase2c_material_spec_usable', {
      p_profile_id: profile.id, p_planning_context_id: planningContextId,
    });

    const SYSTEM_PROMPT =
      'Anda adalah perancang pembelajaran.\n' +
      'Hanya keluarkan JSON valid tanpa teks tambahan, tanpa markdown fence.\n' +
      'Tulis isi setiap field secara RINGKAS — 1-2 kalimat sudah cukup.\n' +
      'Keringkasan berlaku pada PANJANG TEKS, BUKAN pada jumlah field. ' +
      'JANGAN pernah menghilangkan field apa pun demi menghemat tempat: ' +
      'field yang hilang membuat seluruh output ditolak, sedangkan teks ' +
      'pendek tetap diterima. Kelengkapan struktur selalu lebih penting ' +
      'daripada detail narasi.';

    // ── Helper: build standard dependencies array for a meeting item ──────────
    const makeMeetingDeps = async (
      itemId: string,
      ctxVerId: string, asmVerId: string, matVerId: string,
      prevVersionId?: string,
    ) => {
      const deps: Record<string,unknown>[] = [
        { kind: 'PLANNING_CONTEXT',       planning_context_id:       planningContextId, hash: await sha256({ id: planningContextId }) },
        { kind: 'TP_REVISION',            tp_revision_id:            tpRevision.id,     hash: await sha256({ id: tpRevision.id }) },
        { kind: 'MEETING_ALLOCATION',     meeting_allocation_id:     alloc.id,           hash: await sha256({ id: alloc.id }) },
        { kind: 'MEETING_ALLOCATION_ITEM', meeting_allocation_item_id: itemId,           hash: await sha256({ id: itemId }) },
        { kind: 'ARTIFACT_VERSION',       artifact_version_id:       ctxVerId,           hash: await sha256({ id: ctxVerId }) },
        { kind: 'ARTIFACT_VERSION',       artifact_version_id:       asmVerId,           hash: await sha256({ id: asmVerId }) },
        { kind: 'ARTIFACT_VERSION',       artifact_version_id:       matVerId,           hash: await sha256({ id: matVerId }) },
      ];
      if (prevVersionId) {
        deps.push({ kind: 'ARTIFACT_VERSION', artifact_version_id: prevVersionId, hash: await sha256({ id: prevVersionId }) });
      }
      return deps;
    };

    // ── Helper: transition + accept a new version ─────────────────────────────
    const transitionAndAccept = async (
      vId: string, validation: unknown, selectionRevision: number, autoAccept: boolean,
      transKey: string, validateKey: string, acceptKey?: string,
    ) => {
      await admin.rpc('fn_phase2b_transition_version', {
        p_profile_id: profile.id, p_version_id: vId,
        p_action: 'GENERATED', p_validation_status: 'VALID',
        p_validation_summary: validation,
        p_reason: 'Meeting Plan succeeded',
        p_idempotency_key: await makeIdempotencyKey(transKey, vId),
      });
      await admin.rpc('fn_phase2b_transition_version', {
        p_profile_id: profile.id, p_version_id: vId,
        p_action: 'VALIDATE', p_validation_status: 'VALID',
        p_validation_summary: validation, p_reason: null,
        p_idempotency_key: await makeIdempotencyKey(validateKey, vId),
      });
      if (autoAccept && acceptKey) {
        await admin.rpc('fn_phase2b_decide_candidate', {
          p_profile_id: profile.id, p_version_id: vId,
          p_decision: 'ACCEPT',
          p_expected_selection_revision: selectionRevision,
          p_idempotency_key: await makeIdempotencyKey(acceptKey, vId),
        });
      }
    };

    // ────────────────────────────────────────────────────────────────────────
    // ACTION: generate_all_meetings
    // ────────────────────────────────────────────────────────────────────────
    if (action === 'generate_all_meetings') {
      if (!matUsable)
        return reply({ error: 'Material Specification belum usable — selesaikan Material dulu' }, 409);

      const ctxVer = await loadArtifactContent(admin, planningContextId, profile.id, 'CONTEXT_SPEC');
      const asmVer = await loadArtifactContent(admin, planningContextId, profile.id, 'ASSESSMENT_SPEC');
      const matVer = await loadArtifactContent(admin, planningContextId, profile.id, 'MATERIAL_SPEC');
      if (!ctxVer || !asmVer || !matVer)
        return reply({ error: 'Context / Assessment / Material belum tersedia' }, 409);

      // Current pipeline state — to detect which meetings are already usable
      const { data: pipelineState } = await admin.rpc('fn_phase2c_get_pipeline_state', {
        p_profile_id: profile.id, p_planning_context_id: planningContextId,
      });
      const existingPlans =
        (pipelineState?.meeting_plans as Array<Record<string,unknown>>) ?? [];

      const meetingResults: Array<{
        meeting_no: number; status: 'generated'|'skipped'|'failed'; error: string|null;
      }> = [];

      for (const item of allocItems) {
        const meetingNo = item.meeting_no as number;
        const jp        = item.jp as number;
        const durMin    = item.duration_minutes as number;
        const itemId    = item.id as string;

        // Skip if already usable and current
        const existing = existingPlans.find(m => Number(m.meeting_no) === meetingNo);
        if (existing?.usable === true && existing?.needs_update === false) {
          meetingResults.push({ meeting_no: meetingNo, status: 'skipped', error: null });
          continue;
        }

        const sourceHash = await sha256({
          kind: 'MEETING_PLAN', planning_context_id: planningContextId,
          meeting_no: meetingNo, meeting_allocation_item_id: itemId,
          context_version_id: ctxVer.id, assessment_version_id: asmVer.id,
          material_version_id: matVer.id,
        });
        const depHash = await sha256({
          meeting_allocation_item_id: itemId,
          context_version_id: ctxVer.id, assessment_version_id: asmVer.id,
          material_version_id: matVer.id,
        });
        const idempotencyKey = await makeIdempotencyKey(
          'meet_gen', planningContextId, String(meetingNo), sourceHash, 'initial'
        );
        const deps = await makeMeetingDeps(itemId, ctxVer.id, asmVer.id, matVer.id);

        let failed = false;
        let failReason = '';
        let violationHint: string | undefined;

        for (let attempt = 0; attempt <= 1; attempt++) {
          try {
            const raw = await callAI(SYSTEM_PROMPT, buildMeetingPrompt(
              meetingNo, jp, durMin, authority,
              ctxVer.content, asmVer.content, matVer.content, violationHint,
            ));
            const content = normalizeMeetingContent(extractJson(raw), item, meetingNo);

            const { data: validation } = await admin.rpc('fn_phase2_validate_meeting_plan', {
              p_content: content, p_expected_duration_minutes: durMin,
            });

            if (validation?.status === 'valid') {
              const { data: createResult, error: createError } = await admin.rpc(
                'fn_phase2b_create_version', {
                  p_profile_id: profile.id, p_planning_context_id: planningContextId,
                  p_artifact_kind: 'MEETING_PLAN',
                  p_scope_key: `MEETING_${meetingNo}`,
                  p_meeting_allocation_item_id: itemId,
                  p_parent_version_id: null, p_candidate_of_version_id: null,
                  p_origin: 'AI', p_teacher_edited: false,
                  p_content: content, p_source_snapshot: authority,
                  p_source_hash: sourceHash, p_dependency_hash: depHash,
                  p_prompt_version: PROMPT_VERSION, p_model_version: MODEL,
                  p_dependencies: deps, p_idempotency_key: idempotencyKey,
                }
              );
              if (createError) throw createError;

              if (!createResult.idempotent) {
                await transitionAndAccept(
                  createResult.version_id, validation, 0, true,
                  'meet_gen_transition', 'meet_validate', 'meet_autoselect'
                );
              }
              failed = false;
              break;
            } else {
              const viols = (validation?.violations as Array<Record<string,unknown>>) ?? [];
              violationHint = viols
                .map(v => `[${v.rule}]${v.scope ? ' '+v.scope+':' : ''} ${v.message}`)
                .join('\n');
              if (attempt >= 1) {
                failed = true;
                failReason = `Validasi gagal setelah retry: ${violationHint}`;
              }
            }
          } catch (e) {
            if (attempt >= 1) {
              failed = true;
              failReason = e instanceof Error ? e.message : 'Error tidak diketahui';
            }
          }
        }

        meetingResults.push({
          meeting_no: meetingNo,
          status: failed ? 'failed' : 'generated',
          error: failed ? failReason : null,
        });
      }

      const { data: state } = await admin.rpc('fn_phase2c_get_pipeline_state', {
        p_profile_id: profile.id, p_planning_context_id: planningContextId,
      });
      return reply({ result: state, meeting_results: meetingResults });
    }

    // ────────────────────────────────────────────────────────────────────────
    // ACTION: generate_single_meeting
    // Satu pertemuan per request. generate_all_meetings memanggil AI sekali
    // (hingga dua kali saat retry validasi) per pertemuan dalam SATU request,
    // sehingga alokasi 2+ pertemuan menembus batas 2 menit di free tier dan
    // berakhir 546. Action ini memecah beban itu menjadi satu request per
    // pertemuan; UI yang memanggilnya secara berurutan.
    //
    // Idempotency key sengaja IDENTIK dengan generate_all_meetings (sufiks
    // 'initial', tanpa client_operation_id) supaya kedua jalur konvergen —
    // pertemuan yang sudah dibuat lewat generate_all_meetings tidak akan
    // terduplikasi bila kemudian diminta lewat action ini.
    // ────────────────────────────────────────────────────────────────────────
    if (action === 'generate_single_meeting') {
      if (!matUsable)
        return reply({ error: 'Material Specification belum usable — selesaikan Material dulu' }, 409);

      const meetingNo  = Number(body.meeting_no);
      const clientOpId = String(body.client_operation_id ?? '');
      if (!Number.isInteger(meetingNo) || meetingNo < 1)
        return reply({ error: 'meeting_no harus integer >= 1' }, 400);
      if (!isValidUuidV4(clientOpId))
        return reply({ error: 'client_operation_id harus UUID v4 yang valid' }, 400);

      const item = allocItems.find(i => (i.meeting_no as number) === meetingNo);
      if (!item) return reply({ error: `Pertemuan ${meetingNo} tidak ada dalam alokasi` }, 409);

      const ctxVer = await loadArtifactContent(admin, planningContextId, profile.id, 'CONTEXT_SPEC');
      const asmVer = await loadArtifactContent(admin, planningContextId, profile.id, 'ASSESSMENT_SPEC');
      const matVer = await loadArtifactContent(admin, planningContextId, profile.id, 'MATERIAL_SPEC');
      if (!ctxVer || !asmVer || !matVer)
        return reply({ error: 'Context / Assessment / Material belum tersedia' }, 409);

      // Skip if this meeting is already usable and current
      const { data: preState } = await admin.rpc('fn_phase2c_get_pipeline_state', {
        p_profile_id: profile.id, p_planning_context_id: planningContextId,
      });
      const existing = ((preState?.meeting_plans as Array<Record<string,unknown>>) ?? [])
        .find(m => Number(m.meeting_no) === meetingNo);
      if (existing?.usable === true && existing?.needs_update === false) {
        return reply({
          result: preState,
          meeting_results: [{ meeting_no: meetingNo, status: 'skipped', error: null }],
        });
      }

      const jp     = item.jp as number;
      const durMin = item.duration_minutes as number;
      const itemId = item.id as string;

      const sourceHash = await sha256({
        kind: 'MEETING_PLAN', planning_context_id: planningContextId,
        meeting_no: meetingNo, meeting_allocation_item_id: itemId,
        context_version_id: ctxVer.id, assessment_version_id: asmVer.id,
        material_version_id: matVer.id,
      });
      const depHash = await sha256({
        meeting_allocation_item_id: itemId,
        context_version_id: ctxVer.id, assessment_version_id: asmVer.id,
        material_version_id: matVer.id,
      });
      const idempotencyKey = await makeIdempotencyKey(
        'meet_gen', planningContextId, String(meetingNo), sourceHash, 'initial'
      );
      const deps = await makeMeetingDeps(itemId, ctxVer.id, asmVer.id, matVer.id);

      // Satu attempt saja — TIDAK ada retry di server. Dua panggilan AI dalam
      // satu request menembus wall clock Edge Function dan berakhir 546.
      // Kegagalan dikembalikan apa adanya beserta violations supaya klien bisa
      // menampilkan pesan yang berguna dan memutuskan sendiri apakah mengulang.
      //
      // Status HTTP sengaja 200 meski gagal: guru/js/api.js mengevaluasi
      // `if (error) throw error` SEBELUM membaca `data.error`, sehingga respons
      // non-2xx sampai ke UI sebagai 'Edge Function returned a non-2xx status
      // code' — pesan yang tidak berguna. Dengan 200 + field `error`, api.js
      // melempar Error(data.error) dan guru melihat penyebab sebenarnya.
      // SPLIT GENERATE - dua panggilan AI, masing-masing dibatasi
      // SPLIT_MAX_TOKENS / SPLIT_TIMEOUT_MS agar total tetap di bawah wall clock.
      // Call 1 (alur pembelajaran) wajib berhasil; Call 2 (diferensiasi + LKS)
      // boleh gagal dan jatuh ke fallback turunan KKTP supaya kerja Call 1
      // tidak terbuang.
      let part1: Record<string, unknown>;
      try {
        const raw1 = await callAI(
          SYSTEM_PROMPT,
          buildActivitiesPrompt(
            meetingNo, jp, durMin, authority,
            ctxVer.content, asmVer.content, matVer.content,
          ),
          SPLIT_MAX_TOKENS, SPLIT_TIMEOUT_MS,
        );
        const parsed1 = extractJson(raw1);
        if (!parsed1 || typeof parsed1 !== 'object' || Array.isArray(parsed1))
          throw new Error('Bagian 1 bukan JSON object');
        part1 = parsed1 as Record<string, unknown>;
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Error tidak diketahui';
        const { data: stErr } = await admin.rpc('fn_phase2c_get_pipeline_state', {
          p_profile_id: profile.id, p_planning_context_id: planningContextId,
        });
        return reply({
          result: stErr,
          error: `Pertemuan ${meetingNo} gagal di-generate (bagian 1 - alur pembelajaran): ${msg}`,
          meeting_results: [{ meeting_no: meetingNo, status: 'failed', error: msg }],
        });
      }

      // Call 2 - kegagalan TIDAK membatalkan request; pakai fallback dari KKTP.
      let part2: Record<string, unknown>;
      let part2Fallback = false;
      try {
        const raw2 = await callAI(
          SYSTEM_PROMPT,
          buildDifferentiationPrompt(
            meetingNo, durMin, authority, asmVer.content, part1,
          ),
          SPLIT_MAX_TOKENS, SPLIT_TIMEOUT_MS,
        );
        const parsed2 = extractJson(raw2);
        if (!parsed2 || typeof parsed2 !== 'object' || Array.isArray(parsed2))
          throw new Error('Bagian 2 bukan JSON object');
        part2 = parsed2 as Record<string, unknown>;
      } catch (e) {
        console.error('[generate_single_meeting] Call 2 gagal, pakai fallback KKTP:',
          e instanceof Error ? e.message : e);
        part2 = {};
        part2Fallback = true;
      }

      const diffFromAi = part2.differentiation;
      const diffOk = !!diffFromAi && typeof diffFromAi === 'object' && !Array.isArray(diffFromAi)
        && ['paham','hampir','belum'].every(j => {
             const d = (diffFromAi as Record<string,unknown>)[j] as Record<string,unknown> | undefined;
             return !!d && String(d.aktivitas ?? '').trim() !== ''
                        && String(d.bukti_belajar ?? '').trim() !== '';
           });
      if (!diffOk) part2Fallback = true;

      const merged: Record<string, unknown> = {
        ...part1,
        ...part2,
        differentiation: diffOk ? diffFromAi : fallbackDifferentiation(asmVer.content),
        worksheet: part2.worksheet ?? { required: false, tasks: [] },
      };

      const content = normalizeMeetingContent(merged, item, meetingNo);

      const { data: validation } = await admin.rpc('fn_phase2_validate_meeting_plan', {
        p_content: content, p_expected_duration_minutes: durMin,
      });

      if (validation?.status !== 'valid') {
        const viols = (validation?.violations as Array<Record<string,unknown>>) ?? [];
        const hint = viols
          .map(v => `[${v.rule}]${v.scope ? ' '+v.scope+':' : ''} ${v.message}`)
          .join('\n');
        const brief = viols.slice(0, 3)
          .map(v => `• ${v.message}`)
          .join('\n');
        const more = viols.length > 3 ? `\n(+${viols.length - 3} pelanggaran lain)` : '';
        const { data: stInvalid } = await admin.rpc('fn_phase2c_get_pipeline_state', {
          p_profile_id: profile.id, p_planning_context_id: planningContextId,
        });
        return reply({
          result: stInvalid,
          error: `Output AI Pertemuan ${meetingNo} tidak memenuhi schema:\n${brief}${more}`,
          violations: viols,
          meeting_results: [{ meeting_no: meetingNo, status: 'failed', error: hint }],
        });
      }

      const { data: createResult, error: createError } = await admin.rpc(
        'fn_phase2b_create_version', {
          p_profile_id: profile.id, p_planning_context_id: planningContextId,
          p_artifact_kind: 'MEETING_PLAN',
          p_scope_key: `MEETING_${meetingNo}`,
          p_meeting_allocation_item_id: itemId,
          p_parent_version_id: null, p_candidate_of_version_id: null,
          p_origin: 'AI', p_teacher_edited: false,
          p_content: content, p_source_snapshot: authority,
          p_source_hash: sourceHash, p_dependency_hash: depHash,
          p_prompt_version: PROMPT_VERSION, p_model_version: MODEL,
          p_dependencies: deps, p_idempotency_key: idempotencyKey,
        }
      );
      if (createError) throw createError;

      if (!createResult.idempotent) {
        await transitionAndAccept(
          createResult.version_id, validation, 0, true,
          'meet_gen_transition', 'meet_validate', 'meet_autoselect'
        );
      }

      const { data: state } = await admin.rpc('fn_phase2c_get_pipeline_state', {
        p_profile_id: profile.id, p_planning_context_id: planningContextId,
      });
      return reply({
        result: state,
        differentiation_fallback: part2Fallback,
        meeting_results: [{
          meeting_no: meetingNo,
          status: 'generated',
          error: null,
          note: part2Fallback
            ? 'Diferensiasi diturunkan otomatis dari KKTP karena bagian 2 gagal - periksa dan sesuaikan bila perlu'
            : null,
        }],
      });
    }


    // ────────────────────────────────────────────────────────────────────────
    // ACTION: regenerate_meeting
    // ────────────────────────────────────────────────────────────────────────
    if (action === 'regenerate_meeting') {
      if (!matUsable) return reply({ error: 'Material Specification belum usable' }, 409);

      const meetingNo  = Number(body.meeting_no);
      const clientOpId = String(body.client_operation_id ?? '');
      if (!Number.isInteger(meetingNo) || meetingNo < 1)
        return reply({ error: 'meeting_no harus integer >= 1' }, 400);
      if (!isValidUuidV4(clientOpId))
        return reply({ error: 'client_operation_id harus UUID v4 yang valid' }, 400);

      const item = allocItems.find(i => (i.meeting_no as number) === meetingNo);
      if (!item) return reply({ error: `Pertemuan ${meetingNo} tidak ada dalam alokasi` }, 409);

      const { data: meetArtifact } = await admin.from('rancang_artifacts')
        .select('id').eq('planning_context_id', planningContextId)
        .eq('artifact_kind', 'MEETING_PLAN').eq('profile_id', profile.id)
        .eq('scope_key', `MEETING_${meetingNo}`).maybeSingle();
      if (!meetArtifact)
        return reply({ error: `Meeting Plan pertemuan ${meetingNo} belum pernah di-generate` }, 409);

      // Regenerate limit: max 1 non-initial version
      const { count: regenCount } = await admin.from('rancang_artifact_versions')
        .select('id', { count: 'exact', head: true })
        .eq('artifact_id', meetArtifact.id)
        .not('candidate_of_version_id', 'is', null);
      if ((regenCount ?? 0) >= 1)
        return reply({
          error: `Batas regenerate Pertemuan ${meetingNo} sudah tercapai. Gunakan edit manual.`
        }, 409);

      const { data: meetSel } = await admin.from('rancang_artifact_selections')
        .select('selected_version_id,selection_revision')
        .eq('artifact_id', meetArtifact.id).maybeSingle();

      const ctxVer = await loadArtifactContent(admin, planningContextId, profile.id, 'CONTEXT_SPEC');
      const asmVer = await loadArtifactContent(admin, planningContextId, profile.id, 'ASSESSMENT_SPEC');
      const matVer = await loadArtifactContent(admin, planningContextId, profile.id, 'MATERIAL_SPEC');
      if (!ctxVer || !asmVer || !matVer)
        return reply({ error: 'Context / Assessment / Material belum tersedia' }, 409);

      const itemId = item.id as string;
      const durMin = item.duration_minutes as number;

      const sourceHash = await sha256({
        kind: 'MEETING_PLAN', planning_context_id: planningContextId,
        meeting_no: meetingNo, meeting_allocation_item_id: itemId,
        context_version_id: ctxVer.id, assessment_version_id: asmVer.id,
        material_version_id: matVer.id,
      });
      const depHash = await sha256({
        meeting_allocation_item_id: itemId,
        context_version_id: ctxVer.id, assessment_version_id: asmVer.id,
        material_version_id: matVer.id,
      });
      const idempotencyKey = 'meet_regen:' + await sha256({
        profileId: profile.id, planningContextId, meetingNo,
        sourceHash, depHash, clientOperationId: clientOpId,
      });
      const deps = await makeMeetingDeps(
        itemId, ctxVer.id, asmVer.id, matVer.id, meetSel?.selected_version_id
      );

      const raw = await callAI(SYSTEM_PROMPT, buildMeetingPrompt(
        meetingNo, item.jp as number, durMin, authority,
        ctxVer.content, asmVer.content, matVer.content,
      ));
      let content: unknown;
      try { content = normalizeMeetingContent(extractJson(raw), item, meetingNo); }
      catch { return reply({ error: 'Output AI tidak valid — coba lagi' }, 409); }

      const { data: validation } = await admin.rpc('fn_phase2_validate_meeting_plan', {
        p_content: content, p_expected_duration_minutes: durMin,
      });
      if (validation?.status !== 'valid')
        return reply({ error: 'Output AI tidak memenuhi schema — coba lagi', violations: validation?.violations }, 409);

      const { data: createResult, error: createError } = await admin.rpc('fn_phase2b_create_version', {
        p_profile_id: profile.id, p_planning_context_id: planningContextId,
        p_artifact_kind: 'MEETING_PLAN',
        p_scope_key: `MEETING_${meetingNo}`,
        p_meeting_allocation_item_id: itemId,
        p_parent_version_id: null,
        p_candidate_of_version_id: meetSel?.selected_version_id ?? null,
        p_origin: 'AI', p_teacher_edited: false,
        p_content: content, p_source_snapshot: authority,
        p_source_hash: sourceHash, p_dependency_hash: depHash,
        p_prompt_version: PROMPT_VERSION, p_model_version: MODEL,
        p_dependencies: deps, p_idempotency_key: idempotencyKey,
      });
      if (createError) throw createError;

      if (!createResult.idempotent) {
        // Leave as candidate — teacher selects explicitly
        await admin.rpc('fn_phase2b_transition_version', {
          p_profile_id: profile.id, p_version_id: createResult.version_id,
          p_action: 'GENERATED', p_validation_status: 'VALID',
          p_validation_summary: validation,
          p_reason: 'Meeting Plan regenerate succeeded',
          p_idempotency_key: await makeIdempotencyKey('meet_regen_transition', createResult.version_id),
        });
        await admin.rpc('fn_phase2b_transition_version', {
          p_profile_id: profile.id, p_version_id: createResult.version_id,
          p_action: 'VALIDATE', p_validation_status: 'VALID',
          p_validation_summary: validation, p_reason: null,
          p_idempotency_key: await makeIdempotencyKey('meet_regen_validate', createResult.version_id),
        });
      }

      const { data: state } = await admin.rpc('fn_phase2c_get_pipeline_state', {
        p_profile_id: profile.id, p_planning_context_id: planningContextId,
      });
      return reply({ result: state });
    }

    // ────────────────────────────────────────────────────────────────────────
    // ACTION: save_meeting_edit
    // ────────────────────────────────────────────────────────────────────────
    if (action === 'save_meeting_edit') {
      const meetingNo     = Number(body.meeting_no);
      const editedContent = body.content;
      if (!Number.isInteger(meetingNo) || meetingNo < 1)
        return reply({ error: 'meeting_no harus integer >= 1' }, 400);
      if (!editedContent) return reply({ error: 'Content edit tidak boleh kosong' }, 400);

      const item = allocItems.find(i => (i.meeting_no as number) === meetingNo);
      if (!item) return reply({ error: `Pertemuan ${meetingNo} tidak ada dalam alokasi` }, 409);

      const durMin = item.duration_minutes as number;
      const { data: validation } = await admin.rpc('fn_phase2_validate_meeting_plan', {
        p_content: editedContent, p_expected_duration_minutes: durMin,
      });
      if (validation?.status !== 'valid')
        return reply({ error: 'Edit tidak memenuhi schema', violations: validation?.violations }, 400);

      const { data: meetArtifact } = await admin.from('rancang_artifacts')
        .select('id').eq('planning_context_id', planningContextId)
        .eq('artifact_kind', 'MEETING_PLAN').eq('profile_id', profile.id)
        .eq('scope_key', `MEETING_${meetingNo}`).maybeSingle();
      if (!meetArtifact)
        return reply({ error: `Meeting Plan pertemuan ${meetingNo} belum ada` }, 409);

      const { data: sel } = await admin.from('rancang_artifact_selections')
        .select('selected_version_id,selection_revision')
        .eq('artifact_id', meetArtifact.id).maybeSingle();

      const ctxVer = await loadArtifactContent(admin, planningContextId, profile.id, 'CONTEXT_SPEC');
      const asmVer = await loadArtifactContent(admin, planningContextId, profile.id, 'ASSESSMENT_SPEC');
      const matVer = await loadArtifactContent(admin, planningContextId, profile.id, 'MATERIAL_SPEC');
      if (!ctxVer || !asmVer || !matVer)
        return reply({ error: 'Context / Assessment / Material belum tersedia' }, 409);

      const itemId = item.id as string;
      const sourceHash = await sha256({
        kind: 'MEETING_PLAN_EDIT', content: editedContent,
        planning_context_id: planningContextId, meeting_no: meetingNo,
      });
      const depHash = await sha256({
        meeting_allocation_item_id: itemId,
        context_version_id: ctxVer.id, assessment_version_id: asmVer.id,
        material_version_id: matVer.id,
      });
      const idempotencyKey = await makeIdempotencyKey(
        'meet_edit', planningContextId, meetingNo, sourceHash
      );
      const deps = await makeMeetingDeps(
        itemId, ctxVer.id, asmVer.id, matVer.id, sel?.selected_version_id
      );

      const { data: createResult, error: createError } = await admin.rpc('fn_phase2b_create_version', {
        p_profile_id: profile.id, p_planning_context_id: planningContextId,
        p_artifact_kind: 'MEETING_PLAN',
        p_scope_key: `MEETING_${meetingNo}`,
        p_meeting_allocation_item_id: itemId,
        p_parent_version_id: sel?.selected_version_id ?? null,
        p_candidate_of_version_id: null,
        p_origin: 'TEACHER', p_teacher_edited: true,
        p_content: editedContent, p_source_snapshot: authority,
        p_source_hash: sourceHash, p_dependency_hash: depHash,
        p_prompt_version: null, p_model_version: null,
        p_dependencies: deps, p_idempotency_key: idempotencyKey,
      });
      if (createError) throw createError;

      if (!createResult.idempotent) {
        await transitionAndAccept(
          createResult.version_id, validation,
          sel?.selection_revision ?? 0, true,
          'meet_edit_transition', 'meet_edit_validate', 'meet_edit_select'
        );

        // Invalidate downstream: FOLLOW_UP + VALIDATION_REPORT that depend on old version
        if (sel?.selected_version_id) {
          await admin.rpc('fn_phase2b_invalidate_dependants', {
            p_profile_id: profile.id,
            p_dependency_kind: 'ARTIFACT_VERSION',
            p_dependency_id:   sel.selected_version_id,
            p_dependency_hash: await sha256({ id: createResult.version_id }),
            p_reason: `Meeting Plan ${meetingNo} edited — downstream needs update`,
            p_idempotency_prefix: `meet_edit_invalidate:${planningContextId}:${meetingNo}`,
          });
        }
      }

      const { data: state } = await admin.rpc('fn_phase2c_get_pipeline_state', {
        p_profile_id: profile.id, p_planning_context_id: planningContextId,
      });
      return reply({ result: state });
    }

    // ────────────────────────────────────────────────────────────────────────
    // ACTION: select_meeting_candidate
    // ────────────────────────────────────────────────────────────────────────
    if (action === 'select_meeting_candidate') {
      const meetingNo        = Number(body.meeting_no);
      const versionId        = String(body.version_id ?? '');
      const selectionRevision = Number(body.selection_revision ?? 0);
      if (!Number.isInteger(meetingNo) || meetingNo < 1)
        return reply({ error: 'meeting_no harus integer >= 1' }, 400);
      if (!isValidUuidV4(versionId))
        return reply({ error: 'version_id tidak valid' }, 400);

      if (!await verifyVersionBinding(
        admin, versionId, profile.id, planningContextId, 'MEETING_PLAN', `MEETING_${meetingNo}`
      )) return reply({ error: 'Version tidak diizinkan' }, 403);

      const { error: decideErr } = await admin.rpc('fn_phase2b_decide_candidate', {
        p_profile_id: profile.id, p_version_id: versionId,
        p_decision: 'ACCEPT',
        p_expected_selection_revision: selectionRevision,
        p_idempotency_key: await makeIdempotencyKey('meet_select', profile.id, versionId),
      });
      if (decideErr) throw decideErr;

      const { data: state } = await admin.rpc('fn_phase2c_get_pipeline_state', {
        p_profile_id: profile.id, p_planning_context_id: planningContextId,
      });
      return reply({ result: state });
    }

    return reply({ error: 'Action tidak dikenal' }, 400);

  } catch (err) {
    console.error('phase2-meeting', err);
    if ((err as Record<string,unknown>)?.code === '23505' &&
        String((err as Record<string,unknown>)?.message ?? '').includes('uq_one_active_candidate'))
      return reply({ error: 'Regenerate sedang berjalan atau batas tercapai.' }, 409);
    return reply({ error: 'Operasi Meeting gagal' }, 409);
  }
});
