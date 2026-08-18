import {
  phaseRecord,
  validateCanonicalFoundation,
  verifyCanonicalBytes,
} from '../supabase/functions/_shared/canonical-cp.ts';

const rawBytes = await Deno.readFile(new URL('../shared/data/cp-data.json', import.meta.url));
const meta = JSON.parse(await Deno.readTextFile(new URL('../shared/data/cp-data.meta.json', import.meta.url)));
const raw = rawBytes.buffer.slice(rawBytes.byteOffset, rawBytes.byteOffset + rawBytes.byteLength);
const verified = await verifyCanonicalBytes(raw, meta, meta.revision);

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(`FAIL: ${message}`);
}
function expectDenied(label: string, action: () => unknown) {
  try { action(); } catch { return; }
  throw new Error(`FAIL: ${label} unexpectedly succeeded`);
}
async function expectAsyncDenied(label: string, action: () => Promise<unknown>) {
  try { await action(); } catch { return; }
  throw new Error(`FAIL: ${label} unexpectedly succeeded`);
}

const mathPhase = phaseRecord(verified.data.matematika, 'fase_d')!;
const mathElement = (mathPhase.elemen as Array<Record<string, unknown>>)[0].nama as string;
const englishPhase = phaseRecord(verified.data.bahasa_inggris, 'fase_d')!;
const englishElement = (englishPhase.elemen as Array<Record<string, unknown>>)[0].nama as string;
const productiveKey = 'dasar_dasar_teknik_perawatan_gedung';
const productive = verified.data[productiveKey];
const productivePhase = phaseRecord(productive, 'fase_e')!;
const productiveElement = (productivePhase.elemen as Array<Record<string, unknown>>)[0].nama as string;

const mapelInput = {
  roleGuru: 'GURU_MAPEL_SDSMP_SMA', jenjang: 'SMP', phaseKey: 'fase_d',
  subjectKeys: ['matematika'], selectedSubject: 'matematika', bidang: null, program: null,
  elementRefs: [{
    subject_key: 'matematika', phase_key: 'fase_d', element_name: mathElement,
    cp_dataset_revision: verified.revision,
  }],
};
validateCanonicalFoundation(verified.data, verified.revision, mapelInput);
expectDenied('C2 invalid subject', () => validateCanonicalFoundation(verified.data, verified.revision, {
  ...mapelInput, subjectKeys: ['subject_tidak_ada'], selectedSubject: 'subject_tidak_ada', elementRefs: [],
}));
expectDenied('C4 invalid phase', () => validateCanonicalFoundation(verified.data, verified.revision, {
  ...mapelInput, phaseKey: 'fase_z', elementRefs: [],
}));
expectDenied('C6 element from other subject', () => validateCanonicalFoundation(verified.data, verified.revision, {
  ...mapelInput, elementRefs: [{
    subject_key: 'bahasa_inggris', phase_key: 'fase_d', element_name: englishElement,
    cp_dataset_revision: verified.revision,
  }],
}));
expectDenied('C7 element from other phase', () => validateCanonicalFoundation(verified.data, verified.revision, {
  ...mapelInput, elementRefs: [{
    subject_key: 'matematika', phase_key: 'fase_e', element_name: mathElement,
    cp_dataset_revision: verified.revision,
  }],
}));
expectDenied('C8 wrong revision', () => validateCanonicalFoundation(verified.data, verified.revision, {
  ...mapelInput, elementRefs: [{
    subject_key: 'matematika', phase_key: 'fase_d', element_name: mathElement,
    cp_dataset_revision: '0'.repeat(64),
  }],
}));

const productiveInput = {
  roleGuru: 'GURU_MAPEL_PRODUKTIF_SMK', jenjang: 'SMK', phaseKey: 'fase_e',
  subjectKeys: [productiveKey], selectedSubject: productiveKey,
  bidang: String(productive.bidang), program: String(productive.program_keahlian),
  elementRefs: [{
    subject_key: productiveKey, phase_key: 'fase_e', element_name: productiveElement,
    cp_dataset_revision: verified.revision,
  }],
};
validateCanonicalFoundation(verified.data, verified.revision, productiveInput);
expectDenied('C9 invalid productive composite', () => validateCanonicalFoundation(verified.data, verified.revision, {
  ...productiveInput, program: 'Program Tidak Valid',
}));
expectDenied('general SMK cannot request productive authority', () => validateCanonicalFoundation(
  verified.data, verified.revision, { ...productiveInput, roleGuru: 'GURU_MAPEL_UMUM_SMK' },
));

const sameAgain = await verifyCanonicalBytes(raw, meta, meta.revision);
assert(sameAgain.revision === verified.revision, 'same content produced different revision');
const modified = new Uint8Array(rawBytes.length + 1);
modified.set(rawBytes); modified[modified.length - 1] = 10;
const changedHash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', modified)))
  .map((b) => b.toString(16).padStart(2, '0')).join('');
assert(changedHash !== verified.revision, 'modified content did not change revision');
await expectAsyncDenied('metadata/content mismatch', () => verifyCanonicalBytes(
  modified.buffer, meta, meta.revision,
));
await expectAsyncDenied('server expected revision mismatch', () => verifyCanonicalBytes(
  raw, meta, '0'.repeat(64),
));

console.log(JSON.stringify({
  hash_exact_match: 'PASS', same_content_same_revision: 'PASS',
  modified_content_different_revision: 'PASS', mismatch_fails_closed: 'PASS',
  expected_release_pinning: 'PASS',
  C1_valid_subject: 'PASS', C2_invalid_subject: 'DENIED', C3_valid_phase: 'PASS',
  C4_invalid_phase: 'DENIED', C5_valid_element: 'PASS',
  C6_other_subject_element: 'DENIED', C7_other_phase_element: 'DENIED',
  C8_wrong_revision: 'DENIED', C9_invalid_productive_composite: 'DENIED',
  C10_valid_productive_composite: 'PASS',
}, null, 2));
