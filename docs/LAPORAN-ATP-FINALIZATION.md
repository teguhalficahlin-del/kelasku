# MICLASS — ATP FINALIZATION IMPLEMENTATION REPORT

**Status akhir: `ATP FINALIZATION — READY FOR REVIEW`**

Tidak ada deploy, tidak ada push, tidak ada perubahan basis data produksi, tidak
ada panggilan AI. Perubahan berada di working tree dan belum di-commit.

---

## A. Baseline

| | |
|---|---|
| HEAD awal | `e3323b5` — *docs: jadikan SPEC-ATP-MODUL-BERBASIS-TEKS sumber tunggal hasil akhir* |
| HEAD akhir | `e3323b5` (belum di-commit) |
| Branch | `main` |
| Working tree awal | Bersih dari modifikasi; 19 entri untracked (artefak telaah produk, bukan kode) |
| Migration | 140 lokal, 140 terdaftar di DB — konsisten. **Tidak ada migration baru.** |

**Sumber otoritas yang dibaca:**

1. Keputusan LOCKED di prompt tugas
2. `docs/SPEC-ATP-MODUL-BERBASIS-TEKS.md` (195 baris, dibaca penuh)
3. `MICLASSCURRENTSTATEREPORT.md` (audit 9 Sep 2026)
4. `CLAUDE.md` (dengan catatan bahwa bagian §12/§23.3 diketahui stale)
5. Implementasi aktual: `supabase/functions/generate-atp/index.ts` (869 baris),
   `guru/js/rancang-chat-flow.js`, `guru/js/rancang-chat.js` (3.896 baris),
   `guru/js/classroom-unduh.js`, `shared/data/cp-data.json`
6. `supabase/functions/generate-modul/index.ts` — dibaca untuk memetakan
   ketergantungan hilir, **tidak diubah**
7. Migration `20260827000001`, `20260908000001`, `20260908000002`
8. `docs/ATP_Bahasa_Inggris_FaseE.docx` — keluaran ATP produksi nyata, dipakai
   sebagai fixture kalibrasi

**Appendix B / Appendix G tidak ditemukan** dengan nama itu maupun dengan isi
yang setara. System prompt ATP berada langsung di `generate-atp/index.ts`;
definisi pertanyaan berada di `rancang-chat-flow.js` dan `SPEC` §4. Keduanya
dipakai sebagai gantinya.

**Delta sejak `e3323b5`:** tidak ada. HEAD tidak bergerak.

---

## B. Product Contract Implemented

| # | Keputusan LOCKED | Status | Lokasi |
|---|---|---|---|
| 2.1 | CP anchor resmi & immutable; TP traceable ke CP | **PASS** | `kontrak.ts` `cp_anchor`, `validasiAtp` C1–C5; `shared/data/cp-acuan.json` |
| 2.1 | Coverage CP diperiksa, bukan sekadar `elemen_cp` disebut | **PASS** | `TpEntry.tuntutan[]` + aturan C3/C4/C5 |
| 2.2 | ATP kontekstual secara kausal (9 jalur pengaruh) | **PASS** | `bangunKonteksAtp()`; jejak di `docs/SPEC-ATP-KONTRAK.md` |
| 2.3 | Konteks kejuruan tidak menggeser kompetensi CP | **PASS (deterministik)** / **SEMANTIC PENDING** | `konteks_kejuruan[1]`; Case C membuktikan tuntutan identik lintas program keahlian |
| 2.4 | Tidak bergantung bahan yang tidak dijamin | **PASS** | `POLA_BAHAN_TERLARANG` aturan B1; `batas_mutlak` |
| 2.5 | Jumlah murid memengaruhi kelayakan, TP bukan lesson plan | **PASS** | `batas_mutlak` per ukuran kelas + larangan detail rotasi masuk judul |
| 2.6 | Waktu bukan sekadar total JP; penempatan per semester | **PASS** | `hitungAlokasi().anggaran_semester`; aturan W7/W8 |
| 2.7 | Kepadatan TP tidak arbitrer | **PASS** | `hitungTargetTp()`; aturan K1 |
| 2.8 | Bukti, keputusan, dan asumsi dibedakan | **PASS** | `ATP_HASIL.dasar_penyusunan` (3 bagian terpisah) |
| 2.9 | Bahasa manusiawi | **PASS (deterministik)** | Aturan B2 jargon, B3 panjang; uji "tidak ada kunci mesin bocor ke prompt" |
| §3 | 21 definisi A1–A20 + A15a | **PASS** | `rancang-chat-flow.js`; uji kontrak memverifikasi 21 spec id |
| §4 | Question → Data → Decision, tidak ada input yatim | **PASS** | `KONTRAK_PERTANYAAN`; uji dua arah |
| §5 | Generator diberi kontrak keputusan, bukan blob | **PASS** | 7 bagian semantik di user message |
| §6 | Output contract eksplisit & testable | **PASS** | `AtpHasil` (`schema_version: 'atp-1.0.0'`) |
| §7 | Validator deterministik | **PASS** | 18 aturan berkode; lihat §G |
| §8 | Semantic tidak dipura-purakan | **PASS** | Pemisahan tegas di kepala `tests/atp-kontrak.test.ts` dan §11 `kontrak.ts` |
| §9 | Gerbang acuan CP sebelum funnel & sebelum kuota | **PASS** | Klien + Edge Function; urutannya diuji |
| §10 | Output yang dilihat guru (8 butir) | **PASS** | Layar review + DOCX; diverifikasi di peramban |
| §11 | Downstream compatibility | **PASS** | `generate-modul` **tidak disentuh sama sekali** |
| §12 | Acceptance cases A–J | **PASS** | 22 uji lulus |
| §13 | Tidak menyentuh produksi | **PASS** | Nol panggilan jaringan/DB/AI selama pekerjaan |

**PARTIAL yang jujur dinyatakan:**

- **A9 bagian "JP berbeda menurut tahun/periode"** — tidak dilayani. Ia bagian
  pekerjaan *fase lintas tahun*, yang SPEC §2.3 sendiri nyatakan "berlaku
  setelah pekerjaan fase lintas tahun selesai". Yang dilayani: satu angka JP
  untuk seluruh fase, dengan perbedaan antar-semester diserap A12 lewat jumlah
  minggu masing-masing. Dicatat sebagai komentar di `rancang-chat-flow.js`.

---

## C. Question Flow

| | Sebelum | Sesudah |
|---|---|---|
| Entri pertanyaan ATP aktif | **51** | **35** |
| Definisi SPEC | — | **21** (A1–A20 + A15a) |
| Fase | KONTEKS_CP(4) PROFIL_KELAS(3) PRIORITAS(5) WAKTU(16) PROFIL_SISWA(9) TARGET_FASE(5) KONTEKS_DUDI(5) PENGUATAN_PRASYARAT(2) ATP_SUMMARY(1) ATP_REVIEW(1) | KONTEKS_CP(3) PROFIL_KELAS(2) PROFIL_SISWA(6) WAKTU(13) PENGUATAN_PRASYARAT(5) KONTEKS_DUDI(4) ATP_SUMMARY(1) ATP_REVIEW(1) |

Selisih 35 vs 21: empat belas entri adalah **isian lanjutan** yang menjadi
bagian definisi induknya (uraian bebas, "lainnya", sub-isian), dan satu
(`tindakan_review_atp`) adalah tindakan pascahasil — SPEC §4 akhir menyatakan ia
bukan definisi pertanyaan tambahan.

### Daftar A1–A20 + A15a

| SPEC | Pertanyaan | Fase |
|---|---|---|
| A1 | Data kelas dan CP sudah sesuai? (4 rute, termasuk **berhenti**) | KONTEKS_CP |
| A2 | Berapa jumlah murid? | PROFIL_KELAS |
| A3 | Bahasa pengantar dan dukungan bahasa | PROFIL_KELAS |
| A4 | Kesiapan murid memulai fase | PROFIL_SISWA |
| A5 | Dasar informasi kesiapan | PROFIL_SISWA |
| A6 | Kondisi/kesulitan belajar yang perlu dicatat | PROFIL_SISWA |
| A7 | Bantuan konkret yang diperlukan murid | PROFIL_SISWA |
| A8 | Tahun pelajaran | WAKTU |
| A9 | JP per minggu | WAKTU |
| A10 | Menit per JP | WAKTU |
| A11 | Pola pertemuan (+ JP per sesi) | WAKTU |
| A12 | Minggu pembelajaran **bersih** tiap semester | WAKTU |
| A13 | Cadangan (dalam minggu) | WAKTU |
| A14 | Konfirmasi perhitungan waktu (2 rute perbaikan berbeda) | WAKTU |
| A15 | Kapan kemampuan dasar dikuatkan | PENGUATAN_PRASYARAT |
| A15a | Perlukah alokasi tersendiri (+ JP) | PENGUATAN_PRASYARAT |
| A16 | Bagian yang ingin lebih dikuatkan (maks **dua**) | PENGUATAN_PRASYARAT |
| A17 | Konteks contoh dan tugas | KONTEKS_DUDI |
| A18 | Situasi diutamakan/dihindari | KONTEKS_DUDI |
| A19 | Urutan pembelajaran (6 metode Tabel 3.3) | KONTEKS_DUDI |
| A20 | Persetujuan ringkasan arah ATP (4 rute revisi) | ATP_SUMMARY |

### Percabangan penting

1. **A1 → berhenti.** "CP ini bukan yang saya gunakan" kini menghentikan corong.
   Sebelumnya ia hanya menampilkan penjelasan lalu mengembalikan guru ke
   pertanyaan yang sama — satu-satunya jalan keluar adalah menyetujui CP yang ia
   sendiri baru nyatakan salah.
2. **A1 → perbaiki data → A1 diulang.** Setelah program keahlian diperbaiki, A1
   ditanyakan ulang; gerbang server menuntut jawabannya `sesuai`.
3. **A5 dilewati** bila A4 = "belum diketahui".
4. **A15a hanya muncul** bila A15 memerlukan penguatan; JP hanya muncul bila
   guru memilih alokasi tersendiri.
5. **A14 dua rute berbeda** — "perbaiki minggu/cadangan" mendarat di
   `minggu_efektif_mode`, "perbaiki JP/pola" mendarat di `jp_per_minggu`.
6. **A20 dan tindakan pascahasil memakai peta rute yang SAMA** (`RUTE_REVISI`),
   sehingga keduanya tidak bisa lagi berbeda.

### Pertanyaan lama yang dibuang, beserta sebabnya

| Dibuang | Sebab |
|---|---|
| `kegiatan_sudah_dikurangi`, `kegiatan_khusus`, `jp_kegiatan_khusus` | Ditanyakan dalam **JP** sementara cadangan dalam **minggu**. Seluruh kelas masalah "ATP mustahil dipenuhi" lahir dari perbedaan satuan itu. A12 menyelesaikannya di hulu. |
| `perlengkapan_kelas` (jalur ATP) | ATP berbasis teks — tidak ada alat yang boleh dituntut, jadi tidak ada yang perlu ditanyakan. Larangannya kini mutlak dan diperiksa validator. |
| `status_data_awal`, `tindakan_tanpa_data`, `sebagian_data_uraian`, `perkiraan_kemampuan_awal`, `cara_pemetaan`, `jp_pemetaan` | Enam layar yang berputar di tempat yang sama. A5 menanyakan satu hal yang benar-benar dipakai. |
| `kesulitan_mode`, `kesulitan_teks_guru` | Diganti A6 dan A7 — dua hal berbeda yang dulu tercampur. |
| Seluruh fase `TARGET_FASE` (5) | Target akhir fase sudah dinyatakan CP; meminta guru menuliskannya ulang mengundang target yang bertentangan dengan acuan resminya. |
| `timeline_tka`, `target_sekolah_detail`, `ranah_dunia_kerja`, `kebutuhan_bidang`, `batas_konteks`, `konfirmasi_dudi` | Daftar centang yang jawabannya hanya menjadi baris hiasan. |

---

## D. Question → Data → Decision Trace

Tabel penuh 35 entri: **`docs/SPEC-ATP-KONTRAK.md`** — dibangkitkan dari
`KONTRAK_PERTANYAAN` oleh `node tests/atp-trace.mjs`, sehingga ia tidak bisa
menyimpang dari kode tanpa `--periksa` gagal.

Sebaran: **18 jenis A** (masukan penyusunan), **8 jenis B** (percabangan),
**9 jenis C** (hitungan deterministik).

Cuplikan:

| Question | Stored as | Used by | Decision affected |
|---|---|---|---|
| `tingkat_kemampuan_awal` | `PROFIL_SISWA.tingkat_kemampuan_awal` | `bangunKonteksAtp`, `hitungTargetTp`, `resolveDelegasi`, `generate-modul arahanTitikAwal` | titik awal progresi, kedalaman TP awal, kepadatan TP |
| `dasar_informasi_kesiapan` | `PROFIL_SISWA.dasar_informasi_kesiapan` | `dasarProfilMurid`, `kumpulkanAsumsi` | menandai profil murid sebagai bukti atau asumsi |
| `jumlah_murid_kelas` | `rancang_settings.jumlah_murid` | `bangunKonteksAtp → batas_mutlak` | melarang tujuan yang menuntut tiap murid dinilai satu per satu |
| `minggu_sem1` / `minggu_sem2` | `WAKTU.minggu_sem*` | `hitungAlokasi` | JP yang boleh ditempatkan di tiap semester |
| `metode_pengurutan` | `KONTEKS_DUDI.metode_pengurutan` | `resolveDelegasi → prioritas_guru` | urutan TP sepanjang fase |
| `konfirmasi_konteks` | `KONTEKS_CP.konfirmasi_konteks` | gerbang EF langkah 5 | menghentikan proses tanpa memakai kuota |

**Jaminan tidak ada masukan yatim:** uji `KONTRAK: setiap pertanyaan ATP aktif
punya entri kontrak, dan sebaliknya` membaca `rancang-chat-flow.js` apa adanya,
mengambil daftar fase dari `FASE_URUTAN_V1` di berkas yang sama, lalu
membandingkan dua arah. Ia gagal kalau ada pertanyaan tanpa kontrak **atau**
kontrak tanpa pertanyaan.

---

## E. ATP Schema / Contract

Disimpan di `atp_induk.collected_data.ATP_HASIL` — **bukan kolom baru**.
`collected_data` sudah `jsonb` dan sudah bisa ditulis lewat policy yang ada,
sehingga kontrak ini **tidak menuntut satu pun migration**.

```ts
export const SKEMA_ATP = 'atp-1.0.0';

export type TpEntry = {
  nomor: number;
  judul: string;
  elemen: string[];        // id elemen CP — allowlist
  tuntutan?: string[];     // BARU — id tuntutan CP dari acuan
  jp_alokasi: number;
  jp_pertemuan: number[];
  semester?: number;       // BARU — 1 atau 2, tidak boleh terbelah
  konteks?: string[];
  tipe?: 'inti' | 'prasyarat' | 'pengayaan';
  catatan?: string;
};

export type AtpHasil = {
  schema_version: string;                      // 'atp-1.0.0'
  disusun_pada: string;
  acuan_cp: { versi; mapel; fase; versi_cp } | null;
  ringkasan: {
    jumlah_tp; total_jp; satuan_pertemuan; jumlah_pertemuan;
    target_jumlah_tp; asal_target_tp: 'permintaan guru' | 'hitungan MiClass';
  };
  anggaran_semester: { semester; minggu; jp }[];
  dasar_penyusunan: {
    dasar_profil_murid: string;                // A5 → kalimat
    konteks_dari_guru: string[];               // yang guru berikan
    keputusan_miclass: KeputusanMiClass[];     // yang didelegasikan + alasan
    asumsi: Asumsi[];                          // yang belum berasal dari bukti
  };
  cakupan_cp: {
    diperiksa: boolean;
    tuntutan_wajib: string[]; tuntutan_tercakup: string[]; tuntutan_belum: string[];
  };
};
```

**Setiap field punya konsumen.** `tuntutan` → validator C3–C5 + DOCX + layar
review. `semester` → validator W7/W8 + pemisah di layar + penanda di DOCX.
`dasar_penyusunan` → layar review + DOCX. `cakupan_cp` → keduanya.
`ringkasan.asal_target_tp` → membedakan permintaan guru dari hitungan MiClass.
Tidak ada field dekoratif.

---

## F. Generator Changes

### F.1 System prompt

**BEFORE** (`index.ts:88–163`, ringkas): aturan bentuk keluaran DICAMPUR dengan
penerangan konteks — aturan 7 menjelaskan apa arti `perlengkapan_tersedia`,
aturan 8 menjelaskan apa arti `jumlah_murid`, keduanya sambil melarang.

**AFTER**: prompt hanya berisi **aturan**; konteks datang sebagai bagian
bermakna berbahasa manusia. Bagian baru:

- `ARITMETIKA — MUTLAK` (4 syarat, termasuk keseimbangan per semester)
- `JUMLAH TP` (angka dari MiClass, bukan selera penyusun)
- `CARA MEMAKAI TIAP BAGIAN KONTEKS` — tujuh bagian, masing-masing menyatakan
  apa yang harus ia pengaruhi
- Bahasa judul TP: larangan jargon + contoh BAIK/BURUK, termasuk contoh buruk
  baru "menuntut bahan yang tidak ada"

### F.2 User-message builder

**BEFORE** — gumpalan JSON berisi kunci mesin:

```ts
const userMessage = JSON.stringify({
  mapel, fase, jenjang, program_keahlian, target_fase, elemen_cp,
  jp_operasional: jpOp, jp_per_pertemuan, pola_jadwal,
  target_fase_detail: targetFase,
  prioritas,                    // collected_data mentah
  profil_siswa:   profilSiswa,  // collected_data mentah
  konteks_dudi:   konteksDudi,  // collected_data mentah
  penguatan_prasyarat: prasyarat,
  metode_pengurutan, perlengkapan_tersedia, jumlah_murid, sumber_flow,
  instruksi: ...,
});
```

`prioritas`, `profil_siswa`, `konteks_dudi`, `penguatan_prasyarat` dikirim apa
adanya — termasuk nilai seperti `sedikit_di_bawah`, `pasif_sangat_heterogen`,
`terintegrasi`. Model diharapkan menafsirkannya sendiri.

**AFTER** — tujuh bagian semantik:

```ts
const userMessage = JSON.stringify({
  cp_anchor:               konteks.cp_anchor,
  kesiapan_murid:          konteks.kesiapan_murid,
  prioritas_guru:          konteks.prioritas_guru,
  konteks_kejuruan:        konteks.konteks_kejuruan,
  anggaran_waktu:          konteks.anggaran_waktu,
  keputusan_didelegasikan: konteks.keputusan_didelegasikan,
  batas_mutlak:            konteks.batas_mutlak,
  instruksi: ...,
});
```

Contoh isi nyata (dari uji, kesiapan `jauh_di_bawah`):

```
kesiapan_murid[0]  "Banyak kemampuan dasar yang masih harus dibangun sebelum
                    murid dapat mengerjakan tuntutan fase ini."
kesiapan_murid[1]  "Gambaran kesiapan ini berasal dari pengamatan dan pengalaman
                    mengajar guru."
prioritas_guru[1]  "Penekanan ini mengatur porsi waktu dan urutan. Ia TIDAK
                    menentukan bagian CP yang boleh diabaikan..."
batas_mutlak[3]    "Keterbatasan ini TIDAK boleh dipakai untuk menghapus,
                    menurunkan, atau mengganti tuntutan CP..."
```

Uji `BAHASA: tidak ada kunci mesin yang lolos ke prompt` memeriksa sebelas kunci
mesin tidak muncul di gabungan seluruh bagian.

### F.3 Deterministic inputs

Tiga hal dipindah dari model ke kode:

1. **`hitungAlokasi()`** — dihitung ULANG di server dari `collected_data`,
   bukan dibaca dari `WAKTU.perhitungan` yang klien tulis.
2. **`hitungTargetTp()`** — jumlah TP dari jam tersedia dan kesiapan murid.
3. **`resolveDelegasi()`** — keputusan "tentukan saat menyusun", beserta
   alasannya, sebelum prompt dibangun.

---

## G. Validation

Kolom "Failure behavior": seluruh aturan menjalankan **satu percobaan perbaikan**
dengan daftar galat berkode dikirim utuh ke model; kalau tetap gagal, ATP
**tidak ditulis sama sekali** dan kode kegagalan spesifik dikembalikan.

| Rule | Deterministic/Semantic | Yang ditolak | Test |
|---|---|---|---|
| S1 | D | bukan array / kosong | CAKUPAN |
| S2 | D | nomor TP tidak berurutan | (struktur) |
| S3 | D | judul kosong | (struktur) |
| C1 | D | TP tanpa satu pun elemen CP | CAKUPAN |
| C2 | D | id elemen di luar allowlist | CAKUPAN |
| C3 | D | TP tidak menyebut tuntutan CP yang dilayaninya | CAKUPAN |
| C4 | D | id tuntutan karangan | CAKUPAN |
| C5 | D | **tuntutan CP tidak terpetakan ke TP mana pun** | CAKUPAN |
| W1 | D | `jp_alokasi` bukan integer > 0 | ARITMETIKA |
| W2 | D | `jp_alokasi` bukan kelipatan satuan pertemuan | CASE G |
| W3 | D | `jp_pertemuan` bukan array berisi | (struktur) |
| W4 | D | `sum(jp_pertemuan) ≠ jp_alokasi` | (struktur) |
| W5 | D | angka pertemuan ≠ satuan pertemuan | (struktur) |
| W6 | D | `sum(jp_alokasi) ≠ jp_operasional` | CASE G |
| W7 | D | semester TP di luar 1/2 | CASE G |
| W8 | D | **jumlah JP per semester ≠ anggarannya** | CASE G |
| K1 | D | jumlah TP meleset > 1 dari target | KEPADATAN |
| B1 | D | **ketergantungan bahan yang tidak dijamin** (7 pola) | CASE D, CASE J |
| B2 | D | jargon terlarang di judul (9 pola) | CASE J |
| B3 | D | judul > 16 kata | CASE J |
| Gerbang acuan CP | D | kombinasi mapel/fase belum dilayani | CASE I |
| Makna TP vs CP | **SEMANTIC** | — | **tidak dipasang; menunggu telaah manusia** |
| Kepedagogisan urutan | **SEMANTIC** | — | **tidak dipasang** |
| Dominasi konteks kejuruan | **SEMANTIC** | — | **tidak dipasang** |

### Kalibrasi B1/B3 — diukur, bukan diyakini

Diuji terhadap **16 judul TP ATP produksi** (`tests/fixtures/atp-produksi.json`,
diekstrak dari `docs/ATP_Bahasa_Inggris_FaseE.docx`):

- **B1: nol salah tuduh.** Batas kata `\b` di kedua sisi, sehingga
  "mengaplikasikan" tidak tertangkap `/aplikasi/` dan "menggambarkan" tidak
  tertangkap `/gambar/`.
- **B3: batasnya 16, bukan 12.** Judul terpanjang produksi **15 kata**, dan
  **10 dari 16** melewati 12 kata yang diminta prompt. Gerbang keras di 12 akan
  **menjatuhkan setiap ATP yang pernah MiClass hasilkan**. Prompt tetap meminta
  12; validator menolak di 17. Selisihnya ruang toleransi yang disengaja.
- **K1 toleransi satu TP.** Perintahnya berbunyi "sekitar"; menolak seluruh ATP
  karena meleset satu TP membakar satu dari tiga jatah harian guru.

---

## H. CP Gate

Dua lapis, keduanya membaca sumber yang sama (`shared/data/cp-acuan.json`,
disalin ke `supabase/functions/generate-atp/acuan-cp.ts` — sinkronnya dijaga
`tests/atp-acuan-sinkron.mjs`).

**Lapis 1 — klien**, di `rancang-chat.js` sebelum layar sambutan dirender dan
sebelum satu pertanyaan pun tampil. Guru melihat penjelasan, bukan corong.

**Lapis 2 — Edge Function**, langkah 5a. **Berdiri sebelum rate limit dan
sebelum panggilan AI mana pun**, sehingga menabraknya tidak memakan jatah
harian. Urutan itu sendiri diuji:

```
CASE I: gerbang acuan CP berdiri sebelum rate limit di Edge Function
  gerbang(ATP_ACUAN_CP_TIDAK_TERSEDIA) < rateLimit(svc.rpc('fn_check_rate_limit'))
  gerbang < panggilAi(generativelanguage.googleapis.com)
```

Diverifikasi di peramban (`http://localhost:8788/tmp/harness/gate.html`):

```
Bahasa Inggris · Fase E  ->  TERBUKA
bahasa inggris · Fase e  ->  TERBUKA
Matematika · Fase E      ->  DITUTUP
Bahasa Inggris · Fase F  ->  DITUTUP
ENGLISH SUBJECT · Fase E ->  DITUTUP
Gerbang berperilaku benar untuk kelima kasus.
```

Acuan CP tidak mengarang CP. Ia menguraikan **tuntutan** dari teks CP resmi yang
sudah ada di `cp-data.json`, menambahkan penilaian kelayakan dilayani teks, dan
diberi versi. Saat ini terisi satu kombinasi: **Bahasa Inggris Fase E, 3 elemen,
7 tuntutan** — sesuai SPEC §2.3 yang membatasi kohor ke kombinasi yang sudah
terbukti terlayani teks.

---

## I. Renderer

### I.1 Layar review ATP (`rancang-chat.js`)

- Daftar TP kini dipisah **penanda semester** dengan total JP tiap semester.
- Fungsi baru `renderDasarPenyusunan()` menampilkan empat bagian **terpisah**:
  profil murid (dasarnya), konteks yang Anda berikan, keputusan yang MiClass
  ambil untuk Anda (+ alasan), bagian yang masih berupa asumsi. Lalu cakupan CP.
- Ringkasan waktu kini menampilkan **anggaran per semester sebelum guru
  menyetujui**, selagi ia masih bisa mengubah jumlah minggunya.

### I.2 DOCX ATP (`classroom-unduh.js`)

- `fetchAtpAktif` kini ikut mengambil `collected_data`.
- Identitas bertambah: **Pembagian Semester**, **Acuan CP**.
- Bagian **Dasar Penyusunan** ditempatkan **sebelum** daftar TP, bukan sebagai
  lampiran di belakang: sesudah membaca dua puluh judul TP, bukti/keputusan/
  asumsi sudah terlanjur terbaca sebagai fakta yang setara.
- Tiap TP: penanda semester + **Tuntutan CP yang dilayani** (kalimat
  kompetensinya, bukan kode `BIE-MM-2`).

**Diverifikasi di peramban** — dokumen dirender oleh kode kirim yang
sebenarnya, lalu isinya dibaca kembali dari `word/document.xml`:

```
Semua bagian wajib tercetak: Dasar Penyusunan | Konteks yang diberikan guru |
Keputusan yang ditetapkan MiClass | Bagian yang masih berupa asumsi |
Cakupan Capaian Pembelajaran | Semester 1 | Semester 2 |
Tuntutan CP yang dilayani | Pembagian Semester
Tidak ada kode mesin (kata bergaris bawah) di dokumen.
```

**Kompatibilitas mundur diverifikasi terpisah** dengan ATP lama (tanpa
`ATP_HASIL`, tanpa `semester`, tanpa `tuntutan`):

```
Dokumen ATP LAMA berhasil dirender tanpa galat.
ATP lama tercetak apa adanya: tidak ada bagian baru yang dikarang,
tidak ada undefined, TP dan elemen utuh.
```

---

## J. Downstream Compatibility

**`generate-modul` TIDAK DISENTUH.** `git diff --stat -- supabase/functions/generate-modul/`
kosong. Tidak ada compatibility patch yang diperlukan.

Yang dibaca `generate-modul` dari ATP, dan buktinya masih tersedia:

| Dibaca | Status |
|---|---|
| `atp.progresi_tp[].nomor`, `.judul`, `.jp_alokasi`, `.jp_pertemuan` | **utuh** — field lama tidak satu pun dihapus |
| `atp.elemen_cp` | **utuh** |
| `atp.collected_data.WAKTU.durasi_jp` / `durasi_jp_lain` | **utuh** — A10 memakai id dan nilai yang sama (`45/40/35/lain`) |
| `atp.collected_data.PROFIL_SISWA.tingkat_kemampuan_awal` | **utuh** — A4 mempertahankan keempat kunci `ARAHAN_TITIK_AWAL` |

Nilai baru `belum_diketahui` pada A4 **sengaja tidak punya entri** di
`ARAHAN_TITIK_AWAL`: `arahanTitikAwal()` mengembalikan `null` dan modul kembali
ke perilaku lama, bukan menebak.

Jalur Modul (M1–M11) tidak diubah. `PROFIL_KELAS_IDS` sengaja **tetap** memuat
`perlengkapan_kelas` karena jalur Modul memakainya sebagai syarat jalur
mundurnya sendiri; kelengkapan menurut corong ATP dihitung terpisah lewat
`PROFIL_KELAS_ATP_IDS`.

---

## K. Acceptance Cases A–J

`deno test --allow-read tests/atp-kontrak.test.ts` → **22 passed | 0 failed**

| Case | Expected | Test/fixture | Result |
|---|---|---|---|
| **A** readiness sangat rendah | progresi realistis dari titik awal; tuntutan CP tidak berkurang; waktu/dukungan tercermin | `CASE A` — 4 asersi | **PASS (deterministik)** |
| **B** readiness lebih tinggi | ATP tidak identik; bedanya dijelaskan readiness, bukan keacakan | `CASE B` — target TP berbeda, konteks berbeda, dua panggilan identik | **PASS (deterministik)** |
| **C** konteks kejuruan berbeda | kompetensi CP identik; konteks berbeda | `CASE C` — Busana vs Teknik Otomotif | **PASS (deterministik)** |
| **D** tanpa bahan audiovisual | TP audiovisual ditolak; menyimak tetap boleh | `CASE D` — 1 lolos, 4 ditolak | **PASS** |
| **E** kelas besar | tidak menuntut tiap murid tampil satu per satu; rotasi tidak dipaksa ke judul | `CASE E` — 36 / 12 / tidak diketahui | **PASS** |
| **F** prioritas berbeda | cakupan CP utuh; penekanan berubah | `CASE F` | **PASS** |
| **G** waktu semester berbeda | sum per periode tepat; tidak ada JP hilang/muncul | `CASE G` — 4 konfigurasi + uji pergeseran | **PASS** |
| **H** keputusan didelegasikan | MiClass memutuskan, keputusan tersimpan & ditampilkan, guru tahu atas dasar apa | `CASE H` — 5 asersi | **PASS** |
| **I** CP tidak tersedia | dihentikan sebelum generate; tanpa AI; tanpa kuota | `CASE I` ×2 — nilai + urutan kode | **PASS** |
| **J** resource dependency | validator menolak; nol salah tuduh pada 16 judul produksi | `CASE J` ×3 | **PASS** |

### SEMANTIC ACCEPTANCE — belum dibuktikan, dinyatakan terbuka

Uji di atas membuktikan bahwa **masukan yang berbeda menghasilkan perintah dan
penolakan yang berbeda** — bukan bahwa keluaran AI-nya benar. Tiga hal berikut
**tidak diuji dan tidak boleh dianggap selesai**:

1. Apakah TP yang dihasilkan benar-benar mewakili makna tuntutan CP yang ia
   klaim layani.
2. Apakah urutan TP-nya pedagogis.
3. Apakah konteks kejuruan mendominasi sampai menggeser kompetensi mapel.

Ketiganya menuntut **satu generate nyata terhadap kombinasi terlayani, lalu
telaah manusia** — dan generate nyata menulis ke produksi, yang dilarang dalam
pekerjaan ini. Ini gap ATP yang sebenarnya; lihat §N.

---

## L. Tests Run

```
$ deno test --allow-read tests/atp-kontrak.test.ts
ok | 22 passed | 0 failed (166ms)

$ node tests/atp-acuan-sinkron.mjs
LULUS — acuan CP sinkron (supabase/functions/generate-atp/acuan-cp.ts)

$ node tests/atp-trace.mjs --periksa
LULUS — docs/SPEC-ATP-KONTRAK.md sesuai dengan kontrak di kode.

$ deno check supabase/functions/generate-atp/index.ts supabase/functions/generate-atp/kontrak.ts
Check supabase/functions/generate-atp/index.ts
Check supabase/functions/generate-atp/kontrak.ts

$ deno lint supabase/functions/generate-atp/
Found 1 problem   (no-import-prefix pada esm.sh — pre-existing, tidak diubah)

$ node --check guru/js/rancang-chat.js && node --check guru/js/rancang-chat-flow.js \
    && node --check guru/js/classroom-unduh.js
sintaks klien OK

$ node tests/verify-migrations.mjs
File lokal : 140 | Terdaftar di DB: 140
✅ KONSISTEN
```

**Uji peramban** (server statis lokal `python -m http.server 8788` lewat
`.claude/launch.json` yang sudah ada; hanya membaca berkas dari disk, tidak
menyentuh Supabase):

1. Corong ATP dijalankan penuh dengan penjawab terskrip — **27 layar**, semua
   nilai ada di daftar opsinya, nol galat konsol.
2. Ringkasan waktu: `126 JP — 63 pertemuan`, semester 66 + 60 = 126 **COCOK**,
   sisa bagi 0.
3. DOCX ATP dirender lalu dibaca kembali — semua bagian wajib ada, nol kode
   mesin.
4. DOCX ATP lama (skema lama) — tercetak utuh, nol bagian karangan.

---

## M. Files Changed

**Diubah (7):**

```
CLAUDE.md                                |  44 +-
guru/classroom.html                      |  13 +-   (cache bust + muat cp-acuan)
guru/js/classroom-unduh.js               | 143 ++-  (DOCX ATP)
guru/js/rancang-chat-flow.js             | 668 +-   (21 definisi SPEC)
guru/js/rancang-chat.js                  | 661 +-   (waktu, gerbang, render, rute)
supabase/functions/generate-atp/index.ts | 685 +-   (kontrak, gerbang, output)
sw.js                                    |   2 +-   (miclass-v23 → v24)
```

**Baru (7):**

```
shared/data/cp-acuan.json                       acuan CP berversi (sumber)
supabase/functions/generate-atp/acuan-cp.ts     salinan EF (dibangkitkan)
supabase/functions/generate-atp/kontrak.ts      kontrak ATP — 1.017 baris, murni
tests/atp-kontrak.test.ts                       uji penerimaan A–J — 719 baris
tests/atp-acuan-sinkron.mjs                     penjaga sinkron acuan CP
tests/atp-trace.mjs                             pembangkit dokumen jejak
tests/fixtures/atp-produksi.json                16 judul TP produksi (kalibrasi)
docs/SPEC-ATP-KONTRAK.md                        jejak pertanyaan→data→keputusan
docs/LAPORAN-ATP-FINALIZATION.md                laporan ini
```

**Tidak ada migration.** Kontrak baru muat di `collected_data` yang sudah `jsonb`.

**Tidak di-commit.** Perubahan ada di working tree untuk ditinjau.

---

## N. Remaining Gaps — ATP saja

1. **Belum ada generate nyata.** Seluruh bukti di atas deterministik atau
   fixture. Belum ada satu pun ATP yang benar-benar disusun AI di bawah kontrak
   baru, karena itu menulis ke produksi. **Ini gap terbesar** — §K SEMANTIC
   ACCEPTANCE bergantung padanya.
   *Yang dibutuhkan:* deploy `generate-atp`, satu generate terhadap kelas
   Bahasa Inggris Fase E, lalu telaah manusia atas hasilnya.

2. **Acuan CP baru satu kombinasi.** Bahasa Inggris Fase E, 3 elemen,
   7 tuntutan, diperiksa manusia. Setiap kombinasi lain tertutup — sesuai SPEC
   §2.3, tapi artinya kohor tidak bisa diperluas tanpa kurasi acuan. Uraian
   tuntutannya juga belum pernah divalidasi ahli kurikulum; ia turunan langsung
   dari kalimat `cp_normatif`.

3. **Risiko kepatuhan model terhadap dua kontrak baru belum terukur:** apakah
   model benar-benar mengisi `tuntutan[]` dengan id yang tepat, dan apakah ia
   dapat memenuhi keseimbangan per semester tanpa banyak putaran perbaikan.
   Keduanya satisfiable secara aritmetika (dibuktikan `atpSah()` di uji), tapi
   tingkat kepatuhan nyata hanya terukur setelah beberapa generate. Kalau
   ternyata tinggi kegagalannya, yang perlu dilonggarkan lebih dulu adalah K1,
   bukan W8.

4. **A9 lintas tahun belum dilayani** — sadar, sesuai SPEC §2.3. Lihat §B.

5. **Guru masih tidak bisa menyunting hasil.** Di luar cakupan tugas ini, tapi
   ia berinteraksi langsung dengan ATP: satu-satunya "revisi" tetap menyusun
   ulang, yang memakan jatah harian. Kontrak baru memperbaiki sebagiannya
   (empat rute revisi yang mengubah jawaban lalu menyusun ulang), tidak
   seluruhnya.

**Tidak dimasukkan sebagai gap ATP:** seluruh pekerjaan Modul Ajar dan Naskah
Fasilitasi.
