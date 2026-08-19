// Phase 2: Meeting Plan generation — one AI call per pertemuan.
// Structural template: phase2-material/index.ts.
// Per-meeting: independent generate, validate, persist. Failed meetings do not block others.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const LOCKED_ROLES = new Set([
  'WALI_KELAS','GURU_MAPEL_SDSMP_SMA','GURU_MAPEL_UMUM_SMK','GURU_MAPEL_PRODUKTIF_SMK',
]);
const PROMPT_VERSION = 'phase2-meeting-v1.0';
const MODEL          = 'claude-sonnet-4-6';
const AI_TIMEOUT_MS  = 55_000;

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
async function callAI(systemPrompt: string, userPrompt: string): Promise<string> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY tidak tersedia');
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
      throw new Error(`AI ${res.status}: ${t}`);
    }
    const d = await res.json();
    return d?.content?.[0]?.text ?? '';
  } finally {
    clearTimeout(timer);
  }
}

function extractJson(raw: string): unknown {
  try { return JSON.parse(raw.trim()); } catch (_) {}
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/s);
  if (fence) { try { return JSON.parse(fence[1].trim()); } catch (_) {} }
  const s = raw.indexOf('{'), e = raw.lastIndexOf('}');
  if (s !== -1 && e > s) { try { return JSON.parse(raw.slice(s, e+1).trim()); } catch (_) {} }
  throw new Error('Output AI tidak dapat diparsing sebagai JSON');
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

  return `IDENTITAS PERTEMUAN (TIDAK BOLEH DIUBAH AI):
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

Output JSON murni — schema wajib sesuai kontrak meeting_plan. Tanpa markdown fence, tanpa teks tambahan.`;
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
      'Hanya keluarkan JSON valid tanpa teks tambahan, tanpa markdown fence.';

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
            const content = extractJson(raw);

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
      try { content = extractJson(raw); }
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
