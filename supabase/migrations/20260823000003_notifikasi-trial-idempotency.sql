-- 20260823000003_notifikasi-trial-idempotency.sql
-- Item D dari docs/TIER-AND-LIFECYCLE.md §5 — catatan pengiriman notifikasi
-- masa berlaku, supaya satu guru tidak menerima email yang sama dua kali.
--
-- KENAPA TABEL INI ADA. Edge Function kirim-notifikasi-trial dijalankan
-- terjadwal setiap hari, dan pekerjaan terjadwal bisa berjalan lebih dari
-- sekali: dijalankan ulang manual oleh Romo, dicoba lagi setelah timeout, atau
-- jadwal yang tumpang tindih. Tanpa catatan, setiap pengulangan mengirim ulang
-- seluruh email hari itu. Kunci unik (profile_id, hari_notifikasi) memindahkan
-- jaminan itu ke database, tempat ia tidak bisa dilanggar oleh kesalahan logika
-- di sisi fungsi.
--
-- KENAPA KUNCINYA (profile_id, hari_notifikasi) DAN BUKAN TANGGAL.
-- Yang dijaga bukan "satu email per hari kalender" melainkan "satu email per
-- tonggak". Tonggaknya tiga — H+0, H+3, H+7 — dan masing-masing hanya boleh
-- terkirim sekali seumur satu masa kedaluwarsa. Memakai tanggal sebagai bagian
-- kunci akan mengizinkan tonggak yang sama terkirim ulang keesokan harinya.
--
-- KONSEKUENSI YANG DISENGAJA: guru yang memperpanjang lalu kedaluwarsa lagi
-- tidak akan menerima notifikasi kedua kalinya, karena barisnya masih ada.
-- Ini dibiarkan karena bentuk yang benar untuk menanganinya adalah mengaitkan
-- catatan ke satu periode berlangganan, dan periode berlangganan belum menjadi
-- entitas di skema ini. Sampai ia ada, Romo dapat menghapus baris notifikasi
-- milik guru yang diperpanjang — satu DELETE bertarget, dan jalur itu memang
-- hanya terbuka untuk service_role.
--
-- Keadaan sebelum migrasi (diperiksa di proyek tertaut, 23 Agustus 2026):
--   Tabel notifikasi_log belum ada. 26 guru, seluruhnya punya email dan
--   expires_at di masa depan — nol guru yang akan dinotifikasi hari ini.

BEGIN;

CREATE TABLE IF NOT EXISTS public.notifikasi_log (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id       uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  hari_notifikasi  int         NOT NULL,
  sent_at          timestamptz NOT NULL DEFAULT NOW(),

  -- Hanya tiga tonggak yang dikenal. Nilai lain berarti fungsi pemanggil salah
  -- menghitung, dan lebih baik ia gagal keras di sini daripada menulis catatan
  -- yang tidak berarti apa-apa.
  CONSTRAINT notifikasi_log_hari_check
    CHECK (hari_notifikasi IN (0, 3, 7)),

  CONSTRAINT notifikasi_log_profile_hari_key
    UNIQUE (profile_id, hari_notifikasi)
);

-- UNIQUE di atas sudah membuat indeks pada (profile_id, hari_notifikasi), yang
-- juga melayani pencarian berdasarkan profile_id saja karena profile_id adalah
-- kolom terdepan. Indeks tambahan pada profile_id akan menjadi duplikat murni,
-- jadi sengaja tidak dibuat.

-- ---------------------------------------------------------------------------
-- Hak akses — hanya service_role
-- ---------------------------------------------------------------------------

-- Tabel ini murni catatan internal. Tidak ada portal yang membacanya dan tidak
-- ada guru yang boleh menyentuhnya: kemampuan menghapus barisnya sendiri sama
-- dengan kemampuan memaksa email terkirim berulang kali.
--
-- Dua lapis dipasang sekaligus dan keduanya perlu. RLS tanpa satu pun policy
-- menolak seluruh akses bagi role yang tunduk pada RLS; REVOKE menutup jalur
-- hak tabel yang di Supabase diberikan secara default kepada anon dan
-- authenticated saat tabel baru dibuat. service_role melewati RLS, jadi Edge
-- Function tetap dapat menulis.
ALTER TABLE public.notifikasi_log ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.notifikasi_log FROM PUBLIC;
REVOKE ALL ON TABLE public.notifikasi_log FROM anon;
REVOKE ALL ON TABLE public.notifikasi_log FROM authenticated;
GRANT  ALL ON TABLE public.notifikasi_log TO service_role;

-- ---------------------------------------------------------------------------
-- Verifikasi — gagal berarti seluruh transaksi dibatalkan
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_n int;
BEGIN
  -- 1. Tabel ada dan RLS menyala
  SELECT COUNT(*) INTO v_n
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'notifikasi_log'
    AND c.relrowsecurity;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'notifikasi_log tidak ada atau RLS belum menyala — ROLLBACK';
  END IF;

  -- 2. Nol policy — ketiadaan policy itulah yang menutup aksesnya
  SELECT COUNT(*) INTO v_n
  FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'notifikasi_log';
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'notifikasi_log seharusnya tanpa policy, ditemukan % — ROLLBACK', v_n;
  END IF;

  -- 3. Kunci unik terpasang — inti jaminan idempotency
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.notifikasi_log'::regclass
      AND conname  = 'notifikasi_log_profile_hari_key'
      AND contype  = 'u'
  ) THEN
    RAISE EXCEPTION 'Kunci unik (profile_id, hari_notifikasi) tidak terpasang — ROLLBACK';
  END IF;

  -- 4. FK ke profiles harus CASCADE, supaya catatan ikut lenyap saat akun
  --    dihapus di Item C dan tidak menghalangi penghapusan
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid   = 'public.notifikasi_log'::regclass
      AND contype    = 'f'
      AND confrelid  = 'public.profiles'::regclass
      AND confdeltype = 'c'
  ) THEN
    RAISE EXCEPTION 'FK notifikasi_log.profile_id harus ON DELETE CASCADE — ROLLBACK';
  END IF;

  -- 5. anon dan authenticated tidak boleh menyentuh tabel ini sama sekali
  IF has_table_privilege('anon', 'public.notifikasi_log', 'SELECT')
     OR has_table_privilege('anon', 'public.notifikasi_log', 'INSERT')
     OR has_table_privilege('authenticated', 'public.notifikasi_log', 'SELECT')
     OR has_table_privilege('authenticated', 'public.notifikasi_log', 'INSERT')
  THEN
    RAISE EXCEPTION 'anon/authenticated masih punya hak atas notifikasi_log — ROLLBACK';
  END IF;

  -- 6. service_role wajib bisa menulis, kalau tidak fungsinya mati
  IF NOT has_table_privilege('service_role', 'public.notifikasi_log', 'INSERT') THEN
    RAISE EXCEPTION 'service_role tidak dapat menulis notifikasi_log — ROLLBACK';
  END IF;
END $$;

COMMIT;

-- Cakupan yang sengaja dibatasi:
--
-- Tidak ada policy trial_guard di sini, berbeda dari 19 tabel pada Migration B.
-- Itu bukan kelalaian: penjaga tersebut hanya berlaku untuk role authenticated,
-- sedangkan tabel ini tidak memberi authenticated hak apa pun. Menambahkan
-- policy pada tabel yang tidak bisa disentuh siapa pun hanya akan
-- membingungkan pembaca berikutnya.
--
-- Penjadwalan tidak dipasang di sini. Migrasi ini hanya menyiapkan catatannya;
-- pemanggilan harian kirim-notifikasi-trial diatur terpisah lewat jadwal
-- Supabase atau pg_cron, dan itu keputusan operasional Romo, bukan bagian dari
-- skema.
--
-- Isi email tidak disimpan. Yang dicatat hanya fakta bahwa tonggak tertentu
-- sudah terkirim. Menyimpan salinan isi email berarti menyimpan alamat dan teks
-- yang tidak dibutuhkan siapa pun setelah terkirim.
