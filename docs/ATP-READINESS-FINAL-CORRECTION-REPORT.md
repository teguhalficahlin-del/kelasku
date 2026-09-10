# ATP READINESS FINAL CORRECTION REPORT

**Tanggal:** 10 September 2026
**Lingkup:** satu correction sempit — sequencing kesiapan `jauh_di_bawah`. Tidak ada yang lain disentuh.
**Status akhir:** lihat §P.

---

## A. REPEATED FAILURE EVIDENCE

Empat paired repetitions S1↔S2 dengan masukan byte-identik
(`docs/ATP-READINESS-ROBUSTNESS-REPORT.md`) menghasilkan:

```text
CAUSAL = 3/4
WEAK   = 0/4
WRONG  = 1/4
```

Pipeline bersih 8/8, CP tetap 9/9 di setiap run. Yang gagal bukan parser, bukan
CP, bukan cakupan, bukan waktu, bukan heuristik jumlah TP, bukan konteks
kejuruan, bukan otoritas guru — melainkan **satu keputusan pedagogis**.

R4-S2, kesiapan `jauh_di_bawah`:

| | R4-S1 (BASELINE, murid lebih siap) | R4-S2 (JAUH DI BAWAH) |
|---|---|---|
| MB-2 (mengungkapkan pendapat lisan) | TP 6, Semester 2 | TP 5, Semester 1 |
| MB-3 (mempertahankan argumen lisan) | TP 7, Semester 2 | TP 5, Semester 1 |
| Dipisah? | ya, dua TP | **tidak — satu TP, 12 JP** |

Kelas yang jauh lebih lemah menerima kompetensi paling kompleks **satu semester
lebih awal** daripada kelas yang lebih siap, ditumpuk dengan MB-2 dalam satu TP,
dan sebelum satu pun kemampuan menulis diperkenalkan (MP-1 baru di TP 6).
Gejala yang sama — argumentasi lisan di Semester 1 — muncul pada run final
hardening yang dinilai `WEAK`. Ini mode kegagalan berulang pada satu dimensi.

Arahan prosa sudah menyatakan larangannya secara harfiah dan tetap dilanggar.
Karena itu koreksi ini tidak berhenti di prompt.

---

## B. PRODUCT SEQUENCING POLICY

Ditempatkan sebagai kontrak produk di
`supabase/functions/generate-atp/kontrak.ts`, **bukan** di `cp-acuan.json`:

```ts
export const ATURAN_PROGRESI_KESIAPAN: Record<string, AturanProgresi[]> = {
  jauh_di_bawah: [
    { dasar: 'BIE-E25-MB-2', lanjutan: 'BIE-E25-MB-3',
      label_dasar: 'mengungkapkan pendapat secara lisan',
      label_lanjutan: 'mempertahankan argumen secara lisan',
      semester_lanjutan: 2 },
    { dasar: 'BIE-E25-MP-4', lanjutan: 'BIE-E25-MP-5',
      label_dasar: 'mengungkapkan pendapat secara tertulis',
      label_lanjutan: 'mempertahankan argumen secara tertulis',
      semester_lanjutan: 2 },
  ],
};
```

Isinya, dalam bahasa guru:

1. **Mengungkapkan pendapat dibangun sebelum mempertahankan argumen** — lisan
   maupun tertulis.
2. **Keduanya bukan satu TP.** MB-2 dan MB-3 terpisah; MP-4 dan MP-5 terpisah.
3. **Mempertahankan argumen ditempatkan Semester 2.** Semester 1 dipakai
   membangun fondasi.

**Apa yang kebijakan ini BUKAN.** Ia bukan isi CP. Teks CP, kesembilan tuntutan,
`sumber_cp`, `status_dekomposisi`, dan `cakupan_wajib` tidak disentuh sama
sekali — hash `shared/data/cp-acuan.json` dan `acuan-cp.ts` identik sebelum dan
sesudah (§E). Ujung fase tetap sama persis dan seluruh tuntutan tetap wajib
terpetakan. Yang diatur adalah **jalan** menuju ujung itu.

**Lingkupnya sengaja sempit.** Hanya `jauh_di_bawah`. Kesiapan lain — termasuk
`sedikit_di_bawah` — tidak tunduk pada aturan ini; menggabungkan MB-2+MB-3 atau
menaruh MB-3 di Semester 1 tetap sah di sana (dibuktikan AM7). Aturan ditulis
per ID tuntutan, dan `aturanProgresiUntuk()` hanya mengembalikan aturan yang
**kedua** ID-nya ada di acuan yang sedang dipakai — jadi mapel atau fase lain
tidak terkena dengan sendirinya.

**Satu sumber untuk prompt dan validator.** Kalimat arahan kepada penyusun
tidak ditulis tangan: `arahanProgresiKesiapan()` menurunkannya dari tabel yang
sama yang ditegakkan validator, lalu `bangunKonteksAtp()` menyisipkannya ke
`kesiapan_murid`. Repo ini sudah dua kali membayar biaya kembar yang menyimpang
diam-diam (`BENTUK_INSTRUMEN` vs `KUNCI_MURID`, `calculateAllocation` vs
`hitungAlokasi`); di sini tidak ada kembar. Yang benar-benar terkirim:

```text
Urutan yang WAJIB dipatuhi untuk kelas jauh di bawah:
- bangun kemampuan mengungkapkan pendapat secara lisan SEBELUM mempertahankan
  argumen secara lisan; keduanya BUKAN satu TP, dan mempertahankan argumen
  secara lisan ditempatkan Semester 2.
- bangun kemampuan mengungkapkan pendapat secara tertulis SEBELUM
  mempertahankan argumen secara tertulis; keduanya BUKAN satu TP, dan
  mempertahankan argumen secara tertulis ditempatkan Semester 2.
```

Label manusia, bukan ID — persis seperti diminta.

---

## C. VALIDATOR RDS1–RDS6

Deterministik, dan **hanya menyala** bila `s.kesiapan` punya entri di
`ATURAN_PROGRESI_KESIAPAN`. Kesiapan lain melewati blok ini seluruhnya.

| Kode | Menolak |
|------|---------|
| RDS1 | MB-3 muncul sebelum MB-2 |
| RDS2 | MB-2 dan MB-3 pada TP yang sama |
| RDS3 | MB-3 bukan Semester 2 |
| RDS4 | MP-5 muncul sebelum MP-4 |
| RDS5 | MP-4 dan MP-5 pada TP yang sama |
| RDS6 | MP-5 bukan Semester 2 |

Kode dipetakan per aturan: aturan ke-*i* memakai RDS(3*i*+1) urutan,
RDS(3*i*+2) penggabungan, RDS(3*i*+3) semester. Stabil selama urutan tabelnya
stabil.

**ATURAN OCCURRENCE — didokumentasikan, dan itu penting.** Satu tuntutan boleh
muncul di beberapa TP. Yang dipakai membandingkan urutan dan semester adalah
**kemunculan pertama**: TP bernomor terkecil yang menyebut tuntutan itu.
Alasannya eksplisit di kode — yang dijaga adalah kapan sebuah kemampuan mulai
**dituntut** dari murid, bukan kapan ia terakhir dilatih. Pengulangan sesudahnya
bebas dan tidak diperiksa. Perbandingan memakai `nomor` TP final, dengan
cadangan indeks array bila `nomor` bukan integer (S2 sudah menjaga
keberurutannya secara terpisah).

Dua penghalusan yang sengaja dipasang:

- TP yang menumpuk keduanya diperiksa **lebih dulu**, dan bila menyala, galat
  urutan tidak ikut dilaporkan — pada TP yang sama, "urutan" tidak punya arti,
  dan dua galat untuk satu sebab hanya memperkeruh pesan perbaikan.
- Tuntutan yang sama sekali tidak terpetakan dilewati: itu sudah dilaporkan C5.

---

## D. TESTS AM1–AM8

```
AM1  jauh_di_bawah — MB-2 dan MB-3 dalam satu TP ditolak ............... ok
AM2  jauh_di_bawah — MB-3 di Semester 1 ditolak ........................ ok
AM3  jauh_di_bawah — MB-2 lebih dahulu, MB-3 Semester 2 diterima ....... ok
AM4  jauh_di_bawah — MP-4 dan MP-5 dalam satu TP ditolak ............... ok
AM5  jauh_di_bawah — MP-5 di Semester 1 ditolak, urutan terbalik ....... ok
AM6  jauh_di_bawah — MP-4 lebih dahulu, MP-5 Semester 2 diterima ....... ok
AM7  sedikit_di_bawah — fixture yang sama TIDAK terkena aturan ......... ok
AM8  arahan penyusun diturunkan dari tabel yang ditegakkan validator ... ok
```

AM3 dan AM6 tidak hanya menuntut `valid === true` — keduanya juga menuntut
**nol** kode RDS di daftar galat, supaya "lulus" tidak bisa datang dari galat
lain yang kebetulan tidak ada.

AM5 memasang dua pelanggaran sekaligus (MP-5 mendahului MP-4 **dan** di
Semester 1) dan menuntut RDS4 dan RDS6 keduanya menyala — satu perbaikan harus
membawa seluruh masalah, bukan satu per satu.

**AM7 adalah penjaga arah sebaliknya**, dan ia dibangun dari fixture yang
*persis sama*: penempatan yang menjatuhkan `jauh_di_bawah` dijalankan ulang
dengan `sedikit_di_bawah` dan harus **lolos penuh**. Termasuk MB-2+MB-3 dalam
satu TP — fixture AM1 apa adanya. Kebijakan ini untuk satu kondisi ekstrem,
bukan aturan universal Bahasa Inggris.

AM8 menutup celah yang paling mudah terlewat: kalau tabel berubah, kalimat di
prompt ikut berubah dengan sendirinya. Ia juga membuktikan arahan itu **tidak
bocor** ke kesiapan lain, dan aturan bernilai kosong untuk mapel yang tidak
punya ID tersebut.

Fixture uji sengaja menambal TP yang tergusur (`taruh()`), supaya yang gagal
benar-benar RDS — bukan K2 atau C3 yang kebetulan ikut menyala.

---

## E. REGRESSION

```
$ deno test --allow-read tests/atp-kontrak.test.ts
ok | 60 passed | 0 failed (139ms)          # 52 lama + 8 baru, nol yang dilemahkan

$ node tests/atp-acuan-sinkron.mjs
LULUS — acuan CP sinkron (supabase/functions/generate-atp/acuan-cp.ts)

$ node tests/atp-trace.mjs --periksa
LULUS — docs/SPEC-ATP-KONTRAK.md sesuai dengan kontrak di kode.

$ deno check supabase/functions/generate-atp/kontrak.ts      Check ... ok
$ deno check supabase/functions/generate-atp/index.ts        Check ... ok
$ deno check tests/atp-semantic-harness.ts                   Check ... ok
```

Yang dibuktikan tidak berubah, dengan hash isi fungsi sebelum ↔ sesudah:

| Hal | Bukti |
|---|---|
| CP dan 9 tuntutan | `cp-acuan.json` = `d7cec47b…`, `acuan-cp.ts` = `277ded9e…` — identik dengan freeze laporan sebelumnya |
| `hitungTargetTp()` | **byte-identik** (`60441f3cab306e50`) — S1 tetap 11 TP, S2 tetap 9 TP |
| `parseKeluaranModel()` | byte-identik (`bcd44490b5922d59`) |
| `pisahkanKeluaran()` | byte-identik (`c07963362f4def57`) |
| Validator sumber daya (B1, POLA_*) | tidak disunting — terbukti masih bekerja di R8-S1 (§K) |
| A17 / A19 | tidak disunting; `keputusan_terbuka` tetap `[A17, A19]` di kedelapan run |
| Arsitektur repair | tidak disunting — tetap 1 utama + maksimum 1 perbaikan |
| `generate-modul` | nol berkas tersentuh (`git status` bersih untuk direktori itu) |
| Naskah Fasilitasi | tidak disentuh |

---

## F. FROZEN SOURCE

Hash sesudah deterministic test hijau dan **sebelum** live run:

```
89e8db4ef5c33d55557b5e1a12e77c082cba78f6e69838ffdbc2c8c9641ccc85  supabase/functions/generate-atp/index.ts
dc75a8025a0f926cdddf4a093074b221650a3952c99a8fa2b627609e4d9e4b0d  supabase/functions/generate-atp/kontrak.ts
277ded9e28945a03639f3a871c78839c7335629a56cb805083a15b768764481a  supabase/functions/generate-atp/acuan-cp.ts
d7cec47b947beca127a62610feb862a473754931cfb4171ff99b37f30df3427d  shared/data/cp-acuan.json
55838ddfc5737c93311f7aec84843c6cce137404ddf1ba88e7257028f1fb592c  tests/atp-semantic-harness.ts
be0885a7c9094d02d6a06b2a21da9336b59c0f9ce342612069b4540d655ae37c  tests/atp-kontrak.test.ts
```

```
$ diff _freeze-before.txt _freeze-after.txt
(tidak ada keluaran)
FREEZE OK — identical
```

Tidak ada satu baris kode pun yang diubah sejak live run dimulai.

**Model/config** — sama persis dengan R1–R4: `gemini-3.8-flash`, temperature
tidak diset, anggaran token 16.400, maksimum 2 panggilan per kasus.

**Paritas masukan.** `S1-user-message.json` di R5–R8 ber-hash `fd4203c77509…`,
**byte-identik** dengan R1–R4 — bukti bahwa tidak ada yang berubah di luar
kesiapan ekstrem. `S2-user-message.json` berubah dari `29e974044b84…` ke
`3db54d780605…`, dan pembandingan per kunci menunjukkan **satu** perbedaan:

```
kunci berbeda: ['kesiapan_murid']
+ Urutan yang WAJIB dipatuhi untuk kelas jauh di bawah: …
```

Seluruh kunci lain — `cp_anchor`, `prioritas_guru`, `konteks_kejuruan`,
`anggaran_waktu`, `keputusan_terbuka`, `penerapan_prioritas_wajib`,
`batas_mutlak`, `instruksi` (termasuk target 9 TP) — identik.

---

## G. R5–R8 FULL PAIRED OUTPUTS

Singkatan tuntutan: MB = Menyimak-Berbicara, MM = Membaca-Memirsa,
MP = Menulis-Mempresentasikan.

### G.1 R5

**R5-S1 — BASELINE, 11 TP** · A17 seimbang · A19 hierarki

| # | Sem | JP | Tuntutan | Judul |
|---|---|---|---|---|
| 1 | 1 | 12 | MB-1 | Menyimak percakapan lisan instruksi kerja busana untuk memahami alur informasi dan detail |
| 2 | 1 | 14 | MM-1, MM-2 | Membaca teks deskripsi busana serta menyimpulkan informasi tersurat dan tersirat penting |
| 3 | 1 | 12 | MB-1 | Menyimak pembacaan cerita fiksi bertema busana untuk memahami gagasan utama dan detail |
| 4 | 1 | 12 | MM-1, MM-2 | Membaca cerita pendek dan menganalisis alur serta pesan tersirat karakter busana |
| **5** | **1** | 12 | **MB-2, MB-3** | Berdiskusi lisan untuk mengungkapkan pendapat dan mempertahankan argumen terkait etika berbusana |
| 6 | 2 | 10 | MP-1 | Menulis teks petunjuk perawatan busana dengan struktur teks dan bahasa yang tepat |
| 7 | 2 | 12 | MP-1 | Menulis cerita naratif singkat tentang pengalaman merancang busana dengan struktur yang runtut |
| 8 | 2 | 10 | MP-2 | Menyajikan deskripsi busana kerja menggunakan media presentasi cetak di depan kelas |
| 9 | 2 | 10 | MP-4 | Menulis teks opini singkat tentang pemilihan kain ramah lingkungan dalam berbusana |
| 10 | 2 | 10 | MP-5 | Menyusun teks tanggapan untuk mempertahankan argumen tertulis tentang isu industri tekstil |
| 11 | 2 | 12 | MP-2, MP-5 | Menyampaikan presentasi rancangan busana memakai media presentasi cetak sambil mempertahankan argumen |

**R5-S2 — JAUH DI BAWAH, 9 TP** · A17 seimbang · A19 hierarki

| # | Sem | JP | Tuntutan | Judul |
|---|---|---|---|---|
| 1 | 1 | 14 | MM-1, MM-2 | Membaca petunjuk kerja pembuatan busana dan menyimpulkan informasi penting |
| 2 | 1 | 16 | MB-1, MB-2 | Menyimak dialog pelayanan pelanggan butik dan menyampaikan pendapat secara lisan |
| 3 | 1 | 16 | MP-1, MP-2 | Menulis teks prosedur perawatan busana menggunakan media presentasi cetak |
| 4 | 1 | 16 | MP-4 | Menulis tanggapan untuk mengungkapkan pendapat tentang busana ramah lingkungan |
| 5 | 2 | 14 | MM-1, MM-2 | Membaca cerita pendek perancang busana dan menganalisis pesan tersirat |
| 6 | 2 | 12 | MB-1 | Menyimak pembacaan cerita fiksi busana dan menjelaskan alur peristiwanya |
| 7 | 2 | 14 | MP-1 | Menulis cerita pendek pengalaman pameran busana dengan alur runtut |
| **8** | **2** | 12 | **MB-3** | Mempertahankan argumen lisan dalam diskusi mengenai bahan busana berkelanjutan |
| **9** | **2** | 12 | **MP-5** | Menulis teks argumen dan mempertahankan pendapat tentang limbah busana |

Baseline melakukan persis apa yang dulu menjatuhkan R4 — MB-2+MB-3 dalam satu
TP di Semester 1 — dan itu SAH untuk `sedikit_di_bawah`. Untuk kelas jauh di
bawah, keduanya terpisah enam TP dan MB-3 pindah ke Semester 2.

### G.2 R6

**R6-S1 — BASELINE, 11 TP** · A17 seimbang · A19 mudah→sulit

| # | Sem | JP | Tuntutan | Judul |
|---|---|---|---|---|
| 1 | 1 | 10 | MM-1, MM-2 | Membaca teks deskripsi jenis kain dan menyimpulkan informasi penting |
| 2 | 1 | 10 | MM-1, MM-2 | Membaca cerita pendek tentang perancang busana dan menganalisis pesannya |
| 3 | 1 | 10 | MB-1 | Menyimak dialog pelayanan pelanggan butik dan mencatat informasi rincian |
| 4 | 1 | 10 | MB-1 | Menyimak dongeng busana tradisional dan menceritakan kembali alur ceritanya |
| 5 | 1 | 10 | MB-2 | Mengungkapkan pendapat lisan tentang tren busana ramah lingkungan |
| **6** | **1** | 12 | **MB-3** | Mempertahankan argumen lisan dalam diskusi pemilihan bahan busana pesta |
| 7 | 2 | 12 | MP-1 | Menulis petunjuk pembuatan pola busana dengan struktur bahasa yang tepat |
| 8 | 2 | 12 | MP-1 | Menulis cerita fiksi tentang pengalaman peragaan busana sekolah |
| 9 | 2 | 14 | MP-2, MP-4 | Menulis pendapat tentang etika berbusana menggunakan media presentasi cetak |
| **10** | 2 | 12 | **MP-4, MP-5** | Menulis artikel opini dan mempertahankan argumen isu limbah busana |
| 11 | 2 | 14 | MP-2, MP-5 | Mempertahankan argumen tertulis promosi busana pada media presentasi cetak |

**R6-S2 — JAUH DI BAWAH, 9 TP** · A17 seimbang · A19 hierarki

| # | Sem | JP | Tuntutan | Judul |
|---|---|---|---|---|
| 1 | 1 | 16 | MB-1 | Menyimak dialog dan instruksi kerja busana untuk menemukan gagasan utama dan detail |
| 2 | 1 | 16 | MM-1, MM-2 | Membaca petunjuk pembuatan busana untuk menganalisis dan menyimpulkan informasi penting |
| 3 | 1 | 16 | MB-2 | Menyampaikan pendapat secara lisan tentang pilihan bahan busana dalam diskusi kelas |
| 4 | 1 | 14 | MP-4 | Menulis teks ulasan singkat untuk menyampaikan pendapat mengenai busana ramah lingkungan |
| 5 | 2 | 12 | MB-1 | Menyimak cerita pendek lisan tentang penjahit untuk memahami alur dan detail peristiwa |
| 6 | 2 | 12 | MM-1, MM-2 | Membaca cerita pendek tentang perancang busana untuk menyimpulkan pesan tersurat dan tersirat |
| **7** | **2** | 14 | **MB-3** | Mempertahankan argumen secara lisan dalam diskusi tentang etika kerja di butik |
| **8** | **2** | 14 | **MP-5** | Menulis teks eksposisi untuk mempertahankan argumen terkait keselamatan kerja Tata Busana |
| 9 | 2 | 12 | MP-1, MP-2 | Menulis gagasan pengalaman busana menggunakan media presentasi cetak dengan struktur tepat |

### G.3 R7

**R7-S1 — BASELINE, 11 TP** · A17 seimbang · A19 mudah→sulit

| # | Sem | JP | Tuntutan | Judul |
|---|---|---|---|---|
| 1 | 1 | 10 | MB-1 | Menyimak percakapan layanan pelanggan butik untuk mencatat gagasan utama dan detail |
| 2 | 1 | 10 | MB-1 | Menyimak pembacaan cerita pendek busana tradisional untuk memahami alur dan informasi penting |
| 3 | 1 | 10 | MM-1, MM-2 | Membaca teks petunjuk perawatan kain busana untuk menyimpulkan informasi penting |
| 4 | 1 | 10 | MM-1, MM-2 | Membaca cerita fiksi perancang busana untuk menganalisis alur dan pesan tersirat |
| 5 | 1 | 12 | MP-1 | Menulis cerita pendek tentang pengalaman menjahit pakaian dengan struktur teks tepat |
| 6 | 1 | 10 | MP-1 | Menulis teks deskripsi busana kerja dengan struktur teks dan kebahasaan tepat |
| 7 | 2 | 12 | MB-2 | Mengungkapkan pendapat lisan mengenai pemilihan bahan busana ramah lingkungan dalam diskusi |
| **8** | 2 | 12 | **MB-3** | Mempertahankan argumen lisan tentang etika kerja butik saat menghadapi sanggahan rekan |
| 9 | 2 | 12 | MP-4 | Menulis teks opini tentang pemanfaatan kain perca dalam industri tata busana |
| **10** | 2 | 14 | **MP-5** | Menulis esai argumentatif untuk mempertahankan argumen tentang keselamatan kerja di butik |
| 11 | 2 | 14 | MP-2 | Mempresentasikan rancangan busana kerja menggunakan berbagai media presentasi cetak kepada rekan |

**R7-S2 — JAUH DI BAWAH, 9 TP** · A17 seimbang · A19 hierarki

| # | Sem | JP | Tuntutan | Judul |
|---|---|---|---|---|
| 1 | 1 | 14 | MB-1 | Menyimak dialog dan cerita busana untuk menemukan ide pokok serta detail |
| 2 | 1 | 12 | MM-1, MM-2 | Membaca cerita pendek mode untuk menyimpulkan alur dan pesan tersirat |
| 3 | 1 | 12 | MM-1, MM-2 | Membaca teks petunjuk bahan tekstil untuk menganalisis informasi penting |
| 4 | 1 | 12 | MB-2 | Menyampaikan pendapat secara lisan tentang tren busana dalam diskusi kelas |
| 5 | 1 | 12 | MP-4 | Menulis teks ulasan pribadi untuk mengungkapkan pendapat tentang padu padan pakaian |
| 6 | 2 | 16 | MP-1 | Menulis cerita rekaan tentang pengalaman merancang busana secara runtut |
| 7 | 2 | 16 | MP-1, MP-2 | Menulis profil produk busana menggunakan media presentasi cetak |
| **8** | **2** | 16 | **MP-5** | Menulis teks argumen untuk mempertahankan sikap terhadap limbah industri busana |
| **9** | **2** | 16 | **MB-3**, MP-2 | Mempertahankan argumen lisan tentang konsep busana kerja menggunakan media presentasi cetak |

### G.4 R8

**R8-S1 — BASELINE, 11 TP** · A17 seimbang · A19 hierarki · *satu perbaikan (§K)*

| # | Sem | JP | Tuntutan | Judul |
|---|---|---|---|---|
| 1 | 1 | 12 | MB-1 | Menyimak pembacaan naskah busana untuk memahami ide pokok serta detail penting |
| 2 | 1 | 12 | MM-1 | Membaca teks cerita dan artikel busana untuk memahami alur informasi keseluruhan |
| 3 | 1 | 14 | MM-2 | Menganalisis dan menyimpulkan informasi tersurat serta tersirat dalam teks dunia busana |
| 4 | 1 | 12 | MB-2 | Mengungkapkan pendapat lisan dalam percakapan mengenai pilihan desain busana kerja |
| **5** | **1** | 12 | **MB-3** | Mempertahankan argumen lisan saat mendiskusikan kebutuhan busana pelanggan butik |
| 6 | 2 | 10 | MP-1 | Menulis cerita pendek pengalaman kerja busana dengan struktur teks yang tepat |
| 7 | 2 | 10 | MP-1 | Menulis laporan deskriptif bahan tekstil dengan struktur dan kaidah kebahasaan tepat |
| 8 | 2 | 10 | MP-2 | Mempresentasikan rancangan busana kerja menggunakan media presentasi cetak |
| 9 | 2 | 10 | MP-4 | Menulis opini mengenai tren busana ramah lingkungan dengan bahasa yang tepat |
| 10 | 2 | 12 | MP-5 | Menulis teks tanggapan untuk mempertahankan argumen atas kritik desain busana |
| 11 | 2 | 12 | MP-2, MP-5 | Menyajikan argumen tertulis tentang industri busana menggunakan media presentasi cetak |

**R8-S2 — JAUH DI BAWAH, 10 TP** (target 9, toleransi ±1) · A17 seimbang · A19 hierarki

| # | Sem | JP | Tuntutan | Judul |
|---|---|---|---|---|
| 1 | 1 | 14 | MM-1, MM-2 | Membaca teks tentang tren busana berkelanjutan dan menyimpulkan informasi penting |
| 2 | 1 | 12 | MB-1 | Menyimak penjelasan proses pembuatan busana untuk menemukan gagasan utama dan detail |
| 3 | 1 | 12 | MB-2 | Mengungkapkan pendapat secara lisan mengenai pemilihan bahan busana dalam diskusi |
| 4 | 1 | 12 | MM-1, MM-2 | Membaca cerita pendek perancang busana dan menganalisis alur serta pesan tersirat |
| 5 | 1 | 12 | MP-4 | Menulis teks opini singkat untuk mengungkapkan pandangan pribadi tentang gaya busana |
| 6 | 2 | 12 | MB-1 | Menyimak narasi fiksi dunia busana dan memahami alur informasi cerita |
| **7** | **2** | 14 | **MB-3** | Mempertahankan argumen secara lisan dalam simulasi negosiasi desain busana kerja |
| 8 | 2 | 14 | MP-1, MP-2 | Menulis deskripsi produk busana menggunakan media presentasi cetak secara tepat |
| 9 | 2 | 10 | MP-1 | Menulis cerita pendek tentang pengalaman membuat busana dengan kosakata yang tepat |
| **10** | **2** | 14 | **MP-5** | Menulis teks argumen untuk mempertahankan pendapat tentang penanganan limbah busana |

---

## H. READINESS GUARD TABLE

Diukur pada keluaran S2 keempat pasangan:

| Pair | MB-2 < MB-3 | MB-2/MB-3 terpisah | MB-3 Sem 2 | MP-4 < MP-5 | MP-4/MP-5 terpisah | MP-5 Sem 2 | GUARD |
|------|---|---|---|---|---|---|---|
| R5-S2 | TP 2 → 8 ✓ | ✓ | ✓ | TP 4 → 9 ✓ | ✓ | ✓ | **PASS** |
| R6-S2 | TP 3 → 7 ✓ | ✓ | ✓ | TP 4 → 8 ✓ | ✓ | ✓ | **PASS** |
| R7-S2 | TP 4 → 9 ✓ | ✓ | ✓ | TP 5 → 8 ✓ | ✓ | ✓ | **PASS** |
| R8-S2 | TP 3 → 7 ✓ | ✓ | ✓ | TP 5 → 10 ✓ | ✓ | ✓ | **PASS** |

**READINESS GUARD = PASS pada 4/4 S2.**

Dan yang paling menentukan: **nol galat RDS di seluruh delapan run live.** Guard
tidak pernah perlu menembak. Penyusun menghasilkan urutan yang benar pada
panggilan pertama, persis seperti yang dituju — validator tinggal jaring
pengaman, bukan jalur utama.

Kontras dengan baseline pada masukan yang sama, yang memang tidak tunduk aturan
ini dan **tiga dari empat kali melanggarnya**:

| | R5-S1 | R6-S1 | R7-S1 | R8-S1 |
|---|---|---|---|---|
| MB-3 di semester | **1** | **1** | 2 | **1** |
| MB-2/MB-3 terpisah | **tidak** | ya | ya | ya |
| MP-4/MP-5 terpisah | ya | **tidak** | ya | ya |

Baseline bukan salah — ia sah untuk `sedikit_di_bawah`. Tabel ini hanya
menunjukkan bahwa perilaku S2 tidak muncul dengan sendirinya dari fixture.

---

## I. CAUSAL VERDICT TABLE

Metrik pendukung:

| Run | TP | MB-3 | MP-5 | Jarak MB-2→MB-3 | Jarak MP-4→MP-5 | JP tiga TP awal |
|---|---|---|---|---|---|---|
| R5-S1 | 11 | TP 5, Sem 1 | TP 10, Sem 2 | **0** (satu TP) | 1 | 12, 14, 12 |
| R5-S2 | 9 | TP 8, Sem 2 | TP 9, Sem 2 | **6** | **5** | 14, 16, 16 |
| R6-S1 | 11 | TP 6, Sem 1 | TP 10, Sem 2 | 1 | **0** (satu TP) | 10, 10, 10 |
| R6-S2 | 9 | TP 7, Sem 2 | TP 8, Sem 2 | **4** | **4** | 16, 16, 16 |
| R7-S1 | 11 | TP 8, Sem 2 | TP 10, Sem 2 | 1 | 1 | 10, 10, 10 |
| R7-S2 | 9 | TP 9, Sem 2 | TP 8, Sem 2 | **5** | **3** | 14, 12, 12 |
| R8-S1 | 11 | TP 5, Sem 1 | TP 10, Sem 2 | 1 | 1 | 12, 12, 14 |
| R8-S2 | 10 | TP 7, Sem 2 | TP 10, Sem 2 | **4** | **5** | 14, 12, 12 |

Jarak S1: 0–1 di kedelapan kolom. Jarak S2: 3–6. Pola ini konsisten di keempat
pasangan dan **tidak dapat dijelaskan** oleh 11 TP vs 9 TP — jumlah TP yang
lebih sedikit justru menekan ke arah jarak yang lebih rapat.

| Pair | Endpoint | Early progression | Time/depth | Complex production | Beyond heuristic | Verdict |
|------|----------|-------------------|------------|--------------------|------------------|---------|
| R5 | PASS 9/9 | YA — fondasi reseptif 14–16 JP; baseline mulai 12 JP dan sudah menuntut argumentasi di TP 5 | YA — tiga TP awal 14/16/16 JP | YA — MB-3 Sem 1 → Sem 2; MP-5 tetap terakhir | YA — jarak MB 0 → 6, MP 1 → 5; baseline menumpuk MB-2+MB-3 satu TP, S2 memisahkan lintas semester | **CAUSAL** |
| R6 | PASS 9/9 | YA — TP 1–2 masing-masing 16 JP; baseline 10 JP dan sudah menumpuk MM-1+MM-2 | YA — fondasi 32 JP di dua TP | YA — MB-3 Sem 1 → Sem 2; MP-5 dilepas dari TP gabungan | YA — jarak MB 1 → 4, MP 0 → 4 dengan TP LEBIH SEDIKIT | **CAUSAL** |
| R7 | PASS 9/9 | YA — pendapat (MB-2, MP-4) dibangun di Semester 1, argumentasi tidak | YA — seluruh TP Semester 2 16 JP | YA — MB-3 jadi TP terakhir (9/9) | YA — jarak MB 1 → 5, MP 1 → 3; baseline menaruh pasangan berdampingan, S2 membentangkannya lintas semester | **CAUSAL** |
| R8 | PASS 9/9 | YA — baseline menuntut mempertahankan argumen di TP 5 Sem 1; S2 tidak sampai TP 7 Sem 2 | SEBAGIAN — JP awal lebih lapang, tapi selisihnya tipis | YA — MB-3 Sem 1 → Sem 2 | YA — jarak MB 1 → 4, MP 1 → 5 | **CAUSAL** |

**Catatan kejujuran.** Sebagian perbedaan di kolom "complex production" dan
"beyond heuristic" memang **kebijakan** — itu memang yang dipasang correction
ini, dan menghitungnya sebagai bukti akan melingkar. Karena itu setiap verdict
di atas juga berpijak pada dimensi yang **tidak** diatur kebijakan: JP fondasi
awal, jumlah TP reseptif, dan penempatan MP-1/MP-2 — dan ketiganya tetap
menunjukkan perjalanan S2 yang lebih bertahap. Dua pengamatan yang tidak
menguntungkan tetap dicatat:

- **R5-S2 menaruh menulis prosedur dan menulis pendapat di Semester 1**
  (TP 3, TP 4) sementara baseline menunda seluruh menulis ke Semester 2. Itu
  bukan pelanggaran — MP-1/MP-2 bukan argumentasi — tapi ia melemahkan klaim
  "Semester 1 selalu lebih ringan". Diakui, tidak disembunyikan.
- **R8-S2 menghasilkan 10 TP, bukan 9.** Sah di dalam toleransi ±1 yang sudah
  ada sejak Pass 2, dan bukan akibat correction ini.

Tidak ada pasangan yang memenuhi definisi `WRONG`: tidak satu pun menurunkan
endpoint CP, dan tidak satu pun menghasilkan progression yang kurang realistis
daripada baseline-nya.

---

## J. AGGREGATE RESULT

```text
CAUSAL = 4/4
WEAK   = 0/4
WRONG  = 0/4

READINESS GUARD = PASS pada 4/4 S2
```

Gerbang §13 menuntut CAUSAL ≥ 3/4, WRONG = 0/4, dan GUARD PASS 4/4.
**Ketiganya terpenuhi.**

---

## K. PIPELINE RELIABILITY

| Run | Status | Panggilan | Perbaikan | Latensi | Total token | TP | Σ JP | Maks kata judul |
|---|---|---|---|---|---|---|---|---|
| R5-S1 | FIRST_PASS | 1 | 0 | 19.695 ms | 13.596 | 11 | 126 | 12 |
| R5-S2 | FIRST_PASS | 1 | 0 | 29.550 ms | 15.853 | 9 | 126 | 10 |
| R6-S1 | FIRST_PASS | 1 | 0 | 22.756 ms | 14.920 | 11 | 126 | 10 |
| R6-S2 | FIRST_PASS | 1 | 0 | 16.822 ms | 13.118 | 9 | 126 | 12 |
| R7-S1 | FIRST_PASS | 1 | 0 | 22.919 ms | 14.236 | 11 | 126 | 12 |
| R7-S2 | FIRST_PASS | 1 | 0 | 20.068 ms | 14.010 | 9 | 126 | 11 |
| R8-S1 | REPAIRED_ONCE | 2 | 1 | 37.339 ms | 29.331 | 11 | 126 | 11 |
| R8-S2 | FIRST_PASS | 1 | 0 | 20.419 ms | 14.117 | 10 | 126 | 11 |

```text
first pass       : 7/8
repair           : 1/8   (R8-S1)
panggilan model  : 9 total, tidak ada kasus yang melewati 2
galat RDS        : 0/8
truncation       : 0/8
Σ jp_alokasi     : 126 di kedelapan run, tanpa kecuali
```

**Perbaikan tunggal itu bukan soal kesiapan.** R8-S1 gagal pada aturan lama:

```
[B1] TP 1: menuntut rekaman suara, bahan yang tidak disediakan MiClass dan
     tidak boleh dibebankan kepada guru — "Menyimak teks lisan fiksi dan
     nonfiksi untuk mengidentifikasi gagasan utama serta detail"
```

Perbaikan pertama lolos penuh. Ini justru bukti sehat: validator sumber daya
yang tidak disentuh correction ini masih bekerja, dan arsitektur satu-perbaikan
masih menyelesaikan masalah dalam satu putaran.

---

## L. BEFORE vs AFTER

| | R1–R4 (sebelum) | R5–R8 (sesudah) |
|---|---|---|
| CAUSAL | 3/4 | **4/4** |
| WEAK | 0/4 | 0/4 |
| WRONG | **1/4** | **0/4** |
| MB-3 di Semester 1 pada S2 | 1 dari 4 (R4) | **0 dari 4** |
| MB-2+MB-3 satu TP pada S2 | 1 dari 4 (R4) | **0 dari 4** |
| Jarak MB-2→MB-3 pada S2 | 0–3 | **4–6** |
| Endpoint CP | 9/9 di 8/8 | 9/9 di 8/8 |
| First pass | 8/8 | 7/8 |
| Verdict gerbang | NOT PROVEN | lihat §P |

Perbandingan ini disajikan sebagai konteks. Denominator gerbang tetap **empat
repetisi baru saja** (R5–R8), yang seluruhnya memakai sumber terkoreksi yang
sama dan beku.

---

## M. FILES CHANGED

| Berkas | Perubahan |
|---|---|
| `supabase/functions/generate-atp/kontrak.ts` | `AturanProgresi`, `ATURAN_PROGRESI_KESIAPAN`, `aturanProgresiUntuk()`, `arahanProgresiKesiapan()`; arahan diturunkan di `bangunKonteksAtp()`; `SyaratValidasi.kesiapan`; blok validator RDS1–RDS6; `bangunSyaratValidasi()` meneruskan kesiapan |
| `supabase/functions/generate-atp/index.ts` | satu baris: `kesiapan` diteruskan ke `bangunSyaratValidasi()` |
| `tests/atp-kontrak.test.ts` | `syaratP5()` membaca kesiapan dari data; AM1–AM8 dan tiga fungsi pembantunya |
| `tests/atp-semantic-harness.ts` | satu baris: `kesiapan` diteruskan ke `bangunSyaratValidasi()` |

Tidak disentuh: `cp-acuan.json`, `acuan-cp.ts`, `hitungTargetTp()`, parser,
validator sumber daya, A17/A19, arsitektur repair, `generate-modul`, Naskah
Fasilitasi, migration, klien.

---

## N. EVIDENCE DIFF

`docs/ATP-READINESS-FINAL-CORRECTION-EVIDENCE.diff` — 439 baris, hanya
perubahan task ini (360 penambahan, 5 penghapusan; keempat berkas di §M).

Artefak live: `tests/artifacts/atp-readiness-robustness-final/` (91 berkas,
pola `R{5..8}-S{1,2}-*`) plus `_freeze-before.txt` / `_freeze-after.txt`.
Artefak R1–R4 di `tests/artifacts/atp-readiness-robustness/` tidak tertimpa,
begitu pula `atp-semantic/`, `atp-semantic-pass5/`, `atp-semantic-final/`.

---

## O. REMAINING ATP DEFECTS

Tidak ada defect ATP yang diketahui dan belum ditutup. Yang perlu dicatat
sebagai batas — bukan sebagai cacat:

1. **Aturan progresi hanya untuk `jauh_di_bawah` dan hanya Bahasa Inggris
   Fase E.** Itu keputusan sadar, bukan kelalaian: hanya di sanalah buktinya
   ada. Mapel dan fase lain tidak terkena, dan menambahkannya menuntut bukti
   sendiri.
2. **Empat repetisi adalah empat repetisi.** 4/4 CAUSAL dengan guard
   deterministik jauh lebih kuat daripada 3/4 tanpa guard, tetapi ia tetap
   bukti berhingga atas keluaran model. Yang kini *dijamin* adalah keenam
   ketentuan RDS; sisanya tetap kecenderungan yang terukur.
3. **`sangat_beragam`, `sesuai`, dan `belum_diketahui` belum pernah diuji
   semantik.** Tidak ada temuan atas ketiganya, dan tidak ada yang tahu apakah
   ada.
4. **Belum di-deploy.** Seluruh laporan ini tentang perilaku di harness dan uji
   deterministik. `generate-atp` di produksi masih versi lama.

---

## P. RECOMMENDATION

# ATP READINESS FINAL GATE — PASS

```text
CAUSAL          = 4/4     (syarat: ≥ 3/4)
WRONG           = 0/4     (syarat: 0/4)
READINESS GUARD = 4/4 S2  (syarat: PASS pada 4/4)
```

Yang menutup defect bukan hanya angkanya. Yang menutupnya adalah **nol galat
RDS di delapan run live**: penyusun kini menghasilkan urutan yang benar pada
panggilan pertama, sementara enam ketentuan deterministik berdiri di
belakangnya kalau suatu hari ia tidak. Mode kegagalan yang berulang di R4 dan
di run final hardening — mempertahankan argumen dimajukan ke Semester 1,
ditumpuk dengan mengungkapkan pendapat — kini mustahil lolos, bukan sekadar
jarang.

Endpoint CP utuh 9/9 di kedelapan run. Heuristik jumlah TP tidak disentuh. CP
tidak disentuh. Kesiapan lain tidak terkunci.

Sesuai §17: **berhenti di sini, menunggu reviewer.** Tidak ada deploy, push,
commit, migration, atau tulisan ke Supabase.
