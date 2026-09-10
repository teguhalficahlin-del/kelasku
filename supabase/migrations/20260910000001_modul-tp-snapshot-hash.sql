-- Migration: 20260910000001_modul-tp-snapshot-hash.sql
-- Tujuan  : identitas TP untuk Modul Ajar (M1).
--
-- MASALAH (docs/MODULE-NASKAH-CONTRACT-LOCK.md §P).
-- modul_induk terikat ke ATP hanya lewat (atp_induk_id, nomor_tp) — bilangan
-- posisi — sementara generate-atp menimpa atp_induk.progresi_tp DI BARIS YANG
-- SAMA setiap penyusunan ulang. Nomornya tetap resolve, ke TP yang berbeda,
-- dan Modul lama diam-diam menempel ke kemampuan yang bukan miliknya.
--
-- YANG DITAMBAHKAN: satu kolom. tp_snapshot_hash adalah SHA-256 heksadesimal
-- atas potret TP yang persis dipakai Modul — atp_induk_id, nomor_tp, judul,
-- tuntutan, kategori_teks, semester, jp_alokasi, jp_pertemuan, versi_cp.
-- Definisi dan kanonikalisasinya tinggal di satu tempat:
-- supabase/functions/generate-modul/anchor.ts (FIELD_HASH). Jangan menuliskan
-- ulang aturannya di SQL — kembar yang menyimpang diam-diam sudah dibayar dua
-- kali di repo ini.
--
-- NULL BERARTI "TIDAK DIKETAHUI", BUKAN "COCOK".
-- Baris lama sengaja dibiarkan NULL. TIDAK ADA BACKFILL: menghitung hash hari
-- ini untuk Modul yang disusun dari potret kemarin justru memberi identitas
-- palsu kepada ketidakcocokan yang nyata — persis kebalikan dari tujuan kolom
-- ini. Modul lama berisi + hash NULL dibaca sebagai LEGACY_UNVERIFIED: boleh
-- dibuka, dilihat, dan diunduh; tidak boleh disusun ulang tanpa keputusan
-- eksplisit guru.
--
-- Idempotent : IF NOT EXISTS.
-- Additive   : tidak ada DROP, tidak ada UPDATE, tidak ada perubahan constraint,
--              tidak ada perubahan RLS. Kolom nullable tanpa default, sehingga
--              seluruh INSERT dan UPDATE yang sudah ada tetap sah apa adanya.
-- Rollback   : ALTER TABLE public.modul_induk DROP COLUMN IF EXISTS tp_snapshot_hash;
--              Aman kapan pun. Tidak ada baris yang hilang dan tidak ada kolom
--              lain yang bergantung padanya; yang kembali hanyalah keadaan
--              sebelum M1, yaitu seluruh Modul menjadi tak terverifikasi lagi.

BEGIN;

ALTER TABLE public.modul_induk
  ADD COLUMN IF NOT EXISTS tp_snapshot_hash text;

COMMENT ON COLUMN public.modul_induk.tp_snapshot_hash IS
  'SHA-256 potret TP yang dipakai Modul ini. NULL = tidak diketahui '
  '(Modul sebelum M1), BUKAN berarti cocok. Kanonikalisasi: '
  'supabase/functions/generate-modul/anchor.ts.';

-- Tidak ada index. Kolom ini hanya pernah dibaca lewat baris modul_induk yang
-- sudah ditemukan lebih dulu lewat primary key atau
-- idx_modul_induk_lookup (guru_id, atp_induk_id, status, updated_at) — tidak
-- ada satu pun jalur pencarian yang memakainya sebagai predikat. Index tanpa
-- pembaca adalah beban tulis tanpa imbalan.

COMMIT;
