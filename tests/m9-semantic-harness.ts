// M9 — HARNESS PENERIMAAN SEMANTIK.
//
// M1–M8 membuktikan STRUKTUR. M9 menjawab yang tidak dapat dijawab validator:
// apakah Modul yang dihasilkan benar-benar masuk akal, sesuai konteks guru,
// realistis dijalankan, dan pedagogis konsisten.
//
// CARA KERJA, DAN MENGAPA BEGINI.
//
// Pipeline sungguhan ada di Edge Function `generate-modul` dan menyentuh basis
// data produksi. M9 dilarang deploy dan dilarang menulis ke DB. Karena itu
// harness ini menjalankan JALUR YANG SAMA secara lokal:
//
//   - SYSTEM_PROMPT dan kelima `buildUserMessage*` diambil DARI SUMBER EF,
//     bukan disalin — pola yang sama dengan seluruh uji M3–M8;
//   - anggaran token dan urutan fase mengikuti pemanggilan aslinya;
//   - model dan endpoint persis sama dengan `callAI` (gemini-3.8-flash);
//   - hasil akhirnya divalidasi `validateModulOutputV400` dengan SELURUH
//     bendera kontrak sekarang menyala (M2+M4+M5+M6+M7).
//
// Yang TIDAK direplikasi: penghitung kuota, pencatatan pemakaian, dan penulisan
// `modul_induk` — ketiganya menyentuh DB dan tidak memengaruhi isi yang
// dihasilkan.
//
// KUNCI API dibaca dari environment dan TIDAK PERNAH dicetak maupun disimpan
// ke artefak.
//
// Jalankan:
//   deno run --allow-env --allow-net --allow-read --allow-write \
//     tests/m9-semantic-harness.ts --skenario 1

import { rakitModulFinal } from '../supabase/functions/generate-modul/assembly.ts';

const EF = new URL('../supabase/functions/generate-modul/index.ts', import.meta.url);
const ARTEFAK = new URL('./artifacts/m9/', import.meta.url);
const MODEL = 'gemini-3.8-flash';

// ── Memuat jalur EF dari sumbernya ──────────────────────────────────────────

const EKSPOR = [
  'SYSTEM_PROMPT', 'buildUserMessageFaseA', 'buildUserMessageFaseB',
  'buildUserMessageFaseC', 'buildUserMessageFaseB2', 'buildUserMessageFaseD',
  'validateModulOutputV400', 'extractJson', 'injectSubLangkahRef',
  'anggaranTokenFaseA', 'anggaranToken', 'anggaranTokenInstrumen',
  'anggaranTokenNaskah', 'anggaranTokenFaseD', 'perkiraanKktp',
  'arahanTitikAwal', 'resolvePreferensiFormatif',
  // Jalur perbaikan produksi (M9/D2) — diambil dari sumber yang sama, bukan
  // ditulis ulang: yang diuji harus jalur yang guru benar-benar lewati.
  'anggaranTokenPerbaikan', 'perintahPerbaikanStruktural',
  // Bendera validator yang produksi HITUNG, bukan tulis mati.
  'perangkatDigitalDiizinkan',
  // Lifecycle perbaikan (M9/D2) — harness memanggil fungsi YANG SAMA dengan EF.
  'perbaikiModulSetelahValidasi',
  // Kebijakan batas waktu perbaikan — sama dengan EF.
  'batasWaktuPerbaikan', 'BATAS_PERMINTAAN_MS',
];

// deno-lint-ignore no-explicit-any
async function muatEF(): Promise<any> {
  const penuh = await Deno.readTextFile(EF);
  const batas = penuh.indexOf('// ── EDGE FUNCTION ─');
  if (batas < 0) throw new Error('penanda EDGE FUNCTION tidak ada');
  const tmp = new URL(`._m9-${crypto.randomUUID()}.ts`, new URL('.', EF));
  try {
    await Deno.writeTextFile(tmp, penuh.slice(0, batas) + `\nexport { ${EKSPOR.join(', ')} };\n`);
    return await import(tmp.href);
  } finally {
    await Deno.remove(tmp).catch(() => {});
  }
}

// ── Panggilan model — bentuk permintaan persis seperti callAI() ─────────────

type Pemakaian = { fase: string; masuk?: number; keluar?: number; penalaran?: number; total?: number; ms: number };
const pemakaian: Pemakaian[] = [];

async function panggilModel(
  systemPrompt: string, userMsg: string | Array<{ role: string; content: string }>,
  maxTokens: number, fase: string, timeoutMs: number,
): Promise<string> {
  // Bentuk `contents` persis callAI(): 'assistant' → 'model'.
  const pesan = typeof userMsg === 'string' ? [{ role: 'user', content: userMsg }] : userMsg;
  const contents = pesan.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));
  const key = Deno.env.get('GOOGLE_API_KEY');
  if (!key) throw new Error('GOOGLE_API_KEY tidak tersedia di environment');
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), timeoutMs);
  const mulai = Date.now();
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${key}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents,
          generationConfig: { maxOutputTokens: maxTokens },
        }),
        signal: ctrl.signal,
      },
    );
    if (!res.ok) {
      const detail = (await res.text()).slice(0, 300);
      throw new Error(`HTTP ${res.status} di ${fase}: ${detail}`);
    }
    const data = await res.json();
    const um = data.usageMetadata ?? {};
    pemakaian.push({
      fase, masuk: um.promptTokenCount, keluar: um.candidatesTokenCount,
      penalaran: um.thoughtsTokenCount, total: um.totalTokenCount, ms: Date.now() - mulai,
    });
    const cand = data.candidates?.[0];
    if (cand?.finishReason === 'MAX_TOKENS')
      throw new Error(`${fase} TERPOTONG di batas ${maxTokens} token (keluar=${um.candidatesTokenCount}, penalaran=${um.thoughtsTokenCount})`);
    // Persis callAI(): hanya parts[0]. Menggabungkan seluruh parts akan
    // menyelamatkan keluaran yang di produksi justru terpenggal.
    const teks = String(cand?.content?.parts?.[0]?.text ?? '');
    if (!teks.trim()) throw new Error(`${fase} mengembalikan teks kosong (finishReason=${cand?.finishReason})`);
    return teks;
  } finally {
    clearTimeout(tid);
  }
}

// Persis callPhase(): bila keluaran tidak dapat di-parse, SATU putaran
// perbaikan JSON dengan percakapan [user, model, user] dan perintah struktural
// milik fase itu. Tanpa ini harness menjatuhkan generate yang di produksi
// masih diselamatkan (Skenario 3 attempt 4).
// deno-lint-ignore no-explicit-any
async function panggilFase(M: any, userMsg: string, maxTokens: number, label: string,
                           timeoutMs: number, fase: string): Promise<any> {
  const raw = await panggilModel(M.SYSTEM_PROMPT, userMsg, maxTokens, label, timeoutMs);
  try {
    return M.extractJson(raw);
  } catch {
    const ulang = await panggilModel(M.SYSTEM_PROMPT, [
      { role: 'user', content: userMsg },
      { role: 'assistant', content: raw },
      { role: 'user', content:
        `JSON tidak valid. Hasilkan ulang HANYA JSON object untuk ${label} yang valid. ` +
        M.perintahPerbaikanStruktural(fase) },
    ], maxTokens, `${label} (perbaikan JSON)`, 60_000);
    return M.extractJson(ulang);
  }
}

// ── Skenario ────────────────────────────────────────────────────────────────
//
// Seluruh nilai konteks memakai kunci yang BENAR-BENAR ada di kontrak ATP;
// tuntutan CP diambil dari acuan Bahasa Inggris Fase E yang sudah diterima.

export type Skenario = {
  nomor: number;
  nama: string;
  fokusReview: string;
  kesiapan: string;
  kesiapanArti: string;
  konteksTugas: string;
  konteksTugasArti: string;
  programKeahlian: string;
  jumlahMurid: number;
  prioritas: Array<{ kunci: string; arti: string; arahan: string }>;
  prioritasUntukTpIni: string[];
  tpJudul: string;
  tuntutan: string[];
  kategoriTeks: string[];
  jumlahPertemuan: number;
  jpPerPertemuan: number;
};

export const SKENARIO: Skenario[] = [
  {
    nomor: 1,
    nama: 'Kesiapan sangat rendah',
    fokusReview: 'Apakah Modul benar-benar mengurangi lompatan kognitif dan menyediakan progresi yang masuk akal?',
    kesiapan: 'jauh_di_bawah',
    kesiapanArti: 'sebagian besar murid jauh di bawah prasyarat TP ini',
    konteksTugas: 'seimbang',
    konteksTugasArti: 'contoh dan tugas seimbang antara kehidupan sehari-hari dan dunia kerja',
    programKeahlian: 'Tata Busana',
    jumlahMurid: 32,
    prioritas: [{ kunci: 'literasi', arti: 'penguatan literasi', arahan: 'perbanyak membaca teks utuh' }],
    prioritasUntukTpIni: ['literasi'],
    tpJudul: 'Peserta didik memahami alur informasi keseluruhan dan gagasan utama teks prosedur nonfiksi sederhana berbahasa Inggris, serta menyimpulkan informasi tersurat di dalamnya.',
    tuntutan: ['BIE-E25-MM-1', 'BIE-E25-MM-2'],
    kategoriTeks: ['nonfiksi'],
    jumlahPertemuan: 3,
    jpPerPertemuan: 4,
  },
  {
    nomor: 2,
    nama: 'Kesiapan lebih tinggi — pembanding Skenario 1',
    fokusReview: 'Dibandingkan Skenario 1: apakah rancangannya berbeda secara SUBSTANSI (bantuan, kompleksitas, kemandirian, progresi), bukan sekadar berbeda kalimat?',
    // 'sesuai' — nilai A4 yang SAH (rancang-chat-flow.js). Sebelum koreksi M9
    // skenario ini memakai 'sesuai_prasyarat', yang bukan kunci A4, sehingga di
    // produksi pun arahan titik awalnya diam-diam null.
    kesiapan: 'sesuai',
    kesiapanArti: 'sebagian besar murid sudah memenuhi prasyarat TP ini',
    konteksTugas: 'seimbang',
    konteksTugasArti: 'contoh dan tugas seimbang antara kehidupan sehari-hari dan dunia kerja',
    programKeahlian: 'Tata Busana',
    jumlahMurid: 32,
    prioritas: [{ kunci: 'literasi', arti: 'penguatan literasi', arahan: 'perbanyak membaca teks utuh' }],
    prioritasUntukTpIni: ['literasi'],
    tpJudul: 'Peserta didik memahami alur informasi keseluruhan dan gagasan utama teks prosedur nonfiksi sederhana berbahasa Inggris, serta menyimpulkan informasi tersurat di dalamnya.',
    tuntutan: ['BIE-E25-MM-1', 'BIE-E25-MM-2'],
    kategoriTeks: ['nonfiksi'],
    jumlahPertemuan: 3,
    jpPerPertemuan: 4,
  },
  {
    nomor: 3,
    nama: 'Konteks kejuruan relevan',
    fokusReview: 'Apakah konteks kejuruan dipakai secara AUTENTIK, bukan sekadar menempelkan kata jurusan pada tugas generik?',
    // 'sesuai' — nilai A4 yang SAH (rancang-chat-flow.js). Sebelum koreksi M9
    // skenario ini memakai 'sesuai_prasyarat', yang bukan kunci A4, sehingga di
    // produksi pun arahan titik awalnya diam-diam null.
    kesiapan: 'sesuai',
    kesiapanArti: 'sebagian besar murid sudah memenuhi prasyarat TP ini',
    konteksTugas: 'dominan_kerja',
    konteksTugasArti: 'sebagian besar contoh dan tugas berlatar dunia kerja',
    programKeahlian: 'Tata Busana',
    jumlahMurid: 30,
    prioritas: [{ kunci: 'komunikasi', arti: 'penguatan komunikasi lisan', arahan: 'perbanyak kesempatan berbicara' }],
    prioritasUntukTpIni: ['komunikasi'],
    tpJudul: 'Peserta didik menggunakan bahasa Inggris untuk mengungkapkan pendapat dan mempertahankan argumen dalam percakapan tentang topik yang dibahas.',
    tuntutan: ['BIE-E25-MB-2', 'BIE-E25-MB-3'],
    kategoriTeks: [],
    jumlahPertemuan: 3,
    jpPerPertemuan: 4,
  },
  {
    nomor: 4,
    nama: 'Penekanan guru + A17',
    fokusReview: 'Apakah keputusan konteks BENAR-BENAR tercermin di kegiatan, bukan sekadar diulang di keputusan_kontekstual?',
    kesiapan: 'sedikit_di_bawah',
    kesiapanArti: 'sebagian murid sedikit di bawah prasyarat TP ini',
    konteksTugas: 'dominan_sehari_hari',
    konteksTugasArti: 'sebagian besar contoh dan tugas berlatar kehidupan sehari-hari',
    programKeahlian: 'Tata Busana',
    jumlahMurid: 28,
    prioritas: [
      { kunci: 'kemandirian', arti: 'kemandirian belajar', arahan: 'kurangi bantuan secara bertahap' },
      { kunci: 'literasi', arti: 'penguatan literasi', arahan: 'perbanyak membaca teks utuh' },
    ],
    prioritasUntukTpIni: ['kemandirian'],
    tpJudul: 'Peserta didik mengomunikasikan gagasan dan pengalaman secara tertulis dalam teks nonfiksi sederhana berbahasa Inggris.',
    tuntutan: ['BIE-E25-MP-1'],
    kategoriTeks: ['nonfiksi'],
    jumlahPertemuan: 3,
    jpPerPertemuan: 4,
  },
];

// ── Menyusun masukan pipeline dari skenario ─────────────────────────────────

// deno-lint-ignore no-explicit-any
async function susunMasukan(sk: Skenario): Promise<any> {
  const kontrak = await import('../supabase/functions/generate-atp/kontrak.ts');
  // deno-lint-ignore no-explicit-any
  const acuan = (kontrak as any).acuanUntuk('bahasa_inggris', 'E');
  // deno-lint-ignore no-explicit-any
  const wajib = (kontrak as any).tuntutanWajib(acuan);
  // deno-lint-ignore no-explicit-any
  const peta = new Map<string, any>(wajib.map((w: any) => [w.id, w.t]));

  const tuntutanTerurai = sk.tuntutan.map(id => {
    const t = peta.get(id);
    if (!t) throw new Error(`tuntutan ${id} tidak ada di acuan CP Bahasa Inggris Fase E`);
    return { id, kompetensi: t.kompetensi, lingkup_materi: t.lingkup_materi,
             ...(t.cakupan_wajib ? { cakupan_wajib: t.cakupan_wajib } : {}) };
  });

  const jpTotal = sk.jumlahPertemuan * sk.jpPerPertemuan;
  const tpAnchor = {
    atp_induk_id: `m9-skenario-${sk.nomor}`,
    nomor_tp: 1,
    tp_judul: sk.tpJudul,
    tuntutan: sk.tuntutan,
    kategori_teks: sk.kategoriTeks,
    semester: 1,
    jp_alokasi: jpTotal,
    jp_pertemuan: Array(sk.jumlahPertemuan).fill(sk.jpPerPertemuan),
    versi_cp: '046/H/KR/2025',
  };

  const atpContext = {
    versi_cp: '046/H/KR/2025',
    semester: 1,
    kesiapan_murid: { nilai: sk.kesiapan, asal: 'keputusan_guru', arti: sk.kesiapanArti,
                      dasar: 'hasil penilaian sebelumnya' },
    jumlah_murid:     { nilai: sk.jumlahMurid, asal: 'fakta' },
    program_keahlian: { nilai: sk.programKeahlian, asal: 'fakta' },
    konteks_tugas:    { nilai: sk.konteksTugas, asal: 'keputusan_guru', arti: sk.konteksTugasArti },
    prioritas_guru:   sk.prioritas,
    penerapan_prioritas: {
      untuk_tp_ini: sk.prioritasUntukTpIni.map(k => ({
        prioritas: k, kunci: k, tp: [1], pengaruh: ['kegiatan'],
        alasan: 'ATP menyatakan penekanan ini berlaku untuk TP ini.',
      })),
      seluruh_atp: sk.prioritas.map(p => ({
        prioritas: p.kunci, kunci: p.kunci, tp: [1], pengaruh: ['kegiatan'],
        alasan: 'Penekanan guru pada ATP.',
      })),
    },
  };

  const alokasi = { pertemuan: Array(sk.jumlahPertemuan).fill(sk.jpPerPertemuan) };

  const warisan = {
    tpAnchor, tuntutan: tuntutanTerurai,
    // deno-lint-ignore no-explicit-any
    kategoriWajib: (kontrak as any).kategoriWajibDariTuntutan?.(tuntutanTerurai) ?? sk.kategoriTeks,
    alokasi, atpContext,
  };

  // `collected_data` — bentuk yang klien simpan, dengan kunci yang benar-benar
  // dibaca `konteksModulManusiawi()` dan kawan-kawan.
  const cd: Record<string, unknown> = {
    KONTEKS_MODUL: {
      jumlah_murid: { value: sk.jumlahMurid },
      kondisi_kelas: { value: 'diferensiasi' },
    },
    SUMBER_STRATEGI: {
      strategi_pembelajaran: { value: 'kolaboratif' },
      bahan_guru: { value: ['tidak_ada'] },
    },
    ASESMEN_MODUL: {
      gunakan_diagnostik: { value: 'lewati' },
      teknik_formatif:    { value: 'rekomendasi' },
      gunakan_sumatif:    { value: 'ya' },
      teknik_sumatif:     { value: 'unjuk_kerja' },
    },
  };

  // `collected_data` ATP — HANYA bagian yang generate-modul baca darinya:
  // arahanTitikAwal(atp.collected_data) → PROFIL_SISWA.tingkat_kemampuan_awal
  // (A4). Sebelum koreksi M9/D2 harness memanggil arahanTitikAwal dengan `cd`
  // MODUL, yang tidak pernah punya PROFIL_SISWA — sehingga Fase B lokal selalu
  // menerima `pembagian_waktu_menurut_titik_awal: null`, sedangkan produksi
  // menerima arahan kesiapan guru.
  const atpCd = { PROFIL_SISWA: { tingkat_kemampuan_awal: { value: sk.kesiapan } } };

  return { tpAnchor, atpContext, alokasi, warisan, cd, tuntutanTerurai, atpCd };
}

// ── Menjalankan kelima fase ─────────────────────────────────────────────────

export async function jalankanSkenario(sk: Skenario, attempt: number) {
  // deno-lint-ignore no-explicit-any
  const M: any = await muatEF();
  const masukan = await susunMasukan(sk);
  const { warisan, cd, tpAnchor, atpContext, alokasi } = masukan;

  const jumlahPertemuan = sk.jumlahPertemuan;
  const jpPerPertemuan  = sk.jpPerPertemuan;
  const durasiJp        = 45;
  const jumlahMurid     = sk.jumlahMurid;
  const nomorTp         = 1;

  const identitasDB = {
    mapel: 'Bahasa Inggris', jenjang: 'SMK', fase: 'E',
    program_keahlian: sk.programKeahlian, nama_guru: 'Guru MiClass',
    tahun_ajaran: '2026/2027', semester: '1',
  };
  const elemenCp = [{
    id: 'membaca_memirsa', label: 'Membaca - Memirsa',
    cp_text: 'Peserta didik memahami alur informasi keseluruhan dan menganalisis serta menyimpulkan informasi tersurat dan tersirat pada berbagai jenis teks fiksi dan nonfiksi.',
  }];

  const pref = M.resolvePreferensiFormatif((cd.ASESMEN_MODUL as Record<string, unknown>));
  const pilanAsesmen = ['formatif', 'sumatif'];

  const catatan: Record<string, unknown> = {
    skenario: sk.nomor, nama: sk.nama, attempt, model: MODEL,
    waktu: new Date().toISOString(),
  };

  // ── FASE A ────────────────────────────────────────────────────────────────
  const msgA = M.buildUserMessageFaseA({
    identitasDB, jumlahMurid, nomorTp, tpJudul: sk.tpJudul, jumlahPertemuan,
    jpPerPertemuan, durasiJp, elemenCp, warisan, cd, pilanAsesmen,
    gunakanDiagnostik: false, teknikDiagnostik: null, instrumenDiagnostik: null,
    teknikFormatif: pref.teknik, instrumenFormatif: null,
    gunakanSumatif: true, teknikSumatif: 'unjuk kerja — murid menunjukkan kemampuan secara langsung',
    instrumenSumatif: null,
  });
  const faseA = await panggilFase(M, msgA,
    M.anggaranTokenFaseA(M.perkiraanKktp(tpAnchor), elemenCp.length), 'Fase A', 120_000, 'A');

  // ── FASE B ────────────────────────────────────────────────────────────────
  const manifest = {
    pembelajaran_manifest: (faseA.manifest?.pembelajaran_manifest ?? []),
    asesmen_manifest:      (faseA.manifest?.asesmen_manifest ?? []),
  };
  // Persis produksi: arahanTitikAwal(atp.collected_data), satu argumen.
  const arahanWaktu = M.arahanTitikAwal(masukan.atpCd);
  const msgB = M.buildUserMessageFaseB({
    faseAOutput: faseA, manifest, jumlahPertemuan, jpPerPertemuan, durasiJp,
    jumlahMurid, cd, arahanTitikAwal: arahanWaktu, warisan,
  });
  const faseBRaw = await panggilFase(M, msgB, M.anggaranToken(jumlahPertemuan), 'Fase B', 120_000, 'B');
  const pertemuanWithRef = M.injectSubLangkahRef(faseBRaw.pertemuan ?? []);

  // ── FASE C ────────────────────────────────────────────────────────────────
  const jumlahInstrumen = manifest.pembelajaran_manifest.length + manifest.asesmen_manifest.length;
  const msgC = M.buildUserMessageFaseC({ faseAOutput: faseA, manifest, cd, warisan });
  const faseC = await panggilFase(M, msgC, M.anggaranTokenInstrumen(jumlahInstrumen), 'Fase C', 150_000, 'C');

  // ── FASE B2 (naskah) ──────────────────────────────────────────────────────
  const msgB2 = M.buildUserMessageFaseB2({
    faseAOutput: faseA, pertemuanWithRef,
    instrumenPembelajaran: faseC.instrumen_pembelajaran ?? [],
    instrumenAsesmen:      faseC.instrumen_asesmen ?? [],
    jumlahPertemuan, jumlahMurid,
  });
  const faseB2 = await panggilFase(M, msgB2, M.anggaranTokenNaskah(jumlahPertemuan), 'Fase B2 (naskah)', 180_000, 'B2');

  // ── FASE D ────────────────────────────────────────────────────────────────
  const msgD = M.buildUserMessageFaseD({ faseAOutput: faseA, cd });
  const faseD = await panggilFase(M, msgD,
    M.anggaranTokenFaseD((faseA.kktp ?? []).length || 3, jumlahPertemuan), 'Fase D', 150_000, 'D');

  // ── MERGE lewat otoritas perakitan produksi ───────────────────────────────
  // Harness DULU merakit `merged` sendiri dan kebetulan membawa
  // keputusan_kontekstual, sementara handler tidak — seluruh M9 hijau
  // sementara setiap Modul baru di produksi gagal di Fase D (smoke 11 Sep 2026).
  // Kini keduanya memanggil rakitModulFinal() yang sama; tidak ada daftar
  // field akar di berkas ini.
  const merged = rakitModulFinal({
    faseAOutput: faseA, faseBOutput: { pertemuan: pertemuanWithRef },
    faseCOutput: faseC, faseDOutput: faseD, naskahFinal: faseB2.naskah_fasilitasi,
    identitasDB, nomorTp, jumlahPertemuan, jpPerPertemuan, durasiJp, elemenCp,
    tpAnchor, tuntutanTerurai: masukan.tuntutanTerurai,
    kategoriWajib: warisan.kategoriWajib, atpContext, alokasiServer: alokasi,
  });

  const manifestFaseD = {
    pembelajaran_manifest: manifest.pembelajaran_manifest,
    asesmen_manifest:      manifest.asesmen_manifest,
  };
  // SELURUH bendera kontrak sekarang menyala — sama dengan jalur penyusunan.
  const validasi = M.validateModulOutputV400(
    merged, nomorTp, jumlahPertemuan, jpPerPertemuan, durasiJp, jumlahMurid,
    manifestFaseD, M.perangkatDigitalDiizinkan(cd), true, true, true, true, true);

  catatan.arahan_titik_awal = arahanWaktu;
  catatan.pemakaian_token = [...pemakaian];
  catatan.validasi = { valid: validasi.valid, jumlah_galat: validasi.errors.length, galat: validasi.errors };

  await Deno.mkdir(ARTEFAK, { recursive: true });
  const pre = `skenario-0${sk.nomor}-attempt${attempt}`;
  await Deno.writeTextFile(new URL(`${pre}-input.json`, ARTEFAK),
    JSON.stringify({ skenario: sk, tp_anchor: tpAnchor, atp_context: atpContext,
                     alokasi_server: alokasi, collected_data: cd, identitas: identitasDB }, null, 2));
  await Deno.writeTextFile(new URL(`${pre}-output.json`, ARTEFAK), JSON.stringify(merged, null, 2));
  await Deno.writeTextFile(new URL(`${pre}-meta.json`, ARTEFAK), JSON.stringify(catatan, null, 2));

  // STATE — segala yang dibutuhkan jalur perbaikan produksi, tidak lebih.
  //
  // `manifest` Fase A TIDAK ikut ke dokumen gabungan, padahal validasi ulang
  // sesudah perbaikan memakainya (M4.1). Tanpa menyimpannya di sini, menguji
  // perbaikan atas artefak lama berarti mengarang manifest — dan manifest
  // karangan membuat gerbang V7 lolos karena alasan yang salah.
  const state = {
    skenario: sk.nomor, attempt,
    faseAOutput: faseA, manifestFaseD, arahanWaktu, warisan, cd,
    jumlahPertemuan, jpPerPertemuan, durasiJp, jumlahMurid, nomorTp,
  };
  await Deno.writeTextFile(new URL(`${pre}-state.json`, ARTEFAK), JSON.stringify(state, null, 2));

  return { merged, validasi, catatan, state };
}



// ── STATE untuk artefak yang dibuat SEBELUM `-state.json` ada ───────────────
//
// Artefak D2 yang kanonik — Skenario 1 attempt 2 (§7 laporan M9) — dihasilkan
// sebelum harness ini menyimpan state, jadi `manifest` Fase A-nya tidak ada di
// berkas mana pun. Membuat ulang generate hanya untuk mendapatkannya berarti
// membuang artefak nyata yang justru sedang diuji.
//
// Yang dibangun ulang di sini BUKAN tebakan:
//
//   - `faseAOutput` — buildUserMessageFaseB hanya membaca identitas, kktp,
//     konteks_murid, rencana_asesmen, dan rancangan. Kelimanya tersimpan apa
//     adanya di dokumen gabungan;
//   - `manifest` — validator hanya membaca `id` dan `untuk_murid` tiap entri.
//     Validasi artefak ini NOL galat V7, dan V7 justru menuntut himpunan id
//     instrumen sama persis dengan himpunan id manifest. Jadi menurunkan
//     manifest dari instrumen memberi nilai yang IDENTIK dengan manifest Fase A
//     aslinya pada setiap field yang dibaca — bukan mendekati, sama;
//   - `warisan`, `cd`, `arahanWaktu` — deterministik dari definisi skenario,
//     tanpa satu pun panggilan model.
//
// Jalur perbaikan produksi sendiri mengirim MANIFEST KOSONG ke Fase B, jadi
// rekonstruksi ini tidak menyentuh permintaan perbaikan sama sekali — ia hanya
// dipakai saat validasi ulang.
// deno-lint-ignore no-explicit-any
export async function stateDariArtefak(M: any, sk: Skenario, merged: any) {
  const masukan = await susunMasukan(sk);
  const turunkan = (arr: any[]) => (arr ?? []).map((i: any) => ({
    id: i.id, jenis: i.jenis, untuk_murid: i.untuk_murid,
  }));
  return {
    faseAOutput: {
      identitas: merged.identitas, kktp: merged.kktp,
      konteks_murid: merged.konteks_murid, rencana_asesmen: merged.rencana_asesmen,
      rancangan: merged.rancangan, materi_esensial: merged.materi_esensial,
      keputusan_kontekstual: merged.keputusan_kontekstual,
      metadata_pedagogis: merged.metadata_pedagogis,
    },
    manifestFaseD: {
      pembelajaran_manifest: turunkan(merged.instrumen_pembelajaran),
      asesmen_manifest:      turunkan(merged.instrumen_asesmen),
    },
    // Nilai PRODUKSI, bukan nilai yang dipakai saat artefak lama dibuat: artefak
    // sebelum koreksi M9/D2 menyusun Fase B dengan arahan null (lihat susunMasukan).
    arahanWaktu: M.arahanTitikAwal(masukan.atpCd),
    warisan: masukan.warisan, cd: masukan.cd,
    jumlahPertemuan: sk.jumlahPertemuan, jpPerPertemuan: sk.jpPerPertemuan,
    durasiJp: 45, jumlahMurid: sk.jumlahMurid, nomorTp: 1,
    direkonstruksi: true,
  };
}

// ── D2 — JALUR PERBAIKAN PRODUKSI, DIREPLIKASI PERSIS ───────────────────────
//
// Yang direplikasi berasal dari `generate-modul/index.ts` (blok setelah
// `if (!validation.valid)`), langkah demi langkah:
//
//   1. errorList  = validation.errors.join('; ')            — apa adanya
//   2. hasDurasiError = errors.some(e => e.includes('durasi'))
//   3. hasDurasiError → buildUserMessageFaseB(...) DENGAN MANIFEST KOSONG
//      (produksi memang mengirim manifest kosong di jalur ini) + daftar galat
//      + dua kalimat aritmetika durasi;
//      selain itu → JSON.stringify(merged) + daftar galat
//      + perintahPerbaikanStruktural()
//   4. anggaran = hasDurasiError ? anggaranToken(n) : anggaranTokenPerbaikan(n)
//   5. merge    = hasDurasiError ? hanya ganti `pertemuan` : ganti seluruh dokumen
//   6. validasi ulang dengan MANIFEST FASE A YANG SAMA dan SELURUH bendera
//
// Tidak ada satu pun penambalan manual atas keluaran model.

// deno-lint-ignore no-explicit-any
export async function perbaikiSepertiProduksi(M: any, merged: any, validasi: any, state: any,
                                              msSebelumnya = 0) {
  // Sisa permintaan dihitung seperti EF: Fase D sudah memakai `msSebelumnya`
  // dari permintaan yang sama sebelum perbaikan dimulai.
  const mulai = Date.now() - msSebelumnya;
  const sisa = () => M.BATAS_PERMINTAAN_MS - (Date.now() - mulai);
  const batasDipakai: number[] = [];
  const batas = (maxTokens: number) => {
    const b = M.batasWaktuPerbaikan(maxTokens, sisa());
    batasDipakai.push(b);
    return b;
  };
  const { faseAOutput, manifestFaseD, arahanWaktu, warisan, cd,
          jumlahPertemuan, jpPerPertemuan, durasiJp, jumlahMurid, nomorTp } = state;

  const errorList = validasi.errors.join('; ');

  // FUNGSI YANG SAMA dengan Edge Function — bukan salinan. Yang disuntikkan
  // hanya ketiga titik yang menyentuh dunia luar, dengan bentuk persis EF:
  //   panggilAI   → callAI([{user}], 50_000, maxTokens, 'perbaikan validasi')
  //   susunNaskah → callPhase('Fase B2 (naskah)', buildUserMessageFaseB2(...),
  //                           120_000, anggaranTokenNaskah(n))
  //   validasi    → validateModulOutputV400(..., manifestFaseD, perangkatDigitalDiizinkan(cd), true×5)
  // Beda satu-satunya: callPhase punya satu putaran perbaikan JSON bila keluaran
  // B2 tidak dapat di-parse; harness melempar galat di titik itu alih-alih
  // mencobanya ulang diam-diam.
  const r = await M.perbaikiModulSetelahValidasi({
    merged, errors: validasi.errors, faseAOutput, manifest: manifestFaseD,
    jumlahPertemuan, jpPerPertemuan, durasiJp, jumlahMurid, cd,
    arahanTitikAwal: arahanWaktu, warisan,
    panggilAI: (pesan: string, maxTokens: number) =>
      panggilModel(M.SYSTEM_PROMPT, pesan, maxTokens, 'perbaikan validasi', batas(maxTokens)),
    susunNaskah: async (pw: unknown[], ip: unknown[], ia: unknown[]) => {
      const out = await panggilFase(M,
        M.buildUserMessageFaseB2({
          faseAOutput, pertemuanWithRef: pw, instrumenPembelajaran: ip, instrumenAsesmen: ia,
          jumlahPertemuan, jumlahMurid,
        }),
        M.anggaranTokenNaskah(jumlahPertemuan), 'Fase B2 (naskah)',
        batas(M.anggaranTokenNaskah(jumlahPertemuan)), 'B2');
      return Array.isArray(out.naskah_fasilitasi) ? out.naskah_fasilitasi : [];
    },
    validasi: (dok: unknown) => M.validateModulOutputV400(
      dok, nomorTp, jumlahPertemuan, jpPerPertemuan, durasiJp, jumlahMurid,
      manifestFaseD, M.perangkatDigitalDiizinkan(cd), true, true, true, true, true),
  });

  return {
    hasDurasiError: r.jalur === 'pertemuan', jalur: r.jalur, errorList,
    anggaran: r.anggaran, repairMsg: r.permintaan, batasWaktuMs: batasDipakai,
    mergedFixed: r.mergedFixed, validasiSesudah: r.validation,
  };
}

export async function jalankanPerbaikan(prefix: string) {
  // deno-lint-ignore no-explicit-any
  const M: any = await muatEF();
  const baca = async (suf: string) =>
    JSON.parse(await Deno.readTextFile(new URL(`${prefix}-${suf}.json`, ARTEFAK)));
  const merged = await baca('output');
  const meta   = await baca('meta');
  let state;
  try {
    state = await baca('state');
  } catch {
    const sk = SKENARIO.find(x => x.nomor === meta.skenario);
    if (!sk) throw new Error(`skenario ${meta.skenario} tidak ada — state tidak dapat dibangun`);
    state = await stateDariArtefak(M, sk, merged);
    console.log('(state dibangun ulang dari artefak — lihat catatan stateDariArtefak)');
  }

  const validasiSebelum = { valid: false, errors: meta.validasi.galat as string[] };
  console.log(`
=== D2 — PERBAIKAN PRODUKSI atas ${prefix} ===`);
  console.log(`BEFORE: ${validasiSebelum.errors.length} galat`);
  for (const e of validasiSebelum.errors) console.log('  -', e);

  // Setiap percobaan disimpan dengan nomornya sendiri — TERMASUK yang gagal.
  // Percobaan yang gagal adalah bukti, bukan sampah.
  const nomor = Deno.args.includes('--repair-attempt')
    ? Deno.args[Deno.args.indexOf('--repair-attempt') + 1] : '1';
  const pre = `${prefix}-repair${nomor}`;
  const hasDurasiErrorAwal = validasiSebelum.errors.some((e: string) => e.includes('durasi'));
  let r;
  try {
    // Waktu Fase D dari meta generate — bagian permintaan yang sudah terpakai.
    const msFaseD = ((meta.pemakaian_token ?? []) as Pemakaian[]).find(p => p.fase === 'Fase D')?.ms ?? 0;
    r = await perbaikiSepertiProduksi(M, merged, validasiSebelum, state, msFaseD);
  } catch (e) {
    await Deno.writeTextFile(new URL(`${pre}-meta.json`, ARTEFAK), JSON.stringify({
      prefix, percobaan: nomor, model: MODEL, waktu: new Date().toISOString(),
      has_durasi_error: hasDurasiErrorAwal,
      anggaran_token: M.anggaranTokenPerbaikan(state.jumlahPertemuan),
      galat_sebelum: validasiSebelum.errors,
      galat_dikirim_ke_model: validasiSebelum.errors.join('; '),
      hasil: 'GAGAL_SEBELUM_VALIDASI', sebab: (e as Error).message,
      pemakaian_token: [...pemakaian],
    }, null, 2));
    throw e;
  }
  console.log(`
hasDurasiError = ${r.hasDurasiError}  → jalur ${r.hasDurasiError ? 'GANTI PERTEMUAN (buildUserMessageFaseB)' : 'SUSUN ULANG DOKUMEN'}`);
  console.log(`anggaran token = ${r.anggaran}, panjang permintaan = ${r.repairMsg.length} karakter`);
  console.log(`
AFTER: ${r.validasiSesudah.valid ? 'LOLOS — 0 galat' : `DITOLAK (${r.validasiSesudah.errors.length} galat)`}`);
  for (const e of r.validasiSesudah.errors) console.log('  -', e);

  await Deno.writeTextFile(new URL(`${pre}-output.json`, ARTEFAK),
    JSON.stringify(r.mergedFixed, null, 2));
  // Bagian-bagian lifecycle disimpan terpisah supaya peninjau dapat melihat
  // keluaran Fase B perbaikan dan naskah B2 baru tanpa membedah dokumen gabungan.
  await Deno.writeTextFile(new URL(`${pre}-request.txt`, ARTEFAK), r.repairMsg);
  if (r.jalur === 'pertemuan') {
    await Deno.writeTextFile(new URL(`${pre}-faseB-pertemuan.json`, ARTEFAK),
      JSON.stringify(r.mergedFixed.pertemuan, null, 2));
    await Deno.writeTextFile(new URL(`${pre}-b2-naskah.json`, ARTEFAK),
      JSON.stringify(r.mergedFixed.naskah_fasilitasi, null, 2));
  }
  await Deno.writeTextFile(new URL(`${pre}-meta.json`, ARTEFAK), JSON.stringify({
    prefix, percobaan: nomor, model: MODEL, waktu: new Date().toISOString(),
    hasil: r.validasiSesudah.valid ? 'LOLOS' : 'DITOLAK',
    batas_waktu_ms: r.batasWaktuMs,
    has_durasi_error: r.hasDurasiError, anggaran_token: r.anggaran,
    galat_sebelum: validasiSebelum.errors,
    galat_dikirim_ke_model: r.errorList,
    panjang_permintaan: r.repairMsg.length,
    galat_sesudah: r.validasiSesudah.errors,
    valid_sesudah: r.validasiSesudah.valid,
    pemakaian_token: [...pemakaian],
  }, null, 2));

  return r;
}

// ── CLI ─────────────────────────────────────────────────────────────────────

if (import.meta.main) {
  const rep = Deno.args.indexOf('--repair');
  if (rep >= 0) {
    try {
      const r = await jalankanPerbaikan(Deno.args[rep + 1]);
      Deno.exit(r.validasiSesudah.valid ? 0 : 3);
    } catch (e) { console.error(`
GAGAL:`, (e as Error).message); Deno.exit(2); }
  }

  const arg = Deno.args.indexOf('--skenario');
  const nomor = arg >= 0 ? Number(Deno.args[arg + 1]) : 1;
  const att = Deno.args.indexOf('--attempt');
  const attempt = att >= 0 ? Number(Deno.args[att + 1]) : 1;
  const sk = SKENARIO.find(s => s.nomor === nomor);
  if (!sk) { console.error('skenario tidak ada:', nomor); Deno.exit(1); }

  console.log(`\n=== Skenario ${sk.nomor}: ${sk.nama} (attempt ${attempt}) ===`);
  console.log(`kesiapan=${sk.kesiapan} konteks_tugas=${sk.konteksTugas} prioritas=${sk.prioritasUntukTpIni.join(',')}`);
  try {
    const { validasi, catatan } = await jalankanSkenario(sk, attempt);
    console.log('\nVALIDASI KONTRAK SEKARANG:', validasi.valid ? 'LOLOS' : `DITOLAK (${validasi.errors.length} galat)`);
    for (const e of validasi.errors.slice(0, 12)) console.log('  -', e);
    console.log('\nPemakaian token per fase:');
    for (const p of catatan.pemakaian_token as Pemakaian[])
      console.log(`  ${p.fase.padEnd(9)} masuk=${p.masuk} keluar=${p.keluar} penalaran=${p.penalaran} total=${p.total} ${p.ms}ms`);
  } catch (e) {
    console.error('\nGAGAL:', (e as Error).message);
    Deno.exit(2);
  }
}
