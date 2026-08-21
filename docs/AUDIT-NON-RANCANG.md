# Audit Bug & Gap — Semua Area kecuali Tab Rancang Pembelajaran

Tanggal: 21 Agustus 2026
Cakupan: portal guru (dashboard, kelola siswa, jadwal, absensi, catatan, pesan,
penilaian), portal siswa, portal ortu, onboarding, admin, PWA/service worker.
Dikecualikan: `classroom-rancang*.js`, `runtime-*.js`, tab Rancang Pembelajaran.

Metode: pembacaan kode statis + verifikasi silang ke migration SQL dan Edge
Function. Tidak ada kode yang diubah.

---

## P0 — Risiko kehilangan data / keamanan

### 1. Reset semester: penghapusan permanen di balik satu `confirm()`, tanpa jalan keluar
`guru/js/guru.js:838-889` (`applySemesterUI`, `handleSemesterReset`)

Pada 30 Juni dan 31 Desember (fase `terkunci`), dashboard menampilkan overlay
layar penuh yang tidak bisa ditutup. Satu-satunya tombol adalah **Mulai Semester
Baru**, yang memanggil Edge Function `semester-reset` — menghapus permanen
seluruh absensi, catatan, jadwal, dan penilaian di SEMUA classroom guru.

Konfirmasinya hanya `confirm()` biasa. Bandingkan dengan hapus satu classroom
(`handleDeleteClassroom`) yang mewajibkan guru mengetik ulang nama kelas, atau
hapus siswa massal yang mewajibkan ketik `HAPUS`. Operasi paling destruktif di
seluruh aplikasi justru punya pagar paling rendah.

Tidak ada verifikasi bahwa guru sudah meng-export data. Tidak ada tombol batal
pada overlay `terkunci` — guru yang refresh mendapat overlay yang sama.

### 2. Ortu dapat menyunting isi pesan guru
`supabase/migrations/20260820000007_pesan-ortu-guru.sql` (policy `pm_ortu_update_read`)

Policy UPDATE membatasi *baris* (hanya pesan ber-`author_role='GURU'` tentang
anaknya) tetapi tidak membatasi *kolom*. Ortu dapat memanggil PostgREST langsung
dan mengubah `content` pesan guru. Catatan di akhir migration mengakui hal ini
dan menyerahkan pencegahan ke klien — tetapi klien bukan batas keamanan.

Dampak: riwayat percakapan guru–ortu tidak dapat dipercaya sebagai bukti.

### 3. XSS tersimpan di dashboard admin
`admin/js/admin.js:126-145`, `admin/js/admin.js:67-79`

`g.full_name` dan `g.username` diinterpolasi mentah ke `innerHTML`, termasuk ke
dalam atribut `data-nama="${guru.full_name}"` tanpa escaping. Nama guru
sepenuhnya dikendalikan pendaftar (`options.data.full_name` saat signUp).

Nama berisi tanda kutip cukup untuk merusak markup; nama berisi tag/handler
mengeksekusi skrip dalam sesi admin — yang memegang token untuk
`activate_guru`, `delete_guru`, dan seterusnya. Semua modul lain di repo ini
punya helper `escHtml`; admin satu-satunya yang tidak memakainya.

### 4. Link berbagi = kredensial lengkap
`guru/js/classroom.js:741-749`, `siswa/js/siswa.js`, `ortu/js/ortu.js`

Login siswa memakai `email = NIS.KODE@sipmandiri.local` dengan `password = NIS`.
Link/QR yang dibagikan guru berisi `?kelas=KODE&nis=NIS` — yaitu seluruh bahan
untuk menyusun email dan password.

Validasi nama (`fn_validate_roster_login`) hanya berjalan di klien sebelum
`signInWithPassword`; pihak yang memanggil Supabase Auth langsung melewatinya.
Konsekuensinya: siapa pun yang melihat QR seorang siswa dapat masuk sebagai
siswa itu **dan** sebagai orang tuanya (`ortu.NIS.KODE`, password sama).

Ini konsekuensi desain ADR-003, bukan bug implementasi — tetapi perlu dicatat
eksplisit karena UI menampilkan nama sebagai "faktor ketiga" padahal bukan.

### 5. Gate trial dan batas 1 classroom hanya ada di klien
`guru/js/guru.js:290-297`, `guru/js/classroom.js:757-785`,
`supabase/functions/generate-akun/index.ts`

- Tidak ada policy atau trigger yang membatasi jumlah `classrooms` per guru.
- `generate-akun` dan `hapus-akun` tidak memeriksa `is_active` / `expires_at` /
  `tier` sama sekali.
- Batas "TRIAL = 1 classroom" dibaca dari `sessionStorage.guru_trial_status`;
  bila cache kosong (tab baru, PWA baru dibuka, sessionStorage dibersihkan),
  batas itu tidak diterapkan bahkan di UI.

Guru EXPIRED hanya dihalangi tombol yang di-`disabled`. Seluruh model bisnis
trial saat ini tidak ditegakkan server.

---

## P1 — Bug fungsional yang akan ditemui pengguna

### 6. Absensi yang belum disimpan hilang diam-diam saat pindah tab
`guru/js/classroom-attendance.js:752-770`

`tabJadwal.addEventListener('click', () => initAbsensiRekap())` memanggil
`renderAbsensi()` setiap kali tab diklik — bukan hanya pertama kali.
`renderSession` membangun ulang `sessionState[sid]` dari DB, sehingga status
S/I/A yang sudah ditandai guru tetapi belum ditekan **Simpan Absensi** kembali
ke HADIR tanpa peringatan apa pun.

Skenario nyata: guru menandai 5 siswa sakit, membuka tab Catatan untuk mengecek
sesuatu, kembali ke Jadwal & Absensi — semua tanda hilang.

### 7. Absensi mustahil dilakukan di luar jam pelajaran
`guru/js/classroom-attendance.js:63-69` (`sessionStatus`)

Form hanya aktif ketika jam perangkat berada di antara `start_time` dan
`end_time` **hari ini**. Setelah jam sesi lewat, form terkunci permanen — tidak
ada mekanisme backdate atau koreksi.

Guru yang lupa, kehilangan sinyal, atau baru sempat mengisi saat istirahat
kehilangan data hari itu selamanya. Sekaligus: jam yang dipakai adalah jam lokal
perangkat, jadi ponsel dengan jam meleset (atau zona waktu berbeda saat guru
bepergian) membuka/mengunci sesi pada waktu yang salah.

### 8. Siswa tanpa akun tidak eksis di absensi, catatan, dan pesan
`classroom-attendance.js:106-114`, `classroom-notes.js:33-41`

Ketiganya memuat roster dengan `.not('profile_id', 'is', null)` — hanya siswa
yang akunnya sudah di-generate. Sementara kartu classroom dan header "Daftar
Siswa (N)" menghitung seluruh `classroom_roster`.

Akibatnya guru melihat "32 siswa terdaftar" tetapi panel absensi hanya
menampilkan 12, dan dropdown catatan hanya berisi 12 nama — tanpa satu pun pesan
yang menjelaskan kenapa. Untuk classroom baru yang belum di-generate sama
sekali, panel absensi menampilkan "Belum ada siswa aktif di classroom ini"
padahal rosternya penuh.

### 9. Peringatan hapus classroom menghitung tabel yang salah
`guru/js/api.js:71-88` (`getClassroomStats`) vs `api.getRosterCount`

Kartu classroom menampilkan jumlah dari `classroom_roster`. Dialog peringatan
hapus menampilkan jumlah dari `classroom_members` (hanya siswa yang sudah punya
akun DAN terdaftar sebagai member).

Guru bisa membaca "• 0 siswa terdaftar" pada peringatan penghapusan untuk
classroom yang rosternya berisi 30 nama, lalu menganggap penghapusan itu aman.

### 10. Sesi admin mati setelah ±1 jam tanpa pemberitahuan yang benar
`admin/js/admin.js:85`, `admin/js/admin.js:230-236`

`_token` diisi sekali dari `authData.session.access_token` dan tidak pernah
diperbarui, padahal klien dikonfigurasi `autoRefreshToken: true`. Setelah access
token kedaluwarsa, setiap aksi gagal dengan pesan generik ("Gagal memuat data:
Permintaan gagal") sampai admin login ulang secara manual.

### 11. Tab Catatan bisa terbuka permanen dalam keadaan kosong
`guru/js/classroom-notes.js:756-766`

Handler klik tab menampilkan panel lebih dulu, lalu memanggil `initNotes()`
hanya bila `teacherId && classroomId` sudah terisi. Keduanya diisi setelah dua
`await` (getSession, query profil). Guru yang mengklik "Catatan" pada koneksi
lambat — sebelum auth selesai — mendapat panel kosong tanpa loading, tanpa
error, dan tanpa percobaan ulang. Satu-satunya jalan keluar adalah reload.

### 12. `initCustomSelect` tidak tersedia di halaman classroom
`guru/classroom.html:172-191` vs `guru/js/guru.js:2`

`guru.js` hanya dimuat di `index.html` dan `dashboard.html`. Semua pemanggilan
`window.initCustomSelect` di `classroom-notes.js` dan `classroom-schedule.js`
karena itu selalu jatuh ke `<select>` native.

Fungsionalitasnya aman (semua pemanggilan bergerbang `if`), tetapi dropdown
"Pilih siswa", "Filter siswa", "Pilih hari", dan "Hari" pada modal jadwal
tampil sebagai kontrol native — teks gelap di atas panel gelap pada sebagian
browser. Inilah persis masalah yang custom dropdown dibuat untuk mengatasi.

---

## P2 — Ketidaksesuaian dokumen dengan aplikasi

### 13. Petunjuk Penilaian menjelaskan tombol yang tidak ada
`guru/js/classroom.js:1113`

> "Klik **Publikasikan** agar nilai muncul di portal siswa dan orang tua. Status
> berubah menjadi **Dipublikasi**. Klik **Batalkan Publikasi** untuk tarik
> kembali kapan saja."

Tidak ada tombol "Publikasikan" di mana pun dalam kode. Mekanisme yang benar
sekarang adalah dua checkbox `is_visible_siswa` / `is_visible_ortu` di dalam
form penilaian (migration `20260820000006`). Guru akan mencari tombol yang tidak
pernah ada.

Catatan turunan: migration itu men-set `is_visible_* = true` untuk semua
penilaian lama, tetapi kolomnya `DEFAULT false` — sehingga penilaian **baru**
default-nya tersembunyi. Ini kebalikan dari perilaku yang dijelaskan intro
petunjuk, dan guru tidak diberi tahu.

### 14. Petunjuk Catatan menjanjikan fitur pengumuman kelas
`guru/js/classroom.js:1089` vs `guru/js/classroom-notes.js:207-212`

> "pilih siswa dari dropdown. Jika tidak pilih siswa, catatan berlaku sebagai
> pengumuman seluruh kelas."

Kode menolak submit tanpa siswa: *"Pilih siswa terlebih dahulu."* Fitur
pengumuman kelas tidak ada.

### 15. Label tombol pada petunjuk tidak cocok dengan UI
`guru/js/classroom.js:1071` menyebut **Salin Link Siswa** / **Salin Link Ortu**;
tombol sebenarnya berlabel **Siswa** dan **Ortu** (`classroom.js:84-88`).

---

## P3 — Gap fungsional dan kualitas

### 16. Tidak ada pemulihan password sama sekali
Tidak ada `resetPasswordForEmail` maupun tautan "Lupa password" di seluruh repo.
Portal admin juga tidak punya aksi reset password. Guru yang lupa password
kehilangan akses kecuali admin turun tangan lewat dashboard Supabase.

### 17. Peringatan NIS duplikat pada import langsung tertimpa
`guru/js/classroom.js:390-408`

Peringatan "N NIS sudah ada di roster dan akan diperbarui" ditulis ke
`resultEl`, lalu import berjalan tanpa konfirmasi dan menimpa `resultEl` dengan
"Import selesai". Guru tidak pernah sempat membaca peringatan, apalagi
membatalkan.

### 18. Popup QR tidak diperiksa
`guru/js/classroom.js:163-175`

`window.open(...)` diikuti `win.document.write(...)` tanpa cek `win === null`.
Popup blocker (default di banyak browser mobile) menghasilkan
`TypeError: Cannot read properties of null` dan tombol QR seolah tidak berfungsi.

### 19. Export Catatan mengabaikan filter yang sedang aktif
`guru/js/classroom-notes.js:474-480`

Tombol Export selalu mengekspor `_notes` penuh, bukan hasil filter siswa /
visibilitas / rentang tanggal yang sedang tampil di layar.

### 20. Riwayat Catatan tanpa pagination
`classroom-notes.js:141-186` merender seluruh catatan sekaligus, sementara
roster, absensi per sesi, dan rekap semuanya sudah dipaginasi. Satu semester
catatan untuk 30 siswa akan membuat tab ini berat di ponsel.

### 21. Pesan guru–ortu tidak pernah menyegarkan diri
Kedua sisi hanya memuat pesan sekali saat render. Tidak ada polling maupun
realtime. Pesan ortu baru terlihat guru setelah reload halaman — untuk kanal
yang dipromosikan sebagai sarana melapor "anak saya sakit hari ini", ini gap
yang terasa.

Terkait: pesan ortu hanya ditandai terbaca ketika guru **membalas**
(`tandaiDibaca` dipanggil di handler Balas saja), sehingga badge "N baru"
bertahan meski guru sudah membacanya.

### 22. Dashboard guru: 2N request berurutan
`guru/js/guru.js:266-271` memanggil `getRosterCount` lalu `getScheduleCount`
satu per satu di dalam loop `for`. 6 classroom = 12 request berantai sebelum
kartu terakhir muncul.

### 23. Ketergantungan CDN pihak ketiga tidak di-precache
`guru/classroom.html:172-182` memuat supabase-js, qrcode, dan docx dari
jsdelivr. Service worker hanya mem-precache shell lokal. Di sekolah dengan
jaringan yang memblokir CDN, atau saat offline, halaman classroom gagal total
(supabase-js adalah dependensi keras). QR sudah bergerbang; `docx` tidak.

### 24. Detail kecil
- `generateShareLink` menanam path `/kelasku` secara hardcode
  (`classroom.js:743`). Memasang custom domain akan mematahkan semua QR dan link
  berbagi sekaligus.
- Setiap modul di halaman classroom menjalankan `getSession()` + query `profiles`
  sendiri — lima kali pada satu kali muat halaman.
- Tombol **Hapus Terpilih** ikut dinonaktifkan saat trial habis
  (`classroom.js:437`), sehingga guru EXPIRED tidak bisa membersihkan datanya
  sendiri.
- Tidak ada `beforeunload` guard untuk absensi yang belum disimpan.

---

## Ringkasan prioritas

| # | Temuan | Prioritas |
|---|--------|-----------|
| 1 | Reset semester tanpa pagar | P0 |
| 2 | Ortu bisa menyunting pesan guru | P0 |
| 3 | XSS dashboard admin | P0 |
| 4 | Link berbagi = kredensial | P0 (desain) |
| 5 | Gate trial hanya di klien | P0 (bisnis) |
| 6 | Absensi belum tersimpan hilang saat pindah tab | P1 |
| 7 | Absensi tidak bisa di-backdate | P1 |
| 8 | Siswa tanpa akun tak terlihat di 3 fitur | P1 |
| 9 | Peringatan hapus classroom salah hitung | P1 |
| 10 | Token admin tidak diperbarui | P1 |
| 11 | Tab Catatan kosong permanen (race) | P1 |
| 12 | `initCustomSelect` absen di classroom.html | P1 |
| 13–15 | Petunjuk tidak cocok dengan UI | P2 |
| 16–24 | Gap fungsional & kualitas | P3 |
