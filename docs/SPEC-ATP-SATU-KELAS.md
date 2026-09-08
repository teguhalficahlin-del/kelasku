# SPEC — Satu ATP untuk satu kelas

> **Status: MENUNGGU PERSETUJUAN ROMO.** Belum ada satu baris kode pun yang
> disentuh. Ditulis 8 September 2026, HEAD `4cbc1e6`.
>
> **KLASIFIKASI SPRINT**
> - Tipe: **Campuran** (Migration DB + Edge Function + JS)
> - Auto-execute FASE 4: **TIDAK** — berhenti setelah FASE 3, tunggu Romo

---

## 1. Keputusan Romo yang dikerjakan

1. **Tidak ada ATP induk. Satu ATP = satu kelas.**
2. **Pertanyaan jumlah murid harus ada di level generate ATP dan memengaruhi
   SYSTEM_PROMPT.**

Sesudahnya: perbaiki cacat potret profil kelas, lalu **ulangi verifikasi
Tahap 3** dengan benar.

---

## 2. Kenapa ini bukan sekadar preferensi — bukti dari basis data

| Yang diukur | Hasil |
|---|---|
| `atp_induk` yang dipakai lebih dari satu kelas | **0 dari 19** |
| `atp_adaptasi` | 7 baris |
| `atp_induk` tanpa kelas sama sekali (draf terbengkalai) | 12 |
| `modul_induk` yang ATP-nya tidak punya kelas | **0 dari 8** |
| `modul_adaptasi` | **0 baris** |

Lapisan kedua dibangun untuk satu tujuan: satu ATP dipakai ulang di banyak
kelas. **Tujuan itu tidak pernah sekali pun terjadi.** Yang ada hanyalah
biayanya: dua tabel, dua status, dua jalur tulis, dan satu kelas cacat yang
lahir langsung darinya (§3).

Lebih dari itu, `atp_induk` melanggar prinsip yang ditulis CLAUDE.md §3 sendiri:
**tenant anchor MIClass adalah `classroom_id`.** `atp_induk` tidak punya kolom
itu; isolasinya bersandar pada `guru_id`. Keputusan Romo justru mengembalikan
tabel ini ke arsitektur yang sudah tertulis.

---

## 3. Cacat yang lahir dari lapisan kedua

`generate-atp` tidak bisa membaca `rancang_settings` — tabel itu ber-`classroom_id`,
sementara `atp_induk` sengaja tidak punya. Jalan keluarnya dulu: **memotret**
profil kelas ke `collected_data.PROFIL_KELAS` saat funnel berjalan.

Potret itu tidak pernah terjadi. Fase Profil Kelas dilewati untuk kelas yang
sudah menjawab — jalur pintasnya keluar **sebelum** penyimpanan:

```js
if (lengkap) {
  await startPhase(getNextPhase('PROFIL_KELAS'));
  return;                      // ← keluar sebelum persistCompletedPhase
}
```

**Nol ATP di produksi punya `PROFIL_KELAS` di `collected_data`.** Akibatnya
terbalik dari yang dimaksudkan: justru kelas yang SUDAH menjawab yang datanya
hilang.

Konsekuensi yang harus dinyatakan terang: **verifikasi Tahap 3 tanggal
8 September 2026 adalah hasil yang keliru.** "0 dari 12 TP menuntut video"
memang benar terjadi, tapi bukan karena aturan perlengkapan bekerja —
`perlengkapan_tersedia` dikirim `null`, aturannya tidak pernah menyala.
Yang terjadi kebetulan, dan dilaporkan sebagai bukti.

Jalur Modul **tidak** terdampak: `perlengkapan_kelas` tersimpan benar di
`collected_data.SUMBER_STRATEGI` (terverifikasi langsung di basis data).

> Sesudah ATP menjadi per kelas, `generate-atp` membaca `rancang_settings`
> langsung lewat `classroom_id`. **Potret tidak diperlukan lagi**, dan seluruh
> kelas cacat ini hilang di akarnya — bukan ditambal.

---

## 4. Perilaku sesudah perubahan — dari sisi guru

**Sebelum.** Guru menyusun ATP. Di balik layar ATP itu disimpan sebagai dua
baris: satu "induk" yang tidak tahu kelas mana, satu "adaptasi" yang tahu.
Perlengkapan dan jumlah murid kelasnya tidak pernah sampai ke penyusun ATP,
sehingga ATP bisa melahirkan TP yang menuntut alat yang tidak ia punya.

**Sesudah.** Guru tidak melihat perbedaan apa pun di layar — alurnya sama
persis. Yang berubah: ATP-nya kini **milik satu kelas**, dan penyusunnya tahu
kelas itu punya berapa murid dan alat apa. TP yang menuntut proyektor tidak
akan muncul untuk kelas tanpa proyektor, dan bentuk kegiatan menyesuaikan
jumlah murid.

**Yang hilang:** kemampuan memakai ulang satu ATP di beberapa kelas. Kemampuan
itu tidak pernah dipakai (0 dari 19), dan guru tidak pernah melihat tombolnya.

---

## 5. Rancangan teknis

### 5a. Basis data

`atp_induk` mendapat `classroom_id uuid REFERENCES classrooms(id)`.

- **Backfill** dari `atp_adaptasi` untuk 7 baris yang punya kelas.
- 12 baris draf terbengkalai tidak punya kelas → lihat Keputusan B (§7).
- `NOT NULL` **belum** dipasang di migration pertama — dipasang di migration
  kedua setelah data bersih. Memasangnya sekaligus akan menggagalkan migration
  karena 12 baris itu.
- RLS diganti: `guru_id = fn_current_profile_id()` → **`fn_is_classroom_owner(classroom_id)`**,
  menyamakan tabel ini dengan seluruh tabel fitur lain.
- `atp_adaptasi` **TIDAK di-drop di sprint ini.** Kode berhenti menulis ke sana,
  tabelnya ditinggalkan apa adanya. Drop menyusul di sprint terpisah setelah
  terbukti tidak ada yang rusak. *(Sudah diperiksa: seluruh isi `atp_adaptasi`
  juga ada di `atp_induk.collected_data` — tidak ada data unik yang hilang. Tapi
  "sudah diperiksa" bukan alasan menghapus lebih cepat dari perlunya.)*

### 5b. Nama tabel

Nama `atp_induk` menjadi keliru begitu ia per kelas. **Rekomendasi: JANGAN
diganti di sprint ini.** Mengganti nama tabel menyentuh ~86 rujukan di 6 berkas
sekaligus dengan perubahan makna — dua kelas risiko dalam satu langkah. Ganti
nama adalah sprint kosmetik tersendiri yang bisa dijalankan kapan saja tanpa
mengubah perilaku. Komentar di migration mencatat kenapa namanya begitu.

### 5c. `generate-atp`

- Menerima `classroom_id`, membaca `rancang_settings` langsung.
- `jumlah_murid` masuk ke `userMessage` **dan** SYSTEM_PROMPT mendapat aturan
  baru: bentuk kegiatan di TP harus bisa dijalankan dengan jumlah murid itu.
- `perlengkapan_tersedia` dibaca dari `rancang_settings`, bukan dari potret.
  Jalur mundur ke `collected_data.PROFIL_KELAS` dipertahankan untuk ATP lama.

### 5d. Klien

- Berhenti menulis `atp_adaptasi`; `classroom_id` ditulis ke ATP saat draf dibuat.
- Pemilih ATP menyaring per kelas.
- Potret `PROFIL_KELAS` **tetap dipasang** (memperbaiki §3) — bukan sebagai
  sumber utama lagi, melainkan sebagai catatan sejarah: atas dasar apa ATP ini
  disusun, sekalipun kelasnya berganti proyektor besok.

---

## 6. Verifikasi yang akan dijalankan (FASE 2 menuntut ini konkret)

1. `BEGIN … ROLLBACK` untuk migration, dengan hitungan baris sebelum/sesudah.
2. Susun ATP baru lewat alur guru untuk kelas X TB (proyektor + speaker,
   **tanpa internet**, 10 murid).
3. **Bukti langsung, bukan kebetulan:** periksa `collected_data` ATP baru berisi
   `PROFIL_KELAS`, DAN periksa di log/`userMessage` bahwa `perlengkapan_tersedia`
   dan `jumlah_murid` benar-benar terisi — inilah yang tidak diperiksa 8 September.
4. Baru sesudah itu: nol TP yang menuntut video/internet, `sum(jp_alokasi)`
   sama dengan `jp_operasional`, nol TP di luar kelipatan satuan pertemuan.
5. Modul lama (8 baris) tetap terbuka dan terunduh sebagai .docx.

---

## 7. Yang perlu Romo putuskan sebelum saya mulai

**Keputusan A — nama tabel.** Setuju `atp_induk` dipertahankan namanya di sprint
ini, ganti nama menyusul sebagai sprint terpisah? *(Rekomendasi: ya.)*

**Keputusan B — 12 draf ATP terbengkalai** yang tidak punya kelas. Dihapus, atau
ditinggalkan dengan `classroom_id` kosong? *(Rekomendasi: hapus. Semuanya draf
uji yang tidak pernah diterima guru, dan nol modul bergantung padanya.)*

**Keputusan C — `atp_adaptasi`.** Setuju ditinggalkan dulu, tidak di-drop di
sprint ini? *(Rekomendasi: ya.)*
