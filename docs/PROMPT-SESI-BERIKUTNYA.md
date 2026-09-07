# Prompt siap pakai untuk sesi berikutnya

> Disusun 6 September 2026 pada HEAD `800b230`. Empat prompt, dikerjakan
> **berurutan** — B tidak bisa dinilai sebelum A selesai, dan C tidak boleh
> dijalankan sebelum B lulus.
>
> Setiap prompt berdiri sendiri: salin utuh ke sesi Claude Code baru. Sesi itu
> akan membaca `CLAUDE.md` dan `AGENT_RULES.md` sendiri, jadi aturan kerja tidak
> perlu diulang di sini.
>
> **Keadaan saat prompt ini disusun**
> - HEAD `800b230`, `origin/main` sinkron, pohon kerja bersih
> - Edge Function: `generate-modul` v61 · `generate-atp` v18 · `generate-rancang` v33
> - Tab Rancang sudah bekerja tuntas: TP 6 (98 detik) dan TP 5 (109 detik),
>   keduanya diaudit langsung di aplikasi produksi

---

## Prompt A — Rekonsiliasi daftar pekerjaan yang tersisa

Kerjakan lebih dulu. Tidak menuntut keputusan Romo, dan hasil ketiga prompt
berikutnya bergantung padanya.

```
Jalankan /sip-start dulu.

Tugas: daftar pekerjaan yang tersisa di CLAUDE.md dan dokumen backlog sudah
tidak bisa dipercaya. Sembilan belas commit masuk dari beberapa sesi berbeda dan
penandaan "selesai" tertinggal. Rekonsiliasi daftarnya dengan kode aktual.

Yang SUDAH terverifikasi basi (jangan diverifikasi ulang, langsung perbaiki):

1. CLAUDE.md §12 baris ~293 menyatakan "generate-atp belum disembuhkan — masih
   punya maxOutputTokens 5000 berupa angka mati dan tidak memeriksa
   finishReason". Itu sudah diperbaiki di commit b67ec0f. Buktinya di
   supabase/functions/generate-atp/index.ts: fungsi anggaranTokenAtp() baris 55,
   dipakai di baris 420, dan cek finishReason === 'MAX_TOKENS' di baris 457.

2. CLAUDE.md menyebut "Tujuh inkonsistensi alur pertanyaan", tetapi
   docs/DAFTAR-PERTANYAAN-RANCANG.md hanya memuat enam Catatan. Cari tahu apakah
   yang ketujuh memang ada (CLAUDE.md §23.3 menyebut menu revisi #46 dan jalan
   buntu "Ada sebagian data") atau angkanya keliru sejak awal.

3. Catatan 5 sudah ditandai selesai sejak 3505493. Catatan 1 dan 2 kemungkinan
   sudah ditangani 696c415 menurut catatan sesi di CLAUDE.md, tetapi tidak
   ditandai di dokumennya. Verifikasi ke kode, lalu tandai.

Yang harus dikerjakan:
- Telusuri SETIAP item terbuka di CLAUDE.md §12, §23.3, dan keempat dokumen
  docs/BACKLOG-*.md serta docs/DAFTAR-PERTANYAAN-RANCANG.md ke kode aktual.
- Untuk tiap item: tandai SELESAI beserta nomor commitnya, atau biarkan terbuka
  dengan alasan singkat mengapa masih terbuka.
- Perbarui CLAUDE.md §12 (HEAD, checklist) dan dokumen backlog terkait.
- Kalau menemukan pernyataan lain di CLAUDE.md yang bertentangan dengan kode,
  perbaiki juga dan sebutkan di laporan.

Aturan: jangan menandai apa pun selesai tanpa menunjukkan baris kode atau commit
yang membuktikannya. Kalau ragu, biarkan terbuka dan katakan ragunya di mana.

Keluaran akhir: satu daftar pendek berisi apa yang benar-benar masih terbuka,
diurutkan dari yang paling merugikan guru.
```

---

## Prompt B — Syarat go-live: pola jadwal `reguler_bagi` dan `blok`

Ini satu-satunya syarat yang `docs/BACKLOG-GO-LIVE-RANCANG.md` tetapkan sebelum
gerbang dibuka, dan bisa dikerjakan tanpa melibatkan pengguna.

```
Jalankan /sip-start dulu. Baca docs/BACKLOG-GO-LIVE-RANCANG.md seluruhnya.

Konteks: putusan GO BERTAHAP untuk Tab Rancang ditahan menunggu satu syarat —
pola jadwal reguler_bagi dan blok belum pernah dijalankan sampai tuntas sekali
pun. Satu ATP di produksi yang memakai reguler_bagi menghasilkan NOL TP. Selama
ini belum diketahui apakah itu cacat pola jadwalnya atau kebetulan data.

Tugas: jalankan kedua pola itu sampai tuntas dan tentukan apakah keduanya sehat.

Cara kerja:
- Jatah generate ATP dihitung per atp_induk_id, jadi dua ATP uji baru muat tanpa
  memakan jatah ATP yang sudah ada.
- Anda bisa menjalankan alurnya sendiri lewat panel Browser setelah Romo login
  sekali. Jangan meminta Romo mengeklik apa pun yang bisa Anda lakukan sendiri.
- Periksa hasilnya dari basis data (supabase db query --linked), bukan dari
  tafsir pesan di layar. Yang menentukan: apakah progresi_tp terisi, apakah
  jumlah TP masuk akal, apakah jumlah JP-nya menutup jp_operasional.

Kalau salah satu pola patah:
- Telusuri sebabnya sampai ke baris kode. Jangan berhenti di gejala.
- Menurut dokumen go-live, pola yang patah mengubah putusan menjadi NO-GO. Jadi
  hasil pekerjaan ini menentukan boleh atau tidaknya Prompt C dijalankan.

Kalau keduanya sehat:
- Catat buktinya di docs/BACKLOG-GO-LIVE-RANCANG.md dan nyatakan syaratnya
  terpenuhi.

Peringatan yang sudah mahal dipelajari di proyek ini:
- Jalankan deno check sebelum functions deploy — esbuild tidak type-check, dan
  ReferenceError yang lolos muncul di browser sebagai kegagalan CORS.
- Kalau generate gagal, baca log Edge Function di dashboard Supabase. Sejak
  cf777dc pemotongan token melaporkan fase, batas, dan pemakaiannya sendiri.
  Jangan menebak dari gejala.
- Periksa keadaan modul/ATP di basis data SEBELUM memperbaiki apa pun. Sesi
  sebelumnya membuang tiga jam memperbaiki fase yang salah karena mewarisi
  premis dari prompt tanpa memeriksanya.
```

---

## Prompt C — Buka gerbang untuk 3 guru

**Jangan jalankan sebelum Prompt B lulus.** Prompt ini mengubah data produksi
dan menuntut persetujuan Romo secara eksplisit.

```
Jalankan /sip-start dulu. Baca docs/BACKLOG-GO-LIVE-RANCANG.md seluruhnya.

Prasyarat: pola jadwal reguler_bagi dan blok sudah dinyatakan sehat (lihat
dokumen itu). Kalau belum, HENTIKAN dan katakan ke Romo.

Konteks: Tab Rancang dijaga dua syarat, role_guru = 'GURU_MAPEL_UMUM_SMK' DAN
tier = 'GURU_PRO'. Saat ini hanya 1 akun (Romo) yang memenuhi keduanya. Ada 14
guru GURU_MAPEL_UMUM_SMK bertier TRIAL yang tinggal diubah tiernya. Putusan yang
sudah disusun: buka untuk 3 orang dulu, bukan 14.

Tugas:
1. Tampilkan ke Romo daftar kandidat 3 guru beserta dasar pemilihannya (kelas,
   mapel, kesiapan data). Tunggu Romo menyetujui SIAPA bertiganya — jangan pilih
   sendiri.
2. Setelah disetujui, siapkan perubahan tier dan tampilkan SQL-nya verbatim
   lebih dulu. Jalankan hanya setelah Romo mengiyakan.
3. Siapkan cara memantau tanpa merepotkan siapa pun. Dokumen go-live menyebut
   tiga tanda yang membatalkan bertahap menjadi tutup lagi, dan ketiganya
   terpantau dari basis data:
   - guru yang ATP-nya gagal dua kali berturut dengan sebab sama
   - munculnya ATP_GENERATION_TRUNCATED
   - satu saja baris data terlihat lintas guru
   Tulis query untuk ketiganya, simpan di docs/, dan jelaskan cara membacanya.
4. Siapkan cara menutup kembali: satu SQL yang mengembalikan tier ketiganya.
   Tunjukkan ke Romo supaya ia tahu pintu keluarnya ada.

Yang TIDAK boleh dilakukan:
- Mengubah tier tanpa persetujuan eksplisit Romo untuk akun-akun spesifik itu.
- Membuka untuk lebih dari 3 orang, betapapun mudahnya.
- Mengirim pemberitahuan apa pun ke guru. Itu keputusan Romo, bukan keputusan
  teknis.
```

---

## Prompt D — Sisa inkonsistensi alur pertanyaan

Bisa dikerjakan kapan saja, tidak bergantung pada A, B, atau C. Tapi kalau
Prompt A sudah selesai, daftarnya akan lebih akurat — kerjakan sesudahnya.

```
Jalankan /sip-start dulu. Baca docs/DAFTAR-PERTANYAAN-RANCANG.md, terutama
bagian Catatan.

Tugas: perbaiki sisa inkonsistensi alur pertanyaan Tab Rancang yang masih
terbuka setelah rekonsiliasi. Per 6 September 2026 yang masih terbuka:

- Catatan 3 — pertanyaan #47 (jumlah pertemuan) jawabannya ditimpa oleh
  distribusi dari ATP dan praktis tidak pernah terpakai. Guru diminta
  memutuskan sesuatu yang lalu dibuang.
- Catatan 4 — asesmen formatif tidak punya pertanyaan teknik, padahal
  diagnostik dan sumatif punya.
- Catatan 6 — ATP tidak pernah menanyakan jumlah murid, padahal Modul
  menanyakannya dan memakainya untuk merancang instrumen.
- Menu revisi setelah draf ATP terlihat (#46) kehilangan rute ke Profil Siswa
  dan Penguatan Prasyarat — tepat pada saat guru pertama kali bisa melihat bahwa
  ATP-nya tidak mengakomodasi murid yang tertinggal. CLAUDE.md §23.3 menyebut ini
  yang paling merugikan guru di antara semuanya.
- Jalan buntu pada jawaban "Ada sebagian data".

Urutkan dari yang paling merugikan guru, bukan dari yang paling mudah.

Aturan yang berlaku di sini (dari pelajaran sesi sebelumnya):
- Menambah pertanyaan itu murah; menyambungkannya ke hasil tidak. Sebelum
  menambah pertanyaan apa pun, tunjukkan baris kode yang akan membaca jawabannya.
- Sebaliknya: kalau sebuah pertanyaan jawabannya memang tidak dipakai, pilihan
  yang benar mungkin membuang pertanyaannya, bukan menyambungkannya. Putuskan
  berdasarkan apakah guru benar-benar perlu memutuskan hal itu.
- Jangan membuat routing ke fase yang belum diimplementasikan.
```

---

## Urutan dan gerbang

| | Prompt | Butuh keputusan Romo? | Menyentuh apa |
|---|---|---|---|
| 1 | A — Rekonsiliasi daftar | tidak | dokumentasi saja |
| 2 | B — Pola jadwal | tidak | kode, mungkin deploy EF |
| 3 | C — Buka gerbang 3 guru | **ya, dua kali** | data produksi |
| 4 | D — Sisa inkonsistensi alur | tidak | klien, mungkin EF |

C hanya boleh dijalankan kalau B lulus. Kalau B menemukan pola jadwal yang
patah, putusan berubah menjadi NO-GO dan C dibatalkan sampai patahnya diperbaiki.
