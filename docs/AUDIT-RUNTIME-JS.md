# Audit Runtime JS — Statis

**Tanggal:** 2026-08-19
**File yang diaudit:**
- `guru/js/runtime-compiler.js`
- `guru/js/runtime-db.js`
- `guru/js/runtime-session.js`
- `guru/js/runtime-sync.js`

**Mode:** ZERO perubahan kode, ZERO commit, ZERO push.

---

## KATEGORI 1 — EDGE CASES YANG TIDAK DITANGANI

---

### 1a. compileRuntimePackage — phase tanpa activities

**Fungsi:** `compileRuntimePackage` (`runtime-compiler.js:170`)

**Skenario:** Meeting plan memiliki activities, tetapi tidak ada satu pun activity dengan `phase === 'reflect'`. Misalnya, guru atau AI generator melewati fase refleksi karena durasi terlalu pendek.

**Perilaku saat ini:** `compileRuntimeSteps` tidak memvalidasi kehadiran per-phase — ia hanya memetakan activities yang ada. Validasi phase baru terjadi di blok akhir (`compiler.js:214–219`) setelah SHA-256 dihitung. Hasilnya: fungsi melempar error `[compiler] phase 'reflect' tidak ada di steps pertemuan N` — yang berarti error **memang sampai ke pemanggil**, tapi baru setelah komputasi hash yang relatif mahal.

**Risiko:** Error sudah tertangani dan UI akan menerima rejection. Namun pesan errornya teknikal ("phase 'reflect' tidak ada") — guru tidak tahu apakah ini bug data atau bug sistem. Tidak ada cara membedakan artifact yang memang kosong vs. artifact yang corrupt.

**Rekomendasi:** Pindahkan validasi per-phase ke dalam `compileRuntimeSteps` (sebelum hash) dan sertakan hint human-readable: *"Pertemuan N tidak memiliki aktivitas fase Refleksi — mohon periksa isi rancangan."*

---

### 1b. openRuntimeDb — tidak ada `onblocked` handler

**Fungsi:** `openRuntimeDb` (`runtime-db.js:15`)

**Skenario:** Guru membuka dua tab browser secara bersamaan. Tab A sudah membuka DB versi 2. Di masa depan, setelah upgrade kode ke DB versi 3, Tab B mencoba membuka versi 3 tetapi Tab A masih memegang koneksi versi 2 — IDB akan menembak event `blocked` pada request Tab B.

**Perilaku saat ini:** Tidak ada `req.onblocked` handler di `openRuntimeDb`. Request Tab B akan **menggantung selamanya** — promise tidak resolve, tidak reject. UI Tab B akan freeze (tidak ada timeout atau fallback). Untuk versi IDB yang sama (keduanya v2), skenario ini tidak terjadi hari ini.

**Risiko:** Saat `DB_VERSION` dinaikkan ke 3 (sudah ada migration v1→v2 di kode), guru yang membuka dua tab akan mengalami tab kedua yang freeze permanen tanpa pesan error.

**Rekomendasi:** Tambahkan `req.onblocked = () => reject(new Error('[runtime-db] IDB upgrade blocked — tutup tab lain'))` di `openRuntimeDb`.

---

### 1c. startSession — QuotaExceededError ditelan oleh repository

**Fungsi:** `startSession` (`runtime-session.js:42`) → `SessionRepository.create` (`runtime-db.js:185`)

**Skenario:** Storage perangkat guru penuh (mis. setelah banyak sesi offline). IDB melempar `QuotaExceededError` saat `txVoid` mencoba menulis session ke store.

**Perilaku saat ini:** `SessionRepository.create` memiliki `try/catch` yang menangkap semua error dan hanya melakukan `console.warn` — **tidak re-throw**. Akibatnya `startSession` tidak tahu bahwa write gagal, tetap mengembalikan `session` object seakan berhasil. UI menerima session ID yang tidak ada di IDB. Semua panggilan berikutnya (`advanceStep`, `appendEvent`) juga silent fail dengan pola yang sama.

**Risiko:** Guru merasa sesi berjalan normal, tetapi **tidak ada data yang tersimpan** — semua observasi, langkah, dan status kelas hilang tanpa peringatan.

**Rekomendasi:** Repository-level repositories (`create`, `append`, `upsert`) harus re-throw error untuk jenis `QuotaExceededError`; `startSession` perlu menangkap dan memunculkannya ke UI.

---

### 1d. syncPending — events yatim piatu tidak pernah sync

**Fungsi:** `syncPending` (`runtime-sync.js:38`)

**Skenario:** Guru membuka site di tab baru, lalu melakukan *Clear Site Data* parsial yang menghapus IDB tetapi tidak menghapus cache service worker — atau sebaliknya. Session record terhapus dari IDB, tetapi events (yang disimpan di store berbeda) masih ada.

**Perilaku saat ini:** Loop di `syncPending` (baris 60–64) melakukan `sessions.get(sessionId)` — jika null, **skip dengan `continue`** dan tidak melakukan apa-apa. Events tersebut tetap berstatus `pending` selamanya karena tidak pernah di-mark `synced` atau `failed`.

**Risiko:** Event terakumulasi, `getPending()` terus mengembalikannya di setiap sync attempt, sync berjalan lebih lambat, dan data **tidak pernah sampai ke server** tanpa ada notifikasi ke guru.

**Rekomendasi:** Jika session tidak ditemukan setelah 3 sync attempt, tandai events terkait sebagai `orphaned` (bukan `failed`) dan log ke UI agar guru bisa melaporkan.

---

### 1e. cleanupLocal — listStale() throw tidak mempengaruhi syncPending

**Fungsi:** `cleanupLocal` (`runtime-sync.js:131`)

**Skenario:** IDB mengalami error transient saat `listStale()` dipanggil bersamaan dengan `syncPending` yang sedang berjalan dari `online` event.

**Perilaku saat ini:** `PackageRepository.listStale` memiliki `catch` internal yang mengembalikan `[]` (tidak throw). Sehingga `cleanupLocal` selalu selesai dengan `{ deleted_package_count: 0 }` meski IDB error. Karena `cleanupLocal` dan `syncPending` adalah panggilan independen (tidak ada shared lock), error di satu tidak mempengaruhi yang lain.

**Risiko:** Rendah — skenario ini aman. Satu-satunya efek samping adalah stale packages tidak terhapus jika IDB sedang sibuk, yang merupakan perilaku konservatif yang benar.

**Rekomendasi:** Tidak ada perubahan diperlukan; perilaku saat ini sudah defensif.

---

### 1f. recordObservation — targets kosong berjalan 0 iterasi

**Fungsi:** `recordObservation` (`runtime-session.js:209`)

**Skenario:** Guru membuka panel observasi siswa tetapi belum memilih siswa manapun (misalnya salah tap di area kosong), lalu `recordObservation` dipanggil dengan `targets = []`.

**Perilaku saat ini:** Loop `for (const target of targets)` berjalan 0 kali — tidak ada error, tidak ada event ditulis, fungsi return `undefined`. Tidak ada guard atau feedback ke pemanggil.

**Risiko:** Tidak ada data loss, tetapi jika UI tidak memvalidasi `targets.length > 0` sebelum memanggil fungsi ini, guru bisa mengira observasi berhasil dicatat padahal tidak. Risiko bergantung sepenuhnya pada validasi di layer UI (`runtime-ui.js`).

**Rekomendasi:** Tambahkan early return dengan log: `if (!targets?.length) { console.warn('[session] recordObservation dipanggil tanpa targets'); return; }` — tidak perlu throw, tapi perlu eksplisit.

---

## KATEGORI 2 — RACE CONDITIONS

---

### 2a. advanceStep + skipStep — tidak ada operation lock

**Trigger:** Guru melakukan swipe ke kiri (skip) dan tap tombol "Lanjut" (advance) hampir bersamaan — misalnya saat mengakhiri step terakhir dalam satu gerakan cepat.

**Fungsi yang overlap:** `advanceStep` dan `skipStep` (`runtime-session.js:85,117`)

**Risiko:** Kedua fungsi membaca `session.navigation_position` dari argumen `session` yang sama (snapshot lama), keduanya mark step yang sama sebagai `completed` dan `skipped`, lalu keduanya mencari next step dari state yang sama. Hasilnya: dua events bertentangan (`step_completed` + `step_skipped`) untuk step yang sama, dan navigation bisa melompat dua posisi (karena kedua calls advance dari `curId` ke step N+1, yang sudah di-advance lagi oleh call pertama ke N+2). Data di IDB menjadi inconsistent.

**Rekomendasi:** Tambahkan operation lock level-session di `startSession` — sebuah `Map<sessionId, boolean>` yang di-set `true` saat `advanceStep`/`skipStep` sedang berjalan dan di-release saat selesai; panggilan concurrent langsung return early.

---

### 2b. startSession — dua tap cepat sebelum IDB write selesai

**Trigger:** Guru men-tap tombol "MULAI SESI" dua kali cepat sebelum IDB write pertama selesai (misalnya tap-double karena layar lambat merespons).

**Fungsi yang overlap:** `startSession` (`runtime-session.js:42`) dua kali

**Risiko:** Kedua calls memanggil `rdb.sessions.getActive()` sebelum call pertama menulis session baru — keduanya mendapat `null`. Kedua calls membuat `session_id` baru via `crypto.randomUUID()`, lalu keduanya menulis ke IDB (dua record berbeda). UI menerima session A dari call pertama, tapi IDB juga mengandung session B. Event-event berikutnya ditulis ke session A; session B adalah ghost yang tidak pernah sync. Di sync berikutnya, session B muncul sebagai orphaned session di server.

**Rekomendasi:** Tambahkan module-level flag `_startingSession = false` yang di-set saat `startSession` mulai berjalan dan di-clear saat selesai; panggilan concurrent menunggu atau mengembalikan existing session.

---

### 2c. syncPending — online event flapping

**Trigger:** Koneksi naik-turun cepat (flapping), `window.addEventListener('online', ...)` fire dua kali dalam < 2 detik.

**Fungsi yang overlap:** `_onOnline` → dua `setTimeout(..., 2000)` → dua `syncPending()` hampir bersamaan.

**Risiko:** Saat kedua timer fire, call pertama set `_syncing = true`; call kedua melihat `_syncing === true` dan langsung return `{ synced: 0 }`. **Guard `_syncing` sudah cukup** untuk skenario ini.

**Rekomendasi:** Guard sudah benar. Namun pertimbangkan membatalkan timer sebelumnya dengan `clearTimeout` saat `_onOnline` dipanggil lagi — saat ini dua timer aktif secara bersamaan meski hanya satu yang dieksekusi efektif.

---

### 2d. cleanupLocal + syncPending — package dihapus saat sync berjalan

**Trigger:** Guru membuka app setelah beberapa hari offline; `cleanupLocal` dan `syncPending` dipanggil hampir bersamaan (misalnya dari dua titik berbeda di init flow).

**Fungsi yang overlap:** `cleanupLocal` dan `syncPending` (`runtime-sync.js:131,38`)

**Risiko:** Window race ada: `syncPending` mengambil pending events → marks synced → `cleanupLocal` mengambil pending events (sudah kosong) → `cleanupLocal` menganggap package tidak punya pending events → **menghapus package yang baru saja selesai sync**. Efek: jika guru langsung membuka sesi berikutnya, package sudah tidak ada di IDB — harus di-compile ulang. Bukan data loss, tapi pengguna mengalami delay compile ulang yang tidak terduga.

**Rekomendasi:** Tambahkan pengecekan: jangan hapus package yang `compiled_at`-nya < 1 jam (bukan hanya `maxAgeMs`), atau tandai package dengan `last_used_at` yang diperbarui saat sync berhasil.

---

## KATEGORI 3 — DATA MINIMIZATION

---

### 3a. steps — field kosong selalu disertakan

**Field/Store:** `steps[]` dalam `RuntimePackage` (IDB store `packages`)

**Yang disimpan:** Setiap step menyertakan: `resource_refs: []`, `recovery_refs: []`, `differentiation_ref: null` — tiga field yang di-hardcode kosong oleh compiler (baris 28–31 `runtime-compiler.js`) dan **tidak pernah diisi atau dibaca saat runtime**.

**Yang sebenarnya dibutuhkan:** Tidak ada — field ini placeholder untuk fitur yang belum diimplementasikan.

**Overhead:** Kecil — tiga field kosong per step, diabaikan untuk ukuran saat ini.

**Rekomendasi:** Tidak perlu dioptimasi sekarang, tapi tandai dengan komentar `// TODO: populate saat resource management diimplementasi` agar tidak membingungkan di audit berikutnya.

---

### 3b. roster_snapshot — sudah minimal

**Field/Store:** `roster_snapshot` dalam `RuntimePackage`

**Yang disimpan:** `[{ id, nama }]` — hanya dua field (compiler baris 246: `.map(r => ({ id: r.id, nama: r.nama }))`).

**Yang sebenarnya dibutuhkan:** `id` dan `nama` — sudah tepat.

**Overhead:** Tidak ada.

**Rekomendasi:** Tidak perlu dioptimasi. Implementasi sudah benar.

---

### 3c. student_observation_recorded — target_nama redundant di payload

**Field/Store:** Payload event `student_observation_recorded` (`runtime-session.js:213`)

**Yang disimpan:** `{ target_id, target_nama, status, checkpoint_id }` — `target_nama` disertakan di setiap event.

**Yang sebenarnya dibutuhkan:** Hanya `target_id` — server bisa join ke `profiles` untuk mendapatkan nama. `target_nama` adalah denormalisasi yang tidak diperlukan di sisi server.

**Overhead:** Kecil — string nama per observasi per siswa. Namun jika guru merekam observasi untuk 30 siswa × 5 step = 150 events, overhead kumulatif tetap minor.

**Rekomendasi:** Pertahankan `target_nama` untuk sekarang karena memudahkan debugging tanpa join. Hapus saat sistem mature jika bandwidth menjadi concern.

---

### 3d. compileRuntimePackage — field `differentiation` raw ikut tersimpan

**Field/Store:** `pkg.differentiation` dalam `RuntimePackage`

**Yang disimpan:** Salinan penuh `mpContent?.differentiation ?? {}` — objek raw dari meeting plan artifact content (baris 243).

**Yang sebenarnya dibutuhkan:** Data differentiation **sudah dicompile** ke dalam `recovery_actions` (khususnya `REC-CLASS_NOT_UNDERSTAND.description` menggunakan `dif?.belum?.aktivitas`). Field `differentiation` di package hanya berguna jika UI menampilkan keseluruhan rencana diferensiasi kepada guru selama runtime — use case yang belum tentu ada.

**Overhead:** Sedang — bergantung pada isi differentiation object dari AI generator. Bisa beberapa ratus byte hingga beberapa KB per package.

**Rekomendasi:** Periksa apakah `runtime-ui.js` membaca `pkg.differentiation` langsung. Jika tidak, hapus field ini dari package dan andalkan `recovery_actions` yang sudah dicompile.

---

## RINGKASAN TEMUAN KRITIS

| # | Kategori | Fungsi | Risiko | Prioritas |
|---|----------|--------|--------|-----------|
| 1c | Edge Case | `startSession` / `SessionRepository.create` | **QuotaExceededError ditelan — data loss silent** | 🔴 Tinggi |
| 2b | Race | `startSession` | **Dua tap = dua session ghost** | 🔴 Tinggi |
| 1d | Edge Case | `syncPending` | Events yatim piatu tidak pernah sync, tidak ada notifikasi ke guru | 🟠 Sedang |
| 2a | Race | `advanceStep` / `skipStep` | Step di-mark dua status sekaligus, navigasi melompat | 🟠 Sedang |
| 1b | Edge Case | `openRuntimeDb` | Tab freeze permanen saat DB_VERSION dinaikkan | 🟠 Sedang (future) |
| 2c | Race | `_onOnline` / `syncPending` | Dua timer aktif (guard cukup, tapi boros) | 🟡 Rendah |
| 2d | Race | `cleanupLocal` / `syncPending` | Package dihapus setelah sync, compile ulang tak terduga | 🟡 Rendah |
| 1a | Edge Case | `compileRuntimePackage` | Error fase kosong terlambat dideteksi, pesan teknikal | 🟡 Rendah |
| 1f | Edge Case | `recordObservation` | Tidak ada feedback ke UI saat targets kosong | 🟡 Rendah |
| 3d | Data | `pkg.differentiation` | Duplikasi data yang mungkin tidak digunakan UI | 🟢 Sangat Rendah |
