# Aturan Kerja Claude Code — MIClass

File ini WAJIB dibaca utuh oleh Claude Code sebelum mengerjakan apapun di repo ini — baik saat diminta eksplisit di prompt maupun tidak. Ini bukan opsional tergantung isi prompt yang diterima.

Disusun 27 Juli 2026 dari evaluasi satu sesi kerja penuh (lihat Changelog di akhir dokumen).

**Pembagian dokumen:**
- `CLAUDE.md` → konteks produk MIClass (schema, role, portal, status proyek).
- `AGENT_RULES.md` (dokumen ini) → aturan kerja agen. Kalau keduanya bertabrakan soal cara kerja, dokumen ini yang menang.

---

## 0. WAJIB — Langkah Pertama Setiap Sesi

Sebelum baris kode/perintah pertama dijalankan:

1. **Verifikasi pwd** — pastikan path mengandung `MIClass`.
2. **Verifikasi dokumen ini sudah dibaca** — di awal respons, sebutkan eksplisit satu kalimat konfirmasi, contoh: *"Sudah membaca AGENT_RULES.md (versi Sep 2026)."* Ini bukti telah dibaca, bukan asumsi.
3. Baca juga `CLAUDE.md` (dan dokumen handoff lain kalau ada) sebelum mulai — sebutkan itu juga sudah dibaca.

Kalau salah satu dari dua verifikasi ini belum dilakukan, JANGAN lanjut ke pekerjaan apapun — laporkan dulu bahwa verifikasi belum lengkap.

**Identitas proyek — hafalkan, jangan tebak:**

| Item | Nilai |
|------|-------|
| Repo lokal | `D:\ribuan_pengguna\CLAUDE\MIClass` |
| Repo GitHub | `teguhalficahlin-del/kelasku` |
| GitHub Pages | `https://teguhalficahlin-del.github.io/kelasku/` |
| Supabase project ref | `teccdzetrdjowqemnuuc` |
| Tenant anchor | `classroom_id` |
| Role | `GURU`, `SISWA`, `ORTU` (hanya tiga) |

> Folder lokal (`MIClass`) dan nama repo GitHub (`kelasku`) memang berbeda — itu bukan kesalahan, jangan "dirapikan" sendiri.

---

## 1. Presisi Kerja

- **Jangan menulis ulang kode dari ingatan.** Definisi fungsi/kode existing yang akan diedit atau dijadikan rujukan wajib dibaca langsung dari sumbernya sebelum digunakan — bukan direkonstruksi dari deskripsi di prompt atau ingatan sesi sebelumnya.
- **Gunakan `pg_get_functiondef(oid)`** untuk melihat definisi fungsi PostgreSQL secara utuh. JANGAN `\df+` — itu hanya menampilkan signature, bukan isi fungsi.
- **Verifikasi tipe data dan operator** sebelum menulis SQL yang memakai agregat/operator non-trivial. Contoh nyata dari sesi sebelumnya: `MIN()`/`MAX()` tidak berlaku untuk tipe `uuid` di PostgreSQL — ini sempat lolos ke sebuah migration dan baru ketahuan saat deploy gagal.
- **Untuk migration yang mengubah DATA EXISTING** (bukan cuma perilaku untuk data baru ke depan): investigasi SEMUA kemungkinan edge case dalam SATU putaran sebelum menulis migration final. Checklist minimal:
  - Ada baris "campuran" kondisi lama dan baru yang perlu ditangani beda dari kasus normal?
  - Ada risiko konflik nilai (beberapa baris seharusnya satu grup tapi datanya berbeda)?
  - Estimasi waktu eksekusi via `EXPLAIN ANALYZE` — wajib untuk UPDATE/DELETE >1000 baris, mengingat `statement_timeout` 2 menit di Supabase free tier.
  - Operator/fungsi yang akan dipakai valid untuk tipe kolom sebenarnya?
  
  Jangan temukan edge case satu-satu secara reaktif setelah commit pertama — itu boros putaran kerja dan menaikkan risiko commit yang harus direvisi berkali-kali.

---

## 2. Laporan Hasil Kerja — WAJIB Verbatim

- Semua output perintah, definisi kode, dan **terutama diff perubahan** WAJIB ditampilkan verbatim di badan teks — bukan diringkas, bukan diganti placeholder seperti `[byte-identik]` atau `...`, bukan disingkat dengan alasan apapun (termasuk "terlalu panjang").
- "Di badan teks" berarti diketik sebagai isi pesan dalam code block markdown — **bukan** cuma tersisa di panel output tool yang bisa terlipat/collapsed di layar Romo.
- Kalau output memang panjang, **pecah jadi beberapa pesan berurutan** — jangan meringkas isinya demi muat satu pesan.
- Klaim **"self-review lulus"** atau **"commit berhasil"** tanpa bukti verbatim yang menyertainya akan dianggap **tidak lengkap** dan diminta ulang. Ini berlaku untuk SEMUA jenis perubahan (SQL, JS, TypeScript, config, dokumentasi) — tidak ada pengecualian untuk file yang "sudah jelas benar".

---

## 3. Batasan Perubahan

- HANYA ubah file yang eksplisit disebut di bagian `BATASAN KERAS` pada prompt yang diterima.
- Kalau `BATASAN KERAS` juga membatasi **pembacaan** ("hanya boleh membaca/mengubah ..."), batas itu berlaku untuk `cat`/`grep`/`read` juga — bukan cuma untuk tulis.
- Perlakukan `BATASAN KERAS` sebagai pagar keras, bukan saran yang bisa dilonggarkan kalau terasa perlu.
- Kalau di tengah pekerjaan ternyata perlu menyentuh file di luar daftar — STOP, laporkan kebutuhan itu, jangan langsung dikerjakan.

---

## 4. Commit & Deploy

- Commit hanya setelah diff ditinjau (dan ditampilkan verbatim — lihat aturan #2).
- **TIDAK ADA** push tanpa konfirmasi eksplisit terpisah dari commit.
- **TIDAK ADA** `git add + commit + push` digabung otomatis dalam satu langkah.
- **TIDAK ADA** `supabase db push` (real, bukan dry-run) tanpa instruksi eksplisit terpisah setelah hasil dry-run ditinjau — berlaku bahkan kalau prompt sebelumnya sudah menyinggung soal "lanjut deploy".
- Urutan deploy yang benar: `supabase db push` (setelah dry-run direview) → `supabase functions deploy` (kalau ada edge function berubah) → `git push`. Alasan urutan ini: mencegah jendela waktu di mana kode production yang sudah live memanggil RPC/fungsi yang belum ada di database remote.
- `supabase functions deploy` dan `supabase functions list` di CLI versi proyek ini **tidak menerima** `--linked` — pakai `--project-ref teccdzetrdjowqemnuuc`. `supabase db push` tetap pakai `--linked`.
- Hosting frontend adalah GitHub Pages dari branch `main` — begitu `git push origin main` jalan, perubahan JS/HTML langsung live. Tidak ada tahap build atau staging yang menahan kesalahan.

---

## 5. Standing Rule Teknis — Supabase/PostgreSQL

- **SECURITY DEFINER**: setiap `CREATE FUNCTION SECURITY DEFINER` baru wajib disertai, di migration yang sama: `GRANT EXECUTE` ke role yang dituju (biasanya `authenticated`), lalu `REVOKE EXECUTE FROM anon` (wajib), lalu `REVOKE EXECUTE FROM PUBLIC` (defense-in-depth). Jangan andalkan `REVOKE FROM PUBLIC` saja — Supabase memberi grant eksplisit ke `anon` yang tidak ikut tercabut oleh revoke dari `PUBLIC`.
- **Privilege kolom**: Supabase memberi grant `ALL` di level tabel (bukan level kolom) untuk tabel baru. `REVOKE UPDATE (kolom_tertentu)` tidak efektif kalau masih ada grant UPDATE penuh di level tabel — lindungi kolom sensitif dengan trigger `BEFORE UPDATE` memakai allowlist default-deny.
- **RLS subquery**: `EXISTS` mentah ke tabel lain yang dilindungi RLS di dalam `USING`/`WITH CHECK` akan dievaluasi dengan visibilitas RLS milik si pemanggil, bukan aturan yang dimaksud — selalu gunakan fungsi `SECURITY DEFINER` terpisah untuk validasi struktural lintas-tabel.
- **Policy yang hilang** bukan otomatis kerentanan — Postgres default-deny berarti tidak ada policy = akses ditolak total (aman). Baru ditandai sebagai masalah setelah terbukti klien memang butuh operasi itu dan terblokir (bug fungsional), atau ada jalur lain yang membuat proteksinya tidak efektif.
- `service_role` **bukan** superuser dan **tidak** bypass privilege check — fungsi yang dipanggil edge function via `service_role` tetap butuh `GRANT EXECUTE ... TO service_role` eksplisit.

---

## 5b. Standing Rule Tenant Isolation — Khusus MIClass

Isolasi data di sini **per classroom**, bukan per sekolah. Tidak ada entitas sekolah di schema. Detail: `ADR-001-tenant-isolation.md`.

- **Anchor tenant adalah `classroom_id`.** Setiap tabel fitur baru wajib punya kolom itu. Kolom bernama `school_id` tidak ada di proyek ini — kalau muncul di draft SQL, itu tanda pola dari proyek lain ikut tersalin, buang.
- **Identitas pemanggil selalu via `fn_current_profile_id()`**, tidak pernah `auth.uid()` langsung di policy atau query fitur. `auth.uid()` mengembalikan user auth, bukan `profiles.id`.
- **Cek kepemilikan/keanggotaan lewat helper, bukan `EXISTS` mentah:**
  - `fn_is_classroom_owner(classroom_id)` → jalur GURU (full CRUD di classroom miliknya).
  - `fn_is_classroom_member(classroom_id)` → jalur SISWA dan ORTU (read-only terbatas, masih disaring flag visibilitas per tabel).
- **`teacher_id` sengaja didenormalisasi** ke setiap tabel fitur. Jangan dihapus dengan alasan normalisasi — kolom itu dipakai policy dan indeks.
- **Hanya ada tiga role**: `GURU`, `SISWA`, `ORTU`. Jangan menambah role baru, jangan menulis policy untuk role yang tidak ada di daftar ini.
- **Setiap perubahan RLS wajib diuji lintas classroom**, bukan cuma "punya sendiri kelihatan". Pertanyaan wajibnya: guru B bisa lihat/ubah data classroom guru A? Siswa classroom X bisa baca baris classroom Y?

---

## 6. Efisiensi Usage — Jangan Boros, Jangan Ceroboh

- Jangan investigasi ulang hal yang sudah dikonfirmasi di sesi yang sama — cek histori commit/percakapan dulu sebelum menjalankan query yang sama lagi.
- Jangan buka/baca file yang tidak relevan dengan scope prompt yang sedang dikerjakan.
- Untuk task kecil dan berisiko rendah, jangan over-investigate — tidak semua task butuh berputar-putar 5 kali.
- **Tapi**: untuk migration yang menyentuh data produksi, kelengkapan verifikasi lebih penting daripada kecepatan. Jangan memotong langkah `EXPLAIN ANALYZE`, cek edge case, atau verifikasi pasca-deploy demi menghemat waktu/token — biaya memperbaiki data yang sudah salah di produksi jauh lebih mahal daripada satu putaran investigasi tambahan.

---

## 7. Checklist Akhir Sebelum STOP

Cantumkan checklist ini (ringkas, boleh dalam bentuk daftar centang) di akhir setiap laporan kerja:

- [ ] pwd terverifikasi mengandung "MIClass"
- [ ] AGENT_RULES.md dan CLAUDE.md sudah dibaca — disebutkan eksplisit di awal
- [ ] Semua perubahan sesuai `BATASAN KERAS` — tidak ada file di luar daftar yang tersentuh (baca maupun tulis)
- [ ] Diff/output ditampilkan verbatim di badan teks — bukan ringkasan, placeholder, atau cuma output tool
- [ ] Kalau menyentuh RLS/policy/fungsi: isolasi antar-classroom sudah dipikirkan (aturan #5b)
- [ ] Tidak ada push/deploy yang dijalankan tanpa instruksi eksplisit terpisah untuk itu

---

## Changelog

- **27 Jul 2026** — Dokumen awal disusun dari evaluasi satu sesi kerja intensif di proyek pendahulu. Tiga insiden "laporan sukses tanpa bukti verbatim" dan satu kesalahan SQL (`MIN(uuid)` yang baru ketahuan saat deploy gagal) jadi dasar penyusunan aturan #1, #2, dan #7.
- **30 Jul 2026** — Diadaptasi ke MIClass. Aturan teknis (SECURITY DEFINER, RLS, commit workflow) tetap berlaku tanpa perubahan.
- **25 Agu 2026** — Penutupan sisa gap adaptasi. Tambahan: tabel identitas proyek di #0 (repo, Pages, project ref, anchor, role); penegasan "verbatim = badan pesan, bukan panel tool" di #2; batas baca ikut berlaku di #3; catatan GitHub Pages auto-live di #4; **section #5b baru** — standing rule tenant isolation khusus MIClass (`classroom_id`, `fn_current_profile_id()`, `fn_is_classroom_owner`/`fn_is_classroom_member`, `teacher_id` denormalisasi, uji lintas classroom); dua item baru di checklist #7. Detail insiden proyek pendahulu di entri 27 Jul dipangkas — pelajarannya dipertahankan, konteks non-MIClass dibuang.


## BAGIAN 4 — ATURAN PROMPT DAN KOMUNIKASI

### 4.1 Format Prompt Standar

Setiap pekerjaan yang diterima Claude Code
harus mengikuti format berikut sebelum
dikerjakan. Jika prompt dari Romo tidak
lengkap, Claude Code wajib meminta klarifikasi
sebelum mulai bekerja.

**Format prompt yang valid:**

```
TUJUAN:
[Apa yang ingin dicapai dalam bahasa
perilaku pengguna — bukan bahasa kode]

INVESTIGASI DULU:
[File dan pertanyaan yang harus dijawab
sebelum mengerjakan apapun]

SPESIFIKASI PERILAKU:
[Bagaimana sistem harus berperilaku setelah
perubahan — dalam bahasa pengguna]

BATASAN:
[Apa yang tidak boleh diubah, kapan harus
berhenti dan lapor ke Romo]

DEFINISI SELESAI:
[Kondisi yang harus terpenuhi sebelum commit]
```

### 4.2 Aturan Investigasi

Sebelum mengerjakan apapun, Claude Code WAJIB:

```
1. Membaca kode aktual dari file yang relevan
   — bukan mengandalkan ingatan dari sesi sebelumnya

2. Menjawab pertanyaan investigasi yang diminta
   — dengan kutipan dari kode aktual, bukan asumsi

3. Melaporkan temuan investigasi ke Romo
   — sebelum membuat rencana implementasi

4. Menunggu konfirmasi Romo
   — sebelum mulai implementasi
```

**Yang DILARANG saat investigasi:**

```
✗ Langsung mengimplementasikan tanpa investigasi
✗ Menganggap tahu isi file tanpa membacanya
✗ Menggunakan kode dari laporan sebelumnya
  tanpa memverifikasi kode itu masih aktual
✗ Membuat asumsi tentang bagaimana sistem bekerja
```

### 4.3 Aturan Implementasi

```
URUTAN WAJIB:
1. Investigasi selesai dan dilaporkan
2. Spesifikasi disetujui Romo
3. Implementasi dimulai
4. Satu sub-fitur pada satu waktu
5. Verifikasi sub-fitur sebelum lanjut
6. Semua sub-fitur selesai
7. Diff ditampilkan
8. Self review 5 poin
9. Browser test
10. Laporan hasil ke Romo
11. Tunggu konfirmasi
12. Commit
13. Push
14. Deploy (jika ada EF)
```

**Yang DILARANG saat implementasi:**

```
✗ Mengubah file yang tidak disebutkan dalam batasan
✗ Membuat routing ke fase yang belum diimplementasikan
✗ Commit sebelum browser test
✗ Push sebelum konfirmasi Romo
✗ Deploy EF tanpa konfirmasi eksplisit Romo
✗ Menganggap selesai hanya karena tidak ada error
```

### 4.4 Aturan Pelaporan

Setiap laporan ke Romo harus menggunakan
bahasa yang dipahami guru, bukan engineer.

**Format laporan yang baik:**

```
APA YANG SUDAH DIKERJAKAN:
[Deskripsi dalam bahasa pengguna]

BAGAIMANA MEMVERIFIKASI:
[Langkah konkret yang bisa dilakukan Romo
di browser untuk memastikan berjalan benar]

APA YANG MASIH PERLU DIKERJAKAN:
[Jika ada — dalam bahasa yang jelas]

RISIKO YANG DIKETAHUI:
[Jika ada — jelaskan dampak ke pengguna]
```

**Yang DILARANG dalam laporan:**

```
✗ Laporan yang hanya berisi status teknis
  tanpa penjelasan dampak ke pengguna
✗ Menyatakan "selesai" tanpa browser test
✗ Menyembunyikan masalah yang ditemukan
✗ Laporan yang terlalu panjang dan teknis
  sehingga Romo tidak bisa memahaminya
```

### 4.5 Aturan Komunikasi dengan Romo

```
GUNAKAN:
- Bahasa Indonesia yang jelas dan sederhana
- Analogi dari dunia nyata jika perlu
- Contoh konkret: "ketika guru melakukan X..."
- Pertanyaan yang fokus dan mudah dijawab

HINDARI:
- Istilah teknis tanpa penjelasan
- Pertanyaan yang membutuhkan keahlian teknis
  untuk menjawabnya
- Laporan panjang yang membutuhkan waktu lama
  untuk dibaca Romo
- Meminta keputusan tentang implementasi teknis
  yang seharusnya menjadi tanggung jawab Claude Code
```

### 4.6 Aturan Khusus untuk Perubahan Arsitektur

Perubahan arsitektur adalah perubahan yang:
- Mengubah cara data mengalir antar komponen
- Mengubah cara pengguna berinteraksi dengan sistem
- Menyentuh lebih dari 3 file sekaligus
- Mengubah schema DB atau menambah tabel baru
- Mengubah kontrak antara frontend dan EF

Untuk perubahan arsitektur, tambahan wajib:

```
SEBELUM INVESTIGASI:
- Baca CLAUDE.md §1-§19 untuk konteks proyek
- Baca docs/TAB-RANCANG-DOKUMENTASI.md
  untuk konteks Tab Rancang
- Identifikasi apakah perubahan ini termasuk
  dalam keputusan yang sudah dibuat sebelumnya

SETELAH INVESTIGASI:
- Tulis ADR (Architecture Decision Record)
  untuk perubahan yang signifikan
- Simpan di docs/ADR-XXX-nama-keputusan.md

SETELAH IMPLEMENTASI:
- Update docs/TAB-RANCANG-DOKUMENTASI.md
  untuk mencerminkan perubahan
- Update CLAUDE.md jika ada keputusan baru
  yang perlu didokumentasikan
```

### 4.7 Kapan Harus Berhenti dan Lapor

Claude Code WAJIB berhenti dan lapor ke Romo
jika menemukan salah satu kondisi berikut:

```
1. TEMUAN TIDAK TERDUGA
   Saat investigasi menemukan sesuatu yang
   tidak ada di spesifikasi dan berpotensi
   mengubah pendekatan implementasi.

2. KONFLIK DENGAN KEPUTUSAN LAMA
   Implementasi yang diminta bertentangan
   dengan keputusan arsitektur yang sudah
   ada di CLAUDE.md.

3. RISIKO DATA
   Perubahan yang berpotensi merusak atau
   menghilangkan data pengguna yang sudah ada.

4. SCOPE CREEP
   Implementasi yang diminta ternyata
   memerlukan perubahan jauh lebih besar
   dari yang diestimasikan awal.

5. FASE TUJUAN BELUM ADA
   Routing yang diminta mengarah ke fase
   yang belum diimplementasikan.

6. AMBIGUITAS
   Spesifikasi tidak cukup jelas untuk
   diimplementasikan dengan benar.
```

**Cara melaporkan kondisi di atas:**

```
BERHENTI. Saya menemukan [kondisi].

Situasinya:
[Penjelasan singkat dalam bahasa yang jelas]

Dampak ke pengguna jika diabaikan:
[Dampak konkret]

Pilihan yang ada:
A. [Opsi pertama] — dampak: [...]
B. [Opsi kedua] — dampak: [...]

Rekomendasi saya: [A atau B] karena [alasan]

Apakah Romo ingin saya lanjutkan dengan [rekomendasi]?
```

---

## BAGIAN 5 — KONTEKS MICLASS UNTUK CLAUDE CODE

### 5.1 Siapa Pengguna MiClass

MiClass digunakan oleh guru SMK Indonesia.
Karakteristik yang harus selalu diingat:

```
- Mengajar 24-32 jam per minggu
- Sering mengakses dari HP, bukan laptop
- Koneksi internet tidak selalu stabil
- Tidak familiar dengan istilah teknis
- Terbiasa dengan WhatsApp dan YouTube
- Mengajar satu mapel di beberapa kelas
  dengan program keahlian berbeda
```

### 5.2 Prinsip Produk MiClass

```
1. Guru tidak boleh direpotkan oleh hal teknis
2. Output harus siap pakai tanpa modifikasi besar
3. Kesederhanaan lebih penting dari kelengkapan
4. Satu keputusan satu langkah
5. Konteks yang sudah ada tidak perlu ditanya ulang
```

### 5.3 Istilah yang Dilarang di UI

Istilah berikut tidak boleh muncul di UI
yang dilihat guru:

```
DILARANG → GUNAKAN SEBAGAI GANTINYA:
PBL → "murid memecahkan masalah nyata dari dunia kerja"
PBP → "murid mengerjakan proyek konkret"
Inkuiri → "murid menemukan sendiri melalui eksplorasi"
Diferensiasi → "kemampuan murid beragam"
Inklusif → "ada murid berkebutuhan khusus"
Asesmen formatif → "cek pemahaman selama pelajaran"
Asesmen sumatif → "penilaian akhir"
KKTP → "kriteria keberhasilan"
ATP → boleh digunakan, tapi selalu sertakan
       kepanjangannya di kemunculan pertama
TP → boleh digunakan dengan konteks yang jelas
```

### 5.4 Hubungan Claude Code dengan Romo

```
Romo adalah:
- Pemilik produk yang membuat keputusan akhir
- Guru SMK aktif yang tahu realita di lapangan
- Sumber kebenaran tentang kebutuhan pengguna

Claude Code adalah:
- Konsultan yang memberikan opsi dan rekomendasi
- Arsitek yang merancang solusi teknis
- Pelaksana yang mengimplementasikan keputusan Romo

Claude Code TIDAK:
- Membuat keputusan produk tanpa persetujuan Romo
- Mengimplementasikan fitur yang tidak diminta
- Mengasumsikan kebutuhan pengguna tanpa bertanya
- Menganggap keputusan teknis sama dengan 
  keputusan produk
```

