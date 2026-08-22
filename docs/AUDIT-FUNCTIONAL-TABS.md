# Audit Fungsional Seluruh Tab — MIClass

**Tanggal audit:** 19 Agustus 2026
**HEAD saat audit:** `5c2bf60`
**Classroom uji:** `8b0d508e-8de3-47c4-8c83-67a5eb9967ae`
**Planning context uji:** `4f30af06-9dc1-4072-b395-7ee525b68529`
**Metode:** read-only — pembacaan source file + query `SELECT` ke Supabase produksi (`--linked`). Nol write: tidak ada perubahan kode, tidak ada DDL/DML, tidak ada push.

Audit dijalankan dalam 5 fase berurutan. Setiap temuan menyebut file dan nomor baris pada versi file saat audit.

---

## Kondisi Data Classroom Uji (terverifikasi di produksi)

| Entitas | Jumlah |
|---|---|
| `classroom_roster` | 35 |
| Roster punya akun (`profile_id` non-NULL) | **0** |
| `classroom_members` (SISWA) | 0 |
| `schedules` | **0** |
| `attendance` | 0 |
| `student_notes` | 0 |
| `tp_kktp` | 5 |
| `assessments` | 5 |
| `assessment_results` | 14 |
| `grade_recap` | 35 |
| `student_groups` | 0 |
| `rancang_planning_contexts` | 2 |
| `rancang_artifacts` | 8 |

Kondisi ini membingkai sebagian besar temuan: 35 siswa tanpa akun dan 0 jadwal melumpuhkan Absensi, Catatan, dan roster Runtime sekaligus; 8 artifact memblokir penghapusan kelas.

---

## Phase 1 — Dashboard & Classroom Management

### Dashboard Guru

- **Status:** PARTIAL
- **Bug:** `api.getTrialStatus()` melempar exception saat RPC gagal ([api.js:107](../guru/js/api.js)), tapi dipanggil tanpa `try/catch` di init ([guru.js:695](../guru/js/guru.js)). Satu kegagalan RPC membuat `applyTrialUI`, `applySemesterUI`, dan `loadClassrooms` tidak pernah jalan — dashboard kosong total tanpa pesan error. Bandingkan `classroom.js:756` yang sudah membungkusnya dengan `try/catch`.
- **Severity:** HIGH
- **Rekomendasi:** Bungkus `getTrialStatus()` dengan `try/catch`, fallback `trialStatus = null`, lanjutkan ke `loadClassrooms`. Trial gate tidak boleh jadi blocking dependency untuk render daftar kelas.

- **Gap:** `loadClassrooms` melakukan 2 query berurutan per kelas di dalam loop `for...of` ([guru.js:285-289](../guru/js/guru.js)) — N+1 sekuensial.
- **Severity:** LOW
- **Rekomendasi:** Ganti jadi dua query agregat dengan `.in()`, atau minimal `Promise.all`.

### Buat Kelas

- **Status:** WORKS (gate bisa ditembus)
- **Bug:** Gate TRIAL ([guru.js:296-301](../guru/js/guru.js)) dan gate EXPIRED ([guru.js:631](../guru/js/guru.js)) hanya men-`disabled` `#btn-buat-classroom`. Tombol `.btn-buat-cl-empty` di empty-state ([guru.js:279-281](../guru/js/guru.js)) tidak ikut di-gate.
- **Severity:** MEDIUM
- **Rekomendasi:** Pindahkan pengecekan ke dalam `openModal()` — satu titik gate.

- **Gap:** Tidak ada gate sisi server sama sekali. Policy `pol_classrooms_guru_all` ([20260730000001_init-schema.sql:261](../supabase/migrations/20260730000001_init-schema.sql)) hanya memeriksa `teacher_id = fn_current_profile_id()` — tanpa cek `expires_at`, jumlah kelas, atau konsistensi mapel. Seluruh batasan bisnis murni client-side.
- **Severity:** HIGH
- **Rekomendasi:** Trigger `BEFORE INSERT ON classrooms` yang menolak bila `expires_at < now()` atau melewati batas peran.

- **Bug:** Validasi konsistensi mapel hanya membandingkan `cachedClassrooms[0].subject` ([guru.js:488](../guru/js/guru.js)), bukan seluruh kelas.
- **Severity:** LOW

- **Gap:** `#btn-lewati` dihapus saat runtime ([guru.js:521](../guru/js/guru.js)) tapi masih dideklarasikan di [dashboard.html:159](../guru/dashboard.html), dan teks bantuan masih menjanjikan "lewati dulu" ([guru.js:713](../guru/js/guru.js)).
- **Severity:** LOW

### Edit Kelas

- **Status:** PARTIAL
- **Bug:** Setelah update, hanya `.card-name` dan `.card-subject` disegarkan ([guru.js:471-475](../guru/js/guru.js)). `cachedClassrooms` tidak diperbarui sehingga validasi mapel berikutnya memakai data lama; `.card-desc` tidak diperbarui dan tidak ada di DOM bila deskripsi awalnya kosong ([guru.js:206](../guru/js/guru.js)).
- **Severity:** MEDIUM
- **Rekomendasi:** Patch `cachedClassrooms` dan ganti seluruh kartu via `renderCard()`.

- **Gap:** Indikator langkah "1 — 2" tetap tampil di modal Edit meski Step 2 tidak dipakai.
- **Severity:** LOW

### Hapus Kelas

- **Status:** BROKEN
- **Bug (CRITICAL):** Menghapus kelas yang pernah melewati pipeline Rancang Pembelajaran **selalu gagal dengan pelanggaran foreign key**:
  - `rancang_planning_contexts.classroom_id → classrooms` = **CASCADE** ([20260818000003:97](../supabase/migrations/20260818000003_phase2a_planning_foundation.sql))
  - `rancang_artifacts.planning_context_id → rancang_planning_contexts` = **RESTRICT** ([20260818000005:9](../supabase/migrations/20260818000005_phase2b_artifact_lifecycle_foundation.sql))

  Diverifikasi di schema produksi — tiga constraint `confdeltype = 'r'` menggantung di `rancang_planning_contexts`: `rancang_artifacts`, `rancang_artifact_versions`, `rancang_artifact_dependencies`. Rantai serupa lewat `rancang_legacy_atp_mappings → rancang_dokumen`. Classroom uji sudah terkena (2 planning context, 8 artifact); tombol Hapus dijamin gagal dan menampilkan pesan Postgres mentah lewat `window.alert` ([guru.js:406](../guru/js/guru.js)).
- **Severity:** CRITICAL
- **Rekomendasi:** Migration bergaya `20260818000002_phase1_fk_lifecycle_fix.sql` — ubah ketiga FK `*_planning_context_id_fkey` menjadi `ON DELETE CASCADE`, plus `rancang_legacy_atp_mappings_legacy_rancang_dokumen_id_fkey`. Alternatif: RPC `fn_delete_classroom(p_id)` SECURITY DEFINER yang menghapus turunan pipeline secara eksplisit dalam satu transaksi.

- **Bug:** Dialog konfirmasi menampilkan angka salah di kedua baris ([guru.js:389-395](../guru/js/guru.js), sumber [api.js:72-87](../guru/js/api.js)):
  - `stats.members` menghitung `classroom_members`, sedangkan kartu menghitung `classroom_roster`. Kelas uji: kartu **35 siswa**, dialog **0 siswa terdaftar**.
  - `stats.sessions` berlabel "sesi absensi" tapi menghitung baris `attendance` yang grainnya per-siswa-per-tanggal-per-jadwal ([20260805000002:17](../supabase/migrations/20260805000002_attendance.sql)).
- **Severity:** HIGH
- **Rekomendasi:** Hitung siswa dari `classroom_roster`; hitung sesi dengan `count(DISTINCT (tanggal, schedule_id))`.

- **Bug:** `deleteClassroom` tidak memverifikasi baris terhapus ([api.js:89-91](../guru/js/api.js)). Penolakan RLS mengembalikan sukses dengan 0 baris; UI tetap menghapus kartu ([guru.js:410-411](../guru/js/guru.js)).
- **Severity:** MEDIUM

- **Gap:** Peringatan pakai `window.alert` yang hanya punya OK ([guru.js:389](../guru/js/guru.js)) — tidak ada pembatalan di tahap peringatan.
- **Severity:** LOW

### Kode Kelas

- **Status:** PARTIAL
- **Gap:** `classroom_code` hanya teks ([guru.js:200](../guru/js/guru.js)) — tidak bisa disalin, tidak ada QR, padahal ini kunci login siswa/ortu.
- **Severity:** LOW

### Undang Siswa

- **Status:** NOT IMPLEMENTED di dashboard; terimplementasi per siswa di halaman Kelola ([classroom.js:743-748](../guru/js/classroom.js)).
- **Severity:** LOW (sesuai desain ADR-002/ADR-003)
- **Catatan:** Base path `window.location.origin + '/kelasku'` **benar** — repo GitHub adalah `teguhalficahlin-del/kelasku` dan URL GitHub Pages memakai path `/kelasku`, jadi keduanya sudah konsisten. Jangan diganti.

### Reset Semester

- **Status:** BROKEN
- **Bug (CRITICAL):** EF `semester-reset` menghapus tabel yang sudah tidak ada — `assessment_items` (index.ts:74) dan `student_grades` (index.ts:78) di-DROP oleh [20260815000001:20-27](../supabase/migrations/20260815000001_penilaian-v2-schema.sql). Diverifikasi: `to_regclass` NULL untuk keduanya. Karena penghapusan berurutan tanpa transaksi, EF berhasil menghapus `attendance`, `student_notes`, dan `schedules` lebih dulu, lalu gagal — akun tertinggal setengah-reset dengan data hilang permanen.
- **Severity:** CRITICAL
- **Catatan:** Tombol ini **tidak dirender** selama fase semester `aktif` ([guru.js:817](../guru/js/guru.js)); fase persiapan mulai 15 Desember. Tenggat perbaikan: sebelum 15 Desember 2026.
- **Rekomendasi:** Perbaiki daftar tabel sesuai schema v2 dan bungkus seluruh penghapusan dalam satu RPC transaksional.

- **Gap:** Dialog konfirmasi ([guru.js:776](../guru/js/guru.js)) menjanjikan penghapusan penilaian dkk, tapi EF tidak menyentuh data pipeline Rancang Pembelajaran.
- **Severity:** MEDIUM

### Ringkasan Phase 1

CRITICAL 2 · HIGH 3 · MEDIUM 4 · LOW 6

**Risiko demo terbesar:** Tombol Hapus pada kelas uji dijamin gagal dengan pesan FK mentah. Berikutnya, kegagalan RPC trial apa pun membuat dashboard tampil kosong tanpa pesan.

---

## Phase 2 — Tab Kelola Siswa

### Daftar Siswa

- **Status:** WORKS
- **Bug:** Seleksi checkbox hilang saat pindah halaman — `renderPage` menulis ulang `listEl.innerHTML` ([classroom.js:120](../guru/js/classroom.js)). Dengan 35 siswa, guru harus mengulang alur generate 4 kali.
- **Severity:** MEDIUM
- **Rekomendasi:** Simpan seleksi di `Set` berbasis `roster.id` di luar fungsi render, pulihkan status `checked` di `renderPage`.

- **Bug:** `renderPage` `return` saat `currentRows.length === 0` ([classroom.js:42](../guru/js/classroom.js)) sebelum membersihkan `listEl`.
- **Severity:** LOW

### Tambah Siswa

- **Status:** PARTIAL
- **Bug:** Form manual tidak memvalidasi NIS ([classroom.js:257-278](../guru/js/classroom.js)), sedangkan upload menegakkan `/^\d+$/` ([classroom.js:316](../guru/js/classroom.js)). NIS ikut membentuk email/password akun.
- **Severity:** MEDIUM
- **Rekomendasi:** Samakan validasi dan tegakkan dengan `CHECK (nis ~ '^[0-9]+$')` di DB.

- **Bug:** Peringatan duplikat NIS ([classroom.js:410](../guru/js/classroom.js)) ditimpa pesan sukses ke elemen yang sama ([classroom.js:424](../guru/js/classroom.js)).
- **Severity:** LOW

- **Bug:** Upsert memperbarui `full_name` di roster ([classroom.js:414-416](../guru/js/classroom.js)) tapi tidak menyinkronkan `profiles.full_name` — nama lama tetap tampil di portal siswa/ortu, absensi, dan penilaian.
- **Severity:** MEDIUM

- **Gap:** Deteksi header CSV memakai heuristik tipe data ([classroom.js:301](../guru/js/classroom.js)).
- **Severity:** LOW

### Generate Akun

- **Status:** WORKS
- **Bug:** `generateSingleAccount` ([classroom.js:467](../guru/js/classroom.js)) dan `hapusAkun` ([classroom.js:493](../guru/js/classroom.js)) memanggil `res.json()` tanpa cek `res.ok`. Respons non-JSON membuat tombol tersangkut di "Generating..." tanpa pesan.
- **Severity:** MEDIUM

- **Bug (kosmetik):** Label gagal dikembalikan ke `'Generate Akun'` ([classroom.js:151](../guru/js/classroom.js)) padahal aslinya `'Generate'` ([classroom.js:83](../guru/js/classroom.js)).
- **Severity:** LOW

- **Gap:** EF `generate-akun` memverifikasi JWT, role GURU, dan kepemilikan classroom dengan benar ([generate-akun/index.ts:55-67](../supabase/functions/generate-akun/index.ts)) tapi tidak memeriksa `expires_at`.
- **Severity:** MEDIUM

### Hapus Siswa

- **Status:** WORKS
- **Catatan positif (terverifikasi):** Penghapusan siswa tidak terhalang FK. Semua constraint RESTRICT ke `profiles` hanya di kolom authoring guru (`created_by`, `confirmed_by_profile_id`, `adopted_by`, `selected_by`).
- **Bug:** `hapusTerpilih` membuang alasan kegagalan ([classroom.js:637](../guru/js/classroom.js)); guru hanya melihat "3 gagal".
- **Severity:** MEDIUM

- **Bug:** Tidak ada guard reentrancy — `generateTerpilih` dijaga `isGenerating` ([classroom.js:524](../guru/js/classroom.js)) tapi `hapusTerpilih` tidak, dan tombolnya sengaja di-`removeAttribute('disabled')` ([classroom.js:628](../guru/js/classroom.js)).
- **Severity:** MEDIUM

- **Bug:** EF `hapus-akun` menjalankan enam operasi destruktif tanpa transaksi. Kegagalan `deleteUser` di langkah 10 ([hapus-akun/index.ts:122](../supabase/functions/hapus-akun/index.ts)) meninggalkan akun ortu, catatan, dan sesi pembinaan yang sudah terhapus permanen.
- **Severity:** MEDIUM

- **Bug:** Baris roster dihapus berdasarkan `nis` yang dibaca sebelum `deleteUser` ([hapus-akun/index.ts:104-135](../supabase/functions/hapus-akun/index.ts)); bila lookup gagal, baris roster tertinggal dengan `profile_id` NULL.
- **Severity:** LOW

### Detail Siswa

- **Status:** NOT IMPLEMENTED — tidak ada tampilan detail per siswa di mana pun.
- **Severity:** MEDIUM

### Status Aktif/Nonaktif Siswa

- **Status:** NOT IMPLEMENTED — kolomnya tidak ada. Schema produksi `classroom_roster`: `id, classroom_id, teacher_id, full_name, nis, profile_id, created_at, nama_ortu`.
- **Severity:** MEDIUM
- **Rekomendasi:** Tambah `is_active boolean NOT NULL DEFAULT true`, saring roster dan panel absensi dengannya, sediakan aksi "Nonaktifkan".

- **Bug turunan (HIGH):** `api.getRosterForRuntime()` ([api.js:503-511](../guru/js/api.js)) memfilter `.eq('is_active', true)` pada `classroom_roster` — kolom yang tidak ada — dan meminta `profiles(nama)` padahal kolomnya `full_name`. Keduanya menghasilkan PostgREST 42703. Pemanggilnya menelan error dengan `catch (_) {}` ([classroom-rancang.js:5715-5716](../guru/js/classroom-rancang.js)) sehingga snapshot roster di layar Runtime selalu kosong. Detail dampak di Phase 5.
- **Severity:** HIGH

### Undang Siswa (share link + QR)

- **Status:** WORKS
- **Bug:** `window.open` dipanggil setelah `await generateQRCode(row)` ([classroom.js:165-170](../guru/js/classroom.js)); jeda async memutus rantai gestur sehingga popup blocker memblokirnya dan `win` bernilai `null`.
- **Severity:** MEDIUM

- **Gap (keamanan):** ADR-003 K1 mendefinisikan login siswa sebagai Kode Kelas + Nama + NIS, tapi faktor "Nama" tidak pernah diverifikasi — form mengumpulkannya ([siswa.js:31](../siswa/js/siswa.js)) lalu membuangnya; autentikasi sepenuhnya `email = nis.kode@sipmandiri.local`, `password = nis` ([siswa.js:43-47](../siswa/js/siswa.js)). Link berbagi sudah memuat kedua nilai itu sebagai query param dan mengisinya otomatis ([classroom.js:746](../guru/js/classroom.js), [siswa.js:20-23](../siswa/js/siswa.js)). Satu link yang diteruskan = akses penuh sebagai siswa itu, sekali klik.
- **Severity:** HIGH
- **Rekomendasi:** Tegakkan pencocokan nama lewat `fn_lookup_roster` sebelum `signInWithPassword`; pertimbangkan menghentikan prefill `nis` di URL. Keputusan akhir menyangkut trade-off friksi yang disengaja di ADR-003.

### Ringkasan Phase 2

CRITICAL 0 · HIGH 2 · MEDIUM 9 · LOW 5

**Risiko demo terbesar:** Seleksi checkbox yang hilang antar-halaman membuat demo "Generate Terpilih" tampak hanya memproses sebagian siswa. Di belakang layar `getRosterForRuntime` sudah pasti gagal dan errornya dibisukan.

---

## Phase 3 — Tab Jadwal & Absensi

### Jadwal Tampil

- **Status:** WORKS
- **Bug (keamanan, HIGH):** `fn_check_schedule_conflict` adalah SECURITY DEFINER yang menerima `p_teacher_id` dari pemanggil dan tidak pernah membandingkannya dengan `fn_current_profile_id()` ([20260805000001:29-45](../supabase/migrations/20260805000001_schedules-jadwal.sql)). Di-`GRANT` ke `authenticated`, sehingga user mana pun bisa mengoper UUID guru lain dan memanen nama classroom beserta jam mengajarnya — menembus RLS `schedules` dan `classrooms`. Melanggar CLAUDE.md §11.
- **Rekomendasi:** Buang parameter `p_teacher_id`, pakai `fn_current_profile_id()` di dalam body. Sesuaikan pemanggil di [classroom-schedule.js:225](../guru/js/classroom-schedule.js) dan [guru.js:563](../guru/js/guru.js).

- **Bug:** Parameter `p_classroom_id` diterima tapi tidak dipakai ([20260805000001:39-44](../supabase/migrations/20260805000001_schedules-jadwal.sql)).
- **Severity:** LOW

- **Bug:** Edit jadwal mengubah hari/jam tanpa memeriksa absensi yang menempel padanya ([classroom-schedule.js:252-259](../guru/js/classroom-schedule.js)). Hapus jadwal punya peringatan lengkap; edit tidak.
- **Severity:** MEDIUM

- **Bug:** Dialog hapus menyebut "`${count}` sesi absensi" ([classroom-schedule.js:363](../guru/js/classroom-schedule.js)) padahal `count` adalah jumlah baris per-siswa.
- **Severity:** MEDIUM

- **Bug:** `toggleActive` dan `delSchedule` tidak memverifikasi baris terpengaruh ([classroom-schedule.js:341](../guru/js/classroom-schedule.js), [:372](../guru/js/classroom-schedule.js)).
- **Severity:** LOW

- **Catatan positif:** Validasi bentrok ditegakkan server-side, dialog nonaktif mewajibkan alasan, dan sinkronisasi lintas-panel lewat `CustomEvent('schedule-changed')` ([classroom-schedule.js:270](../guru/js/classroom-schedule.js)) bekerja rapi.

### Input Absensi

- **Status:** PARTIAL
- **Bug (HIGH):** Absensi hanya bisa diisi selama jam pelajaran berlangsung — `done = status !== 'AKTIF'` ([classroom-attendance.js:222](../guru/js/classroom-attendance.js)) — dan tidak ada pemilih tanggal; `renderAbsensi` selalu memakai `todayStr()` ([classroom-attendance.js:343](../guru/js/classroom-attendance.js)). Guru yang lupa mengisi tidak punya jalan apa pun untuk mengisi atau mengoreksi absensi kemarin.
- **Rekomendasi:** Tambahkan pemilih tanggal dan izinkan pengisian mundur dalam jendela tertentu, atau sediakan mode koreksi yang tercatat.

- **Bug (HIGH):** Saat sesi beralih AKTIF → SELESAI di tengah pengisian, `disableSessionBlock` mengganti baris tombol Simpan dengan paragraf teks ([classroom-attendance.js:376-382](../guru/js/classroom-attendance.js)) — perubahan yang belum tersimpan tetap terlihat tapi tidak bisa disimpan.
- **Rekomendasi:** Pertahankan tombol Simpan selama masa tenggang, atau peringatkan sebelum menonaktifkan.

- **Bug (HIGH):** Panel absensi hanya memuat siswa yang sudah punya akun — `.not('profile_id', 'is', null)` ([classroom-attendance.js:114](../guru/js/classroom-attendance.js)). Pesan "Belum ada siswa aktif di classroom ini" ([classroom-attendance.js:274](../guru/js/classroom-attendance.js)) tidak menjelaskan penyebabnya.
- **Rekomendasi:** Ubah pesan kosong menjadi eksplisit dengan tautan aksi ke tab Kelola Siswa.

- **Bug:** Setiap siswa default berstatus `'HADIR'` ([classroom-attendance.js:230](../guru/js/classroom-attendance.js)); Simpan tanpa menyentuh apa pun mencatat seluruh kelas hadir.
- **Severity:** MEDIUM

- **Bug:** `loadTodaySchedules` ([:99](../guru/js/classroom-attendance.js)), `loadRoster` ([:110](../guru/js/classroom-attendance.js)), dan `loadRekapData` ([:419](../guru/js/classroom-attendance.js)) membuang objek `error` dan mengembalikan array kosong.
- **Severity:** MEDIUM

- **Catatan positif:** Penanganan pergantian hari ([:391](../guru/js/classroom-attendance.js)), pembersihan interval ([:742](../guru/js/classroom-attendance.js)), dan `beforeunload` ([:759](../guru/js/classroom-attendance.js)) sudah benar. Upsert memakai `onConflict` yang persis cocok dengan constraint unik.

### Rekap Absensi

- **Status:** PARTIAL
- **Bug:** `buildRekapPerSiswa` memulai dari seluruh roster, bukan dari data absensi ([classroom-attendance.js:437-441](../guru/js/classroom-attendance.js)). `perSiswa` tidak pernah kosong, sehingga empty-state ([:496](../guru/js/classroom-attendance.js)) dan guard export ([:724](../guru/js/classroom-attendance.js)) mati total. Rentang tanpa absensi merender daftar `0H · 0S · 0I · 0A · 0%` yang terbaca seperti "semua alpa".
- **Severity:** MEDIUM

- **Bug:** Mengubah tanggal saat rekap tampil tidak memicu refresh; `refreshRekap` hanya terpanggil dari transisi tombol ([classroom-attendance.js:698-714](../guru/js/classroom-attendance.js)).
- **Severity:** MEDIUM

- **Bug:** Notifikasi "Data lebih dari 10 entri" muncul saat `sessions.length >= 10` ([classroom-attendance.js:517](../guru/js/classroom-attendance.js)) padahal 10 entri ditampilkan seluruhnya.
- **Severity:** LOW

- **Bug:** Baris detail rekap hanya menampilkan tanggal dan status ([classroom-attendance.js:510-516](../guru/js/classroom-attendance.js)); dua sesi di hari sama tampak duplikat.
- **Severity:** LOW

- **Catatan positif:** `buildRekapSummary` menghitung total sesi dengan benar lewat `Set` dari `tanggal__schedule_id` ([:431](../guru/js/classroom-attendance.js)) — pola inilah yang seharusnya dipakai di dialog hapus jadwal dan hapus kelas.

### Filter

- **Status:** PARTIAL
- **Gap:** `getPresetRange` mendukung `minggu`/`bulan`/`semester` ([classroom-attendance.js:72-93](../guru/js/classroom-attendance.js)) tapi tidak ada tombol preset di UI; fungsinya hanya terpakai untuk nilai awal.
- **Severity:** LOW

### Ringkasan Phase 3

CRITICAL 0 · HIGH 4 · MEDIUM 6 · LOW 5

**Risiko demo terbesar:** Tab ini tidak bisa didemokan apa adanya — 0 jadwal dan 0 siswa berakun berarti dua panel berturut-turut hanya menampilkan pesan kosong.

---

## Phase 4 — Tab Catatan & Penilaian

### Temuan lintas-fitur: dua konvensi "student id"

| Fitur | Arti `student_id` | Sumber |
|---|---|---|
| Absensi, Catatan | `profiles.id` | `classroom_roster.profile_id` |
| Penilaian, Rekap Nilai, Grup | `classroom_roster.id` | baris roster itu sendiri |

FK produksi mengonfirmasi `assessment_results_student_id_fkey`, `grade_recap_student_id_fkey`, dan `student_groups_student_id_fkey` menunjuk **`classroom_roster`** — bukan `profiles` seperti tertulis di [20260815000001:121](../supabase/migrations/20260815000001_penilaian-v2-schema.sql). File migrationnya tidak lagi mencerminkan schema hidup.

- **Severity:** MEDIUM (drift migration)
- **Rekomendasi:** Telusuri perubahan FK tersebut dan tulis migration penyelaras agar `supabase db push` di lingkungan baru menghasilkan schema yang sama.

### Tambah Catatan Siswa

- **Status:** BROKEN untuk kondisi data saat ini
- **Bug (HIGH):** Dropdown "Pilih siswa" hanya diisi siswa yang sudah punya akun ([classroom-notes.js:37](../guru/js/classroom-notes.js)). Pada kelas uji 0 dari 35 memenuhi syarat, jadi setiap percobaan simpan berhenti di "Pilih siswa terlebih dahulu." ([classroom-notes.js:212](../guru/js/classroom-notes.js)) tanpa petunjuk penyebab.
- **Rekomendasi:** Jangka pendek, pesan eksplisit saat roster hasil filter kosong. Jangka panjang, pindahkan `student_notes.student_id` ke `classroom_roster.id` seperti tabel penilaian.

- **Bug:** `loadRoster` membuang `error` dan `return` ([classroom-notes.js:39](../guru/js/classroom-notes.js)).
- **Severity:** MEDIUM

### Lihat Catatan

- **Status:** WORKS
- **Bug:** Label "Ke Siswa saja"/"Ke Ortu saja" ([classroom-notes.js:399-400](../guru/js/classroom-notes.js)) tapi logikanya inklusif ([classroom-notes.js:150-151](../guru/js/classroom-notes.js)).
- **Severity:** LOW

- **Bug:** Export Excel memakai `_notes` mentah ([classroom-notes.js:475-478](../guru/js/classroom-notes.js)), mengabaikan filter aktif.
- **Severity:** LOW

- **Gap:** Riwayat catatan tanpa paginasi ([classroom-notes.js:162](../guru/js/classroom-notes.js)).
- **Severity:** LOW

- **Bug:** `updateNote`/`deleteNote` tanpa verifikasi baris ([classroom-notes.js:78-92](../guru/js/classroom-notes.js)).
- **Severity:** LOW

### Sesi Pembinaan

- **Status:** NOT IMPLEMENTED — tabel `guidance_sessions` ada dan dibersihkan oleh EF `hapus-akun` ([hapus-akun/index.ts:101](../supabase/functions/hapus-akun/index.ts)), tapi tidak ada satu pun referensi di JS maupun HTML portal guru.
- **Severity:** MEDIUM

### Tambah Penilaian

- **Status:** WORKS
- **Koreksi:** Dugaan awal bahwa penyimpanan nilai gagal karena mismatch FK **terbantahkan** oleh data produksi — 14 baris `assessment_results` ada dan seluruhnya cocok dengan `classroom_roster.id` (0 cocok dengan `profiles.id`). Yang keliru file migrationnya, bukan kodenya.

- **Bug (HIGH):** Penyimpanan hasil per siswa dibungkus `try { … } catch {}` **kosong** di empat tempat ([classroom-assessment.js:1233](../guru/js/classroom-assessment.js), `:1246`, `:2408`, `:2421`). Kegagalan apa pun ditelan tanpa jejak dan UI tetap melaporkan sukses — nilai satu kelas bisa hilang tanpa ada yang tahu.
- **Rekomendasi:** Kumpulkan kegagalan per siswa dan tolak menampilkan status sukses bila ada yang gagal, mengikuti pola `gagalNama` di [classroom.js:570](../guru/js/classroom.js).

- **Bug:** `loadAll` memasang `.catch(() => [])` pada tiga query ([classroom-assessment.js:208-210](../guru/js/classroom-assessment.js)); kegagalan memuat TP/KKTP tampil identik dengan "belum ada TP" dan berisiko duplikat.
- **Severity:** MEDIUM

### Rekap Nilai

- **Status:** PARTIAL
- **Bug (HIGH):** Siswa dan orang tua tidak akan pernah bisa melihat nilai mereka. Policy hidup `ar_siswa_select` dan `gr_siswa_select` mensyaratkan `student_id = fn_current_profile_id()`, sedangkan `student_id` berisi id baris `classroom_roster` — dua ruang UUID berbeda. Policy ortu (`ar_ortu_select`, `gr_ortu_select`) membandingkan `cm.linked_student_id` yang juga id profil. Terverifikasi dari `pg_policies`. 35 baris `grade_recap` efektif tak terlihat oleh pemiliknya.
- **Rekomendasi:** Perbaiki keempat policy agar menerjemahkan id lebih dulu, mis. `student_id IN (SELECT id FROM classroom_roster WHERE profile_id = fn_current_profile_id())`, dibungkus fungsi SECURITY DEFINER sesuai CLAUDE.md §11.
- **Catatan:** CLAUDE.md §12 mencatat "Portal siswa + ortu: section Nilai" sebagai selesai — perlu diverifikasi ulang saat portal siswa/ortu diaudit.

- **Bug:** `_getFilteredSumatifs` membuang senyap sumatif tanpa `tp_kktp_id` ([classroom-assessment.js:2637](../guru/js/classroom-assessment.js)); guru hanya melihat "Belum ada penilaian Sumatif untuk filter yang dipilih".
- **Severity:** MEDIUM

- **Gap:** Bobot rekap direset ke nol setiap daftar sumatif berubah ([classroom-assessment.js:2624](../guru/js/classroom-assessment.js)) dan tidak pernah disimpan ke DB.
- **Severity:** MEDIUM

### Ringkasan Phase 4

CRITICAL 0 · HIGH 3 · MEDIUM 5 · LOW 4

**Risiko demo terbesar:** Tab Catatan tidak bisa dipakai sama sekali pada kelas uji. Tab Penilaian aman didemokan dari sisi guru — asalkan demo tidak berlanjut ke portal siswa/ortu.

---

## Phase 5 — Tab Rancang Pembelajaran

### Kerangka navigasi

- **Bug:** `isStepNavigable(6)` menyatakan step 6 bisa diklik bila `_planningContext?.id && _phase2cState` ada ([classroom-rancang.js:175](../guru/js/classroom-rancang.js)), tapi `navigateToStep(6)` mensyaratkan `_rencana` — variabel pipeline legacy — dan bila kosong memundurkan guru ke step 5 tanpa pesan ([classroom-rancang.js:203](../guru/js/classroom-rancang.js)).
- **Severity:** MEDIUM
- **Rekomendasi:** Bila `_planningContext?.id` ada, panggil `enterPhase2CPipeline()`; sisakan cabang `_rencana` sebagai fallback legacy.

- **Bug:** `resetAll` tidak menyentuh `_phase2cState` maupun op-id regenerate ([classroom-rancang.js:5538-5548](../guru/js/classroom-rancang.js)).
- **Severity:** MEDIUM

- **Gap:** `window.classifySipApiError` ([api.js:8](../guru/js/api.js)) tidak dipanggil satu kali pun di seluruh basis kode; setiap kegagalan pipeline menampilkan pesan mentah server ke guru.
- **Severity:** MEDIUM

### Step 1 — Konteks

- **Status:** WORKS. Entry guard benar (titik awal), percabangan ke Step 2/3 benar ([classroom-rancang.js:1966-1967](../guru/js/classroom-rancang.js)), dan saat resume `_profil.is_locked` menjadi otoritas ([classroom-rancang.js:5962-5968](../guru/js/classroom-rancang.js)).

### Step 2 — SMK

- **Status:** WORKS. Guard dua lapis ([classroom-rancang.js:224](../guru/js/classroom-rancang.js)); `_ans.smk` di-null-kan eksplisit untuk jenjang non-SMK ([:1967](../guru/js/classroom-rancang.js)).

### Step 3 — Preferensi

- **Status:** WORKS. `if (!_ans.mapel) return` ([:190](../guru/js/classroom-rancang.js)), `saveRpState` di setiap transisi.

### Step 4 — ATP

- **Status:** WORKS. Penanganan persistensi paling teliti: `_step = (serverDurableAtp && step > 4 && !_ans.tp_terpilih) ? 4 : step` ([classroom-rancang.js:5637](../guru/js/classroom-rancang.js)) mencegah guru mendarat di step lanjutan dengan TP hantu.

### Step 5 — Konteks kelas & alokasi

- **Status:** WORKS. `if (!_ans.tp_terpilih) return` ([:198](../guru/js/classroom-rancang.js)); payload `set_jp_policy` benar ([:2763-2766](../guru/js/classroom-rancang.js)).

### Step 6 — Pipeline Output

- **Entry guard:** `requireContexts()` memeriksa kedua context id sebelum setiap pipeline entry, lengkap dengan log diagnostik ([classroom-rancang.js:125-137](../guru/js/classroom-rancang.js)). Setiap entry punya flag reentrancy dengan `try/finally`.
- **Persistensi:** `renderStep6Phase2C` menandai state localStorage `_stale` dan memaksa refresh server ([:2836-2837](../guru/js/classroom-rancang.js)); resume punya cabang khusus agar Follow-Up yang sudah ada tidak memicu generate ulang (409).

- **Bug (HIGH):** Tombol "Regenerate Material" dipastikan selalu gagal. `runRegenerateMaterial` membuat `_matRegenOpId = crypto.randomUUID()` tapi UUID itu tidak pernah dimasukkan ke payload ([classroom-rancang.js:3506-3510](../guru/js/classroom-rancang.js)), sementara EF menolak regenerate tanpa `client_operation_id` valid dengan HTTP 400 ([phase2-material/index.ts:386-388](../supabase/functions/phase2-material/index.ts)). Jalur lain sudah benar: Context ([:3061](../guru/js/classroom-rancang.js)), Assessment ([:3331](../guru/js/classroom-rancang.js)), Meeting ([:4482](../guru/js/classroom-rancang.js)), Follow-Up ([:3915](../guru/js/classroom-rancang.js)).
- **Rekomendasi:** `phase2cPayloadMat({ action: 'regenerate_material_spec', client_operation_id: _matRegenOpId })`. Perbaikan satu baris.

- **Bug:** Kegagalan memuat konteks durable saat boot hanya `console.warn` ([classroom-rancang.js:5996](../guru/js/classroom-rancang.js)); guru mendarat di step awal seolah belum pernah merencanakan apa pun — berisiko membuat planning context duplikat. `catch (_)` di lapisan luar ([:6007-6010](../guru/js/classroom-rancang.js)) juga mereset `_profil`/`_settings`/`_dokumen` diam-diam.
- **Severity:** MEDIUM

### Step 7 — Dokumen Hub

- **Status:** WORKS
- **Gap:** `navigateToStep(7)` tidak memeriksa apa pun ([:206-207](../guru/js/classroom-rancang.js)) meski `isStepNavigable(7)` mensyaratkan `rpm_ready_for_class`. Aman dalam praktik karena dot hanya bisa diklik saat berkelas `--nav`, dan `renderStep7` punya fallback legacy ([:4782-4786](../guru/js/classroom-rancang.js)).
- **Severity:** LOW
- **Catatan:** `saveRpState()` di awal `renderStep7` ([:4779](../guru/js/classroom-rancang.js)) mencegah refresh memantul ke Step 6 — sudah diperbaiki di commit `5c2bf60`.

### Step 8 — Runtime

- **Status:** PARTIAL
- **Bug (HIGH):** Snapshot roster untuk layar Runtime selalu kosong. `getRosterForRuntime` memfilter kolom `is_active` yang tidak ada dan meminta embed `profiles(nama)` yang salah nama kolom ([api.js:503-511](../guru/js/api.js)); errornya dibisukan `catch (_) {}` ([classroom-rancang.js:5714-5716](../guru/js/classroom-rancang.js)).

  `rosterSnapshot` ikut dikompilasi ke RuntimePackage ([runtime-compiler.js:246](../guru/js/runtime-compiler.js)) dan menjadi sumber grid pemilih siswa saat mengajar ([runtime-ui.js:731-742](../guru/js/runtime-ui.js)). Guru membuka layar Runtime dengan grid kosong — tidak bisa menandai partisipasi maupun observasi siapa pun.

  **Lapisan tambahan:** paket terkompilasi disimpan di IndexedDB dan hanya dianggap basi bila hash konten rencana pertemuan berubah ([classroom-rancang.js:5700-5704](../guru/js/classroom-rancang.js)) — roster tidak ikut dihitung. Memperbaiki query saja **tidak cukup**.
- **Rekomendasi:**
  1. Ambil nama langsung dari roster: `.select('id, full_name')` — **bukan** embed `profiles(full_name)`, karena 35 baris roster kelas uji punya `profile_id` NULL sehingga embed menghasilkan nama kosong.
  2. Masukkan roster ke perhitungan `sourceHash` atau naikkan versi paket agar cache lama tergantikan.
  3. Ganti `catch (_) {}` dengan penanganan yang menampilkan peringatan.

- **Bug:** "Siapkan semua pertemuan" hanya mencatat alasan kegagalan ke `console.warn` ([classroom-rancang.js:5921](../guru/js/classroom-rancang.js)) dan meminta guru "Cek konsol untuk detail" ([:5932](../guru/js/classroom-rancang.js)).
- **Severity:** LOW

- **Catatan positif:** Tombol "Mulai" menangani paket yang belum disiapkan dengan mengompilasinya lebih dulu ([:5896-5900](../guru/js/classroom-rancang.js)).

### Ringkasan Phase 5

CRITICAL 0 · HIGH 2 · MEDIUM 5 · LOW 2

**Penilaian umum:** Modul dengan disiplin rekayasa tertinggi di proyek ini. Entry guard konsisten lewat `requireContexts`, flag reentrancy dengan `try/finally`, server selalu otoritas dan localStorage hanya cache, penanganan kuota localStorage punya jalur mundur. Temuan yang tersisa sempit dan spesifik, bukan cacat struktural.

**Risiko demo terbesar:** Grid siswa kosong di layar Runtime — kegagalan senyap tanpa pesan error. Tombol Regenerate Material menampilkan pesan teknis mentah bila ditekan.

---

## Ringkasan Seluruh Audit

| Fase | CRITICAL | HIGH | MEDIUM | LOW |
|---|---|---|---|---|
| 1 — Dashboard & Kelas | 2 | 3 | 4 | 6 |
| 2 — Kelola Siswa | 0 | 2 | 9 | 5 |
| 3 — Jadwal & Absensi | 0 | 4 | 6 | 5 |
| 4 — Catatan & Penilaian | 0 | 3 | 5 | 4 |
| 5 — Rancang Pembelajaran | 0 | 2 | 5 | 2 |
| **Total** | **2** | **14** | **29** | **22** |

Angka di atas adalah hitungan manual dari kelima laporan fase — berguna untuk membandingkan bobot antar-fase, bukan angka presisi.

### Lima hal yang paling menentukan kesiapan demo

1. **Hapus Kelas gagal total** pada kelas uji — FK RESTRICT dari 8 artifact (CRITICAL, Phase 1)
2. **35 siswa tanpa akun** melumpuhkan Absensi dan Catatan sekaligus, dengan pesan kosong yang tidak menjelaskan sebabnya (HIGH, Phase 2–4)
3. **Roster Runtime kosong** dan errornya dibisukan (HIGH, Phase 5)
4. **Nilai tidak akan pernah terlihat oleh siswa/ortu** karena RLS membandingkan dua ruang UUID berbeda (HIGH, Phase 4)
5. **Reset Semester merusak data separuh jalan** — belum aktif sampai 15 Desember (CRITICAL, Phase 1)

### Prioritas sebelum demo

| # | Tindakan | Biaya |
|---|---|---|
| 1 | Regenerate Material — tambah `client_operation_id` ke payload | 1 baris |
| 2 | `getRosterForRuntime` — `.select('id, full_name')` dari roster + invalidasi cache paket | 2 baris + invalidasi |
| 3 | Generate akun siswa + tambah jadwal di kelas uji | tindakan data, bukan kode |

Item 3 menghidupkan Absensi, Catatan, dan Runtime sekaligus. Perbaikan pesan kosong turun ke backlog bila item 3 dikerjakan.

### Hindari saat demo

- Tombol **Hapus Kelas** pada kelas uji — dijamin gagal dengan pesan FK mentah.

(Tombol **Reset Semester** tidak dirender selama fase semester `aktif`, jadi tidak bisa tersentuh saat demo. Tenggat perbaikannya sebelum 15 Desember 2026.)

### Backlog pasca-demo (seluruh HIGH yang belum tertangani)

- Dashboard blank total saat RPC trial gagal (Phase 1)
- Batasan trial dan jumlah kelas tanpa gate server-side (Phase 1)
- Angka salah di dialog konfirmasi Hapus Kelas (Phase 1)
- Faktor "Nama" pada login siswa tidak ditegakkan (Phase 2)
- `fn_check_schedule_conflict` membocorkan jadwal guru lain (Phase 3)
- Absensi tidak bisa diisi/dikoreksi di luar jam sesi (Phase 3)
- Input absensi belum tersimpan hilang saat sesi berakhir (Phase 3)
- Panel absensi kosong untuk siswa tanpa akun tanpa penjelasan (Phase 3)
- Dropdown catatan kosong untuk siswa tanpa akun (Phase 4)
- Kegagalan simpan nilai ditelan `catch {}` kosong di 4 tempat (Phase 4)
- RLS penilaian membuat nilai tak pernah terlihat siswa/ortu (Phase 4)
- Regenerate Material selalu 400 (Phase 5)
- Roster Runtime kosong dan bertahan dari cache (Phase 5)

Ditambah 29 MEDIUM dan 22 LOW yang terperinci di masing-masing fase.
