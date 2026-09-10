# MODULE M3 — SATU OTORITAS BENTUK KELUARAN MODUL

**Tanggal:** 10 September 2026
**Lingkup:** M3 saja. M4–M9 tidak dikerjakan.
**Belum di-commit** — menunggu penerimaan reviewer (§24).
**Tidak ada panggilan model.** M3 adalah konsolidasi bentuk, bukan semantik.

> **§A–§T menggambarkan M3. Satu pernyataannya DIKOREKSI di §U (M3.1):** §I
> menyebut kedua jalur perbaikan memakai perintah yang sama — benar, tetapi
> lingkupnya keliru pada perbaikan per fase. Bila §I dan §U bertentangan, §U
> yang berlaku.

---

## A. M2 ACCEPTED BASELINE COMMIT

```
$ git log -3 --oneline
3152f53 feat: inherit accepted ATP contract into modules
8ea0c36 feat: bind modules to ATP TP snapshots
8b3a17a feat: finalize contextual ATP generation
```

# MODULE M2 ACCEPTED BASELINE COMMIT = `3152f53`

Verifikasi sebelum staging — seluruhnya cocok dengan yang diminta:

```
ATP        : 60 passed / 0 failed · sinkron LULUS · trace LULUS
Module M1  : 29 passed / 0 failed
Module M2  : 41 passed / 0 failed
Fixtures   : tp02 0 · tp03 0 · tp04 0 · tp05 1 · tp06 1
deno/node  : semua hijau
```

Higiene: nol kunci, token, atau rahasia; yang ada hanya `Deno.env.get('…')`.
Artefak eksperimen (`tests/artifacts/`, `tmp/`, `hatpt/`, `prompt codex/`,
`.docx`) tetap di disk dan tidak di-stage. Delapan berkas di-stage: dua sumber
produksi, dua berkas uji, empat dokumen M2/M2.1/M2.2.

---

## B. REPRODUCED SCHEMA DRIFT

Dari sumber di `3152f53`, bukan dari audit lama. Tiga kelas, semuanya nyata.

### B.1 (kelas A) Ada di dokumen, tidak ada di tipe

M2 memakukan tiga bagian ke dokumen final:

```ts
      tp_anchor: { ...tpAnchor, tuntutan: tuntutanTerurai, … },
      atp_context:    atpContext,
      alokasi_server: alokasiTp,
```

sementara `type ModulOutput` berhenti di `metadata_pedagogis`. **Drift yang M2
sendiri buat** — konsekuensi wajar dari tipe yang bukan otoritas.

Dan sebaliknya: `manifest` diminta prompt dan dipakai Fase B/C, tetapi tidak ada
di tipe akar maupun di dokumen final. Ia memang kontrak internal — hanya, tidak
ada satu tempat pun yang menyatakannya.

### B.2 (kelas B) Diminta prompt, tidak pernah ditegakkan

Menghitung rujukan tiap bagian akar di dalam badan validator:

| Bagian akar | Rujukan di validator |
|---|---|
| `identitas` | 2 |
| `kktp` | 5 |
| `pertemuan` | 8 |
| `instrumen_asesmen` | 12 |
| … | … |
| **`konteks_murid`** | **0** |
| **`materi_esensial`** | **0** |
| **`rancangan`** | **0** |
| **`metadata_pedagogis`** | **0** |

Keempatnya dijelaskan panjang lebar di SYSTEM_PROMPT — `konteks_murid` bahkan
sampai jumlah elemen arraynya — dan **tidak diperiksa sama sekali**. Model boleh
menghilangkan keempatnya dan dokumennya tetap dinyatakan sah.

### B.3 (kelas C) Ditegakkan validator, tidak disebut prompt

```ts
  if (!Array.isArray(o.catatan_guru) || (o.catatan_guru as unknown[]).length < 3)
    errors.push('catatan_guru harus array ≥ 3 butir');
```

Prompt hanya menulis `"catatan_guru":[string]`. Batas tiga butir tidak pernah
sampai ke model. Serupa: `kktp[i].id_kktp` wajib persis `K{i+1}` berurutan,
sedangkan prompt hanya memperlihatkan `"K1"`.

Satu lagi yang lebih kecil: prompt menulis `"konsentrasi_keahlian":null`
(literal), tipe menulis `string | null`.

### B.4 Versi schema

`'4.0.0'` ditulis di empat tempat berbeda: tipe, validator, dokumen gabungan,
dan ringkasan respons.

---

## C. PREVIOUS FOUR-SCHEMA PROBLEM

| | Gambaran | Menegakkan? |
|---|---|---|
| 1 | `type ModulOutput` | tidak — dihapus saat runtime |
| 2 | `validateModulOutputV400()` | **ya, satu-satunya** |
| 3 | kerangka JSON di SYSTEM_PROMPT | tidak — tetapi ia yang model lihat |
| 4 | renderer | tidak — tetapi ia yang guru lihat |

M3 menyatukan 1–3. Renderer adalah **M8** dan tidak disentuh sama sekali
(`git status guru/` = 0 berkas).

---

## D. RUNTIME CONTRACT ARCHITECTURE

Berkas baru `supabase/functions/generate-modul/contract.ts` — murni, tanpa
jaringan, `Deno.env`, atau database (dijaga M3-R).

**Yang ia miliki:** versi schema, bagian akar dan fase penghasilnya, wajib/
nullable, batas jumlah struktural, enum struktural, dan kerangka JSON yang
dikirim ke model.

**Yang ia TIDAK miliki:** mutu. Kelayakan waktu, aritmetika durasi, rotasi
kelompok, beban pengamatan — semuanya tetap imperatif di validator, tempat yang
sudah terbukti bekerja. **Tidak ada mesin schema generik, tidak ada dependency
baru, tidak ada JSON Schema.** Mengganti yang berhasil demi yang rapi adalah
cara mahal untuk mundur.

---

## E. SCHEMA VERSION AUTHORITY

```ts
export const MODUL_SCHEMA_VERSION = '4.0.0';
```

Empat literal digantikan satu konstanta; tipe memakai
`typeof MODUL_SCHEMA_VERSION`. M3-A menuntut **nol** literal `'4.0.0'` tersisa
di `generate-modul/index.ts` dan tepat satu di `contract.ts`.

Nomornya **tidak dinaikkan**: refactor bukan perubahan semantik keluaran.

---

## F. STRUCTURAL CONTRACT

```ts
export const KONTRAK_ROOT: Record<string, FieldKontrak> = {
  kktp: { fase: 'A', kind: 'array', required: true, min: 1,
          catatan: 'id_kktp WAJIB berurutan K1, K2, … sesuai posisinya.',
          bentuk: `"kktp": [{"id_kktp":"K1", …}]` },
  …
};
```

Validator kini menjalankan satu pass bentuk yang dikendalikan kontrak —
keberadaan, jenis, panjang minimum — **sebelum** seluruh pemeriksaan lama, yang
tidak disentuh. Ini yang menutup §B.2: keempat bagian yang dulu tak terperiksa
sekarang wajib ada dan berjenis benar.

`kind` sengaja hanya `object | array | string`. Lebih dalam dari itu bukan
bentuk melainkan isi, dan isi punya penjaganya sendiri.

Enum struktural terkumpul di `ENUM_KONTRAK` (`nama_langkah`,
`mode_pelaksanaan`, `mode_observasi`, dua jenis instrumen), dan
`URUTAN_LANGKAH` di validator kini diturunkan darinya — daftar enam langkah
tidak lagi ditulis dua kali.

**Tidak ada field target M4/M5/M7 yang diselundupkan.** Kontrak menggambarkan
keadaan sekarang.

---

## G. M2 INHERITANCE FIELDS

`tp_anchor`, `atp_context`, dan `alokasi_server` masuk kontrak sebagai
`fase: 'server'` — diisi backend, **tidak pernah** diminta dari model (M3-H
menuntut ketiganya tidak muncul di kerangka).

Ketiganya `required: true`, **tetapi penegakannya dinyalakan pemanggil**:

```ts
  wajibJejakWarisan = false,   // parameter baru, bawaan permisif
  …
    if (f.fase === 'server' && !wajibJejakWarisan) continue;
```

Jalur penyusunan selalu menyalakannya; pembacaan dokumen lama tidak.

**Ini bukan pelonggaran, melainkan koreksi yang ditemukan uji.** Percobaan
pertama menandai ketiganya wajib tanpa syarat, dan kelima contoh produksi
langsung gagal — semuanya disusun sebelum M2 dan memang tidak memilikinya.
Menuntutnya secara surut berarti menghakimi dokumen lama dengan aturan yang
belum ada ketika ia dibuat, persis yang M1 dan M2.1 tolak lakukan. M3-M menguji
kedua sisinya: dokumen baru dituntut, dokumen lama tidak.

`tp_snapshot_hash` **tidak disentuh**. M3-N menuntut `atp_context` tidak muncul
di `anchor.ts` sama sekali.

---

## H. PROMPT DERIVATION

Blok kerangka sepanjang ~6.300 karakter di SYSTEM_PROMPT dihapus dan diganti:

```
${ringkasanTanggungJawabFase()}
…
${kerangkaSeluruhFase()}
```

`kerangkaFase()` merakit `bentuk` tiap bagian milik fase itu, lalu mengganti
penanda `<nama_enum>` dengan daftar nilainya dari `ENUM_KONTRAK`. Hasilnya:

```
FASE "A" — hasilkan object dengan field: schema_version, identitas, kktp, …
FASE A:
{
  "schema_version": "4.0.0",
  "identitas": { … },
  …
}
```

Menambah bagian akar, mengganti namanya, menjadikannya wajib, atau menambah
nilai enum kini otomatis mengubah apa yang model lihat. Tidak ada salinan kedua
yang harus diperbarui manual — M3-L menuntut blok lama benar-benar hilang dan
keempat bagian §B.2 tidak lagi ditulis tangan di dalam string prompt.

---

## I. REPAIR DERIVATION

Dua jalur perbaikan, keduanya kini berpangkal pada kontrak yang sama:

| | SEBELUM | SESUDAH |
|---|---|---|
| perbaikan validasi | `"Hasilkan JSON object penuh yang sudah benar."` | + `perintahPerbaikanStruktural()` |
| perbaikan JSON di `callPhase` | `"JSON tidak valid. Hasilkan ulang HANYA JSON object …"` | + `perintahPerbaikanStruktural()` |

Sampai M3 keduanya tidak menyebut bentuk sama sekali, sehingga model harus
mengingat kerangkanya dari panggilan sebelumnya — dan kalau ia salah ingat,
perbaikannya justru merusak bentuk. M3-K menuntut kedua jalur memakainya dan
menuntut isinya mendaftar bagian akar wajib **kecuali** yang diisi backend.

---

## J. PHASE BOUNDARIES

Diturunkan dari `fase` tiap bagian, bukan didaftar terpisah:

```
FASE "A"  : schema_version, identitas, kktp, konteks_murid, materi_esensial,
            rencana_asesmen, rancangan, metadata_pedagogis, manifest
FASE "B"  : pertemuan
FASE "C"  : instrumen_pembelajaran, instrumen_asesmen
FASE "B2" : naskah_fasilitasi
FASE "D"  : tindak_lanjut, catatan_guru
server    : tp_anchor, atp_context, alokasi_server
```

Tidak ada lima mesin schema. Yang dijamin: tiap fase diminta field yang memang
ia hasilkan, validator menilai dokumen final, dan tidak ada fase yang memegang
salinan kontradiktif dari bentuk akhir (M3-H).

---

## K. TYPESCRIPT ALIGNMENT

Tipe diberi pernyataan eksplisit di kodenya:

```ts
// OTORITAS RUNTIME ADALAH contract.ts + validateModulOutputV400().
// Tipe di bawah adalah BANTUAN WAKTU KOMPILASI, bukan sumber kebenaran …
```

Perubahannya hanya dua, keduanya karena §B.1 membuktikannya berbeda:
`schema_version` memakai `typeof MODUL_SCHEMA_VERSION`, dan ketiga field M2
ditambahkan **dengan tipe yang sudah diketahui** — `TpAnchor & { tuntutan:
TuntutanTerurai[]; … }`, `AtpContext`, `AlokasiPertemuan`. Nol `any`.

---

## L. NULLABILITY POLICY

Kontrak menyatakan **keadaan sekarang**, bukan cita-cita. `asesmen_formatif`,
`asesmen_diagnostik`, dan `asesmen_sumatif` tetap boleh null — karena memang
begitu bentuknya hari ini.

Reviewer sudah menetapkan formatif akhirnya wajib. Mendahuluinya di M3 justru
akan merusak buktinya: yang sedang dibuktikan di sini adalah bahwa **mengubah
satu tempat cukup** untuk mengubah validator dan prompt sekaligus. M4 nanti
menguji mekanisme ini dengan memakainya, dan M3-E — yang sekarang menuntut null
tetap sah — akan dibalik di sana. Pembalikannya itulah buktinya.

Menuliskan cita-cita di kontrak yang menggambarkan keadaan adalah cara tercepat
membuat kontrak berbohong.

---

## M. COMPATIBILITY POLICY

M3 **bukan** migrasi parser ketat. Field tak dikenal tetap diterima: dokumen
lama dan draft membawa metadata tambahan (`_draft`, sisa fase), dan menolaknya
sekarang akan memutus pembacaan tanpa satu pun defect yang membuktikannya perlu.
M3-O menguji dokumen dengan `_draft`, kunci akar asing, dan field asing di dalam
`identitas` — nol temuan.

Jejak M2 diperlakukan seperti §G: dituntut untuk dokumen baru, tidak dituntut
secara surut.

---

## N. M3 DETERMINISTIC TESTS

`tests/modul-contract.test.ts` — **21 passed / 0 failed**.

| | Menguji |
|---|---|
| M3-A | satu otoritas versi; nol literal `'4.0.0'` di EF; tepat satu di kontrak |
| M3-B | contoh produksi sehat lolos dengan versi dari otoritas |
| M3-C | versi salah ditolak, pesannya menyebut versi yang diharapkan |
| M3-D | **setiap** bagian akar wajib milik model dihapus satu per satu → temuan yang menyebut namanya |
| M3-E | ketiga asesmen bernilai null tetap sah — keadaan sekarang, akan dibalik M4 |
| M3-F | `nama` langkah di luar enum ditolak; enum validator = enum kontrak |
| M3-G | SYSTEM_PROMPT memakai kerangka yang dibangkitkan |
| M3-H | setiap bagian milik model muncul di kerangka; yang milik server **tidak** |
| M3-I | ketiga asesmen ditandai `null |` di kerangka; yang wajib tidak |
| M3-J | setiap nilai enum sampai ke kerangka; nol penanda `<…>` tersisa; validator memakai daftar yang sama |
| M3-K | kedua jalur perbaikan memakai perintah dari kontrak |
| M3-L | blok skeleton lama hilang; keempat bagian §B.2 tidak lagi ditulis tangan di prompt |
| M3-M | jejak M2 dikenal, `fase: server`, dituntut untuk dokumen baru, tidak surut |
| M3-N | jejak M2 ikut ke dokumen final; `atp_context` tidak bocor ke hash |
| M3-O | metadata asing tidak menggagalkan validasi |
| M3-P | kelima contoh memberi jumlah temuan yang sama dengan baseline M2, **dan** cocok dengan `_harapan` berkasnya |
| M3-Q | penanda kelayakan waktu masih ada **dan** benar-benar menembak saat dilanggar |
| M3-R | `contract.ts` murni; uji berjalan tanpa izin jaringan |

Validator diambil dari **sumber** Edge Function, bukan disalin — pola yang sama
dengan `tests/validator-modul.ts`.

---

## O. SOURCE-LEVEL DRIFT PROTECTION

Tiga uji yang gagal bila masalah empat-schema kembali. Bukan perbandingan string
yang sama dua kali — kontraknya benar-benar diubah lalu kerangkanya dibangkitkan
ulang:

**DRIFT-1** menyisipkan bagian akar baru ke `KONTRAK_ROOT`, lalu menuntut
kerangka **berubah**, memuat namanya, dan perintah perbaikan ikut menyebutnya —
lalu memulihkan kontrak dan menuntut kerangkanya kembali persis seperti semula.

**DRIFT-2** menambah satu nilai ke `ENUM_KONTRAK.mode_observasi` dan menuntut
nilai itu muncul di kerangka.

**DRIFT-3** menuntut tidak ada `bentuk` yang menuliskan nilai enum secara
langsung — semuanya harus lewat penanda `<nama_enum>`. Inilah yang mencegah
seseorang menambah enum ke prompt secara manual di kemudian hari.

---

## P. M1/M2 REGRESSION

```
ATP        : 60 passed / 0 failed · sinkron LULUS · trace LULUS
Module M1  : 29 passed / 0 failed
Module M2  : 41 passed / 0 failed
```

Nol assertion dilemahkan; **nol berkas uji M1/M2 disunting**. `generate-atp`,
CP, dan acuan tidak disentuh.

---

## Q. MODULE FIXTURE REGRESSION

```
tp02 0 · tp03 0 · tp04 0 · tp05 1 · tp06 1 — Semua 5 contoh sesuai harapan.
```

Sama persis dengan baseline M2, dan dijaga dua kali: oleh
`tests/validator-modul.ts` dan lagi oleh M3-P.

Perlu dicatat jujur: baseline ini **sempat pecah** ketika jejak M2 dituntut
tanpa syarat (§G). Itu ditangani sebagai regresi — bukan dengan memperbarui
`_harapan`, melainkan dengan memperbaiki lingkup penegakannya.

---

## R. FILES CHANGED

| Berkas | Perubahan |
|---|---|
| `supabase/functions/generate-modul/contract.ts` | **baru** — `MODUL_SCHEMA_VERSION`, `KONTRAK_ROOT`, `ENUM_KONTRAK`, pembangkit kerangka dan perintah perbaikan |
| `tests/modul-contract.test.ts` | **baru** — M3-A…M3-R + DRIFT-1…3 |
| `supabase/functions/generate-modul/index.ts` | impor kontrak; pass bentuk akar di validator; `URUTAN_LANGKAH` dari kontrak; versi dari konstanta; tipe diselaraskan + tiga field M2; kerangka prompt dibangkitkan; kedua jalur perbaikan memakai kontrak; parameter `wajibJejakWarisan` (77 tambahan, 128 penghapusan) |

**Tidak disentuh:** renderer (`guru/` nol berkas), `classroom-unduh`, Naskah,
migration (nol berkas), `generate-atp`, `anchor.ts`, `warisan.ts`, berkas uji
M1/M2, dan `tests/validator-modul.ts`.

---

## S. REMAINING GAPS

1. **Kontrak memiliki bentuk akar, bukan bentuk dalam.** Struktur nested tetap
   berupa contoh JSON di dalam `bentuk` — satu salinan, tetapi tidak
   ditegakkan field-per-field. Menegakkannya menuntut mesin schema yang §4
   larang. Yang dijamin sekarang: nama akar, jenis, panjang minimum, enum, dan
   bahwa prompt tidak dapat menyimpang dari semuanya itu.
2. **Renderer masih gambaran keempat.** Field yang tersimpan tetapi tidak
   terlihat guru (`mode_pelaksanaan`, `language_policy`, dan seterusnya) belum
   tersentuh — M8.
3. **Nullability masih menggambarkan keadaan, bukan target.** Disengaja (§L);
   M4 yang mengubahnya.
4. **Sebagian batas jumlah masih imperatif.** `tindak_lanjut.pilihan_dukungan`
   ≥ 3 dan `dukungan_terstruktur` ≥ 2 hidup di validator dan disebut prompt
   lewat `bentuk`, tetapi belum berupa data kontrak seperti `catatan_guru.min`.
   Memindahkannya menuntut `min` per sub-field — pekerjaan nested di butir 1.
5. **Impor lintas fungsi belum terbukti di deploy.** `generate-modul` mengimpor
   `../generate-atp/kontrak.ts` sejak M2; M3 tidak menambah impor lintas fungsi
   baru, dan risiko itu tetap terbuka sebagaimana dicatat laporan M2 §T.13.
6. **Belum ada uji dengan model sungguhan.** M3 seluruhnya deterministik;
   apakah model benar-benar mematuhi kerangka yang dibangkitkan baru terukur di
   M9.

---

## T. RECOMMENDATION (M3 — status digantikan §U)

# MODULE M3 — READY FOR REVIEW

Tiga dari empat gambaran Modul kini berpangkal pada satu objek:

- **Versi** — satu konstanta, nol literal tersisa.
- **Bentuk akar** — satu tabel yang validator baca dan prompt bangkitkan;
  empat bagian yang dulu diminta tanpa pernah diperiksa kini ditegakkan.
- **Enum** — satu daftar yang divalidasi dan disisipkan ke kerangka, sehingga
  yang model lihat mustahil berbeda dari yang ditegakkan.
- **Perbaikan** — kedua jalurnya memakai perintah struktural dari kontrak yang
  sama, bukan mengandalkan ingatan model.

Validator tidak ditulis ulang: seluruh pemeriksaan mutu dan kelayakan waktu
tetap imperatif, dan M3-Q membuktikan ia masih menembak. Nullability
menggambarkan keadaan hari ini dengan jujur, sehingga M4 dapat membuktikan
mekanisme ini dengan memakainya. Tiga uji drift membuat masalah empat-schema
tidak dapat kembali diam-diam.

ATP 60/60, M1 29/29, M2 41/41, M3 21/21, kelima fixture jumlah temuan sama.
Nol assertion dilemahkan, nol berkas uji lama disunting, nol migration, nol
sentuhan renderer, nol panggilan model.

Sesuai §24 dan §25: **belum di-commit, dan berhenti di sini.** Tidak ada push,
deploy, migrasi, atau tulisan ke basis data produksi. M4 tidak dimulai.

---

## U. M3.1 — PERBAIKAN YANG SADAR LINGKUPNYA

Reviewer menerima arsitektur M3 dan menemukan satu cacat pada perintah
perbaikan — tepat di mekanisme yang M3 pasang.

### U.1 Cacat yang direproduksi

`perintahPerbaikanStruktural()` dipakai dua jalur yang lingkupnya berbeda:

```ts
// A. perbaikan setelah validasi dokumen final gagal
: JSON.stringify(merged) + `… Hasilkan JSON object penuh yang sudah benar. `
  + perintahPerbaikanStruktural();

// B. perbaikan JSON di dalam callPhase() — bekerja PER FASE
`JSON tidak valid. Hasilkan ulang HANYA JSON object untuk ${label} yang valid. `
  + perintahPerbaikanStruktural();
```

Isinya, dijalankan apa adanya:

```
Bentuk dokumen tidak berubah. schema_version tetap "4.0.0". Field akar yang
WAJIB ada: schema_version, identitas, kktp, konteks_murid, materi_esensial,
rencana_asesmen, rancangan, metadata_pedagogis, pertemuan,
instrumen_pembelajaran, instrumen_asesmen, naskah_fasilitasi, tindak_lanjut,
catatan_guru. …
```

Pada perbaikan Fase B, pesan yang model terima berbunyi:

> "Hasilkan ulang HANYA JSON object untuk Fase B yang valid. … Field akar yang
> WAJIB ada: schema_version, identitas, kktp, …, catatan_guru."

**Pesannya membantah dirinya sendiri.** Ia meminta satu fase, lalu menuntut
empat belas bagian akar dokumen — tiga belas di antaranya bukan urusan fase itu.
Model yang menurut akan menghasilkan dokumen penuh yang salah tempat; model yang
mengabaikannya berarti perintahnya memang sampah.

Ada cacat kedua yang lebih halus di jalur yang sama. Daftar itu berpangkal pada
`rootWajib()` — daftar wajib **dokumen final** — sehingga `manifest` tidak
pernah disebut. Padahal manifest adalah keluaran nyata Fase A dan dipakai Fase B
dan C. Perbaikan Fase A yang memakai daftar final menghasilkan Fase A yang
lumpuh: modulnya lolos, instrumennya tidak pernah punya kontrak.

### U.2 Dua lingkup, satu kontrak

```ts
export function perintahPerbaikanStruktural(fase?: FasePenghasil): string {
  if (fase) {
    const milikFase = rootFase(fase).filter(k => KONTRAK_ROOT[k].fase !== 'server');
    …
    `Field yang WAJIB ada di object Fase ${fase}: ${milikFase.join(', ')}.`
    … 'Kerangka yang diminta:\n' + kerangkaFase(fase)
  }
  // tanpa fase → dokumen final, seperti sebelumnya
}
```

Tidak ada schema kedua: lingkup fase memakai `rootFase()` dan `kerangkaFase()`,
keduanya sudah ada sejak M3 dan berpangkal pada `KONTRAK_ROOT` yang sama.

Hasilnya, dijalankan:

```
[A]  … Fase A: schema_version, identitas, kktp, konteks_murid, materi_esensial,
     rencana_asesmen, rancangan, metadata_pedagogis, manifest.
[B]  … Fase B: pertemuan.
[C]  … Fase C: instrumen_pembelajaran, instrumen_asesmen.
[B2] … Fase B2: naskah_fasilitasi.
[D]  … Fase D: tindak_lanjut, catatan_guru.
[final] … schema_version, identitas, …, catatan_guru.
```

Perhatikan bedanya: **`manifest` ada di lingkup Fase A dan tidak ada di lingkup
final** — persis kebalikan dari perilaku M3, dan persis yang benar.

Perbaikan fase juga membawa `kerangkaFase(fase)`, sehingga model menerima bentuk
yang diminta, bukan hanya daftar nama — dan enum di dalamnya tetap datang dari
`ENUM_KONTRAK` lewat penanda `<nama_enum>` yang sama.

### U.3 Fase diberikan, tidak ditebak

```ts
  async function callPhase(
    label: string, userMsg: string, timeoutMs: number, maxTokens = 4000,
    fase?: FasePenghasil,
  )
```

Label adalah kalimat untuk manusia — `'Fase B2 (naskah)'`, `'Fase A'` — dan
menyimpulkan kontrak dari kalimat adalah cara pelan-pelan salah: satu suntingan
redaksi pada label akan mengubah bentuk yang diminta model. M3-Z menuntut tidak
ada `label.includes`, `label.match`, `label.startsWith`, `label.slice`, maupun
regex `/Fase [ABCD]/` di seluruh berkas.

Kelima panggilan produksi kini membawa lingkupnya, dan M3-AA memeriksa
pemetaannya satu per satu:

```
Fase B2 (naskah) -> B2      Fase A -> A      Fase B -> B
Fase C -> C                 Fase D -> D
```

### U.4 Perbaikan khusus durasi — sudah benar, tidak disentuh

Cabang `hasDurasiError` membangun ulang pesan Fase B (yang kerangkanya sudah
datang dari kontrak sejak M3) lalu menambahkan aturan durasi. Ia **tidak pernah**
menerima perintah dokumen penuh, jadi lingkupnya sudah konsisten dengan muatan
yang diminta. M3-AE menjaganya tetap begitu, dan sekaligus menjaga aturan
kelayakan waktu tidak ikut tersentuh.

### U.5 Tests M3.1

`tests/modul-contract.test.ts` — **34 passed / 0 failed** (21 sebelumnya + 13 baru).

| | Menguji |
|---|---|
| M3-S | perbaikan Fase A menyebut seluruh milik Fase A, dan **tidak satu pun** milik fase lain |
| M3-T | manifest ada di lingkup Fase A, **tidak ada** di lingkup final; `required:false` diverifikasi lebih dulu |
| M3-U | Fase B hanya `pertemuan`; tujuh nama lain dipastikan absen |
| M3-V | Fase C hanya kedua instrumen |
| M3-W | Fase B2 hanya `naskah_fasilitasi` |
| M3-X | Fase D hanya `tindak_lanjut`, `catatan_guru` |
| M3-Y | lingkup final utuh, menyebut versi, dan berbeda dari kelima lingkup fase |
| M3-Z | `callPhase` menerima `FasePenghasil`; nol penebakan dari label |
| M3-AA | kelima panggilan produksi memberi lingkup yang benar; kelima fase terpakai |
| M3-AB | bagian akar baru pada Fase B mengubah perbaikan **Fase B saja** — Fase C tidak bergeming, final ikut |
| M3-AC | nilai enum baru sampai ke Fase B (yang kerangkanya memakainya), tidak ke Fase D |
| M3-AD | ketiga bagian milik backend tidak pernah diminta di enam pesan perbaikan mana pun |
| M3-AE | cabang durasi tetap berlingkup Fase B, dan aturan waktu tidak hilang |

M3-AB adalah uji drift yang §11 minta: kontraknya **benar-benar diubah**, lalu
dipulihkan dan dibandingkan lagi — bukan membandingkan string yang sama dua
kali. Yang dibuktikan bukan sekadar "berubah", melainkan bahwa fase lain
**tidak** ikut berubah. Itulah bedanya lingkup per fase dari satu daftar yang
kebetulan disaring.

### U.6 Satu assertion M3 disesuaikan

| | SEBELUM | SESUDAH |
|---|---|---|
| M3-K | `perintahPerbaikanStruktural()` muncul 2× | `perintahPerbaikanStruktural(…)` muncul 2×, **dan** tepat 1× tanpa argumen, **dan** tepat 1× dengan `(fase)` |

Pembawanya berubah, sifat yang dijaga tidak — dan kini lebih ketat: bukan hanya
"dua jalur memakai satu kontrak", melainkan juga "masing-masing pada lingkup
yang benar".

### U.7 Yang sengaja tidak disentuh

`MODUL_SCHEMA_VERSION` tetap `4.0.0`; `KONTRAK_ROOT` tetap 18 bagian;
`ENUM_KONTRAK` tetap 5 kelompok; nullability, pass bentuk akar di validator,
`wajibJejakWarisan`, pewarisan M2, `tp_snapshot_hash`, dan aturan kelayakan
waktu seluruhnya tidak berubah. Koreksi ini hanya lingkup perbaikan.

### U.8 Regresi M3.1

```
ATP             : 60 passed / 0 failed · sinkron LULUS · trace LULUS
Module M1       : 29 passed / 0 failed
Module M2       : 41 passed / 0 failed
Module M3+M3.1  : 34 passed / 0 failed
Fixtures        : tp02 0 · tp03 0 · tp04 0 · tp05 1 · tp06 1
deno check      : contract · anchor · warisan · generate-modul · generate-atp/kontrak — ok
node --check    : rancang-chat.js — ok
renderer/migration: 0 berkas tersentuh
```

Nol panggilan model. Berkas yang berubah: `contract.ts` (satu fungsi),
`generate-modul/index.ts` (parameter `fase` + lima panggilan), dan berkas ujinya.

---

# MODULE M3.1 — READY FOR REVIEW

Perbaikan kini memakai kontrak yang sama pada lingkup yang sedang diperbaiki.
Pesan Fase B berbicara tentang `pertemuan`, bukan tentang empat belas bagian
akar dokumen; pesan Fase A menyebut `manifest` yang daftar wajib final justru
tidak memuatnya. Lingkupnya diberikan pemanggil dengan tipe `FasePenghasil`,
tidak pernah disimpulkan dari kalimat untuk manusia.

Tidak ada schema kedua yang dibuat: `rootFase()` dan `kerangkaFase()` sudah ada
sejak M3 dan berpangkal pada `KONTRAK_ROOT` yang sama. M3-AB membuktikan
lingkupnya benar-benar per fase — menambah bagian akar ke Fase B mengubah
perbaikan Fase B dan membiarkan Fase C apa adanya.

Seluruh M3 dipertahankan utuh, kelima fixture memberi jumlah temuan yang sama,
dan satu assertion yang disesuaikan dijelaskan BEFORE/AFTER di §U.6.

Sesuai §16 dan §17: **belum di-commit, dan berhenti di sini.** Tidak ada push,
deploy, migrasi, atau tulisan ke basis data produksi. M4 tidak dimulai.
