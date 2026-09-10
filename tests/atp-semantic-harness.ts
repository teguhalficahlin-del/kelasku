// HARNESS UJI SEMANTIK ATP — memanggil model sungguhan, TIDAK menyentuh produksi.
//
// Jalankan:
//   deno run --allow-read --allow-write --allow-env tests/atp-semantic-harness.ts --dry
//   deno run --allow-read --allow-write --allow-env --allow-net tests/atp-semantic-harness.ts
//   ... --hanya S1,S7
//   ... --artefak tests/artifacts/atp-semantic-pass5   (folder artefak; bawaan: tests/artifacts/atp-semantic)
//
// APA YANG BERKAS INI TIDAK LAKUKAN, dan itu inti keamanannya:
//   - tidak membaca maupun menulis Supabase (tidak ada createClient sama sekali);
//   - tidak memanggil fn_check_rate_limit, sehingga jatah guru tidak berkurang;
//   - tidak menulis atp_induk;
//   - tidak men-deploy apa pun;
//   - tidak pernah mencetak atau menyimpan kunci API ke berkas mana pun.
//
// PARITAS DENGAN PRODUKSI — cara berkas ini menjamin prompt yang diuji benar-
// benar prompt yang dipakai generate-atp:
//
//   SYSTEM_PROMPT, anggaranTokenAtp(), dan pembangun userMessage TIDAK disalin
//   ulang ke sini. Ketiganya DIAMBIL DARI SUMBER generate-atp/index.ts pada saat
//   dijalankan, lalu dievaluasi apa adanya. Menyalinnya berarti membuat kembar
//   yang menyimpang diam-diam — kelas cacat yang sudah dibayar dua kali di repo
//   ini (BENTUK_INSTRUMEN vs KUNCI_MURID, lalu calculateAllocation vs
//   hitungAlokasi). Pola pengambilan-dari-sumber ini sama dengan yang sudah
//   dipakai tests/atp-trace.mjs.
//
//   Sisanya diimpor langsung dari kontrak.ts, modul yang sama yang dipakai Edge
//   Function — termasuk, sejak Pass 5, parser keluaran, teks perbaikan, syarat
//   validasi, dan orkestrator "satu panggilan utama + paling banyak satu
//   perbaikan" (susunDenganSatuPerbaikan). Sampai Pass 4 extractJson() dan teks
//   perbaikan DISALIN ke sini (SEM-H-001); kini tidak ada lagi yang disalin.
//
//   TIDAK ADA satu baris pun kode produksi yang diubah demi harness ini.

import {
  hitungAlokasi, hitungTargetTp, resolveDelegasi, bangunKonteksAtp,
  dasarTersedia, tuntutanWajib, acuanUntuk, statusLayanan,
  periksaParitasCp, TARGET_KATA_JUDUL, MAKS_KATA_JUDUL,
  prioritasDipilih, bangunSyaratValidasi, susunDenganSatuPerbaikan,
  type ElemenCp,
} from '../supabase/functions/generate-atp/kontrak.ts';

const SUMBER_EF = 'supabase/functions/generate-atp/index.ts';

const argv = Deno.args;
const nilaiArg = (nama: string) => {
  const i = argv.indexOf(nama);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : null;
};
// Folder artefak dapat dipilih, supaya bukti run sebelumnya TIDAK tertimpa
// (Pass 5: run baseline tetap utuh sebagai bukti BEFORE). Kedalamannya wajib
// tiga tingkat di bawah akar repo karena modul ekstraksi mengimpor kontrak.ts
// lewat '../../../'.
const ARTEFAK = nilaiArg('--artefak') ?? 'tests/artifacts/atp-semantic';
if (ARTEFAK.split('/').filter(Boolean).length !== 3) {
  throw new Error(`--artefak harus tiga tingkat di bawah akar repo (mis. tests/artifacts/nama), dapat: ${ARTEFAK}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. PENGAMBILAN POTONGAN SUMBER — verbatim, bukan salinan
// ─────────────────────────────────────────────────────────────────────────────

const src = (await Deno.readTextFile(SUMBER_EF)).split('\r\n').join('\n');

/** Mengambil satu blok dari sumber, dari `mulai` sampai `akhir` (inklusif). */
function potong(mulai: string, akhir: string): string {
  const i = src.indexOf(mulai);
  if (i < 0) throw new Error(`PARITAS GAGAL: tidak menemukan "${mulai}" di ${SUMBER_EF}`);
  const j = src.indexOf(akhir, i);
  if (j < 0) throw new Error(`PARITAS GAGAL: tidak menemukan akhir "${akhir}" setelah "${mulai}"`);
  return src.slice(i, j + akhir.length);
}

async function sha256(t: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

// Ketiga potongan di bawah DIAMBIL DARI SUMBER, dituliskan apa adanya ke satu
// modul TypeScript sementara, lalu diimpor. Menuliskannya sebagai modul — bukan
// mengevaluasinya dengan new Function — dilakukan karena sumbernya TypeScript:
// mengupas anotasi tipe dengan regex berarti mengubah teks yang justru sedang
// dibuktikan tidak berubah. Modul yang dibangkitkan disimpan sebagai artefak
// supaya peninjau dapat membandingkannya sendiri dengan sumbernya.
const potonganPrompt      = potong('const SYSTEM_PROMPT =', "pelanggaran aturan.';");
const potonganAnggaran    = potong('function anggaranTokenAtp(', '\n}\n');
const potonganUserMessage = potong('  const userMessage = JSON.stringify({', '\n  });');

await Deno.mkdir(ARTEFAK, { recursive: true });
const MODUL_EKSTRAK = `${ARTEFAK}/_parity-extract.ts`;
await Deno.writeTextFile(MODUL_EKSTRAK, [
  '// DIBANGKITKAN oleh tests/atp-semantic-harness.ts — jangan disunting.',
  `// Diambil verbatim dari ${SUMBER_EF}. Inilah yang benar-benar dikirim ke model.`,
  "import { TARGET_KATA_JUDUL, MAKS_KATA_JUDUL, MAKS_TUNTUTAN_PER_TP, PENGARUH_PRIORITAS } from '../../../supabase/functions/generate-atp/kontrak.ts';",
  '',
  potonganPrompt,
  '',
  potonganAnggaran,
  '',
  '// deno-lint-ignore-file no-explicit-any',
  'export function bangunUserMessage(',
  '  konteks: any, sumber_flow: any, atp: any, targetTp: any,',
  '  jpOp: any, alokasi: any, elemenCp: any, wajib: any,',
  '): string {',
  potonganUserMessage,
  '  return userMessage;',
  '}',
  '',
  'export { SYSTEM_PROMPT, anggaranTokenAtp };',
  '',
].join('\n'));

const ekstrak = await import(
  new URL('../' + MODUL_EKSTRAK, import.meta.url).href + '?t=' + Date.now()
) as {
  SYSTEM_PROMPT: string;
  anggaranTokenAtp: (e: number, jp: number, k?: number) => number;
  bangunUserMessage: (...a: unknown[]) => string;
};

const SYSTEM_PROMPT = ekstrak.SYSTEM_PROMPT;
const anggaranTokenAtp = ekstrak.anggaranTokenAtp;
const bangunUserMessage = ekstrak.bangunUserMessage;

// Model dan konfigurasinya — DIBACA dari sumber, bukan ditulis ulang di sini.
const MODEL = (/generativelanguage\.googleapis\.com\/v1beta\/models\/([A-Za-z0-9.\-]+):generateContent/
  .exec(src) ?? [])[1];
if (!MODEL) throw new Error('PARITAS GAGAL: nama model tidak ditemukan di sumber');
const ADA_TEMPERATURE = /generationConfig:\s*\{[^}]*temperature/.test(src);
const GENERATION_CONFIG_SUMBER = (/generationConfig:\s*\{[^}]*\}/.exec(src) ?? [])[0] ?? '(tidak ditemukan)';
const TIMEOUT_UTAMA_MS = 60_000;   // fase 'utama' di index.ts
const ANGGARAN_REPAIR_MS = 100_000; // fase 'perbaikan': Math.max(10_000, 100_000 - elapsed)

// ─────────────────────────────────────────────────────────────────────────────
// 2. CP ANCHOR — dari acuan yang berlaku, bukan dikarang
// ─────────────────────────────────────────────────────────────────────────────

const MAPEL = 'Bahasa Inggris', FASE = 'E', JENJANG = 'SMK';
const acuan = acuanUntuk(MAPEL, FASE);
if (!acuan) throw new Error('acuan CP Bahasa Inggris Fase E tidak ditemukan');

const ELEMEN_CP: ElemenCp[] = Object.entries(acuan.elemen)
  .map(([id, el]) => ({ id, label: el.label, cp_text: el.cp_normatif }));

const WAJIB = tuntutanWajib(acuan);

// ─────────────────────────────────────────────────────────────────────────────
// 3. KASUS SINTETIS — tidak ada nama guru maupun murid nyata
// ─────────────────────────────────────────────────────────────────────────────

type Jawaban = Record<string, Record<string, unknown>>;

/** Dasar bersama S1. Seluruh kunci dan nilainya diambil dari definisi
 *  pertanyaan yang benar-benar aktif di guru/js/rancang-chat-flow.js. */
function dasarS1(): Jawaban {
  return {
    KONTEKS_CP: { konfirmasi_konteks: 'sesuai', program_keahlian: 'Tata Busana' },
    PROFIL_KELAS: { jumlah_murid_kelas: 32, bahasa_pengantar: 'indonesia_dominan' },
    PROFIL_SISWA: {
      tingkat_kemampuan_awal: 'sedikit_di_bawah',
      dasar_informasi_kesiapan: 'hasil_penilaian',
      kondisi_murid: 'tidak_ada',
      bantuan_konkret: ['memahami_bacaan'],
    },
    // 4 JP/mgg x 36 mgg = 144; cadangan 2 mgg = 8; prasyarat 10 => 126 JP,
    // satuan 2 JP => 63 pertemuan. Angka 126 diminta prompt uji.
    WAKTU: {
      tahun_pelajaran: '2026/2027', jp_per_minggu: 4, durasi_jp: '45',
      pola_jadwal: 'reguler_bagi', jp_per_sesi: 2,
      minggu_efektif_mode: 'isi_sendiri', minggu_sem1: 18, minggu_sem2: 18,
      cadangan_minggu: '2', konfirmasi_waktu: 'ya',
    },
    PENGUATAN_PRASYARAT: {
      strategi_prasyarat: 'terintegrasi', alokasi_prasyarat: 'tersendiri', jp_prasyarat: 10,
      target_prioritas: ['pkl_kerja', 'kemampuan_dasar'],
    },
    KONTEKS_DUDI: {
      konteks_tugas: 'tentukan_saat_menyusun',
      situasi_khusus: 'tidak_ada',
      metode_pengurutan: 'tentukan_saat_menyusun',
    },
    ATP_SUMMARY: { persetujuan_atp_summary: 'generate' },
  };
}

function ubah(dasar: Jawaban, patch: Jawaban): Jawaban {
  const out: Jawaban = {};
  for (const k of Object.keys(dasar)) out[k] = { ...dasar[k], ...(patch[k] ?? {}) };
  for (const k of Object.keys(patch)) if (!out[k]) out[k] = patch[k];
  return out;
}

type Kasus = { id: string; judul: string; jumlah_murid: number; cd: Jawaban };

const KASUS: Kasus[] = [
  { id: 'S1', judul: 'BASELINE', jumlah_murid: 32, cd: dasarS1() },

  { id: 'S2', judul: 'READINESS VERY LOW', jumlah_murid: 32,
    cd: ubah(dasarS1(), { PROFIL_SISWA: { tingkat_kemampuan_awal: 'jauh_di_bawah' } }) },

  { id: 'S3', judul: 'VOCATIONAL CONTEXT CHANGE', jumlah_murid: 32,
    cd: ubah(dasarS1(), { KONTEKS_CP: { program_keahlian: 'Teknik Otomotif' } }) },

  { id: 'S4', judul: 'TEACHER PRIORITY CHANGE', jumlah_murid: 32,
    cd: ubah(dasarS1(), { PENGUATAN_PRASYARAT: { target_prioritas: ['pendidikan_lanjut'] } }) },

  { id: 'S5', judul: 'TEACHER OVERRIDES A17/A19', jumlah_murid: 32,
    cd: ubah(dasarS1(), {
      KONTEKS_DUDI: { konteks_tugas: 'kehidupan', metode_pengurutan: 'mudah_sulit' },
    }) },

  // 2 JP/mgg x 26 mgg = 52; cadangan 2 mgg = 4 => 48 JP, satuan 2 => 24 pertemuan.
  { id: 'S6', judul: 'LOW TIME / LARGE CLASS STRESS', jumlah_murid: 36,
    cd: ubah(dasarS1(), {
      PROFIL_KELAS: { jumlah_murid_kelas: 36 },
      PROFIL_SISWA: { tingkat_kemampuan_awal: 'jauh_di_bawah' },
      WAKTU: {
        jp_per_minggu: 2, pola_jadwal: 'reguler_satu', jp_per_sesi: 0,
        minggu_sem1: 13, minggu_sem2: 13, cadangan_minggu: '2',
      },
      PENGUATAN_PRASYARAT: { strategi_prasyarat: 'terintegrasi', alokasi_prasyarat: 'menyatu', jp_prasyarat: 0 },
    }) },

  { id: 'S7', judul: 'BASELINE REPEAT', jumlah_murid: 32, cd: dasarS1() },
];

// ─────────────────────────────────────────────────────────────────────────────
// 4. PIPELINE — urutan yang sama dengan generate-atp langkah 5a-10
// ─────────────────────────────────────────────────────────────────────────────

function siapkan(k: Kasus) {
  const cd = k.cd as unknown as Record<string, unknown>;

  const layanan = statusLayanan(MAPEL, FASE);
  const paritas = periksaParitasCp(ELEMEN_CP, acuan);
  const alokasi = hitungAlokasi(cd);
  const delegasi = resolveDelegasi(cd);
  const programKeahlian = String((cd.KONTEKS_CP as Record<string, unknown>).program_keahlian ?? '');
  const dasarBoleh = dasarTersedia(
    cd, { program_keahlian: programKeahlian, jumlah_murid: k.jumlah_murid }, WAJIB.map(w => w.id),
  );
  const konteks = bangunKonteksAtp(
    cd, { mapel: MAPEL, fase: FASE, jenjang: JENJANG, jumlah_murid: k.jumlah_murid },
    alokasi, ELEMEN_CP, delegasi, dasarBoleh,
  );
  const kesiapan = String((cd.PROFIL_SISWA as Record<string, unknown>).tingkat_kemampuan_awal ?? 'belum_diketahui');
  const targetTp = hitungTargetTp(alokasi, kesiapan, WAJIB.length, null);
  const jpOp = alokasi.jp_operasional;

  const userMessage = bangunUserMessage(
    konteks, 'susun', { mapel: MAPEL, fase: FASE, jenjang: JENJANG },
    targetTp, jpOp, alokasi, ELEMEN_CP, WAJIB,
  );
  const anggaranToken = anggaranTokenAtp(ELEMEN_CP.length, jpOp, konteks.keputusan_terbuka.length);

  // Syarat validasi dibangun fungsi PRODUKSI yang sama dengan generate-atp
  // (Pass 5) — bukan dirakit ulang di sini, supaya aturan baru tidak pernah
  // tertinggal di harness.
  const syarat = bangunSyaratValidasi({
    alokasi, target_tp: targetTp.target, elemen: ELEMEN_CP, wajib: WAJIB,
    delegasi, dasar_tersedia: dasarBoleh, prioritas: prioritasDipilih(cd),
    kesiapan,
  });

  return { cd, layanan, paritas, alokasi, delegasi, konteks, targetTp, jpOp, userMessage, anggaranToken, syarat };
}

type Panggilan = { teks: string; usage: Record<string, unknown>; ms: number; finishReason: string };

async function panggilModel(
  apiKey: string,
  messages: { role: string; content: string }[],
  timeoutMs: number,
  maxTokens: number,
): Promise<Panggilan> {
  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), timeoutMs);
  const mulai = Date.now();
  try {
    const contents = messages.map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents,
          generationConfig: { maxOutputTokens: maxTokens },
        }),
        signal: controller.signal,
      },
    );
    const b = await res.json();
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${JSON.stringify(b).slice(0, 400)}`);
    const cand = b?.candidates?.[0];
    return {
      teks: String(cand?.content?.parts?.[0]?.text ?? ''),
      usage: (b?.usageMetadata ?? {}) as Record<string, unknown>,
      ms: Date.now() - mulai,
      finishReason: String(cand?.finishReason ?? ''),
    };
  } finally {
    clearTimeout(tid);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. JALAN
// ─────────────────────────────────────────────────────────────────────────────

const dry = argv.includes('--dry');
const hanya = (() => {
  const v = nilaiArg('--hanya');
  return v ? new Set(v.split(',')) : null;
})();

// Kunci TIDAK PERNAH dicetak, disimpan, atau masuk artefak.
const apiKey = Deno.env.get('GOOGLE_API_KEY') ?? Deno.env.get('GEMINI_API_KEY') ?? '';

const paritasBukti = {
  sumber: SUMBER_EF,
  model: MODEL,
  temperature: ADA_TEMPERATURE ? '(diset di sumber)' : '(tidak diset — default penyedia)',
  generation_config_di_sumber: GENERATION_CONFIG_SUMBER,
  timeout_utama_ms: TIMEOUT_UTAMA_MS,
  anggaran_repair_ms: ANGGARAN_REPAIR_MS,
  maksimum_panggilan_per_kasus: 2,
  system_prompt_sha256: await sha256(SYSTEM_PROMPT),
  system_prompt_panjang: SYSTEM_PROMPT.length,
  potongan_user_message_sha256: await sha256(potonganUserMessage),
  potongan_anggaran_token_sha256: await sha256(potonganAnggaran),
  cp_versi: acuan.versi_cp,
  cp_review_status: acuan.review_status,
  jumlah_tuntutan: WAJIB.length,
  tuntutan: WAJIB.map(w => w.id),
};
await Deno.writeTextFile(`${ARTEFAK}/_parity.json`, JSON.stringify(paritasBukti, null, 2));
await Deno.writeTextFile(`${ARTEFAK}/_system-prompt.txt`, SYSTEM_PROMPT);

console.log('PARITAS');
console.log('  artefak              :', ARTEFAK);
console.log('  model                :', MODEL);
console.log('  temperature          :', paritasBukti.temperature);
console.log('  generationConfig     :', GENERATION_CONFIG_SUMBER);
console.log('  SYSTEM_PROMPT sha256 :', paritasBukti.system_prompt_sha256);
console.log('  SYSTEM_PROMPT panjang:', SYSTEM_PROMPT.length, 'karakter');
console.log('  CP                   :', acuan.versi_cp, '| review:', acuan.review_status,
  '|', WAJIB.length, 'tuntutan');
console.log('');

const ringkasan: Record<string, unknown>[] = [];

for (const k of KASUS) {
  if (hanya && !hanya.has(k.id)) continue;
  const p = siapkan(k);

  await Deno.writeTextFile(`${ARTEFAK}/${k.id}-input.json`, JSON.stringify(k.cd, null, 2));
  await Deno.writeTextFile(`${ARTEFAK}/${k.id}-context.json`, JSON.stringify(p.konteks, null, 2));
  await Deno.writeTextFile(`${ARTEFAK}/${k.id}-user-message.json`, p.userMessage);
  await Deno.writeTextFile(`${ARTEFAK}/${k.id}-system-prompt.txt`, SYSTEM_PROMPT);

  const pra = {
    kasus: k.id, judul: k.judul,
    status_layanan: p.layanan.kode,
    paritas_cp: p.paritas.cocok,
    jp_operasional: p.jpOp,
    satuan_pertemuan: p.alokasi.satuan_pertemuan,
    jumlah_pertemuan: p.alokasi.jumlah_pertemuan,
    jp_tidak_terjadwal: p.alokasi.jp_tidak_terjadwal,
    anggaran_semester: p.alokasi.anggaran_semester,
    target_tp: p.targetTp,
    keputusan_terbuka: p.konteks.keputusan_terbuka.map(q => q.question_id),
    keputusan_aturan: p.delegasi.keputusan.map(x => ({ pertanyaan: x.pertanyaan, dipilih: x.dipilih })),
    prioritas_wajib: (p.syarat.prioritas_wajib ?? []).map(x => x.prioritas),
    anggaran_token: p.anggaranToken,
    panjang_user_message: p.userMessage.length,
  };
  await Deno.writeTextFile(`${ARTEFAK}/${k.id}-prepared.json`, JSON.stringify(pra, null, 2));

  console.log(`${k.id} ${k.judul}`);
  console.log(`   layanan=${p.layanan.kode} paritasCP=${p.paritas.cocok} jpOp=${p.jpOp}` +
    ` satuan=${p.alokasi.satuan_pertemuan} pertemuan=${p.alokasi.jumlah_pertemuan}` +
    ` targetTP=${p.targetTp.target} (min ${p.targetTp.min}, maks ${p.targetTp.maks})`);
  console.log(`   semester=${JSON.stringify(p.alokasi.anggaran_semester)}` +
    ` terbuka=[${pra.keputusan_terbuka.join(',')}] prioritas=[${pra.prioritas_wajib.join(',')}] token=${p.anggaranToken}`);

  if (dry || !apiKey) {
    ringkasan.push({ ...pra, status: dry ? 'DRY_RUN' : 'BLOCKED_NO_CREDENTIAL' });
    continue;
  }

  // ── penyusunan — orkestrator PRODUKSI yang sama dengan generate-atp ──
  //
  // Paling banyak dua panggilan: utama + satu perbaikan. Setiap panggilan
  // meninggalkan artefaknya sendiri (Pass 5, SEM-H-002): tidak ada teks mentah
  // yang ditimpa panggilan berikutnya.
  const usage: Record<string, unknown>[] = [];
  let latensi = 0;
  let nomor = 0;
  const mulaiKasus = Date.now();
  let status = 'FAILED_AFTER_REPAIR';
  let hasil: Awaited<ReturnType<typeof susunDenganSatuPerbaikan>> | null = null;

  try {
    hasil = await susunDenganSatuPerbaikan(async (pesan, fase) => {
      nomor++;
      const n = nomor;
      if (fase === 'perbaikan') {
        await Deno.writeTextFile(`${ARTEFAK}/${k.id}-call${n}-repair-prompt.txt`, pesan[pesan.length - 1].content);
      }
      const timeout = fase === 'utama'
        ? TIMEOUT_UTAMA_MS
        : Math.max(10_000, ANGGARAN_REPAIR_MS - (Date.now() - mulaiKasus));
      const r = await panggilModel(apiKey, pesan, timeout, p.anggaranToken);
      latensi += r.ms; usage.push(r.usage);
      await Deno.writeTextFile(`${ARTEFAK}/${k.id}-call${n}-response.txt`, r.teks);
      if (r.finishReason === 'MAX_TOKENS') throw new Error('ATP_GENERATION_TRUNCATED');
      return r.teks;
    }, p.userMessage, p.syarat);
    status = hasil.status;
  } catch (e) {
    await Deno.writeTextFile(`${ARTEFAK}/${k.id}-error.txt`, String(e));
  }

  if (hasil) {
    await Deno.writeTextFile(`${ARTEFAK}/${k.id}-validation.json`, JSON.stringify(
      hasil.percobaan.map((x, i) => ({
        panggilan: i + 1, fase: x.fase, galat_parse: x.galat_parse,
        valid: x.validasi?.valid ?? false,
        errors: x.validasi?.errors ?? [], peringatan: x.validasi?.peringatan ?? [],
      })), null, 2));
    const akhirV = hasil.akhir;
    if (akhirV) {
      await Deno.writeTextFile(`${ARTEFAK}/${k.id}-output.json`, JSON.stringify(
        { tp: akhirV.entries, keputusan: akhirV.keputusan, penerapan_prioritas: akhirV.penerapan }, null, 2));
    }
    if (hasil.ok && akhirV) {
      await Deno.writeTextFile(`${ARTEFAK}/${k.id}-output-final.json`, JSON.stringify(
        { tp: akhirV.entries, keputusan: akhirV.keputusan, penerapan_prioritas: akhirV.penerapan }, null, 2));
    }
  }

  const akhir = hasil?.akhir ?? null;
  const judul = (akhir?.entries ?? []).map(t => String(t.judul).trim().split(/\s+/).length);
  ringkasan.push({
    ...pra, status, panggilan_model: nomor, latensi_ms: latensi,
    jumlah_tp: akhir?.entries.length ?? 0,
    total_jp: (akhir?.entries ?? []).reduce((s, t) => s + (Number(t.jp_alokasi) || 0), 0),
    judul_maks_kata: judul.length ? Math.max(...judul) : 0,
    judul_pita_toleransi: judul.filter(n => n > TARGET_KATA_JUDUL && n <= MAKS_KATA_JUDUL).length,
    keputusan_penyusunan: (akhir?.keputusan ?? []).map(x => ({ p: x.pertanyaan, dipilih: x.dipilih, dasar: x.dasar })),
    penerapan_prioritas: akhir?.penerapan ?? [],
    usage,
  });
  console.log(`   -> ${status} tp=${akhir?.entries.length ?? 0} panggilan=${nomor} ${latensi}ms`);
}

await Deno.writeTextFile(`${ARTEFAK}/_summary.json`, JSON.stringify(ringkasan, null, 2));
console.log('\nartefak:', ARTEFAK);
if (!apiKey && !dry) {
  console.log('\nTIDAK ADA KREDENSIAL MODEL (GOOGLE_API_KEY / GEMINI_API_KEY).');
  console.log('Hanya tahap sebelum panggilan model yang dijalankan.');
}
