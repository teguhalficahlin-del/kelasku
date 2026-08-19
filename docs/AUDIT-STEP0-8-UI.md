# Audit UI Tab Rancang Pembelajaran — Step 0–8

Tanggal audit: 2026-08-19  
Sifat audit: read-only terhadap implementasi; hanya laporan ini yang dibuat.  
Berkas utama yang dibaca penuh:

- `guru/js/classroom-rancang.js`
- `guru/js/classroom-rancang-ai.js`
- `ASSESSMENT-WIREFRAME.md`

## Ringkasan eksekutif

Audit menemukan masalah traceability mendasar: `ASSESSMENT-WIREFRAME.md` bukan spesifikasi Tab Rancang Pembelajaran Step 0–8. Dokumen tersebut berjudul “Panduan 57 Pola Wireframe Tab Penilaian” dan mengatur modal penilaian (jenis, teknik, instrumen, output per siswa, serta 57 kombinasinya). Dokumen itu tidak mendefinisikan Step 0–8, field setiap step, pipeline artefak, state machine Step 6, atau batas regenerate. Karena itu, kecocokan UI Step 0–7 terhadap dokumen yang diberikan tidak dapat dinyatakan lulus atau gagal secara sah; diperlukan dokumen spesifikasi Rancang yang benar.

Terlepas dari gap spesifikasi tersebut, audit kode menemukan:

- Render function tersedia untuk Step 0–7. Tidak ada Step 8 dalam wizard; implementasi dan step bar hanya mengenal Step 1–7, dengan Step 0 sebagai onboarding.
- `renderStep6Phase2C()` tidak menggunakan state machine bernama yang disebut dalam permintaan audit. Routing diturunkan dari flag artefak (`confirmed`, `lifecycle_status`, `usable`, dan keberadaan `artifact_id`).
- Checkpoint Context dan Assessment tidak dapat dilewati melalui jalur normal Step 6, tetapi Step 7 tetap selalu navigable dari step bar.
- Tidak ada client-side limit untuk Context/Assessment. Meeting dan Follow-up memakai keberadaan kandidat sebagai proxy limit 1x. Material tidak mempunyai tombol regenerate sama sekali.
- Pesan 409 diteruskan sebagai `Error(data.error)` bila payload error berhasil dibaca, tetapi tidak ada penanganan khusus “Batas regenerate”; jika Supabase mengembalikan error transport sebelum `data.error`, UI dapat menerima pesan generik SDK.
- Candidate selection dan refresh benar untuk Context, Assessment, dan Meeting. Material tidak menampilkan kandidat. Follow-up mendeteksi kandidat tetapi tidak menyediakan tombol untuk memilihnya.
- Service Worker didaftarkan pada `/guru/sw.js`; ini tidak sesuai path yang diwajibkan, `/kelasku/guru/sw.js`.
- Tombol hasil validasi “Lihat Dokumen RPM” belum berpindah ke Step 7; handler hanya menampilkan pesan placeholder.

## Audit 1 — Step coverage

Catatan: kolom “matches spec” bernilai **tidak dapat dinilai** karena `ASSESSMENT-WIREFRAME.md` tidak memuat spesifikasi Step 0–8. “Extra fields” berarti elemen implementasi yang tidak disebut sama sekali oleh dokumen yang diberikan, bukan berarti elemen tersebut pasti salah menurut product requirement yang sebenarnya.

| Step | Render function | Matches spec? | Missing fields | Extra fields / UI yang tidak ada di spec yang diberikan |
|---|---|---|---|---|
| 0 | `renderStep0()`; helper `renderStep0MapelSection()`, `renderStep0SdMapel()`, `renderStep0KelasSection()` | Tidak dapat dinilai | Tidak dapat ditentukan | Seluruh onboarding profil: jenjang, peran/mapel, kelas/fase, semester aktif, nama/NIP guru, nama/NIP kepala sekolah, tahun ajaran, kota; cabang SMK bidang/program/elemen CP |
| 1 | `renderStep1()`; `renderStep1ReadOnly()`, `renderStep1P2b()`, `renderStep1P3()`, `renderStep1Button()` | Tidak dapat dinilai | Tidak dapat ditentukan | Identitas konteks/mapel dan alur pemilihan CP; mode read-only setelah profil dikunci |
| 2 | `renderStep2()` | Tidak dapat dinilai | Tidak dapat ditentukan | Konteks khusus SMK dan pertanyaan relevansi/kondisi praktik |
| 3 | `renderStep3A()` dan `renderStep3B()` | Tidak dapat dinilai | Tidak dapat ditentukan | Step 3 dibagi dua: niat guru (suasana, titik mulai, perkembangan, pengalaman dominan) dan preferensi (JP, pola jadwal SMK, pendekatan, gaya mengajar, penilaian utama, dimensi profil lulusan) |
| 4 | `renderStep4(list)` | Tidak dapat dinilai | Tidak dapat ditentukan | Daftar ATP/TP, detail elemen dan estimasi JP, edit judul TP, pilih TP, simpan ATP |
| 5 | `renderStep5()` | Tidak dapat dinilai | Tidak dapat ditentukan | Konteks kelas, fasilitas/keterbatasan, penyimpanan planning context, dan pengaturan alokasi pertemuan sebelum pipeline |
| 6 | `renderStep6Phase2C()` dengan sub-render `renderContextCheckpoint()`, `renderAssessmentCheckpoint()`, `renderMaterialSpec()`, `renderMeetingPipeline()`, `renderFollowUpPipeline()`, dan `renderValidationResult()`; ada fallback legacy `renderStep6(data)` | Tidak dapat dinilai | Tidak dapat ditentukan | Seluruh pipeline Context → Assessment → Material → Meeting → Follow-up → Validation, editor JSON manual, candidate selection, retry, dan repair routing |
| 7 | `renderStep7()`; `renderStep7Structured()` dan `renderStep7Legacy()` | Tidak dapat dinilai | Tidak dapat ditentukan | Document Hub, structured/legacy modes, identitas dokumen, status artefak, edit navigation, generate/download dokumen, runtime readiness, reset |

### Step 8

Permintaan menyebut “Step 0–8”, tetapi meminta tabel Step 0–7. Kode juga hanya mendefinisikan `_step` 0–7 dan `STEPS` berisi tujuh item untuk Step 1–7. Tidak ditemukan `renderStep8()` atau route Step 8. Jika Step 8 memang diwajibkan oleh spesifikasi produk, implementasinya hilang; hal ini tidak dapat diverifikasi terhadap `ASSESSMENT-WIREFRAME.md` karena dokumen tersebut tidak mendefinisikannya.

## Audit 2 — Regenerate limit enforcement

### Context Specification — batas yang dinyatakan: 3x

- Tidak ada counter atau pengecekan limit client-side.
- Tombol `⟳ Regenerate` selalu ditampilkan ketika artifact Context sudah ada.
- `runGenerateContext(true)` selalu mengirim `regenerate_context_spec` dengan stable `client_operation_id`.
- Enforcement bergantung sepenuhnya pada server.
- Error ditampilkan melalui `showError('rp2c-ctx-error', e.message || ...)`; tidak ada copy khusus yang menjelaskan angka batas 3x atau menawarkan edit manual.

### Assessment — batas yang dinyatakan: 3x

- Sama seperti Context: tidak ada counter/check client-side dan tombol tetap tersedia selama artifact ada.
- `runGenerateAssessment(true)` mengandalkan server.
- Tidak ada pesan khusus limit 3x.

### Material — batas yang dinyatakan: 1x

- UI Material tidak menyediakan tombol atau handler regenerate.
- `renderMaterialSpec()` hanya menyediakan Edit dan Lanjut ke Pertemuan ketika material usable.
- Dengan demikian limit 1x tidak “dilanggar” dari UI, tetapi fitur regenerate yang disebut spesifikasi juga tidak tersedia di UI.
- Variabel `_matRegenOpId` dideklarasikan tetapi tidak digunakan, yang mengindikasikan implementasi regenerate Material belum selesai.

### Meeting — batas yang dinyatakan: 1x per meeting

- Ada client-side proxy check: tombol regenerate ditampilkan hanya bila artifact ada dan `m.candidates` kosong.
- Bila kandidat ada, UI mengganti tombol dengan teks `(batas regen tercapai)`.
- Ini bukan counter eksplisit. Ia mengasumsikan keberadaan kandidat selalu identik dengan limit sudah habis; setelah kandidat dipilih dan daftar kandidat berubah, perilakunya bergantung pada bentuk state server.
- Server tetap menjadi enforcement final.

### Follow-up — batas yang dinyatakan: 1x

- Ada proxy serupa: tombol regenerate hanya muncul jika artifact ada dan `fu.candidates` kosong; jika kandidat ada ditampilkan `(batas regen tercapai)`.
- Server tetap menjadi enforcement final.
- Masalah kritis: kandidat Follow-up tidak dapat dipilih dari UI, sehingga user dapat terjebak setelah regenerate.

### Kesimpulan Audit 2

Enforcement client-side tidak konsisten. Foundation sepenuhnya server-side; Meeting dan Follow-up menggunakan proxy kandidat; Material tidak menawarkan regenerate. Feedback limit eksplisit hanya ada pada Meeting/Follow-up saat state sudah memuat kandidat. Tidak ada normalisasi khusus untuk response 409 “Batas regenerate”.

## Audit 3 — State machine compliance

State machine yang diminta:

`meeting_allocation_unconfirmed → context_generating → context_review_required → assessment_generating → assessment_review_required → pipeline_generating → validating → ready_for_step_7`

### Routing aktual `renderStep6Phase2C()`

Routing aktual tidak membaca field state bernama di atas. Logikanya:

1. Jika state kosong/stale: panggil ulang `enterPhase2CPipeline()`.
2. Jika `context_spec.confirmed` false: `renderContextCheckpoint()`.
3. Jika `assessment_spec.lifecycle_status !== 'CONFIRMED'`: `renderAssessmentCheckpoint()`.
4. Jika `material_spec.usable !== true`: `enterMaterialPipeline()`.
5. Jika ada Meeting Plan dengan `artifact_id`: `renderMeetingPipeline()`.
6. Selain itu: `renderMaterialSpec()`.

### Coverage transisi

| State spesifikasi | Ditangani eksplisit? | Implementasi aktual |
|---|---|---|
| `meeting_allocation_unconfirmed` | Tidak | Tidak ada branch bernama/flag khusus dalam `renderStep6Phase2C()`; kegagalan/gate diserahkan ke server atau alur sebelum pipeline |
| `context_generating` | Tidak sebagai server state | Loading screen dibuat imperatif di handler generate, bukan route berbasis state |
| `context_review_required` | Tidak sebagai state bernama | Diperkirakan dari `!context_spec.confirmed` |
| `assessment_generating` | Tidak sebagai server state | Loading/button state dibuat imperatif saat request berlangsung |
| `assessment_review_required` | Tidak sebagai state bernama | Diperkirakan dari lifecycle Assessment yang belum `CONFIRMED` |
| `pipeline_generating` | Tidak | Material/Meeting/Follow-up mempunyai entry/render function terpisah; tidak ada satu branch state ini |
| `validating` | Tidak sebagai route state | `enterValidationPipeline()` menampilkan loading saat request berlangsung |
| `ready_for_step_7` | Tidak | `renderValidationResult()` memeriksa hasil validasi, tetapi tombol sukses tidak melakukan navigasi; hanya menampilkan placeholder “Dokumen RPM akan tersedia di Step 7.” |

### Checkpoint skipping

- Dari jalur Step 6 normal, Context harus `confirmed` sebelum Assessment ditampilkan (`renderAssessmentCheckpoint()` juga mengembalikan user ke Context bila belum confirmed).
- Assessment harus berstatus `CONFIRMED` sebelum `enterMaterialPipeline()` dipanggil lewat konfirmasi normal.
- Jadi checkpoint Context/Assessment tidak dapat dilewati melalui tombol pipeline normal.
- Namun `isStepNavigable(7)` selalu `true`, sehingga user dapat membuka Step 7 kapan saja melalui step bar, tanpa `ready_for_step_7`.
- Tombol “Lanjut ke Asesmen” muncul hanya setelah Context lifecycle `CONFIRMED`, dan tombol material/meeting/follow-up umumnya bergantung pada `usable` flags.

### Kesimpulan Audit 3

Secara gate artefak, urutan utama cukup defensif. Secara kontrak state machine, implementasi tidak compliant: state bernama tidak dirutekan, beberapa generating/validating state hanya UI transient lokal, `meeting_allocation_unconfirmed` dan `ready_for_step_7` tidak ditangani, dan Step 7 tetap dapat dinavigasi tanpa readiness.

## Audit 4 — Known bugs from production testing

### a. Response 409 “Batas regenerate”

**Status: sebagian ditangani, tidak konsisten.**

- `guru/js/api.js` melempar `new Error(data.error)` bila response function menghasilkan payload `data.error`; dalam kasus itu pesan server seperti “Batas regenerate …” dapat tampil apa adanya di area error.
- Handler Context/Assessment/Meeting/Follow-up menampilkan `e.message`, tetapi tidak mengenali status 409 atau substring `Batas regenerate` secara khusus.
- Tidak ada pesan UI yang konsisten menjelaskan limit, jumlah maksimum, dan langkah berikutnya (misalnya edit manual).
- Bila Supabase client mengisi `error` dan tidak menyediakan payload `data.error`, `if (error) throw error` terjadi lebih dahulu, sehingga pesan yang tampil dapat menjadi pesan generik transport/function invocation.
- Meeting/Follow-up menampilkan `(batas regen tercapai)` hanya setelah state mempunyai kandidat; Context/Assessment tidak mempunyai feedback proaktif tersebut.

### b. Candidate tidak usable dan tombol “Gunakan kandidat ini”

**Status: parsial.**

- Context: kandidat difilter hanya berdasarkan `version_id !== selected_version_id`; tombol `Gunakan kandidat ini` tetap muncul tanpa syarat `usable`. Ini menangani kandidat non-selected, termasuk yang membuat selected artifact terlihat tidak usable.
- Assessment: perilaku sama, tombol `Gunakan kandidat ini` tersedia untuk kandidat non-selected.
- Meeting: kandidat ditampilkan dengan tombol berlabel `Gunakan ini` (bukan persis “Gunakan kandidat ini”), tanpa syarat usable.
- Material: tidak ada candidate list atau action `select_material_candidate` di UI.
- Follow-up: `hasCandidate` hanya dipakai untuk menyembunyikan regenerate dan menampilkan teks limit; tidak ada daftar kandidat atau tombol select. Ini bug fungsional.

### c. Refresh setelah memilih kandidat

**Status: benar untuk flow yang tersedia.**

- Context: response mengganti `_phase2cState`, state disimpan, lalu `renderContextCheckpoint()` dipanggil.
- Assessment: response mengganti `_phase2cState`, state disimpan, lalu `renderAssessmentCheckpoint()` dipanggil.
- Meeting: response `resp.result` mengganti `_phase2cState`, state disimpan, lalu `renderMeetingPipeline()` dipanggil.
- Ketiga flow tersebut merender content selected version dari state response terbaru.
- Tidak dapat diuji untuk Material/Follow-up karena UI tidak menyediakan selection flow.

### d. Service Worker path

**Status: bug terkonfirmasi.**

Di `guru/classroom.html`, registrasi saat ini adalah:

```js
navigator.serviceWorker.register('/guru/sw.js')
```

Path yang diwajibkan adalah:

```js
navigator.serviceWorker.register('/kelasku/guru/sw.js')
```

## Temuan tambahan

1. `classroom-rancang-ai.js` berisi generator dokumen/formatting helper, bukan controller render Step 0–7. Tidak ditemukan render function wizard atau enforcement regenerate di file tersebut.
2. Navigasi Step 6 melalui step bar masih memakai prasyarat legacy `!!_rencana`; sementara restore state modern memakai `_planningContext` dan `enterPhase2CPipeline()`. Ini dapat menghasilkan perilaku navigasi berbeda antara klik step bar dan restore pipeline modern.
3. Tombol sukses validasi `rp2-val-btn-doc` belum memanggil `renderStep7()`; handler hanya memunculkan pesan placeholder. Ini memutus transisi `ready_for_step_7` yang diharapkan.
4. Material mendeklarasikan `_matRegenOpId` tetapi tidak memiliki handler regenerate, candidate list, atau select candidate UI.
5. Follow-up tidak memanggil `saveRpState()` setelah generate/regenerate berhasil, berbeda dari Context, Assessment, Material, dan Meeting. Render saat itu memakai state baru di memori, tetapi persistence/restore dapat tertinggal.

## Rekomendasi prioritas

1. Sediakan spesifikasi Tab Rancang Step 0–8 yang benar; jangan gunakan `ASSESSMENT-WIREFRAME.md` sebagai acceptance source untuk wizard ini.
2. Jadikan `pipeline_state` server sebagai contract eksplisit dan route seluruh state yang disebutkan, termasuk loading/resume setelah reload.
3. Gate navigasi Step 7 pada `ready_for_step_7`/`rpm_ready_for_class`, dan hubungkan tombol hasil validasi langsung ke `renderStep7()`.
4. Tambahkan metadata regenerate (`regen_count`, `regen_limit`, `regen_remaining`) ke state server dan gunakan secara konsisten untuk Context, Assessment, Material, Meeting, dan Follow-up.
5. Tambahkan candidate selection untuk Material dan Follow-up; samakan label serta refresh/persistence behavior.
6. Normalisasi error function API agar payload 409 selalu dipertahankan dan tampilkan pesan limit yang actionable.
7. Perbaiki registrasi Service Worker menjadi `/kelasku/guru/sw.js`.

## Pernyataan perubahan

Tidak ada source file yang dimodifikasi. Tidak ada commit dan tidak ada deployment. Satu-satunya file yang dibuat adalah laporan ini.
