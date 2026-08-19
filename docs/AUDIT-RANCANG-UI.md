# Audit UI `guru/js/classroom-rancang.js`

Audit statis atas seluruh file (5.658 baris). Nomor baris mengacu pada versi file saat audit. Tidak semua `catch` atau listener adalah masalah: entri di bawah hanya mencakup pola yang sesuai dengan kategori yang diminta.

## 1. CATCH TANPA UI FEEDBACK

- Baris 1311 — `generateCpMapel()` — kegagalan `upsertRancangSettings()` hanya dicatat ke console; guru tetap melihat CP seolah penyimpanan pengaturan berhasil.
- Baris 1680 — `handleStep1Submit()` — kegagalan `updateClassroomRancang()` hanya dicatat ke console; perubahan konteks kelas dapat tidak tersimpan tanpa diketahui guru.
- Baris 1681 — `handleStep1Submit()` — kegagalan `upsertRancangSettings()` hanya dicatat ke console; alur dilanjutkan dengan state lokal yang mungkin berbeda dari server.
- Baris 1829 — callback tombol simpan CP di `renderCpPreview()` — kegagalan upsert settings hanya dicatat ke console; dokumen CP dapat tersimpan sementara metadata konteks gagal.
- Baris 1892 — callback navigasi di `renderCpPreview()` — kegagalan upsert settings hanya menghasilkan `console.warn`; guru diarahkan ke langkah berikutnya tanpa mengetahui metadata belum tersimpan.
- Baris 5101 — callback unduh di `renderKontenMapel()` — kegagalan mengambil konten atau membuat DOCX hanya dicatat ke console; tombol kembali ke keadaan awal tanpa pesan kegagalan.
- Baris 5124 — callback hapus di `renderKontenMapel()` — kegagalan `hapusRancangDokumen()` hanya dicatat ke console; dokumen tetap ada tanpa penjelasan kepada guru.
- Baris 5533 — `initRancangTab()` — kegagalan memuat teaching context, ATP durable, atau planning context hanya menghasilkan `console.warn`; UI dapat jatuh ke state lama/lokal tanpa memberi tahu bahwa data server gagal dimuat.

Catatan: `catch` kosong (misalnya baris 4475, 4479, 4851–4853, 4988, dan 5544) lebih buruk dari pola “hanya console”, tetapi secara literal tidak masuk kriteria kategori ini karena bahkan tidak memanggil `console.error`/`console.warn`.

## 2. ASYNC TANPA GUARD FLAG

- Baris 1277 — `generateCpMapel()` — dapat dipicu dari beberapa tombol mapel; hanya men-disable tombol yang diklik, sehingga generate untuk mapel yang sama/berbeda dapat berjalan bersamaan dan saling menimpa `_ans`, `_cpElemen`, `_cpRingkasan`, serta dokumen.
- Baris 1802 — callback simpan CP di `renderCpPreview()` — tidak ada guard operasi; klik dari UI yang dirender ulang dapat membuat penyimpanan/upsert paralel dan hasil terakhir menang.
- Baris 2383 — callback `.rp-btn-rancang-tp` di `renderStep4()` — proses revisi TP tidak mempunyai guard; pemanggilan paralel dapat merevisi ATP berdasarkan revision/state yang sama.
- Baris 2412 — callback simpan ATP di `renderStep4()` — bergantung pada `btn.disabled`, bukan guard state lintas-render; re-render saat request aktif dapat membuka pemanggilan kedua.
- Baris 2670 — `confirmMeetingAllocation()` — tidak memiliki flag; pemanggilan ulang setelah render/navigasi dapat mengirim dua konfirmasi alokasi atau perubahan kebijakan JP secara paralel.
- Baris 2727 — `enterPhase2CPipeline()` — tombol retry dan jalur resume dapat memanggilnya bersamaan; response yang datang terakhir dapat menimpa `_phase2cState`.
- Baris 2938 — `runGenerateContext()` — operation ID hanya mengamankan idempotensi regenerate, bukan mencegah request paralel; generate dan regenerate dapat overlap dan menimpa checkpoint.
- Baris 2960 — `runSaveContextEdit()` — tidak ada guard lintas-render; dua save dapat berlomba dan membuat revision conflict/last-write-wins.
- Baris 2979 — `runConfirmContext()` — tidak ada guard state; confirm paralel dapat memakai selected version yang sudah stale.
- Baris 3187 — `runGenerateAssessment()` — operation ID regenerate tidak mencegah request generate/regenerate bersamaan; hasil terakhir menimpa assessment state.
- Baris 3207 — `runSaveAssessmentEdit()` — save berulang dapat memakai revision lama dan menghasilkan conflict atau last-write-wins.
- Baris 3226 — `runConfirmAssessment()` — confirm dapat dikirim lebih dari sekali melalui re-render/jalur panggilan lain.
- Baris 3253 — `enterMaterialPipeline()` — entry/retry berulang dapat menjalankan generate material paralel dan menimpa `_phase2cState`.
- Baris 3421 — `runSaveMaterialEdit()` — save edit paralel dapat menimpa revision material.
- Baris 3451 — `enterMeetingPipeline()` — dapat dipanggil dari beberapa navigasi/retry tanpa guard; response pipeline yang lebih lama dapat menang terakhir.
- Baris 3666 — `enterFollowUpPipeline()` — generate follow-up dapat dipicu ulang tanpa guard lintas-render, menghasilkan request dan state yang berlomba.
- Baris 3778 — callback regenerate follow-up di `renderFollowUpPipeline()` — tombol tidak dinonaktifkan dan tidak ada flag; double-click langsung mengirim request ganda.
- Baris 3813 — callback simpan follow-up di `showFollowUpEditor()` — tombol tidak dinonaktifkan dan tidak ada flag; double-click dapat menyimpan dua revision.
- Baris 3832 — `enterValidationPipeline()` — validasi dapat dipicu melalui tombol lanjut, retry, dan revalidate tanpa guard; hasil validasi lama dapat menimpa hasil baru.
- Baris 4129 — `runSaveMeetingEdit()` — hanya men-disable node tombol saat ini; re-render dapat mengizinkan save kedua pada meeting/revision yang sama.
- Baris 4150 — `runRegenerateMeeting()` — stable operation ID membantu idempotensi retry tetapi tidak menjadi in-flight guard; dua call tetap dapat berlangsung bersamaan.
- Baris 4179 — `runRetryMeeting()` — semua retry memakai aksi `generate_all_meetings`; klik retry pada meeting berbeda dapat menjalankan generate-all paralel.
- Baris 4193 — `runSelectMeetingCandidate()` — pilihan kandidat paralel dapat menggunakan `selectionRevision` sama dan saling conflict/menimpa pilihan.
- Baris 4410 — callback simpan RPM di `renderStep6()` — `btn.disabled` hanya menjaga node saat ini; re-render dapat memulai simpan dokumen kedua.
- Baris 4821 — `triggerDownload()` — hanya men-disable satu tombol per jenis; unduh RPM dan LKS atau tombol hasil re-render dapat menjalankan generator DOCX bersamaan.
- Baris 5077 — callback unduh legacy di `renderKontenMapel()` — hanya guard per tombol; beberapa unduhan dapat berjalan serentak dan berpotensi bertabrakan bila generator memakai resource global.
- Baris 5111 — callback hapus legacy di `renderKontenMapel()` — tidak men-disable tombol dan tidak memiliki flag; double-click dapat mengirim penghapusan dokumen yang sama dua kali.
- Baris 5433 — callback siapkan satu runtime package di `renderRuntimeReadinessSection()` — hanya men-disable node tombol saat ini; re-render dapat memulai kompilasi package meeting yang sama lagi.
- Baris 5451 — callback siapkan semua runtime package di `renderRuntimeReadinessSection()` — tidak ada flag lintas-render; operasi “semua” dapat overlap dengan tombol per-meeting dan menulis package yang sama bersamaan.
- Baris 5605 — callback klik tab Rancang — `getTrialStatus()` dan `initRancangTab()` tidak ditunggu (`initRancangTab(cId)` dipanggil tanpa `await`) serta `_loaded` baru diset di akhir; klik tab berulang dapat menjalankan beberapa inisialisasi paralel.

## 3. EVENT LISTENER TANPA CLEANUP

- Baris 326 — `document` — `click` — `wireCustomDropdown()` memasang handler baru setiap dropdown/setiap render; handler tidak pernah dilepas dan tetap hidup walau `wrap` sudah keluar dari DOM.
- Baris 331 — `window` — `scroll` — `wireCustomDropdown()` memasang `closePanel` baru setiap pemanggilan; tidak ada cleanup saat dropdown dibuang, sehingga closure dan pekerjaan scroll terus bertambah.
- Baris 421 — `document` — `click` — `wireS0Multiselect()` menambah handler global untuk setiap multiselect dan setiap render Step 0; tidak ada cleanup saat elemen diganti.
- Baris 755 — `#rp-body` — `click` — `renderStep0()` memasang delegation listener pada container persisten; membuka Step 0 kembali menumpuk handler accordion yang identik.
- Baris 4800 — `#rp-body` — `click` — `renderStep7Structured()` memasang delegation listener pada container persisten; setiap render Step 7 menambah handler edit lagi sehingga satu klik dapat mengeksekusi callback berulang.

Listener pada elemen yang dibuat di dalam render tetapi ikut dilepas ketika subtree diganti tidak dicatat sebagai leak, karena node beserta listener dapat dikoleksi garbage collector. `onclick` pada step bar juga merupakan assignment yang mengganti handler lama, bukan penambahan.

## 4. LOCALSTORAGE SEBAGAI SOURCE OF TRUTH

- Baris 5194 — `ans` — seluruh jawaban wizard dari `localStorage` di-`Object.assign()` ke `_ans`; nilai ini menentukan mapel, jenjang, fase, pilihan TP, konteks kelas, dan navigabilitas tanpa validasi/version check terhadap server.
- Baris 5206 — `atpList` — ketika server tidak mengembalikan `_durableAtp`, ATP lokal dipakai sebagai data aktif; ATP stale dapat menjadi dasar pemilihan TP dan pembuatan rencana.
- Baris 5211 — `rencana` — RPM lokal dipulihkan sebagai `_rencana` dan dipakai oleh `isStepNavigable(6)`/render Step 6, meskipun keberadaan atau revision dokumen server tidak dikonfirmasi.
- Baris 5212 — `durableAtp` — `_durableAtp` lokal menjadi fallback saat server tidak memberi data; penanda “durable” dari cache dapat dianggap otoritatif padahal mungkin telah dihapus atau direvisi di server.
- Baris 5213 — `teachingContext` — teaching context lokal menjadi fallback; ID stale dapat dipakai pada request Phase 2 berikutnya.
- Baris 5214 — `planningContext` — planning context lokal menjadi fallback dan kemudian menentukan apakah pipeline Phase 2C dibuka; konteks yang sudah berubah/dibatalkan di server masih dapat mengarahkan alur.
- Baris 5215 — `jpPolicy` — kebijakan JP lokal menjadi fallback untuk validasi dan keputusan override/alokasi, padahal kebijakan ini seharusnya dibaca ulang dari server.
- Baris 5216 — `phase2cState` — state pipeline lokal langsung dipasang ke `_phase2cState`; komentar menyebut “cache only”, tetapi pada restore state ini dapat dirender/dipakai sebelum refresh server yang berhasil.
- Baris 5217 — `step` — langkah wizard dari cache menentukan render dan cabang alur; manipulasi/staleness cache dapat melewati urutan UI walaupun sebagian guard server belum tersedia.

`sip_tab_<cId>` pada baris 5613/5653 tidak dimasukkan karena hanya preferensi UX untuk tab terakhir, bukan keputusan bisnis atau data perencanaan.

## 5. ERROR DARI SIPAPI YANG TIDAK DIBEDAKAN

Semua lokasi berikut menangkap error `SipApi`/API secara umum dan menampilkan pesan generik atau `err.message` mentah, tanpa cabang eksplisit untuk network/timeout, auth (401/403/session), conflict/revision (409), validasi/logic (4xx), dan server (5xx):

- Baris 1137 — `handleStep0Submit()` — rekomendasi: petakan status/kode error; arahkan auth ke login, tampilkan validasi field dari server, dan sediakan retry hanya untuk network/5xx.
- Baris 1315 — `generateCpMapel()` — rekomendasi: bedakan kegagalan fetch CP, AI, penyimpanan dokumen, dan auth; jangan menyatukan seluruh pipeline sebagai “Gagal”.
- Baris 1637 (catch utama sesudah baris 1683) — `handleStep1Submit()` — rekomendasi: klasifikasikan fetch data CP vs AI/network dan tampilkan tindakan pemulihan yang sesuai.
- Baris 1802/1849 — callback simpan CP — rekomendasi: bedakan conflict dokumen, auth, validasi payload, dan gangguan jaringan.
- Baris 2187/2240 — `handleStep3BSubmit()` — rekomendasi: gunakan normalizer error API dan pesan khusus untuk auth, revision/conflict ATP, validasi konteks, serta retryable network error.
- Baris 2412/2428 — callback simpan ATP — rekomendasi: tampilkan conflict/revision sebagai permintaan refresh, bukan pesan simpan generik.
- Baris 2565/2620 — `handleStep5Submit()` — rekomendasi: pisahkan validation/logic context dari network/auth; pertahankan input saat retry.
- Baris 2670/2694 — `confirmMeetingAllocation()` — rekomendasi: bedakan validasi kebijakan JP/409 revision dari network; untuk conflict muat ulang proposal terbaru.
- Baris 2727/2737 — `enterPhase2CPipeline()` — rekomendasi: auth harus menghentikan retry loop dan meminta login; network diberi retry; state tidak ditemukan diarahkan kembali ke planning.
- Baris 2875/2885 — callback pilih kandidat context — rekomendasi: tangani selection revision conflict dengan refresh kandidat, bukan pesan generik.
- Baris 2938/2953 — `runGenerateContext()` — rekomendasi: retry otomatis/terarah hanya untuk network/5xx; tampilkan validation/logic error apa adanya secara aman.
- Baris 2960/2973 — `runSaveContextEdit()` — rekomendasi: pisahkan schema validation, revision conflict, auth, dan network.
- Baris 2979/2990 — `runConfirmContext()` — rekomendasi: pada conflict muat state terbaru; pada auth minta login; pada network pertahankan tombol retry.
- Baris 3096/3106 — callback pilih kandidat assessment — rekomendasi: tangani revision conflict dengan refresh assessment state.
- Baris 3187/3200 — `runGenerateAssessment()` — rekomendasi: klasifikasikan error generate, quota/logic, auth, dan network.
- Baris 3207/3220 — `runSaveAssessmentEdit()` — rekomendasi: tampilkan schema/validation detail dan tangani revision conflict terpisah.
- Baris 3226/3237 — `runConfirmAssessment()` — rekomendasi: refresh checkpoint pada conflict; jangan menyamakan auth/network dengan kegagalan konfirmasi.
- Baris 3253/3265 — `enterMaterialPipeline()` — rekomendasi: bedakan state prasyarat belum lengkap dari gangguan jaringan/server.
- Baris 3421/3434 — `runSaveMaterialEdit()` — rekomendasi: gunakan pemetaan error bersama untuk validation, conflict, auth, network, dan 5xx.
- Baris 3451/3494 — `enterMeetingPipeline()` — rekomendasi: conflict harus memicu reload state; auth menghentikan alur; network menawarkan retry.
- Baris 3666/3678 — `enterFollowUpPipeline()` — rekomendasi: bedakan prasyarat/logic error dari network dan auth sebelum menampilkan retry.
- Baris 3778/3783 — callback regenerate follow-up — rekomendasi: tangani quota/batas regenerate, conflict, auth, dan network secara berbeda.
- Baris 3813/3824 — callback simpan follow-up — rekomendasi: pisahkan validation/schema, revision conflict, auth, dan network.
- Baris 3832/3844 — `enterValidationPipeline()` — rekomendasi: hasil validasi domain bukan network error; tampilkan hasil/issue domain, sedangkan auth/network memakai jalur pemulihan berbeda.
- Baris 4129/4144 — `runSaveMeetingEdit()` — rekomendasi: bedakan schema invalid, revision conflict, auth, dan network.
- Baris 4150/4173 — `runRegenerateMeeting()` — rekomendasi: bedakan batas regenerate/logic, auth, network retryable, dan server error.
- Baris 4179/4187 — `runRetryMeeting()` — rekomendasi: network dapat memakai retry idempoten; logic/prerequisite harus mengarahkan guru memperbaiki tahap sebelumnya.
- Baris 4193/4206 — `runSelectMeetingCandidate()` — rekomendasi: 409 selection revision harus memuat ulang kandidat, bukan ditampilkan sebagai kegagalan umum.
- Baris 4410/4434 — callback simpan RPM — rekomendasi: bedakan auth, conflict/duplikasi, validasi payload, network, dan 5xx.
- Baris 4471/4475 — `renderStep7Structured()` — rekomendasi: jangan menelan error refresh pipeline; auth dan not-found perlu mengubah alur, sementara network boleh fallback ke cache dengan banner “offline/stale”.
- Baris 4479 — `renderStep7Structured()` — rekomendasi: kegagalan profil/auth harus terlihat; jangan diam-diam membuat identitas dokumen kosong.
- Baris 4821/4829 — `triggerDownload()` — rekomendasi: bedakan kegagalan API/data pipeline dari kegagalan generator DOCX lokal.
- Baris 4851–4853 — `renderStep7Legacy()` — rekomendasi: jangan menelan tiga error API; tampilkan partial-load state dan klasifikasi auth/network/not-found per sumber.
- Baris 4985/4988 — `renderKontenMapel()` — rekomendasi: bedakan dokumen hilang/forbidden dari network dan tampilkan error di accordion ATP.
- Baris 5077/5101 — callback unduh legacy — rekomendasi: bedakan fetch konten API dari kegagalan pembuatan file lokal dan tampilkan pesan masing-masing.
- Baris 5111/5124 — callback hapus legacy — rekomendasi: tangani not-found sebagai sudah terhapus, forbidden/auth secara khusus, conflict bila ada, dan network dengan retry.
- Baris 5478/5533–5544 — `initRancangTab()` — rekomendasi: hindari `Promise.all` yang menghilangkan semua hasil saat satu request gagal; gunakan `Promise.allSettled`, klasifikasi tiap error, dan jangan fallback ke onboarding seolah profil belum ada saat penyebabnya auth/network.
- Baris 5617 — callback tab Rancang (`getTrialStatus`) — rekomendasi: jangan menganggap error sebagai status aman; auth harus meminta login, network menampilkan status tidak dapat diverifikasi, dan hanya respons server valid yang membuka gate.

Rekomendasi lintas-cutting: tambahkan satu helper semacam `classifySipApiError(error)` yang menghasilkan `{ kind, status, retryable, userMessage }`, lalu gunakan pola UI konsisten untuk `AUTH`, `NETWORK/TIMEOUT`, `VALIDATION`, `CONFLICT/STALE_REVISION`, `NOT_FOUND`, dan `SERVER`.
