# MODULE AJAR + NASKAH FASILITASI — CONTRACT LOCK

**Tanggal:** 10 September 2026
**Baseline:** commit `8b3a17a` — ATP ACCEPTED
**Sifat:** READ-ONLY untuk Modul/Naskah. Tidak ada kode Modul yang diubah.

Seluruh temuan di bawah berasal dari pembacaan kode aktual pada commit ini.
Setiap klaim menyebut berkas dan nomor barisnya. Yang tidak dapat dibuktikan
dari kode ditandai sebagai dugaan, bukan temuan.

---

## A. ACCEPTED ATP INPUTS TO MODULE

Yang benar-benar diterima `generate-modul` hari ini, dibaca dari
`supabase/functions/generate-modul/index.ts:2564-2745`:

| ATP field | Sumber | Module consumer | Must preserve? | Visible to teacher? |
|---|---|---|---|---|
| `atp_induk_id` | `modul_induk.atp_induk_id` | pembacaan ATP (`:2581`) | ya | tidak |
| nomor TP | `modul_induk.nomor_tp` (`:2741`) | `identitas.nomor_tp`, divalidasi (`:603`) | **ya, immutable** | ya |
| judul/teks TP | `modul_induk.tp_judul` (`:2742`) | `tujuan_pembelajaran` (`:2154-2157`) | **ya, immutable** | ya |
| `jp_alokasi` | `atp_induk.progresi_tp[nomor]` (`:2670-2671`) | `jp_per_pertemuan` | ya | ya |
| `jp_pertemuan` | `collected_data.PILIH_TP.selected_tp` (`:2659-2665`) | `jumlah_pertemuan` | ya | ya |
| `elemen_cp` | `atp_induk.elemen_cp` | `identitas.elemen_cp` | ya | ya |
| `durasi_jp` | `atp.collected_data.WAKTU` (`:2681-2685`) | `durasi_jp_menit` | ya | ya |
| kesiapan murid | `atp.collected_data.PROFIL_SISWA` → `arahanTitikAwal()` (`:1407`, `:2596`) | HANYA Fase B, sebagai `pembagian_waktu_menurut_titik_awal` (`:2241`) | ya | tidak |
| jumlah murid | `rancang_settings.jumlah_murid` (`:2599`) | prompt A/B + validator waktu | ya | sebagian (`konteks_murid.input_guru`) |
| program keahlian | `rancang_settings` (`:2601`) | `identitas.konteks_kejuruan` | ya | ya |
| kebijakan bahasa | `rancang_settings.bahasa_pengantar` (`:2611`) | `metadata_pedagogis.language_policy` (`:3012`) | ya | **TIDAK — lihat §N** |
| **`tuntutan[]`** | `progresi_tp[].tuntutan` | **TIDAK DITERIMA** | — | — |
| **`kategori_teks`** | `progresi_tp[].kategori_teks` | **TIDAK DITERIMA** | — | — |
| **semester TP** | `progresi_tp[].semester` | **TIDAK DITERIMA** | — | — |
| **A17 konteks tugas** | `ATP_HASIL.keputusan_didelegasikan` | **TIDAK DITERIMA** | — | — |
| **prioritas guru** | `collected_data.PENGUATAN_PRASYARAT.target_prioritas` | **TIDAK DITERIMA** | — | — |
| **`penerapan_prioritas`** | `ATP_HASIL.penerapan_prioritas` | **TIDAK DITERIMA** | — | — |
| **versi CP** | `cp-acuan.json` `versi_cp` | **TIDAK DITERIMA** | — | — |

Bukti untuk keenam baris terakhir:

```bash
$ grep -n "tuntutan\|kategori_teks" supabase/functions/generate-modul/index.ts
(tidak ada keluaran)
$ grep -n "konteks_tugas\|target_prioritas\|penerapan_prioritas\|ATP_HASIL" \
    supabase/functions/generate-modul/index.ts
(tidak ada keluaran)
```

**Nol kemunculan.** Modul menerima *nomor dan judul* TP, bukan *tuntutan* yang
TP itu pikul. Seluruh pekerjaan penguraian CP yang baru saja diterima di ATP
berhenti di batas ATP.

**Prinsip yang dikunci:** MODULE MAY ELABORATE, BUT MAY NOT CONTRADICT ATP.
Hari ini Modul tidak dapat bertentangan dengan ATP karena ia **tidak tahu** apa
yang ATP putuskan — dan itu bukan kepatuhan, melainkan ketidaktahuan.

---

## B. CURRENT MODULE PIPELINE A/B/C/B2/D

| Fase | Baris | Tanggung jawab | Masukan diwarisi | Keluaran | Validator | Konsumen hilir |
|---|---|---|---|---|---|---|
| **A** | `:2949-3028` | identitas, KKTP, konteks murid, materi esensial, rencana asesmen, rancangan, metadata pedagogis | `identitasDB`, `nomorTp`, `tpJudul`, `elemenCp`, `kktpList`, `cd`, pilihan asesmen guru | `_draft.fase_a` | `saringDimensi()` (`:1351`), injeksi `input_guru` + `language_policy` | B, C, B2, D |
| **B** | `:3031-3078` | `pertemuan[]` — langkah, sub-langkah, durasi, mode pelaksanaan/observasi | Fase A + `manifest` + `arahanTitikAwal` | `_draft.fase_b` | `injectSubLangkahRef()` (`:517`) | C, B2, D |
| **C** | `:3080-3145` | `instrumen_pembelajaran[]` + `instrumen_asesmen[]` | Fase A + manifest Fase B | `_draft.fase_c` | manifest kontrak | B2, D |
| **B2** | `:3147-3192` | `naskah_fasilitasi[]` | Fase A + B + C (isi instrumen, sejak 5 Sep) | `_draft.fase_b2` | V12–V16 di Fase D | D |
| **D** | `:3193+` | `tindak_lanjut`, `catatan_guru`, MERGE seluruh draft, validasi penuh, tulis final | seluruh draft | `modul_induk.konten` | `validateModulOutputV400()` (`:579`) + satu perbaikan | renderer, tab Unduh |

Idempotensi per fase lewat `_draft.fase_*`; `gugurkanNaskah()` (`:62`) membuang
naskah begitu B atau C disusun ulang. Fase D punya jalur mundur menyusun naskah
sendiri untuk klien lama (`:3312`).

**Tidak ditemukan fase yang mengulang keputusan otoritas fase sebelumnya.**
Pembagian tanggung jawabnya bersih. Yang bermasalah bukan jumlah fasenya.

---

## C. CURRENT SCHEMA vs 15 TARGET COMPONENTS

| # | Requirement | Current | Gap | Proposed contract |
|---|---|---|---|---|
| 1 | identitas + konteks kelas | `Identitas` + `KonteksMurid` (`:222`, `:251`) | tidak memuat semester dan versi CP | tambah `semester` dan `versi_cp` dari ATP |
| 2 | CP + TP | `dasar_cp`, `tujuan_pembelajaran` | TP hanya teks salinan; tanpa `tuntutan[]` | anchor lengkap — §D |
| 3 | kompetensi & lingkup yang diwajibkan TP | **tidak ada** | tuntutan CP tidak pernah sampai | wariskan `tuntutan[]` + `kompetensi`/`lingkup_materi` |
| 4 | Dimensi Profil Lulusan | `metadata_pedagogis.dimensi_profil_lulusan` (`:462`) | disaring ke 8 nama sah, **bukan** ke dimensi yang guru pilih | §K |
| 5 | KKTP | `KktpItem[]` (`:243`) | `ambang_batas` bebas teks; tanpa ikatan ke TP | §E |
| 6 | asesmen awal bila perlu | `asesmen_diagnostik \| null` | sudah benar — opsional dan berpengaruh (`penggunaan_hasil`) | pertahankan |
| 7 | asesmen formatif + feedback | `asesmen_formatif \| null` (`:273`) | **boleh null** (`:1743`) — bertentangan dengan §9.3 LOCKED | §F |
| 8 | asesmen sumatif bila dipakai | `asesmen_sumatif \| null` | boleh null, dan tidak ada penjamin bukti pengganti | §F |
| 9 | evidence + instrumen | dua array instrumen + `instrumen_ref` | rantai tidak lengkap — §G | §G |
| 10 | memahami → mengaplikasi → merefleksi + waktu | `NamaLangkah` + `durasi_menit` | ada dan divalidasi | pertahankan |
| 11 | peran guru, aktivitas murid, organisasi | `mode_pelaksanaan`, `mode_observasi`, `ukuran_kelompok` | ada di schema, **tidak dirender** | §N |
| 12 | dukungan/adaptasi | `kebutuhan_dukungan`, `TindakLanjut` | ada | pertahankan |
| 13 | seluruh bahan lengkap | `instrumen_*.konten_murid` | `panduan_guru` boleh null pada `soal_latihan` → kunci jawaban hilang | §H |
| 14 | tindak lanjut | `TindakLanjut` (`:452`) | ada | pertahankan |
| 15 | Naskah Fasilitasi | `NaskahPertemuan[]` (`:339`) | duplikasi + decision support tipis | §L, §M |

---

## D. TP ANCHOR CONTRACT

Anchor saat ini: `identitas.nomor_tp` divalidasi terhadap `nomorTp`
(`index.ts:603`), dan `tujuan_pembelajaran` diisi dari `tp_judul`.

Itu mengunci **nomor**, bukan **kompetensi**. Karena `tuntutan[]` tidak pernah
dikirim, tidak ada yang mencegah Modul melahirkan kompetensi baru: tidak ada
himpunan tuntutan untuk membandingkannya.

**Kontrak yang diusulkan** — `tp_anchor` diperluas menjadi:

```
tp_anchor = {
  atp_induk_id, nomor_tp, tp_judul, tp_hash,
  tuntutan[]        // id + kompetensi + lingkup_materi, dari acuan CP
  kategori_teks[]   // dari progresi_tp
  semester, jp_alokasi, jp_pertemuan[]
  versi_cp
}
```

Aturan turunannya: setiap KKTP mengukur TP; materi membantu TP; aktivitas menuju
TP; evidence membuktikan TP; instrumen mengukur evidence; Naskah menjalankan
aktivitas. Tidak ada kompetensi yang lahir di Modul.

---

## E. KKTP CONTRACT

`KktpItem = { id_kktp, kriteria, ambang_batas, instrumen_bukti[] }` (`:243`).

Bentuknya sudah mendukung §9.1 — ada ambang dan ada rujukan bukti. Yang belum
ada: **penjamin** bahwa `kriteria` observable dan `ambang_batas` cukup untuk
memutuskan ketercapaian. Tidak ada validator yang menolak `ambang_batas` berupa
kalimat abstrak.

Kontrak yang diusulkan: setiap KKTP wajib punya `id_kktp` unik, `kriteria`
dengan verba teramati, `ambang_batas` yang menyebut jumlah/proporsi/mutu yang
dapat dihitung, dan `instrumen_bukti[]` yang seluruhnya ada di manifest
instrumen. Ketiganya deterministik dan dapat divalidasi; "observable" dalam arti
pedagogis tetap penilaian semantik (§S).

---

## F. ASSESSMENT CONTRACT

| Jenis | Sekarang | Terhadap §9 LOCKED |
|---|---|---|
| Awal | `null` bila `gunakan_diagnostik=false`; bila ada wajib `penggunaan_hasil` | **sesuai** |
| Formatif | `null` bila `gunakan_formatif=false` (`index.ts:1743`) | **BERTENTANGAN** — §9.3 mewajibkan |
| Sumatif | `null` bila `gunakan_sumatif=false` | sesuai bentuk, **tetapi** tidak ada penjamin bukti pengganti |

Bukti formatif opsional, dari SYSTEM_PROMPT `generate-modul`:

```
- asesmen_diagnostik = null jika gunakan_diagnostik=false,
  asesmen_formatif = null jika gunakan_formatif=false, …
```

Guru yang menjawab "tidak" pada pertanyaan formatif menerima Modul tanpa satu
pun titik pemeriksaan pemahaman selama proses. Itu keadaan yang §9.3 tutup.

Kontrak yang diusulkan:
1. `asesmen_formatif` **wajib berisi** minimal satu entri; pertanyaan
   `gunakan_formatif` berhenti menjadi saklar dan menjadi pilihan teknik.
   *(Konsekuensi produk: satu pertanyaan berubah arti — keputusan Romo.)*
2. Bila `asesmen_sumatif = null`, wajib ada sekurang-kurangnya satu sub-langkah
   ber-`asesmen_ref` yang menghasilkan bukti per murid untuk setiap KKTP.
   **Modul tanpa bukti ketercapaian ditolak.**

---

## G. EVIDENCE / INSTRUMENT CONTRACT

Rantai sasaran dan keadaannya sekarang:

```
TP        →  ada (nomor + judul), tanpa tuntutan            ✗ lemah
KKTP      →  KktpItem.instrumen_bukti[]                     ✓
Evidence  →  sub_langkah.asesmen_ref                        ~ hanya 'SUMATIF' yang bermakna
Instrument→  instrumen_ref + manifest                       ✓
Bukti murid→ konten_murid                                   ✓
Keputusan →  ambang_batas + panduan_penskoran               ~ tidak dijamin ada
```

Dua putus yang terbukti:

- **TP → KKTP** tidak terikat sama sekali (§P).
- **Instrumen → keputusan guru** tidak dijamin: `panduan_guru` bertipe
  `… | null` pada `InstrumenSoal`, `InstrumenPraktikum`, dan
  `InstrumenPanduanProyek` (`:400`, `:415`, `:425`). Kunci jawaban, rubrik, dan
  panduan penskoran boleh hilang tanpa satu galat pun.

Strukturnya sendiri memadai. **Jangan membangun sistem asesmen paralel** —
perkuat manifest yang ada dengan pemeriksaan dua arah: setiap `instrumen_ref`
menunjuk instrumen yang ada, dan setiap instrumen dipakai sekurang-kurangnya
sekali.

---

## H. MATERIAL RESOURCE CONTRACT

`MateriEsensial = { lingkup_materi[], kosakata_kunci[], konsep_utama[] }`
(`:258`) — ketiganya **pengetahuan guru**, bukan bahan murid. Bahan yang
benar-benar dipegang murid hidup di `instrumen_*.konten_murid`.

Pemisahan §16 karena itu **sudah ada secara de facto**, tetapi tidak dinyatakan
dan tidak dijamin lengkap: tidak ada aturan yang menuntut setiap sub-langkah
yang membutuhkan bahan murid benar-benar menunjuk instrumen yang menyediakannya.

Larangan §11 sudah ditegakkan sebagian di ATP (`POLA_BAHAN_TERLARANG`,
`POLA_KEGIATAN_LUAR` di `kontrak.ts`) dan di Modul lewat V13 perangkat digital.
Yang belum: pemeriksaan "bahan hantu" — pernah dirumuskan 5 September, **tidak
dipasang** karena menjatuhkan 4 dari 5 modul sehat. Itu tetap keputusan yang
benar; ukur ulang sebelum memasangnya.

Kontrak yang diusulkan: `materi_esensial` diberi label eksplisit sebagai
pengetahuan guru; setiap sub-langkah yang menuntut murid membaca/menyimak/
mengerjakan wajib punya `instrumen_ref` yang menyediakan isinya.

---

## I. CONTEXT CAUSALITY CONTRACT

| Masukan | Sampai ke Modul? | Mengubah keputusan apa | Status |
|---|---|---|---|
| kesiapan murid | ya, `arahanTitikAwal()` (`:1407`) | HANYA pembagian menit antar tahap, HANYA di Fase B (`:2241`) | **sempit** — tidak menyentuh titik awal, scaffolding, kompleksitas, grouping |
| jumlah murid | ya (`:2148`, `:2246`, `:2647`) | prompt + validator V3/V4/V4b | **kausal, terbukti** |
| konteks kejuruan | ya, `program_keahlian` | `identitas.konteks_kejuruan` | ada, tanpa penjamin ia mengubah skenario |
| prioritas guru | **tidak** | — | **putus** |
| A17 konteks tugas | **tidak** | — | **putus** |
| kondisi kelas | ya, `input_guru` (`:2645`) | konteks_murid | ada |
| kebijakan bahasa | ya (`:3012`) | `language_policy` | ada, tapi tak terlihat (§N) |

Dua masukan yang di ATP baru saja dibuktikan kausal — A17 dan prioritas guru —
**tidak diteruskan sama sekali**. Modul tidak dapat menghormati keputusan guru
yang tidak pernah ia terima.

Kesiapan `jauh_di_bawah` yang di ATP kini mengubah urutan dan penempatan
semester (RDS1–RDS6), di Modul hanya mengubah pembagian menit. Itu bukan salah,
tetapi ia jauh lebih sempit daripada §13.

---

## J. TIME FEASIBILITY CONTRACT

Yang sudah ada dan **layak dipertahankan seluruhnya**:

| | Baris | Menolak |
|---|---|---|
| total pertemuan = JP × durasi | `:606-608` | total menit tidak cocok |
| durasi langkah & sub-langkah | `:686`, `:704` | bukan integer positif |
| V3 bergantian | `:709-724` | menit per kelompok di bawah lantai (3 latihan / 4 sumatif) |
| V4b sumatif bergantian | `:733-744` | bukti per murid tidak muat |
| V4 individual+semua | `:747-757` | < 2 menit per murid |
| V9 mode + ukuran kelompok | `:760-762` | kombinasi mustahil |
| slot sumatif | `:824` | durasi sumatif tidak punya slot nyata |

`waktuPerKelompok()` (`:153`) dipakai dua kali — validator dan prompt — dari
satu sumber. Itu pola yang benar dan sudah dibayar sekali di repo ini.

**Tidak ditemukan celah "30 murid tampil satu per satu"** — V4 dan V4b
menutupnya. Yang belum diperiksa: beban observasi guru ketika beberapa
sub-langkah menuntut pengamatan bersamaan.

---

## K. DIMENSIONS CONTRACT

`saringDimensi()` (`:1351`) membuang nama di luar delapan Dimensi Profil
Lulusan resmi — **bukan gerbang**, sengaja, dan alasannya tertulis di kode.
Terminologi 2025 sudah dipakai; `DIMENSI_PROFIL_LULUSAN` memetakan kunci ke
nama resmi, dan `'rekomendasi'` disaring keluar (`:1340`).

**Gap terhadap §15:** penyaringan memakai `NAMA_DIMENSI_SAH` — delapan nama
resmi — bukan himpunan yang **guru pilih**. Dimensi yang sah tapi tidak dipilih
guru tetap lolos.

Kontrak yang diusulkan: saring terhadap pilihan guru bila ada, jatuh ke delapan
nama resmi bila guru mendelegasikan. Tetap sebagai penyaring, bukan gerbang.

---

## L. NASKAH EXECUTION CONTRACT

```ts
NaskahSubLangkah = { ref, ucapan_guru[], aksi_guru[], pertanyaan_kunci[], jika_kesulitan? }
```

Empat dari lima kategori §20 sudah terpisah rapi: ucapan, aksi, pertanyaan, dan
— sebagian — dukungan. **Yang tidak ada: `observe` dan `decision` sebagai
kategori tersendiri.** `jika_kesulitan[]` adalah daftar saran, bukan
OBSERVE → CONDITION → ACTION: tidak ada tempat menyatakan apa yang guru cari,
kapan kondisinya terpenuhi, dan apa yang dilakukan sesudahnya.

Kontrak yang diusulkan — tambah pada tiap sub-langkah:

```
amati:     apa yang guru cari (teramati, bukan sikap batin)
keputusan: [{ bila: <kondisi teramati>, maka: [aksi], lalu_cek: <kapan> }]
```

`jika_kesulitan[]` menjadi kasus khusus dari `keputusan[]`. Tidak perlu skrip
per 30 detik — guru tetap profesional (§19).

---

## M. NASKAH REFERENCE MODEL

Naskah sudah menunjuk langkah lewat `ref` = `"P{n}.{LANGKAH}.{k}"`, diinjeksi
backend (`injectSubLangkahRef`, `:517`) dan diperiksa terhadap `collectRefs()`.
Rujukan **langkah** sudah benar.

Yang belum ada: rujukan **sumber daya**. Naskah tidak punya field untuk
menyebut instrumen; ia hanya punya array teks bebas, sehingga satu-satunya cara
menyebut isi instrumen adalah menyalinnya. Itu sumber duplikasi, dan sekaligus
pintu bagi Naskah mengarang sumber daya baru — persis cacat yang ditelaah ahli
kurikulum pada 5 September.

Kontrak yang diusulkan: `instrumen_ref[]` pada `NaskahSubLangkah`, dengan
aturan bahwa kutipan panjang diganti rujukan. Naskah menyebut
`Gunakan M-03 · Ajukan Q-02 · Amati dengan A-01`, tidak menyalin isinya.
Penamaan mengikuti id instrumen yang sudah ada, bukan skema baru.

---

## N. RENDERER CONTRACT

Yang terbukti **ada di schema tetapi tidak pernah terlihat guru**, dari
pembacaan `_renderModulPreviewV400` (`rancang-chat.js:2786-3260`) dan
`classroom-unduh.js`:

| Field | Di schema | Di dokumen Modul | Di Naskah |
|---|---|---|---|
| `instrumen_ref` | ya | **ya** (`:3188`) | tidak |
| `mode_pelaksanaan` | ya | **tidak** | tidak |
| `mode_observasi` | ya | **tidak** | tidak |
| `ukuran_kelompok` | ya | **tidak** | tidak |
| `asesmen_ref` | ya | **tidak** | tidak |
| `language_policy` | ya | **tidak** | tidak |

```bash
$ grep -c "language_policy" guru/js/rancang-chat.js guru/js/classroom-unduh.js
guru/js/rancang-chat.js:0
guru/js/classroom-unduh.js:0
```

Akibatnya konkret: validator menolak modul karena kegiatan bergantian tidak
muat untuk 32 murid, lalu dokumen yang lolos **tidak memberi tahu guru** bahwa
kegiatan itu bergantian, berapa besar kelompoknya, dan siapa yang diamati.
Keputusan yang menentukan pelaksanaan hidup hanya di JSON.

Kontrak yang diusulkan: `mode_pelaksanaan`, `mode_observasi`, `ukuran_kelompok`
tampil di Naskah (tempat guru bertindak); `asesmen_ref` dan `language_policy`
tampil di Modul (tempat guru merencanakan). Metadata mesin lain tetap
disembunyikan.

---

## O. ATP `kategori_teks` DOWNSTREAM ENFORCEMENT — FH-002

**Status: PUTUS TOTAL.**

ATP kini menegakkan `cakupan_wajib.kategori_teks` lewat C6/C7: sebuah TP yang
melayani BIE-E25-MM-1 wajib mencakup fiksi **dan** nonfiksi, dibuktikan metadata
`kategori_teks` yang TP nyatakan sendiri.

`generate-modul` tidak pernah menerima field itu — nol kemunculan (§A). Maka
sebuah TP yang di ATP bertanda `fiksi + nonfiksi` dapat menghasilkan Modul yang
seluruh bahannya nonfiksi, tanpa satu pun galat, di klien maupun di server.

Kontrak yang diusulkan:
1. Wariskan `tuntutan[]` dan `kategori_teks[]` ke `tp_anchor`.
2. Setiap instrumen bahan bacaan/simakan menyatakan `kategori_teks`-nya.
3. Validator Modul menolak bila gabungan bahan murid tidak mencakup seluruh
   kategori yang TP-nya tuntut — bentuknya sama persis dengan C6 di ATP, dan
   **aturannya dibaca dari acuan CP**, bukan ditulis tangan.

Ini deterministik, dapat diuji tanpa model, dan menutup FH-002 di hilir.

---

## P. TP/KKTP IDENTITY AUDIT

### P.1 Bagaimana Modul memilih KKTP — kode aktual

`supabase/functions/generate-modul/index.ts:2617-2629`:

```ts
// 6. BACA tp_kktp
const { data: kktp, error: kktpErr } = await userClient
  .from('tp_kktp')
  .select('id, judul, konten, batas_bawah, batas_atas')
  .eq('classroom_id', classroom_id)
  .eq('tipe', 'KKTP')
  .eq('is_active', true)
  .order('urutan', { ascending: true });
```

**Tidak ada satu pun filter yang menghubungkannya ke TP yang sedang dibuatkan
Modul.** Bukan `parent_id`, bukan `nomor_tp`, bukan `atp_induk_id`, bukan
`mapel`, bukan `semester`, bukan `academic_year` — padahal `tp_kktp` memiliki
kelima kolom itu (`20260807000001_assessment-hierarchy.sql` untuk `parent_id`,
`20260815000004` untuk `mapel`, dan constraint
`uq_assessment_items (classroom_id, teacher_id, academic_year, semester, tipe, mapel, judul, parent_id)`).

Hasilnya diteruskan apa adanya sebagai KKTP milik TP ini
(`:2989` → `buildUserMessageFaseA(… kktpList …)` → `:2167`).

**Konsekuensi yang dapat direproduksi:** guru yang punya KKTP untuk beberapa TP
di satu kelas menerima SELURUHNYA di setiap Modul. Bila kelas itu memuat lebih
dari satu mapel, KKTP mapel lain ikut. Modul lalu menyusun asesmen untuk
kriteria yang bukan milik TP-nya.

### P.2 Bagaimana Modul terikat ke TP ATP

`20260829000001_modul-dua-lapis.sql:8-25`:

```sql
CREATE TABLE public.modul_induk (
  atp_induk_id  uuid NOT NULL REFERENCES public.atp_induk(id) ON DELETE CASCADE,
  nomor_tp      int  NOT NULL,
  tp_judul      text NOT NULL,
  …
  UNIQUE (guru_id, atp_induk_id, nomor_tp)
);
```

Ikatannya **nomor** — bilangan posisi — ditambah salinan judul yang tidak pernah
diperiksa ulang. Tidak ada id TP, tidak ada hash, tidak ada versi ATP.

### P.3 Apa yang terjadi bila ATP diregenerate

`supabase/functions/generate-atp/index.ts:862-889`:

```ts
const updatePayload = {
  progresi_tp: progresiTp,
  collected_data: { ...cd, ATP_HASIL: atpHasil },
};
…
await userClient.from('atp_induk').update(updatePayload).eq('id', atp_induk_id)
```

`progresi_tp` **ditimpa di baris yang sama**. `atp_induk_id` tidak berubah,
`nomor_tp` tetap resolve — ke TP yang sekarang menempati nomor itu.

Klien memperkuat kesalahannya, `guru/js/rancang-chat.js:890-891`:

```js
const tp = (atpFull.progresi_tp || []).find(t => t.nomor === modul.nomor_tp);
_chat.selected_tp = tp || { nomor: modul.nomor_tp, judul: modul.tp_judul };
```

Kalau nomornya ada, TP baru dipakai — **tanpa membandingkan judul**. Kalau tidak
ada, `tp_judul` lama dipakai — modul yatim yang tampak sehat. Kedua cabang diam.

`grep -c modul supabase/functions/generate-atp/index.ts` = 12, seluruhnya kata
dalam komentar/pesan; **generate-atp tidak memeriksa apakah ada Modul yang
bergantung pada TP yang sedang ia timpa.**

### P.4 Bisakah KKTP lama menempel ke TP baru

**Ya, dan itu bahkan bukan kasus tepi** — karena §P.1 tidak menyaring apa pun,
KKTP lama menempel ke TP apa pun, sebelum maupun sesudah regenerate.

### P.5 Status

# MODULE BLOCKER — TP/KKTP IDENTITY

Kontrak minimal yang diusulkan (implementasi menunggu persetujuan reviewer):

1. **Identitas TP yang stabil.** `progresi_tp[]` memuat id TP yang tidak
   berubah saat ATP disusun ulang, atau `tp_hash` dari judul + tuntutan.
   `modul_induk` menyimpannya bersama `nomor_tp`.
2. **Deteksi mismatch, bukan penolakan diam.** Saat Modul dibuka atau
   di-generate, id/hash dibandingkan; berbeda → beri tahu guru bahwa ATP-nya
   berubah dan tawarkan pilihan. Jangan pernah diam.
3. **KKTP terikat ke TP.** Minimal `parent_id` = baris TP, plus `mapel` dan
   `semester`. Bila `tp_kktp` tidak dapat ditautkan ke TP ATP, KKTP Modul
   disusun dari `tp_anchor` dan tabel Penilaian tidak dibaca sama sekali —
   lebih jujur daripada membaca kriteria milik TP lain.
4. **generate-atp menyadari Modul.** Regenerate yang akan meninggalkan Modul
   yatim wajib memberi tahu guru lebih dulu.

Butir 3 memuat keputusan produk yang bukan milik saya: **apakah KKTP Modul
berasal dari tabel Penilaian atau disusun Modul sendiri?** Keduanya sah;
keduanya mengubah alur kerja guru. Itu keputusan Romo.

---

## Q. FIVE-PHASE PIPELINE DECISION

| Fase | Putusan | Alasan |
|---|---|---|
| **A** | **KEEP** | Satu-satunya sumber identitas, KKTP, dan rencana asesmen. Idempoten dan tidak memakan kuota saat diulang. Akan menerima `tp_anchor` yang diperluas. |
| **B** | **KEEP** | Pertemuan dan waktu; validator kelayakan waktu bergantung padanya. Tidak ada yang mengulang keputusannya. |
| **C** | **KEEP** | Instrumen. Anggaran tokennya sudah turunan jumlah instrumen. Akan menerima kewajiban `kategori_teks`. |
| **B2** | **KEEP** | Dipisah dari C pada 5 September karena satu panggilan mengerjakan dua penyusunan sampai 240 detik. Menggabungkannya kembali mengulang cacat yang sudah dibayar. Akan **MODIFY**: menerima `instrumen_ref[]` dan `keputusan[]`. |
| **D** | **MODIFY** | Tanggung jawabnya benar (tindak lanjut + merge + validasi + tulis), tetapi ia masih memuat **jalur mundur menyusun naskah sendiri** (`:3312`) untuk klien lama yang tertahan di cache. Setelah rilis berikutnya, jalur itu dapat dicabut — namun **hanya setelah** versi cache klien dinaikkan dan dipastikan tersebar. Bukan sekarang. |

**Tidak ada fase yang dihapus atau digabung.** Lima panggilan tetap masuk akal;
yang perlu diperbaiki adalah apa yang mereka terima dan hasilkan, bukan berapa
banyak mereka.

---

## R. SCHEMA TRUTH DECISION

Empat gambaran schema hidup bersamaan hari ini:

| | Tempat | Peran |
|---|---|---|
| 1 | `type ModulOutput` (`index.ts:490`) | tipe TypeScript, **dihapus saat runtime** |
| 2 | `validateModulOutputV400()` (`:579`) | satu-satunya yang benar-benar menegakkan |
| 3 | kerangka JSON di SYSTEM_PROMPT (`:1611`) | yang model lihat |
| 4 | renderer (`rancang-chat.js`) + `classroom-unduh.js` | yang guru lihat |

Drift terbukti ada, dan §N mengukurnya: field yang hidup di (1) dan (2) tidak
pernah muncul di (4).

**Putusan yang diusulkan — jangan menulis ulang framework.** Jadikan **(2)
validator sebagai satu-satunya otoritas**, dan turunkan (3) dari sana
sebagaimana ATP kini menurunkan arahan kesiapan dari tabel yang ditegakkan
validator. (1) tetap sebagai bantuan penyunting. (4) dijaga oleh uji: setiap
field yang §N tetapkan "harus terlihat" diperiksa uji renderer, memakai data
modul nyata — repo ini sudah punya polanya (`tests/validator-modul.ts`, lima
modul produksi).

Yang wajib dihindari: empat schema yang diam-diam berbeda. Yang tidak perlu:
generator schema baru.

---

## S. DETERMINISTIC GUARANTEES vs SEMANTIC ACCEPTANCE

**Dapat dijamin kode — wajib menjadi validator:**

- `nomor_tp` cocok; `tp_hash`/id TP cocok
- seluruh `tuntutan[]` TP terpetakan ke KKTP
- cakupan `kategori_teks` terpenuhi bahan murid (FH-002)
- `asesmen_formatif` tidak kosong
- ada bukti per murid untuk setiap KKTP
- setiap `instrumen_ref` menunjuk instrumen yang ada; setiap instrumen terpakai
- `panduan_guru` ada untuk instrumen bernilai tertutup (kunci jawaban wajib)
- total menit pertemuan = JP × durasi; seluruh sub-langkah muat
- kelayakan waktu bergantian/individual (V3, V4, V4b)
- Naskah hanya menunjuk `ref` dan `instrumen_ref` yang ada
- dimensi ⊆ pilihan guru

**Hanya dapat diterima lewat telaah semantik — jangan dijadikan gerbang:**

- apakah KKTP benar-benar mengukur TP, bukan sekadar menyebutnya
- apakah bahan murid layak untuk kelas ini
- apakah ucapan guru wajar diucapkan
- apakah keputusan Naskah membantu di depan kelas
- apakah konteks kejuruan autentik, bukan tempelan
- apakah kesiapan benar-benar mengubah perjalanan

Pemisahan ini bukan formalitas. Pelajaran 5 September berlaku penuh: tiga dari
lima gerbang validator baru sempat menjatuhkan modul sehat, dan satu aturan yang
benar sengaja tidak dipasang karena menjatuhkan 4 dari 5. **Ukur sebelum
memasang gerbang.**

---

## T. IMPLEMENTATION SLICES

Urutan mengikuti ketergantungan nyata, bukan kerapian daftar.

| Slice | Isi | Bergantung pada |
|---|---|---|
| **M1** | TP/KKTP identity — id/hash TP stabil, ikatan KKTP, deteksi mismatch, kesadaran generate-atp | — (**blocker**, harus pertama) |
| **M2** | `tp_anchor` diperluas: `tuntutan[]`, `kategori_teks[]`, semester, versi CP, A17, prioritas guru | M1 |
| **M3** | Kontrak schema + otoritas tunggal validator; kerangka prompt diturunkan dari validator | M2 |
| **M4** | Asesmen + evidence: formatif wajib, bukti per KKTP, rantai TP→keputusan | M3 |
| **M5** | Sumber daya: kelengkapan bahan murid, `panduan_guru` wajib untuk item tertutup, penegakan `kategori_teks` (FH-002) | M3, M4 |
| **M6** | Pertemuan/konteks/waktu: kausalitas kesiapan diperluas, A17 dan prioritas benar-benar mengubah keputusan | M2, M5 |
| **M7** | Naskah: `instrumen_ref[]`, `amati`/`keputusan[]`, hilangkan duplikasi | M5, M6 |
| **M8** | Renderer: field kritis terlihat, uji renderer atas modul nyata | M4–M7 |
| **M9** | Uji semantik Modul dengan harness setara ATP; telaah ahli kurikulum | seluruhnya |

M1 mendahului semuanya: memperbaiki asesmen di atas anchor yang salah berarti
menyusun asesmen yang benar untuk TP yang keliru.

---

## U. BLOCKERS

Hanya yang terbukti dari kode:

1. **MODULE BLOCKER — TP/KKTP IDENTITY** (§P). Bukti: `index.ts:2617-2629`,
   `20260829000001_modul-dua-lapis.sql:8-25`, `generate-atp/index.ts:862-889`,
   `rancang-chat.js:890-891`.
2. **KEPUTUSAN PRODUK — sumber KKTP Modul.** Dari tabel Penilaian, atau disusun
   Modul dari `tp_anchor`? Menentukan bentuk M1 dan M4. Milik Romo.
3. **KEPUTUSAN PRODUK — `gunakan_formatif` berubah arti.** §9.3 mewajibkan
   formatif; pertanyaan yang ada hari ini mengizinkan guru mematikannya. Satu
   pertanyaan berubah dari saklar menjadi pilihan teknik. Milik Romo.

Bukan blocker: pipeline lima fase, kelayakan waktu, terminologi dimensi,
arsitektur repair. Keempatnya sehat.

---

## V. FILES THAT WOULD CHANGE

Tidak satu pun disentuh pada task ini.

| Berkas | Slice | Sifat perubahan |
|---|---|---|
| `supabase/functions/generate-modul/index.ts` | M2–M7 | tipe, validator, prompt, pewarisan anchor |
| `guru/js/rancang-chat.js` | M1, M8 | pemilihan TP, deteksi mismatch, renderer |
| `guru/js/rancang-chat-api.js` | M1 | pembuatan `modul_induk` dengan id/hash TP |
| `guru/js/classroom-unduh.js` | M8 | field kritis di .docx |
| `supabase/functions/generate-atp/index.ts` | M1 | kesadaran Modul saat regenerate |
| `supabase/functions/generate-atp/kontrak.ts` | M2 | ekspor tuntutan/kategori untuk hilir |
| migration baru | M1 | id TP stabil, ikatan KKTP |
| `tests/validator-modul.ts` + uji baru | M3–M9 | jaring regresi |
| `guru/classroom.html`, `sw.js` | M8 | versi cache |

---

# MODULE/NASKAH CONTRACT — READY FOR REVIEW

Satu blocker terbukti (§P) dan dua keputusan produk menunggu Romo (§U).
Tidak ada implementasi yang dimulai. Tidak ada deploy, push, migration, atau
tulisan ke produksi.
