// Phase 2: Material Specification generation + edit.
// All authority comes from server-side JWT + DB lookups.
// Request body carries only intent/identifiers — never authority.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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
const LOCKED_ROLES = new Set(['WALI_KELAS','GURU_MAPEL_SDSMP_SMA','GURU_MAPEL_UMUM_SMK','GURU_MAPEL_PRODUKTIF_SMK']);
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
const PROMPT_VERSION = 'phase2-material-v1.0';
const MODEL = 'claude-sonnet-4-6';

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
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalJson(v)));
  return [...new Uint8Array(bytes)].map(x => x.toString(16).padStart(2,'0')).join('');
}

// ── AI call with retry ────────────────────────────────────────────────────────
async function callAI(systemPrompt: string, userPrompt: string): Promise<string> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY tidak tersedia');
  let lastErr: unknown;
  for (let attempt = 0; attempt <= 2; attempt++) {
    if (attempt > 0) await new Promise(r => setTimeout(r, 400 * attempt));
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
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
        if (res.status >= 400 && res.status < 500) throw new Error(`AI 4xx:${res.status}`);
        lastErr = new Error(`AI ${res.status}: ${t}`); continue;
      }
      const d = await res.json();
      return d?.content?.[0]?.text ?? '';
    } catch (e) {
      if (e instanceof Error && e.message.startsWith('AI 4xx:')) throw e;
      lastErr = e;
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

// ── Material Spec prompt ──────────────────────────────────────────────────────
function buildMaterialSpecPrompt(
  authority: Record<string, unknown>,
  contextContent: unknown,
  assessmentContent: unknown,
): string {
  const {
    jenjang, mapel, tp_judul, tp_deskripsi, elemen_cp,
    class_context, smk_context, meeting_allocation,
  } = authority as Record<string, unknown>;

  const alloc = meeting_allocation as Record<string,unknown>|null;
  const cls = class_context as Record<string,unknown> ?? {};
  const smk = smk_context as Record<string,unknown>|null;
  const ctx = contextContent as Record<string,unknown> ?? {};
  const asm = assessmentContent as Record<string,unknown> ?? {};

  const meetingLines = alloc
    ? (alloc.items as Array<Record<string,unknown>>)
        .map((x: Record<string,unknown>) => `- Pertemuan ${x.meeting_no}: ${x.jp} JP (${x.duration_minutes} menit)`).join('\n')
    : '-';

  const facilities = (cls.fasilitas_tersedia as string[] | undefined) ?? [];
  const forbidden  = (cls.aktivitas_dilarang as string[] | undefined) ?? [];
  const smkSection = smk ? `
Konteks SMK (gunakan HANYA jika relevan terhadap TP):
- Program keahlian: ${smk.program_keahlian ?? '-'}
- Bidang keahlian: ${smk.bidang_keahlian ?? '-'}
- Relevansi dikonfirmasi guru: ${smk.relevance ?? 'tidak dikonfirmasi'}
` : '';

  return `SISTEM: Anda adalah perancang pembelajaran. Tugas Anda HANYA menghasilkan Material Specification.
Jangan menulis RPM, Meeting Plan, atau dokumen lain.
Jangan mengarang fakta lokal. Gunakan HANYA data yang diberikan.
Output HARUS berupa JSON valid murni tanpa teks tambahan, tanpa markdown fence.

SKEMA OUTPUT JSON WAJIB:
{
  "konsep_inti": [
    {
      "id": "MAT-01",
      "judul": "string",
      "penjelasan": "string",
      "prasyarat": ["string"]
    }
  ],
  "miskonsepsi": [
    {
      "id": "MIS-01",
      "miskonsepsi": "string",
      "klarifikasi": "string"
    }
  ],
  "konteks_nyata": [
    {
      "id": "CTX-MAT-01",
      "deskripsi": "string",
      "sumber": "kehidupan_sehari|program_keahlian|daerah|umum"
    }
  ],
  "media_feasible": [
    {
      "jenis": "string",
      "deskripsi": "string",
      "requires_facility": "string|null"
    }
  ],
  "applied_context_decision_ids": ["CTX-01"]
}

ATURAN WAJIB:
1. konsep_inti minimal 1 item — wajib ada id, judul, penjelasan.
2. konteks_nyata minimal 1 item — sumber harus dari nilai yang valid.
3. applied_context_decision_ids minimal 1 ID dari context_decisions yang dikonfirmasi guru.
4. media_feasible HANYA media yang feasible berdasarkan fasilitas kelas yang tersedia.
5. JANGAN menyebut fasilitas yang tidak ada dalam daftar fasilitas_tersedia.
6. JANGAN mengarang fakta lokal yang tidak ada dalam data guru.
7. Program keahlian SMK hanya jadi konteks jika relevan dan dikonfirmasi.

DATA INPUT:
Jenjang: ${jenjang}
Mapel: ${mapel}
TP: ${tp_judul}
Deskripsi TP: ${tp_deskripsi}
Elemen CP: ${Array.isArray(elemen_cp) ? (elemen_cp as string[]).join(', ') : String(elemen_cp ?? '-')}

Alokasi pertemuan dikonfirmasi:
${meetingLines}

Fasilitas kelas yang tersedia:
${facilities.length ? facilities.map(f => `- ${f}`).join('\n') : '- (tidak dispesifikasi)'}

Aktivitas yang dihindari:
${forbidden.length ? forbidden.map(f => `- ${f}`).join('\n') : '- (tidak ada)'}
${smkSection}
Context Specification yang dikonfirmasi guru:
${JSON.stringify(ctx, null, 2)}

Assessment Specification (KKTP) yang dikonfirmasi guru:
${JSON.stringify(asm, null, 2)}

Hasilkan Material Specification yang selaras dengan context decisions dan KKTP di atas.`;
}

// ── Idempotency helpers ───────────────────────────────────────────────────────
async function makeIdempotencyKey(prefix: string, ...parts: unknown[]): Promise<string> {
  return prefix + ':' + await sha256(parts);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function isValidUuidV4(s: string): boolean { return UUID_RE.test(s); }

async function makeRegenKey(
  prefix: string, profileId: string, artifactKind: string,
  planningContextId: string, sourceHash: string, depHash: string,
  clientOperationId: string,
): Promise<string> {
  return prefix + ':' + await sha256({ profileId, artifactKind, planningContextId, sourceHash, depHash, clientOperationId });
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

  // 1. Verify identity from JWT
  const { data: { user } } = await admin.auth.getUser(token);
  if (!user) return reply({ error: 'Unauthorized' }, 401);

  // 2. Verify locked teacher role
  const { data: profile } = await admin.from('profiles')
    .select('id,role,role_guru,role_locked_at,tier')
    .eq('user_id', user.id).single();
  if (!profile || profile.role !== 'GURU' || !profile.role_locked_at || !LOCKED_ROLES.has(profile.role_guru)
      || profile.role_guru !== RANCANG_ROLE || profile.tier !== RANCANG_TIER)
    return reply({ error: rancangDenial(profile) }, 403);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return reply({ error: 'Payload tidak valid' }, 400); }

  const action             = String(body.action ?? '');
  const classroomId        = String(body.classroom_id ?? '');
  const teachingContextId  = String(body.teaching_context_id ?? '');
  const planningContextId  = String(body.planning_context_id ?? '');

  try {
    // 3. Verify classroom ownership
    const { data: classroom } = await admin.from('classrooms').select('id,teacher_id')
      .eq('id', classroomId).maybeSingle();
    if (!classroom || classroom.teacher_id !== profile.id)
      return reply({ error: 'Classroom tidak diizinkan' }, 403);

    // 4. Verify teaching context binding
    const { data: context } = await admin.from('teaching_contexts')
      .select('id,jenjang,subject_key,phase_key,bidang,program_keahlian')
      .eq('id', teachingContextId).eq('profile_id', profile.id).eq('status', 'ACTIVE').maybeSingle();
    const { data: binding } = context
      ? await admin.from('teaching_context_classrooms')
          .select('id').eq('teaching_context_id', context.id)
          .eq('classroom_id', classroomId).eq('status', 'ACTIVE').maybeSingle()
      : { data: null };
    if (!context || !binding) return reply({ error: 'Teaching Context tidak diizinkan' }, 403);

    // 5. Load durable planning context authority
    const { data: pc } = await admin.from('rancang_planning_contexts')
      .select('*').eq('id', planningContextId).eq('profile_id', profile.id)
      .eq('teaching_context_id', context.id).eq('classroom_id', classroomId).maybeSingle();
    if (!pc) return reply({ error: 'Planning Context tidak diizinkan' }, 403);

    // Load TP revision
    const { data: tpRevision } = await admin.from('rancang_tp_revisions')
      .select('id,judul,deskripsi,semester,estimasi_jp,raw_element_value')
      .eq('id', pc.selected_tp_revision_id).maybeSingle();
    if (!tpRevision) return reply({ error: 'TP revision tidak valid' }, 409);

    // Load confirmed meeting allocation
    const { data: alloc } = await admin.from('rancang_meeting_allocations')
      .select('id,total_jp_tp,effective_jp_minutes,revision_no')
      .eq('planning_context_id', planningContextId).is('superseded_at', null).maybeSingle();
    if (!alloc) return reply({ error: 'Meeting Allocation belum dikonfirmasi' }, 409);

    const { data: allocItems } = await admin.from('rancang_meeting_allocation_items')
      .select('meeting_no,jp,duration_minutes').eq('meeting_allocation_id', alloc.id)
      .order('meeting_no');

    // Compose durable server authority
    const elemenCp = Array.isArray(tpRevision.raw_element_value) ? tpRevision.raw_element_value : [];
    const authority: Record<string, unknown> = {
      jenjang:          context.jenjang,
      mapel:            context.subject_key,
      fase:             context.phase_key,
      tp_judul:         tpRevision.judul,
      tp_deskripsi:     tpRevision.deskripsi,
      tp_id:            pc.tp_id,
      tp_revision_id:   tpRevision.id,
      elemen_cp:        elemenCp,
      teacher_intent:   pc.teacher_intent_snapshot,
      preferences:      pc.preferences_snapshot,
      class_context:    pc.class_context_snapshot,
      smk_context:      pc.smk_context_snapshot,
      meeting_allocation: {
        id: alloc.id, total_jp_tp: alloc.total_jp_tp,
        effective_jp_minutes: alloc.effective_jp_minutes,
        items: allocItems ?? [],
      },
    };

    // ── Action: generate_material_spec ────────────────────────────────────────
    if (action === 'generate_material_spec' || action === 'regenerate_material_spec') {
      const isRegenerate = action === 'regenerate_material_spec';

      // Gate (server-side): ASSESSMENT_SPEC must be confirmed + usable
      const { data: asmConfirmed } = await admin.rpc('fn_phase2c_assessment_spec_confirmed', {
        p_profile_id: profile.id, p_planning_context_id: planningContextId,
      });
      if (!asmConfirmed)
        return reply({ error: 'Assessment Specification belum dikonfirmasi — selesaikan Checkpoint 2 dulu' }, 409);

      // Load confirmed context + assessment content (from DB, not from body)
      const { data: ctxArtifact } = await admin.from('rancang_artifacts')
        .select('id').eq('planning_context_id', planningContextId)
        .eq('artifact_kind', 'CONTEXT_SPEC').eq('profile_id', profile.id).maybeSingle();
      const { data: ctxSel } = await admin.from('rancang_artifact_selections')
        .select('selected_version_id').eq('artifact_id', ctxArtifact!.id).maybeSingle();
      const { data: ctxVersion } = await admin.from('rancang_artifact_versions')
        .select('id,content').eq('id', ctxSel!.selected_version_id).maybeSingle();

      const { data: asmArtifact } = await admin.from('rancang_artifacts')
        .select('id').eq('planning_context_id', planningContextId)
        .eq('artifact_kind', 'ASSESSMENT_SPEC').eq('profile_id', profile.id).maybeSingle();
      const { data: asmSel } = await admin.from('rancang_artifact_selections')
        .select('selected_version_id').eq('artifact_id', asmArtifact!.id).maybeSingle();
      const { data: asmVersion } = await admin.from('rancang_artifact_versions')
        .select('id,content').eq('id', asmSel!.selected_version_id).maybeSingle();

      // Check regenerate limit (server-side): count versions with candidate_of_version_id NOT NULL
      const { data: matArtifact } = await admin.from('rancang_artifacts')
        .select('id').eq('planning_context_id', planningContextId)
        .eq('artifact_kind', 'MATERIAL_SPEC').eq('profile_id', profile.id).maybeSingle();

      if (isRegenerate) {
        if (!matArtifact) return reply({ error: 'Belum ada Material untuk di-regenerate' }, 409);
        const { count: regenCount } = await admin.from('rancang_artifact_versions')
          .select('id', { count: 'exact', head: true })
          .eq('artifact_id', matArtifact.id)
          .not('candidate_of_version_id', 'is', null);
        if ((regenCount ?? 0) >= 1)
          return reply({ error: 'Batas regenerate Material sudah tercapai. Gunakan edit manual.' }, 409);
      }

      // Compute hashes — bound to confirmed versions, not timestamps
      const sourceHash = await sha256({
        kind: 'MATERIAL_SPEC',
        planning_context_id: planningContextId,
        tp_revision_id: tpRevision.id,
        meeting_allocation_id: alloc.id,
        context_version_id: ctxVersion!.id,
        assessment_version_id: asmVersion!.id,
      });
      const depHash = await sha256({
        tp_revision_id: tpRevision.id,
        meeting_allocation_id: alloc.id,
        context_version_id: ctxVersion!.id,
        assessment_version_id: asmVersion!.id,
      });

      let candidateOfVersionId: string | null = null;
      if (isRegenerate && matArtifact) {
        const { data: matSel } = await admin.from('rancang_artifact_selections')
          .select('selected_version_id').eq('artifact_id', matArtifact.id).maybeSingle();
        if (matSel) candidateOfVersionId = matSel.selected_version_id;
      }

      let idempotencyKey: string;
      if (isRegenerate) {
        const clientOpId = String(body.client_operation_id ?? '');
        if (!isValidUuidV4(clientOpId))
          return reply({ error: 'client_operation_id harus UUID v4 yang valid' }, 400);
        idempotencyKey = await makeRegenKey(
          'mat_regen', profile.id, 'MATERIAL_SPEC', planningContextId, sourceHash, depHash, clientOpId,
        );
      } else {
        idempotencyKey = await makeIdempotencyKey('mat_gen', planningContextId, sourceHash, 'initial');
      }

      // Call AI
      const raw = await callAI(
        'Anda adalah perancang pembelajaran. Hanya keluarkan JSON valid tanpa teks tambahan, tanpa markdown fence.',
        buildMaterialSpecPrompt(authority, ctxVersion!.content, asmVersion!.content)
      );
      let content: unknown;
      try { content = extractJson(raw); }
      catch { return reply({ error: 'Output AI tidak valid — coba lagi' }, 409); }

      // Deterministic schema validation
      const { data: validation } = await admin.rpc('fn_phase2_validate_material_spec', {
        p_content: content,
      });
      if (validation?.status !== 'valid') {
        console.error('Material spec validation failed:', validation);
        return reply({ error: 'Output AI tidak memenuhi schema — coba lagi', violations: validation?.violations }, 409);
      }

      const dependencies = [
        { kind: 'PLANNING_CONTEXT', planning_context_id: planningContextId, hash: await sha256({ id: planningContextId }) },
        { kind: 'TP_REVISION', tp_revision_id: tpRevision.id, hash: await sha256({ id: tpRevision.id }) },
        { kind: 'MEETING_ALLOCATION', meeting_allocation_id: alloc.id, hash: await sha256({ id: alloc.id }) },
        { kind: 'ARTIFACT_VERSION', artifact_version_id: ctxVersion!.id, hash: await sha256({ id: ctxVersion!.id }) },
        { kind: 'ARTIFACT_VERSION', artifact_version_id: asmVersion!.id, hash: await sha256({ id: asmVersion!.id }) },
      ];

      const { data: createResult, error: createError } = await admin.rpc('fn_phase2b_create_version', {
        p_profile_id: profile.id, p_planning_context_id: planningContextId,
        p_artifact_kind: 'MATERIAL_SPEC', p_scope_key: 'ROOT',
        p_meeting_allocation_item_id: null,
        p_parent_version_id: null,
        p_candidate_of_version_id: candidateOfVersionId,
        p_origin: 'AI', p_teacher_edited: false,
        p_content: content, p_source_snapshot: authority,
        p_source_hash: sourceHash, p_dependency_hash: depHash,
        p_prompt_version: PROMPT_VERSION, p_model_version: MODEL,
        p_dependencies: dependencies, p_idempotency_key: idempotencyKey,
      });
      if (createError) throw createError;

      const versionId = createResult.version_id;

      if (!createResult.idempotent) {
        await admin.rpc('fn_phase2b_transition_version', {
          p_profile_id: profile.id, p_version_id: versionId,
          p_action: 'GENERATED', p_validation_status: 'VALID',
          p_validation_summary: validation,
          p_reason: 'Material spec AI generation succeeded',
          p_idempotency_key: await makeIdempotencyKey('mat_gen_transition', versionId),
        });
        await admin.rpc('fn_phase2b_transition_version', {
          p_profile_id: profile.id, p_version_id: versionId,
          p_action: 'VALIDATE', p_validation_status: 'VALID',
          p_validation_summary: validation,
          p_reason: null,
          p_idempotency_key: await makeIdempotencyKey('mat_validate', versionId),
        });
        // Initial generate: auto-accept. Regenerate: leave as candidate for teacher selection.
        if (!isRegenerate) {
          await admin.rpc('fn_phase2b_decide_candidate', {
            p_profile_id: profile.id, p_version_id: versionId,
            p_decision: 'ACCEPT', p_expected_selection_revision: 0,
            p_idempotency_key: await makeIdempotencyKey('mat_autoselect', versionId),
          });
        }
      }

      const { data: state } = await admin.rpc('fn_phase2c_get_pipeline_state', {
        p_profile_id: profile.id, p_planning_context_id: planningContextId,
      });
      return reply({ result: state });
    }

    // ── Action: save_material_spec_edit ───────────────────────────────────────
    if (action === 'save_material_spec_edit') {
      const editedContent = body.content;
      if (!editedContent) return reply({ error: 'Content edit tidak boleh kosong' }, 400);

      // Gate: ASSESSMENT_SPEC must still be confirmed
      const { data: asmConfirmed } = await admin.rpc('fn_phase2c_assessment_spec_confirmed', {
        p_profile_id: profile.id, p_planning_context_id: planningContextId,
      });
      if (!asmConfirmed) return reply({ error: 'Assessment Specification belum dikonfirmasi' }, 409);

      // Validate schema
      const { data: validation } = await admin.rpc('fn_phase2_validate_material_spec', {
        p_content: editedContent,
      });
      if (validation?.status !== 'valid')
        return reply({ error: 'Edit tidak memenuhi schema', violations: validation?.violations }, 400);

      const { data: matArtifact } = await admin.from('rancang_artifacts')
        .select('id').eq('planning_context_id', planningContextId)
        .eq('artifact_kind', 'MATERIAL_SPEC').eq('profile_id', profile.id).maybeSingle();
      if (!matArtifact) return reply({ error: 'Artifact Material belum dibuat' }, 409);

      const { data: sel } = await admin.from('rancang_artifact_selections')
        .select('selected_version_id,selection_revision').eq('artifact_id', matArtifact.id).maybeSingle();

      // Load context + assessment version IDs for dependency chain
      const { data: ctxArtifact } = await admin.from('rancang_artifacts')
        .select('id').eq('planning_context_id', planningContextId)
        .eq('artifact_kind', 'CONTEXT_SPEC').eq('profile_id', profile.id).maybeSingle();
      const { data: ctxSel } = await admin.from('rancang_artifact_selections')
        .select('selected_version_id').eq('artifact_id', ctxArtifact!.id).maybeSingle();
      const { data: asmArtifact } = await admin.from('rancang_artifacts')
        .select('id').eq('planning_context_id', planningContextId)
        .eq('artifact_kind', 'ASSESSMENT_SPEC').eq('profile_id', profile.id).maybeSingle();
      const { data: asmSel } = await admin.from('rancang_artifact_selections')
        .select('selected_version_id').eq('artifact_id', asmArtifact!.id).maybeSingle();

      const sourceHash = await sha256({ kind: 'MATERIAL_SPEC_EDIT', content: editedContent, planning_context_id: planningContextId });
      const depHash = await sha256({
        tp_revision_id: tpRevision.id,
        meeting_allocation_id: alloc.id,
        context_version_id: ctxSel!.selected_version_id,
        assessment_version_id: asmSel!.selected_version_id,
      });
      const idempotencyKey = await makeIdempotencyKey('mat_edit', planningContextId, sourceHash);

      const dependencies = [
        { kind: 'PLANNING_CONTEXT', planning_context_id: planningContextId, hash: await sha256({ id: planningContextId }) },
        { kind: 'TP_REVISION', tp_revision_id: tpRevision.id, hash: await sha256({ id: tpRevision.id }) },
        { kind: 'MEETING_ALLOCATION', meeting_allocation_id: alloc.id, hash: await sha256({ id: alloc.id }) },
        { kind: 'ARTIFACT_VERSION', artifact_version_id: ctxSel!.selected_version_id, hash: await sha256({ id: ctxSel!.selected_version_id }) },
        { kind: 'ARTIFACT_VERSION', artifact_version_id: asmSel!.selected_version_id, hash: await sha256({ id: asmSel!.selected_version_id }) },
        ...(sel ? [{ kind: 'ARTIFACT_VERSION', artifact_version_id: sel.selected_version_id, hash: await sha256({ id: sel.selected_version_id }) }] : []),
      ];

      const { data: createResult, error: createError } = await admin.rpc('fn_phase2b_create_version', {
        p_profile_id: profile.id, p_planning_context_id: planningContextId,
        p_artifact_kind: 'MATERIAL_SPEC', p_scope_key: 'ROOT',
        p_meeting_allocation_item_id: null,
        p_parent_version_id: sel?.selected_version_id ?? null,
        p_candidate_of_version_id: null,
        p_origin: 'TEACHER', p_teacher_edited: true,
        p_content: editedContent, p_source_snapshot: authority,
        p_source_hash: sourceHash, p_dependency_hash: depHash,
        p_prompt_version: null, p_model_version: null,
        p_dependencies: dependencies, p_idempotency_key: idempotencyKey,
      });
      if (createError) throw createError;

      if (!createResult.idempotent) {
        await admin.rpc('fn_phase2b_transition_version', {
          p_profile_id: profile.id, p_version_id: createResult.version_id,
          p_action: 'GENERATED', p_validation_status: 'VALID',
          p_validation_summary: validation,
          p_reason: 'Teacher edit material — immutable protected snapshot',
          p_idempotency_key: await makeIdempotencyKey('mat_edit_transition', createResult.version_id),
        });
        await admin.rpc('fn_phase2b_transition_version', {
          p_profile_id: profile.id, p_version_id: createResult.version_id,
          p_action: 'VALIDATE', p_validation_status: 'VALID',
          p_validation_summary: validation, p_reason: null,
          p_idempotency_key: await makeIdempotencyKey('mat_edit_validate', createResult.version_id),
        });
        // Auto-accept teacher edit
        await admin.rpc('fn_phase2b_decide_candidate', {
          p_profile_id: profile.id, p_version_id: createResult.version_id,
          p_decision: 'ACCEPT',
          p_expected_selection_revision: sel?.selection_revision ?? 0,
          p_idempotency_key: await makeIdempotencyKey('mat_edit_select', createResult.version_id),
        });

        // Invalidate downstream: MEETING_PLAN, FOLLOW_UP, VALIDATION_REPORT versions that
        // depend on the old material version.
        if (sel?.selected_version_id) {
          await admin.rpc('fn_phase2b_invalidate_dependants', {
            p_profile_id: profile.id,
            p_dependency_kind: 'ARTIFACT_VERSION',
            p_dependency_id: sel.selected_version_id,
            p_dependency_hash: await sha256({ id: createResult.version_id }),
            p_reason: 'Material edited — downstream artifacts need update',
            p_idempotency_prefix: 'mat_edit_invalidate:' + planningContextId,
          });
        }
      }

      const { data: state } = await admin.rpc('fn_phase2c_get_pipeline_state', {
        p_profile_id: profile.id, p_planning_context_id: planningContextId,
      });
      return reply({ result: state });
    }

    return reply({ error: 'Action tidak dikenal' }, 400);

  } catch (err) {
    console.error('phase2-material', err);
    return reply({ error: 'Operasi Material gagal' }, 409);
  }
});
