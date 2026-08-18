export type CpDataset = Record<string, Record<string, unknown>>;

export function asStrings(value: unknown): string[] {
  return Array.isArray(value)
    ? [...new Set(value.filter((v): v is string => typeof v === 'string' && v.length > 0))]
    : [];
}

export function phaseRecord(subject: Record<string, unknown>, phaseKey: string) {
  const phase = subject[phaseKey];
  return phase && typeof phase === 'object' ? phase as Record<string, unknown> : null;
}

function hex(bytes: ArrayBuffer) {
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function verifyCanonicalBytes(
  raw: ArrayBuffer,
  meta: { algorithm?: string; revision?: string },
  expectedRevision: string,
) {
  const revision = hex(await crypto.subtle.digest('SHA-256', raw));
  if (!/^[0-9a-f]{64}$/.test(expectedRevision) ||
      meta.algorithm !== 'SHA-256' || meta.revision !== revision || revision !== expectedRevision) {
    throw new Error('Revision canonical CP tidak cocok dengan file authority');
  }
  return {
    revision,
    data: JSON.parse(new TextDecoder().decode(raw)) as CpDataset,
  };
}

export function validateCanonicalFoundation(
  data: CpDataset,
  revision: string,
  input: {
    roleGuru: string;
    jenjang: string;
    phaseKey: string;
    subjectKeys: string[];
    selectedSubject: string;
    bidang: string | null;
    program: string | null;
    elementRefs: unknown[];
  },
) {
  const { roleGuru, jenjang, phaseKey, subjectKeys, selectedSubject, bidang, program, elementRefs } = input;
  if (!['SD', 'SMP', 'SMA', 'SMK'].includes(jenjang) ||
      !['fase_a', 'fase_b', 'fase_c', 'fase_d', 'fase_e', 'fase_f'].includes(phaseKey) ||
      !subjectKeys.length) {
    throw new Error('Jenjang, phase, atau subject scope tidak valid');
  }
  if (roleGuru !== 'WALI_KELAS' && subjectKeys.length !== 1) {
    throw new Error('Guru mapel hanya boleh mempunyai satu subject authority');
  }
  if (!subjectKeys.includes(selectedSubject)) throw new Error('Selected subject di luar scope');

  for (const key of subjectKeys) {
    const subject = data[key];
    if (!subject || !phaseRecord(subject, phaseKey)) throw new Error(`Subject/phase canonical tidak valid: ${key}`);
    if (!asStrings(subject.jenjang).includes(jenjang)) throw new Error(`Subject ${key} tidak berlaku untuk ${jenjang}`);
    if (roleGuru === 'GURU_MAPEL_PRODUKTIF_SMK') {
      if (jenjang !== 'SMK' || subject.bidang !== bidang || subject.program_keahlian !== program || subject.bidang === 'Umum') {
        throw new Error('Productive program composite tidak sesuai canonical domain');
      }
    } else if (roleGuru === 'GURU_MAPEL_UMUM_SMK') {
      if (jenjang !== 'SMK' || subject.bidang !== 'Umum') {
        throw new Error('General-SMK scope hanya menerima canonical general subject');
      }
    } else if (subject.bidang !== 'Umum') {
      throw new Error('Role ini tidak berwenang atas productive subject');
    }
  }

  for (const rawRef of elementRefs) {
    const ref = rawRef as Record<string, unknown>;
    const subject = data[String(ref.subject_key ?? '')];
    const phase = subject && phaseRecord(subject, String(ref.phase_key ?? ''));
    const names = Array.isArray(phase?.elemen)
      ? (phase!.elemen as Array<Record<string, unknown>>).map((e) => e.nama)
      : [];
    if (ref.cp_dataset_revision !== revision || !subjectKeys.includes(String(ref.subject_key)) ||
        ref.phase_key !== phaseKey || !names.includes(ref.element_name)) {
      throw new Error('CP element reference tidak valid atau di luar domain');
    }
  }
}
