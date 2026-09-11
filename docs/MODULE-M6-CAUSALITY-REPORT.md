# MODULE M6 — CONTEXT / TIME CAUSALITY

Laporan untuk ditinjau. Bukti diff verbatim: `docs/MODULE-M6-CAUSALITY-EVIDENCE.diff`.

Rantai yang M6 buat dapat ditelusuri:

```
konteks ATP → keputusan rancangan → komponen modul yang terdampak
```

**Tiga tingkat, dan M6 hanya menegakkan dua:**

| | |
|---|---|
| konteks **ADA** | sudah dijamin M2 |
| konteks **DIGUNAKAN** (dapat ditelusuri) | ditegakkan M6 |
| keputusannya **TEPAT secara pedagogis** | **M9**, bukan di sini |

Tidak ada satu pun pencocokan kata di M6 — tidak ada pencarian "scaffold",
"sederhana", atau "bertahap". Apakah *"tambah contoh bertahap"* memang jawaban
yang benar untuk kesiapan `jauh_di_bawah` adalah pembacaan makna, dan menilainya
dengan daftar kata hanya akan berpura-pura. Tidak ada "context compliance score".

---

## 1. Checkpoint M5

```
MODULE M5 ACCEPTED BASELINE COMMIT = a12d8f7
```

Commit lokal, belum di-push. Berisi enam berkas M5 (`contract.ts`, `index.ts`,
`tests/modul-contract.test.ts`, `tests/modul-resource.test.ts`, dan dua dokumen
bukti) — 3.166 insertions. M5 suite 41/0 sebelum commit. Pemindaian rahasia
bersih; artefak eksperimen (`tests/artifacts/`, `tmp/`, `tmp_*.sql`, `hatpt/`,
`prompt codex/`, docx dan laporan lepas) tetap untracked.

---

## 2. Audit: bagaimana konteks masuk ke generation path

Dibaca dari sumber aktual sebelum satu baris pun ditulis.

| Konteks | Otoritas | Sampai ke model? | Efek STRUKTURAL sebelum M6 |
|---|---|---|---|
| Kesiapan murid | `atp_context.kesiapan_murid` | ya, lewat `warisanKonteks()` | **tidak ada** |
| A17 / konteks tugas | `atp_context.konteks_tugas` (`konteksTugasEfektif()` di `warisan.ts`) | ya, sebagai `konteks_contoh_dan_tugas` | **tidak ada** |
| Penekanan guru | `atp_context.prioritas_guru` | ya, sebagai `penekanan_guru` | **tidak ada** |
| `penerapan_prioritas` | `atp_context.penerapan_prioritas.untuk_tp_ini` | ya | **tidak ada** |
| Program keahlian | `atp_context.program_keahlian` (potret ATP, M2.1) | ya | **tidak ada** |
| Jumlah murid | `atp_context.jumlah_murid` + parameter validator | ya | **ADA — kuat** (lihat §10) |
| Alokasi pertemuan | `alokasi_server` | ya | **ADA — kuat** (V1/V2) |

Jadi dari tujuh konteks, **dua** sudah punya akibat struktural nyata dan **lima**
hanya metadata. `atp_context` disebut validator hanya di dua tempat: deklarasi
tipe dan pemeriksaan keberadaan akar M2. Tidak satu pun aturan membacanya.

### Yang hanya semantik, dan karena itu ditahan untuk M9

- apakah tingkat scaffolding yang dipilih **cocok** dengan kesiapan;
- apakah konteks kejuruan yang dipakai **autentik** secara profesional;
- apakah penerapan penekanan guru **bermakna** atau sekadar menempel;
- apakah kompleksitas awal, progresi, dan bentuk diferensiasi **tepat**.

Semua itu memerlukan pembacaan makna. M6 tidak menyentuhnya.

---

## 3. Gap yang direproduksi

Probe deterministik, sebelum implementasi:

```
DITOLAK/LOLOS? → LOLOS
  modul yang MENGABAIKAN seluruh konteks ATP
  (kesiapan jauh_di_bawah, A17 dominan_kerja, 2 penekanan guru, Tata Busana)

akar dokumen bernuansa jejak keputusan: (TIDAK ADA)

Konteks DIBALIK TOTAL, desain modul sama persis: tetap LOLOS
```

Itu bentuk paling tajam dari gapnya: `kesiapan_murid` diubah dari `jauh_di_bawah`
menjadi `jauh_di_atas`, A17 dari `dominan_kerja` menjadi `dominan_sekolah`,
seluruh penekanan guru dihapus — dan dokumen yang sama persis tetap lolos.

**Konteks yang tidak dapat mengubah apa pun bukan konteks; ia hiasan.**

Terpasang permanen sebagai `M6-REPRO-1` dan `M6-REPRO-2`.

Yang **tidak** menjadi gap, dan karena itu tidak disentuh: kelayakan waktu dan
logistik jumlah murid (§10).

---

## 4. Perubahan kontrak/schema

`contract.ts` — satu bagian akar baru dan tiga tabel:

| Tambahan | Peran |
|---|---|
| `KONTRAK_ROOT.keputusan_kontekstual` | jejak kausal, Fase A, `min: 1` |
| `ENUM_KONTRAK.jenis_sumber_konteks` | lima sumber: kesiapan, konteks tugas, penekanan guru, program keahlian, jumlah murid |
| `AWALAN_KOMPONEN` | bentuk rujukan komponen — satu otoritas untuk validator dan uji |
| `SUMBER_WAJIB_BERJEJAK` | konteks yang WAJIB punya jejak: kesiapan + konteks tugas |

Bentuk yang model diminta hasilkan:

```json
"keputusan_kontekstual":[
  {"id":"KTX-01","sumber":{"jenis":<jenis_sumber_konteks>,"kunci":string},
   "keputusan":string,"komponen_terdampak":["pertemuan:1"],"penerapan":string}
]
```

**`required: false` disengaja.** Pemeriksaan bentuk akar yang umum berlaku untuk
SEMUA dokumen termasuk yang historis; bagian ini hanya dituntut pada penyusunan
sekarang, jadi penegakannya dinyalakan pemanggil. Prompt tetap memintanya —
`kerangkaFase()` menyertakan setiap bagian yang punya `bentuk`, tanpa melihat
`required`. `M6-KONTRAK` memakukan keputusan ini agar tidak diubah tanpa sadar.

`MODUL_SCHEMA_VERSION` **tidak dinaikkan** — M4–M7 satu rangkaian pengerasan V4
yang belum dirilis, konsisten dengan §22 M4.

**Tidak ada migration, dan tidak ada yang membutuhkannya.** Seluruhnya sifat
keluaran Edge Function.

Mekanisme M3 kembali terbukti: bentuk ditulis di **satu** tempat, lalu prompt
Fase A dan pesan perbaikan per fase mengikuti tanpa disunting (`M6-KONTRAK`).

---

## 5. Causal trace yang ditambahkan

`index.ts`, bendera `wajibKausalitasCurrent` (satu per milestone, pola sama
dengan M2/M4/M5). Yang ditegakkan, seluruhnya deterministik:

| Aturan | Uji |
|---|---|
| jejak ada, ≥ 1 entri | `M6-A` |
| id `KTX-01…` berurutan, unik, tidak kosong | `M6-B` |
| `keputusan` dan `penerapan` tidak kosong | `M6-C` |
| `sumber` ada; `jenis` dari enum | `M6-D`, `M6-E` |
| **`sumber.kunci` cocok dengan nilai di potret ATP** | `M6-F`, `M6-G`, `M6-H` |
| `komponen_terdampak` ≥ 1, berbentuk `<jenis>:<id>` | `M6-I`, `M6-J` |
| komponen yang ditunjuk **benar-benar ada** (5 jenis) | `M6-K`, `M6-L` |
| cakupan konteks wajib | `M6-N`…`M6-R` |

Rujukan komponen sengaja berawalan tetap, bukan kalimat bebas — yang dapat
diperiksa deterministik hanyalah rujukan yang punya bentuk:

```
pertemuan:1   sub_langkah:P1.MEMAHAMI.1   kktp:K1   asesmen:FMT-01   instrumen:PBL-01
```

Pesan galat menyebut nilai yang SAH agar perbaikannya satu putaran — mis. jejak
yang menunjuk penekanan `numerasi` dijawab dengan daftar penekanan yang guru
benar-benar pilih (`M6-G`).

---

## 6. Readiness

`atp_context.kesiapan_murid` wajib punya ≥ 1 jejak keputusan bila ATP
menetapkannya (`M6-N`). Kuncinya wajib **persis** nilai yang ATP wariskan:
jejak yang menyebut `sedikit_di_bawah` sementara ATP menyatakan `jauh_di_bawah`
ditolak (`M6-F`).

Yang **tidak** dilakukan: menilai apakah scaffolding/kompleksitas/progresi yang
dipilih cocok dengan tingkat kesiapan. Itu M9, dan tidak ada heuristik bahasa
yang dipasang untuk menirunya.

---

## 7. A17

A17 = `konteks_tugas`, diselesaikan `konteksTugasEfektif()` di `warisan.ts` dan
diwarisi ke `atp_context.konteks_tugas`. M6 tidak mengarang tafsir baru dan tidak
menyentuh penyelesaiannya — ia memakai nilai dan semantik yang ATP sudah putuskan.

Wajib berjejak bila ATP menetapkannya (`M6-O`); **tidak** dituntut bila ATP
membiarkannya null (`M6-R`).

Satu detail yang perlu terlihat: nama enum (`konteks_tugas`) berbeda dari nama
field yang model lihat (`konteks_contoh_dan_tugas`). Tanpa peta, model harus
menebak dan tebakannya akan gagal validasi — jadi petanya disematkan ke `catatan`
kontrak dan ikut ke prompt. `M6-KONTRAK` menjaganya.

---

## 8. Penekanan guru

Dua otoritas dibedakan, dan itu inti keadilannya:

- `atp_context.prioritas_guru` — seluruh penekanan yang guru pilih;
- `atp_context.penerapan_prioritas.untuk_tp_ini` — yang **ATP nyatakan berlaku
  bagi TP ini**.

Yang **wajib** diterapkan hanyalah yang kedua (`M6-P`). Penekanan yang ATP
tempatkan di TP lain **tidak** dipaksakan (`M6-Q`) — memaksa setiap penekanan
memengaruhi setiap TP hanya menghasilkan kaitan yang dibuat-buat, dan ATP sudah
memutuskan mana yang relevan.

Jejak yang menyebut penekanan yang tidak pernah guru pilih ditolak (`M6-G`).

---

## 9. Program keahlian / konteks kejuruan

Otoritasnya potret ATP (`atp_context.program_keahlian`, keputusan M2.1) — bukan
setelan kelas sekarang. M6 tidak mengambil authority baru dan tidak membuka M2.

**Tidak wajib berjejak** (`M6-S`). Ada TP yang tidak bertambah baik karena
dikaitkan ke dunia kerja, dan memaksanya menghasilkan kaitan artifisial — persis
yang reviewer larang.

Tetapi **bila** dijejakkan, sumbernya wajib potret ATP: jejak yang menyebut
`Tata Boga` sementara ATP menyatakan `Tata Busana` ditolak (`M6-T`). Itulah
bentuk penjagaan yang M6 dapat berikan — keautentikan profesionalnya M9.

---

## 10. Jumlah murid, logistik, dan kelayakan waktu

**Sebagian besar area ini sudah ditegakkan sebelum M6, dan M6 tidak
membangunnya ulang.** Menambahkan aturan kedua di atasnya hanya akan menghasilkan
dua otoritas yang bisa bertengkar.

Yang sudah ada, seluruhnya dihitung dari angka terstruktur:

| Aturan | Isi |
|---|---|
| V3 | `bergantian`: `waktuPerKelompok()` — jumlah kelompok dari jumlah murid dan `ukuran_kelompok`, plus transisi, dengan lantai 3 menit (latihan) / 4 menit (sumatif) |
| V4b | slot SUMATIF dinilai **per murid**: `jumlah_murid × 2 menit + transisi` |
| V4 | `individual` + `mode_observasi: semua`: `jumlah_murid × 2 menit` |
| V9 | kontrak `mode_pelaksanaan` × `mode_observasi` |
| V1/V2 | rantai durasi: Σ sub_langkah = durasi langkah; Σ langkah = JP × menit |

Ketiganya menjawab persis contoh yang reviewer sebut: presentasi satu per satu
yang mustahil, observasi semua murid dalam durasi yang tidak memungkinkan, dan
jumlah putaran yang tidak cocok dengan waktu.

`M6-V` dan `M6-W` menjaga agar keduanya tidak diam-diam hilang.

**Tidak ada asumsi durasi baru yang ditambahkan.** Lantai 2 menit dan 3/4 menit
sudah ada sebelum M6 dan terdokumentasi di sumbernya. Di mana keluaran tidak
punya angka yang cukup untuk menghitung kelayakan, M6 **tidak menebak** — dan
tidak memasang validator palsu. Jumlah murid karena itu **tidak** masuk daftar
wajib berjejak (`M6-U`): penegakan struktural yang menghitung jauh lebih kuat
daripada sebuah jejak kalimat.

---

## 11. Uji deterministik

`tests/modul-kausalitas.test.ts` — **29 passed / 0 failed**. Tanpa panggilan model.

```
deno test --allow-read --allow-write tests/modul-kausalitas.test.ts
```

Terhadap strategi uji yang reviewer minta:

| | Uji |
|---|---|
| **A.** konteks dibawa tetapi tidak dipakai | `M6-REPRO-1`, `M6-REPRO-2`, `M6-N`, `M6-O`, `M6-P` |
| **B.** sumber konteks tidak dikenal | `M6-E`, `M6-F`, `M6-G`, `M6-T`, `M6-U` |
| **C.** jejak sah → lolos | `M6-BASE`, `M6-L`, `M6-Q`, `M6-R`, `M6-S` |
| **D.** penekanan guru menunjuk otoritas yang benar | `M6-G`, `M6-P`, `M6-Q` |
| **E.** kelayakan waktu (hanya yang dapat dihitung) | `M6-V`, `M6-W` |
| **F.** modus historis | `M6-HIST` |

Setiap uji penolakan memeriksa **sebab**-nya lewat pembantu `tolak()`, bukan
hanya `valid === false`. Pasangan positif/negatif ada untuk setiap aturan.

---

## 12. Regresi

| Suite | Sebelum | Sesudah |
|---|---|---|
| ATP `atp-kontrak.test.ts` | 60/0 | **60/0** |
| ATP `atp-acuan-sinkron.mjs` | LULUS | **LULUS** |
| ATP `atp-trace.mjs --periksa` | LULUS | **LULUS** |
| M1 `modul-anchor.test.ts` | 29/0 | **29/0** |
| M2 `modul-warisan.test.ts` | 41/0 | **41/0** |
| M3 `modul-contract.test.ts` | 34/0 | **34/0** |
| M4 `modul-assessment.test.ts` | 61/0 | **61/0** |
| M5 `modul-resource.test.ts` | 41/0 | **41/0** |
| M6 `modul-kausalitas.test.ts` | — | **29/0** |
| `deno check` ×3 | hijau | **hijau** |

### Satu uji M3 dipertajam — alasannya persis

`DRIFT-3` mencari setiap nilai enum yang ditulis langsung di dalam `bentuk`.
Aturannya: `bentuk.includes('"' + nilai + '"')`.

M6 menambahkan enum `jenis_sumber_konteks` yang memuat `program_keahlian` — yang
**juga nama field** di `identitas.konteks_kejuruan`. Aturan lama karena itu
menuduh `identitas` melakukan drift, padahal di sana ia nama field, bukan nilai.

Aturannya kini memeriksa **posisi nilai**: di kerangka JSON, nama field selalu
diikuti titik dua, jadi kemunculan di posisi kunci tidak dihitung. Itu
**mempertajam** maksud aslinya ("nilai enum ditulis lewat penanda"), bukan
melonggarkannya — dan dua assertion baru di dalam uji yang sama membuktikan ia
tidak menjadi buta: nilai enum di posisi nilai tetap tertangkap, nama field
tidak. Tidak ada intent yang dilemahkan.

`node tests/verify-migrations.mjs` tetap melaporkan satu item pre-existing dari
M1 (`20260910000001` belum di-push). M6 tidak menyentuh satu pun migration.

---

## 13. Fixture historis

```
✓ tp02.json   0 temuan      ✓ tp03.json   0 temuan      ✓ tp04.json   0 temuan
✓ tp05.json   1 temuan      ✓ tp06.json   1 temuan
Semua 5 contoh sesuai harapan.
```

`M6-HIST` menegaskan dua hal: jumlah temuannya tetap, DAN tidak satu pun
temuannya berasal dari aturan M6 — jadi kebocoran ke modus historis akan
terlihat, bukan tersembunyi di balik jumlah yang kebetulan sama. Dokumen lama
tetap dapat dibaca dan diunduh.

---

## 14. Berkas yang berubah

| Berkas | Peran |
|---|---|
| `supabase/functions/generate-modul/contract.ts` | `keputusan_kontekstual`, `jenis_sumber_konteks`, `AWALAN_KOMPONEN`, `SUMBER_WAJIB_BERJEJAK` |
| `supabase/functions/generate-modul/index.ts` | bendera `wajibKausalitasCurrent`, blok validasi kausalitas, tipe `ModulOutput`, 2 pemanggilan validator |
| `tests/modul-contract.test.ts` | `DRIFT-3` dipertajam ke posisi nilai (§12) |
| `tests/modul-kausalitas.test.ts` | **BARU** — 29 uji |
| `docs/MODULE-M6-CAUSALITY-EVIDENCE.diff` | **BARU** — bukti diff |
| `docs/MODULE-M6-CAUSALITY-REPORT.md` | **BARU** — laporan ini |

---

## 15. Celah M6 yang tersisa

1. **Jejak membuktikan keputusan DIAMBIL, bukan DILAKSANAKAN.** `KTX-01` boleh
   menunjuk `sub_langkah:P1.MEMAHAMI.1` sementara isi sub-langkah itu tidak
   mencerminkan keputusannya. Memeriksa kecocokan itu menuntut pembacaan makna —
   M9. Yang M6 tutup adalah rujukan yang menunjuk **ketiadaan**.
2. **Tidak ada tuntutan sebaran.** Satu jejak boleh menunjuk satu komponen saja.
   Menuntut "readiness harus memengaruhi ≥ N pertemuan" akan menjadi angka
   sembarang yang menyamar sebagai pedagogi.
3. **Program keahlian tidak wajib berjejak** (§9) — keputusan sadar. Konsekuensinya:
   modul SMK yang mengabaikan konteks kejuruan sepenuhnya tetap lolos M6.
4. **Kelayakan waktu hanya sejauh angkanya tersedia.** Kegiatan yang tidak
   menyatakan `ukuran_kelompok` atau tidak memakai `mode_pelaksanaan` terstruktur
   tidak dapat dihitung, dan M6 sengaja tidak menebak durasi tersembunyi.
5. **Kepatuhan model terhadap bentuk M6 belum terukur.** Sama seperti M5: tidak
   ada panggilan model, jadi apakah model benar-benar menghasilkan
   `keputusan_kontekstual` yang sah baru terukur pada generate berikutnya setelah
   deploy. Risikonya putaran perbaikan lebih sering di awal, bukan salah tuduh —
   aturannya menuntut field yang model memang diperintahkan menghasilkan.

---

# MODULE M6 — READY FOR REVIEW

Tidak di-push. Tidak di-deploy. Tidak ada migration. Tidak ada penulisan ke basis
data produksi. Tidak ada panggilan Gemini. M6 belum di-commit, menunggu keputusan
acceptance reviewer. M7 belum dimulai.
