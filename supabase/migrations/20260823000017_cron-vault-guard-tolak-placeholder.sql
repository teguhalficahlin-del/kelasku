-- Migration: perketat penjaga vault pada cron notifikasi trial
--
-- Masalah:
-- Penjaga di 20260823000004 hanya menolak NULL dan string kosong:
--
--   IF v_key IS NULL OR v_key = '' THEN RAISE EXCEPTION ...
--
-- Pesan galatnya sendiri menyuruh menjalankan
--   SELECT vault.create_secret('<SERVICE_ROLE_KEY>', 'service_role_key');
-- dan placeholder '<SERVICE_ROLE_KEY>' itu LOLOS penjaga — bukan NULL, bukan
-- kosong. Akibatnya job berjalan seolah sehat, mengirim
-- 'Authorization: Bearer <SERVICE_ROLE_KEY>', dan Edge Function menolaknya 401.
-- Kegagalan itu tenggelam di net.http_post yang asinkron: cron mencatat job
-- SUKSES, dan tidak ada notifikasi trial yang benar-benar terkirim.
--
-- Perbaikan:
-- Tambah syarat bentuk kunci. service_role_key adalah JWT, selalu diawali
-- 'eyJ' (base64url dari '{"'). Placeholder, teks tempelan yang terpotong, dan
-- salah-tempel nilai lain akan tertolak di depan dengan pesan yang jelas.
--
-- Idempotent: cron.schedule memakai jobname sebagai kunci, jadi pemanggilan
-- ini MEMPERBARUI perintah job yang sudah ada, bukan membuat job kedua.
-- Jadwal '0 0 * * *' dipertahankan sama persis.

BEGIN;

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
        'Jalankan: SELECT vault.create_secret(''<KUNCI_ASLI>'', ''service_role_key'');';
    END IF;

    -- Bentuk kunci ikut diperiksa, bukan hanya keberadaannya. Tanpa ini
    -- placeholder '<SERVICE_ROLE_KEY>' lolos dan job gagal secara senyap.
    IF v_key NOT LIKE 'eyJ%' THEN
      RAISE EXCEPTION
        'Vault secret service_role_key bukan JWT yang sah (harus diawali ''eyJ''). '
        'Kemungkinan besar yang tersimpan masih teks placeholder, bukan kunci asli. '
        'Perbaiki dengan: SELECT vault.update_secret('
        '(SELECT id FROM vault.secrets WHERE name = ''service_role_key''), ''<KUNCI_ASLI>'');';
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

  -- Jadwal tidak boleh bergeser gara-gara migrasi ini.
  IF v_schedule <> '0 0 * * *' THEN
    RAISE EXCEPTION 'Jadwal harus ''0 0 * * *'', ditemukan % — ROLLBACK', v_schedule;
  END IF;

  IF NOT v_active THEN
    RAISE EXCEPTION 'Job kirim-notifikasi-trial-harian tidak aktif — ROLLBACK';
  END IF;

  -- Penjaga bentuk kunci benar-benar ada di perintah yang tersimpan.
  IF v_command NOT LIKE '%NOT LIKE ''eyJ%' THEN
    RAISE EXCEPTION 'Penjaga bentuk kunci (NOT LIKE ''eyJ%%'') tidak ada di command job — ROLLBACK';
  END IF;

  -- Penjaga lama tetap dipertahankan, bukan digantikan.
  IF v_command NOT LIKE '%v_key IS NULL%' THEN
    RAISE EXCEPTION 'Penjaga NULL/kosong hilang dari command job — ROLLBACK';
  END IF;
END;
$$;

COMMIT;
