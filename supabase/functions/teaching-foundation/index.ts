import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import type { Database, Json } from '../_shared/database.types.ts';
import {
  asStrings,
  validateCanonicalFoundation,
  verifyCanonicalBytes,
  type CpDataset,
} from '../_shared/canonical-cp.ts';

const CORS_HEADERS = {
  // Dibaca dari environment supaya satu `supabase secrets set ALLOWED_ORIGIN=...`
  // berlaku untuk keempat belas Edge Function sekaligus -- tidak perlu menyunting
  // dan men-deploy ulang satu per satu saat MiClass pindah domain. Fallback-nya
  // adalah nilai yang sebelumnya tertanam di sini, jadi env yang belum diset
  // berarti perilaku lama -- bukan CORS yang rusak.
  'Access-Control-Allow-Origin':
    Deno.env.get('ALLOWED_ORIGIN') ?? 'https://teguhalficahlin-del.github.io',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const ROLES = new Set([
  'WALI_KELAS_SD', 'GURU_MAPEL_SDSMP_SMA',
  'GURU_MAPEL_UMUM_SMK', 'GURU_MAPEL_PRODUKTIF_SMK',
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
function reply(body: unknown, status = 200) {
  return Response.json(body, { status, headers: CORS_HEADERS });
}

// sqlNull: type-gen Supabase tidak merekam nullability parameter fungsi SQL.
// Yang penting null tetap null -- `?? undefined` akan membuang key-nya dari
// JSON dan diam-diam memicu DEFAULT parameter alih-alih NULL.
const sqlNull = (v: string | null | undefined) => v as unknown as string;

let cpCache: { revision: string; data: CpDataset } | null = null;

async function loadCanonicalCp() {
  if (cpCache) return cpCache;
  const dataUrl = Deno.env.get('CP_DATA_URL');
  const expectedRevision = Deno.env.get('CP_DATASET_REVISION');
  if (!dataUrl || !expectedRevision) throw new Error('Canonical CP release belum dikonfigurasi');
  const cpUrl = new URL(dataUrl);
  const metaUrl = new URL('cp-data.meta.json', cpUrl);
  metaUrl.search = cpUrl.search;
  const [dataRes, metaRes] = await Promise.all([
    fetch(cpUrl, { headers: { accept: 'application/json', 'cache-control': 'no-cache' } }),
    fetch(metaUrl, { headers: { accept: 'application/json', 'cache-control': 'no-cache' } }),
  ]);
  if (!dataRes.ok || !metaRes.ok) throw new Error('Canonical CP authority tidak dapat dibaca');
  const raw = await dataRes.arrayBuffer();
  const meta = await metaRes.json() as { algorithm?: string; revision?: string };
  cpCache = await verifyCanonicalBytes(raw, meta, expectedRevision);
  return cpCache;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (req.method !== 'POST') return reply({ error: 'Method tidak diizinkan' }, 405);

  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) return reply({ error: 'Unauthorized' }, 401);

  const admin = createClient<Database>(
    Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  const { data: { user }, error: authError } = await admin.auth.getUser(authHeader.slice(7));
  if (authError || !user) return reply({ error: 'Unauthorized' }, 401);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return reply({ error: 'Request body tidak valid' }, 400); }
  if (body.action !== 'apply_foundation' || body.confirmed !== true) {
    return reply({ error: 'Action dan konfirmasi eksplisit diperlukan' }, 400);
  }

  const { data: profile } = await admin.from('profiles')
    .select('id, role, role_guru, role_locked_at, tier')
    .eq('user_id', user.id).single();
  if (!profile || profile.role !== 'GURU' || !profile.role_locked_at || !ROLES.has(profile.role_guru ?? '')
      || profile.role_guru !== RANCANG_ROLE || profile.tier !== RANCANG_TIER) {
    return reply({ error: rancangDenial(profile) }, 403);
  }

  try {
    const canonical = await loadCanonicalCp();
    const jenjang = String(body.jenjang ?? '');
    const phaseKey = String(body.phase_key ?? '');
    const subjectKeys = asStrings(body.subject_keys);
    const selectedSubject = String(body.selected_subject_key ?? subjectKeys[0] ?? '');
    const bidang = typeof body.bidang === 'string' && body.bidang ? body.bidang : null;
    const program = typeof body.program_keahlian === 'string' && body.program_keahlian ? body.program_keahlian : null;
    const elementRefs = Array.isArray(body.element_refs) ? body.element_refs : [];
    try {
      validateCanonicalFoundation(canonical.data, canonical.revision, {
        roleGuru: profile.role_guru, jenjang, phaseKey, subjectKeys, selectedSubject,
        bidang, program, elementRefs,
      });
    } catch (validationError) {
      return reply({
        error: validationError instanceof Error ? validationError.message : 'Canonical domain tidak valid',
      }, 400);
    }

    const classroomId = String(body.classroom_id ?? '');
    const { data: classroom } = await admin.from('classrooms')
      .select('id, teacher_id, jenjang, mapel_key, bidang_keahlian, program_keahlian')
      .eq('id', classroomId).single();
    if (!classroom || classroom.teacher_id !== profile.id) return reply({ error: 'Classroom bukan milik guru' }, 403);
    if (classroom.jenjang && classroom.jenjang !== jenjang) return reply({ error: 'Jenjang classroom tidak kompatibel' }, 409);
    // @ts-expect-error Rancang V2 — cabang ini aktif saat GURU_MAPEL_PRODUKTIF_SMK/WALI_KELAS_SD diizinkan
    if (classroom.mapel_key && profile.role_guru !== 'WALI_KELAS_SD' && classroom.mapel_key !== selectedSubject) {
      return reply({ error: 'Subject classroom tidak kompatibel dengan scope' }, 409);
    }
    // @ts-expect-error Rancang V2 — cabang ini aktif saat GURU_MAPEL_PRODUKTIF_SMK/WALI_KELAS_SD diizinkan
    if (profile.role_guru === 'GURU_MAPEL_PRODUKTIF_SMK' &&
        ((classroom.bidang_keahlian && classroom.bidang_keahlian !== bidang) ||
         (classroom.program_keahlian && classroom.program_keahlian !== program))) {
      return reply({ error: 'Program classroom tidak kompatibel dengan productive domain' }, 409);
    }
    // @ts-expect-error Rancang V2 — cabang ini aktif saat GURU_MAPEL_PRODUKTIF_SMK/WALI_KELAS_SD diizinkan
    if (profile.role_guru === 'WALI_KELAS_SD' && (!['fase_a', 'fase_b', 'fase_c'].includes(phaseKey) || jenjang !== 'SD')) {
      return reply({ error: 'Home classroom wali harus berada pada fase A/B/C jenjang SD' }, 409);
    }

    const scope = {
      role_guru: profile.role_guru,
      jenjang,
      subject_keys: subjectKeys,
      // @ts-expect-error Rancang V2 — cabang ini aktif saat GURU_MAPEL_PRODUKTIF_SMK/WALI_KELAS_SD diizinkan
      bidang: profile.role_guru === 'GURU_MAPEL_PRODUKTIF_SMK' ? bidang : null,
      // @ts-expect-error Rancang V2 — cabang ini aktif saat GURU_MAPEL_PRODUKTIF_SMK/WALI_KELAS_SD diizinkan
      program_keahlian: profile.role_guru === 'GURU_MAPEL_PRODUKTIF_SMK' ? program : null,
      cp_dataset_revision: canonical.revision,
      confirmation_payload: { confirmed_at: new Date().toISOString(), source: 'teacher_declaration' },
    };
    const context = {
      subject_key: selectedSubject, phase_key: phaseKey, jenjang,
      bidang: scope.bidang, program_keahlian: scope.program_keahlian,
      authorization_metadata: { cp_dataset_revision: canonical.revision },
      compatibility_metadata: {
        general_smk_program_is_context_only: profile.role_guru === 'GURU_MAPEL_UMUM_SMK',
      },
    };
    const { data, error } = await admin.rpc('fn_server_apply_teaching_foundation', {
      p_profile_id: profile.id,
      p_scope: scope,
      // @ts-expect-error Rancang V2 — cabang ini aktif saat GURU_MAPEL_PRODUKTIF_SMK/WALI_KELAS_SD diizinkan
      p_home_classroom_id: sqlNull(profile.role_guru === 'WALI_KELAS_SD' ? classroomId : null),
      p_context: context,
      p_target_classroom_id: classroomId,
    });
    if (error) {
      console.error('teaching-foundation RPC:', error.code, error.message);
      return reply({
        error: error.code === '42501'
          ? 'Teaching scope atau classroom tidak diizinkan'
          : 'Teaching foundation tidak dapat disimpan',
      }, error.code === '42501' ? 403 : 409);
    }
    return reply({ success: true, cp_dataset_revision: canonical.revision, ...((data as Record<string, Json> | null) ?? {}) });
  } catch (error) {
    console.error('teaching-foundation:', error);
    return reply({ error: 'Canonical validation tidak tersedia. Coba lagi.' }, 503);
  }
});
