# Tab Rancang — kesiapan go-live

> Ditulis 6 September 2026, HEAD `b67ec0f`. Berdiri sendiri: sesi mana pun bisa
> membacanya tanpa konteks percakapan sebelumnya.
>
> **Status: putusan GO BERTAHAP ditahan atas permintaan Romo.** Romo menilai
> perlu kepastian lebih dulu tentang bagaimana Tab Rancang bekerja sampai
> tuntas. Dokumen ini mencatat putusan beserta dasarnya supaya tidak disusun
> ulang dari awal.

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

### Syarat sebelum gerbang dibuka

Satu, dan bisa dikerjakan tanpa pengguna: **jalankan `reguler_bagi` dan `blok`
sampai tuntas.** Jatah generate dihitung per `atp_induk_id`, jadi dua ATP uji
baru muat. Kalau salah satunya patah, putusan berubah jadi no-go.

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
| **Unduh .docx** | **TIDAK PERNAH diuji sesi ini** |
| Pola `reguler_bagi` / `blok` | **TIDAK PERNAH** |
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

### 4c. Lima sisanya

Terdokumentasi di `docs/DAFTAR-PERTANYAAN-RANCANG.md` §Catatan. Yang paling
merugikan: **menu revisi menyusut tepat saat guru bisa melihat hasilnya** —
setelah draf ATP tampil, rute ke Profil Siswa dan Penguatan Prasyarat hilang
dari pilihan, padahal itu saat pertama guru bisa melihat ATP-nya tidak
mengakomodasi murid yang tertinggal. Yang tersisa hanya "Buat ulang ATP", yang
memakan satu dari tiga jatah harian.

---

## 5. Yang perlu diputuskan Romo

1. **Sepuluh akun tanpa `role_guru`.** 38% pengguna terdaftar, tetap terkunci
   meski tier dibuka. Disengaja, atau onboarding tidak pernah menyetelnya?
2. **Tiga guru mana untuk tahap pertama.** Pilih yang bisa dihubungi. Kalau
   bisa, satu yang jadwalnya terbagi — itu langsung menguji jalur paling rawan.

---

## 6. Perintah yang berguna

```bash
# Sebaran role & tier — siapa yang masuk kalau gerbang dibuka
supabase db query --linked -f - <<'SQL'
SELECT COALESCE(role_guru,'(kosong)') r, COALESCE(tier,'(kosong)') t, count(*)
FROM public.profiles WHERE role='GURU' GROUP BY 1,2 ORDER BY 3 DESC;
SQL

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
