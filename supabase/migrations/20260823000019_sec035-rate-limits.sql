-- Migration: SEC-035 — rate limiting untuk Edge Function kritis
--
-- Masalah:
-- generate-akun, hapus-akun, dan semester-reset tidak punya pembatasan laju
-- sama sekali. Guru yang sah (atau skrip yang memakai token guru yang sah)
-- bisa memanggilnya seribu kali beruntun. Pada hapus-akun itu berarti seribu
-- deleteUser; pada generate-akun, seribu akun auth baru.
--
-- KENAPA DI DATABASE, BUKAN DI MEMORI EDGE FUNCTION.
-- Edge Function Supabase berjalan sebagai isolate yang bisa dimatikan dan
-- dilahirkan ulang kapan saja, dan beberapa isolate bisa hidup bersamaan.
-- Penghitung di memori proses akan ter-reset diam-diam pada tiap cold start
-- dan tidak terlihat oleh isolate tetangga -- artinya batasnya bocor persis
-- saat beban tinggi, satu-satunya saat ia dibutuhkan. Tabel ini satu-satunya
-- state yang dilihat semua isolate.
--
-- KENAPA HANYA service_role YANG BOLEH MEMANGGIL.
-- Jika 'authenticated' diberi EXECUTE, siapa pun yang login bisa memanggil
-- fn_check_rate_limit dengan p_identifier milik guru lain berulang kali dan
-- menghabiskan jatah guru itu -- pembatas laju berubah menjadi senjata
-- penolakan layanan terhadap sesama pengguna. Ketiga Edge Function sudah
-- memegang klien service_role, jadi tidak ada yang hilang dengan menutupnya.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Tabel penghitung
-- ---------------------------------------------------------------------------
--
-- Kunci primer gabungan, bukan kolom id sintetis. Baris di tabel ini TIDAK
-- pernah dirujuk FK dan selalu dicari lewat ketiga kolom itu sekaligus, jadi
-- id uuid hanya menambah satu index yang tidak pernah dipakai pada tabel yang
-- ditulis di setiap request.

CREATE TABLE IF NOT EXISTS public.rate_limits (
  identifier    text        NOT NULL,
  endpoint      text        NOT NULL,
  window_start  timestamptz NOT NULL,
  request_count int         NOT NULL DEFAULT 0,
  PRIMARY KEY (identifier, endpoint, window_start)
);

-- Untuk pembersihan berkala; kunci primer tidak membantu penyapuan by-waktu.
CREATE INDEX IF NOT EXISTS idx_rate_limits_window
  ON public.rate_limits (window_start);

-- Tidak ada seorang pun selain service_role yang berkepentingan dengan tabel
-- ini. RLS dinyalakan tanpa policy apa pun: authenticated dan anon melihat nol
-- baris dan tidak bisa menulis. service_role melewati RLS.
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.rate_limits FROM PUBLIC;
REVOKE ALL ON TABLE public.rate_limits FROM anon;
REVOKE ALL ON TABLE public.rate_limits FROM authenticated;

-- ---------------------------------------------------------------------------
-- 2. fn_check_rate_limit — true berarti diizinkan
-- ---------------------------------------------------------------------------
--
-- ATOMIC. INSERT .. ON CONFLICT DO UPDATE .. RETURNING menaikkan penghitung
-- dan mengembalikan nilai SESUDAH kenaikan dalam satu pernyataan, di bawah
-- kunci baris yang dipegang PostgreSQL. Dua request bersamaan tidak bisa
-- sama-sama membaca nilai lama lalu menulis nilai yang sama -- pola
-- baca-lalu-tulis yang justru bocor tepat saat ada lonjakan.
--
-- Jendelanya tetap (fixed window), bukan bergulir. Konsekuensinya diketahui:
-- pada pergantian jendela, dua kali batas bisa lewat dalam waktu berdekatan.
-- Untuk tujuan di sini -- menahan penyalahgunaan beruntun, bukan menegakkan
-- kuota tagihan -- itu dapat diterima, dan biayanya satu baris per jendela
-- alih-alih satu baris per request seperti pada jendela bergulir.

CREATE OR REPLACE FUNCTION public.fn_check_rate_limit(
  p_identifier     text,
  p_endpoint       text,
  p_max_requests   int,
  p_window_minutes int
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_detik  int;
  v_window timestamptz;
  v_count  int;
BEGIN
  IF p_identifier IS NULL OR btrim(p_identifier) = '' THEN
    RAISE EXCEPTION 'p_identifier wajib diisi';
  END IF;
  IF p_endpoint IS NULL OR btrim(p_endpoint) = '' THEN
    RAISE EXCEPTION 'p_endpoint wajib diisi';
  END IF;
  -- Nilai tak masuk akal ditolak, bukan didiamkan: p_max_requests = 0 akan
  -- memblokir segalanya, dan angka negatif membuat pembagian jendela kacau.
  IF p_max_requests IS NULL OR p_max_requests < 1 THEN
    RAISE EXCEPTION 'p_max_requests harus >= 1, diterima %', coalesce(p_max_requests::text, 'NULL');
  END IF;
  IF p_window_minutes IS NULL OR p_window_minutes < 1 THEN
    RAISE EXCEPTION 'p_window_minutes harus >= 1, diterima %', coalesce(p_window_minutes::text, 'NULL');
  END IF;

  v_detik  := p_window_minutes * 60;
  v_window := to_timestamp(floor(extract(epoch FROM now()) / v_detik) * v_detik);

  INSERT INTO public.rate_limits AS rl (identifier, endpoint, window_start, request_count)
  VALUES (p_identifier, p_endpoint, v_window, 1)
  ON CONFLICT (identifier, endpoint, window_start)
  DO UPDATE SET request_count = rl.request_count + 1
  RETURNING rl.request_count INTO v_count;

  RETURN v_count <= p_max_requests;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.fn_check_rate_limit(text, text, int, int) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_check_rate_limit(text, text, int, int) FROM anon;
REVOKE EXECUTE ON FUNCTION public.fn_check_rate_limit(text, text, int, int) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_check_rate_limit(text, text, int, int) TO service_role;

-- ---------------------------------------------------------------------------
-- 3. Pembersihan jendela lama
-- ---------------------------------------------------------------------------
--
-- Tanpa ini tabel tumbuh selamanya. Pembersihan sengaja TIDAK dititipkan di
-- dalam fn_check_rate_limit: menaruh DELETE di jalur setiap request berarti
-- setiap guru membayar biaya penyapuan orang lain, dan DELETE besar yang
-- kebetulan jatuh pada satu request membuatnya melambat tanpa sebab yang
-- terlihat.

CREATE OR REPLACE FUNCTION public.fn_cleanup_rate_limits()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_n int;
BEGIN
  DELETE FROM public.rate_limits
  WHERE window_start < now() - INTERVAL '2 days';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.fn_cleanup_rate_limits() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_cleanup_rate_limits() FROM anon;
REVOKE EXECUTE ON FUNCTION public.fn_cleanup_rate_limits() FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_cleanup_rate_limits() TO service_role;

-- Idempotent: cron.schedule memakai jobname sebagai kunci.
SELECT cron.schedule(
  'cleanup-rate-limits-harian',
  '30 0 * * *',
  $job$ SELECT public.fn_cleanup_rate_limits(); $job$
);

-- ---------------------------------------------------------------------------
-- VERIFIKASI
-- ---------------------------------------------------------------------------

DO $verif$
DECLARE
  v_ok boolean;
  v_n  int;
BEGIN
  -- Hak eksekusi tertutup untuk pengguna biasa.
  IF has_function_privilege('authenticated',
       'public.fn_check_rate_limit(text, text, int, int)', 'EXECUTE') THEN
    RAISE EXCEPTION 'fn_check_rate_limit masih bisa dipanggil authenticated — ROLLBACK';
  END IF;
  IF NOT has_function_privilege('service_role',
       'public.fn_check_rate_limit(text, text, int, int)', 'EXECUTE') THEN
    RAISE EXCEPTION 'service_role tidak bisa memanggil fn_check_rate_limit — ROLLBACK';
  END IF;

  -- Perilaku: batas 2 berarti panggilan ke-3 ditolak.
  v_ok := public.fn_check_rate_limit('__verif__', '__verif__', 2, 60);
  IF NOT v_ok THEN RAISE EXCEPTION 'Panggilan ke-1 seharusnya lolos — ROLLBACK'; END IF;

  v_ok := public.fn_check_rate_limit('__verif__', '__verif__', 2, 60);
  IF NOT v_ok THEN RAISE EXCEPTION 'Panggilan ke-2 seharusnya lolos — ROLLBACK'; END IF;

  v_ok := public.fn_check_rate_limit('__verif__', '__verif__', 2, 60);
  IF v_ok THEN RAISE EXCEPTION 'Panggilan ke-3 seharusnya DITOLAK — ROLLBACK'; END IF;

  -- Identifier lain tidak ikut terbawa jatah tetangganya.
  v_ok := public.fn_check_rate_limit('__verif2__', '__verif__', 2, 60);
  IF NOT v_ok THEN RAISE EXCEPTION 'Identifier berbeda seharusnya punya jatah sendiri — ROLLBACK'; END IF;

  DELETE FROM public.rate_limits WHERE identifier IN ('__verif__', '__verif2__');

  -- Job pembersihan terdaftar tepat satu.
  SELECT count(*) INTO v_n FROM cron.job WHERE jobname = 'cleanup-rate-limits-harian';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'Job cleanup-rate-limits-harian harus tepat satu, ditemukan % — ROLLBACK', v_n;
  END IF;
END;
$verif$;

COMMIT;
