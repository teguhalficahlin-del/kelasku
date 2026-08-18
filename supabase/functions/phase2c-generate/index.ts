// Phase 2C: Context Specification and Assessment Specification generation.
// All authority comes from server-side JWT + DB lookups.
// Request body carries only intent/identifiers — never authority.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const LOCKED_ROLES = new Set(['WALI_KELAS','GURU_MAPEL_SDSMP_SMA','GURU_MAPEL_UMUM_SMK','GURU_MAPEL_PRODUKTIF_SMK']);
const PROMPT_VERSION = 'phase2c-v1.0';
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
          max_tokens: 4096,
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
  try { return JSON.parse(raw.trim()); } catch (_) {}
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/s);
  if (fence) { try { return JSON.parse(fence[1].trim()); } catch (_) {} }
  const s = raw.indexOf('{'), e = raw.lastIndexOf('}');
  if (s !== -1 && e > s) { try { return JSON.parse(raw.slice(s, e+1).trim()); } catch (_) {} }
  throw new Error('Output AI tidak dapat diparsing sebagai JSON');
}

// ── Context Spec prompt ───────────────────────────────────────────────────────
function buildContextSpecPrompt(authority: Record<string, unknown>): string {
  const {
    jenjang, mapel, fase, tp_judul, tp_deskripsi,
    teacher_intent, preferences, class_context, smk_context,
    meeting_allocation, elemen_cp,
  } = authority as Record<string, unknown>;

  const alloc = meeting_allocation as Record<string,unknown>|null;
  const intent = teacher_intent as Record<string,unknown> ?? {};
  const pref = preferences as Record<string,unknown> ?? {};
  const cls = class_context as Record<string,unknown> ?? {};
  const smk = smk_context as Record<string,unknown>|null;

  const meetingLines = alloc ? (alloc.items as Array<Record<string,unknown>>)
    .map((x:Record<string,unknown>) => `- Pertemuan ${x.meeting_no}: ${x.jp} JP (${x.duration_minutes} menit)`).join('\n') : '-';

  const smkSection = smk ? `
SMK Context (gunakan hanya bila relevan terhadap TP):
- Program keahlian: ${smk.program_keahlian ?? '-'}
- Bidang keahlian: ${smk.bidang_keahlian ?? '-'}
- Relevansi dikonfirmasi guru: ${smk.relevance ?? 'tidak dikonfirmasi'}
` : '';

  return `SISTEM: Anda adalah perancang pembelajaran. Tugas Anda HANYA menghasilkan Context Specification.
Jangan menulis RPM. Jangan mengarang fakta lokal. Gunakan HANYA data yang diberikan.
Output HARUS berupa JSON valid murni tanpa teks tambahan, tanpa markdown fence.

SKEMA OUTPUT JSON WAJIB:
{
  "context_decisions": [
    {
      "id": "CTX-01",
      "source": "step_0|step_2|step_3a|step_3b|step_5|smk|meeting_allocation",
      "raw": "data asli dari input",
      "interpretation": "apa artinya bagi desain pembelajaran",
      "implication": "konsekuensi konkret untuk perancangan",
      "prefer": ["pendekatan yang didukung data ini"],
      "avoid": ["yang harus dihindari"]
    }
  ],
  "constraints": ["kendala hard yang harus dipatuhi seluruh pipeline"],
  "contextual_opportunities": ["peluang kontekstualisasi yang spesifik dan dapat diterapkan"],
  "risks": ["risiko pedagogis berdasarkan data"],
  "irrelevant_context": ["data yang tidak relevan terhadap TP ini dan tidak perlu dimasukkan RPM"]
}

ATURAN WAJIB:
1. Setiap context_decision harus menggunakan rantai raw → interpretation → implication → prefer/avoid.
2. Jangan menyalin field mentah sebagai output — setiap field harus dianalisis.
3. Constraints berasal dari data nyata (fasilitas, aktivitas dilarang, kemandirian siswa, dll).
4. Program keahlian SMK hanya jadi konteks jika relevan dan dikonfirmasi.
5. Jangan mengarang kondisi siswa atau fasilitas yang tidak disebutkan.
6. Jika data tidak relevan terhadap TP, masukkan ke irrelevant_context dan jangan dipaksakan.
7. Beri ID stabil setiap decision (CTX-01, CTX-02, dst) agar validator dapat menelusurinya.

DATA INPUT:
Jenjang: ${jenjang}
Mapel: ${mapel}
Fase: ${fase}
TP terpilih: ${tp_judul}
Deskripsi TP: ${tp_deskripsi}
Elemen CP relevan: ${Array.isArray(elemen_cp) ? (elemen_cp as string[]).join(', ') : String(elemen_cp ?? '-')}

Alokasi pertemuan yang dikonfirmasi guru:
${meetingLines}

Niat guru (Step 3A):
${JSON.stringify(intent, null, 2)}

Preferensi (Step 3B):
${JSON.stringify(pref, null, 2)}

Konteks kelas (Step 5):
${JSON.stringify(cls, null, 2)}
${smkSection}
Hasilkan context_decisions untuk SETIAP data yang relevan. Minimal 3 decision.`;
}

// ── Assessment Spec prompt ────────────────────────────────────────────────────
function buildAssessmentSpecPrompt(authority: Record<string, unknown>, contextContent: unknown): string {
  const {
    jenjang, mapel, tp_judul, tp_deskripsi, elemen_cp,
    meeting_allocation, preferences,
  } = authority as Record<string, unknown>;

  const alloc = meeting_allocation as Record<string,unknown>|null;
  const pref = preferences as Record<string,unknown> ?? {};
  const meetingCount = alloc ? (alloc.items as unknown[]).length : 1;

  return `SISTEM: Anda adalah perancang pembelajaran. Tugas Anda HANYA menghasilkan Assessment Specification + KKTP.
Gunakan backward design: tetapkan bukti ketercapaian SEBELUM merancang aktivitas.
Output HARUS berupa JSON valid murni tanpa teks tambahan, tanpa markdown fence.
JANGAN hasilkan Material Specification, Meeting Plan, atau artefak tahap berikutnya.

SKEMA OUTPUT JSON WAJIB:
{
  "success_evidence": ["bukti nyata yang dapat diamati ketika TP tercapai (minimal 2)"],
  "kktp": [
    {
      "id": "KKTP-01",
      "deskripsi": "kriteria ketercapaian tujuan pembelajaran yang observable dan measurable",
      "paham": "indikator observable siswa sudah paham",
      "hampir": "indikator observable siswa hampir paham",
      "belum": "indikator observable siswa belum paham"
    }
  ],
  "diagnostic": {
    "tujuan": "apa yang ingin diketahui sebelum pembelajaran",
    "instrumen": "cara konkret melakukan diagnostik (maks 5 menit, tanpa fasilitas terlarang)"
  },
  "formative": [
    {
      "meeting_no": 1,
      "expected_evidence": "bukti belajar yang harus terlihat pada pertemuan ini",
      "classification_anchor": {
        "paham": "indikator observable paham di pertemuan ini",
        "hampir": "indikator observable hampir paham",
        "belum": "indikator observable belum paham"
      },
      "response": {
        "paham": "tindakan konkret guru/siswa berikutnya",
        "hampir": "tindakan konkret guru/siswa berikutnya",
        "belum": "tindakan konkret guru/siswa berikutnya"
      }
    }
  ],
  "summative": {
    "jenis": "jenis asesmen akhir",
    "instrumen": "instrumen atau tugas konkret",
    "rubrik": ["kriteria penilaian"]
  },
  "instruments": ["instrumen/rubrik opsional tambahan"],
  "scoring_guidance": {}
}

ATURAN WAJIB:
1. KKTP harus observable dan measurable — hindari 'memahami dengan baik' tanpa bukti konkret.
2. Setiap formative checkpoint harus untuk setiap pertemuan (${meetingCount} pertemuan).
3. Paham/Hampir/Belum harus memiliki classification_anchor yang selaras dengan KKTP.
4. Asesmen tidak boleh menggunakan fasilitas yang dikonfirmasi tidak tersedia.
5. Pendekatan penilaian utama guru harus dijadikan acuan jenis asesmen.

DATA INPUT:
Jenjang: ${jenjang}
Mapel: ${mapel}
TP: ${tp_judul}
Deskripsi TP: ${tp_deskripsi}
Elemen CP: ${Array.isArray(elemen_cp) ? (elemen_cp as string[]).join(', ') : String(elemen_cp ?? '-')}
Jumlah pertemuan: ${meetingCount}
Cara penilaian utama guru: ${JSON.stringify((pref as Record<string,unknown>).cara_penilaian ?? '-')}

Context Specification yang dikonfirmasi guru:
${JSON.stringify(contextContent, null, 2)}

Hasilkan asesmen yang benar-benar mengukur TP di atas, selaras dengan context decisions.`;
}

// ── Idempotency key ───────────────────────────────────────────────────────────
async function makeIdempotencyKey(prefix: string, ...parts: unknown[]): Promise<string> {
  return prefix + ':' + await sha256(parts);
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
    .select('id,role,role_guru,role_locked_at')
    .eq('user_id', user.id).single();
  if (!profile || profile.role !== 'GURU' || !profile.role_locked_at || !LOCKED_ROLES.has(profile.role_guru))
    return reply({ error: 'Locked teacher role diperlukan' }, 403);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return reply({ error: 'Payload tidak valid' }, 400); }

  const action = String(body.action ?? '');
  const classroomId = String(body.classroom_id ?? '');
  const teachingContextId = String(body.teaching_context_id ?? '');
  const planningContextId = String(body.planning_context_id ?? '');

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

    // ── Action: get_pipeline_state ──────────────────────────────────────────
    if (action === 'get_pipeline_state') {
      const { data, error } = await admin.rpc('fn_phase2c_get_pipeline_state', {
        p_profile_id: profile.id, p_planning_context_id: planningContextId,
      });
      if (error) throw error;
      return reply({ result: data });
    }

    // ── Load durable planning context authority ─────────────────────────────
    const { data: pc } = await admin.from('rancang_planning_contexts')
      .select('*').eq('id', planningContextId).eq('profile_id', profile.id)
      .eq('teaching_context_id', context.id).eq('classroom_id', classroomId).maybeSingle();
    if (!pc) return reply({ error: 'Planning Context tidak diizinkan' }, 403);

    // Load TP revision
    const { data: tpRevision } = await admin.from('rancang_tp_revisions')
      .select('id,judul,deskripsi,semester,estimasi_jp,raw_element_value')
      .eq('id', pc.selected_tp_revision_id).maybeSingle();
    if (!tpRevision) return reply({ error: 'TP revision tidak valid' }, 409);

    // Load TP
    const { data: tp } = await admin.from('rancang_tp')
      .select('id,atp_id').eq('id', pc.tp_id).maybeSingle();

    // Load confirmed meeting allocation
    const { data: alloc } = await admin.from('rancang_meeting_allocations')
      .select('id,total_jp_tp,effective_jp_minutes,revision_no')
      .eq('planning_context_id', planningContextId).is('superseded_at', null).maybeSingle();
    if (!alloc) return reply({ error: 'Meeting Allocation belum dikonfirmasi' }, 409);

    const { data: allocItems } = await admin.from('rancang_meeting_allocation_items')
      .select('meeting_no,jp,duration_minutes').eq('meeting_allocation_id', alloc.id)
      .order('meeting_no');

    // Compose durable server authority (never from request body)
    const mapelLabel = context.subject_key;
    const elemenCp = Array.isArray(tpRevision.raw_element_value)
      ? tpRevision.raw_element_value : [];

    const authority: Record<string, unknown> = {
      jenjang: context.jenjang,
      mapel: mapelLabel,
      fase: context.phase_key,
      tp_judul: tpRevision.judul,
      tp_deskripsi: tpRevision.deskripsi,
      tp_id: pc.tp_id,
      tp_revision_id: tpRevision.id,
      elemen_cp: elemenCp,
      teacher_intent: pc.teacher_intent_snapshot,
      preferences: pc.preferences_snapshot,
      class_context: pc.class_context_snapshot,
      smk_context: pc.smk_context_snapshot,
      meeting_allocation: {
        id: alloc.id, total_jp_tp: alloc.total_jp_tp,
        effective_jp_minutes: alloc.effective_jp_minutes,
        items: allocItems ?? [],
      },
    };

    // ── Action: generate_context_spec ───────────────────────────────────────
    if (action === 'generate_context_spec' || action === 'regenerate_context_spec') {
      const isRegenerate = action === 'regenerate_context_spec';

      // Idempotency: same logical request (same source_hash) is idempotent
      const sourceHash = await sha256({
        kind: 'CONTEXT_SPEC', planning_context_id: planningContextId,
        tp_revision_id: tpRevision.id, meeting_allocation_id: alloc.id,
        intent: pc.teacher_intent_snapshot, preferences: pc.preferences_snapshot,
        class_context: pc.class_context_snapshot,
      });
      const depHash = await sha256({
        tp_revision_id: tpRevision.id, meeting_allocation_id: alloc.id,
      });

      // Determine parent version for regenerate
      let candidateOfVersionId: string | null = null;
      if (isRegenerate) {
        const { data: existingArtifact } = await admin.from('rancang_artifacts')
          .select('id').eq('planning_context_id', planningContextId)
          .eq('artifact_kind', 'CONTEXT_SPEC').eq('profile_id', profile.id).maybeSingle();
        if (existingArtifact) {
          const { data: sel } = await admin.from('rancang_artifact_selections')
            .select('selected_version_id').eq('artifact_id', existingArtifact.id).maybeSingle();
          if (sel) candidateOfVersionId = sel.selected_version_id;
        }
      }

      const idempotencyKey = await makeIdempotencyKey(
        isRegenerate ? 'ctx_regen' : 'ctx_gen',
        planningContextId, sourceHash, isRegenerate ? Date.now() : 'initial'
      );

      // Call AI
      const raw = await callAI(
        'Anda adalah perancang pembelajaran. Hanya keluarkan JSON valid tanpa teks tambahan.',
        buildContextSpecPrompt(authority)
      );
      let content: unknown;
      try { content = extractJson(raw); }
      catch { return reply({ error: 'Output AI tidak valid — coba lagi' }, 409); }

      // Deterministic validation
      const { data: validation } = await admin.rpc('fn_phase2c_validate_context_spec', {
        p_content: content,
      });
      if (validation?.status !== 'valid') {
        console.error('Context spec validation failed:', validation);
        return reply({ error: 'Output AI tidak memenuhi schema — coba lagi', violations: validation?.violations }, 409);
      }

      // Persist via Phase 2B lifecycle RPC
      const dependencies = [
        { kind: 'PLANNING_CONTEXT', planning_context_id: planningContextId, hash: await sha256({ id: planningContextId }) },
        { kind: 'TP_REVISION', tp_revision_id: tpRevision.id, hash: await sha256({ id: tpRevision.id }) },
        { kind: 'MEETING_ALLOCATION', meeting_allocation_id: alloc.id, hash: await sha256({ id: alloc.id }) },
      ];

      const { data: createResult, error: createError } = await admin.rpc('fn_phase2b_create_version', {
        p_profile_id: profile.id, p_planning_context_id: planningContextId,
        p_artifact_kind: 'CONTEXT_SPEC', p_scope_key: 'ROOT',
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

      // Transition to GENERATED
      if (!createResult.idempotent) {
        await admin.rpc('fn_phase2b_transition_version', {
          p_profile_id: profile.id, p_version_id: versionId,
          p_action: 'GENERATED', p_validation_status: 'VALID',
          p_validation_summary: validation,
          p_reason: 'Context spec AI generation succeeded',
          p_idempotency_key: await makeIdempotencyKey('ctx_gen_transition', versionId),
        });
        await admin.rpc('fn_phase2b_transition_version', {
          p_profile_id: profile.id, p_version_id: versionId,
          p_action: 'VALIDATE', p_validation_status: 'VALID',
          p_validation_summary: validation,
          p_reason: null, p_idempotency_key: await makeIdempotencyKey('ctx_validate', versionId),
        });
      }

      // If initial generation (not regenerate), auto-select
      if (!isRegenerate) {
        await admin.rpc('fn_phase2b_decide_candidate', {
          p_profile_id: profile.id, p_version_id: versionId,
          p_decision: 'ACCEPT', p_expected_selection_revision: 0,
          p_idempotency_key: await makeIdempotencyKey('ctx_autoselect', versionId),
        });
      }

      const { data: state } = await admin.rpc('fn_phase2c_get_pipeline_state', {
        p_profile_id: profile.id, p_planning_context_id: planningContextId,
      });
      return reply({ result: state });
    }

    // ── Action: save_context_spec_edit ──────────────────────────────────────
    if (action === 'save_context_spec_edit') {
      const editedContent = body.content;
      if (!editedContent) return reply({ error: 'Content edit tidak boleh kosong' }, 400);

      const { data: validation } = await admin.rpc('fn_phase2c_validate_context_spec', {
        p_content: editedContent,
      });
      if (validation?.status !== 'valid')
        return reply({ error: 'Edit tidak memenuhi schema', violations: validation?.violations }, 400);

      // Find current selected version to mark as parent
      const { data: artifact } = await admin.from('rancang_artifacts')
        .select('id').eq('planning_context_id', planningContextId)
        .eq('artifact_kind', 'CONTEXT_SPEC').eq('profile_id', profile.id).maybeSingle();
      if (!artifact) return reply({ error: 'Artifact belum dibuat' }, 409);

      const { data: sel } = await admin.from('rancang_artifact_selections')
        .select('selected_version_id,selection_revision').eq('artifact_id', artifact.id).maybeSingle();

      const sourceHash = await sha256({ kind: 'CONTEXT_SPEC_EDIT', content: editedContent, planning_context_id: planningContextId });
      const depHash = await sha256({ tp_revision_id: tpRevision.id, meeting_allocation_id: alloc.id });
      const idempotencyKey = await makeIdempotencyKey('ctx_edit', planningContextId, sourceHash);

      const dependencies = [
        { kind: 'PLANNING_CONTEXT', planning_context_id: planningContextId, hash: await sha256({ id: planningContextId }) },
        { kind: 'TP_REVISION', tp_revision_id: tpRevision.id, hash: await sha256({ id: tpRevision.id }) },
        { kind: 'MEETING_ALLOCATION', meeting_allocation_id: alloc.id, hash: await sha256({ id: alloc.id }) },
        ...(sel ? [{ kind: 'ARTIFACT_VERSION', artifact_version_id: sel.selected_version_id, hash: await sha256({ id: sel.selected_version_id }) }] : []),
      ];

      const { data: createResult, error: createError } = await admin.rpc('fn_phase2b_create_version', {
        p_profile_id: profile.id, p_planning_context_id: planningContextId,
        p_artifact_kind: 'CONTEXT_SPEC', p_scope_key: 'ROOT',
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
          p_reason: 'Teacher edit — immutable protected snapshot',
          p_idempotency_key: await makeIdempotencyKey('ctx_edit_transition', createResult.version_id),
        });
        await admin.rpc('fn_phase2b_transition_version', {
          p_profile_id: profile.id, p_version_id: createResult.version_id,
          p_action: 'VALIDATE', p_validation_status: 'VALID',
          p_validation_summary: validation, p_reason: null,
          p_idempotency_key: await makeIdempotencyKey('ctx_edit_validate', createResult.version_id),
        });
        // Auto-accept teacher edit as selected version
        await admin.rpc('fn_phase2b_decide_candidate', {
          p_profile_id: profile.id, p_version_id: createResult.version_id,
          p_decision: 'ACCEPT',
          p_expected_selection_revision: sel?.selection_revision ?? 0,
          p_idempotency_key: await makeIdempotencyKey('ctx_edit_select', createResult.version_id),
        });
      }

      const { data: state } = await admin.rpc('fn_phase2c_get_pipeline_state', {
        p_profile_id: profile.id, p_planning_context_id: planningContextId,
      });
      return reply({ result: state });
    }

    // ── Action: confirm_context_spec ────────────────────────────────────────
    if (action === 'confirm_context_spec') {
      const versionId = String(body.version_id ?? '');
      if (!versionId) return reply({ error: 'version_id diperlukan' }, 400);

      const idempotencyKey = await makeIdempotencyKey('ctx_confirm', planningContextId, versionId);
      const { data, error } = await admin.rpc('fn_phase2b_transition_version', {
        p_profile_id: profile.id, p_version_id: versionId,
        p_action: 'CONFIRM', p_validation_status: null, p_validation_summary: null,
        p_reason: 'Teacher confirmed Context Specification — Checkpoint 1',
        p_idempotency_key: idempotencyKey,
      });
      if (error) throw error;

      // Selective invalidation: if assessment depends on a DIFFERENT (older) context version,
      // mark it as needs_update. Only triggered when assessment exists and context changed.
      const { data: asmArtifact } = await admin.from('rancang_artifacts')
        .select('id').eq('planning_context_id', planningContextId)
        .eq('artifact_kind', 'ASSESSMENT_SPEC').eq('profile_id', profile.id).maybeSingle();
      if (asmArtifact) {
        const { data: asmSel } = await admin.from('rancang_artifact_selections')
          .select('selected_version_id').eq('artifact_id', asmArtifact.id).maybeSingle();
        if (asmSel) {
          // Check if assessment's ARTIFACT_VERSION dep matches the confirmed context version
          const { count: matchCount } = await admin.from('rancang_artifact_dependencies')
            .select('id', { count: 'exact', head: true })
            .eq('artifact_version_id', asmSel.selected_version_id)
            .eq('dependency_kind', 'ARTIFACT_VERSION')
            .eq('depends_on_version_id', versionId);
          if (!matchCount) {
            // Assessment was built on a stale context version — find which one
            const { data: oldCtxDep } = await admin.from('rancang_artifact_dependencies')
              .select('depends_on_version_id')
              .eq('artifact_version_id', asmSel.selected_version_id)
              .eq('dependency_kind', 'ARTIFACT_VERSION')
              .maybeSingle();
            if (oldCtxDep?.depends_on_version_id) {
              // Pass new context version hash so stored old hash differs → triggers invalidation
              await admin.rpc('fn_phase2b_invalidate_dependants', {
                p_profile_id: profile.id, p_dependency_kind: 'ARTIFACT_VERSION',
                p_dependency_id: oldCtxDep.depends_on_version_id,
                p_dependency_hash: await sha256({ id: versionId }),
                p_reason: 'Context confirmed with new version — assessment built on stale context',
                p_idempotency_prefix: 'ctx_confirm_invalidate:' + planningContextId,
              });
            }
          }
        }
      }

      const { data: state } = await admin.rpc('fn_phase2c_get_pipeline_state', {
        p_profile_id: profile.id, p_planning_context_id: planningContextId,
      });
      return reply({ result: state });
    }

    // ── Action: select_context_candidate ────────────────────────────────────
    if (action === 'select_context_candidate') {
      const versionId = String(body.version_id ?? '');
      const selRev = Number(body.selection_revision ?? 0);
      if (!versionId) return reply({ error: 'version_id diperlukan' }, 400);

      const { error } = await admin.rpc('fn_phase2b_decide_candidate', {
        p_profile_id: profile.id, p_version_id: versionId,
        p_decision: 'ACCEPT', p_expected_selection_revision: selRev,
        p_idempotency_key: await makeIdempotencyKey('ctx_select', versionId, selRev),
      });
      if (error) throw error;

      const { data: state } = await admin.rpc('fn_phase2c_get_pipeline_state', {
        p_profile_id: profile.id, p_planning_context_id: planningContextId,
      });
      return reply({ result: state });
    }

    // ── Action: generate_assessment_spec ────────────────────────────────────
    if (action === 'generate_assessment_spec' || action === 'regenerate_assessment_spec') {
      const isRegenerate = action === 'regenerate_assessment_spec';

      // Gate: CONTEXT_SPEC must be confirmed
      const { data: gateOk } = await admin.rpc('fn_phase2c_context_spec_confirmed', {
        p_profile_id: profile.id, p_planning_context_id: planningContextId,
      });
      if (!gateOk) return reply({ error: 'Context Specification belum dikonfirmasi — selesaikan Checkpoint 1 dulu' }, 409);

      // Load confirmed context spec content
      const { data: ctxArtifact } = await admin.from('rancang_artifacts')
        .select('id').eq('planning_context_id', planningContextId)
        .eq('artifact_kind', 'CONTEXT_SPEC').eq('profile_id', profile.id).maybeSingle();
      const { data: ctxSel } = await admin.from('rancang_artifact_selections')
        .select('selected_version_id,selection_revision').eq('artifact_id', ctxArtifact!.id).maybeSingle();
      const { data: ctxVersion } = await admin.from('rancang_artifact_versions')
        .select('id,content,source_hash').eq('id', ctxSel!.selected_version_id).maybeSingle();

      const sourceHash = await sha256({
        kind: 'ASSESSMENT_SPEC', planning_context_id: planningContextId,
        tp_revision_id: tpRevision.id, meeting_allocation_id: alloc.id,
        context_version_id: ctxVersion!.id,
      });
      const depHash = await sha256({
        tp_revision_id: tpRevision.id, meeting_allocation_id: alloc.id,
        context_version_id: ctxVersion!.id,
      });

      let candidateOfVersionId: string | null = null;
      if (isRegenerate) {
        const { data: existingAsmArtifact } = await admin.from('rancang_artifacts')
          .select('id').eq('planning_context_id', planningContextId)
          .eq('artifact_kind', 'ASSESSMENT_SPEC').eq('profile_id', profile.id).maybeSingle();
        if (existingAsmArtifact) {
          const { data: sel } = await admin.from('rancang_artifact_selections')
            .select('selected_version_id').eq('artifact_id', existingAsmArtifact.id).maybeSingle();
          if (sel) candidateOfVersionId = sel.selected_version_id;
        }
      }

      const idempotencyKey = await makeIdempotencyKey(
        isRegenerate ? 'asm_regen' : 'asm_gen',
        planningContextId, sourceHash, isRegenerate ? Date.now() : 'initial'
      );

      const raw = await callAI(
        'Anda adalah perancang pembelajaran. Hanya keluarkan JSON valid tanpa teks tambahan.',
        buildAssessmentSpecPrompt(authority, ctxVersion!.content)
      );
      let content: unknown;
      try { content = extractJson(raw); }
      catch { return reply({ error: 'Output AI tidak valid — coba lagi' }, 409); }

      const { data: validation } = await admin.rpc('fn_phase2c_validate_assessment_spec', {
        p_content: content,
      });
      if (validation?.status !== 'valid') {
        console.error('Assessment spec validation failed:', validation);
        return reply({ error: 'Output AI tidak memenuhi schema — coba lagi', violations: validation?.violations }, 409);
      }

      const dependencies = [
        { kind: 'PLANNING_CONTEXT', planning_context_id: planningContextId, hash: await sha256({ id: planningContextId }) },
        { kind: 'TP_REVISION', tp_revision_id: tpRevision.id, hash: await sha256({ id: tpRevision.id }) },
        { kind: 'MEETING_ALLOCATION', meeting_allocation_id: alloc.id, hash: await sha256({ id: alloc.id }) },
        { kind: 'ARTIFACT_VERSION', artifact_version_id: ctxVersion!.id, hash: await sha256({ id: ctxVersion!.id }) },
      ];

      const { data: createResult, error: createError } = await admin.rpc('fn_phase2b_create_version', {
        p_profile_id: profile.id, p_planning_context_id: planningContextId,
        p_artifact_kind: 'ASSESSMENT_SPEC', p_scope_key: 'ROOT',
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

      if (!createResult.idempotent) {
        await admin.rpc('fn_phase2b_transition_version', {
          p_profile_id: profile.id, p_version_id: createResult.version_id,
          p_action: 'GENERATED', p_validation_status: 'VALID',
          p_validation_summary: validation,
          p_reason: 'Assessment spec AI generation succeeded',
          p_idempotency_key: await makeIdempotencyKey('asm_gen_transition', createResult.version_id),
        });
        await admin.rpc('fn_phase2b_transition_version', {
          p_profile_id: profile.id, p_version_id: createResult.version_id,
          p_action: 'VALIDATE', p_validation_status: 'VALID',
          p_validation_summary: validation, p_reason: null,
          p_idempotency_key: await makeIdempotencyKey('asm_validate', createResult.version_id),
        });
      }

      if (!isRegenerate) {
        await admin.rpc('fn_phase2b_decide_candidate', {
          p_profile_id: profile.id, p_version_id: createResult.version_id,
          p_decision: 'ACCEPT', p_expected_selection_revision: 0,
          p_idempotency_key: await makeIdempotencyKey('asm_autoselect', createResult.version_id),
        });
      }

      const { data: state } = await admin.rpc('fn_phase2c_get_pipeline_state', {
        p_profile_id: profile.id, p_planning_context_id: planningContextId,
      });
      return reply({ result: state });
    }

    // ── Action: save_assessment_spec_edit ───────────────────────────────────
    if (action === 'save_assessment_spec_edit') {
      const editedContent = body.content;
      if (!editedContent) return reply({ error: 'Content edit tidak boleh kosong' }, 400);

      const { data: gateOk } = await admin.rpc('fn_phase2c_context_spec_confirmed', {
        p_profile_id: profile.id, p_planning_context_id: planningContextId,
      });
      if (!gateOk) return reply({ error: 'Context Specification belum dikonfirmasi' }, 409);

      const { data: validation } = await admin.rpc('fn_phase2c_validate_assessment_spec', {
        p_content: editedContent,
      });
      if (validation?.status !== 'valid')
        return reply({ error: 'Edit tidak memenuhi schema', violations: validation?.violations }, 400);

      const { data: asmArtifact } = await admin.from('rancang_artifacts')
        .select('id').eq('planning_context_id', planningContextId)
        .eq('artifact_kind', 'ASSESSMENT_SPEC').eq('profile_id', profile.id).maybeSingle();
      if (!asmArtifact) return reply({ error: 'Artifact Assessment belum dibuat' }, 409);

      const { data: sel } = await admin.from('rancang_artifact_selections')
        .select('selected_version_id,selection_revision').eq('artifact_id', asmArtifact.id).maybeSingle();

      // Load confirmed context version for dependency
      const { data: ctxArtifact } = await admin.from('rancang_artifacts')
        .select('id').eq('planning_context_id', planningContextId)
        .eq('artifact_kind', 'CONTEXT_SPEC').eq('profile_id', profile.id).maybeSingle();
      const { data: ctxSel } = await admin.from('rancang_artifact_selections')
        .select('selected_version_id').eq('artifact_id', ctxArtifact!.id).maybeSingle();

      const sourceHash = await sha256({ kind: 'ASSESSMENT_SPEC_EDIT', content: editedContent, planning_context_id: planningContextId });
      const depHash = await sha256({ tp_revision_id: tpRevision.id, meeting_allocation_id: alloc.id, context_version_id: ctxSel!.selected_version_id });
      const idempotencyKey = await makeIdempotencyKey('asm_edit', planningContextId, sourceHash);

      const dependencies = [
        { kind: 'PLANNING_CONTEXT', planning_context_id: planningContextId, hash: await sha256({ id: planningContextId }) },
        { kind: 'TP_REVISION', tp_revision_id: tpRevision.id, hash: await sha256({ id: tpRevision.id }) },
        { kind: 'MEETING_ALLOCATION', meeting_allocation_id: alloc.id, hash: await sha256({ id: alloc.id }) },
        { kind: 'ARTIFACT_VERSION', artifact_version_id: ctxSel!.selected_version_id, hash: await sha256({ id: ctxSel!.selected_version_id }) },
        ...(sel ? [{ kind: 'ARTIFACT_VERSION', artifact_version_id: sel.selected_version_id, hash: await sha256({ id: sel.selected_version_id }) }] : []),
      ];

      const { data: createResult, error: createError } = await admin.rpc('fn_phase2b_create_version', {
        p_profile_id: profile.id, p_planning_context_id: planningContextId,
        p_artifact_kind: 'ASSESSMENT_SPEC', p_scope_key: 'ROOT',
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
          p_reason: 'Teacher edit assessment — immutable protected snapshot',
          p_idempotency_key: await makeIdempotencyKey('asm_edit_transition', createResult.version_id),
        });
        await admin.rpc('fn_phase2b_transition_version', {
          p_profile_id: profile.id, p_version_id: createResult.version_id,
          p_action: 'VALIDATE', p_validation_status: 'VALID',
          p_validation_summary: validation, p_reason: null,
          p_idempotency_key: await makeIdempotencyKey('asm_edit_validate', createResult.version_id),
        });
        await admin.rpc('fn_phase2b_decide_candidate', {
          p_profile_id: profile.id, p_version_id: createResult.version_id,
          p_decision: 'ACCEPT',
          p_expected_selection_revision: sel?.selection_revision ?? 0,
          p_idempotency_key: await makeIdempotencyKey('asm_edit_select', createResult.version_id),
        });
      }

      const { data: state } = await admin.rpc('fn_phase2c_get_pipeline_state', {
        p_profile_id: profile.id, p_planning_context_id: planningContextId,
      });
      return reply({ result: state });
    }

    // ── Action: confirm_assessment_spec ─────────────────────────────────────
    if (action === 'confirm_assessment_spec') {
      const versionId = String(body.version_id ?? '');
      if (!versionId) return reply({ error: 'version_id diperlukan' }, 400);

      const { data: gateOk } = await admin.rpc('fn_phase2c_context_spec_confirmed', {
        p_profile_id: profile.id, p_planning_context_id: planningContextId,
      });
      if (!gateOk) return reply({ error: 'Context Specification belum dikonfirmasi' }, 409);

      const { data, error } = await admin.rpc('fn_phase2b_transition_version', {
        p_profile_id: profile.id, p_version_id: versionId,
        p_action: 'CONFIRM', p_validation_status: null, p_validation_summary: null,
        p_reason: 'Teacher confirmed Assessment Specification — Checkpoint 2',
        p_idempotency_key: await makeIdempotencyKey('asm_confirm', planningContextId, versionId),
      });
      if (error) throw error;

      const { data: state } = await admin.rpc('fn_phase2c_get_pipeline_state', {
        p_profile_id: profile.id, p_planning_context_id: planningContextId,
      });
      return reply({ result: state });
    }

    // ── Action: select_assessment_candidate ─────────────────────────────────
    if (action === 'select_assessment_candidate') {
      const versionId = String(body.version_id ?? '');
      const selRev = Number(body.selection_revision ?? 0);
      if (!versionId) return reply({ error: 'version_id diperlukan' }, 400);

      const { error } = await admin.rpc('fn_phase2b_decide_candidate', {
        p_profile_id: profile.id, p_version_id: versionId,
        p_decision: 'ACCEPT', p_expected_selection_revision: selRev,
        p_idempotency_key: await makeIdempotencyKey('asm_select', versionId, selRev),
      });
      if (error) throw error;

      const { data: state } = await admin.rpc('fn_phase2c_get_pipeline_state', {
        p_profile_id: profile.id, p_planning_context_id: planningContextId,
      });
      return reply({ result: state });
    }

    return reply({ error: 'Action tidak dikenal' }, 400);

  } catch (err) {
    console.error('phase2c-generate', err);
    return reply({ error: 'Operasi Phase 2C gagal' }, 409);
  }
});
