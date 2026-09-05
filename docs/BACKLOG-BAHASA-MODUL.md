# BACKLOG — Bahasa manusia di Modul Ajar & Naskah Fasilitasi

> **Status:** belum dikerjakan. Ditulis 5 September 2026 setelah audit langsung di
> aplikasi produksi. Dokumen ini sengaja dibuat berdiri sendiri: sesi Claude Code
> mana pun bisa mengerjakannya tanpa konteks percakapan sebelumnya.
>
> **HEAD saat audit:** `87d793c` · Edge Function `generate-modul` versi 51.

---

## 1. Masalahnya dalam satu kalimat

Modul Ajar dan Naskah Fasilitasi masih memuat kata-kata mesin — nama variabel, enum,
dan istilah teknis internal — yang bocor ke dokumen yang dicetak dan dibawa guru ke
kelas. Sebagian bahkan **salah menyebut pilihan guru sendiri**.

Permintaan Romo: seluruh redaksi harus bahasa manusia yang dikenal guru.

---

## 2. TEMUAN KRITIS — kerjakan lebih dulu, ini bukan kosmetik

Klien menyimpan **kunci opsi**, bukan labelnya. Kunci itu dikirim ke AI dan disalin
apa adanya ke modul. Celakanya, beberapa kunci **tidak menggambarkan opsinya**:

```js
// guru/js/rancang-chat-flow.js:362-368
['pbl',             'Murid mengerjakan proyek konkret… (berbasis proyek)'],
['kolaboratif',     'Murid memecahkan masalah nyata… (berbasis masalah)'],  // kunci != makna
['campuran',        'Murid belajar di konteks dunia kerja (kontekstual)'],  // kunci != makna
['inquiry',         'Murid menemukan sendiri… (inkuiri)'],
['ceramah_diskusi', 'Guru menjelaskan, murid berlatih… (langsung)'],
```

Akibatnya, terverifikasi di database per 5 September 2026:

| TP | Guru memilih | Yang tertulis di modul | |
|----|--------------|------------------------|---|
| 2  | inkuiri              | "berbasis penemuan mandiri"    | ok |
| 3  | **kontekstual**      | "Pembelajaran **terpadu**"     | **SALAH** |
| 5  | berbasis proyek      | "berbasis proyek (PBL)"        | ok |
| 6  | **berbasis masalah** | "Pembelajaran **kolaboratif**" | **SALAH** |

Guru yang memilih "murid memecahkan masalah nyata dari dunia kerja" menerima modul
yang mendeskripsikan pembelajaran kolaboratif. Setengah dari modul yang ada salah
menggambarkan rancangan gurunya sendiri.

Hal yang sama terjadi pada teknik asesmen: `teknik_diagnostik = "pemetaan_awal"` dan
`teknik_sumatif = "unjuk_kerja"` masuk mentah ke modul.

---

## 3. Tahap 1 — Kebocoran identifier di renderer (klien saja, tanpa deploy)

Semua di `guru/js/rancang-chat.js`. Berlaku surut ke seluruh modul lama begitu
di-push, tanpa generate ulang.

### 3a. Jenis instrumen tampil mentah

Baris **2294**: `<span class="mv4-ins-jenis">[${esc(ins.jenis ?? '-')}]</span>`
Guru membaca `PBL-01 [teks_autentik]`.

Tambahkan peta, pakai di situ:

| `jenis` | tampilkan sebagai |
|---|---|
| `dialog_baseline` | Contoh percakapan (awal) |
| `dialog_model` | Contoh percakapan |
| `teks_autentik` | Teks nyata dari dunia kerja |
| `kartu_peran` | Kartu bermain peran |
| `pemetaan_awal` | Pemetaan kemampuan awal |
| `matriks_observasi` | Lembar pengamatan |
| `lembar_refleksi` | Lembar refleksi |
| `soal_latihan` | Soal latihan |
| `lembar_praktikum` | Lembar praktik |
| `panduan_proyek` | Panduan proyek |
| `custom` | Lainnya |

### 3b. Nama langkah `ASESMEN_AWAL`

Muncul di **kedua tab**. Peta `LABEL_LANGKAH` **sudah ada** di baris ~2796, tapi
terkurung di jalur render lama berbasis bubble (`rcAppendBubble`) dan tidak dipakai
`_renderModulPreviewV400` maupun renderer naskah. **Naikkan ke scope bersama, lalu
pakai di ketiga tempat.** Nilainya sekalian diperbaiki:

| enum | tampilkan sebagai |
|---|---|
| `PEMBUKA` | Pembuka |
| `ASESMEN_AWAL` | Cek Kemampuan Awal |
| `MEMAHAMI` | Memahami |
| `MENGAPLIKASI` | Menerapkan |
| `MEREFLEKSI` | Refleksi |
| `PENUTUP` | Penutup |

Enum yang sama juga muncul lewat `fase_langkah` (baris **2473**) dan `placement.fase`
(baris **2489**) — keduanya harus lewat peta ini.

### 3c. Label yang terlalu teknis

| Baris | Sekarang | Ganti jadi |
|---|---|---|
| 2489 | `Placement` (nilai `P4 · MENGAPLIKASI`) | `Waktu Pelaksanaan` (nilai `Pertemuan 4 · tahap Menerapkan`) |
| 2363 | `Entitas` | `Sumber` |
| 2366 | `Fokus Amati` | `Yang Diamati` |

---

## 4. Tahap 2 — Kirim label, bukan kunci (klien + EF, perlu deploy)

Memperbaiki TEMUAN KRITIS di bagian 2 sekaligus menghentikan `teknik` mentah dari
sumbernya.

**Cara:** sebelum nilai jawaban dikirim ke EF, petakan kunci ke frasa manusiawi
ringkas. Jangan kirim label panjang versi chat — terlalu bertele-tele untuk dokumen.

| kunci | kirim sebagai |
|---|---|
| `ceramah_diskusi` | pembelajaran langsung |
| `pbl` | berbasis proyek |
| `inquiry` | inkuiri |
| `kolaboratif` | berbasis masalah |
| `campuran` | kontekstual |
| `pemetaan_awal` | pemetaan awal |
| `tanya_jawab` | tanya jawab lisan |
| `observasi_awal` | observasi |
| `tes_tertulis` | tes tertulis |
| `unjuk_kerja` | unjuk kerja |
| `proyek` | proyek / produk |
| `praktikum` | praktikum |
| `presentasi` | presentasi |

Titik masuk di `supabase/functions/generate-modul/index.ts`: `teknikDiagnostik` /
`teknikSumatif` (deklarasi baris ~1091–1094, dipakai di ~1128 dan ~1131) dan
`cd.SUMBER_STRATEGI`.

**Peringatan:** jangan mengubah kunci yang sudah tersimpan di `collected_data` milik
modul lama. Cukup terjemahkan saat menyusun prompt, supaya data lama tidak rusak.

---

## 5. Tahap 3 — Larangan jargon di SYSTEM_PROMPT (EF, perlu deploy)

Prosa AI sebenarnya sudah cukup manusiawi: "murid" 60x, "peserta didik" 0x, dan
Ucapan Guru terdengar seperti guru sungguhan. Sisa jargonnya sedikit dan semuanya di
Aksi Guru, bukan di kalimat yang diucapkan ke murid.

| istilah | jumlah | ganti dengan |
|---|---|---|
| "asesmen formatif" / "asesmen sumatif" | 2x | "cek pemahaman di tengah pembelajaran" / "penilaian akhir" |
| "dukungan terstruktur" / "terstruktur" | 8x | "pendampingan bertahap" |
| "diferensiasi" / "didiferensiasi" | TP 2 dan TP 3 | "menyesuaikan dengan kemampuan murid" |
| "PBL" | di Strategi | "berbasis proyek" |
| "autentik" | 6x | "nyata" / "dari dunia kerja" |
| "kondusif", "ketercapaian", "teridentifikasi", "memfasilitasi", "esensial" | 6x | padanan sehari-hari |

Efeknya baru terukur pada generate berikutnya — lihat cara verifikasi di bagian 8.

---

## 6. Keputusan yang SUDAH diambil — jangan diperdebatkan ulang

**Istilah resmi Kurikulum Merdeka TETAP DIPAKAI di dokumen modul:** Capaian
Pembelajaran, Tujuan Pembelajaran, KKTP, asesmen, Elemen CP, Fase.

CLAUDE.md §23.2 melarang istilah-istilah itu, dan untuk **pertanyaan di chat**
larangan itu tepat. Tapi modul ajar adalah dokumen resmi yang guru cetak, arsipkan,
dan kadang diperiksa pengawas. Menghapus "Capaian Pembelajaran" dari dokumen itu
justru membuatnya terlihat tidak sah di mata guru.

Aturannya: **buang istilah teknis kita sendiri, pertahankan istilah resmi kurikulum.**

`K3` juga dipertahankan — kosakata kejuruan yang dikenal setiap guru SMK.

---

## 7. Yang TIDAK boleh dikerjakan

**Jangan mengganti prefiks ID instrumen `PBL-` / `ASM-`.** Di kode ini `PBL` berarti
"Pembelajaran", bukan Problem-Based Learning — tabrakan makna yang memang
disayangkan. Tapi ID itu dipakai sebagai rujukan silang di naskah ("lembar autentik
PBL-01"), disebut di `SYSTEM_PROMPT` (baris ~853, 879, 924, 1139), divalidasi
validator, dan tersimpan di seluruh modul lama. Menggantinya menyentuh manifest,
validator, prompt, renderer, dan data lama sekaligus — perubahan besar demi
keuntungan kecil. Kerjakan terpisah hanya kalau Romo memintanya secara eksplisit.

---

## 8. Cara memverifikasi

**Tahap 1** — sisi klien, langsung terlihat. Muat ulang `guru/classroom.html`, buka
Tab Rancang → Modul Ajar Aktif → TP mana pun, lalu di konsol:

```js
const t = document.querySelector('.mv4-panel').innerText;
[...new Set([...t.matchAll(/\b[a-z]{2,}_[a-z_]{2,}\b/g)].map(m => m[0]))];    // harus []
[...new Set([...t.matchAll(/\b[A-Z]{3,}(?:_[A-Z]{2,})+\b/g)].map(m => m[0]))]; // harus []
```

Ulangi untuk panel kedua (Naskah Fasilitasi).

**Tahap 2** — perlu satu generate baru. Bandingkan pilihan guru dengan isi modul:

```sql
SELECT nomor_tp,
       collected_data->'SUMBER_STRATEGI'->'strategi_utama'->>'value' AS kunci,
       left(konten->'rancangan'->>'strategi_pedagogis', 120)          AS tertulis
FROM public.modul_induk
WHERE konten->>'schema_version' = '4.0.0' ORDER BY nomor_tp;
```

**Tahap 3** — perlu satu generate baru; hitung istilah pada tabel bagian 5 di
`konten` hasilnya.

**Catatan hemat kuota:** batas generate 5x per hari per kelas. Fase A idempoten —
kalau `_draft.fase_a` sudah ada, tombol "Coba Lagi" **tidak memakan jatah**, jadi
modul yang gagal di tengah bisa diulang gratis.

---

## 9. Gate

- Tahap 1 = JS saja → Mode C tipe JS/HTML, boleh commit + push otomatis bila semua
  gate lulus.
- Tahap 2 dan 3 menyentuh Edge Function → **STOP setelah FASE 3, tunggu konfirmasi
  Romo** sebelum
  `supabase functions deploy generate-modul --project-ref teccdzetrdjowqemnuuc`.
- Jalankan `deno check supabase/functions/generate-modul/index.ts` sebelum deploy —
  esbuild tidak type-check, dan `ReferenceError` yang lolos muncul di browser sebagai
  kegagalan CORS.
- Naikkan nomor versi cache di `guru/classroom.html` setiap berkas JS berubah.

---

## 10. Prompt siap pakai

Tiga prompt di bawah ditulis untuk ditempel apa adanya ke sesi Claude Code baru.
Satu prompt = satu sesi. **Kerjakan berurutan A → B → C.** Urutan ini disengaja:
Prompt A memperbaiki isi modul yang keliru, B dan C hanya memperbaiki redaksi.

Setiap prompt memuat perintah untuk **membuktikan sendiri temuannya sebelum
mengubah apa pun**. Itu bukan formalitas: dokumen ini ditulis pada 5 September 2026,
dan kalau kode atau data sudah berubah sejak itu, bukti di lapangan yang menang —
bukan tulisan di sini.

---

### PROMPT A — Tahap 2: kunci opsi bocor ke modul (kerjakan pertama)

```
Repo MIClass. Kerjakan Tahap 2 dari docs/BACKLOG-BAHASA-MODUL.md.

Masalahnya: klien menyimpan kunci opsi (bukan labelnya), kunci itu dikirim ke AI,
dan AI menyalinnya apa adanya ke modul ajar. Beberapa kunci tidak menggambarkan
opsinya — 'kolaboratif' sebenarnya berarti "berbasis masalah", 'campuran' berarti
"kontekstual". Akibatnya modul TP 3 dan TP 6 salah menyebut strategi yang dipilih
gurunya sendiri. Ini bukan cacat kosmetik: isi modulnya keliru.

Sebelum menyentuh kode:
1. Jalankan /sip-start.
2. Baca docs/BACKLOG-BAHASA-MODUL.md seluruhnya. Bagian yang mengikat: 2 (temuan),
   4 (yang dikerjakan), 6 (keputusan yang sudah diambil), 7 (larangan), 8
   (verifikasi), 9 (gate).
3. Baca AGENT_RULES.md bagian "4b. Mode C — Sprint Fix" dan ikuti Fase 0-4.
4. BUKTIKAN DULU temuannya sendiri dengan query SQL di bagian 8. Jangan percaya
   dokumen ini begitu saja. Kalau bukti di database bertentangan dengan yang
   tertulis, ikuti bukti dan laporkan bedanya sebelum lanjut.

Klasifikasi sprint: Campuran (klien + Edge Function).
Auto-execute FASE 4: TIDAK — berhenti setelah FASE 3, tunggu konfirmasi Romo.

Yang dikerjakan: terjemahkan kunci opsi menjadi frasa manusiawi saat menyusun
prompt ke AI, memakai tabel pemetaan di bagian 4. Jangan mengubah kunci yang sudah
tersimpan di collected_data modul lama — data lama harus tetap terbaca.

Selesai bila:
- deno check supabase/functions/generate-modul/index.ts lolos
- tidak ada kunci opsi mentah yang bisa sampai ke prompt AI (tunjukkan buktinya)
- diff ditampilkan verbatim dan Self Review 5 Poin lulus

Sesudah commit: STOP. Deploy Edge Function dan git push menunggu izin Romo.
Verifikasi akhir butuh satu generate baru — usulkan ke Romo, jangan jalankan
sendiri tanpa izin. Kuota 5x per hari per kelas.
```

---

### PROMPT B — Tahap 1: identifier mentah di layar

```
Repo MIClass. Kerjakan Tahap 1 dari docs/BACKLOG-BAHASA-MODUL.md.

Masalahnya: nama enum dan identifier internal bocor ke Modul Ajar dan Naskah
Fasilitasi yang dicetak guru — jenis instrumen tampil sebagai [teks_autentik],
nama langkah sebagai ASESMEN_AWAL, fase sebagai MENGAPLIKASI, dan ada label
"Placement", "Entitas", "Fokus Amati".

Sebelum menyentuh kode:
1. Jalankan /sip-start.
2. Baca docs/BACKLOG-BAHASA-MODUL.md bagian 3 (yang dikerjakan, lengkap dengan
   nomor baris dan tabel pemetaan), 6 (keputusan yang sudah diambil), 7 (larangan),
   8 (verifikasi), 9 (gate).
3. Baca AGENT_RULES.md bagian "4b. Mode C — Sprint Fix" dan ikuti Fase 0-4.
4. BUKTIKAN DULU: buka modul mana pun di browser dan jalankan dua cuplikan konsol
   di bagian 8. Nomor baris di dokumen berasal dari 5 September 2026 — kalau kode
   sudah bergeser, cari lokasi sebenarnya, jangan menambal berdasarkan nomor baris
   yang sudah basi.

Klasifikasi sprint: JS/HTML only (guru/js/rancang-chat.js + guru/classroom.html).
Auto-execute FASE 4: YA — commit dan push otomatis bila semua gate lulus.

Perhatian khusus: peta LABEL_LANGKAH sudah ada di rancang-chat.js sekitar baris
2796, tapi terkurung di jalur render lama berbasis bubble. Naikkan ke scope
bersama dan pakai di ketiga tempat (renderer V4.0, renderer naskah, jalur lama) —
jangan membuat peta kedua yang nanti menyimpang sendiri.

Selesai bila:
- node --check guru/js/rancang-chat.js lolos
- dua cuplikan konsol di bagian 8 mengembalikan array kosong, untuk KEDUA tab,
  diuji pada minimal dua modul berbeda
- tab Naskah Fasilitasi tidak berubah selain nama langkah (tidak boleh ada regresi)
- nomor versi cache di guru/classroom.html dinaikkan
- diff verbatim + Self Review 5 Poin

Perubahan ini berlaku surut ke semua modul lama tanpa generate ulang. Buktikan
dengan membuka modul yang dibuat sebelum perubahan.
```

---

### PROMPT C — Tahap 3: larangan jargon di prompt AI

```
Repo MIClass. Kerjakan Tahap 3 dari docs/BACKLOG-BAHASA-MODUL.md.

Masalahnya: prosa AI di Modul Ajar dan Naskah Fasilitasi masih memuat jargon
pedagogis yang tidak dipakai guru sehari-hari — "asesmen formatif", "dukungan
terstruktur", "diferensiasi", "PBL", "autentik", "kondusif", "ketercapaian".

Sebelum menyentuh kode:
1. Jalankan /sip-start.
2. Baca docs/BACKLOG-BAHASA-MODUL.md bagian 5 (daftar istilah dan gantinya),
   6 (keputusan yang sudah diambil), 7 (larangan), 8 (verifikasi), 9 (gate).
3. Baca AGENT_RULES.md bagian "4b. Mode C — Sprint Fix" dan ikuti Fase 0-4.
4. BUKTIKAN DULU: hitung sendiri istilah-istilah itu pada modul yang ada, jangan
   memakai angka di dokumen. Kalau sebuah istilah ternyata sudah tidak muncul,
   jangan menambahkan larangannya — prompt yang membengkak tanpa alasan hanya
   menambah beban token.

Klasifikasi sprint: Edge Function (SYSTEM_PROMPT di generate-modul).
Auto-execute FASE 4: TIDAK — berhenti setelah FASE 3, tunggu konfirmasi Romo.

Jangan melarang istilah resmi Kurikulum Merdeka. Baca bagian 6 sebelum menyusun
daftar larangan: CP, TP, KKTP, asesmen, Elemen CP, Fase, dan K3 TETAP DIPAKAI.
Yang dilarang hanya jargon teknis kita sendiri.

Selesai bila:
- deno check supabase/functions/generate-modul/index.ts lolos
- daftar larangan tertulis di SYSTEM_PROMPT beserta frasa penggantinya, bukan
  sekadar "hindari bahasa teknis"
- diff verbatim + Self Review 5 Poin

Sesudah commit: STOP. Deploy dan push menunggu izin Romo. Efek perubahan ini baru
terukur pada generate berikutnya — usulkan satu generate uji ke Romo, lalu hitung
ulang istilahnya pada hasil baru itu. Jangan mengklaim selesai sebelum angka itu
ada.
```
