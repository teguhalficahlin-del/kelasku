import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const phase2a = await readFile(new URL('../supabase/migrations/20260818000003_phase2a_planning_foundation.sql', import.meta.url), 'utf8');
const phase2aFix = await readFile(new URL('../supabase/migrations/20260818000004_phase2a_allocation_policy_authority.sql', import.meta.url), 'utf8');
const phase2b = await readFile(new URL('../supabase/migrations/20260818000005_phase2b_artifact_lifecycle_foundation.sql', import.meta.url), 'utf8');
const db = new PGlite();
const H = (c) => c.repeat(64);
const ids = {
  ua:'10000000-0000-0000-0000-000000000001', ub:'10000000-0000-0000-0000-000000000002',
  pa:'20000000-0000-0000-0000-000000000001', pb:'20000000-0000-0000-0000-000000000002',
  ca:'30000000-0000-0000-0000-000000000001', cb:'30000000-0000-0000-0000-000000000002',
  ta:'40000000-0000-0000-0000-000000000001', tb:'40000000-0000-0000-0000-000000000002',
  sa:'50000000-0000-0000-0000-000000000001', sb:'50000000-0000-0000-0000-000000000002',
};
const assert = (v,m) => { if (!v) throw new Error(`FAIL: ${m}`); };
async function denied(label, fn) { try { await fn(); } catch { return; } throw new Error(`FAIL: ${label} unexpectedly succeeded`); }
const one = async (sql,p=[]) => (await db.query(sql,p)).rows[0];
async function asUser(uid,fn) {
  await db.exec(`RESET ROLE; SELECT set_config('request.jwt.claim.sub','${uid}',false); SET ROLE authenticated`);
  try { return await fn(); } finally { await db.exec('RESET ROLE'); }
}

await db.exec(`
CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role;
CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT NULLIF(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
CREATE TABLE profiles(id uuid PRIMARY KEY,user_id uuid UNIQUE NOT NULL REFERENCES auth.users(id),full_name text NOT NULL,role text NOT NULL,role_guru text,tier text);
CREATE TABLE classrooms(id uuid PRIMARY KEY,teacher_id uuid NOT NULL REFERENCES profiles(id),name text NOT NULL,subject text,jenjang text,bidang_keahlian text,program_keahlian text,mapel_key text);
CREATE TABLE rancang_dokumen(id uuid PRIMARY KEY,classroom_id uuid REFERENCES classrooms(id),jenis text,konten jsonb NOT NULL DEFAULT '{}');
CREATE FUNCTION fn_current_profile_id() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER AS $$SELECT id FROM profiles WHERE user_id=auth.uid()$$;
CREATE FUNCTION fn_is_classroom_owner(p uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$SELECT EXISTS(SELECT 1 FROM classrooms WHERE id=p AND teacher_id=fn_current_profile_id())$$;
CREATE TABLE authorized_teaching_scopes(id uuid PRIMARY KEY,profile_id uuid UNIQUE NOT NULL REFERENCES profiles(id),role_guru text NOT NULL,jenjang text NOT NULL,subject_keys text[] NOT NULL,bidang text,program_keahlian text,cp_dataset_revision text NOT NULL,status text NOT NULL DEFAULT 'LOCKED');
CREATE TABLE teaching_contexts(id uuid PRIMARY KEY,profile_id uuid NOT NULL REFERENCES profiles(id),teaching_scope_id uuid NOT NULL REFERENCES authorized_teaching_scopes(id),role_guru text NOT NULL,subject_key text NOT NULL,phase_key text NOT NULL,jenjang text NOT NULL,bidang text,program_keahlian text,cp_dataset_revision text NOT NULL,status text NOT NULL DEFAULT 'ACTIVE');
CREATE TABLE teaching_context_classrooms(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),teaching_context_id uuid NOT NULL REFERENCES teaching_contexts(id),classroom_id uuid NOT NULL REFERENCES classrooms(id),status text NOT NULL DEFAULT 'ACTIVE');
CREATE TABLE wali_home_classrooms(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),profile_id uuid NOT NULL REFERENCES profiles(id),classroom_id uuid NOT NULL REFERENCES classrooms(id),phase_key text NOT NULL,status text NOT NULL DEFAULT 'LOCKED');
INSERT INTO auth.users VALUES('${ids.ua}'),('${ids.ub}');
INSERT INTO profiles VALUES('${ids.pa}','${ids.ua}','A','GURU','GURU_MAPEL_SDSMP_SMA','GURU_GO'),('${ids.pb}','${ids.ub}','B','GURU','GURU_MAPEL_SDSMP_SMA','GURU_GO');
INSERT INTO classrooms VALUES('${ids.ca}','${ids.pa}','A','Math','SMP',NULL,NULL,'math'),('${ids.cb}','${ids.pb}','B','Math','SMP',NULL,NULL,'math');
INSERT INTO authorized_teaching_scopes VALUES('${ids.sa}','${ids.pa}','GURU_MAPEL_SDSMP_SMA','SMP',ARRAY['math'],NULL,NULL,'${H('a')}','LOCKED'),('${ids.sb}','${ids.pb}','GURU_MAPEL_SDSMP_SMA','SMP',ARRAY['math'],NULL,NULL,'${H('a')}','LOCKED');
INSERT INTO teaching_contexts VALUES('${ids.ta}','${ids.pa}','${ids.sa}','GURU_MAPEL_SDSMP_SMA','math','fase_d','SMP',NULL,NULL,'${H('a')}','ACTIVE'),('${ids.tb}','${ids.pb}','${ids.sb}','GURU_MAPEL_SDSMP_SMA','math','fase_d','SMP',NULL,NULL,'${H('a')}','ACTIVE');
INSERT INTO teaching_context_classrooms(teaching_context_id,classroom_id) VALUES('${ids.ta}','${ids.ca}'),('${ids.tb}','${ids.cb}');
GRANT USAGE ON SCHEMA public TO authenticated;
`);
await db.exec(phase2a); await db.exec(phase2aFix);

const before = await one(`SELECT (SELECT count(*) FROM profiles)::int p,(SELECT count(*) FROM classrooms)::int c`);
await db.exec(phase2b);
const after = await one(`SELECT (SELECT count(*) FROM profiles)::int p,(SELECT count(*) FROM classrooms)::int c`);
assert(JSON.stringify(before)===JSON.stringify(after),'Phase 1/2A data changed');
assert((await one(`SELECT count(*)::int n FROM pg_class WHERE relname IN ('rancang_artifacts','rancang_artifact_versions','rancang_artifact_version_states','rancang_artifact_selections','rancang_artifact_dependencies','rancang_artifact_events') AND relrowsecurity`)).n===6,'RLS missing');

const atp = await one(`INSERT INTO rancang_atp(profile_id,teaching_context_id) VALUES($1,$2) RETURNING id`,[ids.pa,ids.ta]);
const ar = await one(`INSERT INTO rancang_atp_revisions(atp_id,revision_no,source,source_hash,cp_dataset_revision,created_by) VALUES($1,1,'AI',$2,$3,$4) RETURNING id`,[atp.id,H('b'),H('a'),ids.pa]);
const tp = await one(`INSERT INTO rancang_tp(atp_id) VALUES($1) RETURNING id`,[atp.id]);
const tr = await one(`INSERT INTO rancang_tp_revisions(tp_id,revision_no,judul,semester,estimasi_jp,source_hash,created_by) VALUES($1,1,'TP',1,2,$2,$3) RETURNING id`,[tp.id,H('c'),ids.pa]);
await db.query(`INSERT INTO rancang_atp_revision_items VALUES($1,$2,$3,1)`,[ar.id,tp.id,tr.id]);
const pc = await one(`INSERT INTO rancang_planning_contexts(profile_id,teaching_context_id,classroom_id,tp_id,selected_tp_revision_id,academic_year,semester,context_source_hash,status) VALUES($1,$2,$3,$4,$5,'2026/2027',1,$6,'READY') RETURNING id`,[ids.pa,ids.ta,ids.ca,tp.id,tr.id,H('d')]);
const ma = await one(`INSERT INTO rancang_meeting_allocations(planning_context_id,revision_no,total_jp_tp,standard_jp_minutes,effective_jp_minutes,proposal_source,confirmed_by_profile_id,confirmed_at,source_hash) VALUES($1,1,2,40,40,'TEACHER',$2,now(),$3) RETURNING id`,[pc.id,ids.pa,H('e')]);
const mi = await one(`INSERT INTO rancang_meeting_allocation_items(meeting_allocation_id,meeting_no,jp,duration_minutes) VALUES($1,1,2,80) RETURNING id`,[ma.id]);
const deps = JSON.stringify([
  {kind:'PLANNING_CONTEXT',planning_context_id:pc.id,hash:H('d')},
  {kind:'TP_REVISION',tp_revision_id:tr.id,hash:H('c')},
  {kind:'MEETING_ALLOCATION_ITEM',meeting_allocation_item_id:mi.id,hash:H('e')},
  {kind:'STEP_SNAPSHOT',snapshot_key:'class_context',hash:H('f')},
]);
const contextDeps = JSON.stringify([
  {kind:'PLANNING_CONTEXT',planning_context_id:pc.id,hash:H('d')},
  {kind:'TP_REVISION',tp_revision_id:tr.id,hash:H('c')},
]);
const contextVersion = (await one(`SELECT fn_phase2b_create_version($1,$2,'CONTEXT_SPEC','ROOT',NULL,NULL,NULL,'AI',false,'{}','{}',$3,$4,'prompt-1','model-1',$5::jsonb,'context-create') r`,[ids.pa,pc.id,H('8'),H('7'),contextDeps])).r;
assert(contextVersion.version_no===1,'non-meeting artifact creation failed');
const materialDeps = JSON.stringify([{kind:'ARTIFACT_VERSION',artifact_version_id:contextVersion.version_id,hash:H('8')}]);
await one(`SELECT fn_phase2b_create_version($1,$2,'MATERIAL_SPEC','ROOT',NULL,NULL,NULL,'AI',false,'{}','{}',$3,$4,NULL,NULL,$5::jsonb,'material-create')`,[ids.pa,pc.id,H('5'),H('5'),materialDeps]);
assert((await one(`SELECT fn_phase2b_invalidate_dependants($1,'PLANNING_CONTEXT',$2,$3,'CONTEXT_CHANGED','inv-context') n`,[ids.pa,pc.id,H('9')])).n===2,'transitive dependency invalidation failed');
const createSql = `SELECT fn_phase2b_create_version($1,$2,'MEETING_PLAN','meeting:1',$3,NULL,NULL,'AI',false,$4::jsonb,'{}',$5,$6,'prompt-1','model-1',$7::jsonb,$8) r`;
const v1 = (await one(createSql,[ids.pa,pc.id,mi.id,JSON.stringify({meeting_no:1,jp:2,duration_minutes:80,activities:[]}),H('1'),H('2'),deps,'create-1'])).r;
const v1Retry = (await one(createSql,[ids.pa,pc.id,mi.id,JSON.stringify({meeting_no:1,jp:2,duration_minutes:80,activities:[]}),H('1'),H('2'),deps,'create-1'])).r;
assert(v1.version_id===v1Retry.version_id,'idempotent create failed');
await denied('forged meeting duration',()=>one(createSql,[ids.pa,pc.id,mi.id,JSON.stringify({meeting_no:1,jp:2,duration_minutes:999}),H('2'),H('2'),deps,'forged-time']));
const forgedDeps = JSON.stringify([{kind:'PLANNING_CONTEXT',planning_context_id:'ffffffff-ffff-ffff-ffff-ffffffffffff',hash:H('d')}]);
await denied('forged dependency identifier',()=>one(`SELECT fn_phase2b_create_version($1,$2,'MATERIAL_SPEC','ROOT',NULL,NULL,NULL,'AI',false,'{}','{}',$3,$4,NULL,NULL,$5::jsonb,'forged-dep')`,[ids.pa,pc.id,H('6'),H('6'),forgedDeps]));
await one(`SELECT fn_phase2b_transition_version($1,$2,'GENERATED',NULL,NULL,NULL,'generated-1')`,[ids.pa,v1.version_id]);
await one(`SELECT fn_phase2b_transition_version($1,$2,'VALIDATE','VALID','{}',NULL,'validated-1')`,[ids.pa,v1.version_id]);
await one(`SELECT fn_phase2b_decide_candidate($1,$2,'ACCEPT',0,'accept-1')`,[ids.pa,v1.version_id]);
assert((await one(`SELECT usable,decision_status FROM rancang_artifact_version_states WHERE version_id=$1`,[v1.version_id])).usable,'accepted valid version not usable');

const v2 = (await one(`SELECT fn_phase2b_create_version($1,$2,'MEETING_PLAN','meeting:1',$3,$4,$4,'AI',false,$5::jsonb,'{}',$6,$7,'prompt-1','model-1',$8::jsonb,'create-2') r`,[ids.pa,pc.id,mi.id,v1.version_id,JSON.stringify({meeting_no:1,jp:2,duration_minutes:80,activities:['new']}),H('3'),H('2'),deps])).r;
assert(v2.version_no===2,'artifact identity/version increment failed');
assert((await one(`SELECT selected_version_id=$1 selected FROM rancang_artifact_selections WHERE artifact_id=$2`,[v1.version_id,v1.artifact_id])).selected,'candidate silently replaced selection');
await one(`SELECT fn_phase2b_transition_version($1,$2,'GENERATED',NULL,NULL,NULL,'generated-2')`,[ids.pa,v2.version_id]);
await one(`SELECT fn_phase2b_transition_version($1,$2,'VALIDATE','VALID','{}',NULL,'validated-2')`,[ids.pa,v2.version_id]);
await one(`SELECT fn_phase2b_decide_candidate($1,$2,'REJECT',NULL,'reject-2')`,[ids.pa,v2.version_id]);
assert((await one(`SELECT selected_version_id=$1 selected FROM rancang_artifact_selections WHERE artifact_id=$2`,[v1.version_id,v1.artifact_id])).selected,'rejection changed selection');
const sameInputRegeneration = (await one(`SELECT fn_phase2b_create_version($1,$2,'MEETING_PLAN','meeting:1',$3,$4,$4,'AI',false,$5::jsonb,'{}',$6,$7,'prompt-1','model-1',$8::jsonb,'create-same-input') r`,[ids.pa,pc.id,mi.id,v1.version_id,JSON.stringify({meeting_no:1,jp:2,duration_minutes:80,activities:['new']}),H('3'),H('2'),deps])).r;
assert(sameInputRegeneration.version_id!==v2.version_id && sameInputRegeneration.version_no===3,'regeneration did not append a new candidate');

const edit = (await one(`SELECT fn_phase2b_create_version($1,$2,'MEETING_PLAN','meeting:1',$3,$4,$4,'AI',true,$5::jsonb,'{}',$6,$7,NULL,NULL,$8::jsonb,'edit-3') r`,[ids.pa,pc.id,mi.id,v1.version_id,JSON.stringify({meeting_no:1,jp:2,duration_minutes:80,activities:['teacher']}),H('4'),H('2'),deps])).r;
assert((await one(`SELECT teacher_edited,origin FROM rancang_artifact_versions WHERE id=$1`,[edit.version_id])).teacher_edited,'teacher edit trace missing');
await denied('overwrite immutable teacher edit',()=>db.query(`UPDATE rancang_artifact_versions SET content='{}' WHERE id=$1`,[edit.version_id]));
await one(`SELECT fn_phase2b_transition_version($1,$2,'GENERATED',NULL,NULL,NULL,'generated-3')`,[ids.pa,edit.version_id]);
await one(`SELECT fn_phase2b_transition_version($1,$2,'VALIDATE','VALID','{}',NULL,'validated-3')`,[ids.pa,edit.version_id]);
await denied('stale concurrent selection revision',()=>one(`SELECT fn_phase2b_decide_candidate($1,$2,'ACCEPT',99,'accept-stale')`,[ids.pa,edit.version_id]));
await one(`SELECT fn_phase2b_decide_candidate($1,$2,'ACCEPT',1,'accept-3')`,[ids.pa,edit.version_id]);
assert((await one(`SELECT selected_version_id=$1 selected,selection_revision FROM rancang_artifact_selections WHERE artifact_id=$2`,[edit.version_id,v1.artifact_id])).selected,'explicit replacement selection failed');
await one(`SELECT fn_phase2b_transition_version($1,$2,'VALIDATE','INVALID','{"blocking":true}',NULL,'invalid-3')`,[ids.pa,edit.version_id]);
assert(!(await one(`SELECT usable FROM rancang_artifact_version_states WHERE version_id=$1`,[edit.version_id])).usable,'invalid selected version remained usable');
await one(`SELECT fn_phase2b_transition_version($1,$2,'VALIDATE','VALID','{}',NULL,'revalidated-3')`,[ids.pa,edit.version_id]);

const invalidated = (await one(`SELECT fn_phase2b_invalidate_dependants($1,'MEETING_ALLOCATION_ITEM',$2,$3,'ALLOCATION_CHANGED','inv-1') n`,[ids.pa,mi.id,H('9')])).n;
assert(invalidated===4,'selective invalidation did not target actual dependants');
assert((await one(`SELECT count(*)::int n FROM rancang_artifact_versions WHERE artifact_id=$1`,[v1.artifact_id])).n===4,'invalidation destroyed history');
assert((await one(`SELECT fn_phase2b_rpm_ready_for_class($1,$2) ready`,[ids.pa,pc.id])).ready===false,'rpm_ready_for_class opened prematurely');

const own = await asUser(ids.ua,()=>db.query(`SELECT id FROM rancang_artifacts`));
assert(own.rows.length===3,'owner read failed');
const other = await asUser(ids.ub,()=>db.query(`SELECT id FROM rancang_artifacts`));
assert(other.rows.length===0,'cross-user read leaked');
await denied('direct authenticated mutation',()=>asUser(ids.ua,()=>db.query(`UPDATE rancang_artifact_version_states SET needs_update=false WHERE version_id=$1`,[v1.version_id])));
await denied('authenticated service RPC misuse',()=>asUser(ids.ua,()=>db.query(`SELECT fn_phase2b_decide_candidate($1,$2,'ACCEPT',1,'attack')`,[ids.pa,v1.version_id])));
await denied('forged profile service call',()=>one(`SELECT fn_phase2b_decide_candidate($1,$2,'ACCEPT',1,'forged-profile')`,[ids.pb,v1.version_id]));

console.log(JSON.stringify({
  migration:'PASS',preservation:'PASS',tables_6_rls:'PASS',stable_identity:'PASS',append_only:'PASS',
  candidate_selection:'PASS',teacher_edit_protection:'PASS',typed_dependencies:'PASS',selective_invalidation:'PASS',
  meeting_allocation_authority:'PASS',idempotency:'PASS',selection_concurrency:'PASS',cross_user:'DENIED',direct_authenticated_mutation:'DENIED',
  service_rpc_misuse:'DENIED',rpm_ready_for_class:'LOCKED_FALSE',database:'PGlite disposable PostgreSQL'
},null,2));
