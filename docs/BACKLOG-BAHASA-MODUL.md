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
