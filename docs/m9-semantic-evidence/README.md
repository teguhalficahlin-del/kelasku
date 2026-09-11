# M9 — bukti penerimaan semantik

Status: **MODULE M9 — ACCEPTED** (keputusan peninjau, 11 September 2026).
Laporan lengkap: `docs/MODULE-M9-SEMANTIC-REPORT.md`.

| | |
|---|---|
| Model / penyedia | Google Gemini / `gemini-3.8-flash` |
| Cakupan | Bahasa Inggris Fase E (CP `046/H/KR/2025`) — **tidak** ada klaim lintas mapel |
| Harness | `tests/m9-semantic-harness.ts` — sumber Edge Function asli, tanpa deploy dan tanpa tulisan DB |
| Aturan | satu generate per skenario, maksimal satu lifecycle perbaikan produksi, tanpa suntingan JSON manual |

Hanya bukti kanonik yang ada di folder ini. Percobaan yang digantikan atau gagal
tetap di `tests/artifacts/m9/` (lokal, tidak di-commit) sebagai riwayat penemuan.
Tidak ada kunci API atau rahasia di berkas mana pun.

Bentuk nama: `*-input.json` masukan skenario; `*-state.json` state produksi yang
dipakai perbaikan dan validasi ulang; `*-output.json` dokumen gabungan;
`*-meta.json` pemakaian token dan hasil validasi; `*-request.txt` permintaan
perbaikan yang dikirim ke model.

## S1 — kesiapan `jauh_di_bawah` (32 murid) — PASS

| Berkas | Peran |
|---|---|
| `s1/skenario-01-attempt6-{input,state,output,meta}` | generate kanonik — BEFORE, 3 galat |
| `s1/skenario-01-attempt6-repairfix1-{request.txt,output,meta}` | **perbaikan yang diterima** (jalur dokumen) — AFTER, 0 galat |
| `s1/skenario-01-attempt6-repairwaktu1-{output,meta}` | bukti batas waktu: perbaikan yang sama selesai 57,1 s di bawah batas 100 s (dahulu dibatalkan di 50 s). Permintaannya identik dengan `repairfix1-request.txt` |

## S2 — kesiapan `sesuai` (32 murid) — PASS

| Berkas | Peran |
|---|---|
| `s2/skenario-02-attempt8-{input,state,output,meta}` | generate kanonik. `meta` mencatat 1 galat V13 lama (BEFORE) |
| `s2/skenario-02-attempt8-validasi-ulang-v13.txt` | AFTER: validator sekarang → 0 galat. Dokumen **tidak** disusun ulang dan **tidak** diperbaiki |
| `s2/skenario-02-attempt8-repairfix1-meta.json` | perbaikan dengan batas lama 50 s yang dibatalkan — dasar koreksi batas waktu. Bukan bagian dokumen kanonik |

Lembar soal sumatif ada: ASM-02 `soal_latihan`, `untuk_murid=true`, teks sumatif +
12 soal / 12 kunci; K1 → soal 1–2, K2 → 3–7, K3 → 8–12.

## S3 — konteks kejuruan (30 murid) — PASS

| Berkas | Peran |
|---|---|
| `s3/skenario-03-attempt7-{input,state,output,meta}` | generate kanonik — BEFORE, 1 galat: P3 = 185 menit, wajib 180 |
| `s3/skenario-03-attempt7-repairscoped1-request.txt` | permintaan perbaikan terarah (`PANDUAN_PERBAIKAN_WAKTU`: P3 185 → 180, selisih −5) |
| `s3/skenario-03-attempt7-repairscoped1-{faseB-pertemuan,b2-naskah,output,meta}` | **perbaikan yang diterima** — AFTER, 0 galat; hanya PENUTUP P3 15 → 10, P1/P2 identik, naskah disusun ulang |

## S4 — penekanan guru + A17 (28 murid) — PASS, 1 MINOR

| Berkas | Peran |
|---|---|
| `s4/skenario-04-attempt4-{input,state,output,meta}` | generate kanonik — 0 galat, tanpa perbaikan |

**MINOR yang diterima:** sumatif menilai "4 dari 5 kalimat" pada tulisan bebas;
satuan lima kalimat berasal dari lembar latihan formatif (PBL-02), bukan dari
tugas sumatif itu sendiri.

## Pendukung

| Berkas | Peran |
|---|---|
| `pendukung/invarian-sumatif-pengukuran.txt` | pengukuran yang menjelaskan mengapa invarian struktural "KKTP penghitung → lembar murid di sumatif" **tidak** dipasang: ia menolak S3 dan S4 yang sah |

Uji deterministik yang mengunci koreksi: `tests/modul-perbaikan.test.ts` (9) dan
`tests/modul-m9-koreksi.test.ts` (40).
