# Kontrak ATP — pertanyaan, data, keputusan

**DIBANGKITKAN — jangan sunting berkas ini langsung.**
Sumber: `supabase/functions/generate-atp/kontrak.ts` (`KONTRAK_PERTANYAAN`).
Bangun ulang: `node tests/atp-trace.mjs`.

Dokumen ini menjawab satu pertanyaan untuk setiap hal yang MiClass tanyakan
kepada guru di alur ATP: **jawabannya dipakai untuk apa?**

Latar belakangnya ada di CLAUDE.md — pemeriksaan seluruh pertanyaan Tab Rancang
menemukan empat pertanyaan yang meminta guru memutuskan sesuatu yang lalu
dibuang, satu di antaranya menjanjikan dokumen yang tidak ada mesin pembuatnya
di seluruh repositori. *Menambah pertanyaan itu murah; menyambungkannya ke hasil
tidak.* Tabel di bawah adalah sambungannya, dan
`tests/atp-kontrak.test.ts` menggagalkan diri kalau ada pertanyaan di salah
satu sisi yang tidak punya pasangan di sisi lain.

## Jenis

| Kode | Arti |
|---|---|
| A | **Masukan penyusunan.** Jawabannya memengaruhi isi ATP; ia diterjemahkan jadi frasa manusia lalu masuk ke bagian konteks yang dikirim ke penyusun. |
| B | **Percabangan/tampilan.** Jawabannya hanya mengatur pertanyaan berikutnya atau menjadi gerbang. Ia tidak dikirim sebagai konteks. |
| C | **Hitungan deterministik.** Jawabannya dibaca kode untuk menghitung waktu atau batas. Angkanya tidak pernah diserahkan kepada AI untuk dihitung. |

Sebaran saat ini: **18 jenis A, 8 jenis B, 9 jenis C** — 35 entri.

## Jejak

| SPEC | ID pertanyaan | Fase | Tersimpan di | Jenis | Dibaca oleh | Keputusan ATP yang dipengaruhi |
|---|---|---|---|---|---|---|
| A1 | `konfirmasi_konteks` | KONTEKS_CP | `KONTEKS_CP.konfirmasi_konteks` | B | generate-atp langkah 5 (gerbang wajib "sesuai") | menghentikan proses bila CP tidak sesuai — tidak ada generate, tidak ada kuota terpakai |
| A1 | `pilih_program_keahlian` | KONTEKS_CP | `KONTEKS_CP.pilih_program_keahlian` | B | klien — menentukan nilai program_keahlian | (cabang saja) |
| A1 | `program_keahlian_teks_bebas` | KONTEKS_CP | `KONTEKS_CP.program_keahlian_teks_bebas` | B | klien — menentukan nilai program_keahlian | (cabang saja) |
| A1 | `program_keahlian` | KONTEKS_CP | `KONTEKS_CP.program_keahlian` | A | bangunKonteksAtp → cp_anchor.program_keahlian + konteks_kejuruan | keautentikan situasi kerja bila dipakai — bukan porsinya (milik A17) dan bukan kompetensinya |
| A2 | `jumlah_murid_kelas` | PROFIL_KELAS | `rancang_settings.jumlah_murid` | A | bangunKonteksAtp → batas_mutlak | kelayakan TP: melarang tujuan yang menuntut tiap murid dinilai satu per satu di kelas besar |
| A3 | `bahasa_pengantar` | PROFIL_KELAS | `rancang_settings.bahasa_pengantar` | A | resolveDelegasi → bangunKonteksAtp.kesiapan_murid; generate-modul kebijakan bahasa | bahasa judul TP dan dukungan bahasa yang diandaikan |
| A4 | `tingkat_kemampuan_awal` | PROFIL_SISWA | `PROFIL_SISWA.tingkat_kemampuan_awal` | A | bangunKonteksAtp → kesiapan_murid; hitungTargetTp; resolveDelegasi; generate-modul arahanTitikAwal | titik awal progresi, kedalaman TP awal, dan kepadatan TP |
| A5 | `dasar_informasi_kesiapan` | PROFIL_SISWA | `PROFIL_SISWA.dasar_informasi_kesiapan` | A | bangunKonteksAtp → kesiapan_murid; dasarProfilMurid; kumpulkanAsumsi | menandai profil murid sebagai bukti atau asumsi di hasil ATP |
| A6 | `kondisi_murid` | PROFIL_SISWA | `PROFIL_SISWA.kondisi_murid` | B | klien — membuka isian uraian | (cabang saja) |
| A6 | `kondisi_murid_uraian` | PROFIL_SISWA | `PROFIL_SISWA.kondisi_murid_uraian` | A | bangunKonteksAtp → kesiapan_murid | penyesuaian titik awal dan urutan untuk kondisi yang guru sebutkan |
| A7 | `bantuan_konkret` | PROFIL_SISWA | `PROFIL_SISWA.bantuan_konkret` | A | bangunKonteksAtp → kesiapan_murid; kumpulkanAsumsi | bentuk dukungan yang harus mungkin dilakukan di dalam TP |
| A7 | `bantuan_konkret_lain` | PROFIL_SISWA | `PROFIL_SISWA.bantuan_konkret_lain` | A | bangunKonteksAtp → kesiapan_murid | sama dengan bantuan_konkret |
| A8 | `tahun_pelajaran` | WAKTU | `WAKTU.tahun_pelajaran` | A | bangunKonteksAtp → anggaran_waktu; identitas dokumen ATP | tahun pelajaran yang tercetak pada ATP |
| A8 | `tahun_pelajaran_lain` | WAKTU | `WAKTU.tahun_pelajaran_lain` | A | bangunKonteksAtp → anggaran_waktu | sama dengan tahun_pelajaran |
| A9 | `jp_per_minggu` | WAKTU | `WAKTU.jp_per_minggu` | C | hitungAlokasi → jp_operasional, satuan_pertemuan, anggaran semester | seluruh anggaran waktu ATP |
| A10 | `durasi_jp` | WAKTU | `WAKTU.durasi_jp` | A | bangunKonteksAtp → anggaran_waktu; generate-modul durasi tahap | panjang nyata satu pertemuan dalam menit |
| A10 | `durasi_jp_lain` | WAKTU | `WAKTU.durasi_jp_lain` | A | bangunKonteksAtp → anggaran_waktu; generate-modul | sama dengan durasi_jp |
| A11 | `pola_jadwal` | WAKTU | `WAKTU.pola_jadwal` | C | hitungAlokasi → satuan_pertemuan | kelipatan JP yang wajib dipatuhi setiap TP |
| A11 | `jp_per_sesi` | WAKTU | `WAKTU.jp_per_sesi` | C | hitungAlokasi → satuan_pertemuan | sama dengan pola_jadwal |
| A12 | `minggu_efektif_mode` | WAKTU | `WAKTU.minggu_efektif_mode` | C | hitungAlokasi; kumpulkanAsumsi (menandai perkiraan sementara sebagai asumsi) | apakah jumlah minggu berstatus data guru atau asumsi MiClass |
| A12 | `minggu_sem1` | WAKTU | `WAKTU.minggu_sem1` | C | hitungAlokasi → anggaran semester 1 | jumlah JP yang boleh ditempatkan di semester 1 |
| A12 | `minggu_sem2` | WAKTU | `WAKTU.minggu_sem2` | C | hitungAlokasi → anggaran semester 2 | jumlah JP yang boleh ditempatkan di semester 2 |
| A13 | `cadangan_minggu` | WAKTU | `WAKTU.cadangan_minggu` | C | hitungAlokasi → jp_cadangan | JP yang disisihkan dari mengajar |
| A13 | `cadangan_minggu_lain` | WAKTU | `WAKTU.cadangan_minggu_lain` | C | hitungAlokasi → jp_cadangan | sama dengan cadangan_minggu |
| A14 | `konfirmasi_waktu` | WAKTU | `WAKTU.konfirmasi_waktu` | B | klien — rute perbaikan waktu | (cabang saja) |
| A15 | `strategi_prasyarat` | PENGUATAN_PRASYARAT | `PENGUATAN_PRASYARAT.strategi_prasyarat` | A | resolveDelegasi → bangunKonteksAtp.kesiapan_murid | penempatan penguatan kemampuan dasar: di awal, menyatu dengan topik, atau keduanya |
| A15a | `alokasi_prasyarat` | PENGUATAN_PRASYARAT | `PENGUATAN_PRASYARAT.alokasi_prasyarat` | B | klien — membuka isian JP | (cabang saja) |
| A15a | `jp_prasyarat` | PENGUATAN_PRASYARAT | `PENGUATAN_PRASYARAT.jp_prasyarat` | C | hitungAlokasi → jp_operasional; bangunKonteksAtp → kesiapan_murid | JP yang dipesan lebih dulu untuk penguatan, sebelum TP membagi sisanya |
| A16 | `target_prioritas` | PENGUATAN_PRASYARAT | `PENGUATAN_PRASYARAT.target_prioritas` | A | prioritasDipilih → bangunKonteksAtp.prioritas_guru + penerapan_prioritas_wajib; validasiAtp P1–P4 (jejak penerapan) | penekanan — urutan, porsi waktu, latar, atau isi — dengan jejak ke TP nyata; bukan bagian CP yang boleh diabaikan |
| A16 | `target_prioritas_uraian` | PENGUATAN_PRASYARAT | `PENGUATAN_PRASYARAT.target_prioritas_uraian` | A | prioritasDipilih (kunci uraian_guru) → prioritas_guru + penerapan_prioritas_wajib; validasiAtp P1–P4 | sama dengan target_prioritas |
| A17 | `konteks_tugas` | KONTEKS_DUDI | `KONTEKS_DUDI.konteks_tugas` | A | resolveDelegasi → bangunKonteksAtp.konteks_kejuruan | OTORITAS porsi situasi kerja dibanding kehidupan sehari-hari pada contoh dan tugas TP — mengalahkan saran program keahlian |
| A18 | `situasi_khusus` | KONTEKS_DUDI | `KONTEKS_DUDI.situasi_khusus` | B | klien — membuka isian uraian | (cabang saja) |
| A18 | `situasi_khusus_uraian` | KONTEKS_DUDI | `KONTEKS_DUDI.situasi_khusus_uraian` | A | bangunKonteksAtp → konteks_kejuruan | situasi yang wajib diutamakan atau dihindari di seluruh TP |
| A19 | `metode_pengurutan` | KONTEKS_DUDI | `KONTEKS_DUDI.metode_pengurutan` | A | resolveDelegasi → bangunKonteksAtp.prioritas_guru | urutan TP sepanjang fase (Tabel 3.3 Panduan Pembelajaran dan Asesmen 2025) |
| A20 | `persetujuan_atp_summary` | ATP_SUMMARY | `ATP_SUMMARY.persetujuan_atp_summary` | B | generate-atp langkah 5 (gerbang wajib "generate") | generate hanya berjalan setelah guru menyetujui arah ATP |

## Yang TIDAK ada di tabel ini, dan sebabnya

- `program_keahlian` bukan definisi pertanyaan tersendiri. Ia hasil dari salah
  satu dari tiga jalur A1: dikonfirmasi apa adanya, dipilih dari daftar, atau
  diketik guru. Nilainya tetap jenis A dan tetap tercantum.
- `tindakan_review_atp` adalah tindakan pascahasil, bukan pertanyaan corong
  (SPEC §4 akhir). Ia menentukan rute revisi, bukan isi ATP.
- Pertanyaan Modul Ajar (M1–M11) berada di luar cakupan dokumen ini.

## Keputusan yang diambil MiClass, bukan guru

Empat pertanyaan menyediakan pilihan **"tentukan saat menyusun"**: A3 bahasa
pengantar, A15 penempatan penguatan, A17 konteks tugas, dan A19 urutan
pembelajaran. Pilihan itu **tidak memanggil AI di tengah corong**; ia menyimpan
pendelegasian.

Keputusannya diambil **di kode** oleh `resolveDelegasi()`, bukan diserahkan
kepada model. Alasannya bukan selera: keputusan yang diambil model tidak bisa
dilaporkan kepada guru dengan jujur, tidak bisa diuji, dan berbeda tiap
generate. Setiap keputusan yang diambil dicatat beserta alasannya di
`ATP_HASIL.dasar_penyusunan.keputusan_miclass`, lalu ditampilkan di layar
hasil dan tercetak di dokumen ATP.

Aturan yang dipakai, ketika guru mendelegasikan atau tidak menjawab:

| Pertanyaan | Kesiapan murid | Yang MiClass pilih |
|---|---|---|
| A19 urutan pembelajaran | jauh di bawah / sangat beragam | Kemampuan dasar dulu (hierarki) |
| A19 urutan pembelajaran | selain itu | Bantuan berkurang menuju mandiri |
| A17 konteks tugas | apa pun | Seimbang |
| A15 penguatan | jauh di bawah | Di awal dan saat topik membutuhkannya |
| A15 penguatan | sudah siap | Tidak diperlukan |
| A15 penguatan | selain itu | Menyatu dengan topik |
| A3 bahasa | sudah siap | Campuran |
| A3 bahasa | selain itu | Bahasa Indonesia dominan |

Polanya satu: **kalau informasinya tidak cukup, pilih yang paling sedikit
menuntut prasyarat dan paling mudah dijalankan lewat teks dan interaksi
langsung** (SPEC §4).
