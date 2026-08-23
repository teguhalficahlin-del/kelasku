-- 20260823000021_sec044-fn-cron-health-check.sql
-- SEC-044 — RPC pembaca kesehatan pg_cron untuk endpoint monitoring.
--
-- KENAPA PERLU RPC, BUKAN QUERY LANGSUNG DARI EDGE FUNCTION.
-- Skema cron dan net tidak diekspos PostgREST, jadi Edge Function tidak bisa
-- menyentuhnya lewat klien Supabase biasa. Satu fungsi SECURITY DEFINER yang
-- sempit adalah jalan yang tersedia — dan sekaligus yang paling aman: bentuk
-- keluarannya tetap, jadi tidak ada cara memakainya untuk membaca hal lain.
--
-- KENAPA net._http_response, BUKAN cron.job_run_details SAJA.
-- Sudah dijelaskan panjang di 20260823000020: net.http_post asinkron, sehingga
-- job_run_details mencatat 'succeeded' begitu permintaan masuk antrean —
-- TERLEPAS dari apakah Edge Function-nya benar-benar dijawab. Persis itu yang
-- terjadi 23 Agustus 2026: job notifikasi 'succeeded' berhari-hari sementara
-- setiap panggilannya dijawab 401. Status HTTP yang sebenarnya hanya ada di
-- net._http_response, jadi di situlah fungsi ini melihat.
--
-- CARA MENCOCOKKAN RESPONS DENGAN JOB. net._http_response tidak menyimpan URL,
-- hanya id/status/isi/waktu. Yang bisa dipakai adalah waktu: diambil respons
-- PERTAMA yang muncul dalam 5 menit setelah job itu mulai. Kedua job sengaja
-- dijadwalkan berjauhan (00.00 dan 02.00 UTC) supaya jendela ini tidak pernah
-- bertumpang tindih. Kalau nanti ada job ketiga di jam yang sama, pencocokan
-- ini harus dipikirkan ulang — bukan ditambah begitu saja.
--
-- ISI RESPONS SENGAJA TIDAK DIKEMBALIKAN SAAT SUKSES. Badan jawaban
-- hard-delete-expired-guru memuat nama dan id guru kandidat hapus. Endpoint
-- monitoring boleh tahu "200 dan berjalan", tidak boleh jadi jalur bocor data
-- guru. Isi hanya dikembalikan saat status_code BUKAN 2xx — di situ badannya
-- amplop galat, dan justru itu yang perlu dibaca saat menelusuri masalah —
-- dipotong 300 karakter.
--
-- Idempotent: CREATE OR REPLACE + REVOKE/GRANT yang selalu ditulis ulang.

BEGIN;

CREATE OR REPLACE FUNCTION public.fn_cron_health_check()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_jobs   jsonb;
  v_verdict text;
BEGIN
  WITH dipantau(nama) AS (
    VALUES ('kirim-notifikasi-trial-harian'),
           ('hard-delete-expired-guru-harian')
  ),
  job AS (
    SELECT d.nama,
           j.jobid,
           j.schedule,
           j.active
    FROM dipantau d
    LEFT JOIN cron.job j ON j.jobname = d.nama
  ),
  jalan AS (
    SELECT job.*,
           r.start_time,
           r.status AS cron_status,
           r.return_message
    FROM job
    LEFT JOIN LATERAL (
      SELECT rd.start_time, rd.status, rd.return_message
      FROM cron.job_run_details rd
      WHERE rd.jobid = job.jobid
      ORDER BY rd.start_time DESC
      LIMIT 1
    ) r ON TRUE
  ),
  respons AS (
    SELECT jalan.*,
           h.status_code,
           h.error_msg,
           h.content
    FROM jalan
    LEFT JOIN LATERAL (
      SELECT hr.status_code, hr.error_msg, hr.content
      FROM net._http_response hr
      WHERE jalan.start_time IS NOT NULL
        AND hr.created >= jalan.start_time
        AND hr.created <  jalan.start_time + interval '5 minutes'
      ORDER BY hr.created ASC
      LIMIT 1
    ) h ON TRUE
  )
  SELECT jsonb_agg(
           jsonb_build_object(
             'name',         nama,
             'exists',       jobid IS NOT NULL,
             'active',       COALESCE(active, false),
             'schedule',     schedule,
             'last_run',     start_time,
             'last_cron_status', cron_status,
             'last_status',  status_code,
             'last_error',   CASE
                               WHEN error_msg IS NOT NULL THEN left(error_msg, 300)
                               WHEN status_code IS NOT NULL AND status_code NOT BETWEEN 200 AND 299
                                 THEN left(COALESCE(content, ''), 300)
                               ELSE NULL
                             END
           )
           ORDER BY nama
         )
  INTO v_jobs
  FROM respons;

  -- Job hilang atau nonaktif = ERROR: tidak ada yang berjalan sama sekali.
  -- Status HTTP bukan 2xx, atau tidak ada respons yang tercatat padahal job
  -- sudah pernah jalan = WARNING: penjadwalnya hidup, sasarannya yang bermasalah.
  SELECT CASE
           WHEN bool_or(NOT (e->>'exists')::boolean
                        OR NOT (e->>'active')::boolean) THEN 'ERROR'
           WHEN bool_or(e->>'last_run' IS NULL
                        OR e->>'last_status' IS NULL
                        OR (e->>'last_status')::int NOT BETWEEN 200 AND 299) THEN 'WARNING'
           ELSE 'OK'
         END
  INTO v_verdict
  FROM jsonb_array_elements(v_jobs) e;

  RETURN jsonb_build_object(
    'checked_at', now(),
    'jobs',       v_jobs,
    'verdict',    v_verdict
  );
END;
$$;

-- REVOKE dua lapis (CLAUDE.md §7). Fungsi ini membaca skema cron dan net;
-- tidak ada guru, siswa, atau ortu yang punya urusan memanggilnya. Hanya
-- service_role — yaitu Edge Function cron-health-check — yang diberi izin.
REVOKE EXECUTE ON FUNCTION public.fn_cron_health_check() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_cron_health_check() FROM anon;
REVOKE EXECUTE ON FUNCTION public.fn_cron_health_check() FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_cron_health_check() TO service_role;

COMMIT;
