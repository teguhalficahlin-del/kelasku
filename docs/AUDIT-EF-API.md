# Audit Edge Functions dan `guru/js/api.js`

Audit statis atas:

- `guru/js/api.js` (493 baris)
- `supabase/functions/phase2c-generate/index.ts` (882 baris)
- `supabase/functions/phase2-material/index.ts` (562 baris)
- `supabase/functions/phase2-meeting/index.ts` (723 baris)
- `supabase/functions/phase2-followup/index.ts` (532 baris)
- `supabase/functions/phase2-validator/index.ts` (541 baris)

Nomor baris mengacu pada versi file saat audit. Audit ini menilai kontrol yang terlihat di TypeScript; jaminan tambahan yang mungkin berada di RLS atau implementasi RPC database tidak diasumsikan kecuali pemanggilannya jelas membawa scope yang relevan.

## 1. INKONSISTENSI POLA ANTAR EDGE FUNCTION

### Auth: JWT → profile → role check

- Semua 5 EF — alur utama identik: wajib `POST`, ambil Bearer token, `admin.auth.getUser(token)`, query `profiles` berdasarkan `user_id`, lalu cek `role === 'GURU'`, `role_locked_at`, dan `role_guru` dalam `LOCKED_ROLES` — konsisten.
- `phase2c-generate` baris 270, `phase2-material` baris 213, `phase2-meeting` baris 221, `phase2-followup` baris 225, `phase2-validator` baris 346 — hasil error dari `admin.auth.getUser()` tidak diperiksa; hanya `user` yang diperiksa — bila layanan auth error, responsnya tetap 401 dan tidak dapat dibedakan dari JWT invalid.
- Semua 5 EF — hasil/error query `profiles.single()` tidak diperiksa terpisah — kegagalan DB dan “profil/role tidak diizinkan” sama-sama menjadi 403, menyulitkan diagnosis dan dapat menyamarkan outage sebagai authorization failure.

### Error response shape

- Semua 5 EF — error dasar konsisten memakai `{ error: string }` melalui `reply()`.
- `phase2c-generate` baris 421/488/694/762, `phase2-material` baris 386/460, `phase2-meeting` baris 556/614, dan `phase2-followup` baris 395/443 — error validasi kadang menambah `violations`, sehingga shape menjadi `{ error, violations }`; ini kompatibel tetapi bukan kontrak error tunggal yang terdokumentasi.
- Semua 5 EF — outer `catch` selalu mengubah error internal menjadi HTTP 409 dengan pesan generik (`Operasi ... gagal`) — error DB, timeout AI, configuration error, dan bug server salah diklasifikasikan sebagai conflict. Risiko: client tidak dapat menentukan retry, login ulang, atau perbaikan input secara benar.
- `phase2-meeting` baris 476 dan `phase2-validator` baris 523–532 — success response mengandung metadata tambahan (`meeting_results` atau `validation`), sedangkan `phase2c-generate` dan `phase2-material` hanya `{ result }`; ini menjelaskan perbedaan unpack di `api.js`, tetapi kontraknya tidak seragam.

### CORS

- Semua 5 EF — `CORS` identik: origin `*` dan allow-headers `authorization, x-client-info, apikey, content-type`; preflight juga identik mengembalikan `new Response('ok', { headers: CORS })` — konsisten.
- Semua 5 EF — tidak menetapkan `Access-Control-Allow-Methods` — browser umumnya tetap dapat menyelesaikan preflight untuk konfigurasi tertentu, tetapi kontrak CORS tidak eksplisit untuk `POST`/`OPTIONS`.
- Semua 5 EF — origin wildcard memperluas permukaan pemanggilan dari situs mana pun; Bearer JWT tetap menjadi kontrol utama, tetapi origin allowlist lebih aman bila fungsi hanya untuk aplikasi sendiri.

### `callAI` dan retry

- `phase2c-generate` baris 32–65 dan `phase2-material` baris 32–65 — pola identik: maksimal 3 percobaan, backoff 400 ms × nomor attempt, tidak retry untuk seluruh 4xx, retry untuk network/5xx; `max_tokens: 4096`; tidak ada timeout/abort per request.
- `phase2-meeting` baris 37–67 dan `phase2-followup` baris 36–66 — pola identik satu sama lain: satu call dengan timeout 55 detik, `max_tokens: 8192`, tanpa retry transport/5xx di dalam `callAI`.
- `phase2-meeting` baris 411–464 — `generate_all_meetings` membungkus `callAI` dalam maksimal 2 attempt dan memberi violation hint pada retry validasi; `regenerate_meeting` baris 544 hanya melakukan satu attempt. Risiko: reliability berbeda antara initial generate dan regenerate dalam EF yang sama.
- `phase2-followup` — tidak punya retry AI sama sekali. Risiko: timeout atau 5xx sementara langsung menggagalkan operasi, berbeda dari Context/Assessment/Material.
- `phase2-validator` — tidak memanggil AI; deterministic validator, sehingga ketidakhadiran `callAI` memang sesuai desain.
- Keempat EF yang memanggil AI — tidak memiliki satu helper bersama; perbedaan timeout, token, retry, klasifikasi 4xx/5xx, dan sanitasi error mudah makin menyimpang.

## 2. MISSING ERROR HANDLING DI `api.js`

### Method yang menyembunyikan error sebagai nilai normal

- `getRosterCount()` baris 26 — error query dikonversi menjadi `0` — rekomendasi: throw error atau return `{ count, error }`; nol bukan bukti roster kosong.
- `getScheduleCount()` baris 45 — error query dikonversi menjadi `0` — rekomendasi: jangan menyamakan kegagalan dengan tidak ada jadwal.
- `getTrialStatus()` baris 82 — error RPC menghapus cache lalu return `null` — rekomendasi: throw/classify error; `null` membuat caller tidak dapat membedakan “tidak ada status” dari auth/network/DB failure.
- `getRancangProfil()` baris 98 — error RPC return `null`; query role tambahan baris 104–108 juga mengabaikan `error` — rekomendasi: throw error utama dan periksa error merge profile secara eksplisit.
- `getRancangSettings()` baris 190 — error query return `null` — rekomendasi: throw atau hasil tagged; `null` dapat dianggap settings belum dibuat.
- `getRancangDokumen()` baris 223 — error query return `[]` — rekomendasi: throw; array kosong dapat membuat UI menyatakan tidak ada dokumen.
- `getRancangDokumenKonten()` baris 260 — error query return `null` — rekomendasi: bedakan not-found dari forbidden/network/DB error.
- `getPlanningContextsForClassroom()` baris 272 — error query return `[]` — rekomendasi: throw agar kegagalan tidak dianggap tidak ada planning context.
- `getArtifactContent()` baris 301 — error query return `null` — rekomendasi: bedakan artifact hilang dari query gagal.

### Method yang tidak menormalisasi/menangani error sendiri

- `getProfile()`, `getClassrooms()`, `createClassroom()`, `deleteClassroom()`, `updateClassroom()`, dan `updateClassroomRancang()` — langsung mengembalikan Supabase response `{ data, error }` sementara sebagian besar method lain mengembalikan data atau throw — rekomendasi: pilih satu kontrak API; idealnya throw pada error dan return data saja.
- `getClassroomStats()` baris 55 — mengembalikan `{ members, sessions, error }`, tetapi count yang gagal tetap menjadi `0` — rekomendasi: throw aggregate error atau tandai masing-masing count sebagai unavailable.
- Method write tanpa payload return (`hapusRancangDokumen`, `updateTpKktp`, `deleteTpKktp`, `updateAssessment`, `deleteAssessment`, `upsertAssessmentResult`, `upsertStudentGroup`, `upsertGradeRecap`) — pada sukses return `undefined` secara implisit, tetapi pada error sudah throw; ini bukan “undefined saat error”, namun kontrak sukses berbeda dari method lain — rekomendasi: return `{ ok: true }` atau dokumentasikan `Promise<void>`.
- Tidak ditemukan method yang secara eksplisit `return undefined` ketika error; pola yang bermasalah adalah fallback `null`, `[]`, atau `0`, serta direct Supabase response yang menyerahkan pemeriksaan error kepada caller.

### Pemeriksaan `data?.error` pada Edge Function invoke

- `applyTeachingFoundation()`, `phase2aPlanning()`, `phase2cGenerate()`, `phase2Material()`, `phase2Meeting()`, `phase2Followup()`, `phase2Validator()`, `getPipelineStateForContext()`, dan `runtimeSync()` — semuanya memeriksa transport `error` dan `data?.error` sebelum return — konsisten pada aspek ini; tidak ditemukan invoke wrapper yang melewatkan `data?.error`.
- Semua wrapper invoke tersebut — `throw new Error(data.error)` membuang HTTP status, `violations`, error code, dan metadata respons — rekomendasi: buat `SipApiError` yang mempertahankan `status`, `code`, `violations`, dan `retryable`.

### Konsistensi unpack Phase 2

- `phase2Material()` baris 168 — return `data?.result`.
- `phase2Meeting()` baris 175 — return seluruh `data` karena caller membutuhkan `{ result, meeting_results? }`.
- `phase2Followup()` baris 182 — return seluruh `data` walaupun saat ini hanya `{ result }`.
- `phase2Validator()` baris 189 — return seluruh `data` karena caller membutuhkan `{ result, validation }`.
- Kesimpulan — tidak konsisten: Material meng-unpack `result`, Meeting/Followup/Validator tidak. Perbedaan Meeting dan Validator beralasan karena metadata tambahan, tetapi Followup tidak. Rekomendasi: semua method return envelope yang sama, misalnya `{ result, meta }`, atau semua return `result` dengan metadata sebagai properti bernama yang terdokumentasi.

## 3. SECURITY CONCERNS DI EDGE FUNCTIONS

### Kontrol ownership yang sudah konsisten

- Semua 5 EF — sebelum action utama, classroom diverifikasi dengan `classrooms.id === body.classroom_id` dan `teacher_id === profile.id`; teaching context diverifikasi milik profile dan terikat aktif ke classroom; planning context diverifikasi terhadap profile, teaching context, dan classroom. Tidak ditemukan EF yang sepenuhnya melewatkan classroom ownership.

### Authority atau target sensitif yang masih berasal dari body

- `phase2c-generate` — `get_pipeline_state` (baris 307–313) — `planning_context_id` — action dijalankan sebelum query planning context baris 316–319 yang mengikatnya ke classroom/teaching context request. RPC memang menerima `profile.id`, tetapi EF tidak membuktikan planning context tersebut terkait classroom/context yang disertakan. Risiko: cross-context data exposure dalam akun guru yang sama bila RPC hanya memeriksa profile.
- `phase2c-generate` — `confirm_context_spec` (baris 554–565) — `version_id` — diteruskan ke lifecycle RPC hanya bersama `profile.id`, tanpa query yang memastikan versi merupakan `CONTEXT_SPEC` pada `planningContextId` aktif. Risiko: cross-planning-context transition/confirmation dalam akun guru yang sama; juga memungkinkan mengonfirmasi jenis artifact yang salah bila RPC tidak menegakkan kind/scope.
- `phase2c-generate` — `select_context_candidate` (baris 610–620) — `version_id`, `selection_revision` — version tidak diikat secara lokal ke artifact Context pada planning context request. Risiko: memilih candidate dari context/artifact lain; revision dari client tepat untuk optimistic concurrency, tetapi artifact target harus ditentukan server.
- `phase2c-generate` — `confirm_assessment_spec` (baris 834–849) — `version_id` — tidak dibuktikan sebagai selected/usable Assessment version pada planning context ini. Risiko: cross-context atau wrong-kind transition bila RPC tidak menutupnya.
- `phase2c-generate` — `select_assessment_candidate` (baris 858–868) — `version_id`, `selection_revision` — target candidate tidak diikat lokal ke Assessment artifact yang sedang aktif.
- `phase2-meeting` — `select_meeting_candidate` (baris 694–709) — `meeting_no`, `version_id`, `selection_revision` — `meeting_no` bahkan tidak digunakan untuk memverifikasi allocation item/artifact; RPC hanya menerima profile dan version. Risiko: request dapat memilih version meeting lain atau artifact lain milik profile, sementara state yang dikembalikan berasal dari planning context request yang berbeda.
- `phase2-followup` — `select_follow_up_candidate` (baris 506–518) — `version_id`, `selection_revision` — version tidak diikat lokal ke `FOLLOW_UP/ROOT` pada planning context request. Risiko: cross-context/wrong-kind selection dalam akun yang sama.
- Semua save-edit action (`phase2c-generate` baris 480/749, `phase2-material` baris 445, `phase2-meeting` baris 599, `phase2-followup` baris 435) — `body.content` — konten guru memang input yang sah, bukan authority, dan divalidasi server-side. Namun tidak ada batas ukuran payload/kedalaman JSON yang terlihat. Risiko: payload sangat besar dapat meningkatkan penggunaan memory/DB dan menjadi DoS per-user; tambahkan schema/size cap sebelum RPC.
- Semua regenerate action — `client_operation_id` berasal dari body dan hanya dipakai sebagai intent/idempotency input; ini tepat bila UUID divalidasi. `phase2-followup` tidak meminta client operation ID, sehingga retry semantics-nya berbeda dan lemah (lihat kategori 4).

### Field authority yang sudah benar-benar berasal dari DB

- Semua EF — jenjang, mapel/fase, TP/revision, snapshot konteks guru, alokasi pertemuan, dan dependency artifact dibaca dari DB, bukan dipercaya dari body.
- `phase2-meeting` — `meeting_no` pada regenerate/save edit diverifikasi terhadap allocation item server (baris 492–493 dan 606–607); pengecualian adalah action selection seperti dicatat di atas.
- `selection_revision` dari body bukan authority final bila RPC benar-benar menerapkan compare-and-swap; tetap perlu divalidasi sebagai integer non-negatif dan artifact target harus di-resolve dari DB.

## 4. REGENERATE LIMIT CONSISTENCY

- `phase2c-generate` — `regenerate_context_spec` — tidak ada cek jumlah regenerate server-side; hanya menentukan parent selected version dan memakai UUID operation ID — **tidak konsisten**; request langsung dapat membuat candidate berulang tanpa mengandalkan UI.
- `phase2c-generate` — `regenerate_assessment_spec` — tidak ada cek jumlah regenerate server-side; pola sama dengan Context — **tidak konsisten** dan limit tidak enforced di server.
- `phase2-material` — `regenerate_material_spec` baris 321–333 — menghitung row `rancang_artifact_versions` untuk artifact DB dengan `candidate_of_version_id IS NOT NULL`, menolak jika `>= 1` — **konsisten secara konsep** dengan Meeting/Followup dan enforcement berada di server, bukan client state.
- `phase2-meeting` — `regenerate_meeting` baris 495–510 — resolve artifact berdasarkan planning context, profile, kind, dan scope meeting; hitung candidate versions dari DB; tolak jika `>= 1` — **konsisten secara konsep** dan server-enforced.
- `phase2-followup` — `generate_follow_up` baris 336–351 — keberadaan artifact mengubah request menjadi regenerate secara implisit; hitung candidate versions dari DB; tolak jika `>= 1` — **sebagian konsisten**, tetapi action tidak eksplisit membedakan generate/regenerate.
- `phase2-followup` — idempotency key baris 366–368 selalu `fu_gen(..., 'initial')`, termasuk saat `isRegenerate === true` — **tidak konsisten/berpotensi bug**: regenerate memakai key logis yang sama dengan initial generation. Bergantung constraint/RPC, request regenerate dapat dianggap idempotent sebagai initial dan gagal menciptakan candidate, atau semantics retry menjadi ambigu. Gunakan `client_operation_id` UUID dan key khusus `fu_regen` seperti EF lain.
- `phase2-validator` — tidak memiliki regenerate AI; setiap `run_validation` membuat validation report sistem baru dengan key berbasis `checked_at` — tidak termasuk limit regenerate, tetapi berarti revalidate tak terbatas dan setiap call dapat menambah versi. Pertimbangkan apakah retention/rate limit diperlukan.
- `phase2-material`, `phase2-meeting`, dan `phase2-followup` — pola “SELECT count lalu INSERT” tidak atomik — **tidak konsisten dengan enforcement kuat**: dua request paralel dapat sama-sama melihat count 0 lalu keduanya membuat candidate. Limit harus ditegakkan atomik di DB (transaction/advisory lock atau unique constraint/index yang merepresentasikan satu regenerate candidate per artifact).
- Tidak ditemukan EF yang mengambil jumlah regenerate dari client state; seluruh cek yang ada membaca DB. Kekurangan utamanya adalah Context/Assessment tanpa cek, Followup dengan idempotency berbeda, dan race pada enforcement count-then-create.

## Ringkasan prioritas

1. Ikat setiap `version_id` dari body ke artifact kind/scope/planning context yang sudah diotorisasi sebelum memanggil transition/selection RPC.
2. Tambahkan enforcement regenerate server-side yang atomik untuk Context dan Assessment, lalu samakan semantics idempotency pada Material, Meeting, dan Followup.
3. Standarkan kontrak error EF dan pertahankan status/metadata tersebut di `api.js`.
4. Hentikan fallback `null`/`[]`/`0` untuk error data yang dapat mengubah keputusan UI.
5. Satukan helper auth/CORS/AI-call agar pola kelima EF tidak terus menyimpang.
