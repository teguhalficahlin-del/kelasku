# MODULE M4 — ASSESSMENT + EVIDENCE CONTRACT

Laporan untuk ditinjau. Bukti diff verbatim: `docs/MODULE-M4-ASSESSMENT-EVIDENCE.diff`.

Rantai yang M4 buat dapat dibuktikan secara terstruktur:

```
TP → tuntutan CP → KKTP → asesmen/evidence task → instrumen → bukti per murid → keputusan
```

---

## A. Baseline M3 yang diterima

```
# MODULE M3 ACCEPTED BASELINE COMMIT = 12c607e
```

Commit lokal, belum di-push. Isinya M3 + M3.1 apa adanya dari working tree,
tanpa artefak eksperimen: `contract.ts`, `index.ts`, `tests/modul-contract.test.ts`,
dan tiga dokumen bukti M3.

Verifikasi ulang sebelum checkpoint — seluruhnya sesuai angka yang reviewer tetapkan:

| Suite | Hasil |
|---|---|
| ATP `atp-kontrak.test.ts` | 60 passed / 0 failed |
| ATP `atp-acuan-sinkron.mjs` | LULUS |
| ATP `atp-trace.mjs --periksa` | LULUS |
| M1 `modul-anchor.test.ts` | 29 passed / 0 failed |
| M2 `modul-warisan.test.ts` | 41 passed / 0 failed |
| M3 `modul-contract.test.ts` | 34 passed / 0 failed |
| Fixture `validator-modul.ts` | tp02=0 tp03=0 tp04=0 tp05=1 tp06=1 |

Satu catatan cara menjalankan, bukan cacat: `tests/modul-contract.test.ts`
menuntut `--allow-write` (ia menulis berkas sementara di samping `index.ts`
untuk mengimpor validator dari sumber). Tanpa flag itu suite-nya gagal sebagai
`NotCapable`, bukan sebagai uji yang tidak lulus.

**Yang tidak di-stage** (artefak eksperimen dan berkas kerja, sesuai §2 hygiene):
`tests/artifacts/` (artefak model mentah harness ATP), `tmp/`, `tmp_*.sql`,
`hatpt/`, `prompt codex/`, berkas `.docx`/`.md` telaah, dan laporan lepas di akar
repo. Pemindaian rahasia (API key, secret Supabase, bearer/token, credential)
bersih: satu-satunya kecocokan adalah `Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')`
— NAMA variabel lingkungan, bukan nilainya.

---

## B. Celah asesmen yang direproduksi lebih dulu

Kelimanya dibuktikan ADA sebagai uji yang lolos di modus historis, sebelum satu
baris aturan pun ditulis. Uji `M4-REPRO-1..5` di `tests/modul-assessment.test.ts`
menegaskan keduanya sekaligus: cacatnya lolos dulu, ditolak sekarang.

| # | Celah | Bukti |
|---|---|---|
| 1 | `asesmen_formatif: null` lolos — modul tanpa satu pun pemeriksaan pemahaman selama proses belajar | `tp02.json` produksi memang `null` dan bernilai 0 temuan | 
| 2 | KKTP tidak punya kaitan apa pun ke tuntutan CP yang TP pikul | tidak ada field `tuntutan_ref` di `KktpItem`, dan validator tidak memeriksanya |
| 3 | Rencana formatif boleh menyebut pertemuan + langkah yang tidak pernah memuat asesmen itu | validator memeriksa penempatan **sumatif** (V5) saja; `asesmen_formatif` tidak diperiksa sama sekali |
| 4 | Sebuah KKTP boleh tidak punya bukti per murid — atau bukti apa pun | tidak ada konsep cakupan bukti di kode |
| 5 | `instrumen_bukti` boleh menunjuk instrumen yang tidak dipakai jalur bukti KKTP itu | `instrumen_bukti` ada di tipe sejak V4.0 dan **tidak pernah** dibaca validator |

Yang perlu dicatat tentang skalanya: sebelum M4, dari seluruh isi
`rencana_asesmen` yang diperiksa validator hanyalah penempatan sumatif. Formatif
— termasuk `id`, `referensi_kktp`, `instrumen_ref`, dan `umpan_balik` — tidak
punya satu pun pemeriksaan.

Tidak ada celah yang ditemukan di luar kelima ini yang lalu ikut ditambal.

---

## C. Kebijakan produk formatif

Terkunci sesuai arahan reviewer:

- **Asesmen formatif SELALU WAJIB.** Guru tidak dapat mematikannya.
- Yang tetap milik guru adalah **tekniknya**, termasuk menyerahkannya ke MiClass.
- Diagnostik tetap **opsional** dan tidak dijadikan wajib demi kelengkapan.
- Sumatif tetap **opsional sebagai label formal** — tetapi **bukti ketercapaian
  tidak opsional**: kalau sumatif null, formatif wajib menghasilkan bukti untuk
  setiap KKTP.
- KKTP Modul tetap otoritas `generate-modul` dari `tp_anchor` (keputusan M1).
  `tp_kktp` Tab Penilaian tidak dibaca, tidak ditulis, tidak disinkronkan
  (dijaga `M4-AL`).

---

## D. Normalisasi masukan historis

`resolvePreferensiFormatif()` — fungsi murni di `index.ts`, di atas penanda
`// ── EDGE FUNCTION ─` sehingga dapat diuji langsung dari sumbernya.

| Jawaban tersimpan | Hasil |
|---|---|
| `gunakan_formatif = 'lewati'` / `false` / `'tidak'` | `AUTO` |
| `gunakan_formatif = null` | `AUTO` |
| field tidak ada / `ASESMEN_MODUL` tidak ada | `AUTO` |
| `gunakan_formatif = 'ya'` + teknik didukung | **preferensi guru dipertahankan** |
| jawaban baru: `teknik_formatif` saja, teknik didukung | preferensi guru |
| `teknik_formatif = 'rekomendasi'` atau teknik tak didukung | `AUTO` |

Bentuk kembaliannya `{ wajib: true, teknik, sumber }` — `wajib` bertipe literal
`true`, jadi "mati" bukan sesuatu yang perlu dipercaya tidak terjadi: ia tidak
dapat diungkapkan. `M4-C3` menegaskannya atas sepuluh bentuk masukan.

**Tidak ada migrasi dan tidak ada backfill.** Normalisasi terjadi di titik pakai.

Satu keputusan yang perlu terlihat: `gunakan_formatif='lewati'` yang kebetulan
menyimpan `teknik_formatif` tetap jatuh ke `AUTO`, tidak memakai teknik itu.
Alasannya faktual — ketika formatif dilewati, pertanyaan tekniknya bersyarat dan
tidak pernah tampil, jadi nilai yang menempel di situ bukan pilihan guru.

---

## E. Pemetaan KKTP → tuntutan CP

Field baru pada setiap KKTP yang disusun sekarang: **`tuntutan_ref: string[]`**.

Otoritasnya `tp_anchor.tuntutan_id` — potret sisi server dari ATP yang sudah
diterima, bukan daftar yang model karang. Aturan yang ditegakkan:

- setiap KKTP ≥ 1 `tuntutan_ref` (`M4-G`);
- tidak ada ID asing (`M4-H`);
- **gabungan** seluruh `kktp[].tuntutan_ref` wajib menutup seluruh
  `tp_anchor.tuntutan_id` (`M4-I`);
- satu tuntutan boleh dilayani beberapa KKTP, dan satu KKTP boleh memikul
  beberapa tuntutan bila TP-nya memang memikulnya (`M4-J`).

Hasilnya deterministik: tuntutan TP → KKTP. Apakah kalimat KKTP itu
BENAR-BENAR mengukur tuntutannya tetap pertanyaan semantik, dan itu M9. Tidak
ada daftar kata kerja yang dipasang untuk berpura-pura menjawabnya.

ID KKTP tetap lokal (`K1`, `K2`, …) dan tidak diberi ID basis data. Keunikan dan
urutannya sudah ditegakkan pemeriksaan `id_kktp === K{i+1}` yang ada sejak V4.0;
`M4-K` menguji bahwa ID ganda dan ID kosong memang gagal.

---

## F. Ambang keputusan KKTP

`ambang_batas: string` terlalu lemah untuk keputusan guru. M4 menambahkan satu
field terstruktur:

```
keputusan_ketercapaian: { jenis, nilai_minimum, satuan, deskripsi }
jenis ∈ ENUM_KONTRAK.jenis_keputusan = jumlah | persentase | rubrik
```

Ditegakkan: `nilai_minimum` berhingga dan > 0, `satuan` dan `deskripsi` tidak
kosong, `jenis` dari satu enum kontrak (`M4-L`, `M4-M`, `M4-M2`, `M4-N`).

**Pembagian otoritas, didokumentasikan tegas:**

| | Peran |
|---|---|
| `keputusan_ketercapaian` | **otoritas keputusan runtime** |
| `ambang_batas` | **penjelasan yang guru baca** — dipertahankan untuk renderer dan dokumen yang sudah ada |

Validator tidak pernah menurunkan kebenaran dari `ambang_batas` berbahasa alami.
V10 dan V14 yang lama tetap berjalan atas field itu, tetapi kini sebagai penjaga
mutu tampilan, bukan dasar keputusan. Tidak ada regex baru yang mencari "%" atau
kata "minimal". KKTP historis tanpa field terstruktur tetap terbaca; penyusunan
sekarang menuntutnya.

Tidak ada perubahan renderer — itu M8.

---

## G. Kontrak rencana formatif

Untuk penyusunan sekarang, `rencana_asesmen.asesmen_formatif` wajib **array ≥ 1**
dan tidak boleh `null` (`M4-D`, `M4-E`, `M4-F`).

ID formatif lokal dan deterministik: **`FMT-01`, `FMT-02`, …** — berurutan,
unik, tidak kosong (`M4-O`). Bukan UUID.

`umpan_balik` wajib tidak kosong (`M4-AG`): formatif tanpa jalan tindak lanjut
hanyalah pengukuran. Yang diperiksa keberadaannya — mutu pedagogisnya M9, dan
tidak ada pemeriksaan kata kunci yang dipasang untuk menebaknya.

---

## H. Jangkar formatif di pertemuan

Rencana saja tidak cukup. Untuk setiap `asesmen_formatif[i]` wajib ada
sub_langkah nyata yang cocok pada `waktu_pertemuan` + `fase_langkah` dengan
`asesmen_ref === formatif.id`.

Yang dideteksi (`M4-P`): pertemuan di luar jangkauan, langkah tidak ada di
pertemuan itu, tidak ada `asesmen_ref` yang cocok, dan jangkar ganda.
Kontraknya **tepat satu** jangkar per ID formatif — sejajar dengan kontrak
SUMATIF yang sudah ada, dan tidak ada alasan arsitektural yang ditemukan untuk
membolehkan lebih.

Satu catatan kejujuran tentang cakupan uji: cabang "langkah tidak ada di
pertemuan itu" bersifat penjaga terhadap keluaran Fase B yang rusak — di modul
sehat keenam langkah selalu ada. `M4-P(b)` mencapainya dengan sengaja membuang
satu langkah dari fixture, bukan dengan berpura-pura keadaan itu biasa.

Dan jangkarnya harus benar-benar memakai instrumen yang entri itu klaim dipakai:
`instrumen_ref` sub_langkah pelaksana wajib memuat seluruh `instrumen_ref`
formatifnya (`M4-T` gagal, `M4-U` lolos). Instrumen instruksional lain di
sub_langkah itu tidak dituntut.

---

## I. Cakupan bukti per murid

`cakupan_bukti ∈ per_murid | kelompok` ditambahkan ke entri formatif dan sumatif.

Aturan akhirnya: **setiap KKTP wajib punya minimal satu jalur bukti
`per_murid`.** Bukti kelompok boleh ada, tetapi tidak boleh menjadi satu-satunya
bukti sebuah KKTP — keputusan ketercapaian diambil untuk setiap murid, dan satu
lembar per meja tidak dapat memberitahu guru murid mana yang belum sampai.

`M4-V` (hanya kelompok → gagal), `M4-W`, `M4-X` (satu dari beberapa KKTP tanpa
bukti per murid → gagal), `M4-Y`.

Pesan galatnya dibedakan antara "hanya punya bukti kelompok" dan "tidak punya
jalur bukti apa pun", karena kedua keadaan itu menuntut perbaikan yang berbeda.

---

## J. Perilaku sumatif yang tetap opsional

Sumatif tidak dijadikan wajib. Kontrak lamanya utuh: bila ada, satu slot SUMATIF
nyata, penempatan cocok, durasi cocok.

Yang M4 tambahkan: `referensi_kktp` wajib ada dan sah (`M4-AC`), `cakupan_bukti`
dari enum (`M4-AC3`), `instrumen_ref` wajib ada dan nyata. Sumatif `per_murid`
BOLEH menyumbang cakupan bukti KKTP yang dirujuknya (`M4-AB`).

Bila sumatif `null`: tidak menyumbang cakupan apa pun, seluruh bukti wajib
datang dari formatif (`M4-AA`), dan tidak boleh ada penanda `asesmen_ref="SUMATIF"`
yatim di pertemuan (`M4-AA2`).

Tidak ada ujian akhir yang dipaksakan.

---

## K. Pembedaan diagnostik

Diagnostik tetap opsional; tuntutan `penggunaan_hasil` yang ada tidak diubah;
`instrumen_ref`-nya wajib nyata.

Tetapi diagnostik **sengaja tidak masuk daftar jalur bukti**. `M4-Z`
membuktikannya dengan kasus yang paling menggoda: diagnostik yang menyebut
`referensi_kktp: ['K3']` DAN `cakupan_bukti: 'per_murid'` tetap tidak menutup K3.
Memetakan titik awal murid bukan membuktikan ia sampai.

---

## L. Integritas rujukan instrumen

Otoritas identitas instrumen asesmen: manifest Fase A **dan** `instrumen_asesmen[]`
final.

| Arah | Sudah ada sebelum M4 | Ditambahkan M4 |
|---|---|---|
| `instrumen_asesmen[].id` ↔ manifest | ✅ V7 (dua arah, termasuk `untuk_murid`) | — |
| `kktp[].instrumen_bukti` → instrumen | ❌ tidak pernah diperiksa | ✅ `M4-AD` |
| `asesmen_formatif[].instrumen_ref` → instrumen | ❌ | ✅ `M4-R` (manifest), `M4-S` (array final) |
| `asesmen_sumatif.instrumen_ref` → instrumen | ❌ | ✅ |
| `asesmen_diagnostik.instrumen_ref` → instrumen | ❌ | ✅ |
| jangkar sub_langkah → instrumen yang diklaim | ❌ | ✅ `M4-T` |
| instrumen final → dipakai jalur asesmen (integritas balik) | ❌ | ✅ `M4-AF` |
| `kktp[].instrumen_bukti` → dipakai jalur bukti per murid KKTP itu | ❌ | ✅ `M4-AE` |

Yang terakhir menutup rantainya: KKTP → evidence task → instrumen.

Integritas balik menghitung diagnostik, `KKTP.instrumen_bukti`, dan sub_langkah
asesmen sebagai pemakai — yang dicari di situ **pemakaian**, bukan bukti
ketercapaian. Instrumen pembelajaran (`PBL-xx`) tidak disentuh aturan ini.

Kelengkapan `konten_murid`/`panduan_guru` **tidak** dinilai di sini — itu M5. M4
memeriksa identitas dan pemakaian.

---

## M. Integritas manifest

Manifest Fase A dipakai sebagai kontrak identitas. **Tidak ada manifest baru
yang dibuat, dan manifest tidak dirancang ulang.**

### M4.1 — koreksi terarah: manifest berlaku juga di jalur perbaikan

Laporan sebelumnya mencatat ini sebagai celah tersisa; reviewer menetapkannya
sebagai blocker, dan sekarang ia ditutup.

**Sebelum** — pemanggilan validator kedua, yang memeriksa keluaran perbaikan,
mewarisi `manifest: undefined` dari kode sebelum M4:

```ts
validation = validateModulOutputV400(mergedFixed, …, jumlahMurid,
  undefined, perangkatDigitalDiizinkan(cd), true);
```

**Sesudah** — manifest Fase A yang SAMA dengan validasi pertama:

```ts
validation = validateModulOutputV400(mergedFixed, …, jumlahMurid,
  manifestFaseD, perangkatDigitalDiizinkan(cd), true, true);
```

| | |
|---|---|
| Berkas | `supabase/functions/generate-modul/index.ts` |
| Fungsi | handler Edge Function, blok perbaikan validasi |
| Perubahan | argumen ke-7: `undefined` → `manifestFaseD` |
| Uji pembukti | `M4-AM`, `M4-AM-BASE`, `M4-AN`, `M4-AN2`, `M4-AO` |

`manifestFaseD` sudah berada dalam lingkup yang sama dan merupakan objek yang
dipakai validasi pertama — jadi keduanya memakai **satu potret Fase A**, bukan
dua yang bisa berbeda. `M4-AO` menegakkannya di tingkat sumber: tepat dua
pemanggilan di jalur penyusunan, keduanya menyebut `manifestFaseD`, tidak satu
pun berbentuk `…, undefined, …`, dan keduanya `true, true`.

**Mengapa lubangnya penting.** Manifest adalah kontrak identitas instrumen dan
tidak berubah karena sebuah perbaikan: ia keluaran Fase A, sedangkan yang
diperbaiki keluaran fase sesudahnya. Menghilangkannya membuat gerbangnya paling
lemah tepat pada putaran ketika model baru saja salah sekali — keluaran
perbaikan boleh memperkenalkan instrumen yang ada di `instrumen_asesmen[]` final
tetapi tidak pernah ada di manifest, lalu lolos.

`M4-AM` memakukan kedua arahnya pada satu dokumen: ASM-03 yang sah di setiap
sisi kecuali manifest (ada di array final, dipakai jalur bukti per murid untuk
K3, dan jangkarnya memakainya) **ditolak** ketika manifest dikirim, dan
**LOLOS** ketika tidak — bentuk pemanggilan yang lama. Itulah regresi yang
sekarang terjaga.

`M4-AN2` memastikan cakupannya bukan hanya V7: rujukan instrumen dari jalur
formatif, sumatif, dan `KKTP.instrumen_bukti` masing-masing diperiksa terhadap
manifest, bukan hanya terhadap array final. Seluruh aturan M4 yang bergantung
pada manifest karena itu berlaku penuh atas keluaran hasil perbaikan.

---

## N. Propagasi kontrak M3

M4 adalah ujian bagi arsitektur M3, dan arsitektur itu lulus.

Formatif dicabut dari nullable dengan menyunting **satu** tempat:
`KONTRAK_ROOT.rencana_asesmen.bentuk` (plus `catatan`-nya) di `contract.ts`.
Yang berubah otomatis, tanpa satu suntingan tangan:

- kerangka JSON di SYSTEM_PROMPT (`kerangkaFase('A')`) — `M4-AH`;
- pesan perbaikan berlingkup fase (`perintahPerbaikanStruktural('A')`) — `M4-AI`;
- pesan perbaikan dokumen final (`perintahPerbaikanStruktural()`) — `M4-AI`.

Enum `jenis_keputusan` dan `cakupan_bukti` ditambahkan ke `ENUM_KONTRAK`, jadi
daftar yang validator tegakkan dan daftar yang model lihat mustahil menyimpang
(disisipkan lewat penanda `<nama_enum>`). `M4-AH2` menegaskan tidak ada salinan
kerangka asesmen tulisan tangan yang hidup lagi di SYSTEM_PROMPT.

**Tidak ada schema M4 kedua yang ditulis di SYSTEM_PROMPT.**

Bukti paling jelasnya justru di suite M3: tiga ujinya (`M3-E`, `M3-I`, `M3-N`)
harus diperbarui, dan versi M3-nya sendiri sudah menuliskan bahwa "uji ini AKAN
dibalik di M4". Pembaruannya tidak melemahkan apa pun — `M3-E` dan `M3-I`
sekarang menjaga bahwa diagnostik dan sumatif MASIH nullable sekaligus bahwa
formatif TIDAK lagi; `M3-N` hanya menyesuaikan pola argumen menjadi
`true, true`. M3 tetap 34/34.

---

## O. Validasi sekarang vs historis

Satu bendera, bukan lima: **`wajibKontrakAsesmenCurrent`**, bawaan `false`.

- **Penyusunan sekarang** — selalu `true`, di **kedua** pemanggilan validator
  (utama dan perbaikan). Dijaga `M4-AK`, yang membaca sumbernya dan menuntut
  setiap pemanggilan di jalur penyusunan berbunyi `true, true`.
- **Pembacaan/audit dokumen historis** — tetap `false`, dengan alasan yang sama
  seperti `wajibJejakWarisan` di M2: modul pra-M4 tidak punya field-field ini,
  dan menuntutnya secara surut bukan pemeriksaan melainkan mengubah aturan ke
  belakang.

Penyusunan sekarang **tidak** dilemahkan agar dokumen lama ikut lolos — arah
sebaliknya yang ditempuh. `M4-AJ` menegaskan dua hal sekaligus: kelima fixture
historis tetap pada temuan dasarnya, DAN tidak satu pun temuannya mengandung
kata dari aturan M4 (`tuntutan_ref`, `keputusan_ketercapaian`, `cakupan_bukti`,
`FMT-`) — jadi kebocoran aturan baru ke modus historis akan terlihat, bukan
tersembunyi di balik jumlah yang kebetulan sama.

---

## P. Perubahan pertanyaan guru

Diubah **maknanya**, dan jumlah pertanyaannya **turun satu** — tidak ada yang
ditambahkan.

**Sebelum** (`guru/js/rancang-chat-flow.js`), dua pertanyaan:

```
gunakan_formatif : "Apakah guru ingin mengecek pemahaman murid selama proses belajar berlangsung?"
                   [ya] [Lewati — tidak perlu asesmen selama proses]
teknik_formatif  : bersyarat pada gunakan_formatif = 'ya'
```

**Sesudah**, satu pertanyaan:

```
teknik_formatif  : "Bagaimana Anda ingin MiClass memeriksa pemahaman murid selama proses belajar?"
                   [Tanya jawab lisan di sela kegiatan]
                   [Mengamati murid saat mereka bekerja]
                   [Latihan singkat yang langsung dikoreksi]
                   [Murid menuliskan sendiri apa yang belum ia pahami]
                   [Serahkan kepada MiClass]
```

Kunci yang dipakai tetap `teknik_formatif` dengan opsi yang **sudah ada**
sebelumnya — tidak ada teknik baru yang dijanjikan kepada guru yang tidak dapat
sistem hasilkan. `M4-UI-4` mengikat itu ke backend: setiap opsi yang ditawarkan
harus benar-benar dipertahankan `resolvePreferensiFormatif()`.

Pertanyaan asesmen lainnya tidak dirancang ulang. Jumlah pertanyaan asesmen:
14 → 13, dipaku `M4-UI-3` sebagai kesamaan persis supaya penambahan pertanyaan
baru menjatuhkan uji, bukan lolos diam-diam.

`M4-UI-1` menegaskan tidak ada lagi jalan mematikan formatif; `M4-UI-2`
menegaskan "Serahkan kepada MiClass" ada dan pertanyaannya tidak lagi bersyarat.

Tidak ada blocker frontend: perubahan ini murni data deklaratif di
`RANCANG_FLOW`, dan jawaban lama yang tersimpan tetap diterima backend.

---

## Q. Uji deterministik

`tests/modul-assessment.test.ts` — **61 passed / 0 failed**. Tidak ada panggilan
model.

```
deno test --allow-read --allow-write tests/modul-assessment.test.ts
```

Cakupan terhadap daftar §25 reviewer: M4-A…M4-AL seluruhnya ada, sebagian
dipecah menjadi beberapa uji (`M4-C2`, `M4-C3`, `M4-M2`, `M4-AA2`, `M4-AC2`,
`M4-AC3`, `M4-AH2`, `M4-AI2`) ketika satu nama menampung dua sifat yang berbeda.
Ditambahkan di luar daftar: `M4-REPRO-1..5` (reproduksi celah), `M4-BASE`
(fixture kontrak sekarang memang sehat di kedua modus), `M4-UI-1..4` (§26), dan
`M4-AM`/`M4-AM-BASE`/`M4-AN`/`M4-AN2`/`M4-AO` (koreksi M4.1, §M).

Manifest untuk uji M4.1 **diturunkan dari instrumen di dokumen fixture itu
sendiri** (`manifestSekarang()`), bukan ditulis ulang, supaya ia tidak dapat
menyimpang diam-diam dari fixture yang ia jaga.

Setiap uji penolakan memeriksa **sebabnya**, bukan hanya `valid === false` —
pembantu `tolak()` menuntut potongan pesan yang dimaksud, sehingga uji tidak
dapat lulus karena galat yang salah.

Validator dan resolver diambil **dari sumber Edge Function**, bukan disalin ke
harness: yang diuji kode yang benar-benar dikirim.

Yang M4 **tidak** validasi, sesuai batas yang reviewer tetapkan: kelengkapan
kunci jawaban, mutu isi rubrik, kelengkapan teks murid, bahan fiksi/nonfiksi,
bahan hantu, kelayakan cetak (M5); kausalitas konteks — kesiapan, A17,
prioritas guru, keautentikan kejuruan (M6); mutu semantik (M9).

---

## R. Regresi ATP/M1/M2/M3

| Suite | Sebelum | Sesudah |
|---|---|---|
| ATP `atp-kontrak.test.ts` | 60/0 | **60/0** |
| ATP `atp-acuan-sinkron.mjs` | LULUS | **LULUS** |
| ATP `atp-trace.mjs --periksa` | LULUS | **LULUS** |
| M1 `modul-anchor.test.ts` | 29/0 | **29/0** |
| M2 `modul-warisan.test.ts` | 41/0 | **41/0** |
| M3 `modul-contract.test.ts` | 34/0 | **34/0** |
| M4 `modul-assessment.test.ts` | 56/0 | **61/0** |
| `deno check generate-modul/index.ts` | hijau | **hijau** |
| `deno check generate-modul/contract.ts` | hijau | **hijau** |

Tidak ada uji sebelumnya yang dilemahkan. Tiga uji M3 diperbarui; alasannya di §N.

`node tests/verify-migrations.mjs` melaporkan satu item: migration
`20260910000001_modul-tp-snapshot-hash.sql` ada di lokal dan belum di-push.
**Pre-existing dari M1, bukan dari M4** — M4 tidak menyentuh satu pun migration.

ATP yang sudah diterima tidak diubah, dan semantik `tp_snapshot_hash` tidak
disentuh.

---

## S. Regresi fixture historis

```
✓ tp02.json   0 temuan   sehat — penjaga agar aturan tidak jadi galak
✓ tp03.json   0 temuan   sehat, memakai video jadi perangkat digital diizinkan
✓ tp04.json   0 temuan   sehat — disusun setelah Fase B2 dipisah
✓ tp05.json   1 temuan   naskah menunjuk judul yang tidak ada di PBL-01
✓ tp06.json   1 temuan   ASM-02 menilai K4 yang tidak punya KKTP
Semua 5 contoh sesuai harapan.
```

Kelima fixture **tidak diubah** untuk memalsukan kepatuhan M4. Fixture kontrak
sekarang dibangun terpisah di dalam suite M4 (`fixtureSekarang()`), di atas
`tp02` sebagai titik berangkat.

Satu keputusan bentuk yang layak dilihat reviewer: jangkar formatif dibuat
dengan memberi `asesmen_ref` pada sub_langkah yang **sudah ada**, bukan dengan
menyisipkan sub_langkah baru. Menyisipkan akan merusak rantai durasi yang V1/V2
jaga, dan uji yang gagal karena aritmetika waktu tidak akan mengatakan apa pun
tentang rantai bukti.

---

## T. Berkas yang berubah

| Berkas | Peran |
|---|---|
| `supabase/functions/generate-modul/contract.ts` | otoritas bentuk: `kktp.bentuk`, `rencana_asesmen.bentuk`, dua enum baru, catatan nullability |
| `supabase/functions/generate-modul/index.ts` | tipe (`KeputusanKetercapaian`, `CakupanBukti`, `KktpItem`, `RencanaAsesmen`), `resolvePreferensiFormatif()`, blok validasi rantai bukti, SYSTEM_PROMPT, `instruksi_kktp`, `instruksi_manifest`, wiring Fase A, dua pemanggilan validator; **M4.1**: manifest Fase A ikut ke validasi jalur perbaikan |
| `guru/js/rancang-chat-flow.js` | pertanyaan formatif: dua → satu, preferensi bukan tombol |
| `tests/modul-contract.test.ts` | `M3-E`, `M3-I`, `M3-N` diperbarui (lihat §N) |
| `tests/modul-assessment.test.ts` | **BARU** — 61 uji (termasuk 5 uji M4.1) |
| `docs/MODULE-M4-ASSESSMENT-EVIDENCE.diff` | **BARU** — bukti diff |
| `docs/MODULE-M4-ASSESSMENT-REPORT.md` | **BARU** — laporan ini |

`MODUL_SCHEMA_VERSION` **tidak dinaikkan**, tetap `4.0.0`, sesuai §22: M4–M7
masih satu rangkaian pengerasan Modul V4 yang belum dirilis, dan penanda versi
finalnya diputuskan setelah kontrak Modul/Naskah lengkap diterima. Pembedaan
sekarang-vs-historis ditegakkan jalur penyusunan dan bendera kontrak, bukan
dengan membatalkan keabsahan dokumen lama secara surut.

Tidak ada migration. Tidak ada perubahan basis data.

---

## U. Bukti

`docs/MODULE-M4-ASSESSMENT-EVIDENCE.diff` — hanya perubahan M4 sesudah
checkpoint M3 (`12c607e`), termasuk berkas uji baru secara penuh.

---

## V. Celah M4 yang tersisa

Dilaporkan, bukan ditambal diam-diam:

~~**Pemanggilan validator kedua tidak menerima manifest.**~~ **DITUTUP di M4.1**
— lihat §M. Validasi setelah perbaikan menerima manifest Fase A yang sama dengan
validasi pertama, dan seluruh aturan M4 yang bergantung padanya berlaku penuh
atas keluaran perbaikan.

Empat yang tersisa, dan reviewer sudah menyatakan keempatnya bukan blocker:

1. **Cabang "langkah tidak ada di pertemuan itu"** hanya tercapai pada keluaran
   Fase B yang rusak (§H). Sifatnya penjaga, bukan jalur yang biasa dilewati.
2. **Distribusi formatif belum ditegakkan secara struktural.** SYSTEM_PROMPT
   memintanya ("terdistribusi di langkah berbeda, bukan semuanya di akhir"), dan
   M4 tidak menjadikannya aturan validator. Ia menyangkut kelayakan pedagogis,
   bukan identitas rantai bukti.
3. **Ambang `persentase` belum diperiksa terhadap penyebutnya.** `satuan` bebas
   teks, jadi `{ jenis: 'persentase', nilai_minimum: 80, satuan: 'persen dari 4
   tahapan' }` sah secara struktural walau 80% dari 4 tidak dapat terjadi. V14
   masih menjaga hal ini pada `ambang_batas`. Menyambungkan keduanya menuntut
   penyebut berupa angka terstruktur — perubahan bentuk yang sebaiknya diputuskan
   bersama M8 ketika renderer ikut memakainya.
4. **Belum ada modul kontrak-sekarang dari produksi.** Seluruh bukti M4
   deterministik dan tanpa panggilan model, sesuai §31. Apakah model benar-benar
   mematuhi bentuk baru baru terukur pada generate berikutnya setelah deploy —
   dan `generate-modul` M4 **belum di-deploy**.

---

## W. Rekomendasi

Aturan M4 seluruhnya deterministik: keberadaan, ID, pemetaan, cakupan, ambang
terstruktur, penempatan, identitas instrumen. Tidak ada validator bahasa alami
yang berpura-pura menilai keterukuran kriteria, mutu umpan balik, atau apakah
asesmennya sungguh mengukur kompetensinya — semuanya M9.

Yang perlu reviewer ketahui sebelum menerima: **gerbang M4 belum pernah diukur
terhadap keluaran model sungguhan.** Pelajaran yang mahal di proyek ini
mengatakan gerbang dikalibrasi dengan mengukur, bukan diyakini benar — tiga dari
lima aturan validator Naskah sempat menjatuhkan modul yang sehat, dan satu
aturan yang benar sengaja tidak dipasang karena menjatuhkan 4 dari 5 modul.
Perbedaannya di sini: aturan M4 menuntut field yang model memang diperintahkan
menghasilkan, dan seluruh bentuk itu sudah sampai ke prompt beserta pesan
perbaikannya. Risiko terbesarnya bukan salah tuduh melainkan putaran perbaikan
yang lebih sering di beberapa generate pertama.

Karena itu, setelah M4 diterima dan sebelum M5 dimulai, saran urutannya:
deploy `generate-modul`, jalankan satu generate nyata, lalu ukur berapa banyak
gerbang M4 yang tersentuh dan mana yang tersentuh karena modelnya belum patuh
dan mana karena aturannya terlalu galak. Satu modul sudah cukup untuk memisahkan
keduanya.

---

# MODULE M4 — READY FOR REVIEW

Termasuk koreksi terarah **M4.1** (§M): manifest Fase A kini berlaku juga di
jalur perbaikan.

Tidak di-push. Tidak di-deploy. Tidak ada migration produksi. Tidak ada
penulisan ke basis data produksi. Tidak ada panggilan Gemini. M4 belum
di-commit, menunggu penerimaan reviewer. M5 belum dimulai.
