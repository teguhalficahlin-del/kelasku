# Tab Rancang — kesiapan go-live

> Ditulis 6 September 2026, HEAD `b67ec0f`. Berdiri sendiri: sesi mana pun bisa
> membacanya tanpa konteks percakapan sebelumnya.
>
> **Status: putusan GO BERTAHAP ditahan atas permintaan Romo.** Romo menilai
> perlu kepastian lebih dulu tentang bagaimana Tab Rancang bekerja sampai
> tuntas. Dokumen ini mencatat putusan beserta dasarnya supaya tidak disusun
> ulang dari awal.
>
> **Pembaruan 7 September 2026 (HEAD `af3f32b`).** Satu-satunya syarat teknis
> sebelum gerbang dibuka — pola `reguler_bagi` dan `blok` dijalankan sampai
> tuntas — **sudah terpenuhi, keduanya sehat.** Buktinya di §2.
>
> **Satu syarat baru sempat muncul di hari yang sama, dan sudah ditutup.** Alur
> dilanjutkan sampai ujung — Modul dan Naskah dari ATP berpola blok, lalu
> Unduh — dan di sanalah ditemukan **§4d: berkas Word yang guru cetak hanya
> memuat 13% isi modul**, tanpa Naskah Fasilitasi dan tanpa satu pun lembar
> kerja. Ujung pipeline patah diam-diam sejak ModulOutput naik ke V4.0.
>
> **Sudah diperbaiki di hari yang sama** — isi berkas Word naik dari 5.171 ke
> 32.550 karakter, terukur pada modul yang sama. Rinciannya di §4d.
>
> Dengan itu tidak ada lagi penghalang teknis yang diketahui. Yang menahan
> tinggal keputusan Romo: siapa tiga gurunya, dan apakah masa percobaan
> diperpanjang — seluruh akun, termasuk akun Romo, kedaluwarsa 19 September 2026.

---

## 1. Apa arti "go-live" di sini

Bukan ribuan pengguna. Tab Rancang dijaga dua syarat sekaligus:
`role_guru = 'GURU_MAPEL_UMUM_SMK'` **DAN** `tier = 'GURU_PRO'`.

Sebaran akun per 6 September 2026 (26 guru):

| role_guru | tier | jumlah | bisa pakai Rancang? |
|---|---|---|---|
| GURU_MAPEL_UMUM_SMK | TRIAL | **14** | belum — tinggal ubah tier |
| (kosong) | TRIAL | 10 | tidak — terhalang gerbang peran |
| WALI_KELAS_SD | TRIAL | 1 | tidak — di luar cakupan |
| GURU_MAPEL_UMUM_SMK | GURU_PRO | 1 | ya (Romo) |

**Go-live = membuka gerbang untuk 14 orang.** Menutupnya kembali = mengembalikan
tier. Paparannya kecil dan bisa dibatalkan.

Kohor itu sangat seragam: 16 kelas, **seluruhnya Bahasa Inggris**. Seluruh
`program_keahlian`-nya kosong, jadi keempat belas guru akan menempuh jalur
"koreksi program keahlian" — jalur yang sudah diuji.

---

## 2. Putusan: GO BERTAHAP, mulai 3 guru

### Yang membuatnya "go"

**Isolasi bersih dua arah.** Satu-satunya kegagalan yang tidak bisa ditarik
kembali. Diuji 6 September 2026 dengan menyamar sebagai JWT akun kedua langsung
di basis data — bukan lewat UI, karena isolasi ditegakkan RLS dan menguji lewat
peramban berarti menguji lapisan yang salah.

- Baca B→A, 8 tabel: nol kebocoran
- Baca A→B, 6 tabel: nol kebocoran
- Tulis B ke milik A, 9 percobaan: semuanya digagalkan RLS, termasuk penyamaran
  halus (B menulis atas namanya sendiri ke kelas A)
- Profil: tiap guru melihat 1 dari 58 baris

Menutup Test 8.4–8.5 yang sejak awal tertulis pending. Ternyata tidak butuh guru
kedua yang login — butuh guru kedua yang **ada**.

**Kegagalan yang mengunci guru selamanya sudah hilang.** ATP mustahil dipenuhi
(`696c415`) terverifikasi lewat generate sungguhan; jatah tidak lagi hangus
untuk penolakan (`696c415`) diuji langsung terhadap EF ter-deploy.

**Sisa cacat semuanya kualitas, bukan keselamatan.** ATP yang kurang cocok, bukan
data hilang atau bocor.

### Yang membuatnya bertahap

**n = 1.** Satu orang pernah menyelesaikan alur ini. Dari satu transkripnya
ditemukan tujuh cacat, enam di antaranya tidak terlihat sampai diperiksa dengan
sengaja.

**Dua pola jadwal belum pernah dijalankan sekali pun** — `reguler_bagi` dan
`blok`. Satu ATP di produksi yang memakai `reguler_bagi` menghasilkan nol TP.

**Rem diabaikan model** — lihat §4.

### Syarat sebelum gerbang dibuka — **TERPENUHI 7 September 2026**

Satu, dan bisa dikerjakan tanpa pengguna: **jalankan `reguler_bagi` dan `blok`
sampai tuntas.** Jatah generate dihitung per `atp_induk_id`, jadi dua ATP uji
baru muat. Kalau salah satunya patah, putusan berubah jadi no-go.

**Keduanya dijalankan sampai tuntas di produksi 7 September 2026 dan keduanya
sehat.** Dijalankan lewat peramban pada akun Roni Satria S.Pd, kelas
Bahasa Inggris X TB, program keahlian Busana. Hasilnya diperiksa dari basis
data, bukan dari pesan di layar:

| | `reguler_bagi` | `blok` |
|---|---|---|
| `atp_induk.id` | `79246d4e` | `b455b27d` |
| `jp_per_sesi` | 2 | 8 |
| `jp_operasional` | 128 | 200 |
| Jumlah TP | 16 | 12 |
| **`sum(jp_alokasi)`** | **128 — sama persis** | **200 — sama persis** |
| Total pertemuan (`sum(len(jp_pertemuan))`) | 64 = 128 ÷ 2 | 25 = 200 ÷ 8 |
| TP yang `jp_alokasi`-nya bukan kelipatan sesi | 0 | 0 |
| TP tanpa `jp_pertemuan` | 0 | 0 |

Uji `blok` sengaja dirancang supaya sekaligus menguji penjaga kelipatan dari
`696c415`: 6 JP/minggu × 36 minggu = 216, dikurangi cadangan 2 minggu (12) = 204
— dan 204 tidak habis dibagi 8. Pembulatan ke bawah bekerja, dan sisanya
**terlihat oleh guru** sebagai barisnya sendiri, bukan dilebur diam-diam ke
cadangan: *"Tidak terjadwal: 4 JP (kurang dari satu pertemuan penuh) · JP untuk
mengajar: 200 JP — 25 pertemuan"*.

**Koreksi atas premis yang dipakai dokumen ini.** Kalimat di §1 — "Satu ATP di
produksi yang memakai `reguler_bagi` menghasilkan nol TP" — benar, tapi
menyesatkan sebagai bukti. ATP itu (`40e1e078`) dibuat **27 Agustus 2026**,
sedangkan pertanyaan `jp_per_sesi` baru lahir **3 September** di `839e6a6`,
bersama pengaktifan batasan `jp_per_pertemuan` di `generate-atp`. Isi
`collected_data`-nya membuktikannya: `pola_jadwal = reguler_bagi` terjawab dan
`konfirmasi_waktu = ya`, tapi tidak ada `jp_per_sesi` sama sekali. Jadi
kegagalannya bukan "cacat pola jadwal" dan bukan "kebetulan data" — ia
peninggalan alur yang memang belum bisa menanyakan ukuran satu pertemuan.

Sepuluh ATP kosong lainnya di produksi tidak punya `pola_jadwal` sama sekali —
funnel yang ditinggalkan di tengah, bukan generate yang gagal. Satu lagi
(`829b4e22`) kosong karena `jp_operasional`-nya 0.

### Yang membatalkan bertahap jadi tutup lagi

- Guru yang ATP-nya gagal dua kali berturut dengan sebab sama
- Muncul `ATP_GENERATION_TRUNCATED` — artinya plafon baru pun kurang
- Satu saja baris data terlihat lintas guru

Ketiganya terpantau dari basis data tanpa merepotkan siapa pun.

---

## 3. Peta pipeline — apa yang benar-benar ada

**KOREKSI PENTING.** CLAUDE.md masih menyebut "Step 8 Runtime selesai" dan
mendaftar lima berkas `guru/js/runtime-*.js`. **Kelimanya sudah dihapus** di
commit `a433504` ("ganti wizard rancang dengan chat interface V1 — hapus semua
file lama"), bersama `guru/js/classroom-rancang.js`. Lapisan Runtime tidak ada
lagi. Bagian CLAUDE.md itu basi dan menyesatkan siapa pun yang memetakan sistem.

Pipeline Tab Rancang yang sebenarnya, hari ini:

```
Tab Rancang (chat)
  └─ KONTEKS_CP → PRIORITAS → WAKTU → PROFIL_SISWA → TARGET_FASE
     → KONTEKS_DUDI → PENGUATAN_PRASYARAT → ATP_SUMMARY
        └─ generate-atp  (1 panggilan AI + s.d. 2 repair)
           └─ ATP_REVIEW → progresi_tp tersimpan di atp_induk
              └─ PILIH_TP → KONTEKS_MODUL → SUMBER_STRATEGI
                 → ASESMEN_MODUL → MODUL_SUMMARY
                    └─ generate-modul  (5 fase: A → B → C → B2 → D)
                       └─ MODUL_REVIEW → konten tersimpan di modul_induk
                          └─ tab Unduh → .docx
```

Ujungnya adalah **berkas .docx dari tab Unduh** (`classroom-unduh.js`), bukan
sesi mengajar di aplikasi.

### Status pengujian tiap tahap

| Tahap | Pernah dijalankan tuntas? |
|---|---|
| Chat funnel ATP (46 pertanyaan) | Ya — 1 guru, 1 kali, jalur `reguler_satu` |
| generate-atp | Ya — 6 September 2026, 10 TP / 124 JP |
| Funnel Modul (16 pertanyaan) | Ya — sesi sebelumnya |
| generate-modul 5 fase | Ya — TP 6, 98 detik, diaudit di produksi |
| Render Modul di layar | Ya |
| **Unduh .docx** | Diuji 7 Sep 2026 — cacat besar ditemukan **dan diperbaiki** hari itu juga. Lihat §4d |
| Pola `reguler_bagi` / `blok` | **Ya — 7 September 2026, keduanya sehat** (lihat §2) |
| Mapel selain Bahasa Inggris | **TIDAK PERNAH** |
| Fase selain E | **TIDAK PERNAH** |
| Dua guru bersamaan | **TIDAK PERNAH** |

Tiga baris terakhir tidak menghalangi kohor pertama — mereka semua Bahasa
Inggris Fase E. Dua baris di atasnya menghalangi.

---

## 4. Cacat yang diketahui, belum diperbaiki

### 4a. Model menjatuhkan seluruh masukan yang meminta menahan diri

Terukur pada generate 6 September 2026. Guru menyatakan murid "jauh di bawah",
konteks kejuruan "terbatas", dan prioritas fondasi TKA. Hasilnya:

| Masukan | Dipatuhi? |
|---|---|
| Program keahlian | ✓ sangat kuat — 10 dari 10 TP |
| Penguatan Menyimak–Berbicara | ✓ porsi terbesar |
| Kemandirian tertinggi | ✓ |
| Kemampuan awal "jauh di bawah" | **✗** |
| Konteks kejuruan "terbatas" | **✗ justru 100% kejuruan** |
| Prioritas fondasi TKA | **✗ nol TP register akademik umum** |

Polanya: **setiap masukan yang mendorong maju dipatuhi, setiap rem dijatuhkan.**
Bukti paling telanjang — TP 1 mendapat 8 JP, satu-satunya di bawah 12, padahal ia
titik masuk bagi murid yang katanya jauh tertinggal.

> **Masukan yang meminta menahan diri hanya bekerja kalau ia bisa diperiksa.
> Ditulis sebagai kalimat, ia kalah oleh masukan yang mendorong maju.**

`jp_operasional` dipatuhi mutlak bukan karena promptnya meyakinkan, tapi karena
ia angka yang divalidasi. Rem perlu bentuk yang sama.

**JANGAN pasang gerbangnya dari satu titik data.** Butuh dua-tiga ATP lagi
dengan masukan menahan diri untuk mengkalibrasi. Gerbang yang salah tuduh
memakan jatah guru, dan jatah tidak bisa dikembalikan.

### 4b. Tuas untuk murid tertinggal bisa tercabut diam-diam

Guru menjawab "jauh di bawah", lalu memilih pengulangan "saat mengajar"
(`terintegrasi`) — dan pertanyaan **"Berapa JP untuk penguatan awal?" tidak
pernah muncul**, karena ia hanya ditanyakan untuk `awal` / `kombinasi`.

Guru yang paling butuh waktu khusus berakhir dengan nol JP, tanpa pernah
ditawari.

### 4d. Unduh .docx menjatuhkan tiga perempat isi modul — **SUDAH DIPERBAIKI**

*Ditemukan DAN diperbaiki 7 September 2026, saat menguji ujung pipeline untuk
pertama kalinya. Uraian di bawah dipertahankan sebagai catatan sebab.*

Berkas Word-nya jadi, terunduh, tidak ada galat, dan terlihat utuh. Tapi
`generateModulDocx()` di `guru/js/classroom-unduh.js:154-161` masih membaca
skema **ModulOutput V3**, sementara generatornya sudah lama menghasilkan
**V4.0**:

```js
var identitas    = k.identitas    || {};
var identifikasi = k.identifikasi || {};          // ← tidak ada di V4.0
var desain       = k.desain_pembelajaran || {};   // ← tidak ada di V4.0
var asesmen      = k.rencana_asesmen || {};
var pertemuan    = k.pertemuan || k.langkah_pembelajaran || [];
```

Dua dari lima kunci yang dibacanya sudah tidak ada. Sebelas kunci V4.0 tidak
pernah disentuh sama sekali. Terukur pada modul `aff82e2c` (TP 1, pola blok):

| Bagian | Karakter | Masuk .docx? |
|---|---|---|
| `naskah_fasilitasi` | 18.356 | **tidak** |
| `pertemuan` | 6.980 | ya |
| `instrumen_pembelajaran` | 2.494 | **tidak** |
| `instrumen_asesmen` | 1.987 | **tidak** |
| `metadata_pedagogis` | 1.613 | **tidak** |
| `rencana_asesmen` | 1.482 | ya |
| `rancangan` | 1.111 | **tidak** |
| `catatan_guru` | 1.089 | **tidak** |
| `tindak_lanjut` | 1.019 | **tidak** |
| `kktp` | 888 | **tidak** |
| `identitas` | 821 | ya |
| `konteks_murid` | 782 | **tidak** |
| `materi_esensial` | 639 | **tidak** |
| **Total** | **39.261** | **9.283 (23,6%)** |

Yang hilang termasuk **seluruh Naskah Fasilitasi** — 47% isi modul, satu fase
generate tersendiri — beserta setiap lembar kerja murid, seluruh kriteria
ketercapaian, dan rencana tindak lanjut.

**Kenapa ini yang paling merugikan.** Tab Unduh adalah ujung pipeline: dokumen
Word itulah yang guru cetak dan bawa ke kelas. Semua yang dikerjakan di hulu —
ATP yang jamnya pas, modul yang bahasanya manusia, naskah yang menyebut hanya
alat yang benar-benar ada — berhenti di layar. Dan kegagalannya **diam**: tidak
ada galat, ukuran berkasnya wajar (9 KB), dan guru tidak punya cara tahu ada
yang hilang kecuali membandingkan sendiri dengan layar.

Ini juga menjelaskan kenapa baris "Unduh .docx — TIDAK PERNAH diuji" bertahan
begitu lama tanpa curiga: fiturnya memang berfungsi, hanya tidak lengkap.

**Perbaikan yang dipasang.** `generateModulDocx()` ditulis ulang ke skema V4.0:
sembilan bab (A Konteks Murid, B Materi Esensial, C Kriteria Ketercapaian,
D Rancangan, E Langkah-Langkah, F Asesmen, G Tindak Lanjut, H Catatan Guru,
I Instrumen) ditambah **Lampiran Naskah Fasilitasi di halaman baru**. Tiap bab
dilewati kalau datanya kosong — tidak ada lagi judul hampa.

Isi instrumen dirender **generik**, bukan lewat cabang per jenis. Cabang per
jenis sudah pernah gagal di renderer layar karena AI mengarang nama field
sendiri dan berbeda tiap generate (CLAUDE.md, Pelajaran 3 sesi 5 September);
mengulanginya di sini hanya akan memindahkan cacat yang sama ke berkas Word.

Dua cacat menyertai yang ikut ditutup:
- `[F1] undefined` tercetak di dokumen guru — V4.0 memakai `teknik`, bukan
  `teknik_instrumen`. Jalan mundur ke nama lama dipertahankan untuk modul V3.
- ATP mencetak `menyimak_berbicara` mentah. Kini dipetakan lewat
  `atp_induk.elemen_cp`, dengan jalan mundur yang tetap tidak pernah mencetak
  kunci apa adanya. ATP juga mendapat ringkasan "Jumlah TP" dan "Total Alokasi".

**Terukur pada modul yang sama** (`aff82e2c`), lewat harness yang menjalankan
fungsi kirimnya sendiri dengan tiruan library docx:

| | Sebelum | Sesudah |
|---|---|---|
| Teks di berkas Word | 5.171 karakter | **32.550 karakter** |
| Bab yang terbit | 4 (dua di antaranya kosong) | 9 + lampiran |
| Naskah Fasilitasi | tidak ada | ada, 212 baris |
| Kata "undefined" | 2 kemunculan | nol |
| Identifier bergaris bawah | ada di ATP | nol |

Modul lama berskema V3 diuji ikut: hanya bab yang datanya ada yang terbit, tanpa
judul kosong dan tanpa "undefined".

**Diverifikasi pada berkas .docx sungguhan** (7 September 2026, setelah `aa47272`
di-push dan GitHub Pages menyajikannya). Bukan lagi lewat tiruan library: berkas
diunduh di aplikasi produksi, blob-nya ditangkap, zip-nya dibongkar, dan
`word/document.xml` dibaca langsung.

| | ATP | Modul |
|---|---|---|
| Ukuran berkas | 7.531 → **7.580 byte** | 9.174 → **19.503 byte** |
| Teks di dalamnya | 1.751 → 1.867 karakter | 5.171 → **32.565 karakter** |
| Paragraf | — | 411 |
| Kata "undefined" | — | **0** |
| Identifier bergaris bawah | 3 jenis → **0** | **0** |
| Pemisah halaman lampiran | — | 1 |
| Paragraf berbutir | — | 139 |
| Paragraf ber-indent | — | 323 |

Butir dan indentasi bertingkat memang terbentuk di XML-nya, jadi Word akan
menampilkannya bertingkat — bukan sekadar teks rata kiri. Kedua berkas dibuka
tanpa galat oleh library aslinya.

### 4e. Modul .docx diluruskan ke kerangka resmi — **SELESAI `81cac84`**

*Hasil membandingkan keluaran dengan dua dokumen acuan yang ditunjuk Romo:*
*Panduan Pembelajaran dan Asesmen 2025 (kerangka perencanaan hal. 30–31,*
*ketentuan SMK hal. 35) dan Panduan Mata Pelajaran Bahasa Inggris Revisi 3*
*(contoh modul ajar hal. 90–92).*

Kerangka resmi menuntut empat bab berurutan: **Identifikasi → Desain
Pembelajaran → Langkah-langkah Pembelajaran → Asesmen Pembelajaran.**
Perbandingan keluaran MiClass terhadapnya:

| Komponen kerangka resmi | Tersimpan di V4.0? | Tercetak sebelum `81cac84`? |
|---|---|---|
| Asesmen awal (opsional) | `rencana_asesmen.asesmen_diagnostik` | ya |
| **Dimensi Profil Lulusan** | `metadata_pedagogis.dimensi_profil_lulusan` | **tidak** |
| **Karakteristik Materi** | `metadata_pedagogis.karakteristik_materi` | **tidak** |
| Tujuan Pembelajaran | `identitas.tujuan_pembelajaran` | ya |
| Praktik Pedagogis | `rancangan.strategi_pedagogis` | ya |
| Kemitraan Pembelajaran | `rancangan.kemitraan_pembelajaran` | ya |
| Lingkungan Pembelajaran | `rancangan.lingkungan_pembelajaran` | ya |
| Pemanfaatan Digital | `rancangan.pemanfaatan_digital` | ya |
| Memahami/Mengaplikasi/Merefleksi + prinsip | `pertemuan[].langkah` | ya |
| Asesmen: teknik & instrumen | `rencana_asesmen` | ya |
| Bahan ajar & lembar kerja (wajib SMK, hal. 35) | `instrumen_*` | ya (sejak `aa47272`) |

**Tiga hal diperbaiki, dua di antaranya mengoreksi `aa47272` sendiri:**

1. **Dimensi Profil Lulusan dan Karakteristik Materi hilang.** Keduanya diminta
   kerangka resmi, ada di contoh modul Bahasa Inggris, dan **sudah tersimpan**
   di V4.0 — tapi tidak pernah dicetak sejak V4.0 menggantikan V3. `aa47272`
   tidak mengembalikannya karena hanya memetakan kunci yang jelas terpakai.
2. **Nama bab menyimpang.** `aa47272` memakai "Konteks Murid" dan "Rancangan
   Pembelajaran" — istilah buatan sendiri. Isinya benar, tapi pengawas mencari
   nama resminya. Dikembalikan ke "Identifikasi" dan "Desain Pembelajaran".
3. **Identitas dokumen tidak pernah tercetak.** Nama guru, kelas, semester,
   tahun ajaran, program keahlian — semuanya ada di `rancang_settings`, tidak
   satu pun masuk berkas. Modul tanpa identitas penyusun bukan dokumen yang
   bisa diarsipkan sekolah.

Diverifikasi pada berkas .docx sungguhan dari produksi: 19.984 byte, 33.761
karakter, sembilan bab plus lampiran, nol "undefined", nol identifier mentah.

**Yang sengaja TIDAK diseragamkan:** KKTP tetap bab tersendiri meski tidak ada
di kerangka empat-bab. Ia istilah resmi Kurikulum Merdeka, dirujuk silang oleh
bab Asesmen dan bab Instrumen, dan CLAUDE.md §23.2 menegaskan istilah resmi
dipertahankan di dokumen yang guru cetak.

**Keputusan yang diambil tanpa menunggu Romo, dan mudah diubah:** satu berkas
per TP, Naskah sebagai lampiran di halaman baru — bukan dua berkas terpisah.
Alasannya guru mencetak satu dokumen per pertemuan; pemisahan di layar itu
kemudahan membaca, bukan kebutuhan cetak. Kalau Romo lebih suka dua berkas,
pemisahannya satu perubahan kecil.

---

### 4c. Sisanya — empat, bukan lima

*Dikoreksi 7 September 2026 saat rekonsiliasi ke HEAD `af3f32b`.*

Terdokumentasi di `docs/DAFTAR-PERTANYAAN-RANCANG.md` §Catatan, yang kini punya
tabel status di awal bagiannya. Cacat 4b di atas sudah masuk daftar itu sebagai
Catatan 8, dan cacat "menu revisi menyusut" masuk sebagai Catatan 7 — sebelumnya
ia hanya hidup di dokumen ini dan di CLAUDE.md §23.3, yang membuat angka "tujuh
inkonsistensi" di CLAUDE.md tidak pernah cocok dengan enam Catatan di sana.

Yang masih terbuka di dokumen itu: **Catatan 3, 4, 6, 7** (ditambah 8 = 4b di
atas, dan jalur "Ada sebagian data"). Catatan 1 dan 2 tertutup di `696c415`,
Catatan 5 di `3505493`.

Yang paling merugikan tetap **Catatan 7 — menu revisi menyusut tepat saat guru
bisa melihat hasilnya**: setelah draf ATP tampil, rute ke Profil Siswa, Konteks
Kejuruan, dan Penguatan Prasyarat hilang dari pilihan
(`guru/js/rancang-chat-flow.js:322-330`), padahal itu saat pertama guru bisa
melihat ATP-nya tidak mengakomodasi murid yang tertinggal. Yang tersisa hanya
"Buat ulang ATP", yang memakan satu dari tiga jatah harian.

---

## 5. Yang perlu diputuskan Romo

1. **Sepuluh akun tanpa `role_guru`.** 38% pengguna terdaftar, tetap terkunci
   meski tier dibuka. Disengaja, atau onboarding tidak pernah menyetelnya?
2. **Tiga guru mana untuk tahap pertama.** Pilih yang bisa dihubungi. Kalau
   bisa, satu yang jadwalnya terbagi — itu langsung menguji jalur paling rawan.

---

## 6. Perintah yang berguna

> **Catatan cara pakai (7 September 2026).** `supabase db query` pada CLI v2.107
> **tidak menerima `-f -`** (stdin) — ia menjawab
> `failed to read SQL file: open -`. Tulis SQL-nya ke berkas dulu, lalu
> `supabase db query --linked -f berkas.sql`. Contoh di bawah sudah disesuaikan.

```bash
# Sebaran role & tier — siapa yang masuk kalau gerbang dibuka
cat > /tmp/q.sql <<'SQL'
SELECT COALESCE(role_guru,'(kosong)') r, COALESCE(tier,'(kosong)') t, count(*)
FROM public.profiles WHERE role='GURU' GROUP BY 1,2 ORDER BY 3 DESC;
SQL
supabase db query --linked -f /tmp/q.sql

# Uji isolasi: menyamar sebagai JWT guru tanpa perlu kata sandi
#   BEGIN;
#   SET LOCAL role authenticated;
#   SET LOCAL request.jwt.claims TO '{"sub":"<user_id>","role":"authenticated"}';
#   ... query ...
#   ROLLBACK;
# Validasi mekanismenya dulu: fn_current_profile_id() harus mengembalikan
# profil yang benar, kalau tidak seluruh uji di bawahnya tidak sah.

# Jaring regresi validator — sebelum & sesudah menyentuh validator
deno run --allow-read --allow-write tests/validator-modul.ts

# Wajib sebelum deploy EF
deno check supabase/functions/generate-atp/index.ts
deno check supabase/functions/generate-modul/index.ts
```

**Catatan jatah:** ATP 3×/hari per `atp_induk_id`, Modul 5×/hari per kelas dan
hanya Fase A yang menghitung. Membuat ATP uji baru memberi jatah baru — itu yang
membuat matriks simulasi terjangkau.
