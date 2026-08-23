-- 20260823000020_cron-hard-delete-expired-guru.sql
-- Jadwalkan hard-delete-expired-guru sekali sehari.
--
-- Nomor 20260823000019 sudah terpakai (sec035-rate-limits, dari sesi lain),
-- jadi migrasi ini memakai nomor kosong berikutnya.
--
-- PENYIMPANGAN YANG DISENGAJA DARI docs/TIER-AND-LIFECYCLE.md §7.
--
-- Dokumen memilih Supabase Scheduled Edge Function, bukan pg_cron, dengan
-- alasan: "untuk operasi yang merusak permanen, kegagalan harus terlihat. Log
-- Scheduled Function tampil di dashboard Functions; kegagalan pg_cron tenggelam
-- di cron.job_run_details."
--
-- Scheduled Function tidak tersedia pada plan proyek ini, jadi pg_cron adalah
-- satu-satunya jalan. Yang hilang perlu disebut terang-terangan, bukan
-- didiamkan: net.http_post bersifat asinkron, sehingga cron.job_run_details
-- akan mencatat 'succeeded' segera setelah permintaan masuk antrean — TERLEPAS
-- dari apakah Edge Function-nya benar-benar berjalan. Itu bukan kekhawatiran
-- teoretis: job notifikasi melaporkan 'succeeded' selama berhari-hari pada 23
-- Agustus 2026 sementara setiap panggilannya sebenarnya dijawab 401.
--
-- Tiga hal menutup celah itu sejauh yang bisa ditutup dari sini:
--
--   1. Penjaga vault di bawah menolak kunci yang tidak berbentuk JWT, yang
--      merupakan penyebab kedua kegagalan senyap yang sudah pernah terjadi.
--   2. net._http_response menyimpan status HTTP setiap pemanggilan. ITULAH
--      tempat yang harus diperiksa, bukan cron.job_run_details:
--
--        SELECT id, status_code, created, left(content, 200)
--        FROM net._http_response ORDER BY created DESC LIMIT 5;
--
--   3. Edge Function itu sendiri tetap menulis log ke dashboard Functions
--      begitu ia berjalan. Yang tidak terlihat di sana hanyalah kasus ketika ia
--      tidak pernah tercapai sama sekali — dan itu yang ditangkap poin 2.
--
-- KENAPA MENJADWALKAN INI AMAN SEKARANG. Edge Function berjalan dalam mode
-- laporan sampai HARD_DELETE_ARMED bernilai persis 'true'; env itu belum diset.
-- Menjadwalkannya hari ini berarti mengumpulkan daftar kandidat setiap hari
-- tanpa menghapus apa pun — persis yang dibutuhkan sebelum 26 September 2026,
-- ketika 25 guru TRIAL mencapai H+8 serentak.
--
-- JAM 02.00 UTC (09.00 WIB), berbeda dari notifikasi yang 00.00 UTC. Dua alasan:
-- keduanya tidak berebut antrean pg_net, dan baris di net._http_response mudah
-- dibedakan asalnya hanya dari jamnya.
--
-- Idempotent: cron.schedule memakai jobname sebagai kunci, jadi pemanggilan
-- ulang memperbarui jadwal dan perintahnya, bukan membuat job kedua.

BEGIN;

SELECT cron.schedule(
  'hard-delete-expired-guru-harian',
  '0 2 * * *',
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
        'Vault secret service_role_key belum tersimpan — hard delete tidak berjalan. '
        'Jalankan: SELECT vault.create_secret(''<KUNCI_ASLI>'', ''service_role_key'');';
    END IF;

    -- Bentuk kunci ikut diperiksa, bukan hanya keberadaannya. Tanpa ini
    -- placeholder atau kunci anon lolos dan job gagal secara senyap — keduanya
    -- sudah pernah terjadi pada job notifikasi.
    IF v_key NOT LIKE 'eyJ%' THEN
      RAISE EXCEPTION
        'Vault secret service_role_key bukan JWT yang sah (harus diawali ''eyJ''). '
        'Kemungkinan besar yang tersimpan masih teks placeholder, bukan kunci asli. '
        'Perbaiki dengan: SELECT vault.update_secret('
        '(SELECT id FROM vault.secrets WHERE name = ''service_role_key''), ''<KUNCI_ASLI>'');';
    END IF;

    PERFORM net.http_post(
      url     := 'https://teccdzetrdjowqemnuuc.supabase.co/functions/v1/hard-delete-expired-guru',
      headers := jsonb_build_object(
                   'Content-Type',  'application/json',
                   'Authorization', 'Bearer ' || v_key
                 ),
      body    := '{}'::jsonb,
      timeout_milliseconds := 60000
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
  SELECT COUNT(*) INTO v_n
  FROM cron.job WHERE jobname = 'hard-delete-expired-guru-harian';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'Job hard-delete-expired-guru-harian harus tepat satu, ditemukan % — ROLLBACK', v_n;
  END IF;

  SELECT schedule, active, command
  INTO v_schedule, v_active, v_command
  FROM cron.job WHERE jobname = 'hard-delete-expired-guru-harian';

  IF v_schedule <> '0 2 * * *' THEN
    RAISE EXCEPTION 'Jadwal harus ''0 2 * * *'', ditemukan % — ROLLBACK', v_schedule;
  END IF;

  IF NOT v_active THEN
    RAISE EXCEPTION 'Job terdaftar tetapi tidak aktif — ROLLBACK';
  END IF;

  -- Tidak ada kredensial yang ikut tersimpan di perintahnya. Diperiksa, bukan
  -- dipercaya: JWT service role selalu diawali 'eyJ', dan satu-satunya
  -- kemunculan sah pola itu di perintah ini adalah di dalam penjaga bentuk.
  IF v_command LIKE '%''eyJ' || '%''%' AND v_command NOT LIKE '%NOT LIKE ''eyJ%' THEN
    RAISE EXCEPTION 'Perintah cron tampaknya memuat kunci mentah — ROLLBACK';
  END IF;

  IF v_command NOT LIKE '%vault.decrypted_secrets%' THEN
    RAISE EXCEPTION 'Perintah cron tidak membaca kunci dari vault — ROLLBACK';
  END IF;

  IF v_command NOT LIKE '%NOT LIKE ''eyJ%' THEN
    RAISE EXCEPTION 'Penjaga bentuk kunci (NOT LIKE ''eyJ%%'') tidak ada di command job — ROLLBACK';
  END IF;

  IF v_command NOT LIKE '%v_key IS NULL%' THEN
    RAISE EXCEPTION 'Penjaga NULL/kosong hilang dari command job — ROLLBACK';
  END IF;

  IF v_command NOT LIKE '%hard-delete-expired-guru%' THEN
    RAISE EXCEPTION 'Perintah cron tidak menunjuk Edge Function hard-delete-expired-guru — ROLLBACK';
  END IF;

  -- Kedua job harian tidak boleh berbagi jam. Selain soal antrean, jam yang
  -- sama membuat baris di net._http_response tidak bisa dibedakan asalnya.
  IF EXISTS (
    SELECT 1 FROM cron.job
    WHERE jobname <> 'hard-delete-expired-guru-harian'
      AND schedule = '0 2 * * *'
  ) THEN
    RAISE EXCEPTION 'Sudah ada job lain pada jadwal ''0 2 * * *'' — pilih jam berbeda, ROLLBACK';
  END IF;

  -- Zona waktu penjadwal masih seperti yang diasumsikan saat jam dipilih.
  IF current_setting('cron.timezone', true) IS DISTINCT FROM 'GMT' THEN
    RAISE EXCEPTION
      'cron.timezone bukan GMT (%) — jam jalan tidak lagi 09.00 WIB, tinjau ulang — ROLLBACK',
      current_setting('cron.timezone', true);
  END IF;
END $$;

COMMIT;

-- Cakupan yang sengaja dibatasi:
--
-- HARD_DELETE_ARMED tidak disentuh di sini. Migrasi tidak dapat menulis secrets
-- Edge Function, dan mempersenjatai penghapusan permanen memang bukan sesuatu
-- yang layak terjadi sebagai efek samping sebuah migrasi. Romo mengaktifkannya
-- terpisah, setelah membaca daftar dry-run:
--
--   supabase secrets set HARD_DELETE_ARMED=true --project-ref teccdzetrdjowqemnuuc
--
-- Hasil pemanggilan tidak diperiksa dari sini. net.http_post asinkron;
-- jawabannya mendarat di net._http_response dan itulah tempat memeriksanya.
