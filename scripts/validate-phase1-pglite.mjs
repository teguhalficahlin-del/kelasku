import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const migration = await readFile(
  new URL('../supabase/migrations/20260818000001_phase1_teaching_scope_foundation.sql', import.meta.url),
  'utf8',
);
const lifecycleHotfix = await readFile(
  new URL('../supabase/migrations/20260818000002_phase1_fk_lifecycle_fix.sql', import.meta.url),
  'utf8',
);
const db = new PGlite();
const A_USER = '10000000-0000-0000-0000-000000000001';
const B_USER = '10000000-0000-0000-0000-000000000002';
const A_PROFILE = '20000000-0000-0000-0000-000000000001';
const B_PROFILE = '20000000-0000-0000-0000-000000000002';
const A_CLASS = '30000000-0000-0000-0000-000000000001';
const B_CLASS = '30000000-0000-0000-0000-000000000002';
const A_CLASS_2 = '30000000-0000-0000-0000-000000000003';
const B_CLASS_2 = '30000000-0000-0000-0000-000000000004';
const REV = 'fbf8d8e6218e9cd785e4523c5ec62e2846fcd81098235dcef6561b150ab411af';

function assert(condition, message) {
  if (!condition) throw new Error(`FAIL: ${message}`);
}
async function expectDenied(label, action) {
  try { await action(); } catch { return { label, result: 'DENIED' }; }
  throw new Error(`FAIL: ${label} unexpectedly succeeded`);
}
async function asUser(userId, action) {
  await db.exec(`RESET ROLE; SELECT set_config('request.jwt.claim.sub', '${userId}', false); SET ROLE authenticated;`);
  try { return await action(); } finally { await db.exec('RESET ROLE;'); }
}

await db.exec(`
  CREATE ROLE authenticated;
  CREATE ROLE anon;
  CREATE ROLE service_role;
  CREATE SCHEMA auth;
  CREATE TABLE auth.users(id uuid PRIMARY KEY);
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
    $$ SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

  CREATE TABLE profiles (
    id uuid PRIMARY KEY, user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id),
    full_name text NOT NULL, role text NOT NULL, role_guru text,
    tier text NOT NULL DEFAULT 'TRIAL', created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(),
    CONSTRAINT profiles_role_guru_check CHECK (role_guru IS NULL OR role_guru IN ('MAPEL','WALI_KELAS_SD'))
  );
  CREATE TABLE classrooms (
    id uuid PRIMARY KEY, teacher_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE, name text NOT NULL,
    subject text, jenjang text, bidang_keahlian text, program_keahlian text, mapel_key text,
    elemen_terpilih jsonb, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now()
  );
  CREATE TABLE rancang_profil (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), profile_id uuid NOT NULL UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,
    jenjang text, peran text, mapel_list text[] NOT NULL DEFAULT '{}', mapel text, mapel_key text,
    bidang_keahlian text, program_keahlian text, elemen_terpilih text[] NOT NULL DEFAULT '{}',
    kelas text, fase text, jam_per_minggu integer, semester_list text[] NOT NULL DEFAULT '{}',
    nama_guru text, nip_guru text, nama_kepsek text, nip_kepsek text, tahun_ajaran text, kota text,
    is_locked boolean NOT NULL DEFAULT false, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now()
  );
  CREATE TABLE rancang_settings(id uuid PRIMARY KEY, classroom_id uuid REFERENCES classrooms(id) ON DELETE CASCADE);
  CREATE TABLE rancang_dokumen(id uuid PRIMARY KEY, classroom_id uuid REFERENCES classrooms(id) ON DELETE CASCADE);
  CREATE FUNCTION fn_current_profile_id() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER AS
    $$ SELECT id FROM profiles WHERE user_id = auth.uid() $$;
  GRANT SELECT, UPDATE ON profiles TO authenticated;
  GRANT SELECT, INSERT, UPDATE ON rancang_profil TO authenticated;

  INSERT INTO auth.users VALUES ('${A_USER}'), ('${B_USER}');
  INSERT INTO profiles(id,user_id,full_name,role,role_guru,tier) VALUES
    ('${A_PROFILE}','${A_USER}','Teacher A','GURU','MAPEL','GURU_GO'),
    ('${B_PROFILE}','${B_USER}','Teacher B','GURU','WALI_KELAS_SD','GURU_PRO');
  INSERT INTO classrooms(id,teacher_id,name,subject,jenjang,mapel_key) VALUES
    ('${A_CLASS}','${A_PROFILE}','A Class','Matematika','SMP','matematika'),
    ('${B_CLASS}','${B_PROFILE}','B Class','Semua Mata Pelajaran','SD',NULL),
    ('${A_CLASS_2}','${A_PROFILE}','A Class 2','Matematika','SMP','matematika'),
    ('${B_CLASS_2}','${B_PROFILE}','B Class 2','Semua Mata Pelajaran','SD',NULL);
  INSERT INTO rancang_profil(profile_id,nama_guru) VALUES ('${A_PROFILE}','Legacy A'),('${B_PROFILE}','Legacy B');
  INSERT INTO rancang_settings VALUES ('40000000-0000-0000-0000-000000000001','${A_CLASS}');
  INSERT INTO rancang_dokumen VALUES ('50000000-0000-0000-0000-000000000001','${A_CLASS}');
`);

const before = (await db.query(`SELECT
  (SELECT count(*) FROM profiles)::int profiles,
  (SELECT count(*) FROM classrooms)::int classrooms,
  (SELECT count(*) FROM rancang_profil)::int rancang_profil,
  (SELECT count(*) FROM rancang_settings)::int rancang_settings,
  (SELECT count(*) FROM rancang_dokumen)::int rancang_dokumen,
  array_agg(role_guru ORDER BY id) roles,
  array_agg(tier ORDER BY id) tiers FROM profiles`)).rows[0];

await db.exec(migration);
await db.exec(lifecycleHotfix);

const after = (await db.query(`SELECT
  (SELECT count(*) FROM profiles)::int profiles,
  (SELECT count(*) FROM classrooms)::int classrooms,
  (SELECT count(*) FROM rancang_profil)::int rancang_profil,
  (SELECT count(*) FROM rancang_settings)::int rancang_settings,
  (SELECT count(*) FROM rancang_dokumen)::int rancang_dokumen,
  array_agg(role_guru ORDER BY id) roles,
  array_agg(tier ORDER BY id) tiers FROM profiles`)).rows[0];
assert(JSON.stringify(before) === JSON.stringify(after), 'legacy rows/role/tier changed during migration');
assert(Number((await db.query('SELECT count(*) n FROM authorized_teaching_scopes')).rows[0].n) === 0,
  'legacy rows were silently authorized');

const r1 = await asUser(A_USER, () => db.query(
  `SELECT fn_declare_and_lock_role('GURU_MAPEL_SDSMP_SMA', true) result`,
));
assert(r1.rows[0].result.role_guru === 'GURU_MAPEL_SDSMP_SMA', 'R1 declaration failed');
const r6 = await asUser(A_USER, () => db.query(
  `SELECT fn_declare_and_lock_role('GURU_MAPEL_SDSMP_SMA', true) result`,
));
assert(r6.rows[0].result.role_guru === 'GURU_MAPEL_SDSMP_SMA', 'R6 identical declaration not idempotent');
await expectDenied('R2 direct role update', () => asUser(A_USER,
  () => db.exec(`UPDATE profiles SET role_guru='GURU_MAPEL_UMUM_SMK' WHERE id='${A_PROFILE}'`)));
await expectDenied('R7 different declaration', () => asUser(A_USER,
  () => db.query(`SELECT fn_declare_and_lock_role('GURU_MAPEL_UMUM_SMK', true)`)));
await expectDenied('T1 direct tier update', () => asUser(A_USER,
  () => db.exec(`UPDATE profiles SET tier='GURU_PRO' WHERE id='${A_PROFILE}'`)));
await asUser(A_USER, () => db.exec(`UPDATE profiles SET full_name='Teacher A Updated' WHERE id='${A_PROFILE}'`));
await asUser(A_USER, () => db.query(`SELECT fn_upsert_rancang_profil($1::jsonb)`, [{
  jenjang: 'SMP', peran: 'MAPEL', mapel_list: ['Matematika'], mapel: 'Matematika',
  mapel_key: 'matematika', elemen_terpilih: [], semester_list: [], nama_guru: 'Normal Edit',
  role_guru: 'GURU_MAPEL_UMUM_SMK', tier: 'GURU_PRO', is_locked: true,
}]));
const protectedProfile = (await db.query(`SELECT role_guru,tier,full_name FROM profiles WHERE id='${A_PROFILE}'`)).rows[0];
assert(protectedProfile.role_guru === 'GURU_MAPEL_SDSMP_SMA' && protectedProfile.tier === 'GURU_GO',
  'R4/T2 profile RPC mutated protected fields');
await asUser(B_USER, () => db.query(`SELECT fn_declare_and_lock_role('WALI_KELAS', true)`));

await db.query(`SELECT fn_server_apply_teaching_foundation($1,$2::jsonb,NULL,$3::jsonb,$4)`, [
  A_PROFILE,
  { role_guru:'GURU_MAPEL_SDSMP_SMA', jenjang:'SMP', subject_keys:['matematika'], cp_dataset_revision:REV },
  { subject_key:'matematika', phase_key:'fase_d', jenjang:'SMP' },
  A_CLASS,
]);
await expectDenied('locked scope expansion', () => db.query(
  `SELECT fn_server_apply_teaching_foundation($1,$2::jsonb,NULL,$3::jsonb,$4)`, [
    A_PROFILE,
    { role_guru:'GURU_MAPEL_SDSMP_SMA', jenjang:'SMP', subject_keys:['bahasa_inggris'], cp_dataset_revision:REV },
    { subject_key:'bahasa_inggris', phase_key:'fase_d', jenjang:'SMP' },
    A_CLASS,
  ],
));
await db.query(`SELECT fn_server_apply_teaching_foundation($1,$2::jsonb,NULL,$3::jsonb,$4)`, [
  A_PROFILE,
  { role_guru:'GURU_MAPEL_SDSMP_SMA', jenjang:'SMP', subject_keys:['matematika'], cp_dataset_revision:REV },
  { subject_key:'matematika', phase_key:'fase_d', jenjang:'SMP' },
  A_CLASS_2,
]);
const mapelBindings = await db.query(`SELECT count(*)::int n FROM teaching_context_classrooms tcc
  JOIN teaching_contexts tc ON tc.id=tcc.teaching_context_id WHERE tc.profile_id='${A_PROFILE}'`);
assert(mapelBindings.rows[0].n === 2, 'mapel context did not support multiple classroom bindings');
await expectDenied('cross-owner classroom server binding', () => db.query(
  `SELECT fn_server_apply_teaching_foundation($1,$2::jsonb,NULL,$3::jsonb,$4)`, [
    A_PROFILE,
    { role_guru:'GURU_MAPEL_SDSMP_SMA', jenjang:'SMP', subject_keys:['matematika'], cp_dataset_revision:REV },
    { subject_key:'matematika', phase_key:'fase_d', jenjang:'SMP' },
    B_CLASS,
  ],
));

const waliScope = {
  role_guru:'WALI_KELAS', jenjang:'SD',
  subject_keys:['matematika','bahasa_indonesia'], cp_dataset_revision:REV,
};
await db.query(`SELECT fn_server_apply_teaching_foundation($1,$2::jsonb,$3,$4::jsonb,$5)`, [
  B_PROFILE, waliScope, B_CLASS,
  { subject_key:'matematika', phase_key:'fase_c', jenjang:'SD' }, B_CLASS,
]);
await db.query(`SELECT fn_server_apply_teaching_foundation($1,$2::jsonb,$3,$4::jsonb,$5)`, [
  B_PROFILE, waliScope, B_CLASS,
  { subject_key:'bahasa_indonesia', phase_key:'fase_c', jenjang:'SD' }, B_CLASS,
]);
const waliContexts = await db.query(`SELECT count(*)::int n FROM teaching_contexts WHERE profile_id='${B_PROFILE}'`);
assert(waliContexts.rows[0].n === 2, 'one wali scope did not support multiple subject contexts');
await expectDenied('second home classroom', () => db.query(
  `SELECT fn_server_apply_teaching_foundation($1,$2::jsonb,$3,$4::jsonb,$5)`, [
    B_PROFILE, waliScope, B_CLASS_2,
    { subject_key:'matematika', phase_key:'fase_c', jenjang:'SD' }, B_CLASS_2,
  ],
));

const ownScope = await asUser(A_USER, () => db.query('SELECT profile_id FROM authorized_teaching_scopes'));
const bScope = await asUser(B_USER, () => db.query('SELECT profile_id FROM authorized_teaching_scopes'));
assert(ownScope.rows.length === 1 && ownScope.rows[0].profile_id === A_PROFILE &&
       bScope.rows.length === 1 && bScope.rows[0].profile_id === B_PROFILE,
  'RLS scope isolation failed');
await expectDenied('direct scope insert', () => asUser(A_USER, () => db.exec(
  `INSERT INTO authorized_teaching_scopes(profile_id,role_guru,jenjang,subject_keys,cp_dataset_revision)
   VALUES('${A_PROFILE}','GURU_MAPEL_SDSMP_SMA','SMP',ARRAY['x'],'${REV}')`,
)));
await expectDenied('direct scope update', () => asUser(A_USER,
  () => db.exec(`UPDATE authorized_teaching_scopes SET subject_keys=ARRAY['x']`)));
await expectDenied('direct scope delete', () => asUser(A_USER,
  () => db.exec(`DELETE FROM authorized_teaching_scopes`)));
await expectDenied('authenticated service RPC bypass', () => asUser(A_USER, () => db.query(
  `SELECT fn_server_apply_teaching_foundation($1,$2::jsonb,NULL,$3::jsonb,$4)`, [
    A_PROFILE,
    { role_guru:'GURU_MAPEL_SDSMP_SMA', jenjang:'SMP', subject_keys:['matematika'], cp_dataset_revision:REV },
    { subject_key:'matematika', phase_key:'fase_d', jenjang:'SMP' }, A_CLASS,
  ],
)));
await db.exec('RESET ROLE; SET ROLE anon;');
await expectDenied('anonymous protected table read', () => db.query('SELECT * FROM authorized_teaching_scopes'));
await db.exec('RESET ROLE;');

const objects = await db.query(`SELECT
  to_regclass('authorized_teaching_scopes') IS NOT NULL tables_ok,
  to_regprocedure('fn_declare_and_lock_role(text,boolean)') IS NOT NULL role_rpc_ok,
  to_regprocedure('fn_server_apply_teaching_foundation(uuid,jsonb,uuid,jsonb,uuid)') IS NOT NULL server_rpc_ok`);
assert(Object.values(objects.rows[0]).every(Boolean), 'new database objects missing');

await db.exec(`DELETE FROM classrooms WHERE id='${B_CLASS}'`);
assert(Number((await db.query(`SELECT count(*) n FROM wali_home_classrooms WHERE classroom_id='${B_CLASS}'`)).rows[0].n) === 0,
  'home classroom relation blocked/could not follow classroom deletion');
assert(Number((await db.query(`SELECT count(*) n FROM teaching_context_classrooms WHERE classroom_id='${B_CLASS}'`)).rows[0].n) === 0,
  'context binding blocked/could not follow classroom deletion');
await db.exec(`DELETE FROM profiles WHERE id='${B_PROFILE}'`);
assert(Number((await db.query(`SELECT count(*) n FROM authorized_teaching_scopes WHERE profile_id='${B_PROFILE}'`)).rows[0].n) === 0,
  'scope blocked/could not follow profile deletion');

console.log(JSON.stringify({
  migration: 'PASS', legacy_preservation: 'PASS', role_lock: 'PASS', tier_lock: 'PASS',
  normal_profile_edit: 'PASS', scope_immutability: 'PASS', rls_owner_read: 'PASS',
  rls_cross_user: 'PASS', direct_mutation_denied: 'PASS', anonymous_denied: 'PASS',
  service_rpc_not_callable_by_teacher: 'PASS', mapel_multiple_bindings: 'PASS',
  wali_multiple_subject_contexts: 'PASS', one_locked_home_classroom: 'PASS',
  cross_owner_binding_denied: 'PASS', database: 'PGlite disposable PostgreSQL',
  classroom_delete_lifecycle: 'PASS', profile_delete_lifecycle: 'PASS',
}, null, 2));
