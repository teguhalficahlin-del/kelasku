# MODULE M1 — TP SNAPSHOT IDENTITY + MODULE-SCOPED KKTP AUTHORITY

**Tanggal:** 10 September 2026
**Baseline:** commit `8b3a17a` — ATP ACCEPTED
**Contract:** `docs/MODULE-NASKAH-CONTRACT-LOCK.md` (ACCEPTED)
**Lingkup:** M1 saja. M2–M9 tidak dikerjakan.
**Belum di-commit** — menunggu penerimaan reviewer (§19).

---

## A. BASELINE

```
$ git log -1 --oneline
8b3a17a feat: finalize contextual ATP generation
$ git status --short   (berkas terlacak)
(bersih sebelum pekerjaan ini dimulai)
```

Regresi awal sebelum menyentuh apa pun: ATP 60 passed / 0 failed, sinkron acuan
LULUS, jejak SPEC LULUS.

---

## B. REPRODUCED BLOCKER

Diverifikasi ulang pada sumber sekarang, bukan dari nomor baris lama.

### B.1 KKTP tanpa ikatan ke TP

`supabase/functions/generate-modul/index.ts`, sebelum M1:

```ts
  // 6. BACA tp_kktp
  const { data: kktp, error: kktpErr } = await userClient
    .from('tp_kktp')
    .select('id, judul, konten, batas_bawah, batas_atas')
    .eq('classroom_id', classroom_id)
    .eq('tipe', 'KKTP')
    .eq('is_active', true)
    .order('urutan', { ascending: true });
```

Tidak ada `parent_id`, `nomor_tp`, `atp_induk_id`, `mapel`, maupun `semester` —
padahal kelimanya ada di tabel itu. Seluruh KKTP kelas diserahkan sebagai KKTP
milik TP ini.

### B.2 Ikatan Modul ke ATP hanya nomor

`supabase/migrations/20260829000001_modul-dua-lapis.sql`:

```sql
CREATE TABLE IF NOT EXISTS public.modul_induk (
  atp_induk_id  uuid NOT NULL REFERENCES public.atp_induk(id) ON DELETE CASCADE,
  nomor_tp      int  NOT NULL,
  tp_judul      text NOT NULL,
  …
```

### B.3 ATP menimpa TP di baris yang sama

`supabase/functions/generate-atp/index.ts`:

```ts
  const updatePayload = {
    progresi_tp: progresiTp,
    collected_data: { ...cd, ATP_HASIL: atpHasil },
  };
  …
  await userClient.from('atp_induk').update(updatePayload).eq('id', atp_induk_id)
```

`atp_induk_id` tidak berubah; `nomor_tp` tetap resolve — ke TP yang berbeda.

### B.4 Klien menerima nomor sebagai identitas

`guru/js/rancang-chat.js`, sebelum M1:

```js
const tp = (atpFull.progresi_tp || []).find(function (t) { return t.nomor === modul.nomor_tp; });
_chat.selected_tp = tp || { nomor: modul.nomor_tp, judul: modul.tp_judul };
```

Blocker §P **terkonfirmasi utuh** pada sumber sekarang.

---

## C. CANONICAL TP ANCHOR

Berkas baru `supabase/functions/generate-modul/anchor.ts` — **murni**: tidak
menyentuh jaringan, database, maupun `Deno.env`, sehingga dapat diimpor uji apa
adanya.

```ts
export type TpAnchor = {
  atp_induk_id, nomor_tp, tp_judul,
  tuntutan[], kategori_teks[],
  semester, jp_alokasi, jp_pertemuan[],
  versi_cp,
};
```

Nama field mengikuti **field yang benar-benar ada** di ATP yang diterima
(`TpEntry` di `generate-atp/kontrak.ts` dan `ATP_HASIL.acuan_cp.versi_cp`).
Tidak ada kebenaran kembar yang dikarang untuk M1.

Seluruh isinya dibangun `bangunTpAnchor()` dari **baris ATP sisi server**.
Klien tidak pernah menjadi otoritas.

`bangunTpAnchor()` mengembalikan `null` bila nomor TP tidak ada lagi di
`progresi_tp` — Modul yatim. Itu ditangani sebagai konflik, bukan ditambal
dengan judul lama yang tersimpan.

---

## D. HASH CONTRACT

**Sembilan field, urutan tetap, terdokumentasi di `FIELD_HASH`:**

| Field | Perlakuan |
|---|---|
| `atp_induk_id` | apa adanya |
| `nomor_tp` | angka |
| `tp_judul` | NFC, spasi beruntun jadi satu, dipangkas |
| `tuntutan[]` | **DISORTIR** — himpunan, urutan tidak bermakna |
| `kategori_teks[]` | **DISORTIR** — himpunan, urutan tidak bermakna |
| `semester` | angka atau null |
| `jp_alokasi` | angka atau null |
| `jp_pertemuan[]` | **TIDAK DISORTIR** — urutannya adalah rancangan pertemuan |
| `versi_cp` | teks atau null |

**Sengaja di luar hash:** `konteks`, `catatan`, `elemen`, dan `tipe` warisan.
Ketiganya keterangan yang dapat berubah tanpa mengubah apa yang dituntut dari
murid; memasukkannya berarti menghentikan Modul karena suntingan redaksi.

Hash **tidak pernah** berasal dari nomor atau judul saja — judul dapat dipoles
sementara tuntutannya diganti diam-diam, dan itu justru perubahan paling
berbahaya bagi Modul yang sudah jadi.

Bentuk kanonik = `JSON.stringify` atas array pasangan `[key, value]` berurutan
tetap; `kanonikAnchor()` melempar bila daftarnya menyimpang dari `FIELD_HASH`.
Hash = SHA-256 heksadesimal atasnya.

Bukti nyata:

```
kanonik: [["atp_induk_id","atp-1"],["nomor_tp",5],["tp_judul","Menyimak dialog
          pelayanan butik dan memahami gagasan utama"],["tuntutan",["BIE-E25-MB-1", …
hash                     : 454416d2661b356a53064d76c5141643def44c3ea767e4d131ed56464cc5d747
urutan tuntutan dibalik  : 454416d2661b356a53064d76c5141643def44c3ea767e4d131ed56464cc5d747   ← sama
kategori_teks dikurangi  : 4b124da6e0a5cfb23994646711caa90253977add86cc77c1c9bf39fddf1f40d8   ← berbeda
```

**Mengapa snapshot hash, bukan id TP lintas regenerasi.** Keduanya menjawab
pertanyaan berbeda. Id lintas regenerasi menjawab "apakah ini TP yang sama?" —
pertanyaan yang tidak punya jawaban jujur, sebab TP nomor 5 sesudah penyusunan
ulang bisa kemampuan yang sama sekali lain. Snapshot hash menjawab "apakah ini
potret TP yang persis dipakai Modul ini?" — dan itu selalu dapat dijawab pasti.

---

## E. MIGRATION

`supabase/migrations/20260910000001_modul-tp-snapshot-hash.sql`

```sql
ALTER TABLE public.modul_induk
  ADD COLUMN IF NOT EXISTS tp_snapshot_hash text;
```

- **Additif.** Tidak ada DROP, DELETE, UPDATE, perubahan constraint, maupun
  perubahan RLS. Kolom nullable tanpa default, jadi seluruh INSERT/UPDATE yang
  sudah ada tetap sah.
- **Tidak ada index.** Kolom ini hanya dibaca lewat baris yang sudah ditemukan
  lebih dulu (primary key atau `idx_modul_induk_lookup`); tidak ada jalur
  pencarian yang memakainya sebagai predikat. Index tanpa pembaca adalah beban
  tulis tanpa imbalan.
- **Tidak ada tabel baru.**
- **TIDAK ADA BACKFILL.** Menghitung hash hari ini untuk Modul yang disusun dari
  potret kemarin justru memberi identitas palsu kepada ketidakcocokan yang
  nyata — persis kebalikan dari tujuan kolom ini.
- **Rollback:** `ALTER TABLE public.modul_induk DROP COLUMN IF EXISTS tp_snapshot_hash;`
  Aman kapan pun; tidak ada baris hilang dan tidak ada kolom lain bergantung
  padanya. Yang kembali hanyalah keadaan sebelum M1 — seluruh Modul menjadi tak
  terverifikasi lagi.
- **Tidak dijalankan.** Tidak ada `db push`, tidak ada query ke produksi.

---

## F. NEW MODULE BEHAVIOR

1. `generate-modul` membaca `atp_induk`, membangun `tp_anchor`, menghitung
   `hashSekarang` — **selalu di server**.
2. Gerbang `periksaAnchor()`: hash tersimpan kosong + belum ada konten final →
   `BARU` → lanjut.
3. Fase A menuliskan `tp_snapshot_hash: hashSekarang` bersama draft-nya.

Potret dipaku di **awal** penyusunan, bukan di Fase D: Modul yang gagal di
tengah jalan tetap membawa potret yang dipakai Fase A, sehingga percobaan
berikutnya dibandingkan terhadap potret yang benar.

---

## G. EXISTING MODULE BEHAVIOR

| Keadaan | Status | Boleh generate | Kode |
|---|---|---|---|
| hash tersimpan = hash sekarang | `COCOK` | ya | — |
| hash tersimpan ≠ hash sekarang | `STALE` | **tidak** | `MODULE_TP_ANCHOR_STALE` |
| nomor TP tidak ada lagi di ATP | `STALE` | **tidak** | `MODULE_TP_ANCHOR_STALE` |

Respons konflik HTTP 409 membawa yang guru perlukan dan tidak lebih:

```json
{ "code": "MODULE_TP_ANCHOR_STALE",
  "status_anchor": "STALE",
  "konflik": { "tp_modul":    { "nomor": 5, "judul": "…" },
               "tp_atp_kini": { "nomor": 5, "judul": "…" },
               "atp_berubah": true } }
```

Tidak ada hash, tidak ada id, tidak ada nama field internal — diuji di M1-L.

**Tidak menyusun, tidak menimpa, tidak mengalihkan Modul ke TP lain.** Modulnya
tetap utuh dan tetap dapat dibuka serta diunduh; yang berhenti hanyalah
penyusunan ulang terhadap ATP yang sudah berbeda.

---

## H. LEGACY BEHAVIOR

Modul yang sudah punya konten final (`konten.schema_version` ada) dengan
`tp_snapshot_hash = NULL`:

```
status  : LEGACY_UNVERIFIED
kode    : MODULE_TP_ANCHOR_LEGACY
generate: DITOLAK
buka / lihat / unduh: TETAP BISA
```

NULL berarti **tidak diketahui**, dan tidak diketahui bukan sinonim aman.
Tidak ada baris historis yang dihapus, diubah, atau di-backfill.

UX transisi penuh **tidak dibangun di M1** (§7 tugas) — yang ada backend
contract plus status yang dapat dideteksi klien.

---

## I. KKTP AUTHORITY CHANGE

Sejak M1, **KKTP untuk Modul disusun `generate-modul` dari `tp_anchor`.**
Tab Penilaian bukan sumber kebenaran.

Fase A kini menerima:

```ts
    tp_anchor: {
      tp_teks:       params.tpJudul,
      tuntutan_cp:   params.tpAnchor.tuntutan,
      kategori_teks: params.tpAnchor.kategori_teks,
      semester:      params.tpAnchor.semester,
      jp_alokasi:    params.tpAnchor.jp_alokasi,
      instruksi: 'SEMUA komponen modul (KKTP, pertemuan, materi, instrumen) HARUS …',
    },
```

dan, menggantikan daftar KKTP kelas:

```ts
    instruksi_kktp:
      'Susun KKTP untuk TP ini sendiri, dari tp_anchor — JANGAN mengandaikan ada daftar KKTP yang dikirim. ' +
      'Setiap KKTP mengukur tuntutan CP yang TP ini pikul, bukan kemampuan lain di kelas yang sama. …',
```

- KKTP hasil hidup di dokumen Modul, terikat pada `tp_snapshot_hash`.
- **NO AUTO SYNC. NO DUAL WRITE.** `tp_kktp` tidak dibaca dan tidak ditulisi.
- Data historis `tp_kktp` utuh; Penilaian tetap hidup sebagai fitur sendiri.
- Impor/pakai-ulang eksplisit dari Penilaian tetap NON-GOAL.
- **Bentuk `KktpItem` tidak diubah** (`id_kktp`, `kriteria`, `ambang_batas`,
  `instrumen_bukti`) supaya pipeline tidak pecah. Perbaikan mutu KKTP —
  observable, threshold — adalah **M4**, bukan sekarang.

Anggaran token Fase A tetap turunan, bukan angka mati: karena jumlah KKTP kini
baru diketahui **setelah** panggilan, ia diperkirakan `2 × jumlah tuntutan`
dengan lantai 3. Untuk TP berdua tuntutan hasilnya 4 — sama dengan jumlah KKTP
yang benar-benar dipakai modul produksi selama ini, jadi anggaran fase ini tidak
menyempit oleh perubahan M1.

---

## J. REMOVAL OF UNSAFE tp_kktp QUERY

Query §B.1 **dihapus seluruhnya** dari jalur generate. Diuji M1-N, yang
memeriksa sumber setelah komentar dibuang (berkas itu *menjelaskan* query yang
dicabut, dan penjelasan bukan pemakaian):

```
tidak ada from('tp_kktp')         ✓
nama tabel tp_kktp tidak dipakai  ✓
tidak ada eq('tipe','KKTP')       ✓
tidak ada kktpList                ✓
```

M1-P memeriksa dari sisi tulis: tabel yang `generate-modul` tulisi tepat
`ai_usage` dan `modul_induk` — tidak lebih.

---

## K. CLIENT MISMATCH BEHAVIOR

Klien **tidak menghitung ulang hash** — aturan kanoniknya tinggal di satu
tempat, dan menyalinnya ke JS akan membuat kembar yang menyimpang diam-diam
(kelas cacat yang sudah dua kali dibayar di repo ini). Diuji M1-Q.

`statusAnchorModul()` membaca dua tanda yang sudah ada di data:

```js
if (!modul.tp_snapshot_hash && berisi) return 'LEGACY_UNVERIFIED';
if (!tpSekarang)                       return 'STALE';
if (judul tersimpan !== judul sekarang) return 'STALE';
return 'CURRENT';
```

Tanda kedua **tidak lengkap** — tuntutan atau JP bisa berubah tanpa judulnya
berubah — dan itu memang tidak apa-apa: yang menolak menyusun ulang adalah
server, yang menghitung potretnya sendiri. Klien hanya berhenti menganggap
nomor sebagai identitas.

Perilaku barunya:

- `_chat.selected_tp` **hanya** mengambil TP ATP sekarang bila status `CURRENT`;
  selain itu yang ditampilkan tetap TP yang Modul ini dibuat untuknya.
- Status dihitung ulang setelah `konten` termuat — daftar katalog sengaja tidak
  membawa `konten` (ia besar), jadi "sudah berisi" baru diketahui di sana.
  Tanpa ini, Modul lama berisi tanpa potret akan terbaca `CURRENT`.
- Kedua status ber-pesan menampilkan peringatan di atas pratinjau Modul.
- Kode `MODULE_TP_ANCHOR_STALE` / `_LEGACY` dari server ditangani dan **tidak
  ditawari "coba lagi"** — mencoba lagi tidak akan pernah berhasil, dan Modul
  yang sudah ada tidak hilang. Bila judulnya berbeda, kedua judul ditampilkan.

Teks UI sengaja minimal; renderer overhaul adalah M8.

---

## L. ATP REGENERATION AWARENESS

**ATP versioning tidak dirancang ulang, dan `generate-atp` tidak diubah sama
sekali** — kontrak pedagogis ATP yang baru diterima tidak disentuh.

Kesadarannya ditempatkan di hilir, tempat ia dapat dibuat aman: `tp_snapshot_hash`
menjadikan setiap ketidakcocokan terdeteksi pada percobaan generate berikutnya.
Tidak ada perilaku merusak: tidak ada Modul dihapus, ditimpa, atau dialihkan.

Peringatan-sebelum-regenerate menuntut UX tersendiri (daftar Modul terdampak,
pilihan guru) — **ditunda ke M8** sesuai §10, dengan gerbang server sebagai
jaring pengaman yang sudah berdiri sekarang.

---

## M. TESTS

`tests/modul-anchor.test.ts` — **18 passed / 0 failed**.

| | Menguji |
|---|---|
| M1-A | potret sama → hash sama; SHA-256 64 hex; keterangan di luar `FIELD_HASH` tidak mengubah hash; `FIELD_HASH` tetap 9 |
| M1-B | urutan `tuntutan[]` tidak mengubah hash |
| M1-C | urutan `kategori_teks[]` tidak mengubah hash |
| M1-D | judul berubah → hash berubah; beda spasi/normalisasi → **tidak** berubah |
| M1-E | tuntutan dikurangi / diganti / ditambah → hash berubah |
| M1-F | kategori_teks berubah atau dikosongkan → hash berubah |
| M1-G | semester berubah / null → hash berubah |
| M1-H | jp_alokasi berubah → hash berubah |
| M1-I | jp_pertemuan berubah → hash berubah; `[2,4]` ≠ `[4,2]`; versi CP juga masuk hash |
| M1-J | Modul baru → `BARU`, memakai hash server |
| M1-K | hash sama → `COCOK`, lanjut |
| M1-L | hash berbeda → `STALE`, ditolak; berlaku juga pada draft; keterangan konflik tidak membocorkan hash |
| M1-M | berisi + hash NULL → `LEGACY_UNVERIFIED`, bukan cocok; hash string kosong sama |
| M1-N | `generate-modul` tidak lagi menanyai `tp_kktp` classroom-wide |
| M1-O | Fase A menerima `tp_anchor` sekarang; tuntutan dan kategori benar-benar dikirim; hash yang ditulis hitungan server; hash klien tidak pernah dipakai menulis |
| M1-P | tabel yang ditulisi tepat `ai_usage` + `modul_induk`; KKTP disusun dari `tp_anchor`; `KktpItem` tidak berubah bentuk |
| M1-Q | pola pengikatan lama hilang; status dituntut `CURRENT`; ketiga status ada; klien tidak menghitung hash; kode konflik ditangani |
| M1-R | migration additif, idempoten, tanpa DROP/DELETE/UPDATE, rollback dijelaskan |

M1-N sampai M1-R memeriksa **sumber kirimnya sendiri**, bukan salinan
logikanya — pola yang sama yang sudah dipakai `tests/atp-trace.mjs` dan harness
semantik ATP.

---

## N. ATP REGRESSION

```
$ deno test --allow-read tests/atp-kontrak.test.ts
ok | 60 passed | 0 failed (209ms)

$ node tests/atp-acuan-sinkron.mjs
LULUS — acuan CP sinkron (supabase/functions/generate-atp/acuan-cp.ts)

$ node tests/atp-trace.mjs --periksa
LULUS — docs/SPEC-ATP-KONTRAK.md sesuai dengan kontrak di kode.
```

Tidak ada assertion lama yang dilemahkan. `generate-atp/index.ts` dan
`kontrak.ts` tidak disentuh sama sekali; CP tidak disentuh.

---

## O. MODULE REGRESSION

```
$ deno check supabase/functions/generate-modul/index.ts      Check … ok
$ node --check guru/js/rancang-chat.js                        ok
$ node --check guru/js/rancang-chat-api.js                    ok

$ deno run --allow-read --allow-write tests/validator-modul.ts
✓ tp02.json  0 temuan   ✓ tp03.json  0 temuan   ✓ tp04.json  0 temuan
✓ tp05.json  1 temuan   ✓ tp06.json  1 temuan
Semua 5 contoh sesuai harapan.
```

`tests/validator-modul.ts` menuntut satu penyesuaian mekanis: ia mengekstrak
sumber Edge Function ke berkas sementara lalu mengimpornya, dan sejak M1
`index.ts` mengimpor `./anchor.ts` — impor relatif hanya dapat diselesaikan dari
folder yang sama. Berkas sementaranya kini ditaruh **di samping sumbernya**
alih-alih di direktori temp sistem, lalu dihapus. **Nol assertion diubah**;
kelima contoh tetap memberi jumlah temuan yang sama persis seperti sebelumnya.

---

## P. FILES CHANGED

| Berkas | Sifat |
|---|---|
| `supabase/functions/generate-modul/anchor.ts` | **baru** — potret TP, kanonikalisasi, hash, gerbang; murni dan dapat diuji |
| `supabase/migrations/20260910000001_modul-tp-snapshot-hash.sql` | **baru** — satu kolom, additif, tanpa backfill |
| `tests/modul-anchor.test.ts` | **baru** — M1-A…M1-R |
| `supabase/functions/generate-modul/index.ts` | query `tp_kktp` dicabut; anchor + gerbang; Fase A menerima `tp_anchor`; hash ditulis di Fase A; anggaran token Fase A |
| `guru/js/rancang-chat.js` | `statusAnchorModul()`, `PESAN_ANCHOR`, `tp_anchor_status` di state, dua jalur pembukaan Modul, peringatan pratinjau, penanganan kode konflik |
| `guru/js/rancang-chat-api.js` | dua query modul ikut mengambil `tp_snapshot_hash` |
| `guru/classroom.html` | versi cache `?v=chat-20260910m1` |
| `sw.js` | `CACHE_NAME` `miclass-v27` → `v28` |
| `tests/validator-modul.ts` | letak berkas sementara (mekanis, nol assertion berubah) |

Yang **tidak** disentuh: `generate-atp` (EF maupun kontrak), CP dan acuan,
schema `ModulOutput` selain jalur KKTP, validator Modul, renderer Modul V4.0,
Naskah, `tp_kktp` dan Tab Penilaian, tabel lain mana pun.

---

## Q. CHANGE EVIDENCE

`docs/MODULE-M1-IDENTITY-EVIDENCE.diff` — 1.032 baris, hanya perubahan task ini
(786 penambahan, 43 penghapusan), memuat BEFORE dan AFTER verbatim untuk
keenam berkas yang disunting dan isi penuh ketiga berkas baru.

Pemetaan syarat → bukti:

| Syarat | Berkas | Bukti |
|---|---|---|
| §3 canonical anchor | `anchor.ts` | `bangunTpAnchor()` · M1-A |
| §4 hash deterministik | `anchor.ts` | `FIELD_HASH`, `kanonikAnchor()` · M1-A…M1-I |
| §5 migration | migration baru | M1-R |
| §6 gerbang | `index.ts` §6/§6b | M1-J…M1-L |
| §7 warisan | `anchor.ts` `periksaAnchor()` | M1-M |
| §8 cabut query | `index.ts` §6 | M1-N |
| §9 KKTP milik Modul | `index.ts` `instruksi_kktp` | M1-P |
| §11 klien | `rancang-chat.js` | M1-Q |
| §12 hash klien tak dipercaya | `index.ts` | M1-O |

---

## R. REMAINING M1 GAPS

Dicatat jujur, tidak ditambal diam-diam:

1. **`jumlah_pertemuan` masih diturunkan dari salinan klien.**
   `collected_data.PILIH_TP.selected_tp.jp_pertemuan` — data yang klien
   simpan — sementara potret memakai `progresi_tp[].jp_pertemuan` dari server.
   Bila keduanya berbeda, potretnya benar sedangkan penyusunannya memakai angka
   lain. Bukan lubang keamanan identitas (perbedaan `jp_pertemuan` server tetap
   mengubah hash dan tetap tertangkap), tetapi tetap dua sumber untuk satu
   angka. **Milik M2/M5**, tempat pewarisan ATP dirapikan seluruhnya.
2. **Deteksi klien tidak lengkap** — hanya judul yang dibandingkan (§K).
   Disengaja; server tetap penjaga sebenarnya.
3. **UX transisi Modul warisan belum ada.** Guru diberi tahu dan generate
   ditolak, tetapi belum ada jalan yang ditawarkan. §7 tugas menyatakan ini
   memang bukan lingkup M1; tempatnya M8.
4. **Peringatan sebelum regenerate ATP belum ada** (§L) — ditunda ke M8 sesuai
   §10, dengan gerbang server sebagai jaring pengaman.
5. **Mutu KKTP belum disentuh.** KKTP kini milik TP yang benar; apakah ia
   observable dan ambangnya cukup adalah **M4**.
6. **Belum ada pengujian langsung terhadap basis data.** Migration belum
   dijalankan di mana pun; seluruh bukti M1 berasal dari uji deterministik dan
   pembacaan sumber. Kolom baru baru akan terbukti bekerja saat deploy.

---

## S. RECOMMENDATION (M1 — digantikan §T.9)

# MODULE M1 — READY FOR REVIEW

Blocker §P ditutup di tiga lapis sekaligus:

- **Identitas** — potret TP sembilan field, hash SHA-256 deterministik, dan
  aturan kanonikalisasi yang hidup di satu tempat saja.
- **Gerbang** — server menghitung ulang potret dari ATP dan menolak menyusun
  ulang Modul yang potretnya sudah berbeda; hash dari klien tidak pernah
  dipercaya.
- **Otoritas KKTP** — query classroom-wide dicabut; KKTP disusun dari
  `tp_anchor`, hidup di dokumen Modul, tanpa sinkronisasi dua arah.

Nol Modul historis dihapus, diubah, atau di-backfill. Nol assertion lama
dilemahkan: ATP 60/60 tetap hijau, kelima contoh validator Modul tetap memberi
jumlah temuan yang sama, dan 18 uji M1 baru menjaga agar pola lama tidak kembali.

Sesuai §19 dan §20: **belum di-commit, dan berhenti di sini.** Tidak ada deploy,
push, migrasi produksi, atau tulisan ke basis data produksi. M2 tidak dimulai.

---

## T. M1.1 — LEGACY / PRE-HASH DRAFT HARDENING

Reviewer menahan penerimaan M1 karena satu celah identitas yang masih tepat di
lingkup M1. Seluruh bukti M1 di atas tetap berlaku dan tidak dihapus; bagian ini
menambahinya.

### T.1 Defect reproduction — dari kode aktual

Gerbang M1 memakai satu pembeda saja:

```ts
  const adaKontenFinal = typeof kontenObj.schema_version === 'string';
  const gerbang = periksaAnchor({ hashTersimpan, hashSekarang, adaKontenFinal });
```

**CASE A — draft parsial pra-M1.** Modul pra-M1 yang berhenti di tengah jalan
punya `_draft.fase_a` tanpa `schema_version`. `adaKontenFinal` = false, hash
NULL → gerbang menjawab `BARU` → penyusunan diizinkan. Fase A memang keluar
lebih awal karena idempotensi (`existingDraftA`), tetapi **Fase B tidak**: ia
menyusun `pertemuan[]` dari `_draft.fase_a` milik TP LAMA dengan `tp_anchor` TP
BARU. Dua TP dijahit menjadi satu dokumen, tanpa satu pun galat. Dan karena
hanya Fase A yang menuliskan hash, baris itu tetap NULL selamanya.

**CASE B — baris kosong dengan judul tersimpan yang sudah basi.** `modul_induk`
dibuat saat guru memilih TP (`createModulIndukDraft(atp_induk_id, nomor, judul)`),
sebelum penyusunan dimulai. Bila ATP disusun ulang lebih dulu, baris itu masih
menyimpan `nomor_tp = 5` dan `tp_judul = "Judul lama"`, sementara nomor 5
sekarang menunjuk judul lain. Gerbang M1 menjawab `BARU`, hash TP baru ditulis,
dan — inilah bagian yang paling merugikan — Fase A menerima campuran:

```ts
    tp_judul:            params.tpJudul,       // "Judul lama", dari baris modul_induk
    tp_anchor: {
      tp_teks:       params.tpJudul,           // "Judul lama"
      tuntutan_cp:   params.tpAnchor.tuntutan, // tuntutan TP BARU
      kategori_teks: params.tpAnchor.kategori_teks,
```

Judul satu TP, tuntutan TP lain, dalam satu objek bernama `tp_anchor`.

Keduanya direproduksi dari sumber sebelum disentuh.

### T.2 Aturan draft parsial

`punyaRiwayatPenyusunan()` di `anchor.ts` menggantikan pembeda tunggal itu.
Riwayat dibaca dari **bekas penyusunan**, bukan dari kelengkapannya:

```ts
export const KUNCI_DRAFT: readonly string[] = ['fase_a', 'fase_b', 'fase_c', 'fase_b2'];
```

Keempatnya diambil dari penulisan yang benar-benar ada di `index.ts`
(`_draft: { fase_a: … }`, `fase_b`, `fase_c`, `fase_b2`) — tidak ada field yang
ditebak. `_draft` kosong, `fase_a: null`, dan fase yang tidak dikenal **bukan**
riwayat, supaya baris yang memang bersih tidak ikut terjebak.

```
hash NULL + ada riwayat  →  LEGACY_UNVERIFIED, generate DITOLAK
```

### T.3 Aturan baris kosong: judul tersimpan harus masih cocok

Untuk baris yang benar-benar kosong, potret sekarang boleh diadopsi **hanya
bila** identitas minimum yang dicatat saat baris dibuat masih cocok:

```ts
  const judulCocok = judulSama(judulTpModul, tpAnchor.tp_judul);
```

Nomor TP sudah dijamin oleh cara anchor dibangun (`bangunTpAnchor` mencari
`nomor` itu, dan mengembalikan `null` bila tidak ada — sudah ditangani sebagai
konflik sejak M1). Judul dibandingkan setelah dinormalkan, jadi perbedaan spasi
bukan perbedaan TP.

```
hash NULL + tanpa riwayat + judul cocok    →  BARU
hash NULL + tanpa riwayat + judul BERBEDA  →  STALE, hash TIDAK ditulis
```

`tp_judul` baris Modul tidak diubah diam-diam.

### T.4 Otoritas anchor tunggal di Fase A

Begitu gerbang lolos, seluruh data TP yang dianggap otoritas berasal dari satu
objek server:

```ts
  const nomorTp  = tpAnchor.nomor_tp;
  const tpJudul  = tpAnchor.tp_judul;
```

dan di dalam prompt:

```ts
      tp_teks:       params.tpAnchor.tp_judul,
```

Field baris `modul_induk` (`nomorTpModul`, `judulTpModul`) tetap ada, tetapi
hanya untuk tiga hal: mendeteksi ketidakcocokan, menampilkan potret lama, dan
menyusun pesan konflik. Tidak lagi untuk membangun TP yang sedang disusun.

### T.5 Perilaku pasca-M1 tidak berubah

`tp_snapshot_hash` terisi tetap diperlakukan seperti M1: sama → `COCOK`
(draft parsial boleh dilanjutkan), berbeda → `STALE` baik final maupun parsial.
Dijaga M1-Y dan M1-Z, supaya perbaikan ini tidak merusak resume Modul yang
dibuat setelah M1.

Kompatibilitas pemanggil: `adaRiwayat` bawaannya `adaKontenFinal` dan
`judulCocok` bawaannya `true`, sehingga M1-J sampai M1-M — uji lama — tidak
berubah arti dan **tidak satu pun assertion-nya dilemahkan**.

### T.6 Klien

`statusAnchorModul()` memakai pembeda yang sama:

```js
  var KUNCI_DRAFT_MODUL = ['fase_a', 'fase_b', 'fase_c', 'fase_b2'];
  if (!modul.tp_snapshot_hash && punyaRiwayatModul(modul.konten)) return 'LEGACY_UNVERIFIED';
```

Klien tetap **tidak** menghitung hash: aturan kanoniknya tinggal di satu tempat.
Server tetap otoritas.

### T.7 Tests

`tests/modul-anchor.test.ts` — **29 passed / 0 failed** (18 lama + 11 baru).

| | Menguji |
|---|---|
| M1-S | hash NULL + `_draft.fase_a` → `LEGACY_UNVERIFIED`; fixture dipastikan BELUM final |
| M1-T | keempat kunci draft → `LEGACY_UNVERIFIED`; `KUNCI_DRAFT` tidak menyusut; draft kosong/null/tak dikenal **bukan** riwayat |
| M1-U | hash NULL + dokumen final → tetap `LEGACY_UNVERIFIED` |
| M1-V | hash NULL + kosong + judul cocok → `BARU`; judul dinormalkan |
| M1-W | hash NULL + kosong + judul berbeda → `STALE`, hash tidak diadopsi |
| M1-X | `tp_teks` dari `tpAnchor.tp_judul`; `nomorTp`/`tpJudul` dari anchor; jalur lama hilang; judul tersimpan tetap dipakai untuk pesan konflik |
| M1-Y | pasca-M1 draft parsial + hash sama → `COCOK`, resume utuh |
| M1-Z | pasca-M1 draft parsial + hash berbeda → `STALE` |
| M1-AA | klien memakai pembeda riwayat yang sama; pembeda lama hilang; tetap tidak menghitung hash |
| M1-AB | hash ditulis **sesudah** gerbang; model dipanggil **sesudah** gerbang; hanya satu jalur menulis hash; penolakan mengembalikan 409 |
| M1-AC | riwayat dihitung dari `kontenObj` (kolom `konten` baris Modul), judul diperiksa terhadap anchor server, gerbang menerima kedua tanda baru |

M1-AB dan M1-AC menjawab §9 tugas: bukan hanya helper dengan objek buatan yang
diuji, melainkan **bentuk pipeline yang sebenarnya** di
`generate-modul/index.ts` — urutan gerbang terhadap penulisan hash dan terhadap
panggilan model, sumber keadaan draft, dan otoritas anchor.

Bukti urutan dari sumber:

```
gerbang periksaAnchor    baris 2719
penolakan 409            baris 2723
tpJudul dari anchor      baris 2855
panggilan model pertama  baris 3040
penulisan hash           baris 3134
```

### T.8 Regresi M1.1

```
ATP            : 60 passed / 0 failed  ·  sinkron LULUS  ·  jejak SPEC LULUS
M1 + M1.1      : 29 passed / 0 failed  (18 lama tetap hijau, nol dilemahkan)
deno check     : anchor.ts ok · index.ts ok
node --check   : rancang-chat.js ok
validator Modul: tp02 0 · tp03 0 · tp04 0 · tp05 1 · tp06 1 — jumlah temuan SAMA
```

**Migration tidak diubah.** Satu kolom `tp_snapshot_hash` tetap cukup: seluruh
koreksi M1.1 adalah cara membaca kolom itu bersama isi `konten` yang sudah ada,
bukan data baru.

### T.9 Berkas yang berubah di M1.1

| Berkas | Perubahan |
|---|---|
| `supabase/functions/generate-modul/anchor.ts` | `KUNCI_DRAFT`, `punyaRiwayatPenyusunan()`, `judulSama()`; `periksaAnchor()` menerima `adaRiwayat` dan `judulCocok` (keduanya opsional, bawaan kompatibel) |
| `supabase/functions/generate-modul/index.ts` | gerbang membaca riwayat + kecocokan judul; `nomorTp`/`tpJudul` berasal dari anchor; `tp_teks` dari anchor |
| `guru/js/rancang-chat.js` | `punyaRiwayatModul()` + `KUNCI_DRAFT_MODUL` di `statusAnchorModul()` |
| `tests/modul-anchor.test.ts` | M1-S … M1-AC |

Bukti verbatim khusus M1.1: `docs/MODULE-M1-IDENTITY-HARDENING-EVIDENCE.diff`
(386 baris; 302 penambahan, 17 penghapusan). Bukti M1 asli
(`docs/MODULE-M1-IDENTITY-EVIDENCE.diff`) tidak dihapus dan tetap berlaku.

Lingkup tidak melebar: ATP, mutu KKTP, formatif, `kategori_teks` hilir, Naskah,
renderer, dan M2/M4 tidak disentuh.

### T.10 Sisa gap sesudah M1.1

Keenam butir §R tetap berlaku apa adanya. Satu yang perlu dibaca ulang dengan
konteks baru:

- **§R.1 (`jumlah_pertemuan` dari salinan klien)** kini menjadi satu-satunya
  tempat tersisa di jalur Modul yang otoritasnya bukan anchor server. Ia tidak
  merusak identitas — perbedaan `jp_pertemuan` server tetap mengubah hash dan
  tetap tertangkap gerbang — tetapi ia adalah dua sumber untuk satu angka, dan
  tempatnya M2/M5.

---

# MODULE M1.1 — READY FOR REVIEW

Kedua kasus yang reviewer temukan ditutup, dan keduanya ditutup di tempat yang
benar:

- **CASE A** — riwayat penyusunan tidak lagi diukur dari kelengkapan dokumen
  melainkan dari bekas penyusunan mana pun, sehingga draft parsial pra-M1 tidak
  dapat mengadopsi potret TP baru.
- **CASE B** — baris kosong tetap harus cocok dengan identitas minimum yang
  dicatat saat guru memilih TP, dan Fase A tidak lagi bisa menerima judul satu
  TP bersama tuntutan TP lain.

Nol assertion lama dilemahkan: ATP 60/60 hijau, 18 uji M1 asli tetap hijau,
kelima contoh validator Modul memberi jumlah temuan yang sama persis. Migration
tidak berubah. Nol Modul historis dihapus, diubah, atau di-backfill.

Sesuai §14 dan §15: **belum di-commit, dan berhenti di sini.** Tidak ada push,
deploy, migrasi produksi, atau tulisan ke basis data produksi. M2 tidak dimulai.
