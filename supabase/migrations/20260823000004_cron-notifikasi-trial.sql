-- 20260823000004_cron-notifikasi-trial.sql
-- Menjadwalkan Edge Function kirim-notifikasi-trial berjalan sekali sehari
-- pukul 00.00 UTC — 07.00 WIB.
--
-- Item D dari docs/TIER-AND-LIFECYCLE.md §7 menyediakan fungsinya; migrasi ini
-- yang membuatnya berjalan sendiri. Tanpa jadwal, notifikasi H+0/H+3/H+7 hanya
-- terkirim kalau ada yang ingat memanggilnya manual, dan tonggak yang lewat
-- tidak pernah dikirim susulan.
--
-- KENAPA 00.00 UTC. cron.timezone pada proyek ini bernilai 'GMT' dan TimeZone
-- server 'UTC' — keduanya diperiksa sebelum migrasi ini ditulis — sehingga
-- '0 0 * * *' benar-benar jatuh pada 07.00 WIB, bukan tergantung zona waktu
-- siapa pun. Kalau salah satu setting itu kelak diubah, jam kirim ikut
-- bergeser; itu satu-satunya hal yang membuat jadwal ini rapuh.
--
-- KUNCI TIDAK DITANAM DI SINI, DAN TIDAK BISA DIBACA DARI SECRETS.
-- Secrets Supabase (SUPABASE_SERVICE_ROLE_KEY dan kawan-kawan) hanya tersedia
-- bagi Edge Function; Postgres tidak dapat membacanya. Menyalin kuncinya ke
-- badan migrasi berarti menaruh kredensial produksi di dalam repo git
-- selamanya — tidak dilakukan. Yang dipakai adalah Vault: perintah cron
-- membaca kunci dari vault.decrypted_secrets pada saat ia berjalan, sehingga
-- yang tersimpan di repo hanyalah namanya.
--
-- PRASYARAT YANG HARUS DIPENUHI ROMO SEBELUM JADWAL INI BERGUNA:
--
--     SELECT vault.create_secret(
--       '<SERVICE_ROLE_KEY>',
--       'service_role_key',
--       'Dipakai cron kirim-notifikasi-trial-harian'
--     );
--
-- Dijalankan sekali dari SQL editor. Selama secret itu belum ada, jadwal ini
-- TIDAK diam-diam gagal: perintahnya sengaja RAISE EXCEPTION, sehingga
-- kegagalannya tercatat di cron.job_run_details dan terlihat saat diperiksa.
-- Diam adalah bentuk kegagalan terburuk untuk pekerjaan terjadwal — lebih baik
-- ia berteriak setiap hari daripada tampak sehat sambil tidak mengirim apa pun.
--
-- KENAPA TIDAK ADA PENGUNCI ANTI-TUMPANG-TINDIH. net.http_post bersifat
-- asinkron: ia menaruh permintaan pada antrean pg_net dan langsung kembali,
-- jadi perintah cron ini selesai dalam hitungan milidetik. Dua pemanggilan
-- yang benar-benar bersamaan praktis mustahil dari jadwal harian. Penjaga yang
-- sesungguhnya tetap ada di lapis bawah: kunci unik
-- (profile_id, hari_notifikasi) pada notifikasi_log membuat tonggak yang sama
-- tidak dapat tercatat dua kali, apa pun yang terjadi di atasnya.
--
-- Keadaan sebelum migrasi (diperiksa di proyek tertaut, 23 Agustus 2026):
--   pg_cron 1.6.4 dan pg_net 0.20.4 aktif, skema cron/net/vault tersedia,
--   nol job terdaftar di cron.job, vault.secrets kosong.

BEGIN;

-- cron.schedule memakai jobname sebagai kunci: memanggilnya lagi dengan nama
-- yang sama memperbarui jadwal dan perintahnya, bukan membuat job kedua.
-- Karena itu migrasi ini idempotent tanpa perlu DROP lebih dulu.
SELECT cron.schedule(
  'kirim-notifikasi-trial-harian',
  '0 0 * * *',
  $job$
  DO $inner$
  DECLARE
    v_key text;
  BEGIN
    SELECT decrypted_secret INTO v_key
    FROM vault.decrypted_secrets
    WHERE name = 'service_role_key';

    IF v_key IS NULL OR v_key = '' THEN
      RAISE EXCEPTION
        'Vault secret service_role_key belum tersimpan — notifikasi trial tidak terkirim. '
        'Jalankan: SELECT vault.create_secret(''<SERVICE_ROLE_KEY>'', ''service_role_key'');';
    END IF;

    PERFORM net.http_post(
      url     := 'https://teccdzetrdjowqemnuuc.supabase.co/functions/v1/kirim-notifikasi-trial',
      headers := jsonb_build_object(
                   'Content-Type',  'application/json',
                   'Authorization', 'Bearer ' || v_key
                 ),
      body    := '{}'::jsonb,
      timeout_milliseconds := 30000
    );
  END
  $inner$;
  $job$
);

-- ---------------------------------------------------------------------------
-- Verifikasi — gagal berarti seluruh transaksi dibatalkan
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_n        int;
  v_schedule text;
  v_active   boolean;
  v_command  text;
BEGIN
  -- 1. Tepat satu job dengan nama itu
  SELECT COUNT(*) INTO v_n
  FROM cron.job
  WHERE jobname = 'kirim-notifikasi-trial-harian';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'Job kirim-notifikasi-trial-harian harus tepat satu, ditemukan % — ROLLBACK', v_n;
  END IF;

  SELECT schedule, active, command
  INTO v_schedule, v_active, v_command
  FROM cron.job
  WHERE jobname = 'kirim-notifikasi-trial-harian';

  -- 2. Jadwal harian, sekali sehari
  IF v_schedule <> '0 0 * * *' THEN
    RAISE EXCEPTION 'Jadwal harus ''0 0 * * *'', ditemukan % — ROLLBACK', v_schedule;
  END IF;

  -- 3. Job aktif
  IF NOT v_active THEN
    RAISE EXCEPTION 'Job terdaftar tetapi tidak aktif — ROLLBACK';
  END IF;

  -- 4. Tidak ada kredensial yang ikut tersimpan di perintahnya. Ini diperiksa,
  --    bukan sekadar dipercaya: JWT service role selalu diawali 'eyJ'.
  IF v_command LIKE '%eyJ%' THEN
    RAISE EXCEPTION 'Perintah cron tampaknya memuat kunci mentah — ROLLBACK';
  END IF;

  -- 5. Perintahnya memang membaca kunci dari vault
  IF v_command NOT LIKE '%vault.decrypted_secrets%' THEN
    RAISE EXCEPTION 'Perintah cron tidak membaca kunci dari vault — ROLLBACK';
  END IF;

  -- 6. Zona waktu penjadwal masih seperti yang diasumsikan saat jam dipilih
  IF current_setting('cron.timezone', true) IS DISTINCT FROM 'GMT' THEN
    RAISE EXCEPTION
      'cron.timezone bukan GMT (%) — jam kirim tidak lagi 07.00 WIB, tinjau ulang jadwal — ROLLBACK',
      current_setting('cron.timezone', true);
  END IF;
END $$;

COMMIT;

-- Cakupan yang sengaja dibatasi:
--
-- Vault secret tidak dibuat di sini. Migrasi tidak boleh memuat nilai kunci,
-- dan tidak ada cara sah bagi migrasi membaca secrets Edge Function. Romo
-- menjalankan vault.create_secret sekali, lihat prasyarat di kepala berkas.
--
-- URL proyek ditanam sebagai teks. Ia memang publik — sama dengan yang dipakai
-- setiap klien — dan tidak ada mekanisme lain yang tersedia dari dalam SQL.
-- Kalau proyek dipindah, baris itu harus diubah bersama migrasi baru.
--
-- Hasil pemanggilan tidak diperiksa. net.http_post asinkron; jawabannya
-- mendarat di net._http_response dan bisa ditinjau di sana kalau perlu.
-- Ringkasan yang benar-benar berguna — berapa terkirim, berapa gagal — sudah
-- dikembalikan Edge Function itu sendiri dan tercatat di lognya.
--
-- Hard delete belum dijadwalkan. Ini hanya notifikasi. Item C punya jadwalnya
-- sendiri, dan menurut docs/TIER-AND-LIFECYCLE.md §7 ia baru boleh dipasang
-- setelah jalur notifikasi ini terbukti benar-benar mengirim.
