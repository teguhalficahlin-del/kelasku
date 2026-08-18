// Unit tests for regenerate idempotency key derivation.
// Run: deno test supabase/functions/phase2c-generate/idempotency_test.ts
import { assertEquals, assertNotEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';

// ── Pure functions copied from index.ts ──────────────────────────────────────
function canonicalJson(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(',')}]`;
  const r = v as Record<string, unknown>;
  return `{${Object.keys(r).filter(k => r[k] !== undefined).sort()
    .map(k => `${JSON.stringify(k)}:${canonicalJson(r[k])}`).join(',')}}`;
}
async function sha256(v: unknown): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalJson(v)));
  return [...new Uint8Array(bytes)].map(x => x.toString(16).padStart(2, '0')).join('');
}
async function makeIdempotencyKey(prefix: string, ...parts: unknown[]): Promise<string> {
  return prefix + ':' + await sha256(parts);
}
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function isValidUuidV4(s: string): boolean { return UUID_RE.test(s); }
async function makeRegenKey(
  prefix: string, profileId: string, artifactKind: string,
  planningContextId: string, sourceHash: string, depHash: string,
  clientOperationId: string,
): Promise<string> {
  return prefix + ':' + await sha256({ profileId, artifactKind, planningContextId, sourceHash, depHash, clientOperationId });
}

// ── Test data ────────────────────────────────────────────────────────────────
const PROFILE_ID = 'prof-aaa';
const PC_ID = 'pc-bbb';
const SRC_HASH = 'src-111';
const DEP_HASH = 'dep-222';
const OP_ID_1 = '550e8400-e29b-41d4-a716-446655440000';
const OP_ID_2 = '6ba7b810-9dad-41d1-80b4-00c04fd430c8';

// ── UUID validation ──────────────────────────────────────────────────────────
Deno.test('isValidUuidV4: accepts well-formed v4', () => {
  assertEquals(isValidUuidV4('550e8400-e29b-41d4-a716-446655440000'), true);
  assertEquals(isValidUuidV4('6ba7b810-9dad-41d1-80b4-00c04fd430c8'), true);
});
Deno.test('isValidUuidV4: rejects empty string', () => {
  assertEquals(isValidUuidV4(''), false);
});
Deno.test('isValidUuidV4: rejects non-v4 version digit', () => {
  // version = 1 → rejected
  assertEquals(isValidUuidV4('550e8400-e29b-11d4-a716-446655440000'), false);
});
Deno.test('isValidUuidV4: rejects Date.now() string', () => {
  assertEquals(isValidUuidV4(String(Date.now())), false);
});
Deno.test('isValidUuidV4: rejects malformed string', () => {
  assertEquals(isValidUuidV4('not-a-uuid'), false);
});

// ── Same-operation retry produces identical key ───────────────────────────────
Deno.test('makeRegenKey: same inputs → same key (idempotent retry)', async () => {
  const k1 = await makeRegenKey('ctx_regen', PROFILE_ID, 'CONTEXT_SPEC', PC_ID, SRC_HASH, DEP_HASH, OP_ID_1);
  const k2 = await makeRegenKey('ctx_regen', PROFILE_ID, 'CONTEXT_SPEC', PC_ID, SRC_HASH, DEP_HASH, OP_ID_1);
  assertEquals(k1, k2, 'retry with same operation ID must produce identical key');
});

// ── New regenerate intent produces different key ───────────────────────────────
Deno.test('makeRegenKey: different client_operation_id → different key (new intent)', async () => {
  const k1 = await makeRegenKey('ctx_regen', PROFILE_ID, 'CONTEXT_SPEC', PC_ID, SRC_HASH, DEP_HASH, OP_ID_1);
  const k2 = await makeRegenKey('ctx_regen', PROFILE_ID, 'CONTEXT_SPEC', PC_ID, SRC_HASH, DEP_HASH, OP_ID_2);
  assertNotEquals(k1, k2, 'a new regenerate click must produce a different key');
});

// ── Assessment and context keys are independent ───────────────────────────────
Deno.test('makeRegenKey: different artifact_kind → different key', async () => {
  const ctx = await makeRegenKey('ctx_regen', PROFILE_ID, 'CONTEXT_SPEC', PC_ID, SRC_HASH, DEP_HASH, OP_ID_1);
  const asm = await makeRegenKey('asm_regen', PROFILE_ID, 'ASSESSMENT_SPEC', PC_ID, SRC_HASH, DEP_HASH, OP_ID_1);
  assertNotEquals(ctx, asm, 'context and assessment keys must not collide');
});

// ── Initial generate key is stable (no client_operation_id involved) ──────────
Deno.test('makeIdempotencyKey: initial generate → same key across calls', async () => {
  const k1 = await makeIdempotencyKey('ctx_gen', PC_ID, SRC_HASH, 'initial');
  const k2 = await makeIdempotencyKey('ctx_gen', PC_ID, SRC_HASH, 'initial');
  assertEquals(k1, k2, 'initial generate must always be deterministic');
});

// ── Initial and regen keys must not collide even with same source hash ────────
Deno.test('makeIdempotencyKey vs makeRegenKey: no collision on same source hash', async () => {
  const initial = await makeIdempotencyKey('ctx_gen', PC_ID, SRC_HASH, 'initial');
  const regen   = await makeRegenKey('ctx_regen', PROFILE_ID, 'CONTEXT_SPEC', PC_ID, SRC_HASH, DEP_HASH, OP_ID_1);
  assertNotEquals(initial, regen, 'initial generate and regenerate must use distinct key spaces');
});

// ── Different profile produces different key (ownership isolation) ─────────────
Deno.test('makeRegenKey: different profileId → different key', async () => {
  const k1 = await makeRegenKey('ctx_regen', 'prof-aaa', 'CONTEXT_SPEC', PC_ID, SRC_HASH, DEP_HASH, OP_ID_1);
  const k2 = await makeRegenKey('ctx_regen', 'prof-zzz', 'CONTEXT_SPEC', PC_ID, SRC_HASH, DEP_HASH, OP_ID_1);
  assertNotEquals(k1, k2, 'different users must not share idempotency keys');
});
