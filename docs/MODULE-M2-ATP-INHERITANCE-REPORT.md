# MODULE M2 — ACCEPTED ATP INHERITANCE

**Tanggal:** 10 September 2026
**Lingkup:** M2 saja. M3–M9 tidak dikerjakan.
**Belum di-commit** — menunggu penerimaan reviewer (§25).
**Tidak ada panggilan model.** M2 adalah pipa, bukan semantik.

> **§A–§S menggambarkan keadaan M2. Empat pernyataannya DIKOREKSI di §T (M2.1)**
> setelah reviewer menemukan empat celah otoritas. Yang berubah: baris
> `program_keahlian` di tabel §C (kini potret ATP, bukan `rancang_settings`),
> baris `tuntutan CP` di §C dan kalimat terakhir §E (daftar tuntutan kosong kini
> GAGAL di jalur penyusunan), asal `kesiapan_murid` di §I (kini `fakta`), dan
> catatan impor lintas fungsi di akhir §C (klaimnya terlalu kuat — lihat §T.13).
> **§T.3 pun dikoreksi lagi di §U (M2.2):** gerbang versi CP dulu meloloskan ATP
> yang tidak mencatat versinya. Urutan yang berlaku: §U menang atas §T, dan §T
> menang atas §A–§S.

---

## A. M1 BASELINE COMMIT

```
$ git log -2 --oneline
8ea0c36 feat: bind modules to ATP TP snapshots
8b3a17a feat: finalize contextual ATP generation
```

# MODULE M1 ACCEPTED BASELINE COMMIT = `8ea0c36`

Regresi sebelum staging, seluruhnya cocok dengan yang diharapkan:

```
ATP        : 60 passed / 0 failed · sinkron LULUS · trace LULUS
Module M1  : 29 passed / 0 failed
Fixtures   : tp02 0 · tp03 0 · tp04 0 · tp05 1 · tp06 1
deno check : anchor.ts · index.ts · generate-atp/index.ts — semua ok
node --check: rancang-chat.js · rancang-chat-api.js — ok
```

Higiene: nol kunci API, token, atau rahasia Supabase di berkas yang di-stage —
yang ada hanya `Deno.env.get('…')`, yaitu nama variabel, bukan nilainya.
Artefak eksperimen (`tests/artifacts/`, `tmp/`, `hatpt/`, `prompt codex/`,
`.docx` sampel) tetap di disk dan **tidak** di-stage.

Yang di-stage: 13 berkas — `anchor.ts`, `generate-modul/index.ts`, migration,
`tests/modul-anchor.test.ts`, `tests/validator-modul.ts`, tiga berkas klien,
`sw.js`, dan empat dokumen kontrak/laporan/bukti M1.

---

## B. PREVIOUS INHERITANCE GAPS

Dari `docs/MODULE-NASKAH-CONTRACT-LOCK.md` §A, dan diverifikasi ulang pada
sumber di `8ea0c36`:

| Yang ATP putuskan | Sampai ke Modul sebelum M2? |
|---|---|
| `tuntutan[]` (ID) | ya sejak M1 — **tanpa maknanya** |
| `kategori_teks` | ya sejak M1 |
| kompetensi & lingkup materi tiap tuntutan | **tidak** |
| `cakupan_wajib` (fiksi DAN nonfiksi) | **tidak** |
| A17 porsi konteks contoh dan tugas | **tidak** |
| penekanan guru (`target_prioritas`) | **tidak** |
| `ATP_HASIL.penerapan_prioritas` | **tidak** |
| `versi_cp` | **tidak** |
| semester | **tidak** |
| alokasi pertemuan | ya — **dari salinan klien, bukan dari ATP** |

Dan gap yang laporan M1 §R.1 catat sendiri: `jumlah_pertemuan` diturunkan dari
`collected_data.PILIH_TP.selected_tp.jp_pertemuan` — **salinan klien** —
sementara potret identitas memakai `progresi_tp[].jp_pertemuan` dari server.
Dua sumber untuk satu angka.

---

## C. SERVER AUTHORITY MAP

Satu nilai satu otoritas. Sesudah M2:

| Nilai | Otoritas | Berkas |
|---|---|---|
| nomor & judul TP | `tpAnchor` (M1.1) | `anchor.ts` |
| tuntutan CP + maknanya | acuan CP milik ATP lewat `acuanUntuk()` / `tuntutanWajib()` | `warisan.ts` |
| kategori teks TP | `tpAnchor.kategori_teks` | `anchor.ts` |
| kategori teks **wajib** | `cakupan_wajib` acuan | `warisan.ts` |
| jumlah & JP pertemuan | `tpAnchor.jp_pertemuan` | `warisan.ts` |
| semester, versi CP | `tpAnchor` / `ATP_HASIL.acuan_cp` | `anchor.ts`, `warisan.ts` |
| A17 berlaku | `resolveDelegasi()` atau `ATP_HASIL` | `warisan.ts` |
| penekanan guru | `prioritasDipilih()` milik ATP | `warisan.ts` |
| penerapan penekanan | `ATP_HASIL.dasar_penyusunan` | `warisan.ts` |
| kesiapan murid | `atp.collected_data.PROFIL_SISWA` | `warisan.ts` |
| jumlah murid | `rancang_settings.jumlah_murid` (tidak diubah) | `index.ts` |
| program keahlian | `rancang_settings.program_keahlian` | `index.ts` |

`warisan.ts` **murni** — tidak menyentuh jaringan, database, maupun `Deno.env`,
sehingga seluruh isinya dapat diuji tanpa produksi, sama seperti `anchor.ts`.

**Tidak ada kebenaran kembar.** Definisi tuntutan diambil lewat helper milik
ATP; tidak ada teks yang disalin, tidak ada daftar tuntutan kedua, dan tidak ada
mapel atau fase yang ditulis keras di jalur Modul — dijaga M2-T:

```
!/BIE-E25-/.test(src)        ✓   ID tuntutan tidak ditulis keras
!/'Bahasa Inggris'/.test(src) ✓  mapel tidak ditulis keras
```

Konsekuensi yang perlu diketahui: `generate-modul` kini mengimpor
`../generate-atp/kontrak.ts`. Impor relatif lintas direktori fungsi adalah pola
yang sama dengan `_shared/`, dan bundler Supabase mengikutinya. Alternatifnya —
menyalin definisi — persis yang §4 larang.

---

## D. TP ANCHOR ENRICHMENT

`tp_anchor` yang dikirim ke fase kini membawa **makna**, bukan hanya ID:

```ts
tuntutan_cp: [ { id, kompetensi, lingkup_materi, cakupan_wajib? } ]
kategori_teks_tp:    [...]   // yang TP nyatakan
kategori_teks_wajib: [...]   // yang acuan tuntut
```

**`tp_snapshot_hash` M1 tidak berubah.** `FIELD_HASH` tetap sembilan field, dan
hash tetap dihitung dari **ID tuntutan**, bukan dari bentuk kayanya. Objek yang
diuraikan hanya untuk dikirim dan disimpan. Dijaga M2-R, yang membuktikan
`hitungTpSnapshotHash(anchor)` tetap menghasilkan nilai yang sama dan bahwa
sumber produksi tetap menghitungnya dari `tpAnchor`, bukan dari jejak.

---

## E. CP DEMAND RESOLUTION

`uraikanTuntutan(mapel, fase, ids)` — dari acuan yang **sudah diterima ATP**.

**ID yang tidak dikenal adalah kegagalan keras**, bukan sesuatu yang dilewati:

```ts
throw Object.assign(new Error(…), { code: KODE_TUNTUTAN_ASING, tuntutan_asing: asing });
```

dan di `index.ts` menjadi HTTP 422 dengan daftar ID yang bermasalah. Melewatinya
berarti menyusun modul untuk tuntutan yang tidak ada isinya — kelas cacat yang
sama yang M1 tutup di sisi identitas. Acuan yang tidak tersedia sama:
`KODE_ACUAN_HILANG`, bukan daftar kosong.

Satu pengecualian yang disengaja: `ids` kosong dikembalikan apa adanya. ATP yang
disusun sebelum acuan CP ada memang tidak punya `tuntutan`, dan Modulnya tetap
boleh dibuka.

---

## F. MEETING ALLOCATION SOURCE

SEBELUM (`8ea0c36`):

```ts
  const selectedTp   = (pilihTp.selected_tp as Record<string, unknown>) || {};
  const jpPertemuanArr = Array.isArray(selectedTp.jp_pertemuan) ? … : [];
  const jumlahPertemuan = jpPertemuanArr.length > 0 ? jpPertemuanArr.length : …
```

SESUDAH:

```ts
  const alokasiTp       = alokasiPertemuanDariAnchor(tpAnchor);
  const jumlahPertemuan = alokasiTp.jumlah_pertemuan;
  const jpPerPertemuan  = alokasiTp.jp_per_pertemuan;
```

Jalur lama **hilang**, bukan sekadar tidak dipakai — M2-O memeriksa sumber
setelah komentar dibuang:

```
!/selected_tp/     ✓
!/jpPertemuanArr/  ✓
!/PILIH_TP/        ✓
```

Tidak ada jalan mundur diam-diam ke salinan klien: anchor server selalu tersedia
di titik itu karena gerbang M1 sudah menolak permintaan yang TP-nya tidak ada
lagi di ATP.

Catatan jujur soal `jp_per_pertemuan`: ATP yang diterima menjamin setiap
pertemuan berisi satuan yang sama (validator W5), jadi angkanya persis. Sebaran
tidak seragam — hanya mungkin pada data lama — memakai rata-rata dibulatkan,
sama seperti perilaku sebelumnya, dan sebaran aslinya tetap diteruskan utuh
sebagai `jp_pertemuan` supaya hilir tidak kehilangan apa pun.

---

## G. EFFECTIVE A17

`konteksTugasEfektif(cd, keputusanAtp)` mengembalikan keputusan yang **berlaku**,
bukan jawaban mentah:

| Keadaan | Sumber | `asal` |
|---|---|---|
| guru menjawab sendiri | `resolveDelegasi(cd).konteks_tugas` | `keputusan_guru` |
| guru mendelegasikan | `ATP_HASIL…keputusan_miclass` → `kunci` | `keputusan_atp` |
| ATP lama tanpa `kunci` | dipetakan balik dari labelnya | `keputusan_atp` |
| tidak ada keputusan | `null` | — |

**Modul tidak memilih ulang**, dan tidak ada resolver paralel: nama pertanyaan
diambil dari `DELEGASI_SEMANTIK` milik ATP, bukan ditulis ulang, sehingga
perubahan nama di sana tidak memutus pencarian di sini. Nilai yang dikembalikan
enum yang sama persis dengan yang ATP pakai.

Prompt menegaskan batasnya:

> Porsi konteks SUDAH ditetapkan di ATP. Program keahlian hanya menentukan
> keautentikan situasi kerja bila dipakai, BUKAN berapa banyak yang berlatar kerja.

---

## H. TEACHER PRIORITY INHERITANCE

Dua hal diwariskan, bukan satu:

1. **Penekanan yang guru pilih** — `prioritasDipilih(cd)` milik ATP, lengkap
   dengan `arti` dan `arahan` penerapannya. Bukan hanya nama.
2. **Jejak penerapannya di ATP** — `ATP_HASIL…penerapan_prioritas`, disaring ke
   TP yang sedang disusun (`untuk_tp_ini`) sambil **mempertahankan seluruhnya**
   (`seluruh_atp`) supaya asal-usulnya tetap dapat ditelusuri.

Tiap entri yang diteruskan membawa `prioritas`, `tp`, `pengaruh`, dan `alasan` —
diperiksa M2-J. Guru tanpa penekanan tidak menerima penekanan karangan (M2-I).

Kausalitas semantiknya diuji M6; M2 hanya memastikan informasinya sampai.

---

## I. READINESS / VOCATIONAL / STUDENT CONTEXT

`atp_context` membawa ketiganya dengan **asal yang dibedakan** (§16):

```ts
export type Asal = 'fakta' | 'keputusan_guru' | 'keputusan_atp';
```

`kesiapan = jauh_di_bawah` dan `konteks_tugas = seimbang` bukan jenis data yang
sama — yang pertama gambaran keadaan, yang kedua keputusan, dan keputusan itu
bisa milik guru atau milik MiClass. Struktur ini kecil dengan sengaja: tiga nilai
enum, bukan framework.

- **Kesiapan** diteruskan apa adanya, tanpa tafsir baru. Amplop `{ value, … }`
  maupun nilai telanjang sama-sama dibaca; belum dijawab → `belum_diketahui`,
  bukan tebakan (M2-K). Perilaku pedagogis turunannya adalah M6.
- **Program keahlian** ditandai `fakta`, bukan keputusan — dan tidak menjadi
  perintah "semua harus dunia kerja". Porsi tetap milik A17 (M2-L).
- **Jumlah murid** tetap dari `rancang_settings`, sumber yang sudah benar dan
  yang dipakai validator waktu. Tidak ada salinan baru dengan sumber lain (M2-M).

---

## J. PHASE A/B/C/B2/D INHERITANCE

Satu amplop dibangun sekali; tiap fase menerima **irisan** yang benar-benar ia
perlukan. Menyusunnya di satu tempat mencegah tiga salinan yang menyimpang
diam-diam.

| Fase | Menerima | Tidak menerima | Alasan |
|---|---|---|---|
| **A** | `warisan_atp.tp` + `.konteks` + larangan | alokasi mentah (sudah lewat `jumlah_pertemuan`) | menyusun KKTP, asesmen, materi |
| **B** | `.tp` + `.konteks` + **`alokasi_server`** | — | menyusun pertemuan dan waktu |
| **C** | `.tp` + `.konteks` + larangan | **alokasi waktu** | menyusun ISI instrumen, bukan jadwal |
| **B2** | rujukan yang sudah ada (Fase A/B/C) | — | Naskah tidak diredesain di M2 |
| **D** | menggabung; jejak warisan ikut ke dokumen final | — | tidak menghasilkan ulang keputusan ATP |

M2-P membuktikan Fase C **tidak** menerima `alokasi_server` — bukan sekadar
tidak memakainya.

---

## K. STORED TRACE IN MODULE

Pewarisan tidak boleh hanya hidup di prompt yang sekali pakai: tanpa jejak
tersimpan, tidak ada yang bisa membuktikan sesudahnya bahwa modul ini disusun
dari CP versi apa, tuntutan apa, dan keputusan ATP yang mana.

Dipaku di **Fase A** bersama draft:

```ts
    const jejakWarisan = {
      tp_anchor: { ...tpAnchor, tuntutan: tuntutanTerurai,
                   tuntutan_id: tpAnchor.tuntutan, kategori_teks_wajib: kategoriWajib },
      atp_context:    atpContext,
      alokasi_server: alokasiTp,
    };
    const draftA = { ...kontenObj, ...jejakWarisan, _draft: { fase_a: faseAOutput } };
```

dan **ikut ke dokumen final** di Fase D, yang menyusun `konten` dari nol. Tanpa
langkah kedua itu jejaknya hilang persis pada dokumen yang paling lama hidup.

`tuntutan_id` disimpan berdampingan dengan bentuk kayanya — itu yang membuat
hash M1 tetap dapat dihitung ulang dari dokumen tersimpan tanpa menebak.

Tidak ada migration baru. `konten` sudah `jsonb`. Sesuai §17, **tidak ada
`atp_context_hash`**: buktikan dulu pewarisannya berjalan; kesegaran konteks
diputuskan setelah bukti semantik M6.

---

## L. DETERMINISTIC TESTS

`tests/modul-warisan.test.ts` — **20 passed / 0 failed**.

| | Menguji |
|---|---|
| M2-A | `jumlah_pertemuan` dari `jp_pertemuan` anchor; sebaran seragam memberi angka persis |
| M2-B | fixture negatif §19: server `[2,2,4]` vs salinan klien `[4,4]` → server menang; builder hanya menerima anchor |
| M2-C | ID → kompetensi & lingkup materi **yang nyata di acuan**; `cakupan_wajib` ikut hanya bila acuan menuntutnya |
| M2-D | ID asing → `MODUL_TUNTUTAN_TIDAK_DIKENAL`; acuan hilang → `MODUL_ACUAN_CP_TIDAK_TERSEDIA` |
| M2-E | kategori TP **dan** kategori wajib dari `cakupan_wajib` |
| M2-F | `versi_cp` dari amplop ATP, bukan string prompt |
| M2-G | A17 eksplisit → `keputusan_guru`, nilai sama dengan pilihan guru |
| M2-H | A17 delegasi → `keputusan_atp`; ATP lama tanpa `kunci` dipetakan balik; tanpa keputusan → `null` |
| M2-I | penekanan diteruskan lengkap; tanpa penekanan → tidak dikarang |
| M2-J | penerapan disaring ke TP ini dengan `pengaruh`/`alasan` utuh; seluruh ATP tetap tersimpan |
| M2-K | kesiapan tanpa tafsir baru; amplop `{value}` terbaca; kosong → `belum_diketahui` |
| M2-L | program keahlian = `fakta`, porsi tetap milik A17 |
| M2-M | jumlah murid satu sumber, `fakta`, null tetap null |
| M2-N | Fase A menerima amplop warisan yang berpangkal pada anchor server |
| M2-O | alokasi hanya dari anchor; `selected_tp`/`jpPertemuanArr`/`PILIH_TP` **hilang**; Fase B menerima `alokasi_server` |
| M2-P | Fase C menerima tuntutan & kategori, **tanpa** alokasi waktu |
| M2-Q | jejak dipaku di Fase A **dan** ikut ke dokumen final Fase D; `tuntutan_id` berdampingan |
| M2-R | representasi kaya tidak mengubah `tp_snapshot_hash`; hash stabil; produksi tetap menghitung dari anchor |
| M2-S | gerbang M1 utuh dan mendahului seluruh pekerjaan M2; tabel kebenarannya tidak bergeser |
| M2-T | `tp_kktp` tetap tidak dibaca; nol ID/mapel yang ditulis keras di Modul maupun `warisan.ts` |

M2-N sampai M2-T memeriksa **sumber kirimnya sendiri**, bukan salinan
logikanya — pola yang sama dengan M1-N…M1-AC dan `tests/atp-trace.mjs`.

---

## M. M1 REGRESSION

```
$ deno test --allow-read tests/modul-anchor.test.ts
ok | 29 passed | 0 failed
```

Tiga assertion struktural M1 menyebut **pembawa** data, dan M2 mengganti
pembawanya: `params.tpAnchor` → `params.warisan`, `tp_anchor` → `warisan_atp.tp`.
Ketiganya disesuaikan ke pembawa baru dengan sifat yang dijaga **sama atau lebih
kuat**:

| | Sebelum | Sesudah |
|---|---|---|
| M1-O | `buildUserMessageFaseA({…tpAnchor` | `…warisan` **+** amplopnya wajib berpangkal pada `tpAnchor: tpAnchor` |
| M1-O | `tuntutan_cp: params.tpAnchor.tuntutan` (ID) | `tuntutan_cp: w.tuntutan.map` (ID **+ makna**) |
| M1-P | instruksi menyebut `tp_anchor` | menyebut `warisan_atp.tp` |
| M1-X | `tp_teks: params.tpAnchor.tp_judul` | `params.warisan.tpAnchor.tp_judul` — sumber yang sama |

**Nol assertion dilonggarkan.** Yang dijaga tetap: potret server sampai ke Fase
A, membawa tuntutan dan kategori, judul dari anchor, KKTP disusun dari potret.
M2-S menambah lapisan: gerbang M1 masih ada, masih menerima kedua tanda M1.1,
dan tabel kebenarannya diuji ulang nilai per nilai.

---

## N. ATP REGRESSION

```
$ deno test --allow-read tests/atp-kontrak.test.ts
ok | 60 passed | 0 failed

$ node tests/atp-acuan-sinkron.mjs      LULUS
$ node tests/atp-trace.mjs --periksa    LULUS
```

`generate-atp` — EF maupun `kontrak.ts` — **tidak disunting satu baris pun**.
M2 hanya membacanya. CP dan acuan tidak disentuh.

---

## O. MODULE REGRESSION

```
$ deno run --allow-read --allow-write tests/validator-modul.ts
✓ tp02 0 · ✓ tp03 0 · ✓ tp04 0 · ✓ tp05 1 · ✓ tp06 1
Semua 5 contoh sesuai harapan.

$ deno check  anchor.ts · warisan.ts · generate-modul/index.ts · generate-atp/index.ts   ok
$ node --check rancang-chat.js                                                            ok
```

Jumlah temuan kelima contoh **sama persis**. Menambah `tp_anchor`,
`atp_context`, dan `alokasi_server` ke dokumen final tidak mengubah penilaian
mutu: validator memeriksa field yang ada, tidak melarang yang lain.

---

## P. FILES CHANGED

| Berkas | Perubahan |
|---|---|
| `supabase/functions/generate-modul/warisan.ts` | **baru** — `uraikanTuntutan`, `kategoriWajibDariTuntutan`, `alokasiPertemuanDariAnchor`, `konteksTugasEfektif`, `bacaAtpHasil`, `bangunAtpContext`, tipe `Asal`/`AtpContext` |
| `tests/modul-warisan.test.ts` | **baru** — M2-A…M2-T |
| `supabase/functions/generate-modul/index.ts` | alokasi dari anchor; `tuntutanTerurai` + `atpContext` + amplop `warisan`; `warisanTp()`/`warisanKonteks()`/`LARANGAN_WARISAN`; Fase A/B/C menerima irisannya; jejak di draft Fase A dan di dokumen final Fase D |
| `tests/modul-anchor.test.ts` | tiga assertion struktural disesuaikan ke pembawa baru (§M) |

Tidak disentuh: `generate-atp` (EF dan kontrak), CP dan acuan, migration,
`tp_kktp`, klien, renderer, Naskah, validator mutu Modul.

---

## Q. EVIDENCE

`docs/MODULE-M2-ATP-INHERITANCE-EVIDENCE.diff` — 1.143 baris (938 penambahan,
55 penghapusan), hanya perubahan sesudah checkpoint `8ea0c36`. Bukti M1
(`MODULE-M1-IDENTITY-EVIDENCE.diff`, `MODULE-M1-IDENTITY-HARDENING-EVIDENCE.diff`)
tidak dihapus dan sudah masuk commit.

---

## R. REMAINING M2 GAPS

1. **Pewarisan sampai, penegakan belum.** `kategori_teks_wajib` kini diterima
   setiap fase yang menyusun materi dan instrumen, tetapi tidak ada yang menolak
   modul yang mengabaikannya. Itu **M5** dengan sengaja (§5 tugas).
2. **Kausalitas belum diuji.** M2 membuktikan informasi sampai, bukan bahwa ia
   mengubah keputusan. Kesiapan, A17, dan penekanan guru baru diuji sebagai
   sebab di **M6**.
3. **`atp_context` tidak berversi.** Kalau ATP berubah pada bagian yang bukan
   TP — misalnya guru mengganti penekanan — Modul yang sudah jadi tidak
   mendeteksinya; `tp_snapshot_hash` hanya menjaga TP. Sesuai §17 ini
   **dibiarkan** sampai M6 memberi bukti bahwa kesegaran konteks memang penting.
4. **Naskah (B2) belum menerima warisan langsung.** Ia mewarisi lewat Fase A/B/C
   seperti sebelumnya. Redesainnya M7.
5. **Renderer belum menampilkan jejak.** `tp_anchor` dan `atp_context` tersimpan
   tetapi tidak terlihat guru. M8.
6. **Belum ada uji terhadap basis data.** Seluruh bukti M2 berasal dari uji
   deterministik dan pembacaan sumber; tidak ada model dipanggil dan tidak ada
   query produksi.
7. **Impor lintas fungsi belum diuji di deploy.** `generate-modul` kini
   mengimpor `../generate-atp/kontrak.ts`. `deno check` bersih dan polanya sama
   dengan `_shared/`, tetapi bundling Supabase baru terbukti saat deploy — yang
   memang belum boleh dilakukan.

---

## S. RECOMMENDATION (M2 — digantikan §T)

# MODULE M2 — READY FOR REVIEW

Kesenjangan pewarisan yang contract lock catat sudah tertutup, dan tertutup
dengan satu otoritas per nilai:

- **Alokasi pertemuan** kini hanya dari potret server; jalur salinan klien
  dicabut sampai namanya tidak lagi ada di berkas.
- **Tuntutan CP** sampai beserta kompetensi, lingkup materi, dan cakupan
  wajibnya — diambil dari acuan yang sama yang ATP pakai, tanpa satu pun teks
  yang disalin dan tanpa mapel yang ditulis keras.
- **Keputusan ATP** — A17 yang berlaku, penekanan guru dan penerapannya,
  kesiapan, program keahlian, jumlah murid, semester, versi CP — sampai dengan
  asal yang dibedakan antara fakta, keputusan guru, dan keputusan ATP.
- **Jejaknya tersimpan** di dokumen Modul, bukan hanya di prompt sekali pakai.
- **`tp_snapshot_hash` M1 tidak bergeser sedikit pun**, meski representasi
  tuntutan kini jauh lebih kaya.

ATP 60/60 hijau, M1 29/29 hijau, M2 20/20, kelima contoh validator memberi
jumlah temuan yang sama. Nol assertion dilonggarkan. Nol panggilan model.

Sesuai §25 dan §26: **belum di-commit, dan berhenti di sini.** Tidak ada push,
deploy, migrasi produksi, atau tulisan ke basis data produksi. M3 tidak dimulai.

---

## T. M2.1 — AUTHORITY + PROVENANCE HARDENING

Reviewer menahan penerimaan M2 karena empat celah. Seluruh bukti M2 di atas
tetap berlaku dan tidak dihapus; bagian ini menambahinya.

Keempatnya satu bentuk yang sama: **keadaan kelas SEKARANG dipakai menentukan
arti ATP yang SUDAH DITERIMA**, atau asal sebuah nilai dicatat keliru.

### T.1 Reproduksi empat cacat — dari sumber aktual

**A. Otoritas CP dari settings, bukan dari ATP.**

```ts
    tuntutanTerurai = uraikanTuntutan(
      settings?.mapel ?? '', settings?.fase ?? '', tpAnchor.tuntutan);
```

`tpAnchor` berasal dari ATP; arti ID tuntutannya diambil dari `rancang_settings`.
Lebih dari sekadar tidak rapi: kelas yang mapel atau fasenya kemudian diubah
membuat ID yang sama berarti lain — atau, seperti pada fixture M2-U, tidak
berarti apa-apa sama sekali karena acuannya tidak ada. Baris ATP bahkan **tidak
mengambil** `mapel` dan `fase`:

```ts
    .select('elemen_cp, collected_data, progresi_tp')
```

**B. Program keahlian dari settings, bukan dari potret ATP.**

```ts
    programKeahlian: settings?.program_keahlian ?? null,
```

padahal ATP menyusun dirinya dari `collected_data.KONTEKS_CP.program_keahlian`.
Dan ada **dua** jalur paralel lain:

```ts
    program_keahlian: settings?.program_keahlian ?? '',        // identitas_db → Fase A
    buildUserMessageFaseC({ …, programKeahlian: settings?.program_keahlian ?? '', warisan })
```

`identitas_db` bukan jalur sepele — SYSTEM_PROMPT menyatakan sendiri:

> Field program_keahlian dari identitas_db menentukan seluruh konteks dunia
> kerja modul.

Jadi sampai M2 ada tiga sumber untuk satu nilai, dan yang menang justru bukan ATP.

**C. Kesiapan dicatat sebagai keputusan.**

```ts
      asal:  'keputusan_guru',
```

Kesiapan adalah keadaan yang guru laporkan, bukan keputusan pedagogis seperti
A17. Menandainya sama persis menghapus perbedaan yang taksonomi ini dibuat untuk
menjaga.

**D. Daftar tuntutan kosong lolos di jalur penyusunan.**

```ts
  if (!ids.length) return [];
```

Alasannya — "ATP lama tetap boleh dibuka" — benar untuk MEMBACA, tetapi fungsi
ini hanya dipanggil saat MENYUSUN. Modul yang lahir dari TP tanpa kontrak
tuntutan menurunkan KKTP, materi, dan instrumennya dari **judul**: persis
pengetahuan-nol yang M1 dan M2 tutup.

### T.2 Otoritas mapel dan fase: baris ATP

```ts
  const atpMapel = String((atp as Record<string, unknown>).mapel ?? '').trim();
  const atpFase  = String((atp as Record<string, unknown>).fase  ?? '').trim();
  if (!atpMapel || !atpFase) { return json({ …, code: KODE_LAYANAN_CP }, 422); }
  …
  tuntutanTerurai = uraikanTuntutan(atpMapel, atpFase, tpAnchor.tuntutan);
```

Baris ATP kini mengambil `mapel, fase, jenjang`. **Tidak ada jalan mundur ke
settings**: menebak identitas ATP dari keadaan kelas sekarang adalah persis
kekeliruan yang sedang ditutup. M2-V memeriksa sumber dan menuntut
`!/uraikanTuntutan\([^)]*settings/`.

`identitas_db` ikut: `mapel`, `fase`, dan `program_keahlian` kini dari potret
ATP; `nama_guru`, `tahun_ajaran`, dan semester administratif tetap dari settings
karena memang keadaan kelas.

### T.3 Keamanan versi CP — reuse, bukan salin

```ts
export function periksaLayananCp(mapel, fase, versiCpDiwarisi) {
  const s = statusLayanan(mapel, fase);        // helper ATP
  …
  if (s.didukung && versiCpDiwarisi !== versiAcuan) alasan.push(…);
}
```

`statusLayanan()` milik ATP sudah memeriksa versi berlaku, versi tercabut,
status telaah, dan cakupan layanan. Yang ditambahkan hanya satu pemeriksaan yang
memang milik Modul: **versi CP yang diwarisi harus sama dengan acuan yang
berlaku** — ATP di atas CP lama boleh tetap dibaca, tetapi Modul baru tidak
boleh lahir darinya diam-diam.

Nol daftar versi disalin. M2-V menuntut `!/046\/H\/KR\/2025/` di
`generate-modul`.

### T.4 Program keahlian: potret ATP

```ts
    program_keahlian: { nilai: teksJawaban(p.cd, 'KONTEKS_CP', 'program_keahlian'), asal: 'fakta' },
```

dibaca lewat `jawaban()` milik ATP, yang sudah menangani amplop `{ value, … }`.
Parameter `programKeahlian` **dihapus** dari `bangunAtpContext`.

ATP historis tanpa snapshot → **null**, bukan ditebak dari keadaan sekarang
(M2-W). Menebak bahwa nilai hari ini adalah nilai yang dulu dipakai memalsukan
riwayat; prompt sudah punya jalannya sendiri ("Jika program_keahlian kosong:
gunakan konteks SMK umum").

### T.5 Otoritas paralel Fase C dihapus

Parameter `programKeahlian` **hilang seluruhnya** dari `buildUserMessageFaseC`
dan dari payload-nya — bukan sekadar tidak dipakai. M2-X menuntut
`!/programKeahlian/` di seluruh berkas. Fase C kini menerima program keahlian
lewat `warisan_atp.konteks`, sama dengan Fase A dan B.

### T.6 Asal-usul kesiapan

```ts
      asal:  'fakta',
      dasar: dasarProfilMurid(p.cd) || null,
```

`'fakta'` di sini berarti **"keadaan yang tercatat menurut informasi guru"** —
bukan klaim kebenaran objektif. Seberapa kuat dasarnya dinyatakan terpisah.

`dasar` diwarisi dari field yang benar-benar ada di ATP
(`PROFIL_SISWA.dasar_informasi_kesiapan`), lewat `dasarProfilMurid()` milik ATP:
hasil penilaian, pengamatan, gabungan, atau pengakuan bahwa informasinya belum
cukup. **Nol framework bukti baru**, nol kalimat buatan — M2-AF membuktikan
nilainya berubah mengikuti jawaban dan bahwa kesiapan yang belum diketahui
ditandai sebagai asumsi.

Sesudah ini `kesiapan = jauh_di_bawah` (`fakta`) dan `A17 = kehidupan`
(`keputusan_guru`) tidak lagi punya jenis asal yang sama — diuji M2-Y.

### T.7 Gerbang tuntutan kosong

```ts
  if (!ids.length) {
    throw Object.assign(new Error('ATP ini tidak mencatat tuntutan Capaian Pembelajaran …'),
      { code: KODE_TUNTUTAN_KOSONG });   // MODULE_TP_TUNTUTAN_TIDAK_TERSEDIA
  }
```

Pesannya menjelaskan bahwa yang hilang adalah kontrak tuntutan dan bahwa ATP-nya
perlu disusun ulang. Tidak ada model yang disuruh menebak dari judul, dan tidak
ada KKTP yang disusun dari judul saja.

### T.8 Kompatibilitas jalur baca

Gerbang §T.7 **hanya** hidup di `generate-modul`. Membuka, melihat, dan mengunduh
Modul lama tidak melewatinya sama sekali: klien membaca `modul_induk` lewat
`select` biasa. M2-AC memeriksa ketiga berkas klien (`rancang-chat`,
`rancang-chat-api`, `classroom-unduh`) dan menuntut nol pemakaian
`uraikanTuntutan`/`periksaLayananCp` di sana, plus tepat satu titik panggil di
EF.

Nol migrasi, nol backfill, nol tuntutan hasil tebakan yang ditulis.

### T.9 Jumlah murid — sengaja tidak diubah

Tetap dari `rancang_settings`, tetap `asal: 'fakta'`, tetap satu angka dengan
validator waktu. §7 tugas benar: ini bukan cacat yang sedang diperbaiki, dan
jumlah murid memang keadaan hari ini, bukan keputusan yang ATP ambil. M2-AE
menjaga agar prompt dan validator tidak berpisah sumber.

### T.10 Tests M2.1

`tests/modul-warisan.test.ts` — **33 passed / 0 failed** (20 lama + 13 baru).

| | Menguji |
|---|---|
| M2-U | ATP Bahasa Inggris/E vs settings Matematika/F → penguraian memakai ATP; kombinasi settings terbukti **gagal**, jadi fixture-nya benar-benar kontras |
| M2-V | mapel/fase dibaca dari baris ATP; select-nya mengambil keduanya; ketiadaannya → 422; nol pemakaian settings; nol daftar versi disalin |
| M2-V2 | `periksaLayananCp` memakai `statusLayanan()`; kombinasi tanpa acuan gagal; versi warisan berbeda ditolak dan disebut alasannya; versi kosong tidak menambah alasan sendiri |
| M2-W | program keahlian dari potret ATP; parameter settings hilang; ATP tanpa snapshot → `null`, bukan tebakan |
| M2-X | nol `programKeahlian` di seluruh EF; `identitas_db` juga berpangkal pada potret ATP |
| M2-Y | `kesiapan_murid.asal === 'fakta'`, dan jenisnya berbeda dari A17 |
| M2-Z | A17 eksplisit tetap `keputusan_guru` |
| M2-AA | A17 delegasi tetap `keputusan_atp` |
| M2-AB | daftar kosong → `MODULE_TP_TUNTUTAN_TIDAK_TERSEDIA`; nama kode stabil; pesan menyebut kontrak tuntutan; kode diteruskan ke pemanggil |
| M2-AC | tiga berkas klien tidak menjalankan gerbang; jalur baca tetap `select`; satu titik panggil di EF |
| M2-AD | fixture otoritas negatif dua sumbu: program ATP Tata Busana vs settings Teknik Otomotif, CP ATP BI/E vs settings MTK/F → potret ATP menang di keduanya |
| M2-AE | jumlah murid satu sumber `rancang_settings`, dipakai prompt **dan** validator |
| M2-AF | `dasar` kesiapan dari field ATP nyata; berubah mengikuti jawaban; belum diketahui → ditandai asumsi |

### T.11 Uji lama yang disesuaikan — BEFORE/AFTER

Tiga assertion M2 menyebut hal yang **memang sengaja dibalik** atau yang
pembawanya berubah. Tidak satu pun properti semantiknya dilonggarkan:

| | BEFORE | AFTER | Alasan |
|---|---|---|---|
| M2-C | `assertEquals(uraikanTuntutan(…, []), [])` | assertion dihapus, digantikan M2-AB yang menuntut **kegagalan** | itulah cacat D yang dibalik §T.7 |
| M2-K | `asal === 'keputusan_guru'` | `asal === 'fakta'` | cacat C |
| M2-L | nilai dari parameter `programKeahlian` | nilai dari potret ATP; fixture menambah `KONTEKS_CP` | cacat B |

Fixture `atpServer()` bertambah satu baris — `KONTEKS_CP.program_keahlian:
'Tata Busana'` — karena program keahlian kini memang dibaca dari sana. Itu
mengubah **masukan** fixture, bukan ketatnya assertion, dan §15 meminta hal ini
dijelaskan sebelum hasilnya diterima.

### T.12 Regresi M2.1

```
ATP             : 60 passed / 0 failed · sinkron LULUS · trace LULUS
Module M1       : 29 passed / 0 failed
Module M2+M2.1  : 33 passed / 0 failed
deno check      : anchor.ts · warisan.ts · generate-modul · generate-atp — ok
node --check    : rancang-chat.js — ok
validator Modul : tp02 0 · tp03 0 · tp04 0 · tp05 1 · tp06 1 — jumlah temuan SAMA
```

Nol panggilan model. Nol migration baru — M2.1 seluruhnya cara **membaca** data
yang sudah ada.

### T.13 Risiko integrasi yang belum terbukti

`generate-modul` mengimpor `../generate-atp/kontrak.ts`, dan M2.1 menambah
ketergantungan itu (`statusLayanan`, `jawaban`, `dasarProfilMurid`).
Menyalinnya akan melanggar satu-kebenaran, jadi impornya dipertahankan.

**Yang belum dibuktikan:** apakah bundler Supabase benar-benar mengikuti impor
relatif ke direktori fungsi tetangga saat deploy. `deno check` bersih, dan
polanya menyerupai `_shared/`, tetapi kemiripan pola **bukan bukti** — tidak ada
fungsi di repo ini yang saat ini mengimpor dari `_shared/` maupun dari fungsi
lain, jadi tidak ada preseden yang berhasil untuk ditunjuk. Ini risiko deploy
yang terbuka, dan tempat pembuktiannya adalah deploy pertama — yang memang belum
boleh dilakukan. Memindahkan berkas ke `_shared/` tidak dilakukan sekarang
karena belum ada bukti bahwa impor tetangga gagal.

---

# MODULE M2.1 — READY FOR REVIEW  *(status digantikan §U)*

Keempat cacat ditutup di tempat yang benar, dan seluruhnya dengan aturan yang
sama: **identitas dan keputusan yang milik ATP berasal dari baris/potret ATP.**

- **Mapel dan fase** yang menentukan arti tuntutan kini dari baris ATP;
  ketiadaannya menghentikan penyusunan, tanpa jalan mundur ke settings.
- **Program keahlian** dari potret `KONTEKS_CP` ATP, dan ketiga jalur paralelnya
  — `atp_context`, `identitas_db`, dan parameter Fase C — dijadikan satu.
- **Kesiapan** dicatat sebagai keadaan (`fakta`) dengan dasarnya diwarisi dari
  field ATP yang nyata, sehingga tidak lagi sejenis dengan A17.
- **TP tanpa kontrak tuntutan** menghentikan penyusunan Modul, sementara jalur
  membaca dan mengunduh dokumen lama tidak tersentuh sama sekali.

Ditambah satu gerbang yang §4 minta: layanan CP diperiksa lewat `statusLayanan()`
milik ATP, tanpa satu pun daftar versi disalin.

Jumlah murid sengaja **tidak** dipindahkan — ia fakta operasional, dan §7 benar
bahwa itu bukan cacat yang sedang diperbaiki.

ATP 60/60, M1 29/29, M2+M2.1 33/33, kelima fixture jumlah temuan sama. Nol
assertion dilonggarkan; tiga yang berubah dijelaskan BEFORE/AFTER di §T.11.

Sesuai §19 dan §20: **belum di-commit, dan berhenti di sini.** Tidak ada push,
deploy, migrasi produksi, atau tulisan ke basis data produksi. M3 tidak dimulai.

---

## U. M2.2 — GERBANG VERSI CP YANG DAPAT DIBUKTIKAN

Reviewer menerima seluruh koreksi M2.1 dan menemukan satu celah terakhir, tepat
di gerbang yang M2.1 sendiri pasang.

### U.1 Cacat yang direproduksi

`periksaLayananCp()` sesudah M2.1:

```ts
  if (s.didukung && versiCpDiwarisi && versiAcuan && versiCpDiwarisi !== versiAcuan) {
    alasan.push(`ATP ini disusun di atas CP ${versiCpDiwarisi}, sedangkan acuan …`);
  }
```

Syaratnya berbunyi **"kalau ada dan berbeda, tolak"** — sehingga ATP yang tidak
mencatat versinya sama sekali justru **lolos**. Dijalankan apa adanya:

```
"046/H/KR/2025"    didukung= true   (tanpa alasan)
"032/H/KR/2024"    didukung= false  ATP ini disusun di atas CP 032/H/KR/2024 …
null               didukung= true   (tanpa alasan)      ← CACAT
""                 didukung= true   (tanpa alasan)      ← CACAT
```

Dan M2-V2 justru **mengunci** perilaku itu:
`assertEquals(periksaLayananCp(MAPEL, FASE, null).didukung, true)`.

Akibatnya ATP yang provenance versinya tidak dapat dibuktikan diperlakukan
diam-diam seolah berpangkal pada acuan yang berlaku. **Versi tidak diketahui
bukan versi yang cocok.**

### U.2 Perbaikan

```ts
  if (s.didukung) {
    if (!diwarisi) {
      alasan.push('ATP ini tidak mencatat versi Capaian Pembelajaran yang dipakai ketika ia disusun, '
        + 'sehingga tidak dapat dipastikan bahwa TP-nya berpangkal pada acuan yang berlaku sekarang. '
        + 'Susun ulang ATP-nya lebih dulu.');
    } else if (!versiAcuan) {
      alasan.push('Acuan CP yang berlaku tidak menyebutkan versinya, sehingga kecocokan tidak dapat diperiksa.');
    } else if (diwarisi !== versiAcuan) {
      alasan.push(`ATP ini disusun di atas CP ${diwarisi}, sedangkan acuan yang berlaku sekarang ${versiAcuan}.`);
    }
  }
```

Untuk menyusun Modul baru, ketiga syarat harus terpenuhi sekaligus: versinya
**tercatat**, kombinasinya **dilayani** menurut `statusLayanan()`, dan versi
warisan **sama** dengan acuan yang berlaku. `String(...).trim()` membuat `''`
dan spasi diperlakukan sama dengan `null` — ketiganya keadaan yang sama.

Cabang `!versiAcuan` adalah penjaga keadaan mustahil: `statusLayanan()` hanya
melaporkan `didukung` bila acuannya ada. Ia dipasang supaya kalau anggapan itu
suatu hari tidak lagi benar, yang terjadi adalah berhenti dengan sebab tertulis
— bukan lolos tanpa jejak.

Sesudahnya:

```
"046/H/KR/2025"    didukung= true
"032/H/KR/2024"    didukung= false
null / "" / "   "  didukung= false  ATP ini tidak mencatat versi Capaian Pembelajaran …
Matematika/F       didukung= false  (sebab dari statusLayanan, versi apa pun)
```

### U.3 Tidak diketahui bukan berarti lama

`versi_cp` kosong **tidak** berarti "ATP lama, pasti CP sebelumnya". Menebak
begitu sama mengarangnya dengan menebak bahwa ia CP sekarang — hanya ke arah
yang berlawanan. Statusnya **TIDAK TERVERIFIKASI**, dan pesan kepada guru
menyatakannya persis begitu: menyebut bahwa versinya tidak tercatat, bahwa
karena itu kecocokannya tidak dapat dipastikan, dan bahwa jalan keluarnya
menyusun ulang ATP. M2-AL menuntut pesan itu **tidak** menyebut nomor versi mana
pun dan **tidak** memakai kata "lama", "kedaluwarsa", atau "dicabut".

Yang ditutup secara konservatif hanya jalur menyusun. Yang salah bila dibiarkan
terbuka bukan dokumen yang tertunda, melainkan Modul yang lahir di atas
kompetensi yang tidak dapat dipertanggungjawabkan asalnya.

### U.4 Tidak ada backfill

Nol migration, nol pengisian `versi_cp` historis, nol tebakan dari mapel/fase,
nol perubahan pada ATP lama maupun `tp_snapshot_hash` lama. Guru yang ingin
membuat Modul dari ATP legacy tanpa versi menyusun ulang ATP-nya lewat alur
yang sekarang — yang selalu mencatat versinya.

### U.5 Jalur membaca tidak tersentuh

Membuka, melihat, dan mengunduh Modul maupun ATP lama tetap berjalan. M2-AM
memeriksa ketiga berkas klien dan menuntut nol pemakaian `periksaLayananCp`
atau `versi_acuan` di sana, plus tepat satu titik panggil di Edge Function.

### U.6 Urutan gerbang

Diuji M2-AM, dari sumber:

```
gerbang anchor M1     (periksaAnchor)
  ↓
gerbang versi CP      (periksaLayananCp)
  ↓
penguraian tuntutan   (uraikanTuntutan)
  ↓
panggilan model
```

Gerbang anchor M1 **tidak diubah**.

### U.7 Tests

`tests/modul-warisan.test.ts` — **41 passed / 0 failed** (33 sebelumnya + 8 baru).

| | Menguji |
|---|---|
| M2-AG | versi warisan sama persis dengan acuan berlaku → lolos, nol alasan; versinya dibaca dari acuan, bukan angka mati |
| M2-AH | versi berbeda → ditolak, dan alasannya menyebut **kedua** versi |
| M2-AI | versi `null` → ditolak; tepat satu sebab; kombinasinya sendiri terbukti dilayani |
| M2-AJ | `''`, spasi, dan tab → ditolak, dengan alasan yang **sama persis** dengan `null` |
| M2-AK | kombinasi tak dilayani → ditolak untuk versi apa pun; sebabnya dari `statusLayanan()`, bukan dari pemeriksaan versi |
| M2-AL | pesan menyatakan tidak terverifikasi + memberi jalan keluar; **tidak** menyebut nomor versi dan **tidak** menuduh CP lama |
| M2-AM | tiga berkas klien tidak menjalankan gerbang; satu titik panggil di EF; urutan gerbang benar |
| M2-AN | nol nomor versi ditulis keras di `index.ts`, `warisan.ts`, maupun `anchor.ts`; otoritasnya `statusLayanan()` |

Satu assertion lama dikoreksi, dan koreksinya memang inti M2.2:

| | BEFORE | AFTER |
|---|---|---|
| M2-V2 | `periksaLayananCp(MAPEL, FASE, null).didukung === true` | `=== false` |

Itu bukan pelonggaran melainkan pembalikan yang disengaja: assertion lama
mengunci cacatnya.

### U.8 Regresi M2.2

```
ATP                : 60 passed / 0 failed · sinkron LULUS · trace LULUS
Module M1          : 29 passed / 0 failed
Module M2/2.1/2.2  : 41 passed / 0 failed
deno check         : anchor.ts · warisan.ts · generate-modul · generate-atp — ok
node --check       : rancang-chat.js — ok
validator Modul    : tp02 0 · tp03 0 · tp04 0 · tp05 1 · tp06 1 — jumlah temuan SAMA
```

Nol panggilan model. Nol migration. Berkas yang berubah: `warisan.ts`
(satu fungsi) dan `tests/modul-warisan.test.ts`.

---

# MODULE M2.2 — READY FOR REVIEW

Celah terakhir ditutup di tempat yang sama dengan gerbangnya: menyusun Modul
baru kini menuntut versi CP yang **tercatat**, kombinasi yang **dilayani**, dan
versi warisan yang **sama** dengan acuan yang berlaku — ketiganya, bukan dua.

Versi yang tidak diketahui diperlakukan sebagai tidak terverifikasi, bukan
sebagai cocok dan bukan pula sebagai lama. Nol nomor versi ditulis keras;
otoritasnya tetap `statusLayanan()` milik ATP. Jalur membaca dokumen lama tidak
tersentuh, dan tidak ada satu baris data historis pun yang diubah.

ATP 60/60, M1 29/29, M2+M2.1+M2.2 41/41, kelima fixture jumlah temuan sama.
Satu assertion lama dibalik dengan sengaja dan dijelaskan di §U.7.

Sesuai §11 dan §12: **belum di-commit, dan berhenti di sini.** Tidak ada push,
deploy, migrasi, atau tulisan ke basis data produksi. M3 tidak dimulai.
