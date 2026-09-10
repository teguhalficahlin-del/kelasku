# ATP FINALIZATION — CHANGE EVIDENCE

Paket bukti perubahan untuk **Pass 1 (ATP Finalization)** dan **Pass 2 (Acceptance
Correction)**. Tidak ada yang di-deploy, tidak ada yang di-commit, tidak ada yang
di-push; seluruhnya masih berada di working tree di atas `e3323b5`.

Dokumen ini menyebut BEFORE dan AFTER **verbatim**. Untuk perubahan yang berupa
penulisan ulang seluruh berkas, potongan yang dikutip adalah bagian yang
menentukan; **diff mentah lengkapnya**, tanpa satu baris pun diringkas, ada di:

> `docs/ATP-FINALIZATION-CHANGE-EVIDENCE.diff` (3.018 baris, `git diff HEAD`)

Nomor baris AFTER mengacu pada working tree per 10 September 2026.

---

## Daftar isi

| # | Kelompok | Berkas utama |
|---|---|---|
| 1 | Flow pertanyaan | `guru/js/rancang-chat-flow.js`, `kontrak.ts` (`KONTRAK_PERTANYAAN`) |
| 2 | Normalized context | `kontrak.ts` (`bangunKonteksAtp`) |
| 3 | `hitungAlokasi` | `kontrak.ts` |
| 4 | `hitungTargetTp` | `kontrak.ts` |
| 5 | Delegation | `kontrak.ts`, `index.ts` |
| 6 | ATP output contract | `kontrak.ts` (`AtpHasil`, `pisahkanKeluaran`), `index.ts` |
| 7 | CP acuan + gate | `shared/data/cp-acuan.json`, `acuan-cp.ts`, `kontrak.ts` |
| 8 | Validator | `kontrak.ts` (`validasiAtp`, `periksaKeputusan`) |
| 9 | Edge Function generation flow | `supabase/functions/generate-atp/index.ts` |
| 10 | Renderer review | `guru/js/rancang-chat.js` |
| 11 | DOCX renderer | `guru/js/classroom-unduh.js` |
| 12 | Tests | `tests/atp-kontrak.test.ts`, `tests/atp-acuan-sinkron.mjs`, `tests/atp-trace.mjs` |

---

## 1. FLOW PERTANYAAN

### 1.1 Alur ATP diganti ke 21 definisi SPEC (Pass 1)

**Requirement / Decision** — `docs/SPEC-ATP-MODUL-BERBASIS-TEKS.md`: 21 definisi
pertanyaan (A1–A20 + A15a) menggantikan 48 pertanyaan lama.

**Exact file path** — `guru/js/rancang-chat-flow.js`
**Function / constant** — definisi fase corong ATP
**Line range AFTER** — seluruh berkas (668 baris berubah)

**BEFORE — VERBATIM** — lihat `ATP-FINALIZATION-CHANGE-EVIDENCE.diff`, blok
`--- a/guru/js/rancang-chat-flow.js`.

**AFTER — VERBATIM** — blok yang sama, sisi `+`.

**Why** — pertanyaan yang jawabannya tidak dibaca kode mana pun adalah pertanyaan
yang berbohong kepada guru; empat sudah ditemukan sebelumnya (CLAUDE.md,
"pertanyaan bisa berbohong").

**Test/evidence** — `tests/atp-kontrak.test.ts`:
`KONTRAK: setiap pertanyaan ATP aktif punya entri kontrak, dan sebaliknya`,
`KONTRAK: 21 definisi SPEC A1–A20 + A15a, tidak kurang tidak lebih`.

### 1.2 `KONTRAK_PERTANYAAN` — pertanyaan → data → keputusan (Pass 1)

**Exact file path** — `supabase/functions/generate-atp/kontrak.ts`
**Function / constant** — `KONTRAK_PERTANYAAN`
**Line range AFTER** — 122–284

**BEFORE — VERBATIM** — `NEW — did not exist`

**AFTER — VERBATIM** (kepala entri; daftar penuh 21 entri ada di berkasnya):

```ts
export type EntriKontrak = {
  spec: string;         // A1..A20, A15a
  fase: string;         // fase corong tempat ia ditanyakan
  simpan: string;       // lokasi tersimpan
  jenis: 'A' | 'B' | 'C';
  dipakai: string;      // siapa yang membacanya
  keputusan: string;    // keputusan ATP apa yang dipengaruhinya
};
```

**Why** — hubungan jawaban → keputusan sebelumnya tidak punya tempat tinggal dan
karena itu tidak pernah bisa diperiksa.

**Test/evidence** — `node tests/atp-trace.mjs --periksa` (dokumen jejak
dibangkitkan dari objek yang sama yang dipakai Edge Function).

---

## 2. NORMALIZED CONTEXT

### 2.1 Konteks berbahasa manusia menggantikan gumpalan `collected_data` (Pass 1)

**Exact file path** — `supabase/functions/generate-atp/kontrak.ts`
**Function** — `bangunKonteksAtp()`
**Line range AFTER** — 932–1093

**BEFORE — VERBATIM** (`supabase/functions/generate-atp/index.ts` @ `e3323b5`, baris 560–592):

```ts
  const userMessage = JSON.stringify({
    mapel:      atp.mapel,
    fase:       atp.fase,
    jenjang:    atp.jenjang,
    program_keahlian: programKeahlian || '',
    target_fase: atp.target_fase || '',
    elemen_cp:  elemenCp.map(e => ({ id: e.id, label: e.label, cp_text: e.cp_text })),
    jp_operasional:     jpOp,
    jp_per_pertemuan:   jpPerPertemuan || null,
    pola_jadwal:        polajadwal,
    target_fase_detail: targetFase,
    prioritas,
    profil_siswa:       profilSiswa,
    konteks_dudi:       konteksDudi,
    penguatan_prasyarat: prasyarat,
    metode_pengurutan: metodePengurutan,
    perlengkapan_tersedia: perlengkapanDiketahui ? perlengkapanTersedia : null,
```

**AFTER — VERBATIM** (`index.ts` baris 478–507):

```ts
  const userMessage = JSON.stringify({
    cp_anchor:               konteks.cp_anchor,
    kesiapan_murid:          konteks.kesiapan_murid,
    prioritas_guru:          konteks.prioritas_guru,
    konteks_kejuruan:        konteks.konteks_kejuruan,
    anggaran_waktu:          konteks.anggaran_waktu,
    keputusan_didelegasikan: konteks.keputusan_didelegasikan,
    keputusan_terbuka:       konteks.keputusan_terbuka,
    batas_mutlak:            konteks.batas_mutlak,
```

**Why** — kunci mesin seperti `pasif_sangat_heterogen_rekomendasi` tidak bermakna
apa pun bagi model; ia hanya terlihat seperti data. Pelajaran yang sudah dibayar
di `generate-modul` (CLAUDE.md, sesi 5 September).

**Test/evidence** — `BAHASA: tidak ada kunci mesin yang lolos ke prompt`.

### 2.2 Bagian yang terbuka tidak lagi diperintahkan (Pass 2)

**Exact file path** — `supabase/functions/generate-atp/kontrak.ts`
**Function** — `bangunKonteksAtp()` — blok `prioritas_guru` dan `konteks_kejuruan`
**Line range AFTER** — 1002–1010 dan 1021–1026

**BEFORE — VERBATIM**:

```ts
  prioritas.push(METODE_PENGURUTAN[delegasi.metode_pengurutan] ?? METODE_PENGURUTAN.scaffolding);
```

```ts
  kejuruan.push(LABEL_KONTEKS_TUGAS[delegasi.konteks_tugas] ?? LABEL_KONTEKS_TUGAS.seimbang);
```

**AFTER — VERBATIM**:

```ts
  // Urutan pembelajaran hanya dinyatakan di sini kalau ia SUDAH diputuskan.
  // Kalau guru mendelegasikannya, ia tidak boleh muncul sebagai perintah —
  // penyusun yang memilihnya, dari bagian keputusan_terbuka.
  if (delegasi.metode_pengurutan && METODE_PENGURUTAN[delegasi.metode_pengurutan]) {
    prioritas.push(METODE_PENGURUTAN[delegasi.metode_pengurutan]);
  } else {
    prioritas.push('Urutan pembelajaran BELUM ditetapkan — lihat keputusan_terbuka. Pilih metodenya dari struktur tuntutan CP lebih dulu, baru dari kesiapan murid.');
  }
```

```ts
  if (delegasi.konteks_tugas && LABEL_KONTEKS_TUGAS[delegasi.konteks_tugas]) {
    kejuruan.push(LABEL_KONTEKS_TUGAS[delegasi.konteks_tugas]);
  } else {
    kejuruan.push('Porsi konteks contoh dan tugas BELUM ditetapkan — lihat keputusan_terbuka. Timbang tiap tuntutan CP: sebagian hanya punya situasi nyata di dunia kerja, sebagian lagi hanya di kehidupan sehari-hari.');
  }
```

**Why** — `?? METODE_PENGURUTAN.scaffolding` adalah tetapan yang menyamar jadi
keputusan: penyusun menerima perintah lalu diminta "memutuskan" hal yang sudah
diperintahkan.

**Test/evidence** — `CASE H` butir (4): konteks wajib memuat "belum ditetapkan".

### 2.3 `Konteks.keputusan_terbuka` (Pass 2)

**Exact file path** — `kontrak.ts`
**Type** — `Konteks`
**Line range AFTER** — 100–110

**BEFORE — VERBATIM**:

```ts
  anggaran_waktu: string[];
  keputusan_didelegasikan: string[];
  batas_mutlak: string[];
};
```

**AFTER — VERBATIM**:

```ts
  anggaran_waktu: string[];
  keputusan_didelegasikan: string[];
  /** Pertanyaan yang guru delegasikan DAN yang penyusun harus jawab sendiri.
   *  Kosong berarti seluruh keputusan sudah diambil sebelum penyusunan. */
  keputusan_terbuka: {
    question_id: string;
    pertanyaan: string;
    opsi: { kunci: string; arti: string }[];
    pertimbangkan: string[];
    dasar_yang_boleh_disebut: string[];
  }[];
  batas_mutlak: string[];
};
```

**Why** — allowlist enum, hal yang wajib ditimbang, dan daftar dasar yang sah
harus sampai ke penyusun sebagai data, bukan sebagai prosa yang bisa ia tafsirkan
bebas.

**Test/evidence** — `CASE H` butir (3), `CASE K` butir (1)–(3), `CASE L` butir (4).

---

## 3. `hitungAlokasi`

### 3.1 Satu satuan untuk satu hal (Pass 1)

**Exact file path** — `kontrak.ts`
**Function** — `hitungAlokasi()`
**Line range AFTER** — 426–479

**BEFORE — VERBATIM** — perhitungan waktu tersebar di `index.ts` @ `e3323b5`;
lihat diff blok `--- a/supabase/functions/generate-atp/index.ts`.

**AFTER — VERBATIM** (bagian yang menentukan):

```ts
  const mentah   = Math.max(0, kalender - cadangan - prasyarat);
  const sisaBagi = satuan > 0 ? mentah % satuan : 0;
  const operasional = mentah - sisaBagi;
```

**Why** — kegiatan khusus dulu ditanyakan dalam JP sementara cadangan dalam
minggu; SELURUH kelas masalah "ATP mustahil dipenuhi" lahir dari perbedaan satuan
itu.

**Test/evidence** — `ARITMETIKA: syarat yang mustahil dipenuhi tidak pernah dibuat`;
`KONTRAK: rumus waktu klien dan Edge Function memberi angka yang sama` (menjalankan
kode kirim klien apa adanya).

**Pass 2 — TIDAK DIUBAH.**

---

## 4. `hitungTargetTp`

### 4.1 Jumlah TP tidak lagi keputusan model (Pass 1)

**Exact file path** — `kontrak.ts`
**Function** — `hitungTargetTp()`

**BEFORE — VERBATIM** (`index.ts` @ `e3323b5`, baris 550–553):

```ts
  const maxTp = jpPerPertemuan > 0 ? Math.floor(jpOp / jpPerPertemuan) : 0;
  const targetTp = (typeof target_jumlah_tp === 'number' && Number.isFinite(target_jumlah_tp))
    ? Math.max(3, maxTp > 0 ? Math.min(Math.round(target_jumlah_tp), maxTp) : Math.round(target_jumlah_tp))
    : null;
```

**AFTER (Pass 1) — VERBATIM**:

```ts
export const PERTEMUAN_PER_TP: Record<string, number> = {
  sesuai:           2,
  sedikit_di_bawah: 2.5,
  belum_diketahui:  2.5,
  sangat_beragam:   3,
  jauh_di_bawah:    3,
};

export function hitungTargetTp(
  alokasi: Alokasi,
  kesiapan: string,
  jumlahTuntutan: number,
  permintaanGuru?: number | null,
): { target: number; asal: 'permintaan guru' | 'hitungan MiClass'; maks: number; min: number } {
  const maks = alokasi.jumlah_pertemuan > 0 ? Math.floor(alokasi.jumlah_pertemuan) : 0;
  // Lantai: tidak setiap tuntutan CP wajib punya TP sendiri, tapi ATP dengan TP
  // jauh lebih sedikit daripada tuntutannya hampir pasti menggabungkan yang
  // tidak sebanding. Tiga adalah lantai mutlak untuk satu fase penuh.
  const min = Math.max(3, Math.min(Math.ceil(jumlahTuntutan / 2), maks || 3));

  if (typeof permintaanGuru === 'number' && Number.isFinite(permintaanGuru)) {
    const t = Math.max(min, maks > 0 ? Math.min(Math.round(permintaanGuru), maks) : Math.round(permintaanGuru));
    return { target: t, asal: 'permintaan guru', maks, min };
  }
  const per = PERTEMUAN_PER_TP[kesiapan] ?? PERTEMUAN_PER_TP.belum_diketahui;
  const kasar = alokasi.jumlah_pertemuan > 0 ? alokasi.jumlah_pertemuan / per : min;
  const t = Math.max(min, maks > 0 ? Math.min(Math.round(kasar), maks) : Math.round(kasar));
  return { target: t, asal: 'hitungan MiClass', maks, min };
}
```

### 4.2 GATE C — dua cacat diperbaiki (Pass 2)

**Requirement / Decision** — Gate C: formula tidak boleh disebut deterministik
kalau ia heuristic, tidak boleh linear tanpa dasar, dan batas bawahnya harus
dipengaruhi struktur tuntutan CP.

**Exact file path** — `kontrak.ts`
**Function / constant** — `JP_PER_TP`, `MIN_PERTEMUAN_PER_TP`, `MAKS_TP_PER_FASE`,
`MIN_TP_PER_FASE`, `hitungTargetTp()`
**Line range AFTER** — 526–588

**AFTER — VERBATIM**:

```ts
/** Berapa JP yang dipakai satu TP, menurut kesiapan murid.
 *
 *  HEURISTIK. Angkanya menyatakan kelapangan, bukan hasil pengukuran — tetapi
 *  rentangnya dipilih agar memuat apa yang sudah ada: empat ATP produksi
 *  berkisar 8 sampai 17 JP per TP (128 JP/16 TP, 124 JP/10 TP, 200 JP/12 TP).
 *
 *  SATUANNYA JP, BUKAN PERTEMUAN, dan itu koreksi yang disengaja. Versi
 *  pertama menghitung dari jumlah pertemuan, sehingga kelas yang membagi 4 JP
 *  seminggu jadi dua pertemuan @2 JP dinilai punya dua kali lebih banyak
 *  "ruang" daripada kelas yang memakainya sekaligus — padahal jam mengajarnya
 *  sama persis. Panjang satu pertemuan adalah urusan jadwal sekolah, bukan
 *  ukuran seberapa besar satu tujuan pembelajaran. */
export const JP_PER_TP: Record<string, number> = {
  sesuai:           10,
  sedikit_di_bawah: 12,
  belum_diketahui:  12,
  sangat_beragam:   14,
  jauh_di_bawah:    14,
};

/** TP satu pertemuan bukan tujuan pembelajaran, melainkan rencana satu jam.
 *  Batas ini yang mencegah jam yang banyak berubah jadi TP yang remeh. */
export const MIN_PERTEMUAN_PER_TP = 2;

/** Batas beban kerja, bukan batas pedagogis. Lebih dari ini berarti guru
 *  diminta menyusun dan mengajarkan lebih dari enam belas Modul Ajar dalam satu
 *  fase. Batas inilah yang memutus kelinearan terhadap jam: jam yang bertambah
 *  sesudah titik ini menambah kelapangan tiap TP, bukan jumlah TP. */
export const MAKS_TP_PER_FASE = 16;

/** Lantai mutlak satu fase penuh. */
export const MIN_TP_PER_FASE = 3;

export function hitungTargetTp(
  alokasi: Alokasi,
  kesiapan: string,
  jumlahTuntutan: number,
  permintaanGuru?: number | null,
): { target: number; asal: 'permintaan guru' | 'hitungan MiClass'; maks: number; min: number } {
  const pertemuan = alokasi.jumlah_pertemuan > 0 ? Math.floor(alokasi.jumlah_pertemuan) : 0;

  const maks = pertemuan > 0
    ? Math.max(MIN_TP_PER_FASE,
        Math.min(Math.floor(pertemuan / MIN_PERTEMUAN_PER_TP), MAKS_TP_PER_FASE))
    : MAKS_TP_PER_FASE;

  // Batas bawah berpangkal pada STRUKTUR CP, bukan pada jam. Setengah dari
  // jumlah tuntutan, dibulatkan ke atas: tidak setiap tuntutan wajib punya TP
  // sendiri — dua tuntutan yang sejalan boleh dilayani satu TP — tetapi TP yang
  // memikul lebih dari dua tuntutan sekaligus sudah bukan satu tujuan.
  const minCp = jumlahTuntutan > 0 ? Math.ceil(jumlahTuntutan / 2) : MIN_TP_PER_FASE;
  const min = Math.min(Math.max(MIN_TP_PER_FASE, minCp), maks);

  const jepit = (n: number) => Math.max(min, Math.min(maks, n));

  if (typeof permintaanGuru === 'number' && Number.isFinite(permintaanGuru)) {
    return { target: jepit(Math.round(permintaanGuru)), asal: 'permintaan guru', maks, min };
  }
  const per   = JP_PER_TP[kesiapan] ?? JP_PER_TP.belum_diketahui;
  const kasar = alokasi.jp_operasional > 0 ? alokasi.jp_operasional / per : min;
  return { target: jepit(Math.round(kasar)), asal: 'hitungan MiClass', maks, min };
}
```

**Why** — dua cacat nyata di versi Pass 1:

1. **Batas atas = jumlah pertemuan.** Guru boleh meminta satu TP per pertemuan;
   fixture bawaan uji (140 JP, satuan 2) menerima **70 TP** untuk satu fase tanpa
   satu pun keberatan. Uji lama bahkan menegaskannya:
   `assertEquals(banyak.target, Math.floor(a.jumlah_pertemuan))` — dengan komentar
   yang justru menyebut permintaan seperti itu "mustahil dipenuhi".
2. **Kepadatan dihitung dari PERTEMUAN.** Dua kelas dengan jam mengajar sama
   persis dinilai berbeda hanya karena panjang pertemuannya berbeda.

**Test/evidence** — `CASE O: jumlah TP terbatas di kedua ujung dan tidak melompat
di batas` (butir 1–5), `KEPADATAN: model tidak bisa mengabaikan jumlah TP yang
ditetapkan`, `CASE B`. Matriks keputusan lengkap ada di laporan §F.

---

## 5. DELEGATION

### 5.1 Seluruh delegasi diselesaikan kode (Pass 1)

**Exact file path** — `kontrak.ts`
**Function** — `resolveDelegasi()`

**BEFORE — VERBATIM** — `NEW — did not exist` (keputusan hilang tanpa jejak;
model memilih diam-diam, guru tidak pernah tahu apa yang dipilih maupun atas dasar
apa).

**AFTER (Pass 1) — VERBATIM** (bagian A17 dan A19 yang kemudian ditolak reviewer):

```ts
  // A19 — urutan pembelajaran.
  let metode = teks(jawaban(cd, 'KONTEKS_DUDI', 'metode_pengurutan'));
  if (!METODE_PENGURUTAN[metode]) {
    const kosong = !metode;
    const pilih = (kesiapan === 'jauh_di_bawah' || kesiapan === 'sangat_beragam')
      ? 'hierarki' : 'scaffolding';
    metode = catat('Urutan pembelajaran', kosong, pilih,
      pilih === 'hierarki' ? 'Kemampuan dasar dulu, baru yang membutuhkannya'
                           : 'Bantuan berkurang menuju mandiri',
      ...
  }

  // A17 — konteks contoh dan tugas.
  let konteks = teks(jawaban(cd, 'KONTEKS_DUDI', 'konteks_tugas'));
  if (!LABEL_KONTEKS_TUGAS[konteks]) {
    const kosong = !konteks;
    konteks = catat('Konteks contoh dan tugas', kosong, 'seimbang',
      'Seimbang antara kehidupan sehari-hari dan situasi kerja',
      'Tanpa arahan guru, porsi seimbang menjaga konteks kejuruan tetap menjadi arena penerapan dan tidak menggeser kompetensi mata pelajaran.');
  }
```

### 5.2 GATE B — pemisahan deterministik / semantik (Pass 2)

**Requirement / Decision** — Gate B: keputusan yang menuntut pembacaan makna CP
tidak boleh direduksi jadi default tetap berdasarkan satu variabel; keputusan
semantik diambil di dalam panggilan penyusunan yang sudah ada, dengan enum
allowlist, alasan, dan dasar; server memvalidasi.

**Exact file path** — `kontrak.ts`
**Function / constant** — `PertanyaanSemantik`, `DELEGASI_SEMANTIK`,
`DASAR_KETERANGAN`, `dasarTersedia()`, `HasilDelegasi`, `resolveDelegasi()`,
`pisahkanKeluaran()`
**Line range AFTER** — 614–823

**AFTER — VERBATIM** (registri semantik dan pemisahannya):

```ts
export const DELEGASI_SEMANTIK: PertanyaanSemantik[] = [
  {
    question_id: 'A17',
    kunci: 'konteks_tugas',
    fase: 'KONTEKS_DUDI',
    pertanyaan: 'Konteks contoh dan tugas',
    opsi: LABEL_KONTEKS_TUGAS,
    pertimbangan: [
      'kompetensi dan lingkup materi tiap tuntutan di cp_anchor — sebagian tuntutan hanya punya situasi nyata di dunia kerja, sebagian lagi hanya di kehidupan sehari-hari',
      'program keahlian kelas ini: apakah bidang itu benar-benar memuat situasi yang menuntut kompetensi ini, atau kaitannya dipaksakan',
      'kesiapan murid: konteks kerja yang asing menambah beban baru bagi murid yang kemampuan dasarnya masih dibangun',
      'situasi khusus yang guru minta diutamakan atau dihindari, bila ada',
      'batas layanan teks dan interaksi langsung: situasi kerja yang hanya dapat dihadirkan lewat alat, kunjungan, atau benda praktik tidak boleh dipilih',
    ],
  },
  {
    question_id: 'A19',
    kunci: 'metode_pengurutan',
    fase: 'KONTEKS_DUDI',
    pertanyaan: 'Urutan pembelajaran',
    opsi: METODE_PENGURUTAN,
    pertimbangan: [
      'STRUKTUR tuntutan CP lebih dulu: apakah tuntutannya membentuk satu prosedur yang berurutan, berjenjang sebagai prasyarat, atau berdiri sejajar tanpa urutan wajib',
      'hubungan prasyarat antar kemampuan: kemampuan yang menjadi syarat kemampuan lain harus lebih dulu, berapa pun kesiapan murid',
      'kesiapan murid: menentukan seberapa landai tangganya, BUKAN menggantikan struktur CP. CP yang berupa prosedur berurutan tetap disusun berurutan meskipun murid sudah siap',
      'jam yang tersedia dan pembagian semester: urutan yang menuntut satu prosedur utuh tidak boleh terbelah tanggung di batas semester',
      'batas layanan teks dan interaksi langsung',
    ],
  },
];
```

```ts
  // ── SEMANTIK — A17 dan A19 ────────────────────────────────────────────────
  const nilaiSemantik: Record<string, string | null> = {};
  for (const q of DELEGASI_SEMANTIK) {
    const v = teks(jawaban(cd, q.fase, q.kunci));
    if (q.opsi[v]) { nilaiSemantik[q.kunci] = v; continue; }
    nilaiSemantik[q.kunci] = null;
    terbuka.push(q);
  }
```

**AFTER — VERBATIM** (dasar yang tidak bisa dikarang):

```ts
export function dasarTersedia(
  cd: Record<string, unknown>,
  info: { program_keahlian: string; jumlah_murid: number | null },
  tuntutanIds: string[],
): Set<string> {
  const out = new Set<string>([
    'cp_anchor.elemen', 'kesiapan_murid', 'prioritas_guru',
    'anggaran_waktu', 'batas_mutlak',
  ]);
  if (tuntutanIds.length) {
    out.add('cp_anchor.tuntutan');
    for (const id of tuntutanIds) out.add('cp_anchor.tuntutan.' + id);
  }
  if (info.program_keahlian) out.add('konteks_kejuruan');
  if (info.jumlah_murid) out.add('jumlah_murid');
  if (teks(jawaban(cd, 'KONTEKS_DUDI', 'situasi_khusus_uraian'))) out.add('situasi_khusus');
  return out;
}
```

**Why** — `'seimbang'` sebagai jawaban tunggal untuk semua kondisi bukan keputusan
kontekstual; A19 yang memilih hanya dari kesiapan murid membuat CP yang berupa
prosedur berurutan tetap disusun sebagai bantuan yang berkurang.

**Test/evidence** — `CASE H`, `CASE K`, `CASE L`, `CASE M`.

### 5.3 Provenance keputusan (Pass 2)

**Exact file path** — `kontrak.ts`
**Type** — `KeputusanMiClass`
**Line range AFTER** — 47–71

**BEFORE — VERBATIM**:

```ts
export type KeputusanMiClass = {
  pertanyaan: string;
  didelegasikan_karena: 'guru memilih tentukan saat menyusun' | 'guru belum menjawab';
  dipilih: string;
  alasan: string;
};
```

**AFTER — VERBATIM**:

```ts
export type KeputusanMiClass = {
  pertanyaan: string;
  didelegasikan_karena: 'guru memilih tentukan saat menyusun' | 'guru belum menjawab';
  dipilih: string;
  alasan: string;
  /** Bagaimana keputusan itu diambil.
   *  'aturan'     — deterministik di kode; aturannya dapat ditulis penuh dan
   *                 tidak menuntut pembacaan makna CP.
   *  'penyusunan' — diputuskan penyusun ATP di dalam panggilan yang sudah ada,
   *                 lalu divalidasi server terhadap allowlist dan terhadap
   *                 konteks yang benar-benar tersedia. */
  sumber?: 'aturan' | 'penyusunan';
  /** Hanya untuk sumber 'penyusunan'. Rujukan konteks yang menjadi dasarnya —
   *  bukan kalimat bebas, melainkan kunci dari daftar yang server izinkan.
   *  Klaim di luar daftar itu tidak pernah tersimpan sebagai fakta. */
  dasar?: string[];
  /** Hanya untuk sumber 'penyusunan'. Kunci enum yang dipilih, sebelum
   *  diterjemahkan jadi label manusia di `dipilih`. */
  kunci?: string;
};
```

**Why** — guru harus dapat membedakan keputusan yang lahir dari aturan tetap dari
keputusan yang lahir dari pembacaan konteksnya sendiri.

**Test/evidence** — `CASE H` butir (1) (`sumber === 'aturan'`), `CASE L` butir (5)
(`sumber === 'penyusunan'`).

---

## 6. ATP OUTPUT CONTRACT

### 6.1 Amplop `ATP_HASIL` / `atp-1.0.0` (Pass 1)

**Exact file path** — `kontrak.ts`
**Type** — `AtpHasil`; **konstan** — `SKEMA_ATP`
**Line range AFTER** — 23, 74–113

**BEFORE — VERBATIM** — `NEW — did not exist` (yang tersimpan hanya
`progresi_tp`).

**AFTER — VERBATIM** (bagian yang menentukan):

```ts
export const SKEMA_ATP = 'atp-1.0.0';
```

```ts
  dasar_penyusunan: {
    dasar_profil_murid: string;
    konteks_dari_guru: string[];
    keputusan_miclass: KeputusanMiClass[];
    asumsi: Asumsi[];
  };
  cakupan_cp: {
    diperiksa: boolean;
    tuntutan_wajib: string[];
    tuntutan_tercakup: string[];
    tuntutan_belum: string[];
  };
```

**Why** — SPEC §2.1: ATP wajib menyatakan atas dasar apa ia disusun dan menandai
bagian yang berstatus asumsi. Disimpan di `collected_data.ATP_HASIL`, jadi tidak
menuntut satu pun migration.

### 6.2 Keluaran boleh berupa amplop, array telanjang tetap sah (Pass 2)

**Exact file path** — `kontrak.ts`
**Function** — `pisahkanKeluaran()`
**Line range AFTER** — 802–820

**BEFORE — VERBATIM**:

```ts
  if (!Array.isArray(raw) || raw.length === 0) {
    return { valid: false, errors: ['[S1] Respons bukan array TP atau kosong'], entries: [] };
  }
  const entries = raw as TpEntry[];
```

**AFTER — VERBATIM**:

```ts
export function pisahkanKeluaran(raw: unknown): { tp: unknown; keputusan: unknown[] } {
  if (Array.isArray(raw)) return { tp: raw, keputusan: [] };
  if (raw && typeof raw === 'object') {
    const o = raw as Record<string, unknown>;
    const tp = Array.isArray(o.tp) ? o.tp
      : Array.isArray(o.progresi_tp) ? o.progresi_tp
      : Array.isArray(o.atp) ? o.atp : raw;
    const k = o.keputusan_didelegasikan;
    return { tp, keputusan: Array.isArray(k) ? k : [] };
  }
  return { tp: raw, keputusan: [] };
}
```

**Why** — backward-compatible: seluruh ATP yang sudah ada, dan setiap generate di
mana guru menjawab sendiri A17 dan A19, tetap berupa array telanjang.

**Test/evidence** — `CASE H: keluaran lama berupa array telanjang tetap diterima`.

### 6.3 `catatan_mutu` (Pass 2 — Gate D)

**Exact file path** — `kontrak.ts` (type), `index.ts` (pengisian)
**Line range AFTER** — `kontrak.ts` 68–73; `index.ts` 774

**BEFORE — VERBATIM** — `NEW — did not exist`

**AFTER — VERBATIM**:

```ts
  /** Catatan mutu internal — TIDAK ditampilkan kepada guru. Isinya hal yang
   *  lolos gerbang tetapi berada di pita toleransi (mis. judul TP 13-16 kata).
   *  Guru tidak bisa berbuat apa-apa dengannya; yang membacanya adalah kita,
   *  saat menilai apakah pita toleransinya masih pada tempatnya. */
  catatan_mutu?: string[];
```

```ts
    ...(validation.peringatan.length ? { catatan_mutu: validation.peringatan } : {}),
```

---

## 7. CP ACUAN + GATE

### 7.1 Acuan CP berversi dan gerbangnya (Pass 1)

**Exact file path** — `shared/data/cp-acuan.json`, `supabase/functions/generate-atp/acuan-cp.ts`
**Function** — `acuanUntuk()`, `tuntutanWajib()` (`kontrak.ts` 704–719)

**BEFORE — VERBATIM** — `NEW — did not exist`

**Why** — gerbang layanan (kombinasi mapel/fase yang boleh dibuka) DAN sumber
pemeriksaan cakupan, dari satu sumber. Berdiri **sebelum** rate limit dan sebelum
panggilan AI, sehingga kombinasi yang belum dilayani tidak memakan jatah guru.

**Test/evidence** — `CASE I: kombinasi tanpa acuan CP ditutup sebelum generate`,
`CASE I: gerbang acuan CP berdiri sebelum rate limit di Edge Function`,
`node tests/atp-acuan-sinkron.mjs`.

### 7.2 GATE A — tujuh tuntutan ditulis ulang (Pass 2)

**Requirement / Decision** — Gate A §2.1–2.3: setiap tuntutan wajib menyebut
potongan CP normatif verbatim, dan cakupannya wajib dibuktikan dua arah.

**Exact file path** — `shared/data/cp-acuan.json` (dan salinan bangkitan
`supabase/functions/generate-atp/acuan-cp.ts`)

Uraian semantik lengkap per tuntutan ada di laporan §B dan §C. Di bawah ini
BEFORE/AFTER verbatim untuk **lima tuntutan yang berubah**; BIE-MM-1 hanya
bertambah klausa tujuan.

**BEFORE — VERBATIM**:

```json
{ "id": "BIE-MB-1", "kompetensi": "berkomunikasi lisan dengan guru, teman sebaya, dan orang lain dalam berbagai situasi", "lingkup_materi": "percakapan situasional, sapaan, permintaan, dan tanggapan", "layak_teks": true },
{ "id": "BIE-MB-2", "kompetensi": "memahami alur informasi, gagasan utama, dan detail dalam teks lisan fiksi dan non-fiksi", "lingkup_materi": "naskah simakan yang dibacakan guru mengenai topik sehari-hari atau isu terkini", "layak_teks": true, "catatan_layanan": "Sumber bunyi adalah guru yang membacakan naskah. MiClass menyediakan naskahnya; tidak ada rekaman audio." },
{ "id": "BIE-MB-3", "kompetensi": "mengungkapkan pendapat dan mempertahankan argumen tentang topik yang dibahas", "lingkup_materi": "diskusi terpandu dan bermain peran tanpa properti", "layak_teks": true }
```

```json
{ "id": "BIE-MM-1", "kompetensi": "membaca dan merespons berbagai jenis teks", "lingkup_materi": "narasi, deskripsi, prosedur, eksposisi, recount, dan report", "layak_teks": true },
{ "id": "BIE-MM-2", "kompetensi": "menganalisis dan menginterpretasi informasi eksplisit dan implisit", "lingkup_materi": "teks tulis fiksi dan non-fiksi, termasuk teks bertata-letak seperti formulir, tabel, dan daftar", "layak_teks": true, "catatan_layanan": "Tuntutan multimodal dilayani melalui teks bertata-letak yang dapat dicetak, bukan melalui gambar, foto, atau video." }
```

```json
{ "id": "BIE-MP-1", "kompetensi": "menulis berbagai jenis teks fiksi dan non-fiksi melalui aktivitas terpandu", "lingkup_materi": "kerangka, draf, dan revisi teks", "layak_teks": true },
{ "id": "BIE-MP-2", "kompetensi": "menyajikan gagasan dengan struktur dan unsur kebahasaan yang sesuai tujuan dan konteks komunikatif", "lingkup_materi": "penyampaian lisan tanpa slide dan penyajian tertulis", "layak_teks": true, "catatan_layanan": "Penyajian dilakukan lisan di depan kelas atau tertulis. Tidak ada tuntutan membuat slide, poster, atau media visual." }
```

**AFTER — VERBATIM**:

```json
{
  "id": "BIE-MB-1",
  "kompetensi": "menggunakan bahasa Inggris untuk berkomunikasi dengan guru, teman sebaya, dan orang lain",
  "lingkup_materi": "berbagai macam situasi komunikasi lisan",
  "sumber_cp": "Peserta didik menggunakan bahasa Inggris untuk berkomunikasi dengan guru, teman sebaya dan orang lain dalam berbagai macam situasi.",
  "cakupan_teks": "penuh",
  "layak_teks": true
},
{
  "id": "BIE-MB-2",
  "kompetensi": "memahami alur informasi secara keseluruhan, gagasan utama, dan detail dalam teks lisan fiksi dan non-fiksi",
  "lingkup_materi": "berbagai macam topik yang relevan dengan topik sehari-hari atau isu terkini",
  "sumber_cp": "Peserta didik memahami alur informasi secara keseluruhan, gagasan utama dan detail dalam teks lisan fiksi dan non-fiksi mengenai berbagai macam topik yang relevan dengan topik sehari-hari atau isu terkini.",
  "cakupan_teks": "penuh",
  "layak_teks": true,
  "catatan_layanan": "CARA melayani, bukan penyempitan lingkup: sumber bunyinya adalah guru yang membacakan naskah atau murid yang berbicara. MiClass menyediakan naskahnya; tidak ada rekaman audio. Jenis dan topik teks lisan tetap seluas yang CP sebutkan."
},
{
  "id": "BIE-MB-3",
  "kompetensi": "menggunakan bahasa Inggris untuk mengungkapkan pendapat dan mempertahankan argumen",
  "lingkup_materi": "topik yang dibahas",
  "sumber_cp": "Peserta didik menggunakan bahasa Inggris untuk mengungkapkan pendapat dan mempertahankan argumen tentang topik yang dibahas.",
  "cakupan_teks": "penuh",
  "layak_teks": true,
  "catatan_layanan": "CARA melayani: dilaksanakan sebagai interaksi langsung di kelas — diskusi, tanya jawab, atau adu argumen lisan tanpa properti maupun alat."
}
```

```json
{
  "id": "BIE-MM-1",
  "kompetensi": "membaca dan merespon berbagai macam teks untuk pembelajaran dan pencarian informasi",
  "lingkup_materi": "narasi, deskripsi, prosedur, eksposisi, recount, dan report",
  "sumber_cp": "Peserta didik membaca dan merespon berbagai macam teks seperti narasi, deskripsi, prosedur, eksposisi, recount, dan report untuk pembelajaran dan pencarian informasi.",
  "cakupan_teks": "penuh",
  "layak_teks": true
},
{
  "id": "BIE-MM-2",
  "kompetensi": "menganalisis dan menginterpretasi informasi eksplisit dan implisit dalam teks fiksi dan non-fiksi",
  "lingkup_materi": "teks tulis dan multimodal tentang topik sehari-hari atau isu terkini",
  "sumber_cp": "Peserta didik menganalisis dan menginterpretasi informasi eksplisit dan implisit dalam teks fiksi dan non-fiksi dari teks tulis dan multimodal tentang topik sehari-hari atau isu terkini.",
  "cakupan_teks": "sebagian",
  "layak_teks": true,
  "catatan_layanan": "PENYEMPITAN YANG DISADARI. CP menuntut teks tulis DAN multimodal. MiClass melayani sisi multimodal hanya lewat teks bertata-letak yang dapat dicetak — formulir, tabel, daftar, tiket, label, jadwal — dan tidak menyediakan gambar, foto, infografik, atau video. Guru yang ingin memenuhi sisi visual CP secara penuh perlu menambahkan bahannya sendiri; MiClass tidak boleh menuliskannya sebagai tuntutan yang sudah terpenuhi."
}
```

```json
{
  "id": "BIE-MP-1",
  "kompetensi": "menulis berbagai jenis teks fiksi dan non-fiksi melalui aktivitas yang dipandu",
  "lingkup_materi": "berbagai jenis teks fiksi dan non-fiksi",
  "sumber_cp": "Peserta didik menulis berbagai jenis teks fiksi dan non-fiksi, melalui aktivitas yang dipandu,",
  "cakupan_teks": "penuh",
  "layak_teks": true
},
{
  "id": "BIE-MP-2",
  "kompetensi": "menyajikan gagasan dengan struktur dan unsur kebahasaan yang sesuai dengan tujuan dan konteks komunikatif",
  "lingkup_materi": "beragam media untuk berkomunikasi dan menyajikan gagasan",
  "sumber_cp": "menggunakan beragam media untuk berkomunikasi dan menyajikan gagasan dengan struktur dan unsur kebahasaan yang sesuai dengan tujuan dan konteks komunikatif.",
  "cakupan_teks": "sebagian",
  "layak_teks": true,
  "catatan_layanan": "PENYEMPITAN YANG DISADARI. CP menuntut \"beragam media\". Media yang MiClass layani adalah teks tulis dan penyampaian lisan langsung di depan kelas; slide, poster, rekaman, dan media visual tidak dihasilkan dan tidak boleh dibebankan kepada guru. Ragam medianya berkurang; struktur dan unsur kebahasaan yang dituntut CP tetap wajib dilayani penuh."
}
```

**Why** — lima temuan semantik; uraiannya di laporan §B.

**Test/evidence** — `CASE N: penguraian CP dapat ditelusuri dua arah`.

### 7.3 Tipe acuan bertambah dua field (Pass 2)

**Exact file path** — `tests/atp-acuan-sinkron.mjs` (pembangkit `acuan-cp.ts`)
**Constant** — `KEPALA`

**BEFORE — VERBATIM**:

```js
export type TuntutanCp = {
  id: string;
  kompetensi: string;
  lingkup_materi: string;
  layak_teks: boolean;
  catatan_layanan?: string;
};
```

**AFTER — VERBATIM**:

```js
export type TuntutanCp = {
  id: string;
  kompetensi: string;
  lingkup_materi: string;
  /** Potongan cp_normatif VERBATIM yang menjadi asal tuntutan ini. Wajib —
   *  tuntutan tanpa sumber adalah interpretasi tanpa jejak. */
  sumber_cp: string;
  /** 'penuh'  — seluruh tuntutan dapat dilayani teks/interaksi langsung.
   *  'sebagian' — ada bagian CP yang sengaja tidak dilayani; catatan_layanan
   *  wajib menyebut apa yang berkurang. */
  cakupan_teks: 'penuh' | 'sebagian';
  layak_teks: boolean;
  catatan_layanan?: string;
};
```

---

## 8. VALIDATOR

### 8.1 Validator berkode dan berlapis (Pass 1)

**Exact file path** — `kontrak.ts`
**Function** — `validasiAtp()`

**BEFORE — VERBATIM** (`index.ts` @ `e3323b5`, `validateTpList`, potongan):

```ts
      errors.push(`nomor tidak berurutan: TP[${i}].nomor=${entries[i].nomor}, diharapkan ${i + 1}`);
...
      errors.push(`TP ${tp.nomor}: jp_alokasi=${tp.jp_alokasi} bukan kelipatan jp_per_pertemuan=${jpPerPertemuan}`);
...
    errors.push(`sum(jp_alokasi)=${totalJp} !== jp_operasional=${jpOperasional}`);
```

**AFTER — VERBATIM** — kode aturan S1–S3, C1–C5, W1–W8, K1, B1–B3 di
`kontrak.ts` 1166–1310. Yang baru dibanding validator lama: cakupan CP (C3–C5),
anggaran per semester (W7–W8), kepadatan (K1), ketergantungan bahan (B1),
jargon (B2), panjang judul (B3).

**Test/evidence** — `CASE D`, `CASE G`, `CASE J`, `CAKUPAN`, `KEPADATAN`.

### 8.2 GATE B — pemeriksaan keputusan D1–D5 (Pass 2)

**Exact file path** — `kontrak.ts`
**Function** — `periksaKeputusan()`; **konstan** — `MIN_HURUF_ALASAN`
**Line range AFTER** — 1313–1394

**BEFORE — VERBATIM** — `NEW — did not exist`

**AFTER — VERBATIM**:

```ts
export const MIN_HURUF_ALASAN = 25;

export function periksaKeputusan(
  raw: unknown[],
  terbuka: PertanyaanSemantik[],
  dasarBoleh: Set<string> | null,
  E: (kode: string, pesan: string) => void,
): KeputusanMiClass[] {
  const out: KeputusanMiClass[] = [];
  const perluDijawab = new Map(terbuka.map(q => [q.question_id, q]));
  const sudah = new Set<string>();

  for (const item of raw) {
    if (!item || typeof item !== 'object') {
      E('D1', 'keputusan_didelegasikan berisi entri yang bukan objek');
      continue;
    }
    const o  = item as Record<string, unknown>;
    const qid = String(o.question_id ?? '').trim();
    const q   = perluDijawab.get(qid);

    if (!q) {
      E('D1', `keputusan untuk ${qid || '(tanpa question_id)'} tidak diminta — ` +
        (perluDijawab.size
          ? `yang didelegasikan guru hanya ${[...perluDijawab.keys()].join(', ')}`
          : 'guru tidak mendelegasikan satu pun keputusan'));
      continue;
    }
    if (sudah.has(qid)) { E('D1', `keputusan ganda untuk ${qid}`); continue; }
    sudah.add(qid);

    const pilihan = String(o.pilihan ?? '').trim();
    if (!q.opsi[pilihan]) {
      E('D3', `${qid}: pilihan "${pilihan}" bukan opsi yang sah — hanya boleh ${Object.keys(q.opsi).join(', ')}`);
      continue;
    }

    const alasan = String(o.alasan ?? '').trim();
    if (alasan.length < MIN_HURUF_ALASAN) {
      E('D4', `${qid}: alasan kosong atau terlalu pendek (${alasan.length} huruf, minimal ${MIN_HURUF_ALASAN})`);
      continue;
    }

    const dasar = Array.isArray(o.dasar) ? o.dasar.map(x => String(x).trim()).filter(Boolean) : [];
    if (dasar.length === 0) {
      E('D5', `${qid}: tidak menyebut satu pun dasar dari konteks yang tersedia`);
      continue;
    }
    if (dasarBoleh) {
      const asing = dasar.filter(d => !dasarBoleh.has(d));
      if (asing.length) {
        E('D5', `${qid}: dasar merujuk sesuatu yang tidak ada dalam konteks permintaan ini: ${asing.join(', ')} — ` +
          `yang tersedia: ${[...dasarBoleh].join(', ')}`);
        continue;
      }
    }

    out.push({
      pertanyaan: q.pertanyaan,
      didelegasikan_karena: 'guru memilih tentukan saat menyusun',
      dipilih: q.opsi[pilihan],
      alasan,
      sumber: 'penyusunan',
      dasar,
      kunci: pilihan,
    });
  }

  for (const [qid, q] of perluDijawab) {
    if (!sudah.has(qid)) {
      E('D2', `${qid} (${q.pertanyaan}) didelegasikan guru tetapi tidak dijawab di keputusan_didelegasikan`);
    }
  }
  return out;
}
```

**Why** — keputusan model diperlakukan seperti keluaran lain: tidak dipercaya,
diperiksa. Yang diperiksa hanya yang dapat dibuktikan; apakah pilihannya bijak
tetap SEMANTIC ACCEPTANCE dan tidak diklaim di sini.

**Test/evidence** — `CASE M` (D1, D2, D3, D4, D5), `CASE L` butir (5)–(6).

### 8.3 GATE D — pita toleransi judul (Pass 2)

**Exact file path** — `kontrak.ts`
**Constant** — `TARGET_KATA_JUDUL`, `MAKS_KATA_JUDUL`
**Line range AFTER** — 1105–1134, 1300–1310

**BEFORE — VERBATIM**:

```ts
/** Batasnya 16, bukan 12 seperti yang tertulis di prompt, dan itu disengaja.
 *  Prompt meminta maksimal 12 kata; validator menolak di 17. Selisihnya adalah
 *  ruang toleransi: menolak seluruh ATP karena satu judul 13 kata membakar satu
 *  dari tiga jatah harian guru untuk kelebihan yang tidak ia rasakan. Yang
 *  ditangkap gerbang ini adalah judul yang benar-benar berubah jadi kalimat
 *  administratif. */
export const MAKS_KATA_JUDUL = 16;
```

```ts
    const kata = judul.trim().split(/\s+/).filter(Boolean).length;
    if (kata > MAKS_KATA_JUDUL) {
      E('B3', `TP ${tp.nomor}: judul ${kata} kata, batasnya ${MAKS_KATA_JUDUL} — "${judul}"`);
    }
```

**AFTER — VERBATIM**:

```ts
// KONTRAK PANJANG JUDUL TP — dua angka, dan keduanya dinyatakan sebagai
// kontrak, bukan sebagai selisih yang kebetulan ada.
//
//   SASARAN LUNAK  <= 12 kata. Inilah standarnya, dan dasarnya keterbacaan
//   guru: judul TP dibaca sekilas di daftar, dicetak di ATP, dan dipakai
//   sebagai nama Modul Ajar. Dua belas kata adalah panjang yang masih bisa
//   ditangkap dalam satu tarikan mata.
//
//   BATAS KERAS    = 16 kata. Ini BUKAN standar dan bukan pembenaran dari
//   keluaran lama — bahwa ATP lama pernah menghasilkan judul 15 kata tidak
//   menjadikan 15 kata benar. Ia semata-mata titik tempat penolakan mulai lebih
//   merugikan guru daripada judul yang kepanjangan: menolak SELURUH ATP karena
//   satu judul 13 kata membakar satu dari tiga jatah harian guru.
//
// Judul di antara keduanya lolos, tetapi dicatat di `peringatan` — catatan mutu
// internal, tidak ditampilkan kepada guru, karena guru tidak bisa berbuat
// apa-apa dengannya. Yang membacanya adalah kita, saat menilai apakah pita
// toleransi ini masih pada tempatnya.

/** Sasaran lunak. Dilanggar = dicatat, bukan ditolak. */
export const TARGET_KATA_JUDUL = 12;

/** Batas keras. Dilanggar = seluruh ATP ditolak. */
export const MAKS_KATA_JUDUL = 16;
```

```ts
    const kata = judul.trim().split(/\s+/).filter(Boolean).length;
    if (kata > MAKS_KATA_JUDUL) {
      E('B3', `TP ${tp.nomor}: judul ${kata} kata, batas keras ${MAKS_KATA_JUDUL} — "${judul}"`);
    } else if (kata > TARGET_KATA_JUDUL) {
      peringatan.push(
        `[B3-toleransi] TP ${tp.nomor}: judul ${kata} kata, di atas sasaran ${TARGET_KATA_JUDUL} ` +
        `dan masih di bawah batas keras ${MAKS_KATA_JUDUL} — "${judul}"`);
    }
```

**Why** — komentar BEFORE membenarkan 16 dengan menyebutnya "ruang toleransi"
tanpa menyatakan sasarannya sebagai kontrak. Reviewer menolak pembenaran dari
keluaran lama; standarnya keterbacaan guru.

**Test/evidence** — `JUDUL: 12 kata bersih, 13-16 kata lolos dengan catatan,
17 kata ditolak`.

---

## 9. EDGE FUNCTION GENERATION FLOW

### 9.1 Gerbang urut, rate limit di belakang validasi (Pass 1)

**Exact file path** — `supabase/functions/generate-atp/index.ts`
**Line range AFTER** — 380–401

**Why** — `fn_check_rate_limit` menaikkan penghitung pada setiap panggilan; selama
ia berdiri di depan validasi, satu dari tiga jatah harian hangus hanya untuk
diberi tahu bahwa datanya belum lengkap.

**Test/evidence** — `CASE I: gerbang acuan CP berdiri sebelum rate limit di Edge
Function` (memeriksa urutan kemunculan di sumbernya).

### 9.2 Delegasi semantik terpasang di alur (Pass 2)

**Exact file path** — `index.ts`
**Line range AFTER** — 415–437, 485, 496–503, 668–672, 736–742, 754

**BEFORE — VERBATIM**:

```ts
  // ── 6c. KEPUTUSAN YANG DIDELEGASIKAN ─────────────────────────────────────
  //
  // Diselesaikan di KODE, bukan diserahkan ke model. Kalau model yang memilih,
  // keputusannya tidak bisa dilaporkan kepada guru dengan jujur, tidak bisa
  // diuji, dan berbeda tiap generate.
  const delegasi = resolveDelegasi(cd);

  const wajib = tuntutanWajib(acuan);
  const konteks = bangunKonteksAtp(
    cd,
    { mapel: String(atp.mapel), fase: String(atp.fase), jenjang: String(atp.jenjang), jumlah_murid: jumlahMurid },
    alokasi, elemenCp, delegasi,
  );
```

**AFTER — VERBATIM**:

```ts
  // ── 6c. KEPUTUSAN YANG DIDELEGASIKAN ─────────────────────────────────────
  //
  // Dibagi dua. Yang aturannya dapat ditulis penuh tanpa membaca makna CP
  // diselesaikan di kode dan sudah final di sini. Yang menuntut pembacaan
  // struktur tuntutan CP — A17 dan A19 — diserahkan kepada penyusun DALAM
  // panggilan yang sudah ada, lalu diperiksa server terhadap allowlist enum dan
  // terhadap konteks yang benar-benar dikirim. Tidak ada panggilan AI tambahan,
  // dan tidak ada aritmetika yang berpindah ke AI.
  const delegasi = resolveDelegasi(cd);

  const wajib = tuntutanWajib(acuan);
  const programKeahlian = String(jawaban(cd, 'KONTEKS_CP', 'program_keahlian') ?? '').trim();
  const dasarBoleh = dasarTersedia(
    cd,
    { program_keahlian: programKeahlian, jumlah_murid: jumlahMurid },
    wajib.map(w => w.id),
  );
  const konteks = bangunKonteksAtp(
    cd,
    { mapel: String(atp.mapel), fase: String(atp.fase), jenjang: String(atp.jenjang), jumlah_murid: jumlahMurid },
    alokasi, elemenCp, delegasi, dasarBoleh,
  );
```

**AFTER — VERBATIM** (syarat validasi):

```ts
    delegasi_terbuka:   delegasi.terbuka,
    dasar_tersedia:     dasarBoleh,
```

**AFTER — VERBATIM** (gabungan keputusan yang disimpan):

```ts
  // Keputusan aturan lebih dulu, lalu keputusan penyusunan. Keduanya masuk ke
  // daftar yang SAMA supaya guru melihat satu daftar "yang MiClass putuskan
  // untuk saya" — bedanya tetap terbaca lewat `sumber` dan `dasar`.
  const keputusanSemua: KeputusanMiClass[] = [...delegasi.keputusan, ...validation.keputusan];
```

### 9.3 Prompt repair membawa galat delegasi (Pass 2)

**Exact file path** — `index.ts`
**Line range AFTER** — 736–742

**BEFORE — VERBATIM**:

```ts
          `ID tuntutan hanya dari ${wajib.map(w => w.id).join(', ')} dan SEMUANYA wajib terpakai. ` +
          'Hasilkan ulang JSON array penuh yang benar.' },
```

**AFTER — VERBATIM**:

```ts
          `ID tuntutan hanya dari ${wajib.map(w => w.id).join(', ')} dan SEMUANYA wajib terpakai. ` +
          (delegasi.terbuka.length
            ? 'Keputusan yang didelegasikan wajib lengkap dan sah: ' +
              delegasi.terbuka.map(q =>
                `${q.question_id} pilih salah satu dari ${Object.keys(q.opsi).join('/')}`).join('; ') +
              `; setiap dasar hanya boleh dari ${[...dasarBoleh].join(', ')}. ` +
              'Kembalikan objek {"keputusan_didelegasikan": [...], "tp": [...]}. '
            : '') +
          'Hasilkan ulang keluaran penuh yang benar.' },
```

**Why** — model tidak bisa memperbaiki apa yang tidak ia ketahui salahnya.

### 9.4 SYSTEM_PROMPT — bentuk keluaran dan aturan delegasi (Pass 2)

**Exact file path** — `index.ts`
**Line range AFTER** — 126–133, 134–135, 143–164, 216–235

**BEFORE — VERBATIM**:

```ts
  'BENTUK KELUARAN\n' +
  '1. Hasilkan HANYA JSON array TP. Tidak ada narasi di luar array.\n' +
```

```ts
  '   - judul       : kalimat aktif yang menyebut kompetensi dan konteksnya, maksimal 12 kata\n' +
```

**AFTER — VERBATIM**:

```ts
  'BENTUK KELUARAN\n' +
  '0. Hasilkan HANYA JSON. Tidak ada narasi di luarnya.\n' +
  '   - Kalau keputusan_terbuka KOSONG: keluarkan JSON array TP.\n' +
  '   - Kalau keputusan_terbuka BERISI: keluarkan objek\n' +
  '     {"keputusan_didelegasikan": [...], "tp": [...]}\n' +
  '1. Isi array TP:\n' +
```

```ts
  `   - judul       : kalimat aktif yang menyebut kompetensi dan konteksnya. SASARAN maksimal ` +
  `${TARGET_KATA_JUDUL} kata; BATAS KERAS ${MAKS_KATA_JUDUL} kata — lewat batas keras, seluruh ATP ditolak\n` +
```

```ts
  'KEPUTUSAN YANG DIDELEGASIKAN GURU\n' +
  'Bagian keputusan_terbuka memuat pertanyaan yang guru serahkan kepadamu. Untuk SETIAP\n' +
  'entri di sana kembalikan tepat satu keputusan di keputusan_didelegasikan:\n' +
  '  { "question_id": <question_id entri itu>,\n' +
  '    "pilihan":     <SATU kunci dari daftar opsi entri itu, disalin persis>,\n' +
  '    "alasan":      <kalimatmu sendiri, menyebut apa yang membuat pilihan itu paling sesuai>,\n' +
  '    "dasar":       [<kunci dari dasar_yang_boleh_disebut entri itu>] }\n' +
  'ATURAN YANG MEMBATALKAN SELURUH KELUARAN kalau dilanggar:\n' +
  '  - JANGAN membuat opsi baru. Hanya kunci yang ada di daftar opsi.\n' +
  '  - JANGAN menjawab pertanyaan yang tidak ada di keputusan_terbuka.\n' +
  '  - JANGAN meninggalkan satu pun entri keputusan_terbuka tanpa jawaban.\n' +
  '  - JANGAN menyebut dasar di luar dasar_yang_boleh_disebut. Kalau sesuatu tidak ada di\n' +
  '    daftar itu, ia memang tidak dikirim kepadamu — jangan mengarangnya, dan jangan\n' +
  '    beralasan atasnya. Program keahlian yang tidak tercatat, situasi khusus yang tidak\n' +
  '    guru sebutkan, dan jumlah murid yang tidak diketahui TIDAK BOLEH dijadikan alasan.\n' +
  '  - Timbang seluruh butir di "pertimbangkan" entri itu sebelum memilih, dan mulai dari\n' +
  '    yang pertama. Kalau setelah menimbang semuanya pilihan yang paling sesuai memang\n' +
  '    pilihan yang paling netral, pilih itu — tetapi alasannya harus menyebut apa yang\n' +
  '    kau timbang, bukan menyatakan bahwa kau tidak punya dasar.\n' +
  '  - Keputusanmu WAJIB tercermin di daftar TP. Metode pengurutan yang kau pilih adalah\n' +
  '    urutan TP yang benar-benar kau susun; konteks tugas yang kau pilih adalah latar\n' +
  '    contoh yang benar-benar kau pakai di judul dan konteks TP.\n\n' +
```

### 9.5 Plafon token diperiksa ulang setelah prompt membesar (Pass 2)

**Exact file path** — `index.ts`
**Function** — `anggaranTokenAtp()`
**Line range AFTER** — 42–59, 510

**BEFORE — VERBATIM**:

```ts
function anggaranTokenAtp(jumlahElemen: number, jpOperasional: number): number {
  const perkiraanTp = Math.max(4, Math.ceil(jpOperasional / 10));
  return Math.max(12000, Math.min(800 * perkiraanTp + 1000 * jumlahElemen, 32000));
}
```

```ts
  const anggaranToken = anggaranTokenAtp(elemenCp.length, jpOp);
```

**AFTER — VERBATIM**:

```ts
//
// Lantai dinaikkan 12.000 -> 14.000 pada 10 September 2026 karena SYSTEM_PROMPT
// bertambah satu seksi penuh (KEPUTUSAN YANG DIDELEGASIKAN) dan keluarannya
// bertambah satu objek keputusan per pertanyaan terbuka. Keduanya menyempitkan
// ruang keluaran: prompt yang membesar memakan konteks, dan memilih di antara
// enam metode pengurutan sambil membaca struktur tuntutan CP adalah kerja
// penalaran — yang ikut dihitung ke maxOutputTokens dan TIDAK mengecil hanya
// karena keluarannya pendek. Plafon roboh lima kali dalam satu hari di
// generate-modul karena langkah ini dilewati (CLAUDE.md).
function anggaranTokenAtp(
  jumlahElemen: number,
  jpOperasional: number,
  jumlahKeputusanTerbuka = 0,
): number {
  const perkiraanTp = Math.max(4, Math.ceil(jpOperasional / 10));
  const kasar = 800 * perkiraanTp + 1000 * jumlahElemen + 1500 * jumlahKeputusanTerbuka;
  return Math.max(14000, Math.min(kasar, 32000));
}
```

```ts
  const anggaranToken = anggaranTokenAtp(elemenCp.length, jpOp, konteks.keputusan_terbuka.length);
```

**Why** — CLAUDE.md: "Menambah aturan ke SYSTEM_PROMPT diam-diam mempersempit
ruang keluaran SEMUA fase. Periksa plafonnya setiap kali prompt diperbesar."

---

## 10. RENDERER REVIEW

### 10.1 Dasar penyusunan ditampilkan terpisah (Pass 1)

**Exact file path** — `guru/js/rancang-chat.js`
**Function** — `renderDasarPenyusunan()`

**BEFORE — VERBATIM** — `NEW — did not exist` (guru menerima daftar TP tanpa satu
kalimat pun tentang atas dasar apa ia disusun).

### 10.2 Dasar keputusan ikut ditampilkan (Pass 2)

**Exact file path** — `guru/js/rancang-chat.js`
**Function** — `renderDasarPenyusunan()`; **konstan** — `LABEL_DASAR_KEPUTUSAN`

**BEFORE — VERBATIM**:

```js
    if (Array.isArray(d.keputusan_miclass) && d.keputusan_miclass.length) {
      text += '\n\nKeputusan yang MiClass ambil untuk Anda\n' +
        d.keputusan_miclass.map(k =>
          `• ${k.pertanyaan} → ${k.dipilih}\n  Alasan: ${k.alasan}`).join('\n');
    }
```

**AFTER — VERBATIM**:

```js
    if (Array.isArray(d.keputusan_miclass) && d.keputusan_miclass.length) {
      text += '\n\nKeputusan yang MiClass ambil untuk Anda\n' +
        d.keputusan_miclass.map(k => {
          let baris = `• ${k.pertanyaan} → ${k.dipilih}\n  Alasan: ${k.alasan}`;
          // Dasar hanya ada pada keputusan yang diambil saat penyusunan. Ia
          // ditampilkan supaya guru dapat menilai apakah yang ditimbang memang
          // hal yang ia berikan — bukan sekadar membaca kalimat yang meyakinkan.
          const dasar = Array.isArray(k.dasar)
            ? k.dasar.map(x => LABEL_DASAR_KEPUTUSAN[x] || LABEL_DASAR_KEPUTUSAN[String(x).split('.').slice(0, 2).join('.')] || x)
            : [];
          if (dasar.length) baris += `\n  Ditimbang dari: ${[...new Set(dasar)].join('; ')}`;
          return baris;
        }).join('\n');
    }
```

**Why** — Gate B menuntut keputusan terlihat di layar; tanpa dasar, guru hanya
membaca kalimat yang meyakinkan tanpa cara menilainya.

---

## 11. DOCX RENDERER

### 11.1 Dasar penyusunan dicetak ke ATP (Pass 1) dan dasar keputusan (Pass 2)

**Exact file path** — `guru/js/classroom-unduh.js`
**Function** — `generateAtpDocx()`; **konstan** — `LABEL_DASAR_KEPUTUSAN`
**Line range AFTER** — 84–97, 202–239

**BEFORE — VERBATIM**:

```js
      if (Array.isArray(d.keputusan_miclass) && d.keputusan_miclass.length) {
        subJudul('Keputusan yang ditetapkan MiClass');
        d.keputusan_miclass.forEach(function (k) {
          butir(k.pertanyaan + ' → ' + k.dipilih);
          children.push(new D.Paragraph({
            children: [new D.TextRun({ text: 'Alasan: ' + k.alasan, size: 19, color: '666666' })],
            indent: { left: 720 }, spacing: { after: 60 },
          }));
        });
      }
```

**AFTER — VERBATIM**:

```js
      if (Array.isArray(d.keputusan_miclass) && d.keputusan_miclass.length) {
        subJudul('Keputusan yang ditetapkan MiClass');
        d.keputusan_miclass.forEach(function (k) {
          butir(k.pertanyaan + ' → ' + k.dipilih);
          children.push(new D.Paragraph({
            children: [new D.TextRun({ text: 'Alasan: ' + k.alasan, size: 19, color: '666666' })],
            indent: { left: 720 }, spacing: { after: 60 },
          }));
          // Hanya keputusan yang diambil saat penyusunan yang punya dasar.
          // Dicetak supaya dokumen yang guru arsipkan menyatakan atas apa
          // keputusan itu diambil, bukan hanya bahwa ia diambil.
          var dasar = Array.isArray(k.dasar) ? k.dasar.map(function (x) {
            return LABEL_DASAR_KEPUTUSAN[x]
              || LABEL_DASAR_KEPUTUSAN[String(x).split('.').slice(0, 2).join('.')]
              || x;
          }) : [];
          if (dasar.length) {
            var unik = dasar.filter(function (v, i) { return dasar.indexOf(v) === i; });
            children.push(new D.Paragraph({
              children: [new D.TextRun({ text: 'Ditimbang dari: ' + unik.join('; '), size: 19, color: '666666' })],
              indent: { left: 720 }, spacing: { after: 60 },
            }));
          }
        });
      }
```

### 11.2 Versi cache dinaikkan (Pass 2)

**Exact file path** — `guru/classroom.html` (241, 243), `sw.js` (20)

**BEFORE — VERBATIM**:

```html
  <script src="js/rancang-chat.js?v=chat-20260910a1"></script>
  <script src="js/classroom-unduh.js?v=unduh-20260910a1"></script>
```

```js
const CACHE_NAME = 'miclass-v24';
```

**AFTER — VERBATIM**:

```html
  <script src="js/rancang-chat.js?v=chat-20260910a2"></script>
  <script src="js/classroom-unduh.js?v=unduh-20260910a2"></script>
```

```js
const CACHE_NAME = 'miclass-v25';
```

**Why** — CLAUDE.md: naikkan keduanya setiap kali kode klien berubah.

---

## 12. TESTS

| Berkas | Perubahan | BEFORE |
|---|---|---|
| `tests/atp-kontrak.test.ts` | Pass 1: Case A–J + kontrak + kepadatan + dasar/asumsi + bahasa + aritmetika (22 uji). Pass 2: `CASE H` ditulis ulang, `CASE H` array telanjang, `CASE K`, `CASE L`, `CASE M`, `CASE N`, `CASE O`, `JUDUL` (29 uji). | `NEW — did not exist` |
| `tests/atp-acuan-sinkron.mjs` | Pass 1 baru; Pass 2 `KEPALA` bertambah `sumber_cp` + `cakupan_teks` (lihat §7.3). | `NEW — did not exist` |
| `tests/atp-trace.mjs` | Pass 1 baru — membangkitkan `docs/SPEC-ATP-KONTRAK.md` dari `KONTRAK_PERTANYAAN`. | `NEW — did not exist` |
| `tests/fixtures/atp-produksi.json` | Pass 1 — 16 judul TP nyata untuk kalibrasi B1/B3. | `NEW — did not exist` |

**AFTER — VERBATIM** (`syaratDari` Pass 2, agar delegasi ikut diuji):

```ts
function syaratDari(
  alokasi: Alokasi, targetTp: number, tuntutan = WAJIB_BI,
  tambahan: { delegasi_terbuka?: typeof DELEGASI_SEMANTIK; dasar_tersedia?: Set<string> } = {},
) {
```

---

## Perintah yang wajib lulus

```
deno test --allow-read tests/atp-kontrak.test.ts    # 29 uji
node tests/atp-acuan-sinkron.mjs                    # salinan acuan CP di EF
node tests/atp-trace.mjs --periksa                  # dokumen jejak vs kode
deno check supabase/functions/generate-atp/index.ts
deno check supabase/functions/generate-atp/kontrak.ts
node --check guru/js/rancang-chat.js
node --check guru/js/classroom-unduh.js
```

---

# PASS 3 — CURRENT CP AUTHORITY

Pass 3 mengganti otoritas CP yang dipakai MiClass untuk Bahasa Inggris Fase E
dari Keputusan Kepala BSKAP **32/H/KR/2024** (dicabut) ke **046/H/KR/2025**, lalu
membangun ulang penguraian tuntutannya dari nol.

Diff mentah lengkap tetap di `docs/ATP-FINALIZATION-CHANGE-EVIDENCE.diff`.

## 13. OTORITAS CP — `shared/data/cp-data.json`

**Requirement / Decision** — Pass 3 §0, §4: 046/H/KR/2025 menjadi satu-satunya
sumber aktif; 32/H/KR/2024 hanya boleh dipakai sebagai pembanding sejarah.

**Exact file path** — `shared/data/cp-data.json`
**Function / constant** — `bahasa_inggris.fase_e`
**Line range AFTER** — 10–33

**BEFORE — VERBATIM**

```json
    "fase_e": {
      "label": "Bahasa Inggris Fase E (Kelas 10 SMA/SMK)",
      "cp_umum": "Di akhir Fase E, peserta didik mampu menggunakan teks lisan, tulisan, dan visual untuk berkomunikasi sesuai dengan situasi, tujuan pembelajaran, dan pembacanya. Peserta didik telah mempelajari narasi, deskripsi, prosedur, eksposisi, recount, report, dan teks otentik. Peserta didik mampu menggunakan Bahasa Inggris menyampaikan pendapat, berdiskusi topik keseharian, membaca teks untuk mendapatkan informasi, dan membuat teks tulisan dan visual yang beragam.",
      "elemen": [
        {
          "nama": "Menyimak - Berbicara",
          "cp_normatif": "Peserta didik menggunakan bahasa Inggris untuk berkomunikasi dengan guru, teman sebaya dan orang lain dalam berbagai macam situasi. Peserta didik memahami alur informasi secara keseluruhan, gagasan utama dan detail dalam teks lisan fiksi dan non-fiksi mengenai berbagai macam topik yang relevan dengan topik sehari-hari atau isu terkini. Peserta didik menggunakan bahasa Inggris untuk mengungkapkan pendapat dan mempertahankan argumen tentang topik yang dibahas."
        },
        {
          "nama": "Membaca - Memirsa",
          "cp_normatif": "Peserta didik membaca dan merespon berbagai macam teks seperti narasi, deskripsi, prosedur, eksposisi, recount, dan report untuk pembelajaran dan pencarian informasi. Peserta didik menganalisis dan menginterpretasi informasi eksplisit dan implisit dalam teks fiksi dan non-fiksi dari teks tulis dan multimodal tentang topik sehari-hari atau isu terkini."
        },
        {
          "nama": "Menulis - Mempresentasikan",
          "cp_normatif": "Peserta didik menulis berbagai jenis teks fiksi dan non-fiksi, melalui aktivitas yang dipandu, menggunakan beragam media untuk berkomunikasi dan menyajikan gagasan dengan struktur dan unsur kebahasaan yang sesuai dengan tujuan dan konteks komunikatif."
        }
      ]
    },
```

**AFTER — VERBATIM**

```json
    "fase_e": {
      "label": "Bahasa Inggris Fase E (Kelas X SMA/SMK/MA/MAK/Program Paket C)",
      "sumber_regulasi": "Keputusan Kepala BSKAP Nomor 046/H/KR/2025",
      "versi_cp": "046/H/KR/2025",
      "ditetapkan": "2025-07-16",
      "mencabut": "32/H/KR/2024",
      "lampiran": "Lampiran II angka 4 Fase E. Untuk SMK/MAK, Lampiran III angka I menyatakan Bahasa Inggris mengacu pada Lampiran II.",
      "cp_umum": "",
      "elemen": [
        {
          "nama": "Menyimak - Berbicara",
          "cp_normatif": "Memahami alur informasi secara keseluruhan, gagasan utama dan detail dalam teks lisan fiksi dan non fiksi mengenai berbagai macam topik yang relevan dengan topik sehari-hari atau isu terkini; menggunakan bahasa Inggris untuk mengungkapkan pendapat dan mempertahankan argumen tentang topik yang dibahas."
        },
        {
          "nama": "Membaca - Memirsa",
          "cp_normatif": "Memahami alur informasi secara keseluruhan, menganalisis dan menyimpulkan informasi tersurat dan tersirat dari berbagai jenis teks fiksi dan non fiksi tertulis atau teks multimodal tentang topik sehari-hari atau isu terkini."
        },
        {
          "nama": "Menulis - Mempresentasikan",
          "cp_normatif": "Mengomunikasikan gagasan dan pengalaman mereka secara tertulis atau multimodal dalam berbagai jenis teks fiksi dan nonfiksi dengan menggunakan berbagai media presentasi (cetak atau digital) untuk mencapai tujuan tertentu dengan struktur teks dan unsur kebahasaan yang tepat; mengungkapkan pendapat dan mempertahankan argumen tentang topik sehari-hari atau isu terkini."
        }
      ]
    },
```

**Why** — Diktum KETUJUH Keputusan Kepala BSKAP 046/H/KR/2025 mencabut
32/H/KR/2024. Rumusan Fase E berubah material, bukan sekadar redaksional
(uraiannya di laporan §D). `nama` elemen SENGAJA tidak diubah: ia menjadi id
elemen lewat `makeCpElemenId()` dan sudah tersimpan di `progresi_tp` seluruh ATP
yang ada. `cp_umum` dikosongkan karena CP 2025 tidak merumuskan pernyataan umum
per fase untuk Bahasa Inggris — yang ada hanya rumusan per elemen, dan mengarang
ringkasan berarti menampilkan kalimat yang tidak ada di sumber normatif sebagai
kalimat CP.

**Test/evidence** — `CASE P`, `CASE R`; sumber verbatim di
`Kepka_BSKAP_No_01k17e8396ajn15j3hcw0k773b.pdf` halaman 136–137.

## 14. HASH SIDECAR

**Exact file path** — `shared/data/cp-data.meta.json`

**BEFORE — VERBATIM**

```json
    "revision":  "fbf8d8e6218e9cd785e4523c5ec62e2846fcd81098235dcef6561b150ab411af",
```

**AFTER — VERBATIM**

```json
    "revision": "82702a58b0dea9ffe8626d86305d39ec4c909e73c93b2fcccbf36efce2596d8c",
```

**Why** — `verifyCanonicalBytes()` menolak berkas yang hash-nya tidak cocok.
Tanpa ini `scripts/validate-canonical-cp.ts` gagal.

**Test/evidence** — `deno run --allow-read scripts/validate-canonical-cp.ts`.

## 15. PENGURAIAN ULANG — `shared/data/cp-acuan.json`

**BEFORE — VERBATIM** — tujuh tuntutan `BIE-MB-1 … BIE-MP-2` beserta
`cakupan_teks`, `layak_teks`, dan `catatan_layanan`; kutipan lengkapnya ada di
§7.2 dokumen ini. Seluruhnya DIBUANG sebagai otoritas — tidak disunting agar
tampak seperti CP 2025.

**AFTER — VERBATIM** — sepuluh tuntutan `BIE-E25-MB-1 … BIE-E25-MP-5` dengan
bentuk baru per tuntutan (`id`, `kompetensi`, `lingkup_materi`, `sumber_cp`,
`status_dekomposisi`, `logika`, `layanan`, `cara_layanan`) dan per elemen
(`cp_normatif`, `logika_elemen`). Berkas lengkapnya ada di diff; tabelnya di
laporan §F.

Contoh satu tuntutan yang menentukan hasil gerbang:

```json
{
  "id": "BIE-E25-MP-2",
  "kompetensi": "menggunakan berbagai media presentasi (cetak atau digital)",
  "lingkup_materi": "penyajian gagasan dan pengalaman yang sudah dikomunikasikan",
  "sumber_cp": "dengan menggunakan berbagai media presentasi (cetak atau digital)",
  "status_dekomposisi": "NEEDS HUMAN REVIEW",
  "logika": "SENGKETA SUMBER, BELUM TERSELESAIKAN. Keputusan Kepala BSKAP 046/H/KR/2025 (Lampiran II, 4.3) menulis \"(cetak atau digital)\" — ALTERNATIF. Panduan Mata Pelajaran Bahasa Inggris terbitan Pusat Kurikulum dan Pembelajaran 2025 (butir 4.3) menulis \"(cetak dan digital)\" — KUMULATIF. Terjemahan Inggris di KEDUA dokumen menulis \"(print and digital)\" — KUMULATIF. Rumusan Fase F di Kepka yang sama menulis \"(cetak dan digital)\", sehingga \"atau\" pada Fase E tidak dapat dianggap pola yang konsisten. Jika ALTERNATIF, jalur cetak sudah memenuhi dan MiClass sanggup. Jika KUMULATIF, media presentasi digital wajib, dan MiClass tidak menghasilkannya. Kedua bacaan mengubah hasil gerbang layanan, karena itu tidak boleh dipilih sepihak.",
  "layanan": "perlu_telaah_manusia",
  "cara_layanan": "Jalur cetak: MiClass menghasilkan dokumen siap cetak — teks presentasi, kartu bicara, lembar sajian, selebaran teks. Jalur digital: MiClass tidak menghasilkan slide, berkas presentasi, maupun sajian berbasis aplikasi, dan tidak ada jalan memenuhinya di dalam batas layanan sekarang."
}
```

**Why** — Pass 3 §5: penguraian lama dibangun dari CP yang sudah dicabut.
`cakupan_teks: "sebagian"` dihapus seluruhnya (Pass 3 §7): tidak ada lagi status
antara yang membuka layanan sambil menyerahkan sisanya kepada guru.

**Test/evidence** — `CASE N`, `CASE S`, `CASE U`.

## 16. GERBANG LAYANAN — `kontrak.ts`

**Function / constant** — `VERSI_CP_BERLAKU`, `VERSI_CP_DICABUT`,
`cakupanLayanan()`, `statusLayanan()`, `periksaParitasCp()`, `acuanUntuk()`

**BEFORE — VERBATIM**

```ts
export function acuanUntuk(mapel: string, fase: string): FaseAcuan | null {
  const m = ACUAN_CP.acuan[kunciMapel(mapel)];
  if (!m) return null;
  const f = m[kunciFase(fase)];
  if (!f || f.status !== 'tersedia') return null;
  return f;
}
```

**AFTER — VERBATIM**

```ts
export function acuanUntuk(mapel: string, fase: string): FaseAcuan | null {
  const m = ACUAN_CP.acuan[kunciMapel(mapel)];
  if (!m) return null;
  return m[kunciFase(fase)] ?? null;
}
```

```ts
export const VERSI_CP_BERLAKU = '046/H/KR/2025';

export const VERSI_CP_DICABUT = ['32/H/KR/2024', '032/H/KR/2024'];

export function cakupanLayanan(acuan: FaseAcuan | null): HasilCakupan {
  const out: HasilCakupan = { penuh: false, wajib: [], dilayani: [], tidak_dilayani: [], perlu_telaah: [] };
  if (!acuan) return out;
  for (const el of Object.values(acuan.elemen)) {
    for (const t of el.tuntutan) {
      out.wajib.push(t.id);
      if (t.layanan === 'dilayani') out.dilayani.push(t.id);
      else if (t.layanan === 'perlu_telaah_manusia') out.perlu_telaah.push(t.id);
      else out.tidak_dilayani.push(t.id);
    }
  }
  out.penuh = out.wajib.length > 0 && out.tidak_dilayani.length === 0 && out.perlu_telaah.length === 0;
  return out;
}

export function statusLayanan(mapel: string, fase: string): HasilLayanan {
  const acuan = acuanUntuk(mapel, fase);
  const cakupan = cakupanLayanan(acuan);
  const alasan: string[] = [];

  if (!acuan) {
    alasan.push('Uraian tuntutan Capaian Pembelajaran untuk kombinasi ini belum disusun.');
    return { didukung: false, kode: 'NOT_SUPPORTED', alasan, cakupan, acuan: null };
  }
  if (VERSI_CP_DICABUT.includes(acuan.versi_cp)) {
    alasan.push(`Acuan kombinasi ini masih berpangkal pada ${acuan.versi_cp}, yang sudah dicabut dan tidak berlaku.`);
  } else if (acuan.versi_cp !== VERSI_CP_BERLAKU) {
    alasan.push(`Acuan kombinasi ini berpangkal pada ${acuan.versi_cp}, bukan pada ${VERSI_CP_BERLAKU} yang berlaku.`);
  }
  if (acuan.review_status !== 'diterima') {
    alasan.push('Penguraian tuntutan CP kombinasi ini belum selesai ditinjau.');
  }
  if (cakupan.tidak_dilayani.length) {
    alasan.push(`Tuntutan CP yang tidak dapat MiClass layani: ${cakupan.tidak_dilayani.join(', ')}.`);
  }
  if (cakupan.perlu_telaah.length) {
    alasan.push(`Tuntutan CP yang belum terbukti dapat MiClass layani: ${cakupan.perlu_telaah.join(', ')}.`);
  }
  const didukung = alasan.length === 0;
  return { didukung, kode: didukung ? 'FULLY_SUPPORTED' : 'NOT_SUPPORTED', alasan, cakupan, acuan };
}
```

`periksaParitasCp()` menutup lubang `elemen_cp` (potret CP di baris ATP); kode
lengkapnya di `kontrak.ts` §9b.

**Why** — `acuanUntuk()` dulu merangkap gerbang, sehingga satu-satunya cara
menutup kombinasi adalah menyembunyikan uraiannya. Sekarang uraian dan keputusan
dipisah: penguraian tetap dapat dibaca dan diuji meskipun layanannya tertutup.

**Test/evidence** — `CASE Q`, `CASE R`, `CASE T`.

## 17. GERBANG DI EDGE FUNCTION — `index.ts`

**BEFORE — VERBATIM**

```ts
  const acuan = acuanUntuk(String(atp.mapel), String(atp.fase));
  if (!acuan) {
    return json({
      error:
        `MiClass belum bisa menyusun ATP untuk ${atp.mapel} Fase ${atp.fase}. ` +
        'Uraian tuntutan Capaian Pembelajaran untuk kombinasi ini belum selesai disusun, ' +
        'dan menyusun ATP tanpanya menghasilkan dokumen yang tidak bisa MiClass pertanggungjawabkan.',
      code: 'ATP_ACUAN_CP_TIDAK_TERSEDIA',
```

**AFTER — VERBATIM**

```ts
  const layanan = statusLayanan(String(atp.mapel), String(atp.fase));
  const acuan = layanan.acuan;
  if (!layanan.didukung) {
    return json({
      error:
        `MiClass belum bisa menyusun ATP untuk ${atp.mapel} Fase ${atp.fase}. ` +
        layanan.alasan.join(' ') +
        ' Menyusun ATP dalam keadaan ini menghasilkan dokumen yang tidak bisa MiClass pertanggungjawabkan.',
      code: 'ATP_ACUAN_CP_TIDAK_TERSEDIA',
      status_layanan: layanan.kode,
      alasan: layanan.alasan,
```

**AFTER — VERBATIM** (gerbang paritas CP, langkah 4b — BARU)

```ts
  if (elemenCp.length) {
    const paritas = periksaParitasCp(elemenCp, acuanUntuk(String(atp.mapel), String(atp.fase)));
    if (!paritas.cocok) {
      return json({
        error:
          `ATP ini disusun dengan teks Capaian Pembelajaran versi sebelumnya. ` +
          `CP yang berlaku sekarang adalah ${VERSI_CP_BERLAKU}, dan ${paritas.masalah.join('; ')}. ` +
          'ATP ini tetap dapat dibaca dan diunduh, tetapi menyusunnya ulang di atas CP lama akan ' +
          'menghasilkan dokumen yang memetakan Capaian Pembelajaran yang sudah tidak berlaku. ' +
          'Mulailah ATP baru untuk kelas ini.',
        code: 'ATP_CP_VERSI_LAMA',
        versi_cp_berlaku: VERSI_CP_BERLAKU,
        masalah: paritas.masalah,
        retryable: false,
      }, 409);
    }
  }
```

**Why** — Edge Function TIDAK pernah membaca `cp-data.json`; ia membaca
`atp_induk.elemen_cp`, potret yang ditulis peramban saat corong dijalankan. ATP
yang dibuat sebelum CP diperbarui membawa teks CP lama di barisnya sendiri, dan
sampai Pass 3 tidak ada satu pun pemeriksaan yang menyadarinya. Kedua gerbang
berdiri sebelum rate limit dan sebelum panggilan AI mana pun.

**Test/evidence** — `CASE R` butir (3), `CASE I` (urutan gerbang vs rate limit).

## 18. GERBANG DI KLIEN — `guru/js/rancang-chat.js`

**BEFORE — VERBATIM**

```js
  function acuanCpUntuk(mapel, fase) {
    const acuan = window._cpAcuan;
    if (!acuan || !acuan.acuan) return null;
    const mapelKey = String(mapel || '').toLowerCase()
      .replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
    const faseKey  = 'fase_' + String(fase || '').toLowerCase().trim();
    const f = acuan.acuan[mapelKey] && acuan.acuan[mapelKey][faseKey];
    if (!f || f.status !== 'tersedia') return false;
    return f;
  }
```

**AFTER — VERBATIM**

```js
  const VERSI_CP_BERLAKU = '046/H/KR/2025';

  function statusLayananCp(mapel, fase) {
    const acuan = window._cpAcuan;
    if (!acuan || !acuan.acuan) return null;
    const mapelKey = String(mapel || '').toLowerCase()
      .replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
    const faseKey  = 'fase_' + String(fase || '').toLowerCase().trim();
    const f = acuan.acuan[mapelKey] && acuan.acuan[mapelKey][faseKey];
    if (!f) return { didukung: false, acuan: null };
    if (f.versi_cp !== VERSI_CP_BERLAKU) return { didukung: false, acuan: f };
    if (f.review_status !== 'diterima') return { didukung: false, acuan: f };
    const elemen = f.elemen || {};
    for (const kunci of Object.keys(elemen)) {
      const daftar = (elemen[kunci] && elemen[kunci].tuntutan) || [];
      for (const t of daftar) if (t.layanan !== 'dilayani') return { didukung: false, acuan: f };
    }
    return { didukung: true, acuan: f };
  }

  function acuanCpUntuk(mapel, fase) {
    const st = statusLayananCp(mapel, fase);
    if (st === null) return null;
    return st.didukung ? st.acuan : false;
  }
```

**Why** — sebelumnya klien hanya membaca satu kata `status` dari berkas acuan;
kata itu bisa benar sementara acuannya berpangkal pada regulasi yang dicabut.
Sekarang klien dan Edge Function memakai aturan yang sama persis.

## 19. UJI

| Uji | Perubahan | BEFORE |
|---|---|---|
| `CASE N` | dibangun ulang terhadap CP 2025: memeriksa `versi_cp` acuan == sumber, `cp_normatif` identik, `status_dekomposisi` sah, `logika` menyebut AND/OR, `layanan` sah, dan cakupan dua arah | versi Pass 2 (terhadap CP 2024) |
| `CASE P`–`CASE U` | baru | `NEW — did not exist` |
| `CASE A` | `assertEquals(WAJIB_BI.length, 7)` → `10`, dengan komentar yang menyebut sebabnya | Pass 2 |
| `CASE I` | `assertEquals(tuntutanWajib(ada).length, 7)` → `10`; komentar "Yang tersedia benar-benar terbuka" diluruskan karena keberadaan uraian dan keputusan layanan kini dua hal berbeda | Pass 2 |
| `CASE O` | `7` yang ditulis tangan diganti `WAJIB_BI.length`, plus penegasan lantai 4 → 5 | Pass 2 |
| `tests/atp-acuan-sinkron.mjs` | `KEPALA` memuat tipe baru (`StatusLayanan`, `sumber_cp`, `status_dekomposisi`, `logika`, `layanan`, `cara_layanan`, `cp_normatif`, `review_status`, `sumber_regulasi`, `ditetapkan`, `mencabut`) | Pass 2 |

Tidak ada satu pun expected test yang dilonggarkan agar hijau. Tiga uji yang
berubah angkanya berubah karena **jumlah tuntutan CP memang berubah** dari 7 ke
10 akibat penguraian ulang, bukan karena ambangnya diturunkan.

## 20. VERSI CACHE

**BEFORE — VERBATIM**

```html
  <script src="js/rancang-chat.js?v=chat-20260910a2"></script>
```

```js
const CACHE_NAME = 'miclass-v25';
```

**AFTER — VERBATIM**

```html
  <script src="js/rancang-chat.js?v=chat-20260910a3"></script>
```

```js
const CACHE_NAME = 'miclass-v26';
```

---

# PASS 4 — CP DECOMPOSITION LOCK

Pass 4 menerapkan keputusan peninjau atas operator logis `(cetak atau digital)`,
lalu memperbaiki lima cacat penguraian yang ditemukan peninjau. Jumlah tuntutan
berubah **10 → 9** sebagai HASIL koreksi, bukan sebagai target.

Diff mentah lengkap tetap di `docs/ATP-FINALIZATION-CHANGE-EVIDENCE.diff`.

## 21. KEPUTUSAN MANUSIA — operator `(cetak atau digital)`

**Requirement / Decision** — Pass 4 §1: `CETAK OR DIGITAL`, bukan
`CETAK AND DIGITAL`. Otoritasnya teks Indonesia Kepka 046/H/KR/2025.

**Exact file path** — `shared/data/cp-acuan.json`
**Function / constant** — `acuan.bahasa_inggris.fase_e.review_catatan`

**BEFORE — VERBATIM**

```json
        "review_status": "pending",
        "review_catatan": "Penguraian ini disusun ulang dari nol terhadap CP 2025 dan BELUM ditinjau manusia. Berkas ini tidak boleh menyatakan diperiksa_oleh: manusia sebelum peninjauan itu benar-benar terjadi.",
```

**AFTER — VERBATIM**

```json
        "review_status": "diterima",
        "review_catatan": "Ditinjau dan diterima 10 September 2026 untuk Bahasa Inggris Fase E pada CP 046/H/KR/2025 SAJA. Termasuk keputusan normatif atas operator logis pada \"berbagai media presentasi (cetak atau digital)\": operatornya OR (cetak ATAU digital), bukan AND. Dasarnya tiga: Kepka adalah otoritas CP di atas Panduan Mata Pelajaran; teks Indonesia Kepka adalah rumusan normatif yang dipakai; dan terjemahan Inggris tidak dapat dipakai menyelesaikan operator logis, sebab pada elemen Membaca-Memirsa pun teks Indonesia menulis \"tertulis atau teks multimodal\" sementara terjemahannya menulis \"written and multimodal texts\". Keputusan ini TIDAK boleh dibalik kembali berdasarkan Panduan. Kombinasi lain tetap belum ditinjau.",
```

**Why** — §12 Pass 3 melarang menyimpan klaim pemeriksaan manusia yang belum
terjadi; peninjauan itu kini benar-benar terjadi, dan alasannya disimpan bersama
hasilnya supaya keputusan yang sama tidak diperdebatkan ulang.

**Test/evidence** — `CASE V`, `CASE Z`.

## 22. STATUS KOMBINASI

**BEFORE — VERBATIM**

```json
        "status": "tertahan",
        "alasan_status": "Satu tuntutan wajib (BIE-E25-MP-2) belum terbukti dapat dilayani MiClass tanpa pekerjaan tambahan guru, dan seluruh penguraian belum diterima peninjau. Gerbang layanan penuh menutup kombinasi ini sampai keduanya selesai.",
```

**AFTER — VERBATIM**

```json
        "status": "tersedia",
        "alasan_status": "Seluruh tuntutan CP dapat dilayani MiClass tanpa pekerjaan tambahan guru, dan penguraiannya sudah ditinjau serta diterima peninjau pada 10 September 2026.",
```

**Test/evidence** — `CASE T`, `CASE Z`.

## 23. BIE-E25-MP-2 — media presentasi

**BEFORE — VERBATIM**

```json
{
  "id": "BIE-E25-MP-2",
  "kompetensi": "menggunakan berbagai media presentasi (cetak atau digital)",
  "lingkup_materi": "penyajian gagasan dan pengalaman yang sudah dikomunikasikan",
  "sumber_cp": "dengan menggunakan berbagai media presentasi (cetak atau digital)",
  "status_dekomposisi": "NEEDS HUMAN REVIEW",
  "logika": "SENGKETA SUMBER, BELUM TERSELESAIKAN. Keputusan Kepala BSKAP 046/H/KR/2025 (Lampiran II, 4.3) menulis \"(cetak atau digital)\" — ALTERNATIF. Panduan Mata Pelajaran Bahasa Inggris terbitan Pusat Kurikulum dan Pembelajaran 2025 (butir 4.3) menulis \"(cetak dan digital)\" — KUMULATIF. Terjemahan Inggris di KEDUA dokumen menulis \"(print and digital)\" — KUMULATIF. Rumusan Fase F di Kepka yang sama menulis \"(cetak dan digital)\", sehingga \"atau\" pada Fase E tidak dapat dianggap pola yang konsisten. Jika ALTERNATIF, jalur cetak sudah memenuhi dan MiClass sanggup. Jika KUMULATIF, media presentasi digital wajib, dan MiClass tidak menghasilkannya. Kedua bacaan mengubah hasil gerbang layanan, karena itu tidak boleh dipilih sepihak.",
  "layanan": "perlu_telaah_manusia",
  "cara_layanan": "Jalur cetak: MiClass menghasilkan dokumen siap cetak — teks presentasi, kartu bicara, lembar sajian, selebaran teks. Jalur digital: MiClass tidak menghasilkan slide, berkas presentasi, maupun sajian berbasis aplikasi, dan tidak ada jalan memenuhinya di dalam batas layanan sekarang."
}
```

**AFTER — VERBATIM**

```json
{
  "id": "BIE-E25-MP-2",
  "kompetensi": "menggunakan berbagai media presentasi",
  "lingkup_materi": "media presentasi cetak atau digital",
  "sumber_cp": "dengan menggunakan berbagai media presentasi (cetak atau digital)",
  "status_dekomposisi": "SAFE DECOMPOSITION",
  "logika": "OR pada kategori media: cetak ATAU digital. Operatornya ditetapkan peninjau pada 10 September 2026 berdasarkan teks Indonesia Keputusan Kepala BSKAP 046/H/KR/2025, yang berkedudukan di atas Panduan Mata Pelajaran; terjemahan Inggris tidak dipakai menyelesaikan operator logis karena pada elemen Membaca-Memirsa pun ia menulis \"and\" untuk \"atau\". Karena alternatif, jalur cetak sendiri sudah memenuhi tuntutan ini secara penuh. AND pada keragaman: \"berbagai\" menuntut lebih dari satu bentuk media di sepanjang fase, dan itu dipenuhi di dalam jalur cetak.",
  "layanan": "dilayani",
  "cara_layanan": "MiClass menempuh jalur cetak, dan menyediakan lebih dari satu bentuk media presentasi berbasis teks sepanjang fase: lembar presentasi, kartu bicara, handout, lembar informasi, formulir, dan selebaran tekstual siap cetak. Bentuk-bentuk itu adalah CARA MiClass melayani, bukan jenis yang CP tuntut. Seluruhnya dihasilkan MiClass dalam keadaan siap cetak; yang tersisa bagi guru hanyalah menggandakannya."
}
```

**Why** — `(cetak atau digital)` dipindahkan dari `kompetensi` ke
`lingkup_materi` karena ia keterangan kategori media, bukan bagian kompetensinya.
`berbagai` TIDAK disusutkan jadi satu jenis dokumen: enam bentuk media cetak
disebut sebagai CARA layanan, dan dinyatakan tegas bahwa keenamnya bukan tuntutan
CP.

**Test/evidence** — `CASE V` (enam bentuk, operator OR, tidak ada beban digital
untuk guru), `CASE U` (tidak ada pekerjaan terselubung).

## 24. BIE-E25-MB-2 dan MB-3 — lingkup dan moda

**BEFORE — VERBATIM**

```json
{
  "id": "BIE-E25-MB-2",
  "kompetensi": "menggunakan bahasa Inggris untuk mengungkapkan pendapat secara lisan",
  "lingkup_materi": "topik yang dibahas di kelas",
  "sumber_cp": "menggunakan bahasa Inggris untuk mengungkapkan pendapat",
  ...
},
{
  "id": "BIE-E25-MB-3",
  "kompetensi": "mempertahankan argumen secara lisan",
  "lingkup_materi": "topik yang dibahas di kelas",
  "sumber_cp": "dan mempertahankan argumen tentang topik yang dibahas.",
  ...
}
```

**AFTER — VERBATIM**

```json
{
  "id": "BIE-E25-MB-2",
  "kompetensi": "menggunakan bahasa Inggris untuk mengungkapkan pendapat",
  "lingkup_materi": "topik yang dibahas",
  "sumber_cp": "menggunakan bahasa Inggris untuk mengungkapkan pendapat dan mempertahankan argumen tentang topik yang dibahas.",
  ...
},
{
  "id": "BIE-E25-MB-3",
  "kompetensi": "mempertahankan argumen",
  "lingkup_materi": "topik yang dibahas",
  "sumber_cp": "menggunakan bahasa Inggris untuk mengungkapkan pendapat dan mempertahankan argumen tentang topik yang dibahas.",
  ...
}
```

**Why** — tiga koreksi. (1) `di kelas` tidak ada di CP; ia keterangan yang
ditambahkan penguraian. (2) `secara lisan` berasal dari judul elemen
Menyimak-Berbicara, bukan dari anak kalimat, sehingga tidak boleh ditulis seolah
bagian rumusan tuntutan — modanya kini dinyatakan di `logika_elemen` dan di
`logika`, keduanya sudah dikirim ke penyusun, sehingga tidak perlu field baru
tanpa konsumen. (3) keduanya kini memakai anak kalimat sumber yang sama, sebab
lingkup "topik yang dibahas" hanya ada di bagian yang dulu dipegang MB-3 saja.

**Test/evidence** — `CASE Y` butir (1), (2), (3), (5); `CASE W` butir (2).

## 25. BIE-E25-MM-1 dan MM-2 — ketertelusuran sumber

**BEFORE — VERBATIM**

```json
  "sumber_cp": "Memahami alur informasi secara keseluruhan,",
```

**AFTER — VERBATIM**

```json
  "sumber_cp": "Memahami alur informasi secara keseluruhan, menganalisis dan menyimpulkan informasi tersurat dan tersirat dari berbagai jenis teks fiksi dan non fiksi tertulis atau teks multimodal tentang topik sehari-hari atau isu terkini.",
```

**Why** — potongan lama hanya menopang verbanya. Genre (fiksi/non fiksi), moda
(tertulis atau multimodal), dan topik semuanya berasal dari kelanjutan kalimat,
sehingga `lingkup_materi` MM-1 tidak dapat dibuktikan berasal dari CP. Kedua
tuntutan kini memakai kalimat utuh yang sama — ketertelusuran didahulukan atas
keunikan potongan.

**Test/evidence** — `CASE W` butir (4).

## 26. BIE-E25-MP-1 — penggabungan MP-3

**BEFORE — VERBATIM** (dua tuntutan terpisah)

```json
{
  "id": "BIE-E25-MP-1",
  "kompetensi": "mengomunikasikan gagasan dan pengalaman secara tertulis atau multimodal",
  "lingkup_materi": "berbagai jenis teks fiksi dan nonfiksi",
  "sumber_cp": "Mengomunikasikan gagasan dan pengalaman mereka secara tertulis atau multimodal dalam berbagai jenis teks fiksi dan nonfiksi",
  ...
},
{
  "id": "BIE-E25-MP-3",
  "kompetensi": "menghasilkan teks yang mencapai tujuan tertentu dengan struktur teks dan unsur kebahasaan yang tepat",
  "lingkup_materi": "teks fiksi dan nonfiksi yang murid hasilkan",
  "sumber_cp": "untuk mencapai tujuan tertentu dengan struktur teks dan unsur kebahasaan yang tepat;",
  "status_dekomposisi": "SAFE DECOMPOSITION",
  "logika": "KUMULATIF terhadap BIE-E25-MP-1: ketepatan tujuan, struktur teks, dan unsur kebahasaan adalah mutu yang wajib, bukan pilihan. Dijadikan tuntutan tersendiri — bukan sekadar kualifikator — karena ia dinilai terpisah dan menjadi pembeda tingkat antarfase.",
  "layanan": "dilayani",
  "cara_layanan": "MiClass menyusun uraian struktur tiap jenis teks, daftar unsur kebahasaannya, contoh yang benar dan yang keliru, serta rubrik penilaiannya."
}
```

**AFTER — VERBATIM** (satu tuntutan; MP-3 dipensiunkan)

```json
{
  "id": "BIE-E25-MP-1",
  "kompetensi": "mengomunikasikan gagasan dan pengalaman secara tertulis atau multimodal untuk mencapai tujuan tertentu dengan struktur teks dan unsur kebahasaan yang tepat",
  "lingkup_materi": "berbagai jenis teks fiksi dan nonfiksi",
  "sumber_cp": "Mengomunikasikan gagasan dan pengalaman mereka secara tertulis atau multimodal dalam berbagai jenis teks fiksi dan nonfiksi dengan menggunakan berbagai media presentasi (cetak atau digital) untuk mencapai tujuan tertentu dengan struktur teks dan unsur kebahasaan yang tepat;",
  "status_dekomposisi": "SAFE DECOMPOSITION",
  "logika": "AND pada objek: gagasan DAN pengalaman. OR pada moda: tertulis ATAU multimodal — jalur tertulis adalah pemenuhan normatif penuh, bukan pemenuhan sebagian. AND pada jenis teks: fiksi DAN nonfiksi. KUMULATIF pada mutu keluaran: tujuan tertentu DAN struktur teks DAN unsur kebahasaan yang tepat — ketiganya syarat atas kegiatan mengomunikasikan, dan digabung ke tuntutan ini karena CP tidak memberi verba tersendiri untuknya.",
  "layanan": "dilayani",
  "cara_layanan": "MiClass menyusun contoh teks, kerangka, rambu penulisan, uraian struktur tiap jenis teks, daftar unsur kebahasaannya, contoh yang benar dan yang keliru, serta rubrik penilaiannya — untuk teks fiksi maupun nonfiksi. Murid menghasilkan teks; tidak ada bahan yang perlu dicari siapa pun."
}
```

**Why** — verba `menghasilkan` tidak ada di CP. Anak kalimat
"untuk mencapai tujuan tertentu dengan struktur teks dan unsur kebahasaan yang
tepat" adalah SYARAT atas kegiatan mengomunikasikan, bukan kompetensi kedua.
Syaratnya tidak hilang saat digabung: ketiganya tetap tertulis di `kompetensi`
dan ditandai KUMULATIF di `logika`. `cara_layanan` MP-3 lama diserap utuh ke
MP-1 sehingga tidak ada cara layanan yang hilang. ID `BIE-E25-MP-3`
**dipensiunkan dan tidak boleh dipakai ulang**; MP-4 dan MP-5 sengaja TIDAK
dinomori ulang supaya perbandingan Pass 3 → Pass 4 tetap tidak ambigu.

**Test/evidence** — `CASE X` butir (1), (2), (3).

## 27. BIE-E25-MP-4 dan MP-5 — moda dan sumber bersama

**BEFORE — VERBATIM**

```json
  "kompetensi": "mengungkapkan pendapat secara tertulis atau melalui penyajian",
  "sumber_cp": "mengungkapkan pendapat",
```
```json
  "kompetensi": "mempertahankan argumen secara tertulis atau melalui penyajian",
  "sumber_cp": "dan mempertahankan argumen tentang topik sehari-hari atau isu terkini.",
```

**AFTER — VERBATIM**

```json
  "kompetensi": "mengungkapkan pendapat",
  "sumber_cp": "mengungkapkan pendapat dan mempertahankan argumen tentang topik sehari-hari atau isu terkini.",
```
```json
  "kompetensi": "mempertahankan argumen",
  "sumber_cp": "mengungkapkan pendapat dan mempertahankan argumen tentang topik sehari-hari atau isu terkini.",
```

**Why** — `secara tertulis atau melalui penyajian` bukan verbatim dari anak
kalimatnya; ia moda yang diwarisi dari elemen Menulis-Mempresentasikan.
Pemecahan atomik tidak menuntut potongan sumber yang unik, sehingga keduanya
memakai anak kalimat yang sama dan lingkup "topik sehari-hari atau isu terkini"
kini tertelusur pada keduanya.

**Test/evidence** — `CASE Y` butir (2), (4), (5); `CASE W` butir (2).

## 28. LOGIKA ELEMEN — pewarisan moda dinyatakan

**BEFORE — VERBATIM**

```json
"logika_elemen": "Dua anak kalimat dipisahkan titik koma dan bersifat KUMULATIF (AND): kemampuan reseptif lisan dan kemampuan produktif lisan sama-sama wajib.",
```

```json
"logika_elemen": "Dua anak kalimat dipisahkan titik koma dan KUMULATIF (AND). Anak kalimat pertama memuat satu kompetensi inti beserta tiga keterangan: moda (ALTERNATIF), media presentasi (SENGKETA — lihat BIE-E25-MP-2), dan mutu teks (KUMULATIF).",
```

**AFTER — VERBATIM**

```json
"logika_elemen": "Dua anak kalimat dipisahkan titik koma dan bersifat KUMULATIF (AND): kemampuan reseptif lisan dan kemampuan produktif lisan sama-sama wajib. MODA yang diwarisi seluruh tuntutan di elemen ini adalah lisan — ia berasal dari judul elemen, bukan dari anak kalimat mana pun, sehingga tidak boleh ditulis seolah bagian rumusan tuntutan.",
```

```json
"logika_elemen": "Dua anak kalimat dipisahkan titik koma dan KUMULATIF (AND). Anak kalimat pertama memuat satu kompetensi komunikasi beserta tiga keterangan: moda (ALTERNATIF: tertulis ATAU multimodal), media presentasi (ALTERNATIF: cetak ATAU digital), dan mutu keluaran (KUMULATIF: tujuan tertentu, struktur teks, unsur kebahasaan). Mutu keluaran adalah SYARAT atas kegiatan mengomunikasikan, bukan kompetensi tersendiri — CP tidak memuat verba lain untuknya. Moda tertulis atau penyajian yang diwarisi tuntutan di elemen ini berasal dari judul elemen, bukan dari anak kalimat mana pun.",
```

**Why** — pewarisan moda dinyatakan di tempat yang memang sudah dikirim ke
penyusun, sehingga sistem tetap mengetahui modanya tanpa field baru yang tidak
punya konsumen.

**Test/evidence** — `CASE Y` butir (3).

## 29. CATATAN BERKAS — sumber boleh dipakai bersama

**BEFORE — VERBATIM** (potongan `catatan` teratas)

```
… dan gabungan seluruh sumber_cp satu elemen wajib menutupi cp_normatif itu (CASE N). SALINAN EDGE FUNCTION: …
```

**AFTER — VERBATIM**

```
… dan gabungan seluruh sumber_cp satu elemen wajib menutupi cp_normatif itu (CASE N). SATU ANAK KALIMAT BOLEH MENOPANG LEBIH DARI SATU TUNTUTAN — ketertelusuran lebih penting daripada keunikan potongan (CASE W). SALINAN EDGE FUNCTION: …
```

## 30. UJI

| Uji | Perubahan | BEFORE |
|---|---|---|
| `CASE V`–`CASE Z` | baru | `NEW — did not exist` |
| `CASE N` | jumlah tuntutan tidak lagi ditulis tangan; kini `assertEquals(diperiksa, terpasang)` yang dihitung dari acuan, plus komentar bahwa cakupan diukur pada GABUNGAN sumber sehingga potongan boleh dipakai bersama | `assert(diperiksa >= 10, …)` |
| `CASE A` | `assertEquals(WAJIB_BI.length, 10)` → `9`, dengan komentar bahwa jumlah adalah HASIL penguraian | Pass 3 |
| `CASE I` | `assertEquals(tuntutanWajib(ada).length, 10)` → `9` | Pass 3 |
| `CASE O` | `assertEquals(WAJIB_BI.length, 10)` → `9`; lantai tidak lagi ditulis `5` melainkan dihitung `Math.max(MIN_TP_PER_FASE, Math.ceil(WAJIB_BI.length / 2))` | Pass 3 |
| `CASE T` | keadaan nyata dibalik: `NOT_SUPPORTED` → `FULLY_SUPPORTED`, dengan penegasan bahwa gerbangnya masih menutup pada fixture yang satu tuntutannya tak terlayani | Pass 3 |

**BEFORE — VERBATIM** (`CASE T`, bagian keadaan nyata)

```ts
  // Keadaan nyata: Bahasa Inggris Fase E TERTUTUP, dan sebabnya disebut.
  const st = statusLayanan('Bahasa Inggris', 'E');
  assertEquals(st.kode, 'NOT_SUPPORTED');
  assertEquals(st.didukung, false);
  assert(st.alasan.length > 0);
  assert(st.cakupan.perlu_telaah.includes('BIE-E25-MP-2'),
    'tuntutan media presentasi seharusnya berstatus perlu telaah manusia');
```

**AFTER — VERBATIM**

```ts
  // Keadaan nyata sesudah keputusan peninjau 10 September 2026: Bahasa Inggris
  // Fase E TERBUKA, dan terbuka karena SELURUH tuntutannya terlayani — bukan
  // karena gerbangnya dilonggarkan. Fixture di atas membuktikan gerbangnya
  // masih menutup begitu satu tuntutan saja tidak terlayani.
  const st = statusLayanan('Bahasa Inggris', 'E');
  assertEquals(st.kode, 'FULLY_SUPPORTED');
  assertEquals(st.didukung, true);
  assertEquals(st.alasan, []);
  assertEquals(st.cakupan.tidak_dilayani, []);
  assertEquals(st.cakupan.perlu_telaah, []);
  assertEquals(st.cakupan.dilayani.length, st.cakupan.wajib.length);
```

Tidak ada assertion yang dilemahkan. `CASE T` justru bertambah lima assertion,
dan fixture yang membuktikan gerbang masih menutup dipertahankan utuh.

## 31. TIDAK DIUBAH DI PASS 4

`hitungTargetTp()`, kontrak judul TP (`TARGET_KATA_JUDUL` 12 / `MAKS_KATA_JUDUL`
16), delegasi A17/A19 beserta D1–D5, `periksaParitasCp()`, `cp-data.json`,
`cp-data.meta.json`, seluruh berkas klien, `sw.js`, dan `guru/classroom.html`.
Versi cache tidak dinaikkan lagi karena Pass 4 tidak menyentuh satu pun berkas
JS; kenaikan `chat-20260910a3` / `miclass-v26` dari Pass 3 belum di-deploy dan
sudah mencakup perubahan ini.
