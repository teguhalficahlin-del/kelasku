import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { phaseRecord, validateCanonicalFoundation, validateProductiveClassroomDomain, verifyCanonicalBytes, type CpDataset } from '../_shared/canonical-cp.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const ROLES = new Set(['WALI_KELAS','GURU_MAPEL_SDSMP_SMA','GURU_MAPEL_UMUM_SMK','GURU_MAPEL_PRODUKTIF_SMK']);
const reply = (body: unknown, status=200) => Response.json(body,{status,headers:CORS});
let cpCache: {revision:string;data:CpDataset}|null=null;

async function canonical() {
  if (cpCache) return cpCache;
  const dataUrl=Deno.env.get('CP_DATA_URL');
  const expected=Deno.env.get('CP_DATASET_REVISION');
  if (!dataUrl||!expected) throw new Error('Canonical CP belum dikonfigurasi');
  const u=new URL(dataUrl); const m=new URL('cp-data.meta.json',u); m.search=u.search;
  const [dr,mr]=await Promise.all([fetch(u,{headers:{'cache-control':'no-cache'}}),fetch(m,{headers:{'cache-control':'no-cache'}})]);
  if(!dr.ok||!mr.ok) throw new Error('Canonical CP tidak tersedia');
  cpCache=await verifyCanonicalBytes(await dr.arrayBuffer(),await mr.json(),expected);
  return cpCache;
}
function canonicalJson(value:unknown):string {
  if(value===null||typeof value!=='object') return JSON.stringify(value);
  if(Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const record=value as Record<string,unknown>;
  return `{${Object.keys(record).filter(k=>record[k]!==undefined).sort().map(k=>`${JSON.stringify(k)}:${canonicalJson(record[k])}`).join(',')}}`;
}
async function sha(value:unknown){
  const text=canonicalJson(value);
  const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));
  return [...new Uint8Array(bytes)].map(x=>x.toString(16).padStart(2,'0')).join('');
}
function standardMinutes(j:string){return j==='SD'?35:j==='SMP'?40:45;}

Deno.serve(async req=>{
  if(req.method==='OPTIONS') return new Response('ok',{headers:CORS});
  if(req.method!=='POST') return reply({error:'Method tidak diizinkan'},405);
  const auth=req.headers.get('Authorization')||'';
  if(!auth.startsWith('Bearer ')) return reply({error:'Unauthorized'},401);
  const admin=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    {auth:{autoRefreshToken:false,persistSession:false}});
  const {data:{user}}=await admin.auth.getUser(auth.slice(7));
  if(!user) return reply({error:'Unauthorized'},401);
  const {data:profile}=await admin.from('profiles').select('id,role,role_guru,role_locked_at').eq('user_id',user.id).single();
  if(!profile||profile.role!=='GURU'||!profile.role_locked_at||!ROLES.has(profile.role_guru)) return reply({error:'Locked teacher role diperlukan'},403);
  let body:Record<string,unknown>; try{body=await req.json();}catch{return reply({error:'Payload tidak valid'},400);}
  const action=String(body.action||'');
  try{
    const classroomId=String(body.classroom_id||'');
    const contextId=String(body.teaching_context_id||'');
    const {data:context}=await admin.from('teaching_contexts').select('*').eq('id',contextId).eq('profile_id',profile.id).eq('status','ACTIVE').maybeSingle();
    const {data:binding}=context?await admin.from('teaching_context_classrooms').select('id').eq('teaching_context_id',context.id).eq('classroom_id',classroomId).eq('status','ACTIVE').maybeSingle():{data:null};
    const {data:classroom}=await admin.from('classrooms').select('id,teacher_id,jenjang,mapel_key,bidang_keahlian,program_keahlian').eq('id',classroomId).maybeSingle();
    if(!context||!binding||!classroom||classroom.teacher_id!==profile.id) return reply({error:'Teaching Context/classroom tidak diizinkan'},403);
    if(profile.role_guru==='WALI_KELAS'){
      const {data:home}=await admin.from('wali_home_classrooms').select('id').eq('profile_id',profile.id).eq('classroom_id',classroomId).eq('status','LOCKED').maybeSingle();
      if(!home) return reply({error:'Target bukan home classroom wali'},403);
    }

    if(action==='resolve_context') return reply({result:{teaching_context_id:context.id,cp_dataset_revision:context.cp_dataset_revision,subject_key:context.subject_key,phase_key:context.phase_key,jenjang:context.jenjang}});

    if(action==='get_latest_atp'){
      const {data:atp}=await admin.from('rancang_atp').select('id').eq('profile_id',profile.id)
        .eq('teaching_context_id',context.id).eq('status','ACTIVE').order('updated_at',{ascending:false}).limit(1).maybeSingle();
      if(!atp) return reply({result:null});
      const {data,error}=await admin.rpc('fn_phase2a_get_atp',{p_profile_id:profile.id,p_atp_id:atp.id});
      if(error) throw error; return reply({result:data});
    }

    if(action==='get_latest_planning_context'){
      const {data:pc,error}=await admin.from('rancang_planning_contexts').select('*').eq('profile_id',profile.id)
        .eq('teaching_context_id',context.id).eq('classroom_id',classroomId).neq('status','ARCHIVED')
        .order('updated_at',{ascending:false}).limit(1).maybeSingle();
      if(error) throw error;
      const std=standardMinutes(context.jenjang); const {data:policy}=await admin.from('classroom_jp_policies').select('*').eq('classroom_id',classroomId).maybeSingle();
      let durableAtp=null, selectedTp=null;
      if(pc){
        const {data:tp}=await admin.from('rancang_tp').select('atp_id').eq('id',pc.tp_id).maybeSingle();
        if(tp){
          const {data,error:atpError}=await admin.rpc('fn_phase2a_get_atp',{p_profile_id:profile.id,p_atp_id:tp.atp_id});
          if(atpError) throw atpError; durableAtp=data;
        }
        const {data:revision,error:revisionError}=await admin.from('rancang_tp_revisions')
          .select('id,judul,deskripsi,semester,estimasi_jp,raw_element_value').eq('id',pc.selected_tp_revision_id).eq('tp_id',pc.tp_id).maybeSingle();
        if(revisionError) throw revisionError;
        if(revision) selectedTp={id:pc.tp_id,revision_id:revision.id,judul:revision.judul,deskripsi:revision.deskripsi,
          semester:revision.semester,estimasi_jp:revision.estimasi_jp,elemen_cp:revision.raw_element_value};
      }
      return reply({result:pc?{planning_context:pc,durable_atp:durableAtp,selected_tp:selectedTp,
        jp_policy:policy||{standard_jp_minutes:std,effective_jp_minutes:std}}:null});
    }

    const cp=await canonical();
    if(context.cp_dataset_revision!==cp.revision) return reply({error:'Teaching Context memakai revision CP berbeda'},409);
    const subject=cp.data[context.subject_key]; const phase=subject&&phaseRecord(subject,context.phase_key);
    const canonicalNames=Array.isArray(phase?.elemen)?(phase!.elemen as Array<Record<string,unknown>>).map(e=>String(e.nama)):[];
    const validateAuthorizedDomain=()=>validateCanonicalFoundation(cp.data,cp.revision,{
      roleGuru:profile.role_guru,jenjang:context.jenjang,phaseKey:context.phase_key,
      subjectKeys:[context.subject_key],selectedSubject:context.subject_key,
      bidang:context.bidang??null,program:context.program_keahlian??null,elementRefs:[],
    });
    const validateProductiveClassroom=()=>{
      validateAuthorizedDomain();
      validateProductiveClassroomDomain({roleGuru:profile.role_guru,subject,
        contextBidang:context.bidang,contextProgram:context.program_keahlian,
        classroomBidang:classroom.bidang_keahlian,classroomProgram:classroom.program_keahlian});
    };
    if(action==='persist_generated_atp'||action==='adopt_legacy_atp'){
      let list=Array.isArray(body.tp_list)?body.tp_list as Array<Record<string,unknown>>:[];
      let legacyId:string|null=null; let legacyHash:string|null=null; let source='AI';
      if(action==='adopt_legacy_atp'){
        legacyId=String(body.legacy_document_id||'');
        const {data:doc}=await admin.from('rancang_dokumen').select('id,classroom_id,jenis,konten').eq('id',legacyId).eq('classroom_id',classroomId).eq('jenis','TP').maybeSingle();
        if(!doc||!Array.isArray(doc.konten?.atp)) return reply({error:'Legacy ATP tidak valid'},409);
        if(body.confirmed!==true) return reply({error:'Konfirmasi adoption diperlukan'},400);
        list=doc.konten.atp; legacyHash=await sha(doc.konten); source='LEGACY_IMPORT';
      }
      if(source!=='LEGACY_IMPORT') validateProductiveClassroom();
      if(!list.length) return reply({error:'ATP kosong'},400);
      const normalized=[];
      for(let i=0;i<list.length;i++){
        const x=list[i]; const semester=Number(x.semester); const jp=Number(x.estimasi_jp);
        if(!String(x.judul||'').trim()||![1,2].includes(semester)||!Number.isInteger(jp)||jp<=0) return reply({error:`TP ${i+1} tidak valid`},400);
        const raw=x.elemen_cp; const rawNames=Array.isArray(raw)?raw.map(String):typeof raw==='string'?[raw]:[];
        const exact=[...new Set(rawNames.filter(n=>canonicalNames.includes(n)))];
        if(source!=='LEGACY_IMPORT'&&profile.role_guru==='GURU_MAPEL_PRODUKTIF_SMK'&&exact.length===0)
          return reply({error:`Elemen TP ${i+1} tidak cocok canonical productive domain`},409);
        const element_refs=exact.map(element_name=>({subject_key:context.subject_key,phase_key:context.phase_key,element_name,cp_dataset_revision:cp.revision}));
        const core={judul:String(x.judul).trim(),deskripsi:String(x.deskripsi||''),semester,estimasi_jp:jp,raw_element_value:raw??null,element_refs};
        normalized.push({...core,source_hash:await sha(core)});
      }
      const atpCore={context_id:context.id,tp_list:normalized.map(x=>({...x,source_hash:undefined})),source};
      const atpSourceHash=await sha(atpCore);
      let targetAtpId=body.atp_id||null;
      if(!targetAtpId&&source!=='LEGACY_IMPORT'){
        const {data:existing}=await admin.from('rancang_atp').select('id,rancang_atp_revisions!inner(source_hash)')
          .eq('profile_id',profile.id).eq('teaching_context_id',context.id).eq('status','ACTIVE')
          .eq('rancang_atp_revisions.source_hash',atpSourceHash).limit(1).maybeSingle();
        targetAtpId=existing?.id||null;
      }
      const {data,error}=await admin.rpc('fn_phase2a_persist_atp',{p_profile_id:profile.id,p_teaching_context_id:context.id,
        p_source:source,p_source_hash:atpSourceHash,p_cp_dataset_revision:cp.revision,p_tp_list:normalized,
        p_atp_id:targetAtpId,p_legacy_document_id:legacyId,p_legacy_payload_hash:legacyHash});
      if(error) throw error; return reply({result:data});
    }

    if(action==='save_planning_context'){
      const tpId=String(body.tp_id||''), revisionId=String(body.tp_revision_id||'');
      const teacherIntent=body.teacher_intent||{}, preferences=body.preferences||{}, classContext=body.class_context||{}, smkContext=body.smk_context||null;
      const {data:schedules}=await admin.from('schedules').select('day_of_week,start_time,end_time,is_active').eq('classroom_id',classroomId).eq('is_active',true);
      const schedule={jp_per_minggu:(preferences as Record<string,unknown>).jp_per_minggu||null,schedules:schedules||[]};
      const semester=Number(body.semester), year=String(body.academic_year||'');
      const core={context_id:context.id,classroom_id:classroomId,tp_revision_id:revisionId,academic_year:year,semester,teacherIntent,preferences,classContext,smkContext,schedule};
      const {data,error}=await admin.rpc('fn_phase2a_save_planning_context',{p_profile_id:profile.id,p_teaching_context_id:context.id,p_classroom_id:classroomId,
        p_tp_id:tpId,p_tp_revision_id:revisionId,p_academic_year:year,p_semester:semester,p_teacher_intent:teacherIntent,
        p_preferences:preferences,p_class_context:classContext,p_smk_context:smkContext,p_schedule_config:schedule,p_source_hash:await sha(core)});
      if(error) throw error;
      const std=standardMinutes(context.jenjang); const {data:policy}=await admin.from('classroom_jp_policies').select('*').eq('classroom_id',classroomId).maybeSingle();
      return reply({result:{planning_context:data,jp_policy:policy||{standard_jp_minutes:std,effective_jp_minutes:std}}});
    }

    if(action==='revise_tp'){
      validateProductiveClassroom();
      const current=body.tp as Record<string,unknown>||{}; const title=String(body.judul||'').trim();
      const raw=current.elemen_cp; const rawNames=Array.isArray(raw)?raw.map(String):typeof raw==='string'?[raw]:[];
      const exact=[...new Set(rawNames.filter(n=>canonicalNames.includes(n)))];
      if(profile.role_guru==='GURU_MAPEL_PRODUKTIF_SMK'&&exact.length===0) return reply({error:'Elemen TP tidak cocok canonical'},409);
      const refs=exact.map(element_name=>({subject_key:context.subject_key,phase_key:context.phase_key,element_name,cp_dataset_revision:cp.revision}));
      const core={judul:title,deskripsi:String(current.deskripsi||''),semester:Number(current.semester),estimasi_jp:Number(current.estimasi_jp),raw_element:raw??null,refs};
      const {data,error}=await admin.rpc('fn_phase2a_revise_tp',{p_profile_id:profile.id,p_teaching_context_id:context.id,p_tp_id:String(current.id||''),
        p_source_hash:await sha(core),p_atp_source_hash:await sha({tp_id:current.id,core}),p_judul:title,p_deskripsi:core.deskripsi,
        p_semester:core.semester,p_estimasi_jp:core.estimasi_jp,p_raw_element:core.raw_element,p_element_refs:refs});
      if(error) throw error; return reply({result:data});
    }

    if(action==='set_jp_policy'){
      const std=standardMinutes(context.jenjang), effective=Number(body.effective_jp_minutes), reason=String(body.override_reason||'').trim();
      if(!Number.isInteger(effective)||effective<=0||(effective!==std&&!reason)) return reply({error:'Override JP tidak valid'},400);
      const {data,error}=await admin.from('classroom_jp_policies').upsert({classroom_id:classroomId,profile_id:profile.id,
        standard_jp_minutes:std,effective_jp_minutes:effective,override_reason:effective===std?null:reason,
        confirmed_by_profile_id:profile.id,confirmed_at:new Date().toISOString(),updated_at:new Date().toISOString()}).select().single();
      if(error) throw error;
      const {data:contexts}=await admin.from('rancang_planning_contexts').select('id,stale_reasons').eq('classroom_id',classroomId).eq('profile_id',profile.id).neq('status','ARCHIVED');
      for(const pc of contexts||[]){
        const reasons=[...new Set([...(pc.stale_reasons||[]),'JP_POLICY_CHANGED'])];
        await admin.from('rancang_planning_contexts').update({status:'STALE',stale_reasons:reasons,updated_at:new Date().toISOString()}).eq('id',pc.id);
      }
      return reply({result:data});
    }

    if(action==='confirm_allocation'){
      const planningId=String(body.planning_context_id||''); const items=Array.isArray(body.meetings)?body.meetings:[];
      const {data:pc}=await admin.from('rancang_planning_contexts').select('id').eq('id',planningId).eq('profile_id',profile.id)
        .eq('teaching_context_id',context.id).eq('classroom_id',classroomId).maybeSingle();
      if(!pc) return reply({error:'Planning Context tidak diizinkan'},403);
      const std=standardMinutes(context.jenjang); const {data:policy}=await admin.from('classroom_jp_policies').select('*').eq('classroom_id',classroomId).maybeSingle();
      const effective=policy?.effective_jp_minutes||std; const total=items.reduce((n,x)=>n+Number((x as Record<string,unknown>).jp||0),0);
      const core={planning_context_id:planningId,total,standard:std,effective,items};
      const {data,error}=await admin.rpc('fn_phase2a_confirm_allocation',{p_profile_id:profile.id,p_planning_context_id:planningId,
        p_total_jp:total,p_standard_minutes:std,p_effective_minutes:effective,p_source:String(body.proposal_source||'TEACHER'),
        p_source_hash:await sha(core),p_items:items});
      if(error) throw error; return reply({result:data});
    }
    return reply({error:'Action tidak dikenal'},400);
  }catch(error){console.error('phase2a-planning',error);return reply({error:'Operasi Phase 2A gagal'},409);}
});
