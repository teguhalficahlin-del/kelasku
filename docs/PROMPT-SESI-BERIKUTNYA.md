# Prompt sesi berikutnya — MiClass

> Ditulis 9 September 2026, HEAD `6df1f8c`. Salin seluruh isi blok di bawah
> sebagai pesan pembuka sesi baru.

---

## PROMPT (salin mulai baris berikut)

Ikuti `CLAUDE.md` dan `AGENT_RULES.md`. Kerjakan
`docs/PROMPT-SESI-BERIKUTNYA.md` — dokumen ini.

### Keadaan saat serah terima

- **HEAD `6df1f8c`**, kerja bersih, semua sudah di-push
- Produksi: **9 ATP, 1 Modul Ajar** (modul TP 2 yang jadi bahan telaah Codex)
- Edge Function `generate-atp` dan `generate-modul` **sudah ter-deploy** pada
  versi HEAD
- Jaring regresi lulus semua: `tests/validator-modul.ts`,
  `tests/dimensi-profil-lulusan.ts`, `tests/kebijakan-bahasa.ts`
- **Kredit Gemini sudah diisi ulang** setelah sempat habis (saldo minus)

### YANG PALING MENDESAK — satu uji yang belum dijalankan

Commit `6df1f8c` memasang aturan baru di `generate-modul` dan `generate-atp`,
**dan belum pernah sekali pun menghasilkan modul.** Jalankan satu generate dan
periksa dua hal yang saling bertentangan:

1. **Cacat aslinya tertutup?** Tugas pencarian informasi harus terjawab dari
   bahannya. Yang dulu salah: "temukan tiga larangan Do not" dari label yang
   hanya punya satu; "kasus gaun sutra atau jas wol dari PBL-01" dari label
   berbahan poliester-rayon.

2. **Yang sehat TIDAK ikut hilang?** Ini yang lebih penting dan lebih mudah
   terlewat. Tugas **inferensi** ("mengapa pakaian ini tidak boleh diberi
   pemutih?") dan **kreasi** ("tulis label baru untuk produkmu") harus TETAP
   muncul. Kalau modul jadi berisi pertanyaan salin-tempel semua, aturannya
   terlalu ketat dan harus dilonggarkan.

Pola kesalahan berulang sepanjang sesi kemarin: **menemukan satu cacat, lalu
memasang larangan yang lebih lebar daripada cacatnya.** Tiga dari lima aturan
sempat akan melarang pembelajaran yang sehat, dan tertangkap hanya karena
ditanyakan balik ke penelaah ahli sebelum dipasang. Uji nomor 2 di atas ada
untuk menangkap kekambuhannya.

Cara verifikasi: baca `modul_induk.konten` langsung lewat
`supabase db query --linked`. Jangan menyimpulkan dari layar.

### Keputusan yang menunggu Romo — jangan dikerjakan sendiri

**1. Lisensi simbol GINETEX.** Pustaka simbol perawatan pakaian (ISO 3758)
**ditahan sepenuhnya.** Secara teknis sudah terbukti bisa — rantai SVG → PNG →
Word berjalan di peramban guru, tanpa server, ~3 KB per gambar. Yang belum:
apakah MiClass **boleh mendistribusikannya**. GINETEX memegang hak merek di
banyak negara, dan menggambar ulang tidak memberi hak menyebarkan.

Catatan penting: pernyataan "label asli bebas dari soal lisensi" yang sempat
dibuat **terlalu mutlak**. Memakai benda asli hanya menghindarkan MiClass dari
kebutuhan memproduksi ulang simbol; ia bukan dasar menyatakan seluruh
penggunaan turunannya bebas izin.

**2. Catatan 6 — apakah jumlah murid perlu memengaruhi ATP?** Datanya sudah
sampai, `generate-atp` tinggal membacanya. Yang menahan keputusan produk, bukan
pekerjaannya. Uraian di `docs/DAFTAR-PERTANYAAN-RANCANG.md` Catatan 6.

**3. Kohor guru berikutnya.** Gerbang masih untuk tiga akun. Jalur yang bisa
dicabut (`rancang_akses_uji_coba`) sudah siap dan belum pernah dipakai.

### Yang sudah terukur dan layak dilanjutkan

Tabel `ai_usage` (migration `20260909000001`) mencatat token tiap panggilan AI.
Data pertama, 17 panggilan, 271.002 token:

| | token |
|---|---|
| Satu ATP | 7.459 |
| Satu Modul Ajar (5 fase) | 86.626 |
| — di antaranya Naskah Fasilitasi | 30.072 (**35%**) |

Tiga temuan dari angka itu:

- **46% biaya modul adalah SYSTEM_PROMPT yang dikirim ulang lima kali**
  (±8.000 token × 5 fase). Ini tuas penghematan terbesar yang tersedia, dan
  tidak mengurangi mutu sedikit pun. Periksa apakah Gemini mendukung context
  caching. **Setiap aturan baru di prompt berbiaya, dan dikalikan lima.**
- **Token penalaran besar dan tak terlihat**: pada ATP, keluaran 1.527 token
  tapi penalaran 3.834. Inilah sebab plafon token roboh berulang kali dulu.
- **Kegagalan tetap menagih.** Modul terakhir gagal DUA KALI di validator V15
  (naskah mengarang kutipan) sebelum berhasil — tiga kali biaya untuk satu
  modul. Sesudah beberapa hari data terkumpul, hitung berapa persen generate
  gagal dan apakah V15 perlu dikalibrasi ulang.

Kalibrasi rupiah: bandingkan total token satu periode dengan tagihan periode itu
di Google AI Studio. Sesudah itu biaya per modul jadi angka, bukan taksiran.

### Riwayat telaah ahli — tiga putaran, dan apa yang dipelajari

Penelaah ahli kurikulum (Codex) menelaah tiga kali. Prompt dan hasilnya di
`docs/telaah/`. Yang perlu diingat saat menyiapkan putaran berikutnya:

- **Telaah bukan daftar perintah kerja.** Setiap klaim diperiksa ke data lebih
  dulu. Dari tiga CACAT putaran kedua, satu **keliru secara aritmetika** dan
  ditempatkan sebagai prioritas nomor satu; mengerjakannya akan memotong 200
  menit dari modul yang waktunya sudah tepat.
- **Satu CACAT lain benar gejalanya tapi salah sebabnya** — "Dasar CP tidak
  sesuai panduan" ternyata verbatim dari CP resmi; yang salah adalah hanya satu
  dari tiga elemen yang dikutip.
- Penelaah **menarik sendiri** temuan yang keliru setelah ditunjukkan
  penjumlahannya. Sejak itu ia diminta menuliskan penjumlahan untuk tiap temuan
  berupa hitungan.

### Satu kelas cacat yang sudah empat kali pindah tempat

Perhatikan ini saat membaca keluaran mana pun:

| Tempat | Bentuknya |
|---|---|
| 1. Bantuan diferensiasi | menjanjikan "panduan kosakata bergambar" yang tidak ada |
| 2. Sumber belajar & pemanfaatan digital | mendaftarkan "rekaman dialog" yang tidak ada |
| 3. Judul TP di ATP | "Menyimak kosakata dari rekaman suara" |
| 4. **Isi instrumen vs tugas yang merujuknya** | PBL-01 ADA dan terdaftar, tapi isinya tidak mendukung tugasnya |

Yang keempat paling halus: ia **lolos** pemeriksaan "apakah yang disebut ada di
manifest", karena instrumennya memang ada. Yang tidak diperiksa adalah apakah
ISINYA mendukung tugas yang dibangun di atasnya.

Pembedaan yang menyelesaikan ketiga yang pertama: **alat dan bahan itu dua hal
berbeda.** Punya proyektor tidak membuat videonya ada.

### Yang belum pernah disentuh sama sekali

- **Audit `rancang-chat.js` (174 KB) dan kedua mesin generate.** Dua dokumen
  audit yang ada (`AUDIT-RANCANG-UI.md`, `AUDIT-EF-API.md`) mengaudit berkas
  yang **sudah dihapus**. Audit untuk kode yang benar-benar berjalan belum
  pernah dibuat — padahal inilah berkas yang akan dipakai ribuan guru.
- **Klien mempercayai nomor ATP di penyimpanan peramban** tanpa memastikan
  ATP-nya masih ada. Kalau tidak ada, layar kosong tanpa pesan apa pun.
- **Test 4.4** — progres generate akun siswa, butuh siswa baru tanpa akun.
- **Direktori `admin/`** belum pernah didokumentasikan sebagai apa.

### Cara kerja yang berlaku

- Verifikasi `pwd` mengandung `MIClass` sebagai langkah pertama.
- Baca kode aktual sebelum merekomendasikan apa pun. Kemarin satu regresi
  nyaris masuk karena spesifikasi tidak menyebut penjaga `fn_is_guru_role()`
  yang ternyata ada di policy sungguhan; ketahuan hanya karena policy dibaca
  dari basis data, bukan dari migration lama.
- Uji di produksi lewat panel peramban setelah Romo login sekali — jangan
  membebankan verifikasi ke Romo.
- **Buktikan jalur datanya lebih dulu, baru hasilnya.** Kesalahan 8 September
  pagi: melaporkan "0 dari 12 TP menuntut video" sebagai bukti aturan bekerja,
  padahal aturannya tidak pernah menyala dan hasil bersihnya kebetulan.
- Naikkan `?v=` di `guru/classroom.html` DAN `CACHE_NAME` di `sw.js` setiap
  berkas JS berubah.
- `deno check` sebelum `functions deploy`.
- `git add` berkas spesifik — **jangan `git add .` atau `git add docs/`**.
  Kemarin dua kali menyapu berkas untracked yang tidak dimaksudkan.

## (akhir prompt)
