import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const migration = await readFile(new URL('../supabase/migrations/20260818000003_phase2a_planning_foundation.sql', import.meta.url), 'utf8');
const db = new PGlite();
const REV = 'a'.repeat(64);
const H = (c) => c.repeat(64);
const ids = {
  ua:'10000000-0000-0000-0000-000000000001', ub:'10000000-0000-0000-0000-000000000002',
  pa:'20000000-0000-0000-0000-000000000001', pb:'20000000-0000-0000-0000-000000000002',
  ca:'30000000-0000-0000-0000-000000000001', ca2:'30000000-0000-0000-0000-000000000002', cb:'30000000-0000-0000-0000-000000000003',
  sa:'40000000-0000-0000-0000-000000000001', sb:'40000000-0000-0000-0000-000000000002',
  ta:'50000000-0000-0000-0000-000000000001', tb:'50000000-0000-0000-0000-000000000002',
  legacy:'60000000-0000-0000-0000-000000000001'
};
const assert = (v,m) => { if (!v) throw new Error(`FAIL: ${m}`); };
async function denied(label, fn) { try { await fn(); } catch { return; } throw new Error(`FAIL: ${label} unexpectedly succeeded`); }
async function asUser(uid, fn) {
  await db.exec(`RESET ROLE; SELECT set_config('request.jwt.claim.sub','${uid}',false); SET ROLE authenticated`);
  try { return await fn(); } finally { await db.exec('RESET ROLE'); }
}
const scalar = async (sql, params=[]) => (await db.query(sql, params)).rows[0];

await db.exec(`
CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role;
CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT NULLIF(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
CREATE TABLE profiles(id uuid PRIMARY KEY,user_id uuid UNIQUE NOT NULL REFERENCES auth.users(id),full_name text NOT NULL,role text NOT NULL,role_guru text,tier text);
CREATE TABLE classrooms(id uuid PRIMARY KEY,teacher_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,name text NOT NULL,subject text,jenjang text,bidang_keahlian text,program_keahlian text,mapel_key text);
CREATE TABLE rancang_dokumen(id uuid PRIMARY KEY,classroom_id uuid REFERENCES classrooms(id),jenis text,konten jsonb NOT NULL DEFAULT '{}'::jsonb);
CREATE FUNCTION fn_current_profile_id() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER AS $$SELECT id FROM profiles WHERE user_id=auth.uid()$$;
CREATE FUNCTION fn_is_classroom_owner(p uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$SELECT EXISTS(SELECT 1 FROM classrooms WHERE id=p AND teacher_id=fn_current_profile_id())$$;
CREATE TABLE authorized_teaching_scopes(id uuid PRIMARY KEY,profile_id uuid UNIQUE NOT NULL REFERENCES profiles(id),role_guru text NOT NULL,jenjang text NOT NULL,subject_keys text[] NOT NULL,bidang text,program_keahlian text,cp_dataset_revision text NOT NULL,status text NOT NULL DEFAULT 'LOCKED');
CREATE TABLE wali_home_classrooms(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),profile_id uuid NOT NULL REFERENCES profiles(id),classroom_id uuid NOT NULL REFERENCES classrooms(id),phase_key text NOT NULL,status text NOT NULL DEFAULT 'LOCKED');
CREATE TABLE teaching_contexts(id uuid PRIMARY KEY,profile_id uuid NOT NULL REFERENCES profiles(id),teaching_scope_id uuid NOT NULL REFERENCES authorized_teaching_scopes(id),role_guru text NOT NULL,subject_key text NOT NULL,phase_key text NOT NULL,jenjang text NOT NULL,bidang text,program_keahlian text,cp_dataset_revision text NOT NULL,status text NOT NULL DEFAULT 'ACTIVE');
CREATE TABLE teaching_context_classrooms(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),teaching_context_id uuid NOT NULL REFERENCES teaching_contexts(id),classroom_id uuid NOT NULL REFERENCES classrooms(id),status text NOT NULL DEFAULT 'ACTIVE');
GRANT USAGE ON SCHEMA public TO authenticated; GRANT SELECT ON profiles,classrooms,teaching_contexts,teaching_context_classrooms,wali_home_classrooms TO authenticated;
INSERT INTO auth.users VALUES('${ids.ua}'),('${ids.ub}');
INSERT INTO profiles VALUES('${ids.pa}','${ids.ua}','A','GURU','GURU_MAPEL_SDSMP_SMA','GURU_GO'),('${ids.pb}','${ids.ub}','B','GURU','GURU_MAPEL_SDSMP_SMA','GURU_GO');
INSERT INTO classrooms VALUES('${ids.ca}','${ids.pa}','A1','Matematika','SMP',NULL,NULL,'matematika'),('${ids.ca2}','${ids.pa}','A2','Matematika','SMP',NULL,NULL,'matematika'),('${ids.cb}','${ids.pb}','B1','Matematika','SMP',NULL,NULL,'matematika');
INSERT INTO authorized_teaching_scopes VALUES('${ids.sa}','${ids.pa}','GURU_MAPEL_SDSMP_SMA','SMP',ARRAY['matematika'],NULL,NULL,'${REV}','LOCKED'),('${ids.sb}','${ids.pb}','GURU_MAPEL_SDSMP_SMA','SMP',ARRAY['matematika'],NULL,NULL,'${REV}','LOCKED');
INSERT INTO teaching_contexts VALUES('${ids.ta}','${ids.pa}','${ids.sa}','GURU_MAPEL_SDSMP_SMA','matematika','fase_d','SMP',NULL,NULL,'${REV}','ACTIVE'),('${ids.tb}','${ids.pb}','${ids.sb}','GURU_MAPEL_SDSMP_SMA','matematika','fase_d','SMP',NULL,NULL,'${REV}','ACTIVE');
INSERT INTO teaching_context_classrooms(teaching_context_id,classroom_id) VALUES('${ids.ta}','${ids.ca}'),('${ids.ta}','${ids.ca2}'),('${ids.tb}','${ids.cb}');
INSERT INTO rancang_dokumen VALUES('${ids.legacy}','${ids.ca}','TP','{"atp":[1,2,3,4,5,6,7,8,9,10,11]}');
`);
const before = await scalar(`SELECT (SELECT count(*) FROM profiles)::int p,(SELECT count(*) FROM classrooms)::int c,(SELECT count(*) FROM rancang_dokumen)::int d`);
await db.exec(migration);
const after = await scalar(`SELECT (SELECT count(*) FROM profiles)::int p,(SELECT count(*) FROM classrooms)::int c,(SELECT count(*) FROM rancang_dokumen)::int d`);
assert(JSON.stringify(before)===JSON.stringify(after),'migration changed legacy/Phase 1 rows');
assert((await scalar(`SELECT count(*)::int n FROM pg_class WHERE relname LIKE 'rancang_%' AND relname IN ('rancang_atp','rancang_atp_revisions','rancang_tp','rancang_tp_revisions','rancang_atp_revision_items','rancang_tp_revision_elements','rancang_legacy_atp_mappings','rancang_planning_contexts','rancang_meeting_allocations','rancang_meeting_allocation_items')`)).n===10,'Phase 2A rancang tables missing');
assert((await scalar(`SELECT count(*)::int n FROM pg_class WHERE relname IN ('rancang_atp','rancang_atp_revisions','rancang_tp','rancang_tp_revisions','rancang_atp_revision_items','rancang_tp_revision_elements','rancang_legacy_atp_mappings','classroom_jp_policies','rancang_planning_contexts','rancang_meeting_allocations','rancang_meeting_allocation_items') AND relrowsecurity`)).n===11,'RLS not enabled on all 11 tables');
assert((await scalar(`SELECT count(*)::int n FROM rancang_atp`)).n===0,'silent ATP adoption occurred');

const tpPayload = [1,2,3].map((n)=>({judul:`TP ${n}`,deskripsi:`D ${n}`,semester:1,estimasi_jp:n,raw_element_value:n===1?'Bilangan':null,source_hash:H(String(n)),element_refs:n===1?[{subject_key:'matematika',phase_key:'fase_d',element_name:'Bilangan',cp_dataset_revision:REV}]:[]}));
const createA = (await db.query(`SELECT fn_phase2a_persist_atp($1,$2,'AI',$3,$4,$5::jsonb,NULL,NULL,NULL) r`,[ids.pa,ids.ta,H('b'),REV,JSON.stringify(tpPayload)])).rows[0].r;
const again = (await db.query(`SELECT fn_phase2a_persist_atp($1,$2,'AI',$3,$4,$5::jsonb,$6,NULL,NULL) r`,[ids.pa,ids.ta,H('b'),REV,JSON.stringify(tpPayload),createA.atp_id])).rows[0].r;
assert(createA.atp_id===again.atp_id && createA.tp_list.length===3,'ATP idempotency failed');
const createB = (await db.query(`SELECT fn_phase2a_persist_atp($1,$2,'AI',$3,$4,$5::jsonb,NULL,NULL,NULL) r`,[ids.pb,ids.tb,H('b'),REV,JSON.stringify(tpPayload)])).rows[0].r;
assert(createA.atp_id!==createB.atp_id,'same hash collided across ATP/teacher scope');
const first = createA.tp_list[0];
const pc1 = (await db.query(`SELECT fn_phase2a_save_planning_context($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,'2026/2027',1::smallint,'{}'::jsonb,'{}'::jsonb,'{"class":"A1"}'::jsonb,NULL::jsonb,'{}'::jsonb,$6::text) r`,[ids.pa,ids.ta,ids.ca,first.id,first.revision_id,H('c')])).rows[0].r;
const pc1Again = (await db.query(`SELECT fn_phase2a_save_planning_context($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,'2026/2027',1::smallint,'{}'::jsonb,'{}'::jsonb,'{"class":"A1"}'::jsonb,NULL::jsonb,'{}'::jsonb,$6::text) r`,[ids.pa,ids.ta,ids.ca,first.id,first.revision_id,H('c')])).rows[0].r;
const pc2 = (await db.query(`SELECT fn_phase2a_save_planning_context($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,'2026/2027',1::smallint,'{}'::jsonb,'{}'::jsonb,'{"class":"A2"}'::jsonb,NULL::jsonb,'{}'::jsonb,$6::text) r`,[ids.pa,ids.ta,ids.ca2,first.id,first.revision_id,H('d')])).rows[0].r;
assert(pc1.id===pc1Again.id && pc1.id!==pc2.id,'planning context idempotency/class separation failed');
const revised = (await db.query(`SELECT fn_phase2a_revise_tp($1::uuid,$2::uuid,$3::uuid,$4::text,$5::text,'TP 1 revised','new',1::smallint,2,NULL::jsonb,'[]'::jsonb) r`,[ids.pa,ids.ta,first.id,H('e'),H('f')])).rows[0].r;
assert(revised.tp_list[0].id===first.id && revised.tp_list[0].revision_id!==first.revision_id,'stable TP/revision lifecycle failed');
const stale = await scalar(`SELECT status,selected_tp_revision_id,stale_reasons FROM rancang_planning_contexts WHERE id=$1`,[pc1.id]);
assert(stale.status==='STALE' && stale.selected_tp_revision_id===first.revision_id && stale.stale_reasons.includes('NEW_TP_REVISION_AVAILABLE'),'historical planning snapshot/stale state failed');
await denied('forged profile/context',()=>db.query(`SELECT fn_phase2a_revise_tp($1::uuid,$2::uuid,$3::uuid,$4::text,$5::text,'x','',1::smallint,1,NULL::jsonb,'[]'::jsonb)`,[ids.pb,ids.tb,first.id,H('7'),H('8')]));
await denied('unbound classroom',()=>db.query(`SELECT fn_phase2a_save_planning_context($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,'2026/2027',1::smallint,'{}'::jsonb,'{}'::jsonb,'{}'::jsonb,NULL::jsonb,'{}'::jsonb,$6::text)`,[ids.pa,ids.ta,ids.cb,first.id,first.revision_id,H('9')]));
await denied('allocation sum mismatch',()=>db.query(`SELECT fn_phase2a_confirm_allocation($1,$2,3,40,40,'TEACHER',$3,'[{"meeting_no":1,"jp":2}]')`,[ids.pa,pc1.id,H('0')]));
const alloc1=(await db.query(`SELECT fn_phase2a_confirm_allocation($1,$2,3,40,40,'TEACHER',$3,'[{"meeting_no":1,"jp":1,"duration_minutes":999},{"meeting_no":2,"jp":2,"duration_minutes":999}]') r`,[ids.pa,pc1.id,H('1')])).rows[0].r;
const alloc2=(await db.query(`SELECT fn_phase2a_confirm_allocation($1,$2,3,45,40,'TEACHER',$3,'[{"meeting_no":1,"jp":3}]') r`,[ids.pa,pc1.id,H('2')])).rows[0].r;
assert(alloc1.meetings[0].duration_minutes===40 && alloc1.meetings[1].duration_minutes===80,'server duration invariant failed');
assert((await scalar(`SELECT superseded_at IS NOT NULL old,(SELECT superseded_at IS NULL FROM rancang_meeting_allocations WHERE id=$2) current FROM rancang_meeting_allocations WHERE id=$1`,[alloc1.id,alloc2.id])).old,'allocation supersession failed');

const legacyItems=Array.from({length:11},(_,i)=>({judul:`Legacy ${i+1}`,deskripsi:'',semester:i<6?1:2,estimasi_jp:2,raw_element_value:'Nama elemen lama tidak dikenal',source_hash:(i.toString(16).padStart(1,'0')).repeat(64),element_refs:[]}));
const legacy=(await db.query(`SELECT fn_phase2a_persist_atp($1,$2,'LEGACY_IMPORT',$3,$4,$5::jsonb,NULL,$6,$7) r`,[ids.pa,ids.ta,H('3'),REV,JSON.stringify(legacyItems),ids.legacy,H('4')])).rows[0].r;
const legacyAgain=(await db.query(`SELECT fn_phase2a_persist_atp($1,$2,'LEGACY_IMPORT',$3,$4,$5::jsonb,NULL,$6,$7) r`,[ids.pa,ids.ta,H('3'),REV,JSON.stringify(legacyItems),ids.legacy,H('4')])).rows[0].r;
assert(legacy.atp_id===legacyAgain.atp_id && legacy.tp_list.length===11,'legacy adoption/idempotency failed');
const lm=await scalar(`SELECT jsonb_array_length(unresolved_elements)::int unresolved,(SELECT count(*)::int FROM rancang_tp_revision_elements e JOIN rancang_tp_revisions tr ON tr.id=e.tp_revision_id JOIN rancang_tp t ON t.id=tr.tp_id WHERE t.atp_id=m.atp_id) refs FROM rancang_legacy_atp_mappings m WHERE legacy_rancang_dokumen_id=$1`,[ids.legacy]);
assert(lm.unresolved===11 && lm.refs===0,'legacy unresolved created canonical identity or was not preserved');
assert((await scalar(`SELECT konten->'atp' AS atp FROM rancang_dokumen WHERE id=$1`,[ids.legacy])).atp.length===11,'legacy document mutated');

const own=await asUser(ids.ua,()=>db.query(`SELECT id FROM rancang_atp`));
assert(own.rows.length===2 && own.rows.every(x=>x.id!==createB.atp_id),'RLS owner/cross-user isolation failed');
await denied('direct authenticated insert',()=>asUser(ids.ua,()=>db.exec(`INSERT INTO rancang_atp(profile_id,teaching_context_id) VALUES('${ids.pa}','${ids.ta}')`)));
await denied('teacher service RPC',()=>asUser(ids.ua,()=>db.query(`SELECT fn_phase2a_get_atp($1,$2)`,[ids.pa,createA.atp_id])));
await db.exec('RESET ROLE; SET ROLE anon'); await denied('anon service RPC',()=>db.query(`SELECT fn_phase2a_get_atp($1,$2)`,[ids.pa,createA.atp_id])); await db.exec('RESET ROLE');

console.log(JSON.stringify({migration:'PASS',tables_11:'PASS',rls_11:'PASS',preservation:'PASS',silent_adoption:'PASS',lifecycle:'PASS',scoped_hash:'PASS',planning_context:'PASS',allocation:'PASS',legacy:'PASS',rls_adversarial:'PASS',database:'PGlite disposable PostgreSQL'},null,2));
