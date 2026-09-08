-- 20260909000001_catatan-pemakaian-ai.sql
-- Catatan pemakaian AI per panggilan.
--
-- MASALAHNYA. Sampai 9 September 2026 tidak ada satu pun angka biaya yang bisa
-- dipercaya. Yang tersedia hanya tagihan Google (Rp 93.100 untuk 1-8 September,
-- pemakaian SATU orang menguji) dan tebakan di atasnya. Menetapkan harga
-- langganan GURU_PRO untuk ribuan guru di atas tebakan itu berisiko dua arah:
-- terlalu murah berarti tiap guru baru menambah kerugian, terlalu mahal berarti
-- guru tidak jadi memakainya.
--
-- Padahal Gemini SUDAH mengirim jumlah token di setiap balasan (usageMetadata).
-- generate-atp dan generate-modul menerimanya, lalu membuangnya — kecuali kalau
-- kebetulan muncul di pesan galat. Bentuk kelalaian yang sama dengan
-- finishReason yang dulu diabaikan: datanya ada, kita yang tidak menyimpannya.
--
-- Empat pertanyaan yang tabel ini jawab, dan hari ini hanya bisa ditebak:
--   1. Berapa token sebenarnya satu Modul Ajar? Satu ATP?
--   2. Berapa porsi Naskah Fasilitasi — perkiraan sekarang sepertiga, benarkah?
--   3. Berapa yang terbakar untuk generate yang GAGAL?
--   4. Berapa biaya satu guru per bulan?
--
-- Tabel ini memberi TOKEN, bukan rupiah. Rupiah didapat dengan satu kali
-- kalibrasi: bandingkan total token satu periode dengan tagihan periode itu.

BEGIN;

CREATE TABLE IF NOT EXISTS public.ai_usage (
  id            bigserial PRIMARY KEY,
  created_at    timestamptz NOT NULL DEFAULT now(),

  fungsi        text NOT NULL,          -- 'generate-atp' | 'generate-modul'
  fase          text,                   -- 'A','B','C','B2','D' | 'utama','perbaikan'
  model         text NOT NULL,

  -- SET NULL, BUKAN CASCADE. Riwayat biaya harus tetap ada setelah kelas atau
  -- guru dihapus — justru periode itu yang paling perlu dijelaskan saat
  -- tagihannya diperiksa.
  guru_id       uuid REFERENCES public.profiles(id)   ON DELETE SET NULL,
  classroom_id  uuid REFERENCES public.classrooms(id) ON DELETE SET NULL,

  token_masuk     integer,              -- promptTokenCount
  token_keluar    integer,              -- candidatesTokenCount
  token_penalaran integer,              -- thoughtsTokenCount; ikut ditagih,
                                        -- dan inilah yang berkali-kali membuat
                                        -- plafon roboh meski keluarannya pendek
  token_total     integer,              -- totalTokenCount apa adanya dari Gemini

  durasi_ms     integer,
  berhasil      boolean NOT NULL DEFAULT true,
  sebab_gagal   text                    -- kode: AI_QUOTA_EXHAUSTED, MAX_TOKENS, dll
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_waktu    ON public.ai_usage (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_fungsi   ON public.ai_usage (fungsi, fase, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_guru     ON public.ai_usage (guru_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- RLS: aktif, NOL policy
-- ---------------------------------------------------------------------------
-- Ini data operasional, bukan data guru. Tidak ada satu pun peran pengguna yang
-- boleh membacanya — penulisnya service_role di Edge Function, yang bypass RLS.
-- Pola yang sama dengan rancang_akses_uji_coba (migration 20260907000001):
-- RLS aktif tanpa policy = tertutup rapat, bukan sekadar terlihat terlindungi.
ALTER TABLE public.ai_usage ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.ai_usage FROM anon;
REVOKE ALL ON public.ai_usage FROM authenticated;

COMMENT ON TABLE public.ai_usage IS
  'Pemakaian token per panggilan AI. Dasar hitungan biaya per modul, per ATP, '
  'dan per guru. Ditulis service_role dari Edge Function; tidak dibaca klien.';

COMMIT;
