# MICLASS — ATP ACCEPTANCE CORRECTION REPORT

Pass 2. Tidak di-deploy, tidak di-push, tidak di-commit, tidak menyentuh
production DB. Tidak ada pekerjaan Modul Ajar maupun Naskah Fasilitasi.

---

## A. Baseline Pass 2

| | |
|---|---|
| HEAD | `e3323b5` |
| Keadaan awal | seluruh perubahan Pass 1 di working tree, 22 uji hijau |
| Perintah baseline | `deno test --allow-read tests/atp-kontrak.test.ts` → 22 passed; `node tests/atp-acuan-sinkron.mjs` → LULUS; `node tests/atp-trace.mjs --periksa` → LULUS |

Yang dinyatakan reviewer sudah benar secara arah **tidak dibongkar**: flow A1–A20
+ A15a, pemisahan pertanyaan/data/keputusan, context builder manusia, perhitungan
waktu di server, pembagian semester, pemisahan fakta/keputusan/asumsi, gerbang CP
sebelum kuota, kontrak `atp-1.0.0`, validator struktur/waktu/sumber daya,
renderer review + DOCX, kompatibilitas ATP lama, dan `generate-modul` yang tidak
disentuh.

Empat gerbang Pass 2 dikerjakan seluruhnya. **Empat menghasilkan perubahan kode**,
dan dua di antaranya menemukan cacat yang belum pernah dilaporkan
(§F.2 dan §F.3).

---

## B. CP Acuan Human Review Table

Sumber normatif: `shared/data/cp-data.json` → `bahasa_inggris.fase_e.elemen[].cp_normatif`
(Kepmendikbudristek 032/H/KR/2024). Kolom **Potongan CP normatif sumber** disalin
verbatim dari sana.

### B.1 Tabel review (keadaan Pass 1, sebelum koreksi)

| ID | Elemen CP | Teks tuntutan (Pass 1) | Potongan CP normatif sumber | Jenis kemampuan | Lingkup materi (Pass 1) | Transformasi yang dilakukan |
|---|---|---|---|---|---|---|
| BIE-MB-1 | Menyimak - Berbicara | berkomunikasi lisan dengan guru, teman sebaya, dan orang lain dalam berbagai situasi | "Peserta didik menggunakan bahasa Inggris untuk berkomunikasi dengan guru, teman sebaya dan orang lain dalam berbagai macam situasi." | produktif–interaktif lisan | percakapan situasional, sapaan, permintaan, dan tanggapan | memecah kalimat majemuk (kalimat 1 dari 3) **+ menambahkan jenis percakapan yang tidak ada di CP** |
| BIE-MB-2 | Menyimak - Berbicara | memahami alur informasi, gagasan utama, dan detail dalam teks lisan fiksi dan non-fiksi | "Peserta didik memahami alur informasi secara keseluruhan, gagasan utama dan detail dalam teks lisan fiksi dan non-fiksi mengenai berbagai macam topik yang relevan dengan topik sehari-hari atau isu terkini." | reseptif lisan | naskah simakan yang dibacakan guru mengenai topik sehari-hari atau isu terkini | memecah (kalimat 2) **+ mengganti lingkup materi dengan CARA PENYAJIAN** |
| BIE-MB-3 | Menyimak - Berbicara | mengungkapkan pendapat dan mempertahankan argumen tentang topik yang dibahas | "Peserta didik menggunakan bahasa Inggris untuk mengungkapkan pendapat dan mempertahankan argumen tentang topik yang dibahas." | produktif lisan argumentatif | diskusi terpandu dan bermain peran tanpa properti | memecah (kalimat 3) **+ menambahkan "bermain peran" yang tidak ada di CP** |
| BIE-MM-1 | Membaca - Memirsa | membaca dan merespons berbagai jenis teks | "Peserta didik membaca dan merespon berbagai macam teks seperti narasi, deskripsi, prosedur, eksposisi, recount, dan report untuk pembelajaran dan pencarian informasi." | reseptif tulis | narasi, deskripsi, prosedur, eksposisi, recount, dan report | memecah (kalimat 1) **+ membuang klausa tujuan "untuk pembelajaran dan pencarian informasi"** |
| BIE-MM-2 | Membaca - Memirsa | menganalisis dan menginterpretasi informasi eksplisit dan implisit | "Peserta didik menganalisis dan menginterpretasi informasi eksplisit dan implisit dalam teks fiksi dan non-fiksi dari teks tulis dan multimodal tentang topik sehari-hari atau isu terkini." | reseptif–analitis | teks tulis fiksi dan non-fiksi, termasuk teks bertata-letak seperti formulir, tabel, dan daftar | memecah (kalimat 2) **+ mengganti "multimodal" dengan tafsiran layanan + membuang batasan topik** |
| BIE-MP-1 | Menulis - Mempresentasikan | menulis berbagai jenis teks fiksi dan non-fiksi melalui aktivitas terpandu | "Peserta didik menulis berbagai jenis teks fiksi dan non-fiksi, melalui aktivitas yang dipandu," | produktif tulis | kerangka, draf, dan revisi teks | memecah kalimat tunggal (paruh 1) **+ menambahkan tahapan proses menulis yang tidak ada di CP** |
| BIE-MP-2 | Menulis - Mempresentasikan | menyajikan gagasan dengan struktur dan unsur kebahasaan yang sesuai tujuan dan konteks komunikatif | "menggunakan beragam media untuk berkomunikasi dan menyajikan gagasan dengan struktur dan unsur kebahasaan yang sesuai dengan tujuan dan konteks komunikatif." | produktif–presentatif | penyampaian lisan tanpa slide dan penyajian tertulis | memecah kalimat tunggal (paruh 2) **+ "beragam media" hilang tanpa dinyatakan** |

### B.2 Audit lima pertanyaan, per tuntutan

Status yang dipakai hanya: `EXACT / SAFE DECOMPOSITION / NEEDS REVIEW / INVALID`.

| ID | 1. Kompetensinya ada di CP? | 2. Tingkat kemampuan sama? | 3. Lingkup materi sama? | 4. Ada kompetensi baru? | 5. Ada bagian CP yang hilang? | STATUS (Pass 1) |
|---|---|---|---|---|---|---|
| BIE-MB-1 | ya | ya | **tidak** — "sapaan, permintaan, tanggapan" tidak ada di CP | tidak | tidak | **NEEDS REVIEW** |
| BIE-MB-2 | ya | ya | **tidak** — lingkupnya diganti cara penyajian; "berbagai macam topik" menyusut jadi "naskah simakan" | tidak | ya — keluasan jenis teks lisan | **NEEDS REVIEW** |
| BIE-MB-3 | ya | ya | **tidak** — "bermain peran" adalah metode, bukan lingkup CP | **ya** — bermain peran adalah tuntutan tambahan | tidak | **NEEDS REVIEW** |
| BIE-MM-1 | ya | ya | ya | tidak | **ya** — klausa tujuan "untuk pembelajaran dan pencarian informasi" | **NEEDS REVIEW** |
| BIE-MM-2 | ya | ya | **tidak** — "multimodal" diganti "teks bertata-letak"; "topik sehari-hari atau isu terkini" hilang | tidak | **ya** — sisi multimodal dan batasan topik | **NEEDS REVIEW** |
| BIE-MP-1 | ya | ya | **tidak** — "kerangka, draf, revisi" tidak ada di CP | **ya** — proses menulis tiga tahap | tidak | **NEEDS REVIEW** |
| BIE-MP-2 | ya | ya | **tidak** — "beragam media" diganti daftar media yang MiClass layani | tidak | **ya** — ragam media, dan penyempitannya tidak dinyatakan sebagai penyempitan | **NEEDS REVIEW** |

**Tidak ada satu pun yang berstatus `SAFE DECOMPOSITION` di Pass 1.** Pemecahan
kalimatnya memang aman — batas kalimat CP dipakai apa adanya — tetapi setiap
tuntutan disertai lingkup materi yang bukan berasal dari CP. Polanya seragam dan
karena itu bukan kebetulan: kolom `lingkup_materi` dipakai untuk menuliskan
**bagaimana MiClass akan melayaninya**, bukan **apa yang CP tuntut**. Dua hal itu
lalu tidak bisa dibedakan lagi oleh siapa pun yang membacanya — termasuk oleh
penyusun ATP, yang menerimanya sebagai lingkup materi resmi.

### B.3 BEFORE → AFTER dan alasan semantiknya

Semua BEFORE/AFTER verbatim ada di `docs/ATP-FINALIZATION-CHANGE-EVIDENCE.md` §7.2.
Alasan semantiknya:

| ID | Perubahan | Alasan |
|---|---|---|
| BIE-MB-1 | lingkup: "percakapan situasional, sapaan, permintaan, dan tanggapan" → **"berbagai macam situasi komunikasi lisan"** | CP tidak menyebut jenis tindak tuturnya. Menuliskannya membuat ATP terlihat wajib menyusun TP sapaan/permintaan/tanggapan; itu keputusan guru, bukan tuntutan CP. |
| BIE-MB-2 | lingkup: "naskah simakan yang dibacakan guru…" → **"berbagai macam topik yang relevan dengan topik sehari-hari atau isu terkini"**; cara penyajian pindah ke `catatan_layanan` dan dinyatakan sebagai CARA, bukan penyempitan | Cara MiClass menghadirkan bunyi tidak boleh menggantikan lingkup materi CP. Setelah dipisah, keluasan jenis dan topik teks lisan kembali utuh. |
| BIE-MB-3 | lingkup: "diskusi terpandu dan bermain peran tanpa properti" → **"topik yang dibahas"**; bentuk pelaksanaan pindah ke `catatan_layanan` | "Bermain peran" adalah kompetensi tambahan yang CP tidak minta. Ia sekarang disebut sebagai salah satu bentuk pelaksanaan, bukan sebagai tuntutan. |
| BIE-MM-1 | kompetensi: ditambah **"untuk pembelajaran dan pencarian informasi"** | Klausa tujuan menentukan jenis respons yang dituntut. Membuangnya menyisakan "merespon" tanpa arah. |
| BIE-MM-2 | lingkup: → **"teks tulis dan multimodal tentang topik sehari-hari atau isu terkini"**; `cakupan_teks: "sebagian"`; `catatan_layanan` menyatakan apa yang berkurang | Ini penyempitan layanan yang nyata, bukan cara penyajian. Sekarang ia **dinyatakan**: guru yang ingin memenuhi sisi visual CP tahu ia harus menambahkannya sendiri, dan MiClass dilarang mencatatnya sebagai sudah terpenuhi. |
| BIE-MP-1 | lingkup: "kerangka, draf, dan revisi teks" → **"berbagai jenis teks fiksi dan non-fiksi"** | Proses tiga tahap adalah metode. CP hanya menuntut "aktivitas yang dipandu". |
| BIE-MP-2 | lingkup: → **"beragam media untuk berkomunikasi dan menyajikan gagasan"**; `cakupan_teks: "sebagian"` + catatan | "Beragam media" dulu lenyap tanpa jejak. Sekarang ia ada di lingkup, dan pengurangannya dinyatakan terbuka. |

**Status setelah koreksi:** ketujuhnya `SAFE DECOMPOSITION`, dengan dua di
antaranya (BIE-MM-2, BIE-MP-2) membawa `cakupan_teks: "sebagian"` — pemecahan
tetap sah, tetapi layanannya tidak penuh dan itu tercatat di data, bukan hanya di
dokumen.

> **Yang TIDAK diklaim.** Bahwa `sumber_cp` verbatim dan cakupannya utuh dapat
> dibuktikan mesin, dan sudah dibuktikan (CASE N). Bahwa tujuh adalah jumlah
> pemecahan yang **tepat** — bukan enam, bukan sepuluh — adalah penilaian
> kurikulum dan menunggu reviewer. Kolom `diperiksa_oleh: "manusia"` di acuan
> tidak boleh dibaca sebagai klaim bahwa langkah itu sudah terjadi.

---

## C. CP Two-Way Coverage

Dibuktikan mesin di `CASE N: penguraian CP dapat ditelusuri dua arah`, terhadap
`shared/data/cp-data.json` — bukan terhadap salinan di dalam acuan.

**Arah 1 — setiap tuntutan berasal dari CP.**
Setiap tuntutan wajib punya `sumber_cp`, dan `cp_normatif.includes(sumber_cp)`
harus benar. Tuntutan tanpa sumber = uji gagal.

**Arah 2 — setiap bagian CP terwakili.**
Setiap kata isi (≥4 huruf) di `cp_normatif` wajib muncul di gabungan seluruh
`sumber_cp` elemen itu. Satu anak kalimat yang diam-diam tidak diklaim langsung
menggagalkan uji. Ini yang menangkap "beragam media" — di Pass 1 ia tidak ada di
satu pun tuntutan.

### C.1 Peta pengubinan

| Elemen | cp_normatif | Dibagi | Sisa yang tidak diklaim |
|---|---|---|---|
| Menyimak - Berbicara | 3 kalimat | MB-1 = kalimat 1, MB-2 = kalimat 2, MB-3 = kalimat 3 | nol |
| Membaca - Memirsa | 2 kalimat | MM-1 = kalimat 1, MM-2 = kalimat 2 | nol |
| Menulis - Mempresentasikan | 1 kalimat | MP-1 = "Peserta didik menulis … melalui aktivitas yang dipandu,"; MP-2 = "menggunakan beragam media … konteks komunikatif." | nol — keduanya bersambung persis |

### C.2 Yang sengaja TIDAK dijadikan sumber

`cp_umum` Fase E menyebut "teks lisan, tulisan, dan visual" dan "membuat teks
tulisan dan visual yang beragam". Ia **tidak** dipakai sebagai sumber tuntutan,
dan itu keputusan: yang normatif per elemen adalah `cp_normatif`, dan menambahkan
tuntutan dari ringkasan umum akan menghasilkan tuntutan yang tidak punya elemen
tempat bernaung. Konsekuensinya perlu diketahui reviewer: **sisi "visual" pada
ringkasan CP tidak dilayani MiClass**, dan itu kini terbaca dari
`cakupan_teks: "sebagian"` di BIE-MM-2 dan BIE-MP-2, bukan dari ketiadaan.

---

## D. Delegation — Before vs After

| | Pass 1 | Pass 2 |
|---|---|---|
| A3 bahasa pengantar | kode | **kode** (tidak berubah) |
| A15 penempatan penguatan | kode | **kode** (tidak berubah) |
| A17 konteks tugas | kode → **selalu `seimbang`** | **penyusun**, enum allowlist + alasan + dasar, divalidasi server |
| A19 metode pengurutan | kode → `hierarki` bila kesiapan rendah, selain itu `scaffolding` (2 dari 6 opsi pernah terpilih) | **penyusun**, 6 opsi terbuka, struktur CP ditimbang lebih dulu |
| Panggilan AI tambahan | — | **tidak ada** — keputusan diambil di panggilan penyusunan yang sudah ada |
| Aritmetika | kode | **kode** (tidak berpindah satu baris pun) |
| Bentuk keluaran | array TP | array TP **atau** `{keputusan_didelegasikan, tp}` — keduanya sah |
| Pemeriksaan | — | D1–D5 (§H) |
| Terlihat guru | layar + DOCX | layar + DOCX, **ditambah baris "Ditimbang dari:"** |
| Repair prompt | galat validator | galat validator **+ allowlist enum + daftar dasar yang sah** |

Cacat yang diperbaiki, dengan kalimatnya sendiri dari Pass 1:

```ts
    konteks = catat('Konteks contoh dan tugas', kosong, 'seimbang',
      'Seimbang antara kehidupan sehari-hari dan situasi kerja',
      'Tanpa arahan guru, porsi seimbang menjaga konteks kejuruan tetap menjadi arena penerapan dan tidak menggeser kompetensi mata pelajaran.');
```

`'seimbang'` adalah literal. Tidak ada satu pun masukan yang dapat mengubahnya.
Alasannya berbunyi seperti pertimbangan, tetapi tidak ada yang dipertimbangkan —
dan alasan itulah yang dicetak ke ATP yang guru arsipkan.

---

## E. Deterministic vs Semantic Decisions

### E.1 Tetap deterministik, beserta alasannya

| Keputusan | Aturan penuh | Mengapa tidak butuh interpretasi semantik |
|---|---|---|
| Seluruh perhitungan waktu (`hitungAlokasi`) | §5 `kontrak.ts` | Aritmetika. Menyerahkannya ke AI adalah kelas cacat yang sudah dibayar mahal. |
| Batas jumlah TP (`hitungTargetTp`) | §F | Kebijakan beban kerja + struktur CP. Heuristic, tetapi tidak menuntut pembacaan makna CP — hanya **jumlah** tuntutan, bukan artinya. |
| Larangan sumber daya (`POLA_BAHAN_TERLARANG`) | §11 `kontrak.ts` | Kecocokan leksikal terhadap daftar tertutup, dikalibrasi ke 21 judul TP produksi dengan nol salah tuduh. |
| **A15 — kapan kemampuan dasar dikuatkan** | `jauh_di_bawah → kombinasi`; `sesuai → tidak_perlu`; selain itu `terintegrasi` | Yang dipilih adalah PENEMPATAN, dan penempatan hanya bergantung pada satu variabel yang guru jawab sendiri (A13, tingkat kemampuan awal). Opsinya membentuk tangga yang searah dengan variabel itu: makin jauh murid dari titik awal fase, makin awal dan makin berulang penguatannya. Tidak ada tuntutan CP yang perlu dibaca untuk sampai ke sana. |
| **A3 — bahasa pengantar** | `sesuai → campur`; selain itu `indonesia_dominan` | Bentuknya sama: satu variabel, tangga searah. Batas yang dijaga adalah risiko murid kehilangan ISI pelajaran karena bahasanya, dan risiko itu naik persis seiring jarak murid dari titik awal fase. |

### E.2 Menjadi semantik

| Keputusan | Mengapa tidak dapat diturunkan tanpa membaca makna CP |
|---|---|
| **A17 — konteks contoh dan tugas** | Menuntut penilaian apakah program keahlian kelas ini benar-benar memuat situasi yang MENUNTUT kompetensi tiap tuntutan, atau kaitannya dipaksakan. "Bahasa Inggris untuk Busana" dan "Bahasa Inggris untuk Perhotelan" tidak punya kepadatan situasi kerja yang sama untuk tuntutan yang sama, dan tidak ada variabel tunggal yang menyatakannya. |
| **A19 — metode pengurutan** | Menuntut pembacaan STRUKTUR: apakah tuntutan CP membentuk prosedur berurutan, berjenjang sebagai prasyarat, atau sejajar tanpa urutan wajib. Kesiapan murid menentukan seberapa landai tangganya — bukan bentuk tangganya. CP yang berupa prosedur berurutan tetap berurutan meskipun muridnya siap. |

### E.3 Batas yang dijaga

- Tidak ada aritmetika yang berpindah ke AI.
- Tidak ada panggilan AI tambahan; delegasi menumpang panggilan penyusunan yang
  memang sudah ada. (Pelajaran `3f477f8`: dua penyusunan AI dalam satu panggilan
  Edge Function mencapai 240 detik — itulah sebabnya yang ditambahkan di sini
  adalah **isi keluaran**, bukan **panggilan baru**.)
- Guru yang menjawab sendiri A17/A19 tidak pernah melihat perubahan apa pun:
  `terbuka` kosong, bentuk keluarannya tetap array telanjang, dan keputusan model
  apa pun ditolak D1.

---

## F. `hitungTargetTp()` Verbatim + Decision Table

### F.1 Implementasi Pass 1 — VERBATIM, sebelum diubah

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

### F.2 Audit — dua cacat, keduanya baru ketahuan di Pass 2

**Cacat 1 — batas atas adalah jumlah pertemuan.**
`maks = floor(jumlah_pertemuan)` berarti guru boleh meminta **satu TP per
pertemuan**. Pada fixture bawaan uji (140 JP operasional, satuan 2 JP → 70
pertemuan), `hitungTargetTp(..., 999)` mengembalikan **70**. Uji Pass 1 bahkan
menegaskannya sebagai perilaku yang benar:

```ts
  // Permintaan guru tidak boleh melampaui jumlah pertemuan yang ada — meminta
  // 40 TP dari 32 pertemuan adalah perintah yang mustahil dipenuhi.
  const banyak = hitungTargetTp(a, 'sedikit_di_bawah', WAJIB_BI.length, 999);
  assertEquals(banyak.target, Math.floor(a.jumlah_pertemuan));
```

Komentarnya menyebut permintaan seperti itu mustahil; assertion di bawahnya
menerimanya. Yang dijaga hanyalah kemustahilan **aritmetika**, bukan kemustahilan
**pekerjaan**: 70 Modul Ajar dalam satu fase lolos tanpa satu pun keberatan.

**Cacat 2 — kepadatan dihitung dari PERTEMUAN, bukan dari JAM.**
Dua kelas dengan jam mengajar sama persis dinilai berbeda hanya karena panjang
pertemuannya berbeda:

| | 4 JP/minggu, satu pertemuan | 4 JP/minggu, dua pertemuan @2 JP |
|---|---|---|
| jp_operasional | 140 | 140 |
| jumlah_pertemuan | 35 | 70 |
| Target TP (Pass 1, `sesuai`) | 18 | 35 |

Panjang satu pertemuan adalah urusan jadwal sekolah. Ia bukan ukuran seberapa
besar satu tujuan pembelajaran, dan tidak boleh menggandakan beban kerja setahun.

**Pernyataan status.** Formula ini **HEURISTIC PRODUK**, dan sekarang disebut
begitu di kodenya sendiri. Tidak ada rumus benar untuk "berapa TP yang pantas
untuk 124 JP"; yang ada hanya pilihan yang dapat dijelaskan, dibatasi di kedua
ujung, dan diuji di batasnya. Laporan Pass 1 tidak menyebutnya heuristic, dan itu
diperbaiki.

### F.3 Implementasi Pass 2 — VERBATIM, yang berlaku sekarang

```ts
export const JP_PER_TP: Record<string, number> = {
  sesuai:           10,
  sedikit_di_bawah: 12,
  belum_diketahui:  12,
  sangat_beragam:   14,
  jauh_di_bawah:    14,
};

export const MIN_PERTEMUAN_PER_TP = 2;
export const MAKS_TP_PER_FASE = 16;
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

### F.4 Uraian yang diminta reviewer

| | |
|---|---|
| **Input** | `alokasi.jp_operasional`, `alokasi.jumlah_pertemuan`, `kesiapan` (A13), `jumlahTuntutan` (dari acuan CP), `permintaanGuru` (opsional, A20) |
| **Formula** | `target = clamp(round(jp_operasional / JP_PER_TP[kesiapan]), min, maks)` |
| **floor/ceil/round** | `floor` pada `jumlah_pertemuan` dan pada `pertemuan / MIN_PERTEMUAN_PER_TP` (batas atas tidak boleh dibulatkan ke atas); `ceil` pada `jumlahTuntutan / 2` (batas bawah tidak boleh dibulatkan ke bawah); `round` pada hasil bagi (pembulatan terdekat, bukan bias ke satu arah) |
| **Minimum** | `min(max(3, ceil(jumlahTuntutan/2)), maks)`. Untuk 7 tuntutan Bahasa Inggris Fase E: **4**. Klausa `min(..., maks)` mencegah batas bawah melampaui batas atas pada anggaran yang sangat kecil. |
| **Maksimum** | `max(3, min(floor(pertemuan/2), 16))` — dua pembatas: satu TP tidak boleh lebih pendek dari 2 pertemuan, dan satu fase tidak boleh melebihi 16 Modul Ajar |
| **Efek tiap readiness** | `sesuai` 10 JP/TP · `sedikit_di_bawah` 12 · `belum_diketahui` 12 · `sangat_beragam` 14 · `jauh_di_bawah` 14. Kesiapan lebih rendah = TP lebih **sedikit** dan lebih **lapang**. |
| **Hubungan dengan `jp_per_pertemuan`** | **Tidak ada lagi pada hitungan kepadatan** — itu koreksi Pass 2. Ia hanya masuk lewat batas atas `pertemuan / MIN_PERTEMUAN_PER_TP`, yang menjaga TP tidak menyusut jadi rencana satu jam. |
| **Hubungan dengan jumlah tuntutan CP** | Menentukan BATAS BAWAH. Setengah dari jumlah tuntutan, dibulatkan ke atas: dua tuntutan yang sejalan boleh dilayani satu TP; tiga atau lebih sudah bukan satu tujuan. |
| **Hubungan dengan anggaran semester** | Tidak langsung. Anggaran semester ditegakkan validator (W7/W8) atas jp_alokasi, bukan atas jumlah TP. |
| **Alasan pedagogis tiap konstanta** | `JP_PER_TP` 10–14: rentangnya memuat empat ATP produksi yang nyata (8–17 JP/TP). `MIN_PERTEMUAN_PER_TP = 2`: TP satu pertemuan adalah rencana satu jam, bukan tujuan pembelajaran. `MAKS_TP_PER_FASE = 16`: batas beban kerja, dan angkanya diambil dari ATP produksi terpadat yang ada (128 JP → 16 TP) — bukan dikarang. `MIN_TP_PER_FASE = 3`: lantai mutlak satu fase penuh. |

### F.5 Matriks keputusan

Dibangkitkan dengan menjalankan `hitungTargetTp()` yang benar-benar terpasang.
Jumlah tuntutan CP = 7 (Bahasa Inggris Fase E).

| JP tersedia | Satuan | Pertemuan | Readiness | Tuntutan CP | min | maks | Target TP | JP/TP nyata |
|---:|---:|---:|---|---:|---:|---:|---:|---:|
| 48 | 4 | 12 | sesuai | 7 | 4 | 6 | **5** | 9,6 |
| 48 | 4 | 12 | sedikit_di_bawah | 7 | 4 | 6 | **4** | 12,0 |
| 48 | 4 | 12 | belum_diketahui | 7 | 4 | 6 | **4** | 12,0 |
| 48 | 4 | 12 | sangat_beragam | 7 | 4 | 6 | **4** | 12,0 |
| 48 | 4 | 12 | jauh_di_bawah | 7 | 4 | 6 | **4** | 12,0 |
| 72 | 4 | 18 | sesuai | 7 | 4 | 9 | **7** | 10,3 |
| 72 | 4 | 18 | sedikit_di_bawah | 7 | 4 | 9 | **6** | 12,0 |
| 72 | 4 | 18 | belum_diketahui | 7 | 4 | 9 | **6** | 12,0 |
| 72 | 4 | 18 | sangat_beragam | 7 | 4 | 9 | **5** | 14,4 |
| 72 | 4 | 18 | jauh_di_bawah | 7 | 4 | 9 | **5** | 14,4 |
| 108 | 4 | 27 | sesuai | 7 | 4 | 13 | **11** | 9,8 |
| 108 | 4 | 27 | sedikit_di_bawah | 7 | 4 | 13 | **9** | 12,0 |
| 108 | 4 | 27 | belum_diketahui | 7 | 4 | 13 | **9** | 12,0 |
| 108 | 4 | 27 | sangat_beragam | 7 | 4 | 13 | **8** | 13,5 |
| 108 | 4 | 27 | jauh_di_bawah | 7 | 4 | 13 | **8** | 13,5 |
| 126 | 2 | 63 | sesuai | 7 | 4 | 16 | **13** | 9,7 |
| 126 | 2 | 63 | sedikit_di_bawah | 7 | 4 | 16 | **11** | 11,5 |
| 126 | 2 | 63 | belum_diketahui | 7 | 4 | 16 | **11** | 11,5 |
| 126 | 2 | 63 | sangat_beragam | 7 | 4 | 16 | **9** | 14,0 |
| 126 | 2 | 63 | jauh_di_bawah | 7 | 4 | 16 | **9** | 14,0 |
| 144 | 4 | 36 | sesuai | 7 | 4 | 16 | **14** | 10,3 |
| 144 | 4 | 36 | sedikit_di_bawah | 7 | 4 | 16 | **12** | 12,0 |
| 144 | 4 | 36 | belum_diketahui | 7 | 4 | 16 | **12** | 12,0 |
| 144 | 4 | 36 | sangat_beragam | 7 | 4 | 16 | **10** | 14,4 |
| 144 | 4 | 36 | jauh_di_bawah | 7 | 4 | 16 | **10** | 14,4 |

Kasus batas:

| Kasus | Target |
|---|---|
| 16 JP, `sesuai`, 7 tuntutan | 3 (min 3, maks 3) — batas atas mengalahkan lantai CP, dan itu benar: 4 pertemuan tidak bisa memuat 4 TP |
| 24 JP, `jauh_di_bawah`, 7 tuntutan | 3 (min 3, maks 3) |
| 48 JP, `sesuai`, 2 tuntutan | 5 (min 3, maks 6) — lantai CP turun mengikuti struktur CP |
| 48 JP, `sesuai`, 12 tuntutan | 6 (min 6, maks 6) — lantai CP naik dan mengalahkan hitungan jam |
| 400 JP, `sesuai`, 7 tuntutan | 16 (maks 16) — kelinearan terhadap jam terputus di sini |
| 400 JP, `jauh_di_bawah`, 7 tuntutan | 16 |

Prinsip reviewer, diperiksa terhadap tabel di atas:

- **"lebih lemah = otomatis lebih banyak TP"** — tidak berlaku. Arahnya justru
  sebaliknya, dan alasannya dinyatakan: kesiapan rendah menuntut langkah yang
  lebih lapang menuju kompetensi yang sama.
- **"lebih banyak JP = linear lebih banyak TP"** — berlaku di antara kedua batas,
  dan **putus** di `MAKS_TP_PER_FASE`. Di atas titik itu jam tambahan menambah
  kelapangan tiap TP, bukan jumlah TP. Diuji sampai 400 JP.
- **Batas bawah dipengaruhi jumlah/struktur tuntutan CP** — ya, dan diuji: 2
  tuntutan → min 3, 12 tuntutan → min 6.

### F.6 Toleransi ±1

Dipertahankan. Setelah formula dikunci di kedua ujung, selisih satu TP tidak lagi
bisa menyembunyikan keputusan beban kerja yang berbeda: pada 144 JP, satu TP
selisih menggeser JP/TP dari 10,3 ke 11,1. Menolak seluruh ATP untuk selisih
sebesar itu membakar satu dari tiga jatah harian guru. Dua TP ke atas tetap
ditolak (K1).

---

## G. TP Title Soft/Hard Contract

Kontrak sekarang eksplisit, dan kedua angka dinyatakan sebagai kontrak:

```
SOFT TARGET  <= 12 kata   (TARGET_KATA_JUDUL)
HARD MAXIMUM  = 16 kata   (MAKS_KATA_JUDUL)
```

- **Dasar 12** adalah keterbacaan guru: judul TP dibaca sekilas di daftar,
  dicetak di ATP, dan dipakai sebagai nama Modul Ajar.
- **Dasar 16 BUKAN keluaran lama.** Komentar Pass 1 membenarkannya sebagai "ruang
  toleransi" tanpa menyatakan sasarannya sebagai kontrak; komentar Pass 2
  menyebut secara eksplisit bahwa ATP lama yang pernah menghasilkan judul 15 kata
  **tidak** menjadikan 15 kata benar. 16 semata-mata titik tempat penolakan mulai
  lebih merugikan guru daripada judul yang kepanjangan.
- **Prompt menyebut keduanya**, dan angkanya diambil dari konstanta yang sama yang
  divalidasi — bukan ditulis ulang sebagai literal (kelas cacat "dua angka kembar
  yang menyimpang diam-diam", CLAUDE.md).

**Tolerance band.** Judul 13–16 kata lolos, tetapi dicatat di
`HasilValidasi.peringatan` dan disimpan di `AtpHasil.catatan_mutu`. **Tidak
ditampilkan kepada guru** — guru tidak bisa berbuat apa-apa dengannya, dan
peringatan yang tidak dapat ditindaklanjuti hanya menambah kebisingan. Yang
membacanya adalah kita, saat menilai apakah pita ini masih pada tempatnya.

**Uji** — `JUDUL: 12 kata bersih, 13-16 kata lolos dengan catatan, 17 kata ditolak`:
12 kata → lolos, `peringatan.length === 0`; 13, 14, 15, 16 kata → lolos,
`peringatan.length === 1`; 17 kata → `[B3]`, ATP ditolak.

---

## H. Acceptance Cases K–O

| Case | Yang dibuktikan | Hasil |
|---|---|---|
| **K** — delegated ordering depends on CP structure | Seluruh 6 metode terbuka (bukan 2); struktur CP disebut lebih dulu daripada kesiapan di daftar pertimbangan; larangan "kesiapan menggantikan struktur CP" dinyatakan; kompetensi + lingkup materi tiap tuntutan benar-benar dikirim; kesiapan yang berbeda tidak lagi mengubah metode secara otomatis | **PASS (kontrak)**. Keluaran semantik nyata **PENDING** sampai model dipanggil — dinyatakan di kepala uji, bukan diklaim. |
| **L** — delegated vocational context uses context | A17 tidak lagi punya tetapan; ketiga porsi terbuka; `konteks_kejuruan`, `kesiapan_murid`, `cp_anchor.tuntutan`, `jumlah_murid` tersedia sebagai dasar; program keahlian berbeda menghasilkan konteks berbeda; keputusan yang memakai `konteks_kejuruan` diterima; kelas **tanpa** program keahlian membuat dasar itu hilang dan klaim atasnya ditolak D5 | **PASS** |
| **M** — no invented evidence | Enam bentuk klaim palsu ditolak: dasar karangan (D5), ID tuntutan karangan (D5), opsi karangan (D3), alasan kosong (D4), tanpa dasar (D5), pertanyaan tidak dijawab (D2), pertanyaan tidak diminta (D1). Untuk setiap penolakan diperiksa pula bahwa klaimnya **tidak tersimpan** sebagai fakta. | **PASS** |
| **N** — CP decomposition coverage | Arah 1: setiap tuntutan punya `sumber_cp` verbatim dari `cp_normatif`. Arah 2: setiap kata isi cp_normatif terwakili. `cakupan_teks: "sebagian"` wajib disertai catatan yang menyebut apa yang berkurang. | **PASS** (7 tuntutan) |
| **O** — density boundary | Kedua batas dihormati di 48/72/108/126/144/400 JP × 5 readiness; lantai berpangkal pada struktur CP; monotonik dan tidak melompat lebih dari 1 TP untuk setiap langkah 4 JP dari 12 sampai 240 JP; kesiapan rendah → TP lebih sedikit; permintaan guru tetap dijepit | **PASS** |

---

## I. Regression A–J

Seluruhnya hijau. Dua uji berubah, dan keduanya karena cacat yang diperbaiki —
bukan karena ekspektasinya dilonggarkan:

| Uji | Perubahan | Sebab |
|---|---|---|
| `CASE H` | Ditulis ulang: 2 keputusan aturan + 2 pertanyaan terbuka, ditambah pemeriksaan bahwa yang terbuka tidak diperintahkan | Gate B memindahkan A17/A19 ke penyusun |
| `CASE H` (baru) | Ditambahkan: array telanjang tetap diterima | membuktikan backward compatibility yang Gate B tuntut |
| `KEPADATAN` | `assertEquals(banyak.target, Math.floor(a.jumlah_pertemuan))` → `assertEquals(banyak.target, banyak.maks)` + `banyak.maks <= MAKS_TP_PER_FASE` | assertion lama **mengesahkan cacat**: 70 TP untuk satu fase. Lihat §F.2. |

`CASE A`–`CASE G`, `CASE I`, `CASE J`, `CAKUPAN`, `DASAR`, `BAHASA`, `ARITMETIKA`,
dan keempat uji `KONTRAK` lulus **tanpa satu baris pun disunting**.

---

## J. Tests Run

```
deno test --allow-read tests/atp-kontrak.test.ts     → ok | 29 passed | 0 failed
node tests/atp-acuan-sinkron.mjs                     → LULUS
node tests/atp-trace.mjs --periksa                   → LULUS
deno check supabase/functions/generate-atp/kontrak.ts → Check ok
deno check supabase/functions/generate-atp/index.ts   → Check ok
node --check guru/js/rancang-chat.js                  → ok
node --check guru/js/classroom-unduh.js               → ok
```

Baseline Pass 2 adalah 22 uji; sekarang 29. Tujuh tambahan: `CASE H` (array
telanjang), `CASE K`, `CASE L`, `CASE M`, `CASE N`, `CASE O`, `JUDUL`.

**Tidak dijalankan, dan sengaja:** `supabase db push`, `supabase functions deploy`,
`git commit`, `git push`, dan seluruh query ke production DB.

---

## K. Files Changed

| Berkas | Status | Gerbang |
|---|---|---|
| `shared/data/cp-acuan.json` | diubah (Pass 2) | A |
| `supabase/functions/generate-atp/acuan-cp.ts` | dibangkitkan ulang | A |
| `supabase/functions/generate-atp/kontrak.ts` | diubah | A, B, C, D |
| `supabase/functions/generate-atp/index.ts` | diubah | B, D |
| `guru/js/rancang-chat.js` | diubah | B (tampilan dasar keputusan) |
| `guru/js/classroom-unduh.js` | diubah | B (DOCX) |
| `guru/classroom.html` | diubah | versi cache `?v=` |
| `sw.js` | diubah | `CACHE_NAME` v24 → v25 |
| `tests/atp-kontrak.test.ts` | diubah | B, C, D + K–O |
| `tests/atp-acuan-sinkron.mjs` | diubah | A (tipe `sumber_cp`, `cakupan_teks`) |
| `docs/ATP-FINALIZATION-CHANGE-EVIDENCE.md` | **baru** | §6 |
| `docs/ATP-FINALIZATION-CHANGE-EVIDENCE.diff` | **baru** | §6 (diff mentah, 3.018 baris) |
| `docs/ATP-ACCEPTANCE-CORRECTION-REPORT.md` | **baru** | §9 |

`guru/js/rancang-chat-flow.js` berubah pada Pass 1 dan **tidak disentuh** di Pass 2.
`generate-modul` tidak disentuh sama sekali.

---

## L. Remaining ATP Gaps

1. **Keluaran semantik belum pernah diuji terhadap model sungguhan.** Ini gap
   terbesar dan tidak berkurang oleh Pass 2. Yang dibuktikan uji adalah kontrak:
   struktur CP dikirim, allowlist ditegakkan, bukti palsu ditolak. Apakah penyusun
   benar-benar memilih `prosedural` untuk CP yang berupa prosedur, dan `kerja`
   untuk program keahlian yang memang memuat situasinya, **PENDING** sampai
   semantic generation test dijalankan.
2. **`diperiksa_oleh: "manusia"` di acuan CP belum benar.** Penguraian tujuh
   tuntutan sekarang dapat ditelusuri dan konsisten, tetapi belum ada guru atau
   ahli kurikulum yang menyatakannya tepat. Menunggu Gate A diterima reviewer.
3. **Satu mapel, satu fase.** Acuan hanya memuat Bahasa Inggris Fase E. Setiap
   kombinasi lain tertutup di gerbang — aman, tetapi berarti kalibrasi
   `MAKS_TP_PER_FASE`, `JP_PER_TP`, dan pita judul semuanya berdiri di atas satu
   mapel.
4. **`MIN_HURUF_ALASAN = 25` adalah penyaring kalimat kosong, bukan penilai mutu.**
   Alasan sepanjang 60 huruf yang tidak bermakna tetap lolos. Tidak ada cara
   deterministik menutupnya, dan validator palsu yang berpura-pura bisa lebih
   berbahaya daripada tidak ada.
5. **`dasar` menyatakan apa yang BOLEH ditimbang, bukan apa yang BENAR-BENAR
   ditimbang.** Model yang menyebut `cp_anchor.tuntutan` tanpa benar-benar
   membacanya lolos D5. Yang tertutup adalah klaim atas sesuatu yang **tidak ada**;
   klaim atas sesuatu yang ada tetapi tidak dipakai tidak tertutup.
6. **A15 dan A3 masih deterministik.** Alasannya di §E.1 dan menurut kami cukup,
   tetapi keduanya adalah kandidat berikutnya kalau reviewer menilai penempatan
   penguatan sebenarnya bergantung pada tuntutan CP mana yang menuntut prasyarat.
7. **Pita toleransi judul belum diukur.** `catatan_mutu` baru akan terisi setelah
   generate nyata. Sampai itu terjadi, tidak ada dasar untuk menilai apakah 16
   masih pada tempatnya.
8. **`cakupan_teks: "sebagian"` belum punya konsekuensi di hilir.** Ia sekarang
   tercatat di data dan dikirim ke penyusun lewat `catatan_layanan`, tetapi belum
   ditampilkan kepada guru sebagai peringatan bahwa sisi visual CP perlu ia
   lengkapi sendiri. Keputusan produk, bukan pekerjaan yang tertinggal — perlu
   diputuskan apakah guru memang perlu diberi tahu.

---

## M. CHANGE EVIDENCE file/path

```
docs/ATP-FINALIZATION-CHANGE-EVIDENCE.md      — 12 kelompok, BEFORE/AFTER verbatim
docs/ATP-FINALIZATION-CHANGE-EVIDENCE.diff    — git diff HEAD, 3.018 baris, tidak diringkas
```

---

`ATP ACCEPTANCE PASS 2 — READY FOR REVIEW`
