// Phase 2: RPM Validator — deterministic checks only, NO AI call.
// Produces VALIDATION_REPORT artifact with origin='SYSTEM'.
// Gate: all_meetings_usable AND follow_up usable.

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
  'WALI_KELAS_SD','GURU_MAPEL_SDSMP_SMA','GURU_MAPEL_UMUM_SMK','GURU_MAPEL_PRODUKTIF_SMK',
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

async function makeIdempotencyKey(prefix: string, ...parts: unknown[]): Promise<string> {
  return prefix + ':' + await sha256(parts);
}

// ── Types ─────────────────────────────────────────────────────────────────────
interface Violation {
  id: string;
  scope: string;
  component: string;
  rule: string;
  severity: 'blocking' | 'warning';
  message: string;
  repair_scope: string;
}

// ── Load selected artifact version ─────────────────────────────────────────
async function loadArtifactVersion(
  admin: SupabaseClient<any>,
  planningContextId: string,
  profileId: string,
  kind: string,
  scopeKey = 'ROOT',
): Promise<{ id: string; content: Record<string,unknown>; artifact_id: string; selection_revision: number } | null> {
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

// ── CHECK helpers ─────────────────────────────────────────────────────────────

// Collect all resource_refs from an activities array + worksheet.tasks
function collectResourceRefs(
  activities: Array<Record<string,unknown>>,
  worksheet: Record<string,unknown> | null,
): string[] {
  const refs: string[] = [];
  for (const act of activities) {
    const rr = act.resource_refs as string[] | undefined;
    if (Array.isArray(rr)) refs.push(...rr.filter(r => r && r.trim() !== ''));
  }
  if (worksheet) {
    const tasks = worksheet.tasks as Array<Record<string,unknown>> | undefined;
    if (Array.isArray(tasks)) {
      for (const task of tasks) {
        const rr = task.resource_refs as string[] | undefined;
        if (Array.isArray(rr)) refs.push(...rr.filter(r => r && r.trim() !== ''));
      }
    }
  }
  return refs;
}

// Case-insensitive substring match: ref matches facility if either contains the other
function facilityMatches(ref: string, facilities: string[]): boolean {
  const refLower = ref.toLowerCase();
  return facilities.some(f => {
    const fLower = f.toLowerCase();
    return fLower.includes(refLower) || refLower.includes(fLower);
  });
}

// Extract keyword (first word) from an aktivitas_dihindari item
function extractKeyword(item: string): string {
  return item.trim().split(/\s+/)[0].toLowerCase();
}

function textContainsKeyword(text: string, keyword: string): boolean {
  return text.toLowerCase().includes(keyword);
}

// ── run_validation — deterministic checks ────────────────────────────────────
async function runValidation(
  admin: SupabaseClient<any>,
  profileId: string,
  planningContextId: string,
  authority: Record<string,unknown>,
  tpRevisionId: string,
): Promise<{
  violations: Violation[];
  warnings: Violation[];
  checks_passed: string[];
  status: 'pass' | 'pass_with_warnings' | 'fail';
  rpm_ready_for_class: boolean;
}> {
  const violations: Violation[] = [];
  const warnings: Violation[] = [];
  const checks_passed: string[] = [];
  let vioCounter = 0;

  const makeVioId = () => `VIO-${String(++vioCounter).padStart(2,'0')}`;

  // Load all required artifacts
  const ctxVer = await loadArtifactVersion(admin, planningContextId, profileId, 'CONTEXT_SPEC');
  const asmVer = await loadArtifactVersion(admin, planningContextId, profileId, 'ASSESSMENT_SPEC');
  const matVer = await loadArtifactVersion(admin, planningContextId, profileId, 'MATERIAL_SPEC');
  const fuVer  = await loadArtifactVersion(admin, planningContextId, profileId, 'FOLLOW_UP');

  if (!ctxVer || !asmVer || !matVer || !fuVer)
    throw new Error('Artifact wajib belum tersedia untuk validasi');

  // Load class context from planning context snapshot
  const classCtx = (authority.class_context as Record<string,unknown>) ?? {};
  const facilities      = (classCtx.fasilitas_tersedia as string[]) ?? [];
  const aktivitasDilarang = (classCtx.aktivitas_dihindari as string[]) ?? [];
  const forbiddenKeywords = aktivitasDilarang.map(extractKeyword).filter(k => k.length > 0);

  // Load all meeting_plan contents
  const { data: alloc } = await admin.from('rancang_meeting_allocations')
    .select('id').eq('planning_context_id', planningContextId).is('superseded_at', null).maybeSingle();

  const meetingPlans: Array<{ meeting_no: number; content: Record<string,unknown> }> = [];

  if (alloc) {
    const { data: items } = await admin.from('rancang_meeting_allocation_items')
      .select('id,meeting_no').eq('meeting_allocation_id', alloc.id).order('meeting_no');

    for (const item of (items ?? [])) {
      const { data: a } = await admin.from('rancang_artifacts')
        .select('id').eq('planning_context_id', planningContextId)
        .eq('artifact_kind', 'MEETING_PLAN').eq('profile_id', profileId)
        .eq('scope_key', `MEETING_${item.meeting_no}`).maybeSingle();
      if (!a) continue;
      const { data: sel } = await admin.from('rancang_artifact_selections')
        .select('selected_version_id').eq('artifact_id', a.id).maybeSingle();
      if (!sel) continue;
      const { data: ver } = await admin.from('rancang_artifact_versions')
        .select('id,content').eq('id', sel.selected_version_id).maybeSingle();
      if (!ver) continue;
      meetingPlans.push({ meeting_no: item.meeting_no, content: ver.content as Record<string,unknown> });
    }
  }

  // Material media_feasible list
  const mediaFeasible = (matVer.content.media_feasible as string[]) ?? [];
  // All applied_context_decision_ids across material + meeting_plans
  const allAppliedDecisionIds = new Set<string>([
    ...((matVer.content.applied_context_decision_ids as string[]) ?? []),
    ...meetingPlans.flatMap(m => (m.content.applied_context_decision_ids as string[]) ?? []),
  ]);

  // CHECK 1 — FACILITY_CONFLICT (blocking)
  let check1Pass = true;
  if (facilities.length > 0) {
    for (const mp of meetingPlans) {
      const activities = (mp.content.activities as Array<Record<string,unknown>>) ?? [];
      const worksheet = mp.content.worksheet as Record<string,unknown> | null ?? null;
      const refs = collectResourceRefs(activities, worksheet);
      for (const ref of refs) {
        if (!facilityMatches(ref, facilities)) {
          violations.push({
            id: makeVioId(),
            scope: `meeting_${mp.meeting_no}`,
            component: 'activity',
            rule: 'FACILITY_CONFLICT',
            severity: 'blocking',
            message: `Resource "${ref}" tidak tersedia di fasilitas kelas (meeting ${mp.meeting_no})`,
            repair_scope: `meeting_${mp.meeting_no}`,
          });
          check1Pass = false;
        }
      }
    }
  }
  if (check1Pass) checks_passed.push('CHECK_1_FACILITY_CONFLICT');

  // CHECK 2 — ACTIVITY_BANNED (blocking)
  let check2Pass = true;
  if (forbiddenKeywords.length > 0) {
    for (const mp of meetingPlans) {
      const activities = (mp.content.activities as Array<Record<string,unknown>>) ?? [];
      for (const act of activities) {
        const teacher = String(act.teacher_action ?? '');
        const student = String(act.student_action ?? '');
        for (const kw of forbiddenKeywords) {
          if (textContainsKeyword(teacher, kw) || textContainsKeyword(student, kw)) {
            violations.push({
              id: makeVioId(),
              scope: `meeting_${mp.meeting_no}`,
              component: 'activity',
              rule: 'ACTIVITY_BANNED',
              severity: 'blocking',
              message: `Aktivitas mengandung kata terlarang "${kw}" (meeting ${mp.meeting_no}, step ${act.step_id ?? '?'})`,
              repair_scope: `meeting_${mp.meeting_no}`,
            });
            check2Pass = false;
            break;
          }
        }
      }
    }
  }
  if (check2Pass) checks_passed.push('CHECK_2_ACTIVITY_BANNED');

  // CHECK 3 — TIME_OVERFLOW (blocking) — verify duration_check from meeting validator output
  let check3Pass = true;
  for (const mp of meetingPlans) {
    const durCheck = mp.content.duration_check as Record<string,unknown> | undefined;
    if (durCheck && durCheck.matches_allocation === false) {
      violations.push({
        id: makeVioId(),
        scope: `meeting_${mp.meeting_no}`,
        component: 'activity',
        rule: 'TIME_OVERFLOW',
        severity: 'blocking',
        message: `Durasi total tidak cocok dengan alokasi pada meeting ${mp.meeting_no}`,
        repair_scope: `meeting_${mp.meeting_no}`,
      });
      check3Pass = false;
    }
  }
  if (check3Pass) checks_passed.push('CHECK_3_TIME_OVERFLOW');

  // CHECK 4 — CONTEXT_UNUSED (warning)
  const ctxDecisions = (ctxVer.content.context_decisions as Array<Record<string,unknown>>) ?? [];
  let check4Pass = true;
  for (let i = 0; i < ctxDecisions.length; i++) {
    const decId = String(ctxDecisions[i].id ?? `CTX-${String(i+1).padStart(2,'0')}`);
    if (!allAppliedDecisionIds.has(decId)) {
      warnings.push({
        id: makeVioId(),
        scope: 'material',
        component: 'resource',
        rule: 'CONTEXT_UNUSED',
        severity: 'warning',
        message: `Context Decision "${decId}" tidak digunakan di material maupun pertemuan manapun`,
        repair_scope: 'material',
      });
      check4Pass = false;
    }
  }
  if (check4Pass) checks_passed.push('CHECK_4_CONTEXT_UNUSED');

  // CHECK 5 — RESOURCE_MISSING (blocking)
  let check5Pass = true;
  if (mediaFeasible.length > 0) {
    for (const mp of meetingPlans) {
      const activities = (mp.content.activities as Array<Record<string,unknown>>) ?? [];
      const worksheet  = mp.content.worksheet as Record<string,unknown> | null ?? null;
      const refs = collectResourceRefs(activities, worksheet);
      for (const ref of refs) {
        if (!facilityMatches(ref, mediaFeasible)) {
          violations.push({
            id: makeVioId(),
            scope: `meeting_${mp.meeting_no}`,
            component: 'resource',
            rule: 'RESOURCE_MISSING',
            severity: 'blocking',
            message: `Resource "${ref}" tidak ditemukan di media_feasible dari material spec (meeting ${mp.meeting_no})`,
            repair_scope: `meeting_${mp.meeting_no}`,
          });
          check5Pass = false;
        }
      }
    }
  }
  if (check5Pass) checks_passed.push('CHECK_5_RESOURCE_MISSING');

  // CHECK 6 — ALIGNMENT_FAIL (warning)
  const asmKktp = (asmVer.content.kktp as Array<Record<string,unknown>>) ?? [];
  const asmKktpIds = new Set(asmKktp.map(k => String(k.id ?? '')).filter(Boolean));
  const fuKktpRefs = (fuVer.content.kktp_refs as string[]) ?? [];
  let check6Pass = true;
  for (const ref of fuKktpRefs) {
    if (!asmKktpIds.has(ref)) {
      warnings.push({
        id: makeVioId(),
        scope: 'follow_up',
        component: 'kktp',
        rule: 'ALIGNMENT_FAIL',
        severity: 'warning',
        message: `Follow-Up kktp_refs "${ref}" tidak cocok dengan ID KKTP di assessment_spec`,
        repair_scope: 'follow_up',
      });
      check6Pass = false;
    }
  }
  if (check6Pass) checks_passed.push('CHECK_6_ALIGNMENT_FAIL');

  // Determine overall status
  const hasBlocking = violations.some(v => v.severity === 'blocking');
  const status: 'pass' | 'pass_with_warnings' | 'fail' =
    hasBlocking ? 'fail' : warnings.length > 0 ? 'pass_with_warnings' : 'pass';
  const rpm_ready_for_class = !hasBlocking;

  return { violations, warnings, checks_passed, status, rpm_ready_for_class };
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

    // ── ACTION: run_validation ──────────────────────────────────────────────
    if (action === 'run_validation') {
      // Gate: all meetings usable
      const { data: allMeetingsOk } = await admin.rpc('fn_phase2c_all_meetings_usable', {
        p_profile_id: profile.id, p_planning_context_id: planningContextId,
      });
      if (!allMeetingsOk)
        return reply({ error: 'Semua pertemuan harus usable sebelum validasi' }, 409);

      // Gate: follow_up must be usable
      const fuVer = await loadArtifactVersion(admin, planningContextId, profile.id, 'FOLLOW_UP');
      if (!fuVer) return reply({ error: 'Follow-Up belum ada — generate dulu' }, 409);

      // Check follow_up usability via state
      const { data: fuArtifact } = await admin.from('rancang_artifacts')
        .select('id').eq('planning_context_id', planningContextId)
        .eq('artifact_kind', 'FOLLOW_UP').eq('profile_id', profile.id)
        .eq('scope_key', 'ROOT').maybeSingle();
      if (fuArtifact) {
        const { data: fuSel } = await admin.from('rancang_artifact_selections')
          .select('selected_version_id').eq('artifact_id', fuArtifact.id).maybeSingle();
        if (fuSel) {
          const { data: fuState } = await admin.from('rancang_artifact_version_states')
            .select('usable').eq('version_id', fuSel.selected_version_id).maybeSingle();
          if (!fuState?.usable)
            return reply({ error: 'Follow-Up belum usable — selesaikan dulu' }, 409);
        }
      }

      // Run deterministic checks — NO AI call
      const result = await runValidation(
        admin, profile.id, planningContextId, authority, tpRevision.id
      );

      // Build VALIDATION_REPORT content
      const reportContent = {
        status: result.status,
        rpm_ready_for_class: result.rpm_ready_for_class,
        checked_at: new Date().toISOString(),
        violations: result.violations,
        warnings: result.warnings,
        checks_passed: result.checks_passed,
      };

      // Persist as VALIDATION_REPORT artifact — origin='SYSTEM'
      const sourceHash = await sha256({
        kind: 'VALIDATION_REPORT',
        planning_context_id: planningContextId,
        report: reportContent,
      });
      const depHash = await sha256({ planning_context_id: planningContextId });
      const idempotencyKey = await makeIdempotencyKey(
        'val_report', planningContextId, reportContent.checked_at
      );

      // Load existing artifact for idempotency
      const { data: existingArtifact } = await admin.from('rancang_artifacts')
        .select('id').eq('planning_context_id', planningContextId)
        .eq('artifact_kind', 'VALIDATION_REPORT').eq('profile_id', profile.id)
        .eq('scope_key', 'ROOT').maybeSingle();

      const { data: existingSel } = existingArtifact
        ? await admin.from('rancang_artifact_selections')
            .select('selected_version_id,selection_revision').eq('artifact_id', existingArtifact.id).maybeSingle()
        : { data: null };

      const { data: createResult, error: createError } = await admin.rpc('fn_phase2b_create_version', {
        p_profile_id: profile.id, p_planning_context_id: planningContextId,
        p_artifact_kind: 'VALIDATION_REPORT',
        p_scope_key: 'ROOT',
        p_meeting_allocation_item_id: null,
        p_parent_version_id: existingSel?.selected_version_id ?? null,
        p_candidate_of_version_id: null,
        p_origin: 'SYSTEM', p_teacher_edited: false,
        p_content: reportContent, p_source_snapshot: authority,
        p_source_hash: sourceHash, p_dependency_hash: depHash,
        p_prompt_version: null, p_model_version: null,
        p_dependencies: [], p_idempotency_key: idempotencyKey,
      });
      if (createError) throw createError;

      if (!createResult.idempotent) {
        // Transition: GENERATED → VALIDATE → auto-accept (SYSTEM origin, no teacher decision needed)
        await admin.rpc('fn_phase2b_transition_version', {
          p_profile_id: profile.id, p_version_id: createResult.version_id,
          p_action: 'GENERATED', p_validation_status: 'VALID',
          p_validation_summary: { status: 'valid' },
          p_reason: 'Validation report generated by system',
          p_idempotency_key: await makeIdempotencyKey('val_gen_transition', createResult.version_id),
        });
        await admin.rpc('fn_phase2b_transition_version', {
          p_profile_id: profile.id, p_version_id: createResult.version_id,
          p_action: 'VALIDATE', p_validation_status: 'VALID',
          p_validation_summary: { status: 'valid' }, p_reason: null,
          p_idempotency_key: await makeIdempotencyKey('val_gen_validate', createResult.version_id),
        });
        await admin.rpc('fn_phase2b_decide_candidate', {
          p_profile_id: profile.id, p_version_id: createResult.version_id,
          p_decision: 'ACCEPT',
          p_expected_selection_revision: existingSel?.selection_revision ?? 0,
          p_idempotency_key: await makeIdempotencyKey('val_gen_accept', createResult.version_id),
        });
      }

      // Explicitly call fn_update_pipeline_state — trigger covers artifact_version_states
      // but we call explicitly here to ensure pipeline_state reflects the new VALIDATION_REPORT.
      await admin.rpc('fn_update_pipeline_state', {
        p_profile_id: profile.id, p_planning_context_id: planningContextId,
      });

      const { data: state } = await admin.rpc('fn_phase2c_get_pipeline_state', {
        p_profile_id: profile.id, p_planning_context_id: planningContextId,
      });

      return reply({
        result: state,
        validation: {
          status: result.status,
          violations: result.violations,
          warnings: result.warnings,
          rpm_ready_for_class: result.rpm_ready_for_class,
          checks_passed: result.checks_passed,
        },
      });
    }

    return reply({ error: 'Action tidak dikenal' }, 400);

  } catch (err) {
    console.error('phase2-validator', err);
    return reply({ error: 'Operasi Validator gagal' }, 409);
  }
});
