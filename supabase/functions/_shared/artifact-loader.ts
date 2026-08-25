// Pemuat versi artifact terpilih — dipakai bersama oleh phase2-meeting,
// phase2-followup, dan phase2-validator.
//
// Ketiganya dulu memegang salinannya sendiri-sendiri. Dua di antaranya
// (phase2-followup dan phase2-validator) identik byte-per-byte dan hanya berbeda
// nama; yang ketiga, phase2-meeting, berbeda secara substansi karena melewatkan
// penyaringan scope_key sama sekali.
//
// Bentuk yang dipakai di sini adalah bentuk phase2-followup/phase2-validator —
// dengan scope_key. Artinya phase2-meeting IKUT BERUBAH PERILAKU: kedua belas
// pemanggilannya kini menyaring scope_key='ROOT'. Perubahan itu disengaja, dan
// memperbaiki, karena:
//
//   * rancang_artifacts.scope_key bertipe NOT NULL DEFAULT 'ROOT';
//   * scope selain ROOT (MEETING_<n>) hanya dipakai artifact_kind='MEETING_PLAN',
//     sedangkan phase2-meeting hanya memuat CONTEXT_SPEC, ASSESSMENT_SPEC, dan
//     MATERIAL_SPEC lewat fungsi ini;
//   * ketiga fungsi gerbang di DB — fn_phase2c_context_spec_confirmed,
//     fn_phase2c_assessment_spec_confirmed, dan fn_phase2c_material_spec_usable —
//     sudah menyaring scope_key='ROOT' untuk ketiga kind itu.
//
// Jadi filter ini menghasilkan baris yang sama dengan sebelumnya, sambil menutup
// satu lubang: tanpa penyaringan scope, .maybeSingle() akan MELEMPAR begitu satu
// planning_context punya dua artifact sekind dengan scope berbeda — bukan
// mengembalikan baris yang keliru, melainkan gagal sama sekali.

import { type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

export type ArtifactVersion = {
  id: string; content: Record<string,unknown>;
  artifact_id: string; selection_revision: number;
};

export async function loadArtifactContent(
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
