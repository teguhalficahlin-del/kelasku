const scenario = Deno.args[0] ?? '';
const allowed = new Set(['wrong_revision', 'wrong_content', 'fetch_unavailable', 'metadata_mismatch', 'valid']);
if (!allowed.has(scenario)) throw new Error(`Unknown scenario: ${scenario}`);

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const cpPath = new URL('../shared/data/cp-data.json', import.meta.url);
const metaPath = new URL('../shared/data/cp-data.meta.json', import.meta.url);
const canonicalBytes = await Deno.readFile(cpPath);
const canonicalMeta = JSON.parse(await Deno.readTextFile(metaPath));
const expectedRevision = scenario === 'wrong_revision' ? '0'.repeat(64) : canonicalMeta.revision;
const servedBytes = scenario === 'wrong_content'
  ? encoder.encode(`${decoder.decode(canonicalBytes)}\n`)
  : canonicalBytes;
const servedMeta = scenario === 'metadata_mismatch'
  ? { ...canonicalMeta, revision: '1'.repeat(64) }
  : canonicalMeta;

const mockPort = 54325;
const edgePort = 8000;
const json = (body: unknown, status = 200) => Response.json(body, { status });
const mock = Deno.serve({ hostname: '127.0.0.1', port: mockPort }, (req) => {
  const url = new URL(req.url);
  if (url.pathname === '/cp-data.json') {
    if (scenario === 'fetch_unavailable') return json({ error: 'unavailable' }, 503);
    return new Response(servedBytes, { headers: { 'content-type': 'application/json' } });
  }
  if (url.pathname === '/cp-data.meta.json') {
    if (scenario === 'fetch_unavailable') return json({ error: 'unavailable' }, 503);
    return json(servedMeta);
  }
  if (url.pathname === '/auth/v1/user') {
    return json({ id: '10000000-0000-0000-0000-000000000001', aud: 'authenticated' });
  }
  if (url.pathname === '/rest/v1/profiles') {
    return json({
      id: '20000000-0000-0000-0000-000000000001', role: 'GURU',
      role_guru: 'GURU_MAPEL_SDSMP_SMA', role_locked_at: '2026-08-18T00:00:00Z', tier: 'GURU_GO',
    });
  }
  if (url.pathname === '/rest/v1/classrooms') {
    return json({
      id: '30000000-0000-0000-0000-000000000001',
      teacher_id: '20000000-0000-0000-0000-000000000001',
      jenjang: 'SMP', mapel_key: 'matematika', bidang_keahlian: null, program_keahlian: null,
    });
  }
  if (url.pathname === '/rest/v1/rpc/fn_server_apply_teaching_foundation') {
    return json({ scope_id: '40000000-0000-0000-0000-000000000001' });
  }
  return json({ error: 'mock route missing', path: url.pathname }, 404);
});

Deno.env.set('SUPABASE_URL', `http://127.0.0.1:${mockPort}`);
Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'isolated-test-service-key');
Deno.env.set('CP_DATA_URL', `http://127.0.0.1:${mockPort}/cp-data.json`);
Deno.env.set('CP_DATASET_REVISION', expectedRevision);

await import('../supabase/functions/teaching-foundation/index.ts');
const payload = {
  action: 'apply_foundation', confirmed: true, jenjang: 'SMP', phase_key: 'fase_d',
  subject_keys: ['matematika'], selected_subject_key: 'matematika', element_refs: [],
  classroom_id: '30000000-0000-0000-0000-000000000001',
};
let response: Response | null = null;
for (let attempt = 0; attempt < 20 && !response; attempt++) {
  try {
    response = await fetch(`http://127.0.0.1:${edgePort}`, {
      method: 'POST',
      headers: { authorization: 'Bearer isolated-test-user-token', 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}
if (!response) throw new Error('Edge handler did not start');
const body = await response.json();
const expectedStatus = scenario === 'valid' ? 200 : 503;
const serialized = JSON.stringify(body);
const noLeak = !/service-key|SQLSTATE|PL\/pgSQL|isolated-test-user-token/i.test(serialized);
const pass = response.status === expectedStatus && noLeak;
console.log(JSON.stringify({ scenario, status: response.status, expectedStatus, noLeak, pass }));
await mock.shutdown();
Deno.exit(pass ? 0 : 1);
